// The page script. One string, inlined, no framework.
//
// The card positioner carries three lessons ported from the source harness,
// because each of them cost a debugging round.
//
// 1. Anchor to `getClientRects()[0]`, not `getBoundingClientRect()`. A sentence
//    that wraps has a bounding box whose left edge is the leftmost line's, which
//    put the horizontal clamp up to 500px away from the text being hovered.
// 2. The card never measures itself. Width and max height are fixed in CSS, so
//    the footprint is known. An earlier attempt measured by toggling display and
//    visibility, and left cards stuck hidden.
// 3. Placement flips above the anchor only when below cannot fit and above has
//    more room, so a mark near the bottom of the viewport still shows its card.
//
// Added over the original: a mark is focusable and opens on focus, a click pins
// the card, and Escape closes it. Keyboard reviewers exist.

export const JS = `
(function () {
  var dataNode = document.getElementById('gt-data');
  var data = dataNode ? JSON.parse(dataNode.textContent) : {};
  var card = document.getElementById('gt-card');
  var pinned = null;
  var current = null;

  // ── Theme ──────────────────────────────────────────────────────────────
  var toggle = document.getElementById('gt-theme');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var root = document.documentElement;
      var now = root.dataset.theme
        || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      var next = now === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem('gtTheme', next); } catch (e) {}
      toggle.textContent = next === 'dark' ? 'light' : 'dark';
    });
  }

  if (!card) return;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function spanCard(span) {
    var verdict = (data.verdicts && data.verdicts[span.verdict]) || {};
    var out = '';
    out += '<div class="gt-card-verdict" style="--h:' + (verdict.hue == null ? 210 : verdict.hue) + '">'
      + esc(verdict.label || span.verdict) + '</div>';
    if (span.sourceLabel) {
      out += '<div class="gt-card-row"><div class="gt-card-label">Source</div>'
        + '<div class="gt-card-src">'
        + (span.permalink
            ? '<a href="' + esc(span.permalink) + '" target="_blank" rel="noopener noreferrer">' + esc(span.sourceLabel) + '</a>'
            : esc(span.sourceLabel))
        + '</div></div>';
    }
    if (span.quote) {
      out += '<div class="gt-card-row"><div class="gt-card-label">Quote</div>'
        + '<div class="gt-card-quote">' + esc(span.quote) + '</div></div>';
    }
    if (span.lineUnconfirmed) {
      out += '<div class="gt-card-warn">line unconfirmed at this pin, so the link points at the file</div>';
    }
    if (span.note) {
      out += '<div class="gt-card-row"><div class="gt-card-label">Note</div>'
        + '<div class="gt-card-note">' + esc(span.note) + '</div></div>';
    }
    if (span.derivation) {
      out += '<div class="gt-card-row"><div class="gt-card-label">Derivation</div>'
        + '<div class="gt-card-note">' + esc(span.derivation) + '</div></div>';
    }
    out += '<div class="gt-card-hint">click to pin, Escape to close</div>';
    return out;
  }

  function readCard(entry) {
    var out = '';
    out += '<div class="gt-card-verdict" style="--h:' + (entry.band === 'hard' ? 4 : 38) + '">'
      + esc(entry.label) + ' &middot; ' + entry.score + '</div>';
    out += '<div class="gt-card-row"><div class="gt-card-label">' + entry.words + ' words</div><ul>';
    for (var i = 0; i < entry.reasons.length; i += 1) out += '<li>' + esc(entry.reasons[i]) + '</li>';
    out += '</ul></div>';
    out += '<div class="gt-card-row gt-card-fix">' + esc(entry.fix) + '</div>';
    out += '<div class="gt-card-hint">click to pin, Escape to close</div>';
    return out;
  }

  function place(target) {
    // getClientRects()[0], never getBoundingClientRect(). A wrapped sentence's
    // bounding box starts at the leftmost line, which is not where the reader
    // is looking.
    var rects = target.getClientRects();
    var rect = rects.length ? rects[0] : target.getBoundingClientRect();

    // The card never measures itself. CSS fixes the footprint, so this is known.
    var width = Math.min(380, window.innerWidth - 24);
    var height = card.offsetHeight || 200;
    var gap = 10;

    var below = window.innerHeight - rect.bottom;
    var above = rect.top;
    var top = below >= height + gap || below >= above
      ? rect.bottom + gap
      : Math.max(12, rect.top - height - gap);

    var left = Math.min(
      Math.max(12, rect.left),
      Math.max(12, window.innerWidth - width - 12)
    );

    card.style.width = width + 'px';
    card.style.left = left + 'px';
    card.style.top = Math.min(top, window.innerHeight - 40) + 'px';
  }

  function open(target, html) {
    card.innerHTML = html;
    card.dataset.open = '1';
    current = target;
    place(target);
  }

  function close() {
    card.dataset.open = '0';
    card.innerHTML = '';
    current = null;
    pinned = null;
  }

  function contentFor(target) {
    var spanId = target.getAttribute('data-span');
    if (spanId != null && data.spans && data.spans[spanId]) return spanCard(data.spans[spanId]);
    var readId = target.getAttribute('data-read');
    if (readId != null && data.sentences && data.sentences[readId]) return readCard(data.sentences[readId]);
    return null;
  }

  function bind(target) {
    var show = function () {
      if (pinned && pinned !== target) return;
      var html = contentFor(target);
      if (html) open(target, html);
    };
    target.addEventListener('mouseenter', show);
    target.addEventListener('focus', show);
    target.addEventListener('mouseleave', function () {
      if (pinned === target) return;
      close();
    });
    target.addEventListener('click', function (event) {
      event.stopPropagation();
      if (pinned === target) { close(); return; }
      pinned = target;
      var html = contentFor(target);
      if (html) open(target, html);
    });
  }

  var targets = document.querySelectorAll('[data-span], [data-read]');
  for (var i = 0; i < targets.length; i += 1) bind(targets[i]);

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') close();
  });
  document.addEventListener('click', function () { if (pinned) close(); });
  card.addEventListener('click', function (event) { event.stopPropagation(); });

  // Re-place whatever is open, coalesced onto one task tick.
  var queued = false;
  function reflow() {
    if (queued || !current) return;
    queued = true;
    setTimeout(function () {
      queued = false;
      if (current && card.dataset.open === '1') place(current);
    }, 0);
  }
  window.addEventListener('scroll', reflow, { passive: true });
  window.addEventListener('resize', reflow);

  // ── Index table sorting ────────────────────────────────────────────────
  var list = document.querySelector('table.gt-list');
  if (list) {
    var headers = list.querySelectorAll('th[data-key]');
    for (var h = 0; h < headers.length; h += 1) {
      (function (header) {
        header.addEventListener('click', function () {
          var key = header.getAttribute('data-key');
          var numeric = header.getAttribute('data-numeric') === '1';
          var descending = header.getAttribute('aria-sort') !== 'descending';
          for (var k = 0; k < headers.length; k += 1) headers[k].removeAttribute('aria-sort');
          header.setAttribute('aria-sort', descending ? 'descending' : 'ascending');

          var body = list.tBodies[0];
          var rows = Array.prototype.slice.call(body.rows);
          rows.sort(function (a, b) {
            var left = a.getAttribute('data-' + key) || '';
            var right = b.getAttribute('data-' + key) || '';
            var result = numeric ? Number(left) - Number(right) : String(left).localeCompare(String(right));
            return descending ? -result : result;
          });
          for (var r = 0; r < rows.length; r += 1) body.appendChild(rows[r]);
        });
      })(headers[h]);
    }
  }
})();
`;

export default JS;
