// 2D-världen, version 8: födelsedagar med tårta och ballonger, katten som sover i soffan, pappersflygplan
// att plocka upp, dubbel tur i varuautomaten, sällskap vid kaffet, morgondagg och dimma över dammen.
(function () {
  if (!NV.World2D) return;
  var W = NV.World2D.prototype;
  function R(a, b) { return a + Math.random() * (b - a); }
  function dist(a, b, c, d) { return Math.hypot(a - c, b - d); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function hour(w) { return 8 + (w.game.state ? w.game.state.time : 0) / 3600; }
  var CAKE = { x: -1.5, z: -5.55 };   // på fikabordet

  // Veckans födelsedagsbarn: en av kollegorna vid skrivborden
  W.birthdayPerson = function () {
    var self = this, wk = this.game.week || 1;
    var ppl = Object.keys(this.people || {}).filter(function (n) { var p = self.people[n]; return p.def.desk && self.npcVisible(n); });
    return ppl.length ? ppl[(wk * 5 + 2) % ppl.length] : null;
  };

  var ORIG_COLLECT = W.collectInteractables;
  W.collectInteractables = function () {
    ORIG_COLLECT.apply(this, arguments);
    this.cakeInter = { x: CAKE.x, z: CAKE.z, inter: { type: 'cake' }, r: 0.6 };
    this.inters.push(this.cakeInter);
    this.planeInters = [];
  };

  var ORIG_UPD = W.updateFx;
  W.updateFx = function (dt, rdt) {
    ORIG_UPD.apply(this, arguments);
    if (!this.builder) return;
    var self = this, me = this.pos;
    // Tårtan finns kvar tills den är uppäten
    var bd = this.birthdayPerson(), d = NV.v8.load(), wk = this.game.week || 1;
    this.birthday = bd;
    this.cakeLeft = Math.max(0, 6 - ((d.cake || {})[wk] || 0));
    if (this.cakeInter) this.cakeInter.z = bd && this.cakeLeft > 0 ? CAKE.z : -100;
    // Katten sover när den sitter i en av sofforna
    var c = this.cat;
    if (c && c.sit && c.wait > 0 && (dist(c.x, c.z, 12.6, -8.75) < 0.3 || dist(c.x, c.z, -12.4, -0.2) < 0.3)) {
      c.wait = Math.max(c.wait, 6);
      if (Math.random() < dt * 0.6 && this.site === 'gbg') this.pops.push({ text: 'z', col: '#cfe3ff', x: c.x + 0.1, z: c.z, y: 0.5, age: 0, life: 1.6 });
    }
    // Landade pappersflygplan går att plocka upp
    var list = this.inters, planes = (this.planes || []).filter(function (p) { return p.landed && p.site === self.site; });
    (this.planeInters || []).forEach(function (it) { var k = list.indexOf(it); if (k >= 0) list.splice(k, 1); });
    this.planeInters = planes.map(function (p) { var it = { x: p.x, z: p.z, inter: { type: 'paperplane', p: p }, r: 0.4 }; list.push(it); return it; });
    // Morgondagg glittrar i gräset och dimma ligger över dammen tidigt på morgonen
    var h = hour(this);
    if (h < 9.3 && /Utanför/.test(this.zone().name) && this.weather !== 'rain' && Math.random() < dt * 6) {
      var vm = this.visMin, vM = this.visMax;
      if (vm) this.part({ x: R(vm.x, vM.x), z: R(vm.z, vM.z), y: 0.02, life: 0.6, size: 1, col: '#ffffff', glow: true });
    }
    if (h < 9.5 && this.site === 'gbg' && Math.random() < dt * 3) this.part({ x: R(-20, -16.6), z: R(-5, 2), y: 0.1, vx: R(0.05, 0.15), vy: 0.04, life: R(3, 5), size: 3, grow: 3, col: 'rgba(235,240,245,0.18)' });
  };

  // Ballonger vid födelsedagsbarnets skrivbord och tårtan på fikabordet
  var ORIG_FX = W.drawFx;
  W.drawFx = function (g, sc) {
    ORIG_FX.apply(this, arguments);
    if (this.site !== 'gbg') return;
    var self = this, t = this.t || 0;
    function at(x, z, y) { var s = self.toScreen(x, z, y || 0); return { x: Math.round(s.x), y: Math.round(s.y) }; }
    var bd = this.birthday && this.people[this.birthday];
    if (bd) {
      [['#ff5a4f', -0.35, 0], ['#4fc3f7', -0.2, 1.3], ['#ffd54a', -0.5, 2.6]].forEach(function (b) {
        var base = at(bd.def.desk ? self.builder.anchors.desks[bd.def.desk].x + b[1] : bd.x, bd.def.desk ? self.builder.anchors.desks[bd.def.desk].z : bd.z, 0.8);
        var top = { x: base.x + Math.round(Math.sin(t * 1.5 + b[2]) * 2), y: base.y - 22 - Math.round(Math.sin(t * 2 + b[2]) * 1.5) };
        g.strokeStyle = 'rgba(240,240,240,0.7)'; g.lineWidth = 1; g.beginPath(); g.moveTo(base.x, base.y); g.lineTo(top.x, top.y + 4); g.stroke();
        g.fillStyle = b[0]; g.fillRect(top.x - 2, top.y - 3, 5, 6); g.fillRect(top.x - 1, top.y - 4, 3, 8);
        g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(top.x - 1, top.y - 2, 1, 2);
      });
    }
    if (bd && this.cakeLeft > 0) {
      var c = at(CAKE.x, CAKE.z, 0.78), w = Math.max(2, Math.round(this.cakeLeft * 1.3));
      g.fillStyle = '#f4f1ea'; g.fillRect(c.x - 6, c.y + 1, 12, 2);
      g.fillStyle = '#f7d6e0'; g.fillRect(c.x - 4, c.y - 3, w, 4); g.fillStyle = '#fff6f9'; g.fillRect(c.x - 4, c.y - 4, w, 1);
      g.fillStyle = '#e94b6a'; for (var i = 0; i < Math.min(3, this.cakeLeft); i++) g.fillRect(c.x - 3 + i * 3, c.y - 5, 1, 1);
      if (Math.sin(t * 9) > -0.3) { g.fillStyle = '#ffd54a'; g.fillRect(c.x - 1, c.y - 8, 1, 2); }
      g.fillStyle = '#ffffff'; g.fillRect(c.x - 1, c.y - 6, 1, 2);
    }
  };

  NV.afterGame(function () {
    var g = NV.game;
    if (!g) return;
    var origDescribe = g.describe;
    g.describe = function (i) {
      if (i.type === 'cake') return 'Ta en bit av ' + (this.world.birthday || 'någons') + 's tårta';
      if (i.type === 'paperplane') return 'Plocka upp pappersflygplanet';
      return origDescribe.apply(this, arguments);
    };
    var origInteract = g.onInteract;
    g.onInteract = function (i) {
      var w = this.world, d, wk = this.week || 1;
      if (!i) return origInteract.apply(this, arguments);
      if (i.type === 'cake') {
        d = NV.v8.load(); d.cake = d.cake || {}; d.cake[wk] = (d.cake[wk] || 0) + 1; NV.v8.save(d);
        NV.sfx.munch(); NV.career.stat('cakes');
        this.boostUntil = Math.max(this.boostUntil || 0, Date.now()) + 30000;
        this.ui.toast('🎂 Mums, tårta! Det ger lite extra energi (30 sekunder snabbare steg).');
        return;
      }
      if (i.type === 'paperplane') {
        w.planes = (w.planes || []).filter(function (p) { return p !== i.p; });
        NV.sfx.pickup(); NV.career.stat('planePickups');
        return;
      }
      // Grattis till födelsedagsbarnet, en gång per vecka
      if (i.type === 'npc' && i.id === w.birthday) {
        d = NV.v8.load(); d.congrats = d.congrats || {};
        if (!d.congrats[wk]) {
          d.congrats[wk] = i.id; NV.v8.save(d);
          NV.career.stat('congrats');
          w.pops.push({ text: '🎉', col: '#ffd54a', x: w.people[i.id].x, z: w.people[i.id].z, y: 2.3, age: 0, life: 2 });
          if (w.confetti && NV.settings.get('reduceMotion') !== true) w.confetti(w.people[i.id].x, w.people[i.id].z, 30);
          this.ui.toast('🎂 Du gratulerade <b>' + esc(i.id) + '</b> på födelsedagen. ”Tack! Ta en bit tårta i fikarummet.”', 'good');
          if (NV.v8.friend) NV.v8.friend(i.id, 2, 'födelsedag');
          this.xp(5, 'Grattis', true);
        }
      }
      // Varuautomaten ger ibland två saker
      if (i.type === 'snack' && Math.random() < 0.08) {
        var r0 = origInteract.apply(this, arguments);
        NV.career.stat('doubleSnacks');
        var self = this;
        setTimeout(function () { NV.sfx.thud(); self.ui.toast('🍀 Dubbelt upp! Automaten släppte en sak till.'); }, 700);
        return r0;
      }
      // Sällskap vid kaffemaskinen
      if (i.type === 'coffee' && w.npcWalk && w.npcWalk.stage === 'wait') {
        var n = w.npcWalk.n, p = w.people[n];
        if (p && dist(p.x, p.z, w.pos.x, w.pos.z) < 2.5) {
          w.pops.push({ text: 'Trevligt med sällskap!', col: '#ffffff', x: p.x, z: p.z, y: 2.2, age: 0, life: 2 });
          d = NV.v8.load(); d.coffeeChat = d.coffeeChat || {}; var day = new Date().toDateString();
          if (d.coffeeChat[n] !== day) { d.coffeeChat[n] = day; NV.v8.save(d); if (NV.v8.friend) NV.v8.friend(n, 1, 'fika'); NV.career.stat('coffeeChats'); }
        }
      }
      return origInteract.apply(this, arguments);
    };
    var A = NV.career.ACH;
    [
      ['congrats', 'Grattis!', 'Gratulera veckans födelsedagsbarn.', '🎂', function (s) { return s.congrats >= 1; }],
      ['cake', 'Tårtbit', 'Ta en bit av födelsedagstårtan.', '🍰', function (s) { return s.cakes >= 1; }],
      ['lucky', 'Turdag', 'Få två saker ur varuautomaten på en gång.', '🍀', function (s) { return s.doubleSnacks >= 1; }],
      ['fika', 'Fikasällskap', 'Ta kaffe samtidigt som en kollega står vid maskinen.', '☕', function (s) { return s.coffeeChats >= 1; }],
    ].forEach(function (a) { if (!A.some(function (x) { return x[0] === a[0]; })) A.push(a); });
  });
})();
