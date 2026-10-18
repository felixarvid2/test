import Phaser from 'phaser';
import { COLORS, EXTRA_KEY, ICONS_KEY, RARITY_COLOR } from '../assets';
import { services } from '../../services';
import { applyUpgrade, rollUpgradeChoices } from '../../core/run';
import type { Rarity, UpgradeChoice } from '../../core/types';
import { UPGRADE_BY_ID } from '../../data/upgrades';
import { SYNERGY_BY_ID } from '../../data/synergies';
import type { SynergyDef } from '../../core/types';
import { RARITY_LABEL, addSheen, confetti, glow, reduced, sparks } from '../ui/fx';
import { Button, H, W, drawBox, label, textStyle, titleStyle, veil } from '../ui/kit';
import { claimReward, offerReward, rewardButtonText } from '../ui/rewardPrompt';
import { Pips, chip } from '../ui/widgets';
import type { UpgradeSceneData } from './contracts';
import { SCENES } from './keys';

const TITLES: Record<UpgradeSceneData['reason'], string> = {
  room: 'Room Cleared!',
  boss: 'Boss Defeated!',
  treasure: 'Treasure!',
  shrine: 'Blessing',
  bonus: 'Bonus Upgrade',
};

const CARD_W = 656;
const AVAIL_TOP = 214;
const AVAIL_BOTTOM = 1090;
const GAP = 16;
/** Cards ignore taps for this long after they appear (a thumb still on the joystick must not pick). */
const INPUT_DELAY = 350;

interface CardView {
  choice: UpgradeChoice;
  outer: Phaser.GameObjects.Container;
  face: Phaser.GameObjects.Container;
  w: number;
  h: number;
}

const mix = (a: number, b: number, t: number): number => {
  const ca = Phaser.Display.Color.ValueToColor(a);
  const cb = Phaser.Display.Color.ValueToColor(b);
  const c = Phaser.Display.Color.Interpolate.ColorWithColor(ca, cb, 100, Math.round(t * 100));
  return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
};

export class UpgradeScene extends Phaser.Scene {
  private d!: UpgradeSceneData;
  private cards: CardView[] = [];
  private title!: Phaser.GameObjects.Text;
  private subtitle!: Phaser.GameObjects.Text;
  private rerollBtn!: Button;
  private picking = false;
  private busy = false;
  private finished = false;
  private bonusSet = false;
  private extraDone = false;
  private choices: UpgradeChoice[] = [];

  constructor() { super(SCENES.upgrade); }

  init(data: UpgradeSceneData): void {
    this.d = data;
    this.cards = [];
    this.picking = false;
    this.busy = false;
    this.finished = false;
    this.bonusSet = false;
    this.extraDone = false;
    this.choices = [];
  }

  create(): void {
    this.scene.bringToTop();
    const shade = veil(this, 0.88);
    if (!reduced()) {
      shade.setAlpha(0);
      this.tweens.add({ targets: shade, alpha: 0.88, duration: 220 });
    }
    glow(this, W / 2, 112, 760, COLORS.gold, 0.2);
    this.title = this.add.text(W / 2, 100, TITLES[this.d.reason], titleStyle(48)).setOrigin(0.5);
    this.subtitle = label(this, W / 2, 168, 'Choose one upgrade', 34, COLORS.textDim);
    if (!reduced()) {
      this.title.setScale(0.4).setAlpha(0);
      this.tweens.add({ targets: this.title, scale: 1, alpha: 1, duration: 360, ease: 'Back.Out' });
    }

    this.rerollBtn = new Button(this, W / 2, 1170, '', () => void this.onReroll(), {
      width: 560, height: 96, color: 0x3d6e8a, fontSize: 36, icon: { key: ICONS_KEY, frame: 'reroll', scale: 3 },
    });
    this.rerollBtn.setVisible(false);

    this.choices = rollUpgradeChoices(this.d.run, this.d.rng, { minRarity: this.d.minRarity });
    this.deal(this.choices);
    this.updateReroll();
  }

  // ---- cards --------------------------------------------------------------------------------------

  private deal(choices: UpgradeChoice[]): void {
    const n = choices.length;
    const h = Math.min(272, Math.floor((AVAIL_BOTTOM - AVAIL_TOP - (n - 1) * GAP) / n));
    const total = n * h + (n - 1) * GAP;
    const top = AVAIL_TOP + (AVAIL_BOTTOM - AVAIL_TOP - total) / 2;
    this.cards = choices.map((c, i) => this.buildCard(c, W / 2, top + h / 2 + i * (h + GAP), CARD_W, h, i, n >= 4));
  }

  private buildCard(choice: UpgradeChoice, x: number, y: number, w: number, h: number, index: number, compact: boolean): CardView {
    const def = choice.def;
    const rc = RARITY_COLOR[def.rarity];
    const outer = this.add.container(x, y);
    const face = this.add.container(0, 0);

    // Rarity glow sits behind the card (not part of the flipping face).
    const glowAlpha = { common: 0, rare: 0.2, epic: 0.34, legendary: 0.5 }[def.rarity];
    const aura = glow(this, 0, 0, w + 150, rc, glowAlpha);
    aura.setDisplaySize(w + 150, h + 150).setVisible(false);
    outer.add(aura);

    // Back of the card (face down) ...
    const back = this.add.container(0, 0);
    const bg = this.add.graphics();
    drawBox(bg, -w / 2, -h / 2, w, h, 0x241833, 0x6a5a8c);
    back.add([bg, this.add.text(0, -4, '?', titleStyle(Math.min(120, h * 0.45), 0x6a5a8c)).setOrigin(0.5)]);

    // ... and the front.
    const front = this.add.container(0, 0).setVisible(false);
    const fg = this.add.graphics();
    drawBox(fg, -w / 2, -h / 2, w, h, mix(0x1f1629, rc, 0.1), mix(COLORS.panelLight, rc, 0.55));
    fg.fillStyle(rc, 0.16).fillRoundedRect(-w / 2 + 8, -h / 2 + 8, w - 16, compact ? 44 : 50, 8);
    fg.lineStyle(5, rc, 0.95).strokeRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, 9);
    front.add(fg);

    // Icon plate.
    const plate = this.add.graphics();
    const ps = compact ? 104 : 128;
    const px = -w / 2 + 28 + ps / 2;
    plate.fillStyle(COLORS.outline, 1).fillRoundedRect(px - ps / 2 - 4, -ps / 2 - 4, ps + 8, ps + 8, 16);
    plate.fillStyle(mix(0x120b1a, rc, 0.22), 1).fillRoundedRect(px - ps / 2, -ps / 2, ps, ps, 12);
    plate.lineStyle(3, rc, 0.8).strokeRoundedRect(px - ps / 2 + 2, -ps / 2 + 2, ps - 4, ps - 4, 10);
    const icon = this.add.image(px, 0, ICONS_KEY, def.icon).setScale(compact ? 5 : 6);
    front.add([plate, icon]);

    // Text block.
    const left = -w / 2 + 28 + ps + 28;
    const textW = w / 2 - 24 - left;
    const topY = -h / 2;
    front.add(this.add.text(left, topY + 26, RARITY_LABEL[def.rarity], textStyle(28, mix(rc, 0xffffff, 0.3), { align: 'left' })).setOrigin(0, 0.5));
    front.add(this.add.text(left, topY + (compact ? 54 : 62), def.name, textStyle(compact ? 40 : 46, COLORS.text, { align: 'left', wordWrap: { width: textW } })).setOrigin(0, 0));
    const desc = this.add.text(left, topY + (compact ? 98 : 118), def.desc, textStyle(compact ? 28 : 32, 0xd8cfe0, { align: 'left', wordWrap: { width: textW } })).setOrigin(0, 0);
    front.add(desc);

    // Top-right badge: NEW WEAPON / INSTANT / NEW / Lv a -> b.
    const right = w / 2 - 24;
    if (def.grantsWeapon) {
      const b = chip(this, 0, topY + 26, 'NEW WEAPON', 0xb8741a, { textColor: 0xfff0c0, height: 40 });
      b.setX(right - b.width / 2);
      front.add(b);
    } else if (def.onPick) {
      const b = chip(this, 0, topY + 26, 'INSTANT', 0x3d6e8a, { height: 40 });
      b.setX(right - b.width / 2);
      front.add(b);
    } else if (choice.nextLevel === 1) {
      const b = chip(this, 0, topY + 26, 'NEW', 0x2f8f4e, { height: 40 });
      b.setX(right - b.width / 2);
      front.add(b);
    } else {
      front.add(this.add.text(right, topY + 26, `Lv ${choice.nextLevel - 1} → ${choice.nextLevel}`, textStyle(30, COLORS.gold, { align: 'right' })).setOrigin(1, 0.5));
    }

    // Bottom row: level pips on the left, synergy hints on the right.
    const rowY = h / 2 - (compact ? 32 : 40);
    let pipsW = 0;
    if (def.maxLevel > 1 && !def.onPick) {
      const size = def.maxLevel > 5 ? 16 : 22;
      const pips = new Pips(this, left, rowY, choice.nextLevel - 1, def.maxLevel, size, 6, rc);
      pips.highlight(choice.nextLevel - 1, rc);
      front.add(pips);
      pipsW = pips.span + 16;
    }
    let cx = right;
    const hints = choice.synergyHints;
    let shown = 0;
    for (const name of hints) {
      const c = chip(this, 0, rowY, name, 0x4a2f6a, { icon: 'lightning', textColor: COLORS.gold, height: 40, size: 28 });
      if (cx - c.width < left + pipsW || shown >= 2) { c.destroy(); break; }
      c.setX(cx - c.width / 2);
      cx -= c.width + 10;
      front.add(c);
      shown += 1;
    }
    if (shown < hints.length && shown > 0) {
      // not enough room for the rest: a small "+N" so the hint is not silently dropped
      const more = this.add.text(cx - 4, rowY, `+${hints.length - shown}`, textStyle(28, COLORS.gold)).setOrigin(1, 0.5);
      front.add(more);
    }

    // Rarity effects live on the front, once it is revealed.
    const flash = this.add.graphics();
    flash.fillStyle(0xffffff, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 12).setAlpha(0);
    front.add(flash);
    face.add([back, front, flash]);
    outer.add(face);
    outer.setData('front', front).setData('back', back).setData('flash', flash).setData('aura', aura);

    // Start face-down, slightly low and transparent, then flip in (staggered).
    const delay = reduced() ? 0 : 140 * index + 80;
    outer.setAlpha(reduced() ? 1 : 0).setY(outer.y + (reduced() ? 0 : 50));
    const targetY = y;
    const reveal = (): void => {
      back.setVisible(false);
      front.setVisible(true);
      aura.setVisible(glowAlpha > 0);
      this.rarityFx(outer, front, aura, def.rarity, w, h);
      if (def.rarity === 'legendary' || def.rarity === 'epic') sparks(this, outer.x, outer.y, rc, 14, 800, 300);
    };
    if (reduced()) {
      reveal();
    } else {
      this.tweens.add({ targets: outer, alpha: 1, y: targetY, duration: 220, delay, ease: 'Back.Out' });
      this.time.delayedCall(delay + 120, () => {
        services.audio.play('cardFlip', { rate: 0.95 + index * 0.06 });
        this.tweens.add({
          targets: face, scaleX: 0, duration: 130, ease: 'Sine.In',
          onComplete: () => {
            reveal();
            this.tweens.add({ targets: face, scaleX: 1, duration: 190, ease: 'Back.Out' });
          },
        });
      });
    }

    // Tap target: live after the flip and never before INPUT_DELAY.
    const enableAt = Math.max(INPUT_DELAY, delay + 120 + 320);
    outer.setSize(w, h);
    this.time.delayedCall(enableAt, () => {
      if (!outer.active) return;
      outer.setInteractive({ useHandCursor: true });
      outer.on('pointerup', (p: Phaser.Input.Pointer) => {
        if (p.getDistance() > 24) return;
        this.pick(choice);
      });
      outer.on('pointerover', () => { if (!this.picking && !reduced()) this.tweens.add({ targets: outer, scale: 1.02, duration: 100 }); });
      outer.on('pointerout', () => { if (!this.picking && !reduced()) this.tweens.add({ targets: outer, scale: 1, duration: 100 }); });
    });

    return { choice, outer, face, w, h };
  }

  private rarityFx(outer: Phaser.GameObjects.Container, front: Phaser.GameObjects.Container, aura: Phaser.GameObjects.Image, rarity: Rarity, w: number, h: number): void {
    if (reduced()) return;
    const rc = RARITY_COLOR[rarity];
    if (rarity === 'epic' || rarity === 'legendary') {
      this.tweens.add({
        targets: aura, alpha: { from: aura.alpha, to: aura.alpha * (rarity === 'legendary' ? 0.55 : 0.5) },
        duration: rarity === 'legendary' ? 700 : 1100, yoyo: true, repeat: -1, ease: 'Sine.InOut',
      });
      // Pulsing rim light.
      const rim = this.add.graphics();
      rim.lineStyle(8, rc, 0.55).strokeRoundedRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4, 14);
      front.add(rim);
      this.tweens.add({ targets: rim, alpha: { from: 0.2, to: 1 }, duration: rarity === 'legendary' ? 650 : 1000, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    }
    if (rarity === 'legendary') {
      addSheen(this, front, -w / 2, -h / 2, w, h, { period: 2200, alpha: 0.5, bandWidth: 130, delay: 200 });
      const sparkle = this.add.particles(0, 0, EXTRA_KEY, {
        frame: 'spark',
        lifespan: 1000,
        frequency: 130,
        quantity: 1,
        speedY: { min: -46, max: -12 },
        speedX: { min: -14, max: 14 },
        scale: { start: 2.2, end: 0 },
        alpha: { start: 1, end: 0 },
        tint: [0xffd24a, 0xffffff, 0xff9a2a],
        blendMode: 'ADD',
        emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-w / 2 + 10, -h / 2 + 10, w - 20, h - 20), quantity: 1 },
      });
      outer.add(sparkle);
    }
  }

  // ---- picking ------------------------------------------------------------------------------------

  private pick(choice: UpgradeChoice): void {
    if (this.picking || this.busy || this.finished) return;
    this.picking = true;
    this.rerollBtn.setVisible(false);
    services.audio.play('upgradePick');
    const res = applyUpgrade(this.d.run, choice.def.id);

    const chosen = this.cards.find((c) => c.choice === choice);
    const rc = RARITY_COLOR[choice.def.rarity];
    for (const c of this.cards) {
      if (c === chosen) continue;
      this.tweens.add({
        targets: c.outer, y: c.outer.y + 520, alpha: 0, angle: Phaser.Math.Between(-7, 7),
        duration: reduced() ? 1 : 420, delay: reduced() ? 0 : Phaser.Math.Between(0, 90), ease: 'Back.In',
      });
    }
    if (chosen) {
      const flash = chosen.outer.getData('flash') as Phaser.GameObjects.Graphics;
      this.tweens.add({ targets: chosen.outer, scale: 1.07, duration: 160, ease: 'Back.Out' });
      this.tweens.add({ targets: flash, alpha: { from: 0.85, to: 0 }, duration: 380 });
      sparks(this, chosen.outer.x, chosen.outer.y, rc, 28, 9000, 520);
      sparks(this, chosen.outer.x, chosen.outer.y, 0xffffff, 12, 9000, 300);
    }
    const hold = reduced() ? 120 : 720;
    this.time.delayedCall(hold, () => {
      if (chosen) {
        this.tweens.add({ targets: chosen.outer, alpha: 0, scale: 1.18, duration: reduced() ? 1 : 240, ease: 'Quad.In' });
      }
      this.time.delayedCall(reduced() ? 10 : 260, () => void this.afterPick(res.newSynergies));
    });
  }

  private async afterPick(newSynergies: SynergyDef[]): Promise<void> {
    this.destroyCards();
    this.title.setVisible(false);
    this.subtitle.setVisible(false);
    for (const syn of newSynergies) await this.synergyBanner(SYNERGY_BY_ID[syn.id] ?? syn);

    const run = this.d.run;
    if (this.d.offerExtra && !this.extraDone && !this.bonusSet) {
      this.extraDone = true;
      const ok = await offerReward(this, 'extraUpgrade', { runId: run.runId, key: String(run.room) }, {
        title: 'Extra Upgrade', desc: 'Pick one more upgrade', icon: 'star', depth: 5000,
      });
      if (ok) {
        this.bonusSet = true;
        this.picking = false;
        this.title.setText(TITLES.bonus).setVisible(true);
        this.subtitle.setVisible(true);
        this.choices = rollUpgradeChoices(run, this.d.rng, {});
        this.deal(this.choices);
        this.updateReroll();
        return;
      }
    }
    this.finish();
  }

  private destroyCards(): void {
    for (const c of this.cards) c.outer.destroy();
    this.cards = [];
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.scene.stop();
    this.d.onDone();
  }

  // ---- synergy banner -----------------------------------------------------------------------------

  private synergyBanner(syn: SynergyDef): Promise<void> {
    return new Promise((resolve) => {
      const evo = !!syn.evolution;
      const color = evo ? 0xff7a2f : COLORS.gold;
      const layer = this.add.container(0, 0).setDepth(3000);
      const shade = this.add.rectangle(W / 2, H / 2, W, H, COLORS.bg, 0.72).setInteractive();
      layer.add(shade);
      const cy = H / 2 - 20;
      const rays = this.add.graphics({ x: W / 2, y: cy });
      rays.fillStyle(color, 0.15);
      for (let i = 0; i < 14; i++) {
        const a0 = (i / 14) * Math.PI * 2;
        const a1 = a0 + Math.PI / 14;
        rays.beginPath().moveTo(0, 0).lineTo(Math.cos(a0) * 700, Math.sin(a0) * 700).lineTo(Math.cos(a1) * 700, Math.sin(a1) * 700).closePath().fillPath();
      }
      rays.setBlendMode(Phaser.BlendModes.ADD);
      layer.add([rays, glow(this, W / 2, cy, 820, color, 0.45)]);
      if (!reduced()) this.tweens.add({ targets: rays, angle: 360, duration: 9000, repeat: -1 });

      const head = this.add.text(W / 2, cy - 250, evo ? 'EVOLUTION!' : 'SYNERGY!', titleStyle(evo ? 78 : 70, color)).setOrigin(0.5);
      layer.add(head);

      // The two (or more) upgrades that combine.
      const ids = syn.requires;
      const spacing = 150;
      const startX = W / 2 - ((ids.length - 1) * spacing) / 2;
      ids.forEach((id, i) => {
        const def = UPGRADE_BY_ID[id];
        const plate = this.add.graphics();
        const px = startX + i * spacing;
        plate.fillStyle(COLORS.outline, 1).fillRoundedRect(px - 56, cy - 150 - 56, 112, 112, 16);
        plate.fillStyle(0x2a1d33, 1).fillRoundedRect(px - 52, cy - 150 - 52, 104, 104, 13);
        plate.lineStyle(4, color, 1).strokeRoundedRect(px - 50, cy - 150 - 50, 100, 100, 12);
        const im = this.add.image(px, cy - 150, ICONS_KEY, def?.icon ?? 'star').setScale(5);
        layer.add([plate, im]);
        if (i > 0) layer.add(this.add.text(px - spacing / 2, cy - 150, '+', textStyle(56, COLORS.text)).setOrigin(0.5));
      });

      const name = this.add.text(W / 2, cy - 30, syn.name, textStyle(76, COLORS.text, { wordWrap: { width: 640 } })).setOrigin(0.5);
      const desc = this.add.text(W / 2, cy + 70, syn.desc, textStyle(36, 0xe8dff0, { wordWrap: { width: 580 }, lineSpacing: 6 })).setOrigin(0.5, 0);
      const hint = this.add.text(W / 2, cy + 330, 'Tap to continue', textStyle(30, COLORS.textDim)).setOrigin(0.5).setAlpha(0);
      layer.add([name, desc, hint]);

      services.audio.play('synergy');
      sparks(this, W / 2, cy - 30, color, 40, 3100, 620);
      confetti(this, W / 2, cy - 380, 640, [color, 0xffffff, COLORS.epic], 40, 3100);
      if (!reduced()) {
        this.cameras.main.flash(180, 255, 240, 200, false);
        head.setScale(2.6).setAlpha(0);
        this.tweens.add({ targets: head, scale: 1, alpha: 1, duration: 380, ease: 'Back.Out' });
        name.setScale(0.3).setAlpha(0);
        this.tweens.add({ targets: name, scale: 1, alpha: 1, duration: 420, delay: 140, ease: 'Back.Out' });
        desc.setAlpha(0);
        this.tweens.add({ targets: desc, alpha: 1, duration: 320, delay: 360 });
        this.tweens.add({ targets: head, scale: 1.05, duration: 600, yoyo: true, repeat: -1, delay: 500, ease: 'Sine.InOut' });
      }

      let closing = false;
      const close = (): void => {
        if (closing) return;
        closing = true;
        this.tweens.add({
          targets: layer, alpha: 0, duration: reduced() ? 1 : 220,
          onComplete: () => { layer.destroy(); resolve(); },
        });
      };
      this.time.delayedCall(reduced() ? 300 : 650, () => {
        hint.setAlpha(1);
        shade.on('pointerup', close);
      });
      this.time.delayedCall(reduced() ? 1800 : 2600, close);
    });
  }

  // ---- reroll -------------------------------------------------------------------------------------

  /** Shows the right reroll button for the current state, or hides it. */
  private updateReroll(): void {
    const run = this.d.run;
    if (this.picking || this.finished) {
      this.rerollBtn.setVisible(false);
      return;
    }
    if (run.rerollsLeft > 0) {
      this.rerollBtn.setText(`Reroll (${run.rerollsLeft})`).setColor(0x3d6e8a);
      this.rerollBtn.setVisible(true);
      return;
    }
    const text = rewardButtonText('reroll', { runId: run.runId, key: String(run.room) });
    if (text) {
      this.rerollBtn.setText(`Reroll  ${text}`).setColor(0x2f8f4e);
      this.rerollBtn.setVisible(true);
    } else {
      this.rerollBtn.setVisible(false);
    }
  }

  private async onReroll(): Promise<void> {
    if (this.busy || this.picking || this.finished) return;
    const run = this.d.run;
    this.busy = true;
    this.rerollBtn.setEnabled(false);
    let ok = false;
    if (run.rerollsLeft > 0) {
      run.rerollsLeft -= 1;
      ok = true;
    } else {
      ok = await claimReward(this, 'reroll', { runId: run.runId, key: String(run.room) });
    }
    if (!ok || this.finished || this.picking) {
      this.busy = false;
      this.rerollBtn.setEnabled(true);
      this.updateReroll();
      return;
    }
    // Old cards flip away, new ones deal in.
    for (const c of this.cards) {
      this.tweens.add({ targets: c.outer, scaleX: 0, alpha: 0, duration: reduced() ? 1 : 150, ease: 'Sine.In' });
    }
    await new Promise<void>((r) => this.time.delayedCall(reduced() ? 10 : 190, () => r()));
    this.destroyCards();
    this.choices = rollUpgradeChoices(run, this.d.rng, { minRarity: this.bonusSet ? undefined : this.d.minRarity });
    this.deal(this.choices);
    this.busy = false;
    this.rerollBtn.setEnabled(true);
    this.updateReroll();
  }
}

