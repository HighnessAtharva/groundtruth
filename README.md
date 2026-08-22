<p align="center">
  <img src="https://raw.githubusercontent.com/HighnessAtharva/groundtruth/main/docs/assets/banner.svg" alt="groundtruth" width="820">
</p>

<p align="center">
  <a href="test/"><img src="https://img.shields.io/badge/tests-203-brightgreen" alt="tests"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/runtime%20deps-1-brightgreen" alt="runtime dependencies"></a>
  <a href=".nvmrc"><img src="https://img.shields.io/badge/node-%E2%89%A520.11-blue" alt="node 20.11 or later"></a>
  <a href="https://www.npmjs.com/package/@highnessatharva/groundtruth"><img src="https://img.shields.io/npm/v/@highnessatharva/groundtruth?color=blue" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
</p>

<p align="center">
  <b><a href="#try-it-in-two-minutes">Quick start</a></b> ·
  <b><a href="#what-you-get">Screenshots</a></b> ·
  <b><a href="#how-it-works">How it works</a></b> ·
  <b><a href="docs/walkthrough.md">Walkthrough</a></b> ·
  <b><a href="docs/configuration.md">Config</a></b> ·
  <b><a href="docs/cli.md">CLI</a></b>
</p>

---

## The problem in one paragraph

A number lands in paragraph nine of an article. Six months later the source changed, or
the sentence around it got edited, and nobody rechecked. No normal tool can see that. A
spell checker cannot. A linter cannot. A person rereading their own work cannot, because
the sentence still reads fine.

groundtruth makes the link explicit and machine-checkable. Next to each claim you record
the source it rests on, plus the exact words in that source that support it. The tool
refuses a claim it cannot find in your document. It refuses a quote it cannot find in the
source. Then it fails your build when either side moves.

**What a skeptic needs to hear:** this checks that a claim is *anchored*, not that a claim
is *true*. A wrong source you quoted correctly still passes. What you get is one page that
shows every sentence in your document resting on nothing.

---

## What you get

### One command in CI, and a real reason for the failure

<p align="center"><img src="https://raw.githubusercontent.com/HighnessAtharva/groundtruth/main/docs/assets/cli-check.svg" alt="groundtruth check failing on a contradicted claim and an unsourced claim" width="820"></p>

### An HTML report of the article, annotated claim by claim

Every checked sentence is underlined. The sidebar counts the verdicts, scores the SEO gate,
and lists every finding with the fix.

<p align="center"><img src="https://raw.githubusercontent.com/HighnessAtharva/groundtruth/main/docs/assets/report.png" alt="The HTML report: the article on the left with claims underlined, verdict counts and findings on the right" width="880"></p>

### Hover any claim to see the source and the verbatim quote

This claim says three doors. The source says four. The build stops.

<p align="center"><img src="https://raw.githubusercontent.com/HighnessAtharva/groundtruth/main/docs/assets/report-claim.png" alt="A contradicted claim showing its source link, the verbatim quote and the author note" width="880"></p>

### Dark theme, and it works offline from a file

<p align="center"><img src="https://raw.githubusercontent.com/HighnessAtharva/groundtruth/main/docs/assets/report-dark.png" alt="The same report in dark theme" width="880"></p>

---

## Try it in two minutes

Node 20.11 or later. One runtime dependency, `yaml`, which has none of its own.

```bash
npm install --save-dev @highnessatharva/groundtruth
npx @highnessatharva/groundtruth init
```

`init` reads your repo, writes a config with only the modules you asked for, and prints the
one command to run next. Run it twice and the second run writes nothing.

<p align="center"><img src="https://raw.githubusercontent.com/HighnessAtharva/groundtruth/main/docs/assets/cli-init.svg" alt="groundtruth init writing a config, an AGENTS.md and a gitignore patch" width="560"></p>

**Start with readability.** It needs no sources and no authoring, and it finds something in
almost every document. Add grounding once you know what you would cite.

The package is scoped, and the command it installs is `groundtruth`. npm refused both
`groundtruth` and `groundtruth-cli`, because its similarity guard strips punctuation before
comparing, and two unrelated packages already hold `ground-truth` and `ground-truth-cli`.

<details>
<summary>Work from a clone instead</summary>

```bash
git clone https://github.com/HighnessAtharva/groundtruth
cd groundtruth && npm install && npm link
cd /your/project && groundtruth init
```
</details>

---

## How it works

Four words, in order. **Claim**, the sentence in your document. **Source**, the thing it
rests on. **Span**, the record that binds one to the other. **Verdict**, your judgement of
that binding.

<p align="center"><img src="https://raw.githubusercontent.com/HighnessAtharva/groundtruth/main/docs/assets/how-it-works.svg" alt="A claim in the document, a span map naming the source and quote, the source file, two exact-match tests, and the verdict that sets the exit code" width="900"></p>

You never edit the document to add a claim. The binding lives in a separate span map file,
so your prose stays clean markdown. Two exact-match tests run on every check: the match
string must still appear in the document, and the quote must still appear in the source.

Read the full model in [docs/modules.md](docs/modules.md).

---

## The three modules

Each one is independently optional. Turn on what you want.

| Module | What it gates | Needs sources |
|---|---|---|
| **grounding** | Every claim binds to a verbatim quote in a real source | yes |
| **readability** | Sentence-level scoring, clause load, passive voice, image checks | no |
| **SEO and AEO** | Titles, meta, headings, snippets, and answer-engine structure | no |

The last two ride along because the same parse tree makes them nearly free.

Details for each: [docs/modules.md](docs/modules.md).

---

## See it working, offline

Three examples. All of them fail on the first run on purpose, because a green example
teaches nothing.

| Open | What it shows | Modules |
|---|---|---|
| [`examples/resident-evil`](examples/resident-evil) | The smallest setup. Sources you wrote yourself | grounding |
| [`examples/steam-completion-rates`](examples/steam-completion-rates) | A table checked cell by cell, a cached page, a claim going stale | grounding, readability |
| [`examples/plimit-concurrency`](examples/plimit-concurrency) | Code quoted at a pinned commit, plus the full SEO gate | all three |

Each ships `expected/report.html`, so you can open the output in a browser straight from
the clone. No install needed.

```bash
git clone https://github.com/HighnessAtharva/groundtruth
cd groundtruth && npm install
npm run test:examples
```

<p align="center"><img src="https://raw.githubusercontent.com/HighnessAtharva/groundtruth/main/docs/assets/cli-examples.svg" alt="All three examples reproducing their expected findings" width="600"></p>

---

## Every rule explains itself

No rule ships without a reason you can read at the terminal.

<p align="center"><img src="https://raw.githubusercontent.com/HighnessAtharva/groundtruth/main/docs/assets/cli-explain.svg" alt="groundtruth explain printing what the ground.verdict rule measures and why it blocks" width="720"></p>

---

## Docs

| Page | What is in it |
|---|---|
| [Walkthrough](docs/walkthrough.md) | One paragraph, three claims, from nothing to a passing gate |
| [The modules](docs/modules.md) | The mental model, and what each module checks |
| [Configuration](docs/configuration.md) | Config keys, sources, span maps, and the rule list |
| [CLI and report](docs/cli.md) | Every command, flag, exit code, and what the report holds |
| [Agents, CI and extending](docs/integrations.md) | The Claude plugin, GitHub Actions, custom rules, presets |
| [FAQ and limits](docs/faq.md) | Prior art, honest limits, performance, stability promise |

---

## Contributing

```bash
npm install
npm run test:all
```

A rule needs an `explain` that says why it exists. It needs `mechanical: false` unless it
has exactly one right answer a script can compute. A colour needs a test in
`test/contrast.test.mjs`. An example needs to fail on its first run.

## License

MIT
