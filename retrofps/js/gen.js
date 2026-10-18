'use strict';
// Procedurell bangenerator för KRYPTA (rum + korridorer, rogue-lik).
//   Gen.floor(seed, depth, opts)  -> banobjekt (kartsträngar + tema) för djup 1-5
//   Gen.boss(seed, opts)          -> bossarena
//   Gen.validate(level)           -> lista med felsträngar (tom = OK)
//   Gen.THEMES                    -> teman (väggtecken, golv/tak, dimma, namn)
// opts för floor: { shop: bool, weapon: 'g'|'r'|'m', theme: id|index }
//
// Tecken (utöver väggar 1-5, D G * x P S K V h a A g r m f o):  $ guld   C kortkista   M köpman (blockerar)   E elitfiende   B boss
//  1-5 vägg   D dörr   G grind   * hemlig vägg   x utgång   P start   S K V E B fiender
//  h a A $ g r m C föremål   f eldfat (blockerar)   o kruka   . golv
(function () {
  'use strict';

  const RNG = window.RNG;
  const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1]; // 0=Ö 1=S 2=V 3=N

  const isWall = c => c >= '1' && c <= '5';
  const isBlock = c => (c >= '1' && c <= '5') || c === 'f' || c === 'M'; // blockerar spelaren
  const isDoorCh = c => c === 'D' || c === 'G' || c === '*';
  const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

  // ---------- Teman ----------
  const THEMES = [
    { id: 'katakomber', wall: '1', floor: 'floor_stone_pattern', ceil: 'floor_stone', fog: [18, 14, 12], ambient: [0.17, 0.22], depth: [1, 5],
      names: ['KATAKOMBERNA', 'DE DJUPA KATAKOMBERNA', 'GRAVKAMMARNA'] },
    { id: 'blodsal', wall: '2', floor: 'floor_stone', ceil: 'floor_stone_pattern', fog: [26, 8, 8], ambient: [0.15, 0.19], depth: [1, 5],
      names: ['BLODSALEN', 'SLAKTHUSET', 'BLODKAMMARNA'] },
    { id: 'benhus', wall: '3', floor: 'floor_stone', ceil: 'floor_stone', fog: [20, 17, 12], ambient: [0.14, 0.19], depth: [1, 4],
      names: ['BENHUSET', 'BENKAMMARNA', 'SKELETTGROTTAN'] },
    { id: 'valv', wall: '4', floor: 'floor_wood_planks', ceil: 'floor_stone', fog: [10, 10, 22], ambient: [0.13, 0.17], depth: [2, 5],
      names: ['VALVEN', 'VAMPYRENS BORG', 'DE GAMLA VALVEN'] },
    { id: 'kapell', wall: '5', floor: 'floor_tiles_blue', ceil: 'floor_stone', fog: [14, 6, 20], ambient: [0.12, 0.16], depth: [1, 5],
      names: ['KAPELLET', 'KLOSTRET', 'HELGEDOMEN'] },
    { id: 'fangelse', wall: '4', floor: 'floor_stone', ceil: 'floor_wood_planks', fog: [12, 14, 10], ambient: [0.13, 0.18], depth: [1, 5],
      names: ['FANGHALAN', 'FANGELSET', 'TORTYRKAMMARNA'] },
    { id: 'krypta', wall: '3', floor: 'floor_tiles_blue', ceil: 'floor_stone_pattern', fog: [8, 14, 18], ambient: [0.13, 0.18], depth: [2, 5],
      names: ['DEN BLA KRYPTAN', 'ISKRYPTAN', 'DE DRUNKNADES GRAV'] },
  ];
  const BOSS_THEMES = [
    { wall: '4', floor: 'floor_tiles_blue', ceil: 'floor_stone_pattern', fog: [20, 6, 10], ambient: [0.15, 0.2], names: ['TRONSALEN', 'DEN SISTA SALEN', 'HERRSKARENS SAL'] },
    { wall: '2', floor: 'floor_stone_pattern', ceil: 'floor_stone', fog: [28, 6, 6], ambient: [0.15, 0.19], names: ['TRONSALEN', 'BLODTRONEN', 'MORDETS SAL'] },
    { wall: '5', floor: 'floor_wood_planks', ceil: 'floor_stone', fog: [14, 6, 22], ambient: [0.14, 0.18], names: ['TRONSALEN', 'KUNGENS SAL', 'DEN MORKA TRONEN'] },
  ];

  const roundAmb = (rng, a) => Math.max(0.12, Math.min(0.22, Math.round(rng.range(a[0], a[1]) * 100) / 100));

  // ---------- Hjälpstrukturer ----------
  function Heap() { // min-heap med (nyckel, värde)
    const k = [], v = [];
    return {
      key: 0,
      get size() { return k.length; },
      push(key, val) {
        let i = k.length; k.push(key); v.push(val);
        while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
        k[i] = key; v[i] = val;
      },
      pop() {
        const top = v[0]; this.key = k[0];
        const lk = k.pop(), lv = v.pop(), n = k.length;
        if (n > 0) {
          let i = 0;
          for (;;) {
            let c = 2 * i + 1; if (c >= n) break;
            if (c + 1 < n && k[c + 1] < k[c]) c++;
            if (k[c] >= lk) break;
            k[i] = k[c]; v[i] = v[c]; i = c;
          }
          k[i] = lk; v[i] = lv;
        }
        return top;
      },
    };
  }

  // ---------- Bana ----------
  function floor(seed, depth, opts) {
    opts = opts || {};
    depth = Math.max(1, Math.min(5, Math.round(depth || 1)));
    const root = RNG(seed);
    const trng = root.fork('theme');
    let theme;
    if (opts.theme !== undefined && opts.theme !== null) {
      theme = typeof opts.theme === 'number' ? THEMES[opts.theme % THEMES.length] : (THEMES.find(t => t.id === opts.theme) || THEMES[0]);
    } else {
      theme = trng.pick(THEMES.filter(t => depth >= t.depth[0] && depth <= t.depth[1]));
    }
    const name = trng.pick(theme.names);
    const ambient = roundAmb(trng, theme.ambient);
    for (let attempt = 0; attempt < 40; attempt++) {
      const lv = build(root.fork('floor' + attempt), depth, theme, opts);
      if (!lv) { floor.stats.retries++; continue; }
      const level = {
        name, floor: theme.floor, ceil: theme.ceil, secretWall: theme.wall, fog: theme.fog.slice(), ambient,
        map: lv.map, depth, seed, rooms: lv.rooms, theme: theme.id,
      };
      if (validate(level).length) { floor.stats.retries++; continue; }
      return level;
    }
    throw new Error('Gen.floor: kunde inte bygga en giltig bana (seed ' + seed + ', djup ' + depth + ')');
  }
  floor.stats = { retries: 0 };

  function build(rng, depth, theme, opts) {
    const wc = theme.wall;
    const base = 30 + (depth - 1) * 3;
    const W = Math.min(44, base + rng.int(0, 2)), H = Math.min(44, base + rng.int(0, 2));
    const g = [];
    for (let y = 0; y < H; y++) g.push(new Array(W).fill(wc));
    const inb = (x, y) => x >= 1 && y >= 1 && x <= W - 2 && y <= H - 2;

    // ----- 1. Rum -----
    const lo = Math.min(12, 7 + Math.floor((depth - 1) * 1.25)), hi = Math.min(13, lo + 3);
    const target = rng.int(lo, hi);
    const rooms = [];
    const sizeW = [0, 0, 0, 0, 2, 4, 4, 3, 2, 1]; // vikt för storlek 4..9
    const rollSize = cap => rng.weighted([4, 5, 6, 7, 8, 9].filter(s => s <= cap), s => sizeW[s]);
    const gapOK = (a, b, gap) => a.x + a.w + gap <= b.x || b.x + b.w + gap <= a.x || a.y + a.h + gap <= b.y || b.y + b.h + gap <= a.y;
    for (let tries = 0; rooms.length < target && tries < 900; tries++) {
      const cap = tries > 450 ? 5 : tries > 150 ? 7 : 9;
      const w = rollSize(cap), h = rollSize(cap);
      const x = rng.int(2, W - 2 - w), y = rng.int(2, H - 2 - h);
      const r = { x, y, w, h, type: 'normal', cx: x + (w >> 1), cy: y + (h >> 1), open: [], deg: 0, id: rooms.length };
      if (rooms.every(o => gapOK(o, r, 3))) rooms.push(r);
    }
    if (rooms.length < lo) return null;
    const n = rooms.length;
    const forb = new Uint8Array(W * H); // rum + väggring: hit får inga korridorer
    for (const r of rooms) {
      for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) forb[y * W + x] = 1;
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) g[y][x] = '.';
    }

    // ----- 2. Förbindelser: minimalt uppspännande träd + några extra -----
    const corr = new Uint8Array(W * H);
    const noise = new Float32Array(W * H);
    for (let i = 0; i < noise.length; i++) noise[i] = rng.next() * 0.6;
    const openings = []; // {x,y,room,horiz,ch}
    const rd = (a, b) => Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy);
    const edges = [], have = new Set();
    const inT = new Array(n).fill(false); inT[0] = true;
    for (let k = 1; k < n; k++) {
      let best = null, bd = 1e9;
      for (let i = 0; i < n; i++) if (inT[i]) for (let j = 0; j < n; j++) if (!inT[j]) {
        const d = rd(rooms[i], rooms[j]) + rng.next() * 4;
        if (d < bd) { bd = d; best = [i, j]; }
      }
      inT[best[1]] = true; edges.push(best); have.add(best[0] * 64 + best[1]); have.add(best[1] * 64 + best[0]);
    }
    const extraCand = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (!have.has(i * 64 + j)) extraCand.push([i, j, rd(rooms[i], rooms[j]) + rng.next() * 3]);
    extraCand.sort((a, b) => a[2] - b[2]);
    const nExtra = Math.min(rng.int(1, 3), extraCand.length);
    const extra = rng.shuffle(extraCand.slice(0, Math.max(nExtra * 2, 4))).slice(0, nExtra);

    function pickOpening(room, side) {
      const horizSide = side === 0 || side === 2;
      const len = horizSide ? room.h : room.w;
      const offs = rng.shuffle(Array.from({ length: len }, (_, i) => i));
      for (const off of offs) {
        let ox, oy;
        if (side === 0) { ox = room.x + room.w; oy = room.y + off; }
        else if (side === 2) { ox = room.x - 1; oy = room.y + off; }
        else if (side === 1) { ox = room.x + off; oy = room.y + room.h; }
        else { ox = room.x + off; oy = room.y - 1; }
        const ax = ox + DX[side], ay = oy + DY[side];
        if (!inb(ox, oy) || !inb(ax, ay) || forb[ay * W + ax]) continue;
        if (room.open.some(o => cheb(o.x, o.y, ox, oy) <= 1)) continue;
        return { ox, oy, ax, ay, side, horiz: horizSide };
      }
      return null;
    }

    function route(sx, sy, sdir, tx, ty) {
      const dist = new Float64Array(W * H * 4).fill(Infinity);
      const prev = new Int32Array(W * H * 4).fill(-1);
      const heap = Heap();
      const s0 = (sy * W + sx) * 4 + sdir;
      dist[s0] = 0; heap.push(0, s0);
      while (heap.size) {
        const cur = heap.pop();
        if (heap.key > dist[cur]) continue;
        const d = cur & 3, cell = cur >> 2, x = cell % W, y = (cell / W) | 0;
        if (x === tx && y === ty) {
          const path = [];
          for (let s = cur; s !== -1; s = prev[s]) path.push([(s >> 2) % W, (((s >> 2) / W) | 0)]);
          return path.reverse();
        }
        for (let nd = 0; nd < 4; nd++) {
          if (nd === ((d + 2) & 3)) continue;
          const nx = x + DX[nd], ny = y + DY[nd];
          if (!inb(nx, ny)) continue;
          const ni = ny * W + nx;
          if (forb[ni]) continue;
          const c = dist[cur] + (corr[ni] ? 0.8 : 1) + noise[ni] + (nd !== d ? 2.5 : 0);
          const st = ni * 4 + nd;
          if (c < dist[st]) { dist[st] = c; prev[st] = cur; heap.push(c, st); }
        }
      }
      return null;
    }

    function widen(path) {
      if (path.length < 9 || !rng.chance(0.3)) return;
      const i0 = rng.int(3, path.length - 6);
      const L = Math.min(rng.int(3, 8), path.length - 3 - i0);
      const run = path.slice(i0, i0 + L);
      const horiz = run.every(p => p[1] === run[0][1]), vert = run.every(p => p[0] === run[0][0]);
      if (!horiz && !vert) return;
      const sgn = rng.chance(0.5) ? 1 : -1;
      for (const [x, y] of run) {
        const wx = horiz ? x : x + sgn, wy = horiz ? y + sgn : y;
        if (inb(wx, wy) && !forb[wy * W + wx] && g[wy][wx] === wc) { g[wy][wx] = '.'; corr[wy * W + wx] = 1; }
      }
    }

    function connect(ia, ib) {
      const a = rooms[ia], b = rooms[ib];
      const dx = b.cx - a.cx, dy = b.cy - a.cy;
      const horiz = Math.abs(dx) + rng.next() * 4 >= Math.abs(dy);
      const sidesFor = hz => hz ? (dx > 0 ? [0, 2] : [2, 0]) : (dy > 0 ? [1, 3] : [3, 1]);
      const attempts = [sidesFor(horiz), sidesFor(horiz), sidesFor(!horiz)];
      for (let i = 0; i < 6; i++) attempts.push([rng.int(0, 3), rng.int(0, 3)]);
      for (const [sa, sb] of attempts) {
        const oa = pickOpening(a, sa), ob = pickOpening(b, sb);
        if (!oa || !ob) continue;
        const path = route(oa.ax, oa.ay, sa, ob.ax, ob.ay);
        if (!path) continue;
        for (const [x, y] of path) { g[y][x] = '.'; corr[y * W + x] = 1; }
        for (const [o, room] of [[oa, a], [ob, b]]) {
          g[o.oy][o.ox] = '.';
          room.open.push({ x: o.ox, y: o.oy });
          openings.push({ x: o.ox, y: o.oy, room: room.id, horiz: o.horiz, ch: '.' });
        }
        widen(path);
        a.deg++; b.deg++;
        return true;
      }
      return false;
    }
    for (const [i, j] of edges) if (!connect(i, j)) return null;
    for (const [i, j] of extra) connect(i, j);

    // ----- 3. Dörrar i en del öppningar -----
    const doorChance = 0.35 + rng.next() * 0.2;
    for (const o of openings) if (rng.chance(doorChance)) { o.ch = 'D'; g[o.y][o.x] = 'D'; }

    // ----- 4. Hemligt rum (3x3 bakom en hemlig vägg) -----
    const nearOpen = (x, y, r) => openings.some(o => cheb(o.x, o.y, x, y) <= r);
    let secret = null;
    if (rng.chance(0.6)) {
      const cands = [];
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        if (g[y][x] !== '.' || nearOpen(x, y, 1)) continue;
        for (let d = 0; d < 4; d++) {
          const ox = x + DX[d], oy = y + DY[d];
          if (g[oy][ox] !== wc) continue;
          for (let k = 0; k < 3; k++) {
            let ix, iy;
            if (d === 0) { ix = ox + 1; iy = y - k; } else if (d === 2) { ix = ox - 3; iy = y - k; }
            else if (d === 1) { iy = oy + 1; ix = x - k; } else { iy = oy - 3; ix = x - k; }
            if (ix < 1 || iy < 1 || ix + 3 > W - 1 || iy + 3 > H - 1) continue;
            let ok = true;
            for (let yy = iy - 1; ok && yy <= iy + 3; yy++) for (let xx = ix - 1; xx <= ix + 3; xx++) if (g[yy][xx] !== wc) { ok = false; break; }
            if (ok) cands.push({ ix, iy, ox, oy, d });
          }
        }
      }
      if (cands.length) {
        const c = rng.pick(cands);
        for (let yy = c.iy; yy < c.iy + 3; yy++) for (let xx = c.ix; xx < c.ix + 3; xx++) g[yy][xx] = '.';
        g[c.oy][c.ox] = '*';
        secret = { x: c.ix, y: c.iy, w: 3, h: 3, type: 'secret', cx: c.ix + 1, cy: c.iy + 1, open: [], deg: 1, id: n };
        openings.push({ x: c.ox, y: c.oy, room: n, horiz: c.d === 0 || c.d === 2, ch: '*' });
      }
    }

    // ----- 5. Roller -----
    const passable = c => !isBlock(c);
    function bfs(sx, sy) {
      const dist = new Int16Array(W * H).fill(-1);
      const q = new Int32Array(W * H); let qh = 0, qt = 0;
      dist[sy * W + sx] = 0; q[qt++] = sy * W + sx;
      while (qh < qt) {
        const cur = q[qh++], x = cur % W, y = (cur / W) | 0;
        for (let d = 0; d < 4; d++) {
          const nx = x + DX[d], ny = y + DY[d];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          if (dist[ni] >= 0 || !passable(g[ny][nx])) continue;
          dist[ni] = dist[cur] + 1; q[qt++] = ni;
        }
      }
      return dist;
    }
    // alla rum nåbara?
    {
      const d0 = bfs(rooms[0].cx, rooms[0].cy);
      if (rooms.some(r => d0[r.cy * W + r.cx] < 0)) return null;
      // start = rum längst från ett slumpmässigt rum -> långa banor
      const seedRoom = rooms[rng.int(0, n - 1)];
      const ds = bfs(seedRoom.cx, seedRoom.cy);
      let best = null, bv = -1;
      for (const r of rooms) { const v = ds[r.cy * W + r.cx] + rng.next(); if (v > bv) { bv = v; best = r; } }
      best.type = 'start';
    }
    const start = rooms.find(r => r.type === 'start');
    const dS = bfs(start.cx, start.cy);
    for (const r of rooms) r.d = dS[r.cy * W + r.cx];
    let exitRoom = null, ev = -1;
    for (const r of rooms) if (r !== start) { const v = r.d + rng.next() * 0.5; if (v > ev) { ev = v; exitRoom = r; } }
    exitRoom.type = 'exit';
    const free = () => rooms.filter(r => r.type === 'normal');
    if (opts.shop) {
      const c = free().sort((a, b) => a.d - b.d);
      const pool = c.slice(0, Math.max(1, Math.ceil(c.length / 2))).filter(r => r.w >= 5 && r.h >= 5);
      const shop = pool.length ? rng.pick(pool) : c[0];
      if (shop) shop.type = 'shop';
    }
    {
      const c = free();
      const t = rng.weighted(c, r => (r.deg === 1 ? 3 : 1) * (r.w * r.h >= 25 ? 1.5 : 1));
      if (t) t.type = 'treasure';
    }
    {
      const nElite = 1 + Math.floor(depth / 2);
      for (let i = 0; i < nElite; i++) {
        const c = free().sort((a, b) => b.d - a.d);
        if (!c.length) break;
        rng.pick(c.slice(0, Math.max(1, Math.ceil(c.length * 0.6)))).type = 'elite';
      }
    }
    if (secret) rooms.push(secret);
    const main = rooms.filter(r => r.type !== 'secret');
    const roomOf = type => rooms.find(r => r.type === type);

    // ----- 6. Placering av innehåll -----
    const genBlock = c => isBlock(c) || c === 'o';
    let ref = [start.cx, start.cy];
    function intact(x, y) { // hänger allt golv ihop om (x,y) blockeras?
      const save = g[y][x]; g[y][x] = 'f';
      let total = 0;
      for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) if (!genBlock(g[yy][xx])) total++;
      let rx = ref[0], ry = ref[1];
      if (rx === x && ry === y) { rx = start.cx + 1; ry = start.cy; } // referensen ska inte vara den blockerade rutan
      let ok = false;
      if (!genBlock(g[ry][rx])) {
        const seen = new Uint8Array(W * H), st = [ry * W + rx]; seen[st[0]] = 1; let cnt = 0;
        while (st.length) {
          const cur = st.pop(); cnt++;
          const cx = cur % W, cy = (cur / W) | 0;
          for (let d = 0; d < 4; d++) {
            const nx = cx + DX[d], ny = cy + DY[d];
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const ni = ny * W + nx;
            if (seen[ni] || genBlock(g[ny][nx])) continue;
            seen[ni] = 1; st.push(ni);
          }
        }
        ok = cnt === total;
      }
      g[y][x] = save;
      return ok;
    }
    const cellsOf = r => { const out = []; for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.push([x, y]); return out; };
    const wallAdj = (x, y) => isWall(g[y - 1][x]) || isWall(g[y + 1][x]) || isWall(g[y][x - 1]) || isWall(g[y][x + 1]);
    const byCenter = r => (a, b) => (cheb(a[0], a[1], r.cx, r.cy) + rng.next()) - (cheb(b[0], b[1], r.cx, r.cy) + rng.next());
    // lägger tecknet ch på en fri ruta i rummet (som uppfyller pred); returnerar [x,y] eller null
    function put(r, ch, pred, order) {
      let c = cellsOf(r).filter(([x, y]) => g[y][x] === '.' && !nearOpen(x, y, 1) && (!pred || pred(x, y)));
      c = order === 'center' ? c.sort(byCenter(r)) : rng.shuffle(c);
      for (const [x, y] of c) { g[y][x] = ch; return [x, y]; }
      return null;
    }
    function putBlocker(r, ch, pred, order, dist) {
      let c = cellsOf(r).filter(([x, y]) => g[y][x] === '.' && !nearOpen(x, y, dist || 1) && (!pred || pred(x, y)));
      c = order === 'center' ? c.sort(byCenter(r)) : rng.shuffle(c);
      for (const [x, y] of c) if (intact(x, y)) { g[y][x] = ch; return [x, y]; }
      return null;
    }

    const P = put(start, 'P', null, 'center');
    ref = P;
    const X = put(exitRoom, 'x', null, 'center');
    if (!P || !X) return null;

    // pelare i stora rum
    for (const r of main) {
      if (r.w < 6 || r.h < 6) continue;
      if (!rng.chance(r.w * r.h >= 49 ? 0.75 : 0.45)) continue;
      const k = rng.int(1, Math.max(1, Math.min(4, Math.floor(r.w * r.h / 22))));
      const placed = [];
      for (let t = 0; t < k; t++) {
        const c = putBlocker(r, wc, (x, y) => x >= r.x + 2 && x <= r.x + r.w - 3 && y >= r.y + 2 && y <= r.y + r.h - 3 && placed.every(p => cheb(p[0], p[1], x, y) >= 2) && cheb(x, y, P[0], P[1]) >= 2 && cheb(x, y, X[0], X[1]) >= 2, 'random', 2);
        if (c) placed.push(c);
      }
    }

    // köpman
    const shopRoom = roomOf('shop');
    if (shopRoom) {
      const m = putBlocker(shopRoom, 'M', (x, y) => wallAdj(x, y), 'center', 2) || putBlocker(shopRoom, 'M', null, 'center', 2);
      if (!m) return null;
    }
    // kortkista
    const trRoom = roomOf('treasure');
    if (trRoom && !put(trRoom, 'C', null, 'center')) return null;

    // eldfat: 1-2 per rum, intill en vägg, aldrig vid dörrar/öppningar
    for (const r of main) {
      const want = rng.int(1, 2), placed = [];
      for (let t = 0; t < want; t++) {
        const c = putBlocker(r, 'f', (x, y) => wallAdj(x, y) && cheb(x, y, P[0], P[1]) >= 2 && cheb(x, y, X[0], X[1]) >= 2 && placed.every(p => cheb(p[0], p[1], x, y) >= 3), 'random', 1);
        if (c) placed.push(c);
      }
    }

    // vapen: ett rum mitt i banan
    if (opts.weapon === 'g' || opts.weapon === 'r' || opts.weapon === 'm') {
      const ds = main.map(r => r.d).sort((a, b) => a - b), med = ds[ds.length >> 1];
      let pool = main.filter(r => r.type === 'normal'); if (!pool.length) pool = main.filter(r => r.type !== 'start' && r.type !== 'exit' && r.type !== 'shop');
      pool.sort((a, b) => Math.abs(a.d - med) - Math.abs(b.d - med));
      let done = false;
      for (const r of pool) if (put(r, opts.weapon, null, 'random')) { done = true; break; }
      if (!done) return null;
    }

    // hälsa, ammo, rustning, guld, krukor
    const lootRooms = main.filter(r => r.type !== 'shop');
    const areaW = r => r.w * r.h;
    const scatter = (count, ch, rooms2, pred) => {
      for (let i = 0; i < count; i++) {
        for (let t = 0; t < 8; t++) { const r = rng.weighted(rooms2, areaW); if (r && put(r, ch, pred, 'random')) break; }
      }
    };
    if (rng.chance(0.4)) put(start, rng.chance(0.5) ? 'h' : 'a', (x, y) => cheb(x, y, P[0], P[1]) >= 2, 'random');
    scatter(rng.int(3, 5), 'h', lootRooms.filter(r => r.type !== 'start'));
    scatter(rng.int(3, 5), 'a', lootRooms.filter(r => r.type !== 'start'));
    if (rng.chance(Math.min(0.75, 0.3 + 0.08 * depth))) scatter(1, 'A', lootRooms.filter(r => r.type === 'normal' || r.type === 'treasure' || r.type === 'exit' || r.type === 'elite'));
    const gold = rng.int(3, 8);
    const secretGold = secret ? Math.min(2, gold - 2) : 0;
    scatter(gold - secretGold, '$', lootRooms);
    const potRooms = main.filter(r => r.type !== 'shop');
    const pots = rng.int(4, 8);
    for (let i = 0; i < pots; i++) {
      for (let t = 0; t < 8; t++) {
        const r = rng.weighted(potRooms, areaW);
        if (r && putBlocker(r, 'o', (x, y) => wallAdj(x, y) || rng.chance(0.25), 'random', 1)) break;
      }
    }

    // hemligt rum: belöningar
    if (secret) {
      const cs = rng.shuffle(cellsOf(secret));
      const items = [rng.chance(0.55) ? 'A' : 'C'];
      for (let i = 0; i < secretGold; i++) items.push('$');
      if (rng.chance(0.7)) items.push('h');
      if (rng.chance(0.4)) items.push('a');
      // belöningen i mitten, resten slumpat
      g[secret.cy][secret.cx] = items[0];
      let ci = 0;
      for (let i = 1; i < items.length; i++) {
        while (ci < cs.length && (g[cs[ci][1]][cs[ci][0]] !== '.' || (cs[ci][0] === secret.cx && cs[ci][1] === secret.cy))) ci++;
        if (ci < cs.length) { g[cs[ci][1]][cs[ci][0]] = items[i]; ci++; }
      }
    }

    // fiender
    const nEnemies = 6 + 3 * depth + rng.int(-1, 2);
    // vikter per våning: nya sorter dyker upp ju djupare man kommer
    const eTypes = [['S', Math.max(4, 10 - depth)], ['K', 3 + 1.2 * depth], ['V', depth >= 2 ? 1.5 + 1.5 * (depth - 1) : 0],
      ['L', 2 + 0.5 * depth], ['I', depth >= 2 ? 1 + depth : 0], ['O', depth >= 2 ? 0.8 + 0.4 * depth : 0],
      ['N', depth >= 3 ? 0.5 + 0.5 * depth : 0], ['R', depth >= 3 ? 1 + 0.5 * depth : 0], ['W', depth >= 3 ? 0.6 + 0.6 * depth : 0]];
    const farFromP = (x, y) => Math.hypot(x - P[0], y - P[1]) >= 7;
    const enemyRooms = main.filter(r => r.type !== 'start' && r.type !== 'shop');
    const cnt = new Map();
    const cap = r => Math.max(2, Math.floor(r.w * r.h / 10));
    const typeF = { normal: 1, treasure: 1.2, exit: 1.4, elite: 1.5 };
    // elitfiender först (ett per elitrum)
    for (const r of enemyRooms.filter(r => r.type === 'elite')) { if (put(r, 'E', farFromP, 'random')) cnt.set(r, 1); }
    for (let i = 0; i < nEnemies; i++) {
      const ch = rng.weighted(eTypes, t => t[1])[0];
      for (let t = 0; t < 10; t++) {
        const r = rng.weighted(enemyRooms, q => ((cnt.get(q) || 0) < cap(q) ? areaW(q) * (typeF[q.type] || 1) : 0));
        if (!r) break;
        if (put(r, ch, farFromP, 'random')) { cnt.set(r, (cnt.get(r) || 0) + 1); break; }
        cnt.set(r, 99);
      }
    }

    return {
      map: g.map(row => row.join('')),
      rooms: rooms.map(r => ({ x: r.x, y: r.y, w: r.w, h: r.h, type: r.type })),
    };
  }

  // ---------- Bossarena ----------
  function boss(seed, opts) {
    opts = opts || {};
    const rng = RNG(seed).fork('boss');
    const theme = rng.pick(BOSS_THEMES);
    const wc = theme.wall;
    const W = 25, H = 27, cx = 12; // arena: x 1..23 (23 breda), y 4..25 (22 djupa)
    const AX0 = 1, AX1 = 23, AY0 = 4, AY1 = 25;
    const g = [];
    for (let y = 0; y < H; y++) g.push(new Array(W).fill(wc));
    for (let y = AY0; y <= AY1; y++) for (let x = AX0; x <= AX1; x++) g[y][x] = '.';
    for (let y = 1; y <= 2; y++) for (let x = cx - 1; x <= cx + 1; x++) g[y][x] = '.';
    g[1][cx] = 'x';
    g[3][cx] = 'G';
    const PX = cx, PY = AY1 - 1, BX = cx, BY = AY0 + 3;
    // pelare (2x2) speglade i x
    const blocks = [];
    const nPairs = rng.int(2, 3);
    for (let t = 0; t < 60 && blocks.length < nPairs; t++) {
      const x = rng.int(3, 8), y = rng.int(8, 20);
      if (blocks.some(b => Math.abs(b.x - x) < 4 && Math.abs(b.y - y) < 4)) continue;
      blocks.push({ x, y });
    }
    for (const b of blocks) for (const bx of [b.x, 23 - b.x]) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) g[b.y + dy][bx + dx] = wc;
    // eldfat runt kanterna
    const jit = () => rng.int(-1, 1);
    const spots = [];
    for (const x of [3, 7, 17, 21]) { spots.push([x + jit(), AY0], [x + jit(), AY1]); }
    for (const y of [7, 12, 17, 22]) { spots.push([AX0, y + jit()], [AX1, y + jit()]); }
    for (const [x, y] of spots) {
      if (g[y][x] !== '.' || cheb(x, y, cx, AY0) <= 2 || cheb(x, y, PX, PY) <= 1) continue;
      g[y][x] = 'f';
    }
    g[PY][PX] = 'P';
    g[BY][BX] = 'B';
    const fc = [];
    for (let y = 12; y <= AY1; y++) for (let x = AX0; x <= AX1; x++) if (g[y][x] === '.' && cheb(x, y, PX, PY) >= 2) fc.push([x, y]);
    rng.shuffle(fc);
    const nh = rng.int(3, 4), na = rng.int(3, 4);
    for (let i = 0; i < nh + na && i < fc.length; i++) g[fc[i][1]][fc[i][0]] = i < nh ? 'h' : 'a';
    const level = {
      name: rng.pick(theme.names), floor: theme.floor, ceil: theme.ceil, secretWall: wc, fog: theme.fog.slice(), ambient: roundAmb(rng, theme.ambient),
      map: g.map(r => r.join('')), depth: opts.depth || 6, seed,
      rooms: [{ x: AX0, y: AY0, w: AX1 - AX0 + 1, h: AY1 - AY0 + 1, type: 'boss' }, { x: cx - 1, y: 1, w: 3, h: 2, type: 'exit' }],
    };
    return level;
  }

  // ---------- Validering ----------
  const ENEMY_CHARS = 'SKVILNORWE';
  const VALID = new Set(('12345DG*xPBhaA$grmCMfo.' + ENEMY_CHARS).split(''));
  function validate(level) {
    const errs = [];
    const map = level && level.map;
    if (!Array.isArray(map) || !map.length) return ['kartan saknas'];
    const H = map.length, W = map[0].length;
    for (let y = 0; y < H; y++) if (typeof map[y] !== 'string' || map[y].length !== W) { errs.push('rad ' + y + ' har fel längd'); return errs; }
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? '1' : map[y][x];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = map[y][x];
      if (!VALID.has(c)) errs.push('okänt tecken "' + c + '" vid ' + x + ',' + y);
      if ((x === 0 || y === 0 || x === W - 1 || y === H - 1) && !isWall(c)) errs.push('kanten är inte vägg vid ' + x + ',' + y);
    }
    let px = -1, py = -1, nP = 0, nX = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (map[y][x] === 'P') { nP++; px = x; py = y; }
      if (map[y][x] === 'x') nX++;
    }
    if (nP !== 1) errs.push('förväntade exakt ett P, hittade ' + nP);
    if (nX < 1) errs.push('utgång x saknas');
    // dörrar och eldfat
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = map[y][x];
      if (isDoorCh(c)) {
        const ew = isWall(at(x - 1, y)) && isWall(at(x + 1, y)), ns = isWall(at(x, y - 1)) && isWall(at(x, y + 1));
        if (!ew && !ns) errs.push('dörr ' + c + ' utan väggar på sidorna vid ' + x + ',' + y);
        else if (ew && ns) errs.push('dörr ' + c + ' innesluten av väggar vid ' + x + ',' + y);
        else {
          const a = ew ? at(x, y - 1) : at(x - 1, y), b = ew ? at(x, y + 1) : at(x + 1, y);
          if (isBlock(a) || isBlock(b)) errs.push('dörr ' + c + ' har blockerad passage vid ' + x + ',' + y);
        }
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, y + dy) === 'f') errs.push('eldfat intill ' + c + ' vid ' + x + ',' + y);
      }
    }
    // nåbarhet från P (4-grannskap)
    if (nP === 1) {
      const seen = new Uint8Array(W * H), st = [py * W + px]; seen[st[0]] = 1;
      while (st.length) {
        const cur = st.pop(), x = cur % W, y = (cur / W) | 0;
        for (let d = 0; d < 4; d++) {
          const nx = x + DX[d], ny = y + DY[d];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          if (seen[ni] || isBlock(map[ny][nx])) continue;
          seen[ni] = 1; st.push(ni);
        }
      }
      let shown = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!isBlock(map[y][x]) && !seen[y * W + x] && shown++ < 5) errs.push('onåbar ruta "' + map[y][x] + '" vid ' + x + ',' + y);
      if (shown > 5) errs.push('... totalt ' + shown + ' onåbara rutor');
    }
    // fiender: inte i startrummet / nära P
    const rooms = level.rooms || [];
    const startRoom = rooms.find(r => r.type === 'start');
    const inRoom = (r, x, y) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = map[y][x];
      if (ENEMY_CHARS.includes(c)) {
        if (nP === 1 && Math.hypot(x - px, y - py) < 6) errs.push('fiende ' + c + ' för nära P vid ' + x + ',' + y);
        if (startRoom && inRoom(startRoom, x, y)) errs.push('fiende ' + c + ' i startrummet vid ' + x + ',' + y);
      }
    }
    // rumstyper
    const startish = rooms.find(r => r.type === 'start' || r.type === 'boss');
    if (startish && nP === 1 && !inRoom(startish, px, py)) errs.push('P ligger inte i startrummet');
    const ex = rooms.find(r => r.type === 'exit');
    if (ex) {
      let found = false;
      for (let y = ex.y; y < ex.y + ex.h; y++) for (let x = ex.x; x < ex.x + ex.w; x++) if (at(x, y) === 'x') found = true;
      if (!found) errs.push('utgången x ligger inte i exit-rummet');
    }
    for (const k of ['name', 'floor', 'ceil', 'secretWall']) if (typeof level[k] !== 'string') errs.push('fältet ' + k + ' saknas');
    if (!Array.isArray(level.fog) || level.fog.length !== 3) errs.push('fog saknas');
    if (typeof level.ambient !== 'number') errs.push('ambient saknas');
    return errs;
  }

  window.Gen = { floor, boss, validate, THEMES, BOSS_THEMES };
})();
