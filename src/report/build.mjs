// Build the report directory.
//
// One HTML file per document plus an index. Every page is self-contained.

import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { CSS } from './assets/css.mjs';
import { JS } from './assets/js.mjs';
import { page, escapeHtml, attrs } from './html.mjs';
import { renderDocumentBody, slug } from './render-doc.mjs';
import { renderIndex } from './render-index.mjs';
import { makeScorer, BAND_LABEL } from '../modules/readability/score.mjs';
import { squeezeCss, squeezeJs } from './minify.mjs';

export function buildReport({ config, result, active }) {
  const dir = config.reportDir;
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const css = squeezeCss(CSS);
  const js = squeezeJs(JS);

  // A single self-contained file is worth the duplication for a handful of pages
  // and not worth 5.6MB of boilerplate for two hundred. The choice is reported so
  // it is a decision rather than a surprise.
  const total = result.documents.length + 1;
  const linked = config.report.assets === 'linked'
    || (config.report.assets === 'auto' && total > config.report.inlineThreshold);

  if (linked) {
    writeFileSync(path.join(dir, 'report.css'), css, 'utf8');
    writeFileSync(path.join(dir, 'report.js'), js, 'utf8');
  }

  const shell = linked
    ? { css: '', js: '', cssHref: 'report.css', jsSrc: 'report.js' }
    : { css, js, cssHref: null, jsSrc: null };

  // A local source permalink is relative to the project root. The report lives
  // somewhere below it, so it supplies the hop back up and the link works from any
  // machine rather than only from the one that generated it.
  const toRoot = path.relative(dir, config.root).split(path.sep).join('/');

  const pages = [];

  for (const [index, entry] of result.documents.entries()) {
    const fileName = `${slug(entry.id) || `doc-${index}`}.html`;
    const built = buildDocumentPage({
      entry,
      config,
      active,
      shell,
      toRoot,
      previous: result.documents[index - 1],
      next: result.documents[index + 1],
      previousHref: result.documents[index - 1] ? `${slug(result.documents[index - 1].id)}.html` : null,
      nextHref: result.documents[index + 1] ? `${slug(result.documents[index + 1].id)}.html` : null,
    });
    writeFileSync(path.join(dir, fileName), built.html, 'utf8');
    pages.push({ ...built.meta, href: fileName });
  }

  writeFileSync(
    path.join(dir, 'index.html'),
    renderIndex({ config, result, pages, active, shell }),
    'utf8',
  );

  return { dir, indexPath: path.join(dir, 'index.html'), pages, linked };
}

function buildDocumentPage({ entry, config, active, shell, toRoot, previousHref, nextHref }) {
  const doc = entry.doc;
  const annotationsByBlock = new Map();
  const spanData = {};
  const sentenceData = {};

  // Citation marks, straight from the placements the verifier already computed.
  for (const [index, span] of (doc.spans || []).entries()) {
    if (!span.verified || !span.placements?.length) continue;
    const verdict = config.verdicts[span.verdict] || {};
    const id = String(index);
    for (const placement of span.placements) {
      push(annotationsByBlock, placement.block, {
        kind: 'span',
        id,
        start: placement.start,
        end: placement.end,
        verdict: span.verdict,
        hue: verdict.hue,
        emphatic: Boolean(verdict.emphatic),
      });
    }
    spanData[id] = {
      verdict: span.verdict,
      quote: span.quote || null,
      note: span.note || null,
      derivation: span.derivation || null,
      sourceLabel: span.sourceLabel || span.source || null,
      permalink: resolveLink(span.permalink, toRoot),
      lineUnconfirmed: Boolean(span.source && span.quote && span.located && !span.located.found),
    };
  }

  // Readability underlines. The same scorer the gate ran, so the page cannot
  // disagree with the terminal.
  if (doc.profile?.readability?.enabled) {
    const scorer = makeScorer({
      ...(doc.profile.readability.preset || {}),
      ...(doc.profile.readability.overrides || {}),
    });
    let counter = 0;
    for (const block of doc.query.prose()) {
      for (const sentence of scorer.sentences(block.readerText)) {
        const scored = scorer.score(sentence.text);
        if (!scored) continue;
        const id = String(counter);
        counter += 1;
        push(annotationsByBlock, block, {
          kind: 'read',
          id,
          start: sentence.start,
          end: Math.min(sentence.start + sentence.text.length, block.readerText.length),
          band: scored.band,
        });
        sentenceData[id] = {
          band: scored.band,
          label: BAND_LABEL[scored.band],
          score: scored.score,
          words: scored.words,
          reasons: scored.reasons,
          fix: scored.fix,
        };
      }
    }
  }

  const body = renderDocumentBody(doc, { annotationsByBlock });
  const title = String(doc.frontmatter.title || doc.query.headings(1)[0]?.readerText || doc.path);
  const audit = doc.seoAudit || null;
  const counts = entry.counts;

  const verdictsInUse = Object.entries(config.verdicts).filter(([name]) =>
    Object.values(spanData).some((span) => span.verdict === name));

  const html = page({
    title: `${title} — groundtruth`,
    ...shell,
    theme: config.report.theme,
    data: {
      spans: spanData,
      sentences: sentenceData,
      verdicts: config.verdicts,
    },
    body: [
      header({
        crumb: doc.path,
        chips: [
          doc.stats?.spans != null ? chip('spans', doc.stats.spans, 'ok') : '',
          counts.error ? chip('errors', counts.error, 'error') : '',
          counts.warn ? chip('warnings', counts.warn, 'warn') : '',
          audit ? chip('seo', audit.score, audit.band === 'good' ? 'ok' : audit.band === 'ok' ? 'warn' : 'error') : '',
        ].filter(Boolean),
        nav: [
          previousHref ? `<a class="gt-chip" href="${escapeHtml(previousHref)}">prev</a>` : '',
          `<a class="gt-chip" href="index.html">index</a>`,
          nextHref ? `<a class="gt-chip" href="${escapeHtml(nextHref)}">next</a>` : '',
        ].filter(Boolean).join(''),
      }),
      '<div class="gt-main">',
      `<article class="gt-prose">${body}</article>`,
      `<div class="gt-rail">${rail({ entry, audit, config, verdictsInUse, spanData })}</div>`,
      '</div>',
      '<div class="gt-card" id="gt-card" role="dialog" aria-live="polite" data-open="0"></div>',
      `<footer class="gt-foot">generated by <code>groundtruth report</code> · ${escapeHtml(new Date().toISOString().slice(0, 16).replace('T', ' '))} UTC · modules: ${escapeHtml(active.join(', ') || 'none')}</footer>`,
    ].join('\n'),
  });

  const risk =
    100 * counts.error +
    10 * ((doc.verdictTally?.UNSOURCED || 0) + (doc.verdictTally?.CONTRADICTED || 0)) +
    3 * (doc.stats?.hard || 0) +
    counts.warn;

  return {
    html,
    meta: {
      id: entry.id,
      path: doc.path,
      title,
      profile: entry.profile,
      counts,
      stats: doc.stats || {},
      verdicts: doc.verdictTally || {},
      seo: audit ? audit.score : null,
      audited: doc.audited || null,
      risk,
    },
  };
}

/** Prefix a project-relative permalink with the hop from the report to the root. */
function resolveLink(permalink, toRoot) {
  if (!permalink) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(permalink)) return permalink;
  return toRoot ? `${toRoot}/${permalink}` : permalink;
}

function push(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

export function header({ crumb, chips = [], nav = '' }) {
  return [
    '<header class="gt-header"><div class="gt-header-inner">',
    '<div class="gt-brand"><a href="index.html">groundtruth</a></div>',
    `<div class="gt-crumb">${escapeHtml(crumb)}</div>`,
    `<div class="gt-chips">${chips.join('')}${nav}`,
    '<button class="gt-theme" id="gt-theme" type="button">theme</button>',
    '</div></div></header>',
  ].join('');
}

export function chip(label, value, tone = '') {
  return `<span class="gt-chip${tone ? ` gt-chip-${tone}` : ''}">${escapeHtml(label)} <b>${escapeHtml(value)}</b></span>`;
}

function rail({ entry, audit, config, verdictsInUse, spanData }) {
  const parts = [];

  if (verdictsInUse.length) {
    const total = Object.keys(spanData).length;
    parts.push(panel('Claims', total, [
      '<div class="gt-legend">',
      verdictsInUse
        .map(([name, spec]) => {
          const count = Object.values(spanData).filter((span) => span.verdict === name).length;
          return `<span class="gt-legend-item" style="--h:${spec.hue ?? 262}">${escapeHtml(spec.label || name)}<b>${count}</b></span>`;
        })
        .join(''),
      '</div>',
    ].join(''), true));
  }

  if (audit) {
    parts.push(panel(
      'Search and answer engines',
      `${audit.counts.pass}/${audit.counts.total}`,
      [
        `<div class="gt-score gt-score-${audit.band}">${audit.score}<span> / 100, advisory</span></div>`,
        ...audit.groups.map((group) => checkGroup(group, config.report.showPassingChecks)),
      ].join(''),
      true,
    ));
  }

  const findings = entry.findings.filter((finding) => finding.severity !== 'off');
  const glyph = { error: '✕', warn: '!', info: 'i' };
  parts.push(panel(
    'Findings',
    findings.length ? `${entry.counts.error} blocking, ${entry.counts.warn} advisory` : 'none',
    findings.length
      ? `<ul class="gt-findings">${findings.map((finding) => [
        `<li class="gt-finding gt-finding-${escapeHtml(finding.severity)}">`,
        '<div class="gt-finding-head">',
        `<span class="gt-finding-glyph">${glyph[finding.severity] || '·'}</span>`,
        `<span>${escapeHtml(finding.rule)}${finding.line ? ` · line ${finding.line}` : ''}</span>`,
        finding.blocking ? '<span class="gt-finding-blocking">blocking</span>' : '',
        '</div>',
        `<div class="gt-finding-msg">${escapeHtml(finding.message)}</div>`,
        finding.fix?.instruction ? `<div class="gt-finding-fix">${escapeHtml(finding.fix.instruction)}</div>` : '',
        '</li>',
      ].join('')).join('')}</ul>`
      : '<p class="gt-check-detail">Nothing to report.</p>',
    true,
  ));

  return parts.join('');
}

function panel(title, count, body, open = false) {
  return [
    `<details class="gt-panel"${open ? ' open' : ''}>`,
    `<summary>${escapeHtml(title)}<span class="gt-count">${escapeHtml(count)}</span></summary>`,
    `<div class="gt-panel-body">${body}</div>`,
    '</details>',
  ].join('');
}

const GLYPH = { pass: '✓', warn: '!', fail: '✕' };

function checkGroup(group, showPassing) {
  const visible = group.checks.filter((check) => showPassing || check.status !== 'pass');
  if (!visible.length) return '';
  return [
    `<div class="gt-group-label">${escapeHtml(group.label)}</div>`,
    '<ul class="gt-checks">',
    visible
      .map((check) => [
        `<li class="gt-check gt-check-${check.status}">`,
        `<span class="gt-check-glyph">${GLYPH[check.status]}</span>`,
        '<span>',
        `<span class="gt-check-label">${escapeHtml(check.label)}</span>`,
        check.mechanical ? '' : '<span class="gt-advisory">advisory</span>',
        check.detail ? `<div class="gt-check-detail">${escapeHtml(check.detail)}</div>` : '',
        check.fix ? `<div class="gt-check-fix">${escapeHtml(check.fix)}</div>` : '',
        '</span></li>',
      ].join(''))
      .join(''),
    '</ul>',
  ].join('');
}

export { attrs };
