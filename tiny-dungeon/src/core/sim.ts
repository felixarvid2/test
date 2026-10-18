// Headless balance simulation. Uses the SAME rules code and data as the game (createRun, planRoom,
// rollUpgradeChoices, damagePlayer, ...) but replaces real-time combat with an analytical "fluid" model:
// each spawn group is a cohort with a fractional alive count and one HP pool; the build's damage per
// second (crit, multi-strike, projectiles, status DoTs, on-kill abilities, AoE coverage) is shared out
// over the cohorts in weapon reach each 0.4 s step, and incoming hits are sampled with the real
// damagePlayer. Assumptions and limits are documented in docs/BALANCE.md.
import { BALANCE } from '../config/balance';
import { BOSS_BY_ID } from '../data/bosses';
import { ENEMY_BY_ID } from '../data/enemies';
import { applyShrine, canUseShrine, curseHpMult, rollShrineOptions } from '../data/events';
import { HEROES, HERO_IDS } from '../data/heroes';
import { META_UPGRADES } from '../data/meta';
import {
  baseHitDamage, enemyGold, enemyHitDamage, enemyHp, enemyXp, weaponLevel, weaponStatsFor,
} from './combat';
import type { WeaponStats } from './combat';
import { buyHero, buyMeta, metaCost, runGoldReward } from './meta';
import { Rng } from './rng';
import { doorOptions, planRoom, treasureReward } from './rooms';
import {
  addGold, addXp, applyUpgrade, createRun, damagePlayer, healPlayer, onRoomCleared, registerBossKill,
  recomputeStats, registerKill, rollUpgradeChoices, toSummary,
} from './run';
import type { SaveData } from '../save/schema';
import type { BossDef, EnemyDef, HeroId, Rarity, RoomPlan, RoomType, RunState, UpgradeChoice, WeaponId } from './types';

export type Skill = 'novice' | 'average' | 'expert';
export type Strategy = 'random' | 'greedy' | 'synergy';
export type MetaPreset = 'none' | 'mid' | 'max';

/** Model constants (not game rules): how the fluid model maps the rules onto a fight. */
export const SIM = {
  dt: 0.4,
  spawnDistance: 330,        // px from the player where normal enemies appear
  summonDistance: 80,        // adds spawned by bosses / necromancers appear close
  bossDistance: 260,
  ringCap: 8,                // enemies that can touch the hero at once
  contactAttackRate: 1.0,    // attack attempts per second of a touching enemy
  erraticSpeedFactor: 0.7,   // erratic movers approach slower than their top speed
  meleeChaseDelay: 3,        // seconds a sword needs to catch up with ranged / summoner enemies
  reachBonus: 40,            // px the player walks toward enemies before they arrive
  swordTargetsBase: 1.8,     // enemies hit per swing at 110 degrees in a crowd
  arrowAccuracy: 0.45,       // extra arrows / bolts landing
  pierceHit: 0.45,           // chance a piercing arrow finds another enemy in line
  bounceHit: 0.75,
  orbitTouchesPerBlade: 1 / BALANCE.combat.orbitTouchInterval,
  roomTail: 1.5,             // seconds to walk / pick up after the last kill
  maxRoomTime: 150,
  bossBodyRate: 0.5,         // boss contact attempts per second once it arrives
  knockbackBenefit: 0.15,    // fewer melee touches per +100% knockback (sword only)
  kiteBonus: 0.04,           // extra avoided attempts when no melee weapon is owned (the hero backs away while shooting)
  kiteBossBonus: 0.05,
  speedAvoid: 0.3,
  skill: {
    novice: { avoid: 0.25, bossAvoid: 0.3, specialBonus: 0.08 },
    average: { avoid: 0.45, bossAvoid: 0.45, specialBonus: 0.1 },
    expert: { avoid: 0.65, bossAvoid: 0.7, specialBonus: 0.12 },
  } as Record<Skill, { avoid: number; bossAvoid: number; specialBonus: number }>,
};

const EPS = 0.02;
const RARITY_RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };

interface Cohort {
  def: EnemyDef | null;
  boss: BossDef | null;
  elite: boolean;
  n: number;
  hpEach: number;
  armor: number;
  spawnAt: number;
  dist: number;
  speedEff: number;
  arriveAt: number;
  dmg: number;
  rate: number;              // attack attempts per second per enemy once engaged
  kind: 'contact' | 'lunge' | 'ranged' | 'boss' | 'egg';
  xp: number;
  gold: number;
  summonAcc: number;
  hatchAt: number;           // eggs only: what is left of the cohort hatches at this time
}

interface WeaponRun {
  id: WeaponId;
  ws: WeaponStats;
  melee: boolean;
  strikes: number;           // damage-weighted attacks per second (repeats count at multiStrikeDamage)
  hitsPerSec: number;        // attack events per second (repeats count fully, for status procs)
  avgHit: number;
}

interface Build {
  weapons: WeaponRun[];
  baseHit: number;
  slowCover: number;
  frozenCover: number;
  burnCover: number;
  burnStacks: number;
  poisonCover: number;
}

export interface RoomOutcome {
  cleared: boolean;
  time: number;
  kills: number;
  /** Boss rooms: fraction of boss HP left when the room ended (0 when it was beaten). */
  bossLeft?: number;
}

function poisson(lambda: number, rng: Rng): number {
  if (lambda <= 0) return 0;
  const l = Math.exp(-Math.min(lambda, 30));
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng.next();
  } while (p > l && k < 40);
  return k - 1;
}

function makeBuild(run: RunState, levels: Partial<Record<WeaponId, number>>): Build {
  const s = run.stats;
  const weapons: WeaponRun[] = run.weapons.map((id) => {
    const ws = weaponStatsFor(s, id, levels[id] ?? 1, id !== run.weapons[0]);
    return {
      id, ws, melee: id === 'sword', avgHit: 0,
      strikes: (1 / ws.cooldown) * (1 + s.multiStrike * BALANCE.weapons.multiStrikeDamage),
      hitsPerSec: (1 / ws.cooldown) * (1 + s.multiStrike),
    };
  });
  const rho = weapons.reduce((m, w) => Math.max(m, w.hitsPerSec), 0); // hits per second on a focused target
  const cover = (chance: number, dur: number): number => 1 - Math.exp(-rho * chance * dur);
  const slowCover = s.slowAmount > 0 ? cover(s.slowChance, BALANCE.status.slowDuration) : 0;
  const orbitFrozen = s.orbitFreeze > 0 && s.orbitBlades > 0 ? 0.3 : 0;
  const frozenCover = Math.min(
    0.7, (s.slowAmount > 0 ? cover(s.freezeChance, BALANCE.status.freezeDuration) : 0) + orbitFrozen,
  );
  const critMul = 1 + s.critChance * (s.critDamage - 1);
  const shatter = s.frostShatter > 0
    ? 1 + frozenCover * (BALANCE.combat.shatterCritBonus * (s.critDamage - 1) + BALANCE.combat.shatterDamageBonus)
    : 1;
  for (const w of weapons) w.avgHit = w.ws.damage * critMul * shatter;
  return {
    weapons,
    baseHit: baseHitDamage(run),
    slowCover,
    frozenCover,
    burnCover: s.burnDps > 0 ? cover(s.burnChance, BALANCE.status.burnDuration) : 0,
    burnStacks: s.burnDps > 0 ? Math.min(s.burnMaxStacks, rho * s.burnChance * BALANCE.status.burnDuration) : 0,
    poisonCover: s.poisonDps > 0 ? cover(s.poisonChance, BALANCE.status.poisonDuration) : 0,
  };
}

/** Spreads `h` simultaneous instances (each worth `per(c)` damage this step) over cohorts, by head count. */
function allocate(list: Cohort[], h: number, per: (c: Cohort) => number): void {
  let w = 0;
  for (const c of list) w += c.n * (c.boss ? 2 : 1);
  if (w <= 0 || h <= 0) return;
  for (const c of list) {
    if (c.n <= 0) continue;
    const share = (h * c.n * (c.boss ? 2 : 1)) / w;
    const dealt = Math.min(c.n * c.hpEach, share * per(c));
    if (dealt <= 0) continue;
    c.n -= dealt / c.hpEach;
    if (c.n < 1e-6) c.n = 0;
  }
}

// ------------------------------------------------------------------------------------------------
// One room

export function simulateRoom(run: RunState, plan: RoomPlan, rng: Rng, skill: Skill): RoomOutcome {
  const base = SIM.skill[skill];
  const kite = !run.weapons.includes('sword');
  // faster movement dodges more: +0.3 avoid per +100% speed over the base, at most +0.2
  const speedAvoid = Math.min(0.2, Math.max(0, SIM.speedAvoid * (run.stats.moveSpeed / BALANCE.baseStats.moveSpeed - 1)));
  const sk = {
    avoid: base.avoid + (kite ? SIM.kiteBonus : 0) + speedAvoid,
    bossAvoid: base.bossAvoid + (kite ? SIM.kiteBossBonus : 0) + speedAvoid,
    specialBonus: base.specialBonus,
  };
  const boss: BossDef | null = plan.bossId ? BOSS_BY_ID[plan.bossId] : null;
  const cohorts: Cohort[] = [];
  const pending = plan.spawns.slice().sort((a, b) => a.at - b.at);
  let pi = 0;
  let bossPending = boss !== null;
  let bossNext = 0;
  let t = 0;
  let killAcc = 0;
  let kills = 0;
  let thunderT = 0;
  let meteorT = 0;
  const dt = SIM.dt;
  const levels: Partial<Record<WeaponId, number>> = {};
  for (const w of run.weapons) levels[w] = weaponLevel(run, w);

  const addCohort = (def: EnemyDef, count: number, elite: boolean, dist: number, build: Build): void => {
    const egg = def.behavior === 'egg';
    const speedBase = def.speed * (def.behavior === 'erratic' ? SIM.erraticSpeedFactor : 1);
    // eggs never move: they are laid next to the hero, so they are in reach (and "arrived") at once
    const speedEff = egg ? 1000
      : Math.max(8, speedBase * (1 - run.stats.slowAmount * build.slowCover) * (1 - build.frozenCover * 0.6));
    const kind: Cohort['kind'] = egg ? 'egg' : def.behavior === 'ranged' || def.behavior === 'summoner' ? 'ranged'
      : def.behavior === 'lunge' ? 'lunge' : 'contact';
    const stopDist = kind === 'ranged' ? (def.attackRange ?? 300) * 0.9
      : kind === 'lunge' ? (def.attackRange ?? 90) * 0.8 : def.radius + 25;
    const rate = def.behavior === 'summoner' || egg ? 0
      : kind === 'contact' ? SIM.contactAttackRate * (def.behavior === 'erratic' ? 0.6 : 1)
        : 1 / (def.attackCooldown ?? 2.2);
    cohorts.push({
      def, boss: null, elite, n: count, hpEach: enemyHp(def, plan, elite), armor: def.armor ?? 0,
      spawnAt: t, dist, speedEff, arriveAt: t + Math.max(0, (dist - stopDist) / speedEff),
      dmg: enemyHitDamage(def, plan, elite), rate, kind,
      xp: enemyXp(def, plan.index, elite), gold: enemyGold(def, plan, elite), summonAcc: 0,
      hatchAt: t + (def.windup ?? 0),
    });
  };

  const liveCount = (): number => cohorts.reduce((a, c) => a + (c.n > EPS ? c.n : 0), 0);

  while (t < SIM.maxRoomTime) {
    const build = makeBuild(run, levels);
    const s = run.stats;

    // --- spawns
    while (pi < pending.length && pending[pi].at <= t) {
      const e = pending[pi++];
      const def = ENEMY_BY_ID[e.enemy];
      if (def && liveCount() < BALANCE.limits.maxEnemiesAlive) addCohort(def, e.count, !!e.elite, SIM.spawnDistance, build);
    }
    if (bossPending && boss) {
      bossPending = false;
      const speedEff = Math.max(10, boss.speed * (1 - s.slowAmount * build.slowCover * 0.5));
      cohorts.push({
        def: null, boss, elite: false, n: 1, hpEach: enemyHp(boss, plan), armor: 0, spawnAt: t,
        dist: SIM.bossDistance, speedEff,
        arriveAt: t + Math.max(0, (SIM.bossDistance - boss.radius - 20) / speedEff),
        dmg: enemyHitDamage(boss, plan), rate: SIM.bossBodyRate, kind: 'boss',
        xp: enemyXp(boss, plan.index), gold: enemyGold(boss, plan), summonAcc: 0, hatchAt: 0,
      });
      bossNext = t + 1.5;
    }
    const spawned = cohorts.filter((c) => c.n > EPS);
    const snap = spawned.map((c) => c.n);

    // --- damage dealt by weapons
    const reachOf = (c: Cohort, w: WeaponRun): number => {
      if (w.melee && c.kind === 'ranged') return c.arriveAt + SIM.meleeChaseDelay;
      const range = w.ws.range + SIM.reachBonus + (c.boss ? c.boss.radius : 0);
      return c.spawnAt + Math.max(0, (c.dist - range) / c.speedEff);
    };
    const reachable = new Set<Cohort>();
    let hitInstances = 0;   // damage instances landing per second (for on-hit procs)
    let focusTargets = 1;   // enemies that receive status effects per strike
    for (const w of build.weapons) {
      const list = spawned.filter((c) => reachOf(c, w) <= t);
      for (const c of list) reachable.add(c);
      const a = list.reduce((x, c) => x + c.n, 0);
      if (a <= 0) continue;
      const ws = w.ws;
      let h: number;
      if (w.melee) {
        h = 1 + (SIM.swordTargetsBase - 1) * (ws.arc / BALANCE.weapons.swordBaseArc) * Math.sqrt(ws.area) * Math.sqrt(s.rangeMult);
        h = Math.min(Math.max(a, 1), h, 8);
      } else if (w.id === 'bow') {
        h = (1 + SIM.arrowAccuracy * (ws.count - 1)) * (1 + SIM.pierceHit * Math.min(ws.pierce, Math.max(0, a - 1)));
      } else {
        h = (1 + SIM.arrowAccuracy * (ws.count - 1)) * (1 + SIM.bounceHit * Math.min(ws.bounces + ws.pierce, Math.max(0, a - 1)));
      }
      hitInstances += w.hitsPerSec * h;
      focusTargets = Math.max(focusTargets, h);
      allocate(list, h, (c) => w.strikes * Math.max(1, w.avgHit - c.armor) * dt);
    }
    const anyList = [...reachable].filter((c) => c.n > 0);
    const aAny = anyList.reduce((x, c) => x + c.n, 0);
    const ep = s.elementPower;
    if (aAny > 0) {
      const kDot = Math.min(Math.max(aAny, 1), focusTargets);
      if (build.burnStacks > 0) {
        allocate(anyList, kDot * build.burnCover, () => build.burnStacks * build.baseHit * s.burnDps * ep * dt);
      }
      if (build.poisonCover > 0) {
        const spread = s.poisonSpread > 0 ? Math.min(Math.max(0, aAny - kDot), 1.5) : 0;
        const cover = Math.min(1, build.poisonCover + (s.explosionPoison > 0 && s.explodeChance > 0 ? 0.3 : 0));
        allocate(anyList, (kDot + spread) * cover, () => build.baseHit * s.poisonDps * ep * dt);
      }
      if (s.chainCount > 0 && s.chainChance > 0) {
        const jumps = Math.min(Math.floor(s.chainCount), BALANCE.limits.maxChainJumpsPerHit, Math.max(0, aAny - 1));
        const critMul = s.chainCanCrit > 0 ? 1 + s.critChance * (s.critDamage - 1) : 1;
        allocate(anyList, hitInstances * s.chainChance * jumps, () => build.baseHit * s.chainDamage * ep * critMul * dt);
      }
      if (s.chaosLevel > 0) {
        // average proc: burn (0.9 hit), poison (1.0), chain (1.0), frost (0) over four elements
        allocate(anyList, hitInstances * s.chaosLevel, () => 0.73 * build.baseHit * ep * dt);
      }
    }
    const live = spawned.filter((c) => c.n > 0);
    const aLive = live.reduce((x, c) => x + c.n, 0);
    if (aLive > 0) {
      if (s.thunderLevel > 0) {
        thunderT += dt;
        while (thunderT >= s.thunderInterval) {
          thunderT -= s.thunderInterval;
          const strikes = Math.min(Math.floor(s.thunderLevel), BALANCE.limits.maxThunderStrikesPerPulse);
          const aoe = 1 + 0.3 * Math.min(1, Math.max(0, aLive - 1) / 3);
          allocate(live, strikes, () => build.baseHit * BALANCE.combat.thunderDamage * ep * aoe);
        }
      }
      if (s.meteorLevel > 0) {
        meteorT += dt;
        while (meteorT >= s.meteorInterval) {
          meteorT -= s.meteorInterval;
          const aoe = Math.min(Math.max(aLive, 1), 1 + 1.5 * Math.sqrt(s.areaMult) * Math.min(1, Math.max(0, aLive - 1) / 4));
          allocate(live, s.meteorLevel, () => build.baseHit * BALANCE.combat.meteorDamage * ep * aoe);
        }
      }
      if (s.orbitBlades > 0) {
        const engaged = live.filter((c) => t >= c.arriveAt);
        const e = engaged.reduce((x, c) => x + c.n, 0);
        if (e > 0) {
          allocate(engaged, s.orbitBlades * SIM.orbitTouchesPerBlade * Math.min(1, e / 2), () => build.baseHit * s.orbitDamage * dt);
        }
      }
    }

    // --- on-kill explosions (one pass per step, never chained)
    let killedSoFar = 0;
    spawned.forEach((c, i) => { killedSoFar += snap[i] - c.n; });
    if (killedSoFar > 0) {
      const pExplode = s.burnExplode > 0 ? build.burnCover + (1 - build.burnCover) * s.explodeChance : s.explodeChance;
      if (pExplode > 0) {
        const radius = s.explosionRadius * s.areaMult;
        const rest = spawned.filter((c) => c.n > 0);
        const aRest = rest.reduce((x, c) => x + c.n, 0);
        const hits = Math.min(aRest, 1 + 1.2 * Math.pow(radius / 80, 2));
        const explosions = Math.min(killedSoFar * pExplode, BALANCE.limits.maxExplosionsPerFrame);
        if (hits > 0) allocate(rest, explosions, () => build.baseHit * s.explosionDamage * hits);
      }
    }

    // --- rewards for everything that died this step
    let killedStep = 0;
    let xpGain = 0;
    let goldGain = 0;
    spawned.forEach((c, i) => {
      const k = snap[i] - c.n;
      if (k <= 0) return;
      killedStep += k;
      xpGain += k * c.xp;
      goldGain += k * c.gold;
    });
    if (killedStep > 0) {
      addGold(run, goldGain);
      addXp(run, xpGain);
      healPlayer(run, s.lifeOnKill * killedStep);
      killAcc += killedStep;
      while (killAcc >= 1) {
        killAcc -= 1;
        kills += 1;
        registerKill(run);
      }
    }
    // spent-out cohorts that are only fractional dust
    for (const c of spawned) if (c.n > 0 && c.n < EPS) c.n = 0;

    // --- summoners
    for (const c of spawned) {
      if (c.def?.behavior !== 'summoner' || c.n <= EPS || t < c.arriveAt) continue;
      c.summonAcc += (c.n * dt * (c.def.summonCount ?? 2)) / (c.def.attackCooldown ?? 6);
      const k = Math.floor(c.summonAcc);
      const add = c.def.summon ? ENEMY_BY_ID[c.def.summon] : undefined;
      if (k >= 1 && add) {
        c.summonAcc -= k;
        if (liveCount() < BALANCE.limits.maxEnemiesAlive) addCohort(add, k, false, SIM.summonDistance, build);
      }
    }

    // --- eggs: whatever was not broken in time hatches into `summonCount` x `summon` each
    for (const c of spawned) {
      if (c.kind !== 'egg' || c.n <= EPS || t < c.hatchAt) continue;
      const add = c.def?.summon ? ENEMY_BY_ID[c.def.summon] : undefined;
      if (add && liveCount() < BALANCE.limits.maxEnemiesAlive) addCohort(add, c.n * (c.def?.summonCount ?? 1), false, SIM.summonDistance, build);
      c.n = 0;
    }

    // --- boss
    const bossCohort = cohorts.find((c) => c.boss);
    if (bossCohort && boss && bossCohort.n > 0) {
      while (t >= bossNext) {
        const phase = [...boss.phases].reverse().find((p) => bossCohort.n <= p.hpBelow) ?? boss.phases[0];
        const atk = rng.pick(phase.attacks);
        const tun = BALANCE.bossAttacks[atk];
        bossNext += phase.attackDelay / phase.speedMult;
        if (t < bossCohort.arriveAt - 1.5 && tun.damage > 0) continue;
        for (let i = 0; i < tun.hitsPerUse; i++) {
          if (rng.chance(sk.bossAvoid)) continue;
          const r = damagePlayer(run, enemyHitDamage(boss, plan) * tun.damage, rng);
          if (r.fatal) return { cleared: false, time: t, kills, bossLeft: bossCohort.n };
        }
        if (tun.summon) {
          const add = ENEMY_BY_ID[tun.summon.enemy];
          if (add) addCohort(add, tun.summon.count, false, SIM.summonDistance, build);
        }
      }
    }

    // --- incoming damage from engaged enemies
    const engaged = cohorts.filter((c) => c.n > EPS && t >= c.arriveAt);
    const touching = engaged.filter((c) => c.kind === 'contact' || c.kind === 'boss').reduce((a, c) => a + c.n, 0);
    const ring = touching > SIM.ringCap ? SIM.ringCap / touching : 1;
    const knock = run.weapons.includes('sword') ? 1 / (1 + SIM.knockbackBenefit * (s.knockbackMult - 1)) : 1;
    let attempts = 0;
    let dmgSum = 0;
    for (const c of engaged) {
      if (c.rate <= 0) continue;
      const touch = c.kind === 'contact' || c.kind === 'boss';
      const avoid = touch ? sk.avoid : sk.avoid + sk.specialBonus;
      const a = c.n * (touch ? ring * knock : 1) * c.rate * (1 - avoid) * (1 - build.frozenCover);
      attempts += a;
      dmgSum += a * c.dmg * (c.kind === 'boss' ? 0.5 : 1);
    }
    if (attempts > 0) {
      const hitRate = attempts / (1 + attempts * s.invulnTime);
      const avgDmg = dmgSum / attempts;
      const count = poisson(hitRate * dt, rng);
      for (let i = 0; i < count; i++) {
        if (damagePlayer(run, avgDmg, rng).fatal) return { cleared: false, time: t, kills, bossLeft: bossCohort?.n };
      }
    }
    healPlayer(run, s.regen * dt);
    t += dt;

    // --- cleared?
    if (bossCohort && bossCohort.n <= 0) {
      if (boss) registerBossKill(run, boss.id);
      return { cleared: true, time: t + SIM.roomTail, kills, bossLeft: 0 };
    }
    if (!boss && pi >= pending.length && liveCount() <= EPS) return { cleared: true, time: t + SIM.roomTail, kills };
  }
  return { cleared: false, time: t, kills };
}

// ------------------------------------------------------------------------------------------------
// Picks, doors, shrines

function scoreChoice(run: RunState, c: UpgradeChoice, strategy: Strategy, rng: Rng): number {
  const noise = rng.next();
  if (strategy === 'random') return noise;
  const r = RARITY_RANK[c.def.rarity];
  if (strategy === 'greedy') return r * 10 + noise;
  const favored = HEROES[run.hero].favoredTags;
  let score = r * 3 + noise;
  if (c.synergyHints.length > 0) score += 4 + c.synergyHints.length;
  if (c.def.tags.some((t) => favored.includes(t))) score += 2;
  if (c.def.id === 'potion') score += run.hp / run.stats.maxHp < 0.45 ? 8 : -4;
  if (c.def.id === 'gold_pouch') score -= 3;
  if (c.def.tags.includes('offense')) score += 1;
  return score;
}

function chooseCard(run: RunState, choices: UpgradeChoice[], strategy: Strategy, rng: Rng): UpgradeChoice {
  let best = choices[0];
  let bestScore = -Infinity;
  for (const c of choices) {
    const sc = scoreChoice(run, c, strategy, rng);
    if (sc > bestScore) {
      bestScore = sc;
      best = c;
    }
  }
  return best;
}

function chooseDoor(run: RunState, doors: RoomType[], strategy: Strategy, rng: Rng): RoomType {
  if (doors.length === 1) return doors[0];
  if (strategy === 'random') return rng.pick(doors);
  const hurt = run.hp / run.stats.maxHp < 0.6;
  const order: RoomType[] = hurt ? ['shrine', 'treasure', 'combat', 'elite'] : ['treasure', 'elite', 'combat', 'shrine'];
  return order.find((o) => doors.includes(o)) ?? doors[0];
}

// ------------------------------------------------------------------------------------------------
// A whole run

export interface SimConfig {
  hero: HeroId;
  skill: Skill;
  strategy: Strategy;
  meta: Record<string, number>;
  unlocks: string[];
  seed: number;
  /** Safety cap on rooms. */
  maxRooms?: number;
  /**
   * Ablation: replace the first picks by these upgrade ids ('none' = no pick, the control). Random
   * draws are consumed identically, so a test run and its control differ only in those picks.
   */
  forcePicks?: string[];
  /** Ablation: synergies whose effects are switched off (they still count as activated). */
  disabledSynergies?: string[];
}

export interface SimResult {
  hero: HeroId;
  strategy: Strategy;
  roomReached: number;        // the room the run ended in (cleared + 1)
  kills: number;
  gold: number;               // banked: runGoldReward
  level: number;
  durationSec: number;
  upgrades: Record<string, number>;
  pickRoom: Record<string, number>;   // room of the first pick of each upgrade
  synergies: string[];
  synergyRoom: Record<string, number>;
  bossFights: { boss: string; room: number; won: boolean }[];
  endedByBoss: string | null;
}

export function simulateRun(cfg: SimConfig): SimResult {
  const rng = new Rng(cfg.seed);
  const roomRng = rng.fork('rooms');
  const upRng = rng.fork('upgrades');
  const simRng = rng.fork('sim');
  const doorRng = rng.fork('doors');
  const run = createRun({ hero: cfg.hero, seed: cfg.seed, mode: 'normal', meta: cfg.meta, unlocks: cfg.unlocks, runId: 'sim' });
  const result: SimResult = {
    hero: cfg.hero, strategy: cfg.strategy, roomReached: 1, kills: 0, gold: 0, level: 1, durationSec: 0,
    upgrades: {}, pickRoom: {}, synergies: [], synergyRoom: {}, bossFights: [], endedByBoss: null,
  };
  let type: RoomType = 'combat';
  let prev: RoomType | undefined;
  const maxRooms = cfg.maxRooms ?? 80;

  let picks = 0;
  const muteSynergies = (): void => {
    if (!cfg.disabledSynergies?.length) return;
    run.synergies = run.synergies.filter((id) => !cfg.disabledSynergies?.includes(id));
    recomputeStats(run);
  };
  const pick = (minRarity?: Rarity): void => {
    let choices = rollUpgradeChoices(run, upRng, { minRarity });
    const forced = cfg.forcePicks?.[picks++];
    if (forced !== undefined) {
      if (forced !== 'none') {
        const r = applyUpgrade(run, forced);
        result.pickRoom[forced] = run.room;
        for (const syn of r.newSynergies) result.synergyRoom[syn.id] = run.room;
        muteSynergies();
      }
      return;
    }
    if (run.rerollsLeft > 0 && choices.every((c) => c.def.rarity === 'common' && c.def.id !== 'potion')) {
      run.rerollsLeft -= 1;
      choices = rollUpgradeChoices(run, upRng, { minRarity });
    }
    const c = chooseCard(run, choices, cfg.strategy, simRng);
    const room = run.room;
    const r = applyUpgrade(run, c.def.id);
    if (result.pickRoom[c.def.id] === undefined) result.pickRoom[c.def.id] = room;
    for (const syn of r.newSynergies) result.synergyRoom[syn.id] = room;
    muteSynergies();
  };

  while (run.room <= maxRooms) {
    const plan = planRoom(run.room, roomRng, { unlocks: cfg.unlocks, type, hpMult: curseHpMult(run) });
    if (plan.type === 'treasure') {
      const tr = treasureReward(plan.index, run.stats.goldMult);
      run.gold += tr.gold;
      run.elapsed += 4;
    } else if (plan.type === 'shrine') {
      const opts = rollShrineOptions(run, simRng, 3).filter((o) => canUseShrine(run, o.id));
      if (opts.length > 0) {
        const hurt = run.hp / run.stats.maxHp < 0.6;
        const o = opts.find((x) => x.kind === (hurt ? 'healing_fountain' : 'blood_altar'))
          ?? opts.find((x) => x.kind !== 'cursed_chest') ?? opts[0];
        applyShrine(run, o.id, simRng);
      }
      run.elapsed += 4;
    } else {
      const out = simulateRoom(run, plan, simRng, cfg.skill);
      run.elapsed += out.time;
      if (plan.bossId) result.bossFights.push({ boss: plan.bossId, room: plan.index, won: out.cleared });
      if (!out.cleared) {
        if (plan.bossId) result.endedByBoss = plan.bossId;
        break;
      }
    }
    const clearedRoom = run.room;
    onRoomCleared(run);
    run.elapsed += BALANCE.rooms.uiSecondsPerRoom;
    if (plan.type === 'treasure') pick(BALANCE.rooms.treasureMinRarity);
    else if (plan.type === 'elite') pick(BALANCE.rooms.eliteRoomMinRarity);
    else if (plan.type !== 'shrine') pick();
    prev = plan.type;
    type = chooseDoor(run, doorOptions(clearedRoom, doorRng, prev), cfg.strategy, simRng);
  }
  const summary = toSummary(run);
  result.roomReached = run.room;
  result.kills = run.kills;
  result.level = run.level;
  result.durationSec = run.elapsed;
  result.upgrades = { ...run.upgrades };
  result.synergies = run.synergies.slice();
  result.gold = runGoldReward(summary);
  return result;
}

// ------------------------------------------------------------------------------------------------
// Presets & progression

export function metaPreset(preset: MetaPreset): { meta: Record<string, number>; unlocks: string[] } {
  const variants = ['variant_ghost', 'variant_spider', 'variant_fire_slime', 'variant_ogre'];
  if (preset === 'none') return { meta: {}, unlocks: [] };
  if (preset === 'max') {
    const meta: Record<string, number> = {};
    for (const m of META_UPGRADES) meta[m.id] = m.maxLevel;
    return { meta, unlocks: ['bow', 'staff', ...variants] };
  }
  const meta: Record<string, number> = {};
  for (const m of META_UPGRADES) meta[m.id] = m.special ? 0 : Math.ceil(m.maxLevel / 2);
  meta.armory_bow = 1;
  return { meta, unlocks: ['bow', 'variant_ghost', 'variant_fire_slime'] };
}

/** Everything the shop sells (permanent upgrades + heroes), for "runs to max" estimates. */
export function totalShopCost(): number {
  let total = 0;
  for (const m of META_UPGRADES) for (let l = 0; l < m.maxLevel; l++) total += metaCost(m, l);
  for (const h of HERO_IDS) total += HEROES[h].unlockCost;
  return total;
}

function emptySave(): SaveData {
  return {
    version: 1, gold: 0, meta: {}, heroes: ['knight'], selectedHero: 'knight', unlocks: [], achievements: {},
    stats: {
      runs: 0, totalKills: 0, totalGold: 0, bestRoom: 0, bestRoomByHero: {}, legendariesTotal: 0, bossesDefeated: {},
      bestNoDamageRooms: 0, bestKillsInRun: 0, bestLevel: 0, maxSynergiesInRun: 0, dailyCompleted: 0,
    },
    settings: { musicVolume: 1, sfxVolume: 1, screenShake: true, reducedMotion: false, damageNumbers: true, joystick: 'floating' },
    daily: {}, rewards: { day: '', claimsToday: 0, claimed: {}, tokens: 0 },
    cosmetics: { owned: [], equipped: {} }, lastRun: null, pendingRun: null,
  };
}

/**
 * A player's career: play runs, bank gold, buy the cheapest available permanent upgrade (heroes once
 * affordable with a cushion). Returns rooms reached per run and how many runs it took to buy everything.
 */
export function simulateProgression(opts: { skill: Skill; seed: number; maxRuns?: number; strategy?: Strategy }): {
  rooms: number[]; golds: number[]; runsToMax: number | null; goldToMax: number;
} {
  const rng = new Rng(opts.seed);
  const save = emptySave();
  const maxRuns = opts.maxRuns ?? 400;
  const rooms: number[] = [];
  const golds: number[] = [];
  let runsToMax: number | null = null;
  const total = totalShopCost();
  let spent = 0;
  const variantUnlocks = ['variant_ghost', 'variant_spider', 'variant_fire_slime', 'variant_ogre'];
  for (let i = 0; i < maxRuns; i++) {
    const hero = rng.pick(save.heroes);
    const strategy = opts.strategy ?? (['random', 'greedy', 'synergy'] as Strategy[])[i % 3];
    // enemy variants appear as achievements are earned; model: one more every ~4 runs
    const unlocks = [...save.unlocks, ...variantUnlocks.slice(0, Math.floor(i / 4))];
    const res = simulateRun({
      hero, skill: opts.skill, strategy, meta: save.meta, unlocks, seed: rng.int(1, 2 ** 31),
    });
    rooms.push(res.roomReached);
    golds.push(res.gold);
    const before = save.gold;
    save.gold += res.gold;
    void before;
    for (const h of HERO_IDS) {
      if (!save.heroes.includes(h) && save.gold >= HEROES[h].unlockCost * 1.5) {
        const g = save.gold;
        if (buyHero(save, h)) spent += g - save.gold;
      }
    }
    for (;;) {
      let best: { id: string; cost: number } | null = null;
      for (const m of META_UPGRADES) {
        const lvl = save.meta[m.id] ?? 0;
        if (lvl >= m.maxLevel) continue;
        const cost = metaCost(m, lvl);
        if (cost <= save.gold && (best === null || cost < best.cost)) best = { id: m.id, cost };
      }
      if (!best) break;
      const g = save.gold;
      if (!buyMeta(save, best.id)) break;
      spent += g - save.gold;
    }
    if (runsToMax === null && spent >= total && save.heroes.length === HERO_IDS.length) {
      runsToMax = i + 1;
      break;
    }
  }
  return { rooms, golds, runsToMax, goldToMax: total };
}
