// Command table and the exit-code contract.
//
// Exit codes are distinct so CI can tell a content failure from a setup failure.
// The harness this came from returns 1 for both, so a broken config and a
// contradicted claim look identical in a pipeline log.
//
//   0  clean
//   1  blocking findings
//   2  usage error
//   3  config error
//   4  internal error
//   5  network required and unavailable

import { parseArgs } from './args.mjs';
import { paint, writeErr, writeOut } from './format.mjs';
import { version } from '../version.mjs';

const BOOLEAN = [
  'json', 'quiet', 'verbose', 'force', 'minimal', 'help', 'version', 'compact',
  'changed', 'frozen', 'fix-matches', 'open', 'refresh', 'offline', 'snapshot',
  'update', 'write', 'all', 'with-hooks', 'with-ci', 'no-color',
];

const ALIAS = { h: 'help', v: 'version', q: 'quiet', j: 'json', m: 'module' };
const COLLECT = ['module', 'only'];

const COMMANDS = {
  init: { load: () => import('./init.mjs').then((m) => m.runInit), blurb: 'set groundtruth up in this repo' },
  check: { load: () => import('./check.mjs').then((m) => m.runCheck), blurb: 'run the gate. blocking' },
  report: { load: () => import('./report.mjs').then((m) => m.runReport), blurb: 'write the HTML report' },
  draft: { load: () => import('./draft.mjs').then((m) => m.runDraft), blurb: 'scaffold a span map from a document' },
  resolve: { load: () => import('./resolve.mjs').then((m) => m.runResolve), blurb: 'warm the cache and move pins. the only network command' },
  explain: { load: () => import('./explain.mjs').then((m) => m.runExplain), blurb: 'why a rule exists and what it measures' },
};

export async function main(argv) {
  const parsed = parseArgs(argv, { boolean: BOOLEAN, alias: ALIAS, collect: COLLECT });
  const [name, ...rest] = parsed.positionals;

  if (parsed.flags.version) {
    writeOut(version);
    return 0;
  }

  if (!name || parsed.flags.help || name === 'help') {
    printHelp(rest[0] || (name === 'help' ? rest[0] : null));
    return name && name !== 'help' ? 0 : 0;
  }

  const command = COMMANDS[name];
  if (!command) {
    writeErr(paint(`unknown command: ${name}`, 'red'));
    writeErr(`  try one of: ${Object.keys(COMMANDS).join(', ')}`);
    return 2;
  }

  let run;
  try {
    run = await command.load();
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') {
      writeErr(paint(`\`groundtruth ${name}\` is not built yet.`, 'yellow'));
      return 2;
    }
    throw error;
  }

  return run({ flags: parsed.flags, positionals: rest, passthrough: parsed.passthrough });
}

function printHelp(topic) {
  if (topic && COMMANDS[topic]) {
    writeOut(`groundtruth ${topic} — ${COMMANDS[topic].blurb}`);
    return;
  }

  writeOut(`groundtruth ${version}`);
  writeOut('');
  writeOut('  Bind every factual claim in a document to a verbatim quote in a real');
  writeOut('  source, then gate on it.');
  writeOut('');
  writeOut('Commands');
  writeOut('');
  for (const [name, entry] of Object.entries(COMMANDS)) {
    writeOut(`  ${name.padEnd(10)} ${entry.blurb}`);
  }
  writeOut('');
  writeOut('Global flags');
  writeOut('');
  writeOut('  --config <path>     use this config instead of searching upward');
  writeOut('  --cwd <dir>         run as if started in this directory');
  writeOut('  --module <name>     restrict the run. repeatable, or comma separated');
  writeOut('  --json              machine output on stdout, nothing else');
  writeOut('  --verbose           show info findings and the pipeline stage order');
  writeOut('  --quiet             suppress progress output');
  writeOut('');
  writeOut('Exit codes');
  writeOut('');
  writeOut('  0 clean   1 blocking findings   2 usage   3 config   4 internal   5 network');
  writeOut('');
}
