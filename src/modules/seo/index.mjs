// The SEO and AEO module.
//
// One rule per check, generated from the table in specs.mjs. The audit runs once
// per document and every rule reads its own row out of the result, so the gate
// and the report panel can never disagree about what the page measured.

import { defineRule } from '../../core/rules.mjs';
import { normalizeFinding } from '../../core/findings.mjs';
import { resolveSeverity } from '../../core/rules.mjs';
import { auditDocument } from './audit.mjs';
import { CHECKS } from './specs.mjs';

const auditCache = new WeakMap();

export function auditFor(doc) {
  if (auditCache.has(doc)) return auditCache.get(doc);
  const settings = doc.profile?.seo || {};
  const result = auditDocument(doc, {
    preset: settings.preset || undefined,
    overrides: settings.overrides || undefined,
    keyword: settings.keyword,
  });
  auditCache.set(doc, result);
  return result;
}

/**
 * A mechanical check blocks on `fail` and warns on `warn`. An advisory check
 * never blocks, whatever it reports, and config cannot promote it. That is the
 * governing policy from the source harness, encoded rather than documented.
 */
export const rules = CHECKS.map((spec) =>
  defineRule({
    id: `seo.${spec.id}`,
    module: 'seo',
    mechanical: spec.mechanical,
    defaultSeverity: spec.mechanical ? 'error' : 'warn',
    explain: spec.explain,
    calibration: spec.calibration || null,
    run({ doc, finding }) {
      const audit = auditFor(doc);
      const entry = audit.checks.find((item) => item.id === spec.id);
      if (!entry || entry.status === 'pass') return;

      // An advisory check reports at most a warning regardless of its status, and
      // a mechanical check reports its status. Severity resolution still applies
      // on top, so a project can quieten either one.
      const line = lineFor(doc, spec.id, audit);
      finding({
        line,
        message: `${entry.label}: ${entry.detail}`,
        severity: spec.mechanical ? (entry.status === 'fail' ? undefined : 'warn') : 'warn',
        data: { status: entry.status, group: entry.group, score: audit.score },
        fix: entry.fix
          ? { kind: fixKindFor(spec.id), instruction: entry.fix, confidence: 'medium' }
          : null,
      });
    },
  }),
);

/** Point a finding at the line a reader has to open, not at line 1. */
function lineFor(doc, id, audit) {
  const body = audit.body;
  switch (id) {
    case 'h2-vague': {
      const first = body.h2s.find((block) => block.readerText && /^(conclusion|takeaways?|summary|overview|introduction|final|closing|why it matters)/i.test(block.readerText.trim()));
      return first?.line ?? 1;
    }
    case 'h2-colon':
      return body.h2s.find((block) => block.readerText.includes(':'))?.line ?? 1;
    case 'fence-language':
      return body.fences.find((block) => !block.lang)?.line ?? 1;
    case 'aeo-preamble':
    case 'aeo-answer-first':
      return body.opening.find((block) => block.readerText)?.line ?? doc.bodyLine;
    case 'faq-count':
    case 'faq-answer-length':
      return body.faq.heading?.line ?? 1;
    case 'h1-single':
      return body.h1s[0]?.line ?? doc.bodyLine;
    default:
      return 1;
  }
}

/**
 * What kind of fix this is, so an agent knows whether it can act alone. A
 * frontmatter field is an edit. Prose is a rewrite. Structure is a rewrite too,
 * because moving a heading changes the argument around it.
 */
function fixKindFor(id) {
  if (['canonical', 'updated', 'sec-count'].includes(id)) return 'edit';
  if (['fence-language'].includes(id)) return 'edit';
  return 'rewrite';
}

export const stages = [
  {
    id: 'seo.run',
    needs: ['parse', 'config'],
    reads: [],
    writes: [],
    run: (context, view) => {
      const docs = view.get('parse');
      const config = view.get('config');
      const findings = [];

      for (const doc of docs) {
        if (!doc.profile?.seo?.enabled) continue;
        const audit = auditFor(doc);
        doc.stats = {
          ...(doc.stats || {}),
          ...audit.stats,
          seoScore: audit.score,
          seoBand: audit.band,
        };
        doc.seoAudit = audit;

        for (const rule of rules) {
          const severity = resolveSeverity(rule, {
            severityOverrides: config.severity,
            profileSeverity: doc.profile.severity,
          });
          if (severity === 'off') continue;
          const spec = CHECKS.find((entry) => `seo.${entry.id}` === rule.id);
          const entry = audit.checks.find((item) => item.id === spec.id);
          if (!entry || entry.status === 'pass') continue;

          const effective = spec.mechanical
            ? entry.status === 'fail'
              ? severity
              : downgrade(severity)
            : downgrade(severity);

          findings.push(
            normalizeFinding({
              rule: rule.id,
              module: 'seo',
              severity: effective,
              file: doc.path,
              line: lineFor(doc, spec.id, audit),
              message: `${entry.label}: ${entry.detail}`,
              why: rule.explain.split('. ')[0],
              data: { status: entry.status, group: entry.group },
              fix: entry.fix
                ? { kind: fixKindFor(spec.id), instruction: entry.fix, confidence: 'medium' }
                : null,
              docs: rule.docs,
            }),
          );
        }
      }

      return findings;
    },
  },
];

function downgrade(severity) {
  return severity === 'error' ? 'warn' : severity;
}

export default { id: 'seo', rules, stages };
export { auditDocument };
