// Walk the project root and yield the documents the config routes.
//
// Directory pruning happens during the walk, not after it, so a repo with a
// large node_modules or .git does not cost a full traversal before the exclude
// list is applied.

import { readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { makeMatcher } from './glob.mjs';

const ALWAYS_PRUNE = new Set(['.git', 'node_modules', '.groundtruth', '.next', 'dist', 'build', '.cache', '.venv', '__pycache__']);

/**
 * @returns {Array<{ absolutePath: string, relativePath: string, profileName: string }>}
 *   in document order, first-match-wins against `config.documents`.
 */
/**
 * @param {object} options
 * @param {string[]} [options.only]     explicit paths or globs
 * @param {boolean} [options.requireRoute]
 *   When true, an explicit path that matches no route is dropped instead of run
 *   under the default profile. `--changed` sets this, because a machine-generated
 *   file list contains everything the branch touched and most of it is not a
 *   document. Without it, a changed `result.json` was checked as prose.
 */
export function discover(config, { only = [], requireRoute = false } = {}) {
  const root = config.root;
  const routes = (config.documents || []).map((route) => ({
    include: makeMatcher(route.include || ['**/*.md']),
    exclude: route.exclude && route.exclude.length ? makeMatcher(route.exclude) : null,
    profile: route.profile,
  }));

  const explicit = only.length ? expandOnly(root, only, config) : null;
  const candidates = explicit ?? walk(root, root, config);
  const out = [];

  for (const relativePath of candidates) {
    const normalized = relativePath.replace(/\\/g, '/');
    const route = routes.find(
      (entry) => entry.include(normalized) && !(entry.exclude && entry.exclude(normalized)),
    );
    if (!route && (!explicit || requireRoute)) continue;
    out.push({
      absolutePath: path.join(root, relativePath),
      relativePath: normalized,
      profileName: route ? route.profile : config.defaultProfile,
      routed: Boolean(route),
    });
  }

  out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return out;
}

function expandOnly(root, only, config) {
  const extensions = new Set(config?.extensions || ['.md', '.mdx', '.markdown']);
  const out = [];

  for (const entry of only) {
    const absolute = path.isAbsolute(entry) ? entry : path.resolve(root, entry);
    if (existsSync(absolute)) {
      const stats = statSync(absolute);
      if (stats.isDirectory()) {
        out.push(...walk(absolute, root, config).filter(Boolean));
        continue;
      }
      out.push(path.relative(root, absolute));
      continue;
    }
    // Not a real path, so treat it as a glob against the tree.
    const matcher = makeMatcher(entry.replace(/\\/g, '/'));
    out.push(...walk(root, root, config).filter((candidate) => matcher(candidate)));
  }

  // An explicit path still has to be a document. Naming a PNG or a lockfile is a
  // mistake worth ignoring quietly rather than parsing as prose.
  return [...new Set(out.map((entry) => entry.replace(/\\/g, '/')))].filter((entry) =>
    extensions.has(path.extname(entry).toLowerCase()));
}

function walk(dir, root, config) {
  const extensions = new Set(config?.extensions || ['.md', '.mdx', '.markdown']);
  const prune = new Set([...ALWAYS_PRUNE, ...(config?.prune || [])]);
  const out = [];

  const visit = (current) => {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.isDirectory()) {
        if (!prune.has(entry.name)) continue;
        continue;
      }
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (prune.has(entry.name)) continue;
        visit(full);
        continue;
      }
      if (!extensions.has(path.extname(entry.name).toLowerCase())) continue;
      out.push(path.relative(root, full).replace(/\\/g, '/'));
    }
  };

  visit(dir);
  return out;
}
