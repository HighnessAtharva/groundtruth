[← back to the README](../README.md)

# Agents, CI and extending

## Agents

```
/plugin marketplace add HighnessAtharva/groundtruth
```

| Skill | Fires on |
|---|---|
| `groundtruth-span-maps` | authoring or repairing a map, or a grounding finding |
| `groundtruth-gate` | a non-zero exit, or "make it pass" |
| `groundtruth-authoring` | drafting prose in a project that has a config |

Four commands: `/groundtruth:check`, `/groundtruth:ground`, `/groundtruth:explain`,
`/groundtruth:init`.

One `Stop` hook that blocks finishing while `summary.blocking > 0`, naming each file,
rule and fix. It runs `--changed`, so it stays fast enough that nobody turns it off.

One subagent, `groundtruth-verifier`. Grounding a 2,000-word article is fifty to a
hundred tool calls of search that become dead weight the moment the map exists, so it
does that work elsewhere and returns four things: the map path, the verdict tally, the
claims it could not ground, and any source record it thinks is wrong.

[`AGENTS.md`](../AGENTS.md) carries the same contract in plain markdown for Codex and
Cursor.

### The output is designed for an agent

Two fields carry the weight.

**`blocking` is precomputed.** A consumer never derives it from severity plus config.
That is the single most common mistake an agent makes reading a linter: fixing advisory
nits while a real error sits untouched.

**`fix.kind` says whether the reader can act alone.**

| Value | Meaning |
|---|---|
| `edit` | An exact `find` and `replace` patch is attached. Apply it |
| `rewrite` | Produce prose. The tool cannot |
| `source` | Go find or add a record. This is research |
| `decision` | A person has to choose. Stop and ask |

A `CONTRADICTED` claim gets `decision`. That one value is what stops an agent
confidently rewriting a true sentence to match a bad source record.

There are no fuzzy patches. If the tool cannot produce an exact find and replace it
omits `patch` and lowers `confidence`.

```json
{
  "id": "GT-SEO-014",
  "rule": "seo.fence-language",
  "severity": "error",
  "blocking": true,
  "file": "article/counter-and-queue.md",
  "line": 47,
  "message": "Fenced code has a language: 1 untagged fence(s) at line 47",
  "why": "An untagged code fence is skipped by search and answer engines",
  "fix": { "kind": "edit", "instruction": "Add a language tag.", "confidence": "medium" }
}
```

---

## CI

Copy [`.github/workflows/example-project.yml`](../.github/workflows/example-project.yml).

```yaml
- uses: actions/checkout@v4
  with: { fetch-depth: 0 }        # --changed needs history for a merge base
- run: npx @highnessatharva/groundtruth check --changed --frozen
- if: always()
  run: npx @highnessatharva/groundtruth check --format sarif > groundtruth.sarif
- uses: github/codeql-action/upload-sarif@v3
  if: always()
  with: { sarif_file: groundtruth.sarif }
```

`--frozen` refuses to verify against a revision the lockfile does not name, so a build
cannot quietly pass against a newer source.

**The adoption path.** Do not turn everything on at once.

1. `check --module readability` on the whole repo, non-blocking, and read the report.
2. Move the rules you agree with to `error`. Leave the rest advisory.
3. `check --changed` as a blocking gate. New work is held to the bar, old work is not.
4. Add grounding to one document. Then one folder.
5. Blocking everywhere, once the corpus is clean.

---

## Extending it

Three extension points, all plain values in an ESM config. Nothing resolves by name,
nothing comes from `node_modules`, nothing needs publishing.

**A rule.** `defineRule({ id, module, mechanical, defaultSeverity, explain, run })`
pushed into `config.rules`. `run(ctx)` gets `{ doc, blocks, frontmatter, config,
profile, finding }`, where `blocks` has the same helpers the built-in rules use:
`prose()`, `citable()`, `headings(depth)`, `images()`, `links()`, `fences()`,
`opening(depth)`, `underHeading(re)`, `text()`.

Because `mechanical` is declared there, a custom rule participates in the
advisory-gate guard exactly like a built-in one.

**An adapter.** Any object with `id`, `owns`, `resolve`, `locate`, `permalink` and
`describe`. Optional `pin`, `usePin`, `bind`, `attachCache` and `drift`. A Notion,
Confluence, S3 or SQLite adapter is about 80 lines and lives in your repo.

```js
import myNotion from './gt-notion.mjs';
export default { sources: [myNotion({ id: 'notion', token: process.env.NOTION_TOKEN })] };
```

A missing method is refused by name at config load.

**A preset.** A plain object of thresholds. `overrides` merges over it, one level deep
into `costs`, `signals` and nested groups, so changing one number is two lines rather
than a fork.

---

## Presets

| Preset | Ships | What it is |
|---|---|---|
| `neutral` | **on** | Sentence shape, passive voice, filler, image checks. No word list, no punctuation opinion |
| `longform` | opt in | SEO thresholds for a 2,000 to 3,200 word guide |
| `shortform` | opt in | SEO thresholds for a 300 to 560 word note |
| `atharva` | opt in | A house style: 57 banned words, 40 banned phrases, no dash, no semicolon |
| `ste` | opt in | ASD-STE100 Simplified Technical English, the mechanical half |

The default is neutral because a tool that fails a video-game write-up on the word
"exciting" reads as broken to a stranger. The opinionated presets are complete worked
examples of what an opinion looks like here. Copy one, cut what you disagree with, keep
your version in your repo.

`ste` is honest about its scope. It implements the sentence caps, the finite-verb
requirement and the forbidden constructions. It does **not** implement the
approved-vocabulary rule, which is the heart of the standard and needs a person.
Anything claiming to enforce STE from a word list alone is overselling.

---

