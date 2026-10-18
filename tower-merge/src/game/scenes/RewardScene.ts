import Phaser from 'phaser';
import { TOWERS } from '../../data/towers';
import type { TowerId } from '../../data/types';
import { towerKey } from '../assetKeys';
import { EMERGENCY_POWERS, hasFreeSlot, pickRewardTower, type PowerInfo } from '../overlays/logic';
import { addDim, addGlow, burst, closeOverlay, ensureOverlayTextures } from '../overlays/overlayKit';
import { createRewardOffer, type UIRewardOffer } from '../overlays/rewardOffer';
import {
  DEPTH, PALETTE, RARITY_COLORS, TOWER_COLORS, W, createButton, createCardFrame, createPanel, crispText, fitText, playSfx, reducedMotion,
  showToast, uiIcon, type CardFrame, type UIButton,
} from '../ui';
import type { RewardSceneData } from './contracts';
import { SceneKeys } from './keys';

const PANEL_Y = 640;
const PANEL_W = 640;
const PANEL_H = 940;
const TOP = PANEL_Y - PANEL_H / 2;
const RARE_TOWER_LEVEL = 3;

/**
 * Optional boss rewards. 'rareTower': a free level 3 tower. 'emergencyPower': pick one of three
 * temporary powers. Both are claimed through the reward service and can always be declined.
 */
export class RewardScene extends Phaser.Scene {
  private ctx!: RewardSceneData;
  private offer: UIRewardOffer | null = null;
  private noThanks: UIButton | null = null;
  private busy = false;
  private done = false;
  private selected = -1;
  private powerCards: Array<{ info: PowerInfo; container: Phaser.GameObjects.Container; frame: CardFrame; baseY: number }> = [];
  private hint: Phaser.GameObjects.Text | null = null;

  constructor() {
    super(SceneKeys.Reward);
  }

  init(data: RewardSceneData): void {
    this.ctx = data;
    this.offer = null;
    this.noThanks = null;
    this.busy = false;
    this.done = false;
    this.selected = -1;
    this.powerCards = [];
    this.hint = null;
  }

  create(): void {
    ensureOverlayTextures(this);
    addDim(this);
    const panel = createPanel(this, W / 2, PANEL_Y, PANEL_W, PANEL_H, { depth: DEPTH.panel });
    if (!reducedMotion()) {
      panel.setScale(0.9).setAlpha(0);
      this.tweens.add({ targets: panel, scale: 1, alpha: 1, duration: 260, ease: 'Back.Out' });
    }
    if (this.ctx.kind === 'rareTower') this.buildRareTower();
    else this.buildEmergencyPower();
  }

  private heading(title: string, sub: string): void {
    const t = fitText(crispText(this, W / 2, TOP + 92, title, { preset: 'title', size: 54 }), PANEL_W - 70).setDepth(DEPTH.panel + 2);
    crispText(this, W / 2, TOP + 160, sub, { preset: 'body', size: 32 }).setDepth(DEPTH.panel + 2);
    if (!reducedMotion()) {
      t.setScale(0.6);
      this.tweens.add({ targets: t, scaleX: 1, scaleY: 1, duration: 320, ease: 'Back.Out' });
    }
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.noThanks?.setEnabled(!busy);
  }

  private close(): void {
    if (this.done) return;
    this.done = true;
    closeOverlay(this);
  }

  private addNoThanks(y: number, label = 'No thanks'): void {
    this.noThanks = createButton(this, W / 2, y, {
      label, width: 360, height: 92, fontSize: 32, style: 'ghost', depth: DEPTH.panel + 3,
      onClick: () => { if (!this.busy) this.close(); },
    });
  }

  // --- rare tower ------------------------------------------------------------------------------

  private buildRareTower(): void {
    const world = this.ctx.world;
    this.heading('BOSS DEFEATED!', 'Claim a free rare tower?');
    const type: TowerId | null = pickRewardTower(world.options.towerPool, Math.random());
    const def = type ? TOWERS[type] : null;
    const stageY = TOP + 372;

    if (type && def) {
      const color = TOWER_COLORS[type] ?? PALETTE.gold;
      addGlow(this, W / 2, stageY, 400, color, 0.6)?.setDepth(DEPTH.panel + 1);
      this.add.ellipse(W / 2, stageY + 112, 230, 44, 0x000000, 0.4).setDepth(DEPTH.panel + 1);
      const sprite = uiIcon(this, W / 2, stageY, towerKey(type, RARE_TOWER_LEVEL), 270).setDepth(DEPTH.panel + 2);
      if (!reducedMotion()) {
        const base = sprite.scale;
        sprite.setScale(base * 0.3);
        this.tweens.add({
          targets: sprite, scale: base, duration: 420, delay: 150, ease: 'Back.Out',
          onComplete: () => this.tweens.add({ targets: sprite, y: stageY - 10, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.InOut' }),
        });
        burst(this, W / 2, stageY, color, 16, 190);
      }
      fitText(crispText(this, W / 2, TOP + 572, def.name, { preset: 'heading', size: 42 }), PANEL_W - 80).setDepth(DEPTH.panel + 2);
      const perk = def.levels[RARE_TOWER_LEVEL - 1]?.perkName;
      crispText(this, W / 2, TOP + 624, `Level ${RARE_TOWER_LEVEL}${perk ? ` - ${perk}` : ''}`, { preset: 'body', size: 28, colorNum: PALETTE.goldLight })
        .setDepth(DEPTH.panel + 2);
    }

    const free = hasFreeSlot(world.slots);
    if (!free) {
      crispText(this, W / 2, TOP + 676, 'No free slot! Merge or sell a tower first.', {
        preset: 'body', size: 26, colorNum: PALETTE.danger, wordWrap: { width: PANEL_W - 100 },
      }).setDepth(DEPTH.panel + 2);
    }

    this.offer = createRewardOffer(this, W / 2, TOP + 758, {
      placement: 'rareTower', ctx: { runId: this.ctx.runId, key: `boss-${this.ctx.wave}` }, prefix: 'Claim', width: 540, height: 112, fontSize: 40,
      depth: DEPTH.panel + 3, onBusyChange: (b) => this.setBusy(b),
      onGranted: () => {
        if (type && world.grantTower(type, RARE_TOWER_LEVEL)) {
          playSfx('upgrade_pick');
          if (this.scene.isActive()) showToast(this, `${def?.name ?? 'Tower'} added!`, { kind: 'success', icon: type ? `icon_${type}` : undefined });
        } else if (this.scene.isActive()) {
          showToast(this, 'No room for the tower', { kind: 'danger' });
        }
        this.time.delayedCall(reducedMotion() ? 100 : 650, () => this.close());
      },
    });
    this.offer.setBlocked(!free || !type);
    const unavailable = !this.offer.visible;
    if (unavailable) {
      crispText(this, W / 2, TOP + 758, 'No reward available right now.', { preset: 'body', size: 28, colorNum: PALETTE.textDim }).setDepth(DEPTH.panel + 2);
    }
    this.addNoThanks(TOP + 868, unavailable ? 'Continue' : 'No thanks');
  }

  // --- emergency power -------------------------------------------------------------------------

  private buildEmergencyPower(): void {
    this.heading('A boss approaches!', 'Take an emergency power?');
    const cardW = 186, cardH = 340, gap = 14;
    const cy = TOP + 400;
    EMERGENCY_POWERS.forEach((info, i) => {
      const x = W / 2 + (i - 1) * (cardW + gap);
      const frame = createCardFrame(this, 0, 0, cardW, cardH, info.rarity);
      const c = this.add.container(x, cy).setDepth(DEPTH.panel + 2).setSize(cardW, cardH);
      c.add(frame.container);
      c.add(crispText(this, 0, -cardH / 2 + 28, info.rarity.toUpperCase(), { preset: 'small', size: 20, colorNum: RARITY_COLORS[info.rarity] }));
      const halo = addGlow(this, 0, -52, 150, RARITY_COLORS[info.rarity], 0.45);
      if (halo) c.add(halo);
      c.add(uiIcon(this, 0, -52, `icon_${info.icon}`, 98));
      const name = crispText(this, 0, 40, info.name, { preset: 'heading', size: 26, wordWrap: { width: cardW - 24 } });
      if (name.height > 66) name.setScale(66 / name.height);
      c.add(name);
      const desc = crispText(this, 0, 0, info.description, { preset: 'small', size: 21, wordWrap: { width: cardW - 28 }, colorNum: 0xe4eaff });
      desc.setY(82 + desc.height / 2);
      c.add(desc);
      const zone = this.add.zone(0, 0, cardW, cardH).setInteractive({ useHandCursor: true });
      c.add(zone);
      zone.on('pointerup', () => this.selectPower(i));
      this.powerCards.push({ info, container: c, frame, baseY: cy });
      if (!reducedMotion()) {
        c.setAlpha(0).setY(cy + 60);
        this.tweens.add({ targets: c, alpha: 1, y: cy, duration: 320, delay: 200 + i * 110, ease: 'Back.Out' });
      }
    });

    this.hint = crispText(this, W / 2, TOP + 640, 'Pick one power', { preset: 'body', size: 28, colorNum: PALETTE.goldLight }).setDepth(DEPTH.panel + 2);
    this.offer = createRewardOffer(this, W / 2, TOP + 740, {
      placement: 'emergencyPower', ctx: { runId: this.ctx.runId }, width: 540, height: 120, fontSize: 40, depth: DEPTH.panel + 3,
      onBusyChange: (b) => this.setBusy(b),
      onGranted: () => {
        const info = this.powerCards[this.selected]?.info;
        if (info && this.ctx.world.applyEmergencyPower(info.id)) {
          playSfx('upgrade_pick');
          burst(this, W / 2, TOP + 400, RARITY_COLORS[info.rarity], 22, 230);
          if (this.scene.isActive()) showToast(this, `${info.name} active!`, { kind: 'gold', icon: `icon_${info.icon}` });
        } else if (this.scene.isActive()) {
          showToast(this, 'Could not apply the power', { kind: 'danger' });
        }
        this.time.delayedCall(reducedMotion() ? 100 : 700, () => this.close());
      },
    });
    this.offer.setBlocked(true);
    const unavailable = !this.offer.visible;
    if (unavailable) {
      this.hint.setText('No reward available right now.').setColor('#aab4d4');
      this.powerCards.forEach((p) => p.container.setAlpha(0.5));
    }
    this.addNoThanks(TOP + 860, unavailable ? 'Continue' : 'No thanks');
  }

  private selectPower(i: number): void {
    if (this.busy || this.done || !this.offer?.visible) return;
    this.selected = i;
    playSfx('click');
    this.powerCards.forEach((p, j) => {
      const sel = j === i;
      p.frame.setSelected(sel);
      p.container.setDepth(DEPTH.panel + (sel ? 4 : 2));
      this.tweens.killTweensOf(p.container);
      const props = { y: p.baseY + (sel ? -16 : 0), scale: sel ? 1.07 : 0.96, alpha: sel ? 1 : 0.8 };
      if (reducedMotion()) p.container.setPosition(p.container.x, props.y).setScale(props.scale).setAlpha(props.alpha);
      else this.tweens.add({ targets: p.container, ...props, duration: 160, ease: 'Back.Out' });
    });
    this.hint?.setText(this.powerCards[i].info.name);
    this.offer.setBlocked(false);
  }
}
