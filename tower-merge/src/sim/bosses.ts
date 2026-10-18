import { len } from './math';
import { BALANCE } from '../data/balance';
import { CASTLE, SLOTS } from '../data/map';
import type { BossAbility, EnemyId } from '../data/types';
import { damageCastle, spawnEnemy } from './enemies';
import type { Enemy, SimState } from './state';

/** A tower slot counts as inside a fire line if its centre is within this extra margin of the beam. */
const SLOT_MARGIN = BALANCE.combat.fireLineSlotMargin;

/** Starts a boss phase: resets ability timers (first use comes a bit sooner) and announces it. */
export function enterPhase(s: SimState, e: Enemy, phase: number): void {
  const def = e.bossDef!;
  e.phase = phase;
  const ph = def.phases[phase];
  for (let i = 0; i < ph.abilities.length && i < e.bossTimers.length; i++) {
    const ab = ph.abilities[i];
    e.bossTimers[i] = 'interval' in ab ? ab.interval * ph.intervalMult * 0.6 : 0;
  }
  s.emit({ type: 'bossPhase', boss: def.id, phase, announce: ph.announce });
}

/** Phase changes by HP and data-driven abilities. `paused` (frozen/stunned) freezes timers. */
export function updateBoss(s: SimState, e: Enemy, dt: number, paused: boolean): void {
  const def = e.bossDef!;
  const frac = e.hp / e.maxHp;
  let np = e.phase;
  for (let p = e.phase + 1; p < def.phases.length; p++) if (frac <= def.phases[p].hpBelow) np = p;
  if (np !== e.phase) enterPhase(s, e, np);
  if (paused) return;

  const ph = def.phases[e.phase];
  if (e.busyTime > 0) {
    e.busyTime -= dt;
    if (e.busyTime <= 0) {
      e.busyTime = 0;
      finishBusy(s, e);
    }
  }
  if (e.chargeTime > 0) {
    e.chargeTime -= dt;
    if (e.chargeTime <= 0) { e.chargeTime = 0; e.charging = false; }
  }
  const abs = ph.abilities;
  for (let i = 0; i < abs.length && i < e.bossTimers.length; i++) {
    const ab = abs[i];
    if (ab.kind === 'spawnOnDamage') {
      const milestone = Math.floor((1 - frac) / ab.everyFraction + 1e-9);
      if (milestone > e.spawnMilestone) {
        const times = Math.min(3, milestone - e.spawnMilestone);
        e.spawnMilestone = milestone;
        spawnAround(s, e, ab.enemy, ab.count * times);
        s.emit({ type: 'bossAbility', boss: def.id, ability: 'spawnOnDamage', x: e.x, y: e.y });
      }
      continue;
    }
    if (e.bossTimers[i] > 0) e.bossTimers[i] -= dt;
    if (e.bossTimers[i] > 0 || e.busyTime > 0 || e.chargeTime > 0) continue;
    const started = fire(s, e, ab);
    e.bossTimers[i] = started ? ab.interval * ph.intervalMult : 1.5;
  }
}

function spawnAround(s: SimState, e: Enemy, kind: EnemyId, count: number): void {
  const plan = s.plan;
  for (let k = 0; k < count; k++) {
    spawnEnemy(s, kind, {
      progress: Math.max(0, e.progress - 30 - k * 14),
      hpMult: plan ? plan.hpMult : 1,
      speedMult: plan ? plan.speedMult : 1,
      coinMult: 0.5,
      summoned: true,
    });
  }
}

/** Triggers one ability. Returns false when it could not start (e.g. no tower to disable). */
function fire(s: SimState, e: Enemy, ab: BossAbility): boolean {
  const def = e.bossDef!;
  switch (ab.kind) {
    case 'summon':
      spawnAround(s, e, ab.enemy, ab.count);
      s.emit({ type: 'bossAbility', boss: def.id, ability: 'summon', x: e.x, y: e.y });
      return true;
    case 'haste': {
      const buf = s.borrow();
      const n = s.grid.query(e.x, e.y, ab.radius, buf, buf.length);
      for (let k = 0; k < n; k++) {
        const v = s.enemies[buf[k]];
        if (!v.active || v.isBoss) continue;
        v.hasteTime = ab.duration;
        v.hasteMult = ab.speedMult;
      }
      s.release();
      s.emit({ type: 'bossAbility', boss: def.id, ability: 'haste', x: e.x, y: e.y });
      return true;
    }
    case 'shieldAllies': {
      const buf = s.borrow();
      const n = s.grid.query(e.x, e.y, ab.radius, buf, buf.length);
      for (let k = 0; k < n; k++) {
        const v = s.enemies[buf[k]];
        if (!v.active || v === e) continue;
        if (v.shield < ab.shieldHp) v.shield = ab.shieldHp;
      }
      s.release();
      s.emit({ type: 'bossAbility', boss: def.id, ability: 'shieldAllies', x: e.x, y: e.y });
      return true;
    }
    case 'armorUp':
      e.armorBonus = ab.armor;
      e.armorBonusTime = ab.duration;
      e.armor = Math.min(BALANCE.combat.maxArmor, e.baseArmor + ab.armor);
      s.emit({ type: 'bossAbility', boss: def.id, ability: 'armorUp', x: e.x, y: e.y });
      return true;
    case 'charge':
      e.busyAb = ab;
      e.busyTime = ab.telegraph;
      e.charging = true;
      s.emit({ type: 'bossTelegraph', boss: def.id, ability: 'charge', x: e.x, y: e.y, duration: ab.telegraph });
      return true;
    case 'fireBreath': {
      aimFireBreath(s, e, ab.length, ab.width);
      e.busyAb = ab;
      e.busyTime = ab.telegraph;
      s.emit({
        type: 'bossTelegraph', boss: def.id, ability: 'fireBreath', x: e.x, y: e.y, tx: e.busyTx, ty: e.busyTy,
        duration: ab.telegraph, width: ab.width, length: ab.length,
      });
      return true;
    }
    case 'disableTower': {
      let count = 0;
      for (const slot of s.slots) if (slot.tower && slot.tower.disabledTime <= 0) count++;
      if (count === 0) return false;
      let pick = s.rngC.int(count);
      let chosen = -1;
      for (const slot of s.slots) {
        if (slot.tower && slot.tower.disabledTime <= 0) {
          if (pick-- === 0) { chosen = slot.id; break; }
        }
      }
      if (chosen < 0) return false;
      e.busyAb = ab;
      e.busyTime = ab.telegraph;
      e.busySlot = chosen;
      e.busyTx = SLOTS[chosen].x;
      e.busyTy = SLOTS[chosen].y;
      s.emit({
        type: 'bossTelegraph', boss: def.id, ability: 'disableTower', x: e.x, y: e.y, tx: e.busyTx, ty: e.busyTy,
        slot: chosen, duration: ab.telegraph,
      });
      return true;
    }
    default:
      return false;
  }
}

/** Number of towers inside a fire line from (x, y) toward (tx, ty). */
function towersInLine(s: SimState, x: number, y: number, tx: number, ty: number, length: number, width: number): number {
  const dx = tx - x;
  const dy = ty - y;
  const dl = len(dx, dy) || 1;
  const ux = dx / dl;
  const uy = dy / dl;
  let count = 0;
  for (const slot of s.slots) {
    if (!slot.tower) continue;
    const px = SLOTS[slot.id].x - x;
    const py = SLOTS[slot.id].y - y;
    const along = px * ux + py * uy;
    const perp = Math.abs(px * uy - py * ux);
    if (along >= -20 && along <= length && perp <= width / 2 + SLOT_MARGIN) count++;
  }
  return count;
}

/** Aims at the densest group of towers (falls back to the castle when the board is empty). */
function aimFireBreath(s: SimState, e: Enemy, length: number, width: number): void {
  let best = -1;
  let bx: number = CASTLE.x;
  let by: number = CASTLE.y;
  for (const slot of s.slots) {
    if (!slot.tower) continue;
    const tx = SLOTS[slot.id].x;
    const ty = SLOTS[slot.id].y;
    const c = towersInLine(s, e.x, e.y, tx, ty, length, width);
    if (c > best) { best = c; bx = tx; by = ty; }
  }
  const dx = bx - e.x;
  const dy = by - e.y;
  const dl = len(dx, dy) || 1;
  e.busyTx = e.x + (dx / dl) * length;
  e.busyTy = e.y + (dy / dl) * length;
}

function finishBusy(s: SimState, e: Enemy): void {
  const ab = e.busyAb;
  const def = e.bossDef!;
  e.busyAb = null;
  if (!ab) return;
  switch (ab.kind) {
    case 'charge':
      e.chargeTime = ab.duration;
      e.chargeMult = ab.speedMult;
      s.emit({ type: 'bossAbility', boss: def.id, ability: 'charge', x: e.x, y: e.y });
      return; // `charging` stays true until the charge ends
    case 'fireBreath': {
      const dx = e.busyTx - e.x;
      const dy = e.busyTy - e.y;
      const dl = len(dx, dy) || 1;
      const ux = dx / dl;
      const uy = dy / dl;
      for (const slot of s.slots) {
        const t = slot.tower;
        if (!t) continue;
        const px = SLOTS[slot.id].x - e.x;
        const py = SLOTS[slot.id].y - e.y;
        const along = px * ux + py * uy;
        const perp = Math.abs(px * uy - py * ux);
        if (along >= -20 && along <= ab.length && perp <= ab.width / 2 + SLOT_MARGIN) {
          t.disabledTime = Math.max(t.disabledTime, BALANCE.combat.scorchSeconds);
          s.emit({ type: 'towerDisabled', slot: slot.id, duration: BALANCE.combat.scorchSeconds });
        }
      }
      const cx = CASTLE.x - e.x;
      const cy = CASTLE.y - e.y;
      const along = cx * ux + cy * uy;
      const perp = Math.abs(cx * uy - cy * ux);
      if (along >= -20 && along <= ab.length + CASTLE.height / 2 && perp <= ab.width / 2 + CASTLE.width / 3) {
        damageCastle(s, ab.castleDamage * Math.pow(BALANCE.boss.loopDamageMult, e.bossLoop));
      }
      s.emit({ type: 'bossAbility', boss: def.id, ability: 'fireBreath', x: e.x, y: e.y });
      break;
    }
    case 'disableTower': {
      const t = e.busySlot >= 0 ? s.slots[e.busySlot].tower : null;
      if (t) {
        t.disabledTime = Math.max(t.disabledTime, ab.duration);
        s.emit({ type: 'towerDisabled', slot: e.busySlot, duration: ab.duration });
      }
      s.emit({ type: 'bossAbility', boss: def.id, ability: 'disableTower', x: e.x, y: e.y });
      e.busySlot = -1;
      break;
    }
    default:
      break;
  }
  e.charging = false;
}
