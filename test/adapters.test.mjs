import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { records, parseDelimited } from '../src/adapters/records.mjs';
import { web, toText } from '../src/adapters/web.mjs';
import { git } from '../src/adapters/git.mjs';
import { local } from '../src/adapters/local.mjs';
import { parseRef, AdapterRegistry } from '../src/adapters/index.mjs';
import { Cache } from '../src/core/cache.mjs';
import { readLockfile, writeLockfile, comparePins, pinAge } from '../src/core/lockfile.mjs';

function scratch(prefix) {
  const dir = mkdtempSync(path.join(tmpdir(), `gt-${prefix}-`));
  return { dir, clean: () => rmSync(dir, { recursive: true, force: true }) };
}

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

test('the CSV reader handles quoted fields, doubled quotes and embedded commas', () => {
  const rows = parseDelimited('name,note\nAlpha,"has, a comma"\nBeta,"says ""hi"""\n');
  assert.deepEqual(rows, [
    { name: 'Alpha', note: 'has, a comma' },
    { name: 'Beta', note: 'says "hi"' },
  ]);
});

test('the CSV reader handles a newline inside a quoted field', () => {
  const rows = parseDelimited('name,note\nAlpha,"line one\nline two"\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].note, 'line one\nline two');
});

// ---------------------------------------------------------------------------
// The records adapter
// ---------------------------------------------------------------------------

const TABLE = [
  'name,price_usd,hours,note',
  'Ashfall Reach,24.99,31.5,long',
  'Nine Lanterns,9.99,4.9,short',
].join('\n');

function withTable(body = TABLE, name = 'table.csv') {
  const { dir, clean } = scratch('records');
  writeFileSync(path.join(dir, name), `${body}\n`, 'utf8');
  const adapter = records({ id: 'stats', file: name, key: 'name' }).bind(dir);
  return { dir, adapter, clean };
}

test('a claim cites a cell by row selector and field', async () => {
  const { adapter, clean } = withTable();
  const ref = parseRef('stats:table.csv#name=Ashfall%20Reach&field=price_usd');
  const resolved = await adapter.resolve(ref);
  const located = adapter.locate(resolved, '24.99', ref);
  assert.equal(located.found, true);
  assert.equal(located.confidence, 'exact');
  assert.equal(located.method, 'cell');
  assert.equal(adapter.describe(ref), 'table.csv · name="Ashfall Reach" · price_usd');
  clean();
});

test('a cell match tolerates a currency symbol and a trailing unit', async () => {
  // Refusing these is pedantry rather than verification. A table stores a number
  // and a writer writes a price.
  const { adapter, clean } = withTable();
  const priceRef = parseRef('stats:table.csv#name=Ashfall%20Reach&field=price_usd');
  const resolved = await adapter.resolve(priceRef);
  assert.equal(adapter.locate(resolved, '$24.99', priceRef).confidence, 'normalized');

  const hoursRef = parseRef('stats:table.csv#name=Nine%20Lanterns&field=hours');
  assert.equal(adapter.locate(resolved, '4.9 hours', hoursRef).confidence, 'normalized');
  clean();
});

test('a wrong value reports what the cell actually holds', async () => {
  const { adapter, clean } = withTable();
  const ref = parseRef('stats:table.csv#name=Ashfall%20Reach&field=price_usd');
  const resolved = await adapter.resolve(ref);
  const located = adapter.locate(resolved, '14.99', ref);
  assert.equal(located.found, false);
  assert.equal(located.value, '24.99');
  clean();
});

test('a row that does not exist is a miss, not a crash', async () => {
  const { adapter, clean } = withTable();
  const ref = parseRef('stats:table.csv#name=Nothing&field=price_usd');
  const resolved = await adapter.resolve(ref);
  assert.equal(adapter.locate(resolved, '1', ref).found, false);
  clean();
});

test('a nested field is addressed by path', async () => {
  const { dir, clean } = scratch('records-json');
  writeFileSync(
    path.join(dir, 'games.json'),
    JSON.stringify([{ name: 'A', has_tutorial: false }, { name: 'B', has_tutorial: true }]),
    'utf8',
  );
  const adapter = records({ id: 'cat', file: 'games.json' }).bind(dir);
  const ref = parseRef('cat:games.json#path=1.has_tutorial');
  const resolved = await adapter.resolve(ref);
  const located = adapter.locate(resolved, 'true', ref);
  assert.equal(located.found, true);
  assert.equal(located.method, 'field');
  clean();
});

test('a ref with no selector cites the file and locates by text', async () => {
  // Without this, quoting a table's header line reported both not-found and stale.
  const { adapter, clean } = withTable();
  const ref = parseRef('stats:table.csv');
  const resolved = await adapter.resolve(ref);
  const located = adapter.locate(resolved, 'name,price_usd,hours,note', ref);
  assert.equal(located.found, true);
  assert.equal(located.method, 'line');
  assert.equal(adapter.drift(ref, 'anything', { meta: { contentHash: 'different' } }), null);
  clean();
});

test('a changed cell drifts, with the old value beside the new one', async () => {
  const { dir, adapter, clean } = withTable();
  const pin = await adapter.pin();

  writeFileSync(path.join(dir, 'table.csv'), `${TABLE.replace('24.99', '14.99')}\n`, 'utf8');
  const fresh = records({ id: 'stats', file: 'table.csv', key: 'name' }).bind(dir);
  const ref = parseRef('stats:table.csv#name=Ashfall%20Reach&field=price_usd');

  const drift = fresh.drift(ref, '24.99', pin);
  assert.ok(drift?.stale, 'expected drift');
  assert.equal(drift.was, '24.99');
  assert.equal(drift.now, '14.99');
  assert.notEqual(drift.from, drift.to);
  clean();
});

test('an unchanged table does not drift', async () => {
  const { adapter, clean } = withTable();
  const pin = await adapter.pin();
  const ref = parseRef('stats:table.csv#name=Ashfall%20Reach&field=price_usd');
  assert.equal(adapter.drift(ref, '24.99', pin), null);
  clean();
});

test('a ref naming a second file is not compared against the first file pin', async () => {
  // Comparing it to the wrong hash reported every claim in a second file as stale.
  const { dir, adapter, clean } = withTable();
  const pin = await adapter.pin();
  writeFileSync(path.join(dir, 'other.csv'), 'name,v\nA,1\n', 'utf8');
  writeFileSync(path.join(dir, 'table.csv'), `${TABLE.replace('24.99', '14.99')}\n`, 'utf8');
  const ref = parseRef('stats:other.csv#name=A&field=v');
  assert.equal(adapter.drift(ref, '1', pin), null);
  clean();
});

// ---------------------------------------------------------------------------
// The web adapter
// ---------------------------------------------------------------------------

test('HTML becomes locatable text with script and style removed', () => {
  const text = toText('<h1>Title</h1><script>bad()</script><p>Hello &amp; welcome</p><style>x{}</style>');
  assert.ok(!text.includes('bad()'));
  assert.ok(!text.includes('x{}'));
  assert.match(text, /Hello & welcome/);
});

function withSnapshots(older, newer) {
  const { dir, clean } = scratch('web');
  const adapter = web({ id: 'web', snapshotDir: dir }).bind(dir);
  const url = 'https://example.com/notes';
  const bucket = path.join(adapter.snapshotDir, [...adapter.captures(url)].length ? 'x' : '');
  // Write through the adapter's own layout by reusing its hash of the URL.
  const { shortHash } = { shortHash: null };
  return { dir, adapter, url, clean, bucket, shortHash };
}

test('a captured page resolves offline and locates its quote', async () => {
  const { dir, clean } = scratch('web-one');
  const adapter = web({ id: 'web', snapshotDir: dir }).bind(dir);
  const url = 'https://example.com/notes';

  // Write a capture using the adapter's own directory layout.
  const { shortHash } = await import('../src/core/hash.mjs');
  const bucket = path.join(dir, shortHash(url, 16));
  mkdirSync(bucket, { recursive: true });
  writeFileSync(
    path.join(bucket, '2026-03-14.snapshot'),
    ['--- groundtruth snapshot ---', `url: ${url}`, 'capturedAt: 2026-03-14T09:00:00.000Z', '', 'the second achievement is the predictor'].join('\n'),
    'utf8',
  );

  const ref = parseRef('web:https://example.com/notes');
  const resolved = await adapter.resolve(ref, null, { offline: true });
  assert.equal(resolved.error, undefined);
  assert.equal(resolved.snapshot, '2026-03-14');
  const located = adapter.locate(resolved, 'the second achievement is the predictor');
  assert.equal(located.found, true);
  assert.match(adapter.permalink(ref, located), /#:~:text=/);
  assert.match(adapter.describe(ref, resolved), /example\.com/);
  clean();
});

test('a missing capture during an offline run says so rather than skipping', async () => {
  const { dir, clean } = scratch('web-none');
  const adapter = web({ id: 'web', snapshotDir: dir }).bind(dir);
  const resolved = await adapter.resolve(parseRef('web:https://example.com/gone'), null, { offline: true });
  assert.equal(resolved.text, null);
  assert.equal(resolved.needsNetwork, true);
  assert.match(resolved.error, /groundtruth resolve/);
  clean();
});

test('a newer capture that drops the quote drifts, with both dates', async () => {
  const { dir, clean } = scratch('web-drift');
  const adapter = web({ id: 'web', snapshotDir: dir }).bind(dir);
  const url = 'https://example.com/notes';
  const { shortHash } = await import('../src/core/hash.mjs');
  const bucket = path.join(dir, shortHash(url, 16));
  mkdirSync(bucket, { recursive: true });
  const head = (date, body) =>
    ['--- groundtruth snapshot ---', `url: ${url}`, `capturedAt: ${date}T09:00:00.000Z`, '', body].join('\n');
  writeFileSync(path.join(bucket, '2026-03-14.snapshot'), head('2026-03-14', 'the claim was here'), 'utf8');
  writeFileSync(path.join(bucket, '2026-08-01.snapshot'), head('2026-08-01', 'that claim was withdrawn'), 'utf8');

  const drift = adapter.drift(parseRef('web:https://example.com/notes'), 'the claim was here');
  assert.ok(drift?.stale);
  assert.equal(drift.from, '2026-03-14');
  assert.equal(drift.to, '2026-08-01');
  clean();
});

// ---------------------------------------------------------------------------
// The git adapter, without a network
// ---------------------------------------------------------------------------

test('the git adapter refuses to read a moving branch tip with no pin', async () => {
  const adapter = git({ id: 'repo', repo: 'owner/name' });
  const resolved = await adapter.resolve(parseRef('repo:index.js'), null);
  assert.equal(resolved.text, null);
  assert.match(resolved.error, /has no pin/);
});

test('the git adapter serves a pinned file from the cache with no network', async () => {
  const { dir, clean } = scratch('git-cache');
  const cache = new Cache(dir);
  const adapter = git({ id: 'repo', repo: 'owner/name' }).attachCache(cache);
  const pin = { id: 'repo', kind: 'git', meta: { repo: 'owner/name', sha: 'a'.repeat(40) } };
  const ref = parseRef('repo:index.js');

  cache.set('repo', ref.raw, pin, { text: 'let activeCount = 0;\n', contentHash: 'x', url: 'u' });
  const resolved = await adapter.resolve(ref, pin, { offline: true });
  assert.equal(resolved.text, 'let activeCount = 0;\n');

  const located = adapter.locate(resolved, 'let activeCount = 0;', ref);
  assert.equal(located.line, 1);
  assert.equal(adapter.permalink(ref, located, pin), `https://github.com/owner/name/blob/${'a'.repeat(40)}/index.js#L1`);
  clean();
});

test('an unlocatable quote degrades the permalink to the file, never a wrong line', async () => {
  const { dir, clean } = scratch('git-degrade');
  const cache = new Cache(dir);
  const adapter = git({ id: 'repo', repo: 'owner/name' }).attachCache(cache);
  const pin = { meta: { repo: 'owner/name', sha: 'b'.repeat(40) } };
  const ref = parseRef('repo:index.js');
  cache.set('repo', ref.raw, pin, { text: 'nothing relevant\n' });
  const resolved = await adapter.resolve(ref, pin, { offline: true });
  const located = adapter.locate(resolved, 'a quote that is not there at all', ref);
  assert.equal(located.found, false);
  const link = adapter.permalink(ref, located, pin);
  assert.ok(!link.includes('#L'), `expected a file-level link, got ${link}`);
  clean();
});

// ---------------------------------------------------------------------------
// Cache and lockfile
// ---------------------------------------------------------------------------

test('the cache is keyed on adapter, ref and pin together', () => {
  const { dir, clean } = scratch('cache-key');
  const cache = new Cache(dir);
  const a = { meta: { sha: 'aaa' } };
  const b = { meta: { sha: 'bbb' } };

  cache.set('repo', 'repo:x.js', a, { text: 'old' });
  cache.set('repo', 'repo:x.js', b, { text: 'new' });

  // Moving a pin does not invalidate the old entry, which is what lets the tool
  // say what a quote used to be.
  assert.equal(cache.get('repo', 'repo:x.js', a).text, 'old');
  assert.equal(cache.get('repo', 'repo:x.js', b).text, 'new');
  assert.equal(cache.size(), 2);
  clean();
});

test('a corrupt cache entry is a miss, not a crash', () => {
  const { dir, clean } = scratch('cache-bad');
  const cache = new Cache(dir);
  const pin = { meta: { sha: 'z' } };
  cache.set('repo', 'repo:x.js', pin, { text: 'fine' });
  const file = cache.pathFor(cache.key('repo', 'repo:x.js', pin));
  writeFileSync(file, '{ not json', 'utf8');

  const fresh = new Cache(dir);
  assert.equal(fresh.get('repo', 'repo:x.js', pin), null);
  clean();
});

test('the lockfile round-trips and sorts its sources', () => {
  const { dir, clean } = scratch('lock');
  const file = path.join(dir, 'groundtruth.lock.json');
  writeLockfile(file, {
    zebra: { id: 'zebra', kind: 'local', at: '2026-01-01T00:00:00.000Z', meta: {} },
    alpha: { id: 'alpha', kind: 'git', at: '2026-01-01T00:00:00.000Z', meta: { sha: 'abc' } },
  });
  const raw = readFileSync(file, 'utf8');
  assert.ok(raw.indexOf('alpha') < raw.indexOf('zebra'), 'sources must be sorted for a stable diff');
  const lock = readLockfile(file);
  assert.equal(lock.version, 1);
  assert.equal(Object.keys(lock.sources).length, 2);
  clean();
});

test('a missing lockfile reads as empty rather than throwing', () => {
  const lock = readLockfile(path.join(tmpdir(), 'gt-no-such-lock.json'));
  assert.deepEqual(lock.sources, {});
});

test('comparePins names what moved, what arrived and what left', () => {
  const before = { a: { meta: { sha: '111' } }, gone: { meta: { sha: '999' } } };
  const after = { a: { meta: { sha: '222' } }, fresh: { meta: { sha: '333' } } };
  const diff = comparePins(before, after);
  assert.deepEqual(diff.moved, [{ id: 'a', from: '111', to: '222' }]);
  assert.deepEqual(diff.added, [{ id: 'fresh', to: '333' }]);
  assert.deepEqual(diff.removed, [{ id: 'gone', from: '999' }]);
  assert.equal(diff.changed, true);
});

test('identical pins compare as unchanged', () => {
  const pins = { a: { meta: { sha: '111' } } };
  assert.equal(comparePins(pins, pins).changed, false);
});

test('pin age reports how stale the oldest pin is', () => {
  const age = pinAge({ sources: { a: { at: new Date(Date.now() - 5 * 86400000).toISOString() } } });
  assert.equal(age.days, 5);
});

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

test('the registry binds paths and attaches the cache to whichever adapter wants it', () => {
  const { dir, clean } = scratch('registry');
  writeFileSync(path.join(dir, 'notes.md'), 'text\n', 'utf8');
  const cache = new Cache(path.join(dir, 'cache'));
  const registry = new AdapterRegistry(
    [local({ id: 'notes', root: '.' }), git({ id: 'repo', repo: 'o/n' })],
    { configDir: dir, cache },
  );
  assert.deepEqual(registry.ids, ['notes', 'repo']);
  assert.equal(registry.get('notes').root, dir);
  clean();
});

test('a bare URL routes to a declared web source and stays link-only without one', () => {
  const { dir, clean } = scratch('registry-url');
  const ref = parseRef('https://example.com/page');

  const withWeb = new AdapterRegistry([web({ id: 'web', snapshotDir: dir }).bind(dir)]);
  assert.equal(withWeb.forRef(ref)?.id, 'web');

  const withoutWeb = new AdapterRegistry([local({ id: 'notes', root: dir }).bind(dir)]);
  assert.equal(withoutWeb.forRef(ref), null);
  clean();
});

test('check restores pins from the lockfile and never calls pin on a git source', async () => {
  // The property that makes a routine run offline. A git pin needs the network, so
  // restoring from the lockfile is the only way check can avoid it.
  let pinned = 0;
  const fake = {
    id: 'repo',
    kind: 'git',
    owns: () => true,
    resolve: async () => ({ text: '' }),
    locate: () => ({ found: false }),
    permalink: () => null,
    describe: () => 'repo',
    pin: async () => {
      pinned += 1;
      return { id: 'repo', kind: 'git', meta: { sha: 'new' } };
    },
    usePin() {},
  };
  const registry = new AdapterRegistry([fake]);
  const lock = { repo: { id: 'repo', kind: 'git', meta: { sha: 'locked' } } };

  const { pins } = await registry.pinAll({ refresh: false, lock });
  assert.equal(pinned, 0, 'check must not pin over the network');
  assert.equal(pins.repo.meta.sha, 'locked');

  const refreshed = await registry.pinAll({ refresh: true, lock });
  assert.equal(pinned, 1);
  assert.equal(refreshed.pins.repo.meta.sha, 'new');
  assert.equal(refreshed.previous.repo.meta.sha, 'locked');
});
