import Phaser from 'phaser';
import { SYNERGIES } from '../../data/synergies';
import type { UpgradeDef } from '../../data/types';
import { addDim, addGlow, burst, closeOverlay, ensureOverlayTextures, layoutChips } from '../overlays/overlayKit';
import { stackInfo, upgradeIconKey } from '../overlays/logic';
import { createRewardOffer, type UIRewardOffer } from '../overlays/rewardOffer';
import {
  DEPTH, PALETTE, RARITY_COLORS, RARITY_LABELS, W, createButton, createCardFrame, crispText, fitText, playSfx, reducedMotion,
  showToast, uiIcon, type CardFrame, type UIButton,
} from '../ui';
import type { UpgradeSceneData } from './contracts';
import { SceneKeys } from './keys';

const CARD_W = 210;
const CARD_H = 560;
const CARD_GAP = 18;
const CARD_Y = 545;
const CONFIRM_Y = 902;
const REROLL_Y = 1016;
const SYNERGY_TOP = 1112;
const DEAL_STAGGER = 170;

interface CardView {
  def: UpgradeDef;
  wrapper: Phaser.GameObjects.Container;
  front: Phaser.GameObjects.Container;
  back: Phaser.GameObjects.Container;
  frame: CardFrame;
  baseX: number;
  baseY: number;
}

/**
 * "Choose an upgrade": three tall rarity cards dealt in with a flip, tap to select (lift + glow),
 * tap again or CHOOSE to pick. A free reroll (or the 'reroll' reward) re-deals the cards.
 */
export class UpgradeScene extends Phaser.Scene {
  private ctx!: UpgradeSceneData;
  private cards: CardView[] = [];
  private selected = -1;
  /** Cards are animating (deal / pick): taps are ignored. */
  private locked = true;
  /** A reroll claim is pending (ad showing). */
  private busy = false;
  private picked = false;
  private confirm!: UIButton;
  private rerollObjs: Array<{ destroy(): void; container: Phaser.GameObjects.Container }> = [];
  private offer: UIRewardOffer | null = null;
  private chrome: Phaser.GameObjects.GameObject[] = [];
  private unlockTimer: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super(SceneKeys.Upgrade);
  }

  init(data: UpgradeSceneData): void {
    this.ctx = data;
    this.cards = [];
    this.selected = -1;
    this.locked = true;
    this.busy = false;
    this.picked = false;
    this.rerollObjs = [];
    this.offer = null;
    this.chrome = [];
    this.unlockTimer = null;
  }

  create(): void {
    const world = this.ctx.world;
    ensureOverlayTextures(this);
    addDim(this);

    const title = fitText(crispText(this, W / 2, 112, 'Choose an upgrade', { preset: 'title', size: 46 }), W - 90).setDepth(DEPTH.panel);
    const sub = crispText(this, W / 2, 176, `Wave ${world.wave} cleared!`, { preset: 'body', size: 32, colorNum: PALETTE.success }).setDepth(DEPTH.panel);
    this.chrome.push(title, sub);
    if (!reducedMotion()) {
      title.setScale(0.7).setAlpha(0);
      this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 300, ease: 'Back.Out' });
      sub.setAlpha(0);
      this.tweens.add({ targets: sub, alpha: 1, duration: 300, delay: 150 });
    }

    this.confirm = createButton(this, W / 2, CONFIRM_Y, {
      label: 'Pick a card', width: 460, height: 104, fontSize: 42, style: 'primary', enabled: false, depth: DEPTH.panel + 5,
      onClick: () => this.pick(this.selected),
    });
    this.chrome.push(this.confirm.container);

    this.buildSynergyChips();
    this.dealCards();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.unlockTimer?.remove(false); });
  }

  // --- dealing ---------------------------------------------------------------------------------

  private dealCards(): void {
    for (const c of this.cards) c.wrapper.destroy();
    this.cards = [];
    this.selected = -1;
    this.locked = true;
    this.updateConfirm();

    const choices = this.ctx.world.upgradeChoices.slice(0, 3);
    const taken = this.ctx.world.stats.upgradesTaken;
    const n = choices.length;
    choices.forEach((def, i) => {
      const x = W / 2 + (i - (n - 1) / 2) * (CARD_W + CARD_GAP);
      const view = this.buildCard(def, x, CARD_Y, taken);
      this.cards.push(view);
      this.dealIn(view, i);
    });
    this.buildRerollRow();

    const total = reducedMotion() ? 0 : (n - 1) * DEAL_STAGGER + 900;
    this.unlockTimer?.remove(false);
    this.unlockTimer = this.time.delayedCall(total, () => { this.locked = false; });
  }

  private buildCard(def: UpgradeDef, x: number, y: number, taken: readonly string[]): CardView {
    const color = RARITY_COLORS[def.rarity];
    const wrapper = this.add.container(x, y).setDepth(DEPTH.panel + 1).setSize(CARD_W, CARD_H);

    // --- front ---
    const front = this.add.container(0, 0);
    const frame = createCardFrame(this, 0, 0, CARD_W, CARD_H, def.rarity);
    front.add(frame.container);
    front.add(crispText(this, 0, -CARD_H / 2 + 30, RARITY_LABELS[def.rarity].toUpperCase(), { preset: 'small', size: 24, colorNum: color }));
    const iconY = -CARD_H / 2 + 150;
    const halo = addGlow(this, 0, iconY, 190, color, 0.5);
    if (halo) front.add(halo);
    front.add(uiIcon(this, 0, iconY, upgradeIconKey(def), 124));
    const name = crispText(this, 0, -CARD_H / 2 + 262, def.name, { preset: 'heading', size: 30, wordWrap: { width: CARD_W - 28 } });
    name.setScale(Math.min(1, (CARD_W - 16) / name.width, 84 / name.height));
    front.add(name);
    const rule = this.add.graphics();
    rule.fillStyle(color, 0.5).fillRect(-CARD_W / 2 + 30, -CARD_H / 2 + 318, CARD_W - 60, 3);
    front.add(rule);
    const desc = crispText(this, 0, 0, def.description, { preset: 'body', size: 24, wordWrap: { width: CARD_W - 32 }, lineSpacing: 2 });
    const descTop = -CARD_H / 2 + 332;
    const descMaxH = 150;
    if (desc.height > descMaxH) desc.setScale(descMaxH / desc.height);
    desc.setPosition(0, descTop + Math.max(desc.displayHeight, 80) / 2);
    front.add(desc);

    const stack = stackInfo(def.id, def.maxStacks, taken);
    if (stack.label) {
      const badge = this.add.graphics();
      const by = CARD_H / 2 - 44;
      badge.fillStyle(PALETTE.outline, 1).fillRoundedRect(-80, by - 22, 160, 44, 22);
      badge.fillStyle(PALETTE.gold, 1).fillRoundedRect(-77, by - 19, 154, 38, 19);
      front.add(badge);
      front.add(crispText(this, 0, by, stack.label, { preset: 'small', size: 24, colorNum: PALETTE.textDark, strokeThickness: 0 }));
    }
    if (def.rarity === 'legendary' || def.rarity === 'epic') this.addSparkles(front, color, def.rarity === 'legendary' ? 6 : 3);
    if (def.rarity === 'legendary') this.addShine(front);

    // --- back ---
    const back = this.add.container(0, 0);
    const bg = this.add.graphics();
    bg.fillStyle(PALETTE.outline, 1).fillRoundedRect(-CARD_W / 2 - 4, -CARD_H / 2 - 4, CARD_W + 8, CARD_H + 8, 28);
    bg.fillStyle(PALETTE.gold, 1).fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 24);
    bg.fillStyle(PALETTE.panelLight, 1).fillRoundedRect(-CARD_W / 2 + 8, -CARD_H / 2 + 8, CARD_W - 16, CARD_H - 16, 18);
    bg.lineStyle(4, PALETTE.gold, 0.5).strokeRoundedRect(-CARD_W / 2 + 22, -CARD_H / 2 + 22, CARD_W - 44, CARD_H - 44, 12);
    bg.fillStyle(PALETTE.gold, 0.18).fillTriangle(0, -90, 70, 0, 0, 90).fillTriangle(0, -90, -70, 0, 0, 90);
    back.add(bg);
    back.add(crispText(this, 0, -4, '?', { preset: 'title', size: 130 }));

    const zone = this.add.zone(0, 0, CARD_W, CARD_H).setInteractive({ useHandCursor: true });
    wrapper.add([back, front, zone]);
    front.setVisible(false);

    const view: CardView = { def, wrapper, front, back, frame, baseX: x, baseY: y };
    zone.on('pointerup', () => this.select(this.cards.indexOf(view)));
    return view;
  }

  private addSparkles(front: Phaser.GameObjects.Container, color: number, count: number): void {
    if (reducedMotion() || !this.textures.exists('fx_star')) return;
    for (let i = 0; i < count; i++) {
      const s = this.add.image(
        Phaser.Math.Between(-CARD_W / 2 + 24, CARD_W / 2 - 24), Phaser.Math.Between(-CARD_H / 2 + 70, CARD_H / 2 - 40), 'fx_star',
      ).setTint(color).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setDisplaySize(26, 26);
      front.add(s);
      this.tweens.add({
        targets: s, alpha: { from: 0, to: 0.9 }, scale: { from: s.scale * 0.5, to: s.scale * 1.2 }, angle: 90, duration: 700,
        yoyo: true, repeat: -1, delay: Math.random() * 1500, repeatDelay: 400 + Math.random() * 900, ease: 'Sine.InOut',
      });
    }
  }

  /** Diagonal highlight sweeping across a legendary card, clipped to the card by slicing. */
  private addShine(front: Phaser.GameObjects.Container): void {
    if (reducedMotion()) return;
    const g = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.3);
    front.add(g);
    const state = { t: 0 };
    const draw = (): void => {
      g.clear().fillStyle(0xffffff, 1);
      const x0 = -CARD_W / 2 - 160 + state.t * (CARD_W + 320);
      const inL = -CARD_W / 2 + 7, inR = CARD_W / 2 - 7;
      for (let y = -CARD_H / 2 + 8; y < CARD_H / 2 - 8; y += 10) {
        const off = (y + CARD_H / 2) * 0.4;
        const l = Math.max(inL, x0 + off);
        const r = Math.min(inR, x0 + off + 52);
        if (r > l) g.fillRect(l, y, r - l, 10);
      }
    };
    draw();
    this.tweens.add({ targets: state, t: 1, duration: 1100, repeat: -1, repeatDelay: 1500, ease: 'Sine.InOut', onUpdate: draw });
  }

  private dealIn(view: CardView, index: number): void {
    const { wrapper, front, back, def } = view;
    const reveal = (): void => {
      back.setVisible(false);
      front.setVisible(true);
      if (def.rarity === 'legendary') {
        playSfx('legendary');
        burst(this, view.baseX, view.baseY, RARITY_COLORS.legendary, 18, 190);
      } else if (def.rarity === 'epic') {
        burst(this, view.baseX, view.baseY, RARITY_COLORS.epic, 10, 150);
      }
    };
    if (reducedMotion()) {
      playSfx('card_flip');
      reveal();
      return;
    }
    const delay = index * DEAL_STAGGER;
    wrapper.setAlpha(0).setY(view.baseY + 150).setScale(0.7);
    this.tweens.add({ targets: wrapper, alpha: 1, y: view.baseY, scale: 1, duration: 320, delay, ease: 'Back.Out' });
    this.time.delayedCall(delay + 430, () => {
      playSfx('card_flip');
      this.tweens.add({
        targets: wrapper, scaleX: 0, duration: 120, ease: 'Sine.In',
        onComplete: () => {
          reveal();
          this.tweens.add({ targets: wrapper, scaleX: 1, duration: 220, ease: 'Back.Out' });
        },
      });
    });
  }

  // --- selection -------------------------------------------------------------------------------

  private select(i: number): void {
    if (i < 0 || this.locked || this.busy || this.picked) return;
    if (i === this.selected) { this.pick(i); return; }
    this.selected = i;
    playSfx('click');
    this.cards.forEach((c, j) => this.styleCard(c, j === i));
    this.updateConfirm();
  }

  private styleCard(c: CardView, selected: boolean): void {
    c.frame.setSelected(selected);
    c.wrapper.setDepth(DEPTH.panel + (selected ? 3 : 1));
    this.tweens.killTweensOf(c.wrapper);
    const dim = this.selected >= 0 && !selected;
    const props = {
      y: c.baseY + (selected ? -28 : 0), scaleX: selected ? 1.06 : dim ? 0.95 : 1, scaleY: selected ? 1.06 : dim ? 0.95 : 1, alpha: dim ? 0.78 : 1,
    };
    if (reducedMotion()) c.wrapper.setPosition(c.baseX, props.y).setScale(props.scaleX, props.scaleY).setAlpha(props.alpha);
    else this.tweens.add({ targets: c.wrapper, ...props, duration: 160, ease: 'Back.Out' });
  }

  private updateConfirm(): void {
    if (this.selected < 0) this.confirm.setEnabled(false).setLabel('Pick a card');
    else this.confirm.setEnabled(!this.busy && !this.picked).setLabel('CHOOSE');
  }

  private pick(i: number): void {
    if (i < 0 || this.locked || this.busy || this.picked) return;
    const card = this.cards[i];
    if (!card) return;
    if (!this.ctx.world.chooseUpgrade(card.def.id)) {
      showToast(this, 'Could not pick that upgrade', { kind: 'danger' });
      return;
    }
    this.picked = true;
    this.locked = true;
    playSfx('upgrade_pick');
    const color = RARITY_COLORS[card.def.rarity];
    this.confirm.setEnabled(false);

    const fadeOut: Phaser.GameObjects.GameObject[] = [...this.chrome, ...this.rerollObjs.map((o) => o.container)];
    this.offer?.setBlocked(true);
    if (reducedMotion()) {
      this.time.delayedCall(150, () => closeOverlay(this));
      return;
    }
    this.tweens.add({ targets: fadeOut, alpha: 0, duration: 200 });
    this.cards.forEach((c, j) => {
      if (j === i) return;
      this.tweens.killTweensOf(c.wrapper);
      this.tweens.add({ targets: c.wrapper, alpha: 0, scale: 0.7, y: c.baseY + 120, duration: 260, ease: 'Sine.In' });
    });
    burst(this, card.wrapper.x, card.wrapper.y, color, 20, 210);
    this.tweens.killTweensOf(card.wrapper);
    card.wrapper.setDepth(DEPTH.panel + 10);
    this.tweens.add({
      targets: card.wrapper, scaleX: 1.14, scaleY: 1.14, duration: 160, ease: 'Sine.Out',
      onComplete: () => {
        this.tweens.add({
          targets: card.wrapper, x: W / 2, y: 70, scaleX: 0.22, scaleY: 0.22, alpha: 0.2, duration: 460, ease: 'Cubic.In',
          onComplete: () => {
            burst(this, W / 2, 70, color, 10, 80);
            closeOverlay(this);
          },
        });
      },
    });
  }

  // --- reroll row & synergies --------------------------------------------------------------------

  private buildRerollRow(): void {
    for (const o of this.rerollObjs) o.destroy();
    this.rerollObjs = [];
    this.offer = null;
    const world = this.ctx.world;
    if (world.freeRerolls > 0) {
      const b = createButton(this, W / 2, REROLL_Y, {
        label: `Free reroll (${world.freeRerolls})`, icon: 'icon_reroll', width: 480, height: 96, fontSize: 34, style: 'secondary',
        depth: DEPTH.panel + 5, onClick: () => this.reroll(false),
      });
      this.rerollObjs.push(b);
      return;
    }
    const offer = createRewardOffer(this, W / 2, REROLL_Y, {
      placement: 'reroll', ctx: { runId: this.ctx.runId, key: `upgrade-${world.wave}` }, prefix: 'Reroll',
      width: 520, height: 96, fontSize: 32, style: 'success',
      onBusyChange: (busy) => { this.busy = busy; this.updateConfirm(); },
      onGranted: () => this.reroll(true),
    });
    this.offer = offer;
    this.rerollObjs.push(offer);
  }

  private reroll(paid: boolean): void {
    if (this.picked || (!paid && (this.locked || this.busy))) return;
    if (!this.ctx.world.rerollUpgrades(paid)) {
      if (this.scene.isActive()) showToast(this, 'Reroll not available', { kind: 'danger' });
      return;
    }
    if (!this.scene.isActive()) return;
    this.dealCards();
  }

  private buildSynergyChips(): void {
    const ids = this.ctx.world.activeSynergies;
    const items = ids.map((id) => SYNERGIES.find((s) => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s)
      .map((s) => ({ icon: `icon_${s.icon}`, text: s.name, color: PALETTE.info }));
    if (!items.length) return;
    const label = crispText(this, W / 2, SYNERGY_TOP - 4, 'ACTIVE SYNERGIES', { preset: 'small', size: 20 }).setDepth(DEPTH.panel);
    const chips = layoutChips(this, items, W / 2, SYNERGY_TOP + 14, W - 60, 2);
    this.chrome.push(label, chips.container);
  }
}
