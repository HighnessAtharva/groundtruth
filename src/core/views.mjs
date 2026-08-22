// Views over the block tree.
//
// One place decides what counts as prose. Every module asks here rather than
// re-deciding, which is why a `> [!TIP]` callout is scored in all three modules
// or in none of them, never in one.

import { walkBlocks, flatten } from './markdown.mjs';

const PROSE_TYPES = new Set(['paragraph', 'callout']);

/**
 * Blocks eligible for readability scoring and claim extraction.
 *
 * A blockquote is somebody else's words, so it is waived by default. A callout
 * is our own text wearing a blockquote's syntax, so it is not. That distinction
 * cost a debugging round in the harness this came from and it is worth keeping
 * in exactly one function.
 */
export function proseBlocks(blocks, options = {}) {
  const waiveQuotations = options.waiveQuotations ?? true;
  const waiveCallouts = options.waiveCallouts ?? false;
  const out = [];

  for (const { block, ancestors } of walkBlocks(blocks)) {
    if (!PROSE_TYPES.has(block.type)) continue;
    if (block.type === 'callout' && waiveCallouts) continue;
    if (waiveQuotations && ancestors.some((parent) => parent.type === 'blockquote')) continue;
    if (block.type === 'paragraph' || block.type === 'callout') out.push(block);
  }

  // A callout holds child paragraphs, so pull those in and drop the wrapper.
  const expanded = [];
  for (const block of out) {
    if (block.type === 'callout') {
      for (const { block: child } of walkBlocks(block.children || [])) {
        if (child.type === 'paragraph') expanded.push(child);
      }
      continue;
    }
    expanded.push(block);
  }
  return expanded;
}

/** Every block that can carry a citation mark. */
export function citableBlocks(blocks) {
  const out = [];
  for (const { block } of walkBlocks(blocks)) {
    if (block.type === 'paragraph' && block.readerText.trim()) out.push(block);
  }
  return out;
}

export function headings(blocks, depth = null) {
  return flatten(blocks).filter(
    (block) => block.type === 'heading' && (depth == null || block.depth === depth),
  );
}

export function images(blocks) {
  const out = [];
  for (const { block } of walkBlocks(blocks)) {
    for (const run of block.inlines || []) {
      if (run.kind === 'image') out.push({ ...run, block });
    }
    if (block.type === 'table') {
      for (const cell of tableCells(block)) {
        for (const run of cell.inlines || []) {
          if (run.kind === 'image') out.push({ ...run, block });
        }
      }
    }
  }
  return out;
}

export function links(blocks) {
  const out = [];
  for (const { block } of walkBlocks(blocks)) {
    for (const run of block.inlines || []) {
      if (run.href) out.push({ ...run, block });
    }
    if (block.type === 'table') {
      for (const cell of tableCells(block)) {
        for (const run of cell.inlines || []) {
          if (run.href) out.push({ ...run, block });
        }
      }
    }
  }
  return out;
}

export function fences(blocks) {
  return flatten(blocks).filter((block) => block.type === 'code' && block.fenced);
}

export function tableCells(table) {
  return [...(table.header || []), ...(table.rows || []).flat()];
}

/** Every piece of reader-visible text in the document, in order. */
export function documentText(blocks) {
  const parts = [];
  for (const { block } of walkBlocks(blocks)) {
    if (block.readerText) parts.push(block.readerText);
    if (block.type === 'table') {
      for (const cell of tableCells(block)) {
        if (cell.readerText) parts.push(cell.readerText);
      }
    }
  }
  return parts.join('\n\n');
}

/**
 * The blocks an answer engine reads: everything before the first section
 * heading.
 *
 * A leading H1 is the document's title, not a section boundary, so it does not
 * close the opening. Treating it as one measured every document's opening as
 * empty, which made the answer-first check pass on a page that opens with "In
 * this article we will" and fail on a page that answers in its first sentence.
 * Exactly backwards.
 */
export function openingBlocks(blocks, depth = 2) {
  const out = [];
  let seenTitle = false;
  for (const block of blocks) {
    if (block.type === 'heading') {
      if (block.depth === 1 && !seenTitle && out.every((entry) => !entry.readerText?.trim())) {
        seenTitle = true;
        continue;
      }
      if (block.depth <= depth) break;
    }
    out.push(block);
  }
  return out;
}

/** Blocks that sit under a heading matching `pattern`, until the next same-or-shallower heading. */
export function underHeading(blocks, pattern) {
  const flat = flatten(blocks);
  const out = [];
  let capturing = false;
  let depth = 0;

  for (const block of flat) {
    if (block.type === 'heading') {
      if (capturing && block.depth <= depth) capturing = false;
      if (!capturing && pattern.test(block.readerText)) {
        capturing = true;
        depth = block.depth;
        continue;
      }
      if (capturing) out.push(block);
      continue;
    }
    if (capturing) out.push(block);
  }
  return out;
}

/**
 * Query helpers handed to every rule, built once per document.
 *
 * A custom rule in a user's config gets the same object the built-in rules get,
 * which is what makes "write your own rule" a two-line job rather than a fork.
 */
export function makeQuery(blocks, options = {}) {
  return {
    all: () => flatten(blocks),
    prose: () => proseBlocks(blocks, options),
    citable: () => citableBlocks(blocks),
    headings: (depth) => headings(blocks, depth),
    images: () => images(blocks),
    links: () => links(blocks),
    fences: () => fences(blocks),
    opening: (depth) => openingBlocks(blocks, depth),
    underHeading: (pattern) => underHeading(blocks, pattern),
    text: () => documentText(blocks),
    root: blocks,
  };
}
