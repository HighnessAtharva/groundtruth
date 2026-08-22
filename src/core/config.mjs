// Config load, normalize, validate.
//
// The config is ESM, loaded with `import()`. That buys comments, computed
// values, imports and real regex literals with no schema parser and no second
// language. Validation is hand-written so the error messages can say what to do
// rather than printing a JSON Schema path.
//
// Nothing here resolves an absolute path from a constant. The harness this came
// from hardcodes `ROOT = r"D:\...\Altimate"` in a file meant to run anywhere,
// which is the single worst portability defect in it. Every path resolves from
// the directory the config file sits in.

import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ConfigError, assertSeverityOverrides } from './rules.mjs';
import { resolveProfiles, BASE_PROFILE } from './profile.mjs';

export const CONFIG_NAMES = ['groundtruth.config.mjs', 'groundtruth.config.js', '.groundtruthrc.mjs'];

export const DEFAULT_VERDICTS = {
  // One hue per verdict, at least 28 degrees apart, chosen so every one stays
  // inside the sRGB gamut at the shared lightness. Lightness and chroma live in
  // the stylesheet, so every verdict carries the same weight and only hue
  // separates them. test/contrast.test.mjs recomputes the spacing and the
  // contrast, so a hue that drifts too close to its neighbour fails the suite.
  //
  // The two blocking verdicts sit close together in the red family on purpose.
  // They are the same kind of problem, and treatment rather than hue is what
  // separates them from the rest: both carry `emphatic`, which is the only thing
  // that draws a background wash.
  VERIFIED: { severity: 'off', label: 'Verified', hue: 152, requires: ['source', 'quote'] },
  EXTERNAL: { severity: 'off', label: 'External source', hue: 248, requires: ['source'] },
  FIGURE: { severity: 'off', label: 'Read off a figure', hue: 312, requires: [] },
  // What `draft` writes. Warns rather than blocks, because it records that nobody
  // has looked yet, which is a different fact from having looked and found nothing.
  TODO: { severity: 'warn', label: 'Not checked yet', hue: 280, requires: [] },
  // A nested array means "at least one of these". A derivation explains an
  // inference at least as well as a note does, and demanding both would push
  // authors to write the same sentence twice.
  INFERRED: { severity: 'warn', label: 'Inferred', hue: 100, requires: [['note', 'derivation']] },
  'DOC-DEFECT': { severity: 'warn', label: 'Source is wrong', hue: 68, requires: ['source', ['note', 'derivation']] },
  UNSOURCED: { severity: 'error', label: 'No source found', hue: 32, requires: [], emphatic: true },
  CONTRADICTED: { severity: 'error', label: 'Contradicted', hue: 10, requires: [['note', 'derivation']], emphatic: true },
};

/**
 * STALE is derived, never authored. The tool computes it when a pin moves and a
 * quote no longer locates, or when a newer snapshot disagrees with the pinned
 * one. A span map that names it is rejected, because a claim cannot know it has
 * gone stale.
 */
export const DERIVED_VERDICTS = {
  STALE: { severity: 'warn', label: 'Source has moved', hue: 196, derived: true },
};

export function findConfig(startDir) {
  let current = path.resolve(startDir);
  for (;;) {
    for (const name of CONFIG_NAMES) {
      const candidate = path.join(current, name);
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export async function loadConfig({ cwd = process.cwd(), configPath = null } = {}) {
  const resolved = configPath ? path.resolve(cwd, configPath) : findConfig(cwd);
  if (!resolved) {
    throw new ConfigError(
      [
        'no groundtruth config found.',
        `  looked for ${CONFIG_NAMES.join(', ')} in ${cwd} and every parent directory.`,
        '  run `groundtruth init` to write one.',
      ].join('\n'),
    );
  }
  if (!existsSync(resolved)) {
    throw new ConfigError(`config not found: ${resolved}`);
  }

  let module;
  try {
    module = await import(`${pathToFileURL(resolved).href}?t=${Date.now()}`);
  } catch (error) {
    throw new ConfigError(`config failed to load: ${resolved}\n  ${error.message}`);
  }

  const raw = module.default ?? module.config ?? module;
  return normalizeConfig(raw, { configPath: resolved });
}

export function normalizeConfig(raw, { configPath }) {
  if (!raw || typeof raw !== 'object') {
    throw new ConfigError(`config must export a default object: ${configPath}`);
  }

  const configDir = path.dirname(configPath);
  const root = path.resolve(configDir, raw.root || '.');

  const problems = [];

  const verdicts = { ...DEFAULT_VERDICTS, ...(raw.verdicts || {}) };
  for (const [name, spec] of Object.entries(verdicts)) {
    if (DERIVED_VERDICTS[name]) {
      problems.push(`verdicts.${name} is derived by the tool and cannot be declared. Remove it.`);
    }
    if (spec && spec.severity && !['off', 'info', 'warn', 'error'].includes(spec.severity)) {
      problems.push(`verdicts.${name}.severity must be off, info, warn or error`);
    }
  }

  const rawProfiles = raw.profiles && Object.keys(raw.profiles).length
    ? raw.profiles
    : { default: { readability: { enabled: true } } };

  let profiles;
  try {
    profiles = resolveProfiles(rawProfiles);
  } catch (error) {
    throw error instanceof ConfigError ? error : new ConfigError(error.message);
  }

  const documents = (raw.documents && raw.documents.length ? raw.documents : [
    { include: ['**/*.md'], exclude: ['node_modules/**', '.groundtruth/**'], profile: Object.keys(profiles)[0] },
  ]).map((route, index) => {
    if (!route.profile) problems.push(`documents[${index}] has no profile`);
    else if (!profiles[route.profile]) {
      problems.push(
        `documents[${index}].profile = '${route.profile}' is not defined. Defined: ${Object.keys(profiles).join(', ')}`,
      );
    }
    return {
      include: toArray(route.include, ['**/*.md']),
      exclude: toArray(route.exclude, []),
      profile: route.profile,
    };
  });

  const defaultProfile = raw.defaultProfile || documents[documents.length - 1]?.profile || Object.keys(profiles)[0];

  const sources = toArray(raw.sources, []);
  for (const [index, source] of sources.entries()) {
    if (!source || typeof source !== 'object') {
      problems.push(`sources[${index}] is not an adapter object`);
      continue;
    }
    for (const method of ['id', 'owns', 'resolve', 'locate', 'permalink', 'describe']) {
      if (source[method] == null) {
        problems.push(`sources[${index}] (${source.id || 'unnamed'}) is missing '${method}'. See docs/adapters.md.`);
      }
    }
  }
  const ids = sources.map((source) => source?.id).filter(Boolean);
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate) problems.push(`two sources share the id '${duplicate}'`);

  if (problems.length) {
    throw new ConfigError(`config error in ${path.relative(process.cwd(), configPath)}\n  ${problems.join('\n  ')}`);
  }

  const config = {
    configPath,
    root,
    reportDir: path.resolve(root, raw.reportDir || '.groundtruth/report'),
    cacheDir: path.resolve(root, raw.cacheDir || '.groundtruth/cache'),
    lockfile: path.resolve(root, raw.lockfile || 'groundtruth.lock.json'),
    extensions: toArray(raw.extensions, ['.md', '.mdx', '.markdown']),
    prune: toArray(raw.prune, []),
    verdicts,
    derivedVerdicts: DERIVED_VERDICTS,
    profiles,
    defaultProfile,
    documents,
    sources,
    severity: raw.severity || {},
    allowAdvisoryGates: Boolean(raw.allowAdvisoryGates),
    rules: toArray(raw.rules, []),
    report: {
      title: raw.report?.title || 'groundtruth',
      theme: raw.report?.theme || 'auto',
      showPassingChecks: raw.report?.showPassingChecks ?? false,
      indexSort: raw.report?.indexSort || 'risk',
      inlineAssets: raw.report?.inlineAssets ?? true,
    },
  };

  return config;
}

/**
 * Run after the rule registry is populated, because the guard needs to know
 * whether each named rule is mechanical.
 */
export function validateSeverity(config) {
  assertSeverityOverrides(config.severity, { allowAdvisoryGates: config.allowAdvisoryGates });
  for (const [name, profile] of Object.entries(config.profiles)) {
    try {
      assertSeverityOverrides(profile.severity, { allowAdvisoryGates: config.allowAdvisoryGates });
    } catch (error) {
      throw new ConfigError(`in profile '${name}':\n${error.message}`);
    }
  }
}

function toArray(value, fallback) {
  if (value == null) return fallback;
  return Array.isArray(value) ? value : [value];
}

export { BASE_PROFILE };
