# p-limit: code quoted at a pinned commit

All three modules on. The only example where a reader can check a quote in one
click, because every code claim links to a line on GitHub at an exact SHA.

```bash
npx @highnessatharva/groundtruth check
npx @highnessatharva/groundtruth report
```

**It fails on the first run, on purpose.** Six blocking findings. `WALKTHROUGH.md`
clears them one at a time, and step 5 breaks two more on purpose to show STALE.

## What the article is

*How p-limit works, one counter and one queue.* `p-limit` is one file that sits in
almost every Node dependency tree. The piece reads the whole thing at one commit,
explains the counter and the queue, then names the three ways people break it.

Twelve claims are bound to that file. Eleven hold. One is contradicted by the code
it cites, and that one is the point of the example.

## Nothing is vendored

`sources/PINNED.md` has the detail. The `git` adapter fetches `index.js` over plain
HTTPS at the SHA in `groundtruth.lock.json`. No `gh` CLI, no `git` binary, no token
for a public repo, and one API request per source per refresh rather than one per
file.

The fetched content is cached by content address under `cache/`, and that directory
is committed. So the first run needs a network and every run after it does not,
including a run on a fresh clone.

## The claim the tool caught

The article says:

> Tasks resolve in the order they were queued.

That is wrong, and the code it cites proves it. Each call resolves when its own
task settles, so completion order follows duration. Only the `map` helper preserves
input order, and it does that with `Promise.all` rather than with the queue.

The finding carries `fix.kind: "decision"`. The tool will not guess whether the
prose or the note is wrong, and that refusal is deliberate: it is what stops an
agent confidently rewriting a true sentence to match a bad record.

## What blocks on the first run

| Finding | Kind | Why it is here |
|---|---|---|
| `seo.len-meta` | rewrite | 226 characters against a 165 cap, so it truncates in the results page |
| `seo.faq-present` | rewrite | No FAQ block, so no FAQPage structured data can be generated |
| `seo.fence-language` | edit | One untagged fence, which search and answer engines skip |
| `seo.h2-vague` | rewrite | A heading reading "Conclusion" carries no query |
| `ground.verdict` | decision | The contradicted claim above |
| `ground.verdict` | source | "Most teams set the limit to the number of CPU cores", with nothing behind it |

All four `fix.kind` values appear in that list, which is the whole vocabulary an
agent needs: apply a patch, write prose, go find a record, or stop and ask.

## Which modules are on

Grounding, readability, and SEO with AEO. Every one.

The SEO profile uses the `longform` preset with three thresholds moved, because
this is a 750-word explainer and not a 2,500-word guide. That is the intended way
to disagree with a preset: change the number, do not fork the file.

```js
seo: {
  enabled: true,
  preset: longform,
  overrides: { bodyWordsMin: 900, h2Min: 5, secondaryMin: 3 },
}
```

## Run one module at a time

Grounding is the expensive part to author. You do not have to adopt it to get value
from the other two:

```bash
npx @highnessatharva/groundtruth check --module readability --module seo
```

That covers the no-span-map case without needing a fourth example, and it is the
most important structural fact about the tool: adopt one module and ignore the
other two.

## What this example teaches that the other two do not

The `git` adapter and line-anchored permalinks. STALE caused by code moving rather
than by data changing. The full SEO and AEO module, including which checks block and
which stay advisory. And the `--module` escape hatch.
