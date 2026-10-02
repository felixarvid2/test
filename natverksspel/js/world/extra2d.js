// 2D-världen, version 8: ljud och småsaker. Regn och rumsljud i 2D, dörrarna låter, gummiankorna piper när du är nära,
// en kortläsare vid serverrummet, klick på dig själv stannar och några nya prestationer.
(function () {
  if (!NV.World2D) return;
  var W = NV.World2D.prototype;
  function dist(a, b, c, d) { return Math.hypot(a - c, b - d); }
  function hour(w) { return 8 + (w.game.state ? w.game.state.time : 0) / 3600; }
  function outdoors(w) { return /Utanför/.test(w.zone().name); }

  var ORIG_UPD = W.updateFx;
  W.updateFx = function (dt, rdt) {
    ORIG_UPD.apply(this, arguments);
    if (!this.builder) return;
    var self = this, me = this.pos, g = this.game, out = outdoors(this), covered = g.ui && g.ui.captures();
    // Regnet och rummets ljud hörs även i 2D (svagare inomhus och bakom fönster)
    if (this.active) {
      NV.sfx.rain(this.weather === 'rain' && !covered ? (out ? 1 : 0.3) : (this.weather === 'rain' ? 0.15 : 0));
      if (NV.sfx.ambience) NV.sfx.ambience(this.site === 'boras' ? 'warehouse' : 'office', covered ? 0.2 : (out ? 0.15 : (this.zone().name === 'Serverrummet' ? 0.2 : 1)));
    }
    // Glasdörrarna låter när de glider upp
    var open = (this.doorOpen || 0) > 0.15;
    if (open && !this.doorWas && NV.sfx.whoosh) NV.sfx.whoosh();
    this.doorWas = open;
    // Kortläsaren vid serverrummet piper när du går in
    var zn = this.zone().name;
    if (zn !== this.lastZone) { if (zn === 'Serverrummet' && NV.sfx.pop) NV.sfx.pop(); this.lastZone = zn; }
    // Gummiankorna piper svagt när du kommer nära en som du inte har hittat
    this.duckHeard = this.duckHeard || {};
    (this.duckInters || []).forEach(function (it) {
      if (it.z < -50 || (it.x > 50) !== (self.site === 'boras') || self.duckHeard[it.inter.id]) return;
      if (dist(me.x, me.z, it.x, it.z) < 2.6) { self.duckHeard[it.inter.id] = true; if (NV.sfx.squeak) NV.sfx.squeak(); }
    });
    // Statistik till de nya prestationerna
    if (this.frame && out && this.weather === 'rain') this.rainAcc = (this.rainAcc || 0) + dt * 3.2;
    // Skickas en gång per sekund, eftersom varje stat() går igenom alla prestationer
    this.statT = (this.statT || 0) + dt;
    if (this.statT > 1) { this.statT = 0; if (this.rainAcc > 0) { NV.career.stat('rainMeters', this.rainAcc); this.rainAcc = 0; } }
    if (out && hour(this) < 8.5 && !this.morningSeen && this.weather !== 'rain') { this.morningSeen = true; NV.career.stat('morningWalks'); }
  };

  // Klickar du på dig själv stannar du
  var ORIG_CLICK = W.clickWalk;
  W.clickWalk = function (x, z, shift) {
    if (!shift && this.target && dist(x, z, this.pos.x, this.pos.z) < 0.35) { this.stopWalk(); return; }
    return ORIG_CLICK.apply(this, arguments);
  };

  // Kortläsaren bredvid dörren till serverrummet: grön när du är där inne eller på väg in
  var ORIG_FX = W.drawFx;
  W.drawFx = function (g, sc) {
    ORIG_FX.apply(this, arguments);
    if (this.site !== 'gbg') return;
    var s = this.toScreen(-9.75, -2.06, 1.2), x = Math.round(s.x), y = Math.round(s.y);
    var ok = this.zone().name === 'Serverrummet' || dist(this.pos.x, this.pos.z, -10.4, -2.4) < 1.4;
    g.fillStyle = '#2b2f36'; g.fillRect(x - 2, y - 3, 5, 7); g.fillStyle = '#4a4f57'; g.fillRect(x - 1, y - 2, 3, 3);
    g.fillStyle = ok ? '#3dff6a' : '#ff3b30'; g.fillRect(x, y + 2, 1, 1);
  };

  NV.afterGame(function () {
    var g = NV.game;
    if (!g) return;
    // Vilka sittplatser och emotes du har använt
    var origInteract = g.onInteract;
    g.onInteract = function (i) {
      var r = origInteract.apply(this, arguments);
      if (i && i.type === 'sit' && this.world && this.world.seated) {
        var d = NV.v8.load(); d.seatsUsed = d.seatsUsed || {}; if (!d.seatsUsed[i.id]) { d.seatsUsed[i.id] = 1; NV.v8.save(d); NV.career.max('seatsUsed', Object.keys(d.seatsUsed).length); }
      }
      return r;
    };
    var origEmote = W.emote;
    W.emote = function (code) {
      var r = origEmote.apply(this, arguments);
      var d = NV.v8.load(); d.emotesUsed = d.emotesUsed || {}; if (!d.emotesUsed[code]) { d.emotesUsed[code] = 1; NV.v8.save(d); NV.career.max('emoteKinds', Object.keys(d.emotesUsed).length); }
      return r;
    };
    var A = NV.career.ACH;
    [
      ['seats8', 'Stolprovare', 'Sätt dig på åtta olika platser.', '🛋️', function (s) { return s.seatsUsed >= 8; }],
      ['emotes6', 'Kroppsspråk', 'Använd alla sex emotes.', '🎭', function (s) { return s.emoteKinds >= 6; }],
      ['rain50', 'Paraplyväder', 'Gå 50 meter ute i regnet.', '☔', function (s) { return s.rainMeters >= 50; }],
      ['morning', 'Morgonpigg', 'Gå ut före halv nio en morgon när det inte regnar.', '🌅', function (s) { return s.morningWalks >= 1; }],
      ['stream', 'Bäckfiskare', 'Få en fisk i bäcken vid lagret i Borås.', '🏞️', function (s) { return s.streamFish >= 1; }],
    ].forEach(function (a) { if (!A.some(function (x) { return x[0] === a[0]; })) A.push(a); });
    // Fiskar i bäcken räknas för sig
    var origInteract2 = g.onInteract;
    g.onInteract = function (i) {
      var w = this.world, before = NV.career.stats().fish || 0, spot = w && w.fishing && w.fishing.spot;
      var r = origInteract2.apply(this, arguments);
      if (i && i.type === 'fish' && spot === 'stream' && (NV.career.stats().fish || 0) > before) NV.career.stat('streamFish');
      return r;
    };
  });
})();
