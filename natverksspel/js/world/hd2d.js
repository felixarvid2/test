// HD-2D: ett tredje visningsläge mellan 2D och 3D, i stil med Octopath Traveler och Triangle Strategy.
// Samma 3D-värld (golv, väggar, möbler och ljus) ses snett ovanifrån som ett diorama. Figurerna är
// spelets egna pixelfigurer från 2D-läget, ritade som platta sprites med mjuka skuggor. Tak och väggar
// mellan kameran och dig skärs bort, ljusstrålar faller in genom fönstren, damm glittrar i ljuset och
// tilt-shift-oskärpa gör att allt utom området runt dig blir suddigt. Du går med WASD eller genom att
// klicka (figuren hittar vägen runt möblerna), Q och Z vrider kameran, hjulet zoomar.
(function () {
  if (!NV.World) return;
  var W = NV.World.prototype, W2 = NV.World2D && NV.World2D.prototype;
  var FX = 'assets3d/fx/';
  var PLAYER_LOOK = { skin: 0xf0c8a0, hair: 0x5a3a22, shirt: 0x2f6fb0, pants: 0x33405a, cap: '#d64b3a' };
  var PITCH = 0.72, FOV = 28;          // kamerans lutning (radianer) och smala synfält ger dioramakänslan
  var PX = 1.75 / NV.art2d.FH;         // en pixel i figuren är lika stor som 1,75 m / figurens höjd

  // Vägsökningen från 2D-läget fungerar på samma hinder
  if (W2) { W.navGrid = W2.navGrid; W.findPath = W2.findPath; W.navClearLine = W2.navClearLine; }

  // ------------------------------------------------------------------ Texturer
  var texCache = {};
  function canvasTex(c) {
    var t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  function spriteTex(look, key, dir, frame, sitting, blink) {
    var k = key + ':' + dir + ':' + frame + ':' + (sitting ? 1 : 0) + ':' + (blink ? 1 : 0);
    return texCache[k] || (texCache[k] = canvasTex(NV.art2d.person(look, dir, frame, sitting, blink)));
  }
  var fxTex = {};
  function fx(name) {
    if (fxTex[name]) return fxTex[name];
    var t = fxTex[name] = new THREE.TextureLoader().load(FX + name + '.png');
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  var blobTex = null;
  function blob() {
    if (blobTex) return blobTex;
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    blobTex = new THREE.CanvasTexture(c);
    return blobTex;
  }
  // Ljusstråle: mjuk i kanterna och svagare mot golvet
  var shaftTex = null;
  function shaft() {
    if (shaftTex) return shaftTex;
    var c = document.createElement('canvas'); c.width = 64; c.height = 128;
    var g = c.getContext('2d');
    for (var x = 0; x < 64; x++) {
      var e = Math.sin(Math.PI * x / 63); e = Math.pow(e, 1.6);
      var gr = g.createLinearGradient(0, 0, 0, 128);
      gr.addColorStop(0, 'rgba(255,240,205,' + (0.9 * e) + ')'); gr.addColorStop(0.7, 'rgba(255,232,190,' + (0.45 * e) + ')'); gr.addColorStop(1, 'rgba(255,225,180,0)');
      g.fillStyle = gr; g.fillRect(x, 0, 1, 128);
    }
    shaftTex = new THREE.CanvasTexture(c); shaftTex.colorSpace = THREE.SRGBColorSpace;
    return shaftTex;
  }

  // ------------------------------------------------------------------ Figurer som sprites
  function makeSprite(scene) {
    var m = new THREE.SpriteMaterial({ map: null, alphaTest: 0.5, transparent: false, fog: false });
    var s = new THREE.Sprite(m);
    s.center.set(0.5, 0);
    s.scale.set((NV.art2d.FW + 2) * PX, (NV.art2d.FH + 2) * PX, 1);
    s.renderOrder = 2;
    var sh = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.42), new THREE.MeshBasicMaterial({ map: blob(), transparent: true, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.renderOrder = 1;
    sh.userData.hdNoCut = true;
    var g = new THREE.Group(); g.add(s); g.add(sh);
    g.userData.dynamic = true;
    scene.add(g);
    return { g: g, s: s, sh: sh, blinkT: 2 + Math.random() * 3 };
  }
  // Riktning i bilden: 0 mot kameran, 1 bort, 2 vänster, 3 höger
  function screenDir(fx, fz, camYaw) {
    var ux = -Math.sin(camYaw), uz = -Math.cos(camYaw);     // uppåt i bilden
    var rx = Math.cos(camYaw), rz = -Math.sin(camYaw);      // åt höger i bilden
    var up = fx * ux + fz * uz, rt = fx * rx + fz * rz;
    if (Math.abs(up) >= Math.abs(rt)) return up > 0 ? 1 : 0;
    return rt > 0 ? 3 : 2;
  }
  function setFrame(sp, look, key, dir, frame, sitting, dt) {
    sp.blinkT -= dt;
    var blink = sp.blinkT < 0.12;
    if (sp.blinkT < 0) sp.blinkT = 2 + Math.random() * 4;
    var t = spriteTex(look, key, dir, frame, sitting, blink);
    if (sp.s.material.map !== t) { sp.s.material.map = t; sp.s.material.needsUpdate = true; }
  }

  // ------------------------------------------------------------------ Genomskärning
  // Alla material får en liten tillsats i shadern: ovanför taket syns inget, och allt högt på kamerans
  // sida om dig kapas strax ovanför bordshöjd (med en rastrerad övergång), så att du alltid ser rummet.
  var HDU = {
    uHdCut: { value: 0 }, uHdPlayer: { value: new THREE.Vector3() }, uHdFwd: { value: new THREE.Vector2(0, -1) },
    uHdYMax: { value: 2.96 }, uHdYMaxB: { value: 5.2 },
  };
  function patch(m) {
    if (!m || m.userData.hdp || m.isShaderMaterial || m.isSpriteMaterial || m.isLineBasicMaterial || m.isPointsMaterial) return;
    m.userData.hdp = true;
    var prev = m.onBeforeCompile;
    m.onBeforeCompile = function (sh, r) {
      if (prev) prev.call(this, sh, r);
      for (var k in HDU) sh.uniforms[k] = HDU[k];
      sh.vertexShader = 'varying vec3 vHdW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vHdW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = 'varying vec3 vHdW; uniform float uHdCut; uniform vec3 uHdPlayer; uniform vec2 uHdFwd; uniform float uHdYMax; uniform float uHdYMaxB;\n' +
        sh.fragmentShader.replace('#include <clipping_planes_fragment>', [
          '#include <clipping_planes_fragment>',
          'if (uHdCut > 0.5) {',
          '  if (vHdW.y > (vHdW.x > 50.0 ? uHdYMaxB : uHdYMax)) discard;',
          '  vec2 hdRel = vHdW.xz - uHdPlayer.xz; float hdA = dot(hdRel, uHdFwd); float hdL = abs(dot(hdRel, vec2(-uHdFwd.y, uHdFwd.x)));',
          '  if (vHdW.y > 1.2 && hdA < -0.45 && hdL < 7.5) {',
          '    float hdK = max(smoothstep(-0.45, -1.1, hdA) * 0.0 + clamp((hdA + 1.1) / 0.65, 0.0, 1.0), smoothstep(6.0, 7.5, hdL));',
          '    vec2 hdP = mod(floor(gl_FragCoord.xy), 4.0);',
          '    float hdB = mod(hdP.x * 8.0 + hdP.y * 4.0 + mod(hdP.x + hdP.y, 2.0) * 2.0 + mod(hdP.y, 2.0), 16.0) / 16.0;',
          '    if (hdB >= hdK) discard;',
          '  }',
          '}'].join('\n'));
    };
    var key = m.customProgramCacheKey ? m.customProgramCacheKey.bind(m) : null;
    m.customProgramCacheKey = function () { return (key ? key() : '') + '|hd2d'; };
    m.needsUpdate = true;
  }
  function patchScene(w) {
    w.scene.traverse(function (o) {
      if (!o.material || o.isSprite || (o.userData && o.userData.hdNoCut)) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(patch);
    });
  }

  // ------------------------------------------------------------------ Ljus och stämning
  function buildMood(w) {
    var g = new THREE.Group(); g.visible = false; g.userData.dynamic = true;
    var add = THREE.AdditiveBlending;
    function shaftMat(op) { return new THREE.MeshBasicMaterial({ map: shaft(), color: new THREE.Color(1.9, 1.7, 1.35), transparent: true, opacity: op, blending: add, depthWrite: false, side: THREE.DoubleSide, fog: false }); }
    function patchMat(op) { return new THREE.MeshBasicMaterial({ map: fx('window'), color: 0xffe2b0, transparent: true, opacity: op, blending: add, depthWrite: false, fog: false }); }
    var shafts = [];
    // Solljus genom fönstren: ett snett ljusfält från fönstret ner till en ljusfläck på golvet
    function sunShaft(x, y, z, wd, h, ry, len, op) {
      var ix = Math.sin(ry), iz = Math.cos(ry);           // in i rummet
      var top = y + h / 2, bot = Math.max(0.02, y - h / 2), fx0 = x + ix * len, fz0 = z + iz * len;
      var px = Math.cos(ry), pz = -Math.sin(ry);           // längs fönstret
      var geo = new THREE.BufferGeometry(), hw = wd / 2;
      var v = [x - px * hw, top, z - pz * hw, x + px * hw, top, z + pz * hw, fx0 + px * hw, 0.02, fz0 + pz * hw, fx0 - px * hw, 0.02, fz0 - pz * hw];
      geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
      geo.setIndex([0, 1, 2, 0, 2, 3]);
      var m = new THREE.Mesh(geo, shaftMat(op)); m.renderOrder = 5; g.add(m); shafts.push(m);
      var p = new THREE.Mesh(new THREE.PlaneGeometry(wd * 1.1, h * 0.9), patchMat(op * 1.6));
      p.rotation.x = -Math.PI / 2; p.rotation.z = ry; p.position.set(x + ix * (len - h * 0.3), 0.015, z + iz * (len - h * 0.3)); p.renderOrder = 4;
      g.add(p); shafts.push(p);
      void bot;
    }
    (w.builder.sem || []).forEach(function (r) { if (r.type === 'window') sunShaft(r.x, r.y, r.z, r.w, r.h, r.ry, 2.8, 0.3); });
    // Lastporten i Borås och takfönster över lagret
    sunShaft(111.9, 2.2, 0, 4.6, 4.2, -Math.PI / 2, 6, 0.22);
    [[96, -4.5], [104, 2], [100, 8]].forEach(function (p) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 7), shaftMat(0.16));
      m.position.set(p[0] - 1.2, 3.2, p[1]); m.rotation.set(0, 0.5, 0.35); m.renderOrder = 5; g.add(m); shafts.push(m);
    });
    // Damm som svävar i ljuset
    var N = 260, pos = new Float32Array(N * 3), seed = [];
    for (var i = 0; i < N; i++) {
      var bor = i % 3 === 0;
      pos[i * 3] = bor ? 90 + Math.random() * 21 : -14 + Math.random() * 28;
      pos[i * 3 + 1] = 0.3 + Math.random() * (bor ? 4.5 : 2.4);
      pos[i * 3 + 2] = bor ? -10 + Math.random() * 20 : -9.5 + Math.random() * 19;
      seed.push(Math.random() * 6.28);
    }
    var pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var dust = new THREE.Points(pg, new THREE.PointsMaterial({ map: fx('glow'), color: 0xffe9c4, size: 0.07, transparent: true, opacity: 0.8, blending: add, depthWrite: false, sizeAttenuation: true, fog: false }));
    dust.frustumCulled = false; dust.renderOrder = 6; g.add(dust);
    // Skärmarna glöder svagt och lamporna får en varm gloria
    var glows = [];
    Object.keys(w.builder.anchors.desks || {}).forEach(function (id) {
      var d = w.builder.anchors.desks[id];
      var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: fx('glow'), color: 0x7fb8ff, transparent: true, opacity: 0.35, blending: add, depthWrite: false, fog: false }));
      s.position.set(d.x, 1.05, d.z - 0.2); s.scale.set(0.9, 0.9, 1); g.add(s); glows.push(s);
    });
    [[6.3, 1.4, -6.25, 0xffd9a0], [14.45, 1.7, -9.45, 0xffd9a0], [-2.8, 1.3, -9.4, 0xffb070]].forEach(function (l) {
      var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: fx('glow'), color: l[3], transparent: true, opacity: 0.55, blending: add, depthWrite: false, fog: false }));
      s.position.set(l[0], l[1], l[2]); s.scale.set(1.4, 1.4, 1); g.add(s); glows.push(s);
    });
    g.traverse(function (o) { o.userData.hdNoCut = true; });
    w.scene.add(g);
    return { g: g, shafts: shafts, dust: dust, seed: seed, glows: glows };
  }

  // ------------------------------------------------------------------ Läget av och på
  W.setHD2D = function (on) {
    on = !!on;
    if (!this.hdInit && on) this.initHD2D();
    if (!this.hdInit) { this.hd2d = false; return; }   // av innan läget har byggts: inget att stänga
    if (this.hd2d === on) return;
    this.hd2d = on;
    var self = this;
    if (on) { this.unlock(); this.hdYaw = this.hdYawT = 0; this.hdDist = this.hdDist || 16; }
    HDU.uHdCut.value = on ? 1 : 0;
    this.hdMood.g.visible = on;
    this.hdMe.g.visible = on;
    Object.keys(this.people).forEach(function (n) {
      var f = self.people[n], sp = f.hdSpr;
      if (!sp) return;
      sp.g.visible = on;
      if (f.k && f.k.holder) f.k.holder.visible = !on;
      f.J.hips.visible = !on && !f.k;
    });
    this.raycaster.far = on ? 60 : 3.8;
    this.camera.fov = on ? FOV : NV.settings.get('fov');
    this.camera.near = on ? 0.5 : 0.05;
    this.camera.updateProjectionMatrix();
    if (this.post) this.post.u.uTilt.value = on && NV.settings.get('tiltShift') !== false ? 1 : 0;
    this.hl.visible = false;
    if (!on) { this.hdPath = null; this.hdTarget = null; this.center.set(0, 0); this.yaw = this.tYaw = this.hdYaw || 0; this.pitch = this.tPitch = -0.05; }
    if (this.renderer) this.renderer.shadowMap.needsUpdate = true;
    document.body.classList.toggle('mode-hd2d', on);
  };
  W.initHD2D = function () {
    this.hdInit = true;
    var self = this;
    var LOOKS = NV.looks2d || {};
    Object.keys(this.people).forEach(function (n) {
      var f = self.people[n], d = f.def;
      var look = { skin: d.skin, hair: d.hair, shirt: d.shirt, pants: d.pants, long: d.long };
      Object.keys(LOOKS[n] || {}).forEach(function (k) { look[k] = LOOKS[n][k]; });
      if (d.beard) look.beard = true;
      if (d.vest) look.vest = true;
      f.hdLook = look;
      f.hdSpr = makeSprite(self.scene);
      f.hdSpr.g.visible = false;
    });
    this.hdMe = makeSprite(this.scene); this.hdMe.g.visible = false;
    this.hdMood = buildMood(this);
    this.hdMouse = new THREE.Vector2(0, 0);
    patchScene(this);
    this.hdPatchT = 0;
    // Mus: hovra, klicka för att gå eller använda, hjul zoomar
    var c = this.canvas;
    c.addEventListener('mousemove', function (e) { self.hdMouse.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1); self.hdMouseIn = true; });
    c.addEventListener('mousedown', function (e) { if (self.hd2d && e.button === 0) self.hdDown = { x: e.clientX, y: e.clientY }; });
    c.addEventListener('click', function (e) {
      if (!self.hd2d || !self.active || (self.game.ui && self.game.ui.captures())) return;
      if (self.hdDown && Math.hypot(e.clientX - self.hdDown.x, e.clientY - self.hdDown.y) > 8) return;
      self.hdClick(e.clientX, e.clientY, e.shiftKey);
    });
    // 170: zoomen sköts mjukt i hd2d_more.js (de gamla lyssnarna hoppade och krockade med den)
    c.addEventListener('wheel', function (e) { if (self.hd2d) e.preventDefault(); }, { passive: false });
    document.addEventListener('keydown', function (e) {
      if (!self.hd2d || !self.active || (self.game.ui && self.game.ui.captures())) return;
      if (e.code === 'KeyQ') self.hdYawT += Math.PI / 4;
      if (e.code === 'KeyZ') self.hdYawT -= Math.PI / 4;
    });
  };

  // Klick: på något du kan använda (gå dit först om det är långt bort) eller på golvet (gå dit)
  W.hdClick = function (cx, cy, run) {
    var v = new THREE.Vector2(cx / window.innerWidth * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(v, this.camera);
    var hits = this.raycaster.intersectObjects(this.interactables, false);
    for (var i = 0; i < hits.length; i++) {
      var o = hits[i].object, vis = o.visible, p = o.parent;
      while (p && vis) { vis = p.visible; p = p.parent; }
      if (!vis || !o.userData.interact) continue;
      var wp = new THREE.Vector3(); (o.userData.interact.type === 'npc' && o.parent ? o.parent : o).getWorldPosition(wp);
      this.hdGoUse(o.userData.interact, wp.x, wp.z, run);
      return;
    }
    // Golvet
    var ray = this.raycaster.ray, t = ray.direction.y < -1e-4 ? -ray.origin.y / ray.direction.y : -1;
    if (t <= 0) return;
    var gx = ray.origin.x + ray.direction.x * t, gz = ray.origin.z + ray.direction.z * t;
    this.hdWalk(gx, gz, null, run);
    this.hdMark(gx, gz);
  };
  W.hdGoUse = function (inter, x, z, run) {
    if (Math.hypot(x - this.pos.x, z - this.pos.z) < 2.0) { this.hdFace(x, z); this.game.onInteract(inter); return; }
    this.hdWalk(x, z, { inter: inter, x: x, z: z }, run);
  };
  W.hdWalk = function (x, z, then, run) {
    if (!this.findPath) return;
    var p = then ? this.findPath(this.pos.x, this.pos.z, x, z, { reach: 1.5 }) : null;
    if (!p || p.partial) p = this.findPath(this.pos.x, this.pos.z, x, z);
    if (!p || !p.pts.length) { this.hdPath = null; if (this.game.ui) this.game.ui.toast('Dit kommer du inte.'); return; }
    this.hdPath = p.pts; this.hdTarget = then; this.hdRun = !!run || p.len > 12;
  };
  W.hdFace = function (x, z) { this.hdDir = screenDir(x - this.pos.x, z - this.pos.z, this.hdYaw); };
  // Liten ring på golvet där du klickade
  W.hdMark = function (x, z) {
    if (!this.hdRing) {
      this.hdRing = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.26, 24), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, depthWrite: false }));
      this.hdRing.rotation.x = -Math.PI / 2; this.hdRing.userData.hdNoCut = true; this.hdRing.userData.dynamic = true;
      this.scene.add(this.hdRing);
    }
    this.hdRing.position.set(x, 0.03, z); this.hdRing.visible = true; this.hdRingT = 0.8;
  };

  // ------------------------------------------------------------------ Rörelse och kamera
  var ORIG_MOVE = W.move;
  W.move = function (dt) {
    if (!this.hd2d) return ORIG_MOVE.apply(this, arguments);
    var k = this.keys, ui = this.game.ui, free = !(ui && ui.captures());
    var joy = NV.touch ? NV.touch.joy : { x: 0, y: 0 };
    var ix = free ? (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0) + joy.x : 0;
    var iz = free ? (k.KeyS || k.ArrowDown ? 1 : 0) - (k.KeyW || k.ArrowUp ? 1 : 0) + joy.y : 0;
    this.hdYaw += (this.hdYawT - this.hdYaw) * (1 - Math.exp(-dt * 6));
    var cy = this.hdYaw, ux = -Math.sin(cy), uz = -Math.cos(cy), rx = Math.cos(cy), rz = -Math.sin(cy);
    var dir = new THREE.Vector3(), run = free && (k.ShiftLeft || k.ShiftRight || this.game.touchRun);
    if (ix || iz) { this.hdPath = null; this.hdTarget = null; dir.set(rx * ix - ux * iz, 0, rz * ix - uz * iz); }
    else if (this.hdPath && this.hdPath.length) {
      var nx = this.hdPath[0];
      var dx = nx.x - this.pos.x, dz = nx.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.12) this.hdPath.shift(); else dir.set(dx / d, 0, dz / d);
      run = run || this.hdRun;
      if (!this.hdPath.length) {
        this.hdPath = null;
        var t = this.hdTarget; this.hdTarget = null;
        if (t) { this.hdFace(t.x, t.z); if (Math.hypot(t.x - this.pos.x, t.z - this.pos.z) < 2.6) this.game.onInteract(t.inter); }
      }
    }
    var speed = run ? 5.2 : 3.0;
    if (this.game.boosted && this.game.boosted()) speed *= 1.3;
    if (dir.lengthSq() > 0) dir.normalize().multiplyScalar(speed);
    this.vel.lerp(dir, 1 - Math.exp(-dt * (dir.lengthSq() > 0 ? 12 : 14)));
    var ox = this.pos.x, oz = this.pos.z, r = 0.24;
    var nx2 = this.pos.x + this.vel.x * dt;
    if (!this.collides(nx2, this.pos.z, r)) this.pos.x = nx2; else this.vel.x = 0;
    var nz2 = this.pos.z + this.vel.z * dt;
    if (!this.collides(this.pos.x, nz2, r)) this.pos.z = nz2; else this.vel.z = 0;
    var moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
    if (this.game.addDistance) this.game.addDistance(moved);
    // Fastnar figuren på en väg letas en ny upp
    if (this.hdPath && moved < dt * 0.3) { this.hdStuck = (this.hdStuck || 0) + dt; if (this.hdStuck > 0.6) { this.hdStuck = 0; var last = this.hdPath[this.hdPath.length - 1]; this.hdWalk(last.x, last.z, this.hdTarget, this.hdRun); } } else this.hdStuck = 0;
    // Steg, riktning och gånganimation
    var sp = this.vel.length();
    if (sp > 0.3) this.hdDir = screenDir(this.vel.x, this.vel.z, cy);
    this.hdStep = (this.hdStep || 0) + moved;
    if (this.hdStep > (run ? 0.95 : 0.7)) { this.hdStep = 0; NV.sfx.step({ Serverrummet: 'metal', Fikarummet: 'wood', Receptionen: 'wood', Lagerkontoret: 'wood', 'Lagret i Borås': 'concrete' }[this.zoneName] || 'carpet'); }
    this.hdWalkPh = (this.hdWalkPh || 0) + moved / 0.32;
    this.hdMoving = sp > 0.3;
    // Kameran: snett ovanifrån, följer mjukt efter
    this.hdFocus = this.hdFocus || new THREE.Vector3(this.pos.x, 0.9, this.pos.z);
    var fk = 1 - Math.exp(-dt * 5), goal = this.hdFocusGoal || this.pos;   // hdFocusGoal: t.ex. mitt emellan dig och den du pratar med
    this.hdFocus.x += (goal.x - this.hdFocus.x) * fk; this.hdFocus.z += (goal.z - this.hdFocus.z) * fk; this.hdFocus.y = 0.9;
    var D = this.hdDist || 16;
    this.shakeA = Math.max(0, (this.shakeA || 0) - dt * 1.5);
    var sh = this.shakeA * this.shakeA * 0.15;
    var PT = this.hdPitchNow || PITCH;
    this.camera.position.set(this.hdFocus.x - ux * D * Math.cos(PT) + (Math.random() - 0.5) * sh, this.hdFocus.y + D * Math.sin(PT), this.hdFocus.z - uz * D * Math.cos(PT));
    this.camera.lookAt(this.hdFocus);
    this.yaw = this.tYaw = cy; this.pitch = this.tPitch = -PT; this.eye = 1.65; this.crouch = false; this.zoomed = false;
    HDU.uHdPlayer.value.set(this.pos.x, 1.0, this.pos.z);
    HDU.uHdFwd.value.set(ux, uz);
  };

  // Hovra med musen i stället för att titta mitt i bilden
  var ORIG_PICK = W.pick;
  W.pick = function () {
    if (!this.hd2d) return ORIG_PICK.apply(this, arguments);
    if (!this.hdMouseIn) { this.hl.visible = false; return null; }
    this.center.copy(this.hdMouse);
    return ORIG_PICK.apply(this, arguments);
  };
  // E: använd det du hovrar över om det är nära, annars det närmaste du står vid
  var ORIG_USE = W.use;
  W.use = function () {
    if (!this.hd2d) return ORIG_USE.apply(this, arguments);
    var best = null, bd = 2.0, p = new THREE.Vector3(), self = this;
    this.interactables.forEach(function (o) {
      if (!o.userData.interact || !o.visible) return;
      var t = o.userData.interact.type === 'npc' && o.parent ? o.parent : o;
      if (!t.visible) return;
      t.getWorldPosition(p);
      var d = Math.hypot(p.x - self.pos.x, p.z - self.pos.z);
      if (d < bd) { bd = d; best = { inter: o.userData.interact, x: p.x, z: p.z }; }
    });
    if (best) { this.hdFace(best.x, best.z); this.game.onInteract(best.inter); }
  };
  var ORIG_LOCK = W.lock;
  W.lock = function () { if (this.hd2d) return; return ORIG_LOCK.apply(this, arguments); };
  var ORIG_TAP = W.tapAt;
  W.tapAt = function (x, y) { if (this.hd2d) return this.hdClick(x, y); return ORIG_TAP.apply(this, arguments); };
  var ORIG_FRONT = W.front;
  W.front = function (d, up) {
    if (!this.hd2d) return ORIG_FRONT.apply(this, arguments);
    return new THREE.Vector3(this.pos.x, 2.2 + (up || 0), this.pos.z);
  };

  // ------------------------------------------------------------------ Varje bildruta
  var ORIG_UPDATE = W.update;
  W.update = function (dt) {
    var r = ORIG_UPDATE.apply(this, arguments);
    if (!this.hd2d) return r;
    var self = this, cy = this.hdYaw, t = this.t;
    // Nya material (t.ex. modeller som laddats klart) får också genomskärningen
    // 165: bara när scenen har fått nya objekt
    this.hdPatchT += dt;
    if (this.hdPatchT > 2) { this.hdPatchT = 0; var cnt = 0; this.scene.traverse(function () { cnt++; }); if (cnt !== this.hdObjCount) { this.hdObjCount = cnt; patchScene(this); } }
    // Du själv
    var me = this.hdMe, walkF = this.hdMoving ? Math.floor(this.hdWalkPh) % 4 : (Math.sin(t * 2.2) > 0.6 ? 4 : 0);
    me.g.position.set(this.pos.x, 0, this.pos.z);
    setFrame(me, PLAYER_LOOK, 'me', this.hdDir || 0, walkF, false, dt);
    // Kollegorna: riktning i bilden efter hur de är vända, sittande eller gående
    Object.keys(this.people).forEach(function (n) {
      var f = self.people[n], sp = f.hdSpr;
      if (!sp) return;
      sp.g.visible = f.group.visible;
      // Modeller som laddas klart medan HD-2D är på ska inte synas
      if (f.k && f.k.holder) f.k.holder.visible = false;
      f.J.hips.visible = false;
      if (!f.group.visible) return;
      var gp = f.group.position, ry = f.group.rotation.y;
      var fx = -Math.sin(ry), fz = -Math.cos(ry);
      // Står de still vänder de sig mot dig när du är nära
      var dx = self.pos.x - gp.x, dz = self.pos.z - gp.z, dist = Math.hypot(dx, dz);
      if (!f.sitting && dist < 3.5 && !(f.speed > 0.05)) { fx = dx; fz = dz; }
      var dir = f.sitting ? (dist < 2.2 ? screenDir(dx, dz, cy) : screenDir(fx, fz, cy)) : screenDir(fx, fz, cy);
      var frame = f.speed > 0.05 ? Math.floor((f.walkPh || 0) * 1.3) % 4 : (Math.sin(t * 2 + (f.phase || 0)) > 0.5 ? 4 : 0);
      var hop = f.gest > 0 && (f.gestKind === 'cheer' || f.gestKind === 'wave') ? Math.abs(Math.sin(t * 10)) * 0.12 : 0;
      sp.g.position.set(gp.x, 0, gp.z);
      sp.s.position.y = (f.sitting ? 0.42 : 0) + hop;
      sp.sh.position.y = 0.012;
      setFrame(sp, f.hdLook, n, dir, frame, f.sitting, dt);
    });
    // Klickringen tonar bort
    if (this.hdRing && this.hdRing.visible) { this.hdRingT -= dt; this.hdRing.material.opacity = Math.max(0, this.hdRingT); this.hdRing.scale.setScalar(1 + (0.8 - this.hdRingT) * 0.6); if (this.hdRingT <= 0) this.hdRing.visible = false; }
    // Ljusstrålarna andas, dammet svävar
    var M = this.hdMood;
    M.shafts.forEach(function (s, i) { s.material.opacity = s.material.userData.base === undefined ? (s.material.userData.base = s.material.opacity) : s.material.opacity; s.material.opacity = s.material.userData.base * (0.85 + 0.15 * Math.sin(t * 0.7 + i)); });
    var pa = M.dust.geometry.attributes.position, arr = pa.array;
    for (var i = 0; i < M.seed.length; i++) {
      var s = M.seed[i];
      arr[i * 3] += Math.sin(t * 0.3 + s) * dt * 0.05;
      arr[i * 3 + 1] += (Math.sin(t * 0.5 + s * 2) * 0.04 + 0.02) * dt;
      if (arr[i * 3 + 1] > (arr[i * 3] > 50 ? 5 : 2.7)) arr[i * 3 + 1] = 0.3;
    }
    pa.needsUpdate = true;
    M.glows.forEach(function (g, i) { g.material.opacity = (i < 8 ? 0.3 : 0.5) + Math.sin(t * 3 + i) * 0.05; });
    // Fokus för tilt-shift: där figuren syns i bilden
    if (this.post) {
      var v = new THREE.Vector3(this.pos.x, 0.9, this.pos.z).project(this.camera);
      this.post.u.uFocus.value += ((v.y + 1) / 2 - this.post.u.uFocus.value) * 0.2;
      this.post.u.uBand.value = 0.11 + 0.06 * (16 / (this.hdDist || 16));
    }
    return r;
  };

  // HD-2D:s färgton: varmare, mer glöd och vinjett. Värdena sätts bara för den här bildrutan.
  if (NV.Post) {
    var PP = NV.Post.prototype, ORIG_PR = PP.render;
    PP.render = function (scene, camera) {
      var u = this.u, w = NV.game && NV.game.world;
      if (!(w && w.hd2d && w.post === this)) return ORIG_PR.apply(this, arguments);
      var keep = [u.uBloom.value, u.uVignette.value, u.uSat.value, u.uContrast.value, u.uTint.value.clone(), u.uGrain.value, u.uCA.value];
      u.uBloom.value = 0.95; u.uVignette.value = 0.62; u.uSat.value = Math.max(keep[2], 1.12); u.uContrast.value = 1.07;
      u.uTint.value.set(keep[4].x * 1.06, keep[4].y, keep[4].z * 0.9); u.uGrain.value = 0.03; u.uCA.value = 0.018;
      var r = ORIG_PR.apply(this, arguments);
      u.uBloom.value = keep[0]; u.uVignette.value = keep[1]; u.uSat.value = keep[2]; u.uContrast.value = keep[3]; u.uTint.value.copy(keep[4]); u.uGrain.value = keep[5]; u.uCA.value = keep[6];
      return r;
    };
  }
  var ORIG_RESIZE = W.resize;
  W.resize = function () { ORIG_RESIZE.apply(this, arguments); if (this.hd2d) { this.camera.fov = FOV; this.camera.updateProjectionMatrix(); } };
  var ORIG_APPLY = W.applySettings;
  W.applySettings = function () {
    ORIG_APPLY.apply(this, arguments);
    if (this.hd2d) { this.camera.fov = FOV; this.camera.updateProjectionMatrix(); if (this.post) this.post.u.uTilt.value = NV.settings.get('tiltShift') !== false ? 1 : 0; }
  };
  var ORIG_TELE = W.teleport;
  W.teleport = function () {
    var r = ORIG_TELE.apply(this, arguments);
    if (this.hd2d) { this.hdPath = null; this.hdTarget = null; this.hdFocus = null; this.yaw = this.tYaw = this.hdYaw; }
    return r;
  };

  // Det som tilläggen (hd2d_more.js) behöver
  NV.hd2d = { HDU: HDU, fx: fx, makeSprite: makeSprite, screenDir: screenDir, setFrame: setFrame, spriteTex: spriteTex, PLAYER_LOOK: PLAYER_LOOK, PX: PX, PITCH: PITCH, FOV: FOV, patchScene: patchScene };

  // ------------------------------------------------------------------ Spelet: tre visningslägen
  // HD-2D använder 3D-världen, så spelets läge är '3d' och inställningen view3d säger hur den visas.
  NV.afterGame(function () {
    var g = NV.game;
    if (!g) return;
    g.freeMouse = function () { return this.mode === '2d' || !!(this.world && this.world.hd2d); };
    g.viewName = function () { return this.mode === '2d' ? '2d' : (this.world && this.world.hd2d ? 'hd2d' : '3d'); };
    var origSet = g.setMode;
    g.setMode = function (mode, first) {
      if (mode === 'hd2d') { NV.settings.set('view3d', 'hd2d'); mode = '3d'; }
      else if (mode === '3d' && !first) NV.settings.set('view3d', 'fps');
      var r = origSet.call(this, mode, first);
      var w = this.worlds && this.worlds['3d'];
      if (w && w.setHD2D) w.setHD2D(this.mode === '3d' && NV.settings.get('view3d') === 'hd2d');
      if (this.mode !== '3d') document.body.classList.remove('mode-hd2d');
      if (this.ui && this.ui.renderHud) this.ui.renderHud();
      return r;
    };
    // Startar spelet i 3D med HD-2D valt slås det på direkt
    if (g.mode === '3d' && g.world && g.world.setHD2D && NV.settings.get('view3d') === 'hd2d') { g.world.setHD2D(true); if (g.ui && g.ui.renderHud) g.ui.renderHud(); }
  });
})();
