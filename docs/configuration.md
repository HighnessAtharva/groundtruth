[← back to the README](../README.md)

# Configuration

## Config reference

`groundtruth.config.mjs`, ESM, loaded with `import()`. That buys comments, computed
values, real regex literals and imports, with no schema language and no second parser.

Every path resolves from the config file's directory. Nothing in this tool ever
resolves an absolute path from a constant.

**A generated config imports nothing.** A built-in source is a plain object with a
`type` and a built-in preset is named as a string, so the config loads before anything
is installed. That matters: `init` runs first, and a config that cannot resolve a
module makes a new user's very first `check` fail with a module error rather than a
finding.

```js
export default {
  sources: [{ type: 'local', id: 'notes', root: './sources' }],
  profiles: { prose: { seo: { enabled: true, preset: 'longform' } } },
  documents: [{ include: ['docs/**/*.md'], profile: 'prose' }],
};
```

The import form is equivalent and is what a custom adapter or a custom preset uses.
Everything below is optional.

```js
import { local, git, web, records } from '@highnessatharva/groundtruth/adapters';
import { longform, shortform, neutral, atharva, ste } from '@highnessatharva/groundtruth/presets';
import { defineRule } from 'groundtruth';

export default {
  // ── Paths. All optional, all relative to this file. ────────────────────────
  root: '.',                            // default: this file's directory
  reportDir: '.groundtruth/report',     // gitignore this
  cacheDir: '.groundtruth/cache',       // gitignore it, or commit it to run offline
  lockfile: 'groundtruth.lock.json',    // commit this
  extensions: ['.md', '.mdx', '.markdown'],
  prune: [],                            // extra directory names to skip when walking

  // ── Sources. Only read when a routed profile enables grounding. ────────────
  sources: [
    local({ id: 'notes', root: './sources', include: ['**/*.md'] }),
    git({ id: 'engine', repo: 'owner/name', ref: 'main', token: process.env.GITHUB_TOKEN }),
    web({ id: 'web', snapshotDir: 'snapshots', maxAgeDays: 180 }),
    records({ id: 'specs', file: 'data/facts.csv', key: 'name' }),
  ],

  // ── Verdicts. The enum is data, not a hardcoded set. ───────────────────────
  // Merged over the defaults, so you only name what you are changing.
  verdicts: {
    INFERRED: { severity: 'off', label: 'Inferred', hue: 100, requires: [['note', 'derivation']] },
  },

  // ── Profiles. Every one extends a base with all modules off, so turning a
  //    module on is always an explicit act. ────────────────────────────────────
  profiles: {
    prose: {
      readability: {
        enabled: true,
        preset: neutral.readability,      // optional, this is the default
        overrides: { wordBudget: 24, costs: { passive: 4 } },
        waiveQuotations: true,            // a blockquote is somebody else's words
        waiveCallouts: false,             // a callout is yours, so it is scored
        images: {
          enabled: true,
          requireAlt: true,
          requireFileExists: true,
          assetRoots: ['public'],         // where a /-rooted src resolves
          minAltWords: 4,
          countConflict: true,
          alwaysAdviseHumanPass: true,
        },
        dialect: { enabled: false, target: 'american' },
      },
    },

    guide: {
      extends: 'prose',                   // shallow merge per module, one level into overrides
      grounding: {
        enabled: true,
        spanMaps: 'groundtruth/spans/${docId}.mjs',   // ${docId} ${dir} ${name} ${slug} ${path}
        onDuplicateMatch: 'error',        // 'error' | 'first'
        requireQuoteForSource: true,
      },
      seo: {
        enabled: true,
        preset: longform,                 // or shortform, or your own object
        overrides: { bodyWordsMin: 900, h2Min: 5 },
        keyword: { field: 'primary_keyword', secondaryField: 'secondary_keywords' },
      },
      style: { enabled: true, preset: atharva.style },
    },
  },

  // ── Document routing. First match wins. ───────────────────────────────────
  documents: [
    { include: ['docs/**/*.md'], profile: 'guide' },
    { include: ['**/*.md'], exclude: ['node_modules/**', 'CHANGELOG.md'], profile: 'prose' },
  ],
  defaultProfile: 'prose',                // used for an explicitly named unrouted file

  // ── Per-rule severity. off | info | warn | error. Only error blocks. ───────
  severity: {
    'read.hard': 'error',
    'seo.body-floor': 'info',
  },
  allowAdvisoryGates: false,              // set true to gate an advisory rule anyway

  // ── Custom rules. Plain objects, no plugin resolution. ────────────────────
  rules: [
    defineRule({
      id: 'style.no-second-person-in-lore',
      module: 'readability',
      mechanical: true,
      defaultSeverity: 'warn',
      explain: 'Lore sections are third person. Second person is for instructions.',
      run({ doc, blocks, finding }) {
        for (const block of blocks.underHeading(/^Lore/i)) {
          if (!/\byou\b/i.test(block.readerText)) continue;
          finding({ line: doc.lineAt(block.offset), message: 'second person in a Lore section' });
        }
      },
    }),
  ],

  report: {
    title: 'groundtruth',
    theme: 'auto',                        // 'auto' | 'light' | 'dark'
    showPassingChecks: false,
    indexSort: 'risk',                    // 'risk' | 'name' | 'seo' | 'audited'
    assets: 'auto',                       // 'auto' | 'inline' | 'linked'
    inlineThreshold: 25,                  // pages above which 'auto' switches to linked
  },
};
```

**A readability-only config is nine lines.** Everything above is optional.

```js
export default {
  profiles: { prose: { readability: { enabled: true } } },
  documents: [{ include: ['docs/**/*.md'], profile: 'prose' }],
};
```

---

## Sources

A source is anything that can be pinned, fetched, and searched for a quote. Four ship.

| Adapter | Addresses a claim by | Offline | Pinnable | Permalink |
|---|---|---|---|---|
| `local` | a file and a quote | always | tree hash | `file://…#L12` |
| `git` | a file at a commit SHA | after one resolve | commit SHA | `https://host/repo/blob/sha/path#L12` |
| `web` | a URL and a captured snapshot | after one resolve | content hash | live URL plus a text fragment |
| `records` | a row and a field, or a JSON path | always | content hash | `file://…#L7` |

Ref grammar, one for all of them:

```
<sourceId> ':' <path> [ '#' <fragment> ]
```

```js
'notes:Bosses/Malenia.md'                                   // local
'notes:Bosses/Malenia.md#L212'                              // with a line hint
'engine:scene/main/viewport.cpp'                            // git, at the pinned SHA
'web:https://example.com/notes'                             // web, via a snapshot
'specs:weapons.csv#name=Rivers%20of%20Blood&field=weight'   // a cell
'specs:catalog.json#path=cards[3].tdp_watts'                // a nested field
'https://example.org/page'                                  // bare URL: EXTERNAL only
```

### The git adapter needs no CLI

Plain HTTPS. `pin()` is one request to the commits API. `resolve()` reads
`raw.githubusercontent.com`, which has no API quota at all. A public repo needs no
token; a token only raises the pin rate limit and is the one thing a private repo
needs. GitHub and GitLab are built in and `rawUrl` is a template for anything else.

It **refuses to read a moving branch tip without a pin**, because a quote verified
against a moving target is not verified.

### Offline is the normal case

`check` never touches the network. It restores pins from the lockfile and verifies
against the content-addressed cache. Only `resolve` fetches anything.

Commit `cacheDir` and a fresh clone verifies every quote with no connection. That is
what `examples/plimit-concurrency` does, and CI proves it on every push.

### Loose comparison, on purpose

A cell holding `24.99` matches a quote of `$24.99`, and `4.9` matches `4.9 hours`.
Currency symbols, thousands separators, a trailing unit and case are all trimmed.
Refusing those is pedantry rather than verification, and it teaches people to stop
using the tool.

Full detail: [`skills/groundtruth-span-maps/reference/adapters.md`](../skills/groundtruth-span-maps/reference/adapters.md).

---

## Span maps

One `.mjs` module per document. `.mjs` rather than JSON or YAML because constants and
reuse are the biggest authoring ergonomic and native `import()` needs no parser.

```js
export const document = 'games/bosses/malenia.md';
export const audited = '2026-08-22';

const WIKI = 'vault:Bosses/Malenia.md';
const SPECS = 'specs:weapons.csv';

export const spans = [
  {
    match: 'Waterfowl Dance opens with a leap and resolves into three flurries',
    source: `${WIKI}#L212`,
    quote: 'The attack consists of three flurries separated by short leaps.',
    verdict: 'VERIFIED',
  },
  {
    match: 'Rivers of Blood weighs ten units, which is light for a katana',
    source: `${SPECS}#name=Rivers of Blood&field=weight`,
    quote: '10.0',
    verdict: 'VERIFIED',
    note: 'The "light for a katana" comparison is mine. Only the number is sourced.',
  },
  {
    match: 'most players find the second phase harder',
    source: null,
    quote: null,
    verdict: 'UNSOURCED',
    note: 'Consensus claim with no measurement. Cite a poll or cut it.',
  },
];
```

Fields: `match` and `verdict` always; `source`, `quote`, `note`, `derivation` and `id`
as each verdict requires.

**Objects, never tuples.** A positional 4-to-6 field tuple is ambiguous at five
fields, so a span meaning to add a note without a quote silently records the note as a
quote. Objects make that unrepresentable.

**Validation refuses, loudly.** An unknown key is an error, not something ignored, so a
typo'd `verdit:` fails instead of rendering as an unstyled span. A tuple gets a
specific message telling you to convert it. Two span maps naming one document names
both files. `STALE` is refused outright.

**`match` is reader text.** The document with markdown removed. Backticks, asterisks
and link syntax are not in it.

```js
match: 'collects with `Promise.all`',   // refused
match: 'collects with Promise.all',     // correct
```

### Authoring without hating it

```bash
npx @highnessatharva/groundtruth draft docs/page.md --write     # scaffold, everything TODO
npx @highnessatharva/groundtruth draft docs/page.md --update    # add new candidates, keep the rest
npx @highnessatharva/groundtruth check --fix-matches            # repair a desynced match
```

`draft` scores every sentence for claim-likelihood: numbers, absolutes, comparisons,
capability verbs, named entities and hedges. Every candidate is verified before it is
written, so a scaffold passes on its first run.

`--update` preserves every hand-written span byte for byte, appends new candidates
under a dated comment, and marks a vanished span with its nearest match rather than
deleting it. Nothing is ever silently dropped.

> Span maps are executable code. That is what buys the constants, and it means a span
> map arriving in a pull request from outside is code review, not data review.

---

## Rules

```bash
npx @highnessatharva/groundtruth explain               # every rule, with what it checks
npx @highnessatharva/groundtruth explain read.series   # one rule, and why it exists
npx @highnessatharva/groundtruth explain CONTRADICTED  # a verdict
```

`explain` exists because the most valuable sentence in the harness this tool came from
was a calibration note buried in a 494-line file. `defineRule` makes the rationale a
required field, so a rule with no reasoning does not register, and `explain` prints it:

```
read.series · readability · mechanical

  Not a finding, a modifier. An enumeration of three or more short verbless items
  counts as one clause break, and its words are excluded from the jargon ratio.

Calibration
  Charging a run-on and an enumeration the same way made the loudest band of the
  scorer point exclusively at correct prose. Measured across 108 documents: 31 of
  31 sentences rated HARD were enumerations, and not one was a defect.

Severity
  off (prints and moves on), from the rule default
```

It also prints **where a severity came from**, which is the question people actually
have when they want to know why something blocks. Four possible answers: the rule
default, a profile, the top-level `severity` map, or `--frozen`.

---

