#!/usr/bin/env python3
"""Builds the shipped audio of Thor Survivors from CC0 source recordings (replaces the procedural placeholders).

    python3 tools/import_audio.py [--out app/src/main/assets/audio] [--only whip,menu] [--keep-wav DIR]

Reads the source files named in the tables below, trims / layers / filters them, normalises them to
tools/AUDIO_SPEC.md (SFX: mono 44.1 kHz, peak -1 dBFS, no leading silence; music: stereo 44.1 kHz, -16 LUFS
integrated, true peak <= -1 dBTP, loops cut to whole bars with the seam cross-faded) and encodes Ogg Vorbis with
ffmpeg. Writes audio/sfx/<id>.ogg, audio/music/<track>.ogg, audio/manifest.json and audio/CREDITS.txt (every source
file actually used, with pack, author, licence and URL). Needs numpy and ffmpeg (libvorbis).

Sources: the local CC0 library ../assets/audio (Kenney packs, Abstraction loop bundle) and the downloaded CC0 packs
in art-src/audio/<pack>/ (each with SOURCE.md). Do NOT run tools/make_placeholder_sfx.py afterwards: it overwrites
these files with the synthesised placeholders.

Everything is deterministic: same sources, same output. To change a sound edit its row (file, start, dur, gain_db,
filters) and re-run; `--only` rebuilds a few ids.
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
    "jingles": (os.path.join(LOCAL, "music-jingles", "Audio"), "Kenney Music Jingles", KENNEY,
                "https://kenney.nl/assets/music-jingles", CC0 + ", License.txt in the pack"),
    "abstraction": (os.path.join(LOCAL, "music-loop-bundle-2026-q2"), "Abstraction Music Loop Bundle",
                    "Benjamin Burnes (Abstraction, Tallbeard Studios)",
                    "https://tallbeard.itch.io/music-loop-bundle", CC0 + ", _LICENSE.txt in the pack"),
}
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
    ("heavy-dungeon", "mintodog-heavy-dungeon", "Heavy Dungeon", "MintoDog", "heavy-dungeon"),
    ("mv-stage1", "hydrogene-monstervania-8bit-1-stage-1", "MonsterVania 8-bit #1 - Stage 1", "HydroGene",
     "8bit-monstervania-track-1"),
    ("mv-ghost", "hydrogene-monstervania-ghost-land", "MonsterVania - Ghost Land", "HydroGene",
     "monstervania-ghost-land"),
    ("no-hope", "cleytonkauffman-game-over-no-hope", "Game Over Theme (No Hope)", "Cleyton Kauffman", "game-over-theme"),
    ("fanfare", "aroachifoundonmypillow-victory-fanfare", "Victory Fanfare (church organ)",
     "ARoachIFoundOnMyPillow", "victory-fanfare"),
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

def L(pack, name, start=0.0, dur=None, gain=0.0, at=0.0, af=None, tune=None):
    """One source layer: file, trim start/dur (s of the source), gain_db, offset `at` in the result, ffmpeg -af, and
    `tune` = Hz the dominant pitch is re-tuned to (gem)."""
    return dict(pack=pack, name=name, start=start, dur=dur, gain=gain, at=at, af=af, tune=tune)


# id -> layers, max length (s), end fade (s), saturation drive (louder body), manifest volume, pitchVar.
# Lengths follow the table in AUDIO_SPEC.md; choices are explained in the "Sources" section there.
SFX = {
    "whip": dict(layers=[L("rd-rpg", "blade_02.ogg", 0, 0.30, 0, af="highpass=f=300")],
                 max=0.30, fade=0.03, sat=1.5, vol=0.8),
    "magic_missile": dict(layers=[L("digital", "phaserUp5.ogg", 0, 0.24, 0)],
                          max=0.24, fade=0.03, vol=0.7),
    "knife": dict(layers=[L("rpg-audio", "knifeSlice2.ogg", 0, 0.14, 0, af="highpass=f=1500")],
                  max=0.14, fade=0.04, vol=0.8),
    "axe": dict(layers=[L("rd-100v2", "sfx100v2_air_02.ogg", 0, 0.36, 0, af="lowpass=f=2600,highpass=f=120")],
                max=0.35, fade=0.08, comp=4, vol=0.8),
    "cross": dict(layers=[L("rd-scifi", "teleport_02.ogg", 0.72, 0.5, 0, af="lowpass=f=5000")],
                  max=0.42, fade=0.12, vol=0.7),
    "bible": dict(layers=[L("rpg-audio", "bookFlip2.ogg", 0, 0.5, 0, af="lowpass=f=6000"),
                          L("rd-rpg", "item_gem_04.ogg", 0, 0.45, -9, at=0.12)],
                  max=0.52, fade=0.12, comp=3, vol=0.9),
    "fireball": dict(layers=[L("rd-rpg", "spell_fire_06.ogg", 0, 0.42, 0, af="lowpass=f=6000")],
                     max=0.38, fade=0.1, comp=4, sat=1.3, vol=0.8),
    "garlic": dict(layers=[L("rd-water", "bubble_02.ogg", 0, 0.24, 0, af="lowpass=f=1200")],
                   max=0.22, fade=0.07, vol=0.45),
    "holy_water": dict(layers=[L("rd-breaking", "bfh1_glass_hit_01.ogg", 0, 0.25, -3),
                               L("rd-water", "splash_02.ogg", 0, 0.5, 0, at=0.03)],
                       max=0.42, fade=0.1, comp=3, vol=0.8),
    "lightning": dict(layers=[L("digital", "zap2.ogg", 0, 0.4, -4),
                              L("rd-100v2", "sfx100v2_thunder_01.ogg", 0.97, 0.5, 0, af="lowpass=f=2500")],
                      max=0.5, fade=0.12, comp=2, vol=0.9),
    "enemy_hit": dict(layers=[L("impact", "impactSoft_medium_000.ogg", 0, 0.09, 0, af="lowpass=f=2500")],
                      max=0.08, fade=0.03, vol=0.5),
    "enemy_death": dict(layers=[L("rd-water", "slime_12.ogg", 0, 0.24, 0)],
                        max=0.2, fade=0.06, comp=4, vol=0.85),
    "player_hurt": dict(layers=[L("rd-rpg", "creature_hurt_01.ogg", 0, 0.34, 0, af="lowpass=f=3500"),
                                L("impact", "impactPunch_medium_000.ogg", 0, 0.2, -2)],
                        max=0.32, fade=0.07, comp=2, vol=1.0),
    "gem": dict(layers=[L("interface", "pluck_002.ogg", 0, 0.16, 0, tune=1046.5)],
                max=0.11, fade=0.04, vol=0.7),
    "coin": dict(layers=[L("rd-rpg", "item_coins_01.ogg", 0, 0.45, 0)],
                 max=0.25, fade=0.06, comp=4, vol=0.9),
    "level_up": dict(layers=[L("jingles", "8-Bit jingles/jingles_NES03.ogg", 0, 0.7, 0)],
                     max=0.65, fade=0.08, comp=3, vol=0.9),
    "chest_open": dict(layers=[L("rpg-audio", "creak3.ogg", 0, 0.34, -2),
                               L("rd-rpg", "item_gem_04.ogg", 0, 0.6, 0, at=0.42)],
                       max=1.0, fade=0.2, comp=4, vol=1.0),
    "evolution": dict(layers=[L("jingles", "Steel jingles/jingles_STEEL02.ogg", 0, 1.4, 0),
                              L("rd-rpg", "spell_fire_03.ogg", 0, 1.9, -9, af="highpass=f=800")],
                      max=1.8, fade=0.35, comp=3, vol=1.0),
    "brazier_break": dict(layers=[L("rd-breaking", "bfh1_wood_breaking_02.ogg", 0, 0.4, 0),
                                  L("rd-100v2", "sfx100v2_metal_hit_01.ogg", 0, 0.4, -5),
                                  L("impact", "impactWood_heavy_000.ogg", 0, 0.3, -2, af="lowpass=f=600")],
                          max=0.42, fade=0.1, comp=4, sat=1.3, vol=0.8),
    "food_heal": dict(layers=[L("jingles", "Pizzicato jingles/jingles_PIZZI08.ogg", 0, 0.5, 0)],
                      max=0.38, fade=0.1, vol=0.7),
    "boss_spawn": dict(layers=[L("rd-rpg", "creature_roar_02.ogg", 0, 1.1, 0, af="lowpass=f=2500"),
                               L("rd-bang", "bang_03.ogg", 0, 1.1, -4, af="lowpass=f=400"),
                               L("impact", "impactBell_heavy_000.ogg", 0, 1.3, -5, af="lowpass=f=1500")],
                       max=1.4, fade=0.4, comp=3, vol=1.0),
    "game_over": dict(layers=[L("jingles", "Sax jingles/jingles_SAX07.ogg", 0, 1.4, 0, af="lowpass=f=4000"),
                              L("impact", "impactBell_heavy_001.ogg", 0, 1.3, -4, af="lowpass=f=1800")],
                      max=1.3, fade=0.35, comp=2, vol=0.9),
    "victory": dict(layers=[L("jingles", "Sax jingles/jingles_SAX02.ogg", 0, 0.9, 0)],
                    max=1.3, fade=0.3, comp=3, echo="aecho=0.8:0.8:120|240|360:0.6|0.45|0.3", vol=0.9),
    "ui_move": dict(layers=[L("interface", "tick_004.ogg", 0, 0.06, 0)],
                    max=0.05, fade=0.012, vol=0.5, pitchVar=0.0),
    "ui_confirm": dict(layers=[L("interface", "confirmation_001.ogg", 0, 0.16, 0)],
                       max=0.14, fade=0.03, vol=0.6, pitchVar=0.0),
    "ui_back": dict(layers=[L("interface", "back_002.ogg", 0, 0.1, 0)],
                    max=0.1, fade=0.03, vol=0.6, pitchVar=0.0),
}

# Music. loop: take `len` s from `start` s of the source (whole bars) and cross-fade the seam with the audio just
# before `start` (the repeat of the section), so the end runs into the start. native: the pack's file is already
# an exact loop, used whole. stinger: `start`/`len` slice with fades.
MUSIC = {
    "menu": dict(pack="abstraction", name="Week 19 - Dark Portents MYSTERIOUS TRAVELER.ogg", kind="native",
                 q="2", vol=0.8, loop=True),
    "forest": dict(pack="mv-stage1", name="MonsterVania 8-bit #1 - Stage 1.ogg", kind="loop", start=10.262,
                   len=10 * 4 * 60 / 93.0, vol=0.75, loop=True),
    "library": dict(pack="mv-ghost", name="MonsterVania - Ghost Land.mp3", kind="loop", start=2.78,
                    len=8 * 4 * 60 / 100.0, vol=0.75, loop=True),
    "boss": dict(pack="heavy-dungeon", name="heavy_dungeon_bpm160.ogg", kind="loop", start=12.0,
                 len=16 * 4 * 60 / 160.0, vol=0.8, loop=True),
    "gameover": dict(pack="no-hope", name="No Hope.ogg", kind="stinger", start=0.0, len=5.6, fade_in=0.01,
                     fade_out=1.6, vol=0.9, loop=False),
    "victory": dict(pack="fanfare", name="fanfare1.ogg", kind="stinger", start=0.0, len=4.6, fade_in=0.005,
                    fade_out=0.6, vol=0.9, loop=False),
}
XFADE = 0.08  # loop seam cross-fade, seconds
MUSIC_LUFS = -16.0
MUSIC_Q = "3"  # libvorbis quality, about 100-112 kbps for this material


# ------------------------------------------------------------------ ffmpeg / numpy plumbing

def run(cmd, **kw):
    return subprocess.run(cmd, check=True, **kw)


def decode(path, ch, start=0.0, dur=None, af=None):
    cmd = ["ffmpeg", "-v", "error", "-ss", "%.4f" % start]
    if dur is not None:
        cmd += ["-t", "%.4f" % dur]
    cmd += ["-i", path]
    if af:
        cmd += ["-af", af]
    cmd += ["-ac", str(ch), "-ar", str(SR), "-f", "f32le", "-"]
    x = np.frombuffer(run(cmd, capture_output=True).stdout, dtype=np.float32).astype(np.float64)
    return x if ch == 1 else x.reshape(-1, ch)


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
    """(integrated LUFS, max short-term LUFS, true peak dBTP) via ffmpeg ebur128."""
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
        af = ly["af"]
        x = decode(src(ly["pack"], ly["name"]), 1, ly["start"], ly["dur"], af)
        if ly["tune"]:
            r = ly["tune"] / dominant_hz(x)
            x = decode(src(ly["pack"], ly["name"]), 1, ly["start"], ly["dur"],
                       ("%s," % af if af else "") + "asetrate=%d,aresample=%d" % (round(SR * r), SR))
        parts.append((int(round(ly["at"] * SR)), x * 10 ** (ly["gain"] / 20)))
    n = max(a + len(x) for a, x in parts)
    y = np.zeros(n)
    for a, x in parts:
        y[a:a + len(x)] += x
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
    """Run a numpy mono signal through an ffmpeg -af chain (used for the tail echo), padded by `extra` samples."""
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


def build_music(tid, cfg):
    path = src(cfg["pack"], cfg["name"])
    x = decode(path, 2)
    if cfg["kind"] == "native":
        y = x
    elif cfg["kind"] == "loop":
        s = int(round(cfg["start"] * SR))
        n = int(round(cfg["len"] * SR))
        xf = int(round(XFADE * SR))
        y = x[s:s + n].copy()
        t = np.linspace(0, np.pi / 2, xf)[:, None]
        y[n - xf:] = y[n - xf:] * np.cos(t) + x[s - xf:s] * np.sin(t)  # equal power
    else:
        s = int(round(cfg["start"] * SR))
        y = x[s:s + int(round(cfg["len"] * SR))].copy()
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
             "anyway). They were cut, layered, filtered and normalised by tools/import_audio.py; the table in that",
             "script says which source file feeds which id. Source files are in ../assets/audio (local library) and",
             "art-src/audio/<pack>/ (downloaded, with SOURCE.md), see each pack's licence note.", ""]
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, "app", "src", "main", "assets", "audio"))
    ap.add_argument("--only", default="", help="comma separated ids to rebuild (manifest/credits are always written)")
    ap.add_argument("--keep-wav", default="", help="also write the processed 16-bit WAVs here (listening)")
    a = ap.parse_args()
    only = set(filter(None, a.only.split(",")))
    manifest = {"version": 1, "sfx": {}, "music": {}}
    rep = []
    for sid, cfg in SFX.items():
        manifest["sfx"][sid] = {"file": "sfx/%s.ogg" % sid, "volume": cfg["vol"], "pitchVar": cfg.get("pitchVar", 0.06)}
        if only and sid not in only:
            for ly in cfg["layers"]:
                src(ly["pack"], ly["name"])
            continue
        y = build_sfx(sid, cfg)
        out = os.path.join(a.out, "sfx", sid + ".ogg")
        z = encode_checked(y, out, 1, ["-q:a", "4"])
        rep.append((sid, len(z) / SR, db(np.abs(z).max()), db(np.sqrt((z ** 2).mean())), os.path.getsize(out)))
    for tid, cfg in MUSIC.items():
        manifest["music"][tid] = {"file": "music/%s.ogg" % tid, "volume": cfg["vol"], "loop": cfg["loop"]}
        if only and tid not in only:
            src(cfg["pack"], cfg["name"])
            continue
        y = build_music(tid, cfg)
        out = os.path.join(a.out, "music", tid + ".ogg")
        z = encode_checked(y, out, 2, ["-q:a", cfg.get("q", MUSIC_Q)])
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
            print("sfx   %-14s %5.2fs peak %5.1f dBFS rms %6.1f dBFS %6d B" % r)
        else:
            print("music %-14s %6.2fs peak %5.1f dBFS integrated %6.1f LUFS %7d B seam %+.1f dB step x%.1f" % r)
    print("generated", datetime.date.today().isoformat())


if __name__ == "__main__":
    main()
