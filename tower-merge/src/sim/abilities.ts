import { BALANCE } from '../data/balance';
import type { AbilityId } from '../data/types';
import { callMeteor } from './combat';
import { applyFreeze } from './statuses';
import { refresh } from './refresh';
import type { Enemy, SimState } from './state';

const A = BALANCE.abilities;

export function initAbilities(s: SimState): void {
  for (const id of s.opts.abilities) {
    const max = A[id].cooldown * s.abilityCdMult;
    s.abilities.push({ id, cooldown: max * (1 - A.startCooldownFraction), maxCooldown: max, activeTime: 0 });
  }
}

/** Cooldowns, effect timers and the frenzy buff. */
export function updateAbilities(s: SimState, dt: number): void {
  for (const a of s.abilities) {
    if (a.cooldown > 0) a.cooldown = Math.max(0, a.cooldown - dt);
    if (a.activeTime > 0) a.activeTime = Math.max(0, a.activeTime - dt);
  }
  if (s.frenzyTime > 0) {
    s.frenzyTime -= dt;
    if (s.frenzyTime <= 0) { s.frenzyTime = 0; s.dirty = true; }
  }
  if (s.mergeFrenzyTime > 0) {
    s.mergeFrenzyTime -= dt;
    if (s.mergeFrenzyTime <= 0) { s.mergeFrenzyTime = 0; s.dirty = true; }
  }
}

/** The point at the centre of the densest enemy cluster (ties: furthest along), or null without enemies. */
function densestCluster(s: SimState, radius: number): { x: number; y: number } | null {
  let best: Enemy | null = null;
  let bestCount = -1;
  const buf = s.borrow();
  for (let i = 0; i < s.enemies.length; i++) {
    const e = s.enemies[i];
    if (!e.active) continue;
    const n = s.grid.query(e.x, e.y, radius * 0.7, buf, buf.length);
    const score = n + (e.isBoss ? 3 : 0);
    if (score > bestCount || (score === bestCount && best && e.progress > best.progress)) {
      bestCount = score;
      best = e;
    }
  }
  let result: { x: number; y: number } | null = null;
  if (best) {
    // aim at the centroid of the cluster so the blast covers as many members as possible
    const n = s.grid.query(best.x, best.y, radius * 0.7, buf, buf.length);
    let sx = 0;
    let sy = 0;
    let c = 0;
    for (let i = 0; i < n; i++) {
      const v = s.enemies[buf[i]];
      if (!v.active) continue;
      sx += v.x;
      sy += v.y;
      c++;
    }
    result = c > 0 ? { x: sx / c, y: sy / c } : { x: best.x, y: best.y };
  }
  s.release();
  return result;
}

export function useAbility(s: SimState, id: AbilityId): boolean {
  if (s.phase !== 'wave' && s.phase !== 'prewave') return false;
  const ab = s.abilities.find((a) => a.id === id);
  if (!ab || ab.cooldown > 0) return false;
  const power = s.abilityPowerMult;
  let used = false;
  switch (id) {
    case 'meteor': {
      const m = A.meteor;
      const target = densestCluster(s, m.radius);
      if (!target) return false;
      callMeteor(s, target.x, target.y, m.radius, (m.damageBase + m.damagePerWave * s.wave) * power);
      s.emit({ type: 'abilityUsed', ability: 'meteor', x: target.x, y: target.y, radius: m.radius });
      used = true;
      break;
    }
    case 'freeze': {
      if (s.alive === 0) return false;
      const dur = A.freeze.duration * power;
      for (let i = 0; i < s.enemies.length; i++) {
        const e = s.enemies[i];
        if (e.active) applyFreeze(s, e, dur, null, A.freeze.bossDuration * power);
      }
      ab.activeTime = dur;
      s.emit({ type: 'abilityUsed', ability: 'freeze' });
      used = true;
      break;
    }
    case 'repair': {
      if (s.castleHp >= s.castleMaxHp) return false;
      const amount = Math.min(s.castleMaxHp - s.castleHp, s.castleMaxHp * A.repair.healFraction * power);
      s.castleHp += amount;
      s.emit({ type: 'castleHealed', amount, hp: s.castleHp });
      s.emit({ type: 'abilityUsed', ability: 'repair' });
      used = true;
      break;
    }
    case 'frenzy': {
      const dur = A.frenzy.duration * power;
      s.frenzyTime = dur;
      ab.activeTime = dur;
      s.emit({ type: 'abilityUsed', ability: 'frenzy' });
      refresh(s);
      used = true;
      break;
    }
  }
  if (used) {
    ab.cooldown = ab.maxCooldown;
    s.stats.abilitiesUsed++;
  }
  return used;
}
