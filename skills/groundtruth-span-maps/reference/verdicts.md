# The eight verdicts

Seven an author writes. One the tool derives.

| Verdict | Blocks | Requires | Means |
|---|---|---|---|
| `VERIFIED` | no | source, quote | The quote was found in the named source |
| `EXTERNAL` | no | source | A URL with nothing cached to check against |
| `FIGURE` | no | nothing | Read off a chart or a screenshot |
| `TODO` | no | nothing | Nobody has looked yet |
| `INFERRED` | no | note or derivation | Computed from records rather than quoted |
| `DOC-DEFECT` | no | source, note or derivation | The document is right and the source is wrong |
| `UNSOURCED` | **yes** | nothing | Somebody looked and found nothing |
| `CONTRADICTED` | **yes** | note or derivation | A named source disagrees with the document |
| `STALE` | no | derived | The source moved under a claim that used to hold |

## The distinctions that matter

**TODO against UNSOURCED.** TODO says nobody has assessed this claim. UNSOURCED
says somebody assessed it and found nothing. They are different facts and only one
of them blocks. `draft` writes TODO, so a scaffold does not fail on its own output.

**INFERRED against VERIFIED.** If you had to add, divide, filter or compare, it is
INFERRED and the `derivation` is mandatory. The derivation is the thing a reader has
to trust, so write it as a sentence naming the records and the operation:

```js
derivation: 'Four rows sit under six hours with a mean final rate of 34.0. Five rows sit over thirty with a mean of 11.6. The ratio is 2.9, which the prose rounds to triple. The filters and the arithmetic are mine, the twelve numbers are the table.',
```

**FIGURE against VERIFIED.** A number read off a picture is not verified, because
the tool cannot read pixels and neither did you, precisely. FIGURE records that
honestly. If the number is also in a data file, cite the file and use VERIFIED.

**DOC-DEFECT against CONTRADICTED.** Both mean the document and the source
disagree. DOC-DEFECT is the case where you have already decided the source is wrong
and the document is right. CONTRADICTED is the case where you have not decided. If
you are unsure, it is CONTRADICTED.

**CONTRADICTED and the quote.** The `quote` is what the **source** says. Not what
the document says. The whole point is to put the two side by side, and the document
half is already in `match`.

## STALE

Derived, never written. A span map naming it is rejected with an explanation, because
a claim cannot know it has gone stale.

Two mechanisms produce it:

1. A pinned revision moved and the quote is no longer where it was. `resolve --refresh`
   on a `git` source, then `check`.
2. A newer capture of a page no longer contains the quote, or a records file changed
   the cell a claim cites.

STALE warns rather than blocks, and that is deliberate. The claim was true when it
was written. Nobody made a mistake, and somebody now has to decide whether the claim
or the pin should follow.
