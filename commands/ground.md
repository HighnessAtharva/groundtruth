---
description: Build a span map for a document that does not have one yet
argument-hint: "<path>"
allowed-tools: Bash, Read, Edit, Write, Grep, Glob
---

Ground `$ARGUMENTS`.

1. Scaffold the candidates:

```bash
npx groundtruth-cli draft $ARGUMENTS --write
```

2. Read `groundtruth.config.mjs` for the declared sources, then read the sources
   themselves. Do not guess what they contain.

3. For every span in the scaffolded map, follow the `groundtruth-span-maps` skill:
   name the source, paste the quote verbatim, set the verdict. Delete any span that
   is not actually a claim.

4. Verify:

```bash
npx groundtruth-cli check $ARGUMENTS
```

Grounding a long document is a lot of searching. Consider handing it to the
`groundtruth-verifier` subagent instead, which keeps that search out of this
conversation.

Stop and ask on anything CONTRADICTED. Never resolve one yourself.
