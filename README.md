# groundtruth

**Bind every factual claim in a document to a verbatim quote in a real source, then fail the build when the binding breaks.**

[![tests](https://img.shields.io/badge/tests-200-brightgreen)](test/)
[![dependencies](https://img.shields.io/badge/runtime%20deps-1-brightgreen)](package.json)
[![node](https://img.shields.io/badge/node-%E2%89%A520.11-blue)](.nvmrc)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

- [The 60-second version](#the-60-second-version)
- [See it working](#see-it-working)
- [Install and first run](#install-and-first-run)
- [A worked example](#a-worked-example)
- [The mental model](#the-mental-model)
- [What each module checks](#what-each-module-checks)
- [Config reference](#config-reference)
- [Sources](#sources)
- [Span maps](#span-maps)
- [Rules](#rules)
- [CLI reference](#cli-reference)
- [The report](#the-report)
- [Agents](#agents)
- [CI](#ci)
- [Extending it](#extending-it)
- [Presets](#presets)
- [Prior art, and why this exists](#prior-art-and-why-this-exists)
- [Limits](#limits)
- [FAQ](#faq)
- [Performance](#performance)
- [Stability](#stability)

---

## The 60-second version

A number lands in paragraph nine of an article. Six months later the source it came
from changed, or the sentence around it got edited, and nobody rechecked. Nothing in
a normal toolchain can see that. A spell checker cannot. A linter cannot. A person
rereading their own work cannot reliably, because the sentence still reads fine.

groundtruth makes the link explicit and machine-checkable. You write, next to each
claim, the source it rests on and the exact words in that source that support it. The
tool refuses to record a claim it cannot find in your document, and refuses a quote it
cannot find in the source. Then it fails your build when either side moves.

Two more modules ride along, because the same parse tree makes them nearly free: a
sentence-level readability scorer with image checks, and an SEO plus AEO gate. Each of
the three is independently optional.

**The sentence a skeptic needs:** this checks that a claim is *anchored*, not that a
claim is *true*. A wrong source that you quoted correctly still passes. What you get is
the ability to see, in one page, every sentence in your document that rests on nothing.

---

## See it working

Three examples, all offline, all failing on the first run on purpose. A green example
teaches nothing.

| Open | What it shows | Modules |
|---|---|---|
| [`examples/resident-evil`](examples/resident-evil) | The smallest setup. Sources you wrote yourself, one module | grounding |
| [`examples/steam-completion-rates`](examples/steam-completion-rates) | A table addressed cell by cell, a cached page, and a claim going stale | grounding, readability |
| [`examples/plimit-concurrency`](examples/plimit-concurrency) | Code quoted at a pinned commit with permalinks, and the full SEO gate | all three |

Each ships `expected/report.html`, so you can open the output in a browser straight
from the clone without installing anything.

```bash
git clone https://github.com/HighnessAtharva/groundtruth
cd groundtruth && npm install
npm run test:examples
```

```
ok   plimit-concurrency         6 blocking, 20 advisory, 26 findings
ok   resident-evil              2 blocking, 1 advisory, 3 findings
ok   steam-completion-rates     4 blocking, 7 advisory, 11 findings
```

---

## Install and first run

Node 20.11 or later. One runtime dependency (`yaml`, which has none of its own).

```bash
npm install --save-dev groundtruth
npx groundtruth init
```

Not published to npm yet, so until it is:

```bash
git clone https://github.com/HighnessAtharva/groundtruth
cd groundtruth && npm install && npm link
cd /your/project && groundtruth init
```

`init` looks at your repo, writes a config with only the modules you asked for, and
prints the one command to run next. It is idempotent: a second run writes nothing and
tells you what `--force` would change.

```
groundtruth

  wrote  groundtruth.config.mjs          readability
  wrote  AGENTS.md
  patch  .gitignore

  14 documents match docs/**/*.md

Next:

  npx groundtruth check docs/getting-started.md
```

**Start with readability.** It needs no sources and no authoring, and it finds
something in almost every document. Add grounding once you know what you would cite.

---

## A worked example

One paragraph, three claims, from nothing to a passing gate. Complete enough that if
you stop reading here you can still use the tool.

### The document

`article/keys.md`:

```markdown
# The Spencer Mansion runs on keys

Jill carries eight inventory slots and Chris carries six. The Armor Key opens
three doors. Most players finish a first run in about nine hours.
```

### The source

`sources/inventory-slots.md`, written by hand from a playthrough:

```markdown
Jill carries eight inventory slots.
Chris carries six inventory slots.
```

`sources/armor-key.md`:

```markdown
The Armor Key opens four doors.
```

### The config

```js
export default {
  sources: [{ type: 'local', id: 'notes', root: './sources' }],
  profiles: {
    grounded: {
      grounding: { enabled: true, spanMaps: 'groundtruth/spans/${docId}.mjs' },
    },
  },
  documents: [{ include: ['article/**/*.md'], profile: 'grounded' }],
};
```

No imports, which is what `groundtruth init` writes.

### Scaffold the claims

```bash
npx groundtruth draft article/keys.md --write
```

Every candidate comes out as `TODO`, which warns rather than blocks, so the scaffold
passes on its first run. Then fill in the sources:

```js
export const document = 'article/keys.md';
export const audited = '2026-08-22';

export const spans = [
  {
    match: 'Jill carries eight inventory slots and Chris carries six',
    source: 'notes:inventory-slots.md',
    quote: 'Jill carries eight inventory slots.',
    verdict: 'VERIFIED',
  },
  {
    match: 'The Armor Key opens three doors',
    source: 'notes:armor-key.md',
    quote: 'The Armor Key opens four doors.',
    verdict: 'CONTRADICTED',
    note: 'The note says four. The article says three. One of them is wrong.',
  },
  {
    match: 'Most players finish a first run in about nine hours',
    source: null,
    quote: null,
    verdict: 'UNSOURCED',
    note: 'No measurement behind this. Cite a poll or cut the number.',
  },
];
```

### Run it

```bash
npx groundtruth check
```

```
article/keys.md (grounded)
  ✗ ground.verdict  article/keys.md:3
    Contradicted: "The Armor Key opens three doors"
    The note says four. The article says three. One of them is wrong.
    fix A source disagrees with this claim. Read both and decide which is wrong.
  ✗ ground.verdict  article/keys.md:3
    No source found: "Most players finish a first run in about nine hours"
    fix Find a source that says this, or cut the sentence.

1 document · modules grounding · 2 errors · 0 warnings
✗ blocked by 2 errors.  groundtruth explain ground.verdict
```

Exit code 1.

### Fix and rerun

Change `three` to `four` in the article, update the span's quote, set it to
`VERIFIED`. Cut the nine-hours sentence, delete its span.

```bash
npx groundtruth check
```

```
1 document · modules grounding · 0 errors · 0 warnings
✓ clean
```

---

## The mental model

Four words, in order.

**Claim.** A verbatim substring of your document. Not a paraphrase, not a line number,
not a section. The exact characters a reader sees.

**Quote.** A verbatim substring of a source. The words that actually support the claim.

**Source.** Something that can be *pinned*, *fetched*, and *searched*. A folder on
disk, a repository at a commit, a captured web page, a table of records. See
[Sources](#sources).

**Verdict.** How the two relate. Nine of them.

| Verdict | Blocks | Means |
|---|---|---|
| `VERIFIED` | no | The quote was found in the named source |
| `EXTERNAL` | no | A URL with nothing cached to check against |
| `FIGURE` | no | Read off a chart or a screenshot |
| `TODO` | no | Nobody has looked yet. What `draft` writes |
| `INFERRED` | no | Computed from records. Needs a `derivation` |
| `DOC-DEFECT` | no | The document is right and the source is wrong |
| `UNSOURCED` | **yes** | Somebody looked and found nothing |
| `CONTRADICTED` | **yes** | A named source disagrees with the document |
| `STALE` | no | Derived by the tool. An author cannot write it |

Two distinctions do real work.

**`TODO` against `UNSOURCED`.** One says nobody has looked. The other says somebody
looked and found nothing. Only the second blocks, which is why a fresh scaffold passes.

**`STALE` is derived.** A claim cannot know it has gone stale, so the tool computes it
by comparing what the pin says with what the source says now. A span map naming `STALE`
is rejected with an explanation.

### How a claim goes stale

```
       you write it                        the source moves
            │                                     │
            ▼                                     ▼
   VERIFIED at pin A  ──── resolve --refresh ──> STALE (was line 17, now absent)
            │                                     │
            │                          you decide which follows
            │                             ╱               ╲
            └──────── pin stays ─────────╱                 ╲──── claim updated
                                    (refuse the move)        (accept the move)
```

Both mechanisms are offline. A records source compares a content hash. A web source
compares two captures. Neither makes a request.

---

## What each module checks

### Grounding

Every claim in a span map is verified twice: the `match` must occur in exactly one
prose block of the document, and the `quote` must be locatable in the source.

The match check reads the same parse tree the renderer reads, so it asks the real
question rather than a proxy. A match may cross a bold run or a link and still verify,
and it can never land inside an image's alt text or a heading, because neither is
reader text. `snake_case_name` and `2 * 3` are ordinary text and verify fine.

When prose is edited out from under a span, the finding carries the nearest sentence
and a similarity score. Above 0.82 with nothing else close, `check --fix-matches`
applies the repair, and the replacement is always a real substring of the document so
applying it cannot break the guarantee.

### Readability and images

Deliberately **not** a reading grade. Flesch-Kincaid and its relatives are dominated by
syllables per word, so on technical prose they flag every sentence containing
"configuration" and stay quiet on a 40-word sentence made of short words.

Ten signals, each something a writer can fix by rewriting:

| Signal | Cost | Fires on |
|---|---|---|
| over the word budget | 1.4 per word | more than 22 words |
| clause breaks | 3.5 each, scaled by length | commas, semicolons, subordinators |
| passive voice | 6 | a be-verb plus a participle, guarded against adjectives |
| jargon density | up to 60 | three-syllable lowercase words over 18 percent, only at 14+ words |
| nominalizations | 2.5 each | a verb buried in a noun, at two or more |
| filler | 2.5 each | words that add length and no meaning |
| parentheses | 2 each | an aside |
| fused clauses | 4.5 | two independent clauses welded with a comma and a coordinator |
| front-loaded subject | 3.5 | an opener that holds the subject back |
| preamble | 4 | a runway in front of the claim |

**An enumeration is free.** Three or more short verbless items count as one clause
break, and their words are excluded from the jargon count. That calibration came from a
108-document corpus where 31 of the 31 sentences rated hardest were enumerations and
not one was a defect.

Image checks: alt text exists and describes the picture, the file exists on disk, and a
number in prose that disagrees with a number in the image's own description gets
flagged. The tool also says once per document that images need a human pass, because it
reads alt text and not pixels.

### SEO and AEO

The governing policy, and the reason this module is trustworthy:

> Gate what is mechanical, review what is editorial, and never chase a metric that has
> no right answer. Does this check have exactly one right answer a script can compute?
> If yes it becomes a blocking gate and no human looks at it again. If no it stays
> advisory and a person decides.

Every rule declares `mechanical: true` or `false`, and **config refuses to load** if you
try to gate an advisory one:

```
groundtruth: config error
  severity['seo.kw-density'] = 'error'
  seo.kw-density is advisory: it has no single right answer a script can compute.
  Gating it makes writers pad prose to hit a percentage.
  Set 'warn', or pass allowAdvisoryGates: true if you have decided otherwise.
```

Keyword density, body length, secondary keyword reach and the overall score are
permanently advisory. The score has no rule behind it at all, so config structurally
cannot promote it.

Blocking checks cover the four keyword placements, meta and title lengths, canonical
URL, exactly one H1, no heading depth skips, no colon or duplicate in a heading, no
vague heading, answer-before-the-first-H2, an opening that is not a preamble, an FAQ
block, and a language tag on every code fence.

---

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
import { local, git, web, records } from 'groundtruth/adapters';
import { longform, shortform, neutral, atharva, ste } from 'groundtruth/presets';
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

Full detail: [`skills/groundtruth-span-maps/reference/adapters.md`](skills/groundtruth-span-maps/reference/adapters.md).

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
npx groundtruth draft docs/page.md --write     # scaffold, everything TODO
npx groundtruth draft docs/page.md --update    # add new candidates, keep the rest
npx groundtruth check --fix-matches            # repair a desynced match
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
npx groundtruth explain               # every rule, with what it checks
npx groundtruth explain read.series   # one rule, and why it exists
npx groundtruth explain CONTRADICTED  # a verdict
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

## CLI reference

| Command | Blocking | Network | Mutates |
|---|---|---|---|
| `init` | no | no | config, `.gitignore`, `AGENTS.md` |
| `check [paths...]` | **yes** | no | span maps, only with `--fix-matches` |
| `report [paths...]` | no, or `--fail-on` | no | `reportDir` |
| `draft <path>` | no | no | a span map, with `--write` |
| `resolve [ids...]` | no | **yes** | cache, snapshots, lockfile with `--refresh` |
| `explain [id]` | no | no | nothing |

### Exit codes

| Code | Meaning |
|---|---|
| 0 | clean |
| 1 | blocking findings |
| 2 | usage error |
| 3 | config error |
| 4 | internal error |
| 5 | network needed and unavailable |

3 and 1 are different on purpose. CI can tell "the setup is broken" from "the content
is wrong" without parsing a message.

### Flags that matter

```bash
groundtruth check docs/one-file.md        # takes paths. not corpus-only
groundtruth check --changed               # only what this branch touched
groundtruth check --frozen                # refuse to verify at a moved pin. CI mode
groundtruth check --module readability    # repeatable, or comma separated
groundtruth check --offline               # fail rather than fetch
groundtruth check --fix-matches           # the only mutation check can perform
groundtruth check --json                  # stdout is pure JSON, chatter on stderr
groundtruth check --format github         # ::error annotations
groundtruth check --format sarif          # for code scanning
groundtruth report --open --fail-on error
groundtruth resolve --refresh engine      # re-pin one source by id
groundtruth resolve --offline             # audit cache coverage, fetch nothing
```

`--json` writes one object to stdout and nothing else, which is what makes
`groundtruth check --json | jq` work inside a hook.

---

## The report

```bash
npx groundtruth report
```

One self-contained HTML file per document plus an index. CSS and JS inlined, data in a
JSON script tag. **No fetch, no CDN, no fonts, no framework.** It opens from a file
path and survives being emailed. A test asserts no remote `src` or `href` appears
anywhere in a rendered page.

The page is a critical edition: your prose, with an apparatus recording what each claim
rests on.

- **Annotations underline rather than highlight.** A background wash on forty bound
  claims is a wall of highlighter and the prose stops being readable, which defeats
  showing it in prose at all. Only the two blocking verdicts carry a wash, which makes
  them *more* visible.
- **Colour is OKLCH and solved rather than eyeballed.** In HSL, `hsl(100 80% 50%)` and
  `hsl(248 80% 50%)` state the same lightness and look nothing alike, so an amber
  verdict read as more urgent than a blue one for no reason. Twenty tests recompute
  every contrast ratio from the token values, so a token that stops clearing its
  threshold fails the suite.
- **Nothing scrolls sideways**, and it is fixed properly rather than with
  `overflow-x: hidden` on the root.
- Light and dark, with the theme applied before first paint.
- Hover a claim for the verdict, the quote, the source and a link to it. Tab walks the
  marks, click pins a card, Escape closes.

It renders through the same parse tree the checker walked. A second parser would let a
span verify in `check` and fail to highlight in `report` with no error anywhere.

---

## Agents

```
/plugin marketplace add HighnessAtharva/groundtruth
```

| Skill | Fires on |
|---|---|
| `groundtruth-span-maps` | authoring or repairing a map, or a grounding finding |
| `groundtruth-gate` | a non-zero exit, or "make it pass" |
| `groundtruth-authoring` | drafting prose in a project that has a config |

Four commands: `/groundtruth:check`, `/groundtruth:ground`, `/groundtruth:explain`,
`/groundtruth:init`.

One `Stop` hook that blocks finishing while `summary.blocking > 0`, naming each file,
rule and fix. It runs `--changed`, so it stays fast enough that nobody turns it off.

One subagent, `groundtruth-verifier`. Grounding a 2,000-word article is fifty to a
hundred tool calls of search that become dead weight the moment the map exists, so it
does that work elsewhere and returns four things: the map path, the verdict tally, the
claims it could not ground, and any source record it thinks is wrong.

[`AGENTS.md`](AGENTS.md) carries the same contract in plain markdown for Codex and
Cursor.

### The output is designed for an agent

Two fields carry the weight.

**`blocking` is precomputed.** A consumer never derives it from severity plus config.
That is the single most common mistake an agent makes reading a linter: fixing advisory
nits while a real error sits untouched.

**`fix.kind` says whether the reader can act alone.**

| Value | Meaning |
|---|---|
| `edit` | An exact `find` and `replace` patch is attached. Apply it |
| `rewrite` | Produce prose. The tool cannot |
| `source` | Go find or add a record. This is research |
| `decision` | A person has to choose. Stop and ask |

A `CONTRADICTED` claim gets `decision`. That one value is what stops an agent
confidently rewriting a true sentence to match a bad source record.

There are no fuzzy patches. If the tool cannot produce an exact find and replace it
omits `patch` and lowers `confidence`.

```json
{
  "id": "GT-SEO-014",
  "rule": "seo.fence-language",
  "severity": "error",
  "blocking": true,
  "file": "article/counter-and-queue.md",
  "line": 47,
  "message": "Fenced code has a language: 1 untagged fence(s) at line 47",
  "why": "An untagged code fence is skipped by search and answer engines",
  "fix": { "kind": "edit", "instruction": "Add a language tag.", "confidence": "medium" }
}
```

---

## CI

Copy [`.github/workflows/example-project.yml`](.github/workflows/example-project.yml).

```yaml
- uses: actions/checkout@v4
  with: { fetch-depth: 0 }        # --changed needs history for a merge base
- run: npx groundtruth check --changed --frozen
- if: always()
  run: npx groundtruth check --format sarif > groundtruth.sarif
- uses: github/codeql-action/upload-sarif@v3
  if: always()
  with: { sarif_file: groundtruth.sarif }
```

`--frozen` refuses to verify against a revision the lockfile does not name, so a build
cannot quietly pass against a newer source.

**The adoption path.** Do not turn everything on at once.

1. `check --module readability` on the whole repo, non-blocking, and read the report.
2. Move the rules you agree with to `error`. Leave the rest advisory.
3. `check --changed` as a blocking gate. New work is held to the bar, old work is not.
4. Add grounding to one document. Then one folder.
5. Blocking everywhere, once the corpus is clean.

---

## Extending it

Three extension points, all plain values in an ESM config. Nothing resolves by name,
nothing comes from `node_modules`, nothing needs publishing.

**A rule.** `defineRule({ id, module, mechanical, defaultSeverity, explain, run })`
pushed into `config.rules`. `run(ctx)` gets `{ doc, blocks, frontmatter, config,
profile, finding }`, where `blocks` has the same helpers the built-in rules use:
`prose()`, `citable()`, `headings(depth)`, `images()`, `links()`, `fences()`,
`opening(depth)`, `underHeading(re)`, `text()`.

Because `mechanical` is declared there, a custom rule participates in the
advisory-gate guard exactly like a built-in one.

**An adapter.** Any object with `id`, `owns`, `resolve`, `locate`, `permalink` and
`describe`. Optional `pin`, `usePin`, `bind`, `attachCache` and `drift`. A Notion,
Confluence, S3 or SQLite adapter is about 80 lines and lives in your repo.

```js
import myNotion from './gt-notion.mjs';
export default { sources: [myNotion({ id: 'notion', token: process.env.NOTION_TOKEN })] };
```

A missing method is refused by name at config load.

**A preset.** A plain object of thresholds. `overrides` merges over it, one level deep
into `costs`, `signals` and nested groups, so changing one number is two lines rather
than a fork.

---

## Presets

| Preset | Ships | What it is |
|---|---|---|
| `neutral` | **on** | Sentence shape, passive voice, filler, image checks. No word list, no punctuation opinion |
| `longform` | opt in | SEO thresholds for a 2,000 to 3,200 word guide |
| `shortform` | opt in | SEO thresholds for a 300 to 560 word note |
| `atharva` | opt in | A house style: 57 banned words, 40 banned phrases, no dash, no semicolon |
| `ste` | opt in | ASD-STE100 Simplified Technical English, the mechanical half |

The default is neutral because a tool that fails a video-game write-up on the word
"exciting" reads as broken to a stranger. The opinionated presets are complete worked
examples of what an opinion looks like here. Copy one, cut what you disagree with, keep
your version in your repo.

`ste` is honest about its scope. It implements the sentence caps, the finite-verb
requirement and the forbidden constructions. It does **not** implement the
approved-vocabulary rule, which is the heart of the standard and needs a person.
Anything claiming to enforce STE from a word list alone is overselling.

---

## Prior art, and why this exists

| Tool | Does well | Does not do this |
|---|---|---|
| **Vale** | Style and terminology at scale, excellent config model | No concept of a source. It checks how you wrote, never what you wrote it from |
| **textlint / markdownlint** | Structure, syntax, huge plugin ecosystems | Same. No claim, no source, no verdict |
| **write-good / Hemingway** | Quick prose feedback | Readability only, and syllable-driven, which is wrong for technical prose |
| **An LLM fact-checker** | Catches things a rule never will | Non-deterministic, unauditable, costs money per run, and cannot fail a build reproducibly |
| **Zotero / BibTeX** | Bibliography management, citation formatting | Binds a document to a *work*, not a sentence to a *quote*. Nothing verifies the quote is in there |
| **Footnotes** | Universally understood | A convention, not a check. Nothing notices when the target changes |

The gap all six share: **none of them binds a claim to a locatable quote in a versioned
source and fails a build when either side moves.**

That is the whole scope of this tool. The readability and SEO modules exist because the
parse tree was already there, not because the world needed another linter.

The mechanism is extracted and generalized from a working system: 2,584 spans across
108 articles, 0 failed matches, 2,314 line-anchored permalinks across seven
repositories. What is new here is that it is not welded to one website, one company's
repositories, or one hardcoded absolute path.

---

## Limits

Read this part.

**It cannot tell you the source is true.** A wrong source quoted correctly passes. This
is provenance, not fact-checking, and conflating the two would be the dishonest version
of this tool.

**It cannot check an inference.** `INFERRED` records that you did arithmetic and asks
you to write down what you did. Nobody verifies the arithmetic.

**It cannot read pixels.** It reads alt text, filenames and data labels. It says so
once per document rather than pretending otherwise.

**It cannot see a hedge or sarcasm.** "Some people claim X" and "X" look the same to a
substring matcher.

**A claim split across two sentences needs two spans.** A match cannot cross a block
boundary.

**English only.** The sentence splitter, the passive-voice guard and the nominalization
pattern are all English-specific.

**No PDF, no DOCX, no HTML input.** Markdown in, and the `web` adapter converts HTML to
text for quote location only.

**Span maps are executable code.** That is what buys the constants, and it means a span
map from an untrusted contributor is code review.

**Authoring is real work.** A 2,000-word article is thirty spans. `draft` gets you the
candidates, but a person or an agent still has to find each quote. If that cost is too
high for your project, run readability and SEO and skip grounding. That is a supported
configuration and the examples show it.

---

## FAQ

**Does this call an LLM?** No. Zero network calls except `resolve`, which fetches your
declared sources and nothing else. No telemetry.

**Will it slow my build?** See [Performance](#performance). `--changed` keeps it
proportional to what you touched.

**Can I use one module and ignore the others?** Yes, and that is the intended path.
`check --module readability` needs no sources, no span maps and no authoring.

**Why not YAML for span maps?** Constants. One real span map names its sources once at
the top and builds thirty spans from them. YAML anchors can do that but read worse, and
`.mjs` needs no parser at all.

**What if the source is behind a login?** The `web` adapter cannot log in. Capture the
page yourself and write the snapshot file, or use `local` on an export.

**Can two documents share a span map?** No, and a run that finds two maps claiming one
document names both files.

**Why does an advisory rule exist if it cannot block?** Because it is worth seeing and
not worth failing on. The report shows every one, and a person decides.

**How do I turn a rule off?** `severity: { 'read.hard': 'off' }`. A rule set to `off`
never executes, so turning it off also removes its cost.

**Is `--fix-matches` safe?** It only applies a patch the tool judged exact, only when
one candidate scores above 0.82 with nothing else above 0.6, and the replacement is
always a real substring of your document. It prints the diff and re-runs.

**Does it work on Windows?** It was built on Windows. All paths resolve from the config
file, CRLF input produces identical output to LF, and no shell-out is required except
optional `git` for `--changed`.

---

## Performance

Reproduce these yourself. `npm run bench` generates the corpus and times the runs, so
the numbers here are measured rather than remembered.

**200 documents, 104,200 words, 400 spans:**

| Run | Time | Per document |
|---|---|---|
| `check --module readability` | 0.85s | 4.2ms |
| `check --module seo` | 0.88s | 4.4ms |
| `check --module grounding` | 1.15s | 5.8ms |
| `check`, all three | 1.6s | 7.8ms |
| `check` one document | 0.29s | mostly Node startup |
| `report` | 2.2s | 11ms |

Node's startup and module loading is about 130ms of any run, which is why a
single-document check looks expensive per document and is not.

Two optimisations are worth knowing about, both found by profiling this corpus:

- **Span maps load concurrently.** Loading them one at a time cost 2.25ms each, a
  quarter of the whole run.
- **A pin is only computed when there is something to compare it against.** The local
  adapter was hashing every file in the source folder on every `check`, for a pin that
  no lockfile entry existed to diff.

The parse happens once and every module reads it. A module that is off is never
imported, so a readability-only config compiles no SEO regexes and globs no span maps.
Grounding after the first `resolve` is pure disk reads from a content-addressed cache,
which is why an offline run is the same speed as an online one.

### Report size

The report inlines its stylesheet and script into every page, so a single page can be
shared on its own. Above 25 pages that duplication stops being worth it, so shared
`report.css` and `report.js` are written instead and each page links them. Still no
network either way, and the run says which it chose.

On the 200-document corpus that is 2.5MB rather than 8.9MB. Force it with
`report: { assets: 'inline' | 'linked' }`.

---

## Stability

Semver covers: the `--json` `schemaVersion` and finding shape, rule ids, config keys,
verdict names, exit codes, the adapter interface, and the `defineRule` contract.

Semver does not cover: the HTML markup, the report layout, CSS class names, the SEO
score formula, or the exact wording of a message.

Releases are published from CI with [npm provenance](https://docs.npmjs.com/generating-provenance-statements),
so every version on npm carries a verifiable attestation linking the tarball to the
commit and the workflow run that built it. [RELEASING.md](RELEASING.md) is the procedure.

---

## Contributing

```bash
npm install
npm run test:all
```

A rule needs an `explain` that says why it exists, and `mechanical: false` unless it
has exactly one right answer a script can compute. A colour needs a test in
`test/contrast.test.mjs`. An example needs to fail on its first run.

## License

MIT
