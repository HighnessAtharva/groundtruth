// The neutral preset. Ships on by default.
//
// Every threshold here is a value, not a constant buried in a scorer, so a
// project changes one number without forking anything. The calibration notes
// that justify each number live on the rules and are printed by
// `groundtruth explain <rule>`.
//
// Nothing in this file is opinionated about house style. There is no banned-word
// list and no punctuation ban, because a tool that fails a video-game write-up
// on the word "exciting" reads as broken to a stranger. Those live in
// `presets/atharva.mjs` and are opt-in.

export const readability = {
  // Sentences shorter than this are never flagged, whatever they score.
  minWords: 9,

  // Score bands. `tough` is the amber floor, `hard` is the red one.
  //
  // tough was 10 in the harness this came from and moved to 8, because at 10 the
  // checker passed sentences a careful reader still called too complicated. A
  // compound sentence carrying a second independent clause and a list is exactly
  // the shape worth splitting, and it scored 8.4.
  tough: 8,
  hard: 18,

  // Words a sentence gets before length starts costing it.
  wordBudget: 22,

  // Jargon density means nothing until there is a sentence to be dense. Below
  // this word count, one long word is a ninth of the sentence and the ratio says
  // more about the syllable heuristic than about the prose.
  jargonMinWords: 14,
  jargonRatio: 0.18,

  costs: {
    overBudget: 1.4,
    clause: 3.5,
    passive: 6,
    jargon: 60,
    nominalization: 2.5,
    filler: 2.5,
    paren: 2,
    fused: 4.5,
    frontLoaded: 3.5,
    preamble: 4,
  },

  // An enumeration is one clause, not N. Detection is deliberately narrow.
  series: { minItems: 3, maxItemWords: 4 },

  // Words that legitimately open a sentence in lower case. Without these, a
  // sentence break before "npx runs it." is invisible and the splitter glues two
  // sentences into one 40-word monster that gets flagged for length it does not
  // have. Add your own product names here.
  lowerOpeners: ['npx', 'npm', 'yarn', 'pnpm', 'git', 'iOS', 'macOS', 'eBay', 'iPhone'],

  abbreviations: [
    'e.g', 'i.e', 'etc', 'vs', 'no', 'fig', 'approx', 'inc', 'ltd', 'co', 'dr',
    'mr', 'mrs', 'ms', 'st', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug',
    'sep', 'sept', 'oct', 'nov', 'dec', 'al', 'ca', 'cf', 'ibid', 'op',
  ],
};

export const images = {
  requireAlt: true,
  requireFileExists: true,
  // Alt text that names the file type instead of describing the picture.
  genericAlt: /^(image|screenshot|figure|diagram|chart|graph|photo|picture|img|untitled)\s*\d*$/i,
  minAltWords: 4,
  placeholderPrefixes: [],
  placeholderMinAltWords: 8,
  countConflict: true,
  // Text checks cannot read pixels. Saying so once per document is honest and
  // keeps a human in the loop on anything the tool structurally cannot see.
  alwaysAdviseHumanPass: true,
};

export const style = {
  bannedWords: [],
  bannedPhrases: [],
  punctuation: {},
};

export const seo = null; // see presets/longform.mjs and presets/shortform.mjs

export default { readability, images, style, seo };
