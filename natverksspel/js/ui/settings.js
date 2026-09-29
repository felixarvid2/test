// Inställningar som sparas i webbläsaren (om den tillåter det).
NV.settings = (function () {
  var KEY = 'krabba-passet.settings';
  var defaults = {
    mode: null,          // '3d' eller '2d'
    sens: 1.0,           // muskänslighet (multiplikator)
    invertY: false,
    fov: 70,
    bob: true,
    quality: 'high',     // 'ultra' | 'high' | 'low'
    post: true,          // efterbehandling i 3D (glöd, vinjett, färgton)
    particles: true,
    smooth: false,       // mjukare musrörelse
    showFps: false,
    difficulty: 'normal', // 'easy' | 'normal' | 'hard'
    minimap: true,
    music: false,
    musicVol: 0.5,
    termTheme: 'auto',   // 'auto' | 'classic' | 'green' | 'amber' | 'snes'
    sound: true,
    typeSound: true,
    volume: 0.6,
    termFont: 14,
    hudCollapsed: false,
    zoom2d: 0,           // 0 = automatiskt
    tutorialDone: false,
  };
  var cur = {};
  try { cur = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { cur = {}; }
  function get(k) { return cur.hasOwnProperty(k) ? cur[k] : defaults[k]; }
  function set(k, v) {
    cur[k] = v;
    try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch (e) { /* inget sparas i privat läge */ }
    if (NV.onSetting) NV.onSetting(k, v);
  }
  function store(key, val) { try { if (val === undefined) return JSON.parse(localStorage.getItem(key) || 'null'); localStorage.setItem(key, JSON.stringify(val)); } catch (e) { return null; } return val; }
  function remove(key) { try { localStorage.removeItem(key); } catch (e) { /* ignoreras */ } }
  return { get: get, set: set, store: store, remove: remove, defaults: defaults };
})();

// Syntetiserade ljud med WebAudio. Startar först efter att spelaren klickat.
NV.sfx = (function () {
  var ctx = null, master = null, hum = null, humGain = null, noiseBuf = null;
  function ensure() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    master = ctx.createGain();
    master.gain.value = NV.settings.get('volume');
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  function on() { return NV.settings.get('sound') && ensure(); }
  function out(pan) {
    if (!pan || !ctx.createStereoPanner) return master;
    var p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); p.connect(master);
    return p;
  }
  function tone(freq, dur, type, vol, when, pan, slide) {
    if (!on()) return;
    var t = ctx.currentTime + (when || 0);
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol || 0.2, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out(pan));
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, filterFreq, vol, opts) {
    if (!on()) return;
    opts = opts || {};
    var t = ctx.currentTime + (opts.when || 0);
    var s = ctx.createBufferSource(); s.buffer = noiseBuf;
    var f = ctx.createBiquadFilter(); f.type = opts.type || 'lowpass'; f.frequency.setValueAtTime(filterFreq || 800, t);
    if (opts.sweep) f.frequency.exponentialRampToValueAtTime(opts.sweep, t + dur);
    if (opts.q) f.Q.value = opts.q;
    var g = ctx.createGain();
    g.gain.setValueAtTime(opts.attack ? 0.0001 : (vol || 0.15), t);
    if (opts.attack) g.gain.exponentialRampToValueAtTime(vol || 0.15, t + opts.attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out(opts.pan));
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  // Loopande brus (fläktar, kontorssorl, lagret)
  var loops = {};
  function loop(name, freq, type, q, level, max) {
    if (!on()) { if (loops[name]) loops[name].g.gain.value = 0; return; }
    var L = loops[name];
    if (!L) {
      var src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      var f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      var g = ctx.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(master); src.start();
      L = loops[name] = { g: g };
    }
    var want = Math.max(0, Math.min(1, level)) * max;
    L.g.gain.value += (want - L.g.gain.value) * 0.1;
  }
  // Lugn bakgrundsmusik: långsamma ackord i pentatonisk skala
  var musicTimer = null, musicGain = null, chordIx = 0;
  var CHORDS = [[220, 277.2, 329.6], [196, 246.9, 293.7], [174.6, 220, 261.6], [196, 246.9, 329.6]];
  function playChord() {
    if (!on() || !NV.settings.get('music')) return;
    if (!musicGain) { musicGain = ctx.createGain(); musicGain.connect(master); }
    musicGain.gain.value = NV.settings.get('musicVol') * 0.5;
    var t = ctx.currentTime, ch = CHORDS[chordIx++ % CHORDS.length];
    ch.concat([ch[0] * 2]).forEach(function (f, i) {
      var o = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
      o.type = i === 3 ? 'sine' : 'triangle'; o.frequency.value = f; o.detune.value = (i - 1) * 4;
      fl.type = 'lowpass'; fl.frequency.value = 900;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035, t + 1.6); g.gain.exponentialRampToValueAtTime(0.0001, t + 6.2);
      o.connect(fl); fl.connect(g); g.connect(musicGain); o.start(t); o.stop(t + 6.4);
    });
    // En ton i melodin då och då
    if (Math.random() < 0.7) {
      var mel = [440, 493.9, 554.4, 659.3, 740][Math.floor(Math.random() * 5)];
      var o2 = ctx.createOscillator(), g2 = ctx.createGain();
      o2.type = 'sine'; o2.frequency.value = mel;
      var s2 = t + 1 + Math.random() * 2;
      g2.gain.setValueAtTime(0.0001, s2); g2.gain.exponentialRampToValueAtTime(0.03, s2 + 0.05); g2.gain.exponentialRampToValueAtTime(0.0001, s2 + 2.2);
      o2.connect(g2); g2.connect(musicGain); o2.start(s2); o2.stop(s2 + 2.4);
    }
  }
  var STEP = { carpet: [380, 0.05], wood: [900, 0.08], metal: [2400, 0.07], concrete: [1500, 0.1] };
  var api = {
    unlock: function () { if (ensure() && ctx.state === 'suspended') ctx.resume(); api.music(); },
    click: function () { tone(880, 0.05, 'square', 0.05); },
    step: function (surface) {
      var s = STEP[surface] || [500 + Math.random() * 300, 0.08];
      noise(0.07, s[0] * (0.85 + Math.random() * 0.3), s[1]);
      if (surface === 'metal') tone(1900 + Math.random() * 300, 0.03, 'triangle', 0.012);
      if (surface === 'concrete') noise(0.18, 600, 0.02, { when: 0.06 });
    },
    key: function () { if (NV.settings.get('typeSound')) noise(0.025, 3000, 0.035); },
    tap: function (vol, pan) { noise(0.02, 3500, vol || 0.01, { pan: pan }); },
    open: function () { tone(520, 0.08, 'triangle', 0.1); tone(780, 0.1, 'triangle', 0.08, 0.06); },
    success: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.22, 'square', 0.07, i * 0.1); }); },
    fail: function () { tone(220, 0.18, 'sawtooth', 0.06); tone(180, 0.25, 'sawtooth', 0.05, 0.12); },
    alarm: function (pan) { tone(1320, 0.12, 'square', 0.05, 0, pan); tone(990, 0.12, 'square', 0.05, 0.15, pan); },
    squeak: function () { tone(1800, 0.08, 'square', 0.03, 0, 0, 2600); tone(2200, 0.06, 'square', 0.025, 0.09, 0, 1500); },
    honk: function () { tone(330, 0.25, 'sawtooth', 0.05); tone(415, 0.25, 'sawtooth', 0.04); },
    pour: function () { noise(1.4, 700, 0.08, { type: 'bandpass', sweep: 1800, q: 3, attack: 0.1 }); tone(90, 0.3, 'sine', 0.05, 1.3); },
    xp: function () { tone(1318, 0.06, 'square', 0.035); tone(1760, 0.08, 'square', 0.03, 0.05); },
    levelUp: function () { [523, 659, 784, 1047, 1319, 1568].forEach(function (f, i) { tone(f, 0.3, 'square', 0.06, i * 0.08); tone(f / 2, 0.3, 'triangle', 0.05, i * 0.08); }); },
    achievement: function () { [784, 988, 1175, 1568].forEach(function (f, i) { tone(f, 0.25, 'triangle', 0.08, i * 0.07); }); tone(2093, 0.6, 'sine', 0.05, 0.3); },
    whoosh: function () { noise(0.5, 400, 0.06, { type: 'bandpass', sweep: 2400, q: 1.2, attack: 0.15 }); },
    thud: function () { tone(110, 0.15, 'sine', 0.12, 0, 0, 60); noise(0.08, 300, 0.08); },
    bell: function () { tone(1760, 0.12, 'sine', 0.05); },
    crt: function () { tone(15000, 0.5, 'sine', 0.012); noise(0.25, 1200, 0.05, { type: 'highpass' }); tone(60, 0.2, 'sine', 0.08, 0, 0, 40); },
    ring: function (pan) { for (var i = 0; i < 4; i++) { tone(1200, 0.09, 'square', 0.03, i * 0.12, pan); tone(1500, 0.09, 'square', 0.02, i * 0.12 + 0.06, pan); } },
    torch: function () { tone(3000, 0.02, 'square', 0.04); tone(2200, 0.03, 'square', 0.03, 0.05); },
    goggles: function (on) { tone(on ? 600 : 1200, 0.18, 'sine', 0.05, 0, 0, on ? 1200 : 600); },
    // Fläktbrus som följer avståndet till racken (0..1)
    hum: function (level) { loop('hum', 180, 'bandpass', 0.6, level, 0.12); },
    // Rumston: kontorssorl eller lagrets muller
    ambience: function (kind, level) {
      loop('office', 420, 'bandpass', 0.4, kind === 'office' ? level : 0, 0.03);
      loop('warehouse', 90, 'lowpass', 0.7, kind === 'warehouse' ? level : 0, 0.08);
    },
    music: function () {
      if (!ensure()) return;
      if (NV.settings.get('music') && !musicTimer) { playChord(); musicTimer = setInterval(playChord, 5200); }
      if (!NV.settings.get('music') && musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    },
    setVolume: function (v) { if (master) master.gain.value = v; },
  };
  return api;
})();

// Pixeltypsnitt till 2D-läget och terminalen (SIL Open Font License, se lib/fonts)
(function () {
  if (!window.FontFace || !document.fonts) return;
  [['VT323', 'lib/fonts/VT323.ttf'], ['Press Start 2P', 'lib/fonts/PressStart2P.ttf']].forEach(function (f) {
    try { new FontFace(f[0], 'url(' + f[1] + ')').load().then(function (ff) { document.fonts.add(ff); }, function () { /* reservtypsnitt används */ }); } catch (e) { /* ok */ }
  });
})();
