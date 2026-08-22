// The records adapter. A table of facts, where a claim cites a cell.
//
// This is the adapter that makes the tool not domain-specific. Grounding a docs
// page against a line of prose and grounding a stat block in a game write-up
// against a row of a table are the same operation, and the difference is only how
// you address the thing you quoted.
//
//   specs:weapons.csv#name=Rivers of Blood&field=weight
//   specs:gpus.json#path=cards[3].tdp_watts
//
// Drift detection is offline and exact. The pin carries the file's content hash,
// so a changed table is visible without a network call and the claim resting on a
// changed cell flips to STALE with the old value beside the new one.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { sha256 } from '../core/hash.mjs';
import { collapse, locateQuote } from '../core/text.mjs';
import { parseFragment } from './index.mjs';

export function records(options = {}) {
  const id = options.id || 'records';
  const keyColumn = options.key || null;
  let file = options.file;
  let loaded = null;

  const load = (absolute) => {
    if (loaded && loaded.absolute === absolute) return loaded;
    if (!existsSync(absolute)) {
      loaded = { absolute, error: `no such file: ${path.basename(absolute)}` };
      return loaded;
    }
    const raw = readFileSync(absolute, 'utf8').replace(/\r\n/g, '\n');
    const extension = path.extname(absolute).toLowerCase();
    let rows = null;
    let tree = null;

    try {
      if (extension === '.csv' || extension === '.tsv') {
        rows = parseDelimited(raw, extension === '.tsv' ? '\t' : ',');
      } else if (extension === '.json') {
        tree = JSON.parse(raw);
        if (Array.isArray(tree)) rows = objectsToRows(tree);
      } else {
        tree = parseYaml(raw);
        if (Array.isArray(tree)) rows = objectsToRows(tree);
      }
    } catch (error) {
      loaded = { absolute, error: `could not parse ${path.basename(absolute)}: ${error.message}` };
      return loaded;
    }

    loaded = { absolute, raw, rows, tree, contentHash: sha256(raw) };
    return loaded;
  };

  return {
    id,
    kind: 'records',

    bind(configDir) {
      file = path.resolve(configDir, options.file);
      return this;
    },

    get file() {
      return path.isAbsolute(file) ? file : path.resolve(file);
    },

    owns(ref) {
      return ref.sourceId === id;
    },

    async pin() {
      const data = load(this.file);
      return {
        id,
        kind: 'records',
        at: new Date().toISOString(),
        meta: { file: options.file, contentHash: data.contentHash || null },
      };
    },

    usePin() {
      return this;
    },

    async resolve(ref) {
      // A ref may name a different file than the configured default, so a single
      // source can cover a folder of tables.
      const target = ref.path && ref.path !== options.file
        ? path.resolve(path.dirname(this.file), ref.path)
        : this.file;
      const data = load(target);
      if (data.error) return { error: data.error, text: null };
      return {
        text: data.raw,
        contentHash: data.contentHash,
        url: pathToFileURL(target).href,
        capturedAt: new Date().toISOString(),
        rows: data.rows,
        tree: data.tree,
        absolutePath: target,
      };
    },

    /**
     * Locate a cell and compare it with the quote, in three tiers.
     *
     * Exact string equality, then equality after trimming units, commas and case,
     * then containment. The tiers exist because a table holds "24.99" and an author
     * writes "$24.99", and refusing that is pedantry rather than verification.
     */
    locate(resolved, quote, ref) {
      const miss = { found: false, line: null, confidence: 'none', method: 'cell', unit: 'row' };
      if (!resolved || resolved.error) return miss;

      // A ref with no cell selector is a citation of the file rather than of one
      // cell, so it locates by text like any other source. Without this, quoting
      // a table's header line reported both not-found and stale.
      if (!hasSelector(ref)) {
        const hit = locateQuote(resolved.text, quote);
        return {
          found: hit.found,
          line: hit.line,
          confidence: hit.confidence,
          method: 'line',
          unit: 'line',
          matched: hit.matched,
        };
      }

      const selection = this.select(resolved, ref);
      if (!selection || selection.value == null) return miss;

      const want = String(quote);
      const got = String(selection.value);

      if (got === want) {
        return { found: true, line: selection.line, confidence: 'exact', method: selection.method, unit: 'row', value: got };
      }
      if (soften(got) === soften(want)) {
        return { found: true, line: selection.line, confidence: 'normalized', method: selection.method, unit: 'row', value: got };
      }
      if (soften(got).includes(soften(want)) || soften(want).includes(soften(got))) {
        return { found: true, line: selection.line, confidence: 'partial', method: selection.method, unit: 'row', value: got };
      }
      return { ...miss, value: got, expected: want };
    },

    /** Resolve a fragment to one cell. Exposed so `describe` can label it. */
    select(resolved, ref) {
      const fragment = parseFragment(ref?.fragment);
      if (!resolved) return null;

      if (fragment.path) {
        const value = dig(resolved.tree, fragment.path);
        return value === undefined
          ? null
          : { value, label: fragment.path, line: lineOfPath(resolved.text, fragment.path), method: 'field' };
      }

      const rows = resolved.rows;
      if (!rows || !rows.length) return null;
      const field = fragment.field;
      const selectors = Object.entries(fragment).filter(([name]) => name !== 'field' && name !== '_bare');

      if (fragment._bare && keyColumn) selectors.push([keyColumn, fragment._bare]);

      const index = rows.findIndex((row) =>
        selectors.every(([column, value]) => soften(row[column]) === soften(value)));
      if (index === -1) return null;

      const row = rows[index];
      const column = field || keyColumn;
      if (!column || !(column in row)) return null;

      const rowLabel = keyColumn && row[keyColumn] ? `row "${row[keyColumn]}"` : `row ${index + 1}`;
      return {
        value: row[column],
        label: `${rowLabel} · ${column}`,
        line: index + 2, // the header occupies line 1
        method: 'cell',
      };
    },

    permalink(ref, located) {
      const base = pathToFileURL(this.file).href;
      return located?.line ? `${base}#L${located.line}` : base;
    },

    describe(ref) {
      const fragment = parseFragment(ref.fragment);
      const name = path.basename(ref.path || options.file);
      if (fragment.path) return `${name} · ${fragment.path}`;
      const selectors = Object.entries(fragment)
        .filter(([key]) => key !== 'field' && key !== '_bare')
        .map(([key, value]) => `${key}="${value}"`);
      const bare = fragment._bare ? `"${fragment._bare}"` : '';
      const parts = [name, selectors.join(' ') || bare, fragment.field].filter(Boolean);
      return parts.join(' · ');
    },

    /** A cell that changed since the pin. Offline and exact. */
    drift(ref, quote, pin) {
      // The pin covers one file. A ref naming a different file has no pin to
      // compare against, and comparing it to the wrong hash reported every claim
      // in a second file as stale.
      if (ref?.path && ref.path !== options.file) return null;
      if (!hasSelector(ref)) return null;

      const data = load(this.file);
      if (data.error || !pin?.meta?.contentHash) return null;
      if (data.contentHash === pin.meta.contentHash) return null;

      const selection = this.select(
        { rows: data.rows, tree: data.tree, text: data.raw },
        ref,
      );
      const now = selection?.value;
      if (now == null) {
        return {
          stale: true,
          reason: 'the row this claim cites is gone from the table',
          from: pin.meta.contentHash.slice(0, 12),
          to: data.contentHash.slice(0, 12),
          was: String(quote),
          now: 'absent',
        };
      }
      if (soften(now) === soften(quote)) return null;
      return {
        stale: true,
        reason: 'the cell this claim cites now holds a different value',
        from: pin.meta.contentHash.slice(0, 12),
        to: data.contentHash.slice(0, 12),
        was: String(quote),
        now: String(now),
      };
    },
  };
}

/** True when the fragment addresses one cell or one field rather than the file. */
function hasSelector(ref) {
  if (!ref?.fragment) return false;
  const fragment = parseFragment(ref.fragment);
  return Boolean(fragment.path || fragment.field || fragment._bare);
}

/** Strip currency, thousands separators, units and case before comparing. */
function soften(value) {
  return collapse(String(value ?? ''))
    .toLowerCase()
    .replace(/[$£€¥,]/g, '')
    .replace(/\s*(usd|eur|gbp|%|percent|hours?|hrs?|minutes?|mins?|kg|lbs?|ms|s)\b/g, '')
    .replace(/\.0+$/, '')
    .trim();
}

/** RFC 4180: quoted fields, doubled quotes inside them, newlines inside them. */
export function parseDelimited(raw, delimiter = ',') {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    if (quoted) {
      if (char === '"') {
        if (raw[i + 1] === '"') {
          field += '"';
          i += 1;
          continue;
        }
        quoted = false;
        continue;
      }
      field += char;
      continue;
    }
    if (char === '"' && field === '') {
      quoted = true;
      continue;
    }
    if (char === delimiter) {
      row.push(field);
      field = '';
      continue;
    }
    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += char;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...body] = rows.filter((entry) => entry.some((cell) => cell !== ''));
  if (!header) return [];
  const columns = header.map((name) => name.trim());
  return body.map((cells) =>
    Object.fromEntries(columns.map((name, index) => [name, (cells[index] ?? '').trim()])));
}

function objectsToRows(list) {
  return list.filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry));
}

/** Dotted and bracketed path: `cards[3].tdp_watts`. */
function dig(tree, expression) {
  let node = tree;
  for (const step of String(expression).split(/\.|\[/)) {
    if (node == null) return undefined;
    const key = step.replace(/\]$/, '');
    if (key === '') continue;
    node = node[/^\d+$/.test(key) ? Number(key) : key];
  }
  return node;
}

function lineOfPath(raw, expression) {
  const leaf = String(expression).split(/[.[]/).filter(Boolean).pop()?.replace(/\]$/, '');
  if (!leaf) return null;
  const lines = String(raw).split('\n');
  const at = lines.findIndex((line) => line.includes(`"${leaf}"`) || line.trim().startsWith(`${leaf}:`));
  return at === -1 ? null : at + 1;
}
