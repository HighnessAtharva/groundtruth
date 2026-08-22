---
name: groundtruth-authoring
description: Write prose that clears the groundtruth readability and SEO rules on the first run. Use when drafting or editing any document in a project that contains a groundtruth.config.mjs, when asked to write an article, a guide, a README or documentation in such a project, or when a run reports read.hard, read.alt-generic, seo.h2-vague, seo.aeo-preamble or any other readability or SEO finding.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---

# Writing to clear the gate

Read the project's `groundtruth.config.mjs` first. Which modules are on decides
which of the sections below apply, and a project with SEO off does not want an FAQ
block bolted onto an essay.

## The shape that passes

**Answer before the first H2.** Everything before the first `##` is the passage an
answer engine lifts. It must exist and it must answer, not announce.

```markdown
# How to profile a slow query

To profile a slow query, run it once and open the plan.   <- answers
In this article we will look at profiling.                <- fails aeo-preamble
```

**Headings carry a query.** "Conclusion", "Key takeaways", "Why it matters" and
"Final thoughts" all fail, because none of them is a thing anybody searches for.
Write what the section concludes.

**No colon in a heading.** A colon splits it into a label and a subtitle, and the
label is the half that gets lifted.

**Every code fence gets a language.** An untagged fence is skipped by search and
answer engines and cannot be highlighted.

**One H1, no depth skips.** H2 to H4 breaks the outline a crawler and a screen
reader both build.

**An FAQ block when SEO is on.** A heading matching `### Frequently asked`, then
`**A real question?**` and an answer. FAQPage structured data is generated from it.
Write questions somebody would type. If you cannot think of real ones, the article
does not need the block and the project should turn that check off.

## Keyword placement, four slots

Title, meta description, opening passage, and at least one H2. Matching is "all the
words, in order", not the exact string, so a title reading "Why is my model slow?"
counts for the keyword "model slow".

Four slots and no more. **Density is never gated** and you must not pad prose toward
a percentage. The rule exists as an advisory number and cannot block.

## Sentences

The scorer is not a reading grade. It weighs ten signals a writer can act on, and
`fix` names the dominant one. Fix that one thing.

- Over 22 words starts costing. Two sentences beat one with a comma in the middle.
- Passive voice costs the most of any single signal. Name the thing doing the work.
- Two independent clauses welded with a comma and "and" is one full stop away from
  being right.
- An opener that holds the subject back ("For the window you pick, ...") costs
  something. Lead with the subject.
- A runway costs something. "That tells you X" is X.
- **An enumeration is free.** Three or more short items in a list count as one clause
  break, by design. Do not break up a list to satisfy the scorer.

## Images

- Alt text describes the picture. "chart", "screenshot 2" and "figure" all fail.
- Every referenced image must exist on disk before you finish.
- A number in prose that disagrees with a number in an image's own description gets
  flagged. When you regenerate a chart, reread the sentence under it.
- The tool always says images need a human pass, because it reads alt text and not
  pixels. That finding is honest and is not something to fix.

## Claims

If grounding is on, every factual sentence you write needs a source. Two options and
both are fine:

1. Bind it. See the `groundtruth-span-maps` skill.
2. Do not make the claim. A sentence about walking survives without an invented
   completion-time figure.

**Never invent a specific.** A number, a version, a price, a customer or a quote that
no opened file supports is worse than the vague sentence it replaced, because an
invented specific reads credible and a reader cannot catch it.

## Checking as you go

```bash
npx @highnessatharva/groundtruth check <path>
npx @highnessatharva/groundtruth explain read.hard
```

Fix while the document is open, not at the end. A finding costs a minute now and an
argument later.
