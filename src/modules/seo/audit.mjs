// The audit. One traversal produces the check statuses that feed the gate, the
// report panel, and the score.

import { shred } from './shred.mjs';
import {
  keywordHit, phraseHits, keywordWordCount, placementCheck, wordCount, bandFor,
} from './keyword.mjs';
import { GROUPS, CHECKS, CHECK_BY_ID } from './specs.mjs';
import { longform } from '../../../presets/longform.mjs';

/** An opening that describes the page instead of answering the question. */
export const PREAMBLE =
  /^(in this (article|post|guide)|we(?:'| a)?re going to|this (article|post|guide) (will|explains)|before we|let(?:'| u)s (start|begin|dive)|first,? (?:a bit of )?(?:some )?(context|background))/i;

/** A heading that carries no query. A section label from a school essay. */
export const VAGUE_H2 =
  /^(conclusion|takeaways?|key takeaways?|wrapping up|summary|overview|introduction|final thoughts?|closing thoughts?|closing words?|why it matters|how it matters|the (?:elephant|truth|catch|problem|point|reality|bottom line)\b|a (?:final|last) word)/i;

const QUESTION_H2 = /^(what|why|how|when|where|which|who|can|does|do|is|are|should|will)\b|\?\s*$/i;

export function check(id, status, detail, fix) {
  const spec = CHECK_BY_ID.get(id);
  return {
    id,
    label: spec?.label || id,
    group: spec?.group || 'basic',
    mechanical: Boolean(spec?.mechanical),
    status,
    detail: detail ?? '',
    fix: fix ?? null,
  };
}

/**
 * Over the cap is checked before under the floor, and the order matters. A
 * project that tightens a cap below the default floor would otherwise see an
 * over-cap value reported as a warning about being too short.
 */
function lengthCheck(id, value, low, high, unit = 'characters') {
  const length = value ? String(value).length : 0;
  if (!length) return check(id, 'fail', 'empty', `Write it. ${low} to ${high} ${unit}.`);
  if (length > high) {
    return check(id, 'fail', `${length} ${unit}, over ${high}`, `Cut ${length - high} ${unit} or it gets truncated in the results page.`);
  }
  if (length < low) return check(id, 'warn', `${length} ${unit}, under ${low}`, `Add ${low - length} more ${unit}.`);
  return check(id, 'pass', `${length} ${unit}`);
}

export function auditDocument(doc, options = {}) {
  const limits = { ...longform, ...(options.preset || {}), ...(options.overrides || {}) };
  const keywordFields = options.keyword || { field: 'primary_keyword', secondaryField: 'secondary_keywords' };
  const fm = doc.frontmatter || {};
  const body = shred(doc, limits);

  const primary = String(fm[keywordFields.field] || '').trim();
  const secondary = toArray(fm[keywordFields.secondaryField]);

  const title = String(fm.title || body.h1s[0]?.readerText || '').trim();
  const seoTitle = String(fm.seo_title || title).trim();
  const meta = String(fm.meta_description || fm.description || '').trim();
  const slug = String(fm.slug || doc.name).trim();

  const checks = [];

  // ── Primary keyword. Four placements. ───────────────────────────────────
  if (!primary) {
    for (const id of ['kw-title', 'kw-meta', 'kw-opening', 'kw-h2']) {
      checks.push(check(id, 'fail', `no ${keywordFields.field} set`, `Set ${keywordFields.field} in frontmatter.`));
    }
    checks.push(check('kw-density', 'fail', `no ${keywordFields.field} set`, `Set ${keywordFields.field} in frontmatter.`));
  } else {
    const slots = [
      ['kw-title', title, 'the title'],
      ['kw-meta', meta, 'the meta description'],
      ['kw-opening', body.openingText, 'the opening passage'],
      ['kw-h2', body.h2s.map((block) => block.readerText).join('\n'), 'any H2'],
    ];
    for (const [id, text, where] of slots) {
      const placement = placementCheck(text, primary);
      checks.push(
        placement.hit
          ? check(id, 'pass', `"${primary}" appears in ${where}`)
          : check(
            id,
            'fail',
            placement.missing.length
              ? `missing from ${where}: ${placement.missing.join(', ')}`
              : `"${primary}" does not appear in ${where}`,
            `Work "${primary}" into ${where}. All the words, in order. It does not have to be the exact string.`,
          ),
      );
    }

    const hits = phraseHits(body.readable, primary);
    const kwWords = keywordWordCount(primary);
    const density = body.readableWords ? ((hits * kwWords) / body.readableWords) * 100 : 0;
    const where = `${hits}x in ${body.readableWords} words of body, headings and FAQ`;
    checks.push(
      hits === 0
        ? check('kw-density', 'fail', 'keyword never appears in the body', 'Use the phrase at least twice.')
        : density < limits.densityMin
          ? check('kw-density', 'warn', `${density.toFixed(2)}%, ${where}`, `Under ${limits.densityMin}%. An FAQ question is the natural place for one more.`)
          : density > limits.densityMax
            ? check('kw-density', 'warn', `${density.toFixed(2)}%, ${where}`, `Over ${limits.densityMax}%. Replace some instances with a pronoun or a synonym.`)
            : check('kw-density', 'pass', `${density.toFixed(2)}%, ${where}`),
    );
  }

  // ── Keyword reach ───────────────────────────────────────────────────────
  checks.push(
    secondary.length < limits.secondaryMin
      ? check('sec-count', 'warn', `${secondary.length} set`, `Set ${limits.secondaryMin} to ${limits.secondaryMax} in frontmatter.`)
      : secondary.length > limits.secondaryMax
        ? check('sec-count', 'warn', `${secondary.length} set`, `Over ${limits.secondaryMax}. Cut the ones the page does not really target.`)
        : check('sec-count', 'pass', `${secondary.length} set`),
  );

  if (secondary.length) {
    const haystack = body.readable;
    const shares = secondary.map((keyword) => ({ keyword, ...keywordHit(haystack, keyword) }));
    const weak = shares.filter((entry) => entry.share < limits.hitWeak);
    const average = shares.reduce((sum, entry) => sum + entry.share, 0) / shares.length;
    checks.push(
      weak.length
        ? check(
          'sec-reach',
          bandFor(average, { strong: limits.hitStrong, weak: limits.hitWeak }),
          `${weak.length} of ${shares.length} barely appear: ${weak.map((entry) => `"${entry.keyword}"`).join(', ')}`,
          'Work each phrase into a heading, a sentence, or an FAQ question.',
        )
        : check('sec-reach', 'pass', `all ${shares.length} appear, ${Math.round(average * 100)}% average coverage`),
    );
  }

  // ── Search snippet ──────────────────────────────────────────────────────
  checks.push(lengthCheck('len-title', title, 30, limits.titleMax));
  checks.push(lengthCheck('len-seo-title', seoTitle, 30, limits.seoTitleMax));
  checks.push(lengthCheck('len-meta', meta, limits.metaMin, limits.metaMax));
  checks.push(lengthCheck('len-slug', slug, 10, limits.slugMax));

  const slugWords = slug.split('-').filter(Boolean).length;
  checks.push(
    slugWords > limits.slugWordsMax
      ? check('slug-words', 'fail', `${slugWords} words`, `Over ${limits.slugWordsMax}. Drop the filler words.`)
      : check('slug-words', 'pass', `${slugWords} words`),
  );

  checks.push(
    fm.canonical_url
      ? check('canonical', 'pass', String(fm.canonical_url))
      : check('canonical', 'fail', 'not set', 'Set canonical_url to this page\'s one true URL.'),
  );
  checks.push(
    fm.updated_date || fm.updated || fm.date
      ? check('updated', 'pass', String(fm.updated_date || fm.updated || fm.date))
      : check('updated', 'fail', 'not set', 'Set updated_date. A sitemap reads it for lastmod.'),
  );

  checks.push(
    body.bodyWords > limits.bodyWordsMax
      ? check('body-cap', 'fail', `${body.bodyWords} words, ${body.bodyWords - limits.bodyWordsMax} over the ${limits.bodyWordsMax} cap`, 'Split it. Over the cap this is two articles wearing one URL.')
      : check('body-cap', 'pass', `${body.bodyWords} words`),
  );
  checks.push(
    body.bodyWords < limits.bodyWordsMin
      ? check('body-floor', 'warn', `${body.bodyWords} words, under the ${limits.bodyWordsMin} floor`, 'Add substance, never padding. This never blocks for exactly that reason.')
      : check('body-floor', 'pass', `${body.bodyWords} words`),
  );

  // ── Heading structure ───────────────────────────────────────────────────
  checks.push(
    body.h1s.length === 1
      ? check('h1-single', 'pass', '1 H1')
      : check('h1-single', 'fail', `${body.h1s.length} H1s`, body.h1s.length === 0 ? 'Add one H1 carrying the title.' : 'Keep one H1 and demote the rest to H2.'),
  );

  checks.push(
    body.h2s.length < limits.h2Min
      ? check('h2-count', 'warn', `${body.h2s.length} H2s`, `This shape wants ${limits.h2Min} to ${limits.h2Max}.`)
      : body.h2s.length > limits.h2Max
        ? check('h2-count', 'warn', `${body.h2s.length} H2s`, `Over ${limits.h2Max}. Some of these are H3s.`)
        : check('h2-count', 'pass', `${body.h2s.length} H2s`),
  );

  const badShape = body.h2s.filter((block) => {
    const words = wordCount(block.readerText);
    return words < limits.h2WordsMin || words > limits.h2WordsMax;
  });
  checks.push(
    badShape.length
      ? check('h2-shape', 'warn', `${badShape.length} H2 outside ${limits.h2WordsMin} to ${limits.h2WordsMax} words: ${badShape.map((b) => `"${b.readerText}"`).slice(0, 3).join(', ')}`, 'Write each heading as the answer to one question.')
      : check('h2-shape', 'pass', `all ${body.h2s.length} within ${limits.h2WordsMin} to ${limits.h2WordsMax} words`),
  );

  const colonH2 = body.h2s.filter((block) => block.readerText.includes(':'));
  checks.push(
    colonH2.length
      ? check('h2-colon', 'fail', `${colonH2.length} H2 with a colon: ${colonH2.map((b) => `"${b.readerText}"`).slice(0, 3).join(', ')}`, 'Drop the colon. Keep the half that answers the question.', )
      : check('h2-colon', 'pass', 'no colons'),
  );

  const seen = new Map();
  const duplicates = [];
  for (const block of body.headings) {
    const key = `${block.depth}:${block.readerText.trim().toLowerCase()}`;
    if (seen.has(key)) duplicates.push(block.readerText);
    else seen.set(key, block);
  }
  checks.push(
    duplicates.length
      ? check('h2-duplicate', 'fail', `duplicate heading(s): ${[...new Set(duplicates)].join(', ')}`, 'Make each heading name a different thing.')
      : check('h2-duplicate', 'pass', 'every heading is distinct'),
  );

  const skips = [];
  let previous = 0;
  for (const block of body.headings) {
    if (previous && block.depth > previous + 1) skips.push(`H${previous} to H${block.depth} at "${block.readerText}"`);
    previous = block.depth;
  }
  checks.push(
    skips.length
      ? check('heading-skip', 'fail', skips.slice(0, 3).join('; '), 'Do not skip a level. An outline with a hole in it is not an outline.')
      : check('heading-skip', 'pass', 'no depth skips'),
  );

  const vague = body.h2s.filter((block) => VAGUE_H2.test(block.readerText.trim()));
  checks.push(
    vague.length
      ? check('h2-vague', 'fail', `${vague.length} vague heading(s): ${vague.map((b) => `"${b.readerText}"`).join(', ')}`, 'Say what the section concludes, not that it is the conclusion.')
      : check('h2-vague', 'pass', 'every H2 carries a query'),
  );

  // ── Answer engine ───────────────────────────────────────────────────────
  checks.push(
    body.openingWords > 0
      ? check('aeo-answer-first', 'pass', `${body.openingWords} words before the first H2`)
      : check('aeo-answer-first', 'fail', 'the first H2 arrives before any prose', 'Answer the question in the first paragraph, before any heading.'),
  );

  const firstOpening = body.opening.find((block) => block.readerText.trim());
  checks.push(
    firstOpening && PREAMBLE.test(firstOpening.readerText.trim())
      ? check('aeo-preamble', 'fail', `the opening describes the page: "${firstOpening.readerText.slice(0, 70)}…"`, 'Delete the runway and answer the question in the first sentence.')
      : check('aeo-preamble', 'pass', 'the opening answers rather than announces'),
  );

  checks.push(
    body.faq.present
      ? check('faq-present', 'pass', `FAQ block at line ${body.faq.heading.line}`)
      : check('faq-present', 'fail', 'no FAQ block', 'Add a heading matching the FAQ pattern, then question and answer pairs. FAQPage structured data is generated from it.'),
  );

  if (body.faq.present) {
    checks.push(
      body.faq.pairs.length < limits.faqMin
        ? check('faq-count', 'warn', `${body.faq.pairs.length} pairs`, `This shape wants ${limits.faqMin} to ${limits.faqMax}. Each question ends in a question mark.`)
        : body.faq.pairs.length > limits.faqMax
          ? check('faq-count', 'warn', `${body.faq.pairs.length} pairs`, `Over ${limits.faqMax}. Keep the ones a reader would actually search.`)
          : check('faq-count', 'pass', `${body.faq.pairs.length} pairs`),
    );

    const badAnswers = body.faq.pairs.filter((pair) => {
      const words = wordCount(pair.answer);
      return words < limits.faqAnswerWordsMin || words > limits.faqAnswerWordsMax;
    });
    checks.push(
      badAnswers.length
        ? check('faq-answer-length', 'warn', `${badAnswers.length} answer(s) outside ${limits.faqAnswerWordsMin} to ${limits.faqAnswerWordsMax} words`, 'An answer under the floor is not liftable. Over the cap it is an article.')
        : check('faq-answer-length', 'pass', `all ${body.faq.pairs.length} answers in range`),
    );
  }

  const untagged = body.fences.filter((block) => !block.lang);
  checks.push(
    untagged.length
      ? check('fence-language', 'fail', `${untagged.length} untagged fence(s) at line ${untagged.map((b) => b.line).join(', ')}`, 'Add a language tag to the opening fence.')
      : check('fence-language', 'pass', body.fences.length ? `all ${body.fences.length} fences tagged` : 'no code fences'),
  );

  const questions = body.h2s.filter((block) => QUESTION_H2.test(block.readerText.trim()));
  checks.push(
    body.h2s.length && questions.length === 0
      ? check('aeo-question-h2', 'warn', 'no H2 is phrased as a question', 'One or two question-shaped headings give an answer engine something to match.')
      : check('aeo-question-h2', 'pass', `${questions.length} of ${body.h2s.length} H2s are question shaped`),
  );

  checks.push(
    body.bodyWords > limits.tokenBudgetWords
      ? check('aeo-token-budget', 'warn', `${body.bodyWords} words`, `Over the ${limits.tokenBudgetWords}-word budget an agent will not finish the page.`)
      : check('aeo-token-budget', 'pass', `${body.bodyWords} words`),
  );

  // ── Links and media ─────────────────────────────────────────────────────
  checks.push(
    body.images.length === 0
      ? check('img-count', 'warn', 'no images', 'A long page with no figure is a wall of text.')
      : check('img-count', 'pass', `${body.images.length} image(s)`),
  );
  checks.push(
    body.tables.length
      ? check('table-present', 'pass', `${body.tables.length} table(s)`)
      : check('table-present', 'warn', 'no tables', 'A comparison rendered as a table can be lifted. A screenshot of one cannot be read.'),
  );
  checks.push(
    body.links.internal.length < limits.internalLinksMin
      ? check('links-internal', 'warn', `${body.links.internal.length} internal link(s)`, `Under ${limits.internalLinksMin}. A page nothing points at and that points at nothing is an orphan.`)
      : check('links-internal', 'pass', `${body.links.internal.length} internal link(s)`),
  );
  checks.push(
    body.links.external.length < limits.externalLinksMin
      ? check('links-external', 'warn', `${body.links.external.length} external link(s)`, `Under ${limits.externalLinksMin}. Link the sources a reader would want to check.`)
      : check('links-external', 'pass', `${body.links.external.length} external link(s)`),
  );

  const groups = GROUPS.map((group) => ({
    ...group,
    checks: checks.filter((entry) => entry.group === group.id),
  })).filter((group) => group.checks.length);

  const counts = {
    pass: checks.filter((entry) => entry.status === 'pass').length,
    warn: checks.filter((entry) => entry.status === 'warn').length,
    fail: checks.filter((entry) => entry.status === 'fail').length,
    total: checks.length,
  };

  // Display only. `(pass + 0.5 * warn) / total` is a metric with no right
  // answer, so it is never a gate and config cannot make it one.
  const score = counts.total ? Math.round(((counts.pass + counts.warn * 0.5) / counts.total) * 100) : 0;

  return {
    keywords: { primary, secondary },
    checks,
    groups,
    counts,
    score,
    band: score >= 90 ? 'good' : score >= 70 ? 'ok' : 'poor',
    stats: {
      words: body.bodyWords,
      h2s: body.h2s.length,
      faqs: body.faq.pairs.length,
      images: body.images.length,
      tables: body.tables.length,
      internalLinks: body.links.internal.length,
      externalLinks: body.links.external.length,
    },
    body,
  };
}

function toArray(value) {
  if (value == null || value === '') return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

export { CHECKS, GROUPS };
