# groundtruth

## Product purpose

Bind every factual claim in a document to a verbatim quote in a real source, then
fail a build when the binding breaks.

The problem it solves is narrow and specific. A number lands in paragraph nine of
an article. Six months later the source it came from changed, or the sentence
around it got edited, and nobody rechecked. Nothing in a normal toolchain can see
that. A spell checker cannot. A linter cannot. A human rereading their own work
cannot reliably, because the sentence still reads fine.

The tool does not check that a claim is true. It checks that a claim is anchored.
That distinction is the whole product and it is stated everywhere, because a tool
that overpromises here would be worse than no tool.

## Register

product

The design serves the work. Nobody opens this report for pleasure. They open it
because they are about to publish something and want to know which sentences they
cannot stand behind.

## Users

**The writer, rereading.** Has forty claims in a 2,500-word piece and needs to
find the two that are wrong. Reads the prose top to bottom. Cares that the
annotations do not make the prose harder to read.

**The reviewer, spot-checking.** Did not write the piece. Wants to click one
highlight, see the quote, follow the link to the source, and decide whether to
trust the author. Never reads the whole thing.

**The agent, fixing.** Reads `--json`, not HTML. Needs to know which findings
block and which of them it is allowed to act on alone.

**The maintainer, six months later.** Wants to know how stale the report is
before trusting a single line of it.

## The scene

A writer at a desk, mid-afternoon, in a room with a window, reading their own
article for the third time, looking for the two claims out of forty that are
wrong.

That scene forces light as the default. The primary act is sustained reading of
long prose, and long prose reads better on paper-like ground. Dark mode is real
and complete, because plenty of people work dark, but it is the second answer and
not the first.

## Tone

Plain, specific, unhedged. The tool tells you what is wrong, where, and what to
do about it. It never says "consider reviewing this section". It says which
sentence and which of two things has to change.

It admits its limits out loud. A text checker cannot read pixels, so it says so
once per document rather than pretending the images are checked.

## Anti-references

**A dev-tool dashboard.** Dark navy, neon accents, a row of big-number metric
tiles, a sparkline nobody reads. This is the category reflex and it is wrong here,
because the content is prose and the reader is reading.

**A traffic-light linter.** Rows of red and green dots with terse codes beside
them. It scores well on density and badly on the actual job, which is reading a
sentence in context and deciding whether it holds.

**A syntax highlighter.** Every annotated phrase in a saturated block of color.
On a page with forty bound claims that produces a wall of highlighter and the
prose stops being readable, which defeats the purpose of showing it in prose at
all.

**A grammar checker's suggestion popover.** Cheerful, rounded, full of soft
recommendations. This tool is making a claim about evidence, not a suggestion
about style.

## Strategic principles

1. **The prose is the content.** Every annotation is apparatus around it. If the
   annotations compete with the text for attention, the design has failed.
2. **A blocking problem must be visible without hovering.** A skimmer scrolling
   the page should be able to point at the two sentences that fail.
3. **Never invent confidence.** A quote the tool could not locate says so, and the
   link degrades to file level rather than pointing at a line that might be wrong.
4. **One file, no network.** The report opens from a file path, survives being
   emailed, and fetches nothing. That constraint is a feature and it is not
   negotiable for aesthetics.
5. **Legible before pretty.** This page gets read at length by someone who is
   tired. Contrast and measure win every argument against decoration.
