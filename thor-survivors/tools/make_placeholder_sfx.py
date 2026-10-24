#!/usr/bin/env python3
"""NOTE: overwrites the real CC0 audio built by tools/import_audio.py; do not run it any more.

Synthesises original retro placeholder audio for Thor Survivors (sfxr/chiptune style, no samples, no licences).

    python3 tools/make_placeholder_sfx.py [--out app/src/main/assets/audio] [--format ogg|wav]

Writes audio/sfx/<id>.ogg (mono 44.1 kHz) for every id in tools/AUDIO_SPEC.md, audio/music/<track>.ogg (stereo
44.1 kHz; menu/forest/library/boss are seamless loops of whole bars, gameover/victory are stingers) and
audio/manifest.json. Needs numpy; encodes with ffmpeg (libvorbis) or oggenc, else falls back to 16-bit WAV (Android
plays WAV too). The real CellCog files replace these one by one under the same names; keep manifest.json in sync.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import wave

import numpy as np

SR = 44100
rng = np.random.default_rng(20261024)


# ------------------------------------------------------------------ primitives

def n_of(d):
    return int(round(SR * d))


def phase(freq):
    return np.cumsum(freq) / SR


def sq(freq, duty=0.5):
    return np.where((phase(freq) % 1.0) < duty, 1.0, -1.0)


def tri(freq):
    return 4.0 * np.abs((phase(freq) % 1.0) - 0.5) - 1.0


def saw(freq):
    return 2.0 * (phase(freq) % 1.0) - 1.0


def sine(freq):
    return np.sin(2 * np.pi * phase(freq))


def noise(n):
    return rng.uniform(-1.0, 1.0, n)


def sweep(f0, f1, n):
    return np.geomspace(max(f0, 1.0), max(f1, 1.0), n)


def decay(n, tau, attack=0.002):
    t = np.arange(n) / SR
    e = np.exp(-t / tau)
    a = max(1, int(attack * SR))
    e[:a] *= np.linspace(0, 1, a)
    return e


def fade_out(x, ms=6):
    k = min(len(x), int(SR * ms / 1000))
    x = x.copy()
    x[len(x) - k:] *= np.linspace(1, 0, k)
    return x


def lowpass(x, fc):
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(spec / (1 + (f / fc) ** 4), len(x))


def highpass(x, fc):
    return x - lowpass(x, fc)


def bandpass(x, lo, hi):
    return lowpass(highpass(x, lo), hi)


def crush(x, bits):
    q = 2 ** (bits - 1)
    return np.round(x * q) / q


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12.0)


def place(buf, x, start):
    s = int(round(start * SR))
    e = min(len(buf), s + len(x))
    if s < len(buf):
        buf[s:e] += x[:e - s]
    return buf


def arp_tones(notes, step, dur, wave=sq, tau=0.06, total=None):
    """A row of short blips: notes are midi numbers, one every `step` seconds."""
    total = total or step * len(notes) + dur
    out = np.zeros(n_of(total))
    for i, m in enumerate(notes):
        n = n_of(dur)
        out = place(out, wave(np.full(n, midi(m))) * decay(n, tau), i * step)
    return out


# ------------------------------------------------------------------ sound effects (mono)

def s_whip():
    n = n_of(0.25)
    sw = bandpass(noise(n), 1500, 9000) * decay(n, 0.05, 0.004)
    snap = sq(sweep(900, 200, n_of(0.06))) * decay(n_of(0.06), 0.02)
    return sw * 0.8 + np.pad(snap, (0, n - len(snap))) * 0.6


def s_magic_missile():
    n = n_of(0.22)
    f = sweep(500, 1500, n) * (1 + 0.03 * np.sin(2 * np.pi * 35 * np.arange(n) / SR))
    return sq(f, 0.25) * decay(n, 0.1) * 0.8 + sine(f * 2) * decay(n, 0.05) * 0.3


def s_knife():
    n = n_of(0.14)
    return (highpass(noise(n), 3000) * decay(n, 0.03) * 0.7 + tri(sweep(2200, 900, n)) * decay(n, 0.04) * 0.6)


def s_axe():
    n = n_of(0.32)
    w = bandpass(noise(n), 300, 2500) * np.sin(np.pi * np.arange(n) / n) ** 1.5
    return w * 0.9 + sq(sweep(320, 140, n), 0.5) * decay(n, 0.08) * 0.4


def s_cross():
    n = n_of(0.4)
    f = sweep(900, 500, n // 2)
    f = np.concatenate([f, f[::-1]])
    trem = 0.6 + 0.4 * np.sin(2 * np.pi * 22 * np.arange(len(f)) / SR)
    return (sine(f) * 0.6 + tri(f * 2) * 0.3) * trem * np.sin(np.pi * np.arange(len(f)) / len(f)) ** 0.7


def s_bible():
    n = n_of(0.5)
    return (sine(np.full(n, 880.0)) * 0.5 + sine(np.full(n, 1320.0)) * 0.3 + sine(np.full(n, 1760.0)) * 0.15) * decay(n, 0.18, 0.01)


def s_fireball():
    n = n_of(0.34)
    burst = lowpass(noise(n), 3500) * decay(n, 0.1, 0.01)
    crackle = (noise(n) * (rng.random(n) < 0.02)) * decay(n, 0.2)
    return burst * 0.8 + crackle + sq(sweep(420, 180, n), 0.3) * decay(n, 0.09) * 0.4


def s_garlic():
    n = n_of(0.22)
    return sine(sweep(160, 90, n)) * decay(n, 0.07, 0.01) * 0.8 + lowpass(noise(n), 600) * decay(n, 0.05) * 0.4


def s_holy_water():
    n = n_of(0.38)
    splash = highpass(noise(n), 2000) * decay(n, 0.08)
    glass = sine(sweep(2600, 1300, n)) * decay(n, 0.06) * 0.5 + sine(sweep(3900, 1900, n)) * decay(n, 0.04) * 0.25
    return splash * 0.6 + glass


def s_lightning():
    n = n_of(0.45)
    crack = noise(n) * decay(n, 0.05, 0.0005)
    zap = saw(sweep(2200, 80, n)) * decay(n, 0.09, 0.0005)
    rumble = lowpass(noise(n), 400) * decay(n, 0.2) * 0.6
    return crack * 0.7 + zap * 0.5 + rumble


def s_enemy_hit():
    n = n_of(0.09)
    return (noise(n) * decay(n, 0.02) * 0.6 + sq(sweep(300, 130, n), 0.5) * decay(n, 0.03) * 0.7)


def s_enemy_death():
    n = n_of(0.24)
    return crush(sq(sweep(420, 60, n), 0.5) * decay(n, 0.08) * 0.7 + noise(n) * decay(n, 0.04) * 0.5, 6)


def s_player_hurt():
    n = n_of(0.32)
    f = sweep(320, 90, n) * (1 + 0.05 * np.sin(2 * np.pi * 40 * np.arange(n) / SR))
    return crush(saw(f) * decay(n, 0.12) * 0.8 + noise(n) * decay(n, 0.03) * 0.4, 6)


def s_gem():  # base pitch; the game raises it up a scale for chains
    n = n_of(0.11)
    return sq(sweep(1050, 1580, n), 0.5) * decay(n, 0.05) * 0.7 + sine(np.full(n, 2100.0)) * decay(n, 0.03) * 0.3


def s_coin():
    return arp_tones([83, 88], 0.07, 0.14, sq, 0.07, 0.24)


def s_level_up():
    return arp_tones([72, 76, 79, 84, 88], 0.09, 0.25, sq, 0.12, 0.75) * 0.8 + arp_tones([60, 64, 67, 72, 76], 0.09, 0.25, tri, 0.14, 0.75) * 0.5


def s_chest_open():
    n = n_of(0.35)
    creak = saw(sweep(110, 260, n) * (1 + 0.08 * np.sin(2 * np.pi * 28 * np.arange(n) / SR))) * np.sin(np.pi * np.arange(n) / n) * 0.5
    sp = arp_tones([84, 88, 91, 96, 100, 103], 0.07, 0.3, sine, 0.12, 0.8)
    return place(np.zeros(n_of(1.0)), creak, 0) + place(np.zeros(n_of(1.0)), sp, 0.3)[:n_of(1.0)]


def s_evolution():
    total = n_of(1.7)
    out = np.zeros(total)
    n = n_of(1.0)
    out = place(out, sq(sweep(200, 1800, n), 0.25) * np.linspace(0.2, 1, n) * 0.5, 0)
    out = place(out, arp_tones([72, 76, 79, 84, 88, 91, 96], 0.07, 0.35, sq, 0.18, 0.9), 0.9)
    out = place(out, arp_tones([60, 64, 67, 72], 0.2, 0.7, tri, 0.4, 1.4) * 0.7, 0.5)
    return out


def s_brazier_break():
    n = n_of(0.38)
    thump = sine(sweep(180, 50, n)) * decay(n, 0.1) * 0.9
    crash = bandpass(noise(n), 500, 6000) * decay(n, 0.09) * 0.7
    return thump + crash + highpass(noise(n), 4000) * (rng.random(n) < 0.04) * decay(n, 0.2) * 0.6


def s_food_heal():
    return arp_tones([76, 81, 84], 0.09, 0.2, tri, 0.1, 0.45) * 0.9 + arp_tones([88, 93], 0.09, 0.2, sine, 0.1, 0.45) * 0.3


def s_boss_spawn():
    n = n_of(1.4)
    t = np.arange(n) / SR
    drone = saw(sweep(60, 42, n)) * np.minimum(1, t / 0.15) * np.exp(-t / 0.9) * 0.6
    horn = sq(np.concatenate([np.full(n_of(0.5), 110.0), np.full(n - n_of(0.5), 82.0)]), 0.35) * decay(n, 0.5, 0.05) * 0.5
    rum = lowpass(noise(n), 250) * decay(n, 0.6) * 0.7
    return crush(drone + horn, 8) + rum


def s_game_over():
    return (arp_tones([69, 65, 62, 57, 50], 0.22, 0.5, sq, 0.3, 1.5) * 0.7 + arp_tones([45, 41, 38, 33, 26], 0.22, 0.5, tri, 0.4, 1.5) * 0.7)


def s_victory():
    out = np.zeros(n_of(1.6))
    seq = [(0.0, [72, 76, 79]), (0.18, [72, 76, 79]), (0.36, [72, 76, 79]), (0.54, [77, 81, 84]), (0.9, [79, 83, 86]),
           (1.1, [84, 88, 91])]
    for st, ch in seq:
        for m in ch:
            n = n_of(0.5)
            out = place(out, sq(np.full(n, midi(m)), 0.25) * decay(n, 0.25) * 0.3, st)
    return out


def s_ui_move():
    n = n_of(0.04)
    return sq(np.full(n, 1400.0), 0.5) * decay(n, 0.012, 0.0005) * 0.6


def s_ui_confirm():
    return arp_tones([79, 86], 0.055, 0.1, sq, 0.04, 0.2)


def s_ui_back():
    n = n_of(0.09)
    return sq(sweep(900, 450, n), 0.5) * decay(n, 0.04, 0.0005) * 0.6


# id -> (function, base volume in the manifest)
SFX = {
    "whip": (s_whip, 0.8), "magic_missile": (s_magic_missile, 0.7), "knife": (s_knife, 0.6), "axe": (s_axe, 0.8),
    "cross": (s_cross, 0.7), "bible": (s_bible, 0.6), "fireball": (s_fireball, 0.8), "garlic": (s_garlic, 0.35),
    "holy_water": (s_holy_water, 0.7), "lightning": (s_lightning, 0.9), "enemy_hit": (s_enemy_hit, 0.45),
    "enemy_death": (s_enemy_death, 0.6), "player_hurt": (s_player_hurt, 1.0), "gem": (s_gem, 0.55),
    "coin": (s_coin, 0.65), "level_up": (s_level_up, 0.9), "chest_open": (s_chest_open, 0.9),
    "evolution": (s_evolution, 1.0), "brazier_break": (s_brazier_break, 0.8), "food_heal": (s_food_heal, 0.7),
    "boss_spawn": (s_boss_spawn, 1.0), "game_over": (s_game_over, 0.9), "victory": (s_victory, 0.9),
    "ui_move": (s_ui_move, 0.5), "ui_confirm": (s_ui_confirm, 0.6), "ui_back": (s_ui_back, 0.6),
}


# ------------------------------------------------------------------ music (stereo chiptune)

MINOR, MAJOR, PHRYG = (0, 2, 3, 5, 7, 8, 10), (0, 2, 4, 5, 7, 9, 11), (0, 1, 3, 5, 7, 8, 10)


def note_buf(buf, x, start_s, pan):
    """Adds a mono note to a stereo loop buffer; whatever runs past the end wraps to the start (seamless loop)."""
    L = buf.shape[0]
    s = int(round(start_s * SR)) % L
    gl, gr = np.sqrt(0.5 * (1 - pan)), np.sqrt(0.5 * (1 + pan))
    idx = (s + np.arange(len(x))) % L
    np.add.at(buf[:, 0], idx, x * gl)
    np.add.at(buf[:, 1], idx, x * gr)


def inst_lead(m, dur, tau=0.22):
    n = n_of(dur + 0.12)
    f = midi(m) * (1 + 0.004 * np.sin(2 * np.pi * 5.5 * np.arange(n) / SR))
    return sq(f, 0.25) * decay(n, tau, 0.004) * np.minimum(1, (n - np.arange(n)) / (0.02 * SR))


def inst_arp(m, dur):
    n = n_of(dur + 0.05)
    return sq(np.full(n, midi(m)), 0.125) * decay(n, 0.07, 0.002)


def inst_bass(m, dur):
    n = n_of(dur + 0.05)
    return tri(np.full(n, midi(m))) * decay(n, 0.3, 0.004) * 1.1


def inst_pad(m, dur):
    n = n_of(dur)
    t = np.arange(n) / SR
    env = np.minimum(1, t / 0.3) * np.minimum(1, (dur - t) / 0.3)
    return (sine(np.full(n, midi(m))) + 0.5 * sine(np.full(n, midi(m) * 1.004))) * 0.5 * env


def inst_kick():
    n = n_of(0.16)
    return sine(sweep(150, 45, n)) * decay(n, 0.06, 0.001) * 1.1


def inst_snare():
    n = n_of(0.14)
    return (bandpass(noise(n), 1200, 7000) * 0.8 + sine(np.full(n, 190.0)) * 0.3) * decay(n, 0.04, 0.001)


def inst_hat(open_=False):
    n = n_of(0.12 if open_ else 0.04)
    return highpass(noise(n), 6500) * decay(n, 0.05 if open_ else 0.012, 0.0005) * 0.6


def make_loop(bpm, bars, key, scale, prog, density, drums, lead_oct=12, pad=False, arp_step=0.5, seed=1):
    """prog: per-bar (chord degree 0..6, 'triad' or 'seventh'); density: chance of a lead note per eighth."""
    r = np.random.default_rng(seed)
    beat = 60.0 / bpm
    L = int(round(bars * 4 * beat * SR))
    buf = np.zeros((L, 2))
    deg_semi = lambda d: scale[d % 7] + 12 * (d // 7)
    lead_prev = 4
    for b in range(bars):
        deg = prog[b % len(prog)]
        root = key + deg_semi(deg)
        chord = [key + deg_semi(deg + k) for k in (0, 2, 4, 7)]
        t0 = b * 4 * beat
        # bass: root/fifth eighths
        for i in range(8):
            m = (root - 12) if i % 4 != 3 else (chord[2] - 12)
            note_buf(buf, inst_bass(m, beat * 0.5) * 0.55, t0 + i * beat * 0.5, 0.0)
        # arpeggio
        steps = int(4 / arp_step)
        for i in range(steps):
            m = chord[(i % 4) if i % 8 < 4 else (3 - i % 4)] + 12
            note_buf(buf, inst_arp(m, beat * arp_step) * 0.2, t0 + i * beat * arp_step, 0.35)
        if pad:
            for m in chord[:3]:
                note_buf(buf, inst_pad(m, 4 * beat) * 0.12, t0, -0.2)
        # lead: random walk on the scale, chord tone on the strong beats
        for i in range(8):
            if i % 4 != 0 and r.random() > density:
                continue
            if i % 4 == 0:
                cands = [deg + k for k in (0, 2, 4)]
                d = min(cands, key=lambda c: abs(c - lead_prev) + r.random())
            else:
                d = lead_prev + int(r.choice([-2, -1, -1, 1, 1, 2]))
            d = int(np.clip(d, deg - 2, deg + 9))
            lead_prev = d
            ln = beat * float(r.choice([0.5, 0.5, 1.0])) if i % 2 == 0 else beat * 0.5
            note_buf(buf, inst_lead(key + lead_oct + deg_semi(d), ln) * 0.26, t0 + i * beat * 0.5, -0.3)
        # drums
        if drums:
            for i in range(4):
                if i % 2 == 0:
                    note_buf(buf, inst_kick() * 0.7, t0 + i * beat, 0.0)
                else:
                    note_buf(buf, inst_snare() * 0.45, t0 + i * beat, 0.05)
            for i in range(8):
                note_buf(buf, inst_hat(i % 4 == 3) * 0.35, t0 + i * beat * 0.5 + (beat * 0.25 if drums == 2 else 0), 0.2)
    return buf


def stinger(notes, bpm_step, key_tail, lead=inst_lead, total=4.0):
    buf = np.zeros((n_of(total), 2))
    for i, (m, d) in enumerate(notes):
        t = i * bpm_step
        note_buf(buf, lead(m, d, 0.5) * 0.4, t, -0.2)
        note_buf(buf, inst_bass(m - 24, d + 0.3) * 0.5, t, 0.0)
    for m in key_tail:
        note_buf(buf, inst_pad(m, total - len(notes) * bpm_step) * 0.25, len(notes) * bpm_step, 0.0)
    return buf


def m_menu():  # Am F C G, slow and wistful
    return make_loop(88, 8, 57, MINOR, [0, 5, 2, 6, 0, 5, 3, 6], 0.35, 0, pad=True, arp_step=0.5, seed=11)


def m_forest():  # driving D minor
    return make_loop(132, 8, 50, MINOR, [0, 0, 5, 6, 0, 0, 3, 6], 0.7, 1, arp_step=0.25, seed=22)


def m_library():  # E phrygian, dusty and dark
    return make_loop(104, 8, 52, PHRYG, [0, 1, 0, 6, 0, 1, 3, 1], 0.5, 2, pad=True, arp_step=0.5, seed=33)


def m_boss():  # fast, chromatic-ish C minor
    return make_loop(156, 8, 48, MINOR, [0, 0, 5, 1, 0, 0, 6, 5], 0.85, 1, lead_oct=12, arp_step=0.25, seed=44)


def m_gameover():
    notes = [(69, 0.5), (65, 0.5), (62, 0.5), (57, 1.2)]
    return stinger(notes, 0.5, [45, 48, 52], total=4.2)


def m_victory():
    notes = [(72, 0.3), (72, 0.3), (72, 0.3), (76, 0.5), (74, 0.3), (79, 0.8)]
    return stinger(notes, 0.28, [60, 64, 67, 72], total=4.6)


MUSIC = {  # track -> (function, base volume, loops)
    "menu": (m_menu, 0.8, True), "forest": (m_forest, 0.75, True), "library": (m_library, 0.75, True),
    "boss": (m_boss, 0.8, True), "gameover": (m_gameover, 0.9, False), "victory": (m_victory, 0.9, False),
}


# ------------------------------------------------------------------ output

def to_i16(x):
    return (np.clip(x, -1, 1) * 32767).astype(np.int16)


def write_wav(path, x, rate=SR):
    ch = 1 if x.ndim == 1 else x.shape[1]
    with wave.open(path, "wb") as w:
        w.setnchannels(ch)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(to_i16(x).tobytes())


def lufs(path):
    """Integrated loudness via ffmpeg's ebur128, or None."""
    if not shutil.which("ffmpeg"):
        return None
    p = subprocess.run(["ffmpeg", "-nostats", "-i", path, "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True)
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", p.stderr)
    return float(m[-1]) if m else None


def soft_limit(x, ceil=0.89):  # -1 dBFS
    return np.where(np.abs(x) > 0.7, np.sign(x) * (0.7 + (ceil - 0.7) * np.tanh((np.abs(x) - 0.7) / (ceil - 0.7))), x)


def encode(wav, out, fmt, quality):
    if fmt == "wav":
        shutil.copyfile(wav, out)
    elif shutil.which("ffmpeg"):
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-c:a", "libvorbis", "-q:a", str(quality), out], check=True)
    else:
        subprocess.run(["oggenc", "-q", str(quality), "-o", out, wav], check=True)


def main():
    ap = argparse.ArgumentParser()
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app", "src", "main", "assets", "audio")
    ap.add_argument("--out", default=os.path.normpath(root))
    ap.add_argument("--format", choices=["ogg", "wav"], default=None)
    a = ap.parse_args()
    fmt = a.format or ("ogg" if shutil.which("ffmpeg") or shutil.which("oggenc") else "wav")
    ext = "." + fmt
    for d in ("sfx", "music"):
        os.makedirs(os.path.join(a.out, d), exist_ok=True)
    manifest = {"version": 1, "sfx": {}, "music": {}}
    total = 0
    with tempfile.TemporaryDirectory() as tmp:
        for sid, (fn, vol) in SFX.items():
            x = fade_out(fn().astype(float))
            x = x / max(1e-9, np.max(np.abs(x))) * 0.89  # peak -1 dBFS; the manifest volume balances the mix
            w = os.path.join(tmp, sid + ".wav")
            write_wav(w, x)
            out = os.path.join(a.out, "sfx", sid + ext)
            encode(w, out, fmt, 4)
            manifest["sfx"][sid] = {"file": "sfx/" + sid + ext, "volume": vol, "pitchVar": 0.0 if sid.startswith("ui_") else 0.06}
            total += os.path.getsize(out)
        for tr, (fn, vol, loop) in MUSIC.items():
            x = fn()
            w = os.path.join(tmp, tr + ".wav")
            write_wav(w, soft_limit(x / max(1e-9, np.max(np.abs(x)) / 0.89)))
            l0 = lufs(w)
            if l0 is not None:  # bring the track to about -16 LUFS
                x = soft_limit(x / max(1e-9, np.max(np.abs(x)) / 0.89) * 10 ** ((-16 - l0) / 20))
                write_wav(w, x)
                print("%-10s %6.1f LUFS -> %6.1f LUFS" % (tr, l0, lufs(w) or 0))
            out = os.path.join(a.out, "music", tr + ext)
            encode(w, out, fmt, 3)
            manifest["music"][tr] = {"file": "music/" + tr + ext, "volume": vol, "loop": loop}
            total += os.path.getsize(out)
    with open(os.path.join(a.out, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
    print("wrote %d sfx + %d music (%s), %.0f KB" % (len(SFX), len(MUSIC), fmt, total / 1024))


if __name__ == "__main__":
    sys.exit(main())
