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

  if (flags['with-ci']) {
    const workflow = path.join(root, '.github', 'workflows', 'groundtruth.yml');
    if (!existsSync(workflow) || flags.force) {
      mkdirSync(path.dirname(workflow), { recursive: true });
      writeFileSync(workflow, WORKFLOW, 'utf8');
      written.push(['.github/workflows/groundtruth.yml', '']);
    } else {
      skipped.push('.github/workflows/groundtruth.yml already exists');
    }
  }

  if (flags['with-hooks']) {
    const settingsPath = path.join(root, '.claude', 'settings.json');
    mkdirSync(path.dirname(settingsPath), { recursive: true });
    const settings = existsSync(settingsPath)
      ? JSON.parse(readFileSync(settingsPath, 'utf8') || '{}')
      : {};
    settings.hooks ||= {};
    const already = JSON.stringify(settings.hooks).includes('groundtruth');
    if (already && !flags.force) {
      skipped.push('.claude/settings.json already carries a groundtruth hook');
    } else {
      // Stop rather than PostToolUse. A gate on every edit of a long draft is noise,
      // and a noisy hook gets deleted.
      settings.hooks.Stop = [
        ...(settings.hooks.Stop || []).filter((entry) =>
          !JSON.stringify(entry).includes('groundtruth')),
        {
          matcher: '',
          hooks: [{ type: 'command', command: STOP_HOOK, timeout: 60 }],
        },
      ];
      writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
      written.push(['.claude/settings.json', 'Stop hook']);
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

/**
 * The generated config imports nothing.
 *
 * `init` runs before the package is necessarily resolvable from the project, and a
 * config that cannot load makes a brand-new user's very first `check` fail with a
 * module-resolution error. So a built-in source is a plain object with a `type` and
 * a built-in preset is named as a string. Both are resolved by the loader.
 */
function renderConfig({ glob, modules }) {
  const on = (name) => modules.includes(name);
  const L = [];

  L.push('// groundtruth configuration.');
  L.push('//');
  L.push('// Every default is written out below as a value or a comment, so this file is');
  L.push('// its own reference. Delete whatever you do not need.');
  L.push('//');
  L.push("// Paths resolve from this file's directory. Never hardcode an absolute path.");
  L.push('//');
  L.push('// Nothing is imported on purpose, so this file loads before anything is');
  L.push('// installed. A built-in source is { type, ... } and a built-in preset is a');
  L.push('// string. For a custom adapter, import it and pass the object.');
  L.push('');
  L.push('export default {');

  if (on('grounding')) {
    L.push('  // Commit the lockfile. Gitignore the cache, or commit it to run offline.');
    L.push("  lockfile: 'groundtruth.lock.json',");
    L.push('');
    L.push('  // Only read when a routed profile turns grounding on.');
    L.push('  sources: [');
    L.push('    // A folder of files you can quote from: notes, an offline docs export,');
    L.push('    // fact sheets you wrote yourself.');
    L.push("    { type: 'local', id: 'notes', root: './sources', include: ['**/*.md', '**/*.txt'] },");
    L.push('');
    L.push('    // A repository at a pinned commit. Plain HTTPS, no CLI, no token for a');
    L.push('    // public repo. Run `groundtruth resolve --refresh` to pin it.');
    L.push("    // { type: 'git', id: 'repo', repo: 'owner/name', ref: 'main' },");
    L.push('');
    L.push('    // A table of facts. A claim cites a cell, not a line.');
    L.push("    // { type: 'records', id: 'specs', file: 'data/facts.csv', key: 'name' },");
    L.push('');
    L.push('    // A page that will change under you, captured to a committable snapshot.');
    L.push("    // { type: 'web', id: 'web', snapshotDir: 'snapshots' },");
    L.push('  ],');
    L.push('');
  }

  L.push('  // Every profile extends a base with all modules off, so turning one on is');
  L.push('  // always an explicit act.');
  L.push('  profiles: {');
  L.push('    prose: {');

  if (on('grounding')) {
    L.push('      grounding: {');
    L.push('        enabled: true,');
    L.push("        spanMaps: 'groundtruth/spans/${docId}.mjs',");
    L.push("        onDuplicateMatch: 'error',   // 'error' | 'first'");
    L.push('      },');
  }

  if (on('readability')) {
    L.push('      readability: {');
    L.push('        enabled: true,');
    L.push('        // overrides: { wordBudget: 22, tough: 8, hard: 18 },');
    L.push("        waiveQuotations: true,      // a blockquote is somebody else's words");
    L.push('        waiveCallouts: false,      // a callout is yours, so it is scored');
    L.push('        images: { enabled: true, requireAlt: true, requireFileExists: true },');
    L.push('      },');
  }

  if (on('seo')) {
    L.push('      seo: {');
    L.push('        enabled: true,');
    L.push("        preset: 'longform',        // 'longform' | 'shortform'");
    L.push('        // overrides: { bodyWordsMin: 900, h2Min: 5 },');
    L.push("        keyword: { field: 'primary_keyword', secondaryField: 'secondary_keywords' },");
    L.push('      },');
  }

  L.push('    },');
  L.push('  },');
  L.push('');
  L.push('  // Document routing. First match wins.');
  L.push('  documents: [');
  L.push(`    { include: ['${glob}'], exclude: ['node_modules/**'], profile: 'prose' },`);
  L.push('  ],');
  L.push('');
  L.push('  // Per-rule severity. off | info | warn | error. Only error blocks, and an');
  L.push('  // advisory rule cannot be set to error. Run `groundtruth explain` for the list.');
  L.push('  severity: {');
  L.push("    // 'read.hard': 'error',");
  L.push('  },');
  L.push('};');
  L.push('');

  return L.join('\n');
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

const STOP_HOOK = 'npx groundtruth check --changed --hook';

const WORKFLOW = `name: groundtruth

on:
  pull_request:

permissions:
  contents: read
  security-events: write

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0        # --changed needs history to find a merge base
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci

      # --frozen refuses to verify against a revision the lockfile does not name.
      - run: npx groundtruth check --changed --frozen

      # Runs even when the gate failed, so a reviewer sees every finding inline.
      - if: always()
        run: npx groundtruth check --format sarif > groundtruth.sarif
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: groundtruth.sarif
          category: groundtruth
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
