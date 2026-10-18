import { BALANCE } from '../../config/balance';
import { COLORS } from '../assets';
import type { Enemy } from '../entities/Enemy';
import type { World } from './World';

const TICK = 0.5;

/** Burn / poison damage over time, slow and freeze. Tints and flames are drawn by Enemy.render. */
export class StatusSystem {
  private readonly near: Enemy[] = [];

  constructor(private readonly w: World) {}

  burn(e: Enemy, dpsPerStack: number, maxStacks: number): void {
    if (e.burnTime <= 0) e.burnTick = TICK;
    e.burnStacks = Math.min(Math.max(1, Math.floor(maxStacks)), e.burnStacks + 1);
    e.burnTime = BALANCE.status.burnDuration;
    if (dpsPerStack > e.burnDps) e.burnDps = dpsPerStack;
  }

  poison(e: Enemy, dps: number): void {
    if (e.poisonTime <= 0) e.poisonTick = TICK;
    e.poisonTime = BALANCE.status.poisonDuration;
    if (dps > e.poisonDps) e.poisonDps = dps;
  }

  slow(e: Enemy, amount: number, duration: number): void {
    const a = e.isBoss ? amount * 0.5 : amount;
    if (a > e.slowAmt || e.slowTime <= 0) e.slowAmt = a;
    e.slowTime = Math.max(e.slowTime, duration);
  }

  freeze(e: Enemy, duration: number): void {
    if (e.isBoss) return;
    const d = e.elite ? duration * 0.5 : duration;
    if (e.freezeTime <= 0) this.w.fx.emit('ice_shard', e.x, e.y - 10, 4, 0, 6.28, 60, 160, 0.3, 0.5, 1.2, 0.3, 0xffffff, 120, false);
    e.freezeTime = Math.max(e.freezeTime, d);
  }

  /** Poison jumps to neighbours when a poisoned enemy dies (Toxic Plague). */
  spreadPoison(from: Enemy): void {
    const w = this.w;
    const n = w.grid.queryCircle(from.x, from.y, BALANCE.status.poisonSpreadRadius, this.near);
    for (let i = 0; i < n; i++) {
      const o = this.near[i];
      if (o === from) continue;
      this.poison(o, from.poisonDps);
      w.fx.emit('puff', o.x, o.y - 8, 2, -1.57, 1, 20, 60, 0.3, 0.5, 1, 1.6, COLORS.poison, -30, false, 0.8);
    }
    w.fx.ring(from.x, from.y, 16, BALANCE.status.poisonSpreadRadius, 0.35, COLORS.poison);
  }

  update(dt: number): void {
    const w = this.w;
    const all = w.enemies.all;
    for (let i = 0; i < all.length; i++) {
      const e = all[i];
      if (!e.active || e.dying) continue;
      if (e.freezeTime > 0) e.freezeTime -= dt;
      if (e.slowTime > 0) {
        e.slowTime -= dt;
        if (e.slowTime <= 0) e.slowAmt = 0;
      }
      if (e.burnTime > 0) {
        e.burnTime -= dt;
        e.burnTick -= dt;
        if (e.burnTick <= 0) {
          e.burnTick += TICK;
          w.combat.dot(e, e.burnDps * e.burnStacks * TICK, COLORS.fire);
          if (!e.active || e.dying) continue;
        }
        if (e.burnTime <= 0) { e.burnStacks = 0; e.burnDps = 0; }
      }
      if (e.poisonTime > 0) {
        e.poisonTime -= dt;
        e.poisonTick -= dt;
        if (Math.random() < dt * 5) w.fx.emit('puff', e.x, e.y - e.radius, 1, -1.57, 0.8, 15, 40, 0.4, 0.7, 0.6, 1.1, COLORS.poison, -50, false, 0.8);
        if (e.poisonTick <= 0) {
          e.poisonTick += TICK;
          w.combat.dot(e, e.poisonDps * TICK, COLORS.poison);
          if (!e.active || e.dying) continue;
        }
        if (e.poisonTime <= 0) e.poisonDps = 0;
      }
    }
  }
}
