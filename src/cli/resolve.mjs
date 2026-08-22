// `groundtruth resolve` — the only command that touches the network.
//
// It fills the cache and, with `--refresh`, moves pins. Everything else in the
// tool works offline against what this leaves behind, which is what makes a
// committed cache enough for a fresh clone to verify every quote with no
// connection at all.

import path from 'node:path';
import { loadConfig } from '../core/config.mjs';
import { buildEngine } from '../core/engine.mjs';
import { Cache } from '../core/cache.mjs';
import { readLockfile, writeLockfile, comparePins } from '../core/lockfile.mjs';
import { AdapterRegistry, parseRef } from '../adapters/index.mjs';
import { loadSpanMaps } from '../modules/grounding/spanmap.mjs';
import { paint, writeOut, writeErr, pluralize, table } from './format.mjs';
import { NetworkError } from '../core/rules.mjs';

export async function runResolve(argv) {
  const { flags, positionals } = argv;
  const config = await loadConfig({ cwd: flags.cwd || process.cwd(), configPath: flags.config });

  if (!config.sources.length) {
    writeOut('');
    writeOut('no sources declared, so there is nothing to resolve.');
    writeOut('');
    return 0;
  }

  const offline = Boolean(flags.offline);
  const refresh = Boolean(flags.refresh);
  const refreshOnly = positionals.length ? positionals : null;

  const cache = new Cache(config.cacheDir);
  const registry = new AdapterRegistry(config.sources, {
    configDir: path.dirname(config.configPath),
    cache,
  });

  const lock = readLockfile(config.lockfile);

  let pins;
  let previous;
  try {
    ({ pins, previous } = await registry.pinAll({
      refresh: refresh && !offline,
      lock: lock.sources,
      only: refreshOnly,
    }));
  } catch (error) {
    if (offline) throw new NetworkError(`${error.message}\n  the run is offline, so no pin could move.`);
    throw error;
  }

  // Walk every span so every quote gets a cache entry, which is what makes the
  // next `check` work with no network.
  const { pipeline } = await buildEngine(config, { modules: ['grounding'] });
  const { outputs } = await pipeline.run({ only: [], config }, { upTo: 'parse' });
  const docs = outputs.get('parse');
  const maps = await loadSpanMaps(docs, config);

  const rows = [];
  const drifted = [];
  let anchored = 0;
  let fileLevel = 0;
  let unreachable = 0;
  let needNetwork = 0;

  for (const [, map] of maps) {
    if (map.missing) continue;
    for (const span of map.spans) {
      if (!span.source || !span.quote) continue;
      const ref = parseRef(span.source);
      const adapter = registry.forRef(ref);
      if (!adapter) continue;

      const resolved = await adapter.resolve(ref, pins[adapter.id], { offline, refresh: Boolean(flags.snapshot) });
      if (resolved?.needsNetwork) {
        needNetwork += 1;
        continue;
      }
      if (resolved?.error || !resolved?.text) {
        unreachable += 1;
        writeErr(`  ${paint('unreachable', 'red')} ${span.source}: ${resolved?.error || 'no content'}`);
        continue;
      }

      const located = adapter.locate(resolved, span.quote, ref);
      if (located.found && located.line != null) anchored += 1;
      else fileLevel += 1;

      const drift = adapter.drift
        ? adapter.drift(ref, span.quote, pins[adapter.id], previous?.[adapter.id])
        : null;
      if (drift?.stale) {
        drifted.push({ document: map.doc.path, source: span.source, ...drift });
      }
    }
  }

  for (const [id, pin] of Object.entries(pins)) {
    const adapter = registry.get(id);
    rows.push([
      previous?.[id] ? 'repinned' : 'pinned',
      id,
      adapter?.kind || '?',
      describePin(pin),
    ]);
  }

  writeOut('');
  writeOut(table(['', 'SOURCE', 'KIND', 'PIN'], rows));
  writeOut('');
  writeOut(`  line-anchored permalinks : ${anchored}`);
  writeOut(`  file-level only          : ${fileLevel}`);
  if (needNetwork) writeOut(`  ${paint(`need a network run     : ${needNetwork}`, 'yellow')}`);
  if (unreachable) writeOut(`  ${paint(`unreachable            : ${unreachable}`, 'red')}`);
  writeOut(`  source drifted           : ${drifted.length}`);

  // Always print the drift list. Piping this summary to /dev/null is how a corpus
  // silently rots, so it is the one thing the command insists on saying.
  for (const entry of drifted) {
    writeOut(`    ${paint(entry.document, 'bold')}  ${entry.source}`);
    writeOut(`      ${entry.reason}: ${entry.was} -> ${entry.now}  (${entry.from} to ${entry.to})`);
  }

  const stats = cache.stats();
  writeOut('');
  writeOut(paint(`cache: ${stats.writes} written, ${stats.hits} reused, ${cache.size()} entries in ${path.relative(process.cwd(), config.cacheDir) || config.cacheDir}`, 'dim'));

  if (refresh && !offline) {
    const comparison = comparePins(lock.sources, pins);
    writeLockfile(config.lockfile, pins);
    writeOut(paint(`lockfile: ${path.basename(config.lockfile)} updated, ${pluralize(comparison.moved.length, 'pin')} moved`, 'cyan'));
    for (const moved of comparison.moved) {
      writeOut(`  ${moved.id}: ${moved.from.slice(0, 12)} -> ${moved.to.slice(0, 12)}`);
    }
  }
  writeOut('');

  if (offline && (needNetwork || unreachable)) return 5;
  return 0;
}

function describePin(pin) {
  const meta = pin?.meta || {};
  if (meta.sha) return `${meta.repo || ''} ${meta.sha.slice(0, 12)}`.trim();
  if (meta.contentHash) return `sha256:${meta.contentHash.slice(0, 12)}`;
  if (meta.treeHash) return `${meta.files ?? '?'} files, tree ${meta.treeHash.slice(0, 12)}`;
  if (meta.urls != null) return `${meta.urls} url(s) captured`;
  return 'unpinned';
}
