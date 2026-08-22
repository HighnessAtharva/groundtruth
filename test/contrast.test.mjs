import test from 'node:test';
import assert from 'node:assert/strict';
import { CSS } from '../src/report/assets/css.mjs';
import { DEFAULT_VERDICTS, DERIVED_VERDICTS } from '../src/core/config.mjs';
import {
  contrastOklch, oklchToSrgb, contrast, outOfGamut, readTokens, hexToSrgb, toHex,
} from './tools/color.mjs';

const light = readTokens(CSS, ':root {');
const dark = readTokens(CSS, ':root[data-theme="dark"]');

const THEMES = [
  { name: 'light', tokens: light },
  { name: 'dark', tokens: dark },
];

/**
 * Body copy, and every piece of apparatus text small enough to need the full
 * 4.5:1. Nothing in this report is large text except the headings and the two
 * numbers, so the strict threshold is the right default.
 */
const TEXT_TOKENS = ['ink', 'ink-2', 'ink-3', 'accent', 'good', 'mid', 'bad'];

for (const { name, tokens } of THEMES) {
  test(`${name}: every text token clears 4.5:1 on paper`, () => {
    const paper = tokens.oklch.paper;
    const failures = [];
    for (const token of TEXT_TOKENS) {
      const value = tokens.oklch[token];
      assert.ok(value, `--${token} is missing from the ${name} block`);
      const ratio = contrastOklch(value, paper);
      if (ratio < 4.5) failures.push(`--${token} ${ratio.toFixed(2)}:1 (${toHex(oklchToSrgb(...value))})`);
    }
    assert.deepEqual(failures, []);
  });

  test(`${name}: every verdict rule clears 3:1, which is the bar for a 2px rule`, () => {
    const paper = tokens.oklch.paper;
    const l = tokens.scalar['v-l'];
    const c = tokens.scalar['v-c'];
    assert.ok(l && c, `--v-l and --v-c must be scalars in the ${name} block`);

    const failures = [];
    for (const [verdict, spec] of Object.entries({ ...DEFAULT_VERDICTS, ...DERIVED_VERDICTS })) {
      // An emphatic verdict draws its rule over its own wash, not over paper.
      const behind = spec.emphatic
        ? [tokens.scalar['v-wash-l'], tokens.scalar['v-wash-c'], spec.hue]
        : paper;
      const ratio = contrastOklch([l, c, spec.hue], behind);
      if (ratio < 3) failures.push(`${verdict} (hue ${spec.hue}) ${ratio.toFixed(2)}:1`);
    }
    assert.deepEqual(failures, []);
  });

  test(`${name}: body text stays legible on an emphatic verdict's wash`, () => {
    // A blocking claim is the one sentence a reader must be able to read.
    const ink = tokens.oklch.ink;
    const washL = tokens.scalar['v-wash-l'];
    const washC = tokens.scalar['v-wash-c'];
    const failures = [];
    for (const [verdict, spec] of Object.entries(DEFAULT_VERDICTS)) {
      if (!spec.emphatic) continue;
      const ratio = contrastOklch(ink, [washL, washC, spec.hue]);
      if (ratio < 4.5) failures.push(`${verdict}: ${ratio.toFixed(2)}:1`);
    }
    assert.deepEqual(failures, []);
  });

  test(`${name}: hairlines are visible without shouting`, () => {
    const paper = tokens.oklch.paper;
    for (const token of ['rule', 'rule-2']) {
      const ratio = contrastOklch(tokens.oklch[token], paper);
      assert.ok(ratio >= 1.15, `--${token} is invisible at ${ratio.toFixed(2)}:1`);
      assert.ok(ratio <= 6, `--${token} is too loud for a hairline at ${ratio.toFixed(2)}:1`);
    }
  });

  test(`${name}: no color is clipped out of the sRGB gamut`, () => {
    const clipped = [];
    for (const [token, value] of Object.entries(tokens.oklch)) {
      if (outOfGamut(...value)) clipped.push(`--${token}`);
    }
    const l = tokens.scalar['v-l'];
    const c = tokens.scalar['v-c'];
    for (const [verdict, spec] of Object.entries(DEFAULT_VERDICTS)) {
      if (outOfGamut(l, c, spec.hue)) clipped.push(`verdict ${verdict}`);
    }
    // A clipped color renders as a different hue than the one that was chosen, so
    // two verdicts can silently converge.
    assert.deepEqual(clipped, []);
  });

  test(`${name}: the hex fallback is close to the oklch value it stands in for`, () => {
    // An old browser keeps the hex. If the two drift, the page looks different
    // there for no reason anybody would think to check.
    const failures = [];
    for (const [token, hex] of Object.entries(tokens.hex)) {
      const target = tokens.oklch[token];
      if (!target) continue;
      const ratio = contrast(hexToSrgb(hex), oklchToSrgb(...target));
      if (ratio > 1.25) failures.push(`--${token}: ${hex} vs ${toHex(oklchToSrgb(...target))} (${ratio.toFixed(2)}:1 apart)`);
    }
    assert.deepEqual(failures, []);
  });
}

test('the two themes really are different', () => {
  assert.notDeepEqual(light.oklch.paper, dark.oklch.paper);
  assert.notDeepEqual(light.oklch.ink, dark.oklch.ink);
  assert.notEqual(light.scalar['v-l'], dark.scalar['v-l']);
});

test('paper is never pure white and ink is never pure black', () => {
  for (const { name, tokens } of THEMES) {
    const paper = oklchToSrgb(...tokens.oklch.paper);
    const ink = oklchToSrgb(...tokens.oklch.ink);
    assert.notEqual(toHex(paper), '#ffffff', `${name} paper is pure white`);
    assert.notEqual(toHex(ink), '#000000', `${name} ink is pure black`);
    assert.ok(tokens.oklch.paper[1] > 0, `${name} paper carries no hue tint`);
  }
});

test('the verdict hues are far enough apart to tell apart', () => {
  const hues = Object.entries(DEFAULT_VERDICTS).map(([name, spec]) => ({ name, hue: spec.hue }));
  const blocking = new Set(
    Object.entries(DEFAULT_VERDICTS).filter(([, spec]) => spec.emphatic).map(([name]) => name),
  );

  for (const a of hues) {
    for (const b of hues) {
      if (a.name >= b.name) continue;
      // The two blocking verdicts sit close on purpose. They are the same kind of
      // problem and treatment, not hue, is what separates them from the rest.
      if (blocking.has(a.name) && blocking.has(b.name)) continue;
      const raw = Math.abs(a.hue - b.hue);
      const apart = Math.min(raw, 360 - raw);
      assert.ok(apart >= 25, `${a.name} (${a.hue}) and ${b.name} (${b.hue}) are only ${apart} degrees apart`);
    }
  }
});

test('the verdict system has one shared lightness, so no verdict looks louder', () => {
  // The whole reason the palette moved off HSL. In HSL, hsl(82 80% 50%) and
  // hsl(245 80% 50%) state the same lightness and look nothing alike, so an
  // amber verdict read as more urgent than a blue one for no reason.
  for (const { name, tokens } of THEMES) {
    const l = tokens.scalar['v-l'];
    const c = tokens.scalar['v-c'];
    const ratios = Object.values(DEFAULT_VERDICTS).map((spec) =>
      contrastOklch([l, c, spec.hue], tokens.oklch.paper));
    const spread = Math.max(...ratios) / Math.min(...ratios);
    assert.ok(spread <= 1.7, `${name}: verdict contrast spread is ${spread.toFixed(2)}x, too uneven`);
  }
});

test('no rule in the stylesheet uses a colored side stripe', () => {
  // Banned. A border-left over 1px as a decorative accent on a callout, a
  // finding, or a quote block. A blockquote rule is the typographic mark of
  // quotation and stays, at 1px.
  const offenders = [];
  const pattern = /border-(left|right):\s*(\d+)px\s+solid\s+([^;]+);/g;
  for (const match of CSS.matchAll(pattern)) {
    const width = Number(match[2]);
    if (width <= 1) continue;
    const before = CSS.slice(Math.max(0, match.index - 260), match.index);
    const selector = before.split('\n').filter((line) => line.includes('{')).pop() || '?';
    offenders.push(`${selector.trim()} -> ${match[0].trim()}`);
  }
  assert.deepEqual(offenders, []);
});

test('the stylesheet has no gradient text, glass, or animated layout property', () => {
  assert.ok(!CSS.includes('background-clip: text'), 'gradient text is banned');
  assert.ok(!/backdrop-filter/.test(CSS), 'decorative glass is banned');
  assert.ok(!/transition:[^;]*\b(width|height|top|left|margin|padding)\b/.test(CSS),
    'no transition on a layout property');
});

test('the type scale keeps at least a 1.2 ratio between steps', () => {
  const sizes = [...CSS.matchAll(/\.gt-prose (h[1-4])[^{]*\{[^}]*font-size:\s*([\d.]+)rem/g)]
    .map((match) => ({ tag: match[1], rem: Number(match[2]) }));
  const byTag = Object.fromEntries(sizes.map((entry) => [entry.tag, entry.rem]));
  const steps = [[byTag.h1, byTag.h2], [byTag.h2, byTag.h3], [byTag.h3, 1]];
  for (const [big, small] of steps) {
    assert.ok(big && small, `missing a step in the scale: ${JSON.stringify(byTag)}`);
    assert.ok(big / small >= 1.2, `flat step: ${big} over ${small} is ${(big / small).toFixed(2)}`);
  }
});

test('the prose measure is capped in the reading range', () => {
  const match = /grid-template-columns:\s*minmax\(0,\s*(\d+)ch\)/.exec(CSS);
  assert.ok(match, 'the prose column must be capped in ch, not in px');
  const ch = Number(match[1]);
  assert.ok(ch >= 60 && ch <= 78, `${ch}ch is outside the 60 to 78 reading range`);
});
