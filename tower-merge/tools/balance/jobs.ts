/**
 * Serializable run jobs and the pool that executes them on worker threads. A job describes a run
 * with plain data (so it can cross the thread boundary); the worker rebuilds options and content.
 */
import { Worker } from 'node:worker_threads';
import { SYNERGIES } from '../../src/data/synergies';
import { UPGRADES } from '../../src/data/upgrades';
import type { Effect, TowerId } from '../../src/data/types';
import type { BotPolicy } from '../../src/sim/bot';
import type { WorldContent } from '../../src/sim/World';
import { buildOptions } from './presets';
import type { MetaPreset } from './presets';
import { applyOverrides } from './overrides';
import { runInstrumented } from './run';
import type { RunRecord } from './run';

export interface JobSpec {
  seed: number;
  policy: BotPolicy;
  meta: MetaPreset;
  pool: TowerId[];
  poolLabel: string;
  maxWaves?: number;
  /** Synergies enabled in the run: all (undefined), none ([]) or just these ids. */
  synergies?: string[];
  /** Upgrade ids removed from the offer pool (A/B tests). */
  withoutUpgrades?: string[];
  /** Effects applied for the whole run from the start (forced synergy / upgrade probes). */
  forcedEffects?: Effect[];
  /** Free label passed through to the record's meta field. */
  tag?: string;
  /** Temporary number overrides (see overrides.ts), applied for the duration of the run. */
  set?: Record<string, number>;
}

export function runJob(j: JobSpec): RunRecord {
  const revert = applyOverrides(j.set);
  try {
    return runJobInner(j);
  } finally {
    revert();
  }
}

function runJobInner(j: JobSpec): RunRecord {
  const options = buildOptions({ seed: j.seed, meta: j.meta, pool: j.pool });
  if (j.forcedEffects && j.forcedEffects.length > 0) options.daily = { effects: j.forcedEffects };
  const content: WorldContent | undefined =
    j.synergies || j.withoutUpgrades
      ? {
        ...(j.synergies ? { synergies: SYNERGIES.filter((s) => j.synergies!.includes(s.id)) } : {}),
        ...(j.withoutUpgrades ? { upgrades: UPGRADES.filter((u) => !j.withoutUpgrades!.includes(u.id)) } : {}),
      }
      : undefined;
  return runInstrumented({
    seed: j.seed, policy: j.policy, options, meta: j.tag ?? j.meta, poolLabel: j.poolLabel, maxWaves: j.maxWaves, content,
  });
}

export interface Progress { done: number; total: number }

/**
 * Runs all jobs on `workers` threads (1 = in this thread). Results come back in job order.
 * `onProgress` is called after every finished job.
 */
export async function runJobs(
  jobs: JobSpec[], workers: number, onProgress?: (p: Progress) => void,
): Promise<RunRecord[]> {
  const results = new Array<RunRecord>(jobs.length);
  if (workers <= 1 || jobs.length < 4) {
    jobs.forEach((j, i) => {
      results[i] = runJob(j);
      onProgress?.({ done: i + 1, total: jobs.length });
    });
    return results;
  }
  let next = 0;
  let done = 0;
  const n = Math.min(workers, jobs.length);
  const url = new URL('./worker.mjs', import.meta.url);
  await Promise.all(Array.from({ length: n }, () => new Promise<void>((resolve, reject) => {
    const w = new Worker(url);
    const feed = (): void => {
      if (next >= jobs.length) { void w.terminate().then(() => resolve()); return; }
      const idx = next++;
      w.postMessage({ idx, job: jobs[idx] });
    };
    w.on('message', (m: { idx: number; rec?: RunRecord; error?: string }) => {
      if (m.error) { reject(new Error(m.error)); void w.terminate(); return; }
      results[m.idx] = m.rec as RunRecord;
      onProgress?.({ done: ++done, total: jobs.length });
      feed();
    });
    w.on('error', reject);
    feed();
  })));
  return results;
}
