import Phaser from 'phaser';
import { allTextureKeys } from '../assetKeys';
import { generateFallbackTextures, textureSizeForKey } from '../fallbackArt';
import { services } from '../../services';
import { createProgressBar } from '../ui/progress';
import { crispText } from '../ui/text';
import { DEPTH, H, PALETTE, W } from '../ui/theme';
import { SceneKeys } from './keys';

const SPRITE_DIR = 'assets/sprites/';
const AUDIO_DIR = 'assets/audio/';

interface SpriteEntry { key: string; file: string }
interface AudioManifest { sfx?: Record<string, string>; music?: Record<string, string> }

/**
 * Loading screen. Loads the sprite manifest then every SVG at the size its key prefix demands
 * (assetKeys.ts), loads the audio manifest and files, and finally generates a procedural fallback
 * for each expected texture that has no file. Missing manifests or files are fine (loaderror is
 * only logged).
 */
export class PreloadScene extends Phaser.Scene {
  constructor() { super(SceneKeys.Preload); }

  preload(): void {
    this.drawScreen();

    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      try { services.platform.logWarning(`asset failed: ${file.key}`); } catch { /* ignore */ }
    });

    this.load.json('sprite_manifest', `${SPRITE_DIR}manifest.json`);
    this.load.json('audio_manifest', `${AUDIO_DIR}manifest.json`);
    this.load.once(`${Phaser.Loader.Events.FILE_COMPLETE}-json-sprite_manifest`, (_k: string, _t: string, data: unknown) => {
      if (!Array.isArray(data)) return;
      for (const e of data as SpriteEntry[]) {
        if (!e || typeof e.key !== 'string' || typeof e.file !== 'string' || this.textures.exists(e.key)) continue;
        const size = textureSizeForKey(e.key);
        this.load.svg(e.key, SPRITE_DIR + e.file, { width: size.w, height: size.h });
      }
    });
    this.load.once(`${Phaser.Loader.Events.FILE_COMPLETE}-json-audio_manifest`, (_k: string, _t: string, data: unknown) => {
      const m = (data ?? {}) as AudioManifest;
      for (const group of [m.sfx, m.music]) {
        if (!group) continue;
        for (const [key, file] of Object.entries(group)) this.load.audio(key, AUDIO_DIR + file);
      }
    });
  }

  create(): void {
    const missing = allTextureKeys().filter((k) => !this.textures.exists(k));
    if (missing.length) generateFallbackTextures(this);
    this.scene.start(SceneKeys.Menu);
  }

  private drawScreen(): void {
    const g = this.add.graphics().setDepth(DEPTH.background);
    // vertical dusk gradient from stacked bands (no gradient API needed)
    const top = Phaser.Display.Color.ValueToColor(0x1d2a63);
    const bottom = Phaser.Display.Color.ValueToColor(0x0b0f26);
    const bands = 32;
    for (let i = 0; i < bands; i++) {
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(top, bottom, bands - 1, i);
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1).fillRect(0, (H / bands) * i, W, H / bands + 1);
    }
    // soft glow behind the title and a few stars
    g.fillStyle(0xffc94d, 0.05);
    for (let r = 300; r > 40; r -= 40) g.fillCircle(W / 2, H * 0.36, r);
    const rng = new Phaser.Math.RandomDataGenerator(['tower-merge']);
    for (let i = 0; i < 40; i++) {
      g.fillStyle(0xffffff, rng.realInRange(0.15, 0.55)).fillCircle(rng.between(10, W - 10), rng.between(10, H * 0.7), rng.realInRange(1.5, 3.5));
    }

    crispText(this, W / 2, H * 0.3, 'TOWER MERGE', { preset: 'title', size: 84 });
    crispText(this, W / 2, H * 0.3 + 100, 'Last Stand', { preset: 'heading', size: 56, colorNum: 0xffffff });
    g.fillStyle(PALETTE.gold, 1).fillRoundedRect(W / 2 - 150, H * 0.3 + 160, 300, 8, 4);

    const bar = createProgressBar(this, W / 2, H * 0.6, 460, 34, { value: 0.02 });
    const label = crispText(this, W / 2, H * 0.6 + 60, 'Loading…', 'small');
    this.load.on(Phaser.Loader.Events.PROGRESS, (p: number) => {
      bar.setValue(Math.max(0.02, p), false);
      label.setText(`Loading… ${Math.round(p * 100)}%`);
    });

    // Tell the host the first frame is on screen (after the next render).
    this.game.events.once(Phaser.Core.Events.POST_RENDER, () => {
      try { services.platform.firstFrameReady(); } catch { /* ignore */ }
    });
  }
}
