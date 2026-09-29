// Modellbibliotek för 3D: rundade lådor, detaljnivå och återanvända geometrier.
NV.models = (function () {
  var cache = {};

  // Detaljnivå: 0 = minimal/låg, 1 = medel, 2 = hög/ultra
  function detail() {
    var q = NV.gfx ? NV.gfx.quality : (NV.settings ? NV.settings.get('quality') : 'high');
    return q === 'minimal' || q === 'low' ? 0 : (q === 'medium' ? 1 : 2);
  }
  function seg(hi, lo) { var d = detail(); return d === 2 ? hi : (d === 1 ? Math.max(lo, Math.round(hi * 0.7)) : lo); }

  // Låda med rundade kanter (extruderad rundad rektangel med fas). Mitten i origo.
  function rbox(w, h, d, r, s) {
    r = Math.min(r || 0.01, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
    s = s === undefined ? seg(3, 1) : s;
    var key = ['rb', w, h, d, r, s].join(':');
    if (cache[key]) return cache[key];
    var g;
    if (s <= 0 || r <= 0.0015) g = new THREE.BoxGeometry(w, h, d);
    else {
      var sh = new THREE.Shape(), x = -w / 2 + r, y = -h / 2 + r, ww = w - 2 * r, hh = h - 2 * r;
      sh.moveTo(x, y - r);
      sh.lineTo(x + ww, y - r); sh.quadraticCurveTo(x + ww + r, y - r, x + ww + r, y);
      sh.lineTo(x + ww + r, y + hh); sh.quadraticCurveTo(x + ww + r, y + hh + r, x + ww, y + hh + r);
      sh.lineTo(x, y + hh + r); sh.quadraticCurveTo(x - r, y + hh + r, x - r, y + hh);
      sh.lineTo(x - r, y); sh.quadraticCurveTo(x - r, y - r, x, y - r);
      g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.0005, d - 2 * r), bevelEnabled: true, bevelSize: r * 0.999, bevelThickness: r, bevelSegments: s, curveSegments: s + 1 });
      g.translate(0, 0, -(d - 2 * r) / 2);
      // Skala UV till meter så att texturer ser likadana ut som på vanliga lådor
      var uv = g.attributes.uv;
      for (var i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / Math.max(w, d) + 0.5, uv.getY(i) / Math.max(h, d) + 0.5);
      g.computeVertexNormals();
    }
    cache[key] = g;
    return g;
  }
  function geo(key, make) { return cache[key] || (cache[key] = make()); }
  function capsule(r, len, cs, rs) { return geo(['cap', r, len, cs, rs].join(':'), function () { return new THREE.CapsuleGeometry(r, len, cs || seg(4, 2), rs || seg(10, 6)); }); }
  function sphere(r, ws, hs) { return geo(['sph', r, ws, hs].join(':'), function () { return new THREE.SphereGeometry(r, ws || seg(18, 8), hs || seg(14, 6)); }); }
  function cyl(rt, rb, h, s) { return geo(['cyl', rt, rb, h, s].join(':'), function () { return new THREE.CylinderGeometry(rt, rb, h, s || seg(16, 8)); }); }

  // Bål: svarvad profil så att axlar, midja och bröst får form
  function torso(width, height, depthScale) {
    return geo(['torso', width, height, depthScale].join(':'), function () {
      var pts = [], w = width / 2;
      var prof = [[0.0, 0.62], [0.06, 0.8], [0.25, 0.86], [0.5, 0.82], [0.72, 0.9], [0.86, 1.0], [0.94, 0.9], [0.99, 0.55], [1.0, 0.0]];
      prof.forEach(function (p) { pts.push(new THREE.Vector2(p[1] * w, p[0] * height)); });
      var g = new THREE.LatheGeometry(pts, seg(20, 10));
      g.scale(1, 1, depthScale || 0.62);
      g.computeVertexNormals();
      return g;
    });
  }
  // Blad till krukväxter: böjd, spetsig platta
  function leaf(len, wid) {
    return geo(['leaf', len, wid].join(':'), function () {
      var g = new THREE.PlaneGeometry(wid, len, 2, 6);
      var p = g.attributes.position;
      for (var i = 0; i < p.count; i++) {
        var y = p.getY(i) / len + 0.5, x = p.getX(i);
        var taper = Math.sin(Math.PI * Math.min(1, y * 1.05));
        p.setX(i, x * taper);
        p.setZ(i, -Math.pow(y, 2) * len * 0.35 + Math.abs(x) * 0.25);
        p.setY(i, y * len);
      }
      g.computeVertexNormals();
      return g;
    });
  }
  function mesh(g, m, x, y, z, parent, shadow) {
    var o = new THREE.Mesh(g, m);
    o.position.set(x || 0, y || 0, z || 0);
    if (shadow !== false) o.castShadow = true;
    o.receiveShadow = true;
    if (parent) parent.add(o);
    return o;
  }

  // Slå ihop barnen i en grupp som har samma material (för figurer med leder: en mesh per led och material)
  function mergeChildren(group, skip) {
    var byMat = {};
    group.children.forEach(function (o) {
      if (!o.isMesh || o.children.length || (skip && skip.indexOf(o) >= 0) || !o.material || Array.isArray(o.material)) return;
      (byMat[o.material.uuid] = byMat[o.material.uuid] || []).push(o);
    });
    Object.keys(byMat).forEach(function (k) {
      var list = byMat[k];
      if (list.length < 2) return;
      var pos = [], nor = [], uv = [];
      list.forEach(function (o) {
        o.updateMatrix();
        var g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        g.applyMatrix4(o.matrix);
        var P = g.attributes.position.array, N = g.attributes.normal.array, U = g.attributes.uv ? g.attributes.uv.array : null;
        for (var i = 0; i < g.attributes.position.count; i++) { pos.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); nor.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]); uv.push(U ? U[i * 2] : 0, U ? U[i * 2 + 1] : 0); }
        g.dispose();
        group.remove(o);
      });
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.computeBoundingSphere();
      var m = new THREE.Mesh(geo, list[0].material);
      m.castShadow = list[0].castShadow; m.receiveShadow = list[0].receiveShadow;
      m.userData = list[0].userData;
      group.add(m);
    });
  }

  return { mergeChildren: mergeChildren, rbox: rbox, capsule: capsule, sphere: sphere, cyl: cyl, torso: torso, leaf: leaf, mesh: mesh, seg: seg, detail: detail, geo: geo };
})();
