# Where these records come from

**Every game title in this example is invented, and every number is invented.**

That is not laziness, it is the only honest way to build the example. Attaching a
fabricated 4.1 percent completion rate to a real game would be a fabricated record
about a real product, and no amount of "it is only a demo" makes that fine. Invented
titles teach exactly the same lesson and harm nobody.

Nothing in this folder was scraped. Nothing was copied from a store page, a review
aggregator, or any other publication.

## The files

| File | What it is |
|---|---|
| `completion-table.csv` | Twelve rows, seven columns. The current table. |
| `completion-table.at-pin.csv` | The same table as it stood when `groundtruth.lock.json` was written. Kept so the drift demonstration is reproducible. |
| `catalog/games.json` | Four per-game detail records. Every one carries `synthetic: true`. |
| `../snapshots/` | Two captures of a page on `example.com`, which is the IANA-reserved documentation domain. Author-written text, not a capture of any real site. |

## Two records disagree, on purpose

`catalog/games.json` records `has_tutorial: true` for Harrow Line. The `note` column
of `completion-table.csv` says "no tutorial, first fight at 4 minutes".

Both cannot be right. That is what produces the CONTRADICTED verdict, and it is the
most realistic failure in any of the three examples: two sources you own, saying
different things, and a sentence in your article that happened to pick one of them.

## Two cells changed after the pin

`completion-table.csv` differs from `completion-table.at-pin.csv` in two cells. The
lockfile pins the older content hash, so the tool can see the table moved under the
claims without making a single network call. That is the STALE mechanism.
