// `groundtruth check` — the blocking command.
//
// Takes paths. The harness this came from can only check the whole corpus, so a
// one-line edit costs a full-corpus run. That is a real usability defect and it
// does not get carried over.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../core/config.mjs';
import { execFileSync } from 'node:child_process';
import { buildEngine } from '../core/engine.mjs';
import { toSarif } from './sarif.mjs';
import { allRules } from '../core/rules.mjs';
import { countFindings } from '../core/findings.mjs';
import { table, paint, formatFinding, writeOut, writeErr, pluralize } from './format.mjs';
import { version } from '../version.mjs';

export async function runCheck(argv) {
  const { flags, positionals } = argv;
  const config = await loadConfig({ cwd: flags.cwd || process.cwd(), configPath: flags.config });
  const modules = normalizeModules(flags);

  // --frozen is the CI mode: it promotes the pin-moved rule, which ships off so a
  // normal run never mentions a pin it is not going to fail on.
  const severity = flags.frozen
    ? { ...config.severity, 'ground.pin-moved': 'error' }
    : config.severity;
  const { pipeline, modules: active } = await buildEngine(
    { ...config, severity },
    { modules },
  );

  const stageLog = [];
  const started = Date.now();
  // --changed narrows the run to what this branch touched, which is what keeps a
  // Stop hook fast enough that nobody turns it off.
  const only = flags.changed ? changedFiles(config, positionals) : positionals;
  if (flags.changed && !only.length) {
    if (!flags.json) writeOut(paint('no changed documents.', 'dim'));
    else writeOut(JSON.stringify(emptyPayload(config), null, 2));
    return 0;
  }

  const { outputs } = await pipeline.run(
    {
      only,
      // A machine-generated file list is mostly not documents, so it must respect
      // routing rather than fall through to the default profile.
      requireRoute: Boolean(flags.changed),
      config,
      frozen: Boolean(flags.frozen),
      offline: Boolean(flags.offline) || Boolean(flags.frozen),
    },
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

  // --hook is the shape a Stop hook needs: silent on success, and on failure a
  // message on stderr plus exit 2, which is what tells the harness to block.
  if (flags.hook) {
    if (!payload.summary.blocking) return 0;
    const lines = [`groundtruth: ${pluralize(payload.summary.blocking, 'blocking finding')}. Fix these before finishing.`];
    for (const document of payload.documents) {
      for (const finding of document.findings) {
        if (!finding.blocking) continue;
        lines.push(`  ${finding.file}:${finding.line || 1}  ${finding.rule}  [${finding.fix?.kind || 'unknown'}]`);
        lines.push(`      ${finding.message}`);
        if (finding.fix?.instruction) lines.push(`      fix: ${finding.fix.instruction}`);
      }
    }
    writeErr(lines.join('\n'));
    return 2;
  }

  if (flags.format === 'sarif') {
    writeOut(JSON.stringify(toSarif(payload, { root: config.root, rules: allRules() }), null, 2));
  } else if (flags.json) {
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

/**
 * Documents this branch touched, from git.
 *
 * Falls back to the whole corpus when git is unavailable or the merge base cannot
 * be found, because narrowing to nothing would silently check nothing.
 */
function changedFiles(config, extra) {
  const run = (args) =>
    execFileSync('git', args, { cwd: config.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

  let top;
  try {
    top = run(['rev-parse', '--show-toplevel']).trim();
  } catch {
    writeErr(paint('--changed: not a git repository, checking everything instead.', 'yellow'));
    return extra;
  }

  const lines = (args) => {
    try {
      return run(args).split('\n').map((line) => line.trim()).filter(Boolean);
    } catch {
      return [];
    }
  };

  // git reports paths from the repository root. A project rooted in a
  // subdirectory needs them translated, and anything outside it dropped, or the
  // run narrows to a set of paths that cannot resolve.
  const inProject = (gitRelative) => {
    const absolute = path.resolve(top, gitRelative);
    const relative = path.relative(config.root, absolute);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
    return relative.replace(/\\/g, '/');
  };

  const bases = ['origin/HEAD', 'origin/main', 'origin/master', 'main', 'master', 'HEAD~1'];
  let committed = null;
  for (const base of bases) {
    try {
      const point = run(['merge-base', 'HEAD', base]).trim();
      committed = lines(['diff', '--name-only', '--diff-filter=ACMR', point, '--']);
      break;
    } catch {
      // Try the next candidate base.
    }
  }

  if (committed === null) {
    writeErr(paint('--changed: no git merge base found, checking everything instead.', 'yellow'));
    return extra;
  }

  const staged = lines(['diff', '--name-only', '--cached', '--diff-filter=ACMR']);
  const unstaged = lines(['diff', '--name-only', '--diff-filter=ACMR']);
  const untracked = lines(['ls-files', '--others', '--exclude-standard']);

  const mapped = [...committed, ...staged, ...unstaged, ...untracked]
    .map(inProject)
    .filter(Boolean);

  return [...new Set([...mapped, ...extra])];
}

function emptyPayload(config) {
  return {
    schemaVersion: 1,
    tool: { name: 'groundtruth', version },
    run: { configPath: relativeConfig(config), durationMs: 0, modules: {} },
    summary: { documents: 0, blocking: 0, advisory: 0, bySeverity: { error: 0, warn: 0, info: 0 }, verdicts: {}, exitCode: 0 },
    documents: [],
  };
}

/** Machine output carries no absolute path, so a snapshot is not machine-specific. */
function relativeConfig(config) {
  const relative = path.relative(config.root, config.configPath).split(path.sep).join('/');
  return relative || 'groundtruth.config.mjs';
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
      // An absolute path in machine output is noise, and committing one into a
      // snapshot makes the snapshot machine-specific.
      configPath: relativeConfig(config),
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
    // With --changed, zero documents is the normal answer and not a misconfiguration.
    writeOut(flags.changed
      ? paint('no changed documents.', 'dim')
      : paint('no documents matched. Check the `documents` routing in your config.', 'yellow'));
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
