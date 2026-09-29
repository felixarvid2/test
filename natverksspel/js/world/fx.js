// Partiklar i 3D: gnistor, rök, konfetti, ånga, damm, paket som färdas längs kablar m.m.
// Två punktmoln (additivt ljus och vanlig blandning) som uppdateras på processorn.
NV.fx3d = (function () {
  var VERT = [
    'attribute float aSize; attribute vec4 aColor; attribute float aShape;',
    'uniform float uScale;',
    'varying vec4 vColor; varying float vShape;',
    'void main(){',
    '  vColor = aColor; vShape = aShape;',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  gl_PointSize = aSize * uScale / max(0.05, -mv.z);',
    '  gl_Position = projectionMatrix * mv;',
    '}'].join('\n');
  var FRAG = [
    'varying vec4 vColor; varying float vShape;',
    'void main(){',
    '  vec2 p = gl_PointCoord - 0.5;',
    '  float a;',
    '  if (vShape > 0.5) { a = step(abs(p.x), 0.32) * step(abs(p.y), 0.2); }',
    '  else { float d = length(p); a = smoothstep(0.5, 0.0, d); a *= a; }',
    '  if (a < 0.01) discard;',
    '  gl_FragColor = vec4(vColor.rgb, vColor.a * a);',
    '}'].join('\n');

  function Cloud(scene, max, additive) {
    this.max = max;
    this.list = [];
    var g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.shape = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aShape', new THREE.BufferAttribute(this.shape, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.uniforms = { uScale: { value: 400 } };
    var m = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 5 : 4;
    this.geo = g;
    scene.add(this.points);
  }
  Cloud.prototype.add = function (p) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push(p);
  };
  Cloud.prototype.update = function (dt) {
    var out = [], i = 0, pos = this.pos, col = this.col, size = this.size, shape = this.shape;
    for (var k = 0; k < this.list.length; k++) {
      var p = this.list[k];
      p.age += dt;
      if (p.age >= p.life) { if (p.onEnd) p.onEnd(p); continue; }
      var f = p.age / p.life;
      if (p.path) {
        var u = Math.min(1, p.age / p.life);
        p.path.getPoint(u, TMP);
        p.x = TMP.x; p.y = TMP.y; p.z = TMP.z;
      } else {
        p.vy -= (p.g || 0) * dt;
        var dr = Math.pow(1 - Math.min(0.99, p.drag || 0), dt * 60);
        p.vx *= dr; p.vy *= dr; p.vz *= dr;
        if (p.flutter) { p.vx += Math.sin(p.age * 9 + p.seed) * p.flutter * dt; p.vz += Math.cos(p.age * 7 + p.seed) * p.flutter * dt; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.floor !== undefined && p.y < p.floor) { p.y = p.floor; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      }
      var a = p.a * (p.fadeIn ? Math.min(1, f / p.fadeIn) : 1) * (1 - Math.pow(f, p.fadePow || 2));
      if (p.twinkle) a *= 0.5 + 0.5 * Math.sin(p.age * p.twinkle + p.seed);
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      col[i * 4] = p.r; col[i * 4 + 1] = p.gg; col[i * 4 + 2] = p.b; col[i * 4 + 3] = Math.max(0, a);
      size[i] = p.s * (1 + (p.grow || 0) * f);
      shape[i] = p.square ? 1 : 0;
      out.push(p); i++;
    }
    this.list = out;
    this.geo.setDrawRange(0, i);
    ['position', 'aColor', 'aSize', 'aShape'].forEach(function (n) { this.geo.attributes[n].needsUpdate = true; }, this);
  };
  var TMP = new THREE.Vector3();

  function hexRGB(hex, k) {
    var c = new THREE.Color(hex);
    k = k || 1;
    return [c.r * k, c.g * k, c.b * k];
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  function FX(world) {
    this.world = world;
    this.add = new Cloud(world.scene, 2600, true);
    this.norm = new Cloud(world.scene, 1600, false);
    this.popups = [];
    this.emitters = [];
    this.enabled = true;
  }
  var F = FX.prototype;

  F.p = function (cloud, o) {
    if (!this.enabled && !o.force) return null;
    var c = hexRGB(o.color || 0xffffff, o.hdr || 1);
    var p = {
      x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, g: o.g || 0, drag: o.drag || 0,
      age: 0, life: o.life || 1, s: o.size || 0.03, grow: o.grow || 0, a: o.a === undefined ? 1 : o.a,
      r: c[0], gg: c[1], b: c[2], square: !!o.square, flutter: o.flutter || 0, seed: Math.random() * 10,
      fadeIn: o.fadeIn || 0, fadePow: o.fadePow, twinkle: o.twinkle || 0, path: o.path || null, onEnd: o.onEnd || null, floor: o.floor,
    };
    cloud.add(p);
    return p;
  };

  // --------------------------------------------------------------- Färdiga effekter
  F.sparks = function (v, n, color) {
    for (var i = 0; i < (n || 26); i++) {
      var a = Math.random() * Math.PI * 2, s = rnd(0.6, 2.4);
      this.p(this.add, { x: v.x, y: v.y, z: v.z, vx: Math.cos(a) * s * 0.6, vy: rnd(0.3, 2.2), vz: Math.sin(a) * s * 0.6 + 0.6, g: 6, drag: 0.02, life: rnd(0.35, 0.8), size: rnd(0.012, 0.022), color: color || 0xffb347, hdr: 4, floor: 0.01 });
    }
  };
  F.ring = function (v, color, radius) {
    for (var i = 0; i < 28; i++) {
      var a = i / 28 * Math.PI * 2;
      this.p(this.add, { x: v.x, y: v.y, z: v.z, vx: Math.cos(a) * (radius || 0.5), vy: Math.sin(a) * (radius || 0.5), vz: 0.05, life: 0.6, size: 0.02, color: color || 0x4fc3f7, hdr: 3 });
    }
  };
  F.poof = function (v, color) {
    for (var i = 0; i < 22; i++) {
      var a = Math.random() * Math.PI * 2, e = rnd(-1, 1);
      this.p(this.add, { x: v.x, y: v.y, z: v.z, vx: Math.cos(a) * 0.9, vy: e * 0.9, vz: Math.sin(a) * 0.9, drag: 0.06, life: rnd(0.4, 0.7), size: 0.05, grow: 1, color: color || 0xff3b30, hdr: 3 });
    }
  };
  F.smoke = function (v, color) {
    this.p(this.norm, { x: v.x + rnd(-0.2, 0.2), y: v.y, z: v.z + rnd(-0.2, 0.2), vx: rnd(-0.05, 0.05), vy: rnd(0.25, 0.5), vz: rnd(-0.05, 0.05), life: rnd(2, 3.2), size: 0.35, grow: 2.2, a: 0.22, fadeIn: 0.2, color: color || 0x5a4a4a });
  };
  F.steam = function (v) {
    this.p(this.norm, { x: v.x + rnd(-0.02, 0.02), y: v.y, z: v.z + rnd(-0.02, 0.02), vx: rnd(-0.02, 0.02), vy: rnd(0.12, 0.2), vz: rnd(-0.02, 0.02), flutter: 0.15, life: rnd(1.4, 2.2), size: 0.05, grow: 2.5, a: 0.18, fadeIn: 0.25, color: 0xffffff });
  };
  F.confetti = function (v, n) {
    var cols = [0xf0b429, 0x3fbf6f, 0x4fc3f7, 0xff5a4f, 0xb77ee0, 0xffffff];
    for (var i = 0; i < (n || 90); i++) {
      var a = Math.random() * Math.PI * 2, s = rnd(0.8, 2.6);
      this.p(this.norm, { x: v.x, y: v.y, z: v.z, vx: Math.cos(a) * s, vy: rnd(1.5, 4), vz: Math.sin(a) * s, g: 3.2, drag: 0.035, flutter: 3, life: rnd(1.8, 3), size: rnd(0.045, 0.07), square: true, color: cols[i % cols.length], fadePow: 6, floor: 0.01 });
    }
  };
  F.firework = function (v, color) {
    var self = this;
    var n = 90, c = color || [0xf0b429, 0x4fc3f7, 0xff5a4f, 0x3fbf6f][Math.floor(Math.random() * 4)];
    for (var i = 0; i < n; i++) {
      var u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u), s = rnd(1.4, 2);
      self.p(self.add, { x: v.x, y: v.y, z: v.z, vx: r * Math.cos(a) * s, vy: u * s, vz: r * Math.sin(a) * s, g: 1.2, drag: 0.03, life: rnd(1, 1.6), size: 0.07, color: c, hdr: 5, twinkle: 25 });
    }
  };
  F.dust = function (v, color) {
    for (var i = 0; i < 3; i++) this.p(this.norm, { x: v.x + rnd(-0.15, 0.15), y: 0.03, z: v.z + rnd(-0.15, 0.15), vx: rnd(-0.2, 0.2), vy: rnd(0.1, 0.3), vz: rnd(-0.2, 0.2), drag: 0.05, life: rnd(0.6, 1.1), size: 0.08, grow: 2, a: 0.2, color: color || 0x9a948a });
  };
  F.sparkle = function (v) {
    this.p(this.add, { x: v.x + rnd(-0.25, 0.25), y: v.y + rnd(-0.15, 0.25), z: v.z + rnd(-0.25, 0.25), vy: 0.15, life: rnd(0.5, 0.9), size: 0.018, color: 0xffe08a, hdr: 3, twinkle: 30 });
  };
  F.mote = function (box) {
    this.p(this.add, { x: rnd(box.x1, box.x2), y: rnd(box.y1, box.y2), z: rnd(box.z1, box.z2), vx: rnd(-0.02, 0.02), vy: rnd(-0.015, 0.02), vz: rnd(-0.02, 0.02), flutter: 0.02, life: rnd(5, 9), size: rnd(0.006, 0.012), a: 0.55, fadeIn: 0.25, color: 0xfff2d0, hdr: 1.6 });
  };
  F.cold = function (v) {
    this.p(this.add, { x: v.x + rnd(-0.25, 0.25), y: v.y, z: v.z + rnd(-0.25, 0.25), vx: rnd(-0.04, 0.04), vy: rnd(0.15, 0.35), vz: rnd(-0.04, 0.04), drag: 0.01, life: rnd(1.5, 2.5), size: 0.1, grow: 1.5, a: 0.07, fadeIn: 0.3, color: 0x9fd8ff });
  };
  // Paket som färdas längs en kurva
  F.packet = function (curve, opts) {
    opts = opts || {};
    return this.p(this.add, { x: 0, y: 0, z: 0, path: curve, life: opts.life || 1, size: opts.size || 0.028, color: opts.color || 0x7ee0ff, hdr: opts.hdr || 5, fadePow: 12, onEnd: opts.onEnd, force: opts.force });
  };

  // Flytande text ("+50 XP", "😊") som stiger och tonar bort
  F.popup = function (text, v, opts) {
    opts = opts || {};
    var s = NV.tex.label(text, { height: opts.height || 0.14, bg: opts.bg || 'rgba(20,24,32,0.0)', color: opts.color || '#ffd54a', size: opts.size || 56, weight: '800', depthTest: false });
    s.material.color.setScalar(opts.hdr || 1.6);
    s.renderOrder = 20;
    s.position.set(v.x, v.y, v.z);
    this.world.scene.add(s);
    this.popups.push({ s: s, age: 0, life: opts.life || 1.6, vy: opts.vy || 0.35 });
  };

  // Utsläpp som pågår (ånga från koppar, kall luft, damm i solstrålar)
  F.emitter = function (fn, rate, where, range) {
    var e = { fn: fn, rate: rate, acc: Math.random(), where: where, range: range || 14, on: true };
    this.emitters.push(e);
    return e;
  };

  F.update = function (dt, cam) {
    var self = this;
    var h = this.world.renderer.domElement.height;
    var scale = h / (2 * Math.tan(cam.fov * Math.PI / 360));
    this.add.uniforms.uScale.value = scale;
    this.norm.uniforms.uScale.value = scale;
    if (this.enabled) {
      this.emitters.forEach(function (e) {
        if (!e.on) return;
        var w = typeof e.where === 'function' ? e.where() : e.where;
        if (!w) return;
        if (Math.abs(w.x - cam.position.x) + Math.abs(w.z - cam.position.z) > e.range) return;
        e.acc += dt * e.rate * (self.scale === undefined ? 1 : self.scale);
        while (e.acc >= 1) { e.acc -= 1; e.fn.call(self, w); }
      });
    }
    this.add.update(dt);
    this.norm.update(dt);
    this.popups = this.popups.filter(function (p) {
      p.age += dt;
      p.s.position.y += p.vy * dt;
      p.s.material.opacity = Math.max(0, 1 - Math.pow(p.age / p.life, 3));
      if (p.age >= p.life) { self.world.scene.remove(p.s); p.s.material.map.dispose(); p.s.material.dispose(); return false; }
      return true;
    });
  };
  F.count = function () { return this.add.list.length + this.norm.list.length; };

  return { FX: FX };
})();
