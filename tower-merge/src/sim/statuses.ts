import { BALANCE } from '../data/balance';
import { FL } from './modifiers';
import { hurt, useProc } from './combat';
import type { Enemy, SimState, TowerInst } from './state';

const C = BALANCE.combat;

/** Slow: keeps the strongest slow and the longest remaining time. */
export function applySlow(s: SimState, e: Enemy, frac: number, dur: number): void {
  if (frac <= 0 || dur <= 0) return;
  const f = Math.min(C.maxSlow, frac);
  if (e.slowTime <= 0) s.emit({ type: 'status', enemyId: e.id, status: 'slow' });
  if (e.slowTime <= 0 || f > e.slow) e.slow = f;
  if (dur > e.slowTime) e.slowTime = dur;
}

/**
 * Freeze. Bosses freeze for at most `bossCap` seconds and then ignore freezing for a few seconds.
 * Returns true when the freeze was applied.
 */
export function applyFreeze(
  s: SimState, e: Enemy, dur: number, tower: TowerInst | null, bossCap: number = BALANCE.boss.freezeSeconds,
): boolean {
  if (e.isBoss) {
    if (e.freezeImmune > 0) return false;
    dur = Math.min(dur, bossCap);
    e.freezeImmune = dur + BALANCE.boss.freezeImmunity;
  }
  if (dur <= 0) return false;
  if (e.frozenTime <= 0) s.emit({ type: 'status', enemyId: e.id, status: 'freeze' });
  if (dur > e.frozenTime) e.frozenTime = dur;
  if (tower) {
    const r = tower.stats.flags[FL.frostNova];
    if (r > 0) frostNova(s, e, r, tower);
  }
  return true;
}

function frostNova(s: SimState, src: Enemy, radius: number, tower: TowerInst): void {
  if (!useProc(s)) return;
  s.emit({ type: 'explosion', x: src.x, y: src.y, radius, element: 'frost' });
  const buf = s.borrow();
  const n = s.grid.query(src.x, src.y, radius, buf, buf.length);
  const dmg = tower.stats.damage * C.frostNovaDamage;
  for (let i = 0; i < n; i++) {
    const v = s.enemies[buf[i]];
    if (v === src || !v.active) continue;
    applySlow(s, v, C.frostNovaSlow, C.frostNovaDuration);
    hurt(s, v, dmg, tower, tower.stats.armorPen, NaN, NaN, false, false);
  }
  s.release();
}

export function applyStun(s: SimState, e: Enemy, dur: number): void {
  if (e.isBoss) {
    if (e.stunImmune > 0) return;
    dur = Math.min(dur, BALANCE.boss.stunSeconds);
    e.stunImmune = dur + BALANCE.boss.stunImmunity;
  }
  if (dur <= 0) return;
  if (e.stunTime <= 0) s.emit({ type: 'status', enemyId: e.id, status: 'stun' });
  if (dur > e.stunTime) e.stunTime = dur;
}

export function applyBurn(s: SimState, e: Enemy, dps: number, dur: number, src: TowerInst | null): void {
  if (dps <= 0 || dur <= 0) return;
  if (e.burnTime <= 0) {
    e.burnDps = dps;
    s.emit({ type: 'status', enemyId: e.id, status: 'burn' });
  } else if (dps > e.burnDps) {
    e.burnDps = dps;
  }
  if (dur > e.burnTime) e.burnTime = dur;
  if (src) e.burnSrc = src;
}

export function applyPoison(s: SimState, e: Enemy, stacks: number, dpsPerStack: number, dur: number, src: TowerInst | null): void {
  if (stacks <= 0 || dur <= 0) return;
  if (e.poisonTime <= 0) {
    e.poisonStacks = 0;
    e.poisonDps = dpsPerStack;
    s.emit({ type: 'status', enemyId: e.id, status: 'poison' });
  } else if (dpsPerStack > e.poisonDps) {
    e.poisonDps = dpsPerStack;
  }
  e.poisonStacks = Math.min(C.maxPoisonStacks, e.poisonStacks + stacks);
  if (dur > e.poisonTime) e.poisonTime = dur;
  if (src) e.poisonSrc = src;
}

export function applyVulnerability(e: Enemy, frac: number, dur: number): void {
  const f = Math.min(C.maxVulnerability, frac);
  if (f > e.vulnerable || e.vulnTime <= 0) e.vulnerable = f;
  if (dur > e.vulnTime) e.vulnTime = dur;
}

/** Counts statuses down and applies burn/poison damage. Returns false when the enemy died. */
export function tickStatuses(s: SimState, e: Enemy, dt: number): boolean {
  e.hitFlash += dt;
  if (e.hitFlash > 9) e.hitFlash = 9;
  if (e.slowTime > 0) {
    e.slowTime -= dt;
    if (e.slowTime <= 0) { e.slowTime = 0; e.slow = 0; }
  }
  if (e.frozenTime > 0) { e.frozenTime -= dt; if (e.frozenTime < 0) e.frozenTime = 0; }
  if (e.stunTime > 0) { e.stunTime -= dt; if (e.stunTime < 0) e.stunTime = 0; }
  if (e.freezeImmune > 0) e.freezeImmune -= dt;
  if (e.stunImmune > 0) e.stunImmune -= dt;
  if (e.hasteTime > 0) {
    e.hasteTime -= dt;
    if (e.hasteTime <= 0) { e.hasteTime = 0; e.hasteMult = 1; }
  }
  if (e.vulnTime > 0) {
    e.vulnTime -= dt;
    if (e.vulnTime <= 0) { e.vulnTime = 0; e.vulnerable = 0; }
  }
  if (e.armorBonusTime > 0) {
    e.armorBonusTime -= dt;
    if (e.armorBonusTime <= 0) { e.armorBonusTime = 0; e.armorBonus = 0; e.armor = e.baseArmor; }
  }

  let burnPart = 0;
  let poisonPart = 0;
  if (e.burnTime > 0) {
    e.burnTime -= dt;
    burnPart = e.burnDps;
    if (e.burnTime <= 0) { e.burnTime = 0; e.burnDps = 0; }
    else if (e.burnSrc && e.burnSrc.stats.flags[FL.fireSpread] > 0) {
      e.spreadTimer += dt;
      if (e.spreadTimer >= C.fireSpreadInterval) {
        e.spreadTimer = 0;
        spreadBurn(s, e, e.burnDps, e.burnTime, e.burnSrc);
      }
    }
  }
  if (e.poisonTime > 0) {
    e.poisonTime -= dt;
    poisonPart = e.poisonStacks * e.poisonDps;
    if (e.poisonTime <= 0) { e.poisonTime = 0; e.poisonStacks = 0; e.poisonDps = 0; }
  }
  const total = burnPart + poisonPart;
  if (total > 0) {
    const credit = burnPart >= poisonPart ? e.burnSrc : e.poisonSrc;
    // Damage over time ignores armor (armorPen 1) and the front shield.
    hurt(s, e, total * dt, credit, 1, NaN, NaN, false, true);
    return e.active;
  }
  return true;
}

/** Spreads a burn to the nearest enemy that is not already burning (fireSpread). Returns true if it spread. */
export function spreadBurn(s: SimState, from: Enemy, dps: number, dur: number, src: TowerInst): boolean {
  if (!useProc(s)) return false;
  const buf = s.borrow();
  const n = s.grid.query(from.x, from.y, C.fireSpreadRange, buf, buf.length);
  let best: Enemy | null = null;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const v = s.enemies[buf[i]];
    if (v === from || !v.active || v.burnTime > 0.5) continue;
    const dx = v.x - from.x;
    const dy = v.y - from.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = v; }
  }
  s.release();
  if (!best) return false;
  applyBurn(s, best, dps, Math.max(dur, 1.5), src);
  return true;
}
