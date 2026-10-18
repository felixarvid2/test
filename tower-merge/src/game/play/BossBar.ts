import Phaser from 'phaser';
import { BOSSES } from '../../data/bosses';
import type { BossId } from '../../data/types';
import type { EnemyState } from '../../sim/api';
import { crispText } from '../ui/text';
import { PALETTE } from '../ui/theme';
import { D } from './constants';

const W_BAR = 560;
const H_BAR = 36;
const Y = 134;

/** Big boss health bar under the HUD with name/title and phase markers. Slides in while a boss lives. */
export class BossBar {
  private readonly root: Phaser.GameObjects.Container;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly icon: Phaser.GameObjects.Image;
  private kind: BossId | '' = '';
  private shown = 0;
  private chunk = 1;
  private hold = 0;
  private visible = false;
  private lastRatio = 1;
  private lastPhase = -1;

  constructor(private readonly scene: Phaser.Scene) {
    this.gfx = scene.add.graphics();
    this.label = crispText(scene, 0, 0, '', { preset: 'small', size: 22, colorNum: 0xffffff, strokeThickness: 5 });
    this.icon = scene.add.image(-W_BAR / 2 - 6, 0, 'icon_skull').setDisplaySize(52, 52);
    this.root = scene.add.container(360, Y, [this.gfx, this.label, this.icon]).setDepth(D.boss).setScrollFactor(0).setVisible(false);
  }

  update(boss: EnemyState | undefined, dt: number, time: number): void {
    if (!boss) {
      if (this.visible) {
        this.visible = false;
        this.scene.tweens.add({ targets: this.root, alpha: 0, y: Y - 30, duration: 260, onComplete: () => { if (!this.visible) this.root.setVisible(false); } });
      }
      this.kind = '';
      return;
    }
    const def = BOSSES[boss.kind as BossId];
    if (this.kind !== boss.kind) {
      this.kind = boss.kind as BossId;
      this.shown = this.chunk = 1;
      this.lastRatio = 1;
      this.label.setText(`${def?.name ?? boss.kind} - ${def?.title ?? ''}`);
      const iconKey = boss.kind === 'goblinKing' ? 'icon_crown' : boss.kind === 'stoneGolem' ? 'icon_golem' : 'icon_dragon';
      this.icon.setTexture(iconKey).setDisplaySize(54, 54);
    }
    if (!this.visible) {
      this.visible = true;
      this.scene.tweens.killTweensOf(this.root);
      this.root.setVisible(true).setAlpha(0).setY(Y - 30);
      this.scene.tweens.add({ targets: this.root, alpha: 1, y: Y, duration: 320, ease: 'Back.Out' });
    }
    const ratio = Math.max(0, boss.hp / Math.max(1, boss.maxHp));
    if (ratio < this.lastRatio - 0.0001) this.hold = 0.3;
    this.lastRatio = ratio;
    this.shown += (ratio - this.shown) * (1 - Math.exp(-dt * 14));
    if (this.hold > 0) this.hold -= dt;
    else this.chunk += (this.shown - this.chunk) * (1 - Math.exp(-dt * 4));
    const phaseChanged = boss.phase !== this.lastPhase;
    this.lastPhase = boss.phase;
    this.draw(def?.phases.map((p) => p.hpBelow) ?? [], boss.phase, time, phaseChanged);
  }

  private draw(thresholds: number[], phase: number, time: number, _changed: boolean): void {
    const g = this.gfx;
    g.clear();
    const x = -W_BAR / 2;
    const y = -H_BAR / 2;
    g.fillStyle(PALETTE.shadow, 0.35).fillRoundedRect(x - 2, y + 6, W_BAR + 4, H_BAR, H_BAR / 2);
    g.fillStyle(PALETTE.outline, 1).fillRoundedRect(x - 5, y - 5, W_BAR + 10, H_BAR + 10, H_BAR / 2 + 5);
    g.fillStyle(0x2a1020, 1).fillRoundedRect(x, y, W_BAR, H_BAR, H_BAR / 2);
    const cw = Math.max(0, (W_BAR - 4) * this.chunk);
    if (cw > 2) g.fillStyle(0xffe8e0, 1).fillRoundedRect(x + 2, y + 2, cw, H_BAR - 4, (H_BAR - 4) / 2);
    const fw = Math.max(0, (W_BAR - 4) * this.shown);
    if (fw > 2) {
      const col = phase >= 2 ? 0xff3a3a : phase === 1 ? 0xff7a3a : 0xe84a5a;
      g.fillStyle(col, 1).fillRoundedRect(x + 2, y + 2, fw, H_BAR - 4, (H_BAR - 4) / 2);
      g.fillStyle(0xffffff, 0.28).fillRoundedRect(x + 12, y + 6, Math.max(0, fw - 24), 7, 3);
    }
    for (let i = 1; i < thresholds.length; i++) {
      const tx = x + 2 + (W_BAR - 4) * thresholds[i];
      const passed = phase >= i;
      g.fillStyle(PALETTE.outline, 1).fillRect(tx - 3, y - 4, 6, H_BAR + 8);
      g.fillStyle(passed ? 0x6a6a7a : 0xffe58a, 1).fillRect(tx - 1.5, y - 2, 3, H_BAR + 4);
    }
    if (phase >= 2) g.lineStyle(3, 0xffffff, 0.3 + 0.3 * Math.sin(time * 10)).strokeRoundedRect(x, y, W_BAR, H_BAR, H_BAR / 2);
  }

  destroy(): void {
    this.root.destroy();
  }
}
