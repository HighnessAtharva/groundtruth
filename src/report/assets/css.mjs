// The whole stylesheet, as one exported string, inlined into every page.
// No build step, no bundler, no CDN, no web fonts.
//
// The design system and the reasoning behind it live in DESIGN.md. Four things
// here are load-bearing rather than cosmetic, and each cost a debugging round.
//
// 1. Colors are OKLCH. In HSL, hsl(82 80% 50%) and hsl(245 80% 50%) state the
//    same lightness and look nothing alike, so an amber verdict read as more
//    urgent than a blue one for no reason. OKLCH lightness is perceptual, so one
//    shared lightness across seven hues gives seven verdicts the same weight.
//    Every core token carries a hex declaration first, which an old browser keeps
//    when it cannot parse the oklch one.
//
// 2. Annotations underline rather than highlight. A background wash on forty
//    bound claims is a wall of highlighter and the prose stops being readable.
//    Only the two blocking verdicts carry a wash, which makes them more visible
//    rather than less.
//
// 3. The hover cue never uses `filter`. A filter creates a stacking context on
//    the hovered element and traps the card's z-index inside it. The mark takes a
//    z-index instead.
//
// 4. The card is `position: fixed`. An ancestor with `overflow: auto`, which
//    every table wrapper on this page has, clips an absolutely positioned
//    descendant.

export const CSS = `
:root {
  color-scheme: light dark;

  /* Solved, not eyeballed. test/contrast.test.mjs recomputes every ratio from
     these values, so a token that stops clearing its threshold fails the suite
     rather than shipping. Each colour is also fitted to the sRGB gamut, because a
     clipped colour renders as a different hue than the one that was chosen and
     two verdicts can silently converge.

     Scalars, never a composed colour, for --v-*. A custom property containing
     var(--h) resolves it against the element it is DECLARED on, which here is
     :root where --h is unset, so every verdict collapsed onto one hue. The
     oklch() is assembled at each point of use instead. */
  --paper: #fdfbf8;
  --paper: oklch(0.988 0.004 75);
  --surface: #f5f3f0;
  --surface: oklch(0.965 0.005 75);
  --surface-2: #edeae6;
  --surface-2: oklch(0.938 0.006 75);
  --ink: #28231e;
  --ink: oklch(0.26 0.012 70);
  --ink-2: #5c5751;
  --ink-2: oklch(0.46 0.012 70);
  --ink-3: #746f69;
  --ink-3: oklch(0.545 0.011 70);
  --rule: #e1ddda;
  --rule: oklch(0.9 0.006 70);
  --rule-2: #c7c3bf;
  --rule-2: oklch(0.82 0.008 70);
  --accent: #0067c8;
  --accent: oklch(0.52 0.171 255);
  --good: #0d7a3e;
  --good: oklch(0.51 0.13 152);
  --mid: #9b610e;
  --mid: oklch(0.545 0.115 68);
  --bad: #a92324;
  --bad: oklch(0.48 0.17 26);
  --hard: #a92324;
  --hard: oklch(0.48 0.17 26);
  --tough: #807100;
  --tough: oklch(0.545 0.114 100);

  --v-l: 0.615;
  --v-c: 0.104;
  --v-wash-l: 0.92;
  --v-wash-c: 0.04;
  --v-edge-l: 0.72;
  --v-edge-c: 0.09;

  --shadow: 0 1px 2px oklch(0.26 0.012 70 / 0.06), 0 8px 28px oklch(0.26 0.012 70 / 0.11);
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, Helvetica, Arial, sans-serif;
  --ease: cubic-bezier(0.22, 1, 0.36, 1);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --paper: #121417;
    --paper: oklch(0.19 0.008 265);
    --surface: #1c1e22;
    --surface: oklch(0.235 0.009 265);
    --surface-2: #25282d;
    --surface-2: oklch(0.275 0.01 265);
    --ink: #eae7e3;
    --ink: oklch(0.93 0.006 80);
    --ink-2: #b2afaa;
    --ink-2: oklch(0.755 0.008 80);
    --ink-3: #85817a;
    --ink-3: oklch(0.605 0.011 80);
    --rule: #2e3036;
    --rule: oklch(0.31 0.01 265);
    --rule-2: #44484e;
    --rule-2: oklch(0.4 0.012 265);
    --accent: #76b2ff;
    --accent: oklch(0.755 0.127 255);
    --good: #62d286;
    --good: oklch(0.78 0.15 152);
    --mid: #f9a63e;
    --mid: oklch(0.79 0.15 68);
    --bad: #ff877e;
    --bad: oklch(0.755 0.147 26);
    --hard: #ff877e;
    --hard: oklch(0.755 0.147 26);
    --tough: #dbc63f;
    --tough: oklch(0.82 0.15 100);

    --v-l: 0.76;
    --v-c: 0.128;
    --v-wash-l: 0.345;
    --v-wash-c: 0.06;
    --v-edge-l: 0.5;
    --v-edge-c: 0.1;

    --shadow: 0 1px 2px oklch(0 0 0 / 0.5), 0 12px 34px oklch(0 0 0 / 0.45);
  }
}

:root[data-theme="dark"] {
  --paper: #121417;
  --paper: oklch(0.19 0.008 265);
  --surface: #1c1e22;
  --surface: oklch(0.235 0.009 265);
  --surface-2: #25282d;
  --surface-2: oklch(0.275 0.01 265);
  --ink: #eae7e3;
  --ink: oklch(0.93 0.006 80);
  --ink-2: #b2afaa;
  --ink-2: oklch(0.755 0.008 80);
  --ink-3: #85817a;
  --ink-3: oklch(0.605 0.011 80);
  --rule: #2e3036;
  --rule: oklch(0.31 0.01 265);
  --rule-2: #44484e;
  --rule-2: oklch(0.4 0.012 265);
  --accent: #76b2ff;
  --accent: oklch(0.755 0.127 255);
  --good: #62d286;
  --good: oklch(0.78 0.15 152);
  --mid: #f9a63e;
  --mid: oklch(0.79 0.15 68);
  --bad: #ff877e;
  --bad: oklch(0.755 0.147 26);
  --hard: #ff877e;
  --hard: oklch(0.755 0.147 26);
  --tough: #dbc63f;
  --tough: oklch(0.82 0.15 100);

  --v-l: 0.76;
  --v-c: 0.128;
  --v-wash-l: 0.345;
  --v-wash-c: 0.06;
  --v-edge-l: 0.5;
  --v-edge-c: 0.1;

  --shadow: 0 1px 2px oklch(0 0 0 / 0.5), 0 12px 34px oklch(0 0 0 / 0.45);
}

*, *::before, *::after { box-sizing: border-box; }

html { -webkit-text-size-adjust: 100%; }

body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 16px;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
}

a {
  color: var(--accent);
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}
a:hover { text-decoration-thickness: 2px; }

img, svg, video, canvas { max-width: 100%; height: auto; }

:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 2px; }

/* ── Header ─────────────────────────────────────────────────────────────── */

.gt-header {
  position: sticky;
  top: 0;
  z-index: 40;
  background: var(--paper);
  border-bottom: 1px solid var(--rule);
}

.gt-header-inner {
  max-width: 1160px;
  margin: 0 auto;
  padding: 12px 28px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  align-items: baseline;
}

.gt-brand { font-size: 14px; font-weight: 680; letter-spacing: -0.015em; }
.gt-brand a { color: var(--ink); text-decoration: none; }
.gt-brand a:hover { color: var(--accent); }

.gt-crumb {
  color: var(--ink-3);
  font-family: var(--mono);
  font-size: 12px;
  min-width: 0;
  overflow-wrap: anywhere;
}

.gt-chips { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-left: auto; align-items: baseline; }

/* A label and a figure, set as type. A row of bordered capsules is the
   metric-tile reflex and it competes with the prose for attention. */
.gt-chip { font-size: 12px; color: var(--ink-3); white-space: nowrap; text-decoration: none; }
.gt-chip b {
  color: var(--ink);
  font-variant-numeric: tabular-nums;
  font-weight: 660;
  margin-left: 3px;
}
.gt-chip-error b { color: var(--bad); }
.gt-chip-warn b { color: var(--mid); }
.gt-chip-ok b { color: var(--good); }
a.gt-chip:hover { color: var(--accent); }

.gt-theme {
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  border: 0;
  border-bottom: 1px solid var(--rule-2);
  background: none;
  color: var(--ink-3);
  transition: color 140ms var(--ease), border-color 140ms var(--ease);
}
.gt-theme:hover { color: var(--ink); border-bottom-color: var(--ink-2); }

/* ── Layout ─────────────────────────────────────────────────────────────── */

.gt-main {
  max-width: 1160px;
  margin: 0 auto;
  padding: 40px 28px 120px;
  display: grid;
  /* minmax(0, ...) and never 1fr. 1fr has an auto minimum, so one wide table
     pushes the whole grid sideways. */
  grid-template-columns: minmax(0, 68ch) minmax(0, 300px);
  gap: 56px;
  align-items: start;
}

@media (max-width: 960px) {
  .gt-main {
    grid-template-columns: minmax(0, 1fr);
    gap: 28px;
    padding: 24px 20px 80px;
  }
  .gt-rail { order: -1; position: static !important; }
  .gt-header-inner { padding: 10px 20px; }
  .gt-index, .gt-foot { padding-left: 20px; padding-right: 20px; }
}

.gt-prose { min-width: 0; overflow-wrap: anywhere; }
.gt-prose > :first-child { margin-top: 0; }

.gt-prose h1 {
  font-size: 2.1rem;
  line-height: 1.15;
  font-weight: 680;
  letter-spacing: -0.025em;
  margin: 0 0 1.4rem;
  text-wrap: balance;
}
.gt-prose h2 {
  font-size: 1.6rem;
  line-height: 1.2;
  font-weight: 680;
  letter-spacing: -0.018em;
  margin: 2.8rem 0 0.8rem;
  text-wrap: balance;
}
.gt-prose h3 {
  font-size: 1.25rem;
  line-height: 1.3;
  font-weight: 660;
  letter-spacing: -0.01em;
  margin: 2rem 0 0.5rem;
}
.gt-prose h4, .gt-prose h5, .gt-prose h6 {
  font-size: 1rem;
  font-weight: 660;
  margin: 1.6rem 0 0.4rem;
}
.gt-prose p { margin: 0 0 1.15rem; }
.gt-prose ul, .gt-prose ol { margin: 0 0 1.15rem; padding-left: 1.4rem; }
.gt-prose li { margin: 0.3rem 0; }
.gt-prose li > ul, .gt-prose li > ol { margin: 0.3rem 0; }
.gt-prose hr { border: 0; border-top: 1px solid var(--rule); margin: 2.6rem 0; }

/* A blockquote rule is the typographic mark of quotation, not a decorative
   accent, so it stays at 1px and neutral. */
.gt-prose blockquote {
  margin: 1.4rem 0;
  padding: 0 0 0 1.15rem;
  border-left: 1px solid var(--rule-2);
  color: var(--ink-2);
  font-style: italic;
}
.gt-prose blockquote > :last-child { margin-bottom: 0; }

/* A full-bordered block with a tint and a set label. No side stripe. */
.gt-callout {
  margin: 1.6rem 0;
  padding: 14px 16px 2px;
  border: 1px solid var(--rule-2);
  border-radius: 3px;
  background: var(--surface);
}
.gt-callout-kind {
  margin: 0 0 8px !important;
  font-size: 11px;
  font-weight: 680;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-3);
}
.gt-callout > :last-child { margin-bottom: 14px !important; }

.gt-prose code {
  font-family: var(--mono);
  font-size: 0.855em;
  background: var(--surface-2);
  border-radius: 3px;
  padding: 0.12em 0.34em;
}

.gt-prose pre {
  margin: 0;
  padding: 14px 16px;
  font-family: var(--mono);
  font-size: 13px;
  line-height: 1.55;
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: 3px;
  color: var(--ink);
}
.gt-prose pre code { background: none; padding: 0; font-size: inherit; }

/* An untagged fence gets a full tinted border, never a side stripe. */
.gt-untagged-fence pre { border-color: var(--tough); }

/* Wide content scrolls inside its own box. The page body never does. */
.gt-scroll { overflow-x: auto; margin: 1.6rem 0; max-width: 100%; }
.gt-scroll pre { overflow-x: visible; }

.gt-prose table {
  border-collapse: collapse;
  font-size: 14px;
  min-width: 100%;
  font-variant-numeric: tabular-nums;
}
.gt-prose th, .gt-prose td {
  border-bottom: 1px solid var(--rule);
  padding: 8px 16px 8px 0;
  text-align: left;
  vertical-align: top;
}
.gt-prose th {
  font-size: 11.5px;
  font-weight: 680;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--ink-3);
  border-bottom-color: var(--rule-2);
}
.gt-prose tbody tr:last-child td { border-bottom: 0; }

.gt-figure { margin: 2rem 0; }
.gt-figure img { border: 1px solid var(--rule); border-radius: 3px; display: block; }
.gt-figure figcaption { font-size: 12.5px; color: var(--ink-3); margin-top: 8px; line-height: 1.5; }
.gt-raw-html { color: var(--ink-3); font-size: 12px; }
.gt-fn { color: var(--ink-3); font-size: 11px; }

/* ── Marks ──────────────────────────────────────────────────────────────── */

/* Underline first. A wash on every bound claim is a wall of highlighter, and on
   a page with forty of them the prose stops being readable. */
.gt-span {
  background: none;
  color: inherit;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
  border-bottom: 2px solid oklch(var(--v-l) var(--v-c) var(--h, 262));
  padding-bottom: 1px;
  cursor: help;
  transition: background-color 140ms var(--ease);
}
.gt-span:hover, .gt-span:focus-visible {
  background: oklch(var(--v-wash-l) var(--v-wash-c) var(--h, 262));
  /* Never a filter here. It creates a stacking context and traps the card. */
  position: relative;
  z-index: 60;
}

/* A wash only when the verdict blocks. Inverting the emphasis makes the two real
   problems more visible, because they stop competing with the ones that are fine. */
.gt-span.gt-emphatic {
  background: oklch(var(--v-wash-l) var(--v-wash-c) var(--h, 262));
  box-shadow: inset 0 0 0 1px oklch(var(--v-edge-l) var(--v-edge-c) var(--h, 262));
  border-radius: 2px;
  padding: 0.05em 0.22em 1px;
  font-weight: 560;
}
.gt-span.gt-emphatic:hover, .gt-span.gt-emphatic:focus-visible {
  box-shadow: inset 0 0 0 1px oklch(var(--v-l) var(--v-c) var(--h, 262));
}

/* Dotted, so a hard sentence and a cited sentence never read as the same kind of
   thing. A sentence that is both nests, the citation rule under the dotted one. */
.gt-read {
  text-decoration: underline dotted 2px var(--tough);
  text-underline-offset: 5px;
  cursor: help;
}
.gt-read.gt-band-hard { text-decoration-color: var(--hard); }

/* ── Hover card ─────────────────────────────────────────────────────────── */

.gt-card {
  position: fixed;
  z-index: 200;
  width: min(370px, calc(100vw - 24px));
  max-height: min(58vh, 440px);
  overflow-y: auto;
  overscroll-behavior: contain;
  display: none;
  padding: 14px 16px;
  background: var(--paper);
  border: 1px solid var(--rule-2);
  border-radius: 4px;
  box-shadow: var(--shadow);
  font-size: 13px;
  line-height: 1.55;
}
.gt-card[data-open="1"] { display: block; }

.gt-card-verdict {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  color: oklch(var(--v-l) var(--v-c) var(--h, 262));
  margin-bottom: 10px;
  display: flex;
  align-items: baseline;
  gap: 7px;
}
.gt-card-verdict::before {
  content: "";
  width: 9px;
  height: 9px;
  border-radius: 2px;
  background: oklch(var(--v-l) var(--v-c) var(--h, 262));
  flex: none;
}

.gt-card-row { margin: 10px 0; }
.gt-card-row:last-of-type { margin-bottom: 0; }
.gt-card-label {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  font-weight: 680;
  color: var(--ink-3);
  margin-bottom: 3px;
}
/* A full-bordered tinted block, not a side stripe. */
.gt-card-quote {
  padding: 9px 11px;
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: 3px;
  font-family: var(--mono);
  font-size: 11.5px;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--ink);
}
.gt-card-note { color: var(--ink-2); }
.gt-card-src { font-family: var(--mono); font-size: 11.5px; overflow-wrap: anywhere; }
.gt-card-warn { color: var(--mid); font-size: 12px; margin: 8px 0; }
.gt-card-hint {
  color: var(--ink-3);
  font-size: 11px;
  margin-top: 12px;
  padding-top: 9px;
  border-top: 1px solid var(--rule);
}
.gt-card ul { margin: 4px 0 0; padding-left: 17px; color: var(--ink-2); }
.gt-card li { margin: 2px 0; }
.gt-card-fix { color: var(--ink); font-weight: 520; }

/* ── Apparatus ──────────────────────────────────────────────────────────── */

/* One continuous surface divided by hairlines. Not a stack of floating cards. */
.gt-rail {
  position: sticky;
  top: 66px;
  min-width: 0;
  border-top: 2px solid var(--ink);
  font-size: 13px;
}

.gt-panel { border-bottom: 1px solid var(--rule); }
.gt-panel > summary {
  cursor: pointer;
  padding: 11px 0;
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--ink-2);
  display: flex;
  gap: 8px;
  align-items: baseline;
  list-style: none;
  transition: color 140ms var(--ease);
}
.gt-panel > summary:hover { color: var(--ink); }
.gt-panel > summary::-webkit-details-marker { display: none; }
.gt-panel-body { padding: 0 0 18px; }

.gt-count {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
  font-weight: 600;
}

.gt-legend { display: grid; gap: 6px; }
.gt-legend-item {
  font-size: 12px;
  color: var(--ink-2);
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.gt-legend-item::before {
  content: "";
  width: 9px;
  height: 9px;
  border-radius: 2px;
  background: oklch(var(--v-l) var(--v-c) var(--h, 262));
  flex: none;
}
.gt-legend-item b {
  margin-left: auto;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
  font-weight: 620;
}

.gt-checks { list-style: none; margin: 0; padding: 0; display: grid; gap: 11px; }
.gt-check { display: grid; grid-template-columns: 13px minmax(0, 1fr); gap: 9px; }
.gt-check-glyph { font-size: 11px; line-height: 1.6; font-weight: 700; }
.gt-check-pass .gt-check-glyph { color: var(--good); }
.gt-check-warn .gt-check-glyph { color: var(--mid); }
.gt-check-fail .gt-check-glyph { color: var(--bad); }
.gt-check-label { font-weight: 620; color: var(--ink); }
.gt-check-detail { color: var(--ink-2); font-size: 12px; overflow-wrap: anywhere; }
.gt-check-fix { color: var(--accent); font-size: 12px; margin-top: 2px; }
.gt-advisory {
  font-size: 9.5px;
  color: var(--ink-3);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 680;
  margin-left: 5px;
}

.gt-group-label {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  font-weight: 680;
  color: var(--ink-3);
  margin: 18px 0 8px;
}
.gt-group-label:first-child { margin-top: 0; }

.gt-findings { list-style: none; margin: 0; padding: 0; }
/* A hairline above each finding and a leading severity glyph. No side stripe. */
.gt-finding { padding: 12px 0; border-top: 1px solid var(--rule); }
.gt-finding:first-child { padding-top: 0; border-top: 0; }
.gt-finding:last-child { padding-bottom: 0; }
.gt-finding-head {
  display: flex;
  align-items: baseline;
  gap: 7px;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--ink-3);
  margin-bottom: 4px;
}
.gt-finding-glyph { font-weight: 700; font-family: var(--sans); flex: none; }
.gt-finding-error .gt-finding-glyph { color: var(--bad); }
.gt-finding-warn .gt-finding-glyph { color: var(--mid); }
.gt-finding-info .gt-finding-glyph { color: var(--accent); }
.gt-finding-blocking {
  margin-left: auto;
  font-family: var(--sans);
  font-size: 9.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 700;
  color: var(--bad);
}
.gt-finding-msg { font-size: 12.5px; color: var(--ink); }
.gt-finding-fix { font-size: 12px; color: var(--ink-2); margin-top: 3px; }

.gt-score {
  font-size: 30px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.035em;
  line-height: 1;
  margin-bottom: 6px;
}
.gt-score span { font-size: 12px; font-weight: 500; letter-spacing: 0; color: var(--ink-3); }
.gt-score-good { color: var(--good); }
.gt-score-ok { color: var(--mid); }
.gt-score-poor { color: var(--bad); }

/* ── Index ──────────────────────────────────────────────────────────────── */

.gt-index { max-width: 1160px; margin: 0 auto; padding: 44px 28px 40px; }

.gt-index-lede {
  font-size: 1.25rem;
  line-height: 1.45;
  letter-spacing: -0.012em;
  color: var(--ink);
  max-width: 48ch;
  margin: 0 0 38px;
  text-wrap: pretty;
}
.gt-index-lede b { font-weight: 680; }

.gt-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 44px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--rule);
}
.gt-stat { display: grid; gap: 0; }
.gt-stat b {
  font-size: 25px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.03em;
  line-height: 1.2;
}
.gt-stat span {
  font-size: 11px;
  color: var(--ink-3);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 620;
}

.gt-spread { display: flex; height: 4px; overflow: hidden; margin: 24px 0 14px; gap: 1px; }
.gt-spread div { min-width: 2px; border-radius: 1px; }

.gt-index .gt-legend { display: flex; flex-wrap: wrap; gap: 7px 22px; margin-bottom: 34px; }
.gt-index .gt-legend-item b { margin-left: 3px; }

.gt-table-wrap { overflow-x: auto; border-top: 2px solid var(--ink); }
table.gt-list {
  border-collapse: collapse;
  width: 100%;
  font-size: 13.5px;
  min-width: 660px;
  font-variant-numeric: tabular-nums;
}
table.gt-list th, table.gt-list td {
  padding: 11px 16px 11px 0;
  text-align: left;
  border-bottom: 1px solid var(--rule);
}
table.gt-list th {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  font-weight: 700;
  color: var(--ink-3);
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
  transition: color 140ms var(--ease);
}
table.gt-list th:hover, table.gt-list th[aria-sort] { color: var(--ink); }
table.gt-list th[aria-sort="descending"]::after { content: " \\2193"; }
table.gt-list th[aria-sort="ascending"]::after { content: " \\2191"; }
table.gt-list tbody tr:last-child td { border-bottom: 0; }
table.gt-list td.gt-num { text-align: right; padding-right: 20px; }
table.gt-list a { color: var(--ink); text-decoration: none; font-weight: 620; }
table.gt-list a:hover { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; }
table.gt-list .gt-check-detail { font-family: var(--mono); font-size: 11px; margin-top: 2px; }
.gt-pill { font-size: 11px; color: var(--ink-3); white-space: nowrap; }
.gt-zero { color: var(--ink-3); }
.gt-bad { color: var(--bad); font-weight: 660; }
.gt-mid { color: var(--mid); font-weight: 620; }

.gt-empty { color: var(--ink-2); padding: 34px 0; max-width: 54ch; }
.gt-foot {
  max-width: 80ch;
  margin: 0 auto;
  padding: 28px 28px 64px;
  font-size: 11.5px;
  color: var(--ink-3);
  line-height: 1.7;
}
.gt-foot code { font-family: var(--mono); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}

@media print {
  .gt-header, .gt-rail, .gt-card, .gt-theme { display: none !important; }
  .gt-main { grid-template-columns: minmax(0, 1fr); padding: 0; }
  .gt-span { border-bottom-width: 1px; }
}
`;

export default CSS;
