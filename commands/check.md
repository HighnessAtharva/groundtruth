---
description: Run the groundtruth gate on a path and print only what blocks
argument-hint: "[path]"
allowed-tools: Bash, Read, Grep, Glob
---

Run the gate on `$ARGUMENTS` (the whole corpus if empty):

```bash
npx groundtruth check $ARGUMENTS --json
```

Then follow the `groundtruth-gate` skill. In short:

1. Read `summary.blocking`. Zero means done, say so and stop.
2. List every finding with `blocking: true`, grouped by `fix.kind`.
3. Do not list advisory findings unless the user asks. Say how many there are.

Report the exit code. Never say a run is clean without reading `summary.blocking`.
