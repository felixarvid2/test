# Tiny Dungeon – architecture

## Layers

```
src/core      pure TypeScript game rules (no Phaser): stats, run state, upgrades, synergies, combat
              maths, room planning, meta progression, achievements, daily seed. Used by the game,
              the balance simulation (tools/simulate.ts) and unit tests.
src/data      data-driven definitions: weapons, upgrades, synergies, enemies, bosses, heroes,
              meta upgrades, achievements, buffs. Adding content = adding an entry here.
src/config    balance.ts: every tunable number (base stats, caps, scaling, rarity weights, prices).
src/platform  Platform interface + BrowserPlatform + YouTubePlatform + createPlatform().
src/save      SaveManager: versioned JSON through Platform.loadData/saveData, migrations, repair.
src/rewards   RewardProvider interface, Mock/YouTube/Null providers, RewardService (idempotent claims,
              daily limit, Fortune Token fallback), Mystery Egg table.
src/audio     AudioManager: SFX throttling, music crossfade, volume settings, host mute.
src/game      Phaser: scenes, entities, systems, UI widgets. Reads core state; never re-implements rules.
src/services.ts  one object holding platform, save, rewards, audio (created in main.ts).
```

## Key decisions

- **Everything is a stat.** Upgrades, synergies, hero passives, meta upgrades, buffs and level-ups are
  lists of `StatEffect` applied to one flat `Stats` sheet (`computeStats`: base + adds, x (1 + sum of
  pct), x product of mul, then caps from `BALANCE.caps`). Gameplay systems read stats only, so a new
  upgrade needs no new code unless it introduces a new mechanic (a new stat key).
- **Synergies are data.** `SynergyDef.requires` lists upgrade ids; when all are owned the synergy's
  effects join the stat sources and a banner plays. Upgrade cards show hints for synergies they advance.
- **Single-screen rooms, fixed 720x1280 world.** Phaser `Scale.FIT` + `autoCenter` letterboxes any
  aspect ratio (Playables requirement). Pixel art is 16 px drawn at x3 (`PIXEL_SCALE`), `pixelArt: true`.
- **Seeded RNG streams.** A run has a seed; `Rng.fork(label)` gives independent streams for rooms,
  upgrades and loot, so the daily challenge is identical for everyone that day.
- **Pools everywhere.** Enemies, projectiles, pickups, damage numbers and particles are pooled Phaser
  groups with fixed caps (`BALANCE.limits`). No per-frame allocation in hot loops.
- **Pause is host-driven.** `Platform.onPause` pauses the game loop and audio and flushes the save.
  The browser adapter uses `visibilitychange`; the YouTube adapter uses only `ytgame.system.onPause`
  (Playables forbids the Page Visibility API).
- **Saves go through the platform.** YouTube: `ytgame.game.loadData/saveData` (< 3 MiB, we stay
  far below 500 KiB). Browser: localStorage with an in-memory fallback.
- **Rewards never depend on a real ad SDK.** `RewardService` issues a nonce, asks the provider, and
  only on a `completed` result with the matching nonce records the claim (persisted) and returns
  success. Claim keys (`runId:placement:context`) make claims idempotent across restarts. When no ad
  provider is available the reward can be unlocked with a Fortune Token (earned from bosses,
  achievements and daily challenges) instead; when neither is possible the option is hidden.
  YouTube's `ytgame.ads.requestRewardedAd` is wrapped by `YouTubeRewardProvider` but disabled by
  `BALANCE.rewards.youtubeAdsEnabled` until ads are enabled for the game in the Developer Portal.

## Scene flow

```
Boot -> Preload -> Menu <-> (HeroSelect, Shop, Settings, Achievements)
Menu -> Game (+ HUD overlay scene) -> Upgrade overlay (after each room) -> Game ...
Game -> GameOver (revive offer) -> Menu / Game
```

`Game` pauses itself while an overlay (Upgrade, Pause, GameOver) is up; overlays resume it.
