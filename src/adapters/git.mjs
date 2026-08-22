// The git adapter. Plain HTTPS, no CLI, no git binary, no token for a public repo.
//
// The harness this was extracted from shells out to the GitHub CLI for both
// pinning and every file fetch. That means it needs an authenticated CLI to read
// a public file, burns API quota per file, and base64-decodes for no reason. Node
// 20 has global fetch and raw.githubusercontent.com has no quota at all, so the
// whole dependency disappears.
//
// Pinning is one API request per source per refresh. Unauthenticated GitHub allows
// 60 an hour, which is ample, because a refresh pins a source and not a file. A
// token raises it and is the only thing a private repo needs.

import { sha256 } from '../core/hash.mjs';
import { locateQuote } from '../core/text.mjs';
import { NetworkError } from '../core/rules.mjs';

const HOSTS = {
  'github.com': {
    commit: (repo, ref) => `https://api.github.com/repos/${repo}/commits/${encodeURIComponent(ref)}`,
    sha: (body) => body.sha,
    raw: (repo, sha, filePath) => `https://raw.githubusercontent.com/${repo}/${sha}/${filePath}`,
    blob: (repo, sha, filePath) => `https://github.com/${repo}/blob/${sha}/${filePath}`,
    auth: (token) => ({ Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }),
  },
  'gitlab.com': {
    commit: (repo, ref) =>
      `https://gitlab.com/api/v4/projects/${encodeURIComponent(repo)}/repository/commits/${encodeURIComponent(ref)}`,
    sha: (body) => body.id,
    raw: (repo, sha, filePath) =>
      `https://gitlab.com/${repo}/-/raw/${sha}/${filePath}`,
    blob: (repo, sha, filePath) => `https://gitlab.com/${repo}/-/blob/${sha}/${filePath}`,
    auth: (token) => ({ 'PRIVATE-TOKEN': token }),
  },
};

export function git(options = {}) {
  const id = options.id || 'repo';
  const repo = options.repo;
  const ref = options.ref || 'HEAD';
  const hostName = options.host || 'github.com';
  const host = HOSTS[hostName] || HOSTS['github.com'];
  const token = options.token || null;
  const userAgent = options.userAgent || 'groundtruth (+https://github.com/HighnessAtharva/groundtruth)';

  let pinned = options.sha || null;
  let cache = null;

  const headers = () => ({
    'user-agent': userAgent,
    ...(token ? host.auth(token) : {}),
  });

  return {
    id,
    kind: 'git',

    bind() {
      return this;
    },

    attachCache(store) {
      cache = store;
      return this;
    },

    owns(refObject) {
      return refObject.sourceId === id;
    },

    async pin() {
      if (!repo) throw new NetworkError(`source '${id}' needs a repo, like "owner/name"`);
      const url = host.commit(repo, ref);
      const response = await fetch(url, { headers: headers() });
      if (!response.ok) {
        throw new NetworkError(
          `could not pin ${repo} at ${ref}: ${response.status} ${response.statusText}. ` +
            (response.status === 403 ? 'Rate limited. Set a token, or wait.' : `Tried ${url}`),
        );
      }
      const body = await response.json();
      pinned = host.sha(body);
      return {
        id,
        kind: 'git',
        at: new Date().toISOString(),
        meta: { repo, host: hostName, ref, sha: pinned },
      };
    },

    usePin(pin) {
      if (pin?.meta?.sha) pinned = pin.meta.sha;
      return this;
    },

    /**
     * Fetch a file at the pinned SHA.
     *
     * The cache is consulted first and written after, so this is one network call
     * per file per pin and zero on every later run. With no pin and no cache entry,
     * it says so rather than silently reading the moving branch tip, because a
     * quote verified against a moving target is not verified.
     */
    async resolve(refObject, pin, { offline = false } = {}) {
      const sha = pin?.meta?.sha || pinned;
      if (!sha) {
        return {
          error: `source '${id}' has no pin. Run \`groundtruth resolve --refresh\` to pin ${repo}.`,
          text: null,
        };
      }

      const cached = cache?.get(id, refObject.raw, pin || { meta: { sha } });
      if (cached?.text != null) return cached;

      if (offline) {
        return {
          error: `source '${id}' is not in the cache and the run is offline. Run \`groundtruth resolve\`.`,
          text: null,
          needsNetwork: true,
        };
      }

      const url = host.raw(repo, sha, refObject.path);
      const response = await fetch(url, { headers: headers() });
      if (!response.ok) {
        return {
          error: `${refObject.path} is not in ${repo} at ${sha.slice(0, 12)}: ${response.status}`,
          text: null,
        };
      }
      const text = (await response.text()).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const value = {
        text,
        contentHash: sha256(text),
        url: host.blob(repo, sha, refObject.path),
        capturedAt: new Date().toISOString(),
        sha,
      };
      cache?.set(id, refObject.raw, pin || { meta: { sha } }, value);
      return value;
    },

    locate(resolved, quote, ref) {
      if (!resolved?.text) return { found: false, line: null, confidence: 'none', method: 'line', unit: 'line' };
      const hit = locateQuote(resolved.text, quote);
      return {
        found: hit.found,
        line: hit.line,
        confidence: hit.confidence,
        method: 'line',
        unit: 'line',
        matched: hit.matched,
      };
    },

    permalink(refObject, located, pin) {
      const sha = pin?.meta?.sha || pinned;
      if (!sha) return null;
      const base = host.blob(repo, sha, refObject.path);
      // When the line cannot be confirmed the link degrades to the file, so a
      // reviewer is never sent to a line that might be the wrong one.
      return located?.found && located.line ? `${base}#L${located.line}` : base;
    },

    describe(refObject, located) {
      const short = (pinnedSha) => (pinnedSha ? pinnedSha.slice(0, 7) : '?');
      const line = located?.found && located.line ? `:${located.line}` : '';
      return `${repo}@${short(pinned)} ${refObject.path}${line}`;
    },

    /**
     * A quote that no longer sits where the pin says it does.
     *
     * Needs two pins to compare, so it only reports when a refresh has moved one.
     * That is the code-movement flavour of STALE, and it is a different mechanism
     * from a snapshot drifting under a cached page.
     */
    drift(refObject, quote, pin, previousPin) {
      const before = previousPin?.meta?.sha;
      const after = pin?.meta?.sha;
      if (!before || !after || before === after) return null;

      const oldEntry = cache?.get(id, refObject.raw, previousPin);
      const newEntry = cache?.get(id, refObject.raw, pin);
      if (!oldEntry?.text || !newEntry?.text) return null;

      const wasAt = locateQuote(oldEntry.text, quote);
      const nowAt = locateQuote(newEntry.text, quote);
      if (!wasAt.found) return null;

      if (!nowAt.found) {
        return {
          stale: true,
          reason: 'the quote is gone from the source',
          from: before.slice(0, 7),
          to: after.slice(0, 7),
          was: `line ${wasAt.line}`,
          now: 'absent',
        };
      }
      if (nowAt.line !== wasAt.line) {
        return {
          stale: true,
          reason: 'the quote moved to a different line',
          from: before.slice(0, 7),
          to: after.slice(0, 7),
          was: `line ${wasAt.line}`,
          now: `line ${nowAt.line}`,
        };
      }
      return null;
    },
  };
}
