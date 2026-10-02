// 2D-världen, version 8: saker att göra mellan felsökningen. Gummiankor att samla, borttappade saker,
// växter att vattna, skräp att plocka, fiske, bänkar att sitta på, en varuautomat, emotes och kollegor som rör på sig.
(function () {
  if (!NV.World2D) return;
  var W = NV.World2D.prototype, A2 = NV.art2d;
  function R(a, b) { return a + Math.random() * (b - a); }
  function dist(a, b, c, d) { return Math.hypot(a - c, b - d); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  // den, det eller dem beroende på ordet (”Min laddare”, ”Mitt kort”, ”Mina hörlurar”)
  function pron(mine) { return /^Mina/.test(mine) ? 'dem' : (/^Mitt/.test(mine) ? 'det' : 'den'); }
  var KEY = 'krabba-passet.v8';
  function load() { var d = NV.settings.store(KEY); return d && typeof d === 'object' ? d : {}; }
  function save(d) { NV.settings.store(KEY, d); }
  NV.v8 = { load: load, save: save };

  // ------------------------------------------------------------------ Data
  // Gummiankor gömda på kontoret, på gården och i lagret
  var DUCKS = [
    { id: 'g1', x: -13.4, z: 7.9, hint: 'i hörnet bakom Annas skrivbord' }, { id: 'g2', x: 14.2, z: -9.3, hint: 'i receptionens hörn' },
    { id: 'g3', x: -14.3, z: -9.3, hint: 'i serverrummet' }, { id: 'g4', x: -18.6, z: 7.2, hint: 'på gräsmattan väster om huset' },
    { id: 'g5', x: 19.4, z: -16.6, hint: 'längst bort på parkeringen' }, { id: 'g6', x: -2.2, z: 12.6, hint: 'norr om kontoret' },
    { id: 'b1', x: 90.2, z: -11.4, hint: 'i lagerkontoret' }, { id: 'b2', x: 104.2, z: 2.6, hint: 'mellan hyllorna' },
    { id: 'b3', x: 115.6, z: -15.0, hint: 'i hörnet söder om lastkajen' }, { id: 'b4', x: 83.4, z: 8.6, hint: 'på gräset väster om lagret' },
    { id: 'b5', x: 110.8, z: -10.8, hint: 'i lagrets sydöstra hörn' }, { id: 'b6', x: 96.4, z: 11.2, hint: 'vid lagrets norra vägg' },
  ];
  NV.v8.DUCKS = DUCKS;
  // Borttappade saker: en per vecka, ägaren tackar när du lämnar tillbaka den
  var LOST = [
    { item: 'passerkort', a: 'ett passerkort', mine: 'Mitt passerkort', icon: '🪪', owner: 'Karim', col: '#4fc3f7' },
    { item: 'hörlurar', a: 'ett par hörlurar', mine: 'Mina hörlurar', icon: '🎧', owner: 'Lisa', col: '#b77ee0' },
    { item: 'USB-minne', a: 'ett USB-minne', mine: 'Mitt USB-minne', icon: '💾', owner: 'Bo', col: '#e05a4c' },
    { item: 'läsglasögon', a: 'ett par läsglasögon', mine: 'Mina läsglasögon', icon: '👓', owner: 'Maja', col: '#f0b429' },
    { item: 'laddare', a: 'en laddare', mine: 'Min laddare', icon: '🔌', owner: 'Sara', col: '#eeeeee' },
    { item: 'kaffekopp', a: 'en kaffekopp', mine: 'Min kaffekopp', icon: '☕', owner: 'Anna', col: '#ffffff' },
    { item: 'nyckelknippa', a: 'en nyckelknippa', mine: 'Min nyckelknippa', icon: '🔑', owner: 'Omar', col: '#d9b35b' },
    { item: 'penna', a: 'en penna', mine: 'Min penna', icon: '🖊️', owner: 'Linnea', col: '#3a6ec8' },
  ];
  var LOST_SPOTS = [[-10.5, 6.2], [10.4, 4.1], [-3.6, -5.2], [9.4, -4.4], [-12.6, -3.6], [4.2, 0.8], [-6.2, 0.6], [12.6, 1.6]];
  NV.v8.LOST = LOST;
  var FISH = [
    ['Abborre', 12, 32, 40], ['Mört', 10, 25, 30], ['Sutare', 20, 45, 12], ['Gädda', 40, 90, 5], ['Ruda', 10, 28, 10],
    ['En gammal patchkabel', 0, 0, 2], ['En gammal sko', 0, 0, 1],
  ];
  var SNACKS = ['en chokladbit', 'en påse chips', 'en müslibar', 'en banan', 'ett paket salmiak', 'en kanelbulle', 'en rad vingummi', 'en burk läsk'];
  var BOARD = [
    'Fredagsfika kl. 15 – Bo bjuder (sägs det).', 'Den som lånade HDMI-kabeln från mötesrummet: lämna tillbaka den.', 'Krabba-observationer rapporteras till Omar.',
    'Städ-Sture (dammsugaren) får inte klappas när den laddar.', 'Kom ihåg: spara konfigurationen. Sedan en gång till.', 'Ankorna i dammen ska inte matas med kanelbullar.',
    'Lunchpromenad runt dammen tisdagar kl. 12.', 'Hittegods lämnas i receptionen hos Linnea.',
  ];
  var EMOTES = { Digit1: ['👋', 'Hej!'], Digit2: ['👍', 'Bra jobbat!'], Digit3: ['❤️', ''], Digit4: ['❓', 'Hmm?'], Digit5: ['😂', 'Haha!'], Digit6: ['☕', 'Fika?'] };
  NV.v8.EMOTES = EMOTES;

  // ------------------------------------------------------------------ Föremål i världen
  var ORIG_SCENE = W.addScenery;
  W.addScenery = function () {
    ORIG_SCENE.apply(this, arguments);
    var self = this, add = this.addSprite, cv = A2.cv;
    // Varuautomat i fikarummet
    var vm = cv(20, 34), g = vm.getContext('2d');
    g.fillStyle = '#b8322a'; g.fillRect(0, 0, 20, 34); g.fillStyle = '#d9473d'; g.fillRect(1, 1, 18, 2);
    g.fillStyle = '#20262e'; g.fillRect(2, 4, 11, 20);
    var cols = ['#f0b429', '#4fc3f7', '#6dbf4b', '#e05a4c', '#ffffff', '#b77ee0'];
    for (var r = 0; r < 4; r++) for (var c = 0; c < 3; c++) { g.fillStyle = cols[(r * 3 + c) % cols.length]; g.fillRect(3 + c * 3, 5 + r * 5, 2, 3); g.fillStyle = '#8a8f96'; g.fillRect(3 + c * 3, 8 + r * 5, 3, 1); }
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(2, 4, 2, 20);
    g.fillStyle = '#2b2f36'; g.fillRect(14, 6, 4, 6); g.fillStyle = '#7fe08a'; g.fillRect(15, 7, 2, 1);
    g.fillStyle = '#c8c8c8'; g.fillRect(14, 14, 4, 2); g.fillStyle = '#111'; g.fillRect(3, 27, 10, 4); g.fillStyle = '#8a1f19'; g.fillRect(0, 32, 20, 2);
    add(A2.selout(vm, 0.4), 1.25, -5.6, { key: -5.6, shadow: { rx: 0.4, rz: 0.15, dx: 0.1 }, light: { col: '120,200,255', r: 16, y: 0.7, a: 0.12 } });
    this.builder.colliders.push({ minX: 1.25, maxX: 1.95, minZ: -5.6, maxZ: -5.15 });
    this.vending = { x: 1.6, z: -5.4 };
  };

  var ORIG_COLLECT = W.collectInteractables;
  W.collectInteractables = function () {
    ORIG_COLLECT.apply(this, arguments);
    var self = this, list = this.inters, d = load();
    function add(x, z, inter, r) { var o = { x: x, z: z, inter: inter, r: r || 0.8 }; list.push(o); return o; }
    this.duckInters = DUCKS.map(function (k) { return add(k.x, (d.ducks || {})[k.id] ? -100 : k.z, { type: 'rduck', id: k.id }, 0.5); });
    if (this.vending) add(this.vending.x, this.vending.z, { type: 'snack' }, 0.8);
    add(-16.7, 1.2, { type: 'fish' }, 0.9);
    // Bänkar och soffor att sitta på
    this.seats = [{ x: -8.5, z: -12.15, dir: 1 }, { x: 0.5, z: -12.15, dir: 1 }, { x: -19.2, z: 3.35, dir: 1 }, { x: 12.8, z: -8.75, dir: 1 },
      // Stolarna i fikarummet och mötesrummet och den grå soffan på kontoret
      { x: -2.4, z: -5.8, dir: 3 }, { x: -0.6, z: -5.8, dir: 2 }, { x: -1.5, z: -4.9, dir: 0 },
      { x: 10.2, z: 4.8, dir: 1 }, { x: 11.4, z: 4.8, dir: 1 }, { x: 10.2, z: 6.4, dir: 0 }, { x: 11.4, z: 6.4, dir: 0 }, { x: -12.4, z: -0.2, dir: 3 }];
    this.seats.forEach(function (s, i) { add(s.x, s.z, { type: 'sit', id: i }, 0.8); });
    add(0.6, -2.2, { type: 'read', id: 'board' }, 0.7);
    add(6.1, 9.6, { type: 'read', id: 'calendar' }, 0.7);
    add(1.95, 9.6, { type: 'read', id: 'clock' }, 0.6);
    // Krukväxterna kan vattnas
    var plants = (this.sprites || []).filter(function (s) { return s.rustle === 'plant' && s.rx !== undefined; });
    this.plants = plants.map(function (s, i) { var old = (self.plants || [])[i]; return { x: s.rx, z: s.rz, thirst: old ? old.thirst : R(60, 300), sp: s }; });
    this.plantInters = this.plants.map(function (p, i) { return add(p.x, p.z, { type: 'plant', id: i }, 0.6); });
    this.lostInter = add(0, -100, { type: 'lost' }, 0.5);
    this.trashInters = [];
    (this.trash || []).forEach(function (t) { t.inter = add(t.x, t.z, { type: 'trash', t: t }, 0.45); self.trashInters.push(t.inter); });
    this.placeLost();
  };

  // Veckans borttappade sak
  W.placeLost = function () {
    var g = this.game, d = load(), wk = g.week || 1;
    this.lost = null;
    if (!this.lostInter) return;
    this.lostInter.z = -100;
    var self = this;
    var cands = LOST.filter(function (l) { return self.people[l.owner] && self.npcVisible(l.owner) && self.people[l.owner].def.site === 'gbg'; });
    if (!cands.length || (d.lostDone || {})[wk]) return;
    var l = cands[(wk * 3) % cands.length], sp = LOST_SPOTS[(wk * 5) % LOST_SPOTS.length];
    this.lost = { item: l.item, a: l.a, mine: l.mine, icon: l.icon, owner: l.owner, col: l.col, x: sp[0], z: sp[1], carried: false };
    this.lostInter.x = sp[0]; this.lostInter.z = sp[1];
  };

  // ------------------------------------------------------------------ Uppdatering
  var ORIG_UPD = W.updateFx;
  W.updateFx = function (dt, rdt) {
    ORIG_UPD.apply(this, arguments);
    if (!this.builder) return;
    var self = this, me = this.pos, g = this.game;
    // Sitter du? Rör du dig så reser du dig
    if (this.seated) {
      var k = this.keys || {};
      if (this.target || k.KeyW || k.KeyA || k.KeyS || k.KeyD || k.ArrowUp || k.ArrowDown || k.ArrowLeft || k.ArrowRight) this.standUp();
      else {
        this.seatT = (this.seatT || 0) + dt;
        if (this.seatT > 8 && Math.random() < dt * 0.7) this.pops.push({ text: 'z', col: '#cfe3ff', x: me.x + 0.15, z: me.z, y: 1.5, age: 0, life: 1.6 });
      }
    }
    // Växterna blir törstiga med tiden
    (this.plants || []).forEach(function (p) { p.thirst -= dt; });
    // Skräp dyker upp ibland på kontoret
    this.trash = this.trash || [];
    this.trashT = (this.trashT === undefined ? R(30, 60) : this.trashT) - dt;
    if (this.trashT <= 0 && this.site === 'gbg') { this.trashT = R(70, 130); if (this.trash.length < 3) this.spawnTrash(); }
    // Fisket
    var f = this.fishing;
    if (f) {
      f.t += dt;
      if (dist(me.x, me.z, -16.2, 1.2) > 1.6) { this.fishing = null; }
      else if (f.state === 'wait' && f.t > f.bite) { f.state = 'bite'; f.t = 0; NV.sfx.plop(); this.ripples.push({ x: -17.6, z: 1.1, age: 0, life: 0.8, size: 4 }); this.pops.push({ text: '!', col: '#ff5a4f', x: me.x, z: me.z, y: 2.0, age: 0, life: 0.9 }); }
      else if (f.state === 'bite' && f.t > 0.9) { this.fishing = null; g.ui.toast('🎣 Fisken slank undan. Tryck E direkt när flötet dyker.'); }
      if (f.state === 'wait' && Math.random() < dt * 0.8) this.ripples.push({ x: -17.6, z: 1.1, age: 0, life: 1.2, size: 2 });
    }
    // Kollegor hälsar första gången du går förbi under veckan
    this.greeted = this.greeted || {};
    var wk = g.week || 0;
    Object.keys(this.people || {}).forEach(function (n) {
      var p = self.people[n];
      if (!self.npcVisible(n) || (p.def.site === 'boras') !== (self.site === 'boras') || self.greeted[n + wk]) return;
      if (dist(me.x, me.z, p.x, p.z) < 1.9 && !(g.ui && g.ui.talkingTo)) {
        self.greeted[n + wk] = true;
        var hi = ['Hej!', 'Tjena!', 'Godmorgon!', 'Hallå där!', 'Hej hej!'][Math.floor(Math.random() * 5)];
        self.pops.push({ text: hi, col: '#ffffff', x: p.x, z: p.z, y: 2.1, age: 0, life: 1.8 });
      }
    });
    // Emotes som kollegorna svarar på
    this.emotes = (this.emotes || []).filter(function (e) { e.t -= dt; return e.t > 0; });
    (this.emoteReplies || []).forEach(function (r) { r.t -= dt; if (r.t <= 0 && !r.done) { r.done = true; self.emotes.push({ who: r.who, icon: r.icon, t: 1.8 }); } });
    this.emoteReplies = (this.emoteReplies || []).filter(function (r) { return !r.done; });
    // Kollegor går och hämtar kaffe
    this.coffeeWalks(dt);
    // Ankorna glittrar lite när du är nära, så att de går att hitta
    if (this.duckInters) this.duckInters.forEach(function (it) { if (it.z > -50 && (it.x > 50) === (self.site === 'boras') && dist(me.x, me.z, it.x, it.z) < 3 && Math.random() < dt * 2) self.sparkle(it.x, it.z, 0.25); });
    // Den borttappade saken
    if (this.lost && !this.lost.carried && this.site === 'gbg' && dist(me.x, me.z, this.lost.x, this.lost.z) < 2.5 && Math.random() < dt * 1.5) this.sparkle(this.lost.x, this.lost.z, 0.2);
  };

  W.spawnTrash = function () {
    var n = this.navGrid ? this.navGrid() : null;
    if (!n) return;
    for (var tries = 0; tries < 40; tries++) {
      var x = R(-14, 14), z = R(-9.5, 9.5);
      if (this.collides(x, z, 0.3)) continue;
      var zn = this.builder.zones.filter(function (q) { return x >= q.minX && x <= q.maxX && z >= q.minZ && z <= q.maxZ; })[0];
      if (!zn || /Utanför/.test(zn.name)) continue;
      var t = { x: x, z: z, kind: Math.floor(Math.random() * 4), rot: Math.random() < 0.5 };
      t.inter = { x: x, z: z, inter: { type: 'trash', t: t }, r: 0.45 };
      this.trash.push(t); this.inters.push(t.inter);
      return t;
    }
    return null;
  };
  W.removeTrash = function (t) {
    this.trash = this.trash.filter(function (x) { return x !== t; });
    this.inters = this.inters.filter(function (x) { return x !== t.inter; });
    if (this.hover && this.hover.t === t) this.hover = null;
  };

  // Sitta och resa sig
  W.sitDown = function (i) {
    var s = this.seats[i];
    if (!s) return;
    this.stopWalk && this.stopWalk();
    this.seated = { x: s.x, z: s.z, dir: s.dir, from: { x: this.pos.x, z: this.pos.z } };
    this.pos.x = s.x; this.pos.z = s.z; this.dir = s.dir; this.seatT = 0;
  };
  W.standUp = function () {
    if (!this.seated) return;
    var fr = this.seated.from;
    this.seated = null;
    if (fr && this.collides(this.pos.x, this.pos.z, 0.22)) { this.pos.x = fr.x; this.pos.z = fr.z; }
  };
  // Spelaren ritas sittande på bänken
  var ORIG_CHAR = W.drawChar;
  W.drawChar = function (g, spr, x, z, sc, sitting, p) {
    if (this.seated && !p && x === this.pos.x && z === this.pos.z && this.playerSpr) {
      spr = this.playerSpr(this.seated.dir === undefined ? 1 : this.seated.dir, 0, true, (this.t || 0) % 3.7 < 0.13);
      sitting = true;
    }
    return ORIG_CHAR.call(this, g, spr, x, z, sc, sitting, p);
  };

  // Emotes
  W.emote = function (code) {
    var e = EMOTES[code];
    if (!e) return;
    var self = this, me = this.pos;
    this.emotes = this.emotes || [];
    this.emotes.push({ who: null, icon: e[0], t: 2 });
    if (e[1]) this.pops.push({ text: e[1], col: '#ffffff', x: me.x, z: me.z, y: 2.3, age: 0, life: 1.5 });
    NV.sfx.pop();
    NV.career.stat('emotes');
    // Kollegor i närheten svarar
    var reply = { '👋': '👋', '👍': '😊', '❤️': '😊', '❓': '🤔', '😂': '😄', '☕': '☕' }[e[0]];
    this.emoteReplies = this.emoteReplies || [];
    Object.keys(this.people || {}).forEach(function (n) {
      var p = self.people[n];
      if (self.npcVisible(n) && dist(me.x, me.z, p.x, p.z) < 3.2) self.emoteReplies.push({ who: n, icon: reply, t: R(0.4, 0.9) });
    });
  };

  // Kollegor som reser sig och hämtar kaffe, med samma vägsökning som du
  var COFFEE = { x: -2.6, z: -8.3 };
  W.coffeeWalks = function (dt) {
    var self = this, g = this.game;
    if (this.site !== 'gbg' || !this.findPath || NV.settings.get('npcWalks') === false) return;
    this.walkT = (this.walkT === undefined ? R(40, 80) : this.walkT) - dt;
    if (this.walkT <= 0 && !this.npcWalk) {
      this.walkT = R(70, 140);
      var talking = g.ui && g.ui.talkingTo;
      var who = Object.keys(this.people).filter(function (n) { var p = self.people[n]; return p.sit && p.def.desk && self.npcVisible(n) && n !== talking && dist(p.x, p.z, self.pos.x, self.pos.z) > 2.5; });
      if (who.length) {
        var n = who[Math.floor(Math.random() * who.length)], p = this.people[n];
        var path = this.findPath(p.x, p.z + 0.4, COFFEE.x + R(-0.3, 0.3), COFFEE.z);
        if (path && !path.partial && path.pts.length) this.npcWalk = { n: n, home: { x: p.x, z: p.z }, pts: path.pts, stage: 'go', wait: 0 };
      }
    }
    var w = this.npcWalk;
    if (!w) return;
    var p = this.people[w.n];
    if (!p) { this.npcWalk = null; return; }
    // Pratar du med personen står den still
    if (g.ui && g.ui.talkingTo === w.n) { p.walking = false; return; }
    if (w.stage === 'wait') {
      w.wait -= dt; p.walking = false;
      if (Math.random() < dt * 2) this.steam(p.x + 0.1, p.z, 1.3);
      if (w.wait <= 0) {
        var back = this.findPath(p.x, p.z, w.home.x, w.home.z + 0.4);
        w.pts = back && back.pts.length ? back.pts.concat([{ x: w.home.x, z: w.home.z }]) : [{ x: w.home.x, z: w.home.z }];
        w.stage = 'back';
      }
      return;
    }
    p.sit = false;
    var tgt = w.pts[0];
    if (!tgt) {
      if (w.stage === 'go') { w.stage = 'wait'; w.wait = R(5, 9); p.wdir = 0; }
      else { p.x = w.home.x; p.z = w.home.z; p.sit = true; p.walking = false; this.npcWalk = null; this.syncPerson(w.n); }
      return;
    }
    var dx = tgt.x - p.x, dz = tgt.z - p.z, d = Math.hypot(dx, dz), sp = Math.min(d, dt * 1.3);
    if (d < 0.03) { w.pts.shift(); return; }
    p.x += dx / d * sp; p.z += dz / d * sp; p.walking = true;
    p.wdir = Math.abs(dx) > Math.abs(dz) ? (dx < 0 ? 2 : 3) : (dz < 0 ? 0 : 1);
    this.syncPerson(w.n);
  };
  W.syncPerson = function (n) {
    var p = this.people[n];
    if (p.col) { p.col.minX = p.x - 0.25; p.col.maxX = p.x + 0.25; p.col.minZ = p.z - 0.2; p.col.maxZ = p.z + 0.25; }
    (this.inters || []).forEach(function (it) { if (it.npc === n) { it.x = p.x; it.z = p.z; } });
  };

  // ------------------------------------------------------------------ Ritning
  // Saker på golvet ritas på marken under figurerna
  var ORIG_GFX = W.drawGroundFx;
  W.drawGroundFx = function (g) {
    ORIG_GFX.apply(this, arguments);
    var self = this, t = this.t || 0, bora = this.site === 'boras';
    function at(x, z) { var s = self.toScreen(x, z, 0); return { x: Math.round(s.x), y: Math.round(s.y) }; }
    // Gummiankor
    (this.duckInters || []).forEach(function (it) {
      if (it.z < -50 || (it.x > 50) !== bora) return;
      var s = at(it.x, it.z), b = Math.round(Math.sin(t * 2 + it.x) * 0.6);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(s.x - 3, s.y, 7, 2);
      g.fillStyle = '#c99a00'; g.fillRect(s.x - 3, s.y - 3 + b, 7, 3);
      g.fillStyle = '#ffd21f'; g.fillRect(s.x - 3, s.y - 4 + b, 6, 3); g.fillRect(s.x + 1, s.y - 7 + b, 3, 3);
      g.fillStyle = '#ff8a1f'; g.fillRect(s.x + 4, s.y - 6 + b, 2, 1);
      g.fillStyle = '#1a1a1a'; g.fillRect(s.x + 2, s.y - 6 + b, 1, 1);
      g.fillStyle = '#fff7b0'; g.fillRect(s.x - 2, s.y - 4 + b, 2, 1);
    });
    // Borttappade saken
    var l = this.lost;
    if (l && !l.carried && !bora) {
      var s1 = at(l.x, l.z);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(s1.x - 3, s1.y, 6, 2);
      g.fillStyle = l.col; g.fillRect(s1.x - 3, s1.y - 3, 6, 3); g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(s1.x - 3, s1.y - 3, 2, 1);
      if (Math.sin(t * 4) > 0.6) { g.fillStyle = '#ffffff'; g.fillRect(s1.x + 1, s1.y - 5, 1, 1); }
    }
    // Skräp
    if (!bora) (this.trash || []).forEach(function (tr) {
      var s2 = at(tr.x, tr.z);
      if (tr.kind === 0) { g.fillStyle = '#f4f1ea'; g.fillRect(s2.x - 1, s2.y - 4, 3, 4); g.fillStyle = '#c0392b'; g.fillRect(s2.x - 1, s2.y - 3, 3, 1); }
      else if (tr.kind === 1) { g.fillStyle = '#e8e4da'; g.fillRect(s2.x - 2, s2.y - 2, 4, 2); g.fillStyle = '#c9c3b5'; g.fillRect(s2.x - 1, s2.y - 3, 2, 1); }
      else if (tr.kind === 2) { g.fillStyle = '#3a3f46'; g.fillRect(s2.x - 2, s2.y - 1, 5, 1); g.fillStyle = '#4fc3f7'; g.fillRect(s2.x + 2, s2.y - 2, 2, 2); }
      else { g.fillStyle = '#b07a3c'; g.fillRect(s2.x - 2, s2.y - 2, 4, 2); g.fillStyle = '#7a5226'; g.fillRect(s2.x - 2, s2.y - 1, 4, 1); }
    });
    // Flötet i dammen
    if (this.fishing && !bora) {
      var bob = at(-17.6, 1.1), dip = this.fishing.state === 'bite' ? 2 : Math.round(Math.sin(t * 3) * 0.6);
      var me = at(this.pos.x, this.pos.z);
      g.strokeStyle = 'rgba(240,240,240,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(me.x - 4, me.y - 22); g.quadraticCurveTo((me.x + bob.x) / 2, me.y - 26, bob.x, bob.y - 2 + dip); g.stroke();
      g.fillStyle = '#ffffff'; g.fillRect(bob.x - 1, bob.y - 3 + dip, 3, 2); g.fillStyle = '#e53935'; g.fillRect(bob.x - 1, bob.y - 4 + dip, 3, 1);
    }
  };
  // Ikoner ovanför: törstiga växter, emotes och det du bär på
  var ORIG_FX = W.drawFx;
  W.drawFx = function (g, sc) {
    ORIG_FX.apply(this, arguments);
    var self = this, t = this.t || 0;
    if (this.site === 'gbg') (this.plants || []).forEach(function (p) {
      if (p.thirst > 0) return;
      var s = self.toScreen(p.x, p.z, 1.15), y = Math.round(s.y + Math.sin(t * 3 + p.x) * 1.5), x = Math.round(s.x);
      g.fillStyle = '#1d5fa8'; g.fillRect(x - 1, y - 1, 3, 4); g.fillRect(x, y - 3, 1, 2);
      g.fillStyle = '#6fc3ff'; g.fillRect(x - 1, y, 2, 2);
    });
    // Emotes som pratbubblor
    (this.emotes || []).forEach(function (e) {
      var px = e.who ? self.people[e.who] : self.pos;
      if (!px) return;
      var s = self.toScreen(px.x, px.z, 2.15), a = Math.min(1, e.t * 2);
      // Bubblan poppar upp: den växer snabbt de första tiondelarna
      var pop = e.t > 1.75 ? Math.max(0.2, (2 - e.t) / 0.25) : 1;
      var h = self.hi(s), S = self.view.S, rr = Math.max(12, Math.round(4 * S * (pop > 1 ? 1 : pop + (1 - pop) * 0.2)));
      self.hiQueue.push(function (m) {
        m.save(); m.globalAlpha = a;
        m.fillStyle = 'rgba(255,255,255,0.92)'; m.strokeStyle = 'rgba(30,30,40,0.6)'; m.lineWidth = 1.5;
        m.beginPath(); m.ellipse(h.x, h.y - rr, rr * 1.1, rr, 0, 0, Math.PI * 2); m.fill(); m.stroke();
        m.beginPath(); m.moveTo(h.x - rr * 0.3, h.y - rr * 0.1); m.lineTo(h.x + rr * 0.2, h.y - rr * 0.1); m.lineTo(h.x, h.y + rr * 0.35); m.closePath(); m.fill();
        m.font = Math.round(rr * 1.15) + 'px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; m.textAlign = 'center'; m.textBaseline = 'middle'; m.fillStyle = '#222'; m.fillText(e.icon, h.x, h.y - rr);
        m.restore();
      });
    });
    // Det du bär på syns ovanför huvudet
    var l = this.lost;
    if (l && l.carried && (this.site === 'gbg')) {
      var s3 = this.toScreen(this.pos.x, this.pos.z, 2.05);
      g.fillStyle = l.col; g.fillRect(Math.round(s3.x) - 2, Math.round(s3.y + Math.sin(t * 4)), 5, 3);
    }
  };

  // ------------------------------------------------------------------ Spelet: beskrivningar och interaktion
  NV.afterGame(function () {
    var g = NV.game;
    if (!g) return;
    var origDescribe = g.describe;
    g.describe = function (i) {
      var w = this.world;
      switch (i.type) {
        case 'rduck': return 'Plocka upp gummiankan';
        case 'snack': return 'Köp något i varuautomaten';
        case 'fish': return w.fishing ? (w.fishing.state === 'bite' ? 'Dra upp!' : 'Vänta på napp …') : 'Fiska i dammen';
        case 'sit': return w.seated ? 'Res dig' : 'Sätt dig';
        case 'read': return { board: 'Läs anslagstavlan', calendar: 'Titta i kalendern', clock: 'Titta på klockan' }[i.id];
        case 'plant': var p = w.plants && w.plants[i.id]; return p && p.thirst <= 0 ? 'Vattna växten' : 'Känn på jorden';
        case 'lost': return w.lost ? 'Plocka upp ' + w.lost.a : '';
        case 'trash': return 'Släng skräpet';
      }
      return origDescribe.apply(this, arguments);
    };
    var origInteract = g.onInteract;
    g.onInteract = function (i) {
      var w = this.world, self = this, d;
      if (!i) return origInteract.apply(this, arguments);
      // Lämna tillbaka det du hittat
      if (i.type === 'npc' && w.lost && w.lost.carried && i.id === w.lost.owner) {
        var L = w.lost;
        w.lost = null;
        d = load(); d.lostDone = d.lostDone || {}; d.lostDone[this.week || 1] = L.item; save(d);
        NV.career.stat('returns');
        if (w.thank) w.thank(i.id);
        this.ui.toast(L.icon + ' <b>' + esc(i.id) + ':</b> ”' + esc(L.mine) + '! Var hittade du ' + pron(L.mine) + '? Tack!”', 'good');
        this.xp(20, 'Hittegods tillbaka');
        return;
      }
      switch (i.type) {
        case 'rduck': {
          d = load(); d.ducks = d.ducks || {};
          if (d.ducks[i.id]) return;
          d.ducks[i.id] = Date.now(); save(d);
          var n = Object.keys(d.ducks).length;
          var it = (w.duckInters || []).filter(function (x) { return x.inter.id === i.id; })[0];
          if (it) { w.sparks(it.x, it.z, 0.4, '#ffd21f', 12); it.z = -100; }
          NV.sfx.squeak(); NV.sfx.pickup();
          NV.career.stat('rubberDucks');
          this.ui.toast('🦆 <b>Gummianka ' + n + ' av ' + DUCKS.length + '!</b>' + (n === DUCKS.length ? ' Du har hittat alla!' : ''), 'good');
          this.xp(n === DUCKS.length ? 60 : 5, n === DUCKS.length ? 'Alla gummiankor' : 'Gummianka');
          return;
        }
        case 'snack': {
          var sn = SNACKS[Math.floor(Math.random() * SNACKS.length)];
          NV.sfx.coin(); setTimeout(function () { NV.sfx.thud(); NV.sfx.munch(); }, 500);
          NV.career.stat('snacks');
          w.part({ x: w.vending.x, z: w.vending.z + 0.1, y: 0.3, vy: 1, g: 6, life: 0.5, size: 2, col: '#f0b429', force: true });
          this.ui.toast('🍫 Automaten släppte ' + sn + '. Mums.');
          return;
        }
        case 'fish': {
          var f = w.fishing;
          if (!f) { w.fishing = { state: 'wait', t: 0, bite: R(2, 6) }; NV.sfx.whoosh(); setTimeout(function () { NV.sfx.plop(); }, 350); w.faceTo(-17.6, 1.1); NV.career.stat('casts'); return; }
          if (f.state === 'wait') { w.fishing = null; this.ui.toast('🎣 För tidigt! Vänta tills flötet dyker.'); return; }
          w.fishing = null;
          var tot = FISH.reduce(function (a, x) { return a + x[3]; }, 0), r = Math.random() * tot, fish = FISH[0];
          for (var k = 0; k < FISH.length; k++) { r -= FISH[k][3]; if (r <= 0) { fish = FISH[k]; break; } }
          NV.sfx.reel(); NV.sfx.splash();
          for (var q = 0; q < 10; q++) w.part({ x: -17.4, z: 1.1, y: 0.2, vx: R(-1, 1), vy: R(1, 2.5), g: 7, life: 0.8, size: 1, col: '#bfe6ff', force: true });
          if (!fish[2]) { this.ui.toast('🎣 Du fick upp … ' + fish[0].toLowerCase() + '. Den slänger du i soporna.'); NV.career.stat('junkFish'); return; }
          var cm = Math.round(R(fish[1], fish[2]));
          NV.career.stat('fish'); NV.career.max('bigFish', cm);
          d = load(); d.fishLog = d.fishLog || {}; d.fishLog[fish[0]] = Math.max(d.fishLog[fish[0]] || 0, cm); save(d);
          this.ui.toast('🐟 <b>' + fish[0] + ', ' + cm + ' cm!</b> Du släpper tillbaka den i dammen.', 'good');
          this.xp(cm >= 50 ? 25 : 5, 'Fisk');
          return;
        }
        case 'sit': if (w.seated) w.standUp(); else { w.sitDown(i.id); NV.career.stat('sits'); NV.sfx.thud(); } return;
        case 'read': {
          NV.sfx.open();
          if (i.id === 'clock') { var sec = 8 * 3600 + (this.state ? this.state.time : 0); this.ui.toast('🕒 Klockan är ' + ('0' + Math.floor(sec / 3600) % 24).slice(-2) + ':' + ('0' + Math.floor(sec / 60) % 60).slice(-2) + '. ' + (sec > 15 * 3600 ? 'Snart dags att gå hem.' : 'Gott om tid kvar.')); return; }
          if (i.id === 'calendar') {
            var wk = this.week || 1;
            this.ui.showDialog({ title: '📅 Kalendern', html: '<ul class="cal">' + NV.levels.WEEKS.map(function (x) { return '<li' + (x.week === wk ? ' class="now"' : '') + '><b>Vecka ' + x.week + '</b> · ' + esc(x.title) + (x.week === wk ? ' ← nu' : '') + '</li>'; }).join('') + '</ul>', buttons: [{ label: 'Stäng', primary: true }] });
            return;
          }
          var off = (this.week || 1) % BOARD.length;
          this.ui.showDialog({ title: '📌 Anslagstavlan', html: '<ul class="board">' + [0, 1, 2, 3].map(function (k2) { return '<li>' + esc(BOARD[(off + k2) % BOARD.length]) + '</li>'; }).join('') + '</ul>' + (w.lost && !w.lost.carried ? '<p class="muted">Någon har skrivit: ”Har någon sett ' + esc(w.lost.owner) + 's ' + esc(w.lost.item) + '?”</p>' : ''), buttons: [{ label: 'Stäng', primary: true }] });
          NV.career.stat('boardReads');
          return;
        }
        case 'plant': {
          var pl = w.plants[i.id];
          if (!pl) return;
          if (pl.thirst > 0) { this.ui.toast('🪴 Jorden är fortfarande fuktig.'); return; }
          pl.thirst = R(200, 420);
          NV.sfx.water();
          for (var j = 0; j < 8; j++) w.part({ x: pl.x + R(-0.15, 0.15), z: pl.z, y: 1.1, vx: R(-0.2, 0.2), vy: R(-0.5, 0.2), g: 5, life: 0.6, size: 1, col: '#6fc3ff', force: true });
          if (pl.sp) pl.sp.sway = 3;
          NV.career.stat('waterings');
          this.xp(3, 'Vattnade en växt');
          return;
        }
        case 'lost': {
          if (!w.lost) return;
          w.lost.carried = true; w.lostInter.z = -100;
          NV.sfx.pickup();
          this.ui.toast(w.lost.icon + ' Du hittade ' + esc(w.lost.a) + '. Det ser ut att vara <b>' + esc(w.lost.owner) + 's</b>. Lämna tillbaka ' + pron(w.lost.mine) + '!');
          return;
        }
        case 'trash': {
          w.removeTrash(i.t);
          NV.sfx.pickup();
          w.poof(i.t.x, i.t.z, 0.2, '#d9d4c8');
          NV.career.stat('trash');
          this.xp(1, 'Plockade skräp', true);
          return;
        }
      }
      return origInteract.apply(this, arguments);
    };
    // Ny vecka: ny borttappad sak
    var origStart = g.startWeek;
    g.startWeek = function () {
      var r = origStart.apply(this, arguments);
      var w = this.world;
      if (w && w.placeLost) {
        w.placeLost(); if (w.standUp) w.standUp(); w.fishing = null;
        // En kollega som är på väg till kaffet sätter sig igen
        if (w.npcWalk) { var p = w.people[w.npcWalk.n]; if (p) { p.x = w.npcWalk.home.x; p.z = w.npcWalk.home.z; p.sit = true; p.walking = false; w.syncPerson(w.npcWalk.n); } w.npcWalk = null; }
      }
      return r;
    };
    // Emotes med sifferknapparna
    document.addEventListener('keydown', function (e) {
      var w = g.world;
      if (g.mode !== '2d' || !w || !w.active || (g.ui && g.ui.captures()) || e.repeat) return;
      if (EMOTES[e.code] && w.emote) { w.emote(e.code); e.preventDefault(); }
    });
  });

  // Prestationer för det nya (karriären laddas efter 2D-skripten)
  NV.afterGame(function () { if (NV.career) addAch(NV.career.ACH); });
  function addAch(A) { [
    ['rduck1', 'Gul och glad', 'Hitta din första gummianka.', '🦆', function (s) { return s.rubberDucks >= 1; }],
    ['rduck12', 'Ankjägare', 'Hitta alla tolv gummiankor.', '🏆', function (s) { return s.rubberDucks >= 12; }],
    ['return1', 'Hittegods', 'Lämna tillbaka något som en kollega tappat.', '🎒', function (s) { return s.returns >= 1; }],
    ['return5', 'Receptionens bästa vän', 'Lämna tillbaka fem borttappade saker.', '🗝️', function (s) { return s.returns >= 5; }],
    ['water10', 'Grön tumme', 'Vattna växterna tio gånger.', '🪴', function (s) { return s.waterings >= 10; }],
    ['trash20', 'Städpatrull', 'Plocka upp 20 skräp.', '🧹', function (s) { return s.trash >= 20; }],
    ['fish1', 'Napp!', 'Få din första fisk.', '🎣', function (s) { return s.fish >= 1; }],
    ['fishbig', 'Storfångst', 'Få en fisk på minst 50 cm.', '🐟', function (s) { return s.bigFish >= 50; }],
    ['fish10', 'Sportfiskare', 'Få tio fiskar.', '🪝', function (s) { return s.fish >= 10; }],
    ['junk', 'Skräpfiske', 'Fiska upp något som inte är en fisk.', '👟', function (s) { return s.junkFish >= 1; }],
    ['sit5', 'Bänkvärmare', 'Sätt dig på en bänk eller soffa fem gånger.', '🪑', function (s) { return s.sits >= 5; }],
    ['snack5', 'Mellanmål', 'Köp fem saker i varuautomaten.', '🍫', function (s) { return s.snacks >= 5; }],
    ['emote10', 'Social', 'Använd tio emotes (1–6).', '👋', function (s) { return s.emotes >= 10; }],
    ['board', 'Läser allt', 'Läs anslagstavlan.', '📌', function (s) { return s.boardReads >= 1; }],
  ].forEach(function (a) { if (!A.some(function (x) { return x[0] === a[0]; })) A.push(a); }); }
})();
