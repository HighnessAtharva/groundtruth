# Resident Evil: sources you wrote yourself

The smallest setup this tool supports. One module, one adapter, one loop.

```bash
npx @highnessatharva/groundtruth check
npx @highnessatharva/groundtruth report
```

**It fails on the first run, on purpose.** Two blocking findings and one warning.
A green example teaches nothing. `WALKTHROUGH.md` fixes them one at a time.

## What the article is

*The Spencer Mansion Runs on Keys.* The argument is that almost every moment of
tension in the 1996 original comes from an inventory slot you do not have rather
than a monster you cannot kill. It counts the doors, counts the slots, and shows
the famous backtracking is the direct consequence of a six-slot bag.

Eleven claims in it are bound to a source. Nine of them hold. Two do not.

## The source

`sources/mansion-notes/` holds 28 markdown fact sheets under `rooms/`, `items/`,
`doors/` and `characters/`. Each carries YAML frontmatter and a body of one fact
per line, because the line is the unit a claim quotes.

Every record was written by hand from a playthrough. Nothing was copied from a
wiki or a strategy guide. Two records carry `synthetic: true`, which means the
number in them is invented, and one of those inventions is what produces the
CONTRADICTED verdict. `sources/mansion-notes/PROVENANCE.md` says which and why.

This is the honest answer to "where do I get sources for a piece about a thing
that has no API". You write them, and then the tool holds you to them.

## What each verdict is doing here

| Claim | Verdict | Why |
|---|---|---|
| Jill carries eight inventory slots and Chris carries six | VERIFIED | The quote is verbatim in `characters/inventory-slots.md` |
| More locked doors on 1F than one character can open in a pass | INFERRED | A `derivation` names the records and the comparison. The counts are the records, the argument is the author's |
| The Armor Key opens three doors | **CONTRADICTED** | The item record says four, and four door records name it. The author's own notes disagree with the author's own sentence |
| Most players finish a first run in about nine hours | **UNSOURCED** | Nothing in the folder supports it. Find a source or cut the number |
| Shinji Mikami directed the 1996 original | EXTERNAL | A link with nothing local to check against, and the tool says so rather than pretending |

## Which modules are on

| Module | State | Why |
|---|---|---|
| Grounding | **on** | The whole point of this example |
| Readability and images | off | So the report shows one thing at a time |
| SEO and AEO | off | This is an essay, not a page competing for a query |

Turning two of three off is the point. The modules are independent, and this is
the proof.

## What this example teaches that the other two do not

The local folder adapter, and the shape of a source you author yourself. It is
also the only example where the source has no version, no URL and no timestamp,
which is the case for most personal knowledge bases.

And it teaches the CONTRADICTED path in its purest form. The tool is not telling
you the writing is bad. It is telling you that two things you wrote disagree, and
it will not guess which one is wrong.

## Look before you install

`expected/` holds a committed copy of the report this example produces. Open
`expected/report.html` in a browser and you can see the output without running
anything.
