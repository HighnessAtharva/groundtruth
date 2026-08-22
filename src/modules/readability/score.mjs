// Sentence scoring.
//
// WHY THESE SIGNALS AND NOT A READING GRADE
//
// Flesch-Kincaid and every relative of it is dominated by syllables per word, so
// on technical prose it flags every sentence containing "configuration",
// "Databricks" or "autoscaling" and stays quiet on a 40-word sentence made of
// short words. That is backwards for the job. Every signal here is something a
// writer can fix by rewriting, and long technical nouns only cost something once
// they crowd out everything else in the sentence.
//
// The card carries the dominant reason as an instruction, not a score, because a
// number tells you a sentence is bad and an instruction tells you what to type.

import { readability as NEUTRAL } from '../../../presets/neutral.mjs';
import { DEFAULT_SIGNALS, countMatches } from './signals.mjs';
import { findSeries } from './series.mjs';
import { makeSplitter, sentencesOf, syllables, wordsOf } from './sentences.mjs';

export const BAND_LABEL = { hard: 'Hard to read', tough: 'Slow going' };

export function makeScorer(overrides = {}) {
  const settings = mergeSettings(NEUTRAL, overrides);
  const signals = { ...DEFAULT_SIGNALS, ...(overrides.signals || {}) };
  const splitter = makeSplitter(settings);

  return {
    settings,
    signals,
    splitSentences: splitter,
    sentences: (text) => sentencesOf(text, splitter),
    score: (sentence) => scoreSentence(sentence, settings, signals),
  };
}

function mergeSettings(base, overrides) {
  return {
    ...base,
    ...overrides,
    costs: { ...base.costs, ...(overrides.costs || {}) },
    series: { ...base.series, ...(overrides.series || {}) },
  };
}

/**
 * Score one sentence.
 *
 * @returns {null | { band, score, words, reasons, fix, parts }}
 *   null for anything too short or too clean to be worth a reviewer's attention.
 */
export function scoreSentence(raw, settings = NEUTRAL, signals = DEFAULT_SIGNALS) {
  const text = String(raw).trim();
  if (!text) return null;

  const tokens = wordsOf(text);
  const words = tokens.length;
  if (words < settings.minWords) return null;

  // A fragment that does not close is almost always a sentence cut in half by
  // inline formatting. Scoring half a sentence under-counts its length and flags
  // the wrong thing, so leave it alone. Under-flagging is the safe failure.
  //
  // A colon counts as a close. A list lead-in ("the page gives you five things:")
  // is a complete sentence that happens to end in a colon, and excluding it made
  // every list intro invisible to the shape signals below.
  if (!/[.!?:][)"'”’\]]?$/.test(text)) return null;

  const series = findSeries(text, { ...settings.series, hasVerb: signals.hasVerb });
  const commas = Math.max(0, (text.match(/,/g) || []).length - series.commas);

  // A colon between digits is a clock, not a clause break. Without this guard
  // "Daily at 09:00 UTC, every Monday at 09:00 UTC, or on the first of the month."
  // scored two phantom breaks and was flagged for punctuation it does not have.
  const semis = (text.replace(/\d[:;]\d/g, '').match(/[;:]/g) || []).length;
  const subs = countMatches(text, signals.subordinators);
  const clauses = commas + semis + subs;

  const passive = countMatches(text, signals.passive);

  // Vocabulary signals run on the prose outside any enumeration. See series.mjs.
  const outside = series.outside || text;
  const nominals = countMatches(outside, signals.nominalization);
  const fillers = countMatches(outside, signals.filler);
  // An aside opens after a space. `oklch(0.5 0.15 var(--h))` and `minmax(0, 68ch)`
  // are function calls, and counting them charged a specification line eight asides
  // it does not have. Found by running the scorer over this project's own docs.
  const parens = (text.match(/(?:^|\s)\(/g) || []).length;

  // Proper nouns and hyphenated compounds are excluded. "Databricks" and
  // "auto-suspend" are long, but they are the names of the things being written
  // about, so flagging them asks for a fix that cannot be made. Series items are
  // excluded for the same reason: they are the labels the list exists to give.
  const longWords = Math.max(
    0,
    tokens.filter((word) => !/[-A-Z]/.test(word) && syllables(word) >= 3).length -
      Math.round(series.itemWords * 0.5),
  );
  const longRatio = words ? longWords / words : 0;

  const cost = settings.costs;
  const parts = [];
  let score = 0;

  const overBudget = Math.max(0, words - settings.wordBudget);
  if (overBudget) {
    const weight = overBudget * cost.overBudget;
    score += weight;
    parts.push({
      weight,
      signal: 'length',
      label: `${words} words, ${overBudget} over the ${settings.wordBudget}-word budget`,
      fix: 'Cut it into two sentences at the first natural break.',
    });
  }

  // Clause load scaled by length. Three commas in a sixteen-word sentence is a
  // short list a reader takes in one go. Three commas in a forty-word sentence is
  // three things held open at once. Charging both the same made the checker flag
  // clean lists, and a flag a writer learns to ignore is worse than no flag.
  const lengthFactor = Math.min(1, words / settings.wordBudget);
  const extraClauses = Math.max(0, clauses - 1);
  const clauseCost = extraClauses * cost.clause * lengthFactor;
  if (clauseCost >= 1) {
    score += clauseCost;
    parts.push({
      weight: clauseCost,
      signal: 'clauses',
      label: `${clauses} clause breaks stacked in one sentence`,
      fix: 'Give each clause its own sentence, or turn the list of them into bullets.',
    });
  }

  if (passive) {
    const weight = passive * cost.passive;
    score += weight;
    parts.push({
      weight,
      signal: 'passive',
      label: passive === 1 ? 'passive voice' : `${passive} passive constructions`,
      fix: 'Name the thing doing the work and put it in front of the verb.',
    });
  }

  const overJargon = words < settings.jargonMinWords ? 0 : Math.max(0, longRatio - settings.jargonRatio);
  if (overJargon > 0.01) {
    const weight = overJargon * cost.jargon;
    score += weight;
    parts.push({
      weight,
      signal: 'jargon',
      label: `${longWords} of ${words} words run three syllables or more`,
      fix: 'Swap the abstract nouns for the concrete thing they describe.',
    });
  }

  if (nominals >= 2) {
    const weight = nominals * cost.nominalization;
    score += weight;
    parts.push({
      weight,
      signal: 'nominalization',
      label: `${nominals} verbs buried inside nouns`,
      fix: "Turn them back into verbs: 'applies the change', not 'the application of the change'.",
    });
  }

  if (fillers) {
    const weight = fillers * cost.filler;
    score += weight;
    parts.push({
      weight,
      signal: 'filler',
      label: fillers === 1 ? 'a filler word carrying no meaning' : `${fillers} filler words carrying no meaning`,
      fix: 'Delete them. The sentence means the same thing without them.',
    });
  }

  if (parens) {
    const weight = parens * cost.paren;
    score += weight;
    parts.push({
      weight,
      signal: 'parens',
      label: parens === 1 ? 'an aside in parentheses' : `${parens} asides in parentheses`,
      fix: 'Promote it to its own sentence, or drop it.',
    });
  }

  if (signals.coordFused.test(text)) {
    score += cost.fused;
    parts.push({
      weight: cost.fused,
      signal: 'fused',
      label: 'two independent clauses welded with a coordinator',
      fix: 'Put a full stop where the comma is. Each half is already a sentence.',
    });
  }

  const front = text.match(signals.frontLoaded);
  if (front) {
    const held = wordsOf(front[0]).length;
    score += cost.frontLoaded;
    parts.push({
      weight: cost.frontLoaded,
      signal: 'frontLoaded',
      label: `the subject arrives ${held} words in, behind an opener`,
      fix: 'Lead with the subject and move the condition to the end, or split it off.',
    });
  }

  if (signals.preamble.test(text)) {
    score += cost.preamble;
    parts.push({
      weight: cost.preamble,
      signal: 'preamble',
      label: 'a runway in front of the claim',
      fix: "Delete the runway and state the claim. 'That tells you X' is just X.",
    });
  }

  if (score < settings.tough) return null;

  parts.sort((a, b) => b.weight - a.weight);
  return {
    band: score >= settings.hard ? 'hard' : 'tough',
    score: Math.round(score),
    words,
    reasons: parts.map((part) => part.label),
    fix: parts[0].fix,
    parts,
  };
}

/**
 * The shape predicates, exported on their own.
 *
 * Testing them through the scorer conflates two questions: does the sentence
 * have the shape, and does the whole sentence clear the amber floor. A single
 * shape signal is worth less than the threshold on purpose, so a correct match
 * on an otherwise clean sentence still returns null, which reads as a miss in a
 * test and once sent a review round chasing a bug that was not there.
 */
export const SHAPE = {
  fused: (text) => DEFAULT_SIGNALS.coordFused.test(text),
  frontLoaded: (text) => DEFAULT_SIGNALS.frontLoaded.test(text),
  preamble: (text) => DEFAULT_SIGNALS.preamble.test(text),
};
