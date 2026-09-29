// Grafiknivåer och prestanda: automatiskt val av nivå, profiler per nivå,
// sammanslagning av statisk geometri och billigare material på äldre datorer.
NV.gfx = (function () {
  var LEVELS = ['minimal', 'low', 'medium', 'high', 'ultra'];
  var NAMES = { minimal: 'Minimal (mycket gamla datorer)', low: 'Låg (inga skuggor)', medium: 'Medel', high: 'Hög', ultra: 'Ultra' };

  function isTouch() {
    try { return ('ontouchstart' in window) || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0; } catch (e) { return false; }
  }
  function isMobile() {
    var ua = navigator.userAgent || '';
    return /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(ua) || (isTouch() && Math.min(screen.width, screen.height) < 820);
  }
  function gpuName() {
    try {
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) return '';
      var ext = gl.getExtension('WEBGL_debug_renderer_info');
      var n = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      var lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
      return String(n || '');
    } catch (e) { return ''; }
  }
  // Gissa en lagom nivå utifrån grafikkort, minne och om det är en mobil
  function detect() {
    var g = gpuName(), mem = navigator.deviceMemory || 8, cores = navigator.hardwareConcurrency || 4;
    var why = g || 'okänt grafikkort';
    var lvl = 'high';
    if (/swiftshader|llvmpipe|software|basic render|microsoft basic/i.test(g)) lvl = 'low';
    else if (isMobile()) lvl = mem <= 3 || /Mali-[34T]|Adreno \(TM\) [3-5]\d\d|PowerVR SGX/i.test(g) ? 'minimal' : 'low';
    else if (/Intel.*(GMA|HD Graphics( [2-5]\d{2,3})?$|HD Graphics [2-5]\d{2,3})|Mali|Adreno|PowerVR/i.test(g)) lvl = 'low';
    else if (/Intel|Radeon\(TM\) (R[2-5]|Vega [3-8])|GeForce (GT|MX)/i.test(g) || mem <= 4) lvl = 'medium';
    if (cores <= 2 && lvl !== 'minimal') lvl = 'low';
    return { level: lvl, why: why };
  }

  var PROFILES = {
    minimal: { pr: 0.7, shadows: false, post: false, msaa: 0, env: false, lambert: true, lights: false, particles: 0.3, motes: false, beams: false, fpsCap: 30, ledEvery: 0.45, sway: false, farAnim: 10 },
    low: { pr: 1, shadows: false, post: false, msaa: 0, env: false, lambert: true, lights: false, particles: 0.5, motes: false, beams: true, fpsCap: 0, ledEvery: 0.3, sway: false, farAnim: 12 },
    medium: { pr: 1.25, shadows: true, shadowSize: 1024, shadowSoft: false, shadowEvery: 3, post: true, msaa: 0, env: true, lambert: false, lights: true, particles: 0.8, motes: true, beams: true, fpsCap: 0, ledEvery: 0.2, sway: true, farAnim: 16 },
    high: { pr: 1.75, shadows: true, shadowSize: 2048, shadowSoft: true, shadowEvery: 1, post: true, msaa: 2, env: true, lambert: false, lights: true, particles: 1, motes: true, beams: true, fpsCap: 0, ledEvery: 0.16, sway: true, farAnim: 16 },
    ultra: { pr: 2, shadows: true, shadowSize: 4096, shadowSoft: true, shadowEvery: 1, post: true, msaa: 4, env: true, lambert: false, lights: true, particles: 1, motes: true, beams: true, fpsCap: 0, ledEvery: 0.12, sway: true, farAnim: 20 },
  };

  var api = { LEVELS: LEVELS, NAMES: NAMES, isTouch: isTouch, isMobile: isMobile, detect: detect, quality: 'high', auto: null };
  // Bestäm nivån en gång när spelet startar
  api.resolve = function () {
    var q = NV.settings.get('quality');
    if (!q || q === 'auto' || LEVELS.indexOf(q) < 0) { var d = detect(); api.auto = d; q = d.level; }
    api.quality = q;
    api.p = PROFILES[q];
    return q;
  };
  api.profile = function () { return api.p || PROFILES[api.resolve()]; };
  api.lower = function () { var i = LEVELS.indexOf(api.quality); return i > 0 ? LEVELS[i - 1] : null; };

  // ------------------------------------------------------------------ Billigare material
  function toLambert(m) {
    var o = new THREE.MeshLambertMaterial({
      color: m.color, map: m.map, emissive: m.emissive, emissiveMap: m.emissiveMap, emissiveIntensity: m.emissiveIntensity,
      transparent: m.transparent, opacity: m.opacity, side: m.side, alphaTest: m.alphaTest, depthWrite: m.depthWrite,
    });
    o.depthTest = m.depthTest;
    o.userData = m.userData;
    return o;
  }
  api.cheapMaterials = function (scene, builder) {
    var map = new Map();
    function conv(m) {
      if (!m || !m.isMeshStandardMaterial || (m.userData && m.userData.keep)) return m;
      if (!map.has(m)) map.set(m, toLambert(m));
      return map.get(m);
    }
    scene.traverse(function (o) { if (o.isMesh && !Array.isArray(o.material)) o.material = conv(o.material); });
    if (builder) Object.keys(builder.mats).forEach(function (k) { builder.mats[k] = conv(builder.mats[k]); });
    return map.size;
  };

  // ------------------------------------------------------------------ Sammanslagning av statisk geometri
  // Allt som aldrig rör sig slås ihop per material och per ruta på 10 × 10 m. Det ger
  // mycket färre anrop till grafikkortet utan att synfältsgallringen slutar fungera.
  function sig(m) {
    var t = m.userData && m.userData.tex;
    if (!t || !m.map) return 'm:' + m.uuid;
    return ['t', m.type, t, m.color.getHex(), m.roughness, m.metalness, m.transparent, m.opacity, m.emissive ? m.emissive.getHex() : 0, m.emissiveIntensity, m.side].join(':');
  }
  api.mergeStatic = function (scene, opts) {
    opts = opts || {};
    scene.updateMatrixWorld(true);
    var groups = {}, victims = [];
    function walk(o) {
      if (o.userData && o.userData.dynamic) return;
      if (o.isCamera) return;
      if (opts.keepSway && o.userData && o.userData.sway) return;
      if (o.isMesh && !o.isSkinnedMesh && o.visible && !o.userData.interact && !o.userData.faceOf && !Array.isArray(o.material) && o.material &&
          (o.material.isMeshStandardMaterial || o.material.isMeshLambertMaterial || o.material.isMeshBasicMaterial) && o.geometry && o.geometry.attributes.position && o.matrixWorld.determinant() > 0) {
        var c = new THREE.Vector3(); o.getWorldPosition(c);
        var key = sig(o.material) + '|' + (o.castShadow ? 1 : 0) + (o.receiveShadow ? 1 : 0) + '|' + Math.floor(c.x / 10) + ',' + Math.floor(c.z / 10);
        (groups[key] = groups[key] || []).push(o);
        victims.push(o);
      }
      o.children.slice().forEach(walk);
    }
    walk(scene);
    var made = 0, before = victims.length;
    Object.keys(groups).forEach(function (k) {
      var list = groups[k];
      if (list.length < 2) return;
      var pos = [], nor = [], uv = [];
      var m0 = list[0].material;
      var baked = !!(m0.userData && m0.userData.tex && m0.map);
      list.forEach(function (o) {
        var g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        g.applyMatrix4(o.matrixWorld);
        var P = g.attributes.position.array, N = g.attributes.normal ? g.attributes.normal.array : null, U = g.attributes.uv ? g.attributes.uv.array : null;
        var n = g.attributes.position.count;
        var rep = baked ? o.material.map.repeat : null, off = baked ? o.material.map.offset : null;
        for (var i = 0; i < n; i++) {
          pos.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
          if (N) nor.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]); else nor.push(0, 1, 0);
          if (U) { if (rep) uv.push(U[i * 2] * rep.x + off.x, U[i * 2 + 1] * rep.y + off.y); else uv.push(U[i * 2], U[i * 2 + 1]); } else uv.push(0, 0);
        }
        g.dispose();
      });
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.computeBoundingSphere(); geo.computeBoundingBox();
      var mat = m0;
      if (baked) { mat = m0.clone(); mat.map = m0.map.clone(); mat.map.repeat.set(1, 1); mat.map.offset.set(0, 0); mat.map.needsUpdate = true; }
      var mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = list[0].castShadow; mesh.receiveShadow = list[0].receiveShadow;
      mesh.renderOrder = list[0].renderOrder;
      mesh.matrixAutoUpdate = false;
      mesh.userData.merged = list.length;
      scene.add(mesh);
      list.forEach(function (o) { if (o.parent) o.parent.remove(o); });
      made++;
    });
    // Det som blev kvar och inte rör sig behöver inte räkna om sin matris varje bildruta
    scene.traverse(function (o) { if (o.isMesh && !o.userData.dynamic && o.parent === scene && !o.userData.interact) { o.updateMatrix(); o.matrixAutoUpdate = false; } });
    return { before: before, groups: made };
  };

  return api;
})();
