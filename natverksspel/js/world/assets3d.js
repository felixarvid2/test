// Version 9: färdiga modeller från Kenney (CC0, licenserna ligger i assets3d/LICENSES) i 3D-läget.
// Kollegorna blir Mini Characters med riktiga animationer, stolar, soffor, växter och köket byts mot
// Furniture Kit, lagret i Borås får en skåpbil, rullband och lådor, golven får fototexturer, fönstren
// en riktig himmel och fotstegen spelas in. Version 9.1: på medelhög grafik och uppåt blir kollegorna
// riktiga människor från Quaternius, och golv och väggar får ambientCG-texturer med normalkartor. Allt laddas i bakgrunden. Tills det är klart, eller om det
// inte går (till exempel när sidan öppnas direkt från disken), syns spelets egna modeller som förut.
NV.assets3d = (function () {
  var BASE = 'assets3d/';
  // Vilken figur varje kollega får
  var CHARS = { Anna: 'female-f', Sara: 'female-b', Lisa: 'female-c', Maja: 'female-a', Linnea: 'female-e', Eva: 'female-d', Karim: 'male-a', Bo: 'male-d', Omar: 'male-f', Nils: 'male-e' };
  var FURN = ['chairDesk', 'chairCushion', 'loungeSofa', 'loungeDesignSofa', 'pottedPlant', 'plantSmall1', 'plantSmall2', 'plantSmall3', 'kitchenCoffeeMachine', 'kitchenFridge', 'kitchenMicrowave',
    'bookcaseOpenLow', 'books', 'trashcan', 'coatRackStanding', 'lampSquareFloor', 'lampRoundTable', 'laptop', 'cardboardBoxClosed', 'cardboardBoxOpen', 'radio', 'speakerSmall'];
  var PROPS = { delivery: 'props/cars/delivery', conveyor: 'props/factory/conveyor-long', boxLarge: 'props/factory/box-large', boxWide: 'props/factory/box-wide', boxSmall: 'props/factory/box-small' };
  // Golv och väggar från ambientCG (CC0) med normal- och grovhetskartor. k skalar upprepningen, tint färgar putsen.
  function pbr(name, k, tint) { return { file: 'tex/' + name + '.jpg', n: 'tex/' + name + '_n.jpg', r: 'tex/' + name + '_r.jpg', k: k, tint: tint }; }
  var TEX = {
    carpet: pbr('carpet', 1), wood: pbr('wood', 1.5), concrete: pbr('concrete', 1), concreteDark: pbr('concreteDark', 1),
    wall: pbr('plaster', 1, 0xf4f1ea), wallTeal: pbr('plaster', 1, 0x46888c), wallWarm: pbr('plaster', 1, 0xe6d3b6),
    sky: { file: 'tex/sky.jpg' },
  };
  var CHAR_SCALE = 2.1;     // Mini Characters är 0,75 m höga
  var FURN_SCALE = 2;       // Furniture Kit är byggt i halv skala
  var gltf = {}, imgs = {}, ready = false, promise = null;

  // Quaternius-figurerna: kläder, hår och utseende per kollega (färgerna kommer från spelets egna figurer)
  var HAIR = { long: 'hair_long', ponytail: 'hair_long', bun: 'hair_buns', curly: 'hair_buns', short: 'hair_simpleparted', receding: 'hair_buzzed', cap: 'hair_buzzed', beard: 'hair_beard' };
  var PTEX = ['cloth', 'cloth_n', 'hands_m', 'face_m_dark', 'face_m_light', 'face_f_dark', 'face_f_light', 'eye', 'hair1', 'hair2'];
  var FEMALE = { Anna: 1, Sara: 1, Lisa: 1, Maja: 1, Linnea: 1, Eva: 1 };
  var ptex = {};
  function realPeople() { return NV.settings.get('realPeople') !== false && !NV.gfx.profile().lambert; }
  function enabled() { return NV.settings.get('models3d') !== false && !!(window.THREE && THREE.GLTFLoader && THREE.SkeletonUtils); }

  function load() {
    if (promise) return promise;
    if (!enabled() || location.protocol === 'file:') { promise = Promise.resolve(false); return promise; }
    var L = new THREE.GLTFLoader(), jobs = [];
    // Där .glb inte kan serveras finns samma modell som glTF-JSON
    function glb(key, path) {
      jobs.push(L.loadAsync(BASE + path + '.glb').catch(function () { return L.loadAsync(BASE + path + '.gltf.json'); })
        .then(function (g) { gltf[key] = g; }, function () { /* modellen saknas: den egna används */ }));
    }
    // Riktiga människor (Quaternius) från medelhög grafik och uppåt, annars Kenneys figurer
    if (realPeople()) {
      ['body_male', 'body_female'].concat(Object.keys(HAIR).map(function (h) { return HAIR[h]; })).forEach(function (n) {
        if (!gltf['p:' + n]) jobs.push(L.loadAsync(BASE + 'people/' + n + '.gltf.json').then(function (g) { gltf['p:' + n] = g; }, function () { /* saknas */ }));
      });
      PTEX.forEach(function (n) {
        jobs.push(new Promise(function (res) {
          new THREE.TextureLoader().load(BASE + 'people/' + n + '.jpg', function (t) { t.flipY = false; if (!/_n$/.test(n)) t.colorSpace = THREE.SRGBColorSpace; ptex[n] = t; res(); }, undefined, function () { res(); });
        }));
      });
    }
    else Object.keys(CHARS).forEach(function (n) { if (!gltf['c:' + CHARS[n]]) glb('c:' + CHARS[n], 'chars/' + CHARS[n]); });
    FURN.forEach(function (n) { glb(n, 'furniture/' + n); });
    Object.keys(PROPS).forEach(function (n) { glb(n, PROPS[n]); });
    Object.keys(TEX).forEach(function (n) {
      ['file', 'n', 'r'].forEach(function (k) {
        var f = TEX[n][k];
        if (!f || imgs[f]) return;
        imgs[f] = null;
        jobs.push(new Promise(function (res) { var i = new Image(); i.onload = function () { imgs[f] = i; res(); }; i.onerror = function () { res(); }; i.src = BASE + f; }));
      });
    });
    promise = Promise.all(jobs).then(function () { ready = true; return true; });
    return promise;
  }
  // Börja ladda direkt om spelaren brukar spela i 3D
  if (NV.settings.get('modeChosen') && NV.settings.get('mode') === '3d' && NV.settings.get('models3d') !== false) setTimeout(load, 0);

  // ------------------------------------------------------------------ Hjälpare
  // En kopia av en möbel som står mitt på (x, z) med botten på höjden y
  var boxes = {};
  function place(kit, name, x, y, z, ry, s, o) {
    var g = gltf[name];
    if (!g) return null;
    o = o || {};
    if (!boxes[name]) boxes[name] = new THREE.Box3().setFromObject(g.scene);
    var bb = boxes[name], c = new THREE.Vector3(); bb.getCenter(c);
    var sv = typeof s === 'number' ? new THREE.Vector3(s, s, s) : s;
    var m = g.scene.clone();
    m.scale.copy(sv);
    m.position.set(-c.x * sv.x, -bb.min.y * sv.y, -c.z * sv.z);
    var outer = new THREE.Group();
    outer.position.set(x, y || 0, z); outer.rotation.y = ry || 0;
    outer.add(m);
    m.traverse(function (k) {
      if (!k.isMesh) return;
      k.castShadow = o.cast !== false; k.receiveShadow = true;
      // Tyget kan få samma färg som spelets egen möbel
      if (o.tint && o.tint[k.material.name] !== undefined) k.material = tinted(k.material, o.tint[k.material.name]);
    });
    kit.add(outer);
    return outer;
  }
  var tints = {};
  function tinted(m, hex) {
    var key = m.uuid + ':' + hex;
    if (!tints[key]) { tints[key] = m.clone(); tints[key].color.setHex(hex); }
    return tints[key];
  }
  function size(name, s) { var g = gltf[name]; if (!g) return null; if (!boxes[name]) boxes[name] = new THREE.Box3().setFromObject(g.scene); var v = new THREE.Vector3(); boxes[name].getSize(v); return v.multiplyScalar(s); }
  function drop(objs) { objs.forEach(function (o) { if (o.parent) o.parent.remove(o); }); }

  // ------------------------------------------------------------------ Möbler som byggs om
  // Medan 3D-världen byggs sparas stolar, soffor och växter så att de kan bytas ut. De hålls utanför
  // sammanslagningen tills modellerna har laddats, annars går de inte att ta bort.
  var building = null;
  var BP = NV.building.Builder.prototype;
  ['chair', 'sofa', 'plant'].forEach(function (kind) {
    var orig = BP[kind];
    BP[kind] = function () {
      if (!building || this !== building.builder) return orig.apply(this, arguments);
      var sc = this.scene, n0 = sc.children.length;
      var r = orig.apply(this, arguments);
      var objs = sc.children.slice(n0);
      objs.forEach(function (o) { o.userData.dynamic = true; });
      (building.kSwaps = building.kSwaps || []).push({ kind: kind, args: Array.prototype.slice.call(arguments), objs: objs });
      return r;
    };
  });

  function swapFurniture(w, kit) {
    (w.kSwaps || []).forEach(function (sw) {
      var a = sw.args, ok = null;
      if (sw.kind === 'chair') {
        // Fikarummets stolar har dyna, resten är kontorsstolar. Stolens rygg är åt +z. Sofforna vänds
        // däremot ut mot rummet.
        var cushion = a[3] === 0xa04c3a || a[3] === 0x4a6f8a;
        ok = place(kit, cushion ? 'chairCushion' : 'chairDesk', a[0], 0, a[1], (a[2] || 0) + Math.PI, cushion ? 2.1 : 1.75, { tint: { carpet: a[3] || 0x30343b } });
      } else if (sw.kind === 'sofa') {
        ok = place(kit, a[3] === 'fabricBlue' ? 'loungeDesignSofa' : 'loungeSofa', a[0], 0, a[1], a[2] || 0, a[3] === 'fabricBlue' ? new THREE.Vector3(1.8, 2.2, 2.1) : 2.05, { tint: { carpet: a[3] === 'fabricGray' ? 0x5a5f68 : 0xb8872e } });
      } else if (sw.kind === 'plant') {
        var s = a[2] || 1;
        ok = place(kit, 'pottedPlant', a[0], 0, a[1], a[0] * 1.7, 1.45 * s);
      }
      if (ok) drop(sw.objs); else sw.objs.forEach(function (o) { o.userData.dynamic = false; });
    });
    w.kSwaps = [];
  }

  // Kök, inredning och lagret i Borås
  function decor(w, kit) {
    var b = w.builder, A = b.anchors;
    // Kaffemaskinen: lådan finns kvar osynlig så att den går att klicka på
    var cm = A.coffee;
    if (cm && place(kit, 'kitchenCoffeeMachine', -2.8, 0.94, -9.64, 0, 2.15)) {
      cm.material = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
      cm.castShadow = false;
    }
    // Kylskåpet byggs runt den gamla lådan
    place(kit, 'kitchenFridge', 1.8, 0, -9.5, 0, new THREE.Vector3(2.05, 2.05, 2.05));
    place(kit, 'kitchenMicrowave', -0.3, 0.94, -9.68, 0, 1.9);
    place(kit, 'radio', 0.25, 0.94, -9.7, -0.3, 1.2);
    place(kit, 'trashcan', -3.95, 0, -9.62, 0, 1.6); b.collide(-3.95, -9.62, 0.36, 0.36);
    // Receptionen: klädhängare, golvlampa, laptop på gästbordet
    place(kit, 'coatRackStanding', 8.7, 0, -9.55, 0.4, 2.3); b.collide(8.7, -9.55, 0.5, 0.5);
    place(kit, 'lampSquareFloor', 14.45, 0, -9.45, 0, 2); b.collide(14.45, -9.45, 0.3, 0.3);
    place(kit, 'laptop', 13.6, 0.72, -3.3, Math.PI, 1.6);
    place(kit, 'lampRoundTable', 6.3, 1.095, -6.25, 0.6, 1.4);
    // Ekonomi: låga bokhyllor under fönstret med böcker och en högtalare
    [-11.45, -10.55].forEach(function (x, i) {
      place(kit, 'bookcaseOpenLow', x, 0, 9.72, Math.PI, new THREE.Vector3(2.2, 2.2, 2));
      place(kit, 'books', x + (i ? 0.1 : -0.15), 0.88, 9.72, Math.PI + (i ? 0.2 : -0.1), 2);
    });
    b.collide(-11, 9.72, 1.8, 0.5);
    place(kit, 'plantSmall2', -12.15, 0.74, 6.25, 0.4, 2.2);
    place(kit, 'plantSmall1', -2.0, 0.76, 4.25, 1.1, 2);
    place(kit, 'plantSmall3', 2.95, 0.76, 7.45, 2.2, 2);
    place(kit, 'speakerSmall', 11.9, 0.74, 5.25, -0.5, 1.2);
    // Kartonger vid skrivaren och i serverrummet
    place(kit, 'cardboardBoxClosed', 9.45, 0, 9.5, 0.3, 2); place(kit, 'cardboardBoxOpen', 9.6, 0.56, 9.5, -0.2, 1.6);
    b.collide(9.45, 9.5, 0.6, 0.6);
    place(kit, 'cardboardBoxClosed', -14.5, 0, -6.6, 0.15, 2); b.collide(-14.5, -6.6, 0.5, 0.5);
    // Borås: skåpbilen vid lastporten, rullband vid packbordet och lådor
    if (place(kit, 'delivery', 110.4, 0, 1.1, Math.PI, 1.2)) b.collide(110.4, 1.1, 2, 4);
    if (place(kit, 'conveyor', 98.85, 0, 9.8, 0, new THREE.Vector3(1.2, 2.2, 0.95))) b.collide(98.85, 9.8, 2.4, 1);
    place(kit, 'boxSmall', 98.3, 0.88, 9.8, 0.2, 0.9); place(kit, 'boxSmall', 99.5, 0.88, 9.75, -0.3, 0.75);
    [[90.6, 10.9, 0, 'boxLarge'], [91.9, 10.9, 0.1, 'boxWide'], [90.7, 10.9, -0.2, 'boxSmall', 0.77]].forEach(function (p) { place(kit, p[3], p[0], p[4] || 0, p[1], p[2], 1.4); });
    b.collide(91.2, 10.9, 2.6, 1.2);
  }

  // ------------------------------------------------------------------ Kollegorna
  // Animationsnamnen skiljer sig mellan Kenney- och Quaternius-figurerna
  var ANIM = {
    kenney: { sit: 'sit', sitTalk: 'sit', walk: 'walk', wave: 'emote-yes', cheer: 'emote-yes', shake: 'emote-no', talk: 'interact-right', watch: 'pick-up', idle: 'idle' },
    real: { sit: 'sit', sitTalk: 'sitTalk', walk: 'walk', wave: 'interact', cheer: 'cheer', shake: 'talk', talk: 'talk', watch: 'pickup', idle: 'idle' },
  };
  function lum(hex) { var c = new THREE.Color(hex); return 0.3 * c.r + 0.59 * c.g + 0.11 * c.b; }
  function mat(map, color, extra) {
    var m = new THREE.MeshStandardMaterial({ map: map || null, color: color === undefined ? 0xffffff : color, roughness: 0.85, metalness: 0 });
    for (var k in extra) m[k] = extra[k];
    return m;
  }
  function realPerson(f, n) {
    var def = f.def, fem = !!FEMALE[n], g = gltf['p:body_' + (fem ? 'female' : 'male')];
    if (!g || !ptex.cloth) return null;
    var model = THREE.SkeletonUtils.clone(g.scene);
    var dark = lum(def.skin) < 0.42, face = ptex['face_' + (fem ? 'f' : 'm') + '_' + (dark ? 'dark' : 'light')];
    // Hudtonen: texturen ger ansiktet, färgen justerar tonen lite mot spelets hudfärg
    var skinTint = new THREE.Color(def.skin).lerp(new THREE.Color(0xffffff), 0.55);
    var cn = { normalMap: ptex.cloth_n };
    var M = {
      shirt: mat(ptex.cloth, new THREE.Color(def.shirt).lerp(new THREE.Color(0xffffff), 0.15), cn),
      pants: mat(ptex.cloth, def.pants, cn),
      shoes: mat(ptex.cloth, def.vest ? 0x3a2a1c : 0x2a2522, cn),
      skin: mat(face, skinTint, { roughness: 0.6 }),
      hands: mat(ptex.hands_m || face, skinTint, { roughness: 0.6 }),
      brows: mat(ptex[fem ? 'hair2' : 'hair1'], def.hair),
      eyes: mat(ptex.eye, 0xffffff, { roughness: 0.25 }),
    };
    model.traverse(function (o) {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      var nm = o.name;
      if (/Legs/.test(nm)) o.material = M.pants;
      else if (/Feet/.test(nm)) o.material = M.shoes;
      else if (/Arms_2/.test(nm)) o.material = M.hands;
      else if (/Body|Arms/.test(nm)) o.material = M.shirt;
      else if (/Head_Skin/.test(nm)) o.material = M.skin;
      else if (/Eyebrows/.test(nm)) o.material = M.brows;
      else if (/Eyes/.test(nm)) o.material = M.eyes;
    });
    // Hår och skägg sitter på huvudbenet
    var head = model.getObjectByName('Head');
    function hair(file) {
      var h = gltf['p:' + file];
      if (!h || !head) return;
      var mesh = null; h.scene.traverse(function (o) { if (o.isMesh && !mesh) mesh = o; });
      var m = new THREE.Mesh(mesh.geometry, mat(ptex[/long|buns/.test(file) ? 'hair2' : 'hair1'], def.hair, { side: THREE.DoubleSide }));
      m.castShadow = true;
      head.add(m);
    }
    hair(HAIR[def.hairStyle] || (fem ? 'hair_long' : 'hair_simpleparted'));
    if (def.beard) hair('hair_beard');
    if (def.glasses) glasses(model, head);
    var mixer = new THREE.AnimationMixer(model), acts = {};
    g.animations.forEach(function (c) { acts[c.name] = mixer.clipAction(c); });
    acts.sitDown && (acts.sitDown.loop = THREE.LoopOnce);
    return { model: model, mixer: mixer, acts: acts, head: head, names: ANIM.real, real: true };
  }
  // Enkla glasögon framför ögonen, räknade fram i viloställningen och sedan fästa på huvudet
  function glasses(model, head) {
    var eyes = null; model.traverse(function (o) { if (/Eyes/.test(o.name) && o.isMesh) eyes = o; });
    if (!eyes || !head) return;
    model.updateMatrixWorld(true);
    eyes.geometry.computeBoundingBox();
    var bb = eyes.geometry.boundingBox.clone().applyMatrix4(eyes.matrixWorld), c = new THREE.Vector3(), sz = new THREE.Vector3();
    bb.getCenter(c); bb.getSize(sz);
    var frame = mat(null, 0x1d1d22, { roughness: 0.4, metalness: 0.3 }), g = new THREE.Group(), r = Math.max(0.018, sz.x * 0.22);
    [-1, 1].forEach(function (sd) {
      var rim = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.12, 6, 18), frame);
      rim.position.set(sd * sz.x * 0.27, 0, 0); g.add(rim);
      var arm = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.1), frame);
      arm.position.set(sd * (sz.x * 0.27 + r), 0, -0.05); g.add(arm);
    });
    var bridge = new THREE.Mesh(new THREE.BoxGeometry(sz.x * 0.54 - r * 2, 0.004, 0.004), frame); g.add(bridge);
    g.position.set(c.x, c.y, bb.max.z + 0.012);
    model.add(g);
    head.attach(g);
  }
  function kenneyPerson(f, n) {
    var g = gltf['c:' + CHARS[n]];
    if (!g) return null;
    var model = THREE.SkeletonUtils.clone(g.scene);
    model.scale.setScalar(CHAR_SCALE);
    model.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    var mixer = new THREE.AnimationMixer(model), acts = {};
    g.animations.forEach(function (c) { acts[c.name] = mixer.clipAction(c); });
    return { model: model, mixer: mixer, acts: acts, head: model.getObjectByName('head'), names: ANIM.kenney };
  }
  function swapPeople(w) {
    Object.keys(w.people || {}).forEach(function (n) {
      var f = w.people[n];
      if (f.k) return;
      var k = (realPeople() && realPerson(f, n)) || kenneyPerson(f, n);
      if (!k) return;
      var holder = new THREE.Group();
      holder.rotation.y = Math.PI;   // figurerna tittar åt +z, spelets kollegor åt -z
      holder.add(k.model);
      f.group.add(holder);
      f.J.hips.visible = false;
      k.holder = holder; k.cur = null; k.q = new THREE.Quaternion(); k.acc = 0;
      f.k = k;
      play(k, k.names[f.sitting ? 'sit' : 'idle'], 0);
    });
  }
  function play(k, name, fade) {
    if (k.cur === name || !k.acts[name]) return;
    var a = k.acts[name];
    a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.play();
    if (k.cur && k.acts[k.cur]) k.acts[k.cur].crossFadeTo(a, fade, false);
    k.cur = name;
  }
  var Y = new THREE.Vector3(0, 1, 0), qa = new THREE.Quaternion();
  var SIT_Y = 0, SIT_Z = 0;
  var origUpdate = NV.people.update;
  NV.people.update = function (list, dt, t, camPos, week, talkingTo) {
    origUpdate.apply(this, arguments);
    Object.keys(list).forEach(function (n) {
      var f = list[n], k = f.k;
      if (!k || !f.group.visible) return;
      // Långt bort uppdateras animationen mer sällan
      k.acc += dt;
      var d = Math.hypot(camPos.x - f.group.position.x, camPos.z - f.group.position.z);
      if (d > (NV.gfx.p ? NV.gfx.p.farAnim : 16) && k.acc < 0.12) return;
      var adt = k.acc; k.acc = 0;
      var talking = talkingTo === n, want;
      if (f.sitting) want = talking ? 'sitTalk' : 'sit';
      else if (f.speed > 0.05) want = 'walk';
      else if (f.gest > 0 && (f.gestKind === 'wave' || f.gestKind === 'cheer' || f.gestKind === 'shake' || f.gestKind === 'watch')) want = f.gestKind;
      else if (talking) want = 'talk';
      else want = 'idle';
      play(k, k.names[want], 0.3);
      var wa = k.acts[k.names.walk];
      if (want === 'walk' && wa) wa.timeScale = Math.max(0.5, f.speed / (k.real ? 0.9 : 0.6));
      // Sittande: Kenney-figurerna sjunker ner på stolen, Quaternius-figurernas animation sitter redan
      if (k.real) k.holder.position.set(0, f.sitting ? SIT_Y : 0, f.sitting ? SIT_Z : 0);
      else k.holder.position.set(0, f.sitting ? 0.44 : 0, f.sitting ? 0.06 : 0);
      // Huvudet följer spelaren. Förra vridningen tas bort innan animationen räknas fram.
      if (k.head) k.head.quaternion.multiply(qa.copy(k.q).invert());
      k.mixer.update(adt);
      if (k.head) { k.q.setFromAxisAngle(Y, (f.look || 0) * 0.7); k.head.quaternion.multiply(k.q); }
    });
  };

  // ------------------------------------------------------------------ Golv och himmel
  // Normal- och grovhetskartor delas av alla ytor med samma textur och får ytans upprepning
  var extra = {};
  function extraMap(file, t) {
    if (!file || !imgs[file]) return null;
    if (!extra[file]) { extra[file] = new THREE.Texture(imgs[file]); extra[file].wrapS = extra[file].wrapT = THREE.RepeatWrapping; extra[file].anisotropy = 4; extra[file].needsUpdate = true; }
    var m = extra[file].clone();
    m.repeat.copy(t.repeat); m.offset.copy(t.offset); m.needsUpdate = true;
    return m;
  }
  function applyTex(w) {
    Object.keys(TEX).forEach(function (name) {
      var cfg = TEX[name], img = imgs[cfg.file];
      if (!img) return;
      var base = NV.tex.get(name), src = base.source, k = cfg.k;
      if (base.userData.kenney) return;
      base.userData.kenney = true;
      base.image = img; base.needsUpdate = true;
      w.scene.traverse(function (o) {
        if (!o.material) return;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
          ['map', 'emissiveMap'].forEach(function (key) {
            var t = m[key];
            if (!t || t.source !== src) return;
            t.needsUpdate = true;
            if (k && k !== 1 && !t.userData.kScaled) { t.repeat.multiplyScalar(k); t.userData.kScaled = true; }
            if (key !== 'map') return;
            var nm = extraMap(cfg.n, t), rm = extraMap(cfg.r, t);
            if (nm && 'normalMap' in m) { m.normalMap = nm; m.normalScale = new THREE.Vector2(0.8, 0.8); }
            if (rm && 'roughnessMap' in m) { m.roughnessMap = rm; m.roughness = 1; }
            if (cfg.tint !== undefined) m.color.setHex(cfg.tint);
            m.needsUpdate = true;
          });
          if (name === 'sky' && m.emissiveIntensity) m.emissiveIntensity = 0.75;
        });
      });
    });
  }


  // ------------------------------------------------------------------ Allt på en gång
  function apply(w, early) {
    if (w.kenney || !ready) return;
    w.kenney = true;
    var kit = new THREE.Group();
    swapFurniture(w, kit);
    decor(w, kit);
    swapPeople(w);
    applyTex(w);
    if (w.P && w.P.lambert) { NV.gfx.cheapMaterials(kit); Object.keys(w.people).forEach(function (n) { if (w.people[n].k) NV.gfx.cheapMaterials(w.people[n].k.model); }); }
    // Byggs världen fortfarande slås modellerna ihop med resten, annars för sig
    if (!early) origMerge(kit, { keepSway: w.P && w.P.sway });
    w.scene.add(kit);
    w.kit = kit;
    if (w.renderer) w.renderer.shadowMap.needsUpdate = true;
  }

  var origMerge = NV.gfx.mergeStatic;
  NV.gfx.mergeStatic = function (scene) {
    if (building && scene === building.scene && ready) apply(building, true);
    return origMerge.apply(this, arguments);
  };
  var WP = NV.World.prototype, origInit = WP.init;
  WP.init = function () {
    var on = enabled();
    if (on) { load(); building = this; }
    try { origInit.apply(this, arguments); } finally { building = null; }
    var self = this;
    if (on && !this.kenney) promise.then(function () { apply(self, false); });
  };

  // ------------------------------------------------------------------ Fotsteg
  var steps = {}, stepsLoading = false;
  function loadSteps(ctx) {
    stepsLoading = true;
    if (location.protocol === 'file:') return;
    ['carpet', 'concrete', 'wood'].forEach(function (s) {
      steps[s] = [];
      for (var i = 0; i < 5; i++) {
        fetch(BASE + 'sfx/footstep_' + s + '_' + i + '.ogg').then(function (r) { if (!r.ok) throw new Error('saknas'); return r.arrayBuffer(); })
          .then(function (ab) { return new Promise(function (res, rej) { ctx.decodeAudioData(ab, res, rej); }); })
          .then(function (buf) { steps[s].push(buf); }, function () { /* syntetiskt ljud används */ });
      }
    });
  }
  var origStep = NV.sfx.step, lastStep = -1;
  NV.sfx.step = function (surface) {
    if (NV.settings.get('realSteps') !== false) {
      var ctx = NV.sfx.context();
      if (ctx && !stepsLoading) loadSteps(ctx);
      var key = surface === 'metal' ? 'concrete' : (steps[surface] ? surface : 'carpet'), list = steps[key];
      if (ctx && list && list.length) {
        var i = Math.floor(Math.random() * list.length);
        if (i === lastStep && list.length > 1) i = (i + 1) % list.length;
        lastStep = i;
        var vol = { carpet: 0.55, wood: 0.4, concrete: 0.4 }[key];
        NV.sfx.sample(list[i], vol, (surface === 'metal' ? 1.3 : 1) * (0.92 + Math.random() * 0.16));
        return;
      }
    }
    return origStep.apply(this, arguments);
  };

  return { load: load, ready: function () { return ready; }, CHARS: CHARS, steps: steps };
})();
