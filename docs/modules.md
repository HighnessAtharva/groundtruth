[← back to the README](../README.md)

# The modules

## The mental model

Four words, in order.

**Claim.** A verbatim substring of your document. Not a paraphrase, not a line number,
not a section. The exact characters a reader sees.

**Quote.** A verbatim substring of a source. The words that actually support the claim.

**Source.** Something that can be *pinned*, *fetched*, and *searched*. A folder on
disk, a repository at a commit, a captured web page, a table of records. See
[Sources](configuration.md#sources).

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

