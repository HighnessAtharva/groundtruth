// `groundtruth check` — the blocking command.
//
// Takes paths. The harness this came from can only check the whole corpus, so a
// one-line edit costs a full-corpus run. That is a real usability defect and it
// does not get carried over.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../core/config.mjs';
import { buildEngine } from '../core/engine.mjs';
import { countFindings } from '../core/findings.mjs';
import { table, paint, formatFinding, writeOut, writeErr, pluralize } from './format.mjs';
import { version } from '../version.mjs';

export async function runCheck(argv) {
  const { flags, positionals } = argv;
  const config = await loadConfig({ cwd: flags.cwd || process.cwd(), configPath: flags.config });
  const modules = normalizeModules(flags);

  const { pipeline, modules: active } = await buildEngine(config, { modules });

  const stageLog = [];
  const started = Date.now();
  const { outputs } = await pipeline.run(
    { only: positionals, config },
    {
      upTo: 'findings.collect',
      onStage: (entry) => stageLog.push(entry),
    },
  );

  const result = outputs.get('findings.collect');
  const durationMs = Date.now() - started;

  if (flags.verbose && !flags.json) {
    writeErr(paint('pipeline', 'dim'));
    for (const entry of stageLog) {
      writeErr(`  ${entry.id.padEnd(20)} ${paint(`${entry.ms}ms`, 'dim')}`);
    }
    writeErr('');
  }

  // `--fix-matches` is the only mutation `check` can perform, and it only ever
  // applies a patch the tool judged exact. See suggestMatch in grounding/verify.
  if (flags['fix-matches']) {
    const applied = applyMatchFixes(result, config, flags);
    if (applied > 0) {
      writeErr(paint(`repaired ${applied} span match(es). re-running.`, 'cyan'));
      return runCheck({ ...argv, flags: { ...flags, 'fix-matches': false } });
    }
    writeErr(paint('no span match could be repaired with confidence.', 'yellow'));
  }

  const payload = buildPayload({ config, result, active, durationMs });

  if (flags.json) {
    writeOut(JSON.stringify(payload, null, flags.compact ? 0 : 2));
  } else if (flags.format === 'github') {
    reportGithub(result);
  } else {
    reportText({ result, config, active, flags });
  }

  return payload.summary.blocking > 0 ? 1 : 0;
}

/**
 * Apply every exact patch attached to a match-not-found finding.
 *
 * Only a patch the tool marked `confidence: high` carries a `patch` object at
 * all, so there is nothing fuzzy to apply here. A find string that no longer
 * appears, or appears twice, is skipped and reported rather than guessed at.
 */
function applyMatchFixes(result, config, flags) {
  const byFile = new Map();

  for (const entry of result.documents) {
    for (const finding of entry.findings) {
      const patch = finding.fix?.patch;
      if (!patch || finding.rule !== 'ground.match-not-found') continue;
      if (!byFile.has(patch.file)) byFile.set(patch.file, []);
      byFile.get(patch.file).push(patch);
    }
  }

  let applied = 0;

  for (const [file, patches] of byFile) {
    const absolute = path.resolve(config.root, file);
    if (!existsSync(absolute)) {
      writeErr(paint(`  skipped ${file}: not on disk`, 'yellow'));
      continue;
    }
    let source = readFileSync(absolute, 'utf8');
    let changed = 0;

    for (const patch of patches) {
      const needle = JSON.stringify(patch.find).slice(1, -1);
      const replacement = JSON.stringify(patch.replace).slice(1, -1);
      const occurrences = source.split(needle).length - 1;
      if (occurrences !== 1) {
        writeErr(paint(`  skipped a patch in ${file}: the match text appears ${occurrences} times in the span map`, 'yellow'));
        continue;
      }
      source = source.replace(needle, replacement);
      changed += 1;
      writeErr(`  ${paint('-', 'red')} ${patch.find}`);
      writeErr(`  ${paint('+', 'green')} ${patch.replace}`);
    }

    if (changed && !flags['dry-run']) {
      writeFileSync(absolute, source, 'utf8');
      applied += changed;
    }
  }

  return applied;
}

function normalizeModules(flags) {
  const raw = [flags.module, flags.only].flat().filter(Boolean);
  if (!raw.length) return null;
  return raw
    .flatMap((entry) => String(entry).split(','))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function buildPayload({ config, result, active, durationMs }) {
  const counts = result.counts;
  return {
    schemaVersion: 1,
    tool: { name: 'groundtruth', version },
    run: {
      startedAt: new Date(Date.now() - durationMs).toISOString(),
      durationMs,
      configPath: config.configPath,
      modules: Object.fromEntries(
        ['grounding', 'readability', 'seo', 'style'].map((name) => [name, active.includes(name)]),
      ),
    },
    summary: {
      documents: result.documents.length,
      blocking: counts.blocking,
      advisory: counts.advisory,
      bySeverity: { error: counts.error, warn: counts.warn, info: counts.info },
      verdicts: tallyVerdicts(result),
      exitCode: counts.blocking > 0 ? 1 : 0,
    },
    documents: result.documents.map((entry) => ({
      path: entry.path,
      id: entry.id,
      profile: entry.profile,
      counts: entry.counts,
      stats: entry.doc.stats || null,
      findings: entry.findings,
    })),
  };
}

function tallyVerdicts(result) {
  const tally = {};
  for (const entry of result.documents) {
    for (const [verdict, count] of Object.entries(entry.doc.verdictTally || {})) {
      tally[verdict] = (tally[verdict] || 0) + count;
    }
  }
  return tally;
}

function reportText({ result, config, active, flags }) {
  const noisy = result.documents.filter((entry) => entry.findings.length);

  for (const entry of noisy) {
    writeOut('');
    writeOut(`${paint(entry.path, 'bold')} ${paint(`(${entry.profile})`, 'dim')}`);
    for (const finding of entry.findings) {
      if (finding.severity === 'info' && !flags.verbose) continue;
      writeOut(formatFinding(finding));
    }
  }

  writeOut('');
  const rows = result.documents.map((entry) => [
    entry.path,
    entry.profile,
    entry.doc.stats?.spans ?? '--',
    entry.counts.error || '',
    entry.counts.warn || '',
    entry.doc.stats?.seoScore ?? '--',
  ]);

  if (rows.length) {
    writeOut(table(['DOCUMENT', 'PROFILE', 'SPANS', 'ERR', 'WARN', 'SEO'], rows, {
      align: ['left', 'left', 'right', 'right', 'right', 'right'],
    }));
    writeOut('');
  }

  const counts = result.counts;
  const parts = [
    pluralize(result.documents.length, 'document'),
    `modules ${active.length ? active.join(', ') : 'none'}`,
    pluralize(counts.error, 'error'),
    pluralize(counts.warn, 'warning'),
  ];
  writeOut(parts.join(' · '));

  if (counts.blocking > 0) {
    const first = result.documents.flatMap((entry) => entry.findings).find((f) => f.blocking);
    writeOut(
      paint(`✗ blocked by ${pluralize(counts.blocking, 'error')}.`, 'red') +
        (first ? paint(`  groundtruth explain ${first.rule}`, 'dim') : ''),
    );
  } else if (result.documents.length === 0) {
    writeOut(paint('no documents matched. Check the `documents` routing in your config.', 'yellow'));
  } else {
    writeOut(paint('✓ clean', 'green'));
  }
}

function reportGithub(result) {
  for (const entry of result.documents) {
    for (const finding of entry.findings) {
      const level = finding.severity === 'error' ? 'error' : finding.severity === 'warn' ? 'warning' : 'notice';
      const message = finding.fix?.instruction
        ? `${finding.message} Fix: ${finding.fix.instruction}`
        : finding.message;
      writeOut(
        `::${level} file=${finding.file},line=${finding.line || 1},title=${finding.rule}::${message.replace(/\n/g, ' ')}`,
      );
    }
  }
  const counts = countFindings(result.findings);
  writeErr(`groundtruth: ${counts.error} error(s), ${counts.warn} warning(s)`);
}
