---
description: Explain one groundtruth rule, verdict, or finding
argument-hint: "<rule|verdict>"
allowed-tools: Bash, Read
---

```bash
npx @highnessatharva/groundtruth explain $ARGUMENTS
```

With no argument it lists every rule with its module, whether it can block, its
current severity, and what it checks.

Relay what it prints. Add the two things it cannot know: whether this project should
care about that rule, and what the offending text in the current document actually
is. Do not restate the explanation in your own words, it is already written.
