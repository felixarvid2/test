import Phaser from 'phaser';
import { COLORS, ICONS_KEY } from '../assets';
import { services } from '../../services';
import { BALANCE } from '../../config/balance';
import { buyHero } from '../../core/meta';
import { computeStats } from '../../core/stats';
import type { HeroId, UpgradeTag } from '../../core/types';
import { COSMETICS } from '../../data/buffs';
import { HEROES, HERO_IDS } from '../../data/heroes';
import { WEAPONS } from '../../data/weapons';
import { createBackground } from '../ui/background';
import { coinBurst, fmt, glow, heroSprite, reduced, shake, sparks } from '../ui/fx';
import { Button, W, drawBox, fadeInScene, goto, panel, popIn, textStyle, titleStyle } from '../ui/kit';
import { CounterPill, ProgressBar, header } from '../ui/widgets';
import { SCENES } from './keys';

const TAG_LABEL: Record<UpgradeTag, string> = {
  offense: 'Offense', defense: 'Defense', crit: 'Crits', speed: 'Speed', utility: 'Utility', economy: 'Economy',
  melee: 'Melee', projectile: 'Projectiles', elemental: 'Elements', fire: 'Fire', frost: 'Frost',
  lightning: 'Lightning', poison: 'Poison', orbit: 'Orbit', death: 'Death', weapon: 'Weapons',
};

const CARD_Y = 300;
const CARD_W = 208;
const CARD_H = 170;
const PANEL_TOP = 400;
const PANEL_H = 712;

export class HeroSelectScene extends Phaser.Scene {
  private focus: HeroId = 'knight';
  private goldPill!: CounterPill;
  private cards: Record<string, { box: Phaser.GameObjects.Container; bg: Phaser.GameObjects.Graphics; tag: Phaser.GameObjects.Container; sprite: Phaser.GameObjects.Image; lock: Phaser.GameObjects.Image }> = {};
  private detail!: Phaser.GameObjects.Container;
  private action?: Button;

  constructor() { super(SCENES.heroSelect); }

  create(): void {
    const save = services.save.data;
    fadeInScene(this);
    createBackground(this, { dim: 0.78 });
    this.focus = save.selectedHero;
    this.cards = {};

    this.goldPill = new CounterPill(this, W - 20, 60, save.gold, { icon: 'gold', color: COLORS.gold, align: 'right' });
    header(this, 'HEROES', () => goto(this, SCENES.menu));

    HERO_IDS.forEach((id, i) => this.buildCard(id, W / 2 + (i - 1) * (CARD_W + 16)));
    panel(this, W / 2, PANEL_TOP + PANEL_H / 2, 656, PANEL_H, COLORS.panel, COLORS.panelLight);
    this.detail = this.add.container(0, 0);
    this.refreshCards();
    this.renderDetail(false);
  }

  // ---- hero cards (top row) -----------------------------------------------------------------------

  private buildCard(id: HeroId, x: number): void {
    const box = this.add.container(x, CARD_Y);
    const bg = this.add.graphics();
    const sprite = heroSprite(this, 0, 22, id, 5);
    const lock = this.add.image(0, -14, ICONS_KEY, 'lock').setScale(4).setVisible(false);
    const name = this.add.text(0, 58, HEROES[id].name, textStyle(34)).setOrigin(0.5);
    const tag = this.add.container(0, -CARD_H / 2 + 8);
    box.add([bg, sprite, lock, name, tag]);
    box.setSize(CARD_W, CARD_H).setInteractive({ useHandCursor: true });
    box.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.getDistance() > 24 || this.focus === id) return;
      services.audio.play('click');
      this.focus = id;
      this.refreshCards();
      this.time.delayedCall(0, () => this.renderDetail(true));
      if (!reduced()) this.tweens.add({ targets: box, scale: { from: 0.93, to: 1 }, duration: 220, ease: 'Back.Out' });
    });
    this.cards[id] = { box, bg, tag, sprite, lock };
  }

  private refreshCards(): void {
    const save = services.save.data;
    for (const id of HERO_IDS) {
      const c = this.cards[id];
      const owned = save.heroes.includes(id);
      const focused = this.focus === id;
      const selected = save.selectedHero === id;
      c.bg.clear();
      drawBox(c.bg, -CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, focused ? 0x3a2a48 : COLORS.panel, focused ? COLORS.gold : selected ? COLORS.heal : COLORS.panelLight);
      const skin = skinOf(id);
      if (!owned) c.sprite.setTint(0x2a2238);
      else if (skin !== undefined) c.sprite.setTint(skin);
      else c.sprite.clearTint();
      c.lock.setVisible(!owned);
      c.box.setScale(focused ? 1.04 : 1);
      c.tag.removeAll(true);
      if (selected) {
        const t = this.add.text(0, -1, 'SELECTED', textStyle(28, COLORS.bg, { strokeThickness: 0 })).setOrigin(0.5);
        const g = this.add.graphics();
        g.fillStyle(COLORS.outline, 1).fillRoundedRect(-76, -20, 152, 40, 11);
        g.fillStyle(COLORS.heal, 1).fillRoundedRect(-73, -17, 146, 34, 9);
        c.tag.add([g, t]);
      }
    }
  }

  // ---- detail panel -------------------------------------------------------------------------------

  private renderDetail(animate: boolean): void {
    const save = services.save.data;
    const id = this.focus;
    const hero = HEROES[id];
    const weapon = WEAPONS[hero.weapon];
    const owned = save.heroes.includes(id);
    this.detail.removeAll(true);
    this.action = undefined;
    const d = this.detail;
    const L = 56;
    const T = PANEL_TOP;

    // Portrait + name + weapon + blurb.
    d.add(glow(this, 130, T + 138, 220, 0xffc36b, 0.22));
    d.add(this.add.ellipse(130, T + 150, 96, 20, 0x000000, 0.4));
    const spr = heroSprite(this, 130, T + 148, id, 7, owned ? undefined : 0x2a2238);
    d.add(spr);
    if (!owned) d.add(this.add.image(130, T + 100, ICONS_KEY, 'lock').setScale(5));
    d.add(this.add.text(228, T + 18, hero.name.toUpperCase(), titleStyle(46, COLORS.text)).setOrigin(0, 0));
    d.add(this.add.image(246, T + 100, ICONS_KEY, weapon.icon).setScale(3));
    d.add(this.add.text(284, T + 100, `${weapon.name} - ${weapon.kind === 'melee' ? 'melee' : weapon.kind === 'magic' ? 'magic bolts' : 'ranged'}`, textStyle(30, COLORS.gold, { align: 'left' })).setOrigin(0, 0.5));
    d.add(this.add.text(228, T + 130, hero.desc, textStyle(28, COLORS.textDim, { align: 'left', wordWrap: { width: 430 } })).setOrigin(0, 0));

    // Stat bars.
    const stats = computeStats([hero.passive.effects], { ...BALANCE.baseStats, ...hero.base });
    const dps = (weapon.baseDamage * stats.attackSpeedMult * stats.damageMult) / weapon.cooldown;
    const rows: { name: string; p: number; text: string; color: number }[] = [
      { name: 'Health', p: stats.maxHp / 160, text: `${Math.round(stats.maxHp)}`, color: COLORS.hp },
      { name: 'Speed', p: stats.moveSpeed / 240, text: `${Math.round(stats.moveSpeed)}`, color: COLORS.xp },
      { name: 'Damage', p: dps / 30, text: `${Math.round(dps)}`, color: COLORS.fire },
      { name: 'Crit', p: stats.critChance / 0.25, text: `${Math.round(stats.critChance * 100)}%`, color: COLORS.crit },
      { name: 'Magic', p: (stats.elementPower - 0.8) / 1.0, text: `x${stats.elementPower.toFixed(1)}`, color: COLORS.epic },
    ];
    const barsTop = T + 224;
    rows.forEach((r, i) => {
      const y = barsTop + i * 48;
      d.add(this.add.text(L, y, r.name, textStyle(30, COLORS.text, { align: 'left' })).setOrigin(0, 0.5));
      const bar = new ProgressBar(this, L + 140, y - 11, 350, 22, r.color);
      d.add(bar);
      d.add(this.add.text(L + 140 + 350 + 22, y, r.text, textStyle(30, COLORS.text, { align: 'left' })).setOrigin(0, 0.5));
      if (animate && !reduced()) {
        const v = { p: 0 };
        this.tweens.add({ targets: v, p: Phaser.Math.Clamp(r.p, 0.04, 1), duration: 380, delay: i * 50, ease: 'Cubic.Out', onUpdate: () => bar.set(v.p) });
      } else {
        bar.set(Phaser.Math.Clamp(r.p, 0.04, 1));
      }
    });

    // Passive + favoured style.
    const py = barsTop + 4 * 48 + 30;
    d.add(this.add.text(L, py, `Passive: ${hero.passive.name}`, textStyle(34, COLORS.gold, { align: 'left' })).setOrigin(0, 0));
    const pd = this.add.text(L, py + 40, hero.passive.desc, textStyle(28, COLORS.text, { align: 'left', wordWrap: { width: 580 } })).setOrigin(0, 0);
    d.add(pd);
    const tags = hero.favoredTags.slice(0, 3).map((t) => TAG_LABEL[t]).join(', ') + (hero.favoredTags.length > 3 ? ` +${hero.favoredTags.length - 3}` : '');
    d.add(this.add.text(L, pd.y + pd.height + 8, `Likes: ${tags}`, textStyle(28, COLORS.textDim, { align: 'left', wordWrap: { width: 580 } })).setOrigin(0, 0));

    // Skins.
    this.renderSkins(id, owned, T + PANEL_H - 70);

    // Primary action.
    const ay = PANEL_TOP + PANEL_H + 70;
    if (!owned) {
      const afford = save.gold >= hero.unlockCost;
      const btn = new Button(this, W / 2, ay, `Unlock - ${fmt(hero.unlockCost)}`, () => this.unlock(id, btn), {
        width: 520, height: 104, color: afford ? 0xb8741a : 0x5a3a3a, fontSize: 42,
        icon: { key: ICONS_KEY, frame: 'gold', scale: 3 },
      });
      this.action = btn;
      if (afford && !reduced()) this.tweens.add({ targets: btn, scale: 1.04, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    } else if (save.selectedHero === id) {
      const btn = new Button(this, W / 2, ay, '✓ Selected', () => undefined, { width: 520, height: 104, color: 0x2f6e44, fontSize: 42, sound: false });
      btn.setEnabled(false);
      this.action = btn;
    } else {
      const btn = new Button(this, W / 2, ay, 'Select', () => this.select(id, btn), { width: 520, height: 104, color: 0x2f9e4e, fontSize: 46 });
      this.action = btn;
    }
    d.add(this.action);
    if (animate) popIn(this, spr);
  }

  private renderSkins(id: HeroId, owned: boolean, y: number): void {
    const save = services.save.data;
    const d = this.detail;
    const L = 56;
    const equipped = save.cosmetics.equipped[id];
    const ownedSkins = COSMETICS.filter((c) => save.cosmetics.owned.includes(c.id));
    const current = ownedSkins.find((c) => c.id === equipped);
    d.add(this.add.text(L, y - 52, ownedSkins.length ? `Skin: ${current?.name ?? 'None'}` : 'Skins', textStyle(30, COLORS.text, { align: 'left' })).setOrigin(0, 0.5));
    if (ownedSkins.length === 0) {
      d.add(this.add.text(L + 130, y - 52, 'Unlock skins with trophies', textStyle(28, COLORS.textDim, { align: 'left' })).setOrigin(0, 0.5));
      return;
    }
    const options: { id: string | undefined; tint?: number }[] = [{ id: undefined }, ...ownedSkins.map((c) => ({ id: c.id, tint: c.tint }))];
    options.forEach((o, i) => {
      const x = L + 44 + i * 100;
      const sel = (equipped ?? undefined) === o.id && owned;
      const chipBox = this.add.container(x, y + 12);
      const g = this.add.graphics();
      drawBox(g, -44, -44, 88, 88, sel ? 0x3a2a48 : COLORS.bg, sel ? COLORS.gold : COLORS.panelLight);
      const s = heroSprite(this, 0, 28, id, 3.4, o.tint ?? 0xffffff);
      if (!owned) s.setTint(0x2a2238);
      chipBox.add([g, s]);
      if (o.id === undefined) chipBox.add(this.add.text(0, -30, 'None', textStyle(28, COLORS.textDim, { strokeThickness: 4 })).setOrigin(0.5));
      chipBox.setSize(88, 88).setInteractive({ useHandCursor: true });
      chipBox.on('pointerup', (p: Phaser.Input.Pointer) => {
        if (p.getDistance() > 24) return;
        services.audio.play('click');
        if (o.id) save.cosmetics.equipped[id] = o.id;
        else delete save.cosmetics.equipped[id];
        void services.save.save();
        this.refreshCards();
        this.time.delayedCall(0, () => this.renderDetail(false));
        sparks(this, x, y + 12, o.tint ?? 0xffffff, 8, 60, 200);
      });
      d.add(chipBox);
    });
  }

  // ---- actions ------------------------------------------------------------------------------------

  private select(id: HeroId, btn: Button): void {
    const save = services.save.data;
    save.selectedHero = id;
    void services.save.save();
    services.audio.play('upgradePick');
    sparks(this, btn.x, btn.y, COLORS.heal, 22, 9000, 420);
    this.refreshCards();
    this.time.delayedCall(0, () => this.renderDetail(false));
  }

  private unlock(id: HeroId, btn: Button): void {
    const save = services.save.data;
    if (!buyHero(save, id)) {
      services.audio.play('error');
      shake(this, btn, 12);
      this.goldPill.pulse(COLORS.danger);
      shake(this, this.goldPill, 6);
      return;
    }
    void services.save.flush();
    services.audio.play('purchase');
    coinBurst(this, btn.x, btn.y, 18);
    sparks(this, btn.x, btn.y, COLORS.gold, 24, 9000, 460);
    this.goldPill.tweenTo(save.gold, 700);
    this.refreshCards();
    const lock = this.cards[id].lock;
    if (!reduced()) {
      lock.setVisible(true);
      this.tweens.add({
        targets: lock, y: lock.y - 70, alpha: 0, scale: 6, duration: 420, ease: 'Quad.Out',
        onComplete: () => lock.setVisible(false).setAlpha(1).setScale(4).setY(-14),
      });
    }
    this.time.delayedCall(0, () => this.renderDetail(true));
  }
}

function skinOf(id: HeroId): number | undefined {
  const sid = services.save.data.cosmetics.equipped[id];
  return COSMETICS.find((c) => c.id === sid)?.tint;
}

