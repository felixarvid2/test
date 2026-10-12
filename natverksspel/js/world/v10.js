// Version 10: förbättringar av 3D-läget och sådant som gäller både 3D och HD-2D (punkt 91–200 i README).
// Numren i kommentarerna följer listan.
(function () {
  if (!NV.World) return;
  var W = NV.World.prototype, S = NV.settings;
  function hour(w) { return 8 + (w.game.state ? w.game.state.time : 0) / 3600; }
  function reduce() { return S.get('reduceMotion') === true; }
  var EMO = ['👋', '👍', '😂', '😮', '❤️', '🤔'];
  var TYPE_COL = { console: 0x4fc3f7, npc: 0xffd54a, cable: 0xff9f43, deskcable: 0xff9f43, travel: 0x7ee08a, coffee: 0xc58b5a, crab: 0xff5a4f, pc: 0x9ecbff, laptop: 0x9ecbff };

  // ------------------------------------------------------------------ Handkontroll (91–104, 186–189, 197)
  var pad = { on: false, prev: {}, last: 0, used: false };
  function btn(gp, i) { var b = gp.buttons[i]; return !!(b && (b.pressed || b.value > 0.5)); }
  function axis(gp, i) { var v = gp.axes[i] || 0; return Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82; }   // 103: dödzon
  window.addEventListener('gamepadconnected', function (e) {
    pad.on = true;
    if (NV.game && NV.game.ui) NV.game.ui.toast('🎮 Handkontroll ansluten: ' + (e.gamepad.id || '').split('(')[0].trim() + '. Ⓐ använd · Ⓑ stäng · Ⓧ mål · Ⓨ glasögon · Start meny.');   // 101
    NV.sfx.bell && NV.sfx.bell();                                                                                                 // 161
  });
  window.addEventListener('gamepadconnected', function () { NV.career.stat('pad'); });                                           // 153
  W.padPoll = function (dt) {
    var gps = navigator.getGamepads ? navigator.getGamepads() : [], gp = null;
    for (var i = 0; i < gps.length; i++) if (gps[i] && gps[i].connected) { gp = gps[i]; break; }
    if (!gp) { this.padMove = null; return; }
    var g = this.game, ui = g.ui, P = pad.prev, now = {}, sens = +S.get('padSens') || 1;
    for (var b = 0; b < 17; b++) now[b] = btn(gp, b);
    function pressed(b) { return now[b] && !P[b]; }
    var lx = axis(gp, 0), ly = axis(gp, 1), rx = axis(gp, 2), ry = axis(gp, 3);
    if (lx || ly || rx || ry || Object.keys(now).some(function (k) { return now[k]; })) { pad.used = true; document.body.classList.add('pad'); }
    var cap = ui && ui.captures();
    if (pressed(9)) { if (ui.pauseOpen()) ui.hidePause(); else if (!cap) ui.showPause(); }                                         // 99
    if (pressed(1)) { if (ui.dialogOpen && ui.dialogOpen() && !ui.dialogLocked) ui.closeDialog(); else if (g.terminal.open) g.terminal.hide(); else if (ui.pauseOpen()) ui.hidePause(); }   // 94
    if (cap) { pad.prev = now; this.padMove = null; return; }
    if (pressed(0)) { this.use(); if (S.get('padRumble') !== false && gp.vibrationActuator && gp.vibrationActuator.playEffect) try { gp.vibrationActuator.playEffect('dual-rumble', { duration: 60, strongMagnitude: 0.3, weakMagnitude: 0.5 }); } catch (e) { /* stöds inte */ } }   // 93, 102
    if (pressed(2)) { if (this.hd2d) this.hdGoObjective(); else this.showRoute(); }                                                // 95
    if (pressed(3)) g.toggleGoggles && g.toggleGoggles();                                                                         // 96
    if (pressed(8)) ui.mapDialog && ui.mapDialog();                                                                               // 100
    if (this.hd2d) {
      if (pressed(4)) this.hdYawT += Math.PI / 4;                                                                                  // 97
      if (pressed(5)) this.hdYawT -= Math.PI / 4;
      var z = (gp.buttons[7] ? gp.buttons[7].value : 0) - (gp.buttons[6] ? gp.buttons[6].value : 0);                               // 98
      if (z) this.hdDistT = Math.max(7, Math.min(26, (this.hdDistT || 16) * (1 - z * dt * 1.2)));
      if (pressed(12)) this.hdDistT = Math.max(7, (this.hdDistT || 16) * 0.85);                                                    // 186
      if (pressed(13)) this.hdDistT = Math.min(26, (this.hdDistT || 16) * 1.15);
      if (rx) this.hdYawT -= rx * dt * 2.2 * sens, this.hdYaw = this.hdYawT;                                                       // 92
      if (pressed(11) && !this.hdHop) { this.hdHop = 0.0001; NV.sfx.pop && NV.sfx.pop(); }                                        // 187
    } else {
      if (rx || ry) { this.tYaw -= rx * dt * 2.6 * sens; this.tPitch = Math.max(-1.45, Math.min(1.45, this.tPitch - ry * dt * 2.0 * sens)); }   // 92
      if (pressed(5) && this.ex) this.ex.toggleTorch();                                                                           // 97
      this.zoomHeld = (gp.buttons[7] ? gp.buttons[7].value : 0) > 0.5;                                                              // 98
      if (pressed(11)) { this.keys.Space = true; if (this.jumpY === 0) this.vy = 3.3; }                                             // 187
    }
    if (pressed(10)) this.padRun = !this.padRun;                                                                                   // 188
    if (pressed(14)) this.emote(0); if (pressed(15)) this.emote(1);                                                               // 197
    this.padMove = (lx || ly) ? { x: lx, y: ly } : null;                                                                           // 91
    pad.prev = now;
  };
  // Styrspaken läggs ihop med pekskärmens styrspak, som rörelsekoden redan läser
  var ORIG_MOVE = W.move;
  W.move = function (dt) {
    var T = NV.touch, saved = null;
    if (this.padMove && T) { saved = { x: T.joy.x, y: T.joy.y }; T.joy.x = this.padMove.x; T.joy.y = this.padMove.y; }
    var runSaved = this.game.touchRun;
    if (this.padRun) this.game.touchRun = true;
    // 105–106, 198: hjulet zoomar mjukt i 3D, och zoomen släpper när du springer
    if (!this.hd2d && this.wheelZoom) {
      var k = this.keys, sprint = k.ShiftLeft || k.ShiftRight;
      if (sprint && this.vel.length() > 3) this.wheelZoom = 0;
    }
    try { ORIG_MOVE.apply(this, arguments); }
    finally { if (saved) { T.joy.x = saved.x; T.joy.y = saved.y; } this.game.touchRun = runSaved; }
    if (!this.hd2d) {
      var wz = this.wheelZoom || 0;
      this.wzNow = (this.wzNow || 0) + (wz - (this.wzNow || 0)) * (1 - Math.exp(-dt * 8));
      if (Math.abs(this.wzNow) > 0.001 && !this.zoomed) { this.camera.fov = NV.settings.get('fov') * (1 - this.wzNow * 0.5); this.camera.updateProjectionMatrix(); }
      // 118: kameran lutar lite framåt när du springer
      var run = this.vel.length() > 4 && !reduce();
      this.runTilt = (this.runTilt || 0) + ((run ? -0.035 : 0) - (this.runTilt || 0)) * (1 - Math.exp(-dt * 4));
      this.camera.rotation.x += this.runTilt;
      // 134–135: vid samtal vänder sig kameran mot kollegan och zoomar in lite
      var tt = this.game.ui && this.game.ui.talkingTo && this.people[this.game.ui.talkingTo];
      if (tt && !this.locked) {
        var gp = tt.group.position, want = Math.atan2(-(gp.x - this.pos.x), -(gp.z - this.pos.z));
        var d = want - this.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        if (!this.talkTurned) { this.tYaw += d * Math.min(1, dt * 3); if (Math.abs(d) < 0.05) this.talkTurned = true; }
        this.camera.fov += (NV.settings.get('fov') * 0.88 - this.camera.fov) * (1 - Math.exp(-dt * 3)); this.camera.updateProjectionMatrix();
      } else this.talkTurned = false;
      // 119: hur mycket kameran gungar
      var bobK = S.get('bobAmount') === undefined ? 1 : +S.get('bobAmount');
      if (bobK !== 1 && this.bobAmp) { var off = (this.camera.position.y - this.eye - (this.jumpY || 0) - (this.landY || 0)); this.camera.position.y -= off * (1 - bobK); }
    }
  };
  document.addEventListener('wheel', function (e) {
    var w = NV.game && NV.game.world;
    if (!w || w.hd2d || NV.game.mode !== '3d' || !w.active || (NV.game.ui && NV.game.ui.captures())) return;
    if (e.target !== w.canvas && !w.locked) return;
    w.wheelZoom = Math.max(0, Math.min(0.75, (w.wheelZoom || 0) + (e.deltaY < 0 ? 0.15 : -0.15)));
    NV.career.stat('wheelZooms');                                                                                                  // 158
  }, { passive: true });

  // ------------------------------------------------------------------ Rutt till målet i 3D (107–109, 159, 200)
  W.showRoute = function () {
    var o = this.game.objective && this.game.objective();
    if (!o || !this.findPath) { this.game.ui.toast('Inget mål just nu.'); return; }
    var p = this.findPath(this.pos.x, this.pos.z, o.x, o.z);
    if (!p || !p.pts.length) { this.game.ui.toast('Hittar ingen väg dit.'); return; }
    if (!this.routeG) { this.routeG = new THREE.Group(); this.routeG.userData.dynamic = true; this.scene.add(this.routeG); this.routeMat = new THREE.MeshBasicMaterial({ color: 0x7fe0ff, transparent: true, opacity: 0.9, depthWrite: false }); }
    while (this.routeG.children.length) this.routeG.remove(this.routeG.children[0]);
    var pts = [{ x: this.pos.x, z: this.pos.z }].concat(p.pts), geo = new THREE.CircleGeometry(0.07, 10);
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i], len = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.floor(len / 0.5));
      for (var s = 1; s <= n; s++) { var d = new THREE.Mesh(geo, this.routeMat); d.rotation.x = -Math.PI / 2; d.position.set(a.x + (b.x - a.x) * s / n, 0.025, a.z + (b.z - a.z) * s / n); d.userData.k = this.routeG.children.length; d.userData.hdNoCut = true; this.routeG.add(d); }
    }
    this.routeT = 12; this.routeGoal = o;                                                                                          // 108
    this.game.ui.toast('🧭 Vägen till ' + o.label + ' visas på golvet (' + Math.round(p.len) + ' m).');                             // 200
    NV.sfx.zone && NV.sfx.zone();                                                                                                   // 159
    NV.career.stat('routes');
  };
  W.updateRoute = function (dt) {
    if (!this.routeG || !this.routeT) return;
    this.routeT -= dt;
    var t = this.t, self = this, near = 1e9;
    this.routeG.children.forEach(function (d) { d.scale.setScalar(0.8 + 0.35 * Math.max(0, Math.sin(t * 5 - d.userData.k * 0.35))); near = Math.min(near, Math.hypot(d.position.x - self.pos.x, d.position.z - self.pos.z)); });
    this.routeMat.opacity = Math.min(0.9, this.routeT / 2);
    var o = this.routeGoal;
    if (this.routeT <= 0 || (o && Math.hypot(o.x - this.pos.x, o.z - this.pos.z) < 1.5)) { this.routeT = 0; while (this.routeG.children.length) this.routeG.remove(this.routeG.children[0]); }
    else if (near > 2.2 && this.routeT < 11) { var keep = this.routeT; this.showRoute(); this.routeT = keep; }                    // 109
  };

  // ------------------------------------------------------------------ Emotes (110–111, 160, 194–196)
  W.emote = function (i) {
    if ((this.emoteCd || 0) > 0) return;                                                                                            // 196
    this.emoteCd = 1;
    if (this.hd2d && this.hdEmote) this.hdEmote(i);
    else if (this.fx && this.fx.popup) { this.fx.popup(EMO[i], this.front(1.2, 0.1), { height: 0.22, life: 2 }); NV.sfx.pop && NV.sfx.pop(); }   // 110, 160
    if (i !== 0) return;
    // 111: kollegor nära dig vinkar tillbaka
    var self = this, waved = false;
    Object.keys(this.people).forEach(function (n) {
      var f = self.people[n]; if (!f.group.visible) return;
      if (Math.hypot(f.group.position.x - self.pos.x, f.group.position.z - self.pos.z) < 4.5) {
        f.gestKind = 'wave'; f.gest = 1.8; waved = true;
        if (self.fx && self.fx.popup) self.fx.popup('😊', new THREE.Vector3(f.group.position.x, f.sitting ? 1.7 : 2.1, f.group.position.z), { height: 0.18, life: 1.6 });   // 194–195
      }
    });
    if (waved) NV.career.stat('wavesBack');                                                                                        // 157
  };
  document.addEventListener('keydown', function (e) {
    var g = NV.game, w = g && g.world;
    if (!w || g.mode !== '3d' || !w.active || (g.ui && g.ui.captures())) return;
    var dg = /^Digit([1-6])$/.exec(e.code);
    if (dg && !w.hd2d) w.emote(+dg[1] - 1);
    if (dg && w.hd2d && +dg[1] === 1) { w.emoteCd = 0; w.emote(0); }   // 👋 i HD-2D får också svar
    if (e.code === 'KeyX' && !w.hd2d && !e.repeat) w.showRoute();       // 107
    if ((e.code === 'AltLeft' || e.code === 'AltRight') && !e.repeat) { w.altHeld = true; NV.sfx.tap && NV.sfx.tap(0.03); e.preventDefault(); }   // 112, 162
  });
  document.addEventListener('keyup', function (e) { var w = NV.game && NV.game.world; if (w && (e.code === 'AltLeft' || e.code === 'AltRight')) w.altHeld = false; });
  window.addEventListener('blur', function () { var w = NV.game && NV.game.world; if (w) w.altHeld = false; });
  function cycleView(g) {
    var order = ['2d', 'hd2d', '3d'], cur = g.viewName ? g.viewName() : g.mode, next = order[(order.indexOf(cur) + 1) % 3];
    if (next !== '2d' && !g.webgl) next = '2d';
    NV.settings.set('modeChosen', true);
    g.setMode(next);
    g.ui.toast('Visning: ' + { '2d': '2D', hd2d: 'HD-2D', '3d': '3D (förstaperson)' }[next] + ' (F4 byter)');                     // 137
    NV.sfx.whoosh && NV.sfx.whoosh();                                                                                              // 163
  }
  // 136: F4 byter visning i alla lägen
  document.addEventListener('keydown', function (e) { var g = NV.game; if (g && e.code === 'F4' && !(g.ui && g.ui.captures())) { e.preventDefault(); cycleView(g); } });

  // ------------------------------------------------------------------ Alt: allt du kan använda (112–113, 192–193)
  function visibleUp(o) { while (o) { if (!o.visible) return false; o = o.parent; } return true; }
  W.updateAlt = function () {
    var on = this.altHeld && !(this.game.ui && this.game.ui.captures());
    if (!this.altG) { if (!on) return; this.altG = new THREE.Group(); this.altG.userData.dynamic = true; this.scene.add(this.altG); this.altBoxes = []; this.altLabels = []; }
    this.altG.visible = !!on;
    if (!on) return;
    var self = this, p = new THREE.Vector3(), list = [];
    var seen = {};
    this.interactables.forEach(function (o) {
      var it = o.userData.interact; if (!it || !visibleUp(o)) return;
      // En kollega räknas en gång, med klickytan som ruta
      var tgt = o;
      if (it.type === 'npc') { if (seen[it.id]) return; seen[it.id] = 1; var f = self.people[it.id]; if (!f || !f.group.visible) return; tgt = f.hit || f.group; }
      tgt.getWorldPosition(p);
      var d = Math.hypot(p.x - self.pos.x, p.z - self.pos.z);
      if (d < 6.5 && (p.x > 50) === (self.site === 'boras') && !list.some(function (q) { return q.o === tgt; })) list.push({ o: tgt, it: it, d: d });
    });
    list.sort(function (a, b) { return a.d - b.d; });
    list = list.slice(0, 14);
    while (this.altBoxes.length < list.length) {
      var bh = new THREE.BoxHelper(undefined, 0xffffff); bh.material.depthTest = false; bh.renderOrder = 45; this.altG.add(bh);
      bh.fill = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.16, depthTest: false, depthWrite: false })); bh.fill.renderOrder = 44; this.altG.add(bh.fill);
      this.altBoxes.push(bh);
    }
    var bb3 = new THREE.Box3();
    this.altBoxes.forEach(function (bh, i) {
      var q = list[i]; bh.visible = bh.fill.visible = !!q; if (!q) return;
      var col = TYPE_COL[q.it.type] || 0xf0b429;
      bh.setFromObject(q.o); bh.material.color.setHex(col);                                                                        // 113
      bh.material.transparent = true; bh.material.opacity = 0.55 + 0.35 * Math.sin(self.t * 4 + i);
      bb3.setFromObject(q.o); bb3.getCenter(bh.fill.position); bb3.getSize(bh.fill.scale); bh.fill.scale.max(new THREE.Vector3(0.05, 0.05, 0.05));
      bh.fill.material.color.setHex(col); bh.fill.material.opacity = 0.1 + 0.08 * Math.sin(self.t * 4 + i);
    });
    // 192–193: namn på det närmaste
    this.altLabels.forEach(function (l) { self.altG.remove(l); }); this.altLabels = [];
    var used = [];
    list.forEach(function (q) {
      if (used.length >= 6) return;
      var txt = self.game.describe ? self.game.describe(q.it) : q.it.type; if (!txt) return;
      var bb = new THREE.Box3().setFromObject(q.o), cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
      if (used.some(function (u) { return u.t === txt && Math.hypot(u.x - cx, u.z - cz) < 0.8; })) return;   // samma sak i flera delar
      used.push({ t: txt, x: cx, z: cz });
      var l = NV.tex.label(txt.length > 34 ? txt.slice(0, 33) + '…' : txt, { height: 0.09, depthTest: false });
      l.position.set(cx, bb.max.y + 0.15, cz); l.renderOrder = 46;
      self.altG.add(l); self.altLabels.push(l);
    });
  };

  // ------------------------------------------------------------------ Fotsteg (115–117)
  var ORIG_STEP = NV.sfx.step;
  var stepSide = 1;
  NV.sfx.step = function (surface) {
    var w = NV.game && NV.game.world, ctx = NV.sfx.context && NV.sfx.context();
    stepSide = -stepSide;
    if (!w || NV.game.mode !== '3d' || !ctx || !NV.sfx.sample || S.get('realSteps') === false || !NV.assets3d || !NV.assets3d.steps) return ORIG_STEP.apply(this, arguments);
    var key = surface === 'metal' ? 'concrete' : (NV.assets3d.steps[surface] && NV.assets3d.steps[surface].length ? surface : 'carpet'), list = NV.assets3d.steps[key];
    if (!list || !list.length) return ORIG_STEP.apply(this, arguments);
    var run = w.vel && w.vel.length() > 4, crouch = w.crouch;
    var vol = ({ carpet: 0.55, wood: 0.4, concrete: 0.4 }[key]) * (crouch ? 0.45 : (run ? 1.3 : 1));                             // 116–117
    NV.sfx.sample(list[Math.floor(Math.random() * list.length)], vol, (surface === 'metal' ? 1.3 : 1) * (0.92 + Math.random() * 0.16) * (run ? 1.06 : 1), w.hd2d ? 0 : stepSide * 0.18);   // 115
  };

  // ------------------------------------------------------------------ Kollegorna (120–127)
  var ORIG_PEOPLE = NV.people.update;
  NV.people.update = function (list, dt, t, camPos, week, talkingTo) {
    var w = NV.game && NV.game.world;
    Object.keys(list).forEach(function (n) {
      var f = list[n];
      // 122–123: animationerna går inte i takt, och tempot skiljer sig lite mellan personer
      if (f.k && f.k.mixer && !f.k.v10) { f.k.v10 = true; f.k.mixer.timeScale = 0.92 + ((n.charCodeAt(0) * 7) % 17) / 100; f.k.mixer.update(Math.random() * 3); }
      // 120: de som står vänder hela kroppen mot dig när ni pratar
      if (talkingTo === n && !f.sitting && w && !w.hd2d) {
        var gp = f.group.position, want = Math.atan2(-(camPos.x - gp.x), -(camPos.z - gp.z)), d = want - f.group.rotation.y;
        while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        f.group.rotation.y += d * Math.min(1, dt * 4);
      }
      // 126: de du har hjälpt kan vinka igen efter en stund
      if (f.mood === 'happy' && f.waved) { f.waveAgain = (f.waveAgain || 0) + dt; if (f.waveAgain > 45) { f.waved = false; f.waveAgain = 0; } }
      // 127: springer du förbi tittar de efter dig
      if (w && w.vel && w.vel.length() > 4 && Math.hypot(camPos.x - f.group.position.x, camPos.z - f.group.position.z) < 4) f.look = (f.look || 0) * 1.02;
    });
    var r = ORIG_PEOPLE.apply(this, arguments);
    Object.keys(list).forEach(function (n) {
      var f = list[n], k = f.k;
      // 121: ringer telefonen pratar de i den (riktiga människor)
      if (k && k.real && f.sitting && f.ringing && talkingTo !== n && k.cur !== k.names.sitTalk && k.acts[k.names.sitTalk]) { k.acts[k.cur] && k.acts[k.cur].fadeOut(0.3); var a = k.acts[k.names.sitTalk]; a.reset().fadeIn(0.3).play(); k.cur = k.names.sitTalk; }
    });
    return r;
  };
  // 125: kollegor i närheten jublar när du löser ett fel
  var ORIG_CEL = W.celebrate;
  W.celebrate = function () {
    var r = ORIG_CEL.apply(this, arguments), self = this, n0 = 0;
    Object.keys(this.people).forEach(function (n) {
      var f = self.people[n];
      if (f.group.visible && Math.hypot(f.group.position.x - self.pos.x, f.group.position.z - self.pos.z) < 9) { f.gestKind = 'cheer'; f.gest = 1.6; n0++; }
    });
    if (n0) NV.career.stat('cheers');                                                                                              // 156
    return r;
  };

  // ------------------------------------------------------------------ Ljus i 3D (124, 128–133)
  W.initV10 = function () {
    this.v10 = true;
    var self = this, g = new THREE.Group(); g.userData.dynamic = true; this.scene.add(g); this.v10G = g;
    var glowTex = new THREE.TextureLoader().load('assets3d/fx/glow.png'), winTex = new THREE.TextureLoader().load('assets3d/fx/window.png');
    // 130: fönsterljus på golvet även i 3D
    this.v10Patches = [];
    (this.builder.sem || []).forEach(function (s) {
      if (s.type !== 'window') return;
      var p = new THREE.Mesh(new THREE.PlaneGeometry(s.w * 1.1, s.h * 0.9), new THREE.MeshBasicMaterial({ map: winTex, color: 0xffe2b0, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
      p.rotation.x = -Math.PI / 2; p.rotation.z = s.ry; p.position.set(s.x + Math.sin(s.ry) * (2.8 - s.h * 0.3), 0.014, s.z + Math.cos(s.ry) * (2.8 - s.h * 0.3)); p.userData.hdNoCut = true;
      g.add(p); self.v10Patches.push(p);
    });
    // 131: skärmarna lyser svagt
    this.v10Glows = [];
    Object.keys(this.builder.anchors.desks || {}).forEach(function (id) {
      var d = self.builder.anchors.desks[id];
      var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x7fb8ff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.position.set(d.x, 1.05, d.z - 0.25); s.scale.set(0.8, 0.6, 1); g.add(s); self.v10Glows.push(s);
    });
    // 124: skuggfläckar under kollegorna när riktiga skuggor saknas
    if (this.P && !this.P.shadows) {
      Object.keys(this.people).forEach(function (n) {
        var f = self.people[n], c = document.createElement('canvas'); c.width = c.height = 64;
        var x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
        var m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
        m.rotation.x = -Math.PI / 2; m.position.y = 0.012; m.userData.hdNoCut = true; f.group.add(m); f.v10Shadow = m;
      });
    }
    // 132: 3D-läget har egna solstrålar; de döljs i HD-2D där det finns andra
    this.v10Beams = [];
    if (this.ex && this.ex.beamMat) this.scene.traverse(function (o) { if (o.material === self.ex.beamMat) self.v10Beams.push(o); });
    this.v10Lights = (this.builder.lights || []).map(function (l) { return { l: l, c: l.color.clone() }; });
  };
  var ORIG_UPDATE = W.update;
  W.update = function (dt) {
    if (!this.v10 && this.builder && this.people) this.initV10();
    this.padPoll(dt);
    this.emoteCd = Math.max(0, (this.emoteCd || 0) - dt);
    var r = ORIG_UPDATE.apply(this, arguments);
    var h = hour(this), warm = Math.max(0, Math.min(1, (h - 15) / 3)), self = this, rain = this.ex && this.ex.weather === 'rain';
    this.updateRoute(dt);
    this.updateAlt();
    var g = this.v10G;
    if (g) {
      g.visible = !this.hd2d;
      // 128: solstrålarnas färg följer tiden på dagen
      if (this.ex && this.ex.beamMat) this.ex.beamMat.uniforms.uCol.value.setRGB(1, 0.92 - warm * 0.18, 0.75 - warm * 0.3);
      this.v10Beams.forEach(function (b) { b.visible = !self.hd2d; });
      this.v10Patches.forEach(function (p) { p.material.opacity = rain ? 0.04 : (0.14 + 0.05 * Math.sin(self.t * 0.21)) * (1 - warm * 0.3); p.material.color.setRGB(1, 0.89 - warm * 0.15, 0.69 - warm * 0.3); });
      this.v10Glows.forEach(function (s, i) { s.material.opacity = 0.14 + 0.04 * Math.sin(self.t * 2 + i) + warm * 0.08; });
      // 129: lamporna blir varmare på kvällen
      this.v10Lights.forEach(function (o) { o.l.color.copy(o.c).lerp(new THREE.Color(1, 0.78, 0.55), warm * 0.45); });
    }
    // 133: lätt oskärpa upptill och nertill när du zoomar (Z eller högerklick)
    if (this.post && !this.hd2d) { this.post.u.uTilt.value = this.zoomed && !reduce() ? 0.6 : 0; this.post.u.uFocus.value = 0.5; this.post.u.uBand.value = 0.12; }
    // 154: spela i alla tre visningslägena
    var vn = this.game.viewName ? this.game.viewName() : '3d', d8 = NV.v8 && NV.v8.load ? NV.v8.load() : null;
    if (d8 && !(d8.views || {})[vn]) { d8.views = d8.views || {}; d8.views[vn] = 1; NV.v8.save(d8); NV.career.max('viewsUsed', Object.keys(d8.views).length); }
    return r;
  };

  // ------------------------------------------------------------------ Gränssnitt (104, 114, 136–152, 168, 177–178, 184–185, 199)
  NV.afterGame(function () {
    var g = NV.game; if (!g || !g.ui) return;
    var ui = g.ui;
    // 2D-världen räknas också till prestationen och läser handkontrollen för meny och paus
    var origHint = ui.setHint;
    ui.setHint = function (inter) {
      var r = origHint.apply(this, arguments);
      if (pad.used && this.hint && /^(E|Klicka) – /.test(this.hint.textContent)) this.hint.textContent = this.hint.textContent.replace(/^(E|Klicka) – /, 'Ⓐ – ');   // 104
      var ch = document.getElementById('crosshair');
      if (ch) ch.style.setProperty('--ch', inter ? '#' + (TYPE_COL[inter.type] || 0xf0b429).toString(16).padStart(6, '0') : '#ffffff');   // 114
      return r;
    };
    // 168, 199: pilen mot målet säger hur du går dit
    var origComp = ui.updateCompass;
    ui.updateCompass = function () {
      var r = origComp.apply(this, arguments), ct = this.compass && this.compass.querySelector('.ctext');
      if (ct && g.mode === '3d' && ct.textContent && !/\(X\)$/.test(ct.textContent)) ct.textContent += pad.used ? ' (Ⓧ)' : ' (X)';
      return r;
    };
    // 185: tangenthjälpen visar handkontrollens knappar när den används
    var origHud = ui.renderHud;
    ui.renderHud = function () {
      var r = origHud.apply(this, arguments), k = this.hud && this.hud.querySelector('.hud-keys');
      if (k && pad.used) k.innerHTML = 'Vänster spak gå · ' + (g.world && g.world.hd2d ? 'höger spak vrid · LB/RB 45° · LT/RT zoom' : 'höger spak titta · RT zoom · RB ficklampa') + ' · Ⓐ använd · Ⓑ stäng · Ⓧ mål · Ⓨ glasögon · Select karta · Start meny';
      else if (k && g.mode === '3d') k.innerHTML += ' · <b>X</b> ' + (g.world && g.world.hd2d ? 'gå till målet' : 'visa vägen') + ' · <b>Alt</b> visa allt · <b>1–6</b> emotes · <b>F4</b> byt vy';
      return r;
    };
    // 184: byt visning direkt i pausmenyn; texten stämmer i HD-2D
    var pb = document.querySelector('#pause .pause-buttons');
    if (pb && !pb.querySelector('[data-view]')) {
      var row = document.createElement('div'); row.className = 'pause-views';
      row.innerHTML = '<span>Visning:</span><button data-view="2d">2D</button><button data-view="hd2d">HD-2D</button><button data-view="3d">3D</button>';
      pb.parentNode.insertBefore(row, pb.nextSibling);
      row.addEventListener('click', function (e) { var b = e.target.closest('[data-view]'); if (!b) return; e.stopPropagation(); ui.hidePause(); NV.settings.set('modeChosen', true); g.setMode(b.getAttribute('data-view')); });
    }
    var origShow = ui.showPause;
    ui.showPause = function () {
      var r = origShow.apply(this, arguments), sub = document.querySelector('#pause .pause-sub');
      if (sub) sub.textContent = g.world && g.world.hd2d ? 'HD-2D: klicka för att gå, Q/Z vrider kameran, hjulet zoomar, X går till nästa mål.' : (g.mode === '2d' ? 'Klicka för att gå, WASD flyttar.' : 'Musen styr blicken när den är låst. Går det inte att låsa: håll ned musknappen och dra.');
      var cur = g.viewName ? g.viewName() : g.mode;
      document.querySelectorAll('#pause [data-view]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-view') === cur); });
      return r;
    };
    // 138: hjälpen (F1) beskriver HD-2D och handkontrollen
    var origHelp = ui.helpDialog;
    ui.helpDialog = function () {
      var r = origHelp.apply(this, arguments), body = document.querySelector('#dialog .dlg-body') || document.querySelector('#dialog');
      if (body && !body.querySelector('.help-v10')) {
        var d = document.createElement('div'); d.className = 'help-v10';
        d.innerHTML = '<h3>HD-2D</h3><p>Klicka på golvet för att gå och på saker eller kollegor för att använda dem. Klicka på ett rack för att se frontpanelerna på nära håll, som i 2D; klicka där på en switch eller router för att koppla in konsolkabeln. WASD går i kamerans riktning, Q och Z vrider kameran (Shift för små steg, mittenknappen drar fritt, Home rätar upp), hjulet zoomar, X går till nästa mål, Mellanslag hoppar, 1–6 är emotes, högerklick stannar och dubbelklick springer.</p>' +
          '<h3>3D och HD-2D</h3><p>Håll Alt för att se allt du kan använda i närheten. X visar vägen till nästa mål på golvet i 3D. Hjulet zoomar mjukt i 3D. F4 byter mellan 2D, HD-2D och 3D.</p>' +
          '<h3>Handkontroll</h3><p>Vänster spak går, höger spak tittar eller vrider. Ⓐ använd, Ⓑ stäng, Ⓧ mål, Ⓨ glasögon, LB/RB vrid (HD-2D), LT/RT zoom, D-pad zoom och emotes, Select karta, Start meny. Spakklick: vänster springer, höger hoppar.</p>';
        body.appendChild(d);
      }
      return r;
    };
    // 177–178: fotoläget döljer HD-2D:s hjälpmedel och skärper tilt-shiften
    var mo = new MutationObserver(function () {
      var on = document.body.classList.contains('photo'), w = g.world;
      if (w && w.hdMore) { w.hdMore.icons.forEach(function (s) { s.userData.photoHide = on; }); w.hdMore.cursor.userData.photoHide = on; w.hdMore.goal.userData.photoHide = on; }
      if (w && w.post && w.hd2d) w.post.u.uBand.value = on ? 0.07 : w.post.u.uBand.value;
    });
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    // 153–158: nya prestationer
    var A = NV.career.ACH;
    [
      ['pad', 'Handkontroll', 'Spela med en handkontroll.', '🎮', function (s) { return s.pad >= 1; }],
      ['views3', 'Alla vyer', 'Spela i 2D, HD-2D och 3D.', '🪟', function (s) { return s.viewsUsed >= 3; }],
      ['routes', 'Ruttplanerare', 'Visa vägen till målet med X fem gånger i 3D.', '🗺️', function (s) { return s.routes >= 5; }],
      ['cheers', 'Teamkänsla', 'Få kollegorna att jubla fem gånger.', '🙌', function (s) { return s.cheers >= 5; }],
      ['waveBack', 'Vinka tillbaka', 'Vinka (1) till en kollega som vinkar tillbaka.', '👋', function (s) { return s.wavesBack >= 1; }],
      ['zoomer', 'Zoomaren', 'Zooma med hjulet tio gånger i 3D.', '🔍', function (s) { return s.wheelZooms >= 10; }],
    ].forEach(function (a) { if (!A.some(function (x) { return x[0] === a[0]; })) A.push(a); });
  });
  // Dolda i fotoläget (177)
  var ORIG_UPD2 = W.update;
  W.update = function (dt) {
    var r = ORIG_UPD2.apply(this, arguments);
    if (this.hdMore && document.body.classList.contains('photo')) { this.hdMore.icons.forEach(function (s) { s.visible = false; }); this.hdMore.cursor.visible = false; this.hdMore.goal.visible = false; this.hdMore.dots.forEach(function (d) { d.visible = false; }); }
    return r;
  };
})();

// ------------------------------------------------------------------ Del 3: rättningar, pekskärm och småsaker (164–176, 179–183, 189, 191)
(function () {
  if (!NV.World) return;
  var W = NV.World.prototype, S = NV.settings;
  var ORIG_UPDATE = W.update;
  W.update = function (dt) {
    var r = ORIG_UPDATE.apply(this, arguments);
    // 169: laptopen framför kameran (vid racket) visas aldrig i HD-2D
    if (this.hd2d && this.ex && this.ex.vm) this.ex.vm.visible = false;
    // 176: kameran zoomar ut lite när du springer i HD-2D
    if (this.hd2d) {
      var run = this.vel.length() > 4;
      if (run && !this.runZoom) { this.runZoom = true; this.hdDistT = (this.hdDistT || 16) + 2; }
      else if (!run && this.runZoom && this.vel.length() < 0.5) { this.runZoom = false; this.hdDistT = Math.max(7, (this.hdDistT || 16) - 2); }
    }
    // 191: kaffeboosten syns som ånga runt dig
    var g = this.game;
    if (g.boostUntil && g.boostUntil > Date.now() && this.fx && this.fx.steam && Math.random() < dt * 4) this.fx.steam({ x: this.pos.x + (Math.random() - 0.5) * 0.3, y: this.hd2d ? 1.6 : 1.2, z: this.pos.z + (Math.random() - 0.5) * 0.3 });
    return r;
  };
  // 175: rutten (X) tas bort när du åker till den andra platsen
  var ORIG_TELE = W.teleport;
  W.teleport = function () {
    var r = ORIG_TELE.apply(this, arguments);
    if (this.routeG) { this.routeT = 0; while (this.routeG.children.length) this.routeG.remove(this.routeG.children[0]); }
    return r;
  };

  NV.afterGame(function () {
    var g = NV.game; if (!g || !g.ui) return;
    var ui = g.ui;
    // 172: dörren till den andra platsen säger hur lång resan är
    var origDesc = g.describe;
    g.describe = function (i) {
      var t = origDesc.apply(this, arguments);
      if (i && i.type === 'travel' && t && !/min/.test(t)) t += ' (ca 45 min med bil)';
      return t;
    };
    // 173: kaffeboosten räknar ned i HUD:en
    var origHud = ui.renderHud;
    ui.renderHud = function () {
      var r = origHud.apply(this, arguments);
      var left = g.boostUntil ? Math.round((g.boostUntil - Date.now()) / 1000) : 0;
      if (left > 0 && this.hud && !this.hud.querySelector('.chip.boost')) {
        var c = document.createElement('span'); c.className = 'chip boost hud-v8'; c.title = 'Du går snabbare en stund'; c.textContent = '☕ ' + left + ' s';
        var row = this.hud.querySelector('.hud-chips') || this.hud; row.appendChild(c);
      }
      return r;
    };
    // 174: minikartan visar kamerans synfält i HD-2D och åt vilket håll du är vänd
    if (NV.minimap && NV.minimap.draw) {
      var origDraw = NV.minimap.draw;
      NV.minimap.draw = function (game) {
        var r = origDraw.apply(this, arguments), w = game.world, cv = document.getElementById('minimap');
        if (!w || !w.hd2d || !cv || cv.classList.contains('hidden')) return r;
        var c = cv.getContext('2d'), Wd = cv.width, Hd = cv.height;
        c.save(); c.translate(Wd / 2, Hd / 2);
        c.fillStyle = 'rgba(255, 230, 150, 0.16)'; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, Wd * 0.48, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55); c.closePath(); c.fill();
        var fa = [Math.PI, 0, -Math.PI / 2, Math.PI / 2][w.hdDir || 0];
        c.rotate(fa); c.fillStyle = 'rgba(255,255,255,0.9)'; c.beginPath(); c.moveTo(0, -13); c.lineTo(3, -9); c.lineTo(-3, -9); c.closePath(); c.fill();
        c.restore();
        return r;
      };
    }
    // 189: toast när handkontrollen kopplas bort
    window.addEventListener('gamepaddisconnected', function () { ui.toast('🎮 Handkontrollen kopplades bort.'); document.body.classList.remove('pad'); });
    // 180–183: pekskärmsknappar: mål/väg, vrid kameran och vinka
    var box = document.createElement('div'); box.className = 'v10-touch';
    box.innerHTML = '<button data-a="goal" title="Gå till målet / visa vägen">🧭</button><button class="hd-only" data-a="left" title="Vrid vänster">⟲</button><button class="hd-only" data-a="right" title="Vrid höger">⟳</button><button data-a="wave" title="Vinka">👋</button>';
    document.body.appendChild(box);
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-a]'), w = g.world; if (!b || !w || g.mode !== '3d') return;
      var a = b.getAttribute('data-a');
      if (a === 'goal') { if (w.hd2d) w.hdGoObjective(); else w.showRoute(); }
      if (a === 'left') w.hdYawT += Math.PI / 4;
      if (a === 'right') w.hdYawT -= Math.PI / 4;
      if (a === 'wave') w.emote(0);
      NV.touch && NV.touch.buzz && NV.touch.buzz(12);
    });
    // 179: tryck och håll i HD-2D för att springa dit
    var cv = g.world && g.world.canvas || document.getElementById('view'), hold = null;
    if (cv) {
      cv.addEventListener('touchstart', function (e) { var w = g.world; if (!w || !w.hd2d || e.touches.length !== 1) return; var t = e.touches[0]; hold = { x: t.clientX, y: t.clientY, timer: setTimeout(function () { if (hold) { w.hdClick(hold.x, hold.y, true); hold.fired = true; } }, 450) }; }, { passive: true });
      cv.addEventListener('touchmove', function (e) { if (hold && Math.hypot(e.touches[0].clientX - hold.x, e.touches[0].clientY - hold.y) > 12) { clearTimeout(hold.timer); hold = null; } }, { passive: true });
      cv.addEventListener('touchend', function () { if (hold) clearTimeout(hold.timer); hold = null; }, { passive: true });
    }
  });
})();
