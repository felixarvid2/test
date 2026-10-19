#!/bin/bash
# Ljud för Krypta del 3: yxan, eldkastaren, granatkastaren, nya fiender (ghoul, kultist, gargoyle,
# isvarg, irrbloss, frostbossen), drycker, valpen, NPC:er, kort/rutter/belöningar, och musiken
# frost (+ frost_hi, tidslinjerat intensitetslager) och boss2.
# Samma konventioner som make2.sh: effekter mono 22 kHz Vorbis q2 toppnormaliserade till $TOP dBFS
# (standard -1, slingor -4), musik stereo 44,1 kHz Vorbis q1 linjärt förstärkt till mål-LUFS,
# alla slingor bär LOOPLENGTH=<sampel> i Vorbis-kommentaren.
# Källor: assets/audio (Kenney-paketen CC0, 400 Sounds Pack CC0) och Horror SFX Free ur releasen
# assets-large-v1 (packa upp den i $HORROR). Det som inte fanns (yl, korp, valpskall, viskningar,
# klockspel, laddsvep, mystiskt ackord, musiken) syntetiseras med python3 + numpy (inbäddat nedan).
# Kör från repo-roten: HORROR=/sökväg/till/"Horror SFX Free" bash retrofps/tools/sounds/make3.sh
set -e
O=retrofps/assets/snd
M=retrofps/assets/music
A=assets/audio
S="$A/400 Sounds Pack"
I=$A/impact-sounds/Audio
R=$A/rpg-audio/Audio
D=$A/digital-audio/Audio
C=$A/casino-audio/Audio
UI=$A/interface-sounds/Audio
V=$A/voiceover-pack/Male
H="${HORROR:?ange HORROR}"
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
mkdir -p "$M" "$O"

peak() { ffmpeg -hide_banner -nostats -i "$1" -af volumedetect -f null - 2>&1 | sed -n 's/.*max_volume: \(-\{0,1\}[0-9.]*\) dB.*/\1/p'; }
lufs() { ffmpeg -hide_banner -nostats -i "$1" -af ebur128 -f null - 2>&1 | awk '$1=="I:"{i=$2} END{print i}'; }
nsamp() { ffprobe -v error -select_streams a:0 -show_entries stream=duration_ts -of csv=p=0 "$1"; }
calc() { awk "BEGIN{printf \"%.6f\", $1}"; }
render() { # render UT KANALER HZ 'graf' källor...  (graf utan [o] blir "[0:a]graf[o]")
  local out=$1 ac=$2 ar=$3 g=$4; shift 4
  local args=(); for f in "$@"; do args+=(-i "$f"); done
  case "$g" in *'[o]'*) ;; *) g="[0:a]$g[o]";; esac
  ffmpeg -loglevel error -y "${args[@]}" -filter_complex "$g" -map '[o]' -ac "$ac" -ar "$ar" "$out"
}
# fx NAMN 'graf' källor...: mono 22 kHz, toppnormaliserad till $TOP dBFS (standard -1, som de gamla ljuden)
fx() {
  local n=$1 g=$2; shift 2
  render "$T/$n.wav" 1 22050 "$g" "$@"
  finish "$n"
}
finish() { # finish NAMN [loop]
  local v tag=(); v=$(calc "${TOP:--1} - ($(peak "$T/$1.wav"))")
  [ "$2" = loop ] && tag=(-metadata "LOOPLENGTH=$(nsamp "$T/$1.wav")")
  ffmpeg -loglevel error -y -i "$T/$1.wav" -af "volume=${v}dB" "${tag[@]}" -c:a libvorbis -q:a 2 "$O/$1.ogg"
}
# fxloop NAMN LEN X 'graf' källor...: som fx men en sömlös slinga på LEN s (grafen ska ge minst LEN+X s)
fxloop() {
  local n=$1 len=$2 x=$3 g=$4; shift 4
  render "$T/raw_$n.wav" 1 22050 "$g" "$@"
  xloop "$T/raw_$n.wav" "$T/$n.wav" "$len" "$x"
  finish "$n" loop
}
# mus NAMN LUFS 'graf' källor...: stereo 44,1 kHz Vorbis q1, linjär förstärkning till LUFS, topp under -1 dBFS.
# GAIN=x dB i miljön ger fast förstärkning i stället.
mus() {
  local n=$1 tgt=$2 g=$3; shift 3
  render "$T/m_$n.wav" 2 44100 "$g" "$@"
  local v p
  if [ -n "$GAIN" ]; then v=$GAIN; else v=$(calc "$tgt - ($(lufs "$T/m_$n.wav"))"); fi
  p=$(calc "$(peak "$T/m_$n.wav") + $v")
  v=$(awk "BEGIN{p=$p; v=$v; if (p > -1) v -= p + 1; printf \"%.2f\", v}")
  LASTGAIN=$v
  ffmpeg -loglevel error -y -i "$T/m_$n.wav" -af "volume=${v}dB" -metadata "LOOPLENGTH=$(nsamp "$T/m_$n.wav")" -c:a libvorbis -q:a 1 "$M/$n.ogg"
}
# sömlös slinga: LEN s ur IN, de följande X s tonas in över början (lika effekt).
xloop() { # xloop IN UT LEN X
  ffmpeg -loglevel error -y -i "$1" -ss "$3" -i "$1" -filter_complex "[0:a]atrim=0:$3,afade=t=in:d=$4:curve=qsin[p];[1:a]atrim=0:$4,afade=t=out:d=$4:curve=qsin[q];[p][q]amix=inputs=2:normalize=0:duration=first[o]" -map '[o]' "$2"
}
ST="silenceremove=start_periods=1:start_threshold=-50dB"
P="aresample=44100,aformat=sample_fmts=fltp:channel_layouts=mono"
mix() { echo "amix=inputs=$1:normalize=0:duration=longest"; }

# röstmaterial till viskningar och mummel (Kenney Voiceover Pack, manlig röst), mono 44,1 kHz
ffmpeg -loglevel error -y -i "$V/war_watch_my_back.ogg" -i "$V/mission_failed.ogg" -i "$V/war_call_for_backup.ogg" \
  -filter_complex "[0:a][1:a][2:a]concat=n=3:v=0:a=1,$P[o]" -map '[o]' "$T/vox_a.wav"
ffmpeg -loglevel error -y -i "$V/objective_achieved.ogg" -i "$V/congratulations.ogg" \
  -filter_complex "[0:a][1:a]concat=n=2:v=0:a=1,$P[o]" -map '[o]' "$T/vox_b.wav"

# ---------- syntes ----------
cat > "$T/synth3.py" <<'PY'
# Syntetiserade effekter och musikslingor för Krypta del 3. Användning: python3 synth3.py <katalog>
# Musiken läggs med "wrap" (toner som går över slutet läggs på början) och efterklangen är en
# cirkulär faltning, så slingorna är sömlösa (samma teknik som make2.sh).
import sys, wave, numpy as np
SR = 44100
OUT = sys.argv[1]
rng = np.random.default_rng(4321)

def m2f(n): return 440.0 * 2 ** ((n - 69) / 12)
def tt(d): return np.arange(int(d * SR)) / SR

def env(n, att, rel):
    e = np.ones(n)
    a = min(n, max(1, int(att * SR))); e[:a] = np.sin(np.linspace(0, np.pi / 2, a)) ** 2
    r = min(n, max(1, int(rel * SR))); e[n - r:] *= np.cos(np.linspace(0, np.pi / 2, r)) ** 2
    return e

def fftfilt(x, lo=0, hi=None, slope=1.0):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    g = np.ones_like(f)
    if hi: g *= 1 / (1 + (f / hi) ** (4 * slope))
    if lo: g *= 1 / (1 + (lo / np.maximum(f, 1e-3)) ** (4 * slope))
    return np.fft.irfft(X * g, len(x))

def svf(x, fc, q, mode='bp'):  # tidsvarierande tillståndsvariabelfilter (TPT), fc per sampel
    fc = np.broadcast_to(np.asarray(fc, float), x.shape)
    g = np.tan(np.pi * np.clip(fc, 20, SR * 0.45) / SR); k = 1 / q
    a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2
    ic1 = ic2 = 0.0; y = np.empty_like(x)
    for i in range(len(x)):
        v3 = x[i] - ic2; v1 = a1[i] * ic1 + a2[i] * v3; v2 = ic2 + a2[i] * ic1 + a3[i] * v3
        ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2
        y[i] = v1 if mode == 'bp' else v2
    return y

def noise(d): return rng.standard_normal(int(d * SR))

def place(buf, t0, sig, g=1.0):
    i = int(t0 * SR); m = min(len(sig), len(buf) - i)
    if m > 0: buf[i:i + m] += sig[:m] * g

def verb(x, length=1.2, wet=0.3, bright=5000, tail=True):  # kort efterklang (linjär, med svans)
    n = int(length * SR); t = np.arange(n) / SR
    ir = rng.standard_normal(n) * np.exp(-t * 6.9 / length); ir = fftfilt(ir, 150, bright)
    ir /= np.sqrt((ir ** 2).sum() * (SR / 2) / (bright - 150))  # förstärkning ~1 inom bandet
    L = len(x) + (n if tail else 0); N = 1 << int(np.ceil(np.log2(L + n)))
    w = np.fft.irfft(np.fft.rfft(x, N) * np.fft.rfft(ir, N), N)[:L]
    y = np.zeros(L); y[:len(x)] += x
    return y + wet * w

def wr(name, x, ch=1):
    x = np.asarray(x, float); x = x / max(1e-9, np.abs(x).max()) * 0.8
    with wave.open(f'{OUT}/{name}.wav', 'wb') as w:
        w.setnchannels(ch); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype('<i2').tobytes())

def rd(name):
    with wave.open(f'{OUT}/{name}.wav', 'rb') as w:
        return np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(float) / 32768

def fade_tail(x, d):
    n = min(len(x), int(d * SR)); x = x.copy(); x[len(x) - n:] *= np.cos(np.linspace(0, np.pi / 2, n)) ** 2; return x

# ---- byggstenar ----
def formants(freq, F):
    g = np.full_like(np.asarray(freq, float), 0.02)
    for fc, bw, a in F: g = g + a / (1 + ((freq - fc) / bw) ** 2)
    return g

def voice(f0, F, hmax=7000, jitter=0.0, roll=0.6):
    """additiv röst: f0 är en kurva (Hz per sampel), F formanter [(fc, bw, amp)]"""
    if jitter: f0 = f0 * (1 + jitter * fftfilt(rng.standard_normal(len(f0)), 0, 60) / 0.1)
    ph = 2 * np.pi * np.cumsum(f0) / SR; y = np.zeros(len(f0)); fm = f0.mean()
    for k in range(1, int(hmax / fm) + 1):
        y += formants(k * f0, F) / k ** roll * np.sin(k * ph)
    return y

def bar(f, d, g=1.0, dec=3.0):  # klockspel/celesta: fritt-fri stav, delton 1, 2.76, 5.40, 8.93
    t = tt(d); y = np.zeros_like(t)
    for r, a, dd in ((1, 1, 1), (2.756, 0.35, 2.2), (5.404, 0.18, 4), (8.933, 0.08, 6)):
        if f * r < SR * 0.45: y += a * np.exp(-t * dec * dd) * np.sin(2 * np.pi * f * r * t + rng.uniform(0, 6))
    return y * env(len(t), 0.002, 0.05) * g

def bell(n, d=6.0, g=1.0):  # kyrkklocka
    f = m2f(n); t = tt(d); y = np.zeros_like(t)
    for r, a, dec in ((0.5, 0.6, 0.35), (1, 1, 0.6), (1.19, 0.5, 0.9), (1.5, 0.35, 1.1), (2, 0.5, 1.4), (2.51, 0.25, 2.2), (3.01, 0.2, 2.8), (4.1, 0.12, 3.6)):
        y += a * np.exp(-t * dec) * np.sin(2 * np.pi * f * r * t + rng.uniform(0, 6))
    return y * env(len(t), 0.003, 0.5) * g

def osc_sum(f, t, amps):
    y = np.zeros_like(t)
    for k, a in enumerate(amps, 1):
        if f * k > SR * 0.45 or a == 0: continue
        y += a * np.sin(2 * np.pi * f * k * t + rng.uniform(0, 6.28))
    return y

def pad(notes, d, att=1.5, rel=2.0, h=8, roll=1.7, g=1.0, lfo=0.25):
    t = tt(d); y = np.zeros_like(t); amps = [1 / k ** roll for k in range(1, h + 1)]
    for n in notes:
        for det in (-0.0025, 0, 0.0031): y += osc_sum(m2f(n) * (1 + det), t, amps)
    return y * env(len(t), att, rel) * (1 + 0.15 * np.sin(2 * np.pi * lfo * t + rng.uniform(0, 6))) * g / len(notes)

def drone(n, d, g=1.0, h=12, roll=1.2, lfo=0.125, hi=1200):
    t = tt(d); f = m2f(n); a = [1 / k ** roll for k in range(1, h + 1)]
    y = fftfilt(osc_sum(f, t, a) + osc_sum(f * 1.002, t, a), 0, hi)
    return y * (1 + 0.2 * np.sin(2 * np.pi * lfo * t)) * g

def pluck(n, d=2.0, bright=1.3, g=1.0):
    f = m2f(n); t = tt(d); y = np.zeros_like(t)
    for k in range(1, 16):
        if f * k > 9000: break
        y += (1 / k ** bright) * np.exp(-t * (1.0 + 0.85 * k)) * np.sin(2 * np.pi * f * k * t * (1 + 0.0004 * k * k))
    return y * env(len(t), 0.004, 0.08) * g

def drum(f0=60, d=1.2, g=1.0, snap=0.3, dec=4.5):
    t = tt(d); fr = f0 * (1 + 1.2 * np.exp(-t * 28))
    y = np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t * dec)
    nz = fftfilt(rng.standard_normal(len(t)), 80, 900) * np.exp(-t * 30) * snap
    return (y + nz) * env(len(t), 0.002, 0.1) * g

def snare(d=0.25, g=1.0):
    t = tt(d); nz = fftfilt(rng.standard_normal(len(t)), 900, 5000) * np.exp(-t * 22)
    return (nz + np.sin(2 * np.pi * 190 * t) * np.exp(-t * 35) * 0.5) * g

def tick(d=0.06, g=1.0, lo=5000, hi=11000, dec=70):
    t = tt(d); return fftfilt(rng.standard_normal(len(t)), lo, hi) * np.exp(-t * dec) * g

def saw(f, t, hmax=8000, roll=1.0):
    return osc_sum(f, t, [1 / k ** roll for k in range(1, max(2, int(hmax / f)) + 1)])

# ================= effekter =================
def axe_charge():  # stigande sus ~0,8 s, slutar i en metallisk klang
    d = 0.85; t = tt(d); u = t / d
    fc = 260 * (3000 / 260) ** (u ** 1.3)
    w = svf(noise(d), fc, 3.0) * (0.15 + u ** 1.6) * (1 + 0.35 * np.sin(2 * np.pi * (6 * t + 9 * t ** 2)))
    hum = np.sin(2 * np.pi * np.cumsum(70 + 90 * u ** 2) / SR); hum = (hum + 0.4 * np.sign(hum) * np.abs(hum) ** 3) * u ** 1.2 * 0.35
    ring = np.zeros_like(t)
    for f, a in ((2380, 1), (3490, 0.6), (5170, 0.35), (6930, 0.2)):
        ring += a * np.sin(2 * np.pi * f * t) * np.clip((u - 0.55) / 0.4, 0, 1) ** 2
    y = w / np.abs(w).max() + hum + 0.18 * ring
    return y * env(len(t), 0.02, 0.06)

def axe_throw():  # snurrande sus: bandpassat brus med rotationspuls som sjunker i tonhöjd
    d = 0.6; t = tt(d); u = t / d
    w = svf(noise(d), 1400 - 600 * u, 2.2)
    rot = 0.5 + 0.5 * np.cos(2 * np.pi * np.cumsum(16 - 5 * u) / SR) ** 4
    return w * rot * env(len(t), 0.03, 0.2) * (1 - 0.4 * u)

def spin_whoosh(d, f0, f1, q=2.0):
    t = tt(d); u = t / d
    return svf(noise(d), f0 + (f1 - f0) * u, q) * np.sin(np.pi * u) ** 1.5

def icewolf():  # yl ~1,25 s
    d = 1.3; t = tt(d)
    f0 = np.interp(t, [0, 0.08, 0.38, 0.95, 1.3], [250, 300, 455, 430, 300])
    f0 = f0 * (1 + 0.012 * np.sin(2 * np.pi * 5.3 * t) * np.clip((t - 0.3) / 0.3, 0, 1))
    vow = np.clip((t - 0.1) / 0.5, 0, 1)  # "uu" -> "oo" -> "uu"
    F = [(420, 90, 1.0), (850, 140, 0.45), (2500, 300, 0.06)]
    y = voice(f0, F, 6000, jitter=0.002, roll=0.8)
    # rå början: undertonsmodulering de första 0,2 s
    y *= 1 + 0.5 * np.clip(1 - t / 0.2, 0, 1) * np.sin(np.pi * np.cumsum(f0) / SR)
    br = svf(noise(d), 1800 + 600 * vow, 1.5) * 0.08
    y = (y / np.abs(y).max() + br) * env(len(t), 0.12, 0.4) * (0.75 + 0.25 * np.sin(np.pi * np.clip(t / 0.9, 0, 1)))
    return verb(y, 1.6, 0.35, 4000)[:int(1.55 * SR)]

def wisp():  # isigt klockspel
    d = 1.0; y = np.zeros(int(d * SR))
    for i, n in enumerate((88, 95, 100, 93)):
        place(y, 0.055 * i, bar(m2f(n), d - 0.055 * i, 0.6 if i else 0.8, dec=2.8))
    t = tt(d); y += fftfilt(noise(d), 6000, 12000) * np.exp(-t * 6) * 0.04
    y *= 1 + 0.25 * np.sin(2 * np.pi * 11 * t)
    return fade_tail(verb(y, 1.2, 0.35, 9000)[:int(1.1 * SR)], 0.3)

def wisp_burst():  # irrblosset brister: luftstöt + fallande glittermoln
    d = 0.9; t = tt(d); y = np.zeros(len(t))
    y += fftfilt(noise(d), 2500, 10000) * np.exp(-t * 14) * 0.5
    for i in range(14):
        n = 100 - i * 1.5 + rng.uniform(-2, 2)
        place(y, 0.012 * i + rng.uniform(0, 0.02), bar(m2f(n), 0.6, 0.35, dec=6))
    return fade_tail(verb(y, 0.9, 0.3, 9000)[:int(1.0 * SR)], 0.25)

def crackle(d, n=40, grow=True, lo=900, hi=7000):  # isknak: täta klick med korta resonanser
    y = np.zeros(int(d * SR))
    for i in range(n):
        u = rng.uniform(0, 1) ** (0.6 if grow else 1.6); f = rng.uniform(lo, hi)
        c = np.sin(2 * np.pi * f * tt(0.02)) * np.exp(-tt(0.02) * rng.uniform(250, 500)) * rng.uniform(0.3, 1)
        place(y, u * (d - 0.03), c)
    return y

def ice_crack():
    d = 0.7; t = tt(d); y = crackle(d, 55) * 0.8
    y += np.sin(2 * np.pi * np.cumsum(90 * (1 + np.exp(-t * 40))) / SR) * np.exp(-t * 18) * 0.6  # dov knäck
    y += fftfilt(noise(d), 2000, 9000) * np.exp(-t * 25) * 0.3
    return fade_tail(y, 0.2)

def icicle_whistle():  # fallande vissling före nedslaget
    d = 0.42; t = tt(d); u = t / d
    f = 3200 * (1150 / 3200) ** u
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.4 + svf(noise(d), f, 4) * 0.6
    return y * np.clip(u / 0.6, 0, 1) ** 2

def raven():  # två kraxningar
    out = np.zeros(int(0.95 * SR))
    for t0, f_hi, f_lo, dd in ((0.0, 520, 410, 0.24), (0.36, 500, 380, 0.3)):
        t = tt(dd); f0 = np.interp(t, [0, 0.03, dd], [f_hi * 0.9, f_hi, f_lo])
        F = [(1250, 220, 1.0), (2300, 300, 0.8), (3400, 400, 0.4)]
        y = voice(f0, F, 8000, jitter=0.02, roll=0.3)
        y = np.tanh(2.5 * y / np.abs(y).max())
        y += svf(noise(dd), 2200, 1.0) * 0.25
        y *= env(len(t), 0.012, 0.08) * (1 + 0.6 * np.sin(np.pi * np.cumsum(f0) / SR))
        place(out, t0, y)
    return verb(out, 0.7, 0.18, 6000)[:int(1.05 * SR)]

def pup_bark():  # valpskall: "vov" + kortare "voff"
    out = np.zeros(int(0.42 * SR))
    for t0, sc, dd in ((0.0, 1.0, 0.14), (0.19, 0.92, 0.11)):
        t = tt(dd); f0 = np.interp(t, [0, 0.015, dd], [620, 820, 470]) * sc
        F1 = np.interp(t, [0, 0.03, dd], [700, 1000, 650])
        y = np.zeros_like(t); ph = 2 * np.pi * np.cumsum(f0) / SR
        for k in range(1, 14):
            y += (1 / (1 + ((k * f0 - F1) / 220) ** 2) + 0.5 / (1 + ((k * f0 - 2100) / 400) ** 2) + 0.02) / k ** 0.3 * np.sin(k * ph)
        y = np.tanh(1.8 * y / np.abs(y).max()) + svf(noise(dd), 1600, 0.9) * 0.35 * np.exp(-t * 25)
        place(out, t0, y * env(len(t), 0.004, 0.05) * np.exp(-t * 6) * sc)
    return verb(out, 0.4, 0.12, 6000)[:int(0.5 * SR)]

def mystic_chord():  # Skrjabins mystiska ackord C F# Bb E A D: dyna + harpsvep + klocka
    notes = [48, 54, 58, 64, 69, 74]; d = 2.4; y = np.zeros(int(d * SR))
    place(y, 0.0, pad(notes, d, 0.25, 1.0, h=6, roll=2.0, g=1.0, lfo=1.1))
    for i, n in enumerate(notes + [78, 82]):
        place(y, 0.035 * i, pluck(n + 12, 1.6, 1.5, 0.12))
    place(y, 0.0, bell(72, 2.4, 0.06))
    return fade_tail(verb(y, 2.2, 0.4, 5000)[:int(2.4 * SR)], 0.6)

def choir(notes, d, att=0.2, rel=0.5, g=1.0, vib=5.0):  # kör på "aa"
    t = tt(d); y = np.zeros_like(t); F = [(700, 110, 1.0), (1150, 130, 0.55), (2650, 180, 0.22)]
    for n in notes:
        for det in (-0.004, 0.0035):
            f0 = m2f(n) * (1 + det) * (1 + 0.006 * np.sin(2 * np.pi * (vib + rng.uniform(-.4, .4)) * t + rng.uniform(0, 6)))
            y += voice(f0, F, 5000, roll=1.0)
    return y * env(len(t), att, rel) * g / len(notes)

def bless():  # ljus välsignelse: kör i G-dur + stigande klockor
    d = 1.6; y = np.zeros(int(d * SR))
    place(y, 0.0, choir([67, 71, 74, 79], d, 0.12, 0.6, 0.9))
    for i, n in enumerate((79, 83, 86, 91, 95)):
        place(y, 0.06 * i, bar(m2f(n), d - 0.06 * i, 0.22, dec=2.5))
    return fade_tail(verb(y, 1.8, 0.4, 7000)[:int(1.8 * SR)], 0.45)

def fuse_cards():  # två svep möts + glittrande ackord
    d = 1.3; t = tt(d); y = np.zeros(len(t)); u = np.clip(t / 0.65, 0, 1)
    a = np.sin(2 * np.pi * np.cumsum(420 * (1180 / 420) ** u) / SR)
    b = np.sin(2 * np.pi * np.cumsum(2600 * (1180 / 2600) ** u) / SR)
    sw = (a + 0.6 * b) * (u ** 1.5) * (t < 0.66) * (1 + 0.5 * np.sin(2 * np.pi * 18 * t))
    y += sw * 0.35 + svf(noise(d), 800 + 3000 * u, 2.5) * u ** 2 * (t < 0.66) * 0.5
    for i, n in enumerate((74, 78, 81, 86, 90)):
        place(y, 0.64 + 0.03 * i, bar(m2f(n), 0.65, 0.3, dec=3))
    place(y, 0.63, drum(110, 0.4, 0.35, 0.1, dec=12))
    return fade_tail(verb(y, 1.2, 0.3, 8000)[:int(1.45 * SR)], 0.35)

def headshot_ping():  # skarpt metalliskt pling
    d = 0.4; t = tt(d); y = np.zeros_like(t)
    for f, a, dec in ((2850, 1, 14), (4210, 0.6, 18), (6020, 0.35, 24), (7900, 0.2, 30)):
        y += a * np.sin(2 * np.pi * f * t) * np.exp(-t * dec)
    y += fftfilt(noise(d), 3000, 10000) * np.exp(-t * 200) * 1.2
    return y * env(len(t), 0.0005, 0.03)

def chime_bell():  # liten prästklocka
    y = np.zeros(int(1.1 * SR))
    place(y, 0.0, bell(84, 1.1, 1.0)); place(y, 0.32, bell(81, 0.78, 0.6))
    return y

def whisper(src, start, d, rev=True):  # viskning: röstens spektrum med slumpad fas (ohörbara ord)
    x = rd(src); x = x[::-1] if rev else x
    i0 = int(start * SR); x = x[i0:i0 + int(d * SR)]
    N, hop = 1024, 256; w = np.hanning(N); pad_ = np.zeros(len(x) + N); pad_[:len(x)] = x
    out = np.zeros(len(pad_) + N); norm = np.zeros_like(out)
    for i in range(0, len(x), hop):
        fr = pad_[i:i + N] * w; X = np.abs(np.fft.rfft(fr))
        y = np.fft.irfft(X * np.exp(1j * rng.uniform(0, 2 * np.pi, len(X))), N) * w
        out[i:i + N] += y; norm[i:i + N] += w ** 2
    y = out / np.maximum(norm, 1e-3); y = fftfilt(y[:len(x)], 500, 9000)
    return y * env(len(y), 0.03, 0.15)

def mumble(src, start, d, lp=850):  # mummel: baklänges, dovt
    x = rd(src)[::-1]; i0 = int(start * SR); x = x[i0:i0 + int(d * SR)]
    return fftfilt(x, 90, lp) * env(len(x), 0.02, 0.12)

def potion_ice_fx():
    d = 0.95; t = tt(d); y = crackle(d, 45, grow=False, lo=2500, hi=9000) * 0.5
    for i, n in enumerate((96, 91, 98)):
        place(y, 0.04 * i, bar(m2f(n), d - 0.04 * i, 0.5, dec=3.5))
    y += fftfilt(noise(d), 5000, 11000) * np.exp(-t * 5) * 0.12
    return fade_tail(y, 0.3)

def speed_rise():
    d = 0.6; t = tt(d); u = t / d
    y = svf(noise(d), 500 * (6000 / 500) ** u, 4) * u ** 1.2 + 0.25 * np.sin(2 * np.pi * np.cumsum(300 * (1800 / 300) ** u) / SR) * u
    return y * env(len(t), 0.02, 0.05)

def low_rumble(d, f=45):
    t = tt(d); return fftfilt(noise(d), 20, 160) * 0.7 + 0.3 * np.sin(2 * np.pi * f * t) * (1 + 0.3 * np.sin(2 * np.pi * 7 * t))

fx = dict(axe_charge=axe_charge, axe_throw=axe_throw, icewolf=icewolf, wisp=wisp, wisp_burst=wisp_burst,
          ice_crack=ice_crack, icicle_whistle=icicle_whistle, raven=raven, pup_bark=pup_bark,
          route_choice=mystic_chord, bless=bless, fuse_cards=fuse_cards, headshot_ping=headshot_ping,
          chime_bell=chime_bell, potion_ice=potion_ice_fx, speed_rise=speed_rise)
for k, f in fx.items(): wr('s_' + k, f())
wr('s_whisper_a', whisper('vox_a', 0.25, 1.6)); wr('s_whisper_b', whisper('vox_b', 0.4, 1.5))
wr('s_mumble_a', mumble('vox_b', 0.2, 0.95, 900)); wr('s_mumble_b', mumble('vox_a', 0.5, 1.0, 700))
wr('s_rumble', low_rumble(2.0))

# ================= musik =================
class Loop:
    def __init__(s, T):
        s.N = int(round(T * SR)); s.L = np.zeros(s.N); s.R = np.zeros(s.N)
    def add(s, t0, sig, pan=0.0, g=1.0):
        gl = np.cos((pan + 1) * np.pi / 4) * g * 1.414; gr = np.sin((pan + 1) * np.pi / 4) * g * 1.414
        i = int(round(t0 * SR)) % s.N; k = 0; n = len(sig)
        while k < n:
            m = min(n - k, s.N - i)
            s.L[i:i + m] += sig[k:k + m] * gl; s.R[i:i + m] += sig[k:k + m] * gr
            k += m; i = 0
    def reverb(s, length=3.0, wet=0.3, bright=3500, pre=0.02):
        n = int(length * SR); t = np.arange(n) / SR; out = []
        for ch in (s.L, s.R):
            ir = rng.standard_normal(n) * np.exp(-t * 6.9 / length)
            ir = fftfilt(ir, 120, bright); ir[:int(pre * SR)] = 0; ir /= np.sqrt((ir ** 2).sum())
            h = np.zeros(s.N); h[:min(n, s.N)] = ir[:s.N]
            out.append(np.fft.irfft(np.fft.rfft(ch) * np.fft.rfft(h), s.N))
        s.L = s.L + wet * out[0]; s.R = s.R + wet * out[1]
    def write(s, name): wr(name, np.stack([s.L, s.R], 1).reshape(-1), 2)

# ---- frost: e-moll/lydiskt, 53,3 bpm, 8 takter = 36 s: drönare, glasdyna, klockspel, kyrkklocka ----
def frost():
    b = 1.125; T = 32 * b; base = Loop(T); hi = Loop(T)
    base.add(0, drone(28, T, 0.5, h=6, roll=1.6, lfo=1 / 18, hi=500) + drone(35, T, 0.28, h=6, roll=1.6, lfo=1 / 12, hi=700), 0)
    chords = [[52, 59, 66, 67], [48, 55, 59, 66], [45, 52, 59, 60], [47, 54, 59, 63]]  # Em9 Cmaj7#11 Am9 B
    for i, ch in enumerate(chords):
        base.add(i * 8 * b - 1.0, pad([n + 12 for n in ch], 8 * b + 3.0, 3.0, 3.0, h=4, roll=2.4, g=0.42, lfo=0.13), 0)
    for t0, n in ((0, 40), (16, 36)): base.add(t0 * b, bell(n, 9.0, 0.35), -0.3)
    mel = [(0.5, 83), (3, 79), (4.5, 78), (7, 71), (9, 79), (10.5, 83), (12, 86), (15, 78),
           (17, 76), (19.5, 72), (21, 79), (24.5, 78), (26, 83), (27.5, 81), (29, 75), (30.5, 71)]
    for k, (t0, n) in enumerate(mel):
        base.add(t0 * b, bar(m2f(n + 12), 3.5, 0.32, dec=1.1), 0.45 if k % 2 else -0.45)
        base.add(t0 * b + 0.375 * b, bar(m2f(n + 12), 3.0, 0.08, dec=1.3), -0.6 if k % 2 else 0.6)  # eko
    for _ in range(40):  # glitter
        base.add(rng.uniform(0, T), bar(m2f(rng.choice([95, 98, 100, 102, 107])), 1.2, 0.05, dec=3), rng.uniform(-0.9, 0.9))
    # intensitetslager: puls i åttondelar, ramtrumma, tremolostråkar, isklick i sextondelar
    roots = [40, 36, 45, 35]
    for i, r in enumerate(roots):
        top = [r + 24, r + 31] if r != 35 else [59, 66]
        st = pad(top, 8 * b + 0.6, 0.5, 0.6, h=7, roll=1.5, g=0.25, lfo=0.2)
        st *= 0.6 + 0.4 * np.sin(2 * np.pi * (4 / b) * tt(8 * b + 0.6)) ** 2
        hi.add(i * 8 * b - 0.3, st, 0.3)
        for bb in range(2):
            t1 = i * 8 * b + bb * 4 * b
            for k, step in enumerate([0, 0, 12, 0, 7, 0, 12, 0]):
                hi.add(t1 + k * b / 2, pluck(r + step, 0.5, bright=1.8, g=0.5 if k % 4 == 0 else 0.32), -0.15)
            for tb, gg in ((0, 1.0), (1.5, 0.55), (2.0, 0.8), (3.5, 0.45)):
                hi.add(t1 + tb * b, drum(52, 1.2, gg * 0.85, 0.15), 0.05)
            for k in range(16):
                hi.add(t1 + k * b / 4, tick(0.05, 0.16 if k % 4 == 2 else 0.08), 0.5 if k % 2 else -0.5)
    base.reverb(5.0, 0.5, 6000, 0.04); hi.reverb(2.2, 0.25, 5000)
    base.write('frost'); hi.write('frost_hi')

# ---- boss2: c-frygiskt, 150 bpm, 16 takter = 25,6 s: drivande bas, taiko, mässing, kör ----
def boss2():
    b = 0.4; T = 64 * b; L = Loop(T)
    prog = [(36, [60, 63, 67]), (37, [61, 65, 68]), (32, [60, 63, 68]), (31, [59, 62, 67])]  # Cm Db Ab G
    for half in range(2):
        for i, (r, ch) in enumerate(prog):
            t0 = (half * 8 + i * 2) * 4 * b
            # bas: åttondelar 3+3+2, distad sågtand
            for k in range(16):
                step = [0, 0, 0, 0, 0, 0, 1, -2][k % 8] if i % 2 == 0 else [0, 0, 0, 0, 0, 0, 0, 1][k % 8]
                n = r + step; t = tt(b / 2 * 0.92)
                y = saw(m2f(n), t, 3000) + saw(m2f(n) * 1.005, t, 3000) * 0.7
                y = fftfilt(y, 30, 900); y = np.tanh(2.2 * y / np.abs(y).max()) * env(len(t), 0.004, 0.04)
                L.add(t0 + k * b / 2, y, 0, 0.55 if k % 8 in (0, 3, 6) else 0.36)
            # kör
            L.add(t0 - 0.05, choir([n + (12 if half else 0) for n in ch], 8 * b + 0.4, 0.4, 0.6), 0, 0.5 if half else 0.38)
            # mässingsstöt på ackordbytet (tritonus på G)
            for j, (tb, dur_) in enumerate(((0, 1.5), (4, 1.0), (5.5, 1.5))):
                notes = [r + 12, r + 18] if r == 31 else [r + 12, r + 19]
                tm = tt(dur_ * b + 0.3); y = sum(saw(m2f(n) * (1 + dt), tm, 5000) for n in notes for dt in (-0.003, 0.003))
                fc = 500 + 2200 * np.exp(-tm * 7) + 300 * np.exp(-tm * 1.5)
                y = svf(y / np.abs(y).max(), fc, 0.9, 'lp') * env(len(tm), 0.02, 0.2)
                L.add(t0 + tb * b, y, 0.25 if j % 2 else -0.25, 0.42)
            # taiko
            for bar_ in range(2):
                t1 = t0 + bar_ * 4 * b
                for tb, f0, gg in ((0, 48, 1.0), (1.5, 48, 0.7), (2.5, 62, 0.6), (3, 48, 0.8)):
                    L.add(t1 + tb * b, drum(f0, 1.2, gg, 0.5, dec=6), -0.1)
                if (i * 2 + bar_) % 4 == 3:  # trumvirvel
                    for k in range(4): L.add(t1 + 3 * b + k * b / 4, drum(70 + 6 * k, 0.5, 0.35 + 0.1 * k, 0.4, dec=9), 0.2)
                for k in range(16):  # hi-hat
                    L.add(t1 + k * b / 4, tick(0.05, (0.09 if k % 2 else 0.14) * (1.3 if half else 0.8)), 0.4)
                if half:
                    for tb in (1, 3): L.add(t1 + tb * b, snare(0.3, 0.5), 0.1)
        # högt stråkostinato i andra halvan
        if half:
            for i, (r, ch) in enumerate(prog):
                arp = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 12]
                for k in range(32):
                    L.add((8 + i * 2) * 4 * b + k * b / 4, pluck(arp[k % 4], 0.3, 1.2, 0.12 if k % 4 else 0.18), 0.5)
    L.add(0, bell(36, 6.0, 0.6), 0.0); L.add(32 * b, bell(37, 6.0, 0.5), 0.0)
    L.add(0, drone(24, T, 0.35, h=10, roll=1.3, lfo=1 / 6.4, hi=400), 0)
    L.reverb(2.0, 0.25, 4500)
    L.write('boss2')

frost(); boss2()
PY
python3 -I "$T/synth3.py" "$T"

# ---------- musik ----------
mus frost -20 anull "$T/frost.wav"
mus frost_hi -23 anull "$T/frost_hi.wav"
mus boss2 -19 anull "$T/boss2.wav"

# ---------- ljudeffekter ----------
# yxan
fx axe_swing "[0:a]$P,$ST,asetrate=35280,aresample=44100,highpass=f=120[a];[1:a]$P,asetrate=33075,aresample=44100,volume=0.7[b];[a][b]$(mix 2),atrim=0:0.5,afade=t=out:st=0.35:d=0.15[o]" "$S/Combat and Gore/swipe.wav" "$H/Character/woosh_5.wav"
fx axe_hit "[0:a]$P[a];[1:a]$P,volume=0.8,lowpass=f=2500[b];[2:a]$P,volume=0.45,adelay=10[c];[a][b][c]$(mix 3),atrim=0:0.55,afade=t=out:st=0.35:d=0.2[o]" "$R/chop.ogg" "$I/impactPunch_heavy_002.ogg" "$S/Combat and Gore/crunch_quick.wav"
fx axe_charge "$P" "$T/s_axe_charge.wav"
fx axe_throw "[0:a]$P[a];[1:a]$P,$ST,volume=0.5,asetrate=39690,aresample=44100[b];[a][b]$(mix 2),afade=t=out:st=0.45:d=0.15[o]" "$T/s_axe_throw.wav" "$S/Combat and Gore/swipe.wav"
# eldkastaren
TOP=-4 fxloop flamer_loop 1.8 0.35 "[0:a]$P,asetrate=26460,aresample=44100,lowpass=f=2400,atrim=0:2.2[a];[1:a]$P,highpass=f=1500,volume=0.3,atrim=0:2.2[b];[2:a]$P,atrim=1:3.2,asetpts=PTS-STARTPTS,highpass=f=2500,volume=0.35[c];[a][b][c]$(mix 3)[o]" "$H/House & Office/Gas Stove_running.wav" "$H/House & Office/Gas Stove_running.wav" "$H/House & Office/Food_sizzling_6.wav"
fx flamer_start "[0:a]$P,volume=0.9[a];[1:a]$P,asetrate=26460,aresample=44100,lowpass=f=2400,atrim=0:0.7,afade=t=in:d=0.15,adelay=60[b];[2:a]$P,lowpass=f=3000,volume=0.6[c];[a][b][c]$(mix 3),atrim=0:0.7,afade=t=out:st=0.45:d=0.25[o]" "$S/Environment/fire_lighting.wav" "$H/House & Office/Gas Stove_running.wav" "$S/Environment/air_burst.wav"
fx flamer_end "[0:a]$P,atrim=0.75:1.5,asetpts=PTS-STARTPTS,asetrate=30870,aresample=44100,lowpass=f=3500[a];[1:a]$P,volume=0.5,adelay=30[b];[a][b]$(mix 2),atrim=0:0.75,afade=t=out:st=0.45:d=0.3[o]" "$H/Character/Air Compressor Stopping.wav" "$H/House & Office/Gas Stove_turning off.wav"
# granatkastaren: dov "tunk"
fx launcher_fire "[0:a]$P,asetrate=30870,aresample=44100[a];[1:a]$P,asetrate=33075,aresample=44100,volume=0.7,lowpass=f=1800[b];[2:a]$P,volume=0.8,lowpass=f=900[c];[3:a]$P,volume=0.5,highpass=f=300,adelay=15[d];[a][b][c][d]$(mix 4),atrim=0:0.7,afade=t=out:st=0.4:d=0.3[o]" "$S/Weapons/harsh_thud.wav" "$S/Weapons/shot_muffled.wav" "$I/impactPunch_heavy_001.ogg" "$S/Environment/air_burst.wav"
# ghoul
fx ghoul "[0:a]$P,asetrate=37485,aresample=44100,lowpass=f=3500[a];[1:a]$P,volume=0.55,adelay=250[b];[a][b]$(mix 2),atrim=0:1.2,afade=t=out:st=0.9:d=0.3[o]" "$H/Monsters & Ghosts/Zombie_6.wav" "$S/Other/munching_food.wav"
fx ghoul_eat "[0:a]$P[a];[1:a]$P,atrim=2:3.2,asetpts=PTS-STARTPTS,volume=0.7[b];[2:a]$P,volume=0.5,adelay=350[c];[a][b][c]$(mix 3),atrim=0:1.2,afade=t=out:st=0.9:d=0.3[o]" "$S/Other/munching_food.wav" "$H/Monsters & Ghosts/Gore_mushy.wav" "$S/Combat and Gore/squelching_3.wav"
# kultisten: viskning + nedstämd spökkör
fx cultist "[0:a]$P,volume=0.8[a];[1:a]$P,atrim=1.2:3.0,asetpts=PTS-STARTPTS,asetrate=33075,aresample=44100,lowpass=f=2000,volume=0.7,afade=t=in:d=0.2[b];[a][b]$(mix 2),atrim=0:1.5,afade=t=out:st=1.1:d=0.4[o]" "$T/s_whisper_a.wav" "$H/Monsters & Ghosts/Ghost chior.wav"
fx curse "[0:a]$P,atrim=0:1.5,lowpass=f=2500[a];[1:a]$P,atrim=2:3.6,asetpts=PTS-STARTPTS,asetrate=33075,aresample=44100,volume=0.8,afade=t=in:d=0.1[b];[2:a]$P,areverse,volume=0.5,highpass=f=800[c];[a][b][c]$(mix 3),atrim=0:1.4,afade=t=out:st=1.0:d=0.4[o]" "$H/Stingers and Spooky Triggers/Slide guitar_decreasing pitch.wav" "$H/Monsters & Ghosts/Tone_Moaning_Deep_3.wav" "$T/s_whisper_b.wav"
# gargoylen
fx gargoyle_wake "[0:a]$P,atrim=0.2:2.4,asetpts=PTS-STARTPTS,asetrate=30870,aresample=44100,lowpass=f=3000[a];[1:a]$P,volume=0.6[b];[2:a]$P,volume=0.7,lowpass=f=1500[c];[a][b][c]$(mix 3),atrim=0:1.8,afade=t=in:d=0.05,afade=t=out:st=1.3:d=0.5[o]" "$S/Materials/stone_push_long.wav" "$T/s_rumble.wav" "$I/impactMining_000.ogg"
fx gargoyle "[0:a]$P,asetrate=33075,aresample=44100,lowpass=f=4000[a];[1:a]$P,volume=0.45,asetrate=35280,aresample=44100,lowpass=f=2500[b];[2:a]$P,volume=0.6[c];[a][b][c]$(mix 3),atrim=0:1.2,afade=t=out:st=0.85:d=0.35[o]" "$H/Monsters & Ghosts/Zombie_8.wav" "$H/Ambient/Screech_metalic_dragging_3.wav" "$I/impactMining_003.ogg"
# isvärlden
fx icewolf "$P" "$T/s_icewolf.wav"
fx wolf_bite "[0:a]$P[a];[1:a]$P,atrim=0:0.45,asetrate=55125,aresample=44100,volume=0.55[b];[2:a]$P,volume=0.5,lowpass=f=1500,adelay=90[c];[a][b][c]$(mix 3),atrim=0:0.55,afade=t=out:st=0.4:d=0.15[o]" "$H/Monsters & Ghosts/Bite.wav" "$H/Monsters & Ghosts/Monster_growl_5.wav" "$I/impactPunch_medium_002.ogg"
fx wisp "$P" "$T/s_wisp.wav"
fx wisp_burst "[0:a]$P[a];[1:a]$P,volume=0.5[b];[a][b]$(mix 2)[o]" "$T/s_wisp_burst.wav" "$I/impactGlass_light_003.ogg"
fx frost_boss_roar "[0:a]$P,asetrate=30870,aresample=44100[a];[1:a]$P,atrim=0:1.4,asetrate=26460,aresample=44100,volume=0.5,lowpass=f=2500[b];[2:a]$P,highpass=f=4000,atrim=0:1.9,afade=t=in:d=0.3,afade=t=out:st=0.6:d=1.2,volume=0.3[c];[3:a]$P,volume=0.45,adelay=60[d];[a][b][c][d]$(mix 4),atrim=0:2.0,afade=t=out:st=1.4:d=0.6[o]" "$H/Monsters & Ghosts/Monster_Roar_2.wav" "$H/Monsters & Ghosts/Ghost_scream_3.wav" "$S/Other/white_noise_long.wav" "$I/impactGlass_heavy_001.ogg"
fx ice_crack "[0:a]$P[a];[1:a]$P,volume=0.55,adelay=30[b];[a][b]$(mix 2),atrim=0:0.7,afade=t=out:st=0.5:d=0.2[o]" "$T/s_ice_crack.wav" "$I/impactGlass_heavy_000.ogg"
fx icicle_fall "[0:a]$P,volume=0.6[a];[1:a]$P,adelay=420[b];[2:a]$P,volume=0.5,adelay=470[c];[a][b][c]$(mix 3),atrim=0:1.1,afade=t=out:st=0.85:d=0.25[o]" "$T/s_icicle_whistle.wav" "$I/impactGlass_medium_001.ogg" "$I/impactGlass_light_000.ogg"
fx snow_step "$P,highpass=f=100" "$I/footstep_snow_001.ogg"
TOP=-4 fxloop wind_cold 3.6 0.6 "$P,atrim=1:5.4,asetpts=PTS-STARTPTS,highpass=f=220,equalizer=f=1700:t=q:w=1.2:g=7,equalizer=f=3400:t=q:w=2:g=4,lowpass=f=7000" "$S/Environment/ambient_wind.wav"
# drycker
fx drink "[0:a]$P,volume=0.6[a];[1:a]$P,atrim=0.2:0.9,asetpts=PTS-STARTPTS,adelay=60[b];[a][b]$(mix 2),atrim=0:0.8,afade=t=out:st=0.6:d=0.2[o]" "$I/impactGlass_light_002.ogg" "$S/Other/drink_slurp.wav"
fx potion_rage "[0:a]$P,atrim=1.2:2.2,asetpts=PTS-STARTPTS,asetrate=35280,aresample=44100[a];[1:a]$P,volume=0.8[b];[2:a]$P,volume=0.9,lowpass=f=600[c];[a][b][c]$(mix 3),atrim=0:1.0,afade=t=out:st=0.7:d=0.3[o]" "$H/Monsters & Ghosts/Monster_grunt_long.wav" "$S/Environment/fire_lighting.wav" "$I/impactPunch_heavy_000.ogg"
fx potion_ghost "[0:a]$P,atrim=0:1.4,highpass=f=300[a];[1:a]$P,volume=0.35[b];[a][b]$(mix 2),aecho=0.8:0.5:110|190:0.3|0.2,atrim=0:1.4,afade=t=in:d=0.05,afade=t=out:st=0.9:d=0.5[o]" "$S/Other/ghost_long.wav" "$T/s_whisper_b.wav"
fx potion_speed "[0:a]$P[a];[1:a]$P,volume=0.6[b];[2:a]$P,volume=0.5,adelay=380[c];[a][b][c]$(mix 3),atrim=0:0.9,afade=t=out:st=0.65:d=0.25[o]" "$T/s_speed_rise.wav" "$D/phaserUp3.ogg" "$S/Other/whoosh_1.wav"
TOP=-3 fx potion_ice "[0:a]$P[a];[1:a]$P,volume=0.6,highpass=f=1500[b];[a][b]$(mix 2)[o]" "$T/s_potion_ice.wav" "$S/Environment/ice_in_water.wav"
# övrigt
fx raven "$P" "$T/s_raven.wav"
fx lantern "[0:a]$P[a];[1:a]$P,volume=0.6,lowpass=f=3500,adelay=90[b];[2:a]$P,volume=0.4,atrim=0:0.5[c];[a][b][c]$(mix 3),atrim=0:0.75,afade=t=out:st=0.5:d=0.25[o]" "$R/metalClick.ogg" "$S/Environment/fire_lighting.wav" "$R/creak1.ogg"
fx pup_bark "$P" "$T/s_pup_bark.wav"
fx pup_bite "[0:a]$P,asetrate=52920,aresample=44100[a];[1:a]$P,atrim=0:0.4,asetrate=70560,aresample=44100,volume=0.4[b];[a][b]$(mix 2),atrim=0:0.45,afade=t=out:st=0.32:d=0.13[o]" "$H/Monsters & Ghosts/Bite.wav" "$H/Monsters & Ghosts/Monster_growl_5.wav"
fx npc_alchemist "[0:a]$P,asetrate=40425,aresample=44100[a];[1:a]$P,atrim=3:4.2,asetpts=PTS-STARTPTS,volume=0.6,afade=t=in:d=0.1[b];[a][b]$(mix 2),atrim=0:1.1,afade=t=out:st=0.8:d=0.3[o]" "$T/s_mumble_a.wav" "$H/Liquids/Bubbles.wav"
fx npc_priest "[0:a]$P,asetrate=39690,aresample=44100,aecho=0.8:0.4:70|130:0.3|0.2[a];[1:a]$P,volume=0.35,adelay=250[b];[a][b]$(mix 2),atrim=0:1.3,afade=t=out:st=0.9:d=0.4[o]" "$T/s_mumble_b.wav" "$T/s_chime_bell.wav"
fx bless "[0:a]$P[a];[1:a]$P,volume=0.3,highpass=f=600[b];[a][b]$(mix 2)[o]" "$T/s_bless.wav" "$S/Musical Effects/vibraphone_chime_positive.wav"
fx route_choice "$P" "$T/s_route_choice.wav"
fx fuse_cards "[0:a]$P[a];[1:a]$P,volume=0.5[b];[a][b]$(mix 2)[o]" "$T/s_fuse_cards.wav" "$C/card-fan-1.ogg"
TOP=-3 fx headshot "[0:a]$P[a];[1:a]$P,volume=0.45,highpass=f=800[b];[a][b]$(mix 2),atrim=0:0.4,afade=t=out:st=0.25:d=0.15[o]" "$T/s_headshot_ping.wav" "$I/impactMetal_light_003.ogg"
TOP=-6 fx low_ammo "[0:a]$P,atrim=0:0.12,highpass=f=700[a];[1:a]$P,volume=0.6[b];[a][b]$(mix 2),afade=t=out:st=0.08:d=0.04[o]" "$S/Environment/clock_tick_only.wav" "$UI/tick_004.ogg"
fx daily_reward "[0:a]$P[a];[1:a]$P,volume=0.35,adelay=120[b];[a][b]$(mix 2),atrim=0:1.7,afade=t=out:st=1.3:d=0.4[o]" "$S/Musical Effects/music_box_chime_positive.wav" "$S/Items/coin_jingle_small.wav"

for f in "$M"/frost.ogg "$M"/frost_hi.ogg "$M"/boss2.ogg; do printf '%-34s %6.2f s %5d kB\n' "$f" "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")" "$(( $(stat -c %s "$f") / 1024 ))"; done
