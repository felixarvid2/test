import Phaser from 'phaser';
import { COLORS } from '../assets';

// Floor markers that fill up before an attack lands: circles, cones, lines. One shared Graphics,
// redrawn each frame while any marker is alive. A marker's callback fires when its fill completes.

export const TELE_CIRCLE = 0;
export const TELE_CONE = 1;
export const TELE_LINE = 2;

export class Tele {
  on = false;
  kind = TELE_CIRCLE;
  x = 0; y = 0;       // origin / centre
  x2 = 0; y2 = 0;     // line end
  r = 0;              // radius (circle, cone) or half width (line)
  angle = 0; arc = 0; // cone direction and half angle
  t = 0; dur = 1;
  color: number = COLORS.danger;
  fill = 0.4;
  done: (() => void) | null = null;
  owner: object | null = null;
  /** Called every frame with progress 0..1 and the frame time (boss attacks lock aim late). */
  tick: ((t: Tele, p: number, dt: number) => void) | null = null;
}

const CAP = 40;

export class Telegraphs {
  private readonly pool: Tele[] = [];
  private readonly g: Phaser.GameObjects.Graphics;
  private next = 0;
  private anyOn = false;

  constructor(scene: Phaser.Scene) {
    for (let i = 0; i < CAP; i++) this.pool.push(new Tele());
    this.g = scene.add.graphics().setDepth(40);
  }

  private take(): Tele {
    for (let k = 0; k < CAP; k++) {
      const t = this.pool[(this.next + k) % CAP];
      if (!t.on) { this.next = (this.next + k + 1) % CAP; return t; }
    }
    const t = this.pool[this.next];
    this.next = (this.next + 1) % CAP;
    return t;
  }

  circle(x: number, y: number, r: number, dur: number, color: number, done: (() => void) | null, fill = 0.42): Tele {
    const t = this.take();
    t.on = true; t.kind = TELE_CIRCLE; t.x = x; t.y = y; t.r = r; t.t = 0; t.dur = dur; t.color = color; t.done = done; t.tick = null; t.owner = null; t.fill = fill;
    this.anyOn = true;
    return t;
  }

  cone(x: number, y: number, angle: number, halfArc: number, r: number, dur: number, color: number, done: (() => void) | null): Tele {
    const t = this.take();
    t.on = true; t.kind = TELE_CONE; t.x = x; t.y = y; t.angle = angle; t.arc = halfArc; t.r = r; t.t = 0; t.dur = dur; t.color = color; t.done = done; t.tick = null; t.owner = null; t.fill = 0.42;
    this.anyOn = true;
    return t;
  }

  line(x1: number, y1: number, x2: number, y2: number, halfWidth: number, dur: number, color: number, done: (() => void) | null): Tele {
    const t = this.take();
    t.on = true; t.kind = TELE_LINE; t.x = x1; t.y = y1; t.x2 = x2; t.y2 = y2; t.r = halfWidth; t.t = 0; t.dur = dur; t.color = color; t.done = done; t.tick = null; t.owner = null; t.fill = 0.4;
    this.anyOn = true;
    return t;
  }

  /** Cancels `t` only while it still belongs to `owner` (pooled markers get reused). */
  cancelOwned(t: Tele | null, owner: object): void {
    if (t && t.owner === owner) this.cancel(t);
  }

  cancel(t: Tele): void {
    t.on = false;
    t.done = null;
    t.tick = null;
  }

  clear(): void {
    for (const t of this.pool) { t.on = false; t.done = null; t.tick = null; }
    this.g.clear();
    this.anyOn = false;
  }

  private quad(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number, fill: boolean): void {
    const g = this.g;
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
    g.lineTo(cx, cy);
    g.lineTo(dx, dy);
    g.closePath();
    if (fill) g.fillPath();
    else g.strokePath();
  }

  update(dt: number): void {
    if (!this.anyOn) return;
    const g = this.g;
    g.clear();
    let alive = false;
    for (let i = 0; i < CAP; i++) {
      const t = this.pool[i];
      if (!t.on) continue;
      t.t += dt;
      const p = Math.min(1, t.t / t.dur);
      if (t.tick) t.tick(t, p, dt);
      const pulse = 0.55 + 0.45 * Math.sin(t.t * 22);
      if (t.kind === TELE_CIRCLE) {
        g.fillStyle(t.color, 0.12);
        g.fillCircle(t.x, t.y, t.r);
        g.fillStyle(t.color, t.fill * (0.6 + 0.4 * pulse));
        g.fillCircle(t.x, t.y, t.r * p);
        g.lineStyle(4, t.color, 0.55 + 0.35 * pulse);
        g.strokeCircle(t.x, t.y, t.r);
      } else if (t.kind === TELE_CONE) {
        g.fillStyle(t.color, 0.12);
        g.slice(t.x, t.y, t.r, t.angle - t.arc, t.angle + t.arc, false);
        g.fillPath();
        g.fillStyle(t.color, t.fill * (0.6 + 0.4 * pulse));
        g.slice(t.x, t.y, t.r * p, t.angle - t.arc, t.angle + t.arc, false);
        g.fillPath();
        g.lineStyle(4, t.color, 0.55 + 0.35 * pulse);
        g.slice(t.x, t.y, t.r, t.angle - t.arc, t.angle + t.arc, false);
        g.strokePath();
      } else {
        const dx = t.x2 - t.x;
        const dy = t.y2 - t.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = (-dy / len) * t.r;
        const ny = (dx / len) * t.r;
        const ex = t.x + dx * p;
        const ey = t.y + dy * p;
        g.fillStyle(t.color, 0.12);
        this.quad(t.x + nx, t.y + ny, t.x2 + nx, t.y2 + ny, t.x2 - nx, t.y2 - ny, t.x - nx, t.y - ny, true);
        g.fillStyle(t.color, t.fill * (0.6 + 0.4 * pulse));
        this.quad(t.x + nx, t.y + ny, ex + nx, ey + ny, ex - nx, ey - ny, t.x - nx, t.y - ny, true);
        g.lineStyle(4, t.color, 0.55 + 0.35 * pulse);
        this.quad(t.x + nx, t.y + ny, t.x2 + nx, t.y2 + ny, t.x2 - nx, t.y2 - ny, t.x - nx, t.y - ny, false);
      }
      if (t.t >= t.dur) {
        t.on = false;
        const cb = t.done;
        t.done = null;
        t.tick = null;
        if (cb) cb();
      } else {
        alive = true;
      }
    }
    if (!alive) {
      this.anyOn = false;
      for (let i = 0; i < CAP; i++) if (this.pool[i].on) { this.anyOn = true; break; }
      if (!this.anyOn) g.clear();
    }
  }
}

