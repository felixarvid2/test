// Version 10: förbättringar av HD-2D-läget (punkt 1–110 i README). Numren i kommentarerna följer listan.
(function () {
  if (!NV.World || !NV.hd2d) return;
  var W = NV.World.prototype, H = NV.hd2d, S = NV.settings;
  function set(k, v) { try { S.set(k, v); } catch (e) { /* inget sparas */ } }
  function reduce() { return S.get('reduceMotion') === true; }
  function hour(w) { return 8 + (w.game.state ? w.game.state.time : 0) / 3600; }
  var ZONE_TINT = {   // 31: figurerna får rummets ljus
    Serverrummet: [0.86, 0.92, 1.04], Fikarummet: [1.05, 0.98, 0.9], Receptionen: [1.04, 1.0, 0.94], Ekonomi: [1.02, 0.99, 0.94],
    Korridoren: [0.95, 0.95, 0.97], Kontorslandskapet: [1, 1, 1], Lagerkontoret: [1.02, 0.97, 0.9], 'Lagret i Borås': [0.88, 0.9, 0.95],
  };
  var EMO = ['👋', '👍', '😂', '😮', '❤️', '🤔'];

  // ------------------------------------------------------------------ Kamera (1–20)
  var ORIG_SET = W.setHD2D;
  W.setHD2D = function (on) {
    var was = this.hd2d;
    if (on && !this.hdDistT) {
      this.hdDist = this.hdDistT = +S.get('hdDist') || 16;           // 2: avståndet sparas
      this.hdYawT0 = +S.get('hdYaw') || 0;                            // 3: vridningen sparas
    }
    var r = ORIG_SET.apply(this, arguments);
    if (on && !was && this.hdYawT0 !== undefined) { this.hdYaw = this.hdYawT = this.hdYawT0; }
    if (on && !this.hdMore) this.initHdMore();
    if (this.hdMore) {
      this.hdMore.g.visible = !!on;
      if (this.ex && this.ex.vm) this.ex.vm.visible = false;         // 41: laptopen framför kameran syns inte i HD-2D
    }
    // 42: ficklampan sitter på dig i HD-2D; 171: den flyttas tillbaka till kameran när du byter till 3D
    var ex = this.ex, tl = ex && ex.torch;
    if (tl && tl.isLight && tl.target) {
      if (on && tl.parent === this.camera) { this.scene.attach(tl); this.scene.attach(tl.target); }
      else if (!on && tl.parent !== this.camera) { this.camera.add(tl); this.camera.add(tl.target); tl.position.set(0.15, -0.1, 0); tl.target.position.set(0.1, -0.05, -1); }
    }
    document.body.classList.toggle('hd-dots', !!on && S.get('hdPath') !== false);
    return r;
  };

  // 166: allt det här byggs först när HD-2D används första gången
  W.initHdMore = function () {
    var self = this, g = new THREE.Group(); g.userData.dynamic = true;
    this.scene.add(g);
    var add = THREE.AdditiveBlending;
    function glowSprite(col, op, sc) {
      var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: H.fx('glow'), color: col, transparent: true, opacity: op, blending: add, depthWrite: false, fog: false }));
      s.scale.set(sc, sc, 1); s.userData.hdNoCut = true; g.add(s); return s;
    }
    var M = this.hdMore = { g: g, dots: [], emote: null, leds: [], pools: [], glints: [], haze: [] };
    // 21: vägen visas som prickar på golvet
    var dotMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.8, depthWrite: false });
    for (var i = 0; i < 60; i++) { var d = new THREE.Mesh(new THREE.CircleGeometry(0.06, 10), dotMat); d.rotation.x = -Math.PI / 2; d.visible = false; d.userData.hdNoCut = true; g.add(d); M.dots.push(d); }
    // 64: rackens lampor blinkar i serverrummet
    var A = this.builder.anchors;
    [A.rackA, A.rackB, A.borasRack].forEach(function (r, ri) {
      if (!r) return;
      for (var k = 0; k < 6; k++) { var s = glowSprite(k % 3 === 0 ? 0xffb020 : 0x33ff88, 0.6, 0.18); s.position.set(r.x + (ri === 2 ? 0.25 : 0) + (k % 2) * 0.12 - 0.06, 0.5 + k * 0.28, r.z + (ri === 2 ? 0 : 0.42)); s.userData.ph = Math.random() * 6; M.leds.push(s); }
    });
    // 66: ljuspanelerna i det dolda taket blir ljuspölar på golvet
    for (var lx = -12; lx <= 13; lx += 4) for (var lz = -7.5; lz <= 8.5; lz += 4) {
      var p = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.6), new THREE.MeshBasicMaterial({ map: H.fx('glow'), color: 0xfff1d8, transparent: true, opacity: 0.09, blending: add, depthWrite: false, fog: false }));
      p.rotation.x = -Math.PI / 2; p.position.set(lx, 0.012, lz); p.userData.hdNoCut = true; g.add(p); M.pools.push(p);
    }
    // 65: lysrören i Borås ger ljuspölar, och det som blinkar blinkar även här
    for (var bx = 92; bx <= 108; bx += 4) for (var bz = -9; bz <= 9; bz += 6) {
      var q = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.2), new THREE.MeshBasicMaterial({ map: H.fx('glow'), color: 0xeaf2ff, transparent: true, opacity: 0.1, blending: add, depthWrite: false, fog: false }));
      q.rotation.x = -Math.PI / 2; q.position.set(bx, 0.012, bz); q.userData.hdNoCut = true; q.userData.flicker = bx === 108 && bz === 3; g.add(q); M.pools.push(q);
    }
    // 67: glimtar i solfläckarna
    for (var j = 0; j < 24; j++) { var gl = glowSprite(0xffffff, 0, 0.12); gl.material.map = H.fx('sparkle'); gl.userData.t = Math.random() * 4; M.glints.push(gl); }
    // 68: dis längs golvet i lagret
    for (var h = 0; h < 7; h++) {
      var hz = new THREE.Mesh(new THREE.PlaneGeometry(9, 4), new THREE.MeshBasicMaterial({ map: H.fx('haze'), color: 0xc8d4e0, transparent: true, opacity: 0.08, blending: add, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      hz.position.set(92 + h * 3, 0.6, -8 + (h % 3) * 7); hz.rotation.y = h; hz.userData.hdNoCut = true; g.add(hz); M.haze.push(hz);
    }
    // 69: kaffemaskinens lampa och larmet i serverrummet
    M.coffee = glowSprite(0x7dff9a, 0.5, 0.25); M.coffee.position.set(-2.72, 1.32, -9.4);
    M.alarm = glowSprite(0xff2a1a, 0, 6); M.alarm.position.set(-10.5, 1.2, -6);
    // 33: siluett av dig när något står i vägen
    var me = this.hdMe;
    M.ghost = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x6fa8ff, transparent: true, opacity: 0.35, depthTest: false, depthWrite: false, fog: false }));
    M.ghost.center.set(0.5, 0); M.ghost.scale.copy(me.s.scale); M.ghost.renderOrder = 40; me.g.add(M.ghost);
    // 37: "…" ovanför den du pratar med
    M.talk = NV.tex.label('…', { height: 0.22, size: 60, bg: 'rgba(255,255,255,0.92)', color: '#20252b' }); M.talk.visible = false; M.talk.renderOrder = 41; g.add(M.talk);
    // 15–16: mus: mittenknappen vrider, högerklick stannar, dubbelklick springer
    var c = this.canvas;
    c.addEventListener('mousedown', function (e) { if (self.hd2d && e.button === 1) { self.hdRot = { x: e.clientX }; e.preventDefault(); } });
    document.addEventListener('mousemove', function (e) {
      if (self.hdRot) { self.hdYawT -= (e.clientX - self.hdRot.x) * 0.006; self.hdYaw = self.hdYawT; self.hdRot.x = e.clientX; }
      if (self.hd2d) self.hdCursor(e.clientX, e.clientY);
    });
    document.addEventListener('mouseup', function (e) { if (e.button === 1 && self.hdRot) { self.hdRot = null; self.hdYawT = Math.round(self.hdYawT / (Math.PI / 4)) * Math.PI / 4; } });
    c.addEventListener('contextmenu', function () { if (self.hd2d && self.hdPath) { self.hdPath = null; self.hdTarget = null; NV.sfx.click(); } });   // 16
    c.addEventListener('dblclick', function (e) { if (self.hd2d) self.hdClick(e.clientX, e.clientY, true); });                                      // 17
    // 18–19: nyp för att zooma på pekskärm
    var pinch = null;
    c.addEventListener('touchstart', function (e) { if (self.hd2d && e.touches.length === 2) pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }, { passive: true });
    c.addEventListener('touchmove', function (e) {
      if (!self.hd2d || !pinch || e.touches.length !== 2) return;
      var d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      self.hdDistT = Math.max(7, Math.min(26, self.hdDistT * pinch / d)); pinch = d;
    }, { passive: true });
    c.addEventListener('touchend', function () { pinch = null; }, { passive: true });
    // 5–9: tangenter
    document.addEventListener('keydown', function (e) {
      if (!self.hd2d || !self.active || (self.game.ui && self.game.ui.captures())) return;
      if (e.code === 'Home') { self.hdYawT = 0; NV.sfx.whoosh && NV.sfx.whoosh(); }                                     // 5
      if (e.code === 'KeyQ' || e.code === 'KeyZ') { NV.sfx.whoosh && NV.sfx.whoosh(); self.hdTurns = (self.hdTurns || 0) + 1; NV.career.stat('hdTurns'); }   // 6
      if (e.code === 'KeyX' && !e.repeat) self.hdGoObjective();                                                            // 22
      if (e.code === 'Space' && !e.repeat && !self.hdHop) { self.hdHop = 0.0001; NV.sfx.pop && NV.sfx.pop(); NV.career.stat('hdHops'); }   // 28
      var dg = /^Digit([1-6])$/.exec(e.code);
      if (dg) self.hdEmote(+dg[1] - 1);                                                                                    // 29
    });
    // Zoomen med hjulet och tangenterna går mot ett målvärde (1)
    c.addEventListener('wheel', function (e) { if (!self.hd2d) return; self.hdDistT = Math.max(7, Math.min(26, self.hdDistT * (e.deltaY > 0 ? 1.12 : 0.89))); }, { passive: true });
    document.addEventListener('keydown', function (e) {
      if (!self.hd2d || (self.game.ui && self.game.ui.captures())) return;
      if (e.code === 'Equal' || e.code === 'NumpadAdd') self.hdDistT = Math.max(7, self.hdDistT * 0.88);
      if (e.code === 'Minus' || e.code === 'NumpadSubtract') self.hdDistT = Math.min(26, self.hdDistT * 1.12);
    });
  };

  // 22: gå till nästa mål (samma som pilen pekar på)
  W.hdGoObjective = function () {
    var o = this.game.objective && this.game.objective();
    if (!o) { this.game.ui.toast('Inget mål just nu.'); return; }
    var t = o.label && /^Åk till/.test(o.label) ? this.hdFindInter('travel') : null;
    if (t) this.hdGoUse(t.inter, t.x, t.z, true);
    else this.hdWalk(o.x, o.z, null, true);
    this.hdMark(o.x, o.z);
    NV.career.stat('hdAutoWalk');
  };
  W.hdFindInter = function (type) {
    var p = new THREE.Vector3(), best = null, bd = 1e9, self = this;
    this.interactables.forEach(function (o) {
      if (!o.userData.interact || o.userData.interact.type !== type) return;
      o.getWorldPosition(p);
      var d = Math.hypot(p.x - self.pos.x, p.z - self.pos.z);
      if (d < bd && (p.x > 50) === (self.site === 'boras')) { bd = d; best = { inter: o.userData.interact, x: p.x, z: p.z }; }
    });
    return best;
  };
  // 29: emotes ovanför figuren
  W.hdEmote = function (i) {
    var M = this.hdMore;
    if (M.emote) M.g.remove(M.emote);
    M.emote = NV.tex.label(EMO[i], { height: 0.42, size: 64, bg: 'rgba(255,255,255,0.9)' });
    M.emote.renderOrder = 42; M.g.add(M.emote); M.emoteT = 2.2;
    NV.sfx.pop && NV.sfx.pop();
    var d = NV.v8 && NV.v8.load ? NV.v8.load() : null;
    if (d) { d.hdEmotes = d.hdEmotes || {}; d.hdEmotes[i] = 1; NV.v8.save(d); NV.career.max('hdEmoteKinds', Object.keys(d.hdEmotes).length); }
  };
  // 23–24: pekaren och tipset följer musen
  W.hdCursor = function (x, y) {
    var ui = this.game.ui;
    this.canvas.style.cursor = this.hover ? 'pointer' : 'default';
    if (ui && ui.hint) { ui.hint.style.left = Math.min(window.innerWidth - 160, x + 18) + 'px'; ui.hint.style.top = (y + 14) + 'px'; }
  };

  // ------------------------------------------------------------------ Varje bildruta
  var ORIG_MOVE = W.move;
  W.move = function (dt) {
    if (!this.hd2d) return ORIG_MOVE.apply(this, arguments);
    var ui = this.game.ui, talking = ui && ui.talkingTo && this.people[ui.talkingTo];
    // 1: mjuk zoom
    this.hdDistT = this.hdDistT || 16;
    var zoomT = this.hdDistT;
    if (talking) zoomT = Math.min(zoomT, 10);                                          // 10: närbild vid samtal
    else if (this.consoleTarget && ui && ui.game.terminal && ui.game.terminal.open) zoomT = Math.min(zoomT, 11);   // 12: närbild vid konsolen
    this.hdDist += (zoomT - this.hdDist) * (1 - Math.exp(-dt * 6));
    // 4: flackare kamera nära, brantare långt bort (och inställd vinkel, 8)
    var base = (+S.get('hdPitch') || 40) * Math.PI / 180;
    this.hdPitchNow = base + (this.hdDist - 16) * 0.012;
    // 11: kameran centreras mellan dig och den du pratar med; 7: annars lite framför dig i gångriktningen
    if (talking) { var tp = talking.group.position; this.hdFocusGoal = { x: (this.pos.x + tp.x) / 2, z: (this.pos.z + tp.z) / 2 }; }
    else {
      var la = S.get('lookAhead') !== false ? 0.35 : 0;
      this.hdFocusGoal = { x: this.pos.x + this.vel.x * la, z: this.pos.z + this.vel.z * la };
    }
    // 13: ingen skakning med Minska rörelse
    if (reduce()) this.shakeA = 0;
    var r = ORIG_MOVE.apply(this, arguments);
    // 14: kameran andas lite när du står still
    if (!reduce() && this.vel.length() < 0.05) {
      this.hdIdle = (this.hdIdle || 0) + dt;
      this.camera.position.y += Math.sin(this.t * 0.6) * 0.03;
    } else this.hdIdle = 0;
    // 3: sparas när den ändrats
    this.hdSaveT = (this.hdSaveT || 0) + dt;
    if (this.hdSaveT > 2) { this.hdSaveT = 0; if (S.get('hdDist') !== Math.round(this.hdDistT * 10) / 10) set('hdDist', Math.round(this.hdDistT * 10) / 10); if (S.get('hdYaw') !== Math.round(this.hdYawT * 100) / 100) set('hdYaw', Math.round(this.hdYawT * 100) / 100); }
    return r;
  };

  // 25: går du mot någon som rör sig söker figuren en ny väg
  var ORIG_UPDATE = W.update;
  W.update = function (dt) {
    var r = ORIG_UPDATE.apply(this, arguments);
    if (!this.hd2d || !this.hdMore) return r;
    var self = this, M = this.hdMore, t = this.t, zone = this.zoneName || '', h = hour(this), ui = this.game.ui;
    if (this.hdTarget && this.hdTarget.inter && this.hdTarget.inter.type === 'npc') {
      var f = this.people[this.hdTarget.inter.id];
      this.hdRepath = (this.hdRepath || 0) + dt;
      if (f && this.hdRepath > 1 && Math.hypot(f.group.position.x - this.hdTarget.x, f.group.position.z - this.hdTarget.z) > 0.6) {
        this.hdRepath = 0; this.hdWalk(f.group.position.x, f.group.position.z, { inter: this.hdTarget.inter, x: f.group.position.x, z: f.group.position.z }, this.hdRun);
      }
    }
    // 21: vägen som prickar
    var showDots = S.get('hdPath') !== false && this.hdPath && this.hdPath.length;
    var k = 0;
    if (showDots) {
      var px = this.pos.x, pz = this.pos.z;
      for (var i = 0; i < this.hdPath.length && k < M.dots.length; i++) {
        var q = this.hdPath[i], len = Math.hypot(q.x - px, q.z - pz), n = Math.floor(len / 0.45);
        for (var s = 1; s <= n && k < M.dots.length; s++) { var d = M.dots[k++]; d.visible = true; d.position.set(px + (q.x - px) * s / n, 0.025, pz + (q.z - pz) * s / n); d.scale.setScalar(0.8 + 0.3 * Math.sin(t * 6 - k * 0.5)); }
        px = q.x; pz = q.z;
      }
    }
    for (; k < M.dots.length; k++) M.dots[k].visible = false;
    // 28: hopp
    var me = this.hdMe;
    if (this.hdHop) {
      this.hdHop += dt;
      var hy = Math.max(0, Math.sin(this.hdHop / 0.42 * Math.PI)) * 0.45;
      me.s.position.y = hy; me.sh.scale.setScalar(1 - hy * 0.8);                       // 34: skuggan krymper i luften
      if (this.hdHop > 0.42) { this.hdHop = 0; me.s.position.y = 0; me.sh.scale.setScalar(1); NV.sfx.thud && NV.sfx.thud(); }
    }
    // 31: rummets ljus på figurerna, 32: kvällsljus, 35: lite ljusare i solfläckarna
    var zt = ZONE_TINT[zone] || [1, 1, 1], warm = Math.max(0, Math.min(1, (h - 15) / 3));
    var sun = this.hdInSun(this.pos.x, this.pos.z) ? 1.12 : 1;
    me.s.material.color.setRGB(zt[0] * (1 + warm * 0.06) * sun, zt[1] * (1 - warm * 0.03) * sun, zt[2] * (1 - warm * 0.1) * sun);
    Object.keys(this.people).forEach(function (n) {
      var f = self.people[n], sp = f.hdSpr;
      if (!sp || !sp.g.visible) return;
      var hov = self.hlTarget && (self.hlTarget === f.group || self.hlTarget === f.hit);
      var b = hov ? 1.25 : 1;                                                              // 36: den du hovrar över lyser upp
      sp.s.material.color.setRGB(zt[0] * b, zt[1] * b, zt[2] * b);
      // 38: de som sitter och skriver gungar lite
      if (f.sitting && f.typing) sp.s.position.y += Math.abs(Math.sin(t * 9 + n.length)) * 0.012;
      // 39: den du pratar med vänder sig mot dig
      if (ui && ui.talkingTo === n) {
        var dir = H.screenDir(self.pos.x - f.group.position.x, self.pos.z - f.group.position.z, self.hdYaw);
        H.setFrame(sp, f.hdLook, n, dir, Math.sin(t * 8) > 0 ? 4 : 0, f.sitting, 0);
      }
    });
    // 37: pratbubbla
    var tt = ui && ui.talkingTo && this.people[ui.talkingTo];
    M.talk.visible = !!tt;
    if (tt) { M.talk.position.set(tt.group.position.x, (tt.sitting ? 1.75 : 2.15) + Math.sin(t * 4) * 0.03, tt.group.position.z); }
    // 40: figuren ser sig omkring när du står still länge
    if ((this.hdIdle || 0) > 6 && !this.hdPath) {
      var lk = Math.floor((this.hdIdle - 6) / 1.6) % 4;
      this.hdDir = [0, 2, 0, 3][lk];
      H.setFrame(me, H.PLAYER_LOOK, 'me', this.hdDir, 0, false, 0);
    }
    // 30: dammpuffar när du springer
    if (this.vel.length() > 4 && Math.random() < dt * 8 && this.fx && this.fx.dust) this.fx.dust({ x: this.pos.x, z: this.pos.z });
    // 33: siluetten syns bara när något skymmer dig
    M.ghost.material.map = me.s.material.map;
    M.ghost.position.y = me.s.position.y;
    M.ghost.visible = this.hdHidden();
    // 29: emoten följer med och tonar bort
    if (M.emote) { M.emoteT -= dt; M.emote.position.set(this.pos.x, 2.3 + (2.2 - M.emoteT) * 0.12, this.pos.z); M.emote.material.opacity = Math.min(1, M.emoteT * 2); if (M.emoteT <= 0) { M.g.remove(M.emote); M.emote = null; } }
    // ------------------------------------------------------------ Ljus (50–70)
    var mood = this.hdMood, rain = !!(this.ex && this.ex.weather === 'rain');
    var sunCol = new THREE.Color().setHSL(0.1 - warm * 0.05, 0.6 + warm * 0.3, 0.6);         // 50: solens färg följer tiden
    if (rain) sunCol.setRGB(0.6, 0.66, 0.75);                                                 // 51: grått och svagt när det regnar
    var cloud = 0.8 + 0.2 * Math.sin(t * 0.21) * Math.sin(t * 0.13 + 1);                        // 52: moln drar förbi
    mood.shafts.forEach(function (s) { if (s.material.color) { s.material.color.copy(sunCol).multiplyScalar(s.geometry.type === 'PlaneGeometry' ? 1.5 : 2.2); } if (s.material.userData.base !== undefined) s.material.opacity = s.material.userData.base * cloud * (rain ? 0.35 : 1); });
    mood.glows.forEach(function (gl, i) {
      if (i < 8) {                                                                             // 54: skärmarna flimrar när någon skriver
        var typing = Object.keys(self.people).some(function (n) { var f = self.people[n]; return f.typing && f.def.desk && Math.abs(gl.position.x - (self.builder.anchors.desks[f.def.desk] || {}).x) < 0.1; });
        gl.material.opacity = 0.3 + (typing ? Math.random() * 0.12 : 0);
      } else gl.material.color.setHSL(0.09 - warm * 0.03, 0.8, 0.55 + warm * 0.1);           // 53: lamporna varmare på kvällen
    });
    // 55: dammet följer partikelinställningen och grafiknivån
    var P = this.P || {}, dustOn = S.get('particles') !== false;
    mood.dust.visible = dustOn;
    mood.dust.material.size = 0.07 * (P.particles || 1);
    M.leds.forEach(function (l) { var on = Math.sin(t * (3 + l.userData.ph) + l.userData.ph * 7) > -0.2; l.material.opacity = on ? 0.7 : 0.08; });    // 64
    M.pools.forEach(function (p) { if (p.userData.flicker) p.material.opacity = Math.random() < 0.08 ? 0.02 : 0.1; });                           // 65
    M.glints.forEach(function (gl) {                                                                                                               // 67
      gl.userData.t -= dt;
      if (gl.userData.t <= 0) { var sp = self.hdSunSpot(); gl.userData.t = 0.6 + Math.random() * 2.5; if (sp && dustOn && !rain) { gl.position.set(sp.x + (Math.random() - 0.5) * 1.2, 0.05, sp.z + (Math.random() - 0.5) * 0.8); gl.userData.a = 0; } else gl.userData.a = -1; }
      if (gl.userData.a >= 0) { gl.userData.a += dt; gl.material.opacity = Math.max(0, Math.sin(gl.userData.a * 5)) * 0.9; gl.scale.setScalar(0.1 + gl.material.opacity * 0.12); } else gl.material.opacity = 0;
    });
    M.haze.forEach(function (hz, i) { hz.position.x += Math.sin(t * 0.1 + i) * dt * 0.1; hz.material.opacity = 0.06 + 0.03 * Math.sin(t * 0.3 + i); });    // 68
    var storm = this.ex && this.ex.storm;
    M.alarm.material.opacity = storm ? 0.25 + 0.25 * Math.sin(t * 8) : 0;                                                                         // 69
    M.coffee.material.opacity = 0.35 + 0.15 * Math.sin(t * 2);
    // 56: på låg grafik blir glöden enklare
    if (P.lambert) { M.glints.forEach(function (gl) { gl.visible = false; }); M.haze.forEach(function (hz) { hz.visible = false; }); }
    // 42: ficklampan lyser från dig, inte från kameran
    var ex = this.ex;
    if (ex && ex.torch && ex.torch.isLight && ex.torch.parent === this.camera) { this.scene.attach(ex.torch); this.scene.attach(ex.torch.target); }
    if (ex && ex.torchOn && ex.torch && ex.torch.isLight && ex.torch.parent !== this.camera) { ex.torch.position.set(this.pos.x, 2.2, this.pos.z); if (ex.torch.target) { ex.torch.target.position.set(this.pos.x - Math.sin(this.hdYaw) * (this.hdDir === 1 ? 1 : -1) * 2, 0, this.pos.z - Math.cos(this.hdYaw) * (this.hdDir === 1 ? 1 : -1) * 2); ex.torch.target.updateMatrixWorld(); } }
    // 57: tilt-shift-styrka och fokus på den du pratar med
    if (this.post) {
      var amt = S.get('tiltShift') === false ? 0 : (S.get('tiltAmount') === undefined ? 1 : +S.get('tiltAmount'));
      this.post.u.uTilt.value = amt;
      if (tt) { var v = new THREE.Vector3((this.pos.x + tt.group.position.x) / 2, 1, (this.pos.z + tt.group.position.z) / 2).project(this.camera); this.post.u.uFocus.value += ((v.y + 1) / 2 - this.post.u.uFocus.value) * 0.15; }
    }
    // 58: rumsbesök räknas till en prestation
    var d8 = NV.v8 && NV.v8.load ? NV.v8.load() : null;
    if (d8 && zone && !(d8.hdRooms || {})[zone]) { d8.hdRooms = d8.hdRooms || {}; d8.hdRooms[zone] = 1; NV.v8.save(d8); NV.career.max('hdRooms', Object.keys(d8.hdRooms).length); }
    return r;
  };
  // Står du i en solfläck?
  W.hdInSun = function (x, z) {
    var sem = this.builder.sem || [];
    for (var i = 0; i < sem.length; i++) {
      var s = sem[i]; if (s.type !== 'window') continue;
      var ix = Math.sin(s.ry), iz = Math.cos(s.ry), cx = s.x + ix * (2.8 - s.h * 0.3), cz = s.z + iz * (2.8 - s.h * 0.3);
      if (Math.abs(x - cx) < s.w * 0.6 && Math.abs(z - cz) < s.w * 0.6) return true;
    }
    return false;
  };
  W.hdSunSpot = function () {
    var self = this, wins = (this.builder.sem || []).filter(function (s) { return s.type === 'window' && Math.hypot(s.x - self.pos.x, s.z - self.pos.z) < 14; });
    if (!wins.length) return null;
    var s = wins[Math.floor(Math.random() * wins.length)], ix = Math.sin(s.ry), iz = Math.cos(s.ry);
    return { x: s.x + ix * (2.8 - s.h * 0.3), z: s.z + iz * (2.8 - s.h * 0.3) };
  };
  // Skyms figuren? En stråle från kameran till figuren som träffar något högt.
  // 164: kontrollen görs var sjätte bildruta, inte varje
  var rc = new THREE.Raycaster();
  W.hdHidden = function () {
    this.hdHidT = (this.hdHidT || 0) + 1;
    if (this.hdHidT % 6 !== 0) return !!this.hdHidLast;
    var to = new THREE.Vector3(this.pos.x, 1.0, this.pos.z), from = this.camera.position;
    rc.set(from, to.clone().sub(from).normalize()); rc.far = from.distanceTo(to) - 0.6; rc.camera = this.camera;
    var hits = rc.intersectObjects(this.scene.children, true), hid = false;
    for (var i = 0; i < hits.length && !hid; i++) { var o = hits[i].object; if (o.isMesh && o.visible && !o.userData.hdNoCut && hits[i].point.y > 1.15 && !(o.material && o.material.transparent)) hid = true; }
    this.hdHidLast = hid;
    return hid;
  };

  // 26: "Dit kommer du inte" som flytande text där du klickade
  var ORIG_WALK = W.hdWalk;
  W.hdWalk = function (x, z, then, run) {
    var ui = this.game.ui, toast = ui.toast, self = this, failed = false;
    ui.toast = function (m) { if (/Dit kommer du inte/.test(m)) { failed = true; return; } return toast.apply(ui, arguments); };
    try { ORIG_WALK.apply(this, arguments); } finally { ui.toast = toast; }
    if (failed) { if (this.fx && this.fx.popup) this.fx.popup('Dit kommer du inte', new THREE.Vector3(x, 0.8, z), { color: '#ffb4a8', height: 0.14, life: 1.4 }); NV.sfx.fail && NV.sfx.fail(); }   // 27: ljud
    else if (this.hdPath) { NV.sfx.click(); if (then) this.hdFace(x, z); }   // 20: vänder sig mot målet direkt
    void self;
  };
  // 43: E utan något i närheten säger det
  var ORIG_USE = W.use;
  W.use = function () {
    if (!this.hd2d) return ORIG_USE.apply(this, arguments);
    var before = this.hdDir, called = false, g = this.game, orig = g.onInteract;
    g.onInteract = function () { called = true; return orig.apply(this, arguments); };
    try { ORIG_USE.apply(this, arguments); } finally { g.onInteract = orig; }
    if (!called) { if (this.fx && this.fx.popup) this.fx.popup('Inget här – klicka eller tryck X', new THREE.Vector3(this.pos.x, 2.3, this.pos.z), { color: '#cfe3ff', height: 0.1, life: 1.6 }); }
    void before;
  };
  // 44: minikartan: klicka för att gå dit
  NV.afterGame(function () {
    var g = NV.game;
    if (!g) return;
    var origWp = g.setWaypoint;
    g.setWaypoint = function (x, z) {
      var r = origWp.apply(this, arguments);
      if (this.world && this.world.hd2d) { this.world.hdWalk(x, z, null, true); this.world.hdMark(x, z); }
      return r;
    };
    // 59–63: prestationer för HD-2D
    var A = NV.career.ACH;
    [
      ['hdRooms', 'Diorama-turist', 'Besök alla rum i HD-2D.', '🏠', function (s) { return s.hdRooms >= 8; }],
      ['hdTurns', 'Kamerasnurr', 'Vrid kameran 8 gånger i HD-2D (Q och Z).', '🎥', function (s) { return s.hdTurns >= 8; }],
      ['hdAuto', 'Vägvisaren', 'Gå till nästa mål med X fem gånger.', '🧭', function (s) { return s.hdAutoWalk >= 5; }],
      ['hdHop', 'Skuttaren', 'Hoppa 20 gånger i HD-2D.', '🐇', function (s) { return s.hdHops >= 20; }],
      ['hdEmotes', 'Pixelmimare', 'Använd alla sex emotes i HD-2D.', '🎭', function (s) { return s.hdEmoteKinds >= 6; }],
    ].forEach(function (a) { if (!A.some(function (x) { return x[0] === a[0]; })) A.push(a); });
  });
})();

// ------------------------------------------------------------------ HD-2D, del 2 (45–49 och 70–90)
(function () {
  if (!NV.World || !NV.hd2d) return;
  var W = NV.World.prototype, H = NV.hd2d, S = NV.settings;
  var ICON = { console: '🔌', npc: '💬', cable: '⚡', deskcable: '⚡', pc: '🖥', laptop: '💻', travel: '🚗', coffee: '☕', crab: '🦀', rack: '🗄', monitor: '📈', whiteboard: '📋', phone: '📱', miniswitch: '📦', water: '💧', snack: '🍫', printer: '🖨' };
  var iconTex = {};   // 167: ikonernas texturer ritas en gång och återanvänds
  function icon(ch) {
    if (iconTex[ch]) return iconTex[ch];
    var c = document.createElement('canvas'); c.width = c.height = 64; var g = c.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fill();
    g.font = '34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 32, 35);
    var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return (iconTex[ch] = t);
  }

  var ORIG_INIT = W.initHdMore;
  W.initHdMore = function () {
    ORIG_INIT.apply(this, arguments);
    var M = this.hdMore, self = this;
    // 72: små ikoner över det du kan använda i närheten
    M.icons = [];
    for (var i = 0; i < 4; i++) { var s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, fog: false })); s.scale.set(0.32, 0.32, 1); s.renderOrder = 39; s.visible = false; M.g.add(s); M.icons.push(s); }
    // 89–90: ring under muspekaren (röd där du inte kan gå)
    M.cursor = new THREE.Mesh(new THREE.RingGeometry(0.14, 0.2, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }));
    M.cursor.rotation.x = -Math.PI / 2; M.cursor.userData.hdNoCut = true; M.g.add(M.cursor);
    // 86: målet pulserar på golvet
    M.goal = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.45, 32), new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.6, depthWrite: false }));
    M.goal.rotation.x = -Math.PI / 2; M.goal.userData.hdNoCut = true; M.g.add(M.goal);
    // 70: krabban får ett sken så att den syns ovanifrån
    M.crab = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshBasicMaterial({ map: H.fx('glow'), color: 0xff6a4a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    M.crab.rotation.x = -Math.PI / 2; M.crab.userData.hdNoCut = true; M.g.add(M.crab);
    // 71: monitorväggen i serverrummet lyser
    var mw = this.builder.anchors.monitorWall;
    if (mw) { var gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: H.fx('glow'), color: 0x8fd0ff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false })); gl.position.set(mw.x, mw.y, mw.z + 0.3); gl.scale.set(2.4, 1.6, 1); M.g.add(gl); M.monGlow = gl; }
    // 85: pil vid bildkanten mot målet
    M.edge = document.createElement('div'); M.edge.className = 'hd-edge hidden'; M.edge.innerHTML = '<span>➤</span><b></b>';
    document.body.appendChild(M.edge);
    // 88: X igen avbryter
    document.addEventListener('keydown', function (e) { if (self.hd2d && e.code === 'KeyX' && self.hdAuto && self.hdPath && !e.repeat) { self.hdPath = null; self.hdTarget = null; self.hdAuto = false; e.stopImmediatePropagation(); } }, true);
    this.canvas.addEventListener('mouseleave', function () { self.hdMouseIn = false; });
  };
  // 87: X säger vart du går
  var ORIG_GO = W.hdGoObjective;
  W.hdGoObjective = function () {
    var o = this.game.objective && this.game.objective();
    ORIG_GO.apply(this, arguments);
    if (o && this.hdPath) { this.hdAuto = true; this.game.ui.toast('🧭 Går till: ' + o.label + ' (X avbryter)'); }
  };
  // 49: guldring när du klickar på något, vit på golvet
  var ORIG_MARK = W.hdMark;
  W.hdMark = function (x, z) {
    ORIG_MARK.apply(this, arguments);
    if (this.hdRing) this.hdRing.material.color.setHex(this.hdTarget ? 0xffc83a : 0xffffff);
  };
  // 48: tipset säger "Klicka"
  NV.afterGame(function () {
    var g = NV.game; if (!g || !g.ui) return;
    var ui = g.ui, orig = ui.setHint;
    if (!orig) return;
    ui.setHint = function () { var r = orig.apply(this, arguments); if (g.world && g.world.hd2d && this.hint && /^E – /.test(this.hint.textContent)) this.hint.textContent = this.hint.textContent.replace(/^E – /, 'Klicka – '); return r; };
  });

  var ORIG_UPDATE = W.update;
  W.update = function (dt) {
    var r = ORIG_UPDATE.apply(this, arguments);
    if (!this.hd2d || !this.hdMore) { if (this.hdMore && this.hdMore.edge) this.hdMore.edge.classList.add('hidden'); return r; }
    var self = this, M = this.hdMore, t = this.t, ui = this.game.ui, p = new THREE.Vector3();
    // 47: ingen gul låda runt figurerna i HD-2D
    if (this.hl.visible && this.hover && this.hover.type === 'npc') this.hl.visible = false;
    // 45–46: namnskyltar: den du hovrar över syns alltid, de långt bort tonas ut
    Object.keys(this.people).forEach(function (n) {
      var f = self.people[n];
      if (!f.tag) return;
      var hov = self.hover && self.hover.type === 'npc' && self.hover.id === n;
      var d = Math.hypot(f.group.position.x - self.pos.x, f.group.position.z - self.pos.z);
      f.tag.material.opacity = hov ? 1 : Math.max(0, Math.min(f.tag.material.opacity, (11 - d) / 4));
      if (f.roleTag) f.roleTag.material.opacity = hov ? 1 : f.roleTag.material.opacity;
    });
    // 72: ikoner över de tre närmaste sakerna du kan använda
    var near = [];
    this.interactables.forEach(function (o) {
      var it = o.userData.interact; if (!it || !o.visible || it.type === 'npc' || !ICON[it.type]) return;
      o.getWorldPosition(p);
      var d = Math.hypot(p.x - self.pos.x, p.z - self.pos.z);
      if (d < 3.5 && !near.some(function (q) { return Math.hypot(q.x - p.x, q.z - p.z) < 0.6; })) near.push({ x: p.x, y: p.y, z: p.z, d: d, ic: ICON[it.type] });
    });
    near.sort(function (a, b) { return a.d - b.d; });
    M.icons.forEach(function (s, i) { var q = near[i]; s.visible = !!q && S.get('hdIcons') !== false; if (q) { s.material.map = icon(q.ic); s.material.needsUpdate = true; s.position.set(q.x, Math.max(q.y, 0.8) + 0.55 + Math.sin(t * 3 + i) * 0.05, q.z); s.material.opacity = Math.min(1, (3.5 - q.d) * 0.8); } });
    // 89–90: ringen under muspekaren
    var mc = M.cursor; mc.visible = false;
    if (this.hdMouseIn && !this.hover && !(ui && ui.captures())) {
      this.raycaster.setFromCamera(this.hdMouse, this.camera);
      var ray = this.raycaster.ray, tt = ray.direction.y < -1e-4 ? -ray.origin.y / ray.direction.y : -1;
      if (tt > 0) {
        var gx = ray.origin.x + ray.direction.x * tt, gz = ray.origin.z + ray.direction.z * tt;
        mc.visible = true; mc.position.set(gx, 0.02, gz);
        mc.material.color.setHex(this.collides(gx, gz, 0.2) ? 0xff5a4f : 0xffffff);
      }
    }
    // 86: målet pulserar; 85: pil vid kanten när målet inte syns
    var o = this.game.objective && this.game.objective();
    M.goal.visible = !!o && S.get('difficulty') !== 'hard';
    if (o) {
      M.goal.position.set(o.x, 0.02, o.z); M.goal.scale.setScalar(1 + 0.15 * Math.sin(t * 3)); M.goal.material.opacity = 0.35 + 0.25 * Math.sin(t * 3);
      var v = new THREE.Vector3(o.x, 1, o.z).project(this.camera);
      var off = Math.abs(v.x) > 0.92 || Math.abs(v.y) > 0.88 || v.z > 1;
      M.edge.classList.toggle('hidden', !off || !!(ui && ui.captures()) || S.get('difficulty') === 'hard');
      if (off) {
        if (v.z > 1) { v.x = -v.x; v.y = -v.y; }
        var a = Math.atan2(v.y, v.x), ex = Math.cos(a), ey = Math.sin(a), k = Math.min(0.9 / Math.abs(ex || 1e-3), 0.85 / Math.abs(ey || 1e-3));
        M.edge.style.left = ((ex * k + 1) / 2 * window.innerWidth) + 'px'; M.edge.style.top = ((1 - ey * k) / 2 * window.innerHeight) + 'px';
        M.edge.querySelector('span').style.transform = 'rotate(' + (-a) + 'rad)';
        M.edge.querySelector('b').textContent = o.label;
      }
    } else M.edge.classList.add('hidden');
    // 70: krabbans sken
    var crab = this.ex && this.ex.crab && this.ex.crab.g;
    M.crab.visible = !!(crab && crab.visible && crab.parent);
    if (M.crab.visible) { crab.getWorldPosition(p); M.crab.position.set(p.x, 0.02, p.z); M.crab.material.opacity = 0.4 + 0.2 * Math.sin(t * 5); }
    if (M.monGlow) M.monGlow.material.opacity = 0.3 + 0.08 * Math.sin(t * 1.3);
    // 73: i pausmenyn snurrar kameran långsamt runt dig
    if (ui && ui.pauseOpen && ui.pauseOpen()) { this.hdYawT += dt * 0.15; this.hdYaw = this.hdYawT; this.hdPaused = true; }
    else if (this.hdPaused) { this.hdPaused = false; this.hdYawT = Math.round(this.hdYawT / (Math.PI / 4)) * Math.PI / 4; }
    // 74: när en vecka startar sveper kameran in
    var wk = this.game.week;
    if (wk && wk !== this.hdWeek) { this.hdWeek = wk; if (!NV.settings.get('reduceMotion')) { this.hdDist = 26; } }
    // 77: dammet yr i Borås när du går
    if (this.site === 'boras' && this.vel.length() > 1 && Math.random() < dt * 3 && this.fx && this.fx.dust) this.fx.dust({ x: this.pos.x, z: this.pos.z });
    // 78–81: figurerna gungar i takt med stegen, och landar mjukt efter hopp
    var me = this.hdMe;
    if (!this.hdHop) {
      var bob = this.hdMoving ? Math.abs(Math.sin((this.hdWalkPh || 0) * Math.PI / 2)) * (this.vel.length() > 4 ? 0.06 : 0.025) : 0;
      me.s.position.y = bob;
      this.hdLand = Math.max(0, (this.hdLand || 0) - dt * 5);
    }
    if (this.hdWasHop && !this.hdHop) this.hdLand = 1;
    this.hdWasHop = !!this.hdHop;
    var sz = (+S.get('hdSpriteScale') || 1);                                          // 82: figurstorlek
    var sq = this.hdLand || 0;
    me.s.scale.set((NV.art2d.FW + 2) * H.PX * sz * (1 + sq * 0.12), (NV.art2d.FH + 2) * H.PX * sz * (1 - sq * 0.12), 1);
    Object.keys(this.people).forEach(function (n) {
      var f = self.people[n], sp = f.hdSpr; if (!sp) return;
      sp.s.scale.set((NV.art2d.FW + 2) * H.PX * sz, (NV.art2d.FH + 2) * H.PX * sz, 1);
      if (f.speed > 0.05) sp.s.position.y += Math.abs(Math.sin((f.walkPh || 0) * Math.PI)) * 0.03;
    });
    return r;
  };
  // 75–76: prestation ger konfetti och ny nivå en gnistring runt figuren
  NV.afterGame(function () {
    var g = NV.game; if (!g) return;
    var ui = g.ui, origToast = ui.toast;
    ui.toast = function (msg) {
      var w = g.world;
      if (w && w.hd2d && w.fx && typeof msg === 'string') {
        var at = new THREE.Vector3(w.pos.x, 1.2, w.pos.z);
        if (/Prestation/.test(msg) && w.fx.confetti) w.fx.confetti(at, 40);
        if (/[Nn]y nivå|Nivå \d|nivå upp/.test(msg) && w.fx.ring) { w.fx.ring(new THREE.Vector3(w.pos.x, 0.1, w.pos.z), 0xffd54a, 1.2); w.fx.sparks && w.fx.sparks(at, 24, 0xffe08a); }
      }
      return origToast.apply(this, arguments);
    };
  });
  // 83–84: vridsteg (45° eller 90°) och Shift+Q/Z för små steg
  document.addEventListener('keydown', function (e) {
    var w = NV.game && NV.game.world;
    if (!w || !w.hd2d || (NV.game.ui && NV.game.ui.captures())) return;
    if (e.code !== 'KeyQ' && e.code !== 'KeyZ') return;
    var step = e.shiftKey ? Math.PI / 12 : (S.get('hdTurnStep') === 90 ? Math.PI / 2 : Math.PI / 4);
    // hd2d.js har redan vridit 45°; justera till rätt steg
    w.hdYawT += (e.code === 'KeyQ' ? 1 : -1) * (step - Math.PI / 4);
  });
})();
