# What this example cites, and at what revision

One source: [`sindresorhus/p-limit`](https://github.com/sindresorhus/p-limit),
MIT licensed, pinned to a commit SHA in `groundtruth.lock.json`.

Nothing from that repository is copied into this one. The `git` adapter fetches
`index.js` over plain HTTPS at the pinned SHA, and the fetched content is cached
under `cache/` by content address. That cache directory is committed, which is why
this example runs with no network after a clone.

To move the pin:

```bash
npx groundtruth-cli resolve --refresh
```

That rewrites `groundtruth.lock.json` and fetches the file again at the new SHA.
`WALKTHROUGH.md` step 5 does exactly that, on purpose, to show two quotes going
STALE when the code moves under them.

The permalinks in the report point at github.com at the pinned SHA, so a reader
checks the author's quote against the real file rather than trusting the article.
