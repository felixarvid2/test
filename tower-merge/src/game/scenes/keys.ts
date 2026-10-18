/** Scene keys. Every scene registers itself with one of these. */
export const SceneKeys = {
  Boot: 'Boot',
  Preload: 'Preload',
  Menu: 'Menu',
  Game: 'Game',
  Hud: 'Hud',
  Upgrade: 'Upgrade',
  Event: 'Event',
  Pause: 'Pause',
  GameOver: 'GameOver',
  Reward: 'Reward',
  Shop: 'Shop',
  Collection: 'Collection',
  Achievements: 'Achievements',
  Settings: 'Settings',
  Stats: 'Stats',
  Daily: 'Daily',
} as const;
export type SceneKey = (typeof SceneKeys)[keyof typeof SceneKeys];
