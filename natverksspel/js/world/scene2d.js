// 2D-världens miljö: väggar, fönster, träd, utomhusföremål, vatten, ljus, skuggor,
// partiklar, skyltar och efterbehandling. Bygger på NV.art2d och NV.World2D.
(function () {
  var W = NV.World2D.prototype, K = NV.World2D.K, A2 = NV.art2d;
  var PPM = K.PPM, ZS = K.ZS, HS = K.HS, WALL_H = K.WALL_H, SITES = K.SITES;
  var cv = A2.cv, css = A2.css, tone = A2.tone, P = A2.P, hash2 = A2.hash2;
  function R(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function silhouette(c, col) {
    var s = cv(c.width, c.height), g = s.getContext('2d');
    g.drawImage(c, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col || 'rgb(18,20,58)'; g.fillRect(0, 0, s.width, s.height);
    return s;
  }
  var BRICK = ['#9c4a32', '#b0573a', '#a24f36', '#c0674a', '#8e422c', '#b75e40'];

  // ------------------------------------------------------------------ Väggar
  W.paintWall = function (g, Wd, Dp, Hp, col, r, glass, seg0) {
    var y0 = Dp, x, y;
    if (glass) {
      // Glasvägg: blå ton, reflexer som lutar och smala karmar
      var gr = g.createLinearGradient(0, y0, 0, y0 + Hp);
      gr.addColorStop(0, '#cfeefa'); gr.addColorStop(0.5, '#9fd0e3'); gr.addColorStop(1, '#7fb4cc');
      g.fillStyle = gr; g.fillRect(0, y0, Wd, Hp);
      g.fillStyle = 'rgba(255,255,255,0.55)';
      for (var k = 6; k < Wd; k += 29) for (y = 0; y < Hp - 4; y++) g.fillRect(k + Math.floor(y / 3), y0 + 2 + y, 2, 1);
      g.fillStyle = '#3a4048'; g.fillRect(0, y0, Wd, 2); g.fillRect(0, y0 + Hp - 2, Wd, 2);
      for (x = 0; x < Wd; x += 29) g.fillRect(x, y0, 1, Hp);
      g.fillStyle = '#6b7480'; g.fillRect(0, y0, Wd, 1);
      return;
    }
    var ext = r.axis === 'x' && (r.fixed === -10 || r.fixed === -12);
    // Väggkrön
    g.fillStyle = '#3a2a1f'; g.fillRect(0, 0, Wd, Dp); g.fillStyle = '#6b5040'; g.fillRect(0, 0, Wd, 1);
    if (ext && r.tex === 'concreteDark') {
      // Lagrets plåtfasad: korrugerad plåt med rostränder och betongsockel
      var rib = ['#7d848c', '#9aa1a8', '#b4bac0', '#8a9097'];
      for (x = 0; x < Wd; x++) {
        var base = rib[(x + seg0 * 7 | 0) % 4];
        g.fillStyle = base; g.fillRect(x, y0, 1, Hp);
        if (hash2(x + (seg0 | 0) * 31, 1, 5) < 0.05) { g.fillStyle = 'rgba(140,70,30,0.35)'; g.fillRect(x, y0 + 4, 1, 6 + Math.floor(hash2(x, 2, 5) * 10)); }
      }
      g.fillStyle = '#d7dbe0'; g.fillRect(0, y0, Wd, 2); g.fillStyle = '#5c6168'; g.fillRect(0, y0 + 2, Wd, 1);
      g.fillStyle = '#8b877f'; g.fillRect(0, y0 + Hp - 5, Wd, 5); g.fillStyle = '#a5a197'; g.fillRect(0, y0 + Hp - 5, Wd, 1);
    } else if (ext) {
      // Tegelfasad: stenar i förband med fogar, sockel och en ljus list upptill
      for (y = 0; y < Hp - 5; y++) {
        var row = Math.floor(y / 4), inRow = y % 4, off = (row % 2) * 4;
        for (x = 0; x < Wd; x++) {
          var bx = Math.floor((x + off + (seg0 * PPM | 0)) / 8), inB = (x + off + (seg0 * PPM | 0)) % 8;
          var c;
          if (inRow === 3 || inB === 7) c = '#d4c4aa';
          else {
            c = BRICK[Math.floor(hash2(bx, row, 9) * BRICK.length)];
            if (inRow === 0) c = tone(c, 0.12); else if (inRow === 2 && inB > 4) c = tone(c, -0.12);
          }
          g.fillStyle = c; g.fillRect(x, y0 + y, 1, 1);
        }
      }
      g.fillStyle = '#e8e2d4'; g.fillRect(0, y0, Wd, 2); g.fillStyle = '#b6ad9c'; g.fillRect(0, y0 + 2, Wd, 1);
      g.fillStyle = '#7a7670'; g.fillRect(0, y0 + Hp - 5, Wd, 5); g.fillStyle = '#9c978f'; g.fillRect(0, y0 + Hp - 5, Wd, 1);
      g.fillStyle = 'rgba(0,0,40,0.18)'; g.fillRect(0, y0 + Hp - 6, Wd, 1);
    } else {
      // Innervägg: tapet med svaga ränder, bröstlist, golvlist och ibland en tavla
      var face = A2.rgbOf(col);
      for (y = 0; y < Hp; y++) for (x = 0; x < Wd; x++) {
        var v = (x % 6 === 0 ? -0.05 : 0) + (hash2(x, y, 4) - 0.5) * 0.05 - (y / Hp) * 0.12 + A2.bayer(x, y) * 0.04;
        g.fillStyle = css(A2.mix(face, v < 0 ? [20, 24, 60] : [255, 250, 225], Math.abs(v)));
        g.fillRect(x, y0 + y, 1, 1);
      }
      var rail = y0 + Math.round(Hp * 0.55);
      g.fillStyle = tone(col, -0.2); g.fillRect(0, rail, Wd, 1); g.fillStyle = tone(col, 0.25); g.fillRect(0, rail - 1, Wd, 1);
      g.fillStyle = '#5a4232'; g.fillRect(0, y0 + Hp - 3, Wd, 3); g.fillStyle = '#7d5c45'; g.fillRect(0, y0 + Hp - 3, Wd, 1);
      g.fillStyle = tone(col, 0.3); g.fillRect(0, y0, Wd, 1);
      // Tavlor
      if (r.axis === 'x' && Wd > 60) {
        for (x = 18; x < Wd - 24; x += 70) {
          if (hash2(x, seg0 * 10 | 0, 13) < 0.45) continue;
          var px = x, py = y0 + 3, pw = 14, ph = 9;
          g.fillStyle = '#4a3020'; g.fillRect(px - 1, py - 1, pw + 2, ph + 2);
          var kind = Math.floor(hash2(x, 3, 17) * 3);
          var sky = ['#8fd0f5', '#f7b37a', '#b8d8f0'][kind];
          g.fillStyle = sky; g.fillRect(px, py, pw, ph);
          g.fillStyle = ['#4a8a3a', '#c05a3a', '#3a6a8a'][kind]; g.fillRect(px, py + 5, pw, 4);
          g.fillStyle = kind === 1 ? '#ffe28a' : '#ffffff'; g.fillRect(px + 9, py + 1, 2, 2);
          g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(px, py + ph + 1, pw + 1, 1);
        }
      }
    }
  };
  W.paintWallTop = function (g, Wd, Dp, Hp, col, glass) {
    if (glass) { g.fillStyle = '#9fd0e3'; g.fillRect(0, 0, Wd, Dp); g.fillStyle = '#d8f1fb'; g.fillRect(0, 0, 1, Dp); return; }
    g.fillStyle = '#4a3526'; g.fillRect(0, 0, Wd, Dp);
    g.fillStyle = '#6b5040'; g.fillRect(0, 0, 1, Dp);
    g.fillStyle = '#2e2018'; g.fillRect(Wd - 1, 0, 1, Dp);
  };

  // ------------------------------------------------------------------ Fönster
  W.addWindow = function (r) {
    var inside = r.z > 0;
    var ww = Math.round(r.w * PPM * 0.8), wh = Math.round(WALL_H * PPM * HS * 0.68);
    var c = cv(ww + 2, wh + 6), g = c.getContext('2d');
    var x, y;
    // Karm med skuggning
    g.fillStyle = inside ? '#f2efe6' : '#e9e6dc'; g.fillRect(0, 0, ww + 2, wh + 2);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, ww + 2, 1);
    g.fillStyle = '#c9c4b8'; g.fillRect(ww + 1, 0, 1, wh + 2);
    // Glaset: himmel, trädrad och gräs när du tittar ut; mörkare med varm glöd inifrån när du står ute
    for (y = 0; y < wh - 2; y++) for (x = 0; x < ww - 2; x++) {
      var col;
      var k = y / (wh - 2);
      if (inside) {
        var tl = 0.55 + Math.sin(x * 0.35 + r.x) * 0.06 + (A2.vnoise(x / 4, 3, r.x | 0) - 0.5) * 0.18;
        if (k < tl) col = css(A2.mix([143, 208, 245], [224, 243, 252], k / tl));
        else if (k < tl + 0.14) col = css(A2.pick(P.leafGreen, 0.25 + A2.vnoise(x / 2, y / 2, 5) * 0.5, x, y));
        else col = css(A2.pick(P.grass, 0.55 + hash2(x, y, 3) * 0.2, x, y));
      } else {
        col = css(A2.mix([70, 100, 130], [240, 200, 140], clamp(k * 1.2 - 0.2, 0, 1)));
        if (k > 0.72) col = css(A2.mix([200, 160, 110], [120, 90, 70], (k - 0.72) * 3));
      }
      g.fillStyle = col; g.fillRect(2 + x, 2 + y, 1, 1);
    }
    // Reflexer
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (y = 0; y < wh - 4; y++) { g.fillRect(4 + Math.floor(y * 0.6), 3 + y, 2, 1); g.fillRect(ww * 0.62 + Math.floor(y * 0.6), 3 + y, 1, 1); }
    // Spröjs
    g.fillStyle = inside ? '#f2efe6' : '#e9e6dc'; g.fillRect(Math.round(ww / 2), 0, 2, wh + 2);
    g.fillStyle = '#c9c4b8'; g.fillRect(Math.round(ww / 2) + 1, 2, 1, wh);
    // Gardiner inne, blomlåda ute
    if (inside) {
      var cur = ['#d9c9a8', '#b8cfd8', '#e0b8b0'][Math.abs(Math.round(r.x)) % 3];
      for (y = 0; y < wh; y++) {
        var cw2 = 4 + (y > wh * 0.6 ? 1 : 0);
        for (x = 0; x < cw2; x++) { g.fillStyle = x % 2 ? tone(cur, -0.15) : cur; g.fillRect(x, y, 1, 1); g.fillRect(ww + 1 - x, y, 1, 1); }
      }
      g.fillStyle = '#8a8378'; g.fillRect(0, 0, ww + 2, 1);
    } else {
      g.fillStyle = '#6b4a30'; g.fillRect(-0, wh + 1, ww + 2, 4); g.fillStyle = '#8b6440'; g.fillRect(0, wh + 1, ww + 2, 1);
      var FL = ['#ff5a78', '#ffd23f', '#ffffff', '#b98cff'];
      for (x = 2; x < ww; x += 3) { g.fillStyle = css(P.leafGreen[3]); g.fillRect(x, wh, 2, 2); g.fillStyle = FL[(x + Math.round(r.x)) % 4]; g.fillRect(x, wh - 1, 2, 1); }
    }
    // Fönsterbräda
    g.fillStyle = '#ffffff'; g.fillRect(0, wh + 1, ww + 2, 1); g.fillStyle = 'rgba(0,0,40,0.25)'; g.fillRect(0, wh + 2, ww + 2, 1);
    var cvs = A2.selout(c, 0.4);
    if (inside) {
      var wallZ = r.z - 0.08;
      this.addSprite(cvs, r.x - r.w * 0.4, wallZ - 0.1, { y: 0.3, key: wallZ - 0.09, noShadow: true, emit: { win: true, x: r.x, z: r.z, w: r.w } });
    } else {
      this.addSprite(cvs, r.x - r.w * 0.4, -10.09, { y: 0.3, key: -10.1, noShadow: true, emit: { winOut: true, x: r.x, z: r.z, w: r.w } });
    }
  };

  // ------------------------------------------------------------------ Växter, bilar och fordon
  var TREEK = {};
  W.addTree = function (x, z, seed, kind) {
    if (!kind) {
      if (x > 50) kind = ['pine', 'autumn', 'oak', 'pine'][seed % 4];
      else kind = (x < -16 && z < 8) || seed % 4 === 0 ? 'cherry' : (seed % 5 === 3 ? 'pine' : 'oak');
    }
    var key = kind + seed;
    var frames = TREEK[key] || (TREEK[key] = [A2.tree(kind, seed, -1), A2.tree(kind, seed, 0), A2.tree(kind, seed, 1)]);
    var pine = kind === 'pine';
    this.addSprite(frames[1], x, z, { ox: pine ? 25 : 37, oy: pine ? 84 : 90, frames: frames, key: z, kind: kind, shadow: { rx: pine ? 0.9 : 1.35, rz: pine ? 0.45 : 0.6, dx: 0.35 } });
    this.builder.colliders.push({ minX: x - 0.25, maxX: x + 0.25, minZ: z - 0.1, maxZ: z + 0.3 });
    this.trees = this.trees || [];
    this.trees.push({ x: x, z: z, kind: kind });
  };
  W.addBush = function (x, z, seed) {
    var c = A2.bush(seed, seed % 2 ? true : (seed % 3 === 0 ? ['#ffffff', '#fff1a8'] : false));
    this.addSprite(c, x, z, { ox: 17, oy: 22, key: z, shadow: { rx: 0.7, rz: 0.3, dx: 0.2 }, sway: seed + 1 });
  };
  W.addPlant = function (x, z, s) {
    s = s || 1;
    var w = Math.round(24 * s), h = Math.round(32 * s);
    var c = cv(w, h), g = c.getContext('2d');
    // Kruka med skuggning och jordkant
    var px = Math.round(w / 2 - 5 * s), pw = Math.round(10 * s), ph = Math.round(9 * s);
    for (var y = 0; y < ph; y++) for (var xx = 0; xx < pw; xx++) {
      var v = 0.6 - xx / pw * 0.35 - y / ph * 0.15 + (xx === 1 ? 0.2 : 0);
      g.fillStyle = css(A2.mix([214, 120, 80], v > 0.5 ? [255, 230, 200] : [60, 30, 40], Math.abs(v - 0.5)));
      g.fillRect(px + xx, h - ph + y, 1, 1);
    }
    g.fillStyle = '#5a3a23'; g.fillRect(px, h - ph, pw, 1); g.fillStyle = '#e8a080'; g.fillRect(px - 1, h - ph + 1, pw + 2, 1);
    // Blad som små klungor, några långa blad som hänger ut
    var seed = Math.round(x * 13 + z * 7) + 5, rr = A2.rng(seed);
    var bl = [];
    for (var i = 0; i < 6; i++) bl.push([w / 2 + (rr() - 0.5) * 12 * s, h - ph - 6 * s - rr() * 9 * s, (3 + rr() * 3) * s]);
    A2.canopy(g, w / 2, h - 16 * s, bl, P.leafGreen, seed);
    g.fillStyle = css(P.leafGreen[4]);
    for (var j = 0; j < 4; j++) { var lx = w / 2 + (rr() - 0.5) * 16 * s, ly = h - ph - 2; g.fillRect(lx, ly - 3, 1, 3); g.fillRect(lx + (lx < w / 2 ? -1 : 1), ly - 4, 1, 1); }
    this.addSprite(A2.selout(c, 0.35), x - w / PPM / 2, z - 0.15, { key: z - 0.15 });
  };
  W.addCar = function (x, z, color, text) {
    var c = cv(50, 42), g = c.getContext('2d'), col = K.hex(color);
    function p(x0, y0, w0, h0, cc) { g.fillStyle = cc; g.fillRect(x0, y0, w0, h0); }
    // Hjul som sticker fram
    p(3, 30, 8, 9, '#18181b'); p(39, 30, 8, 9, '#18181b'); p(4, 31, 2, 6, '#3a3a40'); p(40, 31, 2, 6, '#3a3a40');
    // Kaross: bakdel, tak, vindruta, motorhuv och front
    p(3, 3, 44, 32, col);
    p(3, 3, 44, 2, tone(col, 0.25)); p(3, 3, 2, 30, tone(col, 0.12)); p(45, 3, 2, 30, tone(col, -0.25));
    p(7, 5, 36, 5, '#23303c'); p(8, 5, 8, 1, 'rgba(255,255,255,0.5)');           // bakruta
    p(6, 10, 38, 7, tone(col, 0.18)); p(6, 10, 38, 1, tone(col, 0.35));           // tak
    for (var y = 0; y < 8; y++) { g.fillStyle = css(A2.mix([150, 205, 235], [60, 100, 140], y / 8)); g.fillRect(6 + (y < 2 ? 1 : 0), 17 + y, 38 - (y < 2 ? 2 : 0), 1); }
    for (var k = 0; k < 6; k++) p(12 + k, 18 + k, 3, 1, 'rgba(255,255,255,0.6)');   // reflex i vindrutan
    p(4, 25, 42, 6, col); p(4, 25, 42, 1, tone(col, 0.3)); p(22, 26, 6, 4, tone(col, 0.1));  // motorhuv
    p(3, 31, 44, 5, tone(col, -0.35));                                           // front
    p(5, 32, 7, 3, '#fff2b8'); p(38, 32, 7, 3, '#fff2b8'); p(6, 32, 3, 1, '#ffffff'); p(39, 32, 3, 1, '#ffffff');
    p(14, 33, 22, 2, '#1d1f24'); p(19, 36, 12, 4, '#f4f4f0'); p(20, 37, 10, 1, '#3a3a50');   // grill och nummerskylt
    p(1, 18, 3, 3, col); p(46, 18, 3, 3, tone(col, -0.2));                      // backspeglar
    if (text) { p(13, 13, 24, 3, '#ffffff'); p(15, 14, 20, 1, col); }
    this.addSprite(A2.selout(c, 0.35), x, z, { ox: 25, oy: 42, key: z, shadow: { rx: 1.1, rz: 0.55, dx: 0.3 } });
    (this.cars = this.cars || []).push({ x: x, z: z });
    this.builder.colliders.push({ minX: x - 0.95, maxX: x + 0.95, minZ: z - 0.1, maxZ: z + 1.5 });
  };
  W.addTruck = function (x, z) {
    // Truck med mast, gafflar, förarskydd och varningslampa
    var c = cv(40, 48), g = c.getContext('2d');
    function p(x0, y0, w0, h0, cc) { g.fillStyle = cc; g.fillRect(x0, y0, w0, h0); }
    p(4, 40, 8, 7, '#18181b'); p(28, 40, 8, 7, '#18181b');
    p(2, 18, 36, 24, '#f0b83a'); p(2, 18, 36, 2, '#ffd978'); p(2, 18, 2, 24, '#ffd060'); p(36, 18, 2, 24, '#c48a1a');
    p(10, 22, 20, 10, '#2b2d31'); p(12, 24, 16, 5, '#4a4d55');                 // säte
    p(6, 2, 2, 20, '#3a3d44'); p(32, 2, 2, 20, '#3a3d44'); p(6, 2, 28, 2, '#3a3d44'); p(6, 2, 28, 1, '#5a5e66');  // förarskydd
    p(18, 0, 4, 2, '#ff9a1a'); p(19, 0, 2, 1, '#ffe0a0');                     // varningslampa
    p(2, 42, 36, 3, '#2b2d31');                                                 // mast
    p(8, 45, 3, 3, '#8f949c'); p(29, 45, 3, 3, '#8f949c');                     // gafflar
    p(4, 34, 32, 2, '#1d1f24'); p(14, 36, 12, 3, '#1d1f24');
    for (var i = 0; i < 6; i++) p(4 + i * 6, 34, 3, 2, i % 2 ? '#1d1f24' : '#ffd23f');
    this.addSprite(A2.selout(c, 0.35), x - 0.8, z - 0.45, { key: z - 0.45, shadow: { rx: 0.9, rz: 0.45, dx: 0.3 } });
  };

  // Skrivbord med björkskiva, metallben och saker på bordet (tangentbord, mugg, papper, växt)
  W.addDesk = function (r) {
    var rot = Math.abs(Math.sin(r.ry || 0)) > 0.5;
    var w = rot ? 0.8 : 1.6, d = rot ? 1.6 : 0.8;
    var def = (r.color === undefined || r.color === 0xf1efe9);
    var top = def ? '#dcc39a' : K.hex(r.color);
    var rr = A2.rng(Math.round(r.x * 31 + r.z * 17) + 3);
    var c = K.boxSprite(w, d, 0.74, top, tone(top, -0.3), { fn: function (g, Wd, Dp, Hp) {
      // Ådring i skivan
      for (var y = 1; y < Dp - 1; y += 2) { g.fillStyle = 'rgba(120,80,40,' + (0.06 + rr() * 0.06) + ')'; g.fillRect(1 + Math.floor(rr() * 6), y, Wd - 8 - Math.floor(rr() * 6), 1); }
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, 0, Wd, 1);
      g.fillStyle = tone(top, -0.15); g.fillRect(0, Dp - 1, Wd, 1);
      // Benutrymme och ben
      g.clearRect(3, Dp + 3, Wd - 6, Hp - 3);
      g.fillStyle = 'rgba(16,20,60,0.2)'; g.fillRect(3, Dp + 3, Wd - 6, Hp - 3);
      g.fillStyle = '#5a5f68'; g.fillRect(1, Dp, 2, Hp); g.fillRect(Wd - 3, Dp, 2, Hp);
      g.fillStyle = '#8a9099'; g.fillRect(1, Dp, 1, Hp); g.fillRect(Wd - 3, Dp, 1, Hp);
      if (!rot && Wd > 30) {
        // Saker på bordet
        var kx = Math.round(Wd / 2 - 6);
        g.fillStyle = '#2b2d31'; g.fillRect(kx, Dp - 6, 12, 3); g.fillStyle = '#4a4d55'; for (var k = 0; k < 5; k++) g.fillRect(kx + 1 + k * 2, Dp - 5, 1, 1);
        g.fillStyle = '#3a3d42'; g.fillRect(kx + 14, Dp - 5, 2, 2);
        if (rr() < 0.7) { var mx = 3 + Math.floor(rr() * 6); g.fillStyle = ['#ffffff', '#d64b3a', '#2f6fb0', '#f0b429'][Math.floor(rr() * 4)]; g.fillRect(mx, Dp - 7, 3, 3); g.fillStyle = '#5a3a23'; g.fillRect(mx, Dp - 7, 3, 1); g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(mx + 3, Dp - 5, 1, 1); }
        if (rr() < 0.6) { var px = Wd - 12 - Math.floor(rr() * 4); g.fillStyle = '#f4f2ea'; g.fillRect(px, Dp - 9, 7, 5); g.fillStyle = '#c9c4b8'; g.fillRect(px + 1, Dp - 8, 5, 1); g.fillRect(px + 1, Dp - 6, 4, 1); }
        if (rr() < 0.35) { g.fillStyle = '#ffe14a'; g.fillRect(Wd - 6, Dp - 12, 3, 3); }
        if (rr() < 0.3) { g.fillStyle = '#c9744a'; g.fillRect(4, Dp - 12, 3, 3); g.fillStyle = css(P.leafGreen[4]); g.fillRect(3, Dp - 15, 5, 3); g.fillStyle = css(P.leafGreen[6]); g.fillRect(4, Dp - 15, 2, 1); }
      }
    } });
    this.addSprite(c, r.x - w / 2, r.z - d / 2, { key: r.z - d / 2 });
    if (r.pc) this.addSprite(null, r.x - 0.2, r.z + 0.05, { y: 0.74, key: r.z - d / 2 + 0.001, dyn: { pc: r.pc } });
    if (r.laptop) this.addSprite(null, r.x - 0.2, r.z, { y: 0.74, key: r.z - d / 2 + 0.001, dyn: { laptop: true } });
  };

  // Kontorsstol: rundad rygg med ljuskant, sits, gaskolv och femarmad fot med hjul
  W.addChair = function (r) {
    var col = K.hex(r.color || 0x30343b);
    var c = cv(16, 20), g = c.getContext('2d');
    function p(x, y, w, h, cc) { g.fillStyle = cc; g.fillRect(x, y, w, h); }
    p(3, 1, 10, 8, col); p(2, 2, 12, 6, col); p(3, 1, 10, 1, tone(col, 0.35)); p(3, 2, 2, 5, tone(col, 0.18)); p(12, 2, 2, 6, tone(col, -0.3));
    p(6, 3, 4, 1, tone(col, 0.1));
    p(2, 9, 12, 4, tone(col, -0.12)); p(2, 9, 12, 1, tone(col, 0.2)); p(12, 10, 2, 3, tone(col, -0.35));
    p(7, 13, 2, 3, '#6a6f78'); p(7, 13, 1, 3, '#9aa0a8');
    p(2, 16, 12, 1, '#2b2d31'); p(4, 17, 8, 1, '#2b2d31');
    p(1, 17, 2, 2, '#18181b'); p(13, 17, 2, 2, '#18181b'); p(7, 18, 2, 2, '#18181b');
    this.addSprite(A2.selout(c, 0.35), r.x - 0.3, r.z - 0.2, { key: r.z - 0.21 });
  };

  // ------------------------------------------------------------------ Utomhusmiljö
  var ORIG_BUILD = W.buildSprites;
  W.buildSprites = function () {
    ORIG_BUILD.call(this);
    try { this.addScenery(); } catch (e) { if (window.console) console.error('2D: utomhusmiljön kunde inte byggas', e); }
    // Entrédörrarna glider isär när du närmar dig
    var self = this;
    this.sprites.forEach(function (s) {
      if (!s.c || s.x !== 9.5 || s.z !== -10.08) return;
      var c = s.c, hw = Math.floor(c.width / 2);
      var L = cv(hw, c.height), Rr = cv(c.width - hw, c.height);
      L.getContext('2d').drawImage(c, 0, 0); Rr.getContext('2d').drawImage(c, -hw, 0);
      self.doorOpen = 0;
      s.noShadow = true;
      s.dyn = { draw: function (g, sp) {
        var d = Math.hypot(self.pos.x - 10.5, self.pos.z + 10.1), want = d < 2.2 ? 1 : 0;
        self.doorOpen += (want - self.doorOpen) * Math.min(1, (self.frameDt || 0.016) * 6);
        var off = Math.round(self.doorOpen * (hw - 3));
        var x0 = sp.x, y0 = sp.y - c.height;
        g.save(); g.beginPath(); g.rect(x0, y0 - 2, c.width, c.height + 2); g.clip();
        g.fillStyle = 'rgba(30,24,20,0.55)'; g.fillRect(x0 + 1, y0 + 3, c.width - 2, c.height - 4);
        g.drawImage(L, x0 - off, y0); g.drawImage(Rr, x0 + hw + off, y0);
        g.restore();
      } };
    });
    // Vägglampor vid entrén
    this.sconces = [];
    [9.1, 11.9].forEach(function (x) {
      var c = cv(6, 8), g = c.getContext('2d');
      g.fillStyle = '#2a2d33'; g.fillRect(1, 0, 4, 2); g.fillRect(2, 6, 2, 2);
      g.fillStyle = '#ffe9a8'; g.fillRect(1, 2, 4, 4); g.fillStyle = '#fff8dc'; g.fillRect(2, 3, 1, 2);
      self.addSprite(A2.selout(c, 0.4), x - 0.12, -10.1, { y: 1.05, key: -10.11, noShadow: true });
      self.sconces.push({ x: x, z: -10.1 });
    });
    // Skuggsiluetter till föremål som står på golvet
    this.sprites.forEach(function (s) {
      if (!s.c || s.wall || s.shadow || s.noShadow || s.frames || (s.y || 0) > 0.05 || s.c.height > 140) return;
      s.sil = silhouette(s.c);
    });
  };
  W.addScenery = function () {
    var self = this, add = this.addSprite;
    this.lamps = [];
    this.props = [];
    function col(x0, z0, x1, z1) { self.builder.colliders.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1 }); }
    function lamp(x, z) {
      add(A2.lampPost(), x, z, { ox: 6, oy: 57, key: z, shadow: { rx: 0.3, rz: 0.15, dx: 0.2 } });
      self.lamps.push({ x: x, z: z });
      col(x - 0.12, z - 0.1, x + 0.12, z + 0.1);
    }
    function bench(x, z) { add(A2.bench(), x, z, { ox: 17, oy: 17, key: z, shadow: { rx: 0.75, rz: 0.25, dx: 0.2 } }); col(x - 0.7, z - 0.1, x + 0.7, z + 0.5); }
    function rockAt(x, z, seed, w, h) { add(A2.rock(seed, w, h), x, z, { ox: (w >> 1) + 1, oy: h + 1, key: z, shadow: { rx: w / 40, rz: 0.15, dx: 0.1 } }); }
    function reeds(x, z, seed) {
      var c = cv(14, 20), g = c.getContext('2d'), r = A2.rng(seed);
      for (var i = 0; i < 7; i++) {
        var bx = 2 + Math.floor(r() * 10), hh = 8 + Math.floor(r() * 10);
        g.fillStyle = css(P.grass[1 + (i % 3)]); g.fillRect(bx, 20 - hh, 1, hh);
        if (i % 3 === 0) { g.fillStyle = '#6b4226'; g.fillRect(bx, 20 - hh - 3, 2, 4); g.fillStyle = '#8b5a36'; g.fillRect(bx, 20 - hh - 3, 1, 2); }
      }
      add(A2.selout(c, 0.35), x, z, { ox: 7, oy: 20, key: z, noShadow: true, sway: seed });
    }
    if (true) {
      // Göteborg: lyktstolpar, bänkar, flaggstång, cykelställ, soptunnor, rabatter, häck, staket och dammen
      [[-13, -12.55], [-5, -12.55], [3, -12.55], [13.2, -12.55], [-17, 7.5]].forEach(function (p) { lamp(p[0], p[1]); });
      bench(-8.5, -12.3); bench(0.5, -12.3); bench(-19.2, 3.2);
      this.flag = { x: 4.8, z: -11.7, frames: [] };
      for (var f = 0; f < 6; f++) this.flag.frames.push(A2.flagPole(f / 6 * Math.PI * 2 / 5));
      add(this.flag.frames[0], 4.8, -11.7, { ox: 3, oy: 79, key: -11.7, shadow: { rx: 0.2, rz: 0.1, dx: 0.1 }, dyn: { draw: function (g, sp) { var fr = self.flag.frames[Math.floor(self.t * 6) % 6]; g.drawImage(fr, sp.x - 3, sp.y - 79); } } });
      col(4.7, -11.8, 4.9, -11.6);
      add(A2.bikeRack(), -11, -11.3, { ox: 20, oy: 19, key: -11.3 }); col(-11.8, -11.4, -10.2, -11);
      add(A2.bin(), 8.6, -12.2, { ox: 6, oy: 16, key: -12.2 }); col(8.4, -12.3, 8.8, -12.1);
      add(A2.bin(), -6.3, -12.2, { ox: 6, oy: 16, key: -12.2 }); col(-6.5, -12.3, -6.1, -12.1);
      add(A2.flowerBed(43, 16, 3), 6.2, -11.8, { key: -11.8, noShadow: true });
      add(A2.flowerBed(43, 16, 7), 13, -11.8, { key: -11.8, noShadow: true });
      col(6.2, -11.8, 8, -11); col(13, -11.8, 14.8, -11);
      add(A2.hedge(84, 3), -4.6, 11.3, { key: 11.3, shadow: { rx: 1.8, rz: 0.3, dx: 0.3 } }); col(-4.6, 11.2, -1.1, 11.6);
      add(A2.hedge(72, 5), 9.5, 11.3, { key: 11.3, shadow: { rx: 1.5, rz: 0.3, dx: 0.3 } }); col(9.5, 11.2, 12.5, 11.6);
      add(A2.fence(1008), -21, 13.7, { key: 13.7, noShadow: true });
      // Skylt med företagets namn vid entrén
      var sign = cv(46, 30), sg = sign.getContext('2d');
      sg.fillStyle = '#3a3d44'; sg.fillRect(6, 16, 2, 14); sg.fillRect(38, 16, 2, 14);
      sg.fillStyle = '#1f4e79'; sg.fillRect(0, 0, 46, 17); sg.fillStyle = '#2f6fb0'; sg.fillRect(0, 0, 46, 2); sg.fillStyle = '#163a5a'; sg.fillRect(0, 15, 46, 2);
      sg.fillStyle = '#ffffff'; sg.font = 'bold 8px monospace'; sg.fillText('NORDVIK', 5, 11);
      sg.fillStyle = '#e8453c'; sg.fillRect(40, 4, 3, 3);
      add(A2.selout(sign, 0.4), 7.2, -12.5, { ox: 23, oy: 30, key: -12.5, shadow: { rx: 0.9, rz: 0.2, dx: 0.3 } }); col(6.3, -12.6, 8.1, -12.4);
      // Dammen: stenar, vass och näckrosor
      [[-20.2, -4.9, 1, 12, 8], [-16.5, -4.6, 2, 9, 6], [-16.2, 1.6, 3, 14, 9], [-20.4, 1.9, 4, 10, 7], [-17.2, 2.5, 5, 7, 5], [-19.4, -5.4, 6, 8, 6]].forEach(function (q) { rockAt(q[0], q[1], q[2], q[3], q[4]); });
      [[-20.4, -3], [-16.3, -1.6], [-16.5, 0.6], [-20.1, 0.9]].forEach(function (q, i) { reeds(q[0], q[1], 30 + i); });
      this.lilies = [[-18.8, -3.2], [-17.6, -2.4], [-19.2, 0.4], [-17.9, 1.2], [-18.4, -4.2], [-17.3, -0.5]].map(function (q, i) { return { x: q[0], z: q[1], c: A2.lilyPad(i), ph: i * 1.3 }; });
      this.fish = [0, 1, 2].map(function (i) { return { a: i * 2.1, sp: 0.35 + i * 0.12, r: 0.5 + i * 0.25, col: ['#ff8a3c', '#ffffff', '#ffb02e'][i] }; });
      // Stenar och buskar i gräset
      [[-12, 12.8, 7, 9, 6], [14, 12.9, 8, 8, 6], [19.8, -2.8, 9, 11, 7]].forEach(function (q) { rockAt(q[0], q[1], q[2], q[3], q[4]); });
      // Borås: lyktstolpar, bro över bäcken, tunnor, container och pallar
      [[92, -12.6], [100, -12.6], [108, -12.6], [86, 12.6], [114, 12.6]].forEach(function (p) { lamp(p[0], p[1]); });
      var br = A2.bridgeNS(44, 44);
      add(br, 99, 13.25, { key: 99, noShadow: true });
      this.builder.colliders.push({ minX: 98.9, maxX: 99.2, minZ: 13.3, maxZ: 16 }, { minX: 100.8, maxX: 101.1, minZ: 13.3, maxZ: 16 });
      [[114.5, -6], [115.2, -6.4], [114.8, -7]].forEach(function (q, i) {
        var b = K.boxSprite(0.5, 0.5, 0.85, ['#2f6fb0', '#c8412f', '#3f8a57'][i], ['#255a90', '#a83426', '#2f6f45'][i], { stripes: true });
        add(b, q[0] - 0.25, q[1] - 0.25, { key: q[1] - 0.25 }); col(q[0] - 0.25, q[1] - 0.25, q[0] + 0.25, q[1] + 0.25);
      });
      var cont = K.boxSprite(2.6, 1.4, 1.4, '#3f7a52', '#2f6f45', { stripes: true, fn: function (g, Wd, Dp, Hp) { g.fillStyle = '#ffffff'; g.fillRect(Wd / 2 - 10, Dp + 6, 20, 3); } });
      add(cont, 114, 5.5, { key: 5.5 }); col(114, 5.5, 116.6, 6.9);
      [[113.5, 9], [115, 9.4]].forEach(function (q) {
        var pal = K.boxSprite(1.1, 0.9, 0.95, '#c89d66', '#a57a48', { fn: function (g, Wd, Dp, Hp) { g.fillStyle = '#e7d9b8'; g.fillRect(Wd / 2 - 1, 0, 3, Dp + Hp); g.fillStyle = '#6b4a30'; g.fillRect(0, Dp + Hp - 3, Wd, 3); } });
        add(pal, q[0], q[1], { key: q[1] }); col(q[0], q[1], q[0] + 1.1, q[1] + 0.9);
      });
      [[84, 6.5, 20], [117, 2.2, 21], [83, -8.5, 22]].forEach(function (q) { self.addBush(q[0], q[1], q[2]); });
      [[86.2, -16, 11, 12, 8], [117, -12, 12, 9, 7]].forEach(function (q) { rockAt(q[0], q[1], q[2], q[3], q[4]); });
    }
  };

  // ------------------------------------------------------------------ Mark: vatten, pölar och fågelskuggor
  // Spegling i dammen av det som står på norra stranden (du själv, bänken, stenarna, lyktan)
  W.drawReflections = function (g) {
    var ws = (this.waters || {})[this.site] || [], self = this;
    ws.forEach(function (w) {
      if (w.stream) return;
      var c = self.toScreen(w.x, w.z, 0), rx = w.rx * PPM * 0.92, rz = w.rz * PPM * ZS * 0.92;
      if (c.x + rx < 0 || c.x - rx > self.view.vw || c.y + rz < 0 || c.y - rz > self.view.vh) return;
      var top = w.z + w.rz;
      var items = [];
      if (self.pos.z > top - 0.6 && self.pos.z < top + 3 && Math.abs(self.pos.x - w.x) < w.rx + 0.8) items.push({ img: self.playerSpr(self.dir, self.frame || 0, false), x: self.pos.x, z: self.pos.z, ox: null });
      self.sprites.forEach(function (s) {
        if (!s.c || s.dyn || s.wall || s.z < top - 0.8 || s.z > top + 6 || s.x - (s.ox || 0) / PPM > w.x + w.rx + 1 || s.x + (s.w || 1) < w.x - w.rx - 1) return;
        items.push({ img: s.frames ? s.frames[1] : s.c, x: s.x, z: s.z, ox: s.ox || 0 });
      });
      if (!items.length) return;
      g.save();
      g.beginPath(); g.ellipse(c.x, c.y, rx, rz, 0, 0, Math.PI * 2); g.clip();
      g.globalAlpha = 0.28;
      items.forEach(function (it) {
        var b = self.toScreen(it.x, it.z, 0);
        var x0 = it.ox === null ? b.x - (it.img.width >> 1) : b.x - it.ox;
        g.save(); g.translate(0, b.y * 2 + 2); g.scale(1, -1);
        g.drawImage(it.img, x0 + Math.round(Math.sin(self.t * 2 + b.y * 0.3)), b.y - it.img.height);
        g.restore();
      });
      g.restore();
    });
  };
  W.drawGroundFx = function (g) {
    var self = this, t = this.t, o = this.gOff, vw = this.view.vw, vh = this.view.vh;
    this.drawReflections(g);
    var wp = (this.waterPts || {})[this.site] || [], sp = (this.shorePts || {})[this.site] || [];
    var i, x, y, ph;
    // Glitter som vandrar över vattnet
    for (i = 0; i < wp.length; i += 2) {
      x = wp[i] - o[0]; y = wp[i + 1] - o[1];
      if (x < 0 || y < 0 || x >= vw || y >= vh) continue;
      ph = Math.sin(t * 1.4 + wp[i] * 0.23 + wp[i + 1] * 0.51) + Math.sin(t * 0.8 - wp[i] * 0.11 + wp[i + 1] * 0.29);
      if (ph > 1.6) { g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(x, y, 2, 1); }
      else if (ph > 1.2) { g.fillStyle = 'rgba(160,230,235,0.6)'; g.fillRect(x, y, 1, 1); }
      else if (ph < -1.7) { g.fillStyle = 'rgba(8,40,60,0.35)'; g.fillRect(x, y, 2, 1); }
    }
    // Skum längs stranden
    for (i = 0; i < sp.length; i += 2) {
      x = sp[i] - o[0]; y = sp[i + 1] - o[1];
      if (x < 0 || y < 0 || x >= vw || y >= vh) continue;
      ph = Math.sin(t * 2 + sp[i] * 0.4 + sp[i + 1] * 0.3);
      if (ph > 0.3) { g.fillStyle = 'rgba(225,245,240,' + (0.35 + ph * 0.3) + ')'; g.fillRect(x, y, 1, 1); }
    }
    // Näckrosor och fiskar i dammen
    if (this.site === 'gbg') {
      (this.fish || []).forEach(function (f) {
        f.a += (self.frameDt || 0.016) * f.sp;
        var fx = -18.3 + Math.cos(f.a) * f.r * 1.6, fz = -1.5 + Math.sin(f.a * 1.3) * f.r * 3;
        var s = self.toScreen(fx, fz, 0), dx = -Math.sin(f.a) > 0 ? 1 : -1;
        g.globalAlpha = 0.65; g.fillStyle = f.col; g.fillRect(s.x - 2, s.y, 4, 2); g.fillRect(s.x - 2 * dx - (dx > 0 ? 1 : 0), s.y, 1, 2);
        g.fillStyle = 'rgba(20,60,80,0.4)'; g.fillRect(s.x + 3 * dx, s.y, 1, 1); g.globalAlpha = 1;
      });
      (this.lilies || []).forEach(function (l) {
        var s = self.toScreen(l.x, l.z, 0), b = Math.round(Math.sin(t * 0.9 + l.ph) * 0.6);
        g.fillStyle = 'rgba(10,40,50,0.35)'; g.fillRect(s.x - 4, s.y + 2 + b, 9, 1);
        g.drawImage(l.c, s.x - 4, s.y - 3 + b);
      });
    }
    // Ringar på vattnet
    (this.ripples || []).forEach(function (r) {
      var s = self.toScreen(r.x, r.z, 0), k = r.age / r.life, rad = 1 + k * r.size;
      g.strokeStyle = 'rgba(220,245,250,' + (0.7 * (1 - k)) + ')'; g.lineWidth = 1;
      g.beginPath(); g.ellipse(s.x + 0.5, s.y + 0.5, rad, rad * 0.5, 0, 0, Math.PI * 2); g.stroke();
    });
    // Vattenpölar när det regnar
    var wet = this.wet || 0;
    if (wet > 0.02) {
      var pud = (this.puddles || {})[this.site] || [];
      for (i = 0; i < pud.length; i += 2) {
        x = pud[i] - o[0]; y = pud[i + 1] - o[1];
        if (x < -20 || y < -10 || x >= vw + 20 || y >= vh + 10) continue;
        var rw = 6 + hash2(pud[i], 1, 3) * 8;
        g.fillStyle = 'rgba(40,60,90,' + (0.35 * wet) + ')'; g.beginPath(); g.ellipse(x, y, rw * wet, rw * 0.4 * wet, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(210,230,255,' + (0.4 * wet) + ')'; g.fillRect(x - rw * 0.4 * wet, y - 1, rw * 0.5 * wet, 1);
      }
    }
    // Fåglarnas skuggor på marken
    (this.birds || []).forEach(function (b) { var s = self.toScreen(b.x + b.y * 0.3, b.z - b.y * 0.25, 0); g.fillStyle = 'rgba(16,20,60,0.2)'; g.fillRect(s.x - 2, s.y, 4, 1); });
  };

  // ------------------------------------------------------------------ Skuggor
  // Mjuk ellips i ditherade steg (tät i mitten, gles mot kanten), sparad som bild per storlek
  var ELL = {};
  function ditherEllipse(g, cx, cy, rx, ry, a) {
    rx = Math.max(1, Math.round(rx)); ry = Math.max(1, Math.round(ry));
    var key = rx + ':' + ry + ':' + a, c = ELL[key];
    if (!c) {
      c = ELL[key] = cv(rx * 2 + 1, ry * 2 + 1);
      var e = c.getContext('2d');
      e.fillStyle = 'rgba(16,20,60,' + a + ')';
      for (var y = -ry; y <= ry; y++) for (var x = -rx; x <= rx; x++) {
        var dx = x / rx, dy = y / ry, d = dx * dx + dy * dy;
        if (d > 1) continue;
        if (d > 0.55 && A2.bayer(x + 64, y + 64) + 0.5 < (d - 0.55) / 0.45) continue;
        e.fillRect(x + rx, y + ry, 1, 1);
      }
    }
    g.drawImage(c, Math.round(cx) - rx, Math.round(cy) - ry);
  }
  W.drawShadows = function (g, list) {
    var self = this;
    list.forEach(function (s) {
      if (s.shadow) {
        var p = self.toScreen(s.x + (s.shadow.dx || 0), s.z - (s.shadow.dx || 0) * 0.4, 0);
        ditherEllipse(g, p.x, p.y, s.shadow.rx * PPM, s.shadow.rz * PPM * ZS, 0.26);
      } else if (s.sil) {
        var p2 = self.toScreen(s.x, s.z, s.y);
        g.globalAlpha = 0.2; g.drawImage(s.sil, p2.x - (s.ox || 0) + 3, p2.y - s.oy + 2); g.globalAlpha = 1;
      } else if (s.player || s.person) {
        var q = s.player ? self.pos : s.person, sp = self.toScreen(q.x, q.z, 0);
        ditherEllipse(g, sp.x + 1, sp.y, 7, 2.6, 0.3);
      }
    });
  };
  W.drawChar = function (g, spr, x, z, sc, sitting, p) {
    var s = this.toScreen(x, z, 0), x0 = s.x - (spr.width >> 1), y0 = s.y - spr.height + (sitting ? 4 : 1);
    // Guldkant runt den person som muspekaren eller du står vid
    if (p && this.hoverSpot && this.hoverSpot.npc === p.name && !(this.game.ui && this.game.ui.captures())) {
      var sil = spr._gold || (spr._gold = silhouette(spr, '#ffd23f'));
      g.globalAlpha = 0.6 + Math.sin(this.t * 6) * 0.3;
      g.drawImage(sil, x0 - 1, y0); g.drawImage(sil, x0 + 1, y0); g.drawImage(sil, x0, y0 - 1); g.drawImage(sil, x0, y0 + 1);
      g.globalAlpha = 1;
    }
    g.drawImage(spr, x0, y0);
  };
  // Krabban: skuggad kropp, klor som knäpper, ögon på skaft med glans
  W.drawCrab = function (g) {
    var c = this.game.crab, s = this.toScreen(c.x, c.z, 0);
    var k = Math.floor(c.anim * 8) % 2, snap = Math.floor(this.t * 3) % 4 === 0 ? 1 : 0;
    function px(x, y, w, h, col) { g.fillStyle = col; g.fillRect(s.x + x, s.y + y, w, h); }
    ditherEllipse(g, s.x, s.y, 8, 2.5, 0.3);
    var O = K.OUT, B = '#e84a2c', L = '#ff8a5c', D = '#a8321c';
    for (var i = 0; i < 3; i++) { var o = (i + k) % 2; px(-9, -4 + i * 2 - o, 4, 1, O); px(-9, -3 + i * 2 - o, 1, 1, D); px(5, -4 + i * 2 - (1 - o), 4, 1, O); px(8, -3 + i * 2 - (1 - o), 1, 1, D); }
    var lift = c.fleeing ? -2 : 0;
    [[-11, 1], [6, -1]].forEach(function (q) {
      var x = q[0];
      px(x, -11 + lift, 5, 5, O); px(x + 1, -10 + lift, 3, 3, B); px(x + 1, -10 + lift, 1, 1, L);
      if (snap) px(x + 2, -11 + lift, 1, 2, O);
    });
    px(-6, -9, 12, 7, O); px(-5, -8, 10, 5, B); px(-4, -8, 8, 1, L); px(-5, -5, 10, 2, D); px(-2, -7, 1, 1, '#ffb08a'); px(2, -7, 1, 1, '#ffb08a');
    px(-3, -12, 2, 4, O); px(1, -12, 2, 4, O); px(-3, -12, 2, 2, '#ffffff'); px(1, -12, 2, 2, '#ffffff'); px(-2, -11, 1, 1, O); px(2, -11, 1, 1, O);
  };
  // Dammsugarroboten: rund, blank ovansida, stötfångare, blinkande lampa och snurrande borste
  W.drawVac = function (g) {
    var v = this.game.vac, s = this.toScreen(v.x, v.z, 0), t = this.t;
    ditherEllipse(g, s.x + 1, s.y, 7, 2.5, 0.3);
    g.fillStyle = K.OUT; g.beginPath(); g.ellipse(s.x, s.y - 3, 7, 4, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2b2d31'; g.beginPath(); g.ellipse(s.x, s.y - 3, 6, 3, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#4a4d55'; g.beginPath(); g.ellipse(s.x - 1, s.y - 4, 4, 2, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#8a9099'; g.fillRect(s.x - 3, s.y - 5, 2, 1);
    g.fillStyle = '#1a1b1e'; g.fillRect(s.x - 6, s.y - 1, 12, 1);
    g.fillStyle = Math.floor(t * 3) % 2 ? '#4fc3f7' : '#1f4e79'; g.fillRect(s.x, s.y - 5, 2, 1);
    var a = t * 12;
    g.fillStyle = '#6a6f78'; g.fillRect(Math.round(s.x - 6 + Math.cos(a) * 2), Math.round(s.y - 1 + Math.sin(a)), 2, 1);
  };

  // ------------------------------------------------------------------ Himmel: molnskuggor och fåglar
  W.drawSky = function (g) {
    var self = this, cw = this.view.vw, ch = this.view.vh;
    var b = this.site === 'boras' ? [88, -12, 112, 12] : [-15, -10, 15, 10];
    var tl = this.toScreen(b[0], b[3], 0), br = this.toScreen(b[2], b[1], 0);
    g.save();
    g.beginPath(); g.rect(0, 0, cw, ch); g.rect(tl.x, tl.y - WALL_H * PPM * HS, br.x - tl.x, br.y - tl.y + WALL_H * PPM * HS); g.clip('evenodd');
    this.clouds.forEach(function (cl) {
      var p = self.toScreen(cl.x + (self.site === 'boras' ? 70 : 0), cl.z, 0);
      var rx = cl.r * PPM, ry = cl.r * PPM * ZS * 0.6;
      if (p.x + rx * 1.6 < 0 || p.x - rx * 1.6 > cw || p.y + ry * 2 < 0 || p.y - ry * 2 > ch) return;
      for (var k = 0; k < 3; k++) {
        g.fillStyle = 'rgba(20,30,60,' + (0.045 + k * 0.02) + ')';
        g.beginPath(); g.ellipse(p.x + k * rx * 0.2, p.y - k * ry * 0.1, rx * (1.25 - k * 0.22), ry * (1.25 - k * 0.22), 0, 0, Math.PI * 2);
        g.ellipse(p.x - rx * 0.7, p.y + ry * 0.2, rx * (0.7 - k * 0.12), ry * (0.8 - k * 0.12), 0, 0, Math.PI * 2);
        g.fill();
      }
    });
    g.restore();
    this.birds.forEach(function (bd) {
      var p = self.toScreen(bd.x, bd.z, bd.y);
      var up = Math.sin(bd.ph) > 0, dir = bd.vx > 0 ? 1 : -1;
      g.fillStyle = '#2b2f36';
      g.fillRect(p.x - 3, p.y + (up ? -2 : 1), 2, 1); g.fillRect(p.x - 2, p.y + (up ? -1 : 0), 1, 1);
      g.fillRect(p.x - 1, p.y, 3, 1); g.fillRect(p.x + 2, p.y + (up ? -1 : 0), 1, 1); g.fillRect(p.x + 3, p.y + (up ? -2 : 1), 2, 1);
      g.fillStyle = '#e8e4da'; g.fillRect(p.x + (dir > 0 ? 1 : -1), p.y, 1, 1);
    });
  };

  // ------------------------------------------------------------------ Stämningspartiklar
  var ORIG_UPD = W.updateFx;
  W.updateFx = function (dt, rdt) {
    ORIG_UPD.call(this, dt, rdt);
    var self = this, Pf = NV.gfx.profile(), dens = Pf.particles || 0.5;
    var on = NV.settings.get('particles') !== false;
    this.amb = this.amb || []; this.ripples = this.ripples || [];
    var vm = this.visMin, vM = this.visMax;
    if (!vm) return;
    var hour = 8 + (this.game.state ? this.game.state.time : 0) / 3600;
    this.eve = clamp((hour - 13) / 4, 0, 1);
    this.wet = clamp((this.wet || 0) + (this.weather === 'rain' ? dt * 0.08 : -dt * 0.03), 0, 1);
    var outside = /Utanför/.test(this.zone().name);
    if (on) {
      // Kronblad från körsbärsträden och löv från höstträden
      (this.trees || []).forEach(function (tr) {
        if (tr.x < vm.x - 2 || tr.x > vM.x + 2 || tr.z < vm.z - 2 || tr.z > vM.z + 4) return;
        if (tr.kind === 'cherry' && Math.random() < dt * 1.6 * dens) self.amb.push({ k: 'petal', x: tr.x + R(-1.2, 1.2), z: tr.z + R(-0.2, 0.3), y: R(1.8, 3.2), vx: R(0.25, 0.6), vy: -R(0.25, 0.45), age: 0, life: 7, ph: Math.random() * 6, col: Math.random() < 0.5 ? '#ffc3e0' : '#ff9ccf' });
        if (tr.kind === 'autumn' && Math.random() < dt * 0.7 * dens) self.amb.push({ k: 'leaf', x: tr.x + R(-1, 1), z: tr.z + R(-0.2, 0.3), y: R(1.6, 2.8), vx: R(0.15, 0.4), vy: -R(0.3, 0.5), age: 0, life: 7, ph: Math.random() * 6, col: ['#e08b36', '#cc6e2a', '#f0a947'][Math.floor(Math.random() * 3)] });
      });
      // Fjärilar och trollsländor ute, eldflugor på kvällen
      var nb = 0, nf = 0, nd = 0, nm = 0;
      this.amb.forEach(function (a) { if (a.k === 'fly') nb++; if (a.k === 'firefly') nf++; if (a.k === 'dragon') nd++; if (a.k === 'mote') nm++; });
      if (nb < Math.round(4 * dens) && Math.random() < dt * 0.5 && this.weather !== 'rain') this.amb.push({ k: 'fly', x: R(vm.x, vM.x), z: R(vm.z, vM.z), y: R(0.4, 1.2), vx: 0, vz: 0, age: 0, life: 25, ph: Math.random() * 6, col: ['#ffffff', '#ffe14a', '#7fb8ff', '#ff9a4a'][Math.floor(Math.random() * 4)] });
      if (this.eve > 0.4 && nf < Math.round(12 * dens)) this.amb.push({ k: 'firefly', x: R(vm.x, vM.x), z: R(vm.z, vM.z), y: R(0.3, 1.4), age: 0, life: R(6, 12), ph: Math.random() * 6 });
      if (this.site === 'gbg' && nd < 1 && Math.random() < dt * 0.2) this.amb.push({ k: 'dragon', x: -18.3, z: -1.5, y: 0.8, age: 0, life: 20, ph: 0, tx: -18, tz: -1 });
      // Dammkorn i solljuset från fönstren
      if (Pf.motes && !outside && nm < 40 * dens) {
        var wins = this.sprites.filter(function (s) { return s.emit && s.emit.win; });
        if (wins.length && Math.random() < dt * 10) { var w = wins[Math.floor(Math.random() * wins.length)]; this.amb.push({ k: 'mote', x: w.emit.x + R(-0.8, 1.6), z: w.emit.z - R(0.3, 2.2), y: R(0.2, 1.4), age: 0, life: R(3, 6), ph: Math.random() * 6 }); }
      }
      // Regnstänk på marken och ringar på vattnet
      if (this.weather === 'rain') {
        for (var r = 0; r < dt * 40 * dens; r++) this.amb.push({ k: 'splash', x: R(vm.x, vM.x), z: R(vm.z, vM.z), y: 0, age: 0, life: 0.25 });
        if (Math.random() < dt * 14) this.addRipple(1.5);
      }
      if (Math.random() < dt * 0.9) this.addRipple(3);
      // Gräs som yr när du springer över gräsmattan
      if (outside && this.frame && Math.random() < dt * 5) this.part({ x: this.pos.x + R(-0.2, 0.2), z: this.pos.z, y: 0.1, vx: R(-0.6, 0.6), vy: R(0.6, 1.2), g: 4, life: 0.5, size: 1, col: ['#5da236', '#8fcc4d', '#3a7229'][Math.floor(Math.random() * 3)] });
    }
    // Rörelser
    this.amb = this.amb.filter(function (a) {
      a.age += dt; a.ph += dt;
      if (a.k === 'petal' || a.k === 'leaf') { a.x += (a.vx + Math.sin(a.ph * 2.3) * 0.5) * dt; a.z += Math.cos(a.ph * 1.7) * 0.1 * dt; a.y = Math.max(0, a.y + a.vy * dt); if (a.y === 0) a.vx = 0; }
      else if (a.k === 'fly') { if (Math.random() < dt * 1.5) { a.vx = R(-0.8, 0.8); a.vz = R(-0.5, 0.5); } a.x += a.vx * dt; a.z += a.vz * dt; a.y = 0.8 + Math.sin(a.ph * 1.3) * 0.35; }
      else if (a.k === 'firefly') { a.x += Math.sin(a.ph * 0.7) * 0.2 * dt; a.z += Math.cos(a.ph * 0.5) * 0.15 * dt; a.y += Math.sin(a.ph) * 0.1 * dt; }
      else if (a.k === 'mote') { a.x += Math.sin(a.ph * 0.6) * 0.06 * dt; a.y += Math.cos(a.ph * 0.4) * 0.05 * dt; }
      else if (a.k === 'dragon') { if (Math.hypot(a.tx - a.x, a.tz - a.z) < 0.1 || Math.random() < dt * 0.6) { a.tx = -18.3 + R(-1.6, 1.6); a.tz = -1.5 + R(-3, 3); } a.x += (a.tx - a.x) * dt * 3; a.z += (a.tz - a.z) * dt * 3; a.y = 0.7 + Math.sin(a.ph * 3) * 0.1; }
      return a.age < a.life;
    });
    if (this.amb.length > 500) this.amb.splice(0, this.amb.length - 500);
    this.ripples = this.ripples.filter(function (r) { r.age += dt; return r.age < r.life; });
  };
  W.addRipple = function (size) {
    var ws = (this.waters || {})[this.site] || [];
    if (!ws.length) return;
    var w = ws[Math.floor(Math.random() * ws.length)], a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * 0.8;
    this.ripples.push({ x: w.x + Math.cos(a) * w.rx * d, z: w.z + Math.sin(a) * w.rz * d, age: 0, life: 1.2, size: size * 2 });
  };
  var ORIG_FX = W.drawFx;
  W.drawFx = function (g, sc) {
    if (this.safeMode) return ORIG_FX.call(this, g, sc);
    var self = this, t = this.t;
    (this.amb || []).forEach(function (a) {
      var s = self.toScreen(a.x, a.z, a.y), f = a.age / a.life, al = Math.min(1, a.age * 2, (1 - f) * 3);
      if (a.k === 'petal' || a.k === 'leaf') {
        g.globalAlpha = al; g.fillStyle = a.col;
        if (Math.sin(a.ph * 5) > 0) g.fillRect(s.x, s.y, 2, 1); else g.fillRect(s.x, s.y, 1, 2);
      } else if (a.k === 'fly') {
        var up = Math.sin(a.ph * 18) > 0;
        g.globalAlpha = al; g.fillStyle = a.col;
        if (up) { g.fillRect(s.x - 2, s.y - 2, 2, 2); g.fillRect(s.x + 1, s.y - 2, 2, 2); } else { g.fillRect(s.x - 2, s.y, 2, 1); g.fillRect(s.x + 1, s.y, 2, 1); }
        g.fillStyle = '#2b2f36'; g.fillRect(s.x, s.y - 1, 1, 2);
      } else if (a.k === 'firefly') {
        var on = 0.5 + Math.sin(a.ph * 3) * 0.5;
        g.globalAlpha = al * on; g.globalCompositeOperation = 'lighter';
        g.fillStyle = 'rgba(200,255,120,0.35)'; g.fillRect(s.x - 1, s.y - 1, 3, 3); g.fillStyle = '#eaffa0'; g.fillRect(s.x, s.y, 1, 1);
        g.globalCompositeOperation = 'source-over';
      } else if (a.k === 'mote') {
        g.globalAlpha = al * 0.7; g.globalCompositeOperation = 'lighter'; g.fillStyle = '#fff4d0'; g.fillRect(s.x, s.y, 1, 1); g.globalCompositeOperation = 'source-over';
      } else if (a.k === 'dragon') {
        g.globalAlpha = 1; g.fillStyle = '#2fb7c8'; g.fillRect(s.x - 2, s.y, 5, 1); g.fillStyle = 'rgba(220,245,255,0.8)';
        if (Math.sin(a.ph * 30) > 0) { g.fillRect(s.x - 1, s.y - 2, 1, 2); g.fillRect(s.x + 1, s.y - 2, 1, 2); } else { g.fillRect(s.x - 1, s.y + 1, 1, 1); g.fillRect(s.x + 1, s.y + 1, 1, 1); }
        g.fillStyle = 'rgba(16,20,60,0.2)'; var sh = self.toScreen(a.x, a.z, 0); g.fillRect(sh.x - 2, sh.y, 4, 1);
      } else if (a.k === 'splash') {
        g.globalAlpha = 0.6 * (1 - f); g.fillStyle = '#dce8ff';
        var k = Math.floor(f * 3);
        if (k === 0) g.fillRect(s.x, s.y - 1, 1, 1); else { g.fillRect(s.x - k, s.y - 1, 1, 1); g.fillRect(s.x + k, s.y - 1, 1, 1); }
      }
    });
    g.globalAlpha = 1;
    ORIG_FX.call(this, g, sc);
  };

  // ------------------------------------------------------------------ Ljus
  W.postLow = function (g) {
    var Pf = NV.gfx.profile(), v = this.view, self = this, t = this.t;
    var vw = v.vw, vh = v.vh, eve = this.eve || 0, rain = this.weather === 'rain', cloudy = this.weather === 'clouds';
    var lit = eve > 0.35 || rain;
    if (Pf.lights) {
      if (!this.lightC || this.lightC.width !== vw || this.lightC.height !== vh) { this.lightC = cv(vw, vh); this.lightG = this.lightC.getContext('2d'); }
      var L = this.lightG;
      L.globalCompositeOperation = 'source-over';
      // Dagsljus ute och lite svalare inomhus; kvällen blir varmare och mörkare
      var out = A2.mix([255, 252, 242], [236, 178, 150], eve);
      if (rain) out = A2.mix(out, [180, 192, 212], 0.7); else if (cloudy) out = A2.mix(out, [214, 220, 232], 0.5);
      var ins = A2.mix([222, 220, 236], [176, 164, 190], eve);
      L.fillStyle = css(out); L.fillRect(0, 0, vw, vh);
      var b = this.site === 'boras' ? [88, -12, 112, 12] : [-15, -10, 15, 10];
      var tl = this.toScreen(b[0], b[3], WALL_H), br = this.toScreen(b[2], b[1], 0);
      L.fillStyle = css(ins); L.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
      L.globalCompositeOperation = 'lighter';
      // Ljuspaneler i taket lyser upp golvet i mjuka cirklar
      var grid = [];
      if (this.site === 'gbg') { for (var lx = -12; lx <= 13; lx += 4) for (var lz = -7.5; lz <= 8.5; lz += 4) grid.push([lx, lz]); }
      else { for (var bx = 92; bx <= 108; bx += 8) for (var bz = -8; bz <= 8; bz += 8) grid.push([bx, bz]); }
      grid.forEach(function (q) {
        var p = self.toScreen(q[0], q[1], 0);
        if (p.x < -60 || p.y < -60 || p.x > vw + 60 || p.y > vh + 60) return;
        A2.glow(L, p.x, p.y, 58, '62,56,38', 0.55);
      });
      // Solfläckar på golvet under fönstren
      this.sprites.forEach(function (s) {
        if (!s.emit || !s.emit.win) return;
        var p = self.toScreen(s.emit.x - s.emit.w * 0.4, s.emit.z - 0.4, 0);
        if (p.x < -80 || p.x > vw + 80 || p.y < -60 || p.y > vh + 80) return;
        var w = s.emit.w * PPM * 0.8, a = (0.5 - eve * 0.35) * (rain ? 0.4 : 1);
        L.fillStyle = 'rgba(80,70,40,' + a + ')';
        for (var y = 0; y < 24; y++) L.fillRect(p.x + y * 0.7, p.y + y, w, 1);
      });
      // Skärmar och lampor
      var A = this.builder.anchors;
      Object.keys(A.desks).forEach(function (id) {
        var p = self.toScreen(A.desks[id].x, A.desks[id].z + 0.2, 0);
        if (p.x < -30 || p.y < -30 || p.x > vw + 30 || p.y > vh + 30) return;
        A2.glow(L, p.x, p.y, 16, '40,70,110', 0.9);
      });
      (this.lamps || []).forEach(function (l) {
        var p = self.toScreen(l.x, l.z, 0);
        if (p.x < -80 || p.y < -80 || p.x > vw + 80 || p.y > vh + 80) return;
        if (lit) A2.glow(L, p.x, p.y - 4, 44, '255,190,110', 0.55 + eve * 0.4);
      });
      // Kallt ljus i serverrummet och en varm lampa över fikabordet
      if (this.site === 'gbg') {
        var sv = this.toScreen(-10.5, -6, 0), kt = this.toScreen(-1.5, -5.8, 0);
        A2.glow(L, sv.x, sv.y, 90, '20,40,75', 0.8);
        A2.glow(L, kt.x, kt.y, 50, '80,55,20', 0.7);
      }
      // Billyktor och vägglampor på kvällen
      if (lit) {
        (this.cars || []).forEach(function (c) {
          if ((c.x > 50) !== (self.site === 'boras')) return;
          var p = self.toScreen(c.x, c.z, 0);
          L.fillStyle = 'rgba(120,110,70,0.5)';
          L.beginPath(); L.moveTo(p.x - 18, p.y); L.lineTo(p.x + 18, p.y); L.lineTo(p.x + 30, p.y + 34); L.lineTo(p.x - 30, p.y + 34); L.closePath(); L.fill();
        });
        (this.sconces || []).forEach(function (sc2) { if (self.site !== 'gbg') return; var p = self.toScreen(sc2.x, sc2.z - 0.4, 0); A2.glow(L, p.x, p.y, 26, '255,190,110', 0.6); });
      }
      g.globalCompositeOperation = 'multiply';
      g.drawImage(this.lightC, 0, 0);
      g.globalCompositeOperation = 'source-over';
    }
    // Ljuskällor som glöder (additivt)
    g.globalCompositeOperation = 'lighter';
    (this.lamps || []).forEach(function (l) {
      var p = self.toScreen(l.x, l.z, 2.0);
      if (p.x < -30 || p.y < -30 || p.x > vw + 30 || p.y > vh + 30) return;
      A2.glow(g, p.x, p.y + 4, lit ? 16 : 7, '255,220,150', lit ? 0.6 : 0.2);
    });
    if (this.site === 'gbg' || this.site === 'boras') {
      var A3 = this.builder.anchors;
      Object.keys(A3.desks).forEach(function (id) {
        if (id.indexOf('PC-') !== 0) return;
        var p = self.toScreen(A3.desks[id].x + 0.05, A3.desks[id].z + 0.1, 1.05);
        if (p.x < -20 || p.y < -20 || p.x > vw + 20 || p.y > vh + 20) return;
        A2.glow(g, p.x, p.y, 6, '120,190,255', 0.14 + Math.sin(t * 3 + p.x) * 0.03);
      });
      (this.rackSpots || []).forEach(function (r) {
        if ((r.x > 50) !== (self.site === 'boras')) return;
        var p = self.toScreen(r.x, r.z - r.d / 2, 1.4);
        A2.glow(g, p.x, p.y, 14, '80,255,140', 0.14 + Math.sin(t * 5 + r.x) * 0.04);
      });
    }
    // Strålkastare på bilarna och vägglamporna när det är mörkt eller regnar
    if (lit) {
      (this.cars || []).forEach(function (c) {
        if ((c.x > 50) !== (self.site === 'boras')) return;
        [-0.7, 0.7].forEach(function (dx) { var p = self.toScreen(c.x + dx, c.z, 0.2); A2.glow(g, p.x, p.y, 7, '255,240,190', 0.55); });
      });
      (this.sconces || []).forEach(function (sc2) { if (self.site !== 'gbg') return; var p = self.toScreen(sc2.x, sc2.z, 1.2); A2.glow(g, p.x, p.y, 9, '255,220,150', 0.5); });
    }
    // Varma fönster på kvällen sedda utifrån
    if (eve > 0.2 || rain) this.sprites.forEach(function (s) {
      if (!s.emit || !s.emit.winOut) return;
      var p = self.toScreen(s.emit.x, s.emit.z, 0.9);
      A2.glow(g, p.x, p.y, 22, '255,190,110', 0.3 * Math.max(eve, rain ? 0.5 : 0));
    });
    // Ljusstrålar genom fönstren
    if (Pf.beams && !rain) {
      this.sprites.forEach(function (s) {
        if (!s.emit || !s.emit.win) return;
        var top = self.toScreen(s.emit.x - s.emit.w * 0.4, s.emit.z - 0.1, 1.3), bot = self.toScreen(s.emit.x - s.emit.w * 0.4, s.emit.z - 0.4, 0);
        if (top.x < -120 || top.x > vw + 60 || bot.y < -20 || top.y > vh + 20) return;
        var w = s.emit.w * PPM * 0.8, a = 0.07 * (1 - eve * 0.6) * (0.85 + Math.sin(t * 0.7 + s.emit.x) * 0.15);
        var gr = g.createLinearGradient(0, top.y, 0, bot.y + 24);
        gr.addColorStop(0, 'rgba(255,240,200,' + a + ')'); gr.addColorStop(1, 'rgba(255,240,200,0)');
        g.fillStyle = gr;
        g.beginPath(); g.moveTo(top.x, top.y); g.lineTo(top.x + w, top.y); g.lineTo(bot.x + w + 17, bot.y + 24); g.lineTo(bot.x + 17, bot.y + 24); g.closePath(); g.fill();
      });
      // Ljusschakt från takfönstren i lagret
      if (this.site === 'boras' && /Lagret/.test(this.zone().name)) {
        [93, 101, 109].forEach(function (x, k) {
          var tp = self.toScreen(x, 8, 4), bt = self.toScreen(x + 2.4, -2, 0), a3 = 0.06 + Math.sin(t * 0.6 + k) * 0.015;
          var gr3 = g.createLinearGradient(0, tp.y, 0, bt.y);
          gr3.addColorStop(0, 'rgba(255,245,215,' + a3 + ')'); gr3.addColorStop(1, 'rgba(255,245,215,0)');
          g.fillStyle = gr3;
          g.beginPath(); g.moveTo(tp.x, tp.y); g.lineTo(tp.x + 40, tp.y); g.lineTo(bt.x + 40, bt.y); g.lineTo(bt.x, bt.y); g.closePath(); g.fill();
        });
      }
      // Solstrålar som sveper över utomhusmiljön
      if (/Utanför/.test(this.zone().name) && eve < 0.8) {
        for (var k = 0; k < 4; k++) {
          var x0 = ((k * 173 + t * 6) % (vw + 200)) - 100, a2 = 0.035 + Math.sin(t * 0.5 + k) * 0.015;
          var gr2 = g.createLinearGradient(0, 0, 0, vh);
          gr2.addColorStop(0, 'rgba(255,236,190,' + a2 + ')'); gr2.addColorStop(1, 'rgba(255,236,190,0)');
          g.fillStyle = gr2;
          g.beginPath(); g.moveTo(x0, 0); g.lineTo(x0 + 26 + k * 6, 0); g.lineTo(x0 + 26 + k * 6 + vh * 0.5, vh); g.lineTo(x0 + vh * 0.5, vh); g.closePath(); g.fill();
        }
      }
    }
    g.globalCompositeOperation = 'source-over';
    // Färgton: varmt ljus uppe till vänster, svalare skuggor nere till höger (i pixelbufferten, billigt)
    if (Pf.post && NV.settings.get('post') !== false) {
      var g2 = g.createLinearGradient(0, 0, vw, vh);
      g2.addColorStop(0, 'rgba(255,' + Math.round(214 - eve * 50) + ',150,0.13)'); g2.addColorStop(0.5, 'rgba(255,230,200,0)'); g2.addColorStop(0.62, 'rgba(30,50,120,0)'); g2.addColorStop(1, 'rgba(30,50,120,0.12)');
      g.fillStyle = g2; g.fillRect(0, 0, vw, vh);
    }
  };

  // ------------------------------------------------------------------ Efterbehandling i full upplösning
  W.postHi = function (m) {
    var Pf = NV.gfx.profile(), v = this.view, cw = this.canvas.width, ch = this.canvas.height;
    var bx = Math.round((-v.hw - v.fx) * v.S + cw / 2), by = Math.round((-v.hh + v.fy) * v.S + ch / 2), bw = v.vw * v.S, bh = v.vh * v.S;
    var post = Pf.post && NV.settings.get('post') !== false;
    var high = post && Pf.pr >= 1.75;
    if (high) {
      // Glöd kring ljusa ytor: nedskalad bild som multipliceras med sig själv (bara det ljusa blir kvar)
      var sw = Math.max(1, Math.round(v.vw / 4)), sh = Math.max(1, Math.round(v.vh / 4));
      if (!this.bloomC || this.bloomC.width !== sw || this.bloomC.height !== sh) { this.bloomC = cv(sw, sh); this.bloomG = this.bloomC.getContext('2d'); }
      var bg = this.bloomG;
      bg.globalCompositeOperation = 'source-over'; bg.imageSmoothingEnabled = true;
      bg.drawImage(this.low, 0, 0, sw, sh);
      bg.globalCompositeOperation = 'multiply'; bg.drawImage(this.bloomC, 0, 0); bg.drawImage(this.bloomC, 0, 0);
      m.save(); m.imageSmoothingEnabled = true; m.globalCompositeOperation = 'lighter'; m.globalAlpha = 0.22;
      m.drawImage(this.bloomC, bx, by, bw, bh);
      m.restore();
      // Skärpedjup: överkant och underkant blir lite suddiga (miniatyrkänsla)
      if (NV.settings.get('dof2d') !== false) {
        var dw = Math.max(1, Math.round(v.vw / 3)), dh = Math.max(1, Math.round(v.vh / 3));
        if (!this.dofC || this.dofC.width !== dw || this.dofC.height !== dh) { this.dofC = cv(dw, dh); this.dofG = this.dofC.getContext('2d'); }
        this.dofG.imageSmoothingEnabled = true; this.dofG.drawImage(this.low, 0, 0, dw, dh);
        var band = Math.round(ch * 0.15);
        if (!this.bandC || this.bandC.width !== cw || this.bandC.height !== band) { this.bandC = cv(cw, band); this.bandG = this.bandC.getContext('2d'); }
        var BG = this.bandG;
        [[0, 1], [ch - band, -1]].forEach(function (q) {
          BG.globalCompositeOperation = 'source-over'; BG.clearRect(0, 0, cw, band); BG.imageSmoothingEnabled = true;
          BG.drawImage(this.dofC, bx, by - q[0], bw, bh);
          BG.globalCompositeOperation = 'destination-in';
          var gr = BG.createLinearGradient(0, 0, 0, band);
          if (q[1] > 0) { gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); } else { gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.7)'); }
          BG.fillStyle = gr; BG.fillRect(0, 0, cw, band);
          m.drawImage(this.bandC, 0, q[0]);
        }, this);
      }
    }
    // Vinjett
    var vg = m.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.38, cw / 2, ch / 2, Math.max(cw, ch) * 0.78);
    vg.addColorStop(0, 'rgba(255,200,120,0)'); vg.addColorStop(1, 'rgba(40,20,30,0.38)');
    m.fillStyle = vg; m.fillRect(0, 0, cw, ch);
  };

  // ------------------------------------------------------------------ Skyltar, namn och markeringar
  function roundBox(m, x, y, w, h, r, fill, stroke) {
    m.beginPath(); m.moveTo(x + r, y); m.lineTo(x + w - r, y); m.quadraticCurveTo(x + w, y, x + w, y + r); m.lineTo(x + w, y + h - r); m.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    m.lineTo(x + r, y + h); m.quadraticCurveTo(x, y + h, x, y + h - r); m.lineTo(x, y + r); m.quadraticCurveTo(x, y, x + r, y); m.closePath();
    if (fill) { m.fillStyle = fill; m.fill(); } if (stroke) { m.strokeStyle = stroke; m.stroke(); }
  }
  W.label = function (g, text, x, y, sc, bg, fg, style) {
    if (this.inLow) {
      var self = this, h = this.hi({ x: x, y: y }), S = this.view.S;
      this.hiQueue.push(function (m) { self.label(m, text, h.x, h.y, sc * S, bg, fg, style); });
      return;
    }
    var size = Math.max(10, Math.round(5.5 * sc));
    g.font = 'bold ' + size + 'px "Trebuchet MS", "Segoe UI", sans-serif';
    var w = Math.round(g.measureText(text).width + size * 1.1), hgt = Math.round(size * 1.45);
    var x0 = Math.round(x - w / 2), y0 = Math.round(y - size * 1.05), u = Math.max(1, Math.round(size / 10));
    g.save();
    if (style === 'wood') {
      // Träskylt med ram, ådring och två spikar
      roundBox(g, x0 + u * 2, y0 + u * 2, w, hgt, u * 2, 'rgba(20,10,5,0.35)');
      roundBox(g, x0, y0, w, hgt, u * 2, '#6b4426');
      roundBox(g, x0 + u, y0 + u, w - u * 2, hgt - u * 2, u, '#9a6a3c');
      g.fillStyle = 'rgba(255,220,160,0.25)'; g.fillRect(x0 + u * 2, y0 + u * 2, w - u * 4, u);
      g.fillStyle = 'rgba(80,40,10,0.25)'; for (var k = 1; k < 3; k++) g.fillRect(x0 + u * 2, y0 + hgt * k / 3, w - u * 4, u * 0.6);
      g.fillStyle = '#d8c090'; g.fillRect(x0 + u * 2, y0 + hgt / 2 - u / 2, u, u); g.fillRect(x0 + w - u * 3, y0 + hgt / 2 - u / 2, u, u);
      fg = fg || '#fff1c8';
      g.fillStyle = 'rgba(40,20,5,0.7)'; g.textAlign = 'center'; g.fillText(text, Math.round(x) + u, Math.round(y + size * 0.1) + u);
    } else {
      // Mörk "piller"-etikett med tunn ljus kant
      roundBox(g, x0 + u, y0 + u * 2, w, hgt, hgt / 2, 'rgba(0,0,0,0.3)');
      roundBox(g, x0, y0, w, hgt, hgt / 2, bg || 'rgba(34,24,30,0.86)');
      g.lineWidth = u; roundBox(g, x0 + u / 2, y0 + u / 2, w - u, hgt - u, hgt / 2, null, 'rgba(255,240,210,0.28)');
      g.textAlign = 'center';
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillText(text, Math.round(x), Math.round(y + size * 0.1) + u);
    }
    g.fillStyle = fg || '#fff6dc';
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillText(text, Math.round(x), Math.round(y + size * 0.1));
    g.restore();
  };
  W.drawOverlay = function (g) {
    var self = this, t = this.t;
    this.signs.forEach(function (sg) {
      if ((sg[1] > 50) !== (self.site === 'boras')) return;
      var s = self.toScreen(sg[1], sg[2], WALL_H + 0.1);
      self.label(g, sg[0], s.x, s.y, 0.85, null, null, 'wood');
    });
    Object.keys(this.people).forEach(function (n) {
      var p = self.people[n];
      if (!self.npcVisible(n)) return;
      var head = self.toScreen(p.x, p.z, 0);
      var topY = head.y - (p.sit ? 28 : 32);
      var dist = Math.hypot(self.pos.x - p.x, self.pos.z - p.z);
      if (dist < 4.5) self.label(g, n, head.x, topY - 3, 0.8);
      if (p.marker.visible || p.done.visible) {
        // Pratbubbla med utropstecken eller bock som guppar och glänser
        var bob = Math.round(Math.sin(t * 3 + p.phase) * 1.5);
        var bx = head.x, by = topY - 14 + bob;
        var body = p.marker.visible ? '#ffd23f' : '#6fd66f', dark = p.marker.visible ? '#b07a10' : '#2f8a3f';
        g.fillStyle = 'rgba(16,20,60,0.25)'; g.fillRect(bx - 6, by - 6, 14, 12);
        g.fillStyle = K.OUT; g.fillRect(bx - 7, by - 8, 14, 13); g.fillRect(bx - 1, by + 5, 3, 3);
        g.fillStyle = body; g.fillRect(bx - 6, by - 7, 12, 11); g.fillRect(bx, by + 4, 1, 2);
        g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(bx - 5, by - 6, 4, 1); g.fillRect(bx - 5, by - 5, 1, 2);
        g.fillStyle = dark; g.fillRect(bx - 6, by + 3, 12, 1);
        if (p.marker.visible) { g.fillStyle = K.OUT; g.fillRect(bx - 1, by - 5, 2, 5); g.fillRect(bx - 1, by + 1, 2, 2); }
        else { g.fillStyle = K.OUT; g.fillRect(bx - 4, by - 1, 2, 2); g.fillRect(bx - 2, by + 1, 2, 2); g.fillRect(bx, by - 1, 2, 2); g.fillRect(bx + 2, by - 3, 2, 2); }
        if (Math.sin(t * 2 + p.phase) > 0.92) { g.fillStyle = '#ffffff'; g.fillRect(bx + 5, by - 10, 1, 3); g.fillRect(bx + 4, by - 9, 3, 1); }
      }
    });
    // Markering av det du kan använda: en ring på marken och en guldpil
    if (this.hoverSpot && !(this.game.ui && this.game.ui.captures())) {
      var h = this.hoverSpot;
      var gs = this.toScreen(h.x, h.z, 0), pulse = 0.5 + Math.sin(t * 5) * 0.5;
      g.strokeStyle = 'rgba(255,214,90,' + (0.45 + pulse * 0.4) + ')'; g.lineWidth = 1;
      g.beginPath(); g.ellipse(gs.x + 0.5, gs.y + 0.5, 9 + pulse * 2, 4 + pulse, 0, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = 'rgba(255,250,220,' + (0.25 * (1 - pulse)) + ')';
      g.beginPath(); g.ellipse(gs.x + 0.5, gs.y + 0.5, 13 + pulse * 4, 6 + pulse * 2, 0, 0, Math.PI * 2); g.stroke();
      var s = this.toScreen(h.x, h.z, h.inter.type === 'npc' ? 1.75 : 1.3);
      var b = Math.round(Math.sin(t * 6) * 2);
      g.fillStyle = K.OUT;
      g.fillRect(s.x - 5, s.y - 13 + b, 10, 4); g.fillRect(s.x - 4, s.y - 9 + b, 8, 2); g.fillRect(s.x - 3, s.y - 7 + b, 6, 2); g.fillRect(s.x - 1, s.y - 5 + b, 2, 1);
      g.fillStyle = '#f0b429'; g.fillRect(s.x - 4, s.y - 12 + b, 8, 2); g.fillRect(s.x - 3, s.y - 10 + b, 6, 2); g.fillRect(s.x - 2, s.y - 8 + b, 4, 2);
      g.fillStyle = '#ffe9a0'; g.fillRect(s.x - 4, s.y - 12 + b, 3, 1);
      g.fillStyle = '#b07a10'; g.fillRect(s.x + 1, s.y - 8 + b, 1, 2);
    }
    // Mål dit du klickade: ringar som krymper in mot punkten
    if (this.target) {
      var ts = this.toScreen(this.target.x, this.target.z, 0);
      for (var k = 0; k < 2; k++) {
        var f = ((t * 1.6 + k * 0.5) % 1), r = 10 * (1 - f) + 2;
        g.strokeStyle = 'rgba(255,240,180,' + (0.8 * f) + ')'; g.lineWidth = 1;
        g.beginPath(); g.ellipse(ts.x + 0.5, ts.y + 0.5, r, r * 0.45, 0, 0, Math.PI * 2); g.stroke();
      }
      g.fillStyle = '#fff0b4'; g.fillRect(ts.x, ts.y - 1, 1, 3); g.fillRect(ts.x - 1, ts.y, 3, 1);
    }
  };
})();
