// Procedurella texturer och material. Allt ritas på canvas så att spelet klarar sig utan bildfiler.
NV.tex = (function () {
  var cache = {};

  function canvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function rnd(seed) {
    var s = seed || 1;
    return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }
  function toTex(c, repeat, srgb) {
    var t = new THREE.CanvasTexture(c);
    if (srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    t.anisotropy = 4;
    return t;
  }

  function carpet() {
    var c = canvas(256, 256), g = c.getContext('2d'), r = rnd(7);
    g.fillStyle = '#4b5361'; g.fillRect(0, 0, 256, 256);
    for (var i = 0; i < 9000; i++) {
      var v = 60 + Math.floor(r() * 40);
      g.fillStyle = 'rgba(' + v + ',' + (v + 8) + ',' + (v + 22) + ',0.55)';
      g.fillRect(r() * 256, r() * 256, 1.4, 1.4);
    }
    g.strokeStyle = 'rgba(30,34,42,0.35)'; g.lineWidth = 2;
    g.strokeRect(0, 0, 256, 256);
    return c;
  }
  function wood() {
    var c = canvas(512, 512), g = c.getContext('2d'), r = rnd(3);
    for (var row = 0; row < 8; row++) {
      var off = (row % 2) * 180;
      for (var k = -1; k < 3; k++) {
        var base = 170 + Math.floor(r() * 30);
        g.fillStyle = 'rgb(' + base + ',' + Math.floor(base * 0.78) + ',' + Math.floor(base * 0.55) + ')';
        g.fillRect(k * 360 + off, row * 64, 358, 62);
        for (var s = 0; s < 40; s++) {
          g.strokeStyle = 'rgba(90,60,30,' + (0.05 + r() * 0.08) + ')';
          g.beginPath();
          var y = row * 64 + r() * 62;
          g.moveTo(k * 360 + off, y);
          g.bezierCurveTo(k * 360 + off + 120, y + r() * 6 - 3, k * 360 + off + 240, y + r() * 6 - 3, k * 360 + off + 358, y);
          g.stroke();
        }
      }
      g.fillStyle = 'rgba(60,40,20,0.5)'; g.fillRect(0, row * 64 + 62, 512, 2);
    }
    return c;
  }
  function concrete(seed, base) {
    var c = canvas(512, 512), g = c.getContext('2d'), r = rnd(seed || 11);
    g.fillStyle = base || '#9a9a95'; g.fillRect(0, 0, 512, 512);
    for (var i = 0; i < 180; i++) {
      var x = r() * 512, y = r() * 512, rad = 20 + r() * 80;
      var gr = g.createRadialGradient(x, y, 0, x, y, rad);
      var a = r() * 0.08;
      gr.addColorStop(0, r() > 0.5 ? 'rgba(255,255,255,' + a + ')' : 'rgba(0,0,0,' + a + ')');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (var j = 0; j < 4000; j++) { g.fillStyle = 'rgba(0,0,0,' + r() * 0.12 + ')'; g.fillRect(r() * 512, r() * 512, 1, 1); }
    g.strokeStyle = 'rgba(40,40,40,0.35)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 256); g.lineTo(512, 256); g.moveTo(256, 0); g.lineTo(256, 512); g.stroke();
    return c;
  }
  function raisedFloor() {
    var c = canvas(256, 256), g = c.getContext('2d'), r = rnd(5);
    g.fillStyle = '#c9ccd0'; g.fillRect(0, 0, 256, 256);
    for (var i = 0; i < 2000; i++) { g.fillStyle = 'rgba(0,0,0,' + r() * 0.06 + ')'; g.fillRect(r() * 256, r() * 256, 2, 2); }
    g.strokeStyle = '#8d9196'; g.lineWidth = 3; g.strokeRect(1, 1, 254, 254);
    return c;
  }
  function ceiling() {
    var c = canvas(256, 256), g = c.getContext('2d'), r = rnd(9);
    g.fillStyle = '#eceae4'; g.fillRect(0, 0, 256, 256);
    for (var i = 0; i < 3000; i++) { g.fillStyle = 'rgba(0,0,0,' + r() * 0.07 + ')'; g.fillRect(r() * 256, r() * 256, 1.5, 1.5); }
    g.strokeStyle = '#b9b6ae'; g.lineWidth = 4; g.strokeRect(0, 0, 256, 256);
    return c;
  }
  function wall(color) {
    var c = canvas(256, 256), g = c.getContext('2d'), r = rnd(13);
    g.fillStyle = color || '#e8e5de'; g.fillRect(0, 0, 256, 256);
    for (var i = 0; i < 5000; i++) { g.fillStyle = 'rgba(0,0,0,' + r() * 0.025 + ')'; g.fillRect(r() * 256, r() * 256, 2, 2); }
    return c;
  }
  function fabric(color) {
    var c = canvas(128, 128), g = c.getContext('2d'), r = rnd(21);
    g.fillStyle = color; g.fillRect(0, 0, 128, 128);
    for (var y = 0; y < 128; y += 2) { g.fillStyle = 'rgba(0,0,0,' + (0.03 + r() * 0.05) + ')'; g.fillRect(0, y, 128, 1); }
    for (var x = 0; x < 128; x += 2) { g.fillStyle = 'rgba(255,255,255,' + (0.02 + r() * 0.03) + ')'; g.fillRect(x, 0, 1, 128); }
    return c;
  }
  function perforated() {
    var c = canvas(128, 128), g = c.getContext('2d');
    g.fillStyle = '#1b1d21'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#050607';
    for (var y = 4; y < 128; y += 8) for (var x = 4 + (y / 8 % 2) * 4; x < 128; x += 8) { g.beginPath(); g.arc(x, y, 2.2, 0, Math.PI * 2); g.fill(); }
    return c;
  }
  function sky() {
    var c = canvas(256, 256), g = c.getContext('2d');
    var gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#9cc3e6'); gr.addColorStop(0.6, '#d6e6f2'); gr.addColorStop(0.62, '#8aa07a'); gr.addColorStop(1, '#5f7355');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(80,90,100,0.55)';
    for (var i = 0; i < 12; i++) { var h = 20 + (i * 37 % 50); g.fillRect(i * 22, 158 - h, 18, h); }
    return c;
  }

  function get(name) {
    if (cache[name]) return cache[name];
    var t;
    switch (name) {
      case 'carpet': t = toTex(carpet(), [1, 1]); break;
      case 'wood': t = toTex(wood(), [1, 1]); break;
      case 'concrete': t = toTex(concrete(11), [1, 1]); break;
      case 'concreteDark': t = toTex(concrete(17, '#7d7f80'), [1, 1]); break;
      case 'raised': t = toTex(raisedFloor(), [1, 1]); break;
      case 'ceiling': t = toTex(ceiling(), [1, 1]); break;
      case 'wall': t = toTex(wall(), [1, 1]); break;
      case 'wallTeal': t = toTex(wall('#3c7478'), [1, 1]); break;
      case 'wallWarm': t = toTex(wall('#d9c8ae'), [1, 1]); break;
      case 'fabricGray': t = toTex(fabric('#5a5f68'), [2, 2]); break;
      case 'fabricBlue': t = toTex(fabric('#34506e'), [2, 2]); break;
      case 'fabricMustard': t = toTex(fabric('#b8872e'), [2, 2]); break;
      case 'perforated': t = toTex(perforated(), [4, 20]); break;
      case 'sky': t = toTex(sky()); break;
    }
    cache[name] = t;
    return t;
  }
  // Material med upprepad textur skalad efter ytans storlek
  function mat(name, opts, repeatW, repeatH) {
    opts = opts || {};
    var base = get(name);
    var t = base.clone();
    t.needsUpdate = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatW || 1, repeatH || 1);
    var m = new THREE.MeshStandardMaterial({ map: t, roughness: opts.roughness !== undefined ? opts.roughness : 0.85, metalness: opts.metalness || 0 });
    if (opts.color) m.color = new THREE.Color(opts.color);
    m.userData.tex = name;
    return m;
  }

  // Textetikett som sprite
  function label(text, opts) {
    opts = opts || {};
    var fs = opts.size || 42;
    var c = canvas(10, 10), g = c.getContext('2d');
    g.font = (opts.weight || '600') + ' ' + fs + 'px "Segoe UI", system-ui, sans-serif';
    var w = Math.ceil(g.measureText(text).width) + 36;
    c.width = w; c.height = fs + 26;
    g = c.getContext('2d');
    g.font = (opts.weight || '600') + ' ' + fs + 'px "Segoe UI", system-ui, sans-serif';
    var bg = opts.bg || 'rgba(20,24,32,0.78)';
    g.fillStyle = bg;
    roundRect(g, 0, 0, c.width, c.height, 14); g.fill();
    g.fillStyle = opts.color || '#ffffff';
    g.textBaseline = 'middle';
    g.fillText(text, 18, c.height / 2 + 2);
    var t = toTex(c);
    var sm = new THREE.SpriteMaterial({ map: t, depthTest: opts.depthTest !== false, transparent: true });
    var s = new THREE.Sprite(sm);
    var h = opts.height || 0.12;
    s.scale.set(h * c.width / c.height, h, 1);
    return s;
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }

  return { canvas: canvas, toTex: toTex, get: get, mat: mat, label: label, roundRect: roundRect, rnd: rnd };
})();
