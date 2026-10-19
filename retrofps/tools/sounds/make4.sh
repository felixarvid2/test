#!/bin/bash
# Ljud för Krypta del 4: spikpistolen, staven, bågen, nya fiender (nekromantiker, eldelementar, lavamask,
# dödsriddare, banshee, eldbossen), vulkanvärlden (lava, utbrott, eldstrålar, fällor, tunnor), lägerelden,
# uppdrag, runor, förmågor, överlevnadsläget och musiken volcano (+ volcano_hi, tidslinjerat
# intensitetslager), boss3, secret och survival.
# Samma konventioner som make2.sh/make3.sh: effekter mono 22 kHz Vorbis q2 toppnormaliserade till $TOP dBFS
# (standard -1, slingor -4), musik stereo 44,1 kHz Vorbis q1 linjärt förstärkt till mål-LUFS,
# alla slingor bär LOOPLENGTH=<sampel> i Vorbis-kommentaren.
# Källor: assets/audio (Kenney-paketen CC0, 400 Sounds Pack CC0) och Horror SFX Free ur releasen
# assets-large-v1 (packa upp den i $HORROR). Elektricitet, eld, lavabubblor, mullret, klagoskriket, kören,
# kriget hornet, klockspelen, förmågorna och all musik syntetiseras med python3 + numpy (inbäddat nedan).
# Deterministiskt: fast frö för slumptalen och -fflags +bitexact (annars slumpar Ogg-muxern serienumret).
# Kör från repo-roten: HORROR=/sökväg/till/"Horror SFX Free" bash retrofps/tools/sounds/make4.sh
set -e
O=retrofps/assets/snd
M=retrofps/assets/music
A=assets/audio
S="$A/400 Sounds Pack"
I=$A/impact-sounds/Audio
R=$A/rpg-audio/Audio
D=$A/digital-audio/Audio
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
  ffmpeg -loglevel error -y -i "$T/$1.wav" -af "volume=${v}dB" "${tag[@]}" -c:a libvorbis -q:a 2 -fflags +bitexact "$O/$1.ogg"
}
# fxloop NAMN LEN X 'graf' källor...: som fx men en sömlös slinga på LEN s (grafen ska ge minst LEN+X s)
fxloop() {
  local n=$1 len=$2 x=$3 g=$4; shift 4
  render "$T/raw_$n.wav" 1 22050 "$g" "$@"
  xloop "$T/raw_$n.wav" "$T/$n.wav" "$len" "$x"
  python3 -I "$T/rot.py" "$T/$n.wav"
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
  ffmpeg -loglevel error -y -i "$T/m_$n.wav" -af "volume=${v}dB" -metadata "LOOPLENGTH=$(nsamp "$T/m_$n.wav")" -c:a libvorbis -q:a 1 -fflags +bitexact "$M/$n.ogg"
}
# sömlös slinga: LEN s ur IN, de följande X s tonas in över början (lika effekt).
xloop() { # xloop IN UT LEN X
  ffmpeg -loglevel error -y -i "$1" -ss "$3" -i "$1" -filter_complex "[0:a]atrim=0:$3,afade=t=in:d=$4:curve=qsin[p];[1:a]atrim=0:$4,afade=t=out:d=$4:curve=qsin[q];[p][q]amix=inputs=2:normalize=0:duration=first[o]" -map '[o]' "$2"
}
# rot.py WAV: vrider en sömlös slinga (cirkulärt) så att skarven hamnar där signalen är nära noll och flack.
# Webbläsaren samplar om filen vid avkodningen (22,05 -> 44,1/48 kHz) med tystnad före första sampelet,
# så en skarv mitt i ett starkt basljud (mullret, lavan) ger annars ett litet knäpp.
cat > "$T/rot.py" <<'PY'
import sys, wave, numpy as np
p = sys.argv[1]
with wave.open(p, 'rb') as w:
    prm = w.getparams(); assert prm.sampwidth == 2 and prm.nchannels == 1
    x = np.frombuffer(w.readframes(prm.nframes), '<i2').astype(float)
n = len(x); k = max(1, prm.framerate // 400)  # 2,5 ms glidande medel
lp = np.convolve(np.concatenate([x[-k:], x, x[:k]]), np.ones(2 * k + 1) / (2 * k + 1), 'same')[k:-k]
m = prm.framerate // 20; c = np.concatenate([[0], np.cumsum(np.concatenate([x, x]) ** 2)])
after = np.sqrt((c[np.arange(n) + m] - c[np.arange(n)]) / m); before = np.roll(after, m)  # 50 ms efter/före
cost = np.abs(lp) + 20 * np.abs(lp - np.roll(lp, 1)) + 0.3 * np.abs(x) + 0.25 * (before + after)
cost[np.abs(20 * np.log10((before + 1) / (after + 1))) >= 1.0] = np.inf  # samma nivå på båda sidor
i = int(np.argmin(cost))
with wave.open(p, 'wb') as w:
    w.setparams(prm); w.writeframes(np.concatenate([x[i:], x[:i]]).astype('<i2').tobytes())
PY
P="aresample=44100,aformat=sample_fmts=fltp:channel_layouts=mono"
mix() { echo "amix=inputs=$1:normalize=0:duration=longest"; }

# röstmaterial till nekromantikerns viskningar (Kenney Voiceover Pack, manlig röst), mono 44,1 kHz
ffmpeg -loglevel error -y -i "$V/war_suppressing_fire.ogg" -i "$V/war_target_engaged.ogg" -i "$V/mission_completed.ogg" \
  -filter_complex "[0:a][1:a][2:a]concat=n=3:v=0:a=1,$P[o]" -map '[o]' "$T/vox_c.wav"

# ---------- syntes ----------
cat > "$T/synth4.py" <<'PY'
# Syntetiserade effekter och musikslingor för Krypta del 4. Användning: python3 synth4.py <katalog>
# Musiken läggs med "wrap" (toner som går över slutet läggs på början), efterklangen är en cirkulär
# faltning och liggande toner/brus har ett helt antal perioder på slingan, så slingorna är sömlösa.
import sys, wave, numpy as np
SR = 44100
OUT = sys.argv[1]
rng = np.random.default_rng(5150)

def m2f(n): return 440.0 * 2 ** ((n - 69) / 12)
def tt(d): return np.arange(int(d * SR)) / SR

def env(n, att, rel):
    e = np.ones(n)
    a = min(n, max(1, int(att * SR))); e[:a] = np.sin(np.linspace(0, np.pi / 2, a)) ** 2
    r = min(n, max(1, int(rel * SR))); e[n - r:] *= np.cos(np.linspace(0, np.pi / 2, r)) ** 2
    return e

def fftfilt(x, lo=0, hi=None, slope=1.0):  # cirkulär (fas-noll) filtrering i frekvensplanet
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
def lpnoise(d, fc):  # långsamt slumpvärde -1..1 (för modulering)
    x = fftfilt(noise(d), 0, fc); return x / (np.abs(x).max() + 1e-9)
def phase(f): return 2 * np.pi * np.cumsum(f) / SR
def sawp(ph, fmax, f0):  # bandbegränsad sågtand ur en fas; f0 = högsta grundton
    y = np.zeros_like(ph)
    for k in range(1, max(1, int(fmax / f0)) + 1): y += np.sin(k * ph) / k
    return y

def place(buf, t0, sig, g=1.0):
    i = int(t0 * SR); m = min(len(sig), len(buf) - i)
    if m > 0: buf[i:i + m] += sig[:m] * g

def verb(x, length=1.2, wet=0.3, bright=5000, tail=True):  # kort efterklang (linjär, med svans)
    n = int(length * SR); t = np.arange(n) / SR
    ir = rng.standard_normal(n) * np.exp(-t * 6.9 / length); ir = fftfilt(ir, 150, bright)
    ir /= np.sqrt((ir ** 2).sum() * (SR / 2) / (bright - 150))
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

def cut(x, d, fade=0.3): return fade_tail(x[:int(d * SR)], fade)

# ---- byggstenar ----
def formants(freq, F):
    g = np.full_like(np.asarray(freq, float), 0.02)
    for fc, bw, a in F: g = g + a / (1 + ((freq - fc) / bw) ** 2)
    return g

def voice(f0, F, hmax=7000, jitter=0.0, roll=0.6):
    """additiv röst: f0 är en kurva (Hz per sampel), F formanter [(fc, bw, amp)] (fc får vara en kurva)"""
    if jitter: f0 = f0 * (1 + jitter * fftfilt(rng.standard_normal(len(f0)), 0, 60) / 0.1)
    ph = phase(f0); y = np.zeros(len(f0)); fm = f0.max()
    for k in range(1, int(hmax / fm) + 1):
        y += formants(k * f0, F) / k ** roll * np.sin(k * ph)
    return y

AA = [(700, 110, 1.0), (1150, 130, 0.55), (2650, 180, 0.22)]
OH = [(480, 90, 1.0), (820, 110, 0.5), (2500, 180, 0.1)]
HA = [(800, 140, 1.0), (1250, 160, 0.7), (2700, 220, 0.3)]

def choir(notes, d, att=0.2, rel=0.5, g=1.0, vib=5.0, F=AA, hmax=5000):
    t = tt(d); y = np.zeros_like(t)
    for n in notes:
        for det in (-0.004, 0.0035):
            f0 = m2f(n) * (1 + det) * (1 + 0.006 * np.sin(2 * np.pi * (vib + rng.uniform(-.4, .4)) * t + rng.uniform(0, 6)))
            y += voice(f0, F, hmax, roll=1.0)
    return y * env(len(t), att, rel) * g / len(notes)

def bar(f, d, g=1.0, dec=3.0):  # klockspel/celesta: delton 1, 2.76, 5.40, 8.93
    t = tt(d); y = np.zeros_like(t)
    for r, a, dd in ((1, 1, 1), (2.756, 0.35, 2.2), (5.404, 0.18, 4), (8.933, 0.08, 6)):
        if f * r < SR * 0.45: y += a * np.exp(-t * dec * dd) * np.sin(2 * np.pi * f * r * t + rng.uniform(0, 6))
    return y * env(len(t), 0.002, 0.05) * g

def ping(f, d, g=1.0, dec=5.0):  # mjukt pling: nästan sinus
    t = tt(d)
    y = np.sin(2 * np.pi * f * t) + 0.18 * np.sin(4 * np.pi * f * t) * np.exp(-t * 4) + 0.05 * np.sin(6 * np.pi * f * t) * np.exp(-t * 8)
    return y * np.exp(-t * dec) * env(len(t), 0.003, 0.05) * g

def bell(n, d=6.0, g=1.0):  # kyrkklocka
    f = m2f(n); t = tt(d); y = np.zeros_like(t)
    for r, a, dec in ((0.5, 0.6, 0.35), (1, 1, 0.6), (1.19, 0.5, 0.9), (1.5, 0.35, 1.1), (2, 0.5, 1.4), (2.51, 0.25, 2.2), (3.01, 0.2, 2.8), (4.1, 0.12, 3.6)):
        y += a * np.exp(-t * dec) * np.sin(2 * np.pi * f * r * t + rng.uniform(0, 6))
    return y * env(len(t), 0.003, 0.5) * g

def anvil(f=1100, d=0.8, g=1.0):  # städ/smedja: oharmoniska delton, snabb avklingning
    t = tt(d); y = np.zeros_like(t)
    for r, a, dec in ((1, 1, 7), (2.32, 0.6, 9), (3.87, 0.4, 12), (5.6, 0.25, 16), (7.1, 0.12, 22)):
        if f * r < SR * 0.45: y += a * np.exp(-t * dec) * np.sin(2 * np.pi * f * r * t + rng.uniform(0, 6))
    y += fftfilt(rng.standard_normal(len(t)), 2000, 9000) * np.exp(-t * 150) * 0.8
    return y * env(len(t), 0.0005, 0.05) * g

def pluck(n, d=2.0, bright=1.3, g=1.0):
    f = m2f(n); t = tt(d); y = np.zeros_like(t)
    for k in range(1, 16):
        if f * k > 9000: break
        y += (1 / k ** bright) * np.exp(-t * (1.0 + 0.85 * k)) * np.sin(2 * np.pi * f * k * t * (1 + 0.0004 * k * k))
    return y * env(len(t), 0.004, 0.08) * g

def pad(notes, d, att=1.5, rel=2.0, h=8, roll=1.7, g=1.0, lfo=0.25):
    t = tt(d); y = np.zeros_like(t)
    for n in notes:
        for det in (-0.0025, 0, 0.0031):
            f = m2f(n) * (1 + det)
            for k in range(1, h + 1):
                if f * k < SR * 0.45: y += np.sin(2 * np.pi * f * k * t + rng.uniform(0, 6.28)) / k ** roll
    return y * env(len(t), att, rel) * (1 + 0.15 * np.sin(2 * np.pi * lfo * t + rng.uniform(0, 6))) * g / len(notes)

def drum(f0=60, d=1.2, g=1.0, snap=0.3, dec=4.5):
    t = tt(d); fr = f0 * (1 + 1.2 * np.exp(-t * 28))
    y = np.sin(phase(fr)) * np.exp(-t * dec)
    nz = fftfilt(rng.standard_normal(len(t)), 80, 900) * np.exp(-t * 30) * snap
    return (y + nz) * env(len(t), 0.002, 0.1) * g

def snare(d=0.25, g=1.0):
    t = tt(d); nz = fftfilt(rng.standard_normal(len(t)), 900, 5000) * np.exp(-t * 22)
    return (nz + np.sin(2 * np.pi * 190 * t) * np.exp(-t * 35) * 0.5) * g

def tick(d=0.06, g=1.0, lo=5000, hi=11000, dec=70):
    t = tt(d); return fftfilt(rng.standard_normal(len(t)), lo, hi) * np.exp(-t * dec) * g

def brass(notes, d, att=0.15, rel=0.3, drive=2.5, lo_fc=450, hi_fc=2600, swell=0.4, g=1.0):
    """distad mässing: detunade sågtänder, ljusheten sväller in (blandning mörk/ljus), tanh-distorsion"""
    t = tt(d); y = np.zeros_like(t)
    for n in notes:
        for det in (-0.004, 0.0, 0.0045):
            f = m2f(n) * (1 + det) * (1 + 0.003 * np.sin(2 * np.pi * 5.2 * t + rng.uniform(0, 6)) * np.clip((t - 0.3) / 0.4, 0, 1))
            y += sawp(phase(f), 7000, f.max())
    y /= np.abs(y).max() + 1e-9
    b = np.clip(t / max(swell, 1e-3), 0, 1) ** 1.5 * (1 - 0.35 * np.clip((t - d * 0.6) / (d * 0.4), 0, 1))
    y = fftfilt(y, 30, lo_fc) * (1 - b) + fftfilt(y, 30, hi_fc) * b
    y = np.tanh(drive * y / (np.abs(y).max() + 1e-9))
    y = fftfilt(y, 40, 5000)
    return y * env(len(t), att, rel) * g

def dbass(n, d, g=1.0, drive=2.4, hi=900):  # distad bas (sågtand)
    t = tt(d); f = m2f(n)
    y = sawp(2 * np.pi * f * t, 3000, f) + 0.7 * sawp(2 * np.pi * f * 1.005 * t, 3000, f)
    y = fftfilt(y, 30, hi); y = np.tanh(drive * y / (np.abs(y).max() + 1e-9))
    return y * env(len(t), 0.004, 0.04) * g

def glass(n, d, g=1.0, att=0.3, rel=1.4, trem=4.5):  # glasharmonika: nästan ren sinus, svag sväng
    f = m2f(n); t = tt(d); p0 = rng.uniform(0, 6)
    y = np.sin(2 * np.pi * f * t + p0) + 0.6 * np.sin(2 * np.pi * f * 1.0013 * t + p0 + 1) \
        + 0.12 * np.sin(4 * np.pi * f * t) + 0.04 * np.sin(6 * np.pi * f * t)
    y *= 1 + 0.07 * np.sin(2 * np.pi * trem * t + rng.uniform(0, 6))
    return y * env(len(t), att, rel) * g / 1.6

def low_rumble(d, f=45):
    t = tt(d); return fftfilt(noise(d), 20, 160) * 0.7 + 0.3 * np.sin(2 * np.pi * f * t) * (1 + 0.3 * np.sin(2 * np.pi * 7 * t))

def fire(d, lo=120, hi=2200, flick=10, pops=30):  # eld: bandat brus som fladdrar + knaster
    y = fftfilt(noise(d), lo, hi) * (0.65 + 0.35 * lpnoise(d, flick))
    y += fftfilt(noise(d), hi, hi * 3) * 0.15 * (0.5 + 0.5 * lpnoise(d, flick * 2))
    for _ in range(pops):
        n = rng.uniform(0.002, 0.008); c = noise(n) * np.exp(-tt(n) * rng.uniform(300, 900))
        place(y, rng.uniform(0, d - 0.01), c, rng.uniform(0.2, 1) ** 2 * 3)
    return y

def debris(d, n=40, lo=400, hi=3500, t1=None):  # småsten som faller: korta bandade knackar
    y = np.zeros(int(d * SR)); t1 = t1 or d * 0.8
    for _ in range(n):
        t0 = t1 * rng.uniform(0, 1) ** 1.4; dd = rng.uniform(0.01, 0.04)
        c = fftfilt(noise(dd + 0.02), lo * rng.uniform(0.7, 1.4), hi * rng.uniform(0.7, 1.2))[:int(dd * SR)]
        c *= np.exp(-tt(dd) * rng.uniform(80, 200))
        place(y, t0, c, rng.uniform(0.2, 1) * (1 - 0.6 * t0 / d))
    return y

def crackle(d, n=40, grow=True, lo=900, hi=7000):  # isknak
    y = np.zeros(int(d * SR))
    for _ in range(n):
        u = rng.uniform(0, 1) ** (0.6 if grow else 1.6); f = rng.uniform(lo, hi)
        c = np.sin(2 * np.pi * f * tt(0.02)) * np.exp(-tt(0.02) * rng.uniform(250, 500)) * rng.uniform(0.3, 1)
        place(y, u * (d - 0.03), c)
    return y

def sparks(y, d, n, dist=1.0, g=1.0):  # gnistor: korta brusklick
    for _ in range(n):
        u = rng.uniform(0, 1) ** dist; dd = rng.uniform(0.0008, 0.004)
        c = noise(dd + 0.001)[:max(1, int(dd * SR))]; c = c * np.exp(-np.arange(len(c)) / len(c) * 4)
        place(y, u * (d - 0.01), c, rng.uniform(0.4, 1.4) * g)

# ================= effekter =================
def tink():  # spiken i metall
    d = 0.3; t = tt(d); y = np.zeros_like(t)
    for f, a, dec in ((3150, 1, 22), (4890, 0.6, 30), (6870, 0.4, 40), (8320, 0.2, 55)):
        y += a * np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) * np.exp(-t * dec)
    y += fftfilt(noise(d), 3000, 10000) * np.exp(-t * 250)
    return y * env(len(t), 0.0005, 0.03)

def staff_zap(d=0.5):  # elektrisk båge: surr + väsande, tänds och slocknar, gnistor
    t = tt(d)
    gate = np.clip((lpnoise(d, 35) + 0.25) * 3, 0, 1)
    f = 95 + 25 * lpnoise(d, 20)
    buzz = fftfilt(np.tanh(4 * sawp(phase(f), 6000, 125)), 200, 7000)
    hiss = fftfilt(noise(d), 2500, 10000)
    y = (buzz * 0.5 + hiss * 0.5) * gate
    sparks(y, d, 90, 0.7, 1.2)
    return y * env(len(t), 0.003, 0.12) * np.exp(-t * 2.2)

def staff_charge(d=1.0):  # stigande elektriskt brum
    t = tt(d); u = t / d
    f = 55 * 4.0 ** (u ** 1.2)
    hum = fftfilt(np.tanh(1.5 * sawp(phase(f), 5000, 220)), 60, 4000)
    hum *= 0.65 + 0.35 * np.sin(phase(6 + 26 * u ** 2))
    sweep = svf(noise(d), 400 * 12 ** u, 6.0)
    y = hum / np.abs(hum).max() * (0.2 + 0.8 * u ** 1.5) + sweep / np.abs(sweep).max() * 0.5 * u ** 2
    sp = np.zeros_like(y); sparks(sp, d, 80, 0.45, 1.0); y += sp * u
    return y * env(len(t), 0.05, 0.04)

def staff_orb():  # stor urladdning: båge + djup smäll
    d = 1.3; t = tt(d); y = np.zeros(len(t))
    place(y, 0, staff_zap(0.35), 0.8)
    y += np.sin(phase(38 + 90 * np.exp(-t * 9))) * np.exp(-t * 3.2)
    y += fftfilt(noise(d), 40, 1500) * np.exp(-t * 5) * 0.5
    return cut(verb(y, 1.2, 0.25, 5000), 1.3, 0.35)

def bow_creak(d=0.65):  # strängens knarr: stick-slip-pulser genom trä-resonanser, tätare när bågen spänns
    t = tt(d); u = t / d
    rate = 22 + 45 * u + 8 * lpnoise(d, 6)
    ph = np.cumsum(rate) / SR; idx = np.nonzero(np.diff(np.floor(ph)))[0]
    imp = np.zeros(len(t)); imp[idx] = rng.uniform(0.5, 1, len(idx))
    k = tt(0.03); ker = sum(a * np.sin(2 * np.pi * f * k) * np.exp(-k * dd) for f, a, dd in ((640, 1, 120), (1480, 0.7, 160), (2650, 0.4, 220)))
    y = np.convolve(imp, ker)[:len(t)]
    y += fftfilt(noise(d), 1500, 6000) * 0.04
    return y * (0.3 + 0.7 * u ** 0.7) * env(len(t), 0.03, 0.06)

def twang(d=0.5):  # bågsträngen slår: låg sträng som dör fort + klatsch
    t = tt(d); f = 110 * (1 + 0.08 * np.exp(-t * 30)); ph = phase(f); y = np.zeros_like(t)
    for k in range(1, 13): y += np.exp(-t * (6 + 4 * k)) * np.sin(k * ph) / k ** 1.2
    y += fftfilt(noise(d), 200, 3000) * np.exp(-t * 60) * 0.6
    return y * env(len(t), 0.001, 0.05)

def thrum(d=0.45):  # pilskaftet dallrar
    t = tt(d)
    y = np.sin(2 * np.pi * 190 * t) * (0.5 + 0.5 * np.sin(2 * np.pi * 34 * t)) * np.exp(-t * 9)
    y += 0.3 * np.sin(2 * np.pi * 560 * t) * np.exp(-t * 14)
    return y * env(len(t), 0.002, 0.05)

def whisper(src, start, d, rev=True):  # viskning: röstens spektrum med slumpad fas
    x = rd(src); x = x[::-1] if rev else x
    i0 = int(start * SR); x = x[i0:i0 + int(d * SR)]
    N, hop = 1024, 256; w = np.hanning(N); pad_ = np.zeros(len(x) + N); pad_[:len(x)] = x
    out = np.zeros(len(pad_) + N); norm = np.zeros_like(out)
    for i in range(0, len(x), hop):
        X = np.abs(np.fft.rfft(pad_[i:i + N] * w))
        out[i:i + N] += np.fft.irfft(X * np.exp(1j * rng.uniform(0, 2 * np.pi, len(X))), N) * w; norm[i:i + N] += w ** 2
    y = fftfilt((out / np.maximum(norm, 1e-3))[:len(x)], 500, 9000)
    return y * env(len(y), 0.03, 0.15)

def chant():  # nekromantikern: låg mansröst i två stavelser + kvint, efterklang
    y = np.zeros(int(1.7 * SR))
    for t0, dd, n, F1, F2 in ((0.0, 0.8, 38, 450, 800), (0.75, 0.85, 37, 650, 1050)):
        t = tt(dd)
        for det, iv, gg in ((-0.006, 0, 1), (0.0, 0, 1), (0.005, 0, 1), (0.003, 7, 0.4), (-0.003, -12, 0.5)):
            f0 = m2f(n + iv) * (1 + det) * (1 + 0.004 * np.sin(2 * np.pi * 4.5 * t + rng.uniform(0, 6)))
            v = voice(f0, [(F1, 90, 1), (F2, 120, 0.6), (2400, 200, 0.15)], 4000, jitter=0.003, roll=0.8)
            place(y, t0, v * env(len(t), 0.08, 0.25), gg)
    return cut(verb(y, 1.8, 0.4, 3000), 1.7, 0.4)

def ghost_rise(d=1.2):  # spöklik uppåtvirvel
    t = tt(d); u = t / d
    w = svf(noise(d), 300 * 8 ** u, 4.0) * np.sin(np.pi * u) ** 1.3
    tone = np.sin(phase(220 * 3 ** u)) * 0.15 * np.sin(np.pi * u)
    return cut(verb(w / np.abs(w).max() + tone, 1.5, 0.4, 5000), 1.4, 0.4)

def fire_burst():  # eldelementar: flamman blossar upp
    d = 1.2; t = tt(d)
    y = fire(d, 100, 2500, 14, 45) * np.minimum(1, t / 0.04) * np.exp(-t * 2.2)
    y += svf(noise(d), 300 + 600 * np.exp(-t * 3), 1.5) * np.exp(-t * 3) * 0.8
    y += np.sin(phase(60 + 40 * np.exp(-t * 10))) * np.exp(-t * 5) * 0.5
    return fade_tail(y, 0.4)

def split():  # elementaren delas: två flammor som glider isär i tonhöjd
    d = 0.9; t = tt(d); y = np.zeros(len(t))
    for s in (0.7, 1.4):
        fc = 900 * s ** np.clip(t / 0.4, 0, 1)
        y += svf(noise(d), fc, 2.0) * np.minimum(1, t / 0.03) * np.exp(-t * 3.5)
    y += fire(d, 200, 3000, 16, 25) * np.exp(-t * 4) * 0.4
    return fade_tail(y, 0.3)

def wail():  # banshee: klagande kvinnoröst "oo-aa-oo", stor efterklang
    d = 1.3; t = tt(d)
    f0 = np.interp(t, [0, 0.15, 0.55, 0.9, d], [520, 700, 880, 790, 560])
    f0 = f0 * (1 + 0.025 * np.sin(2 * np.pi * 5.5 * t) * np.clip(t / 0.4, 0, 1))
    F1 = np.interp(t, [0, 0.4, 0.9, d], [400, 900, 820, 450]); F2 = np.interp(t, [0, 0.4, 0.9, d], [900, 1400, 1300, 850])
    F = [(F1, 120, 1.0), (F2, 160, 0.5), (2900, 300, 0.15)]
    y = voice(f0, F, 7000, jitter=0.004, roll=0.9) + 0.3 * voice(f0 * 1.498, F, 7000, roll=0.9)
    y = y / np.abs(y).max() + svf(noise(d), F2, 2.0) * 0.06
    y *= env(len(t), 0.15, 0.35)
    return cut(verb(y, 2.0, 0.6, 6000), 1.45, 0.4)

def scream():  # skrik: hög, rå röst
    d = 1.0; t = tt(d)
    f0 = np.interp(t, [0, 0.06, 0.3, 0.8, d], [900, 1350, 1450, 1300, 1000]) * (1 + 0.03 * np.sin(2 * np.pi * 7 * t))
    y = voice(f0, [(1000, 250, 1.0), (2700, 350, 0.9), (3800, 400, 0.5)], 9000, jitter=0.012, roll=0.5)
    y = np.tanh(2 * y / np.abs(y).max()) + svf(noise(d), 3000, 1.5) * 0.15
    return y * env(len(t), 0.03, 0.25)

def lava_blubs(d=3.7):  # tjocka lavabubblor över ett lågt sjudande
    y = fftfilt(noise(d), 20, 140) * 0.25
    for _ in range(int(d * 9)):
        t0 = rng.uniform(0, d - 0.15); f0 = rng.uniform(70, 220); dd = rng.uniform(0.06, 0.16)
        t = tt(dd); f = f0 * (1 + 1.2 * (t / dd) ** 2)
        place(y, t0, np.sin(phase(f)) * np.sin(np.pi * t / dd) ** 0.5 * np.exp(-t * 8), rng.uniform(0.3, 1.0))
        if rng.uniform() < 0.5:
            place(y, t0 + dd * 0.9, fftfilt(noise(0.03), 800, 4000)[:int(0.012 * SR)] * np.exp(-tt(0.012) * 300), 0.3)
    return y

def vrumble(d=4.8):  # vulkanmuller
    t = tt(d)
    y = fftfilt(noise(d), 20, 170) * (0.8 + 0.3 * lpnoise(d, 0.8))
    y = y / np.abs(y).max() + 0.35 * np.sin(2 * np.pi * 31 * t + 2 * np.sin(2 * np.pi * 0.4 * t)) * (0.7 + 0.3 * lpnoise(d, 1.5))
    y += fftfilt(noise(d), 150, 700) * 0.2 * (0.5 + 0.5 * lpnoise(d, 2))
    for t0 in (0.6, 2.1, 3.4): place(y, t0, drum(28, 1.0, 0.4, 0.2, dec=3))
    return y

def campfire(d=3.7):  # lägereld: mjukt brus + knaster och enstaka knäppar
    y = fftfilt(noise(d), 100, 900) * 0.12 * (0.7 + 0.3 * lpnoise(d, 3)) + fftfilt(noise(d), 2000, 7000) * 0.02
    p = np.zeros_like(y)
    for _ in range(int(d * 30)):
        dd = rng.uniform(0.002, 0.012); c = noise(dd + 0.001)[:int(dd * SR)]
        place(p, rng.uniform(0, d - 0.03), c * np.exp(-np.linspace(0, 6, len(c))), rng.uniform(0, 1) ** 3 * 1.5)
    for _ in range(4):
        t0 = rng.uniform(0, d - 0.1)
        for j in range(rng.integers(3, 7)):
            c = noise(0.006)
            place(p, t0 + rng.uniform(0, 0.04), c * np.exp(-np.linspace(0, 5, len(c))), rng.uniform(0.6, 1.4))
    return y + fftfilt(p, 500, 9000)

def eruption(d=2.2, f0=40):  # djup smäll + mullrande svans
    t = tt(d)
    y = np.sin(phase(f0 * (1 + 2 * np.exp(-t * 12)))) * np.exp(-t * 2.5)
    y += fftfilt(noise(d), 30, 700) * np.exp(-t * 2.2) * 0.8 * (0.8 + 0.2 * lpnoise(d, 8))
    y += fftfilt(noise(d), 700, 4000) * np.exp(-t * 9) * 0.3
    y += debris(d, 50, 500, 3500, d * 0.6) * 0.5
    return fade_tail(y * env(len(t), 0.003, 0.1), 0.5)

def firejet(d=1.1):  # eldstråle: sus som öppnar sig och fladdrar
    t = tt(d)
    a = np.minimum(1, t / 0.06) * np.clip((d - 0.05 - t) / 0.35, 0, 1) ** 1.5
    fc = 400 + 2100 * np.minimum(1, t / 0.15) - 800 * np.clip((t - 0.15) / 0.8, 0, 1)
    y = svf(noise(d), fc, 1.2) * 0.8 + fire(d, 150, 3500, 18, 20) * 0.6
    return y * a

def crumble_fx(d=1.2):
    t = tt(d)
    y = debris(d, 70, 300, 2500, d * 0.75)
    y += fftfilt(noise(d), 40, 400) * np.exp(-t * 4) * 0.4
    return fade_tail(y, 0.3)

def swish(d=0.9):  # tung pendel som sveper förbi
    t = tt(d); c = 0.42; a = 1 / (1 + ((t - c) / 0.12) ** 2)
    w = svf(noise(d), 250 + 700 * a, 1.2) * a + svf(noise(d), 120 + 150 * a, 2.5) * a * 0.8
    return w * env(len(t), 0.05, 0.15)

def gasburst(d=1.0):  # giftgas sprutar ur tunnan
    t = tt(d)
    y = fftfilt(noise(d), 300, 6000) * np.exp(-t * 4) * env(len(t), 0.005, 0.2)
    y += fftfilt(noise(d), 60, 400) * np.exp(-t * 8) * 0.8 + fftfilt(noise(d), 2000, 8000) * 0.3 * np.exp(-t * 2.5)
    for _ in range(8):
        t0 = rng.uniform(0.25, 0.8); f0 = rng.uniform(300, 700); dd = rng.uniform(0.04, 0.08); s = tt(dd)
        place(y, t0, np.sin(phase(f0 * (1 + (s / dd) ** 2))) * np.sin(np.pi * s / dd) * 0.25)
    return fade_tail(y, 0.25)

def icecrack():
    d = 0.9; t = tt(d); y = crackle(d, 50, grow=False)
    y += fftfilt(noise(d), 4000, 11000) * np.exp(-t * 6) * 0.1
    return fade_tail(y, 0.25)

def shimmer(d=0.9, notes=(84, 88, 91, 96, 100, 103), step=0.035, g=0.4, dec=3.5):
    y = np.zeros(int(d * SR))
    for i, n in enumerate(notes): place(y, step * i, bar(m2f(n), d - step * i, g, dec=dec))
    y += fftfilt(noise(d), 6000, 11000) * np.exp(-tt(d) * 6) * 0.05
    return cut(verb(y, 1.0, 0.35, 9000), d, 0.3)

def secret_stairs():  # djupt mystiskt sus: baklängessvällning, kör, klocka
    d = 2.4; t = tt(d)
    a = np.where(t < 0.9, (t / 0.9) ** 2, np.exp(-(t - 0.9) * 2.5))
    fc = np.where(t < 0.9, 200 + 1000 * (t / 0.9) ** 2, 1200 * np.exp(-(t - 0.9) * 1.5) + 150)
    y = svf(noise(d), fc, 1.5) * a; y /= np.abs(y).max()
    y += np.sin(2 * np.pi * 36 * t) * a * 0.5
    y += choir([50, 57, 64, 66], d, 0.7, 0.9, 0.6, F=OH)
    place(y, 0.9, bell(62, 1.5, 0.35))
    return cut(verb(y, 3.0, 0.5, 4000), 2.5, 0.6)

def blink():  # teleport: snabbt upp, smäll, ned
    d = 0.45; t = tt(d); u1 = np.clip(t / 0.12, 0, 1)
    f = np.where(t < 0.12, 300 * 10 ** u1, 3000 * 0.2 ** np.clip((t - 0.12) / 0.25, 0, 1))
    a = np.where(t < 0.12, u1, np.exp(-(t - 0.12) * 12))
    y = (np.sin(phase(f)) * 0.5 + svf(noise(d), f * 0.8, 3) * 0.6) * a
    place(y, 0.115, tick(0.03, 1.0, 1500, 9000, 120))
    for i, n in enumerate((96, 101, 103)): place(y, 0.12 + 0.025 * i, bar(m2f(n), 0.3, 0.2, dec=6))
    return cut(verb(y, 0.6, 0.2, 9000), 0.45, 0.12)

def slowmo():  # tiden saktar in: fallande sus och ton med avtagande puls (bandstopp)
    d = 1.1; t = tt(d); u = t / d
    sweep = svf(noise(d), 3500 * 0.06 ** u, 3.0); sweep /= np.abs(sweep).max()
    tf = 900 * 0.1 ** (u ** 0.7); tone = np.sin(phase(tf)) + 0.4 * np.sin(2 * phase(tf))
    y = (sweep * 0.8 + tone * 0.3) * (0.75 + 0.25 * np.sin(phase(30 * 0.1 ** u))) * env(len(t), 0.03, 0.25) * (1 - 0.3 * u)
    place(y, 0, drum(50, 0.8, 0.5, 0.1, dec=4))
    return cut(verb(y, 1.5, 0.35, 4000), 1.2, 0.35)

def shield():  # sköldbubbla: brum som stiger och blir glasigt
    d = 0.9; t = tt(d); u = np.clip(t / 0.6, 0, 1); f = 180 * 2 ** u; y = np.zeros_like(t)
    for r, a in ((1, 1), (1.5, 0.5), (2, 0.4), (3, 0.15)):
        for det in (-0.004, 0.004): y += a * np.sin(phase(f * r * (1 + det)))
    y = y / np.abs(y).max() * (0.8 + 0.2 * np.sin(2 * np.pi * 14 * t))
    w = svf(noise(d), 600 + 3000 * u, 5); y += w / np.abs(w).max() * 0.3 * u
    y *= env(len(t), 0.05, 0.3)
    for i, n in enumerate((88, 95)): place(y, 0.55 + 0.04 * i, bar(m2f(n), 0.35, 0.25, dec=5))
    return cut(verb(y, 1.0, 0.3, 7000), 1.0, 0.3)

def summon():  # spektralt ackord: baklänges klocka in i en kör
    d = 1.8; y = np.zeros(int(d * SR))
    place(y, 0.0, bell(74, 0.45, 0.5)[::-1])
    place(y, 0.3, choir([50, 57, 62, 65, 69], d - 0.3, 0.35, 0.7, 1.0, F=OH))
    for _ in range(10): place(y, rng.uniform(0.35, 1.2), bar(m2f(rng.choice([86, 89, 93, 98])), 0.5, 0.08, dec=5))
    return cut(verb(y, 2.2, 0.45, 5000), 1.9, 0.5)

def quake():  # markslag + mullret
    d = 1.7; t = tt(d)
    y = np.sin(phase(45 * (1 + 1.5 * np.exp(-t * 14)))) * np.exp(-t * 3)
    y += low_rumble(d) * np.exp(-t * 1.5) * 0.7 + debris(d, 40, 300, 2500, 1.0) * 0.35
    return fade_tail(y * env(len(t), 0.002, 0.1), 0.5)

def ready():  # förmågan laddad: mjukt dubbelpling
    y = np.zeros(int(0.75 * SR))
    place(y, 0, ping(m2f(84), 0.7, 0.6, 5)); place(y, 0.07, ping(m2f(91), 0.68, 0.45, 5))
    return cut(verb(y, 0.8, 0.25, 8000), 0.75, 0.2)

def tutorial():  # mjuk notis: två toner + svag klockspelsglans
    y = np.zeros(int(0.8 * SR))
    place(y, 0, ping(m2f(79), 0.75, 0.55, 4)); place(y, 0.11, ping(m2f(86), 0.65, 0.5, 4))
    place(y, 0.11, bar(m2f(98), 0.5, 0.06, dec=5))
    return cut(verb(y, 0.9, 0.3, 7000), 0.8, 0.25)

def rune_proc():  # kort glitter
    notes = [rng.choice([93, 96, 98, 100, 103, 105]) for _ in range(5)]
    return shimmer(0.45, notes, 0.022, 0.4, 6)

def heart_fast():  # två snabba slag (dunk-dunk)
    y = np.zeros(int(0.48 * SR))
    for t0, g, f in ((0, 1.0, 58), (0.16, 0.7, 66)):
        t = tt(0.18); b = np.sin(phase(f * (1 + 0.6 * np.exp(-t * 40)))) * np.exp(-t * 22) * env(len(t), 0.004, 0.03)
        b += fftfilt(noise(0.18), 30, 200) * np.exp(-t * 35) * 0.3
        place(y, t0, np.tanh(2 * b), g)
    return y

def horn():  # krigshorn: kort + lång stöt, tonen glider upp i ansatsen
    y = np.zeros(int(1.75 * SR))
    for t0, dd, n in ((0.0, 0.36, 45), (0.42, 1.25, 45)):
        t = tt(dd)
        f = m2f(n) * (1 - 0.06 * np.exp(-t * 12)) * (1 + 0.004 * np.sin(2 * np.pi * 5 * t) * np.clip((t - 0.3) / 0.3, 0, 1))
        s = sawp(phase(f), 7000, m2f(n)); s /= np.abs(s).max()
        b = 1 - np.exp(-t * 8)
        v = fftfilt(s, 60, 600) * (1 - b) + fftfilt(s, 60, 2200) * b
        v = np.tanh(2.2 * v / np.abs(v).max()) + 0.25 * fftfilt(s, 60, 300)
        v += fftfilt(noise(dd), 600, 2500) * 0.05 * np.exp(-t * 6)
        place(y, t0, v * env(len(t), 0.05, 0.18))
    return cut(verb(y, 2.0, 0.35, 4000), 1.75, 0.35)

def kwave(d=0.8):  # svärdets energivåg: fallande ton + sus
    t = tt(d); u = t / d; f = 700 * 0.25 ** u
    tone = fftfilt(np.tanh(2 * sawp(phase(f), 5000, 700)), 0, 3000)
    w = svf(noise(d), 2500 * 0.2 ** u, 2.0); w /= np.abs(w).max()
    y = (w * 0.7 + tone / np.abs(tone).max() * 0.25) * env(len(t), 0.04, 0.4) * np.exp(-t * 2)
    return cut(verb(y, 1.0, 0.3, 6000), 0.85, 0.3)

def fire_roar(d=2.3):  # eldbossens vrål: brinnande sus som sväller
    t = tt(d)
    y = fire(d, 60, 1800, 8, 60) * env(len(t), 0.15, 0.6)
    y += svf(noise(d), 200 + 500 * np.sin(np.pi * np.clip(t / 1.6, 0, 1)), 1.3) * env(len(t), 0.1, 0.7) * 0.6
    return y

fx = dict(tink=tink, staff_zap=staff_zap, staff_charge=staff_charge, staff_orb=staff_orb, bow_creak=bow_creak,
          twang=twang, thrum=thrum, chant=chant, ghost_rise=ghost_rise, fire_burst=fire_burst, split=split,
          wail=wail, scream=scream, lava_blubs=lava_blubs, vrumble=vrumble, campfire=campfire,
          eruption=eruption, eruption_small=lambda: eruption(1.8, 48), firejet=firejet, crumble=crumble_fx,
          swish=swish, gasburst=gasburst, icecrack=icecrack, rune_shimmer=shimmer, rune_proc=rune_proc,
          secret_stairs=secret_stairs, blink=blink, slowmo=slowmo, shield=shield, summon=summon, quake=quake,
          ready=ready, tutorial=tutorial, heart_fast=heart_fast, horn=horn, kwave=kwave, fire_roar=fire_roar,
          rumble=lambda: low_rumble(2.0))
for k, f in fx.items(): wr('s_' + k, f())
wr('s_whisper', whisper('vox_c', 0.3, 1.7))

# ================= musik =================
class Loop:
    def __init__(s, T):
        s.N = int(round(T * SR)); s.T = s.N / SR; s.t = np.arange(s.N) / SR
        s.L = np.zeros(s.N); s.R = np.zeros(s.N)
    def add(s, t0, sig, pan=0.0, g=1.0):
        gl = np.cos((pan + 1) * np.pi / 4) * g * 1.414; gr = np.sin((pan + 1) * np.pi / 4) * g * 1.414
        i = int(round(t0 * SR)) % s.N; k = 0; n = len(sig)
        while k < n:
            m = min(n - k, s.N - i)
            s.L[i:i + m] += sig[k:k + m] * gl; s.R[i:i + m] += sig[k:k + m] * gr
            k += m; i = 0
    def q(s, f): return max(1, round(f * s.T)) / s.T  # frekvens med helt antal perioder på slingan
    def drone(s, n, g=1.0, h=10, roll=1.3, cyc=3, hi=600, det=0.002):  # liggande ton, sömlös
        y = np.zeros(s.N)
        for f in (s.q(m2f(n)), s.q(m2f(n) * (1 + det))):
            for k in range(1, h + 1): y += np.sin(2 * np.pi * f * k * s.t + rng.uniform(0, 6.28)) / k ** roll
        y = fftfilt(y, 0, hi)
        return y / np.abs(y).max() * (1 + 0.2 * np.sin(2 * np.pi * cyc / s.T * s.t + rng.uniform(0, 6))) * g
    def bed(s, lo, hi, g=1.0, cyc=4):  # bandat brus, cirkulärt filtrerat
        x = fftfilt(rng.standard_normal(s.N), lo, hi); x /= x.std()
        return x * g * (1 + 0.3 * np.sin(2 * np.pi * cyc / s.T * s.t + rng.uniform(0, 6)))
    def reverb(s, length=3.0, wet=0.3, bright=3500, pre=0.02):
        n = int(length * SR); t = np.arange(n) / SR; out = []
        for ch in (s.L, s.R):
            ir = rng.standard_normal(n) * np.exp(-t * 6.9 / length)
            ir = fftfilt(ir, 120, bright); ir[:int(pre * SR)] = 0; ir /= np.sqrt((ir ** 2).sum())
            h = np.zeros(s.N); h[:min(n, s.N)] = ir[:s.N]
            out.append(np.fft.irfft(np.fft.rfft(ch) * np.fft.rfft(h), s.N))
        s.L = s.L + wet * out[0]; s.R = s.R + wet * out[1]
    def write(s, name): wr(name, np.stack([s.L, s.R], 1).reshape(-1), 2)

# ---- volcano: d-moll (Dm Eb Bb A), 64 bpm, 8 takter = 30 s: drönare, låg kör, pukor, distad mässing ----
def volcano():
    b = 0.9375; T = 32 * b; base = Loop(T); hi = Loop(T)
    base.add(0, base.drone(26, 0.55, h=10, roll=1.3, cyc=3, hi=350) + base.drone(33, 0.3, h=8, roll=1.5, cyc=5, hi=450))
    base.add(0, base.bed(20, 90, 0.12, cyc=6))  # mullret
    chords = [(38, [50, 53, 57]), (39, [51, 55, 58]), (34, [50, 53, 58]), (33, [49, 52, 57])]
    for i, (r, ch) in enumerate(chords):
        t0 = i * 8 * b
        base.add(t0 - 0.8, choir(ch, 8 * b + 2.0, 1.6, 1.8, 0.55, F=OH, hmax=4000), 0)
        base.add(t0 - 0.8, choir([ch[0] - 12], 8 * b + 2.0, 1.6, 1.8, 0.3, F=OH, hmax=3000), 0)
        base.add(t0, brass([r + 12, r + 19], 3.2 * b, att=0.5, rel=0.8, drive=3.0, swell=1.6), -0.25, 0.32)
        base.add(t0 + 4 * b, brass([r + 12, r + 24], 2.5 * b, att=0.4, rel=0.7, drive=3.0, swell=1.2), 0.25, 0.22)
        for bar_ in range(2):
            t1 = t0 + bar_ * 4 * b
            base.add(t1, drum(40, 2.5, 1.0, 0.35, dec=2.2), 0)
            base.add(t1 + 2.5 * b, drum(44, 1.5, 0.4, 0.25, dec=4), 0.15)
            base.add(t1 + 3 * b, drum(40, 1.5, 0.6, 0.3, dec=3.5), -0.15)
    base.add(0, bell(38, 8, 0.45), -0.2); base.add(16 * b, bell(39, 8, 0.35), 0.2)
    mel = [(16, 62, 3), (19, 60, 1), (20, 58, 2), (22, 57, 2), (24, 58, 1.5), (25.5, 57, 0.5), (26, 55, 2), (28, 57, 3.6)]
    for t0, n, dd in mel: base.add(t0 * b, brass([n - 12], dd * b + 0.3, att=0.12, rel=0.35, drive=2.2, swell=0.5, hi_fc=2000), 0.1, 0.3)
    # intensitetslager: tomtommar i åttondelar, städslag på 2 och 4, distad basostinato, mässingsstötar
    for i, (r, ch) in enumerate(chords):
        for bar_ in range(2):
            t1 = i * 8 * b + bar_ * 4 * b
            for k in range(8):
                hi.add(t1 + k * b / 2, drum(78 if k % 2 else 64, 0.6, 0.55 if k in (0, 3, 6) else 0.3, 0.35, dec=9), 0.25 if k % 2 else -0.25)
                hi.add(t1 + k * b / 2, dbass(r + [0, 0, 12, 0, 7, 0, 12, 0][k], b / 2 * 0.9), 0, 0.5 if k in (0, 3, 6) else 0.34)
            for tb in (1, 3): hi.add(t1 + tb * b, anvil(1150, 0.8, 0.3), 0.4)
            for tb in (1.5, 3.5): hi.add(t1 + tb * b, brass([n + 12 for n in ch], 0.45 * b + 0.2, att=0.01, rel=0.12, drive=3.5, swell=0.05), -0.1, 0.2)
            if (i * 2 + bar_) % 4 == 3:
                for k in range(8): hi.add(t1 + 2 * b + k * b / 4, snare(0.2, 0.15 + 0.04 * k), 0.15)
    base.reverb(3.5, 0.35, 3500); hi.reverb(2.0, 0.22, 4500)
    base.write('volcano'); hi.write('volcano_hi')

# ---- boss3: e-frygiskt dominant (E F Dm C), 160 bpm, 16 takter = 24 s: galopperande distbas, trummor, mässing, kör ----
def boss3():
    b = 0.375; T = 64 * b; L = Loop(T)
    prog = [(28, [64, 68, 71]), (29, [65, 69, 72]), (26, [62, 65, 69]), (24, [64, 67, 72])]
    phrase = [(0, 64, 1), (1, 65, 1), (2, 68, 1), (3, 69, 1), (4, 71, 2), (6, 72, 1), (7, 71, 1),
              (8, 69, 1.5), (9.5, 68, 0.5), (10, 65, 2), (12, 69, 2), (14, 72, 2),
              (16, 74, 2), (18, 72, 1), (19, 69, 1), (20, 65, 2), (22, 69, 2),
              (24, 67, 1.5), (25.5, 65, 0.5), (26, 64, 1), (27, 65, 1), (28, 64, 3.5)]
    for half in range(2):
        h0 = half * 32 * b
        for i, (r, ch) in enumerate(prog):
            t0 = h0 + i * 8 * b
            for beat in range(8):
                tb = t0 + beat * b
                for off, du, gg in ((0, 0.5, 0.6), (0.5, 0.25, 0.4), (0.75, 0.25, 0.45)):
                    L.add(tb + off * b, dbass(r + 12, du * b * 0.9, drive=2.8), 0, gg)
                L.add(tb, drum(55, 0.5, 0.9, 0.3, dec=10), 0)
                if beat % 2 == 1: L.add(tb, snare(0.3, 0.55), 0.1)
                for k in range(4 if half else 2):
                    L.add(tb + k * b / (4 if half else 2), tick(0.05, 0.12 if k % 2 == 0 else 0.07), 0.4)
            L.add(t0, drum(42, 1.5, 0.9, 0.5, dec=4), -0.1); L.add(t0 + 3.5 * b, drum(48, 1.0, 0.6, 0.5, dec=6), -0.1)
            L.add(t0, choir([n - 12 for n in ch], 1.5 * b + 0.3, 0.02, 0.25, 0.55, F=HA), 0)
            if half: L.add(t0 + 4 * b - 0.05, choir([n - 12 for n in ch], 4 * b + 0.3, 0.3, 0.5, 0.4), 0)
            if half:
                arp = [ch[0], ch[1], ch[2], ch[1] + 12]
                for k in range(32): L.add(t0 + k * b / 4, pluck(arp[k % 4] + 12, 0.25, 1.2, 0.1 if k % 4 else 0.15), 0.5)
        for t0, n, dd in phrase:
            L.add(h0 + t0 * b, brass([n] if half == 0 else [n, n - 12], dd * b + 0.1, att=0.02, rel=0.12, drive=2.6, swell=0.2, hi_fc=3000), -0.2, 0.32)
        for k in range(8): L.add(h0 + 30 * b + k * b / 4, drum(90 - 5 * k, 0.4, 0.3 + 0.05 * k, 0.4, dec=10), 0.2)
        rs = tt(2 * b); L.add(h0 + 30 * b, svf(noise(2 * b), 400 * 10 ** (rs / (2 * b)), 3) * (rs / (2 * b)) ** 2, 0, 0.12)
    L.add(0, L.drone(28, 0.3, h=8, roll=1.4, cyc=4, hi=300))
    L.reverb(1.8, 0.22, 4500)
    L.write('boss3')

# ---- secret: E-lydiskt, 50 bpm, 8 takter = 38,4 s: glasharmonika, glasdyna, klockspel, luft ----
def secret():
    b = 1.2; T = 32 * b; L = Loop(T)
    L.add(0, L.drone(40, 0.25, h=4, roll=2.0, cyc=2, hi=300) + L.drone(47, 0.15, h=4, roll=2.0, cyc=3, hi=400))
    L.add(0, L.bed(2500, 7000, 0.015, cyc=5))
    chords = [[64, 71, 75, 80, 82], [61, 68, 71, 75, 76], [57, 64, 68, 71, 73], [59, 66, 68, 73, 76]]  # Emaj7#11 C#m9 Amaj9 B6sus
    for i, ch in enumerate(chords):
        for j, n in enumerate(ch):
            L.add(i * 8 * b - 1.0 + 0.15 * j, glass(n, 8 * b + 3.0, 0.22, att=1.6, rel=2.6, trem=3.5 + 0.4 * j), -0.6 + 0.3 * j)
    mel = [(0, 80, 3), (3, 78, 1), (4, 75, 4), (8, 76, 2), (10, 80, 2), (12, 83, 4),
           (16, 85, 3), (19, 83, 1), (20, 80, 2), (22, 82, 2), (24, 78, 3), (27, 75, 1), (28, 76, 4)]
    for k, (t0, n, dd) in enumerate(mel):
        L.add(t0 * b, glass(n, dd * b + 1.6, 0.45, att=0.25, rel=1.4), 0.3 if k % 2 else -0.3)
        L.add(t0 * b + 0.75 * b, glass(n, dd * b + 1.0, 0.1, att=0.3, rel=1.2), -0.5 if k % 2 else 0.5)  # eko
    for _ in range(36):
        L.add(rng.uniform(0, T), bar(m2f(rng.choice([88, 90, 92, 95, 97, 99, 100])), 1.4, 0.05, dec=2.5), rng.uniform(-0.9, 0.9))
    for t0 in (0, 16): L.add(t0 * b, bell(52, 8.0, 0.18), 0.0)
    L.reverb(6.0, 0.55, 6000, 0.05)
    L.write('secret')

# ---- survival: a-moll (Am F G E), 140 bpm, 16 takter = 27,4 s: taiko, stråkostinato, mässing, krigsrop ----
def survival():
    b = 60 / 140; T = 64 * b; L = Loop(T)
    prog = [(33, [57, 60, 64]), (29, [57, 60, 65]), (31, [55, 59, 62]), (28, [56, 59, 64])]
    mel = [(0, 69, 1.5), (1.5, 72, 0.5), (2, 76, 2), (4, 74, 1), (5, 72, 1), (6, 71, 2),
           (8, 72, 1.5), (9.5, 69, 0.5), (10, 65, 2), (12, 69, 1), (13, 72, 1), (14, 77, 2),
           (16, 76, 1.5), (17.5, 74, 0.5), (18, 71, 2), (20, 74, 1), (21, 76, 1), (22, 79, 2),
           (24, 76, 1.5), (25.5, 75, 0.5), (26, 76, 1), (27, 71, 1), (28, 68, 2), (30, 71, 2)]
    for half in range(2):
        h0 = half * 32 * b
        for i, (r, ch) in enumerate(prog):
            t0 = h0 + i * 8 * b
            for k in range(32):  # stråkostinato i sextondelar
                n = r + 12 + [0, 0, 12, 0, 7, 0, 12, 7][k % 8]
                tm = tt(b / 4 * 0.85); s = sawp(2 * np.pi * m2f(n) * tm, 5000, m2f(n))
                s = fftfilt(s, 60, 1800) * env(len(tm), 0.003, 0.03)
                L.add(t0 + k * b / 4, s, -0.3, 0.16 if k % 4 else 0.24)
            for bar_ in range(2):
                t1 = t0 + bar_ * 4 * b
                for tb, f0, gg in ((0, 46, 1.0), (1.5, 46, 0.6), (2, 52, 0.8), (3, 46, 0.6), (3.5, 60, 0.5)):
                    L.add(t1 + tb * b, drum(f0, 1.0, gg, 0.5, dec=6), -0.1)
                for k in range(8): L.add(t1 + k * b / 2, drum(120, 0.3, 0.18 if k % 2 else 0.28, 0.6, dec=14), 0.35)
                if half:
                    for tb in (1, 3): L.add(t1 + tb * b, snare(0.3, 0.5), 0.1)
                for k in range(8): L.add(t1 + k * b / 2 + b / 4, tick(0.05, 0.08), -0.4)
            L.add(t0, anvil(1300, 0.7, 0.28), 0.45)
            L.add(t0 - 0.05, choir([n - 12 for n in ch], 8 * b + 0.4, 0.3, 0.5, 0.3), 0)
            if i % 2 == 0:  # krigsrop "HA!"
                y = choir([ch[0] - 24, ch[0] - 12], 0.3, 0.01, 0.12, 1.0, F=HA, hmax=6000) * np.exp(-tt(0.3) * 6)
                y += fftfilt(noise(0.3), 800, 3000) * np.exp(-tt(0.3) * 25) * 0.3
                L.add(t0 + 2 * b, y, 0.15, 0.55)
        for t0, n, dd in mel:
            notes = [n] if half == 0 else [n, n - 12]
            L.add(h0 + t0 * b, brass(notes, dd * b + 0.12, att=0.03, rel=0.15, drive=2.0, swell=0.25, hi_fc=2800), 0.2, 0.3 if half == 0 else 0.36)
        for k in range(6): L.add(h0 + 30.5 * b + k * b / 4, drum(80 + 6 * k, 0.4, 0.35 + 0.08 * k, 0.4, dec=9), 0.2)
    L.add(0, L.drone(33, 0.25, h=8, roll=1.4, cyc=4, hi=300))
    L.reverb(1.8, 0.2, 5000)
    L.write('survival')

volcano(); boss3(); secret(); survival()
PY
python3 -I "$T/synth4.py" "$T"

# ---------- musik ----------
mus volcano -20 anull "$T/volcano.wav"
mus volcano_hi -23 anull "$T/volcano_hi.wav"
mus boss3 -19 anull "$T/boss3.wav"
mus secret -20 anull "$T/secret.wav"
mus survival -19 anull "$T/survival.wav"

# ---------- ljudeffekter ----------
# spikpistolen
fx nailgun_fire "[0:a]$P,asetrate=50715,aresample=44100,highpass=f=60[a];[1:a]$P,volume=0.55,highpass=f=400[b];[2:a]$P,highpass=f=1500,volume=0.45,adelay=8[c];[3:a]$P,atrim=0:0.15,volume=0.6,adelay=25[d];[a][b][c][d]$(mix 4),atrim=0:0.4,afade=t=out:st=0.22:d=0.18[o]" "$S/Weapons/harsh_thud.wav" "$I/impactMetal_light_001.ogg" "$S/Environment/air_burst.wav" "$R/metalClick.ogg"
fx nail_hit "[0:a]$P[a];[1:a]$P,asetrate=55125,aresample=44100,volume=0.6[b];[2:a]$P,volume=0.35,highpass=f=600[c];[a][b][c]$(mix 3),atrim=0:0.32,afade=t=out:st=0.18:d=0.14[o]" "$T/s_tink.wav" "$I/impactMetal_light_000.ogg" "$I/impactGeneric_light_001.ogg"
fx nail_flesh "[0:a]$P[a];[1:a]$P,volume=0.7[b];[2:a]$P,volume=0.45,asetrate=52920,aresample=44100[c];[a][b][c]$(mix 3),atrim=0:0.4,afade=t=out:st=0.25:d=0.15[o]" "$S/Combat and Gore/splat_quick.wav" "$I/impactPunch_medium_001.ogg" "$S/Materials/cork_stabbed.wav"
# staven
fx staff_zap "[0:a]$P[a];[1:a]$P,atrim=0.05:0.6,asetpts=PTS-STARTPTS,highpass=f=300,volume=0.35[b];[a][b]$(mix 2),atrim=0:0.55,afade=t=out:st=0.35:d=0.2[o]" "$T/s_staff_zap.wav" "$D/zap2.ogg"
fx staff_charge "[0:a]$P[a];[1:a]$P,atrim=2:3.05,asetpts=PTS-STARTPTS,highpass=f=150,volume=36dB,afade=t=in:d=0.9,volume=0.5[b];[a][b]$(mix 2),afade=t=out:st=0.97:d=0.08[o]" "$T/s_staff_charge.wav" "$H/House & Office/Fluorescent light bulb buzz_2.wav"
fx staff_orb "[0:a]$P[a];[1:a]$P,volume=0.6,lowpass=f=1200[b];[2:a]$P,atrim=0.05:0.5,asetpts=PTS-STARTPTS,highpass=f=400,volume=0.3[c];[a][b][c]$(mix 3),atrim=0:1.3,afade=t=out:st=0.9:d=0.4[o]" "$T/s_staff_orb.wav" "$I/impactPunch_heavy_000.ogg" "$D/zap1.ogg"
# bågen
fx bow_draw "[0:a]$P[a];[1:a]$P,atrim=0.05:0.66,asetpts=PTS-STARTPTS,asetrate=39690,aresample=44100,volume=0.6[b];[2:a]$P,atrim=0.2:0.85,asetpts=PTS-STARTPTS,volume=10dB,highpass=f=700,volume=0.5[c];[3:a]$P,volume=0.4[d];[a][b][c][d]$(mix 4),atrim=0:0.65,afade=t=in:d=0.03,afade=t=out:st=0.5:d=0.15[o]" "$T/s_bow_creak.wav" "$R/creak1.ogg" "$H/House & Office/Drawer_squeeky_open_2.wav" "$R/handleSmallLeather.ogg"
fx bow_release "[0:a]$P[a];[1:a]$P,volume=0.8[b];[2:a]$P,volume=0.55,adelay=25[c];[a][b][c]$(mix 3),atrim=0:0.5,afade=t=out:st=0.3:d=0.2[o]" "$T/s_twang.wav" "$S/Other/elastic_twang.wav" "$H/Character/woosh.wav"
fx arrow_hit "[0:a]$P[a];[1:a]$P,volume=0.8[b];[2:a]$P,volume=0.45,lowpass=f=1500[c];[3:a]$P,volume=0.35,adelay=15[d];[a][b][c][d]$(mix 4),atrim=0:0.5,afade=t=out:st=0.3:d=0.2[o]" "$S/Materials/cork_stabbed.wav" "$I/impactWood_medium_002.ogg" "$I/impactPunch_medium_000.ogg" "$T/s_thrum.wav"
fx arrow_pickup "[0:a]$P[a];[1:a]$P,volume=0.6,adelay=60[b];[2:a]$P,volume=0.4,adelay=30,highpass=f=300[c];[a][b][c]$(mix 3),atrim=0:0.5,afade=t=out:st=0.35:d=0.15[o]" "$S/Materials/wood_small_pickup.wav" "$R/handleSmallLeather.ogg" "$S/Materials/bamboo_drop.wav"
# nya fiender
fx necromancer "[0:a]$P[a];[1:a]$P,atrim=2:3.8,asetpts=PTS-STARTPTS,asetrate=33075,aresample=44100,lowpass=f=1800,volume=0.45,afade=t=in:d=0.2[b];[2:a]$P,volume=0.3,highpass=f=1000[c];[a][b][c]$(mix 3),atrim=0:1.7,afade=t=out:st=1.25:d=0.45[o]" "$T/s_chant.wav" "$H/Monsters & Ghosts/Ghost chior.wav" "$T/s_whisper.wav"
fx necro_raise "[0:a]$P,atrim=0:1.5,highpass=f=200,afade=t=in:d=0.15,volume=0.6[a];[1:a]$P,volume=0.8[b];[2:a]$P,lowpass=f=3000,volume=0.6,adelay=600[c];[3:a]$P,volume=0.5,adelay=850[d];[a][b][c][d]$(mix 4),atrim=0:1.6,afade=t=out:st=1.2:d=0.4[o]" "$S/Other/ghost_long.wav" "$T/s_ghost_rise.wav" "$S/Card and Board/dice_shake_3.wav" "$S/Combat and Gore/bone_snap.wav"
fx fire_elemental "[0:a]$P[a];[1:a]$P,volume=0.6[b];[2:a]$P,volume=12dB,asetrate=35280,aresample=44100,lowpass=f=1500,volume=0.5[c];[a][b][c]$(mix 3),atrim=0:1.2,afade=t=out:st=0.8:d=0.4[o]" "$T/s_fire_burst.wav" "$S/Environment/fire_lighting.wav" "$H/Monsters & Ghosts/Monster_breath.wav"
fx elemental_split "[0:a]$P[a];[1:a]$P,volume=0.7[b];[2:a]$P,asetrate=52920,aresample=44100,volume=0.5,adelay=90[c];[a][b][c]$(mix 3),atrim=0:0.9,afade=t=out:st=0.6:d=0.3[o]" "$T/s_split.wav" "$S/Environment/air_burst.wav" "$S/Environment/fire_lighting.wav"
fx lavaworm "[0:a]$P,asetrate=26460,aresample=44100,lowpass=f=1800[a];[1:a]$P,volume=0.6[b];[2:a]$P,asetrate=35280,aresample=44100,volume=6dB,volume=0.4,adelay=550,highpass=f=500[c];[3:a]$P,atrim=0:1.3,highpass=f=2000,volume=0.25[d];[a][b][c][d]$(mix 4),atrim=0:1.25,afade=t=in:d=0.04,afade=t=out:st=0.9:d=0.35[o]" "$H/Monsters & Ghosts/Monster_growl_1.wav" "$T/s_rumble.wav" "$H/Monsters & Ghosts/Hiss.wav" "$H/House & Office/Food_sizzling_5.wav"
fx worm_emerge "[0:a]$P[a];[1:a]$P,atrim=0:1.7,lowpass=f=1500,volume=0.6[b];[2:a]$P,volume=0.5,adelay=80[c];[3:a]$P,volume=0.45,adelay=300[d];[4:a]$P,atrim=0.5:2.3,asetpts=PTS-STARTPTS,highpass=f=1500,volume=10dB,volume=0.3,adelay=150[e];[a][b][c][d][e]$(mix 5),atrim=0:1.8,afade=t=out:st=1.3:d=0.5[o]" "$T/s_eruption_small.wav" "$S/Materials/stone_push_medium.wav" "$I/impactMining_000.ogg" "$I/impactMining_003.ogg" "$H/House & Office/Food_sizzling_6.wav"
fx deathknight "[0:a]$P[a];[1:a]$P,volume=0.6,adelay=110[b];[2:a]$P,atrim=0:1.2,asetrate=30870,aresample=44100,lowpass=f=2500,volume=0.9,adelay=180[c];[3:a]$P,asetrate=30870,aresample=44100,lowpass=f=3000,volume=0.4,adelay=40[d];[a][b][c][d]$(mix 4),atrim=0:1.35,afade=t=out:st=1.0:d=0.35[o]" "$I/impactPlate_heavy_001.ogg" "$I/impactMetal_heavy_002.ogg" "$H/Monsters & Ghosts/Monster_growl_1.wav" "$S/Items/keys_jingling.wav"
fx knight_wave "[0:a]$P[a];[1:a]$P,volume=0.7[b];[2:a]$P,asetrate=35280,aresample=44100,volume=0.6[c];[a][b][c]$(mix 3),atrim=0:0.85,afade=t=out:st=0.55:d=0.3[o]" "$T/s_kwave.wav" "$S/Weapons/sword_slice.wav" "$S/Other/whoosh_2.wav"
fx banshee "[0:a]$P[a];[1:a]$P,atrim=0:1.4,highpass=f=500,volume=0.35[b];[2:a]$P,atrim=1.2:2.7,asetpts=PTS-STARTPTS,asetrate=52920,aresample=44100,volume=8dB,volume=0.4,afade=t=in:d=0.2[c];[a][b][c]$(mix 3),atrim=0:1.35,afade=t=out:st=0.95:d=0.4[o]" "$T/s_wail.wav" "$S/Other/ghost_long.wav" "$H/Monsters & Ghosts/Ghost_moan_2.wav"
fx banshee_scream "[0:a]$P,atrim=0:1.05,afade=t=in:d=0.02[a];[1:a]$P,atrim=0.15:1.2,asetpts=PTS-STARTPTS,asetrate=52920,aresample=44100,volume=0.5[b];[2:a]$P,volume=0.45[c];[a][b][c]$(mix 3),aecho=0.8:0.4:60|110:0.25|0.15,atrim=0:1.05,afade=t=out:st=0.7:d=0.35[o]" "$H/Monsters & Ghosts/Ghost_scream_3.wav" "$H/Ambient/Scream.wav" "$T/s_scream.wav"
fx flame_boss_roar "[0:a]$P,atrim=0.4:2.9,asetpts=PTS-STARTPTS,asetrate=37485,aresample=44100,afade=t=in:d=0.06[a];[1:a]$P,asetrate=33075,aresample=44100,volume=0.5,lowpass=f=2500[b];[2:a]$P,volume=0.7[c];[3:a]$P,volume=0.5[d];[a][b][c][d]$(mix 4),atrim=0:2.2,afade=t=out:st=1.5:d=0.7[o]" "$H/Monsters & Ghosts/Monster_Roar_4.wav" "$H/Monsters & Ghosts/Monster_Roar_2.wav" "$T/s_fire_roar.wav" "$S/Environment/fire_lighting.wav"
# vulkanvärlden
TOP=-4 fxloop lava_bubble 3 0.6 "[0:a]$P[a];[1:a]$P,atrim=1:4.6,asetpts=PTS-STARTPTS,asetrate=26460,aresample=44100,lowpass=f=1400,volume=0.35[b];[2:a]$P,atrim=0:3.7,asetrate=30870,aresample=44100,lowpass=f=1200,volume=0.5[c];[a][b][c]$(mix 3),atrim=0:3.7[o]" "$T/s_lava_blubs.wav" "$S/Environment/water_boiling_loop.wav" "$H/Liquids/Bubbles.wav"
TOP=-4 fxloop volcano_rumble 4 0.7 "[0:a]$P[a];[1:a]$P,atrim=10:15,asetpts=PTS-STARTPTS,asetrate=22050,aresample=44100,lowpass=f=800,volume=18dB,volume=0.5[b];[a][b]$(mix 2),atrim=0:4.8[o]" "$T/s_vrumble.wav" "$H/House & Office/Gas funace_running.wav"
fx eruption "[0:a]$P[a];[1:a]$P,volume=0.7,lowpass=f=1500[b];[2:a]$P,volume=0.45,adelay=250[c];[3:a]$P,volume=0.4,adelay=520[d];[4:a]$P,lowpass=f=2500,volume=0.35,adelay=700[e];[5:a]$P,atrim=0:2,highpass=f=1800,volume=0.3,adelay=200[f];[a][b][c][d][e][f]$(mix 6),atrim=0:2.1,afade=t=out:st=1.5:d=0.6[o]" "$T/s_eruption.wav" "$I/impactPunch_heavy_003.ogg" "$I/impactMining_001.ogg" "$I/impactMining_004.ogg" "$S/Card and Board/dice_roll_2.wav" "$H/House & Office/Food_sizzling_5.wav"
fx firejet "[0:a]$P[a];[1:a]$P,atrim=0:1.1,volume=28dB,highpass=f=300,volume=0.4,afade=t=in:d=0.08[b];[2:a]$P,volume=0.6[c];[a][b][c]$(mix 3),atrim=0:1.05,afade=t=out:st=0.7:d=0.35[o]" "$T/s_firejet.wav" "$H/House & Office/Gas Stove_running.wav" "$S/Environment/air_burst.wav"
fx crumble "[0:a]$P[a];[1:a]$P,volume=0.7,lowpass=f=2500[b];[2:a]$P,volume=0.5,adelay=60[c];[3:a]$P,volume=0.45,adelay=330[d];[4:a]$P,volume=0.4,lowpass=f=3000,adelay=200[e];[a][b][c][d][e]$(mix 5),atrim=0:1.2,afade=t=out:st=0.85:d=0.35[o]" "$T/s_crumble.wav" "$S/Materials/stone_push_short.wav" "$I/impactMining_002.ogg" "$I/impactMining_000.ogg" "$S/Card and Board/dice_roll_1.wav"
fx pendulum "[0:a]$P[a];[1:a]$P,asetrate=26460,aresample=44100,lowpass=f=2000,volume=0.5,adelay=150[b];[2:a]$P,lowpass=f=1800,volume=0.25[c];[a][b][c]$(mix 3),atrim=0:0.95,afade=t=out:st=0.7:d=0.25[o]" "$T/s_swish.wav" "$S/Other/whoosh_2.wav" "$R/creak3.ogg"
TOP=-3 fx plate_click "[0:a]$P,atrim=0:0.2,lowpass=f=3500[a];[1:a]$P,atrim=0:0.12,asetrate=33075,aresample=44100,volume=0.6[b];[2:a]$P,asetrate=35280,aresample=44100,volume=0.5,adelay=20[c];[a][b][c]$(mix 3),atrim=0:0.3,afade=t=out:st=0.15:d=0.15[o]" "$I/impactMining_003.ogg" "$R/metalClick.ogg" "$I/impactWood_light_001.ogg"
fx barrel_poison "[0:a]$P[a];[1:a]$P,volume=0.7[b];[2:a]$P,volume=14dB,volume=0.6,adelay=40[c];[3:a]$P,atrim=0:1.0,lowpass=f=1200,volume=0.5,adelay=200[d];[4:a]$P,volume=0.6,lowpass=f=900[e];[a][b][c][d][e]$(mix 5),atrim=0:1.1,afade=t=out:st=0.75:d=0.35[o]" "$T/s_gasburst.wav" "$S/Environment/air_burst.wav" "$H/Liquids/Spray.wav" "$H/Liquids/Bubbles.wav" "$I/impactWood_heavy_001.ogg"
fx barrel_frost "[0:a]$P[a];[1:a]$P,volume=0.6,adelay=30[b];[2:a]$P,volume=0.5[c];[3:a]$P,volume=0.6,adelay=60[d];[4:a]$P,volume=0.5,lowpass=f=900[e];[a][b][c][d][e]$(mix 5),atrim=0:1.0,afade=t=out:st=0.7:d=0.3[o]" "$I/impactGlass_heavy_003.ogg" "$I/impactGlass_medium_002.ogg" "$S/Environment/air_burst.wav" "$T/s_icecrack.wav" "$I/impactWood_heavy_001.ogg"
# lägret, uppdrag, runor
TOP=-4 fxloop campfire 3 0.6 "[0:a]$P[a];[1:a]$P,atrim=1:4.6,asetpts=PTS-STARTPTS,highpass=f=1500,volume=6dB,volume=0.3[b];[a][b]$(mix 2),atrim=0:3.7[o]" "$T/s_campfire.wav" "$H/House & Office/Food_sizzling_6.wav"
fx eat "[0:a]$P[a];[1:a]$P,volume=0.45,adelay=380[b];[a][b]$(mix 2),atrim=0:1.15,afade=t=out:st=0.85:d=0.3[o]" "$S/Other/munching_food.wav" "$S/Combat and Gore/crunch_quick.wav"
fx rest "$P,afade=t=out:st=3.3:d=0.57" "$S/Musical Effects/vibraphone_inn.wav"
fx quest_done "[0:a]$P,aecho=0.8:0.45:90|170:0.3|0.18[a];[1:a]$P,volume=0.5,lowpass=f=1000[b];[a][b]$(mix 2),atrim=0:1.8,afade=t=out:st=1.3:d=0.5[o]" "$S/Musical Effects/brass_positive_long.wav" "$I/impactPunch_heavy_000.ogg"
fx quest_new "[0:a]$P[a];[1:a]$P,atrim=0.15:0.9,asetpts=PTS-STARTPTS,volume=0.6,adelay=200[b];[a][b]$(mix 2),atrim=0:0.95,afade=t=out:st=0.7:d=0.25[o]" "$S/Materials/paper_move.wav" "$S/Items/page_turn.wav"
fx rune_socket "[0:a]$P,atrim=0:0.15[a];[1:a]$P,asetrate=52920,aresample=44100,volume=0.4[b];[2:a]$P,volume=0.7,adelay=40[c];[a][b][c]$(mix 3),atrim=0:0.95,afade=t=out:st=0.65:d=0.3[o]" "$R/metalClick.ogg" "$I/impactMetal_light_002.ogg" "$T/s_rune_shimmer.wav"
TOP=-4 fx rune_proc "$P" "$T/s_rune_proc.wav"
fx secret_stairs "[0:a]$P[a];[1:a]$P,lowpass=f=800,volume=0.4,afade=t=in:d=0.4[b];[2:a]$P,atrim=0:2.4,volume=0.25,afade=t=in:d=0.6[c];[a][b][c]$(mix 3),atrim=0:2.5,afade=t=out:st=1.8:d=0.7[o]" "$T/s_secret_stairs.wav" "$S/Materials/stone_push_long.wav" "$H/Stingers and Spooky Triggers/Harmonized Tone_Pleasant but Spooky.wav"
# förmågor
fx ab_blink "[0:a]$P[a];[1:a]$P,volume=0.4,highpass=f=500[b];[a][b]$(mix 2),atrim=0:0.45,afade=t=out:st=0.3:d=0.15[o]" "$T/s_blink.wav" "$H/Character/Swoosh_3.wav"
fx ab_slowmo "[0:a]$P[a];[1:a]$P,asetrate=22050,aresample=44100,volume=0.5[b];[a][b]$(mix 2),atrim=0:1.2,afade=t=out:st=0.85:d=0.35[o]" "$T/s_slowmo.wav" "$S/Other/whoosh_2.wav"
fx ab_bubble "$P" "$T/s_shield.wav"
fx ab_summon "[0:a]$P[a];[1:a]$P,atrim=4:5.8,asetpts=PTS-STARTPTS,volume=0.25,highpass=f=300,afade=t=in:d=0.4[b];[a][b]$(mix 2),atrim=0:1.9,afade=t=out:st=1.4:d=0.5[o]" "$T/s_summon.wav" "$H/Monsters & Ghosts/Ghost chior.wav"
fx ab_quake "[0:a]$P[a];[1:a]$P,volume=0.8,lowpass=f=1200[b];[2:a]$P,lowpass=f=1500,volume=0.5,adelay=60[c];[3:a]$P,volume=0.4,adelay=200[d];[4:a]$P,volume=0.35,adelay=420[e];[a][b][c][d][e]$(mix 5),atrim=0:1.7,afade=t=out:st=1.2:d=0.5[o]" "$T/s_quake.wav" "$I/impactPunch_heavy_003.ogg" "$S/Materials/stone_push_medium.wav" "$I/impactMining_004.ogg" "$I/impactMining_001.ogg"
TOP=-6 fx ability_ready "$P" "$T/s_ready.wav"
# överlevnad, handledning, hjärtslag
fx survival_wave "[0:a]$P[a];[1:a]$P,volume=0.6,lowpass=f=700[b];[a][b]$(mix 2),atrim=0:1.75,afade=t=out:st=1.35:d=0.4[o]" "$T/s_horn.wav" "$I/impactPunch_heavy_001.ogg"
TOP=-6 fx tutorial "$P" "$T/s_tutorial.wav"
TOP=-3 fx heartbeat_fast "$P,lowpass=f=400" "$T/s_heart_fast.wav"

for f in "$M"/volcano.ogg "$M"/volcano_hi.ogg "$M"/boss3.ogg "$M"/secret.ogg "$M"/survival.ogg; do printf '%-34s %6.2f s %5d kB\n' "$f" "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")" "$(( $(stat -c %s "$f") / 1024 ))"; done
