// The engine. Builds the pipeline from whichever modules the config turns on,
// then runs it.
//
// A module contributes rules and stages. It is never imported unless a routed
// profile enables it, so a config that only wants readability makes zero network
// calls, globs no span maps, and compiles no SEO regexes.

import { Pipeline } from './pipeline.mjs';
import { discover } from './discover.mjs';
import { loadDocument } from './document.mjs';
import { validateSeverity } from './config.mjs';
import { moduleInUse } from './profile.mjs';
import {
  clearRegistry, registerRule, allRules, resolveSeverity, ConfigError,
} from './rules.mjs';
import {
  normalizeFinding, sortFindings, dedupe, assignIds, countFindings,
} from './findings.mjs';

const MODULE_LOADERS = {
  readability: () => import('../modules/readability/index.mjs'),
  seo: () => import('../modules/seo/index.mjs'),
  style: () => import('../modules/style/index.mjs'),
  grounding: () => import('../modules/grounding/index.mjs'),
};

export async function buildEngine(config, { modules = null } = {}) {
  clearRegistry();

  const wanted = new Set(
    modules && modules.length
      ? modules
      : Object.keys(MODULE_LOADERS).filter((name) => moduleInUse(config, name)),
  );

  const loaded = [];
  for (const name of Object.keys(MODULE_LOADERS)) {
    if (!wanted.has(name)) continue;
    let module;
    try {
      module = await MODULE_LOADERS[name]();
    } catch (error) {
      if (error?.code === 'ERR_MODULE_NOT_FOUND') continue;
      throw error;
    }
    const definition = module.default ?? module;
    loaded.push({ name, definition });
    for (const rule of definition.rules || []) registerRule(rule);
  }

  for (const rule of config.rules || []) {
    registerRule(rule);
  }

  validateSeverity(config);


  const pipeline = new Pipeline();

  pipeline.add({
    id: 'config',
    needs: [],
    run: () => config,
  });

  pipeline.add({
    id: 'discover',
    needs: ['config'],
    run: (context) => discover(config, { only: context.only || [] }),
  });

  pipeline.add({
    id: 'parse',
    needs: ['discover'],
    reads: [config.root],
    run: (context, view) => {
      const refs = view.get('discover');
      const docs = [];
      for (const ref of refs) {
        const profileName = ref.profileName || config.defaultProfile;
        const profile = config.profiles[profileName];
        if (!profile) {
          throw new ConfigError(`document ${ref.relativePath} routes to unknown profile '${profileName}'`);
        }
        docs.push(loadDocument(ref.absolutePath, ref.relativePath, { profile, profileName }));
      }
      return docs;
    },
  });

  const moduleStageIds = [];
  for (const { name, definition } of loaded) {
    for (const stage of definition.stages || []) {
      pipeline.add({ ...stage, module: name });
      if (stage.collects !== false) moduleStageIds.push(stage.id);
    }
  }

  pipeline.add({
    id: 'findings.collect',
    needs: ['parse', ...moduleStageIds],
    run: (context, view) => {
      const docs = view.get('parse');
      const perDocument = new Map(docs.map((doc) => [doc.path, []]));

      for (const stageId of moduleStageIds) {
        const produced = view.get(stageId) || [];
        for (const finding of produced) {
          const list = perDocument.get(finding.file);
          if (list) list.push(finding);
          else perDocument.set(finding.file, [finding]);
        }
      }

      for (const doc of docs) {
        for (const error of doc.frontmatterErrors) {
          perDocument.get(doc.path).push(
            normalizeFinding({
              rule: 'core.frontmatter',
              module: 'core',
              severity: 'error',
              file: doc.path,
              line: error.line,
              message: error.message,
              why: 'Every module reads frontmatter, so a parse failure makes the rest of the run meaningless.',
              fix: { kind: 'edit', instruction: 'Fix the YAML between the --- fences.' },
            }),
          );
        }
      }

      const documents = docs.map((doc) => {
        const findings = assignIds(sortFindings(dedupe(perDocument.get(doc.path) || [])));
        return {
          doc,
          path: doc.path,
          id: doc.id,
          profile: doc.profileName,
          findings,
          counts: countFindings(findings),
        };
      });

      const all = documents.flatMap((entry) => entry.findings);
      return { documents, findings: all, counts: countFindings(all) };
    },
  });

  return { pipeline, config, modules: loaded.map((entry) => entry.name), rules: allRules() };
}

/**
 * Run a rule over every document, honoring its resolved severity. A rule set to
 * `off` never executes, which is how turning a rule off also removes its cost.
 */
export function runRules(rules, docs, config, moduleName) {
  const findings = [];

  for (const doc of docs) {
    const profile = doc.profile || {};
    if (moduleName && !profile[moduleName]?.enabled) continue;

    for (const rule of rules) {
      const severity = resolveSeverity(rule, {
        severityOverrides: config.severity,
        profileSeverity: profile.severity,
      });
      if (severity === 'off') continue;

      const collected = [];
      const finding = (input) => {
        collected.push(
          normalizeFinding({
            rule: rule.id,
            module: rule.module,
            severity,
            file: doc.path,
            docs: rule.docs,
            why: input.why ?? rule.explain.split('\n')[0],
            ...input,
          }),
        );
      };

      try {
        rule.run({
          doc,
          blocks: doc.query,
          frontmatter: doc.frontmatter,
          config,
          profile,
          settings: profile[moduleName] || {},
          finding,
        });
      } catch (error) {
        collected.push(
          normalizeFinding({
            rule: 'core.rule-crashed',
            module: 'core',
            severity: 'error',
            file: doc.path,
            line: 1,
            message: `rule ${rule.id} threw: ${error.message}`,
            why: 'A rule that crashes silently would let a document pass unchecked.',
            fix: { kind: 'decision', instruction: `Report this with the document that triggered it. Rule: ${rule.id}` },
          }),
        );
      }

      findings.push(...collected);
    }
  }

  return findings;
}
