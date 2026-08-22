// The grounding module.
//
// Four rules and three pipeline stages. The verdict severities come from config,
// so a project that wants three verdicts gets three and the report legend, the
// highlight colors and the gate all read the same map.

import path from 'node:path';
import { defineRule, resolveSeverity } from '../../core/rules.mjs';
import { normalizeFinding } from '../../core/findings.mjs';
import { similarity } from '../../core/text.mjs';
import { Cache } from '../../core/cache.mjs';
import { readLockfile, comparePins } from '../../core/lockfile.mjs';
import { AdapterRegistry, parseRef } from '../../adapters/index.mjs';
import { loadSpanMaps } from './spanmap.mjs';
import { verifySpan, lineOfPlacement, suggestMatch } from './verify.mjs';

export const rules = [
  defineRule({
    id: 'ground.match-not-found',
    module: 'grounding',
    mechanical: true,
    defaultSeverity: 'error',
    explain: 'A span names text that does not occur in the document. Almost always the prose was edited after the span was written. The finding carries the closest sentence and a similarity score, and `check --fix-matches` applies the repair when one candidate is clearly right.',
    run() {},
  }),
  defineRule({
    id: 'ground.match-ambiguous',
    module: 'grounding',
    mechanical: true,
    defaultSeverity: 'error',
    explain: 'A span names text that occurs more than once, so the tool cannot tell which occurrence the claim refers to. Two identical sentences on one page is usually a real defect. Set onDuplicateMatch to "first" if you disagree.',
    run() {},
  }),
  defineRule({
    id: 'ground.quote-not-found',
    module: 'grounding',
    mechanical: true,
    defaultSeverity: 'warn',
    explain: 'The quote could not be located inside its source. The permalink degrades to file level and the card says the line is unconfirmed, so a reviewer is never sent to a wrong line. The usual cause is a quote condensed from several lines of the source.',
    run() {},
  }),
  defineRule({
    id: 'ground.source-unreachable',
    module: 'grounding',
    mechanical: true,
    defaultSeverity: 'error',
    explain: 'A span names a source the adapter cannot open. Either the path is wrong or the source is not declared in config.',
    run() {},
  }),
  defineRule({
    id: 'ground.no-span-map',
    module: 'grounding',
    mechanical: false,
    defaultSeverity: 'warn',
    explain: 'The document has grounding enabled and no span map, so no claim in it is anchored to anything. Advisory, because adding one is work rather than a mechanical fix.',
    run() {},
  }),
  defineRule({
    id: 'ground.stale',
    module: 'grounding',
    mechanical: true,
    defaultSeverity: 'warn',
    explain: 'The source moved under a claim that used to hold. The tool derives this and an author cannot write it, because a claim cannot know it has gone stale. Two mechanisms produce it: a pinned revision moved and the quote is no longer where it was, or a newer capture of a page no longer contains the quote.',
    run() {},
  }),
  defineRule({
    id: 'ground.pin-moved',
    module: 'grounding',
    mechanical: true,
    defaultSeverity: 'off',
    explain: 'A source pin differs from the lockfile. Off by default and turned on by `check --frozen`, which is the CI mode: a build that would have quietly verified against a newer source stops instead.',
    run() {},
  }),
  defineRule({
    id: 'ground.verdict',
    module: 'grounding',
    mechanical: true,
    defaultSeverity: 'error',
    explain: 'A claim carries a verdict whose severity is set to warn or error in config. UNSOURCED and CONTRADICTED block by default, INFERRED and DOC-DEFECT warn, and VERIFIED, EXTERNAL and FIGURE are clean.',
    run() {},
  }),
];

export const stages = [
  {
    id: 'sources.pin',
    needs: ['config'],
    reads: [],
    writes: [],
    // Not a findings producer. Its output is the adapter registry and the pin
    // set, which grounding.run consumes.
    collects: false,
    run: async (context, view) => {
      const config = view.get('config');
      const cache = new Cache(config.cacheDir);
      const registry = new AdapterRegistry(config.sources, {
        configDir: path.dirname(config.configPath),
        cache,
      });
      // `check` never touches the network. It restores pins from the lockfile and
      // verifies against what the cache already holds, so a run on a laptop with
      // no connection still checks every quote at the pinned revision.
      const lock = readLockfile(config.lockfile);
      const { pins, previous } = await registry.pinAll({
        refresh: Boolean(context.refresh),
        lock: lock.sources,
        only: context.refreshOnly || null,
      });
      const drift = comparePins(lock.sources, pins);
      return { registry, pins, previous, cache, lock, drift };
    },
  },

  {
    id: 'spanmap.load',
    needs: ['parse', 'config'],
    reads: [],
    writes: [],
    collects: false,
    run: async (context, view) => loadSpanMaps(view.get('parse'), view.get('config')),
  },

  {
    id: 'grounding.run',
    needs: ['parse', 'config', 'spanmap.load', 'sources.pin'],
    reads: [],
    writes: [],
    run: async (context, view) => {
      const docs = view.get('parse');
      const config = view.get('config');
      const maps = view.get('spanmap.load');
      const { registry, pins, previous, drift } = view.get('sources.pin');
      const findings = [];

      const grounded = docs.filter((doc) => doc.profile?.grounding?.enabled);

      // Reported once per run rather than once per span, because a moved pin is a
      // fact about the source set and not about any one claim.
      if (context.frozen && drift?.moved?.length && grounded.length) {
        for (const moved of drift.moved) {
          findings.push(normalizeFinding({
            rule: 'ground.pin-moved',
            module: 'grounding',
            severity: 'error',
            file: grounded[0].path,
            line: 1,
            message: `source '${moved.id}' would move from ${short(moved.from)} to ${short(moved.to)}`,
            why: 'A frozen run refuses to verify against a revision the lockfile does not name.',
            fix: {
              kind: 'decision',
              instruction: 'Run `groundtruth resolve --refresh`, review what the move changed, then commit the lockfile.',
            },
          }));
        }
      }

      for (const doc of docs) {
        if (!doc.profile?.grounding?.enabled) continue;
        const settings = doc.profile.grounding;
        const map = maps.get(doc.path);
        const severityOf = (id) => resolveSeverity(ruleById(id), {
          severityOverrides: config.severity,
          profileSeverity: doc.profile.severity,
        });

        doc.spans = [];
        doc.verdictTally = {};

        if (!map || map.missing) {
          if (severityOf('ground.no-span-map') !== 'off') {
            findings.push(normalizeFinding({
              rule: 'ground.no-span-map',
              module: 'grounding',
              severity: severityOf('ground.no-span-map'),
              file: doc.path,
              line: 1,
              message: `no span map at ${map?.path || 'the configured path'}, so nothing in this document is grounded`,
              why: 'Grounding is on for this profile but no claim is anchored.',
              fix: {
                kind: 'source',
                instruction: `Scaffold one: npx groundtruth-cli draft ${doc.path} --write`,
              },
            }));
          }
          doc.stats = { ...(doc.stats || {}), spans: 0 };
          continue;
        }

        doc.audited = map.audited;

        for (const span of map.spans) {
          const verification = verifySpan(span, doc, { onDuplicateMatch: settings.onDuplicateMatch });
          const record = {
            ...span,
            spanMapPath: map.path,
            placements: verification.placements,
            located: null,
            permalink: null,
            sourceLabel: null,
            verified: verification.ok,
          };

          if (!verification.ok) {
            if (verification.count === 0) {
              const suggestion = suggestMatch(span.match, doc, { similarity });
              findings.push(normalizeFinding({
                rule: 'ground.match-not-found',
                module: 'grounding',
                severity: severityOf('ground.match-not-found'),
                file: doc.path,
                line: 1,
                message: `span ${span.index} names text that is not in the body: "${clip(span.match)}"`,
                excerpt: suggestion.best
                  ? `did you mean (${suggestion.best.score.toFixed(2)}) "${clip(suggestion.best.text)}"`
                  : null,
                data: {
                  spanMap: map.path,
                  spanIndex: span.index,
                  suggestion: suggestion.confident ? suggestion.best.text : null,
                  candidates: suggestion.top.map((entry) => ({ text: entry.text, score: Number(entry.score.toFixed(3)) })),
                },
                fix: suggestion.confident
                  ? {
                    kind: 'edit',
                    instruction: `Run with --fix-matches, or set match to "${clip(suggestion.best.text, 120)}"`,
                    confidence: 'high',
                    patch: {
                      file: map.path,
                      line: null,
                      find: span.match,
                      replace: suggestion.best.text,
                    },
                  }
                  : {
                    kind: 'decision',
                    instruction: 'The prose moved and no single candidate is clearly right. Pick the sentence this claim now refers to, or delete the span.',
                  },
              }));
            } else {
              findings.push(normalizeFinding({
                rule: 'ground.match-ambiguous',
                module: 'grounding',
                severity: severityOf('ground.match-ambiguous'),
                file: doc.path,
                line: lineOfPlacement(doc, verification.placements[0]),
                message: `span ${span.index} ${verification.reason}: "${clip(span.match)}"`,
                data: { spanMap: map.path, spanIndex: span.index, count: verification.count },
                fix: {
                  kind: 'decision',
                  instruction: 'Lengthen the match so it is unique, or fix the duplicated sentence. Two identical sentences on one page is usually the real defect.',
                },
              }));
            }
            doc.spans.push(record);
            continue;
          }

          const line = lineOfPlacement(doc, verification.placements[0]);
          record.line = line;

          // Verdict severity, straight from the config map.
          const verdictSpec = config.verdicts[span.verdict] || {};
          doc.verdictTally[span.verdict] = (doc.verdictTally[span.verdict] || 0) + 1;

          if (verdictSpec.severity && verdictSpec.severity !== 'off') {
            findings.push(normalizeFinding({
              rule: 'ground.verdict',
              module: 'grounding',
              severity: verdictSpec.severity,
              file: doc.path,
              line,
              message: `${verdictSpec.label || span.verdict}: "${clip(span.match)}"`,
              excerpt: span.note || null,
              why: whyFor(span.verdict),
              data: { verdict: span.verdict, spanMap: map.path, spanIndex: span.index },
              fix: fixFor(span.verdict, span),
            }));
          }

          // Locate the quote in its source.
          if (span.source && span.quote) {
            const ref = parseRef(span.source);
            const adapter = registry.forRef(ref);

            if (!adapter) {
              if (ref?.external) {
                record.sourceLabel = ref.path;
                record.permalink = ref.path;
              } else {
                findings.push(normalizeFinding({
                  rule: 'ground.source-unreachable',
                  module: 'grounding',
                  severity: severityOf('ground.source-unreachable'),
                  file: doc.path,
                  line,
                  message: `no source declared for '${span.source}'. Declared sources: ${registry.ids.join(', ') || '(none)'}`,
                  data: { spanMap: map.path, spanIndex: span.index },
                  fix: {
                    kind: 'edit',
                    instruction: `Add a source with id '${ref?.sourceId || '?'}' to config, or fix the ref prefix.`,
                  },
                }));
              }
            } else {
              // Offline has to reach the adapter, or the guarantee is only ever
              // accidental: a warm cache passes and a cold one quietly fetches.
              const resolved = await adapter.resolve(ref, pins[adapter.id], {
                offline: Boolean(context.offline),
              });
              if (resolved?.error || !resolved?.text) {
                findings.push(normalizeFinding({
                  rule: 'ground.source-unreachable',
                  module: 'grounding',
                  severity: severityOf('ground.source-unreachable'),
                  file: doc.path,
                  line,
                  message: resolved?.error || `source '${span.source}' could not be read`,
                  data: { spanMap: map.path, spanIndex: span.index },
                  fix: { kind: 'source', instruction: 'Fix the path, or add the file to the source folder.' },
                }));
              } else {
                const located = adapter.locate(resolved, span.quote, ref);
                record.located = located;
                record.permalink = adapter.permalink(ref, located, pins[adapter.id]);
                record.sourceLabel = adapter.describe(ref, located);

                // STALE is derived here and never authored. Two mechanisms reach
                // this point: a pin moved under code, or a newer capture of a page
                // dropped the quote.
                const drifted = adapter.drift
                  ? adapter.drift(ref, span.quote, pins[adapter.id], previous?.[adapter.id])
                  : null;

                if (drifted?.stale) {
                  record.stale = drifted;
                  doc.verdictTally.STALE = (doc.verdictTally.STALE || 0) + 1;
                  findings.push(normalizeFinding({
                    rule: 'ground.stale',
                    module: 'grounding',
                    severity: config.derivedVerdicts.STALE.severity,
                    file: doc.path,
                    line,
                    message: `${drifted.reason}: was ${drifted.was}, now ${drifted.now}`,
                    why: `The source changed between ${drifted.from} and ${drifted.to}. The claim was true when it was written.`,
                    data: { spanMap: map.path, spanIndex: span.index, drift: drifted },
                    fix: {
                      kind: 'decision',
                      instruction: 'Read what the source says now. Either the claim needs updating or the pin does.',
                    },
                  }));
                }

                // A drifted source already explains why the quote is absent, and
                // in more useful terms. Reporting both says the same thing twice
                // and buries the date range that matters.
                if (!located.found && !drifted?.stale) {
                  findings.push(normalizeFinding({
                    rule: 'ground.quote-not-found',
                    module: 'grounding',
                    severity: severityOf('ground.quote-not-found'),
                    file: doc.path,
                    line,
                    message: `the quote is not in ${adapter.describe(ref, null)}: "${clip(span.quote)}"`,
                    why: 'The permalink degrades to file level and the card says the line is unconfirmed, so a reviewer is never sent to a wrong line.',
                    data: { spanMap: map.path, spanIndex: span.index, source: span.source },
                    fix: {
                      kind: 'source',
                      instruction: 'Copy the quote verbatim from the source, or point at the file that actually says it. A quote condensed from several lines is the usual cause.',
                    },
                  }));
                }
              }
            }
          }

          doc.spans.push(record);
        }

        doc.stats = {
          ...(doc.stats || {}),
          spans: doc.spans.length,
          grounded: doc.spans.filter((span) => span.located?.found).length,
        };
      }

      return findings;
    },
  },
];

function ruleById(id) {
  return rules.find((rule) => rule.id === id);
}

function whyFor(verdict) {
  switch (verdict) {
    case 'UNSOURCED':
      return 'Nothing in the declared sources supports this claim. Either find a source or cut the sentence.';
    case 'CONTRADICTED':
      return 'A source you named disagrees with this claim. One of the two is wrong and the tool cannot tell which.';
    case 'INFERRED':
      return 'This claim was computed rather than quoted, so the derivation is the thing a reader has to trust.';
    case 'DOC-DEFECT':
      return 'The claim is right and the source is wrong. Worth fixing upstream.';
    default:
      return null;
  }
}

function fixFor(verdict, span) {
  switch (verdict) {
    case 'UNSOURCED':
      return {
        kind: 'source',
        instruction: 'Find a source that says this, or cut the sentence. Do not mark it VERIFIED without a quote.',
      };
    case 'CONTRADICTED':
      // A person has to choose. This is the value that stops an agent
      // confidently rewriting a true sentence to match a bad source record.
      return {
        kind: 'decision',
        instruction: `A source disagrees with this claim. Read both and decide which is wrong.${span.note ? ` Note on file: ${span.note}` : ''}`,
      };
    case 'INFERRED':
      return {
        kind: 'rewrite',
        instruction: span.derivation
          ? 'Check the derivation still holds against the current source records.'
          : 'Add a `derivation` naming the records and the arithmetic behind this claim.',
      };
    default:
      return null;
  }
}

function short(value) {
  return String(value || '?').slice(0, 12);
}

function clip(text, max = 70) {
  const single = String(text).replace(/\s+/g, ' ').trim();
  return single.length > max ? `${single.slice(0, max - 1)}…` : single;
}

export default { id: 'grounding', rules, stages };
