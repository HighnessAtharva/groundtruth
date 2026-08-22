// `groundtruth init` — set the tool up in a repo in under two minutes.
//
// Idempotent by default. A second run writes nothing and prints what `--force`
// would change, because a scaffolder that silently clobbers a config someone
// hand-tuned gets uninstalled.

import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { discover } from '../core/discover.mjs';
import { CONFIG_NAMES } from '../core/config.mjs';
import { paint, writeOut, pluralize } from './format.mjs';
import { UsageError } from '../core/rules.mjs';

const MODULES = ['grounding', 'readability', 'seo'];

export async function runInit(argv) {
  const { flags } = argv;
  const root = path.resolve(flags.cwd || process.cwd());
  const configPath = path.join(root, CONFIG_NAMES[0]);

  const modules = pickModules(flags);
  const glob = flags.glob || detectGlob(root);
  const written = [];
  const skipped = [];

  if (existsSync(configPath) && !flags.force) {
    writeOut('');
    writeOut(paint(`${CONFIG_NAMES[0]} already exists.`, 'yellow'));
    writeOut('  Nothing was written. Pass --force to overwrite it.');
    writeOut('');
    writeOut(`Next:  ${paint('npx groundtruth check', 'cyan')}`);
    return 0;
  }

  writeFileSync(configPath, renderConfig({ glob, modules }), 'utf8');
  written.push([CONFIG_NAMES[0], modules.join(' + ')]);

  const spanDir = path.join(root, 'groundtruth');
  if (modules.includes('grounding')) {
    mkdirSync(path.join(spanDir, 'spans'), { recursive: true });
    const readme = path.join(spanDir, 'README.md');
    if (!existsSync(readme) || flags.force) {
      writeFileSync(readme, SPAN_README, 'utf8');
      written.push(['groundtruth/README.md', '']);
    }
  }

  const agentsPath = path.join(root, 'AGENTS.md');
  const agentsBlock = renderAgents({ glob, modules });
  if (!existsSync(agentsPath)) {
    writeFileSync(agentsPath, agentsBlock, 'utf8');
    written.push(['AGENTS.md', '']);
  } else {
    const current = readFileSync(agentsPath, 'utf8');
    if (current.includes('<!-- groundtruth:start -->')) {
      skipped.push('AGENTS.md already carries a groundtruth block');
    } else {
      appendFileSync(agentsPath, `\n\n${agentsBlock}`, 'utf8');
      written.push(['AGENTS.md', 'appended']);
    }
  }

  const gitignore = path.join(root, '.gitignore');
  const ignoreLine = '.groundtruth/';
  if (!existsSync(gitignore)) {
    writeFileSync(gitignore, `# groundtruth output\n${ignoreLine}\n`, 'utf8');
    written.push(['.gitignore', '']);
  } else if (!readFileSync(gitignore, 'utf8').includes(ignoreLine)) {
    appendFileSync(gitignore, `\n# groundtruth output\n${ignoreLine}\n`, 'utf8');
    written.push(['.gitignore', 'patched']);
  }

  const found = safeDiscover(root, glob);

  writeOut('');
  writeOut(`groundtruth ${paint(process.env.npm_package_version || '', 'dim')}`.trimEnd());
  writeOut('');
  for (const [file, note] of written) {
    writeOut(`  ${paint('wrote', 'green')}  ${file.padEnd(32)}${paint(note, 'dim')}`.trimEnd());
  }
  for (const note of skipped) {
    writeOut(`  ${paint('kept ', 'dim')}  ${note}`);
  }
  writeOut('');
  writeOut(`  ${pluralize(found.length, 'document')} match ${glob}`);
  writeOut('');
  writeOut('Next:');
  writeOut('');
  writeOut(`  ${paint(`npx groundtruth check${found[0] ? ` ${found[0]}` : ''}`, 'cyan')}`);
  writeOut('');
  writeOut(paint('Docs: https://github.com/HighnessAtharva/groundtruth#readme', 'dim'));
  return 0;
}

function pickModules(flags) {
  if (flags.minimal) return ['readability'];
  const raw = [flags.modules, flags.module].flat().filter(Boolean);
  if (!raw.length) return ['readability'];
  const wanted = raw
    .flatMap((entry) => String(entry).split(','))
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const bad = wanted.filter((name) => !MODULES.includes(name));
  if (bad.length) {
    throw new UsageError(`unknown module(s): ${bad.join(', ')}. Choose from ${MODULES.join(', ')}.`);
  }
  return MODULES.filter((name) => wanted.includes(name));
}

function detectGlob(root) {
  for (const dir of ['docs', 'content', 'articles', 'posts']) {
    if (existsSync(path.join(root, dir))) return `${dir}/**/*.md`;
  }
  return '**/*.md';
}

function safeDiscover(root, glob) {
  try {
    return discover({
      root,
      documents: [{ include: [glob], exclude: ['node_modules/**', '.groundtruth/**'] }],
      defaultProfile: 'prose',
      extensions: ['.md', '.mdx', '.markdown'],
    }).map((entry) => entry.relativePath);
  } catch {
    return [];
  }
}

function renderConfig({ glob, modules }) {
  const on = (name) => modules.includes(name);

  const lines = [
    '// groundtruth configuration.',
    '//',
    '// Every default is written out below as a value or a comment, so this file is',
    '// its own reference. Delete what you do not need.',
    '//',
    '// Paths resolve from this file\'s directory. Never hardcode an absolute path here.',
    '',
  ];

  if (on('grounding')) {
    lines.push("import { local } from 'groundtruth/adapters';", '');
  }

  lines.push('export default {');
  lines.push('  // Output. Both are gitignored by `init`.');
  lines.push("  reportDir: '.groundtruth/report',");
  lines.push("  cacheDir: '.groundtruth/cache',");

  if (on('grounding')) {
    lines.push("  lockfile: 'groundtruth.lock.json', // commit this");
    lines.push('');
    lines.push('  // Data sources. Only read when a routed profile enables grounding.');
    lines.push('  sources: [');
    lines.push('    local({');
    lines.push("      id: 'notes',");
    lines.push("      root: './sources',      // a folder of files you can quote from");
    lines.push("      include: ['**/*.md', '**/*.txt'],");
    lines.push('    }),');
    lines.push('    // git({ id: "repo", repo: "owner/name", ref: "main" }),');
    lines.push('    // web({ id: "web", snapshotDir: ".groundtruth/snapshots" }),');
    lines.push('    // records({ id: "specs", file: "data/facts.csv", key: "name" }),');
    lines.push('  ],');
  }

  lines.push('');
  lines.push('  // Profiles. Every profile extends a base with all modules off, so');
  lines.push('  // turning one on is always explicit.');
  lines.push('  profiles: {');
  lines.push('    prose: {');

  if (on('grounding')) {
    lines.push('      grounding: {');
    lines.push('        enabled: true,');
    lines.push("        spanMaps: 'groundtruth/spans/${docId}.mjs',");
    lines.push("        onDuplicateMatch: 'error', // 'error' | 'first'");
    lines.push('        requireLocated: false,     // true = a quote the tool cannot find is an error');
    lines.push('      },');
  }

  if (on('readability')) {
    lines.push('      readability: {');
    lines.push('        enabled: true,');
    lines.push('        // overrides: { wordBudget: 22, hard: 18, tough: 8 },');
    lines.push('        waiveQuotations: true,  // a blockquote is somebody else\'s words');
    lines.push('        waiveCallouts: false,   // a callout is yours, so it is scored');
    lines.push('        images: { enabled: true, requireAlt: true, requireFileExists: true },');
    lines.push('        dialect: { enabled: false, target: \'american\' },');
    lines.push('      },');
  }

  if (on('seo')) {
    lines.push('      seo: {');
    lines.push('        enabled: true,');
    lines.push('        // overrides: { bodyWordsMin: 800, h2Max: 14 },');
    lines.push("        keyword: { field: 'primary_keyword', secondaryField: 'secondary_keywords' },");
    lines.push('      },');
  }

  lines.push('    },');
  lines.push('  },');
  lines.push('');
  lines.push('  // Document routing. First match wins.');
  lines.push('  documents: [');
  lines.push(`    { include: ['${glob}'], exclude: ['node_modules/**', '.groundtruth/**'], profile: 'prose' },`);
  lines.push('  ],');
  lines.push('');
  lines.push('  // Per-rule severity. off | info | warn | error. Only `error` blocks.');
  lines.push('  // An advisory rule cannot be set to error, and the config will say so.');
  lines.push('  severity: {');
  lines.push('    // \'read.hard\': \'error\',');
  lines.push('  },');
  lines.push('};');
  lines.push('');

  return lines.join('\n');
}

const SPAN_README = `# Span maps

One file per document. The file name comes from the document's id, which is its
path minus the extension with slashes turned into dashes.

A span binds a **verbatim substring of your document** to a **verbatim quote in a
source**. The tool refuses to record anything it cannot find in both places.

\`\`\`js
export const document = 'docs/getting-started.md';
export const audited = '${new Date().toISOString().slice(0, 10)}';

const NOTES = 'notes:setup.md';

export const spans = [
  {
    match: 'the installer needs Node 20 or later',
    source: NOTES,
    quote: 'Requires Node.js 20.11.0 or newer.',
    verdict: 'VERIFIED',
  },
  {
    match: 'most teams finish setup in under ten minutes',
    source: null,
    quote: null,
    verdict: 'UNSOURCED',
    note: 'No measurement behind this. Find a number or cut the sentence.',
  },
];
\`\`\`

Scaffold one from a document instead of writing it by hand:

\`\`\`bash
npx groundtruth draft docs/getting-started.md --write
\`\`\`
`;

function renderAgents({ glob, modules }) {
  return `<!-- groundtruth:start -->
## Content gate

This repo runs \`groundtruth\` over \`${glob}\`. Modules on: ${modules.join(', ')}.

Run this before you finish any edit to a matched file:

\`\`\`bash
npx groundtruth check <path>
\`\`\`

Exit codes: \`0\` clean, \`1\` blocking findings, \`2\` usage, \`3\` config, \`4\` internal,
\`5\` network needed and unavailable.

Read the findings with \`--json\`. Every finding carries:

- \`blocking\` — a boolean. Act on every \`true\` before any \`false\`. Do not derive
  this from severity.
- \`fix.kind\` — \`edit\` means a patch is attached, apply it. \`rewrite\` means write
  new prose. \`source\` means go find a record. \`decision\` means a person has to
  choose, so stop and ask.

Never do these:

1. Never paraphrase a quote to make it match.
2. Never widen a quote to swallow a mismatch.
3. Never edit a source record to fit the article.
4. Never hand-set a verdict to silence a finding.
5. Never delete a claim entry instead of fixing it.
6. Never mark something VERIFIED when you only found a paraphrase.
<!-- groundtruth:end -->
`;
}
