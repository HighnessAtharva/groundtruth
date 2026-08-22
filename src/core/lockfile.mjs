// The lockfile.
//
// One pin per source, committed. `check` restores pins from it and never touches
// the network, so a routine run verifies every quote at the revision the lockfile
// names rather than at whatever the source says today.
//
// `resolve --refresh` is the only thing that moves a pin, and moving one shows up
// as a diff a reviewer can see. That is the difference between "the sources
// changed" and "the sources changed and nobody noticed".

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pinValue } from './cache.mjs';

export const LOCK_VERSION = 1;

export function readLockfile(file) {
  if (!existsSync(file)) return { version: LOCK_VERSION, sources: {} };
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return { version: data.version ?? LOCK_VERSION, sources: data.sources || {} };
  } catch (error) {
    throw new Error(`${path.basename(file)} is not valid JSON: ${error.message}`);
  }
}

export function writeLockfile(file, pins) {
  const sources = {};
  for (const id of Object.keys(pins).sort()) {
    sources[id] = pins[id];
  }
  const body = { version: LOCK_VERSION, updated: new Date().toISOString(), sources };
  writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  return body;
}

/**
 * What would change if the pins moved.
 *
 * `check --frozen` uses this to fail rather than proceed, which is the CI mode: a
 * build that would have quietly verified against a newer source stops instead.
 */
export function comparePins(locked, current) {
  const moved = [];
  const added = [];
  const removed = [];

  for (const [id, pin] of Object.entries(current)) {
    const before = locked[id];
    if (!before) {
      added.push({ id, to: pinValue(pin) });
      continue;
    }
    if (pinValue(before) !== pinValue(pin)) {
      moved.push({ id, from: pinValue(before), to: pinValue(pin) });
    }
  }
  for (const id of Object.keys(locked)) {
    if (!current[id]) removed.push({ id, from: pinValue(locked[id]) });
  }

  return { moved, added, removed, changed: moved.length + added.length + removed.length > 0 };
}

/** How old the pin set is, so a report can say how stale it is. */
export function pinAge(lock) {
  const dates = Object.values(lock.sources || {})
    .map((pin) => pin?.at)
    .filter(Boolean)
    .map((value) => Date.parse(value))
    .filter((value) => !Number.isNaN(value));
  if (!dates.length) return null;
  const oldest = Math.min(...dates);
  return { oldest: new Date(oldest).toISOString(), days: Math.floor((Date.now() - oldest) / 86400000) };
}
