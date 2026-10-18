import { describe, expect, it } from 'vitest';
import type { BotPolicy } from '../../src/sim/bot';
import { runBot } from '../../src/sim/bot';
import { buildOptions, towersForMeta } from '../../tools/balance/presets';
import type { MetaPreset } from '../../tools/balance/presets';

/** Fast guards for the balance targets documented in docs/BALANCE.md (run `npm run sim` for the full picture). */
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const SLOW = 90_000;

function play(meta: MetaPreset, seed: number, policy: BotPolicy = 'greedy') {
  const options = buildOptions({ seed, meta, pool: towersForMeta(meta, 'mixed') });
  return runBot(options, policy, 40);
}

const mean = (a: number[]): number => a.reduce((s, v) => s + v, 0) / a.length;

describe('balance regression', () => {
  it('greedy on a fresh save reaches wave 5..25 in 2.5..7 minutes, about wave 9..14 on average', () => {
    const runs = SEEDS.map((s) => play('fresh', s));
    for (const r of runs) {
      expect(r.waveReached).toBeGreaterThanOrEqual(5);
      expect(r.waveReached).toBeLessThanOrEqual(25);
    }
    const avgWave = mean(runs.map((r) => r.waveReached));
    const avgMin = mean(runs.map((r) => r.durationSeconds)) / 60;
    // eslint-disable-next-line no-console
    console.log(`fresh greedy: avg wave ${avgWave.toFixed(1)}, ${avgMin.toFixed(1)} min`);
    expect(avgWave).toBeGreaterThanOrEqual(9);
    expect(avgWave).toBeLessThanOrEqual(14);
    expect(avgMin).toBeGreaterThanOrEqual(2.5);
    expect(avgMin).toBeLessThanOrEqual(7);
  }, SLOW);

  it('meta progression pays off: fresh < mid < late, and late usually beats the Dragon (wave 15)', () => {
    const seeds = [1, 2, 3, 4];
    const avg = (meta: MetaPreset): { wave: number; beatDragon: number } => {
      const runs = seeds.map((s) => play(meta, s));
      return { wave: mean(runs.map((r) => r.waveReached)), beatDragon: runs.filter((r) => r.waveReached > 15).length };
    };
    const fresh = avg('fresh');
    const mid = avg('mid');
    const late = avg('late');
    // eslint-disable-next-line no-console
    console.log(`avg wave fresh ${fresh.wave.toFixed(1)}, mid ${mid.wave.toFixed(1)}, late ${late.wave.toFixed(1)} (${late.beatDragon}/4 beat the Dragon)`);
    expect(mid.wave).toBeGreaterThan(fresh.wave + 2);
    expect(late.wave).toBeGreaterThan(mid.wave + 1.5);
    expect(late.beatDragon).toBeGreaterThanOrEqual(3);
    expect(late.wave).toBeLessThanOrEqual(30);
  }, SLOW);

  it('merging is attractive but not the only way: spreadOut is far worse, mergeHeavy is not better than greedy', () => {
    const seeds = [1, 2, 3, 4, 5, 6];
    const avg = (p: BotPolicy): number => mean(seeds.map((s) => play('fresh', s, p).waveReached));
    const greedy = avg('greedy');
    const spread = avg('spreadOut');
    const heavy = avg('mergeHeavy');
    expect(spread).toBeLessThan(greedy - 2);
    expect(heavy).toBeLessThanOrEqual(greedy + 1);
    expect(heavy).toBeGreaterThan(spread);
  }, SLOW);

  it('every policy finishes with finite statistics and a consistent clock', () => {
    const policies: BotPolicy[] = ['greedy', 'random', 'noUpgrades', 'mergeHeavy', 'spreadOut'];
    for (const policy of policies) {
      const r = play('mid', 3, policy);
      const numbers = [r.waveReached, r.durationSeconds, ...Object.values(r.stats).filter((v): v is number => typeof v === 'number')];
      for (const v of [...Object.values(r.stats.towerDamage), ...Object.values(r.stats.towerKills)]) numbers.push(v as number);
      for (const v of numbers) expect(Number.isFinite(v), `${policy}`).toBe(true);
      expect(r.durationSeconds).toBeGreaterThan(30);
      expect(r.stats.coinsEarned).toBeGreaterThan(0);
    }
  }, SLOW);
});
