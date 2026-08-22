// SARIF output.
//
// Roughly eighty lines on top of the finding objects the tool already produces, and
// it makes GitHub render every finding inline on a pull request diff. That is the
// highest-leverage small feature in the project, because a finding a reviewer sees
// next to the line is a finding that gets fixed.

import path from 'node:path';
import { version } from '../version.mjs';

const LEVEL = { error: 'error', warn: 'warning', info: 'note', off: 'none' };

export function toSarif(payload, { root = process.cwd(), rules = [] } = {}) {
  const used = new Map();
  for (const document of payload.documents) {
    for (const finding of document.findings) {
      if (!used.has(finding.rule)) used.set(finding.rule, finding);
    }
  }

  const byId = new Map(rules.map((rule) => [rule.id, rule]));

  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'groundtruth',
            version,
            informationUri: 'https://github.com/HighnessAtharva/groundtruth',
            rules: [...used.keys()].map((id) => {
              const rule = byId.get(id);
              const sample = used.get(id);
              return {
                id,
                name: id,
                shortDescription: { text: firstSentence(rule?.explain || sample.message) },
                fullDescription: { text: rule?.explain || sample.message },
                help: {
                  text: [rule?.explain, rule?.calibration].filter(Boolean).join('\n\n')
                    || sample.message,
                },
                defaultConfiguration: { level: LEVEL[rule?.defaultSeverity] || 'warning' },
                properties: {
                  // A reviewer needs to know whether a finding can block before
                  // deciding how to treat it.
                  tags: [
                    rule?.module || 'core',
                    rule?.mechanical === false ? 'advisory' : 'gate',
                  ],
                },
              };
            }),
          },
        },
        // Absent means "the run covered everything it was asked to", which is what
        // lets GitHub clear a fixed alert instead of leaving it open forever.
        results: payload.documents.flatMap((document) =>
          document.findings.map((finding) => result(finding, root))),
        invocations: [
          {
            executionSuccessful: payload.summary.exitCode === 0,
            exitCode: payload.summary.exitCode,
            commandLine: 'groundtruth check',
          },
        ],
      },
    ],
  };
}

function result(finding, root) {
  const uri = path.relative(root, path.resolve(root, finding.file)).replace(/\\/g, '/');
  const message = finding.fix?.instruction
    ? `${finding.message}\n\nFix: ${finding.fix.instruction}`
    : finding.message;

  return {
    ruleId: finding.rule,
    level: LEVEL[finding.severity] || 'warning',
    message: { text: message },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri },
          region: {
            startLine: Math.max(1, finding.line || 1),
            ...(finding.endLine && finding.endLine !== finding.line
              ? { endLine: finding.endLine }
              : {}),
            ...(finding.excerpt ? { snippet: { text: String(finding.excerpt).slice(0, 400) } } : {}),
          },
        },
      },
    ],
    properties: {
      blocking: finding.blocking,
      fixKind: finding.fix?.kind || null,
      module: finding.module,
    },
    // A patch the tool judged exact becomes a suggested change a reviewer can apply.
    ...(finding.fix?.patch
      ? {
        fixes: [
          {
            description: { text: finding.fix.instruction },
            artifactChanges: [
              {
                artifactLocation: { uri: String(finding.fix.patch.file).replace(/\\/g, '/') },
                replacements: [
                  {
                    deletedRegion: { startLine: Math.max(1, finding.fix.patch.line || finding.line || 1) },
                    insertedContent: { text: finding.fix.patch.replace },
                  },
                ],
              },
            ],
          },
        ],
      }
      : {}),
  };
}

function firstSentence(text) {
  const match = /^(.*?[.!?])(\s|$)/s.exec(String(text));
  return (match ? match[1] : String(text)).replace(/\s+/g, ' ').slice(0, 180);
}
