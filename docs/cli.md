[← back to the README](../README.md)

# CLI and report

## CLI reference

| Command | Blocking | Network | Mutates |
|---|---|---|---|
| `init` | no | no | config, `.gitignore`, `AGENTS.md` |
| `check [paths...]` | **yes** | no | span maps, only with `--fix-matches` |
| `report [paths...]` | no, or `--fail-on` | no | `reportDir` |
| `draft <path>` | no | no | a span map, with `--write` |
| `resolve [ids...]` | no | **yes** | cache, snapshots, lockfile with `--refresh` |
| `explain [id]` | no | no | nothing |

### Exit codes

| Code | Meaning |
|---|---|
| 0 | clean |
| 1 | blocking findings |
| 2 | usage error |
| 3 | config error |
| 4 | internal error |
| 5 | network needed and unavailable |

3 and 1 are different on purpose. CI can tell "the setup is broken" from "the content
is wrong" without parsing a message.

### Flags that matter

```bash
groundtruth check docs/one-file.md        # takes paths. not corpus-only
groundtruth check --changed               # only what this branch touched
groundtruth check --frozen                # refuse to verify at a moved pin. CI mode
groundtruth check --module readability    # repeatable, or comma separated
groundtruth check --offline               # fail rather than fetch
groundtruth check --fix-matches           # the only mutation check can perform
groundtruth check --json                  # stdout is pure JSON, chatter on stderr
groundtruth check --format github         # ::error annotations
groundtruth check --format sarif          # for code scanning
groundtruth report --open --fail-on error
groundtruth resolve --refresh engine      # re-pin one source by id
groundtruth resolve --offline             # audit cache coverage, fetch nothing
```

`--json` writes one object to stdout and nothing else, which is what makes
`groundtruth check --json | jq` work inside a hook.

---

## The report

```bash
npx @highnessatharva/groundtruth report
```

One self-contained HTML file per document plus an index. CSS and JS inlined, data in a
JSON script tag. **No fetch, no CDN, no fonts, no framework.** It opens from a file
path and survives being emailed. A test asserts no remote `src` or `href` appears
anywhere in a rendered page.

The page is a critical edition: your prose, with an apparatus recording what each claim
rests on.

- **Annotations underline rather than highlight.** A background wash on forty bound
  claims is a wall of highlighter and the prose stops being readable, which defeats
  showing it in prose at all. Only the two blocking verdicts carry a wash, which makes
  them *more* visible.
- **Colour is OKLCH and solved rather than eyeballed.** In HSL, `hsl(100 80% 50%)` and
  `hsl(248 80% 50%)` state the same lightness and look nothing alike, so an amber
  verdict read as more urgent than a blue one for no reason. Twenty tests recompute
  every contrast ratio from the token values, so a token that stops clearing its
  threshold fails the suite.
- **Nothing scrolls sideways**, and it is fixed properly rather than with
  `overflow-x: hidden` on the root.
- Light and dark, with the theme applied before first paint.
- Hover a claim for the verdict, the quote, the source and a link to it. Tab walks the
  marks, click pins a card, Escape closes.

It renders through the same parse tree the checker walked. A second parser would let a
span verify in `check` and fail to highlight in `report` with no error anywhere.

---

