// OKLCH to sRGB, and WCAG contrast, for the stylesheet tests.
//
// Contrast is verified in Node rather than in a browser on purpose. A browser
// with forced dark mode repaints backgrounds regardless of the CSS, so an
// in-page probe reported the same numbers for both themes and neither was the
// stylesheet's. Computing from the token values is deterministic, runs in CI, and
// cannot be distorted by a viewer setting.

const OKLAB_TO_LMS = [
  [1, 0.3963377774, 0.2158037573],
  [1, -0.1055613458, -0.0638541728],
  [1, -0.0894841775, -1.2914855480],
];

const LMS_TO_LINEAR = [
  [4.0767416621, -3.3077115913, 0.2309699292],
  [-1.2684380046, 2.6097574011, -0.3413193965],
  [-0.0041960863, -0.7034186147, 1.7076147010],
];

function linearToSrgb(value) {
  return value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
}

/** @returns {[number, number, number]} channels in 0..1, clamped to gamut. */
export function oklchToSrgb(l, c, hDegrees) {
  const h = (hDegrees * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);

  const lms = OKLAB_TO_LMS.map((row) => row[0] * l + row[1] * a + row[2] * b);
  const cubed = lms.map((value) => value ** 3);
  const linear = LMS_TO_LINEAR.map(
    (row) => row[0] * cubed[0] + row[1] * cubed[1] + row[2] * cubed[2],
  );

  return linear.map((value) => Math.min(1, Math.max(0, linearToSrgb(value))));
}

/** True when the color needed clamping to fit sRGB, which changes how it looks. */
export function outOfGamut(l, c, hDegrees) {
  const h = (hDegrees * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const lms = OKLAB_TO_LMS.map((row) => row[0] * l + row[1] * a + row[2] * b);
  const cubed = lms.map((value) => value ** 3);
  const linear = LMS_TO_LINEAR.map(
    (row) => row[0] * cubed[0] + row[1] * cubed[1] + row[2] * cubed[2],
  );
  return linear.some((value) => value < -0.001 || value > 1.001);
}

export function relativeLuminance([r, g, b]) {
  const channel = (value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function contrastOklch(front, back) {
  return contrast(oklchToSrgb(...front), oklchToSrgb(...back));
}

export function toHex([r, g, b]) {
  const part = (value) => Math.round(value * 255).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

const OKLCH = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/;
const HEX = /^#([0-9a-f]{6})$/i;

/**
 * Pull `--token: value` pairs out of one CSS block.
 *
 * The stylesheet declares each core token twice, a hex first and an oklch second,
 * so an old browser keeps the value it can parse. The later declaration wins, so
 * this keeps the last one and also returns the hex fallbacks for comparison.
 */
export function readTokens(css, blockSelector) {
  const start = css.indexOf(blockSelector);
  if (start === -1) throw new Error(`block not found: ${blockSelector}`);
  const open = css.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  const body = css.slice(open + 1, end);
  const oklch = {};
  const hex = {};
  const scalar = {};

  for (const line of body.split(';')) {
    const match = /--([\w-]+)\s*:\s*(.+)/s.exec(line.trim());
    if (!match) continue;
    const [, name, raw] = match;
    const value = raw.trim();
    const parsed = OKLCH.exec(value);
    if (parsed) {
      oklch[name] = [Number(parsed[1]), Number(parsed[2]), Number(parsed[3])];
      continue;
    }
    if (HEX.test(value)) {
      hex[name] = value;
      continue;
    }
    if (/^[\d.]+$/.test(value)) scalar[name] = Number(value);
  }

  return { oklch, hex, scalar };
}

export function hexToSrgb(value) {
  const match = HEX.exec(value);
  if (!match) throw new Error(`not a hex color: ${value}`);
  const int = Number.parseInt(match[1], 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255].map((c) => c / 255);
}
