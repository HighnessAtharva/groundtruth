import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Document } from '../src/core/document.mjs';
import { verifySpan, suggestMatch, runsCovering } from '../src/modules/grounding/verify.mjs';
import { loadSpanMaps, renderSpanMap } from '../src/modules/grounding/spanmap.mjs';
import { parseRef, parseFragment, AdapterRegistry } from '../src/adapters/index.mjs';
import { local } from '../src/adapters/local.mjs';
import { similarity } from '../src/core/text.mjs';
import { DEFAULT_VERDICTS, DERIVED_VERDICTS } from '../src/core/config.mjs';

const PROFILE = { grounding: { enabled: true, spanMaps: 'spans/${docId}.mjs', onDuplicateMatch: 'error' } };

function doc(source, relativePath = 'article.md') {
  return new Document({
    absolutePath: path.join(tmpdir(), relativePath),
    relativePath,
    source,
    profile: PROFILE,
    profileName: 'grounded',
  });
}

// ---------------------------------------------------------------------------
// Ref grammar
// ---------------------------------------------------------------------------

test('the ref grammar splits source, path and fragment', () => {
  assert.deepEqual(parseRef('notes:Bosses/Malenia.md#L212'), {
    sourceId: 'notes', path: 'Bosses/Malenia.md', fragment: 'L212',
    raw: 'notes:Bosses/Malenia.md#L212', external: false,
  });
  assert.equal(parseRef('specs:weapons.csv#name=Rivers of Blood&field=weight').fragment,
    'name=Rivers of Blood&field=weight');
});

test('a bare URL is marked external rather than special-cased later', () => {
  const ref = parseRef('https://example.org/credits#L4');
  assert.equal(ref.external, true);
  assert.equal(ref.sourceId, null);
  assert.equal(ref.path, 'https://example.org/credits');
});

test('a line anchor and a query fragment both parse', () => {
  assert.deepEqual(parseFragment('L212'), { line: 212 });
  assert.deepEqual(parseFragment('L14-L21'), { line: 14, endLine: 21 });
  assert.deepEqual(parseFragment('name=Rivers%20of%20Blood&field=weight'),
    { name: 'Rivers of Blood', field: 'weight' });
});

test('an adapter missing a method is refused by name', () => {
  assert.throws(
    () => new AdapterRegistry([{ id: 'broken', owns: () => true }]),
    /missing resolve, locate, permalink, describe/,
  );
});

// ---------------------------------------------------------------------------
// The verbatim guarantee
// ---------------------------------------------------------------------------

test('a match found once verifies, and its line is the file line', () => {
  const source = ['---', 'title: T', '---', '', 'Jill carries eight slots and Chris carries six.'].join('\n');
  const result = verifySpan({ match: 'Jill carries eight slots' }, doc(source));
  assert.equal(result.ok, true);
  assert.equal(result.count, 1);
  assert.equal(result.placements[0].start, 0);
});

test('a match that is not in the body is refused', () => {
  const result = verifySpan({ match: 'nothing like this' }, doc('Some other prose entirely.'));
  assert.equal(result.ok, false);
  assert.match(result.reason, /not found/);
});

test('a match appearing twice is an error by default and takes the first with onDuplicateMatch first', () => {
  const source = 'The queue drains.\n\nSomething else.\n\nThe queue drains.\n';
  assert.equal(verifySpan({ match: 'The queue drains' }, doc(source)).ok, false);
  const lenient = verifySpan({ match: 'The queue drains' }, doc(source), { onDuplicateMatch: 'first' });
  assert.equal(lenient.ok, true);
  assert.equal(lenient.count, 2);
});

test('a match may cross a bold run and a link, producing several marks', () => {
  const source = 'It reaches **thirteen platforms** through the [native drivers](https://x.dev) it ships.';
  const result = verifySpan({ match: 'reaches thirteen platforms through the native drivers it ships' }, doc(source));
  assert.equal(result.ok, true, result.reason || '');
  // Four runs: plain, strong, plain, link, plain. The mark spans several of them.
  assert.ok(result.placements[0].runs.length >= 4, `expected several runs, got ${result.placements[0].runs.length}`);
});

test('snake_case and arithmetic inside a match are fine', () => {
  // The source harness rejects any match containing * ` [ ] or _ because its
  // verifier cannot see the render tree. Both of these are ordinary text.
  const source = 'Set snake_case_name and compute 2 * 3 in the config file.';
  assert.equal(verifySpan({ match: 'Set snake_case_name and compute 2 * 3' }, doc(source)).ok, true);
});

test('a match can never land inside an image alt, because alt is not reader text', () => {
  const source = 'Before the picture.\n\n![a chart of completion rates](/img/c.png)\n\nAfter it.';
  assert.equal(verifySpan({ match: 'a chart of completion rates' }, doc(source)).ok, false);
});

test('a match inside a heading is refused, because a heading is not citable prose', () => {
  const source = '## The queue never drains\n\nThe body says something else.';
  assert.equal(verifySpan({ match: 'The queue never drains' }, doc(source)).ok, false);
});

test('runsCovering returns the exact source offsets for each covered run', () => {
  const source = 'Plain **bold** plain.';
  const document = doc(source);
  const block = document.query.citable()[0];
  const covered = runsCovering(block, 0, block.readerText.length);
  const rebuilt = covered.map((entry) => source.slice(entry.sourceStart, entry.sourceEnd)).join('');
  assert.equal(rebuilt, 'Plain bold plain.');
});

// ---------------------------------------------------------------------------
// Match repair
// ---------------------------------------------------------------------------

test('an edited sentence produces a confident repair, and the replacement is verbatim', () => {
  const source = 'The Armor Key opens three separate doors before the game lets you throw it away.';
  const document = doc(source);
  const suggestion = suggestMatch('The Armor Key opens three doors', document, { similarity });
  assert.equal(suggestion.confident, true, JSON.stringify(suggestion.top));
  assert.equal(suggestion.best.text, 'The Armor Key opens three separate doors');
  // The whole point: applying the repair cannot break the verbatim guarantee.
  assert.equal(verifySpan({ match: suggestion.best.text }, document).ok, true);
});

test('two equally good candidates refuse to auto-repair', () => {
  const source = 'The queue drains slowly here.\n\nThe queue drains slowly there.\n';
  const suggestion = suggestMatch('The queue drains slowly', doc(source), { similarity });
  assert.equal(suggestion.confident, false);
  assert.ok(suggestion.top.length >= 2);
});

test('overlapping windows of one sentence count as one answer', () => {
  // Judging ambiguity without collapsing them made every repair look ambiguous,
  // because the window one word to the left always scores nearly as well.
  const source = 'The Armor Key opens three separate doors before the game lets you throw it away.';
  const suggestion = suggestMatch('The Armor Key opens three doors', doc(source), { similarity });
  const best = suggestion.top[0];
  const second = suggestion.top[1];
  assert.ok(second === undefined || second.score < 0.6, JSON.stringify(suggestion.top));
  assert.ok(best.score >= 0.82);
});

// ---------------------------------------------------------------------------
// Span map validation
// ---------------------------------------------------------------------------

function withSpanMap(body, source = 'The queue drains slowly under load today.\n') {
  const root = mkdtempSync(path.join(tmpdir(), 'gt-spanmap-'));
  mkdirSync(path.join(root, 'spans'), { recursive: true });
  writeFileSync(path.join(root, 'article.md'), source, 'utf8');
  writeFileSync(path.join(root, 'spans', 'article.mjs'), body, 'utf8');
  const document = new Document({
    absolutePath: path.join(root, 'article.md'),
    relativePath: 'article.md',
    source,
    profile: PROFILE,
    profileName: 'grounded',
  });
  const config = {
    root,
    configPath: path.join(root, 'groundtruth.config.mjs'),
    verdicts: DEFAULT_VERDICTS,
    derivedVerdicts: DERIVED_VERDICTS,
  };
  return { root, document, config, clean: () => rmSync(root, { recursive: true, force: true }) };
}

test('a valid span map loads', async () => {
  const fixture = withSpanMap(`
export const document = 'article.md';
export const audited = '2026-08-22';
export const spans = [
  { match: 'The queue drains slowly', source: 'notes:q.md', quote: 'drains slowly', verdict: 'VERIFIED' },
];
`);
  const maps = await loadSpanMaps([fixture.document], fixture.config);
  const entry = maps.get('article.md');
  assert.equal(entry.spans.length, 1);
  assert.equal(entry.audited, '2026-08-22');
  fixture.clean();
});

test('a positional tuple is refused with an explanation', async () => {
  const fixture = withSpanMap(`
export const document = 'article.md';
export const spans = [
  ['The queue drains slowly', 'notes:q.md', 12, 'VERIFIED', 'drains slowly'],
];
`);
  await assert.rejects(() => loadSpanMaps([fixture.document], fixture.config), /is a tuple/);
  fixture.clean();
});

test('an unknown key on a span is refused rather than ignored', async () => {
  // A typo'd verdict key renders as an unstyled span in the source harness.
  const fixture = withSpanMap(`
export const document = 'article.md';
export const spans = [
  { match: 'The queue drains slowly', verdit: 'VERIFIED' },
];
`);
  await assert.rejects(() => loadSpanMaps([fixture.document], fixture.config), /unknown key 'verdit'/);
  fixture.clean();
});

test('a derived verdict cannot be authored', async () => {
  const fixture = withSpanMap(`
export const document = 'article.md';
export const spans = [
  { match: 'The queue drains slowly', verdict: 'STALE' },
];
`);
  await assert.rejects(
    () => loadSpanMaps([fixture.document], fixture.config),
    /the tool derives and an author cannot set/,
  );
  fixture.clean();
});

test('a verdict that requires a field is checked', async () => {
  const fixture = withSpanMap(`
export const document = 'article.md';
export const spans = [
  { match: 'The queue drains slowly', verdict: 'VERIFIED' },
];
`);
  await assert.rejects(() => loadSpanMaps([fixture.document], fixture.config), /requires 'source'/);
  fixture.clean();
});

test('a source with no quote is refused, because that is a link and not a citation', async () => {
  const fixture = withSpanMap(`
export const document = 'article.md';
export const spans = [
  { match: 'The queue drains slowly', source: 'notes:q.md', verdict: 'EXTERNAL' },
];
`);
  await assert.rejects(() => loadSpanMaps([fixture.document], fixture.config), /names a source but no quote/);
  fixture.clean();
});

test('a span map declaring the wrong document is refused', async () => {
  const fixture = withSpanMap(`
export const document = 'some/other/file.md';
export const spans = [];
`);
  await assert.rejects(() => loadSpanMaps([fixture.document], fixture.config), /declares document/);
  fixture.clean();
});

test('a missing span map is recorded, not thrown', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'gt-nomap-'));
  writeFileSync(path.join(root, 'article.md'), 'Body text here.\n', 'utf8');
  const document = new Document({
    absolutePath: path.join(root, 'article.md'),
    relativePath: 'article.md',
    source: 'Body text here.\n',
    profile: PROFILE,
    profileName: 'grounded',
  });
  const maps = await loadSpanMaps([document], {
    root,
    configPath: path.join(root, 'c.mjs'),
    verdicts: DEFAULT_VERDICTS,
    derivedVerdicts: DERIVED_VERDICTS,
  });
  assert.equal(maps.get('article.md').missing, true);
  rmSync(root, { recursive: true, force: true });
});

test('renderSpanMap round-trips through the loader', async () => {
  const rendered = renderSpanMap({
    document: 'article.md',
    audited: '2026-08-22',
    spans: [{ match: 'The queue drains slowly', source: null, quote: null, verdict: 'UNSOURCED', note: 'no data' }],
  });
  const fixture = withSpanMap(rendered);
  const maps = await loadSpanMaps([fixture.document], fixture.config);
  assert.equal(maps.get('article.md').spans[0].verdict, 'UNSOURCED');
  fixture.clean();
});

// ---------------------------------------------------------------------------
// The local adapter
// ---------------------------------------------------------------------------

test('the local adapter locates a quote that wraps across lines', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'gt-local-'));
  writeFileSync(
    path.join(root, 'notes.md'),
    'line one\nThe driver layer connects to 13 databases\nnatively via generated TypeScript clients.\nlast line\n',
    'utf8',
  );
  const adapter = local({ id: 'notes', root }).bind(root);
  const ref = parseRef('notes:notes.md');
  const resolved = await adapter.resolve(ref);
  const located = adapter.locate(resolved, 'connects to 13 databases natively via generated TypeScript clients');
  assert.equal(located.found, true);
  assert.equal(located.line, 2);
  assert.equal(located.confidence, 'normalized');
  assert.match(adapter.permalink(ref, located), /notes\.md#L2$/);
  assert.equal(adapter.describe(ref, located), 'notes.md:2');
  rmSync(root, { recursive: true, force: true });
});

test('the local adapter refuses a path outside its root', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'gt-esc-'));
  const adapter = local({ id: 'notes', root }).bind(root);
  const resolved = await adapter.resolve(parseRef('notes:../../secrets.md'));
  assert.match(resolved.error, /outside the source root/);
  rmSync(root, { recursive: true, force: true });
});

test('a quote that is not in the source reports not found rather than guessing', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'gt-miss-'));
  writeFileSync(path.join(root, 'notes.md'), 'Nothing relevant in here at all.\n', 'utf8');
  const adapter = local({ id: 'notes', root }).bind(root);
  const resolved = await adapter.resolve(parseRef('notes:notes.md'));
  const located = adapter.locate(resolved, 'a completely different sentence about warehouses');
  assert.equal(located.found, false);
  assert.equal(located.confidence, 'none');
  rmSync(root, { recursive: true, force: true });
});
