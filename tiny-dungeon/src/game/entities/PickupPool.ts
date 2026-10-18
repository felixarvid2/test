import Phaser from 'phaser';
import { BALANCE } from '../../config/balance';
import { addGold, addXp } from '../../core/run';
import { services } from '../../services';
import { EXTRA_KEY } from '../assets';
import { PLAY } from '../systems/layout';
import type { World } from '../systems/World';

export const PICKUP_XP = 0;
export const PICKUP_XP_BIG = 1;
export const PICKUP_COIN = 2;

const COIN_FRAMES = ['coin_0', 'coin_1', 'coin_2', 'coin_3'];

class Pickup {
  on = false;
  kind = PICKUP_XP;
  value = 0;
  raw = false;                 // value is final gold (treasure): no goldMult
  x = 0; y = 0; z = 0;
  vx = 0; vy = 0; vz = 0;
  age = 0;
  landed = false;
  magnet = false;
  magnetT = 0;
  readonly sprite: Phaser.GameObjects.Image;
  constructor(scene: Phaser.Scene) {
    this.sprite = scene.add.image(0, 0, EXTRA_KEY, 'xp_gem').setVisible(false).setDepth(90);
  }
}

/** XP gems and coins: they bounce out of enemies, then fly to the hero when in range (or when the room clears). */
export class PickupPool {
  private readonly pool: Pickup[] = [];
  private chain = 0;
  private chainT = 0;
  private vacuum = false;

  constructor(scene: Phaser.Scene, private readonly w: World) {
    for (let i = 0; i < BALANCE.limits.maxPickups; i++) this.pool.push(new Pickup(scene));
  }

  get count(): number {
    let n = 0;
    for (let i = 0; i < this.pool.length; i++) if (this.pool[i].on) n++;
    return n;
  }

  /** Spawns a pickup that hops out of (x, y). When the pool is full the reward is granted at once. */
  spawn(kind: number, value: number, x: number, y: number, raw = false, power = 1): void {
    let p: Pickup | null = null;
    for (let i = 0; i < this.pool.length; i++) {
      if (!this.pool[i].on) { p = this.pool[i]; break; }
    }
    if (!p) {
      this.grant(kind, value, raw);
      return;
    }
    const a = Math.random() * Math.PI * 2;
    const sp = (60 + Math.random() * 110) * power;
    p.on = true; p.kind = kind; p.value = value; p.raw = raw;
    p.x = x; p.y = y; p.z = 14 + Math.random() * 8;
    p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp * 0.6; p.vz = (260 + Math.random() * 160) * Math.min(1.4, power);
    p.age = 0; p.landed = false; p.magnet = this.vacuum; p.magnetT = 0;
    p.sprite.setVisible(true).setAlpha(1).setScale(kind === PICKUP_COIN ? 2.6 : kind === PICKUP_XP_BIG ? 3 : 3)
      .setFrame(kind === PICKUP_COIN ? 'coin_0' : kind === PICKUP_XP_BIG ? 'xp_gem_big' : 'xp_gem')
      .setPosition(x, y - p.z);
  }

  /** Every pickup flies to the hero (room cleared). */
  vacuumAll(): void {
    this.vacuum = true;
    for (let i = 0; i < this.pool.length; i++) if (this.pool[i].on) this.pool[i].magnet = true;
  }

  /** Failsafe: grants everything still on the floor at once. */
  grantAll(): void {
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.on) continue;
      this.grant(p.kind, p.value, p.raw);
      p.on = false;
      p.sprite.setVisible(false);
    }
  }

  clear(): void {
    this.vacuum = false;
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i].on = false;
      this.pool[i].sprite.setVisible(false);
    }
  }

  private grant(kind: number, value: number, raw: boolean): void {
    const w = this.w;
    const run = w.run;
    if (kind === PICKUP_COIN) {
      if (raw) run.gold += value;
      else addGold(run, value);
      services.audio.play('coin', { rate: 1 + Math.min(0.5, this.chain * 0.04) });
    } else {
      const levels = addXp(run, value);
      services.audio.play('xp', { rate: 1 + Math.min(0.6, this.chain * 0.05) });
      if (levels > 0) w.hooks.levelUp(levels);
    }
    this.chain += 1;
    this.chainT = 0.45;
  }

  update(dt: number, time: number): void {
    const w = this.w;
    const pl = w.player;
    const pr = w.run.stats.pickupRadius;
    const frame = ((time * 12) | 0) & 3;
    if (this.chainT > 0) {
      this.chainT -= dt;
      if (this.chainT <= 0) this.chain = 0;
    }
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.on) continue;
      p.age += dt;
      if (!p.landed) {
        p.vz -= 1100 * dt;
        p.z += p.vz * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 1 - 2.2 * dt;
        p.vy *= 1 - 2.2 * dt;
        if (p.z <= 0) {
          p.z = 0;
          p.vz = -p.vz * 0.42;
          if (Math.abs(p.vz) < 70) { p.landed = true; p.vz = 0; }
        }
        p.x = Math.min(PLAY.right - 8, Math.max(PLAY.left + 8, p.x));
        p.y = Math.min(PLAY.bottom - 8, Math.max(PLAY.top + 8, p.y));
      }
      const dx = pl.x - p.x;
      const dy = pl.y - 14 - p.y;
      const d2 = dx * dx + dy * dy;
      if (!p.magnet && p.age > 0.3 && d2 < pr * pr) p.magnet = true;
      if (p.magnet && p.age > (this.vacuum ? 0.1 : 0.25)) {
        p.magnetT += dt;
        p.z = Math.max(0, p.z - 300 * dt);
        const d = Math.sqrt(d2) || 1;
        const sp = 280 + p.magnetT * 1500;
        const step = Math.min(d, sp * dt);
        p.x += (dx / d) * step;
        p.y += (dy / d) * step;
        if (d - step < 20) {
          this.grant(p.kind, p.value, p.raw);
          p.on = false;
          p.sprite.setVisible(false);
          w.fx.emit('spark', pl.x, pl.y - 14, 2, 0, 6.28, 40, 110, 0.15, 0.3, 0.9, 0.1, p.kind === PICKUP_COIN ? 0xffd860 : 0x6fdcff);
          continue;
        }
      }
      const wob = p.landed && !p.magnet ? Math.sin(time * 5 + i) * 2 : 0;
      p.sprite.setPosition(p.x, p.y - p.z - 8 + wob);
      if (p.kind === PICKUP_COIN) p.sprite.setFrame(COIN_FRAMES[(frame + i) & 3]);
    }
  }
}
