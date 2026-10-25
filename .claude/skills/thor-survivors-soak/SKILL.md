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
Run: `cd thor-survivors && SOAK=1 ./gradlew --offline testDebugUnitTest --tests '*ScratchSoakTest*' --rerun`.

Lessons from earlier soaks:
- `Sim.rng` is unseeded: call `s.rng.setSeed(seed)` right after construction or no run is reproducible.
- System properties (`-Dsoak=1`) do not reach the forked test JVM. Gate long runs on an env var (`SOAK=1`, read with
  `System.getenv`) and use `assumeTrue` so the normal suite skips them.
- Use `--offline` and a `--tests` filter; other agents may hold the Gradle lock (expect waits) and
  `ScratchBalance*` tests may be running at the same time. Leave their files alone.
- Include a mortal policy (no `s.hp = s.maxHp` reset, stand still or walk) so death, game over and the result path are
  exercised, not only the immortal runs.

## Check every N steps (e.g. 60) and at the end

- NaN/Infinity: `px, py, hp, xp` and every live enemy/projectile/pickup position and `hp` (`Float.isNaN/isInfinite`).
- Known hotspot: the pickup cap in `Sim.addPickup` (`MAX_PICK`). Pickups never despawn by age, so a standing-still
  run fills the pool around minute 9. Before the fix, gems merged into the first gem in the array and coins, food,
  power-ups and chests were silently dropped (levelling froze, evolutions could be lost). Now `Sim.condenseFar` folds
  far gems into one red gem and full-pool drops evict gems; `PickupPoolSaturationTest` covers it (FOREST, WHIP, still,
  seed 1, 12 min). Check `pickN` stays below `MAX_PICK`, at most one `red` pickup, and no normal gem above ~50 XP.
- Pools: `enemyN <= Sim.MAX_ENEMIES`, `projN <= MAX_PROJ`, `pickN <= MAX_PICK`; record the peak and the time it first
  reached 90 percent. A pool stuck at its cap for minutes means exhaustion (spawns or gems silently dropped; see
  `addEnemy` and the `pickN >= MAX_PICK` branch in `Sim.java`).
- Stuck states: `kills` not increasing for 120 s while `enemyN > 0` and a weapon is owned; `level` not increasing for 5 min (but the XP need jumps by design at level 20 and 40, so compare XP dropped against
  XP collected instead of looking at the level alone; a gem pile far away holding 100k XP is the tell);
  `pendingLevelUps`/`pendingChests` never drained; `ended` still 0 past `stage.timeLimit`; enemies far from the player
  that never despawn (count enemies beyond 2000 units).
- Leaks over time: compare `enemyN`, `pickN`, `projN` and live particle/damage-text counts at minute 5, 15, 25 for a
  monotonic climb at equal wave settings; JVM heap via `Runtime.totalMemory() - freeMemory()` after `System.gc()` at
  the same marks (growth > 10 percent after warm-up is a finding; the Sim allocates nothing per step by design).
- Sound events: `s.sound` counters (`emitted[id]`, `limited`, `overwritten`) per minute. Without draining the queue
  (as `SimSoundTest` does with `s.sound.clear()` each step) `overwritten` rising is expected; with a drain every
  frame, a rising `overwritten`, or `emitted` far above `MAX_PER_WINDOW` x 10 per second for one id, is a flood.
  Give the flood threshold about 10 percent slack: window edges let a few extra events through.
- Economy sanity: `gold` and `kills` end values are plausible and monotonic.

## Output

Matrix table `stage | starter | policy | seed | result (ok / finding)`, then findings with severity (S1 NaN or crash,
S2 stuck or exhausted pool, S3 drift), the first step number and seed that reproduces it, and the state at that moment
(`time`, `enemyN`, `projN`, weapons owned). A finding without a seed and a step is not reproducible: re-run to get
them. Hand reproductions to `implementer` as a failing seeded test. If the matrix could not run fully, list what was
skipped; do not report a clean pass for unrun cells.
