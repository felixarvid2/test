// Kollegorna: stiliserade figurer med namnskylt och ärendemarkering.
NV.people = (function () {
  var T = NV.tex;

  var CAST = {
    Anna: { site: 'gbg', desk: 'PC-Anna', shirt: 0xc8553d, pants: 0x2d3142, skin: 0xf1c7a5, hair: 0x6b3e26, long: true, role: 'Kundservice' },
    Karim: { site: 'gbg', desk: 'PC-Karim', shirt: 0x3c6e71, pants: 0x353535, skin: 0xc68e62, hair: 0x1d1d1d, role: 'Säljare' },
    Sara: { site: 'gbg', desk: 'PC-Sara', shirt: 0x7b9e3a, pants: 0x3b3b4f, skin: 0xe8b894, hair: 0xd9a441, long: true, role: 'Nyanställd projektledare' },
    Lisa: { site: 'gbg', desk: 'PC-Lisa', shirt: 0x8e5ea2, pants: 0x2f3e46, skin: 0xf3d0b5, hair: 0x2b1b12, long: true, role: 'Kommunikatör' },
    Bo: { site: 'gbg', desk: 'PC-Bo', shirt: 0x5a7fa6, pants: 0x3a3a3a, skin: 0xefc4a4, hair: 0x9a9a9a, role: 'Ekonomichef' },
    Maja: { site: 'gbg', desk: 'PC-Maja', shirt: 0xd9a441, pants: 0x283044, skin: 0xa8734f, hair: 0x1a1a1a, long: true, role: 'Redovisning' },
    Omar: { site: 'gbg', stand: { x: -3.4, z: -7.8, ry: 0.6 }, shirt: 0x2f2f2f, pants: 0x1f2a44, skin: 0xb5835a, hair: 0x121212, role: 'Drift (din kollega)' },
    Linnea: { site: 'gbg', stand: { x: 7.2, z: -7.1, ry: 0 }, shirt: 0x3c7478, pants: 0x2d2d2d, skin: 0xf2d1b8, hair: 0xb5651d, long: true, role: 'Receptionist' },
    Eva: { site: 'gbg', stand: { x: 0.2, z: -4.6, ry: -2.4 }, shirt: 0x6a4c93, pants: 0x222222, skin: 0xe0ac8a, hair: 0x5a5a5a, long: true, role: 'Revisor', weeks: [6] },
    Nils: { site: 'boras', stand: { x: 92.2, z: -7.2, ry: -2.2 }, shirt: 0xe07b24, pants: 0x2c3e50, skin: 0xeec09c, hair: 0x8a5a2b, role: 'Lagerchef', vest: true },
  };

  function mat(b, c, r) { return b.std(c, r === undefined ? 0.75 : r, 0); }

  function figure(world, name, def) {
    var b = world.builder;
    var g = new THREE.Group();
    var shirt = mat(b, def.shirt), pants = mat(b, def.pants), skin = mat(b, def.skin, 0.6), hair = mat(b, def.hair, 0.9), shoe = mat(b, 0x1b1b1b, 0.6);
    var sitting = !!def.desk;
    var hip = sitting ? 0.5 : 0.92;
    // Ben
    var legs = new THREE.Group();
    [-0.1, 0.1].forEach(function (x) {
      if (sitting) {
        var thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.34, 4, 8), pants); thigh.rotation.x = Math.PI / 2; thigh.position.set(x, hip, -0.2); legs.add(thigh);
        var shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.36, 4, 8), pants); shin.position.set(x, hip - 0.24, -0.4); legs.add(shin);
        var foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.2), shoe); foot.position.set(x, 0.04, -0.46); legs.add(foot);
      } else {
        var leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.72, 4, 8), pants); leg.position.set(x, 0.46, 0); legs.add(leg);
        var ft = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.22), shoe); ft.position.set(x, 0.03, -0.04); legs.add(ft);
      }
    });
    g.add(legs);
    // Överkropp
    var torso = new THREE.Group();
    torso.position.y = hip;
    var body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.36, 6, 12), shirt); body.position.y = 0.3; body.scale.set(1, 1, 0.72); torso.add(body);
    if (def.vest) { var v = new THREE.Mesh(new THREE.CapsuleGeometry(0.205, 0.3, 6, 12), mat(b, 0xd7ff3c, 0.6)); v.position.y = 0.32; v.scale.set(1.02, 1, 0.75); torso.add(v); }
    // Armar
    var arms = [];
    [-1, 1].forEach(function (s) {
      var arm = new THREE.Group();
      arm.position.set(0.26 * s, 0.52, 0);
      var upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.26, 4, 8), shirt); upper.position.y = -0.16; arm.add(upper);
      var lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.24, 4, 8), skin); lower.position.y = -0.42; arm.add(lower);
      if (sitting) { arm.rotation.x = -0.9; }
      torso.add(arm); arms.push(arm);
    });
    // Huvud
    var head = new THREE.Group();
    head.position.y = 0.72;
    var neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 10), skin); neck.position.y = -0.06; head.add(neck);
    var skull = new THREE.Mesh(new THREE.SphereGeometry(0.14, 20, 16), skin); skull.position.y = 0.1; skull.scale.set(1, 1.1, 1); head.add(skull);
    var hr = new THREE.Mesh(new THREE.SphereGeometry(0.148, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hair); hr.position.y = 0.12; hr.rotation.x = 0.25; head.add(hr);
    if (def.long) { var back = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.18, 4, 8), hair); back.position.set(0, -0.02, 0.07); head.add(back); }
    var eyeM = mat(b, 0x1b1b1b, 0.3);
    [-0.05, 0.05].forEach(function (x) { var e = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), eyeM); e.position.set(x, 0.13, -0.13); head.add(e); });
    var nose = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), skin); nose.position.set(0, 0.09, -0.145); head.add(nose);
    torso.add(head);
    g.add(torso);
    g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.userData.interact = { type: 'npc', id: name }; } });
    // Namnskylt och markering
    var tag = T.label(name, { height: 0.09, bg: 'rgba(20,24,32,0.75)' });
    tag.position.y = hip + 1.08;
    g.add(tag);
    var marker = T.label('!', { height: 0.2, bg: 'rgba(245,190,40,0.95)', color: '#1d1d1d', size: 60, weight: '900' });
    marker.position.y = hip + 1.32;
    marker.visible = false;
    g.add(marker);
    var done = T.label('✓', { height: 0.16, bg: 'rgba(60,170,90,0.95)', size: 52, weight: '900' });
    done.position.y = hip + 1.3;
    done.visible = false;
    g.add(done);
    // Osynlig träffyta för att lättare kunna prata med personen
    var hit = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, hip + 0.9, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = (hip + 0.9) / 2;
    hit.userData.interact = { type: 'npc', id: name };
    g.add(hit);
    world.scene.add(g);
    return { name: name, def: def, group: g, torso: torso, head: head, arms: arms, marker: marker, done: done, tag: tag, sitting: sitting, phase: Math.random() * 10 };
  }

  function build(world) {
    var A = world.builder.anchors;
    var list = {};
    Object.keys(CAST).forEach(function (n) {
      var d = CAST[n];
      var f = figure(world, n, d);
      if (d.desk) {
        var p = A.desks[d.desk];
        f.group.position.set(p.x, 0, p.z + 0.78);
        f.group.rotation.y = 0;
        f.baseRy = 0;
        world.builder.collide(p.x, p.z + 0.78, 0.55, 0.5);
      } else {
        f.group.position.set(d.stand.x, 0, d.stand.z);
        f.group.rotation.y = d.stand.ry;
        f.baseRy = d.stand.ry;
        world.builder.collide(d.stand.x, d.stand.z, 0.5, 0.5);
      }
      list[n] = f;
    });
    return list;
  }

  function update(list, dt, t, camPos, week) {
    Object.keys(list).forEach(function (n) {
      var f = list[n];
      var show = !f.def.weeks || f.def.weeks.indexOf(week) >= 0;
      f.group.visible = show;
      f.phase += dt;
      f.torso.children[0].scale.y = 1 + Math.sin(f.phase * 2.2) * 0.012;
      if (f.sitting) f.arms.forEach(function (a, i) { a.rotation.x = -0.9 + Math.sin(f.phase * 7 + i * 2) * 0.05; });
      // Titta mot spelaren när hen är nära
      var dx = camPos.x - f.group.position.x, dz = camPos.z - f.group.position.z;
      var dist = Math.sqrt(dx * dx + dz * dz);
      var want = 0;
      if (dist < 4) {
        var ang = Math.atan2(-dx, -dz) - f.group.rotation.y;
        while (ang > Math.PI) ang -= Math.PI * 2;
        while (ang < -Math.PI) ang += Math.PI * 2;
        want = Math.max(-1.1, Math.min(1.1, ang));
      } else want = Math.sin(f.phase * 0.3) * 0.3;
      f.head.rotation.y += (want - f.head.rotation.y) * Math.min(1, dt * 4);
      f.marker.position.y = (f.sitting ? 0.5 : 0.92) + 1.32 + Math.sin(t * 3) * 0.04;
    });
  }

  return { build: build, update: update, CAST: CAST };
})();
