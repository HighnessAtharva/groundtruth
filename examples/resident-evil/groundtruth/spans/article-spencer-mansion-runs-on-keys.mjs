// Span map for the Resident Evil example.
//
// Constants are the reason a span map is a module rather than a data file. Every
// claim below points at one of four records, and naming them once means a moved
// file is a one-line change instead of thirty.

export const document = 'article/spencer-mansion-runs-on-keys.md';
export const audited = '2026-08-22';

const SLOTS = 'notes:characters/inventory-slots.md';
const ARMOR = 'notes:items/armor-key.md';
const SWORD = 'notes:items/sword-key.md';
const SHIELD = 'notes:items/shield-key.md';
const LOCKPICK = 'notes:items/lockpick.md';
const RIBBON = 'notes:items/ink-ribbon.md';
const STUDY = 'notes:rooms/study.md';

export const spans = [
  {
    match: 'Jill carries eight inventory slots and Chris carries six',
    source: SLOTS,
    quote: 'Jill carries eight inventory slots.',
    verdict: 'VERIFIED',
    note: 'The Chris half is the next line of the same record.',
  },
  {
    match: 'A key takes one slot, exactly like a shotgun or a herb',
    source: SLOTS,
    quote: 'A key occupies one slot, exactly like a weapon or a herb.',
    verdict: 'VERIFIED',
  },
  {
    match: 'There are more locked doors on the first floor than a single character can open in one pass while still carrying a weapon, ammunition and something to heal with',
    source: 'notes:doors/door-1f-01.md',
    quote: 'Floor: 1F.',
    verdict: 'INFERRED',
    derivation: 'Five records under doors/ carry Floor: 1F. They need two distinct keys, which is two of six slots for Chris before a weapon, ammunition or a herb. The comparison is mine, the counts are the records.',
  },
  {
    match: 'The Sword Key opens six doors',
    source: SWORD,
    quote: 'The Sword Key opens six doors.',
    verdict: 'VERIFIED',
  },
  {
    // The article says three. Four door records name the Armor Key, and the item
    // record says four. The tool is not telling the author the writing is bad. It
    // is telling the author that their own notes disagree with their own sentence.
    match: 'The Armor Key opens three doors',
    source: ARMOR,
    quote: 'The Armor Key opens four doors.',
    verdict: 'CONTRADICTED',
    note: 'Four records under doors/ name the Armor Key as the opener: door-1f-02, door-1f-03, door-1f-05 and door-b1-01. Either the article is wrong or the note is. Open the game and decide.',
  },
  {
    match: 'The Shield Key opens three, two of them upstairs',
    source: SHIELD,
    quote: 'Two of the three sit on the second floor.',
    verdict: 'VERIFIED',
  },
  {
    match: 'the lockpick opens every Small Key drawer and is never consumed',
    source: LOCKPICK,
    quote: 'The lockpick opens every Small Key drawer.',
    verdict: 'VERIFIED',
  },
  {
    match: 'Ink Ribbons are the only save resource in the mansion',
    source: RIBBON,
    quote: 'Ink Ribbons are the only save resource in the mansion.',
    verdict: 'VERIFIED',
  },
  {
    match: 'the one in the study is the furthest point on the second floor',
    source: STUDY,
    quote: 'It is the furthest point from the main hall on 2F.',
    verdict: 'VERIFIED',
  },
  {
    // Nothing in the folder supports this. Either find a source or cut the
    // sentence. Marking it VERIFIED would be the one thing this tool exists to
    // stop.
    match: 'Most players finish a first run in about nine hours',
    source: null,
    quote: null,
    verdict: 'UNSOURCED',
    note: 'No measurement behind this. A completion-time aggregator would source it. Otherwise cut the number and keep the sentence about walking.',
  },
  {
    match: 'Shinji Mikami directed the 1996 original',
    source: 'https://en.wikipedia.org/wiki/Resident_Evil_(1996_video_game)',
    quote: 'Directed by Shinji Mikami.',
    verdict: 'EXTERNAL',
    note: 'A link-only citation. Nothing local to verify against, and the tool says so rather than pretending otherwise.',
  },
];
