/**
 * One instrumented bot run. Uses BotHooks.onEvents to collect everything the report needs without
 * touching the simulation: per-wave economy samples, castle damage by source, tower damage per
 * (type, level) slot-second, upgrade picks, synergies, events and the final board.
 */
import { BOSSES } from '../../src/data/bosses';
import { ENEMIES } from '../../src/data/enemies';
import { BALANCE } from '../../src/data/balance';
import type { RunOptions, SimEvent, WorldApi } from '../../src/sim/api';
import type { WorldContent } from '../../src/sim/World';
import type { BotPolicy } from '../../src/sim/bot';
import { runBot } from '../../src/sim/bot';
import { runChurnBot } from './churnBot';
import { AIR_LANE, GROUND_LANE } from '../../src/sim/path';
import type { TowerId } from '../../src/data/types';

export interface WaveSample {
  wave: number;
  coins: number;
  bought: number;
  merged: number;
  towers: number;
  unlocked: number;
  hp: number;
  maxHp: number;
  isBoss: boolean;
  /** Wall-clock game seconds at the wave start. */
  t: number;
}

export interface RunConfig {
  seed: number;
  policy: BotPolicy | 'churn';
  options: RunOptions;
  /** Labels used for grouping in the report. */
  meta: string;
  poolLabel: string;
  maxWaves?: number;
  content?: WorldContent;
}

export interface RunRecord {
  cfg: { seed: number; policy: BotPolicy | 'churn'; meta: string; poolLabel: string; pool: TowerId[] };
  wave: number;
  cleared: number;
  seconds: number;
  gems: number;
  highestLevel: number;
  bought: number;
  merged: number;
  coinsEarned: number;
  /** True when the castle never fell (maxWaves reached). */
  survived: boolean;
  samples: WaveSample[];
  /** Castle damage by source ("goblin", "dragon", "dragon:fireBreath") over the whole run and in the death wave. */
  castleDamage: Record<string, number>;
  deathWaveDamage: Record<string, number>;
  /** Castle damage taken per wave (all sources) and by source in boss waves. */
  waveDamage: Record<number, number>;
  bossWaveSources: Record<number, Record<string, number>>;
  /** Tower-seconds lost to boss disables and fire scorch, per boss wave. */
  bossDisabled: Record<number, number>;
  /** Tower damage and kills by type from RunStats. */
  towerDamage: Record<string, number>;
  towerKills: Record<string, number>;
  /** Damage and slot-seconds by "type:level". */
  damageByTL: Record<string, number>;
  slotSecondsByTL: Record<string, number>;
  picks: { id: string; rarity: string; wave: number }[];
  synergies: { id: string; wave: number }[];
  events: { id: string; wave: number; tookFirst: boolean }[];
  finalBoard: string[];
  disabledTime: number;
}

const GROUND_END = GROUND_LANE.total;
const AIR_END = AIR_LANE.total;

interface Snap { id: number; kind: string; progress: number; flying: boolean; isBoss: boolean }

/** Runs one bot game with telemetry. */
export function runInstrumented(cfg: RunConfig): RunRecord {
  const rec: RunRecord = {
    cfg: { seed: cfg.seed, policy: cfg.policy, meta: cfg.meta, poolLabel: cfg.poolLabel, pool: [...cfg.options.towerPool] },
    wave: 0, cleared: 0, seconds: 0, gems: 0, highestLevel: 1, bought: 0, merged: 0, coinsEarned: 0, survived: false,
    samples: [], castleDamage: {}, deathWaveDamage: {}, waveDamage: {}, bossWaveSources: {}, bossDisabled: {}, towerDamage: {}, towerKills: {},
    damageByTL: {}, slotSecondsByTL: {}, picks: [], synergies: [], events: [], finalBoard: [], disabledTime: 0,
  };
  let snap: Snap[] = [];
  const lastDmg = new Map<number, number>();
  let lastT = 0;
  let lastEventWave = -1;
  const perWaveSrc: Record<number, Record<string, number>> = {};

  const expected = (kind: string, wave: number): number => {
    const e = (ENEMIES as Record<string, { castleDamage: number }>)[kind];
    if (e) return e.castleDamage * (1 + BALANCE.waves.castleDamagePerWave * (wave - 1));
    return (BOSSES as Record<string, { castleDamage: number }>)[kind]?.castleDamage ?? 0;
  };
  const add = (m: Record<string, number>, k: string, v: number): void => { m[k] = (m[k] ?? 0) + v; };

  const onEvents = (evs: SimEvent[], world: WorldApi): void => {
    const wave = world.stats.wave;
    const dt = world.stats.timeSeconds - lastT;
    lastT = world.stats.timeSeconds;

    // --- tower damage per (type, level) and slot-seconds
    for (const sl of world.slots) {
      const t = sl.tower;
      if (!t) continue;
      const key = `${t.type}:${t.level}`;
      const prev = lastDmg.get(t.uid);
      if (prev !== undefined) add(rec.damageByTL, key, t.damageDealt - prev);
      else add(rec.damageByTL, key, 0);
      lastDmg.set(t.uid, t.damageDealt);
      if (dt > 0 && dt < 1) add(rec.slotSecondsByTL, key, dt);
      if (t.disabledTime > 0 && dt > 0 && dt < 1) {
        rec.disabledTime += dt;
        if (wave % 5 === 0) rec.bossDisabled[wave] = (rec.bossDisabled[wave] ?? 0) + dt;
      }
    }

    // --- castle damage attribution: leakers vanished near the lane end without being listed as kills
    let hits: { damage: number }[] | null = null;
    let died: Set<number> | null = null;
    for (const e of evs) {
      if (e.type === 'castleHit') (hits ??= []).push(e);
      else if (e.type === 'enemyDied') (died ??= new Set()).add(e.enemyId);
    }
    if (hits) {
      const alive = new Set<number>();
      for (const e of world.enemies) if (e.active) alive.add(e.id);
      const leakers = snap.filter((s) => !alive.has(s.id) && s.progress > (s.flying ? AIR_END : GROUND_END) - 110 && !(died?.has(s.id)));
      const bossAlive = world.enemies.find((e) => e.active && e.isBoss);
      for (const h of hits) {
        let bestIdx = -1;
        let bestErr = Infinity;
        for (let i = 0; i < leakers.length; i++) {
          const err = Math.abs(expected(leakers[i].kind, wave) - h.damage);
          if (err < bestErr) { bestErr = err; bestIdx = i; }
        }
        let src: string;
        if (bestIdx >= 0 && bestErr < Math.max(1.5, h.damage * 0.35)) src = leakers.splice(bestIdx, 1)[0].kind;
        else if (bossAlive && (bossAlive.kind as string) === 'dragon') src = 'dragon:fireBreath';
        else src = 'other';
        add(rec.castleDamage, src, h.damage);
        rec.waveDamage[wave] = (rec.waveDamage[wave] ?? 0) + h.damage;
        add(perWaveSrc[wave] ??= {}, src, h.damage);
      }
    }
    snap = [];
    for (const e of world.enemies) {
      if (e.active) snap.push({ id: e.id, kind: e.kind, progress: e.progress, flying: e.flying, isBoss: e.isBoss });
    }

    // --- discrete events
    for (const e of evs) {
      switch (e.type) {
        case 'waveStart': {
          let towers = 0;
          let unlocked = 0;
          for (const s of world.slots) { if (s.tower) towers++; if (s.unlocked) unlocked++; }
          rec.samples.push({
            wave: e.wave, coins: world.coins, bought: world.stats.towersBought, merged: world.stats.towersMerged,
            towers, unlocked, hp: world.castleHp, maxHp: world.castleMaxHp, isBoss: e.isBoss, t: world.stats.timeSeconds,
          });
          break;
        }
        case 'upgradePicked': rec.picks.push({ id: e.id, rarity: e.rarity, wave }); break;
        case 'synergyActivated': rec.synergies.push({ id: e.id, wave }); break;
        case 'phaseChanged':
          if (e.phase === 'defeated') rec.finalBoard = board(world);
          break;
        default: break;
      }
    }
    if (world.phase === 'event' && world.pendingEvent && lastEventWave !== wave) {
      lastEventWave = wave;
      const ev = world.pendingEvent;
      const first = ev.options[0];
      // mirrors the bot: takes the first option when it can pay for it and still buy a tower
      rec.events.push({ id: ev.id, wave, tookFirst: !!first && (first.cost ?? 0) <= world.coins - world.buyCost() });
    }
    if (world.phase !== 'defeated' && world.phase !== 'over') rec.finalBoard = board(world);
  };

  const maxWaves = cfg.maxWaves ?? 40;
  const r = cfg.policy === 'churn'
    ? runChurnBot(cfg.options, maxWaves, cfg.content, { onEvents })
    : runBot(cfg.options, cfg.policy, maxWaves, cfg.content, { onEvents });
  const st = r.stats;
  rec.wave = r.waveReached;
  rec.cleared = st.wavesCleared;
  rec.seconds = r.durationSeconds;
  rec.gems = st.gemsEarned;
  rec.highestLevel = st.highestTowerLevel;
  rec.bought = st.towersBought;
  rec.merged = st.towersMerged;
  rec.coinsEarned = st.coinsEarned;
  rec.survived = r.waveReached > maxWaves;
  if (!rec.survived) rec.deathWaveDamage = perWaveSrc[rec.wave] ?? {};
  for (const w of Object.keys(perWaveSrc)) if (Number(w) % 5 === 0) rec.bossWaveSources[Number(w)] = perWaveSrc[Number(w)];
  rec.towerDamage = { ...st.towerDamage } as Record<string, number>;
  rec.towerKills = { ...st.towerKills } as Record<string, number>;
  return rec;
}

function board(world: WorldApi): string[] {
  const out: string[] = [];
  for (const s of world.slots) if (s.tower) out.push(`${s.tower.type}:${s.tower.level}`);
  return out;
}
