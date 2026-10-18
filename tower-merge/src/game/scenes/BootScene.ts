import Phaser from 'phaser';
import { FONT_FAMILIES, PALETTE } from '../ui/theme';
import { SceneKeys } from './keys';

/** Waits for the bundled fonts so the first text created already uses them, then hands over. */
export class BootScene extends Phaser.Scene {
  constructor() { super(SceneKeys.Boot); }

  create(): void {
    this.cameras.main.setBackgroundColor(PALETTE.bg);
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    const ready = fonts
      ? Promise.all(FONT_FAMILIES.map((f) => fonts.load(`32px ${f}`, 'Tower Merge 0123456789'))).catch(() => undefined)
      : Promise.resolve();
    // Never hold the game back for more than a moment if a font is slow.
    Promise.race([ready, new Promise((r) => setTimeout(r, 1500))]).then(() => {
      document.getElementById('boot')?.remove();
      this.scene.start(SceneKeys.Preload);
    });
  }
}
