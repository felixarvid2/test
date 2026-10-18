import Phaser from 'phaser';
import { COLORS } from '../assets';
import { services } from '../../services';
import { createBackground } from '../ui/background';
import { Button, H, MIN_TOUCH, W, fadeInScene, goto, panel, popIn, textStyle, titleStyle, veil } from '../ui/kit';
import { openModal } from '../ui/modal';
import { ScrollList } from '../ui/scroll';
import { Slider, ToggleRow } from '../ui/widgets';
import { SCENES } from './keys';

export interface SettingsSceneData {
  /** Drawn over a paused game (from the Pause menu) instead of as a stand-alone screen. */
  overlay?: boolean;
  /** Scene to wake / resume when Back is pressed in overlay mode. */
  returnTo?: string;
}

const CREDITS: { head: string; lines: string[] }[] = [
  { head: 'ART', lines: ['Tiny Dungeon tiles by Kenney (kenney.nl), CC0.', 'Extra sprites and icons drawn for this game in the same style.'] },
  { head: 'SOUND EFFECTS', lines: ['Kenney (kenney.nl), CC0:', 'RPG Audio, Impact Sounds, Interface Sounds, Music Jingles, Digital Audio and Casino Audio.'] },
  { head: 'MUSIC', lines: ['Music Loop Bundle by Abstraction (Tallbeard Studios), CC0.'] },
  { head: 'FONTS', lines: ['Monogram by datagoblin, CC0.', 'Kenney Future by Kenney, CC0.'] },
  { head: 'ENGINE', lines: ['Built with Phaser 3 (MIT).'] },
  { head: 'THANK YOU', lines: ['Thanks for playing Tiny Dungeon!', 'See CREDITS.md for details.'] },
];

export class SettingsScene extends Phaser.Scene {
  private overlay = false;
  private returnTo?: string;
  private lastPreview = 0;

  constructor() { super(SCENES.settings); }

  init(data: SettingsSceneData): void {
    this.overlay = !!data?.overlay;
    this.returnTo = data?.returnTo;
  }

  create(): void {
    const settings = services.save.data.settings;
    fadeInScene(this);
    if (this.overlay) {
      // Scene order puts Settings below Game/Hud/Pause: lift it above them.
      this.scene.bringToTop();
      veil(this, 0.94).setDepth(-10);
    } else {
      createBackground(this, { dim: 0.8 });
    }

    new Button(this, 124, 60, '◀ Back', () => this.back(), { width: 200, height: MIN_TOUCH, color: 0x5a4a62, fontSize: 36 });
    this.add.text(W / 2, 160, 'SETTINGS', titleStyle(52)).setOrigin(0.5);

    // Volume sliders.
    this.volumeRow(262, 'Music', settings.musicVolume, (v) => { settings.musicVolume = v; }, false);
    this.volumeRow(424, 'Effects', settings.sfxVolume, (v) => { settings.sfxVolume = v; }, true);

    // Toggles.
    const rowW = 656;
    let y = 566;
    const add = (text: string, on: boolean, set: (v: boolean) => void, stateText?: (v: boolean) => string): void => {
      new ToggleRow(this, W / 2, y, rowW, text, on, (v) => { set(v); void services.save.save(); }, stateText);
      y += MIN_TOUCH + 18;
    };
    add('Screen shake', settings.screenShake, (v) => { settings.screenShake = v; });
    add('Reduced motion', settings.reducedMotion, (v) => { settings.reducedMotion = v; });
    add('Damage numbers', settings.damageNumbers, (v) => { settings.damageNumbers = v; });
    add('Joystick', settings.joystick === 'floating', (v) => { settings.joystick = v ? 'floating' : 'fixed'; }, (v) => (v ? 'Floating' : 'Fixed'));

    // Credits / reset.
    y += 24;
    new Button(this, W / 2 - 166, y + 48, 'Credits', () => this.showCredits(), { width: 320, height: 96, color: 0x3d6e70, fontSize: 36 });
    new Button(this, W / 2 + 166, y + 48, 'Reset progress', () => this.confirmReset(), { width: 320, height: 96, color: 0x8a2f3a, fontSize: 32 });
    this.add.text(W / 2, H - 52, 'Tiny Dungeon - One More Room', textStyle(28, COLORS.textDim)).setOrigin(0.5);
  }

  private volumeRow(y: number, name: string, value: number, set: (v: number) => void, preview: boolean): void {
    panel(this, W / 2, y, 656, 142, COLORS.panel, COLORS.panelLight);
    this.add.text(W / 2 - 328 + 32, y - 36, name, textStyle(36, COLORS.text, { align: 'left' })).setOrigin(0, 0.5);
    const pct = this.add.text(W / 2 + 328 - 32, y - 36, `${Math.round(value * 100)}%`, textStyle(36, COLORS.gold, { align: 'right' })).setOrigin(1, 0.5);
    new Slider(this, W / 2, y + 28, 500, value, (v) => {
      set(v);
      pct.setText(`${Math.round(v * 100)}%`);
      void services.save.save(); // debounced write; applies the volume immediately
      if (preview && this.time.now - this.lastPreview > 140) {
        this.lastPreview = this.time.now;
        services.audio.play('coin');
      }
    });
  }

  // ---- navigation ---------------------------------------------------------------------------------

  private back(): void {
    void services.save.flush();
    if (!this.overlay) {
      goto(this, SCENES.menu);
      return;
    }
    const sm = this.scene;
    const key = this.returnTo;
    if (key) {
      if (sm.isSleeping(key)) sm.wake(key);
      else if (sm.isPaused(key)) sm.resume(key);
    }
    sm.stop();
  }

  // ---- credits ------------------------------------------------------------------------------------

  private showCredits(): void {
    const depth = 4000;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const shade = this.add.rectangle(W / 2, H / 2, W, H, COLORS.bg, 0.9).setInteractive().setDepth(depth);
    const frame = panel(this, W / 2, H / 2, 640, 1000, COLORS.panel, COLORS.panelLight).setDepth(depth);
    const title = this.add.text(W / 2, H / 2 - 500 + 62, 'CREDITS', titleStyle(46)).setOrigin(0.5).setDepth(depth);
    objs.push(shade, frame, title);

    const vx = W / 2 - 290;
    const vw = 580;
    const vy = H / 2 - 500 + 120;
    const vh = 1000 - 120 - 130;
    const content: Phaser.GameObjects.Text[] = [];
    let cy = 0;
    for (const sec of CREDITS) {
      const head = this.add.text(0, cy, sec.head, textStyle(34, COLORS.gold, { align: 'left' })).setOrigin(0, 0);
      cy += head.height + 6;
      const body = this.add.text(0, cy, sec.lines.join('\n'), textStyle(30, COLORS.text, { align: 'left', wordWrap: { width: vw - 20 }, lineSpacing: 6 })).setOrigin(0, 0);
      cy += body.height + 30;
      content.push(head, body);
    }
    const list = new ScrollList(this, vx, vy, vw, vh, cy, depth);
    list.content.add(content);

    const close = new Button(this, W / 2, H / 2 + 500 - 70, 'Close', () => {
      list.destroy();
      for (const o of objs) o.destroy();
      close.destroy();
    }, { width: 400, height: 96, color: 0x2f8f4e });
    close.setDepth(depth + 3);
    popIn(this, frame);
  }

  // ---- reset --------------------------------------------------------------------------------------

  private confirmReset(): void {
    const modal = openModal(this, {
      title: 'Reset progress?',
      icon: 'skull',
      border: COLORS.danger,
      titleColor: COLORS.danger,
      body: 'This erases your gold, heroes, upgrades, trophies and best scores for good.',
      buttons: [
        { text: 'Yes, erase everything', color: 0x9a2a36, delay: 900, onClick: () => { modal.close(); void this.doReset(); } },
        { text: 'Keep my progress', color: 0x2f8f4e, onClick: () => modal.close() },
      ],
    });
  }

  private async doReset(): Promise<void> {
    await services.save.reset();
    const sm = this.scene;
    for (const key of [SCENES.pause, SCENES.hud, SCENES.game, this.returnTo]) {
      if (key && (sm.isActive(key) || sm.isSleeping(key) || sm.isPaused(key))) sm.stop(key);
    }
    sm.start(SCENES.menu);
  }
}
