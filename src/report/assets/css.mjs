// The whole stylesheet, as one exported string, inlined into every page.
// No build step, no bundler, no CDN.
//
// Three things here are load-bearing rather than cosmetic.
//
// The hover cue never uses `filter`. A filter creates a stacking context on the
// hovered element, which traps the card's z-index inside it. The hovered mark
// takes a z-index instead.
//
// The card is `position: fixed`. An ancestor with `overflow: auto`, which every
// table wrapper on the page has, clips an absolutely positioned descendant.
//
// Nothing scrolls sideways, and it is fixed properly rather than with
// `overflow-x: hidden` on the root, which hides the bug instead of removing it.
// The grid uses `minmax(0, ...)` because `1fr` has an `auto` minimum and a wide
// table blows the column out horizontally.

export const CSS = `
:root {
  color-scheme: light dark;
  --bg: #fbfbfa;
  --surface: #ffffff;
  --surface-2: #f4f4f2;
  --border: #e2e2dd;
  --border-strong: #c9c9c2;
  --text: #1d1d1b;
  --text-dim: #6b6b64;
  --text-faint: #98988f;
  --accent: #2f4bd6;
  --accent-soft: #e8ecfb;
  --error: #c02626;
  --warn: #a86b00;
  --info: #2f4bd6;
  --ok: #12795a;
  --shadow: 0 6px 24px rgba(18, 18, 16, 0.14), 0 1px 2px rgba(18, 18, 16, 0.08);
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --wash-l: 92%;
  --wash-s: 74%;
  --ink-l: 34%;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #16161a;
    --surface: #1d1d22;
    --surface-2: #24242a;
    --border: #33333c;
    --border-strong: #4a4a56;
    --text: #ececef;
    --text-dim: #a3a3ad;
    --text-faint: #75757f;
    --accent: #8fa4ff;
    --accent-soft: #23273d;
    --error: #ff8080;
    --warn: #e8b062;
    --info: #8fa4ff;
    --ok: #5fd1ac;
    --shadow: 0 8px 30px rgba(0, 0, 0, 0.5), 0 1px 2px rgba(0, 0, 0, 0.4);
    --wash-l: 24%;
    --wash-s: 52%;
    --ink-l: 74%;
  }
}

:root[data-theme="dark"] {
  --bg: #16161a;
  --surface: #1d1d22;
  --surface-2: #24242a;
  --border: #33333c;
  --border-strong: #4a4a56;
  --text: #ececef;
  --text-dim: #a3a3ad;
  --text-faint: #75757f;
  --accent: #8fa4ff;
  --accent-soft: #23273d;
  --error: #ff8080;
  --warn: #e8b062;
  --info: #8fa4ff;
  --ok: #5fd1ac;
  --shadow: 0 8px 30px rgba(0, 0, 0, 0.5), 0 1px 2px rgba(0, 0, 0, 0.4);
  --wash-l: 24%;
  --wash-s: 52%;
  --ink-l: 74%;
}

*, *::before, *::after { box-sizing: border-box; }

html { -webkit-text-size-adjust: 100%; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--sans);
  font-size: 16px;
  line-height: 1.6;
}

a { color: var(--accent); text-decoration-thickness: 1px; text-underline-offset: 2px; }

img, svg, video, canvas { max-width: 100%; height: auto; }

/* ── Header ─────────────────────────────────────────────────────────────── */

.gt-header {
  position: sticky;
  top: 0;
  z-index: 40;
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  backdrop-filter: saturate(1.4) blur(8px);
  border-bottom: 1px solid var(--border);
}

.gt-header-inner {
  max-width: 1180px;
  margin: 0 auto;
  padding: 10px 20px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  align-items: center;
}

.gt-brand {
  font-weight: 700;
  letter-spacing: -0.01em;
  font-size: 15px;
  margin-right: 4px;
}
.gt-brand a { color: var(--text); text-decoration: none; }

.gt-crumb { color: var(--text-dim); font-size: 13px; min-width: 0; overflow-wrap: anywhere; }

.gt-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-left: auto; }

.gt-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  background: var(--surface-2);
  color: var(--text-dim);
  text-decoration: none;
  white-space: nowrap;
}
.gt-chip b { color: var(--text); font-variant-numeric: tabular-nums; }
.gt-chip-error { border-color: var(--error); color: var(--error); }
.gt-chip-warn { border-color: var(--warn); color: var(--warn); }
.gt-chip-ok { border-color: var(--ok); color: var(--ok); }

.gt-theme {
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  background: var(--surface-2);
  color: var(--text-dim);
}

/* ── Layout ─────────────────────────────────────────────────────────────── */

.gt-main {
  max-width: 1180px;
  margin: 0 auto;
  padding: 24px 20px 96px;
  display: grid;
  /* minmax(0, ...) rather than 1fr: 1fr has an auto minimum, and one wide table
     then pushes the whole grid sideways. */
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 32px;
  align-items: start;
}

@media (max-width: 940px) {
  .gt-main { grid-template-columns: minmax(0, 1fr); gap: 20px; }
  .gt-rail { order: -1; position: static !important; }
}

.gt-prose { min-width: 0; overflow-wrap: anywhere; }
.gt-prose > :first-child { margin-top: 0; }

.gt-prose h1 { font-size: 1.85rem; line-height: 1.2; letter-spacing: -0.02em; margin: 2rem 0 0.6rem; }
.gt-prose h2 { font-size: 1.35rem; line-height: 1.25; margin: 2.2rem 0 0.5rem; }
.gt-prose h3 { font-size: 1.1rem; margin: 1.6rem 0 0.4rem; }
.gt-prose h4, .gt-prose h5, .gt-prose h6 { font-size: 1rem; margin: 1.3rem 0 0.3rem; }
.gt-prose p { margin: 0 0 1rem; }
.gt-prose li { margin: 0.25rem 0; }
.gt-prose hr { border: 0; border-top: 1px solid var(--border); margin: 2rem 0; }

.gt-prose blockquote {
  margin: 1rem 0;
  padding: 0.2rem 0 0.2rem 1rem;
  border-left: 3px solid var(--border-strong);
  color: var(--text-dim);
}

.gt-callout {
  margin: 1.2rem 0;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  border-radius: 6px;
  background: var(--surface);
}
.gt-callout-kind {
  margin: 0 0 6px !important;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--accent);
}
.gt-callout > :last-child { margin-bottom: 0 !important; }

.gt-prose code {
  font-family: var(--mono);
  font-size: 0.87em;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.1em 0.32em;
}

.gt-prose pre {
  margin: 0;
  padding: 12px 14px;
  font-family: var(--mono);
  font-size: 13px;
  line-height: 1.5;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
}
.gt-prose pre code { background: none; border: 0; padding: 0; font-size: inherit; }
.gt-prose pre code.gt-untagged { border-left: 2px solid var(--warn); padding-left: 8px; }

/* Wide content scrolls inside its own box. The page body never does. */
.gt-scroll { overflow-x: auto; margin: 1.2rem 0; max-width: 100%; }
.gt-scroll pre { overflow-x: visible; }

.gt-prose table { border-collapse: collapse; font-size: 14px; min-width: 100%; }
.gt-prose th, .gt-prose td {
  border: 1px solid var(--border);
  padding: 7px 11px;
  text-align: left;
  vertical-align: top;
}
.gt-prose th { background: var(--surface-2); font-weight: 650; }

.gt-figure { margin: 1.4rem 0; }
.gt-figure img { border: 1px solid var(--border); border-radius: 8px; display: block; }
.gt-figure figcaption { font-size: 12.5px; color: var(--text-faint); margin-top: 6px; }
.gt-raw-html { color: var(--text-faint); font-size: 12px; }
.gt-fn { color: var(--text-faint); }

/* ── Marks ──────────────────────────────────────────────────────────────── */

.gt-span {
  --h: 210;
  background: hsl(var(--h) var(--wash-s) var(--wash-l));
  color: inherit;
  border-bottom: 2px solid hsl(var(--h) 70% var(--ink-l));
  border-radius: 2px;
  padding: 0 1px;
  cursor: help;
  /* Never filter here. It creates a stacking context and traps the card. */
  transition: background 120ms ease;
}
.gt-span:hover, .gt-span:focus-visible {
  background: hsl(var(--h) var(--wash-s) calc(var(--wash-l) - 6%));
  outline: none;
  position: relative;
  z-index: 60;
}
.gt-span.gt-emphatic {
  font-weight: 650;
  box-shadow: 0 0 0 2px hsl(var(--h) 70% var(--ink-l) / 0.35);
}

.gt-read {
  text-decoration: underline dotted 2px hsl(38 80% var(--ink-l));
  text-underline-offset: 4px;
  cursor: help;
}
.gt-read.gt-band-hard { text-decoration-color: hsl(4 74% var(--ink-l)); }
.gt-read:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* ── Hover card ─────────────────────────────────────────────────────────── */

.gt-card {
  position: fixed;
  z-index: 200;
  width: min(380px, calc(100vw - 24px));
  max-height: min(60vh, 460px);
  overflow-y: auto;
  display: none;
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  box-shadow: var(--shadow);
  font-size: 13.5px;
  line-height: 1.5;
}
.gt-card[data-open="1"] { display: block; }
.gt-card-verdict {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  padding: 2px 8px;
  border-radius: 999px;
  margin-bottom: 8px;
  background: hsl(var(--h, 210) var(--wash-s) var(--wash-l));
  color: hsl(var(--h, 210) 70% var(--ink-l));
  border: 1px solid hsl(var(--h, 210) 60% var(--ink-l) / 0.5);
}
.gt-card-row { margin: 6px 0; }
.gt-card-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-faint); }
.gt-card-quote {
  margin: 6px 0;
  padding: 8px 10px;
  background: var(--surface-2);
  border-left: 3px solid var(--border-strong);
  border-radius: 4px;
  font-family: var(--mono);
  font-size: 12px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.gt-card-note { color: var(--text-dim); }
.gt-card-src { font-family: var(--mono); font-size: 12px; overflow-wrap: anywhere; }
.gt-card-warn { color: var(--warn); font-size: 12px; }
.gt-card-hint { color: var(--text-faint); font-size: 11px; margin-top: 8px; }
.gt-card ul { margin: 6px 0; padding-left: 18px; }
.gt-card-fix { color: var(--ok); }

/* ── Rail ───────────────────────────────────────────────────────────────── */

.gt-rail { position: sticky; top: 64px; min-width: 0; display: grid; gap: 14px; }

.gt-panel {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  overflow: hidden;
}
.gt-panel > summary {
  cursor: pointer;
  padding: 9px 12px;
  font-size: 13px;
  font-weight: 650;
  display: flex;
  gap: 8px;
  align-items: center;
  list-style: none;
}
.gt-panel > summary::-webkit-details-marker { display: none; }
.gt-panel > summary::before { content: "\\25B8"; color: var(--text-faint); font-size: 10px; }
.gt-panel[open] > summary::before { content: "\\25BE"; }
.gt-panel-body { padding: 4px 12px 12px; font-size: 13px; }

.gt-count { margin-left: auto; font-size: 11px; color: var(--text-faint); font-variant-numeric: tabular-nums; }

.gt-checks { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.gt-check { display: grid; grid-template-columns: 14px minmax(0, 1fr); gap: 8px; }
.gt-check-glyph { font-size: 12px; line-height: 1.5; }
.gt-check-pass .gt-check-glyph { color: var(--ok); }
.gt-check-warn .gt-check-glyph { color: var(--warn); }
.gt-check-fail .gt-check-glyph { color: var(--error); }
.gt-check-label { font-weight: 600; }
.gt-check-detail { color: var(--text-dim); font-size: 12.5px; overflow-wrap: anywhere; }
.gt-check-fix { color: var(--accent); font-size: 12.5px; }
.gt-advisory { font-size: 10px; color: var(--text-faint); border: 1px solid var(--border); border-radius: 3px; padding: 0 4px; margin-left: 4px; }

.gt-findings { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.gt-finding { border-left: 3px solid var(--border-strong); padding-left: 9px; }
.gt-finding-error { border-left-color: var(--error); }
.gt-finding-warn { border-left-color: var(--warn); }
.gt-finding-info { border-left-color: var(--info); }
.gt-finding-rule { font-family: var(--mono); font-size: 11.5px; color: var(--text-faint); }
.gt-finding-msg { font-size: 12.5px; }
.gt-finding-fix { font-size: 12px; color: var(--accent); }
.gt-finding a { color: inherit; text-decoration: none; }
.gt-finding a:hover { text-decoration: underline; }

.gt-legend { display: flex; flex-wrap: wrap; gap: 6px; }
.gt-legend-item {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: hsl(var(--h) var(--wash-s) var(--wash-l));
  color: hsl(var(--h) 70% var(--ink-l));
  border: 1px solid hsl(var(--h) 60% var(--ink-l) / 0.4);
  white-space: nowrap;
}

.gt-score { font-size: 26px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
.gt-score-good { color: var(--ok); }
.gt-score-ok { color: var(--warn); }
.gt-score-poor { color: var(--error); }

/* ── Index ──────────────────────────────────────────────────────────────── */

.gt-index { max-width: 1180px; margin: 0 auto; padding: 24px 20px 96px; }
.gt-summary { display: flex; flex-wrap: wrap; gap: 10px 28px; margin-bottom: 22px; }
.gt-stat { display: grid; gap: 1px; }
.gt-stat b { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
.gt-stat span { font-size: 11.5px; color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.06em; }

.gt-spread { display: flex; height: 10px; border-radius: 999px; overflow: hidden; border: 1px solid var(--border); margin: 6px 0 20px; }
.gt-spread div { min-width: 2px; }

.gt-table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); }
table.gt-list { border-collapse: collapse; width: 100%; font-size: 13.5px; min-width: 640px; }
table.gt-list th, table.gt-list td { padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--border); }
table.gt-list th { background: var(--surface-2); font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-dim); cursor: pointer; white-space: nowrap; }
table.gt-list th[aria-sort] { color: var(--text); }
table.gt-list tbody tr:last-child td { border-bottom: 0; }
table.gt-list tbody tr:hover { background: var(--surface-2); }
table.gt-list td.gt-num { text-align: right; font-variant-numeric: tabular-nums; }
table.gt-list a { color: var(--text); text-decoration: none; font-weight: 600; }
table.gt-list a:hover { color: var(--accent); text-decoration: underline; }
.gt-pill { font-size: 11px; padding: 1px 7px; border-radius: 999px; border: 1px solid var(--border-strong); color: var(--text-dim); white-space: nowrap; }
.gt-zero { color: var(--text-faint); }
.gt-bad { color: var(--error); font-weight: 650; }
.gt-mid { color: var(--warn); font-weight: 600; }

.gt-empty { color: var(--text-dim); padding: 28px 0; }
.gt-foot { max-width: 1180px; margin: 0 auto; padding: 0 20px 40px; font-size: 12px; color: var(--text-faint); }
.gt-foot code { font-family: var(--mono); }

@media print {
  .gt-header, .gt-rail, .gt-card { display: none !important; }
  .gt-main { grid-template-columns: minmax(0, 1fr); }
}
`;

export default CSS;
