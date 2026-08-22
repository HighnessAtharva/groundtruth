// Claim extraction, for `groundtruth draft`.
//
// Writing a span map from a blank file is the single biggest cost of adopting the
// grounding module, and the reason most people would never get past the first
// document. This scores every sentence for claim-likelihood and scaffolds the ones
// worth binding.
//
// Every emitted candidate is verified against the document before it is written, so
// a drafted map passes `check` on its first run. A scaffold that fails is worse than
// no scaffold, because the first thing a new user would see is a wall of errors from
// a file the tool wrote itself.

import { makeScorer } from '../readability/score.mjs';
import { verifySpan } from './verify.mjs';

const scorer = makeScorer();

const SIGNALS = [
  {
    id: 'number',
    weight: 3,
    why: 'numbers are the thing most often wrong',
    test: /\b\d+(?:[.,]\d+)?\s*(?:%|percent|per cent|x|ms|s|kb|mb|gb|tb|k|m|bn|hours?|hrs?|minutes?|mins?|days?|weeks?|months?|years?|slots?|doors?|items?)?\b|[$£€¥]\s?\d|\bv?\d+\.\d+(?:\.\d+)?\b/i,
  },
  {
    id: 'absolute',
    weight: 3,
    why: 'absolutes are the thing most often overstated',
    test: /\b(only|every|all|none|never|always|first|last|no|nothing|everything|any|each|entire|whole)\b/i,
  },
  {
    id: 'comparative',
    // A bare comparison is a claim on its own, and it is the one shape that needs
    // two sources rather than one.
    weight: 3,
    why: 'a comparison needs two sources, not one',
    // `\w+er than` on its own matched "rather than" and "other than", which turned
    // every ordinary contrast into a claim. The words ending in -er that are not
    // comparatives are excluded by name.
    test: /\b(?!(?:rather|other|whether|either|neither|further|altogether)\b)(?:\w+er than|more \w+ than|less \w+ than|faster|slower|cheaper|smaller|larger|higher|lower|better|worse|twice|triple|half|double)\b/i,
  },
  {
    id: 'capability',
    weight: 2,
    why: 'a capability claim is mechanical and checkable',
    test: /\b(supports?|requires?|returns?|defaults? to|ships? with|runs? on|opens?|holds?|accepts?|rejects?|throws?|carries|tracks?|contains?|includes?|provides?)\b/i,
  },
  {
    id: 'entity',
    weight: 1,
    why: 'a named thing can be looked up',
    test: /(?:^|[^.!?]\s)([A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]{2,})*)/,
  },
  {
    id: 'hedge',
    weight: 2,
    why: 'a consensus claim is usually unsourced, and this is the shape the tool exists to catch',
    test: /\b(most|many|typically|generally|usually|tends? to|commonly|often|widely)\b/i,
  },
];

const STOPLIST = new Set([
  'The', 'This', 'That', 'These', 'Those', 'It', 'They', 'There', 'And', 'But', 'So',
  'When', 'While', 'Where', 'What', 'Why', 'How', 'If', 'Then', 'You', 'We', 'Every',
  'Each', 'Both', 'Neither', 'Either', 'Not', 'Only', 'Read', 'Open', 'Run', 'Set',
]);

/**
 * Score every prose sentence and return the ones worth binding, in document order.
 *
 * @returns {Array<{ text, score, signals, block, line }>}
 */
export function findCandidates(doc, { minScore = 3, limit = 40 } = {}) {
  const found = [];

  for (const block of doc.query.citable()) {
    for (const sentence of scorer.sentences(block.readerText)) {
      const text = sentence.text.replace(/[.!?:]+$/, '').trim();
      if (text.split(/\s+/).length < 5) continue;

      let score = 0;
      const signals = [];
      for (const signal of SIGNALS) {
        if (!signal.test.test(text)) continue;
        if (signal.id === 'entity') {
          const match = signal.test.exec(text);
          const name = (match?.[1] || '').split(/\s+/)[0];
          if (STOPLIST.has(name)) continue;
        }
        score += signal.weight;
        signals.push(signal.id);
      }
      if (score < minScore) continue;

      // Never emit a candidate the verifier would refuse. A scaffold has to pass.
      const verification = verifySpan({ match: text }, doc, { onDuplicateMatch: 'error' });
      if (!verification.ok) continue;

      found.push({
        text,
        score,
        signals,
        block,
        line: doc.lineAt(verification.placements[0].runs[0]?.sourceStart ?? block.offset),
      });
    }
  }

  found.sort((a, b) => a.line - b.line);
  return found.slice(0, limit);
}

export { SIGNALS };
