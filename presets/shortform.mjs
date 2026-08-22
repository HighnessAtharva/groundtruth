// SEO thresholds for a short piece: a product note, a changelog entry, a
// release highlight, a single-answer page.
//
// The tighter SEO title cap is not a style choice. A short page usually sits in a
// large set of sibling pages, and the results page truncates a title sooner when
// it is competing with its own siblings for the same query.

import { longform } from './longform.mjs';

export const shortform = {
  ...longform,

  seoTitleMax: 46,
  metaMax: 160,
  slugMax: 65,

  bodyWordsMin: 300,
  bodyWordsMax: 560,

  h2Min: 3,
  h2Max: 5,
  h2WordsMin: 3,
  h2WordsMax: 10,

  faqMin: 5,
  faqMax: 10,
  faqAnswerWordsMax: 90,

  secondaryMin: 4,
  secondaryMax: 6,

  internalLinksMin: 3,
  externalLinksMin: 0,

  // A short page repeats its keyword far more per word than a long one, and that
  // is correct rather than stuffing.
  densityMin: 1.5,
  densityMax: 10.0,

  tokenBudgetWords: 3000,
};

export default shortform;
