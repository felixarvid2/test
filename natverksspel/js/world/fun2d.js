// 2D-världen, version 8: kollegor som vill ha kaffe, vänskap med kollegorna, en fotboll på gården,
// pappersflygplan, V som visar allt du kan använda och smartare gång mot kollegor som rör sig.
(function () {
  if (!NV.World2D) return;
  var W = NV.World2D.prototype;
  function R(a, b) { return a + Math.random() * (b - a); }
  function dist(a, b, c, d) { return Math.hypot(a - c, b - d); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function load() { return NV.v8.load(); }
  function save(d) { NV.v8.save(d); }

  // ------------------------------------------------------------------ Vänskap
  // 0–20 poäng per kollega, fyra poäng per hjärta
  NV.v8.friend = function (name, pts, why) {
    var d = load(); d.friend = d.friend || {};
    var before = Math.floor((d.friend[name] || 0) / 4);
    d.friend[name] = Math.min(20, (d.friend[name] || 0) + pts);
    var after = Math.floor(d.friend[name] / 4);
    save(d);
    var g = NV.game, w = g && g.world;
    if (after > before) {
      NV.career.max('bestFriend', after);
      if (g) g.ui.toast('❤️ <b>' + esc(name) + '</b> gillar dig lite mer (' + '♥'.repeat(after) + '♡'.repeat(5 - after) + ')' + (why ? ' · ' + esc(why) : ''), 'good');
      if (w && w.people && w.people[name] && w.pops) w.pops.push({ text: '♥', col: '#ff6b9a', x: w.people[name].x, z: w.people[name].z, y: 2.3, age: 0, life: 1.8 });
    }
    return after;
  };
  NV.v8.hearts = function (name) { var d = load(); return Math.floor(((d.friend || {})[name] || 0) / 4); };

  // ------------------------------------------------------------------ Uppdatering
  var ORIG_UPD = W.updateFx;
  W.updateFx = function (dt, rdt) {
    ORIG_UPD.apply(this, arguments);
    if (!this.builder) return;
    var self = this, me = this.pos, g = this.game;
    // Kaffebeställningar
    this.reqT = (this.reqT === undefined ? R(60, 120) : this.reqT) - dt;
    if (this.coffeeReq) { this.coffeeReq.t -= dt; if (this.coffeeReq.t <= 0 && !this.coffeeReq.cup) { this.coffeeReq = null; } }
    if (this.reqT <= 0 && !this.coffeeReq && this.site === 'gbg') {
      this.reqT = R(180, 300);
      var who = Object.keys(this.people || {}).filter(function (n) { var p = self.people[n]; return p.def.desk && p.sit && self.npcVisible(n) && !(self.npcWalk && self.npcWalk.n === n); });
      if (who.length) { var n = who[Math.floor(Math.random() * who.length)]; this.coffeeReq = { n: n, t: 240, cup: false }; this.pops.push({ text: 'Någon som går förbi kaffet?', col: '#ffe1a8', x: this.people[n].x, z: this.people[n].z, y: 2.3, age: 0, life: 2.5 }); }
    }
    // Fotbollen
    this.ballStep(dt);
    // Pappersflygplanen
    this.planes = (this.planes || []).filter(function (p) {
      if (p.landed) { p.life -= dt; return p.life > 0; }
      var nx = p.x + p.vx * dt, nz = p.z + p.vz * dt;
      p.y -= dt * 0.42; p.t += dt;
      p.y += Math.sin(p.t * 4) * dt * 0.15;
      if (p.y <= 0.05 || self.collides(nx, nz, 0.05)) {
        p.landed = true; p.life = 8; p.y = Math.max(0.03, p.y);
        var flew = dist(p.x0, p.z0, p.x, p.z);
        NV.career.max('planeDist', Math.round(flew));
        if (flew > 8) self.pops.push({ text: Math.round(flew) + ' m!', col: '#ffffff', x: p.x, z: p.z, y: 0.6, age: 0, life: 1.4 });
        return true;
      }
      p.x = nx; p.z = nz;
      return true;
    });
    // Följer du en kollega som rör sig söks vägen om
    var tg = this.target;
    if (tg && tg.then && tg.then.npc && this.walkTo) {
      this.npcReplanT = (this.npcReplanT || 0) - dt;
      var np = this.people[tg.then.npc];
      if (np && this.npcReplanT <= 0 && dist(np.x, np.z, tg.then.x, tg.then.z) > 0.01) {
        this.npcReplanT = 0.8;
        tg.then.x = np.x; tg.then.z = np.z;
        this.walkTo(np.x, np.z - 0.6, tg.then, true);
        this.pathReplans = 0;
      }
    }
  };

  // ------------------------------------------------------------------ Fotbollen på gräsmattan söder om kontoret
  var GOAL = { z: -16.5, x0: -9.4, x1: -7.6 };
  W.ballStep = function (dt) {
    var b = this.ball = this.ball || { x: -8.5, z: -15.2, vx: 0, vz: 0, rot: 0, home: { x: -8.5, z: -15.2 } };
    if (this.site !== 'gbg') return;
    var me = this.pos, d = dist(me.x, me.z, b.x, b.z);
    // Går du in i bollen sparkar du den
    if (d < 0.38 && this.frame) {
      var k = this.keys || {}, hard = k.ShiftLeft || k.ShiftRight || this.runPath;
      var dx = b.x - me.x, dz = b.z - me.z, L = Math.hypot(dx, dz) || 1, sp = hard ? 7 : 4;
      b.vx = dx / L * sp + R(-0.3, 0.3); b.vz = dz / L * sp + R(-0.3, 0.3);
      if (!b.kicked || performance.now() - b.kicked > 300) { NV.sfx.thud(); NV.career.stat('kicks'); this.dust(b.x, b.z); }
      b.kicked = performance.now();
    }
    var spd = Math.hypot(b.vx, b.vz);
    if (spd < 0.02) { b.vx = b.vz = 0; return; }
    var fr = Math.max(0, 1 - dt * 0.8);
    b.vx *= fr; b.vz *= fr;
    var oz = b.z;
    var nx = b.x + b.vx * dt, nz = b.z + b.vz * dt;
    if (this.collides(nx, b.z, 0.12)) { b.vx *= -0.6; NV.sfx.tap && spd > 1.5 && NV.sfx.tap(); } else b.x = nx;
    if (this.collides(b.x, nz, 0.12)) { b.vz *= -0.6; } else b.z = nz;
    b.rot += spd * dt * 4;
    // Mål!
    if (oz >= GOAL.z && b.z < GOAL.z && b.x > GOAL.x0 && b.x < GOAL.x1) {
      NV.career.stat('goals');
      this.pops.push({ text: 'MÅL!', col: '#ffd54a', x: b.x, z: b.z, y: 1, age: 0, life: 2 });
      NV.sfx.success();
      if (this.confetti && NV.settings.get('reduceMotion') !== true) this.confetti(b.x, b.z, 40);
      var self = this;
      setTimeout(function () { b.x = b.home.x; b.z = b.home.z; b.vx = b.vz = 0; self.poof(b.x, b.z, 0.2, '#ffffff'); }, 1500);
    }
  };
  // Målburen ritas och får hinder i stolparna
  var ORIG_SCENE = W.addScenery;
  W.addScenery = function () {
    ORIG_SCENE.apply(this, arguments);
    var self = this;
    [GOAL.x0, GOAL.x1].forEach(function (x) { self.builder.colliders.push({ minX: x - 0.05, maxX: x + 0.05, minZ: GOAL.z - 0.05, maxZ: GOAL.z + 0.05 }); });
    // Nätet bakom målet fångar bollen
    this.builder.colliders.push({ minX: GOAL.x0, maxX: GOAL.x1, minZ: GOAL.z - 0.5, maxZ: GOAL.z - 0.42 });
  };

  // ------------------------------------------------------------------ Ritning
  var ORIG_GFX = W.drawGroundFx;
  W.drawGroundFx = function (g) {
    ORIG_GFX.apply(this, arguments);
    var self = this, t = this.t || 0;
    function at(x, z, y) { var s = self.toScreen(x, z, y || 0); return { x: Math.round(s.x), y: Math.round(s.y) }; }
    if (this.site === 'gbg') {
      // Målet sett framifrån: två stolpar, en ribba och ett nät
      var L = at(GOAL.x0, GOAL.z), Rt = at(GOAL.x1, GOAL.z), hgt = 13, back = at(GOAL.x0, GOAL.z - 0.45);
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(L.x + 2, L.y, Rt.x - L.x + 2, 2);
      g.fillStyle = 'rgba(255,255,255,0.3)';
      for (var x = L.x + 2; x < Rt.x; x += 3) g.fillRect(x, L.y - hgt + 2, 1, hgt - 2 + (back.y - L.y));
      for (var y = L.y - hgt + 2; y < L.y; y += 3) g.fillRect(L.x + 1, y, Rt.x - L.x - 1, 1);
      g.fillStyle = '#f4f4f4'; g.fillRect(L.x, L.y - hgt, 2, hgt + 1); g.fillRect(Rt.x, Rt.y - hgt, 2, hgt + 1); g.fillRect(L.x, L.y - hgt, Rt.x - L.x + 2, 2);
      g.fillStyle = '#c9ced6'; g.fillRect(L.x + 1, L.y - hgt + 2, 1, hgt - 1); g.fillRect(Rt.x + 1, Rt.y - hgt + 2, 1, hgt - 1);
      // Bollen
      var bl = this.ball;
      if (bl) {
        var s = at(bl.x, bl.z), r = Math.floor(bl.rot) % 2;
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(s.x - 2, s.y, 5, 1);
        g.fillStyle = '#ffffff'; g.fillRect(s.x - 2, s.y - 4, 5, 4); g.fillRect(s.x - 1, s.y - 5, 3, 6);
        g.fillStyle = '#222'; g.fillRect(s.x - 1 + r, s.y - 3, 1, 1); g.fillRect(s.x + 1 - r, s.y - 2, 1, 1); g.fillRect(s.x, s.y - 4 + r, 1, 1);
      }
    }
    // Landade pappersflygplan
    (this.planes || []).forEach(function (p) {
      if (!p.landed || p.site !== self.site) return;
      var s2 = at(p.x, p.z, p.y);
      g.globalAlpha = Math.min(1, p.life / 2);
      g.fillStyle = '#ffffff'; g.fillRect(s2.x - 3, s2.y - 1, 6, 1); g.fillRect(s2.x - 1, s2.y - 2, 3, 1); g.fillStyle = '#c9ced6'; g.fillRect(s2.x - 3, s2.y, 6, 1);
      g.globalAlpha = 1;
    });
    // V: ringar under allt du kan använda i närheten
    if (this.showAll) {
      var me = this.pos;
      (this.inters || []).forEach(function (c) {
        if (c.z < -50 || (c.x > 50) !== (self.site === 'boras') || dist(me.x, me.z, c.x, c.z) > 9) return;
        if (c.inter.type === 'npc' && self.people[c.npc] && !self.npcVisible(c.npc)) return;
        if (c.crab && !(self.game.crab && self.game.crab.active)) return;
        var s3 = at(c.x, c.z), rr = 5 + Math.sin(t * 4 + c.x) * 1;
        g.strokeStyle = 'rgba(120,220,255,0.7)'; g.lineWidth = 1; g.beginPath(); g.ellipse(s3.x + 0.5, s3.y + 0.5, rr, rr * 0.45, 0, 0, Math.PI * 2); g.stroke();
      });
    }
  };
  var ORIG_FX = W.drawFx;
  W.drawFx = function (g, sc) {
    ORIG_FX.apply(this, arguments);
    var self = this, t = this.t || 0;
    function at(x, z, y) { var s = self.toScreen(x, z, y || 0); return { x: Math.round(s.x), y: Math.round(s.y) }; }
    // Pappersflygplan i luften
    (this.planes || []).forEach(function (p) {
      if (p.landed || p.site !== self.site) return;
      var s = at(p.x, p.z, p.y), sh = at(p.x, p.z, 0), f = p.vx >= 0 ? 1 : -1;
      g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(sh.x - 3, sh.y, 6, 1);
      g.fillStyle = '#ffffff'; g.fillRect(s.x - 3, s.y, 7, 1); g.fillRect(s.x - 3 * f, s.y - 1, 3, 1); g.fillRect(s.x + 3 * f, s.y - 1, 1, 1);
      g.fillStyle = '#c9ced6'; g.fillRect(s.x - 2, s.y + 1, 4, 1);
    });
    // Kollegan som vill ha kaffe
    var rq = this.coffeeReq;
    if (rq && this.site === 'gbg' && this.people[rq.n]) {
      var p = this.people[rq.n], s2 = at(p.x, p.z, 2.25), bb = Math.round(Math.sin(t * 3) * 1);
      g.fillStyle = 'rgba(255,255,255,0.92)'; g.fillRect(s2.x - 5, s2.y - 9 + bb, 11, 9); g.fillRect(s2.x - 1, s2.y + bb, 3, 2);
      g.fillStyle = '#6b4423'; g.fillRect(s2.x - 3, s2.y - 6 + bb, 5, 4); g.fillRect(s2.x + 2, s2.y - 5 + bb, 2, 2);
      g.fillStyle = 'rgba(200,200,200,0.8)'; if (Math.floor(t * 4) % 2) g.fillRect(s2.x - 1, s2.y - 8 + bb, 1, 1); else g.fillRect(s2.x, s2.y - 8 + bb, 1, 1);
    }
    // Koppen du bär
    if (rq && rq.cup && this.site === 'gbg') { var c = at(this.pos.x + 0.2, this.pos.z, 1.0); g.fillStyle = '#ffffff'; g.fillRect(c.x - 1, c.y - 3, 3, 3); g.fillStyle = '#6b4423'; g.fillRect(c.x - 1, c.y - 3, 3, 1); }
  };

  // Pappersflygplan
  W.throwPlane = function () {
    if (this.seated) return;
    var fx = [0, 0, -1, 1][this.dir], fz = [-1, 1, 0, 0][this.dir];
    // Riktningen i världen: dir 0 = mot kameran (−z), 1 = bort (+z)
    this.planes = (this.planes || []).filter(function (p) { return !p.landed || p.life > 1; }).slice(-6);
    this.planes.push({ x: this.pos.x + fx * 0.3, z: this.pos.z + fz * 0.3, x0: this.pos.x, z0: this.pos.z, y: 1.45, vx: fx * 3.4, vz: fz * 3.4, t: 0, site: this.site });
    NV.sfx.whoosh();
    NV.career.stat('planes');
  };

  // ------------------------------------------------------------------ Spelet
  NV.afterGame(function () {
    var g = NV.game;
    if (!g) return;
    var origInteract = g.onInteract;
    g.onInteract = function (i) {
      var w = this.world, rq = w && w.coffeeReq;
      // Kaffe till kollegan
      if (i && i.type === 'coffee' && rq && !rq.cup) {
        rq.cup = true; NV.sfx.pour();
        this.ui.toast('☕ Du hällde upp en kopp till <b>' + esc(rq.n) + '</b>. Gå och lämna den!');
        return;
      }
      if (i && i.type === 'npc' && rq && rq.cup && i.id === rq.n) {
        w.coffeeReq = null;
        NV.career.stat('coffeeDeliveries');
        if (w.thank) w.thank(i.id);
        this.ui.toast('☕ <b>' + esc(i.id) + ':</b> ”Åh, tack! Precis vad jag behövde.”', 'good');
        this.xp(10, 'Kaffe till ' + i.id);
        NV.v8.friend(i.id, 4, 'kaffe');
        return;
      }
      if (i && i.type === 'npc' && w && w.lost && w.lost.carried && i.id === w.lost.owner) { var r0 = origInteract.apply(this, arguments); NV.v8.friend(i.id, 6, 'hittegods'); return r0; }
      if (i && i.type === 'npc') {
        // Att prata med någon ger lite vänskap, en gång per vecka och kollega
        var d = load(); d.talked = d.talked || {}; var key = i.id + ':' + (this.week || 0);
        if (!d.talked[key]) { d.talked[key] = 1; save(d); NV.v8.friend(i.id, 1); }
      }
      return origInteract.apply(this, arguments);
    };
    // Kollegor som svarar på emotes blir lite gladare (en gång per dag och kollega)
    var origEmote = W.emote;
    W.emote = function (code) {
      var r = origEmote.apply(this, arguments), self = this, day = new Date().toDateString(), d = load();
      d.emoteDay = d.emoteDay || {};
      Object.keys(this.people || {}).forEach(function (n) { var p = self.people[n]; if (self.npcVisible(n) && dist(self.pos.x, self.pos.z, p.x, p.z) < 3.2 && d.emoteDay[n] !== day) { d.emoteDay[n] = day; NV.v8.friend(n, 1); } });
      save(Object.assign(load(), { emoteDay: d.emoteDay }));
      return r;
    };
    document.addEventListener('keydown', function (e) {
      var w = g.world;
      if (g.mode !== '2d' || !w || !w.active || (g.ui && g.ui.captures())) return;
      if (e.code === 'KeyQ' && !e.repeat) { w.throwPlane(); e.preventDefault(); }
      if (e.code === 'KeyV') w.showAll = true;
    });
    document.addEventListener('keyup', function (e) { if (e.code === 'KeyV' && g.world) g.world.showAll = false; });
    var A = NV.career.ACH;
    [
      ['coffee1', 'Kaffebud', 'Hämta kaffe till en kollega som ber om det.', '☕', function (s) { return s.coffeeDeliveries >= 1; }],
      ['coffee5', 'Barista', 'Hämta kaffe till kollegor fem gånger.', '🫖', function (s) { return s.coffeeDeliveries >= 5; }],
      ['friend1', 'Vänskap', 'Få ett helt hjärta hos en kollega.', '💛', function (s) { return s.bestFriend >= 1; }],
      ['friend5', 'Bästa kollega', 'Få fem hjärtan hos en kollega.', '💖', function (s) { return s.bestFriend >= 5; }],
      ['kick10', 'Bollkänsla', 'Sparka bollen på gården tio gånger.', '⚽', function (s) { return s.kicks >= 10; }],
      ['goal', 'Mål!', 'Gör mål i målet på gården.', '🥅', function (s) { return s.goals >= 1; }],
      ['plane5', 'Pilot', 'Kasta fem pappersflygplan (Q).', '✈️', function (s) { return s.planes >= 5; }],
      ['plane8', 'Långflygare', 'Få ett pappersflygplan att flyga minst 8 meter.', '🛫', function (s) { return s.planeDist >= 8; }],
    ].forEach(function (a) { if (!A.some(function (x) { return x[0] === a[0]; })) A.push(a); });
  });
})();
