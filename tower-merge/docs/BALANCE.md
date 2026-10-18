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
| `tools/balance/presets.ts` | Meta levels and loadouts. A preset is a number of gems spent "cheapest next level first" (`fresh` 0, `mid` ~1500 incl. Lightning + Fire, `late` ~5000 incl. all towers, `max` everything) and turned into RunOptions by the game's own `buildRunOptions`. The meta levels belong to the preset, not to the loadout of the run. `BEST_LOADOUT` is the default loadout per preset; `randomLoadout` draws a legal one. |
| `tools/balance/probes.ts` | Paired experiments on the same seeds: every synergy forced on from wave 1 (and left to trigger naturally) versus no synergies; every upgrade granted as one stack from wave 1; every tower removed from the pool; **every 4-tower loadout of the 8 towers** (`--probe loadout`). This removes the survivorship bias of "picked at wave 12" statistics. |
| `tools/balance/towerBench.ts` | One tower of each type and level against stationary immortal dummies (single, armored orc, crowd of 8). Upper bound for AoE and damage-over-time, because the dummies never die or move. |
| `tools/balance/economy.ts` | Buy/sell loop tests on a real world plus price and event value tables. |
| `tools/balance/churnBot.ts` | A sixth bot: greedy plus "sell a lonely L1 tower and buy again when the board is full" (copied from `src/sim/bot.ts`, whose helpers are private). |
| `tools/balance/overrides.ts` | `--set balance.waves.hpGrowth=1.2,towers.arrow.damage=10` changes data numbers for one run and restores them. All tuning was done with it, then written to the data files. |

Policies: `greedy` (rarity-first upgrade picks, merges whenever possible), `churn`, `mergeHeavy` (merges, unlocks
slots late), `spreadOut` (never merges), `random` (random upgrades and board actions), `noUpgrades`.
Tower pools (the game's loadout, at most 4 towers, `LOADOUT_SIZE` in `src/core/meta.ts`): `start` (arrow, cannon,
frost, what a fresh save has), `natural` (the preset's default loadout: start trio fresh, arrow + cannon + frost +
lightning for mid and late), `loadout4` (a random legal 4-tower loadout of the unlocked towers), `subset` (random 3-4
towers of all 8) and the legacy `full` (every unlocked tower in the pool, no longer possible in the game; used for the
"before" numbers). All four abilities are available in the tools; a real first run has only meteor and repair,
which costs about one wave (greedy, fresh: 10.0 instead of 11.0).

Caveats. The bots are simple: they never choose which tower type to buy (the game rolls it), never think about
synergies and always take the first event option they can pay for. A human is better at the board and
worse at timing. The numbers are therefore good for comparing builds and for finding walls, not for predicting a
player. Waves last about 28 s (the path is 2615 px), so "minutes" scale with waves reached. With 24-40 seeds a
median has a standard error of about 1 wave; differences under 1.5 waves between two loadouts are noise.

### Re-running

```
npm run sim                                   # quick sweep: 6 policies x fresh/mid/late, 10 runs per cell
npm run sim -- --runs 40 --pool all           # the full report (start/natural/loadout4/subset pools), a few minutes
npm run sim -- --probe loadout --probe-meta mid --probe-runs 40   # every 4-tower loadout (about 2 min at mid, 12 seeds at late)
npm run sim -- --policy greedy --meta late --sections bosses,deaths,killers
npm run sim -- --probe synergy --probe-runs 40      # also: upgrade, pool, loadout, towers, economy, all
npm run sim -- --runs 30 --set balance.waves.hpGrowth=1.19   # what-if without editing files
npm run sim -- --abilities meteor,repair --meta fresh   # what a first run really has
npm run sim -- --json runs.json               # raw run records
npm test -- tests/balance                     # regression guards (about 12 s)
```

Sections: `matrix, length, deaths, bosses, killers, towers, boards, economy, upgrades, synergies, events`.
The sweep prints `stderr` progress and the report on `stdout`.

## 2. Targets and result

Greedy bot, natural loadouts (fresh: start trio; mid and late: arrow + cannon + frost + lightning), 40 seeds.
Median wave [p10-p90], mean simulated minutes. "Before" = the old data with the old pools (no loadouts: the five
towers a mid player owns, all eight for late; `--pool full`).

| Meta | Target | Before | After |
|---|---|---|---|
| fresh (start towers) | median ~11, 3-6 min | 11.0 [9-14], 5.7 min | **11.0 [8-15], 5.5 min** |
| mid (~1500 gems) | 13-16 | 12.0 [12-14], 6.2 min | **16.0 [13-19], 8.0 min** (median loadout 15, see 3.1) |
| late (~5000 gems) | beats the Dragon (15) in most runs, dies by ~20-25 | 14.0 [13-16], 7.1 min; **65% of runs that reached the Dragon died to it** | **21.0 [16-23], 9.7 min; 5% die to the Dragon** |
| max (everything bought) | - | - | 26.0 [21-28], 13.6 min (30 seeds) |

All policies (median wave, after / before):

| Policy | fresh | mid | late |
|---|---|---|---|
| greedy | 11.0 / 11.0 | 16.0 / 12.0 | 21.0 / 14.0 |
| churn | 11.0 / 11.0 | 15.5 / 12.0 | 19.0 / 13.0 |
| mergeHeavy | 8.5 / 11.0 | 15.0 / 12.0 | 19.0 / 13.0 |
| random | 9.0 / 11.0 | 14.0 / 12.0 | 17.0 / 13.0 |
| noUpgrades | 9.0 / 9.0 | 13.0 / 12.0 | 15.0 / 12.0 |
| spreadOut (never merges) | 6.0 / 7.0 | 9.0 / 9.0 | 11.0 / 9.0 |

Merging is attractive (never merging loses 5-10 waves) and not blindly optimal: `mergeHeavy`, which merges
but delays slots, is 2.5 waves worse than `greedy` on a fresh save, and `churn` is no better than `greedy`.
Skipping upgrades costs 2 waves on a fresh save, 3 at mid and 6 at late meta, so upgrade picks matter.

Run length (greedy, after): fresh 5.5 min mean (p10 3.7, p90 7.3), 0% under 2.5 min, 13% over 7 min;
mid 8.0 min, late 9.7 min. Runs over 7 min exist only because they go far: the sim needs ~28 s per wave.
`spreadOut` fresh runs (a player who never merges) are the only ones under 2.5 min (25%).

## 3. Findings

### 3.1 Loadout (dominant strategies)

**Before the loadout the game had a trap.** The Buy button rolled from every unlocked tower, so each extra type
lowered the chance of a merge pair, and merges are the only way to turn coins into power once the 12 slots are
full. Greedy, mid meta, median wave: start trio 21, all 8 towers 14 (with the old data the gap was 2 waves; my
retune, which lets deep merges pay off, raised it to 7). A "never unlock a tower, buy stats" player was far ahead,
which made the 1450 gems of tower unlocks a trap. Things that did not fix it with numbers alone: +30% damage on the
unlockables, buy weights, cheaper slots, a flatter L4/L5 curve, the churn bot (sell a lonely L1 and rebuy).

**Now** the pool is the player's loadout (3-4 towers, one must hit air). Every loadout of 4 towers out of all 8
(70 of them, plus the start trio) was played with the same meta bonuses and seeds (`--probe loadout`, greedy):

| | mid meta (40 seeds) | late meta (12 seeds) |
|---|---|---|
| best loadout | arrow + poison + sniper + magic, mean 18.4 | frost + fire + sniper + magic, mean 26.2 |
| start trio (arrow + cannon + frost) | 17.7, rank 3 of 71 | 23.3, rank 3 of 71 |
| median loadout | 14.9 | 19.8 |
| worst loadout | frost + lightning + sniper + magic, 11.9 | cannon + lightning + fire + sniper, 15.8 |

* **The trap is gone**: the best 4-loadout of the eight is at least as good as the start trio (+0.7 waves at
  mid, +2.9 at late), a loadout of the new towers is a sideways step at mid meta and an upgrade at late meta.
  Unlocking adds options more than power at mid meta; the start trio stays a top-3 loadout. The 3-vs-8 tower
  gap of 7 waves has become 0-3.
* **No dominant loadout**: the top 10 at mid span means 16.4-18.4 (inside the +-1.3 noise of 40 seeds); three
  different arrow-based trios and quartets are on top, none is more than 1 wave above the next.
* **Every tower is in a competitive loadout** (best rank of 71 at mid / late): arrow 1 / 2, poison 1 / 2,
  sniper 1 / 1, magic 1 / 1, fire 2 / 1, frost 4 / 1, lightning 6 / 11, cannon 12 / 16. Cannon (cannot hit flyers)
  and lightning (chains for small hits) are the weakest additions: loadouts with them average 0.8-1.7 waves less
  than loadouts without; they are best in the start trio and in arrow + cannon + frost + lightning.
* **Arrow is the safest pick, not a requirement**: loadouts with arrow average 15.6 (mid) / 20.2 (late), without
  1.5 / 1.1 waves less; the best arrow-less loadouts (frost + fire + sniper + magic, frost + fire + poison + magic)
  reach rank 1-8 at late meta.
* The spread between the best and the median loadout is 3.5 waves at mid and 6 at late meta: choosing well
  matters, choosing badly costs up to 4 waves (worst loadouts all contain lightning and cannon or lack arrow).

Other scenarios, greedy, 24 seeds, median wave:

| Pool | fresh | mid | late |
|---|---|---|---|
| start trio | 11.0 | 16.0 | 23.5 |
| default loadout (arrow + cannon + frost + lightning) | 11.0 | 16.0 | 20.5 |
| random legal 4-loadout of the unlocked towers | 9.0 (trio) | 14.0 | 18.5 |
| random 3-4 towers of all 8 | 10.0 | 15.0 | 19.5 |

* **Cannon carries the start trio** (removing it from the start pool costs 7-8 waves at mid and late meta) and
  **Frost is the second most valuable tower** (removal: -2 waves at mid, up to -7 at late meta in the start trio)
  although it deals 6% of the damage.
* Arrow remains the biggest damage dealer (47% of damage on 32% of the slots). It has the most support in
  the data (Twin Arrows, Marksman Training, Fire Arrows, Volatile Ammo, three arrow synergies).


### 3.2 Useless towers (damage per slot-second at equal level, relative to the average tower)

Measured over 1728 runs of all policies, loadouts and metas (the average is taken per level, so a tower is
not punished for being merged less). Frost is a slow tower and is judged on its marginal value above.

| Tower | Board share | Damage share | Per slot, before | Per slot, after |
|---|---|---|---|---|
| arrow | 32% | 47% | 127% | 96% |
| cannon | 23% | 27% | 149% | 146% |
| frost | 19% | 6% | 17% | 25% |
| lightning | 10% | 6% | 73% | 113% |
| fire | 5% | 4% | 113% | 125% |
| poison | 4% | 1% | 62% | 81% |
| sniper | 3% | 2% | 132% | 143% |
| magic | 4% | 7% | 112% | 158% |

(Board shares moved because the pools changed: "before" was measured on the old 8-tower pools.) Every tower
except frost is inside 60-160% per slot. Magic and sniper were above 180% under loadouts (they merge to L4-L5
more often in a pool of four) and were reduced; lightning, poison and frost were raised. Poison had the
lowest score among the damage dealers (static estimate 23 dps at L1, the best, but poison needs time to stack
and enemies die first).
Static `describeTower` dps (the tooltip) is balanced: L2 is 2.37-2.46x L1 for every tower, later steps 1.66-2.23x.
The controlled bench (`--probe towers`, dummies that never die) overstates AoE and poison: fire L1 193%,
cannon 158%, magic L5 185% of the average there. It is kept as a regression guard only.


### 3.3 Synergies and upgrades

(Probes run before the loadout re-tune, on the 3-5 tower pools they needed; the ranking is what matters. Reference points: tripleThreat was reduced afterwards, so it is lower now.)

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
* After (fresh): 5% of the runs die before wave 8, then 9-17% per wave, 42% at wave 11 (two trolls are
  guaranteed) and 43% at 12. Mid: deaths spread over waves 13-19 (hazard 9-60% per wave). Late: 48% hazard at
  wave 21 (10 of 21 survivors), the soft wall of the endless loop; 93% of late runs end between 14 and 23.
* Boss walls after (greedy, natural loadout; death rate among runs that entered, castle HP lost in the wave;
  40 seeds):

  | Boss wave | fresh | mid | late | max (30 seeds) |
  |---|---|---|---|---|
  | 5 Goblin King | 0%, loses 39% | 0%, 9% | 0%, 1% | 0%, 0% |
  | 10 Stone Golem | 17%, 48% | 0%, 20% | 0%, 10% | 0%, 0% |
  | 15 Dragon | 100% (5 runs), - | 23%, 49% | 5%, 29% | 0%, 14% |
  | 20 Goblin King x2 | - | - | 9%, 30% | 3%, 5% |
  | 25 Stone Golem x2 | - | - | - | 0%, 25% |

  Boss waves are meant to be walls for the players who are supposed to meet them (fresh at 10, mid at 15, late at 20):
  challenging (they cost a third to a half of the castle) and not near-certain death. Before, a boss wave was
  easier than the wave next to it (escorts are 45% of a normal wave, the boss hp was too low); a second Goblin King
  was a pushover. `escortBudgetFraction` is unchanged. The Dragon is the real test for mid meta (23-40% death
  depending on the loadout); the start trio and four-tower loadouts differ by less than 10 points.
* What kills the castle in the death wave: trolls (30% fresh, 24% mid), orcs (20% fresh, 27-28% mid and late), goblin
  packs (late 18%). Trolls and orcs are the armored HP sponges; goblins are the packs that leak when towers are busy.


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

Numbers only, in `src/data`. "Why" refers to the finding above. The first block was done before the loadout
existed; the second block is the loadout re-tune (the tuned values below are the final ones).

| File | Value | Old -> new | Why |
|---|---|---|---|
| `balance.ts` | `waves.hpScale` | 2 -> 3 | stronger early waves so that the flatter curve below still ends a fresh run around wave 11 |
| | `waves.hpGrowth` | 1.3 -> 1.23 | the cliff at waves 11-12 (3.5); a gentler per-wave growth lets power from meta and merges translate into waves (+10% damage is worth about 1 wave) |
| | `waves.hpLateGrowth` | 1.03 -> 1.0 | the extra late growth made late meta nearly pointless (late reached 14 against 11 fresh) |
| | `boss.loopHpMult` | 2.6 -> 5 | at 2.6 the second Goblin King (wave 20) killed 0% of late runs; now 9% and it costs 30% of the castle |
| `towers.ts` | cannon `damage` | 34 -> 31 | 149% of the average per slot, carries the start trio |
| | sniper `damage` | 55 -> 48 | 132-226% (always firing at 560 range, merges well in a 4-pool) |
| | magic `damage` | 14 -> 12.5 | 183-228% per slot in loadouts of four |
| | frost `damage` | 6 -> 8 | 17% per slot; the slow stays its job |
| | lightning `damage` | 13 -> 18 | 73% per slot and the one tower that hurt every loadout it joined (-1.3 waves) |
| | poison `fireRate` | 1.0 -> 1.5 | 62% per slot: stacks need shots (changing `poisonDpsPerStack` instead also boosted Venom Barrage to +2.6) |
| `enemies.ts` | all `speed` | x1.15 (goblin 80 -> 92, rat 150 -> 172, skeleton 74 -> 85, bat 112 -> 129, orc 66 -> 76, shaman 68 -> 78, summoner 66 -> 76, troll 54 -> 62, stoneling 88 -> 101, imp 135 -> 155) | waves 1-5 took 30 s each with nothing happening; shortens a fresh run by ~0.6 min |
| | troll `castleDamage` | 20 -> 15 | a single leaked troll was 20% of the castle; troll wave 11 was the cliff |
| `bosses.ts` | goblinKing `hp` / `speed` | 1100 -> 1900 / 72 -> 83 | boss wave 5 killed nobody and cost the castle 9% |
| | stoneGolem `hp` / `speed` | 3600 -> 7500 / 56 -> 64 | 0% deaths in every meta |
| | dragon `hp` / `speed` | 5600 -> 15000 / 48 -> 55 | before, only the few runs that survived the wave 11-12 cliff met it, and it killed 100% (mid) / 65% (late) of them; now mid meets it at 23-40% death and late beats it |
| `meta.ts` | `metaDamage.valuePerLevel` | 0.04 -> 0.09 | late meta (~5000 gems) now has +54% damage and +42% attack speed; on the old curve doubling the numbers moved late meta by only 1.5 waves |
| | `metaFireRate.valuePerLevel` | 0.03 -> 0.07 | same |
| | `metaExtraSlot.baseCost` | 350 -> 200 | the cheapest-first player never reached the slot cards (late: 4 slots) |
| | `metaStartLevel.baseCost` | 300 -> 200 | same |
| `synergies.ts` | shatter | +50% -> +80% | weak (descriptions updated) |
| | napalm | 8 -> 14 dps | weak |
| | arcaneStorm | 20% -> 30% chain chance | weak |
| | cryoRounds | 20% -> 30% freeze | weak |
| | tripleThreat | +15% speed, +10% damage -> +10%, +7% | active in 90% of runs; it made the start trio 1.4 waves better than any loadout of unlocked towers |
| `upgrades.ts` | castleRegen | 1 -> 0.5 HP/s per stack | common worth +2.0 waves |
| | archmagesLegacy | +50% power, -30% cooldown -> +35%, -20% | legendary worth +3.3 waves |
| `events.ts` | chest coins | 120 -> 180 | dominated by the free tower and slot options |
| | elite vanguard coins | x1.5 -> x2, x2 -> x3 | cost 0.4 waves, paid in coins that cannot be spent |

Not changed on purpose: arrow (96% per slot now, and its damage is hard-coded in ~30 flag tests), `poisonDpsPerStack`,
castle hp meta, buy weights, economy prices, level multipliers, `escortBudgetFraction`. `src/sim` was not touched.

Tests changed because they encode numbers I changed (and nothing else): `tests/content/content.test.ts`
(meta caps: damagePct 0.04 -> 0.09, fireRatePct 0.03 -> 0.07), `tests/menus/logic.test.ts` (four assertions on the damage
meta card: 12% -> 27% at level 3, 28% -> 63% at level 7, "+4%" -> "+9%"), `tests/sim/bot.test.ts`
(only the timeouts of the three 8-seed tests: they ran 4-5 s against the 5 s default and failed on a loaded machine
before any change). New: `tests/balance/*.test.ts` (regression incl. legal loadouts and the "unlocking is not a trap"
guard, economy, towers and bosses, the tools).

## 5. For others

1. Done by the loadout (3.1): pool dilution. It also fixes the offer pool: `src/sim/offers.ts` counts `towerPool` as
   "on the board" for `requires.anyTower`, which now means the loadout.
2. Tooltips: `estimateDps` assumes steady-state poison stacks; poison L1 shows ~50% more dps than arrow but realizes
   81% of the average per slot. Show per-hit damage or damage over time instead.
3. Pacing: a wave takes ~28 s because the path is 2615 px; mid and late runs are 8-10 minutes. A fast-forward or
   faster base speeds would shorten them (every +10% enemy speed costs about one wave on a fresh save).
4. The loadout UI should say that cannon cannot hit flyers and that lightning is the weakest pick; three of the five
   worst loadouts at mid meta contain both.
5. `tests/sim/bot.test.ts` is the slowest test (about 8 s); the balance guards add about 25 s.
6. A real first run has two abilities (meteor, repair): about one wave less than the fresh numbers above.


## 6. Reproducing the "before" numbers (old data, old pools)

```
npm run sim -- --runs 40 --pool full --set "balance.waves.hpScale=2,balance.waves.hpGrowth=1.3,balance.waves.hpLateGrowth=1.03,towers.cannon.damage=34,towers.frost.damage=6,towers.lightning.damage=13,towers.poison.fireRate=1,towers.sniper.damage=55,enemies.goblin.speed=80,enemies.rat.speed=150,enemies.skeleton.speed=74,enemies.bat.speed=112,enemies.orc.speed=66,enemies.shaman.speed=68,enemies.summoner.speed=66,enemies.troll.speed=54,enemies.stoneling.speed=88,enemies.imp.speed=135,enemies.troll.castleDamage=20,bosses.goblinKing.hp=1100,bosses.goblinKing.speed=72,bosses.stoneGolem.hp=3600,bosses.stoneGolem.speed=56,bosses.dragon.hp=5600,bosses.dragon.speed=48,meta.metaDamage.valuePerLevel=0.04,meta.metaFireRate.valuePerLevel=0.03,meta.metaExtraSlot.baseCost=350,meta.metaStartLevel.baseCost=300,synergies.shatter.effects.0.value=0.5,synergies.napalm.effects.0.value=8,synergies.arcaneStorm.effects.0.value=0.2,synergies.cryoRounds.effects.0.value=0.2,upgrades.castleRegen.effects.0.value=1,upgrades.archmagesLegacy.effects.0.value=0.5,upgrades.archmagesLegacy.effects.1.value=-0.3,events.elite.options.accept.waveModifier.coinMult=1.5,events.elite.options.hunt.waveModifier.coinMult=2,events.chest.options.coins.effects.0.value=120,balance.boss.loopHpMult=2.6,towers.magic.damage=14,synergies.tripleThreat.effects.0.value=0.15,synergies.tripleThreat.effects.1.value=0.1"
```

## 7. Performance and packaging

`npm run perf` (headless, `node --expose-gc`): 150 enemies alive, 12 level 5 towers (all eight types) with 27 flags
(every proc, status, spread and chain), projectiles active 220 of 320, renderer-style drain of the events every
frame. Measured twice, because the first seconds are dominated by JIT warm-up and pool growth (the sim was
refactored for fewer allocations after the first numbers; these are from the refactored code):

| Phase | update(1/60) avg / p95 / p99 / max | garbage per update avg / p95 / max |
|---|---|---|
| cold start, first 180 frames | 0.51 / 1.1 / 4.7 / 14.0 ms | 144 / 327 / 351 KiB |
| steady state, after 3000 warm-up frames (1800 measured) | **0.18 / 0.49 / 0.76 / 2.0 ms** | **3.1 / 5.7 / 7.4 KiB** |

About 60 events are drained per frame. A frame has 16.7 ms: the worst steady-state update uses 12%. At steady state
the sim produces about 0.2 MB/s of garbage at 60 fps; the cold-start garbage is a one-off during the first
second of a heavy wave. A complete late-meta bot run (8.5 simulated minutes) takes 0.35 s. `--warmup N` and
`--frames N` change the phases.

`npm run package` builds, validates `dist/` against `docs/PLAYABLES.md` and writes
`release/tower-merge-playables.zip` (165 files, 1.38 MiB, initial bundle about 1.39 MiB compressed, index.html at the
zip root, verified with `unzip -t`). It fails with a message for: missing or late Playables SDK tag, extra HTML pages,
absolute or external paths in html/css/code (including CDN fonts and scripts), referenced files that are not in
`dist/`, file names outside `[A-Za-z0-9_.-]`, more than 8000 files, a file of 30 MiB or more, an initial bundle of
30 MiB or more. Warnings (the package is still written): files over 512 KiB (the Phaser chunk, 1.41 MiB), library
URLs inside Phaser (credits, not requests), one `new Function()` in the Phaser chunk, source maps. Run the Playables
bundle analyzer on the Phaser chunk before submitting (see PLAYABLES.md).
