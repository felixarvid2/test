import { BALANCE } from '../data/balance';
import { ENEMIES } from '../data/enemies';
import type { BossId, EnemyId, WaveModifier } from '../data/types';
import { BOSS_IDS, ENEMY_IDS } from '../data/types';
import { spawnEnemy } from './enemies';
import type { PlanEntry, SimState, WavePlan } from './state';

const W = BALANCE.waves;

export const isBossWave = (wave: number): boolean => wave % W.bossEveryNWaves === 0;

/** Boss of a boss wave and how many full Goblin King/Golem/Dragon cycles came before it. */
export function bossForWave(wave: number): { id: BossId; loop: number } {
  const k = Math.max(1, Math.round(wave / W.bossEveryNWaves));
  return { id: BOSS_IDS[(k - 1) % BOSS_IDS.length], loop: Math.floor((k - 1) / BOSS_IDS.length) };
}

export const hpMultForWave = (wave: number): number =>
  W.hpScale * Math.pow(W.hpGrowth, wave - 1) * (1 + W.hpLinear * (wave - 1)) * Math.pow(W.hpLateGrowth, Math.max(0, wave - W.hpLateStart));

export const speedMultForWave = (wave: number): number => Math.min(W.speedCap, 1 + W.speedPerWave * (wave - 1));

export const budgetForWave = (wave: number): number => W.budgetBase + W.budgetPerWave * Math.pow(wave - 1, W.budgetExp);

export function naturalEliteChance(wave: number): number {
  const n = W.naturalElite;
  if (wave < n.fromWave) return 0;
  return Math.min(n.max, n.base + n.perWave * (wave - n.fromWave));
}

/** Combines the daily modifier and an event modifier (multiplicative, elite chance additive). */
export function mergeModifiers(a: WaveModifier | null | undefined, b: WaveModifier | null | undefined): WaveModifier {
  return {
    enemyHpMult: (a?.enemyHpMult ?? 1) * (b?.enemyHpMult ?? 1),
    enemySpeedMult: (a?.enemySpeedMult ?? 1) * (b?.enemySpeedMult ?? 1),
    enemyCountMult: (a?.enemyCountMult ?? 1) * (b?.enemyCountMult ?? 1),
    coinMult: (a?.coinMult ?? 1) * (b?.coinMult ?? 1),
    eliteChance: (a?.eliteChance ?? 0) + (b?.eliteChance ?? 0),
  };
}

/** Budget-based wave generation. Pure given the wave rng stream. */
export function buildPlan(s: SimState, mod: WaveModifier): WavePlan {
  const wave = s.wave;
  const rng = s.rngW;
  const boss = isBossWave(wave);
  const hpMult = hpMultForWave(wave) * (mod.enemyHpMult ?? 1);
  const speedMult = speedMultForWave(wave) * (mod.enemySpeedMult ?? 1);
  const coinMult = mod.coinMult ?? 1;
  let budget = budgetForWave(wave) * (mod.enemyCountMult ?? 1);
  if (boss) budget *= W.escortBudgetFraction;

  const pool: EnemyId[] = ENEMY_IDS.filter((id) => ENEMIES[id].firstWave <= wave && ENEMIES[id].weight > 0);
  const kinds: EnemyId[] = [];
  // Newly introduced types show up with a few guaranteed copies.
  if (wave > 1) {
    for (const id of pool) {
      if (ENEMIES[id].firstWave !== wave) continue;
      for (let i = 0; i < W.introCount && budget >= ENEMIES[id].threat; i++) {
        kinds.push(id);
        budget -= ENEMIES[id].threat;
      }
    }
  }
  const weights = pool.map((id) => ENEMIES[id].weight);
  while (kinds.length < W.maxEnemiesPerWave) {
    const affordable = pool.filter((id) => ENEMIES[id].threat <= budget);
    if (affordable.length === 0) break;
    let id = pool[rng.weighted(weights)];
    if (ENEMIES[id].threat > budget) id = affordable[rng.int(affordable.length)];
    kinds.push(id);
    budget -= ENEMIES[id].threat;
  }
  rng.shuffle(kinds);

  const eliteChance = Math.min(0.9, (mod.eliteChance ?? 0) + naturalEliteChance(wave));
  const duration = Math.min(W.spawnMax, W.spawnBase + W.spawnPerWave * (wave - 1));
  const entries: PlanEntry[] = [];
  const n = kinds.length;
  for (let i = 0; i < n; i++) {
    const spacing = duration / Math.max(1, n);
    const time = Math.max(0, (i + 0.5) * spacing + (rng.next() - 0.5) * spacing * 0.8) + (boss ? W.bossSpawnDelay + 0.6 : 0);
    entries.push({ time, kind: kinds[i], elite: eliteChance > 0 && rng.chance(eliteChance) });
  }
  entries.sort((a, b) => a.time - b.time);
  if (boss) entries.unshift({ time: W.bossSpawnDelay, kind: bossForWave(wave).id, elite: false });
  return { entries, isBoss: boss, hpMult, speedMult, coinMult, next: 0, elapsed: 0 };
}

/** Spawns every plan entry that is due. Entries blocked by the enemy cap stay queued. */
export function runSpawns(s: SimState, plan: WavePlan): void {
  while (plan.next < plan.entries.length && plan.entries[plan.next].time <= plan.elapsed) {
    const entry = plan.entries[plan.next];
    const isBoss = (BOSS_IDS as readonly string[]).includes(entry.kind);
    let ok;
    if (isBoss) {
      const loop = bossForWave(s.wave).loop;
      ok = spawnEnemy(s, entry.kind, {
        hpMult: (s.activeWaveMod?.enemyHpMult ?? 1) * Math.pow(hpMultForWave(s.wave), BALANCE.boss.hpWaveExp),
        speedMult: s.activeWaveMod?.enemySpeedMult ?? 1,
        coinMult: s.activeWaveMod?.coinMult ?? 1,
        loop,
      });
    } else {
      ok = spawnEnemy(s, entry.kind, { hpMult: plan.hpMult, speedMult: plan.speedMult, coinMult: plan.coinMult, elite: entry.elite });
    }
    if (!ok) return;
    plan.next++;
  }
}
