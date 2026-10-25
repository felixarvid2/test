# Thor Survivors: audio specification (brief for the sound generator)

Thor Survivors is a Vampire Survivors-style auto-shooter for a handheld Android console, reskinned as the dark world of
ASHFALL: Lumen Tide (docs/ASHFALL_DESIGN.md sections 1 and 12). Hundreds of enemies, constant weapon fire and pickups,
so every sound is **short, punchy, readable at low volume and non-fatiguing**. Style: **dark industrial sci-fi
horror**: low drones, metallic impacts, steam, sparks, wet organic spore sounds, distorted bass pulses. Music is minimal
and mostly bass, with no melody hooks in the early minutes; the boss tracks add a heartbeat and a distorted choir.
The files below are dropped in as-is: no code changes. Anything missing is simply silent.

## File contract

```
app/src/main/assets/audio/
  manifest.json            id -> file, base volume (see below)
  sfx/<id>.ogg             one file per sound effect id
  music/<track>.ogg        one file per music track
```

| | Sound effects | Music |
|---|---|---|
| Container / codec | Ogg Vorbis (`.ogg`; `.wav` 16-bit also works if the manifest names it) | Ogg Vorbis |
| Channels | **mono** | **stereo** |
| Sample rate | **44.1 kHz** | 44.1 kHz |
| Bitrate | quality 4 (about 128 kbps) is plenty | quality 2-3 (about 90-112 kbps) |
| Loudness | peak at **-1 dBFS**, punchy, about **-12 LUFS** short-term for the loud ones (hit/explosion class) | **-16 LUFS integrated**, true peak <= -1 dBFS |
| Silence | no leading silence (the sound must start on sample 0), no long tail of silence | none at the loop point |
| Size | under 60 KB each (total assets budget: **under 5 MB**; about 2.0 MB shipped) | loops 15-40 s, under 450 KB each |

Never clip. Tails must reach silence by the last sample (the file may be faded out over its last few ms).

### Loops (menu, forest, library, boss, final)

Seamless loops: the end joins the start with a cross-fade (the end is blended with the audio that precedes the start
of the section, so it runs straight into the start), the file starts and ends on the same energy and the last 30 ms are
eased onto the first sample so the wrap has no step. Rhythmic loops are cut on a whole number of bars (checked by
correlating the source with itself). Test by looping the file in an editor: no click, no gap, no jump in level.
`gameover` and `victory` are one-shot stingers and are not looped.

### manifest.json

```json
{
  "version": 1,
  "sfx":     { "whip": { "file": "sfx/whip.ogg", "volume": 0.8, "pitchVar": 0.06 } },
  "pending": { "hammer_swing": { "file": "sfx/hammer_swing.ogg", "volume": 0.8, "pitchVar": 0.06 } },
  "music":   { "menu": { "file": "music/menu.ogg", "volume": 0.8, "loop": true } }
}
```

* `file` is relative to `audio/`. If an sfx id has no manifest entry the game still tries `sfx/<id>.ogg` at volume 1.
* `volume` (0 to 1.5, default 1) is the base gain, a mixing aid on top of the player's volume setting.
* `pitchVar` (default 0.06, i.e. +/-6 %) is the random pitch variation per play; set 0 for UI sounds.
* `loop` (music only) defaults to true; the stingers are never looped.
* A missing file, or an entry whose file is missing, is silent; a broken manifest falls back to the default paths.
* `pending` is ignored by the game. It lists the sounds for the design section 12 events that `SoundEvents` does not
  have yet (files are shipped and ready). When the code adds an id to `SoundEvents.NAMES`, move its entry from
  `pending` to `sfx` in `manifest.json` (and in `SFX_PENDING` to `SFX` in `tools/import_audio.py`). The manifest test
  requires `sfx` to hold exactly the ids of `SoundEvents`, so a wired id must not stay in `pending`.
* `final` (music) plays while The First is alive (`MusicDirector.trackFor` with `finalAlive`, the boss track if the file is missing).

## Sound effect ids

The ids are the file names; the first 26 are defined in `game/SoundEvents.java` (`NAMES`). Length is a target; stay
within the range. "Rate" is how often the game can ask for the sound (it is rate limited per id; see the last
paragraph), so sounds that fire constantly must be quiet, short and not tonal-annoying. The old Vampire Survivors
names (whip, magic_missile, ...) are kept as ids; the sounds follow the ASHFALL weapon names.

| id | When | Length | Style |
|---|---|---|---|
| `whip` | Vibro Lash swings (every ~1 s, alternating sides) | 0.2-0.3 s | Electric slash: fast swoosh with a buzzing zap snap |
| `magic_missile` | Spore Dart fires | 0.15-0.25 s | Wet thwip with a low zap, no bright blip |
| `knife` | Scalpel throw (many per second) | 0.1-0.15 s | Tiny metallic whoosh/tick, very short, high |
| `axe` | Grenade thrown | 0.25-0.35 s | Heavy low metal thunk with a sub thump |
| `cross` | Drone (boomerang) | 0.3-0.45 s | Rotor whirr with fast tremolo |
| `bible` | Ward Drone orbit starts | 0.4-0.6 s | Soft low force-field hum, gentle |
| `fireball` | Slag Cannon fires | 0.3-0.4 s | Low boom with a rumble tail |
| `garlic` | Toxic Vent damage tick (about every 1 s) | 0.15-0.25 s | **Quiet**, soft gas hiss; must not annoy when repeated |
| `holy_water` | Flask lands | 0.3-0.45 s | Glass shatter into an acid sizzle |
| `lightning` | Arc coil strike (several at once) | 0.35-0.5 s | Electric crack + short thunder, fast attack |
| `enemy_hit` | An enemy takes damage (dozens per second) | 0.05-0.1 s | **Tiny** meaty/metal thud, quiet, no pitch character |
| `enemy_death` | An enemy dies (dozens per second) | 0.15-0.25 s | Short wet squelch / collapse, quiet-mid |
| `player_hurt` | The player is hit | 0.25-0.35 s | Armoured grunt over a plate impact, clearly louder than enemy sounds |
| `gem` | XP crystal pickup | 0.08-0.12 s | Crystal chime at a **mid pitch (about C6)**; the game raises it up a major scale (to +1 octave) for gems collected within 0.4 s of each other, so keep it clean and tonal, a single pitch |
| `coin` | Scrap / gold pickup (also Vacuum, Orologion, Rosary, Clover) | 0.15-0.25 s | Two scrap-metal clinks |
| `food_heal` | Med ration eaten | 0.25-0.4 s | Injector click and hiss |
| `level_up` | Level up | 0.5-0.8 s | Dark low synth stinger with a metal hit, no cheerful arpeggio |
| `chest_open` | Supply crate opened | 0.8-1.1 s | Latch and creak, then a low dark reveal |
| `evolution` | A weapon evolves (played on top of `chest_open`) | 1.4-2.0 s | Dark rising swell into a low boom: the most epic sound |
| `brazier_break` | Barrel / lamp smashed | 0.3-0.45 s | Metal barrel crunch with a low thump |
| `boss_spawn` | A boss appears | 1.0-1.6 s | Deep horn/roar drone + rumble; the loudest "warning" |
| `game_over` | The player dies (together with the `gameover` stinger) | 0.8-1.4 s | Heavy descending doom impact |
| `victory` | The run is won (together with the `victory` stinger) | 1.2-1.8 s | Low bell hit over a swelling drone, dark but resolved |
| `ui_move` | Menu cursor moves / a setting changes | 0.03-0.06 s | Soft industrial tick |
| `ui_confirm` | Menu confirm | 0.08-0.15 s | Metal latch click |
| `ui_back` | Menu back / refused action | 0.07-0.12 s | Low switch click |

### New ids (design section 12, in `manifest.json` under `pending`)

Built and shipped. The first six (hammer to dodge) and `burn_tick`, `frost_hit`, `electrify_zap`, `decay_hiss`, `stun_hit`, `barrel_explode`, `crate_break`, `pylon_use`, `drone_shot`, `sergeant_burst`, `welder_charge`, `carrier_burst`, `vire_blink`, `elite_spawn`, `elite_die`, `equip_drop`, `equip_pick`, `equip_swap`, `tentacle_emerge`, `boss_intro`, `boss_slam` and `the_first_roar` are wired now (they live under `sfx`); the rest wait in `pending`. "Limit" is a suggestion for the per-100 ms cap when the code wires them (events
that can fire many times per second should be capped low and kept quiet).

| id | When | Length | Style | Limit |
|---|---|---|---|---|
| `hammer_swing` | Bastion hammer swing | 0.3-0.4 s | Heavy low whoosh | 1 |
| `hammer_slam` | Hammer slam (every third swing) | 0.4-0.5 s | Metal impact with a sub boom and falling rock | 1 |
| `pistol_shot` | Spectre pistol | 0.15-0.25 s | Dry shot with a metal tick, many per second | 3 |
| `caster_bolt` | Xenomant caster bolt | 0.25-0.35 s | Dark energy bolt | 2 |
| `spore_burst` | Spore cloud released | 0.3-0.4 s | Wet pop with a hiss | 2 |
| `dodge` | Dodge roll | 0.2-0.3 s | Short air whoosh | 1 |
| `burn_tick` | Burn status tick (10 Hz pass) | 0.1-0.15 s | **Very quiet** crackle | 1 (0.2 s apart) |
| `frost_hit` | Frost applied | 0.15-0.25 s | Icy glass ping | 2 |
| `electrify_zap` | Electrify proc | 0.15-0.25 s | Short electric zap | 2 |
| `decay_hiss` | Decay status | 0.3-0.4 s | **Quiet** acid hiss with a wet blip | 1 (0.3 s apart) |
| `stun_hit` | Stun applied | 0.35-0.45 s | Plate bonk with a metallic ring | 1 |
| `chain_arc` | Chain Arc jumps | 0.4-0.5 s | Arcing electric chirp | 2 |
| `kugelblitz_hum` | Kugelblitz orb spawns / orbits | 0.5-0.6 s | **Very quiet** electric hum (pitchVar 0.02) | 1 (0.5 s apart) |
| `orbital_warn` | Orbital strike marker appears | 0.9-1.0 s | Rising alarm sweep with three low beeps | 1 |
| `orbital_hit` | Orbital strike lands | 1.1-1.3 s | Big crunching explosion | 1 |
| `nova_frost` | Frost nova | 0.5-0.7 s | Rising/falling ice shimmer with glass shards | 1 |
| `barrel_explode` | Explosive barrel | 0.8-0.9 s | Big explosion with debris | 2 |
| `crate_break` | Crate smashed | 0.25-0.45 s | Wood crack and plate rattle | 2 |
| `pylon_use` | Pylon activated | 0.8-0.9 s | Power-up surge with a force-field hum | 1 |
| `elite_spawn` | Elite appears | 1.0-1.1 s | Low roar over a metal hit and a swelling drone | 1 |
| `elite_die` | Elite dies | 0.9-1.0 s | Crunching collapse with a low groan | 1 |
| `equip_drop` | Equipment drops | 0.25-0.35 s | Metal thud and clink | 1 |
| `equip_pick` | Equipment picked up | 0.15-0.25 s | Latch click and a high clink | 1 |
| `equip_swap` | Equipment swapped | 0.3-0.4 s | Lock and chain rattle | 1 |
| `drone_shot` | Drone enemy shoots | 0.15-0.2 s | **Quiet** small laser | 2 |
| `sergeant_burst` | Sergeant fires a burst | 0.3-0.4 s | Three low shots | 1 |
| `welder_charge` | Welder enemy charges | 0.8-0.9 s | Rising electric whine with crackle | 1 |
| `carrier_burst` | Carrier bursts open | 0.4-0.5 s | Wet pop with a metal clang | 1 |
| `vire_blink` | Vire teleports | 0.4-0.5 s | Falling electric blink | 1 |
| `tentacle_emerge` | Tentacle surfaces | 0.6-0.7 s | Wet rip and squelch | 1 |
| `boss_intro` | Boss intro sting | 1.8-2.0 s | Swelling drone with a low choir and a boom | 1 |
| `boss_slam` | Boss slam | 0.9-1.0 s | Huge impact with falling rock | 1 |
| `the_first_roar` | The First (final boss) roars | 2.0-2.2 s | Very low roar over a choir and a drone: the loudest sound | 1 |

Not built: `light_flicker` (a very low loop) and `hero_hit_bastion`, `hero_hit_spectre`, `hero_hit_xenomant` (optional
hero voice variants, out of scope in the design).

Rate limits applied by the game for the wired ids (so the generator need not worry about overlap): per 100 ms at most
`whip` 2, `magic_missile` 3, `knife` 3, `axe` 2, `cross` 2, `bible` 1, `fireball` 3, `garlic` 1 (and 0.4 s apart),
`holy_water` 2, `lightning` 3, `enemy_hit` 3 (30 ms apart), `enemy_death` 4 (20 ms apart), `player_hurt` 1 (0.2 s
apart), `gem` 3, `coin` 3, `ui_*` 2, all others 1. Beyond that, the oldest voice of the same id is cut.

## Music tracks

Played with a 1.4 s fade-in and a 0.9 s fade-out when the track changes (a cross-fade). Music is ducked to 45 %
while the game is paused, at level-up and at chests. It sits **under** the sound effects: no loud transients,
restrained mid frequencies (the SFX live around 1-5 kHz), no vocals except the distorted choir texture of the boss
tracks. The ids keep their old names: `forest` is the Cinder Flats stage (design name `flats`), `library` the Deep
Mines (`mines`) and `final` is The First (`first`).

| track | When | Length | Loop | Style |
|---|---|---|---|---|
| `menu` | Main menu and power-up shop | 20-40 s | yes | Slow low drone, cavern air, no beat, no hook |
| `forest` | Cinder Flats stage | 15-40 s | yes | Heavy distorted bass pulse and metallic hits, industrial, sparse |
| `library` | Deep Mines stage | 15-40 s | yes | 60 BPM bass pulse, dark sci-fi, steady and tense |
| `boss` | While a boss is alive (optional; the stage track plays if it is missing) | 12-30 s | yes | Dark driving 140 BPM, a slow heartbeat and a low distorted choir |
| `final` | The First (final boss): plays while it lives | 15-30 s | yes | Heavy detuned boss track, fast heartbeat, two choir voices |
| `gameover` | Result screen after dying | 3-6 s | no (stinger) | Sinking drone with a low choir, no transient (the sfx has the impact) |
| `victory` | Result screen after winning | 4-7 s | no (stinger) | Dark pulsing swell that decays, resolved not triumphant |

The `gameover` and `victory` stingers start at the same moment as the matching sfx, so keep the stinger's first
beat free of heavy transients that would clash.

## Delivering

1. Put the files at the paths above (names exactly as listed, lower case) and adjust `manifest.json` if a file has a
   different extension, base `volume` or `pitchVar`.
2. Rebuild (`./gradlew assembleDebug`). No code changes are needed.
3. `tools/import_audio.py` builds the shipped files from the CC0 sources listed under "Sources" (see below), and
   `tools/make_placeholder_sfx.py` still regenerates the old procedural placeholders. The placeholder script overwrites
   every file and the manifest, so do **not** run it now that the real sounds are in.

Check list for each file: right channel count and sample rate (`ffprobe`), no clipping, starts at sample 0, loops are
seamless, loudness as above (`ffmpeg -i f.ogg -af ebur128 -f null -`).

## Sources (what is shipped)

The shipped audio is real CC0 material, produced by `tools/import_audio.py` (one table row per id: source files, trim,
gain, pitch, filters, layers; re-run it to rebuild everything, `--only whip,menu` for a few). The script writes the
files, `manifest.json` volumes and `CREDITS.txt` (every source file with pack, author, licence and URL). Local sources
are in `../assets/audio` (Kenney RPG Audio, Impact, Interface and Digital Audio packs, each with a CC0 `License.txt`);
downloaded ones are in `art-src/audio/<pack>/` with a `SOURCE.md` (URL, author, licence, date, files kept), all from
OpenGameArt.org where each page lists "License(s): CC0" and nothing else (checked on the page when downloaded):
rubberduck's CC0 packs, Kenney's Sci-Fi Sounds, bart's steam and heartbeat sounds, the electricity, metal impact,
monster, meat and chanting packs, and the music (Nuclear Cave, Dark Sci-Fi Audio Pack, Dark Cavern Ambient, Dark Forces,
Heavy Boss Battle 2). The `400 Sounds Pack` (Chequered Ink) is not used: its itch.io page grants free use in games but
with its own terms (no resale of the unaltered files), not CC0, and the folder has no licence file.

How the dark tone is made, all in the table rows of the script: `rate` pitches a layer down (0.6 is 7.4 semitones, and
slower), `glide` moves the pitch over the sound (risers, doom drops), lowpass filters muffle and add weight, `sat` is
tanh distortion, `comp` a compressor, `echo` a short reverb-like tail, and layers are stacked (a transient, a body and
a low sub). Every SFX gets a 40 Hz high-pass (no DC or sub rumble), a fade-in of under 1 ms, a fade-out to silence,
peak normalisation and Vorbis q4; the script decodes each file again and backs the gain off until the decoded peak is
<= -1 dBFS. Music is gain-set to -16 LUFS integrated with a soft peak limit and checked on the decoded file (true peak
<= -1 dBTP). In the tables: LP/HP = low/high-pass corner in Hz, sat = distortion drive, comp = compressor ratio.

| id | Source layers (pack `file`, processing) | Dynamics |
|---|---|---|
| `whip` | RPG `blade_02` (LP 6500, HP 300) + Kenney Sci-Fi `laserRetro_003` (LP 7000, HP 1200, -6 dB) | sat 1.8, comp 3:1 |
| `magic_missile` | Water `slime_04` (x0.85 pitch, LP 5000) + Kenney Sci-Fi `laserSmall_000` (LP 1800, -3 dB) | comp 3:1 |
| `knife` | Kenney RPG `knifeSlice2` (HP 2500) + Kenney RPG `metalLatch` (HP 3000, -8 dB) |  |
| `axe` | Kenney Sci-Fi `impactMetal_001` (LP 900) + Kenney Sci-Fi `lowFrequency_explosion_001` (x0.9 pitch, LP 450, -4 dB) | sat 1.5, comp 4:1 |
| `cross` | Kenney Sci-Fi `engineCircular_002` (LP 3200, tremolo) |  |
| `bible` | Kenney Sci-Fi `forceField_002` (LP 1400) |  |
| `fireball` | Bang `cannon_02` (x0.8 pitch, LP 1800) + Kenney Sci-Fi `lowFrequency_explosion_001` (LP 500, -2 dB) | sat 1.4, comp 4:1 |
| `garlic` | Steam `Marker #3` (LP 5000, HP 1200) |  |
| `holy_water` | Breaking `glass_breaking_02` (-2 dB) + Steam `Marker #1` (HP 2500, -3 dB) | comp 3:1 |
| `lightning` | Kenney Digital `zap2` (-2 dB) + Electricity `hit` (LP 5000, -3 dB) + 100#2 `thunder_01` (LP 2500, -6 dB) | sat 1.3, comp 2:1 |
| `enemy_hit` | Kenney Impact `impactPunch_medium_001` (LP 2500) + Kenney Impact `impactMetal_light_000` (LP 4000, -9 dB) |  |
| `enemy_death` | Mud `mud_18` (LP 3500) + Water `slime_09` (x0.8 pitch, -3 dB) | comp 4:1 |
| `player_hurt` | Creature `grunt_02` (LP 2500) + Kenney Impact `impactPlate_medium_000` (-1 dB) | comp 2:1 |
| `gem` | Kenney Impact `impactGlass_light_001` (tuned to C6) |  |
| `coin` | Metal Impact `clink2` (HP 800) + Metal Impact `clink3` (x1.1 pitch, -3 dB) | comp 3:1 |
| `food_heal` | Kenney RPG `metalLatch` (LP 4000, -3 dB) + Steam `Marker #4` (HP 2000) |  |
| `level_up` | Kenney Digital `lowThreeTone` (LP 3500) + Kenney Impact `impactMetal_heavy_000` (LP 600, -6 dB) | sat 1.3, comp 3:1, echo |
| `chest_open` | Kenney RPG `metalLatch` + Kenney RPG `creak3` (x0.85 pitch, -2 dB) + Kenney Digital `lowThreeTone` (x0.8 pitch, LP 3000, -3 dB) | comp 4:1, echo |
| `evolution` | SciFi50 `teleport_02` (x0.8 pitch, LP 4000) + Kenney Sci-Fi `lowFrequency_explosion_000` (-3 dB) + Kenney Digital `lowThreeTone` (x0.7 pitch, LP 3000, -5 dB) | comp 3:1, echo |
| `brazier_break` | 100#2 `metal_hit_01` + Breaking `metal_hit_03` (-3 dB) + Kenney Impact `impactMetal_heavy_001` (LP 800, -3 dB) | sat 1.3, comp 4:1 |
| `boss_spawn` | Creature `roar_01` (x0.6 pitch, LP 1800) + Kenney Sci-Fi `spaceEngineLow_003` (LP 700, -2 dB) + Kenney Sci-Fi `lowFrequency_explosion_000` (-2 dB) | comp 3:1 |
| `game_over` | Kenney Sci-Fi `lowFrequency_explosion_000` (x0.75 pitch) + Kenney Impact `impactBell_heavy_001` (x0.6 pitch, LP 1500, -5 dB) + Kenney Sci-Fi `spaceEngineLow_001` (glide 1 to 0.6, LP 600, -5 dB) | comp 2:1 |
| `victory` | Kenney Impact `impactBell_heavy_002` (x0.75 pitch, LP 2500) + Kenney Sci-Fi `spaceEngineLow_002` (LP 900, -4 dB) | comp 3:1, echo |
| `ui_move` | Kenney Interface `click_005` (LP 3000) + Kenney Interface `drop_003` (-4 dB) |  |
| `ui_confirm` | Kenney RPG `metalLatch` (x0.9 pitch) + Kenney Interface `drop_002` (-3 dB) |  |
| `ui_back` | Kenney Interface `switch_006` (x0.85 pitch, LP 3000) |  |

Rows for the new ids (`pending`):

| id | Source layers (pack `file`, processing) | Dynamics |
|---|---|---|
| `hammer_swing` | 100#2 `air_02` (x0.7 pitch, LP 2000, HP 80) | comp 3:1 |
| `hammer_slam` | Kenney Impact `impactMetal_heavy_000` (LP 1200) + Kenney Sci-Fi `lowFrequency_explosion_001` (LP 500, -1 dB) + Breaking `rock_hit_01` (-5 dB) | sat 1.5, comp 4:1 |
| `pistol_shot` | Bang `shot_01` (LP 7000) + Kenney Sci-Fi `impactMetal_002` (LP 1500, -8 dB) | comp 3:1 |
| `caster_bolt` | Kenney Sci-Fi `laserSmall_004` (x0.9 pitch, LP 3000, HP 150) + Electricity `teleport_1` (LP 2500, HP 300, -9 dB) |  |
| `spore_burst` | Water `slime_15` + Steam `Marker #2` (HP 2500, -4 dB) |  |
| `dodge` | 100#2 `air_01` (LP 5000, HP 300) |  |
| `burn_tick` | Steam `Marker #5` (HP 2500) + RPG `spell_fire_07` (HP 1500, +6 dB) |  |
| `frost_hit` | Kenney Impact `impactGlass_light_002` (x1.2 pitch, HP 1500) + Breaking `glass_hit_02` (-4 dB) |  |
| `electrify_zap` | Kenney Digital `zap1` (x0.9 pitch) + Electricity `groundhit` (-3 dB) |  |
| `decay_hiss` | Steam `Marker #3` (LP 3500, HP 1000) + Water `slime_12` (x0.8 pitch, -6 dB) |  |
| `stun_hit` | Kenney Impact `impactPlate_heavy_000` (LP 2500) + Metal Impact `bing1` (x0.8 pitch, -7 dB) | comp 3:1 |
| `chain_arc` | Kenney Digital `zapThreeToneDown` + Electricity `teleport_1` (HP 1500, -5 dB) |  |
| `kugelblitz_hum` | Electricity `shieldloop` (x1.8 pitch, LP 900, tremolo) + Electricity `crackleelectricityloop` (HP 3000, +20 dB) |  |
| `orbital_warn` | Kenney Sci-Fi `forceField_001` (glide 0.8 to 1.8) + SciFi50 `beep_02` (x0.6 pitch, -3 dB) + SciFi50 `beep_02` (x0.6 pitch, -3 dB) + SciFi50 `beep_02` (x0.6 pitch, -3 dB) |  |
| `orbital_hit` | Kenney Sci-Fi `explosionCrunch_004` (LP 3000) + Kenney Sci-Fi `lowFrequency_explosion_000` | sat 1.4, comp 3:1 |
| `nova_frost` | Breaking `glass_breaking_05` (x1.1 pitch, -1 dB) + Kenney Sci-Fi `forceField_002` (glide 1.6 to 0.8, -4 dB) + Steam `Marker #4` (HP 3000, -5 dB) |  |
| `barrel_explode` | Bang `bang_01` (LP 4000) + Kenney Sci-Fi `lowFrequency_explosion_000` (-1 dB) + Breaking `metal_falling_01` (-6 dB) | sat 1.4, comp 3:1 |
| `crate_break` | Breaking `wood_breaking_03` + Kenney Impact `impactPlate_light_001` (-6 dB) | comp 3:1 |
| `pylon_use` | Electricity `powerup` (x0.75 pitch, LP 3500) + Kenney Sci-Fi `forceField_000` (-3 dB) |  |
| `elite_spawn` | Creature `roar_02` (x0.6 pitch) + Kenney Impact `impactMetal_heavy_003` (LP 800, -3 dB) + Kenney Sci-Fi `spaceEngineLow_000` (LP 600, -6 dB) | comp 3:1 |
| `elite_die` | Kenney Sci-Fi `explosionCrunch_001` (x0.85 pitch, LP 2500, -2 dB) + Creature#2 `die_03` (x0.6 pitch, -1 dB) + Kenney Impact `impactMetal_heavy_004` (-4 dB) | comp 3:1 |
| `equip_drop` | Kenney Impact `impactMetal_medium_001` (LP 3500) + Metal Impact `clink3` (-3 dB) |  |
| `equip_pick` | Kenney RPG `metalLatch` + Metal Impact `clink2` (x1.2 pitch, -3 dB) |  |
| `equip_swap` | RPG `lock_01` + RPG `chain_02` (-4 dB) |  |
| `drone_shot` | Kenney Sci-Fi `laserSmall_001` (x0.85 pitch, LP 4500) |  |
| `sergeant_burst` | Bang `shot_02` (x0.8 pitch) + Bang `shot_02` (x0.8 pitch) + Bang `shot_02` (x0.8 pitch) | comp 2:1 |
| `welder_charge` | Electricity `chargestart` (glide 0.8 to 1.5, LP 6000, HP 500) + Electricity `crackleelectricityloop` (HP 3000, +20 dB) |  |
| `carrier_burst` | Kenney Sci-Fi `spaceEngineSmall_003` (LP 2000, -2 dB) + Water `slime_15` (x0.8 pitch) + Kenney Sci-Fi `impactMetal_003` (LP 700, -6 dB) | comp 3:1 |
| `vire_blink` | SciFi50 `teleport_01` (x0.8 pitch) + Electricity `teleport_1` (glide 1.3 to 0.8, LP 4000, -4 dB) |  |
| `tentacle_emerge` | Meat `rippingintomeat_0` + Mud `mud_17` (x0.7 pitch, -1 dB) | comp 3:1 |
| `boss_intro` | Kenney Sci-Fi `spaceEngineLow_004` (LP 800, -1 dB) + Chanting `chant12` (x0.6 pitch, LP 2500, -3 dB) + Kenney Sci-Fi `lowFrequency_explosion_000` | comp 3:1 |
| `boss_slam` | Kenney Impact `impactMetal_heavy_002` (x0.8 pitch, LP 1000) + Kenney Sci-Fi `lowFrequency_explosion_000` (x0.8 pitch) + Breaking `rock_falling_03` (-4 dB) | sat 1.5, comp 4:1 |
| `the_first_roar` | Monsters `monster-8` (x0.5 pitch, LP 2500) + Creature `roar_01` (x0.5 pitch, -2 dB) + Chanting `chant21` (x0.5 pitch, LP 2000, -4 dB) + Kenney Sci-Fi `spaceEngineLow_001` (LP 600, -5 dB) + Kenney Sci-Fi `lowFrequency_explosion_000` (-1 dB) | sat 1.3, comp 3:1 |

| track | Source | Loop handling / processing |
|---|---|---|
| `menu` | Paul Wortmann, Dark Cavern Ambient `dark_cavern_ambient_001` (2 min drone) | 25.73 s repeat from 25.84 s, 1.5 s seam cross-fade |
| `forest` | Hazmat Harry, Nuclear Cave (Loop) `nuclear_cave_0` (heavy bass pulse) | 25.79 s repeat from 33.66 s, 0.12 s cross-fade, lowpass 7 kHz |
| `library` | SRG774, Dark Sci-Fi Audio Pack `pulse_0` (60 BPM bass pulse) | 8 bars (32.07 s) from 11.13 s, 0.12 s cross-fade |
| `boss` | Pro Sensory, Dark Forces (Loop) `dark_forces_loop_0` (about 140 BPM) | 16 bars (27.49 s) from 89.19 s, 0.1 s cross-fade; heartbeat (bart `heartbeat_slow_0`, 15 beats per loop, -6 dB, lowpass 300) and a distorted low choir (OwlishMedia `chant12`, pitch x0.7, -14 dB) laid on top, wrapping over the seam |
| `final` | MintoDog, Heavy Boss Battle 2 (110 BPM) | 8 bars from 104.43 s, pitched down x0.9 (19.43 s), lowpass 5 kHz, tanh drive 1.6, 0.1 s cross-fade; fast heartbeat (17 beats per loop) and two choir voices (`chant21`, pitch x0.6) |
| `gameover` | Paul Wortmann, Dark Cavern Ambient `dark_cavern_ambient_002` | 5.6 s from 40 s, pitch x0.85, 0.4 s fade-in, 2.2 s fade-out, one distorted choir voice (`chant3`, pitch x0.6) |
| `victory` | SRG774, Dark Sci-Fi Audio Pack `victory_4` | 5.8 s, 1.0 s fade-out |

Loop points were found by correlating the loudness envelope (four bands, 100 Hz) of the source with itself: the start
and length with the best repeat of a 6 s window. The picks were made from file names, durations, tempo and spectra,
not by ear: listen to them and swap a row in `tools/import_audio.py` if one does not feel right.
