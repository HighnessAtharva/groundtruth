// The adapter registry and the ref grammar.
//
// This replaces a hardcoded prefix-to-repo map plus a resolver that shells out to
// a CLI and hardcodes an absolute Windows path. The generalization is that a
// source is anything that can be pinned, fetched, and searched for a quote.
//
// Ref grammar, one for every adapter:
//
//   <sourceId> ':' <path> [ '#' <fragment> ]
//
// A bare https:// ref with no sourceId prefix routes to a declared `web` adapter
// if there is one, and otherwise is link-only: the verdict must be EXTERNAL and
// no verification is attempted. That removes the special case the source harness
// needs, where one verdict class is handled by a different code path.

import { ConfigError } from '../core/rules.mjs';

export const ADAPTER_METHODS = ['id', 'owns', 'resolve', 'locate', 'permalink', 'describe'];

const ABSOLUTE_URL = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * @typedef {object} Ref
 * @property {string|null} sourceId
 * @property {string} path
 * @property {string|null} fragment
 * @property {string} raw
 * @property {boolean} external   true when this is a bare URL with no source
 */

export function parseRef(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;

  if (ABSOLUTE_URL.test(text)) {
    const hash = text.indexOf('#');
    return {
      sourceId: null,
      path: hash === -1 ? text : text.slice(0, hash),
      fragment: hash === -1 ? null : text.slice(hash + 1),
      raw: text,
      external: true,
    };
  }

  const colon = text.indexOf(':');
  if (colon <= 0) {
    return { sourceId: null, path: text, fragment: null, raw: text, external: false };
  }

  const body = text.slice(colon + 1);
  const hash = body.indexOf('#');
  return {
    sourceId: text.slice(0, colon),
    path: hash === -1 ? body : body.slice(0, hash),
    fragment: hash === -1 ? null : body.slice(hash + 1),
    raw: text,
    external: false,
  };
}

/** Parse a `#key=value&key=value` fragment into a plain object. */
export function parseFragment(fragment) {
  if (!fragment) return {};
  const out = {};
  // A bare `#L212` line anchor, which every adapter understands.
  const line = /^L(\d+)(?:-L?(\d+))?$/.exec(fragment);
  if (line) {
    out.line = Number(line[1]);
    if (line[2]) out.endLine = Number(line[2]);
    return out;
  }
  for (const pair of fragment.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq === -1) {
      out._bare = decodeURIComponent(pair);
      continue;
    }
    out[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1));
  }
  return out;
}

export class AdapterRegistry {
  constructor(sources = []) {
    this.adapters = new Map();
    for (const source of sources) {
      validateAdapter(source);
      this.adapters.set(source.id, source);
    }
  }

  get(id) {
    return this.adapters.get(id) || null;
  }

  get ids() {
    return [...this.adapters.keys()];
  }

  /**
   * Find the adapter that owns a ref, or null when nothing does.
   *
   * A bare URL prefers a declared `web` adapter. Without one it stays link-only,
   * which is a legitimate state rather than an error.
   */
  forRef(ref) {
    if (!ref) return null;
    if (ref.sourceId) {
      const named = this.adapters.get(ref.sourceId);
      if (named) return named;
      return null;
    }
    for (const adapter of this.adapters.values()) {
      if (adapter.owns(ref)) return adapter;
    }
    return null;
  }

  async pinAll({ refresh = false, lock = {} } = {}) {
    const pins = {};
    for (const adapter of this.adapters.values()) {
      if (!refresh && lock[adapter.id]) {
        adapter.usePin?.(lock[adapter.id]);
        pins[adapter.id] = lock[adapter.id];
        continue;
      }
      pins[adapter.id] = adapter.pin ? await adapter.pin() : { id: adapter.id, kind: adapter.kind || 'unknown' };
    }
    return pins;
  }
}

export function validateAdapter(source) {
  if (!source || typeof source !== 'object') {
    throw new ConfigError('a source must be an adapter object. See docs/adapters.md.');
  }
  const missing = ADAPTER_METHODS.filter((method) => source[method] == null);
  if (missing.length) {
    throw new ConfigError(
      `source '${source.id || 'unnamed'}' is missing ${missing.join(', ')}. ` +
        'An adapter needs id, owns, resolve, locate, permalink and describe. See docs/adapters.md.',
    );
  }
  return source;
}

export { local } from './local.mjs';
