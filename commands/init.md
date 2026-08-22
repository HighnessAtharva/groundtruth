---
description: Set groundtruth up in this repository
allowed-tools: Bash, Read, Edit, Write, Glob
---

Before running anything, look at the repository and decide which modules fit:

- **readability** suits any repo with prose in it. Safe to start here.
- **seo** suits pages competing for a search query. Skip it for internal docs.
- **grounding** is the expensive one to author and the valuable one. Only propose it
  when the repo has something to cite: a docs folder, a data file, a notes
  directory, a sibling repository.

Then:

```bash
npx @highnessatharva/groundtruth init --modules <the ones you chose>
```

Read what it wrote, run the command it printed, and report the result. If it found
zero documents, fix the `documents` glob in the config rather than reporting an
empty run as success.
