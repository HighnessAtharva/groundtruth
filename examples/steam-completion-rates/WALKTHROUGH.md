# Walkthrough

Four blocking findings, one STALE, and no network at any point.

## 0. Run it

```bash
npx groundtruth-cli check
```

Exit 1. Four blocking, seven advisory.

## 1. The two image findings

```bash
npx groundtruth-cli explain read.alt-generic
```

**`read.alt-generic`** at line 32. The alt text reads `chart`, which names the file
type instead of describing the picture. Replace it with what the picture shows:
`a bar chart of second-achievement rate against final-achievement rate for twelve
titles`.

**`read.image-missing`** at line 40. `first-hour-funnel.png` is referenced and not
on disk. Two honest fixes: draw it, or cut the paragraph that leans on it. For this
walkthrough, cut it.

Both are mechanical. Both have exactly one right answer, which is why they block.

```bash
npx groundtruth-cli check
```

## 2. The contradiction, which is a data problem

```bash
grep -n "has_tutorial" sources/catalog/games.json
grep -n "Harrow Line" sources/completion-table.csv
```

The catalog says `has_tutorial: true`. The CSV note says "no tutorial, first fight
at 4 minutes". Your two records disagree, and the article picked one of them.

`fix.kind` is `decision`, and it is the right value. The tool has both records and
no way to tell which is correct. **Fix the records first**, then the sentence
follows from whichever survives. Editing the prose to match one record leaves the
other one wrong and the next article will trip over it.

## 3. The unsourced claim

"Players abandon most games in the first twenty minutes" is a claim about all
players, in a piece about twelve invented titles. Cut it.

## 4. STALE, and why it is not an error

```bash
npx groundtruth-cli check --json
```

Look for `ground.stale`. It reports at `warn`, not `error`, and that is deliberate.
A stale claim was **true when it was written**. Nobody made a mistake. The world
moved, and somebody now has to decide whether the claim or the pin should follow.

Two mechanisms are live in this example. Look at both:

**The table moved.** `groundtruth.lock.json` pins a content hash of
`completion-table.csv`. Compare the current file with the version at that pin:

```bash
diff sources/completion-table.at-pin.csv sources/completion-table.csv
```

Two cells changed.

**The page moved.** Two captures sit in `snapshots/`, and the newer one withdraws
the exact sentence the article quotes:

```bash
cat snapshots/*/2026-03-14.snapshot
cat snapshots/*/2026-08-01.snapshot
```

Neither check made a request. Drift is a comparison of two things already on disk,
which is why this works on a plane.

## 5. Accept the drift

When you have decided the current sources are the truth:

```bash
npx groundtruth-cli resolve --refresh
git diff groundtruth.lock.json
npx groundtruth-cli check
```

The pin moves to the current hash and STALE clears, because there is no longer a
gap between the pin and the file. You have recorded a decision rather than silenced
a warning, and the lockfile diff is the record of it.

To refuse instead:

```bash
npx groundtruth-cli check --frozen
```

## 6. Add a claim of your own

Pick any number in the article that is not yet bound. Bind it to its cell:

```js
{
  match: 'the exact fragment, copied from the article',
  source: 'stats:completion-table.csv#name=Nine%20Lanterns&field=median_playtime_hours',
  quote: '4.9',
  verdict: 'VERIFIED',
},
```

Get the row name wrong and the tool says the row does not exist. Get the value
wrong and it says what the cell actually holds. Both refusals are the product.

## The comparison that is deliberately loose

A cell holding `24.99` matches a quote of `$24.99`, and `4.9` matches `4.9 hours`.
Currency symbols, thousands separators, a trailing unit and case are all trimmed
before comparing.

Refusing those would be pedantry rather than verification. A table stores a number
and a writer writes a price, and insisting they be byte-identical teaches people to
stop using the tool.
