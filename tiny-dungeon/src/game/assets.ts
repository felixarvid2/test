// Asset keys shared by the loader, the art pipeline (tools/build_assets.py) and gameplay code.
// Swapping final artwork means replacing the PNG/JSON files under public/assets; keys stay the same.

/** All pixel art is authored at 16 px per tile and drawn at this scale. */
export const PIXEL_SCALE = 3;
export const TILE = 16 * PIXEL_SCALE; // 48 world px

/** Kenney "Tiny Dungeon" (CC0) packed sheet: 12 x 11 frames of 16x16, loaded as spritesheet 'tiles'. */
export const TILES_KEY = 'tiles';
export const TILE_FRAMES = {
  floor: 0,
  floorCracked: 12,
  floorRubble: 24,
  wall: 40,
  wallTop: 57,
  wallMid: 58,
  wallAlt: 59,
  wallGrate: 28,
  wallBanner: 29,
  doorClosed: 45,
  doorOpen: 33,
  chestClosed: 89,
  chestOpen: 91,
  mimic: 92,
  barrel: 82,
  crate: 63,
  tomb: 64,
  knight: 96,
  mage: 84,
  ranger: 112,
  slime: 108,
  bat: 120,
  necromancer: 111,
  ogre: 109,
  demon: 110,
  ghost: 121,
  spider: 122,
  rat: 123,
  swordItem: 104,
  axeItem: 118,
  hammerItem: 117,
  staffItem: 129,
  staffItemBlue: 130,
  potionRed: 115,
  potionGreen: 114,
  potionBlue: 116,
  shield: 101,
} as const;

/**
 * Generated sprites (tools/build_assets.py -> public/assets/sprites/extra.png + extra.json, a Phaser
 * JSON-hash atlas). Frame names are fixed here.
 */
export const EXTRA_KEY = 'extra';
export const EXTRA_FRAMES = [
  'skeleton', 'skeleton_archer', 'goblin_armored', 'skeleton_king', 'dragon', 'giant_slime',
  'xp_gem', 'xp_gem_big', 'coin_0', 'coin_1', 'coin_2', 'coin_3',
  'arrow', 'enemy_arrow', 'magic_bolt', 'fireball', 'bone', 'orbit_blade', 'meteor',
  'shadow', 'spark', 'puff', 'flame_0', 'flame_1', 'flame_2', 'flame_3',
  'torch_0', 'torch_1', 'torch_2', 'torch_3', 'heart', 'skull', 'egg', 'crown', 'slash',
  'ice_shard', 'lightning', 'poison_cloud', 'companion_fairy', 'companion_wisp',
  'spider_queen', 'lich', 'mimic_king', 'web', 'web_ball', 'egg_sac', 'soul_bolt', 'venom_glob',
] as const;
export type ExtraFrame = (typeof EXTRA_FRAMES)[number];

/** Upgrade / shop / achievement icons: public/assets/sprites/icons.png + icons.json (16x16 frames). */
export const ICONS_KEY = 'icons';
export const ICONS = [
  'sword', 'bow', 'staff', 'damage', 'attackSpeed', 'hp', 'boots', 'crit', 'critDamage', 'double',
  'fire', 'frost', 'lightning', 'poison', 'vampire', 'pierce', 'explosion', 'thunder', 'orbit',
  'phoenix', 'meteor', 'soul', 'chaos', 'infinite', 'armor', 'magnet', 'regen', 'dodge', 'gold',
  'xp', 'luck', 'multishot', 'range', 'area', 'knockback', 'shield', 'clover', 'egg', 'revive',
  'reroll', 'chest', 'skull', 'trophy', 'star', 'heart', 'crown', 'calendar', 'hero', 'lock',
] as const;
export type IconKey = (typeof ICONS)[number];

/** Audio files live in public/assets/audio/<key>.mp3. */
export const SFX = [
  'swing', 'shoot', 'magic', 'hit', 'crit', 'enemyDeath', 'playerHurt', 'coin', 'xp', 'levelUp',
  'upgradePick', 'cardFlip', 'bossWarning', 'bossDeath', 'victory', 'defeat', 'explosion',
  'thunder', 'click', 'door', 'chest', 'revive', 'purchase', 'error', 'synergy',
] as const;
export type SfxKey = (typeof SFX)[number];

export const MUSIC = ['music_menu', 'music_dungeon', 'music_boss'] as const;
export type MusicKey = (typeof MUSIC)[number];

/** Palette used for UI and effects (picked to sit well with the Kenney Tiny Dungeon colours). */
export const COLORS = {
  bg: 0x140c1c,
  panel: 0x2a1d33,
  panelLight: 0x45304f,
  outline: 0x0b0710,
  text: 0xf4ecd8,
  textDim: 0xa89ba8,
  gold: 0xf4b41b,
  hp: 0xe43b44,
  hpBack: 0x3e1f2a,
  xp: 0x3ec7f0,
  heal: 0x63c74d,
  crit: 0xffd541,
  fire: 0xff7a2f,
  frost: 0x8fd3ff,
  lightning: 0xfff36b,
  poison: 0x8ee04a,
  common: 0xc0c7d0,
  rare: 0x3e8cf0,
  epic: 0xb455f0,
  legendary: 0xffa62b,
  danger: 0xff3344,
} as const;

export const RARITY_COLOR: Record<'common' | 'rare' | 'epic' | 'legendary', number> = {
  common: COLORS.common,
  rare: COLORS.rare,
  epic: COLORS.epic,
  legendary: COLORS.legendary,
};

export const FONT = 'Monogram';
export const FONT_TITLE = 'KenneyFuture';
