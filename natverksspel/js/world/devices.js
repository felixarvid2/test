// Utrustningen i 3D: rack med frontpaneler och lysdioder, kablar, datorer, accesspunkter m.m.
NV.devices3d = (function () {
  var T = NV.tex;
  var U_H = 0.0445, RACK_W = 0.6, DEV_W = 0.44, CW = 1024;

  // ------------------------------------------------------------------ Frontpaneler
  function Faceplate(spec) {
    this.spec = spec;
    this.units = spec.units || 1;
    this.ch = Math.round(104 * this.units);
    this.canvas = T.canvas(CW, this.ch);
    this.g = this.canvas.getContext('2d');
    this.tex = T.toTex(this.canvas);
    this.ports = {};
    this.console = null;
    this.layout();
  }
  Faceplate.prototype.layout = function () {
    var s = this.spec, self = this;
    if (s.type === 'switch') {
      var x0 = 330, pw = 40, gap = 6;
      for (var i = 1; i <= 24; i++) {
        var col = Math.floor((i - 1) / 2), row = (i - 1) % 2;
        var group = Math.floor(col / 6);
        var x = x0 + col * (pw + gap) + group * 14;
        self.ports['GigabitEthernet0/' + i] = { x: x, y: row ? 58 : 16, w: pw, h: 32, led: { x: x + pw / 2, y: row ? 97 : 8 } };
      }
      for (var k = 25; k <= 28; k++) {
        var c2 = Math.floor((k - 25) / 2), r2 = (k - 25) % 2;
        var xx = 920 + c2 * 48;
        self.ports['GigabitEthernet0/' + k] = { x: xx, y: r2 ? 60 : 18, w: 40, h: 26, sfp: true, led: { x: xx + 20, y: r2 ? 96 : 10 } };
      }
      this.console = { x: 268, y: 58, w: 34, h: 30 };
    } else if (s.type === 'router') {
      ['GigabitEthernet0/0', 'GigabitEthernet0/1', 'GigabitEthernet0/2'].forEach(function (n, i) {
        var x = 700 + i * 70;
        self.ports[n] = { x: x, y: 120, w: 52, h: 40, led: { x: x + 26, y: 106 } };
      });
      this.console = { x: 900, y: 120, w: 44, h: 38 };
    } else if (s.type === 'wlc') {
      ['nic', 'p2'].forEach(function (n, i) { var x = 760 + i * 60; self.ports[n] = { x: x, y: 38, w: 44, h: 34, led: { x: x + 22, y: 26 } }; });
      this.console = { x: 900, y: 38, w: 36, h: 32 };
    } else if (s.type === 'lb') {
      self.ports.nic = { x: 760, y: this.ch / 2 - 16, w: 40, h: 32, led: { x: 780, y: this.ch / 2 - 22 } };
      this.console = { x: 900, y: this.ch / 2 - 15, w: 36, h: 30 };
    } else if (s.type === 'patch') {
      for (var p = 1; p <= 24; p++) { var px = 120 + (p - 1) * 34; self.ports['pp' + p] = { x: px, y: 36, w: 26, h: 26 }; }
    } else if (s.type === 'server' || s.type === 'asa' || s.type === 'ups' || s.type === 'fiber') {
      self.ports.nic = { x: 900, y: this.ch / 2 - 16, w: 40, h: 32, led: { x: 920, y: this.ch / 2 - 22 } };
    }
  };
  Faceplate.prototype.draw = function (ledFn, t) {
    var g = this.g, s = this.spec, h = this.ch, self = this;
    // Bakgrund
    var bg = s.bg || '#4a5663';
    g.fillStyle = bg; g.fillRect(0, 0, CW, h);
    var gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = gr; g.fillRect(0, 0, CW, h);
    // Öron med skruvar
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, 26, h); g.fillRect(CW - 26, 0, 26, h);
    g.fillStyle = '#9aa2aa';
    [[13, h * 0.3], [13, h * 0.7], [CW - 13, h * 0.3], [CW - 13, h * 0.7]].forEach(function (p) { g.beginPath(); g.arc(p[0], p[1], 5, 0, Math.PI * 2); g.fill(); });
    g.fillStyle = s.text || '#e8ecef';
    g.font = '600 20px "Segoe UI", sans-serif';
    if (s.type === 'switch') {
      g.fillText(s.brand || 'Catalyst 3560G', 40, 32);
      g.font = '14px "Segoe UI", sans-serif'; g.fillText(s.model || '', 40, 52);
      // Systemlampor
      g.font = '11px sans-serif';
      ['SYST', 'RPS', 'STAT', 'PoE'].forEach(function (n, i) {
        var on = n === 'SYST' || n === 'STAT';
        self.led(g, 50 + i * 42, 78, on ? '#3dff6a' : '#2a3a2e', 5);
        g.fillStyle = '#cfd6dc'; g.fillText(n, 40 + i * 42, 98);
      });
    } else if (s.type === 'router') {
      g.fillText(s.brand || 'CISCO 2951', 50, 60);
      g.font = '14px "Segoe UI", sans-serif'; g.fillText('Integrated Services Router', 50, 84);
      // EHWIC-platser
      g.fillStyle = 'rgba(0,0,0,0.35)';
      [[50, 110], [230, 110], [410, 110]].forEach(function (p) { g.fillRect(p[0], p[1], 160, 60); });
      g.fillStyle = '#20252a'; g.fillRect(40, 186, 540, 4);
      ['SYS', 'ACT', 'POE'].forEach(function (n, i) {
        self.led(g, 620 + i * 26, 60, i === 0 ? '#3dff6a' : (i === 1 && Math.sin(t * 9) > 0 ? '#3dff6a' : '#23321f'), 5);
      });
    } else if (s.type === 'wlc') {
      g.fillText('Cisco 4400 Series', 50, 40);
      g.font = '13px "Segoe UI", sans-serif'; g.fillText('Wireless LAN Controller', 50, 60);
      ['PS1', 'PS2', 'SYS', 'ALRM'].forEach(function (n, i) { self.led(g, 400 + i * 40, 50, i < 3 ? '#3dff6a' : '#332a1a', 5); });
    } else if (s.type === 'asa') {
      g.fillText('ASA 5540', 50, 40);
      g.font = '13px "Segoe UI", sans-serif'; g.fillText('Adaptive Security Appliance', 50, 62);
      ['POWER', 'STATUS', 'ACTIVE', 'VPN'].forEach(function (n, i) { self.led(g, 480 + i * 70, 50, i < 2 ? '#3dff6a' : '#23321f', 5); g.fillStyle = '#cfd6dc'; g.font = '11px sans-serif'; g.fillText(n, 460 + i * 70, 80); });
    } else if (s.type === 'lb') {
      g.fillText('Load Balancer', 230, 40);
      g.font = '12px "Segoe UI", sans-serif'; g.fillText('L4/L7 · VIP 192.168.1.13', 230, 60);
      // En lampa per server i poolen: grön = UP, röd = DOWN, släckt = ej i drift
      var hl = s.health ? s.health() : [];
      g.font = '11px sans-serif';
      for (var hi = 0; hi < 4; hi++) {
        var hc = hl[hi] ? (hl[hi] === 'up' ? '#3dff6a' : (hl[hi] === 'down' ? (Math.sin(t * 6) > 0 ? '#ff5a4f' : '#3a1a18') : '#ffb020')) : '#23321f';
        if (NV.settings && NV.settings.get('colorblind')) hc = { '#3dff6a': '#3da5ff', '#ff5a4f': '#ff8a1f', '#ffb020': '#ffe14a' }[hc] || hc;
        self.led(g, 480 + hi * 60, 44, hc, 6);
        g.fillStyle = '#cfd6dc'; g.fillText('S' + (hi + 1), 472 + hi * 60, 74);
      }
      self.led(g, 60, h / 2, hl.length ? '#3d9bff' : '#1d2630', 6);
    } else if (s.type === 'server') {
      for (var b = 0; b < 8; b++) {
        g.fillStyle = '#15181c'; g.fillRect(260 + b * 70, 16, 62, h - 32);
        g.fillStyle = '#2b3036'; g.fillRect(264 + b * 70, 20, 54, h - 40);
        self.led(g, 290 + b * 70, h - 26, Math.random() > 0.6 ? '#3dff6a' : '#1e3a22', 3);
      }
      self.led(g, 60, h / 2, '#3d9bff', 6);
    } else if (s.type === 'patch') {
      g.font = '11px sans-serif';
    } else if (s.type === 'ups') {
      g.fillText('UPS 3000', 60, h / 2 + 8);
      self.led(g, 300, h / 2, '#3dff6a', 6);
      g.fillStyle = '#1b3b52'; g.fillRect(380, 20, 180, h - 40);
      g.fillStyle = '#6fd1ff'; g.font = '16px monospace'; g.fillText('LOAD 34%', 395, h / 2 + 6);
    } else if (s.type === 'blank') {
      return;
    }
    // Namnetikett
    if (s.sticker) {
      var sx = s.type === 'router' ? 50 : (s.type === 'switch' ? 180 : 700);
      var sy = s.type === 'router' ? 12 : (s.type === 'switch' ? 16 : 20);
      if (s.type === 'server' || s.type === 'ups') { sx = 60; sy = 12; }
      if (s.type === 'lb') { sx = 40; sy = 12; }
      g.font = 'bold 15px "Segoe UI", sans-serif';
      var tw = g.measureText(s.sticker()).width + 14;
      g.fillStyle = '#f7f6ee'; g.fillRect(sx, sy, tw, 22);
      g.fillStyle = '#111'; g.fillText(s.sticker(), sx + 7, sy + 17);
    }
    // Portar
    Object.keys(this.ports).forEach(function (n) {
      var p = self.ports[n];
      g.fillStyle = p.sfp ? '#111418' : '#0d0f11';
      g.fillRect(p.x, p.y, p.w, p.h);
      g.fillStyle = p.sfp ? '#555c63' : '#b9a36a';
      if (!p.sfp) for (var k = 0; k < 6; k++) g.fillRect(p.x + 8 + k * ((p.w - 16) / 6), p.y + 3, 2, 5);
      else { g.fillStyle = '#9aa2aa'; g.fillRect(p.x + 4, p.y + p.h / 2 - 2, p.w - 8, 4); }
      if (s.type === 'patch') { g.fillStyle = '#cfd6dc'; g.font = '10px sans-serif'; g.fillText(n.slice(2), p.x + 6, p.y - 4); }
      if (p.led && ledFn) {
        var col = ledFn(n, t);
        self.led(g, p.led.x, p.led.y, col, 5);
      }
    });
    if (this.console) {
      var c = this.console;
      g.fillStyle = '#1e5aa8'; g.fillRect(c.x - 2, c.y - 2, c.w + 4, c.h + 4);
      g.fillStyle = '#0d0f11'; g.fillRect(c.x + 3, c.y + 3, c.w - 6, c.h - 6);
      g.fillStyle = '#cfd6dc'; g.font = '10px sans-serif'; g.fillText('CONSOLE', c.x - 6, c.y + c.h + 12 > h ? c.y - 5 : c.y + c.h + 12);
    }
    this.tex.needsUpdate = true;
  };
  Faceplate.prototype.led = function (g, x, y, color, r) {
    if (!color) color = '#1d261f';
    g.fillStyle = color;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    if (color[1] !== '1' && color[1] !== '2' && color[1] !== '3') {
      var gl = g.createRadialGradient(x, y, 0, x, y, r * 3);
      gl.addColorStop(0, color.replace(')', ',0.6)').replace('#', '#'));
      g.globalAlpha = 0.35; g.fillStyle = color; g.beginPath(); g.arc(x, y, r * 2.2, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
    }
  };

  // ------------------------------------------------------------------ Rack
  function Rack(world, anchor, name) {
    this.world = world;
    var g = new THREE.Group();
    g.position.set(anchor.x, 0, anchor.z);
    g.rotation.y = anchor.ry || 0;
    this.group = g;
    this.devices = [];
    var b = world.builder;
    var frame = b.std(0x1c1e22, 0.5, 0.6);
    var side = b.std(0x25282d, 0.6, 0.5);
    var H = 2.05, D = 1.0;
    function add(w, h, d, x, y, z, m) { var mm = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); mm.position.set(x, y, z); mm.castShadow = mm.receiveShadow = true; g.add(mm); return mm; }
    add(0.03, H, D, -RACK_W / 2, H / 2, 0, side);
    add(0.03, H, D, RACK_W / 2, H / 2, 0, side);
    add(RACK_W, 0.04, D, 0, H, 0, frame);
    add(RACK_W, 0.1, D, 0, 0.05, 0, frame);
    add(RACK_W, H, 0.02, 0, H / 2, -D / 2, side);
    // Stolpar med hål
    var railM = T.mat('perforated', { roughness: 0.6, metalness: 0.5 }, 1, 40);
    [-0.25, 0.25].forEach(function (x) { add(0.035, H - 0.14, 0.02, x, H / 2, D / 2 - 0.06, railM); });
    // Kabelkanaler på sidorna
    [-0.28, 0.28].forEach(function (x) { add(0.03, H - 0.2, 0.08, x, H / 2, D / 2 - 0.1, frame); });
    var lbl = T.label(name, { height: 0.07, bg: 'rgba(15,17,20,0.85)' });
    lbl.position.set(0, H + 0.1, D / 2 - 0.05);
    g.add(lbl);
    world.scene.add(g);
    b.colliders.push(worldBox(anchor, RACK_W + 0.04, D));
    this.front = D / 2 - 0.07;
    this.top = H - 0.08;
  }
  function worldBox(a, w, d) {
    var rot = Math.abs(Math.sin(a.ry || 0)) > 0.5;
    var ww = rot ? d : w, dd = rot ? w : d;
    return { minX: a.x - ww / 2, maxX: a.x + ww / 2, minZ: a.z - dd / 2, maxZ: a.z + dd / 2 };
  }
  // Monterar en enhet i rackets U-position (1 = överst)
  Rack.prototype.mount = function (u, spec) {
    var units = spec.units || 1;
    var hgt = units * U_H - 0.002;
    var yTop = this.top - (u - 1) * U_H;
    var y = yTop - hgt / 2;
    var depth = spec.depth || 0.38;
    var body = new THREE.Mesh(new THREE.BoxGeometry(DEV_W, hgt, depth), this.world.builder.std(spec.body || 0x3a4048, 0.5, 0.5));
    body.position.set(0, y, this.front - depth / 2);
    body.castShadow = true;
    this.group.add(body);
    var fp = new Faceplate(spec);
    var faceMat = new THREE.MeshStandardMaterial({ map: fp.tex, roughness: 0.55, metalness: 0.3, emissive: 0xffffff, emissiveMap: fp.tex, emissiveIntensity: 0.32 });
    var face = new THREE.Mesh(new THREE.PlaneGeometry(RACK_W - 0.06, hgt), faceMat);
    face.position.set(0, y, this.front + 0.002);
    this.group.add(face);
    var entry = { spec: spec, fp: fp, face: face, body: body, y: y, h: hgt, rack: this };
    this.devices.push(entry);
    if (spec.devId) {
      face.userData.interact = spec.interact;
      body.userData.interact = spec.interact;
      face.userData.faceOf = { fp: fp, devId: spec.devId };
    }
    return entry;
  };
  // Portens position i världskoordinater
  Rack.prototype.portWorld = function (entry, portName, out) {
    var fp = entry.fp;
    var p = portName === 'console' ? fp.console : fp.ports[portName];
    if (!p) return null;
    var w = RACK_W - 0.06;
    var lx = (p.x + p.w / 2) / CW * w - w / 2;
    var ly = entry.y + entry.h / 2 - (p.y + p.h / 2) / fp.ch * entry.h;
    var v = new THREE.Vector3(lx, ly, this.front + (out || 0.01));
    this.group.updateMatrixWorld(true);
    return v.applyMatrix4(this.group.matrixWorld);
  };

  // ------------------------------------------------------------------ Kablar
  var CABLE_COLORS = { blue: 0x2f6fd6, yellow: 0xe8c23a, orange: 0xf08a2c, green: 0x3daa5b, gray: 0x8a9096, red: 0xd23b3b, white: 0xeeeeee, purple: 0x8a4fd0, console: 0x7fc6f0 };
  function cable(world, points, color, radius, userData) {
    var curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.2);
    var geo = new THREE.TubeGeometry(curve, Math.max(12, points.length * 8), radius || 0.004, 6, false);
    var mesh = new THREE.Mesh(geo, world.builder.std(CABLE_COLORS[color] || color || 0x2f6fd6, 0.55, 0.05));
    mesh.castShadow = true;
    if (userData) mesh.userData = userData;
    mesh.userData.curve = curve;
    world.scene.add(mesh);
    return mesh;
  }

  // ------------------------------------------------------------------ Byggnation av all utrustning
  function build(world) {
    var b = world.builder, st = function () { return world.game.state; };
    var A = b.anchors;
    var out = { racks: {}, entries: {}, pcs: {}, aps: {}, cables: {}, extra: {} };

    function hostName(id) { return function () { var d = st().devices[id]; return d && d.config ? d.config.hostname : id; }; }
    function iosSpec(id, type, units, brand, model, bg) {
      return { type: type, units: units, devId: id, brand: brand, model: model, bg: bg, sticker: hostName(id), interact: { type: 'console', id: id } };
    }

    // --- Göteborg, rack A (nätverk)
    var ra = new Rack(world, A.rackA, 'RACK A – NÄT');
    var rb = new Rack(world, A.rackB, 'RACK B – SERVRAR');
    out.racks.A = ra; out.racks.B = rb;
    out.entries.PP1 = ra.mount(8, { type: 'patch', units: 1, bg: '#15171a' });
    out.entries.SW1 = ra.mount(10, iosSpec('SW1', 'switch', 1, 'Catalyst 3560G', 'WS-C3560G-24PS', '#4c5b6b'));
    out.entries.SW2 = ra.mount(12, iosSpec('SW2', 'switch', 1, 'Catalyst 3750G', 'WS-C3750G-24PS', '#4c5b6b'));
    out.entries.R1 = ra.mount(14, iosSpec('R1', 'router', 2, 'CISCO 2951', '', '#cfd2cf'));
    out.entries.R1.spec.text = '#1d2226';
    out.entries.ASA = ra.mount(18, { type: 'asa', units: 1, bg: '#30363d', sticker: function () { return 'ASA (ej i drift)'; } });
    out.entries.WLC = ra.mount(20, { type: 'wlc', units: 1, bg: '#b9bcbf', text: '#1d2226', devId: 'WLC', sticker: function () { return 'WLC-Nordvik'; }, interact: { type: 'console', id: 'WLC' } });
    out.entries.UPS = ra.mount(38, { type: 'ups', units: 2, bg: '#202327', sticker: function () { return 'UPS'; } });
    // Lastbalanseraren (kapitel 10). Finns den inte i veckans nät är den bara en släckt låda.
    out.entries.LB = ra.mount(22, { type: 'lb', units: 1, bg: '#243447', sticker: function () { return st().devices.LB ? 'LB-Nordvik' : 'LB (ej i drift)'; }, health: function () { return NV.shared.lbHealth(st()); } });
    out.entries.LB.face.userData.interact = out.entries.LB.body.userData.interact = { type: 'console', id: 'LB' };
    [24, 26, 28, 30, 32, 34].forEach(function (u) { ra.mount(u, { type: 'blank', units: 1, bg: '#1a1c1f' }); });
    // Rack B: servrar
    out.entries.Filserver = rb.mount(10, { type: 'server', units: 2, bg: '#1d2024', sticker: function () { return 'Filserver'; } });
    out.entries['NTP-server'] = rb.mount(14, { type: 'server', units: 1, bg: '#1d2024', sticker: function () { return 'NTP'; } });
    out.entries.Loggserver = rb.mount(16, { type: 'server', units: 1, bg: '#1d2024', sticker: function () { return 'Logg'; } });
    out.entries.Ekonomisystem = rb.mount(19, { type: 'server', units: 2, bg: '#1d2024', sticker: function () { return 'Ekonomisystem'; } });
    out.entries['Tid-1'] = rb.mount(22, { type: 'server', units: 1, bg: '#1d2024', sticker: function () { return st().devices['Tid-1'] ? 'Tid-1' : 'Tid-1 (vecka 10)'; } });
    out.entries['Tid-2'] = rb.mount(23, { type: 'server', units: 1, bg: '#1d2024', sticker: function () { return st().devices['Tid-2'] ? 'Tid-2' : 'Tid-2 (vecka 10)'; } });
    out.entries.UPS2 = rb.mount(38, { type: 'ups', units: 2, bg: '#202327', sticker: function () { return 'UPS'; } });

    // Operatörens fiberbox
    var fb = b.box(0.36, 0.26, 0.1, A.fiber.x, A.fiber.y, A.fiber.z + 0.05, b.std(0xf2f2ef, 0.5, 0.1));
    var fl = T.label('Operatör – fiber', { height: 0.05, bg: 'rgba(20,24,32,0.85)' });
    fl.position.set(A.fiber.x, A.fiber.y + 0.2, A.fiber.z + 0.12); world.scene.add(fl);
    var wanBox = b.box(0.3, 0.2, 0.08, A.fiber.x + 0.55, A.fiber.y, A.fiber.z + 0.04, b.std(0x2a2f36, 0.5, 0.3));
    var wl = T.label('WAN → Borås', { height: 0.05, bg: 'rgba(20,24,32,0.85)' });
    wl.position.set(A.fiber.x + 0.55, A.fiber.y + 0.17, A.fiber.z + 0.12); world.scene.add(wl);
    out.extra.fiber = new THREE.Vector3(A.fiber.x, A.fiber.y - 0.08, A.fiber.z + 0.1);
    out.extra.wan = new THREE.Vector3(A.fiber.x + 0.55, A.fiber.y - 0.06, A.fiber.z + 0.09);
    // Vecka 10: linan är uppsagd
    var wlOff = T.label('Hyrd lina – uppsagd', { height: 0.05, bg: 'rgba(90,30,24,0.9)' });
    wlOff.position.copy(wl.position); wlOff.visible = false; world.scene.add(wlOff);
    out.extra.wanLabels = [wl, wlOff];

    // --- Borås: WAN-box på väggen bredvid racket
    b.box(0.08, 0.2, 0.3, 88.17, 1.4, -9.35, b.std(0x2a2f36, 0.5, 0.3));
    var wl2 = T.label('WAN → Göteborg', { height: 0.05, bg: 'rgba(20,24,32,0.85)' });
    wl2.position.set(88.25, 1.62, -9.35); world.scene.add(wl2);
    var wl2b = T.label('Fiber → internet (VPN)', { height: 0.05, bg: 'rgba(20,60,40,0.9)' });
    wl2b.position.copy(wl2.position); wl2b.visible = false; world.scene.add(wl2b);
    out.extra.wanLabelsB = [wl2, wl2b];
    // Liten VPN-lampa på väggboxen: grön när tunneln är uppe
    var vpnLamp = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), new THREE.MeshStandardMaterial({ color: 0x223322, emissive: 0x000000, emissiveIntensity: 1.6 }));
    vpnLamp.position.set(88.22, 1.47, -9.25); vpnLamp.visible = false; world.scene.add(vpnLamp);
    out.extra.vpnLamp = vpnLamp;
    out.extra.wanBoras = new THREE.Vector3(88.23, 1.34, -9.35);
    // --- Borås: väggrack
    var rbo = new Rack(world, A.borasRack, 'LAGRETS RACK');
    out.racks.BO = rbo;
    out.entries.RB = rbo.mount(12, iosSpec('RB', 'router', 2, 'CISCO 2951', '', '#cfd2cf'));
    out.entries.RB.spec.text = '#1d2226';
    out.entries.SWB = rbo.mount(10, iosSpec('SWB', 'switch', 1, 'Catalyst 3560G', 'WS-C3560G-24PS', '#4c5b6b'));
    out.entries.PP2 = rbo.mount(8, { type: 'patch', units: 1, bg: '#15171a' });
    out.entries.UPS3 = rbo.mount(38, { type: 'ups', units: 2, bg: '#202327', sticker: function () { return 'UPS'; } });

    // --- Datorer vid skrivborden
    Object.keys(A.desks).forEach(function (id) {
      var p = A.desks[id];
      b.desk(p.x, p.z, 0);
      b.chair(p.x, p.z + 0.75, 0, id === 'PC-Bo' || id === 'PC-Maja' ? 0x5b3d6b : 0x30343b);
      if (id.indexOf('PC-') !== 0) {
        (out.extra.idleMonitors = out.extra.idleMonitors || []).push(monitor(world, p.x + 0.1, p.z - 0.15, null));
        return;
      }
      out.pcs[id] = pc(world, id, p);
    });
    // Skrivare
    var pr = b.box(0.6, 0.45, 0.5, A.printer.x, 0.9, A.printer.z, b.std(0xe9e9e6, 0.5, 0.1));
    b.box(0.7, 0.68, 0.6, A.printer.x, 0.34, A.printer.z, b.std(0xcfd2d4, 0.5, 0.1), { collide: true });
    b.box(0.4, 0.02, 0.3, A.printer.x, 1.13, A.printer.z + 0.05, b.std(0xffffff, 0.8, 0));
    pr.userData.interact = { type: 'printer' };
    out.extra.printer = pr;
    // Teknikerns laptop
    var lap = laptop(world, A.bench.x + 0.05, 0.76, A.bench.z);
    out.extra.laptop = lap;
    // Övervakningsskärm och whiteboard
    out.extra.monitorWall = wallScreen(world, A.monitorWall);
    out.extra.whiteboard = whiteboard(world, A.whiteboard);
    // Accesspunkter i lagret
    Object.keys(A.aps).forEach(function (id) { out.aps[id] = ap(world, id, A.aps[id]); });
    // Gästens mobil
    out.extra.phone = phone(world, A.phoneCounter);
    // Gästlaptop i receptionen (en dator utan skrivbord)
    out.pcs['Gast-laptop'] = guestLaptop(world, A.guestTable);
    return out;
  }

  var kbTex = null;
  function keyboardTex() {
    if (kbTex) return kbTex;
    var c = T.canvas(256, 80), g = c.getContext('2d');
    g.fillStyle = '#23262b'; g.fillRect(0, 0, 256, 80);
    for (var r = 0; r < 5; r++) for (var k = 0; k < 15; k++) {
      var w = (r === 4 && k === 5) ? 70 : 14;
      if (r === 4 && k > 5 && k < 10) continue;
      g.fillStyle = '#3b3f46'; g.fillRect(6 + k * 16.5, 6 + r * 14.5, w, 12);
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(6 + k * 16.5, 6 + r * 14.5, w, 2);
    }
    kbTex = T.toTex(c);
    return kbTex;
  }
  function monitor(world, x, z, id) {
    var b = world.builder, M = NV.models;
    var g = new THREE.Group();
    g.position.set(x, 0.76, z);
    var metal = b.std(0x2a2c30, 0.35, 0.7), plastic = b.std(0x16181b, 0.35, 0.3);
    M.mesh(M.rbox(0.24, 0.015, 0.17, 0.006), metal, 0, 0.008, -0.03, g);
    var neck = M.mesh(M.rbox(0.05, 0.24, 0.025, 0.008), metal, 0, 0.13, -0.06, g); neck.rotation.x = -0.08;
    M.mesh(M.rbox(0.58, 0.36, 0.022, 0.012), plastic, 0, 0.36, -0.03, g);
    M.mesh(M.rbox(0.36, 0.22, 0.03, 0.02), plastic, 0, 0.36, -0.05, g);
    M.mesh(M.rbox(0.05, 0.01, 0.005, 0.002), b.std(0x9aa3ad, 0.3, 0.8), 0, 0.195, -0.018, g, false);
    var c = T.canvas(512, 300);
    var tex = T.toTex(c);
    var scr = new THREE.Mesh(new THREE.PlaneGeometry(0.555, 0.325), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9, roughness: 0.25 }));
    scr.position.set(0, 0.365, -0.0185);
    g.add(scr);
    var kbm = new THREE.MeshStandardMaterial({ map: keyboardTex(), roughness: 0.6 });
    var kb = M.mesh(M.rbox(0.42, 0.018, 0.14, 0.006), kbm, 0, 0.01, 0.2, g); kb.rotation.x = 0.04;
    var mouse = M.mesh(M.sphere(0.03, 12, 8), plastic, 0.3, 0.012, 0.2, g); mouse.scale.set(0.8, 0.45, 1.3);
    M.mesh(M.rbox(0.22, 0.004, 0.2, 0.004), b.std(0x2e3a4a, 0.9, 0), 0.3, 0.002, 0.2, g, false);
    world.scene.add(g);
    drawDesktop(c, id, null);
    tex.needsUpdate = true;
    return { group: g, screen: scr, canvas: c, tex: tex };
  }
  function drawDesktop(c, id, status, t) {
    var g = c.getContext('2d');
    var gr = g.createLinearGradient(0, 0, 512, 300);
    gr.addColorStop(0, '#1f4e79'); gr.addColorStop(1, '#3c7478');
    g.fillStyle = gr; g.fillRect(0, 0, 512, 300);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.beginPath(); g.arc(380, 120, 90, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff'; g.font = 'bold 26px "Segoe UI", sans-serif';
    g.fillText('Nordvik', 30, 60);
    g.font = '15px "Segoe UI", sans-serif';
    if (id) g.fillText(id, 30, 84);
    // Ett program där text skrivs medan personen arbetar
    if (status && status.icon === 'ok' && t !== undefined) {
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(34, 104, 300, 150);
      g.fillStyle = '#f6f7f9'; g.fillRect(30, 100, 300, 150);
      g.fillStyle = '#2f6fd6'; g.fillRect(30, 100, 300, 18);
      g.fillStyle = '#fff'; g.font = 'bold 11px "Segoe UI", sans-serif'; g.fillText(status.app || 'Dokument', 36, 113);
      var n = Math.floor(t * 3) % 60;
      g.fillStyle = '#9aa3ad';
      for (var i = 0; i < 9; i++) {
        var w = Math.min(270, Math.max(0, n * 14 - i * 270));
        if (w <= 0) break;
        g.fillRect(40, 128 + i * 13, (i * 53 % 70) + 200 > w ? w : (i * 53 % 70) + 200, 6);
      }
      if (Math.floor(t * 2) % 2) { g.fillStyle = '#1b1b1b'; g.fillRect(40 + Math.min(262, (n * 14) % 270), 126 + Math.min(8, Math.floor(n * 14 / 270)) * 13, 2, 10); }
    }
    // Aktivitetsfält
    g.fillStyle = 'rgba(15,18,22,0.92)'; g.fillRect(0, 266, 512, 34);
    g.fillStyle = '#6fb3ff'; g.fillRect(10, 274, 18, 18);
    if (status) {
      var ic = status.icon;
      g.font = 'bold 18px "Segoe UI", sans-serif';
      g.fillStyle = ic === 'ok' ? '#e8f4ff' : (ic === 'warn' ? '#ffcc33' : '#ff5a4f');
      g.fillText(ic === 'ok' ? '⇅' : (ic === 'warn' ? '⚠' : '✕'), 440, 290);
      g.font = '12px "Segoe UI", sans-serif'; g.fillStyle = '#d7dde3';
      g.fillText(status.text, 300, 289);
      if (status.popup) {
        g.fillStyle = 'rgba(30,34,40,0.95)'; g.fillRect(260, 200, 240, 60);
        g.fillStyle = '#ffffff'; g.font = 'bold 13px "Segoe UI", sans-serif'; g.fillText(status.popup[0], 272, 222);
        g.font = '12px "Segoe UI", sans-serif'; g.fillStyle = '#c6ced6'; g.fillText(status.popup[1], 272, 244);
      }
    }
  }
  function pc(world, id, p) {
    var b = world.builder, M = NV.models;
    var m = monitor(world, p.x + 0.1, p.z - 0.15, id);
    var tower = b.box(0.2, 0.44, 0.45, p.x + 0.6, 0.22, p.z - 0.1, b.std(0x1c1e22, 0.35, 0.4));
    tower.geometry = M.rbox(0.2, 0.44, 0.45, 0.02);
    var vent = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.3), T.mat('perforated', { roughness: 0.5, metalness: 0.5 }, 1, 2));
    vent.position.set(p.x + 0.6, 0.2, p.z + 0.126); world.scene.add(vent);
    b.box(0.02, 0.02, 0.02, p.x + 0.6, 0.38, p.z + 0.13, b.std(0x2d8cff, 0.3, 0, { emissive: 0x2d8cff, emissiveIntensity: 2 }));
    var inter = { type: 'pc', id: id };
    m.screen.userData.interact = inter;
    tower.userData.interact = inter;
    m.group.children.forEach(function (o) { o.userData.interact = inter; });
    // Golvuttag och patchkabel
    var box = b.box(0.12, 0.08, 0.05, p.x + 0.75, 0.2, p.z - 0.38, b.std(0xf2f2ef, 0.5, 0));
    box.userData.interact = { type: 'deskcable', id: id };
    var c = cable(world, [new THREE.Vector3(p.x + 0.68, 0.3, p.z + 0.12), new THREE.Vector3(p.x + 0.75, 0.05, p.z + 0.05), new THREE.Vector3(p.x + 0.8, 0.05, p.z - 0.25), new THREE.Vector3(p.x + 0.75, 0.2, p.z - 0.35)], 'blue', 0.006, { interact: { type: 'deskcable', id: id } });
    var ledM = new THREE.MeshStandardMaterial({ color: 0x113311, emissive: 0x33ff55, emissiveIntensity: 0 }); ledM.userData.keep = true;
    var led = b.box(0.012, 0.012, 0.01, p.x + 0.72, 0.22, p.z - 0.352, ledM);
    return { monitor: m, tower: tower, cable: c, led: led, id: id };
  }
  function guestLaptop(world, a) {
    var b = world.builder;
    var g = new THREE.Group();
    g.position.set(a.x, 0.73, a.z);
    var base = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.24), b.std(0xb8bcc2, 0.4, 0.6)); base.position.y = 0.01; g.add(base);
    var c = T.canvas(512, 300);
    var tex = T.toTex(c);
    var lid = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.2), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.85 }));
    lid.position.set(0, 0.11, -0.12); lid.rotation.x = -0.25; lid.rotation.y = Math.PI; g.add(lid);
    lid.rotation.y = 0;
    var back = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.01), b.std(0xb8bcc2, 0.4, 0.6)); back.position.set(0, 0.11, -0.127); back.rotation.x = -0.25; g.add(back);
    g.rotation.y = Math.PI;
    world.scene.add(g);
    var inter = { type: 'pc', id: 'Gast-laptop' };
    g.children.forEach(function (o) { o.userData.interact = inter; });
    drawDesktop(c, 'Gästlaptop', null); tex.needsUpdate = true;
    // Miniswitch (visas bara när den finns)
    var mini = new THREE.Group();
    mini.position.set(a.x + 0.4, 0.74, a.z + 0.1);
    var mb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.1), b.std(0xf2f2f2, 0.5, 0.1)); mb.position.y = 0.015; mini.add(mb);
    for (var i = 0; i < 5; i++) { var led = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.006, 0.004), new THREE.MeshStandardMaterial({ color: 0x113311, emissive: 0x33ff55, emissiveIntensity: 1.5 })); led.position.set(-0.06 + i * 0.03, 0.022, 0.051); mini.add(led); }
    var mc = cable(world, [new THREE.Vector3(a.x + 0.4, 0.75, a.z + 0.16), new THREE.Vector3(a.x + 0.45, 0.4, a.z + 0.3), new THREE.Vector3(a.x + 0.5, 0.02, a.z + 0.3)], 'purple', 0.005);
    var ol = new THREE.Group();
    var ob = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.02, 0.22), b.std(0x2b2d31, 0.4, 0.5)); ol.add(ob);
    ol.position.set(a.x - 0.35, 0.74, a.z);
    mini.add(mc);
    world.scene.add(mini); world.scene.add(ol);
    mini.children.forEach(function (o) { o.userData.interact = { type: 'miniswitch' }; });
    mc.userData.interact = { type: 'miniswitch' };
    ol.children.forEach(function (o) { o.userData.interact = { type: 'miniswitch' }; });
    return { monitor: { canvas: c, tex: tex, screen: lid }, id: 'Gast-laptop', mini: mini, mini2: ol, miniCable: mc };
  }
  function laptop(world, x, y, z) {
    var b = world.builder;
    var g = new THREE.Group();
    g.position.set(x, y, z); g.rotation.y = -Math.PI / 2;
    var base = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.02, 0.25), b.std(0x2b2d31, 0.4, 0.5)); base.position.y = 0.01; g.add(base);
    var c = T.canvas(512, 320), gg = c.getContext('2d');
    gg.fillStyle = '#300a24'; gg.fillRect(0, 0, 512, 320);
    gg.fillStyle = '#e8e8e8'; gg.font = '18px monospace';
    ['tekniker@laptop:~$ sudo screen', '  /dev/ttyUSB0 9600', '', 'Konsolkabel: ljusblå', 'Tryck E för att använda'].forEach(function (l, i) { gg.fillText(l, 16, 40 + i * 28); });
    var tex = T.toTex(c);
    var lid = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.21), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9 }));
    lid.position.set(0, 0.12, -0.125); lid.rotation.x = -0.28; g.add(lid);
    var back = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.23, 0.01), b.std(0x2b2d31, 0.4, 0.5)); back.position.set(0, 0.12, -0.132); back.rotation.x = -0.28; g.add(back);
    // Ljusblå konsolkabel ihoprullad
    var coil = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.008, 8, 24), b.std(0x7fc6f0, 0.5, 0)); coil.rotation.x = Math.PI / 2; coil.position.set(0.3, 0.01, 0.05); g.add(coil);
    // Lapp med lösenorden (det är en övning...)
    var note = T.canvas(256, 200), ng = note.getContext('2d');
    ng.fillStyle = '#fff27a'; ng.fillRect(0, 0, 256, 200);
    ng.fillStyle = '#222'; ng.font = 'bold 22px "Segoe Print", cursive';
    ng.fillText('enable:', 16, 44); ng.fillText('Krabba2026', 30, 76); ng.fillText('ssh: drift /', 16, 120); ng.fillText('Krabba2026', 30, 152);
    ng.font = '14px sans-serif'; ng.fillText('(byt efter kursen!)', 16, 186);
    var nt = T.toTex(note);
    var nm = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.07), new THREE.MeshStandardMaterial({ map: nt, roughness: 0.9 }));
    nm.position.set(-0.24, 0.011, 0.08); nm.rotation.x = -Math.PI / 2; g.add(nm);
    world.scene.add(g);
    var inter = { type: 'laptop' };
    g.children.forEach(function (o) { o.userData.interact = inter; });
    return g;
  }
  function wallScreen(world, a) {
    var b = world.builder;
    var c = T.canvas(1024, 576);
    var tex = T.toTex(c);
    var frame = b.box(1.5, 0.9, 0.05, a.x, a.y, a.z - 0.02, b.std(0x111214, 0.4, 0.3), { cast: false });
    var scr = new THREE.Mesh(new THREE.PlaneGeometry(1.44, 0.81), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1 }));
    scr.position.set(a.x, a.y, a.z - 0.05);
    scr.rotation.y = Math.PI;
    world.scene.add(scr);
    scr.userData.interact = { type: 'monitor' };
    frame.userData.interact = { type: 'monitor' };
    return { canvas: c, tex: tex, mesh: scr, hist: {} };
  }
  function whiteboard(world, a) {
    var b = world.builder;
    var c = T.canvas(1024, 640);
    var tex = T.toTex(c);
    b.box(0.04, 1.1, 1.75, a.x + 0.02, a.y, a.z, b.std(0xc9ccd0, 0.3, 0.6), { cast: false });
    var board = new THREE.Mesh(new THREE.PlaneGeometry(1.66, 1.02), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.15 }));
    board.position.set(a.x + 0.045, a.y, a.z);
    board.rotation.y = Math.PI / 2;
    world.scene.add(board);
    board.userData.interact = { type: 'whiteboard' };
    return { canvas: c, tex: tex, mesh: board };
  }
  function ap(world, id, a) {
    var b = world.builder;
    var g = new THREE.Group();
    g.position.set(a.x, a.y, a.z);
    var body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.05, 32), b.std(0xf4f4f2, 0.4, 0.1));
    g.add(body);
    var ledMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x33ff66, emissiveIntensity: 0 });
    ledMat.userData.keep = true;
    var led = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.01, 16), ledMat);
    led.position.y = -0.027;
    g.add(led);
    var bracket = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.04), b.std(0x7d8288, 0.5, 0.5)); bracket.position.y = 0.15; g.add(bracket);
    var lbl = T.label(id, { height: 0.12, bg: 'rgba(20,24,32,0.8)' });
    lbl.position.set(0, -0.28, 0); g.add(lbl);
    world.scene.add(g);
    // Kabel upp i taket
    cable(world, [new THREE.Vector3(a.x, a.y + 0.3, a.z), new THREE.Vector3(a.x, a.y + 0.35, a.z + 0.4)], 'white', 0.006);
    return { group: g, led: ledMat, label: lbl, id: id };
  }
  function phone(world, a) {
    var b = world.builder;
    var g = new THREE.Group();
    g.position.set(a.x, a.y, a.z);
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.012, 0.16), b.std(0x1a1b1e, 0.3, 0.4)); g.add(body);
    var sc = T.canvas(128, 256), sg = sc.getContext('2d');
    var gr = sg.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#5b3aa8'); gr.addColorStop(1, '#d4568c');
    sg.fillStyle = gr; sg.fillRect(0, 0, 128, 256);
    sg.fillStyle = '#fff'; sg.font = 'bold 28px sans-serif'; sg.fillText('08:00', 24, 70);
    sg.font = '14px sans-serif'; sg.fillText('Gästmobil', 30, 100);
    var tex = T.toTex(sc);
    var scr = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.145), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.8 }));
    scr.rotation.x = -Math.PI / 2; scr.position.y = 0.0065; g.add(scr);
    g.rotation.y = 0.4;
    world.scene.add(g);
    var lbl = T.label('Gästmobil', { height: 0.06 });
    lbl.position.set(a.x, a.y + 0.18, a.z); world.scene.add(lbl);
    g.children.forEach(function (o) { o.userData.interact = { type: 'phone' }; });
    return g;
  }

  return { build: build, cable: cable, drawDesktop: drawDesktop, Rack: Rack, Faceplate: Faceplate, CABLE_COLORS: CABLE_COLORS };
})();
