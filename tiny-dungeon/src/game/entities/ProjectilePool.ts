import Phaser from 'phaser';
import { BALANCE } from '../../config/balance';
import { EXTRA_KEY } from '../assets';
import { FX_GLOW } from '../systems/Effects';
import { HIT_COMPANION, HIT_NOSTATUS, HIT_WEAPON } from '../systems/CombatSystem';
import { PLAY } from '../systems/layout';
import type { World } from '../systems/World';

export class Projectile {
  on = false;
  friendly = true;
  x = 0; y = 0; vx = 0; vy = 0;
  radius = 10;
  damage = 0;
  dmgMult = 1;
  knock = 0;
  pierce = 0;
  bounces = 0;
  life = 0;
  homing = false;
  noStatus = false;
  companion = false;
  spin = 0;
  trail = 0;                  // tint of the particle trail (0 = none)
  trailT = 0;
  /** Enemy shots only: called with the end point when the shot expires or hits a wall (not when it hits the hero). */
  land: ((x: number, y: number) => void) | null = null;
  tint = 0xffffff;
  hit = new Int32Array(12);
  hitN = 0;
  readonly sprite: Phaser.GameObjects.Image;
  readonly outline: Phaser.GameObjects.Image;
  readonly glow: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene) {
    this.outline = scene.add.image(0, 0, EXTRA_KEY, 'spark').setVisible(false).setDepth(299);
    this.glow = scene.add.image(0, 0, FX_GLOW).setVisible(false).setDepth(298).setBlendMode(Phaser.BlendModes.ADD);
    this.sprite = scene.add.image(0, 0, EXTRA_KEY, 'spark').setVisible(false).setDepth(300);
  }
}

/** Fixed-cap pool for either the hero's or the enemies' projectiles. Grows lazily up to the cap. */
export class ProjectilePool {
  private readonly pool: Projectile[] = [];
  private readonly tmp: import('../entities/Enemy').Enemy[] = [];

  constructor(private readonly scene: Phaser.Scene, private readonly w: World, private readonly friendly: boolean, private readonly cap = BALANCE.limits.maxProjectiles) {}

  get count(): number {
    let n = 0;
    for (let i = 0; i < this.pool.length; i++) if (this.pool[i].on) n++;
    return n;
  }

  acquire(): Projectile | null {
    for (let i = 0; i < this.pool.length; i++) if (!this.pool[i].on) return this.pool[i];
    if (this.pool.length >= this.cap) return null;
    const p = new Projectile(this.scene);
    p.friendly = this.friendly;
    this.pool.push(p);
    return p;
  }

  /**
   * Starts a projectile. `glowTint` < 0 means no glow. Enemy projectiles get a dark outline copy so they
   * stand out against the floor and the hero's own effects.
   */
  launch(p: Projectile, x: number, y: number, angle: number, speed: number, key: string, frame: string | number, scale: number, glowTint: number, spin = 0): void {
    p.on = true;
    p.x = x; p.y = y;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.hitN = 0;
    p.trailT = 0;
    p.land = null;
    p.spin = spin;
    p.sprite.setTexture(key, frame).setPosition(x, y).setScale(scale).setRotation(spin ? 0 : angle).setVisible(true).setAlpha(1);
    if (!this.friendly) {
      p.outline.setTexture(key, frame).setTintFill(0x12060e).setScale(scale * 1.38).setRotation(spin ? 0 : angle).setPosition(x, y).setVisible(true).setAlpha(0.9);
    } else {
      p.outline.setVisible(false);
    }
    if (glowTint >= 0) p.glow.setTint(glowTint).setPosition(x, y).setScale(scale * (this.friendly ? 0.55 : 0.9)).setAlpha(this.friendly ? 0.75 : 0.65).setVisible(true);
    else p.glow.setVisible(false);
  }

  private kill(p: Projectile, puff: boolean): void {
    p.on = false;
    p.sprite.setVisible(false);
    p.outline.setVisible(false);
    p.glow.setVisible(false);
    if (puff) this.w.fx.emit('spark', p.x, p.y, 3, 0, 6.28, 30, 110, 0.15, 0.3, 0.9, 0.1, p.tint);
  }

  private land(p: Projectile): void {
    const cb = p.land;
    if (!cb) return;
    p.land = null;
    cb(p.x, p.y);
  }

  clear(): void {
    for (let i = 0; i < this.pool.length; i++) this.kill(this.pool[i], false);
  }

  update(dt: number): void {
    const w = this.w;
    const player = w.player;
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) { this.land(p); this.kill(p, !this.friendly); continue; }

      if (p.homing) this.steer(p, dt);
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      const steps = Math.max(1, Math.ceil((speed * dt) / 14));
      const sdt = dt / steps;
      let dead = false;
      for (let s = 0; s < steps && !dead; s++) {
        p.x += p.vx * sdt;
        p.y += p.vy * sdt;
        if (p.x < PLAY.left - 6 || p.x > PLAY.right + 6 || p.y < PLAY.top - 20 || p.y > PLAY.bottom + 6) {
          this.land(p);
          dead = true;
          break;
        }
        if (this.friendly) dead = this.hitEnemies(p);
        else {
          const dx = player.x - p.x;
          const dy = player.y - 12 - p.y;
          const rr = player.radius + p.radius;
          if (dx * dx + dy * dy < rr * rr && !player.dead) {
            player.hurt(p.damage);
            dead = true;
          }
        }
      }
      if (dead) { this.kill(p, true); continue; }

      p.sprite.setPosition(p.x, p.y);
      if (p.spin) p.sprite.rotation += p.spin * dt;
      else p.sprite.setRotation(Math.atan2(p.vy, p.vx));
      if (!this.friendly) {
        p.outline.setPosition(p.x, p.y).setRotation(p.sprite.rotation);
      }
      if (p.glow.visible) p.glow.setPosition(p.x, p.y);
      if (p.trail !== 0) {
        p.trailT -= dt;
        if (p.trailT <= 0) {
          p.trailT = 0.03;
          w.fx.emit('spark', p.x, p.y, 1, 0, 6.28, 0, 24, 0.16, 0.26, 0.9, 0.1, p.trail);
        }
      }
    }
  }

  private steer(p: Projectile, dt: number): void {
    const target = this.w.grid.nearestExcluding(p.x, p.y, 280, p.hit, p.hitN);
    if (!target) return;
    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1;
    const cur = Math.atan2(p.vy, p.vx);
    const want = Math.atan2(target.y - p.y, target.x - p.x);
    let d = want - cur;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const turn = Math.max(-3.2 * dt, Math.min(3.2 * dt, d));
    p.vx = Math.cos(cur + turn) * speed;
    p.vy = Math.sin(cur + turn) * speed;
  }

  /** Returns true when the projectile is spent. */
  private hitEnemies(p: Projectile): boolean {
    const w = this.w;
    const n = w.grid.queryCircle(p.x, p.y, p.radius, this.tmp);
    for (let i = 0; i < n; i++) {
      const e = this.tmp[i];
      let seen = false;
      for (let k = 0; k < p.hitN; k++) if (p.hit[k] === e.id) { seen = true; break; }
      if (seen) continue;
      if (p.hitN < p.hit.length) p.hit[p.hitN++] = e.id;
      const flags = p.companion ? HIT_COMPANION | HIT_NOSTATUS : p.noStatus ? HIT_WEAPON | HIT_NOSTATUS : HIT_WEAPON;
      w.combat.hit(e, p.damage * p.dmgMult, flags, p.x - p.vx, p.y - p.vy, p.knock);
      if (p.pierce > 0) { p.pierce -= 1; continue; }
      if (p.bounces > 0) {
        const next = w.grid.nearestExcluding(p.x, p.y, 320, p.hit, p.hitN);
        if (next) {
          p.bounces -= 1;
          p.life += 0.6;
          const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
          const a = Math.atan2(next.y - p.y, next.x - p.x);
          p.vx = Math.cos(a) * sp;
          p.vy = Math.sin(a) * sp;
          w.fx.emit('spark', p.x, p.y, 4, 0, 6.28, 60, 160, 0.15, 0.3, 1, 0.1, p.tint);
          return false;
        }
      }
      return true;
    }
    return false;
  }
}

