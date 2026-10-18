/**
 * "churn" bot: the greedy bot plus what a thoughtful player does with a full board and idle coins:
 * sell a lonely level 1 tower (losing 40% of its price) and buy again hoping for a merge partner.
 * Copied from src/sim/bot.ts (which keeps its helpers private) so the balance tools can show how
 * much of the merge dilution of big tower pools a human can recover.
 */
import { UNLOCK_ORDER } from '../../src/data/map';
import { MAX_TOWER_LEVEL } from '../../src/data/types';
import type { AbilityId, Rarity } from '../../src/data/types';
import type { RunOptions, WorldApi } from '../../src/sim/api';
import type { BotHooks, BotResult } from '../../src/sim/bot';
import { Rng } from '../../src/sim/rng';
import { createWorld } from '../../src/sim/World';
import type { WorldContent } from '../../src/sim/World';

const RARITY_SCORE: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };
const STEP = 0.1;
const ACT_EVERY = 2;

export function runChurnBot(opts: RunOptions, maxWaves = 40, content?: WorldContent, hooks?: BotHooks): BotResult {
  const world = createWorld(opts, content);
  const rng = new Rng((opts.seed ^ 0x5bd1e995) + 5 * 977);
  let ticks = 0;
  const maxTicks = 60 * 60 * 20 * 10;
  while (ticks++ < maxTicks) {
    const evs = world.drainEvents();
    if (hooks?.onEvents && evs.length > 0) hooks.onEvents(evs, world);
    const phase = world.phase;
    if (phase === 'over') break;
    if (phase === 'defeated') { world.forfeit(); break; }
    if (phase === 'upgrade') { pickUpgrade(world, rng); continue; }
    if (phase === 'event') { resolveEvent(world); continue; }
    if (world.stats.wave > maxWaves) { world.forfeit(); break; }
    if (ticks % ACT_EVERY === 0) {
      manageBoard(world);
      useAbilities(world);
    }
    world.update(STEP);
  }
  if (world.phase !== 'over') world.forfeit();
  const rest = world.drainEvents();
  if (hooks?.onEvents && rest.length > 0) hooks.onEvents(rest, world);
  return { stats: world.stats, waveReached: world.stats.wave, durationSeconds: world.stats.timeSeconds };
}

function pickUpgrade(world: WorldApi, rng: Rng): void {
  const choices = world.upgradeChoices;
  if (choices.length === 0) return;
  let pick = choices[0];
  let best = -1;
  for (const c of choices) {
    const score = RARITY_SCORE[c.rarity] * 10 + rng.next();
    if (score > best) { best = score; pick = c; }
  }
  world.chooseUpgrade(pick.id);
}

function resolveEvent(world: WorldApi): void {
  const ev = world.pendingEvent;
  if (!ev) return;
  const first = ev.options[0];
  const decline = ev.options[ev.options.length - 1];
  if (first && (first.cost ?? 0) <= world.coins - world.buyCost() && world.resolveEvent(first.id)) return;
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

function findMerge(world: WorldApi): [number, number] | null {
  let best: [number, number] | null = null;
  let bestLevel = 0;
  for (const a of world.slots) {
    const ta = a.tower;
    if (!ta || ta.level >= MAX_TOWER_LEVEL || ta.level <= bestLevel) continue;
    for (const b of world.slots) {
      if (b.id === a.id || !b.tower) continue;
      if (b.tower.type === ta.type && b.tower.level === ta.level) { best = [a.id, b.id]; bestLevel = ta.level; break; }
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
  for (const id of UNLOCK_ORDER) if (!world.slots[id].unlocked) return world.unlockSlot(id);
  return false;
}

/** The lonely level 1 tower whose type is least present on the board: the cheapest one to give up. */
function churnVictim(world: WorldApi): number {
  const count: Record<string, number> = {};
  for (const s of world.slots) if (s.tower) count[s.tower.type] = (count[s.tower.type] ?? 0) + 1;
  let victim = -1;
  let fewest = 99;
  for (const s of world.slots) {
    if (!s.tower || s.tower.level !== 1) continue;
    const c = count[s.tower.type];
    if (c < fewest) { fewest = c; victim = s.id; }
  }
  return victim;
}

function manageBoard(world: WorldApi): void {
  for (let i = 0; i < 12; i++) {
    let acted = false;
    const merge = findMerge(world);
    if (merge) {
      acted = world.moveTower(merge[0], merge[1]) === 'merged';
    } else {
      const free = freeSlots(world);
      if (free > 0 && world.coins >= world.buyCost()) {
        acted = world.buyTower().ok;
      } else if (free === 0) {
        if (world.coins >= world.unlockSlotCost()) {
          acted = tryUnlock(world);
        } else if (world.coins >= world.buyCost() * 2) {
          // slots are full and coins idle: reroll a lonely L1 tower
          const v = churnVictim(world);
          if (v >= 0 && world.sellTower(v)) acted = world.buyTower().ok;
        }
      }
    }
    if (!acted) return;
  }
}
