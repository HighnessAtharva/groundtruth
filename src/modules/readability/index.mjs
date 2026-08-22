// The readability module. Rules plus one pipeline stage.
//
// Every rule carries the calibration note that justifies it, so
// `groundtruth explain read.series` prints the reasoning instead of it sitting
// unreachable in a 500-line file.

import { defineRule } from '../../core/rules.mjs';
import { normalizeFinding } from '../../core/findings.mjs';
import { runRules } from '../../core/engine.mjs';
import { makeScorer, BAND_LABEL } from './score.mjs';
import { imageSettings, altFindings, missingFileFindings, numberConflictFindings, humanPassFinding } from './images.mjs';
import { dialectFindings } from './dialect.mjs';

const scorerCache = new WeakMap();

function scorerFor(profile) {
  const settings = profile?.readability || {};
  const key = settings;
  if (scorerCache.has(key)) return scorerCache.get(key);
  const scorer = makeScorer({
    ...(settings.preset || {}),
    ...(settings.overrides || {}),
  });
  scorerCache.set(key, scorer);
  return scorer;
}

const sentenceRule = (id, band) =>
  defineRule({
    id,
    module: 'readability',
    mechanical: true,
    defaultSeverity: band === 'hard' ? 'warn' : 'info',
    explain:
      band === 'hard'
        ? 'A sentence scoring at or above the hard threshold. Every signal that contributes is something a writer can fix by rewriting, which is why this is not a reading grade. Flesch-Kincaid is dominated by syllables per word, so on technical prose it flags every sentence containing "configuration" and stays quiet on a 40-word sentence of short words.'
        : 'A sentence scoring at or above the amber threshold. The threshold sits at 8 rather than 10 because at 10 a compound sentence carrying a second independent clause and a list scored 8.4 and passed, and that is exactly the shape worth splitting.',
    thresholds: { band },
    run({ doc, blocks, profile, finding }) {
      const scorer = scorerFor(profile);
      for (const block of blocks.prose()) {
        for (const sentence of scorer.sentences(block.readerText)) {
          const result = scorer.score(sentence.text);
          if (!result || result.band !== band) continue;
          finding({
            line: doc.lineAt(offsetFor(block, sentence.start)),
            message: `${BAND_LABEL[result.band]} (${result.score}): ${result.reasons.join(', ')}`,
            excerpt: sentence.text,
            data: { score: result.score, words: result.words, band: result.band, signals: result.parts.map((p) => p.signal) },
            fix: { kind: 'rewrite', instruction: result.fix, confidence: 'medium' },
          });
        }
      }
    },
  });

/** Map a character offset inside a block's reader text back to the source file. */
function offsetFor(block, readerOffset) {
  for (const run of block.inlines || []) {
    if (readerOffset >= run.start && readerOffset <= run.end) {
      return run.sourceStart + (readerOffset - run.start);
    }
  }
  return block.offset;
}

export const rules = [
  sentenceRule('read.hard', 'hard'),
  sentenceRule('read.tough', 'tough'),

  defineRule({
    id: 'read.series',
    module: 'readability',
    mechanical: true,
    defaultSeverity: 'off',
    explain:
      'Not a finding, a modifier. An enumeration of three or more short verbless items counts as one clause break, and its words are excluded from the jargon ratio. It is registered so `explain` can print the reasoning.',
    calibration:
      'Charging a run-on and an enumeration the same way made the loudest band of the scorer point exclusively at correct prose. Measured across 108 documents: 31 of 31 sentences rated HARD were enumerations, and not one was a defect. Detection: three or more comma-separated items, each at most four words, none carrying a finite verb.',
    run() {},
  }),

  defineRule({
    id: 'read.alt-missing',
    module: 'readability',
    mechanical: true,
    defaultSeverity: 'error',
    explain: 'An image with no alt text is invisible to a screen reader and to this tool. It is also the only description of the picture a reviewer has when the file has not been made yet.',
    run: imageRunner((doc, settings) => altFindings(doc, settings), 'read.alt-missing'),
  }),

  defineRule({
    id: 'read.alt-generic',
    module: 'readability',
    mechanical: true,
    defaultSeverity: 'error',
    explain: 'Alt text reading "chart" or "screenshot 2" names the file type instead of describing the picture, which helps nobody and tells a reviewer nothing about whether the picture is right.',
    run: imageRunner((doc, settings) => altFindings(doc, settings), 'read.alt-generic'),
  }),

  defineRule({
    id: 'read.alt-thin',
    module: 'readability',
    mechanical: false,
    defaultSeverity: 'warn',
    explain: 'Short alt text is usually a label rather than a description. Where the line sits is a judgement call, so this never blocks.',
    run: imageRunner((doc, settings) => altFindings(doc, settings), 'read.alt-thin'),
  }),

  defineRule({
    id: 'read.alt-thin-brief',
    module: 'readability',
    mechanical: true,
    defaultSeverity: 'error',
    explain: 'For a placeholder image the alt text is the brief for the picture nobody has drawn yet. Under the word floor there is not enough there to draw from.',
    run: imageRunner((doc, settings) => altFindings(doc, settings), 'read.alt-thin-brief'),
  }),

  defineRule({
    id: 'read.image-missing',
    module: 'readability',
    mechanical: true,
    defaultSeverity: 'error',
    explain: 'An image referenced in prose that is not on disk renders as a broken box for every reader. This has exactly one right answer, so it blocks.',
    run: imageRunner((doc, settings, config) => missingFileFindings(doc, settings, config), 'read.image-missing'),
  }),

  defineRule({
    id: 'read.image-number-conflict',
    module: 'readability',
    mechanical: false,
    defaultSeverity: 'warn',
    explain: 'A number in the prose disagrees with a number in the picture\'s own description. The usual cause is a regenerated chart under an un-edited sentence.',
    calibration: 'The origin defect was a tile reading 5/8 under prose that said "seven". Advisory rather than blocking, because the tool cannot see which of the two is correct.',
    run: imageRunner((doc, settings) => numberConflictFindings(doc, settings), 'read.image-number-conflict'),
  }),

  defineRule({
    id: 'read.needs-human-pass',
    module: 'readability',
    mechanical: false,
    defaultSeverity: 'info',
    explain: 'A text checker reads alt text and filenames. It does not read pixels, so it cannot tell you a chart is wrong. Saying so once per document keeps a person in the loop on the part the tool structurally cannot cover.',
    run: imageRunner((doc, settings) => humanPassFinding(doc, settings), 'read.needs-human-pass'),
  }),

  defineRule({
    id: 'read.dialect',
    module: 'readability',
    mechanical: true,
    defaultSeverity: 'warn',
    explain: 'The document uses a spelling from the other dialect. Off unless a project turns it on, because a universal tool should not have an opinion about "colour". Words where the two spellings mean different things are deliberately absent.',
    run({ doc, profile, finding }) {
      const settings = profile?.readability?.dialect || {};
      if (!settings.enabled) return;
      for (const entry of dialectFindings(doc, settings)) {
        if (entry.rule !== 'read.dialect') continue;
        finding(entry);
      }
    },
  }),
];

/**
 * Image rules share three collectors, so each rule filters the shared output by
 * its own id. One traversal, one set of settings, no chance of two rules
 * disagreeing about what an image is.
 */
function imageRunner(collect, ruleId) {
  return function run({ doc, profile, config, finding }) {
    const settings = imageSettings(profile?.readability?.images || {});
    if (settings.enabled === false) return;
    for (const entry of collect(doc, settings, config)) {
      if (entry.rule !== ruleId) continue;
      finding(entry);
    }
  };
}

export const stages = [
  {
    id: 'readability.run',
    needs: ['parse', 'config'],
    reads: [],
    writes: [],
    run: (context, view) => {
      const docs = view.get('parse');
      const config = view.get('config');
      const findings = runRules(rules, docs, config, 'readability');
      annotateStats(docs, findings);
      return findings;
    },
  },
];

function annotateStats(docs, findings) {
  for (const doc of docs) {
    const own = findings.filter((finding) => finding.file === doc.path);
    doc.stats = {
      ...(doc.stats || {}),
      hard: own.filter((finding) => finding.rule === 'read.hard').length,
      tough: own.filter((finding) => finding.rule === 'read.tough').length,
      images: doc.query.images().length,
      words: doc.query.text().split(/\s+/).filter(Boolean).length,
    };
  }
}

export default { id: 'readability', rules, stages };
export { normalizeFinding };
