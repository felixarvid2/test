// Run lifecycle: creation, stats, upgrade offers, XP, damage and healing. All functions are pure
// state transitions on the RunState passed in (no Phaser, no DOM, no hidden randomness).
import { BALANCE } from '../config/balance';
import { BUFF_BY_ID } from '../data/buffs';
import { HEROES } from '../data/heroes';
import { SYNERGIES } from '../data/synergies';
import { UPGRADES, UPGRADE_BY_ID } from '../data/upgrades';
import { dailyChallenge } from './daily';
import { extraChoices, freeRerolls, metaEffects } from './meta';
import type { Rng } from './rng';
import { cloneStats, computeStats, scaleEffects } from './stats';
import type {
  GameMode, HeroId, Rarity, RunState, RunSummary, StatEffect, SynergyDef, UpgradeChoice, UpgradeDef, WeaponId,
} from './types';

const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
const rank = (r: Rarity): number => RARITY_ORDER.indexOf(r);

export interface CreateRunOpts {
  hero: HeroId;
  seed: number;
  mode: GameMode;
  meta: Record<string, number>;
  unlocks: string[];
  runId?: string;
  /** Daily mode only: UTC date key; defaults to today. Daily runs force the challenge's hero and seed. */
  dailyKey?: string;
}

export function createRun(opts: CreateRunOpts): RunState {
  let hero = opts.hero;
  let seed = opts.seed;
  let startUpgrade: string | undefined;
  let modifiers: StatEffect[] | undefined;
  if (opts.mode === 'daily') {
    const ch = dailyChallenge(opts.dailyKey);
    hero = ch.hero;
    seed = ch.seed;
    startUpgrade = ch.startUpgrade;
    modifiers = ch.modifier;
  }
  const run: RunState = {
    seed,
    mode: opts.mode,
    hero,
    room: 1,
    upgrades: {},
    weapons: [HEROES[hero].weapon],
    synergies: [],
    stats: cloneStats(BALANCE.baseStats),
    hp: 0,
    gold: 0,
    xp: 0,
    level: 1,
    kills: 0,
    soulStacks: 0,
    damageTaken: 0,
    roomsWithoutDamage: 0,
    phoenixUsed: 0,
    revived: false,
    legendariesPicked: 0,
    bossesDefeated: [],
    rerollsLeft: BALANCE.rerollsPerRun + freeRerolls(opts.meta),
    elapsed: 0,
    runId: opts.runId ?? `r${(seed >>> 0).toString(36)}-${Date.now().toString(36)}`,
    meta: { ...opts.meta },
    buffs: [],
    levelBonuses: 0,
    unlocks: opts.unlocks.slice(),
    modifiers,
    damageThisRoom: 0,
  };
  recomputeStats(run);
  run.hp = run.stats.maxHp;
  if (startUpgrade) applyUpgrade(run, startUpgrade);
  return run;
}

/**
 * Rebuilds run.stats from every source. A changed max HP moves current HP sensibly: gaining max HP also
 * heals that amount, losing it only clamps.
 */
export function recomputeStats(run: RunState): void {
  const hero = HEROES[run.hero];
  const base = { ...BALANCE.baseStats, ...hero.base };
  const sources: StatEffect[][] = [hero.passive.effects, ...metaEffects(run.meta)];
  for (const [id, level] of Object.entries(run.upgrades)) {
    const def = UPGRADE_BY_ID[id];
    if (def && level > 0 && def.effects.length > 0) sources.push(scaleEffects(def.effects, Math.min(level, def.maxLevel)));
  }
  for (const syn of SYNERGIES) if (run.synergies.includes(syn.id)) sources.push(syn.effects);
  for (const buff of run.buffs) {
    const def = BUFF_BY_ID[buff.id];
    if (def) sources.push(def.effects);
  }
  if (run.modifiers) sources.push(run.modifiers);
  if (run.levelBonuses > 0) sources.push(scaleEffects(BALANCE.levelUpEffects, run.levelBonuses));

  let stats = computeStats(sources, base);
  if (run.soulStacks > 0 && stats.soulHarvest > 0) {
    const bonus = Math.min(BALANCE.soulHarvestMaxBonus, run.soulStacks * stats.soulHarvest);
    stats = computeStats([...sources, [{ stat: 'damageMult', pct: bonus }]], base);
  }

  const oldMax = run.stats.maxHp;
  run.stats = stats;
  if (run.hp > 0) {
    if (stats.maxHp > oldMax) run.hp += stats.maxHp - oldMax;
    run.hp = Math.max(1, Math.min(run.hp, stats.maxHp));
  }
}

// ---- Upgrade offers ---------------------------------------------------------------------------

function ownsProjectileWeapon(run: RunState): boolean {
  return run.weapons.includes('bow') || run.weapons.includes('staff');
}

/** Can this card appear in a normal offer right now? */
export function isUpgradeAvailable(run: RunState, def: UpgradeDef, unlocks: readonly string[]): boolean {
  if (def.onPick) return false; // instant cards are filler only
  if ((run.upgrades[def.id] ?? 0) >= def.maxLevel) return false;
  if (def.unlock && !unlocks.includes(def.unlock)) return false;
  if (def.grantsWeapon) {
    return !run.weapons.includes(def.grantsWeapon) && run.weapons.length < BALANCE.weapons.maxWeapons;
  }
  if (def.requiresWeapon && !run.weapons.includes(def.requiresWeapon)) return false;
  // Cards that only matter for a weapon class are hidden until such a weapon is owned.
  if (def.tags.includes('projectile') && !ownsProjectileWeapon(run)) return false;
  if (def.tags.includes('melee') && !run.weapons.includes('sword')) return false;
  return true;
}

/** Names of synergies this card would complete (first) or advance (some partner already owned). */
export function synergyHintsFor(run: RunState, def: UpgradeDef): string[] {
  if ((run.upgrades[def.id] ?? 0) > 0) return [];
  const completes: string[] = [];
  const advances: string[] = [];
  for (const syn of SYNERGIES) {
    if (!syn.requires.includes(def.id) || run.synergies.includes(syn.id)) continue;
    const others = syn.requires.filter((r) => r !== def.id);
    const owned = others.filter((r) => (run.upgrades[r] ?? 0) > 0).length;
    if (owned === others.length) completes.push(syn.name);
    else if (owned > 0) advances.push(syn.name);
  }
  return [...completes, ...advances];
}

function choiceFor(run: RunState, def: UpgradeDef): UpgradeChoice {
  return { def, nextLevel: (run.upgrades[def.id] ?? 0) + 1, synergyHints: synergyHintsFor(run, def) };
}

function rarityWeight(r: Rarity, luck: number): number {
  return BALANCE.rarity.weights[r] * Math.exp(luck * BALANCE.rarity.luckExponent[r]);
}

/**
 * Rolls distinct upgrade cards. Rarity is rolled first (luck shifts it toward rare), then a card within
 * that rarity (hero favourite tags and synergy-advancing cards are likelier). `minRarity` (or the
 * shrine-set run.nextChoice) forces rare+ offers when enough cards exist. Always returns >= 1 card:
 * when the pool runs dry, Healing Potion / Gold Pouch fill in.
 */
export function rollUpgradeChoices(
  run: RunState,
  rng: Rng,
  opts: { count?: number; minRarity?: Rarity; unlocks?: string[] } = {},
): UpgradeChoice[] {
  const unlocks = opts.unlocks ?? run.unlocks ?? [];
  const count = Math.max(1, opts.count ?? BALANCE.choices.count + extraChoices(run.meta));
  const minRarity = opts.minRarity ?? run.nextChoice?.minRarity;
  const favored = new Set<string>(HEROES[run.hero].favoredTags);
  const luck = run.stats.luck;

  const pool = UPGRADES.filter((u) => isUpgradeAvailable(run, u, unlocks));
  const picked: UpgradeChoice[] = [];

  while (picked.length < count && pool.length > 0) {
    // Which rarities may this slot use?
    let ranks = RARITY_ORDER.filter((r) => pool.some((u) => u.rarity === r));
    if (minRarity) {
      const strict = ranks.filter((r) => rank(r) >= rank(minRarity));
      if (strict.length > 0) ranks = strict;
    } else {
      const gated = ranks.filter((r) => BALANCE.rarity.minRoom[r] <= run.room);
      if (gated.length > 0) ranks = gated;
    }
    const rarity = rng.weighted(ranks, (r) => rarityWeight(r, luck));
    const candidates = pool.filter((u) => u.rarity === rarity);
    const def = rng.weighted(candidates, (u) => {
      let w = 1;
      if (u.tags.some((t) => favored.has(t))) w *= BALANCE.heroTagWeight;
      if (synergyHintsFor(run, u).length > 0) w *= BALANCE.synergyWeight;
      return w;
    });
    picked.push(choiceFor(run, def));
    pool.splice(pool.indexOf(def), 1);
  }

  // Hurt: sometimes swap the last card for a potion.
  const potion = UPGRADE_BY_ID.potion;
  if (
    picked.length > 0 && !picked.some((c) => c.def.id === 'potion') &&
    run.hp / run.stats.maxHp < BALANCE.choices.potionLowHpThreshold && rng.chance(BALANCE.choices.potionLowHpChance)
  ) {
    picked[picked.length - 1] = choiceFor(run, potion);
  }
  // Pool exhausted: fillers keep the offer non-empty.
  for (const id of ['potion', 'gold_pouch']) {
    if (picked.length >= count) break;
    if (!picked.some((c) => c.def.id === id)) picked.push(choiceFor(run, UPGRADE_BY_ID[id]));
  }
  return picked;
}

export function pouchGold(run: RunState): number {
  return Math.round((BALANCE.economy.goldPouchBase + BALANCE.economy.goldPouchPerRoom * run.room) * run.stats.goldMult);
}

/** Takes an upgrade: +1 level, grants weapons, completes synergies, applies instant effects. */
export function applyUpgrade(run: RunState, id: string): { newSynergies: SynergyDef[]; weapon?: WeaponId } {
  const def = UPGRADE_BY_ID[id];
  if (!def) throw new Error(`Unknown upgrade: ${id}`);
  const result: { newSynergies: SynergyDef[]; weapon?: WeaponId } = { newSynergies: [] };
  const level = run.upgrades[id] ?? 0;
  if (level >= def.maxLevel) return result;
  run.upgrades[id] = level + 1;
  if (def.rarity === 'legendary' && level === 0) run.legendariesPicked += 1;
  if (def.grantsWeapon && !run.weapons.includes(def.grantsWeapon)) {
    run.weapons.push(def.grantsWeapon);
    result.weapon = def.grantsWeapon;
  }
  for (const syn of SYNERGIES) {
    if (run.synergies.includes(syn.id)) continue;
    if (syn.requires.every((r) => (run.upgrades[r] ?? 0) > 0)) {
      run.synergies.push(syn.id);
      result.newSynergies.push(syn);
    }
  }
  delete run.nextChoice;
  recomputeStats(run);
  if (def.onPick?.healFraction) healPlayer(run, run.stats.maxHp * def.onPick.healFraction);
  if (def.onPick?.gold) run.gold += pouchGold(run) * def.onPick.gold;
  return result;
}

// ---- XP, kills, damage, healing ---------------------------------------------------------------

export function xpToNext(level: number): number {
  const l = Math.max(0, level - 1);
  const { base, linear, quadratic } = BALANCE.xp;
  return Math.round(base + linear * l + quadratic * l * l);
}

/** Adds raw XP (xpMult is applied here) and returns the number of levels gained. */
export function addXp(run: RunState, amount: number): number {
  run.xp += Math.max(0, amount) * run.stats.xpMult;
  let gained = 0;
  while (gained < 50 && run.xp >= xpToNext(run.level)) {
    run.xp -= xpToNext(run.level);
    run.level += 1;
    run.levelBonuses += 1;
    gained += 1;
  }
  if (gained > 0) {
    recomputeStats(run);
    healPlayer(run, run.stats.maxHp * BALANCE.levelUpHealFraction * gained);
  }
  return gained;
}

/** Adds gold with goldMult applied; returns the amount added. */
export function addGold(run: RunState, base: number): number {
  const amount = base * run.stats.goldMult;
  run.gold += amount;
  return amount;
}

export function registerKill(run: RunState): void {
  run.kills += 1;
  if (run.stats.soulHarvest > 0) {
    const capped = run.soulStacks * run.stats.soulHarvest >= BALANCE.soulHarvestMaxBonus;
    if (!capped) {
      run.soulStacks += 1;
      recomputeStats(run);
    }
  }
}

export function registerBossKill(run: RunState, bossId: string): void {
  if (!run.bossesDefeated.includes(bossId)) run.bossesDefeated.push(bossId);
}

/** Applies an incoming hit: dodge, armor (flat, never below minDamageTaken), phoenix. */
export function damagePlayer(
  run: RunState,
  raw: number,
  rng: Rng,
): { taken: number; dodged: boolean; fatal: boolean; phoenix: boolean } {
  if (run.hp <= 0) return { taken: 0, dodged: false, fatal: true, phoenix: false };
  if (run.stats.dodge > 0 && rng.chance(run.stats.dodge)) return { taken: 0, dodged: true, fatal: false, phoenix: false };
  const taken = Math.max(BALANCE.minDamageTaken, Math.round(raw - run.stats.armor));
  run.hp -= taken;
  run.damageTaken += taken;
  run.damageThisRoom = (run.damageThisRoom ?? 0) + taken;
  let phoenix = false;
  if (run.hp <= 0) {
    if (run.phoenixUsed < run.stats.phoenixCharges) {
      run.phoenixUsed += 1;
      run.hp = 1;
      phoenix = true;
    } else {
      run.hp = 0;
    }
  }
  return { taken, dodged: false, fatal: run.hp <= 0, phoenix };
}

/** Heals up to max HP; returns the amount actually healed. */
export function healPlayer(run: RunState, amount: number): number {
  if (run.hp <= 0 || amount <= 0) return 0;
  const before = run.hp;
  run.hp = Math.min(run.stats.maxHp, run.hp + amount);
  return run.hp - before;
}

export function revivePlayer(run: RunState, hpFraction: number): void {
  run.hp = Math.max(1, Math.round(run.stats.maxHp * Math.min(1, Math.max(0, hpFraction))));
  run.revived = true;
}

// ---- Rooms, buffs, summary --------------------------------------------------------------------

/** Call when a room is cleared: next room number, clear heal, buff / curse countdown, no-damage streak. */
export function onRoomCleared(run: RunState): void {
  const untouched = (run.damageThisRoom ?? 0) === 0;
  if (untouched && run.roomsWithoutDamage === run.room - 1) run.roomsWithoutDamage = run.room;
  run.damageThisRoom = 0;
  run.room += 1;
  if (run.curseRooms && run.curseRooms > 0) run.curseRooms -= 1;
  const before = run.buffs.length;
  for (const b of run.buffs) b.roomsLeft -= 1;
  run.buffs = run.buffs.filter((b) => b.roomsLeft > 0);
  if (run.buffs.length !== before) recomputeStats(run);
  healPlayer(run, run.stats.maxHp * BALANCE.rooms.clearHealFraction);
}

/** Starts (or extends) a temporary buff / companion for `rooms` cleared rooms. */
export function applyBuff(run: RunState, buffId: string, rooms: number): void {
  if (!BUFF_BY_ID[buffId]) return;
  const existing = run.buffs.find((b) => b.id === buffId);
  if (existing) existing.roomsLeft = Math.max(existing.roomsLeft, rooms);
  else run.buffs.push({ id: buffId, roomsLeft: rooms });
  recomputeStats(run);
}

export function toSummary(run: RunState): RunSummary {
  return {
    runId: run.runId,
    mode: run.mode,
    hero: run.hero,
    roomsCleared: run.room - 1,
    kills: run.kills,
    gold: Math.floor(run.gold),
    level: run.level,
    bossesDefeated: run.bossesDefeated.slice(),
    synergies: run.synergies.slice(),
    durationSec: Math.round(run.elapsed),
    noDamageRooms: run.roomsWithoutDamage,
    legendaries: run.legendariesPicked,
  };
}
