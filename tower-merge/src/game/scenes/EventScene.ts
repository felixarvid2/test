import Phaser from 'phaser';
import { EVENTS } from '../../data/events';
import type { EventOption } from '../../data/types';
import { canAffordOption, chestLayout, eventOptionIcon } from '../overlays/logic';
import { addDim, addGlow, burst, closeOverlay, ensureOverlayTextures } from '../overlays/overlayKit';
import { createOptionButton, type UIOptionButton } from '../overlays/optionButton';
import {
  DEPTH, PALETTE, W, createButton, createPanel, createPill, crispText, fitText, floatText, playSfx, reducedMotion, showToast, uiIcon,
  type UIPill,
} from '../ui';
import type { EventSceneData } from './contracts';
import { SceneKeys } from './keys';

const PANEL_Y = 640;
const PANEL_W = 664;
const PANEL_H = 1080;
const PANEL_TOP = PANEL_Y - PANEL_H / 2;

/**
 * Random event between waves: icon, name, description and the options (cost in coins, disabled
 * when unaffordable). A chest event shows its rewards as face-down chests: tap one to open it.
 */
export class EventScene extends Phaser.Scene {
  private ctx!: EventSceneData;
  private resolved = false;
  private coinPill: UIPill | null = null;

  constructor() {
    super(SceneKeys.Event);
  }

  init(data: EventSceneData): void {
    this.ctx = data;
    this.resolved = false;
    this.coinPill = null;
  }

  create(): void {
    ensureOverlayTextures(this);
    addDim(this);
    const ev = this.ctx.world.pendingEvent;
    if (!ev) {
      // Nothing to resolve (stale launch): give control back.
      this.time.delayedCall(0, () => closeOverlay(this));
      return;
    }
    const def = EVENTS.find((e) => e.id === ev.id);

    const panel = createPanel(this, W / 2, PANEL_Y, PANEL_W, PANEL_H, { depth: DEPTH.panel });
    if (!reducedMotion()) {
      panel.setScale(0.9).setAlpha(0);
      this.tweens.add({ targets: panel, scale: 1, alpha: 1, duration: 260, ease: 'Back.Out' });
    }

    const iconY = PANEL_TOP + 120;
    addGlow(this, W / 2, iconY, 280, PALETTE.gold, 0.5)?.setDepth(DEPTH.panel + 1);
    const icon = uiIcon(this, W / 2, iconY, `icon_${def?.icon ?? 'star'}`, 150).setDepth(DEPTH.panel + 2);
    if (!reducedMotion()) {
      this.tweens.add({ targets: icon, y: iconY - 8, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      icon.setScale(icon.scale * 0.5);
      this.tweens.add({ targets: icon, scale: icon.scale * 2, duration: 380, ease: 'Back.Out' });
    }
    fitText(crispText(this, W / 2, PANEL_TOP + 250, ev.name, { preset: 'title', size: 50 }), PANEL_W - 80).setDepth(DEPTH.panel + 2);
    const desc = crispText(this, W / 2, 0, ev.description, { preset: 'body', size: 28, wordWrap: { width: PANEL_W - 100 } }).setDepth(DEPTH.panel + 2);
    desc.setY(PANEL_TOP + 304 + desc.height / 2);
    const descBottom = desc.y + desc.height / 2;

    if (ev.options.some((o) => (o.cost ?? 0) > 0)) {
      this.coinPill = createPill(this, W - 30, 54, { icon: 'icon_coin', value: this.ctx.world.coins, align: 'right', depth: DEPTH.panel + 6 });
    }

    const chest = chestLayout(ev);
    if (chest.chests.length > 0 && chest.leave) this.buildChests(chest.chests, chest.leave, descBottom);
    else this.buildOptions(ev.options, descBottom);
  }

  // --- regular events --------------------------------------------------------------------------

  private buildOptions(options: EventOption[], top: number): void {
    const world = this.ctx.world;
    const n = options.length;
    const heights = options.map((_, i) => (i === n - 1 && n > 1 ? 104 : 132));
    const gap = 16;
    const total = heights.reduce((s, h) => s + h, 0) + gap * (n - 1);
    const bottom = PANEL_Y + PANEL_H / 2 - 44;
    let y = top + 26 + Math.max(0, (bottom - top - 26 - total) / 2);
    const buttons: UIOptionButton[] = [];
    options.forEach((opt, i) => {
      const h = heights[i];
      const decline = i === n - 1 && n > 1;
      const b = createOptionButton(this, W / 2, y + h / 2, {
        label: opt.label, description: opt.description, icon: `icon_${eventOptionIcon(opt)}`, cost: opt.cost, width: PANEL_W - 60, height: h,
        style: decline ? 'ghost' : 'secondary', enabled: canAffordOption(opt, world.coins), depth: DEPTH.panel + 3,
        onClick: () => this.resolve(opt, b, buttons),
      });
      buttons.push(b);
      if (!reducedMotion()) {
        b.container.setAlpha(0).setX(W / 2 + 80);
        this.tweens.add({ targets: b.container, alpha: 1, x: W / 2, duration: 280, delay: 200 + i * 90, ease: 'Cubic.Out' });
      }
      y += h + gap;
    });
  }

  private resolve(opt: EventOption, button: UIOptionButton, all: UIOptionButton[]): void {
    if (this.resolved) return;
    const world = this.ctx.world;
    if (!canAffordOption(opt, world.coins) || !world.resolveEvent(opt.id)) {
      showToast(this, (opt.cost ?? 0) > world.coins ? 'Not enough coins' : 'Cannot do that now', { kind: 'danger' });
      return;
    }
    this.resolved = true;
    playSfx(opt.cost ? 'buy' : 'upgrade_pick');
    this.coinPill?.setValue(world.coins);
    button.highlight();
    for (const b of all) if (b !== button) { b.setEnabled(false); this.tweens.add({ targets: b.container, alpha: 0.28, duration: 220 }); }
    const { x, y } = button.container;
    burst(this, x, y, PALETTE.gold, 12, 130);
    if (opt.cost) floatText(this, x + 150, y - 50, `-${opt.cost}`, { color: PALETTE.danger, size: 44, depth: DEPTH.toast - 20 });
    this.time.delayedCall(reducedMotion() ? 150 : 700, () => closeOverlay(this));
  }

  // --- chest events ----------------------------------------------------------------------------

  private buildChests(chests: EventOption[], leave: EventOption, top: number): void {
    const n = chests.length;
    const spacing = 208;
    const chestY = top + 205;
    const hint = crispText(this, W / 2, top + 40, 'Choose one chest', { preset: 'body', size: 30, colorNum: PALETTE.goldLight }).setDepth(DEPTH.panel + 2);
    const sprites: Phaser.GameObjects.Container[] = [];
    const reveal: Array<(chosen: boolean) => void> = [];

    chests.forEach((opt, i) => {
      const x = W / 2 + (i - (n - 1) / 2) * spacing;
      const c = this.add.container(x, chestY).setDepth(DEPTH.panel + 3);
      const shadow = this.add.ellipse(0, 78, 150, 28, 0x000000, 0.35);
      const glow = addGlow(this, 0, 0, 260, PALETTE.gold, 0.35);
      const chestImg = uiIcon(this, 0, 0, 'icon_chest', 184);
      const tap = crispText(this, 0, 118, 'TAP', { preset: 'small', size: 24, colorNum: PALETTE.goldLight });
      if (glow) c.add(glow);
      c.add([shadow, chestImg, tap]);
      const zone = this.add.zone(0, 0, 190, 230).setInteractive({ useHandCursor: true });
      c.add(zone);
      sprites.push(c);

      if (!reducedMotion()) {
        this.tweens.add({ targets: chestImg, y: -9, duration: 900 + i * 120, yoyo: true, repeat: -1, ease: 'Sine.InOut', delay: i * 150 });
        this.tweens.add({ targets: tap, alpha: 0.45, duration: 700, yoyo: true, repeat: -1 });
        c.setAlpha(0).setScale(0.6);
        this.tweens.add({ targets: c, alpha: 1, scale: 1, duration: 340, delay: 160 + i * 110, ease: 'Back.Out' });
      }

      // Icon, label and description that appear once the chest is open.
      const rewardIcon = uiIcon(this, x, chestY - 20, `icon_${eventOptionIcon(opt)}`, 104).setDepth(DEPTH.panel + 4).setVisible(false);
      const label = crispText(this, x, chestY + 150, opt.label, { preset: 'heading', size: 26, wordWrap: { width: 196 } }).setDepth(DEPTH.panel + 4).setVisible(false);
      const desc = crispText(this, x, chestY + 150, opt.description, { preset: 'small', size: 22, wordWrap: { width: 196 }, colorNum: 0xe4eaff })
        .setDepth(DEPTH.panel + 4).setVisible(false);
      label.setY(chestY + 150 + label.height / 2);
      desc.setY(label.y + label.height / 2 + 10 + desc.height / 2);

      reveal[i] = (chosen) => {
        tap.setVisible(false);
        label.setVisible(true);
        desc.setVisible(true);
        rewardIcon.setVisible(true);
        glow?.setVisible(chosen);
        const targets = [label, desc, rewardIcon];
        if (!chosen) {
          chestImg.setAlpha(0.45);
          for (const t of targets) t.setAlpha(0.55);
        }
        if (!reducedMotion()) {
          rewardIcon.setScale(rewardIcon.scale * 0.3);
          this.tweens.add({
            targets: rewardIcon, y: chestY - (chosen ? 120 : 100), scale: rewardIcon.scale * (chosen ? 3.3 : 2.9), duration: 380, ease: 'Back.Out',
          });
          label.setAlpha(0); desc.setAlpha(0);
          this.tweens.add({ targets: label, alpha: chosen ? 1 : 0.55, duration: 260 });
          this.tweens.add({ targets: desc, alpha: chosen ? 1 : 0.55, duration: 260, delay: 80 });
        } else {
          rewardIcon.setY(chestY - 110);
        }
      };

      zone.on('pointerup', () => this.openChest(i, opt, c, chestImg, sprites, reveal, hint, leaveBtn));
    });

    const leaveBtn = createButton(this, W / 2, PANEL_Y + PANEL_H / 2 - 90, {
      label: leave.label, width: 420, height: 96, fontSize: 34, style: 'ghost', depth: DEPTH.panel + 3,
      onClick: () => {
        if (this.resolved) return;
        if (!this.ctx.world.resolveEvent(leave.id)) { showToast(this, 'Cannot do that now', { kind: 'danger' }); return; }
        this.resolved = true;
        closeOverlay(this);
      },
    });
  }

  private openChest(
    index: number, opt: EventOption, chest: Phaser.GameObjects.Container, img: Phaser.GameObjects.Image | Phaser.GameObjects.Arc,
    all: Phaser.GameObjects.Container[], reveal: Array<(chosen: boolean) => void>, hint: Phaser.GameObjects.Text,
    leaveBtn: ReturnType<typeof createButton>,
  ): void {
    if (this.resolved) return;
    if (!this.ctx.world.resolveEvent(opt.id)) {
      showToast(this, 'Cannot open that now', { kind: 'danger' });
      return;
    }
    this.resolved = true;
    playSfx('card_flip');
    hint.setText('You found...').setColor('#ffe58a');
    leaveBtn.setVisible(false);

    const finish = (): void => {
      playSfx('upgrade_pick');
      burst(this, chest.x, chest.y - 20, PALETTE.gold, 18, 170);
      reveal[index](true);
      this.time.delayedCall(reducedMotion() ? 0 : 450, () => {
        all.forEach((c, j) => {
          if (j === index) return;
          this.tweens.killTweensOf(c);
          reveal[j](false);
        });
      });
      this.time.delayedCall(reducedMotion() ? 0 : 900, () => {
        const cont = createButton(this, W / 2, PANEL_Y + PANEL_H / 2 - 90, {
          label: 'CONTINUE', width: 440, height: 104, fontSize: 40, style: 'primary', depth: DEPTH.panel + 3,
          onClick: () => closeOverlay(this),
        });
        if (!reducedMotion()) { cont.container.setScale(0.6).setAlpha(0); this.tweens.add({ targets: cont.container, scale: 1, alpha: 1, duration: 260, ease: 'Back.Out' }); }
      });
    };

    all.forEach((c, j) => { if (j !== index) this.tweens.add({ targets: c, alpha: 0.6, duration: 200 }); });
    if (reducedMotion()) { finish(); return; }
    this.tweens.killTweensOf(img);
    this.tweens.add({
      targets: chest, angle: { from: -9, to: 9 }, duration: 70, yoyo: true, repeat: 4, ease: 'Sine.InOut',
      onComplete: () => {
        chest.setAngle(0);
        this.tweens.add({
          targets: chest, scaleX: 1.25, scaleY: 0.85, duration: 90, yoyo: true, ease: 'Sine.Out',
          onComplete: finish,
        });
      },
    });
  }
}
