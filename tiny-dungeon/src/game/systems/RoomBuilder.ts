import Phaser from 'phaser';
import type { RoomType } from '../../core/types';
import { COLORS, EXTRA_KEY, ICONS_KEY, TILES_KEY, TILE, TILE_FRAMES } from '../assets';
import { label } from '../ui/kit';
import { DOOR_ROW_Y, ENTRY, hash2 } from './layout';
import { FX_GLOW, FX_VIGNETTE, ensureFxTextures } from './Effects';

// Builds the single-screen dungeon room: floor and walls are painted once per room onto a small
// canvas (16 px tiles, scaled x3 with nearest filtering), then torches, decorations, doors and the
// vignette are separate sprites.

const COLS = 15;
const ROWS = 27;
const BG_KEY = 'room_bg';
const DOOR_CLOSED = [46, 47];
const DOOR_OPEN = [34, 35];

const ROOM_ICON: Record<RoomType, string> = { combat: 'sword', elite: 'skull', treasure: 'chest', shrine: 'star', boss: 'crown' };
const ROOM_NAME: Record<RoomType, string> = { combat: 'COMBAT', elite: 'ELITE', treasure: 'TREASURE', shrine: 'SHRINE', boss: 'BOSS' };
const ROOM_COLOR: Record<RoomType, number> = { combat: 0xcfe0ff, elite: 0xffc040, treasure: 0xffd860, shrine: 0x9fffd0, boss: 0xff3040 };

export function roomTypeName(t: RoomType): string {
  return ROOM_NAME[t];
}

export interface Door {
  x: number;
  type: RoomType;
  parts: Phaser.GameObjects.GameObject[];
  icon: Phaser.GameObjects.Image;
  plate: Phaser.GameObjects.Graphics;
  text: Phaser.GameObjects.Text;
  glow: Phaser.GameObjects.Image;
  baseY: number;
}

interface Torch {
  img: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  pool: Phaser.GameObjects.Image;
  phase: number;
}

export class RoomBuilder {
  private bg!: Phaser.GameObjects.Image;
  private readonly vignette: Phaser.GameObjects.Image;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private torches: Torch[] = [];
  private doorSprites: Phaser.GameObjects.Image[] = [];
  private entry: Phaser.GameObjects.Image[] = [];
  doors: Door[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    ensureFxTextures(scene);
    this.vignette = scene.add.image(360, 640, FX_VIGNETTE).setDisplaySize(720, 1280).setDepth(900);
  }

  /** Paints a fresh room. `index` seeds the floor variation so a room always looks the same. */
  build(index: number, type: RoomType): void {
    this.destroyRoom();
    this.paint(index, type);
    this.bg = this.scene.add.image(0, 0, BG_KEY).setOrigin(0, 0).setScale(3).setDepth(0);
    this.objs.push(this.bg);
    this.addTorches(index);
    this.addDecor(index, type);
    this.addEntryDoor();
  }

  private paint(index: number, type: RoomType): void {
    const tm = this.scene.textures;
    let tex = tm.exists(BG_KEY) ? (tm.get(BG_KEY) as Phaser.Textures.CanvasTexture) : null;
    if (!tex) {
      tex = tm.createCanvas(BG_KEY, COLS * 16, ROWS * 16);
      tex?.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    if (!tex) return;
    const ctx = tex.getContext();
    ctx.imageSmoothingEnabled = false;
    const sheet = tm.get(TILES_KEY);
    const src = sheet.getSourceImage() as CanvasImageSource;
    const put = (frame: number, col: number, row: number): void => {
      const f = sheet.get(frame);
      ctx.drawImage(src, f.cutX, f.cutY, 16, 16, col * 16, row * 16, 16, 16);
    };
    const specked = new Set<number>();
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const wallTop = row <= 3;
        const wallSide = col === 0 || col === COLS - 1;
        const wallBottom = row >= 25;
        if (wallTop) {
          const h = hash2(index, col, row);
          let frame: number = row >= 2 ? TILE_FRAMES.wall : h < 0.5 ? TILE_FRAMES.wallTop : TILE_FRAMES.wallAlt;
          if (row === 2 && col > 1 && col < COLS - 2 && col % 3 === 1) frame = h < 0.5 ? TILE_FRAMES.wallGrate : TILE_FRAMES.wallBanner;
          put(frame, col, row);
        } else if (wallSide) {
          put(TILE_FRAMES.wallMid, col, row);
        } else if (wallBottom) {
          put(hash2(index, col, row) < 0.5 ? TILE_FRAMES.wallTop : TILE_FRAMES.wall, col, row);
        } else {
          const h = hash2(index * 7 + 3, col, row);
          // ~6% debris, never two debris tiles side by side (readability of enemies and shots)
          const crowded = specked.has(row * COLS + col - 1) || specked.has((row - 1) * COLS + col);
          const frame = crowded ? TILE_FRAMES.floor : h < 0.03 ? TILE_FRAMES.floorCracked : h < 0.06 ? TILE_FRAMES.floorRubble : TILE_FRAMES.floor;
          if (frame !== TILE_FRAMES.floor) specked.add(row * COLS + col);
          put(frame, col, row);
          // subtle checker + random patches so the plain floor tile does not look flat
          if ((col + row) % 2 === 0) {
            ctx.fillStyle = 'rgba(255,200,160,0.035)';
            ctx.fillRect(col * 16, row * 16, 16, 16);
          }
          if (h > 0.55 && h < 0.72) {
            ctx.fillStyle = 'rgba(0,0,0,0.07)';
            ctx.fillRect(col * 16, row * 16, 16, 16);
          }
        }
      }
    }
    // shading: wall shadow on the floor, darker HUD strip, side shadows
    const grad = (x0: number, y0: number, x1: number, y1: number, a: number): CanvasGradient => {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, `rgba(10,5,18,${a})`);
      g.addColorStop(1, 'rgba(10,5,18,0)');
      return g;
    };
    ctx.fillStyle = grad(0, 4 * 16, 0, 4 * 16 + 14, 0.55);
    ctx.fillRect(16, 4 * 16, (COLS - 2) * 16, 14);
    ctx.fillStyle = grad(16, 0, 16 + 10, 0, 0.45);
    ctx.fillRect(16, 4 * 16, 10, 21 * 16);
    ctx.fillStyle = grad((COLS - 1) * 16, 0, (COLS - 1) * 16 - 10, 0, 0.45);
    ctx.fillRect((COLS - 1) * 16 - 10, 4 * 16, 10, 21 * 16);
    ctx.fillStyle = grad(0, 25 * 16, 0, 25 * 16 - 10, 0.4);
    ctx.fillRect(16, 25 * 16 - 10, (COLS - 2) * 16, 10);
    ctx.fillStyle = 'rgba(10,5,20,0.38)';
    ctx.fillRect(0, 0, COLS * 16, 2 * 16);
    if (type === 'boss') {
      ctx.fillStyle = 'rgba(120,10,20,0.14)';
      ctx.fillRect(16, 4 * 16, (COLS - 2) * 16, 21 * 16);
    } else if (type === 'treasure') {
      ctx.fillStyle = 'rgba(255,200,60,0.06)';
      ctx.fillRect(16, 4 * 16, (COLS - 2) * 16, 21 * 16);
    } else if (type === 'shrine') {
      ctx.fillStyle = 'rgba(80,220,170,0.06)';
      ctx.fillRect(16, 4 * 16, (COLS - 2) * 16, 21 * 16);
    }
    tex.refresh();
  }

  private addTorches(index: number): void {
    const spots: [number, number][] = [[96, 150], [288, 150], [432, 150], [624, 150], [24, 520 + (index % 3) * 60], [696, 760 - (index % 2) * 80]];
    for (let i = 0; i < spots.length; i++) {
      const [x, y] = spots[i];
      const pool = this.scene.add.image(x < 60 ? x + 60 : x > 660 ? x - 60 : x, y < 200 ? y + 80 : y, FX_GLOW).setScale(6).setTint(0xff8a30).setAlpha(0.13).setBlendMode(Phaser.BlendModes.ADD).setDepth(2);
      const glow = this.scene.add.image(x, y - 6, FX_GLOW).setScale(3).setTint(0xffb050).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(9);
      const img = this.scene.add.image(x, y, EXTRA_KEY, 'torch_0').setScale(3).setDepth(8);
      this.torches.push({ img, glow, pool, phase: Math.random() * 6 });
      this.objs.push(pool, glow, img);
    }
  }

  private addDecor(index: number, type: RoomType): void {
    if (type === 'boss') return;
    const kinds = [TILE_FRAMES.barrel, TILE_FRAMES.crate, TILE_FRAMES.tomb, 66, 65, 73];
    const n = 5 + (index % 3);
    for (let i = 0; i < n; i++) {
      const h = hash2(index, i, 99);
      const h2 = hash2(index, i, 17);
      const left = h < 0.5;
      const x = left ? 48 + 26 : 672 - 26;
      const y = 250 + h2 * 820;
      // keep the player's entrance clear
      if (y > 1060) continue;
      const frame = kinds[((hash2(index, i, 5) * kinds.length) | 0) % kinds.length];
      const img = this.scene.add.image(x, y, TILES_KEY, frame).setScale(3).setDepth(100 + y * 0.1 - 4).setAlpha(0.95);
      const sh = this.scene.add.image(x, y + 20, EXTRA_KEY, 'shadow').setScale(3).setAlpha(0.4).setDepth(4);
      this.objs.push(img, sh);
    }
    // a couple of items along the top wall base
    for (let i = 0; i < 3; i++) {
      const x = 130 + hash2(index, i, 3) * 460;
      if (Math.abs(x - 360) < 90 || Math.abs(x - 210) < 70 || Math.abs(x - 510) < 70) continue;
      const frame = hash2(index, i, 8) < 0.5 ? TILE_FRAMES.barrel : TILE_FRAMES.crate;
      const img = this.scene.add.image(x, 214, TILES_KEY, frame).setScale(3).setDepth(100 + 214 * 0.1).setAlpha(0.95);
      this.objs.push(img);
    }
  }

  private addEntryDoor(): void {
    for (let i = 0; i < 2; i++) {
      const img = this.scene.add.image(ENTRY.x + (i === 0 ? -TILE / 2 : TILE / 2), 1224, TILES_KEY, DOOR_OPEN[i]).setScale(3).setDepth(30);
      this.entry.push(img);
      this.objs.push(img);
    }
  }

  /** Door slams shut behind the hero. */
  closeEntry(): void {
    for (let i = 0; i < this.entry.length; i++) this.entry[i].setFrame(DOOR_CLOSED[i]);
  }

  /** Top-wall doors, closed. Positions: one door centred, two doors left and right. */
  placeDoors(types: RoomType[]): void {
    this.clearDoors();
    const xs = types.length === 1 ? [360] : [210, 510];
    types.forEach((type, i) => {
      const x = xs[i];
      const baseY = 262;
      const parts: Phaser.GameObjects.GameObject[] = [];
      const glow = this.scene.add.image(x, DOOR_ROW_Y + 30, FX_GLOW).setScale(3.2).setTint(ROOM_COLOR[type]).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(26);
      for (let k = 0; k < 2; k++) {
        const img = this.scene.add.image(x + (k === 0 ? -TILE / 2 : TILE / 2), DOOR_ROW_Y, TILES_KEY, DOOR_CLOSED[k]).setScale(3).setDepth(27);
        parts.push(img);
        this.doorSprites.push(img);
      }
      const plate = this.scene.add.graphics().setDepth(520).setAlpha(0);
      plate.fillStyle(COLORS.bg, 0.8).fillCircle(0, 0, 46);
      plate.lineStyle(5, ROOM_COLOR[type], 0.95).strokeCircle(0, 0, 46);
      const icon = this.scene.add.image(x, baseY, ICONS_KEY, ROOM_ICON[type]).setScale(4.5).setDepth(521).setAlpha(0);
      const text = label(this.scene, x, baseY + 66, ROOM_NAME[type], 30, ROOM_COLOR[type]).setDepth(521).setAlpha(0);
      this.objs.push(glow, plate, icon, text);
      this.doors.push({ x, type, parts, icon, plate, text, glow, baseY });
    });
  }

  /** Doors swing open with their room-type icons floating above them. */
  openDoors(): void {
    for (const d of this.doors) {
      d.parts.forEach((p, k) => (p as Phaser.GameObjects.Image).setFrame(DOOR_OPEN[k]));
      d.glow.setAlpha(0.7);
      d.plate.setAlpha(1);
      d.icon.setAlpha(1);
      d.text.setAlpha(1);
      d.plate.setPosition(d.x, d.baseY);
      this.scene.tweens.add({ targets: [d.plate, d.text], scale: { from: 0.4, to: 1 }, duration: 320, ease: 'Back.Out' });
      this.scene.tweens.add({ targets: d.icon, scale: { from: 1.8, to: 4.5 }, duration: 320, ease: 'Back.Out' });
    }
  }

  private clearDoors(): void {
    for (const d of this.doors) {
      for (const p of d.parts) p.destroy();
      d.glow.destroy();
      d.plate.destroy();
      d.icon.destroy();
      d.text.destroy();
    }
    this.doors = [];
    this.doorSprites = [];
  }

  /** Which open door the hero is standing in front of (touching the wall). */
  doorAt(x: number, y: number): Door | null {
    if (y > 232) return null;
    for (const d of this.doors) if (Math.abs(x - d.x) < 58) return d;
    return null;
  }

  update(time: number): void {
    for (let i = 0; i < this.torches.length; i++) {
      const t = this.torches[i];
      t.img.setFrame(`torch_${((time * 8 + t.phase) | 0) & 3}`);
      const f = 0.5 + 0.12 * Math.sin(time * 9 + t.phase) + 0.06 * Math.sin(time * 23 + t.phase * 2);
      t.glow.setAlpha(f);
      t.pool.setAlpha(0.1 + 0.05 * Math.sin(time * 7 + t.phase));
    }
    for (const d of this.doors) {
      const bob = Math.sin(time * 3 + d.x) * 5;
      d.icon.setY(d.baseY + bob);
      d.plate.setY(d.baseY + bob);
      if (d.type === 'boss') d.glow.setAlpha(0.55 + 0.3 * Math.sin(time * 5));
    }
  }

  addStatue(x: number, y: number): Phaser.GameObjects.Image[] {
    const parts: Phaser.GameObjects.Image[] = [];
    const frames = [8, 20, 32];
    for (let i = 0; i < 3; i++) {
      const img = this.scene.add.image(x, y - 48 + i * TILE, TILES_KEY, frames[i]).setScale(3).setDepth(100 + y * 0.1);
      parts.push(img);
      this.objs.push(img);
    }
    const glow = this.scene.add.image(x, y + 30, FX_GLOW).setScale(3.4).setTint(0x60ffc0).setAlpha(0.4).setBlendMode(Phaser.BlendModes.ADD).setDepth(7);
    this.objs.push(glow);
    return parts;
  }

  addChest(x: number, y: number): Phaser.GameObjects.Image {
    const glow = this.scene.add.image(x, y, FX_GLOW).setScale(3.4).setTint(0xffc840).setAlpha(0.45).setBlendMode(Phaser.BlendModes.ADD).setDepth(7);
    const shadow = this.scene.add.image(x, y + 24, EXTRA_KEY, 'shadow').setScale(4.5, 3.5).setAlpha(0.5).setDepth(8);
    const img = this.scene.add.image(x, y, TILES_KEY, TILE_FRAMES.chestClosed).setScale(4.5).setDepth(100 + y * 0.1);
    this.objs.push(glow, shadow, img);
    return img;
  }

  private destroyRoom(): void {
    this.clearDoors();
    for (const o of this.objs) o.destroy();
    this.objs = [];
    this.torches = [];
    this.entry = [];
  }

  destroy(): void {
    this.destroyRoom();
    this.vignette.destroy();
  }
}
