# Ref grammar and locators

One grammar for every source type:

```
<sourceId> ':' <path> [ '#' <fragment> ]
```

The `sourceId` is the `id` of a source declared in `groundtruth.config.mjs`. A bare
`https://` ref with no prefix routes to a declared `web` source if there is one, and
otherwise is link-only, which means the verdict has to be `EXTERNAL`.

## local, a folder of files

```js
source: 'notes:Bosses/Malenia.md',
source: 'notes:Bosses/Malenia.md#L212',   // a hint, never trusted over the search
quote:  'The attack consists of three flurries.',
```

Located per line first, then by a 2, 3, 4 and 6-line sliding window, so a quote that
wraps still matches. A path resolving outside the source root is refused.

## git, a repository at a pinned commit

```js
source: 'engine:scene/main/viewport.cpp',
quote:  'if (!is_inside_tree()) {',
```

Needs a pin, and refuses to read a moving branch tip without one, because a quote
checked against a moving target is not checked. Pin with:

```bash
npx @highnessatharva/groundtruth resolve --refresh
```

The permalink is `https://<host>/<repo>/blob/<sha>/<path>#L<line>`. When the line
cannot be confirmed it degrades to the file, so a reviewer is never sent to a line
that might be the wrong one.

## web, a page that will change

```js
source: 'web:https://example.com/notes/retention',
quote:  'Snowflake checks warehouse activity every 60 seconds.',
```

Captured to a text file under `snapshotDir` with a header carrying the URL, the
capture time and a content hash. The capture is committable, so a reader a year later
can still check the quote after the page has moved on.

A missing capture during a plain `check` is an error naming the command to run, never
a silent skip.

## records, a table of facts

Addresses a cell, not a line.

```js
// one row, one field
source: 'specs:weapons.csv#name=Rivers%20of%20Blood&field=weight',
quote:  '10.0',

// a field in a nested document
source: 'specs:catalog/games.json#path=1.has_tutorial',
quote:  'true',

// the file itself, when the claim is about the table rather than a cell
source: 'specs:weapons.csv',
quote:  'name,weight,damage',
```

The fragment is a URL-encoded query: any number of `column=value` selectors plus one
`field=`. With a `key` column configured you can shorten a single selector to
`#Rivers of Blood&field=weight`.

Comparison is deliberately loose. `24.99` matches `$24.99`, and `4.9` matches
`4.9 hours`. Currency symbols, thousands separators, a trailing unit and case are all
trimmed. Refusing those is pedantry rather than verification.

## What every locator returns

A `confidence`, and it is worth reading:

- `exact` — the quote appeared verbatim.
- `normalized` — it appeared after folding whitespace, dashes and punctuation.
- `partial` — only a clause of it did, which is the honest answer when a quote was
  condensed from several lines.
- `none` — not found. The permalink degrades and the card says the line is
  unconfirmed.
