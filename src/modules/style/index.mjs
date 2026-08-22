// The style module: banned words, banned phrases, punctuation bans, sentence caps.
//
// Off unless a project turns it on, and the shipped default is empty. A tool that
// fails a video-game write-up on the word "exciting" reads as broken to a stranger,
// so an opinion here has to be opted into rather than inherited.
//
// `presets/atharva.mjs` and `presets/ste.mjs` are the two opinions that ship. Both
// are complete and both are optional.

import { defineRule } from '../../core/rules.mjs';
import { runRules } from '../../core/engine.mjs';
import { makeScorer } from '../readability/score.mjs';

const scorer = makeScorer();

function settingsFor(profile) {
  const style = profile?.style || {};
  const preset = style.preset || {};
  const overrides = style.overrides || {};
  return {
    bannedWords: overrides.bannedWords ?? preset.bannedWords ?? [],
    bannedPhrases: overrides.bannedPhrases ?? preset.bannedPhrases ?? [],
    punctuation: { ...(preset.punctuation || {}), ...(overrides.punctuation || {}) },
    maxSentenceWords: overrides.maxSentenceWords ?? preset.maxSentenceWords ?? null,
    requireFiniteVerb: overrides.requireFiniteVerb ?? preset.requireFiniteVerb ?? false,
    maxParagraphSentences: overrides.maxParagraphSentences ?? preset.maxParagraphSentences ?? null,
    allowIn: overrides.allowIn ?? preset.allowIn ?? [],
  };
}

/** Reader text of the blocks this module scores, with quotations waived. */
function scored(doc) {
  return doc.query.prose();
}

const PUNCTUATION = {
  emDash: { pattern: /—/g, label: 'em dash', fix: 'Use a comma, a period, or rewrite the sentence.' },
  enDash: { pattern: /–/g, label: 'en dash', fix: 'Use a comma, a period, or rewrite the sentence.' },
  doubleHyphen: { pattern: /(?<=\S)--(?=\S)|\s--\s/g, label: 'double hyphen used as a dash', fix: 'Use a comma or a period.' },
  semicolon: { pattern: /;/g, label: 'semicolon', fix: 'Split it into two sentences.' },
};

// A finite-verb test, deliberately crude. Shared with the enumeration detector so
// "what counts as a verb" has one answer in the package.
const HAS_VERB = /\b(is|are|was|were|be|been|being|am|has|have|had|do|does|did|can|could|will|would|shall|should|may|might|must|gets?|got|goes|went|makes?|made|runs?|ran|reads?|writes?|returns?|means?|takes?|took|comes?|came|gives?|gave|sits?|sat|holds?|held|keeps?|kept|needs?|shows?|says?|said|puts?|opens?|closes?|adds?|uses?|works?|looks?|lets?|leaves?|starts?|stops?|turns?|calls?|finds?|found|knows?|knew|thinks?|thought|wants?|tells?|told|sees?|saw|feels?|felt|becomes?|became)\b/i;

export const rules = [
  defineRule({
    id: 'style.banned-word',
    module: 'style',
    mechanical: true,
    defaultSeverity: 'error',
    explain: 'A word on this project\'s banned list. The list ships empty, so this rule only ever fires on words a project chose to ban. Case-insensitive, whole-word, and waived inside a quotation because those are somebody else\'s words.',
    run({ doc, profile, finding }) {
      const settings = settingsFor(profile);
      if (!settings.bannedWords.length) return;
      const pattern = new RegExp(`\\b(${settings.bannedWords.map(escape).join('|')})\\b`, 'gi');

      for (const block of scored(doc)) {
        for (const run of block.inlines || []) {
          // Inline code is a name, not prose. Banning a word inside `utilize()`
          // would ask for a rename nobody can make.
          if (run.kind !== 'text' || !run.text) continue;
          for (const match of run.text.matchAll(pattern)) {
            finding({
              line: doc.lineAt(run.sourceStart),
              message: `banned word: "${match[1]}"`,
              excerpt: context(run.text, match.index),
              fix: { kind: 'rewrite', instruction: `Say what "${match[1]}" is standing in for.` },
            });
          }
        }
      }
    },
  }),

  defineRule({
    id: 'style.banned-phrase',
    module: 'style',
    mechanical: true,
    defaultSeverity: 'error',
    explain: 'A phrase on this project\'s banned list. Phrases are matched with flexible whitespace, so a line break inside one still counts.',
    run({ doc, profile, finding }) {
      const settings = settingsFor(profile);
      if (!settings.bannedPhrases.length) return;

      for (const block of scored(doc)) {
        const text = block.readerText;
        for (const phrase of settings.bannedPhrases) {
          const pattern = new RegExp(phrase.split(/\s+/).map(escape).join('\\s+'), 'gi');
          for (const match of text.matchAll(pattern)) {
            finding({
              line: doc.lineAt(offsetFor(block, match.index)),
              message: `banned phrase: "${match[0]}"`,
              excerpt: context(text, match.index, 90),
              fix: { kind: 'rewrite', instruction: 'Cut it. The sentence means the same thing without it.' },
            });
          }
        }
      }
    },
  }),

  defineRule({
    id: 'style.punctuation',
    module: 'style',
    mechanical: true,
    defaultSeverity: 'error',
    explain: 'A punctuation mark this project does not use. Configured per mark, so a project can ban the em dash and keep the semicolon. Code, both fenced and inline, is exempt.',
    run({ doc, profile, finding }) {
      const settings = settingsFor(profile);
      const active = Object.entries(PUNCTUATION).filter(([name]) => settings.punctuation[name] === true);
      if (!active.length) return;

      for (const block of scored(doc)) {
        for (const run of block.inlines || []) {
          if (run.kind !== 'text' || !run.text) continue;
          for (const [, spec] of active) {
            for (const match of run.text.matchAll(spec.pattern)) {
              finding({
                line: doc.lineAt(run.sourceStart),
                message: `${spec.label} in prose`,
                excerpt: context(run.text, match.index),
                fix: { kind: 'rewrite', instruction: spec.fix },
              });
            }
          }
        }
      }
    },
  }),

  defineRule({
    id: 'style.sentence-length',
    module: 'style',
    mechanical: true,
    defaultSeverity: 'warn',
    explain: 'A sentence over this project\'s hard word cap. Separate from the readability scorer, which weighs length against everything else. This is a cap, so it fires on length alone.',
    calibration: 'Simplified Technical English puts the cap at 20 words for a descriptive sentence and 20 for a procedural step. A project that has adopted a standard wants the cap enforced rather than scored.',
    run({ doc, profile, finding }) {
      const settings = settingsFor(profile);
      if (!settings.maxSentenceWords) return;

      for (const block of scored(doc)) {
        for (const sentence of scorer.sentences(block.readerText)) {
          const words = (sentence.text.match(/[A-Za-z][A-Za-z'’-]*/g) || []).length;
          if (words <= settings.maxSentenceWords) continue;
          finding({
            line: doc.lineAt(offsetFor(block, sentence.start)),
            message: `${words} words, over the ${settings.maxSentenceWords}-word cap`,
            excerpt: sentence.text,
            fix: { kind: 'rewrite', instruction: 'Split it at the first natural break.' },
          });
        }
      }
    },
  }),

  defineRule({
    id: 'style.fragment',
    module: 'style',
    mechanical: false,
    defaultSeverity: 'warn',
    explain: 'A short sentence with no finite verb. The rhythmic fragment is a real style, and a project that has banned it wants it caught. Advisory because the verb test is crude and a heading, a caption or a bold label is legitimately verbless.',
    run({ doc, profile, finding }) {
      const settings = settingsFor(profile);
      if (!settings.requireFiniteVerb) return;

      for (const block of scored(doc)) {
        for (const sentence of scorer.sentences(block.readerText)) {
          const words = (sentence.text.match(/[A-Za-z][A-Za-z'’-]*/g) || []).length;
          if (words === 0 || words > 9) continue;
          if (HAS_VERB.test(sentence.text)) continue;
          finding({
            line: doc.lineAt(offsetFor(block, sentence.start)),
            message: `no finite verb: "${sentence.text}"`,
            fix: { kind: 'rewrite', instruction: 'Give it a verb, or fold it into the sentence beside it.' },
          });
        }
      }
    },
  }),

  defineRule({
    id: 'style.paragraph-length',
    module: 'style',
    mechanical: false,
    defaultSeverity: 'warn',
    explain: 'A paragraph over this project\'s sentence cap. Advisory, because where a paragraph should break is a judgement about the argument and not about arithmetic.',
    run({ doc, profile, finding }) {
      const settings = settingsFor(profile);
      if (!settings.maxParagraphSentences) return;

      for (const block of scored(doc)) {
        const count = scorer.sentences(block.readerText).length;
        if (count <= settings.maxParagraphSentences) continue;
        finding({
          line: doc.lineAt(block.offset),
          message: `${count} sentences in one paragraph, over the ${settings.maxParagraphSentences} cap`,
          fix: { kind: 'rewrite', instruction: 'Break it where the argument turns.' },
        });
      }
    },
  }),
];

function offsetFor(block, readerOffset) {
  for (const run of block.inlines || []) {
    if (readerOffset >= run.start && readerOffset <= run.end) {
      return run.sourceStart + (readerOffset - run.start);
    }
  }
  return block.offset;
}

function context(text, index, width = 60) {
  const start = Math.max(0, index - width / 2);
  return `…${text.slice(start, start + width).trim()}…`;
}

function escape(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const stages = [
  {
    id: 'style.run',
    needs: ['parse', 'config'],
    reads: [],
    writes: [],
    run: (context_, view) => runRules(rules, view.get('parse'), view.get('config'), 'style'),
  },
];

export default { id: 'style', rules, stages };
