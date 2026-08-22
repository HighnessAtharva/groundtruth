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
export function discover(config, { only = [] } = {}) {
  const root = config.root;
  const routes = (config.documents || []).map((route) => ({
    include: makeMatcher(route.include || ['**/*.md']),
    exclude: route.exclude && route.exclude.length ? makeMatcher(route.exclude) : null,
    profile: route.profile,
  }));

  const explicit = only.length ? expandOnly(root, only) : null;
  const candidates = explicit ?? walk(root, root, config);
  const out = [];

  for (const relativePath of candidates) {
    const normalized = relativePath.replace(/\\/g, '/');
    const route = routes.find(
      (entry) => entry.include(normalized) && !(entry.exclude && entry.exclude(normalized)),
    );
    if (!route && !explicit) continue;
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

function expandOnly(root, only) {
  const out = [];
  for (const entry of only) {
    const absolute = path.isAbsolute(entry) ? entry : path.resolve(root, entry);
    if (existsSync(absolute)) {
      const stats = statSync(absolute);
      if (stats.isDirectory()) {
        out.push(...walk(absolute, root, null).filter(Boolean));
        continue;
      }
      out.push(path.relative(root, absolute));
      continue;
    }
    // Not a real path, treat it as a glob against the tree.
    const matcher = makeMatcher(entry.replace(/\\/g, '/'));
    out.push(...walk(root, root, null).filter((candidate) => matcher(candidate)));
  }
  return [...new Set(out.map((entry) => entry.replace(/\\/g, '/')))];
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
