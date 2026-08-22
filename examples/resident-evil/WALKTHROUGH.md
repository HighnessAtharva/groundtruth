# Walkthrough

Six steps. Each one changes exactly one thing and you re-run after it, so you see
which finding each change closed.

## 0. Run it and read the failure

```bash
npx groundtruth-cli check
```

Exit code 1. Two errors and one warning:

```
✗ ground.verdict  article/spencer-mansion-runs-on-keys.md:21
  Contradicted: "The Armor Key opens three doors"
✗ ground.verdict  article/spencer-mansion-runs-on-keys.md:35
  No source found: "Most players finish a first run in about nine hours"
! ground.verdict  article/spencer-mansion-runs-on-keys.md:17
  Inferred: "There are more locked doors on the first floor than a single characte…"
```

Look at the exit code first, then at `blocking` in the JSON. Everything else can
wait.

```bash
npx groundtruth-cli check --json | jq '.summary'
```

## 1. Look at the contradiction before you touch anything

```bash
npx groundtruth-cli explain ground.verdict
cat sources/mansion-notes/items/armor-key.md
grep -rl "Armor Key" sources/mansion-notes/doors/
```

The item record says four doors. Four door records name the Armor Key. The article
says three.

**The tool cannot fix this and does not pretend it can.** The finding carries
`fix.kind: "decision"`, which means a person has to choose. That single value is
what stops an agent confidently rewriting a true sentence to match a bad note.

Two legitimate resolutions:

- The article is wrong. Change three to four in
  `article/spencer-mansion-runs-on-keys.md`, then change the quote in the span map
  to match and set the verdict to `VERIFIED`.
- The note is wrong. Fix `items/armor-key.md`, drop its `synthetic: true`, and set
  the verdict to `VERIFIED`.

For this example, take the first. The door records are the count.

```bash
npx groundtruth-cli check
```

One error left.

## 2. Deal with the unsourced number

"Most players finish a first run in about nine hours" has nothing behind it. The
finding is `fix.kind: "source"`, which means research rather than an edit.

Also two legitimate resolutions, and the second one is not a failure:

- Find a source. A completion-time aggregator would do it. Add the record, quote
  it, set `VERIFIED`.
- Cut the number. The sentence around it is about walking, and it survives without
  the figure.

Never set `VERIFIED` to make the finding go away. That is the one thing this tool
exists to stop.

```bash
npx groundtruth-cli check
```

Zero errors. The INFERRED warning stays, and that is correct.

## 3. Understand why the warning stays

```bash
npx groundtruth-cli explain ground.verdict
```

An INFERRED claim was computed rather than quoted, so the derivation is the thing
a reader has to trust. It warns forever, by design, because it is a standing
invitation to re-check the arithmetic when the records change. Silence it in config
if your project disagrees:

```js
verdicts: {
  INFERRED: { severity: 'off', label: 'Inferred', hue: 38, requires: [['note', 'derivation']] },
}
```

## 4. Break a match on purpose, then repair it

This is the failure mode you will hit most often in real use. Editing prose
desyncs its spans.

```bash
# Change "The Sword Key opens six doors" to "The Sword Key opens six separate doors"
npx groundtruth-cli check
```

```
✗ ground.match-not-found
  span 3 names text that is not in the body: "The Sword Key opens six doors"
  did you mean (0.86) "The Sword Key opens six separate doors"
  fix Run with --fix-matches, or set match to "The Sword Key opens six separate doors"
```

The suggestion is a real substring of the document, so applying it cannot break
the verbatim guarantee.

```bash
npx groundtruth-cli check --fix-matches
```

It prints the diff, rewrites the span map, and re-runs. If two candidates had
scored close, it would have printed the top three and changed nothing.

## 5. Read the report

```bash
npx groundtruth-cli report
```

Open the path it prints. The prose is painted: green for a verified claim, amber
for an inferred one, bold red for a contradicted one. Hover any highlight for the
quote, the source and a link to it.

Two things worth trying:

- Press Tab to walk the highlights with the keyboard, then Escape to close a card.
- Toggle the theme in the header. Every verdict colour is derived from one hue per
  verdict, so a project that defines four verdicts gets four consistent washes with
  no CSS edit.

## 6. Add a claim of your own

Pick any sentence in the article that carries a fact and is not yet bound. Add it:

```js
{
  match: 'the exact sentence fragment, copied from the article',
  source: 'notes:rooms/main-hall.md',
  quote: 'a line copied verbatim out of that record',
  verdict: 'VERIFIED',
},
```

Get either string slightly wrong and the tool refuses it and tells you which one.
That refusal is the product.
