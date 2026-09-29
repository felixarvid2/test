// Byggnaderna: huvudkontoret i Göteborg och lagret i Borås.
NV.building = (function () {
  var T = NV.tex;

  function Builder(scene) {
    this.scene = scene;
    this.colliders = [];
    this.interact = [];
    this.zones = [];
    this.anchors = {};
    this.lights = [];
    this.mats = {};
    this.sem = [];   // Layoutposter som 2D-läget och kartan ritar från
    this._mute = 0;
  }
  function hexOf(mat) { return mat && mat.color ? '#' + mat.color.getHexString() : '#888888'; }
  var B = Builder.prototype;

  B.m = function (key, make) { return this.mats[key] || (this.mats[key] = make()); };
  B.std = function (color, rough, metal, extra) {
    var k = 'std:' + color + ':' + rough + ':' + metal + ':' + JSON.stringify(extra || {});
    return this.m(k, function () {
      var o = { color: color, roughness: rough !== undefined ? rough : 0.7, metalness: metal || 0 };
      for (var e in extra) o[e] = extra[e];
      return new THREE.MeshStandardMaterial(o);
    });
  };
  B.box = function (w, h, d, x, y, z, mat, o) {
    o = o || {};
    var g = new THREE.BoxGeometry(w, h, d);
    var mesh = new THREE.Mesh(g, mat);
    mesh.position.set(x, y, z);
    if (o.ry) mesh.rotation.y = o.ry;
    mesh.castShadow = o.cast !== false;
    mesh.receiveShadow = o.receive !== false;
    (o.parent || this.scene).add(mesh);
    if (o.collide) this.collide(x, z, o.ry ? d : w, o.ry ? w : d);
    if (!this._mute && !o.parent) this.sem.push({ type: 'box', x: x, z: z, w: o.ry ? d : w, d: o.ry ? w : d, y: y, h: h, color: hexOf(mat), tex: mat.userData && mat.userData.tex, collide: !!o.collide, opacity: mat.opacity });
    return mesh;
  };
  B.cyl = function (rt, rb, h, x, y, z, mat, o) {
    o = o || {};
    var mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, o.seg || 16), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = o.cast !== false; mesh.receiveShadow = true;
    (o.parent || this.scene).add(mesh);
    if (o.collide) this.collide(x, z, rb * 2, rb * 2);
    if (!this._mute && !o.parent) this.sem.push({ type: 'cyl', x: x, z: z, r: Math.max(rt, rb), y: y, h: h, color: hexOf(mat) });
    return mesh;
  };
  B.collide = function (x, z, w, d) {
    this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  };
  B.plane = function (w, h, mat, x, y, z, rx, ry) {
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx || 0, ry || 0, 0);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  };
  // Golv med textur skalad i meter
  B.floor = function (x1, z1, x2, z2, tex, tile, opts) {
    var w = x2 - x1, d = z2 - z1;
    var mat = T.mat(tex, opts, w / tile, d / tile);
    var p = this.plane(w, d, mat, (x1 + x2) / 2, opts && opts.y || 0, (z1 + z2) / 2, -Math.PI / 2, 0);
    this.sem.push({ type: 'floor', x1: x1, z1: z1, x2: x2, z2: z2, tex: tex });
    return p;
  };
  B.ceiling = function (x1, z1, x2, z2, h, lights) {
    var w = x2 - x1, d = z2 - z1;
    var mat = T.mat('ceiling', { roughness: 0.95 }, w / 1.2, d / 1.2);
    mat.emissive = new THREE.Color(0xffffff); mat.emissiveMap = mat.map; mat.emissiveIntensity = 0.28;
    this.plane(w, d, mat, (x1 + x2) / 2, h, (z1 + z2) / 2, Math.PI / 2, 0);
    var panel = this.m('lightpanel', function () { return new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e8, emissiveIntensity: 1.4 }); });
    var self = this;
    (lights || []).forEach(function (p) {
      self.box(0.6, 0.02, 1.2, p[0], h - 0.01, p[1], panel, { cast: false, receive: false });
    });
  };
  // Vägg längs x (z konstant) eller längs z (x konstant), med dörröppningar
  B.wall = function (a, b, fixed, axis, h, mat, doors, t) {
    t = t || 0.12;
    doors = (doors || []).slice().sort(function (p, q) { return p[0] - q[0]; });
    this.sem.push({ type: 'wall', a: a, b: b, fixed: fixed, axis: axis, h: h, doors: doors, t: t, tex: mat.userData && mat.userData.tex });
    this._mute++;
    var segs = [], cur = a;
    doors.forEach(function (d) { segs.push([cur, d[0], 0, h]); segs.push([d[0], d[1], d[2] || 2.1, h]); cur = d[1]; });
    segs.push([cur, b, 0, h]);
    var self = this;
    segs.forEach(function (s) {
      var len = s[1] - s[0];
      if (len <= 0.01) return;
      var hh = s[3] - s[2];
      var mid = (s[0] + s[1]) / 2, y = s[2] + hh / 2;
      var m = mat.clone();
      if (m.map) { m.map = m.map.clone(); m.map.needsUpdate = true; m.map.repeat.set(len / 2, hh / 2); }
      if (axis === 'x') self.box(len, hh, t, mid, y, fixed, m, { collide: s[2] === 0 });
      else self.box(t, hh, len, fixed, y, mid, m, { collide: s[2] === 0 });
    });
    this._mute--;
  };
  B.glassWall = function (a, b, fixed, axis, h, doors) {
    var glass = this.m('glass', function () {
      return new THREE.MeshPhysicalMaterial({ color: 0xcfe3ea, roughness: 0.05, metalness: 0, transmission: 0.0, transparent: true, opacity: 0.22 });
    });
    var frame = this.std(0x3a3f45, 0.5, 0.6);
    var len = b - a;
    doors = doors || [];
    var self = this;
    this.sem.push({ type: 'glass', a: a, b: b, fixed: fixed, axis: axis, h: h, doors: doors });
    this._mute++;
    var cur = a;
    var pieces = [];
    doors.forEach(function (d) { pieces.push([cur, d[0]]); cur = d[1]; });
    pieces.push([cur, b]);
    pieces.forEach(function (p) {
      var l = p[1] - p[0];
      if (l <= 0.01) return;
      var mid = (p[0] + p[1]) / 2;
      if (axis === 'x') {
        self.box(l, h, 0.03, mid, h / 2, fixed, glass, { collide: true, cast: false });
        self.box(l, 0.06, 0.08, mid, 0.03, fixed, frame);
        self.box(l, 0.06, 0.08, mid, h - 0.03, fixed, frame);
        for (var k = 0; k <= Math.floor(l / 1.2); k++) self.box(0.05, h, 0.08, p[0] + Math.min(l, k * 1.2), h / 2, fixed, frame);
      } else {
        self.box(0.03, h, l, fixed, h / 2, mid, glass, { collide: true, cast: false });
        self.box(0.08, 0.06, l, fixed, 0.03, mid, frame);
        self.box(0.08, 0.06, l, fixed, h - 0.03, mid, frame);
        for (var k2 = 0; k2 <= Math.floor(l / 1.2); k2++) self.box(0.08, h, 0.05, fixed, h / 2, p[0] + Math.min(l, k2 * 1.2), frame);
      }
    });
    this._mute--;
  };
  // Fönster som ljus panel framför ytterväggen
  B.window = function (x, y, z, w, h, ry) {
    var sky = this.m('skyWin', function () {
      return new THREE.MeshStandardMaterial({ map: T.get('sky'), emissive: 0xffffff, emissiveMap: T.get('sky'), emissiveIntensity: 0.9, roughness: 1 });
    });
    var frame = this.std(0xf2f2ef, 0.5, 0.1);
    var g = new THREE.Group();
    g.position.set(x, y, z); g.rotation.y = ry || 0;
    this.sem.push({ type: 'window', x: x, y: y, z: z, w: w, h: h, ry: ry || 0 });
    var glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), sky);
    g.add(glass);
    var parts = [[w + 0.1, 0.06, 0, h / 2], [w + 0.1, 0.06, 0, -h / 2], [0.06, h, -w / 2, 0], [0.06, h, w / 2, 0], [0.04, h, 0, 0]];
    parts.forEach(function (p) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(p[0], p[1], 0.06), frame);
      m.position.set(p[2], p[3], 0.02);
      g.add(m);
    });
    var sill = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.04, 0.22), frame);
    sill.position.set(0, -h / 2 - 0.02, 0.1);
    sill.receiveShadow = true;
    g.add(sill);
    this.scene.add(g);
    return g;
  };
  B.zone = function (name, x1, z1, x2, z2, site) { this.zones.push({ name: name, minX: x1, maxX: x2, minZ: z1, maxZ: z2, site: site }); };
  B.pointLight = function (x, y, z, color, intensity, dist) {
    var l = new THREE.PointLight(color || 0xfff1dc, intensity || 6, dist || 9, 2);
    l.position.set(x, y, z);
    this.scene.add(l);
    this.lights.push(l);
    return l;
  };

  // ------------------------------------------------------------------ Möbler
  B.desk = function (x, z, ry, color) {
    this.sem.push({ type: 'desk', x: x, z: z, ry: ry || 0, color: color || 0xf1efe9 });
    var M = NV.models;
    var g = new THREE.Group();
    g.position.set(x, 0, z); g.rotation.y = ry || 0;
    var top = this.std(color || 0xf1efe9, 0.5, 0);
    var edge = this.std(0x3a3f45, 0.5, 0.3);
    var leg = this.std(0x2c2f34, 0.35, 0.75);
    M.mesh(M.rbox(1.6, 0.035, 0.8, 0.012), top, 0, 0.745, 0, g);
    M.mesh(M.rbox(1.605, 0.012, 0.805, 0.005), edge, 0, 0.726, 0, g, false);
    // T-ben med fötter och kabelränna
    [-0.72, 0.72].forEach(function (lx) {
      M.mesh(M.rbox(0.06, 0.7, 0.06, 0.012), leg, lx, 0.37, 0, g);
      M.mesh(M.rbox(0.08, 0.03, 0.72, 0.012), leg, lx, 0.015, 0, g);
      M.mesh(M.rbox(0.07, 0.03, 0.7, 0.01), leg, lx, 0.715, 0, g, false);
    });
    M.mesh(M.rbox(1.4, 0.05, 0.12, 0.01), leg, 0, 0.66, -0.3, g, false);
    // Låda med hurts
    var ped = this.std(0xd9d6cf, 0.5, 0.05);
    M.mesh(M.rbox(0.42, 0.55, 0.55, 0.015), ped, 0.52, 0.29, -0.08, g);
    [0.45, 0.28, 0.12].forEach(function (y) { M.mesh(M.rbox(0.14, 0.015, 0.015, 0.005), leg, 0.52, y, 0.197, g, false); });
    // Skärmvägg
    var screen = M.mesh(M.rbox(1.5, 0.36, 0.035, 0.015), this.std(0x6f7f78, 0.95, 0), 0, 0.95, -0.4, g);
    M.mesh(M.rbox(1.52, 0.02, 0.04, 0.008), edge, 0, 1.135, -0.4, g, false);
    this.scene.add(g);
    var w = Math.abs(Math.sin(ry || 0)) > 0.5 ? 0.8 : 1.6, d = Math.abs(Math.sin(ry || 0)) > 0.5 ? 1.6 : 0.8;
    this.collide(x, z, w, d);
    return g;
  };
  B.chair = function (x, z, ry, color) {
    this.sem.push({ type: 'chair', x: x, z: z, ry: ry || 0, color: color || 0x30343b });
    var M = NV.models;
    var g = new THREE.Group();
    g.position.set(x, 0, z); g.rotation.y = ry || 0;
    var seatM = this.std(color || 0x30343b, 0.85, 0);
    var plastic = this.std(0x1d1f22, 0.45, 0.2);
    var metal = this.std(0x8a8f96, 0.3, 0.9);
    M.mesh(M.rbox(0.5, 0.08, 0.48, 0.035), seatM, 0, 0.48, 0, g);
    var back = M.mesh(M.rbox(0.46, 0.56, 0.07, 0.04), seatM, 0, 0.84, 0.25, g); back.rotation.x = 0.1;
    M.mesh(M.rbox(0.06, 0.3, 0.03, 0.012), plastic, 0, 0.6, 0.27, g);
    // Armstöd
    [-0.26, 0.26].forEach(function (ax) {
      M.mesh(M.rbox(0.035, 0.18, 0.035, 0.01), plastic, ax, 0.6, 0.02, g);
      M.mesh(M.rbox(0.06, 0.03, 0.24, 0.012), plastic, ax, 0.7, 0.0, g);
    });
    M.mesh(M.cyl(0.03, 0.03, 0.3, 10), metal, 0, 0.29, 0, g);
    M.mesh(M.cyl(0.045, 0.045, 0.08, 10), plastic, 0, 0.16, 0, g);
    // Femarmat kryss med hjul
    for (var i = 0; i < 5; i++) {
      var a = i / 5 * Math.PI * 2;
      var arm = M.mesh(M.rbox(0.3, 0.03, 0.045, 0.012), plastic, Math.cos(a) * 0.15, 0.08, Math.sin(a) * 0.15, g);
      arm.rotation.y = -a;
      var wheel = M.mesh(M.sphere(0.028, 10, 8), plastic, Math.cos(a) * 0.29, 0.03, Math.sin(a) * 0.29, g);
      wheel.scale.set(1, 1, 0.7);
    }
    this.scene.add(g);
    return g;
  };
  B.plant = function (x, z, s) {
    s = s || 1;
    this.sem.push({ type: 'plant', x: x, z: z, s: s });
    var M = NV.models;
    this._mute++;
    var pot = this.std(0xe7e2d8, 0.55, 0);
    this.cyl(0.18 * s, 0.14 * s, 0.4 * s, x, 0.2 * s, z, pot, { collide: true });
    var rim = new THREE.Mesh(M.geo('potRim', function () { return new THREE.TorusGeometry(1, 0.08, 6, 20); }), pot);
    rim.scale.set(0.18 * s, 0.18 * s, 0.18 * s); rim.rotation.x = Math.PI / 2; rim.position.set(x, 0.4 * s, z);
    this.scene.add(rim);
    var soil = new THREE.Mesh(M.cyl(0.17 * s, 0.17 * s, 0.02, 16), this.std(0x3b2a1e, 1, 0));
    soil.position.set(x, 0.38 * s, z); this.scene.add(soil);
    var leafM = [this.std(0x3f7a47, 0.7, 0, { side: THREE.DoubleSide }), this.std(0x2f6238, 0.7, 0, { side: THREE.DoubleSide }), this.std(0x55924f, 0.7, 0, { side: THREE.DoubleSide })];
    var n = M.detail() === 0 ? 7 : 16;
    for (var i = 0; i < n; i++) {
      var m = new THREE.Mesh(M.leaf(0.42 * s * (0.8 + (i % 4) * 0.12), 0.13 * s), leafM[i % 3]);
      var a = i * 2.4;
      m.position.set(x + Math.cos(a) * 0.03 * s, 0.38 * s, z + Math.sin(a) * 0.03 * s);
      m.rotation.set(0, -a + Math.PI / 2, 0);
      m.rotateX(-(0.25 + (i % 5) * 0.14));
      m.castShadow = true;
      m.userData.sway = true;
      this.scene.add(m);
      (this.plants = this.plants || []).push({ m: m, rz: m.rotation.z });
    }
    this._mute--;
  };
  B.sofa = function (x, z, ry, tex) {
    this.sem.push({ type: 'sofa', x: x, z: z, ry: ry || 0, tex: tex || 'fabricMustard' });
    var M = NV.models;
    var g = new THREE.Group();
    g.position.set(x, 0, z); g.rotation.y = ry || 0;
    var m = T.mat(tex || 'fabricMustard', {}, 2, 1);
    var leg = this.std(0x3a2a1c, 0.5, 0.1);
    M.mesh(M.rbox(2, 0.22, 0.85, 0.06), m, 0, 0.2, 0, g);
    [-0.47, 0.47].forEach(function (cx) { M.mesh(M.rbox(0.9, 0.16, 0.66, 0.07), m, cx, 0.38, -0.06, g); });
    [-0.47, 0.47].forEach(function (cx) { var bc = M.mesh(M.rbox(0.9, 0.44, 0.18, 0.08), m, cx, 0.62, 0.3, g); bc.rotation.x = -0.12; });
    [-0.95, 0.95].forEach(function (ax) { M.mesh(M.rbox(0.18, 0.4, 0.85, 0.07), m, ax, 0.42, 0, g); });
    [[-0.9, -0.35], [0.9, -0.35], [-0.9, 0.35], [0.9, 0.35]].forEach(function (p) { M.mesh(M.cyl(0.025, 0.02, 0.1, 8), leg, p[0], 0.05, p[1], g); });
    this.scene.add(g);
    this.collide(x, z, Math.abs(Math.sin(ry || 0)) > 0.5 ? 0.85 : 2, Math.abs(Math.sin(ry || 0)) > 0.5 ? 2 : 0.85);
  };
  B.cabinet = function (x, z, w, h, d, color, ry) {
    return this.box(w, h, d, x, h / 2, z, this.std(color || 0xdedad2, 0.6, 0), { collide: true, ry: ry });
  };

  // ------------------------------------------------------------------ Göteborg
  function buildGbg(b) {
    var H = 3;
    var wallM = T.mat('wall', {}, 1, 1);
    var tealM = T.mat('wallTeal', {}, 1, 1);
    var warmM = T.mat('wallWarm', {}, 1, 1);
    // Golv
    b.floor(-15, -2, 15, 10, 'carpet', 2);
    b.floor(-15, -10, -6, -2, 'raised', 0.6, { roughness: 0.6 });
    b.floor(-6, -10, 3, -2, 'wood', 3, { roughness: 0.6 });
    b.floor(3, -10, 15, -2, 'wood', 3, { roughness: 0.55 });
    // Tak med ljuspaneler
    var lights = [];
    for (var lx = -12; lx <= 13; lx += 4) for (var lz = -7.5; lz <= 8.5; lz += 4) lights.push([lx, lz]);
    b.ceiling(-15, -10, 15, 10, H, lights);
    // Ytterväggar
    b.wall(-15, 15, 10, 'x', H, wallM);
    b.wall(-15, 15, -10, 'x', H, wallM, [[9.5, 11.5, 2.3]]);
    b.wall(-10, 10, -15, 'z', H, wallM);
    b.wall(-10, 10, 15, 'z', H, tealM);
    // Innerväggar
    b.wall(-15, -5, 2, 'x', H, warmM, [[-10, -8.8]]);
    b.glassWall(2, 10, -5, 'z', H);
    b.wall(-15, 15, -2, 'x', H, wallM, [[-11, -9.8], [-2.2, -1], [5, 9, H]]);
    b.wall(-10, -2, -6, 'z', H, wallM);
    b.wall(-10, -2, 3, 'z', H, warmM);
    // Fönster
    [-11, -7, 0, 4, 8, 12].forEach(function (x) { b.window(x, 1.6, 9.93, 1.8, 1.4, Math.PI); });
    [2, 6].forEach(function (z) { b.window(14.93, 1.6, z, 1.8, 1.4, -Math.PI / 2); });
    [-6, 5].forEach(function (z) { b.window(-14.93, 1.6, z, 1.6, 1.3, Math.PI / 2); });
    [5, 13.5].forEach(function (x) { b.window(x, 1.6, -9.93, 1.6, 1.3, 0); });
    // Entré: glasdörrar mot parkeringen
    var door = b.std(0x9fc4d8, 0.1, 0.1, { transparent: true, opacity: 0.45 });
    var d1 = b.box(0.98, 2.25, 0.04, 10, 1.125, -10, door, { cast: false });
    var d2 = b.box(0.98, 2.25, 0.04, 11, 1.125, -10, door, { cast: false });
    b.box(2.1, 0.08, 0.1, 10.5, 2.28, -10, b.std(0x3a3f45, 0.4, 0.6));
    b.collide(10.5, -10, 2, 0.2);
    var mat2 = b.std(0x2d3238, 0.9, 0);
    b.box(2.2, 0.01, 1.2, 10.5, 0.005, -9.3, mat2, { cast: false });
    d1.userData.baseX = 10; d2.userData.baseX = 11;
    d1.userData.dynamic = d2.userData.dynamic = true;
    b.anchors.entranceDoors = [d1, d2];
    b.interact.push({ mesh: d1, type: 'travel', to: 'boras', label: 'Åk till lagret i Borås' });
    b.interact.push({ mesh: d2, type: 'travel', to: 'boras', label: 'Åk till lagret i Borås' });
    var sign = T.label('ENTRÉ  ·  Bilen till Borås →', { height: 0.16, bg: 'rgba(30,60,70,0.9)' });
    sign.position.set(10.5, 2.55, -9.85); b.scene.add(sign);

    // Zoner
    b.zone('Serverrummet', -15, -10, -6, -2, 'gbg');
    b.zone('Fikarummet', -6, -10, 3, -2, 'gbg');
    b.zone('Receptionen', 3, -10, 15, -2, 'gbg');
    b.zone('Ekonomi', -15, 2, -5, 10, 'gbg');
    b.zone('Korridoren', -15, -2, -5, 2, 'gbg');
    b.zone('Kontorslandskapet', -5, -2, 15, 10, 'gbg');

    // Skyltar vid dörrarna
    [['SERVERRUM', -10.4, -1.93, 0], ['FIKARUM', -1.6, -1.93, 0], ['EKONOMI', -9.4, 2.07, Math.PI]].forEach(function (s) {
      var l = T.label(s[0], { height: 0.11, bg: 'rgba(40,44,52,0.92)' });
      l.position.set(s[1], 2.35, s[2]); b.scene.add(l);
    });

    // --- Serverrum
    b.anchors.rackA = { x: -12.4, z: -9.35, ry: 0 };
    b.anchors.rackB = { x: -11.7, z: -9.35, ry: 0 };
    b.anchors.bench = { x: -14.35, z: -5.2 };
    b.desk(-14.35, -5.2, Math.PI / 2, 0xd8d4cb);
    b.chair(-13.6, -5.2, -Math.PI / 2);
    b.anchors.monitorWall = { x: -8.2, y: 1.75, z: -2.08 };
    b.anchors.fiber = { x: -10.2, y: 1.2, z: -9.92 };
    b.cabinet(-14.55, -8.8, 0.8, 1.9, 0.5, 0x9aa0a6);
    // Kabelstege ovanför racken
    var ladder = b.std(0x8b9096, 0.5, 0.6);
    [-9.0, -9.7].forEach(function (z) { b.box(6.5, 0.04, 0.04, -11.2, 2.45, z, ladder, { cast: false }); });
    for (var lx2 = -14.3; lx2 <= -8; lx2 += 0.3) b.box(0.03, 0.03, 0.7, lx2, 2.45, -9.35, ladder, { cast: false });
    [-13.9, -8.3].forEach(function (x) { b.box(0.03, 0.55, 0.03, x, 2.72, -9.35, ladder, { cast: false }); });
    // Reservkablar och brandsläckare
    b.box(0.6, 0.35, 0.4, -14.5, 0.175, -7.3, b.std(0x2f5d8a, 0.7, 0), { collide: true });
    var rk = T.label('Reservkablar', { height: 0.06 }); rk.position.set(-14.5, 0.5, -7.3); b.scene.add(rk);
    b.cyl(0.08, 0.08, 0.5, -6.4, 0.45, -2.4, b.std(0xc0282d, 0.4, 0.2));
    b.box(0.12, 0.06, 0.06, -6.4, 0.73, -2.4, b.std(0x1a1a1a, 0.5, 0.3));
    // Affisch med reglerna för racket
    var pc = T.canvas(512, 700), pg = pc.getContext('2d');
    pg.fillStyle = '#fbfaf5'; pg.fillRect(0, 0, 512, 700);
    pg.fillStyle = '#1f4e79'; pg.fillRect(0, 0, 512, 110);
    pg.fillStyle = '#fff'; pg.font = 'bold 44px "Segoe UI", sans-serif'; pg.fillText('Regler för racket', 30, 72);
    pg.fillStyle = '#1d1d1d'; pg.font = '28px "Segoe UI", sans-serif';
    ['1. Lämna enheten som du', '    hittade den.', '2. Inga lösenord i repot.', '3. Märk trasiga portar', '    och kablar.', '4. Dra aldrig ur en kabel', '    utan att veta vad som', '    sitter i andra änden.', '', 'Konsol: 9600 8N1', 'Spara: write memory'].forEach(function (l, i) { pg.fillText(l, 34, 170 + i * 44); });
    var pt = T.toTex(pc);
    var poster = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.75), new THREE.MeshStandardMaterial({ map: pt, roughness: 0.8, emissive: 0xffffff, emissiveMap: pt, emissiveIntensity: 0.12 }));
    poster.position.set(-14.93, 1.55, -3.4); poster.rotation.y = Math.PI / 2; b.scene.add(poster);
    // Kylaggregat
    b.box(0.9, 1.9, 0.7, -7, 0.95, -9.5, b.std(0xe5e7e8, 0.5, 0.2), { collide: true });
    b.box(0.7, 0.4, 0.02, -7, 1.3, -9.14, b.std(0x2b2f35, 0.4, 0.3));

    // --- Fikarum
    b.box(4, 0.9, 0.62, -1.5, 0.45, -9.6, b.std(0xf3f1ec, 0.5, 0), { collide: true });
    b.box(4, 0.04, 0.66, -1.5, 0.92, -9.6, b.std(0x2c2f35, 0.3, 0.1));
    b.anchors.coffee = b.box(0.35, 0.42, 0.35, -2.8, 1.15, -9.6, b.std(0x1f2124, 0.3, 0.6));
    b.box(0.7, 1.85, 0.66, 1.8, 0.925, -9.55, b.std(0xdfe2e4, 0.3, 0.3), { collide: true });
    b.cyl(0.6, 0.6, 0.04, -1.5, 0.74, -5.8, b.std(0xf5f3ee, 0.4, 0), { collide: true });
    b.cyl(0.05, 0.08, 0.72, -1.5, 0.36, -5.8, b.std(0x2c2f34, 0.4, 0.7));
    [[-2.4, -5.8, Math.PI / 2], [-0.6, -5.8, -Math.PI / 2], [-1.5, -4.9, Math.PI]].forEach(function (c) { b.chair(c[0], c[1], c[2], 0xa04c3a); });
    b.anchors.whiteboard = { x: -5.93, y: 1.55, z: -6 };
    b.plant(2.4, -2.6, 1.2);

    // --- Reception
    b.box(2.4, 1.05, 0.7, 7.2, 0.525, -6.2, b.std(0xf4f2ed, 0.5, 0), { collide: true });
    b.box(2.5, 0.05, 0.9, 7.2, 1.07, -6.25, b.std(0x6d4a2f, 0.5, 0));
    b.box(2.4, 1.05, 0.04, 7.2, 0.525, -5.84, b.std(0x3c7478, 0.7, 0));
    b.chair(7.2, -7.2, 0);
    b.sofa(12.8, -8.9, 0, 'fabricBlue');
    b.box(1.2, 0.4, 0.6, 12.8, 0.2, -7.6, b.std(0x6d4a2f, 0.5, 0), { collide: true });
    b.anchors.guestTable = { x: 13.6, z: -3.4 };
    b.box(1.2, 0.72, 0.6, 13.6, 0.36, -3.4, b.std(0xf4f2ed, 0.5, 0), { collide: true });
    b.chair(13.6, -4.3, Math.PI);
    b.plant(4, -9.3, 1.3);
    b.plant(14.3, -2.6, 1.1);
    var rec = T.label('RECEPTION', { height: 0.14, bg: 'rgba(60,116,120,0.95)' });
    rec.position.set(7.2, 1.35, -5.8); b.scene.add(rec);

    // --- Kontorslandskap
    b.anchors.desks = {
      'PC-Anna': { x: -2.5, z: 4 }, 'PC-Karim': { x: 0, z: 4 }, 'PC-Sara': { x: 2.5, z: 4 },
      'PC-Lisa': { x: -2.5, z: 7.3 }, empty1: { x: 0, z: 7.3 }, empty2: { x: 2.5, z: 7.3 },
      'PC-Bo': { x: -12, z: 6 }, 'PC-Maja': { x: -8.6, z: 6 },
    };
    b.anchors.printer = { x: 8, z: 9.3 };
    b.box(1.6, 0.74, 1, 10.8, 0.37, 5.6, b.std(0x6d4a2f, 0.55, 0), { collide: true });
    [[10.2, 4.8, 0], [11.4, 4.8, 0], [10.2, 6.4, Math.PI], [11.4, 6.4, Math.PI]].forEach(function (c) { b.chair(c[0], c[1], c[2], 0x4a6f8a); });
    b.plant(6.5, 9.4, 1.2); b.plant(-4.4, 9.4, 1); b.plant(14.4, 9.4, 1.3); b.plant(-4.4, -1.4, 1);
    b.sofa(-12.5, -0.2, Math.PI / 2, 'fabricGray');
    b.cabinet(-14.6, 9.5, 1.2, 1.2, 0.45, 0xd8d4cb);
    b.cabinet(-5.8, 9.6, 0.8, 1.9, 0.4, 0x9aa0a6);
    b.cabinet(4.8, 9.6, 1.2, 0.75, 0.45, 0xd8d4cb);
    decorGbg(b);

    b.anchors.spawn = { x: -9.5, z: -1.2, ry: Math.PI };
  }

  // Detaljer som gör kontoret levande: vattenautomat, bokhylla, mattor, tavlor, pärmar och skylt
  function decorGbg(b) {
    var M = NV.models;
    // Vattenautomat i fikarummet
    b.anchors.water = { x: 0.97, z: -9.62 };
    b.box(0.34, 1.0, 0.34, 0.97, 0.5, -9.62, b.std(0xe9ecef, 0.4, 0.2), { collide: true });
    var bottle = b.cyl(0.13, 0.13, 0.42, 0.97, 1.22, -9.62, b.std(0x9fd3f0, 0.05, 0, { transparent: true, opacity: 0.55 }));
    bottle.userData.interact = { type: 'water' };
    b.box(0.08, 0.05, 0.06, 0.97, 0.78, -9.43, b.std(0x2f6fd6, 0.4, 0.2)).userData.interact = { type: 'water' };
    b.anchors.waterMesh = bottle;
    // Bokhylla med pärmar i ekonomi
    var wood = b.std(0x8a6a48, 0.6, 0);
    b.box(0.36, 1.9, 1.4, -14.78, 0.95, 4.6, wood, { collide: true });
    var binders = [0x2f6fd6, 0xc0392b, 0x3fbf6f, 0xf0b429, 0x8e5ea2, 0x444a52];
    b._mute++;
    [0.35, 0.8, 1.25, 1.7].forEach(function (y, row) {
      b.box(0.34, 0.025, 1.36, -14.77, y - 0.2, 4.6, wood);
      for (var i = 0; i < 9; i++) {
        if ((i + row) % 7 === 3) continue;
        var h = 0.3 + ((i * 3 + row) % 3) * 0.03;
        b.box(0.26, h, 0.07, -14.74, y - 0.19 + h / 2, 4.02 + i * 0.14, b.std(binders[(i + row * 2) % binders.length], 0.55, 0));
      }
    });
    // Pärmar och papper på skrivborden
    ['PC-Anna', 'PC-Karim', 'PC-Sara', 'PC-Bo', 'PC-Maja'].forEach(function (id, k) {
      var d = b.anchors.desks[id];
      if (!d) return;
      for (var j = 0; j < 3; j++) b.box(0.3, 0.012, 0.22, d.x - 0.5 + (k % 2) * 0.1, 0.775 + j * 0.013, d.z - 0.12, b.std(0xfafaf7, 0.8, 0), { cast: false });
      b.box(0.07, 0.3, 0.24, d.x - 0.72, 0.92, d.z - 0.25, b.std(binders[k], 0.55, 0));
    });
    b._mute--;
    // Mattor
    function rug(x, z, w, d, c1, c2) {
      var c = T.canvas(256, 256), g = c.getContext('2d');
      g.fillStyle = c1; g.fillRect(0, 0, 256, 256);
      g.strokeStyle = c2; g.lineWidth = 14; g.strokeRect(18, 18, 220, 220);
      g.lineWidth = 4; g.strokeRect(40, 40, 176, 176);
      for (var i = 0; i < 3000; i++) { g.fillStyle = 'rgba(0,0,0,' + Math.random() * 0.06 + ')'; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: T.toTex(c), roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }));
      m.rotation.x = -Math.PI / 2; m.position.set(x, 0.006, z); m.receiveShadow = true;
      b.scene.add(m);
      b.sem.push({ type: 'box', x: x, z: z, w: w, d: d, y: 0.003, h: 0.006, color: c1, collide: false });
    }
    rug(12.8, -8.1, 3, 2, '#5a6e8a', '#d9c8ae');
    rug(10.8, 5.6, 3.4, 2.6, '#8a5a4a', '#e9dcc4');
    // Tavlor med abstrakt konst
    function art(x, y, z, ry, seed, w, h) {
      var c = T.canvas(256, 192), g = c.getContext('2d'), r = seed;
      function rnd() { r = (r * 16807) % 2147483647; return r / 2147483647; }
      var pal = [['#f4efe6', '#1f4e79', '#e07b24', '#3c7478', '#f0b429'], ['#20252b', '#c8553d', '#f3d0b5', '#7b9e3a', '#5a7fa6'], ['#eae4d8', '#2f6238', '#d9a441', '#8e5ea2', '#c0392b']][seed % 3];
      g.fillStyle = pal[0]; g.fillRect(0, 0, 256, 192);
      for (var i = 0; i < 7; i++) { g.fillStyle = pal[1 + (i % 4)]; if (i % 2) { g.beginPath(); g.arc(rnd() * 256, rnd() * 192, 20 + rnd() * 50, 0, Math.PI * 2); g.fill(); } else g.fillRect(rnd() * 200, rnd() * 150, 30 + rnd() * 90, 20 + rnd() * 70); }
      var g2 = new THREE.Group(); g2.position.set(x, y, z); g2.rotation.y = ry;
      var frame = new THREE.Mesh(M.rbox(w + 0.08, h + 0.08, 0.04, 0.01), b.std(0x2a211c, 0.4, 0.2)); g2.add(frame);
      var pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: T.toTex(c), roughness: 0.7 })); pic.position.z = 0.021; g2.add(pic);
      b.scene.add(g2);
    }
    art(14.94, 1.65, -0.9, -Math.PI / 2, 11, 1.0, 0.75);
    art(-9, 1.7, 9.94, Math.PI, 23, 1.2, 0.8);
    art(-13, 1.6, 1.93, Math.PI, 37, 0.9, 0.65);
    // Nordvik-skylt i receptionen som lyser
    var lc = T.canvas(512, 128), lg = lc.getContext('2d');
    lg.fillStyle = '#ffffff'; lg.font = 'bold 86px "Segoe UI", sans-serif'; lg.fillText('NORDVIK', 40, 96);
    lg.font = '80px sans-serif'; lg.fillText('🦀', 420, 98);
    var logo = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshBasicMaterial({ map: T.toTex(lc), transparent: true, color: new THREE.Color(1.6, 1.8, 1.9) }));
    logo.position.set(7.2, 2.35, -9.92); b.scene.add(logo);
    // Kabelrullar på kroken i serverrummet
    [0x2f6fd6, 0xe8c23a, 0x3daa5b, 0xf08a2c].forEach(function (col, i) {
      b.box(0.04, 0.04, 0.12, -14.93, 1.75, -6.9 + i * 0.35, b.std(0x777c82, 0.4, 0.8), { cast: false });
      var coil = new THREE.Mesh(M.geo('coil', function () { return new THREE.TorusGeometry(0.12, 0.012, 6, 24); }), b.std(col, 0.6, 0));
      coil.position.set(-14.9, 1.62, -6.9 + i * 0.35); coil.rotation.y = Math.PI / 2; coil.castShadow = true;
      b.scene.add(coil);
    });
  }

  // ------------------------------------------------------------------ Borås
  function buildBoras(b) {
    var H = 6.5;
    var X1 = 88, X2 = 112, Z1 = -12, Z2 = 12;
    b.floor(X1, Z1, X2, Z2, 'concrete', 4, { roughness: 0.8 });
    // Gula markeringar
    var yellow = b.std(0xe4b52a, 0.6, 0);
    [-3, 3].forEach(function (z) { b.box(20, 0.005, 0.1, 102, 0.004, z, yellow, { cast: false }); });
    var wallM = T.mat('concreteDark', {}, 1, 1);
    b.wall(X1, X2, Z1, 'x', H, wallM, [], 0.25);
    b.wall(X1, X2, Z2, 'x', H, wallM, [], 0.25);
    b.wall(Z1, Z2, X1, 'z', H, wallM, [[-0.9, 0.9, 2.3]], 0.25);
    b.wall(Z1, Z2, X2, 'z', H, wallM, [[-2.5, 2.5, 4]], 0.25);
    // Porten vid lastkajen
    var port = b.std(0x8a9199, 0.5, 0.6);
    for (var i = 0; i < 12; i++) b.box(0.08, 0.3, 5, X2 - 0.05, 4 - 0.33 * i - 0.2, 0, port, { cast: false });
    b.collide(X2, 0, 0.3, 5);
    // Tak med lysrör
    var roof = b.std(0x6d7176, 0.9, 0.2);
    b.plane(X2 - X1, Z2 - Z1, roof, 100, H, 0, Math.PI / 2, 0);
    var tube = b.m('tube', function () { return new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4f8ff, emissiveIntensity: 2 }); });
    for (var x = 92; x <= 108; x += 4) for (var z = -9; z <= 9; z += 6) {
      var tm = b.box(1.5, 0.05, 0.12, x, H - 0.4, z, x === 108 && z === 3 ? tube.clone() : tube, { cast: false, receive: false });
      if (x === 108 && z === 3) { b.anchors.flickerTube = tm; tm.material.userData.keep = true; }
    }
    for (var bx = 90; bx <= 110; bx += 5) b.box(0.25, 0.35, Z2 - Z1, bx, H - 0.18, 0, roof, { cast: false });
    // Pallställ
    var upright = b.std(0xd96b1f, 0.5, 0.3), beam = b.std(0x2b5aa0, 0.5, 0.3);
    var boxC = [0xb58a5a, 0xa47b4d, 0xc49b69, 0x8f6a44];
    // Kartong med tejp och fraktsedel, och lastpallar av trä
    var cc = T.canvas(128, 128), cg = cc.getContext('2d');
    cg.fillStyle = '#ffffff'; cg.fillRect(0, 0, 128, 128);
    cg.fillStyle = 'rgba(0,0,0,0.06)'; for (var fi = 0; fi < 128; fi += 3) cg.fillRect(fi, 0, 1, 128);
    cg.fillStyle = '#d8c7a4'; cg.fillRect(0, 54, 128, 20);
    cg.fillStyle = '#f7f7f2'; cg.fillRect(78, 84, 36, 26);
    cg.fillStyle = '#333'; for (var li2 = 0; li2 < 4; li2++) cg.fillRect(82, 88 + li2 * 5, 18 + (li2 % 2) * 8, 2);
    var cardTex = T.toTex(cc);
    var boxMats = boxC.map(function (c) { return b.m('card' + c, function () { var m = new THREE.MeshStandardMaterial({ color: c, map: cardTex, roughness: 0.9 }); return m; }); });
    var pc2 = T.canvas(128, 32), pg2 = pc2.getContext('2d');
    pg2.fillStyle = '#b08a58'; pg2.fillRect(0, 0, 128, 32);
    pg2.fillStyle = '#5a4128'; [[14, 12, 22], [53, 12, 22], [92, 12, 22]].forEach(function (r) { pg2.fillRect(r[0], r[1], r[2], 20); });
    pg2.fillStyle = 'rgba(0,0,0,0.25)'; pg2.fillRect(0, 10, 128, 2);
    var palletM = b.m('pallet', function () { return new THREE.MeshStandardMaterial({ map: T.toTex(pc2), roughness: 0.95 }); });
    b._mute++;
    [-7.5, -1.5, 5].forEach(function (rz, ri) {
      b.sem.push({ type: 'pallet', x0: 95, z: rz, bays: 5, bay: 2.8, h: 4.2, seed: ri });
      for (var bay = 0; bay < 5; bay++) {
        var x0 = 95 + bay * 2.8;
        [x0, x0 + 2.7].forEach(function (ux) { [rz - 0.5, rz + 0.5].forEach(function (uz) { b.box(0.08, 4.2, 0.08, ux, 2.1, uz, upright); }); });
        [1.4, 2.8, 4.1].forEach(function (y) { [rz - 0.5, rz + 0.5].forEach(function (uz) { b.box(2.7, 0.1, 0.06, x0 + 1.35, y, uz, beam); }); });
        [0.1, 1.45, 2.85].forEach(function (y, li) {
          for (var k = 0; k < 2; k++) {
            if ((bay + li + k + ri) % 5 === 0) continue;
            var hgt = 0.6 + ((bay * 7 + li * 3 + k) % 4) * 0.15;
            b.box(1.2, 0.12, 0.95, x0 + 0.7 + k * 1.3, y + 0.11, rz, palletM);
            b.box(1.1, hgt, 0.9, x0 + 0.7 + k * 1.3, y + 0.17 + hgt / 2, rz, boxMats[(bay + k + li) % 4]);
          }
        });
      }
      b.collide(95 + 7, rz, 14.2, 1.1);
    });
    b._mute--;
    // Lagerkontoret i hörnet
    var glassH = 2.6;
    b.glassWall(Z1, -6.5, 93.5, 'z', glassH, [[-9.2, -8.1]]);
    b.wall(X1, 93.5, -6.5, 'x', glassH, T.mat('wallWarm', {}, 1, 1));
    b.floor(X1, Z1, 93.5, -6.5, 'wood', 3, { y: 0.003 });
    b.anchors.borasRack = { x: 88.45, z: -10.3, ry: Math.PI / 2 };
    b.anchors.desks = b.anchors.desks || {};
    b.anchors.desks['PC-Lager'] = { x: 91.2, z: -8.2 };
    b.box(1.3, 1.1, 0.6, 91, 0.55, -1.5, b.std(0xf4f2ed, 0.5, 0), { collide: true });
    b.box(1.4, 0.05, 0.7, 91, 1.12, -1.5, b.std(0x6d4a2f, 0.5, 0));
    b.anchors.phoneCounter = { x: 91, y: 1.15, z: -1.5 };
    // Packbord
    b.box(2.4, 0.9, 1, 102, 0.45, 9.8, b.std(0x9aa6ad, 0.5, 0.4), { collide: true });
    b.box(0.6, 0.4, 0.5, 101.2, 1.1, 9.8, b.std(0xb58a5a, 0.9, 0));
    b.box(0.5, 0.3, 0.4, 102.6, 1.05, 9.9, b.std(0xc49b69, 0.9, 0));
    var pl = T.label('PACKBORD', { height: 0.2, bg: 'rgba(40,44,52,0.9)' });
    pl.position.set(102, 2.1, 10.4); b.scene.add(pl);
    // Truck
    var truck = new THREE.Group();
    truck.position.set(106, 0, -4.3);
    var body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.1, 0.9), b.std(0xe0a82a, 0.5, 0.2)); body.position.y = 0.75; truck.add(body);
    var mast = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.4, 0.8), b.std(0x333333, 0.5, 0.5)); mast.position.set(-0.7, 1.2, 0); truck.add(mast);
    [[-0.4, 0.4], [0.4, 0.4], [-0.4, -0.4], [0.4, -0.4]].forEach(function (p) { var w = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.15, 16), b.std(0x111111, 0.9, 0)); w.rotation.x = Math.PI / 2; w.position.set(p[0], 0.2, p[1] * 1.1); truck.add(w); });
    truck.traverse(function (o) { o.castShadow = true; });
    b.scene.add(truck);
    b.collide(106, -4.3, 1.8, 1.1);
    b.anchors.truck = truck;
    b.anchors.truckCollider = b.colliders[b.colliders.length - 1];
    // Dörren tillbaka
    var door = b.std(0x3c7478, 0.6, 0.1);
    var dm = b.box(0.06, 2.25, 1.8, X1 + 0.12, 1.125, 0, door, { cast: false });
    b.interact.push({ mesh: dm, type: 'travel', to: 'gbg', label: 'Åk tillbaka till Göteborg' });
    var sign = T.label('Bilen till Göteborg', { height: 0.18, bg: 'rgba(60,116,120,0.95)' });
    sign.position.set(X1 + 0.2, 2.6, 0); b.scene.add(sign);
    var big = T.label('NORDVIK · LAGER BORÅS', { height: 0.45, bg: 'rgba(30,34,40,0.85)' });
    big.position.set(100, 5.2, Z2 - 0.2); b.scene.add(big);

    b.zone('Lagerkontoret', X1, Z1, 93.5, -6.5, 'boras');
    b.zone('Lagret i Borås', X1, Z1, X2, Z2, 'boras');
    b.anchors.borasSpawn = { x: 89.6, z: 0, ry: -Math.PI / 2 };
    b.anchors.aps = { 'AP-Lager-1': { x: 109, y: H - 0.12, z: 0 }, 'AP-Lager-2': { x: 99, y: H - 0.12, z: -4.5 }, 'AP-Lager-3': { x: 101, y: H - 0.12, z: 7.5 } };
  }

  return { Builder: Builder, buildGbg: buildGbg, buildBoras: buildBoras };
})();
