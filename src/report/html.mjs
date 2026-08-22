// HTML helpers and the page shell.
//
// Every page is self-contained: CSS and JS inlined, data inlined as a JSON script
// tag. No fetch, no CDN, no fonts, no framework. It opens from a file:// URL and
// survives being emailed as an attachment.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

export function attr(name, value) {
  if (value == null || value === false) return '';
  if (value === true) return ` ${name}`;
  return ` ${name}="${escapeHtml(value)}"`;
}

export function attrs(map) {
  return Object.entries(map).map(([name, value]) => attr(name, value)).join('');
}

/**
 * A JSON payload safe to inline. `</script>` inside a string would otherwise
 * close the tag early, and `<!--` would open a comment.
 */
export function jsonScript(id, data) {
  const encoded = JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `<script type="application/json" id="${escapeHtml(id)}">${encoded}</script>`;
}

export function page({ title, css, js, body, data = null, theme = 'auto' }) {
  return `<!doctype html>
<html lang="en"${theme !== 'auto' ? ` data-theme="${escapeHtml(theme)}"` : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<script>
// Applied before first paint so a dark theme does not flash white.
try {
  var stored = localStorage.getItem('gtTheme');
  if (stored === 'light' || stored === 'dark') document.documentElement.dataset.theme = stored;
} catch (e) {}
</script>
<style>${css}</style>
</head>
<body>
${body}
${data ? jsonScript('gt-data', data) : ''}
<script>${js}</script>
</body>
</html>
`;
}
