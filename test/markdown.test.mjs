import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown, flatten, parseInlines } from '../src/core/markdown.mjs';
import { splitFrontmatter } from '../src/core/frontmatter.mjs';

function parseFile(source) {
  const { data, body, bodyLine } = splitFrontmatter(source);
  const startOffset = source.length - body.length;
  const { blocks } = parseMarkdown(body, { startLine: bodyLine, startOffset });
  return { data, blocks, all: flatten(blocks), source };
}

/**
 * The guarantee the whole tool rests on: every inline run's source offsets
 * point at the real characters in the real file.
 */
function assertOffsetsPointAtSource(all, source) {
  for (const block of all) {
    for (const run of block.inlines || []) {
      const slice = source.slice(run.sourceStart, run.sourceEnd);
      assert.ok(
        run.sourceStart >= 0 && run.sourceEnd <= source.length,
        `run offsets out of range: ${JSON.stringify(run)}`,
      );
      if (run.kind === 'text' && run.text.trim() && !run.text.includes(' ')) {
        assert.ok(
          slice.includes(run.text) || run.text.includes(slice.trim()),
          `offset mismatch for ${JSON.stringify(run.text)}: source says ${JSON.stringify(slice)}`,
        );
      }
    }
  }
}

test('frontmatter split preserves the body line number', () => {
  const source = ['---', 'title: Hello', 'tags: [a, b]', '---', '', '# Heading', '', 'Body text.'].join('\n');
  const { data, body, bodyLine } = splitFrontmatter(source);
  assert.equal(data.title, 'Hello');
  assert.deepEqual(data.tags, ['a', 'b']);
  assert.equal(bodyLine, 5);
  assert.ok(body.startsWith('\n# Heading'));
});

test('a document with no frontmatter starts at line 1', () => {
  const { data, body, bodyLine } = splitFrontmatter('# Just a heading\n');
  assert.deepEqual(data, {});
  assert.equal(bodyLine, 1);
  assert.equal(body, '# Just a heading\n');
});

test('heading line numbers are file line numbers, not body offsets', () => {
  const source = ['---', 'title: T', '---', '', '# One', '', 'Text.', '', '## Two'].join('\n');
  const { all } = parseFile(source);
  const headings = all.filter((block) => block.type === 'heading');
  assert.equal(headings.length, 2);
  assert.equal(headings[0].line, 5);
  assert.equal(headings[0].depth, 1);
  assert.equal(headings[0].readerText, 'One');
  assert.equal(headings[1].line, 9);
  assert.equal(headings[1].depth, 2);
});

test('inline source offsets point at the real characters', () => {
  const source = [
    '---',
    'title: T',
    '---',
    '',
    'The **limiter** tracks work with a `counter` and a [queue](https://example.com).',
    '',
    '- an item with `code`',
    '- another item',
  ].join('\n');
  const { all, source: raw } = parseFile(source);
  assertOffsetsPointAtSource(all, raw);

  const paragraph = all.find((block) => block.type === 'paragraph');
  assert.equal(
    paragraph.readerText,
    'The limiter tracks work with a counter and a queue.',
  );

  const limiter = paragraph.inlines.find((run) => run.text === 'limiter');
  assert.equal(raw.slice(limiter.sourceStart, limiter.sourceEnd), 'limiter');
  assert.deepEqual(limiter.marks, ['strong']);

  const counter = paragraph.inlines.find((run) => run.kind === 'code');
  assert.equal(counter.text, 'counter');
  assert.equal(raw.slice(counter.sourceStart, counter.sourceEnd), '`counter`');

  const queue = paragraph.inlines.find((run) => run.href);
  assert.equal(queue.text, 'queue');
  assert.equal(queue.href, 'https://example.com');
});

test('snake_case and arithmetic are not emphasis', () => {
  const { inlines, readerText } = parseInlines([
    { text: 'Set snake_case_name and compute 2 * 3 * 4 in the config.', offset: 0, line: 1 },
  ]);
  assert.equal(readerText, 'Set snake_case_name and compute 2 * 3 * 4 in the config.');
  assert.ok(inlines.every((run) => run.marks.length === 0));
});

test('real emphasis still parses, including nested', () => {
  const { readerText, inlines } = parseInlines([
    { text: 'This is **very *important* stuff** and ~~gone~~.', offset: 0, line: 1 },
  ]);
  assert.equal(readerText, 'This is very important stuff and gone.');
  const important = inlines.find((run) => run.text === 'important');
  assert.deepEqual(important.marks, ['strong', 'em']);
  const gone = inlines.find((run) => run.text === 'gone');
  assert.deepEqual(gone.marks, ['del']);
});

test('images contribute no reader text, so a match can never land in alt', () => {
  const { readerText, inlines } = parseInlines([
    { text: 'Before ![a chart of completion rates](/img/chart.svg) after.', offset: 0, line: 1 },
  ]);
  assert.equal(readerText, 'Before  after.');
  const image = inlines.find((run) => run.kind === 'image');
  assert.equal(image.alt, 'a chart of completion rates');
  assert.equal(image.src, '/img/chart.svg');
  assert.equal(image.text, '');
});

test('fenced code is its own block and carries its language', () => {
  const source = ['Intro.', '', '```js', 'const x = 1;', '```', '', 'Outro.'].join('\n');
  const { all } = parseFile(source);
  const code = all.find((block) => block.type === 'code');
  assert.equal(code.lang, 'js');
  assert.equal(code.value, 'const x = 1;');
  assert.equal(code.line, 3);
  assert.equal(all.filter((block) => block.type === 'paragraph').length, 2);
});

test('an untagged fence records an empty language', () => {
  const { all } = parseFile('```\nplain\n```\n');
  const code = all.find((block) => block.type === 'code');
  assert.equal(code.lang, '');
  assert.equal(code.fenced, true);
});

test('blockquote and callout are different block types', () => {
  const source = ['> Someone else said this.', '', '> [!TIP] Our own tip.', '> Second line.'].join('\n');
  const { all } = parseFile(source);
  const quote = all.find((block) => block.type === 'blockquote');
  const callout = all.find((block) => block.type === 'callout');
  assert.ok(quote, 'expected a blockquote');
  assert.ok(callout, 'expected a callout');
  assert.equal(callout.kind, 'TIP');
  const quoted = quote.children.map((child) => child.readerText).join(' ');
  assert.equal(quoted, 'Someone else said this.');
});

test('lists nest and every item keeps its own line', () => {
  const source = ['- first item', '- second item', '  - nested item', '- third item'].join('\n');
  const { blocks, all } = parseFile(source);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'list');
  assert.equal(blocks[0].ordered, false);
  const items = all.filter((block) => block.type === 'listItem');
  assert.equal(items.length, 4);
  assert.deepEqual(items.map((item) => item.line), [1, 2, 3, 4]);
  const nested = items.find((item) => item.line === 3);
  assert.equal(nested.children[0].readerText, 'nested item');
});

test('ordered lists record their start', () => {
  const { blocks } = parseFile('3. third\n4. fourth\n');
  assert.equal(blocks[0].ordered, true);
  assert.equal(blocks[0].start, 3);
});

test('tables split into header and rows with alignment', () => {
  const source = ['| Name | Weight |', '| --- | ---: |', '| Rivers | 10.0 |', '| Uchigatana | 5.5 |'].join('\n');
  const { all } = parseFile(source);
  const table = all.find((block) => block.type === 'table');
  assert.equal(table.header.length, 2);
  assert.equal(table.header[0].readerText.trim(), 'Name');
  assert.deepEqual(table.align, [null, 'right']);
  assert.equal(table.rows.length, 2);
  assert.equal(table.rows[0][1].readerText.trim(), '10.0');
});

test('html comments are captured and contribute no reader text', () => {
  const { readerText, inlines } = parseInlines([
    { text: 'Text <!-- TODO: fix this --> more text.', offset: 0, line: 1 },
  ]);
  assert.equal(readerText, 'Text  more text.');
  assert.equal(inlines.find((run) => run.kind === 'html').comment, true);
});

test('a paragraph that wraps across lines joins with a single space', () => {
  const source = 'A sentence that\nwraps across two lines.\n';
  const { all, source: raw } = parseFile(source);
  const paragraph = all.find((block) => block.type === 'paragraph');
  assert.equal(paragraph.readerText, 'A sentence that wraps across two lines.');
  assert.equal(paragraph.line, 1);
  assert.equal(paragraph.endLine, 2);
  assertOffsetsPointAtSource(all, raw);
});

test('offsets survive de-indenting inside a list item', () => {
  const source = ['# Title', '', '- item with **bold** text', ''].join('\n');
  const { all, source: raw } = parseFile(source);
  assertOffsetsPointAtSource(all, raw);
  const item = all.find((block) => block.type === 'listItem');
  const bold = item.children[0].inlines.find((run) => run.text === 'bold');
  assert.equal(raw.slice(bold.sourceStart, bold.sourceEnd), 'bold');
});

test('offsets survive de-indenting inside a blockquote', () => {
  const source = ['> quoted with **bold** inside', ''].join('\n');
  const { all, source: raw } = parseFile(source);
  assertOffsetsPointAtSource(all, raw);
  const quote = all.find((block) => block.type === 'blockquote');
  const bold = quote.children[0].inlines.find((run) => run.text === 'bold');
  assert.equal(raw.slice(bold.sourceStart, bold.sourceEnd), 'bold');
});

test('reference links resolve through their definition', () => {
  const source = ['See [the spec][spec] for detail.', '', '[spec]: https://example.com/spec'].join('\n');
  const { all } = parseFile(source);
  const paragraph = all.find((block) => block.type === 'paragraph');
  assert.equal(paragraph.readerText, 'See the spec for detail.');
  assert.equal(paragraph.inlines.find((run) => run.href)?.href, 'https://example.com/spec');
});

test('setext headings are headings', () => {
  const { all } = parseFile('My Title\n========\n\nBody.\n');
  const heading = all.find((block) => block.type === 'heading');
  assert.equal(heading.depth, 1);
  assert.equal(heading.readerText, 'My Title');
});

test('CRLF input produces the same reader text as LF', () => {
  const lf = parseFile('# A\n\nSome **text** here.\n');
  const crlf = parseFile('# A\r\n\r\nSome **text** here.\r\n');
  assert.equal(
    lf.all.map((block) => block.readerText).join('|'),
    crlf.all.map((block) => block.readerText).join('|'),
  );
});
