import test from 'node:test';
import assert from 'node:assert/strict';
import { makeScorer, scoreSentence, SHAPE } from '../src/modules/readability/score.mjs';
import { findSeries } from '../src/modules/readability/series.mjs';
import { makeSplitter, sentencesOf, syllables } from '../src/modules/readability/sentences.mjs';

const scorer = makeScorer();

test('an enumeration is one clause, not twelve', () => {
  // The calibration case. 31 of 31 sentences rated HARD across a 108-document
  // corpus were enumerations, and none was a defect. This one scored 38 before
  // findSeries existed.
  const sentence =
    'It reaches 13 platforms through native drivers: Snowflake, Databricks, BigQuery, Redshift, Postgres, DuckDB, Trino, ClickHouse, MongoDB, MySQL, SQL Server, Oracle and SQLite.';
  const series = findSeries(sentence);
  assert.ok(series.commas >= 8, `expected the series to absorb most commas, got ${series.commas}`);
  assert.equal(scorer.score(sentence), null, 'a correct enumeration must not be flagged');
});

test('a real run-on with stacked clauses is still caught', () => {
  const sentence =
    'It waits until no runs are in flight, then applies the new spec, and logs both outcomes to the audit table before the scheduler picks up the next batch of work.';
  const result = scorer.score(sentence);
  assert.ok(result, 'expected a finding');
  assert.ok(result.score >= 8, `expected at least the amber floor, got ${result.score}`);
});

test('the amber floor sits low enough to catch a compound sentence with a list', () => {
  // At a threshold of 10 this scored 8.4 and passed. The floor moved to 8
  // precisely so this shape gets caught.
  const sentence =
    'The other half is the cache layer, and Redis now splits your storage bill by request, user, and region on the same install.';
  const result = scorer.score(sentence);
  assert.ok(result, 'a second independent clause plus a list should not pass');
});

test('attributive participles are not passive voice', () => {
  for (const sentence of [
    'These are fixed settings that every project inherits from the parent workspace configuration.',
    'The warehouse is a shared pool of compute that every team in the org draws from.',
  ]) {
    const result = scorer.score(sentence);
    const reasons = result ? result.reasons.join(' ') : '';
    assert.ok(!reasons.includes('passive'), `false passive on: ${sentence}`);
  }
});

test('a real passive is caught', () => {
  const sentence =
    'The migration was applied by the scheduler, and the rollback plan was never reviewed by anybody on the team.';
  const result = scorer.score(sentence);
  assert.ok(result, 'expected a finding');
  assert.ok(result.reasons.join(' ').includes('passive'), result.reasons.join(' '));
});

test('a clock is not a clause break', () => {
  const sentence = 'Daily at 09:00 UTC, every Monday at 09:00 UTC, or on the first of the month.';
  const result = scorer.score(sentence);
  const reasons = result ? result.reasons.join(' ') : '';
  assert.ok(!reasons.includes('clause breaks'), `phantom breaks on a clock: ${reasons}`);
});

test('a short sentence is never flagged, whatever it scores', () => {
  assert.equal(scorer.score('That is basically it.'), null);
});

test('an unclosed fragment is left alone rather than scored as half a sentence', () => {
  assert.equal(scorer.score('a fragment with plenty of words in it but no terminal punctuation'), null);
});

test('a list lead-in ending in a colon is a complete sentence', () => {
  const sentence = 'For the window you pick, the page gives you five separate things to look at:';
  const result = makeScorer({ tough: 3 }).score(sentence);
  assert.ok(result, 'a colon closes a sentence, so the front-loaded opener must be visible');
  assert.ok(result.reasons.some((reason) => reason.includes('subject arrives')), result.reasons.join(' '));
});

test('the shape predicates are testable on their own', () => {
  assert.equal(SHAPE.fused('The tiles refresh, and the daily chart redraws around them.'), true);
  assert.equal(SHAPE.fused('It shows the tiles, the daily chart, and all three tables.'), false);
  assert.equal(SHAPE.frontLoaded('For the window you pick, the page redraws.'), true);
  assert.equal(SHAPE.frontLoaded('So, the page redraws.'), false);
  assert.equal(SHAPE.preamble('That tells you the queue never drains.'), true);
  assert.equal(SHAPE.preamble('The queue never drains.'), false);
});

test('a participle right after an article is not a fused clause', () => {
  // "the walked" is not English, so after an article the head noun comes first.
  assert.equal(SHAPE.fused('a full audit trail, and a timestamped record of every decision behind both'), false);
});

test('a pronoun after a coordinator needs no inflected verb', () => {
  assert.equal(SHAPE.fused('The two halves run separately, and they combine at the end.'), true);
});

test('sentence splitting survives decimals, abbreviations and initials', () => {
  const text = 'It costs $6.4K per month. See e.g. the pricing page. A. Shah wrote it. Done.';
  const parts = sentencesOf(text).map((entry) => entry.text);
  assert.equal(parts.length, 4, JSON.stringify(parts));
  assert.equal(parts[0], 'It costs $6.4K per month.');
  assert.equal(parts[1], 'See e.g. the pricing page.');
});

test('a configured lowercase opener starts a new sentence', () => {
  const split = makeSplitter({ lowerOpeners: ['npx', 'dbt'] });
  const parts = sentencesOf('Install it first. npx runs the checker. dbt models run nightly.', split);
  assert.equal(parts.length, 3, JSON.stringify(parts.map((p) => p.text)));
});

test('without the opener list the same text glues into one sentence', () => {
  const split = makeSplitter({ lowerOpeners: [] });
  const parts = sentencesOf('Install it first. npx runs the checker.', split);
  assert.equal(parts.length, 1);
});

test('thresholds and costs come from the preset, not from constants', () => {
  const strict = makeScorer({ tough: 2, hard: 4, wordBudget: 8 });
  const relaxed = makeScorer({ tough: 200, hard: 400 });
  const sentence = 'The migration was applied by the scheduler before anybody was told about it.';
  assert.ok(strict.score(sentence), 'a strict preset should flag it');
  assert.equal(relaxed.score(sentence), null, 'a relaxed preset should not');
});

test('a single cost can be overridden without restating the preset', () => {
  const cheap = makeScorer({ costs: { passive: 0 } });
  const sentence =
    'The record was created by the importer, and the audit row was written by the same job, so nothing else touched it.';
  const base = scoreSentence(sentence);
  const patched = cheap.score(sentence);
  const baseScore = base ? base.score : 0;
  const patchedScore = patched ? patched.score : 0;
  assert.ok(patchedScore < baseScore, `expected the passive cost to drop: ${baseScore} -> ${patchedScore}`);
});

test('syllable counting is crude on purpose and never returns zero', () => {
  assert.equal(syllables('a'), 1);
  assert.equal(syllables('rhythm'), 1);
  assert.ok(syllables('configuration') >= 4);
});

test('the dominant reason is the fix that gets printed', () => {
  const sentence =
    'For the window you pick, the aggregation of every warehouse configuration is applied across the deployment, and the resulting utilization report is generated by the scheduler somewhere else.';
  const result = scorer.score(sentence);
  assert.ok(result);
  assert.equal(result.band, 'hard');
  assert.equal(result.fix, result.parts[0].fix);
  assert.ok(result.parts[0].weight >= result.parts[result.parts.length - 1].weight);
});

test('a function call is not a parenthetical aside', () => {
  // Found by running the scorer over this project's own docs, where a line of CSS
  // values was charged eight asides it does not have.
  const spec = 'Shared values: oklch(0.50 0.15 var(--h)) light, oklch(0.80 0.13 var(--h)) dark, and minmax(0, 68ch) for the column.';
  const result = scorer.score(spec);
  const reasons = result ? result.reasons.join(' ') : '';
  assert.ok(!reasons.includes('aside'), reasons);
});

test('a real aside is still counted', () => {
  const sentence = 'The queue drains slowly (about once a second) and the buffer fills (usually within a minute) after that.';
  const result = makeScorer({ tough: 3 }).score(sentence);
  assert.ok(result, 'expected a finding');
  assert.ok(result.reasons.some((reason) => reason.includes('asides in parentheses')), result.reasons.join('; '));
});
