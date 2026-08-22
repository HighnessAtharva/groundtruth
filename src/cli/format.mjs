// Terminal output. Color only when a TTY wants it, never when piped.

const useColor =
  process.env.NO_COLOR == null &&
  process.env.TERM !== 'dumb' &&
  Boolean(process.stdout.isTTY);

const CODES = {
  reset: '\u001b[0m',
  dim: '\u001b[2m',
  bold: '\u001b[1m',
  red: '\u001b[31m',
  yellow: '\u001b[33m',
  blue: '\u001b[34m',
  green: '\u001b[32m',
  magenta: '\u001b[35m',
  cyan: '\u001b[36m',
};

export function paint(text, ...styles) {
  if (!useColor || !styles.length) return String(text);
  return `${styles.map((style) => CODES[style] || '').join('')}${text}${CODES.reset}`;
}

export const GLYPH = { error: '✗', warn: '!', info: 'i', off: ' ' };
const STYLE = { error: 'red', warn: 'yellow', info: 'blue', off: 'dim' };

export function severityGlyph(severity) {
  return paint(GLYPH[severity] || '?', STYLE[severity] || 'dim');
}

export function formatFinding(finding, { showFix = true, indent = '  ' } = {}) {
  const location = finding.line ? `${finding.file}:${finding.line}` : finding.file;
  const lines = [
    `${indent}${severityGlyph(finding.severity)} ${paint(finding.rule, 'bold')}  ${paint(location, 'dim')}`,
    `${indent}  ${finding.message}`,
  ];
  if (finding.excerpt) {
    lines.push(`${indent}  ${paint(truncateLine(finding.excerpt), 'dim')}`);
  }
  if (showFix && finding.fix?.instruction) {
    lines.push(`${indent}  ${paint('fix', 'cyan')} ${finding.fix.instruction}`);
  }
  return lines.join('\n');
}

function truncateLine(text, max = 100) {
  const single = String(text).replace(/\s+/g, ' ').trim();
  return single.length > max ? `${single.slice(0, max - 1)}…` : single;
}

/**
 * Fixed-width table. Column widths come from the content, so a corpus of one
 * document does not print a table sized for a hundred.
 */
export function table(headers, rows, { align = [] } = {}) {
  if (!rows.length) return '';
  const widths = headers.map((header, index) =>
    Math.max(String(header).length, ...rows.map((row) => String(row[index] ?? '').length)),
  );

  const line = (cells, style) =>
    cells
      .map((cell, index) => {
        const value = String(cell ?? '');
        const padded = align[index] === 'right'
          ? value.padStart(widths[index])
          : value.padEnd(widths[index]);
        return style ? paint(padded, style) : padded;
      })
      .join('  ')
      .trimEnd();

  return [line(headers, 'dim'), ...rows.map((row) => line(row))].join('\n');
}

export function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function writeOut(text) {
  process.stdout.write(`${text}\n`);
}

/** Everything that is not the machine contract goes to stderr, always. */
export function writeErr(text) {
  process.stderr.write(`${text}\n`);
}
