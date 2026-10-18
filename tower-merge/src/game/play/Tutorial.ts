import Phaser from 'phaser';
import { SLOTS } from '../../data/map';
import type { WorldApi } from '../../sim/api';
import { crispText } from '../ui/text';
import { PALETTE } from '../ui/theme';
import { D, TOWER_DY } from './constants';
import type { TutorialStep } from './logic';
import { TEX } from './textures';

/** The callout sits in the gap between START WAVE and BUY, so the castle stays visible. */
const TIP_Y = 1139;

/** First-run hints: a pointing hand with a short line of text. Unobtrusive, dismissed by the action itself. */
export class Tutorial {
  private readonly hand: Phaser.GameObjects.Image;
  private readonly box: Phaser.GameObjects.Container;
  private readonly boxBg: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.Text;
  private step: TutorialStep = 'none';
  private t = 0;
  private pairA = -1;
  private pairB = -1;
  private alpha = 0;

  constructor(scene: Phaser.Scene, private readonly buyPoint: () => { x: number; y: number }) {
    this.hand = scene.add.image(0, 0, TEX.hand).setOrigin(0.5, 0.03).setDepth(D.tutorial).setVisible(false).setScale(0.8);
    this.boxBg = scene.add.graphics();
    this.text = crispText(scene, 0, 0, '', { preset: 'body', size: 24, colorNum: 0xffffff, strokeThickness: 3, wordWrap: { width: 600 } });
    this.box = scene.add.container(360, 0, [this.boxBg, this.text]).setDepth(D.tutorial).setVisible(false);
  }

  get current(): TutorialStep { return this.step; }
  get visible(): boolean { return this.alpha > 0.03; }

  /** The slot pair (a, b) of two towers that can merge, or null. */
  static findPair(world: WorldApi): [number, number] | null {
    const s = world.slots;
    for (let a = 0; a < s.length; a++) {
      for (let b = a + 1; b < s.length; b++) if (world.canMerge(a, b)) return [a, b];
    }
    return null;
  }

  private setText(label: string, y: number): void {
    this.text.setText(label);
    const w = Math.min(620, this.text.width + 48);
    const h = this.text.height + 14;
    this.boxBg.clear();
    this.boxBg.fillStyle(PALETTE.shadow, 0.35).fillRoundedRect(-w / 2, -h / 2 + 5, w, h, 22);
    this.boxBg.fillStyle(PALETTE.outline, 1).fillRoundedRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 25);
    this.boxBg.fillStyle(0x24305f, 0.96).fillRoundedRect(-w / 2, -h / 2, w, h, 22);
    this.boxBg.lineStyle(3, PALETTE.gold, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 22);
    this.box.setPosition(360, y);
  }

  /** `dragging`: hide the hand while the player is already doing it. */
  update(step: TutorialStep, world: WorldApi, dt: number, dragging: boolean): void {
    if (step !== this.step) {
      this.step = step;
      this.t = 0;
      if (step === 'buy') this.setText('Tap BUY to build a tower', TIP_Y);
      else if (step === 'merge') {
        this.setText('Drag a tower onto its twin to MERGE!', TIP_Y);
        const p = Tutorial.findPair(world);
        this.pairA = p ? p[0] : -1;
        this.pairB = p ? p[1] : -1;
      }
    }
    const on = step !== 'none';
    this.alpha += ((on ? 1 : 0) - this.alpha) * Math.min(1, dt * 8);
    const vis = this.alpha > 0.03;
    this.box.setVisible(vis).setAlpha(this.alpha);
    if (!vis) { this.hand.setVisible(false); return; }
    this.t += dt;
    if (step === 'merge') {
      const p = Tutorial.findPair(world);
      if (p) { this.pairA = p[0]; this.pairB = p[1]; }
    }
    if (step === 'buy') {
      const b = this.buyPoint();
      const bob = Math.abs(Math.sin(this.t * 4)) * 16;
      this.hand.setVisible(true).setScrollFactor(0).setPosition(b.x + 40, b.y + 36 - bob).setAlpha(this.alpha).setAngle(-12);
      this.box.setScrollFactor(0);
    } else if (step === 'merge' && this.pairA >= 0 && !dragging) {
      const a = SLOTS[this.pairA];
      const b = SLOTS[this.pairB];
      const cyc = (this.t % 2.2) / 2.2;
      const k = cyc < 0.15 ? 0 : cyc > 0.75 ? 1 : (cyc - 0.15) / 0.6;
      const e = k * k * (3 - 2 * k);
      const hx = a.x + (b.x - a.x) * e + 12;
      const hy = a.y + TOWER_DY + 10 + (b.y - a.y) * e;
      const press = cyc < 0.75 ? 1 : 0;
      const fade = cyc > 0.9 ? 1 - (cyc - 0.9) / 0.1 : 1;
      this.hand.setVisible(true).setScrollFactor(1).setPosition(hx, hy).setScale(press ? 0.72 : 0.84).setAlpha(this.alpha * fade).setAngle(-10);
      this.box.setScrollFactor(1);
    } else {
      this.hand.setVisible(false);
    }
  }

  destroy(): void {
    this.hand.destroy();
    this.box.destroy();
  }
}
