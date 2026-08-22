// The web adapter. A page that will change under you.
//
// Snapshots are the whole point. A quote from a live page is unverifiable the
// moment the page is edited, so the page is captured to a text file with a header
// and the quote is checked against the capture. The capture is committable, which
// means a reader who clones the repo a year later can still check the quote even
// though the page has moved on.
//
// Drift detection is offline. A refresh writes a new snapshot beside the old one
// rather than over it, and a claim whose quote no longer appears in the newer
// capture flips to STALE with both dates. That is the mechanism the harness this
// came from approximated by hand, by pasting pages into a sources folder.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { sha256, shortHash } from '../core/hash.mjs';
import { locateQuote } from '../core/text.mjs';

const HEADER = '--- groundtruth snapshot ---';

export function web(options = {}) {
  const id = options.id || 'web';
  const maxAgeDays = options.maxAgeDays ?? 180;
  const userAgent = options.userAgent
    || 'groundtruth/0.1 (+https://github.com/HighnessAtharva/groundtruth)';
  let snapshotDir = options.snapshotDir || '.groundtruth/snapshots';

  const dirFor = (url) => path.join(resolveDir(), shortHash(url, 16));

  function resolveDir() {
    return path.isAbsolute(snapshotDir) ? snapshotDir : path.resolve(snapshotDir);
  }

  /** Every capture of one URL, newest first. */
  function captures(url) {
    const dir = dirFor(url);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((name) => name.endsWith('.snapshot'))
      .sort()
      .reverse()
      .map((name) => ({ name, file: path.join(dir, name), date: name.replace('.snapshot', '') }));
  }

  function read(file) {
    const raw = readFileSync(file, 'utf8');
    const at = raw.indexOf('\n\n');
    if (!raw.startsWith(HEADER) || at === -1) {
      return { meta: {}, text: raw, contentHash: sha256(raw) };
    }
    const meta = {};
    for (const line of raw.slice(HEADER.length, at).trim().split('\n')) {
      const colon = line.indexOf(':');
      if (colon > 0) meta[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    }
    const text = raw.slice(at + 2);
    return { meta, text, contentHash: sha256(text) };
  }

  function write(url, text, extra = {}) {
    const dir = dirFor(url);
    mkdirSync(dir, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const file = path.join(dir, `${date}.snapshot`);
    const header = [
      HEADER,
      `url: ${url}`,
      `capturedAt: ${new Date().toISOString()}`,
      `contentHash: ${sha256(text)}`,
      ...Object.entries(extra).map(([key, value]) => `${key}: ${value}`),
    ].join('\n');
    writeFileSync(file, `${header}\n\n${text}`, 'utf8');
    return { file, date };
  }

  return {
    id,
    kind: 'web',

    bind(configDir) {
      snapshotDir = path.resolve(configDir, options.snapshotDir || '.groundtruth/snapshots');
      return this;
    },

    get snapshotDir() {
      return resolveDir();
    },

    owns(ref) {
      // A bare URL routes here when a web source is declared, which removes the
      // special case the source harness needs for one verdict class.
      return ref.sourceId === id || (ref.external && /^https?:/i.test(ref.path));
    },

    async pin() {
      const dir = resolveDir();
      const urls = existsSync(dir) ? readdirSync(dir).length : 0;
      return {
        id,
        kind: 'web',
        at: new Date().toISOString(),
        meta: { snapshotDir: options.snapshotDir || '.groundtruth/snapshots', urls },
      };
    },

    usePin() {
      return this;
    },

    /**
     * Read the newest capture, or take one.
     *
     * A missing capture during a plain `check` is an error that names the command
     * to run, never a silent skip. A quote nobody could verify should not read as
     * a quote that verified.
     */
    async resolve(ref, pin, { offline = false, refresh = false } = {}) {
      const url = ref.sourceId === id ? ref.path : ref.raw.split('#')[0];
      const existing = captures(url);

      if (existing.length && !refresh) {
        const newest = read(existing[0].file);
        const age = ageInDays(newest.meta.capturedAt);
        return {
          text: newest.text,
          contentHash: newest.contentHash,
          url,
          capturedAt: newest.meta.capturedAt || existing[0].date,
          snapshot: existing[0].date,
          stale: age != null && age > maxAgeDays,
          ageDays: age,
        };
      }

      if (offline) {
        return {
          error: `no snapshot of ${url}. Run \`groundtruth resolve\` to capture it.`,
          text: null,
          needsNetwork: true,
        };
      }

      let response;
      try {
        response = await fetch(url, { headers: { 'user-agent': userAgent, accept: 'text/html,text/plain' } });
      } catch (error) {
        return { error: `could not fetch ${url}: ${error.message}`, text: null };
      }
      if (!response.ok) {
        return { error: `${url} answered ${response.status} ${response.statusText}`, text: null };
      }

      const body = await response.text();
      const text = toText(body);
      const written = write(url, text, {
        httpStatus: response.status,
        etag: response.headers.get('etag') || '',
      });

      return {
        text,
        contentHash: sha256(text),
        url,
        capturedAt: new Date().toISOString(),
        snapshot: written.date,
        stale: false,
        ageDays: 0,
      };
    },

    locate(resolved, quote) {
      if (!resolved?.text) return { found: false, line: null, confidence: 'none', method: 'window', unit: 'line' };
      const hit = locateQuote(resolved.text, quote);
      return {
        found: hit.found,
        line: hit.line,
        confidence: hit.confidence,
        method: 'window',
        unit: 'line',
        matched: hit.matched,
      };
    },

    /**
     * The live URL plus a text fragment, so the browser scrolls to the quote when
     * it is still on the page and lands on the page when it is not.
     */
    permalink(ref, located) {
      const url = ref.sourceId === id ? ref.path : ref.raw.split('#')[0];
      if (!located?.found || !located.matched) return url;
      const snippet = located.matched.split(' ').slice(0, 8).join(' ');
      return `${url}#:~:text=${encodeURIComponent(snippet)}`;
    },

    describe(ref, located) {
      const url = ref.sourceId === id ? ref.path : ref.raw.split('#')[0];
      let host = url;
      try {
        host = new URL(url).host;
      } catch {
        // A malformed URL is still worth labelling with what was written.
      }
      return located?.snapshot ? `${host} (captured ${located.snapshot})` : host;
    },

    /** A quote that a newer capture no longer contains. Offline and exact. */
    drift(ref, quote) {
      const url = ref.sourceId === id ? ref.path : ref.raw.split('#')[0];
      const all = captures(url);
      if (all.length < 2) return null;

      const newest = read(all[0].file);
      const pinnedCapture = read(all[all.length - 1].file);
      if (newest.contentHash === pinnedCapture.contentHash) return null;

      const wasAt = locateQuote(pinnedCapture.text, quote);
      const nowAt = locateQuote(newest.text, quote);
      if (!wasAt.found || nowAt.found) return null;

      return {
        stale: true,
        reason: 'the page no longer contains this quote',
        from: all[all.length - 1].date,
        to: all[0].date,
        was: 'present',
        now: 'absent',
      };
    },

    captures,
  };
}

function ageInDays(iso) {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  return Math.floor((Date.now() - parsed) / 86400000);
}

/**
 * HTML to text. Script and style go first, then tags, then entities.
 *
 * Deliberately crude. The job is to produce something a quote can be located
 * inside, not to render the page. A real HTML parser would be a second dependency
 * for no gain here.
 */
export function toText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|blockquote|pre)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (whole, code) => String.fromCodePoint(Number(code)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}
