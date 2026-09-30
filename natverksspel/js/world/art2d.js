// Pixelkonst för 2D-världen: brus, paletter med dithering, mark, skuggning av föremål,
// vegetation, vatten, figurer och ljus. Allt ritas i kod, inga bildfiler.
NV.art2d = (function () {
  // ------------------------------------------------------------------ Grunder
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function bayer(x, y) { return BAYER[((y & 3) << 2) | (x & 3)] / 16 - 0.469; }
  function hash2(x, y, s) {
    var h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y, s) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, s) { return vnoise(x, y, s) * 0.55 + vnoise(x * 2.03, y * 2.03, s + 7) * 0.3 + vnoise(x * 4.1, y * 4.1, s + 13) * 0.15; }
  function rng(seed) { var s = (seed >>> 0) || 1; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  function rgbOf(c) {
    if (typeof c === 'number') return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
    if (c[0] === '#') { var n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    var m = /(\d+)\D+(\d+)\D+(\d+)/.exec(c); return m ? [+m[1], +m[2], +m[3]] : [128, 128, 128];
  }
  function css(r) { return 'rgb(' + (r[0] | 0) + ',' + (r[1] | 0) + ',' + (r[2] | 0) + ')'; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  // Ljusare/mörkare med en liten färgförskjutning: skuggor drar mot blått, ljus mot gult (som i handritad pixelkonst)
  function tone(c, f) {
    var r = rgbOf(c);
    if (f < 0) { var k = 1 + f; return css([r[0] * k * 0.96 + 4 * -f, r[1] * k * 0.98 + 6 * -f, r[2] * k + 30 * -f]); }
    return css([r[0] + (255 - r[0]) * f, r[1] + (250 - r[1]) * f, r[2] + (215 - r[2]) * f * 0.9]);
  }
  function pal(list) { return list.map(rgbOf); }
  function pick(p, v, x, y, amt) {
    var q = v * p.length + bayer(x, y) * (amt === undefined ? 1 : amt);
    var i = Math.floor(q); if (i < 0) i = 0; if (i >= p.length) i = p.length - 1;
    return p[i];
  }
  function cv(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }

  // Kontur i en mörkare variant av grannens färg ("selective outline") – mjukare än svart kontur
  function selout(c, strength) {
    var g = c.getContext('2d'), w = c.width, h = c.height;
    var img = g.getImageData(0, 0, w, h), d = img.data, o = new Uint8ClampedArray(d);
    var k = strength === undefined ? 0.34 : strength;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var i = (y * w + x) * 4;
      if (d[i + 3] > 20) continue;
      var best = -1;
      var nb = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      for (var n = 0; n < 4; n++) {
        var xx = x + nb[n][0], yy = y + nb[n][1];
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        var j = (yy * w + xx) * 4;
        if (d[j + 3] > 20) { best = j; if (nb[n][1] === 1) break; }
      }
      if (best < 0) continue;
      o[i] = d[best] * k * 0.9; o[i + 1] = d[best + 1] * k * 0.92; o[i + 2] = d[best + 2] * k + 12; o[i + 3] = 255;
    }
    img.data.set(o); g.putImageData(img, 0, 0);
    return c;
  }

  // ------------------------------------------------------------------ Paletter
  var P = {
    grass: pal(['#2c5a24', '#3a7229', '#4a8a2f', '#5da236', '#74b83f', '#8fcc4d', '#a8dc62']),
    grassDark: pal(['#1f4119', '#2c5a24', '#3a7229']),
    dirt: pal(['#7c5230', '#95653a', '#ad7c47', '#c49356', '#d8aa68', '#e6c081']),
    paving: pal(['#8e8a84', '#a09b93', '#b1aca3', '#c1bcb2', '#cfcac0']),
    asphalt: pal(['#34363d', '#3d4048', '#464a52', '#50545d', '#5a5e67']),
    carpet: pal(['#4a5a6c', '#536579', '#5d7086', '#687d93', '#768ca1', '#869cb0']),
    wood: pal(['#8a5028', '#a3622f', '#b8743a', '#c98646', '#d89a55', '#e4ae6a']),
    raised: pal(['#9aa2ac', '#aab2bb', '#bac1c9', '#c9cfd6', '#d8dde2']),
    concrete: pal(['#8b877f', '#98948b', '#a5a197', '#b1ada3', '#bdb9af']),
    tileA: pal(['#d9d0bc', '#e3dbc8', '#ece5d4', '#f4eee0']),
    tileB: pal(['#8fae93', '#9dbb9f', '#abc8ac', '#b8d4b8']),
    water: pal(['#11485c', '#155a6e', '#1a6d80', '#228393', '#2c98a5', '#3fb0b5']),
    soil: pal(['#4a2f1c', '#5a3a23', '#6b462b', '#7c5334']),
    leafGreen: pal(['#1d4a1f', '#285f25', '#34772b', '#438f33', '#56a73c', '#6fc04a', '#8fd65e']),
    leafPink: pal(['#8f3a6e', '#b04e88', '#cc67a2', '#e083ba', '#ee9fcc', '#f7bddd', '#fdd8ec']),
    leafAutumn: pal(['#6b2c16', '#8b3c1b', '#ad5422', '#cc6e2a', '#e08b36', '#f0a947', '#f9c766']),
    leafPine: pal(['#10301f', '#163d27', '#1e4d31', '#285f3b', '#347247', '#448755']),
    bark: pal(['#3b2415', '#523220', '#6a422a', '#835536', '#9b6a44']),
    rock: pal(['#55585f', '#686b72', '#7b7e85', '#8f9299', '#a4a7ad', '#babdc2']),
  };

  // ------------------------------------------------------------------ Mark
  // Material i markkartan
  var M = { GRASS: 0, DIRT: 1, ASPHALT: 2, CARPET: 3, WOOD: 4, RAISED: 5, CONCRETE: 6, TILE: 7, PAVING: 8, WATER: 9, SOIL: 10 };
  // Målar hela markbilden pixel för pixel utifrån materialkartan
  function paintGround(g, map, w, h, seed) {
    var img = g.createImageData(w, h), d = img.data;
    function at(x, y) { if (x < 0 || y < 0 || x >= w || y >= h) return -1; return map[y * w + x]; }
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var m = map[y * w + x], c, v;
        switch (m) {
          case M.GRASS:
            // Stora fläckar + fint korn + lite ljusare ränder som efter en gräsklippare
            v = fbm(x / 70, y / 55, seed) * 0.62 + hash2(x, y, seed) * 0.26 + (Math.floor((x + y * 0.3) / 26) % 2 ? 0.04 : -0.02);
            c = pick(P.grass, v, x, y, 1.2);
            // Grässtrån som hänger ut över stig, asfalt och vatten
            break;
          case M.DIRT:
            v = fbm(x / 22, y / 16, seed + 3) * 0.6 + hash2(x, y, seed + 1) * 0.35;
            c = pick(P.dirt, v, x, y, 1.1);
            break;
          case M.PAVING: {
            // Stenplattor i förband
            var row = Math.floor(y / 7), off = (row % 2) * 6, col = Math.floor((x + off) / 12);
            var gx = (x + off) % 12, gy = y % 7;
            if (gx === 0 || gy === 0) c = P.paving[0];
            else {
              v = 0.35 + hash2(col, row, seed + 9) * 0.45 + vnoise(x / 3, y / 3, seed) * 0.15 + (gy === 1 || gx === 1 ? 0.15 : 0) - (gy === 6 ? 0.12 : 0);
              c = pick(P.paving, v, x, y, 0.7);
            }
            if ((gx === 0 || gy === 0) && hash2(x, y, seed + 4) < 0.12) c = P.grass[2];
            break;
          }
          case M.ASPHALT:
            v = fbm(x / 30, y / 25, seed + 5) * 0.45 + hash2(x, y, seed + 2) * 0.45;
            c = pick(P.asphalt, v, x, y, 0.6);
            break;
          case M.CARPET: {
            // Mönster av små romber
            var px = (x + y) % 8, py = (x - y + 800) % 8;
            var ct = Math.floor(x / 24) + Math.floor(y / 20);
            v = 0.42 + fbm(x / 60, y / 50, seed + 11) * 0.2 + hash2(x, y, seed) * 0.1 + ((px === 0 || py === 0) ? -0.14 : 0) + ((x % 8 === 4 && y % 8 === 4) ? 0.18 : 0) + (ct % 2 ? 0.06 : -0.02);
            c = pick(P.carpet, v, x, y, 0.5);
            break;
          }
          case M.WOOD: {
            var plank = Math.floor(y / 6), py2 = y % 6, shift = Math.floor(hash2(plank, 0, seed) * 40);
            var seg = Math.floor((x + shift) / 44), sx = (x + shift) % 44;
            if (py2 === 5 || sx === 0) { c = P.wood[0]; break; }
            var base = 0.25 + hash2(seg, plank, seed + 3) * 0.45;
            var grain = vnoise(x / 11, y * 1.3, seed + 7) * 0.3;
            v = base + grain + (py2 === 0 ? 0.12 : 0) - (py2 === 4 ? 0.08 : 0);
            if (hash2(seg, plank, seed + 8) < 0.08 && Math.abs(sx - 20) < 2 && py2 === 2) v = 0.02; // kvist
            c = pick(P.wood, v, x, y, 0.6);
            break;
          }
          case M.RAISED: {
            var tx = Math.floor(x / 14), ty = Math.floor(y / 12), ix = x % 14, iy = y % 12;
            var vent = hash2(tx, ty, seed + 21) < 0.16;
            v = 0.55 + hash2(tx, ty, seed) * 0.15;
            if (ix === 0 || iy === 0) v = 0.05; else if (ix === 1 || iy === 1) v = 0.95; else if (ix === 13 || iy === 11) v = 0.18;
            if (vent && ix > 2 && ix < 12 && iy > 2 && iy < 10 && ix % 2 === 0 && iy % 2 === 0) v = 0.02;
            c = pick(P.raised, v, x, y, 0.3);
            break;
          }
          case M.CONCRETE: {
            v = fbm(x / 40, y / 34, seed + 17) * 0.5 + hash2(x, y, seed + 3) * 0.35;
            var stain = fbm(x / 90, y / 80, seed + 31);
            if (stain > 0.66) v -= (stain - 0.66) * 1.6;
            if (x % 96 === 0 || y % 82 === 0) v = 0.02; else if (x % 96 === 1 || y % 82 === 1) v += 0.25;
            c = pick(P.concrete, v, x, y, 0.8);
            break;
          }
          case M.TILE: {
            var tx2 = Math.floor(x / 10), ty2 = Math.floor(y / 9);
            if (x % 10 === 0 || y % 9 === 0) { c = [168, 158, 140]; break; }
            var pl = (tx2 + ty2) % 2 ? P.tileB : P.tileA;
            v = 0.45 + hash2(tx2, ty2, seed) * 0.2 + ((x % 10 === 1 || y % 9 === 1) ? 0.35 : 0) + ((x % 10 === 2 && y % 9 === 2) ? 0.3 : 0);
            c = pick(pl, v, x, y, 0.4);
            break;
          }
          case M.WATER: {
            v = 0.35 + fbm(x / 20, y / 10, seed + 41) * 0.35;
            // Mörkare närmast den bortre kanten (brinkens skugga) och ljusare på grunt vatten
            var up = 0; for (var k = 1; k <= 4; k++) if (at(x, y - k) !== M.WATER) { up = 5 - k; break; }
            v -= up * 0.09;
            var dn = 0; for (var k2 = 1; k2 <= 3; k2++) if (at(x, y + k2) !== M.WATER) { dn = 4 - k2; break; }
            v += dn * 0.1;
            c = pick(P.water, v, x, y, 0.8);
            break;
          }
          case M.SOIL:
            v = fbm(x / 8, y / 6, seed + 51) * 0.5 + hash2(x, y, seed) * 0.4;
            c = pick(P.soil, v, x, y, 1);
            break;
          default:
            c = [80, 80, 80];
        }
        // Grässtrån som hänger ut över andra material utomhus
        if (m === M.DIRT || m === M.ASPHALT || m === M.PAVING || m === M.WATER || m === M.SOIL) {
          for (var k3 = 1; k3 <= 3; k3++) {
            if (at(x, y - k3) === M.GRASS && hash2(x, y + k3 * 7, seed + 77) < (0.75 - k3 * 0.22)) { c = P.grass[k3 === 1 ? 3 : 1]; break; }
          }
          if (at(x, y + 1) === M.GRASS && hash2(x, y, seed + 78) < 0.45) c = P.grass[2];
        }
        // Kantsten mellan asfalt och gräs
        if (m === M.ASPHALT && (at(x, y - 1) === M.GRASS || at(x, y - 2) === M.GRASS)) c = at(x, y - 1) === M.GRASS ? [200, 196, 188] : [120, 118, 116];
        var i = (y * w + x) * 4;
        d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }

  // Detaljer som strös ut på marken efter pixelmålningen
  function groundDetails(g, map, w, h, seed) {
    var r = rng(seed * 31 + 7);
    function at(x, y) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= w || y >= h) return -1; return map[y * w + x]; }
    function px(x, y, c, ww, hh) { g.fillStyle = c; g.fillRect(x | 0, y | 0, ww || 1, hh || 1); }
    var i, x, y, n = w * h;
    // Grästuvor
    for (i = 0; i < n / 70; i++) {
      x = r() * w; y = r() * h;
      if (at(x, y) !== M.GRASS) continue;
      var dk = css(P.grass[1 + Math.floor(r() * 2)]), lt = css(P.grass[4 + Math.floor(r() * 3)]);
      px(x, y - 2, dk, 1, 3); px(x - 1, y - 1, dk, 1, 2); px(x + 1, y - 1, dk, 1, 2); px(x, y - 3, lt); px(x + 2, y - 2, lt);
    }
    // Högt gräs i klungor
    for (i = 0; i < n / 900; i++) {
      x = r() * w; y = r() * h;
      if (at(x, y) !== M.GRASS || at(x, y + 3) !== M.GRASS) continue;
      for (var b = 0; b < 7; b++) {
        var bx = x + (r() - 0.5) * 8, hh = 3 + Math.floor(r() * 4);
        px(bx, y - hh, css(P.grass[1]), 1, hh); px(bx + (r() < 0.5 ? -1 : 1), y - hh - 1, css(P.grass[5]));
      }
    }
    // Blommor i små klungor
    var FL = [['#ffffff', '#ffd23f'], ['#ffe14a', '#e08a10'], ['#6fa8ff', '#ffffff'], ['#ff8ec7', '#fff1a8'], ['#c89bff', '#ffe76a'], ['#ff6b5a', '#ffd23f']];
    for (i = 0; i < n / 520; i++) {
      x = r() * w; y = r() * h;
      if (at(x, y) !== M.GRASS) continue;
      var f = FL[Math.floor(r() * FL.length)], cnt = 2 + Math.floor(r() * 5);
      for (var k = 0; k < cnt; k++) {
        var fx = x + (r() - 0.5) * 10, fy = y + (r() - 0.5) * 6;
        if (at(fx, fy) !== M.GRASS) continue;
        px(fx, fy + 1, css(P.grass[1]), 1, 2);
        if (r() < 0.5) { px(fx - 1, fy, f[0]); px(fx + 1, fy, f[0]); px(fx, fy - 1, f[0]); px(fx, fy + 1, f[0]); px(fx, fy, f[1]); }
        else { px(fx, fy, f[0], 2, 2); px(fx, fy, f[1]); }
      }
    }
    // Klöver
    for (i = 0; i < n / 2600; i++) {
      x = r() * w; y = r() * h;
      if (at(x, y) !== M.GRASS) continue;
      for (var c2 = 0; c2 < 6; c2++) { var cx = x + (r() - 0.5) * 10, cy = y + (r() - 0.5) * 6; px(cx, cy, css(P.grass[5])); px(cx + 1, cy, css(P.grass[6])); px(cx, cy + 1, css(P.grass[4])); }
    }
    // Stenar
    for (i = 0; i < n / 1800; i++) {
      x = r() * w; y = r() * h;
      var mm = at(x, y);
      if (mm !== M.GRASS && mm !== M.DIRT) continue;
      var sw = 2 + Math.floor(r() * 3);
      px(x, y + 1, 'rgba(20,30,20,0.35)', sw + 1, 1);
      px(x, y, css(P.rock[2]), sw, 2); px(x, y, css(P.rock[4]), sw - 1, 1); px(x + sw - 1, y + 1, css(P.rock[1]));
    }
    // Svampar här och där
    for (i = 0; i < n / 9000; i++) {
      x = r() * w; y = r() * h;
      if (at(x, y) !== M.GRASS) continue;
      px(x, y, '#f2eadc', 1, 2); px(x - 1, y - 1, '#d63c2c', 3, 1); px(x - 1, y - 2, '#e8563f', 3, 1); px(x, y - 2, '#ffffff');
    }
    // Småsten och spår i grusgångarna
    for (i = 0; i < n / 60; i++) {
      x = r() * w; y = r() * h;
      if (at(x, y) !== M.DIRT) continue;
      px(x, y, css(P.dirt[5])); px(x + 1, y + 1, css(P.dirt[1]));
    }
    // Sprickor och oljefläckar i asfalten
    for (i = 0; i < n / 5000; i++) {
      x = r() * w; y = r() * h;
      if (at(x, y) !== M.ASPHALT) continue;
      if (r() < 0.6) {
        var cx2 = x, cy2 = y;
        for (var s = 0; s < 14; s++) { px(cx2, cy2, 'rgba(20,20,24,0.8)'); cx2 += r() < 0.5 ? 1 : 0; cy2 += r() < 0.4 ? 1 : (r() < 0.2 ? -1 : 0); if (at(cx2, cy2) !== M.ASPHALT) break; }
      } else {
        g.fillStyle = 'rgba(10,10,20,0.28)'; g.beginPath(); g.ellipse(x, y, 5 + r() * 4, 2 + r() * 2, 0, 0, Math.PI * 2); g.fill();
        px(x - 2, y - 1, 'rgba(120,90,160,0.25)', 2, 1); px(x + 1, y, 'rgba(90,160,140,0.2)', 2, 1);
      }
    }
    // Fläckar och hjulspår på betongen i lagret
    for (i = 0; i < n / 7000; i++) {
      x = r() * w; y = r() * h;
      if (at(x, y) !== M.CONCRETE) continue;
      g.fillStyle = 'rgba(40,36,30,0.12)'; g.fillRect(x | 0, y | 0, 30 + r() * 40, 1); g.fillRect(x | 0, (y | 0) + 5, 30 + r() * 40, 1);
    }
  }

  // ------------------------------------------------------------------ Föremål
  // Skuggad låda i 3/4-vy: ljus från vänster uppifrån, rundade framkanter och AO vid golvet
  function shadeBox(g, W, Dp, Hp, top, front, opts) {
    opts = opts || {};
    var t = rgbOf(top), f = rgbOf(front);
    // Ovansida med lätt brus och ljusare framkant
    for (var y = 0; y < Dp; y++) for (var x = 0; x < W; x++) {
      var v = 0.5 + hash2(x, y, 3) * 0.12 + (y === Dp - 1 ? 0.2 : 0) + (x === 0 ? 0.08 : 0) - (x === W - 1 ? 0.12 : 0) + bayer(x, y) * 0.06;
      g.fillStyle = css(mix(t, v > 0.5 ? [255, 250, 225] : [20, 24, 60], Math.abs(v - 0.5) * 0.9));
      g.fillRect(x, y, 1, 1);
    }
    // Framsida: ljusare upptill, mörkare nertill, ditherad övergång
    for (var yy = 0; yy < Hp; yy++) {
      var k = yy / Math.max(1, Hp - 1);
      for (var xx = 0; xx < W; xx++) {
        var vv = 0.62 - k * 0.3 + bayer(xx, yy) * 0.08 + (xx === 0 ? 0.08 : 0) - (xx === W - 1 ? 0.14 : 0) + (yy === 0 ? 0.18 : 0) - (yy >= Hp - 2 ? 0.18 : 0);
        g.fillStyle = css(mix(f, vv > 0.5 ? [255, 248, 220] : [16, 20, 55], Math.abs(vv - 0.5) * 0.85));
        g.fillRect(xx, Dp + yy, 1, 1);
      }
    }
    // Rundade hörn
    g.clearRect(0, 0, 1, 1); g.clearRect(W - 1, 0, 1, 1);
  }

  // ------------------------------------------------------------------ Vegetation
  // Trädkrona av bollar som skuggas mot ljuset uppe till vänster, med ljusa bladklungor
  function canopy(g, cx, cy, blobs, palette, seed, rim) {
    var r = rng(seed);
    var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9, pts = [];
    blobs.forEach(function (b) { minX = Math.min(minX, b[0] - b[2]); maxX = Math.max(maxX, b[0] + b[2]); minY = Math.min(minY, b[1] - b[2]); maxY = Math.max(maxY, b[1] + b[2]); });
    for (var y = Math.floor(minY); y <= maxY; y++) {
      for (var x = Math.floor(minX); x <= maxX; x++) {
        var best = -1, bv = 0;
        for (var i = 0; i < blobs.length; i++) {
          var b = blobs[i], dx = (x - b[0]) / b[2], dy = (y - b[1]) / b[2], dd = dx * dx + dy * dy;
          // Fransig kant
          var edge = 1 - (vnoise(x / 3.2, y / 3.2, seed + i) - 0.5) * 0.35;
          if (dd <= edge) {
            var light = (-dx * 0.55 - dy * 0.75) * 0.5 + 0.5 - dd * 0.25 + (i / blobs.length) * 0.08;
            if (best < 0 || b[1] > blobs[best][1] - 2 || light > bv) { best = i; bv = light; }
          }
        }
        if (best < 0) continue;
        var leaf = vnoise(x / 2.2, y / 2.2, seed + 99) * 0.28;
        var v = bv * 0.78 + leaf;
        var c = pick(palette, v, x, y, 1.3);
        g.fillStyle = css(c); g.fillRect(x, y, 1, 1);
        pts.push([x, y]);
      }
    }
    // Enstaka ljusa bladspetsar och mörka hål i kronan
    for (var k = 0; k < pts.length / 14; k++) {
      var q = pts[Math.floor(r() * pts.length)], sx = q[0], sy = q[1];
      var up = sy < (minY + maxY) / 2 && sx < (minX + maxX) / 2 + 4;
      g.fillStyle = css(palette[up ? palette.length - 1 : (r() < 0.5 ? 0 : 1)]);
      g.fillRect(sx, sy, up ? 2 : 1, 1);
    }
    return pts;
  }
  function trunk(g, x, y, w, h, seed) {
    for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) {
      var v = 0.25 + (xx / w) * -0.2 + (xx === 1 ? 0.35 : 0) + vnoise(xx / 1.5, (y + yy) / 5, seed) * 0.35 + (xx === w - 1 ? -0.15 : 0);
      g.fillStyle = css(pick(P.bark, v, xx, yy, 0.8)); g.fillRect(x + xx, y + yy, 1, 1);
    }
    // Rötter
    g.fillStyle = css(P.bark[1]); g.fillRect(x - 2, y + h - 2, 2, 2); g.fillRect(x + w, y + h - 2, 2, 2);
    g.fillStyle = css(P.bark[3]); g.fillRect(x - 2, y + h - 2, 1, 1); g.fillRect(x + w, y + h - 2, 1, 1);
  }
  // Tre sorters träd: lövträd, körsbärsträd och gran
  function tree(kind, seed, lean) {
    var r = rng(seed * 97 + 3);
    lean = lean || 0;
    if (kind === 'pine') {
      var c0 = cv(48, 86), g0 = c0.getContext('2d');
      trunk(g0, 21, 64, 6, 18, seed);
      for (var t = 0; t < 5; t++) {
        var ty = 8 + t * 12, tw = 8 + t * 4.5;
        var blobs = [];
        for (var k = 0; k < 5; k++) blobs.push([24 + (k - 2) * tw * 0.36 + lean * (5 - t) / 5, ty + 6 + Math.abs(k - 2) * 2, tw * 0.42 + r() * 2]);
        canopy(g0, 24, ty, blobs, P.leafPine, seed + t * 11);
      }
      return selout(c0, 0.3);
    }
    var c = cv(72, 92), g = c.getContext('2d');
    trunk(g, 32, 50, 8, 38, seed);
    // Grenar
    g.fillStyle = css(P.bark[2]); g.fillRect(26, 50, 6, 2); g.fillRect(40, 46, 7, 2); g.fillRect(24, 48, 2, 2);
    var palette = kind === 'cherry' ? P.leafPink : (kind === 'autumn' ? P.leafAutumn : P.leafGreen);
    var bl = [[36, 34, 20], [21, 38, 13], [51, 38, 13], [36, 20, 14], [26, 25, 12], [47, 25, 12], [36, 44, 12]];
    bl.forEach(function (b) { b[0] += (r() - 0.5) * 4 + lean * (b[1] < 30 ? 1 : 0.5); b[1] += (r() - 0.5) * 3; b[2] += (r() - 0.5) * 3; });
    var pts = canopy(g, 36, 30, bl, palette, seed);
    if (kind === 'cherry') {
      // Små blomklasar och mörkare grenar som syns igenom
      for (var i = 0; i < 46; i++) { var q = pts[Math.floor(r() * pts.length)]; g.fillStyle = r() < 0.5 ? '#fff0f7' : '#ffd1e8'; g.fillRect(q[0], q[1], 1, 1); }
      g.fillStyle = css(P.bark[1]); g.fillRect(30, 38, 1, 6); g.fillRect(43, 36, 1, 5);
    } else if (kind !== 'autumn') {
      // Frukt eller små blommor i några lövträd
      if (seed % 3 === 1) for (var j = 0; j < 9; j++) { var q2 = pts[Math.floor(r() * pts.length)]; g.fillStyle = '#e8453c'; g.fillRect(q2[0], q2[1], 2, 2); g.fillStyle = '#ffb0a0'; g.fillRect(q2[0], q2[1], 1, 1); }
    }
    return selout(c, 0.32);
  }
  function bush(seed, flowers) {
    var r = rng(seed * 31 + 9);
    var c = cv(34, 24), g = c.getContext('2d');
    var pts = canopy(g, 17, 13, [[10, 14, 8], [23, 14, 8], [17, 9, 8], [16, 16, 7]], P.leafGreen, seed + 5);
    if (flowers) {
      var fc = flowers === true ? ['#ff9ccf', '#ffd1e8'] : flowers;
      for (var k = 0; k < 12; k++) { var q = pts[Math.floor(r() * pts.length)]; g.fillStyle = fc[0]; g.fillRect(q[0], q[1], 2, 2); g.fillStyle = fc[1]; g.fillRect(q[0], q[1], 1, 1); }
    }
    return selout(c, 0.32);
  }
  function hedge(w, seed) {
    var c = cv(w, 22), g = c.getContext('2d');
    var bl = [];
    for (var x = 4; x < w - 3; x += 6) bl.push([x, 12, 7]);
    canopy(g, w / 2, 11, bl, P.leafGreen, seed);
    return selout(c, 0.3);
  }
  // Blomsterrabatt: jord med rader av blommor
  function flowerBed(w, h, seed) {
    var r = rng(seed);
    var c = cv(w, h + 6), g = c.getContext('2d');
    g.fillStyle = '#8b6f58'; g.fillRect(0, 4, w, h + 2); g.fillStyle = '#a58a70'; g.fillRect(0, 4, w, 1);
    for (var y = 0; y < h - 1; y++) for (var x = 1; x < w - 1; x++) { g.fillStyle = css(pick(P.soil, fbm(x / 5, y / 4, seed) * 0.6 + hash2(x, y, seed) * 0.4, x, y)); g.fillRect(x, 5 + y, 1, 1); }
    var FL = [['#ff5a78', '#ffd4dc'], ['#ffd23f', '#fff4b0'], ['#8f7bff', '#e4ddff'], ['#ff8a3c', '#ffe0b8'], ['#ffffff', '#ffe06a']];
    for (var row = 0; row < Math.floor(h / 5); row++) {
      var fcol = FL[Math.floor(r() * FL.length)];
      for (var fx = 3; fx < w - 3; fx += 4) {
        var yy = 6 + row * 5 + (r() < 0.5 ? 0 : 1);
        g.fillStyle = css(P.leafGreen[2]); g.fillRect(fx, yy + 1, 1, 3); g.fillRect(fx - 1, yy + 2, 1, 1); g.fillRect(fx + 1, yy + 3, 1, 1);
        g.fillStyle = fcol[0]; g.fillRect(fx - 1, yy - 1, 3, 2); g.fillStyle = fcol[1]; g.fillRect(fx, yy - 1, 1, 1);
      }
    }
    return selout(c, 0.35);
  }

  // ------------------------------------------------------------------ Utomhusföremål
  function rock(seed, w, h) {
    var c = cv(w + 2, h + 2), g = c.getContext('2d');
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var dx = (x - w / 2) / (w / 2), dy = (y - h * 0.6) / (h * 0.6);
      if (dx * dx + dy * dy * 0.9 > 1 - vnoise(x / 2, y / 2, seed) * 0.25) continue;
      var v = 0.55 - dx * 0.25 - dy * 0.3 + vnoise(x / 2.5, y / 2.5, seed + 3) * 0.3;
      g.fillStyle = css(pick(P.rock, v, x, y, 0.9)); g.fillRect(x + 1, y + 1, 1, 1);
    }
    // Mossa ovanpå
    var img = g.getImageData(0, 0, c.width, c.height).data;
    for (var k = 0; k < w / 2; k++) { var mx = 1 + Math.floor(hash2(k, seed, 1) * w), my = 1 + Math.floor(hash2(k, seed, 2) * h * 0.4); if (img[(my * c.width + mx) * 4 + 3] > 0) { g.fillStyle = css(P.leafGreen[3 + (k % 2)]); g.fillRect(mx, my, 1, 1); } }
    return selout(c, 0.32);
  }
  function lampPost() {
    var c = cv(12, 58), g = c.getContext('2d');
    g.fillStyle = '#2a2d33'; g.fillRect(5, 12, 2, 42); g.fillStyle = '#4a4f58'; g.fillRect(5, 12, 1, 42);
    g.fillStyle = '#1f2227'; g.fillRect(3, 52, 6, 4); g.fillStyle = '#3a3e46'; g.fillRect(3, 52, 6, 1);
    g.fillStyle = '#2a2d33'; g.fillRect(2, 4, 8, 3); g.fillRect(3, 2, 6, 2); g.fillRect(5, 0, 2, 2);
    g.fillStyle = '#ffe9a8'; g.fillRect(3, 7, 6, 5); g.fillStyle = '#fff8dc'; g.fillRect(4, 8, 2, 3);
    g.fillStyle = '#2a2d33'; g.fillRect(2, 12, 8, 1);
    return selout(c, 0.4);
  }
  function bench() {
    var c = cv(34, 18), g = c.getContext('2d');
    g.fillStyle = '#2b2f36'; g.fillRect(3, 8, 2, 9); g.fillRect(29, 8, 2, 9);
    for (var i = 0; i < 3; i++) { g.fillStyle = css(P.wood[3 - (i === 2 ? 1 : 0)]); g.fillRect(1, i * 3, 32, 2); g.fillStyle = css(P.wood[5]); g.fillRect(1, i * 3, 32, 1); }
    g.fillStyle = css(P.wood[2]); g.fillRect(1, 10, 32, 3); g.fillStyle = css(P.wood[4]); g.fillRect(1, 10, 32, 1);
    return selout(c, 0.4);
  }
  function fence(len) {
    var c = cv(len, 16), g = c.getContext('2d');
    for (var x = 0; x < len; x += 12) {
      g.fillStyle = css(P.wood[1]); g.fillRect(x, 2, 3, 14); g.fillStyle = css(P.wood[3]); g.fillRect(x, 2, 1, 14); g.fillStyle = css(P.wood[4]); g.fillRect(x, 1, 3, 1);
    }
    g.fillStyle = css(P.wood[2]); g.fillRect(0, 5, len, 2); g.fillRect(0, 10, len, 2);
    g.fillStyle = css(P.wood[4]); g.fillRect(0, 5, len, 1); g.fillRect(0, 10, len, 1);
    return selout(c, 0.4);
  }
  function flagPole(t) {
    var c = cv(30, 80), g = c.getContext('2d');
    g.fillStyle = '#c9ccd2'; g.fillRect(2, 2, 2, 76); g.fillStyle = '#eef0f3'; g.fillRect(2, 2, 1, 76);
    g.fillStyle = '#d6b44a'; g.fillRect(1, 0, 4, 2);
    // Flaggan vajar: ritas om varje gång med en våg
    for (var x = 0; x < 22; x++) {
      var dy = Math.round(Math.sin(t * 5 + x * 0.45) * (x / 22) * 2);
      for (var y = 0; y < 13; y++) {
        var cross = (x >= 6 && x <= 8) || (y >= 5 && y <= 7);
        var col = cross ? '#f3c623' : '#2a6db8';
        if (!cross && Math.sin(t * 5 + x * 0.45) > 0.6 && x > 10) col = '#3a82cf';
        g.fillStyle = col; g.fillRect(4 + x, 4 + y + dy, 1, 1);
      }
    }
    return c;
  }
  function bikeRack() {
    var c = cv(40, 20), g = c.getContext('2d');
    g.fillStyle = '#8f949c'; for (var i = 0; i < 4; i++) { g.fillRect(3 + i * 10, 6, 1, 12); g.fillRect(3 + i * 10, 6, 6, 1); g.fillRect(8 + i * 10, 6, 1, 12); }
    // En cykel
    g.strokeStyle = '#1c1c20'; g.lineWidth = 1;
    g.beginPath(); g.arc(12, 13, 5, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(26, 13, 5, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#d1403a'; g.fillRect(12, 9, 14, 1); g.fillRect(18, 9, 1, 4); g.fillRect(12, 9, 1, 4);
    g.fillStyle = '#222'; g.fillRect(16, 7, 4, 1); g.fillRect(25, 6, 3, 1);
    return selout(c, 0.5);
  }
  function bin() {
    var c = cv(12, 16), g = c.getContext('2d');
    g.fillStyle = '#2f6f45'; g.fillRect(1, 3, 10, 12); g.fillStyle = '#3f8a57'; g.fillRect(1, 3, 3, 12); g.fillStyle = '#23533a'; g.fillRect(9, 3, 2, 12);
    g.fillStyle = '#1b3a28'; g.fillRect(0, 1, 12, 3); g.fillStyle = '#4f9f67'; g.fillRect(0, 1, 12, 1);
    return selout(c, 0.45);
  }
  function lilyPad(seed) {
    var c = cv(9, 6), g = c.getContext('2d');
    g.fillStyle = '#3f8f3a'; g.beginPath(); g.ellipse(4.5, 3, 4, 2.4, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#5fb04d'; g.fillRect(2, 2, 3, 1);
    g.clearRect(4, 1, 2, 2);
    if (seed % 3 === 0) { g.fillStyle = '#ffd6ec'; g.fillRect(5, 1, 2, 2); g.fillStyle = '#fff'; g.fillRect(5, 1, 1, 1); }
    return c;
  }
  function bridgeNS(w, h) {
    var c = cv(w, h + 10), g = c.getContext('2d');
    for (var y = 0; y < h; y += 4) {
      g.fillStyle = css(P.wood[2 + (y / 4) % 2]); g.fillRect(3, y + 6, w - 6, 3);
      g.fillStyle = css(P.wood[5]); g.fillRect(3, y + 6, w - 6, 1);
      g.fillStyle = css(P.wood[0]); g.fillRect(3, y + 9, w - 6, 1);
    }
    [0, w - 3].forEach(function (x) {
      g.fillStyle = css(P.wood[1]); g.fillRect(x, 0, 3, h + 8); g.fillStyle = css(P.wood[4]); g.fillRect(x, 0, 1, h + 8);
      for (var y2 = 0; y2 < h + 6; y2 += 12) { g.fillStyle = css(P.wood[0]); g.fillRect(x, y2, 3, 2); }
    });
    g.fillStyle = 'rgba(10,20,40,0.35)'; g.fillRect(3, h + 7, w - 6, 3);
    return selout(c, 0.4);
  }
  function bridge(w) {
    var c = cv(w, 30), g = c.getContext('2d');
    for (var x = 0; x < w; x += 4) { g.fillStyle = css(P.wood[2 + (x / 4) % 2]); g.fillRect(x, 10, 3, 14); g.fillStyle = css(P.wood[5]); g.fillRect(x, 10, 3, 1); g.fillStyle = css(P.wood[0]); g.fillRect(x + 3, 10, 1, 14); }
    g.fillStyle = css(P.wood[1]); g.fillRect(0, 2, 2, 9); g.fillRect(w - 2, 2, 2, 9); g.fillRect(0, 2, w, 2); g.fillStyle = css(P.wood[4]); g.fillRect(0, 2, w, 1);
    g.fillStyle = css(P.wood[1]); g.fillRect(0, 24, w, 3);
    return selout(c, 0.4);
  }

  // ------------------------------------------------------------------ Figurer
  // Figur med tre toner per färg, markerad ljusriktning, ögon med vitor och selout-kontur
  var FW = 18, FH = 31;
  function person(look, dir, frame, sitting, blink) {
    var c = cv(FW + 2, FH + 2), g = c.getContext('2d');
    g.translate(1, 1);
    function p(x, y, w, h, col) { g.fillStyle = col; g.fillRect(x, y, w, h); }
    var skin = rgbOf(look.skin), hair = rgbOf(look.hair), shirt = rgbOf(look.shirt), pants = rgbOf(look.pants);
    var S = css(skin), Sd = tone(S, -0.2), Sl = tone(S, 0.18);
    var Hh = css(hair), Hd = tone(Hh, -0.3), Hl = tone(Hh, 0.3);
    var Sh = css(shirt), Shd = tone(Sh, -0.25), Shl = tone(Sh, 0.22);
    var Pa = css(pants), Pad = tone(Pa, -0.25), Pal = tone(Pa, 0.15);
    var step = frame % 4, swing = step === 1 ? 1 : (step === 3 ? -1 : 0);
    var bob = (step === 1 || step === 3) ? 1 : 0; // kroppen sjunker lite i varje steg
    if (frame === 4) { bob = 1; swing = 0; }       // andning när figuren står still
    var oy = bob;
    // Ben
    if (!sitting) {
      if (dir === 2 || dir === 3) {
        p(7, 21 + oy, 4, 6 - oy, Pa); p(7 + swing * 2, 21 + oy, 3, 6 - oy, Pad); p(7, 21 + oy, 1, 5, Pal);
        p(6 + swing * 2, 27, 5, 2, '#2a2220'); p(7 - swing, 27, 4, 2, '#3a302b'); p(6 + swing * 2, 27, 2, 1, '#5a4a40');
      } else {
        p(5, 21 + oy, 4, 6 - oy - (swing > 0 ? 1 : 0), Pa); p(10, 21 + oy, 4, 6 - oy - (swing < 0 ? 1 : 0), Pa);
        p(5, 21 + oy, 1, 5, Pal); p(13, 21 + oy, 1, 5, Pad); p(9, 21 + oy, 1, 3, Pad);
        p(4, 27 - (swing > 0 ? 1 : 0), 5, 2, '#2a2220'); p(10, 27 - (swing < 0 ? 1 : 0), 5, 2, '#2a2220');
        p(4, 27 - (swing > 0 ? 1 : 0), 2, 1, '#5a4a40'); p(10, 27 - (swing < 0 ? 1 : 0), 2, 1, '#5a4a40');
      }
    } else {
      p(5, 21, 9, 3, Pa); p(5, 21, 9, 1, Pal);
    }
    // Kropp med skuggning
    p(4, 12 + oy, 11, 10, Sh);
    p(4, 12 + oy, 11, 1, Shl); p(4, 13 + oy, 2, 7, Shl); p(12, 13 + oy, 3, 9, Shd); p(4, 20 + oy, 11, 2, Shd);
    p(8, 12 + oy, 3, 2, Sd); // halsringning
    if (look.vest) { p(4, 13 + oy, 11, 8, '#d7ff3c'); p(4, 17 + oy, 11, 1, '#f4f4f4'); p(12, 13 + oy, 3, 8, '#b4d82c'); p(9, 13 + oy, 1, 8, Sh); }
    if (look.tie) { p(9, 14 + oy, 1, 6, '#c0392b'); p(9, 14 + oy, 1, 1, '#e05a4c'); }
    if (look.lanyard && dir === 0) { p(7, 13 + oy, 1, 4, '#2a6db8'); p(11, 13 + oy, 1, 4, '#2a6db8'); p(8, 17 + oy, 3, 3, '#f4f4f2'); p(8, 17 + oy, 3, 1, '#2a6db8'); }
    // Armar
    if (dir === 2) { p(6 + swing, 13 + oy, 3, 7, Shd); p(6 + swing, 13 + oy, 1, 7, Sh); p(6 + swing, 20 + oy, 3, 2, S); }
    else if (dir === 3) { p(10 - swing, 13 + oy, 3, 7, Shd); p(12 - swing, 13 + oy, 1, 7, Sh); p(10 - swing, 20 + oy, 3, 2, S); }
    else {
      var as = sitting ? 0 : swing;
      p(2, 13 + oy + as, 2, 7, Sh); p(2, 13 + oy + as, 1, 7, Shl); p(15, 13 + oy - as, 2, 7, Shd);
      p(2, 20 + oy + as, 2, 2, S); p(15, 20 + oy - as, 2, 2, Sd);
    }
    // Huvud
    var hy = oy;
    p(5, 2 + hy, 9, 10, S); p(5, 2 + hy, 2, 9, Sl); p(12, 3 + hy, 2, 8, Sd); p(5, 10 + hy, 9, 2, Sd);
    if (dir === 1) {
      p(4, 1 + hy, 11, 10, Hh); p(4, 1 + hy, 11, 2, Hl); p(12, 3 + hy, 3, 8, Hd);
      if (look.long) { p(4, 10 + hy, 11, 5, Hh); p(12, 10 + hy, 3, 5, Hd); }
    } else {
      p(4, 0 + hy, 11, 4, Hh); p(5, 0 + hy, 5, 1, Hl); p(6, 1 + hy, 3, 1, Hl);
      p(4, 3 + hy, 2, 4, Hh); p(13, 3 + hy, 2, 4, Hd);
      if (look.long) { p(3, 4 + hy, 2, 11, Hh); p(14, 4 + hy, 2, 11, Hd); p(3, 4 + hy, 1, 9, Hl); }
      if (dir === 0) {
        if (blink) { p(6, 7 + hy, 2, 1, '#2a1a12'); p(10, 7 + hy, 2, 1, '#2a1a12'); }
        else { p(6, 6 + hy, 2, 2, '#fbfbf6'); p(10, 6 + hy, 2, 2, '#fbfbf6'); p(7, 6 + hy, 1, 2, '#1d1410'); p(10, 6 + hy, 1, 2, '#1d1410'); }
        p(6, 5 + hy, 2, 1, Hd); p(10, 5 + hy, 2, 1, Hd); // ögonbryn
        p(5, 9 + hy, 1, 1, 'rgba(230,110,110,0.55)'); p(12, 9 + hy, 1, 1, 'rgba(230,110,110,0.55)'); // rosiga kinder
        p(8, 10 + hy, 3, 1, tone(S, -0.35)); p(9, 8 + hy, 1, 1, Sd);
      } else if (dir === 2) {
        if (!blink) { p(5, 6 + hy, 2, 2, '#fbfbf6'); p(5, 6 + hy, 1, 2, '#1d1410'); } else p(5, 7 + hy, 2, 1, '#2a1a12');
        p(4, 7 + hy, 1, 2, S); p(10, 0 + hy, 5, 9, Hh); p(13, 1 + hy, 2, 8, Hd); p(10, 0 + hy, 3, 1, Hl);
      } else {
        if (!blink) { p(12, 6 + hy, 2, 2, '#fbfbf6'); p(13, 6 + hy, 1, 2, '#1d1410'); } else p(12, 7 + hy, 2, 1, '#2a1a12');
        p(14, 7 + hy, 1, 2, S); p(4, 0 + hy, 5, 9, Hh); p(4, 0 + hy, 2, 9, Hl);
      }
    }
    if (look.cap) { var C = css(rgbOf(look.cap)); p(4, -1 + hy, 11, 3, C); p(4, -1 + hy, 11, 1, tone(C, 0.25)); if (dir === 0) p(4, 2 + hy, 11, 1, tone(C, -0.35)); if (dir === 2) p(2, 2 + hy, 5, 1, tone(C, -0.35)); if (dir === 3) p(12, 2 + hy, 5, 1, tone(C, -0.35)); }
    if (look.glasses && dir === 0) { p(5, 6 + hy, 4, 3, 'rgba(20,20,30,0.45)'); p(9, 6 + hy, 1, 1, '#222'); p(10, 6 + hy, 4, 3, 'rgba(20,20,30,0.45)'); p(6, 6 + hy, 1, 1, 'rgba(255,255,255,0.7)'); p(11, 6 + hy, 1, 1, 'rgba(255,255,255,0.7)'); }
    if (look.headset && dir === 0) { p(3, 5 + hy, 2, 4, '#222'); p(4, 0 + hy, 11, 1, '#333'); p(5, 9 + hy, 3, 1, '#333'); }
    if (look.beard && dir !== 1) { p(6, 9 + hy, 7, 3, Hd); p(8, 10 + hy, 3, 1, tone(S, -0.35)); }
    return selout(c, 0.3);
  }

  // ------------------------------------------------------------------ Ljus
  // Mjuk ljuspunkt (additiv)
  function glow(g, x, y, r, col, a) {
    var gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(' + col + ',' + a + ')');
    gr.addColorStop(0.45, 'rgba(' + col + ',' + (a * 0.35) + ')');
    gr.addColorStop(1, 'rgba(' + col + ',0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  return {
    bayer: bayer, hash2: hash2, vnoise: vnoise, fbm: fbm, rng: rng, rgbOf: rgbOf, css: css, mix: mix, tone: tone, pick: pick, P: P, M: M, cv: cv,
    selout: selout, paintGround: paintGround, groundDetails: groundDetails, shadeBox: shadeBox,
    tree: tree, canopy: canopy, bush: bush, hedge: hedge, flowerBed: flowerBed, rock: rock, lampPost: lampPost, bench: bench, fence: fence, flagPole: flagPole,
    bikeRack: bikeRack, bin: bin, lilyPad: lilyPad, bridge: bridge, bridgeNS: bridgeNS, person: person, glow: glow, FW: FW, FH: FH,
  };
})();
