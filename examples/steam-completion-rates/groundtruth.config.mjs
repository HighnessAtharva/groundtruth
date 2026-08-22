// Completion-rate example. Two adapters, two flavours of source, and readability
// on so the image checks run.
//
// SEO is off on purpose. This piece runs on a personal blog with no search-intent
// target, and leaving it off is the proof that the three modules are independent.

import { records, web } from 'groundtruth-cli/adapters';

export default {
  // Committed, so the pins and the snapshots travel with the repo and the whole
  // example runs with no network.
  lockfile: 'groundtruth.lock.json',
  cacheDir: 'cache',

  sources: [
    records({
      id: 'stats',
      file: 'sources/completion-table.csv',
      // With a key column a ref can name a row by value rather than by index.
      key: 'name',
    }),
    web({
      id: 'web',
      snapshotDir: 'snapshots',
      // Two captures are committed. Drift is computed by comparing them, so the
      // STALE demonstration needs no network at all.
      maxAgeDays: 365,
    }),
  ],

  profiles: {
    dataStory: {
      grounding: {
        enabled: true,
        spanMaps: 'groundtruth/spans/${docId}.mjs',
      },
      readability: {
        enabled: true,
        images: {
          enabled: true,
          requireAlt: true,
          requireFileExists: true,
          // Numbers in prose against numbers in a picture's own description. The
          // most surprising rule in the tool, and the one that catches the mistake
          // every data write-up makes.
          countConflict: true,
        },
      },
      seo: { enabled: false },
    },
  },

  documents: [
    { include: ['article/**/*.md'], profile: 'dataStory' },
  ],
};
