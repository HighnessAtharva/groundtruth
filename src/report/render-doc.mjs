// Render a document to HTML, with citation marks and readability underlines
// woven into the prose.
//
// This walks the same block tree the checker walked. It does not parse the
// markdown a second time, and that is not a performance decision. If the report
// rendered through a second parser, a span could verify in `check` and fail to
// highlight in `report` with no error anywhere, which is exactly the two-rulers
// failure the source harness avoids by shelling one checker out to the other.
//
// Marks are emitted here, at build time, from character offsets. The source
// harness resolves overlap in the browser with a running indexOf over the
// remaining text, which is why it has to sort spans longest-match-first before
// rendering. With offsets there is nothing left for that sort to protect against.

import { escapeHtml, attrs } from './html.mjs';
import { walkBlocks } from '../core/markdown.mjs';
import { tableCells } from '../core/views.mjs';

/**
 * @param {object} options
 * @param {Map<object, Array>} options.annotationsByBlock
 *   block -> [{ kind: 'span'|'read', start, end, id, verdict?, band? }]
 */
export function renderDocumentBody(doc, { annotationsByBlock = new Map() } = {}) {
  return renderBlocks(doc.blocks, { annotationsByBlock, doc });
}

function renderBlocks(blocks, context) {
  const out = [];
  for (const block of blocks) out.push(renderBlock(block, context));
  return out.filter(Boolean).join('\n');
}

function renderBlock(block, context) {
  switch (block.type) {
    case 'heading':
      return `<h${block.depth} id="${headingId(block)}" data-line="${block.line}">${renderInlines(block, context)}</h${block.depth}>`;

    case 'paragraph':
      return `<p data-line="${block.line}">${renderInlines(block, context)}</p>`;

    case 'thematicBreak':
      return '<hr>';

    case 'code':
      return [
        `<div class="gt-scroll" data-line="${block.line}">`,
        `<pre><code${block.lang ? ` class="language-${escapeHtml(block.lang)}"` : ' class="gt-untagged"'}>`,
        escapeHtml(block.value),
        '</code></pre></div>',
      ].join('');

    case 'blockquote':
      return `<blockquote data-line="${block.line}">${renderBlocks(block.children || [], context)}</blockquote>`;

    case 'callout':
      return [
        `<aside class="gt-callout gt-callout-${escapeHtml(String(block.kind || 'note').toLowerCase())}" data-line="${block.line}">`,
        `<p class="gt-callout-kind">${escapeHtml(block.kind || 'NOTE')}</p>`,
        renderBlocks(block.children || [], context),
        '</aside>',
      ].join('');

    case 'list':
      return [
        `<${block.ordered ? 'ol' : 'ul'}${block.ordered && block.start && block.start !== 1 ? ` start="${block.start}"` : ''} data-line="${block.line}">`,
        (block.children || []).map((item) => `<li data-line="${item.line}">${renderBlocks(item.children || [], context)}</li>`).join('\n'),
        `</${block.ordered ? 'ol' : 'ul'}>`,
      ].join('\n');

    case 'table':
      return renderTable(block, context);

    case 'html':
      // A verification tool that executes arbitrary embedded HTML in its own
      // report is a bad idea. Shown as a literal instead.
      return `<div class="gt-scroll"><pre class="gt-raw-html" data-line="${block.line}">${escapeHtml(block.value)}</pre></div>`;

    default:
      return block.readerText ? `<p data-line="${block.line}">${renderInlines(block, context)}</p>` : '';
  }
}

function renderTable(block, context) {
  const cell = (entry, tag, index) => {
    const align = block.align?.[index];
    return `<${tag}${align ? ` style="text-align:${align}"` : ''}>${renderInlines(entry, context)}</${tag}>`;
  };
  return [
    `<div class="gt-scroll" data-line="${block.line}"><table>`,
    block.header?.length
      ? `<thead><tr>${block.header.map((entry, index) => cell(entry, 'th', index)).join('')}</tr></thead>`
      : '',
    '<tbody>',
    (block.rows || [])
      .map((row) => `<tr>${row.map((entry, index) => cell(entry, 'td', index)).join('')}</tr>`)
      .join('\n'),
    '</tbody></table></div>',
  ].join('');
}

/**
 * Slice a block's inline runs at every annotation boundary, then emit each
 * segment wrapped in its annotations and its inline formatting.
 *
 * Nesting order is fixed: the citation mark is outermost, the readability
 * underline sits inside it, and inline formatting sits inside that. A sentence
 * that is both cited and hard therefore nests cleanly rather than producing
 * crossed tags.
 */
function renderInlines(block, context) {
  const runs = block.inlines || [];
  if (!runs.length) return escapeHtml(block.readerText || '');

  const annotations = context.annotationsByBlock?.get(block) || [];
  const cuts = new Set([0, block.readerText.length]);
  for (const run of runs) {
    cuts.add(run.start);
    cuts.add(run.end);
  }
  for (const annotation of annotations) {
    cuts.add(annotation.start);
    cuts.add(annotation.end);
  }

  const points = [...cuts].filter((point) => point >= 0 && point <= block.readerText.length).sort((a, b) => a - b);
  const segments = [];

  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    if (end <= start) continue;

    const run = runs.find((entry) => entry.start <= start && entry.end >= end && entry.text);
    const covering = annotations.filter((entry) => entry.start <= start && entry.end >= end);
    const text = block.readerText.slice(start, end);

    // Non-text runs that sit at this boundary (an image, a comment) are emitted
    // once, in order, before the segment they precede.
    for (const entry of runs) {
      if (entry.text || entry.start !== start) continue;
      if (entry.kind === 'image') segments.push({ raw: renderImage(entry) });
      if (entry.kind === 'footnoteRef') segments.push({ raw: `<sup class="gt-fn">[${escapeHtml(entry.label)}]</sup>` });
    }

    if (!text) continue;
    segments.push({ text, run, annotations: covering });
  }

  // Trailing non-text runs.
  for (const entry of runs) {
    if (entry.text || entry.start !== block.readerText.length) continue;
    if (entry.kind === 'image') segments.push({ raw: renderImage(entry) });
  }

  return segments.map((segment) => renderSegment(segment)).join('');
}

function renderSegment(segment) {
  if (segment.raw) return segment.raw;

  let html = escapeHtml(segment.text);
  const run = segment.run;

  if (run) {
    if (run.kind === 'code') html = `<code>${html}</code>`;
    for (const mark of run.marks || []) {
      if (mark === 'strong') html = `<strong>${html}</strong>`;
      else if (mark === 'em') html = `<em>${html}</em>`;
      else if (mark === 'del') html = `<del>${html}</del>`;
    }
    if (run.href) {
      const external = /^https?:/i.test(run.href);
      html = `<a${attrs({
        href: run.href,
        rel: external ? 'noopener noreferrer nofollow' : null,
        target: external ? '_blank' : null,
      })}>${html}</a>`;
    }
  }

  const read = (segment.annotations || []).find((entry) => entry.kind === 'read');
  if (read) {
    html = `<span class="gt-read gt-band-${escapeHtml(read.band)}"${attrs({ 'data-read': read.id, tabindex: '0' })}>${html}</span>`;
  }

  const span = (segment.annotations || []).find((entry) => entry.kind === 'span');
  if (span) {
    // The hue has to be written onto the element. Without it every mark falls
    // back to the stylesheet default and a contradicted claim renders identical
    // to a verified one, which loses the only thing a skimmer reads.
    html = `<mark class="gt-span gt-v-${slug(span.verdict)}${span.emphatic ? ' gt-emphatic' : ''}"${attrs({
      style: `--h:${span.hue ?? 210}`,
      'data-span': span.id,
      'data-verdict': span.verdict,
      tabindex: '0',
    })}>${html}</mark>`;
  }

  return html;
}

function renderImage(run) {
  return `<figure class="gt-figure"><img${attrs({
    src: run.src,
    alt: run.alt || '',
    loading: 'lazy',
  })}><figcaption>${escapeHtml(run.alt || '(no alt text)')}</figcaption></figure>`;
}

export function headingId(block) {
  return `h-${block.line}-${slug(block.readerText).slice(0, 40) || 'section'}`;
}

export function slug(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Every block that can carry an annotation, in document order. */
export function annotatableBlocks(blocks) {
  const out = [];
  for (const { block } of walkBlocks(blocks)) {
    out.push(block);
    if (block.type === 'table') out.push(...tableCells(block));
  }
  return out;
}
