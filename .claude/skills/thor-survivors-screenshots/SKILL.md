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
  brazier before/after), `CrowdOrderTest.java` (6 movement frames, `seq_N.png`), `Shots.java` (helper, sizes), `AshfallShotsTest.java` (lighting FULL/LOW/OFF with the enemy contrast check, the three boss
  models, the death sequence, the player in 8 directions and 5 states, `bestiary.png`), `RenderCostTest.java` (crowd draw time per
  lighting mode and the zero-allocation check).
- Top screen: 1920x1080 (`Shots.TOP_W/TOP_H`, WorldRenderer). Bottom panel: 1240x1080 (`Shots.BOT_W/BOT_H`, `ui/PanelRenderer`).
  World view is 560 units high (`Sim.VIEW_H`), 1.93 px per unit, one tile (`WorldGen.TILE`) = 80 px.
- Output dir: env `SHOT_DIR`, default `app/build/screenshots`.
- Run one class: `SHOT_DIR=<scratch>/frames ./gradlew testDebugUnitTest --tests '*ScreenshotTest*' --rerun`,
  with `<scratch>` the session scratchpad.
- Seed for reproducible frames: `s.rng.setSeed(n)` (see `Shots.java` line ~75).
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
- A level-up pauses the sim: loops that kill enemies must confirm the level-up (see `deathAnimationBeforeTheCorpseFades`).
- Cluttered damage numbers.

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
