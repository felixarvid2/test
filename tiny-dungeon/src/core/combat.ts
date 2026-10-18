// Combat maths shared by the game and the simulation. Pure functions of stats; no recursion: chains and
// explosions are breadth-limited by BALANCE.limits and never trigger further chains / explosions.
import { BALANCE } from '../config/balance';
import { WEAPONS } from '../data/weapons';
import { UPGRADES } from '../data/upgrades';
import type { Rng } from './rng';
import type { BossDef, Element, EnemyDef, RoomPlan, RunState, Stats, WeaponId } from './types';

export interface WeaponStats {
  damage: number;          // per hit, before crit
  cooldown: number;        // seconds between attacks
  range: number;           // targeting range / sword reach (px)
  count: number;           // projectiles per volley (1 for melee)
  arc: number;             // degrees (sword only)
  pierce: number;
  bounces: number;
  projectileSpeed: number; // px/s (0 for melee)
  knockback: number;       // px
  area: number;
}

/** Weapon level = 1 + levels of owned upgrades that require this weapon. */
export function weaponLevel(run: RunState, id: WeaponId): number {
  let level = 1;
  for (const u of UPGRADES) {
    if (u.requiresWeapon === id && !u.grantsWeapon) level += run.upgrades[u.id] ?? 0;
  }
  return level;
}

/** `secondary` = not the hero's starting weapon; those deal BALANCE.weapons.extraWeaponDamage of normal damage. */
export function weaponStatsFor(stats: Stats, id: WeaponId, level: number, secondary = false): WeaponStats {
  const def = WEAPONS[id];
  const flat = id === 'sword' ? stats.swordDamage : id === 'bow' ? stats.bowDamage : stats.staffDamage;
  const levelMult = 1 + BALANCE.weapons.levelDamageBonus * Math.max(0, level - 1);
  const damage = (def.baseDamage + flat) * stats.damageMult * levelMult * (secondary ? BALANCE.weapons.extraWeaponDamage : 1);
  const projectile = id !== 'sword';
  return {
    damage,
    cooldown: Math.max(BALANCE.weapons.minCooldown, def.cooldown / stats.attackSpeedMult),
    range: def.range * stats.rangeMult,
    count: id === 'sword' ? 1 : (id === 'bow' ? stats.bowArrows : 1) + stats.extraProjectiles,
    arc: id === 'sword' ? stats.swordArc : 0,
    pierce: projectile ? stats.pierce : 0,
    bounces: id === 'staff' ? stats.staffBounces : 0,
    projectileSpeed: (def.projectileSpeed ?? 0) * stats.projectileSpeedMult,
    knockback: def.knockback * stats.knockbackMult,
    area: stats.areaMult,
  };
}

export function weaponStats(run: RunState, id: WeaponId): WeaponStats {
  return weaponStatsFor(run.stats, id, weaponLevel(run, id), id !== run.weapons[0]);
}

/** The reference "base hit" that on-kill / periodic abilities scale from: mean damage of owned weapons. */
export function baseHitDamage(run: RunState): number {
  if (run.weapons.length === 0) return 0;
  let sum = 0;
  for (const w of run.weapons) sum += weaponStats(run, w).damage;
  return sum / run.weapons.length;
}

/** Crit roll. Frozen targets take extra crit chance and damage with Shatter. */
export function rollHit(
  stats: Stats,
  baseDamage: number,
  rng: Rng,
  opts: { frozen?: boolean } = {},
): { amount: number; crit: boolean } {
  const shatter = !!opts.frozen && stats.frostShatter > 0;
  const critChance = Math.min(1, stats.critChance + (shatter ? BALANCE.combat.shatterCritBonus : 0));
  const crit = rng.chance(critChance);
  let amount = baseDamage * (crit ? stats.critDamage : 1);
  if (shatter) amount *= 1 + BALANCE.combat.shatterDamageBonus;
  return { amount: Math.max(1, Math.round(amount)), crit };
}

export interface StatusRoll {
  burn: boolean;
  slow: boolean;
  freeze: boolean;   // independent per-hit chance; only possible once any slow source exists (slowAmount > 0)
  chain: boolean;
  poison: boolean;
  chaos: Element | null;
}

export function rollStatuses(stats: Stats, rng: Rng): StatusRoll {
  return {
    burn: stats.burnDps > 0 && rng.chance(stats.burnChance),
    slow: stats.slowAmount > 0 && rng.chance(stats.slowChance),
    freeze: stats.slowAmount > 0 && stats.freezeChance > 0 && rng.chance(stats.freezeChance),
    chain: stats.chainCount > 0 && rng.chance(stats.chainChance),
    poison: stats.poisonDps > 0 && rng.chance(stats.poisonChance),
    chaos: stats.chaosLevel > 0 && rng.chance(stats.chaosLevel) ? rng.pick(BALANCE.status.chaosElements) : null,
  };
}

/** Burn damage per second of ONE stack, for a hit of `hitDamage`. */
export function burnDps(stats: Stats, hitDamage: number): number {
  return hitDamage * stats.burnDps * stats.elementPower;
}

export function poisonDps(stats: Stats, hitDamage: number): number {
  return hitDamage * stats.poisonDps * stats.elementPower;
}

/** Strength of a Chaos Engine proc: a base-strength status of the given element. */
export function chaosEffect(stats: Stats, hitDamage: number, element: Element): { dps: number; slow: number; chainJumps: number; chainDamage: number } {
  const s = BALANCE.status;
  return {
    dps: element === 'fire' ? hitDamage * s.chaosBurnDps * stats.elementPower
      : element === 'poison' ? hitDamage * s.chaosPoisonDps * stats.elementPower : 0,
    slow: element === 'frost' ? s.chaosSlowAmount : 0,
    chainJumps: element === 'lightning' ? s.chaosChainCount : 0,
    chainDamage: hitDamage * 0.5 * stats.elementPower,
  };
}

/** Jumps of one chain, capped by the anti-runaway limit. */
export function chainJumps(stats: Stats): number {
  return Math.min(Math.floor(stats.chainCount), BALANCE.limits.maxChainJumpsPerHit);
}

/** Damage of each chain jump. Crits only when the Storm Crit flag is on (the caller rolls them). */
export function chainDamage(stats: Stats, hitDamage: number): number {
  return hitDamage * stats.chainDamage * stats.elementPower;
}

export function explosionDamage(stats: Stats, baseHit: number): number {
  return baseHit * stats.explosionDamage;
}

export function explosionRadius(stats: Stats): number {
  return stats.explosionRadius * stats.areaMult;
}

/** Chance that a kill explodes (Inferno Burst makes burning enemies always explode). */
export function explodeChanceFor(stats: Stats, burning: boolean): number {
  return burning && stats.burnExplode > 0 ? 1 : stats.explodeChance;
}

export function orbitDamage(stats: Stats, baseHit: number): number {
  return baseHit * stats.orbitDamage;
}

export function orbitRadius(stats: Stats): number {
  return BALANCE.combat.orbitRadius * Math.sqrt(stats.areaMult);
}

export function thunderDamage(stats: Stats, baseHit: number): number {
  return baseHit * BALANCE.combat.thunderDamage * stats.elementPower;
}

export function thunderStrikes(stats: Stats): number {
  return Math.min(Math.floor(stats.thunderLevel), BALANCE.limits.maxThunderStrikesPerPulse);
}

export function meteorDamage(stats: Stats, baseHit: number): number {
  return baseHit * BALANCE.combat.meteorDamage * stats.elementPower;
}

export function meteorRadius(stats: Stats): number {
  return BALANCE.combat.meteorRadius * stats.areaMult;
}

// ---- Enemy side -------------------------------------------------------------------------------

/** Raw damage of one enemy attack in this room (before the player's armor). */
export function enemyHitDamage(def: EnemyDef | BossDef, plan: Pick<RoomPlan, 'dmgMult'>, elite = false): number {
  const d = BALANCE.difficulty;
  return Math.max(1, Math.round(def.damage * plan.dmgMult * (elite ? d.eliteDmgMult : 1)));
}

export function enemyHp(def: EnemyDef | BossDef, plan: Pick<RoomPlan, 'hpMult'>, elite = false): number {
  return Math.max(1, Math.round(def.hp * plan.hpMult * (elite ? BALANCE.difficulty.eliteHpMult : 1)));
}

/** XP per kill grows with the room like gold does. */
export function enemyXp(def: EnemyDef | BossDef, roomIndex: number, elite = false): number {
  const g = 1 + BALANCE.difficulty.xpLinear * (roomIndex - 1);
  return def.xp * g * (elite ? BALANCE.difficulty.eliteRewardMult : 1);
}

/** Gold per kill before the player's goldMult. */
export function enemyGold(def: EnemyDef | BossDef, plan: Pick<RoomPlan, 'goldMult'>, elite = false): number {
  return def.gold * plan.goldMult * (elite ? BALANCE.difficulty.eliteRewardMult : 1);
}
