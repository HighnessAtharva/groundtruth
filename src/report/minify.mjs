// A deliberately small CSS and JS squeezer.
//
// Not a minifier. It strips comments and collapses runs of whitespace, and it does
// nothing that requires understanding the language. That is the whole point: a real
// minifier would be a dependency, and this file's job is to stop 28KB of stylesheet
// being duplicated into 200 pages, not to win a byte-golf contest.
//
// String and template literals are stepped over character by character, because a
// comment marker inside a string is not a comment and a regex-based stripper gets
// that wrong on `content: "//"` every time.

/**
 * Strip comments and collapse whitespace, leaving every string literal intact.
 *
 * @param {string} source
 * @param {object} [options]
 * @param {boolean} [options.tight]  also drop space around CSS punctuation
 */
export function squeeze(source, { tight = false } = {}) {
  const text = String(source);
  let out = '';
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    const next = text[i + 1];

    // A string or template literal is copied through untouched.
    if (char === '"' || char === "'" || char === '`') {
      const end = closingQuote(text, i);
      out += text.slice(i, end + 1);
      i = end + 1;
      continue;
    }

    if (char === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 2;
      // A comment becomes one space, so `a/*x*/b` does not become `ab`.
      out += ' ';
      continue;
    }

    if (char === '/' && next === '/') {
      const end = text.indexOf('\n', i);
      i = end === -1 ? text.length : end;
      out += ' ';
      continue;
    }

    if (char === '\n' || char === '\r' || char === '\t' || char === ' ') {
      let j = i;
      while (j < text.length && /\s/.test(text[j])) j += 1;
      // A newline is kept as a newline in JS, because dropping every one risks
      // changing meaning through automatic semicolon insertion.
      out += text.slice(i, j).includes('\n') && !tight ? '\n' : ' ';
      i = j;
      continue;
    }

    out += char;
    i += 1;
  }

  if (tight) {
    out = out
      .replace(/\s*([{}:;,>])\s*/g, '$1')
      .replace(/;}/g, '}')
      .replace(/\s+/g, ' ');
  }

  return out.trim();
}

function closingQuote(text, start) {
  const quote = text[start];
  for (let i = start + 1; i < text.length; i += 1) {
    if (text[i] === '\\') {
      i += 1;
      continue;
    }
    if (text[i] === quote) return i;
  }
  return text.length - 1;
}

/**
 * CSS gets the tight treatment. A selector list needs one space after a comma to
 * stay readable in devtools, and `>` in a combinator needs none, so the rules above
 * cover both.
 */
export function squeezeCss(css) {
  return squeeze(css, { tight: true }).replace(/,(?=[.#a-zA-Z:\[])/g, ', ');
}

/** JS keeps its newlines, so automatic semicolon insertion cannot change meaning. */
export function squeezeJs(js) {
  return squeeze(js, { tight: false });
}
