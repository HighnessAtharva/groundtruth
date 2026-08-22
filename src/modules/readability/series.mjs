// An enumeration is one clause, not N.
//
// This was the single largest false-positive class in the corpus this scorer was
// calibrated on: 31 of the 31 sentences rated HARD across 108 documents were
// enumerations, and not one of them was a defect. The worked example scored 38 on
// twelve "stacked clauses":
//
//   "It reaches 13+ data platforms through native drivers: Snowflake,
//    Databricks, BigQuery, Redshift, Postgres, DuckDB, Trino, ClickHouse,
//    MongoDB, MySQL, SQL Server, Oracle and SQLite."
//
// Those commas are not clauses a reader holds open. They are one list read in one
// go. Charging a run-on and an enumeration the same way made the loudest band of
// the whole scorer point exclusively at correct prose.
//
// Detection is deliberately narrow, so "the tiles, the daily chart, and all three
// tables" collapses while "It waits until no runs are in flight, then applies the
// new spec, and logs both" does not.

import { HAS_VERB } from './signals.mjs';

const NONE = { commas: 0, itemWords: 0, outside: null };

/**
 * How many of a sentence's commas belong to an enumeration rather than a clause
 * boundary.
 *
 * @returns {{ commas: number, itemWords: number, outside: string|null }}
 *   `commas` is the count to subtract, leaving the series costing exactly one
 *   break. `itemWords` is the word count inside the series, which every
 *   vocabulary signal skips. `outside` is the sentence with the series removed.
 */
export function findSeries(text, settings = {}) {
  const maxItemWords = settings.maxItemWords ?? 4;
  const minItems = settings.minItems ?? 3;
  const hasVerb = settings.hasVerb || HAS_VERB;

  const segments = String(text).split(',');
  // Three items needs two commas, so below four segments it is not a list.
  if (segments.length < minItems + 1) return NONE;

  const clean = (segment) => segment.replace(/^\s*(and|or)\s+/i, '').trim().replace(/[.!?:;]+$/, '');
  const isItem = (segment) => {
    const value = clean(segment);
    if (!value) return false;
    const count = (value.match(/[A-Za-z0-9][A-Za-z0-9'’.-]*/g) || []).length;
    return count >= 1 && count <= maxItemWords && !hasVerb.test(value);
  };

  let best = 0;
  let bestEnd = 0;
  let run = 0;
  for (let i = 1; i < segments.length; i += 1) {
    if (isItem(segments[i]) && (isItem(segments[i - 1]) || i === 1)) {
      run += 1;
      if (run > best) {
        best = run;
        bestEnd = i;
      }
    } else {
      run = 0;
    }
  }

  if (best < minItems - 1) return NONE;

  const start = bestEnd - best;
  const items = segments.slice(start, bestEnd + 1);
  const itemWords = (items.join(' ').match(/[A-Za-z][A-Za-z'’-]*/g) || []).length;

  // `outside` is rebuilt by segment index, never by string matching. Rebuilding
  // the series text and splitting on it silently failed, because normalizing the
  // items changes the whitespace and drops the "and", so nothing matched and
  // every vocabulary signal still saw the whole list.
  const outside = [...segments.slice(0, start), ...segments.slice(bestEnd + 1)].join(', ');

  // A run of N commas is N+1 items. Keep one comma's worth of cost so the list
  // still registers as a single break, and discount the rest.
  return { commas: best - 1, itemWords, outside };
}
