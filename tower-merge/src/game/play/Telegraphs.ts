import Phaser from 'phaser';
import { SLOTS } from '../../data/map';
import { GROUND_LANE, type LaneWalker } from '../../sim/path';
import type { SimEvent, WorldApi } from '../../sim/api';
import { COLOR_DANGER, D, TOWER_DY } from './constants';
import type { EnemyLayer } from './EnemyView';

type TeleEvent = Extract<SimEvent, { type: 'bossTelegraph' }>;

const enum K { Charge, Breath, Reticle, Meteor }

interface Rec {
  on: boolean;
  kind: K;
  t: number;
  dur: number;
  x: number; y: number;
  tx: number; ty: number;
  w: number;
  len: number;
  angle: number;
}

const CHARGE_LEN = 340;
const MAX_RECS = 8;

/**
 * Boss attack warnings, drawn clearly: a red arrow strip along the road for a charge, a red
 * rectangle that grows over the wind-up for fire breath, a pulsing target reticle on the tower the
 * Dragon will seal, and a shrinking ring where a meteor lands.
 */
export class Telegraphs {
  private readonly recs: Rec[] = [];
  private next = 0;
  private readonly ground: Phaser.GameObjects.Graphics;
  private readonly top: Phaser.GameObjects.Graphics;
  private readonly walker: LaneWalker = { progress: 0, seg: 0, lateral: 0, x: 0, y: 0, angle: 0 };
  private readonly quad = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }] as unknown as Phaser.Math.Vector2[];

  constructor(scene: Phaser.Scene, private readonly enemies: EnemyLayer) {
    this.ground = scene.add.graphics().setDepth(D.tele);
    this.top = scene.add.graphics().setDepth(D.highlight);
    for (let i = 0; i < MAX_RECS; i++) {
      this.recs.push({ on: false, kind: K.Charge, t: 0, dur: 1, x: 0, y: 0, tx: 0, ty: 0, w: 0, len: 0, angle: 0 });
    }
  }

  private take(kind: K, dur: number): Rec {
    const r = this.recs[this.next];
    this.next = (this.next + 1) % MAX_RECS;
    r.on = true;
    r.kind = kind;
    r.t = 0;
    r.dur = Math.max(0.2, dur);
    return r;
  }

  /** Returns false for abilities that have no dedicated warning shape. */
  add(ev: TeleEvent): boolean {
    switch (ev.ability) {
      case 'charge': {
        const r = this.take(K.Charge, ev.duration + 1.2);
        r.x = ev.x; r.y = ev.y;
        return true;
      }
      case 'fireBreath': {
        const r = this.take(K.Breath, ev.duration);
        r.x = ev.x; r.y = ev.y;
        r.tx = ev.tx ?? ev.x; r.ty = ev.ty ?? ev.y + 100;
        r.w = ev.width ?? 80;
        r.len = ev.length ?? 400;
        r.angle = Math.atan2(r.ty - r.y, r.tx - r.x);
        return true;
      }
      case 'disableTower': {
        const r = this.take(K.Reticle, ev.duration);
        const s = ev.slot !== undefined ? SLOTS[ev.slot] : undefined;
        r.tx = s ? s.x : ev.tx ?? ev.x;
        r.ty = (s ? s.y : ev.ty ?? ev.y) + TOWER_DY - 40;
        return true;
      }
      default:
        return false;
    }
  }

  meteor(x: number, y: number, radius: number, flight: number): void {
    const r = this.take(K.Meteor, flight);
    r.tx = x; r.ty = y; r.w = radius;
  }

  update(world: WorldApi, dt: number, time: number): void {
    const gg = this.ground;
    const tg = this.top;
    gg.clear();
    tg.clear();
    let boss: ReturnType<EnemyLayer['boss']> | undefined;
    for (let i = 0; i < MAX_RECS; i++) {
      const r = this.recs[i];
      if (!r.on) continue;
      r.t += dt;
      if (r.t >= r.dur) { r.on = false; continue; }
      const k = r.t / r.dur;
      const pulse = 0.5 + 0.5 * Math.sin(time * 14);
      switch (r.kind) {
        case K.Charge: {
          boss ??= this.enemies.boss(world);
          if (!boss) { r.on = false; break; }
          this.drawCharge(gg, boss.progress, k, pulse, time);
          break;
        }
        case K.Breath: {
          boss ??= this.enemies.boss(world);
          const ox = boss ? boss.x : r.x;
          const oy = boss ? boss.y : r.y;
          this.drawBreath(gg, ox, oy, r, k, pulse);
          break;
        }
        case K.Reticle:
          this.drawReticle(tg, r, k, time);
          break;
        case K.Meteor: {
          const rad = r.w * (1.1 - 0.25 * k);
          gg.fillStyle(0xff3a2a, 0.16 + 0.12 * pulse).fillCircle(r.tx, r.ty, rad);
          gg.lineStyle(5, 0xff5a3a, 0.9).strokeCircle(r.tx, r.ty, rad);
          gg.lineStyle(3, 0xffd0a0, 0.8).strokeCircle(r.tx, r.ty, rad * k);
          break;
        }
      }
    }
  }

  private drawCharge(g: Phaser.GameObjects.Graphics, progress: number, k: number, pulse: number, time: number): void {
    const w = this.walker;
    const step = 22;
    const n = Math.floor(CHARGE_LEN / step);
    let px = 0;
    let py = 0;
    const grow = Math.min(1, k * 3);
    for (let i = 0; i <= n * grow; i++) {
      w.progress = progress + 20 + i * step;
      w.seg = 0;
      GROUND_LANE.place(w);
      if (i > 0) {
        const dx = w.x - px;
        const dy = w.y - py;
        const len = Math.hypot(dx, dy) || 1;
        const nx = (-dy / len) * 34;
        const ny = (dx / len) * 34;
        const q = this.quad;
        q[0].x = px + nx; q[0].y = py + ny; q[1].x = w.x + nx; q[1].y = w.y + ny;
        q[2].x = w.x - nx; q[2].y = w.y - ny; q[3].x = px - nx; q[3].y = py - ny;
        g.fillStyle(0xff2a2a, 0.2 + 0.14 * pulse).fillPoints(q, true);
      }
      px = w.x;
      py = w.y;
    }
    // chevrons marching toward the castle
    const phase = (time * 2.2) % 1;
    for (let i = 0; i < n * grow; i += 2) {
      w.progress = progress + 30 + (i + phase * 2) * step;
      w.seg = 0;
      GROUND_LANE.place(w);
      const c = Math.cos(w.angle);
      const s = Math.sin(w.angle);
      g.fillStyle(0xffe0d8, 0.95);
      g.fillTriangle(w.x + c * 16, w.y + s * 16, w.x - c * 8 - s * 18, w.y - s * 8 + c * 18, w.x - c * 8 + s * 18, w.y - s * 8 - c * 18);
      g.fillStyle(COLOR_DANGER, 1);
      g.fillTriangle(w.x + c * 10, w.y + s * 10, w.x - c * 6 - s * 11, w.y - s * 6 + c * 11, w.x - c * 6 + s * 11, w.y - s * 6 - c * 11);
    }
  }

  private drawBreath(g: Phaser.GameObjects.Graphics, ox: number, oy: number, r: Rec, k: number, pulse: number): void {
    const c = Math.cos(r.angle);
    const s = Math.sin(r.angle);
    const hw = r.w / 2;
    const nx = -s * hw;
    const ny = c * hw;
    const q = this.quad;
    // full extent outline
    const ex = ox + c * r.len;
    const ey = oy + s * r.len;
    g.fillStyle(0xff2a1a, 0.1).fillPoints([{ x: ox + nx, y: oy + ny }, { x: ex + nx, y: ey + ny }, { x: ex - nx, y: ey - ny }, { x: ox - nx, y: oy - ny }] as unknown as Phaser.Math.Vector2[], true);
    g.lineStyle(3, 0xff4a3f, 0.6);
    g.beginPath();
    g.moveTo(ox + nx, oy + ny).lineTo(ex + nx, ey + ny).lineTo(ex - nx, ey - ny).lineTo(ox - nx, oy - ny).closePath().strokePath();
    // growing fill
    const L = r.len * (0.15 + 0.85 * k * k);
    const fx = ox + c * L;
    const fy = oy + s * L;
    q[0].x = ox + nx; q[0].y = oy + ny; q[1].x = fx + nx; q[1].y = fy + ny;
    q[2].x = fx - nx; q[2].y = fy - ny; q[3].x = ox - nx; q[3].y = oy - ny;
    g.fillStyle(0xff2a1a, 0.3 + 0.28 * k + 0.12 * pulse).fillPoints(q, true);
    g.lineStyle(7, 0xff6a4a, 1);
    g.beginPath();
    g.moveTo(ox + nx, oy + ny).lineTo(fx + nx, fy + ny).lineTo(fx - nx, fy - ny).lineTo(ox - nx, oy - ny).closePath().strokePath();
  }

  private drawReticle(g: Phaser.GameObjects.Graphics, r: Rec, k: number, time: number): void {
    const pulse = 0.5 + 0.5 * Math.sin(time * 16);
    const rad = 70 - 26 * k + 4 * pulse;
    g.fillStyle(0xff2a2a, 0.14 + 0.12 * pulse).fillCircle(r.tx, r.ty, rad);
    g.lineStyle(6, 0x2b1d3a, 0.9).strokeCircle(r.tx, r.ty, rad);
    g.lineStyle(4, 0xff4a3f, 1).strokeCircle(r.tx, r.ty, rad);
    const a = time * 2.4;
    for (let i = 0; i < 4; i++) {
      const ang = a + (i * Math.PI) / 2;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      g.lineStyle(5, 0xff4a3f, 1).lineBetween(r.tx + c * (rad - 12), r.ty + s * (rad - 12), r.tx + c * (rad + 14), r.ty + s * (rad + 14));
    }
    g.lineStyle(3, 0xffffff, 0.85).lineBetween(r.tx - 16, r.ty, r.tx + 16, r.ty).lineBetween(r.tx, r.ty - 16, r.tx, r.ty + 16);
  }

  clear(): void {
    for (const r of this.recs) r.on = false;
    this.ground.clear();
    this.top.clear();
  }

  destroy(): void {
    this.ground.destroy();
    this.top.destroy();
  }
}
