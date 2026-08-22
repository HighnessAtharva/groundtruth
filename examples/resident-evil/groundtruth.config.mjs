// Resident Evil example. One module, one adapter, one loop.
//
// Grounding only. Readability and SEO are deliberately off, so this is the
// smallest setup the tool supports and the report shows one thing at a time.

import { local } from 'groundtruth/adapters';

export default {
  sources: [
    local({
      id: 'notes',
      root: './sources/mansion-notes',
      include: ['**/*.md'],
    }),
  ],

  profiles: {
    grounded: {
      grounding: {
        enabled: true,
        spanMaps: 'groundtruth/spans/${docId}.mjs',
      },
    },
  },

  documents: [
    { include: ['article/**/*.md'], profile: 'grounded' },
  ],
};
