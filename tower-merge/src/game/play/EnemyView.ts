import Phaser from 'phaser';
import type { EnemyState, WorldApi } from '../../sim/api';
import { bossKey, enemyKey } from '../assetKeys';
import { D, ENEMY_SIZE, depthForY } from './constants';
import type { Effects } from './Effects';
import { IdMirror, type QualityMeter } from './logic';
import { TEX } from './textures';

const MAX_ENEMIES = 160;

const WHITE = 0xffffff;
const TINT_FROZEN = 0x9fdcff;
const TINT_POISON = 0xb4f394;
const TINT_SLOW = 0xc6e6ff;
const TINT_ELITE = 0xffe27a;

interface Slot {
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image | null;
  fx1: Phaser.GameObjects.Image | null;
  fx2: Phaser.GameObjects.Image | null;
  size: number;
  baseScale: number;
  flip: boolean;
  ph: number;
  tintMode: number;
  tintColor: number;
  boss: boolean;
  flying: boolean;
  kind: string;
  burnT: number;
  poisonT: number;
  depth: number;
}

/**
 * Pooled enemy sprites mirrored by index from world.enemies: walk bob, flip, flyer float, shadow,
 * health bars (damaged only), shields and the status looks (frozen, slowed, burning, poisoned,
 * stunned, vulnerable, hasted, elite) plus the hit flash.
 */
export class EnemyLayer {
  private readonly slots: Slot[] = [];
  private readonly mirror = new IdMirror(MAX_ENEMIES);
  private readonly bars: Phaser.GameObjects.Graphics;
  private readonly marks: Phaser.GameObjects.Graphics;
  private statusBudget = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly fx: Effects, private readonly quality: QualityMeter) {
    for (let i = 0; i < MAX_ENEMIES; i++) {
      const shadow = scene.add.image(0, 0, TEX.shadow).setDepth(D.ground).setVisible(false);
      const sprite = scene.add.image(0, 0, enemyKey('goblin')).setVisible(false).setOrigin(0.5, 0.875);
      this.slots.push({
        sprite, shadow, glow: null, fx1: null, fx2: null, size: 56, baseScale: 0.4, flip: false, ph: i * 0.9, tintMode: 0, tintColor: WHITE,
        boss: false, flying: false, kind: '', burnT: 0, poisonT: 0, depth: 0,
      });
    }
    this.bars = scene.add.graphics().setDepth(D.bars);
    this.marks = scene.add.graphics().setDepth(D.bars - 0.5);
  }

  /** Enemy state with this id, or undefined. */
  find(world: WorldApi, id: number): EnemyState | undefined {
    const list = world.enemies;
    for (let i = 0; i < list.length; i++) if (list[i].active && list[i].id === id) return list[i];
    return undefined;
  }

  /** The active boss, if any. */
  boss(world: WorldApi): EnemyState | undefined {
    const list = world.enemies;
    for (let i = 0; i < list.length; i++) if (list[i].active && list[i].isBoss) return list[i];
    return undefined;
  }

  /** Sprite top-centre of an enemy slot (for floating things). */
  private reset(s: Slot, e: EnemyState): void {
    const key = e.isBoss ? bossKey(e.kind) : enemyKey(e.kind);
    s.kind = e.kind;
    s.boss = e.isBoss;
    s.flying = e.flying;
    s.size = (ENEMY_SIZE[e.kind] ?? 56) * (e.elite && !e.isBoss ? 1.15 : 1);
    s.sprite.setTexture(key).setOrigin(0.5, e.isBoss ? 290 / 320 : 112 / 128).setVisible(true).clearTint().setAlpha(1);
    s.baseScale = s.size / s.sprite.frame.height;
    s.sprite.setScale(s.baseScale);
    s.tintMode = 0;
    s.tintColor = WHITE;
    s.flip = Math.cos(e.angle) < 0;
    s.ph = (e.id * 0.73) % 6.28;
    s.burnT = 0;
    s.poisonT = 0;
    s.shadow.setVisible(true);
    s.shadow.setScale((s.size * (e.flying ? 0.7 : 1.0)) / s.shadow.frame.width, (s.size * 0.4 * (e.flying ? 0.7 : 1)) / s.shadow.frame.height);
    s.shadow.setAlpha(e.flying ? 0.55 : 1);
    if (e.elite || e.isBoss) {
      if (!s.glow) s.glow = this.scene.add.image(0, 0, 'fx_glow').setBlendMode(Phaser.BlendModes.ADD);
      s.glow.setVisible(true).setTint(e.isBoss ? 0xff6a4a : 0xffd24a).setAlpha(e.isBoss ? 0.35 : 0.6);
      s.glow.setScale((s.size * 1.7) / s.glow.frame.width);
    } else if (s.glow) {
      s.glow.setVisible(false);
    }
    if (s.fx1) s.fx1.setVisible(false);
    if (s.fx2) s.fx2.setVisible(false);
  }

  private overlay(s: Slot, which: 1 | 2, tex: string): Phaser.GameObjects.Image {
    let img = which === 1 ? s.fx1 : s.fx2;
    if (!img) {
      img = this.scene.add.image(0, 0, tex);
      if (which === 1) s.fx1 = img; else s.fx2 = img;
    } else if (img.texture.key !== tex) {
      img.setTexture(tex);
    }
    return img;
  }

  update(world: WorldApi, time: number, dt: number): void {
    const list = world.enemies;
    const bars = this.bars;
    const marks = this.marks;
    bars.clear();
    marks.clear();
    this.statusBudget = this.quality.preset.hitSparks ? 8 : 2;
    const n = Math.min(list.length, MAX_ENEMIES);
    for (let i = 0; i < n; i++) {
      const e = list[i];
      const s = this.slots[i];
      const change = this.mirror.sync(i, e.active, e.id);
      if (change === 'idle') continue;
      if (change === 'despawn') {
        s.sprite.setVisible(false);
        s.shadow.setVisible(false);
        s.glow?.setVisible(false);
        s.fx1?.setVisible(false);
        s.fx2?.setVisible(false);
        continue;
      }
      if (change === 'spawn') this.reset(s, e);
      this.draw(s, e, time, dt, bars, marks);
    }
  }

  private draw(
    s: Slot, e: EnemyState, time: number, dt: number, bars: Phaser.GameObjects.Graphics, marks: Phaser.GameObjects.Graphics,
  ): void {
    const sprite = s.sprite;
    const frozen = e.frozenTime > 0;
    const stunned = e.stunTime > 0;
    const still = frozen || stunned;
    if (!still) s.ph += dt * (s.flying ? 7 : 9 + (e.hasteTime > 0 ? 5 : 0));
    const sw = Math.sin(s.ph);
    const cx = Math.cos(e.angle);
    if (cx > 0.25) s.flip = false; else if (cx < -0.25) s.flip = true;
    sprite.setFlipX(s.flip);

    const foot = s.size * (s.boss ? 0.2 : 0.26);
    let px = e.x;
    let py = e.y + foot;
    let sx = s.baseScale;
    let sy = s.baseScale;
    if (!still) {
      if (s.flying) {
        py += -s.size * 0.5 + Math.sin(s.ph * 0.5) * 3;
        sy *= 1 + 0.08 * Math.sin(s.ph * 2);
        sx *= 1 - 0.05 * Math.sin(s.ph * 2);
      } else {
        const hop = s.boss ? 0.02 : 0.07;
        py -= Math.abs(sw) * s.size * hop;
        sy *= 1 + 0.06 * Math.sin(s.ph * 2);
        sx *= 1 - 0.045 * Math.sin(s.ph * 2);
        sprite.setRotation(Math.sin(s.ph) * 0.06);
      }
    } else {
      if (s.flying) py += -s.size * 0.5;
      sprite.setRotation(0);
    }
    if (e.charging) {
      px += (Math.random() - 0.5) * 5;
      sx *= 1.04;
    }
    sprite.setPosition(px, py).setScale(sx, sy);
    const depth = s.flying ? D.flyer + e.y * 0.01 : depthForY(e.y + foot);
    if (Math.abs(depth - s.depth) > 0.04) {
      s.depth = depth;
      sprite.setDepth(depth);
      s.glow?.setDepth(depth - 0.02);
      s.fx1?.setDepth(depth + 0.01);
      s.fx2?.setDepth(depth + 0.01);
    }
    s.shadow.setPosition(e.x, e.y + foot + (s.flying ? s.size * 0.1 : 3));
    if (s.glow && s.glow.visible) s.glow.setPosition(px, py - s.size * 0.4).setAlpha((s.boss ? 0.3 : 0.45) + 0.15 * Math.sin(time * 5 + s.ph));

    // --- tint by status; the hit flash wins ---
    let mode = 0;
    let color = WHITE;
    if (e.hitFlash < 0.08) {
      mode = 1;
    } else if (frozen) { mode = 2; color = TINT_FROZEN; }
    else if (e.charging) { mode = 2; color = Math.sin(time * 30) > 0 ? 0xff6a5a : 0xffffff; }
    else if (e.burnTime > 0) { mode = 2; color = Math.floor(time * 11) % 2 === 0 ? 0xffa060 : 0xffd9a8; }
    else if (e.poisonTime > 0 && e.poisonStacks > 0) { mode = 2; color = TINT_POISON; }
    else if (e.slowTime > 0 && e.slow > 0.05) { mode = 2; color = TINT_SLOW; }
    else if (e.elite) { mode = 2; color = TINT_ELITE; }
    if (mode !== s.tintMode || color !== s.tintColor) {
      s.tintMode = mode;
      s.tintColor = color;
      if (mode === 0) sprite.clearTint();
      else if (mode === 1) sprite.setTintFill(WHITE);
      else sprite.setTint(color);
    }

    // --- overlays: ice crystal, orbiting stun stars, vulnerability mark ---
    let o1 = false;
    let o2 = false;
    if (frozen) {
      const ice = this.overlay(s, 1, TEX.ice);
      ice.setVisible(true).setPosition(px, py - s.size * 0.42).setScale((s.size * 1.2) / ice.frame.width).setAlpha(0.7).setTint(WHITE)
        .setBlendMode(Phaser.BlendModes.NORMAL).setRotation(0).setDepth(s.depth + 0.01);
      o1 = true;
    } else if (stunned) {
      const a = time * 7 + s.ph;
      const r = s.size * 0.28;
      const top = py - s.size * (s.boss ? 0.95 : 0.8);
      for (let k = 0; k < 2; k++) {
        const img = this.overlay(s, (k + 1) as 1 | 2, 'fx_star');
        const ang = a + k * Math.PI;
        img.setVisible(true).setPosition(px + Math.cos(ang) * r, top + Math.sin(ang) * r * 0.35).setScale((s.size * 0.32) / img.frame.width)
          .setTint(0xffe14d).setAlpha(1).setRotation(a * 2).setBlendMode(Phaser.BlendModes.NORMAL).setDepth(s.depth + 0.01);
      }
      o1 = o2 = true;
    } else if (e.vulnerable > 0) {
      const m = this.overlay(s, 1, 'icon_crit');
      m.setVisible(true).setPosition(px, py - s.size * (s.boss ? 1 : 0.85) - 6 + Math.sin(time * 6 + s.ph) * 2)
        .setScale(26 / m.frame.width).setTint(0xff7a8a).setAlpha(0.95).setRotation(0).setBlendMode(Phaser.BlendModes.NORMAL).setDepth(s.depth + 0.01);
      o1 = true;
    }
    if (!o1 && s.fx1) s.fx1.setVisible(false);
    if (!o2 && s.fx2) s.fx2.setVisible(false);

    // --- status particles (budgeted per frame) ---
    if (this.statusBudget > 0) {
      if (e.burnTime > 0) {
        s.burnT -= dt;
        if (s.burnT <= 0) {
          s.burnT = 0.14;
          this.statusBudget--;
          this.fx.embers(px + (Math.random() - 0.5) * s.size * 0.4, py - s.size * 0.35, 1);
        }
      }
      if (e.poisonTime > 0 && e.poisonStacks > 0) {
        s.poisonT -= dt;
        if (s.poisonT <= 0) {
          s.poisonT = 0.32;
          this.statusBudget--;
          this.fx.bubbles(px + (Math.random() - 0.5) * s.size * 0.4, py - s.size * 0.3, 1);
        }
      }
    }

    // --- shield bubble and haste lines ---
    if (e.shield > 0) {
      const r = s.size * 0.62;
      marks.fillStyle(0x8fd8ff, 0.2).fillCircle(px, py - s.size * 0.38, r);
      marks.lineStyle(3, 0xc8f0ff, 0.85).strokeCircle(px, py - s.size * 0.38, r);
    }
    if (e.hasteTime > 0) {
      const dir = s.flip ? 1 : -1;
      marks.lineStyle(3, 0xffffff, 0.7);
      for (let k = 0; k < 3; k++) {
        const ly = py - s.size * (0.18 + k * 0.17);
        const off = ((time * 5 + k * 0.37) % 1) * 12;
        marks.lineBetween(px + dir * (s.size * 0.4 + off), ly, px + dir * (s.size * 0.4 + off + 14), ly);
      }
    }

    // --- health bar (damaged, non-boss) ---
    if (!s.boss && e.hp < e.maxHp && e.maxHp > 0) {
      const w = Math.max(30, s.size * 0.78);
      const h = 7;
      const bx = px - w / 2;
      const by = py - s.size * 0.86 - (s.flying ? 4 : 0);
      const r = Math.max(0, e.hp / e.maxHp);
      bars.fillStyle(0x1b1030, 0.95).fillRoundedRect(bx - 2, by - 2, w + 4, h + 4, 4);
      bars.fillStyle(r > 0.5 ? 0x5ed06a : r > 0.25 ? 0xf5c542 : 0xff5a4f, 1).fillRoundedRect(bx, by, Math.max(2, w * r), h, 3);
      if (e.elite) bars.lineStyle(2, 0xffd24a, 1).strokeRoundedRect(bx - 2, by - 2, w + 4, h + 4, 4);
      if (e.shield > 0) bars.fillStyle(0x8fd8ff, 1).fillRect(bx, by - 4, Math.min(w, w * (e.shield / e.maxHp) + 4), 3);
    }
  }

  destroy(): void {
    for (const s of this.slots) {
      s.sprite.destroy(); s.shadow.destroy(); s.glow?.destroy(); s.fx1?.destroy(); s.fx2?.destroy();
    }
    this.slots.length = 0;
    this.bars.destroy();
    this.marks.destroy();
  }
}
