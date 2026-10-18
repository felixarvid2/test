# Tiny Dungeon – balance

All tunable numbers live in `src/config/balance.ts`; content lives in `src/data/*`. The headless
simulation (`src/core/sim.ts`, CLI `tools/simulate.ts`) uses the same rules code and data as the game and
is how those numbers were tuned.

```
npm run sim -- --runs 2000 --skill average --meta none        # fresh average player
npm run sim -- --runs 2000 --skill expert  --meta max         # fully upgraded expert
# options: --skill novice|average|expert  --meta none|mid|max  --strategy mixed|random|greedy|synergy
#          --hero all|knight|ranger|mage  --seed N  --ablation N (seeds per hero, 0 = skip)  --progression N
#          --over 2.5  --under 0.2  (impact flag thresholds)
```

A 2000-run report takes ~6 s; the paired upgrade/synergy ablations dominate the time (~40 s at the
default 60 seeds per hero, `--ablation 0` skips them).

## Targets

| Target | Result (this build) |
|---|---|
| Fresh player (novice, no permanent upgrades) reaches room ~5-8 in a 2-5 min first run | mean room 7.4, 2.9 min; average skill mean 8.5, 3.3 min |
| First boss is a real check, not a wall | Giant Slime first-fight win rate 46% (novice) / 56% (average) |
| Fresh players often die at the first or second boss | 45% of average/none runs end in room 5, 34% in room 10 |
| Meaningful power growth within minutes | a half-bought shop (`mid`) takes a novice from mean room 7.4 to 11.4; inside a run each pick/level-up is a visible step (Double Strike alone is worth ~3 rooms at the start) |
| Fully upgraded skilled player reaches 20-30+ | expert/max: median 25, mean 27, p90 40 (average/max: mean 20) |
| No boss is a wall | lowest first-fight win rate with no permanent upgrades is 10-17% (Dragon, only ~10% of runs get there); >= 31% once the shop is half bought |
| No single upgrade dominates | see "Upgrades" below; only Infinite Blades is flagged (legendary, Knight-only) |
| Whole shop takes dozens of runs | median 36 runs (average), 47 (novice), 19 (expert) |

## Results (3000 runs each, mixed pick strategies, all three heroes)

Room reached = the room the run ended in (rooms cleared + 1). The distribution is lumpy because the bosses in
rooms 5/10/15 gate it, so look at the mean as well as the median.

| skill | meta | mean room | median | p90 | minutes | gold/run | Slime (5) | King (10) | Dragon (15) |
|---|---|---|---|---|---|---|---|---|---|
| novice | none | 7.4 | 5 | 10 | 2.9 | 98 | 46% | 15% | 10% |
| novice | mid | 11.4 | 10 | 15 | 4.3 | 267 | 81% | 40% | 31% |
| novice | max | 17.4 | 15 | 25 | 6.4 | 627 | 96% | 71% | 62% |
| average | none | 8.5 | 9 | 15 | 3.3 | 130 | 56% | 28% | 17% |
| average | mid | 13.6 | 10 | 25 | 5.3 | 380 | 86% | 54% | 50% |
| average | max | 20.3 | 22 | 30 | 7.6 | 831 | 97% | 80% | 78% |
| expert | none | 12.2 | 10 | 25 | 5.0 | 279 | 71% | 55% | 61% |
| expert | mid | 19.9 | 20 | 30 | 8.0 | 779 | 92% | 77% | 85% |
| expert | max | 27.3 | 25 | 40 | 10.5 | 1454 | 98% | 93% | 96% |

(Boss columns: win rate of the first fight against that boss among runs that reached it; `mid` = half of every
level, bow unlocked; `max` = everything bought.)

Per hero, average/none: Knight mean 10.1, Ranger 7.5, Mage 7.8. Expert/max: Knight 25.4, Ranger 31.2, Mage 25.2.

Boss loops (rooms 20/25/30/35...) are tuned so the cycle gets harder with depth (`bossLoopHp`, `bossLoopDmg`
plus the exponential room scaling): with max meta and expert skill the Slime loops win 91% (room 20) / 82% (35),
King 65% (25) / 57% (40) and Dragon 41% (30).

Economy (average skill, `none` start): a first run pays ~60-100 gold (room 5-6), enough for the first
Vitality / Might levels. Buying the whole shop (17,318 gold: all permanent upgrades plus Ranger 400 and Mage 900)
takes a median of 36 runs for an average player (novice 47, expert 19) when always buying the cheapest
affordable item.

## Upgrades

Two views are printed. *owned / rooms* is observational (mean room of runs that ended with the card minus
the rest) and is confounded: longer runs own more cards. *impact* is a paired ablation: the same seed is
played twice, once with the card forced as the first pick and once with no first pick, so only that card
differs. Weapon-specific cards are only measured on heroes that can be offered them.

Mean impact in rooms (average/none, 100 seeds per hero): common +0.7, rare +2.0, epic +1.8, legendary +3.3. The
ordering is as intended (rarer = stronger) except that epics are slightly weaker than rares in the first-pick
test; epics usually arrive later (room >= 4) where their ability multipliers have more to work with.

Strongest: Infinite Blades +5.7 (legendary; flagged, it is Knight-only and ~1.7x sword DPS), Meteor Storm +4.3,
Take the Sword +3.4, Double Strike +3.2, Thunderstorm +2.9, Extra Arrow +2.8, Blade Orbit +2.7, Multishot +2.7.
Best commons: Focus Crystal +1.7, Honed Steel +1.7, Quick Hands +1.4, Sharp Blade +1.3.
Weakest: Long Reach (+0.0), Regeneration (+0.2), Swift Boots, Nimble, Iron Skin, Lucky Clover, Scholar (+0.3 to +0.4).
Greed and Magnet have no combat value in the model (they are economy cards and are reported as such).

Synergies (paired, forced picks, synergy bonus on vs. off): Armageddon +3.0, Tempest +2.0, Frozen Fortress +1.5,
Shatter +1.6, Bloodlust +1.4, Arrow Storm +1.3, Glass Storm +1.3, Inferno Burst +1.2, Wildfire +1.2, Soul Reaper +1.2,
Chaos Theory +1.0, Venomous Flames +0.8, Iron Wall +0.4, Plague Bomb 0.0, Storm Crit 0.0. The evolutions
(Armageddon, Tempest, Frozen Fortress) are the strongest, as designed. Plague Bomb and Storm Crit show nothing
because poison spread and chain crits are only coarsely modelled; they are candidates for a bump after real
play-testing. Runs complete 1.2-1.5 synergies in the first-run setting (`none`) and ~7 at max meta with expert play.

## Mechanics and numbers worth knowing

* Stats: `(base + sum add) * (1 + sum pct) * product mul`, then clamped to `BALANCE.caps` (flags cap at 1).
  Level-ups add +3% damage and +4 max HP each and heal 10%; clearing a room heals 10% max HP.
* Weapon level = 1 + levels of upgrades requiring that weapon (+6% weapon damage per level). Weapons picked up
  later deal 55% damage (`extraWeaponDamage`), so a second weapon is a real but not doubling pick.
* Double Strike repeats attacks at 45% damage per repeat.
* Rarity weights 60/28/10/2, shifted by `exp(luck * [0, .5, 1.2, 2])`; rare from room 2, epic from room 4,
  legendary from room 7. Hero-favoured tags x1.6, cards that advance a synergy x1.4.
* Room scaling (hp, damage) is `(1 + a*i') * g^i'` with `i' = room - 1`, so it is smooth (no step between rooms)
  and exponential in the tail, the soft wall of endless mode. Spawn budget is `14 + 3*i' + 0.02*i'^2`, capped at
  50 enemies per room by `enemyCountHardCap` (limits.maxEnemiesAlive is 60).
* Bosses repeat every 15 rooms (5 Slime, 10 King, 15 Dragon, 20 Slime...) with +50% HP and +20% damage per
  completed cycle on top of the room scaling.
* Anti-runaway guards live in `BALANCE.limits` (chain jumps per hit 6, explosions per frame 6, thunder strikes
  per pulse 8, pooled projectiles/particles/damage numbers) and are used by the combat helpers in
  `src/core/combat.ts`; chains and explosions never trigger further chains or explosions.

## How the simulation models a room

Every step is 0.4 s. The room's spawn list becomes *cohorts* (a group of identical enemies with a fractional
alive count, one HP pool, an arrival time from spawn distance and speed, and slows/freezes from the build).

1. **Damage dealt.** For each owned weapon: strikes per second (cooldown / attack speed, repeats at their reduced
   damage), average hit (crit, Shatter), and how many enemies one strike hits (sword: 1.8 at 110 degrees,
   scaled by arc, area and range; bow: extra arrows at 45% effectiveness and piercing at 45% per pierce; staff:
   bounces at 75%), capped by what is in reach. A weapon only damages cohorts that have come within its range.
   Damage is spread over reachable cohorts by head count (bosses count double), minus armor per hit.
2. **Status effects and abilities.** Burn (stacks from hit rate x chance x duration, capped by max stacks),
   poison (coverage, spread), chain (jumps x chance x damage), Chaos Engine (average proc), Thunder and
   Meteor (pulses at their interval), Orbit blades (touches per blade on engaged enemies), explosions on kills
   (one pass per step, burning enemies always explode with Inferno Burst), Life on kill, regeneration.
3. **Incoming damage.** Engaged enemies (arrived) make attack attempts (touching 1/s, lunge/ranged by cooldown);
   at most 8 can touch the hero. The skill factor removes a share of attempts (novice 25%, average 45%, expert 65%;
   +4 points for ranged builds, up to +20 points from move speed). The rest is limited by invulnerability time
   (`hits/s = A / (1 + A * invuln)`), sampled with a Poisson draw, and applied with the real `damagePlayer`
   (armor, minimum damage, dodge, phoenix).
4. **Bosses.** Attack events at `attackDelay / speedMult` pick from the phase's attack list; each hit lands with
   probability `1 - bossAvoid` (novice 30%, average 45%, expert 70% avoided), summon attacks add cohorts. Phase
   follows the remaining HP fraction.
5. **Rewards.** XP, gold and kills are credited from the cohorts that shrank this step, using the real `addXp`,
   `addGold`, `registerKill`; level-ups recompute stats mid-room.
6. **Run loop.** Door choice and upgrade picks follow a strategy: *random*, *greedy* (highest rarity) or
   *synergy* (rarity + synergy progress + hero tags + smart potion use). `mixed` cycles through the three, so
   the headline numbers average a careless and a thoughtful player.

## Known limitations of the model

* No positioning: kiting, corner-camping and boss telegraph dodging are collapsed into the skill factors, which
  are plausible guesses, not measurements. Treat absolute room numbers as relative; check them in the real game.
* Fluid kills: enemies die by pool depletion with perfect focus and no overkill waste inside a cohort, so
  burst-heavy builds are slightly favoured, and tiny cohorts linger as full-speed single-target fights.
* Normal rooms almost never kill a build that beat the previous boss (deaths cluster on boss rooms). Real
  swarm pressure (ranged enemies hiding behind tanks, clumping) is stronger than modelled; if the game feels
  too easy between bosses raise `difficulty.budgetLinear` or `hpGrowth` before touching bosses.
* Knockback, projectile speed, pickup radius and area are only crudely valued (`knockbackBenefit`,
  `sqrt(area)`), so Heavy Hitter, Long Reach and Magnet read as weak.
* Economy cards (Greed, Magnet, Scholar) have no survival value in the model; Scholar is partly credited through
  faster levels.
* Enemy variants (Ghost, Spider, Fire Slime, Ogre) are simulated, but their special movement (phasing) is
  approximated by the erratic speed factor.
* Pick strategies are heuristics; a human who builds around a synergy early will beat the `synergy` strategy.
* The paired impact test measures a card as the first pick (room 1-2); epics and legendaries normally arrive
  much later when the power curve is steeper, so their absolute numbers are inflated relative to normal play.

## Open concerns for play-testing

1. **Ranger scales better than the others at the top** (expert/max 31 vs 25): bow count and pierce multiply.
   If it shows in play, reduce `caps.max.pierce` / `extraProjectiles` before nerfing single cards.
2. **Mage is the weakest start** (needs elemental cards; 7.8 vs Knight 10.1 with no meta). Raise
   `elementPower` or the Arcane Affinity chances if it feels bad.
3. **Dragon is a wall for fresh players** (10-17% win with no meta) but only ~10% of fresh runs get there.
4. **Infinite Blades and Meteor Storm** are the top-end legendaries; Soul Harvest and Chaos Engine are weaker.
5. Economy: if players buy everything too fast raise `meta.ts` costs, not `enemyGoldScale` (which also changes
   the first run).
