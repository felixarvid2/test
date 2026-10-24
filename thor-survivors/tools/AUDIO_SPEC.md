# Thor Survivors: audio specification (brief for the sound generator)

Thor Survivors is a Vampire Survivors-style auto-shooter for a handheld Android console. Hundreds of enemies, constant
weapon fire and pickups, so every sound is **short, punchy, readable at low volume and non-fatiguing**. Style: dark
fantasy with a chiptune / 8-16-bit flavour (square, triangle and noise voices, light bit-crush), not orchestral.
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
| Bitrate | quality 4 (about 128 kbps) is plenty | quality 3 (about 112 kbps) |
| Loudness | peak at **-1 dBFS**, punchy, about **-12 LUFS** short-term for the loud ones (hit/explosion class) | **-16 LUFS integrated**, true peak <= -1 dBFS |
| Silence | no leading silence (the sound must start on sample 0), no long tail of silence | none at the loop point |
| Size | under 60 KB each (total assets budget: under 3 MB) | loops 15-40 s, under 450 KB each |

Never clip. Tails must reach silence by the last sample (the file may be faded out over its last few ms).

### Loops (menu, forest, library, boss)

Seamless loops: the length is a whole number of bars (the sample count must equal the exact bar length so the end
joins the start), reverb/delay tails wrap around into the beginning, the file starts and ends on the same energy.
Test by looping the file in an editor: no click, no gap, no jump in level. `gameover` and `victory` are one-shot
stingers and are not looped.

### manifest.json

```json
{
  "version": 1,
  "sfx":   { "whip": { "file": "sfx/whip.ogg", "volume": 0.8, "pitchVar": 0.06 } },
  "music": { "menu": { "file": "music/menu.ogg", "volume": 0.8, "loop": true } }
}
```

* `file` is relative to `audio/`. If an sfx id has no manifest entry the game still tries `sfx/<id>.ogg` at volume 1.
* `volume` (0 to 1.5, default 1) is the base gain, a mixing aid on top of the player's volume setting.
* `pitchVar` (default 0.06, i.e. +/-6 %) is the random pitch variation per play; set 0 for UI sounds.
* `loop` (music only) defaults to true; the stingers are never looped.
* A missing file, or an entry whose file is missing, is silent; a broken manifest falls back to the default paths.

## Sound effect ids

The ids are the file names; they are defined in `game/SoundEvents.java` (`NAMES`). Length is a target; stay within
the range. "Rate" is how often the game can ask for the sound (it is rate limited per id; see the last column), so
sounds that fire constantly must be quiet, short and not tonal-annoying.

| id | When | Length | Style |
|---|---|---|---|
| `whip` | Whip / Bloody Tear swings (every ~1 s, alternating sides) | 0.2-0.3 s | Fast leathery swoosh with a sharp snap at the end |
| `magic_missile` | Magic Wand / Holy Wand fires | 0.15-0.25 s | Rising zappy blip, bright, slight vibrato |
| `knife` | Knife / Thousand Edge throw (many per second) | 0.1-0.15 s | Tiny metallic whoosh/tick, very short, high |
| `axe` | Axe / Death Spiral thrown | 0.25-0.35 s | Heavy low whoosh, rotating feel |
| `cross` | Cross / Heaven Sword (boomerang) | 0.3-0.45 s | Holy hum with tremolo, pitch arcs up and back |
| `bible` | King Bible orbit starts | 0.4-0.6 s | Soft magical page-flip + chime, gentle |
| `fireball` | Fire Wand / Hellfire cast | 0.3-0.4 s | Whoosh with crackle, low-mid |
| `garlic` | Garlic / Soul Eater damage tick (about every 1 s) | 0.15-0.25 s | **Quiet**, soft low pulse/thrum; must not annoy when repeated |
| `holy_water` | Santa Water flask lands | 0.3-0.45 s | Glassy splash with a short sparkle |
| `lightning` | Lightning Ring strike (several at once) | 0.35-0.5 s | Electric crack + short rumble, fast attack |
| `enemy_hit` | An enemy takes damage (dozens per second) | 0.05-0.1 s | **Tiny** dull thud/tick, quiet, no pitch character |
| `enemy_death` | An enemy dies (dozens per second) | 0.15-0.25 s | Short pop/puff, descending, quiet-mid |
| `player_hurt` | The player is hit | 0.25-0.35 s | Low distinct buzz/grunt-like hit, clearly louder than enemy sounds |
| `gem` | XP gem pickup | 0.08-0.12 s | Bright blip at a **mid pitch (about C6)**; the game raises it up a major scale (to +1 octave) for gems collected within 0.4 s of each other, so keep it clean and tonal, a single pitch without vibrato |
| `coin` | Gold coin / bag pickup (also Vacuum, Orologion, Rosary, Clover) | 0.15-0.25 s | Classic two-note coin ding |
| `level_up` | Level up | 0.5-0.8 s | Cheerful rising arpeggio fanfare, 4-5 notes |
| `chest_open` | Treasure chest opened | 0.8-1.1 s | Creaky lid, then a sparkling reveal |
| `evolution` | A weapon evolves (played on top of `chest_open`) | 1.4-2.0 s | Big magical power-up sweep ending in a bright chord: the most epic sound |
| `brazier_break` | Brazier / candelabra smashed | 0.3-0.45 s | Crunchy wood/metal crash with a low thump |
| `food_heal` | Roast chicken eaten | 0.25-0.4 s | Soft warm rising two/three-note chime |
| `boss_spawn` | A boss appears | 1.0-1.6 s | Ominous low horn/drone + rumble; the loudest "warning" |
| `game_over` | The player dies (together with the `gameover` stinger) | 0.8-1.4 s | Heavy descending doom impact |
| `victory` | The run is won (together with the `victory` stinger) | 1.2-1.8 s | Bright triumphant brass-like hit |
| `ui_move` | Menu cursor moves / a setting changes | 0.03-0.06 s | Soft tick |
| `ui_confirm` | Menu confirm | 0.08-0.15 s | Short two-note up blip |
| `ui_back` | Menu back / refused action | 0.07-0.12 s | Short down blip |

Rate limits applied by the game (so the generator need not worry about overlap): per 100 ms at most `whip` 2,
`magic_missile` 3, `knife` 3, `axe` 2, `cross` 2, `bible` 1, `fireball` 3, `garlic` 1 (and 0.4 s apart),
`holy_water` 2, `lightning` 3, `enemy_hit` 3 (30 ms apart), `enemy_death` 4 (20 ms apart), `player_hurt` 1 (0.2 s
apart), `gem` 3, `coin` 3, `ui_*` 2, all others 1. Beyond that, the oldest voice of the same id is cut.

## Music tracks

Played with a 1.4 s fade-in and a 0.9 s fade-out when the track changes (a cross-fade). Music is ducked to 45 %
while the game is paused, at level-up and at chests. It sits **under** the sound effects: no loud transients,
restrained mid frequencies (the SFX live around 1-5 kHz), no vocals.

| track | When | Length | Loop | Style |
|---|---|---|---|---|
| `menu` | Main menu and power-up shop | 20-40 s | yes | Slow, mysterious, minor key, about 80-95 BPM, soft arpeggios and pad, inviting |
| `forest` | Mad Forest stage | 15-40 s | yes | Driving dark-fantasy chiptune, minor, 120-140 BPM, steady bass and drums, memorable lead |
| `library` | Library stage | 15-40 s | yes | Dusty, eerie, harpsichord/organ feel, phrygian or minor, 100-115 BPM |
| `boss` | While a boss is alive (optional; the stage track plays if it is missing) | 12-30 s | yes | Intense, fast (150+ BPM), tense, more drums |
| `gameover` | Result screen after dying | 3-6 s | no (stinger) | Sad descending minor phrase ending on a held chord |
| `victory` | Result screen after winning | 4-7 s | no (stinger) | Triumphant major fanfare ending on a held chord |

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

The shipped audio is real CC0 material, produced by `tools/import_audio.py` (one table row per id: source file, trim,
gain, filters, layers; re-run it to rebuild everything, `--only whip,menu` for a few). The script writes the files,
`manifest.json` volumes and `CREDITS.txt` (every source file with pack, author, licence and URL). Local sources are
in `../assets/audio` (Kenney packs, each with a CC0 `License.txt`; the Abstraction Music Loop Bundle, CC0); downloaded
ones are in `art-src/audio/<pack>/` with a `SOURCE.md` (URL, author, licence, date): rubberduck's CC0 packs, Heavy
Dungeon, the two MonsterVania tracks, the "No Hope" game-over theme and a church organ fanfare, all from
OpenGameArt.org with "License(s): CC0" on the page. The `400 Sounds Pack` (Chequered Ink) is not used: its itch.io
page grants free use in games but with its own terms (no resale of the unaltered files), not CC0, and the folder has
no licence file.

Processing: sound effects are trimmed to start on sample 0, layered where one recording is not enough, filtered,
lightly compressed where they should punch (`comp`), faded out to silence, peak-normalised and encoded Vorbis q4;
the script decodes each file again and backs the gain off until the decoded peak is <= -1 dBFS. Music is gain-set to
-16 LUFS integrated with a soft peak limit and checked on the decoded file (true peak <= -1 dBTP). Loops are cut to
whole bars (sample count = exact bar length) and the seam is cross-faded 80 ms against the audio just before the
start of the section, then the last 30 ms are eased onto the first sample so the wrap has no step. The Abstraction
loop (`menu`) is already an exact loop and is used whole (plus the 30 ms easing).

| id | Source (pack: file) | Note |
|---|---|---|
| `whip` | RPG SFX: `blade_02` | swoosh, high-passed |
| `magic_missile` | Kenney Digital Audio: `phaserUp5` | rising zap |
| `knife` | Kenney RPG Audio: `knifeSlice2` | first 0.14 s, high-passed |
| `axe` | 100 CC0 SFX #2: `air_02` | low-passed, compressed for weight |
| `cross` | 50 CC0 Sci-Fi SFX: `teleport_02` | the swell around its peak |
| `bible` | Kenney RPG Audio: `bookFlip2` + RPG SFX `item_gem_04` | page flip with a soft chime |
| `fireball` | RPG SFX: `spell_fire_06` | |
| `garlic` | Water SFX: `bubble_02` | low-passed soft pulse |
| `holy_water` | Breaking SFX: `glass_hit_01` + Water SFX `splash_02` | |
| `lightning` | Kenney Digital Audio: `zap2` + 100 CC0 SFX #2 `thunder_01` (the crack) | |
| `enemy_hit` | Kenney Impact: `impactSoft_medium_000` | 0.08 s, low-passed |
| `enemy_death` | Water SFX: `slime_12` | |
| `player_hurt` | RPG SFX: `creature_hurt_01` + Kenney Impact `impactPunch_medium_000` | |
| `gem` | Kenney Interface: `pluck_002` | re-tuned to C6 (1046.5 Hz), single pitch |
| `coin` | RPG SFX: `item_coins_01` | |
| `level_up` | Kenney Music Jingles: `NES03` | rising 4 notes |
| `chest_open` | Kenney RPG Audio: `creak3` + RPG SFX `item_gem_04` | creak, then sparkle |
| `evolution` | Kenney Music Jingles: `STEEL02` + RPG SFX `spell_fire_03` (sweep) | |
| `brazier_break` | Breaking SFX: `wood_breaking_02` + 100 CC0 SFX #2 `metal_hit_01` + Kenney Impact `impactWood_heavy_000` | |
| `food_heal` | Kenney Music Jingles: `PIZZI08` | |
| `boss_spawn` | RPG SFX: `creature_roar_02` + Bang SFX `bang_03` + Kenney Impact `impactBell_heavy_000` | |
| `game_over` | Kenney Music Jingles: `SAX07` (descending) + Kenney Impact `impactBell_heavy_001` | |
| `victory` | Kenney Music Jingles: `SAX02` (ascending) with a tail echo | 1.15 s, a little under the table |
| `ui_move` / `ui_confirm` / `ui_back` | Kenney Interface: `tick_004` / `confirmation_001` / `back_002` | |

| track | Source | Loop handling |
|---|---|---|
| `menu` | Abstraction, "Dark Portents: MYSTERIOUS TRAVELER" (36.85 s) | the pack's own exact loop, used whole |
| `forest` | HydroGene, MonsterVania 8-bit #1 Stage 1 (about 93 BPM, double-time drive) | 10 bars (25.8 s) from 10.26 s |
| `library` | HydroGene, MonsterVania Ghost Land (100 BPM) | 8 bars (19.2 s) from 2.78 s |
| `boss` | MintoDog, Heavy Dungeon (160 BPM, organ and guitar) | 16 bars (24.0 s) from 12.0 s |
| `gameover` | Cleyton Kauffman, "No Hope" | first 5.6 s, 1.6 s fade |
| `victory` | church organ fanfare (ARoachIFoundOnMyPillow) | first 4.6 s, 0.6 s fade |

The picks were made from file names, durations, envelopes, pitch tracks and spectra, not by ear: listen to them and
swap a row in `tools/import_audio.py` if one does not feel right.
