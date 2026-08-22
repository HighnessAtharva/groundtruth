# groundtruth, for agents

Plain markdown, no editor-specific syntax. Same contract as the Claude Code plugin.

## What this enforces

Every factual claim in a document is bound to a verbatim quote in a real source. The
tool refuses to record a claim it cannot find in the document, and refuses a quote it
cannot find in the source. It does not check that a claim is true. It checks that a
claim is anchored.

## Two commands

Before you finish any edit to a document:

```bash
npx @highnessatharva/groundtruth check <path>
```

To read the result:

```bash
npx @highnessatharva/groundtruth check --json
```

## Exit codes

| Code | Meaning |
|---|---|
| 0 | clean |
| 1 | blocking findings |
| 2 | usage error |
| 3 | config error, the setup is wrong and not the content |
| 4 | internal error |
| 5 | network needed and unavailable |

## Reading the JSON

`stdout` is pure JSON. Everything else goes to `stderr`.

```json
{
  "summary": { "blocking": 2, "advisory": 9, "exitCode": 1 },
  "documents": [
    {
      "path": "article/keys.md",
      "findings": [
        {
          "id": "GT-GROU-001",
          "rule": "ground.verdict",
          "severity": "error",
          "blocking": true,
          "file": "article/keys.md",
          "line": 21,
          "message": "Contradicted: \"The Armor Key opens three doors\"",
          "why": "A source you named disagrees with this claim.",
          "fix": {
            "kind": "decision",
            "instruction": "Read both and decide which is wrong.",
            "confidence": "low"
          }
        }
      ]
    }
  ]
}
```

1. Read `summary.blocking`. Zero means done.
2. Act on every finding with `blocking: true` first.
3. **Do not derive `blocking` from `severity`.** It is precomputed and already
   accounts for the project's config and for whether the rule may block at all.

## Fix recipes

| `fix.kind` | What it means | What to do |
|---|---|---|
| `edit` | `fix.patch` has an exact find and replace | Apply it |
| `rewrite` | New prose is needed | Write it, after reading the sentence in context |
| `source` | A record has to be found or added | Research. Cutting the claim is a valid answer |
| `decision` | A person has to choose | Stop and ask. Present both sides |

There are no fuzzy patches. An absent `fix.patch` means the tool was not certain.

## The span map format

One `.mjs` module per document, at `groundtruth/spans/<docId>.mjs` by default, where
`docId` is the document path minus its extension with slashes turned into dashes.

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

Fields: `match` and `verdict` are always required. `source`, `quote`, `note`,
`derivation` and `id` are optional and each verdict says which of them it needs.

**`match` is a substring of the reader text**, which is the document with markdown
removed. Backticks, asterisks and link syntax are not reader text.

```js
match: 'collects with `Promise.all`',   // refused
match: 'collects with Promise.all',     // correct
```

## The verdicts

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
| `STALE` | no | Derived by the tool. Never write it |

For `CONTRADICTED`, the `quote` is what the **source** says. The document's version is
already in `match`.

## Never do these

1. Never paraphrase a quote to make it match.
2. Never widen a quote to swallow a mismatch.
3. Never edit a source record to fit the document.
4. Never hand-set a verdict to silence a finding.
5. Never delete a span instead of fixing it.
6. Never mark something `VERIFIED` when you only found a paraphrase.
7. Never resolve a `CONTRADICTED` finding yourself.
8. Never report a run as clean without reading `summary.blocking`.

## A worked failure

```
✗ ground.match-not-found  article/keys.md:1
  span 3 names text that is not in the body: "The Sword Key opens six doors"
  did you mean (0.86) "The Sword Key opens six separate doors"
  fix Run with --fix-matches, or set match to "The Sword Key opens six separate doors"
```

The prose was edited after the span was written. The suggestion is a real substring of
the document, so applying it cannot break the verbatim guarantee.

```bash
npx @highnessatharva/groundtruth check --fix-matches
```

It prints the diff, rewrites the span map, and re-runs. When two candidates score
close it prints the top three and changes nothing, because a fuzzy patch applied
silently is a corruption.

## Every command

```bash
npx @highnessatharva/groundtruth init                    # set up in this repo
npx @highnessatharva/groundtruth check [paths...]        # blocking
npx @highnessatharva/groundtruth check --changed         # only what this branch touched
npx @highnessatharva/groundtruth check --frozen          # CI: refuse to verify at a moved pin
npx @highnessatharva/groundtruth check --format sarif    # for code scanning
npx @highnessatharva/groundtruth report                  # the HTML, non-blocking
npx @highnessatharva/groundtruth draft <path> --write    # scaffold a span map
npx @highnessatharva/groundtruth draft <path> --update   # add new candidates, keep existing spans
npx @highnessatharva/groundtruth resolve                 # the only networked command
npx @highnessatharva/groundtruth resolve --refresh       # move the pins
npx @highnessatharva/groundtruth explain <rule>          # why a rule exists
```
