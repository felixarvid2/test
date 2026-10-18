/**
 * Sound keys shared by the audio pipeline and the game. Files live in public/assets/audio/ with
 * paths listed in public/assets/audio/manifest.json ({ "sfx": { key: file }, "music": { key: file } }).
 * Missing files are skipped silently: the game must work without audio.
 */
export const SFX_KEYS = [
  'shoot_arrow', 'shoot_cannon', 'shoot_frost', 'shoot_lightning', 'shoot_fire', 'shoot_poison', 'shoot_sniper', 'shoot_magic',
  'explosion', 'explosion_big', 'hit', 'freeze', 'enemy_die', 'boss_die', 'boss_roar', 'boss_warning',
  'coin', 'merge', 'merge_big', 'place', 'invalid', 'buy', 'sell', 'unlock', 'castle_hit',
  'upgrade_pick', 'card_flip', 'legendary', 'synergy', 'ability_meteor', 'ability_freeze', 'ability_repair', 'ability_frenzy',
  'wave_start', 'wave_clear', 'victory', 'defeat', 'click', 'achievement', 'purchase',
] as const;
export type SfxKey = (typeof SFX_KEYS)[number];

export const MUSIC_KEYS = ['music_menu', 'music_battle', 'music_boss'] as const;
export type MusicKey = (typeof MUSIC_KEYS)[number];
