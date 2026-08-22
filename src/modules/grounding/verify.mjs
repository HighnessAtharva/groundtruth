// The verbatim-substring guarantee, and the placement rule.
//
// The source harness rejects a match containing any of `* ` [ ] _` because its
// verifier cannot see the tree its renderer will build, so it guesses with a
// character blacklist. That blacklist is wrong in both directions: it rejects
// `snake_case_name` and `2 * 3`, which the renderer would happily wrap, and it
// accepts a match containing a footnote reference or an autolink, which it should
// not.
//
// Here the verifier reads the same tree the renderer reads, so it asks the real
// question. A span is valid when its match occurs in the reader text of exactly
// one prose block. A match may cross a bold run or a link, and the report emits
// several <mark> elements sharing one span id, so citing a sentence that contains
// a link finally works.
//
// A match can never land inside an image alt attribute or an HTML comment,
// because neither contributes reader text. That constraint enforces itself.

/**
 * @returns {{ ok: boolean, placements: Placement[], count: number, reason: string|null }}
 * @typedef {{ block: object, blockIndex: number, start: number, end: number,
 *             runs: Array<{ run: object, from: number, to: number }> }} Placement
 */
export function verifySpan(span, doc, options = {}) {
  const onDuplicate = options.onDuplicateMatch || 'error';
  const match = String(span.match ?? '');

  if (!match.trim()) {
    return { ok: false, placements: [], count: 0, reason: 'match is empty' };
  }

  const blocks = doc.query.citable();
  const placements = [];

  for (const [blockIndex, block] of blocks.entries()) {
    let from = 0;
    for (;;) {
      const at = block.readerText.indexOf(match, from);
      if (at === -1) break;
      placements.push({
        block,
        blockIndex,
        start: at,
        end: at + match.length,
        runs: runsCovering(block, at, at + match.length),
      });
      from = at + Math.max(1, match.length);
    }
  }

  if (placements.length === 0) {
    return { ok: false, placements: [], count: 0, reason: 'not found in the document body' };
  }

  if (placements.length > 1) {
    if (onDuplicate === 'error') {
      return {
        ok: false,
        placements,
        count: placements.length,
        reason: `appears ${placements.length} times in the body`,
      };
    }
    if (onDuplicate === 'first') {
      return { ok: true, placements: [placements[0]], count: placements.length, reason: null };
    }
  }

  return { ok: true, placements, count: placements.length, reason: null };
}

/**
 * Which inline runs a reader-text range covers, and how much of each.
 *
 * This is what the report slices to emit marks. Overlap is resolved once here, at
 * build time, from offsets. The source harness resolves it in the browser with a
 * running `indexOf` over the remaining text, which is why it has to sort spans
 * longest-match-first before rendering. With offsets there is nothing left for
 * that sort to protect against.
 */
export function runsCovering(block, start, end) {
  const out = [];
  for (const run of block.inlines || []) {
    if (run.end <= start || run.start >= end) continue;
    if (!run.text) continue;
    const from = Math.max(start, run.start);
    const to = Math.min(end, run.end);
    if (to <= from) continue;
    out.push({
      run,
      from,
      to,
      text: run.text.slice(from - run.start, to - run.start),
      sourceStart: run.sourceStart + (from - run.start),
      sourceEnd: run.sourceStart + (to - run.start),
    });
  }
  return out;
}

/** 1-based line in the file where a placement starts. */
export function lineOfPlacement(doc, placement) {
  const first = placement.runs[0];
  return doc.lineAt(first ? first.sourceStart : placement.block.offset);
}

const TOKEN = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

/**
 * Best replacement for a match that no longer occurs.
 *
 * Solves the recurring cost the source harness names in its own README: editing a
 * document's prose desyncs its spans.
 *
 * The search slides a word window rather than comparing whole sentences, because
 * a match is usually a fragment of a sentence rather than a whole one. Compared
 * sentence to fragment, the correct answer for a five-word span inside a
 * fourteen-word sentence scored 0.40 and the repair was refused. Windowed, the
 * same pair scores above 0.9.
 *
 * The returned text is always a real substring of the document's reader text, so
 * applying it cannot break the verbatim guarantee.
 *
 * One candidate above `accept` with nothing else above `ambiguous` is safe to
 * apply. Anything else returns the top three and changes nothing, because a fuzzy
 * patch applied silently is a corruption.
 */
export function suggestMatch(match, doc, { similarity, accept = 0.82, ambiguous = 0.6 } = {}) {
  const target = String(match);
  const wanted = (target.match(TOKEN) || []).length;
  if (!wanted) return { confident: false, best: null, top: [] };

  const widths = [];
  for (let width = Math.max(1, wanted - 2); width <= wanted + 3; width += 1) widths.push(width);

  const candidates = [];

  for (const block of doc.query.citable()) {
    const text = block.readerText;
    const tokens = [];
    TOKEN.lastIndex = 0;
    for (const hit of text.matchAll(TOKEN)) {
      tokens.push({ start: hit.index, end: hit.index + hit[0].length });
    }

    for (let i = 0; i < tokens.length; i += 1) {
      for (const width of widths) {
        const last = tokens[i + width - 1];
        if (!last) break;
        const candidate = text.slice(tokens[i].start, last.end);
        const score = similarity(target, candidate);
        if (score <= 0) continue;
        candidates.push({ text: candidate, score, block, start: tokens[i].start });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.text.length - b.text.length);

  // Two overlapping windows of the same sentence are one answer, not two. Judging
  // ambiguity without collapsing them made every repair look ambiguous, because
  // the window one word to the left always scores nearly as well as the best one.
  const distinct = [];
  for (const entry of candidates) {
    const end = entry.start + entry.text.length;
    const duplicate = distinct.some((kept) => {
      if (kept.block !== entry.block) return false;
      const keptEnd = kept.start + kept.text.length;
      const overlap = Math.min(end, keptEnd) - Math.max(entry.start, kept.start);
      return overlap > 0 && overlap >= 0.5 * Math.min(entry.text.length, kept.text.length);
    });
    if (!duplicate) distinct.push(entry);
  }

  const best = distinct[0];
  const second = distinct[1];
  const confident = Boolean(best && best.score >= accept && (!second || second.score < ambiguous));
  return { confident, best: best || null, top: distinct.slice(0, 3) };
}
