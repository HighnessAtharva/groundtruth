// The SEO and AEO check table.
//
// One table feeds the gate, the report panel, the JSON output and the generated
// rule reference. The `mechanical` column is the whole governing policy, taken
// from the harness this was extracted from and stated there as:
//
//   "Gate what is mechanical, review what is editorial, and never chase a metric
//    that has no right answer. Does this check have exactly one right answer a
//    script can compute? If yes it becomes a blocking gate and no human ever
//    looks at it again. If no it stays advisory and a person decides."
//
// Two entries deserve their reasoning spelled out, because they look gateable and
// are not. Keyword density has no correct value, and gating it makes writers pad
// prose to hit a percentage. Body length has no correct value either, and padding
// an article to clear a floor makes the page worse while the gate still passes.

export const GROUPS = [
  { id: 'basic', label: 'Primary keyword' },
  { id: 'additional', label: 'Keyword reach' },
  { id: 'snippet', label: 'Search snippet' },
  { id: 'headings', label: 'Heading structure' },
  { id: 'aeo', label: 'Answer engine' },
  { id: 'media', label: 'Links and media' },
];

/**
 * Every check. `id` is the check id inside a group, and the rule id is
 * `seo.<id>`, which is what a severity override and `explain` both name.
 */
export const CHECKS = [
  // ── Primary keyword. Four placements and no more. ────────────────────────
  {
    id: 'kw-title', group: 'basic', label: 'Keyword in title', mechanical: true,
    explain: 'The primary keyword must appear in the title. Matching is "all words present, in order", not an exact string, so a title reading "Why is my model slow?" still counts for the keyword "model slow".',
  },
  {
    id: 'kw-meta', group: 'basic', label: 'Keyword in meta description', mechanical: true,
    explain: 'The meta description is the second thing a searcher reads. The keyword belongs in it.',
  },
  {
    id: 'kw-opening', group: 'basic', label: 'Keyword in the opening', mechanical: true,
    explain: 'An answer engine lifts the passage before the first H2. If the keyword is not there, the page is not answering the question it targets.',
  },
  {
    id: 'kw-h2', group: 'basic', label: 'Keyword in at least one H2', mechanical: true,
    explain: 'One H2 carrying the keyword gives the page a passage a crawler can attribute to it. More than one is not better.',
  },
  {
    id: 'kw-density', group: 'basic', label: 'Keyword density', mechanical: false,
    explain: 'Phrase coverage across prose, headings and the FAQ. Advisory and permanently ungateable: density has no correct value, and gating it makes writers pad prose to hit a percentage.',
    calibration: 'Measured as hits times phrase length over total words, not as an occurrence count. One occurrence of a six-word phrase puts six words on the page and one occurrence of a two-word phrase puts two, so a raw count is not comparable across keywords.',
  },

  // ── Keyword reach ────────────────────────────────────────────────────────
  {
    id: 'sec-count', group: 'additional', label: 'Secondary keywords', mechanical: false,
    explain: 'How many secondary keywords the document declares. The right number depends on the piece, so this never blocks.',
  },
  {
    id: 'sec-reach', group: 'additional', label: 'Secondary keyword coverage', mechanical: false,
    explain: 'What share of each secondary keyword actually appears. Advisory, because working a phrase in is an editorial call.',
  },

  // ── Search snippet ───────────────────────────────────────────────────────
  {
    id: 'len-title', group: 'snippet', label: 'Title length', mechanical: true,
    explain: 'A title over the cap is truncated in the results page, so the reader never sees the end of it. One right answer, so it blocks.',
  },
  {
    id: 'len-seo-title', group: 'snippet', label: 'SEO title length', mechanical: true,
    explain: 'The SEO title has a tighter cap than the on-page title, because the results page truncates sooner than the article header does.',
  },
  {
    id: 'len-meta', group: 'snippet', label: 'Meta description length', mechanical: true,
    explain: 'Under the floor the snippet reads thin. Over the cap it gets cut mid-sentence. Both have one right answer.',
  },
  {
    id: 'len-slug', group: 'snippet', label: 'Slug length', mechanical: true,
    explain: 'A long slug truncates in the results page and in a shared link.',
  },
  {
    id: 'slug-words', group: 'snippet', label: 'Slug word count', mechanical: true,
    explain: 'Every filler word in a slug dilutes the words that matter.',
  },
  {
    id: 'canonical', group: 'snippet', label: 'Canonical URL', mechanical: true,
    explain: 'Without a canonical URL, a page reachable at two paths splits its own authority.',
  },
  {
    id: 'updated', group: 'snippet', label: 'Updated date', mechanical: true,
    explain: 'A sitemap reads the updated date for lastmod. Without it, a refreshed page looks unchanged to a crawler.',
  },
  {
    id: 'body-cap', group: 'snippet', label: 'Body length cap', mechanical: true,
    explain: 'A hard ceiling on word count. Over it, the page is two articles wearing one URL.',
  },
  {
    id: 'body-floor', group: 'snippet', label: 'Body length floor', mechanical: false,
    explain: 'Under the floor the page is probably thin. Advisory on purpose: padding an article to clear a word count makes the page worse and the gate would still pass.',
  },

  // ── Heading structure ────────────────────────────────────────────────────
  {
    id: 'h1-single', group: 'headings', label: 'Exactly one H1', mechanical: true,
    explain: 'Two H1s give a crawler two candidate titles for one page. Zero gives it none.',
  },
  {
    id: 'h2-count', group: 'headings', label: 'H2 count', mechanical: false,
    explain: 'How many H2s the document carries. The right number depends on the shape of the piece, so this never blocks.',
  },
  {
    id: 'h2-shape', group: 'headings', label: 'H2 length', mechanical: false,
    explain: 'A one-word H2 is a label and a fifteen-word H2 is a sentence. Neither reads as an answer a crawler can lift, but where the line sits is editorial.',
  },
  {
    id: 'h2-colon', group: 'headings', label: 'No colons in H2', mechanical: true,
    explain: 'A colon in a heading splits it into a label and a subtitle, and an answer engine lifts the label. Write the answer instead.',
  },
  {
    id: 'h2-duplicate', group: 'headings', label: 'No duplicate H2', mechanical: true,
    explain: 'Two identical headings give a crawler two passages with the same anchor text and no way to tell them apart.',
  },
  {
    id: 'heading-skip', group: 'headings', label: 'No heading depth skips', mechanical: true,
    explain: 'Jumping from H2 to H4 breaks the outline a crawler and a screen reader both build from the heading levels.',
  },
  {
    id: 'h2-vague', group: 'headings', label: 'No vague H2', mechanical: true,
    explain: 'A heading reading "Conclusion" or "Why it matters" carries no query. It is a section label from a school essay, and an answer engine cannot match a question to it.',
  },

  // ── Answer engine ────────────────────────────────────────────────────────
  {
    id: 'aeo-answer-first', group: 'aeo', label: 'Answer before the first H2', mechanical: true,
    explain: 'A page whose first H2 comes before any prose has no passage to lift. The opening is the only slot an answer engine reliably reads.',
  },
  {
    id: 'aeo-preamble', group: 'aeo', label: 'Opening is not a preamble', mechanical: true,
    explain: 'An opening that starts "In this article we will" describes the page instead of answering the question. That is the single most common reason a page with the right keywords never gets quoted.',
  },
  {
    id: 'faq-present', group: 'aeo', label: 'FAQ block present', mechanical: true,
    explain: 'The FAQ block is what FAQPage structured data is generated from. Without it the page ships no question and answer pairs.',
  },
  {
    id: 'faq-count', group: 'aeo', label: 'FAQ pair count', mechanical: false,
    explain: 'How many question and answer pairs the FAQ carries. The right number depends on the piece.',
  },
  {
    id: 'faq-answer-length', group: 'aeo', label: 'FAQ answer length', mechanical: false,
    explain: 'A one-line answer is not liftable and a three-paragraph answer is an article. Advisory, because the useful length depends on the question.',
  },
  {
    id: 'fence-language', group: 'aeo', label: 'Fenced code has a language', mechanical: true,
    explain: 'An untagged code fence is skipped by search and answer engines and cannot be syntax highlighted. One right answer, so it blocks.',
  },
  {
    id: 'aeo-question-h2', group: 'aeo', label: 'Question-shaped H2s', mechanical: false,
    explain: 'How many H2s are phrased as a question a reader would actually type. Advisory, because a declarative answer heading works too.',
  },
  {
    id: 'aeo-token-budget', group: 'aeo', label: 'Crawl budget', mechanical: false,
    explain: 'Roughly how many words an agent has to read to finish the page. Advisory, because the right size depends on what the page is for.',
  },

  // ── Links and media ──────────────────────────────────────────────────────
  {
    id: 'img-count', group: 'media', label: 'Images present', mechanical: false,
    explain: 'A long page with no figure is a wall of text. How many pictures it needs is editorial.',
  },
  {
    id: 'table-present', group: 'media', label: 'Real tables, not screenshots', mechanical: false,
    explain: 'A comparison rendered as a table can be lifted. The same comparison as a screenshot cannot be read at all.',
  },
  {
    id: 'links-internal', group: 'media', label: 'Internal links', mechanical: false,
    explain: 'A page with no internal links is an orphan, and passage authority does not compound across a set of pages that do not point at each other.',
  },
  {
    id: 'links-external', group: 'media', label: 'External links', mechanical: false,
    explain: 'Outbound links to a source are how a reader checks you. Advisory, because how many a page needs depends on how many claims it makes.',
  },
];

export const CHECK_BY_ID = new Map(CHECKS.map((spec) => [spec.id, spec]));

export const MECHANICAL_IDS = new Set(CHECKS.filter((spec) => spec.mechanical).map((spec) => spec.id));
