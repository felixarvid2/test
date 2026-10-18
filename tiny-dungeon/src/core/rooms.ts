// Room planning: scaling curves, spawn waves from a budget, boss schedule and door choices.
import { BALANCE } from '../config/balance';
import { BOSSES } from '../data/bosses';
import { ENEMIES } from '../data/enemies';
import type { Rng } from './rng';
import type { BossDef, EnemyDef, Rarity, RoomPlan, RoomType, SpawnEntry } from './types';

/** Smooth per-room multipliers (linear x exponential in the room index, so no spikes). */
export function roomScaling(index: number): { hp: number; dmg: number; gold: number } {
  const i = Math.max(0, index - 1);
  const d = BALANCE.difficulty;
  return {
    hp: (1 + d.hpLinear * i) * Math.pow(d.hpGrowth, i),
    dmg: (1 + d.dmgLinear * i) * Math.pow(d.dmgGrowth, i),
    gold: 1 + d.goldLinear * i,
  };
}

/** Spawn budget of a combat room (enemy `cost`s are paid from it). */
export function spawnBudget(index: number): number {
  const i = Math.max(0, index - 1);
  const d = BALANCE.difficulty;
  return d.budgetBase + d.budgetLinear * i + d.budgetQuad * i * i;
}

export function eliteChance(index: number): number {
  const d = BALANCE.difficulty;
  return Math.min(d.eliteMax, d.eliteBase + d.eliteLinear * (index - 1));
}

export function isBossRoom(index: number): boolean {
  return index > 0 && index % BALANCE.rooms.bossEvery === 0;
}

/** Which boss fights in room `index` (null when it is not a boss room). The 3 bosses repeat every bossCycle rooms. */
export function bossForRoom(index: number): BossDef | null {
  if (!isBossRoom(index)) return null;
  const pos = ((index - 1) % BALANCE.bossCycle) + 1;
  return BOSSES.find((b) => b.room === pos) ?? null;
}

/** Number of completed boss cycles before this room (0 for rooms 1..15). */
export function bossLoop(index: number): number {
  return Math.floor((Math.max(1, index) - 1) / BALANCE.bossCycle);
}

function eligibleEnemies(index: number, unlocks: readonly string[]): EnemyDef[] {
  return ENEMIES.filter((e) => e.minRoom <= index && (!e.unlock || unlocks.includes(e.unlock)));
}

function enemyWeight(e: EnemyDef, index: number): number {
  const fresh = index - e.minRoom < 3 ? 1.6 : 1; // new enemies show up a bit more often
  return fresh / Math.pow(e.cost, 0.6);
}

export function planRoom(
  index: number,
  rng: Rng,
  opts: { unlocks: string[]; type?: RoomType; hpMult?: number },
): RoomPlan {
  const sc = roomScaling(index);
  const extraHp = opts.hpMult ?? 1;
  const boss = bossForRoom(index);
  const type: RoomType = boss ? 'boss' : opts.type && opts.type !== 'boss' ? opts.type : 'combat';

  if (type === 'boss' && boss) {
    const loop = bossLoop(index);
    return {
      index, type, spawns: [], bossId: boss.id,
      hpMult: sc.hp * (1 + BALANCE.difficulty.bossLoopHp * loop) * extraHp,
      dmgMult: sc.dmg * (1 + BALANCE.difficulty.bossLoopDmg * loop),
      goldMult: sc.gold,
    };
  }
  if (type === 'treasure' || type === 'shrine') {
    return { index, type, spawns: [], hpMult: sc.hp * extraHp, dmgMult: sc.dmg, goldMult: sc.gold };
  }

  const elite = type === 'elite';
  const r = BALANCE.rooms;
  const d = BALANCE.difficulty;
  const pool = eligibleEnemies(index, opts.unlocks);
  const waves = rng.int(r.waveCountMin, r.waveCountMax);
  const total = spawnBudget(index);
  const shares = Array.from({ length: waves }, () => rng.range(0.7, 1.3));
  const shareSum = shares.reduce((a, b) => a + b, 0);
  const merged = new Map<string, SpawnEntry>();
  let count = 0;

  for (let w = 0; w < waves; w++) {
    const at = Math.max(0.5, 0.8 + (w * (r.spawnDuration - 0.8)) / Math.max(1, waves - 1) + rng.range(-0.4, 0.4));
    const time = Math.round(at * 10) / 10;
    let remaining = (total * shares[w]) / shareSum;
    for (let guard = 0; guard < 40; guard++) {
      const capped = count >= r.enemyCountSoftCap;
      const unitMin = (e: EnemyDef): number => e.cost * (elite ? d.eliteCostMult : 1);
      const cands = pool.filter((e) => unitMin(e) <= remaining && (!capped || e.cost >= 3));
      if (cands.length === 0) break;
      const e = rng.weighted(cands, (c) => enemyWeight(c, index));
      let isElite = elite || rng.chance(eliteChance(index));
      let unit = e.cost * (isElite ? d.eliteCostMult : 1);
      if (unit > remaining) {
        isElite = false;
        unit = e.cost;
      }
      const n = isElite ? 1 : rng.int(1, Math.max(1, Math.min(r.maxGroupSize, Math.floor(remaining / unit))));
      const key = `${time}|${e.id}|${isElite}`;
      const prev = merged.get(key);
      if (prev) prev.count += n;
      else merged.set(key, isElite ? { at: time, enemy: e.id, count: n, elite: true } : { at: time, enemy: e.id, count: n });
      remaining -= n * unit;
      count += n;
    }
  }
  const spawns = [...merged.values()].sort((a, b) => a.at - b.at);
  return {
    index, type, spawns,
    hpMult: sc.hp * extraHp,
    dmgMult: sc.dmg,
    goldMult: sc.gold * (elite ? r.eliteRoomGoldMult : 1),
  };
}

/** The 1-2 doors offered after clearing room `index`. `prevType` is the type of the room just cleared. */
export function doorOptions(index: number, rng: Rng, prevType?: RoomType): RoomType[] {
  const next = index + 1;
  if (isBossRoom(next)) return ['boss'];
  const r = BALANCE.rooms;
  if (next < r.minSpecialRoom) return ['combat'];
  const special = (): RoomType => {
    const kinds = (['elite', 'treasure', 'shrine'] as const).filter((k) => !(k === 'treasure' && prevType === 'treasure'));
    return rng.weighted(kinds, (k) => r.specialWeights[k]);
  };
  if (rng.chance(r.secondDoorChance)) return rng.shuffle<RoomType>(['combat', special()]);
  return [rng.chance(r.singleDoorSpecialChance) ? special() : 'combat'];
}

/** Gold and minimum offer rarity of a treasure room. */
export function treasureReward(index: number, goldMult = 1): { gold: number; minRarity: Rarity } {
  const r = BALANCE.rooms;
  return {
    gold: Math.round((r.treasureGoldBase + r.treasureGoldPerRoom * index) * goldMult),
    minRarity: r.treasureMinRarity,
  };
}
