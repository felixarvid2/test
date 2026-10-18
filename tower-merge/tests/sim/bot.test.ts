import { describe, expect, it } from 'vitest';
import type { BotPolicy } from '../../src/sim/bot';
import { defaultRunOptions, runBot } from '../../src/sim/bot';
import { UPGRADES } from '../../src/data/upgrades';

const POLICIES: BotPolicy[] = ['greedy', 'random', 'noUpgrades', 'mergeHeavy', 'spreadOut'];
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

function average(policy: BotPolicy): { wave: number; seconds: number; min: number } {
  let w = 0;
  let d = 0;
  let min = 999;
  for (const seed of SEEDS) {
    const r = runBot(defaultRunOptions(seed), policy, 40);
    w += r.waveReached;
    d += r.durationSeconds;
    min = Math.min(min, r.waveReached);
  }
  return { wave: w / SEEDS.length, seconds: d / SEEDS.length, min };
}

describe('bot', () => {
  it('returns stats, the wave reached and the duration for every policy', () => {
    for (const policy of POLICIES) {
      const r = runBot(defaultRunOptions(3), policy, 40);
      expect(r.waveReached).toBe(r.stats.wave);
      expect(r.durationSeconds).toBeCloseTo(r.stats.timeSeconds, 9);
      expect(r.stats.enemiesKilled).toBeGreaterThan(0);
      expect(r.stats.wavesCleared).toBeGreaterThanOrEqual(r.waveReached - 1);
      expect(r.stats.gemsEarned).toBeGreaterThan(0);
    }
  });

  it('stops at maxWaves', () => {
    const r = runBot(defaultRunOptions(1, { damagePct: 40, castleHpBonus: 1000 }), 'greedy', 5);
    expect(r.waveReached).toBeGreaterThanOrEqual(5);
    expect(r.waveReached).toBeLessThanOrEqual(6);
  });

  it('accepts fixture content', () => {
    const r = runBot(defaultRunOptions(2), 'greedy', 6, { upgrades: UPGRADES.slice(0, 5), synergies: [], events: [] });
    expect(r.stats.upgradesTaken.every((id) => UPGRADES.slice(0, 5).some((u) => u.id === id) || id.startsWith('fallback_'))).toBe(true);
  });

  it('a greedy run without meta bonuses typically dies around waves 9-14 within 3-6 simulated minutes', () => {
    const g = average('greedy');
    // eslint-disable-next-line no-console
    console.log(`greedy: avg wave ${g.wave.toFixed(1)}, avg ${g.seconds.toFixed(0)} s, worst wave ${g.min}`);
    expect(g.wave).toBeGreaterThanOrEqual(9);
    expect(g.wave).toBeLessThanOrEqual(14);
    expect(g.seconds).toBeGreaterThanOrEqual(180);
    expect(g.seconds).toBeLessThanOrEqual(400);
  }, 60_000);

  it('skipping upgrades dies noticeably earlier', () => {
    const g = average('greedy');
    const n = average('noUpgrades');
    // eslint-disable-next-line no-console
    console.log(`noUpgrades: avg wave ${n.wave.toFixed(1)}, avg ${n.seconds.toFixed(0)} s`);
    expect(n.wave).toBeLessThan(g.wave - 0.8);
  }, 60_000);

  it('merging beats never merging, and no policy loses in the first waves', () => {
    const spread = average('spreadOut');
    const greedy = average('greedy');
    expect(spread.wave).toBeLessThan(greedy.wave);
    for (const policy of POLICIES) {
      const a = policy === 'greedy' ? greedy : policy === 'spreadOut' ? spread : average(policy);
      expect(a.min, policy).toBeGreaterThanOrEqual(4);
    }
  }, 60_000);
});
