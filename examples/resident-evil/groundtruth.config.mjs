// Resident Evil example. One module, one adapter, one loop.
//
// Nothing is imported. A built-in source is a plain object with a `type`, which is
// what `groundtruth init` writes, so this config loads in a project where the
// package is not installed yet. The other two examples use the import form to show
// that both work.
//
// Grounding only. Readability and SEO are deliberately off, so the report shows one
// thing at a time and this is the smallest setup the tool supports.

export default {
  sources: [
    {
      type: 'local',
      id: 'notes',
      root: './sources/mansion-notes',
      include: ['**/*.md'],
    },
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
