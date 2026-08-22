// The p-limit example. All three modules on, and the git adapter pointed at
// somebody else's public repository.
//
// Nothing from that repository is vendored here. The adapter fetches over plain
// HTTPS at the SHA in groundtruth.lock.json and caches by content address, and the
// cache directory is committed, so this example runs with no network after a clone.

import { git } from '@highnessatharva/groundtruth/adapters';
import { longform } from '@highnessatharva/groundtruth/presets';

export default {
  // Committed, so a fresh clone verifies every quote offline.
  cacheDir: 'cache',
  lockfile: 'groundtruth.lock.json',

  sources: [
    git({
      id: 'plimit',
      repo: 'sindresorhus/p-limit',
      ref: 'main',
      // Public repo, so no token. A token only raises the pin rate limit and is
      // the one thing a private repo needs.
      token: process.env.GITHUB_TOKEN || null,
    }),
  ],

  profiles: {
    technical: {
      grounding: {
        enabled: true,
        spanMaps: 'groundtruth/spans/${docId}.mjs',
      },
      readability: {
        enabled: true,
        images: { enabled: true, requireFileExists: true },
      },
      seo: {
        enabled: true,
        preset: longform,
        // One threshold moved rather than a preset forked. This piece is an
        // explainer at about 1,000 words, not a 2,500-word guide.
        overrides: { bodyWordsMin: 900, h2Min: 5, secondaryMin: 3 },
      },
    },
  },

  documents: [
    { include: ['article/**/*.md'], profile: 'technical' },
  ],
};
