// 2D-världen, version 8: små händelser på kontoret. Städ-Sture fastnar, skrivaren får pappersstopp,
// kaffebönorna tar slut, pappersflygplan träffar kollegor, etiketter på avstånd och hur långt det är kvar.
(function () {
  if (!NV.World2D) return;
  var W = NV.World2D.prototype;
  function R(a, b) { return a + Math.random() * (b - a); }
  function dist(a, b, c, d) { return Math.hypot(a - c, b - d); }
  var BEANS = 6;   // koppar per påfyllning

  // Städ-Sture står still när den har fastnat
  if (NV.shared && NV.shared.vacStep) {
    var origVac = NV.shared.vacStep;
    NV.shared.vacStep = function (v) { if (v && v.stuck) return; return origVac.apply(this, arguments); };
  }

  var ORIG_UPD = W.updateFx;
  W.updateFx = function (dt, rdt) {
    ORIG_UPD.apply(this, arguments);
    if (!this.builder) return;
    var self = this, g = this.game, v = g.vac;
    // Städ-Sture fastnar ibland under en stol
    if (v && !v.stuck && this.site === 'gbg' && Math.random() < dt / 150) { v.stuck = true; v.beepT = 0; }
    if (v && v.stuck) { v.beepT -= dt; if (v.beepT <= 0) { v.beepT = R(5, 9); this.pops.push({ text: 'Pip pip!', col: '#ff8a7a', x: v.x, z: v.z, y: 0.5, age: 0, life: 1.2 }); } }
    // Pappersstopp i skrivaren
    if (!this.printerJam && this.site === 'gbg' && Math.random() < dt / 240) this.printerJam = true;
    // Pappersflygplan som träffar en kollega
    (this.planes || []).forEach(function (p) {
      // Ett plan som just landat mot en kollega räknas också som en träff
      if (p.hit || (p.landed && p.life < 7.9)) return;
      Object.keys(self.people || {}).some(function (n) {
        var q = self.people[n];
        if (!self.npcVisible(n) || dist(p.x, p.z, q.x, q.z) > 0.55 || p.y > 2) return false;
        p.hit = true; if (!p.landed) { p.vx *= -0.3; p.vz *= -0.3; }
        self.pops.push({ text: ['Hallå!', 'Hörru!', 'Vem var det?', 'Haha!'][Math.floor(Math.random() * 4)], col: '#ffffff', x: q.x, z: q.z, y: 2.2, age: 0, life: 1.6 });
        NV.career.stat('planeHits');
        return true;
      });
    });
  };

  // ------------------------------------------------------------------ Ritning
  var ORIG_FX = W.drawFx;
  W.drawFx = function (g, sc) {
    ORIG_FX.apply(this, arguments);
    var self = this, t = this.t || 0, game = this.game;
    function at(x, z, y) { var s = self.toScreen(x, z, y || 0); return { x: Math.round(s.x), y: Math.round(s.y) }; }
    if (this.site === 'gbg') {
      // Röd blinkande lampa på Städ-Sture när den har fastnat
      var v = game.vac;
      if (v && v.stuck && Math.sin(t * 8) > 0) { var s = at(v.x, v.z, 0.25); g.fillStyle = '#ff3b30'; g.fillRect(s.x - 1, s.y - 1, 2, 2); g.fillStyle = 'rgba(255,59,48,0.3)'; g.fillRect(s.x - 2, s.y - 2, 4, 4); }
      // Röd lampa och ett papper som sticker ut när skrivaren har stopp
      var pa = this.builder.anchors.printer;
      if (this.printerJam && pa) {
        var p = at(pa.x + 0.2, pa.z - 0.25, 1.15), pp = at(pa.x - 0.05, pa.z - 0.25, 1.2);
        if (Math.sin(t * 6) > 0) { g.fillStyle = '#ff3b30'; g.fillRect(p.x, p.y, 1, 1); g.fillStyle = 'rgba(255,59,48,0.35)'; g.fillRect(p.x - 1, p.y - 1, 3, 3); }
        g.fillStyle = '#f4f4f0'; g.fillRect(pp.x - 2, pp.y - 3, 4, 3); g.fillStyle = '#c9c4b5'; g.fillRect(pp.x - 2, pp.y - 1, 4, 1);
      }
      // Kaffemaskinen blinkar orange när bönorna är slut
      if ((this.beans || 0) >= BEANS && Math.sin(t * 5) > 0) { var c = at(-2.55, -9.3, 1.05); g.fillStyle = '#ff9f1a'; g.fillRect(c.x, c.y, 1, 1); }
    }
    // Etikett när muspekaren är över något som är för långt bort att använda härifrån
    if (this.mouse && !(game.ui && game.ui.captures()) && NV.settings.get('farLabels') !== false && this.hiQueue) {
      var wp = this.screenToWorld(this.mouse.x, this.mouse.y), hit = this.pickAt(wp.x, wp.z);
      if (hit && dist(hit.x, hit.z, this.pos.x, this.pos.z) >= hit.r + 1.6) {
        var txt = '';
        try { txt = game.describe(hit.inter); } catch (e) { txt = ''; }
        if (txt) {
          var hp = this.hi(this.toScreen(hit.x, hit.z, 1.1)), S = this.view.S, fs = Math.max(12, Math.round(3.4 * S));
          this.hiQueue.push(function (m) {
            m.save(); m.font = fs + 'px "Segoe UI", system-ui, sans-serif'; m.textAlign = 'center'; m.textBaseline = 'middle';
            var label = 'Klicka: ' + txt, w = m.measureText(label).width + 14;
            m.fillStyle = 'rgba(16,20,32,0.82)'; m.fillRect(hp.x - w / 2, hp.y - fs, w, fs * 1.7);
            m.fillStyle = '#fff6d8'; m.fillText(label, hp.x, hp.y - fs * 0.15);
            m.restore();
          });
        }
      }
    }
    // Hur långt det är kvar till målet
    var tg = this.target;
    if (tg && this.path && NV.settings.get('pathDots') !== false && this.hiQueue) {
      var pts = [{ x: this.pos.x, z: this.pos.z }].concat(this.path), L = 0;
      for (var i = 0; i < pts.length - 1; i++) L += dist(pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z);
      if (L > 4) {
        var hp2 = this.hi(this.toScreen(tg.x, tg.z, 0.2)), S2 = this.view.S, fs2 = Math.max(10, Math.round(2.6 * S2)), lab = Math.round(L) + ' m';
        this.hiQueue.push(function (m) {
          m.save(); m.font = 'bold ' + fs2 + 'px "Segoe UI", system-ui, sans-serif'; m.textAlign = 'center';
          m.fillStyle = 'rgba(0,0,0,0.55)'; m.fillText(lab, hp2.x + 1, hp2.y + fs2 * 1.6 + 1);
          m.fillStyle = tg.partial ? '#ffb4a8' : '#fff0b4'; m.fillText(lab, hp2.x, hp2.y + fs2 * 1.6);
          m.restore();
        });
      }
    }
  };

  // ------------------------------------------------------------------ Spelet
  NV.afterGame(function () {
    var g = NV.game;
    if (!g) return;
    var origDescribe = g.describe;
    g.describe = function (i) {
      var w = this.world;
      if (i.type === 'vacuum' && this.vac && this.vac.stuck) return 'Hjälp Städ-Sture loss';
      if (i.type === 'printer' && w.printerJam) return 'Ta bort papperet som fastnat';
      if (i.type === 'coffee' && (w.beans || 0) >= BEANS) return 'Fyll på kaffebönor';
      return origDescribe.apply(this, arguments);
    };
    var origInteract = g.onInteract;
    g.onInteract = function (i) {
      var w = this.world;
      if (i && i.type === 'vacuum' && this.vac && this.vac.stuck) {
        this.vac.stuck = false; NV.sfx.success(); NV.career.stat('vacRescues');
        w.pops.push({ text: 'Tack!', col: '#6dff9a', x: this.vac.x, z: this.vac.z, y: 0.6, age: 0, life: 1.4 });
        this.ui.toast('🤖 Du lyfte Städ-Sture ur kabelhärvan under stolen. Den piper glatt och städar vidare.');
        this.xp(4, 'Räddade dammsugaren', true);
        return;
      }
      if (i && i.type === 'printer' && w.printerJam) {
        w.printerJam = false; NV.sfx.printer && NV.sfx.printer(); NV.career.stat('paperJams');
        this.ui.toast('🖨️ Du öppnade luckan och drog ut ett skrynkligt papper. Skrivaren fungerar igen.');
        this.xp(3, 'Pappersstopp', true);
        return;
      }
      if (i && i.type === 'coffee') {
        if ((w.beans || 0) >= BEANS) {
          w.beans = 0; NV.sfx.water && NV.sfx.water(); NV.career.stat('beanRefills');
          for (var k = 0; k < 10; k++) w.part({ x: -2.8, z: -9.3, y: 1.2, vx: R(-0.3, 0.3), vy: R(0.2, 0.8), g: 5, life: 0.6, size: 1, col: '#4a2c17', force: true });
          this.ui.toast('☕ Du fyllde på kaffebönor. Nu går det att ta kaffe igen.');
          return;
        }
        var before = { boost: this.boostUntil, req: w.coffeeReq && w.coffeeReq.cup };
        var r = origInteract.apply(this, arguments);
        if (this.boostUntil !== before.boost || (w.coffeeReq && w.coffeeReq.cup && !before.req)) {
          w.beans = (w.beans || 0) + 1;
          if (w.beans >= BEANS) this.ui.toast('☕ Kaffemaskinen piper: bönorna är slut. Fyll på nästa gång.');
        }
        return r;
      }
      return origInteract.apply(this, arguments);
    };
    var A = NV.career.ACH;
    [
      ['vac', 'Robotkompis', 'Hjälp Städ-Sture loss när den har fastnat.', '🤖', function (s) { return s.vacRescues >= 1; }],
      ['jam', 'Pappersstopp', 'Ta bort ett papper som fastnat i skrivaren.', '🖨️', function (s) { return s.paperJams >= 1; }],
      ['beans', 'Påfyllning', 'Fyll på kaffebönor i kaffemaskinen.', '🫘', function (s) { return s.beanRefills >= 1; }],
      ['planehit', 'Busfrö', 'Träffa en kollega med ett pappersflygplan.', '😜', function (s) { return s.planeHits >= 1; }],
    ].forEach(function (a) { if (!A.some(function (x) { return x[0] === a[0]; })) A.push(a); });
  });
})();
