import Phaser from 'phaser';
import { TOWERS } from '../../data/towers';
import type { TowerId } from '../../data/types';
import type { WorldApi } from '../../sim/api';
import { towerKey } from '../assetKeys';
import { PALETTE, TOWER_COLORS } from '../ui/theme';
import { crispText } from '../ui/text';
import { showBanner } from '../ui/toast';
import { COLOR_GOLD, D, towerSize } from './constants';
import type { FlyerSnapshot } from './DragController';
import type { Effects } from './Effects';
import { mergeHitstopMs, mergeSound } from './logic';
import type { TowerLayer } from './TowerView';

export interface MergeEvent {
  slot: number;
  fromSlot: number;
  tower: TowerId;
  level: number;
}

/** Rising text that pops in with a punch and fades ("LEVEL 3!", the perk name). */
export function popText(
  scene: Phaser.Scene, x: number, y: number, text: string, size: number, color: number, rise = 70, hold = 520, depth: number = D.dmg + 2,
): Phaser.GameObjects.Text {
  const t = crispText(scene, x, y, text, { preset: 'title', size, colorNum: color, strokeThickness: Math.max(6, Math.round(size / 6)) });
  t.setDepth(depth).setScale(0.3).setAlpha(0);
  scene.tweens.add({ targets: t, scale: 1.18, alpha: 1, duration: 150, ease: 'Back.Out' });
  scene.tweens.add({ targets: t, scale: 1, duration: 120, delay: 150 });
  scene.tweens.add({
    targets: t, y: y - rise, alpha: 0, delay: hold, duration: 420, ease: 'Sine.In', onComplete: () => t.destroy(),
  });
  return t;
}

/**
 * The merge celebration: the lifted tower flies into its twin, both squash with a white flash,
 * the new level pops in with an elastic punch, and a shockwave, sparks, stars and "LEVEL N!" text
 * go off with hitstop, shake, haptics and a pitched sound. Level 5 adds a golden burst and banner.
 */
export class MergeFx {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly fx: Effects,
    private readonly layer: TowerLayer,
    private readonly world: () => WorldApi,
  ) {}

  play(ev: MergeEvent, flyer: FlyerSnapshot | null): void {
    const view = this.layer.views[ev.slot];
    view.hold = true;
    const a = view.anchor();
    if (!flyer) {
      this.impact(ev, true);
      return;
    }
    const scene = this.scene;
    const img = scene.add.image(flyer.x, flyer.y, towerKey(flyer.type, flyer.level)).setOrigin(0.5, 0.875).setDepth(D.dragged);
    const base = towerSize(flyer.level) / img.frame.height;
    img.setScale(base * flyer.scale).setRotation(flyer.rotation);
    const color = TOWER_COLORS[ev.tower];
    // comet streak from where it was lifted to the target
    this.fx.anim('fx_glow', flyer.x, flyer.y - 30, 70, 30, 0.8, 0, 0.14, color, { tx: a.x, ty: a.y - 30, ease: 1 });
    scene.tweens.add({
      targets: img, x: a.x, y: a.y, rotation: 0, scaleX: base * 0.95, scaleY: base * 1.05, duration: 115, ease: 'Cubic.In',
      onComplete: () => {
        img.destroy();
        this.impact(ev, false);
      },
    });
  }

  /** Both towers collide: flash + squash, then reveal the new level after a beat of hitstop. */
  private impact(ev: MergeEvent, instant: boolean): void {
    const view = this.layer.views[ev.slot];
    const a = view.anchor();
    const level = ev.level;
    const snd = mergeSound(level);
    this.fx.sfx(snd.key, { rate: snd.rate, volume: 1 });
    this.fx.hitstop(mergeHitstopMs(level));
    this.fx.glow(a.x, a.y - 44, 0xffffff, 100, 260, 130, 0.95);
    view.squash();
    this.scene.time.delayedCall(instant ? 0 : 72, () => this.reveal(ev));
  }

  private reveal(ev: MergeEvent): void {
    const view = this.layer.views[ev.slot];
    const a = view.anchor();
    const world = this.world();
    const fx = this.fx;
    const color = TOWER_COLORS[ev.tower];
    const level = ev.level;
    view.release(world.slots[ev.slot]?.tower ?? null);
    view.pop();
    const cy = a.y - towerSize(level) * 0.4;

    // shockwave rings + light flash
    fx.ring(a.x, cy, color, 50, 330, 480, 0.95);
    fx.ring(a.x, cy, 0xffffff, 30, 230, 340, 0.9);
    fx.glow(a.x, cy, color, 140, 330, 260, 0.9);
    // burst of tower-coloured sparks and gold stars
    fx.sparks(a.x, cy, color, 22);
    fx.sparks(a.x, cy, 0xffffff, 8);
    fx.stars(a.x, cy, COLOR_GOLD, 12 + level * 2);
    fx.puffs(a.x, a.y + 4, 4, 0xf1e6cc);

    const def = TOWERS[ev.tower];
    const perk = def.levels[Math.min(level, def.levels.length) - 1]?.perkName;
    popText(this.scene, a.x, a.y - towerSize(level) - 20, `LEVEL ${level}!`, level >= 5 ? 58 : 50, COLOR_GOLD, 64, 620);
    if (perk) {
      this.scene.time.delayedCall(120, () => {
        popText(this.scene, a.x, a.y - towerSize(level) + 22, `${perk}!`, 28, color, 52, 760);
      });
    }

    fx.shake(level >= 4 ? 6 : 3.5, level >= 4 ? 240 : 170);
    try { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(15); } catch { /* optional */ }

    if (level >= 5) {
      fx.ring(a.x, cy, COLOR_GOLD, 80, 470, 640, 1);
      fx.glow(a.x, cy, COLOR_GOLD, 220, 520, 420, 0.9);
      fx.stars(a.x, cy, 0xffe58a, 26);
      fx.stars(a.x, cy, 0xffffff, 10);
      fx.flash(0xffe58a, 0.32, 260);
      this.scene.time.delayedCall(60, () => fx.stars(a.x, cy, COLOR_GOLD, 18));
      showBanner(this.scene, 'MAX LEVEL!', {
        sub: `${def.name}${perk ? ' - ' + perk : ''}`, color: PALETTE.panelLight, duration: 1500, y: 330,
      });
    }
  }
}

