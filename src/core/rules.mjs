// The rule registry.
//
// One table feeds the gate, the JSON output, `explain`, and the generated rule
// reference. A second copy would drift, and then "it passed" would mean two
// things.
//
// Two fields are required and neither is decoration.
//
// `mechanical` says whether this check has exactly one right answer a script can
// compute. Only a mechanical rule may ever block. The harness this came from
// states that policy in a markdown file and relies on discipline. Here config
// refuses to load if you try to gate an advisory rule, so the policy survives
// the person who wrote it.
//
// `explain` is the rationale. A rule with no rationale does not register. The
// single most valuable sentence in the source harness is a calibration comment
// buried in a 494-line file, reachable only by reading it. Making the field
// required is how that stops happening.

import { SEVERITY } from './findings.mjs';

const registry = new Map();

export function defineRule(spec) {
  const rule = validateRule(spec);
  return rule;
}

export function registerRule(spec) {
  const rule = validateRule(spec);
  if (registry.has(rule.id)) {
    throw new ConfigError(`duplicate rule id: ${rule.id}`);
  }
  registry.set(rule.id, rule);
  return rule;
}

export function registerAll(specs) {
  return specs.map(registerRule);
}

function validateRule(spec) {
  if (!spec || typeof spec !== 'object') {
    throw new ConfigError('a rule must be an object');
  }
  const problems = [];
  if (!spec.id || typeof spec.id !== 'string') problems.push('id is required');
  if (!spec.module) problems.push('module is required');
  if (typeof spec.mechanical !== 'boolean') {
    problems.push('mechanical must be true or false. A rule with one right answer a script can compute is mechanical and may block. Anything else is advisory.');
  }
  if (!spec.explain || String(spec.explain).trim().length < 20) {
    problems.push('explain is required and must say why the rule exists. `groundtruth explain <id>` prints it.');
  }
  if (spec.defaultSeverity && !SEVERITY.includes(spec.defaultSeverity)) {
    problems.push(`defaultSeverity must be one of ${SEVERITY.join(', ')}`);
  }
  if (typeof spec.run !== 'function') problems.push('run must be a function');

  if (spec.mechanical === false && spec.defaultSeverity === 'error') {
    problems.push(`${spec.id} is advisory, so its defaultSeverity cannot be 'error'`);
  }

  if (problems.length) {
    throw new ConfigError(`rule ${spec.id || '(unnamed)'} is invalid:\n  ${problems.join('\n  ')}`);
  }

  return {
    id: spec.id,
    module: spec.module,
    mechanical: spec.mechanical,
    defaultSeverity: spec.defaultSeverity || (spec.mechanical ? 'error' : 'warn'),
    explain: String(spec.explain).trim(),
    calibration: spec.calibration ? String(spec.calibration).trim() : null,
    thresholds: spec.thresholds || null,
    docs: spec.docs || null,
    run: spec.run,
  };
}

export function getRule(id) {
  return registry.get(id) || null;
}

export function allRules() {
  return [...registry.values()];
}

export function rulesForModule(module) {
  return allRules().filter((rule) => rule.module === module);
}

export function clearRegistry() {
  registry.clear();
}

/**
 * The advisory-gate guard.
 *
 * Called at config load, before a single document is read, so a bad severity
 * override fails fast with an explanation rather than quietly turning a metric
 * with no right answer into a build gate.
 */
export function assertSeverityOverrides(overrides, { allowAdvisoryGates = false } = {}) {
  if (!overrides) return;
  const problems = [];

  for (const [id, severity] of Object.entries(overrides)) {
    if (!SEVERITY.includes(severity)) {
      problems.push(`severity['${id}'] = '${severity}' is not one of ${SEVERITY.join(', ')}`);
      continue;
    }
    const rule = registry.get(id);
    if (!rule) {
      problems.push(`severity['${id}'] names a rule that does not exist. Run \`groundtruth explain\` with no argument to list every rule id.`);
      continue;
    }
    if (severity === 'error' && !rule.mechanical && !allowAdvisoryGates) {
      problems.push(
        [
          `severity['${id}'] = 'error'`,
          `  ${id} is advisory: it has no single right answer a script can compute.`,
          `  ${rule.explain.split('\n')[0]}`,
          "  Set 'warn', or pass allowAdvisoryGates: true if you have decided otherwise.",
        ].join('\n'),
      );
    }
  }

  if (problems.length) {
    throw new ConfigError(`config error\n${problems.join('\n')}`);
  }
}

export function resolveSeverity(rule, { severityOverrides = {}, profileSeverity = {} } = {}) {
  if (Object.prototype.hasOwnProperty.call(severityOverrides, rule.id)) {
    return severityOverrides[rule.id];
  }
  if (Object.prototype.hasOwnProperty.call(profileSeverity, rule.id)) {
    return profileSeverity[rule.id];
  }
  return rule.defaultSeverity;
}

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
    this.exitCode = 3;
  }
}

export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
    this.exitCode = 2;
  }
}

export class NetworkError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NetworkError';
    this.exitCode = 5;
  }
}
