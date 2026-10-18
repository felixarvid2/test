/** Shared layout, depth and colour constants of the gameplay scene. No Phaser imports: unit-testable. */
import { DEPTH } from '../ui/theme';
import { BOARD, SLOTS } from '../../data/map';
import { MAX_TOWER_LEVEL } from '../../data/types';

/**
 * Depth bands inside GameScene. World entities (towers, enemies) sort by their y inside the
 * `entity` band; flyers are lifted above ground units, everything else has a fixed layer.
 */
export const D = {
  bg: 0,
  path: 1,
  portal: 2,
  slot: 4,
  slotFx: 5,
  ground: 6,
  zone: 7,
  tele: 8,
  entity: 10,
  flyer: 70,
  proj: 76,
  fx: 78,
  fxTop: 84,
  bars: 86,
  highlight: 88,
  dragged: 90,
  dmg: 95,
  hud: DEPTH.hud,
  shop: DEPTH.hud + 2,
  boss: DEPTH.hud + 4,
  card: DEPTH.hud + 8,
  tutorial: DEPTH.hud + 12,
  screen: 500,
} as const;

export const depthForY = (y: number): number => D.entity + y * 0.05;

export const ALL_SLOTS_COUNT = SLOTS.length;

/** The tower base sits a little below the slot centre so the stone pad frames it. */
export const TOWER_DY = 14;

/** Displayed tower height by level (px): higher levels are visibly grander. */
export const towerSize = (level: number): number => 134 + (Math.min(MAX_TOWER_LEVEL, Math.max(1, level)) - 1) * 8;

/** Finger offset while dragging: the tower is rendered this far above the pointer. */
export const DRAG_LIFT = 70;
export const DRAG_THRESHOLD = 8;
export const MAGNET_RADIUS = 70;
/** Fallback radius around the raw finger position when the lifted tower is not near a slot. */
export const FINGER_RADIUS = 56;

export const BOARD_RECT = { top: BOARD.top, bottom: BOARD.bottom } as const;

export const ELEMENT_COLORS: Record<string, number> = {
  fire: 0xff7a2b, frost: 0x8fe0ff, poison: 0x8be04e, arcane: 0xe05ad6, physical: 0xffd9a0, lightning: 0xfff07a,
};

/** Display height (px) of enemies; bosses are sized by id. */
export const ENEMY_SIZE: Record<string, number> = {
  goblin: 56, rat: 48, skeleton: 58, bat: 54, orc: 66, shaman: 58, summoner: 62, troll: 76, stoneling: 50, imp: 50,
  goblinKing: 156, stoneGolem: 186, dragon: 210,
};

/** Particle colour per enemy kind (death puffs). */
export const ENEMY_COLORS: Record<string, number> = {
  goblin: 0x7bc043, rat: 0xb08a68, skeleton: 0xece6d2, bat: 0x9a6ad8, orc: 0x5f9a3c, shaman: 0x4ac8b8, summoner: 0xa44ee0,
  troll: 0x8f8470, stoneling: 0xa8a8b4, imp: 0xff7a3a, goblinKing: 0xf5c542, stoneGolem: 0xb0b2c4, dragon: 0xff5a36,
};

export const COLOR_DANGER = 0xff4a3f;
export const COLOR_MERGE = 0x6dff7a;
export const COLOR_SWAP = 0x58b4ff;
export const COLOR_GOLD = 0xffd35e;
