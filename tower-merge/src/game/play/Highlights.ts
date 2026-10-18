import Phaser from 'phaser';
import { SLOTS } from '../../data/map';
import { crispText } from '../ui/text';
import { COLOR_MERGE, D, TOWER_DY } from './constants';
import type { TargetKind } from './logic';
import { TEX } from './textures';

interface Marker {
  glow: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Image;
  arrow: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  swap: Phaser.GameObjects.Image;
  kind: TargetKind;
  phase: number;
}

/**
 * Drop-target hints shown while a tower is lifted: pulsing green glow + "MERGE" arrow on mergeable
 * towers, a soft white outline on free slots, a blue swap badge on other towers, nothing on locked
 * slots. The slot under the lifted tower is emphasised.
 */
export class Highlights {
  private readonly marks: Marker[] = [];
  private active = false;

  constructor(scene: Phaser.Scene) {
    for (const def of SLOTS) {
      const x = def.x;
      const y = def.y;
      const glow = scene.add.image(x, y + TOWER_DY - 22, 'fx_glow').setDepth(D.highlight - 1).setBlendMode(Phaser.BlendModes.ADD)
        .setTint(COLOR_MERGE).setVisible(false);
      const ring = scene.add.image(x, y + 6, 'fx_ring').setDepth(D.highlight).setVisible(false).setAlpha(0.6);
      const arrow = scene.add.image(x, y - 100, TEX.arrow).setDepth(D.highlight + 1).setVisible(false).setDisplaySize(40, 45);
      const label = crispText(scene, x, y - 134, 'MERGE', { preset: 'small', size: 24, colorNum: COLOR_MERGE }).setDepth(D.highlight + 1).setVisible(false);
      const swap = scene.add.image(x + 38, y - 56, TEX.swap).setDepth(D.highlight + 1).setVisible(false).setDisplaySize(40, 40);
      this.marks.push({ glow, ring, arrow, label, swap, kind: 'locked', phase: def.id * 0.9 });
    }
  }

  get isActive(): boolean { return this.active; }

  /** Starts showing hints; `kinds[i]` is how a drop on slot i would resolve. */
  begin(kinds: readonly TargetKind[]): void {
    this.active = true;
    for (let i = 0; i < this.marks.length; i++) {
      const m = this.marks[i];
      m.kind = kinds[i];
      m.glow.setVisible(m.kind === 'merge');
      m.arrow.setVisible(m.kind === 'merge');
      m.label.setVisible(m.kind === 'merge');
      m.ring.setVisible(m.kind === 'move');
      m.swap.setVisible(m.kind === 'swap');
    }
  }

  update(time: number, hover: number): void {
    if (!this.active) return;
    for (let i = 0; i < this.marks.length; i++) {
      const m = this.marks[i];
      const hot = i === hover ? 1 : 0;
      const pulse = 0.5 + 0.5 * Math.sin(time * 7 + m.phase);
      switch (m.kind) {
        case 'merge': {
          const size = (150 + 26 * pulse + hot * 34) / m.glow.frame.width;
          m.glow.setScale(size).setAlpha(0.5 + 0.35 * pulse + hot * 0.15);
          const bob = Math.sin(time * 9 + m.phase) * 6;
          m.arrow.setPosition(SLOTS[i].x, SLOTS[i].y - 98 + bob).setScale((40 + hot * 10) / m.arrow.frame.width);
          m.label.setPosition(SLOTS[i].x, SLOTS[i].y - 132 + bob).setScale(1 + hot * 0.18);
          break;
        }
        case 'move': {
          const size = (104 + 8 * pulse + hot * 18) / m.ring.frame.width;
          m.ring.setScale(size).setAlpha(0.35 + 0.25 * pulse + hot * 0.4);
          break;
        }
        case 'swap': {
          const s = (38 + 4 * pulse + hot * 10) / m.swap.frame.width;
          m.swap.setScale(s).setAlpha(0.8 + 0.2 * hot).setAngle(Math.sin(time * 5 + m.phase) * 12);
          break;
        }
        default:
      }
    }
  }

  end(): void {
    this.active = false;
    for (const m of this.marks) {
      m.glow.setVisible(false);
      m.ring.setVisible(false);
      m.arrow.setVisible(false);
      m.label.setVisible(false);
      m.swap.setVisible(false);
    }
  }

  destroy(): void {
    for (const m of this.marks) { m.glow.destroy(); m.ring.destroy(); m.arrow.destroy(); m.label.destroy(); m.swap.destroy(); }
    this.marks.length = 0;
  }
}
