import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../src/cli/args.mjs';
import { toSarif } from '../src/cli/sarif.mjs';
import { discover } from '../src/core/discover.mjs';
import { normalizeFinding } from '../src/core/findings.mjs';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { version } from '../src/version.mjs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const SPEC = { boolean: ['json', 'quiet', 'changed', 'frozen'], alias: { m: 'module' }, collect: ['module'] };

test('a boolean flag never eats the next token', () => {
  // `check --json path.md` must not read the path as the value of --json.
  const { flags, positionals } = parseArgs(['--json', 'docs/a.md'], SPEC);
  assert.equal(flags.json, true);
  assert.deepEqual(positionals, ['docs/a.md']);
});

test('a repeatable flag collects rather than overwriting', () => {
  const { flags } = parseArgs(['--module', 'seo', '-m', 'readability'], SPEC);
  assert.deepEqual(flags.module, ['seo', 'readability']);
});

test('--key=value, --no-key and a negative number all parse', () => {
  const { flags } = parseArgs(['--fail-on=warn', '--no-json', '--limit', '-3'], SPEC);
  assert.equal(flags['fail-on'], 'warn');
  assert.equal(flags.json, false);
  assert.equal(flags.limit, -3);
});

test('everything after a bare -- is passthrough', () => {
  const { positionals, passthrough } = parseArgs(['a.md', '--', '--json'], SPEC);
  assert.deepEqual(positionals, ['a.md']);
  assert.deepEqual(passthrough, ['--json']);
});

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

function project() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gt-disc-'));
  mkdirSync(path.join(dir, 'article'), { recursive: true });
  mkdirSync(path.join(dir, 'expected'), { recursive: true });
  writeFileSync(path.join(dir, 'article', 'a.md'), '# A\n', 'utf8');
  writeFileSync(path.join(dir, 'article', 'b.md'), '# B\n', 'utf8');
  writeFileSync(path.join(dir, 'notes.md'), '# Not routed\n', 'utf8');
  writeFileSync(path.join(dir, 'expected', 'result.json'), '{}', 'utf8');
  writeFileSync(path.join(dir, 'expected', 'report.html'), '<p></p>', 'utf8');
  const config = {
    root: dir,
    extensions: ['.md'],
    defaultProfile: 'p',
    documents: [{ include: ['article/**/*.md'], exclude: [], profile: 'p' }],
  };
  return { dir, config, clean: () => rmSync(dir, { recursive: true, force: true }) };
}

test('routing decides what a plain run sees', () => {
  const { config, clean } = project();
  const found = discover(config).map((entry) => entry.relativePath);
  assert.deepEqual(found, ['article/a.md', 'article/b.md']);
  clean();
});

test('an explicit path runs even when nothing routes it', () => {
  const { config, clean } = project();
  const found = discover(config, { only: ['notes.md'] });
  assert.equal(found.length, 1);
  assert.equal(found[0].routed, false);
  assert.equal(found[0].profileName, 'p');
  clean();
});

test('a machine-generated list respects routing instead of falling through', () => {
  // --changed sets requireRoute. Without it, a changed result.json was checked as
  // prose because an explicit path bypassed the routing table.
  const { config, clean } = project();
  const loose = discover(config, { only: ['notes.md', 'expected/result.json'] });
  const strict = discover(config, { only: ['notes.md', 'expected/result.json'], requireRoute: true });
  assert.equal(loose.length, 1, 'the json is dropped by extension either way');
  assert.equal(strict.length, 0, 'and the unrouted markdown is dropped too');
  clean();
});

test('an explicit path that is not a document is ignored quietly', () => {
  const { config, clean } = project();
  assert.deepEqual(discover(config, { only: ['expected/report.html'] }), []);
  clean();
});

test('a glob works as an explicit path', () => {
  const { config, clean } = project();
  const found = discover(config, { only: ['article/*.md'] }).map((entry) => entry.relativePath);
  assert.deepEqual(found, ['article/a.md', 'article/b.md']);
  clean();
});

// ---------------------------------------------------------------------------
// SARIF
// ---------------------------------------------------------------------------

const RULES = [
  {
    id: 'seo.len-meta',
    module: 'seo',
    mechanical: true,
    defaultSeverity: 'error',
    explain: 'A meta description over the cap is cut mid-sentence. One right answer, so it blocks.',
    calibration: null,
  },
  {
    id: 'seo.kw-density',
    module: 'seo',
    mechanical: false,
    defaultSeverity: 'warn',
    explain: 'Phrase coverage. Advisory and permanently ungateable.',
    calibration: null,
  },
];

function payload() {
  return {
    schemaVersion: 1,
    summary: { blocking: 1, advisory: 1, exitCode: 1 },
    documents: [
      {
        path: 'article/a.md',
        findings: [
          normalizeFinding({
            rule: 'seo.len-meta',
            module: 'seo',
            severity: 'error',
            file: 'article/a.md',
            line: 3,
            message: '226 characters, over 165',
            fix: { kind: 'rewrite', instruction: 'Cut 61 characters.' },
          }),
          normalizeFinding({
            rule: 'seo.kw-density',
            module: 'seo',
            severity: 'warn',
            file: 'article/a.md',
            line: 1,
            message: 'coverage is 0.2 percent',
            fix: {
              kind: 'edit',
              instruction: 'Add a language tag.',
              patch: { file: 'article/a.md', line: 12, find: 'FENCE', replace: 'FENCEjs' },
            },
          }),
        ],
      },
    ],
  };
}

test('SARIF carries one rule entry per rule actually used', () => {
  const sarif = toSarif(payload(), { root: process.cwd(), rules: RULES });
  assert.equal(sarif.version, '2.1.0');
  const driver = sarif.runs[0].tool.driver;
  assert.equal(driver.rules.length, 2);
  assert.equal(driver.name, 'groundtruth');
});

test('SARIF maps severity onto its own level vocabulary', () => {
  const results = toSarif(payload(), { root: process.cwd(), rules: RULES }).runs[0].results;
  assert.equal(results[0].level, 'error');
  assert.equal(results[1].level, 'warning');
});

test('SARIF tags a rule as gate or advisory, so a reviewer knows what can block', () => {
  const driver = toSarif(payload(), { root: process.cwd(), rules: RULES }).runs[0].tool.driver;
  const gate = driver.rules.find((rule) => rule.id === 'seo.len-meta');
  const advisory = driver.rules.find((rule) => rule.id === 'seo.kw-density');
  assert.ok(gate.properties.tags.includes('gate'));
  assert.ok(advisory.properties.tags.includes('advisory'));
});

test('SARIF carries blocking and fixKind through to properties', () => {
  const results = toSarif(payload(), { root: process.cwd(), rules: RULES }).runs[0].results;
  assert.equal(results[0].properties.blocking, true);
  assert.equal(results[0].properties.fixKind, 'rewrite');
  assert.equal(results[1].properties.blocking, false);
});

test('only an exact patch becomes a suggested change', () => {
  const results = toSarif(payload(), { root: process.cwd(), rules: RULES }).runs[0].results;
  assert.equal(results[0].fixes, undefined, 'a rewrite has no patch, so it must offer no fix');
  assert.equal(results[1].fixes.length, 1);
  assert.equal(results[1].fixes[0].artifactChanges[0].replacements[0].insertedContent.text, 'FENCEjs');
});

test('SARIF reports the invocation outcome, so a fixed alert can be cleared', () => {
  const invocation = toSarif(payload(), { root: process.cwd(), rules: RULES }).runs[0].invocations[0];
  assert.equal(invocation.executionSuccessful, false);
  assert.equal(invocation.exitCode, 1);
});

test('SARIF paths are project-relative with forward slashes', () => {
  const results = toSarif(payload(), { root: process.cwd(), rules: RULES }).runs[0].results;
  const uri = results[0].locations[0].physicalLocation.artifactLocation.uri;
  assert.equal(uri, 'article/a.md');
  assert.ok(!uri.includes('\\'));
});

test('the fix instruction travels in the message, where a reviewer will read it', () => {
  const results = toSarif(payload(), { root: process.cwd(), rules: RULES }).runs[0].results;
  assert.match(results[0].message.text, /Fix: Cut 61 characters\./);
});

// ---------------------------------------------------------------------------
// The first screen a new user sees
// ---------------------------------------------------------------------------

// Driven as a subprocess on purpose. The banner and the match count are what a
// new user reads before anything else, and only the real binary proves what
// they say.
function runCli(args, cwd, env = {}) {
  const bin = path.join(import.meta.dirname, '..', 'bin', 'groundtruth.mjs');
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env, NO_COLOR: '1' },
  });
  return { out: result.stdout || '', err: result.stderr || '', code: result.status };
}

function scratchProject() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gt-cli-'));
  mkdirSync(path.join(dir, 'docs'));
  writeFileSync(path.join(dir, 'docs', 'a.md'), '# A doc\n\nThe cache holds 512 items.\n');
  // A consumer project whose own version differs from ours, which is the case
  // that produced the bug.
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'consumer', version: '1.0.0' }));
  return dir;
}

test('init reports this package version, not the consumer project version', () => {
  // Under `npx` inside somebody else's project, `npm_package_version` holds
  // *their* version. The banner read it, so in a fresh `npm init -y` project
  // the first command a new user ever ran claimed "groundtruth 1.0.0".
  const dir = scratchProject();
  try {
    const { out, code } = runCli(['init', '--modules', 'readability'], dir, {
      npm_package_version: '9.9.9',
    });
    assert.equal(code, 0, `init exited ${code}`);
    const banner = out.split('\n').find((l) => l.trim().startsWith('groundtruth'));
    assert.ok(banner, `init printed no banner:\n${out}`);
    assert.ok(banner.includes(version), `banner ${JSON.stringify(banner)} omits ${version}`);
    assert.ok(!banner.includes('9.9.9'), 'banner read npm_package_version');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('one matching document reads as a sentence', () => {
  const dir = scratchProject();
  try {
    const { out } = runCli(['init', '--modules', 'readability'], dir);
    assert.match(out, /1 document matches docs/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--version prints the version alone, for scripts to read', () => {
  const dir = scratchProject();
  try {
    const { out, code } = runCli(['--version'], dir, { npm_package_version: '9.9.9' });
    assert.equal(code, 0);
    assert.equal(out.trim(), version);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
