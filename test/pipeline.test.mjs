import test from 'node:test';
import assert from 'node:assert/strict';
import { Pipeline } from '../src/core/pipeline.mjs';

test('stages run in dependency order regardless of the order they were added', async () => {
  const seen = [];
  const pipeline = new Pipeline()
    .add({ id: 'report', needs: ['collect'], run: () => seen.push('report') })
    .add({ id: 'collect', needs: ['parse', 'seo'], run: () => seen.push('collect') })
    .add({ id: 'seo', needs: ['parse'], run: () => seen.push('seo') })
    .add({ id: 'parse', needs: [], run: () => seen.push('parse') });

  await pipeline.run({});
  assert.equal(seen[0], 'parse');
  assert.ok(seen.indexOf('seo') < seen.indexOf('collect'));
  assert.equal(seen[seen.length - 1], 'report');
});

test('truncating the run stops at the requested stage and skips the rest', async () => {
  const seen = [];
  const pipeline = new Pipeline()
    .add({ id: 'parse', needs: [], run: () => seen.push('parse') })
    .add({ id: 'collect', needs: ['parse'], run: () => seen.push('collect') })
    .add({ id: 'report', needs: ['collect'], run: () => seen.push('report') });

  await pipeline.run({}, { upTo: 'collect' });
  assert.deepEqual(seen, ['parse', 'collect']);
});

test('a cycle is named, not hung on', () => {
  const pipeline = new Pipeline()
    .add({ id: 'a', needs: ['b'], run: () => {} })
    .add({ id: 'b', needs: ['a'], run: () => {} });

  assert.throws(() => pipeline.order(), /pipeline cycle/);
});

test('a stage that writes what another stage reads is refused', () => {
  const pipeline = new Pipeline()
    .add({ id: 'generate', writes: ['.groundtruth/spans'], run: () => {} })
    .add({ id: 'resolve', reads: ['.groundtruth/spans'], run: () => {} });

  assert.throws(() => pipeline.assertDisjoint(), /A derived artifact used as an input/);
});

test('disjoint address spaces pass the guard', () => {
  const pipeline = new Pipeline()
    .add({ id: 'locate', writes: ['.groundtruth/cache'], reads: ['review/spans'], run: () => {} })
    .add({ id: 'report', writes: ['.groundtruth/report'], reads: ['review/spans'], run: () => {} });

  assert.doesNotThrow(() => pipeline.assertDisjoint());
});

test('reading an undeclared stage output throws instead of returning undefined', async () => {
  const pipeline = new Pipeline()
    .add({ id: 'parse', needs: [], run: () => 'parsed' })
    .add({ id: 'secret', needs: [], run: () => 'hidden' })
    .add({
      id: 'sneak',
      needs: ['parse'],
      run: (context, view) => view.get('secret'),
    });

  await assert.rejects(() => pipeline.run({}), /without declaring it in needs/);
});

test('a declared stage output is readable', async () => {
  const pipeline = new Pipeline()
    .add({ id: 'parse', needs: [], run: () => ({ blocks: 3 }) })
    .add({ id: 'use', needs: ['parse'], run: (context, view) => view.get('parse').blocks });

  const { outputs } = await pipeline.run({});
  assert.equal(outputs.get('use'), 3);
});
