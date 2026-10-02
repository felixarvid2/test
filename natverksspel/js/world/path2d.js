// Vägsökning för musklick i 2D: A* på ett rutnät över hindren, så att figuren går runt väggar och möbler.
(function () {
  var W = NV.World2D.prototype;
  var CELL = 0.125;      // rutnätets upplösning i meter
  var CLEAR = 0.26;      // marginal runt hinder (figurens radie är 0.22)
  var SITES = { gbg: { x0: -21, x1: 21, z0: -18, z1: 14 }, boras: { x0: 82, x1: 118, z0: -17, z1: 16 } };

  // Kollegorna flyttar sig (mellan veckorna, och Omar går omkring), så de ritas in på sina aktuella platser vid varje sökning
  function dynamicCols(w) { var out = []; Object.keys(w.people || {}).forEach(function (n) { if (w.people[n].col) out.push(w.people[n].col); }); return out; }
  function stamp(g, nav, c) {
    var s = nav.s, nx = nav.nx, nz = nav.nz;
    var i0 = Math.max(0, Math.floor((c.minX - CLEAR - s.x0) / CELL)), i1 = Math.min(nx - 1, Math.floor((c.maxX + CLEAR - s.x0) / CELL));
    var j0 = Math.max(0, Math.floor((c.minZ - CLEAR - s.z0) / CELL)), j1 = Math.min(nz - 1, Math.floor((c.maxZ + CLEAR - s.z0) / CELL));
    for (var jj = j0; jj <= j1; jj++) for (var ii = i0; ii <= i1; ii++) {
      var cx = s.x0 + (ii + 0.5) * CELL, cz = s.z0 + (jj + 0.5) * CELL;
      if (cx > c.minX - CLEAR && cx < c.maxX + CLEAR && cz > c.minZ - CLEAR && cz < c.maxZ + CLEAR) g[jj * nx + ii] = 1;
    }
  }

  // Glasdörrarna vid entrén glider isär i 2D, så där kan du gå ut på gården
  var ORIG_BUILD = W.buildSprites;
  W.buildSprites = function () {
    ORIG_BUILD.apply(this, arguments);
    var cs = this.builder.colliders;
    for (var i = cs.length - 1; i >= 0; i--) { var c = cs[i]; if (Math.abs(c.minX - 9.5) < 0.01 && Math.abs(c.maxX - 11.5) < 0.01 && Math.abs(c.minZ + 10.1) < 0.01) cs.splice(i, 1); }
    this._nav = null;
  };

  W.navGrid = function () {
    var site = this.site, cs = this.builder.colliders;
    var key = site + ':' + cs.length;
    if (this._nav && this._nav.key === key) return this._nav;
    var s = SITES[site], nx = Math.ceil((s.x1 - s.x0) / CELL), nz = Math.ceil((s.z1 - s.z0) / CELL);
    var g = new Uint8Array(nx * nz), skip = dynamicCols(this);
    // Kanten av området
    var edge = 0.5 + CLEAR;
    for (var j = 0; j < nz; j++) for (var i = 0; i < nx; i++) {
      var x = s.x0 + (i + 0.5) * CELL, z = s.z0 + (j + 0.5) * CELL;
      if (x < s.x0 + edge || x > s.x1 - edge || z < s.z0 + edge || z > s.z1 - edge) g[j * nx + i] = 1;
    }
    // Varje hinder ritas in, förstorat med marginalen
    var nav = { g: g, nx: nx, nz: nz, s: s };
    cs.forEach(function (c) { if (skip.indexOf(c) < 0) stamp(g, nav, c); });
    this._nav = { key: key, g: g, nx: nx, nz: nz, s: s };
    return this._nav;
  };

  function cellOf(n, x, z) { return { i: Math.floor((x - n.s.x0) / CELL), j: Math.floor((z - n.s.z0) / CELL) }; }
  function inside(n, i, j) { return i >= 0 && j >= 0 && i < n.nx && j < n.nz; }
  function free(n, i, j) { return inside(n, i, j) && !n.g[j * n.nx + i]; }
  function center(n, i, j) { return { x: n.s.x0 + (i + 0.5) * CELL, z: n.s.z0 + (j + 0.5) * CELL }; }

  // Närmaste fria ruta (bredden först), t.ex. när du klickar på ett skrivbord
  function nearestFree(n, c, maxR) {
    if (free(n, c.i, c.j)) return c;
    for (var r = 1; r <= maxR; r++) {
      var best = null, bd = 1e9;
      for (var dj = -r; dj <= r; dj++) for (var di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        if (free(n, c.i + di, c.j + dj)) { var d = di * di + dj * dj; if (d < bd) { bd = d; best = { i: c.i + di, j: c.j + dj }; } }
      }
      if (best) return best;
    }
    return null;
  }

  // Siktlinje i rutnätet: kan figuren gå rakt mellan två punkter?
  function clearLine(n, a, b) {
    var dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz), steps = Math.ceil(L / (CELL * 0.5));
    for (var k = 0; k <= steps; k++) {
      var t = steps ? k / steps : 0, c = cellOf(n, a.x + dx * t, a.z + dz * t);
      if (!free(n, c.i, c.j)) return false;
    }
    return true;
  }
  W.navClearLine = function (a, b) { return clearLine(this.navGrid(), a, b); };

  // Binär hög för A*
  function Heap() { this.a = []; }
  Heap.prototype.push = function (id, f) { var a = this.a; a.push([f, id]); var i = a.length - 1; while (i) { var p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; var t = a[p]; a[p] = a[i]; a[i] = t; i = p; } };
  Heap.prototype.pop = function () {
    var a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; var i = 0; for (;;) { var l = i * 2 + 1, r = l + 1, m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; var t = a[m]; a[m] = a[i]; a[i] = t; i = m; } }
    return top[1];
  };

  // A* med åtta riktningar; diagonaler får inte skära hörn
  // Når du ett föremål härifrån? Linjen till det får bara korsa föremålets eget hinder (inte en vägg).
  function reachLine(w, ax, az, bx, bz) {
    var cs = w.builder.colliders;
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i];
      if (bx >= c.minX - 0.05 && bx <= c.maxX + 0.05 && bz >= c.minZ - 0.05 && bz <= c.maxZ + 0.05) continue;
      // Slab-test mellan segmentet och lådan
      var t0 = 0, t1 = 1, d = [bx - ax, bz - az], o = [ax, az], lo = [c.minX, c.minZ], hi = [c.maxX, c.maxZ], hit = true;
      for (var k = 0; k < 2 && hit; k++) {
        if (Math.abs(d[k]) < 1e-9) { if (o[k] < lo[k] || o[k] > hi[k]) hit = false; continue; }
        var ta = (lo[k] - o[k]) / d[k], tb = (hi[k] - o[k]) / d[k];
        if (ta > tb) { var tt = ta; ta = tb; tb = tt; }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) hit = false;
      }
      if (hit) return false;
    }
    return true;
  }

  W.findPath = function (x0, z0, x1, z1, opts) {
    opts = opts || {};
    var base = this.navGrid(), n = { g: base.g.slice(), nx: base.nx, nz: base.nz, s: base.s };
    dynamicCols(this).forEach(function (c) { stamp(n.g, n, c); });
    var s = nearestFree(n, cellOf(n, x0, z0), 6), e = opts.reach ? cellOf(n, x1, z1) : nearestFree(n, cellOf(n, x1, z1), 24);
    if (!s || !e) return null;
    var nx = n.nx, N = nx * n.nz, S = s.j * nx + s.i, E = e.j * nx + e.i;
    var gs = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    var h = new Heap(), SQ2 = Math.SQRT2;
    function heur(id) { var dx = Math.abs(id % nx - e.i), dz = Math.abs(((id / nx) | 0) - e.j); return (dx + dz) + (SQ2 - 2) * Math.min(dx, dz); }
    gs[S] = 0; h.push(S, heur(S));
    var DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];
    var found = false, guard = 0, best = S, bestH = heur(S);
    while (h.a.length && guard++ < N * 2) {
      var cur = h.pop();
      if (closed[cur]) continue;
      if (cur === E) { found = true; break; }
      if (opts.reach) {
        var gc = center(n, cur % nx, (cur / nx) | 0);
        if (Math.hypot(gc.x - x1, gc.z - z1) <= opts.reach && reachLine(this, gc.x, gc.z, x1, z1)) { E = cur; found = true; break; }
      }
      closed[cur] = 1;
      var hc = heur(cur); if (hc < bestH) { bestH = hc; best = cur; }
      var ci = cur % nx, cj = (cur / nx) | 0;
      for (var d = 0; d < 8; d++) {
        var D = DIRS[d], ni = ci + D[0], nj = cj + D[1];
        if (!free(n, ni, nj)) continue;
        if (D[0] && D[1] && (!free(n, ci + D[0], cj) || !free(n, ci, cj + D[1]))) continue;
        var id = nj * nx + ni;
        if (closed[id]) continue;
        var ng = gs[cur] + D[2];
        if (ng < gs[id]) { gs[id] = ng; from[id] = cur; h.push(id, ng + heur(id)); }
      }
    }
    // Går målet inte att nå (t.ex. på andra sidan en vägg) går du så nära det går
    var partial = !found;
    if (partial) { if (best === S) return { pts: [], end: center(n, s.i, s.j), len: 0, partial: true }; E = best; }
    var cells = [];
    for (var c = E; c !== -1; c = from[c]) cells.push(center(n, c % nx, (c / nx) | 0));
    cells.reverse();
    // Sista punkten: exakt där du klickade om den är fri, annars mitten av närmaste fria ruta
    var tgt = !partial && !opts.reach && free(n, cellOf(n, x1, z1).i, cellOf(n, x1, z1).j) ? { x: x1, z: z1 } : cells[cells.length - 1];
    cells[cells.length - 1] = tgt;
    // Utjämning: hoppa över punkter så länge det finns fri siktlinje (ger raka, naturliga vägar)
    var pts = [{ x: x0, z: z0 }].concat(cells), out = [], k = 0;
    while (k < pts.length - 1) {
      var far = k + 1;
      for (var m = pts.length - 1; m > k + 1; m--) if (clearLine(n, pts[k], pts[m])) { far = m; break; }
      out.push(pts[far]); k = far;
    }
    return { pts: out, end: tgt, len: gs[E] * CELL, partial: partial };
  };

  // Gå till en punkt längs en sökt väg. then = det du ska använda när du kommer fram.
  W.walkTo = function (x, z, then, replan) {
    // Ett föremål eller en kollega: gå till närmaste plats på rätt sida, där du når fram
    var p = then ? this.findPath(this.pos.x, this.pos.z, then.x, then.z, { reach: (then.r || 0.8) + 1.1 }) : null;
    if (!p || p.partial) p = this.findPath(this.pos.x, this.pos.z, x, z);
    if (!p || !p.pts.length) {
      this.target = null; this.path = null;
      if (this.pops && !replan) this.pops.push({ text: 'Dit kommer du inte', col: '#ffb4a8', x: x, z: z, y: 0.4, age: 0, life: 1.2 });
      return false;
    }
    if (p.partial && !replan && this.pops) this.pops.push({ text: 'Så nära det går', col: '#ffe1a8', x: p.end.x, z: p.end.z, y: 0.4, age: 0, life: 1.2 });
    this.path = p.pts;
    this.target = { x: p.end.x, z: p.end.z, then: then || null, partial: !!p.partial };
    // Långa vägar springer du automatiskt (kan stängas av i inställningarna)
    if (!replan) this.runPath = this.runNext || (p.len > 14 && NV.settings.get('autoRun') !== false);
    this.runNext = false;
    this.pathStuck = 0; this.pathReplans = replan ? (this.pathReplans || 0) + 1 : 0;
    return true;
  };

  // Ritar vägen som små prickar på marken
  var ORIG_GFX = W.drawGroundFx;
  W.drawGroundFx = function (g) {
    ORIG_GFX.apply(this, arguments);
    if (!this.path || !this.path.length || !this.target || NV.settings.get('pathDots') === false) return;
    var pts = [{ x: this.pos.x, z: this.pos.z }].concat(this.path), t = this.t || 0, acc = 0;
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z);
      for (var d = (0.5 - acc % 0.5); d < L; d += 0.5) {
        var q = d / L, sp = this.toScreen(a.x + (b.x - a.x) * q, a.z + (b.z - a.z) * q, 0);
        var pulse = 0.55 + 0.35 * Math.sin(t * 5 - (acc + d) * 2), px = Math.round(sp.x), py = Math.round(sp.y);
        g.fillStyle = 'rgba(40,30,10,' + (pulse * 0.5).toFixed(2) + ')'; g.fillRect(px - 1, py, 3, 2);
        g.fillStyle = 'rgba(255,240,170,' + pulse.toFixed(2) + ')'; g.fillRect(px - 1, py - 1, 2, 2);
        NV._pathDots = (NV._pathDots || 0) + 1;
      }
      acc += L;
    }
  };

  // Mellanstationer med Shift-klick: vägen fortsätter från det mål du redan går mot
  W.queueWalk = function (x, z) {
    if (!this.target) return this.walkTo(x, z);
    var from = this.target, p = this.findPath(from.x, from.z, x, z);
    if (!p || !p.pts.length) return false;
    this.path = (this.path || []).concat(p.pts);
    this.target = { x: p.end.x, z: p.end.z, then: null, partial: !!p.partial };
    if (this.pops) this.pops.push({ text: '+ mellanstation', col: '#fff0b4', x: x, z: z, y: 0.3, age: 0, life: 1 });
    return true;
  };
  W.stopWalk = function () { if (this.target) { this.target = null; this.path = null; this.runPath = false; return true; } return false; };

  // Mus: håll inne för att gå mot pekaren, dubbelklick springer, högerklick avbryter, pekaren visar vad som går
  var ORIG_BIND = W.bindInput;
  W.bindInput = function () {
    ORIG_BIND.apply(this, arguments);
    var self = this, cvs = this.canvas, hold = null;
    function busy() { return self.game.ui && self.game.ui.captures(); }
    function world(e) { return self.screenToWorld(e.clientX * self.dpr, e.clientY * self.dpr); }
    cvs.addEventListener('mousedown', function (e) {
      if (e.button !== 0 || busy()) return;
      hold = { t: performance.now(), e: e, last: 0 };
    });
    window.addEventListener('mouseup', function () { if (hold && hold.dragging) self.dragEnd = performance.now(); hold = null; });
    cvs.addEventListener('mousemove', function (e) {
      if (hold) hold.e = e;
      if (busy() || !self.active) return;
      // Pekaren: hand över saker du kan använda, förbudsskylt över väggar och möbler
      var now = performance.now();
      if (self._curT && now - self._curT < 80) return;
      self._curT = now;
      var w = world(e), cur = 'default';
      if (self.pickAt(w.x, w.z)) cur = 'pointer';
      else if (self.collides(w.x, w.z, 0.05)) cur = 'not-allowed';
      if (cvs.style.cursor !== cur) cvs.style.cursor = cur;
    });
    this.dragTick = function () {
      if (!hold || busy()) return;
      var now = performance.now();
      if (now - hold.t < 260 || now - hold.last < 140) return;
      hold.last = now; hold.dragging = true;
      var w = world(hold.e);
      if (!self.collides(w.x, w.z, 0.2) && Math.hypot(w.x - self.pos.x, w.z - self.pos.z) > 0.4) self.walkTo(w.x, w.z, null, true);
    };
    cvs.addEventListener('dblclick', function (e) {
      if (busy()) return;
      var w = world(e);
      if (self.pickAt(w.x, w.z)) return;
      self.runNext = true;
      self.walkTo(w.x, w.z);
      self.runPath = true;
    });
    cvs.addEventListener('contextmenu', function (e) { if (!self.active) return; e.preventDefault(); if (self.stopWalk() && self.pops) self.pops.push({ text: 'Stopp', col: '#ffe1a8', x: self.pos.x, z: self.pos.z, y: 1.9, age: 0, life: 0.8 }); });
    document.addEventListener('keydown', function (e) { if (e.code === 'Escape' && self.active && !busy() && self.target) self.stopWalk(); });
  };
  // Klicket: Shift lägger till en mellanstation, och ett klick direkt efter att du hållit inne musen räknas inte
  W.clickWalk = function (x, z, shift) {
    if (this.dragEnd && performance.now() - this.dragEnd < 250) return;
    if (shift) this.queueWalk(x, z); else this.walkTo(x, z);
  };
  var ORIG_UPD = W.update;
  W.update = function (dt) {
    if (this.dragTick) this.dragTick();
    return ORIG_UPD.apply(this, arguments);
  };

  // Minikartan: klicka där i 2D så går du dit
  window.addEventListener('load', function () {
    var g = NV.game;
    if (!g) return;
    var orig = g.setWaypoint;
    g.setWaypoint = function (x, z) {
      orig.apply(this, arguments);
      if (this.mode === '2d' && this.world && this.world.walkTo && !(this.world.site === 'boras') === !(x > 50)) this.world.walkTo(x, z);
    };
  });

  // Markeringen från minikartan syns som en liten flagga i världen
  var ORIG_FX = W.drawFx;
  W.drawFx = function (g, sc) {
    ORIG_FX.apply(this, arguments);
    var wp = this.game.waypoint;
    if (!wp || (wp.x > 50) !== (this.site === 'boras')) return;
    if (Math.hypot(wp.x - this.pos.x, wp.z - this.pos.z) < 0.8) { this.game.waypoint = null; return; }
    var s = this.toScreen(wp.x, wp.z, 0), x = Math.round(s.x), y = Math.round(s.y), wave = Math.round(Math.sin((this.t || 0) * 6));
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x - 2, y, 6, 2);
    g.fillStyle = '#5b4632'; g.fillRect(x, y - 14, 1, 14);
    g.fillStyle = '#ff5a4f'; g.fillRect(x + 1, y - 14, 6, 2); g.fillRect(x + 1, y - 12, 5 + wave, 2); g.fillRect(x + 1, y - 10, 4, 1);
  };
})();
