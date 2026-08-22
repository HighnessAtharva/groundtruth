// The only markdown parse in the package.
//
// The checker, the span matcher, and the HTML report all read the tree this
// produces. The harness this was extracted from has three separate readers, so
// its span verifier cannot see the tree its renderer will build, and it papers
// over the gap with a character blacklist that rejects `snake_case` and `2 * 3`
// while missing footnote refs and autolinks. One reader lets the tool ask the
// real question instead of a proxy.
//
// Every block and every inline run carries an absolute character offset into
// the original file, so a line number reported by any module is a line number
// in the file the author opens.

const FENCE_OPEN = /^(\s{0,3})(`{3,}|~{3,})[ \t]*([^`\s]*)[^`]*$/;
const ATX = /^(\s{0,3})(#{1,6})([ \t]+(.*?))?[ \t]*#*[ \t]*$/;
const SETEXT = /^(\s{0,3})(=+|-{2,})[ \t]*$/;
const THEMATIC = /^(\s{0,3})((\*[ \t]*){3,}|(-[ \t]*){3,}|(_[ \t]*){3,})$/;
const BLOCKQUOTE = /^(\s{0,3})>[ \t]?(.*)$/;
const CALLOUT = /^\[!([A-Za-z]+)\][ \t]*(.*)$/;
const BULLET = /^(\s*)([-*+])([ \t]+)(.*)$/;
const ORDERED = /^(\s*)(\d{1,9})([.)])([ \t]+)(.*)$/;
const TABLE_DELIM = /^\s{0,3}\|?[ \t]*:?-{1,}:?[ \t]*(\|[ \t]*:?-{1,}:?[ \t]*)*\|?[ \t]*$/;
const HTML_BLOCK_OPEN = /^\s{0,3}<(!--|\/?[A-Za-z][A-Za-z0-9-]*)/;
const LINK_DEF = /^\s{0,3}\[([^\]]+)\]:\s*(\S+)(?:\s+["'(](.*)["')])?\s*$/;
const BLANK = /^[ \t]*$/;

/**
 * Parse markdown body text into a block tree.
 *
 * @param {string} body        the document body, frontmatter already removed
 * @param {object} [options]
 * @param {number} [options.startLine=1]    1-based line of `body` in the file
 * @param {number} [options.startOffset=0]  character offset of `body` in the file
 * @returns {{ blocks: Block[], definitions: Map<string, {href: string, title: string}> }}
 */
export function parseMarkdown(body, options = {}) {
  const startLine = options.startLine ?? 1;
  const startOffset = options.startOffset ?? 0;
  const text = String(body).replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const lines = [];
  let offset = startOffset;
  for (const [index, raw] of text.split('\n').entries()) {
    lines.push({ text: raw, line: startLine + index, offset });
    offset += raw.length + 1;
  }

  const definitions = new Map();
  collectDefinitions(lines, definitions);

  const blocks = parseBlocks(lines, definitions);
  return { blocks, definitions };
}

function collectDefinitions(lines, definitions) {
  for (const line of lines) {
    const match = LINK_DEF.exec(line.text);
    if (match) {
      definitions.set(match[1].trim().toLowerCase(), {
        href: match[2].replace(/^<|>$/g, ''),
        title: match[3] || '',
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Block level
// ---------------------------------------------------------------------------

function parseBlocks(lines, definitions) {
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (BLANK.test(line.text)) {
      i += 1;
      continue;
    }

    if (LINK_DEF.test(line.text)) {
      i += 1;
      continue;
    }

    const fence = FENCE_OPEN.exec(line.text);
    if (fence) {
      const marker = fence[2][0];
      const width = fence[2].length;
      const closer = new RegExp(`^\\s{0,3}\\${marker}{${width},}[ \\t]*$`);
      const content = [];
      let j = i + 1;
      while (j < lines.length && !closer.test(lines[j].text)) {
        content.push(lines[j]);
        j += 1;
      }
      blocks.push({
        type: 'code',
        line: line.line,
        endLine: (lines[Math.min(j, lines.length - 1)] || line).line,
        offset: line.offset,
        lang: (fence[3] || '').trim(),
        fenced: true,
        infoLine: line.line,
        value: content.map((entry) => entry.text).join('\n'),
        inlines: [],
        readerText: '',
      });
      i = j + 1;
      continue;
    }

    const atx = ATX.exec(line.text);
    if (atx) {
      const raw = (atx[4] ?? '').trim();
      const rawStart = line.text.indexOf(raw, atx[1].length + atx[2].length);
      const inline = parseInlines(
        [{ text: raw, offset: line.offset + (raw ? rawStart : line.text.length), line: line.line }],
        definitions,
      );
      blocks.push({
        type: 'heading',
        depth: atx[2].length,
        line: line.line,
        endLine: line.line,
        offset: line.offset,
        raw,
        ...inline,
      });
      i += 1;
      continue;
    }

    if (THEMATIC.test(line.text)) {
      blocks.push({
        type: 'thematicBreak',
        line: line.line,
        endLine: line.line,
        offset: line.offset,
        inlines: [],
        readerText: '',
      });
      i += 1;
      continue;
    }

    const quote = BLOCKQUOTE.exec(line.text);
    if (quote) {
      const inner = [];
      let j = i;
      while (j < lines.length) {
        const match = BLOCKQUOTE.exec(lines[j].text);
        if (match) {
          const stripped = match[2];
          const prefixLength = lines[j].text.length - stripped.length;
          inner.push({ text: stripped, offset: lines[j].offset + prefixLength, line: lines[j].line });
          j += 1;
          continue;
        }
        // A lazy continuation line inside a blockquote paragraph.
        if (!BLANK.test(lines[j].text) && inner.length && !BLANK.test(inner[inner.length - 1].text)) {
          inner.push(lines[j]);
          j += 1;
          continue;
        }
        break;
      }

      let calloutKind = null;
      if (inner.length) {
        const first = CALLOUT.exec(inner[0].text.trim());
        if (first) {
          calloutKind = first[1].toUpperCase();
          const rest = first[2];
          const at = inner[0].text.indexOf(rest);
          inner[0] = {
            text: rest,
            offset: inner[0].offset + (rest ? at : inner[0].text.length),
            line: inner[0].line,
          };
          if (!rest.trim()) inner.shift();
        }
      }

      blocks.push({
        type: calloutKind ? 'callout' : 'blockquote',
        kind: calloutKind,
        line: line.line,
        endLine: lines[j - 1].line,
        offset: line.offset,
        children: parseBlocks(inner, definitions),
        inlines: [],
        readerText: '',
      });
      i = j;
      continue;
    }

    const listStart = BULLET.exec(line.text) || ORDERED.exec(line.text);
    if (listStart) {
      const [list, next] = parseList(lines, i, definitions);
      blocks.push(list);
      i = next;
      continue;
    }

    if (i + 1 < lines.length && looksLikeTable(line.text) && TABLE_DELIM.test(lines[i + 1].text)) {
      const rows = [];
      let j = i;
      while (j < lines.length && looksLikeTable(lines[j].text)) {
        rows.push(lines[j]);
        j += 1;
      }
      blocks.push(buildTable(rows, definitions));
      i = j;
      continue;
    }

    if (HTML_BLOCK_OPEN.test(line.text)) {
      const content = [];
      let j = i;
      const isComment = line.text.trimStart().startsWith('<!--');
      while (j < lines.length) {
        content.push(lines[j]);
        if (isComment ? lines[j].text.includes('-->') : BLANK.test(lines[j].text)) break;
        j += 1;
      }
      blocks.push({
        type: 'html',
        line: line.line,
        endLine: content[content.length - 1].line,
        offset: line.offset,
        value: content.map((entry) => entry.text).join('\n'),
        comment: isComment,
        inlines: [],
        readerText: '',
      });
      i = j + 1;
      continue;
    }

    // Paragraph, with a setext heading check on its second line.
    const paragraph = [];
    let j = i;
    while (j < lines.length && !BLANK.test(lines[j].text)) {
      if (j > i) {
        const setext = SETEXT.exec(lines[j].text);
        if (setext) break;
        if (FENCE_OPEN.test(lines[j].text) || ATX.test(lines[j].text) || BLOCKQUOTE.test(lines[j].text)) break;
        if (BULLET.test(lines[j].text) || ORDERED.test(lines[j].text)) break;
      }
      paragraph.push(lines[j]);
      j += 1;
    }

    const setextLine = j < lines.length ? SETEXT.exec(lines[j].text) : null;
    const inline = parseInlines(paragraph, definitions);

    if (setextLine && paragraph.length) {
      blocks.push({
        type: 'heading',
        depth: setextLine[2][0] === '=' ? 1 : 2,
        line: paragraph[0].line,
        endLine: lines[j].line,
        offset: paragraph[0].offset,
        raw: paragraph.map((entry) => entry.text).join(' ').trim(),
        setext: true,
        ...inline,
      });
      i = j + 1;
      continue;
    }

    if (paragraph.length) {
      blocks.push({
        type: 'paragraph',
        line: paragraph[0].line,
        endLine: paragraph[paragraph.length - 1].line,
        offset: paragraph[0].offset,
        ...inline,
      });
    }
    i = Math.max(j, i + 1);
  }

  return blocks;
}

function parseList(lines, start, definitions) {
  const first = BULLET.exec(lines[start].text) || ORDERED.exec(lines[start].text);
  const ordered = !BULLET.test(lines[start].text);
  const baseIndent = first[1].length;
  const items = [];
  let i = start;

  while (i < lines.length) {
    const bullet = BULLET.exec(lines[i].text);
    const numbered = ORDERED.exec(lines[i].text);
    const marker = bullet || numbered;
    if (!marker || marker[1].length !== baseIndent || Boolean(numbered) !== ordered) break;

    const markerLength = bullet
      ? bullet[1].length + bullet[2].length + bullet[3].length
      : numbered[1].length + numbered[2].length + numbered[3].length + numbered[4].length;

    const content = [
      {
        text: lines[i].text.slice(markerLength),
        offset: lines[i].offset + markerLength,
        line: lines[i].line,
      },
    ];

    let j = i + 1;
    while (j < lines.length) {
      if (BLANK.test(lines[j].text)) {
        const following = lines[j + 1];
        if (following && !BLANK.test(following.text) && leadingSpaces(following.text) >= markerLength) {
          content.push({ text: '', offset: lines[j].offset, line: lines[j].line });
          j += 1;
          continue;
        }
        break;
      }
      const indent = leadingSpaces(lines[j].text);
      if (indent >= markerLength) {
        content.push({
          text: lines[j].text.slice(markerLength),
          offset: lines[j].offset + markerLength,
          line: lines[j].line,
        });
        j += 1;
        continue;
      }
      if (BULLET.test(lines[j].text) || ORDERED.test(lines[j].text)) break;
      // Lazy continuation of the item's paragraph.
      content.push(lines[j]);
      j += 1;
    }

    items.push({
      type: 'listItem',
      line: lines[i].line,
      endLine: lines[j - 1].line,
      offset: lines[i].offset,
      children: parseBlocks(content, definitions),
      inlines: [],
      readerText: '',
    });
    i = j;
  }

  return [
    {
      type: 'list',
      ordered,
      start: ordered ? Number(first[2]) : null,
      line: lines[start].line,
      endLine: items.length ? items[items.length - 1].endLine : lines[start].line,
      offset: lines[start].offset,
      children: items,
      inlines: [],
      readerText: '',
    },
    i,
  ];
}

function leadingSpaces(text) {
  const match = /^[ \t]*/.exec(text)[0];
  return match.replace(/\t/g, '    ').length;
}

function looksLikeTable(text) {
  return text.includes('|') && !BLANK.test(text);
}

function buildTable(rows, definitions) {
  const cells = rows.map((row) => splitRow(row));
  const header = cells[0];
  const alignRow = cells[1];
  const body = cells.slice(2);

  const align = (alignRow || []).map((cell) => {
    const value = cell.text.trim();
    if (value.startsWith(':') && value.endsWith(':')) return 'center';
    if (value.endsWith(':')) return 'right';
    if (value.startsWith(':')) return 'left';
    return null;
  });

  const toCells = (row) => row.map((cell) => parseInlines([cell], definitions));

  return {
    type: 'table',
    line: rows[0].line,
    endLine: rows[rows.length - 1].line,
    offset: rows[0].offset,
    align,
    header: header ? toCells(header) : [],
    rows: body.map(toCells),
    inlines: [],
    readerText: '',
  };
}

function splitRow(row) {
  const cells = [];
  let current = '';
  let startIndex = 0;
  let escaped = false;
  const text = row.text.trim();
  const lead = row.text.indexOf(text);
  const inner = text.replace(/^\|/, '').replace(/\|$/, '');
  const innerStart = lead + (text.startsWith('|') ? 1 : 0);

  for (let i = 0; i < inner.length; i += 1) {
    const char = inner[i];
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      current += char;
      continue;
    }
    if (char === '|') {
      cells.push({ text: current, offset: row.offset + innerStart + startIndex, line: row.line });
      current = '';
      startIndex = i + 1;
      continue;
    }
    current += char;
  }
  cells.push({ text: current, offset: row.offset + innerStart + startIndex, line: row.line });
  return cells;
}

// ---------------------------------------------------------------------------
// Inline level
// ---------------------------------------------------------------------------

const CODE_SPAN = /^(`+)([\s\S]*?[^`])\1(?!`)/;
const IMAGE = /^!\[([^\]]*)\]\(\s*(<[^>]*>|[^\s)]*)(?:\s+["'(]([^"')]*)["')])?\s*\)/;
const LINK = /^\[((?:[^[\]]|\[[^\]]*\])*)\]\(\s*(<[^>]*>|[^\s)]*)(?:\s+["'(]([^"')]*)["')])?\s*\)/;
const REF_LINK = /^\[((?:[^[\]]|\[[^\]]*\])*)\](?:\[([^\]]*)\])?/;
const AUTOLINK = /^<((?:https?|mailto):[^>\s]+)>/;
const HTML_COMMENT = /^<!--[\s\S]*?-->/;
const HTML_TAG = /^<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?\/?>/;
const FOOTNOTE_REF = /^\[\^([^\]]+)\]/;
const ENTITY = /^&(#\d{1,7}|#[Xx][0-9A-Fa-f]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/;

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘',
  ldquo: '“', rdquo: '”', times: '×', middot: '·', deg: '°',
};

/**
 * Parse a run of source lines into reader text plus positioned inline runs.
 *
 * `lines` is an array of `{ text, offset, line }` where `offset` is the absolute
 * character offset of `text[0]` in the original file. That indirection is what
 * lets a list item or a blockquote be de-indented for parsing while every
 * reported position still points into the real file.
 */
export function parseInlines(lines, definitions = new Map()) {
  const joined = lines.map((entry) => entry.text).join('\n');
  const map = buildOffsetMap(lines);
  const runs = [];
  let readerText = '';

  const emit = (run) => {
    if (run.kind === 'text' && run.text === '' ) return;
    run.start = readerText.length;
    readerText += run.text;
    run.end = readerText.length;
    runs.push(run);
  };

  walk(joined, 0, [], null);
  mergeAdjacentText(runs);

  return { inlines: runs, readerText, raw: joined };

  function walk(source, base, marks, href) {
    let i = 0;
    let pending = '';
    let pendingStart = 0;

    const flush = (endIndex) => {
      if (!pending) return;
      emit({
        kind: 'text',
        text: pending,
        marks: marks.slice(),
        href,
        sourceStart: map(base + pendingStart),
        sourceEnd: map(base + endIndex),
      });
      pending = '';
    };

    while (i < source.length) {
      const rest = source.slice(i);
      const char = source[i];

      if (char === '\\' && i + 1 < source.length && /[\\`*_{}[\]()#+\-.!>~|]/.test(source[i + 1])) {
        if (!pending) pendingStart = i;
        pending += source[i + 1];
        i += 2;
        continue;
      }

      if (char === '\n') {
        if (!pending) pendingStart = i;
        pending += ' ';
        i += 1;
        continue;
      }

      if (char === '&') {
        const entity = ENTITY.exec(rest);
        if (entity) {
          if (!pending) pendingStart = i;
          pending += decodeEntity(entity[1]);
          i += entity[0].length;
          continue;
        }
      }

      if (char === '`') {
        const code = CODE_SPAN.exec(rest);
        if (code) {
          flush(i);
          const value = code[2].replace(/\n/g, ' ').replace(/^ (.*) $/, '$1');
          emit({
            kind: 'code',
            text: value,
            marks: marks.slice(),
            href,
            sourceStart: map(base + i),
            sourceEnd: map(base + i + code[0].length),
          });
          i += code[0].length;
          continue;
        }
      }

      if (char === '!' && source[i + 1] === '[') {
        const image = IMAGE.exec(rest);
        if (image) {
          flush(i);
          emit({
            kind: 'image',
            text: '',
            alt: image[1],
            src: stripAngles(image[2]),
            title: image[3] || '',
            marks: marks.slice(),
            href,
            sourceStart: map(base + i),
            sourceEnd: map(base + i + image[0].length),
          });
          i += image[0].length;
          continue;
        }
      }

      if (char === '[') {
        const footnote = FOOTNOTE_REF.exec(rest);
        if (footnote) {
          flush(i);
          emit({
            kind: 'footnoteRef',
            text: '',
            label: footnote[1],
            marks: marks.slice(),
            href,
            sourceStart: map(base + i),
            sourceEnd: map(base + i + footnote[0].length),
          });
          i += footnote[0].length;
          continue;
        }
        const link = LINK.exec(rest);
        if (link) {
          flush(i);
          const inner = link[1];
          const innerBase = base + i + 1;
          walk(inner, innerBase, marks.concat('link'), stripAngles(link[2]));
          i += link[0].length;
          continue;
        }
        const reference = REF_LINK.exec(rest);
        if (reference) {
          const label = (reference[2] || reference[1]).trim().toLowerCase();
          const definition = definitions.get(label);
          if (definition) {
            flush(i);
            walk(reference[1], base + i + 1, marks.concat('link'), definition.href);
            i += reference[0].length;
            continue;
          }
        }
      }

      if (char === '<') {
        const comment = HTML_COMMENT.exec(rest);
        if (comment) {
          flush(i);
          emit({
            kind: 'html',
            text: '',
            value: comment[0],
            comment: true,
            marks: marks.slice(),
            href,
            sourceStart: map(base + i),
            sourceEnd: map(base + i + comment[0].length),
          });
          i += comment[0].length;
          continue;
        }
        const auto = AUTOLINK.exec(rest);
        if (auto) {
          flush(i);
          emit({
            kind: 'text',
            text: auto[1],
            marks: marks.concat('link'),
            href: auto[1],
            sourceStart: map(base + i),
            sourceEnd: map(base + i + auto[0].length),
          });
          i += auto[0].length;
          continue;
        }
        const tag = HTML_TAG.exec(rest);
        if (tag) {
          flush(i);
          emit({
            kind: 'html',
            text: '',
            value: tag[0],
            comment: false,
            marks: marks.slice(),
            href,
            sourceStart: map(base + i),
            sourceEnd: map(base + i + tag[0].length),
          });
          i += tag[0].length;
          continue;
        }
      }

      if (char === '*' || char === '_' || char === '~') {
        const span = emphasisAt(source, i, char);
        if (span) {
          flush(i);
          walk(
            source.slice(i + span.delim, span.close),
            base + i + span.delim,
            marks.concat(span.mark),
            href,
          );
          i = span.close + span.delim;
          continue;
        }
      }

      if (!pending) pendingStart = i;
      pending += char;
      i += 1;
    }

    flush(source.length);
  }
}

/**
 * Emphasis delimiter test.
 *
 * The `_` variant requires a word boundary on both sides, which is why
 * `snake_case_identifier` stays literal text. The opener may not be followed by
 * whitespace and the closer may not be preceded by it, which is why `2 * 3`
 * stays literal too. Those two rules are the whole reason the character
 * blacklist in the source harness is not needed here.
 */
function emphasisAt(source, index, char) {
  const isDouble = source[index + 1] === char;
  const delim = isDouble ? 2 : 1;
  if (char === '~' && !isDouble) return null;

  const after = source[index + delim];
  if (after === undefined || /\s/.test(after)) return null;
  if (char === '_' && index > 0 && /[\p{L}\p{N}]/u.test(source[index - 1])) return null;

  const marker = char.repeat(delim);
  let search = index + delim;
  while (search < source.length) {
    const at = source.indexOf(marker, search);
    if (at === -1) return null;
    if (source[at - 1] === '\\') {
      search = at + delim;
      continue;
    }
    if (/\s/.test(source[at - 1])) {
      search = at + delim;
      continue;
    }
    if (!isDouble && source[at + 1] === char) {
      search = at + delim;
      continue;
    }
    if (char === '_' && /[\p{L}\p{N}]/u.test(source[at + delim] || '')) {
      search = at + delim;
      continue;
    }
    if (at === index + delim) {
      search = at + delim;
      continue;
    }
    const mark = char === '~' ? 'del' : isDouble ? 'strong' : 'em';
    return { close: at, delim, mark };
  }
  return null;
}

function stripAngles(value) {
  return String(value || '').replace(/^<|>$/g, '');
}

function decodeEntity(body) {
  if (body.startsWith('#x') || body.startsWith('#X')) {
    return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
  }
  if (body.startsWith('#')) return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
  return ENTITIES[body] ?? `&${body};`;
}

function buildOffsetMap(lines) {
  const bounds = [];
  let cursor = 0;
  for (const entry of lines) {
    bounds.push({ start: cursor, end: cursor + entry.text.length, offset: entry.offset });
    cursor += entry.text.length + 1;
  }
  return (local) => {
    for (const bound of bounds) {
      if (local <= bound.end) return bound.offset + Math.max(0, local - bound.start);
    }
    const last = bounds[bounds.length - 1];
    return last ? last.offset + (last.end - last.start) : local;
  };
}

function mergeAdjacentText(runs) {
  for (let i = runs.length - 1; i > 0; i -= 1) {
    const current = runs[i];
    const previous = runs[i - 1];
    if (current.kind !== 'text' || previous.kind !== 'text') continue;
    if (current.href !== previous.href) continue;
    if (current.marks.join('|') !== previous.marks.join('|')) continue;
    if (previous.end !== current.start) continue;
    previous.text += current.text;
    previous.end = current.end;
    previous.sourceEnd = current.sourceEnd;
    runs.splice(i, 1);
  }
}

// ---------------------------------------------------------------------------
// Traversal
// ---------------------------------------------------------------------------

/** Depth-first walk over every block, including list items and quoted blocks. */
export function* walkBlocks(blocks, ancestors = []) {
  for (const block of blocks) {
    yield { block, ancestors };
    if (block.children) yield* walkBlocks(block.children, ancestors.concat(block));
  }
}

/** Flat array of every block in document order. */
export function flatten(blocks) {
  return [...walkBlocks(blocks)].map((entry) => entry.block);
}
