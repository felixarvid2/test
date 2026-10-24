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
  brazier before/after), `CrowdOrderTest.java` (6 movement frames, `seq_N.png`), `Shots.java` (helper, sizes).
- Top screen: 1920x1080 (`Shots.TOP_W/TOP_H`, WorldRenderer). Bottom panel: 1240x1080 (`Shots.BOT_W/BOT_H`, `ui/PanelRenderer`).
  World view is 560 units high (`Sim.VIEW_H`).
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
- Atlas bleeding and shimmer. Frames are pre-sliced into their own 16x16 bitmaps and integer-scaled at load
  (`render/SpriteAtlas.java`), drawn on whole screen pixels.
- Blinking or shake on hit. Replaced by a red tint and a white silhouette.
- Cluttered damage numbers.
- Multi-tile tree halves drawn alone (Tiny Town 3/4, 27/28). Use whole trees.
- Ground seams at chunk borders. `GroundCacheTest` checks pixel identity across borders (`render/GroundCache.java`).

## Tests that cover the renders

- `./gradlew testDebugUnitTest --tests '*render*'` runs `CrowdOrderTest`, `GroundCacheTest`, `AtlasBitmapTest`,
  `ScreenshotTest`, `StageShotsTest`. Run `AtlasJsonTest` too after any sprite change.

## Not verifiable here: check on the real device

- 120 Hz pacing. The JVM gives no frame timing.
- HWUI bitmap upload cost.
- Chunk bake time on the background thread (`GroundCache`).
- Which bottom-screen path the Thor uses: `screen/PanelPresentation` or `screen/SecondaryActivity`.
- Gamepad routing (`screen/InputRouter`).

Say these to the owner explicitly in the hand-off. A passing screenshot test is not a device test.
