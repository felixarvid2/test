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
    this.site = 'gbg';
    this.consoleTarget = null;
    this.ledTimer = 0; this.slowTimer = 0;
  }
  var W = World.prototype;

  W.init = function () {
    var r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = r;
    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1e24);
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 200);
    scene.add(new THREE.HemisphereLight(0xf2f5ff, 0x8a8070, 0.95));
    scene.add(new THREE.AmbientLight(0xffffff, 0.12));
    var sun = new THREE.DirectionalLight(0xfff0dc, 1.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
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
    this.buildCables();
    this.collectInteractables();
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 3.2;
    this.center = new THREE.Vector2(0, 0);
    this.teleport('gbg', true);
    this.bindInput();
    this.resize();
    var self = this;
    window.addEventListener('resize', function () { self.resize(); });
  };

  W.resize = function () {
    var w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
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
      if (self.game.ui && self.game.ui.captures()) return;
      self.keys[e.code] = true;
      if (e.code === 'KeyE') self.use();
    });
    document.addEventListener('keyup', function (e) { self.keys[e.code] = false; });
    this.canvas.addEventListener('click', function () {
      if (self.game.ui && self.game.ui.captures()) return;
      if (!self.locked) self.lock();
      else self.use();
    });
    document.addEventListener('pointerlockchange', function () {
      self.locked = document.pointerLockElement === self.canvas;
      if (self.game.ui) self.game.ui.onLockChange(self.locked);
    });
    document.addEventListener('mousemove', function (e) {
      if (!self.locked) return;
      self.yaw -= e.movementX * self.sens;
      self.pitch -= e.movementY * self.sens;
      self.pitch = Math.max(-1.45, Math.min(1.45, self.pitch));
    });
    // Enkel pekskärmsstyrning: dra för att titta, två fingrar för att gå
    var last = null;
    this.canvas.addEventListener('touchstart', function (e) { last = e.touches[0]; self.touchWalk = e.touches.length > 1; }, { passive: true });
    this.canvas.addEventListener('touchmove', function (e) {
      var t = e.touches[0];
      if (last) { self.yaw -= (t.clientX - last.clientX) * 0.005; self.pitch = Math.max(-1.4, Math.min(1.4, self.pitch - (t.clientY - last.clientY) * 0.005)); }
      last = t; self.touchWalk = e.touches.length > 1;
    }, { passive: true });
    this.canvas.addEventListener('touchend', function (e) { if (!e.touches.length) { self.touchWalk = false; if (self.hover) self.use(); } last = null; }, { passive: true });
  };
  W.lock = function () { if (this.canvas.requestPointerLock) this.canvas.requestPointerLock(); };
  W.unlock = function () { if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock(); this.keys = {}; };
  W.use = function () {
    if (!this.hover) return;
    if (this.game.onInteract) this.game.onInteract(this.hover);
  };

  W.teleport = function (site, instant) {
    var A = this.builder.anchors;
    var sp = site === 'boras' ? A.borasSpawn : A.spawn;
    this.pos.set(sp.x, 1.65, sp.z);
    this.yaw = sp.ry;
    this.pitch = -0.05;
    this.site = site;
  };

  W.collides = function (x, z, r) {
    var cs = this.builder.colliders;
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i];
      if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return true;
    }
    return false;
  };
  W.move = function (dt) {
    var k = this.keys;
    var fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0) + (this.touchWalk ? 1 : 0);
    var str = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    var speed = (k.ShiftLeft || k.ShiftRight) ? 5.2 : 3.0;
    var dir = new THREE.Vector3(-Math.sin(this.yaw) * fwd + Math.cos(this.yaw) * str, 0, -Math.cos(this.yaw) * fwd - Math.sin(this.yaw) * str);
    if (dir.lengthSq() > 0) dir.normalize().multiplyScalar(speed);
    this.vel.lerp(dir, Math.min(1, dt * 10));
    var r = 0.28;
    var nx = this.pos.x + this.vel.x * dt;
    if (!this.collides(nx, this.pos.z, r)) this.pos.x = nx; else this.vel.x = 0;
    var nz = this.pos.z + this.vel.z * dt;
    if (!this.collides(this.pos.x, nz, r)) this.pos.z = nz; else this.vel.z = 0;
    var moving = this.vel.length();
    this.bob = (this.bob || 0) + dt * moving * 2.4;
    this.camera.position.set(this.pos.x, 1.65 + Math.sin(this.bob * 2) * 0.018 * Math.min(1, moving / 3), this.pos.z);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  };

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
    for (var i = 0; i < hits.length; i++) {
      var o = hits[i].object;
      if (!o.visible) continue;
      var vis = true, p = o.parent;
      while (p) { if (!p.visible) { vis = false; break; } p = p.parent; }
      if (!vis) continue;
      return o.userData.interact;
    }
    return null;
  };

  // ------------------------------------------------------------------ Visuell återkoppling
  W.ledFn = function (devId) {
    var st = this.game.state;
    var D = S.get(st);
    var d = st.devices[devId];
    var storm = Object.keys(D.storm).some(function (v) { return D.storm[v].indexOf(devId) >= 0; });
    var self = this;
    return function (port, t) {
      if (!d || !d.powered) return '#1d261f';
      if (d.os === 'ios') {
        var i = d.config.ifaces[port];
        if (!i) return '#1d261f';
        var ps = SH.portState(st, d, port);
        if (ps === 'err-disabled') return Math.floor(t * 2) % 2 ? '#ffb020' : '#3a2a10';
        if (ps !== 'connected' && ps !== 'inactive') return '#1d261f';
        var p = D.ports[S.key(devId, port)];
        if (p && p.link.state === 'flapping' && (st.time % 23) < 2.5) return '#1d261f';
        var blk = Object.keys(D.blocked).some(function (k) { return k.indexOf(devId + '|' + port + '#') === 0; });
        if (blk) {
          var allBlocked = S.opMode(st, devId, port) === 'trunk' && S.trunkVlans(d, i).every(function (v) { return D.blocked[S.key(devId, port) + '#' + v]; });
          if (allBlocked) return '#ffb020';
        }
        if (storm) return Math.floor(t * 7) % 2 ? '#3dff6a' : '#16301b';
        if (p && p.mismatch) return Math.random() < 0.5 ? '#ffb020' : '#3dff6a';
        return Math.random() < 0.18 ? '#1d4a26' : '#3dff6a';
      }
      var la = NV.model.linkAt(st, devId, 'nic');
      var up = la && D.links[la.link.id] && D.links[la.link.id].up;
      return up ? (Math.random() < 0.2 ? '#1d4a26' : '#3dff6a') : '#1d261f';
    };
  };
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
      else status = { icon: 'ok', text: c.ip, popup: null };
      NV.devices3d.drawDesktop(pc.monitor.canvas, h.label || id, status);
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
  };
  W.drawMonitorWall = function () {
    var mw = this.dev.extra.monitorWall;
    var st = this.game.state;
    var g = mw.canvas.getContext('2d');
    var series = [
      ['SW-Nordvik-1 Gi0/24 (trunk)', 'SW1', 'GigabitEthernet0/24'],
      ['SW-Nordvik-1 Gi0/6 (Karim)', 'SW1', 'GigabitEthernet0/6'],
      ['R-Nordvik-1 Gi0/1 (internet)', 'R1', 'GigabitEthernet0/1'],
      ['R-Nordvik-1 Gi0/2 (Borås)', 'R1', 'GigabitEthernet0/2'],
    ];
    g.fillStyle = '#1b2430'; g.fillRect(0, 0, 1024, 576);
    g.fillStyle = '#e6edf3'; g.font = 'bold 26px "Segoe UI", sans-serif';
    g.fillText('Nordvik · Övervakning', 24, 40);
    g.font = '16px "Segoe UI", sans-serif'; g.fillStyle = '#8b98a5';
    g.fillText('Trafik senaste 3 minuterna (Mbit/s)', 24, 64);
    var D = S.get(st);
    var alarm = Object.keys(D.storm).length ? 'LARM: trafiken i taket på flera portar' : null;
    series.forEach(function (s, i) {
      var h = mw.hist[s[0]] = mw.hist[s[0]] || [];
      h.push(S.linkLoad(st, s[1], s[2]));
      if (h.length > 180) h.shift();
      var x0 = 24 + (i % 2) * 500, y0 = 90 + Math.floor(i / 2) * 240, w = 476, hh = 200;
      g.fillStyle = '#243040'; g.fillRect(x0, y0, w, hh);
      g.strokeStyle = '#26303a'; g.lineWidth = 1;
      for (var k = 1; k < 4; k++) { g.beginPath(); g.moveTo(x0, y0 + k * hh / 4); g.lineTo(x0 + w, y0 + k * hh / 4); g.stroke(); }
      g.fillStyle = '#c9d4de'; g.font = '15px "Segoe UI", sans-serif'; g.fillText(s[0], x0 + 10, y0 + 22);
      var max = 1000;
      g.beginPath();
      h.forEach(function (v, j) {
        var x = x0 + w - (h.length - 1 - j) * (w / 180);
        var y = y0 + hh - 8 - Math.min(1, v / max) * (hh - 40);
        if (j === 0) g.moveTo(x, y); else g.lineTo(x, y);
      });
      var last = h[h.length - 1] || 0;
      g.strokeStyle = last > 800 ? '#ff5a4f' : '#4fc3f7'; g.lineWidth = 2.5; g.stroke();
      g.fillStyle = last > 800 ? '#ff5a4f' : '#4fc3f7'; g.font = 'bold 16px monospace';
      g.fillText(last.toFixed(0) + ' Mbit/s', x0 + w - 130, y0 + 22);
    });
    if (alarm) { g.fillStyle = Math.floor(this.t * 2) % 2 ? '#ff5a4f' : '#7a1f1a'; g.font = 'bold 22px "Segoe UI", sans-serif'; g.fillText(alarm, 520, 40); }
    mw.tex.needsUpdate = true;
  };
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

  W.update = function (dt) {
    this.t += dt;
    this.move(dt);
    // Skuggorna följer spelaren
    this.sun.position.set(this.pos.x - 8, 16, this.pos.z + 9);
    this.sun.target.position.set(this.pos.x, 0, this.pos.z);
    this.hover = this.pick();
    NV.people.update(this.people, dt, this.t, this.pos, this.game.week);
    this.ledTimer += dt; this.slowTimer += dt;
    if (this.ledTimer > 0.16) { this.ledTimer = 0; this.updateLeds(); }
    if (this.slowTimer > 1) { this.slowTimer = 0; this.updateSlow(); }
    this.renderer.render(this.scene, this.camera);
  };

  return World;
})();
