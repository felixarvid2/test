# ASHFALL - Design spec for the Thor Survivors overhaul

Status: proposal. VS data (REA) stays the balance base. HoT (Halls of Torment) supplies structure: a main weapon with trait branches, equipment, champions, status effects, enemy archetypes. All numbers are starting values to be tuned with `thor-survivors-balance`. "P" means weapon power units as in game_data.json (power 1 = the VS Whip level-1 hit). "Z" means one ZOMBIE (hp 1, speed 100, power 10, xp 1).

## 1. Pillars, tone, name

Name: **ASHFALL: Lumen Tide** (alternatives: "Ashfall: Last Shift", "Ashfall Survivors").

Pillars
1. **The dark is the enemy.** You see a pool of light around you and the lit things in it. Spore blooms and fires are the places you can see from. This is the 30 s loop: move through the dark toward light, pull enemies into the lit area, pick up gems that glow.
2. **One hand aims, one hand builds.** The stick-aimed main weapon keeps the thumbs busy every second. Auto weapons and passives (the VS layer) make the 5-10 min loop: level-ups, chests, evolutions.
3. **Elites pay in steel.** Champions drop equipment. This gives a second run-long goal next to evolutions and does not replace them.

Tone: dark industrial sci-fi mining colony. Wet steel, soot, orange furnace light, and cold green-cyan lumen that is beautiful and wrong. No jokes in names or text. Enemy names are job titles (Colonist, Sergeant, Welder) because the people are still in there.

Palette (hex)
- Ground: #14110f, #1f1b17, rust #5a3a22.
- Light: furnace orange #ff8a2a, hot white #fff1d0.
- Lumen: #39ff88 (infection), #1bd6c8 (crystal).
- Danger: enemy projectiles and telegraphs are red-orange #ff3b1f with a black outline.
- Player projectiles: white-cyan #d8fff8.

## 2. Heroes

Choose the hero on the starter screen (replaces nothing; the starter weapon pick stays for the VS auto weapon slot). Hero base stats come from HoT `karaktarer_oversikt` ratios (Inquisitor: 500 HP, 4.5 m/s, 1.0 regen/s) scaled to VS (player HP about 100). VS stat semantics are unchanged.

| Hero | Role | HP | Armor | Regen/s | Move | Crit | Per level-up (HoT "each level up") | Starts with |
|---|---|---|---|---|---|---|---|---|
| Bastion | Tank-melee | 130 | 1 | 0.4 | 0.92 | 5% | +1% might, +1% max HP | Hydraulic Hammer |
| Spectre | Glass cannon, kiter | 80 | 0 | 0 | 1.10 | 15% (x2.0) | +1% crit chance, +0.5% move speed | Twin Pistols |
| Xenomant | Caster, controller | 95 | 0 | 0.2 | 1.00 | 5% | +1% area, +1% pickup range | Lumen Caster |

Aiming. The right stick aims the main weapon. With no right-stick input it uses the last move direction (facing). The main weapon fires automatically at its interval toward the aim direction: no fire button, so thumbs stay on the sticks. Single-screen overlay: the touch joystick sets facing only. A = dodge, B = unused in game (menu back only).
Dodge: 0.25 s of invulnerability and a 90-unit dash, 4 s cooldown. Risk: it becomes a "kite forever" tool. Cap it at 1 charge, cooldown scaled by the Cooldown stat, and test with the headless stand-still and kite bots.

### 2.1 Main weapons (always owned, no slot used, level with the hero)

The main weapon uses the VS stat pipeline (might, area, cooldown, amount, crit) so existing passives work on it.

| Hero | Main weapon | Base behaviour | Numbers (level 1) |
|---|---|---|---|
| Bastion | **Hydraulic Hammer** | Cone swing in the aim direction. Every 3rd swing is a Slam (circle around the hero, 0.4 s stun). | 1.6P, interval 1100 ms, cone 100 deg, radius 80, knockback 2.0; Slam 2.4P, radius 90, stun 0.4 s |
| Spectre | **Twin Pistols** | Volley of 3 bullets with a small spread in the aim direction. | 0.6P per bullet, interval 900 ms, 3 bullets, spread 8 deg, speed 520, range 360, pierce 0, crit 15% x2 |
| Xenomant | **Lumen Caster** | A slow lumen bolt in the aim direction that pierces 2 enemies and applies Decay. Every 4th cast is a Spore Burst (ring of 6 smaller bolts). | 1.2P, interval 1000 ms, speed 380, pierce 2, Decay 1 stack per hit; Burst 6 x 0.5P |

### 2.2 Branches (HoT-trait style)

Each hero has 4 branches with 3 tiers (I, II, III). A branch card appears as the 4th card on levels that are a multiple of 5 (see section 8): tier I at hero level 5+, tier II at 15+, tier III at 25+. A run reaches level 25-35 in 30 min, so at most 6 branch picks: you can finish two branches, or spread across more. Tiers of one branch must be taken in order.

**Bastion**
| Branch | I | II | III |
|---|---|---|---|
| Seismic (slam focus) | Slam every 2nd swing | Slam also fires a 200-unit shock line, 1.0P | Slam radius +40%, stun 0.8 s |
| Piston Jab (thrust) | Third swing becomes a narrow thrust: 25 deg, range 130, pierce all, 2.5P | Thrust crit chance +25% | Thrust leaves 3 s Decay |
| Furnace Cleave (fire) | Arc 160 deg, applies Burn | Burn stacks +1 per hit | Cleave releases a 60-unit fire wave on every swing |
| Riot Guard (defensive) | -15% damage taken for 1 s after a swing | Swing reflects projectiles that cross the cone | Slam kills heal 1 HP each (max 5/s) |

**Spectre**
| Branch | I | II | III |
|---|---|---|---|
| Pistol Barrage | 5 bullets per volley, spread 16 deg | Interval -20% | Every 3rd volley is a full 360 deg ring of 8 |
| Piercing Shot | Replaces the volley with 1 heavy slug: 3.0P, pierce all, interval 1500 ms | Crit x3.0 | Slug explodes at range end (radius 50, 1.5P) |
| Quick Shot | Interval -25%, 2 bullets | Crit chance +15% | Each crit refunds 0.2 s of cooldown |
| Cluster Grenade | Every 4th volley throws a grenade (throw clip) lobbed to 220 units, radius 70, 2.0P | Grenade splits into 3 bomblets | Grenade applies Burn and leaves a 3 s fire patch |

**Xenomant**
| Branch | I | II | III |
|---|---|---|---|
| Spore Dart | +2 homing mini-darts per cast, 0.3P each | Darts pierce 1 | Darts apply Decay |
| Grasping Tendrils | Every 4th cast is a slam at the aim point (max 200 away): roots in radius 70 for 1.0 s, 1.0P | Radius 100, roots 1.5 s | Tendrils pull enemies in (pull 60 units) |
| Parasite Link | Bolt links two enemies for 3 s, damage is shared, 0.5P/s | Link heals the hero 2% of damage dealt | Link jumps to a new target when one dies |
| Wrath of Lumen | Cast becomes a 0.6 s beam (length 260), 0.8P per 0.15 s tick | Beam width +50%, pierce all | Beam leaves lumen ground for 2 s (Decay) |

### 2.3 Animation clip mapping

| Hero | Clip | Use |
|---|---|---|
| all | idle | standing still (4 frames) |
| all | run | moving (6 frames), speed scaled with move speed |
| all | hit | 1 frame flash on damage |
| all | death | game over |
| all | dodge | dodge dash |
| Bastion | attack / attack2 | alternating swings 1 and 2 |
| Bastion | slam | the slam swing |
| Bastion | leap | Riot Guard III and dodge variant: leap-dodge lands with a small 50-unit shock (0 damage in the base game, 1.0P with Seismic II) |
| Bastion | cast | level-up pose and chest-open pose |
| Spectre | shoot | each volley |
| Spectre | throw | Cluster Grenade, and the Piercing Shot slug |
| Spectre | attack (melee) | unused |
| Xenomant | cast | normal bolt |
| Xenomant | cast2 | Spore Burst and Wrath of Lumen beam |
| Xenomant | slam | Grasping Tendrils |

Not used: Spectre `attack`, Xenomant `attack`. Those clips can be dropped from the bake to save memory.

## 3. Auto weapons (VS layer, 6 slots, same behaviours)

Keep game_data.json ids, rows and balance. Only display names, descriptions and art change, via the overlay in section 13. Evolution pairs are unchanged from the data.

| VS id | Ashfall name | Behaviour (unchanged) | Art | Evolution (needs) | Evolved art |
|---|---|---|---|---|---|
| WHIP | Vibro Lash | horizontal slash, pierces | slash_0/1 | VAMPIRICA **Leech Scythe** (+MAXHEALTH Bio-Gel Pack): heals | slash_1 tinted red, blood_burst |
| MAGIC_MISSILE | Spore Dart | nearest enemy | plasma_bolt_0 green | HOLY_MISSILE **Lumen Volley** (+COOLDOWN Overclock Chip) | energy_glow_0 trail |
| KNIFE | Scalpel Throw | facing direction, fast | scalpel_blade icon art, hit_spark_0 | THOUSAND **Scalpel Storm** (+SPEED Rail Accelerator) | same x6, hit_spark_1 |
| AXE | Cluster Grenade* | lob arc, passes through | skill_cluster_grenade, explosion_0 small | SCYTHE **Shrapnel Spiral** (+AREA Wide-Beam Lens) | rock_debris, scorch_0 |
| CROSS | Ricochet Drone | boomerang | security_drone 2D sprite | HEAVENSWORD **Strike Wing** (+LUCK Lumen Charm) | blink_0 trail |
| HOLYBOOK | Ward Drones | orbit | hex_shield_0, wisp_0 | VESPERS **Sentinel Ring** (+DURATION Stabilizer Coil) | energy_ring |
| FIREBALL | Slag Cannon | fireball, area | flame_0..3, fire_core_0 | HELLFIRE **Furnace Burst** (+POWER Servo Amplifier) | explosion_1/2 |
| GARLIC | Toxic Vent | damaging aura | spore_cloud_0..2 | VORTEX **Lumen Devourer** (+REGEN Medi-Foam) | heal_0, spores_0 |
| HOLYWATER | Corrosive Flask | thrown, damaging pools | toxic_splat_0, puddle decal | BORA **Corrosive Wake** (+MAGNET Gravity Collar) | toxic_splat_0 big |
| LIGHTNING | Arc Coil | strikes random enemies | lightning_0/1, arc_0..2 | LOOP **Tesla Loop** (+AMOUNT Multiplexer) | electric_ball |

*Name conflict: Spectre's branch is also called Cluster Grenade. Rename the branch "Frag Volley" in the UI to keep them apart.

### 3.1 New auto weapons (HoT-inspired; 4 new ids, 8 levels each)

Level rows follow the VS delta format (row 0 full stats, later rows deltas). Rarity 80. No evolution in the first release; each gets one in a later pass (suggested pairs in the table).

| id | Name | Behaviour | Level 1 | Per level (L2-L8) | Art | Status | Evolution idea |
|---|---|---|---|---|---|---|---|
| CHAINARC | Chain Arc | HoT chain lightning. Strikes the nearest enemy, then jumps to the nearest un-hit enemy within 120 units, 4 jumps; damage x0.85 per jump | 1.0P, interval 2200 ms, 4 jumps | +1 jump at L3/L5/L7, +0.5P at L2/L4/L6/L8, interval -150 ms at L4 and L8 | lightning_1, hit_spark_1 | Electrify | +AREA: Storm Net |
| KUGEL | Kugelblitz | HoT orbs. 2 slow orbs drift from the hero toward random directions (speed 60), live 6 s, each zaps the nearest enemy within 90 units every 0.5 s for 0.5P | amount 2, 0.5P | amount +1 at L3/L5/L7, power +0.15P each level, duration +0.5 s at L4/L6 | electric_ball, energy_glow_1 | Electrify | +DURATION: Ball Lightning Storm |
| ORBITAL | Orbital Strike | HoT meteor/strike. Marks the densest cluster in view (warn_ring_0, 0.8 s), then drops a blast of radius 70, 4.0P, with burning ground for 2 s | interval 6000 ms, 4.0P | radius +10 at L2/L4/L6/L8, strikes +1 at L3/L6, power +1P at L5/L8 | warn_ring_0, explosion_2/3, scorch decal | Burn | +POWER: Orbital Barrage |
| NOVA | Coolant Flush | HoT frost nova. Ring burst around the hero, radius 110, 1.5P, slows 40% for 2 s | interval 5000 ms | radius +15 at L2/L4/L6/L8, slow up to 60%, 1P more at L5 | frost_burst_0/1, frost_ground_0 | Frost | +COOLDOWN: Cryo Cascade |

Weapon pool total: 14 base weapons plus main weapon. Passives are unchanged.

### 3.2 Passives (stat semantics unchanged)

| id | Ashfall name | Stat |
|---|---|---|
| POWER | Servo Amplifier | might |
| ARMOR | Plate Weave | armor |
| MAXHEALTH | Bio-Gel Pack | max HP |
| REGEN | Medi-Foam | regen |
| COOLDOWN | Overclock Chip | cooldown |
| AREA | Wide-Beam Lens | area |
| SPEED | Rail Accelerator | projectile speed |
| DURATION | Stabilizer Coil | duration |
| AMOUNT | Multiplexer | amount |
| MOVESPEED | Mag Boots | move speed |
| MAGNET | Gravity Collar | pickup range |
| LUCK | Lumen Charm | luck |
| GROWTH | Neural Tap | XP gain |
| GREED | Salvage License | gold |
| CURSE | Spore Taint | enemy speed/HP/quantity up |
| REVIVAL | Defibrillator | revive |

New passive: **LIGHT** "Headlamp Array": +12% light radius per level, 5 levels. Rarity 60. It makes the dark pillar a build choice. Risk: if it is always best, lower to +8% per level; test by comparing deaths per minute in the dark stage. Total 14 passives plus Luck. (README says 13 today; LIGHT makes 14 visible in offers.)

## 4. Enemy roster

Archetype parameters come from HoT `fiende_ai.csv` (distances are HoT internal units, copied 1:1 and clamped so ranged enemies stay inside the view half-height of 280). Enemy ids below are new keys in the Ashfall overlay.

| Enemy (model) | Archetype | HP (Z) | Speed | Power | XP | Clips | Special parameters |
|---|---|---|---|---|---|---|---|
| Infected Colonist (infected_colonist) | Chaser | 1.0 | 100 | 10 | 1 | walk, attack (on contact), hit, death | none. The filler. Reference ZOMBIE. |
| Spore Hound (spore_hound, unrigged) | Fast chaser, packs | 0.5 | 160 | 6 | 1 | procedural bob and squash (no clips) | spawns in groups of 4; LateralMonsterInput: weaves with phases 1-2 clockwise, 3-5 counter, factor 0.8 |
| Sergeant (sergeant) | Ranged kiter | 1.5 | 90 | 8 contact, 12 shot | 2 | walk, attack2 (shot), attack (melee if cornered), hit, death | HoT MonsterRanged: stop at 132, back off under 100 at x0.7, pause 0.5 s after shot; shoots a 3-round burst every 3.0 s, bullet speed 240, damage 12 |
| Security Drone (security_drone, unrigged) | Ranged flier | 0.7 | 120 | 5 contact, 8 shot | 2 | procedural hover bob | ignores obstacles; stop at 150, back off at 120 (HoT Imp: 150/120, x0.8); one bolt every 2.2 s, speed 280 |
| Welder (welder) | Charger / jumper | 3.0 | 110, run 300 | 16 | 4 | walk, run, attack, hit, death | HoT ImpHammer: acts at distance 80-160, every 2-6 s: 0.6 s telegraph (warn_ring_0 line), dash at 300 for 0.6 s, 1.0 s recovery (stunned if it hits a wall or barrel) |
| Spore Carrier (spore_carrier) | Exploder | 1.2 | 80 | 0 contact | 3 | walk, cast (burst), hit, death | explodes within 40 units or on death: cast clip, 90-unit cloud for 3 s, 4 dmg/s + Decay, also blasts nearby enemies; drops 0 extra |
| Smelter (smelter) | Tank | 8.0 | 70 | 20 | 8 | walk, attack, cast, hit, death | immune to knockback; every 8 s casts a slag pool at the hero position (radius 60, 3 s, 8 dmg/s, Burn) |
| Vire (vire) | Teleporter-summoner | 5.0 | 90 | 14 | 10 | walk, attack, cast, cast2, hit, death | HoT MonsterTeleporting: blinks to 125-200 from the hero (blink_0), 0.2 s tele, waits 0.75 s, attacks within 180, then 2.5-4 s stop; cast = raises 3 colonists; cast2 = lumen ring of 8 bolts (speed 220, 10 dmg) |

Stats relative to VS: colonist = ZOMBIE; hound = MUD (0.5 hp, 140); sergeant = SKELETON hp with a ranged attack; welder about 3 x MUDMAN2-class speed charger; smelter about 8 x ZOMBIE like the VS big mummies; XP follows VS ratios (1 xp per Z of HP, plus bonus for special enemies). Stage multipliers `EnemyHealthMultiplier` and `HP_x_Level` apply as in VS.

Obstacle note: pools of fixed size (`MAX_PROJ` 600) already cover enemy bullets; budget at most 40 simultaneous enemy projectiles. Cap ranged enemies at 24 alive; excess spawns as colonists.

### 4.1 Bosses (spawn through `bosses[]` in a wave row; each drops a treasure chest as in VS)

| Boss | Archetype | HP (Z) | Speed | Power | Pattern |
|---|---|---|---|---|---|
| Cargo Loader (cargo_loader, unrigged) | Charger tank | 400 | 70, charge 320 | 30 | Cycle by draw pool (HoT ValueDrawPool, bag [0,0,1,1]): A = telegraphed charge across the arena (1.0 s windup, line 60 wide, stun on hit); B = ground stomp, radius 120, 3 falling crates after it (warn rings). Interval 1.0-3.5 s. |
| Slagborn (slagborn, unrigged) | Tank, zone control | 700 | 60 | 35 | Leaves a slag trail (patch every 45 units, 4 s, 6 dmg/s, Burn); every 8 s lobs 3 slag bombs to the hero (HoT FlameEmitter-like: spread 2, 3 per phase, range 100-250); at 50% HP enrages x1.3 speed. |
| Lumen Tentacle (lumen_tentacle, unrigged) | Hazard (not killable at first; 150 Z when exposed) | 150 | 0 | 25 | Eight tentacles burst from the ground in radius 400 around the hero in waves of 3 (warn ring 0.8 s, then 1.2 s up); a tentacle that is killed drops a gem. Used as stage hazard at set minutes and as boss add. |
| Vire, awakened (vire) | Teleporting summoner boss | 600 | 100 | 20 | Uses its clips: blink + cast (raise 6 colonists) + cast2 (rotating 12-bolt ring); phases at 66% and 33% add 4 spore carriers. |
| Smelter, Foreman (smelter, scale 1.8) | Tank boss | 500 | 65 | 30 | Slag pool carpet (5 pools in a line towards the hero), pull-in at 25%. |
| The First (the_first, unrigged) | Final boss, Deep Mines minute 29 | 2500 | 80 | 40 | Three phases (HoT Lord pattern): 1) lumen ring + tentacle bursts around the hero; 2) tendril lanes that sweep, summon hounds; 3) screen-wide pulse every 6 s (half of the floor is safe, shown by warn rings), moves toward the hero. Killing it before 30:00 gives x2 end gold. Surviving to 30:00 still wins. |

Boss portrait on spawn: flux/bosses/the_first, vire, foreman_dray (Smelter), frozen_welder, brood_mother (Spore Carrier elite variants), commandant_hale, governor_kade. See section 11.

HP scale check: VS stage bosses are 5-30 times the stage HP multiplier. Ashfall values are in Z at wave time 0; scale with the stage multiplier like any enemy. Tune with `thor-survivors-balance` against the average DPS of a 25-minute build.

## 5. Elites and champions (HoT `champions.csv`)

HoT champion fields: BaseHealth 2500-10000, WorldHealthMultiplier 0.1-1.0, DamageMultiplier 0.2-1.5, ScaleMultiplier 0.5-3.0, MovementSpeedMultiplier 0.2-1.3, MinDifficulty 0-15, SpawnProbability 0.015-0.2, plus adds (4-20 per champion at higher difficulty) and rewards.

Ashfall rules
- Elites replace the "boss chest every few minutes" idea as a second chest source. Bosses still open the VS chest (evolutions).
- First elite at 3:00. Interval: HoT base 150 s, so one elite every 150 s minus 1% per minute of run time (down to 100 s). Max 1 alive. They spawn at 400 units from the hero.
- Roll: pick an enemy type that is in the current wave row, apply: HP x6, damage x1.5, scale x1.4, speed x0.9, XP x8.
- Modifiers: count = 1 up to 12:00, 2 after 12:00, 3 after 24:00. Pool (HoT champion abilities mapped):

| Modifier | Effect | HoT source | Visible marker |
|---|---|---|---|
| Firewalker | leaves fire patch every 45 units | ChampionFireWalker (distance 45, spread 9) | orange trail |
| Frostwalker | leaves frost patches (slow) | ChampionIceChaos (distance 45, spread 270) | cyan trail |
| Barrage | every 3 s fires 3 bullets in an 80 deg fan | ChampionRandomBullets | red pulses |
| Volcano | 3 lobbed bombs at 100-250 range | ChampionVulcanoAbility | warn rings |
| Raiser | raises 4 colonists each 10 s | RaiseSkeletons | dark green aura |
| Armored | armor +3, immune to knockback | HoT defense | grey outline |

- Marker: a pulsing outline in the modifier colour plus a 2-pixel ring on the floor (no extra draw layers; 2 draw calls). The bottom screen shows an "ELITE" tag with the modifier icons.
- Adds: HoT champion adds spawn 4 / 8 / 12 units of the elite's basic type. Use 6 colonists or hounds at spawn.
- Reward: kill = 1 equipment drop (see section 6) plus a gem pile worth 5 levels-worth of XP of its minute. Rarity roll: Common 60 / Uncommon 32 / Rare 8 at minute 3, shifting +1.2 points per minute from Common to Rare (HoT: SpawnProbabilityMin + difficulty x ChancePerDifficulty, capped). Luck adds to the Rare roll.
- Performance: elites are normal enemy slots with flags (`elite`, `mods`), no new pool.

## 6. Equipment (HoT slots: Head, Body, Gloves, Feet, Ring, Neck)

HoT rarities Common 0 / Uncommon 1 / Rare 2. Ashfall maps them onto the available FLUX rarity frames: Common = common.webp, Uncommon = magic.webp, Rare = rare.webp. Unique items (from bosses) use unique.webp. Legendary and mythic frames are kept for later.

Item values: base value V per rarity: Common 1.0, Uncommon 1.6, Rare 2.4. Effects below are the Common value; multiply by V.

| Slot | Item (icon) | Effect (Common) | Rare example |
|---|---|---|---|
| Head | Combat Helm (combat_helm) | armor +1 | +2.4 armor |
| Head | Headlamp (bio_focus) | light radius +10% | +24% |
| Head | Targeting Visor (combat_helm_2) | crit chance +4% | +9.6% |
| Body | Plated Vest (plated_vest) | max HP +10% | +24% |
| Body | Riot Shield (riot_shield) | damage taken -4% | -9.6% |
| Body | Injector Rig (injector_rig) | regen +0.2/s | +0.48/s |
| Gloves | Servo Gauntlets (servo_gauntlets) | might +5% | +12% |
| Gloves | Hydraulic Knuckles (hydraulic_knuckles) | main weapon damage +8% | +19% |
| Gloves | Trigger Gloves (re-use servo_gauntlets_2) | cooldown -4% | -9.6% |
| Feet | Mag Boots (mag_boots) | move speed +5% | +12% |
| Feet | Armored Greaves (armored_greaves) | armor +1, knockback taken -10% | +2.4 armor, -24% knockback |
| Feet | Quick Soles (mag_boots_2) | dodge cooldown -10% | -24% |
| Ring | Conduit Ring (conduit_ring) | Electrify chance on any hit 6% | 14% |
| Ring | Signet of Ash (conduit_ring_2) | Burn chance 6% | 14% |
| Ring | Frost Band (conduit_ring_3) | Frost chance 6% | 14% |
| Neck | Signal Pendant (signal_pendant) | pickup range +15% | +36% |
| Neck | Echo Relic (echo_relic) | XP gain +4% | +10% |
| Neck | Lumen Pendant (crystal_lumen) | luck +0.05 | +0.12 |

18 base items (3 per slot). Six uniques, dropped by named bosses only and always auto-equipped over a Common/Uncommon:

| Unique (icon) | Slot | Effect | Source |
|---|---|---|---|
| Crown of the Hive (unique_crown_of_the_hive) | Head | +1 amount to all auto weapons, enemies +5% speed | Vire |
| Ashen Heartwood (unique_ashen_heartwood) | Body | +25% max HP, Burn immunity | Slagborn |
| Fist of Kharos (unique_fist_of_kharos) | Gloves | main weapon +30% damage, +10% size | Cargo Loader |
| Ashwalker Treads (unique_ashwalker_treads) | Feet | +15% move speed, leaves no-damage ash trail that slows enemies 20% | Smelter Foreman |
| Heart of Lumen (unique_heart_of_lumen) | Neck | +1 revival, light radius +15% | The First |
| Seed of Accord (unique_seed_of_accord) | Ring | Spore Carrier clouds heal the hero instead | Tentacle (Hazard kill) |

Total 24 items. Not used: widowmaker, echo_holsters, governors_crucible, mother_of_spores (kept for a later weapon-specific tier).

How found and equipped
- Source: elites (section 5) and unique boss drops. Not in chests, so the VS chest loop (evolutions and upgrades) is unchanged.
- Drop appears as a pickup (a small crate with the rarity colour, `supply_chest` art). Picking it up never pauses on its own.
- If the slot is empty: auto-equip, a text toast on the top screen.
- If the slot is occupied and the new item has a higher total value: choice screen on the bottom display (pauses like a level-up): two cards "Keep" (old) and "Replace" (new) with stat difference lines. Gamepad: left/right, A to confirm, B = keep. Else salvage for gold (value x 5) with a toast and no pause.
- Equipment only lasts for the run. Gold from salvage goes to the shop. Reason: persistent gear would break the VS-style power-up shop economy.
- Stats are added through `PlayerStats.compute` as extra fields (same names as the passive stat keys) so no weapon code changes. New keys: `lightRadius`, `damageTaken`, `mainDamage`, `statusChance_*`, `dodgeCooldown`, `knockbackTaken`.

## 7. Status effects

HoT base values (`statuseffekter.csv`, `mekanik.md`): Burn 60 dmg/stack/tick, tick 0.33 s, 2.5 s, 20 stacks; Electrify 120 dmg, 2 s base interval x 0.854^(stacks-1), each tick removes one stack, 20 stacks; Frost 10 s, 60 base dmg/stack, 20 stacks, ice wave on death or at the stack cap; Decay 10 dmg/stack/s, -1 defense per stack, -0.05 block per stack, no cap or timeout; Stun has no numeric fields in the data (assumption: a duration).

Scaling rule (assumption to verify in headless): the HoT reference hit is about 100 (an early weapon hit). In Ashfall, status damage is a fraction of the applying hit, so it scales with might. Stack caps are cut from 20 to 8 because we have 300 enemies and a 60 Hz tick budget.

| Status | Per-stack effect | Duration / tick | Cap | Source ratio | Applied by |
|---|---|---|---|---|---|
| Burn | 0.08 x hit damage per tick per stack | 0.33 s tick, 2.5 s duration, refreshed on re-apply | 8 | 60 / ~100 per 0.33 s, divided by 4 for the cap cut | Slag Cannon, Furnace Cleave, Orbital Strike, grenade, Signet of Ash |
| Frost / Slow | -6% speed per stack (cap -48%); at the cap the enemy is frozen 1.0 s | 4 s (HoT 10 s, halved so enemies do not stay frozen) | 8 | HoT cap logic kept | Coolant Flush, Frost Band, Corrosive Flask (slow only, 1 stack) |
| Electrify | 0.5 x hit damage per tick per stack; each tick removes one stack | interval 2.0 s x 0.854^(n-1) | 6 | HoT interval formula kept exactly | Arc Coil, Chain Arc, Kugelblitz, Conduit Ring |
| Decay | 0.06 x hit per second per stack; -1 armor per stack (enemy armor in `power` terms: -4% enemy damage dealt per stack); no tick refresh | until death, 8 s timeout (added; HoT has none) | 10 | HoT 10 per second per stack | Lumen Caster, Toxic Vent, Corrosive Flask, Spore Carrier clouds |
| Stun | enemy cannot move or attack | 0.4-1.0 s; bosses take 25% of the duration; elites 50% | 1 | HoT stun skipped numbers | Hammer slam, Seismic, Tendrils |

Implementation: one byte of stack count and one float timer per status per enemy (`Enemy` pool fields), ticked by a single pass at 10 Hz (not per frame). Status ticks show as small coloured numbers merged by `TEXT_MERGE` (existing text pool). Visual: Burn = orange pulses (embers_0), Frost = cyan tint, Electrify = arc_0 flicker, Decay = green drip (poison particle), Stun = small stars. Sprites are tinted, not extra sprites.

Hero statuses (from enemies): Burn (slag/fire patches) 2 dmg/s for 3 s; Slow (frost patches) -25% for 2 s; Decay clouds 3 dmg/s. These use the same framework with fixed player-side values and no stacking.

## 8. Level-up structure

Offers stay at 3 cards (+1 with Luck >= the VS threshold). The deck is: owned weapon levels, new weapons (if a slot is free), owned passive levels, new passives (if a slot is free), plus one **Main card**.

| Card type | Weight (rarity field in data) | Condition |
|---|---|---|
| Auto weapon level / new | VS `rarity` (80-100) | as VS |
| Passive level / new | VS `rarity` (50-100) | as VS |
| LIGHT passive | 60 | not in the first two minutes |
| Main branch card | forced | hero level 5, 10, 15, 20, 25, 30, 35, 40 if any tier is open; replaces the last card slot and costs no reroll |
| Gold / HP filler | as VS | when nothing else can be offered |

Rules: the branch card shows 1 option (the next tier of a branch you started) or, if you started none, 2 options (random branches). Hero-level main-weapon stat growth (damage +x% per level) comes from the hero table, not from cards, as in HoT. The count of 6 weapon slots and 6 passive slots is unchanged; main weapon, branches and equipment do not use these slots.
Decision quality check: every level-up should have a clear question (new weapon vs. level, branch A vs. B at level 5). Headless metric: mean number of distinct card types offered, and the share of runs where each weapon is taken at least once (target 10-60%).

## 9. Stages (two, reusing the wave format)

Replace FOREST with **Cinder Flats** (key FLATS, region painting regions/cinder_flats) and LIBRARY with **Deep Mines** (key MINES, regions/deep_mines). Later: Refinery District and Hydroponic Vaults reuse the same code. The `STAGE_ORDER` array and `GameData.parseStages` need the new keys (the data stays in the overlay file). Start from the same `mods` as the VS stages so XP and gold curves stay familiar.

### 9.1 Cinder Flats (open, ash plain; replaces Mad Forest)
- Ground: ash grey tile (texture mine_rock tinted #26211d); decals scattered by WorldGen cells: scorch_mark, rubble, tire_tracks, footprints, bones, blood_stain, lumen_growth (rare, glowing, placed in clusters).
- Props: blocking: crashed_lander (landmark), cargo_crate stacks, barricade, fuel_tank, escape_pod, debris_rock; lumen_growth GLB as glowing obstacles; emergency_light as light posts.
- Destructibles (cell 500x500 like braziers): **explosive_barrel** (40% gold, 15% food, 5% Vacuum/Rosary...; explodes: radius 80, 5P to enemies and the hero if within 80, chain reacts to other barrels) and **supply_chest** (gives gold or a small gem pile, never equipment).
- Lighting: night, ambient 0.35, heavy ash falling (ash_flake particles, 40 at once), furnace glow on horizon only in the artwork.
- Hazard: ash storms at 12:00 and 22:00, 20 s, light radius -40%, enemy spawns +20%.

### 9.2 Deep Mines (corridors; replaces Library)
- Layout: long tunnels as the library shelves: rock walls (slag_rock, debris_rock, industrial_wall, catwalk) with a free central lane and side chambers; mine cart rails decal (hazard_stripes, floor_grate, manhole).
- Props: pipe_cluster, pipe_section, vent (steam_0/1 puffs), generator, control_terminal, coolant_valve, giant_crane silhouettes, smokestack in the far corner.
- Crystals: crystal_shards decal, crystal_lumen/crystal_void icons as light-emitting pickups on the floor (no gameplay).
- Destructibles: **explosive_barrel** and **supply_chest** as above, plus **stim_pylon** (rare, 1 per ~2000x2000, heals 30% HP when destroyed, 60 s cooldown).
- Lighting: ambient 0.22 (darker), light radius base 200 instead of 240, emergency_light posts (radius 130, warm flicker) every ~600 units along the lane.

### 9.3 Wave tables

Format as in `game_data.json` stages: `minute`, `minimum` (field fill), `frequency` ms, `enemies` (one of each per tick), `bosses`, `treasure`. Enemy key legend: COL = Colonist, HND = Spore Hound, SGT = Sergeant, DRN = Security Drone, WLD = Welder, SPC = Spore Carrier, SML = Smelter, VIR = Vire. Elites are rolled by the elite system (section 5) from the row's enemies and are not listed. "Z-minute" shapes copy VS (a dead zone near minutes 5-10 is part of the data and kept).

**Cinder Flats (30 rows; min = minimum, f = frequency ms)**

| Min | min | f | Enemies | Bosses |
|---|---|---|---|---|
| 0 | 10 | 1400 | COL | |
| 1 | 14 | 1200 | COL, HND | |
| 2 | 18 | 1100 | COL, HND | |
| 3 | 22 | 1000 | COL, HND, SGT | |
| 4 | 26 | 900 | COL, HND, SGT | |
| 5 | 20 | 1100 | HND, SGT, SPC | Cargo Loader |
| 6 | 24 | 1000 | COL, SGT, SPC | |
| 7 | 30 | 900 | COL, HND, DRN | |
| 8 | 32 | 850 | HND, SGT, DRN, SPC | |
| 9 | 36 | 800 | COL, WLD, DRN | |
| 10 | 40 | 800 | HND, WLD, SPC | Smelter Foreman |
| 11 | 44 | 750 | COL, SGT, WLD | |
| 12 | 48 | 750 | HND, DRN, SPC, WLD | (ash storm) |
| 13 | 52 | 700 | COL, SGT, DRN | |
| 14 | 56 | 700 | HND, WLD, SML | |
| 15 | 60 | 650 | COL, SGT, SML, SPC | Slagborn |
| 16 | 64 | 650 | HND, DRN, WLD | |
| 17 | 68 | 600 | COL, SGT, SML | |
| 18 | 72 | 600 | HND, SPC, WLD, DRN | |
| 19 | 76 | 600 | COL, SML, VIR | |
| 20 | 80 | 550 | HND, SGT, VIR, WLD | Vire, awakened |
| 21 | 84 | 550 | COL, DRN, SML | |
| 22 | 88 | 500 | HND, SPC, WLD (ash storm) | |
| 23 | 92 | 500 | COL, SGT, SML, VIR | |
| 24 | 96 | 500 | HND, DRN, WLD, SPC | |
| 25 | 100 | 450 | COL, SML, VIR | Cargo Loader x2 |
| 26 | 110 | 450 | HND, SGT, DRN, WLD | |
| 27 | 120 | 400 | COL, SML, VIR, SPC | |
| 28 | 130 | 400 | HND, WLD, SML, VIR | |
| 29 | 140 | 350 | all | Slagborn + Foreman |

Caps: 300 enemies overall (existing rule). Minimum column peaks at 140 so there is room for elite adds, the boss and projectiles under the 320 pool.

**Deep Mines** uses the same format with a different mix: tunnels favour hounds and drones early (less room to dodge), carriers in chokepoints, Welders from minute 6. Concrete rows: minute 0 (12, 1300, COL), 1 (16, 1100, COL HND), 2 (20, 1000, HND DRN), 3 (24, 900, COL HND SGT), 4 (28, 850, HND DRN), 5 (22, 1000, HND SPC SGT; boss: Cargo Loader), 6 (28, 900, COL WLD DRN), 7 (34, 850, HND SPC WLD), 8 (38, 800, COL SGT DRN), 9 (42, 750, HND WLD SML), 10 (46, 750, COL DRN SPC; boss: Slagborn), 12 (52, 700, HND SGT VIR), 14 (60, 650, COL WLD SML), 15 (64, 600, HND DRN SPC; boss: Smelter Foreman + tentacle hazard), 17 (72, 600, COL SML VIR), 19 (80, 550, HND WLD DRN), 20 (84, 550, SGT SML VIR; boss: Vire awakened), 22 (92, 500, HND SPC WLD), 24 (100, 450, COL SML VIR DRN), 25 (110, 450, HND WLD SML; boss: Cargo Loader x2 + Slagborn), 27 (120, 400, all), 29 (140, 350, all; boss: **The First**). Missing minutes inherit the previous row, as `WaveSelector.rowAt` already does. Difficulty: Deep Mines is the second stage, so enemy health x1.25 and speed x1.05 in its `mods`.

Treasure table: copy the VS `treasure` rows per boss minute (chances 5/3/1 items, prizeTypes EVOLUTION first) and keep the rule that a chest is never empty.

### 9.4 Dressing budget
The decals and props are baked 2D sprites placed by `WorldGen` (pure function of cell). Cap of 60 prop sprites and 120 decals on screen. Props block the hero with the same circles as VS trees/shelves; enemies path around with the existing separation code, hounds and drones ignore them.

## 10. Darkness and lighting

Pass order per frame on the top screen: ground cache -> decals -> props and enemies (shaded) -> projectiles and vfx (additive, above darkness) -> darkness mask -> UI numbers. Implementation: a 1/6 resolution Alpha8 lightmap (about 320x180) filled with ambient darkness, then radial gradients punched in with DST_OUT for each light; draw it once, scaled up with filtering. Budget: at most 12 lights on screen (player, 6 posts, 5 fires/barrels/projectiles). Add a settings row "LIGHTING: FULL / LOW / OFF" (LOW = no lightmap, a fixed vignette; OFF = none). The Thor GPU/CPU cost is unmeasured: `performance-analyst` must measure on device before phase 6 ends.

| Item | Value |
|---|---|
| Ambient darkness | Cinder Flats 0.65 alpha, Deep Mines 0.78 alpha (never black: the floor and silhouettes stay visible) |
| Player light | radius 240 (Mines 200), soft edge 60%, +LIGHT passive/equipment |
| Light sources | emergency_light r130 warm flicker; lumen_growth r90 green pulse; fire patches r70 orange; explosions flash r150 for 0.15 s; elite aura r60; Orbital warn ring r70 red |
| Emissive | lumen crystals, gems, spore clouds, enemy eyes (2 px bright dots on all enemies, always drawn above the darkness) |

Readability rules
1. Enemies and enemy projectiles are always drawn above the darkness mask at minimum 60% brightness inside the view. They never vanish into black.
2. Player projectiles are additive and bright (white-cyan). Enemy projectiles have a black outline and a red-orange core. Green is reserved for lumen ground and Xenomant. Never colour an enemy projectile green.
3. Telegraphs (warn_ring_0) always full brightness and 0.8 s minimum.
4. Gems glow even in the dark. The red far gem pulses.
5. Screen shake and flashes are capped (no white flash above 0.25 alpha) - the small screen shows a lot at once.
6. Test: take a screenshot at a dense moment of each stage and run a luminance check on enemy silhouettes against the background (contrast ratio target > 2.0).

## 11. Bottom-screen UI

- Skin: dark steel panel (#15110f), rivets and hazard-stripe dividers, orange accents, lumen green for XP. Frames: flux/frames/*.webp for slots, stat icons from flux/stats/*.webp, skill icons from meshy/icons/skill_*.webp for weapons and branches.
- Always shown: HP bar, XP bar and level, timer, kills, gold (as today); 6 weapon and 6 passive slots (as today); **main weapon row** with branch tiers (3 small pips per branch); **equipment strip** of 6 slots (Head, Body, Gloves, Feet, Ring, Neck) in rarity frames; **status line** for the hero (Burn, Slow, Decay icons with a timer) and for the targeted elite; minimap.
- Level-up: 3-4 cards as today; the Main card has a gold frame and the hero portrait (meshy/icons/portrait_*.webp).
- Equipment choice: Keep vs. Replace cards, stat difference in green/red.
- Boss spawn: 2 s banner with the boss portrait (flux/bosses/<id>.webp), name in capitals, a red warn line; then a boss HP bar on the bottom screen and a thin one at the top of the world.
- Result screen: shows the hero, the final equipment and the branches picked.
- Hero select and stage select: region painting as the card background (regions/*.webp at low resolution, 640x360); stage select shows "Cinder Flats" and "Deep Mines" with best time.
- Memory: portraits and frames are decoded at the display size only when the screen opens (not at start).
- **Implemented (phase 11):** `ui/Skin`, `ui/UiArt`, `ui/PanelRenderer`, `ui/TopOverlay`; typeface Barlow Condensed (OFL) in `assets/fonts/`; art from `tools/build_ui_assets.py` into `assets/ui/`. The status line and elite statuses use vector glyphs (no icon art for Burn/Slow/Decay or the six elite modifiers). Best time is kept per stage. See README "ASHFALL-skalet".

## 12. Audio direction

Dark industrial: low drones, metallic hits, slow pulse. Music is minimal and mostly bass; boss music adds a heartbeat and distorted choir. No melody hooks in the early minutes. Keep the existing audio pipeline (`tools/import_audio.py`, manifest, limits per 100 ms). Tracks: `menu`, `flats` (replaces forest), `mines` (replaces library), `boss`, `first` (final boss), stingers `gameover`, `victory`.

Reuse the 26 existing ids with new files where the sound no longer fits: whip->vibro_lash, magic_missile->spore_dart, knife->scalpel, axe->grenade, cross->drone, bible->ward_drone, fireball->slag_cannon, garlic->vent, holy_water->flask, lightning->arc, brazier_break->barrel_break.

New SFX ids needed (each with a limit per 100 ms)
- hammer_swing, hammer_slam, pistol_shot, caster_bolt, spore_burst, dodge
- burn_tick, frost_hit, electrify_zap, decay_hiss, stun_hit
- chain_arc, kugelblitz_hum, orbital_warn, orbital_hit, nova_frost
- barrel_explode, crate_break, pylon_use
- elite_spawn, elite_die, equip_drop, equip_pick, equip_swap
- drone_shot, sergeant_burst, welder_charge, carrier_burst, vire_blink, tentacle_emerge
- boss_intro, boss_slam, the_first_roar, light_flicker (loop, very low)
- hero_hit_bastion, hero_hit_spectre, hero_hit_xenomant (3 variants)

About 36 new ids. Music and SFX loudness follow the existing AUDIO_SPEC (-16 LUFS music, -1 dBFS peak effects). Voice lines for the three heroes are optional and out of scope.

## 13. Data schema and migration

Do not touch `game_data.json` (generated from REA). Add an **overlay** file `app/src/main/assets/ashfall_data.json` that `GameData.parse` loads after the base data and merges by id. VS ids stay stable so saves, shop and `Sim.B_*` constants keep working.

```
{
  "names": { "WHIP": {"name":"Vibro Lash","description":"..."}, "VAMPIRICA": {...}, ... },
  "heroes": { "BASTION": { "hp":130, "armor":1, "regen":0.4, "moveSpeed":0.92, "crit":0.05, "critMul":2,
                            "perLevel":{"power":0.01,"maxHp":0.01}, "main":"HAMMER", "clips":{...} } },
  "mainWeapons": { "HAMMER": { "kind":"CONE", "interval":1100, "power":1.6, "arc":100, "radius":80,
                              "every":{"n":3,"as":"SLAM"}, "branches":[{ "id":"SEISMIC","tiers":[{...},{...},{...}] }] } },
  "newWeapons": { "CHAINARC": [ {level 1 row}, {delta rows...} ] },
  "statuses": { "BURN": { "tick":0.33, "duration":2.5, "hitFrac":0.08, "maxStacks":8 }, ... },
  "archetypes": { "RANGED": { "stop":132, "backoff":100, "backoffSpeed":0.7, "pause":0.5 }, ... },
  "enemies": { "COLONIST": { "name":"Infected Colonist", "archetype":"CHASER", "maxHp":1.0, "speed":100,
                             "power":10, "xp":1, "sprite":"infected_colonist", "params":{} } },
  "elites": { "interval":150, "min":100, "mods":[...], "hpMul":6, "damageMul":1.5, "scale":1.4, "xpMul":8 },
  "equipment": { "COMBAT_HELM": { "slot":"HEAD", "icon":"combat_helm", "values":{"armor":1}, "rarity":0 } },
  "stages": { "FLATS": [rows in the existing format], "MINES": [...] },
  "lighting": { "FLATS": {"ambient":0.65,"radius":240}, "MINES": {"ambient":0.78,"radius":200} }
}
```

Code impact (for `implementer`):
- `GameData`: new maps and `STAGE_ORDER = {"FLATS","MINES"}` (the old FOREST and LIBRARY remain loadable behind a debug flag so the old balance tests stay valid).
- `EnemyDef`: add `archetype`, `params`, `sprite`. `Sim` enemy update branches on archetype id (an int switch, no virtual calls in the hot loop).
- `PlayerStats`: add the new stat keys listed in section 6.
- Save data (`MetaProgress`): add `hero` and per-hero unlocks; old saves default to Bastion. Shop purchases and gold carry over unchanged.
- Sprite atlas: GLB models are baked to 8-direction sheets by `tools/bake/` (three.js in headless Chromium). Baked sheet naming `sprites/<model>_<clip>_<dir>_<frame>`. Memory plan: 5 unique directions (0, 45, 90, 135, 180 degrees) mirrored to 8; heroes 96 px, enemies 64 px, bosses 128 px; about 18 frames per rigged enemy; total sprite memory target under 40 MB (check with `performance-analyst`).

Where numbers come from: weapons, passives and wave counts from VS (unchanged data); archetype distances and timers from HoT `fiende_ai.csv`; status intervals and the Electrify formula from HoT `statuseffekter.csv`; elite interval, modifier ideas and adds from HoT `champions.csv`; hero base ratios from HoT `karaktarer_oversikt.csv`. Invented (needs tuning): enemy HP in Z, boss HP, branch numbers, new weapon rows, equipment values, status hit fractions, stack caps.

## 14. Implementation phases (each ends with the acceptance check)

1. **Names and art swap (no new mechanics).** Overlay file with names, descriptions, icons for the 10 weapons and passives; replace procedural weapon art with vfx sprites. Accept: 147 existing tests still pass; headless run identical to before (same kills at 5 min with fixed seed).
2. **Sprite bake pipeline.** GLB -> 8-direction sheets for 3 heroes and 8 enemies; renderer draws oriented sprites with animation clips. Accept: 300 enemies on screen at 60 fps on the emulator; atlas test valid; memory under 40 MB.
3. **Heroes and main weapons.** Hero select, aim input (right stick, facing fallback), the three main weapons, dodge. Accept: headless bot with aim fixed at nearest enemy kills at least 80% as many enemies as the VS Whip baseline for 5 min; standing still dies by minute 3.
4. **Branches and level-up rework.** Branch cards, offer weights. Accept: `OfferGenerator` test: Main card appears exactly at hero levels 5/10/15/...; no run offers a tier before its predecessor; every branch is chosen in at least 5% of 200 simulated runs.
5. **Status effects.** Burn, Frost, Electrify, Decay, Stun with caps and the 10 Hz pass; hero statuses. Accept: unit tests for each formula (Electrify interval 2.0, 1.708, 1.459 s at stacks 1, 2, 3); no allocations in the status pass; a Burn-only build does not out-damage a Might build by more than 25%.
6. **Enemy archetypes and the new roster.** Ranged, charger, exploder, tank, teleporter, hounds, drones. Accept: archetype tests (a ranged enemy holds 100-132 from the hero; a charger telegraphs 0.6 s; an exploder deals damage only through its cloud); projectile pool never overflows with 24 ranged enemies.
7. **Stages, props, destructibles, wave tables.** Cinder Flats and Deep Mines, barrels, crates, pylons, hazards, wave rows. Accept: both stages load; wave test (`WaveDirector`) never exceeds 300 enemies; barrels chain correctly; a 30 min headless bot survives with a mid build and dies with a naked build.
8. **Darkness and lighting.** Lightmap, light sources, readability rules, settings row. Accept: on-device frame time with lighting FULL stays within 16.6 ms at 300 enemies (or the default drops to LOW); screenshot contrast check passes.
9. **Elites and equipment.** Champion scheduler, modifiers, equipment drops, choice screen, unique drops. Accept: 1 elite per 150 s +- 10 s in a 30 min headless run; equipment never pauses unexpectedly; salvage gold test; PlayerStats test for each item.
10. **Bosses and The First.** Boss patterns, portraits, boss HP bar, final boss. Accept: each boss can be killed by a mid build in under 90 s; The First phases trigger at 66/33%; death and victory screens reached.
11. **Bottom UI skin and audio.** Panel skin, equipment strip, boss banner, new SFX and tracks. Accept: screenshot tests (Robolectric) for each screen; manifest test lists all new ids; audio size under the existing budget (raise from 3 MB to 5 MB).
12. **Balance pass.** Use `thor-survivors-balance`: win rate by hero (target 20-40% for a median build at 30:00), time-to-first-evolution (target 8-14 min), weapon pick rates, elite gear power share. Accept: report with numbers; no weapon or passive picked in more than 70% or less than 10% of winning runs.
    *Result (phase 12, headless, 40 seeds per cell, bot `mid`):* survival to 30:00 Flats 60/52/57%, Mines 50/55/47% (Bastion/Spectre/Xenomant); win rate Flats 52-60%, Mines (also The First dead) 20-40%; level at 30:00 67-90; The First dies in 54% of the runs that reach it (arrives 28:00); first evolution about 20:30 (not reachable by the Ashfall layer: needs a maxed weapon plus its passive at a boss chest, the offers are VS rolls); base weapons are in 30-78% of winning runs, evolutions 2-15%; a mid build wears 5.8 of 6 gear slots and loses 7-15 points of Mines survival without them. Details and the before/after table: README, section "Balans och finish".

Risks to test first (cheap, headless): (1) dodge makes kiting trivial; (2) status stacks multiply with Might beyond the cap; (3) the aim input can be gamed by always facing away from the swarm (Twin Pistols range 360 helps ranged heroes; Bastion's cone is short on purpose); (4) lighting cost on device (needs the real Thor).
