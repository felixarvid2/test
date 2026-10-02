// 2D-världen, version 8: blommor att plocka och ge bort, duvor att mata, kasta macka i dammen,
// joggingrunda runt kontoret, veckans trädgårdstomte, damm i solstrålarna, regndroppar på "linsen",
// motljus, dammiga fotspår i lagret och markeringar på minikartan.
(function () {
  if (!NV.World2D) return;
  var W = NV.World2D.prototype;
  function R(a, b) { return a + Math.random() * (b - a); }
  function dist(a, b, c, d) { return Math.hypot(a - c, b - d); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function hour(w) { return 8 + (w.game.state ? w.game.state.time : 0) / 3600; }
  function outdoors(w) { return /Utanför/.test(w.zone().name); }
  function load() { return NV.v8.load(); }
  function save(d) { NV.v8.save(d); }

  var FLOWERS = [[-19.6, -9.0, '#ff6fa8'], [-17.5, 12.6, '#ffd54a'], [17.6, 5.0, '#b77ee0'], [19.0, -6.5, '#ff8a3d'], [-5.2, -16.8, '#4fc3f7'], [3.0, -16.6, '#ff5a4f']];
  var GNOMES = [[-20.2, 12.8], [19.8, 12.6], [-20.3, -17.0], [14.0, 12.8], [19.3, -9.0], [-15.6, -17.2], [6.0, -17.3], [-9.0, 12.9], [19.6, 9.0], [-20.0, -11.0]];
  var LAP = { start: { x: 10.5, z: -12.2 }, cps: [{ n: 'öst', x: 17.6, z: 0 }, { n: 'norr', x: 0, z: 11.6 }, { n: 'väst', x: -15.8, z: 6 }, { n: 'syd', x: -4, z: -14.2 }] };
  NV.v8.FLOWERS = FLOWERS; NV.v8.GNOMES = GNOMES; NV.v8.LAP = LAP;

  var ORIG_COLLECT = W.collectInteractables;
  W.collectInteractables = function () {
    ORIG_COLLECT.apply(this, arguments);
    var list = this.inters, self = this;
    this.flowers = FLOWERS.map(function (f, i) { var old = (self.flowers || [])[i]; return { x: f[0], z: f[1], col: f[2], regrow: old ? old.regrow : 0 }; });
    this.flowerInters = this.flowers.map(function (f, i) { var o = { x: f.x, z: f.z, inter: { type: 'flower', id: i }, r: 0.6 }; list.push(o); return o; });
    list.push({ x: 10.5, z: -14.4, inter: { type: 'pigeons' }, r: 1.0 });
    list.push({ x: -16.6, z: -4.2, inter: { type: 'skip' }, r: 0.7 });
    this.gnomeInter = { x: 0, z: -100, inter: { type: 'gnome' }, r: 0.6 };
    list.push(this.gnomeInter);
    this.placeGnome();
  };
  W.placeGnome = function () {
    var wk = this.game.week || 1, d = load();
    if (!this.gnomeInter) return;
    var sp = GNOMES[(wk * 7 + 3) % GNOMES.length];
    this.gnome = (d.gnomes || {})[wk] ? null : { x: sp[0], z: sp[1] };
    this.gnomeInter.x = sp[0]; this.gnomeInter.z = this.gnome ? sp[1] : -100;
  };

  // ------------------------------------------------------------------ Uppdatering
  var ORIG_UPD = W.updateFx;
  W.updateFx = function (dt, rdt) {
    ORIG_UPD.apply(this, arguments);
    if (!this.builder) return;
    var self = this, me = this.pos, gbg = this.site === 'gbg', out = outdoors(this), h = hour(this);
    // Blommorna växer upp igen efter en stund
    (this.flowers || []).forEach(function (f, i) { if (f.regrow > 0) { f.regrow -= dt; if (f.regrow <= 0) self.flowerInters[i].z = f.z; } });
    // Duvorna kommer fram och pickar smulor
    if (this.pigeonFeed > 0) {
      this.pigeonFeed -= dt;
      (this.pigeons || []).forEach(function (p, i) {
        if (p.away > 0) return;
        var tx = me.x + Math.cos(i * 2.1) * 0.6, tz = me.z - 0.3 + Math.sin(i * 2.1) * 0.3, dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
        if (d > 0.05) { p.x += dx / d * Math.min(d, dt * 1.2); p.z += dz / d * Math.min(d, dt * 1.2); }
      });
      if (Math.random() < dt * 4) this.part({ x: me.x + R(-0.5, 0.5), z: me.z - 0.2, y: 0.02, life: 2, size: 1, col: '#e6c081' });
      if (this.pigeonFeed <= 0) (this.pigeons || []).forEach(function (p) { p.backT = 1; });
    } else (this.pigeons || []).forEach(function (p) {
      if (!p.backT || p.away > 0) return;
      var dx = p.hx - p.x, dz = p.hz - p.z, d = Math.hypot(dx, dz);
      if (d < 0.05) { p.backT = 0; return; }
      p.x += dx / d * Math.min(d, dt * 0.8); p.z += dz / d * Math.min(d, dt * 0.8);
    });
    // Stenen som studsar på dammen
    this.skips = (this.skips || []).filter(function (s) { s.t -= dt; if (s.t <= 0) { self.ripples.push({ x: s.x, z: s.z, age: 0, life: 1, size: s.last ? 5 : 3 }); if (s.last) { NV.sfx.plop(); } else if (NV.sfx.tap) NV.sfx.tap(); return false; } return true; });
    // Joggingrundan runt kontoret
    if (gbg) this.lapStep();
    // Damm som svävar i solstrålarna på kontoret
    if (gbg && !out && this.weather !== 'rain' && (this.eve || 0) < 0.7 && Math.random() < dt * 3 && this.sprites) {
      var wins = this.sprites.filter(function (s) { return s.emit && s.emit.win && dist(s.emit.x, s.emit.z, me.x, me.z) < 8; });
      if (wins.length) { var wn = wins[Math.floor(Math.random() * wins.length)]; this.part({ x: wn.emit.x - wn.emit.w * 0.4 + R(0, wn.emit.w * 0.8) + (this.beamLean || 0) / 40 * R(0, 1), z: wn.emit.z - R(0.2, 0.6), y: R(0.2, 1.2), vx: R(-0.03, 0.03), vy: R(-0.02, 0.03), life: R(2.5, 4), size: 1, col: 'rgba(255,245,215,0.75)', glow: true }); }
    }
    // Dammiga fotspår på betonggolvet i lagret
    if (this.site === 'boras' && /Lagret/.test(this.zone().name) && this.frame && (!this.lastDust || dist(me.x, me.z, this.lastDust.x, this.lastDust.z) > 0.45)) {
      this.lastDust = { x: me.x, z: me.z }; this.dustSteps = (this.dustSteps || 0) + 1;
      (this.wetPrints = this.wetPrints || []).push({ x: me.x + (this.dustSteps % 2 ? 0.08 : -0.08), z: me.z, age: 0, site: 'boras', dusty: true });
    }
    // Regndroppar på "linsen" när du är ute i regnet
    this.lens = (this.lens || []).filter(function (l) { l.life -= dt; l.y += dt * l.v; return l.life > 0; });
    if (out && this.weather === 'rain' && NV.settings.get('lensDrops') !== false && NV.settings.get('reduceMotion') !== true && Math.random() < dt * 1.5 && this.lens.length < 8) this.lens.push({ x: Math.random(), y: Math.random() * 0.8, r: R(6, 14), life: R(2, 4), v: R(0.002, 0.02) });
  };

  W.lapStep = function () {
    var me = this.pos, lap = this.lap, now = this.t || 0;
    var atStart = dist(me.x, me.z, LAP.start.x, LAP.start.z) < 1.6;
    if (!lap) {
      if (atStart) this.lapArmed = true;
      if (this.lapArmed && !atStart && outdoors(this)) { this.lap = { t0: now, got: {} }; this.lapArmed = false; }
      return;
    }
    if (!outdoors(this)) { this.lap = null; return; }
    LAP.cps.forEach(function (c) { if (!lap.got[c.n] && dist(me.x, me.z, c.x, c.z) < 2.2) { lap.got[c.n] = now; NV.sfx.tap && NV.sfx.tap(); } });
    var n = Object.keys(lap.got).length;
    if (n === LAP.cps.length && atStart) {
      var sec = now - lap.t0, d = load(), best = d.lapBest || 0;
      this.lap = null; this.lapArmed = true;
      NV.career.stat('laps'); if (!best || sec < best) { d.lapBest = sec; save(d); }
      NV.career.max('lapFast', sec < 45 ? 1 : 0);
      var g = this.game;
      g.ui.toast('🏃 <b>Joggingrunda: ' + sec.toFixed(1) + ' s</b>' + (!best || sec < best ? ' – nytt rekord!' : ' (rekord ' + best.toFixed(1) + ' s)'), 'good');
      g.xp(best && sec >= best ? 3 : 10, 'Joggingrunda', true);
      if (this.confetti && NV.settings.get('reduceMotion') !== true) this.confetti(me.x, me.z, 30);
    } else if (now - lap.t0 > 240) this.lap = null;
  };

  // ------------------------------------------------------------------ Ritning
  var ORIG_GFX = W.drawGroundFx;
  W.drawGroundFx = function (g) {
    ORIG_GFX.apply(this, arguments);
    var self = this, t = this.t || 0;
    function at(x, z, y) { var s = self.toScreen(x, z, y || 0); return { x: Math.round(s.x), y: Math.round(s.y) }; }
    if (this.site !== 'gbg') return;
    // Blommor som går att plocka
    (this.flowers || []).forEach(function (f) {
      if (f.regrow > 0) return;
      var s = at(f.x, f.z), sw = Math.round(Math.sin(t * 2 + f.x) * 0.6 * (1 + (self.gust || 0)));
      g.fillStyle = '#3f8a25'; g.fillRect(s.x, s.y - 4, 1, 4); g.fillRect(s.x - 3, s.y - 3, 1, 3); g.fillRect(s.x + 3, s.y - 3, 1, 3);
      [[0, -6], [-3, -4], [3, -4]].forEach(function (o) { g.fillStyle = f.col; g.fillRect(s.x + o[0] - 1 + sw, s.y + o[1] - 1, 3, 2); g.fillStyle = '#fff3a0'; g.fillRect(s.x + o[0] + sw, s.y + o[1] - 1, 1, 1); });
    });
    // Trädgårdstomten
    var gn = this.gnome;
    if (gn) {
      var s2 = at(gn.x, gn.z);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(s2.x - 3, s2.y, 7, 2);
      g.fillStyle = '#2f6fb0'; g.fillRect(s2.x - 2, s2.y - 5, 5, 5);
      g.fillStyle = '#f2d1b8'; g.fillRect(s2.x - 1, s2.y - 7, 3, 2);
      g.fillStyle = '#f4f4f4'; g.fillRect(s2.x - 2, s2.y - 6, 5, 2);
      g.fillStyle = '#d62f2f'; g.fillRect(s2.x - 2, s2.y - 9, 5, 2); g.fillRect(s2.x - 1, s2.y - 11, 3, 2); g.fillRect(s2.x, s2.y - 12, 1, 1);
    }
    // Ringar som visar kontrollpunkterna medan du springer runt
    if (this.lap) LAP.cps.forEach(function (c) {
      if (self.lap.got[c.n]) return;
      var s3 = at(c.x, c.z), rr = 9 + Math.sin(t * 4) * 1.5;
      g.strokeStyle = 'rgba(120,255,160,0.55)'; g.lineWidth = 1; g.beginPath(); g.ellipse(s3.x + 0.5, s3.y + 0.5, rr, rr * 0.45, 0, 0, Math.PI * 2); g.stroke();
    });
  };
  var ORIG_FX = W.drawFx;
  W.drawFx = function (g, sc) {
    ORIG_FX.apply(this, arguments);
    var self = this, me = this.pos;
    // Buketten i handen
    var bq = this.bouquet || 0;
    if (bq && this.site === 'gbg') {
      var s = this.toScreen(me.x + 0.22, me.z, 0.95), x = Math.round(s.x), y = Math.round(s.y);
      g.fillStyle = '#3f8a25'; g.fillRect(x, y, 1, 4);
      for (var i = 0; i < bq; i++) { g.fillStyle = (this.bouquetCols || [])[i] || '#ff6fa8'; g.fillRect(x - 2 + i * 2, y - 2 - (i % 2), 2, 2); }
    }
    // Regndroppar på linsen (skarpa, i full upplösning)
    if ((this.lens || []).length && this.hiQueue) {
      var cw = this.canvas.width, ch = this.canvas.height, lens = this.lens;
      this.hiQueue.push(function (m) {
        lens.forEach(function (l) {
          var x = l.x * cw, y = l.y * ch, a = Math.min(1, l.life);
          var gr = m.createRadialGradient(x - l.r * 0.3, y - l.r * 0.3, 1, x, y, l.r);
          gr.addColorStop(0, 'rgba(255,255,255,' + (0.35 * a).toFixed(2) + ')'); gr.addColorStop(0.6, 'rgba(200,220,255,' + (0.12 * a).toFixed(2) + ')'); gr.addColorStop(1, 'rgba(120,140,170,' + (0.2 * a).toFixed(2) + ')');
          m.fillStyle = gr; m.beginPath(); m.arc(x, y, l.r, 0, Math.PI * 2); m.fill();
        });
      });
    }
  };
  // Motljus från morgonsolen när du är ute
  var ORIG_POST = W.postLow;
  W.postLow = function (g) {
    ORIG_POST.apply(this, arguments);
    if (!this.view || this.weather !== 'sun' || !outdoors(this) || NV.settings.get('sunGlare') === false) return;
    var h = hour(this);
    if (h > 11.5) return;
    var a = 0.16 * (1 - Math.max(0, h - 9) / 2.5), vw = this.view.vw;
    var gr = g.createRadialGradient(vw * 0.08, 0, 0, vw * 0.08, 0, vw * 0.55);
    gr.addColorStop(0, 'rgba(255,236,190,' + a.toFixed(3) + ')'); gr.addColorStop(1, 'rgba(255,236,190,0)');
    g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.fillRect(0, 0, vw, this.view.vh);
    // Små linsreflexer längs en linje från solen
    [[0.3, 6, 0.08], [0.45, 3, 0.1], [0.62, 9, 0.05]].forEach(function (f) { g.fillStyle = 'rgba(255,220,170,' + (f[2] * a / 0.16).toFixed(3) + ')'; g.beginPath(); g.arc(vw * (0.08 + f[0] * 0.6), f[0] * 140, f[1], 0, Math.PI * 2); g.fill(); });
    g.restore();
  };

  // ------------------------------------------------------------------ Minikartan
  NV.afterGame(function () {
    if (!NV.minimap) return;
    NV.minimap.extra = function (g, X, Y, game) {
      var w = game.world;
      if (!w || game.mode !== '2d') return;
      function dot(x, z, col, r) { g.fillStyle = col; g.strokeStyle = '#111'; g.lineWidth = 1; g.beginPath(); g.arc(X(x), Y(z), r, 0, Math.PI * 2); g.fill(); g.stroke(); }
      if (w.site === 'gbg') {
        if (w.ball) dot(w.ball.x, w.ball.z, '#ffffff', 2);
        var rq = w.coffeeReq;
        if (rq && w.people[rq.n]) { var p = w.people[rq.n]; dot(p.x, p.z - 0.6, '#8b5a2b', 3); }
        if (w.lost && w.lost.carried && w.people[w.lost.owner]) { var o = w.people[w.lost.owner]; g.strokeStyle = '#ff6b9a'; g.lineWidth = 2; g.beginPath(); g.arc(X(o.x), Y(o.z), 7, 0, Math.PI * 2); g.stroke(); }
        if (w.lap) LAP.cps.forEach(function (c) { if (!w.lap.got[c.n]) dot(c.x, c.z, '#6dff9a', 3); });
      }
    };
  });

  // ------------------------------------------------------------------ Spelet
  NV.afterGame(function () {
    var g = NV.game;
    if (!g) return;
    var origDescribe = g.describe;
    g.describe = function (i) {
      switch (i.type) {
        case 'flower': return (this.world.bouquet || 0) >= 3 ? 'Buketten är full – ge den till en kollega' : 'Plocka en blomma';
        case 'pigeons': return 'Mata duvorna';
        case 'skip': return 'Kasta macka';
        case 'gnome': return 'Hitta trädgårdstomten!';
      }
      return origDescribe.apply(this, arguments);
    };
    var origInteract = g.onInteract;
    g.onInteract = function (i) {
      var w = this.world, d;
      if (!i) return origInteract.apply(this, arguments);
      // Ge buketten till en kollega
      if (i.type === 'npc' && (w.bouquet || 0) > 0 && !(w.lost && w.lost.carried && w.lost.owner === i.id) && !(w.coffeeReq && w.coffeeReq.cup && w.coffeeReq.n === i.id)) {
        var n = w.bouquet;
        w.bouquet = 0; w.bouquetCols = [];
        NV.career.stat('bouquets');
        if (w.thank) w.thank(i.id);
        this.ui.toast('💐 <b>' + esc(i.id) + ':</b> ”' + (n >= 3 ? 'En hel bukett! Vad fint, tack!' : 'Åh, en blomma. Tack!') + '”', 'good');
        this.xp(n >= 3 ? 8 : 3, 'Blommor till ' + i.id, true);
        if (NV.v8.friend) NV.v8.friend(i.id, n >= 3 ? 3 : 1, 'blommor');
        return;
      }
      switch (i.type) {
        case 'flower': {
          if ((w.bouquet || 0) >= 3) { this.ui.toast('💐 Buketten är full. Ge den till en kollega!'); return; }
          var f = w.flowers[i.id];
          w.bouquet = (w.bouquet || 0) + 1; (w.bouquetCols = w.bouquetCols || []).push(f.col);
          f.regrow = R(90, 160); w.flowerInters[i.id].z = -100;
          NV.sfx.pickup(); NV.career.stat('flowers');
          this.ui.toast('🌸 Du plockade en blomma (' + w.bouquet + '/3). Ge buketten till en kollega.');
          return;
        }
        case 'pigeons': {
          if (w.pigeonFeed > 0) return;
          w.pigeonFeed = 10; NV.career.stat('pigeonFeeds');
          (w.pigeons || []).forEach(function (p) { p.away = 0; p.y = 0; });
          if (NV.sfx.flap) NV.sfx.flap();
          this.ui.toast('🐦 Du strör ut några smulor. Duvorna kommer genast.');
          return;
        }
        case 'skip': {
          w.skips = w.skips || [];
          if (w.skips.length) return;
          var r = Math.random(), k = r < 0.15 ? 1 : (r < 0.4 ? 2 : (r < 0.62 ? 3 : (r < 0.78 ? 4 : (r < 0.89 ? 5 : (r < 0.96 ? 6 : 7)))));
          var x = -16.8, gap = 0.55, tt = 0.25;
          w.faceTo(-20, -4.2); NV.sfx.whoosh();
          for (var s = 0; s < k; s++) { x -= gap; gap *= 0.85; tt += 0.18 + s * 0.02; w.skips.push({ x: x, z: -4.2 + R(-0.1, 0.1), t: tt, last: s === k - 1 }); }
          NV.career.stat('skipThrows'); NV.career.max('bestSkips', k);
          d = load(); var best = d.skipBest || 0; if (k > best) { d.skipBest = k; save(d); }
          var self = this;
          setTimeout(function () { self.ui.toast('🪨 Stenen studsade <b>' + k + ' gång' + (k === 1 ? '' : 'er') + '</b>' + (k > best ? ' – nytt rekord!' : ' (rekord ' + best + ')')); }, (tt + 0.2) * 1000);
          return;
        }
        case 'gnome': {
          if (!w.gnome) return;
          d = load(); d.gnomes = d.gnomes || {}; d.gnomes[this.week || 1] = Date.now(); save(d);
          w.sparks(w.gnome.x, w.gnome.z, 0.5, '#ffd54a', 16);
          w.gnome = null; w.gnomeInter.z = -100;
          NV.sfx.success(); NV.career.stat('gnomes');
          this.ui.toast('🧙 <b>Du hittade veckans trädgårdstomte!</b> Nästa vecka gömmer den sig någon annanstans.', 'good');
          this.xp(15, 'Trädgårdstomte');
          return;
        }
      }
      return origInteract.apply(this, arguments);
    };
    var origStart = g.startWeek;
    g.startWeek = function () { var r = origStart.apply(this, arguments); if (this.world && this.world.placeGnome) this.world.placeGnome(); return r; };
    var A = NV.career.ACH;
    [
      ['flower', 'Blomsterbud', 'Ge en hel bukett med tre blommor till en kollega.', '💐', function (s) { return s.bouquets >= 1; }],
      ['pigeon', 'Duvvän', 'Mata duvorna vid entrén.', '🐦', function (s) { return s.pigeonFeeds >= 1; }],
      ['skip5', 'Mackmästare', 'Få en sten att studsa minst fem gånger.', '🪨', function (s) { return s.bestSkips >= 5; }],
      ['lap', 'Joggingrunda', 'Spring ett varv runt kontoret (från entrén, förbi alla fyra sidor och tillbaka).', '🏃', function (s) { return s.laps >= 1; }],
      ['lapfast', 'Snabba fötter', 'Spring ett varv runt kontoret på under 45 sekunder.', '⏱️', function (s) { return s.lapFast >= 1; }],
      ['gnome1', 'Tomtespanare', 'Hitta veckans trädgårdstomte.', '🧙', function (s) { return s.gnomes >= 1; }],
      ['gnome5', 'Tomtedetektiv', 'Hitta trädgårdstomten fem veckor.', '🔍', function (s) { return s.gnomes >= 5; }],
    ].forEach(function (a) { if (!A.some(function (x) { return x[0] === a[0]; })) A.push(a); });
  });
})();
