import Phaser from 'phaser';
import { BALANCE } from '../../config/balance';
import type { BossDef, EnemyDef } from '../../core/types';
import { FX_GLOW, FX_RING } from '../systems/Effects';
import { PLAY, clamp } from '../systems/layout';
import type { World } from '../systems/World';
import { Enemy } from './Enemy';
import { clampToPlayfield, updateEnemyAI } from './EnemyAI';

interface Pending {
  def: EnemyDef;
  x: number;
  y: number;
  elite: boolean;
  summoned: boolean;
  t: number;
  delay: number;
  ring: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
}

const PORTAL = 0xb455f0;

/** Pool of enemies plus the purple spawn portals that precede every spawn. */
export class EnemyPool {
  readonly all: Enemy[] = [];
  private nextId = 1;
  private readonly pending: Pending[] = [];
  private readonly spare: { ring: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image }[] = [];
  private readonly near: Enemy[] = [];
  private readonly cap = BALANCE.limits.maxEnemiesAlive + 6;

  constructor(private readonly scene: Phaser.Scene, private readonly w: World) {}

  get aliveCount(): number {
    let n = 0;
    for (let i = 0; i < this.all.length; i++) {
      const e = this.all[i];
      if (e.active && !e.dying) n++;
    }
    return n;
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  private take(): Enemy | null {
    for (let i = 0; i < this.all.length; i++) if (!this.all[i].active) return this.all[i];
    if (this.all.length >= this.cap) return null;
    const e = new Enemy(this.scene);
    this.all.push(e);
    return e;
  }

  /** Random spot at least `minDist` from the hero and clear of other portals. Writes into `out`. */
  pickSpawnPoint(out: { x: number; y: number }, minDist = 190): void {
    const p = this.w.player;
    let bestX = PLAY.left + 60;
    let bestY = PLAY.top + 80;
    let bestD = -1;
    for (let attempt = 0; attempt < 14; attempt++) {
      const x = PLAY.left + 50 + Math.random() * (PLAY.right - PLAY.left - 100);
      const y = PLAY.top + 60 + Math.random() * (PLAY.bottom - PLAY.top - 140);
      const dx = x - p.x;
      const dy = y - p.y;
      let d = Math.sqrt(dx * dx + dy * dy);
      for (let k = 0; k < this.pending.length; k++) {
        const o = this.pending[k];
        const ox = o.x - x;
        const oy = o.y - y;
        if (ox * ox + oy * oy < 60 * 60) d = Math.min(d, 60);
      }
      if (d >= minDist) { out.x = x; out.y = y; return; }
      if (d > bestD) { bestD = d; bestX = x; bestY = y; }
    }
    out.x = bestX;
    out.y = bestY;
  }

  /** Spawns after a portal delay (0.6 s by default). */
  queueSpawn(def: EnemyDef, x: number, y: number, elite: boolean, summoned = false, delay = 0.6): void {
    const img = this.spare.pop() ?? {
      ring: this.scene.add.image(0, 0, FX_RING).setDepth(7).setBlendMode(Phaser.BlendModes.ADD).setTint(PORTAL),
      glow: this.scene.add.image(0, 0, FX_GLOW).setDepth(7).setBlendMode(Phaser.BlendModes.ADD).setTint(PORTAL),
    };
    img.ring.setVisible(true).setPosition(x, y).setScale(0.1);
    img.glow.setVisible(true).setPosition(x, y).setScale(0.1);
    this.pending.push({ def, x, y, elite, summoned, t: 0, delay, ring: img.ring, glow: img.glow });
  }

  spawnNow(def: EnemyDef, x: number, y: number, elite: boolean, summoned = false): Enemy | null {
    if (this.aliveCount >= BALANCE.limits.maxEnemiesAlive) return null;
    const e = this.take();
    if (!e) return null;
    e.setup(def, clamp(x, PLAY.left + 20, PLAY.right - 20), clamp(y, PLAY.top + 20, PLAY.bottom - 20), this.w.plan, elite, false);
    e.id = this.nextId++;
    e.summoned = summoned;
    return e;
  }

  spawnBoss(def: BossDef, x: number, y: number): Enemy {
    const e = this.take() ?? this.all[0];
    e.setup(def, x, y, this.w.plan, false, true);
    e.id = this.nextId++;
    e.spawnT = 1;
    return e;
  }

  clear(): void {
    for (const e of this.all) {
      if (e.active) { this.w.tele.cancelOwned(e.tele, e); e.release(); }
    }
    for (const p of this.pending) {
      p.ring.setVisible(false);
      p.glow.setVisible(false);
      this.spare.push({ ring: p.ring, glow: p.glow });
    }
    this.pending.length = 0;
  }

  update(dt: number): void {
    const w = this.w;
    const time = w.roomTime;
    const pl = w.player;

    // spawn portals
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      if (w.combatActive) p.t += dt;
      const k = Math.min(1, p.t / p.delay);
      p.ring.setScale((0.9 - 0.45 * k + Math.sin(p.t * 20) * 0.04) * 1.1).setRotation(p.t * 6).setAlpha(0.35 + 0.65 * k);
      p.glow.setScale(0.35 + 0.5 * k).setAlpha(0.25 + 0.5 * k);
      if (p.t >= p.delay && this.aliveCount < BALANCE.limits.maxEnemiesAlive) {
        const e = this.spawnNow(p.def, p.x, p.y, p.elite, p.summoned);
        if (e) {
          w.fx.burst('spark', p.x, p.y, 9, 60, 220, 0.4, 1.4, 0.1, PORTAL, 0, true);
          w.fx.puff(p.x, p.y, 0xc8a0ff, 4, 1.4);
          w.fx.ring(p.x, p.y, 10, 56, 0.28, PORTAL);
        }
        p.ring.setVisible(false);
        p.glow.setVisible(false);
        this.spare.push({ ring: p.ring, glow: p.glow });
        this.pending[i] = this.pending[this.pending.length - 1];
        this.pending.pop();
      }
    }

    // behaviour + movement
    const active = w.combatActive;
    for (let i = 0; i < this.all.length; i++) {
      const e = this.all[i];
      if (!e.active) continue;
      if (e.contactCd > 0) e.contactCd -= dt;
      if (!active) continue;
      if (!e.dying) {
        if (e.bossCtrl) e.bossCtrl.updateMovement(dt);
        else updateEnemyAI(w, e, dt);
      }
      if (e.kvx !== 0 || e.kvy !== 0) {
        e.x += e.kvx * dt;
        e.y += e.kvy * dt;
        const decay = Math.max(0, 1 - 10 * dt);
        e.kvx *= decay;
        e.kvy *= decay;
        if (Math.abs(e.kvx) < 4 && Math.abs(e.kvy) < 4) e.kvx = e.kvy = 0;
      }
      clampToPlayfield(e);
    }

    // grid for this frame
    w.grid.clear();
    for (let i = 0; i < this.all.length; i++) {
      const e = this.all[i];
      if (e.active && !e.dying && !e.untargetable) w.grid.insert(e);
    }

    // soft separation
    if (active) {
      for (let i = 0; i < this.all.length; i++) {
        const e = this.all[i];
        if (!e.active || e.dying || e.lift > 0) continue;
        const n = w.grid.queryCircle(e.x, e.y, e.radius * 0.9, this.near);
        for (let k = 0; k < n; k++) {
          const o = this.near[k];
          if (o.id <= e.id || o.lift > 0) continue;
          const ox = o.x - e.x;
          const oy = o.y - e.y;
          const d = Math.sqrt(ox * ox + oy * oy) || 0.01;
          const want = (e.radius + o.radius) * 0.85;
          if (d >= want) continue;
          const push = (want - d) * 0.35;
          const ux = ox / d;
          const uy = oy / d;
          const eMove = e.isBoss ? 0 : o.isBoss ? 1 : 0.5;
          const oMove = o.isBoss ? 0 : e.isBoss ? 1 : 0.5;
          e.x -= ux * push * eMove * 2;
          e.y -= uy * push * eMove * 2;
          o.x += ux * push * oMove * 2;
          o.y += uy * push * oMove * 2;
        }
      }
    }

    // contact damage
    if (active && !pl.dead) {
      for (let i = 0; i < this.all.length; i++) {
        const e = this.all[i];
        if (!e.active || e.dying || e.untargetable || e.contactCd > 0 || e.spawnT < 0.25 || e.lift > 4) continue;
        const beh = (e.def as EnemyDef).behavior;
        if (beh === 'ranged' || beh === 'summoner' || beh === 'egg') continue;
        const dx = pl.x - e.x;
        const dy = pl.y - e.y;
        const rr = pl.radius + e.radius * 0.85;
        if (dx * dx + dy * dy > rr * rr) continue;
        if (pl.hurt(e.isBoss ? Math.max(1, Math.round(e.dmg * 0.6)) : e.dmg)) {
          e.contactCd = 0.6;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          if (!e.isBoss) {
            e.kvx -= (dx / d) * 1400 * (1 - e.resist);
            e.kvy -= (dy / d) * 1400 * (1 - e.resist);
          }
          e.squash = 0.8;
        }
      }
    }

    // visuals
    for (let i = 0; i < this.all.length; i++) {
      const e = this.all[i];
      if (e.active) e.render(dt, time, pl.x);
    }
  }
}
