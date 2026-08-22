# groundtruth design system

The report is a critical edition: a manuscript, plus an apparatus recording what
each claim rests on. Not a dashboard. The prose is the content and everything else
is margin.

## Color

OKLCH throughout, because the verdict palette depends on it. In HSL,
`hsl(80 80% 45%)` and `hsl(250 80% 45%)` have the same stated lightness and
wildly different perceived brightness, so an amber verdict read as more urgent
than a blue one for no reason. OKLCH lightness is perceptual, so every verdict
lands at the same weight and only hue separates them.

Every token carries a hex declaration before its `oklch()` one. An old browser
ignores the value it cannot parse and keeps the hex.

### Strategy

**Restrained** for the chrome: tinted neutrals, one accent under 10% of the
surface. **Full palette** for the verdict system, because each verdict is a named
role used deliberately and there are seven of them.

### Neutrals

Warm paper, tinted toward hue 60. No pure black, no pure white.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | `oklch(0.988 0.004 75)` | `oklch(0.19 0.008 265)` | page ground |
| `--surface` | `oklch(1 0 0 / 0.7)` over paper | `oklch(0.235 0.009 265)` | apparatus, cards |
| `--ink` | `oklch(0.26 0.012 70)` | `oklch(0.93 0.006 80)` | body text |
| `--ink-2` | `oklch(0.50 0.012 70)` | `oklch(0.70 0.008 80)` | apparatus text |
| `--ink-3` | `oklch(0.64 0.010 70)` | `oklch(0.56 0.008 80)` | labels, metadata |
| `--rule` | `oklch(0.90 0.006 70)` | `oklch(0.31 0.010 265)` | hairlines |
| `--rule-2` | `oklch(0.82 0.008 70)` | `oklch(0.40 0.012 265)` | stronger borders |
| `--accent` | `oklch(0.47 0.16 262)` | `oklch(0.78 0.13 262)` | links, one accent |

Body text contrast is 13:1 light and 12:1 dark. Apparatus text clears 4.5:1 in
both. Metadata clears 4.5:1 as 13px.

### Verdicts

One hue per verdict. Lightness and chroma are shared, so contrast is constant.

| Verdict | Hue | Reading |
|---|---|---|
| VERIFIED | 152 | green |
| EXTERNAL | 245 | blue |
| FIGURE | 300 | violet |
| INFERRED | 82 | amber |
| DOC-DEFECT | 48 | orange |
| UNSOURCED | 25 | red |
| CONTRADICTED | 8 | crimson |
| STALE (derived) | 65 | ochre |

Shared values: `--v-ink: oklch(0.50 0.15 var(--h))` light,
`oklch(0.80 0.13 var(--h))` dark. `--v-wash: oklch(0.955 0.04 var(--h))` light,
`oklch(0.30 0.055 var(--h))` dark.

The hue is written onto the element as `style="--h: 152"`. Without it every mark
falls back to one default and a contradicted claim looks identical to a verified
one, which loses the only thing a skimmer reads.

## Annotation treatment

**Underline first.** A 2px rule under the phrase in the verdict color, offset from
the baseline. On a page with forty bound claims, a background wash on every one
produces a wall of highlighter and the prose stops being readable, which defeats
showing it in prose at all.

**A wash only when it blocks.** UNSOURCED and CONTRADICTED carry `emphatic: true`
and get a light background plus a thicker rule. Inverting the emphasis this way
makes the two real problems more visible, not less, because they are no longer
competing with thirty-eight green ones.

**Readability underlines are dotted.** A different mark shape, so a hard sentence
and a cited sentence never read as the same kind of thing. A sentence that is both
nests: the citation rule sits under the dotted one.

## Typography

System stack. No web fonts, because the page fetches nothing.

Scale, every step at least 1.25 apart: 13px apparatus, 16px body, 20px h3, 25.6px
h2, 33.6px h1. Weight carries hierarchy alongside size: 400 body, 600 apparatus
labels, 680 headings.

Measure capped at 68ch. Line height 1.65 on body, 1.2 on headings.

## Layout

Two columns above 960px: prose at `minmax(0, 68ch)`, apparatus at 300px.
`minmax(0, ...)` and never `1fr`, because `1fr` has an auto minimum and one wide
table pushes the grid sideways.

Below 960px the apparatus moves above the prose as collapsed sections.

The apparatus is one continuous surface divided by hairlines. Not three floating
cards. Nested cards are always wrong and a stack of sibling cards is usually the
lazy answer.

Wide content scrolls inside its own box: `overflow-x: auto` on code blocks and on
a wrapper around every table. Never `overflow-x: hidden` on the root, which hides
the bug rather than removing it.

## Motion

One transition, on background and border color, 140ms, `cubic-bezier(0.22, 1,
0.36, 1)`. Nothing animates a layout property. No motion on the hover card, which
needs to appear where the cursor already is.

`prefers-reduced-motion: reduce` removes all of it.

## Banned in this codebase

- **Side-stripe borders.** A `border-left` over 1px as a colored accent on a
  callout, a finding, or a quote block. Rewritten as full hairline borders with a
  background tint, or a leading glyph.
- **A `filter` on the hover cue.** It creates a stacking context on the hovered
  element and traps the card's z-index inside it. The mark takes a z-index.
- **Gradient text, glass, metric tiles, identical card grids.**
- **Em dashes** in any copy the tool emits.
