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
`openChest()` while `pendingChests > 0`. Matrix: stages `FLATS`, `MINES` (and the old `FOREST`, `LIBRARY`) x every starter weapon key in
`game_data.json` x policies {walk randomly, stand still with `s.hp = s.maxHp`, kite one direction} x 2-3 seeds, to
`stage.timeLimit` (1800 s = 108000 steps). Also a late-game variant: all evolutions added via `s.inv.add(...)` and
`s.time` set to 25 min. Run the matrix in parallel test methods if it takes too long; report the wall time.
Heroes: also run the matrix with `new Sim(..., hero)` for BASTION, SPECTRE, XENOMANT (aim bot as in `HeroAcceptanceTest`), with
random branch picks, and check `projN` (main bullets, patches and bomblets share the 600 pool), `main.linkN <= MAX_LINKS`, no NaN in
`aimX/aimY`, and the dodge cooldown never negative.
Run: `cd thor-survivors && SOAK=1 ./gradlew --offline testDebugUnitTest --tests '*ScratchSoakTest*' --rerun`.

Ashfall stages (design phase 7): the stage keys are `FLATS` (Cinder Flats) and `MINES` (Deep Mines); `FOREST` and `LIBRARY` are the old VS
stages and only exist for old tests. `app/src/test/java/se/felixarvid/thorsurvivors/game/StageSoak.java` is the ready harness (not a JUnit test):
a bot that aims the main weapon at the nearest enemy, flees the melee crowd, runs shooters down, sidesteps bolts and charge lines, keeps out of
pools and uses the dodge, with three policies: `immortal` (hp refilled: NaN, pools, the 300 cap), `mid` (mortal, takes weapons and branches first)
and `naked` (mortal, takes no card), plus `still` (mortal, never moves). It reads the same data as the game and uses the seeded constructor
`new Sim(d, stage, null, meta, hero, seed)` (the unseeded `Random` of the old constructor made the first spawns differ between runs).
Run one cell after `./gradlew --offline compileDebugUnitTestJavaWithJavac -q`:
`cd thor-survivors/app && java -cp <main classes>:<test classes>:json-20240303.jar:junit-4.13.2.jar:android.jar se.felixarvid.thorsurvivors.game.StageSoak FLATS BASTION mid 3 1800`
(`TRACE=296` prints the hero hp, bolts, hazards and the boss every half second from t=296 s). A full 30-minute run takes 1 to 6 s, so a
24-cell matrix with `xargs -P 4` runs in well under a minute. `StageSoakTest` runs a 5-minute immortal slice and the naked-bot rule in the normal
suite; with `SOAK=1` it also runs 30 minutes per hero and the mid-build survival rule. Extra checks for the roster: `eprojN <= Sim.MAX_EPROJ` (40),
`hazN <= MAX_HAZ` (32), ranged alive <= 24 (+6 slack for summons), `enemyN <= 300 + live bosses`, `dmgBy[]` (hero damage by source: contact, bolts,
areas and statuses, barrel blasts) to see what kills the bot. A pickup pool at 1200 for a minute or two in a 60 000-kill run is the designed
merge behaviour, not a leak; flag it only when it stays at the cap for a large share of the run.

Phase 9 and 10 additions to `StageSoak`: the bot walks to an equipment crate when the crowd is thin, answers the choice screen
(`s.resolveEquip(true)` while `s.equipN > 0`, the headless Sim never pauses by itself), aims at the boss when it is within 420 units, and
logs `Result.eliteAt` (spawn times), `eliteKilled`, `bossLog` / `bossTtk` (boss key and seconds from first sight to death), `worn`,
`firstKilled`, `peakExtra`. The 300 cap check is `enemyN <= 300 + flagged + StageSoak.SUMMON_SLACK` (flagged = bosses, elites and
tentacles; the slack is the elite adds, Vire's colonists and the hounds). Run one cell and see the elite and boss lines:
`java -cp ... StageSoak MINES BASTION mid 2 1800` prints a second line `elites at [...] bosses [...] ttk [...]`.
`EliteTest`, `EquipmentTest` and `BossTest` are the fast headless tests (seeded `Sim(..., seed)`, hero `null` so the hammer does not clear the scene);
`StageSoakTest.thirtyMinutesPerStageImmortalAndMortal` runs 30 minutes per stage with the immortal and the mortal mid bot in the normal suite (a few
seconds each), `aMidBuildKillsEveryBossInUnderNinetySeconds` the boss acceptance. What to look for after a change to bosses or elites: eliteAt gaps equal
`Elites.interval`, every boss dies (a boss that never dies is a stuck state), `peakHaz <= 32`, no NaN in the lanes and pulses.

Phase 12 additions to `StageSoak`: policy `plan` (like `mid`, but takes the passive a held weapon evolves with first, for the time to the first
evolution), `GEAR=0` in the environment (the equipment is taken off every step: A/B for the gear share), `Result.lvlAt/killsAt/xpAt` (level, kills and total XP at
5, 10 ... 30 min), `firstEvo`, `weaponsEnd`/`mainEnd` (inventory and branch tiers at the end), `gearPoints`, `lateGems`/`latePick` (mean gems and pickups
on the field during minutes 25 to 30) and `TRACE` lines with hazards by kind and damage taken by source. The Deep Mines boss The First arrives at 28:00.
A matrix of 240 runs (40 seeds x 2 stages x 3 heroes) takes about 3 minutes with `xargs -P 4`; retry a cell that prints nothing (once in 120 a JVM
printed no line during a parallel run).

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
