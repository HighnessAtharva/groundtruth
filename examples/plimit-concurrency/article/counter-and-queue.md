---
title: How p-limit works, one counter and one queue
seo_title: How p-limit works, read at one commit
slug: how-p-limit-works
primary_keyword: how p-limit works
secondary_keywords: [javascript concurrency limit, p-limit activeCount, limit async calls node, promise concurrency queue]
meta_description: p-limit is a hundred and twenty seven lines of JavaScript that sits in almost every Node dependency tree, and this piece reads the whole thing at one pinned commit to show exactly how p-limit works, counter and queue together.
canonical_url: https://example.com/how-p-limit-works
updated_date: 2026-08-22
---

# How p-limit works, one counter and one queue

Here is how p-limit works. One integer counts what is running, one queue holds what is not, and a three-line function moves items between them. That is the whole library. It sits in almost every Node dependency tree and almost nobody has opened it, which is a shame, because reading it takes ten minutes and it changes how you write every batch job afterwards.

Every quote below is pinned to a commit. Click any highlighted claim in the report and it opens the line on GitHub at that exact SHA, so you can check this article rather than trust it.

## What the whole thing is

The limiter tracks in-flight work with a single integer counter. That is the entire state. A queue sits beside it holding calls that have not started, and one function exists to move an item from the queue into the counter when there is room.

That mover is the load-bearing piece, and it runs a single check: if the counter is under the limit and the queue is not empty, increment the counter and start the next item. Nothing else in the file decides when work begins. When a task finishes, the counter goes down and the mover runs again.

Two lines. Every batch job you have written by hand was reimplementing those two lines, usually with a bug in them. The usual bug is a counter that decrements on success and not on failure, which leaks a slot per error until the whole thing wedges.

## The part that surprises people

A call into the limiter resolves with a promise, immediately, before the work has finished. The comment in the source says so directly.

That is not an oversight and it is the reason the library composes. The caller gets a handle straight away, and the limiter separately waits for the work to settle so it knows when to decrement. Those two waits are deliberately different waits. Collapsing them into one is the mistake most hand-rolled versions make, and it is why the hand-rolled version usually cannot report how many tasks are in flight.

The error path is worth reading too. The limiter awaits the result inside a `try` with an empty `catch`, and the comment explains the reasoning: catching there prevents an unhandled rejection while the original promise rejection is preserved for the caller. You get both behaviours, which is what you want and not what you get if you write this in a hurry.

```js
const limit = pLimit(4);
const results = await Promise.all(urls.map(url => limit(() => fetch(url))));
```

## Three ways people break it

**Building the limiter inside the loop.** The factory returns a fresh closure with its own counter, so a limiter created per iteration gives every iteration its own budget and the cap does nothing at all. The limiter has to outlive the loop that uses it. This one is common because the broken version looks correct and runs correctly on a machine fast enough to hide it.

**Awaiting the wrong thing.** A call to the limiter returns a promise for the result of the function you passed. Awaiting that promise inside the loop serialises the entire batch, which produces a working program running at concurrency one. Nothing errors and nothing warns. The job just takes eight hours instead of twenty minutes.

**Assuming results come back in the order they went in.** Tasks resolve in the order they were queued.

```
await Promise.all(tasks.map(task => limit(task)))
```

## How p-limit works when the limit changes

Changing the limit while work is in flight is supported, and it drains correctly. The setter validates the new value, assigns it, then schedules a microtask that keeps moving items while there is room. Raising the limit halfway through a run starts more work without a restart, which matters when the thing you are rate-limiting turns out to tolerate more than you guessed.

The validator is stricter than you would expect. It accepts an integer or positive infinity, and only above zero, and the error message is exact: it expects a number from 1 and up. Passing zero throws instead of silently blocking forever, which is the failure mode you want from a concurrency cap.

There is also a helper on the returned function that runs an iterable through the limiter and collects with Promise.all, so ordered results are one call away when you want them. Most teams set the limit to the number of CPU cores.

## Conclusion

Read the file. It is shorter than the wrapper you were about to write around it, and the two lines in the middle are the ones worth stealing.
