# Progress – Tower Merge: Last Stand

## Plan

The simulation is pure TypeScript (`src/sim/`, no Phaser), so it can be tested headlessly and
balanced with bots. Phaser scenes render it and forward input. All gameplay content is data
(`src/data/`), built from the shared contracts in `src/data/types.ts` and `src/sim/api.ts`.

| Layer | Where |
|---|---|
| Contracts | `src/data/types.ts`, `src/sim/api.ts`, `src/data/map.ts`, `src/game/assetKeys.ts`, `src/audio/keys.ts` |
| Simulation | `src/sim/` (World, combat, statuses, waves, bosses, abilities, offers, events, bots) |
| Content | `src/data/` (towers, enemies, bosses, upgrades, synergies, events, meta, achievements, daily, balance) |
| Platform | `src/platform/` (browser, YouTube Playables), `src/save/`, `src/rewards/`, `src/audio/` |
| Meta | `src/core/` (meta shop, run results, achievements, daily challenge) |
| Presentation | `src/game/` (scenes, UI kit, fallback art), `public/assets/` (SVG sprites, audio) |

## Status

- [x] Project setup (Vite, TypeScript, Phaser 3.90, vitest) and shared contracts
- [ ] Phase 1–2: simulation, towers, enemies, bosses, upgrades, synergies, abilities
- [ ] Phase 3: meta progression, save, unlocks, achievements, statistics
- [ ] Phase 4: reward provider abstraction, mock ads, the five rewards
- [ ] Phase 5: art, audio, effects, menus, daily challenge, random events
- [ ] Phase 6: tests, balance simulation, smoke tests, performance, Playables package
