// Kollegorna: figurer med leder (höft, rygg, nacke, axlar, armbågar, händer, knän och fötter)
// som animeras mjukt mellan poser: skriva, sitta, stå, gå, prata, vinka, dricka kaffe m.m.
NV.people = (function () {
  var T = NV.tex, M = NV.models;

  var CAST = {
    Anna: { site: 'gbg', desk: 'PC-Anna', shirt: 0xc8553d, pants: 0x2d3142, skin: 0xf1c7a5, hair: 0x6b3e26, long: true, hairStyle: 'long', lanyard: true, role: 'Kundservice' },
    Karim: { site: 'gbg', desk: 'PC-Karim', shirt: 0x3c6e71, pants: 0x353535, skin: 0xc68e62, hair: 0x1d1d1d, hairStyle: 'short', beard: true, role: 'Säljare' },
    Sara: { site: 'gbg', desk: 'PC-Sara', shirt: 0x7b9e3a, pants: 0x3b3b4f, skin: 0xe8b894, hair: 0xd9a441, long: true, hairStyle: 'ponytail', role: 'Nyanställd projektledare' },
    Lisa: { site: 'gbg', desk: 'PC-Lisa', shirt: 0x8e5ea2, pants: 0x2f3e46, skin: 0xf3d0b5, hair: 0x2b1b12, long: true, hairStyle: 'bun', glasses: true, role: 'Kommunikatör' },
    Bo: { site: 'gbg', desk: 'PC-Bo', shirt: 0x5a7fa6, pants: 0x3a3a3a, skin: 0xefc4a4, hair: 0x9a9a9a, hairStyle: 'receding', glasses: true, beard: true, tie: 0x8a2b2b, role: 'Ekonomichef' },
    Maja: { site: 'gbg', desk: 'PC-Maja', shirt: 0xd9a441, pants: 0x283044, skin: 0xa8734f, hair: 0x1a1a1a, long: true, hairStyle: 'curly', role: 'Redovisning' },
    Omar: { site: 'gbg', stand: { x: -3.4, z: -7.8, ry: 0.6 }, shirt: 0x2f2f2f, pants: 0x1f2a44, skin: 0xb5835a, hair: 0x121212, hairStyle: 'short', beard: true, lanyard: true, role: 'Drift (din kollega)' },
    Linnea: { site: 'gbg', stand: { x: 7.2, z: -7.1, ry: 0 }, shirt: 0x3c7478, pants: 0x2d2d2d, skin: 0xf2d1b8, hair: 0xb5651d, long: true, hairStyle: 'long', headset: true, role: 'Receptionist' },
    Eva: { site: 'gbg', stand: { x: 0.2, z: -4.6, ry: -2.4 }, shirt: 0x6a4c93, pants: 0x222222, skin: 0xe0ac8a, hair: 0x5a5a5a, long: true, hairStyle: 'bun', glasses: true, role: 'Revisor', weeks: [6] },
    Nils: { site: 'boras', stand: { x: 92.2, z: -7.2, ry: -2.2 }, shirt: 0xe07b24, pants: 0x2c3e50, skin: 0xeec09c, hair: 0x8a5a2b, hairStyle: 'cap', vest: true, role: 'Lagerchef' },
  };

  function mat(b, c, r) { return b.std(c, r === undefined ? 0.75 : r, 0); }
  function G(parent, x, y, z) { var g = new THREE.Group(); g.position.set(x || 0, y || 0, z || 0); if (parent) parent.add(g); return g; }

  // ------------------------------------------------------------------ Modellen
  function figure(world, name, def) {
    var b = world.builder;
    var shirt = mat(b, def.shirt, 0.85), pants = mat(b, def.pants, 0.8), skin = mat(b, def.skin, 0.55), hair = mat(b, def.hair, 0.9);
    var shoe = mat(b, 0x1b1b1b, 0.45), sole = mat(b, 0xe8e4dc, 0.7), white = mat(b, 0xfbfbf8, 0.3), dark = mat(b, 0x1a1512, 0.3), brow = mat(b, def.hair === 0x9a9a9a ? 0x6e6e6e : def.hair, 0.9);
    var sitting = !!def.desk;
    var root = new THREE.Group();
    var J = {};
    // Höft och ben
    var hips = J.hips = G(root, 0, 0.94, 0);
    M.mesh(M.rbox(0.34, 0.2, 0.21, 0.07), pants, 0, 0.02, 0, hips);
    if (!def.vest) M.mesh(M.rbox(0.35, 0.035, 0.22, 0.015), mat(b, 0x2a211c, 0.4), 0, 0.1, 0, hips);
    ['L', 'R'].forEach(function (side, i) {
      var s = i ? 1 : -1;
      var th = J['th' + side] = G(hips, 0.095 * s, -0.03, 0);
      M.mesh(M.capsule(0.068, 0.34), pants, 0, -0.2, 0, th);
      var kn = J['kn' + side] = G(th, 0, -0.42, 0);
      M.mesh(M.capsule(0.056, 0.34), pants, 0, -0.2, 0, kn);
      var ft = J['ft' + side] = G(kn, 0, -0.43, 0);
      M.mesh(M.rbox(0.1, 0.075, 0.25, 0.035), shoe, 0, -0.02, -0.055, ft);
      M.mesh(M.rbox(0.104, 0.02, 0.255, 0.008), sole, 0, -0.048, -0.055, ft);
    });
    // Rygg och bål
    var spine = J.spine = G(hips, 0, 0.1, 0);
    var chest = J.chest = G(spine, 0, 0, 0);
    M.mesh(M.torso(0.42, 0.52, 0.6), shirt, 0, 0, 0, chest);
    // Krage
    var collar = M.mesh(M.geo('collar', function () { return new THREE.TorusGeometry(0.065, 0.018, 6, 16); }), shirt, 0, 0.5, 0, chest);
    collar.rotation.x = Math.PI / 2;
    if (def.vest) {
      var vest = M.mesh(M.torso(0.44, 0.44, 0.64), mat(b, 0xd7ff3c, 0.6), 0, 0.03, 0, chest);
      [-0.08, 0.08].forEach(function (x) { M.mesh(M.rbox(0.04, 0.3, 0.02, 0.005), mat(b, 0xdfe6ea, 0.2), x, 0.2, -0.14, chest); });
      vest.scale.set(1.02, 1, 1.03);
    }
    if (def.tie) { var tie = M.mesh(M.rbox(0.05, 0.3, 0.015, 0.008), mat(b, def.tie, 0.6), 0, 0.3, -0.135, chest); tie.rotation.x = 0.1; }
    if (def.lanyard) {
      var ly = M.mesh(M.geo('lany', function () { return new THREE.TorusGeometry(0.1, 0.006, 4, 16, Math.PI); }), mat(b, 0x2f6fd6, 0.6), 0, 0.46, -0.08, chest);
      ly.rotation.set(0.35, 0, Math.PI);
      M.mesh(M.rbox(0.055, 0.075, 0.006, 0.006), white, 0, 0.3, -0.135, chest);
    }
    // Armar
    ['L', 'R'].forEach(function (side, i) {
      var s = i ? 1 : -1;
      var sh = J['sh' + side] = G(chest, 0.205 * s, 0.44, 0);
      M.mesh(M.sphere(0.06), shirt, 0, 0, 0, sh);
      M.mesh(M.capsule(0.052, 0.22), shirt, 0, -0.15, 0, sh);
      var el = J['el' + side] = G(sh, 0, -0.29, 0);
      M.mesh(M.capsule(0.043, 0.2), skin, 0, -0.13, 0, el);
      M.mesh(M.cyl(0.05, 0.048, 0.06, 10), shirt, 0, -0.01, 0, el);
      var ha = J['ha' + side] = G(el, 0, -0.27, 0);
      var palm = M.mesh(M.sphere(0.045), skin, 0, -0.03, 0, ha); palm.scale.set(0.75, 1.15, 0.45);
      var th2 = M.mesh(M.capsule(0.013, 0.03), skin, 0.025 * -s * -1, -0.015, -0.02, ha); th2.rotation.z = 0.6 * s;
    });
    // Hals och huvud
    var neck = J.neck = G(chest, 0, 0.52, 0);
    M.mesh(M.cyl(0.048, 0.056, 0.1, 12), skin, 0, 0.03, 0, neck);
    var head = J.head = G(neck, 0, 0.1, 0);
    var skull = M.mesh(M.sphere(0.108, M.seg(24, 12), M.seg(18, 9)), skin, 0, 0.1, 0, head); skull.scale.set(0.95, 1.12, 1);
    var jaw = M.mesh(M.sphere(0.085), skin, 0, 0.045, -0.02, head); jaw.scale.set(1, 0.8, 1);
    [-1, 1].forEach(function (s) { var ear = M.mesh(M.sphere(0.025), skin, 0.102 * s, 0.1, 0.005, head); ear.scale.set(0.45, 1, 0.8); });
    var nose = M.mesh(M.sphere(0.022), skin, 0, 0.085, -0.108, head); nose.scale.set(0.8, 1.1, 1.1);
    // Ögon med vitor och pupiller som kan titta åt olika håll
    var eyes = [], pupils = [], brows = [];
    [-1, 1].forEach(function (s) {
      var eg = G(head, 0.038 * s, 0.112, -0.088);
      var wht = M.mesh(M.sphere(0.02), white, 0, 0, 0, eg, false); wht.scale.set(1, 1, 0.6);
      var pup = M.mesh(M.sphere(0.011), dark, 0, 0, -0.011, eg, false);
      eyes.push(eg); pupils.push(pup);
      var br = M.mesh(M.rbox(0.042, 0.009, 0.01, 0.004), brow, 0.038 * s, 0.145, -0.094, head, false);
      brows.push(br);
    });
    // Munnen: en båge som kan le eller vara sur
    var mouth = M.mesh(M.geo('mouth', function () { return new THREE.TorusGeometry(0.024, 0.0055, 5, 10, Math.PI); }), mat(b, 0x8a3b32, 0.6), 0, 0.048, -0.1, head, false);
    mouth.rotation.z = Math.PI;
    // Hår
    var hs = def.hairStyle || (def.long ? 'long' : 'short');
    if (hs !== 'bald') {
      var capG = M.geo('hair' + (hs === 'receding' ? 'r' : ''), function () { return new THREE.SphereGeometry(0.114, M.seg(24, 12), 12, 0, Math.PI * 2, 0, Math.PI * (hs === 'receding' ? 0.35 : 0.55)); });
      if (hs === 'receding') { var ring = M.mesh(M.geo('hairRing', function () { return new THREE.CylinderGeometry(0.112, 0.108, 0.06, 20, 1, true, Math.PI * 0.35, Math.PI * 1.3); }), hair, 0, 0.1, 0.01, head); ring.rotation.y = 0; }
      else if (hs === 'cap') {
        M.mesh(capG, mat(b, 0x2c3e50, 0.7), 0, 0.12, 0, head).rotation.x = 0.1;
        var peak = M.mesh(M.rbox(0.16, 0.012, 0.09, 0.005), mat(b, 0x2c3e50, 0.7), 0, 0.15, -0.12, head); peak.rotation.x = -0.15;
      } else {
        var cap = M.mesh(capG, hair, 0, 0.12, 0.004, head); cap.rotation.x = 0.28; cap.scale.set(1, 1.08, 1.03);
      }
      if (hs === 'long') { var back = M.mesh(M.sphere(0.1), hair, 0, 0.02, 0.055, head); back.scale.set(1.05, 1.45, 0.6); }
      if (hs === 'ponytail') { var pt = M.mesh(M.capsule(0.03, 0.14), hair, 0, 0.05, 0.14, head); pt.rotation.x = -0.4; }
      if (hs === 'bun') M.mesh(M.sphere(0.05), hair, 0, 0.19, 0.08, head);
      if (hs === 'curly') for (var k = 0; k < M.seg(10, 5); k++) { var a = k / M.seg(10, 5) * Math.PI * 2; M.mesh(M.sphere(0.04), hair, Math.cos(a) * 0.1, 0.12 + (k % 3) * 0.02, Math.sin(a) * 0.08 + 0.03, head); }
    }
    if (def.beard) { var bd = M.mesh(M.sphere(0.086), hair, 0, 0.035, -0.02, head); bd.scale.set(1.02, 0.72, 1.03); mouth.position.z = -0.107; }
    if (def.glasses) {
      var gm = mat(b, 0x1b1b1b, 0.3);
      [-1, 1].forEach(function (s) { var r = M.mesh(M.geo('glassRing', function () { return new THREE.TorusGeometry(0.026, 0.004, 5, 16); }), gm, 0.038 * s, 0.112, -0.105, head, false); });
      M.mesh(M.rbox(0.03, 0.005, 0.005, 0.002), gm, 0, 0.115, -0.106, head, false);
    }
    if (def.headset) {
      var band = M.mesh(M.geo('band', function () { return new THREE.TorusGeometry(0.118, 0.008, 5, 18, Math.PI); }), mat(b, 0x222222, 0.4), 0, 0.1, 0, head);
      band.rotation.y = Math.PI / 2;
      M.mesh(M.cyl(0.03, 0.03, 0.02, 12), mat(b, 0x222222, 0.4), 0.115, 0.1, 0, head).rotation.z = Math.PI / 2;
      var mic = M.mesh(M.capsule(0.005, 0.1), mat(b, 0x222222, 0.4), 0.09, 0.05, -0.06, head); mic.rotation.set(1.2, 0, 0.5);
    }
    // Omar håller en kaffekopp
    var mug = null;
    if (name === 'Omar') { mug = M.mesh(M.cyl(0.035, 0.03, 0.08, 12), mat(b, 0xffffff, 0.4), 0, -0.07, -0.03, J.haR); }
    root.traverse(function (o) { if (o.isMesh) o.userData.interact = { type: 'npc', id: name }; });
    // Färre ritanrop: allt som sitter på samma led och har samma material blir en mesh
    var keep = brows.concat([mouth]);
    Object.keys(J).forEach(function (k) { M.mergeChildren(J[k], keep); });
    // Namnskylt, roll och markering
    var tag = T.label(name, { height: 0.09, bg: 'rgba(20,24,32,0.75)' });
    root.add(tag);
    var roleTag = T.label(name + ' · ' + def.role, { height: 0.09, bg: 'rgba(20,24,32,0.85)' });
    roleTag.material.opacity = 0;
    root.add(roleTag);
    var marker = T.label('!', { height: 0.2, bg: 'rgba(245,190,40,0.95)', color: '#1d1d1d', size: 60, weight: '900' });
    marker.visible = false; marker.material.color.setScalar(1.8);
    root.add(marker);
    var done = T.label('✓', { height: 0.16, bg: 'rgba(60,170,90,0.95)', size: 52, weight: '900' });
    done.visible = false; done.material.color.setScalar(1.5);
    root.add(done);
    // Osynlig träffyta för att lättare kunna prata med personen
    var hit = new THREE.Mesh(M.cyl(0.35, 0.35, 1.8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.9;
    hit.userData.interact = { type: 'npc', id: name };
    root.add(hit);
    root.userData.dynamic = true;
    world.scene.add(root);
    var f = {
      name: name, def: def, group: root, J: J, eyes: eyes, pupils: pupils, brows: brows, mouth: mouth, mug: mug,
      marker: marker, done: done, tag: tag, roleTag: roleTag, sitting: sitting, hit: hit,
      phase: Math.random() * 10, blinkT: 1 + Math.random() * 3, gestT: 6 + Math.random() * 12, gest: 0, gestKind: null, waved: false,
      cur: {}, walkPh: 0, speed: 0, look: 0, lookV: 0, torsoTurn: 0,
      // Små personliga skillnader så att ingen rör sig exakt likadant
      tempo: 0.85 + Math.random() * 0.3, height: 0.96 + ((name.length * 7) % 9) / 100,
    };
    root.scale.setScalar(f.height);
    return f;
  }

  function build(world) {
    var A = world.builder.anchors;
    var list = {};
    Object.keys(CAST).forEach(function (n) {
      var d = CAST[n];
      var f = figure(world, n, d);
      if (d.desk) {
        var p = A.desks[d.desk];
        f.group.position.set(p.x, 0, p.z + 0.7);
        f.group.rotation.y = 0;
        f.baseRy = 0;
        world.builder.collide(p.x, p.z + 0.78, 0.55, 0.5);
      } else {
        f.group.position.set(d.stand.x, 0, d.stand.z);
        f.group.rotation.y = d.stand.ry;
        f.baseRy = d.stand.ry;
        world.builder.collide(d.stand.x, d.stand.z, 0.5, 0.5);
        f.collider = world.builder.colliders[world.builder.colliders.length - 1];
        f.home = { x: d.stand.x, z: d.stand.z };
      }
      list[n] = f;
    });
    return list;
  }

  // ------------------------------------------------------------------ Poser
  // Varje pose är vinklar per led. Rotation x framåt för armar/ben som hänger nedåt.
  var JOINTS = ['hips', 'spine', 'chest', 'neck', 'head', 'shL', 'elL', 'haL', 'shR', 'elR', 'haR', 'thL', 'knL', 'ftL', 'thR', 'knR', 'ftR'];
  function P() { var o = {}; JOINTS.forEach(function (j) { o[j] = [0, 0, 0]; }); o.hipY = 0.94; o.hipZ = 0; return o; }

  function poseSit(f, t) {
    var p = P();
    p.hipY = 0.49; p.hipZ = 0.02;
    p.thL = [1.52, 0, 0.06]; p.thR = [1.52, 0, -0.06];
    p.knL = [-1.45, 0, 0]; p.knR = [-1.45, 0, 0];
    p.ftL = [-0.05, 0, 0]; p.ftR = [-0.05, 0, 0];
    p.spine = [-0.1, 0, 0]; p.chest = [-0.06, 0, 0]; p.neck = [0.06, 0, 0]; p.head = [0.12, 0, 0];
    // Händerna på tangentbordet med små rörelser när personen skriver
    var ty = f.typing ? 1 : 0;
    p.shL = [0.72, 0, -0.14]; p.shR = [0.72, 0, 0.14];
    p.elL = [1.05 + Math.sin(t * 13 * f.tempo) * 0.05 * ty, 0, 0.25]; p.elR = [1.05 + Math.sin(t * 11 * f.tempo + 2) * 0.05 * ty, 0, -0.25];
    p.haL = [-0.25 + Math.max(0, Math.sin(t * 17 * f.tempo)) * 0.25 * ty, 0, 0]; p.haR = [-0.25 + Math.max(0, Math.sin(t * 15 * f.tempo + 1)) * 0.25 * ty, 0, 0];
    return p;
  }
  function poseStand(f, t) {
    var p = P();
    var w = Math.sin(t * 0.55 * f.tempo);
    // Viktförskjutning mellan benen
    p.hipZ = 0;
    p.hips = [0, 0, w * 0.035]; p.hipX = w * 0.02;
    p.thL = [0.02, 0, -0.03 - w * 0.03]; p.thR = [0.02, 0, 0.03 - w * 0.03];
    p.knL = [-0.06 - Math.max(0, w) * 0.1, 0, 0]; p.knR = [-0.06 - Math.max(0, -w) * 0.1, 0, 0];
    p.ftL = [0.04, 0, 0.03 + w * 0.03]; p.ftR = [0.04, 0, -0.03 + w * 0.03];
    p.spine = [0.02, 0, -w * 0.03]; p.chest = [0, 0, -w * 0.015];
    p.shL = [0.06, 0, -0.1]; p.shR = [0.06, 0, 0.1];
    p.elL = [0.18, 0, 0]; p.elR = [0.18, 0, 0];
    p.haL = [0, 0.2, 0]; p.haR = [0, -0.2, 0];
    if (f.mug) { p.shR = [0.3, 0, 0.12]; p.elR = [1.35, 0, 0]; p.haR = [-0.4, 0, 0]; }
    return p;
  }
  function poseWalk(f, ph, amt) {
    var p = poseStand(f, 0);
    var s = Math.sin(ph), c = Math.cos(ph);
    p.thL = [0.5 * s * amt, 0, -0.03]; p.thR = [-0.5 * s * amt, 0, 0.03];
    p.knL = [-(0.15 + 0.75 * Math.max(0, c)) * amt, 0, 0]; p.knR = [-(0.15 + 0.75 * Math.max(0, -c)) * amt, 0, 0];
    p.ftL = [(-0.25 * s + 0.1) * amt, 0, 0]; p.ftR = [(0.25 * s + 0.1) * amt, 0, 0];
    p.hips = [0, 0.1 * s * amt, 0.04 * c * amt];
    p.spine = [0.05 * amt, -0.12 * s * amt, 0]; p.chest = [0, -0.06 * s * amt, 0];
    p.hipY = 0.94 + Math.abs(c) * 0.03 * amt - 0.015;
    p.shL = [-0.4 * s * amt + 0.05, 0, -0.1]; p.elL = [0.3 + 0.15 * Math.max(0, -s) * amt, 0, 0];
    if (!f.mug) { p.shR = [0.4 * s * amt + 0.05, 0, 0.1]; p.elR = [0.3 + 0.15 * Math.max(0, s) * amt, 0, 0]; }
    p.head = [0.02, 0.06 * s * amt, 0];
    return p;
  }

  // Mjuk övergång: skillnaden krymper exponentiellt, oberoende av bildfrekvensen
  function approach(cur, target, k) {
    for (var i = 0; i < 3; i++) cur[i] += (target[i] - cur[i]) * k;
  }
  function apply(f, p, dt, speed) {
    var k = 1 - Math.exp(-dt * (speed || 9));
    var J = f.J, cur = f.cur;
    JOINTS.forEach(function (j) {
      var c = cur[j] || (cur[j] = [0, 0, 0]);
      approach(c, p[j], k);
      J[j].rotation.set(c[0], c[1], c[2]);
    });
    cur.hipY = cur.hipY === undefined ? p.hipY : cur.hipY + (p.hipY - cur.hipY) * k;
    cur.hipZ = (cur.hipZ || 0) + ((p.hipZ || 0) - (cur.hipZ || 0)) * k;
    cur.hipX = (cur.hipX || 0) + ((p.hipX || 0) - (cur.hipX || 0)) * k;
    J.hips.position.set(cur.hipX, cur.hipY, cur.hipZ);
  }

  // Omar går fram och tillbaka vid kaffemaskinen
  var PACE = { Omar: [{ x: -3.4, z: -7.8 }, { x: -4.9, z: -8.6 }] };
  function angDiff(a, b) { var d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

  function update(list, dt, t, camPos, week, talkingTo) {
    Object.keys(list).forEach(function (n) {
      var f = list[n];
      var show = !f.def.weeks || f.def.weeks.indexOf(week) >= 0;
      f.group.visible = show;
      if (!show) return;
      f.phase += dt;
      var gp = f.group.position;
      var dx = camPos.x - gp.x, dz = camPos.z - gp.z;
      var dist = Math.sqrt(dx * dx + dz * dz);
      // Långt bort: animera mer sällan (sparar kraft på äldre datorer)
      f.skip = (f.skip || 0) + dt;
      if (dist > (NV.gfx.p ? NV.gfx.p.farAnim : 16) && f.skip < 0.12) return;
      var adt = f.skip; f.skip = 0;
      var talking = talkingTo === n;
      var ang = angDiff(Math.atan2(-dx, -dz), f.group.rotation.y);
      // Promenad (bara Omar) när du inte pratar med honom
      var walking = false, path = PACE[n];
      if (path && !talking && dist > 2.2) {
        f.paceT = (f.paceT || 0) - adt;
        f.paceIx = f.paceIx || 0;
        var tgt = path[f.paceIx];
        var ex = tgt.x - gp.x, ez = tgt.z - gp.z, el = Math.sqrt(ex * ex + ez * ez);
        if (f.paceT <= 0) {
          if (el > 0.05) {
            walking = true;
            f.speed += (0.75 - f.speed) * (1 - Math.exp(-adt * 3));
            var face = Math.atan2(-ex, -ez);
            f.group.rotation.y += angDiff(face, f.group.rotation.y) * (1 - Math.exp(-adt * 5));
            var sp = Math.min(el, adt * f.speed);
            gp.x += ex / el * sp; gp.z += ez / el * sp;
            f.walkPh += sp / 0.33;
          } else { f.paceIx = (f.paceIx + 1) % path.length; f.paceT = 4 + Math.random() * 5; }
        }
        if (f.collider) { f.collider.minX = gp.x - 0.25; f.collider.maxX = gp.x + 0.25; f.collider.minZ = gp.z - 0.25; f.collider.maxZ = gp.z + 0.25; }
      } else if (path && talking) {
        f.group.rotation.y += ang * (1 - Math.exp(-adt * 4));
      }
      if (!walking) f.speed *= Math.exp(-adt * 6);
      // Grundpose
      f.typing = f.sitting && !talking && dist > 1.4 && !(f.gest > 0);
      var p = f.sitting ? poseSit(f, f.phase) : (f.speed > 0.05 ? poseWalk(f, f.walkPh, Math.min(1, f.speed / 0.6)) : poseStand(f, f.phase));
      // Andning
      var br = Math.sin(f.phase * 1.7 * f.tempo);
      p.chest[0] += br * 0.015;
      // Titta mot spelaren (huvud och ögon först, sedan kroppen)
      var want = dist < 4.5 ? Math.max(-1.3, Math.min(1.3, ang)) : Math.sin(f.phase * 0.23) * 0.35;
      if (f.typing && dist > 3) want = Math.sin(f.phase * 0.31) * 0.12;
      f.look += (want - f.look) * (1 - Math.exp(-adt * 5));
      p.neck[1] += f.look * 0.45; p.head[1] += f.look * 0.45;
      var bodyTurn = dist < 2.4 ? f.look * 0.35 : 0;
      p.spine[1] += bodyTurn * 0.6; p.chest[1] += bodyTurn * 0.4;
      // Gester
      if (!f.waved && dist < 3.6 && !talking) { f.waved = true; if (f.hasTicket || Math.random() < 0.35) { f.gestKind = 'wave'; f.gest = 1.8; } }
      f.gestT -= adt;
      if (f.gestT <= 0 && f.gest <= 0 && !walking) {
        f.gestT = 9 + Math.random() * 16;
        var r = Math.random();
        f.gestKind = f.mood === 'open' && r < 0.55 ? (r < 0.3 ? 'shake' : 'sigh') : (f.sitting ? (r < 0.5 ? 'stretch' : 'scratch') : (r < 0.5 ? 'sip' : 'watch'));
        f.gest = f.gestKind === 'stretch' ? 2.4 : 1.8;
      }
      if (f.mood === 'happy' && !f.happyDone) { f.happyDone = true; f.gestKind = 'cheer'; f.gest = 1.6; }
      if (talking) {
        // Handgester medan personen pratar
        var g1 = Math.sin(t * 2.3), g2 = Math.sin(t * 1.7 + 1);
        if (f.sitting) { p.shR = [0.9 + g1 * 0.15, 0, 0.3]; p.elR = [1.3 + g2 * 0.2, 0, -0.2]; p.haR = [0.3 * g2, 0.4, 0]; }
        else { p.shR = [0.45 + g1 * 0.15, 0, 0.2]; p.elR = [1.1 + g2 * 0.25, 0, 0]; p.haR = [0.2, 0.5 * g1, 0]; if (!f.mug) { p.shL = [0.35 - g2 * 0.1, 0, -0.18]; p.elL = [0.9 + g1 * 0.2, 0, 0]; } }
        p.head[0] += Math.sin(t * 4.5) * 0.05;
      }
      if (f.gest > 0) {
        f.gest -= adt;
        var dur = f.gestKind === 'stretch' ? 2.4 : (f.gestKind === 'cheer' ? 1.6 : 1.8);
        var e = Math.min(1, f.gest * 2.5, (dur - f.gest) * 2.5);
        e = e * e * (3 - 2 * e);
        var kind = f.gestKind;
        if (kind === 'wave') { p.shR = [0.3, 0, 2.5 * e + p.shR[2] * (1 - e)]; p.elR = [0.5 * e, 0, 0]; p.haR = [0, 0, Math.sin(t * 11) * 0.45 * e]; p.head[2] += 0.08 * e; }
        else if (kind === 'stretch') { p.shL = [2.9 * e + p.shL[0] * (1 - e), 0, -0.2]; p.shR = [2.9 * e + p.shR[0] * (1 - e), 0, 0.2]; p.elL[0] *= 1 - e; p.elR[0] *= 1 - e; p.spine[0] += 0.12 * e; p.head[0] -= 0.2 * e; }
        else if (kind === 'scratch') { p.shR = [0.5 * e + p.shR[0] * (1 - e), 0, 0.6 * e]; p.elR = [2.5 * e + p.elR[0] * (1 - e), 0, 0]; p.haR = [Math.sin(t * 14) * 0.3 * e, 0, 0]; p.head[2] += 0.1 * e; }
        else if (kind === 'sip') { p.shR = [0.55 * e + p.shR[0] * (1 - e), 0, 0.15]; p.elR = [2.1 * e + p.elR[0] * (1 - e), 0, 0]; p.head[0] -= 0.15 * e; }
        else if (kind === 'watch') { p.shL = [0.6 * e, 0, -0.3 * e]; p.elL = [1.7 * e, 0, 0.3 * e]; p.head[0] += 0.3 * e; p.head[1] -= 0.25 * e; }
        else if (kind === 'shake') { p.head[1] += Math.sin(t * 15) * 0.3 * e; }
        else if (kind === 'sigh') { p.chest[0] -= 0.12 * Math.sin(Math.PI * (dur - f.gest) / dur); p.shL[2] -= 0.1 * e; p.shR[2] += 0.1 * e; }
        else if (kind === 'cheer') {
          p.shL = [0.3, 0, -2.6 * e]; p.shR = [0.3, 0, 2.6 * e]; p.elL = [0.3 * e, 0, 0]; p.elR = [0.3 * e, 0, 0];
          if (!f.sitting) p.hipY += Math.abs(Math.sin((dur - f.gest) * 9)) * 0.08 * e;
        }
      }
      apply(f, p, adt, walking ? 14 : 9);
      // Ansiktet: blinkningar, pupiller, ögonbryn och mun
      f.blinkT -= adt;
      var blink = f.blinkT < 0.13;
      if (f.blinkT < 0) f.blinkT = 1.8 + Math.random() * 4;
      f.eyes.forEach(function (e) { e.scale.y += ((blink ? 0.12 : 1) - e.scale.y) * (1 - Math.exp(-adt * 40)); });
      var la = dist < 5 ? Math.max(-1, Math.min(1, (ang - f.look) * 2)) : 0;
      f.pupils.forEach(function (pu) { pu.position.x = -la * 0.006; pu.position.y = f.typing ? -0.005 : 0; });
      var frown = f.mood === 'open' ? 1 : 0, smile = f.mood === 'happy' || (talking && !frown) ? 1 : 0;
      f.brows.forEach(function (bw, i) { bw.rotation.z = (i ? -1 : 1) * (frown * 0.3 - smile * 0.05); bw.position.y = 0.145 + (talking ? Math.max(0, Math.sin(t * 3)) * 0.006 : 0) + smile * 0.004; });
      f.mouth.rotation.z = smile ? Math.PI : (frown ? 0 : Math.PI);
      f.mouth.position.y = frown ? 0.038 : 0.048;
      f.mouth.scale.set(1, talking ? 0.6 + Math.abs(Math.sin(t * 13)) * 2.2 : (frown ? 0.6 : 1), 1);
      // Skyltar
      var base = (f.sitting ? 1.36 : 1.82) + (p.hipY - (f.sitting ? 0.49 : 0.94));
      var close = dist < 3;
      f.tag.material.opacity += ((close ? 0 : Math.max(0, Math.min(1, (9 - dist) / 3))) - f.tag.material.opacity) * (1 - Math.exp(-adt * 8));
      f.roleTag.material.opacity += ((close ? 1 : 0) - f.roleTag.material.opacity) * (1 - Math.exp(-adt * 8));
      f.tag.position.y = f.roleTag.position.y = base + 0.08;
      var bounce = Math.abs(Math.sin(t * 2.6));
      f.marker.position.y = base + 0.32 + bounce * 0.07;
      if (!f.marker.userData.s) f.marker.userData.s = [f.marker.scale.x, f.marker.scale.y];
      var sq = 1 + (1 - bounce) * 0.08;
      f.marker.scale.set(f.marker.userData.s[0] / sq, f.marker.userData.s[1] * sq, 1);
      f.done.position.y = base + 0.3;
      f.hit.position.y = f.sitting ? 0.7 : 0.9;
    });
  }

  return { build: build, update: update, CAST: CAST };
})();
