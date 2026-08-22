---
name: groundtruth-span-maps
description: Author and repair groundtruth span maps. Use when the user asks to fact-check, cite, ground, source or verify a document, when opening or editing any file matching `*.spans.mjs` or `groundtruth/spans/*.mjs`, or when a run reports ground.match-not-found, ground.quote-not-found, UNSOURCED or CONTRADICTED. Also use when asked to bind claims to sources, add citations to an article, or work out what a document rests on.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---

# Span maps

## The contract

A **claim** is a verbatim substring of the document.
A **quote** is a verbatim substring of the source.
The tool refuses to record anything it cannot find in both places.
You never edit a source to make a claim fit.
When the two disagree, a person decides, not you.

## Where things are

- Config: `groundtruth.config.mjs` at the project root. Read `sources` for the
  source ids and `profiles.<name>.grounding.spanMaps` for the path template.
- Span maps: by default `groundtruth/spans/${docId}.mjs`, where `docId` is the
  document path minus its extension with slashes turned into dashes. So
  `article/keys.md` becomes `groundtruth/spans/article-keys.mjs`.
- Output: `.groundtruth/report/`, gitignored.

## One complete span

Copy this shape. Do not paraphrase it into a schema.

```js
export const document = 'article/keys.md';
export const audited = '2026-08-22';

const NOTES = 'notes:characters/inventory-slots.md';

export const spans = [
  {
    match: 'Jill carries eight inventory slots and Chris carries six',
    source: NOTES,
    quote: 'Jill carries eight inventory slots.',
    verdict: 'VERIFIED',
    note: 'The Chris half is the next line of the same record.',
  },
];
```

Constants are why this is a module. Name each source once at the top.

## Which verdict

Work down. Stop at the first one that fits.

1. Did you find the exact sentence, or a sentence that says the same thing, in a
   source? **VERIFIED.** Paste that sentence as `quote`.
2. Did you compute it from records you can name? **INFERRED**, and write a
   `derivation` naming the records and the arithmetic. Required.
3. Is the only support a web page with nothing cached? **EXTERNAL**, with the URL
   as `source`.
4. Did you read the number off a chart or a screenshot? **FIGURE**.
5. Does a source you named say something different? **CONTRADICTED**. The `quote`
   is what the **source** says, and the `note` explains what the document says
   instead. Then stop and ask the user which is wrong.
6. Is the source wrong and the document right? **DOC-DEFECT**, with a note.
7. Did you look and find nothing? **UNSOURCED**, with `source: null` and
   `quote: null`, and a note saying what would source it.
8. Have you not looked yet? **TODO**. This is what `draft` writes. It warns rather
   than blocks, and it is the one verdict you are expected to replace.

Never write **STALE**. The tool derives it and rejects a span map that names it.

## The three refusals, and what each means

**`ground.match-not-found`** — your `match` is not in the document.

Almost always because you included markdown. The match has to be a substring of the
**reader text**, which is the document with markdown removed.

```js
match: 'collects with `Promise.all`',   // refused, backticks are not reader text
match: 'collects with Promise.all',     // correct
```

The same applies to `**bold**`, `_italics_` and `[link text](url)`. Quote what a
reader sees. The finding carries the nearest sentence and a score. Above 0.82 with
nothing else close, `npx groundtruth-cli check --fix-matches` applies it for you.

**`ground.match-ambiguous`** — the text appears more than once. Lengthen the match
until it is unique. If the sentence really is duplicated in the document, that is
the actual defect.

**`ground.quote-not-found`** — the quote is not in the source. The usual cause is a
quote condensed from several lines. Copy one line verbatim instead, or point at the
file that actually says it. Never widen the quote to swallow the mismatch.

## Running it

```bash
npx groundtruth-cli check <path>          # blocking. exit 1 on a blocking finding
npx groundtruth-cli check --json          # the machine contract, stdout only
npx groundtruth-cli draft <path> --write  # scaffold a map, all TODO
npx groundtruth-cli draft <path> --update # add new candidates, keep existing spans
npx groundtruth-cli explain <rule>        # why a rule exists and what it measures
npx groundtruth-cli resolve               # the only command that touches the network
```

## Reading the JSON

1. Read `summary.blocking`. If it is zero you are done.
2. Iterate `documents[].findings[]`.
3. Act on every finding with `blocking: true` before any with `blocking: false`.
   Do not derive that from severity. It is precomputed.
4. Group what is left by `fix.kind`.

## Fix recipes, by `fix.kind`

**`edit`** — a `fix.patch` with an exact `find` and `replace` is attached. Apply it.
Nothing fuzzy is ever attached, so if there is no patch there was no certainty.

**`rewrite`** — write new prose. The tool cannot. Read `fix.instruction`.

**`source`** — go and find a record, or add one. This is research, not an edit. If
no source exists, cutting the sentence is a correct answer and often the right one.

**`decision`** — stop. A person has to choose. This is what CONTRADICTED gets, and
it is deliberate: the tool has both records and no way to know which is wrong.
Present both and ask.

## Never do these

1. Never paraphrase a quote to make it match.
2. Never widen a quote span to swallow a mismatch.
3. Never edit a source record to fit the document.
4. Never hand-set a verdict to silence a finding.
5. Never delete a span instead of fixing it.
6. Never mark something VERIFIED when you only found a paraphrase.
7. Never resolve a CONTRADICTED finding yourself.

## More detail

- `reference/verdicts.md` — all eight, with the edge cases.
- `reference/adapters.md` — the ref grammar and the locator syntax per source type.
