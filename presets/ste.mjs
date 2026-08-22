// ASD-STE100 Simplified Technical English, the parts a checker can see.
//
// STE is a controlled language written for aircraft maintenance manuals and adopted
// widely since for any procedure a non-native reader has to follow under pressure.
// It is a real standard with a real dictionary, and this preset does not pretend to
// implement it. What it implements is the mechanical half: the sentence caps, the
// article requirement, and the constructions the standard forbids outright.
//
//   import { ste } from '@highnessatharva/groundtruth/presets';
//   profiles: { manual: { style: { enabled: true, preset: ste.style } } }
//
// What it cannot check is the approved-vocabulary rule, which is the heart of the
// standard. STE allows one meaning per word from a controlled dictionary, and
// deciding whether a word carries its approved sense needs a person. Anything
// claiming to enforce STE from a word list alone is overselling.

export const style = {
  // Writing rule 1.4: keep a descriptive sentence to 20 words, a procedural step
  // to 20, and one step to one action.
  maxSentenceWords: 20,

  // Writing rule 2.3 and 2.4: every sentence takes a verb, and a procedure is
  // written as a command.
  requireFiniteVerb: true,

  // Writing rule 6.3: keep a paragraph to six sentences, and one topic.
  maxParagraphSentences: 6,

  bannedPhrases: [
    // Rule 5.2, no double negatives.
    'not unlike', 'not uncommon', 'not unusual', 'not impossible',
    'fails to avoid', 'cannot be excluded',
    // Rule 3.2, no idiom carrying the argument.
    'a piece of cake', 'in a nutshell', 'the bottom line', 'at the end of the day',
    'hit the ground running', 'move the needle', 'circle back', 'touch base',
    'low-hanging fruit', 'boil the ocean',
    // Rule 1.5, no participial phrase where a clause is meant.
    'having said that', 'that being said',
  ],

  // STE has no opinion on the em dash, and a manual that uses one is not wrong.
  // Left off rather than assumed.
  punctuation: {},
};

export const readability = {
  // The 20-word cap is enforced by the style module. The scorer's budget sits just
  // under it so a sentence starts costing something before it becomes a violation.
  wordBudget: 18,
  tough: 7,
  hard: 14,
};

export default { style, readability };
