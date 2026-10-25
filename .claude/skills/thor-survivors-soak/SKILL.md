---
name: thor-survivors-soak
description: Long headless soak runs of the Thor Survivors Sim - full 30 minute stages on both stages, every starting weapon, evolutions - checking for NaN, pool exhaustion, leaks, stuck states and sound-event floods. Use after changes to Sim, waves, pickups, weapons or sound events, or when a long run misbehaves on the device.
---

# Soak test (thor-survivors)

Adapted from Claude-Code-Game-Studios (MIT), see .claude/CCGS-LICENSE.txt.

The original is a manual hour-long protocol; here the Sim is headless and runs far faster than real time
(`Sim.update(dt, Input)` with `dt = 1/60`), so the soak is a throwaway JVM test. Memory and frame time on the device
remain a manual job (see `thor-survivors-perf`).

## Harness

Throwaway `ScratchSoakTest.java` in `thor-survivors/app/src/test/java/se/felixarvid/thorsurvivors/game/` (delete
afterwards; keep only cheap, deterministic assertions as a real test if the owner wants one). Base it on
`SimSmokeTest.run`: `TestData.load()`, `new Sim(d, d.stages.get(stage), starter, new HashMap<>())`, a seeded `Random`
steering `Input.stickX/stickY` every 2 s, drain `pendingLevelUps` via `OfferGenerator.generate(...)`,
`openChest()` while `pendingChests > 0`. Matrix: stages `FOREST`, `LIBRARY` x every starter weapon key in
`game_data.json` x policies {walk randomly, stand still with `s.hp = s.maxHp`, kite one direction} x 2-3 seeds, to
`stage.timeLimit` (1800 s = 108000 steps). Also a late-game variant: all evolutions added via `s.inv.add(...)` and
`s.time` set to 25 min. Run the matrix in parallel test methods if it takes too long; report the wall time.
Run: `cd thor-survivors && ./gradlew testDebugUnitTest --tests '*ScratchSoakTest*' --rerun`.

## Check every N steps (e.g. 60) and at the end

- NaN/Infinity: `px, py, hp, xp` and every live enemy/projectile/pickup position and `hp` (`Float.isNaN/isInfinite`).
- Pools: `enemyN <= Sim.MAX_ENEMIES`, `projN <= MAX_PROJ`, `pickN <= MAX_PICK`; record the peak and the time it first
  reached 90 percent. A pool stuck at its cap for minutes means exhaustion (spawns or gems silently dropped; see
  `addEnemy` and the `pickN >= MAX_PICK` branch in `Sim.java`).
- Stuck states: `kills` not increasing for 120 s while `enemyN > 0` and a weapon is owned; `level` not increasing for 5 min;
  `pendingLevelUps`/`pendingChests` never drained; `ended` still 0 past `stage.timeLimit`; enemies far from the player
  that never despawn (count enemies beyond 2000 units).
- Leaks over time: compare `enemyN`, `pickN`, `projN` and live particle/damage-text counts at minute 5, 15, 25 for a
  monotonic climb at equal wave settings; JVM heap via `Runtime.totalMemory() - freeMemory()` after `System.gc()` at
  the same marks (growth > 10 percent after warm-up is a finding; the Sim allocates nothing per step by design).
- Sound events: `s.sound` counters (`emitted[id]`, `limited`, `overwritten`) per minute. Without draining the queue
  (as `SimSoundTest` does with `s.sound.clear()` each step) `overwritten` rising is expected; with a drain every
  frame, a rising `overwritten`, or `emitted` far above `MAX_PER_WINDOW` x 10 per second for one id, is a flood.
- Economy sanity: `gold` and `kills` end values are plausible and monotonic.

## Output

Matrix table `stage | starter | policy | seed | result (ok / finding)`, then findings with severity (S1 NaN or crash,
S2 stuck or exhausted pool, S3 drift), the first step number and seed that reproduces it, and the state at that moment
(`time`, `enemyN`, `projN`, weapons owned). A finding without a seed and a step is not reproducible: re-run to get
them. Hand reproductions to `implementer` as a failing seeded test. If the matrix could not run fully, list what was
skipped; do not report a clean pass for unrun cells.
