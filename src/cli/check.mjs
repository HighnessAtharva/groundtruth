// `groundtruth check` — the blocking command.
//
// Takes paths. The harness this came from can only check the whole corpus, so a
// one-line edit costs a full-corpus run. That is a real usability defect and it
// does not get carried over.

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
