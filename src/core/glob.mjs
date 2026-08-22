// Glob to RegExp. Supports **, *, ?, {a,b}, and character classes [abc].
//
// Paths are always compared with forward slashes, so Windows callers must
// normalize before matching. `**` crosses directory boundaries, a single `*`
// never does, and a leading `**/` also matches a path with no directory at all
// so that `**/*.md` catches `README.md` at the root.

const SPECIAL = /[.+^$()|\\]/g;

export function globToRegExp(pattern) {
  return new RegExp(`^${globToSource(pattern)}$`);
}

function globToSource(pattern) {
  let out = '';
  let i = 0;
  const source = String(pattern).replace(/\\/g, '/');

  while (i < source.length) {
    const char = source[i];

    if (char === '*') {
      if (source[i + 1] === '*') {
        if (source[i + 2] === '/') {
          // `**/` also matches nothing, so `**/*.md` catches a root-level file.
          out += '(?:[^/]*/)*';
          i += 3;
        } else {
          out += '.*';
          i += 2;
        }
      } else {
        out += '[^/]*';
        i += 1;
      }
      continue;
    }

    if (char === '?') {
      out += '[^/]';
      i += 1;
      continue;
    }

    if (char === '[') {
      const close = source.indexOf(']', i + 1);
      if (close === -1) {
        out += '\\[';
        i += 1;
        continue;
      }
      let body = source.slice(i + 1, close);
      if (body.startsWith('!')) body = `^${body.slice(1)}`;
      out += `[${body}]`;
      i = close + 1;
      continue;
    }

    if (char === '{') {
      const close = matchingBrace(source, i);
      if (close === -1) {
        out += '\\{';
        i += 1;
        continue;
      }
      const parts = splitTopLevel(source.slice(i + 1, close));
      out += `(?:${parts.map(globToSource).join('|')})`;
      i = close + 1;
      continue;
    }

    out += char.replace(SPECIAL, '\\$&');
    i += 1;
  }

  return out;
}

function matchingBrace(source, start) {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const char of body) {
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}

export function makeMatcher(patterns) {
  const list = (Array.isArray(patterns) ? patterns : [patterns]).map(globToRegExp);
  return (path) => {
    const normalized = String(path).replace(/\\/g, '/');
    return list.some((re) => re.test(normalized));
  };
}

export function matchesAny(path, patterns) {
  if (!patterns || patterns.length === 0) return false;
  return makeMatcher(patterns)(path);
}
