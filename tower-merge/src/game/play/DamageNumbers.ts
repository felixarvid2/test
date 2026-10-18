import Phaser from 'phaser';
import { services } from '../../services';
import { crispText } from '../ui/text';
import { D } from './constants';
import { damageLabel, showDamageNumber, type QualityMeter } from './logic';

interface Num {
  t: Phaser.GameObjects.Text;
  on: boolean;
  life: number;
  max: number;
  vx: number;
  vy: number;
  pop: number;
  size: number;
}

const POOL = 40;

/**
 * Pooled floating damage numbers (cap 40, fewer when quality degrades). Crits are bigger, yellow
 * and bouncier. Respects settings.damageNumbers. Text is drawn white once and coloured by tint.
 */
export class DamageNumbers {
  private readonly pool: Num[] = [];
  private next = 0;
  private perFrame = 0;
  private alive = 0;
  private recentMax = 0;

  constructor(scene: Phaser.Scene, private readonly quality: QualityMeter) {
    for (let i = 0; i < POOL; i++) {
      const t = crispText(scene, 0, 0, '', { preset: 'number', size: 34, strokeThickness: 7 }).setDepth(D.dmg).setVisible(false);
      this.pool.push({ t, on: false, life: 0, max: 1, vx: 0, vy: 0, pop: 0.1, size: 1 });
    }
  }

  get enabled(): boolean {
    try { return services.save.data.settings.damageNumbers !== false; } catch { return true; }
  }

  beginFrame(): void {
    this.perFrame = 0;
  }

  spawn(x: number, y: number, amount: number, crit: boolean): void {
    if (!this.enabled) return;
    const q = this.quality.preset;
    if (amount > this.recentMax) this.recentMax = amount;
    if (this.perFrame >= q.numbersPerFrame || !showDamageNumber(amount, this.recentMax, this.alive, crit)) return;
    this.perFrame++;
    const cap = Math.min(POOL, q.damageNumbers);
    let n: Num | undefined;
    for (let k = 0; k < cap; k++) {
      const c = this.pool[(this.next + k) % POOL];
      if (!c.on) { n = c; this.next = (this.next + k + 1) % POOL; break; }
    }
    if (!n) {
      if (!crit) return; // crowded: only crits may steal the oldest
      n = this.pool[this.next];
      this.next = (this.next + 1) % POOL;
    }
    n.on = true;
    this.alive++;
    n.max = n.life = crit ? 0.9 : 0.62;
    n.vy = crit ? -170 : -110;
    n.vx = (Math.random() - 0.5) * (crit ? 90 : 50);
    n.pop = crit ? 0.16 : 0.1;
    n.size = crit ? 1.25 : 0.72;
    n.t.setText(damageLabel(amount)).setTint(crit ? 0xffd23a : 0xffffff)
      .setPosition(x + (Math.random() - 0.5) * 16, y - 18).setAlpha(1).setScale(0.4 * n.size).setVisible(true);
  }

  update(dt: number): void {
    this.recentMax *= Math.exp(-dt / 1.6);
    let alive = 0;
    for (let i = 0; i < POOL; i++) {
      const n = this.pool[i];
      if (!n.on) continue;
      alive++;
      n.life -= dt;
      if (n.life <= 0) { n.on = false; n.t.setVisible(false); continue; }
      const age = n.max - n.life;
      n.vy += 320 * dt;
      n.t.setPosition(n.t.x + n.vx * dt, n.t.y + n.vy * dt);
      const p = n.pop;
      const s = age < p ? 0.4 + 1.0 * (age / p) : age < p * 2 ? 1.4 - 0.4 * ((age - p) / p) : 1;
      n.t.setScale(s * n.size);
      n.t.setAlpha(n.life < 0.2 ? n.life / 0.2 : 1);
    }
    this.alive = alive;
  }

  destroy(): void {
    for (const n of this.pool) n.t.destroy();
    this.pool.length = 0;
  }
}
