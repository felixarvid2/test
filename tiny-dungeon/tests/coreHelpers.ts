import { createRun } from '../src/core/run';
import type { HeroId, RunState } from '../src/core/types';

/** A fresh run for tests; all unlocks on by default so every card can be offered. */
export function makeRun(
  hero: HeroId = 'knight',
  opts: { meta?: Record<string, number>; unlocks?: string[]; seed?: number } = {},
): RunState {
  return createRun({
    hero,
    seed: opts.seed ?? 1,
    mode: 'normal',
    meta: opts.meta ?? {},
    unlocks: opts.unlocks ?? ['bow', 'staff'],
    runId: 'test-run',
  });
}
