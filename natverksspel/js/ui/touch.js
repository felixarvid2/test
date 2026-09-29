// Mobil och pekskärm: styrspak, knappar, åtgärdsmeny, nyp-zoom i 2D, helskärm och vibration.
NV.touch = (function () {
  var game = null, on = false;
  var joy = { x: 0, y: 0, id: null };
  function $(s) { return document.querySelector(s); }
  function el(tag, cls, html, parent) { var e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; (parent || document.body).appendChild(e); return e; }
  function buzz(ms) { try { if (navigator.vibrate && NV.settings.get('haptics')) navigator.vibrate(ms || 12); } catch (e) { /* stöds inte */ } }

  function init(g) {
    game = g;
    on = NV.gfx.isTouch();
    if (!on) return;
    document.body.classList.add('touch');
    // Styrspaken
    var pad = el('div', 'tc-joy', '<i></i>');
    pad.id = 'tc-joy';
    var knob = pad.querySelector('i');
    function setJoy(t) {
      var r = pad.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, max = r.width / 2;
      var dx = t.clientX - cx, dy = t.clientY - cy, l = Math.hypot(dx, dy);
      if (l > max) { dx *= max / l; dy *= max / l; }
      joy.x = dx / max; joy.y = dy / max;
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    }
    pad.addEventListener('touchstart', function (e) { var t = e.changedTouches[0]; joy.id = t.identifier; setJoy(t); pad.classList.add('on'); e.preventDefault(); }, { passive: false });
    pad.addEventListener('touchmove', function (e) { for (var i = 0; i < e.changedTouches.length; i++) if (e.changedTouches[i].identifier === joy.id) setJoy(e.changedTouches[i]); e.preventDefault(); }, { passive: false });
    function end(e) { for (var i = 0; i < e.changedTouches.length; i++) if (e.changedTouches[i].identifier === joy.id) { joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; pad.classList.remove('on'); } }
    pad.addEventListener('touchend', end); pad.addEventListener('touchcancel', end);
    // Knappar till höger
    var bar = el('div', 'tc-btns');
    bar.id = 'tc-btns';
    function btn(cls, html, fn, title) {
      var b = el('button', 'tc-btn ' + cls, html, bar);
      b.setAttribute('aria-label', title || '');
      b.addEventListener('touchstart', function (e) { e.preventDefault(); b.classList.add('down'); buzz(8); fn(b); }, { passive: false });
      b.addEventListener('touchend', function () { b.classList.remove('down'); });
      b.addEventListener('click', function (e) { if (e.detail !== 0 && !('ontouchstart' in window)) fn(b); });
      return b;
    }
    btn('tc-use', '<span class="ico">✋</span><span class="lbl">Använd</span>', function () { if (game.world && game.world.hover) { game.world.use(); buzz(20); } else game.ui.toast('Gå fram till något och tryck Använd – eller tryck direkt på saken.'); }, 'Använd');
    btn('tc-run', '🏃', function (b) { game.touchRun = !game.touchRun; b.classList.toggle('on', game.touchRun); }, 'Spring');
    btn('tc-jump only3d', '⤒', function () { var w = game.world; if (w.jumpY === 0 && !w.crouch) w.vy = 3.3; }, 'Hoppa');
    btn('tc-crouch only3d', '⤓', function (b) { game.touchCrouch = !game.touchCrouch; b.classList.toggle('on', game.touchCrouch); }, 'Huka');
    // Menyknappen
    var mb = el('button', 'tc-menu', '☰');
    mb.id = 'touch-menu';
    mb.setAttribute('aria-label', 'Meny');
    mb.addEventListener('click', function () { sheet(); });
    // Snabbknappar överst
    var quick = el('div', 'tc-quick');
    [['💻', 'Laptop', function () { game.openLaptop(); }], ['📝', 'Rapport', function () { game.ui.reportPicker(); }], ['💡', 'Ledtråd', function () { game.ui.hintPicker(); }], ['🗺', 'Karta', function () { game.ui.mapDialog(); }]].forEach(function (q) {
      var b = el('button', '', '<span>' + q[0] + '</span><small>' + q[1] + '</small>', quick);
      b.addEventListener('click', function () { buzz(8); q[2](); });
    });
    var hint = el('div', 'tc-rotate', '<div>📱↻</div><p>Vrid telefonen till liggande läge för 3D</p>');
    hint.id = 'tc-rotate';
    // Håll skärmen tänd medan man spelar
    document.addEventListener('visibilitychange', function () { if (!document.hidden) wake(); });
    document.addEventListener('touchend', function () { NV.sfx.unlock(); wake(); }, { once: true });
    // Blockera webbläsarens egen zoom med två fingrar (vi zoomar själva i 2D)
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
    // Nyp för att zooma i 2D
    var c2 = document.getElementById('view2d'), pinch = null;
    c2.addEventListener('touchstart', function (e) { if (e.touches.length === 2) pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }, { passive: true });
    c2.addEventListener('touchmove', function (e) {
      if (e.touches.length !== 2 || !pinch) return;
      var d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (Math.abs(d - pinch) > 40) { game.world.changeZoom && game.world.changeZoom(d > pinch ? 1 : -1); pinch = d; }
    }, { passive: true });
    c2.addEventListener('touchend', function (e) { if (e.touches.length < 2) pinch = null; });
    if (NV.settings.get('hudCollapsed') === false && !NV.settings.store('krabba-passet.touchInit')) { NV.settings.set('hudCollapsed', true); NV.settings.store('krabba-passet.touchInit', 1); }
  }
  var lock = null;
  function wake() {
    try {
      if (lock || !navigator.wakeLock || !game || !game.running) return;
      navigator.wakeLock.request('screen').then(function (l) { lock = l; l.addEventListener('release', function () { lock = null; }); }, function () { /* nekad */ });
    } catch (e) { /* stöds inte */ }
  }
  // Åtgärdsmenyn med alla kortkommandon som stora knappar
  function sheet() {
    var ui = game.ui;
    var items = [
      ['💻', 'Laptop', function () { game.openLaptop(); }], ['📝', 'Felrapport', function () { ui.reportPicker(); }], ['💡', 'Ledtråd', function () { ui.hintPicker(); }],
      ['🗺', 'Karta', function () { ui.mapDialog(); }], ['📖', 'Handbok', function () { ui.handbook(); }], ['📋', 'Ärenden', function () { ui.taskOverview(); }],
      ['🥽', 'Glasögon', function () { game.toggleGoggles(); }], ['📡', 'Pingspår', function () { game.replayPing(); }], ['🏅', 'Karriär', function () { ui.achievementsDialog(); }],
      ['🗒', 'Anteckningar', function () { ui.notesDialog(); }], ['🔦', 'Ficklampa', function () { if (game.mode === '3d') game.world.ex.toggleTorch(); }], ['🎥', game.mode === '3d' ? 'Byt till 2D' : 'Byt till 3D', function () { game.setMode(game.mode === '3d' ? '2d' : '3d'); }],
      ['⛶', 'Helskärm', function () { fullscreen(); }], ['⚙️', 'Inställningar', function () { ui.settingsDialog(); }], ['🏠', 'Huvudmeny', function () { ui.showMenu(); }],
    ];
    ui.showDialog({
      title: 'Meny', cls: 'sheet', html: '<div class="tc-sheet">' + items.map(function (it, i) { return '<button data-i="' + i + '"><span>' + it[0] + '</span>' + it[1] + '</button>'; }).join('') + '</div>',
      buttons: [{ label: 'Stäng', primary: true }],
      onOpen: function (d) { d.querySelectorAll('[data-i]').forEach(function (b) { b.addEventListener('click', function () { var it = items[+b.getAttribute('data-i')]; ui.closeDialog(); setTimeout(it[2], 20); }); }); },
    });
  }
  function fullscreen() {
    var d = document.documentElement;
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (d.requestFullscreen) d.requestFullscreen().then(function () { try { screen.orientation.lock('landscape').catch(function () {}); } catch (e) { /* ok */ } }, function () { game.ui.toast('Helskärm stöds inte här.'); });
      else game.ui.toast('Helskärm stöds inte här.');
    } catch (e) { game.ui.toast('Helskärm stöds inte här.'); }
  }
  // Uppdatera Använd-knappen med vad man kan göra
  function tick() {
    if (!on || !game.world) return;
    var b = document.querySelector('.tc-use');
    var h = game.world.hover;
    var txt = h ? game.describe(h) : '';
    b.classList.toggle('ready', !!h);
    b.querySelector('.lbl').textContent = txt ? txt.split(' ').slice(0, 3).join(' ') : 'Använd';
    document.body.classList.toggle('tc-hidden', game.ui.captures() || !game.running);
    document.body.classList.toggle('playing', game.running && !game.ui.menuOpen());
  }

  return { init: init, joy: joy, active: function () { return on; }, tick: tick, buzz: buzz, sheet: sheet, fullscreen: fullscreen };
})();
