import Phaser from 'phaser';
import { SYNERGIES } from '../../data/synergies';
import type { WaveModifier } from '../../data/types';
import type { WorldApi } from '../../sim/api';
import { createPill, type UIPill } from '../ui/pill';
import { crispText } from '../ui/text';
import { showToast } from '../ui/toast';
import { PALETTE } from '../ui/theme';
import { D } from './constants';
import { createRoundButton, type RoundButton } from './widgets';

const BAR_X = 62;
const BAR_W = 218;
const BAR_H = 32;
const ROW_Y = 40;

interface Badge {
  c: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  icon: Phaser.GameObjects.Image;
  text: Phaser.GameObjects.Text;
}

/** Top bar: castle HP, wave counter, coins, pause, next-wave modifier badges and synergy chips. */
export class Hud {
  private readonly hpGfx: Phaser.GameObjects.Graphics;
  private readonly hpText: Phaser.GameObjects.Text;
  private readonly heart: Phaser.GameObjects.Image;
  private readonly wave: Phaser.GameObjects.Container;
  private readonly waveGfx: Phaser.GameObjects.Graphics;
  private readonly waveText: Phaser.GameObjects.Text;
  private readonly skull: Phaser.GameObjects.Image;
  private readonly coins: UIPill;
  private readonly pause: RoundButton;
  private readonly badges: Badge[] = [];
  private chips: Phaser.GameObjects.Container[] = [];
  private chipKey = '';
  private badgeKey = '';

  private hpShown = 1;
  private hpChunk = 1;
  private chunkHold = 0;
  private lastHp = -1;
  private lastMax = -1;
  private waveKey = '';
  private coinsShown = 0;
  private coinsTarget = 0;
  private coinsPending = 0;

  constructor(private readonly scene: Phaser.Scene, host: { openPause(): void }) {
    const fixed = <T extends Phaser.GameObjects.GameObject>(o: T): T => { (o as unknown as { setScrollFactor(v: number): void }).setScrollFactor(0); return o; };

    // soft top fade so HUD reads over the grass and the cave
    const fade = scene.add.graphics().setDepth(D.hud - 1).setScrollFactor(0);
    for (let i = 0; i < 6; i++) fade.fillStyle(0x0b1020, 0.38 - i * 0.06).fillRect(0, 0, 720, 86 - i * 12);

    this.hpGfx = fixed(scene.add.graphics().setDepth(D.hud));
    this.hpText = fixed(crispText(scene, BAR_X + BAR_W / 2, ROW_Y, '', { preset: 'number', size: 22, strokeThickness: 5 }).setDepth(D.hud + 1));
    this.heart = fixed(scene.add.image(38, ROW_Y - 1, 'icon_heart').setDisplaySize(54, 54).setDepth(D.hud + 2));

    this.waveGfx = scene.add.graphics();
    this.skull = scene.add.image(-52, 0, 'icon_skull').setDisplaySize(34, 34).setVisible(false);
    this.waveText = crispText(scene, 0, 1, 'WAVE 1', { preset: 'heading', size: 24, strokeThickness: 6 });
    this.wave = fixed(scene.add.container(362, ROW_Y, [this.waveGfx, this.skull, this.waveText]).setDepth(D.hud));

    this.coins = createPill(scene, 622, ROW_Y, { icon: 'icon_coin', value: 0, height: 54, align: 'right', depth: D.hud });
    this.coins.container.setScrollFactor(0);

    this.pause = createRoundButton(scene, 678, ROW_Y, 56, () => host.openPause(), D.hud);
    this.pause.container.setScrollFactor(0);
    this.pause.paint(0x5a6bb8, 0x3d4a94, 0x232b5c);
    const bars = scene.add.graphics();
    bars.fillStyle(PALETTE.outline, 1).fillRoundedRect(-14, -14, 11, 28, 4).fillRoundedRect(3, -14, 11, 28, 4);
    bars.fillStyle(0xffffff, 1).fillRoundedRect(-12, -12, 7, 24, 3).fillRoundedRect(5, -12, 7, 24, 3);
    this.pause.container.add(bars);
    this.pause.container.bringToTop(this.pause.container.list[1]);
  }

  /** Where a flying coin should land. */
  coinPoint(): { x: number; y: number } {
    return this.coins.iconPoint();
  }

  /** A coin sprite arrived: bump the pill. */
  coinArrived(): void {
    this.coins.pulse();
  }

  /** Coins that are on their way to the pill (shown only after they land, so the count feels earned). */
  holdCoins(n: number): void { this.coinsPending += n; }
  releaseCoins(n: number): void { this.coinsPending = Math.max(0, this.coinsPending - n); }

  update(world: WorldApi, dt: number, time: number): void {
    this.updateHp(world, dt, time);
    this.updateWave(world, time);
    this.updateCoins(world, dt);
    this.updateBadges(world.nextWaveModifier);
    this.updateChips(world);
  }

  private updateHp(world: WorldApi, dt: number, time: number): void {
    const max = Math.max(1, world.castleMaxHp);
    const hp = Math.max(0, world.castleHp);
    const ratio = hp / max;
    if (hp < this.lastHp) {
      this.chunkHold = 0.4;
      this.heart.setScale(this.heart.scale * 1.25);
    }
    let dirty = hp !== this.lastHp || max !== this.lastMax;
    if (this.lastHp < 0) { this.hpShown = this.hpChunk = ratio; dirty = true; }
    this.lastHp = hp;
    this.lastMax = max;
    const k = 1 - Math.exp(-dt * 12);
    if (Math.abs(this.hpShown - ratio) > 0.0005) { this.hpShown += (ratio - this.hpShown) * k; dirty = true; }
    if (this.chunkHold > 0) this.chunkHold -= dt;
    else if (Math.abs(this.hpChunk - this.hpShown) > 0.0005) { this.hpChunk += (this.hpShown - this.hpChunk) * (1 - Math.exp(-dt * 5)); dirty = true; }
    const low = ratio < 0.3;
    if (dirty || low) this.drawHp(ratio, low, time);
    const hs = this.heart.scaleX;
    const target = 54 / this.heart.frame.width * (low ? 1 + 0.08 * Math.sin(time * 8) : 1);
    this.heart.setScale(hs + (target - hs) * 0.25);
    if (dirty) this.hpText.setText(`${Math.ceil(hp)} / ${max}`);
  }

  private drawHp(ratio: number, low: boolean, time: number): void {
    const g = this.hpGfx;
    g.clear();
    const x = BAR_X;
    const y = ROW_Y - BAR_H / 2;
    g.fillStyle(PALETTE.outline, 1).fillRoundedRect(x - 4, y - 4, BAR_W + 8, BAR_H + 8, BAR_H / 2 + 4);
    g.fillStyle(0x3b1b28, 1).fillRoundedRect(x, y, BAR_W, BAR_H, BAR_H / 2);
    const chunkW = Math.max(0, (BAR_W - 4) * this.hpChunk);
    if (chunkW > 2) g.fillStyle(0xffe8e0, 1).fillRoundedRect(x + 2, y + 2, chunkW, BAR_H - 4, (BAR_H - 4) / 2);
    const fw = Math.max(0, (BAR_W - 4) * this.hpShown);
    if (fw > 2) {
      const col = ratio > 0.5 ? 0x5ed06a : ratio > 0.25 ? 0xf5c542 : 0xff4a3f;
      const a = low ? 0.75 + 0.25 * Math.sin(time * 9) : 1;
      g.fillStyle(col, a).fillRoundedRect(x + 2, y + 2, fw, BAR_H - 4, (BAR_H - 4) / 2);
      g.fillStyle(0xffffff, 0.32).fillRoundedRect(x + 2 + 8, y + 5, Math.max(0, fw - 16), 6, 3);
    }
  }

  private updateWave(world: WorldApi, time: number): void {
    const boss = world.isBossWave;
    const key = `${world.wave}:${boss}`;
    if (key !== this.waveKey) {
      this.waveKey = key;
      this.waveText.setText(`WAVE ${world.wave}`);
      const w = this.waveText.width + (boss ? 44 : 0) + 34;
      const h = 54;
      const g = this.waveGfx;
      g.clear();
      g.fillStyle(PALETTE.shadow, 0.3).fillRoundedRect(-w / 2, -h / 2 + 5, w, h, h / 2);
      g.fillStyle(PALETTE.outline, 1).fillRoundedRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, h / 2 + 3);
      g.fillStyle(boss ? 0xff4a3f : 0x6a7bd0, 1).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      g.fillStyle(boss ? 0x5a1620 : PALETTE.panelDark, 1).fillRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8, h / 2 - 4);
      this.skull.setVisible(boss).setPosition(-w / 2 + 34, 0);
      this.waveText.setX(boss ? 20 : 0);
      this.scene.tweens.killTweensOf(this.wave);
      this.wave.setScale(1);
      this.scene.tweens.add({ targets: this.wave, scale: { from: 1.25, to: 1 }, duration: 260, ease: 'Back.Out' });
    }
    if (boss) this.skull.setScale((34 / this.skull.frame.width) * (1 + 0.1 * Math.sin(time * 6)));
  }

  private updateCoins(world: WorldApi, dt: number): void {
    const target = Math.max(0, world.coins - this.coinsPending);
    if (target < this.coinsTarget) { this.coinsShown = target; this.coins.setValue(target); }
    this.coinsTarget = target;
    if (this.coinsShown < target) {
      const step = Math.max(1, Math.ceil((target - this.coinsShown) * Math.min(1, dt * 9)));
      this.coinsShown = Math.min(target, this.coinsShown + step);
      this.coins.setValue(this.coinsShown);
    } else if (this.coinsShown > target) {
      this.coinsShown = target;
      this.coins.setValue(target);
    }
  }

  private mkBadge(): Badge {
    const bg = this.scene.add.graphics();
    const icon = this.scene.add.image(-22, 0, 'icon_skull').setDisplaySize(30, 30);
    const text = crispText(this.scene, 12, 1, '', { preset: 'small', size: 20, strokeThickness: 4 });
    const c = this.scene.add.container(0, 0, [bg, icon, text]).setDepth(D.hud).setScrollFactor(0).setVisible(false);
    return { c, bg, icon, text };
  }

  private updateBadges(mod: WaveModifier | null): void {
    const key = mod ? JSON.stringify(mod) : '';
    if (key === this.badgeKey) return;
    this.badgeKey = key;
    const items: Array<{ icon: string; label: string; good: boolean }> = [];
    if (mod) {
      const pct = (m: number) => `${m >= 1 ? '+' : '-'}${Math.round(Math.abs(m - 1) * 100)}%`;
      if (mod.enemyHpMult && mod.enemyHpMult !== 1) items.push({ icon: 'icon_heart', label: pct(mod.enemyHpMult), good: mod.enemyHpMult < 1 });
      if (mod.enemySpeedMult && mod.enemySpeedMult !== 1) items.push({ icon: 'icon_speed', label: pct(mod.enemySpeedMult), good: mod.enemySpeedMult < 1 });
      if (mod.enemyCountMult && mod.enemyCountMult !== 1) items.push({ icon: 'icon_skull', label: pct(mod.enemyCountMult), good: mod.enemyCountMult < 1 });
      if (mod.coinMult && mod.coinMult !== 1) items.push({ icon: 'icon_coin', label: pct(mod.coinMult), good: mod.coinMult > 1 });
      if (mod.eliteChance) items.push({ icon: 'icon_elite', label: `${Math.round(mod.eliteChance * 100)}%`, good: false });
    }
    while (this.badges.length < items.length) this.badges.push(this.mkBadge());
    let x = 704;
    for (let i = 0; i < this.badges.length; i++) {
      const b = this.badges[i];
      const it = items[i];
      if (!it) { b.c.setVisible(false); continue; }
      b.icon.setTexture(it.icon).setDisplaySize(30, 30);
      b.text.setText(it.label);
      const w = 30 + b.text.width + 24;
      b.bg.clear();
      b.bg.fillStyle(PALETTE.outline, 1).fillRoundedRect(-w / 2 - 3, -20, w + 6, 40, 20);
      b.bg.fillStyle(it.good ? 0x2f6a3a : 0x6a2a34, 1).fillRoundedRect(-w / 2, -17, w, 34, 17);
      b.icon.setX(-w / 2 + 22);
      b.text.setX(-w / 2 + 22 + 15 + b.text.width / 2);
      x -= w / 2;
      b.c.setPosition(x, 92).setVisible(true);
      x -= w / 2 + 8;
    }
  }

  private updateChips(world: WorldApi): void {
    const key = world.activeSynergies.join('|');
    if (key === this.chipKey) return;
    const fresh = this.chipKey === '' ? new Set<string>() : new Set(world.activeSynergies.filter((id) => !this.chipKey.split('|').includes(id)));
    this.chipKey = key;
    for (const c of this.chips) c.destroy();
    this.chips = [];
    const MAX_CHIPS = 9;
    world.activeSynergies.slice(0, MAX_CHIPS).forEach((id, i) => {
      const def = SYNERGIES.find((s) => s.id === id);
      if (!def) return;
      const bg = this.scene.add.graphics();
      bg.fillStyle(PALETTE.outline, 1).fillCircle(0, 0, 23);
      bg.fillStyle(0xb35cff, 1).fillCircle(0, 0, 20);
      bg.fillStyle(PALETTE.panelDark, 1).fillCircle(0, 0, 16.5);
      const icon = this.scene.add.image(0, 0, `icon_${def.icon}`).setDisplaySize(28, 28);
      const zone = this.scene.add.zone(0, 0, 51, 66).setInteractive({ useHandCursor: true });
      const c = this.scene.add.container(200 + i * 51, 92, [bg, icon, zone]).setDepth(D.hud).setScrollFactor(0);
      zone.on('pointerdown', () => {
        showToast(this.scene, `${def.name}: ${def.description}`, { icon: `icon_${def.icon}`, kind: 'info', duration: 2600, y: 190 });
      });
      if (fresh.has(id)) this.scene.tweens.add({ targets: c, scale: { from: 1.8, to: 1 }, duration: 380, ease: 'Back.Out' });
      this.chips.push(c);
    });
  }

  destroy(): void {
    this.hpGfx.destroy();
    this.hpText.destroy();
    this.heart.destroy();
    this.wave.destroy();
    this.coins.destroy();
    this.pause.destroy();
    for (const b of this.badges) b.c.destroy();
    for (const c of this.chips) c.destroy();
  }
}
