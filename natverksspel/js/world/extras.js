// Detaljer och effekter i 3D-världen: reflektioner, solstrålar, klockor, tv, krabban, kaffe,
// målmarkör, ficklampa, laptop i handen, nätverksglasögon, paket på kablarna och pingspår.
NV.extras3d = (function () {
  var T = NV.tex, S = NV.sim, SH = NV.iosShow;
  var V3 = THREE.Vector3;

  function canvasTex(w, h) { var c = T.canvas(w, h); return { c: c, g: c.getContext('2d'), t: T.toTex(c) }; }
  function glowMat(hex, k) { var m = new THREE.MeshBasicMaterial({ color: hex }); m.color.multiplyScalar(k || 1); m.toneMapped = false; return m; }
  function radialTex(inner, outer) {
    var c = T.canvas(128, 128), g = c.getContext('2d');
    var gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, inner); gr.addColorStop(1, outer);
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return T.toTex(c);
  }

  function Extras(world) {
    this.w = world;
    this.scene = world.scene;
    this.b = world.builder;
    this.A = world.builder.anchors;
    this.fx = world.fx;
    this.t = 0;
    this.goggles = 0;
    this.traces = [];
    this.pending = [];
    this.portPrev = {};
    this.glows = {};
    this.lastTrace = null;
  }
  var E = Extras.prototype;

  E.build = function () {
    this.sky();
    this.blobShadows();
    this.sunbeams();
    this.clocks();
    this.tv();
    this.signs();
    this.posters();
    this.serverRoom();
    this.coffee();
    this.mugs();
    this.warehouse();
    this.idleScreens();
    this.rackFans();
    this.apRings();
    this.crabBuild();
    this.doors();
    this.rackDoors();
    this.truckModel();
    this.weatherSetup();
    this.marker();
    this.flashlight();
    this.viewmodel();
    this.goggleSetup();
  };

  // ------------------------------------------------------------------ Reflektioner
  E.envFor = function (x, y, z) {
    var r = this.w.renderer;
    var crt = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
    var cc = new THREE.CubeCamera(0.1, 80, crt);
    cc.position.set(x, y, z);
    this.scene.add(cc);
    var hide = [];
    this.scene.traverse(function (o) { if (o.isSprite && o.visible) { hide.push(o); o.visible = false; } });
    cc.update(r, this.scene);
    hide.forEach(function (o) { o.visible = true; });
    var pm = new THREE.PMREMGenerator(r);
    var env = pm.fromCubemap(crt.texture).texture;
    pm.dispose(); crt.dispose();
    this.scene.remove(cc);
    return env;
  };
  E.reflections = function () {
    var seen = new Set();
    this.scene.traverse(function (o) {
      if (!o.isMesh || !o.material || seen.has(o.material)) return;
      var m = o.material;
      seen.add(m);
      if (!m.isMeshStandardMaterial) return;
      m.envMapIntensity = m.isMeshPhysicalMaterial ? 1.0 : (m.metalness > 0.3 ? 0.7 : (m.roughness < 0.45 ? 0.12 : 0.04));
      if (m.map && m.map.repeat && (m.map.repeat.x > 1.5 || m.map.repeat.y > 1.5)) { m.map.anisotropy = 8; m.map.needsUpdate = true; }
    });
    this.envs = { gbg: this.envFor(-3, 1.6, 2), boras: this.envFor(100, 3, 0) };
  };
  E.setSite = function (site) {
    if (this.envs) this.scene.environment = this.envs[site] || null;
    this.scene.fog = site === 'boras' ? new THREE.FogExp2(0x8a8f96, 0.018) : null;
  };

  // ------------------------------------------------------------------ Himmel i fönstren
  E.sky = function () {
    var ct = canvasTex(1024, 256), g = ct.g;
    this.skyCv = ct;
    this.drawSky(0);
    ct.t.wrapS = THREE.RepeatWrapping;
    ct.t.repeat.set(0.35, 1);
    var m = this.b.mats.skyWin;
    if (m) { m.map = ct.t; m.emissiveMap = ct.t; m.needsUpdate = true; m.userData.keep = true; this.skyMat = m; }
  };
  E.drawSky = function (warm) {
    var g = this.skyCv.g;
    var gr = g.createLinearGradient(0, 0, 0, 256);
    var wx = this.weather || 'sun';
    var top = wx === 'rain' ? '#6f7a86' : (wx === 'clouds' ? '#9aaabb' : (warm > 0.5 ? '#9fb6d8' : '#8fbbe6'));
    var hor = wx === 'rain' ? '#a9b2bb' : (wx === 'clouds' ? '#cfd8e0' : (warm > 0.5 ? '#f3d9b8' : '#d8e8f3'));
    gr.addColorStop(0, top); gr.addColorStop(0.58, hor);
    gr.addColorStop(0.6, wx === 'rain' ? '#5f7258' : '#7e9670'); gr.addColorStop(1, wx === 'rain' ? '#44533d' : '#556a4c');
    g.fillStyle = gr; g.fillRect(0, 0, 1024, 256);
    if (wx !== 'sun') { g.fillStyle = wx === 'rain' ? 'rgba(90,98,108,0.55)' : 'rgba(255,255,255,0.35)'; for (var q = 0; q < 14; q++) { g.beginPath(); g.ellipse(q * 80 + 20, 30 + (q % 3) * 18, 90, 26, 0, 0, Math.PI * 2); g.fill(); } }
    var r = 7;
    function rn() { r = (r * 16807) % 2147483647; return r / 2147483647; }
    // Moln
    for (var i = 0; i < 26; i++) {
      var x = rn() * 1024, y = 20 + rn() * 90, s = 18 + rn() * 34;
      g.fillStyle = 'rgba(255,255,255,' + (0.35 + rn() * 0.4) + ')';
      for (var k = 0; k < 5; k++) { g.beginPath(); g.arc(x + k * s * 0.6, y + Math.sin(k) * 6, s * (0.6 + rn() * 0.5), 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(x + k * s * 0.6 - 1024, y + Math.sin(k) * 6, s * (0.6 + rn() * 0.5), 0, Math.PI * 2); g.fill(); }
    }
    // Stadssiluett och träd
    g.fillStyle = 'rgba(70,80,92,0.6)';
    for (var j = 0; j < 44; j++) { var h = 16 + (j * 37 % 56); g.fillRect(j * 24, 153 - h, 19, h); }
    g.fillStyle = '#4a6a3e';
    for (var q = 0; q < 60; q++) { g.beginPath(); g.arc(q * 18 + (q % 3) * 5, 156, 10 + (q * 7 % 8), 0, Math.PI * 2); g.fill(); }
    this.skyCv.t.needsUpdate = true;
  };

  // ------------------------------------------------------------------ Kontaktskuggor
  E.blobShadows = function () {
    var tex = radialTex('rgba(0,0,0,0.55)', 'rgba(0,0,0,0)');
    var mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    var scene = this.scene;
    function blob(x, z, w, d, ry, y) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
      m.rotation.x = -Math.PI / 2; m.rotation.z = ry || 0;
      m.position.set(x, y || 0.007, z);
      m.renderOrder = 1;
      scene.add(m);
    }
    this.b.sem.forEach(function (s) {
      var y = s.x > 50 && s.x < 93.5 && s.z < -6.5 ? 0.01 : 0.007;
      if (s.type === 'desk') blob(s.x, s.z, 2.1, 1.3, s.ry, y);
      else if (s.type === 'chair') blob(s.x, s.z, 0.8, 0.8, 0, y);
      else if (s.type === 'sofa') blob(s.x, s.z, 2.5, 1.3, s.ry, y);
      else if (s.type === 'plant') blob(s.x, s.z, 0.8 * s.s, 0.8 * s.s, 0, y);
      else if (s.type === 'box' && s.collide && s.h > 0.5 && s.w < 3 && s.d < 3) blob(s.x, s.z, s.w + 0.5, s.d + 0.5, 0, y);
    });
    [this.A.rackA, this.A.rackB, this.A.borasRack].forEach(function (a) { blob(a.x, a.z, a.ry ? 1.4 : 0.95, a.ry ? 0.95 : 1.4, 0, a.x > 50 ? 0.01 : 0.007); });
  };

  // ------------------------------------------------------------------ Solstrålar och dammkorn
  E.sunbeams = function () {
    var self = this, P = NV.gfx.profile();
    var mat = new THREE.ShaderMaterial({
      uniforms: { uI: { value: 0.12 }, uCol: { value: new THREE.Color(1, 0.92, 0.75) }, uLen: { value: 4.4 } },
      vertexShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float uI; uniform vec3 uCol; uniform float uLen; varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ float t = clamp(vP.z / uLen + 0.5, 0.0, 1.0); float along = (1.0 - t) * smoothstep(0.0, 0.08, t); float edge = pow(1.0 - abs(dot(vN, vV)), 1.6); gl_FragColor = vec4(uCol * uI * along * (0.35 + edge), 1.0); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.beamMat = mat;
    var dir = new V3(0, -0.5, -1).normalize();
    [-11, -7, 0, 4, 8, 12].forEach(function (x) {
      var start = new V3(x, 1.6, 9.9);
      var len = 4.4;
      var c = start.clone().add(dir.clone().multiplyScalar(len / 2));
      var m = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.3, len), mat);
      m.position.copy(c);
      m.lookAt(c.clone().add(dir));
      m.renderOrder = 3;
      if (P.beams) self.scene.add(m);
      if (P.motes) self.fx.emitter(function () { this.mote({ x1: x - 0.8, x2: x + 0.8, y1: 0.4, y2: 2.2, z1: 6.8, z2: 9.7 }); }, 3.2, { x: x, z: 8.5 }, 12);
    });
  };

  // ------------------------------------------------------------------ Klockor
  E.clocks = function () {
    var self = this;
    this.clockList = [];
    [[-1.5, 2.35, -9.93, 0], [14.93, 2.35, 8.3, -Math.PI / 2], [-6.07, 2.35, -6, -Math.PI / 2], [111.85, 4.2, 6, -Math.PI / 2]].forEach(function (p) {
      var ct = canvasTex(256, 256);
      var mesh = new THREE.Mesh(new THREE.CircleGeometry(0.2, 32), new THREE.MeshStandardMaterial({ map: ct.t, roughness: 0.4, emissive: 0xffffff, emissiveMap: ct.t, emissiveIntensity: 0.25 }));
      mesh.position.set(p[0], p[1], p[2]); mesh.rotation.y = p[3];
      var rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.015, 8, 32), self.b.std(0x222428, 0.3, 0.7));
      rim.position.copy(mesh.position); rim.rotation.y = p[3];
      self.scene.add(mesh); self.scene.add(rim);
      self.clockList.push(ct);
    });
  };
  E.drawClocks = function () {
    var secs = 8 * 3600 + (this.w.game.state ? this.w.game.state.time : 0);
    var hh = (secs / 3600) % 12, mm = (secs / 60) % 60, ss = secs % 60;
    this.clockList.forEach(function (ct) {
      var g = ct.g;
      g.fillStyle = '#fbfbf7'; g.fillRect(0, 0, 256, 256);
      g.save(); g.translate(128, 128);
      for (var i = 0; i < 60; i++) { g.save(); g.rotate(i * Math.PI / 30); g.fillStyle = '#222'; if (i % 5 === 0) g.fillRect(-3, -118, 6, 20); else g.fillRect(-1, -118, 2, 8); g.restore(); }
      function hand(a, len, w, col) { g.save(); g.rotate(a); g.fillStyle = col; g.fillRect(-w / 2, -len, w, len + 14); g.restore(); }
      hand(hh / 12 * Math.PI * 2, 62, 10, '#1b1b1b');
      hand(mm / 60 * Math.PI * 2, 92, 7, '#1b1b1b');
      hand(ss / 60 * Math.PI * 2, 100, 2.5, '#c0392b');
      g.fillStyle = '#c0392b'; g.beginPath(); g.arc(0, 0, 7, 0, Math.PI * 2); g.fill();
      g.restore();
      ct.t.needsUpdate = true;
    });
  };

  // ------------------------------------------------------------------ Tv i receptionen
  E.tv = function () {
    var ct = canvasTex(640, 360);
    this.tvCv = ct;
    this.b.box(1.3, 0.76, 0.05, 3.1, 1.95, -6.4, this.b.std(0x0f1012, 0.4, 0.4), { ry: Math.PI / 2 });
    var scr = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.675), new THREE.MeshStandardMaterial({ map: ct.t, emissive: 0xffffff, emissiveMap: ct.t, emissiveIntensity: 1.1, roughness: 0.3 }));
    scr.position.set(3.14, 1.95, -6.4); scr.rotation.y = Math.PI / 2;
    this.scene.add(scr);
    this.tvScreen = scr;
  };
  E.drawTv = function () {
    var g = this.tvCv.g, t = this.t, game = this.w.game;
    var open = game.def ? game.def.tasks.filter(function (x) { return !game.taskState[x.id].fixed; }).length : 0;
    var slides = [
      ['NORDVIK NYTT', 'Välkommen till vecka ' + (game.week || '–') + '!', 'Nätverksteknikern har koll på racket.'],
      ['NÄTSTATUS', open ? open + ' öppna ärenden' : 'Allt fungerar', open ? 'Krabban har varit framme…' : 'Tack, teknikern!'],
      ['DAGENS LUNCH', 'Fiskgratäng med dillpotatis', 'Vegetariskt: linsbiffar'],
      ['VÄDRET', 'Göteborg 14° · lätt regn', 'Borås 12° · mulet'],
    ];
    var s = slides[Math.floor(t / 7) % slides.length];
    var gr = g.createLinearGradient(0, 0, 640, 360); gr.addColorStop(0, '#12324d'); gr.addColorStop(1, '#1f5c63');
    g.fillStyle = gr; g.fillRect(0, 0, 640, 360);
    g.fillStyle = 'rgba(255,255,255,0.06)'; g.beginPath(); g.arc(520 + Math.sin(t * 0.3) * 30, 120, 150, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f0b429'; g.font = 'bold 26px "Segoe UI", sans-serif'; g.fillText(s[0], 32, 60);
    g.fillStyle = '#fff'; g.font = 'bold 40px "Segoe UI", sans-serif'; g.fillText(s[1], 32, 150);
    g.fillStyle = '#cfe3ea'; g.font = '26px "Segoe UI", sans-serif'; g.fillText(s[2], 32, 200);
    g.fillStyle = '#0b1622'; g.fillRect(0, 300, 640, 60);
    g.fillStyle = '#c0392b'; g.fillRect(0, 300, 110, 60);
    g.fillStyle = '#fff'; g.font = 'bold 22px "Segoe UI", sans-serif'; g.fillText('LIVE', 28, 338);
    var tick = '+++ Nordvik öppnar nytt lager i Borås +++ Kom ihåg: spara konfigurationen med write memory +++ Krabban siktad i serverrummet +++ ';
    g.save(); g.beginPath(); g.rect(110, 300, 530, 60); g.clip();
    g.font = '22px "Segoe UI", sans-serif'; g.fillStyle = '#e8edf2';
    var w = g.measureText(tick).width, x = 640 - ((t * 90) % (w + 530));
    g.fillText(tick + tick, x, 338); g.restore();
    this.tvCv.t.needsUpdate = true;
  };

  // ------------------------------------------------------------------ Skyltar och affischer
  E.signs = function () {
    var self = this;
    function exitSign(x, y, z, ry) {
      var c = T.canvas(256, 96), g = c.getContext('2d');
      g.fillStyle = '#0f8a3e'; g.fillRect(0, 0, 256, 96);
      g.fillStyle = '#fff'; g.font = 'bold 34px "Segoe UI", sans-serif'; g.fillText('NÖDUTGÅNG', 18, 44);
      g.font = 'bold 40px sans-serif'; g.fillText('🏃 →', 70, 88);
      var t = T.toTex(c);
      var m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.19, 0.04), [0, 0, 0, 0, 1, 1].map(function (i) { return i ? new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(2.2, 2.2, 2.2) }) : self.b.std(0xeeeeee, 0.5, 0); }));
      m.position.set(x, y, z); m.rotation.y = ry || 0;
      self.scene.add(m);
    }
    exitSign(10.5, 2.82, -9.9, 0);
    exitSign(88.2, 2.95, 0, Math.PI / 2);
    exitSign(-12.5, 2.75, 9.9, Math.PI);
    [['HJÄLM OCH VARSELVÄST', 111.8, 3.4, -6], ['TRUCKTRAFIK · MAX 10 KM/H', 100, 3.8, -11.8], ['LASTKAJ', 111.8, 4.6, 0]].forEach(function (s) {
      var l = T.label(s[0], { height: 0.28, bg: 'rgba(230,180,40,0.95)', color: '#1b1b1b', weight: '800' });
      l.position.set(s[1], s[2], s[3]); self.scene.add(l);
    });
  };
  E.posters = function () {
    var self = this;
    function poster(x, y, z, ry, w, h, draw) {
      var c = T.canvas(512, Math.round(512 * h / w)), g = c.getContext('2d');
      draw(g, c.width, c.height);
      var t = T.toTex(c);
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.1 }));
      m.position.set(x, y, z); m.rotation.y = ry;
      self.scene.add(m);
    }
    poster(12.5, 1.6, -1.93, 0, 0.7, 1.0, function (g, w, h) {
      g.fillStyle = '#f7f5ef'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1f2a36'; g.font = 'bold 44px "Segoe UI", sans-serif'; g.fillText('OSI-modellen', 30, 64);
      var L = [['7 Applikation', '#e57373', 'HTTP, DNS, SSH'], ['6 Presentation', '#f0a35e', 'TLS, kodning'], ['5 Session', '#f0cf5e', 'sessioner'], ['4 Transport', '#8bc34a', 'TCP, UDP, portar'], ['3 Nätverk', '#4db6ac', 'IP, routing'], ['2 Länk', '#64b5f6', 'Ethernet, VLAN, MAC'], ['1 Fysiskt', '#9575cd', 'kabel, ljus, radio']];
      L.forEach(function (l, i) {
        var y = 100 + i * 88;
        g.fillStyle = l[1]; g.fillRect(30, y, w - 60, 76);
        g.fillStyle = '#1b1b1b'; g.font = 'bold 32px "Segoe UI", sans-serif'; g.fillText(l[0], 48, y + 40);
        g.font = '22px "Segoe UI", sans-serif'; g.fillText(l[2], 48, y + 66);
      });
    });
    poster(2.2, 1.6, -1.93, 0, 0.8, 0.6, function (g, w, h) {
      var gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#1f4e79'); gr.addColorStop(1, '#3c7478');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = '#f0b429'; g.font = 'bold 40px "Segoe UI", sans-serif'; g.fillText('Nordvik', 34, 70);
      g.fillStyle = '#fff'; g.font = '28px "Segoe UI", sans-serif';
      ['Vi hjälper varandra.', 'Vi dokumenterar.', 'Vi drar inte ur kablar', 'vi inte känner.'].forEach(function (s, i) { g.fillText(s, 34, 130 + i * 44); });
      g.font = '64px sans-serif'; g.fillText('🦀', w - 110, h - 36);
    });
  };

  // ------------------------------------------------------------------ Serverrummet
  E.serverRoom = function () {
    var self = this;
    // Varningsram framför racken
    var c = T.canvas(512, 256), g = c.getContext('2d');
    g.clearRect(0, 0, 512, 256);
    g.save(); g.beginPath(); g.rect(0, 0, 512, 256); g.rect(28, 28, 456, 200); g.clip('evenodd');
    for (var i = -256; i < 768; i += 40) { g.fillStyle = (i / 40) % 2 ? '#1b1b1b' : '#f2c21b'; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 20, 0); g.lineTo(i - 236, 256); g.lineTo(i - 256, 256); g.fill(); }
    g.restore();
    var st = T.toTex(c);
    var frame = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.95), new THREE.MeshStandardMaterial({ map: st, transparent: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false }));
    frame.rotation.x = -Math.PI / 2; frame.position.set(-12.05, 0.008, -8.3);
    this.scene.add(frame);
    // Perforerade golvplattor med kall luft
    var vent = T.mat('perforated', { roughness: 0.5, metalness: 0.5 }, 3, 3);
    [-12.35, -11.75].forEach(function (x) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.58), vent);
      m.rotation.x = -Math.PI / 2; m.position.set(x, 0.009, -8.3);
      self.scene.add(m);
      self.fx.emitter(function (w) { this.cold(w); }, 3, { x: x, y: 0.05, z: -8.3 }, 10);
    });
    this.fx.emitter(function (w) { this.cold(w); }, 2, { x: -7, y: 1.3, z: -9.05 }, 10);
    // Statustorn på rack A
    var tower = new THREE.Group();
    tower.position.set(this.A.rackA.x + 0.22, 2.07, this.A.rackA.z + 0.38);
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 8), this.b.std(0x333333, 0.4, 0.6)); pole.position.y = 0.06; tower.add(pole);
    this.towerMats = [0xff3b30, 0xffb020, 0x33ff66].map(function (col, i) {
      var m = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: col, emissiveIntensity: 0, transparent: true, opacity: 0.9, roughness: 0.3 });
      m.userData.keep = true;
      var seg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 16), m);
      seg.position.y = 0.3 - i * 0.055; tower.add(seg);
      return m;
    });
    this.scene.add(tower);
    // Larmlampa vid dörren
    this.beacon = new THREE.Group();
    this.beacon.position.set(-9.2, 2.9, -2.35);
    var dome = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x551111, emissive: 0xff2010, emissiveIntensity: 0.2, transparent: true, opacity: 0.85 }));
    dome.rotation.x = Math.PI; this.beacon.add(dome);
    this.beaconMat = dome.material;
    this.beaconMat.userData.keep = true;
    this.beaconLight = new THREE.PointLight(0xff2a10, 0, 7, 2);
    this.beaconLight.position.set(-9.2, 2.6, -3);
    this.scene.add(this.beacon);
    if (NV.gfx.profile().lights) this.scene.add(this.beaconLight);
    this.fx.emitter(function (w) { this.smoke(w, 0x4a3a3a); }, 3, function () { return self.storm ? { x: self.A.rackA.x + 0.3, y: 2.1, z: self.A.rackA.z } : null; }, 16);
  };

  // ------------------------------------------------------------------ Kaffe
  E.coffee = function () {
    var m = this.A.coffee;
    if (!m) return;
    m.userData.interact = { type: 'coffee' };
    var b = this.b;
    var spout = b.box(0.06, 0.06, 0.06, -2.8, 1.02, -9.46, b.std(0x888c90, 0.3, 0.8), { cast: false });
    spout.userData.interact = { type: 'coffee' };
    var cup = b.cyl(0.035, 0.03, 0.08, -2.8, 0.97, -9.45, b.std(0xffffff, 0.4, 0));
    cup.userData.interact = { type: 'coffee' };
    var led = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.015, 0.005), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 2.5, 0.4) }));
    led.position.set(-2.72, 1.3, -9.42); this.scene.add(led);
    this.coffeeLed = led.material;
    this.fx.emitter(function (w) { this.steam(w); }, 2.2, { x: -2.8, y: 1.02, z: -9.45 }, 10);
    this.w.collectInteractables();
  };

  // ------------------------------------------------------------------ Väder, brandvarnare, lastkaj och dammsugare
  E.weatherSetup = function () {
    var self = this;
    // Regn som rinner på fönstren: en rullande textur framför varje fönster
    var c = T.canvas(128, 256), g = c.getContext('2d');
    g.clearRect(0, 0, 128, 256);
    for (var i = 0; i < 70; i++) { var x = Math.random() * 128, y = Math.random() * 256, l = 8 + Math.random() * 22; g.strokeStyle = 'rgba(220,235,255,' + (0.25 + Math.random() * 0.4) + ')'; g.lineWidth = 1 + Math.random(); g.beginPath(); g.moveTo(x, y); g.lineTo(x - 1.5, y + l); g.stroke(); }
    for (var j = 0; j < 40; j++) { g.fillStyle = 'rgba(230,240,255,0.5)'; g.beginPath(); g.arc(Math.random() * 128, Math.random() * 256, 1 + Math.random() * 2, 0, Math.PI * 2); g.fill(); }
    var t = T.toTex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 1);
    this.rainMat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0.8 });
    this.rainPlanes = [];
    this.b.sem.forEach(function (s) {
      if (s.type !== 'window') return;
      var m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), self.rainMat);
      m.position.set(s.x, s.y, s.z); m.rotation.y = s.ry; m.translateZ(0.012);
      m.visible = false; m.userData.dynamic = true; m.renderOrder = 2;
      self.scene.add(m); self.rainPlanes.push(m);
    });
    // Brandvarnare i taket med en lampa som blinkar
    this.smokeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 0.2, 0.1) });
    this.smokeMat.userData.keep = true;
    [[-10.5, -6], [-1.5, -6], [9, -6], [-10, 6], [3, 4], [10, 7], [-10, 0]].forEach(function (p) {
      var d = NV.models.mesh(NV.models.cyl(0.07, 0.07, 0.035, 16), self.b.std(0xf4f4f2, 0.5, 0), p[0], 2.98, p[1], self.scene, false);
      var l = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), self.smokeMat); l.position.set(p[0] + 0.03, 2.96, p[1]); self.scene.add(l);
    });
    // Trafikljus vid lastkajen och truckladdare
    var tl = new THREE.Group(); tl.position.set(111.75, 3.4, 3.4); tl.rotation.y = -Math.PI / 2;
    NV.models.mesh(NV.models.rbox(0.2, 0.46, 0.12, 0.03), this.b.std(0x1b1b1b, 0.5, 0.3), 0, 0, 0, tl);
    this.dockRed = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 0.15, 0.1) });
    this.dockGreen = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.4, 0.1) });
    [[this.dockRed, 0.1], [this.dockGreen, -0.1]].forEach(function (x) { var s = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), x[0]); s.position.set(0, x[1], 0.05); tl.add(s); });
    this.scene.add(tl);
    this.b.box(0.5, 0.9, 0.35, 110.9, 0.45, 10.5, this.b.std(0x2a3f5a, 0.5, 0.3), { collide: true });
    this.chargeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 2.5, 0.4) });
    var cl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.01), this.chargeMat); cl.position.set(110.9, 0.75, 10.32); this.scene.add(cl);
    // Dammsugarroboten "Städ-Sture"
    var M = NV.models, vg = new THREE.Group();
    M.mesh(M.cyl(0.17, 0.17, 0.07, M.seg(28, 12)), this.b.std(0x2b2d31, 0.35, 0.4), 0, 0.045, 0, vg);
    M.mesh(M.cyl(0.12, 0.12, 0.012, 20), this.b.std(0x4a4d52, 0.3, 0.6), 0, 0.085, 0, vg);
    var vled = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.6, 3) })); vled.position.set(0, 0.09, -0.12); vg.add(vled);
    M.mesh(M.rbox(0.2, 0.03, 0.05, 0.01), this.b.std(0x777c82, 0.4, 0.6), 0, 0.03, -0.13, vg);
    var vhit = new THREE.Mesh(M.cyl(0.25, 0.25, 0.2, 8), new THREE.MeshBasicMaterial({ visible: false })); vhit.position.y = 0.1; vg.add(vhit);
    vg.traverse(function (o) { if (o.isMesh) o.userData.interact = { type: 'vacuum' }; });
    vg.userData.dynamic = true;
    this.scene.add(vg);
    this.vac = vg;
    this.w.collectInteractables();
  };
  E.setWeather = function (w) {
    this.weather = w || 'sun';
    var rain = this.weather === 'rain';
    this.rainPlanes.forEach(function (m) { m.visible = rain; });
    this.drawSky(0);
    if (this.beamMat) this.beamMat.uniforms.uI.value = this.weather === 'sun' ? 0.12 : (this.weather === 'clouds' ? 0.04 : 0);
    this.w.sun.intensity = this.weather === 'sun' ? 1.5 : (this.weather === 'clouds' ? 1.1 : 0.8);
  };
  E.updateWorldBits = function (dt) {
    var t = this.t, self = this;
    if (this.rainMat && this.weather === 'rain') this.rainMat.map.offset.y = (t * 0.35) % 1;
    NV.sfx.rain(this.weather === 'rain' && this.w.site === 'gbg' && !(this.w.game.ui && this.w.game.ui.captures()) ? 1 : (this.weather === 'rain' ? 0.25 : 0));
    if (this.smokeMat) this.smokeMat.color.setRGB(t % 3 < 0.12 ? 3 : 0.15, 0.05, 0.02);
    if (this.coffeeLed) { var busy = this.w.game.boosted && this.w.game.boosted(); this.coffeeLed.color.setRGB(busy ? 2.5 : 0.2, busy ? 0.3 : 2.5, busy ? 0.1 : 0.4); }
    if (this.dockRed && this.truck) { var go = this.truck.wait > 0; this.dockRed.color.setRGB(go ? 0.3 : 2.5, 0.1, 0.1); this.dockGreen.color.setRGB(0.1, go ? 2.5 : 0.3, 0.1); }
    if (this.chargeMat) this.chargeMat.color.setRGB(0.2, 1 + Math.sin(t * 2) * 1.2, 0.4);
    // Dammsugaren
    var v = this.w.game.vac;
    if (v && this.vac) {
      NV.shared.vacStep(v, dt, this.w.collides.bind(this.w));
      this.vac.visible = this.w.site === 'gbg';
      this.vac.position.set(v.x, 0, v.z);
      this.vac.rotation.y = -v.dir + Math.PI / 2;
      var dv = Math.hypot(this.w.pos.x - v.x, this.w.pos.z - v.z);
      NV.sfx.vacuum(this.w.site === 'gbg' ? Math.max(0, 1 - dv / 6) : 0);
    }
    // Krabbans fotspår
    var c = this.w.game.crab;
    if (c && c.active && c.site === this.w.site) {
      var d = Math.hypot(c.x - (this.lastPrint ? this.lastPrint.x : 1e9), c.z - (this.lastPrint ? this.lastPrint.z : 1e9));
      if (d > 0.22) { this.lastPrint = { x: c.x, z: c.z }; [-1, 1].forEach(function (s) { self.fx.p(self.fx.norm, { x: c.x + s * 0.06, y: 0.012, z: c.z + s * 0.04, life: 7, size: 0.035, color: 0x5a4a3a, a: 0.5, fadePow: 1.2, force: true }); }); }
    }
  };
  E.printFx = function () {
    var p = this.w.dev.extra.printer;
    if (!p) return;
    var sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.297), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide, transparent: true }));
    sheet.rotation.x = -Math.PI / 2 + 0.2;
    var start = p.position.clone().add(new V3(0, 0.1, -0.1));
    sheet.position.copy(start);
    this.scene.add(sheet);
    var self = this, t0 = this.t;
    this.tweens = this.tweens || [];
    this.tweens.push(function () {
      var k = (self.t - t0) / 1.6;
      sheet.position.z = start.z + Math.min(1, k) * 0.35;
      sheet.position.y = start.y + Math.min(1, k) * 0.02 - Math.max(0, k - 1) * 0.05;
      if (k > 2.5) sheet.material.opacity = Math.max(0, 1 - (k - 2.5) * 2);
      if (k > 3) { self.scene.remove(sheet); return false; }
      return true;
    });
  };
  E.waterFx = function () {
    var p = this.A.water, self = this;
    if (!p) return;
    for (var i = 0; i < 18; i++) this.pending.push({ at: this.t + i * 0.08, fn: function () { self.fx.p(self.fx.add, { x: p.x + (Math.random() - 0.5) * 0.12, y: 1.02, z: p.z + (Math.random() - 0.5) * 0.12, vy: 0.35 + Math.random() * 0.2, life: 0.8, size: 0.02, color: 0xcfefff, hdr: 1.5, force: true }); } });
  };
  E.thank = function (name) {
    var f = this.w.people[name];
    if (!f || !f.group.visible) return;
    var p = f.group.position.clone(); p.y = f.sitting ? 1.6 : 2.05;
    this.fx.popup('Tack! 😊', p, { color: '#6dff9a', height: 0.13, life: 2.4, vy: 0.2 });
  };
  E.mugs = function () {
    var self = this, b = this.b;
    ['PC-Anna', 'PC-Lisa', 'PC-Bo', 'PC-Karim'].forEach(function (id, i) {
      var d = self.A.desks[id];
      if (!d) return;
      var x = d.x - 0.55, z = d.z + 0.12;
      b._mute++;
      b.cyl(0.04, 0.035, 0.09, x, 0.805, z, b.std([0xc0392b, 0x2f6fd6, 0xf0b429, 0x3fbf6f][i], 0.5, 0));
      b._mute--;
      self.fx.emitter(function (w) { this.steam(w); }, 0.9, { x: x, y: 0.86, z: z }, 7);
    });
  };

  // ------------------------------------------------------------------ Lagret
  E.warehouse = function () {
    var tr = this.A.truck;
    if (tr) { this.truck = { g: tr, x: tr.position.x, dir: -1, wait: 2, col: this.A.truckCollider }; }
    var ft = this.A.flickerTube;
    if (ft) this.flicker = ft.material;
  };
  E.updateTruck = function (dt) {
    var tk = this.truck, tp = this.truckParts;
    if (!tk) return;
    if (tp) tp.beacon.material.color.setRGB(Math.sin(this.t * 8) > 0 ? 3 : 0.6, Math.sin(this.t * 8) > 0 ? 1.4 : 0.3, 0.1);
    // Vid ändarna lyfts eller sänks gafflarna medan trucken står still
    if (tk.wait > 0) {
      tk.wait -= dt;
      if (tp) { var want = tk.dir > 0 ? 0.9 : 0.12; tp.fork.position.y += (want - tp.fork.position.y) * (1 - Math.exp(-dt * 1.5)); }
      return;
    }
    var p = this.w.pos;
    var ahead = tk.x + tk.dir * 1.4;
    if (Math.abs(p.x - ahead) < 1.4 && Math.abs(p.z - tk.g.position.z) < 1.2) { tk.honk = (tk.honk || 0) - dt; if (tk.honk <= 0) { NV.sfx.honk(); tk.honk = 3; } tk.v = 0; return; }
    // Mjuk start och inbromsning
    var distEnd = tk.dir > 0 ? 108 - tk.x : tk.x - 98;
    var target = Math.min(0.9, 0.2 + distEnd * 0.4);
    tk.v = (tk.v || 0) + (target - (tk.v || 0)) * (1 - Math.exp(-dt * 2));
    tk.x += tk.dir * dt * tk.v;
    if (tk.x < 98) { tk.x = 98; tk.dir = 1; tk.wait = 3; tk.v = 0; }
    if (tk.x > 108) { tk.x = 108; tk.dir = -1; tk.wait = 4; tk.v = 0; }
    tk.g.position.x = tk.x;
    var wantR = tk.dir > 0 ? Math.PI : 0;
    var dr = wantR - tk.g.rotation.y; while (dr > Math.PI) dr -= Math.PI * 2; while (dr < -Math.PI) dr += Math.PI * 2;
    tk.g.rotation.y += dr * (1 - Math.exp(-dt * 1.2));
    if (tp) tp.wheels.forEach(function (w) { w.rotation.z -= dt * tk.v / 0.2; });
    if (tk.col) { tk.col.minX = tk.x - 0.9; tk.col.maxX = tk.x + 0.9; }
    if (Math.random() < dt * 6 && this.w.site === 'boras') this.fx.dust({ x: tk.x - tk.dir * 0.5, z: tk.g.position.z }, 0x8d8a84);
  };

  // ------------------------------------------------------------------ Tomma skärmar: skärmsläckare
  E.idleScreens = function () {
    var list = (this.w.dev.extra.idleMonitors || []);
    this.idle = list.map(function (m) { return { m: m, x: 60, y: 60, vx: 90, vy: 70 }; });
  };
  E.drawIdle = function (dt) {
    var cam = this.w.pos;
    this.idle.forEach(function (s) {
      var p = s.m.group.position;
      if (Math.abs(p.x - cam.x) + Math.abs(p.z - cam.z) > 10) return;
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.x < 0 || s.x > 512 - 170) s.vx *= -1;
      if (s.y < 30 || s.y > 300 - 10) s.vy *= -1;
      var g = s.m.canvas.getContext('2d');
      g.fillStyle = '#05070a'; g.fillRect(0, 0, 512, 300);
      g.fillStyle = 'hsl(' + ((s.x + s.y) % 360) + ',70%,60%)'; g.font = 'bold 34px "Segoe UI", sans-serif';
      g.fillText('Nordvik 🦀', s.x, s.y);
      s.m.tex.needsUpdate = true;
    });
  };

  // ------------------------------------------------------------------ Fläktar ovanpå racken
  E.rackFans = function () {
    var self = this;
    this.fans = [];
    var R = this.w.dev.racks;
    Object.keys(R).forEach(function (k) {
      var rack = R[k];
      [-0.14, 0.14].forEach(function (x) {
        var g = new THREE.Group();
        g.position.set(x, 2.08, 0.05);
        var ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.008, 6, 20), self.b.std(0x111111, 0.4, 0.6)); ring.rotation.x = Math.PI / 2; g.add(ring);
        var blades = new THREE.Group();
        for (var i = 0; i < 5; i++) { var bl = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.004, 0.028), self.b.std(0x2a2d31, 0.5, 0.3)); bl.position.x = 0.04; bl.rotation.x = 0.4; var p = new THREE.Group(); p.rotation.y = i / 5 * Math.PI * 2; p.add(bl); blades.add(p); }
        g.add(blades);
        g.userData.dynamic = true;
        rack.group.add(g);
        self.fans.push(blades);
      });
    });
  };

  // ------------------------------------------------------------------ Wifi-ringar under accesspunkterna
  E.apRings = function () {
    var self = this;
    this.rings = [];
    Object.keys(this.w.dev.aps).forEach(function (id) {
      var ap = self.w.dev.aps[id];
      for (var i = 0; i < 2; i++) {
        var m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.8, 0.8), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
        m.rotation.x = Math.PI / 2;
        m.userData.dynamic = true;
        m.position.copy(ap.group.position); m.position.y -= 0.06;
        self.scene.add(m);
        self.rings.push({ m: m, id: id, ph: i * 0.5 });
      }
    });
  };

  // ------------------------------------------------------------------ Krabban
  E.crabBuild = function () {
    var b = this.b, M = NV.models, g = new THREE.Group();
    var shell = b.std(0xd9442a, 0.38, 0.1), dark = b.std(0x9c2a17, 0.45, 0.1), belly = b.std(0xf2c7a0, 0.6, 0), white = b.std(0xffffff, 0.2, 0), black = b.std(0x111111, 0.2, 0);
    var body = new THREE.Group(); body.position.y = 0.09; g.add(body);
    var top = M.mesh(M.sphere(0.1, M.seg(22, 10), M.seg(14, 7)), shell, 0, 0, 0, body); top.scale.set(1.35, 0.5, 1.05);
    var under = M.mesh(M.sphere(0.095, 16, 8), belly, 0, -0.012, 0, body); under.scale.set(1.25, 0.32, 0.95);
    // Knölar på skalet
    for (var i = 0; i < M.seg(7, 3); i++) { var a = i / 7 * Math.PI * 2; var k = M.mesh(M.sphere(0.018, 8, 6), dark, Math.cos(a) * 0.07, 0.04, Math.sin(a) * 0.05, body); k.scale.y = 0.5; }
    var legs = [];
    [-1, 1].forEach(function (s) {
      for (var j = 0; j < 4; j++) {
        var hip = new THREE.Group(); hip.position.set(s * 0.1, 0.0, 0.05 - j * 0.035); hip.rotation.y = s * (0.35 - j * 0.22); body.add(hip);
        var up = new THREE.Group(); up.rotation.z = s * 0.5; hip.add(up);
        M.mesh(M.capsule(0.009, 0.06, 3, 6), dark, s * 0.035, 0, 0, up).rotation.z = Math.PI / 2;
        var knee = new THREE.Group(); knee.position.x = s * 0.075; knee.rotation.z = -s * 1.25; up.add(knee);
        M.mesh(M.cyl(0.008, 0.003, 0.08, 6), dark, s * 0.035, 0, 0, knee).rotation.z = Math.PI / 2;
        legs.push({ up: up, knee: knee, s: s, j: j });
      }
    });
    // Klor med underkäke som öppnas och stängs
    var claws = [];
    [-1, 1].forEach(function (s) {
      var arm = new THREE.Group(); arm.position.set(s * 0.085, 0.01, -0.07); body.add(arm);
      M.mesh(M.capsule(0.013, 0.05, 3, 6), shell, s * 0.02, 0, -0.025, arm).rotation.set(Math.PI / 2, 0, s * 0.5);
      var hand = new THREE.Group(); hand.position.set(s * 0.04, 0.01, -0.07); arm.add(hand);
      var palm = M.mesh(M.sphere(0.034, 12, 8), shell, 0, 0, 0, hand); palm.scale.set(0.9, 0.65, 1.1);
      var finger = M.mesh(M.geo('crabTip', function () { return new THREE.ConeGeometry(0.014, 0.055, 6); }), shell, 0, 0.008, -0.045, hand); finger.rotation.x = -Math.PI / 2;
      var jawP = new THREE.Group(); jawP.position.set(0, -0.008, -0.02); hand.add(jawP);
      var jaw = M.mesh(M.geo('crabTip', null), dark, 0, 0, -0.025, jawP); jaw.rotation.x = -Math.PI / 2; jaw.scale.set(0.8, 0.9, 0.8);
      claws.push({ arm: arm, jaw: jawP, s: s });
    });
    // Ögon på skaft
    var eyes = [];
    [-1, 1].forEach(function (s) {
      var st = new THREE.Group(); st.position.set(s * 0.03, 0.04, -0.07); body.add(st);
      M.mesh(M.cyl(0.005, 0.006, 0.05, 6), dark, 0, 0.025, 0, st);
      M.mesh(M.sphere(0.016, 10, 8), white, 0, 0.055, 0, st);
      M.mesh(M.sphere(0.008, 8, 6), black, 0, 0.057, -0.012, st);
      eyes.push(st);
    });
    var hit = new THREE.Mesh(M.cyl(0.28, 0.28, 0.35, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.15; g.add(hit);
    g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.userData.interact = { type: 'crab' }; } });
    M.mergeChildren(body, []);
    g.visible = false; g.userData.dynamic = true;
    this.scene.add(g);
    this.crab = { g: g, body: body, legs: legs, claws: claws, eyes: eyes, gait: 0 };
    this.w.collectInteractables();
  };
  E.updateCrab = function (dt) {
    var c = this.crab, st = this.w.game.crab;
    if (!st || !st.active || st.site !== this.w.site) { c.g.visible = false; return; }
    c.g.visible = true;
    var ox = st.x, oz = st.z;
    var moving = NV.shared.crabStep(st, dt, this.w.pos, this.w.collides.bind(this.w));
    var moved = Math.hypot(st.x - ox, st.z - oz);
    c.g.position.set(st.x, 0, st.z);
    // Vrid kroppen mjukt mot riktningen
    var d = st.face - c.g.rotation.y; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    c.g.rotation.y += d * (1 - Math.exp(-dt * 10));
    // Gång i tripod-takt: varannat ben lyfts
    c.gait += moved * 55;
    var amt = moving ? 1 : 0;
    c.legs.forEach(function (l) {
      var ph = c.gait + (l.j % 2 ? Math.PI : 0) + (l.s > 0 ? Math.PI : 0);
      l.up.rotation.z = l.s * (0.5 + Math.max(0, Math.sin(ph)) * 0.45 * amt);
      l.up.rotation.y = Math.cos(ph) * 0.3 * amt;
    });
    c.body.position.y = 0.09 + Math.abs(Math.sin(c.gait)) * 0.012 * amt;
    c.body.rotation.z = Math.sin(c.gait) * 0.06 * amt;
    // Klorna knäpper, högre och snabbare när krabban flyr
    var t = this.t;
    c.claws.forEach(function (cl) {
      var snap = st.fleeing ? Math.abs(Math.sin(t * 14 + cl.s)) : Math.max(0, Math.sin(t * 2 + cl.s * 2)) * 0.6;
      cl.jaw.rotation.x = 0.5 * snap;
      cl.arm.rotation.x = st.fleeing ? -0.6 : Math.sin(t * 1.3 + cl.s) * 0.12;
    });
    // Ögonen följer spelaren
    var toP = Math.atan2(this.w.pos.x - st.x, this.w.pos.z - st.z) - c.g.rotation.y + Math.PI;
    c.eyes.forEach(function (e) { e.rotation.y += (Math.sin(toP) * 0.6 - e.rotation.y) * 0.2; e.rotation.x = Math.sin(t * 3 + e.position.x * 40) * 0.1; });
    if (moving && st.fleeing && Math.random() < dt * 10) this.fx.dust({ x: st.x, z: st.z }, 0xcfc6b0);
  };

  // ------------------------------------------------------------------ Dörrar som öppnas när du kommer nära
  E.doors = function () {
    var self = this, b = this.b, M = NV.models;
    this.doorList = [];
    var wood = b.std(0xc9a57a, 0.55, 0), frame = b.std(0x9aa0a6, 0.4, 0.6), handle = b.std(0xdfe3e6, 0.25, 0.9);
    // Skjutdörr till serverrummet med kortläsare
    var sd = new THREE.Group(); sd.position.set(-10.4, 0, -2.09);
    M.mesh(M.rbox(1.22, 2.08, 0.045, 0.015), b.std(0x7c8590, 0.45, 0.5), 0, 1.04, 0, sd);
    M.mesh(M.rbox(0.5, 0.7, 0.05, 0.01), b.std(0xcfe3ea, 0.05, 0.1, { transparent: true, opacity: 0.35 }), 0, 1.5, -0.001, sd, false);
    M.mesh(M.rbox(0.04, 0.35, 0.05, 0.015), handle, 0.5, 1.05, -0.04, sd);
    this.scene.add(sd);
    M.mesh(M.rbox(1.5, 0.08, 0.1, 0.01), frame, -10.7, 2.14, -2.1, this.scene);
    var reader = M.mesh(M.rbox(0.08, 0.12, 0.03, 0.01), b.std(0x222428, 0.4, 0.3), -9.6, 1.25, 1.94 - 4, this.scene);
    reader.position.set(-9.6, 1.25, -1.93);
    var rl = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.005), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 0.2, 0.2) }));
    rl.position.set(-9.6, 1.29, -1.913); this.scene.add(rl);
    this.doorList.push({ g: sd, kind: 'slide', base: -10.4, open: -1.2, cx: -10.4, cz: -2, k: 0, led: rl.material });
    // Svängdörrar till ekonomi och fikarummet
    function swing(hx, z, w, dir, side) {
      var g = new THREE.Group(); g.position.set(hx, 0, z);
      M.mesh(M.rbox(w - 0.02, 2.06, 0.045, 0.012), wood, w / 2 * side, 1.03, 0, g);
      M.mesh(M.sphere(0.028, 10, 8), handle, (w - 0.12) * side, 1.0, -0.05, g);
      M.mesh(M.sphere(0.028, 10, 8), handle, (w - 0.12) * side, 1.0, 0.05, g);
      self.scene.add(g);
      self.doorList.push({ g: g, kind: 'swing', open: dir, cx: hx + w / 2 * side, cz: z, k: 0 });
    }
    swing(-10, 2, 1.2, -1.45, 1);
    swing(-2.2, -2, 1.2, 1.45, 1);
    this.doorList.forEach(function (d) { d.g.userData.dynamic = true; });
  };
  E.updateDoors = function (dt) {
    var p = this.w.pos, self = this;
    this.doorList.forEach(function (d) {
      var near = Math.hypot(p.x - d.cx, p.z - d.cz) < 2.3;
      var want = near ? 1 : 0;
      if (want && d.k < 0.05 && !d.snd) { d.snd = true; NV.sfx.door(d.kind === 'slide'); }
      if (!want) d.snd = false;
      d.k += (want - d.k) * (1 - Math.exp(-dt * (d.kind === 'slide' ? 5 : 4)));
      var e = d.k * d.k * (3 - 2 * d.k);
      if (d.kind === 'slide') { d.g.position.x = d.base + d.open * e; if (d.led) d.led.color.setRGB(near ? 0.2 : 2.5, near ? 2.5 : 0.2, 0.2); }
      else d.g.rotation.y = d.open * e;
    });
  };

  // Perforerade frontdörrar på racken som svänger upp när du kommer nära
  E.rackDoors = function () {
    var self = this, M = NV.models;
    var c = T.canvas(128, 128), g = c.getContext('2d');
    g.fillStyle = '#1b1d21'; g.fillRect(0, 0, 128, 128);
    g.globalCompositeOperation = 'destination-out';
    for (var y = 4; y < 128; y += 8) for (var x = 4 + (y / 8 % 2) * 4; x < 128; x += 8) { g.beginPath(); g.arc(x, y, 2.6, 0, Math.PI * 2); g.fill(); }
    var t = T.toTex(c, [6, 22]);
    var mat = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.6 });
    var fr = this.b.std(0x1c1e22, 0.45, 0.6), hd = this.b.std(0xb8bec4, 0.25, 0.9);
    this.rackDoorList = [];
    Object.keys(this.w.dev.racks).forEach(function (k) {
      var rack = self.w.dev.racks[k];
      var hinge = new THREE.Group(); hinge.position.set(-0.3, 0, 0.515);
      var panel = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 1.92), mat); panel.position.set(0.3, 1.03, 0); hinge.add(panel);
      [[0.02, 1.96, 0, 1.03], [0.58, 1.96, 0.28, 1.03]].forEach(function () {});
      M.mesh(M.rbox(0.03, 1.96, 0.03, 0.008), fr, 0.015, 1.03, 0, hinge);
      M.mesh(M.rbox(0.03, 1.96, 0.03, 0.008), fr, 0.585, 1.03, 0, hinge);
      M.mesh(M.rbox(0.6, 0.03, 0.03, 0.008), fr, 0.3, 0.06, 0, hinge);
      M.mesh(M.rbox(0.6, 0.03, 0.03, 0.008), fr, 0.3, 2.0, 0, hinge);
      M.mesh(M.rbox(0.025, 0.22, 0.035, 0.01), hd, 0.55, 1.1, 0.03, hinge);
      rack.group.add(hinge);
      hinge.userData.dynamic = true;
      self.rackDoorList.push({ g: hinge, rack: rack, k: 0 });
    });
  };
  E.updateRackDoors = function (dt) {
    var p = this.w.pos, v = new V3();
    this.rackDoorList.forEach(function (d) {
      d.rack.group.getWorldPosition(v);
      var near = Math.hypot(p.x - v.x, p.z - v.z) < 4.6;
      if (near && d.k < 0.05 && !d.snd) { d.snd = true; NV.sfx.door(false); }
      if (!near) d.snd = false;
      d.k += ((near ? 1 : 0) - d.k) * (1 - Math.exp(-dt * 3.5));
      var e = d.k * d.k * (3 - 2 * d.k);
      d.g.rotation.y = -1.9 * e;
    });
  };

  // Truck med förarhytt, skyddstak, gafflar som lyfts och hjul som rullar
  E.truckModel = function () {
    var tr = this.A.truck;
    if (!tr) return;
    var b = this.b, M = NV.models;
    while (tr.children.length) tr.remove(tr.children[0]);
    var yellow = b.std(0xe0a82a, 0.45, 0.25), black = b.std(0x1a1a1a, 0.6, 0.2), steel = b.std(0x6d7176, 0.4, 0.8), seat = b.std(0x2a2a2a, 0.8, 0);
    M.mesh(M.rbox(1.3, 0.55, 0.9, 0.08), yellow, 0.05, 0.5, 0, tr);
    M.mesh(M.rbox(0.45, 0.6, 0.88, 0.1), black, 0.55, 0.62, 0, tr);
    M.mesh(M.rbox(0.4, 0.1, 0.45, 0.04), seat, 0.15, 0.82, 0, tr);
    var back = M.mesh(M.rbox(0.08, 0.4, 0.45, 0.03), seat, 0.35, 1.02, 0, tr); back.rotation.z = -0.15;
    M.mesh(M.cyl(0.12, 0.12, 0.04, 16), black, -0.2, 1.0, 0, tr).rotation.z = 1.1;
    [[-0.4, -0.4], [-0.4, 0.4], [0.5, -0.4], [0.5, 0.4]].forEach(function (p) { M.mesh(M.rbox(0.05, 1.3, 0.05, 0.015), black, p[0], 1.4, p[1], tr); });
    M.mesh(M.rbox(1.0, 0.05, 0.9, 0.02), black, 0.05, 2.06, 0, tr);
    var beacon = M.mesh(M.sphere(0.06, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.4, 0.2) }), 0.4, 2.12, 0, tr, false);
    // Mast och gafflar
    [-0.25, 0.25].forEach(function (z) { M.mesh(M.rbox(0.07, 2.3, 0.07, 0.01), steel, -0.7, 1.15, z, tr); });
    var fork = new THREE.Group(); fork.position.set(-0.78, 0.12, 0); tr.add(fork);
    M.mesh(M.rbox(0.05, 0.5, 0.7, 0.01), steel, 0, 0.25, 0, fork);
    [-0.2, 0.2].forEach(function (z) { M.mesh(M.rbox(0.9, 0.04, 0.1, 0.01), steel, -0.45, 0.02, z, fork); });
    // Hjul
    var wheels = [];
    [[-0.45, 0.44], [-0.45, -0.44], [0.55, 0.44], [0.55, -0.44]].forEach(function (p) {
      var w = new THREE.Group(); w.position.set(p[0], 0.2, p[1]); tr.add(w);
      M.mesh(M.cyl(0.2, 0.2, 0.16, M.seg(20, 10)), black, 0, 0, 0, w).rotation.x = Math.PI / 2;
      M.mesh(M.cyl(0.1, 0.1, 0.17, 10), yellow, 0, 0, 0, w).rotation.x = Math.PI / 2;
      wheels.push(w);
    });
    tr.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    M.mergeChildren(tr, [beacon]);
    tr.userData.dynamic = true;
    this.truckParts = { fork: fork, wheels: wheels, beacon: beacon };
  };

  // ------------------------------------------------------------------ Målmarkör
  E.marker = function () {
    var m = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), glowMat(0xffc53d, 2.6));
    m.scale.y = 1.5;
    m.visible = false;
    m.userData.dynamic = true;
    this.scene.add(m);
    var halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex('rgba(255,210,90,0.9)', 'rgba(255,200,60,0)'), color: new THREE.Color(1.2, 1.0, 0.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.set(0.4, 0.4, 1);
    m.add(halo);
    this.mark = m;
  };
  E.updateMarker = function () {
    var o = this.w.game.objective ? this.w.game.objective() : null;
    var hard = NV.settings.get('difficulty') === 'hard';
    var m = this.mark;
    if (!o || hard) { m.visible = false; return; }
    var d = Math.hypot(o.x - this.w.pos.x, o.z - this.w.pos.z);
    // Kollegor har redan ett utropstecken: markören behövs bara på avstånd
    m.visible = d > (/^Prata med/.test(o.label) ? 7 : 1.4);
    m.position.set(o.x, 2.35 + Math.sin(this.t * 2.2) * 0.08, o.z);
    m.rotation.y = this.t * 1.6;
  };

  // ------------------------------------------------------------------ Ficklampa och laptop i handen
  E.flashlight = function () {
    var cam = this.w.camera;
    if (!cam.parent) this.scene.add(cam);
    // På äldre datorer skapas lampan först när den tänds (varje ljus kostar)
    if (!NV.gfx.profile().lights && !this.torchWanted) { this.torch = { intensity: 0, lazy: true }; return; }
    var l = new THREE.SpotLight(0xfff1dc, 0, 16, 0.42, 0.55, 1.4);
    l.position.set(0.15, -0.1, 0);
    var tgt = new THREE.Object3D(); tgt.position.set(0.1, -0.05, -1);
    cam.add(l); cam.add(tgt); l.target = tgt;
    this.torch = l;
    this.torchOn = false;
  };
  E.toggleTorch = function () {
    if (this.torch.lazy) { this.torchWanted = true; this.flashlight(); }
    this.torchOn = !this.torchOn;
    this.torch.intensity = this.torchOn ? 14 : 0;
    NV.sfx.click();
    return this.torchOn;
  };
  E.viewmodel = function () {
    var b = this.b, g = new THREE.Group();
    var base = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.014, 0.2), b.std(0x2b2d31, 0.4, 0.5)); g.add(base);
    var ct = canvasTex(256, 160);
    ct.g.fillStyle = '#0b0d10'; ct.g.fillRect(0, 0, 256, 160);
    ct.g.fillStyle = '#8fe388'; ct.g.font = 'bold 18px monospace';
    ['screen ttyUSB0', '', 'Switch#', 'show ip int br', '█'].forEach(function (l, i) { ct.g.fillText(l, 10, 26 + i * 26); });
    ct.t.needsUpdate = true;
    var lid = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.17), new THREE.MeshBasicMaterial({ map: ct.t, color: new THREE.Color(1.2, 1.2, 1.2) }));
    lid.position.set(0, 0.09, -0.1); lid.rotation.x = -0.35; g.add(lid);
    var back = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.19, 0.008), b.std(0x2b2d31, 0.4, 0.5)); back.position.set(0, 0.09, -0.106); back.rotation.x = -0.35; g.add(back);
    var coil = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.005, 6, 16), b.std(0x7fc6f0, 0.5, 0)); coil.position.set(0.16, 0.01, 0.02); coil.rotation.x = Math.PI / 2; g.add(coil);
    g.traverse(function (o) { o.castShadow = false; if (o.material) { o.material = o.material.clone(); o.material.depthTest = false; } o.renderOrder = 30; });
    g.position.set(0.32, -0.3, -0.55); g.rotation.set(0.35, -0.35, 0);
    g.visible = false;
    this.w.camera.add(g);
    this.vm = g;
  };
  function rdtK(dt) { return Math.min(0.1, dt); }
  E.updateViewmodel = function (dt) {
    var w = this.w, tgt = w.consoleTarget, show = false;
    if (tgt && w.dev.entries[tgt] && !w.zoomed) {
      var p = new V3(); w.dev.entries[tgt].face.getWorldPosition(p);
      show = Math.hypot(p.x - w.pos.x, p.z - w.pos.z) < 3.2;
    }
    this.vmK = (this.vmK || 0) + ((show ? 1 : 0) - (this.vmK || 0)) * (1 - Math.exp(-dt * 6));
    this.vm.visible = this.vmK > 0.02;
    // Laptopen släpar efter musen lite och gungar i takt med stegen
    var bob = w.bob || 0, amp = w.bobAmp || 0, k = 1 - Math.exp(-rdtK(dt) * 8);
    w.swayX = (w.swayX || 0) * (1 - k); w.swayY = (w.swayY || 0) * (1 - k);
    this.vmSx = (this.vmSx || 0) + (Math.max(-0.05, Math.min(0.05, w.swayX)) - (this.vmSx || 0)) * k;
    this.vmSy = (this.vmSy || 0) + (Math.max(-0.05, Math.min(0.05, w.swayY)) - (this.vmSy || 0)) * k;
    var e = this.vmK * this.vmK * (3 - 2 * this.vmK);
    this.vm.position.set(0.32 + Math.cos(bob) * 0.01 * amp - this.vmSx, -0.3 - (1 - e) * 0.4 - Math.abs(Math.sin(bob)) * 0.012 * amp + this.vmSy, -0.55);
    this.vm.rotation.set(0.35 + this.vmSy * 2, -0.35 + this.vmSx * 3, this.vmSx * 2);
  };

  // ------------------------------------------------------------------ Nätverksglasögon
  E.goggleSetup = function () {
    this.gMats = { up: glowMat(0x33ff88, 1.8), down: glowMat(0xff3b30, 2.2), warn: glowMat(0xffb020, 2.2), off: glowMat(0x556070, 0.8) };
    this.gLabels = [];
  };
  E.linkStatus = function (l) { return NV.shared.linkStatus(this.w.game.state, l); };
  E.setGoggles = function (on) {
    var self = this;
    this.gogglesOn = on;
    var links = this.w.game.state.links;
    // Färgblindläge: blått för uppe, orange för nere, gult för problem
    var cb = NV.settings.get('colorblind');
    this.gMats.up.color.setHex(cb ? 0x3da5ff : 0x33ff88).multiplyScalar(1.8);
    this.gMats.down.color.setHex(cb ? 0xff8a1f : 0xff3b30).multiplyScalar(2.2);
    this.gMats.warn.color.setHex(cb ? 0xffe14d : 0xffb020).multiplyScalar(2.2);
    Object.keys(this.w.linkMeshes || {}).forEach(function (id) {
      var m = self.w.linkMeshes[id];
      if (!m.userData.baseMat) m.userData.baseMat = m.material;
      if (!on) { m.material = m.userData.baseMat; return; }
      var l = links.filter(function (x) { return x.id === id; })[0];
      m.material = self.gMats[l ? self.linkStatus(l) : 'off'];
    });
    this.gLabels.forEach(function (s) { self.scene.remove(s); s.material.map.dispose(); });
    this.gLabels = [];
    if (!on) return;
    var st = this.w.game.state, D = S.get(st);
    function tag(lines, x, y, z, bad) {
      var mc = T.canvas(8, 8).getContext('2d'); mc.font = 'bold 24px monospace';
      var wmax = 0; lines.forEach(function (l) { wmax = Math.max(wmax, mc.measureText(l[0]).width); });
      var c = T.canvas(Math.ceil(wmax) + 34, 40 + lines.length * 34), g = c.getContext('2d');
      g.fillStyle = 'rgba(4,30,26,0.82)'; g.fillRect(0, 0, c.width, c.height);
      g.strokeStyle = bad ? '#ffb020' : '#33ff88'; g.lineWidth = 4; g.strokeRect(2, 2, c.width - 4, c.height - 4);
      g.font = 'bold 24px monospace';
      lines.forEach(function (l, i) { g.fillStyle = l[1]; g.fillText(l[0], 16, 44 + i * 34); });
      var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.toTex(c), depthTest: false, transparent: true }));
      s.material.color.setScalar(1.4);
      s.renderOrder = 25;
      var h = 0.09 * (lines.length + 1);
      s.scale.set(h * c.width / c.height, h, 1);
      s.position.set(x, y, z);
      self.scene.add(s); self.gLabels.push(s);
    }
    var racks = { A: ['SW1', 'SW2', 'R1', 'WLC', 'LB'], BO: ['RB', 'SWB'] };
    Object.keys(racks).forEach(function (rk) {
      var a = rk === 'A' ? self.A.rackA : self.A.borasRack;
      var lines = [], bad = false;
      racks[rk].forEach(function (id) {
        var L = NV.shared.deviceLine(st, id);
        if (!L) return;
        if (L.bad) bad = true;
        lines.push([L.text, L.bad ? '#ffb020' : '#9fe8c0']);
      });
      if (Object.keys(D.storm).length && rk === 'A') { lines.push(['⚠ BROADCASTSTORM', '#ff5a4f']); bad = true; }
      tag(lines, a.x + (rk === 'A' ? 0.3 : 0.6), 2.4, a.z + (rk === 'A' ? 0.6 : 0), bad);
    });
    Object.keys(this.w.dev.pcs).forEach(function (id) {
      var L = NV.shared.hostLine(st, id), pc = self.w.dev.pcs[id];
      if (!L) return;
      var p = new V3(); pc.monitor.screen.getWorldPosition(p);
      tag([[L.name, '#e6f7ef'], [L.ip, L.bad ? '#ffb020' : '#9fe8c0']], p.x, p.y + 0.55, p.z, L.bad);
    });
    // Accesspunkterna i lagret
    Object.keys(this.w.dev.aps).forEach(function (id) {
      var d = st.devices[id], ap = self.w.dev.aps[id];
      if (!d) return;
      var ok = d.powered && D.apJoined[id];
      tag([[id, '#e6f7ef'], [!d.powered ? 'ingen ström (PoE)' : (D.apJoined[id] ? 'ansluten till WLC' : 'söker WLC…'), ok ? '#9fe8c0' : '#ffb020']], ap.group.position.x, ap.group.position.y - 0.6, ap.group.position.z, !ok);
    });
  };

  // ------------------------------------------------------------------ Paket på kablarna
  E.cableTraffic = function (dt) {
    var self = this, w = this.w, st = w.game.state;
    if (!st || !this.fx.enabled) return;
    var D = S.get(st);
    var storm = Object.keys(D.storm).length > 0;
    this.storm = storm;
    st.links.forEach(function (l) {
      var m = w.linkMeshes && w.linkMeshes[l.id];
      if (!m || !m.visible || !m.userData.curve) return;
      var mid = m.userData.mid;
      if (!mid) { mid = m.userData.mid = m.userData.curve.getPoint(0.5); m.userData.len = m.userData.curve.getLength(); }
      if (Math.abs(mid.x - w.pos.x) + Math.abs(mid.z - w.pos.z) > 9) return;
      var L = D.links[l.id];
      if (!L || !L.up) return;
      var load = storm ? 950 : S.linkLoad(st, l.a.dev, l.a.port);
      var rate = storm ? 14 : 0.4 + load / 160;
      m.userData.acc = (m.userData.acc || Math.random()) + dt * rate;
      while (m.userData.acc >= 1) {
        m.userData.acc -= 1;
        var rev = Math.random() < 0.5;
        var curve = rev ? (m.userData.rcurve || (m.userData.rcurve = new THREE.CatmullRomCurve3(m.userData.curve.points.slice().reverse(), false, 'catmullrom', 0.2))) : m.userData.curve;
        self.fx.packet(curve, { life: m.userData.len / (storm ? 2.2 : 1.1), color: storm ? 0xff5a2a : (rev ? 0x7ee0ff : 0x9dffb8), size: storm ? 0.03 : 0.022, hdr: storm ? 5 : 3.5 });
      }
    });
  };

  // ------------------------------------------------------------------ Pingspår
  E.devPos = function (id) {
    var w = this.w, p = new V3();
    if (!id) return null;
    if (id === 'ISP' || String(id).indexOf('INTERNET') === 0) return w.dev.extra.fiber.clone();
    var e = w.dev.entries[id];
    if (e) { e.face.getWorldPosition(p); p.z += 0.08; return p; }
    var pc = w.dev.pcs[id];
    if (pc) { pc.monitor.screen.getWorldPosition(p); p.y += 0.15; return p; }
    if (id === 'Tekniker' && w.dev.extra.laptop) { w.dev.extra.laptop.getWorldPosition(p); p.y += 0.15; return p; }
    if (w.dev.aps[id]) return w.dev.aps[id].group.position.clone();
    if (id === 'Gast-mobil' && w.dev.extra.phone) return w.dev.extra.phone.position.clone();
    return null;
  };
  E.arcPath = function (pts) {
    var path = new THREE.CurvePath();
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      var d = a.distanceTo(b);
      var mid = a.clone().add(b).multiplyScalar(0.5); mid.y += Math.min(3, 0.25 + d * 0.18);
      path.add(new THREE.QuadraticBezierCurve3(a, mid, b));
    }
    return path;
  };
  var REASON = { acl: 'Stoppad av ACL', arp: 'Inget ARP-svar', 'net-unreachable': 'Ingen väg dit', nolink: 'Ingen länk', noip: 'Ingen IP-adress', nogw: 'Ingen gateway', drop: 'Paketet tappades', noreply: 'Inget svar tillbaka', refused: 'Porten är stängd', ttl: 'TTL tog slut', ipsec: 'Stoppad i IPsec-tunneln', frag: 'För stort paket (DF satt)' };
  E.pingTrace = function (from, res, count) {
    var self = this;
    var ids = [from];
    (res.hops || []).forEach(function (h) { if (ids[ids.length - 1] !== h.dev) ids.push(h.dev); });
    var end = res.ok ? res.at : (res.where || res.at || (res.back ? null : null));
    if (end && ids[ids.length - 1] !== end) ids.push(end);
    var pts = ids.map(function (id) { return self.devPos(id); }).filter(Boolean);
    // Samma plats två gånger i rad (t.ex. två enheter i samma rack) ger ingen båge
    pts = pts.filter(function (p, i) { return i === 0 || p.distanceTo(pts[i - 1]) > 0.05; });
    if (pts.length < 2) {
      if (pts.length === 1 && !res.ok) this.fx.poof(pts[0]);
      return;
    }
    var path = this.arcPath(pts), back = res.ok ? this.arcPath(pts.slice().reverse()) : null;
    var len = path.getLength();
    var life = Math.max(0.6, Math.min(3, len / 6));
    var last = pts[pts.length - 1];
    this.lastTrace = { from: from, res: res, count: count, at: this.t };
    for (var i = 0; i < (count || 4); i++) {
      this.pending.push({ at: this.t + i * 0.45, fn: function (k) {
        var pk = self.fx.packet(path, { life: life, color: res.tunnel ? 0xc58bff : 0x7ee0ff, size: 0.05, hdr: 6, force: true, onEnd: function () {
          if (res.ok) {
            var rb = self.fx.packet(back, { life: life, color: 0x6dff9a, size: 0.05, hdr: 6, force: true });
            if (rb) self.traces.push(rb);
            if (k === 0) self.fx.popup(res.tunnel ? '✓ svar · 🔒 via VPN' : '✓ svar', last.clone().add(new V3(0, 0.25, 0)), { color: res.tunnel ? '#d9b3ff' : '#6dff9a', height: 0.12 });
          } else {
            self.fx.poof(last);
            if (k === 0) self.fx.popup('✗ ' + (REASON[res.reason] || 'Inget svar'), last.clone().add(new V3(0, 0.25, 0)), { color: '#ff7a6a', height: 0.12, life: 2.4 });
          }
        } });
        if (pk) self.traces.push(pk);
      }, k: i });
    }
  };

  // ------------------------------------------------------------------ Portar som går upp och ner
  E.portEvents = function () {
    var self = this, w = this.w, st = w.game.state;
    ['SW1', 'SW2', 'R1', 'RB', 'SWB'].forEach(function (id) {
      var d = st.devices[id], e = w.dev.entries[id];
      if (!d || !e || d.os !== 'ios') return;
      Object.keys(e.fp.ports).forEach(function (port) {
        if (!d.config.ifaces[port]) return;
        var ps = SH.portState(st, d, port);
        var k = id + '|' + port, prev = self.portPrev[k];
        self.portPrev[k] = ps;
        var pos = null;
        function P() { return pos || (pos = w.portPoint(id, port, 0.03)); }
        if (prev && prev !== ps) {
          if (ps === 'connected') { self.fx.ring(P(), 0x4fc3f7, 0.35); self.fx.sparks(P(), 10, 0x7ee0ff); }
          else if (prev === 'connected') self.fx.poof(P(), 0xff5a4f);
        }
        var g = self.glows[k];
        if (ps === 'err-disabled') {
          if (!g) {
            g = new THREE.Sprite(new THREE.SpriteMaterial({ map: self.glowTex || (self.glowTex = radialTex('rgba(255,180,40,1)', 'rgba(255,140,20,0)')), color: new THREE.Color(2.5, 1.6, 0.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
            g.scale.set(0.12, 0.12, 1); g.position.copy(P());
            self.scene.add(g); self.glows[k] = g;
          }
        } else if (g) { self.scene.remove(g); delete self.glows[k]; }
      });
    });
  };

  // ------------------------------------------------------------------ Uppdatering
  E.slow = function () {
    this.drawClocks();
    var game = this.w.game, st = game.state;
    if (!st) return;
    var D = S.get(st);
    this.storm = Object.keys(D.storm).length > 0;
    var open = game.def ? game.def.tasks.some(function (t) { return t.krabba && !game.taskState[t.id].fixed; }) : false;
    this.towerState = this.storm ? 'red' : (open ? 'amber' : 'green');
    this.portEvents();
    if (this.gogglesOn) this.setGoggles(true);
    // Himlen blir varmare under dagen
    var hour = 8 + st.time / 3600;
    var warm = Math.max(0, Math.min(1, (hour - 8) / 8));
    if (this.skyMat) this.skyMat.emissive.setRGB(1, 0.97 - warm * 0.1, 0.92 - warm * 0.2);
    if (this.beamMat) this.beamMat.uniforms.uCol.value.setRGB(1, 0.92 - warm * 0.1, 0.75 - warm * 0.2);
  };
  E.update = function (dt, rdt) {
    this.t += dt;
    var t = this.t, self = this;
    // Moln som glider förbi
    if (this.skyCv) this.skyCv.t.offset.x = (t * 0.004) % 1;
    // Statustornet och larmlampan
    if (this.towerMats) {
      var ts = this.towerState;
      this.towerMats[0].emissiveIntensity = ts === 'red' ? (Math.floor(t * 4) % 2 ? 4 : 0.2) : 0.05;
      this.towerMats[1].emissiveIntensity = ts === 'amber' ? 2.2 + Math.sin(t * 3) * 0.8 : 0.05;
      this.towerMats[2].emissiveIntensity = ts === 'green' ? 2.5 : 0.05;
      this.beaconMat.emissiveIntensity = this.storm ? 3 + Math.sin(t * 12) * 2 : 0.2;
      this.beaconLight.intensity = this.storm ? Math.max(0, Math.sin(t * 9)) * 9 : 0;
    }
    if (this.flicker) this.flicker.emissiveIntensity = Math.random() < 0.08 ? 0.2 : (Math.sin(t * 50) > 0.97 ? 0.6 : 2);
    this.fans.forEach(function (f, i) { f.rotation.y += dt * (self.storm ? 40 : 22) * (i % 2 ? 1 : -1); });
    // Wifi-ringar
    var st = this.w.game.state;
    var D = st ? S.get(st) : null;
    this.rings.forEach(function (r) {
      var joined = D && D.apJoined[r.id] && st.devices[r.id].powered;
      var ph = ((t * 0.6 + r.ph) % 1);
      r.m.visible = !!joined && self.w.site === 'boras';
      r.m.scale.setScalar(0.2 + ph * 1.8);
      r.m.material.opacity = (1 - ph) * 0.6;
    });
    // Växterna gungar lite
    if (NV.gfx.profile().sway) (this.b.plants || []).forEach(function (p, i) { p.m.rotation.z = p.rz + Math.sin(t * 1.1 + i) * 0.035; });
    this.updateTruck(dt);
    this.updateWorldBits(dt);
    if (this.tweens) this.tweens = this.tweens.filter(function (f) { return f(); });
    this.updateCrab(dt);
    this.updateDoors(dt);
    this.updateRackDoors(dt);
    this.updateMarker();
    this.updateViewmodel(rdt);
    // Pingspår
    this.pending = this.pending.filter(function (p) { if (self.t >= p.at) { p.fn(p.k); return false; } return true; });
    this.traces = this.traces.filter(function (pk) {
      if (pk.age >= pk.life) return false;
      if (Math.random() < 0.8) self.fx.p(self.fx.add, { x: pk.x, y: pk.y, z: pk.z, life: 0.45, size: 0.03, color: pk.r > pk.gg ? 0xff7a6a : (pk.b > pk.gg ? 0x7ee0ff : 0x6dff9a), hdr: 2.5, force: true });
      return true;
    });
    this.cableTraffic(dt);
    // Skärmar som bara behöver ritas ibland
    this.tvT = (this.tvT || 0) + dt;
    if (this.tvT > 0.1) {
      if (Math.abs(this.w.pos.x - 7) + Math.abs(this.w.pos.z + 6) < 14) this.drawTv();
      this.drawIdle(this.tvT);
      this.tvT = 0;
    }
  };

  return { Extras: Extras };
})();
