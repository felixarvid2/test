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
    if (m) { m.map = ct.t; m.emissiveMap = ct.t; m.needsUpdate = true; this.skyMat = m; }
  };
  E.drawSky = function (warm) {
    var g = this.skyCv.g;
    var gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, warm > 0.5 ? '#9fb6d8' : '#8fbbe6'); gr.addColorStop(0.58, warm > 0.5 ? '#f3d9b8' : '#d8e8f3');
    gr.addColorStop(0.6, '#7e9670'); gr.addColorStop(1, '#556a4c');
    g.fillStyle = gr; g.fillRect(0, 0, 1024, 256);
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
    var self = this;
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
      self.scene.add(m);
      self.fx.emitter(function () { this.mote({ x1: x - 0.8, x2: x + 0.8, y1: 0.4, y2: 2.2, z1: 6.8, z2: 9.7 }); }, 3.2, { x: x, z: 8.5 }, 12);
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
    this.beaconLight = new THREE.PointLight(0xff2a10, 0, 7, 2);
    this.beaconLight.position.set(-9.2, 2.6, -3);
    this.scene.add(this.beacon); this.scene.add(this.beaconLight);
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
    this.fx.emitter(function (w) { this.steam(w); }, 2.2, { x: -2.8, y: 1.02, z: -9.45 }, 10);
    this.w.collectInteractables();
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
    var tk = this.truck;
    if (!tk) return;
    if (tk.wait > 0) { tk.wait -= dt; return; }
    var p = this.w.pos;
    var ahead = tk.x + tk.dir * 1.4;
    if (Math.abs(p.x - ahead) < 1.4 && Math.abs(p.z - tk.g.position.z) < 1.2) { tk.honk = (tk.honk || 0) - dt; if (tk.honk <= 0) { NV.sfx.honk(); tk.honk = 3; } return; }
    tk.x += tk.dir * dt * 0.9;
    if (tk.x < 98) { tk.x = 98; tk.dir = 1; tk.wait = 3; }
    if (tk.x > 108) { tk.x = 108; tk.dir = -1; tk.wait = 4; }
    tk.g.position.x = tk.x;
    tk.g.rotation.y = tk.dir > 0 ? Math.PI : 0;
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
        m.position.copy(ap.group.position); m.position.y -= 0.06;
        self.scene.add(m);
        self.rings.push({ m: m, id: id, ph: i * 0.5 });
      }
    });
  };

  // ------------------------------------------------------------------ Krabban
  E.crabBuild = function () {
    var b = this.b, g = new THREE.Group();
    var shell = b.std(0xd9442a, 0.45, 0.1), dark = b.std(0x9c2a17, 0.5, 0.1), white = b.std(0xffffff, 0.3, 0), black = b.std(0x111111, 0.3, 0);
    var body = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 12), shell); body.scale.set(1.3, 0.55, 1); body.position.y = 0.08; g.add(body);
    var legs = [];
    [-1, 1].forEach(function (s) {
      for (var i = 0; i < 3; i++) {
        var p = new THREE.Group(); p.position.set(s * 0.1, 0.07, -0.04 + i * 0.045); p.rotation.y = s > 0 ? 0 : Math.PI;
        var l1 = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.09, 6), dark); l1.rotation.z = -1.1; l1.position.set(0.04, 0.01, 0); p.add(l1);
        var l2 = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.004, 0.08, 6), dark); l2.rotation.z = 0.5; l2.position.set(0.09, -0.03, 0); p.add(l2);
        g.add(p); legs.push({ p: p, s: s, i: i });
      }
      var arm = new THREE.Group(); arm.position.set(s * 0.08, 0.09, -0.08);
      var a1 = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 6), shell); a1.rotation.x = Math.PI / 2; a1.rotation.z = s * 0.5; a1.position.set(s * 0.02, 0, -0.03); arm.add(a1);
      var claw = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), shell); claw.scale.set(0.8, 0.6, 1.2); claw.position.set(s * 0.04, 0.01, -0.08); arm.add(claw);
      var pin = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05, 6), dark); pin.rotation.x = -Math.PI / 2; pin.position.set(s * 0.05, 0.015, -0.12); arm.add(pin);
      g.add(arm); legs.push({ arm: arm, s: s });
      var stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.05, 6), dark); stalk.position.set(s * 0.03, 0.14, -0.06); g.add(stalk);
      var eye = new THREE.Mesh(new THREE.SphereGeometry(0.015, 10, 8), white); eye.position.set(s * 0.03, 0.17, -0.065); g.add(eye);
      var pup = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 6), black); pup.position.set(s * 0.03, 0.172, -0.078); g.add(pup);
    });
    var hit = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.35, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.15; g.add(hit);
    g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.userData.interact = { type: 'crab' }; } });
    g.visible = false;
    this.scene.add(g);
    this.crab = { g: g, legs: legs, st: null };
    this.w.collectInteractables();
  };
  E.updateCrab = function (dt) {
    var c = this.crab, st = this.w.game.crab;
    if (!st || !st.active || st.site !== this.w.site) { c.g.visible = false; return; }
    c.g.visible = true;
    var moving = NV.shared.crabStep(st, dt, this.w.pos, this.w.collides.bind(this.w));
    c.g.position.set(st.x, 0, st.z);
    c.g.rotation.y = st.face;
    var sp = moving ? (st.fleeing ? 26 : 12) : 0;
    c.legs.forEach(function (l) {
      if (l.p) l.p.rotation.z = Math.sin(st.anim * sp + l.i * 1.7 + (l.s > 0 ? 0 : Math.PI)) * 0.35;
      if (l.arm) l.arm.rotation.x = Math.sin(st.anim * 5 + (l.s > 0 ? 0 : 1)) * 0.25 - (st.fleeing ? 0.5 : 0);
    });
    st.anim += dt;
    if (moving && st.fleeing && Math.random() < dt * 10) this.fx.dust({ x: st.x, z: st.z }, 0xcfc6b0);
  };

  // ------------------------------------------------------------------ Målmarkör
  E.marker = function () {
    var m = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), glowMat(0xffc53d, 2.6));
    m.scale.y = 1.5;
    m.visible = false;
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
    var l = new THREE.SpotLight(0xfff1dc, 0, 16, 0.42, 0.55, 1.4);
    l.position.set(0.15, -0.1, 0);
    var tgt = new THREE.Object3D(); tgt.position.set(0.1, -0.05, -1);
    cam.add(l); cam.add(tgt); l.target = tgt;
    this.torch = l;
    this.torchOn = false;
  };
  E.toggleTorch = function () {
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
  E.updateViewmodel = function (dt) {
    var w = this.w, tgt = w.consoleTarget, show = false;
    if (tgt && w.dev.entries[tgt] && !w.zoomed) {
      var p = new V3(); w.dev.entries[tgt].face.getWorldPosition(p);
      show = Math.hypot(p.x - w.pos.x, p.z - w.pos.z) < 3.2;
    }
    this.vmK = (this.vmK || 0) + ((show ? 1 : 0) - (this.vmK || 0)) * Math.min(1, dt * 6);
    this.vm.visible = this.vmK > 0.02;
    var bob = w.bob || 0;
    this.vm.position.set(0.32 + Math.sin(bob) * 0.006, -0.3 - (1 - this.vmK) * 0.4 + Math.abs(Math.cos(bob)) * 0.006, -0.55);
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
    var racks = { A: ['SW1', 'SW2', 'R1', 'WLC'], BO: ['RB', 'SWB'] };
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
  var REASON = { acl: 'Stoppad av ACL', arp: 'Inget ARP-svar', 'net-unreachable': 'Ingen väg dit', nolink: 'Ingen länk', noip: 'Ingen IP-adress', nogw: 'Ingen gateway', drop: 'Paketet tappades', noreply: 'Inget svar tillbaka', refused: 'Porten är stängd', ttl: 'TTL tog slut' };
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
        var pk = self.fx.packet(path, { life: life, color: 0x7ee0ff, size: 0.05, hdr: 6, force: true, onEnd: function () {
          if (res.ok) {
            var rb = self.fx.packet(back, { life: life, color: 0x6dff9a, size: 0.05, hdr: 6, force: true });
            if (rb) self.traces.push(rb);
            if (k === 0) self.fx.popup('✓ svar', last.clone().add(new V3(0, 0.25, 0)), { color: '#6dff9a', height: 0.12 });
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
    (this.b.plants || []).forEach(function (p, i) { p.m.rotation.z = p.rz + Math.sin(t * 1.1 + i) * 0.035; });
    this.updateTruck(dt);
    this.updateCrab(dt);
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
