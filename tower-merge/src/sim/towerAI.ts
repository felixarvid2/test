import { len } from './math';
import { BALANCE } from '../data/balance';
import { SLOTS, WORLD_H, WORLD_W } from '../data/map';
import { TOWERS } from '../data/towers';
import type { TowerId } from '../data/types';
import type { ProjectileKind } from './api';
import {
  acquireProjectile, applySecondary, chainStrike, explosion, isFlyer, scatterBomblets, spawnShards, towerElement, towerHit,
  useProc, hurt,
} from './combat';
import { FL } from './modifiers';
import type { Enemy, Projectile, SimState, TowerInst } from './state';

const C = BALANCE.combat;

const PROJ_KIND: Record<TowerId, ProjectileKind> = {
  arrow: 'arrow', cannon: 'cannonball', frost: 'frostShard', lightning: 'arrow', fire: 'fireball',
  poison: 'poisonGlob', sniper: 'arrow', magic: 'magicOrb',
};

const targets = new Int32Array(16);
const tmp = new Float64Array(4);

/** Where an enemy will be in `time` seconds if it keeps walking its lane (result in `tmp`: x, y). */
function predict(e: Enemy, time: number): void {
  e.lane.locate(e.progress + e.vel * time, e.seg, e.lateral, tmp);
}

export function updateTowers(s: SimState, dt: number): void {
  for (let i = 0; i < s.slots.length; i++) {
    const t = s.slots[i].tower;
    if (!t) continue;
    t.sinceAttack += dt;
    if (t.disabledTime > 0) {
      t.disabledTime -= dt;
      if (t.disabledTime < 0) t.disabledTime = 0;
      continue;
    }
    t.cooldown -= dt;
    if (t.cooldown > 0) continue;
    const st = t.stats;
    const want = 1 + Math.min(4, Math.round(st.flags[FL.multishot]));
    const n = selectTargets(s, t, want);
    if (n === 0) {
      t.cooldown = C.idleScan;
      continue;
    }
    attack(s, t, n);
    t.cooldown = Math.max(t.cooldown, -dt) + 1 / st.fireRate;
  }
}

/** Fills `targets` with up to `want` distinct enemies in range, best first. Returns the count. */
function selectTargets(s: SimState, t: TowerInst, want: number): number {
  const pos = SLOTS[t.slot];
  const hitsAir = TOWERS[t.type].hitsAir;
  const byHp = t.type === 'sniper' && C.sniperPrefersHighestHp;
  const buf = s.borrow();
  const n = s.grid.query(pos.x, pos.y, t.stats.range, buf, buf.length);
  let m = 0;
  for (let i = 0; i < n; i++) {
    const v = s.enemies[buf[i]];
    if (!v.active || (!hitsAir && v.flying)) continue;
    buf[m++] = buf[i];
  }
  const count = Math.min(want, m);
  for (let k = 0; k < count; k++) {
    let bestJ = -1;
    let best = -Infinity;
    for (let j = 0; j < m; j++) {
      const idx = buf[j];
      if (idx < 0) continue;
      const v = s.enemies[idx];
      const frac = v.progress / v.lane.total;
      const score = byHp ? v.hp + v.shield + frac : frac;
      if (score > best) { best = score; bestJ = j; }
    }
    targets[k] = buf[bestJ];
    buf[bestJ] = -1;
  }
  s.release();
  return count;
}

function attack(s: SimState, t: TowerInst, nt: number): void {
  const st = t.stats;
  const f = st.flags;
  const pos = SLOTS[t.slot];
  const def = TOWERS[t.type];
  t.attackCount++;
  t.sinceAttack = 0;
  const first = s.enemies[targets[0]];
  t.aim = Math.atan2(first.y - pos.y, first.x - pos.x);
  const secondary = f[FL.elementalSecondary] > 0 && t.attackCount % C.elementalSecondaryEvery === 0;
  for (let j = 0; j < nt; j++) attackOne(s, t, targets[j], secondary);
  const nth = Math.round(f[FL.everyNthExplosion]);
  if (nth > 0 && t.attackCount % nth === 0 && useProc(s)) {
    explosion(s, first.x, first.y, C.nthExplosionRadius, st.damage * C.nthExplosionDamage, t, towerElement(t.type), def.hitsAir, st.armorPen);
  }
}

function attackOne(s: SimState, t: TowerInst, targetIdx: number, secondary: boolean): void {
  const target = s.enemies[targetIdx];
  const st = t.stats;
  const pos = SLOTS[t.slot];
  const def = TOWERS[t.type];
  const n = 1 + Math.min(6, Math.round(st.flags[FL.extraProjectiles]));
  switch (def.attack) {
    case 'projectile':
    case 'lobbed':
      for (let k = 0; k < n; k++) launchProjectile(s, t, target, targetIdx, k, n, secondary && k === 0);
      s.emit({ type: 'shot', towerUid: t.uid, slot: t.slot, tower: t.type, level: t.level, x: pos.x, y: pos.y, tx: target.x, ty: target.y });
      break;
    case 'chain':
      for (let k = 0; k < n; k++) {
        if (k > 0 && !target.active) break;
        const crit = s.rngC.next() < st.critChance;
        chainStrike(s, t, target, st.damage * (crit ? st.critMult : 1), crit, st.chainCount, st.chainRange, false, pos.x, pos.y);
      }
      if (secondary && target.active) applySecondary(s, t, target, st.damage);
      break;
    case 'beam':
      for (let k = 0; k < n; k++) {
        if (k > 0 && !target.active) break;
        fireBeam(s, t, target, secondary && k === 0);
      }
      break;
    case 'cone':
      fireCone(s, t, target, secondary);
      break;
  }
}

function fireBeam(s: SimState, t: TowerInst, target: Enemy, secondary: boolean): void {
  const st = t.stats;
  const pos = SLOTS[t.slot];
  const crit = s.rngC.next() < st.critChance;
  const dmg = st.damage * (crit ? st.critMult : 1);
  s.emit({ type: 'beam', tower: t.type, x: pos.x, y: pos.y, tx: target.x, ty: target.y, crit });
  if (s.hitEvents < BALANCE.caps.hitEventsPerTick) {
    s.hitEvents++;
    s.emit({ type: 'hit', x: target.x, y: target.y, kind: 'beam', tower: t.type });
  }
  const tx = target.x;
  const ty = target.y;
  towerHit(s, t, target, dmg, crit, true, pos.x, pos.y);
  if (secondary) applySecondary(s, t, target, dmg);
  // pierce: also hit enemies along the line behind the target
  const pierce = Math.min(8, Math.round(st.flags[FL.pierce]));
  if (pierce > 0) {
    const dx = tx - pos.x;
    const dy = ty - pos.y;
    const dl = len(dx, dy) || 1;
    const ux = dx / dl;
    const uy = dy / dl;
    const used = s.borrow();
    let usedN = 0;
    used[usedN++] = target.id;
    for (let k = 0; k < pierce; k++) {
      let bestI = -1;
      let bestAlong = Infinity;
      for (let i = 0; i < s.enemies.length; i++) {
        const v = s.enemies[i];
        if (!v.active) continue;
        let seen = false;
        for (let q = 0; q < usedN; q++) if (used[q] === v.id) { seen = true; break; }
        if (seen) continue;
        const px = v.x - pos.x;
        const py = v.y - pos.y;
        const along = px * ux + py * uy;
        if (along <= 0 || along > st.range) continue;
        if (Math.abs(px * uy - py * ux) > v.radius + C.pierceSearchWidth) continue;
        if (!TOWERS[t.type].hitsAir && v.flying) continue;
        if (along < bestAlong) { bestAlong = along; bestI = i; }
      }
      if (bestI < 0) break;
      const v = s.enemies[bestI];
      used[usedN++] = v.id;
      towerHit(s, t, v, dmg, crit, false, pos.x, pos.y);
    }
    s.release();
  }
}

function fireCone(s: SimState, t: TowerInst, target: Enemy, secondary: boolean): void {
  const st = t.stats;
  const pos = SLOTS[t.slot];
  const ang = Math.atan2(target.y - pos.y, target.x - pos.x);
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  const tanHalf = Math.tan(C.coneHalfAngle);
  s.emit({ type: 'cone', x: pos.x, y: pos.y, angle: ang, range: st.range });
  const crit = s.rngC.next() < st.critChance;
  const dmg = st.damage * (crit ? st.critMult : 1);
  const buf = s.borrow();
  const n = s.grid.query(pos.x, pos.y, st.range, buf, buf.length);
  let doneTarget = false;
  // hit the chosen target first so it is the one that triggers on-hit procs
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      const v = s.enemies[buf[i]];
      if (!v.active) continue;
      if ((v === target) !== (pass === 0)) continue;
      const px = v.x - pos.x;
      const py = v.y - pos.y;
      const along = px * ux + py * uy;
      if (v !== target) {
        if (along < -v.radius) continue;
        if (Math.abs(px * uy - py * ux) > Math.max(0, along) * tanHalf + v.radius) continue;
      }
      if (v === target) doneTarget = true;
      towerHit(s, t, v, dmg, crit, v === target, pos.x, pos.y);
    }
  }
  s.release();
  if (s.hitEvents < BALANCE.caps.hitEventsPerTick && doneTarget) {
    s.hitEvents++;
    s.emit({ type: 'hit', x: target.x, y: target.y, kind: 'cone', tower: t.type });
  }
  if (secondary && target.active) applySecondary(s, t, target, dmg);
}

function launchProjectile(
  s: SimState, t: TowerInst, target: Enemy, targetIdx: number, k: number, count: number, secondary: boolean,
): void {
  const st = t.stats;
  const pos = SLOTS[t.slot];
  const def = TOWERS[t.type];
  const p = acquireProjectile(s);
  if (!p) return;
  const crit = s.rngC.next() < st.critChance;
  p.kind = PROJ_KIND[t.type];
  p.towerType = t.type;
  p.tower = t;
  p.crit = crit;
  p.dmg = st.damage * (crit ? st.critMult : 1);
  p.splash = st.splash;
  p.speed = Math.max(100, st.projSpeed);
  p.armorPen = st.armorPen;
  p.secondary = secondary;
  p.element = towerElement(t.type);
  p.sx = pos.x;
  p.sy = pos.y;
  p.t = 0;
  p.groundOnly = !def.hitsAir;

  const aimAng = Math.atan2(target.y - pos.y, target.x - pos.x);
  const off = (k - (count - 1) / 2) * 9;
  p.x = pos.x - Math.sin(aimAng) * off;
  p.y = pos.y + Math.cos(aimAng) * off;
  p.angle = aimAng;

  if (def.attack === 'lobbed') {
    const dist = len(target.x - pos.x, target.y - pos.y);
    const flight = Math.max(C.lobbedMinFlight, dist / p.speed);
    predict(target, flight);
    let tx = tmp[0];
    let ty = tmp[1];
    if (k > 0) {
      tx += (s.rngC.next() * 2 - 1) * Math.max(24, st.splash) * 0.6;
      ty += (s.rngC.next() * 2 - 1) * Math.max(24, st.splash) * 0.6;
    }
    p.mode = 2;
    p.tx = tx;
    p.ty = ty;
    p.flight = flight;
    p.arcHeight = Math.min(C.lobbedMaxArc, dist * C.lobbedArcFraction);
    p.angle = Math.atan2(ty - pos.y, tx - pos.x);
    return;
  }

  const pierce = Math.min(8, Math.round(st.flags[FL.pierce]));
  if (pierce > 0) {
    const dist = len(target.x - pos.x, target.y - pos.y);
    predict(target, dist / p.speed);
    const dx = tmp[0] - p.x;
    const dy = tmp[1] - p.y;
    const dl = len(dx, dy) || 1;
    p.mode = 1;
    p.vx = (dx / dl) * p.speed;
    p.vy = (dy / dl) * p.speed;
    p.angle = Math.atan2(dy, dx);
    p.life = st.range * 1.35 + 60;
    p.pierceLeft = pierce;
    return;
  }
  p.mode = 0;
  p.targetIdx = targetIdx;
  p.targetId = target.id;
  p.life = 4;
}

// ---------------------------------------------------------------------------------------------
// Projectile flight and impact
// ---------------------------------------------------------------------------------------------

export function updateProjectiles(s: SimState, dt: number): void {
  const pool = s.projectiles;
  for (let i = 0; i < pool.length; i++) {
    const p = pool[i];
    if (!p.active) continue;
    if (p.mode === 0) updateHoming(s, p, dt);
    else if (p.mode === 1) updateStraight(s, p, dt);
    else updateLobbed(s, p, dt);
  }
}

function updateHoming(s: SimState, p: Projectile, dt: number): void {
  p.life -= dt;
  if (p.life <= 0) { p.active = false; return; }
  let target = p.targetIdx >= 0 ? s.enemies[p.targetIdx] : null;
  if (!target || !target.active || target.id !== p.targetId) {
    // Target lost: switch to the nearest enemy nearby (not for proc shards), else fizzle.
    target = null;
    if (!p.isProc) {
      const none = s.borrow();
      const idx = s.grid.nearestExcluding(p.x, p.y, C.homingRetargetRange, none, 0, p.groundOnly, isFlyer);
      s.release();
      if (idx >= 0) {
        target = s.enemies[idx];
        p.targetIdx = idx;
        p.targetId = target.id;
      }
    }
    if (!target) { p.active = false; return; }
  }
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  const dist = len(dx, dy);
  const step = p.speed * dt;
  if (dist <= step + target.radius * 0.6) {
    p.x = target.x;
    p.y = target.y;
    p.active = false;
    projectileImpact(s, p, target);
    return;
  }
  p.x += (dx / dist) * step;
  p.y += (dy / dist) * step;
  p.angle = Math.atan2(dy, dx);
}

function updateStraight(s: SimState, p: Projectile, dt: number): void {
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.life -= p.speed * dt;
  if (p.life <= 0 || p.x < -60 || p.x > WORLD_W + 60 || p.y < -60 || p.y > WORLD_H + 60) { p.active = false; return; }
  const buf = s.borrow();
  const n = s.grid.query(p.x, p.y, 4, buf, buf.length);
  for (let i = 0; i < n; i++) {
    const v = s.enemies[buf[i]];
    if (!v.active) continue;
    if (p.groundOnly && v.flying) continue;
    let seen = false;
    for (let q = 0; q < p.hitCount; q++) if (p.hitIds[q] === v.id) { seen = true; break; }
    if (seen) continue;
    if (p.hitCount < p.hitIds.length) p.hitIds[p.hitCount++] = v.id;
    projectileImpact(s, p, v);
    if (p.pierceLeft > 0) p.pierceLeft--;
    else { p.active = false; break; }
  }
  s.release();
}

function updateLobbed(s: SimState, p: Projectile, dt: number): void {
  p.t += dt;
  const f = Math.min(1, p.t / p.flight);
  p.arcT = f;
  p.x = p.sx + (p.tx - p.sx) * f;
  p.y = p.sy + (p.ty - p.sy) * f;
  if (f < 1) return;
  p.active = false;
  landLobbed(s, p);
}

function hitEvent(s: SimState, p: Projectile, x: number, y: number): void {
  if (s.hitEvents >= BALANCE.caps.hitEventsPerTick) return;
  s.hitEvents++;
  s.emit({ type: 'hit', x, y, kind: p.kind, tower: p.towerType });
}

/** A homing/straight projectile reaches an enemy. */
function projectileImpact(s: SimState, p: Projectile, e: Enemy): void {
  const t = p.tower;
  if (!t) return;
  hitEvent(s, p, e.x, e.y);
  if (p.isProc) {
    hurt(s, e, p.dmg, t, p.armorPen, NaN, NaN, false, false);
    return;
  }
  const f = t.stats.flags;
  const ex = e.x;
  const ey = e.y;
  const eid = e.id;
  towerHit(s, t, e, p.dmg, p.crit, true, p.sx, p.sy);
  if (p.splash > 0) {
    s.emit({ type: 'explosion', x: ex, y: ey, radius: p.splash, element: p.element });
    const buf = s.borrow();
    const n = s.grid.query(ex, ey, p.splash, buf, buf.length);
    for (let i = 0; i < n; i++) {
      const v = s.enemies[buf[i]];
      if (!v.active || v.id === eid) continue;
      if (p.groundOnly && v.flying) continue;
      towerHit(s, t, v, p.dmg * C.splashSecondaryMult, false, false, NaN, NaN);
    }
    s.release();
  }
  if (p.secondary && e.active) applySecondary(s, t, e, p.dmg);
  const split = Math.min(C.shardCount, Math.round(f[FL.splitOnImpact]));
  if (split > 0) spawnShards(s, t, ex, ey, p.dmg * C.shardDamage, split, eid);
  const cluster = Math.round(f[FL.clusterBombs]);
  if (cluster > 0 && p.splash > 0) scatterBomblets(s, t, ex, ey, p.dmg * C.bombletDamage, p.splash * C.bombletRadiusFraction, cluster);
}

/** A lobbed projectile lands: explosion, bomblets (proc) or a meteor. */
function landLobbed(s: SimState, p: Projectile): void {
  if (p.isProc) {
    explosion(s, p.tx, p.ty, p.splash, p.dmg, p.tower, p.element, !p.groundOnly, p.armorPen);
    return;
  }
  const t = p.tower;
  if (!t) return;
  const f = t.stats.flags;
  s.emit({ type: 'explosion', x: p.tx, y: p.ty, radius: p.splash, element: p.element });
  const buf = s.borrow();
  const n = s.grid.query(p.tx, p.ty, p.splash, buf, buf.length);
  let primary: Enemy | null = null;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const v = s.enemies[buf[i]];
    if (!v.active || (p.groundOnly && v.flying)) { buf[i] = -1; continue; }
    const d = len(v.x - p.tx, v.y - p.ty);
    if (d < bestD) { bestD = d; primary = v; }
  }
  if (primary) hitEvent(s, p, primary.x, primary.y);
  // primary first so its on-hit procs run before the rest of the blast
  if (primary) towerHit(s, t, primary, p.dmg * edgeFalloff(bestD, p.splash), p.crit, true, p.sx, p.sy);
  for (let i = 0; i < n; i++) {
    if (buf[i] < 0) continue;
    const v = s.enemies[buf[i]];
    if (!v.active || v === primary) continue;
    const d = len(v.x - p.tx, v.y - p.ty);
    towerHit(s, t, v, p.dmg * edgeFalloff(d, p.splash), false, false, p.sx, p.sy);
  }
  s.release();
  if (primary && p.secondary && primary.active) applySecondary(s, t, primary, p.dmg);
  const split = Math.min(C.shardCount, Math.round(f[FL.splitOnImpact]));
  if (split > 0 && primary) spawnShards(s, t, p.tx, p.ty, p.dmg * C.shardDamage, split, primary.id);
  const cluster = Math.round(f[FL.clusterBombs]);
  if (cluster > 0) scatterBomblets(s, t, p.tx, p.ty, p.dmg * C.bombletDamage, p.splash * C.bombletRadiusFraction, cluster);
}

function edgeFalloff(dist: number, radius: number): number {
  if (radius <= 0) return 1;
  const r = Math.min(1, dist / radius);
  return 1 - (1 - C.lobbedEdgeMult) * r;
}
