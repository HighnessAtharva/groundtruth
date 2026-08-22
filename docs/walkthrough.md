[← back to the README](../README.md)

# A worked example, start to finish

One paragraph, three claims, from nothing to a passing gate.

## The document

`article/keys.md`:

```markdown
# The Spencer Mansion runs on keys

Jill carries eight inventory slots and Chris carries six. The Armor Key opens
three doors. Most players finish a first run in about nine hours.
```

## The source

`sources/inventory-slots.md`, written by hand from a playthrough:

```markdown
Jill carries eight inventory slots.
Chris carries six inventory slots.
```

`sources/armor-key.md`:

```markdown
The Armor Key opens four doors.
```

## The config

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

## Scaffold the claims

```bash
npx @highnessatharva/groundtruth draft article/keys.md --write
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

## Run it

```bash
npx @highnessatharva/groundtruth check
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

## Fix and rerun

Change `three` to `four` in the article, update the span's quote, set it to
`VERIFIED`. Cut the nine-hours sentence, delete its span.

```bash
npx @highnessatharva/groundtruth check
```

```
1 document · modules grounding · 0 errors · 0 warnings
✓ clean
```

---

