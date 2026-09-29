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
    var eyes = [];
    [-0.05, 0.05].forEach(function (x) { var e = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), eyeM); e.position.set(x, 0.13, -0.13); head.add(e); eyes.push(e); });
    var mouth = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.008, 0.01), mat(b, 0x8a3b32, 0.6)); mouth.position.set(0, 0.045, -0.135); head.add(mouth);
    var nose = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), skin); nose.position.set(0, 0.09, -0.145); head.add(nose);
    torso.add(head);
    g.add(torso);
    g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.userData.interact = { type: 'npc', id: name }; } });
    // Namnskylt och markering
    var tag = T.label(name, { height: 0.09, bg: 'rgba(20,24,32,0.75)' });
    tag.position.y = hip + 1.08;
    g.add(tag);
    var roleTag = T.label(name + ' · ' + def.role, { height: 0.09, bg: 'rgba(20,24,32,0.85)' });
    roleTag.position.y = hip + 1.08;
    roleTag.material.opacity = 0;
    g.add(roleTag);
    var marker = T.label('!', { height: 0.2, bg: 'rgba(245,190,40,0.95)', color: '#1d1d1d', size: 60, weight: '900' });
    marker.position.y = hip + 1.32;
    marker.visible = false;
    marker.material.color.setScalar(1.8);
    g.add(marker);
    var done = T.label('✓', { height: 0.16, bg: 'rgba(60,170,90,0.95)', size: 52, weight: '900' });
    done.material.color.setScalar(1.5);
    done.position.y = hip + 1.3;
    done.visible = false;
    g.add(done);
    // Osynlig träffyta för att lättare kunna prata med personen
    var hit = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, hip + 0.9, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = (hip + 0.9) / 2;
    hit.userData.interact = { type: 'npc', id: name };
    g.add(hit);
    world.scene.add(g);
    // Omar håller en kaffekopp
    if (name === 'Omar') { var mug = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.08, 12), mat(b, 0xffffff, 0.4)); mug.position.set(0, -0.56, -0.03); arms[1].add(mug); }
    return { name: name, def: def, group: g, torso: torso, head: head, arms: arms, legs: legs, eyes: eyes, mouth: mouth, marker: marker, done: done, tag: tag, roleTag: roleTag, sitting: sitting, phase: Math.random() * 10, blinkT: 2 + Math.random() * 3, gestT: 8 + Math.random() * 15, gest: 0, gestKind: null, waved: false };
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
        f.collider = world.builder.colliders[world.builder.colliders.length - 1];
        f.home = { x: d.stand.x, z: d.stand.z };
      }
      list[n] = f;
    });
    return list;
  }

  // Omar går fram och tillbaka vid kaffemaskinen
  var PACE = { Omar: [{ x: -3.4, z: -7.8 }, { x: -4.9, z: -8.6 }] };

  function update(list, dt, t, camPos, week, talkingTo) {
    Object.keys(list).forEach(function (n) {
      var f = list[n];
      var show = !f.def.weeks || f.def.weeks.indexOf(week) >= 0;
      f.group.visible = show;
      if (!show) return;
      f.phase += dt;
      f.torso.children[0].scale.y = 1 + Math.sin(f.phase * 2.2) * 0.012;
      var dx = camPos.x - f.group.position.x, dz = camPos.z - f.group.position.z;
      var dist = Math.sqrt(dx * dx + dz * dz);
      var talking = talkingTo === n;
      // Blinkar
      f.blinkT -= dt;
      var blink = f.blinkT < 0.12;
      if (f.blinkT < 0) f.blinkT = 2 + Math.random() * 4;
      f.eyes.forEach(function (e) { e.scale.y = blink ? 0.15 : 1; });
      // Munnen rör sig när personen pratar med dig
      f.mouth.scale.y = talking ? 1 + Math.abs(Math.sin(t * 14)) * 4 : 1;
      // Vandring (bara Omar) när du inte pratar med honom
      var walking = false;
      var path = PACE[n];
      if (path && !talking && dist > 2.2) {
        f.paceT = (f.paceT || 0) - dt;
        f.paceIx = f.paceIx || 0;
        var tgt = path[f.paceIx];
        var ex = tgt.x - f.group.position.x, ez = tgt.z - f.group.position.z, el = Math.sqrt(ex * ex + ez * ez);
        if (f.paceT <= 0) {
          if (el > 0.05) {
            walking = true;
            var sp = Math.min(el, dt * 0.8);
            f.group.position.x += ex / el * sp; f.group.position.z += ez / el * sp;
            var face = Math.atan2(-ex, -ez);
            f.group.rotation.y += (face - f.group.rotation.y) * Math.min(1, dt * 6);
          } else { f.paceIx = (f.paceIx + 1) % path.length; f.paceT = 4 + Math.random() * 5; }
        }
        if (f.collider) { f.collider.minX = f.group.position.x - 0.25; f.collider.maxX = f.group.position.x + 0.25; f.collider.minZ = f.group.position.z - 0.25; f.collider.maxZ = f.group.position.z + 0.25; }
      } else if (path && talking) {
        var fc = Math.atan2(-dx, -dz);
        f.group.rotation.y += (fc - f.group.rotation.y) * Math.min(1, dt * 4);
      }
      if (!f.sitting) f.legs.children.forEach(function (l, i) { l.rotation.x = walking ? Math.sin(t * 7 + (i % 2 ? 0 : Math.PI)) * 0.35 : l.rotation.x * 0.8; });
      // Gester: vinka, sträcka på sig, dricka kaffe, skaka på huvudet
      if (!f.waved && dist < 3.6 && !talking) { f.waved = true; f.gestKind = 'wave'; f.gest = 1.6; }
      f.gestT -= dt;
      if (f.gestT <= 0 && f.gest <= 0) {
        f.gestT = 10 + Math.random() * 18;
        f.gestKind = f.mood === 'open' && Math.random() < 0.6 ? 'shake' : (f.sitting ? 'stretch' : 'sip');
        f.gest = f.gestKind === 'stretch' ? 2.2 : 1.6;
      }
      if (f.mood === 'happy' && !f.happyDone) { f.happyDone = true; f.gestKind = 'jump'; f.gest = 1.2; }
      var armL = f.sitting ? -0.9 : 0, armR = f.sitting ? -0.9 : 0, armZR = 0, headShake = 0, lift = 0;
      if (f.gest > 0) {
        f.gest -= dt;
        var e = Math.min(1, f.gest * 3, (f.gestKind === 'stretch' ? 2.2 : 1.6) - f.gest);
        if (f.gestKind === 'wave') { armR = -2.6 * e; armZR = Math.sin(t * 12) * 0.35 * e; }
        else if (f.gestKind === 'stretch') { armL = armR = -0.9 - 2.1 * e; }
        else if (f.gestKind === 'sip') { armR = -1.9 * e; }
        else if (f.gestKind === 'shake') { headShake = Math.sin(t * 16) * 0.35 * e; }
        else if (f.gestKind === 'jump') { lift = Math.abs(Math.sin(f.gest * 8)) * 0.12 * e; }
      } else if (f.sitting) {
        armL = -0.9 + Math.sin(f.phase * 7) * 0.05; armR = -0.9 + Math.sin(f.phase * 7 + 2) * 0.05;
      }
      f.arms[0].rotation.x += (armL - f.arms[0].rotation.x) * Math.min(1, dt * 10);
      f.arms[1].rotation.x += (armR - f.arms[1].rotation.x) * Math.min(1, dt * 10);
      f.arms[1].rotation.z = armZR;
      f.torso.position.y = (f.sitting ? 0.5 : 0.92) + lift;
      // Titta mot spelaren när hen är nära
      var want = 0;
      if (dist < 4) {
        var ang = Math.atan2(-dx, -dz) - f.group.rotation.y;
        while (ang > Math.PI) ang -= Math.PI * 2;
        while (ang < -Math.PI) ang += Math.PI * 2;
        want = Math.max(-1.1, Math.min(1.1, ang));
      } else want = Math.sin(f.phase * 0.3) * 0.3;
      f.head.rotation.y += (want + headShake - f.head.rotation.y) * Math.min(1, dt * (headShake ? 14 : 4));
      f.head.rotation.x = talking ? Math.sin(t * 5) * 0.06 : 0;
      // Vänd överkroppen mot dig när du står nära, och tona ut namnet på avstånd
      var tw = dist < 2.2 ? want * 0.55 : 0;
      f.torso.rotation.y += (tw - f.torso.rotation.y) * Math.min(1, dt * 3);
      var close = dist < 3;
      f.tag.material.opacity = close ? 0 : Math.max(0, Math.min(1, (9 - dist) / 3));
      f.roleTag.material.opacity += ((close ? 1 : 0) - f.roleTag.material.opacity) * Math.min(1, dt * 6);
      var base = (f.sitting ? 0.5 : 0.92) + lift;
      f.marker.position.y = base + 1.32 + Math.sin(t * 3) * 0.04;
      var pul = 1 + Math.sin(t * 5) * 0.08;
      f.marker.scale.set(f.marker.userData.sx || (f.marker.userData.sx = f.marker.scale.x), f.marker.userData.sy || (f.marker.userData.sy = f.marker.scale.y), 1).multiplyScalar(pul);
      f.done.position.y = base + 1.3;
      f.tag.position.y = f.roleTag.position.y = base + 1.08;
    });
  }

  return { build: build, update: update, CAST: CAST };
})();
