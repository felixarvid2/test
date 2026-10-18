/**
 * UI theme: palette, fonts, text presets and z-depths. Pure data, no Phaser imports, so tests
 * and non-scene code can use it. Every scene draws in the 720x1280 world; Phaser scales it to the
 * screen (Scale.FIT), so a "px" here is a world pixel.
 */
import type { Rarity } from '../../data/types';

export const W = 720;
export const H = 1280;
/** Smallest tappable size (world px). ~44 css px on a 360 px wide phone. */
export const MIN_TOUCH = 88;
/** Safe margin from the screen edges for HUD / buttons. */
export const MARGIN = 24;

export const FONT_DISPLAY = 'KenneyFuture, "Arial Black", Arial, sans-serif';
export const FONT_BODY = 'KenneyFutureNarrow, KenneyFuture, Arial, sans-serif';
/** CSS font-face names to wait for before creating text (BootScene). */
export const FONT_FAMILIES = ['KenneyFuture', 'KenneyFutureNarrow'] as const;

/** Colour numbers (0xRRGGBB) for Graphics / tints. Use `hex()` for CSS strings. */
export const PALETTE = {
  bg: 0x0f1430,
  panel: 0x1b2140,
  panelLight: 0x2a3366,
  panelDark: 0x121730,
  gold: 0xf5c542,
  goldLight: 0xffe58a,
  goldDark: 0xc48a1c,
  outline: 0x2b1d3a,
  text: 0xffffff,
  textDim: 0xaab4d4,
  textDark: 0x1b2140,
  success: 0x5ed06a,
  successDark: 0x2f8f3d,
  danger: 0xff5a4f,
  dangerDark: 0xb02a2a,
  info: 0x4fa3ff,
  infoDark: 0x2a63b8,
  disabled: 0x59607c,
  disabledDark: 0x3a405a,
  shadow: 0x000000,
} as const;

export const RARITY_COLORS: Record<Rarity, number> = {
  common: 0xb8c4d6,
  rare: 0x4fa3ff,
  epic: 0xb35cff,
  legendary: 0xffb627,
};
export const RARITY_LABELS: Record<Rarity, string> = {
  common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary',
};

/** Tower type colours (docs/ART_STYLE.md): main body/accent colour per TowerId. */
export const TOWER_COLORS: Record<string, number> = {
  arrow: 0x5cb85c,
  cannon: 0xff8a3d,
  frost: 0x7fdcff,
  lightning: 0x9d6bff,
  fire: 0xff5a36,
  poison: 0x8be04e,
  sniper: 0x3b5b9a,
  magic: 0xe05ad6,
};

/** Button colour schemes: [top face, bottom face, dark rim]. */
export type ButtonStyleName = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';
export const BUTTON_COLORS: Record<ButtonStyleName, { top: number; bottom: number; rim: number; text: number }> = {
  primary: { top: 0xffd35e, bottom: 0xf0a020, rim: 0x9a5a10, text: 0x3a2208 },
  secondary: { top: 0x5a6bb8, bottom: 0x3d4a94, rim: 0x232b5c, text: 0xffffff },
  success: { top: 0x7ee27a, bottom: 0x37a84a, rim: 0x1e6b2c, text: 0xffffff },
  danger: { top: 0xff7a6e, bottom: 0xd23a3a, rim: 0x822020, text: 0xffffff },
  ghost: { top: 0x2f3868, bottom: 0x232b52, rim: 0x151a38, text: 0xffffff },
};

/** CSS colour string from a 0xRRGGBB number. */
export function hex(color: number): string {
  return '#' + (color & 0xffffff).toString(16).padStart(6, '0');
}

/** Layer order inside a scene. Scenes may use anything between; keep overlays in these bands. */
export const DEPTH = {
  background: 0,
  world: 10,
  fx: 50,
  hud: 100,
  panel: 200,
  modalDim: 900,
  modal: 910,
  toast: 1000,
  transition: 2000,
} as const;

export type TextPreset = 'title' | 'heading' | 'body' | 'small' | 'number';

export interface TextStyleLike {
  fontFamily?: string;
  fontSize?: string;
  color?: string;
  stroke?: string;
  strokeThickness?: number;
  align?: string;
  fontStyle?: string;
  wordWrap?: { width: number; useAdvancedWrap?: boolean };
  lineSpacing?: number;
  shadow?: { offsetX?: number; offsetY?: number; color?: string; blur?: number; stroke?: boolean; fill?: boolean };
}

/**
 * Text presets (sizes in world px). `title` 64 gold with a thick outline, `heading` 40, `body` 30
 * (narrow font, readable at phone size), `small` 24, `number` 40 for counters and damage.
 */
export const TEXT_PRESETS: Record<TextPreset, TextStyleLike> = {
  title: {
    fontFamily: FONT_DISPLAY, fontSize: '64px', color: hex(PALETTE.goldLight), align: 'center',
    stroke: hex(PALETTE.outline), strokeThickness: 12,
    shadow: { offsetX: 0, offsetY: 6, color: '#000000', blur: 0, stroke: true, fill: true },
  },
  heading: {
    fontFamily: FONT_DISPLAY, fontSize: '40px', color: hex(PALETTE.text), align: 'center',
    stroke: hex(PALETTE.outline), strokeThickness: 8,
    shadow: { offsetX: 0, offsetY: 4, color: '#000000', blur: 0, stroke: true, fill: true },
  },
  body: {
    fontFamily: FONT_BODY, fontSize: '30px', color: hex(PALETTE.text), align: 'center',
    stroke: hex(PALETTE.outline), strokeThickness: 4,
  },
  small: {
    fontFamily: FONT_BODY, fontSize: '24px', color: hex(PALETTE.textDim), align: 'center',
    stroke: hex(PALETTE.outline), strokeThickness: 3,
  },
  number: {
    fontFamily: FONT_DISPLAY, fontSize: '40px', color: hex(PALETTE.text), align: 'center',
    stroke: hex(PALETTE.outline), strokeThickness: 7,
    shadow: { offsetX: 0, offsetY: 3, color: '#000000', blur: 0, stroke: true, fill: true },
  },
};

/** A preset merged with overrides. `size` (number) is a shortcut for fontSize. */
export function textStyle(
  preset: TextPreset,
  overrides: TextStyleLike & { size?: number; colorNum?: number } = {},
): TextStyleLike {
  const { size, colorNum, ...rest } = overrides;
  const out: TextStyleLike = { ...TEXT_PRESETS[preset], ...rest };
  if (size !== undefined) {
    out.fontSize = `${size}px`;
    if (rest.strokeThickness === undefined) {
      const base = parseFloat(TEXT_PRESETS[preset].fontSize ?? '30');
      out.strokeThickness = Math.max(2, Math.round(((TEXT_PRESETS[preset].strokeThickness ?? 4) * size) / base));
    }
  }
  if (colorNum !== undefined) out.color = hex(colorNum);
  return out;
}
