// Shred a document into the views the SEO checks measure.
//
// This runs over the parsed block tree, not over raw lines. The source harness
// scans raw lines with a fence-tracking boolean, which means it re-derives what a
// heading is, what a table is, and where a code fence ends, separately from the
// renderer. Reading the tree instead means a keyword inside a SQL sample is
// structurally not prose, rather than masked out by a second parser that could
// disagree.

import { wordCount } from './keyword.mjs';
import { tableCells } from '../../core/views.mjs';

/** A question line inside an FAQ block: a bold run whose text ends in a `?`. */
function faqPairs(blocks, faqHeadingPattern) {
  const flat = blocks.all();
  const start = flat.findIndex(
    (block) => block.type === 'heading' && faqHeadingPattern.test(block.readerText),
  );
  if (start === -1) return { present: false, heading: null, pairs: [], text: '' };

  const heading = flat[start];
  const pairs = [];
  const collected = [];
  let current = null;

  for (let i = start + 1; i < flat.length; i += 1) {
    const block = flat[i];
    if (block.type === 'heading' && block.depth <= heading.depth) break;
    collected.push(block);

    if (block.type === 'heading') {
      if (/\?\s*$/.test(block.readerText)) {
        if (current) pairs.push(current);
        current = { question: block.readerText.trim(), answer: '', line: block.line };
      }
      continue;
    }

    const bold = (block.inlines || []).filter((run) => run.marks?.includes('strong'));
    const boldText = bold.map((run) => run.text).join(' ').trim();
    if (boldText && /\?\s*$/.test(boldText)) {
      if (current) pairs.push(current);
      const rest = block.readerText.slice(block.readerText.indexOf(boldText) + boldText.length);
      current = { question: boldText, answer: rest.trim(), line: block.line };
      continue;
    }

    if (current) current.answer = `${current.answer} ${block.readerText}`.trim();
  }
  if (current) pairs.push(current);

  return {
    present: true,
    heading,
    pairs,
    text: collected.map((block) => block.readerText).filter(Boolean).join('\n'),
  };
}

export function shred(doc, settings = {}) {
  const blocks = doc.query;
  const faqHeading = settings.faqHeading || /^frequently asked/i;

  const headings = blocks.headings();
  const h1s = headings.filter((block) => block.depth === 1);
  const h2s = headings.filter((block) => block.depth === 2);
  const h3s = headings.filter((block) => block.depth === 3);

  const faq = faqPairs(blocks, faqHeading);
  const faqLines = new Set(faq.pairs.map((pair) => pair.line));

  const prose = blocks
    .prose()
    .filter((block) => !faqLines.has(block.line))
    .map((block) => block.readerText)
    .filter(Boolean);

  const tables = blocks.all().filter((block) => block.type === 'table');
  const fences = blocks.fences();
  const imageList = blocks.images();
  const linkList = blocks.links();

  const internal = linkList.filter((link) => !/^https?:/i.test(link.href) && !/^(mailto:|tel:)/i.test(link.href));
  const external = linkList.filter((link) => /^https?:/i.test(link.href));

  // The opening is everything before the first H2. That is what an answer engine
  // lifts, and it is the only slot where "answer first" can be measured.
  const opening = blocks.opening(2).filter((block) => block.readerText);
  const openingText = opening.map((block) => block.readerText).join('\n');

  const proseText = prose.join('\n');
  const readable = [proseText, h2s.map((block) => block.readerText).join('\n'), faq.text]
    .filter(Boolean)
    .join('\n');

  return {
    h1s,
    h2s,
    h3s,
    headings,
    faq,
    prose,
    proseText,
    readable,
    readableWords: wordCount(readable),
    bodyWords: wordCount(doc.query.text()),
    opening,
    openingText,
    openingWords: wordCount(openingText),
    tables,
    fences,
    images: imageList,
    links: { internal, external, all: linkList },
    tableCellText: tables.flatMap((table) => tableCells(table).map((cell) => cell.readerText)).join(' '),
  };
}
