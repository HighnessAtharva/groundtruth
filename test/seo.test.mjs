import test from 'node:test';
import assert from 'node:assert/strict';
import { Document } from '../src/core/document.mjs';
import { auditDocument, PREAMBLE, VAGUE_H2 } from '../src/modules/seo/audit.mjs';
import { phraseHits, keywordHit, placementCheck } from '../src/modules/seo/keyword.mjs';
import { CHECKS } from '../src/modules/seo/specs.mjs';
import { shortform } from '../presets/shortform.mjs';
import { clearRegistry, registerRule, assertSeverityOverrides } from '../src/core/rules.mjs';
import { rules as seoRules } from '../src/modules/seo/index.mjs';

function doc(source, profile = { seo: { enabled: true } }) {
  return new Document({
    absolutePath: 'C:/tmp/doc.md',
    relativePath: 'doc.md',
    source,
    profile,
    profileName: 'test',
  });
}

const CLEAN = [
  '---',
  'title: How to profile a slow query and read its execution plan',
  'seo_title: How to profile a slow query',
  'slug: profile-a-slow-query',
  'primary_keyword: profile a slow query',
  'secondary_keywords: [read an execution plan, why is my query slow, query plan basics, explain analyze]',
  'meta_description: Profile a slow query in one click and read the execution plan in plain English, without leaving the editor or learning a new syntax.',
  'canonical_url: https://example.com/profile-a-slow-query',
  'updated_date: 2026-08-22',
  '---',
  '',
  '# How to profile a slow query and read its execution plan',
  '',
  'To profile a slow query, run it once and open the plan. The tool reads the plan',
  'and tells you which step is doing the most work, in a sentence rather than a tree.',
  '',
  '## What does the execution plan tell you',
  '',
  'The plan names the tables to read, the join strategy, and the rows each step scans.',
  '',
  '```sql',
  'EXPLAIN ANALYZE SELECT 1;',
  '```',
  '',
  '## Why is my query slow in the first place',
  '',
  'Most slow queries scan more rows than they need. See [the guide](/guides/scans) and',
  'the [upstream docs](https://example.org/plans) for the two usual causes.',
  '',
  '## How do you profile a slow query without learning the syntax',
  '',
  'The panel writes the plan out as prose. Nothing here needs new syntax.',
  '',
  'Every step in the plan gets one line of English. The line names the table the',
  'step touches, the number of rows it expects, and the number it actually read.',
  'When those two numbers disagree by more than an order of magnitude, the panel',
  'marks the step and says which statistic is stale. That is almost always the',
  'real answer, and it is the one thing a raw plan tree makes hardest to see.',
  '',
  'The panel also remembers the last twenty plans you opened, so a query that got',
  'slower over a week shows its own history rather than a single snapshot. Nothing',
  'is uploaded anywhere. The history lives in the same local cache the editor',
  'already keeps for its own indexes, and clearing that cache clears this too.',
  '',
  '| Step | Rows |',
  '| --- | ---: |',
  '| Scan | 1200 |',
  '',
  '![a query plan panel showing a sequential scan as the slowest step](/img/plan.png)',
  '',
  '### Frequently asked',
  '',
  '**Does profiling change the query?** No. The profiler runs the query once and reads the plan the engine already produced, so the results you get back are exactly the results the query returns normally.',
  '',
  '**What if the plan is huge?** The panel collapses every branch except the slowest one, so a plan with sixty steps still opens on the step that matters most to you right now.',
  '',
  '**Is this the same as a semaphore?** No, and the two are not related at all, though people confuse them because both involve waiting for something that is currently busy.',
  '',
  '**Can I profile a query I did not write?** Yes. Paste it into the editor and profile it there, exactly as you would with a query from your own project files.',
  '',
].join('\n');

test('a clean document passes every mechanical check', () => {
  const audit = auditDocument(doc(CLEAN), { preset: shortform });
  const failing = audit.checks.filter((entry) => entry.mechanical && entry.status === 'fail');
  assert.deepEqual(
    failing.map((entry) => `${entry.id}: ${entry.detail}`),
    [],
  );
});

test('the four keyword placements are each checked separately', () => {
  const audit = auditDocument(doc(CLEAN), { preset: shortform });
  for (const id of ['kw-title', 'kw-meta', 'kw-opening', 'kw-h2']) {
    const entry = audit.checks.find((check) => check.id === id);
    assert.equal(entry.status, 'pass', `${id}: ${entry.detail}`);
  }
});

test('keyword matching is all words in order, not an exact string', () => {
  // A crawler reads "Why is my query slow?" as targeting "query slow". An
  // exact-string gate would fail it for the word "is".
  assert.equal(placementCheck('Why is my query slow?', 'query slow').hit, true);
  assert.equal(placementCheck('Why is my query slow?', 'query fast').hit, false);
});

test('phrase hits tolerate a stop-word gap mid-phrase but never open on one', () => {
  assert.equal(phraseHits('cost optimization in Snowflake is easy', 'Snowflake cost optimization'), 0);
  assert.equal(phraseHits('Snowflake cost optimization is easy', 'Snowflake cost optimization'), 1);
  assert.equal(phraseHits('the query plan for the slow query', 'query plan'), 1);
});

test('a plural keyword still matches its singular in prose', () => {
  // `stem` is asymmetric on -es, so "alternatives" and "alternative" needed a
  // soft compare or the coverage read zero.
  assert.equal(phraseHits('which alternative covers the most platforms', 'alternatives'), 1);
});

test('keywordHit names the words that are missing, not their stems', () => {
  const result = keywordHit('a page about profiling', 'slow query analysis');
  assert.ok(result.missing.includes('analysis'), JSON.stringify(result.missing));
  assert.ok(!result.missing.includes('analysi'), 'reporting the stem told a reviewer to add "analysi"');
});

test('an opening that announces the page is caught, one that answers is not', () => {
  assert.equal(PREAMBLE.test('In this article we will look at profiling.'), true);
  assert.equal(PREAMBLE.test("Let's dive into the plan."), true);
  assert.equal(PREAMBLE.test('To profile a slow query, run it once and open the plan.'), false);
});

test('the H1 does not close the opening', () => {
  // Treating a leading H1 as a section boundary measured every opening as empty,
  // which made answer-first pass on a page that opens with a preamble.
  const source = CLEAN.replace(
    'To profile a slow query, run it once and open the plan.',
    'In this article we will look at profiling a slow query.',
  );
  const audit = auditDocument(doc(source), { preset: shortform });
  assert.equal(audit.checks.find((check) => check.id === 'aeo-answer-first').status, 'pass');
  assert.equal(audit.checks.find((check) => check.id === 'aeo-preamble').status, 'fail');
});

test('vague headings are caught and real answer headings are not', () => {
  assert.equal(VAGUE_H2.test('Conclusion'), true);
  assert.equal(VAGUE_H2.test('Key takeaways'), true);
  assert.equal(VAGUE_H2.test('Why it matters'), true);
  assert.equal(VAGUE_H2.test('Why is my query slow in the first place'), false);
  assert.equal(VAGUE_H2.test('What does the execution plan tell you'), false);
});

test('an untagged code fence fails and a tagged one passes', () => {
  const untagged = CLEAN.replace('```sql', '```');
  assert.equal(
    auditDocument(doc(untagged), { preset: shortform }).checks.find((c) => c.id === 'fence-language').status,
    'fail',
  );
  assert.equal(
    auditDocument(doc(CLEAN), { preset: shortform }).checks.find((c) => c.id === 'fence-language').status,
    'pass',
  );
});

test('the FAQ block is found and its pairs are counted', () => {
  const audit = auditDocument(doc(CLEAN), { preset: shortform });
  assert.equal(audit.checks.find((check) => check.id === 'faq-present').status, 'pass');
  assert.equal(audit.stats.faqs, 4);
});

test('a colon in a heading fails', () => {
  const source = CLEAN.replace('## What does the execution plan tell you', '## The plan: what it tells you');
  const audit = auditDocument(doc(source), { preset: shortform });
  assert.equal(audit.checks.find((check) => check.id === 'h2-colon').status, 'fail');
});

test('a heading depth skip fails', () => {
  const source = CLEAN.replace('## What does the execution plan tell you', '#### What does the execution plan tell you');
  const audit = auditDocument(doc(source), { preset: shortform });
  assert.equal(audit.checks.find((check) => check.id === 'heading-skip').status, 'fail');
});

test('two identical headings fail', () => {
  const source = CLEAN.replace('## Why is my query slow in the first place', '## What does the execution plan tell you');
  const audit = auditDocument(doc(source), { preset: shortform });
  assert.equal(audit.checks.find((check) => check.id === 'h2-duplicate').status, 'fail');
});

test('the two presets disagree, which is why there are two', () => {
  const long = auditDocument(doc(CLEAN));
  const short = auditDocument(doc(CLEAN), { preset: shortform });
  assert.equal(short.checks.find((c) => c.id === 'body-floor').status, 'pass');
  assert.equal(long.checks.find((c) => c.id === 'body-floor').status, 'warn');
});

test('a single threshold can be overridden without restating the preset', () => {
  const audit = auditDocument(doc(CLEAN), { preset: shortform, overrides: { slugWordsMax: 2 } });
  assert.equal(audit.checks.find((check) => check.id === 'slug-words').status, 'fail');
});

test('the score is a display number and never a gate', () => {
  const audit = auditDocument(doc(CLEAN), { preset: shortform });
  assert.ok(audit.score >= 0 && audit.score <= 100);
  assert.ok(['good', 'ok', 'poor'].includes(audit.band));
  assert.ok(!CHECKS.some((spec) => spec.id === 'score'), 'the score must not be a check, or config could gate it');
});

test('density and body length are permanently advisory', () => {
  for (const id of ['kw-density', 'body-floor', 'sec-count', 'sec-reach']) {
    const spec = CHECKS.find((entry) => entry.id === id);
    assert.equal(spec.mechanical, false, `${id} must stay advisory`);
  }
});

test('config refuses to gate an advisory rule and says why', () => {
  clearRegistry();
  for (const rule of seoRules) registerRule(rule);

  assert.throws(
    () => assertSeverityOverrides({ 'seo.kw-density': 'error' }),
    (error) => {
      assert.match(error.message, /advisory/);
      assert.match(error.message, /allowAdvisoryGates/);
      return true;
    },
  );

  // A mechanical rule may be gated, and an explicit opt-out still works.
  assert.doesNotThrow(() => assertSeverityOverrides({ 'seo.fence-language': 'error' }));
  assert.doesNotThrow(() =>
    assertSeverityOverrides({ 'seo.kw-density': 'error' }, { allowAdvisoryGates: true }));
  clearRegistry();
});

test('a severity override naming a rule that does not exist is refused', () => {
  clearRegistry();
  for (const rule of seoRules) registerRule(rule);
  assert.throws(() => assertSeverityOverrides({ 'seo.made-up': 'warn' }), /does not exist/);
  clearRegistry();
});

test('every check in the table has a rule and every rule has a check', () => {
  const ruleIds = new Set(seoRules.map((rule) => rule.id));
  for (const spec of CHECKS) {
    assert.ok(ruleIds.has(`seo.${spec.id}`), `no rule for check ${spec.id}`);
  }
  assert.equal(ruleIds.size, CHECKS.length);
});
