// Image checks.
//
// Three of these are mechanical and one is honest about what a text tool cannot
// do. A checker reads an image's alt text and its filename. It does not read the
// pixels, so it cannot tell you the chart is wrong, only that the number written
// under it disagrees with the number written in its own description.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { images as NEUTRAL_IMAGES } from '../../../presets/neutral.mjs';

const WORD_NUMBERS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

const WORD_NUMBER_PATTERN = new RegExp(
  `\\b(${Object.keys(WORD_NUMBERS).join('|')})[\\s-]+([a-z][a-z-]*)`,
  'gi',
);

const FRACTION = /\b(\d{1,4})\s*\/\s*(\d{1,4})\b/g;
const INTEGER = /\b(\d{1,4})\b/g;

export function imageSettings(overrides = {}) {
  return { ...NEUTRAL_IMAGES, ...overrides };
}

export function altFindings(doc, settings) {
  const out = [];

  for (const image of doc.query.images()) {
    const line = doc.lineAt(image.sourceStart);
    const alt = String(image.alt || '').trim();
    const words = alt.split(/\s+/).filter(Boolean);
    const isPlaceholder = (settings.placeholderPrefixes || []).some((prefix) =>
      String(image.src || '').startsWith(prefix),
    );

    if (settings.requireAlt && !alt) {
      out.push({
        rule: 'read.alt-missing',
        line,
        message: `image has no alt text: ${image.src}`,
        excerpt: `![](${image.src})`,
        fix: {
          kind: 'rewrite',
          instruction: 'Describe what the picture shows, in a sentence a reader could act on without seeing it.',
        },
      });
      continue;
    }

    if (alt && settings.genericAlt?.test(alt)) {
      out.push({
        rule: 'read.alt-generic',
        line,
        message: `alt text names the file type instead of describing the picture: "${alt}"`,
        excerpt: `![${alt}](${image.src})`,
        fix: {
          kind: 'rewrite',
          instruction: 'Say what is in the picture. "Completion rate falling off past ten hours" beats "chart".',
        },
      });
      continue;
    }

    if (isPlaceholder && words.length < (settings.placeholderMinAltWords ?? 8)) {
      out.push({
        rule: 'read.alt-thin-brief',
        line,
        message: `placeholder image has ${words.length} words of alt text, under the ${settings.placeholderMinAltWords} needed to build from`,
        excerpt: `![${alt}](${image.src})`,
        fix: {
          kind: 'rewrite',
          instruction: 'The alt text is the brief for the picture that has not been made yet. Write enough to draw from.',
        },
      });
      continue;
    }

    if (alt && words.length < (settings.minAltWords ?? 4)) {
      out.push({
        rule: 'read.alt-thin',
        line,
        severity: 'warn',
        message: `alt text is ${words.length} word(s): "${alt}"`,
        fix: {
          kind: 'rewrite',
          instruction: 'Describe the picture rather than labelling it.',
        },
      });
    }
  }

  return out;
}

export function missingFileFindings(doc, settings, config) {
  if (!settings.requireFileExists) return [];
  const out = [];
  const roots = settings.assetRoots?.length
    ? settings.assetRoots.map((entry) => path.resolve(config.root, entry))
    : [config.root, path.join(config.root, 'public'), path.join(config.root, 'static')];

  for (const image of doc.query.images()) {
    const src = String(image.src || '');
    if (!src || /^(https?:|data:|mailto:|#)/i.test(src)) continue;
    const line = doc.lineAt(image.sourceStart);
    const bare = src.split(/[?#]/)[0];

    const candidates = bare.startsWith('/')
      ? roots.map((root) => path.join(root, bare.slice(1)))
      : [path.resolve(path.dirname(doc.absolutePath), bare), ...roots.map((root) => path.join(root, bare))];

    if (candidates.some((candidate) => existsSync(candidate))) continue;

    out.push({
      rule: 'read.image-missing',
      line,
      message: `image is referenced but not on disk: ${src}`,
      excerpt: `![${image.alt || ''}](${src})`,
      fix: {
        kind: 'source',
        instruction: `Add the file, or fix the path. Looked in: ${roots.map((root) => path.relative(config.root, root) || '.').join(', ')}`,
      },
    });
  }

  return out;
}

/**
 * Numbers in prose that disagree with numbers in the picture's own description.
 *
 * This is the most surprising rule in the tool and it catches the mistake every
 * data write-up makes: the chart gets regenerated and the sentence under it does
 * not. It only fires when the prose and the alt text both carry a number and the
 * numbers differ, so it stays quiet on the common case.
 */
export function numberConflictFindings(doc, settings) {
  if (!settings.countConflict) return [];
  const out = [];
  const blocks = doc.query.all();

  for (const image of doc.query.images()) {
    const alt = String(image.alt || '');
    const altNumbers = numbersIn(alt);
    if (!altNumbers.size) continue;

    const index = blocks.findIndex((block) => block === image.block);
    const nearby = [blocks[index - 1], blocks[index], blocks[index + 1]].filter(
      (block) => block && block.readerText,
    );

    for (const block of nearby) {
      for (const match of block.readerText.matchAll(WORD_NUMBER_PATTERN)) {
        const value = WORD_NUMBERS[match[1].toLowerCase()];
        if (value == null || altNumbers.has(value)) continue;
        out.push({
          rule: 'read.image-number-conflict',
          line: doc.lineAt(block.offset),
          message: `prose says "${match[1]} ${match[2]}" but the image description says ${[...altNumbers].join(', ')}`,
          excerpt: `![${alt}](${image.src})`,
          fix: {
            kind: 'decision',
            instruction: 'One of the two is out of date. Open the picture and decide which, then fix that one.',
          },
        });
        break;
      }
    }
  }

  return out;
}

/**
 * Numbers in an image's own description, from digits only.
 *
 * A spelled-out number in alt text is nearly always describing the picture rather
 * than a value in it: "three bars", "two panels", "four quadrants". Counting those
 * made this rule fire on almost every chart caption, so the comparison runs on
 * digits and fractions, which is where a data label actually lives.
 */
function numbersIn(text) {
  const found = new Set();
  for (const match of String(text).matchAll(FRACTION)) {
    found.add(Number(match[1]));
    found.add(Number(match[2]));
  }
  for (const match of String(text).matchAll(INTEGER)) {
    found.add(Number(match[1]));
  }
  return found;
}


export function humanPassFinding(doc, settings) {
  if (!settings.alwaysAdviseHumanPass) return [];
  const count = doc.query.images().length;
  if (!count) return [];
  return [
    {
      rule: 'read.needs-human-pass',
      line: 1,
      message: `${count} image(s) need a look by a person. Text checks cannot read pixels.`,
      fix: {
        kind: 'decision',
        instruction: 'Open each image and confirm it shows what the prose claims it shows.',
      },
    },
  ];
}
