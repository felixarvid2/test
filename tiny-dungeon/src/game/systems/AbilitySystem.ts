import Phaser from 'phaser';
import { BALANCE } from '../../config/balance';
import {
  explosionDamage, explosionRadius, meteorDamage, meteorRadius, orbitDamage, orbitRadius, poisonDps, thunderDamage, thunderStrikes,
} from '../../core/combat';
import { BUFF_BY_ID } from '../../data/buffs';
import { services } from '../../services';
import { COLORS, EXTRA_KEY } from '../assets';
import type { Enemy } from '../entities/Enemy';
import { HIT_COMPANION, HIT_EXPLOSION, HIT_METEOR, HIT_NOSTATUS, HIT_ORBIT, HIT_THUNDER } from './CombatSystem';
import { TAU } from './layout';
import type { World } from './World';

interface Companion {
  id: string;
  fairy: boolean;
  img: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  x: number; y: number;
  cd: number;
  ang: number;
}

interface Meteor {
  on: boolean;
  img: Phaser.GameObjects.Image;
}

const QUEUE = 32;

/** Orbit blades, thunderstorm, meteor storm, on-kill explosions (queued) and companions. */
export class AbilitySystem {
  private readonly blades: Phaser.GameObjects.Image[] = [];
  private orbitAngle = 0;
  private bladeTrail = 0;
  private thunderT = 2;
  private meteorT = 3;
  private readonly qx = new Float32Array(QUEUE);
  private readonly qy = new Float32Array(QUEUE);
  private readonly qb = new Uint8Array(QUEUE);
  private qn = 0;
  private readonly near: Enemy[] = [];
  private readonly picks: Enemy[] = [];
  private readonly meteors: Meteor[] = [];
  private comps: Companion[] = [];
  private lastBuffSig = '';

  constructor(private readonly scene: Phaser.Scene, private readonly w: World) {
    for (let i = 0; i < 10; i++) {
      this.meteors.push({ on: false, img: scene.add.image(0, 0, EXTRA_KEY, 'meteor').setVisible(false).setDepth(415) });
    }
  }

  queueExplosion(x: number, y: number, burning: boolean): void {
    if (this.qn >= QUEUE) return;
    this.qx[this.qn] = x;
    this.qy[this.qn] = y;
    this.qb[this.qn] = burning ? 1 : 0;
    this.qn += 1;
  }

  /** Re-reads buffs (companions) and stats-derived visuals after an upgrade, room change or buff. */
  refresh(): void {
    this.syncCompanions(true);
  }

  reset(): void {
    this.qn = 0;
    for (const m of this.meteors) { m.on = false; m.img.setVisible(false); }
    this.thunderT = Math.max(this.thunderT, 1.5);
    this.meteorT = Math.max(this.meteorT, 2);
  }

  update(dt: number): void {
    const w = this.w;
    const stats = w.run.stats;
    const active = w.combatActive;

    this.syncCompanions(false);
    if (active) {
      this.updateOrbit(dt);
      if (stats.thunderLevel > 0) {
        this.thunderT -= dt;
        if (this.thunderT <= 0) { this.thunderT = stats.thunderInterval; this.thunder(); }
      }
      if (stats.meteorLevel > 0) {
        this.meteorT -= dt;
        if (this.meteorT <= 0) { this.meteorT = stats.meteorInterval; this.meteorShower(); }
      }
    } else {
      this.hideBlades(0);
    }
    this.updateCompanions(dt, active);

    // explosions: capped per frame, queue never recurses
    let done = 0;
    let head = 0;
    while (head < this.qn && done < BALANCE.limits.maxExplosionsPerFrame) {
      this.explode(this.qx[head], this.qy[head], this.qb[head] === 1);
      head += 1;
      done += 1;
    }
    if (head > 0) {
      const rest = this.qn - head;
      for (let i = 0; i < rest; i++) {
        this.qx[i] = this.qx[head + i];
        this.qy[i] = this.qy[head + i];
        this.qb[i] = this.qb[head + i];
      }
      this.qn = rest;
    }
  }

  // ---- orbit blades -------------------------------------------------------------------------------

  private hideBlades(from: number): void {
    for (let i = from; i < this.blades.length; i++) if (this.blades[i].visible) this.blades[i].setVisible(false);
  }

  private updateOrbit(dt: number): void {
    const w = this.w;
    const stats = w.run.stats;
    const n = Math.min(8, Math.floor(stats.orbitBlades));
    const all = w.enemies.all;
    for (let i = 0; i < all.length; i++) if (all[i].orbitCd > 0) all[i].orbitCd -= dt;
    if (n <= 0) { this.hideBlades(0); return; }
    while (this.blades.length < n) {
      this.blades.push(this.scene.add.image(0, 0, EXTRA_KEY, 'orbit_blade').setScale(3).setVisible(false).setDepth(310));
    }
    this.hideBlades(n);
    this.orbitAngle += BALANCE.combat.orbitSpeed * dt;
    const r = orbitRadius(stats);
    const p = w.player;
    const frozen = stats.orbitFreeze > 0;
    const dmg = orbitDamage(stats, w.weapons.baseHit);
    this.bladeTrail -= dt;
    for (let i = 0; i < n; i++) {
      const a = this.orbitAngle + (i * TAU) / n;
      const bx = p.x + Math.cos(a) * r;
      const by = p.y - 12 + Math.sin(a) * r * 0.9;
      const img = this.blades[i];
      img.setVisible(true).setPosition(bx, by).setRotation(a * 3).setDepth(100 + by * 0.1 + 2);
      if (frozen) img.setTint(0xaee6ff);
      else img.clearTint();
      if (this.bladeTrail <= 0) w.fx.emit('spark', bx, by, 1, 0, TAU, 0, 20, 0.15, 0.25, 0.9, 0.1, frozen ? COLORS.frost : 0xdfe6f0);
      const count = w.grid.queryCircle(bx, by, 20, this.near);
      for (let k = 0; k < count; k++) {
        const e = this.near[k];
        if (e.orbitCd > 0) continue;
        e.orbitCd = BALANCE.combat.orbitTouchInterval;
        w.combat.hit(e, dmg, HIT_ORBIT, p.x, p.y, 140);
        if (frozen && e.active && !e.dying) {
          w.status.slow(e, 0.5, 1.6);
          if (w.rng.chance(0.2)) w.status.freeze(e, 0.7);
        }
      }
    }
    if (this.bladeTrail <= 0) this.bladeTrail = 0.05;
  }

  // ---- thunderstorm -------------------------------------------------------------------------------

  private gather(): number {
    const all = this.w.enemies.all;
    this.picks.length = 0;
    for (let i = 0; i < all.length; i++) {
      const e = all[i];
      if (e.active && !e.dying) this.picks.push(e);
    }
    return this.picks.length;
  }

  private thunder(): void {
    const w = this.w;
    const stats = w.run.stats;
    const n = this.gather();
    if (n === 0) { this.thunderT = 0.8; return; }
    const strikes = Math.min(thunderStrikes(stats), n);
    const dmg = thunderDamage(stats, w.weapons.baseHit);
    const radius = BALANCE.combat.thunderRadius * Math.sqrt(stats.areaMult);
    // partial Fisher-Yates over the reused array
    for (let i = 0; i < strikes; i++) {
      const j = i + Math.floor(w.rng.next() * (n - i));
      const t = this.picks[i];
      this.picks[i] = this.picks[j];
      this.picks[j] = t;
    }
    for (let i = 0; i < strikes; i++) {
      const e = this.picks[i];
      const x = e.x;
      const y = e.y;
      w.fx.skyBolt(x, y + 6, y + 80, 0xfff6a0);
      w.fx.ring(x, y, 10, radius * 1.4, 0.3, COLORS.lightning);
      w.fx.emit('spark', x, y, 8, -1.57, 3.2, 80, 300, 0.2, 0.45, 1.3, 0.1, COLORS.lightning, 200, true);
      w.combat.aoe(x, y, radius, dmg, HIT_THUNDER, 60);
    }
    w.fx.flash(0xfff6c0, 0.16, 0.1);
    w.fx.shake(0.12);
    services.audio.play('thunder');
  }

  // ---- meteor storm -------------------------------------------------------------------------------

  private meteorShower(): void {
    const w = this.w;
    const stats = w.run.stats;
    const n = this.gather();
    if (n === 0) { this.meteorT = 1; return; }
    const count = Math.min(8, Math.floor(stats.meteorLevel));
    const r = meteorRadius(stats);
    const dmg = meteorDamage(stats, w.weapons.baseHit);
    const armageddon = w.run.synergies.includes('armageddon');
    for (let k = 0; k < count; k++) {
      const m = this.freeMeteor();
      if (!m) break;
      const e = this.picks[Math.floor(w.rng.next() * n)];
      const tx = Math.min(660, Math.max(60, e.x + (w.rng.next() - 0.5) * 40));
      const ty = Math.min(1190, Math.max(210, e.y + (w.rng.next() - 0.5) * 40));
      m.on = true;
      const delay = 0.75 + k * 0.12;
      const sx = tx + 220;
      const sy = ty - 820;
      m.img.setVisible(true).setScale(5).setPosition(sx, sy).setRotation(Math.atan2(ty - sy, tx - sx) + Math.PI);
      const tele = w.tele.circle(tx, ty, r, delay, 0xffa040, () => {
        m.on = false;
        m.img.setVisible(false);
        this.meteorImpact(tx, ty, r, dmg, armageddon);
      }, 0.22);
      tele.tick = (_t, p) => {
        const q = p * p;
        m.img.setPosition(sx + (tx - sx) * q, sy + (ty - sy) * q);
      };
    }
  }

  private freeMeteor(): Meteor | null {
    for (const m of this.meteors) if (!m.on) return m;
    return null;
  }

  private meteorImpact(x: number, y: number, r: number, dmg: number, burn: boolean): void {
    const w = this.w;
    const stats = w.run.stats;
    w.fx.ring(x, y, 20, r * 1.15, 0.4, 0xffa040);
    w.fx.emit('puff', x, y, 8, 0, TAU, 40, 220, 0.4, 0.7, 2, 0.5, 0x6a5040, 0, false, 0.8);
    w.fx.emit('spark', x, y, 16, 0, TAU, 120, 460, 0.3, 0.6, 1.6, 0.1, 0xffb050, 220, true);
    w.fx.shake(0.18);
    services.audio.play('explosion');
    const n = w.grid.queryCircle(x, y, r, this.near);
    for (let i = 0; i < n; i++) {
      const e = this.near[i];
      w.combat.hit(e, dmg, HIT_METEOR, x, y, 180);
      if (burn && e.active && !e.dying) w.status.burn(e, dmg * 0.25 * stats.elementPower, stats.burnMaxStacks);
    }
  }

  // ---- explosions ---------------------------------------------------------------------------------

  private explode(x: number, y: number, burning: boolean): void {
    const w = this.w;
    const stats = w.run.stats;
    const r = explosionRadius(stats);
    const dmg = explosionDamage(stats, w.weapons.baseHit);
    const poison = stats.explosionPoison > 0;
    const tint = poison && !burning ? COLORS.poison : COLORS.fire;
    w.fx.ring(x, y, r * 0.25, r * 1.1, 0.3, tint);
    w.fx.emit('puff', x, y, 5, 0, TAU, 30, r * 1.5, 0.25, 0.45, 1.6, 0.4, tint, 0, true, 0.9);
    w.fx.emit('spark', x, y, 10, 0, TAU, 80, r * 3, 0.2, 0.45, 1.3, 0.1, 0xffd080, 200, true);
    w.fx.shake(0.07);
    services.audio.play('explosion', { volume: 0.7 });
    const n = w.grid.queryCircle(x, y, r, this.near);
    for (let i = 0; i < n; i++) {
      const e = this.near[i];
      w.combat.hit(e, dmg, HIT_EXPLOSION, x, y, 150);
      if (!e.active || e.dying) continue;
      if (poison) w.status.poison(e, poisonDps(stats, dmg) || dmg * 0.3 * stats.elementPower);
      if (burning) w.status.burn(e, dmg * 0.25 * stats.elementPower, stats.burnMaxStacks);
    }
  }

  // ---- companions ---------------------------------------------------------------------------------

  private syncCompanions(force: boolean): void {
    const w = this.w;
    let sig = '';
    for (const b of w.run.buffs) if (BUFF_BY_ID[b.id]?.companion) sig += b.id + ',';
    if (!force && sig === this.lastBuffSig) return;
    this.lastBuffSig = sig;
    const keep: Companion[] = [];
    for (const b of w.run.buffs) {
      const def = BUFF_BY_ID[b.id];
      if (!def?.companion) continue;
      const have = this.comps.find((c) => c.id === b.id);
      if (have) { keep.push(have); continue; }
      const glow = this.scene.add.image(0, 0, 'fx_glow').setBlendMode(Phaser.BlendModes.ADD).setScale(0.9).setAlpha(0.6).setDepth(311);
      const img = this.scene.add.image(0, 0, EXTRA_KEY, def.companion).setScale(3).setDepth(312);
      const fairy = def.companion === 'companion_fairy';
      glow.setTint(fairy ? 0xffa0e0 : 0xa080ff);
      keep.push({ id: b.id, fairy, img, glow, x: w.player.x, y: w.player.y - 50, cd: 0.8, ang: Math.random() * TAU });
    }
    for (const c of this.comps) if (!keep.includes(c)) { c.img.destroy(); c.glow.destroy(); }
    this.comps = keep;
  }

  private updateCompanions(dt: number, active: boolean): void {
    const w = this.w;
    const p = w.player;
    const t = w.roomTime;
    for (let i = 0; i < this.comps.length; i++) {
      const c = this.comps[i];
      let tx: number;
      let ty: number;
      if (c.fairy) {
        tx = p.x - 52 * p.facing;
        ty = p.y - 62 + Math.sin(t * 3 + i) * 6;
        const k = 1 - Math.exp(-5 * dt);
        c.x += (tx - c.x) * k;
        c.y += (ty - c.y) * k;
      } else {
        c.ang += 2.4 * dt;
        tx = p.x + Math.cos(c.ang) * 96;
        ty = p.y - 20 + Math.sin(c.ang) * 70;
        const k = 1 - Math.exp(-9 * dt);
        c.x += (tx - c.x) * k;
        c.y += (ty - c.y) * k;
      }
      c.img.setPosition(c.x, c.y + Math.sin(t * 6 + i) * 3).setFlipX(p.x < c.x).setDepth(312);
      c.glow.setPosition(c.x, c.y).setAlpha(0.45 + 0.2 * Math.sin(t * 7));
      if (!active) continue;
      c.cd -= dt;
      if (c.cd > 0) continue;
      const base = w.weapons.baseHit;
      if (c.fairy) {
        const target = w.grid.nearest(c.x, c.y, 380);
        if (!target) { c.cd = 0.2; continue; }
        c.cd = 1.1;
        const proj = w.playerShots.acquire();
        if (!proj) continue;
        const a = Math.atan2(target.y - c.y, target.x - c.x);
        w.playerShots.launch(proj, c.x, c.y, a, 440, EXTRA_KEY, 'magic_bolt', 1.5, 0xff90e0);
        proj.damage = base * 0.35;
        proj.dmgMult = 1; proj.radius = 9; proj.life = 1.3; proj.pierce = 0; proj.bounces = 0; proj.homing = false;
        proj.noStatus = true; proj.companion = true; proj.knock = 20; proj.trail = 0xff90e0; proj.tint = 0xff90e0;
        w.fx.emit('spark', c.x, c.y, 3, a, 1, 40, 100, 0.15, 0.3, 0.9, 0.1, 0xffb0ee);
      } else {
        const target = w.grid.nearest(c.x, c.y, 200);
        if (!target) { c.cd = 0.2; continue; }
        c.cd = 0.9;
        w.fx.lightning(c.x, c.y, target.x, target.y - 8, 0xb090ff, 0.16, 10);
        w.combat.hit(target, base * 0.5, HIT_COMPANION | HIT_NOSTATUS, c.x, c.y, 30);
      }
    }
  }
}
