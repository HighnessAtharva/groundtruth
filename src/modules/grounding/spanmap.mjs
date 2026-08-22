// Span map loading and validation.
//
// A span map is an `.mjs` module with named exports. That choice buys constants
// and reuse with no parser, which is the single biggest authoring ergonomic: one
// span module in the corpus this was extracted from defines nine constants and
// then builds thirty spans out of them.
//
// Spans are objects, never positional tuples. The source harness accepts a 4-to-6
// field tuple and validates arity at run time, which makes a 5-field tuple
// ambiguous by construction: the fifth field is read as `quote`, so every tuple
// meaning to add a note without a quote silently records the note as a quote. The
// resolver then hunts for an analysis sentence inside a source file and degrades
// the span to a file-level link. Objects make that unrepresentable.
//
// Span maps are executable code. That is what buys the constants, and it means a
// span map arriving in a pull request from outside is code review, not data
// review. Said out loud here rather than left implied.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ConfigError } from '../../core/rules.mjs';
import { expandTemplate } from '../../core/document.mjs';

const SPAN_KEYS = new Set([
  'match', 'source', 'quote', 'verdict', 'note', 'derivation', 'id', 'figure', 'url',
]);

const MODULE_KEYS = new Set(['document', 'audited', 'spans', 'default']);

export function spanMapPathFor(doc, profile) {
  const template = profile?.grounding?.spanMaps || 'groundtruth/spans/${docId}.mjs';
  return expandTemplate(template, doc);
}

/**
 * Load and validate every span map for a document set.
 *
 * All errors are collected before throwing, so a first run reports every problem
 * once rather than one per invocation.
 */
export async function loadSpanMaps(docs, config) {
  const problems = [];
  const byDocument = new Map();
  const claimedBy = new Map();

  for (const doc of docs) {
    if (!doc.profile?.grounding?.enabled) continue;
    const relative = spanMapPathFor(doc, doc.profile);
    const absolute = path.resolve(config.root, relative);

    if (!existsSync(absolute)) {
      byDocument.set(doc.path, { doc, path: relative, absolute, missing: true, spans: [], audited: null });
      continue;
    }

    let module;
    try {
      module = await import(`${pathToFileURL(absolute).href}?t=${Date.now()}`);
    } catch (error) {
      problems.push(`${relative} failed to load: ${error.message}`);
      continue;
    }

    const declared = module.document ?? module.default?.document;
    const spans = module.spans ?? module.default?.spans;
    const audited = module.audited ?? module.default?.audited ?? null;

    for (const key of Object.keys(module)) {
      if (!MODULE_KEYS.has(key)) {
        problems.push(`${relative} exports '${key}', which is not a span map key. Expected: document, audited, spans.`);
      }
    }

    if (typeof declared !== 'string' || !declared.trim()) {
      problems.push(`${relative} must export \`document\` as the path of the document it grounds.`);
    } else {
      const normalized = declared.replace(/\\/g, '/');
      if (normalized !== doc.path) {
        problems.push(
          `${relative} declares document '${normalized}' but its name routes it to '${doc.path}'. ` +
            'Rename the file or fix the export.',
        );
      }
      const previous = claimedBy.get(normalized);
      if (previous) {
        problems.push(`two span maps claim '${normalized}': ${previous} and ${relative}`);
      } else {
        claimedBy.set(normalized, relative);
      }
    }

    if (!Array.isArray(spans)) {
      problems.push(`${relative} must export \`spans\` as an array.`);
      continue;
    }

    const validated = [];
    for (const [index, span] of spans.entries()) {
      const where = `${relative} spans[${index}]`;
      if (Array.isArray(span)) {
        problems.push(
          `${where} is a tuple. Span maps take objects: ` +
            "{ match, source, quote, verdict, note }. A 5-field tuple is ambiguous, " +
            'which is why this format changed.',
        );
        continue;
      }
      if (!span || typeof span !== 'object') {
        problems.push(`${where} is not an object.`);
        continue;
      }

      for (const key of Object.keys(span)) {
        if (!SPAN_KEYS.has(key)) {
          problems.push(`${where} has unknown key '${key}'. A typo here would otherwise render as an unstyled span.`);
        }
      }

      const verdict = String(span.verdict || '').toUpperCase();
      if (!verdict) {
        problems.push(`${where} has no verdict. One of: ${Object.keys(config.verdicts).join(', ')}`);
      } else if (config.derivedVerdicts[verdict]) {
        problems.push(
          `${where} declares verdict '${verdict}', which the tool derives and an author cannot set. ` +
            'A claim cannot know it has gone stale.',
        );
      } else if (!config.verdicts[verdict]) {
        problems.push(`${where} has unknown verdict '${verdict}'. One of: ${Object.keys(config.verdicts).join(', ')}`);
      } else {
        const requires = config.verdicts[verdict].requires || [];
        for (const requirement of requires) {
          // A nested array is an "at least one of these" requirement.
          const fields = Array.isArray(requirement) ? requirement : [requirement];
          const satisfied = fields.some((field) => span[field] != null && span[field] !== '');
          if (!satisfied) {
            problems.push(
              fields.length === 1
                ? `${where} is ${verdict}, which requires '${fields[0]}'.`
                : `${where} is ${verdict}, which requires one of: ${fields.join(', ')}.`,
            );
          }
        }
      }

      if (typeof span.match !== 'string' || !span.match.trim()) {
        problems.push(`${where} needs a \`match\`: a verbatim substring of the document.`);
      }

      if (span.source && !span.quote && doc.profile.grounding.requireQuoteForSource !== false) {
        problems.push(
          `${where} names a source but no quote. A source with nothing to locate inside it is a link, not a citation.`,
        );
      }

      validated.push({
        ...span,
        verdict,
        index,
        id: span.id || `${doc.id}-${index}`,
      });
    }

    byDocument.set(doc.path, {
      doc,
      path: relative,
      absolute,
      missing: false,
      audited,
      spans: validated,
    });
  }

  if (problems.length) {
    throw new ConfigError(`span map errors\n  ${problems.join('\n  ')}`);
  }

  return byDocument;
}

/** Render a span map back to `.mjs` source, for `draft` and `--fix-matches`. */
export function renderSpanMap({ document: docPath, audited, spans, header = null }) {
  const lines = [];
  if (header) lines.push(header, '');
  lines.push(`export const document = ${JSON.stringify(docPath)};`);
  lines.push(`export const audited = ${JSON.stringify(audited || new Date().toISOString().slice(0, 10))};`);
  lines.push('');
  lines.push('export const spans = [');
  for (const span of spans) {
    lines.push('  {');
    lines.push(`    match: ${JSON.stringify(span.match)},`);
    lines.push(`    source: ${span.source == null ? 'null' : JSON.stringify(span.source)},`);
    lines.push(`    quote: ${span.quote == null ? 'null' : JSON.stringify(span.quote)},`);
    lines.push(`    verdict: ${JSON.stringify(span.verdict || 'UNSOURCED')},`);
    if (span.note) lines.push(`    note: ${JSON.stringify(span.note)},`);
    if (span.derivation) lines.push(`    derivation: ${JSON.stringify(span.derivation)},`);
    lines.push('  },');
  }
  lines.push('];');
  lines.push('');
  return lines.join('\n');
}
