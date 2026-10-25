---
name: thor-survivors-balance
description: Find balance outliers in Thor Survivors - weapon DPS per level and per evolution, dominant builds, passive value, enemy HP/speed/XP against the player's power curve, XP-to-level curve, gold and shop economy. Measures with seeded headless Sim runs and returns a ranked findings table with proposed numeric changes. Use for "is X too strong", "check balance", or after changing game_data.json or Sim formulas.
---

# Balance check (thor-survivors)

Adapted from Claude-Code-Game-Studios (MIT), see .claude/CCGS-LICENSE.txt.

The reference is Vampire Survivors; the numbers come from REA, so a value that differs from VS is suspect, not
automatically wrong. Measure, do not eyeball. Absence of data is a finding: if a number could not be measured, say
`NOT MEASURED` for it instead of guessing.

## Where the numbers live

- `thor-survivors/app/src/main/assets/game_data.json`: `weapons` (level 1 row is absolute, later rows are deltas;
  `interval` ms, `power`, `area`, `amount`, `critChance`), `enemies` (`maxHp`, `speed`, `power`, `xp`),
  `stages.<KEY>.rows` (minute-by-minute waves: `minimum`, `frequencyMs`, enemy and boss lists) and
  `mods` (`EnemyHealthMultiplier`, `GoldMultiplier`, `XPBonus`), `powerups` (shop, `price`, per-rank delta).
- Formulas: `game/Sim.java` (damage, crit, knockback, gem and gold pickup, `openChest`), `game/PlayerStats.java`
  (passives and shop to multipliers; note the `cooldownMul` floor of 0.25), `game/Progression.java` (`xpToNext`),
  `game/OfferGenerator.java` (level-up offers), `game/MetaProgress.java` (shop prices and rank).

## Method

1. Scope: weapons, enemies/waves, progression, or economy (default: all, shallow).
2. Write a throwaway JVM test `thor-survivors/app/src/test/java/se/felixarvid/thorsurvivors/game/ScratchBalanceTest.java`
   (delete it afterwards, never commit it unless the owner wants a regression test). Pattern from `SimSmokeTest` and
   `WeaponBehaviourTest`: `TestData.load()`, `new Sim(d, d.stages.get("FOREST"), "WHIP", new HashMap<>())`,
   `s.rng.setSeed(n)`, step `s.update(1f/60f, input)`, keep the player alive with `s.hp = s.maxHp`, drain
   `s.pendingLevelUps` with `OfferGenerator.generate(...)`. Write results to `$SCRATCH_OUT` (fallback
   `app/build/scratch/`), one CSV per measurement, not to stdout.
3. Run: `cd thor-survivors && ./gradlew testDebugUnitTest --tests '*ScratchBalanceTest*' --rerun`. Use 3+ seeds and
   report the median; a single seed is an anecdote.
4. Measurements worth taking:
   - Weapon DPS: weapon alone at level 1..max against stationary 1e5-HP dummies (`WeaponBehaviourTest.dummy`), damage
     dealt per second. Repeat for each evolution and for the pair (weapon + its `evoSynergy` passive).
   - Dominant builds: for each starter, auto-pick level-ups (random seeded policy and "greedy by weapon") for the full
     stage with the player invulnerable; record kills, level reached, time when enemy count first exceeds 200.
   - Survival curve: same without `s.hp = s.maxHp`, standing still and walking; time of death per starter.
   - Enemy vs player: per wave row, enemy HP x `EnemyHealthMultiplier` against measured DPS at that minute (TTK for
     a typical enemy; bosses separately); contact damage per second against `maxHp` and `armor`.
   - XP curve: minutes to reach level 10/20/30/40 and gems collected; flag a dead zone (no level-up for > 90 s) or
     a spike (3+ levels at once outside chests).
   - Economy: gold per run per stage, runs needed to buy each `powerups` rank (`MetaProgress.nextPrice`); an item
     never worth buying, or a catalog that is exhausted in a few runs, is a finding.
5. Compare with VS expectations only where the data shows them (REA values); mark other targets as `no target`.

## Output

```
## Balance check: <scope>   Health: HEALTHY | CONCERNS | CRITICAL | NOT ASSESSED
Method: seeds, durations, harness file (path), what was not measured.

| # | Severity | Item | Measured | Expected | Proposed change (file, key, old -> new) |
```
- CRITICAL: a build/weapon that dominates every alternative, an unwinnable or auto-won stage, a gold loop with no sink.
- CONCERNS: outliers a tuning pass fixes. Every row carries a concrete number and which measurement supports it.
- Then "Degenerate strategies", "Progression curve" (small table by minute), "Economy" (runs to afford each rank).

Do not edit `game_data.json` yourself in this skill; hand the table to `implementer`. `game_data.json` is generated
by `tools/build_data.py` from REA, so a permanent change belongs in the generator or in a post-processing step, not
only in the JSON. After a change, re-run the same harness and the project tests.
