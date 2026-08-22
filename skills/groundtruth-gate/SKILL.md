---
name: groundtruth-gate
description: Run the groundtruth gate, read its output, and fix what blocks. Use when a `groundtruth check` run exited non-zero, when the user says make it pass, why is this failing, what is blocking, or fix the findings, or when you see a `.groundtruth/result.json`, a groundtruth SARIF file, or a Stop hook message naming blocking findings. Also use before finishing any edit to a document in a project that has a groundtruth.config.mjs.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---

# The gate

## Triage, in order

```bash
npx groundtruth check --json
```

1. `summary.blocking`. Zero means done. Stop.
2. Every finding with `blocking: true`, in the order they come back.
3. Only then anything with `blocking: false`.

**Never derive blocking from severity.** It is precomputed and it already accounts
for the project's config, its profiles, and whether the rule is even allowed to
block. Deriving it yourself is how an agent ends up fixing advisory nits while a
real error sits untouched.

**Never fix an advisory finding to make a number go up.** An advisory rule has no
right answer. That is why it cannot block.

## Exit codes

| Code | Meaning | What to do |
|---|---|---|
| 0 | clean | Finish |
| 1 | blocking findings | Fix them |
| 2 | usage error | Read the message, fix the command |
| 3 | config error | The setup is wrong, not the content. Do not touch the documents |
| 4 | internal error | Report it. Do not work around it |
| 5 | network needed and unavailable | Run `npx groundtruth resolve`, or accept the offline limit |

3 and 1 are deliberately different. A broken config and a bad claim are not the
same problem and must not be treated the same way.

## Act by `fix.kind`, not by rule

**`edit`** — `fix.patch` carries an exact `find` and `replace`. Apply it verbatim.
There are no fuzzy patches, so an absent patch means the tool was not certain.

**`rewrite`** — produce prose. Read `fix.instruction`, then read the sentence in
context before touching it. A shorter sentence that says less is not a fix.

**`source`** — find or add a record. This is research. If nothing supports the claim,
**cutting the sentence is a correct answer** and frequently the right one.

**`decision`** — stop and ask the user. Present both sides and let them choose. Do
not pick. This value exists precisely to stop you rewriting a true sentence to match
a bad record.

## The commands

```bash
npx groundtruth check <path>              # one file, not the corpus
npx groundtruth check --changed           # only what this branch touched
npx groundtruth check --json              # stdout is pure JSON, chatter on stderr
npx groundtruth check --fix-matches       # repair desynced span matches
npx groundtruth check --frozen            # CI: refuse to verify at a moved pin
npx groundtruth check --module readability --module seo   # skip grounding
npx groundtruth check --format sarif      # for a code-scanning upload
npx groundtruth report                    # the HTML, non-blocking
npx groundtruth explain <rule>            # why this rule exists
npx groundtruth resolve                   # the only networked command
```

## The findings you will see most

**`ground.match-not-found`** — a span map points at text that has been edited. The
finding carries the nearest sentence and a score. If `fix.patch` is present, apply it
or run `check --fix-matches`. If not, two candidates scored close and a person has to
pick.

**`ground.verdict` with `CONTRADICTED`** — `fix.kind` is `decision`. Read the quote
and the claim, then ask.

**`ground.verdict` with `UNSOURCED`** — `fix.kind` is `source`. Find a source or cut
the sentence. Do not change the verdict.

**`ground.stale`** — the source moved. Warns rather than blocks. Decide whether the
claim follows the source or the pin stays put, then either edit the claim or run
`resolve --refresh` and commit the lockfile.

**`seo.*`** — a mechanical one blocks and has one right answer. An advisory one is
tagged `advisory` and cannot block, whatever it reports.

**`read.hard`** — a sentence the scorer rates hard. `fix.instruction` names the
dominant reason. Fix that one thing, not all of them.

## Before you say you are done

```bash
npx groundtruth check --changed
```

Exit 0, or a clear statement of what is left and why it is the user's call. Never
report success while `summary.blocking` is above zero.

## Never do these

1. Never edit a source record to make a claim pass.
2. Never change a verdict to silence a finding.
3. Never resolve a `decision` finding yourself.
4. Never add `allowAdvisoryGates` or a `severity` override to quieten a rule you
   were asked to fix.
5. Never delete a span map, or a span, instead of fixing it.
6. Never claim a run is clean without reading `summary.blocking`.
