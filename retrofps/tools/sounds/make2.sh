#!/bin/bash
# Musik (assets/music) och nya ljudeffekter (assets/snd) för js/music.js och spelet.
# Källor: assets/audio (Kenney-paketen CC0, 400 Sounds Pack CC0, Abstraction Music Loop Bundle CC0)
# och Horror SFX Free ur releasen assets-large-v1 (packa upp den i $HORROR).
# Skogen, borggården och titelmusiken syntetiseras (python3 + numpy, inbäddat nedan).
# Kör från repo-roten: HORROR=/sökväg/till/"Horror SFX Free" bash retrofps/tools/sounds/make2.sh
set -e
O=retrofps/assets/snd
M=retrofps/assets/music
A=assets/audio
S="$A/400 Sounds Pack"
I=$A/impact-sounds/Audio
R=$A/rpg-audio/Audio
D=$A/digital-audio/Audio
UI=$A/ui-audio/Audio
L="$A/music-loop-bundle-2026-q2"
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
# mus NAMN LUFS 'graf' källor...: stereo 44,1 kHz Vorbis q1 (högst ~80 kbit/s), linjär förstärkning till LUFS
# (ingen dynamisk loudnorm, den förstör slingans skarv), toppen hålls under -1 dBFS.
# GAIN=x dB i miljön ger fast förstärkning i stället (för lager som ska följa grundspåret).
# LOOPLENGTH=<sampel> skrivs i Vorbis-kommentaren: Chrome avkodar några ms för mycket i slutet,
# så music.js slingar till exakt den punkten (loopEnd). Spelet kan göra likadant för lava/gas/fuse.
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
# Svansen läses med en egen sökning i filen.
xloop() { # xloop IN UT LEN X
  ffmpeg -loglevel error -y -i "$1" -ss "$3" -i "$1" -filter_complex "[0:a]atrim=0:$3,afade=t=in:d=$4:curve=qsin[p];[1:a]atrim=0:$4,afade=t=out:d=$4:curve=qsin[q];[p][q]amix=inputs=2:normalize=0:duration=first[o]" -map '[o]' "$2"
}
ST="silenceremove=start_periods=1:start_threshold=-50dB"

# ---------- musik ----------
cat > "$T/synth.py" <<'PY'
# Syntetiserade musikslingor för Krypta: forest(+_hi), courtyard(+_hi), title.
# Allt läggs med "wrap" (toner som går över slutet läggs på början) och efterklangen är en
# cirkulär faltning, så slingorna är sömlösa. Användning: python3 synth.py <utkatalog>
import sys, wave, numpy as np
SR = 44100
OUT = sys.argv[1]
rng = np.random.default_rng(1234)

def m2f(n): return 440.0 * 2 ** ((n - 69) / 12)
def tt(d): return np.arange(int(d * SR)) / SR

def env(n, att, rel, total=None):
    a = max(1, int(att * SR)); r = max(1, int(rel * SR))
    e = np.ones(n)
    a = min(a, n); e[:a] = np.sin(np.linspace(0, np.pi / 2, a)) ** 2
    r = min(r, n); e[n - r:] *= np.cos(np.linspace(0, np.pi / 2, r)) ** 2
    return e

def fftfilt(x, lo=0, hi=None, slope=1.0):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    g = np.ones_like(f)
    if hi: g *= 1 / (1 + (f / hi) ** (4 * slope))
    if lo: g *= 1 / (1 + (lo / np.maximum(f, 1e-3)) ** (4 * slope))
    return np.fft.irfft(X * g, len(x))

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
        n = int(length * SR); t = np.arange(n) / SR
        out = []
        for ch in (s.L, s.R):
            ir = rng.standard_normal(n) * np.exp(-t * 6.9 / length)
            ir = fftfilt(ir, 120, bright); ir[:int(pre * SR)] = 0; ir /= np.sqrt((ir ** 2).sum())
            h = np.zeros(s.N); h[:min(n, s.N)] = ir[:s.N]
            out.append(np.fft.irfft(np.fft.rfft(ch) * np.fft.rfft(h), s.N))
        s.L = s.L + wet * out[0]; s.R = s.R + wet * out[1]
    def write(s, name):
        x = np.stack([s.L, s.R], 1); x /= max(1e-9, np.abs(x).max()) / 0.8
        with wave.open(f'{OUT}/{name}.wav', 'wb') as w:
            w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
            w.writeframes((x * 32767).astype('<i2').tobytes())

# ---- instrument ----
def osc_sum(f, t, amps, phase=None):
    y = np.zeros_like(t)
    for k, a in enumerate(amps, 1):
        if f * k > SR * 0.45 or a == 0: continue
        y += a * np.sin(2 * np.pi * f * k * t + (phase[k - 1] if phase is not None else rng.uniform(0, 6.28)))
    return y

def pluck(n, d=2.0, bright=1.3, g=1.0):  # luta/harpa: övertoner som dör snabbare uppåt
    f = m2f(n); t = tt(d); y = np.zeros_like(t)
    for k in range(1, 16):
        if f * k > 9000: break
        y += (1 / k ** bright) * np.exp(-t * (1.0 + 0.85 * k)) * np.sin(2 * np.pi * f * k * t * (1 + 0.0004 * k * k))
    y *= env(len(t), 0.004, 0.08)
    return y * g

def pad(notes, d, att=1.5, rel=2.0, h=8, roll=1.7, g=1.0):  # stråk-/kördyna, tre stämda röster
    t = tt(d); y = np.zeros_like(t)
    amps = [1 / k ** roll for k in range(1, h + 1)]
    for n in notes:
        for det in (-0.0025, 0, 0.0031):
            y += osc_sum(m2f(n) * (1 + det), t, amps)
    lfo = 1 + 0.15 * np.sin(2 * np.pi * 0.25 * t + rng.uniform(0, 6))
    return y * env(len(t), att, rel) * lfo * g / len(notes)

def recorder(n, d, g=1.0):  # blockflöjt: sinus + svaga övertoner, vibrato, andning
    f = m2f(n); t = tt(d)
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.2 * t) * np.clip((t - 0.25) / 0.4, 0, 1)
    ph = 2 * np.pi * np.cumsum(f * vib) / SR
    y = np.sin(ph) + 0.22 * np.sin(2 * ph) + 0.08 * np.sin(3 * ph)
    br = fftfilt(rng.standard_normal(len(t)), f, f * 3) * 0.05
    return (y + br) * env(len(t), 0.07, 0.18) * g

def shawm(n, d, g=1.0):  # skalmeja: nasal, starka mellanövertoner
    f = m2f(n); t = tt(d)
    vib = 1 + 0.003 * np.sin(2 * np.pi * 5.5 * t)
    ph = 2 * np.pi * np.cumsum(f * vib) / SR
    amps = [0.5, 0.7, 1.0, 0.8, 0.6, 0.4, 0.28, 0.18, 0.12, 0.08]
    y = sum(a * np.sin(k * ph) for k, a in enumerate(amps, 1) if f * k < 8000)
    y = fftfilt(y, 0, 2600)
    return y * env(len(t), 0.05, 0.12) * g * 0.35

def drone(n, d, g=1.0, h=12, roll=1.2, lfo=0.125):
    t = tt(d); f = m2f(n)
    y = osc_sum(f, t, [1 / k ** roll for k in range(1, h + 1)]) + osc_sum(f * 1.002, t, [1 / k ** roll for k in range(1, h + 1)])
    y = fftfilt(y, 0, 1200)
    return y * (1 + 0.2 * np.sin(2 * np.pi * lfo * t)) * g

def bell(n, d=6.0, g=1.0):  # kyrkklocka: hum, prim, ters, kvint, oktav ...
    f = m2f(n); t = tt(d); y = np.zeros_like(t)
    for r, a, dec in ((0.5, 0.6, 0.35), (1, 1, 0.6), (1.19, 0.5, 0.9), (1.5, 0.35, 1.1), (2, 0.5, 1.4), (2.51, 0.25, 2.2), (3.01, 0.2, 2.8), (4.1, 0.12, 3.6)):
        y += a * np.exp(-t * dec) * np.sin(2 * np.pi * f * r * t + rng.uniform(0, 6))
    return y * env(len(t), 0.003, 0.5) * g

def drum(f0=60, d=1.2, g=1.0, snap=0.3):  # pukor/ramtrumma
    t = tt(d); fr = f0 * (1 + 1.2 * np.exp(-t * 28))
    y = np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t * 4.5)
    nz = fftfilt(rng.standard_normal(len(t)), 80, 900) * np.exp(-t * 30) * snap
    return (y + nz) * env(len(t), 0.002, 0.1) * g

def snare(d=0.25, g=1.0):
    t = tt(d); nz = fftfilt(rng.standard_normal(len(t)), 900, 5000) * np.exp(-t * 22)
    body = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 35) * 0.5
    return (nz + body) * g

def shaker(d=0.08, g=1.0):
    t = tt(d); return fftfilt(rng.standard_normal(len(t)), 4000, 9000) * np.exp(-t * 60) * g

# ---- skogen: d-moll, 60 bpm, 8 takter = 32 s ----
def forest():
    T = 32.0; base = Loop(T); hi = Loop(T)
    chords = [(50, [50, 53, 57, 62]), (46, [46, 50, 53, 58]), (43, [43, 46, 50, 55]), (45, [45, 49, 52, 57])]  # Dm Bb Gm A
    base.add(0, drone(38, T + 0.0, 0.5) + drone(45, T, 0.25), 0)
    for i, (root, ch) in enumerate(chords):
        t0 = i * 8
        base.add(t0 - 0.5, pad([n + 12 for n in ch[1:]], 9.0, 2.0, 2.5, g=0.5), 0.0)
        for bar in range(2):
            arp = [ch[0] + 12, ch[2] + 12, ch[3] + 12, ch[1] + 24, ch[3] + 12, ch[2] + 12] if bar == 0 else [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[3] + 12, ch[2] + 24, ch[1] + 12]
            for k, n in enumerate(arp):
                base.add(t0 + bar * 4 + k * (4 / 6), pluck(n, 2.2, g=0.32), -0.35 + 0.1 * (k % 3))
    mel = [(8, 65, 1.5), (9.5, 67, .5), (10, 69, 2), (12, 70, 1), (13, 69, 1), (14, 65, 2),
           (16, 67, 3), (19, 69, .5), (19.5, 70, .5), (20, 74, 2), (22, 72, 1), (23, 70, 1),
           (24, 69, 1.5), (25.5, 67, .5), (26, 65, 1), (27, 64, 1), (28, 64, 3.6)]
    for t0, n, d in mel: base.add(t0, recorder(n, d + 0.15, g=0.38), 0.25)
    # intensitetslager: låg ostinato i åttondelar, ramtrumma och shaker
    for i, (root, ch) in enumerate(chords):
        for bar in range(2):
            for k, step in enumerate([0, 0, 7, 0, 12, 0, 7, 0]):
                hi.add(i * 8 + bar * 4 + k * 0.5, pluck(root - 12 + step + (12 if root < 44 else 0), 0.45, bright=1.6, g=0.42 if k % 2 == 0 else 0.3), -0.1)
            b = i * 8 + bar * 4
            for tb, f0, gg in ((0, 62, 1.0), (2, 62, 0.8), (3.5, 74, 0.5)):
                hi.add(b + tb, drum(f0, 1.0, gg * 0.9), 0.1)
            for k in range(8): hi.add(b + k * 0.5 + 0.25, shaker(0.08, 0.12 if k % 2 else 0.18), 0.4)
    base.reverb(2.8, 0.35, 3800); hi.reverb(1.8, 0.2, 4500)
    base.write('forest'); hi.write('forest_hi')

# ---- borggården: c-moll, 80 bpm, 8 takter = 24 s ----
def courtyard():
    b = 0.75; T = 32 * b; base = Loop(T); hi = Loop(T)
    base.add(0, drone(36, T, 0.45, h=16, roll=1.0) + drone(43, T, 0.3, h=16, roll=1.0), 0)
    roots = [36, 36, 44, 46, 36, 36, 44, 43]  # Cm Cm Ab Bb Cm Cm Ab G
    for i, r in enumerate(roots):
        q = [r + 12, r + 15 if r in (36, 41) else r + 16, r + 19] if r != 43 else [55, 59, 62]
        if r == 36: q = [48, 51, 55]
        base.add(i * 4 * b - 0.2, pad(q, 4 * b + 0.8, 0.4, 0.8, g=0.35), 0)
        base.add(i * 4 * b, drum(55 if r == 36 else 49, 1.6, 0.8, snap=0.15), 0)
        base.add(i * 4 * b + 2 * b, drum(55, 1.2, 0.35, snap=0.1), 0)
    mel = [(0, 60, 1), (1, 62, 1), (2, 63, 2), (4, 62, 1), (5, 60, 1), (6, 58, 1), (7, 60, 1),
           (8, 56, 2), (10, 60, 1), (11, 63, 1), (12, 62, 2), (14, 58, 2),
           (16, 60, 1), (17, 62, 1), (18, 63, 1), (19, 65, 1), (20, 67, 2), (22, 65, 1), (23, 63, 1),
           (24, 63, 1.5), (25.5, 62, .5), (26, 60, 1), (27, 56, 1), (28, 59, 2), (30, 55, 2)]
    for t0, n, d in mel: base.add(t0 * b, shawm(n, d * b * 0.95, g=0.55), 0.2)
    for i in range(8):
        for k in range(8):  # virvel: åttondelar med betoning och en trumvirvel i slutet av var annan takt
            t0 = i * 4 * b + k * b / 2
            hi.add(t0, snare(0.25, 0.5 if k in (0, 4) else 0.28), -0.25)
            if i % 2 == 1 and k >= 6:
                for j in range(1, 3): hi.add(t0 + j * b / 6, snare(0.2, 0.22), -0.25)
        hi.add(i * 4 * b + b, drum(49, 1.0, 0.6, 0.2), 0.15); hi.add(i * 4 * b + 3 * b, drum(49, 1.0, 0.6, 0.2), 0.15)
        hi.add(i * 4 * b + 3.5 * b, drum(65, 0.8, 0.4, 0.2), 0.15)
    base.reverb(2.2, 0.3, 3500); hi.reverb(1.4, 0.18, 5000)
    base.write('courtyard'); hi.write('courtyard_hi')

# ---- titel: a-moll, 50 bpm, 8 takter = 38,4 s ----
def title():
    b = 1.2; T = 32 * b; L = Loop(T)
    L.add(0, drone(33, T, 0.5, h=8, roll=1.6, lfo=1 / 9.6), 0)
    chords = [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59], [57, 60, 64], [53, 57, 60], [50, 53, 57, 62], [52, 56, 59, 64]]
    for i, ch in enumerate(chords):
        L.add(i * 4 * b - 0.6, pad(ch, 4 * b + 1.8, 1.6, 2.2, h=6, roll=2.0, g=0.6), 0)
    for i in range(0, 8, 2): L.add(i * 4 * b, bell(45, 7.0, 0.7), -0.2)
    L.add(3 * 4 * b + 2 * b, bell(52, 5.0, 0.3), 0.3); L.add(7 * 4 * b + 2 * b, bell(56, 5.0, 0.3), 0.3)
    mel = [(16, 76, 3), (19, 74, 1), (20, 72, 3), (23, 71, 1), (24, 69, 2), (26, 72, 2), (28, 71, 3.6)]
    for t0, n, d in mel: L.add(t0 * b, recorder(n - 12, d * b, g=0.3), 0.15)
    L.reverb(4.0, 0.45, 3000)
    L.write('title')

forest(); courtyard(); title()
PY
python3 -I "$T/synth.py" "$T"
mus title -20 anull "$T/title.wav"
mus forest -20 anull "$T/forest.wav"
mus forest_hi -23 anull "$T/forest_hi.wav"
mus courtyard -20 anull "$T/courtyard.wav"
mus courtyard_hi -23 anull "$T/courtyard_hi.wav"
# färdiga slingor ur Abstraction-paketet. Avkodade har de ett litet hopp i skarven (ett klick),
# så de sista 6 ms tonas över början och slingan blir 6 ms kortare.
dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }
seam() { # seam KÄLLA UT.wav ['filter']
  ffmpeg -loglevel error -y -i "$1" -af "${3:-anull}" -ac 2 -ar 44100 "$T/seam.wav"
  xloop "$T/seam.wav" "$2" "$(calc "$(dur "$T/seam.wav") - 0.006")" 0.006
}
seam "$L/Week 19 - Dark Portents MYSTERIOUS TRAVELER.ogg" "$T/dungeon.wav"
mus dungeon -20 anull "$T/dungeon.wav"
mus boss -19 anull "$L/Week 19 - Dark Portents SHROUDED FUTURE.ogg" # slutar i tystnad, skarven är ren
seam "$L/Week 13 - Primordial Soup BASE.ogg" "$T/swamp.wav"
mus swamp -20 anull "$T/swamp.wav"
# MELODY är ett separat stämspår till BASE (okorrelerat, lika långt): samma förstärkning som grundspåret
seam "$L/Week 13 - Primordial Soup MELODY.ogg" "$T/swamp_hi.wav"
GAIN=$LASTGAIN mus swamp_hi 0 anull "$T/swamp_hi.wav"
# grottorna och kyrkogården: "Pull Me Down" två resp. tre halvtoner ned och mörkare.
# Källan spelas två varv och andra varvet behålls, så filtren har rätt tillstånd vid skarven.
slow() { # slow NAMN KÄLLA HALVTONER LOWPASS
  local r d; r=$(calc "44100 * 2 ^ (-$3 / 12)"); r=${r%.*}
  d=$(calc "$(dur "$2") * 44100 / $r")
  ffmpeg -loglevel error -y -stream_loop 1 -i "$2" -ac 2 -ar 44100 "$T/twice.wav"
  seam "$T/twice.wav" "$T/$1.wav" "aresample=44100,asetrate=$r,aresample=44100,lowpass=f=$4,highpass=f=35,atrim=start=$d:duration=$d"
  mus "$1" -20 anull "$T/$1.wav"
}
slow caves "$L/Week 24 - Pull Me Down DEEP WELL.ogg" 2 3200
slow graveyard "$L/Week 24 - Pull Me Down GRAVITY.ogg" 3 3800
# stingers
mus sting_win -17 "aecho=0.8:0.5:60|130:0.25|0.15,afade=t=out:st=3.3:d=0.6" "$S/Musical Effects/harpsichord_level_complete.wav"
mus sting_death -17 "[0:a]aresample=44100,aformat=channel_layouts=stereo[a];[1:a]aresample=44100,aformat=channel_layouts=stereo,atrim=0:4.5,volume=0.45,lowpass=f=1500[b];[a][b]amix=inputs=2:normalize=0:duration=longest,afade=t=out:st=3.6:d=0.9[o]" "$S/Musical Effects/harpsichord_defeated.wav" "$H/Ambient/Bell_low.wav"
mus sting_boss -17 "afade=t=out:st=3.4:d=0.85" "$H/Stingers and Spooky Triggers/Piano_stinger_dissonent.wav"
mus sting_challenge -17 "atrim=0:3.2,afade=t=in:d=0.05,afade=t=out:st=2.5:d=0.7" "$H/Stingers and Spooky Triggers/Suspenseful pitch increase.wav"

# ---------- ljudeffekter ----------
P="aresample=44100,aformat=sample_fmts=fltp:channel_layouts=mono"
mix() { echo "amix=inputs=$1:normalize=0:duration=longest"; }
fx jump "[0:a]$P,atrim=0:0.35,highpass=f=150[a];[1:a]$P,volume=0.5[b];[a][b]$(mix 2),afade=t=out:st=0.25:d=0.1[o]" "$R/cloth2.ogg" "$I/footstep_concrete_001.ogg"
fx land "[0:a]$P,lowpass=f=2500[a];[1:a]$P,volume=0.7[b];[a][b]$(mix 2),afade=t=out:st=0.35:d=0.2[o]" "$I/impactSoft_heavy_001.ogg" "$I/footstep_concrete_002.ogg"
fx dash "$ST,highpass=f=200,lowpass=f=6000,afade=t=out:st=0.5:d=0.25" "$S/Other/whoosh_2.wav"
fx grenade_throw "[0:a]$P,$ST[a];[1:a]$P,volume=0.6,adelay=40[b];[a][b]$(mix 2),afade=t=out:st=0.3:d=0.1[o]" "$S/Combat and Gore/swipe.wav" "$H/Character/Swoosh_3.wav"
fx grenade_bounce "[0:a]$P[a];[1:a]$P,volume=0.4[b];[a][b]$(mix 2),afade=t=out:st=0.2:d=0.1[o]" "$I/impactMetal_light_002.ogg" "$I/impactGeneric_light_000.ogg"
TOP=-8 fx grenade_beep "aevalsrc=exprs='(0.7*sin(2*PI*1760*t)+0.3*sin(2*PI*3520*t))*min(1,t/0.004)*min(1,(0.09-t)/0.01)':d=0.09:s=44100[o]"
fx lever "[0:a]$P[a];[1:a]$P,adelay=230[b];[2:a]$P,volume=0.5,lowpass=f=1500,adelay=250[c];[a][b][c]$(mix 3),afade=t=out:st=0.7:d=0.25[o]" "$H/House & Office/Fast crank_2.wav" "$R/metalLatch.ogg" "$I/impactMetal_heavy_000.ogg"
fx unlock "$ST,afade=t=out:st=0.65:d=0.15" "$S/Environment/lock_unlock.wav"
fx key "$ST,afade=t=out:st=0.4:d=0.1" "$S/Items/keys_jingling.wav"
fx anvil "[0:a]$P[a];[1:a]$P,volume=0.6[b];[2:a]$P,aresample=44100,asetrate=33075,aresample=44100,volume=0.35[c];[a][b][c]$(mix 3),atrim=0:1.4,afade=t=out:st=0.9:d=0.5[o]" "$I/impactMetal_heavy_003.ogg" "$S/Materials/metal_clang.wav" "$I/impactBell_heavy_002.ogg"
TOP=-4 fxloop lava 3 0.6 "[0:a]$P,asetrate=24255,aresample=44100,atrim=0:3.6[a];[1:a]$P,highpass=f=1800,volume=0.2,atrim=0:3.6[b];[a][b]$(mix 2),lowpass=f=2200[o]" "$S/Environment/water_boiling_loop.wav" "$H/House & Office/Food_sizzling_5.wav"
fx web "$ST,atrim=0:0.6,aresample=44100,asetrate=50000,aresample=44100,afade=t=out:st=0.4:d=0.13" "$S/Combat and Gore/squelching_2.wav"
fx bat "[0:a]$P,asetrate=70560,aresample=44100,volume=0.8[a];[1:a]$P,asetrate=70560,aresample=44100,volume=0.6,adelay=170[b];aevalsrc=exprs='0.35*lt(t,0.33)*lt(mod(t,0.11),0.04)*sin(PI*mod(t,0.11)/0.04)*sin(2*PI*(7500*mod(t,0.11)-40000*mod(t,0.11)^2))':d=0.4:s=44100[c];[a][b][c]$(mix 3)[o]" "$R/cloth4.ogg" "$R/cloth3.ogg"
fx hound "$ST,aresample=44100,asetrate=55125,aresample=44100,highpass=f=90,atrim=0:1.35,afade=t=out:st=1.0:d=0.35" "$H/Monsters & Ghosts/Monster_growl_5.wav"
fx spider "[0:a]$P,$ST,asetrate=57330,aresample=44100,tremolo=f=26:d=0.8[a];[1:a]$P,atrim=0:0.6,volume=0.5,highpass=f=1500[b];[a][b]$(mix 2),afade=t=out:st=0.5:d=0.15[o]" "$H/Monsters & Ghosts/Hiss.wav" "$S/Card and Board/dice_shake_2.wav"
fxloop fuse 1.2 0.3 "$P,atrim=0.5:2.0,asetpts=PTS-STARTPTS,highpass=f=1800,lowpass=f=9000" "$H/House & Office/Food_sizzling_5.wav"
fx shield_block "[0:a]$P[a];[1:a]$P,volume=0.5[b];[2:a]$P,volume=0.6,lowpass=f=900[c];[a][b][c]$(mix 3),afade=t=out:st=0.4:d=0.2[o]" "$I/impactPlate_heavy_002.ogg" "$I/impactMetal_medium_001.ogg" "$I/impactPunch_heavy_000.ogg"
fx spore "[0:a]$P,lowpass=f=2500[a];[1:a]$P,asetrate=33075,aresample=44100,lowpass=f=3000,volume=0.6[b];[a][b]$(mix 2),afade=t=out:st=0.45:d=0.2[o]" "$S/Environment/air_burst.wav" "$H/Liquids/Spray.wav"
fx gong "$P,asetrate=26460,aresample=44100,lowpass=f=4000,atrim=0:1.48,afade=t=out:st=0.8:d=0.68" "$I/impactBell_heavy_001.ogg"
fx ui_hover "$P,highpass=f=400" "$UI/rollover2.ogg"
fx ui_click "$P" "$UI/click3.ogg"
fx bullet_wall "[0:a]$P,atrim=0:0.35,highpass=f=250[a];[1:a]$P,volume=0.5[b];[a][b]$(mix 2),afade=t=out:st=0.22:d=0.12[o]" "$I/impactMining_002.ogg" "$I/impactGeneric_light_002.ogg"
fx gib "[0:a]$P[a];[1:a]$P,volume=0.8[b];[a][b]$(mix 2),atrim=0:1.2,afade=t=out:st=0.9:d=0.3[o]" "$H/Monsters & Ghosts/Gore_Wet_4.wav" "$S/Combat and Gore/crunch_splat.wav"
fx ice_break "[0:a]$P[a];[1:a]$P,volume=0.6,adelay=60[b];[2:a]$P,volume=0.35,adelay=90[c];[a][b][c]$(mix 3),afade=t=out:st=0.5:d=0.2[o]" "$I/impactGlass_heavy_002.ogg" "$I/impactGlass_medium_003.ogg" "$S/Environment/ice_in_water.wav"
TOP=-4 fxloop gas 2.2 0.4 "[0:a]$P,atrim=0.1:2.75,asetpts=PTS-STARTPTS,highpass=f=300[a];[1:a]$P,atrim=0:2.65,lowpass=f=900,volume=0.5[b];[a][b]$(mix 2)[o]" "$H/House & Office/Gas Stove_running.wav" "$H/Liquids/Bubbles.wav"
fx arrow "[0:a]$P,volume=0.7,lowpass=f=3000[a];[1:a]$P,adelay=40[b];[2:a]$P,volume=0.6,adelay=260[c];[a][b][c]$(mix 3),afade=t=out:st=0.5:d=0.1[o]" "$S/Other/elastic_twang.wav" "$H/Character/woosh.wav" "$S/Materials/cork_stabbed.wav"
fx prisoner "$P,$ST,aecho=0.8:0.4:90:0.3,afade=t=out:st=0.7:d=0.3" "$H/Monsters & Ghosts/Injured.wav"
fx fortune "$P,atrim=0:1.45,afade=t=out:st=1.15:d=0.3" "$S/Musical Effects/harpsichord_mystery.wav"
fx freeze "[0:a]$P,asetrate=66150,aresample=44100,volume=0.6[a];[1:a]$P[b];[2:a]$P,highpass=f=5000,atrim=0:0.7,afade=t=out:st=0.1:d=0.6,volume=0.4[c];[a][b][c]$(mix 3),atrim=0:1.0,afade=t=out:st=0.7:d=0.3[o]" "$S/Materials/glass_ping_big.wav" "$I/impactGlass_light_001.ogg" "$S/Other/white_noise_short.wav"
fx shock "[0:a]$P,lowpass=f=7000[a];[1:a]$P,atrim=1:1.6,asetpts=PTS-STARTPTS,highpass=f=200,volume=1.5[b];[a][b]$(mix 2),atrim=0:0.9,afade=t=out:st=0.6:d=0.3[o]" "$D/zap1.ogg" "$H/House & Office/Fluorescent light bulb buzz_2.wav"
fx stamina_out "$P,atrim=0:1.4,afade=t=in:d=0.05,afade=t=out:st=1.1:d=0.3" "$H/Character/Breathing_fast.wav"
fx slide "$P,$ST,lowpass=f=4000,afade=t=out:st=0.6:d=0.25" "$S/Materials/concrete_scrape.wav"
fx map_unroll "$P,$ST,afade=t=out:st=0.45:d=0.15" "$S/Items/map_open.wav"
fx combo "$P,afade=t=out:st=0.85:d=0.2" "$S/Musical Effects/harpsichord_chime_quick.wav"
fx champion "[0:a]$P[a];[1:a]$P,volume=0.7,lowpass=f=1200[b];[a][b]$(mix 2),atrim=0:1.2,afade=t=out:st=0.85:d=0.35[o]" "$S/Musical Effects/brass_negative.wav" "$I/impactPunch_heavy_000.ogg"

for f in "$M"/*.ogg; do printf '%-34s %6.2f s %5d kB\n' "$f" "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")" "$(( $(stat -c %s "$f") / 1024 ))"; done
