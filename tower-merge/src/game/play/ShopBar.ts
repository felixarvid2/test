import Phaser from 'phaser';
import type { AbilityId } from '../../data/types';
import type { WorldApi } from '../../sim/api';
import { createButton, type UIButton } from '../ui/button';
import { createPill, type UIPill } from '../ui/pill';
import { crispText } from '../ui/text';
import { PALETTE } from '../ui/theme';
import { D } from './constants';
import { abilityButtonXs } from './logic';
import { TEX } from './textures';
import { createRoundButton, type RoundButton } from './widgets';

const START_Y = 1076;
const BUY_Y = 1203;

export interface ShopHost {
  buy(): void;
  startWave(): void;
  useAbility(id: AbilityId): boolean;
  toggleSpeed(): number;
  denied(what: 'coins' | 'ability' | 'full'): void;
}

interface AbilityBtn {
  id: AbilityId;
  btn: RoundButton;
  sweep: Phaser.GameObjects.Graphics;
  glow: Phaser.GameObjects.Image;
  icon: Phaser.GameObjects.Image;
  text: Phaser.GameObjects.Text;
  ready: boolean;
  lastKey: string;
}

/** Bottom bar: BUY, START WAVE with countdown, ability buttons with cooldown sweeps, fast-forward. */
export class ShopBar {
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly buyWrap: Phaser.GameObjects.Container;
  private readonly buy: UIButton;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly start: UIButton;
  private readonly startWrap: Phaser.GameObjects.Container;
  private readonly ff: RoundButton;
  private readonly ffText: Phaser.GameObjects.Text;
  private readonly left: UIPill;
  private abilities: AbilityBtn[] = [];
  private abilityKey = '';
  private buyState = '';
  private affordable = false;
  private leftShown = -1;
  private countShown = -1;
  private readonly count: Phaser.GameObjects.Text;
  /** Tutorial: gently throb the BUY button. */
  emphasizeBuy = false;

  constructor(private readonly scene: Phaser.Scene, private readonly host: ShopHost) {
    const fixed = <T extends Phaser.GameObjects.GameObject>(o: T): T => { (o as unknown as { setScrollFactor(v: number): void }).setScrollFactor(0); return o; };
    this.panel = fixed(scene.add.graphics().setDepth(D.shop - 1));
    const g = this.panel;
    g.fillStyle(0x000000, 0.28).fillRoundedRect(-30, 1026, 780, 300, 36);
    g.fillStyle(PALETTE.outline, 1).fillRoundedRect(-30, 1032, 780, 300, 36);
    g.fillStyle(0x1d2548, 1).fillRoundedRect(-30, 1038, 780, 300, 34);
    g.fillStyle(0xffffff, 0.07).fillRoundedRect(-18, 1044, 756, 26, 14);

    this.start = createButton(scene, 0, 0, {
      label: 'START WAVE', icon: TEX.tri, width: 336, height: 84, fontSize: 32, style: 'primary', depth: D.shop,
      onClick: () => host.startWave(),
    });
    this.startWrap = fixed(scene.add.container(360, START_Y, [this.start.container]).setDepth(D.shop));
    this.start.container.setDepth(0);
    const cg = scene.add.graphics();
    cg.fillStyle(PALETTE.outline, 1).fillCircle(0, 0, 29).fillStyle(0x1d2548, 1).fillCircle(0, 0, 24);
    this.count = crispText(scene, 0, 1, '', { preset: 'number', size: 30, strokeThickness: 5 });
    this.startWrap.add([cg, this.count]);
    this.start.container.setX(14);
    cg.setPosition(-182, 0);
    this.count.setPosition(-182, 1);

    this.buy = createButton(scene, 0, 0, {
      label: 'BUY', icon: 'icon_coin', width: 280, height: 112, fontSize: 44, style: 'success', depth: D.shop,
      onClick: () => host.buy(),
    });
    this.buyWrap = fixed(scene.add.container(360, BUY_Y, [this.buy.container]).setDepth(D.shop));
    this.buy.container.setDepth(0);

    this.hint = fixed(crispText(scene, 360, 1139, 'Board full - merge towers!', { preset: 'body', size: 26, colorNum: 0xffd35e }).setDepth(D.shop).setVisible(false));

    this.ff = createRoundButton(scene, 646, START_Y, 66, () => this.onFast(), D.shop);
    this.ff.container.setScrollFactor(0);
    this.ff.paint(0x5a6bb8, 0x3d4a94, 0x232b5c);
    this.ffText = crispText(scene, 0, -1, 'x1', { preset: 'body', size: 30, strokeThickness: 5 });
    this.ff.container.add(this.ffText);

    this.left = createPill(scene, 360, START_Y, { icon: 'icon_skull', value: 0, height: 56, align: 'center', depth: D.shop, color: 0xff6a5a });
    this.left.container.setScrollFactor(0).setVisible(false);
  }

  private onFast(): void {
    const s = this.host.toggleSpeed();
    this.ffText.setText(`x${s}`);
    this.scene.tweens.add({ targets: this.ff.container, scale: { from: 1.18, to: 1 }, duration: 200, ease: 'Back.Out' });
  }

  setSpeedLabel(speed: number): void {
    this.ffText.setText(`x${speed}`);
  }

  private abilityUnits(world: WorldApi): void {
    const key = world.abilities.map((a) => a.id).join('|');
    if (key === this.abilityKey) return;
    this.abilityKey = key;
    for (const a of this.abilities) { a.btn.destroy(); a.glow.destroy(); }
    this.abilities = [];
    const xs = abilityButtonXs(world.abilities.length);
    world.abilities.forEach((ab, i) => {
      const size = 92;
      const glow = this.scene.add.image(xs[i], BUY_Y, 'fx_glow').setDepth(D.shop - 0.5).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd35e)
        .setScrollFactor(0).setVisible(false);
      const btn = createRoundButton(this.scene, xs[i], BUY_Y, size, () => {
        if (!this.host.useAbility(ab.id)) this.host.denied('ability');
      }, D.shop);
      btn.container.setScrollFactor(0);
      const icon = this.scene.add.image(0, 0, `icon_${ab.id}`).setDisplaySize(58, 58);
      const sweep = this.scene.add.graphics();
      const text = crispText(this.scene, 0, 0, '', { preset: 'number', size: 28, strokeThickness: 6 });
      btn.container.add([icon, sweep, text]);
      this.abilities.push({ id: ab.id, btn, sweep, glow, icon, text, ready: true, lastKey: '' });
    });
  }

  update(world: WorldApi, dt: number, time: number, speed: number): void {
    this.ffText.setText(`x${speed}`);
    const phase = world.phase;
    const live = phase === 'wave' || phase === 'prewave';

    // BUY
    const cost = world.buyCost();
    const hasFree = world.slots.some((s) => s.unlocked && !s.tower);
    const canAfford = world.coins >= cost;
    const ok = canAfford && hasFree && live;
    const state = `${cost}|${ok}`;
    if (state !== this.buyState) {
      this.buyState = state;
      this.buy.setLabel(`BUY ${cost}`);
      this.buy.setStyle(ok ? 'success' : 'ghost');
      this.buy.container.setAlpha(ok ? 1 : 0.85);
      if (ok && !this.affordable) this.scene.tweens.add({ targets: this.buyWrap, scale: { from: 1.14, to: 1 }, duration: 240, ease: 'Back.Out' });
      this.affordable = ok;
    }
    if (ok) {
      const k = this.emphasizeBuy ? 0.06 : 0.018;
      if (!this.scene.tweens.isTweening(this.buyWrap)) this.buyWrap.setScale(1 + k * Math.sin(time * (this.emphasizeBuy ? 7 : 4)));
    } else if (!this.scene.tweens.isTweening(this.buyWrap)) {
      this.buyWrap.setScale(1);
    }
    const full = !hasFree && live;
    this.hint.setVisible(full);
    if (full) this.hint.setScale(1 + 0.06 * Math.sin(time * 7)).setAlpha(0.8 + 0.2 * Math.sin(time * 7));

    // START WAVE / enemies left
    const pre = phase === 'prewave';
    this.startWrap.setVisible(pre);
    if (pre) {
      const sec = Math.ceil(world.prewaveTime);
      if (sec !== this.countShown) { this.countShown = sec; this.count.setText(String(Math.max(0, sec))); }
      this.startWrap.setScale(1 + 0.02 * Math.sin(time * 5));
    }
    this.left.container.setVisible(phase === 'wave');
    if (phase === 'wave') {
      let n = 0;
      const list = world.enemies;
      for (let i = 0; i < list.length; i++) if (list[i].active) n++;
      if (n !== this.leftShown) { this.leftShown = n; this.left.setText(`${n} left`); }
    }

    // abilities
    this.abilityUnits(world);
    for (let i = 0; i < this.abilities.length; i++) this.drawAbility(this.abilities[i], world.abilities[i], live, dt, time);
  }

  private drawAbility(a: AbilityBtn, st: WorldApi['abilities'][number], live: boolean, _dt: number, time: number): void {
    const cd = st.cooldown;
    const readyNow = cd <= 0 && live;
    const active = st.activeTime > 0;
    const r = a.btn.size / 2;
    const key = `${Math.ceil(cd * 4)}|${active}|${readyNow}`;
    if (readyNow && !a.ready) {
      this.scene.tweens.add({ targets: a.btn.container, scale: { from: 1.3, to: 1 }, duration: 320, ease: 'Back.Out' });
    }
    a.ready = readyNow;
    if (key !== a.lastKey || active || readyNow) {
      a.lastKey = key;
      if (active) a.btn.paint(0x7ee27a, 0x37a84a, 0x1e6b2c);
      else if (readyNow) a.btn.paint(0xffd35e, 0xf0a020, 0x9a5a10);
      else a.btn.paint(0x4a5380, 0x343b66, 0x1e2347);
      const g = a.sweep;
      g.clear();
      if (cd > 0 && st.maxCooldown > 0) {
        const frac = Math.min(1, cd / st.maxCooldown);
        g.fillStyle(0x0b1020, 0.62);
        g.beginPath();
        g.moveTo(0, 0);
        g.arc(0, 0, r - 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac, false);
        g.closePath();
        g.fillPath();
      }
      if (active) {
        g.lineStyle(5, 0xffffff, 0.9).beginPath()
          .arc(0, 0, r - 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, st.activeTime / 6), false).strokePath();
      }
      a.text.setText(cd > 0 ? String(Math.ceil(cd)) : '');
      a.icon.setAlpha(cd > 0 ? 0.6 : 1);
    }
    a.glow.setVisible(readyNow);
    if (readyNow) a.glow.setScale((150 + 16 * Math.sin(time * 6)) / a.glow.frame.width).setAlpha(0.5 + 0.25 * Math.sin(time * 6));
  }

  /** Ability button positions in screen space (for flying effects). */
  shake(target: 'buy' | 'start'): void {
    const o = target === 'buy' ? this.buyWrap : this.startWrap;
    const x = o.x;
    this.scene.tweens.add({ targets: o, x: { from: x - 8, to: x + 8 }, duration: 45, yoyo: true, repeat: 3, onComplete: () => o.setX(x) });
  }

  /** Centre of the BUY button (tutorial hand target). */
  buyPoint(): { x: number; y: number } { return { x: 360, y: BUY_Y }; }

  destroy(): void {
    this.panel.destroy();
    this.start.destroy();
    this.buy.destroy();
    this.startWrap.destroy();
    this.buyWrap.destroy();
    this.hint.destroy();
    this.ff.destroy();
    this.left.destroy();
    for (const a of this.abilities) { a.btn.destroy(); a.glow.destroy(); }
  }
}
