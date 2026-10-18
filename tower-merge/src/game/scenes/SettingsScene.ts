import Phaser from 'phaser';
import pkg from '../../../package.json';
import { services } from '../../services';
import type { Settings } from '../../save/schema';
import { ScrollView } from '../menus/scroll';
import { HEADER_H, createHeader, createSlider, createSwitch, menuBackground, sectionHeader, staggerIn } from '../menus/widgets';
import {
  H, PALETTE, W, createButton, crispText, drawPanelBody, fadeIn, fitText, openModal, playSfx, showToast,
} from '../ui';
import { SceneKeys } from './keys';

const ROW_W = 664;

type ToggleKey = 'screenShake' | 'reducedMotion' | 'damageNumbers' | 'showRanges' | 'muted';

const TOGGLES: Array<{ key: ToggleKey; label: string; hint: string }> = [
  { key: 'screenShake', label: 'Screen shake', hint: 'Camera shakes on big hits' },
  { key: 'reducedMotion', label: 'Reduced motion', hint: 'Calmer animations and effects' },
  { key: 'damageNumbers', label: 'Damage numbers', hint: 'Show numbers when enemies are hit' },
  { key: 'showRanges', label: 'Show tower ranges', hint: 'Draw range circles in battle' },
];

/** Volume sliders, gameplay toggles, reset progress, credits and the version. */
export class SettingsScene extends Phaser.Scene {
  private view!: ScrollView;

  constructor() { super(SceneKeys.Settings); }

  create(data?: { reset?: boolean }): void {
    fadeIn(this);
    menuBackground(this);
    createHeader(this, 'SETTINGS');
    const top = HEADER_H + 14;
    this.view = new ScrollView(this, 0, top, W, H - top);
    const box = this.view.content;
    const cards: Phaser.GameObjects.Container[] = [];
    let y = 8;

    y += sectionHeader(this, box, y, 'AUDIO');
    const music = this.sliderCard(y + 80, 'Music', 'musicVolume');
    const sfx = this.sliderCard(y + 80 + 176, 'Sound effects', 'sfxVolume');
    cards.push(music, sfx);
    y += 2 * 176 + 4;
    // Playables says a game must not have its own overall mute: the host's mute button does that.
    if (services.platform.name !== 'youtube') {
      cards.push(this.toggleRow(y + 52, { key: 'muted', label: 'Mute all sound', hint: 'Silences music and effects' }));
      y += 112 + 14;
    }
    y += 14;

    y += sectionHeader(this, box, y, 'GAMEPLAY');
    TOGGLES.forEach((t) => { cards.push(this.toggleRow(y + 52, t)); y += 112 + 14; });
    y += 14;

    y += sectionHeader(this, box, y, 'PROGRESS');
    const reset = createButton(this, W / 2, y + 56, {
      label: 'RESET PROGRESS', width: 440, height: 96, fontSize: 34, style: 'danger',
      onClick: () => { if (!this.view.dragged) this.confirmReset(); },
    });
    box.add(reset.container);
    cards.push(reset.container);
    y += 130;
    box.add(this.note(y + 4, 'Erases gems, upgrades, unlocked towers, achievements and stats.'));
    y += 70;

    y += sectionHeader(this, box, y, 'CREDITS');
    const credits = this.creditsCard(y + 150);
    box.add(credits);
    y += 300 + 20;
    box.add(crispText(this, W / 2, y + 20, `Tower Merge: Last Stand   Version ${pkg.version}`, { preset: 'small', size: 22, colorNum: PALETTE.textDim }));
    y += 80;
    this.view.setContentHeight(y);
    staggerIn(this, cards, { step: 40 });
    if (data?.reset) showToast(this, 'Progress reset', { kind: 'success' });
  }

  private note(y: number, text: string): Phaser.GameObjects.Text {
    const t = crispText(this, W / 2, y + 20, text, { preset: 'small', size: 22, wordWrap: { width: ROW_W - 40 } });
    t.setY(y + t.height / 2);
    return t;
  }

  private setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
    void services.save.update((d) => { d.settings[key] = value; });
  }

  private sliderCard(y: number, label: string, key: 'musicVolume' | 'sfxVolume'): Phaser.GameObjects.Container {
    const settings = services.save.data.settings;
    const c = this.add.container(W / 2, y);
    const g = this.add.graphics();
    drawPanelBody(g, ROW_W, 160, PALETTE.panel, 0x3a4580, 26, true);
    c.add(g);
    c.add(crispText(this, -ROW_W / 2 + 36, -42, label, { preset: 'heading', size: 32 }).setOrigin(0, 0.5));
    const pct = crispText(this, ROW_W / 2 - 36, -42, `${Math.round(settings[key] * 100)}%`, { preset: 'number', size: 34, colorNum: PALETTE.goldLight }).setOrigin(1, 0.5);
    c.add(pct);
    const apply = (v: number): void => {
      pct.setText(`${Math.round(v * 100)}%`);
      const cur = services.save.data.settings;
      const music = key === 'musicVolume' ? v : cur.musicVolume;
      const sfx = key === 'sfxVolume' ? v : cur.sfxVolume;
      services.audio.setSettings(music, sfx);
      this.setSetting(key, v);
    };
    const slider = createSlider(this, 0, 30, ROW_W - 130, settings[key], apply, () => {
      if (key === 'sfxVolume') playSfx('coin'); // preview at the new level
    });
    c.add(slider.container);
    this.view.content.add(c);
    return c;
  }

  private toggleRow(y: number, t: { key: ToggleKey; label: string; hint: string }): Phaser.GameObjects.Container {
    const c = this.add.container(W / 2, y);
    const g = this.add.graphics();
    drawPanelBody(g, ROW_W, 108, PALETTE.panel, 0x3a4580, 24, true);
    const on = services.save.data.settings[t.key];
    const sw = createSwitch(this, ROW_W / 2 - 100, 0, on);
    const zone = this.add.zone(0, 0, ROW_W, 108).setInteractive({ useHandCursor: true });
    let value = on;
    zone.on('pointerup', () => {
      if (this.view.dragged) return;
      playSfx('click');
      value = !value;
      sw.set(value);
      this.setSetting(t.key, value);
      if (t.key === 'muted') services.audio.setMuted(value);
    });
    c.add([g, zone,
      fitText(crispText(this, -ROW_W / 2 + 36, -16, t.label, { preset: 'heading', size: 30 }).setOrigin(0, 0.5), 400),
      fitText(crispText(this, -ROW_W / 2 + 36, 26, t.hint, { preset: 'small', size: 21 }).setOrigin(0, 0.5), 420),
      sw.container]);
    this.view.content.add(c);
    return c;
  }

  private confirmReset(): void {
    this.view.locked = true;
    openModal(this, {
      title: 'Reset progress?',
      body: 'All gems, upgrades, unlocked towers, achievements and stats will be erased. This cannot be undone.',
      buttons: [
        { label: 'Cancel', style: 'secondary' },
        {
          label: 'Reset', style: 'danger',
          onClick: () => {
            void services.save.reset().then(() => {
              services.audio.setSettings(services.save.data.settings.musicVolume, services.save.data.settings.sfxVolume);
              this.scene.restart({ reset: true });
            });
          },
        },
      ],
      onClose: () => {
        this.view.locked = false;
      },
    });
  }

  private creditsCard(y: number): Phaser.GameObjects.Container {
    const c = this.add.container(W / 2, y);
    const g = this.add.graphics();
    drawPanelBody(g, ROW_W, 300, PALETTE.panel, 0x3a4580, 26, true);
    c.add(g);
    const lines: Array<[string, string]> = [
      ['Sound effects', 'Kenney (kenney.nl), CC0'],
      ['Music', 'Abstraction, CC0'],
      ['Font', 'Kenney Future, CC0'],
      ['Art, design and code', 'Original, made for this game'],
    ];
    lines.forEach(([head, body], i) => {
      const ly = -96 + i * 66;
      c.add(crispText(this, -ROW_W / 2 + 36, ly - 12, head, { preset: 'small', size: 22, colorNum: PALETTE.gold }).setOrigin(0, 0.5));
      c.add(fitText(crispText(this, -ROW_W / 2 + 36, ly + 18, body, { preset: 'body', size: 26, align: 'left' }).setOrigin(0, 0.5), ROW_W - 72));
    });
    return c;
  }
}
