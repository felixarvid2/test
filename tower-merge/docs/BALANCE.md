# Balance report

How the numbers of Tower Merge were measured, what was found, what was changed and how to run it again.
All numbers below were produced by `npm run sim` (headless bots, deterministic seeds, simulated time at 1x
speed). "Before" means the data files as they were at commit `06c44f4f1`, "after" the current files.
The before runs are reproducible with the override string at the end of this document.

## 1. Method

| Piece | What it does |
|---|---|
| `tools/simulate.ts` (`npm run sim`) | CLI. Builds jobs (seed x policy x meta level x tower pool), runs them on 4 worker threads, prints the report. |
| `tools/balance/run.ts` | One instrumented run. Uses `BotHooks.onEvents` only (no change to `src/sim`): per-wave samples, castle damage by source, damage per tower type and level per slot-second, upgrade picks, synergies, events, final board. |
| `tools/balance/presets.ts` | Meta levels. A preset is a number of gems spent "cheapest next level first" (`fresh` 0, `mid` ~1500 incl. Lightning + Fire, `late` ~5000 incl. all towers, `max` everything) and turned into RunOptions by the game's own `buildRunOptions`. The meta levels belong to the preset, not to the pool of the run. |
| `tools/balance/probes.ts` | Paired experiments on the same seeds: every synergy forced on from wave 1 (and left to trigger naturally) versus no synergies; every upgrade granted as one stack from wave 1; every tower removed from the pool. This removes the survivorship bias of "picked at wave 12" statistics. |
| `tools/balance/towerBench.ts` | One tower of each type and level against stationary immortal dummies (single, armored orc, crowd of 8). Upper bound for AoE and damage-over-time, because the dummies never die or move. |
| `tools/balance/economy.ts` | Buy/sell loop tests on a real world plus price and event value tables. |
| `tools/balance/churnBot.ts` | A sixth bot: greedy plus "sell a lonely L1 tower and buy again when the board is full" (copied from `src/sim/bot.ts`, whose helpers are private). |
| `tools/balance/overrides.ts` | `--set balance.waves.hpGrowth=1.2,towers.arrow.damage=10` changes data numbers for one run and restores them. All tuning was done with it, then written to the data files. |

Policies: `greedy` (rarity-first upgrade picks, merges whenever possible), `churn`, `mergeHeavy` (merges, unlocks
slots late), `spreadOut` (never merges), `random` (random upgrades and board actions), `noUpgrades`.
Tower pools: `start` (arrow, cannon, frost), `full` (all 8), `subset` (random 3-5), and the default `natural`
pool of the preset (start / the 5 towers a mid player owns / all 8). All four abilities are available in the
tools; a real first run has only meteor and repair, which costs about one wave (greedy, fresh: 10.0 instead of 11.0).

Caveats. The bots are simple: they never choose which tower type to buy (the game rolls it), never think about
synergies and always take the first event option they can pay for. A human is better at the board and
worse at timing. The numbers are therefore good for comparing builds and for finding walls, not for predicting a
player. Waves last about 28 s (the path is 2615 px), so "minutes" scale with waves reached.

### Re-running

```
npm run sim                                   # quick sweep: 6 policies x fresh/mid/late, 10 runs per cell
npm run sim -- --runs 40 --pool all           # the full report (start/full/subset pools), a few minutes
npm run sim -- --policy greedy --meta late --sections bosses,deaths,killers
npm run sim -- --probe synergy --probe-runs 40      # also: upgrade, pool, towers, economy, all
npm run sim -- --runs 30 --set balance.waves.hpGrowth=1.19   # what-if without editing files
npm run sim -- --json runs.json               # raw run records
npm test -- tests/balance                     # regression guards (about 12 s)
```

Sections: `matrix, length, deaths, bosses, killers, towers, boards, economy, upgrades, synergies, events`.
The sweep prints `stderr` progress and the report on `stdout`.

## 2. Targets and result

Greedy bot, natural pools, 40 seeds. Median wave [p10-p90], mean simulated minutes.

| Meta | Target | Before | After |
|---|---|---|---|
| fresh (start towers) | median ~11, 3-6 min | 11.0 [9-14], 5.7 min | **11.0 [7-14], 5.6 min** |
| mid (~1500 gems, 5 towers) | 13-16 | 12.0 [12-14], 6.2 min | **16.0 [14-19], 8.1 min** |
| late (~5000 gems, 8 towers) | beats the Dragon (15) in most runs, dies by ~20-25 | 14.0 [13-16], 7.1 min; **65% of runs that reached the Dragon died to it** | **20.5 [17-22], 9.5 min; 3% die to the Dragon** |
| max (everything bought) | - | - | 23.0 [21-26], 9.4 min (30 seeds) |

All policies (median wave, after / before):

| Policy | fresh | mid | late |
|---|---|---|---|
| greedy | 11.0 / 11.0 | 16.0 / 12.0 | 20.5 / 14.0 |
| churn | 10.0 / 11.0 | 15.0 / 12.0 | 19.5 / 13.0 |
| mergeHeavy | 8.0 / 11.0 | 15.0 / 12.0 | 18.0 / 13.0 |
| random | 9.0 / 11.0 | 15.0 / 12.0 | 19.0 / 13.0 |
| noUpgrades | 9.0 / 9.0 | 13.0 / 12.0 | 16.0 / 12.0 |
| spreadOut (never merges) | 6.0 / 7.0 | 9.0 / 9.0 | 12.0 / 9.0 |

Merging is attractive (never merging loses 5-8 waves) and not blindly optimal: `mergeHeavy`, which merges
but delays slots, is 3 waves worse than `greedy` on a fresh save, and `churn` is no better than `greedy`.
Skipping upgrades costs 2 waves on a fresh save, 3 at mid and 4.5 at late meta, so upgrade picks matter.

Run length (greedy, after): fresh 5.6 min mean (p10 3.2, p90 7.6), 0% under 2.5 min, 23% over 7 min;
mid 8.1 min, late 9.5 min. Runs over 7 min exist only because they go far: the sim needs ~28 s per wave.
`spreadOut` fresh runs (a player who never merges) are the only ones under 2.5 min (38%).

## 3. Findings

### 3.1 Dominant strategies

* **Pool dilution is the largest open problem (needs code, not numbers).** The Buy button rolls a random tower
  of the unlocked pool, so every extra type lowers the chance of a merge pair, and merges are the only way to
  turn coins into power once the 12 slots are full (late runs sit on 600 coins at wave 15, 3500 at wave 21).
  Greedy, 24 seeds, median wave:

  | Pool | fresh meta | mid meta | late meta |
  |---|---|---|---|
  | start towers only (before / after) | 11.0 / 11.0 | 14.0 / 21.0 | 16.0 / 27.5 |
  | all 8 towers (before / after) | 10.5 / 8.0 | 12.0 / 14.0 | 14.0 / 21.0 |
  | random 3-5 towers (before / after) | 9.0 / 9.0 | 12.0 / 16.0 | 15.5 / 22.5 |

  At equal meta the start trio beats the full pool by 6-7 waves, and my retune (flatter hp curve, stronger meta)
  made the gap larger because deep merges are worth more now (before: 2 waves). With the meta held fixed,
  a pool of 3 / 4 / 5 / 8 towers reaches 20.8 / 18.6 / 15.5 / 14.5 waves at mid meta (24 seeds, mean). Every extra type costs 2-3 waves up to five types.
  A "never unlock towers, buy stats" player is ahead, which makes the 1450 gems of tower unlocks a trap.
  What did not help (tried with `--set` during tuning, mid meta, 20-24 seeds): +30% damage on the unlockable
  towers (no change), buyWeight -25% on unlockables (+0.6 waves; -60% gave +1.3 full / +3.7 five-tower pool but makes
  the unlocks rare), cheaper slots (+1 wave for every pool, same gap), a flatter L4/L5 curve (gap 6 -> 4 waves
  but it weakens the whole late game), the churn bot (no better than greedy). What would: a tower loadout of 3-5 types chosen by the player (the daily
  pools already work this way), or a roll weighted towards types with an unmatched tower on the board.
  `src/sim/board.ts` (`rollTowerType`) and `src/sim/offers.ts` are not mine; this is the first thing to decide.
* **Cannon carries the start trio** (removing it from the start pool costs 6.8 waves at mid meta, 8 at late) and
  **Frost is the second most valuable tower** (removal: -2.3 waves at mid / start pool, -1.6 / full pool, -7 at late
  / start pool) although it deals 3% of the damage. In the full pool no tower is critical (all within +-1 wave,
  the noise of the probe).
* Arrow remains the biggest damage dealer (41% of damage on 23% of the slots). It has the most support in
  the data (Twin Arrows, Marksman Training, Fire Arrows, Volatile Ammo, three arrow synergies). Left alone: 123% per slot.

### 3.2 Useless towers (damage per slot-second at equal level, relative to the average tower)

Measured over 432 runs of all policies and pools; levels are compared with each other, so a tower is not
punished for being merged less. Frost is a slow tower and is judged on its marginal value above.

| Tower | Board share | Damage share | Per slot, before | Per slot, after |
|---|---|---|---|---|
| arrow | 23% | 41% | 127% | 123% |
| cannon | 16% | 24% | 149% | 141% |
| frost | 14% | 3% | 17% | 23% |
| lightning | 11% | 7% | 73% | 82% |
| fire | 10% | 8% | 113% | 103% |
| poison | 10% | 4% | 62% | 71% |
| sniper | 7% | 5% | 132% | 133% |
| magic | 9% | 8% | 112% | 121% |

Poison had the lowest score among the real damage dealers (static estimate 23 dps at L1, the best, but the
poison needs time to stack and enemies die first); frost, lightning and poison were raised (section 4).
Static `describeTower` dps (the tooltip) is balanced: L2 is 2.37-2.46x L1 for every tower, later steps 1.66-2.23x.
The controlled bench (`--probe towers`, dummies that never die) overstates AoE and poison: fire L1 193%,
cannon 158%, magic L5 185% of the average there. It is kept as a regression guard only.

### 3.3 Synergies and upgrades

Synergies, waves gained over no synergies, forced on from wave 1 (40 paired seeds, greedy, fresh, +-0.3-0.6 ci):

| Synergy | Before | After | Note |
|---|---|---|---|
| venomBarrage | +1.2 | **+2.4** | strongest; natural play +1.75. Below the 4-wave limit. |
| tripleThreat | +1.0 | +1.4 | active in 90% of fresh runs |
| eagleEye, fortress, glacier, plagueDoctor, overload | +0.3 to +0.8 | +0.85 to +1.0 | |
| the other 11 | -0.0 to +0.6 | -0.1 to +0.6 | thunderstorm, arcaneStorm, deathMark, shatter, cryoRounds, flamingArrows are within noise of 0 |

No synergy alone adds more than 2.4 waves. The level-gated ones (plagueDoctor L4 poison, glacier L4 frost, overload
L5 lightning, deathMark L3 sniper, bombardment L4 cannon) almost never trigger naturally (0-8% of runs).
Four weak ones were nudged (section 4); shatter stays weak (frost rarely slows what the cannon shoots).

Upgrades, one stack granted at wave 1, 60 paired seeds, waves gained (after the nerfs; the flatter curve makes
every percent of power worth about twice the waves it was worth before, so compare the ranking, not the column):

| Upgrade | Rarity | Lift | | Upgrade | Rarity | Lift |
|---|---|---|---|---|---|---|
| archmagesLegacy | legendary | +2.4 | | killBounty | common | +0.9 |
| volatileAmmo | epic | +2.3 | | warChest | common | +0.85 |
| twinArrows | rare | +2.1 | | plunder | common | +0.8 |
| heavyHitters (+20% dmg) | common | +2.0 | | hagglers | common | +0.2 |
| combinedArms | epic | +1.95 | | bossSlayer | common | +0.1 |
| castleRegen | common | +1.7 | | elementalAttunement | common | +0.1 |
| primalAttunement | legendary | +1.6 | | spikedBattlements | rare | 0.0 |

Nothing exceeds 1.25x the lift of the plain "+20% damage" card (Heavy Hitters, +2.0). Two cards stood out before the change: Archmage's
Legacy (+3.3, a legendary that also resets cooldowns) and Mason Crew (castleRegen, +2.0 for a common that stacks 4x);
both were reduced (section 4). The weakest cards are situational by design (boss damage, sniper armor, thorns);
Spiked Battlements deals a flat 10 damage and cannot matter against thousands of hit points. Not changed.
Economy cards (Plunder, Bounty Hunter, War Chest) are positive but small, because coins stop being the limit
once the board is full.

Events (observed lift in waves of the bot's choice, 5 offers per run, 40 seeds): chest +0.5, cursed altar +0.4,
treasure trail +0.1, elite vanguard -0.1, merchant -0.1. Before the change the elite vanguard was -0.4 (it cost
more than it paid, because the coins it promises cannot be spent late) and treasure trail -0.2; their coin
multipliers were raised. No event is a runaway.

### 3.4 Economy

* Buy/sell loops lose money: buy+sell returns 60% of the price (-82 coins per cycle averaged over 40 cycles, the
  price grows with every purchase and never falls), buy 2 + merge + sell -164. A free level 2 tower from an
  event sells for 21 coins, the start arrow for 10. No loop.
* No interest-like effect: kill coins grow 7.5% per wave, the wave bonus is linear, and coin cards are small.
  Chest "Builder's tools" (a free slot) is worth 165 coins at wave 3 and 1253 at wave 15 (slot price grows 1.5x
  per unlock) and the free level 2 tower 104-306 coins, against a flat 120-coin option: the coin option was dominated
  at every point of a run (raised to 180). The merchant level 2 tower (90 coins) is a 13% discount at wave 3
  and 71% at wave 15; it is only offered once in a while and costs coins the bot prefers to spend on towers.
* Late-game coin overflow is the symptom of capacity-bound play (see 3.1): late runs hold 600 coins at wave 15 and
  3500 at wave 21 because there is nothing to buy once the slots are full.

### 3.5 Difficulty spikes and boss walls

Death distribution, greedy (hazard = share of the runs alive at the start of the wave that die in it):

* Before: nothing happened until the Cave Troll arrived at wave 11, then 44% of fresh runs died at 11 and 68% of
  mid-meta runs died at 12: a cliff, not a curve. Boss waves 5 and 10 killed nobody (0% in all metas), while the
  Dragon killed 100% of the mid runs and 65% of the late runs that reached it.
* After (fresh): 15% of the runs die in waves 6-7, then 6-13% per wave, 33% at wave 11 (two trolls are guaranteed)
  and 47% at 13. Mid: deaths spread over waves 14-18 (hazard 14-50% per wave). Late: 70% hazard at wave 21 (14 of 20
  survivors), the soft wall of the endless loop. The Troll's castle damage was lowered so that one leaked troll is
  not a third of the castle any more.
* Boss walls after (greedy, natural pools, death rate among runs that entered, castle HP lost in the wave):

  | Boss wave | fresh | mid | late | max |
  |---|---|---|---|---|
  | 5 Goblin King | 0%, loses 43% | 0%, 10% | 0%, 2% | 0%, 0% |
  | 10 Stone Golem | 8%, 48% | 0%, 19% | 0%, 10% | 0%, 0% |
  | 15 Dragon | - | 27%, 49% | 3%, 27% | 0%, 7% |
  | 20 Goblin King x2 | - | 0% (4 runs) | 17%, 34% | 0%, 8% |
  | 25 Stone Golem x2 | - | - | - | 20% (10 runs) |

  Boss waves are meant to be walls for the players who are supposed to meet them (fresh at 10, mid at 15, late at 20):
  challenging (they cost a third to a half of the castle) and not near-certain death. Before, a boss wave was
  easier than the wave next to it (escorts are 45% of a normal wave, the boss hp was too low); a second Goblin King
  was a pushover. `escortBudgetFraction` is unchanged.
* What kills the castle in the death wave: trolls (38% fresh, 35% mid), orcs (25% fresh, 39% late), goblin packs
  (late 17%). Trolls and orcs are the armored HP sponges; goblins are the packs that leak when towers are busy.

### 3.6 Boss mechanics

* **Fire breath** is aimed at the densest group of towers, not the castle: it caused at most 1% of the Dragon
  fight's castle damage (castle part 12/14/18 per breath). Its real effect is to scorch the towers on the line
  for 2 s. Not a damage spike.
* **Disable tower** picks a random enabled tower for 4-5 s every 11.9 s (phase 2) and 7.8 s (phase 3). A Dragon
  fight costs the board 11-14 tower-seconds, about 3% of the firepower of 10 towers over a 40 s fight. It is only
  harsh with a single tower (64% downtime in phase 3), which cannot be the board at wave 15. A guard test
  (`tests/balance/towers.test.ts`) keeps breath damage under 20% of the castle, disables under 6 s with a gap
  of at least 1.25x the duration, and telegraphs of at least 1 s.
* The telegraph freezes the Dragon in place (the sim sets its speed to 0 while it is "busy"), which is a gift
  to the towers; left as it is.

## 4. Changes

Numbers only, in `src/data`. "Why" refers to the finding above.

| File | Value | Old -> new | Why |
|---|---|---|---|
| `balance.ts` | `waves.hpScale` | 2 -> 3.7 | stronger early waves so that the flatter curve below still ends a fresh run around wave 11 |
| | `waves.hpGrowth` | 1.3 -> 1.2 | the cliff at waves 11-12 (3.5); a gentler per-wave growth lets power from meta and merges translate into waves (+10% damage is now worth about 1 wave) |
| | `waves.hpLateGrowth` | 1.03 -> 1.0 | the extra late growth made late meta nearly pointless (late reached 14 against 11 fresh) |
| | `boss.loopHpMult` | 2.6 -> 3.6 | at 2.6 the second Goblin King (wave 20) killed 0% of late runs and cost only 21% of the castle (3.5) |
| `towers.ts` | cannon `damage` | 34 -> 31 | 149% of the average per slot, carries the start trio |
| | sniper `damage` | 55 -> 51 | 132%, always firing at 560 range |
| | frost `damage` | 6 -> 8 | 17% per slot; the slow stays its job |
| | lightning `damage` | 13 -> 14.5 | 73% per slot |
| | poison `fireRate` | 1.0 -> 1.5 | 62% per slot: stacks need shots (changing `poisonDpsPerStack` instead also boosted Venom Barrage to +2.6) |
| `enemies.ts` | all `speed` | x1.15 (goblin 80 -> 92, rat 150 -> 172, skeleton 74 -> 85, bat 112 -> 129, orc 66 -> 76, shaman 68 -> 78, summoner 66 -> 76, troll 54 -> 62, stoneling 88 -> 101, imp 135 -> 155) | waves 1-5 took 30 s each with nothing happening; shortens a fresh run by ~0.6 min |
| | troll `castleDamage` | 20 -> 15 | a single leaked troll was 20% of the castle; troll wave 11 was the cliff |
| `bosses.ts` | goblinKing `hp` / `speed` | 1100 -> 1900 / 72 -> 83 | boss wave 5 killed nobody and cost the castle 9% |
| | stoneGolem `hp` / `speed` | 3600 -> 7500 / 56 -> 64 | 0% deaths in every meta |
| | dragon `hp` / `speed` | 5600 -> 15000 / 48 -> 55 | before, only the few runs that survived the wave 11-12 cliff met it, and it killed 100% (mid) / 65% (late) of them; now mid meets it at 27% death and late beats it |
| `meta.ts` | `metaDamage.valuePerLevel` | 0.04 -> 0.12 | on the old curve doubling both numbers moved late meta by only 1.5 waves; late meta (~5000 gems) now has +72% damage and +60% attack speed |
| | `metaFireRate.valuePerLevel` | 0.03 -> 0.10 | same |
| | `metaExtraSlot.baseCost` | 350 -> 200 | the cheapest-first player never reached the slot cards (late: 4 slots) |
| | `metaStartLevel.baseCost` | 300 -> 200 | same |
| `synergies.ts` | shatter | +50% -> +80% | weak (descriptions updated) |
| | napalm | 8 -> 14 dps | weak |
| | arcaneStorm | 20% -> 30% chain chance | weak |
| | cryoRounds | 20% -> 30% freeze | weak |
| `upgrades.ts` | castleRegen | 1 -> 0.5 HP/s per stack | common worth +2.0 waves |
| | archmagesLegacy | +50% power, -30% cooldown -> +35%, -20% | legendary worth +3.3 waves |
| `events.ts` | chest coins | 120 -> 180 | dominated by the free tower and slot options |
| | elite vanguard coins | x1.5 -> x2, x2 -> x3 | cost 0.4 waves, paid in coins that cannot be spent |

Not changed on purpose: arrow (123%, and its damage is hard-coded in ~30 flag tests), `poisonDpsPerStack`,
castle hp meta, buy weights, economy prices, level multipliers, `escortBudgetFraction`.

Tests changed because they encode numbers I changed (and nothing else): `tests/content/content.test.ts`
(meta caps: damagePct 0.04 -> 0.12, fireRatePct 0.03 -> 0.10), `tests/menus/logic.test.ts` (three assertions on
the damage meta card: 12% -> 36% at level 3, 28% -> 84% at level 7, "+4%" -> "+12%"), `tests/sim/bot.test.ts`
(only the timeouts of the three 8-seed tests: they ran 4-5 s against the 5 s default and failed on a loaded machine
before any change). New: `tests/balance/*.test.ts` (regression, economy, towers and bosses, the tools).

## 5. For others

1. Decide the pool dilution problem (3.1): tower loadout or biased roll. It dwarfs every other finding.
2. `src/sim/offers.ts` counts `towerPool` as "on the board" for `requires.anyTower`, so a full-pool player is offered
   cards for towers that may never appear. Measured cost: about 0.8 waves at late meta. Using the towers actually
   on the board would fix it.
3. Tooltips: `estimateDps` assumes steady-state poison stacks; poison L1 shows ~50% more dps than arrow but realizes
   71% of the average per slot. Show per-hit damage or damage over time instead.
4. Pacing: a wave takes ~28 s because the path is 2615 px; mid and late runs are 8-10 minutes. A fast-forward or
   faster base speeds would shorten them (every +10% enemy speed costs about one wave on a fresh save).
5. `tests/sim/bot.test.ts` is the slowest test (about 8 s); the balance guards add 12 s.
6. A real first run has two abilities (meteor, repair): about one wave less than the fresh numbers above.

## 6. Reproducing the "before" numbers

```
npm run sim -- --runs 40 --set "balance.waves.hpScale=2,balance.waves.hpGrowth=1.3,balance.waves.hpLateGrowth=1.03,towers.cannon.damage=34,towers.frost.damage=6,towers.lightning.damage=13,towers.poison.fireRate=1,towers.sniper.damage=55,enemies.goblin.speed=80,enemies.rat.speed=150,enemies.skeleton.speed=74,enemies.bat.speed=112,enemies.orc.speed=66,enemies.shaman.speed=68,enemies.summoner.speed=66,enemies.troll.speed=54,enemies.stoneling.speed=88,enemies.imp.speed=135,enemies.troll.castleDamage=20,bosses.goblinKing.hp=1100,bosses.goblinKing.speed=72,bosses.stoneGolem.hp=3600,bosses.stoneGolem.speed=56,bosses.dragon.hp=5600,bosses.dragon.speed=48,meta.metaDamage.valuePerLevel=0.04,meta.metaFireRate.valuePerLevel=0.03,meta.metaExtraSlot.baseCost=350,meta.metaStartLevel.baseCost=300,synergies.shatter.effects.0.value=0.5,synergies.napalm.effects.0.value=8,synergies.arcaneStorm.effects.0.value=0.2,synergies.cryoRounds.effects.0.value=0.2,upgrades.castleRegen.effects.0.value=1,upgrades.archmagesLegacy.effects.0.value=0.5,upgrades.archmagesLegacy.effects.1.value=-0.3,events.elite.options.accept.waveModifier.coinMult=1.5,events.elite.options.hunt.waveModifier.coinMult=2,events.chest.options.coins.effects.0.value=120,balance.boss.loopHpMult=2.6"
```

## 7. Performance and packaging

`npm run perf` (headless, `node --expose-gc`): 150 enemies alive, 12 level 5 towers (all eight types) with 27 flags
(every proc, status, spread and chain), projectile cap saturated at 230-265 of 320, 1800 frames after a warm-up:
`update(1/60)` averages **0.22 ms** (p95 0.46, p99 0.72, max 2.5-3.1 ms) against a 16.7 ms frame, with ~60 events
drained per frame. Garbage per update: **~124 KiB average** (p95 183, max 250), the number to watch on low-end phones
(~7 MB/s at 60 fps). A complete late-meta bot run (6.4 simulated minutes) takes 0.3 s.

`npm run package` builds, validates `dist/` against `docs/PLAYABLES.md` and writes
`release/tower-merge-playables.zip` (165 files, 1.38 MiB, initial bundle about 1.39 MiB compressed, index.html at the
zip root, verified with `unzip -t`). It fails with a message for: missing or late Playables SDK tag, extra HTML pages,
absolute or external paths in html/css/code (including CDN fonts and scripts), referenced files that are not in
`dist/`, file names outside `[A-Za-z0-9_.-]`, more than 8000 files, a file of 30 MiB or more, an initial bundle of
30 MiB or more. Warnings (the package is still written): files over 512 KiB (the Phaser chunk, 1.41 MiB), library
URLs inside Phaser (credits, not requests), one `new Function()` in the Phaser chunk, source maps. Run the Playables
bundle analyzer on the Phaser chunk before submitting (see PLAYABLES.md).
