# Progress

## Status

All six phases are implemented. The game is playable end to end in a browser and packages for YouTube Playables.

## Completed

### Phase 1: Foundation

- Vite, TypeScript and Phaser 3.90 project.
- 720x1280 portrait world, letterboxed to any aspect ratio.
- Floating or fixed virtual joystick, plus WASD and arrow keys.
- Automatic combat.
- Room progression with door choices.
- Upgrade selection.

### Phase 2: Content

- Weapons: sword, bow and staff. Staff visuals change with elements.
- 43 upgrades in 4 weighted rarities. Rarity is gated by room: rare from room 2, epic from room 4, legendary from room 7.
- 15 data-driven synergies, 3 of them evolutions: Frozen Fortress, Tempest, Armageddon.
- 10 enemy types: slime, bat, skeleton, skeleton archer, armored goblin, necromancer, and the unlockable ghost, spider, fire slime and ogre.
- 3 bosses with telegraphed, phase-based attacks: Giant Slime (room 5), Skeleton King (room 10), Dungeon Dragon (room 15). They loop every 15 rooms with scaling.
- Elite, treasure and shrine rooms.
- Difficulty scaling.

### Phase 3: Meta progression

- Gold economy.
- Permanent shop: 10 upgrades with growing costs, including bow and staff unlocks, an extra card and free rerolls.
- 3 heroes: Knight (free), Ranger (300 gold), Mage (600 gold), each with a distinct passive.
- Unlockable enemy variants and cosmetic skins.
- Versioned save through the platform (localStorage in browsers, `ytgame` saveData in Playables), with migration and repair.
- Run recovery: the run in progress is saved at each room clear and on pause, and banked on the next launch if the app was closed mid-run.

### Phase 4: Rewards and platform

- `RewardProvider` interface (`isAvailable`, `showRewardedAd`).
- `RewardService` with nonce-verified, idempotent, persisted claims and a configurable daily limit (12).
- Fortune Token fallback when ads are unavailable.
- Providers: Mock (dev builds and `?mockads=1`), YouTube (wraps `ytgame.ads.requestRewardedAd`, disabled by `REWARD_CONFIG.youtubeAdsEnabled`), Null.
- Rewards: revive (50% HP, 3 s invulnerability, once per run), double gold (once per run), extra upgrade after bosses, reroll (once per upgrade screen), Mystery Egg (companion 25%, cosmetic 15%, gold 35%, buff 25%).
- `BrowserPlatform` and `YouTubePlatform` adapters. The Playables SDK loads first. Inside Playables, Phaser's own Page Visibility listener is dropped.

### Phase 5: Polish

- Original pixel art in the Kenney Tiny Dungeon palette: bosses, skeletons, goblin, effects and 49 icons.
- CC0 audio: 25 sound effects and 3 music loops.
- Hit flashes, damage numbers, crits, knockback, screen shake, hitstop, death effects, synergy banners and animated menus.
- 20 achievements.
- Deterministic daily challenge.
- Settings: music and SFX volume, screen shake, reduced motion, damage numbers, joystick mode, reset, credits.

### Phase 6: Testing and packaging

- 192 unit tests (vitest) covering rules, save, rewards, platform, audio and UI helpers.
- Headless balance simulation (`npm run sim`).
- Headless Playwright play-throughs: `tools/smoke.mjs` (gameplay) and `tools/ui-smoke.mjs` (menus, upgrade, game over, rewards, recovery).
- `tools/package.mjs` validates the Playables bundle rules and writes `release/tiny-dungeon-playables.zip`.

## Verification

- Unit tests: 192 passing.
- `tools/smoke.mjs` and `tools/ui-smoke.mjs`: pass with zero console errors.
- Production build: passes.
- Playables package: 38 files, about 1.6 MiB compressed (limit 30 MiB).
- Performance, headless Chromium with 4x CPU throttling, 45 enemies plus fire, chain lightning, explosions, orbit blades and thunderstorm active: game logic about 1 ms per frame median, about 9 ms p95.
- Balance simulation: novice and average first runs reach room 7–9 in about 3 minutes. Max-meta expert median is room 25. An average player maxes the shop after about 36 runs.

## Pending / next steps

- Test on real Android and iOS devices. Rendering FPS is not yet measured; headless runs use software rendering.
- Test inside the YouTube Playables test suite.
- Listen to the audio and possibly swap picks. They were chosen by analysis, not by ear: `music_boss`, `thunder`, `bossDeath`, `explosion`, jingles.
- Play-test balance against the simulation. Deaths cluster at bosses. Ranger is strongest at the top end; Mage is weakest at the start.
- Enable YouTube rewarded ads only after the Developer Portal setting is on.
- Localisation: `getLanguage` is wired, but all text is English.

## Known issues and limitations

- The `phaser` chunk is 1.45 MB, above Playables' 512 KiB per-file recommendation. It is well under the 30 MiB limit.
- MP3 encoder padding may leave a tiny gap at music loop points in some browsers.
- A daily run recovered on a later day is recorded under that day.
- Gold earned in the final room is lost if the app is closed during the revive countdown.
- Phaser Graphics-based buttons are redrawn each frame. They could be baked if low-end phones struggle.
- Infinite Blades is the strongest legendary by design.

## Decisions

- Architecture: see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- Balance numbers and simulation results: see [docs/BALANCE.md](docs/BALANCE.md).
