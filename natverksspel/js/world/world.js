// 3D-världen: rendering, spelaren, interaktion och visuell återkoppling från simuleringen.
NV.World = (function () {
  var T = NV.tex, S = NV.sim, SH = NV.iosShow;

  function World(canvas, game) {
    this.canvas = canvas;
    this.game = game;
    this.keys = {};
    this.yaw = 0; this.pitch = 0;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.locked = false;
    this.hover = null;
    this.t = 0;
    this.sens = 0.0022;
    this.fovNow = NV.settings.get('fov');
    this.monitorHist = {};
    this.stepAcc = 0;
    this.drag = null;
    this.site = 'gbg';
    this.consoleTarget = null;
    this.ledTimer = 0; this.slowTimer = 0;
  }
  var W = World.prototype;

  W.init = function () {
    var q = NV.settings.get('quality');
    this.lowQ = q === 'low';
    this.ultra = q === 'ultra';
    this.usePost = !this.lowQ && NV.settings.get('post');
    var r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: !this.usePost, powerPreference: 'high-performance' });
    this.basePR = this.lowQ ? 1 : Math.min(window.devicePixelRatio || 1, this.ultra ? 2 : 1.75);
    this.prScale = 1;
    r.setPixelRatio(this.basePR);
    r.shadowMap.enabled = !this.lowQ;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = r;
    if (this.usePost) {
      try { this.post = new NV.Post(r, { samples: this.ultra ? 4 : 2 }); } catch (e) { this.post = null; this.usePost = false; }
    }
    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1e24);
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(NV.settings.get('fov'), 1, 0.05, 200);
    this.hemi = new THREE.HemisphereLight(0xf2f5ff, 0x8a8070, this.lowQ ? 0.95 : 0.88);
    scene.add(this.hemi);
    scene.add(new THREE.AmbientLight(0xffffff, 0.12));
    var sun = new THREE.DirectionalLight(0xfff0dc, 1.5);
    sun.castShadow = !this.lowQ;
    sun.shadow.mapSize.set(this.ultra ? 4096 : 2048, this.ultra ? 4096 : 2048);
    sun.shadow.camera.left = -14; sun.shadow.camera.right = 14; sun.shadow.camera.top = 14; sun.shadow.camera.bottom = -14;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 60;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
    scene.add(sun); scene.add(sun.target);
    this.sun = sun;

    var b = new NV.building.Builder(scene);
    this.builder = b;
    NV.building.buildGbg(b);
    NV.building.buildBoras(b);
    // Rumsbelysning (utan skuggor)
    [[-10.5, -6, 0xe8f0ff, 14], [-1.5, -6, 0xffe6c8, 12], [9, -6, 0xfff0dc, 14], [-10, 6, 0xfff0dc, 14], [-10, 0, 0xfff0dc, 8], [0, 3, 0xfff4e6, 14], [9, 3, 0xfff4e6, 14], [3, 8, 0xfff4e6, 10]].forEach(function (l) {
      b.pointLight(l[0], 2.75, l[1], l[2], l[3], 12);
    });
    b.pointLight(-12, 2.2, -7.6, 0xdfe9ff, 7, 5);
    b.pointLight(89.8, 2.2, -10.3, 0xdfe9ff, 6, 5);
    [[94, -4], [104, -4], [94, 6], [104, 6], [90.5, -9]].forEach(function (l) { b.pointLight(l[0], 5.8, l[1], 0xf4f8ff, 40, 16); });

    this.dev = NV.devices3d.build(this);
    this.people = NV.people.build(this);
    this.fx = new NV.fx3d.FX(this);
    this.fx.enabled = NV.settings.get('particles');
    this.buildCables();
    this.collectInteractables();
    this.ex = new NV.extras3d.Extras(this);
    this.ex.build();
    if (!this.lowQ) { try { this.ex.reflections(); } catch (e) { /* reflektioner är en bonus */ } }
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 3.8;
    this.hl = new THREE.BoxHelper(undefined, 0xf0b429);
    this.hl.visible = false;
    this.hl.material.depthTest = false;
    this.hl.renderOrder = 10;
    scene.add(this.hl);
    this.center = new THREE.Vector2(0, 0);
    this.teleport('gbg', true);
    this.bindInput();
    this.resize();
    var self = this;
    window.addEventListener('resize', function () { self.resize(); });
  };

  W.resize = function () {
    var w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(this.basePR * this.prScale);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.post) { var v = new THREE.Vector2(); this.renderer.getDrawingBufferSize(v); this.post.setSize(v.x, v.y); }
  };

  W.collectInteractables = function () {
    var list = [];
    this.scene.traverse(function (o) { if (o.userData && o.userData.interact && !o.isSprite) list.push(o); });
    this.builder.interact.forEach(function (i) { i.mesh.userData.interact = { type: i.type, to: i.to, label: i.label }; if (list.indexOf(i.mesh) < 0) list.push(i.mesh); });
    this.interactables = list;
  };

  // ------------------------------------------------------------------ Kablar
  W.portPoint = function (dev, port, out) {
    var e = this.dev.entries[dev];
    if (!e) return null;
    return e.rack.portWorld(e, port, out);
  };
  W.buildCables = function () {
    var self = this;
    var st = this.game.state;
    if (this.cableMeshes) this.cableMeshes.forEach(function (m) { self.scene.remove(m); m.geometry.dispose(); });
    this.cableMeshes = [];
    this.linkMeshes = {};
    var rackEntries = this.dev.entries;
    var ppIndex = { SW1: 'PP1', SW2: 'PP1', RB: 'PP2', SWB: 'PP2' };
    st.links.forEach(function (l) {
      var A = l.a, B = l.b;
      var aRack = rackEntries[A.dev], bRack = rackEntries[B.dev];
      var col = l.color || 'blue';
      var pts = null;
      var pa = aRack ? self.portPoint(A.dev, A.port) : null;
      var pb = bRack ? self.portPoint(B.dev, B.port) : null;
      var rack = aRack ? aRack.rack : null;
      if (pa && l.kind === 'wan') {
        if (A.dev === 'R1') pts = self.wallRoute(rack, pa, self.dev.extra.wan);
        var pb2 = self.portPoint(B.dev, B.port);
        if (pb2) {
          var target = self.dev.extra.wanBoras;
          var rb = rackEntries[B.dev].rack;
          var inv = new THREE.Matrix4().copy(rb.group.matrixWorld).invert();
          var lp = pb2.clone().applyMatrix4(inv);
          var q1 = new THREE.Vector3(lp.x, lp.y - 0.01, lp.z + 0.07).applyMatrix4(rb.group.matrixWorld);
          var q2 = new THREE.Vector3(0.32, lp.y - 0.05, lp.z + 0.05).applyMatrix4(rb.group.matrixWorld);
          var m2 = NV.devices3d.cable(self, [pb2.clone(), q1, q2, new THREE.Vector3(target.x + 0.15, target.y, target.z - 0.3), target.clone()], 'red', 0.005);
          self.cableMeshes.push(m2);
        }
      } else if (pa && pb && aRack.rack === bRack.rack) pts = self.rackRoute(rack, pa, pb, S.portNum(A.port) > 12 ? 1 : -1);
      else if (pa && pb) pts = self.crossRoute(aRack.rack, pa, bRack.rack, pb);
      else if (pa && B.dev === 'ISP') pts = self.wallRoute(rack, pa, self.dev.extra.fiber);
      else if (pa && !bRack) {
        var pp = rackEntries[ppIndex[A.dev]];
        var n = S.portNum(A.port);
        var pp2 = pp && pp.rack === aRack.rack ? pp.rack.portWorld(pp, 'pp' + Math.min(24, n)) : null;
        if (pp2) pts = self.rackRoute(rack, pa, pp2, n > 12 ? 1 : -1);
      }
      if (!pts) return;
      var mesh = NV.devices3d.cable(self, pts, col, 0.0045, { interact: { type: 'cable', link: l.id } });
      self.cableMeshes.push(mesh);
      self.linkMeshes[l.id] = mesh;
    });
    this.updateCables();
  };
  W.rackRoute = function (rack, pa, pb, side) {
    var inv = new THREE.Matrix4().copy(rack.group.matrixWorld).invert();
    var a = pa.clone().applyMatrix4(inv), b = pb.clone().applyMatrix4(inv);
    var out = 0.06 + Math.random() * 0.02;
    var sx = 0.25 * side;
    var pts = [
      a.clone(),
      new THREE.Vector3(a.x, a.y - 0.01, a.z + out),
      new THREE.Vector3(sx, a.y - 0.02, a.z + out + 0.02),
      new THREE.Vector3(sx, b.y - 0.02, b.z + out + 0.02),
      new THREE.Vector3(b.x, b.y - 0.01, b.z + out),
      b.clone(),
    ];
    if (Math.abs(a.y - b.y) < 0.03) pts.splice(2, 2, new THREE.Vector3((a.x + b.x) / 2, Math.min(a.y, b.y) - 0.05, a.z + out + 0.03));
    return pts.map(function (p) { return p.applyMatrix4(rack.group.matrixWorld); });
  };
  W.crossRoute = function (ra, pa, rb, pb) {
    function lift(rack, p, sx) {
      var inv = new THREE.Matrix4().copy(rack.group.matrixWorld).invert();
      var a = p.clone().applyMatrix4(inv);
      return [new THREE.Vector3(a.x, a.y - 0.01, a.z + 0.07), new THREE.Vector3(sx, a.y - 0.03, a.z + 0.08), new THREE.Vector3(sx, 2.02, a.z + 0.02)].map(function (v) { return v.applyMatrix4(rack.group.matrixWorld); });
    }
    var A = lift(ra, pa, 0.27), B = lift(rb, pb, -0.27);
    return [pa.clone()].concat(A).concat(B.reverse()).concat([pb.clone()]);
  };
  W.wallRoute = function (rack, pa, target) {
    var inv = new THREE.Matrix4().copy(rack.group.matrixWorld).invert();
    var a = pa.clone().applyMatrix4(inv);
    var p1 = new THREE.Vector3(a.x, a.y - 0.01, a.z + 0.07).applyMatrix4(rack.group.matrixWorld);
    var p2 = new THREE.Vector3(0.32, a.y - 0.05, a.z + 0.05).applyMatrix4(rack.group.matrixWorld);
    var top = new THREE.Vector3(p2.x, 2.25, p2.z);
    var t2 = new THREE.Vector3(target.x, 2.25, target.z + 0.05);
    return [pa.clone(), p1, p2, top, t2, target.clone()];
  };
  W.updateCables = function () {
    var st = this.game.state;
    var self = this;
    st.links.forEach(function (l) {
      var m = self.linkMeshes[l.id];
      if (!m) return;
      m.visible = l.state !== 'unplugged';
    });
    // Dinglande kabel när reservlänken är urdragen
    if (this.dangle) { this.scene.remove(this.dangle); this.dangle = null; }
    var un = st.links.filter(function (l) { return l.state === 'unplugged' && self.linkMeshes[l.id]; })[0];
    if (un) {
      var p = this.portPoint(un.a.dev, un.a.port);
      if (p) {
        this.dangle = NV.devices3d.cable(this, [p.clone().add(new THREE.Vector3(0, -0.01, 0.1)), p.clone().add(new THREE.Vector3(0.05, -0.3, 0.16)), p.clone().add(new THREE.Vector3(0.08, -0.6, 0.18))], un.color || 'orange', 0.0045, { interact: { type: 'cable', link: un.id } });
        this.collectInteractables();
      }
    }
    // Konsolkabeln
    if (this.consoleMesh) { this.scene.remove(this.consoleMesh); this.consoleMesh = null; }
    if (this.consoleTarget) {
      var c = this.portPoint(this.consoleTarget, 'console');
      if (c) {
        this.consoleMesh = NV.devices3d.cable(this, [c.clone(), c.clone().add(new THREE.Vector3(0, 0, 0.08)), c.clone().add(new THREE.Vector3(0.1, -0.35, 0.25)), c.clone().add(new THREE.Vector3(0.15, -0.8, 0.4))], 'console', 0.004);
      }
    }
  };

  // ------------------------------------------------------------------ Styrning
  W.bindInput = function () {
    var self = this;
    document.addEventListener('keydown', function (e) {
      if (!self.active) return;
      if (self.game.ui && self.game.ui.captures()) return;
      self.keys[e.code] = true;
      if (e.code === 'KeyE') self.use();
      if (e.code === 'KeyV' && !e.repeat) { var on = self.ex.toggleTorch(); if (self.game.ui) self.game.ui.toast(on ? 'Ficklampan är tänd (V).' : 'Ficklampan är släckt.'); }
      if (e.code === 'Space' && !e.repeat && self.jumpY === 0 && !self.crouch) { self.vy = 3.3; e.preventDefault(); }
    });
    document.addEventListener('keyup', function (e) { self.keys[e.code] = false; });
    // Klick: lås musen, eller använd det du tittar på. Ett drag räknas inte som klick.
    this.canvas.addEventListener('click', function () {
      if (self.game.ui && self.game.ui.captures()) return;
      if (self.dragMoved) { self.dragMoved = false; return; }
      if (!self.locked) self.lock();
      else self.use();
    });
    this.canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    this.canvas.addEventListener('mousedown', function (e) {
      if (e.button === 2) self.zoomHeld = true;
      if (self.locked || (self.game.ui && self.game.ui.captures())) return;
      self.drag = { x: e.clientX, y: e.clientY, moved: 0 };
      self.dragMoved = false;
    });
    document.addEventListener('mouseup', function (e) {
      if (e.button === 2) self.zoomHeld = false;
      self.drag = null;
    });
    document.addEventListener('pointerlockchange', function () {
      self.locked = document.pointerLockElement === self.canvas;
      if (self.game.ui) self.game.ui.onLockChange(self.locked);
    });
    document.addEventListener('pointerlockerror', function () {
      self.lockFailed = true;
      if (self.game.ui) self.game.ui.toast('Muslåset stöds inte här. Håll ned musknappen och dra för att titta.');
    });
    document.addEventListener('mousemove', function (e) {
      if (!self.active) return;
      var dx, dy;
      if (self.locked) {
        dx = e.movementX; dy = e.movementY;
        // Vissa webbläsare skickar enstaka jättehopp: ignorera dem
        if (Math.abs(dx) > 250 || Math.abs(dy) > 250) return;
      } else if (self.drag) {
        dx = e.clientX - self.drag.x; dy = e.clientY - self.drag.y;
        self.drag.x = e.clientX; self.drag.y = e.clientY;
        self.drag.moved += Math.abs(dx) + Math.abs(dy);
        if (self.drag.moved > 5) self.dragMoved = true;
        dx *= 1.6; dy *= 1.6;
      } else return;
      var k = self.sens * NV.settings.get('sens') * (self.zoomed ? 0.45 : 1);
      self.tYaw -= dx * k;
      self.tPitch -= dy * k * (NV.settings.get('invertY') ? -1 : 1);
      self.tPitch = Math.max(-1.45, Math.min(1.45, self.tPitch));
    });
    // Pekskärm: dra för att titta, två fingrar för att gå, tryck för att använda
    var last = null, moved = 0;
    this.canvas.addEventListener('touchstart', function (e) { last = e.touches[0]; moved = 0; self.touchWalk = e.touches.length > 1; }, { passive: true });
    this.canvas.addEventListener('touchmove', function (e) {
      var t = e.touches[0];
      if (last) { moved += Math.abs(t.clientX - last.clientX) + Math.abs(t.clientY - last.clientY); self.tYaw -= (t.clientX - last.clientX) * 0.005; self.tPitch = Math.max(-1.4, Math.min(1.4, self.tPitch - (t.clientY - last.clientY) * 0.005)); }
      last = t; self.touchWalk = e.touches.length > 1;
    }, { passive: true });
    this.canvas.addEventListener('touchend', function (e) { if (!e.touches.length) { self.touchWalk = false; if (moved < 8 && self.hover) self.use(); } last = null; }, { passive: true });
  };
  W.lock = function () {
    if (!this.canvas.requestPointerLock || this.lockFailed) return;
    var self = this;
    try {
      var p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(function () { try { var q = self.canvas.requestPointerLock(); if (q && q.catch) q.catch(function () {}); } catch (e) { /* stöds inte */ } });
    } catch (e) {
      try { this.canvas.requestPointerLock(); } catch (e2) { /* stöds inte */ }
    }
  };
  W.unlock = function () { if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock(); this.keys = {}; this.drag = null; this.zoomHeld = false; };
  W.use = function () {
    if (!this.hover) return;
    if (this.game.onInteract) this.game.onInteract(this.hover);
  };
  W.setActive = function (on) {
    this.active = on;
    this.canvas.style.display = on ? 'block' : 'none';
    if (!on) this.unlock();
  };
  W.applySettings = function () {
    this.camera.fov = NV.settings.get('fov');
    this.camera.updateProjectionMatrix();
    if (this.fx) this.fx.enabled = NV.settings.get('particles');
  };

  W.teleport = function (site, instant) {
    var A = this.builder.anchors;
    var sp = site === 'boras' ? A.borasSpawn : A.spawn;
    this.pos.set(sp.x, 1.65, sp.z);
    this.yaw = this.tYaw = sp.ry;
    this.pitch = this.tPitch = -0.05;
    this.site = site;
    if (this.ex) this.ex.setSite(site);
  };

  W.collides = function (x, z, r) {
    var cs = this.builder.colliders;
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i];
      if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return true;
    }
    return false;
  };
  var SURFACE = { Serverrummet: 'metal', Fikarummet: 'wood', Receptionen: 'wood', Lagerkontoret: 'wood', 'Lagret i Borås': 'concrete' };
  W.move = function (dt) {
    var k = this.keys;
    var ui = this.game.ui;
    var free = !(ui && ui.captures());
    var fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0) + (this.touchWalk ? 1 : 0);
    var str = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    this.crouch = free && !!(k.KeyC || k.ControlLeft);
    var sprint = (k.ShiftLeft || k.ShiftRight) && !this.crouch;
    var speed = sprint ? 5.2 : 3.0;
    if (this.crouch) speed = 1.4;
    if (this.game.boosted && this.game.boosted()) speed *= 1.3;
    var dir = new THREE.Vector3(-Math.sin(this.yaw) * fwd + Math.cos(this.yaw) * str, 0, -Math.cos(this.yaw) * fwd - Math.sin(this.yaw) * str);
    if (dir.lengthSq() > 0) dir.normalize().multiplyScalar(speed);
    this.vel.lerp(dir, Math.min(1, dt * 10));
    var r = 0.28;
    var ox = this.pos.x, oz = this.pos.z;
    var nx = this.pos.x + this.vel.x * dt;
    if (!this.collides(nx, this.pos.z, r)) this.pos.x = nx; else this.vel.x = 0;
    var nz = this.pos.z + this.vel.z * dt;
    if (!this.collides(this.pos.x, nz, r)) this.pos.z = nz; else this.vel.z = 0;
    var movedDist = Math.hypot(this.pos.x - ox, this.pos.z - oz);
    if (this.game.addDistance) this.game.addDistance(movedDist);
    var moving = this.vel.length();
    // Hopp
    this.jumpY = this.jumpY || 0; this.vy = this.vy || 0;
    if (this.vy !== 0 || this.jumpY > 0) {
      this.vy -= 9.8 * dt;
      this.jumpY += this.vy * dt;
      if (this.jumpY <= 0) { this.jumpY = 0; if (this.vy < -2) { NV.sfx.thud(); this.land = 0.06; } this.vy = 0; }
    }
    this.land = Math.max(0, (this.land || 0) - dt * 0.3);
    // Huka: ögonhöjden sjunker mjukt
    this.eye = this.eye || 1.65;
    this.eye += ((this.crouch ? 1.02 : 1.65) - this.eye) * Math.min(1, dt * 10);
    this.bob = (this.bob || 0) + dt * moving * 2.4;
    this.stepAcc += moving * dt;
    var zoneName = this.zoneName || '';
    if (this.stepAcc > (sprint ? 0.9 : 0.75) && this.jumpY === 0) {
      this.stepAcc = 0;
      NV.sfx.step(SURFACE[zoneName] || 'carpet');
      if (this.site === 'boras' && sprint) this.fx.dust({ x: this.pos.x, z: this.pos.z });
    }
    var bobY = NV.settings.get('bob') ? Math.sin(this.bob * 2) * 0.018 * Math.min(1, moving / 3) : 0;
    // Skakning (larm, nivå upp)
    this.shakeA = Math.max(0, (this.shakeA || 0) - dt * 1.5);
    var sh = this.shakeA * this.shakeA;
    this.camera.position.set(this.pos.x + (Math.random() - 0.5) * sh * 0.1, this.eye + bobY + this.jumpY - this.land + (Math.random() - 0.5) * sh * 0.1, this.pos.z);
    // Zoom (högerklick eller Z) för att läsa frontpaneler; lite vidare vy när man springer
    this.zoomed = this.zoomHeld || (this.keys.KeyZ && free);
    var want = NV.settings.get('fov') * (this.zoomed ? 0.42 : (sprint && moving > 3.5 ? 1.08 : 1));
    if (Math.abs(this.camera.fov - want) > 0.05) { this.camera.fov += (want - this.camera.fov) * Math.min(1, dt * 10); this.camera.updateProjectionMatrix(); }
    // Mjuk eller direkt musrörelse
    if (this.tYaw === undefined) { this.tYaw = this.yaw; this.tPitch = this.pitch; }
    if (NV.settings.get('smooth')) { var a = Math.min(1, dt * 16); this.yaw += (this.tYaw - this.yaw) * a; this.pitch += (this.tPitch - this.pitch) * a; }
    else { this.yaw = this.tYaw; this.pitch = this.tPitch; }
    // Lätt lutning när man går i sidled
    var side = (Math.cos(this.yaw) * this.vel.x - Math.sin(this.yaw) * this.vel.z) / 5;
    this.roll = (this.roll || 0) + ((NV.settings.get('bob') ? -side * 0.035 : 0) - (this.roll || 0)) * Math.min(1, dt * 6);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch + (Math.random() - 0.5) * sh * 0.02, this.yaw, this.roll);
  };
  // ------------------------------------------------------------------ Effekter som spelet anropar
  W.front = function (d, up) {
    var v = new THREE.Vector3(-Math.sin(this.yaw) * (d || 1.4), 0, -Math.cos(this.yaw) * (d || 1.4));
    return v.add(new THREE.Vector3(this.pos.x, this.eye + (up || 0), this.pos.z));
  };
  W.celebrate = function (devId) {
    var p = devId ? this.ex.devPos(devId) : null;
    if (!p || p.distanceTo(new THREE.Vector3(this.pos.x, 1.2, this.pos.z)) > 8) p = this.front(1.6, 0.2);
    this.fx.confetti(p, 110);
    this.fx.sparks(p, 30, 0xffe08a);
    this.flash(0xffe08a, 0.3);
    this.slowmo(0.6);
    this.shake(0.3);
  };
  W.fireworks = function (n) {
    var self = this;
    for (var i = 0; i < (n || 3); i++) {
      this.ex.pending.push({ at: this.ex.t + i * 0.45, k: i, fn: function () {
        var p = self.front(4 + Math.random() * 2, 1.2 + Math.random());
        p.x += (Math.random() - 0.5) * 3;
        self.fx.firework(p);
        NV.sfx.thud();
      } });
    }
  };
  W.popup = function (text, color) { this.fx.popup(text, this.front(1.3, 0.12), { color: color || '#ffd54a' }); };
  W.pingTrace = function (from, res, count) { this.ex.pingTrace(from, res, count); };
  W.setGoggles = function (on) { this.ex.setGoggles(on); };
  W.crabCaught = function (c) { var p = new THREE.Vector3(c.x, 0.2, c.z); this.fx.poof(p, 0xff7a4a); this.fx.confetti(p, 50); };
  W.cableFx = function (l) { var p = this.portPoint(l.a.dev, l.a.port, 0.03); if (p) this.fx.sparks(p, 22); };
  W.consoleFx = function (id) { var p = this.portPoint(id, 'console', 0.03); if (p) { this.fx.sparks(p, 16, 0x7fc6f0); this.fx.ring(p, 0x7fc6f0, 0.3); } };
  W.shake = function (a) { this.shakeA = Math.max(this.shakeA || 0, a); };
  W.flash = function (hex, a) { this.flashA = (a || 0.5) * 0.6; if (this.post) this.post.u.uFlash.value.set(hex || 0xffe08a); };
  W.slowmo = function (sec) { this.slowT = sec || 0.7; };

  W.zone = function () {
    var z = this.builder.zones;
    for (var i = 0; i < z.length; i++) {
      var q = z[i];
      if (this.pos.x >= q.minX && this.pos.x <= q.maxX && this.pos.z >= q.minZ && this.pos.z <= q.maxZ) return q;
    }
    return { name: this.site === 'boras' ? 'Lagret i Borås' : 'Göteborg', site: this.site };
  };

  W.pick = function () {
    this.raycaster.setFromCamera(this.center, this.camera);
    var hits = this.raycaster.intersectObjects(this.interactables, false);
    this.hoverDetail = null;
    for (var i = 0; i < hits.length; i++) {
      var o = hits[i].object;
      if (!o.visible) continue;
      var vis = true, p = o.parent;
      while (p) { if (!p.visible) { vis = false; break; } p = p.parent; }
      if (!vis) continue;
      var inter = o.userData.interact;
      // Portnamn när man tittar på en frontpanel
      if (o.userData.faceOf && hits[i].uv) {
        var f = o.userData.faceOf, fp = f.fp;
        var px = hits[i].uv.x * 1024, py = (1 - hits[i].uv.y) * fp.ch;
        Object.keys(fp.ports).forEach(function (n) {
          var q = fp.ports[n];
          if (px >= q.x - 4 && px <= q.x + q.w + 4 && py >= q.y - 10 && py <= q.y + q.h + 10) this.hoverDetail = NV.shared.portInfo(this.game.state, f.devId, n);
        }, this);
        if (!this.hoverDetail && fp.console && px >= fp.console.x - 6 && px <= fp.console.x + fp.console.w + 6 && py >= fp.console.y - 6 && py <= fp.console.y + fp.console.h + 12) this.hoverDetail = 'Konsolporten (ljusblå kabel, 9600 8N1)';
      }
      var target = inter && inter.type === 'npc' && o.parent ? o.parent : o;
      if (inter && inter.type === 'crab' && o.parent) target = o.parent;
      if (this.hlTarget !== target) {
        this.hlTarget = target; this.hl.setFromObject(target);
        this.hl.material.color.setHex(HL_COLORS[inter && inter.type] || 0xf0b429);
      }
      this.hl.visible = true;
      return inter;
    }
    this.hl.visible = false;
    this.hlTarget = null;
    return null;
  };

  var HL_COLORS = { console: 0x4fc3f7, npc: 0xffd54a, cable: 0xff9f43, deskcable: 0xff9f43, travel: 0x7ee08a, coffee: 0xc58b5a, crab: 0xff5a4f, pc: 0x9ecbff, laptop: 0x9ecbff };
  // ------------------------------------------------------------------ Visuell återkoppling
  W.ledFn = function (devId) { return NV.shared.ledFn(this.game.state, devId); };
  W.updateLeds = function () {
    var e = this.dev.entries, self = this;
    var near = function (entry) {
      var p = new THREE.Vector3(); entry.face.getWorldPosition(p);
      return p.distanceTo(self.camera.position) < 14;
    };
    Object.keys(e).forEach(function (id) {
      var entry = e[id];
      if (!near(entry)) return;
      var devId = entry.spec.devId || (self.game.state.devices[id] ? id : null);
      entry.fp.draw(devId ? self.ledFn(devId) : null, self.t);
    });
  };
  W.updateSlow = function () {
    var st = this.game.state, self = this;
    var D = S.get(st);
    // Datorskärmar
    Object.keys(this.dev.pcs).forEach(function (id) {
      var pc = self.dev.pcs[id];
      var h = st.devices[id];
      if (!h) return;
      var ep = D.eps['E:' + id + ':nic'];
      var c = S.hostIpConf(h);
      var status;
      if (!ep || !ep.up) status = { icon: 'err', text: 'Ej ansluten', popup: ['Nätverkskabeln är urkopplad', 'Kontrollera kabeln'] };
      else if (!c || c.apipa) status = { icon: 'warn', text: 'Ingen internetåtkomst', popup: ['Ingen internetåtkomst', 'Adressen började på 169.254'] };
      else status = { icon: 'ok', text: c.ip, popup: null, app: { 'PC-Anna': 'Kundärenden', 'PC-Karim': 'Offert.xlsx', 'PC-Sara': 'Projektplan', 'PC-Lisa': 'Nyhetsbrev', 'PC-Bo': 'Budget 2027', 'PC-Maja': 'Bokföring', 'PC-Lager': 'Plocklista' }[id] };
      NV.devices3d.drawDesktop(pc.monitor.canvas, h.label || id, status, self.t + id.length);
      pc.monitor.tex.needsUpdate = true;
      if (pc.led) pc.led.material.emissiveIntensity = ep && ep.up ? 2 : 0;
      if (pc.mini) {
        var has = !!st.devices['Mini-switch'];
        pc.mini.visible = has; pc.mini2.visible = has;
      }
    });
    // Accesspunkter
    Object.keys(this.dev.aps).forEach(function (id) {
      var a = self.dev.aps[id];
      var d = st.devices[id];
      var joined = D.apJoined[id];
      if (!d.powered) { a.led.emissiveIntensity = 0; }
      else if (joined) { a.led.emissive.setHex(0x33ff66); a.led.emissiveIntensity = 2.5; }
      else { a.led.emissive.setHex(0xffa020); a.led.emissiveIntensity = Math.floor(self.t * 2) % 2 ? 2.5 : 0.2; }
    });
    this.drawMonitorWall();
    if (this.ex) this.ex.slow();
  };
  W.drawMonitorWall = function () {
    var mw = this.dev.extra.monitorWall;
    NV.shared.sampleMonitor(this.game.state, this.monitorHist);
    NV.shared.drawMonitor(mw.canvas, this.monitorHist, this.game.state, this.t);
    mw.tex.needsUpdate = true;
  };
  W.monitorCanvas = function () { return this.dev.extra.monitorWall.canvas; };
  W.drawWhiteboard = function (def) {
    var wb = this.dev.extra.whiteboard;
    var g = wb.canvas.getContext('2d');
    g.fillStyle = '#f7f8f6'; g.fillRect(0, 0, 1024, 640);
    g.fillStyle = '#1f4e79'; g.font = 'bold 52px "Segoe Print", "Comic Sans MS", cursive';
    g.fillText(def ? 'Vecka ' + def.week + ': ' + def.title : 'Fri träning', 40, 80);
    g.fillStyle = '#c0392b'; g.font = 'bold 40px "Segoe Print", "Comic Sans MS", cursive';
    g.fillText(def ? 'Krabban har varit här! 🦀' : 'Inga fel. Utforska nätet!', 40, 150);
    g.fillStyle = '#222'; g.font = '32px "Segoe Print", "Comic Sans MS", cursive';
    var y = 220;
    (def ? def.learn : ['show running-config', 'show ip interface brief', 'ping / traceroute']).forEach(function (l) { g.fillText('• ' + l, 60, y); y += 50; });
    g.fillStyle = '#2e7d32'; g.font = '28px "Segoe Print", "Comic Sans MS", cursive';
    g.fillText('Slå upp symptomet, inte kapitlet. (H = handbok)', 40, 590);
    wb.tex.needsUpdate = true;
  };

  // Färgton och exponering per rum
  var GRADE = {
    Serverrummet: [[0.9, 1.0, 1.12], 1.0, 1.02], Fikarummet: [[1.08, 1.0, 0.9], 1.1, 1.08], Receptionen: [[1.04, 1.0, 0.95], 1.08, 1.05],
    Ekonomi: [[1.04, 1.0, 0.96], 1.05, 1.05], Korridoren: [[1, 1, 1], 1.0, 1.02], Kontorslandskapet: [[1.02, 1.0, 0.98], 1.06, 1.05],
    Lagerkontoret: [[1.06, 1.0, 0.92], 1.05, 1.08], 'Lagret i Borås': [[0.98, 1.0, 1.02], 0.92, 1.12],
  };
  W.update = function (dt) {
    // Kort slowmotion när ett fel löses
    var rdt = dt;
    if (this.slowT > 0) { this.slowT -= dt; dt *= 0.35; }
    this.t += dt;
    var z = this.zone();
    this.zoneName = z.name;
    this.move(dt);
    // Skuggorna följer spelaren
    this.sun.position.set(this.pos.x - 8, 16, this.pos.z + 9);
    this.sun.target.position.set(this.pos.x, 0, this.pos.z);
    this.hover = this.pick();
    NV.people.update(this.people, dt, this.t, this.pos, this.game.week, this.game.ui ? this.game.ui.talkingTo : null);
    // Glasdörrarna vid entrén glider isär när man närmar sig
    var ed = this.builder.anchors.entranceDoors;
    if (ed) {
      var dd = Math.hypot(this.pos.x - 10.5, this.pos.z + 10);
      var open = dd < 2.6 ? 0.85 : 0;
      if (open && !this.doorOpen) NV.sfx.whoosh();
      this.doorOpen = !!open;
      ed.forEach(function (m, i) { var want = m.userData.baseX + (i ? open : -open); m.position.x += (want - m.position.x) * Math.min(1, dt * 5); });
    }
    // Ljud: fläktar, rumston, kollegor som skriver, telefoner som ringer
    var near = 99, self2 = this;
    NV.shared.rackSpots(this.builder).forEach(function (r) { near = Math.min(near, Math.hypot(self2.pos.x - r.x, self2.pos.z - r.z)); });
    var covered = this.game.ui && this.game.ui.captures();
    NV.sfx.hum(covered ? 0 : 1 - near / 7);
    NV.sfx.ambience(this.site === 'boras' ? 'warehouse' : 'office', covered ? 0.2 : (z.name === 'Serverrummet' ? 0.2 : 1));
    this.npcSounds(rdt);
    // Dagsljuset blir varmare under dagen
    var hour = 8 + (this.game.state ? this.game.state.time : 0) / 3600;
    var warm = Math.max(0, Math.min(1, (hour - 8) / 8));
    this.sun.color.setRGB(1, 0.94 - warm * 0.12, 0.86 - warm * 0.22);
    this.ledTimer += dt; this.slowTimer += dt;
    if (this.ledTimer > 0.16) { this.ledTimer = 0; this.updateLeds(); }
    if (this.slowTimer > 1) { this.slowTimer = 0; this.updateSlow(); }
    this.ex.update(dt, rdt);
    // Gnistrande markering runt det du tittar på
    if (this.hover && this.hlTarget && Math.random() < rdt * 6) {
      var c = new THREE.Vector3(); new THREE.Box3().setFromObject(this.hlTarget).getCenter(c);
      this.fx.sparkle(c);
    }
    this.hl.material.opacity = 0.6 + Math.sin(this.t * 6) * 0.4; this.hl.material.transparent = true;
    this.fx.update(dt, this.camera);
    this.render(rdt, z);
  };
  W.npcSounds = function (dt) {
    var self = this, game = this.game;
    this.ringT = (this.ringT || 12) - dt;
    Object.keys(this.people).forEach(function (n) {
      var f = self.people[n];
      if (!f.group.visible) return;
      var dx = f.group.position.x - self.pos.x, dz = f.group.position.z - self.pos.z, d = Math.hypot(dx, dz);
      var ang = Math.atan2(dx, -dz) + self.yaw;
      var pan = Math.sin(ang);
      if (f.sitting && d < 3.5 && Math.random() < dt * 5) NV.sfx.tap(0.012 * (1 - d / 3.5), pan);
      if (self.ringT <= 0 && f.ringing && d < 14) { NV.sfx.ring(pan); self.ringT = 25; }
    });
    if (this.ringT <= 0) this.ringT = 8;
    // Larmet hörs från serverrummet
    if (this.ex.storm && this.zoneName !== 'Serverrummet' && Math.random() < dt * 0.3) { var a = Math.atan2(-10 - this.pos.x, -(-6 - this.pos.z)) + this.yaw; NV.sfx.alarm(Math.sin(a) * 0.8); }
  };
  W.render = function (rdt, z) {
    var P = this.post;
    if (P) {
      var gr = GRADE[z.name] || GRADE.Korridoren;
      var u = P.u, k = Math.min(1, rdt * 1.5);
      u.uTint.value.x += (gr[0][0] - u.uTint.value.x) * k; u.uTint.value.y += (gr[0][1] - u.uTint.value.y) * k; u.uTint.value.z += (gr[0][2] - u.uTint.value.z) * k;
      u.uExposure.value += (gr[1] * 0.98 * (this.game.goggles ? 0.9 : 1) - u.uExposure.value) * k;
      u.uSat.value += (gr[2] - u.uSat.value) * k;
      u.uTime.value = this.t;
      u.uAlarm.value = this.ex.storm && z.name === 'Serverrummet' ? 0.35 + Math.sin(this.t * 8) * 0.35 : 0;
      this.flashA = Math.max(0, (this.flashA || 0) - rdt * 1.6);
      u.uFlashA.value = this.flashA;
      u.uGoggles.value += ((this.game.goggles ? 1 : 0) - u.uGoggles.value) * Math.min(1, rdt * 5);
      u.uVignette.value = this.zoomed ? 0.7 : 0.35;
      P.render(this.scene, this.camera);
    } else this.renderer.render(this.scene, this.camera);
    this.perf(rdt);
  };
  // Sänk upplösningen om bildfrekvensen blir för låg, och höj den igen när det går bra
  W.perf = function (dt) {
    this.fAcc = (this.fAcc || 0) + dt; this.fN = (this.fN || 0) + 1;
    if (this.fAcc < 1.5) return;
    var fps = this.fN / this.fAcc;
    this.fAcc = 0; this.fN = 0;
    this.fps = fps;
    var el = document.getElementById('fps');
    if (el) { el.style.display = NV.settings.get('showFps') ? 'block' : 'none'; el.textContent = Math.round(fps) + ' fps · ' + Math.round(this.basePR * this.prScale * 100) + '% · ' + this.fx.count() + ' partiklar'; }
    if (this.game.ui && this.game.ui.captures()) return;
    var old = this.prScale;
    if (fps < 38 && this.prScale > 0.55) this.prScale = Math.max(0.55, this.prScale - 0.12);
    else if (fps > 57 && this.prScale < 1) this.prScale = Math.min(1, this.prScale + 0.06);
    if (old !== this.prScale) this.resize();
  };

  return World;
})();
