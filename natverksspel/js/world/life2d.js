// 2D-världen, version 7: djur, väggklocka, vindbyar, glans, små rörelser och fler detaljer.
(function () {
  if (!NV.World2D) return;
  var W = NV.World2D.prototype, K = NV.World2D.K, A2 = NV.art2d;
  var PPM = K.PPM, ZS = K.ZS, HS = K.HS;
  function R(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function dist(a, b, c, d) { return Math.hypot(a - c, b - d); }

  // ------------------------------------------------------------------ Nya föremål
  var ORIG_SCENE = W.addScenery;
  W.addScenery = function () {
    ORIG_SCENE.call(this);
    var self = this, add = this.addSprite, cv = A2.cv;
    function col(x0, z0, x1, z1) { self.builder.colliders.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1 }); }
    // Väggklocka i kontorslandskapet som visar speltiden
    add(cv(14, 14), 1.72, 9.75, { y: 1.0, key: 9.74, noShadow: true, dyn: { draw: function (g, sp) { self.drawClock(g, sp.x, sp.y - 14); } } });
    // Nödutgångsskylt över dörren till receptionen
    var ex = cv(22, 9), eg = ex.getContext('2d');
    eg.fillStyle = '#0f7a3a'; eg.fillRect(0, 0, 22, 9); eg.fillStyle = '#2fd16b'; eg.fillRect(1, 1, 20, 7);
    eg.fillStyle = '#ffffff'; eg.fillRect(3, 2, 2, 5); eg.fillRect(5, 2, 2, 1); eg.fillRect(5, 4, 1, 1); eg.fillRect(5, 6, 2, 1); eg.fillRect(9, 3, 3, 1); eg.fillRect(11, 2, 1, 3); eg.fillRect(14, 2, 5, 5); eg.fillStyle = '#2fd16b'; eg.fillRect(15, 3, 3, 3);
    add(A2.selout(ex, 0.4), 6.55, -2.09, { y: 1.25, key: -2.1, noShadow: true });
    this.exitSign = { x: 7, z: -2.09 };
    // Affisch i fikarummet
    var po = cv(16, 20), pg = po.getContext('2d');
    pg.fillStyle = '#f4efe2'; pg.fillRect(0, 0, 16, 20); pg.fillStyle = '#c0392b'; pg.fillRect(2, 2, 12, 3); pg.fillStyle = '#6b4a30'; pg.fillRect(5, 8, 6, 6); pg.fillStyle = '#f4efe2'; pg.fillRect(6, 9, 4, 2);
    pg.fillStyle = '#ffffff'; pg.fillRect(11, 9, 2, 3); pg.fillStyle = '#333'; pg.fillRect(3, 16, 10, 1); pg.fillRect(4, 18, 8, 1);
    add(A2.selout(po, 0.4), -4.6, -2.09, { y: 0.55, key: -2.1, noShadow: true });
    // Borås: trailer vid lastkajen, pallyftare, sorteringskärl och en mås
    var tr = K.boxSprite(2.4, 3.4, 1.6, '#e9ecef', '#cfd4da', { stripes: true, fn: function (g, Wd, Dp, Hp) { g.fillStyle = '#1f4e79'; g.fillRect(4, Dp + 6, Wd - 8, 6); g.fillStyle = '#ffffff'; g.font = 'bold 6px monospace'; g.fillText('NORDVIK', 8, Dp + 11); g.fillStyle = '#2b2d31'; g.fillRect(2, Dp + Hp - 4, 8, 4); g.fillRect(Wd - 10, Dp + Hp - 4, 8, 4); } });
    add(tr, 115.4, -1.7, { key: -1.7 }); col(115.4, -1.7, 117.8, 1.7);
    var pj = cv(18, 14), jg = pj.getContext('2d');
    jg.fillStyle = '#c8412f'; jg.fillRect(2, 2, 6, 8); jg.fillStyle = '#e05a4c'; jg.fillRect(2, 2, 6, 2); jg.fillStyle = '#2b2d31'; jg.fillRect(4, 0, 2, 3); jg.fillStyle = '#8f949c'; jg.fillRect(8, 8, 9, 2); jg.fillRect(8, 11, 9, 2); jg.fillStyle = '#1b1b1b'; jg.fillRect(3, 10, 3, 3);
    add(A2.selout(pj, 0.4), 113.2, 4.3, { key: 4.3, shadow: { rx: 0.4, rz: 0.15, dx: 0.1 } }); col(113.2, 4.3, 113.9, 4.6);
    [['#2f6fb0', 'P'], ['#f0b429', 'K'], ['#3f8a57', 'G']].forEach(function (b, i) {
      var c = cv(12, 16), g = c.getContext('2d');
      g.fillStyle = b[0]; g.fillRect(1, 3, 10, 12); g.fillStyle = A2.tone(b[0], 0.25); g.fillRect(1, 3, 3, 12); g.fillStyle = A2.tone(b[0], -0.35); g.fillRect(0, 1, 12, 3);
      g.fillStyle = '#ffffff'; g.fillRect(5, 7, 2, 4);
      add(A2.selout(c, 0.4), 84.2 + i * 0.6, -12.2, { key: -12.2, shadow: { rx: 0.25, rz: 0.1, dx: 0.1 } });
    });
    col(84.2, -12.3, 86.1, -12.0);
    // Djur
    this.ducks = [0, 1].map(function (i) { return { a: i * 2.6, sp: 0.18 + i * 0.07, rx: 1.1 + i * 0.3, rz: 2.2 + i * 0.5, ph: i }; });
    this.frog = { lily: 0, jump: 0, t: 6, from: null };
    this.cat = { x: 2, z: 4, tx: 2, tz: 4, wait: 3, dir: 1, sit: false, ph: 0 };
    this.pigeons = [0, 1, 2].map(function (i) { return { x: 10 + i * 0.5, z: -15 + (i % 2) * 0.6, hx: 10 + i * 0.5, hz: -15 + (i % 2) * 0.6, away: 0, peck: Math.random() * 4 }; });
    this.squirrel = { x: -21, run: 0, wait: R(5, 15), dir: 1 };
    this.gull = { x: 114, z: 3.6, tx: 114, wait: 2, dir: 1 };
    this.gust = 0; this.gustT = R(15, 35);
    this.idleT = 0;
  };

  // Väggklockan: analog, visar speltiden
  W.drawClock = function (g, x, y) {
    var st = this.game.state, sec = 8 * 3600 + (st ? st.time : 0);
    var h = (sec / 3600) % 12, m = (sec / 60) % 60;
    g.fillStyle = '#2b1a10'; g.beginPath(); g.arc(x + 7, y + 7, 7, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fbf8f0'; g.beginPath(); g.arc(x + 7, y + 7, 6, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c9c4b8'; for (var k = 0; k < 12; k += 3) g.fillRect(Math.round(x + 7 + Math.sin(k / 6 * Math.PI) * 5), Math.round(y + 7 - Math.cos(k / 6 * Math.PI) * 5), 1, 1);
    function hand(len, ang, col) { g.strokeStyle = col; g.lineWidth = 1; g.beginPath(); g.moveTo(x + 7.5, y + 7.5); g.lineTo(x + 7.5 + Math.sin(ang) * len, y + 7.5 - Math.cos(ang) * len); g.stroke(); }
    hand(3.2, h / 12 * Math.PI * 2, '#1d1410');
    hand(5, m / 60 * Math.PI * 2, '#1d1410');
    g.fillStyle = '#c0392b'; g.fillRect(x + 7, y + 7, 1, 1);
  };

  // ------------------------------------------------------------------ Rörelser
  var ORIG_UPD = W.updateFx;
  W.updateFx = function (dt, rdt) {
    ORIG_UPD.call(this, dt, rdt);
    if (!this.cat) return;
    var self = this, me = this.pos;
    // Vindbyar: träden vajar mer och löv och kronblad yr
    this.gustT -= dt;
    if (this.gustT <= 0) { this.gust = 1; this.gustT = R(20, 45); }
    this.gust = Math.max(0, this.gust - dt * 0.25);
    if (this.gust > 0.3 && this.amb && Math.random() < dt * 12 * this.gust && this.visMin) {
      var vm = this.visMin, vM = this.visMax, cherry = Math.random() < 0.5;
      this.amb.push({ k: cherry ? 'petal' : 'leaf', x: vm.x - 1, z: R(vm.z, vM.z), y: R(0.6, 2.4), vx: R(2.5, 4), vy: -R(0.05, 0.2), age: 0, life: 6, ph: Math.random() * 6, col: cherry ? '#ffc3e0' : ['#8fcc4d', '#5da236', '#e08b36'][Math.floor(Math.random() * 3)] });
    }
    // Katten strövar runt i kontoret och sätter sig ibland
    var c = this.cat;
    c.ph += dt;
    if (c.wait > 0) { c.wait -= dt; if (c.wait <= 0) { var spots = [[2, 4], [-3, 6.5], [6, 1], [10, 5], [12.5, 8.5], [-1.5, 0.5], [8, 8.6]]; var s = spots[Math.floor(Math.random() * spots.length)]; c.tx = s[0]; c.tz = s[1]; c.sit = false; } }
    else {
      var dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz);
      var fleeing = dist(me.x, me.z, c.x, c.z) < 0.9;
      if (d < 0.08) { c.wait = R(4, 10); c.sit = Math.random() < 0.7; }
      else { var sp = (fleeing ? 2.2 : 0.9) * dt; c.x += dx / d * Math.min(sp, d); c.z += dz / d * Math.min(sp, d); if (Math.abs(dx) > 0.02) c.dir = dx > 0 ? 1 : -1; }
    }
    if (dist(me.x, me.z, c.x, c.z) < 0.7 && c.wait > 0) { c.wait = 0.01; c.sit = false; }
    // Duvorna pickar vid entrén och flyger iväg när du kommer nära
    this.pigeons.forEach(function (p) {
      p.peck += dt;
      if (p.away > 0) { p.away -= dt; p.y = (p.y || 0) + dt * 2.5; p.x += dt * 3 * (p.hx > 10.5 ? 1 : -1); if (p.away <= 0) { p.x = p.hx; p.z = p.hz; p.y = 0; } return; }
      if (self.site === 'gbg' && dist(me.x, me.z, p.x, p.z) < 1.8) { p.away = R(15, 30); p.y = 0.1; if (NV.sfx && NV.sfx.flap) NV.sfx.flap(); }
    });
    // Ekorren springer längs staketet
    var q = this.squirrel;
    if (q.run) { q.x += q.dir * 3.2 * dt; if (q.x > 21 || q.x < -21) { q.run = 0; q.wait = R(10, 25); } else if (Math.random() < dt * 0.4) { q.run = 0; q.wait = R(0.8, 2); q.pause = true; } }
    else { q.wait -= dt; if (q.wait <= 0) { if (!q.pause) { q.dir = Math.random() < 0.5 ? 1 : -1; q.x = q.dir > 0 ? -21 : 21; } q.pause = false; q.run = 1; } }
    // Grodan hoppar mellan näckrosorna
    var f = this.frog;
    if (this.lilies && this.lilies.length) {
      if (f.jump > 0) { f.jump -= dt; if (f.jump <= 0) { f.jump = 0; if (self.addRipple) self.ripples.push({ x: this.lilies[f.lily].x, z: this.lilies[f.lily].z, age: 0, life: 1, size: 4 }); } }
      else { f.t -= dt; if (f.t <= 0) { f.from = f.lily; f.lily = (f.lily + 1 + Math.floor(Math.random() * (this.lilies.length - 1))) % this.lilies.length; f.jump = 0.6; f.t = R(5, 12); } }
    }
    // Fiskar hoppar ibland
    if (this.site === 'gbg' && Math.random() < dt * 0.08 && this.waters && this.waters.gbg) {
      var w = this.waters.gbg[0];
      this.jumps = this.jumps || [];
      this.jumps.push({ x: w.x + R(-1.2, 1.2), z: w.z + R(-2.6, 2.6), t: 0 });
    }
    this.jumps = (this.jumps || []).filter(function (j) { j.t += dt; if (j.t > 0.7 && !j.splashed) { j.splashed = true; self.ripples.push({ x: j.x + 0.3, z: j.z, age: 0, life: 1.2, size: 5 }); } return j.t < 0.8; });
    // Måsen vid lastkajen trippar fram och tillbaka
    var gl = this.gull;
    if (gl.wait > 0) gl.wait -= dt; else { var gdx = gl.tx - gl.x; if (Math.abs(gdx) < 0.05) { gl.wait = R(2, 6); gl.tx = R(112.6, 115.2); } else { gl.x += Math.sign(gdx) * dt * 0.6; gl.dir = Math.sign(gdx); } }
    if (this.site === 'boras' && dist(me.x, me.z, gl.x, gl.z) < 1.5) { gl.tx = gl.x + (gl.x > me.x ? 1.2 : -1.2); gl.tx = clamp(gl.tx, 112.6, 115.2); gl.wait = 0; }
    // Ånga från muggarna på skrivborden och bubblor i vattenautomaten
    if (this.site === 'gbg' && this.parts && Math.random() < dt * 0.6) {
      var A = this.builder.anchors, ids = Object.keys(A.desks).filter(function (id) { return id.indexOf('PC-') === 0; });
      var pick = A.desks[ids[Math.floor(Math.random() * ids.length)]];
      if (pick && dist(me.x, me.z, pick.x, pick.z) < 9) this.part({ x: pick.x - 0.55, z: pick.z - 0.25, y: 0.85, vx: R(-0.03, 0.03), vy: R(0.15, 0.3), life: 1.6, size: 1, grow: 1, col: 'rgba(255,255,255,0.35)' });
    }
    // Spelaren tar upp mobilen när den har stått still en stund
    this.idleT = this.frame ? 0 : this.idleT + dt;
  };

  // ------------------------------------------------------------------ Ritning
  var ORIG_GFX = W.drawGroundFx;
  W.drawGroundFx = function (g) {
    ORIG_GFX.call(this, g);
    if (!this.ducks) return;
    var self = this, t = this.t;
    // Ankor med kölvatten
    if (this.site === 'gbg') this.ducks.forEach(function (d) {
      d.a += (self.frameDt || 0.016) * d.sp;
      var x = -18.3 + Math.cos(d.a) * d.rx, z = -1.5 + Math.sin(d.a) * d.rz, s = self.toScreen(x, z, 0);
      var dir = -Math.sin(d.a) > 0 ? 1 : -1, bob = Math.round(Math.sin(t * 2 + d.ph));
      g.strokeStyle = 'rgba(220,245,250,0.45)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(s.x - dir * 4, s.y + 1); g.lineTo(s.x - dir * 9, s.y - 1); g.moveTo(s.x - dir * 4, s.y + 2); g.lineTo(s.x - dir * 9, s.y + 4); g.stroke();
      g.fillStyle = K.OUT; g.fillRect(s.x - 4, s.y - 3 + bob, 9, 4); g.fillRect(s.x + dir * 2, s.y - 6 + bob, 4, 4);
      g.fillStyle = '#8a6a4a'; g.fillRect(s.x - 3, s.y - 2 + bob, 7, 2); g.fillStyle = '#b8936a'; g.fillRect(s.x - 3, s.y - 2 + bob, 5, 1);
      g.fillStyle = d.ph ? '#2f7a4a' : '#7a5a3a'; g.fillRect(s.x + dir * 2 + (dir > 0 ? 0 : 1), s.y - 5 + bob, 2, 2);
      g.fillStyle = '#f0b429'; g.fillRect(s.x + dir * 5 + (dir > 0 ? 0 : 1), s.y - 4 + bob, 1, 1);
    });
    // Grodan på näckrosbladet
    if (this.site === 'gbg' && this.lilies && this.frog) {
      var f = this.frog, L = this.lilies[f.lily], fx = L.x, fz = L.z, fy = 0;
      if (f.jump > 0 && f.from !== null) { var k = 1 - f.jump / 0.6, F = this.lilies[f.from]; fx = F.x + (L.x - F.x) * k; fz = F.z + (L.z - F.z) * k; fy = Math.sin(k * Math.PI) * 0.6; }
      var sf = this.toScreen(fx, fz, fy);
      g.fillStyle = '#2f6a2a'; g.fillRect(sf.x - 2, sf.y - 3, 5, 3); g.fillStyle = '#5aa64a'; g.fillRect(sf.x - 1, sf.y - 3, 3, 1);
      g.fillStyle = '#ffffff'; g.fillRect(sf.x - 2, sf.y - 4, 1, 1); g.fillRect(sf.x + 2, sf.y - 4, 1, 1);
    }
    // Hoppande fiskar
    (this.jumps || []).forEach(function (j) {
      var k = j.t / 0.7; if (k > 1) return;
      var s = self.toScreen(j.x + k * 0.3, j.z, Math.sin(k * Math.PI) * 0.45);
      g.fillStyle = '#ff8a3c'; g.fillRect(s.x - 1, s.y - 1, 3, 2); g.fillStyle = '#ffffff'; g.fillRect(s.x + 1, s.y - 1, 1, 1);
    });
    // Ringar i vattenpölarna när det regnar
    if ((this.wet || 0) > 0.3 && this.puddles && this.puddles[this.site]) {
      var pud = this.puddles[this.site], o = this.gOff;
      for (var i = 0; i < pud.length; i += 2) {
        var ph = (t * 0.9 + i * 0.37) % 1;
        var x = pud[i] - o[0], y = pud[i + 1] - o[1];
        if (x < -10 || y < -10 || x > this.view.vw + 10 || y > this.view.vh + 10) continue;
        g.strokeStyle = 'rgba(220,235,255,' + (0.5 * (1 - ph) * this.wet) + ')'; g.lineWidth = 1;
        g.beginPath(); g.ellipse(x + 0.5 + (i % 7) - 3, y + 0.5, 1 + ph * 4, 0.5 + ph * 2, 0, 0, Math.PI * 2); g.stroke();
      }
    }
  };
  var ORIG_FX = W.drawFx;
  W.drawFx = function (g, sc) {
    ORIG_FX.call(this, g, sc);
    if (!this.cat) return;
    var self = this, t = this.t;
    // Katten
    if (this.site === 'gbg') {
      var c = this.cat, s = this.toScreen(c.x, c.z, 0), moving = c.wait <= 0, leg = moving ? Math.floor(t * 10) % 2 : 0, d = c.dir;
      g.fillStyle = 'rgba(16,20,60,0.25)'; g.fillRect(s.x - 4, s.y, 9, 1);
      g.fillStyle = K.OUT;
      if (c.sit) { g.fillRect(s.x - 3, s.y - 7, 6, 7); g.fillRect(s.x - 2 + d * 2, s.y - 10, 5, 4); }
      else { g.fillRect(s.x - 5, s.y - 6, 10, 4); g.fillRect(s.x + d * 4 - 2, s.y - 9, 5, 4); g.fillRect(s.x - 4, s.y - 2, 1, 2 - leg); g.fillRect(s.x + 3, s.y - 2, 1, 1 + leg); }
      g.fillStyle = '#e09a4a';
      if (c.sit) { g.fillRect(s.x - 2, s.y - 6, 4, 6); g.fillRect(s.x - 1 + d * 2, s.y - 9, 3, 2); g.fillStyle = '#f4c48a'; g.fillRect(s.x - 1, s.y - 4, 2, 3); }
      else { g.fillRect(s.x - 4, s.y - 5, 8, 2); g.fillRect(s.x + d * 4 - 1, s.y - 8, 3, 2); g.fillStyle = '#b8722e'; g.fillRect(s.x - 2, s.y - 5, 1, 2); g.fillRect(s.x + 1, s.y - 5, 1, 2); }
      g.fillStyle = K.OUT; var ex = c.sit ? s.x - 1 + d * 2 : s.x + d * 4 - 1;
      g.fillRect(ex, c.sit ? s.y - 11 : s.y - 10, 1, 1); g.fillRect(ex + 2, c.sit ? s.y - 11 : s.y - 10, 1, 1);
      var tail = Math.round(Math.sin(t * (c.sit ? 2 : 6) + c.ph) * 2);
      g.fillStyle = '#e09a4a'; g.fillRect(s.x - d * 6, s.y - 6 + tail, 1, 3); g.fillRect(s.x - d * 5, s.y - 4, 1, 1);
      // Duvorna
      this.pigeons.forEach(function (p) {
        var sp = self.toScreen(p.x, p.z, p.y || 0), pk = !p.away && Math.floor(p.peck * 3) % 4 === 0 ? 1 : 0;
        if (p.away > 0) { var up = Math.sin(t * 20) > 0; g.fillStyle = '#7a8090'; g.fillRect(sp.x - 3, sp.y + (up ? -1 : 1), 2, 1); g.fillRect(sp.x - 1, sp.y, 3, 1); g.fillRect(sp.x + 2, sp.y + (up ? -1 : 1), 2, 1); return; }
        g.fillStyle = 'rgba(16,20,60,0.2)'; g.fillRect(sp.x - 2, sp.y, 5, 1);
        g.fillStyle = K.OUT; g.fillRect(sp.x - 2, sp.y - 4, 6, 4); g.fillRect(sp.x + 3, sp.y - 6 + pk * 2, 3, 3);
        g.fillStyle = '#8f96a3'; g.fillRect(sp.x - 1, sp.y - 3, 4, 2); g.fillStyle = '#5a7a8a'; g.fillRect(sp.x + 3, sp.y - 5 + pk * 2, 2, 1); g.fillStyle = '#c87a4a'; g.fillRect(sp.x + 5, sp.y - 5 + pk * 2, 1, 1);
      });
      // Ekorren på staketet
      var q = this.squirrel;
      if (q.run || q.pause) {
        var sq = this.toScreen(q.x, 13.7, 0.6), hop = q.run ? Math.round(Math.abs(Math.sin(t * 14)) * 2) : 0;
        g.fillStyle = K.OUT; g.fillRect(sq.x - 3, sq.y - 4 - hop, 6, 3); g.fillRect(sq.x + q.dir * 3 - 1, sq.y - 6 - hop, 3, 3); g.fillRect(sq.x - q.dir * 4 - 1, sq.y - 9 - hop, 3, 6);
        g.fillStyle = '#b5652e'; g.fillRect(sq.x - 2, sq.y - 3 - hop, 4, 1); g.fillRect(sq.x - q.dir * 4, sq.y - 8 - hop, 1, 4);
      }
      // Bin vid rabatterna
      [[7.1, -11.4], [13.9, -11.4]].forEach(function (b, i) {
        for (var k = 0; k < 3; k++) {
          var bx = b[0] + Math.sin(t * (2.2 + k) + i * 3 + k) * 0.6, bz = b[1] + Math.cos(t * (1.7 + k * 0.6) + k) * 0.25;
          var sb = self.toScreen(bx, bz, 0.5 + Math.sin(t * 5 + k) * 0.1);
          g.fillStyle = '#ffd23f'; g.fillRect(sb.x, sb.y, 2, 1); g.fillStyle = '#2b1a10'; g.fillRect(sb.x + 1, sb.y, 1, 1);
          if (Math.sin(t * 40 + k) > 0) { g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(sb.x, sb.y - 1, 1, 1); }
        }
      });
      // Bubblor i vattenautomaten
      var A = this.builder.anchors;
      if (A.water) for (var bi = 0; bi < 3; bi++) {
        var ph = (t * 0.6 + bi / 3) % 1, sw = this.toScreen(A.water.x, A.water.z, 0.95 + ph * 0.35);
        g.fillStyle = 'rgba(220,240,255,' + (0.8 - ph * 0.6) + ')'; g.fillRect(sw.x + (bi % 2 ? 1 : -1), sw.y, 1, 1);
      }
    }
    // Måsen vid lastkajen
    if (this.site === 'boras') {
      var gl = this.gull, sg = this.toScreen(gl.x, gl.z, 0), stp = gl.wait > 0 ? 0 : Math.floor(t * 8) % 2;
      g.fillStyle = 'rgba(16,20,60,0.22)'; g.fillRect(sg.x - 3, sg.y, 7, 1);
      g.fillStyle = K.OUT; g.fillRect(sg.x - 4, sg.y - 5, 8, 4); g.fillRect(sg.x + gl.dir * 3 - 1, sg.y - 8, 4, 4);
      g.fillStyle = '#f4f6f8'; g.fillRect(sg.x - 3, sg.y - 4, 6, 2); g.fillRect(sg.x + gl.dir * 3, sg.y - 7, 2, 2);
      g.fillStyle = '#8f96a3'; g.fillRect(sg.x - 3, sg.y - 4, 3, 1); g.fillStyle = '#f0b429'; g.fillRect(sg.x + gl.dir * 5, sg.y - 6, 2, 1);
      g.fillStyle = '#f0b429'; g.fillRect(sg.x - 1, sg.y - 1, 1, 1 + stp); g.fillRect(sg.x + 1, sg.y - 1, 1, 2 - stp);
    }
    // Spelaren tittar på mobilen när den stått still länge
    if (this.idleT > 8) {
      var ps = this.toScreen(this.pos.x, this.pos.z, 0);
      g.fillStyle = '#1b1d21'; g.fillRect(ps.x + 3, ps.y - 15, 3, 4); g.fillStyle = Math.floor(t * 2) % 2 ? '#7fd4ff' : '#a8e4ff'; g.fillRect(ps.x + 3, ps.y - 15, 3, 3);
    }
    // Nattfjärilar runt tända lyktor
    var lit = (this.eve || 0) > 0.35 || this.weather === 'rain';
    if (lit) (this.lamps || []).forEach(function (l, i) {
      for (var k = 0; k < 3; k++) {
        var a = t * (3 + k) + i + k * 2, sm = self.toScreen(l.x + Math.cos(a) * 0.25, l.z, 2.05 + Math.sin(a * 1.3) * 0.15);
        g.fillStyle = 'rgba(255,240,210,0.85)'; g.fillRect(sm.x, sm.y, 1, 1);
      }
    });
  };
  var ORIG_POST = W.postLow;
  W.postLow = function (g) {
    ORIG_POST.call(this, g);
    if (!this.view) return;
    var self = this, t = this.t, vw = this.view.vw, vh = this.view.vh;
    g.save(); g.globalCompositeOperation = 'lighter';
    // Glans som sveper över fönstren och bilrutorna
    var sweep = (t * 0.25) % 1;
    if (sweep < 0.35) {
      var k = sweep / 0.35;
      this.sprites.forEach(function (s) {
        if (!s.emit || !s.emit.winOut) return;
        var p = self.toScreen(s.emit.x - s.emit.w * 0.4, -10.09, 0.3), w = s.emit.w * PPM * 0.8;
        var x = p.x + k * (w + 10) - 6;
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.beginPath(); g.moveTo(x, p.y - 22); g.lineTo(x + 4, p.y - 22); g.lineTo(x - 2, p.y); g.lineTo(x - 6, p.y); g.closePath(); g.fill();
      });
      (this.cars || []).forEach(function (c) {
        if ((c.x > 50) !== (self.site === 'boras')) return;
        var p = self.toScreen(c.x - 0.8, c.z, 0), x = p.x + k * 48;
        g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(x, p.y - 24, 3, 7);
      });
    }
    // Blinkande varningsljus på trucken i Borås
    if (this.site === 'boras') {
      var tp = this.toScreen(105.95, -3.95, 1.6), on = Math.sin(t * 9) > 0;
      if (on) A2.glow(g, tp.x, tp.y, 12, '255,150,30', 0.5);
    }
    // Nödutgångsskylten lyser grönt
    if (this.site === 'gbg' && this.exitSign) { var es = this.toScreen(this.exitSign.x, this.exitSign.z, 1.35); A2.glow(g, es.x, es.y, 14, '60,255,140', 0.25); }
    g.restore();
    // Ett lysrör i serverrummet flimrar
    if (this.site === 'gbg' && NV.gfx.profile().lights) {
      var fl = Math.sin(t * 37) * Math.sin(t * 13);
      if (fl > 0.85) { var sv = this.toScreen(-12, -7.5, 0); g.fillStyle = 'rgba(10,15,40,0.18)'; g.beginPath(); g.ellipse(sv.x, sv.y, 40, 26, 0, 0, Math.PI * 2); g.fill(); }
    }
  };
  // Längre skuggor mot kvällen, och mer gungande träd i vindbyar
  var ORIG_SH = W.drawShadows;
  W.drawShadows = function (g, list) {
    var eve = this.eve || 0;
    if (eve > 0.05) list.forEach(function (s) { if (s.shadow) { s.shadow._dx = s.shadow._dx === undefined ? s.shadow.dx || 0 : s.shadow._dx; s.shadow.dx = s.shadow._dx * (1 + eve * 2.2); } });
    return ORIG_SH.call(this, g, list);
  };
  // Hjärtan stiger när någon tackar dig
  var ORIG_THANK = W.thank;
  W.thank = function (n) {
    ORIG_THANK.apply(this, arguments);
    var p = this.people[n];
    if (!p || !this.part) return;
    for (var i = 0; i < 5; i++) this.part({ x: p.x + R(-0.3, 0.3), z: p.z, y: 1.6 + R(0, 0.4), vy: R(0.4, 0.8), vx: R(-0.2, 0.2), life: 1.6, size: 2, col: i % 2 ? '#ff6b8a' : '#ff9ccf', force: true });
  };
  // Händer som skriver på tangentbordet hos de som sitter vid datorn
  var ORIG_CHAR = W.drawChar;
  W.drawChar = function (g, spr, x, z, sc, sitting, p) {
    ORIG_CHAR.apply(this, arguments);
    if (!sitting || !p || p.walking) return;
    var s = this.toScreen(x, z, 0), tp = Math.floor(this.t * 6 + p.phase * 3) % 3;
    if (Math.sin(this.t * 0.4 + p.phase) < -0.3) return; // pauser ibland
    g.fillStyle = A2.tone(A2.css(A2.rgbOf(p.def.skin)), -0.05);
    g.fillRect(s.x - 4 + (tp === 0 ? 1 : 0), s.y - 9 - (tp === 1 ? 1 : 0), 2, 1);
    g.fillRect(s.x + 2 - (tp === 2 ? 1 : 0), s.y - 9 - (tp === 0 ? 1 : 0), 2, 1);
  };
})();
