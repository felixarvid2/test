// Inställningar som sparas i webbläsaren (om den tillåter det).
NV.settings = (function () {
  var KEY = 'krabba-passet.settings';
  var defaults = {
    mode: null,          // '3d' eller '2d'
    sens: 1.0,           // muskänslighet (multiplikator)
    invertY: false,
    fov: 70,
    bob: true,
    quality: 'high',     // 'high' | 'low'
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
  function tone(freq, dur, type, vol, when) {
    if (!on()) return;
    var t = ctx.currentTime + (when || 0);
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol || 0.2, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, filterFreq, vol) {
    if (!on()) return;
    var t = ctx.currentTime;
    var s = ctx.createBufferSource(); s.buffer = noiseBuf;
    var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq || 800;
    var g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  var api = {
    unlock: function () { if (ensure() && ctx.state === 'suspended') ctx.resume(); },
    click: function () { tone(880, 0.05, 'square', 0.05); },
    step: function () { noise(0.07, 500 + Math.random() * 300, 0.08); },
    key: function () { if (NV.settings.get('typeSound')) noise(0.025, 3000, 0.035); },
    open: function () { tone(520, 0.08, 'triangle', 0.1); tone(780, 0.1, 'triangle', 0.08, 0.06); },
    success: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.22, 'square', 0.07, i * 0.1); }); },
    fail: function () { tone(220, 0.18, 'sawtooth', 0.06); tone(180, 0.25, 'sawtooth', 0.05, 0.12); },
    alarm: function () { tone(1320, 0.12, 'square', 0.05); tone(990, 0.12, 'square', 0.05, 0.15); },
    // Fläktbrus som följer avståndet till racken (0..1)
    hum: function (level) {
      if (!on()) { if (humGain) humGain.gain.value = 0; return; }
      if (!hum) {
        hum = ctx.createBufferSource(); hum.buffer = noiseBuf; hum.loop = true;
        var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 180; f.Q.value = 0.6;
        humGain = ctx.createGain(); humGain.gain.value = 0;
        hum.connect(f); f.connect(humGain); humGain.connect(master); hum.start();
      }
      humGain.gain.value = Math.max(0, Math.min(1, level)) * 0.12;
    },
    setVolume: function (v) { if (master) master.gain.value = v; },
  };
  return api;
})();
