import Phaser from 'phaser';
import { BALANCE } from '../../config/balance';
import { COLORS } from '../assets';
import { services } from '../../services';
import { hex, textStyle } from '../ui/kit';

interface Num {
  t: Phaser.GameObjects.Text;
  on: boolean;
  life: number;
  max: number;
  vy: number;
  vx: number;
  pop: number;
  size: number;
}

/**
 * Pooled floating numbers (cap BALANCE.limits.maxDamageNumbers). Honours settings.damageNumbers.
 * Text is drawn white once and coloured with a tint, so a spawn costs a single canvas render.
 */
export class DamageNumbers {
  private readonly pool: Num[] = [];
  private next = 0;

  constructor(scene: Phaser.Scene) {
    const cap = BALANCE.limits.maxDamageNumbers;
    for (let i = 0; i < cap; i++) {
      const t = scene.add.text(0, 0, '', textStyle(36, 0xffffff, { stroke: hex(COLORS.outline), strokeThickness: 7 })).setOrigin(0.5).setDepth(500).setVisible(false);
      this.pool.push({ t, on: false, life: 0, max: 1, vy: 0, vx: 0, pop: 0, size: 1 });
    }
  }

  /** `kind`: 0 normal hit, 1 crit, 2 damage-over-time (small), 3 info (heal, dodge, level up ...). */
  spawn(x: number, y: number, text: string, color: number, kind = 0, force = false): void {
    if (!force && kind !== 3 && !services.save.data.settings.damageNumbers) return;
    const n = this.pool[this.next];
    this.next = (this.next + 1) % this.pool.length;
    n.on = true;
    n.max = n.life = kind === 1 ? 0.85 : kind === 3 ? 1 : 0.65;
    n.vy = kind === 1 ? -120 : -90;
    n.vx = (Math.random() - 0.5) * 50;
    n.pop = kind === 1 ? 0.3 : 0.12;
    n.size = kind === 1 ? 1.3 : kind === 2 ? 0.66 : kind === 3 ? 1.0 : 0.9;
    n.t.setText(text).setTint(color)
      .setPosition(x + (Math.random() - 0.5) * 18, y - 18)
      .setAlpha(1).setScale(0.4 * n.size).setVisible(true);
  }

  update(dt: number): void {
    for (let i = 0; i < this.pool.length; i++) {
      const n = this.pool[i];
      if (!n.on) continue;
      n.life -= dt;
      if (n.life <= 0) { n.on = false; n.t.setVisible(false); continue; }
      const age = n.max - n.life;
      n.vy += 140 * dt;
      n.t.setPosition(n.t.x + n.vx * dt, n.t.y + n.vy * dt);
      const s = age < n.pop ? 0.4 + 0.9 * (age / n.pop) : age < n.pop * 2 ? 1.3 - 0.3 * ((age - n.pop) / n.pop) : 1;
      n.t.setScale(s * n.size);
      n.t.setAlpha(n.life < 0.25 ? n.life / 0.25 : 1);
    }
  }

  clear(): void {
    for (const n of this.pool) { n.on = false; n.t.setVisible(false); }
  }
}
