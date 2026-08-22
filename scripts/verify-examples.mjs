#!/usr/bin/env node
// Every example ships a committed result.json. This re-runs each one and diffs the
// findings against it, which turns the examples into a regression suite rather than
// decoration.
//
// The comparison is on the shape that matters and not on the whole payload: rule
// ids, severities, lines, blocking flags and fix kinds. Timings and absolute paths
// change on every machine and comparing them would make this fail for no reason.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const examplesDir = path.join(root, 'examples');
const bin = path.join(root, 'bin', 'groundtruth.mjs');
const offline = process.argv.includes('--offline');
const update = process.argv.includes('--update');

const examples = readdirSync(examplesDir).filter((name) =>
  existsSync(path.join(examplesDir, name, 'groundtruth.config.mjs')));

let failed = 0;

for (const name of examples) {
  const dir = path.join(examplesDir, name);
  const expectedPath = path.join(dir, 'expected', 'result.json');

  let raw;
  try {
    raw = execFileSync(process.execPath, [bin, 'check', '--json', ...(offline ? ['--offline'] : [])], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1' },
    });
  } catch (error) {
    // Exit 1 is the expected outcome. Every example fails on purpose, so a
    // non-zero exit is not an error here, but stdout still has to be valid JSON.
    raw = error.stdout || '';
    if (error.status === 3 || error.status === 4 || error.status === 5) {
      console.error(`FAIL ${name}: exited ${error.status}\n${error.stderr || ''}`);
      failed += 1;
      continue;
    }
  }

  let actual;
  try {
    actual = JSON.parse(raw);
  } catch {
    console.error(`FAIL ${name}: stdout was not JSON. stdout must carry nothing else.`);
    failed += 1;
    continue;
  }

  if (update) {
    console.log(`${name}: ${shape(actual).findings.length} findings, snapshot not written by this script`);
    continue;
  }

  if (!existsSync(expectedPath)) {
    console.error(`FAIL ${name}: expected/result.json is missing`);
    failed += 1;
    continue;
  }

  const expected = shape(JSON.parse(readFileSync(expectedPath, 'utf8')));
  const got = shape(actual);
  const diff = compare(expected, got);

  if (diff.length) {
    console.error(`FAIL ${name}`);
    for (const line of diff) console.error(`  ${line}`);
    failed += 1;
    continue;
  }

  console.log(
    `ok   ${name.padEnd(26)} ${got.blocking} blocking, ${got.advisory} advisory, ${got.findings.length} findings`,
  );
}

if (failed) {
  console.error(`\n${failed} example(s) no longer report what they are supposed to report.`);
  console.error('If the change was intended, regenerate the snapshots and commit them.');
  process.exit(1);
}

console.log(`\n${examples.length} example(s) verified${offline ? ' offline' : ''}.`);

/** The parts of a payload that are stable across machines. */
function shape(payload) {
  return {
    blocking: payload.summary.blocking,
    advisory: payload.summary.advisory,
    verdicts: payload.summary.verdicts || {},
    findings: payload.documents
      .flatMap((document) =>
        document.findings.map((finding) => ({
          file: finding.file,
          rule: finding.rule,
          severity: finding.severity,
          blocking: finding.blocking,
          line: finding.line,
          fixKind: finding.fix?.kind ?? null,
        })))
      .sort((a, b) => `${a.file}${a.rule}${a.line}`.localeCompare(`${b.file}${b.rule}${b.line}`)),
  };
}

function compare(expected, got) {
  const problems = [];
  if (expected.blocking !== got.blocking) {
    problems.push(`blocking: expected ${expected.blocking}, got ${got.blocking}`);
  }
  if (expected.advisory !== got.advisory) {
    problems.push(`advisory: expected ${expected.advisory}, got ${got.advisory}`);
  }
  for (const [verdict, count] of Object.entries(expected.verdicts)) {
    if (got.verdicts[verdict] !== count) {
      problems.push(`verdict ${verdict}: expected ${count}, got ${got.verdicts[verdict] ?? 0}`);
    }
  }

  const key = (entry) => `${entry.file} ${entry.rule} line ${entry.line}`;
  const expectedKeys = new Set(expected.findings.map(key));
  const gotKeys = new Set(got.findings.map(key));

  for (const entry of expected.findings) {
    if (!gotKeys.has(key(entry))) problems.push(`gone: ${key(entry)}`);
  }
  for (const entry of got.findings) {
    if (!expectedKeys.has(key(entry))) problems.push(`new:  ${key(entry)} (${entry.severity})`);
  }

  return problems;
}
