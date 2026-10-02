// 2D-världen, version 8: grafik och små rörelser. Klickvågor, markering av det du kan använda, paraply i regnet,
// andedräkt på morgonen, blöta fotspår, ankungar, igelkott, snigel, cyklist, flygplansskugga, värmedaller och mer.
(function () {
  if (!NV.World2D) return;
  var W = NV.World2D.prototype, A2 = NV.art2d;
  function R(a, b) { return a + Math.random() * (b - a); }
  function dist(a, b, c, d) { return Math.hypot(a - c, b - d); }
  function hour(w) { return 8 + (w.game.state ? w.game.state.time : 0) / 3600; }
  function outdoors(w) { return /Utanför/.test(w.zone().name); }
  function rm() { return NV.settings.get('reduceMotion') === true; }

  // Klickvåg där du klickade
  var ORIG_CLICK = W.clickWalk;
  W.clickWalk = function (x, z, shift) {
    (this.clickFx = this.clickFx || []).push({ x: x, z: z, t: 0, bad: this.collides(x, z, 0.05) });
    return ORIG_CLICK.apply(this, arguments);
  };

  // ------------------------------------------------------------------ Uppdatering
  var ORIG_UPD = W.updateFx;
  W.updateFx = function (dt, rdt) {
    ORIG_UPD.apply(this, arguments);
    if (!this.builder) return;
    var self = this, me = this.pos, out = outdoors(this), h = hour(this), moving = !!this.frame, gbg = this.site === 'gbg';
    this.clickFx = (this.clickFx || []).filter(function (c) { c.t += rdt; return c.t < 0.6; });
    // Står du still en stund tittar figuren sig omkring
    if (!moving && !this.seated && this.idleT > 3 && this.idleT < 8 && !this.target) {
      this.lookT = (this.lookT || 0) - dt;
      if (this.lookT <= 0) { this.lookT = R(1, 2); this.dir = [2, 3, 0][Math.floor(Math.random() * 3)]; }
    }
    // Andedräkt i den kalla morgonluften
    if (out && h < 9.2 && Math.random() < dt * 0.6) this.part({ x: me.x + (this.dir === 2 ? -0.15 : (this.dir === 3 ? 0.15 : 0)), z: me.z, y: 1.45, vx: (this.dir === 2 ? -0.2 : (this.dir === 3 ? 0.2 : 0)), vy: 0.15, life: 1.1, size: 2, grow: 2, col: 'rgba(240,245,255,0.45)' });
    // Blöta fotspår inomhus när du kommer in från regnet
    if (out && (this.wet || 0) > 0.3 && this.weather === 'rain') this.wetSteps = 24;
    this.wetPrints = (this.wetPrints || []).filter(function (p) { p.age += dt; return p.age < 12; });
    if (!out && moving && this.wetSteps > 0 && (!this.lastWet || dist(me.x, me.z, this.lastWet.x, this.lastWet.z) > 0.45)) {
      this.lastWet = { x: me.x, z: me.z }; this.wetSteps--;
      this.wetPrints.push({ x: me.x + (this.wetSteps % 2 ? 0.08 : -0.08), z: me.z, age: 0, site: this.site });
    }
    // Spurt: dammstrimmor bakom figuren. Kaffe: små gula gnistor.
    var k = this.keys || {}, running = moving && (k.ShiftLeft || k.ShiftRight || this.game.touchRun || (this.target && this.runPath));
    if (running && Math.random() < dt * 14) this.part({ x: me.x + R(-0.1, 0.1), z: me.z + 0.05, y: R(0.2, 0.9), vx: -Math.cos(this.yaw || 0) * 0, life: 0.25, size: 1, col: 'rgba(255,255,255,0.5)', force: true });
    if (moving && this.game.boosted && this.game.boosted() && Math.random() < dt * 10) this.part({ x: me.x + R(-0.15, 0.15), z: me.z, y: R(0.3, 1.4), vy: 0.3, life: 0.5, size: 1, col: '#ffd54a', glow: true });
    // Höstlöven i Borås virvlar undan när du går igenom dem
    if (this.site === 'boras' && moving && this.groundLeaves) this.groundLeaves.forEach(function (l) {
      var d = dist(me.x, me.z, l.x, l.z);
      if (d < 0.45 && d > 0.001) { var push = (0.45 - d) * 1.6; l.x += (l.x - me.x) / d * push; l.z += (l.z - me.z) / d * push * 0.6; if (Math.random() < 0.2) self.part({ x: l.x, z: l.z, y: 0.1, vx: R(-0.4, 0.4), vy: R(0.4, 0.9), g: 3, life: 0.6, size: 1, col: l.c }); }
    });
    // Katten följer efter en stund efter att du klappat den
    if (this.cat && this.catFollow > 0) {
      this.catFollow -= dt;
      var c = this.cat;
      if (dist(c.x, c.z, me.x, me.z) > 1.2) { c.tx = me.x + 0.6; c.tz = me.z - 0.3; c.wait = 0; c.sit = false; }
    }
    // Ankungar som simmar efter mamma anka
    this.ducklings = this.ducklings || [{ lag: 0.35 }, { lag: 0.6 }, { lag: 0.85 }];
    // Igelkotten kommer fram på kvällen
    var hg = this.hedgehog = this.hedgehog || { x: -18.5, z: 9, tx: -18.5, tz: 9, t: 0 };
    if (gbg && (this.eve || 0) > 0.4 && NV.settings.get('animals2d') !== false) {
      hg.on = true; hg.t -= dt;
      var hdx = hg.tx - hg.x, hdz = hg.tz - hg.z, hd = Math.hypot(hdx, hdz);
      if (hd < 0.05 || hg.t <= 0) { hg.t = R(3, 7); hg.tx = R(-20, -16); hg.tz = R(4, 12); hg.wait = R(1, 3); }
      else if ((hg.wait -= dt) <= 0) { hg.x += hdx / hd * dt * 0.35; hg.z += hdz / hd * dt * 0.35; hg.dir = hdx < 0 ? -1 : 1; }
      if (this.hhInter) { this.hhInter.x = hg.x; this.hhInter.z = hg.z; }
    } else { hg.on = false; if (this.hhInter) this.hhInter.z = -100; }
    // Snigeln kryper över gången efter regn
    var sn = this.snail = this.snail || { x: 8.6, z: -12.6, on: false };
    sn.on = gbg && ((this.wet || 0) > 0.4 || this.weather === 'rain') && !sn.saved;
    if (sn.on) { sn.x += dt * 0.03; if (sn.x > 12.6) sn.x = 8.6; }
    if (this.snailInter) { this.snailInter.x = sn.x; this.snailInter.z = sn.on ? sn.z : -100; }
    // En cyklist som passerar på gatan nedanför kontoret
    var cy = this.cyclist;
    if (!cy && gbg && Math.random() < dt * 0.02) cy = this.cyclist = { x: -24, dir: 1, ph: 0, bell: false };
    if (cy) {
      cy.x += cy.dir * dt * 4.2; cy.ph += dt * 10;
      if (!cy.bell && Math.abs(cy.x - me.x) < 4 && me.z < -14) { cy.bell = true; NV.sfx.bell && NV.sfx.bell(); this.pops.push({ text: 'Pling!', col: '#ffffff', x: cy.x, z: -17.2, y: 1.6, age: 0, life: 1.2 }); }
      if (cy.x > 24 || !gbg) this.cyclist = null;
    }
    // Ett flygplan högt upp kastar en skugga över marken ibland
    var pl = this.plane;
    if (!pl && Math.random() < dt * 0.006) pl = this.plane = { x: (this.site === 'boras' ? 78 : -26), z: R(-14, 10), vx: 7, vz: R(-0.8, 0.8) };
    if (pl) { pl.x += pl.vx * dt; pl.z += pl.vz * dt; if (pl.x > (this.site === 'boras' ? 124 : 26)) this.plane = null; }
    // Grodan kväker då och då
    this.croakT = (this.croakT === undefined ? R(10, 25) : this.croakT) - dt;
    if (this.croakT <= 0 && gbg && this.lilies && this.frog) { this.croakT = R(15, 35); var lp = this.lilies[this.frog.lily]; if (lp && dist(me.x, me.z, lp.x, lp.z) < 7) { this.pops.push({ text: 'Kväck', col: '#b6f28a', x: lp.x, z: lp.z, y: 0.4, age: 0, life: 1.2 }); if (NV.sfx.croak) NV.sfx.croak(); } }
    // Fåglar kvittrar på morgonen
    this.chirpT = (this.chirpT === undefined ? 3 : this.chirpT) - dt;
    if (this.chirpT <= 0) { this.chirpT = R(4, 10); if (out && h < 11 && this.weather !== 'rain' && NV.sfx.chirp) NV.sfx.chirp(); }
    // Vindbyar hörs
    if ((this.gust || 0) > 0.95 && !this.gustHeard) { this.gustHeard = true; if (out && NV.sfx.wind) NV.sfx.wind(); }
    if ((this.gust || 0) < 0.5) this.gustHeard = false;
    // Flugor surrar runt skräp som legat länge
    (this.trash || []).forEach(function (t) { t.age = (t.age || 0) + dt; });
  };

  var ORIG_COLLECT = W.collectInteractables;
  W.collectInteractables = function () {
    ORIG_COLLECT.apply(this, arguments);
    this.hhInter = { x: 0, z: -100, inter: { type: 'hedgehog' }, r: 0.6 };
    this.snailInter = { x: 0, z: -100, inter: { type: 'snail' }, r: 0.5 };
    this.inters.push(this.hhInter, this.snailInter);
  };
  W.petCatFollow = function () { this.catFollow = 15; };

  // ------------------------------------------------------------------ Ritning: marken
  var ORIG_GFX = W.drawGroundFx;
  W.drawGroundFx = function (g) {
    ORIG_GFX.apply(this, arguments);
    var self = this, t = this.t || 0, gbg = this.site === 'gbg';
    function at(x, z, y) { var s = self.toScreen(x, z, y || 0); return { x: Math.round(s.x), y: Math.round(s.y) }; }
    // Klickvågor
    (this.clickFx || []).forEach(function (c) {
      var s = at(c.x, c.z), r = 2 + c.t * 22, a = 1 - c.t / 0.6;
      g.strokeStyle = (c.bad ? 'rgba(255,140,120,' : 'rgba(255,245,200,') + (a * 0.8).toFixed(2) + ')'; g.lineWidth = 1;
      g.beginPath(); g.ellipse(s.x + 0.5, s.y + 0.5, r, r * 0.45, 0, 0, Math.PI * 2); g.stroke();
    });
    // Markering under det du kan använda
    var hs = this.hoverSpot;
    if (hs && hs.z > -50 && NV.settings.get('hoverRing') !== false) {
      var s1 = at(hs.x, hs.z), rr = 7 + Math.sin(t * 5) * 1.5;
      g.strokeStyle = 'rgba(255,224,120,0.55)'; g.lineWidth = 1; g.beginPath(); g.ellipse(s1.x + 0.5, s1.y + 0.5, rr, rr * 0.45, 0, 0, Math.PI * 2); g.stroke();
    }
    // Blöta fotspår
    (this.wetPrints || []).forEach(function (p) {
      if (p.site !== self.site) return;
      var s2 = at(p.x, p.z), a2 = (1 - p.age / 12) * 0.35;
      g.fillStyle = (p.dusty ? 'rgba(95,88,74,' : 'rgba(40,60,90,') + a2.toFixed(2) + ')'; g.fillRect(s2.x - 1, s2.y - 1, 2, 3);
    });
    // Skuggor från fåglarna och flygplanet
    (this.birds || []).forEach(function (b) { var s3 = at(b.x + b.y * 0.4, b.z); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(s3.x - 2, s3.y, 4, 1); });
    if (this.plane) {
      var p0 = at(this.plane.x, this.plane.z);
      g.fillStyle = 'rgba(0,0,0,0.10)';
      g.fillRect(p0.x - 14, p0.y - 1, 28, 3); g.fillRect(p0.x - 3, p0.y - 10, 6, 21); g.fillRect(p0.x - 14, p0.y - 4, 4, 9);
    }
    // Ankungar bakom första ankan
    if (gbg && this.ducks && this.ducks[0] && NV.settings.get('animals2d') !== false) {
      var d0 = this.ducks[0];
      (this.ducklings || []).forEach(function (k, i) {
        var a = d0.a - k.lag, x = -18.3 + Math.cos(a) * d0.rx, z = -1.5 + Math.sin(a) * d0.rz;
        if (d0.fk) { x = x + (-16.9 - x) * d0.fk * 0.8; z = z + (-1.5 + i * 0.25 - z) * d0.fk * 0.6; }
        var s4 = at(x, z), bob = Math.round(Math.sin(t * 3 + i) * 0.5);
        g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(s4.x - 3, s4.y + 1, 5, 1);
        g.fillStyle = '#e8c547'; g.fillRect(s4.x - 2, s4.y - 2 + bob, 4, 2); g.fillRect(s4.x + 1, s4.y - 4 + bob, 2, 2);
        g.fillStyle = '#ff9b2f'; g.fillRect(s4.x + 3, s4.y - 3 + bob, 1, 1);
      });
    }
    // Igelkotten
    var hg = this.hedgehog;
    if (hg && hg.on) {
      var s5 = at(hg.x, hg.z), f = hg.dir || 1;
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(s5.x - 4, s5.y, 8, 2);
      g.fillStyle = '#5a4634'; g.fillRect(s5.x - 4, s5.y - 4, 7, 4); g.fillStyle = '#7d6550'; for (var q = 0; q < 4; q++) g.fillRect(s5.x - 4 + q * 2, s5.y - 5, 1, 2);
      g.fillStyle = '#c9a27a'; g.fillRect(s5.x + (f > 0 ? 3 : -5), s5.y - 3, 2, 2); g.fillStyle = '#111'; g.fillRect(s5.x + (f > 0 ? 4 : -5), s5.y - 3, 1, 1);
    }
    // Snigeln
    var sn = this.snail;
    if (sn && sn.on) {
      var s6 = at(sn.x, sn.z);
      g.fillStyle = 'rgba(200,220,255,0.25)'; g.fillRect(s6.x - 6, s6.y, 5, 1);
      g.fillStyle = '#c9b28a'; g.fillRect(s6.x - 1, s6.y - 1, 4, 1); g.fillStyle = '#8a5a2b'; g.fillRect(s6.x - 1, s6.y - 4, 3, 3); g.fillStyle = '#c08a4a'; g.fillRect(s6.x, s6.y - 3, 1, 1);
      g.fillStyle = '#c9b28a'; g.fillRect(s6.x + 3, s6.y - 3, 1, 2);
    }
    // Cyklisten på gatan
    var cy = this.cyclist;
    if (cy && gbg) {
      var s7 = at(cy.x, -17.3), w = Math.round(Math.sin(cy.ph) * 1);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(s7.x - 7, s7.y, 14, 2);
      g.strokeStyle = '#222'; g.lineWidth = 1; g.beginPath(); g.arc(s7.x - 5, s7.y - 3, 3, 0, Math.PI * 2); g.arc(s7.x + 5, s7.y - 3, 3, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#c8412f'; g.fillRect(s7.x - 4, s7.y - 5, 8, 1); g.fillStyle = '#2f6fb0'; g.fillRect(s7.x - 2, s7.y - 13, 4, 6);
      g.fillStyle = '#f1c7a5'; g.fillRect(s7.x - 1, s7.y - 16, 3, 3); g.fillStyle = '#e0e0e0'; g.fillRect(s7.x - 2, s7.y - 17, 4, 1);
      g.fillStyle = '#33405a'; g.fillRect(s7.x - 1 + w, s7.y - 7, 1, 3); g.fillRect(s7.x + 1 - w, s7.y - 7, 1, 3);
    }
    // Värmedaller över parkeringen mitt på dagen när solen skiner
    var h = hour(this);
    if (gbg && this.weather === 'sun' && h > 10.5 && h < 14.5 && !rm()) {
      for (var i = 0; i < 6; i++) {
        var px = at(12 + (i % 3) * 2.5, -14.5 - Math.floor(i / 3) * 1.6), off = Math.sin(t * 3 + i) * 2;
        g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(px.x - 12 + off, px.y - 2, 24, 1); g.fillRect(px.x - 9 - off, px.y + 2, 18, 1);
      }
    }
  };

  // ------------------------------------------------------------------ Ritning: ovanpå
  var ORIG_FX = W.drawFx;
  W.drawFx = function (g, sc) {
    ORIG_FX.apply(this, arguments);
    var self = this, t = this.t || 0, me = this.pos, out = outdoors(this), gbg = this.site === 'gbg';
    function at(x, z, y) { var s = self.toScreen(x, z, y || 0); return { x: Math.round(s.x), y: Math.round(s.y) }; }
    // Paraply när du går ute i regnet
    if (out && this.weather === 'rain' && NV.settings.get('umbrella') !== false) {
      var u = at(me.x, me.z, 2.05), bob = this.frame ? Math.round(Math.sin(t * 10)) : 0;
      g.fillStyle = '#5b4632'; g.fillRect(u.x, u.y + bob, 1, 7);
      g.fillStyle = '#c8412f'; g.fillRect(u.x - 7, u.y - 2 + bob, 15, 2); g.fillRect(u.x - 5, u.y - 4 + bob, 11, 2); g.fillRect(u.x - 2, u.y - 5 + bob, 5, 1);
      g.fillStyle = '#e8665a'; g.fillRect(u.x - 5, u.y - 4 + bob, 4, 1);
      g.fillStyle = '#8f2b22'; g.fillRect(u.x - 7, u.y + bob, 15, 1);
      if (Math.random() < 0.3) { g.fillStyle = 'rgba(200,225,255,0.8)'; g.fillRect(u.x - 7 + Math.floor(Math.random() * 15), u.y + 1 + bob, 1, 2); }
    }
    // Tangenten E och en liten pil ovanför det du kan använda (skarpt, i full upplösning)
    var hs = this.hoverSpot;
    if (hs && hs.z > -50 && NV.settings.get('hoverRing') !== false && this.hi && this.hiQueue) {
      var hp = this.hi(this.toScreen(hs.x, hs.z, 1.7)), S = this.view.S, sz = Math.max(18, Math.round(6 * S)), bb = Math.sin(t * 5) * S * 0.8;
      this.hiQueue.push(function (m) {
        var x = hp.x - sz / 2, y = hp.y - sz * 2.4 + bb;
        m.save();
        m.fillStyle = 'rgba(0,0,0,0.35)'; m.fillRect(x + 2, y + 3, sz, sz);
        m.fillStyle = '#f4f1e8'; m.fillRect(x, y, sz, sz); m.fillStyle = '#c9c4b5'; m.fillRect(x, y + sz - 3, sz, 3);
        m.strokeStyle = '#20232a'; m.lineWidth = 2; m.strokeRect(x, y, sz, sz);
        m.fillStyle = '#20232a'; m.font = 'bold ' + Math.round(sz * 0.62) + 'px "Press Start 2P", monospace'; m.textAlign = 'center'; m.textBaseline = 'middle'; m.fillText('E', hp.x + 1, y + sz * 0.48);
        m.fillStyle = '#ffd54a'; m.beginPath(); m.moveTo(hp.x - sz * 0.25, y + sz + 4); m.lineTo(hp.x + sz * 0.25, y + sz + 4); m.lineTo(hp.x, y + sz + 4 + sz * 0.3); m.closePath(); m.fill();
        m.restore();
      });
    }
    // Smyger du syns tre små prickar ovanför huvudet
    if (this.sneak) { var sn = at(me.x, me.z, 1.95); g.fillStyle = 'rgba(255,255,255,0.7)'; for (var i = 0; i < 3; i++) if (Math.floor(t * 3) % 3 >= i) g.fillRect(sn.x - 3 + i * 3, sn.y, 1, 1); }
    // Fiskespö i handen
    if (this.fishing && gbg) { var rp = at(me.x - 0.1, me.z, 1.0); g.strokeStyle = '#7a5226'; g.lineWidth = 1; g.beginPath(); g.moveTo(rp.x, rp.y); g.lineTo(rp.x - 6, rp.y - 13); g.stroke(); }
    // Fångad fisk visas ovanför figuren en stund
    var cf = this.caughtFx;
    if (cf && (cf.t -= this.frameDt || 0.016) > 0) {
      var fp = at(me.x, me.z, 2.2 + (1.5 - cf.t) * 0.2), wig = Math.round(Math.sin(t * 20));
      g.fillStyle = cf.col; g.fillRect(fp.x - 5, fp.y - 2 + wig, 9, 4); g.fillRect(fp.x + 4, fp.y - 3 - wig, 2, 6);
      g.fillStyle = '#ffffff'; g.fillRect(fp.x - 4, fp.y - 1 + wig, 1, 1); g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(fp.x - 3, fp.y + 1 + wig, 6, 1);
    } else this.caughtFx = null;
    // Vattenkanna i handen när du vattnar
    var wc = this.canFx;
    if (wc && (wc.t -= this.frameDt || 0.016) > 0) {
      var cp = at(wc.x, wc.z, 1.2);
      g.fillStyle = '#3f8a57'; g.fillRect(cp.x - 4, cp.y - 3, 6, 5); g.fillRect(cp.x + 2, cp.y - 3, 4, 1); g.fillStyle = '#6dbf7b'; g.fillRect(cp.x - 4, cp.y - 3, 6, 1);
      g.fillStyle = '#6fc3ff'; if (Math.floor(t * 12) % 2) g.fillRect(cp.x + 6, cp.y - 2, 1, 2);
    } else this.canFx = null;
    // Flugor runt skräp som legat länge
    if (gbg) (this.trash || []).forEach(function (tr) {
      if ((tr.age || 0) < 60) return;
      for (var j = 0; j < 2; j++) { var fx = at(tr.x + Math.cos(t * 6 + j * 3) * 0.2, tr.z, 0.3 + Math.sin(t * 9 + j) * 0.1); g.fillStyle = '#111'; g.fillRect(fx.x, fx.y, 1, 1); }
    });
    // Törstiga växter: några bruna blad
    if (gbg) (this.plants || []).forEach(function (p) {
      if (p.thirst > 0) return;
      var lp = at(p.x, p.z, 0.75);
      g.fillStyle = '#9a7a3a'; g.fillRect(lp.x - 3, lp.y, 2, 1); g.fillRect(lp.x + 2, lp.y + 2, 2, 1); g.fillRect(lp.x - 1, lp.y - 3, 1, 1);
    });
    // Värmedaller över racken i serverrummet
    if (gbg && /Serverrummet/.test(this.zone().name) && !rm()) {
      for (var k2 = 0; k2 < 4; k2++) {
        var hp = at(-12.6 + k2 * 0.9, -9.2, 2.3 + ((t * 0.6 + k2 * 0.25) % 1) * 0.6), wv = Math.sin(t * 4 + k2) * 2;
        g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(hp.x - 4 + wv, hp.y, 8, 1);
      }
    }
  };

  // ------------------------------------------------------------------ Efterbehandling: rummens färgton och dörrens ljus
  var TINT = { Serverrummet: [60, 110, 200, 0.07], Fikarummet: [255, 170, 90, 0.05], Receptionen: [255, 210, 150, 0.04], 'Lagret i Borås': [200, 190, 160, 0.04] };
  var ORIG_POST = W.postLow;
  W.postLow = function (g) {
    ORIG_POST.apply(this, arguments);
    if (!this.view || NV.settings.get('roomTint') === false) return;
    var zn = this.zone().name, want = TINT[zn] || [0, 0, 0, 0], cur = this.tint || (this.tint = [0, 0, 0, 0]), k = Math.min(1, (this.frameDt || 0.016) * 2);
    for (var i = 0; i < 4; i++) cur[i] += (want[i] - cur[i]) * k;
    if (cur[3] > 0.005) { g.fillStyle = 'rgba(' + Math.round(cur[0]) + ',' + Math.round(cur[1]) + ',' + Math.round(cur[2]) + ',' + cur[3].toFixed(3) + ')'; g.fillRect(0, 0, this.view.vw, this.view.vh); }
    // Dagsljus genom de öppna glasdörrarna
    if (this.site === 'gbg' && (this.doorOpen || 0) > 0.2) {
      var p = this.toScreen(9.6, -9.9, 0), q = this.toScreen(11.4, -8.2, 0);
      var gr = g.createLinearGradient(0, p.y, 0, q.y);
      gr.addColorStop(0, 'rgba(255,245,215,' + (0.12 * this.doorOpen).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(255,245,215,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + (q.x - p.x), p.y); g.lineTo(q.x + 8, q.y); g.lineTo(p.x - 8, q.y); g.closePath(); g.fill();
    }
  };

  // ------------------------------------------------------------------ Spelets händelser
  NV.afterGame(function () {
    var g = NV.game;
    if (!g) return;
    var origInteract = g.onInteract;
    g.onInteract = function (i) {
      var w = this.world;
      if (i && i.type === 'hedgehog') { NV.career.stat('hedgehogs'); this.ui.toast('🦔 Igelkotten nosar på din sko och tassar vidare.'); w.pops.push({ text: '♥', col: '#ff9cc9', x: w.hedgehog.x, z: w.hedgehog.z, y: 0.5, age: 0, life: 1.4 }); return; }
      if (i && i.type === 'snail') { w.snail.saved = true; NV.career.stat('snails'); NV.sfx.pickup(); this.ui.toast('🐌 Du lyfte snigeln till gräset, där den inte blir trampad på.'); this.xp(2, 'Snigelräddning', true); return; }
      var wasFish = i && i.type === 'fish' && w.fishing && w.fishing.state === 'bite', fishBefore = NV.career.stats().fish || 0;
      var r = origInteract.apply(this, arguments);
      if (i && i.type === 'cat' && w.petCatFollow) w.petCatFollow();
      if (wasFish && (NV.career.stats().fish || 0) > fishBefore) w.caughtFx = { t: 1.5, col: ['#8fa86a', '#9fb2c0', '#c9a24a'][Math.floor(Math.random() * 3)] };
      if (i && i.type === 'plant') w.canFx = { t: 1, x: w.pos.x + 0.25, z: w.pos.z };
      if (i && i.type === 'coffee' && w.part) for (var k = 0; k < 8; k++) w.part({ x: -2.8, z: -9.25, y: 0.95 - k * 0.04, vy: -0.6, life: 0.4, size: 1, col: '#6b4423', force: true });
      if (i && i.type === 'travel' && NV.sfx.honk) setTimeout(function () { NV.sfx.honk(); }, 200);
      return r;
    };
    var origDescribe = g.describe;
    g.describe = function (i) {
      if (i.type === 'hedgehog') return 'Hälsa på igelkotten';
      if (i.type === 'snail') return 'Flytta snigeln till gräset';
      return origDescribe.apply(this, arguments);
    };
    // Guldgnistor när du får XP
    var origXp = g.xp;
    g.xp = function (n) {
      var r = origXp.apply(this, arguments);
      var w = this.world;
      if (n > 0 && this.mode === '2d' && w && w.part) for (var k = 0; k < Math.min(12, 2 + Math.floor(n / 5)); k++) w.part({ x: w.pos.x + R(-0.2, 0.2), z: w.pos.z, y: R(1, 1.6), vx: R(-0.6, 0.6), vy: R(1, 2), g: 3, life: 0.8, size: 1, col: '#ffd54a', glow: true, force: true });
      return r;
    };
  });
  NV.afterGame(function () {
    var A = NV.career && NV.career.ACH;
    if (!A) return;
    [
      ['hedgehog', 'Kvällsbesök', 'Hälsa på igelkotten som kommer fram på kvällen.', '🦔', function (s) { return s.hedgehogs >= 1; }],
      ['snail', 'Snigelräddare', 'Lyft snigeln från gången efter regnet.', '🐌', function (s) { return s.snails >= 1; }],
    ].forEach(function (a) { if (!A.some(function (x) { return x[0] === a[0]; })) A.push(a); });
  });
})();
