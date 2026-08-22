// An opinionated house style. Opt in, never inherited.
//
// This is one person's rule set, shipped as a preset because it is a complete
// worked example of what an opinion looks like in this tool rather than because
// anybody else should adopt it. The neutral preset stays the default for exactly
// that reason: a tool that fails a video-game write-up on the word "exciting" reads
// as broken to a stranger.
//
//   import { atharva } from '@highnessatharva/groundtruth/presets';
//   profiles: { post: { style: { enabled: true, preset: atharva.style } } }
//
// Copy it, cut what you disagree with, and keep your own version in your repo. That
// is the intended use.

export const style = {
  // Words that mean nothing on their own. Most are not bad words, they are words
  // that get used instead of saying the thing.
  bannedWords: [
    'additionally', 'best-in-class', 'bustling', 'commendable', 'comprehensive',
    'cutting-edge', 'delve', 'demystify', 'elevate', 'embark', 'empower',
    'empowering', 'empowerment', 'empowers', 'ensure', 'ensures', 'ensuring',
    'ever-evolving', 'exciting', 'furthermore', 'game-changer', 'game-changing',
    'gamechanger', 'groundbreaking', 'holistic', 'leverage', 'leveraging',
    'meticulous', 'meticulously', 'moreover', 'multifaceted', 'nestled',
    'paradigm', 'pioneering', 'revolutionary', 'revolutionise', 'revolutionize',
    'robust', 'seamless', 'seamlessly', 'state-of-the-art', 'streamline',
    'streamlined', 'streamlining', 'supercharge', 'surpass', 'synergies',
    'synergy', 'tapestry', 'testament', 'trailblazing', 'underscoring',
    'unleash', 'unlock', 'unparalleled', 'utilization', 'utilize', 'utilizing',
    'world-class',
  ],

  // Phrases that announce rather than say. Most of them can be deleted with no
  // loss, which is the test for whether a phrase belongs on this list.
  bannedPhrases: [
    "it's important to note", 'it is important to note',
    "it's worth noting", 'it is worth noting',
    "in today's fast-paced", 'in the world of', 'in a world where',
    'i hope this helps', 'as an ai language model',
    'picture this', 'look no further', 'rest assured', 'without further ado',
    'buckle up', "let's dive in", 'lets dive in', 'delve into',
    'the bottom line is', 'needless to say', 'in conclusion', 'to summarize',
    'in order to', 'at this point in time', 'due to the fact that',
    'in the event that', 'at its core', 'great question', 'let me know if',
    'the future looks bright', 'exciting times', 'unveiling the power',
    "in today's world", 'new era', 'underscores the',
    'underscore the importance', 'the daily grind', 'hustle culture',
    'we believe', 'we think', 'end-to-end platform', 'end-to-end solution',
    'end-to-end visibility',
  ],

  // A dash and a semicolon both let a writer avoid deciding where a sentence ends.
  // Banning them forces the decision, which is the whole point.
  punctuation: {
    emDash: true,
    enDash: true,
    doubleHyphen: true,
    semicolon: true,
  },

  // Rhythmic fragments read as style for one paragraph and as tics for a page.
  requireFiniteVerb: true,
  maxParagraphSentences: 6,
};

export const readability = {
  // A slightly tighter budget than neutral, because this style prefers a period to
  // a comma and the budget is what pushes that.
  wordBudget: 20,
  tough: 8,
  hard: 16,
};

export default { style, readability };
