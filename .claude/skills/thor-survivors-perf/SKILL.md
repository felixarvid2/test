---
name: thor-survivors-perf
description: Performance budgets and measuring for Thor Survivors on the AYN Thor - frame time at 60/120 Hz with about 300 enemies, allocation-free game loop, ground chunk bake time, bitmap memory. Headless JVM measurements and allocation checks, Robolectric render timing as a proxy, and what only perfetto/systrace on the device can answer. Use when the game stutters, before adding per-frame work, or after changing Sim, WorldRenderer or GroundCache.
---

# Performance (thor-survivors)

Adapted from Claude-Code-Game-Studios (MIT), see .claude/CCGS-LICENSE.txt.

Never optimise without a measurement, and never report headroom against a budget nobody measured: unmeasured is
`NOT MEASURED`. README lists 60 fps with about 300 enemies on the Thor as untested on hardware.

## Budgets (proposals; the owner may change them)

| Metric | Budget | Source of the number |
|---|---|---|
| Frame (60 Hz) | 16.7 ms total, Sim.update + draw each <= 8 ms on device | `GameView` Choreographer loop |
| Frame (120 Hz) | 8.3 ms total (`GameView` asks for 120 Hz where the panel has it) | same |
| Sim.update alone, crowd full | <= 2 ms on the JVM (a phone core is several times slower) | measure |
| Allocation in the loop | 0 bytes per `Sim.update` and per world draw | `Sim` header comment |
| Pools | `Sim.MAX_ENEMIES` 320, `MAX_PROJ` 600, `MAX_PICK` 1200, `MAX_PART` 600 never exceeded | `Sim.java` |
| Ground chunk bake | background thread `ground-chunks`, never on the frame path except start/teleport | `render/GroundCache.java` (CAP 24 chunks, 640 px each at 1080p) |
| Bitmap memory | ground LRU 24 x 640x640x4 B ~ 39 MB, model sheets ~41 MB, world/vfx/icons atlases ~15 MB; total heap under ~150 MB | `GroundCache.CAP`, `tools/build_ashfall_assets.py` prints the model RAM |
| Lighting | `Lighting` map 320x180 A8 plus <= 12 blobs per frame; LIGHTING FULL/LOW/OFF row in the menu. Device cost UNMEASURED (software proxy: FULL ~4x OFF) | `render/Lighting.java`, `RenderCostTest` |

## Measure headless

1. Sim cost: throwaway test `ScratchPerfTest` in `thor-survivors/app/src/test/java/se/felixarvid/thorsurvivors/game/`
   (delete afterwards). Build a Sim like `SimSmokeTest.lateGameWithEvolvedWeaponsAndCrowd` (FOREST, 5-6 evolved
   weapons, `s.time = 25 * 60`), warm up 600 steps, then time 3000 steps of `s.update(1f/60f, in)` with
   `System.nanoTime()`; report median, p99, max per step, and `s.enemyN`/`projN`/`pickN` peaks. Time also at 1/120 s.
2. Allocation: `com.sun.management.ThreadMXBean.getThreadAllocatedBytes(Thread.currentThread().getId())` before and
   after the measured steps; expect 0 after warm-up. A non-zero value: bisect by calling the sub-steps (they are
   private; use the whole `update` with weapons removed, or `noSpawnsForTest()`) to find the allocating one.
3. Render proxy (`render/RenderCostTest` already does steps 3 and the zero-allocation check for FULL/LOW/OFF at 300 enemies; its output lines start with `PERF`): `render/ScreenshotTest` and `StageShotsTest` rasterise real Canvas via Robolectric (see skill
   `thor-survivors-screenshots`). Time `WorldRenderer.draw` for 50 frames of a full crowd. Software raster on x86 is
   only an order-of-magnitude proxy: use it to compare before/after, never as an absolute fps claim.
4. Chunk bake: `GroundCacheTest` has `bake`/test hooks; time one chunk bake on the calling thread.
5. Run: `cd thor-survivors && ./gradlew testDebugUnitTest --tests '*ScratchPerfTest*' --rerun`; write results to
   `$SCRATCH_OUT` or `app/build/scratch/`.

## Static review checklist (candidates only, confirm by measuring)

`new`, boxing, string concat or `String.format` in `Sim.update`, `WorldRenderer.draw`, `PanelRenderer` per frame;
`HashMap` lookups per enemy per frame; O(n*m) loops over enemies x projectiles (the spatial grid `gridHead` exists);
`Paint`/`Path` creation in draw; Bitmap creation outside load; locks held across draw (`Engine.lock`).

## Device-only (the owner runs these; give the exact commands)

- `adb shell dumpsys gfxinfo se.felixarvid.thorsurvivors framestats` for janky-frame share.
- Perfetto: `adb shell perfetto -o /data/misc/perfetto-traces/t.pftrace -t 20s sched freq gfx view am` then open in
  ui.perfetto.dev; look at the game thread's slices per vsync and the `ground-chunks` thread.
- `adb shell dumpsys meminfo se.felixarvid.thorsurvivors` for Graphics/Native heap after 10 minutes of play.
- Thermal throttling after 15+ minutes can only be seen on the device.

## Output

Table `Metric | Budget | Measured (how) | Status OK/OVER/NOT MEASURED`, top 3 hotspots with `file:line`, expected gain and
risk, a "needs device" list. Fixes go to `implementer` as a spec; re-measure with the same harness afterwards.
