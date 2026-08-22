// Text normalization and the quote-location search.
//
// `normalize`, `phrases` and `lineOf` are ported from the harness this tool was
// extracted from, where they are the parts that took longest to get right. The
// port keeps the algorithm and drops the transport around it. Every adapter
// shares these three, so a quote located in a local file, a git blob, a web
// snapshot and a CSV cell is located by one ruler.

const MD_LINK_URL = /\((?:https?:|\/|\.\.\/|#)[^)]*\)/g;
const DASHES = /[‐-―−-]+/g;
const DROP = /[*_`>#[\]‘’“”"'.,:;!?()]/g;
const WS = /\s+/g;

/**
 * Fold a quote and raw source text onto the same comparable form.
 *
 * Handles the differences that actually break matching: en and em dashes
 * written as plain hyphens, markdown link targets sitting mid-sentence, bold
 * markers, and terminal punctuation that differs between a quote and the line
 * it was copied from.
 */
export function normalize(input) {
  if (input == null) return '';
  return String(input)
    .replace(MD_LINK_URL, ' ')
    .replace(DASHES, ' ')
    .replace(DROP, '')
    .replace(WS, ' ')
    .trim()
    .toLowerCase();
}

/** Collapse whitespace and trim, without dropping punctuation or case. */
export function collapse(input) {
  if (input == null) return '';
  return String(input).replace(WS, ' ').trim();
}

const CLAUSE_SPLIT = /\.\.\.|…|;|\||:|(?<=[a-z])\.\s/;

/**
 * Longest-first candidate phrases from a quote.
 *
 * Quotes are sometimes elided with an ellipsis or stitched from two source
 * lines, so try each clause on its own, longest first, before giving up.
 *
 * The 15-character floor for a sub-five-word candidate is deliberate. A
 * verbatim line of code is often under five words and still highly distinctive
 * (`const sql = compiledSql || rawSql;`). Prose quotes clear the five-word bar,
 * code quotes frequently do not. It is safe because candidates are tried
 * longest-first, so a full sentence always beats a short fragment.
 */
export function phrases(quote) {
  const parts = String(quote ?? '')
    .split(CLAUSE_SPLIT)
    .filter((part) => part && part.trim());
  const candidates = [String(quote ?? ''), ...parts];
  const out = [];

  for (const candidate of candidates) {
    const normalized = normalize(candidate);
    const words = normalized.split(' ').filter(Boolean);
    if (words.length >= 5) out.push(normalized);
    else if (normalized.length >= 15) out.push(normalized);
    // Also a trimmed window, in case the tail was paraphrased.
    if (words.length >= 10) out.push(words.slice(0, 10).join(' '));
  }

  const seen = new Set();
  const unique = [];
  for (const candidate of out.sort((a, b) => b.length - a.length)) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    unique.push(candidate);
  }
  return unique;
}

/**
 * 1-based line number whose normalized text contains `needle`, or null.
 *
 * Per-line first because it is cheapest and most precise, then a 2/3/4/6-line
 * sliding window so a quote that wraps across lines still matches.
 */
export function lineOf(raw, needle) {
  if (!needle) return null;
  const lines = String(raw).split('\n');

  for (let i = 0; i < lines.length; i += 1) {
    if (normalize(lines[i]).includes(needle)) return i + 1;
  }

  for (const width of [2, 3, 4, 6]) {
    for (let i = 0; i + width <= lines.length; i += 1) {
      if (normalize(lines.slice(i, i + width).join(' ')).includes(needle)) return i + 1;
    }
  }

  return null;
}

/**
 * Locate a quote in raw source text.
 *
 * Returns the first candidate phrase that lands, longest first, along with how
 * confidently it landed. `exact` means the quote appeared verbatim. `normalized`
 * means it appeared after folding. `partial` means only a clause of it did,
 * which is the honest answer when a quote was condensed from several lines.
 */
export function locateQuote(raw, quote) {
  const miss = { found: false, line: null, confidence: 'none', matched: null };
  if (!quote || raw == null) return miss;

  const text = String(raw);
  if (text.includes(String(quote))) {
    const index = text.slice(0, text.indexOf(String(quote))).split('\n').length;
    return { found: true, line: index, confidence: 'exact', matched: String(quote) };
  }

  const candidates = phrases(quote);
  const full = normalize(quote);
  for (const candidate of candidates) {
    const line = lineOf(text, candidate);
    if (line != null) {
      return {
        found: true,
        line,
        confidence: candidate === full ? 'normalized' : 'partial',
        matched: candidate,
      };
    }
  }

  return miss;
}

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

export function wordTokens(input) {
  return String(input ?? '').toLowerCase().match(WORD) || [];
}

export function wordCount(input) {
  return wordTokens(input).length;
}

/**
 * Token-overlap similarity with a length guard, in [0, 1].
 *
 * Used by `check --fix-matches` to find the sentence a span used to point at
 * after the prose was edited. The length guard stops a short fragment scoring
 * high against a long sentence that merely contains it.
 */
export function similarity(a, b) {
  const left = wordTokens(normalize(a));
  const right = wordTokens(normalize(b));
  if (left.length === 0 || right.length === 0) return 0;

  const counts = new Map();
  for (const token of left) counts.set(token, (counts.get(token) || 0) + 1);

  let shared = 0;
  for (const token of right) {
    const remaining = counts.get(token) || 0;
    if (remaining > 0) {
      shared += 1;
      counts.set(token, remaining - 1);
    }
  }

  const dice = (2 * shared) / (left.length + right.length);
  const lengthRatio = Math.min(left.length, right.length) / Math.max(left.length, right.length);
  return dice * (0.5 + 0.5 * lengthRatio);
}

/** Truncate for terminal output without cutting mid-word when avoidable. */
export function truncate(input, max = 80) {
  const text = collapse(input);
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${space > max * 0.6 ? cut.slice(0, space) : cut}…`;
}
