[← back to the README](../README.md)

# FAQ, limits and prior art

## Prior art, and why this exists

| Tool | Does well | Does not do this |
|---|---|---|
| **Vale** | Style and terminology at scale, excellent config model | No concept of a source. It checks how you wrote, never what you wrote it from |
| **textlint / markdownlint** | Structure, syntax, huge plugin ecosystems | Same. No claim, no source, no verdict |
| **write-good / Hemingway** | Quick prose feedback | Readability only, and syllable-driven, which is wrong for technical prose |
| **An LLM fact-checker** | Catches things a rule never will | Non-deterministic, unauditable, costs money per run, and cannot fail a build reproducibly |
| **Zotero / BibTeX** | Bibliography management, citation formatting | Binds a document to a *work*, not a sentence to a *quote*. Nothing verifies the quote is in there |
| **Footnotes** | Universally understood | A convention, not a check. Nothing notices when the target changes |

The gap all six share: **none of them binds a claim to a locatable quote in a versioned
source and fails a build when either side moves.**

That is the whole scope of this tool. The readability and SEO modules exist because the
parse tree was already there, not because the world needed another linter.

The mechanism is extracted and generalized from a working system: 2,584 spans across
108 articles, 0 failed matches, 2,314 line-anchored permalinks across seven
repositories. What is new here is that it is not welded to one website, one company's
repositories, or one hardcoded absolute path.

---

## Limits

Read this part.

**It cannot tell you the source is true.** A wrong source quoted correctly passes. This
is provenance, not fact-checking, and conflating the two would be the dishonest version
of this tool.

**It cannot check an inference.** `INFERRED` records that you did arithmetic and asks
you to write down what you did. Nobody verifies the arithmetic.

**It cannot read pixels.** It reads alt text, filenames and data labels. It says so
once per document rather than pretending otherwise.

**It cannot see a hedge or sarcasm.** "Some people claim X" and "X" look the same to a
substring matcher.

**A claim split across two sentences needs two spans.** A match cannot cross a block
boundary.

**English only.** The sentence splitter, the passive-voice guard and the nominalization
pattern are all English-specific.

**No PDF, no DOCX, no HTML input.** Markdown in, and the `web` adapter converts HTML to
text for quote location only.

**Span maps are executable code.** That is what buys the constants, and it means a span
map from an untrusted contributor is code review.

**Authoring is real work.** A 2,000-word article is thirty spans. `draft` gets you the
candidates, but a person or an agent still has to find each quote. If that cost is too
high for your project, run readability and SEO and skip grounding. That is a supported
configuration and the examples show it.

---

## FAQ

**Does this call an LLM?** No. Zero network calls except `resolve`, which fetches your
declared sources and nothing else. No telemetry.

**Will it slow my build?** See [Performance](#performance). `--changed` keeps it
proportional to what you touched.

**Can I use one module and ignore the others?** Yes, and that is the intended path.
`check --module readability` needs no sources, no span maps and no authoring.

**Why not YAML for span maps?** Constants. One real span map names its sources once at
the top and builds thirty spans from them. YAML anchors can do that but read worse, and
`.mjs` needs no parser at all.

**What if the source is behind a login?** The `web` adapter cannot log in. Capture the
page yourself and write the snapshot file, or use `local` on an export.

**Can two documents share a span map?** No, and a run that finds two maps claiming one
document names both files.

**Why does an advisory rule exist if it cannot block?** Because it is worth seeing and
not worth failing on. The report shows every one, and a person decides.

**How do I turn a rule off?** `severity: { 'read.hard': 'off' }`. A rule set to `off`
never executes, so turning it off also removes its cost.

**Is `--fix-matches` safe?** It only applies a patch the tool judged exact, only when
one candidate scores above 0.82 with nothing else above 0.6, and the replacement is
always a real substring of your document. It prints the diff and re-runs.

**Does it work on Windows?** It was built on Windows. All paths resolve from the config
file, CRLF input produces identical output to LF, and no shell-out is required except
optional `git` for `--changed`.

---

## Performance

Reproduce these yourself. `npm run bench` generates the corpus and times the runs, so
the numbers here are measured rather than remembered.

**200 documents, 104,200 words, 400 spans:**

| Run | Time | Per document |
|---|---|---|
| `check --module readability` | 0.85s | 4.2ms |
| `check --module seo` | 0.88s | 4.4ms |
| `check --module grounding` | 1.15s | 5.8ms |
| `check`, all three | 1.6s | 7.8ms |
| `check` one document | 0.29s | mostly Node startup |
| `report` | 2.2s | 11ms |

Node's startup and module loading is about 130ms of any run, which is why a
single-document check looks expensive per document and is not.

Two optimisations are worth knowing about, both found by profiling this corpus:

- **Span maps load concurrently.** Loading them one at a time cost 2.25ms each, a
  quarter of the whole run.
- **A pin is only computed when there is something to compare it against.** The local
  adapter was hashing every file in the source folder on every `check`, for a pin that
  no lockfile entry existed to diff.

The parse happens once and every module reads it. A module that is off is never
imported, so a readability-only config compiles no SEO regexes and globs no span maps.
Grounding after the first `resolve` is pure disk reads from a content-addressed cache,
which is why an offline run is the same speed as an online one.

### Report size

The report inlines its stylesheet and script into every page, so a single page can be
shared on its own. Above 25 pages that duplication stops being worth it, so shared
`report.css` and `report.js` are written instead and each page links them. Still no
network either way, and the run says which it chose.

On the 200-document corpus that is 2.5MB rather than 8.9MB. Force it with
`report: { assets: 'inline' | 'linked' }`.

---

## Stability

Semver covers: the `--json` `schemaVersion` and finding shape, rule ids, config keys,
verdict names, exit codes, the adapter interface, and the `defineRule` contract.

Semver does not cover: the HTML markup, the report layout, CSS class names, the SEO
score formula, or the exact wording of a message.

Releases are published from CI with [npm provenance](https://docs.npmjs.com/generating-provenance-statements),
so every version on npm carries a verifiable attestation linking the tarball to the
commit and the workflow run that built it. [RELEASING.md](../RELEASING.md) is the procedure.

---

