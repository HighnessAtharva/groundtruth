# Record shape

Every file is markdown with YAML frontmatter and a body of one fact per line.

```yaml
---
id: item.armor-key        # kind.slug, unique across the folder
kind: item                # room | item | door | character
name: Armor Key           # display name
observed_in: playthrough-2026-02-11
provenance: author-observed
synthetic: false          # true means the number is invented
confidence: measured      # measured | counted | estimated
---
Slot cost: 1.
The Armor Key opens four doors.
```

A claim cites a file and quotes one of its lines verbatim. The line is the unit,
which is why every fact gets its own line and no line carries two facts.
