# Walkthrough

Six blocking findings, then two more you create on purpose.

## 0. Run it

```bash
npx groundtruth check
```

Exit code 1. Read `summary.blocking` first, then work only the findings whose
`blocking` field is `true`. Ignore severity, ignore the advisory list, and do not
sort by anything else. That is the whole triage rule.

```bash
npx groundtruth check --json
```

## 1. The four mechanical ones

Each has exactly one right answer, which is why it blocks.

```bash
npx groundtruth explain seo.fence-language
```

- **`seo.fence-language`** carries an exact patch. Add `js` to the fence at line 47.
- **`seo.len-meta`** is 61 characters over the cap. Cut it.
- **`seo.h2-vague`** wants the heading to say what the section concludes. "Read the
  file" works.
- **`seo.faq-present`** needs a `### Frequently asked` block with question and
  answer pairs. Three real ones for this article: does p-limit preserve call order,
  what happens if you change the limit at runtime, and is this the same as a
  semaphore. The FAQ is the AEO payload and it is also genuinely useful, which is
  the test for whether an FAQ should exist at all.

```bash
npx groundtruth check
```

Two errors left, both grounding.

## 2. The unsourced claim

"Most teams set the limit to the number of CPU cores" has nothing behind it. The
article read one file, and that file cannot know what most teams do.

`fix.kind` is `source`, which means research rather than an edit. Cut it, or find a
survey and cite it. Never set `VERIFIED` to make it quiet.

## 3. The contradiction

This is the one the tool exists for.

`fix.kind` is `decision`. Open the permalink in the report, read the code, and
decide. For this article the prose is wrong: each call resolves when its own task
settles. Rewrite the sentence, then update the span so the quote supports the new
wording, and set the verdict to `VERIFIED`.

```bash
npx groundtruth check
```

Zero errors. The INFERRED warning stays, which is correct. A derived claim is a
standing invitation to recheck the arithmetic when the source changes.

## 4. Read the report

```bash
npx groundtruth report
```

Every code claim links to a line in `sindresorhus/p-limit` at the pinned SHA. Click
one. That link is the difference between a citation and a gesture at a citation.

## 5. Break it on purpose: move the pin

```bash
npx groundtruth resolve --refresh
git diff groundtruth.lock.json
npx groundtruth check
```

If upstream has moved since this example was written, some quotes moved with it and
those claims flip to **STALE**, carrying the old SHA, the new SHA, and what changed.
That is the code-movement flavour of STALE. Example 2 shows the other one, where a
cached page drifts under a claim.

If upstream has not moved, the lockfile diff is empty and nothing goes stale, which
is also the correct answer.

To refuse the move rather than accept it:

```bash
npx groundtruth check --frozen
```

That is the CI mode. A build that would have quietly verified against a newer
revision stops instead, and the finding names both SHAs.

## 6. Run offline

```bash
npx groundtruth resolve --offline
```

Every quote resolves from the committed cache and the command exits 0 with no
network. That is the property the cache directory exists for.

## The trap you will hit first

A `match` is a substring of the **reader text**, which is the document with markdown
removed. Backticks are not reader text.

```js
// refused: the backticks are not in the rendered sentence
match: 'collects with `Promise.all`',
// correct
match: 'collects with Promise.all',
```

The tool caught exactly this while the example was being written, scored the repair
at 1.00, and offered `--fix-matches`. The same applies to `**bold**` and to a
`[link](url)`. Quote what a reader sees, not what you typed.
