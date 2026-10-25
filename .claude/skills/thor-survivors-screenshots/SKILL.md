---
name: thor-survivors-screenshots
description: See Thor Survivors without a device - Robolectric NATIVE-graphics screenshot tests on the JVM (no emulator, no KVM in the cloud), seeded frames, contact sheets with PIL, and the visual bugs already fixed. Use when checking how a render change looks, hunting z-order flicker, atlas shimmer or ground seams, or preparing images for the owner.
---

# Screenshots of Thor Survivors (JVM, no device)

No KVM in the cloud, so no emulator. Robolectric 4.14.1 with `@GraphicsMode(GraphicsMode.Mode.NATIVE)` and
`@Config(sdk = 35)` rasterises real `android.graphics.Canvas` on Linux. Output is PNG, not a device image.

## Harness

- Files in `thor-survivors/app/src/test/java/se/felixarvid/thorsurvivors/render/`:
  `ScreenshotTest.java` (menu, fight, level-up, weapons, movement), `StageShotsTest.java` (forest and library stages,
  brazier before/after), `Phase7ShotsTest.java` (design phases 5 to 7: charger telegraph line and dash, sergeant and drone bolts, carrier fuse and
  cloud, vire blink and ring, smelter pool warning, Slagborn trail, hound pack, the five statuses on screen, Cinder Flats and Deep Mines fights at
  2/10/20 min, the ash storm, a barrel chain, chest and pylon; it asserts the red-orange danger pixels and the Frost tint), `CrowdOrderTest.java` (6 movement frames, `seq_N.png`), `Shots.java` (helper, sizes), `HeroShotsTest.java` (each hero attacking, Slam/Spore Burst, Wrath beam + Parasite Link, grenade, hero select row, branch card on the bottom screen, dodge; `driveUntil` aims at the nearest enemy and clears `inv.weaponCount` so only the main weapon is in the picture), `AshfallShotsTest.java` (lighting FULL/LOW/OFF with the enemy contrast check, the three boss
  models, the death sequence, the player in 8 directions and 5 states, `bestiary.png`), `RenderCostTest.java` (crowd draw time per
  lighting mode and the zero-allocation check), `Phase9ShotsTest.java` (design phases 9 and 10: an elite of each modifier with its
  outline colour measured, equipment crates of the four rarities, the toast, the choice screen and the equipment strip on the bottom
  screen, a Headlamp widening the light, every boss pattern with its telegraph (charge line, stomp ring, falling crates, slag bombs,
  tentacle rings, Vire's spiral, the Foreman's carpet and pull ring), The First in its three phases with the lane warning and the pulse's
  safe half, the boss banners and health bars) and `Phase11ShotsTest.java` (design phase 11, the ASHFALL UI skin: every screen of the bottom panel, the title and overlays of the top screen
  and the single-screen compact overlay, saved as `p11_*.png`; it also asserts the accent colours and that the menu paintings are decoded on
  open and released when a run starts), `PanelCostTest.java` (panel draw time and the zero-allocation check per screen, `PERF panel` lines) and `LateFightShotsTest.java` (late fights at 10/20/28 min on both stages with six
  weapons: it prints the share of strongly green and of white pixels per frame and saves `late_<SHOT_TAG>_<stage>_<minute>.png`;
  run it once with `SHOT_TAG=before` on the old code and once with `after` to get a pair).
- UI skin frames: `UiArt` must be initialised (`Shots` does it from `src/main/assets`); a test that builds its own `PanelRenderer`/`WorldRenderer`
  without `Shots` gets the system font and flat colours. The single-screen overlay is `new PanelRenderer(true)` drawn over `world.draw(c, w, h, eng, false)`
  (`dualScreen = false`: the top screen then only dims for the paused phases and keeps the title small); `Shots.renderTop()` always passes `true`.
- Top screen: 1920x1080 (`Shots.TOP_W/TOP_H`, WorldRenderer). Bottom panel: 1240x1080 (`Shots.BOT_W/BOT_H`, `ui/PanelRenderer`).
  World view is 560 units high (`Sim.VIEW_H`), 1.93 px per unit, one tile (`WorldGen.TILE`) = 80 px.
- Output dir: env `SHOT_DIR`, default `app/build/screenshots`.
- Run one class: `SHOT_DIR=<scratch>/frames ./gradlew testDebugUnitTest --tests '*ScreenshotTest*' --rerun`,
  with `<scratch>` the session scratchpad.
- Seed for reproducible frames: `s.rng.setSeed(n)` (see `Shots.java` line ~75).
- Stages: `h.startRun("FLATS" | "MINES", ...)` are the menu stages. `FOREST` / `LIBRARY` (Vampire Survivors) are not in the menu any more; `Shots.startRun`
  reaches them through `Engine.selectStage(key)` (the debug hook; the menu row clears it). Older tests keep using them.
- Scenes with exact enemies: `scene()` in `Phase7ShotsTest` (no waves, no weapons, hero immortal) and then `s.spawnAt(key, x, y, boss)`, `s.shootForTest(...)`,
  `s.hazardForTest(...)`, `s.applyStatus(...)`, `s.hitDestForTest(...)`, `s.destX/destKind` (public test hooks on `Sim`); `e.actT = 0` makes an archetype act now.
  Crop the interesting 960 x 540 around the hero (`(480,270,1440,810)`) and make a contact sheet; the telegraphs are small on a full frame.
- Save a weapon shot only when that weapon's own effect is on screen. A shot of an empty field proves nothing.

## Looking at the frames

- Open PNGs with the Read tool. Several frames at once: build a contact sheet or crops with PIL, run as
  `python3 -I script.py` from a directory that holds only your script and the images.
- Crop the brazier and weapon shots at 2-3x with `NEAREST`, never smooth, or pixel errors disappear.

## What to look for (bugs already seen)

- Z-order flicker from swap-remove pools. Fixed by y-sort. `CrowdOrderTest` asserts no order flips across frames.
- Ground seams at chunk borders. `GroundCacheTest` checks pixel identity across borders (`render/GroundCache.java`): decal centres are
  rounded to whole pixels, or two windows differ in the last bit.
- `Shots.renderTop()` returns one shared bitmap: `copy()` it before rendering a second frame you want to compare.
- Blinking or shake on hit: a red filter and a white filter (`PorterDuffColorFilter`), no extra bitmaps.
- Too dark: judge FULL and LOW frames with the Read tool, then check `lightingFullLowOff` prints enemy contrast (WCAG ratio, design
  target 2.0; the test asserts >= 1.6 for FULL and LOW). Enemies must never go below 64 % brightness (`FLOOR_ENEMY`).
- A level-up pauses the sim: loops that kill enemies must confirm the level-up (see `deathAnimationBeforeTheCorpseFades`). So does the equipment choice (`Engine.PH_EQUIP`: post `CMD_CONFIRM` for Replace, `CMD_BACK` for Keep); `Shots.step` confirms level-ups and chests, so keep that in mind when a long drive picks up an elite's crate.
- Cluttered damage numbers.
- Late fights swamped by explosions and spore clouds (fixed in phase 10): big `FX_BLAST` / `FX_FLASH` / `FX_SPORE` effects are budgeted in
  `WorldRenderer.drawFx` (at most 6 drawn, smaller and fainter the more are alive), clouds and slag pools in `drawHazards`, the Garlic
  aura and the Santa Water puddles are thin. A new big effect must go through the same budget; judge it with `LateFightShotsTest` frames
  at 28 minutes, not with a lone effect on an empty floor.

## Tests that cover the renders

- `./gradlew testDebugUnitTest --tests '*render*'` runs `CrowdOrderTest`, `GroundCacheTest`, `AtlasBitmapTest`,
  `ScreenshotTest`, `StageShotsTest`, `AshfallShotsTest`, `RenderCostTest`. Run `AshfallAssetsTest` (data package) too after any art change.

## Not verifiable here: check on the real device

- 120 Hz pacing. The JVM gives no frame timing.
- HWUI bitmap upload cost.
- Chunk bake time on the background thread (`GroundCache`).
- Which bottom-screen path the Thor uses: `screen/PanelPresentation` or `screen/SecondaryActivity`.
- Gamepad routing (`screen/InputRouter`).

Say these to the owner explicitly in the hand-off. A passing screenshot test is not a device test.
