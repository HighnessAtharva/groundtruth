// `groundtruth report` — write the HTML report.
//
// Non-blocking by default, even when the content is broken. A report you cannot
// generate while the content is broken is a report you cannot use to fix it.
// `--fail-on error` makes it blocking for CI.

import path from 'node:path';
import { spawn } from 'node:child_process';
import { loadConfig } from '../core/config.mjs';
import { buildEngine } from '../core/engine.mjs';
import { buildReport } from '../report/build.mjs';
import { paint, writeOut, writeErr, pluralize } from './format.mjs';

export async function runReport(argv) {
  const { flags, positionals } = argv;
  const config = await loadConfig({ cwd: flags.cwd || process.cwd(), configPath: flags.config });
  const modules = normalizeModules(flags);
  const { pipeline, modules: active } = await buildEngine(config, { modules });

  const { outputs } = await pipeline.run({ only: positionals, config }, { upTo: 'findings.collect' });
  const result = outputs.get('findings.collect');

  const { dir, indexPath, pages } = buildReport({ config, result, active });

  const counts = result.counts;
  writeOut('');
  writeOut(`  ${paint('wrote', 'green')}  ${pluralize(pages.length + 1, 'page')} to ${path.relative(process.cwd(), dir) || dir}`);
  writeOut(`  ${pluralize(counts.error, 'error')} · ${pluralize(counts.warn, 'warning')}`);
  writeOut('');
  writeOut(`  ${paint(indexPath, 'cyan')}`);
  writeOut('');

  if (flags.open) openInBrowser(indexPath);

  const failOn = flags['fail-on'];
  if (failOn === 'error' && counts.error > 0) return 1;
  if (failOn === 'warn' && (counts.error > 0 || counts.warn > 0)) return 1;
  return 0;
}

function normalizeModules(flags) {
  const raw = [flags.module, flags.only].flat().filter(Boolean);
  if (!raw.length) return null;
  return raw.flatMap((entry) => String(entry).split(',')).map((entry) => entry.trim()).filter(Boolean);
}

function openInBrowser(target) {
  const command = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', target] : [target];
  try {
    spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
  } catch (error) {
    writeErr(`could not open a browser: ${error.message}`);
  }
}
