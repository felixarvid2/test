import { describe, expect, it } from 'vitest';
import { bankRun } from '../src/core/bank';
import { runGoldReward } from '../src/core/meta';
import type { RunSummary } from '../src/core/types';
import { defaultSave } from '../src/save/SaveManager';

function summary(over: Partial<RunSummary> = {}): RunSummary {
  return {
    runId: 'run-1', mode: 'normal', hero: 'knight', roomsCleared: 5, kills: 60, gold: 120, level: 6,
    bossesDefeated: [], synergies: [], durationSec: 200, noDamageRooms: 0, legendaries: 0, ...over,
  };
}

describe('bankRun', () => {
  it('banks a run once: gold, stats and lastRun', () => {
    const save = defaultSave();
    const s = summary();
    const r = bankRun(save, s, {});
    expect(r.alreadyBanked).toBe(false);
    expect(r.gold).toBe(runGoldReward(s));
    expect(r.gold).toBeGreaterThan(0);
    // gold includes the run reward plus any achievement rewards
    expect(save.gold).toBeGreaterThanOrEqual(r.gold);
    expect(save.gold).toBe(r.gold + r.earned.reduce((n, a) => n + (a.reward?.gold ?? 0), 0));
    expect(save.stats.runs).toBe(1);
    expect(save.stats.totalKills).toBe(60);
    expect(save.lastRun).toEqual(s);
    expect(r.newBest).toBe(true);
    expect(r.best).toBe(save.stats.bestRoom);
  });

  it('a second call for the same run grants nothing', () => {
    const save = defaultSave();
    const s = summary();
    const first = bankRun(save, s, {});
    const after = JSON.parse(JSON.stringify(save));
    const again = bankRun(save, s, {});
    expect(again.alreadyBanked).toBe(true);
    expect(again.gold).toBe(first.gold);
    expect(again.earned).toEqual([]);
    expect(again.newBest).toBe(false);
    expect(save).toEqual(after);
  });

  it('clears pendingRun of the same run, keeps one of another run', () => {
    const save = defaultSave();
    save.pendingRun = summary();
    bankRun(save, summary(), {});
    expect(save.pendingRun).toBeNull();

    const other = defaultSave();
    other.pendingRun = summary({ runId: 'run-2' });
    bankRun(other, summary(), {});
    expect(other.pendingRun?.runId).toBe('run-2');
  });

  it('clears pendingRun even when the run was already banked', () => {
    const save = defaultSave();
    bankRun(save, summary(), {});
    save.pendingRun = summary();
    const r = bankRun(save, summary(), {});
    expect(r.alreadyBanked).toBe(true);
    expect(save.pendingRun).toBeNull();
  });

  it('records the daily result in daily mode only', () => {
    const save = defaultSave();
    bankRun(save, summary({ mode: 'daily', roomsCleared: 7, kills: 90 }), { dailyKey: '2026-06-01' });
    expect(save.daily['2026-06-01']).toMatchObject({ bestRoom: 8, kills: 90, attempts: 1 });

    const normal = defaultSave();
    bankRun(normal, summary({ runId: 'n' }), { dailyKey: '2026-06-01' });
    expect(normal.daily).toEqual({});
  });
});
