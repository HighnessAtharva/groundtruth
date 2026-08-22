// The stage DAG.
//
// This exists to kill one specific bug class. In the harness this tool was
// extracted from, two scripts write the same JSON file: the first generates it
// from the span module, the second enriches it with resolved permalinks. Run
// them in the wrong order and every permalink in the corpus silently goes to
// zero. No error, no change in file count, nothing in the diff except numbers.
//
// The root cause is not ordering. The root cause is that a derived artifact is
// used as an input. Three defences here, and a fourth in `cache.mjs`.
//
// 1. Stages declare `needs`, and the runner topologically sorts them. There is
//    no CLI verb that runs a single stage, so an order cannot be expressed.
// 2. Stages declare `reads` and `writes` as path prefixes. Startup asserts no
//    stage writes a prefix another stage reads, and names both stages when it
//    does. That turns "we documented the trap" into "the trap cannot be built
//    again."
// 3. A stage may only see what it declared in `needs`. Reaching for the output
//    of a stage you did not declare throws, so a hidden dependency cannot form.

import { ConfigError } from './rules.mjs';

export class Pipeline {
  constructor() {
    this.stages = new Map();
  }

  add(stage) {
    if (!stage?.id) throw new ConfigError('a pipeline stage needs an id');
    if (typeof stage.run !== 'function') throw new ConfigError(`stage ${stage.id} needs a run function`);
    if (this.stages.has(stage.id)) throw new ConfigError(`duplicate stage id: ${stage.id}`);
    this.stages.set(stage.id, {
      id: stage.id,
      module: stage.module || 'core',
      needs: stage.needs || [],
      reads: stage.reads || [],
      writes: stage.writes || [],
      run: stage.run,
    });
    return this;
  }

  /** Stage ids in a legal run order, or throw naming the cycle. */
  order(upTo = null) {
    const wanted = upTo ? this.closure(upTo) : new Set(this.stages.keys());
    const sorted = [];
    const state = new Map();

    const visit = (id, trail) => {
      const status = state.get(id);
      if (status === 'done') return;
      if (status === 'visiting') {
        throw new ConfigError(`pipeline cycle: ${[...trail, id].join(' -> ')}`);
      }
      const stage = this.stages.get(id);
      if (!stage) throw new ConfigError(`stage ${trail[trail.length - 1] || '(root)'} needs ${id}, which does not exist`);
      state.set(id, 'visiting');
      for (const need of stage.needs) {
        if (!wanted.has(need)) continue;
        visit(need, [...trail, id]);
      }
      state.set(id, 'done');
      sorted.push(id);
    };

    for (const id of this.stages.keys()) {
      if (wanted.has(id)) visit(id, []);
    }
    return sorted;
  }

  closure(targets) {
    const wanted = new Set();
    const queue = Array.isArray(targets) ? [...targets] : [targets];
    while (queue.length) {
      const id = queue.pop();
      if (wanted.has(id)) continue;
      const stage = this.stages.get(id);
      if (!stage) throw new ConfigError(`unknown pipeline stage: ${id}`);
      wanted.add(id);
      queue.push(...stage.needs);
    }
    return wanted;
  }

  /**
   * The residual guard. A stage's writes may not overlap another stage's reads,
   * because that is exactly the shape that produced the original bug.
   */
  assertDisjoint() {
    const problems = [];
    for (const writer of this.stages.values()) {
      for (const reader of this.stages.values()) {
        if (writer.id === reader.id) continue;
        for (const written of writer.writes) {
          for (const read of reader.reads) {
            if (overlaps(written, read)) {
              problems.push(
                `stage '${writer.id}' writes '${written}' and stage '${reader.id}' reads '${read}'. ` +
                  'A derived artifact used as an input is how permalinks silently go to zero. ' +
                  'Give the reader its own address space.',
              );
            }
          }
        }
      }
    }
    if (problems.length) {
      throw new ConfigError(`pipeline is unsafe\n  ${problems.join('\n  ')}`);
    }
  }

  async run(context, { upTo = null, onStage = null } = {}) {
    this.assertDisjoint();
    const order = this.order(upTo);
    const outputs = new Map();

    for (const id of order) {
      const stage = this.stages.get(id);
      const view = viewFor(stage, outputs);
      const started = Date.now();
      const result = await stage.run(context, view);
      outputs.set(id, result);
      if (onStage) onStage({ id, module: stage.module, ms: Date.now() - started });
    }

    return { order, outputs };
  }
}

/**
 * A stage sees only the outputs of stages it declared in `needs`. Reaching past
 * that throws, so a hidden dependency never forms quietly.
 */
function viewFor(stage, outputs) {
  const allowed = new Set(stage.needs);
  return {
    get(id) {
      if (!allowed.has(id)) {
        throw new ConfigError(
          `stage '${stage.id}' read the output of '${id}' without declaring it in needs. ` +
            'Add it to needs so the ordering stays derivable.',
        );
      }
      return outputs.get(id);
    },
  };
}

function overlaps(a, b) {
  const left = String(a).replace(/\\/g, '/').replace(/\/+$/, '');
  const right = String(b).replace(/\\/g, '/').replace(/\/+$/, '');
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}
