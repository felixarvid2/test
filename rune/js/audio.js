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
  // Ljudfiler från Kenneys Interface Sounds och UI Audio (CC0) i assets/sfx/.
  // Spelas med <audio> så att det fungerar även när index.html öppnas direkt från disk.
  // Kan webbläsaren inte spela ogg används de syntetiserade tonerna nedan.
  var canOgg = false;
  try { canOgg = !!document.createElement('audio').canPlayType('audio/ogg; codecs="vorbis"'); } catch (e) { canOgg = false; }
  var pool = {};
  function sample(name, rate, vol) {
    if (muted || !canOgg) return false;
    var list = pool[name] || (pool[name] = []);
    var a = list.filter(function (x) { return x.paused || x.ended; })[0];
    if (!a) {
      if (list.length >= 6) a = list[0];
      else { a = new Audio('assets/sfx/' + name + '.ogg'); a.preload = 'auto'; list.push(a); }
    }
    try {
      a.preservesPitch = false; a.mozPreservesPitch = false; a.webkitPreservesPitch = false;
      a.playbackRate = rate || 1;
      a.volume = vol == null ? 0.6 : vol;
      a.currentTime = 0;
      var pr = a.play();
      if (pr && pr.catch) pr.catch(function () { /* ljud blockerat tills spelaren klickat */ });
    } catch (e) { return false; }
    return true;
  }
  var pitch = 0;
  function rising() { return Math.pow(1.04, Math.min(pitch++, 30)); }
  R.sfx = {
    reset: function () { pitch = 0; },
    chips: function () { var r = rising(); sample('chips', r, 0.5) || tone(520 * r, 0.09, 'triangle', 0.07); },
    mult: function () { var r = rising(); sample('mult', r, 0.55) || tone(330 * r, 0.12, 'square', 0.04); },
    xmult: function () { sample('xmult', 1, 0.7) || (tone(220, 0.25, 'sawtooth', 0.05, 2), tone(330, 0.25, 'triangle', 0.05, 2)); },
    money: function () { sample('money', 1.2, 0.5) || (tone(1320, 0.07, 'square', 0.03), setTimeout(function () { tone(1760, 0.09, 'square', 0.03); }, 60)); },
    place: function () { sample('place', 1, 0.7) || tone(180, 0.06, 'triangle', 0.08, 1.6); },
    unplace: function () { sample('unplace', 1, 0.6) || tone(500, 0.05, 'sine', 0.05, 0.7); },
    pick: function () { sample('pick', 1, 0.5) || tone(660, 0.04, 'sine', 0.05); },
    click: function () { sample('click', 1, 0.5) || tone(800, 0.03, 'square', 0.03); },
    swap: function () { sample('toggle', 1, 0.6) || tone(600, 0.05, 'square', 0.03); },
    open: function () { sample('open', 1, 0.7) || tone(300, 0.2, 'triangle', 0.06, 2); },
    error: function () { sample('error', 1, 0.6) || tone(160, 0.2, 'square', 0.04); },
    pattern: function () { sample('pattern', 1, 0.6) || tone(440, 0.18, 'triangle', 0.07, 1.5); },
    react: function () { sample('react', 1, 0.6) || tone(880, 0.2, 'sawtooth', 0.04, 0.5); },
    chain: function () { sample('chain', 1, 0.7) || [392, 494, 587, 784].forEach(function (f, k) { setTimeout(function () { tone(f, 0.18, 'triangle', 0.06); }, k * 50); }); },
    win: function () { sample('win', 1, 0.8) || [523, 659, 784, 1047].forEach(function (f, k) { setTimeout(function () { tone(f, 0.25, 'triangle', 0.07); }, k * 90); }); },
    lose: function () { sample('lose', 0.8, 0.8) || [392, 330, 262, 196].forEach(function (f, k) { setTimeout(function () { tone(f, 0.35, 'sawtooth', 0.04); }, k * 140); }); },
    buy: function () { sample('buy', 1, 0.6) || (tone(988, 0.08, 'square', 0.04), setTimeout(function () { tone(1318, 0.12, 'square', 0.04); }, 70)); },
    burst: function () { sample('discard', 1, 0.6) || tone(120, 0.15, 'sawtooth', 0.05, 0.4); },
    toggle: function () { muted = !muted; try { localStorage.setItem('rune-mute', muted ? '1' : '0'); } catch (e) { /* ingen lagring */ } return muted; },
    get muted() { return muted; }
  };
})();
