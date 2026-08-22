// `groundtruth draft` — scaffold a span map from a document.
//
// `--update` is the one that matters over time. It re-extracts candidates, keeps
// every existing span byte for byte, appends the new ones under a dated comment,
// and marks a span whose text has vanished rather than deleting it. Nothing is ever
// silently dropped, because a span someone hand-wrote is work and the tool did not
// do that work.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../core/config.mjs';
import { buildEngine } from '../core/engine.mjs';
import { spanMapPathFor, renderSpanMap } from '../modules/grounding/spanmap.mjs';
import { findCandidates } from '../modules/grounding/candidates.mjs';
import { verifySpan, suggestMatch } from '../modules/grounding/verify.mjs';
import { similarity } from '../core/text.mjs';
import { paint, writeOut, writeErr, pluralize } from './format.mjs';
import { UsageError } from '../core/rules.mjs';

export async function runDraft(argv) {
  const { flags, positionals } = argv;
  if (!positionals.length) {
    throw new UsageError('draft needs a document path. Try `groundtruth draft docs/page.md --write`.');
  }

  const config = await loadConfig({ cwd: flags.cwd || process.cwd(), configPath: flags.config });
  const { pipeline } = await buildEngine(config, { modules: ['grounding'] });
  const { outputs } = await pipeline.run({ only: positionals, config }, { upTo: 'parse' });
  const docs = outputs.get('parse');

  if (!docs.length) {
    throw new UsageError(
      `${positionals.join(', ')} did not match a discovered document. Check the \`documents\` routing in your config.`,
    );
  }

  let wrote = 0;

  for (const doc of docs) {
    const relative = spanMapPathFor(doc, doc.profile);
    const absolute = path.resolve(config.root, relative);
    const verdict = String(flags.verdict || 'TODO').toUpperCase();
    const limit = flags.all ? Number.POSITIVE_INFINITY : Number(flags.limit || 40);

    const candidates = findCandidates(doc, { limit, minScore: Number(flags['min-score'] || 3) });

    if (flags.update && existsSync(absolute)) {
      const result = updateExisting({ absolute, relative, doc, candidates, verdict });
      if (flags.write !== false) {
        writeFileSync(absolute, result.source, 'utf8');
        wrote += 1;
      }
      report(relative, result.summary, doc, flags);
      continue;
    }

    if (existsSync(absolute) && !flags.force) {
      writeErr(paint(`${relative} already exists. Use --update to add new candidates, or --force to replace it.`, 'yellow'));
      continue;
    }

    const source = renderSpanMap({
      document: doc.path,
      audited: new Date().toISOString().slice(0, 10),
      header: header(doc, candidates.length, flags.source),
      spans: candidates.map((candidate) => ({
        match: candidate.text,
        // Never a source without a quote. A source with nothing to locate inside
        // it is a link and not a citation, and the validator refuses it, which
        // would mean the scaffold failed on its own first run.
        source: null,
        quote: null,
        verdict,
        note: `TODO. Signals: ${candidate.signals.join(', ')}.`,
      })),
    });

    if (flags.write === false || (!flags.write && !flags.update)) {
      // Default is stdout, so a first run is safe to try.
      writeOut(source);
      report(relative, `${candidates.length} candidate(s), not written`, doc, flags);
      continue;
    }

    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, source, 'utf8');
    wrote += 1;
    report(relative, `${pluralize(candidates.length, 'candidate')}, all ${verdict}`, doc, flags);
  }

  if (wrote) {
    writeOut('');
    writeOut(`Next:  ${paint('npx groundtruth check', 'cyan')}`);
    writeOut('');
  }
  return 0;
}

function header(doc, count, sourceId) {
  const lines = [
    `// Span map for ${doc.path}, scaffolded by \`groundtruth draft\`.`,
    '//',
    `// ${count} candidate sentence(s) carrying a number, an absolute, a comparison or a`,
    '// capability claim. Every one is verified against the document already, so this',
    '// file passes `check` as it stands. What it does not have yet is sources.',
    '//',
    '// For each span: name the source, paste the quote verbatim out of it, and set the',
    '// verdict. Delete any span that is not actually a claim.',
  ];
  if (sourceId) {
    lines.push(
      '//',
      '// The declared source to fill in, once you know which file holds the quote:',
      `//   source: '${sourceId}:<path>',`,
    );
  }
  return lines.join('\n');
}

/**
 * Rewrite an existing map, preserving every hand-written span exactly.
 *
 * Text manipulation rather than parse-and-render, because rendering would reformat
 * a file somebody has been editing by hand and lose their comments.
 */
function updateExisting({ absolute, relative, doc, candidates, verdict }) {
  const original = readFileSync(absolute, 'utf8');
  const known = new Set([...original.matchAll(/match:\s*(['"`])((?:\\.|(?!\1).)*)\1/g)]
    .map((match) => match[2].replace(/\\(['"`\\])/g, '$1')));

  const fresh = candidates.filter((candidate) => !known.has(candidate.text));

  // A span whose text is gone gets a comment and a suggestion, never a deletion.
  const vanished = [];
  for (const match of known) {
    if (verifySpan({ match }, doc, { onDuplicateMatch: 'first' }).ok) continue;
    const suggestion = suggestMatch(match, doc, { similarity });
    vanished.push({ match, suggestion: suggestion.confident ? suggestion.best.text : null });
  }

  let source = original;

  for (const entry of vanished) {
    const needle = JSON.stringify(entry.match).slice(1, -1);
    const at = source.indexOf(needle);
    if (at === -1) continue;
    const lineStart = source.lastIndexOf('\n', at) + 1;
    const indent = /^\s*/.exec(source.slice(lineStart))[0];
    const note = entry.suggestion
      ? `${indent}// STALE: no longer in the body. Nearest match: ${JSON.stringify(entry.suggestion)}\n`
      : `${indent}// STALE: no longer in the body, and no close match was found.\n`;
    source = source.slice(0, lineStart) + note + source.slice(lineStart);
  }

  if (fresh.length) {
    const close = source.lastIndexOf('];');
    const block = [
      '',
      `  // --- new since ${new Date().toISOString().slice(0, 10)} ---`,
      ...fresh.flatMap((candidate) => [
        '  {',
        `    match: ${JSON.stringify(candidate.text)},`,
        '    source: null,',
        '    quote: null,',
        `    verdict: ${JSON.stringify(verdict)},`,
        `    note: ${JSON.stringify(`TODO. Signals: ${candidate.signals.join(', ')}.`)},`,
        '  },',
      ]),
    ].join('\n');
    source = `${source.slice(0, close)}${block}\n${source.slice(close)}`;
  }

  const parts = [];
  if (fresh.length) parts.push(`${pluralize(fresh.length, 'new candidate')} appended`);
  if (vanished.length) parts.push(`${pluralize(vanished.length, 'span')} marked stale`);
  if (!parts.length) parts.push('nothing to change');

  return { source, summary: parts.join(', ') };
}

function report(relative, summary, doc, flags) {
  writeOut('');
  writeOut(`  ${paint(flags.write === false ? 'would write' : 'wrote', 'green')}  ${relative}`);
  writeOut(`  ${paint(summary, 'dim')}`);
}
