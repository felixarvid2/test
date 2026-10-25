#!/usr/bin/env python3
"""Builds the shipped audio of Thor Survivors (ASHFALL: Lumen Tide, dark industrial sci-fi horror) from CC0 sources.

    python3 tools/import_audio.py [--out app/src/main/assets/audio] [--only whip,menu] [--keep-wav DIR]

Reads the source files named in the tables below, trims / layers / pitches down / filters / distorts them, normalises
to tools/AUDIO_SPEC.md (SFX: mono 44.1 kHz, peak -1 dBFS, no leading silence; music: stereo 44.1 kHz, -16 LUFS
integrated, true peak <= -1 dBTP, loops cut with the seam cross-faded) and encodes Ogg Vorbis with ffmpeg. Writes
audio/sfx/<id>.ogg, audio/music/<track>.ogg, audio/manifest.json and audio/CREDITS.txt (every source file actually
used, with pack, author, licence and URL). Needs numpy and ffmpeg (libvorbis).

Sources: the local CC0 library ../assets/audio (Kenney packs) and the downloaded CC0 packs in
art-src/audio/<pack>/ (each with SOURCE.md: URL, author, licence, date). Do NOT run tools/make_placeholder_sfx.py
afterwards: it overwrites these files with the synthesised placeholders.

How the dark tone is made (all per row below, nothing else is applied):
  rate   pitch (and speed) ratio, 0.6 = 7.4 semitones down (asetrate): heavier, slower, more menacing
  glide  (r0, r1) pitch ratio that moves linearly over the sound: risers (1 -> 1.8) and doom drops (1 -> 0.6)
  af     ffmpeg filter chain applied after the pitch change: lowpass (muffled, heavy), highpass, tremolo (drone whirr),
         afade (swells)
  sat    tanh soft clip (distortion: more body, same peak);  comp: compressor;  echo: aecho tail (cheap reverb)
  gain   layer level in dB;  at: layer offset in the result (s);  start/dur: slice of the source (s)
Everything is deterministic: same sources, same output. To change a sound edit its row and re-run; `--only` rebuilds a
few ids. SFX ids in SFX are wired in the game (SoundEvents); the ids in SFX_PENDING (design section 12) are built
and listed under "pending" in manifest.json until the code uses them: move an id to "sfx" then.
"""
import argparse
import datetime
import json
import os
import re
import subprocess
import sys

import numpy as np

SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)  # thor-survivors/
LOCAL = os.path.normpath(os.path.join(ROOT, "..", "assets", "audio"))
ONLINE = os.path.join(ROOT, "art-src", "audio")
OGA = "https://opengameart.org/content/"
KENNEY = "Kenney Vleugels (Kenney.nl)"
CC0 = "CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/)"

# key -> (directory, pack, author, URL, licence note)
PACKS = {
    "rpg-audio": (os.path.join(LOCAL, "rpg-audio", "Audio"), "Kenney RPG Audio", KENNEY,
                  "https://kenney.nl/assets/rpg-audio", CC0 + ", License.txt in the pack"),
    "impact": (os.path.join(LOCAL, "impact-sounds", "Audio"), "Kenney Impact Sounds", KENNEY,
               "https://kenney.nl/assets/impact-sounds", CC0 + ", License.txt in the pack"),
    "interface": (os.path.join(LOCAL, "interface-sounds", "Audio"), "Kenney Interface Sounds", KENNEY,
                  "https://kenney.nl/assets/interface-sounds", CC0 + ", License.txt in the pack"),
    "digital": (os.path.join(LOCAL, "digital-audio", "Audio"), "Kenney Digital Audio", KENNEY,
                "https://kenney.nl/assets/digital-audio", CC0 + ", License.txt in the pack"),
}
# downloaded packs: key -> (art-src folder, pack title, author, OpenGameArt page slug)
for key, slug, pack, author, page in [
    ("rd-rpg", "rubberduck-80-cc0-rpg-sfx", "80 CC0 RPG SFX", "rubberduck", "80-cc0-rpg-sfx"),
    ("rd-water", "rubberduck-40-cc0-water-splash-slime-sfx", "40 CC0 water / splash / slime SFX", "rubberduck",
     "40-cc0-water-splash-slime-sfx"),
    ("rd-bang", "rubberduck-25-cc0-bang-firework-sfx", "25 CC0 bang / firework SFX", "rubberduck",
     "25-cc0-bang-firework-sfx"),
    ("rd-breaking", "rubberduck-75-cc0-breaking-falling-hit-sfx", "75 CC0 breaking / falling / hit sfx", "rubberduck",
     "75-cc0-breaking-falling-hit-sfx"),
    ("rd-100v2", "rubberduck-100-cc0-sfx-2", "100 CC0 SFX #2", "rubberduck", "100-cc0-sfx-2"),
    ("rd-scifi", "rubberduck-50-cc0-sci-fi-sfx", "50 CC0 Sci-Fi SFX", "rubberduck", "50-cc0-sci-fi-sfx"),
    ("rd-creature", "rubberduck-80-cc0-creature-sfx", "80 CC0 creature SFX", "rubberduck", "80-cc0-creature-sfx"),
    ("rd-creature2", "rubberduck-80-cc0-creature-sfx-2", "80 CC0 creture SFX #2", "rubberduck",
     "80-cc0-creture-sfx-2"),
    ("rd-mud", "rubberduck-25-cc0-mud-sfx", "25 CC0 mud sfx", "rubberduck", "25-cc0-mud-sfx"),
    ("ksci", "kenney-sci-fi-sounds", "Sci-Fi Sounds (Kenney, OpenGameArt copy)", KENNEY, "sci-fi-sounds"),
    ("steam", "bart-steam-release-sounds", "Steam release sounds", "bart", "steam-release-sounds"),
    ("heartbeat", "bart-heartbeat-sounds", "Heartbeat sounds", "bart", "heartbeat-sounds"),
    ("elec", "faxcorp-electricity-game-sound-pack", "Electricity Game Sound Pack", "faxcorp",
     "electricity-game-sound-pack"),
    ("metalimp", "bmaczero-metal-impact-sounds", "Metal Impact Sounds", "BMacZero", "metal-impact-sounds"),
    ("monsters", "ogrebane-monster-sound-effects-pack", "Monster Sound Effects Pack", "Ogrebane",
     "monster-sound-effects-pack"),
    ("meat", "eldritch-grim-ripping-into-meat", "Ripping Into Meat", "Eldritch Grim", "ripping-into-meat"),
    ("chant", "owlishmedia-creepy-incoherent-chanting", "Creepy Incoherent Chanting", "OwlishMedia",
     "creepy-incoherent-chanting"),
    ("nuclear", "hazmat-harry-nuclear-cave-loop", "Nuclear Cave (Loop)", "Hazmat Harry", "nuclear-cave-loop"),
    ("darkscifi", "srg774-dark-sci-fi-audio-pack", "Dark Sci-Fi Audio Pack", "SRG774", "dark-sci-fi-audio-pack"),
    ("cavern", "paulwortmann-dark-cavern-ambient", "Dark Cavern Ambient", "Paul Wortmann", "dark-cavern-ambient"),
    ("forces", "prosensory-dark-forces-loop", "Dark Forces (Loop)", "Pro Sensory", "dark-forcesloop"),
    ("hbb2", "mintodog-heavy-boss-battle-2", "Heavy Boss Battle 2", "MintoDog", "heavy-boss-battle-2"),
]:
    PACKS[key] = (os.path.join(ONLINE, slug), pack, author, OGA + page, "CC0 (OpenGameArt page, see SOURCE.md)")

USED = {}  # (pack key, file) -> True, collected for CREDITS.txt


def src(pack, name):
    d = PACKS[pack][0]
    p = os.path.join(d, name)
    if not os.path.isfile(p):
        sys.exit("missing source file: %s (see art-src/audio/*/SOURCE.md)" % p)
    USED[(pack, name)] = True
    return p


# ------------------------------------------------------------------ layer spec helpers

def L(pack, name, start=0.0, dur=None, gain=0.0, at=0.0, af=None, tune=None, rate=1.0, glide=None):
    """One source layer: file, trim start/dur (s of the source), gain_db, offset `at` in the result, `rate` pitch ratio,
    `glide` (r0, r1) moving pitch ratio, ffmpeg -af chain (after the pitch change) and `tune` = Hz the dominant pitch
    is re-tuned to (gem)."""
    return dict(pack=pack, name=name, start=start, dur=dur, gain=gain, at=at, af=af, tune=tune, rate=rate, glide=glide)


# id -> layers, max length (s), end fade (s), saturation drive, compressor ratio, tail echo, manifest volume, pitchVar.
# Lengths follow the table in AUDIO_SPEC.md; choices are explained there.
SFX = {
    # ---- weapons (the 26 wired ids keep their names; the sounds are re-picked for the new world)
    "whip": dict(layers=[L("rd-rpg", "blade_02.ogg", 0, 0.30, 0, af="highpass=f=300,lowpass=f=6500"),
                         L("ksci", "laserRetro_003.ogg", 0, 0.24, -6, at=0.07, af="highpass=f=1200,lowpass=f=7000")],
                 max=0.30, fade=0.04, sat=1.8, comp=3, vol=0.8),  # vibro lash: swoosh + electric snap
    "magic_missile": dict(layers=[L("rd-water", "slime_04.ogg", 0, 0.25, 0, rate=0.85, af="lowpass=f=5000"),
                                  L("ksci", "laserSmall_000.ogg", 0, 0.2, -3, af="lowpass=f=1800")],
                          max=0.22, fade=0.05, comp=3, vol=0.7),  # spore dart: wet thwip
    "knife": dict(layers=[L("rpg-audio", "knifeSlice2.ogg", 0, 0.12, 0, af="highpass=f=2500"),
                          L("rpg-audio", "metalLatch.ogg", 0, 0.08, -8, af="highpass=f=3000")],
                  max=0.13, fade=0.04, vol=0.75),  # scalpel throw
    "axe": dict(layers=[L("ksci", "impactMetal_001.ogg", 0, 0.34, 0, af="lowpass=f=900"),
                        L("ksci", "lowFrequency_explosion_001.ogg", 0, 0.4, -4, rate=0.9, af="lowpass=f=450")],
                max=0.34, fade=0.1, comp=4, sat=1.5, vol=0.85),  # grenade thunk
    "cross": dict(layers=[L("ksci", "engineCircular_002.ogg", 0, 0.5, 0,
                            af="lowpass=f=3200,tremolo=f=24:d=0.8,afade=t=in:d=0.08")],
                  max=0.42, fade=0.15, vol=0.65),  # drone whirr
    "bible": dict(layers=[L("ksci", "forceField_002.ogg", 0, 0.57, 0, af="lowpass=f=1400,afade=t=in:d=0.1")],
                  max=0.55, fade=0.2, vol=0.6),  # ward drone hum
    "fireball": dict(layers=[L("rd-bang", "cannon_02.ogg", 0, 0.5, 0, rate=0.8, af="lowpass=f=1800"),
                             L("ksci", "lowFrequency_explosion_001.ogg", 0, 0.4, -2, af="lowpass=f=500")],
                     max=0.38, fade=0.12, comp=4, sat=1.4, vol=0.9),  # slag cannon boom
    "garlic": dict(layers=[L("steam", "steam hisses - Marker #3.wav", 0.05, 0.3, 0,
                             af="highpass=f=1200,lowpass=f=5000,afade=t=in:d=0.05")],
                   max=0.22, fade=0.08, vol=0.45),  # toxic vent hiss (quiet, repeats every second)
    "holy_water": dict(layers=[L("rd-breaking", "bfh1_glass_breaking_02.ogg", 0, 0.3, -2),
                               L("steam", "steam hisses - Marker #1.wav", 0, 0.45, -3, at=0.06,
                                 af="highpass=f=2500")],
                       max=0.42, fade=0.15, comp=3, vol=0.8),  # flask shatter + acid sizzle
    "lightning": dict(layers=[L("digital", "zap2.ogg", 0, 0.4, -2),
                              L("elec", "hit.wav", 0, 0.5, -3, af="lowpass=f=5000"),
                              L("rd-100v2", "sfx100v2_thunder_01.ogg", 0.97, 0.5, -6, af="lowpass=f=2500")],
                      max=0.5, fade=0.14, comp=2, sat=1.3, vol=0.9),  # arc coil zap
    # ---- impacts and pickups
    "enemy_hit": dict(layers=[L("impact", "impactPunch_medium_001.ogg", 0, 0.09, 0, af="lowpass=f=2500"),
                              L("impact", "impactMetal_light_000.ogg", 0, 0.07, -9, af="lowpass=f=4000")],
                      max=0.08, fade=0.03, vol=0.5),  # meaty / metal
    "enemy_death": dict(layers=[L("rd-mud", "mud_18.ogg", 0, 0.3, 0, af="lowpass=f=3500"),
                                L("rd-water", "slime_09.ogg", 0, 0.3, -3, rate=0.8)],
                        max=0.24, fade=0.08, comp=4, vol=0.85),  # wet squelch / collapse
    "player_hurt": dict(layers=[L("rd-creature", "grunt_02.ogg", 0, 0.34, 0, af="lowpass=f=2500"),
                                L("impact", "impactPlate_medium_000.ogg", 0, 0.2, -1)],
                        max=0.32, fade=0.08, comp=2, vol=1.0),  # armoured grunt
    "gem": dict(layers=[L("impact", "impactGlass_light_001.ogg", 0, 0.16, 0, tune=1046.5)],
                max=0.11, fade=0.04, vol=0.7),  # crystal chime, re-tuned to C6
    "coin": dict(layers=[L("metalimp", "clink2.wav", 0, 0.14, 0, af="highpass=f=800"),
                         L("metalimp", "clink3.wav", 0, 0.16, -3, at=0.07, rate=1.1)],
                 max=0.25, fade=0.08, comp=3, vol=0.9),  # scrap metal clink
    "food_heal": dict(layers=[L("rpg-audio", "metalLatch.ogg", 0, 0.1, -3, af="lowpass=f=4000"),
                              L("steam", "steam hisses - Marker #4.wav", 0, 0.35, 0, at=0.08,
                                af="highpass=f=2000,afade=t=in:d=0.03")],
                      max=0.36, fade=0.12, vol=0.75),  # injector hiss
    "level_up": dict(layers=[L("digital", "lowThreeTone.ogg", 0, 0.8, 0, af="lowpass=f=3500"),
                             L("impact", "impactMetal_heavy_000.ogg", 0, 0.4, -6, af="lowpass=f=600")],
                     max=0.75, fade=0.2, comp=3, sat=1.3, echo="aecho=0.8:0.6:60|120:0.35|0.2", vol=0.9),
    "chest_open": dict(layers=[L("rpg-audio", "metalLatch.ogg", 0, 0.11, 0),
                               L("rpg-audio", "creak3.ogg", 0, 0.4, -2, at=0.08, rate=0.85),
                               L("digital", "lowThreeTone.ogg", 0, 0.6, -3, at=0.55, rate=0.8,
                                 af="lowpass=f=3000")],
                       max=1.1, fade=0.3, comp=4, echo="aecho=0.8:0.6:70|140:0.35|0.2", vol=1.0),
    "evolution": dict(layers=[L("rd-scifi", "teleport_02.ogg", 0, 1.13, 0, rate=0.8, af="lowpass=f=4000"),
                              L("ksci", "lowFrequency_explosion_000.ogg", 0, 0.9, -3, at=0.85),
                              L("digital", "lowThreeTone.ogg", 0, 0.6, -5, at=1.0, rate=0.7,
                                af="lowpass=f=3000")],
                      max=1.9, fade=0.5, comp=3, echo="aecho=0.8:0.6:90|180:0.35|0.2", vol=1.0),
    "brazier_break": dict(layers=[L("rd-100v2", "sfx100v2_metal_hit_01.ogg", 0, 0.4, 0),
                                  L("rd-breaking", "bfh1_metal_hit_03.ogg", 0, 0.3, -3),
                                  L("impact", "impactMetal_heavy_001.ogg", 0, 0.35, -3, af="lowpass=f=800")],
                          max=0.42, fade=0.12, comp=4, sat=1.3, vol=0.85),  # barrel break
    "boss_spawn": dict(layers=[L("rd-creature", "roar_01.ogg", 0, 0.55, 0, rate=0.6, af="lowpass=f=1800"),
                               L("ksci", "spaceEngineLow_003.ogg", 0, 1.4, -2,
                                 af="afade=t=in:d=0.5,lowpass=f=700"),
                               L("ksci", "lowFrequency_explosion_000.ogg", 0, 0.95, -2, at=0.05)],
                       max=1.5, fade=0.5, comp=3, vol=1.0),  # deep horn / roar
    "game_over": dict(layers=[L("ksci", "lowFrequency_explosion_000.ogg", 0, 0.95, 0, rate=0.75),
                              L("impact", "impactBell_heavy_001.ogg", 0, 1.3, -5, rate=0.6, af="lowpass=f=1500"),
                              L("ksci", "spaceEngineLow_001.ogg", 0, 1.3, -5, glide=(1.0, 0.6),
                                af="lowpass=f=600")],
                      max=1.3, fade=0.4, comp=2, vol=0.95),  # descending doom
    "victory": dict(layers=[L("impact", "impactBell_heavy_002.ogg", 0, 1.2, 0, rate=0.75, af="lowpass=f=2500"),
                            L("ksci", "spaceEngineLow_002.ogg", 0, 1.3, -4, af="afade=t=in:d=0.3,lowpass=f=900")],
                    max=1.3, fade=0.4, comp=3, echo="aecho=0.8:0.8:120|240|360:0.6|0.45|0.3", vol=0.9),
    "ui_move": dict(layers=[L("interface", "click_005.ogg", 0, 0.03, 0, af="lowpass=f=3000"),
                            L("interface", "drop_003.ogg", 0, 0.06, -4)],
                    max=0.05, fade=0.012, vol=0.5, pitchVar=0.0),
    "ui_confirm": dict(layers=[L("rpg-audio", "metalLatch.ogg", 0, 0.11, 0, rate=0.9),
                               L("interface", "drop_002.ogg", 0, 0.06, -3, at=0.07)],
                       max=0.14, fade=0.03, vol=0.6, pitchVar=0.0),
    "ui_back": dict(layers=[L("interface", "switch_006.ogg", 0, 0.12, 0, rate=0.85, af="lowpass=f=3000")],
                    max=0.1, fade=0.03, vol=0.6, pitchVar=0.0),
    "hammer_swing": dict(layers=[L("rd-100v2", "sfx100v2_air_02.ogg", 0, 0.4, 0, rate=0.7,
                                   af="lowpass=f=2000,highpass=f=80")],
                         max=0.4, fade=0.12, comp=3, vol=0.8),
    "hammer_slam": dict(layers=[L("impact", "impactMetal_heavy_000.ogg", 0, 0.4, 0, af="lowpass=f=1200"),
                                L("ksci", "lowFrequency_explosion_001.ogg", 0, 0.5, -1, af="lowpass=f=500"),
                                L("rd-breaking", "bfh1_rock_hit_01.ogg", 0, 0.4, -5, at=0.02)],
                        max=0.5, fade=0.2, comp=4, sat=1.5, vol=1.0),
    "pistol_shot": dict(layers=[L("rd-bang", "shot_01.ogg", 0, 0.25, 0, af="lowpass=f=7000"),
                                L("ksci", "impactMetal_002.ogg", 0, 0.1, -8, af="lowpass=f=1500")],
                        max=0.22, fade=0.08, comp=3, vol=0.85),
    "caster_bolt": dict(layers=[L("ksci", "laserSmall_004.ogg", 0, 0.34, 0, rate=0.9, af="highpass=f=150,lowpass=f=3000"),
                                L("elec", "teleport_1.wav", 0, 0.4, -9, af="highpass=f=300,lowpass=f=2500")],
                        max=0.3, fade=0.1, vol=0.75),
    "spore_burst": dict(layers=[L("rd-water", "slime_15.ogg", 0, 0.34, 0),
                                L("steam", "steam hisses - Marker #2.wav", 0, 0.4, -4, at=0.05, af="highpass=f=2500")],
                        max=0.4, fade=0.15, vol=0.8),
    "dodge": dict(layers=[L("rd-100v2", "sfx100v2_air_01.ogg", 0, 0.3, 0, af="highpass=f=300,lowpass=f=5000")],
                  max=0.25, fade=0.1, vol=0.6),
    # ---- statuses, destructibles and the enemy roster (wired in design phases 5 to 7)
    "burn_tick": dict(layers=[L("steam", "steam hisses - Marker #5.wav", 0, 0.15, 0, af="highpass=f=2500"),
                              L("rd-rpg", "spell_fire_07.ogg", 0, 0.2, 6, af="highpass=f=1500")],
                      max=0.14, fade=0.05, vol=0.4),
    "frost_hit": dict(layers=[L("impact", "impactGlass_light_002.ogg", 0, 0.25, 0, rate=1.2, af="highpass=f=1500"),
                              L("rd-breaking", "bfh1_glass_hit_02.ogg", 0, 0.2, -4)],
                      max=0.22, fade=0.08, vol=0.7),
    "electrify_zap": dict(layers=[L("digital", "zap1.ogg", 0, 0.25, 0, rate=0.9),
                                  L("elec", "groundhit.wav", 0, 0.17, -3)],
                          max=0.22, fade=0.06, vol=0.7),
    "decay_hiss": dict(layers=[L("steam", "steam hisses - Marker #3.wav", 0, 0.5, 0,
                                 af="highpass=f=1000,lowpass=f=3500,afade=t=in:d=0.08"),
                               L("rd-water", "slime_12.ogg", 0, 0.14, -6, at=0.1, rate=0.8)],
                       max=0.38, fade=0.15, vol=0.5),
    "stun_hit": dict(layers=[L("impact", "impactPlate_heavy_000.ogg", 0, 0.3, 0, af="lowpass=f=2500"),
                             L("metalimp", "bing1.wav", 0, 0.43, -7, rate=0.8)],
                     max=0.4, fade=0.18, comp=3, vol=0.9),
    "barrel_explode": dict(layers=[L("rd-bang", "bang_01.ogg", 0, 0.63, 0, af="lowpass=f=4000"),
                                   L("ksci", "lowFrequency_explosion_000.ogg", 0, 0.95, -1),
                                   L("rd-breaking", "bfh1_metal_falling_01.ogg", 0, 0.5, -6, at=0.15)],
                           max=0.9, fade=0.3, comp=3, sat=1.4, vol=1.0),
    "crate_break": dict(layers=[L("rd-breaking", "bfh1_wood_breaking_03.ogg", 0, 0.5, 0),
                                L("impact", "impactPlate_light_001.ogg", 0, 0.2, -6, at=0.02)],
                        max=0.45, fade=0.15, comp=3, vol=0.8),
    "pylon_use": dict(layers=[L("elec", "powerup.wav", 0, 0.86, 0, rate=0.75, af="lowpass=f=3500"),
                              L("ksci", "forceField_000.ogg", 0, 0.57, -3, at=0.3)],
                      max=0.9, fade=0.3, vol=0.8),
    "drone_shot": dict(layers=[L("ksci", "laserSmall_001.ogg", 0, 0.24, 0, rate=0.85, af="lowpass=f=4500")],
                       max=0.2, fade=0.07, vol=0.5),
    "sergeant_burst": dict(layers=[L("rd-bang", "shot_02.ogg", 0, 0.15, 0, rate=0.8),
                                   L("rd-bang", "shot_02.ogg", 0, 0.15, 0, rate=0.8, at=0.09),
                                   L("rd-bang", "shot_02.ogg", 0, 0.15, 0, rate=0.8, at=0.18)],
                           max=0.4, fade=0.12, comp=2, vol=0.85),
    "welder_charge": dict(layers=[L("elec", "chargestart.wav", 0.4, 1.0, 0, glide=(0.8, 1.5),
                                    af="highpass=f=500,lowpass=f=6000"),
                                  L("elec", "crackleelectricityloop.wav", 0, 0.5, 20, at=0.4, af="highpass=f=3000")],
                          max=0.9, fade=0.15, vol=0.6),
    "carrier_burst": dict(layers=[L("ksci", "spaceEngineSmall_003.ogg", 0, 0.5, -2, af="lowpass=f=2000"),
                                  L("rd-water", "slime_15.ogg", 0, 0.34, 0, at=0.05, rate=0.8),
                                  L("ksci", "impactMetal_003.ogg", 0, 0.42, -6, af="lowpass=f=700")],
                          max=0.5, fade=0.18, comp=3, vol=0.85),
    "vire_blink": dict(layers=[L("rd-scifi", "teleport_01.ogg", 0, 0.17, 0, rate=0.8),
                               L("elec", "teleport_1.wav", 0, 0.63, -4, glide=(1.3, 0.8), af="lowpass=f=4000")],
                       max=0.5, fade=0.2, vol=0.7),
    # ---- elites, equipment, tentacles and the boss patterns (design phases 9 and 10)
    "elite_spawn": dict(layers=[L("rd-creature", "roar_02.ogg", 0, 0.62, 0, rate=0.6),
                                L("impact", "impactMetal_heavy_003.ogg", 0, 0.4, -3, af="lowpass=f=800"),
                                L("ksci", "spaceEngineLow_000.ogg", 0, 1.0, -6, af="afade=t=in:d=0.4,lowpass=f=600")],
                        max=1.1, fade=0.35, comp=3, vol=1.0),
    "elite_die": dict(layers=[L("ksci", "explosionCrunch_001.ogg", 0, 1.3, -2, rate=0.85, af="lowpass=f=2500"),
                              L("rd-creature2", "die_03.ogg", 0, 0.5, -1, rate=0.6),
                              L("impact", "impactMetal_heavy_004.ogg", 0, 0.3, -4)],
                      max=1.0, fade=0.4, comp=3, vol=1.0),
    "equip_drop": dict(layers=[L("impact", "impactMetal_medium_001.ogg", 0, 0.3, 0, af="lowpass=f=3500"),
                               L("metalimp", "clink3.wav", 0, 0.16, -3, at=0.1)],
                       max=0.35, fade=0.12, vol=0.8),
    "equip_pick": dict(layers=[L("rpg-audio", "metalLatch.ogg", 0, 0.11, 0),
                               L("metalimp", "clink2.wav", 0, 0.14, -3, at=0.08, rate=1.2)],
                       max=0.25, fade=0.1, vol=0.8),
    "equip_swap": dict(layers=[L("rd-rpg", "lock_01.ogg", 0, 0.27, 0),
                               L("rd-rpg", "chain_02.ogg", 0, 0.28, -4, at=0.05)],
                       max=0.4, fade=0.12, vol=0.75),
    "tentacle_emerge": dict(layers=[L("meat", "rippingintomeat_0.mp3", 3.5, 0.8, 0),
                                    L("rd-mud", "mud_17.ogg", 0, 0.52, -1, rate=0.7)],
                            max=0.7, fade=0.25, comp=3, vol=0.9),
    "boss_intro": dict(layers=[L("ksci", "spaceEngineLow_004.ogg", 0, 2.0, -1, af="afade=t=in:d=0.8,lowpass=f=800"),
                               L("chant", "chant12.wav", 0, 2.0, -3, rate=0.6, af="lowpass=f=2500,afade=t=in:d=0.6"),
                               L("ksci", "lowFrequency_explosion_000.ogg", 0, 0.95, 0, at=1.2)],
                       max=2.0, fade=0.6, comp=3, vol=1.0),
    "boss_slam": dict(layers=[L("impact", "impactMetal_heavy_002.ogg", 0, 0.4, 0, rate=0.8, af="lowpass=f=1000"),
                              L("ksci", "lowFrequency_explosion_000.ogg", 0, 0.95, 0, rate=0.8),
                              L("rd-breaking", "bfh1_rock_falling_03.ogg", 0, 0.8, -4, at=0.1)],
                      max=1.0, fade=0.35, comp=4, sat=1.5, vol=1.1),
    "the_first_roar": dict(layers=[L("monsters", "monster-8.wav", 0, 0.84, 0, rate=0.5, af="lowpass=f=2500"),
                                   L("rd-creature", "roar_01.ogg", 0, 0.46, -2, rate=0.5, at=0.1),
                                   L("chant", "chant21.wav", 0, 2.0, -4, rate=0.5,
                                     af="lowpass=f=2000,afade=t=in:d=0.5"),
                                   L("ksci", "spaceEngineLow_001.ogg", 0, 2.2, -5, af="afade=t=in:d=0.5,lowpass=f=600"),
                                   L("ksci", "lowFrequency_explosion_000.ogg", 0, 0.95, -1, at=0.3)],
                           max=2.2, fade=0.7, comp=3, sat=1.3, vol=1.1),
}

# Ids of design section 12 that SoundEvents does not have yet (the new weapons): built, listed under "pending" in manifest.json.
SFX_PENDING = {
    "chain_arc": dict(layers=[L("digital", "zapThreeToneDown.ogg", 0, 0.4, 0),
                              L("elec", "teleport_1.wav", 0, 0.5, -5, af="highpass=f=1500")],
                      max=0.45, fade=0.15, vol=0.8),
    "kugelblitz_hum": dict(layers=[L("elec", "shieldloop.wav", 0, 1.1, 0, rate=1.8,
                                     af="lowpass=f=900,tremolo=f=40:d=0.5,afade=t=in:d=0.1"),
                                   L("elec", "crackleelectricityloop.wav", 0, 0.5, 20, af="highpass=f=3000")],
                           max=0.55, fade=0.2, vol=0.4, pitchVar=0.02),
    "orbital_warn": dict(layers=[L("ksci", "forceField_001.ogg", 0, 0.57, 0, glide=(0.8, 1.8)),
                                 L("rd-scifi", "beep_02.ogg", 0, 0.23, -3, rate=0.6),
                                 L("rd-scifi", "beep_02.ogg", 0, 0.23, -3, rate=0.6, at=0.3),
                                 L("rd-scifi", "beep_02.ogg", 0, 0.23, -3, rate=0.6, at=0.6)],
                         max=1.0, fade=0.2, vol=0.8),
    "orbital_hit": dict(layers=[L("ksci", "explosionCrunch_004.ogg", 0, 1.2, 0, af="lowpass=f=3000"),
                                L("ksci", "lowFrequency_explosion_000.ogg", 0, 0.95, 0)],
                        max=1.3, fade=0.5, comp=3, sat=1.4, vol=1.0),
    "nova_frost": dict(layers=[L("rd-breaking", "bfh1_glass_breaking_05.ogg", 0, 0.33, -1, rate=1.1),
                               L("ksci", "forceField_002.ogg", 0, 0.57, -4, glide=(1.6, 0.8)),
                               L("steam", "steam hisses - Marker #4.wav", 0, 0.5, -5, at=0.1, af="highpass=f=3000")],
                       max=0.7, fade=0.25, vol=0.85),
}

# Music. Every track is a loop except the two stingers. `start`/`len` are in source seconds (before `rate`), `xf` is
# the seam cross-fade in seconds, `af` runs over the whole source (lowpass), `drive` is tanh distortion over the loop,
# `over` lays extra material on top: heartbeat / choir, `n` evenly spaced copies or `at` explicit times in the loop
# (they wrap around the seam), `gain` in dB relative to the loop's own peak level.
# kind "loop": take `len` s from `start` s and cross-fade the seam with the audio just before `start` (so the end runs
# into the start; start and len were found by correlating the loudness envelope of the source with itself: the best
# repeat of a section). native: the pack's file is already an exact loop, used whole. stinger: slice with fades.
MUSIC = {
    # menu: Dark Cavern Ambient, a slow low drone (25.7 s repeat found in the 2 minute file, 1.5 s seam cross-fade)
    "menu": dict(pack="cavern", name="dark_cavern_ambient_001.ogg", kind="loop", start=25.84, len=25.73, xf=1.5,
                 q="2", vol=0.8, loop=True),
    # Cinder Flats: nuclear cave, heavy bass pulse
    "forest": dict(pack="nuclear", name="nuclear_cave_0.mp3", kind="loop", start=33.66, len=25.79, xf=0.12,
                   af="lowpass=f=7000", vol=0.8, loop=True),
    # Deep Mines: 60 BPM bass pulse, 8 bars
    "library": dict(pack="darkscifi", name="pulse_0.mp3", kind="loop", start=11.13, len=32.07, xf=0.12,
                    q="2", vol=0.8, loop=True),
    # boss: Dark Forces (140 BPM, 16 bars) with a slow heartbeat (15 beats per loop) and a low distorted choir
    "boss": dict(pack="forces", name="dark_forces_loop_0.mp3", kind="loop", start=89.19, len=27.49, xf=0.1,
                 q="2", vol=0.8, loop=True,
                 over=[dict(pack="heartbeat", name="heartbeat_slow_0.wav", n=15, gain=-6, af="lowpass=f=300"),
                       dict(pack="chant", name="chant12.wav", at=[0.0, 13.7], gain=-14, rate=0.7,
                            af="lowpass=f=2500,afade=t=in:d=1.0", drive=3)]),
    # The First: Heavy Boss Battle 2 pitched down 10 %, 8 bars, fast heartbeat, two choir voices, distorted
    "final": dict(pack="hbb2", name="heavy_boss_battle_2_bpm110_0.ogg", kind="loop", start=104.43, len=17.49, xf=0.1,
                  rate=0.9, af="lowpass=f=5000", drive=1.6, q="2", vol=0.85, loop=True,
                  over=[dict(pack="heartbeat", name="heartbeat_fast_0.wav", n=17, gain=-5, af="lowpass=f=300"),
                        dict(pack="chant", name="chant21.wav", at=[0.0, 9.5], gain=-12, rate=0.6,
                             af="lowpass=f=2200,afade=t=in:d=1.0", drive=3)]),
    # stingers: a sinking drone with a choir (no transient: the game_over sfx plays the impact), and the dark pulse
    "gameover": dict(pack="cavern", name="dark_cavern_ambient_002.ogg", kind="stinger", start=40.0, len=5.6, rate=0.85,
                     fade_in=0.4, fade_out=2.2, vol=0.9, loop=False,
                     over=[dict(pack="chant", name="chant3.wav", at=[0.6], gain=-8, rate=0.6, af="lowpass=f=2200",
                                drive=2)]),
    "victory": dict(pack="darkscifi", name="victory_4.mp3", kind="stinger", start=0.0, len=5.8, fade_in=0.005,
                    fade_out=1.0, vol=0.9, loop=False),
}
XFADE = 0.08  # default loop seam cross-fade, seconds
MUSIC_LUFS = -16.0
MUSIC_Q = "3"  # libvorbis quality, about 100-112 kbps for this material


# ------------------------------------------------------------------ ffmpeg / numpy plumbing

def run(cmd, **kw):
    return subprocess.run(cmd, check=True, **kw)


def chain(af, rate):
    """Filter chain: everything at 44.1 kHz, then the pitch change (asetrate), then the row's own filters."""
    parts = ["aresample=%d" % SR]
    if rate and abs(rate - 1.0) > 1e-6:
        parts.append("asetrate=%d,aresample=%d" % (round(SR * rate), SR))
    if af:
        parts.append(af)
    return ",".join(parts)


def decode(path, ch, start=0.0, dur=None, af=None, rate=1.0):
    cmd = ["ffmpeg", "-v", "error", "-ss", "%.4f" % start]
    if dur is not None:
        cmd += ["-t", "%.4f" % dur]
    cmd += ["-i", path, "-af", chain(af, rate), "-ac", str(ch), "-ar", str(SR), "-f", "f32le", "-"]
    x = np.frombuffer(run(cmd, capture_output=True).stdout, dtype=np.float32).astype(np.float64)
    return x if ch == 1 else x.reshape(-1, ch)


def glide_pitch(x, r0, r1):
    """Time-varying resample: the pitch ratio moves linearly from r0 to r1 over the result (risers and drops)."""
    n = int(len(x) / ((r0 + r1) / 2))
    pos = np.cumsum(np.linspace(r0, r1, n))
    pos = pos[pos < len(x) - 1]
    return np.interp(pos, np.arange(len(x)), x)


def encode(x, path, ch, extra):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", str(ch), "-i", "-",
           "-c:a", "libvorbis"] + extra + ["-map_metadata", "-1", "-fflags", "+bitexact", path]
    run(cmd, input=x.astype(np.float32).tobytes())


def encode_checked(y, path, ch, extra, limit=-1.0):
    """Encode, decode again and back the gain off until the decoded (Vorbis overshoots a little) peak is <= limit dBFS."""
    g = 1.0
    for _ in range(4):
        encode(y * g, path, ch, extra)
        z = decode(path, ch)
        pk = lufs(z, ch)[1] if ch == 2 else db(np.abs(z).max())  # music: true peak, SFX: sample peak
        if pk <= limit:
            break
        g *= 10 ** ((limit - pk - 0.05) / 20)
    return z


def db(v):
    return 20 * np.log10(max(v, 1e-9))


def lufs(x, ch):
    """(integrated LUFS, true peak dBTP) via ffmpeg ebur128."""
    r = run(["ffmpeg", "-nostats", "-v", "info", "-f", "f32le", "-ar", str(SR), "-ac", str(ch), "-i", "-",
             "-af", "ebur128=peak=true", "-f", "null", "-"], input=x.astype(np.float32).tobytes(),
            capture_output=True)
    t = r.stderr.decode()
    t = t[t.rfind("Summary:"):]
    i = re.search(r"I:\s+(-?[\d.]+) LUFS", t)
    p = re.search(r"Peak:\s+(-?[\d.]+) dBFS", t)
    return (float(i.group(1)) if i else -70.0), (float(p.group(1)) if p else 0.0)


def _env(e, x):
    return e if x.ndim == 1 else e[:, None]


def fade_out(x, secs):
    n = min(len(x), int(round(secs * SR)))
    if n > 0:
        x[-n:] *= _env(np.cos(np.linspace(0, np.pi / 2, n)) ** 2, x)
    return x


def fade_in(x, secs):
    n = min(len(x), int(round(secs * SR)))
    if n > 0:
        x[:n] *= _env(np.sin(np.linspace(0, np.pi / 2, n)) ** 2, x)
    return x


def dominant_hz(x):
    i = int(np.argmax(np.abs(x)))
    seg = x[max(0, i - 2048):i + 2048]
    f = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), 1 << 16))
    fr = np.fft.rfftfreq(1 << 16, 1 / SR)
    m = (fr > 300) & (fr < 6000)
    return fr[m][np.argmax(f[m])]


# ------------------------------------------------------------------ SFX

def build_sfx(sid, cfg):
    parts = []
    for ly in cfg["layers"]:
        path = src(ly["pack"], ly["name"])
        rate = ly["rate"]
        if ly["tune"]:
            rate *= ly["tune"] / dominant_hz(decode(path, 1, ly["start"], ly["dur"], ly["af"], rate))
        x = decode(path, 1, ly["start"], ly["dur"], ly["af"], rate)
        if ly["glide"]:
            x = glide_pitch(x, *ly["glide"])
        parts.append((int(round(ly["at"] * SR)), x * 10 ** (ly["gain"] / 20)))
    n = max(a + len(x) for a, x in parts)
    y = np.zeros(n)
    for a, x in parts:
        y[a:a + len(x)] += x
    y = decode_filter(y, "highpass=f=40")  # no DC / sub-bass rumble (handheld speakers cannot play it anyway)
    if cfg.get("echo"):
        y = decode_filter(y, cfg["echo"], extra=int(0.5 * SR))
    # start on sample 0: drop leading silence (below -40 dB of the peak)
    pk = np.abs(y).max()
    first = int(np.argmax(np.abs(y) > pk * 0.01))
    y = y[first:]
    y = y[:int(round(cfg["max"] * SR))]
    last = len(y) - int(np.argmax(np.abs(y[::-1]) > np.abs(y).max() * 0.003))
    y = y[:last].copy()
    fade_in(y, 0.0008)
    fade_out(y, cfg["fade"])
    if cfg.get("comp"):  # compress the peaks, then the peak normalisation below lifts the body (louder, punchier)
        y = decode_filter(y / np.abs(y).max() * 0.89, "acompressor=threshold=%.3f:ratio=%d:attack=1:release=40:makeup=1"
                          % (0.125, cfg["comp"]))
    if cfg.get("sat"):  # tanh soft clip: more body, same peak
        d = cfg["sat"]
        y = np.tanh(d * y / np.abs(y).max()) / np.tanh(d)
    y *= 10 ** (-1.2 / 20) / np.abs(y).max()
    return y


def decode_filter(y, af, extra=0):
    """Run a numpy mono signal through an ffmpeg -af chain (compressor, tail echo), padded by `extra` samples."""
    y = np.concatenate([y, np.zeros(extra)])
    r = run(["ffmpeg", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", "-af", af,
             "-f", "f32le", "-ar", str(SR), "-ac", "1", "-"], input=y.astype(np.float32).tobytes(),
            capture_output=True)
    return np.frombuffer(r.stdout, dtype=np.float32).astype(np.float64)[:len(y)]


# ------------------------------------------------------------------ music

def seam_report(y):
    """Loop point: level change across it (dB, 50 ms windows) and the biggest sample step at the seam relative to the
    99.9th percentile of steps elsewhere (about 1 or less = no click)."""
    w = int(0.05 * SR)
    jump = db(np.sqrt((y[:w] ** 2).mean())) - db(np.sqrt((y[-w:] ** 2).mean()))
    seam = np.abs(np.diff(np.concatenate([y[-4:], y[:4]]), axis=0)).max()
    return jump, seam / np.percentile(np.abs(np.diff(y, axis=0)), 99.9)


def declick(y, secs=0.03):
    """Make the loop point continuous: ease the last `secs` onto where the first sample is heading (a step of a few
    hundredths of full scale at the seam is an audible tick, even in a loop the author cut on a bar line)."""
    n = int(secs * SR)
    target = y[0] - (y[1] - y[0])
    ramp = (1 - np.cos(np.linspace(0, np.pi, n))) / 2
    y = y.copy()
    y[-n:] += ((target - y[-1])[None, :]) * ramp[:, None]
    return y


def lay_over(y, ov, wrap):
    """Add the overlay material (heartbeat, choir) to the track: `n` evenly spaced copies or copies at times `at`;
    `gain` dB relative to the track's own peak level; the tail of a copy wraps around the loop seam."""
    x = decode(src(ov["pack"], ov["name"]), 2, 0.0, ov.get("dur"), ov.get("af"), ov.get("rate", 1.0))
    x = x / max(np.abs(x).max(), 1e-9)
    if ov.get("drive"):
        x = np.tanh(ov["drive"] * x) / np.tanh(ov["drive"])
    x = x * np.percentile(np.abs(y), 99.5) * 10 ** (ov["gain"] / 20)
    n = len(y)
    out = np.concatenate([y, np.zeros((len(x), 2))])
    times = [k * n / SR / ov["n"] for k in range(ov["n"])] if "n" in ov else ov["at"]
    for t in times:
        a = int(round(t * SR))
        out[a:a + len(x)] += x
    if wrap:  # fold what ran past the end back onto the start
        tail = out[n:]
        out = out[:n]
        out[:len(tail)] += tail
        return out
    return out[:n]


def build_music(tid, cfg):
    path = src(cfg["pack"], cfg["name"])
    rate = cfg.get("rate", 1.0)
    x = decode(path, 2, af=cfg.get("af"), rate=rate)
    if cfg["kind"] == "native":
        y = x
    elif cfg["kind"] == "loop":
        s = int(round(cfg["start"] / rate * SR))
        n = int(round(cfg["len"] / rate * SR))
        xf = int(round(cfg.get("xf", XFADE) * SR))
        y = x[s:s + n].copy()
        t = np.linspace(0, np.pi / 2, xf)[:, None]
        y[n - xf:] = y[n - xf:] * np.cos(t) + x[s - xf:s] * np.sin(t)  # equal power
    else:
        s = int(round(cfg["start"] / rate * SR))
        y = x[s:s + int(round(cfg["len"] * SR))].copy()
    for ov in cfg.get("over", []):
        y = lay_over(y, ov, cfg["loop"])
    if cfg.get("drive"):  # distortion over the whole mix: more grit and weight, same level
        pk = np.abs(y).max()
        y = np.tanh(cfg["drive"] * y / pk) / np.tanh(cfg["drive"]) * pk
    if cfg["kind"] == "stinger":
        fade_in(y, cfg["fade_in"])
        fade_out(y, cfg["fade_out"])
    if cfg["loop"]:
        y = declick(y)
    # loudness: gain to -16 LUFS integrated, then a soft peak limit at -2 dBFS (true peak stays under -1 dBTP)
    for _ in range(3):
        i, p = lufs(y, 2)
        g = 10 ** ((MUSIC_LUFS - i) / 20)
        y = y * g
        peak = np.abs(y).max()
        if peak > 10 ** (-2.0 / 20):  # soft knee limiter via tanh above the threshold
            th = 10 ** (-6.0 / 20)
            over = np.abs(y) > th
            lim = 10 ** (-2.0 / 20)
            y = np.where(over, np.sign(y) * (th + (lim - th) * np.tanh((np.abs(y) - th) / (lim - th))), y)
    return y


# ------------------------------------------------------------------ main

def credits(used_ids):
    lines = ["Audio credits", "",
             "All sound effects and music here are CC0 / public domain recordings (no attribution required, given",
             "anyway). They were cut, layered, pitched down, filtered, distorted and normalised by",
             "tools/import_audio.py; the tables in that script say which source file feeds which id. Source files are",
             "in ../assets/audio (local library) and art-src/audio/<pack>/ (downloaded, with SOURCE.md), see each",
             "pack's licence note.", ""]
    by_pack = {}
    for (pack, name) in sorted(USED):
        by_pack.setdefault(pack, []).append(name)
    for pack, names in by_pack.items():
        _, title, author, url, lic = PACKS[pack]
        lines += ["%s" % title, "  Author:  %s" % author, "  URL:     %s" % url, "  Licence: %s" % lic, "  Files:"]
        lines += ["    %s" % n for n in names]
        lines.append("")
    lines += ["Not used: '400 Sounds Pack' (Chequered Ink): its own free-use terms, not CC0, so it stays out.", ""]
    return "\n".join(lines)


def sfx_entry(sid, cfg):
    return {"file": "sfx/%s.ogg" % sid, "volume": cfg["vol"], "pitchVar": cfg.get("pitchVar", 0.06)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, "app", "src", "main", "assets", "audio"))
    ap.add_argument("--only", default="", help="comma separated ids to rebuild (manifest/credits are always written)")
    ap.add_argument("--keep-wav", default="", help="also write the processed 16-bit WAVs here (listening)")
    a = ap.parse_args()
    only = set(filter(None, a.only.split(",")))
    manifest = {"version": 1, "sfx": {}, "pending": {}, "music": {}}
    rep = []
    for section, table in (("sfx", SFX), ("pending", SFX_PENDING)):
        for sid, cfg in table.items():
            manifest[section][sid] = sfx_entry(sid, cfg)
            if only and sid not in only:
                for ly in cfg["layers"]:
                    src(ly["pack"], ly["name"])
                continue
            y = build_sfx(sid, cfg)
            out = os.path.join(a.out, "sfx", sid + ".ogg")
            z = encode_checked(y, out, 1, ["-q:a", "4"])
            if a.keep_wav:
                os.makedirs(a.keep_wav, exist_ok=True)
                encode_wav(z, os.path.join(a.keep_wav, sid + ".wav"), 1)
            rep.append((sid, len(z) / SR, db(np.abs(z).max()), db(np.sqrt((z ** 2).mean())), os.path.getsize(out)))
    for tid, cfg in MUSIC.items():
        manifest["music"][tid] = {"file": "music/%s.ogg" % tid, "volume": cfg["vol"], "loop": cfg["loop"]}
        if only and tid not in only:
            src(cfg["pack"], cfg["name"])
            for ov in cfg.get("over", []):
                src(ov["pack"], ov["name"])
            continue
        y = build_music(tid, cfg)
        out = os.path.join(a.out, "music", tid + ".ogg")
        z = encode_checked(y, out, 2, ["-q:a", cfg.get("q", MUSIC_Q)])
        if a.keep_wav:
            os.makedirs(a.keep_wav, exist_ok=True)
            encode_wav(z, os.path.join(a.keep_wav, tid + ".wav"), 2)
        i, p = lufs(z, 2)
        jump, step = seam_report(z) if cfg["loop"] else (0.0, 0.0)
        rep.append((tid, len(z) / SR, p, i, os.path.getsize(out), jump, step))
    with open(os.path.join(a.out, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
    with open(os.path.join(a.out, "CREDITS.txt"), "w") as f:
        f.write(credits(None))
    for r in rep:
        if len(r) == 5:
            print("sfx   %-16s %5.2fs peak %5.1f dBFS rms %6.1f dBFS %6d B" % r)
        else:
            print("music %-16s %6.2fs peak %5.1f dBFS integrated %6.1f LUFS %7d B seam %+.1f dB step x%.1f" % r)
    print("generated", datetime.date.today().isoformat())


def encode_wav(x, path, ch):
    run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", str(ch), "-i", "-", path],
        input=x.astype(np.float32).tobytes())


if __name__ == "__main__":
    main()
