// Span map for the p-limit example.
//
// Every source here is one file in somebody else's repository, at a commit SHA
// pinned in groundtruth.lock.json. That is the only source type where a reader can
// check a quote in one click, which is why this example exists.

export const document = 'article/counter-and-queue.md';
export const audited = '2026-08-22';

const SRC = 'plimit:index.js';

export const spans = [
  {
    match: 'The limiter tracks in-flight work with a single integer counter',
    source: SRC,
    quote: 'let activeCount = 0;',
    verdict: 'VERIFIED',
  },
  {
    match: 'if the counter is under the limit and the queue is not empty, increment the counter and start the next item',
    source: SRC,
    quote: 'if (activeCount < concurrency && queue.size > 0) {',
    verdict: 'VERIFIED',
    note: 'The two statements inside the branch are the increment and the dequeue.',
  },
  {
    match: 'When a task finishes, the counter goes down and the mover runs again',
    source: SRC,
    quote: 'activeCount--;',
    verdict: 'VERIFIED',
    note: 'Followed immediately by resumeNext() in the same function.',
  },
  {
    match: 'A call into the limiter resolves with a promise, immediately, before the work has finished',
    source: SRC,
    quote: "// Resolve immediately with the promise (don't wait for completion)",
    verdict: 'VERIFIED',
    note: 'Citing the comment rather than the call, because the comment is the claim.',
  },
  {
    match: 'catching there prevents an unhandled rejection while the original promise rejection is preserved for the caller',
    source: SRC,
    quote: 'but the original promise rejection is preserved for the caller',
    verdict: 'VERIFIED',
  },
  {
    match: 'The factory returns a fresh closure with its own counter, so a limiter created per iteration gives every iteration its own budget',
    source: SRC,
    quote: 'export default function pLimit(concurrency) {',
    verdict: 'INFERRED',
    derivation: 'pLimit declares activeCount and queue inside its own body and returns generator, so each call produces an independent pair. The consequence for a loop is mine, the scoping is the source.',
  },
  {
    // The quoted code proves the opposite of what the sentence says. The author
    // was wrong and the tool caught it, which is the best thing this example can
    // show. `map` uses Promise.all and preserves input order, but a bare limit()
    // call resolves whenever its own task settles.
    match: 'Tasks resolve in the order they were queued',
    source: SRC,
    quote: 'const result = (async () => function_(...arguments_))();',
    verdict: 'CONTRADICTED',
    note: 'Each call resolves when its own task settles, so completion order follows duration and not queue order. Only the map helper preserves input order, and it does that with Promise.all rather than with the queue.',
  },
  {
    match: 'The setter validates the new value, assigns it, then schedules a microtask that keeps moving items while there is room',
    source: SRC,
    quote: 'queueMicrotask(() => {',
    verdict: 'VERIFIED',
    note: 'validateConcurrency and the assignment sit directly above it, the while loop directly inside.',
  },
  {
    match: 'It accepts an integer or positive infinity, and only above zero',
    source: SRC,
    quote: 'if (!((Number.isInteger(concurrency) || concurrency === Number.POSITIVE_INFINITY) && concurrency > 0)) {',
    verdict: 'VERIFIED',
  },
  {
    match: 'it expects a number from 1 and up',
    source: SRC,
    quote: "throw new TypeError('Expected `concurrency` to be a number from 1 and up');",
    verdict: 'VERIFIED',
  },
  {
    match: 'runs an iterable through the limiter and collects with Promise.all',
    source: SRC,
    quote: 'return Promise.all(promises);',
    verdict: 'VERIFIED',
  },
  {
    // Folk wisdom. Nothing in the source says it and nothing could.
    match: 'Most teams set the limit to the number of CPU cores',
    source: null,
    quote: null,
    verdict: 'UNSOURCED',
    note: 'A claim about what other people do, in an article that only read one file. Cut it or cite a survey.',
  },
];
