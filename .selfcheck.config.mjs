// The tool run against its own prose. Readability only, because the repo's own
// markdown is documentation and not a page competing for a query.
export default {
  reportDir: '.groundtruth/self',
  profiles: {
    docs: {
      readability: {
        enabled: true,
        // Every code fence in this repo's docs is illustrative and half the images
        // do not exist because there are no images.
        images: { enabled: false },
      },
    },
  },
  documents: [
    { include: ['*.md', 'examples/**/*.md', 'skills/**/*.md', 'agents/*.md', 'commands/*.md'],
      exclude: ['node_modules/**', 'examples/*/expected/**'],
      profile: 'docs' },
  ],
};
