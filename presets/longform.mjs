// SEO thresholds for a long piece: a guide, a listicle, a deep explainer.
//
// A shape this size wants 8 to 14 H2s and an FAQ block. Running these limits over
// a 400-word product note would fail every page, which is why the two presets
// exist rather than one averaged set.

export const longform = {
  // Search snippet. Physics, so the same numbers everywhere.
  titleMax: 95,
  seoTitleMax: 60,
  metaMin: 110,
  metaMax: 165,
  slugMax: 75,
  slugWordsMax: 9,

  bodyWordsMin: 2000,
  bodyWordsMax: 3200,

  h2Min: 8,
  h2Max: 14,
  h2WordsMin: 3,
  h2WordsMax: 14,

  faqMin: 4,
  faqMax: 8,
  faqAnswerWordsMin: 25,
  faqAnswerWordsMax: 120,

  secondaryMin: 3,
  secondaryMax: 6,

  internalLinksMin: 2,
  externalLinksMin: 3,

  // Phrase coverage, not an occurrence count. See specs.mjs for why.
  densityMin: 0.5,
  densityMax: 2.5,

  // Coverage bands for a secondary keyword.
  hitStrong: 0.8,
  hitWeak: 0.5,

  // Roughly what an agent will read before it gives up on the page.
  tokenBudgetWords: 15000,

  faqHeading: /^frequently asked/i,
};

export default longform;
