/**
 * Texture naming convention shared by the art pipeline, the preloader and every scene.
 * Sprites are original SVGs in public/assets/sprites/<key>.svg (style: docs/ART_STYLE.md), listed
 * in public/assets/sprites/manifest.json (written by tools/sprite-manifest.mjs). The preloader
 * rasterises each at the canvas size below. Any key without a file gets a procedural fallback
 * texture at boot, so the game always runs.
 *
 *   tower_<TowerId>_<level>   192x192, level 1..5, transparent, tower in 3/4 front view
 *   enemy_<EnemyId>           128x128, transparent, facing right
 *   boss_<BossId>             320x320, transparent, facing right
 *   proj_<ProjectileKind>     64x64,   transparent, pointing right
 *   icon_<IconKey>            128x128, transparent
 *   castle                    384x256, transparent
 *   bg_board                  720x1280, opaque grass field (the path is drawn on top in code)
 *   bg_menu                   720x1280, opaque
 *   slot_empty, slot_locked   128x128, transparent stone pad / padlocked pad
 *   fx_spark, fx_smoke, fx_glow, fx_ring, fx_star, fx_coin   64x64 particle textures (white-ish, tinted in code)
 */
import { ABILITY_IDS, BOSS_IDS, ENEMY_IDS, ICON_KEYS, MAX_TOWER_LEVEL, TOWER_IDS } from '../data/types';
import type { ProjectileKind } from '../sim/api';

export const PROJECTILE_KINDS: readonly ProjectileKind[] = [
  'arrow', 'cannonball', 'frostShard', 'fireball', 'poisonGlob', 'magicOrb', 'shard', 'bomblet', 'meteor',
];

export const FX_KEYS = ['fx_spark', 'fx_smoke', 'fx_glow', 'fx_ring', 'fx_star', 'fx_coin'] as const;

export const towerKey = (type: string, level: number): string => `tower_${type}_${level}`;
export const enemyKey = (id: string): string => `enemy_${id}`;
export const bossKey = (id: string): string => `boss_${id}`;
export const projKey = (kind: string): string => `proj_${kind}`;
export const iconKey = (id: string): string => `icon_${id}`;

/** Every texture key the game expects. */
export function allTextureKeys(): string[] {
  const keys: string[] = ['castle', 'bg_board', 'bg_menu', 'slot_empty', 'slot_locked', ...FX_KEYS];
  for (const t of TOWER_IDS) for (let l = 1; l <= MAX_TOWER_LEVEL; l++) keys.push(towerKey(t, l));
  for (const e of ENEMY_IDS) keys.push(enemyKey(e));
  for (const b of BOSS_IDS) keys.push(bossKey(b));
  for (const p of PROJECTILE_KINDS) keys.push(projKey(p));
  for (const i of ICON_KEYS) keys.push(iconKey(i));
  for (const a of ABILITY_IDS) if (!(ICON_KEYS as readonly string[]).includes(a)) keys.push(iconKey(a));
  return keys;
}
