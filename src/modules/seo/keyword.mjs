// Keyword matching.
//
// Two measurements, and the difference between them matters.
//
// `keywordHit` asks what share of a keyword's content words appear anywhere. It
// is the right question for a short document, where a 4-word phrase almost never
// appears intact.
//
// `phraseHits` counts the phrase appearing in order, tolerating stop-word gaps.
// It is the right question for a long document, and it is what density is built
// on. An occurrence count over a 2-to-6-word keyword is meaningless, because one
// occurrence of a six-word phrase puts six words on the page and one occurrence
// of a two-word phrase puts two.

const STOP = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'how', 'in',
  'into', 'is', 'it', 'its', 'of', 'on', 'or', 'per', 'than', 'that', 'the',
  'then', 'to', 'up', 'via', 'vs', 'what', 'when', 'where', 'which', 'why',
  'with', 'you', 'your',
]);

/** Lowercase, and reduce anything non-alphanumeric to a single space. */
export function norm(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** A crude singularizer. "warehouses" and "warehouse" are the same keyword. */
export function stem(word) {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith('es') && !word.endsWith('ses')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

export function contentWords(text) {
  return norm(text)
    .split(' ')
    .filter((word) => word && !STOP.has(word))
    .map(stem);
}

/** Every word, stop words included. Used for word counts and density. */
export function wordCount(text) {
  return (String(text || '').match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) || []).length;
}

/**
 * `stem` is asymmetric on the "-es" rule: "alternatives" becomes "alternativ"
 * while the singular "alternative" is left whole, so a stem-to-stem compare
 * called them different words and a question reading "which alternative covers
 * the most platforms" did not count towards the keyword "alternatives".
 * Dropping a trailing "e" from both stems closes that without touching `stem`,
 * which the coverage checks and the word counts both depend on.
 */
function sameWord(a, b) {
  const soft = (word) => stem(word).replace(/e$/, '');
  return soft(a) === soft(b);
}

/**
 * A gap word tolerated inside a keyword phrase. Stop words carry the phrase
 * across "cost optimization in Snowflake"-shaped rewordings, and a bare single
 * letter is what `norm` leaves behind when it flattens a possessive.
 */
function gapOk(word) {
  return STOP.has(word) || word.length === 1;
}

const PHRASE_GAP = 2;

/**
 * How much of `keyword` shows up in `text`.
 *
 * Comparison runs on stems, reporting runs on the words the writer typed.
 * Reporting the stem once told a reviewer to add "analysi" to the title.
 */
export function keywordHit(text, keyword) {
  const raw = norm(keyword).split(' ').filter((word) => word && !STOP.has(word));
  if (!raw.length) return { share: 0, exact: false, missing: [] };
  const haystack = ` ${norm(text).split(' ').map(stem).join(' ')} `;
  const missing = raw.filter((word) => !haystack.includes(` ${stem(word)} `));
  const share = (raw.length - missing.length) / raw.length;
  const exact = norm(text).includes(norm(keyword));
  return { share, exact, missing };
}

/** Words of its own a keyword phrase puts on the page, stop words dropped. */
export function keywordWordCount(keyword) {
  return contentWords(keyword).length;
}

/** Occurrences of the phrase in order, tolerating up to two stop-word gaps. */
export function phraseHits(text, keyword) {
  const want = contentWords(keyword);
  if (!want.length) return 0;
  const words = norm(text).split(' ').filter(Boolean);
  let hits = 0;

  for (let i = 0; i < words.length; i += 1) {
    let k = i;
    let w = 0;
    let gaps = 0;
    while (w < want.length && k < words.length) {
      if (sameWord(words[k], want[w])) {
        k += 1;
        w += 1;
        continue;
      }
      // A gap is only allowed mid-phrase. Letting one open the match would make
      // every "the" in the document a candidate start.
      if (w > 0 && gaps < PHRASE_GAP && gapOk(words[k])) {
        k += 1;
        gaps += 1;
        continue;
      }
      break;
    }
    if (w === want.length) {
      hits += 1;
      i = k - 1;
    }
  }

  return hits;
}

/**
 * Keyword placement. Four slots and no more: the title, the meta description,
 * the opening passage, and at least one H2.
 *
 * Matching is "all words present, in order" rather than an exact string, because
 * a title that reads "Why is my dbt model slow?" targets "dbt model slow" and an
 * exact-string gate would fail it for the word "is".
 */
export function placementCheck(text, keyword) {
  if (!keyword) return { hit: false, share: 0, missing: [] };
  const inOrder = phraseHits(text, keyword) > 0;
  const { share, missing, exact } = keywordHit(text, keyword);
  return { hit: inOrder || exact, share, missing, exact };
}

export function bandFor(share, { strong = 0.8, weak = 0.5 } = {}) {
  if (share >= strong) return 'pass';
  if (share >= weak) return 'warn';
  return 'fail';
}

export { STOP };
