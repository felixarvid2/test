// Rune – små syntetiserade ljud (WebAudio). Inga ljudfiler behövs.
(function () {
  'use strict';
  var R = window.R;
  var ac = null, muted = false;
  try { muted = localStorage.getItem('rune-mute') === '1'; } catch (e) { /* ingen lagring */ }
  function ctx() {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; } }
    if (ac && ac.state === 'suspended') ac.resume();
    return ac;
  }
  function tone(freq, dur, type, vol, slide) {
    if (muted) return;
    var a = ctx(); if (!a) return;
    var t = a.currentTime, o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(vol || 0.08, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  var pitch = 0;
  R.sfx = {
    reset: function () { pitch = 0; },
    chips: function () { tone(520 * Math.pow(1.03, Math.min(pitch++, 40)), 0.09, 'triangle', 0.07); },
    mult: function () { tone(330 * Math.pow(1.03, Math.min(pitch++, 40)), 0.12, 'square', 0.04); },
    xmult: function () { tone(220, 0.25, 'sawtooth', 0.05, 2); tone(330, 0.25, 'triangle', 0.05, 2); },
    money: function () { tone(1320, 0.07, 'square', 0.03); setTimeout(function () { tone(1760, 0.09, 'square', 0.03); }, 60); },
    place: function () { tone(180, 0.06, 'triangle', 0.08, 1.6); },
    pick: function () { tone(660, 0.04, 'sine', 0.05); },
    pattern: function () { tone(440, 0.18, 'triangle', 0.07, 1.5); },
    react: function () { tone(880, 0.2, 'sawtooth', 0.04, 0.5); },
    chain: function () { [392, 494, 587, 784].forEach(function (f, k) { setTimeout(function () { tone(f, 0.18, 'triangle', 0.06); }, k * 50); }); },
    win: function () { [523, 659, 784, 1047].forEach(function (f, k) { setTimeout(function () { tone(f, 0.25, 'triangle', 0.07); }, k * 90); }); },
    lose: function () { [392, 330, 262, 196].forEach(function (f, k) { setTimeout(function () { tone(f, 0.35, 'sawtooth', 0.04); }, k * 140); }); },
    buy: function () { tone(988, 0.08, 'square', 0.04); setTimeout(function () { tone(1318, 0.12, 'square', 0.04); }, 70); },
    burst: function () { tone(120, 0.15, 'sawtooth', 0.05, 0.4); },
    toggle: function () { muted = !muted; try { localStorage.setItem('rune-mute', muted ? '1' : '0'); } catch (e) { /* ingen lagring */ } return muted; },
    get muted() { return muted; }
  };
})();
