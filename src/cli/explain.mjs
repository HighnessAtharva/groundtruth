// `groundtruth explain` — why a rule exists and what it measures.
//
// This exists because the single most valuable sentence in the harness this tool
// came from is a calibration note buried in a 494-line file, reachable only by
// opening it. `defineRule` makes the rationale a required field, and this makes it
// a command.
//
// It also prints where a severity came from. "Why is this an error" is a question
// with four possible answers, and guessing at it is how people end up disabling a
// whole module.

import { loadConfig, DEFAULT_VERDICTS, DERIVED_VERDICTS } from '../core/config.mjs';
import { buildEngine } from '../core/engine.mjs';
import { allRules, getRule } from '../core/rules.mjs';
import { paint, writeOut, table } from './format.mjs';

export async function runExplain(argv) {
  const { flags, positionals } = argv;
  const [topic] = positionals;

  let config = null;
  try {
    config = await loadConfig({ cwd: flags.cwd || process.cwd(), configPath: flags.config });
    await buildEngine(config, { modules: ['grounding', 'readability', 'seo', 'style'] });
  } catch {
    // Explain works with no project. Someone evaluating the tool should be able to
    // read the rule list before writing a config.
    await buildEngine(bareConfig(), { modules: ['grounding', 'readability', 'seo', 'style'] });
  }

  if (!topic) {
    listRules(config);
    return 0;
  }

  // Explain works with no project, so the verdict vocabulary falls back to the
  // defaults rather than reading as "no such verdict".
  const verdicts = {
    ...DEFAULT_VERDICTS,
    ...DERIVED_VERDICTS,
    ...(config?.verdicts || {}),
    ...(config?.derivedVerdicts || {}),
  };
  const verdictKey = Object.keys(verdicts).find((name) => name.toLowerCase() === topic.toLowerCase());
  if (verdictKey) {
    explainVerdict(verdictKey, verdicts[verdictKey], config);
    return 0;
  }

  const rule = getRule(topic) || allRules().find((entry) => entry.id.endsWith(`.${topic}`));
  if (!rule) {
    writeOut('');
    writeOut(paint(`no rule or verdict named '${topic}'.`, 'yellow'));
    const near = allRules().filter((entry) => entry.id.includes(topic)).slice(0, 6);
    if (near.length) {
      writeOut('  did you mean:');
      for (const entry of near) writeOut(`    ${entry.id}`);
    } else {
      writeOut('  run `groundtruth explain` with no argument to list every rule.');
    }
    writeOut('');
    return 2;
  }

  explainRule(rule, config);
  return 0;
}

function explainRule(rule, config) {
  const resolved = severityFor(rule, config);

  writeOut('');
  writeOut(
    `${paint(rule.id, 'bold')} · ${rule.module} · ${rule.mechanical ? 'mechanical' : paint('advisory', 'yellow')}`,
  );
  writeOut('');
  writeOut(wrap(rule.explain));

  if (rule.calibration) {
    writeOut('');
    writeOut(paint('Calibration', 'dim'));
    writeOut(wrap(rule.calibration));
  }

  writeOut('');
  writeOut(paint('Severity', 'dim'));
  writeOut(`  ${resolved.severity}${resolved.severity === 'error' ? ' (blocks)' : ' (prints and moves on)'}, from ${resolved.from}`);

  if (!rule.mechanical) {
    writeOut('');
    writeOut(wrap(
      'This rule is advisory, so it can never block. It has no single right answer a '
      + 'script can compute, and gating it would push writers to satisfy a number rather '
      + 'than a reader. Config refuses to set it to error unless you pass '
      + 'allowAdvisoryGates.',
    ));
  }

  if (rule.thresholds) {
    writeOut('');
    writeOut(paint('Thresholds', 'dim'));
    for (const [key, value] of Object.entries(rule.thresholds)) {
      writeOut(`  ${key}: ${JSON.stringify(value)}`);
    }
  }

  writeOut('');
}

function explainVerdict(name, spec, config) {
  writeOut('');
  writeOut(`${paint(name, 'bold')} · verdict${spec.derived ? ' · derived by the tool' : ''}`);
  writeOut('');
  writeOut(wrap(VERDICT_NOTES[name] || spec.label || ''));
  writeOut('');
  writeOut(paint('Behaviour', 'dim'));
  writeOut(`  severity: ${spec.severity}${spec.severity === 'error' ? ' (blocks)' : ''}`);
  writeOut(`  hue: ${spec.hue}`);
  if (spec.requires?.length) {
    const shown = spec.requires
      .map((entry) => (Array.isArray(entry) ? `one of ${entry.join(' or ')}` : entry))
      .join(', ');
    writeOut(`  requires: ${shown}`);
  }
  if (spec.emphatic) writeOut('  drawn with a background wash, so a skimmer sees it without hovering');
  if (spec.derived) {
    writeOut('');
    writeOut(wrap(
      'An author cannot write this verdict and a span map naming it is rejected. A claim '
      + 'cannot know it has gone stale, so the tool derives it by comparing what the pin '
      + 'says with what the source says now.',
    ));
  }
  writeOut('');
  if (config) {
    writeOut(paint('Change it in config under `verdicts`.', 'dim'));
    writeOut('');
  }
}

const VERDICT_NOTES = {
  VERIFIED: 'The quote was found in the named source. This is the only verdict that means what people assume every citation means.',
  EXTERNAL: 'The source is a URL with nothing local to check against. The tool says so rather than pretending the claim was verified.',
  FIGURE: 'The number was read off a chart or a screenshot rather than computed. Honest about the fact that a text checker cannot read pixels.',
  INFERRED: 'The claim was computed from records rather than quoted from one. The derivation is the thing a reader has to trust, so it is required.',
  'DOC-DEFECT': 'The claim is right and the source is wrong. Worth fixing upstream, and worth recording so nobody re-verifies it and gets confused.',
  UNSOURCED: 'Nothing in the declared sources supports the claim. Either find a source or cut the sentence. Marking it VERIFIED is the one thing this tool exists to stop.',
  CONTRADICTED: 'A source you named disagrees with the claim. One of the two is wrong and the tool cannot tell which, so the finding asks a person to decide.',
  STALE: 'The source moved under a claim that used to hold. Nobody made a mistake, which is why it warns rather than blocks.',
  TODO: 'What `draft` writes. Nobody has assessed this claim yet, which is a different fact from having assessed it and found nothing. It warns so a scaffold does not fail on its own first run, and it is the one verdict you are expected to replace.',
};

function listRules(config) {
  const rules = allRules().sort((a, b) => a.id.localeCompare(b.id));
  const rows = rules.map((rule) => [
    rule.id,
    rule.module,
    rule.mechanical ? 'gate' : 'advisory',
    severityFor(rule, config).severity,
    firstSentence(rule.explain),
  ]);

  writeOut('');
  writeOut(table(['RULE', 'MODULE', 'KIND', 'SEVERITY', 'WHAT IT CHECKS'], rows));
  writeOut('');
  writeOut(paint(`${rules.length} rules. \`groundtruth explain <rule>\` for the reasoning behind one.`, 'dim'));
  writeOut(paint('Only a `gate` rule can ever block. An `advisory` rule cannot, whatever you set.', 'dim'));
  writeOut('');
}

/** Where a severity came from, which is the question people actually have. */
function severityFor(rule, config) {
  if (!config) return { severity: rule.defaultSeverity, from: 'the rule default' };
  if (Object.prototype.hasOwnProperty.call(config.severity || {}, rule.id)) {
    return { severity: config.severity[rule.id], from: '`severity` in your config' };
  }
  for (const [name, profile] of Object.entries(config.profiles || {})) {
    if (Object.prototype.hasOwnProperty.call(profile.severity || {}, rule.id)) {
      return { severity: profile.severity[rule.id], from: `profile '${name}'` };
    }
  }
  return { severity: rule.defaultSeverity, from: 'the rule default' };
}

function firstSentence(text) {
  const match = /^(.*?[.!?])(\s|$)/s.exec(String(text));
  const sentence = (match ? match[1] : String(text)).replace(/\s+/g, ' ');
  return sentence.length > 78 ? `${sentence.slice(0, 77)}…` : sentence;
}

function wrap(text, width = 78) {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line.length + word.length + 1 > width) {
      lines.push(line);
      line = word;
      continue;
    }
    line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.map((entry) => `  ${entry}`).join('\n');
}

function bareConfig() {
  return {
    profiles: { default: {} },
    documents: [],
    severity: {},
    rules: [],
    allowAdvisoryGates: false,
  };
}
