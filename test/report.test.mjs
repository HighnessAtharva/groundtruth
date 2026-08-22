import test from 'node:test';
import assert from 'node:assert/strict';
import { Document } from '../src/core/document.mjs';
import { renderDocumentBody } from '../src/report/render-doc.mjs';
import { verifySpan } from '../src/modules/grounding/verify.mjs';
import { page, escapeHtml, jsonScript } from '../src/report/html.mjs';
import { CSS } from '../src/report/assets/css.mjs';
import { JS } from '../src/report/assets/js.mjs';
import { DEFAULT_VERDICTS } from '../src/core/config.mjs';
import path from 'node:path';
import { tmpdir } from 'node:os';

function doc(source) {
  return new Document({
    absolutePath: path.join(tmpdir(), 'a.md'),
    relativePath: 'a.md',
    source,
    profile: { grounding: { enabled: true } },
    profileName: 'grounded',
  });
}

function markup(source, spans) {
  const document = doc(source);
  const annotationsByBlock = new Map();
  for (const [index, span] of spans.entries()) {
    const verification = verifySpan(span, document);
    const verdict = DEFAULT_VERDICTS[span.verdict] || {};
    for (const placement of verification.placements) {
      const list = annotationsByBlock.get(placement.block) || [];
      list.push({
        kind: 'span',
        id: String(index),
        start: placement.start,
        end: placement.end,
        verdict: span.verdict,
        hue: verdict.hue,
        emphatic: Boolean(verdict.emphatic),
      });
      annotationsByBlock.set(placement.block, list);
    }
  }
  return renderDocumentBody(document, { annotationsByBlock });
}

test('a mark carries its verdict hue, so two verdicts never look alike', () => {
  // Without the inline hue every mark falls back to the stylesheet default and a
  // contradicted claim renders identical to a verified one, which loses the only
  // thing a skimmer reads. Caught in a browser, pinned here.
  const html = markup('Alpha is true. Beta is false.', [
    { match: 'Alpha is true', verdict: 'VERIFIED' },
    { match: 'Beta is false', verdict: 'CONTRADICTED' },
  ]);
  assert.match(html, /gt-v-verified" style="--h:158"/);
  assert.match(html, /gt-v-contradicted gt-emphatic" style="--h:350"/);
});

test('an emphatic verdict gets the emphatic class and a clean one does not', () => {
  const html = markup('Alpha is true. Gamma is unsupported.', [
    { match: 'Alpha is true', verdict: 'VERIFIED' },
    { match: 'Gamma is unsupported', verdict: 'UNSOURCED' },
  ]);
  assert.ok(html.includes('gt-v-unsourced gt-emphatic'));
  assert.ok(!html.includes('gt-v-verified gt-emphatic'));
});

test('a mark that crosses a bold run becomes several marks sharing one span id', () => {
  const html = markup('It reaches **thirteen platforms** through native drivers.', [
    { match: 'reaches thirteen platforms through native drivers', verdict: 'VERIFIED' },
  ]);
  const marks = html.match(/data-span="0"/g) || [];
  assert.ok(marks.length >= 3, `expected several marks, got ${marks.length}: ${html}`);
  assert.ok(html.includes('<strong>'), 'the bold run must survive inside the mark');
});

test('a link inside a marked sentence keeps its href and gets rel on an external target', () => {
  const html = markup('See [the spec](https://example.org/spec) for the detail here.', [
    { match: 'See the spec for the detail here', verdict: 'VERIFIED' },
  ]);
  assert.match(html, /href="https:\/\/example\.org\/spec"/);
  assert.match(html, /rel="noopener noreferrer nofollow"/);
});

test('an image renders as a figure whose caption is its alt text', () => {
  const html = markup('Before.\n\n![a bar chart of finish rates](/img/c.png)\n\nAfter.', []);
  assert.match(html, /<figure class="gt-figure">/);
  assert.match(html, /alt="a bar chart of finish rates"/);
  assert.match(html, /<figcaption>a bar chart of finish rates<\/figcaption>/);
});

test('raw HTML in the source is escaped and shown, never executed', () => {
  const html = markup('<script>alert(1)</script>\n\nNormal text.', []);
  assert.ok(!html.includes('<script>alert'), 'a verification tool must not run embedded HTML in its own report');
  assert.match(html, /&lt;script&gt;alert\(1\)/);
});

test('an untagged code fence is marked in the output', () => {
  const tagged = markup('```js\nconst x = 1;\n```', []);
  const untagged = markup('```\nconst x = 1;\n```', []);
  assert.match(tagged, /class="language-js"/);
  assert.match(untagged, /class="gt-untagged"/);
});

test('a table is wrapped in its own scroll container', () => {
  const html = markup('| A | B |\n| --- | ---: |\n| 1 | 2 |\n', []);
  assert.match(html, /<div class="gt-scroll"[^>]*><table>/);
  assert.match(html, /style="text-align:right"/);
});

test('a callout is our prose and a blockquote is somebody else, and they render differently', () => {
  const html = markup('> [!TIP] Our own tip here.\n\n> Somebody else said this.\n', []);
  assert.match(html, /class="gt-callout gt-callout-tip"/);
  assert.match(html, /<blockquote/);
});

test('escaping covers the five characters that break HTML', () => {
  assert.equal(escapeHtml(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
});

test('inlined JSON cannot close its own script tag', () => {
  const html = jsonScript('gt-data', { evil: '</script><script>alert(1)</script>' });
  assert.ok(!html.includes('</script><script>'), html);
  assert.ok(html.includes('\\u003c/script\\u003e'));
});

test('a page is self-contained: no external host appears anywhere in it', () => {
  const html = page({ title: 'T', css: CSS, js: JS, body: '<p>hi</p>', data: { spans: {} } });
  const remote = html.match(/(?:src|href)="https?:\/\/[^"]+"/g) || [];
  assert.deepEqual(remote, [], `found remote references: ${remote.join(', ')}`);
  assert.ok(html.includes('<style>'), 'CSS must be inlined');
  assert.ok(!html.includes('rel="stylesheet"'), 'no external stylesheet');
});

test('the theme is applied before first paint so a dark page does not flash white', () => {
  const html = page({ title: 'T', css: '', js: '', body: '' });
  const headEnd = html.indexOf('</head>');
  const themeScript = html.indexOf("localStorage.getItem('gtTheme')");
  assert.ok(themeScript > 0 && themeScript < headEnd, 'the theme script must run inside <head>');
});

test('the stylesheet defines every colour on bare :root, not only inside a media query', () => {
  // A colour whose only definition sits inside a media block borrows the host
  // theme when the viewer has no explicit preference.
  const rootBlock = CSS.slice(CSS.indexOf(':root {'), CSS.indexOf('@media'));
  for (const token of ['--bg', '--surface', '--border', '--text', '--accent', '--error', '--warn', '--ok']) {
    assert.ok(rootBlock.includes(`${token}:`), `${token} is not defined on bare :root`);
  }
});

test('the stylesheet never hides a horizontal overflow bug on the root', () => {
  assert.ok(!/html\s*\{[^}]*overflow-x:\s*hidden/.test(CSS));
  assert.ok(!/body\s*\{[^}]*overflow-x:\s*hidden/.test(CSS));
  assert.ok(CSS.includes('.gt-scroll { overflow-x: auto'), 'wide content scrolls inside its own box');
  assert.ok(CSS.includes('minmax(0, 1fr)'), 'the grid must not use a bare 1fr');
});

test('the hover cue never uses filter, which would trap the card z-index', () => {
  const hover = CSS.slice(CSS.indexOf('.gt-span:hover'), CSS.indexOf('.gt-read'));
  assert.ok(!hover.includes('filter'), 'a filter creates a stacking context and traps the card');
  assert.ok(hover.includes('z-index'));
});

test('the card is fixed, because an overflow ancestor clips an absolute descendant', () => {
  const card = CSS.slice(CSS.indexOf('.gt-card {'), CSS.indexOf('.gt-card-verdict'));
  assert.match(card, /position:\s*fixed/);
  assert.match(card, /width:\s*min\(380px, calc\(100vw - 24px\)\)/);
});

test('the page script anchors to the first client rect, not the bounding box', () => {
  assert.ok(JS.includes('getClientRects()'), 'a wrapped sentence needs its first line, not its bounding box');
  assert.ok(JS.includes("event.key === 'Escape'"), 'keyboard reviewers exist');
});
