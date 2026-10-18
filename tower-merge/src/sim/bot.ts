import { UNLOCK_ORDER } from '../data/map';
import { MAX_TOWER_LEVEL } from '../data/types';
import type { AbilityId, Rarity } from '../data/types';
import type { RunOptions, RunStats, SimEvent, WorldApi } from './api';
import { Rng } from './rng';
import { createWorld } from './World';
import type { WorldContent } from './World';

export type BotPolicy = 'greedy' | 'random' | 'noUpgrades' | 'mergeHeavy' | 'spreadOut';

export interface BotResult {
  stats: RunStats;
  /** Wave the run ended in (the wave the castle fell in, or the last wave reached). */
  waveReached: number;
  /** Simulated seconds played. */
  durationSeconds: number;
}

/** A fresh-save run: start towers only, all abilities, no meta bonuses. */
export function defaultRunOptions(seed: number, overrides: Partial<RunOptions> = {}): RunOptions {
  return {
    seed,
    towerPool: ['arrow', 'cannon', 'frost'],
    abilities: ['meteor', 'freeze', 'repair', 'frenzy'],
    castleHpBonus: 0,
    startCoinsBonus: 0,
    damagePct: 0,
    fireRatePct: 0,
    discountPct: 0,
    coinGainPct: 0,
    abilityCdPct: 0,
    startTowerLevel: 1,
    startingSlots: 4,
    freeRerolls: 0,
    ...overrides,
  };
}

/** Optional observer for balance tooling: sees every drained event batch. */
export interface BotHooks {
  onEvents?: (events: SimEvent[], world: WorldApi) => void;
}

const RARITY_SCORE: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };
const STEP = 0.1;
/** The bot acts every ACT_EVERY steps (0.2 s of game time). */
const ACT_EVERY = 2;

/**
 * Plays a complete headless run and returns the result. Deterministic for a given seed and policy.
 * 'noUpgrades' replaces the upgrade pool with nothing (only the generic fallback cards are offered).
 */
export function runBot(
  opts: RunOptions, policy: BotPolicy, maxWaves = 40, content?: WorldContent, hooks?: BotHooks,
): BotResult {
  const world = createWorld(opts, policy === 'noUpgrades' ? { ...content, upgrades: [] } : content);
  const rng = new Rng((opts.seed ^ 0x5bd1e995) + policy.length * 977);
  let ticks = 0;
  const maxTicks = 60 * 60 * 20 * 10; // 20 simulated minutes at 0.1 s steps: a hard stop against stalls
  while (ticks++ < maxTicks) {
    const evs = world.drainEvents();
    if (hooks?.onEvents && evs.length > 0) hooks.onEvents(evs, world);
    const phase = world.phase;
    if (phase === 'over') break;
    if (phase === 'defeated') {
      world.forfeit();
      break;
    }
    if (phase === 'upgrade') {
      pickUpgrade(world, policy, rng);
      continue;
    }
    if (phase === 'event') {
      resolveEvent(world);
      continue;
    }
    if (world.stats.wave > maxWaves) {
      world.forfeit();
      break;
    }
    if (ticks % ACT_EVERY === 0) {
      manageBoard(world, policy, rng);
      useAbilities(world);
    }
    world.update(STEP);
  }
  if (world.phase !== 'over') world.forfeit();
  const rest = world.drainEvents();
  if (hooks?.onEvents && rest.length > 0) hooks.onEvents(rest, world);
  return { stats: world.stats, waveReached: world.stats.wave, durationSeconds: world.stats.timeSeconds };
}

function pickUpgrade(world: WorldApi, policy: BotPolicy, rng: Rng): void {
  const choices = world.upgradeChoices;
  if (choices.length === 0) return;
  let pick = choices[0];
  if (policy === 'random') {
    pick = choices[rng.int(choices.length)];
  } else if (policy !== 'noUpgrades') {
    let best = -1;
    for (const c of choices) {
      const score = RARITY_SCORE[c.rarity] * 10 + rng.next();
      if (score > best) { best = score; pick = c; }
    }
  }
  world.chooseUpgrade(pick.id);
}

function resolveEvent(world: WorldApi): void {
  const ev = world.pendingEvent;
  if (!ev) return;
  const first = ev.options[0];
  const decline = ev.options[ev.options.length - 1];
  if (first && (first.cost ?? 0) <= world.coins - world.buyCost()) {
    if (world.resolveEvent(first.id)) return;
  }
  world.resolveEvent(decline.id);
}

function useAbilities(world: WorldApi): void {
  let alive = 0;
  let nearCastle = 0;
  let boss = false;
  for (const e of world.enemies) {
    if (!e.active) continue;
    alive++;
    if (e.isBoss) boss = true;
    if (e.y > 780) nearCastle++;
  }
  const hpFrac = world.castleHp / world.castleMaxHp;
  for (const a of world.abilities) {
    if (a.cooldown > 0) continue;
    const id: AbilityId = a.id;
    switch (id) {
      case 'meteor': if (alive >= 4 || boss) world.useAbility(id); break;
      case 'freeze': if (nearCastle >= 3 || (boss && hpFrac < 0.8)) world.useAbility(id); break;
      case 'repair': if (hpFrac < 0.6) world.useAbility(id); break;
      case 'frenzy': if (alive >= 8 || boss) world.useAbility(id); break;
    }
  }
}

/** Finds two towers that can merge, preferring the highest level. */
function findMerge(world: WorldApi): [number, number] | null {
  let best: [number, number] | null = null;
  let bestLevel = 0;
  const slots = world.slots;
  for (const a of slots) {
    const ta = a.tower;
    if (!ta || ta.level >= MAX_TOWER_LEVEL || ta.level <= bestLevel) continue;
    for (const b of slots) {
      if (b.id === a.id || !b.tower) continue;
      if (b.tower.type === ta.type && b.tower.level === ta.level) {
        best = [a.id, b.id];
        bestLevel = ta.level;
        break;
      }
    }
  }
  return best;
}

function freeSlots(world: WorldApi): number {
  let n = 0;
  for (const s of world.slots) if (s.unlocked && !s.tower) n++;
  return n;
}

function tryUnlock(world: WorldApi): boolean {
  for (const id of UNLOCK_ORDER) {
    if (!world.slots[id].unlocked) return world.unlockSlot(id);
  }
  return false;
}

function manageBoard(world: WorldApi, policy: BotPolicy, rng: Rng): void {
  for (let i = 0; i < 12; i++) {
    let acted = false;
    const merge = policy === 'spreadOut' ? null : findMerge(world);
    if (policy === 'random') {
      const r = rng.next();
      if (r < 0.45) acted = world.buyTower().ok;
      else if (r < 0.6) acted = tryUnlock(world);
      else if (r < 0.85 && merge) acted = world.moveTower(merge[0], merge[1]) === 'merged';
      else {
        const from = rng.int(12);
        const to = rng.int(12);
        acted = world.moveTower(from, to) !== 'invalid';
      }
      if (rng.chance(0.5)) return;
    } else if (merge) {
      acted = world.moveTower(merge[0], merge[1]) === 'merged';
    } else {
      const free = freeSlots(world);
      const unlockCost = world.unlockSlotCost();
      if (policy === 'spreadOut' && free < 2 && world.coins >= unlockCost) {
        acted = tryUnlock(world);
      } else if (free > 0 && world.coins >= world.buyCost()) {
        acted = world.buyTower().ok;
      } else if (free === 0) {
        const factor = policy === 'mergeHeavy' ? 3 : 1;
        if (world.coins >= unlockCost * factor) acted = tryUnlock(world);
      }
    }
    if (!acted) return;
  }
}
