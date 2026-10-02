// 2D-världen: pixelgrafik i 3/4-perspektiv, inspirerad av 16-bitarsspel.
// Allt ritas i koden från samma layout som 3D-versionen.
NV.World2D = (function () {
  var S = NV.sim;
  var PPM = 24;          // pixlar per meter i grundupplösning
  var ZS = 0.85;         // djupet (z) trycks ihop lite
  var HS = 0.75;         // höjder ritas uppåt på skärmen
  var WALL_H = 1.45;     // synlig vägghöjd i meter
  var OUT = '#2b1a10';   // konturfärg

  var SITES = {
    gbg: { x0: -21, x1: 21, z0: -18, z1: 14 },
    boras: { x0: 82, x1: 118, z0: -17, z1: 16 },
  };

  // ------------------------------------------------------------------ Hjälpare
  function cv(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
  function rng(seed) { var s = seed >>> 0 || 1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function hex(c) { if (typeof c === 'number') { var s = c.toString(16); while (s.length < 6) s = '0' + s; return '#' + s; } return c; }
  function shade(col, f) {
    col = hex(col);
    var n = parseInt(col.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    return 'rgb(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) + ')';
  }
  // Mörk kontur runt allt som inte är genomskinligt (16-bitarskänsla)
  function outline(c, color) {
    if (!color && NV.art2d) return NV.art2d.selout(c);
    var g = c.getContext('2d');
    var w = c.width, h = c.height;
    var img = g.getImageData(0, 0, w, h), d = img.data;
    var out = g.createImageData(w, h), o = out.data;
    var rgb = [43, 26, 16];
    if (color) { var n = parseInt(color.slice(1), 16); rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var i = (y * w + x) * 4;
      if (d[i + 3] > 20) continue;
      var near = (x > 0 && d[i - 4 + 3] > 20) || (x < w - 1 && d[i + 4 + 3] > 20) || (y > 0 && d[i - w * 4 + 3] > 20) || (y < h - 1 && d[i + w * 4 + 3] > 20);
      if (near) { o[i] = rgb[0]; o[i + 1] = rgb[1]; o[i + 2] = rgb[2]; o[i + 3] = 255; }
    }
    var tmp = cv(w, h); tmp.getContext('2d').putImageData(out, 0, 0);
    g.drawImage(tmp, 0, 0);
    return c;
  }

  // ------------------------------------------------------------------ Markmönster
  function paintFloor(g, x, y, w, h, tex, seed) {
    var r = rng(seed || 7);
    var i, j;
    if (tex === 'carpet') {
      g.fillStyle = '#56607a'; g.fillRect(x, y, w, h);
      for (i = 0; i < w * h / 7; i++) { g.fillStyle = r() < 0.5 ? '#4b546b' : '#636e8a'; g.fillRect(x + Math.floor(r() * w), y + Math.floor(r() * h), 1, 1); }
      g.fillStyle = 'rgba(0,0,0,0.12)';
      for (j = y; j < y + h; j += 48) g.fillRect(x, j, w, 1);
      for (i = x; i < x + w; i += 48) g.fillRect(i, y, 1, h);
    } else if (tex === 'wood') {
      var tones = ['#d08a4c', '#c27c40', '#d69558', '#bd7438'];
      for (j = 0; j < h; j += 6) {
        var off = (j / 6 % 2) * 22;
        for (i = -off; i < w; i += 44) {
          g.fillStyle = tones[Math.floor(r() * tones.length)];
          g.fillRect(x + Math.max(0, i), y + j, Math.min(44, w - Math.max(0, i)), 5);
          g.fillStyle = '#8a4e22'; g.fillRect(x + Math.max(0, i), y + j, 1, 5);
        }
        g.fillStyle = '#8a4e22'; g.fillRect(x, y + j + 5, w, 1);
      }
      for (i = 0; i < w * h / 60; i++) { g.fillStyle = 'rgba(120,60,20,0.35)'; g.fillRect(x + Math.floor(r() * w), y + Math.floor(r() * h), 2, 1); }
    } else if (tex === 'raised') {
      g.fillStyle = '#c7ccd2'; g.fillRect(x, y, w, h);
      for (j = 0; j < h; j += 14) { g.fillStyle = '#9aa1aa'; g.fillRect(x, y + j, w, 1); }
      for (i = 0; i < w; i += 14) { g.fillStyle = '#9aa1aa'; g.fillRect(x + i, y, 1, h); }
      for (i = 0; i < w * h / 30; i++) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + Math.floor(r() * w), y + Math.floor(r() * h), 1, 1); }
    } else if (tex === 'concrete') {
      g.fillStyle = '#aaa69c'; g.fillRect(x, y, w, h);
      for (i = 0; i < w * h / 10; i++) { g.fillStyle = r() < 0.5 ? '#9e9a90' : '#b5b1a7'; g.fillRect(x + Math.floor(r() * w), y + Math.floor(r() * h), 2, 1); }
      g.fillStyle = 'rgba(60,55,50,0.35)';
      for (j = y; j < y + h; j += 96) g.fillRect(x, j, w, 1);
      for (i = x; i < x + w; i += 96) g.fillRect(i, y, 1, h);
    } else if (tex === 'grass') {
      g.fillStyle = '#6fbf3a'; g.fillRect(x, y, w, h);
      for (i = 0; i < w * h / 9; i++) {
        var px = x + Math.floor(r() * w), py = y + Math.floor(r() * h);
        g.fillStyle = r() < 0.5 ? '#5aa72e' : '#82d149';
        g.fillRect(px, py, 1, 2);
      }
      for (i = 0; i < w * h / 70; i++) {
        var tx = x + Math.floor(r() * w), ty = y + Math.floor(r() * h);
        g.fillStyle = '#3f8a25'; g.fillRect(tx, ty, 1, 3); g.fillRect(tx + 2, ty + 1, 1, 2); g.fillRect(tx - 2, ty + 1, 1, 2);
      }
      var fl = ['#ffffff', '#ff9ccf', '#8fc8ff', '#ffe066'];
      for (i = 0; i < w * h / 260; i++) {
        var fx = x + Math.floor(r() * w), fy = y + Math.floor(r() * h);
        g.fillStyle = fl[Math.floor(r() * fl.length)];
        g.fillRect(fx, fy, 2, 2); g.fillStyle = '#fff6a0'; g.fillRect(fx, fy, 1, 1);
      }
    } else if (tex === 'dirt') {
      g.fillStyle = '#e1a646'; g.fillRect(x, y, w, h);
      for (i = 0; i < w * h / 8; i++) { g.fillStyle = r() < 0.5 ? '#d39537' : '#eab45a'; g.fillRect(x + Math.floor(r() * w), y + Math.floor(r() * h), 2, 1); }
      for (i = 0; i < w * h / 120; i++) { var sx = x + Math.floor(r() * w), sy = y + Math.floor(r() * h); g.fillStyle = '#b98a57'; g.fillRect(sx, sy, 3, 2); g.fillStyle = '#d9b27c'; g.fillRect(sx, sy, 2, 1); }
    } else if (tex === 'asphalt') {
      g.fillStyle = '#5d6068'; g.fillRect(x, y, w, h);
      for (i = 0; i < w * h / 8; i++) { g.fillStyle = r() < 0.5 ? '#54575e' : '#676a72'; g.fillRect(x + Math.floor(r() * w), y + Math.floor(r() * h), 1, 1); }
    }
  }
  var WALLCOL = { wall: '#ece3cf', wallTeal: '#3f8588', wallWarm: '#dcc49a', concreteDark: '#8e9195' };

  // ------------------------------------------------------------------ Figurer
  var SPR_W = 16, SPR_H = 28;
  function drawPerson(look, dir, frame, sitting) {
    var c = cv(SPR_W + 2, SPR_H + 2), g = c.getContext('2d');
    g.translate(1, 1);
    function p(x, y, w, h, col) { g.fillStyle = col; g.fillRect(x, y, w, h); }
    var skin = hex(look.skin), hair = hex(look.hair), shirt = hex(look.shirt), pants = hex(look.pants);
    var step = frame % 4, swing = step === 1 ? 1 : (step === 3 ? -1 : 0);
    // Ben och skor
    if (!sitting) {
      if (dir === 2 || dir === 3) {
        p(6, 20, 4, 5, pants); p(6 + swing, 20, 3, 5, shade(pants, -0.15));
        p(5 + swing * 2, 25, 5, 2, '#2a2220'); p(6 - swing, 25, 4, 2, '#3a302b');
      } else {
        p(5, 20, 3, 5 - (swing > 0 ? 1 : 0), pants); p(9, 20, 3, 5 - (swing < 0 ? 1 : 0), pants);
        p(4, 25 - (swing > 0 ? 1 : 0), 4, 2, '#2a2220'); p(9, 25 - (swing < 0 ? 1 : 0), 4, 2, '#2a2220');
      }
    }
    // Kropp
    p(4, 12, 9, 9, shirt);
    p(4, 12, 9, 1, shade(shirt, 0.25));
    p(4, 19, 9, 2, shade(shirt, -0.2));
    if (look.vest) { p(4, 12, 9, 8, '#d7ff3c'); p(4, 16, 9, 1, '#f4f4f4'); p(8, 12, 1, 8, shade(shirt, -0.1)); }
    if (look.tie) { p(8, 13, 1, 6, '#c0392b'); }
    // Armar
    if (dir === 2) { p(5 + swing, 13, 3, 6, shade(shirt, -0.1)); p(5 + swing, 19, 3, 2, skin); }
    else if (dir === 3) { p(9 - swing, 13, 3, 6, shade(shirt, -0.1)); p(9 - swing, 19, 3, 2, skin); }
    else {
      p(2, 13 + (sitting ? 0 : swing), 2, 6, shade(shirt, -0.1)); p(13, 13 - (sitting ? 0 : swing), 2, 6, shade(shirt, -0.1));
      p(2, 19 + (sitting ? 0 : swing), 2, 2, skin); p(13, 19 - (sitting ? 0 : swing), 2, 2, skin);
    }
    // Huvud
    p(4, 2, 9, 10, skin);
    p(4, 10, 9, 2, shade(skin, -0.12));
    if (dir === 1) { p(3, 1, 11, 10, hair); if (look.long) p(3, 10, 11, 4, hair); }
    else {
      p(3, 1, 11, 4, hair); p(3, 4, 2, 4, hair); p(12, 4, 2, 4, hair);
      if (look.long) { p(3, 5, 2, 9, hair); p(12, 5, 2, 9, hair); }
      if (dir === 0) {
        p(6, 7, 1, 2, '#1d1410'); p(10, 7, 1, 2, '#1d1410');
        p(5, 9, 1, 1, shade(skin, -0.2)); p(11, 9, 1, 1, shade(skin, -0.2));
        p(7, 10, 3, 1, shade(skin, -0.3));
      } else if (dir === 2) { p(5, 7, 1, 2, '#1d1410'); p(3, 7, 1, 2, skin); p(10, 1, 4, 8, hair); }
      else { p(11, 7, 1, 2, '#1d1410'); p(13, 7, 1, 2, skin); p(3, 1, 4, 8, hair); }
    }
    if (look.cap) { p(3, 0, 11, 3, look.cap); if (dir === 0) p(3, 3, 11, 1, shade(look.cap, -0.3)); if (dir === 2) p(1, 3, 5, 1, shade(look.cap, -0.3)); if (dir === 3) p(11, 3, 5, 1, shade(look.cap, -0.3)); }
    if (look.glasses && dir === 0) { p(5, 7, 3, 2, 'rgba(20,20,30,0.55)'); p(9, 7, 3, 2, 'rgba(20,20,30,0.55)'); p(8, 7, 1, 1, '#222'); }
    return outline(c);
  }
  function spriteCache(look) {
    var cache = {};
    return function (dir, frame, sitting, blink) {
      var k = dir + ':' + frame + ':' + (sitting ? 1 : 0) + ':' + (blink ? 1 : 0);
      return cache[k] || (cache[k] = NV.art2d.person(look, dir, frame, sitting, blink));
    };
  }

  // ------------------------------------------------------------------ Klotsar (lådor, möbler)
  // Ritar en låda i 3/4-vy. Ankaret är lådans främre vänstra hörn vid golvet.
  function boxSprite(w, d, h, top, front, opts) {
    opts = opts || {};
    var W = Math.max(2, Math.round(w * PPM)), Dp = Math.max(1, Math.round(d * PPM * ZS)), Hp = Math.max(1, Math.round(h * PPM * HS));
    var c = cv(W + 2, Dp + Hp + 2), g = c.getContext('2d');
    g.translate(1, 1);
    NV.art2d.shadeBox(g, W, Dp, Hp, hex(top), hex(front), opts);
    if (opts.stripes) { g.fillStyle = shade(front, -0.1); for (var x = 3; x < W; x += 5) g.fillRect(x, Dp + 1, 1, Hp - 2); }
    if (opts.drawers) { g.fillStyle = shade(front, -0.2); for (var y = Dp + 3; y < Dp + Hp - 2; y += 6) { g.fillRect(2, y, W - 4, 1); g.fillStyle = '#6b6b6b'; g.fillRect(W / 2 - 2, y + 2, 4, 1); g.fillStyle = shade(front, -0.2); } }
    if (opts.fn) opts.fn(g, W, Dp, Hp);
    if (opts.noOutline) return c;
    return outline(c);
  }

  function World2D(canvas, game) {
    this.canvas = canvas;
    this.game = game;
    this.keys = {};
    this.pos = { x: 0, y: 1.65, z: 0 };
    this.dir = 0; this.frame = 0; this.animT = 0;
    this.locked = false;
    this.hover = null;
    this.t = 0;
    this.site = 'gbg';
    this.consoleTarget = null;
    this.people = {};
    this.monitorHist = {};
    this.monitorCv = cv(1024, 576);
    this.slowTimer = 0;
    this.target = null;
    this.stepAcc = 0;
    this.active = false;
    this.yaw = 0;
  }
  var W = World2D.prototype;

  W.init = function () {
    // Samma byggnader som i 3D, men bara som layout
    var b = new NV.building.Builder(new THREE.Scene());
    this.builder = b;
    NV.building.buildGbg(b);
    NV.building.buildBoras(b);
    this.ctx = this.canvas.getContext('2d');
    this.buildSprites();
    this.buildPeople();
    this.collectInteractables();
    this.teleport('gbg');
    this.bindInput();
    this.resize();
    var self = this;
    window.addEventListener('resize', function () { self.resize(); });
  };
  W.resize = function () {
    // Äldre och svagare enheter ritar pixelgrafiken i lägre upplösning
    var P = NV.gfx.profile();
    var dpr = Math.min(window.devicePixelRatio || 1, P.pr >= 1.25 ? 2 : 1);
    this.dpr = dpr;
    this.canvas.width = Math.round(window.innerWidth * dpr);
    this.canvas.height = Math.round(window.innerHeight * dpr);
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
  };
  W.zoomTarget = function () {
    var z = NV.settings.get('zoom2d');
    if (z) return z * this.dpr;
    var auto = Math.max(2, Math.min(5, Math.floor(Math.min(window.innerWidth / (15 * PPM), window.innerHeight / (10 * PPM)))));
    return auto * this.dpr;
  };
  // Zoomen glider mjukt mot målet och landar på ett helt tal (skarpa pixlar)
  W.zoom = function () { return this.zCur || this.zoomTarget(); };
  W.stepZoom = function (dt) {
    var tg = this.zoomTarget();
    if (!this.zCur) this.zCur = tg;
    this.zCur += (tg - this.zCur) * (1 - Math.exp(-dt * 10));
    if (Math.abs(this.zCur - tg) < 0.02) this.zCur = tg;
  };

  // ------------------------------------------------------------------ Mark och statiska föremål
  W.groundFor = function (siteKey) {
    var s = SITES[siteKey], A2 = NV.art2d, M = A2.M;
    var gw = Math.round((s.x1 - s.x0) * PPM), gh = Math.round((s.z1 - s.z0) * PPM * ZS);
    var c = cv(gw, gh), g = c.getContext('2d');
    var self = this;
    function X(x) { return Math.round((x - s.x0) * PPM); }
    function Y(z) { return Math.round((s.z1 - z) * PPM * ZS); }
    function rect(x1, z1, x2, z2) {
      var X0 = (Math.min(x1, x2) - s.x0) * PPM, Y0 = (s.z1 - Math.max(z1, z2)) * PPM * ZS;
      return [Math.round(X0), Math.round(Y0), Math.round(Math.abs(x2 - x1) * PPM), Math.round(Math.abs(z2 - z1) * PPM * ZS)];
    }
    // Materialkarta: ett material per pixel, sedan målas allt med paletter och dithering
    var map = new Uint8Array(gw * gh);
    function fill(x1, z1, x2, z2, m) {
      var a = X(Math.min(x1, x2)), b = X(Math.max(x1, x2)), t = Y(Math.max(z1, z2)), u = Y(Math.min(z1, z2));
      for (var y = Math.max(0, t); y < Math.min(gh, u); y++) for (var x = Math.max(0, a); x < Math.min(gw, b); x++) map[y * gw + x] = m;
    }
    function blob(cx, cz, rx, rz, m, wob, seed) {
      var a = X(cx - rx - 1), b = X(cx + rx + 1), t = Y(cz + rz + 1), u = Y(cz - rz - 1);
      for (var y = Math.max(0, t); y < Math.min(gh, u); y++) for (var x = Math.max(0, a); x < Math.min(gw, b); x++) {
        var wx = x / PPM + s.x0, wz = s.z1 - y / (PPM * ZS);
        var dx = (wx - cx) / rx, dz = (wz - cz) / rz;
        if (dx * dx + dz * dz < 1 + (A2.vnoise(x / 9, y / 9, seed || 5) - 0.5) * (wob || 0)) map[y * gw + x] = m;
      }
    }
    this.waters = this.waters || {};
    var waters = this.waters[siteKey] = [];
    if (siteKey === 'gbg') {
      // Grusgångar, stenlagd entré, parkering och en damm med strand
      fill(-21, -15.4, 21, -12.8, M.DIRT);
      fill(-15.8, -10.9, 15.8, -10, M.DIRT);
      fill(9.2, -18, 11.8, -10, M.PAVING);
      fill(8.2, -11.4, 12.8, -10, M.PAVING);
      fill(13, -18, 21, -12.8, M.ASPHALT);
      fill(-15.6, 10, 15.6, 10.6, M.DIRT);
      blob(-18.3, -1.5, 2.55, 4.4, M.DIRT, 0.5, 3);
      blob(-18.3, -1.5, 2.0, 3.8, M.WATER, 0.35, 4);
      waters.push({ x: -18.3, z: -1.5, rx: 2.0, rz: 3.8 });
      this.builder.colliders.push({ minX: -20.3, maxX: -16.4, minZ: -5.2, maxZ: 2.2 });
      // Rabatter vid entrén
      fill(6.2, -11.8, 8, -11, M.SOIL); fill(13, -11.8, 14.8, -11, M.SOIL);
    } else {
      fill(82, -17, 118, -13, M.ASPHALT);
      fill(84, -1.5, 88, 1.5, M.DIRT);
      fill(112, -3, 118, 3, M.ASPHALT);
      fill(87.4, -12.6, 112.6, 12.6, M.DIRT);
      // Bäck längs norra kanten, med slingrande strand
      for (var sx = 0; sx < gw; sx++) {
        var wx = sx / PPM + s.x0, mid = 14.6 + Math.sin(wx * 0.35) * 0.35 + Math.sin(wx * 0.9) * 0.15;
        var bank = 1.2 + (A2.vnoise(sx / 7, 1, 9) - 0.5) * 0.3, wet = 0.8 + (A2.vnoise(sx / 11, 2, 9) - 0.5) * 0.2;
        for (var sy = Math.max(0, Y(mid + bank)); sy < Math.min(gh, Y(mid - bank)); sy++) {
          var wz = s.z1 - sy / (PPM * ZS);
          map[sy * gw + sx] = Math.abs(wz - mid) < wet ? M.WATER : M.DIRT;
        }
      }
      waters.push({ x: 100, z: 14.6, rx: 18, rz: 0.8, stream: true });
      this.builder.colliders.push({ minX: 82, maxX: 99.1, minZ: 13.7, maxZ: 16 });
      this.builder.colliders.push({ minX: 100.9, maxX: 118, minZ: 13.7, maxZ: 16 });
    }
    // Golv inne
    this.builder.sem.forEach(function (r) {
      if (r.type !== 'floor') return;
      if (r.x1 < s.x0 || r.x1 > s.x1) return;
      var m = { carpet: M.CARPET, wood: M.WOOD, raised: M.RAISED, concrete: M.CONCRETE, concreteDark: M.CONCRETE }[r.tex];
      if (m === undefined) m = M.CARPET;
      fill(r.x1, r.z1, r.x2, r.z2, m);
    });
    if (siteKey === 'gbg') fill(-6, -10, 3, -2, M.TILE);  // fikarummet får kakel
    A2.paintGround(g, map, gw, gh, siteKey === 'gbg' ? 11 : 23);
    A2.groundDetails(g, map, gw, gh, siteKey === 'gbg' ? 5 : 8);
    // Punkter för glitter på vattnet, skum vid stranden och vattenpölar när det regnar
    var wp = [], sp2 = [], pud = [];
    for (var i = 0; i < map.length; i++) {
      var m0 = map[i];
      if (m0 === M.WATER) {
        var xx0 = i % gw, yy0 = (i / gw) | 0;
        var edge = map[i - 1] !== M.WATER || map[i + 1] !== M.WATER || map[i - gw] !== M.WATER || map[i + gw] !== M.WATER;
        if (edge) sp2.push(xx0, yy0);
        else if (A2.hash2(xx0, yy0, 71) < 0.14) wp.push(xx0, yy0);
      } else if ((m0 === M.PAVING || m0 === M.ASPHALT || m0 === M.DIRT) && A2.hash2(i, 3, 91) < 0.00012) pud.push(i % gw, (i / gw) | 0);
    }
    this.waterPts = this.waterPts || {}; this.shorePts = this.shorePts || {}; this.puddles = this.puddles || {};
    this.waterPts[siteKey] = wp; this.shorePts[siteKey] = sp2; this.puddles[siteKey] = pud;
    // Platta föremål (mattor, gula linjer) med lite slitage
    this.builder.sem.forEach(function (r) {
      if (r.type !== 'box' || r.x < s.x0 || r.x > s.x1) return;
      if (r.h < 0.05 && r.y < 0.05) {
        var f = rect(r.x - r.w / 2, r.z - r.d / 2, r.x + r.w / 2, r.z + r.d / 2);
        var col = hex(r.color);
        for (var yy = 0; yy < Math.max(1, f[3]); yy++) for (var xx = 0; xx < Math.max(1, f[2]); xx++) {
          var v = A2.hash2(f[0] + xx, f[1] + yy, 3);
          g.fillStyle = v < 0.08 ? shade(col, -0.25) : (v > 0.94 ? shade(col, 0.2) : col);
          g.fillRect(f[0] + xx, f[1] + yy, 1, 1);
        }
        if (f[3] > 6 && f[2] > 6) { g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(f[0] + 1, f[1] + 1, f[2] - 2, 1); g.fillStyle = 'rgba(0,0,30,0.2)'; g.fillRect(f[0], f[1] + f[3] - 1, f[2], 1); }
      }
    });
    // Parkeringsrutor, brunnslock och målade linjer
    if (siteKey === 'gbg') {
      for (var px = 15; px < 21; px += 2.2) { var pl = rect(px, -18, px + 0.08, -13.5); g.fillStyle = '#e8e6de'; g.fillRect(pl[0], pl[1], 2, pl[3]); g.fillStyle = 'rgba(0,0,0,0.25)'; for (var q = 0; q < pl[3]; q += 3) if (A2.hash2(px * 10, q, 1) < 0.3) g.fillRect(pl[0], pl[1] + q, 2, 1); }
      var hc = rect(13.4, -17.6, 14.6, -16.4); g.fillStyle = '#2f6fb0'; g.fillRect(hc[0], hc[1], hc[2], hc[3]); g.fillStyle = '#f2f2f2'; g.fillRect(hc[0] + 10, hc[1] + 5, 6, 2); g.fillRect(hc[0] + 12, hc[1] + 3, 2, 12);
      manhole(g, X(6), Y(-14.1));
    } else {
      g.fillStyle = '#e4b52a';
      for (var lx = 83; lx < 117; lx += 3) { var yl = rect(lx, -15.05, lx + 1.6, -14.95); g.fillRect(yl[0], yl[1], yl[2], 2); }
      manhole(g, X(96), Y(-15.8));
      var dz = rect(112.2, -3, 117.8, 3);
      for (var sy = 0; sy < dz[3]; sy++) for (var sx = 0; sx < dz[2]; sx++) if (((sx + sy) >> 3) % 2 === 0 && (sx < 4 || sx > dz[2] - 5)) { g.fillStyle = '#e4b52a'; g.fillRect(dz[0] + sx, dz[1] + sy, 1, 1); }
    }
    function manhole(g2, x, y) {
      g2.fillStyle = '#2a2c30'; g2.beginPath(); g2.ellipse(x, y, 9, 7, 0, 0, Math.PI * 2); g2.fill();
      g2.fillStyle = '#4b4e55'; g2.beginPath(); g2.ellipse(x, y, 8, 6, 0, 0, Math.PI * 2); g2.fill();
      g2.fillStyle = '#3a3d43'; for (var k = -5; k <= 5; k += 2) g2.fillRect(x + k, y - 4, 1, 8);
      g2.fillStyle = '#6a6e76'; g2.fillRect(x - 6, y - 5, 5, 1);
    }
    // Mjuk skugga (ambient occlusion) längs väggarnas fot, i ditherade steg
    function ao(x1, z1, x2, z2, dir) {
      var r = rect(x1, z1, x2, z2);
      for (var k = 0; k < 6; k++) {
        var a = [0.26, 0.18, 0.12, 0.08, 0.05, 0.03][k];
        g.fillStyle = 'rgba(20,18,50,' + a + ')';
        if (dir === 'down') g.fillRect(r[0], r[1] + k, r[2], 1);
        else if (dir === 'up') g.fillRect(r[0], r[1] + r[3] - 1 - k, r[2], 1);
        else if (dir === 'right') g.fillRect(r[0] + k, r[1], 1, r[3]);
        else g.fillRect(r[0] + r[2] - 1 - k, r[1], 1, r[3]);
      }
    }
    this.builder.sem.forEach(function (r) {
      if (r.type !== 'wall' && r.type !== 'glass') return;
      var inSite = r.axis === 'x' ? (r.a >= s.x0 - 1 && r.b <= s.x1 + 1 && r.fixed > s.z0 && r.fixed < s.z1) : (r.fixed >= s.x0 && r.fixed <= s.x1);
      if (!inSite) return;
      var t = Math.max(0.16, r.t || 0.12) / 2;
      if (r.axis === 'x') ao(r.a, r.fixed - t - 0.3, r.b, r.fixed - t, 'down');
      else { ao(r.fixed + t, r.a, r.fixed + t + 0.3, r.b, 'right'); ao(r.fixed - t - 0.3, r.a, r.fixed - t, r.b, 'left'); }
    });
    // Byggnadens skugga på gräset (solen står uppe till vänster)
    var B = siteKey === 'gbg' ? [-15, -10, 15, 10] : [88, -12, 112, 12];
    var sh = rect(B[0] + 0.4, B[1] - 0.9, B[2] + 0.9, B[1]);
    var sh2 = rect(B[2], B[1] - 0.9, B[2] + 0.9, B[3] - 0.6);
    [sh, sh2].forEach(function (q) {
      for (var yy = 0; yy < q[3]; yy++) for (var xx = 0; xx < q[2]; xx++) {
        var edge = Math.min(q[3] - yy, q[2] - xx) / 6;
        if (edge < 1 && A2.bayer(q[0] + xx, q[1] + yy) + 0.47 > edge) continue;
        g.fillStyle = 'rgba(16,20,60,0.22)'; g.fillRect(q[0] + xx, q[1] + yy, 1, 1);
      }
    });
    return c;
  };

  W.buildSprites = function () {
    var self = this;
    this.ground = { gbg: this.groundFor('gbg'), boras: this.groundFor('boras') };
    var sp = this.sprites = [];
    function add(canvas, x, z, opts) {
      opts = opts || {};
      var o = { c: canvas, x: x, z: z, w: canvas ? canvas.width / PPM : 1, d: canvas ? canvas.height / (PPM * ZS) : 1, y: opts.y || 0, key: opts.key !== undefined ? opts.key : z, ox: opts.ox || 0, oy: opts.oy !== undefined ? opts.oy : (canvas ? canvas.height : 0), fade: opts.fade, dyn: opts.dyn, rect: opts.rect };
      ['frames', 'shadow', 'light', 'kind', 'sway', 'emit', 'wall', 'noShadow'].forEach(function (k) { if (opts[k] !== undefined) o[k] = opts[k]; });
      sp.push(o);
      return o;
    }
    this.addSprite = add;
    var sem = this.builder.sem;
    var A = this.builder.anchors;
    // Väggar
    sem.forEach(function (r) {
      if (r.type !== 'wall' && r.type !== 'glass') return;
      var glass = r.type === 'glass';
      var col = glass ? '#b9e1ef' : (WALLCOL[r.tex] || '#ece3cf');
      var hh = Math.min(WALL_H, r.h);
      var segs = [], cur = r.a;
      (r.doors || []).forEach(function (d) { segs.push([cur, d[0]]); if (d[2] && d[2] < 2.5 && !glass) segs.push([d[0], d[1], 'lintel']); cur = d[1]; });
      segs.push([cur, r.b]);
      segs.forEach(function (s2) {
        var len = s2[1] - s2[0];
        if (len <= 0.02) return;
        if (s2[2] === 'lintel') return;
        var t = Math.max(0.16, r.t || 0.12);
        if (r.axis === 'x') {
          var c = boxSprite(len, t, hh, '#4a3526', col, { noOutline: glass, fn: function (g, Wd, Dp, Hp) { self.paintWall(g, Wd, Dp, Hp, col, r, glass, s2[0]); } });
          if (glass) { var gg = c.getContext('2d'); gg.globalCompositeOperation = 'destination-in'; gg.fillStyle = 'rgba(0,0,0,0.62)'; gg.fillRect(0, 0, c.width, c.height); }
          add(c, s2[0] - 0.01, r.fixed - t / 2, { key: r.fixed - t / 2, fade: !glass, rect: [s2[0], s2[1]], wall: true });
        } else {
          var c2 = boxSprite(t, len, hh, '#4a3526', col, { fn: function (g, Wd, Dp, Hp) { self.paintWallTop(g, Wd, Dp, Hp, col, glass); } });
          add(c2, r.fixed - t / 2, s2[0], { key: s2[0], fade: !glass, wall: true });
        }
      });
    });
    // Fönster på de väggar som vetter mot oss
    sem.forEach(function (r) {
      if (r.type !== 'window') return;
      if (Math.abs(Math.sin(r.ry)) >= 0.5) return;
      self.addWindow(r);
    });
    // Möbler och övrigt
    sem.forEach(function (r) {
      if (r.type === 'desk') self.addDesk(r);
      else if (r.type === 'chair') self.addChair(r);
      else if (r.type === 'plant') self.addPlant(r.x, r.z, r.s);
      else if (r.type === 'sofa') self.addSofa(r);
      else if (r.type === 'pallet') self.addPallet(r);
      else if (r.type === 'cyl') {
        if (r.y - r.h / 2 > 1.2) return;
        var d = r.r * 2;
        add(boxSprite(d, d, r.h, shade(r.color, 0.1), r.color, { fn: function (g, Wd, Dp) { g.clearRect(0, 0, 1, 1); g.clearRect(Wd - 1, 0, 1, 1); } }), r.x - r.r, r.z - r.r, { y: Math.max(0, r.y - r.h / 2), key: r.z - r.r });
      } else if (r.type === 'box') {
        var base = r.y - r.h / 2;
        var site = r.x > 50 ? 'boras' : 'gbg';
        if (r.h < 0.05 && base < 0.05) return;                  // platt, redan på marken
        if (r.opacity !== undefined && r.opacity < 0.9) return; // glasdörrar ritas separat
        if (site === 'gbg' && base > 2.25) return;               // tak och kabelstege
        if (site === 'boras' && (base > 4.4 || (r.h < 0.08 && base > 2))) return;
        if (r.h > 2 && Math.min(r.w, r.d) < 0.3 && !r.collide) return; // dörrar och tunna stolpar i väggen
        if (r.w < 0.02 || r.d < 0.02) return;
        if (Math.abs(r.x) >= 14.9 || Math.abs(r.z) >= 9.9 || (site === 'boras' && (r.x <= 88.2 || r.x >= 111.8 || Math.abs(r.z) >= 11.8))) { if (r.h < 1) return; }
        var opts = {};
        if (r.tex === 'perforated') opts.stripes = true;
        if (r.h > 0.6 && r.h < 2.1 && r.collide && r.w > 0.5) opts.drawers = r.h < 1.3;
        add(boxSprite(r.w, r.d, r.h, shade(r.color, 0.12), r.color, opts), r.x - r.w / 2, r.z - r.d / 2, { y: base, key: r.z - r.d / 2 });
      }
    });
    // Rack
    [['A', A.rackA], ['B', A.rackB], ['BO', A.borasRack]].forEach(function (p) {
      var a = p[1];
      var rot = Math.abs(Math.sin(a.ry || 0)) > 0.5;
      var w = rot ? 1.0 : 0.6, d = rot ? 0.6 : 1.0;
      var c = boxSprite(w, d, 2.05, '#26292e', '#15171a', { fn: function (g, Wd, Dp, Hp) {
        // Ventilationsgaller på taket, perforerad dörr, handtag, märkning och sockel
        g.fillStyle = '#1d1f23'; for (var x = 2; x < Wd - 2; x += 2) g.fillRect(x, 2, 1, Dp - 4);
        g.fillStyle = '#23262b'; g.fillRect(1, Dp + 1, Wd - 2, Hp - 2);
        for (var y = Dp + 4; y < Dp + Hp - 4; y += 2) for (var x2 = 3; x2 < Wd - 3; x2 += 2) { g.fillStyle = (x2 + y) % 4 === 0 ? '#3a3f47' : '#2c3036'; g.fillRect(x2, y, 1, 1); }
        g.fillStyle = '#9aa0a8'; g.fillRect(Wd - 4, Math.round(Dp + Hp * 0.35), 1, 8); g.fillStyle = '#d0d4da'; g.fillRect(Wd - 4, Math.round(Dp + Hp * 0.35), 1, 2);
        g.fillStyle = '#c8412f'; g.fillRect(3, Dp + 2, 4, 1);
        g.fillStyle = '#0e0f12'; g.fillRect(0, Dp + Hp - 3, Wd, 3);
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(1, Dp + 1, 1, Hp - 4);
      } });
      add(c, a.x - w / 2, a.z - d / 2, { key: a.z - d / 2 });
      self.rackSpots = self.rackSpots || [];
      self.rackSpots.push({ id: p[0], x: a.x, z: a.z, w: w, d: d, front: rot ? 'side' : 'down' });
    });
    // Skrivbord med datorer (samma placering som i 3D)
    Object.keys(A.desks).forEach(function (id) {
      var p = A.desks[id];
      self.addDesk({ x: p.x, z: p.z, ry: 0, color: 0xf1efe9, pc: id.indexOf('PC-') === 0 ? id : null });
      self.addChair({ x: p.x, z: p.z + 0.75, color: id === 'PC-Bo' || id === 'PC-Maja' ? 0x5b3d6b : 0x30343b });
    });
    // Teknikerbänken
    self.addDesk({ x: A.bench.x, z: A.bench.z, ry: Math.PI / 2, color: 0xd8d4cb, laptop: true });
    // Whiteboard (fristående i 2D)
    var wb = boxSprite(0.12, 1.5, 1.3, '#9aa0a6', '#f7f8f6', { fn: function (g, Wd, Dp, Hp) { g.fillStyle = '#f7f8f6'; g.fillRect(0, 0, Wd, Dp); } });
    add(wb, A.whiteboard.x + 0.05, A.whiteboard.z - 0.75, { y: 0.4, key: A.whiteboard.z - 0.75 });
    var board = cv(40, 28), bg = board.getContext('2d');
    // Whiteboard med aluminiumram, en liten nätverksskiss, suddiga rester och pennhylla
    bg.fillStyle = '#b8bec6'; bg.fillRect(0, 0, 40, 26); bg.fillStyle = '#dfe3e8'; bg.fillRect(0, 0, 40, 1);
    bg.fillStyle = '#f7f8f6'; bg.fillRect(2, 2, 36, 22); bg.fillStyle = '#ffffff'; bg.fillRect(3, 3, 12, 1);
    bg.fillStyle = 'rgba(120,130,150,0.18)'; bg.fillRect(20, 16, 12, 3);
    bg.fillStyle = '#1f4e79'; bg.fillRect(5, 5, 6, 4); bg.fillRect(27, 5, 6, 4); bg.fillRect(16, 15, 6, 4);
    bg.fillStyle = '#c0392b'; bg.fillRect(11, 7, 16, 1); bg.fillRect(8, 9, 1, 8); bg.fillRect(8, 17, 8, 1); bg.fillRect(30, 9, 1, 8); bg.fillRect(22, 17, 8, 1);
    bg.fillStyle = '#333'; bg.fillRect(4, 21, 14, 1); bg.fillRect(24, 21, 10, 1);
    bg.fillStyle = '#8a9099'; bg.fillRect(2, 25, 36, 2);
    bg.fillStyle = '#2f6fb0'; bg.fillRect(6, 24, 4, 1); bg.fillStyle = '#c0392b'; bg.fillRect(12, 24, 4, 1); bg.fillStyle = '#2b2d31'; bg.fillRect(30, 24, 5, 1);
    add(outline(board), A.whiteboard.x + 0.25, A.whiteboard.z - 0.8, { y: 0.55, key: A.whiteboard.z - 0.8 });
    // Övervakningsskärm på väggen (uppdateras)
    this.monSprite = { c: cv(38, 22), x: A.monitorWall.x - 0.75, z: -2.12, y: 0.45, key: -2.11 };
    sp.push(this.monSprite);
    // Utemiljö
    if (true) {
      var trees = [[-18, 11], [-17.5, -8], [18, 11], [19, 0], [17.5, -7], [-10, 12.5], [4, 12.6], [-4, -16.2], [5, -16.5], [-14, -16], [20, -11], [-20, 6]];
      trees.forEach(function (t, i) { self.addTree(t[0], t[1], i); });
      var bushes = [[-16, 11.2], [16, 11.2], [8.4, -10.8], [12.6, -10.8], [16.2, 4], [-7, 11], [7, 11], [0, -11], [-6, -11]];
      bushes.forEach(function (b2, i) { self.addBush(b2[0], b2[1], i); });
      [[83.5, -11], [116, 12], [84, 10], [116, -9], [96, 12.9], [107, 12.9], [117, -15.5]].forEach(function (t, i) { self.addTree(t[0], t[1], i + 20); });
      self.addCar(16.4, -15.6, '#c8412f', 'Nordvik');
      self.addCar(84.4, -3.2, '#c8412f', 'Nordvik');
      self.addCar(18.6, -15.6, '#2f6fb0');
      self.addTruck(106, -4.3);
    }
    // Glasdörrar i entrén
    var door = boxSprite(2, 0.16, 1.45, '#4a3526', '#9fd0e3', { fn: function (g, Wd, Dp, Hp) {
      g.fillStyle = '#3a4048'; g.fillRect(0, Dp, Wd, 3); g.fillRect(Wd / 2 - 1, Dp, 2, Hp); g.fillRect(0, Dp, 2, Hp); g.fillRect(Wd - 2, Dp, 2, Hp);
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(5, Dp + 6, 3, 10); g.fillRect(Wd / 2 + 5, Dp + 6, 3, 10);
      g.fillStyle = '#c9ccd0'; g.fillRect(Wd / 2 - 5, Dp + Hp / 2, 2, 6); g.fillRect(Wd / 2 + 3, Dp + Hp / 2, 2, 6);
    } });
    add(door, 9.5, -10.08, { key: -10.08 });
    var door2 = boxSprite(0.2, 1.8, 1.45, '#3c7478', '#3c7478');
    add(door2, 87.9, -0.9, { key: -0.9 });
    // Skyltar
    this.signs = [
      ['SERVERRUM', -10.4, -2], ['FIKARUM', -1.6, -2], ['EKONOMI', -9.4, 2], ['RECEPTION', 7.2, -5.7],
      ['ENTRÉ', 10.5, -10.6], ['Bilen till Borås', 16.4, -13.2], ['PACKBORD', 102, 10.6], ['LAGRETS RACK', 88.6, -11.2], ['Bilen till Göteborg', 84.4, -0.8],
      ['RACK A', -12.4, -8.7], ['RACK B', -11.7, -8.7],
    ];
  };

  W.addDesk = function (r) {
    var rot = Math.abs(Math.sin(r.ry || 0)) > 0.5;
    var w = rot ? 0.8 : 1.6, d = rot ? 1.6 : 0.8;
    var top = hex(r.color || 0xf1efe9);
    var c = boxSprite(w, d, 0.74, top, shade(top, -0.25), { fn: function (g, Wd, Dp, Hp) {
      g.clearRect(3, Dp + 3, Wd - 6, Hp - 3);
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(3, Dp + 3, Wd - 6, Hp - 3);
      g.fillStyle = '#2c2f34'; g.fillRect(1, Dp, 2, Hp); g.fillRect(Wd - 3, Dp, 2, Hp);
    } });
    this.addSprite(c, r.x - w / 2, r.z - d / 2, { key: r.z - d / 2 });
    if (r.pc) this.addSprite(null, r.x - 0.2, r.z + 0.05, { y: 0.74, key: r.z - d / 2 + 0.001, dyn: { pc: r.pc } });
    if (r.laptop) this.addSprite(null, r.x - 0.2, r.z, { y: 0.74, key: r.z - d / 2 + 0.001, dyn: { laptop: true } });
  };
  W.addChair = function (r) {
    var col = hex(r.color || 0x30343b);
    var c = cv(14, 18), g = c.getContext('2d');
    g.fillStyle = col; g.fillRect(2, 0, 10, 9); g.fillStyle = shade(col, 0.2); g.fillRect(2, 0, 10, 1);
    g.fillStyle = shade(col, -0.2); g.fillRect(1, 9, 12, 4);
    g.fillStyle = '#1d1f22'; g.fillRect(6, 13, 2, 3); g.fillRect(2, 16, 10, 1);
    this.addSprite(outline(c), r.x - 0.28, r.z - 0.2, { key: r.z - 0.21 });
  };
  W.addPlant = function (x, z, s) {
    s = s || 1;
    var r = rng(Math.round(x * 13 + z * 7) + 5);
    var w = Math.round(22 * s), h = Math.round(30 * s);
    var c = cv(w, h), g = c.getContext('2d');
    g.fillStyle = '#e7e2d8'; g.fillRect(w / 2 - 5 * s, h - 9 * s, 10 * s, 9 * s);
    g.fillStyle = '#c9c2b4'; g.fillRect(w / 2 - 5 * s, h - 3 * s, 10 * s, 3 * s);
    var greens = ['#2f7a36', '#3f9a44', '#58b653', '#2a6a2f'];
    for (var i = 0; i < 26; i++) {
      var a = r() * Math.PI * 2, rad = r() * 8 * s;
      var px = w / 2 + Math.cos(a) * rad, py = h - 16 * s + Math.sin(a) * rad * 0.8 - r() * 4 * s;
      g.fillStyle = greens[Math.floor(r() * greens.length)];
      g.fillRect(Math.round(px - 2), Math.round(py - 2), 4, 3);
    }
    this.addSprite(outline(c), x - w / PPM / 2, z - 0.15, { key: z - 0.15 });
  };
  W.addSofa = function (r) {
    var col = { fabricBlue: '#34506e', fabricGray: '#5a5f68', fabricMustard: '#b8872e' }[r.tex] || '#b8872e';
    var rot = Math.abs(Math.sin(r.ry || 0)) > 0.5;
    var w = rot ? 0.85 : 2, d = rot ? 2 : 0.85;
    var c = boxSprite(w, d, 0.55, shade(col, 0.1), col, { fn: function (g, Wd, Dp) {
      g.fillStyle = shade(col, -0.2); if (!rot) g.fillRect(0, 0, Wd, 5); else g.fillRect(Wd - 5, 0, 5, Dp);
      g.fillStyle = shade(col, 0.25); for (var k = 1; k < 3; k++) { if (!rot) g.fillRect(Wd * k / 3, 6, 1, Dp - 6); else g.fillRect(0, Dp * k / 3, Wd - 6, 1); }
    } });
    this.addSprite(c, r.x - w / 2, r.z - d / 2, { key: r.z - d / 2 });
  };
  // Pallställ i 3/4-vy: orange stolpar, blå balkar och kartonger på tre nivåer
  W.addPallet = function (r) {
    var rnd = rng(r.seed * 17 + 5);
    var W = Math.round(r.bays * r.bay * PPM), Dp = Math.round(1.1 * PPM * ZS), Hp = Math.round(r.h * PPM * HS);
    var c = cv(W + 2, Dp + Hp + 2), g = c.getContext('2d');
    g.translate(1, 1);
    var boxCols = ['#b98a55', '#a57a48', '#c89d66', '#94693f'];
    var levels = [0.1, 1.45, 2.85];
    for (var bay = 0; bay < r.bays; bay++) {
      var bx = Math.round(bay * r.bay * PPM);
      levels.forEach(function (ly, li) {
        var y = Dp + Hp - Math.round(ly * PPM * HS);
        for (var k = 0; k < 2; k++) {
          if (rnd() < 0.15) continue;
          var bw = Math.round(1.1 * PPM), bh = Math.round((0.55 + rnd() * 0.35) * PPM * HS);
          var x0 = bx + 6 + k * Math.round(1.3 * PPM);
          var col = boxCols[Math.floor(rnd() * 4)];
          g.fillStyle = shade(col, 0.15); g.fillRect(x0, y - bh - 8, bw, 8);
          g.fillStyle = col; g.fillRect(x0, y - bh, bw, bh);
          g.fillStyle = shade(col, -0.2); g.fillRect(x0, y - 2, bw, 2);
          g.fillStyle = '#e7d9b8'; g.fillRect(x0 + bw / 2 - 1, y - bh - 8, 3, bh + 8);
          g.fillStyle = '#2b1a10'; g.fillRect(x0, y - bh - 8, bw, 1); g.fillRect(x0, y - bh - 8, 1, bh + 8); g.fillRect(x0 + bw - 1, y - bh - 8, 1, bh + 8);
        }
        g.fillStyle = '#2b5aa0'; g.fillRect(bx, y - 1, Math.round(r.bay * PPM), 3); g.fillStyle = '#4d7fc7'; g.fillRect(bx, y - 1, Math.round(r.bay * PPM), 1);
      });
    }
    for (var u = 0; u <= r.bays; u++) {
      var ux = Math.min(W - 3, Math.round(u * r.bay * PPM));
      g.fillStyle = '#d96b1f'; g.fillRect(ux, 0, 3, Dp + Hp);
      g.fillStyle = '#f08a3c'; g.fillRect(ux, 0, 1, Dp + Hp);
      for (var hy = 4; hy < Dp + Hp; hy += 6) { g.fillStyle = '#8a3f10'; g.fillRect(ux + 1, hy, 1, 1); }
    }
    this.addSprite(outline(c), r.x0, r.z - 0.55, { key: r.z - 0.55 });
  };
  W.addTree = function (x, z, seed) {
    var r = rng(seed * 97 + 3);
    var c = cv(56, 76), g = c.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.ellipse(28, 70, 20, 6, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7a4a24'; g.fillRect(24, 44, 9, 28); g.fillStyle = '#5c3718'; g.fillRect(24, 44, 3, 28); g.fillStyle = '#9a6234'; g.fillRect(30, 46, 2, 22);
    var pink = seed % 5 === 0;
    var cols = pink ? ['#e58fc6', '#f2b5dd', '#c86aa8', '#fbd4ec'] : ['#2f7a2a', '#3f9a33', '#58b83f', '#246322', '#6fcf4a'];
    var blobs = [[28, 26, 22], [16, 32, 13], [40, 32, 13], [28, 14, 14], [20, 20, 11], [37, 20, 11]];
    blobs.forEach(function (b) { g.fillStyle = cols[0]; g.beginPath(); g.arc(b[0], b[1], b[2], 0, Math.PI * 2); g.fill(); });
    for (var i = 0; i < 160; i++) {
      var a = r() * Math.PI * 2, rad = Math.sqrt(r()) * 22;
      var px = 28 + Math.cos(a) * rad, py = 25 + Math.sin(a) * rad * 0.85;
      g.fillStyle = cols[1 + Math.floor(r() * (cols.length - 1))];
      g.fillRect(Math.round(px), Math.round(py), 2, 2);
    }
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(18, 10, 4, 2); g.fillRect(30, 6, 3, 2);
    this.addSprite(outline(c), x - 56 / PPM / 2, z, { key: z });
    this.builder.colliders.push({ minX: x - 0.25, maxX: x + 0.25, minZ: z - 0.1, maxZ: z + 0.3 });
  };
  W.addBush = function (x, z, seed) {
    var r = rng(seed * 31 + 9);
    var c = cv(30, 22), g = c.getContext('2d');
    var cols = ['#2f7a2a', '#3f9a33', '#58b83f', '#6fcf4a'];
    [[9, 12, 8], [20, 12, 8], [15, 8, 8]].forEach(function (b) { g.fillStyle = cols[0]; g.beginPath(); g.arc(b[0], b[1], b[2], 0, Math.PI * 2); g.fill(); });
    for (var i = 0; i < 60; i++) { g.fillStyle = cols[1 + Math.floor(r() * 3)]; g.fillRect(4 + Math.floor(r() * 22), 2 + Math.floor(r() * 16), 2, 2); }
    if (seed % 2) for (var k = 0; k < 6; k++) { g.fillStyle = '#ff9ccf'; g.fillRect(4 + Math.floor(r() * 22), 3 + Math.floor(r() * 14), 2, 2); }
    this.addSprite(outline(c), x - 0.6, z, { key: z });
  };
  W.addCar = function (x, z, color, text) {
    var c = cv(46, 40), g = c.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(3, 34, 42, 5);
    g.fillStyle = color; g.fillRect(2, 8, 42, 26);
    g.fillStyle = shade(color, 0.2); g.fillRect(2, 8, 42, 3);
    g.fillStyle = '#9fd3f5'; g.fillRect(8, 11, 30, 9); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(10, 12, 6, 2);
    g.fillStyle = shade(color, -0.2); g.fillRect(2, 24, 42, 10);
    g.fillStyle = '#ffe79a'; g.fillRect(4, 26, 5, 3); g.fillRect(37, 26, 5, 3);
    g.fillStyle = '#1b1b1b'; g.fillRect(5, 33, 8, 5); g.fillRect(33, 33, 8, 5);
    if (text) { g.fillStyle = '#fff'; g.fillRect(16, 27, 14, 4); g.fillStyle = color; g.fillRect(18, 28, 10, 2); }
    this.addSprite(outline(c), x - 46 / PPM / 2, z, { key: z });
  };
  W.addTruck = function (x, z) {
    var c = boxSprite(1.2, 0.9, 1.1, '#f0b83a', '#e0a82a', { fn: function (g, Wd, Dp, Hp) { g.fillStyle = '#333'; g.fillRect(0, 0, 3, Dp + Hp); g.fillStyle = '#111'; g.fillRect(4, Dp + Hp - 5, 6, 5); g.fillRect(Wd - 10, Dp + Hp - 5, 6, 5); } });
    this.addSprite(c, x - 0.6, z - 0.45, { key: z - 0.45 });
  };

  // ------------------------------------------------------------------ Personer
  var LOOKS = {
    Anna: { cap: null }, Karim: { glasses: true }, Sara: { lanyard: true }, Lisa: { lanyard: true }, Bo: { tie: true, glasses: true }, Maja: {}, Omar: { beard: true }, Linnea: { headset: true }, Eva: { glasses: true }, Nils: { vest: true },
  };
  W.buildPeople = function () {
    var self = this;
    var A = this.builder.anchors;
    Object.keys(NV.people.CAST).forEach(function (n) {
      var d = NV.people.CAST[n];
      var look = { skin: d.skin, hair: d.hair, shirt: d.shirt, pants: d.pants, long: d.long };
      Object.keys(LOOKS[n] || {}).forEach(function (k) { look[k] = LOOKS[n][k]; });
      if (d.beard) look.beard = true;
      if (d.vest) look.vest = true;
      var pos, sit = !!d.desk;
      if (d.desk) { var p = A.desks[d.desk]; pos = { x: p.x + 0.35, z: p.z + 0.62 }; }
      else pos = { x: d.stand.x, z: d.stand.z };
      var col = { minX: pos.x - 0.25, maxX: pos.x + 0.25, minZ: pos.z - 0.2, maxZ: pos.z + 0.25 };
      self.builder.colliders.push(col);
      self.people[n] = { name: n, def: d, x: pos.x, z: pos.z, sit: sit, spr: spriteCache(look), dir: 0, marker: { visible: false }, done: { visible: false }, phase: Math.random() * 6, col: col };
    });
    this.playerSpr = spriteCache({ skin: 0xf0c8a0, hair: 0x5a3a22, shirt: 0x2f6fb0, pants: 0x33405a, cap: '#d64b3a' });
  };

  // ------------------------------------------------------------------ Interaktion
  W.collectInteractables = function () {
    var A = this.builder.anchors, st = this.game.state;
    var list = [];
    function add(x, z, inter, r) { list.push({ x: x, z: z, inter: inter, r: r || 0.9 }); }
    (this.rackSpots || []).forEach(function (r) { add(r.x, r.z - (r.front === 'down' ? 0.5 : 0) + (r.front === 'side' ? 0 : 0), { type: 'rack', id: r.id }, 1.1); if (r.front === 'side') list[list.length - 1].x += 0.5; });
    add(A.bench.x + 0.3, A.bench.z, { type: 'laptop' }, 1.2);
    Object.keys(A.desks).forEach(function (id) { if (id.indexOf('PC-') === 0) add(A.desks[id].x, A.desks[id].z - 0.3, { type: 'pc', id: id }, 1.0); });
    add(A.guestTable.x, A.guestTable.z, { type: 'pc', id: 'Gast-laptop' }, 1.0);
    if (st.devices['Mini-switch']) add(A.guestTable.x + 0.45, A.guestTable.z + 0.1, { type: 'miniswitch' }, 0.8);
    add(A.phoneCounter.x, A.phoneCounter.z, { type: 'phone' }, 1.0);
    add(A.monitorWall.x, A.monitorWall.z - 0.5, { type: 'monitor' }, 1.2);
    add(A.whiteboard.x + 0.4, A.whiteboard.z, { type: 'whiteboard' }, 1.2);
    add(A.printer.x, A.printer.z - 0.3, { type: 'printer' }, 0.9);
    if (A.water) add(A.water.x, A.water.z + 0.4, { type: 'water' }, 0.9);
    this.vacInter = { x: 0, z: -100, inter: { type: 'vacuum' }, r: 0.8 };
    list.push(this.vacInter);
    // Bilarna på parkeringarna tar dig mellan kontoret och lagret
    add(16.4, -13.7, { type: 'travel', to: 'boras', label: 'Kör till lagret i Borås' }, 1.3);
    add(84.4, -1.3, { type: 'travel', to: 'gbg', label: 'Kör tillbaka till Göteborg' }, 1.3);
    var self = this;
    Object.keys(this.people).forEach(function (n) { var p = self.people[n]; list.push({ x: p.x, z: p.z, inter: { type: 'npc', id: n }, r: 1.1, npc: n }); });
    add(-2.8, -9.2, { type: 'coffee' }, 0.9);
    this.crabInter = { x: 0, z: -100, inter: { type: 'crab' }, r: 0.9, crab: true };
    list.push(this.crabInter);
    this.inters = list;
  };
  W.buildCables = function () { this.collectInteractables(); };
  W.updateCables = function () { this.collectInteractables(); };
  W.drawWhiteboard = function (def) { this.def = def; };

  W.bindInput = function () {
    var self = this;
    document.addEventListener('keydown', function (e) {
      if (!self.active) return;
      if (self.game.ui && self.game.ui.captures()) return;
      self.keys[e.code] = true;
      if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') { self.use(); e.preventDefault(); }
      if (e.code === 'Equal' || e.code === 'NumpadAdd') self.changeZoom(1);
      if (e.code === 'Minus' || e.code === 'NumpadSubtract' || e.code === 'KeyX') self.changeZoom(-1);
      if (e.code === 'KeyZ') self.changeZoom(1);
    });
    document.addEventListener('keyup', function (e) { self.keys[e.code] = false; });
    this.canvas.addEventListener('mousemove', function (e) { self.mouse = { x: e.clientX * self.dpr, y: e.clientY * self.dpr }; });
    this.canvas.addEventListener('mouseleave', function () { self.mouse = null; });
    this.canvas.addEventListener('click', function (e) {
      if (self.game.ui && self.game.ui.captures()) return;
      NV.sfx.unlock();
      var w = self.screenToWorld(e.clientX * self.dpr, e.clientY * self.dpr);
      var hit = self.pickAt(w.x, w.z);
      if (hit) {
        var dist = Math.hypot(hit.x - self.pos.x, hit.z - self.pos.z);
        if (dist < hit.r + 1.6) { self.faceTo(hit.x, hit.z); self.game.onInteract(hit.inter); return; }
        if (self.walkTo) self.walkTo(hit.x, hit.z - 0.6, hit); else self.target = { x: hit.x, z: hit.z - 0.6, then: hit };
        return;
      }
      if (self.clickWalk) self.clickWalk(w.x, w.z, e.shiftKey); else self.target = { x: w.x, z: w.z };
    });
    this.canvas.addEventListener('wheel', function (e) { if (self.active) { self.changeZoom(e.deltaY < 0 ? 1 : -1); e.preventDefault(); } }, { passive: false });
  };
  W.changeZoom = function (d) {
    var base = NV.settings.get('zoom2d') || Math.round(this.zoomTarget() / this.dpr);
    NV.settings.set('zoom2d', Math.max(1, Math.min(7, base + d)));
  };
  W.lock = function () {};
  W.unlock = function () { this.keys = {}; };
  W.setActive = function (on) { this.active = on; this.canvas.style.display = on ? 'block' : 'none'; if (!on) this.keys = {}; };
  W.applySettings = function () {};
  W.use = function () { if (this.hover && this.game.onInteract) this.game.onInteract(this.hover); };
  W.faceTo = function (x, z) {
    var dx = x - this.pos.x, dz = z - this.pos.z;
    if (Math.abs(dx) > Math.abs(dz)) this.dir = dx < 0 ? 2 : 3; else this.dir = dz < 0 ? 0 : 1;
  };
  W.teleport = function (site) {
    var A = this.builder.anchors;
    if (site === 'boras') { this.pos.x = 89.6; this.pos.z = 0; this.dir = 3; }
    else { this.pos.x = -9.5; this.pos.z = -1.2; this.dir = 0; }
    this.site = site;
    this.target = null;
    this.cam = null;
  };
  W.collides = function (x, z, r) {
    var cs = this.builder.colliders;
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i];
      if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return true;
    }
    var s = SITES[this.site];
    return x < s.x0 + 0.5 || x > s.x1 - 0.5 || z < s.z0 + 0.5 || z > s.z1 - 0.5;
  };
  W.zone = function () {
    var z = this.builder.zones;
    for (var i = 0; i < z.length; i++) {
      var q = z[i];
      if (this.pos.x >= q.minX && this.pos.x <= q.maxX && this.pos.z >= q.minZ && this.pos.z <= q.maxZ) return q;
    }
    return { name: this.site === 'boras' ? 'Utanför lagret' : 'Utanför kontoret', site: this.site };
  };

  W.move = function (dt) {
    var k = this.keys;
    var joy = NV.touch ? NV.touch.joy : { x: 0, y: 0 };
    var dx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0) + joy.x;
    var dz = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0) - joy.y;
    if (Math.abs(dx) < 0.15) dx = 0; if (Math.abs(dz) < 0.15) dz = 0;
    if (dx || dz) { this.target = null; this.path = null; }
    var stepCap = Infinity;
    if (!dx && !dz && this.target) {
      // Följ vägen punkt för punkt; sista punkten är målet
      while (this.path && this.path.length > 1 && Math.hypot(this.path[0].x - this.pos.x, this.path[0].z - this.pos.z) < 0.02) this.path.shift();
      var wp = this.path && this.path.length ? this.path[0] : this.target;
      var tx = wp.x - this.pos.x, tz = wp.z - this.pos.z;
      var d = Math.hypot(tx, tz);
      var last = !this.path || this.path.length <= 1;
      if (last && d < 0.15) {
        var then = this.target.then;
        this.target = null; this.path = null;
        if (then && Math.hypot(then.x - this.pos.x, then.z - this.pos.z) < then.r + 1.6) { this.faceTo(then.x, then.z); this.game.onInteract(then.inter); }
      } else if (d > 0.001) { dx = tx / d; dz = tz / d; stepCap = d; }
    }
    var speed = (k.ShiftLeft || k.ShiftRight || this.game.touchRun || (this.target && this.runPath)) ? 5 : 3.2;
    // Smyg med C: långsamt och tyst, så att krabban och katten inte märker dig
    this.sneak = !!k.KeyC;
    if (this.sneak) speed = 1.5;
    if (this.game.boosted && this.game.boosted()) speed *= 1.3;
    var len = Math.hypot(dx, dz);
    var moving = false;
    if (len > 0) {
      dx /= len; dz /= len;
      var ox = this.pos.x, oz = this.pos.z;
      // Mjuk start: farten byggs upp under en dryg tiondels sekund
      this.accel = Math.min(1, (this.accel || 0) + dt * 8);
      speed *= 0.35 + 0.65 * this.accel;
      // Landa exakt på vägens hörn i stället för att skära dem (annars fastnar man i dörröppningar)
      var step = Math.min(speed * dt, stepCap);
      var nx = this.pos.x + dx * step, nz = this.pos.z + dz * step;
      var r = 0.22;
      var movedX = false, movedZ = false;
      // Står du redan inne i ett hinder (t.ex. om Omar gick in i dig) får du gå ut ur det
      var trapped = this.collides(this.pos.x, this.pos.z, r);
      if (trapped || !this.collides(nx, this.pos.z, r)) { this.pos.x = nx; movedX = true; }
      if (trapped || !this.collides(this.pos.x, nz, r)) { this.pos.z = nz; movedZ = true; }
      // Hörnhjälp: går du rakt mot ett hörn glider du runt det i stället för att stanna
      if (!this.target && !movedX && !movedZ) {
        var sideStep = step * 0.8;
        if (Math.abs(dx) > Math.abs(dz)) { [0.18, -0.18].some(function (o) { if (!this.collides(nx, this.pos.z + o, r)) { this.pos.z += Math.sign(o) * sideStep; movedZ = true; return true; } return false; }, this); }
        else { [0.18, -0.18].some(function (o) { if (!this.collides(this.pos.x + o, nz, r)) { this.pos.x += Math.sign(o) * sideStep; movedX = true; return true; } return false; }, this); }
      }
      moving = movedX || movedZ;
      // Fastnar du (t.ex. bakom Omar) planeras vägen om, högst tre gånger
      var got = Math.hypot(this.pos.x - ox, this.pos.z - oz), want = step;
      if (this.target && got < want * 0.3) this.pathStuck = (this.pathStuck || 0) + dt; else this.pathStuck = 0;
      if (this.target && this.pathStuck > 0.3) {
        this.pathStuck = 0;
        var tg = this.target;
        if ((this.pathReplans || 0) >= 3 || !this.walkTo || !this.walkTo(tg.x, tg.z, tg.then, true)) { this.target = null; this.path = null; }
      }
      if (!moving && this.target && !this.walkTo) this.target = null;
      if (Math.abs(dx) > Math.abs(dz)) this.dir = dx < 0 ? 2 : 3; else this.dir = dz < 0 ? 0 : 1;
    }
    // Kameran tittar lite framåt åt det håll du går
    var lk = 1 - Math.exp(-dt * 2.5), look = moving && NV.settings.get('lookAhead') !== false, lx = look ? dx * 1.1 : 0, lz = look ? dz * 0.8 : 0;
    this.lookX = (this.lookX || 0) + (lx - (this.lookX || 0)) * lk; this.lookZ = (this.lookZ || 0) + (lz - (this.lookZ || 0)) * lk;
    if (!moving) this.accel = 0;
    if (moving) {
      this.animT += dt * speed * 2.2;
      this.frame = Math.floor(this.animT) % 4;
      this.stepAcc += dt * speed;
      if (this.stepAcc > 0.8) {
        this.stepAcc = 0;
        var zn = this.zone().name;
        NV.sfx.step({ Serverrummet: 'metal', Fikarummet: 'wood', Receptionen: 'wood', Lagerkontoret: 'wood', 'Lagret i Borås': 'concrete' }[zn] || (/Utanför/.test(zn) ? 'concrete' : 'carpet'));
        if (speed > 4 || /Utanför|Borås/.test(zn)) this.dust(this.pos.x, this.pos.z);
      }
      if (this.game.addDistance) this.game.addDistance(Math.hypot(dx, dz) * speed * dt);
    } else { this.frame = 0; this.animT = 0; }
    this.yaw = [0, Math.PI, Math.PI / 2, -Math.PI / 2][this.dir];
  };

  W.pickAt = function (x, z) {
    var best = null, bd = 99;
    (this.inters || []).forEach(function (c) {
      var d = Math.hypot(c.x - x, (c.z - z) * 1.2);
      if (d < 0.9 && d < bd) { bd = d; best = c; }
    });
    return best;
  };
  W.pick = function () {
    var self = this;
    var st = this.game.state;
    // Muspekaren över ett föremål inom räckhåll
    if (this.mouse && !(this.game.ui && this.game.ui.captures())) {
      var w = this.screenToWorld(this.mouse.x, this.mouse.y);
      var h = this.pickAt(w.x, w.z);
      if (h && Math.hypot(h.x - this.pos.x, h.z - this.pos.z) < h.r + 1.6) { this.hoverSpot = h; return h.inter; }
    }
    var fx = [0, 0, -1, 1][this.dir], fz = [-1, 1, 0, 0][this.dir];
    var best = null, bs = -1;
    (this.inters || []).forEach(function (c) {
      if (c.inter.type === 'npc' && self.people[c.npc] && !self.npcVisible(c.npc)) return;
      if (c.inter.type === 'miniswitch' && !st.devices['Mini-switch']) return;
      if (c.crab && !(self.game.crab && self.game.crab.active && self.game.crab.site === self.site)) return;
      var dx = c.x - self.pos.x, dz = c.z - self.pos.z;
      var d = Math.hypot(dx, dz);
      if (d > c.r + 0.6) return;
      var dot = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
      var score = dot * 1.2 - d;
      if (dot > -0.2 && score > bs) { bs = score; best = c; }
    });
    this.hoverSpot = best;
    return best ? best.inter : null;
  };
  W.npcVisible = function (n) { var p = this.people[n]; return !p.def.weeks || p.def.weeks.indexOf(this.game.week) >= 0; };

  // ------------------------------------------------------------------ Kamera och ritning
  W.scale = function () { return PPM * this.zoom(); };
  // Världen ritas i en liten pixelbuffert (1 bildpunkt = 1 konstpixel) som sedan förstoras
  // med skarpa kanter. Kameran rör sig i hela pixlar i bufferten och resten av rörelsen
  // läggs på när bufferten förstoras – mjuk scrollning utan att pixlarna darrar.
  W.screenToWorld = function (sx, sy) {
    var v = this.view;
    if (!v) return { x: this.pos.x, z: this.pos.z };
    var cw = this.canvas.width, ch = this.canvas.height;
    return { x: ((sx - cw / 2) / v.S + v.fx + v.cx0) / PPM, z: (v.cz0 - (sy - ch / 2) / v.S + v.fy) / (PPM * ZS) };
  };
  W.toScreen = function (x, z, y) {
    var v = this.view;
    return { x: Math.round(x * PPM) - v.cx0 + v.hw, y: v.cz0 - Math.round(z * PPM * ZS) + v.hh - Math.round((y || 0) * PPM * HS) };
  };
  // Från pixelbufferten till skärmen (för text och annat som ritas i full upplösning)
  W.hi = function (p) {
    var v = this.view;
    return { x: (p.x - v.hw - v.fx) * v.S + this.canvas.width / 2, y: (p.y - v.hh + v.fy) * v.S + this.canvas.height / 2 };
  };

  W.drawPC = function (g, s, id, sc) {
    var st = this.game.state;
    var D = S.get(st);
    var ep = D.eps['E:' + id + ':nic'];
    var c = S.hostIpConf(st.devices[id] || {});
    var col = !ep || !ep.up ? '#e2463b' : (!c || c.apipa ? '#f0b429' : '#4fc3f7');
    function p(x, y, w, h, color) { g.fillStyle = color; g.fillRect(s.x + x * sc, s.y + y * sc, w * sc, h * sc); }
    // Skärmens baksida (personen sitter på andra sidan) med en statuslampa
    p(-4, -10, 13, 8, '#2b1a10'); p(-3, -9, 11, 6, '#3a3d42'); p(-2, -8, 3, 1, '#55595f');
    p(5, -8, 2, 2, col);
    if (col !== '#4fc3f7' && Math.floor(this.t * 2) % 2) p(4, -9, 4, 4, col);
    p(1, -2, 3, 2, '#1b1d21'); p(8, -1, 10, 2, '#3a3d42');
  };
  W.drawLaptop = function (g, s, sc) {
    function p(x, y, w, h, color) { g.fillStyle = color; g.fillRect(s.x + x * sc, s.y + y * sc, w * sc, h * sc); }
    p(0, -10, 14, 9, '#2b2d31'); p(1, -9, 12, 7, '#300a24'); p(2, -8, 6, 1, '#8fe388'); p(2, -6, 8, 1, '#e8e8e8'); p(0, -1, 16, 3, '#45484e');
    p(17, -2, 4, 3, '#7fc6f0');
  };

  // Om ritningen kraschar i en webbläsare stängs effekterna av och bilden ritas ändå;
  // kraschar det igen visas felet på skärmen i stället för en svart bild.
  W.render = function () {
    try { this.renderFrame(); this.renderOk = true; }
    catch (e) {
      if (!this.safeMode) { this.safeMode = true; if (window.console) console.error('2D: effekterna stängs av efter fel', e); try { this.renderFrame(); return; } catch (e2) { e = e2; } }
      if (window.console && !this.errLogged) { this.errLogged = true; console.error('2D-ritningen misslyckades', e); }
      var m = this.ctx, cw = this.canvas.width, ch = this.canvas.height;
      m.setTransform(1, 0, 0, 1, 0, 0); m.globalAlpha = 1; m.globalCompositeOperation = 'source-over';
      m.fillStyle = '#1b2430'; m.fillRect(0, 0, cw, ch);
      m.fillStyle = '#ffd23f'; m.font = 'bold ' + Math.round(16 * (this.dpr || 1)) + 'px sans-serif'; m.textAlign = 'center';
      m.fillText('2D-grafiken kunde inte ritas: ' + (e && e.message ? e.message : e), cw / 2, ch / 2);
      m.fillText('Byt till 3D i inställningarna eller ladda om sidan.', cw / 2, ch / 2 + 28 * (this.dpr || 1));
      m.textAlign = 'left';
    }
  };
  W.renderFrame = function () {
    var main = this.ctx, cw = this.canvas.width, ch = this.canvas.height;
    var S = this.zoom();
    var siteKey = this.site, site = SITES[siteKey];
    // Pixelbufferns storlek (lite marginal så att kanterna alltid täcks)
    var vw = Math.ceil(cw / S) + 2, vh = Math.ceil(ch / S) + 2;
    if (!this.low || this.low.width !== vw || this.low.height !== vh) { this.low = cv(vw, vh); this.lowG = this.low.getContext('2d'); }
    var g = this.lowG;
    // Kameran följer mjukt och håller sig inom kartan
    var want = { x: this.pos.x + (this.lookX || 0), z: this.pos.z + (this.lookZ || 0) };
    var halfW = (cw / S) / 2 / PPM, halfH = (ch / S) / 2 / (PPM * ZS);
    want.x = Math.max(site.x0 + halfW, Math.min(site.x1 - halfW, want.x));
    want.z = Math.max(site.z0 + halfH, Math.min(site.z1 - halfH, want.z));
    if ((site.x1 - site.x0) < halfW * 2) want.x = (site.x0 + site.x1) / 2;
    if ((site.z1 - site.z0) < halfH * 2) want.z = (site.z0 + site.z1) / 2;
    if (!this.cam) this.cam = { x: want.x, z: want.z };
    var k = 1 - Math.exp(-(this.frameDt || 0.016) * 9);
    this.cam.x += (want.x - this.cam.x) * k;
    this.cam.z += (want.z - this.cam.z) * k;
    this.shakeA = Math.max(0, (this.shakeA || 0) - 0.03);
    var camX = this.cam.x + (Math.random() - 0.5) * this.shakeA * this.shakeA * 0.6, camZ = this.cam.z + (Math.random() - 0.5) * this.shakeA * this.shakeA * 0.6;
    var cxf = camX * PPM, czf = camZ * PPM * ZS;
    var cx0 = Math.floor(cxf), cz0 = Math.floor(czf);
    this.view = { S: S, vw: vw, vh: vh, hw: Math.floor(vw / 2), hh: Math.floor(vh / 2), cx0: cx0, cz0: cz0, fx: cxf - cx0, fy: czf - cz0 };
    this.hiQueue = [];
    this.inLow = true;
    var sc = 1;
    g.imageSmoothingEnabled = false;
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#3f8a25'; g.fillRect(0, 0, vw, vh);
    // Mark
    var gr = this.ground[siteKey];
    var gx = cx0 - this.view.hw - Math.round(site.x0 * PPM), gy = Math.round(site.z1 * PPM * ZS) - cz0 - this.view.hh;
    var sx0 = Math.max(0, gx), sy0 = Math.max(0, gy), sx1 = Math.min(gr.width, gx + vw), sy1 = Math.min(gr.height, gy + vh);
    if (sx1 > sx0 && sy1 > sy0) g.drawImage(gr, sx0, sy0, sx1 - sx0, sy1 - sy0, sx0 - gx, sy0 - gy, sx1 - sx0, sy1 - sy0);
    this.gOff = [gx, gy];
    if (this.drawGroundFx && !this.safeMode) this.drawGroundFx(g);
    // Figurer och föremål, sorterade bakifrån och framåt
    var self = this, st = this.game.state;
    var list = [];
    halfW = vw / 2 / PPM; halfH = vh / 2 / (PPM * ZS);
    var minX = camX - halfW - 4, maxX = camX + halfW + 4, minZ = camZ - halfH - 4, maxZ = camZ + halfH + 6;
    this.visMin = { x: minX, z: minZ }; this.visMax = { x: maxX, z: maxZ };
    this.sprites.forEach(function (s) {
      if (s.x + (s.w || 1) < minX || s.x - (s.ox || 0) / PPM > maxX || s.z + (s.d || 1) < minZ || s.z - 6 > maxZ) return;
      list.push(s);
    });
    Object.keys(this.people).forEach(function (n) {
      var p = self.people[n];
      if (!self.npcVisible(n)) return;
      if (p.x < minX || p.x > maxX) return;
      list.push({ person: p, x: p.x, z: p.z, key: p.z - 0.001 });
    });
    list.push({ player: true, x: this.pos.x, z: this.pos.z, key: this.pos.z - 0.002 });
    var cr = this.game.crab;
    if (cr && cr.active && cr.site === this.site) list.push({ crab: true, x: cr.x, z: cr.z, key: cr.z - 0.003 });
    var vc = this.game.vac;
    if (vc && this.site === 'gbg') list.push({ vac: true, x: vc.x, z: vc.z, key: vc.z - 0.004 });
    this.swayOn = NV.gfx.profile().sway;
    if (this.drawShadows && !this.safeMode) this.drawShadows(g, list);
    list.sort(function (a, b) { return b.key - a.key; });
    list.forEach(function (s) {
      if (s.player) { var pf = self.frame || (Math.sin(self.t * 2.1) > 0.55 ? 4 : 0); self.drawChar(g, self.playerSpr(self.dir, pf, false, self.t % 3.7 < 0.13), self.pos.x, self.pos.z, sc, false); return; }
      if (s.crab) { self.drawCrab(g, sc); return; }
      if (s.vac) { self.drawVac(g, sc); return; }
      if (s.person) {
        var p = s.person;
        var d = p.sit ? 1 : 0;
        if (!p.sit) {
          var dd = Math.hypot(self.pos.x - p.x, self.pos.z - p.z);
          if (p.walking) d = p.wdir;
          else if (dd < 2.5) { var dxp = self.pos.x - p.x, dzp = self.pos.z - p.z; d = Math.abs(dxp) > Math.abs(dzp) ? (dxp < 0 ? 2 : 3) : (dzp < 0 ? 0 : 1); } else d = 0;
        } else {
          // Den som sitter vänder huvudet mot dig när du står bredvid
          var ds = Math.hypot(self.pos.x - p.x, self.pos.z - p.z);
          d = ds < 2.2 && Math.abs(self.pos.x - p.x) > 0.5 ? (self.pos.x < p.x ? 2 : 3) : 0;
        }
        var frame = p.walking ? Math.floor(self.t * 8) % 4 : (Math.sin(self.t * 2.1 + p.phase) > 0.55 ? 4 : 0);
        self.drawChar(g, p.spr(d, frame, p.sit, (self.t + p.phase * 1.7) % 4.3 < 0.14), p.x, p.z, sc, p.sit, p);
        return;
      }
      if (s.dyn) {
        var sp = self.toScreen(s.x, s.z, s.y);
        if (s.dyn.pc) self.drawPC(g, sp, s.dyn.pc, sc);
        if (s.dyn.laptop) self.drawLaptop(g, sp, sc);
        if (s.dyn.draw) s.dyn.draw.call(self, g, sp, s);
        return;
      }
      if (s === self.monSprite) { self.drawMonSprite(g, sc); return; }
      var p2 = self.toScreen(s.x, s.z, s.y);
      var alpha = 1;
      if (s.fade && s.rect) {
        // Väggen blir genomskinlig när du står bakom den
        var bz = s.z, top = bz + WALL_H * HS / ZS;
        if (self.pos.x > s.rect[0] - 0.2 && self.pos.x < s.rect[1] + 0.2 && self.pos.z > bz && self.pos.z < top + 0.6) alpha = 0.45;
      }
      var img = s.c, sway = 0;
      if (s.frames) {
        var wv = self.swayOn ? Math.sin(self.t * (1.1 + (self.gust || 0) * 1.5) + s.x * 0.7) + Math.sin(self.t * 2.3 + s.z) * 0.35 + (self.gust || 0) * 1.1 : 0;
        img = s.frames[wv > 0.75 ? 2 : (wv < -0.75 ? 0 : 1)];
      } else if (s.sway && self.swayOn) sway = Math.round(Math.sin(self.t * 1.3 + s.sway) * 0.9);
      g.globalAlpha = alpha;
      g.drawImage(img, p2.x - (s.ox || 0) + sway, p2.y - s.oy);
      g.globalAlpha = 1;
    });
    this.drawRackLeds(g, sc);
    this.drawAps(g, sc);
    this.drawSky(g, sc);
    this.drawFx(g, sc);
    this.drawOverlay(g, sc);
    this.drawPost(g, sc);
    if (this.postLow && !this.safeMode) this.postLow(g);
    this.inLow = false;
    // Förstora pixelbufferten till skärmen
    var v = this.view;
    main.imageSmoothingEnabled = false;
    main.globalAlpha = 1; main.globalCompositeOperation = 'source-over';
    main.drawImage(this.low, Math.round((-v.hw - v.fx) * S + cw / 2), Math.round((-v.hh + v.fy) * S + ch / 2), vw * S, vh * S);
    if (this.postHi && !this.safeMode) this.postHi(main);
    // Text och skyltar i full upplösning
    this.hiQueue.forEach(function (f) { f(main); });
  };
  W.drawChar = function (g, spr, x, z, sc, sitting) {
    var s = this.toScreen(x, z, 0);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath(); g.ellipse(s.x, s.y - sc, 7 * sc, 2.5 * sc, 0, 0, Math.PI * 2); g.fill();
    var yoff = sitting ? 4 * sc : 0;
    g.drawImage(spr, s.x - spr.width / 2 * sc, s.y - spr.height * sc + yoff, spr.width * sc, spr.height * sc);
  };
  W.drawMonSprite = function (g, sc) {
    var m = this.monSprite;
    var s = this.toScreen(m.x, m.z, m.y);
    var st = this.game.state;
    var storm = Object.keys(S.get(st).storm).length > 0;
    function p(x, y, w, h, c) { g.fillStyle = c; g.fillRect(s.x + x * sc, s.y + y * sc, w * sc, h * sc); }
    p(0, -22, 36, 22, '#111214'); p(2, -20, 32, 18, '#1b2430');
    var hist = this.monitorHist;
    NV.shared.SERIES.forEach(function (ser, i) {
      var h = hist[ser[0]] || [];
      var bx = 3 + (i % 2) * 16, by = -19 + Math.floor(i / 2) * 9;
      for (var k = 0; k < 14; k++) {
        var v = h[h.length - 14 + k] || 0;
        var hh = Math.max(1, Math.round(Math.min(1, v / 1000) * 7));
        p(bx + k, by + 8 - hh, 1, hh, v > 800 ? '#ff5a4f' : '#4fc3f7');
      }
    });
    if (storm && Math.floor(this.t * 2) % 2) p(30, -21, 4, 3, '#ff5a4f');
  };
  W.drawRackLeds = function (g, sc) {
    var self = this, st = this.game.state;
    var map = { A: ['SW1', 'SW2', 'R1', 'WLC', 'LB'], B: ['Filserver', 'NTP-server', 'Loggserver', 'Ekonomisystem', 'Tid-1', 'Tid-2'], BO: ['SWB', 'RB'] };
    (this.rackSpots || []).forEach(function (r) {
      if ((r.x > 50) !== (self.site === 'boras')) return;
      var devs = map[r.id].filter(function (id) { return !!st.devices[id]; });
      var base = self.toScreen(r.x - r.w / 2, r.z - r.d / 2, 0);
      var Dp = Math.round(r.d * PPM * ZS), Hp = Math.round(2.05 * PPM * HS);
      var t = self.t;
      devs.forEach(function (id, row) {
        var y = base.y - (Hp + Dp - 4 - row * Math.max(4, Math.floor((Dp - 4) / devs.length))) * sc;
        g.fillStyle = id === 'R1' || id === 'RB' || id === 'WLC' ? '#c9ccc9' : '#4c5b6b';
        g.fillRect(base.x + 3 * sc, y - 2 * sc, (r.w * PPM - 6) * sc, 4 * sc);
        var fn = st.devices[id] && st.devices[id].os === 'ios' ? NV.shared.ledFn(st, id) : null;
        var ports = fn ? Object.keys(st.devices[id].config.ifaces).filter(function (n) { return /^GigabitEthernet0\/\d+$/.test(n); }).slice(0, 10) : [];
        for (var k = 0; k < Math.max(3, ports.length); k++) {
          var col = fn ? (ports[k] ? fn(ports[k], t) : '#1d261f') : (Math.random() < 0.7 ? '#3dff6a' : '#1d4a26');
          g.fillStyle = col;
          g.fillRect(base.x + (4 + k * 1.2) * sc, y - 1 * sc, Math.max(1, sc * 0.8), Math.max(1, sc));
        }
      });
    });
  };
  W.drawAps = function (g, sc) {
    if (this.site !== 'boras') return;
    var st = this.game.state, D = S.get(st), self = this;
    var A = this.builder.anchors.aps;
    Object.keys(A).forEach(function (id) {
      var a = A[id];
      var s = self.toScreen(a.x, a.z, 3.2);
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(self.toScreen(a.x, a.z, 0).x, self.toScreen(a.x, a.z, 0).y, 6 * sc, 2 * sc, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2b1a10'; g.fillRect(s.x - 7 * sc, s.y - 3 * sc, 14 * sc, 6 * sc);
      g.fillStyle = '#f4f4f2'; g.fillRect(s.x - 6 * sc, s.y - 2 * sc, 12 * sc, 4 * sc);
      var d = st.devices[id];
      var col = !d.powered ? '#333' : (D.apJoined[id] ? '#3dff6a' : (Math.floor(self.t * 2) % 2 ? '#ffa020' : '#553300'));
      g.fillStyle = col; g.fillRect(s.x - 1 * sc, s.y - 1 * sc, 2 * sc, 2 * sc);
      self.label(g, id, s.x, s.y - 6 * sc, sc * 0.9, 'rgba(20,24,32,0.8)', '#fff');
    });
  };
  W.label = function (g, text, x, y, sc, bg, fg) {
    // I pixelbufferten köas texten och ritas skarpt i full upplösning efteråt
    if (this.inLow) {
      var self = this, h = this.hi({ x: x, y: y }), S = this.view.S;
      this.hiQueue.push(function (m) { self.label(m, text, h.x, h.y, sc * S, bg, fg); });
      return;
    }
    var size = Math.max(10, Math.round(5.5 * sc));
    g.font = 'bold ' + size + 'px "Trebuchet MS", "Segoe UI", sans-serif';
    var w = g.measureText(text).width + size * 0.8;
    g.fillStyle = bg || 'rgba(43,26,16,0.85)';
    g.fillRect(Math.round(x - w / 2), Math.round(y - size), Math.round(w), Math.round(size * 1.35));
    g.fillStyle = fg || '#fff6dc';
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillText(text, Math.round(x), Math.round(y + size * 0.1));
    g.textAlign = 'left';
  };
  // Pratbubblor, namnskyltar, markering och skyltar
  W.drawOverlay = function (g, sc) {
    var self = this;
    this.signs.forEach(function (sg) {
      if ((sg[1] > 50) !== (self.site === 'boras')) return;
      var s = self.toScreen(sg[1], sg[2], WALL_H + 0.1);
      self.label(g, sg[0], s.x, s.y, sc * 0.85, 'rgba(58,40,24,0.9)', '#ffe9b8');
    });
    Object.keys(this.people).forEach(function (n) {
      var p = self.people[n];
      if (!self.npcVisible(n)) return;
      var head = self.toScreen(p.x, p.z, 0);
      var topY = head.y - (p.sit ? 24 : 28) * sc;
      var dist = Math.hypot(self.pos.x - p.x, self.pos.z - p.z);
      if (dist < 4.5) self.label(g, n, head.x, topY - 3 * sc, sc * 0.8);
      if (p.marker.visible || p.done.visible) {
        var bob = Math.round(Math.sin(self.t * 3 + p.phase) * 1.5 * sc);
        var bx = head.x, by = topY - 14 * sc + bob;
        g.fillStyle = OUT; g.fillRect(bx - 7 * sc, by - 8 * sc, 14 * sc, 13 * sc);
        g.fillStyle = '#fffaf0'; g.fillRect(bx - 6 * sc, by - 7 * sc, 12 * sc, 11 * sc);
        g.fillStyle = OUT; g.fillRect(bx - 1 * sc, by + 4 * sc, 3 * sc, 3 * sc);
        g.fillStyle = '#fffaf0'; g.fillRect(bx, by + 4 * sc, 1 * sc, 2 * sc);
        if (p.marker.visible) { g.fillStyle = '#e8a317'; g.fillRect(bx - 1 * sc, by - 5 * sc, 2 * sc, 5 * sc); g.fillRect(bx - 1 * sc, by + 1 * sc, 2 * sc, 2 * sc); }
        else { g.fillStyle = '#3fae4f'; g.fillRect(bx - 4 * sc, by - 1 * sc, 2 * sc, 2 * sc); g.fillRect(bx - 2 * sc, by + 1 * sc, 2 * sc, 2 * sc); g.fillRect(bx, by - 1 * sc, 2 * sc, 2 * sc); g.fillRect(bx + 2 * sc, by - 3 * sc, 2 * sc, 2 * sc); }
      }
    });
    // Markering av det du kan använda
    if (this.hoverSpot && !(this.game.ui && this.game.ui.captures())) {
      var h = this.hoverSpot;
      var s = this.toScreen(h.x, h.z, h.inter.type === 'npc' ? 1.5 : 1.2);
      var b = Math.round(Math.sin(this.t * 6) * 2 * sc);
      g.fillStyle = OUT;
      g.fillRect(s.x - 4 * sc, s.y - 12 * sc + b, 8 * sc, 3 * sc); g.fillRect(s.x - 3 * sc, s.y - 9 * sc + b, 6 * sc, 2 * sc); g.fillRect(s.x - 1 * sc, s.y - 7 * sc + b, 2 * sc, 2 * sc);
      g.fillStyle = '#f0b429';
      g.fillRect(s.x - 3 * sc, s.y - 11 * sc + b, 6 * sc, 1 * sc); g.fillRect(s.x - 2 * sc, s.y - 9 * sc + b, 4 * sc, 1 * sc);
    }
    // Mål dit du klickade
    if (this.target) {
      var ts = this.toScreen(this.target.x, this.target.z, 0);
      g.strokeStyle = 'rgba(255,240,180,0.8)'; g.lineWidth = sc;
      g.strokeRect(ts.x - 4 * sc, ts.y - 2 * sc, 8 * sc, 4 * sc);
    }
    // Varm ton och vinjett (i full upplösning, så att övergången blir mjuk)
    var self2 = this;
    this.hiQueue.push(function (m) {
      var cw = self2.canvas.width, ch = self2.canvas.height;
      var v = m.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
      v.addColorStop(0, 'rgba(255,200,120,0)'); v.addColorStop(1, 'rgba(60,30,10,0.35)');
      m.fillStyle = v; m.fillRect(0, 0, cw, ch);
    });
  };

  W.monitorCanvas = function () { return this.monitorCv; };

  W.update = function (dt) {
    var rdt = dt;
    if (this.slowT > 0) { this.slowT -= dt; dt *= 0.4; }
    this.t += dt;
    this.frameDt = rdt;
    if (!(this.game.ui && this.game.ui.captures())) this.move(dt);
    this.updateFx(dt, rdt);
    this.hover = this.pick();
    this.slowTimer += dt;
    if (this.slowTimer > 1) {
      this.slowTimer = 0;
      NV.shared.sampleMonitor(this.game.state, this.monitorHist);
      NV.shared.drawMonitor(this.monitorCv, this.monitorHist, this.game.state, this.t);
    }
    var near = 99, self = this;
    NV.shared.rackSpots(this.builder).forEach(function (r) { near = Math.min(near, Math.hypot(self.pos.x - r.x, self.pos.z - r.z)); });
    NV.sfx.hum(this.game.ui && this.game.ui.captures() ? 0 : 1 - near / 7);
    this.render();
  };


  // ================================================================== Effekter i 2D
  // Partiklar i världskoordinater (x, z och höjd y), ritade som pixelrutor
  W.fxInit = function () {
    this.parts = []; this.pops = []; this.pend = []; this.traces = [];
    this.birds = []; this.clouds = [];
    for (var i = 0; i < 7; i++) this.clouds.push({ x: -40 + Math.random() * 180, z: -25 + Math.random() * 50, r: 3 + Math.random() * 4, v: 0.3 + Math.random() * 0.4 });
  };
  W.part = function (o) {
    if (!NV.settings.get('particles') && !o.force) return null;
    if (!this.parts) this.fxInit();
    var p = { x: o.x, z: o.z, y: o.y || 0, vx: o.vx || 0, vz: o.vz || 0, vy: o.vy || 0, g: o.g || 0, life: o.life || 1, age: 0, size: o.size || 1, col: o.col || '#fff', glow: !!o.glow, grow: o.grow || 0, a: o.a === undefined ? 1 : o.a, path: o.path, onEnd: o.onEnd, drag: o.drag || 0 };
    if (this.parts.length > 900) this.parts.shift();
    this.parts.push(p);
    return p;
  };
  function R(a, b) { return a + Math.random() * (b - a); }
  W.dust = function (x, z) { for (var i = 0; i < 3; i++) this.part({ x: x + R(-0.2, 0.2), z: z + R(-0.1, 0.1), y: 0.05, vx: R(-0.4, 0.4), vy: R(0.2, 0.6), g: 1.2, life: R(0.4, 0.7), size: 2, col: 'rgba(200,190,160,0.7)', grow: 1 }); };
  W.sparkle = function (x, z, y) { this.part({ x: x + R(-0.3, 0.3), z: z + R(-0.2, 0.2), y: (y || 1) + R(-0.2, 0.4), vy: 0.3, life: R(0.4, 0.8), size: 1, col: '#ffe08a', glow: true }); };
  W.confetti = function (x, z, n) {
    var cols = ['#f0b429', '#3fbf6f', '#4fc3f7', '#ff5a4f', '#b77ee0', '#ffffff'];
    for (var i = 0; i < (n || 70); i++) { var a = Math.random() * Math.PI * 2, sp = R(0.8, 3); this.part({ x: x, z: z, y: 1.2, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp * 0.6, vy: R(2, 5), g: 6, drag: 0.02, life: R(1.2, 2.2), size: 2, col: cols[i % cols.length] }); }
  };
  W.sparks = function (x, z, y, col, n) { for (var i = 0; i < (n || 14); i++) { var a = Math.random() * Math.PI * 2; this.part({ x: x, z: z, y: y || 1, vx: Math.cos(a) * R(0.5, 2), vz: Math.sin(a) * R(0.3, 1), vy: R(0.5, 2.5), g: 8, life: R(0.3, 0.6), size: 1, col: col || '#ffcf6a', glow: true }); } };
  W.poof = function (x, z, y, col) { for (var i = 0; i < 16; i++) { var a = Math.random() * Math.PI * 2; this.part({ x: x, z: z, y: y || 1, vx: Math.cos(a) * 1.2, vz: Math.sin(a) * 0.8, vy: R(-0.5, 1), drag: 0.08, life: R(0.4, 0.7), size: 3, grow: 1, col: col || '#ff5a4f', glow: true }); } };
  W.steam = function (x, z, y) { this.part({ x: x + R(-0.05, 0.05), z: z, y: y, vx: R(-0.05, 0.05), vy: R(0.25, 0.4), life: R(1.2, 1.8), size: 2, grow: 1.5, col: 'rgba(255,255,255,0.45)' }); };
  W.firework = function (x, z) {
    var col = ['#ffd54a', '#4fc3f7', '#ff5a4f', '#6dff9a', '#ff9cf0'][Math.floor(Math.random() * 5)];
    var y = R(4, 6);
    for (var i = 0; i < 40; i++) { var a = i / 40 * Math.PI * 2, sp = R(1.5, 2.4); this.part({ x: x, z: z, y: y, vx: Math.cos(a) * sp, vz: 0, vy: Math.sin(a) * sp, g: 1.5, drag: 0.03, life: R(0.9, 1.4), size: 2, col: col, glow: true }); }
    NV.sfx.thud();
  };
  W.popup = function (text, color) { if (!this.parts) this.fxInit(); this.pops.push({ text: text, col: color || '#ffd54a', x: this.pos.x, z: this.pos.z, age: 0, life: 1.6 }); };

  // Spelets anrop
  W.devPos2d = function (id) {
    var A = this.builder.anchors;
    var rackOf = { SW1: A.rackA, SW2: A.rackA, R1: A.rackA, WLC: A.rackA, LB: A.rackA, RB: A.borasRack, SWB: A.borasRack };
    if (rackOf[id]) return { x: rackOf[id].x, z: rackOf[id].z + (rackOf[id].x > 50 ? 0 : 0.6), y: 1.6 };
    if (id === 'ISP' || String(id).indexOf('INTERNET') === 0) return { x: A.fiber.x, z: A.fiber.z + 0.2, y: 1.4 };
    if (A.desks[id]) return { x: A.desks[id].x + 0.1, z: A.desks[id].z - 0.2, y: 1.2 };
    if (id === 'Tekniker') return { x: A.bench.x, z: A.bench.z, y: 1.1 };
    if (id === 'Gast-laptop') return { x: A.guestTable.x, z: A.guestTable.z, y: 1 };
    if (id === 'Gast-mobil') return { x: A.phoneCounter.x, z: A.phoneCounter.z, y: 1.2 };
    if (A.aps[id]) return { x: A.aps[id].x, z: A.aps[id].z, y: 3.2 };
    if (id === 'Filserver' || id === 'NTP-server' || id === 'Loggserver' || id === 'Ekonomisystem' || id === 'Tid-1' || id === 'Tid-2') return { x: A.rackB.x, z: A.rackB.z + 0.6, y: 1.6 };
    return null;
  };
  W.celebrate = function (devId) {
    var p = devId ? this.devPos2d(devId) : null;
    if (!p || Math.hypot(p.x - this.pos.x, p.z - this.pos.z) > 8) p = { x: this.pos.x, z: this.pos.z };
    this.confetti(p.x, p.z, 90);
    this.flash('#fff3c0', 0.35);
    this.slowT = 0.6;
    this.shake(0.4);
  };
  W.fireworks = function (n) { var self = this; if (!this.parts) this.fxInit(); for (var i = 0; i < (n || 3); i++) this.pend.push({ at: this.t + i * 0.45, fn: function () { self.firework(self.pos.x + R(-4, 4), self.pos.z + R(-1, 2)); } }); };
  W.shake = function (a) { this.shakeA = Math.max(this.shakeA || 0, a * 3); };
  W.flash = function (col, a) { this.flashCol = col || '#ffffff'; this.flashA = a || 0.4; };
  W.slowmo = function (t) { this.slowT = t; };
  W.crabCaught = function (c) { this.poof(c.x, c.z, 0.2, '#ff7a4a'); this.confetti(c.x, c.z, 40); };
  W.cableFx = function (l) { var p = this.devPos2d(l.a.dev); if (p) this.sparks(p.x, p.z, p.y, '#ffcf6a', 16); };
  W.consoleFx = function (id) { var p = this.devPos2d(id); if (p) this.sparks(p.x, p.z, p.y, '#7fc6f0', 14); };
  W.setGoggles = function (on) { this.goggles = on; };
  var REASON = { acl: 'ACL', arp: 'Inget ARP', 'net-unreachable': 'Ingen väg', nolink: 'Ingen länk', noip: 'Ingen IP', nogw: 'Ingen gateway', drop: 'Tappad', noreply: 'Inget svar', refused: 'Stängd port', ttl: 'TTL slut', ipsec: 'IPsec', frag: 'För stort (DF)' };
  W.pingTrace = function (from, res, count) {
    var self = this;
    if (!this.parts) this.fxInit();
    var ids = [from];
    (res.hops || []).forEach(function (h) { if (ids[ids.length - 1] !== h.dev) ids.push(h.dev); });
    var end = res.ok ? res.at : res.where;
    if (end && ids[ids.length - 1] !== end) ids.push(end);
    var pts = ids.map(function (id) { return self.devPos2d(id); }).filter(Boolean);
    pts = pts.filter(function (p, i) { return i === 0 || Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) > 0.1; });
    if (pts.length < 2) { if (pts.length && !res.ok) this.poof(pts[0].x, pts[0].z, pts[0].y); return; }
    function path(list) {
      var segs = [], total = 0;
      for (var i = 0; i < list.length - 1; i++) { var d = Math.hypot(list[i + 1].x - list[i].x, list[i + 1].z - list[i].z); segs.push({ a: list[i], b: list[i + 1], d: d }); total += d; }
      return { at: function (u) {
        var want = u * total;
        for (var k = 0; k < segs.length; k++) {
          var sg = segs[k];
          if (want <= sg.d || k === segs.length - 1) { var f = sg.d ? Math.min(1, want / sg.d) : 1; return { x: sg.a.x + (sg.b.x - sg.a.x) * f, z: sg.a.z + (sg.b.z - sg.a.z) * f, y: sg.a.y + (sg.b.y - sg.a.y) * f + Math.sin(f * Math.PI) * (0.6 + sg.d * 0.12) }; }
          want -= sg.d;
        }
      }, total: total };
    }
    var fwd = path(pts), back = path(pts.slice().reverse()), last = pts[pts.length - 1];
    var life = Math.max(0.7, Math.min(3, fwd.total / 6));
    for (var i = 0; i < (count || 4); i++) {
      (function (k) {
        self.pend.push({ at: self.t + k * 0.45, fn: function () {
          self.part({ force: true, path: fwd, life: life, size: 3, col: res.tunnel ? '#c58bff' : '#7ee0ff', glow: true, trail: true, onEnd: function () {
            if (res.ok) { self.part({ force: true, path: back, life: life, size: 3, col: '#6dff9a', glow: true }); if (!k) self.pops.push({ text: res.tunnel ? '✓ svar · VPN' : '✓ svar', col: res.tunnel ? '#d9b3ff' : '#6dff9a', x: last.x, z: last.z, y: last.y, age: 0, life: 1.6 }); }
            else { self.poof(last.x, last.z, last.y); if (!k) self.pops.push({ text: '✗ ' + (REASON[res.reason] || 'Inget svar'), col: '#ff7a6a', x: last.x, z: last.z, y: last.y, age: 0, life: 2.2 }); }
          } });
        } });
      })(i);
    }
  };

  W.updateFx = function (dt, rdt) {
    if (!this.parts) this.fxInit();
    var self = this;
    this.pend = this.pend.filter(function (p) { if (self.t >= p.at) { p.fn(); return false; } return true; });
    this.parts = this.parts.filter(function (p) {
      p.age += dt;
      if (p.age >= p.life) { if (p.onEnd) p.onEnd(); return false; }
      if (p.path) { var q = p.path.at(p.age / p.life); p.x = q.x; p.z = q.z; p.y = q.y; if (Math.random() < 0.7) self.part({ force: true, x: p.x, z: p.z, y: p.y, life: 0.35, size: 2, col: p.col, glow: true, a: 0.6 }); return true; }
      var dr = Math.pow(1 - p.drag, dt * 60);
      p.vx *= dr; p.vz *= dr; p.vy = p.vy * dr - p.g * dt;
      p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt;
      if (p.y < 0) { p.y = 0; p.vy *= -0.3; p.vx *= 0.5; }
      return true;
    });
    this.pops = this.pops.filter(function (p) { p.age += rdt; return p.age < p.life; });
    // Ånga från kaffemaskinen och kopparna
    this.steamAcc = (this.steamAcc || 0) + dt;
    if (this.steamAcc > 0.35) {
      this.steamAcc = 0;
      if (this.site === 'gbg' && Math.abs(this.pos.x + 2.8) + Math.abs(this.pos.z + 9.6) < 14) this.steam(-2.8, -9.45, 1.1);
    }
    // Glitter runt det du kan använda
    if (this.hoverSpot && Math.random() < rdt * 5) this.sparkle(this.hoverSpot.x, this.hoverSpot.z, 1.1);
    // Krabban
    var c = this.game.crab;
    if (c && c.active && c.site === this.site) {
      // Smyger du märker krabban dig först när du är mycket närmare
      var seen = this.sneak ? { x: c.x + (this.pos.x - c.x) * 2.2, z: c.z + (this.pos.z - c.z) * 2.2 } : this.pos;
      var moving = NV.shared.crabStep(c, dt, seen, this.collides.bind(this));
      c.anim = (c.anim || 0) + dt * (moving ? (c.fleeing ? 3 : 1.5) : 0);
      if (moving && c.fleeing && Math.random() < dt * 8) this.dust(c.x, c.z);
      if (this.crabInter) { this.crabInter.x = c.x; this.crabInter.z = c.z; }
    } else if (this.crabInter) this.crabInter.z = -100;
    // Fåglar utomhus
    if (this.birds.length < 4 && Math.random() < dt * 0.15) {
      var S0 = SITES[this.site], left = Math.random() < 0.5;
      this.birds.push({ x: left ? S0.x0 : S0.x1, z: R(S0.z0, S0.z1), y: R(5, 8), vx: (left ? 1 : -1) * R(2.5, 4), vz: R(-0.5, 0.5), ph: Math.random() * 6 });
    }
    this.birds = this.birds.filter(function (b) { b.x += b.vx * dt; b.z += b.vz * dt; b.ph += dt * 10; var S1 = SITES[self.site]; return b.x > S1.x0 - 2 && b.x < S1.x1 + 2; });
    this.clouds.forEach(function (cl) { cl.x += cl.v * dt; if (cl.x > 130) cl.x = -40; });
    this.flashA = Math.max(0, (this.flashA || 0) - rdt * 1.4);
    this.stepZoom(rdt);
    // Dammsugarroboten åker runt i kontoret
    var v = this.game.vac;
    if (v) { NV.shared.vacStep(v, dt, this.collides.bind(this)); if (this.vacInter) { this.vacInter.x = v.x; this.vacInter.z = this.site === 'gbg' ? v.z : -100; } }
    // Omar går fram och tillbaka vid kaffemaskinen även i 2D
    var om = this.people.Omar, talking = this.game.ui && this.game.ui.talkingTo === 'Omar';
    if (om) {
      var path = [{ x: -3.4, z: -7.8 }, { x: -4.9, z: -8.6 }];
      om.paceT = (om.paceT || 0) - dt; om.ix = om.ix || 0;
      om.walking = false;
      var near = Math.hypot(this.pos.x - om.x, this.pos.z - om.z) < 1.6;
      if (om.paceT <= 0 && !talking && !near) {
        var tg = path[om.ix], ex = tg.x - om.x, ez = tg.z - om.z, el = Math.hypot(ex, ez);
        if (el > 0.05) { var sp = Math.min(el, dt * 0.8); om.x += ex / el * sp; om.z += ez / el * sp; om.walking = true; om.wdir = Math.abs(ex) > Math.abs(ez) ? (ex < 0 ? 2 : 3) : (ez < 0 ? 0 : 1); }
        else { om.ix = (om.ix + 1) % path.length; om.paceT = 4 + Math.random() * 5; }
        om.col.minX = om.x - 0.25; om.col.maxX = om.x + 0.25; om.col.minZ = om.z - 0.2; om.col.maxZ = om.z + 0.25;
        (this.inters || []).forEach(function (it) { if (it.npc === 'Omar') { it.x = om.x; it.z = om.z; } });
      }
    }
    // Fotspår när du går utomhus
    this.prints = (this.prints || []).filter(function (p) { p.age += dt; return p.age < 8; });
    if (/Utanför/.test(this.zone().name) && this.frame && (!this.lastPrint || Math.hypot(this.pos.x - this.lastPrint.x, this.pos.z - this.lastPrint.z) > 0.45)) {
      this.lastPrint = { x: this.pos.x, z: this.pos.z };
      this.prints.push({ x: this.pos.x + (this.prints.length % 2 ? 0.08 : -0.08), z: this.pos.z, age: 0 });
      if (this.prints.length > 60) this.prints.shift();
    }
  };
  W.drawVac = function (g, sc) {
    var v = this.game.vac, s = this.toScreen(v.x, v.z, 0);
    function px(x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(s.x + x * sc), Math.round(s.y + y * sc), Math.ceil(w * sc), Math.ceil(h * sc)); }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(s.x, s.y, 6 * sc, 2 * sc, 0, 0, Math.PI * 2); g.fill();
    px(-5, -4, 10, 4, OUT); px(-4, -5, 8, 1, OUT); px(-4, -4, 8, 3, '#2b2d31'); px(-2, -4, 4, 1, '#55595f');
    px(-1, -5, 2, 1, Math.floor(this.t * 3) % 2 ? '#4fc3f7' : '#1f4e79');
  };
  // Väder, utskrifter och tack i 2D
  W.setWeather = function (w) { this.weather = w || 'sun'; };
  W.printFx = function () { var A = this.builder.anchors; for (var i = 0; i < 6; i++) this.part({ x: A.printer.x + R(-0.1, 0.1), z: A.printer.z, y: 1.2, vx: R(-0.3, 0.3), vy: R(0.5, 1.2), g: 2, life: 1.2, size: 2, col: '#ffffff', force: true }); };
  W.waterFx = function () { var A = this.builder.anchors; for (var i = 0; i < 10; i++) this.part({ x: A.water.x + R(-0.08, 0.08), z: A.water.z, y: 1.1, vy: R(0.3, 0.7), life: 0.9, size: 2, col: '#bfe8ff', glow: true, force: true }); };
  W.thank = function (n) { var p = this.people[n]; if (!p) return; if (!this.parts) this.fxInit(); this.pops.push({ text: 'Tack!', col: '#6dff9a', x: p.x, z: p.z, y: 2.2, age: 0, life: 2.4 }); };

  // Krabban som pixelfigur
  W.drawCrab = function (g, sc) {
    var c = this.game.crab;
    var s = this.toScreen(c.x, c.z, 0);
    var k = Math.floor(c.anim * 8) % 2;
    function px(x, y, w, h, col) { g.fillStyle = col; g.fillRect(Math.round(s.x + x * sc), Math.round(s.y + y * sc), Math.ceil(w * sc), Math.ceil(h * sc)); }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(s.x, s.y, 7 * sc, 2 * sc, 0, 0, Math.PI * 2); g.fill();
    // Ben
    for (var i = 0; i < 3; i++) { var o = (i + k) % 2; px(-8, -4 + i * 1.5 - o, 3, 1, OUT); px(5, -4 + i * 1.5 - (1 - o), 3, 1, OUT); }
    // Klor
    var lift = c.fleeing ? -2 : 0;
    px(-9, -10 + lift, 4, 4, OUT); px(-8, -9 + lift, 2, 2, '#e84a2c');
    px(5, -10 + lift, 4, 4, OUT); px(6, -9 + lift, 2, 2, '#e84a2c');
    // Kropp
    px(-6, -8, 12, 6, OUT); px(-5, -7, 10, 4, '#e84a2c'); px(-4, -7, 8, 1, '#ff7a55');
    // Ögon
    px(-3, -11, 2, 3, OUT); px(1, -11, 2, 3, OUT); px(-3, -11, 1, 1, '#fff'); px(1, -11, 1, 1, '#fff');
  };

  // Moln, fåglar och dagsljus
  W.drawSky = function (g, sc) {
    var self = this, S0 = SITES[this.site];
    var cw = this.view.vw, ch = this.view.vh;
    var b = this.site === 'boras' ? [88, -12, 112, 12] : [-15, -10, 15, 10];
    var tl = this.toScreen(b[0], b[3], 0), br = this.toScreen(b[2], b[1], 0);
    g.save();
    g.beginPath(); g.rect(0, 0, cw, ch); g.rect(tl.x, tl.y - WALL_H * PPM * HS, br.x - tl.x, br.y - tl.y + WALL_H * PPM * HS); g.clip('evenodd');
    g.fillStyle = 'rgba(20,40,20,0.13)';
    this.clouds.forEach(function (cl) {
      var p = self.toScreen(cl.x + (self.site === 'boras' ? 70 : 0), cl.z, 0);
      g.beginPath(); g.ellipse(p.x, p.y, cl.r * PPM * sc, cl.r * PPM * ZS * 0.6 * sc, 0, 0, Math.PI * 2); g.fill();
    });
    g.restore();
    this.birds.forEach(function (bd) {
      var p = self.toScreen(bd.x, bd.z, bd.y);
      var up = Math.sin(bd.ph) > 0;
      g.fillStyle = '#2b2f36';
      g.fillRect(p.x - 3 * sc, p.y + (up ? -1 : 1) * sc, 2 * sc, sc); g.fillRect(p.x - sc, p.y, 2 * sc, sc); g.fillRect(p.x + sc, p.y + (up ? -1 : 1) * sc, 2 * sc, sc);
    });
  };
  W.drawFx = function (g, sc) {
    var self = this;
    if (!this.parts) return;
    // Glöd i serverrummet
    if (this.site === 'gbg') {
      g.save(); g.globalCompositeOperation = 'lighter';
      var storm = Object.keys(S.get(this.game.state).storm).length > 0;
      (this.rackSpots || []).forEach(function (r) {
        if (r.x > 50) return;
        var p = self.toScreen(r.x, r.z, 1.2);
        var gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, 22 * sc);
        gr.addColorStop(0, storm ? 'rgba(255,60,40,' + (0.25 + Math.sin(self.t * 8) * 0.12) + ')' : 'rgba(60,255,120,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(p.x - 22 * sc, p.y - 22 * sc, 44 * sc, 44 * sc);
      });
      g.restore();
    }
    this.parts.forEach(function (p) {
      var s = self.toScreen(p.x, p.z, p.y);
      var f = p.age / p.life, sz = Math.max(1, Math.round(p.size * (1 + p.grow * f) * sc * 0.6));
      g.globalAlpha = p.a * (1 - f * f);
      if (p.glow) { g.globalCompositeOperation = 'lighter'; g.fillStyle = p.col; g.fillRect(s.x - sz, s.y - sz, sz * 2, sz * 2); g.globalCompositeOperation = 'source-over'; }
      else { g.fillStyle = p.col; g.fillRect(s.x - sz / 2, s.y - sz / 2, sz, sz); }
    });
    g.globalAlpha = 1;
    // Glasögonen: länkarna som färgade linjer och status över racken
    if (this.goggles) this.drawGoggles(g, sc);
    // Fotspår i gruset och gräset
    (this.prints || []).forEach(function (p) {
      var s = self.toScreen(p.x, p.z, 0);
      g.fillStyle = 'rgba(70,50,30,' + (0.35 * (1 - p.age / 8)) + ')';
      g.fillRect(s.x - 1, s.y - 2, 2, 1); g.fillRect(s.x - 1, s.y, 2, 1);
    });
    // Pratbubbla med "…" över den du pratar med
    var tk = this.game.ui && this.game.ui.talkingTo;
    if (tk && this.people[tk]) {
      var tp = this.people[tk], hs = this.toScreen(tp.x, tp.z, 0), by = hs.y - (tp.sit ? 40 : 44) * sc;
      g.fillStyle = OUT; g.fillRect(hs.x + 4 * sc, by - 7 * sc, 16 * sc, 10 * sc);
      g.fillStyle = '#fffaf0'; g.fillRect(hs.x + 5 * sc, by - 6 * sc, 14 * sc, 8 * sc);
      g.fillStyle = OUT; for (var di = 0; di < 3; di++) if (Math.floor(this.t * 3) % 4 > di) g.fillRect(hs.x + (8 + di * 4) * sc, by - 3 * sc, 2 * sc, 2 * sc);
    }
    // Flytande text
    this.pops.forEach(function (p) {
      var h = self.hi(self.toScreen(p.x, p.z, (p.y || 1.8) + p.age * 0.8)), S = self.view.S;
      var al = Math.max(0, 1 - Math.pow(p.age / p.life, 3));
      self.hiQueue.push(function (m) {
        m.globalAlpha = al;
        var size = Math.max(10, Math.round(4.5 * S));
        m.font = size + 'px "Press Start 2P", "Trebuchet MS", monospace'; m.textAlign = 'center';
        m.fillStyle = OUT; m.fillText(p.text, h.x + 2, h.y + 2);
        m.fillStyle = p.col; m.fillText(p.text, h.x, h.y);
        m.textAlign = 'left'; m.globalAlpha = 1;
      });
    });
  };
  W.drawGoggles = function (g, sc) {
    var self = this, st = this.game.state;
    var col = { up: '#33ff88', down: '#ff3b30', warn: '#ffb020', off: '#667080' };
    g.save(); g.globalCompositeOperation = 'lighter'; g.lineWidth = Math.max(2, sc);
    st.links.forEach(function (l) {
      var a = self.devPos2d(l.a.dev), b = self.devPos2d(l.b.dev);
      if (!a || !b || (a.x > 50) !== (self.site === 'boras') || (b.x > 50) !== (a.x > 50)) return;
      if (Math.hypot(a.x - b.x, a.z - b.z) < 0.2) return;
      var pa = self.toScreen(a.x, a.z, a.y), pb = self.toScreen(b.x, b.z, b.y);
      var stt = NV.shared.linkStatus(st, l);
      g.strokeStyle = col[stt]; g.setLineDash(stt === 'down' ? [4 * sc, 3 * sc] : []);
      g.lineDashOffset = -self.t * 20;
      g.beginPath(); g.moveTo(pa.x, pa.y); g.quadraticCurveTo((pa.x + pb.x) / 2, Math.min(pa.y, pb.y) - 20 * sc, pb.x, pb.y); g.stroke();
    });
    g.restore();
    var racks = { A: ['SW1', 'SW2', 'R1', 'WLC', 'LB'], BO: ['RB', 'SWB'] };
    (this.rackSpots || []).forEach(function (r) {
      if (!racks[r.id] || (r.x > 50) !== (self.site === 'boras')) return;
      var p = self.toScreen(r.x, r.z, 3.1), y = p.y;
      racks[r.id].forEach(function (id) {
        var L = NV.shared.deviceLine(st, id);
        if (!L) return;
        self.label(g, L.text, p.x, y, sc * 1.05, 'rgba(4,30,26,0.9)', L.bad ? '#ffb020' : '#9fe8c0');
        y -= 8.5 * sc;
      });
    });
  };
  // Dagsljus, glasögonton och blixt över hela bilden
  W.drawPost = function (g) {
    var cw = this.view.vw, ch = this.view.vh;
    var hour = 8 + (this.game.state ? this.game.state.time : 0) / 3600;
    var warm = Math.max(0, Math.min(1, (hour - 8) / 8));
    if (warm > 0.02) { g.fillStyle = 'rgba(255,150,60,' + (warm * 0.12) + ')'; g.fillRect(0, 0, cw, ch); }
    // Väder: mulet blir gråare, regn får fallande streck
    if (this.weather === 'clouds') { g.fillStyle = 'rgba(60,70,90,0.1)'; g.fillRect(0, 0, cw, ch); }
    if (this.weather === 'rain') {
      g.fillStyle = 'rgba(30,40,70,0.18)'; g.fillRect(0, 0, cw, ch);
      g.strokeStyle = 'rgba(200,220,255,0.35)'; g.lineWidth = 1;
      g.beginPath();
      var n = NV.gfx.profile().particles < 0.5 ? 60 : 160;
      for (var i = 0; i < n; i++) {
        var x = ((i * 97.3 + this.t * 15) % (cw + 60)) - 30, y = ((i * 61.7 + this.t * (105 + (i % 5) * 10)) % (ch + 40)) - 20;
        g.moveTo(x, y); g.lineTo(x - 1, y + 4);
      }
      g.stroke();
    }
    if (this.goggles) {
      g.fillStyle = 'rgba(0,255,140,0.07)'; g.fillRect(0, 0, cw, ch);
      g.fillStyle = 'rgba(0,0,0,0.12)';
      for (var y = (Math.floor(this.t * 30) % 4); y < ch; y += 4) g.fillRect(0, y, cw, 1);
    }
    if (this.flashA > 0) { g.globalAlpha = this.flashA; g.fillStyle = this.flashCol || '#fff'; g.fillRect(0, 0, cw, ch); g.globalAlpha = 1; }
  };

  // Konstanter och hjälpare för js/world/scene2d.js
  World2D.K = { PPM: PPM, ZS: ZS, HS: HS, WALL_H: WALL_H, SITES: SITES, OUT: OUT, boxSprite: boxSprite, shade: shade, hex: hex, outline: outline, cv: cv, rng: rng };
  return World2D;
})();
