/**
 * Procedural fallback textures. Any key from allTextureKeys() with no loaded SVG gets one of these
 * (Graphics -> generateTexture), so the game is playable and good-looking without art files.
 * Style follows docs/ART_STYLE.md: dark plum outline, 3-tone cel shading lit from the upper left,
 * soft ground shadows, vibrant but controlled colours. Textures are deterministic (seeded noise).
 */
import Phaser from 'phaser';
import { BOSS_IDS, ENEMY_IDS, TOWER_IDS } from '../data/types';
import { PROJECTILE_KINDS, allTextureKeys } from './assetKeys';
import { TOWER_COLORS } from './ui/theme';

const OUT = 0x2b1d3a;
type G = Phaser.GameObjects.Graphics;
type Pt = [number, number];

// ---------------------------------------------------------------------------------------------
// Sizes (same contract as assetKeys.ts)
// ---------------------------------------------------------------------------------------------

/** Canvas size for a texture key, by prefix (assetKeys.ts). Also used to rasterise SVGs. */
export function textureSizeForKey(key: string): { w: number; h: number } {
  if (key.startsWith('tower_')) return { w: 192, h: 192 };
  if (key.startsWith('enemy_')) return { w: 128, h: 128 };
  if (key.startsWith('boss_')) return { w: 320, h: 320 };
  if (key.startsWith('proj_')) return { w: 64, h: 64 };
  if (key.startsWith('icon_')) return { w: 128, h: 128 };
  if (key === 'castle') return { w: 384, h: 256 };
  if (key.startsWith('bg_')) return { w: 720, h: 1280 };
  if (key.startsWith('slot_')) return { w: 128, h: 128 };
  if (key.startsWith('fx_')) return { w: 64, h: 64 };
  return { w: 128, h: 128 };
}

/** Creates a fallback for every expected texture key that is missing. */
export function generateFallbackTextures(scene: Phaser.Scene): void {
  for (const key of allTextureKeys()) {
    if (!scene.textures.exists(key)) generateFallbackTexture(scene, key);
  }
}

/** Draws and registers the fallback for one key. Returns false when the key is unknown. */
export function generateFallbackTexture(scene: Phaser.Scene, key: string): boolean {
  const painter = painterFor(key);
  if (!painter) return false;
  const { w, h } = textureSizeForKey(key);
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  painter(g, w, h);
  g.generateTexture(key, w, h);
  g.destroy();
  return true;
}

function painterFor(key: string): ((g: G, w: number, h: number) => void) | undefined {
  const part = (prefix: string) => key.slice(prefix.length);
  if (key.startsWith('tower_')) {
    const m = /^tower_(.+)_(\d)$/.exec(key);
    if (m && (TOWER_IDS as readonly string[]).includes(m[1])) return (g) => paintTower(g, m[1], Number(m[2]));
  }
  if (key.startsWith('enemy_') && (ENEMY_IDS as readonly string[]).includes(part('enemy_'))) return (g) => paintEnemy(g, part('enemy_'));
  if (key.startsWith('boss_') && (BOSS_IDS as readonly string[]).includes(part('boss_'))) return (g) => paintBoss(g, part('boss_'));
  if (key.startsWith('proj_') && (PROJECTILE_KINDS as readonly string[]).includes(part('proj_'))) return (g) => paintProjectile(g, part('proj_'));
  if (key.startsWith('icon_')) return (g) => paintIcon(g, part('icon_'));
  switch (key) {
    case 'castle': return paintCastle;
    case 'bg_board': return paintBoard;
    case 'bg_menu': return paintMenuBg;
    case 'slot_empty': return (g) => paintSlot(g, false);
    case 'slot_locked': return (g) => paintSlot(g, true);
    case 'fx_spark': return paintSpark;
    case 'fx_smoke': return paintSmoke;
    case 'fx_glow': return paintGlow;
    case 'fx_ring': return paintRing;
    case 'fx_star': return paintStar;
    case 'fx_coin': return paintCoin;
    default: return undefined;
  }
}

// ---------------------------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------------------------

/** Linear mix of two 0xRRGGBB colours (t = 0 -> a, 1 -> b). */
export function mixColor(a: number, b: number, t: number): number {
  const ch = (shift: number) => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
const lighten = (c: number, t = 0.25) => mixColor(c, 0xffffff, t);
const darken = (c: number, t = 0.25) => mixColor(c, 0x000000, t);

/** Soft ground shadow ellipse. */
function groundShadow(g: G, x: number, y: number, rx: number, ry: number): void {
  g.fillStyle(0x000000, 0.25).fillEllipse(x, y, rx * 2, ry * 2);
}

/** Outlined, 3-tone ellipse: outline, shadow, base (shifted up-left), highlight. */
function blob(g: G, x: number, y: number, rx: number, ry: number, base: number, lw = 4): void {
  g.fillStyle(OUT, 1).fillEllipse(x, y, rx * 2 + lw * 2, ry * 2 + lw * 2);
  g.fillStyle(darken(base, 0.28), 1).fillEllipse(x, y, rx * 2, ry * 2);
  g.fillStyle(base, 1).fillEllipse(x - rx * 0.07, y - ry * 0.08, rx * 1.8, ry * 1.78);
  g.fillStyle(lighten(base, 0.4), 0.55).fillEllipse(x - rx * 0.36, y - ry * 0.46, rx * 0.55, ry * 0.3);
}

/** Outlined, 3-tone rounded rect (x, y = top-left). */
function box(g: G, x: number, y: number, w: number, h: number, r: number, base: number, lw = 4): void {
  g.fillStyle(OUT, 1).fillRoundedRect(x - lw, y - lw, w + lw * 2, h + lw * 2, r + lw);
  g.fillStyle(darken(base, 0.28), 1).fillRoundedRect(x, y, w, h, r);
  const sx = Math.max(2, w * 0.14);
  const sy = Math.max(2, h * 0.1);
  g.fillStyle(base, 1).fillRoundedRect(x, y, w - sx, h - sy, r);
  g.fillStyle(lighten(base, 0.35), 0.55).fillRoundedRect(x + 3, y + 3, Math.max(2, (w - sx) * 0.3), Math.max(2, h - sy - 6), Math.max(1, r * 0.5));
}

/** Outlined polygon with a flat fill and a lighter upper-left half-tone. */
function poly(g: G, pts: Pt[], fill: number, lw = 4, shade = true): void {
  const P = pts.map(([x, y]) => new Phaser.Geom.Point(x, y));
  g.fillStyle(fill, 1).fillPoints(P, true);
  if (shade) {
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    // shadow = triangle fan of the lower-right vertices
    g.fillStyle(darken(fill, 0.25), 0.9);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const mx = (a[0] + b[0]) / 2 - cx;
      const my = (a[1] + b[1]) / 2 - cy;
      if (mx + my > 0) g.fillTriangle(a[0], a[1], b[0], b[1], cx, cy);
    }
  }
  g.lineStyle(lw, OUT, 1).strokePoints(P, true, true);
}

function circle(g: G, x: number, y: number, r: number, fill: number, lw = 3): void {
  g.fillStyle(fill, 1).fillCircle(x, y, r);
  g.lineStyle(lw, OUT, 1).strokeCircle(x, y, r);
}

function star(g: G, cx: number, cy: number, outer: number, inner: number, points: number, rot = -Math.PI / 2): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rot + (i * Math.PI) / points;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  void g;
  return pts;
}

function line(g: G, x1: number, y1: number, x2: number, y2: number, color: number, lw: number, outline = false): void {
  if (outline) g.lineStyle(lw + 5, OUT, 1).lineBetween(x1, y1, x2, y2);
  g.lineStyle(lw, color, 1).lineBetween(x1, y1, x2, y2);
}

function arc(g: G, cx: number, cy: number, r: number, a0: number, a1: number, color: number, lw: number, outline = false): void {
  if (outline) {
    g.lineStyle(lw + 5, OUT, 1).beginPath().arc(cx, cy, r, a0, a1, false).strokePath();
  }
  g.lineStyle(lw, color, 1).beginPath().arc(cx, cy, r, a0, a1, false).strokePath();
}

function eyes(g: G, x: number, y: number, gap: number, r: number, iris = 0x2b1d3a, white = 0xffffff): void {
  for (const dx of [-gap / 2, gap / 2]) {
    g.fillStyle(white, 1).fillCircle(x + dx, y, r);
    g.lineStyle(2, OUT, 1).strokeCircle(x + dx, y, r);
    g.fillStyle(iris, 1).fillCircle(x + dx + r * 0.3, y + r * 0.1, r * 0.55);
    g.fillStyle(0xffffff, 1).fillCircle(x + dx + r * 0.1, y - r * 0.25, r * 0.2);
  }
}

// ---------------------------------------------------------------------------------------------
// Towers (192x192, base centre (96, 168))
// ---------------------------------------------------------------------------------------------

const STONE = 0x8d8fa8;
const WOOD = 0xa8673a;
const GOLD = 0xf5c542;

/** Weapon / crystal glyph used on towers and tower icons, centred on (cx, cy), radius ~s. */
function weaponGlyph(g: G, type: string, cx: number, cy: number, s: number): void {
  const col = TOWER_COLORS[type] ?? 0xffffff;
  switch (type) {
    case 'arrow': {
      arc(g, cx - s * 0.2, cy, s * 0.95, -1.15, 1.15, WOOD, Math.max(4, s * 0.26), true);
      const a = -1.15;
      line(g, cx - s * 0.2 + Math.cos(a) * s * 0.95, cy + Math.sin(a) * s * 0.95, cx - s * 0.2 + Math.cos(-a) * s * 0.95, cy + Math.sin(-a) * s * 0.95, 0xf4efe0, 2);
      line(g, cx - s * 0.5, cy, cx + s * 1.0, cy, 0xe8d9b0, Math.max(3, s * 0.16), true);
      poly(g, [[cx + s * 1.35, cy], [cx + s * 0.85, cy - s * 0.3], [cx + s * 0.85, cy + s * 0.3]], col, 3, false);
      break;
    }
    case 'cannon': {
      g.save();
      g.translateCanvas(cx, cy + s * 0.2);
      g.rotateCanvas(-0.55);
      box(g, -s * 0.8, -s * 0.38, s * 1.7, s * 0.76, s * 0.3, 0x4a4f63, 3);
      box(g, s * 0.55, -s * 0.5, s * 0.4, s, s * 0.15, 0x6b7088, 3);
      g.fillStyle(0x15151f, 1).fillCircle(s * 0.95, 0, s * 0.26);
      g.restore();
      circle(g, cx - s * 0.2, cy + s * 0.7, s * 0.5, 0x3a3e50, 3);
      g.fillStyle(col, 1).fillCircle(cx - s * 0.2, cy + s * 0.7, s * 0.18);
      break;
    }
    case 'frost':
      poly(g, [[cx, cy - s * 1.2], [cx + s * 0.62, cy - s * 0.1], [cx, cy + s * 0.8], [cx - s * 0.62, cy - s * 0.1]], col, 4);
      g.fillStyle(0xc9f3ff, 0.9).fillTriangle(cx - s * 0.05, cy - s * 0.95, cx - s * 0.4, cy - s * 0.1, cx - s * 0.05, cy - s * 0.1);
      poly(g, [[cx - s * 0.85, cy + s * 0.2], [cx - s * 0.5, cy - s * 0.35], [cx - s * 0.3, cy + s * 0.5]], 0xa5e8ff, 3, false);
      break;
    case 'lightning':
      circle(g, cx, cy, s * 0.95, mixColor(col, 0x1b1240, 0.35), 4);
      g.fillStyle(0xffffff, 0.2).fillEllipse(cx - s * 0.3, cy - s * 0.45, s * 0.6, s * 0.3);
      poly(g, [[cx + s * 0.15, cy - s * 0.85], [cx - s * 0.5, cy + s * 0.1], [cx - s * 0.03, cy + s * 0.1], [cx - s * 0.2, cy + s * 0.9], [cx + s * 0.5, cy - s * 0.2], [cx + s * 0.05, cy - s * 0.2]], 0xffe14d, 3, false);
      break;
    case 'fire':
      g.fillStyle(OUT, 1).fillCircle(cx, cy + s * 0.25, s * 0.78 + 4);
      poly(g, [[cx, cy - s * 1.25], [cx + s * 0.75, cy + s * 0.1], [cx - s * 0.75, cy + s * 0.1]], col, 4, false);
      circle(g, cx, cy + s * 0.25, s * 0.78, col, 4);
      g.fillStyle(0xffb03b, 1).fillCircle(cx, cy + s * 0.35, s * 0.5);
      g.fillStyle(0xffe58a, 1).fillCircle(cx - s * 0.05, cy + s * 0.45, s * 0.24);
      break;
    case 'poison':
      box(g, cx - s * 0.28, cy - s * 1.0, s * 0.56, s * 0.7, s * 0.12, 0xdfe9ee, 3);
      box(g, cx - s * 0.36, cy - s * 1.2, s * 0.72, s * 0.32, s * 0.1, WOOD, 3);
      circle(g, cx, cy + s * 0.2, s * 0.85, 0xdfe9ee, 4);
      g.fillStyle(col, 1).fillCircle(cx, cy + s * 0.32, s * 0.68);
      g.fillStyle(0x7a3fa0, 1).fillCircle(cx + s * 0.25, cy + s * 0.5, s * 0.2);
      g.fillStyle(0xffffff, 0.7).fillCircle(cx - s * 0.3, cy, s * 0.14);
      circle(g, cx + s * 0.2, cy - s * 0.2, s * 0.14, 0xc9ff9a, 2);
      break;
    case 'sniper': {
      box(g, cx - s * 1.2, cy - s * 0.18, s * 2.1, s * 0.36, s * 0.14, 0x3b5b9a, 3);
      box(g, cx + s * 0.8, cy - s * 0.26, s * 0.5, s * 0.52, s * 0.1, 0xd4a64a, 3);
      circle(g, cx - s * 0.2, cy - s * 0.55, s * 0.4, 0xd4a64a, 3);
      g.fillStyle(0x16233f, 1).fillCircle(cx - s * 0.2, cy - s * 0.55, s * 0.24);
      g.lineStyle(2, 0xff5a36, 1).lineBetween(cx - s * 0.2, cy - s * 0.8, cx - s * 0.2, cy - s * 0.3).lineBetween(cx - s * 0.45, cy - s * 0.55, cx + s * 0.05, cy - s * 0.55);
      break;
    }
    case 'magic':
    default:
      g.fillStyle(col, 0.3).fillCircle(cx, cy, s * 1.25);
      circle(g, cx, cy, s * 0.85, col, 4);
      g.fillStyle(0x5ef0ff, 1).fillCircle(cx, cy, s * 0.5);
      g.fillStyle(0xffffff, 0.9).fillCircle(cx - s * 0.18, cy - s * 0.2, s * 0.2);
      g.fillStyle(0xffffff, 0.95).fillPoints(star(g, cx + s * 0.95, cy - s * 0.85, s * 0.4, s * 0.12, 4).map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
      break;
  }
}

function paintTower(g: G, type: string, level: number): void {
  const col = TOWER_COLORS[type] ?? 0xffffff;
  const baseY = 168;
  const cx = 96;
  const bodyW = 50 + level * 7;
  const bodyH = 32 + level * 9;
  const footW = bodyW + 26;
  const wood = level === 1;
  const material = wood ? WOOD : type === 'cannon' ? mixColor(STONE, 0x4a4f63, 0.35) : mixColor(STONE, col, 0.14);

  groundShadow(g, cx, baseY + 2, footW / 2 + 8, 12);
  if (level === 5) {
    g.fillStyle(col, 0.1);
    for (let r = 78; r > 36; r -= 8) g.fillCircle(cx, baseY - 58, r);
  }
  // stone footing
  box(g, cx - footW / 2, baseY - 22, footW, 24, 9, STONE);
  const footTop = baseY - 22;
  // tower body
  const bodyY = footTop - bodyH + 6;
  box(g, cx - bodyW / 2, bodyY, bodyW, bodyH, 8, material);
  // masonry / planks
  g.lineStyle(2, darken(material, 0.35), 0.7);
  if (wood) {
    for (let x = cx - bodyW / 2 + 12; x < cx + bodyW / 2 - 6; x += 12) g.lineBetween(x, bodyY + 4, x, bodyY + bodyH - 4);
  } else {
    for (let y = bodyY + 14; y < bodyY + bodyH - 6; y += 14) g.lineBetween(cx - bodyW / 2 + 4, y, cx + bodyW / 2 - 8, y);
  }
  // door
  g.fillStyle(OUT, 1).fillRoundedRect(cx - 9, footTop - 25, 18, 27, { tl: 9, tr: 9, bl: 0, br: 0 });
  g.fillStyle(0x5b3418, 1).fillRoundedRect(cx - 6, footTop - 21, 12, 23, { tl: 6, tr: 6, bl: 0, br: 0 });
  // type-coloured band
  const bandY = bodyY + bodyH * 0.3;
  g.fillStyle(OUT, 1).fillRect(cx - bodyW / 2, bandY - 3, bodyW, 17);
  g.fillStyle(col, 1).fillRect(cx - bodyW / 2 + 1, bandY, bodyW - 2, 11);
  g.fillStyle(lighten(col, 0.4), 0.7).fillRect(cx - bodyW / 2 + 1, bandY, bodyW - 2, 3);
  // banners for L2+ (two from L3)
  if (level >= 2) {
    const flags = level >= 3 ? [-1, 1] : [1];
    for (const f of flags) {
      const bx = cx + f * (bodyW / 2 - 12);
      poly(g, [[bx - 7, bandY + 10], [bx + 7, bandY + 10], [bx + 7, bandY + 36], [bx, bandY + 29], [bx - 7, bandY + 36]], col, 3, false);
    }
  }
  // top platform / battlements
  const topY = bodyY;
  if (level >= 3) {
    const pw = bodyW + 12;
    box(g, cx - pw / 2, topY - 10, pw, 14, 4, STONE);
    const n = level >= 5 ? 5 : 4;
    const mw = (pw - 6) / (n * 2 - 1);
    for (let i = 0; i < n; i++) box(g, cx - pw / 2 + 3 + i * mw * 2, topY - 22, mw, 14, 2, STONE, 3);
  } else if (level === 2) {
    box(g, cx - bodyW / 2 - 4, topY - 8, bodyW + 8, 12, 4, mixColor(STONE, col, 0.2));
  } else {
    poly(g, [[cx - bodyW / 2 - 8, topY + 4], [cx, topY - 22], [cx + bodyW / 2 + 8, topY + 4]], 0xc8553a, 4);
  }
  // gold trim and gem
  if (level >= 4) {
    g.fillStyle(GOLD, 1).fillRect(cx - footW / 2 + 3, footTop - 4, footW - 6, 5);
    g.fillStyle(GOLD, 1).fillRect(cx - bodyW / 2 - 2, topY + bodyH - 10, bodyW + 4, 5);
    g.fillStyle(0xffe58a, 1).fillRect(cx - bodyW / 2 - 2, topY + bodyH - 10, bodyW + 4, 2);
    const gy = bodyY + bodyH * 0.62;
    g.fillStyle(col, 0.35).fillCircle(cx, gy, 14);
    poly(g, [[cx, gy - 9], [cx + 8, gy], [cx, gy + 9], [cx - 8, gy]], lighten(col, 0.25), 3, false);
  }
  // L5 crown spikes
  let weaponY = topY - (level >= 3 ? 26 : level === 2 ? 22 : 36);
  if (level === 5) {
    const pw = bodyW + 12;
    for (let i = -2; i <= 2; i++) poly(g, [[cx + i * 14 - 6, topY - 22], [cx + i * 14, topY - 36 + Math.abs(i) * 4], [cx + i * 14 + 6, topY - 22]], GOLD, 3, false);
    void pw;
    weaponY = topY - 42;
  }
  // level pips on the footing
  for (let i = 0; i < level; i++) {
    const px = cx - (level - 1) * 7 + i * 14;
    circle(g, px, footTop + 12, 3.6, GOLD, 2);
  }
  weaponGlyph(g, type, cx, weaponY, 12 + level * 2.4);
}

// ---------------------------------------------------------------------------------------------
// Enemies (128x128, centred, feet at y~112, facing right)
// ---------------------------------------------------------------------------------------------

function paintEnemy(g: G, id: string): void {
  if (id === 'bat') groundShadow(g, 64, 112, 18, 6); else groundShadow(g, 64, 113, id === 'troll' ? 40 : 32, 9);
  drawEnemy(g, id);
}

function drawEnemy(g: G, id: string): void {
  switch (id) {
    case 'goblin': {
      const green = 0x7bc043;
      blob(g, 50, 100, 8, 9, darken(green, 0.2), 3);
      blob(g, 72, 100, 8, 9, darken(green, 0.2), 3);
      blob(g, 62, 78, 24, 26, 0x9a6a3a);
      blob(g, 62, 80, 17, 18, 0xc59055, 0);
      poly(g, [[40, 42], [14, 30], [38, 56]], green, 3, false);
      poly(g, [[86, 42], [112, 30], [88, 56]], green, 3, false);
      blob(g, 64, 50, 27, 23, green);
      eyes(g, 70, 48, 22, 7, 0x2b1d3a, 0xffee99);
      g.lineStyle(3, OUT, 1).lineBetween(66, 64, 82, 62);
      g.fillStyle(0xffffff, 1).fillTriangle(70, 63, 74, 63, 72, 69).fillTriangle(77, 62, 81, 61, 79, 67);
      line(g, 90, 82, 108, 62, 0x7a4523, 8, true);
      circle(g, 110, 60, 9, 0x5a3418, 3);
      break;
    }
    case 'rat': {
      const fur = 0x9a8c84;
      arc(g, 36, 92, 20, Math.PI * 0.9, Math.PI * 1.85, 0xe8a0a8, 5, true);
      blob(g, 56, 88, 34, 21, fur);
      blob(g, 40, 100, 6, 7, 0xe8a0a8, 3);
      blob(g, 76, 100, 6, 7, 0xe8a0a8, 3);
      blob(g, 92, 82, 19, 15, lighten(fur, 0.1));
      blob(g, 84, 66, 9, 10, 0xe8a0a8, 3);
      blob(g, 98, 68, 8, 9, 0xe8a0a8, 3);
      circle(g, 107, 85, 5, 0xff8a9a, 2);
      g.fillStyle(0x15101c, 1).fillCircle(96, 78, 4);
      g.fillStyle(0xffffff, 1).fillCircle(95, 77, 1.4);
      g.lineStyle(2, 0xffffff, 0.9).lineBetween(100, 88, 118, 84).lineBetween(100, 91, 118, 94);
      break;
    }
    case 'orc': {
      const green = 0x4f9a3a;
      blob(g, 46, 102, 11, 9, darken(green, 0.2), 3);
      blob(g, 82, 102, 11, 9, darken(green, 0.2), 3);
      blob(g, 64, 76, 38, 34, green);
      box(g, 32, 84, 64, 14, 4, 0x7a4523, 3);
      box(g, 56, 82, 16, 18, 3, GOLD, 3);
      blob(g, 28, 78, 11, 15, green, 3);
      blob(g, 100, 78, 11, 15, green, 3);
      blob(g, 66, 44, 24, 21, lighten(green, 0.08));
      poly(g, [[56, 54], [60, 66], [64, 54]], 0xffffff, 2, false);
      poly(g, [[74, 54], [78, 66], [82, 54]], 0xffffff, 2, false);
      g.fillStyle(0xff4a3a, 1).fillCircle(60, 42, 4.5).fillCircle(78, 42, 4.5);
      g.lineStyle(4, OUT, 1).lineBetween(52, 33, 66, 40).lineBetween(88, 33, 72, 40);
      break;
    }
    case 'skeleton': {
      const bone = 0xe8e4d4;
      line(g, 54, 92, 52, 110, bone, 7, true);
      line(g, 74, 92, 76, 110, bone, 7, true);
      box(g, 44, 62, 40, 36, 10, bone);
      g.lineStyle(3, 0x8a8570, 1);
      for (let y = 70; y < 94; y += 8) g.lineBetween(50, y, 76, y);
      line(g, 38, 70, 24, 90, bone, 6, true);
      line(g, 90, 70, 108, 56, bone, 6, true);
      line(g, 108, 56, 114, 30, 0xb9bbd1, 6, true);
      blob(g, 64, 42, 25, 22, bone);
      box(g, 54, 56, 22, 12, 4, bone, 3);
      g.fillStyle(OUT, 1).fillEllipse(55, 42, 14, 16).fillEllipse(75, 42, 14, 16);
      g.fillStyle(0x7dffb0, 1).fillCircle(57, 42, 3).fillCircle(77, 42, 3);
      g.fillStyle(OUT, 1).fillTriangle(64, 50, 61, 56, 67, 56);
      break;
    }
    case 'bat': {
      const pur = 0x7a4fb0;
      for (const f of [-1, 1]) {
        const x0 = 64 + f * 12;
        poly(g, [[x0, 52], [64 + f * 56, 30], [64 + f * 60, 70], [64 + f * 46, 62], [64 + f * 38, 78], [64 + f * 26, 66], [x0, 76]], darken(pur, 0.05), 4);
      }
      poly(g, [[56, 42], [52, 24], [64, 36]], pur, 3, false);
      poly(g, [[72, 42], [76, 24], [64, 36]], pur, 3, false);
      blob(g, 64, 62, 19, 22, lighten(pur, 0.12));
      eyes(g, 66, 56, 16, 6, 0x2b1d3a, 0xffee66);
      g.fillStyle(0xffffff, 1).fillTriangle(60, 70, 64, 70, 62, 77).fillTriangle(68, 70, 72, 70, 70, 77);
      break;
    }
    case 'shaman': {
      const robe = 0x3f6fb5;
      poly(g, [[40, 106], [48, 58], [80, 58], [90, 106]], robe, 4);
      g.fillStyle(0xf5c542, 1).fillRect(46, 94, 40, 6);
      line(g, 96, 112, 98, 30, 0x7a4523, 7, true);
      circle(g, 98, 26, 11, 0x5ef0ff, 3);
      g.fillStyle(0xffffff, 0.8).fillCircle(95, 23, 3.5);
      blob(g, 64, 48, 24, 24, mixColor(robe, 0x2a2060, 0.4));
      g.fillStyle(0x15101c, 1).fillEllipse(68, 50, 30, 22);
      g.fillStyle(0xffe14d, 1).fillCircle(62, 50, 4).fillCircle(77, 50, 4);
      poly(g, [[44, 40], [52, 18], [66, 30], [78, 18], [86, 40]], mixColor(robe, 0x2a2060, 0.4), 3, false);
      break;
    }
    case 'summoner': {
      const robe = 0xb03a5a;
      poly(g, [[34, 108], [46, 56], [82, 56], [96, 108]], robe, 4);
      g.fillStyle(GOLD, 1).fillRect(40, 98, 52, 7);
      poly(g, [[60, 60], [68, 60], [66, 100], [62, 100]], GOLD, 2, false);
      g.fillStyle(0xb35cff, 0.3).fillCircle(98, 52, 22);
      circle(g, 98, 52, 12, 0xb35cff, 3);
      g.fillStyle(0xffffff, 0.8).fillCircle(94, 48, 4);
      line(g, 84, 66, 94, 58, darken(robe, 0.1), 7, true);
      blob(g, 64, 44, 24, 24, darken(robe, 0.15));
      g.fillStyle(0x15101c, 1).fillEllipse(68, 46, 28, 20);
      g.fillStyle(0xb35cff, 1).fillCircle(62, 46, 4).fillCircle(76, 46, 4);
      poly(g, [[42, 36], [64, 12], [86, 36]], darken(robe, 0.15), 3, false);
      break;
    }
    case 'troll': {
      const skin = 0x8aa05a;
      blob(g, 44, 104, 13, 9, darken(skin, 0.2), 3);
      blob(g, 84, 104, 13, 9, darken(skin, 0.2), 3);
      blob(g, 28, 76, 13, 22, skin, 3);
      blob(g, 64, 74, 40, 36, skin);
      blob(g, 64, 82, 24, 22, lighten(skin, 0.25), 0);
      blob(g, 100, 78, 13, 20, skin, 3);
      line(g, 106, 92, 114, 34, 0x7a4523, 10, true);
      circle(g, 114, 30, 14, 0x8d6a45, 3);
      blob(g, 66, 40, 20, 18, lighten(skin, 0.05));
      g.fillStyle(0xffee99, 1).fillCircle(60, 38, 4).fillCircle(74, 38, 4);
      g.fillStyle(OUT, 1).fillCircle(61, 38, 2).fillCircle(75, 38, 2);
      g.fillStyle(OUT, 1).fillRoundedRect(54, 48, 24, 7, 3);
      g.fillStyle(0xffffff, 1).fillTriangle(58, 48, 62, 48, 60, 53).fillTriangle(70, 48, 74, 48, 72, 53);
      break;
    }
    case 'stoneling': {
      const rock = 0x8d8fa8;
      poly(g, [[34, 108], [24, 70], [40, 44], [66, 34], [92, 42], [106, 68], [98, 108]], rock, 5);
      poly(g, [[48, 100], [42, 70], [60, 52], [80, 56], [88, 80]], lighten(rock, 0.15), 3, false);
      g.lineStyle(3, darken(rock, 0.45), 1).lineBetween(70, 36, 66, 54).lineBetween(66, 54, 76, 66).lineBetween(34, 84, 48, 90);
      g.fillStyle(0x5e9a4a, 1).fillEllipse(48, 42, 22, 9);
      g.fillStyle(0xff8a3d, 1).fillEllipse(62, 66, 11, 13).fillEllipse(84, 66, 11, 13);
      g.fillStyle(0xffe58a, 1).fillCircle(64, 66, 3.5).fillCircle(86, 66, 3.5);
      break;
    }
    case 'imp':
    default: {
      const red = 0xe04a3a;
      arc(g, 30, 96, 20, Math.PI * 0.6, Math.PI * 1.5, red, 5, true);
      poly(g, [[22, 104], [16, 94], [30, 98]], 0xffb03b, 2, false);
      poly(g, [[44, 60], [14, 36], [24, 72], [36, 70]], darken(red, 0.1), 3);
      poly(g, [[84, 60], [114, 36], [104, 72], [92, 70]], darken(red, 0.1), 3);
      blob(g, 54, 104, 9, 8, darken(red, 0.2), 3);
      blob(g, 76, 104, 9, 8, darken(red, 0.2), 3);
      blob(g, 64, 80, 22, 24, red);
      blob(g, 64, 86, 13, 15, 0xf5b37a, 0);
      poly(g, [[48, 38], [42, 14], [58, 30]], 0xf5e0b0, 3, false);
      poly(g, [[80, 38], [86, 14], [70, 30]], 0xf5e0b0, 3, false);
      blob(g, 64, 48, 25, 22, lighten(red, 0.06));
      eyes(g, 70, 46, 22, 7, 0x2b1d3a, 0xffee66);
      g.lineStyle(3, OUT, 1).beginPath().arc(70, 54, 10, 0.2, Math.PI - 0.2, false).strokePath();
      break;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Bosses (320x320 = 128 space x 2.5, feet at y~290)
// ---------------------------------------------------------------------------------------------

function paintBoss(g: G, id: string): void {
  g.fillStyle(0x000000, 0.28).fillEllipse(160, 296, 220, 40);
  g.save();
  g.scaleCanvas(2.5, 2.5);
  if (id === 'goblinKing') {
    // cape behind, goblin on top, crown and heavy belly
    poly(g, [[34, 52], [94, 52], [108, 112], [20, 112]], 0xb02a3a, 4);
    drawEnemy(g, 'goblin');
    blob(g, 62, 86, 22, 20, 0xc59055, 0);
    g.fillStyle(GOLD, 1).fillRect(46, 62, 34, 5);
    poly(g, [[44, 32], [44, 14], [54, 24], [64, 8], [74, 24], [84, 14], [84, 32]], GOLD, 3);
    circle(g, 64, 22, 3.5, 0xff5a4f, 2);
  } else if (id === 'stoneGolem') {
    const rock = 0x8d8fa8;
    box(g, 38, 96, 20, 18, 5, darken(rock, 0.15), 3);
    box(g, 70, 96, 20, 18, 5, darken(rock, 0.15), 3);
    box(g, 14, 50, 22, 48, 8, darken(rock, 0.1), 3);
    box(g, 92, 50, 22, 48, 8, darken(rock, 0.1), 3);
    box(g, 30, 48, 68, 56, 12, rock, 4);
    g.lineStyle(3, darken(rock, 0.45), 1).lineBetween(64, 48, 58, 66).lineBetween(58, 66, 72, 78).lineBetween(40, 90, 54, 96);
    g.fillStyle(0x5e9a4a, 1).fillEllipse(44, 49, 22, 8);
    g.fillStyle(0xff8a3d, 0.4).fillCircle(64, 76, 14);
    circle(g, 64, 76, 7, 0xff8a3d, 2);
    box(g, 42, 20, 44, 34, 9, lighten(rock, 0.08), 4);
    g.fillStyle(0x15101c, 1).fillRoundedRect(48, 31, 32, 10, 3);
    g.fillStyle(0x5ef0ff, 1).fillCircle(56, 36, 4).fillCircle(72, 36, 4);
    g.fillStyle(0xffffff, 0.9).fillCircle(55, 35, 1.4).fillCircle(71, 35, 1.4);
  } else {
    // dragon: tail, wings, body, belly, head facing right
    const red = 0xd8452f;
    g.translateCanvas(-5, 0);
    arc(g, 34, 92, 22, Math.PI * 0.55, Math.PI * 1.45, red, 12, true);
    poly(g, [[34, 98], [22, 92], [34, 82]], 0xffb03b, 3, false);
    poly(g, [[44, 70], [24, 18], [56, 40], [64, 14], [78, 48], [96, 26], [94, 74]], darken(red, 0.12), 4);
    blob(g, 50, 106, 11, 8, darken(red, 0.2), 3);
    blob(g, 78, 106, 11, 8, darken(red, 0.2), 3);
    blob(g, 62, 82, 36, 30, red);
    blob(g, 70, 90, 20, 20, 0xf5d08a, 0);
    for (let i = 0; i < 4; i++) poly(g, [[44 + i * 10, 54 + (i === 0 ? 4 : 0)], [48 + i * 10, 44 + i], [52 + i * 10, 54]], 0xffb03b, 2, false);
    blob(g, 88, 56, 24, 20, lighten(red, 0.05));
    blob(g, 108, 62, 14, 11, lighten(red, 0.12));
    poly(g, [[78, 40], [72, 18], [88, 34]], 0xf5e0b0, 3, false);
    poly(g, [[92, 38], [92, 16], [102, 36]], 0xf5e0b0, 3, false);
    g.fillStyle(0xffffff, 1).fillCircle(90, 52, 6);
    g.fillStyle(0xffe14d, 1).fillCircle(91, 52, 4.5);
    g.fillStyle(OUT, 1).fillEllipse(92, 52, 2.2, 6);
    g.fillStyle(OUT, 1).fillCircle(113, 59, 1.8);
    g.fillStyle(0xff8a3d, 0.5).fillCircle(121, 68, 8);
    g.lineStyle(3, OUT, 1).lineBetween(104, 68, 118, 68);
  }
  g.restore();
}

// ---------------------------------------------------------------------------------------------
// Projectiles (64x64, pointing right)
// ---------------------------------------------------------------------------------------------

function paintProjectile(g: G, kind: string): void {
  const c = 32;
  switch (kind) {
    case 'arrow':
      line(g, 6, c, 50, c, 0xe8d9b0, 5, true);
      poly(g, [[60, c], [46, c - 9], [46, c + 9]], 0xcfd5e6, 3);
      poly(g, [[4, c - 9], [16, c - 3], [16, c + 3], [4, c + 9], [10, c]], 0x5cb85c, 3, false);
      break;
    case 'cannonball':
      circle(g, c, c, 15, 0x3a3e50, 4);
      g.fillStyle(0x6b7088, 1).fillEllipse(c - 5, c - 5, 10, 7);
      g.fillStyle(0xffffff, 0.8).fillCircle(c - 7, c - 7, 2.5);
      break;
    case 'frostShard':
      poly(g, [[60, c], [32, c - 12], [6, c], [32, c + 12]], 0x7fdcff, 4);
      g.fillStyle(0xe8fbff, 0.9).fillTriangle(54, c, 32, c - 9, 20, c - 1);
      break;
    case 'fireball':
      g.fillStyle(0xff5a36, 0.4).fillCircle(24, c, 18);
      poly(g, [[4, c], [30, c - 12], [30, c + 12]], 0xff8a3d, 3, false);
      circle(g, 40, c, 15, 0xff5a36, 4);
      g.fillStyle(0xffb03b, 1).fillCircle(41, c, 10);
      g.fillStyle(0xffe58a, 1).fillCircle(43, c - 1, 5);
      break;
    case 'poisonGlob':
      g.fillStyle(OUT, 1).fillEllipse(34, c, 38, 32).fillCircle(14, c + 6, 8);
      g.fillStyle(0x8be04e, 1).fillEllipse(34, c, 32, 26).fillCircle(14, c + 6, 5);
      g.fillStyle(0xc9ff9a, 0.8).fillEllipse(30, c - 6, 12, 7);
      g.fillStyle(0x7a3fa0, 1).fillCircle(40, c + 5, 4);
      break;
    case 'magicOrb':
      g.fillStyle(0xe05ad6, 0.3).fillCircle(c, c, 28);
      circle(g, c, c, 15, 0xe05ad6, 4);
      g.fillStyle(0x5ef0ff, 1).fillCircle(c, c, 9);
      g.fillStyle(0xffffff, 1).fillCircle(c - 3, c - 3, 4);
      break;
    case 'shard':
      poly(g, [[62, c], [26, c - 9], [4, c - 3], [4, c + 3], [26, c + 9]], 0xd4a64a, 3);
      g.fillStyle(0xfff0b0, 0.9).fillTriangle(56, c, 26, c - 6, 14, c);
      break;
    case 'bomblet':
      line(g, 40, 15, 46, 8, 0xe8d9b0, 3);
      g.fillStyle(0xffb03b, 1).fillCircle(48, 8, 4);
      circle(g, 30, 36, 15, 0x3a3e50, 4);
      g.fillStyle(0x6b7088, 1).fillEllipse(25, 31, 9, 6);
      box(g, 36, 17, 10, 8, 2, 0x6b7088, 3);
      break;
    case 'meteor':
    default:
      g.fillStyle(0xff5a36, 0.35).fillCircle(22, c, 22);
      poly(g, [[2, c - 4], [28, c - 16], [28, c + 16], [2, c + 6]], 0xff8a3d, 3, false);
      poly(g, [[60, c - 4], [50, c - 15], [32, c - 14], [24, c + 2], [32, c + 15], [52, c + 14]], 0x7a6a5e, 4);
      g.fillStyle(0xffb03b, 0.9).fillEllipse(42, c - 6, 12, 7);
      g.fillStyle(0x4a3a30, 1).fillCircle(46, c + 6, 3).fillCircle(36, c + 2, 2.4);
      break;
  }
}

// ---------------------------------------------------------------------------------------------
// Icons (128x128): rounded badge + glyph
// ---------------------------------------------------------------------------------------------

type IconStyle = { color: number; glyph: string };
const ICON_STYLES: Record<string, IconStyle> = {
  damage: { color: 0xe0503a, glyph: 'sword' }, speed: { color: 0x4fa3ff, glyph: 'chevrons' },
  range: { color: 0x5ed06a, glyph: 'rings' }, coin: { color: 0xf5c542, glyph: 'coin' },
  heart: { color: 0xe0405a, glyph: 'heart' }, shield: { color: 0x4f7fd0, glyph: 'shield' },
  crit: { color: 0xe0503a, glyph: 'burst' }, chain: { color: 0x9d6bff, glyph: 'bolt' },
  explosion: { color: 0xff8a3d, glyph: 'burst' }, split: { color: 0x2fb7a0, glyph: 'split' },
  meteor: { color: 0xff7a3a, glyph: 'meteor' }, freeze: { color: 0x7fdcff, glyph: 'snow' },
  repair: { color: 0x5ed06a, glyph: 'cross' }, frenzy: { color: 0xffb627, glyph: 'flame' },
  skull: { color: 0x8a7fa0, glyph: 'skull' }, star: { color: 0xffb627, glyph: 'star' },
  clock: { color: 0x4fa3ff, glyph: 'clock' }, merge: { color: 0x2fb7a0, glyph: 'merge' },
  vortex: { color: 0x7a4fd0, glyph: 'spiral' }, gem: { color: 0x2fb7d0, glyph: 'gem' },
  chest: { color: 0xa8673a, glyph: 'chest' }, merchant: { color: 0xc48a1c, glyph: 'bag' },
  curse: { color: 0x7a3fa0, glyph: 'skull' }, treasure: { color: 0xf5c542, glyph: 'chest' },
  elite: { color: 0xc03a5a, glyph: 'crown' }, trophy: { color: 0xf5c542, glyph: 'trophy' },
  lock: { color: 0x59607c, glyph: 'lock' }, slot: { color: 0x8d8fa8, glyph: 'slot' },
  crown: { color: 0xf5c542, glyph: 'crown' }, dragon: { color: 0xd8452f, glyph: 'flame' },
  golem: { color: 0x8d8fa8, glyph: 'golem' }, eye: { color: 0x7a4fd0, glyph: 'eye' },
  target: { color: 0xe0503a, glyph: 'target' }, castle: { color: 0x8d8fa8, glyph: 'castle' },
};

function paintIcon(g: G, name: string): void {
  const towerColor = TOWER_COLORS[name];
  const style = ICON_STYLES[name] ?? { color: 0x6a74a8, glyph: 'star' };
  // abilities that share a tower id (e.g. 'arrow' tower icon) use the tower look
  const isTower = towerColor !== undefined;
  const color = isTower ? towerColor : style.color;
  const c = 64;
  g.fillStyle(0x000000, 0.25).fillEllipse(c, 118, 90, 14);
  g.fillStyle(OUT, 1).fillCircle(c, c, 58);
  g.fillStyle(darken(color, 0.35), 1).fillCircle(c, c, 53);
  g.fillStyle(color, 1).fillCircle(c - 2, c - 3, 48);
  g.fillStyle(lighten(color, 0.4), 0.5).fillEllipse(c - 14, c - 30, 50, 20);
  if (isTower) { weaponGlyph(g, name, c, c + 2, 24); return; }
  glyph(g, style.glyph, c, c, 30);
}

function glyph(g: G, kind: string, x: number, y: number, s: number): void {
  const W = 0xffffff;
  switch (kind) {
    case 'sword':
      poly(g, [[x + s * 0.9, y - s * 0.9], [x + s * 0.9, y - s * 0.45], [x - s * 0.15, y + s * 0.6], [x - s * 0.6, y + s * 0.15], [x + s * 0.45, y - s * 0.9]], 0xe8eef8, 3);
      line(g, x - s * 0.75, y + s * 0.3, x - s * 0.2, y + s * 0.85, GOLD, 8, true);
      line(g, x - s * 0.5, y + s * 0.5, x - s * 0.9, y + s * 0.9, 0x7a4523, 7, true);
      break;
    case 'chevrons':
      for (const dx of [-s * 0.5, s * 0.25]) poly(g, [[x + dx - s * 0.3, y - s * 0.8], [x + dx + s * 0.4, y], [x + dx - s * 0.3, y + s * 0.8], [x + dx - s * 0.6, y + s * 0.5], [x + dx - s * 0.1, y], [x + dx - s * 0.6, y - s * 0.5]], W, 3, false);
      break;
    case 'rings':
      g.lineStyle(7, OUT, 1).strokeCircle(x, y, s * 0.95).strokeCircle(x, y, s * 0.5);
      g.lineStyle(4, W, 1).strokeCircle(x, y, s * 0.95).strokeCircle(x, y, s * 0.5);
      circle(g, x, y, s * 0.18, W, 3);
      break;
    case 'coin':
      circle(g, x, y, s * 0.95, GOLD, 4);
      circle(g, x, y, s * 0.62, 0xffe58a, 3);
      g.fillStyle(0xc48a1c, 1).fillRoundedRect(x - s * 0.1, y - s * 0.4, s * 0.2, s * 0.8, 3);
      break;
    case 'heart':
      g.fillStyle(OUT, 1).fillCircle(x - s * 0.42, y - s * 0.2, s * 0.62).fillCircle(x + s * 0.42, y - s * 0.2, s * 0.62).fillTriangle(x - s * 1.0, y, x + s * 1.0, y, x, y + s * 1.05);
      g.fillStyle(0xff5a6a, 1).fillCircle(x - s * 0.42, y - s * 0.2, s * 0.5).fillCircle(x + s * 0.42, y - s * 0.2, s * 0.5).fillTriangle(x - s * 0.9, y - s * 0.02, x + s * 0.9, y - s * 0.02, x, y + s * 0.92);
      g.fillStyle(W, 0.6).fillEllipse(x - s * 0.5, y - s * 0.4, s * 0.3, s * 0.2);
      break;
    case 'shield':
      poly(g, [[x - s * 0.8, y - s * 0.8], [x + s * 0.8, y - s * 0.8], [x + s * 0.8, y + s * 0.1], [x, y + s * 0.95], [x - s * 0.8, y + s * 0.1]], 0xdfe6f5, 4);
      poly(g, [[x - s * 0.5, y - s * 0.5], [x + s * 0.5, y - s * 0.5], [x + s * 0.5, y], [x, y + s * 0.6], [x - s * 0.5, y]], 0x4f7fd0, 2, false);
      break;
    case 'burst':
      poly(g, star(g, x, y, s * 1.05, s * 0.5, 8), 0xffe14d, 4);
      poly(g, star(g, x, y, s * 0.6, s * 0.3, 8), 0xff8a3d, 2, false);
      break;
    case 'bolt':
      poly(g, [[x + s * 0.3, y - s], [x - s * 0.65, y + s * 0.15], [x - s * 0.05, y + s * 0.15], [x - s * 0.3, y + s], [x + s * 0.65, y - s * 0.2], [x + s * 0.05, y - s * 0.2]], 0xffe14d, 4);
      break;
    case 'split':
      line(g, x, y + s * 0.9, x, y, W, 8, true);
      line(g, x, y, x - s * 0.75, y - s * 0.7, W, 8, true);
      line(g, x, y, x + s * 0.75, y - s * 0.7, W, 8, true);
      poly(g, [[x - s * 0.95, y - s * 0.95], [x - s * 0.35, y - s * 0.85], [x - s * 0.85, y - s * 0.35]], W, 3, false);
      poly(g, [[x + s * 0.95, y - s * 0.95], [x + s * 0.35, y - s * 0.85], [x + s * 0.85, y - s * 0.35]], W, 3, false);
      break;
    case 'meteor':
      poly(g, [[x - s, y - s], [x + s * 0.1, y - s * 0.45], [x - s * 0.45, y + s * 0.1]], 0xffe14d, 3, false);
      poly(g, [[x + s * 0.9, y + s * 0.2], [x + s * 0.4, y + s * 0.85], [x - s * 0.2, y + s * 0.7], [x - s * 0.3, y], [x + s * 0.25, y - s * 0.3]], 0x7a6a5e, 4);
      break;
    case 'snow':
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3;
        line(g, x - Math.cos(a) * s, y - Math.sin(a) * s, x + Math.cos(a) * s, y + Math.sin(a) * s, W, 7, true);
      }
      break;
    case 'cross':
      poly(g, [[x - s * 0.3, y - s * 0.95], [x + s * 0.3, y - s * 0.95], [x + s * 0.3, y - s * 0.3], [x + s * 0.95, y - s * 0.3], [x + s * 0.95, y + s * 0.3], [x + s * 0.3, y + s * 0.3], [x + s * 0.3, y + s * 0.95], [x - s * 0.3, y + s * 0.95], [x - s * 0.3, y + s * 0.3], [x - s * 0.95, y + s * 0.3], [x - s * 0.95, y - s * 0.3], [x - s * 0.3, y - s * 0.3]], W, 4, false);
      break;
    case 'flame':
      poly(g, [[x, y - s * 1.1], [x + s * 0.8, y + s * 0.1], [x + s * 0.5, y + s * 0.8], [x - s * 0.5, y + s * 0.8], [x - s * 0.8, y + s * 0.1], [x - s * 0.25, y - s * 0.25]], 0xff8a3d, 4, false);
      poly(g, [[x, y - s * 0.1], [x + s * 0.4, y + s * 0.4], [x, y + s * 0.8], [x - s * 0.4, y + s * 0.4]], 0xffe14d, 2, false);
      break;
    case 'skull':
      blob(g, x, y - s * 0.1, s * 0.85, s * 0.75, 0xe8e4d4);
      box(g, x - s * 0.4, y + s * 0.4, s * 0.8, s * 0.5, 4, 0xe8e4d4, 3);
      g.fillStyle(OUT, 1).fillEllipse(x - s * 0.33, y - s * 0.1, s * 0.4, s * 0.45).fillEllipse(x + s * 0.33, y - s * 0.1, s * 0.4, s * 0.45).fillTriangle(x, y + s * 0.15, x - s * 0.1, y + s * 0.35, x + s * 0.1, y + s * 0.35);
      break;
    case 'star':
      poly(g, star(g, x, y, s * 1.05, s * 0.45, 5), 0xffe14d, 4);
      break;
    case 'clock':
      circle(g, x, y, s * 0.95, W, 4);
      line(g, x, y, x, y - s * 0.6, OUT, 5);
      line(g, x, y, x + s * 0.45, y + s * 0.2, OUT, 5);
      break;
    case 'merge':
      circle(g, x - s * 0.45, y + s * 0.35, s * 0.45, W, 3);
      circle(g, x + s * 0.45, y + s * 0.35, s * 0.45, W, 3);
      poly(g, [[x, y - s * 1.0], [x + s * 0.5, y - s * 0.35], [x + s * 0.18, y - s * 0.35], [x + s * 0.18, y], [x - s * 0.18, y], [x - s * 0.18, y - s * 0.35], [x - s * 0.5, y - s * 0.35]], 0xffe14d, 3, false);
      break;
    case 'spiral':
      arc(g, x, y, s * 0.85, 0, Math.PI * 1.6, W, 7, true);
      arc(g, x, y, s * 0.45, Math.PI, Math.PI * 2.6, W, 7, true);
      break;
    case 'gem':
      poly(g, [[x - s * 0.6, y - s * 0.8], [x + s * 0.6, y - s * 0.8], [x + s * 1.0, y - s * 0.15], [x, y + s], [x - s * 1.0, y - s * 0.15]], 0x5ef0ff, 4);
      g.lineStyle(2, W, 0.9).lineBetween(x - s * 1.0, y - s * 0.15, x + s * 1.0, y - s * 0.15).lineBetween(x - s * 0.3, y - s * 0.8, x - s * 0.5, y - s * 0.15).lineBetween(x + s * 0.3, y - s * 0.8, x + s * 0.5, y - s * 0.15);
      break;
    case 'chest':
      box(g, x - s * 0.95, y - s * 0.1, s * 1.9, s * 0.95, 5, 0xa8673a, 4);
      box(g, x - s * 0.95, y - s * 0.85, s * 1.9, s * 0.8, 12, 0xcf8c55, 4);
      g.fillStyle(GOLD, 1).fillRect(x - s * 0.9, y - s * 0.15, s * 1.8, s * 0.12);
      circle(g, x, y + s * 0.05, s * 0.2, GOLD, 3);
      break;
    case 'bag':
      poly(g, [[x - s * 0.35, y - s * 0.6], [x + s * 0.35, y - s * 0.6], [x + s * 0.95, y + s * 0.5], [x + s * 0.5, y + s * 0.95], [x - s * 0.5, y + s * 0.95], [x - s * 0.95, y + s * 0.5]], 0xd9a05a, 4);
      box(g, x - s * 0.45, y - s * 0.85, s * 0.9, s * 0.35, 4, 0xa8673a, 3);
      circle(g, x, y + s * 0.3, s * 0.32, GOLD, 3);
      break;
    case 'crown':
      poly(g, [[x - s, y + s * 0.7], [x - s, y - s * 0.7], [x - s * 0.45, y - s * 0.1], [x, y - s * 0.95], [x + s * 0.45, y - s * 0.1], [x + s, y - s * 0.7], [x + s, y + s * 0.7]], GOLD, 4);
      g.fillStyle(0xff5a4f, 1).fillCircle(x, y + s * 0.15, s * 0.2);
      break;
    case 'trophy':
      arc(g, x - s * 0.85, y - s * 0.2, s * 0.4, Math.PI * 0.5, Math.PI * 1.5, GOLD, 6, true);
      arc(g, x + s * 0.85, y - s * 0.2, s * 0.4, -Math.PI * 0.5, Math.PI * 0.5, GOLD, 6, true);
      poly(g, [[x - s * 0.7, y - s * 0.9], [x + s * 0.7, y - s * 0.9], [x + s * 0.55, y + s * 0.1], [x, y + s * 0.4], [x - s * 0.55, y + s * 0.1]], GOLD, 4);
      box(g, x - s * 0.15, y + s * 0.35, s * 0.3, s * 0.35, 2, GOLD, 3);
      box(g, x - s * 0.55, y + s * 0.65, s * 1.1, s * 0.28, 5, 0xc48a1c, 3);
      break;
    case 'lock':
      arc(g, x, y - s * 0.3, s * 0.5, Math.PI, Math.PI * 2, 0xdfe6f5, 8, true);
      box(g, x - s * 0.75, y - s * 0.3, s * 1.5, s * 1.2, 7, 0xf5c542, 4);
      g.fillStyle(OUT, 1).fillCircle(x, y + s * 0.15, s * 0.16).fillRect(x - s * 0.06, y + s * 0.15, s * 0.12, s * 0.35);
      break;
    case 'slot':
      box(g, x - s * 0.85, y - s * 0.85, s * 1.7, s * 1.7, 10, 0xb9bbd1, 4);
      g.fillStyle(0x686a85, 1).fillRoundedRect(x - s * 0.5, y - s * 0.5, s, s, 6);
      g.fillStyle(W, 1).fillRect(x - s * 0.1, y - s * 0.35, s * 0.2, s * 0.7).fillRect(x - s * 0.35, y - s * 0.1, s * 0.7, s * 0.2);
      break;
    case 'golem':
      box(g, x - s * 0.8, y - s * 0.8, s * 1.6, s * 1.6, 10, 0xb9bbd1, 4);
      g.fillStyle(0x15101c, 1).fillRoundedRect(x - s * 0.55, y - s * 0.25, s * 1.1, s * 0.4, 4);
      g.fillStyle(0xff8a3d, 1).fillCircle(x - s * 0.28, y - s * 0.05, s * 0.14).fillCircle(x + s * 0.28, y - s * 0.05, s * 0.14);
      break;
    case 'eye':
      poly(g, [[x - s * 1.0, y], [x - s * 0.4, y - s * 0.6], [x + s * 0.4, y - s * 0.6], [x + s * 1.0, y], [x + s * 0.4, y + s * 0.6], [x - s * 0.4, y + s * 0.6]], W, 4, false);
      circle(g, x, y, s * 0.4, 0xb35cff, 3);
      g.fillStyle(OUT, 1).fillCircle(x, y, s * 0.18);
      break;
    case 'target':
      circle(g, x, y, s * 0.98, W, 4);
      circle(g, x, y, s * 0.64, 0xe0503a, 3);
      circle(g, x, y, s * 0.3, W, 3);
      break;
    case 'castle':
      box(g, x - s * 0.8, y - s * 0.2, s * 1.6, s * 1.05, 4, 0xdfe0ee, 4);
      for (const dx of [-0.8, -0.2, 0.4]) box(g, x + s * dx, y - s * 0.55, s * 0.4, s * 0.4, 2, 0xdfe0ee, 3);
      g.fillStyle(OUT, 1).fillRoundedRect(x - s * 0.2, y + s * 0.25, s * 0.4, s * 0.6, { tl: s * 0.2, tr: s * 0.2, bl: 0, br: 0 });
      break;
    default:
      poly(g, star(g, x, y, s, s * 0.45, 5), 0xffe14d, 4);
  }
}

// ---------------------------------------------------------------------------------------------
// Castle, slots, backgrounds
// ---------------------------------------------------------------------------------------------

function paintCastle(g: G): void {
  groundShadow(g, 192, 240, 170, 14);
  const wall = 0xb9bbd1;
  box(g, 20, 150, 344, 84, 8, wall, 5);
  g.lineStyle(2, 0x686a85, 0.6);
  for (let y = 168; y < 230; y += 18) g.lineBetween(26, y, 350, y);
  for (let i = 0; i < 9; i++) box(g, 26 + i * 38, 134, 24, 20, 3, wall, 4);
  for (const x of [24, 312]) {
    box(g, x, 70, 48, 164, 6, STONE, 5);
    box(g, x - 8, 56, 64, 22, 5, wall, 5);
    poly(g, [[x - 10, 58], [x + 24, 4], [x + 58, 58]], 0xc8553a, 5);
    g.fillStyle(OUT, 1).fillRoundedRect(x + 17, 102, 14, 26, 7);
  }
  box(g, 128, 40, 128, 194, 8, wall, 5);
  g.lineStyle(2, 0x686a85, 0.6);
  for (let y = 62; y < 230; y += 18) g.lineBetween(134, y, 246, y);
  for (let i = 0; i < 4; i++) box(g, 132 + i * 32, 22, 22, 22, 3, wall, 4);
  poly(g, [[122, 40], [192, 16], [262, 40]], 0xc8553a, 5);
  line(g, 192, 16, 192, 4, 0x7a4523, 4);
  poly(g, [[193, 6], [222, 13], [193, 20]], 0xe0405a, 3, false);
  g.fillStyle(OUT, 1).fillRoundedRect(150, 150, 84, 90, { tl: 42, tr: 42, bl: 0, br: 0 });
  g.fillStyle(0x7a4523, 1).fillRoundedRect(156, 156, 72, 84, { tl: 36, tr: 36, bl: 0, br: 0 });
  g.lineStyle(3, 0x4a2a12, 1);
  for (const x of [174, 192, 210]) g.lineBetween(x, 160, x, 240);
  g.fillStyle(GOLD, 1).fillCircle(186, 205, 4).fillCircle(198, 205, 4);
  g.fillStyle(0x15101c, 1).fillRoundedRect(176, 88, 32, 44, { tl: 16, tr: 16, bl: 0, br: 0 });
  g.fillStyle(0xffd35e, 0.9).fillRoundedRect(180, 94, 24, 38, { tl: 12, tr: 12, bl: 0, br: 0 });
}

function paintSlot(g: G, locked: boolean): void {
  const c = 64;
  groundShadow(g, c, c + 8, 54, 40);
  g.fillStyle(OUT, 1).fillRoundedRect(8, 8, 112, 112, 26);
  g.fillStyle(locked ? 0x5a5d73 : 0x9a9cb4, 1).fillRoundedRect(12, 12, 104, 104, 22);
  g.fillStyle(locked ? 0x44475c : 0x7d7f99, 1).fillRoundedRect(20, 20, 88, 88, 16);
  g.fillStyle(locked ? 0x383b4d : 0x6a6c87, 1).fillRoundedRect(24, 24, 80, 80, 12);
  g.fillStyle(0xffffff, locked ? 0.05 : 0.14).fillRoundedRect(28, 28, 72, 18, 9);
  g.lineStyle(3, locked ? 0x2b2e40 : 0x585a75, 1);
  g.lineBetween(14, 64, 20, 64).lineBetween(108, 64, 114, 64).lineBetween(64, 14, 64, 20).lineBetween(64, 108, 64, 114);
  if (!locked) {
    g.lineStyle(4, 0xb9bbd1, 0.5).strokeCircle(c, c, 22);
  } else {
    glyph(g, 'lock', c, c + 2, 24);
  }
}

function rng(seed: string): Phaser.Math.RandomDataGenerator {
  return new Phaser.Math.RandomDataGenerator([seed]);
}

function paintBoard(g: G, w: number, h: number): void {
  const r = rng('board');
  g.fillStyle(0x7fbf4d, 1).fillRect(0, 0, w, h);
  // mown stripes
  for (let y = 0; y < h; y += 90) {
    if (((y / 90) | 0) % 2 === 0) g.fillStyle(0x93cf5f, 0.16).fillRect(0, y, w, 90);
  }
  // big soft patches
  for (let i = 0; i < 60; i++) {
    const light = r.frac() > 0.5;
    g.fillStyle(light ? 0x93cf5f : 0x6aa83f, 0.2).fillEllipse(r.between(0, w), r.between(0, h), r.between(90, 240), r.between(50, 130));
  }
  // grass blades
  for (let i = 0; i < 2600; i++) {
    const x = r.between(0, w);
    const y = r.between(0, h);
    const dark = r.frac() > 0.45;
    g.lineStyle(2, dark ? 0x62a03a : 0xa4dc6c, dark ? 0.5 : 0.55);
    g.lineBetween(x, y, x + r.between(-3, 3), y - r.between(5, 11));
  }
  // flowers
  for (let i = 0; i < 70; i++) {
    const x = r.between(10, w - 10);
    const y = r.between(10, h - 10);
    const col = [0xffffff, 0xffe14d, 0xff9ac4, 0xb9e4ff][r.between(0, 3)];
    g.fillStyle(col, 0.9).fillCircle(x, y, 3.2);
    g.fillStyle(0xffe14d, 1).fillCircle(x, y, 1.2);
  }
  // little bushes and rocks near the edges
  for (let i = 0; i < 26; i++) {
    const left = r.frac() > 0.5;
    const x = left ? r.between(-10, 30) : r.between(w - 30, w + 10);
    const y = r.between(0, h);
    g.fillStyle(0x000000, 0.18).fillEllipse(x + 4, y + 18, 54, 14);
    g.fillStyle(0x4e8f34, 1).fillCircle(x, y, r.between(16, 26));
    g.fillStyle(0x6aa83f, 1).fillCircle(x - 6, y - 6, 12);
  }
  // vignette so the playfield reads brighter than the edges
  for (let i = 0; i < 14; i++) {
    g.lineStyle(14, 0x1a3a14, 0.035).strokeRect(i * 7 - 7, i * 7 - 7, w - i * 14 + 14, h - i * 14 + 14);
  }
}

function paintMenuBg(g: G, w: number, h: number): void {
  const r = rng('menu');
  const top = 0x1d2a63;
  const mid = 0x6a3f8f;
  const low = 0xf08a5a;
  const bands = 64;
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1);
    const c = t < 0.65 ? mixColor(top, mid, t / 0.65) : mixColor(mid, low, (t - 0.65) / 0.35);
    g.fillStyle(c, 1).fillRect(0, (h / bands) * i, w, h / bands + 1);
  }
  for (let i = 0; i < 90; i++) g.fillStyle(0xffffff, r.realInRange(0.2, 0.8)).fillCircle(r.between(0, w), r.between(0, h * 0.55), r.realInRange(1, 3));
  g.fillStyle(0xfff0c0, 0.12).fillCircle(540, 230, 90).fillStyle(0xfff0c0, 0.9).fillCircle(540, 230, 52);
  g.fillStyle(0xd8c89a, 0.4).fillCircle(524, 216, 12).fillCircle(556, 244, 9);
  const hills: Array<[number, number, number]> = [[0x4a3f7a, 0.72, 0.1], [0x35507a, 0.78, 0.14], [0x2d6a4a, 0.86, 0.2], [0x1f4d36, 0.94, 0.3]];
  for (const [col, yy, amp] of hills) {
    g.fillStyle(col, 1).beginPath().moveTo(0, h);
    for (let x = 0; x <= w; x += 20) g.lineTo(x, h * yy + Math.sin(x * 0.011 + yy * 20) * h * amp * 0.18);
    g.lineTo(w, h).closePath().fillPath();
  }
}

// ---------------------------------------------------------------------------------------------
// FX particles (64x64, white-ish, tinted in code)
// ---------------------------------------------------------------------------------------------

function paintGlow(g: G): void {
  for (let i = 0; i < 24; i++) g.fillStyle(0xffffff, 0.045).fillCircle(32, 32, 31 - i * 1.25);
}

function paintSpark(g: G): void {
  for (let i = 0; i < 8; i++) g.fillStyle(0xffffff, 0.05).fillCircle(32, 32, 20 - i * 2);
  g.fillStyle(0xffffff, 1).fillPoints(star(g, 32, 32, 30, 4.5, 4).map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
  g.fillStyle(0xffffff, 1).fillCircle(32, 32, 4);
}

function paintRing(g: G): void {
  g.lineStyle(10, 0xffffff, 0.25).strokeCircle(32, 32, 26);
  g.lineStyle(5, 0xffffff, 0.95).strokeCircle(32, 32, 26);
}

function paintStar(g: G): void {
  g.fillStyle(0xffffff, 0.2).fillCircle(32, 32, 28);
  g.fillStyle(0xffffff, 1).fillPoints(star(g, 32, 33, 28, 12, 5).map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
}

function paintSmoke(g: G): void {
  const r = rng('smoke');
  for (let i = 0; i < 9; i++) {
    const a = r.realInRange(0, Math.PI * 2);
    const d = r.realInRange(0, 11);
    for (let k = 0; k < 4; k++) g.fillStyle(0xffffff, 0.12).fillCircle(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 18 - k * 3 + r.realInRange(0, 3));
  }
}

function paintCoin(g: G): void {
  circle(g, 32, 32, 25, GOLD, 4);
  circle(g, 32, 32, 17, 0xffe58a, 3);
  g.fillStyle(0xc48a1c, 1).fillRoundedRect(29, 21, 6, 22, 2);
  g.fillStyle(0xffffff, 0.85).fillEllipse(23, 20, 10, 5);
}
