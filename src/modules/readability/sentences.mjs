// Sentence splitting and syllable counting.
//
// One splitter in the package. The readability scorer, claim extraction for
// `draft`, and the SEO answer-first check all call this, so "what is a sentence"
// has one answer.

const DEFAULT_ABBREV = [
  'e.g', 'i.e', 'etc', 'vs', 'no', 'fig', 'approx', 'inc', 'ltd', 'co', 'dr',
  'mr', 'mrs', 'ms', 'st', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug',
  'sep', 'sept', 'oct', 'nov', 'dec',
];

const DEFAULT_LOWER_OPENERS = ['npx', 'npm', 'yarn', 'git'];

export function makeSplitter(settings = {}) {
  const abbrev = new Set((settings.abbreviations || DEFAULT_ABBREV).map((entry) => entry.toLowerCase()));
  const openers = settings.lowerOpeners || DEFAULT_LOWER_OPENERS;
  const lowerOpeners = openers.length
    ? new RegExp(`^(${openers.map(escapeRegExp).join('|')})\\b`)
    : /^$a/;

  /**
   * Split text into sentence ranges.
   *
   * Only splits on terminal punctuation followed by whitespace and something
   * that can open a sentence. Guards against decimals ($6.4K, 1.5 times, p95.),
   * against the abbreviation list, and against a single initial.
   */
  return function splitSentences(text) {
    const out = [];
    let start = 0;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (char !== '.' && char !== '!' && char !== '?') continue;

      // A run of terminal punctuation, so "?!" or "..." ends once.
      let end = i;
      while (end + 1 < text.length && /[.!?]/.test(text[end + 1])) end += 1;

      const after = text.slice(end + 1);
      const opensUpper = /^\s+["“'([]?[A-Z0-9]/.test(after);
      const opensLower = lowerOpeners.test(after.replace(/^\s+/, ''));
      if (after && !opensUpper && !opensLower) {
        i = end;
        continue;
      }

      if (char === '.') {
        // A digit on both sides is a decimal, a version, or a numbered list.
        if (/\d/.test(text[i - 1] || '') && /^\s*\d/.test(after)) {
          i = end;
          continue;
        }
        const before = text.slice(start, i);
        const lastWord = (before.match(/[A-Za-z.]+$/) || [''])[0].toLowerCase();
        if (abbrev.has(lastWord.replace(/\.$/, '')) || /^[a-z]$/.test(lastWord)) {
          i = end;
          continue;
        }
      }

      out.push({ start, end: end + 1 });
      start = end + 1;
      i = end;
    }

    if (start < text.length && text.slice(start).trim()) {
      out.push({ start, end: text.length });
    }
    return out;
  };
}

export const splitSentences = makeSplitter();

/** Sentences as trimmed strings with their offset back into the input. */
export function sentencesOf(text, splitter = splitSentences) {
  return splitter(text).map((range) => {
    const raw = text.slice(range.start, range.end);
    const leading = raw.length - raw.trimStart().length;
    return {
      text: raw.trim(),
      start: range.start + leading,
      end: range.end,
    };
  }).filter((entry) => entry.text);
}

export function syllables(word) {
  const clean = String(word).toLowerCase().replace(/[^a-z]/g, '');
  if (clean.length <= 3) return 1;
  const groups = clean
    .replace(/(?:es|ed)$/, '')
    .replace(/e$/, '')
    .match(/[aeiouy]+/g);
  return groups ? groups.length : 1;
}

export const WORD_PATTERN = /[A-Za-z][A-Za-z'’-]*/g;

export function wordsOf(text) {
  return String(text).match(WORD_PATTERN) || [];
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
