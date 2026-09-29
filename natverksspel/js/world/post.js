// Efterbehandling för 3D: HDR-bild → glöd (bloom), filmisk tonmappning, färgton per rum,
// vinjett, lite kromatisk aberration och filmkorn. Allt i egna shaders utan tillägg.
NV.Post = (function () {
  var VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

  // Ljusa delar av bilden (mjuk tröskel)
  var BRIGHT = [
    'uniform sampler2D tSrc; uniform float uThreshold; varying vec2 vUv;',
    'void main(){',
    '  vec3 c = texture2D(tSrc, vUv).rgb;',
    '  float l = max(c.r, max(c.g, c.b));',
    '  float knee = uThreshold * 0.5;',
    '  float s = clamp(l - uThreshold + knee, 0.0, 2.0 * knee);',
    '  s = s * s / (4.0 * knee + 1e-4);',
    '  float w = max(s, l - uThreshold) / max(l, 1e-4);',
    '  gl_FragColor = vec4(min(c * w, vec3(24.0)), 1.0);',
    '}'].join('\n');
  // Separerbar gaussisk oskärpa, 9 tappar
  var BLUR = [
    'uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;',
    'void main(){',
    '  vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270;',
    '  c += texture2D(tSrc, vUv + uDir * 1.3846154).rgb * 0.3162162;',
    '  c += texture2D(tSrc, vUv - uDir * 1.3846154).rgb * 0.3162162;',
    '  c += texture2D(tSrc, vUv + uDir * 3.2307692).rgb * 0.0702703;',
    '  c += texture2D(tSrc, vUv - uDir * 3.2307692).rgb * 0.0702703;',
    '  gl_FragColor = vec4(c, 1.0);',
    '}'].join('\n');
  var COPY = 'uniform sampler2D tSrc; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tSrc, vUv).rgb, 1.0); }';
  var FINAL = [
    'uniform sampler2D tScene; uniform sampler2D tB0; uniform sampler2D tB1; uniform sampler2D tB2; uniform sampler2D tB3;',
    'uniform float uBloom; uniform float uExposure; uniform vec3 uTint; uniform float uSat; uniform float uContrast;',
    'uniform float uVignette; uniform float uGrain; uniform float uCA; uniform float uTime; uniform float uAlarm; uniform vec3 uFlash; uniform float uFlashA;',
    'uniform float uGoggles; uniform vec2 uRes;',
    'varying vec2 vUv;',
    'vec3 ppRRT(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }',
    'vec3 ppAces(vec3 color){',
    '  const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));',
    '  const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));',
    '  color *= uExposure / 0.6; color = I * color; color = ppRRT(color); color = O * color; return clamp(color, 0.0, 1.0);',
    '}',
    'vec3 ppSRGB(vec3 c){ return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }',
    'float ppHash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
    'void main(){',
    '  vec2 d = vUv - 0.5;',
    '  float r2 = dot(d, d);',
    '  vec2 off = d * r2 * uCA;',
    '  vec3 col;',
    '  col.r = texture2D(tScene, vUv - off).r;',
    '  col.g = texture2D(tScene, vUv).g;',
    '  col.b = texture2D(tScene, vUv + off).b;',
    '  vec3 bl = texture2D(tB0, vUv).rgb * 0.45 + texture2D(tB1, vUv).rgb * 0.3 + texture2D(tB2, vUv).rgb * 0.18 + texture2D(tB3, vUv).rgb * 0.12;',
    '  col += bl * uBloom;',
    '  col *= uTint;',
    '  col = ppAces(col);',
    '  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));',
    '  col = mix(vec3(l), col, uSat);',
    '  col = (col - 0.5) * uContrast + 0.5;',
    '  col = clamp(col, 0.0, 1.0);',
    '  if (uGoggles > 0.0) {',
    '    float scan = 0.94 + 0.06 * sin(vUv.y * uRes.y * 1.6 + uTime * 6.0);',
    '    col = mix(col, vec3(l * 0.35, l * 0.9 + 0.05, l * 0.75) * scan, uGoggles * 0.55);',
    '  }',
    '  float v = smoothstep(0.85, 0.2, sqrt(r2) * (1.0 + uVignette));',
    '  col *= mix(1.0, v, uVignette);',
    '  float edge = smoothstep(0.18, 0.5, sqrt(r2));',
    '  col = mix(col, vec3(0.9, 0.08, 0.05), edge * uAlarm * 0.55);',
    '  col = mix(col, uFlash, uFlashA);',
    '  col = ppSRGB(col);',
    '  col += (ppHash(vUv * uRes + fract(uTime) * 100.0) - 0.5) * uGrain;',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'].join('\n');

  function Post(renderer, opts) {
    opts = opts || {};
    this.renderer = renderer;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene = new THREE.Scene();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    var HF = THREE.HalfFloatType;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: HF, samples: opts.samples || 0 });
    this.levels = [];
    for (var i = 0; i < 4; i++) this.levels.push({ a: new THREE.WebGLRenderTarget(4, 4, { type: HF }), b: new THREE.WebGLRenderTarget(4, 4, { type: HF }) });
    function mat(frag, u) { return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms: u, depthTest: false, depthWrite: false }); }
    this.mBright = mat(BRIGHT, { tSrc: { value: null }, uThreshold: { value: 1.25 } });
    this.mBlur = mat(BLUR, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.mCopy = mat(COPY, { tSrc: { value: null } });
    this.mFinal = mat(FINAL, {
      tScene: { value: null }, tB0: { value: null }, tB1: { value: null }, tB2: { value: null }, tB3: { value: null },
      uBloom: { value: 0.6 }, uExposure: { value: 1.05 }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uSat: { value: 1.05 }, uContrast: { value: 1.03 },
      uVignette: { value: 0.35 }, uGrain: { value: 0.025 }, uCA: { value: 0.012 }, uTime: { value: 0 }, uAlarm: { value: 0 },
      uFlash: { value: new THREE.Color(1, 0.9, 0.5) }, uFlashA: { value: 0 }, uGoggles: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
    });
    this.u = this.mFinal.uniforms;
  }
  var P = Post.prototype;

  P.setSize = function (w, h) {
    w = Math.max(4, Math.floor(w)); h = Math.max(4, Math.floor(h));
    this.rt.setSize(w, h);
    var lw = w, lh = h;
    this.levels.forEach(function (L) { lw = Math.max(2, Math.floor(lw / 2)); lh = Math.max(2, Math.floor(lh / 2)); L.a.setSize(lw, lh); L.b.setSize(lw, lh); L.w = lw; L.h = lh; });
    this.u.uRes.value.set(w, h);
  };
  P.pass = function (m, target) {
    this.quad.material = m;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.cam);
  };
  P.render = function (scene, camera) {
    var r = this.renderer;
    r.setRenderTarget(this.rt);
    r.render(scene, camera);
    // Glöd: ljusa delar, sedan allt suddigare för varje nivå
    var src = this.rt.texture, self = this;
    this.levels.forEach(function (L, i) {
      if (i === 0) { self.mBright.uniforms.tSrc.value = src; self.pass(self.mBright, L.a); }
      else { self.mCopy.uniforms.tSrc.value = src; self.pass(self.mCopy, L.a); }
      self.mBlur.uniforms.tSrc.value = L.a.texture; self.mBlur.uniforms.uDir.value.set(1 / L.w, 0); self.pass(self.mBlur, L.b);
      self.mBlur.uniforms.tSrc.value = L.b.texture; self.mBlur.uniforms.uDir.value.set(0, 1 / L.h); self.pass(self.mBlur, L.a);
      src = L.a.texture;
    });
    this.u.tScene.value = this.rt.texture;
    this.u.tB0.value = this.levels[0].a.texture; this.u.tB1.value = this.levels[1].a.texture;
    this.u.tB2.value = this.levels[2].a.texture; this.u.tB3.value = this.levels[3].a.texture;
    this.pass(this.mFinal, null);
  };

  return Post;
})();
