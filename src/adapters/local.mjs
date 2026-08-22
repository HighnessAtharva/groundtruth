// The local filesystem adapter.
//
// A folder of files you can quote from: an offline docs export, a wiki dump, a
// notes vault, a folder of fact sheets you wrote yourself while playing a game.
// That last one is the honest answer to "where do I get sources for a piece about
// a thing that has no API", and it is how most real grounding folders get built.
//
// `resolve` reads a file. `locate` is pure and offline. The pin is a content hash
// over the matched files, so a changed source folder shows up in the diff of the
// lockfile rather than silently changing what a claim rests on.

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha256 } from '../core/hash.mjs';
import { locateQuote } from '../core/text.mjs';
import { makeMatcher } from '../core/glob.mjs';
import { parseFragment } from './index.mjs';

export function local(options = {}) {
  const id = options.id || 'local';
  const include = options.include || ['**/*.md', '**/*.txt', '**/*.markdown'];
  const matcher = makeMatcher(include);
  let root = options.root || '.';
  let projectRoot = null;
  const cache = new Map();

  return {
    id,
    kind: 'local',

    /** Resolve `root` against the config directory, never against the cwd. */
    bind(configDir) {
      root = path.resolve(configDir, options.root || '.');
      // The config directory is the project root, and a permalink relative to it is
      // the only form the report can resolve from its own directory.
      projectRoot = configDir;
      return this;
    },

    get root() {
      return path.isAbsolute(root) ? root : path.resolve(root);
    },

    owns(ref) {
      return ref.sourceId === id;
    },

    async pin() {
      const files = walk(this.root, this.root).filter((entry) => matcher(entry)).sort();
      const digest = sha256(
        files
          .map((entry) => `${entry}${sha256(readFileSync(path.join(this.root, entry)))}`)
          .join('\n'),
      );
      return {
        id,
        kind: 'local',
        at: new Date().toISOString(),
        meta: { root: relativeRoot(this.root), files: files.length, treeHash: digest },
      };
    },

    usePin() {
      // A local folder needs no restore step. The pin exists so a changed source
      // is visible in the lockfile diff, not to reconstruct anything.
    },

    async resolve(ref) {
      const file = path.resolve(this.root, ref.path);
      if (!withinRoot(file, this.root)) {
        return { error: `'${ref.path}' resolves outside the source root`, text: null };
      }
      if (cache.has(file)) return cache.get(file);
      if (!existsSync(file) || !statSync(file).isFile()) {
        const result = { error: `no such file in source '${id}': ${ref.path}`, text: null };
        cache.set(file, result);
        return result;
      }
      const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const result = {
        text,
        contentHash: sha256(text),
        url: pathToFileURL(file).href,
        capturedAt: statSync(file).mtime.toISOString(),
        absolutePath: file,
      };
      cache.set(file, result);
      return result;
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

    /**
     * A project-relative path, not a file:// URL.
     *
     * An absolute file:// URL only works on the machine that produced it, so a
     * committed report carried dead links for everybody else and leaked the
     * author's directory layout. The report resolves this against its own location.
     */
    permalink(ref, located, pin) {
      const file = path.resolve(this.root, ref.path);
      const hinted = parseFragment(ref.fragment).line;
      const line = located?.line ?? hinted ?? null;
      const base = projectRelative(file, projectRoot || this.root);
      return line ? `${base}#L${line}` : base;
    },

    describe(ref, located) {
      const line = located?.line ?? parseFragment(ref.fragment).line;
      return line ? `${ref.path}:${line}` : ref.path;
    },
  };
}

function walk(dir, root) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full, root));
      continue;
    }
    out.push(path.relative(root, full).replace(/\\/g, '/'));
  }
  return out;
}

/**
 * A path relative to `from`, with forward slashes.
 *
 * Falls back to an absolute file:// URL only when the file sits outside the
 * project, where there is nothing to be relative to.
 */
export function projectRelative(absolute, from) {
  const base = from || process.cwd();
  const relative = path.relative(base, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return pathToFileURL(absolute).href;
  }
  return relative.split(path.sep).join('/');
}

function withinRoot(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function relativeRoot(absolute) {
  const relative = path.relative(process.cwd(), absolute);
  return relative.startsWith('..') ? absolute : relative || '.';
}
