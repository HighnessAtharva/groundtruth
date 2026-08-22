// Frontmatter split. The one place the `yaml` dependency is used.
//
// The body offset is preserved so every line number the tool ever reports is a
// line number in the file the author opens, never an offset into a stripped
// body. The harness this was extracted from parses frontmatter with a
// hand-rolled regex, which silently drops nested keys and any value containing
// a colon. A real parser costs one zero-dependency package and removes a class
// of wrong answers.

import { parse as parseYaml } from 'yaml';

const FENCE = /^---\r?\n/;

/**
 * @returns {{ data: object, body: string, bodyLine: number, raw: string|null,
 *             errors: Array<{message: string, line: number}> }}
 *   `bodyLine` is the 1-based line in the original file where the body starts.
 */
export function splitFrontmatter(source) {
  const text = stripBom(String(source));
  const errors = [];

  if (!FENCE.test(text)) {
    return { data: {}, body: text, bodyLine: 1, raw: null, errors };
  }

  const openLength = text.match(FENCE)[0].length;
  const rest = text.slice(openLength);
  const close = rest.search(/^---[ \t]*(\r?\n|$)/m);

  if (close === -1) {
    errors.push({ message: 'frontmatter opens with --- but never closes', line: 1 });
    return { data: {}, body: text, bodyLine: 1, raw: null, errors };
  }

  const raw = rest.slice(0, close);
  const closeMatch = rest.slice(close).match(/^---[ \t]*(\r?\n|$)/);
  const body = rest.slice(close + closeMatch[0].length);

  let data = {};
  try {
    const parsed = parseYaml(raw, { prettyErrors: false });
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed;
    else if (parsed != null) {
      errors.push({ message: 'frontmatter is not a mapping', line: 1 });
    }
  } catch (error) {
    const line = Number(error?.linePos?.[0]?.line) || 1;
    errors.push({ message: `frontmatter is not valid YAML: ${error.message.split('\n')[0]}`, line: line + 1 });
  }

  // 1 for the opening fence, the frontmatter lines, 1 for the closing fence.
  const bodyLine = 1 + countLines(raw) + 1 + 1;
  return { data, body, bodyLine, raw, errors };
}

function countLines(text) {
  if (!text) return 0;
  const trimmed = text.endsWith('\n') ? text.slice(0, -1) : text;
  return trimmed === '' ? 0 : trimmed.split('\n').length;
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Read a frontmatter field, tolerating a list where a scalar was expected. */
export function field(data, name, fallback = null) {
  const value = data?.[name];
  if (value == null || value === '') return fallback;
  return value;
}

export function listField(data, name) {
  const value = data?.[name];
  if (value == null || value === '') return [];
  if (Array.isArray(value)) return value.filter((item) => item != null && item !== '');
  return [value];
}
