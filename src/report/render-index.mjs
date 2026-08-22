// The index page.
//
// Sorted worst-first by default, because a corpus report that arrives in
// alphabetical order makes you read all of it to find the one page that is broken.

import { page, escapeHtml } from './html.mjs';
import { header, chip } from './build.mjs';

export function renderIndex({ config, result, pages, css, js, active }) {
  const ordered = [...pages].sort(sorterFor(config.report.indexSort));

  const totals = {
    documents: pages.length,
    errors: pages.reduce((sum, entry) => sum + entry.counts.error, 0),
    warnings: pages.reduce((sum, entry) => sum + entry.counts.warn, 0),
    spans: pages.reduce((sum, entry) => sum + (entry.stats.spans || 0), 0),
    affected: pages.filter((entry) => entry.counts.error > 0).length,
  };

  const verdictTotals = {};
  for (const entry of pages) {
    for (const [verdict, count] of Object.entries(entry.verdicts || {})) {
      verdictTotals[verdict] = (verdictTotals[verdict] || 0) + count;
    }
  }

  const showSpans = pages.some((entry) => entry.stats.spans != null);
  const showSeo = pages.some((entry) => entry.seo != null);
  const showRead = pages.some((entry) => entry.stats.hard != null);

  const columns = [
    { key: 'title', label: 'Document', numeric: false },
    { key: 'profile', label: 'Profile', numeric: false },
    { key: 'errors', label: 'Err', numeric: true },
    { key: 'warnings', label: 'Warn', numeric: true },
    ...(showSpans ? [{ key: 'spans', label: 'Spans', numeric: true }] : []),
    ...(showSpans ? [{ key: 'flagged', label: 'Unsourced', numeric: true }] : []),
    ...(showRead ? [{ key: 'hard', label: 'Hard', numeric: true }] : []),
    ...(showSeo ? [{ key: 'seo', label: 'SEO', numeric: true }] : []),
    { key: 'audited', label: 'Audited', numeric: false },
  ];

  const rows = ordered.map((entry) => {
    const flagged = (entry.verdicts.UNSOURCED || 0) + (entry.verdicts.CONTRADICTED || 0);
    const cells = [
      `<td><a href="${escapeHtml(entry.href)}">${escapeHtml(entry.title)}</a><div class="gt-check-detail">${escapeHtml(entry.path)}</div></td>`,
      `<td><span class="gt-pill">${escapeHtml(entry.profile)}</span></td>`,
      num(entry.counts.error, 'gt-bad'),
      num(entry.counts.warn, 'gt-mid'),
      ...(showSpans ? [num(entry.stats.spans ?? 0)] : []),
      ...(showSpans ? [num(flagged, 'gt-bad')] : []),
      ...(showRead ? [num(entry.stats.hard ?? 0, 'gt-mid')] : []),
      ...(showSeo ? [num(entry.seo ?? '', entry.seo != null && entry.seo < 70 ? 'gt-bad' : '')] : []),
      `<td class="gt-zero">${escapeHtml(entry.audited || '')}</td>`,
    ];
    const attributes = [
      `data-title="${escapeHtml(entry.title)}"`,
      `data-profile="${escapeHtml(entry.profile)}"`,
      `data-errors="${entry.counts.error}"`,
      `data-warnings="${entry.counts.warn}"`,
      `data-spans="${entry.stats.spans ?? 0}"`,
      `data-flagged="${flagged}"`,
      `data-hard="${entry.stats.hard ?? 0}"`,
      `data-seo="${entry.seo ?? -1}"`,
      `data-audited="${escapeHtml(entry.audited || '')}"`,
      `data-risk="${entry.risk}"`,
    ].join(' ');
    return `<tr ${attributes}>${cells.join('')}</tr>`;
  });

  const body = [
    header({
      crumb: `${totals.documents} document${totals.documents === 1 ? '' : 's'}`,
      chips: [
        totals.errors ? chip('errors', totals.errors, 'error') : chip('clean', '✓', 'ok'),
        totals.warnings ? chip('warnings', totals.warnings, 'warn') : '',
        showSpans ? chip('spans', totals.spans) : '',
      ].filter(Boolean),
    }),
    '<div class="gt-index">',
    lede(totals, verdictTotals),
    '<div class="gt-summary">',
    stat(totals.documents, 'documents'),
    stat(totals.errors, 'blocking'),
    stat(totals.warnings, 'advisory'),
    showSpans ? stat(totals.spans, 'claims bound') : '',
    '</div>',
    Object.keys(verdictTotals).length ? spread(verdictTotals, config.verdicts) : '',
    Object.keys(verdictTotals).length ? legend(verdictTotals, config.verdicts) : '',
    rows.length
      ? [
        '<div class="gt-table-wrap"><table class="gt-list"><thead><tr>',
        columns
          .map((column, index) =>
            `<th data-key="${column.key}" data-numeric="${column.numeric ? 1 : 0}"${index === 2 ? ' aria-sort="descending"' : ''}>${escapeHtml(column.label)}</th>`)
          .join(''),
        '</tr></thead><tbody>',
        rows.join(''),
        '</tbody></table></div>',
      ].join('')
      : '<p class="gt-empty">No documents matched. Check the <code>documents</code> routing in your config.</p>',
    '</div>',
    `<footer class="gt-foot">sorted worst first by <code>risk = 100 &times; errors + 10 &times; (unsourced + contradicted) + 3 &times; hard + warnings</code>. Click a column to re-sort. Modules: ${escapeHtml(active.join(', ') || 'none')}.</footer>`,
  ].join('\n');

  return page({
    title: `${config.report.title} — ${totals.documents} document${totals.documents === 1 ? '' : 's'}`,
    css,
    js,
    theme: config.report.theme,
    body,
  });
}

function sorterFor(mode) {
  switch (mode) {
    case 'name':
      return (a, b) => a.path.localeCompare(b.path);
    case 'seo':
      return (a, b) => (a.seo ?? 101) - (b.seo ?? 101);
    case 'audited':
      return (a, b) => String(a.audited || '').localeCompare(String(b.audited || ''));
    default:
      return (a, b) => b.risk - a.risk || a.path.localeCompare(b.path);
  }
}

function num(value, tone = '') {
  const empty = value === 0 || value === '' || value == null;
  return `<td class="gt-num ${empty ? 'gt-zero' : tone}">${escapeHtml(empty ? (value === 0 ? '0' : '') : value)}</td>`;
}

function stat(value, label) {
  return `<div class="gt-stat"><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></div>`;
}

function spread(totals, verdicts) {
  const sum = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
  const bars = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => {
      const hue = verdicts[name]?.hue ?? 262;
      const width = ((count / sum) * 100).toFixed(2);
      return `<div title="${escapeHtml(`${name} ${count}`)}" style="width:${width}%;background:oklch(0.62 0.14 ${hue})"></div>`;
    })
    .join('');
  return `<div class="gt-spread">${bars}</div>`;
}

function legend(totals, verdicts) {
  const items = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => {
      const spec = verdicts[name] || {};
      return `<span class="gt-legend-item" style="--h:${spec.hue ?? 262}">${escapeHtml(spec.label || name)}<b>${count}</b></span>`;
    })
    .join('');
  return `<div class="gt-legend">${items}</div>`;
}

/**
 * One sentence naming what the run found.
 *
 * Four numbers in a row leaves the reader to assemble the conclusion. A sentence
 * hands it over, and the numbers underneath are then confirmation rather than a
 * puzzle. This is also the anti-pattern guard: a row of metric tiles with nothing
 * above it is the dashboard reflex.
 */
function lede(totals, verdictTotals) {
  const flagged = (verdictTotals.UNSOURCED || 0) + (verdictTotals.CONTRADICTED || 0);
  const docs = `${totals.documents} document${totals.documents === 1 ? '' : 's'}`;

  if (totals.documents === 0) {
    return '<p class="gt-index-lede">No documents matched.</p>';
  }
  if (totals.errors === 0 && totals.warnings === 0) {
    return `<p class="gt-index-lede">${docs} checked. <b>Nothing to fix.</b></p>`;
  }
  if (totals.errors === 0) {
    return `<p class="gt-index-lede">${docs} checked, nothing blocking. <b>${totals.warnings} advisory finding${totals.warnings === 1 ? '' : 's'}</b> for a person to judge.</p>`;
  }

  const claimHalf = flagged
    ? ` ${flagged} claim${flagged === 1 ? ' is' : 's are'} unsourced or contradicted.`
    : '';
  return `<p class="gt-index-lede">${docs} checked. <b>${totals.errors} blocking finding${totals.errors === 1 ? '' : 's'}</b> across ${countAffected(totals)}.${claimHalf}</p>`;
}

function countAffected(totals) {
  return `${totals.affected} document${totals.affected === 1 ? '' : 's'}`;
}
