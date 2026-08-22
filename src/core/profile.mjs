// Profile resolution.
//
// Every profile implicitly extends `base`, which has all three modules off.
// Turning a module on is always an explicit act, so a config that mentions only
// readability never globs a span map, never compiles an SEO regex, and never
// constructs an adapter.

import { ConfigError } from './rules.mjs';

export const BASE_PROFILE = {
  grounding: {
    enabled: false,
    spanMaps: 'groundtruth/spans/${docId}.mjs',
    onDuplicateMatch: 'error',
    requireQuoteForSource: true,
    requireLocated: false,
  },
  readability: {
    enabled: false,
    preset: null,
    overrides: {},
    waiveQuotations: true,
    waiveCallouts: false,
    images: { enabled: true },
    dialect: { enabled: false, target: 'american' },
  },
  seo: {
    enabled: false,
    preset: null,
    overrides: {},
    keyword: { field: 'primary_keyword', secondaryField: 'secondary_keywords' },
  },
  style: { enabled: false, preset: null, overrides: {} },
  severity: {},
};

const MODULE_KEYS = ['grounding', 'readability', 'seo', 'style'];

export function resolveProfiles(rawProfiles = {}, { resolvePreset = (value) => value } = {}) {
  const resolved = new Map();
  const resolving = new Set();

  const resolve = (name, trail) => {
    if (resolved.has(name)) return resolved.get(name);
    if (resolving.has(name)) {
      throw new ConfigError(`profile extends cycle: ${[...trail, name].join(' -> ')}`);
    }
    const raw = rawProfiles[name];
    if (!raw) {
      throw new ConfigError(
        `profile '${name}' does not exist. Defined profiles: ${Object.keys(rawProfiles).join(', ') || '(none)'}`,
      );
    }
    resolving.add(name);
    const parent = raw.extends ? resolve(raw.extends, [...trail, name]) : BASE_PROFILE;
    const merged = mergeProfile(parent, raw, resolvePreset);
    resolving.delete(name);
    resolved.set(name, merged);
    return merged;
  };

  for (const name of Object.keys(rawProfiles)) resolve(name, []);
  return Object.fromEntries(resolved);
}

function mergeProfile(parent, child, resolvePreset = (value) => value) {
  const out = { severity: { ...parent.severity, ...(child.severity || {}) } };

  for (const key of MODULE_KEYS) {
    const base = parent[key] || {};
    const next = child[key] || {};
    out[key] = {
      ...base,
      ...next,
      // A preset may be named as a string, so a generated config needs no import.
      preset: next.preset !== undefined ? resolvePreset(next.preset) : base.preset,
      // `overrides` merges one level deeper so a project can change a single
      // cost or a single threshold without restating the preset.
      overrides: mergeOneLevel(base.overrides || {}, next.overrides || {}),
    };
    if (key === 'readability') {
      out[key].images = { ...(base.images || {}), ...(next.images || {}) };
      out[key].dialect = { ...(base.dialect || {}), ...(next.dialect || {}) };
    }
    if (key === 'seo') {
      out[key].keyword = { ...(base.keyword || {}), ...(next.keyword || {}) };
    }
  }

  return out;
}

function mergeOneLevel(base, next) {
  const out = { ...base };
  for (const [key, value] of Object.entries(next)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof RegExp)) {
      out[key] = { ...(base[key] || {}), ...value };
      continue;
    }
    out[key] = value;
  }
  return out;
}

/** True when at least one routed profile turns this module on. */
export function moduleInUse(config, module) {
  const used = new Set((config.documents || []).map((route) => route.profile));
  if (config.defaultProfile) used.add(config.defaultProfile);
  for (const name of used) {
    const profile = config.profiles[name];
    if (profile?.[module]?.enabled) return true;
  }
  return false;
}
