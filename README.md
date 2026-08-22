# groundtruth

Bind every factual claim in a document to a verbatim quote in a real source, then gate on it.

Three modules, each independently optional.

1. **Grounding.** Every claim links to a verbatim quote in a source you name. The tool refuses to record a claim it cannot find in your document, and refuses a quote it cannot find in the source.
2. **Readability and images.** Sentence-level scoring, alt-text quality, images that exist on disk, and numbers in prose that disagree with numbers in a chart.
3. **SEO and AEO.** Mechanical checks that block, editorial checks that stay advisory.

Node 20 or later. One runtime dependency. The full README lands with the first release.

## Status

Under construction. See `docs/` as it fills in.

## License

MIT
