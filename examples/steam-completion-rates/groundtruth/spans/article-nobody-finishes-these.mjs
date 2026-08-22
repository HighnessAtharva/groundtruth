// Span map for the completion-rate example.
//
// Two adapters on one document. A cell in a CSV and a passage on a cached page are
// addressed differently and verified by the same machinery.

export const document = 'article/nobody-finishes-these.md';
export const audited = '2026-08-22';

const TABLE = 'stats:completion-table.csv';
const CATALOG = 'stats:catalog/games.json';
const NOTES = 'web:https://example.com/notes/first-hour-retention';

/** A cell, by row selector and field. */
const cell = (name, field) => `${TABLE}#name=${encodeURIComponent(name)}&field=${field}`;

export const spans = [
  {
    match: 'Only 4.1 percent of owners earned the final achievement in Ashfall Reach',
    source: cell('Ashfall Reach', 'pct_earned_final_achievement'),
    quote: '4.1',
    verdict: 'VERIFIED',
  },
  {
    match: 'a 31-hour game',
    source: cell('Ashfall Reach', 'median_playtime_hours'),
    quote: '31.5',
    verdict: 'VERIFIED',
    note: 'Rounded down in the prose. The cell says 31.5.',
  },
  {
    match: 'It runs 28 hours and 24.6 percent of owners finished it',
    source: cell('The Quiet Fathom', 'pct_earned_final_achievement'),
    quote: '24.6',
    verdict: 'VERIFIED',
  },
  {
    match: 'Copperhead Junction is five and a half hours long with a 7.8 percent finish rate',
    source: cell('Copperhead Junction', 'pct_earned_final_achievement'),
    quote: '7.8',
    verdict: 'VERIFIED',
  },
  {
    match: 'Games under six hours finish at roughly triple the rate of games over thirty',
    source: TABLE,
    quote: 'name,wishlist_bucket,median_playtime_hours',
    verdict: 'INFERRED',
    derivation: 'Four rows sit under six hours with a mean final rate of 34.0. Five rows sit over thirty with a mean of 11.6. The ratio is 2.9, which the prose rounds to triple. The filters and the arithmetic are mine, the twelve numbers are the table.',
  },
  {
    match: 'Nine Lanterns puts 88.1 percent of owners past the second achievement and 52.3 percent through the whole game',
    source: cell('Nine Lanterns', 'pct_earned_second_achievement'),
    quote: '88.1',
    verdict: 'VERIFIED',
  },
  {
    match: 'its systems tutorial runs 90 minutes',
    source: cell('Ashfall Reach', 'note'),
    quote: 'systems tutorial runs 90 minutes',
    verdict: 'VERIFIED',
  },
  {
    // The catalog says this game has a tutorial. The article says it does not.
    // The tool has both records and refuses to pick.
    match: 'Harrow Line has no tutorial and its first fight starts at four minutes',
    source: `${CATALOG}#path=1.has_tutorial`,
    quote: 'true',
    verdict: 'CONTRADICTED',
    note: 'catalog/games.json records has_tutorial as true for Harrow Line, while completion-table.csv notes "no tutorial, first fight at 4 minutes". The two source records disagree with each other, so the article cannot be right by accident. Reconcile the records first.',
  },
  {
    // Verified against the pinned capture. The newer capture withdraws it, so the
    // tool derives STALE with both dates.
    match: 'The share of owners who earn the second achievement is the strongest single predictor of completion in this sample',
    source: NOTES,
    quote: 'the strongest single predictor of completion was the share of owners who earned the second achievement',
    verdict: 'VERIFIED',
    note: 'Cited from the capture taken on 2026-03-14.',
  },
  {
    // The chart's own label says twelve. The prose says ten.
    match: 'Completion falls off a cliff past the ten hour mark',
    source: TABLE,
    quote: 'median_playtime_hours',
    verdict: 'FIGURE',
    note: 'Read off the scatter plot rather than computed. The plot does not actually show a cliff, which is why the sentence above it is the weakest in the piece.',
  },
  {
    match: 'Players abandon most games in the first twenty minutes',
    source: null,
    quote: null,
    verdict: 'UNSOURCED',
    note: 'A sweeping claim about all players, in a piece about twelve invented titles. Cut it.',
  },
];
