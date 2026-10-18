import { BALANCE, gemsFor } from '../data/balance';
import { TOWERS } from '../data/towers';
import type { EnemyId, TowerId } from '../data/types';
import { FL } from './modifiers';
import { applyBurn, applyFreeze, applyPoison, applySlow, applyStun, applyVulnerability } from './statuses';
import { spawnEnemy } from './enemies';
import type { DeathRec, Enemy, FireZone, Projectile, SimState, TowerInst } from './state';

const C = BALANCE.combat;
type Element = 'fire' | 'frost' | 'poison' | 'arcane' | 'physical' | 'lightning';

export const isFlyer = (e: Enemy): boolean => e.flying;

export function towerElement(type: TowerId): Element {
  switch (type) {
    case 'fire': return 'fire';
    case 'frost': return 'frost';
    case 'poison': return 'poison';
    case 'magic': return 'arcane';
    case 'lightning': return 'lightning';
    default: return 'physical';
  }
}

/** Spends one unit of the per-substep proc budget; false when procs are exhausted. */
export function useProc(s: SimState): boolean {
  if (s.procBudget <= 0) return false;
  s.procBudget--;
  return true;
}

// ---------------------------------------------------------------------------------------------
// Damage
// ---------------------------------------------------------------------------------------------

/**
 * The single place enemy HP is reduced. Applies vulnerability, boss modifiers, armor (reduced by
 * armorPen), the front shield (only when a source position is given) and the temporary shield.
 * `dot` damage skips hit-flash and per-tick damage events. Returns the HP actually removed.
 */
export function hurt(
  s: SimState, e: Enemy, raw: number, tower: TowerInst | null, armorPen: number,
  srcX: number, srcY: number, crit: boolean, dot: boolean,
): number {
  if (!e.active || !(raw > 0)) return 0;
  let d = raw;
  if (e.vulnerable > 0) d *= 1 + e.vulnerable;
  if (e.isBoss) {
    d *= s.bossDamageMult;
    const shatter = s.gm.flags[FL.bossShatter];
    if (shatter > 0 && (e.slowTime > 0 || e.frozenTime > 0)) d *= 1 + shatter;
  }
  if (e.armor > 0) d *= 1 - e.armor * (1 - armorPen);
  if (!dot && srcX === srcX && e.def) {
    const ab = e.def.abilities;
    for (let i = 0; i < ab.length; i++) {
      const a = ab[i];
      if (a.kind === 'frontShield') {
        const dx = srcX - e.x;
        const dy = srcY - e.y;
        if (dx * Math.cos(e.angle) + dy * Math.sin(e.angle) > 0) d *= 1 - a.reduction;
        break;
      }
    }
  }
  const shown = d;
  if (e.shield > 0) {
    if (d <= e.shield) { e.shield -= d; d = 0; }
    else { d -= e.shield; e.shield = 0; }
  }
  const loss = Math.min(d, e.hp);
  e.hp -= d;
  if (!dot) e.hitFlash = 0;
  if (tower) {
    tower.damageDealt += loss;
    const td = s.stats.towerDamage;
    td[tower.type] = (td[tower.type] ?? 0) + loss;
  }
  if (dot) {
    e.dotAcc += shown;
    e.dotEventTimer += 1 / 60;
    if (e.dotEventTimer >= 0.5) {
      if (e.dotAcc >= 1 && s.damageEvents < BALANCE.caps.damageEventsPerTick) {
        s.damageEvents++;
        s.emit({ type: 'damage', x: e.x, y: e.y - e.radius, amount: Math.round(e.dotAcc), crit: false, enemyId: e.id });
      }
      e.dotAcc = 0;
      e.dotEventTimer = 0;
    }
  } else if (s.damageEvents < BALANCE.caps.damageEventsPerTick) {
    s.damageEvents++;
    s.emit({ type: 'damage', x: e.x, y: e.y - e.radius, amount: Math.max(1, Math.round(shown)), crit, enemyId: e.id });
  }
  if (e.hp <= 0) killEnemy(s, e, tower, false);
  return loss;
}

// ---------------------------------------------------------------------------------------------
// Death
// ---------------------------------------------------------------------------------------------

export function updateGems(s: SimState): void {
  s.stats.gemsEarned = gemsFor(s.stats.wavesCleared, s.bossGems);
}

/** Removes an enemy as killed. `silent` kills (revive clear) give no coins, stats or on-death effects. */
export function killEnemy(s: SimState, e: Enemy, tower: TowerInst | null, silent: boolean): void {
  if (!e.active) return;
  e.active = false;
  e.hp = 0;
  s.alive--;
  let gained = 0;
  if (!silent) {
    const amount = e.coinValue * s.coinGainMult + s.gm.flags[FL.killCoinBonus];
    gained = s.addCoins(amount, e.x, e.y);
    s.stats.enemiesKilled++;
    if (tower) {
      tower.kills++;
      s.stats.towerKills[tower.type] = (s.stats.towerKills[tower.type] ?? 0) + 1;
    }
  }
  s.emit({
    type: 'enemyDied', enemyId: e.id, kind: e.kind, x: e.x, y: e.y, coins: gained, isBoss: e.isBoss, elite: e.elite,
  });
  if (silent) return;

  if (e.isBoss && e.bossDef) {
    const gems = Math.round(e.bossDef.gems * Math.pow(BALANCE.boss.loopGemMult, e.bossLoop));
    s.stats.bossesKilled.push(e.bossDef.id);
    s.bossGems += gems;
    updateGems(s);
    s.emit({ type: 'bossDefeated', boss: e.bossDef.id, x: e.x, y: e.y, coins: gained, gems });
  }

  const mk = s.gm.flags[FL.meteorOnKillChance];
  if (mk > 0 && s.meteorKillCd <= 0 && s.rngC.chance(Math.min(1, mk)) && useProc(s)) {
    s.meteorKillCd = C.meteorOnKillCooldown;
    callMeteor(s, e.x, e.y, C.meteorOnKillRadius, C.meteorOnKillBase + C.meteorOnKillPerWave * s.wave);
  }

  if (s.depth < C.maxDeathDepth && s.deathTail < s.deaths.length) {
    const r = s.deaths[s.deathTail++];
    r.x = e.x;
    r.y = e.y;
    r.depth = s.depth;
    r.isBoss = e.isBoss;
    r.burning = e.burnTime > 0;
    r.burnDps = e.burnDps;
    r.burnSrc = e.burnSrc;
    r.poisonStacks = e.poisonTime > 0 ? e.poisonStacks : 0;
    r.poisonDps = e.poisonDps;
    r.poisonTime = e.poisonTime;
    r.poisonSrc = e.poisonSrc;
    r.progress = e.progress;
    r.flying = e.flying;
    r.splitEnemy = null;
    r.splitCount = 0;
    if (e.def) {
      for (const a of e.def.abilities) {
        if (a.kind === 'splitOnDeath') { r.splitEnemy = a.enemy; r.splitCount = a.count; }
      }
    }
  }
}

/** Processes queued on-death effects (explosions, spreads, splits) until the queue is empty. */
export function flushDeaths(s: SimState): void {
  let guard = 0;
  while (s.deathHead < s.deathTail && guard++ < 2000) {
    const rec = s.deaths[s.deathHead++];
    processDeath(s, rec);
  }
  if (s.deathHead >= s.deathTail) { s.deathHead = 0; s.deathTail = 0; }
}

function processDeath(s: SimState, r: DeathRec): void {
  const prevDepth = s.depth;
  s.depth = r.depth + 1;
  if (r.splitEnemy) spawnSplits(s, r.splitEnemy, r.splitCount, r);

  const bs = r.burnSrc;
  if (r.burning && bs) {
    const f = bs.stats.flags;
    const rad = f[FL.flameExplosionOnDeath];
    if (rad > 0 && useProc(s)) {
      const dmg = r.burnDps * C.flameExplosionBurnSeconds * C.flameExplosionFraction;
      explosion(s, r.x, r.y, rad, dmg, bs, 'fire', true, 0);
    }
    if (f[FL.fireSpread] > 0) {
      spreadBurnAt(s, r.x, r.y, r.burnDps, bs);
    }
    const n = Math.round(f[FL.burnSpreadsPoison]);
    if (n > 0 && useProc(s)) poisonArea(s, r.x, r.y, C.burnSpreadPoisonRadius, n, bs, 99);
  }
  const ps = r.poisonSrc;
  if (r.poisonStacks > 0 && ps) {
    const f = ps.stats.flags;
    if (f[FL.poisonExplosionOnDeath] > 0 && useProc(s)) {
      explosion(s, r.x, r.y, f[FL.poisonExplosionOnDeath], r.poisonStacks * C.poisonExplosionPerStack, ps, 'poison', true, 0);
    }
    if (f[FL.poisonSpreadOnDeath] > 0 && useProc(s)) {
      poisonSpread(s, r, ps);
    }
  }
  s.depth = prevDepth;
}

function spawnSplits(s: SimState, kind: EnemyId, count: number, r: DeathRec): void {
  const plan = s.plan;
  for (let i = 0; i < count; i++) {
    spawnEnemy(s, kind, {
      progress: Math.max(0, r.progress - 10 + i * 14),
      hpMult: plan ? plan.hpMult : 1,
      speedMult: plan ? plan.speedMult : 1,
      coinMult: plan ? plan.coinMult : 1,
      summoned: true,
    });
  }
}

function spreadBurnAt(s: SimState, x: number, y: number, dps: number, src: TowerInst): void {
  if (!useProc(s)) return;
  const buf = s.borrow();
  const n = s.grid.query(x, y, C.fireSpreadRange, buf, buf.length);
  let best: Enemy | null = null;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const v = s.enemies[buf[i]];
    if (!v.active) continue;
    const dx = v.x - x;
    const dy = v.y - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = v; }
  }
  s.release();
  if (best) applyBurn(s, best, dps, 3, src);
}

/** Applies poison stacks to up to `maxTargets` enemies within radius of (x, y). */
function poisonArea(s: SimState, x: number, y: number, radius: number, stacks: number, src: TowerInst, maxTargets: number): void {
  const buf = s.borrow();
  const n = s.grid.query(x, y, radius, buf, buf.length);
  const dps = C.poisonDpsPerStack * src.stats.spRel * src.stats.dotScale;
  let done = 0;
  for (let i = 0; i < n && done < maxTargets; i++) {
    const v = s.enemies[buf[i]];
    if (!v.active) continue;
    applyPoison(s, v, stacks, dps, C.poisonDuration * src.stats.durRel, src);
    done++;
  }
  s.release();
}

function poisonSpread(s: SimState, r: DeathRec, src: TowerInst): void {
  const buf = s.borrow();
  const n = s.grid.query(r.x, r.y, C.poisonSpreadRadius, buf, buf.length);
  let done = 0;
  for (let i = 0; i < n && done < C.poisonSpreadTargets; i++) {
    const v = s.enemies[buf[i]];
    if (!v.active) continue;
    applyPoison(s, v, r.poisonStacks, r.poisonDps, Math.max(2, r.poisonTime), src);
    done++;
  }
  s.release();
}

// ---------------------------------------------------------------------------------------------
// Area effects
// ---------------------------------------------------------------------------------------------

/** Plain explosion damage (no statuses, never triggers procs). */
export function explosion(
  s: SimState, x: number, y: number, radius: number, dmg: number, tower: TowerInst | null,
  element: Element, hitAir: boolean, armorPen: number,
): void {
  s.emit({ type: 'explosion', x, y, radius, element });
  const buf = s.borrow();
  const n = s.grid.query(x, y, radius, buf, buf.length);
  for (let i = 0; i < n; i++) {
    const v = s.enemies[buf[i]];
    if (!v.active || (!hitAir && v.flying)) continue;
    hurt(s, v, dmg, tower, armorPen, NaN, NaN, false, false);
  }
  s.release();
}

export function callMeteor(s: SimState, x: number, y: number, radius: number, dmg: number): void {
  const p = acquireProjectile(s);
  s.stats.meteorsCalled++;
  s.emit({ type: 'meteor', x, y, radius });
  if (!p) {
    explosion(s, x, y, radius, dmg, null, 'fire', true, 0);
    return;
  }
  p.kind = 'meteor';
  p.towerType = null;
  p.tower = null;
  p.mode = 2;
  p.isProc = true;
  p.groundOnly = false;
  p.element = 'fire';
  p.sx = x - 80;
  p.sy = y - 760;
  p.tx = x;
  p.ty = y;
  p.x = p.sx;
  p.y = p.sy;
  p.t = 0;
  p.flight = BALANCE.abilities.meteor.flightTime;
  p.arcT = 0;
  p.arcHeight = 0;
  p.angle = Math.atan2(p.ty - p.sy, p.tx - p.sx);
  p.dmg = dmg;
  p.splash = radius;
  p.armorPen = 0;
  p.crit = false;
}

export function acquireProjectile(s: SimState): Projectile | null {
  const pool = s.projectiles;
  for (let i = 0; i < pool.length; i++) {
    const p = pool[i];
    if (!p.active) {
      p.active = true;
      p.id = s.nextProjId++;
      p.hitCount = 0;
      p.secondary = false;
      p.isProc = false;
      p.groundOnly = false;
      p.pierceLeft = 0;
      p.arcT = 0;
      p.arcHeight = 0;
      p.targetIdx = -1;
      p.armorPen = 0;
      p.crit = false;
      return p;
    }
  }
  return null;
}

export function addFireZone(s: SimState, x: number, y: number, dps: number, tower: TowerInst): void {
  if (!useProc(s)) return;
  const zones = s.zones;
  let free: FireZone | null = null;
  let oldest: FireZone | null = null;
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    if (!z.active) { if (!free) free = z; continue; }
    const dx = z.x - x;
    const dy = z.y - y;
    if (dx * dx + dy * dy < 30 * 30) {
      // Refresh a nearby patch instead of stacking a new one.
      z.timeLeft = C.fireZoneDuration;
      if (dps > z.dps) z.dps = dps;
      return;
    }
    if (!oldest || z.timeLeft < oldest.timeLeft) oldest = z;
  }
  const z = free ?? oldest;
  if (!z) return;
  z.active = true;
  z.id = s.nextZoneId++;
  z.x = x;
  z.y = y;
  z.radius = C.fireZoneRadius;
  z.timeLeft = C.fireZoneDuration;
  z.dps = dps;
  z.tick = 0;
  z.tower = tower;
}

export function updateZones(s: SimState, dt: number): void {
  const zones = s.zones;
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    if (!z.active) continue;
    z.timeLeft -= dt;
    if (z.timeLeft <= 0) { z.active = false; continue; }
    z.tick -= dt;
    if (z.tick > 0) continue;
    z.tick += C.fireZoneTick;
    const buf = s.borrow();
    const n = s.grid.query(z.x, z.y, z.radius, buf, buf.length);
    for (let k = 0; k < n; k++) {
      const v = s.enemies[buf[k]];
      if (!v.active || v.flying) continue;
      applyBurn(s, v, z.dps, C.fireZoneTick * 2.5, z.tower);
    }
    s.release();
  }
}

// ---------------------------------------------------------------------------------------------
// Tower hits
// ---------------------------------------------------------------------------------------------

/**
 * A tower's hit on one enemy: conditional damage bonuses, damage, on-hit statuses and (for the
 * primary target of depth-0 attacks) on-hit procs. `base` is the damage before enemy-side modifiers.
 */
export function towerHit(
  s: SimState, t: TowerInst, e: Enemy, base: number, crit: boolean, primary: boolean, srcX: number, srcY: number,
): void {
  const st = t.stats;
  const f = st.flags;
  let d = base;
  let v = f[FL.frozenBonusDamage];
  if (v > 0 && (e.frozenTime > 0 || e.slowTime > 0)) d *= 1 + v;
  v = f[FL.burningBonusDamage];
  if (v > 0 && e.burnTime > 0) d *= 1 + v;
  v = f[FL.poisonedBonusDamage];
  if (v > 0 && e.poisonStacks > 0) d *= 1 + v;

  const ex = f[FL.executeThreshold];
  let executed = false;
  if (ex > 0 && e.hp <= e.maxHp * Math.min(0.5, ex)) {
    if (e.isBoss) {
      d *= 2;
    } else {
      executed = true;
      const hpLeft = e.hp + e.shield;
      s.emit({ type: 'status', enemyId: e.id, status: 'execute' });
      if (s.damageEvents < BALANCE.caps.damageEventsPerTick) {
        s.damageEvents++;
        s.emit({ type: 'damage', x: e.x, y: e.y - e.radius, amount: Math.max(1, Math.round(hpLeft)), crit: true, enemyId: e.id });
      }
      t.damageDealt += e.hp;
      s.stats.towerDamage[t.type] = (s.stats.towerDamage[t.type] ?? 0) + e.hp;
      e.shield = 0;
      e.hp = 0;
      killEnemy(s, e, t, false);
    }
  }
  if (!executed) {
    hurt(s, e, d, t, st.armorPen, srcX, srcY, crit, false);
    if (e.active) onHitStatuses(s, t, e, d);
  }
  if (primary && s.depth === 0) onHitProcs(s, t, e, base, crit);
}

function onHitStatuses(s: SimState, t: TowerInst, e: Enemy, hitDmg: number): void {
  const st = t.stats;
  const f = st.flags;
  const rng = s.rngC;
  const durRel = st.durRel;
  let v = f[FL.slowOnHit];
  if (v > 0) applySlow(s, e, v * st.spRel, C.slowDuration * durRel);
  v = f[FL.freezeChance];
  if (v > 0 && rng.chance(Math.min(1, v))) applyFreeze(s, e, C.freezeDuration * durRel, t);
  v = f[FL.stunChance];
  if (v > 0 && rng.chance(Math.min(1, v))) applyStun(s, e, C.stunDuration * durRel);
  v = f[FL.burnOnHit];
  if (v > 0) applyBurn(s, e, v * hitDmg * st.spRel, C.burnDuration * durRel, t);
  v = f[FL.poisonOnHit];
  if (v > 0) applyPoison(s, e, Math.max(1, Math.round(v)), C.poisonDpsPerStack * st.spRel * st.dotScale, C.poisonDuration * durRel, t);
  v = f[FL.vulnerabilityOnHit];
  if (v > 0) applyVulnerability(e, v, C.vulnerabilityDuration);
  if (f[FL.randomElement] > 0) {
    switch (rng.int(4)) {
      case 0: applyBurn(s, e, C.randomElementBurnFraction * hitDmg * st.spRel, C.burnDuration * durRel, t); break;
      case 1: applySlow(s, e, C.randomElementSlow * st.spRel, C.slowDuration * durRel); break;
      case 2: applyPoison(s, e, 1, C.poisonDpsPerStack * st.spRel * st.dotScale, C.poisonDuration * durRel, t); break;
      default: applyStun(s, e, C.randomElementStun * durRel); break;
    }
  }
}

function onHitProcs(s: SimState, t: TowerInst, e: Enemy, base: number, crit: boolean): void {
  const st = t.stats;
  const f = st.flags;
  let v = f[FL.explosionOnHit];
  if (v > 0 && useProc(s)) explosion(s, e.x, e.y, v, base * C.explosionOnHitDamage, t, towerElement(t.type), true, st.armorPen);
  v = f[FL.fireZoneOnHit];
  if (v > 0 && !e.flying) addFireZone(s, e.x, e.y, v * st.dotScale, t);
  v = f[FL.chainLightningChance];
  if (v > 0 && s.rngC.chance(Math.min(1, v)) && useProc(s)) {
    chainStrike(s, t, e, base * C.procChainDamage, false, C.procChainJumps, 120, true, e.x, e.y);
  }
  v = f[FL.critLightning];
  if (crit && v > 0 && useProc(s)) critBolts(s, t, e, base * C.critLightningDamage, Math.round(v));
}

function critBolts(s: SimState, t: TowerInst, origin: Enemy, dmg: number, count: number): void {
  const buf = s.borrow();
  const n = s.grid.query(origin.x, origin.y, C.critLightningRange, buf, buf.length);
  // pick the nearest `count` enemies other than the origin
  for (let k = 0; k < count; k++) {
    let bestI = -1;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const idx = buf[i];
      if (idx < 0) continue;
      const v = s.enemies[idx];
      if (!v.active || v === origin) continue;
      const dx = v.x - origin.x;
      const dy = v.y - origin.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; bestI = i; }
    }
    if (bestI < 0) break;
    const v = s.enemies[buf[bestI]];
    buf[bestI] = -1;
    s.emit({ type: 'chain', points: [{ x: origin.x, y: origin.y }, { x: v.x, y: v.y }], source: 'proc' });
    hurt(s, v, dmg, t, t.stats.armorPen, NaN, NaN, false, false);
  }
  s.release();
}

/**
 * Chain lightning from `first` (already chosen as the first victim). Tower chains apply full tower
 * hits; proc chains deal plain damage. `infiniteChain` keeps jumping with decay (hard cap 25).
 */
export function chainStrike(
  s: SimState, t: TowerInst | null, first: Enemy, dmg: number, crit: boolean, jumps: number, range: number,
  proc: boolean, srcX: number, srcY: number,
): void {
  const infinite = s.gm.flags[FL.infiniteChain] > 0;
  const decay = infinite ? C.chainDecayInfinite : C.chainDecay;
  const maxJumps = infinite ? BALANCE.caps.chainHardCap : jumps;
  const ids = s.borrow();
  let hitCount = 0;
  const pts: { x: number; y: number }[] = [{ x: srcX, y: srcY }];
  let cur: Enemy = first;
  let d = dmg;
  const floor = dmg * C.chainMinFraction;
  for (let j = 0; ; j++) {
    pts.push({ x: cur.x, y: cur.y });
    ids[hitCount++] = cur.id;
    if (s.hitEvents < BALANCE.caps.hitEventsPerTick) {
      s.hitEvents++;
      s.emit({ type: 'hit', x: cur.x, y: cur.y, kind: 'chain', tower: t ? t.type : null });
    }
    if (proc || !t) hurt(s, cur, d, t, t ? t.stats.armorPen : 0, NaN, NaN, crit, false);
    else towerHit(s, t, cur, d, crit, j === 0, j === 0 ? srcX : NaN, j === 0 ? srcY : NaN);
    if (j >= maxJumps) break;
    d *= 1 - decay;
    if (infinite && d < floor) break;
    if (hitCount >= ids.length) break;
    const idx = s.grid.nearestExcluding(cur.x, cur.y, range, ids, hitCount, false, isFlyer);
    if (idx < 0) break;
    cur = s.enemies[idx];
  }
  s.release();
  s.stats.chainLightnings++;
  s.emit({ type: 'chain', points: pts, source: proc || !t ? 'proc' : t.type });
}

// ---------------------------------------------------------------------------------------------
// Impacts and secondary effects
// ---------------------------------------------------------------------------------------------

/** elementalSecondary: the tower's opposite element hits the target (every 3rd attack). */
export function applySecondary(s: SimState, t: TowerInst, e: Enemy, base: number): void {
  const st = t.stats;
  switch (t.type) {
    case 'fire': applySlow(s, e, 0.4 * st.spRel, 2 * st.durRel); break;
    case 'frost': applyBurn(s, e, 0.5 * base * st.spRel, C.burnDuration * st.durRel, t); break;
    case 'poison':
      if (useProc(s)) chainStrike(s, t, e, base * C.procChainDamage, false, 2, 120, true, e.x, e.y);
      break;
    case 'lightning': applyPoison(s, e, 2, C.poisonDpsPerStack * st.spRel * st.dotScale, C.poisonDuration * st.durRel, t); break;
    default:
      if (useProc(s)) explosion(s, e.x, e.y, C.arcaneBurstRadius, base * C.arcaneBurstDamage, t, 'arcane', true, st.armorPen);
  }
}

/** Shards from an impact point toward the nearest other enemies (splitOnImpact). */
export function spawnShards(s: SimState, t: TowerInst, x: number, y: number, dmg: number, count: number, skipId: number): void {
  if (!useProc(s)) return;
  const buf = s.borrow();
  const n = s.grid.query(x, y, C.shardRange, buf, buf.length);
  for (let k = 0; k < count; k++) {
    let bestI = -1;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const idx = buf[i];
      if (idx < 0) continue;
      const v = s.enemies[idx];
      if (!v.active || v.id === skipId) continue;
      if (v.flying && !TOWERS[t.type].hitsAir) continue;
      const dx = v.x - x;
      const dy = v.y - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; bestI = i; }
    }
    if (bestI < 0) break;
    const vIdx = buf[bestI];
    const v = s.enemies[vIdx];
    buf[bestI] = -1;
    const p = acquireProjectile(s);
    if (!p) break;
    p.kind = 'shard';
    p.towerType = t.type;
    p.tower = t;
    p.mode = 0;
    p.isProc = true;
    p.speed = 620;
    p.x = x;
    p.y = y;
    p.sx = x;
    p.sy = y;
    p.targetIdx = vIdx;
    p.targetId = v.id;
    p.dmg = dmg;
    p.splash = 0;
    p.armorPen = t.stats.armorPen;
    p.angle = Math.atan2(v.y - y, v.x - x);
  }
  s.release();
}

/** Scatters bomblets around an explosion (clusterBombs). */
export function scatterBomblets(s: SimState, t: TowerInst, x: number, y: number, dmg: number, radius: number, count: number): void {
  if (!useProc(s)) return;
  for (let k = 0; k < count; k++) {
    const p = acquireProjectile(s);
    if (!p) break;
    const ang = s.rngC.next() * Math.PI * 2;
    const dist = 28 + s.rngC.next() * C.bombletScatter;
    p.kind = 'bomblet';
    p.towerType = t.type;
    p.tower = t;
    p.mode = 2;
    p.isProc = true;
    p.groundOnly = true;
    p.element = 'physical';
    p.sx = x;
    p.sy = y;
    p.x = x;
    p.y = y;
    p.tx = x + Math.cos(ang) * dist;
    p.ty = y + Math.sin(ang) * dist;
    p.t = 0;
    p.flight = 0.4;
    p.arcHeight = 40;
    p.angle = ang;
    p.dmg = dmg;
    p.splash = radius;
    p.armorPen = t.stats.armorPen;
  }
}
