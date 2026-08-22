# Completion rates: a table, a cached page, and a claim going stale

Two adapters on one document, and the only example that shows a source moving under
a claim. Grounding and readability on, SEO off.

```bash
npx groundtruth-cli check
npx groundtruth-cli report
```

**It fails on the first run, on purpose.** Four blocking findings and a STALE
warning. Everything runs with no network.

## What the article is

*Nobody Finishes These.* A wishlist is a promise to your future self, and a
completion percentage is what your future self actually did. Twelve titles paired
with their achievement tables, and the finding is that length barely predicts
whether people finish. The share of owners who earn the **second** achievement does.

Eleven claims are bound. Seven hold, one is inferred, one is read off a chart, one
is contradicted by the sources themselves, one has nothing behind it, and one went
stale.

## Every title and every number is invented

`sources/PROVENANCE.md` says so at the top. Attaching a fabricated completion rate
to a real game would be a fabricated record about a real product, so the games are
invented and the lesson is identical.

The cached page lives on `example.com`, the IANA-reserved documentation domain, and
its text is author-written. No real publication is quoted or impersonated.

## Two ways to address a source

A claim cites a **cell**, not a line:

```js
source: 'stats:completion-table.csv#name=Ashfall%20Reach&field=pct_earned_final_achievement',
quote: '4.1',
```

Or a **field in a nested document**:

```js
source: 'stats:catalog/games.json#path=1.has_tutorial',
quote: 'true',
```

Or a **passage in a captured page**:

```js
source: 'web:https://example.com/notes/first-hour-retention',
quote: 'the strongest single predictor of completion was the share of owners who earned the second achievement',
```

Three addressing schemes, one verification machinery. That is the whole reason the
adapter interface exists.

## STALE, with no network

This is the part people do not believe until they see it.

`groundtruth.lock.json` pins the records source to a content hash. Two cells in
`completion-table.csv` have changed since. Two captures of the page sit in
`snapshots/`, and the newer one withdraws the sentence the article quotes.

So the tool reports:

```
! ground.stale  article/nobody-finishes-these.md:38
  the page no longer contains this quote: was present, now absent
```

No request was made. Drift is a comparison between what the pin says and what the
files say now, and both sides are on disk.

A drifted claim does **not** also report `quote-not-found`. That would be the same
fact stated less usefully, and it would bury the date range that matters.

## The contradiction is between two of your own records

`catalog/games.json` says Harrow Line has a tutorial. The `note` column of the CSV
says it does not. The article picked one.

That is the most realistic failure in any of the three examples. It is not a
writing mistake, it is a data-hygiene mistake that produced a writing mistake, and
the fix is to reconcile the records before touching the prose.

## The image checks

Three images, three different states, on purpose:

| Image | State | Finding |
|---|---|---|
| `completion-vs-length.svg` | present, real alt text | none |
| `second-achievement-drop.svg` | present, alt text reads `chart` | `read.alt-generic` blocks |
| `first-hour-funnel.png` | referenced, not on disk | `read.image-missing` blocks |

Both SVGs are drawn by a committed script from the committed CSV, so the picture
cannot disagree with the data by accident.

## Which modules are on

| Module | State | Why |
|---|---|---|
| Grounding | **on** | Two adapters, six of the seven verdicts |
| Readability and images | **on** | The image checks are half the lesson |
| SEO and AEO | off | A personal blog post with no search-intent target |

## What this example teaches that the other two do not

Cell-level and field-level addressing. Two adapters cooperating on one document.
STALE derived offline from a content hash and from a second capture. And the image
checks, including the number-conflict rule.
