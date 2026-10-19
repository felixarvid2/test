// Musik, ljudbussar, efterklang och dämpning för Krypta (WebAudio). Globalt: window.Music.
//
//   Music.init(actx, destination) -> { sfx, amb, music }   bussarna (GainNode, gain = volym)
//   Music.sfxIn / Music.ambIn                              här kopplar spelet in sina ljudkällor
//   Music.play(track, { fade = 2 })                        slingar assets/music/<track>.ogg, korstoning; ''/null = tystnad
//   Music.stop(fade = 1.5)
//   Music.setIntensity(x)                                  0..1: öppnar ett lågpass och tonar in <track>_hi.ogg om det finns
//   Music.setVolumes({ music, sfx, amb })                  0..1 vardera
//   Music.reverb(kind)                                     'none' | 'crypt' | 'cave' | 'outdoor' | 'boss'
//   Music.duck(amount, seconds)                            tillfälligt lågpass + sänkning på sfx+amb
//   Music.muffle(on)                                       bestående dämpning (under vatten)
//   Music.sting(name)                                      engångsstinger assets/music/sting_<name>.ogg
//   Music.preload(...tracks)                               hämtar och avkodar i förväg
//   Music.info(track)                                      Promise<{ duration, loop }> (slinglängd i s)
//
// Graf:  sfxIn ─┬───────────────────────────► fxFilter ─► fxGain ─► destination
//               └► highpass ─► Convolver ─► wet ─┘  ▲
//        ambIn ─────────────────────────────────────┘
//        spår (+ _hi-lager) ─► mMix ─► mFilter ─► musicBus ─► destination
//        stinger ─────────────────────────────────► musicBus
// Allt är valfritt: utan AudioContext eller filer gör anropen ingenting.
(function () {
  'use strict';
  const HI = ['forest', 'courtyard', 'swamp', 'frost']; // spår som har ett intensitetslager <spår>_hi.ogg
  // efterklang: längd (RT60), ljushet (lågpass i början -> slutet), förfördröjning, tidiga reflexer, våt nivå
  const REVERBS = {
    crypt: { len: 1.7, bright: 6000, dark: 1800, pre: 0.012, taps: [[0.017, 0.5], [0.029, 0.35], [0.041, 0.3], [0.056, 0.2]], wet: 0.24 },
    cave: { len: 3.4, bright: 3800, dark: 700, pre: 0.028, taps: [[0.045, 0.45], [0.083, 0.35], [0.121, 0.25], [0.19, 0.15]], wet: 0.34 },
    outdoor: { len: 0.6, bright: 7500, dark: 3000, pre: 0.03, taps: [[0.11, 0.3], [0.23, 0.12]], wet: 0.09 },
    boss: { len: 2.7, bright: 4800, dark: 1200, pre: 0.02, taps: [[0.031, 0.45], [0.063, 0.3], [0.097, 0.2]], wet: 0.28 },
  };
  let ctx = null, buses = { sfx: null, amb: null, music: null };
  let sfxIn = null, ambIn = null, musicBus = null, fxFilter = null, fxGain = null, sendHP = null;
  let conv = null, wet = null, revKind = 'none', mMix = null, mFilter = null, stingBus = null;
  let cur = null, want = null, token = 0, intensity = 0, muffled = false, duckEnd = 0, duckAmt = 0;
  let cache = new Map();
  const loops = new WeakMap(); // AudioBuffer -> slinglängd i sekunder
  const irCache = new Map();
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const top = () => Math.min(20000, ctx.sampleRate / 2 - 100);
  const safe = f => function () { try { return f.apply(null, arguments); } catch (e) { return undefined; } };

  // jämn övergång från det nuvarande värdet (setTargetAtTime: t = tidskonstant)
  function glide(param, v, t) {
    const now = ctx.currentTime;
    param.cancelScheduledValues(now); param.setValueAtTime(param.value, now); param.setTargetAtTime(v, now, Math.max(0.005, t));
  }

  function decode(buf) {
    return new Promise(res => {
      try { const p = ctx.decodeAudioData(buf, res, () => res(null)); if (p && p.catch) p.catch(() => res(null)); } catch (e) { res(null); }
    });
  }
  // Chrome kapar inte Vorbis-filens sista block efter slutpositionen, så den avkodade bufferten är
  // några ms för lång (med ljud i). Därför bär filerna LOOPLENGTH=<sampel> i Vorbis-kommentaren
  // (tools/sounds/make2.sh) och källan slingar till exakt den punkten.
  function loopInfo(ab) {
    try {
      const u = new Uint8Array(ab, 0, Math.min(ab.byteLength, 16384));
      let s = '';
      for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
      const m = /LOOPLENGTH=(\d+)/i.exec(s);
      if (!m) return 0;
      const v = s.indexOf('\x01vorbis');
      const rate = v >= 0 ? (u[v + 12] | (u[v + 13] << 8) | (u[v + 14] << 16) | (u[v + 15] << 24)) >>> 0 : 44100;
      return +m[1] / (rate || 44100);
    } catch (e) { return 0; }
  }
  function load(url) {
    if (!cache.has(url)) {
      cache.set(url, fetch(url).then(r => (r.ok ? r.arrayBuffer() : null)).then(ab => {
        if (!ab) return null;
        const le = loopInfo(ab);
        return decode(ab).then(buf => { if (buf && le > 0 && le <= buf.duration) loops.set(buf, le); return buf; });
      }).catch(() => null));
    }
    return cache.get(url);
  }
  const url = n => Music.base + n + '.ogg';

  function init(actx, destination) {
    if (!actx) return { sfx: null, amb: null, music: null };
    if (actx === ctx && sfxIn) return buses;
    ctx = actx; cache = new Map(); irCache.clear(); cur = null; want = null; conv = wet = null; revKind = 'none';
    const dst = destination || ctx.destination;
    sfxIn = ctx.createGain(); ambIn = ctx.createGain(); musicBus = ctx.createGain();
    fxFilter = ctx.createBiquadFilter(); fxFilter.type = 'lowpass'; fxFilter.Q.value = 0; fxFilter.frequency.value = top();
    fxGain = ctx.createGain();
    sendHP = ctx.createBiquadFilter(); sendHP.type = 'highpass'; sendHP.frequency.value = 180;
    sfxIn.connect(fxFilter); sfxIn.connect(sendHP); ambIn.connect(fxFilter);
    fxFilter.connect(fxGain); fxGain.connect(dst);
    mMix = ctx.createGain(); mFilter = ctx.createBiquadFilter(); mFilter.type = 'lowpass'; mFilter.Q.value = 0;
    stingBus = ctx.createGain();
    mMix.connect(mFilter); mFilter.connect(musicBus); stingBus.connect(musicBus); musicBus.connect(dst);
    mFilter.frequency.value = cutoff();
    buses = { sfx: sfxIn, amb: ambIn, music: musicBus };
    return buses;
  }

  // ---------- musik ----------
  function cutoff() { // musikens lågpass: stängt i lugn, öppet i strid
    const t = top(), lo = cur && cur.hi ? 5000 : 2200;
    let f = lo * Math.pow(t / lo, intensity);
    if (muffled) f = Math.min(f, 650);
    return f;
  }
  function levels(c, t) {
    if (!c) return;
    if (c.hi) { glide(c.hi.v.gain, 0.9 * Math.pow(intensity, 0.8), t); glide(c.base.v.gain, 1, t); }
    else glide(c.base.v.gain, 0.85 + 0.15 * intensity, t);
  }
  function start(name, b, h, fade) {
    const t0 = ctx.currentTime + 0.05;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(1, t0 + Math.max(0.02, fade));
    g.connect(mMix);
    const layer = (buf, vol) => {
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      if (loops.has(buf)) { s.loopStart = 0; s.loopEnd = loops.get(buf); }
      const v = ctx.createGain(); v.gain.value = vol; s.connect(v); v.connect(g); s.start(t0);
      return { s, v };
    };
    const c = { name, g, base: layer(b, 1), hi: h ? layer(h, 0) : null };
    levels(c, 0.05);
    return c;
  }
  function fadeOut(c, fade) {
    if (!c) return;
    const now = ctx.currentTime, end = now + Math.max(0.02, fade);
    try {
      c.g.gain.cancelScheduledValues(now); c.g.gain.setValueAtTime(c.g.gain.value, now); c.g.gain.linearRampToValueAtTime(0, end);
      for (const l of [c.base, c.hi]) if (l) { l.s.stop(end + 0.05); l.s.onended = () => { try { l.s.disconnect(); l.v.disconnect(); c.g.disconnect(); } catch (e) { /* redan bortkopplad */ } }; }
    } catch (e) { /* redan stoppad */ }
  }
  function play(track, opts) {
    if (!ctx) return Promise.resolve(false);
    const fade = Math.max(0, num(opts && opts.fade, 2));
    track = track || null;
    if (track === want) return Promise.resolve(!!cur);
    want = track; const my = ++token;
    if (!track) { fadeOut(cur, fade); cur = null; return Promise.resolve(true); }
    const hasHi = HI.includes(track) || !!(opts && opts.hi);
    return Promise.all([load(url(track)), hasHi ? load(url(track + '_hi')) : null]).then(([b, h]) => {
      if (my !== token) return false; // ett nyare anrop har tagit över
      fadeOut(cur, fade); cur = null;
      if (!b) return false;
      cur = start(track, b, h, fade);
      glide(mFilter.frequency, cutoff(), 0.05);
      return true;
    }).catch(() => false);
  }
  function stop(fade) { return play(null, { fade: num(fade, 1.5) }); }
  function setIntensity(x) {
    if (!ctx) return;
    intensity = clamp(num(x, 0), 0, 1);
    glide(mFilter.frequency, cutoff(), 0.25);
    levels(cur, 0.3);
  }
  function setVolumes(v) {
    if (!ctx || !v) return;
    if (v.music != null) glide(musicBus.gain, clamp(num(v.music, 1), 0, 1), 0.03);
    if (v.sfx != null) glide(sfxIn.gain, clamp(num(v.sfx, 1), 0, 1), 0.03);
    if (v.amb != null) glide(ambIn.gain, clamp(num(v.amb, 1), 0, 1), 0.03);
  }
  function sting(name) {
    if (!ctx || !name) return Promise.resolve(false);
    return load(url('sting_' + name)).then(b => {
      if (!b) return false;
      const s = ctx.createBufferSource(); s.buffer = b; s.connect(stingBus);
      if (loops.has(b)) s.start(0, 0, loops.get(b)); else s.start();
      s.onended = () => { try { s.disconnect(); } catch (e) { /* redan bortkopplad */ } };
      const now = ctx.currentTime, g = mMix.gain, hold = now + Math.max(0.3, b.duration - 0.6);
      g.cancelScheduledValues(now); g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0.3, now + 0.15); g.setValueAtTime(0.3, hold); g.linearRampToValueAtTime(1, hold + 1.2);
      return true;
    }).catch(() => false);
  }
  function info(track) { // { duration, loop } för ett spår (loop = slinglängd i s)
    if (!ctx || !track) return Promise.resolve(null);
    return load(url(track)).then(b => (b ? { duration: b.duration, loop: loops.get(b) || b.duration } : null)).catch(() => null);
  }
  function preload() {
    if (!ctx) return Promise.resolve([]);
    const names = [];
    for (const n of arguments) if (n) { names.push(n); if (HI.includes(n)) names.push(n + '_hi'); }
    return Promise.all(names.map(n => load(url(n))));
  }

  // ---------- efterklang ----------
  function impulse(kind) {
    if (irCache.has(kind)) return irCache.get(kind);
    const p = REVERBS[kind], sr = ctx.sampleRate, n = Math.floor((p.len + p.pre) * sr), pre = Math.floor(p.pre * sr);
    const buf = ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = pre; i < n; i++) {
        const t = (i - pre) / sr, k = t / p.len;
        const f = p.bright * Math.pow(p.dark / p.bright, k); // diskanten dör ut fortare
        const a = 1 - Math.exp(-2 * Math.PI * f / sr);
        lp += a * (Math.random() * 2 - 1 - lp);
        d[i] = lp * Math.exp(-6.9 * k) * Math.min(1, t / 0.004);
      }
      for (const [tt, amp] of p.taps) { // tidiga reflexer, lite olika i vänster och höger
        const i = pre + Math.floor((tt * (ch ? 1.07 : 0.94)) * sr);
        if (i < n) d[i] += amp * (ch ? -1 : 1) * 0.5;
      }
    }
    irCache.set(kind, buf);
    return buf;
  }
  function reverb(kind) {
    if (!ctx) return;
    kind = REVERBS[kind] ? kind : 'none';
    if (kind === revKind) return;
    revKind = kind;
    const oc = conv, ow = wet;
    if (ow) {
      glide(ow.gain, 0, 0.08);
      setTimeout(() => { try { sendHP.disconnect(oc); } catch (e) { /* redan */ } try { oc.disconnect(); ow.disconnect(); } catch (e) { /* redan */ } }, 450);
    }
    conv = wet = null;
    if (kind === 'none') return;
    conv = ctx.createConvolver(); conv.buffer = impulse(kind);
    wet = ctx.createGain(); wet.gain.value = 0;
    sendHP.connect(conv); conv.connect(wet); wet.connect(fxFilter);
    glide(wet.gain, REVERBS[kind].wet, 0.1);
  }

  // ---------- dämpning ----------
  const openCut = () => (muffled ? 600 : top());
  const openGain = () => (muffled ? 0.7 : 1);
  function duck(amount, seconds) {
    if (!ctx) return;
    const now = ctx.currentTime, s = Math.max(0.1, num(seconds, 1));
    let a = clamp(num(amount, 0.5), 0, 1);
    if (now < duckEnd) a = Math.max(a, duckAmt); // en pågående starkare dämpning förlängs i stället för att kapas
    duckAmt = a; duckEnd = Math.max(duckEnd, now + s);
    const end = duckEnd, hold = Math.max(now + 0.1, end - Math.min(0.6, (end - now) * 0.5));
    const fc = openCut(), lowF = Math.max(200, fc * Math.pow(250 / fc, a)), fg = openGain(), lowG = fg * (1 - 0.6 * a);
    const f = fxFilter.frequency, g = fxGain.gain;
    f.cancelScheduledValues(now); f.setValueAtTime(f.value, now);
    f.exponentialRampToValueAtTime(lowF, now + 0.08); f.setValueAtTime(lowF, hold); f.exponentialRampToValueAtTime(fc, end);
    g.cancelScheduledValues(now); g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(lowG, now + 0.08); g.setValueAtTime(lowG, hold); g.linearRampToValueAtTime(fg, end);
  }
  function muffle(on) {
    if (!ctx) return;
    on = !!on;
    if (on === muffled) return;
    muffled = on; duckEnd = 0; duckAmt = 0;
    glide(fxFilter.frequency, openCut(), 0.08); glide(fxGain.gain, openGain(), 0.08);
    glide(mFilter.frequency, cutoff(), 0.15);
  }

  const Music = {
    base: 'assets/music/',
    HI,
    init: function (actx, destination) { try { return init(actx, destination); } catch (e) { ctx = null; return { sfx: null, amb: null, music: null }; } },
    play: function (track, opts) { try { return play(track, opts); } catch (e) { return Promise.resolve(false); } },
    stop: function (fade) { try { return stop(fade); } catch (e) { return Promise.resolve(false); } },
    sting: function (name) { try { return sting(name); } catch (e) { return Promise.resolve(false); } },
    info: function (track) { try { return info(track); } catch (e) { return Promise.resolve(null); } },
    preload: function () { try { return preload.apply(null, arguments); } catch (e) { return Promise.resolve([]); } },
    setIntensity: safe(setIntensity),
    setVolumes: safe(setVolumes),
    reverb: safe(reverb),
    duck: safe(duck),
    muffle: safe(muffle),
    get sfxIn() { return sfxIn; },
    get ambIn() { return ambIn; },
    get current() { return cur ? cur.name : null; },
    get intensity() { return intensity; },
    get reverbKind() { return revKind; },
  };
  window.Music = Music;
})();
