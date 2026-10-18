'use strict';
// Procedurell bangenerator för KRYPTA: fem biomer som delar ett rutnäts-API och en flood fill-pass (connectRegions).
//   Gen.floor(seed, depth, opts)  -> banobjekt (kartsträngar + tema) för djup 1-5
//   Gen.boss(seed, opts)          -> bossarena (opts.arena: 'hall' | 'graveyard' | 'cave' | 'forest')
//   Gen.validate(level)           -> lista med felsträngar (tom = OK)
//   Gen.THEMES                    -> fängelsehålans teman (väggtecken, golv/tak, dimma, namn)
//   Gen.BIOMES                    -> biomer (id, namn, utomhus, vikt, djup)
// opts för floor: { biome: id, shop: bool, weapon: ett tecken ur WEAPON_CHARS, theme: id|index (bara dungeon) }
//
// Biomer: dungeon (rum + korridorer), caves (cellautomat), graveyard (öppet fält med prefabs),
//   forest (brusmask + slingrande stig), courtyard (borggård omgiven av byggnadslängor)
// Fält utöver kartan: biome, sky (null inomhus, annars '1' öppen himmel / '0' tak per ruta),
//   floors (golvtexturer, [0] = floor) + floorMask ('0'-'3' per ruta = index i floors), ceil (tak där sky är '0')
//
// Tecken:
//  1-5 vägg   6 skogsbryn   7 kyrkogårdsmur   8 grottberg   9 timmervägg
//  D dörr   G grind   * hemlig vägg   x utgång   P start   S K V I L N O R W fiender   E elitfiende   B boss
//  h a A $ C föremål (C kortkista), g r m d b s p vapen (se WEAPON_CHARS)   M köpman (blockerar)
//  f eldfat (blockerar, ljuskälla)   t träd, n gravsten (blockerar men är sprites)   o kruka   . golv
(function () {
  // vapen på kartan: g hagelgevär, r gevär, m kpist, d dubbelbössa, b armborst, s signalpistol, p prickskyttegevär
  const WEAPON_CHARS = 'grmdbsp';
  'use strict';

  const RNG = window.RNG;
  const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1]; // 0=Ö 1=S 2=V 3=N
  const RX = [0, 1, 1, 1, 0, -1, -1, -1], RY = [-1, -1, 0, 1, 1, 1, 0, -1]; // ringen runt en ruta: N NÖ Ö SÖ S SV V NV

  const isWall = c => c >= '1' && c <= '9';
  const isProp = c => c === 't' || c === 'n';
  const isBlock = c => isWall(c) || c === 'f' || c === 'M' || isProp(c); // blockerar spelaren
  const genBlk = c => isBlock(c) || c === 'o'; // generatorn räknar även krukor som hinder
  const isDoorCh = c => c === 'D' || c === 'G' || c === '*';
  const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

  // ---------- Biomer ----------
  const BIOMES = [
    { id: 'dungeon', name: 'KATAKOMBER', outdoor: false, weight: 40, depth: [1, 5] },
    { id: 'caves', name: 'GROTTOR', outdoor: false, weight: 20, depth: [1, 5] },
    { id: 'graveyard', name: 'KYRKOGÅRD', outdoor: true, weight: 15, depth: [1, 5] },
    { id: 'forest', name: 'SKOG', outdoor: true, weight: 12, depth: [1, 4] },
    { id: 'courtyard', name: 'BORGGÅRD', outdoor: true, weight: 13, depth: [2, 5] }, // delvis utomhus: gården har himmel
  ];

  // ---------- Teman (dungeon) ----------
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
  // övriga biomers utseende (byggfunktionerna läggs in längre ned)
  const NIGHT_FOG = rng => [rng.int(10, 14), rng.int(12, 16), rng.int(22, 26)]; // mörkblå natt
  const LOOKS = {
    caves: { wall: '8', floors: ['floor_cave', 'floor_mud'], ceil: 'ceil_cave', ambient: [0.12, 0.17],
      fog: rng => rng.pick([[12, 10, 9], [8, 10, 14], [10, 12, 10], [14, 10, 12]]),
      names: ['GROTTORNA', 'DROPPSTENSGROTTAN', 'DE SJUNGANDE GROTTORNA', 'DJUPGRUVAN', 'MASKGÅNGARNA'] },
    graveyard: { wall: '7', floors: ['floor_grass_dead', 'floor_gravel', 'floor_stone_pattern', 'floor_ground_dirt'], ceil: 'floor_stone', ambient: [0.24, 0.3],
      fog: NIGHT_FOG, names: ['KYRKOGÅRDEN', 'DE GLÖMDAS GRAVFÄLT', 'LIKVAKAN', 'BENÅKERN', 'DE DÖDAS TRÄDGÅRD'] },
    forest: { wall: '6', floors: ['floor_ground_grass', 'floor_ground_dirt', 'floor_mud', 'floor_grass_dead'], ceil: 'floor_wood_planks', ambient: [0.25, 0.32],
      fog: NIGHT_FOG, names: ['DÖDSKOGEN', 'HÄXSKOGEN', 'DIMSKOGEN', 'VARGSKOGEN', 'DE HÄNGDAS LUND'] },
    courtyard: { wall: '1', floors: ['floor_gravel', 'floor_ground_grass', 'floor_stone', 'floor_wood_planks'], ceil: 'floor_wood_planks', ambient: [0.24, 0.3],
      fog: NIGHT_FOG, names: ['BORGGÅRDEN', 'RUINBORGEN', 'KLOSTERGÅRDEN', 'SLOTTSGÅRDEN'] },
  };

  const roundAmb = (rng, a) => Math.max(a[0], Math.min(a[1], Math.round(rng.range(a[0], a[1]) * 100) / 100));
  const mapSize = (rng, depth) => { const base = 30 + (depth - 1) * 3; return [Math.min(44, base + rng.int(0, 2)), Math.min(44, base + rng.int(0, 2))]; };

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

  // ---------- Fiender (delas av alla biomer) ----------
  // vikter per våning: nya sorter dyker upp ju djupare man kommer
  const enemyTypes = depth => [['S', Math.max(4, 10 - depth)], ['K', 3 + 1.2 * depth], ['V', depth >= 2 ? 1.5 + 1.5 * (depth - 1) : 0],
    ['L', 2 + 0.5 * depth], ['I', depth >= 2 ? 1 + depth : 0], ['O', depth >= 2 ? 0.8 + 0.4 * depth : 0],
    ['N', depth >= 3 ? 0.5 + 0.5 * depth : 0], ['R', depth >= 3 ? 1 + 0.5 * depth : 0], ['W', depth >= 3 ? 0.6 + 0.6 * depth : 0]];
  // sprider ut fiender över rum/områden (list) med put(rum, tecken, pred, ordning); placeElites lägger ett E per elitrum först,
  // annars räknas elitrummen som redan bemannade med ett
  function spreadEnemies(rng, depth, list, areaOf, put, farFromP, placeElites) {
    const nEnemies = 6 + 3 * depth + rng.int(-1, 2);
    const eTypes = enemyTypes(depth);
    const cnt = new Map();
    const cap = r => Math.max(2, Math.floor(areaOf(r) / 10));
    const typeF = { normal: 1, treasure: 1.2, exit: 1.4, elite: 1.5 };
    for (const r of list.filter(r => r.type === 'elite')) { if (!placeElites || put(r, 'E', farFromP, 'random')) cnt.set(r, 1); }
    for (let i = 0; i < nEnemies; i++) {
      const ch = rng.weighted(eTypes, t => t[1])[0];
      for (let t = 0; t < 10; t++) {
        const r = rng.weighted(list, q => ((cnt.get(q) || 0) < cap(q) ? areaOf(q) * (typeF[q.type] || 1) : 0));
        if (!r) break;
        if (put(r, ch, farFromP, 'random')) { cnt.set(r, (cnt.get(r) || 0) + 1); break; }
        cnt.set(r, 99);
      }
    }
  }

  // ---------- Bana ----------
  function pickBiome(rng, depth, opts) {
    if (opts.biome) { const b = BIOMES.find(b => b.id === opts.biome); if (b) return b; }
    if (opts.theme !== undefined && opts.theme !== null) return BIOMES[0]; // teman finns bara i fängelsehålan
    return rng.weighted(BIOMES, b => (depth >= b.depth[0] && depth <= b.depth[1] ? b.weight : 0));
  }

  function floor(seed, depth, opts) {
    opts = opts || {};
    depth = Math.max(1, Math.min(5, Math.round(depth || 1)));
    const root = RNG(seed);
    const biome = pickBiome(root.fork('biome'), depth, opts);
    if (biome.id !== 'dungeon') return biomeFloor(root, seed, depth, opts, biome);
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
      const H = lv.map.length, W = lv.map[0].length;
      const level = {
        name, biome: 'dungeon', floor: theme.floor, floors: [theme.floor], floorMask: new Array(H).fill('0'.repeat(W)),
        ceil: theme.ceil, sky: null, secretWall: theme.wall, fog: theme.fog.slice(), ambient,
        map: lv.map, depth, seed, rooms: lv.rooms, theme: theme.id,
      };
      if (validate(level).length) { floor.stats.retries++; continue; }
      return level;
    }
    throw new Error('Gen.floor: kunde inte bygga en giltig bana (seed ' + seed + ', djup ' + depth + ')');
  }
  floor.stats = { retries: 0 };

  function biomeFloor(root, seed, depth, opts, biome) {
    const look = LOOKS[biome.id], lrng = root.fork('look');
    const name = lrng.pick(look.names), fog = look.fog(lrng), ambient = roundAmb(lrng, look.ambient);
    for (let attempt = 0; attempt < 40; attempt++) {
      const res = look.build(root.fork(biome.id + attempt), depth, opts, look);
      if (!res) { floor.stats.retries++; continue; }
      const G = res.G, rows = a => { const out = []; for (let y = 0; y < G.H; y++) { let s = ''; for (let x = 0; x < G.W; x++) s += a[y * G.W + x]; out.push(s); } return out; };
      const level = {
        name, biome: biome.id, floor: look.floors[0], floors: look.floors.slice(), floorMask: rows(G.fm),
        ceil: look.ceil, sky: biome.outdoor ? rows(G.sky) : null, secretWall: look.wall, fog, ambient,
        map: G.g.map(r => r.join('')), depth, seed, rooms: res.rooms, theme: biome.id,
      };
      if (validate(level).length) { floor.stats.retries++; continue; }
      return level;
    }
    throw new Error('Gen.floor: kunde inte bygga en giltig bana (' + biome.id + ', seed ' + seed + ', djup ' + depth + ')');
  }

  // ---------- Fängelsehålan: rum + korridorer ----------
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
    let ref = [start.cx, start.cy];
    function intact(x, y) { // hänger allt golv ihop om (x,y) blockeras?
      const save = g[y][x]; g[y][x] = 'f';
      let total = 0;
      for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) if (!genBlk(g[yy][xx])) total++;
      let rx = ref[0], ry = ref[1];
      if (rx === x && ry === y) { rx = start.cx + 1; ry = start.cy; } // referensen ska inte vara den blockerade rutan
      let ok = false;
      if (!genBlk(g[ry][rx])) {
        const seen = new Uint8Array(W * H), st = [ry * W + rx]; seen[st[0]] = 1; let cnt = 0;
        while (st.length) {
          const cur = st.pop(); cnt++;
          const cx = cur % W, cy = (cur / W) | 0;
          for (let d = 0; d < 4; d++) {
            const nx = cx + DX[d], ny = cy + DY[d];
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const ni = ny * W + nx;
            if (seen[ni] || genBlk(g[ny][nx])) continue;
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
    if (opts.weapon && WEAPON_CHARS.includes(opts.weapon)) {
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
    if (secret) fillSecret(rng, g, secret, cellsOf(secret), secretGold);

    // fiender (elitfiender först, ett per elitrum)
    const farFromP = (x, y) => Math.hypot(x - P[0], y - P[1]) >= 7;
    spreadEnemies(rng, depth, main.filter(r => r.type !== 'start' && r.type !== 'shop'), areaW, put, farFromP, true);

    return {
      map: g.map(row => row.join('')),
      rooms: rooms.map(r => ({ x: r.x, y: r.y, w: r.w, h: r.h, type: r.type })),
    };
  }

  // hemligt rum: kortkista eller rustning i mitten, resten slumpat
  function fillSecret(rng, g, secret, cells, secretGold) {
    const cs = rng.shuffle(cells);
    const items = [rng.chance(0.55) ? 'A' : 'C'];
    for (let i = 0; i < secretGold; i++) items.push('$');
    if (rng.chance(0.7)) items.push('h');
    if (rng.chance(0.4)) items.push('a');
    g[secret.cy][secret.cx] = items[0];
    let ci = 0;
    for (let i = 1; i < items.length; i++) {
      while (ci < cs.length && (g[cs[ci][1]][cs[ci][0]] !== '.' || (cs[ci][0] === secret.cx && cs[ci][1] === secret.cy))) ci++;
      if (ci < cs.length) { g[cs[ci][1]][cs[ci][0]] = items[i]; ci++; }
    }
  }

  // ---------- Rutnät: gemensamt API för biomerna ----------
  // g: tecken, fm: golvindex, sky: 1 = öppen himmel, lock: 1 = inga hinder, 2 = inget alls (dörrframsidor o.d.),
  // solid: får aldrig grävas igenom (kant, byggnadsväggar, dörrar)
  function Grid(W, H, fill, border) {
    const G = { W, H, g: [], fm: new Uint8Array(W * H), sky: new Uint8Array(W * H), lock: new Uint8Array(W * H), solid: new Uint8Array(W * H) };
    for (let y = 0; y < H; y++) G.g.push(new Array(W).fill(fill));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x === 0 || y === 0 || x === W - 1 || y === H - 1) { G.g[y][x] = border || fill; G.solid[y * W + x] = 1; }
    G.inb = (x, y) => x >= 1 && y >= 1 && x <= W - 2 && y <= H - 2;
    G.at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? '1' : G.g[y][x];
    G.lockMin = (x, y, v) => { if (x >= 0 && y >= 0 && x < W && y < H && G.lock[y * W + x] < v) G.lock[y * W + x] = v; };
    return G;
  }

  // kan (x,y) blockeras utan att något golv tappar kontakten? Lokal koll: alla fria 4-grannar måste hänga ihop
  // via ringen av 8 grannar (räcker för att hela kartan förblir sammanhängande)
  function localOK(G, x, y) {
    const f = [];
    for (let k = 0; k < 8; k++) f.push(!genBlk(G.at(x + RX[k], y + RY[k])));
    let runs = 0;
    for (let k = 0; k < 8; k++) {
      if (!f[k] || f[(k + 7) & 7]) continue; // bara början på en serie fria ringrutor
      let orth = false;
      for (let j = k; j < k + 8 && f[j & 7]; j++) if ((j & 1) === 0) orth = true;
      if (orth) runs++;
    }
    return runs <= 1;
  }
  // sätter ett hinder (träd, gravsten, pelare, ...) om rutan är fri, olåst och inte stänger av något
  function plant(G, x, y, ch) {
    if (!G.inb(x, y) || G.g[y][x] !== '.' || G.lock[y * G.W + x] || !localOK(G, x, y)) return false;
    G.g[y][x] = ch; return true;
  }
  function plantNear(G, rng, x, y, ch, r) {
    if (plant(G, x, y, ch)) return [x, y];
    const c = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx || dy) c.push([x + dx, y + dy]);
    for (const [xx, yy] of rng.shuffle(c)) if (plant(G, xx, yy, ch)) return [xx, yy];
    return null;
  }

  function bfsG(G, sx, sy, pass) {
    const { W, H, g } = G; pass = pass || (c => !genBlk(c));
    const dist = new Int16Array(W * H).fill(-1);
    const q = new Int32Array(W * H); let qh = 0, qt = 0;
    dist[sy * W + sx] = 0; q[qt++] = sy * W + sx;
    while (qh < qt) {
      const cur = q[qh++], x = cur % W, y = (cur / W) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (dist[ni] >= 0 || !pass(g[ny][nx])) continue;
        dist[ni] = dist[cur] + 1; q[qt++] = ni;
      }
    }
    return dist;
  }

  // billigaste väg (4-grannar) från någon av starts till en ruta där isGoal(i); cost(i) = Infinity spärrar
  function dijkstra(G, starts, isGoal, cost) {
    const { W } = G, N = W * G.H;
    const dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), heap = Heap();
    for (const s of starts) { dist[s] = 0; heap.push(0, s); }
    while (heap.size) {
      const cur = heap.pop();
      if (heap.key > dist[cur]) continue;
      if (isGoal(cur)) { const p = []; for (let s = cur; s !== -1; s = prev[s]) p.push(s); return p.reverse(); }
      const x = cur % W, y = (cur / W) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (!G.inb(nx, ny)) continue;
        const ni = ny * W + nx, c = cost(ni);
        if (!(c < Infinity)) continue;
        const nd = dist[cur] + c;
        if (nd < dist[ni]) { dist[ni] = nd; prev[ni] = cur; heap.push(nd, ni); }
      }
    }
    return null;
  }

  // flood fill: små isolerade fickor fylls med o.fillCh, större kopplas till huvudregionen (största eller den vid o.mainAt)
  // med tunnlar o.width rutor breda. Fickor som innehåller annat än golv (dörrar, föremål) fylls aldrig.
  function connectRegions(G, rng, o) {
    o = o || {};
    const { W, H, g } = G, N = W * H;
    const pass = o.pass || (c => !genBlk(c));
    const lab = new Int32Array(N).fill(-1), sizes = [], reps = [], pure = [], st = [];
    for (let i = 0; i < N; i++) {
      if (lab[i] >= 0 || !pass(g[(i / W) | 0][i % W])) continue;
      const k = sizes.length; let n = 0, dots = true;
      lab[i] = k; st.push(i);
      while (st.length) {
        const cur = st.pop(), x = cur % W, y = (cur / W) | 0; n++;
        if (g[y][x] !== '.') dots = false;
        for (let d = 0; d < 4; d++) {
          const nx = x + DX[d], ny = y + DY[d];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          if (lab[ni] >= 0 || !pass(g[ny][nx])) continue;
          lab[ni] = k; st.push(ni);
        }
      }
      sizes.push(n); reps.push(i); pure.push(dots);
    }
    if (!sizes.length) return false;
    let main = 0;
    if (o.mainAt) main = lab[o.mainAt[1] * W + o.mainAt[0]]; else for (let k = 1; k < sizes.length; k++) if (sizes[k] > sizes[main]) main = k;
    if (main < 0) return false;
    const tiny = k => k !== main && pure[k] && sizes[k] < (o.minSize || 0);
    for (let i = 0; i < N; i++) if (lab[i] >= 0 && tiny(lab[i])) { g[(i / W) | 0][i % W] = o.fillCh; lab[i] = -1; }
    const order = sizes.map((s, k) => k).filter(k => k !== main && !tiny(k)).sort((a, b) => sizes[b] - sizes[a]);
    if (!order.length) return true;
    const conn = new Uint8Array(N);
    const flood = () => {
      conn.fill(0); conn[reps[main]] = 1; st.push(reps[main]);
      while (st.length) {
        const cur = st.pop(), x = cur % W, y = (cur / W) | 0;
        for (let d = 0; d < 4; d++) {
          const nx = x + DX[d], ny = y + DY[d], ni = ny * W + nx;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || conn[ni] || !pass(g[ny][nx])) continue;
          conn[ni] = 1; st.push(ni);
        }
      }
    };
    flood();
    const noise = new Float32Array(N); for (let i = 0; i < N; i++) noise[i] = rng.next();
    const w = o.width || 2;
    for (const k of order) {
      if (conn[reps[k]]) continue; // redan ihopkopplad via en tidigare tunnel
      const starts = []; for (let i = 0; i < N; i++) if (lab[i] === k) starts.push(i);
      const path = dijkstra(G, starts, i => conn[i] === 1, i => G.solid[i] ? Infinity : pass(g[(i / W) | 0][i % W]) ? 0.3 : 1 + noise[i]);
      if (!path) return false;
      for (const i of path) {
        const x = i % W, y = (i / W) | 0;
        for (let dy = 0; dy < w; dy++) for (let dx = 0; dx < w; dx++) {
          const xx = x + dx, yy = y + dy;
          if (!G.inb(xx, yy) || G.solid[yy * W + xx] || pass(g[yy][xx])) continue;
          g[yy][xx] = '.'; if (o.onCarve) o.onCarve(xx, yy);
        }
      }
      flood();
    }
    return true;
  }

  // avstånd (Chebyshev) till närmaste hinder för varje ruta
  function obstDist(G) {
    const { W, H, g } = G, N = W * H;
    const d = new Int16Array(N).fill(-1), q = new Int32Array(N); let qh = 0, qt = 0;
    for (let i = 0; i < N; i++) if (genBlk(g[(i / W) | 0][i % W])) { d[i] = 0; q[qt++] = i; }
    while (qh < qt) {
      const cur = q[qh++], x = cur % W, y = (cur / W) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = x + RX[k], ny = y + RY[k];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (d[ni] < 0) { d[ni] = d[cur] + 1; q[qt++] = ni; }
      }
    }
    return d;
  }
  // bryter upp för stora öppna ytor: så länge någon ruta har längre än maxR till närmaste hinder stämplas skydd där
  function breakOpen(G, rng, maxR, stamp) {
    const { W } = G, tried = new Uint8Array(W * G.H);
    for (let it = 0; it < 80; it++) {
      const d = obstDist(G);
      let best = 0, list = [];
      for (let i = 0; i < d.length; i++) {
        if (tried[i] || d[i] <= maxR) continue;
        if (d[i] > best) { best = d[i]; list = [i]; } else if (d[i] === best) list.push(i);
      }
      if (!list.length) return;
      const i = rng.pick(list); tried[i] = 1;
      stamp(i % W, (i / W) | 0);
    }
  }

  // värdebrus (bilinjär interpolation av ett slumpgitter) i [0,1], två oktaver, normerat till hela intervallet
  function fbm(rng, W, H, cell) {
    const one = c => {
      const gw = Math.ceil(W / c) + 2, gh = Math.ceil(H / c) + 2, lat = new Float32Array(gw * gh);
      for (let i = 0; i < lat.length; i++) lat[i] = rng.next();
      const ox = rng.next() * c, oy = rng.next() * c, out = new Float32Array(W * H);
      const sm = t => t * t * (3 - 2 * t);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const fx = (x + ox) / c, fy = (y + oy) / c, ix = Math.floor(fx), iy = Math.floor(fy), tx = sm(fx - ix), ty = sm(fy - iy);
        const a = lat[iy * gw + ix], b = lat[iy * gw + ix + 1], cc = lat[(iy + 1) * gw + ix], d = lat[(iy + 1) * gw + ix + 1];
        out[y * W + x] = a + (b - a) * tx + (cc - a) * ty + (a - b - cc + d) * tx * ty;
      }
      return out;
    };
    const A = one(cell), B = one(Math.max(2, cell / 2)), out = new Float32Array(W * H);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < out.length; i++) { out[i] = 0.68 * A[i] + 0.32 * B[i]; lo = Math.min(lo, out[i]); hi = Math.max(hi, out[i]); }
    for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / Math.max(1e-6, hi - lo);
    return out;
  }

  // dörr: 3x3 runt den får inga hinder, passagerutorna på båda sidor hålls helt fria
  function markDoor(G, x, y, ox, oy, ix, iy) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) G.lockMin(x + dx, y + dy, 1);
    G.lockMin(ox, oy, 2); G.lockMin(ix, iy, 2);
    G.solid[y * G.W + x] = 1;
  }
  // byggnad med yttermått r: väggar wallCh, inre golv floorIdx under tak, nDoors dörrar mitt på olika sidor
  function stampBuilding(G, rng, r, wallCh, floorIdx, nDoors) {
    const { W, g } = G;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      const i = y * W + x, edge = x === r.x || y === r.y || x === r.x + r.w - 1 || y === r.y + r.h - 1;
      g[y][x] = edge ? wallCh : '.'; G.solid[i] = edge ? 1 : 0; G.sky[i] = 0;
      if (!edge) G.fm[i] = floorIdx;
    }
    const doors = [];
    for (const side of rng.shuffle([0, 1, 2, 3])) {
      if (doors.length >= nDoors) break;
      const len = side === 0 || side === 2 ? r.h - 2 : r.w - 2, mid = (len - 1) / 2;
      const offs = Array.from({ length: len }, (_, k) => [k, Math.abs(k - mid) + rng.next() * 1.5]).sort((a, b) => a[1] - b[1]);
      for (const [k] of offs) {
        let dx, dy;
        if (side === 0) { dx = r.x + r.w - 1; dy = r.y + 1 + k; } else if (side === 2) { dx = r.x; dy = r.y + 1 + k; }
        else if (side === 1) { dx = r.x + 1 + k; dy = r.y + r.h - 1; } else { dx = r.x + 1 + k; dy = r.y; }
        const ox = dx + DX[side], oy = dy + DY[side];
        if (!G.inb(ox, oy) || g[oy][ox] !== '.' || G.solid[oy * W + ox]) continue;
        g[dy][dx] = 'D'; markDoor(G, dx, dy, ox, oy, dx - DX[side], dy - DY[side]);
        doors.push({ x: dx, y: dy, out: [ox, oy] });
        break;
      }
    }
    if (!doors.length) return null;
    return { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2, cx: r.x + (r.w >> 1), cy: r.y + (r.h >> 1), doors };
  }

  // hemlig ficka (3x3) bakom en hemlig vägg i massivt berg/skog av tecknet wc
  function addSecretG(G, rng, wc) {
    const { W, H, g } = G, cands = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (g[y][x] !== '.' || G.lock[y * W + x]) continue;
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
          if (ok) cands.push({ ix, iy, ox, oy, x, y });
        }
      }
    }
    if (!cands.length) return null;
    const c = rng.pick(cands), skyV = G.sky[c.y * W + c.x];
    for (let yy = c.iy; yy < c.iy + 3; yy++) for (let xx = c.ix; xx < c.ix + 3; xx++) { g[yy][xx] = '.'; G.fm[yy * W + xx] = 0; G.sky[yy * W + xx] = skyV; G.lockMin(xx, yy, 1); }
    g[c.oy][c.ox] = '*'; G.sky[c.oy * W + c.ox] = skyV;
    markDoor(G, c.ox, c.oy, c.x, c.y, c.x, c.y);
    return { x: c.ix, y: c.iy, w: 3, h: 3, type: 'secret', cx: c.ix + 1, cy: c.iy + 1 };
  }

  // ---------- Innehåll för biomerna: start, utgång, områden, roller, föremål, fiender ----------
  // cfg: { P, X: [x,y] (annars BFS-längst bort), seeds: [{x, y, tag, box}] (utsedda områden), spacing (avstånd mellan
  //   övriga områdesfrön), treasureTags, extraChest, eliteTags, barrels: {p, min, tags}, secretWall, secretChance }
  function populate(G, rng, depth, opts, cfg) {
    const { W, H, g, lock } = G;
    const pass = c => !genBlk(c);
    const freeCells = () => { const out = []; for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (g[y][x] === '.' && lock[y * W + x] < 2) out.push([x, y]); return out; };
    const farthest = (d, frac) => {
      const fr = freeCells().filter(([x, y]) => d[y * W + x] >= 0);
      let mx = 0; for (const [x, y] of fr) mx = Math.max(mx, d[y * W + x]);
      return rng.pick(fr.filter(([x, y]) => d[y * W + x] >= mx * frac));
    };
    // ----- start och utgång så långt ifrån varandra som möjligt -----
    let P = cfg.P;
    if (!P) { const fr = freeCells(); if (!fr.length) return null; const A = rng.pick(fr); P = farthest(bfsG(G, A[0], A[1]), 0.9); }
    if (!P || g[P[1]][P[0]] !== '.') return null;
    g[P[1]][P[0]] = 'P';
    const dS = bfsG(G, P[0], P[1]);
    const X = cfg.X || farthest(dS, 0.92);
    if (!X || g[X[1]][X[0]] !== '.' || dS[X[1] * W + X[0]] < 0) return null;
    g[X[1]][X[0]] = 'x';
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { G.lockMin(P[0] + dx, P[1] + dy, 1); G.lockMin(X[0] + dx, X[1] + dy, 1); }

    // ----- områden: utsedda (byggnader, gläntor) + Poisson-utspridda frön, varje ruta till närmaste frö -----
    const aid = new Int16Array(W * H).fill(-1), areas = [], q = [];
    const open = i => dS[i] >= 0 && g[(i / W) | 0][i % W] !== '*';
    const claim = (a, x, y) => { const i = y * W + x; aid[i] = a.id; a.cells.push([x, y]); q.push(i); };
    const newArea = (x, y, tag) => { const a = { id: areas.length, cx: x, cy: y, tag, type: 'normal', cells: [] }; areas.push(a); return a; };
    for (const s of cfg.seeds || []) {
      const a = newArea(s.x, s.y, s.tag);
      if (s.box) { for (let y = s.box.y; y < s.box.y + s.box.h; y++) for (let x = s.box.x; x < s.box.x + s.box.w; x++) if (aid[y * W + x] < 0 && open(y * W + x)) claim(a, x, y); }
      else if (aid[s.y * W + s.x] < 0 && open(s.y * W + s.x)) claim(a, s.x, s.y);
      if (!a.cells.length) areas.pop();
    }
    const sp = cfg.spacing || 7;
    for (const [x, y] of rng.shuffle(freeCells())) if (aid[y * W + x] < 0 && open(y * W + x) && areas.every(a => cheb(a.cx, a.cy, x, y) >= sp)) claim(newArea(x, y, 'open'), x, y);
    for (let qh = 0; qh < q.length; qh++) {
      const cur = q[qh], x = cur % W, y = (cur / W) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d], ni = ny * W + nx;
        if (aid[ni] >= 0 || !open(ni)) continue;
        aid[ni] = aid[cur]; areas[aid[cur]].cells.push([nx, ny]); q.push(ni);
      }
    }
    for (const a of areas) { const c = dS[a.cy * W + a.cx] >= 0 ? [a.cx, a.cy] : a.cells[0]; a.d = dS[c[1] * W + c[0]]; }
    const start = areas[aid[P[1] * W + P[0]]], exitA = areas[aid[X[1] * W + X[0]]];
    if (!start || !exitA || start === exitA) return null;
    start.type = 'start'; exitA.type = 'exit';

    const secret = cfg.secretWall && rng.chance(cfg.secretChance || 0) ? addSecretG(G, rng, cfg.secretWall) : null;

    // ----- utplacering -----
    const size = a => a.cells.length;
    const normal = () => areas.filter(a => a.type === 'normal');
    const wallAdj = (x, y) => isWall(g[y - 1][x]) || isWall(g[y + 1][x]) || isWall(g[y][x - 1]) || isWall(g[y][x + 1]);
    const order = (a, c, how) => how === 'center' ? c.map(p => [p, cheb(p[0], p[1], a.cx, a.cy) + rng.next()]).sort((u, v) => u[1] - v[1]).map(u => u[0]) : rng.shuffle(c);
    function put(a, ch, pred, how) {
      const c = order(a, a.cells.filter(([x, y]) => g[y][x] === '.' && lock[y * W + x] < 2 && (!pred || pred(x, y))), how);
      if (!c.length) return null;
      g[c[0][1]][c[0][0]] = ch; return c[0];
    }
    function putBlocker(a, ch, pred, how) {
      const c = order(a, a.cells.filter(([x, y]) => g[y][x] === '.' && !lock[y * W + x] && (!pred || pred(x, y))), how);
      for (const [x, y] of c) if (localOK(G, x, y)) { g[y][x] = ch; return [x, y]; }
      return null;
    }

    // köpman: mot en vägg med fritt golv framför sig, i den närmare halvan av banan
    if (opts.shop) {
      const front = (x, y) => { for (let k = 0; k < 4; k++) { const fx = x - DX[k], fy = y - DY[k]; if (isWall(g[y + DY[k]][x + DX[k]]) && g[fy][fx] === '.' && lock[fy * W + fx] < 2) return [fx, fy]; } return null; };
      const c = normal().filter(a => size(a) >= 12).sort((a, b) => a.d - b.d);
      const pool = rng.shuffle(c.slice(0, Math.max(1, Math.ceil(c.length / 2))));
      let shop = null;
      for (const a of pool.concat(c)) {
        const m = putBlocker(a, 'M', (x, y) => front(x, y) && cheb(x, y, P[0], P[1]) >= 3, 'center');
        if (m) { const f = front(m[0], m[1]); G.lockMin(f[0], f[1], 2); shop = a; break; }
      }
      if (!shop) return null;
      shop.type = 'shop';
    }
    // kortkista: helst i en utsedd byggnad/glänta (taggarna i prioritetsordning), annars i ett avlägset område
    {
      const tags = cfg.treasureTags || [];
      let c = [];
      for (const t of tags) { c = normal().filter(a => a.tag === t); if (c.length) break; }
      if (!c.length) c = normal().filter(a => size(a) >= 8);
      const t = rng.weighted(c, a => 1 + a.d);
      if (!t || !put(t, 'C', null, 'center')) return null;
      t.type = 'treasure';
      if (tags.length) for (const a of normal().filter(a => a.tag === tags[0])) if (rng.chance(cfg.extraChest || 0) && put(a, 'C', null, 'center')) a.type = 'treasure';
    }
    // elitområden: avlägsna, olika områden, minst 7 rutor från P
    const farFromP = (x, y) => Math.hypot(x - P[0], y - P[1]) >= 7;
    {
      const nElite = 1 + Math.floor(depth / 2), et = cfg.eliteTags || [];
      for (let i = 0; i < nElite; i++) {
        const c = normal().filter(a => a.cells.some(([x, y]) => g[y][x] === '.' && farFromP(x, y))).sort((a, b) => b.d - a.d);
        const a = rng.weighted(c.slice(0, Math.max(1, Math.ceil(c.length * 0.6))), a => (et.includes(a.tag) ? 3 : 1) * Math.sqrt(size(a)));
        if (!a || !put(a, 'E', farFromP, 'center')) return null;
        a.type = 'elite';
      }
    }
    // vapen: ett område mitt i banan
    if (opts.weapon && WEAPON_CHARS.includes(opts.weapon)) {
      const ds = areas.map(a => a.d).sort((a, b) => a - b), med = ds[ds.length >> 1];
      let pool = normal(); if (!pool.length) pool = areas.filter(a => a.type !== 'start' && a.type !== 'exit' && a.type !== 'shop');
      pool.sort((a, b) => Math.abs(a.d - med) - Math.abs(b.d - med));
      let done = false;
      for (const a of pool) if (put(a, opts.weapon, null, 'random')) { done = true; break; }
      if (!done) return null;
    }
    // eldfat som ljuskällor, intill väggar
    {
      const bc = cfg.barrels || { p: 0.5, min: 2 }, placed = [];
      const ok = (x, y) => wallAdj(x, y) && cheb(x, y, P[0], P[1]) >= 2 && cheb(x, y, X[0], X[1]) >= 2 && placed.every(p => cheb(p[0], p[1], x, y) >= 4);
      for (const a of rng.shuffle(areas.slice())) {
        const want = (rng.chance(bc.p) ? 1 : 0) + (bc.tags && bc.tags.includes(a.tag) ? 1 : 0);
        for (let k = 0; k < want; k++) { const c = putBlocker(a, 'f', ok, 'random'); if (c) placed.push(c); }
      }
      for (const a of rng.shuffle(areas.slice())) { if (placed.length >= bc.min) break; const c = putBlocker(a, 'f', ok, 'random'); if (c) placed.push(c); }
      if (!placed.length) return null;
    }
    // hälsa, ammo, rustning, guld, krukor
    const lootAreas = areas.filter(a => a.type !== 'shop');
    const scatter = (count, ch, list, pred) => {
      for (let i = 0; i < count; i++) for (let t = 0; t < 8; t++) { const a = rng.weighted(list, size); if (a && put(a, ch, pred, 'random')) break; }
    };
    if (rng.chance(0.4)) put(start, rng.chance(0.5) ? 'h' : 'a', (x, y) => cheb(x, y, P[0], P[1]) >= 2, 'random');
    scatter(rng.int(3, 5), 'h', lootAreas.filter(a => a.type !== 'start'));
    scatter(rng.int(3, 5), 'a', lootAreas.filter(a => a.type !== 'start'));
    if (rng.chance(Math.min(0.75, 0.3 + 0.08 * depth))) scatter(1, 'A', lootAreas.filter(a => a.type === 'normal' || a.type === 'treasure' || a.type === 'exit' || a.type === 'elite'));
    const gold = rng.int(3, 8), secretGold = secret ? Math.min(2, gold - 2) : 0;
    scatter(gold - secretGold, '$', lootAreas);
    const pots = rng.int(4, 8);
    for (let i = 0; i < pots; i++) for (let t = 0; t < 8; t++) { const a = rng.weighted(lootAreas, size); if (a && putBlocker(a, 'o', (x, y) => wallAdj(x, y) || rng.chance(0.25), 'random')) break; }
    if (secret) { const cs = []; for (let y = secret.y; y < secret.y + 3; y++) for (let x = secret.x; x < secret.x + 3; x++) cs.push([x, y]); fillSecret(rng, g, secret, cs, secretGold); }
    // fiender
    spreadEnemies(rng, depth, areas.filter(a => a.type !== 'start' && a.type !== 'shop'), size, put, farFromP, false);

    // pseudorum: områdenas omslutande rektanglar (startrummet = rutorna närmast P)
    const rooms = areas.map(a => {
      if (a.type === 'start') { const x0 = Math.max(1, P[0] - 3), y0 = Math.max(1, P[1] - 3); return { x: x0, y: y0, w: Math.min(W - 2, P[0] + 3) - x0 + 1, h: Math.min(H - 2, P[1] + 3) - y0 + 1, type: 'start', tag: a.tag }; }
      let x0 = W, y0 = H, x1 = 0, y1 = 0;
      for (const [x, y] of a.cells) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, type: a.type, tag: a.tag };
    });
    if (secret) rooms.push({ x: secret.x, y: secret.y, w: 3, h: 3, type: 'secret', tag: 'secret' });
    return { G, rooms };
  }

  // ---------- Grottor: cellautomat ----------
  function buildCaves(rng, depth, opts, look) {
    const [W, H] = mapSize(rng, depth), wc = look.wall, N = W * H;
    const G = Grid(W, H, wc), { g } = G;
    // 45 % berg, sedan utjämning: berg om >= 5 av 3x3 är berg (de första varven även där 5x5 nästan är tomt -> pelare)
    let a = new Uint8Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) a[y * W + x] = G.inb(x, y) && rng.next() >= 0.45 ? 0 : 1;
    const R = (b, x, y, r) => { let n = 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, yy = y + dy; n += (xx < 0 || yy < 0 || xx >= W || yy >= H) ? 1 : b[yy * W + xx]; } return n; };
    for (let it = 0; it < 5; it++) {
      const b = new Uint8Array(N).fill(1);
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) b[y * W + x] = R(a, x, y, 1) >= 5 || (it < 3 && R(a, x, y, 2) <= 2) ? 1 : 0;
      a = b;
    }
    // fyllnadsgrad i rimligt spann, annars ny cellautomat
    let nOpen = 0; for (let i = 0; i < N; i++) if (!a[i]) nOpen++;
    if (nOpen < (W - 2) * (H - 2) * 0.3) return null;
    // fyllerigång: några slingrande gångar (1-2 breda) som skapar fler förbindelser
    const opens = []; for (let i = 0; i < N; i++) if (!a[i]) opens.push(i);
    for (let k = rng.int(1, 3); k > 0; k--) {
      const s = rng.pick(opens); let x = s % W, y = (s / W) | 0, d = rng.int(0, 3);
      for (let st = rng.int(20, 45); st > 0; st--) {
        if (rng.chance(0.25)) d = (d + (rng.chance(0.5) ? 1 : 3)) & 3;
        const nx = x + DX[d], ny = y + DY[d];
        if (nx < 2 || ny < 2 || nx > W - 3 || ny > H - 3) { d = (d + 2) & 3; continue; }
        x = nx; y = ny; a[y * W + x] = 0;
        if (rng.chance(0.55)) { const p = (d + 1) & 3; a[(y + DY[p]) * W + x + DX[p]] = 0; }
      }
    }
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) g[y][x] = a[y * W + x] ? wc : '.';
    // största grottan behålls, andra stora kopplas dit med två rutor breda tunnlar, småfickor fylls igen
    if (!connectRegions(G, rng, { minSize: 16, fillCh: wc, width: 2 })) return null;
    nOpen = 0; for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (g[y][x] === '.') nOpen++;
    const share = nOpen / ((W - 2) * (H - 2));
    if (share < 0.3 || share > 0.66) return null;
    // droppstenar i för stora salar
    breakOpen(G, rng, 5, (x, y) => { if (plantNear(G, rng, x, y, wc, 1) && rng.chance(0.5)) plantNear(G, rng, x + rng.int(-1, 1), y + rng.int(-1, 1), wc, 1); });
    // lerfläckar
    const M = fbm(rng, W, H, 5);
    for (let i = 0; i < N; i++) if (M[i] < 0.3) G.fm[i] = 1;
    return populate(G, rng, depth, opts, { spacing: 7, barrels: { p: 0.6, min: 3 }, secretWall: wc, secretChance: 0.55 });
  }

  // ---------- Kyrkogård: öppet fält, kapell, kryptor, gravkvarter ----------
  // gravkvarter: rektangel r, ev. med mur (7) och 2-3 gluggar; gravstenar i rader inuti
  function stampPlot(G, rng, r, walled) {
    const { W, g } = G, gates = [];
    let ix = r.x, iy = r.y, iw = r.w, ih = r.h;
    if (walled) {
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (x === r.x || y === r.y || x === r.x + r.w - 1 || y === r.y + r.h - 1) g[y][x] = '7';
      ix++; iy++; iw -= 2; ih -= 2;
      for (const s of rng.shuffle([0, 1, 2, 3]).slice(0, rng.int(2, 3))) {
        const len = s === 0 || s === 2 ? ih : iw, k = rng.int(0, len - 1), two = len >= 4 && rng.chance(0.4);
        for (let j = 0; j < (two ? 2 : 1); j++) {
          const kk = Math.min(len - 1, k + j);
          let x, y;
          if (s === 0) { x = r.x + r.w - 1; y = iy + kk; } else if (s === 2) { x = r.x; y = iy + kk; }
          else if (s === 1) { x = ix + kk; y = r.y + r.h - 1; } else { x = ix + kk; y = r.y; }
          g[y][x] = '.';
          for (const t of [-1, 0, 1]) G.lockMin(x + DX[s] * t, y + DY[s] * t, 1);
          if (!j) gates.push([x + DX[s], y + DY[s]]);
        }
      }
    } else {
      const s = rng.int(0, 3);
      gates.push(s === 0 ? [r.x + r.w, r.y + (r.h >> 1)] : s === 2 ? [r.x - 1, r.y + (r.h >> 1)] : s === 1 ? [r.x + (r.w >> 1), r.y + r.h] : [r.x + (r.w >> 1), r.y - 1]);
    }
    const dirt = rng.chance(0.5);
    for (let y = iy; y < iy + ih; y++) for (let x = ix; x < ix + iw; x++) G.fm[y * W + x] = dirt ? 3 : 0;
    // gravstenar i rader med en gång emellan, glest och lite ojämnt
    const horiz = iw >= ih ? rng.chance(0.75) : rng.chance(0.25);
    const A = horiz ? ih : iw, B = horiz ? iw : ih;
    for (let a = rng.int(0, 1); a < A; a += 2) {
      for (let b = rng.int(0, 1); b < B; b += rng.chance(0.2) ? 3 : 2) {
        if (rng.chance(0.1)) continue;
        plant(G, horiz ? ix + b : ix + a, horiz ? iy + a : iy + b, 'n');
      }
    }
    return { x: ix, y: iy, w: iw, h: ih, gates, walled };
  }

  function buildGraveyard(rng, depth, opts, look) {
    const [W, H] = mapSize(rng, depth), N = W * H;
    const G = Grid(W, H, '.', look.wall), { g, fm, lock } = G;
    G.sky.fill(1);
    const rects = [];
    const gapOK = (a, b, gap) => a.x + a.w + gap <= b.x || b.x + b.w + gap <= a.x || a.y + a.h + gap <= b.y || b.y + b.h + gap <= a.y;
    const place = (w, h, gap, z) => { // z = [x0, y0, x1, y1) zon för rektangeln
      z = z || [2, 2, W - 2, H - 2];
      if (z[2] - w < z[0] || z[3] - h < z[1]) return null;
      for (let t = 0; t < 80; t++) {
        const r = { x: rng.int(z[0], z[2] - w), y: rng.int(z[1], z[3] - h), w, h, gap };
        if (rects.every(o => gapOK(o, r, Math.max(gap, o.gap)))) { rects.push(r); return r; }
      }
      return null;
    };
    // kapellet nära mitten
    let cw = rng.int(7, 9), ch = rng.int(8, 10);
    if (rng.chance(0.5)) [cw, ch] = [ch, cw];
    const cr = place(cw, ch, 3, [Math.floor(W * 0.2), Math.floor(H * 0.2), Math.ceil(W * 0.8), Math.ceil(H * 0.8)]);
    if (!cr) return null;
    const chapel = stampBuilding(G, rng, cr, '5', 2, rng.int(1, 2));
    if (!chapel) return null;
    if (chapel.w >= 6 && chapel.h >= 6) { // pelare i långhuset, speglade
      const hz = chapel.w >= chapel.h, L = hz ? chapel.w : chapel.h;
      for (let k = 2; k < L - 2; k += 3) for (const s of [1, (hz ? chapel.h : chapel.w) - 2]) plant(G, chapel.x + (hz ? k : s), chapel.y + (hz ? s : k), '5');
    }
    // kryptor / gravkor
    const crypts = [];
    for (let k = depth >= 3 ? 2 : rng.int(1, 2); k > 0; k--) {
      const r = place(rng.int(5, 6), rng.int(5, 6), 2);
      const c = r && stampBuilding(G, rng, r, rng.chance(0.5) ? '4' : '1', 2, 1);
      if (c) crypts.push(c);
    }
    if (!crypts.length) return null;
    // gravkvarter
    const plots = [];
    for (let k = rng.int(5, 7) + Math.floor((W * H - 900) / 400); k > 0; k--) {
      let r = null;
      for (let t = 0; t < 3 && !r; t++) r = place(rng.int(6, 11 - 2 * t), rng.int(5, 8 - t), 2); // krymper om det är trångt
      if (r) plots.push(Object.assign(stampPlot(G, rng, r, rng.chance(0.55)), { outer: r }));
    }
    const inPlot = new Uint8Array(N);
    for (const p of plots) for (let y = p.outer.y; y < p.outer.y + p.outer.h; y++) for (let x = p.outer.x; x < p.outer.x + p.outer.w; x++) inPlot[y * W + x] = 1;
    // ingång vid en av murarna; grusgångar därifrån till kapellet och vidare till kryptor och kvarter
    const side = rng.int(0, 3), along = (L) => rng.int(Math.floor(L / 3), Math.ceil(L * 2 / 3));
    const P = side === 0 ? [W - 2, along(H)] : side === 2 ? [1, along(H)] : side === 1 ? [along(W), H - 2] : [along(W), 1];
    if (g[P[1]][P[0]] !== '.') return null;
    const nz = new Float32Array(N); for (let i = 0; i < N; i++) nz[i] = rng.next();
    const onPath = new Uint8Array(N);
    const pcost = i => { const c = g[(i / W) | 0][i % W]; if (genBlk(c) || isDoorCh(c) || !G.sky[i]) return Infinity; return onPath[i] ? 0.3 : 1 + nz[i] * 0.8 + (inPlot[i] ? 4 : 0); };
    const gravel = (path, wide) => {
      for (const i of path) {
        const x = i % W, y = (i / W) | 0;
        for (const [xx, yy] of wide ? [[x, y], [x + 1, y], [x, y + 1]] : [[x, y]]) {
          const j = yy * W + xx;
          if (!G.inb(xx, yy) || g[yy][xx] !== '.' || !G.sky[j] || (inPlot[j] && wide)) continue;
          fm[j] = 1; onPath[j] = 1; G.lockMin(xx, yy, 1);
        }
      }
    };
    onPath[P[1] * W + P[0]] = 1;
    const pois = chapel.doors.map(d => d.out);
    for (const c of crypts) pois.push(c.doors[0].out);
    for (const p of plots) for (const gt of p.gates) if (G.inb(gt[0], gt[1]) && g[gt[1]][gt[0]] === '.') pois.push(gt);
    for (let k = 0; k < pois.length; k++) {
      const s = pois[k][1] * W + pois[k][0];
      if (onPath[s]) continue;
      const path = dijkstra(G, [s], i => onPath[i] === 1, pcost);
      if (path) gravel(path, k === 0);
    }
    // döda träd i dungar och gamla gravar på ängen
    const D = fbm(rng, W, H, 6);
    const nearCh = (x, y, c) => { for (let k = 0; k < 8; k++) if (G.at(x + RX[k], y + RY[k]) === c) return true; return false; };
    const order = []; for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) order.push([x, y]);
    for (const [x, y] of rng.shuffle(order)) {
      const i = y * W + x;
      if (g[y][x] !== '.' || lock[i] || inPlot[i] || !G.sky[i]) continue;
      if (D[i] > 0.62 ? rng.chance(0.22) : rng.chance(0.025)) { if (!nearCh(x, y, 't')) plant(G, x, y, 't'); }
      else if (D[i] < 0.45 && rng.chance(0.07) && !nearCh(x, y, 'n')) plant(G, x, y, 'n');
      else if (D[i] < 0.3 && rng.chance(0.02)) { // en kort rad gamla gravar
        const h = rng.chance(0.5);
        for (let k = rng.int(2, 4) - 1; k >= 0; k--) { const xx = x + (h ? 2 * k : 0), yy = y + (h ? 0 : 2 * k); if (G.inb(xx, yy) && !inPlot[yy * W + xx]) plant(G, xx, yy, 'n'); }
      }
    }
    // inga gläntor bredare än ~11 rutor: träd eller en liten gravrad där det är som öppnast
    breakOpen(G, rng, 6, (x, y) => {
      if (rng.chance(0.55)) { plantNear(G, rng, x, y, 't', 1); return; }
      const h = rng.chance(0.5);
      for (const k of [-2, 0, 2]) plant(G, x + (h ? k : 0), y + (h ? 0 : k), 'n');
    });
    if (!connectRegions(G, rng, { mainAt: P, width: 1 })) return null; // säkerhetsnät, ska inte behöva gräva
    const seeds = [{ x: chapel.cx, y: chapel.cy, tag: 'chapel', box: chapel }];
    for (const c of crypts) seeds.push({ x: c.cx, y: c.cy, tag: 'crypt', box: c });
    for (const p of plots) seeds.push({ x: p.x + (p.w >> 1), y: p.y + (p.h >> 1), tag: 'plot', box: p });
    return populate(G, rng, depth, opts, { P, seeds, spacing: 7, treasureTags: ['crypt'], extraChest: 0.5, eliteTags: ['chapel', 'plot'], barrels: { p: 0.25, min: 2, tags: ['chapel', 'crypt'] } });
  }

  // ---------- Skog: brusmask, slingrande huvudstig, slinga och gläntor ----------
  function buildForest(rng, depth, opts, look) {
    const [W, H] = mapSize(rng, depth), N = W * H, wc = look.wall;
    const G = Grid(W, H, wc), { g, fm, lock } = G;
    G.sky.fill(1);
    const D = fbm(rng, W, H, rng.range(5, 7)), M = fbm(rng, W, H, 4);
    const nz = new Float32Array(N); for (let i = 0; i < N; i++) nz[i] = rng.next();
    // glesa partier är öppna, täta blir skogsbryn
    const T = rng.range(0.4, 0.48);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (D[y * W + x] < T) g[y][x] = '.';
    const pid = new Int16Array(N), clr = new Uint8Array(N); // pid: vilken stig rutan tillhör (1 huvud, 2 slinga, 3+ sidostigar)
    const cost = own => i => G.solid[i] ? Infinity : (g[(i / W) | 0][i % W] === '.' ? 1 : 2 + 3 * D[i]) + 0.6 * nz[i] + (own && own(i) ? 6 : 0);
    const carve = (path, w, id) => {
      for (const i of path) {
        const x = i % W, y = (i / W) | 0;
        for (let dy = 0; dy < w; dy++) for (let dx = 0; dx < w; dx++) {
          const xx = x + dx, yy = y + dy, j = yy * W + xx;
          if (!G.inb(xx, yy) || G.solid[j]) continue;
          g[yy][xx] = '.'; fm[j] = 1; G.lockMin(xx, yy, 1); if (!pid[j]) pid[j] = id;
        }
      }
    };
    const route = (pts, own) => {
      let out = [];
      for (let k = 0; k + 1 < pts.length; k++) {
        const b = pts[k + 1], p = dijkstra(G, [pts[k]], i => i === b, cost(own));
        if (!p) return null;
        out = out.concat(k ? p.slice(1) : p);
      }
      return out;
    };
    // start och mål vid motsatta kanter, brytpunkter växelvis åt sidorna så att stigen slingrar
    const horiz = rng.chance(W >= H ? 0.6 : 0.4), L = horiz ? W : H, S2 = horiz ? H : W;
    const at = (a, b) => horiz ? b * W + a : a * W + b; // (längs, tvärs) -> index
    const aS = rng.int(2, 3), aE = L - 1 - rng.int(2, 3), nW = L >= 36 ? 3 : 2, up = rng.chance(0.5);
    const pts = [at(aS, rng.int(3, S2 - 4))];
    for (let k = 1; k <= nW; k++) {
      const a = Math.round(aS + (aE - aS) * k / (nW + 1)) + rng.int(-2, 2);
      const b = ((k & 1) === 1) === up ? rng.int(3, Math.floor(S2 * 0.38)) : rng.int(Math.ceil(S2 * 0.62), S2 - 4);
      pts.push(at(a, b));
    }
    pts.push(at(aE, rng.int(3, S2 - 4)));
    if (rng.chance(0.5)) pts.reverse();
    const main = route(pts);
    if (!main) return null;
    carve(main, 2, 1);
    // slinga: en andra väg mellan två punkter på huvudstigen, på andra sidan om den
    {
      const A = main[Math.floor(main.length * rng.range(0.15, 0.3))], B = main[Math.floor(main.length * rng.range(0.65, 0.85))];
      const ab = i => horiz ? [i % W, (i / W) | 0] : [(i / W) | 0, i % W];
      const [a1, b1] = ab(A), [a2, b2] = ab(B), bm = (b1 + b2) / 2;
      const bw = Math.max(3, Math.min(S2 - 4, Math.round(bm + (bm < S2 / 2 ? 1 : -1) * rng.int(6, 9))));
      const near = new Uint8Array(N); // huvudstigen med två rutors marginal: slingan ska inte gå bredvid den
      for (const i of main) { const x = i % W, y = (i / W) | 0; for (let dy = -2; dy <= 3; dy++) for (let dx = -2; dx <= 3; dx++) if (G.inb(x + dx, y + dy)) near[(y + dy) * W + x + dx] = 1; }
      const alt = route([A, at(Math.round((a1 + a2) / 2), bw), B], i => near[i] === 1);
      if (!alt) return null;
      carve(alt, 2, 2);
    }
    // gläntor vid sidan av stigarna, med sidostigar (ibland två -> fler slingor)
    const pd = new Int16Array(N).fill(-1), qq = [];
    for (let i = 0; i < N; i++) if (pid[i]) { pd[i] = 0; qq.push(i); }
    for (let qh = 0; qh < qq.length; qh++) {
      const cur = qq[qh], x = cur % W, y = (cur / W) | 0;
      for (let d = 0; d < 4; d++) { const nx = x + DX[d], ny = y + DY[d], ni = ny * W + nx; if (G.inb(nx, ny) && pd[ni] < 0) { pd[ni] = pd[cur] + 1; qq.push(ni); } }
    }
    const S = [main[0] % W, (main[0] / W) | 0], E = [main[main.length - 1] % W, (main[main.length - 1] / W) | 0];
    const clearings = [];
    const nC = rng.int(3, 5) + (depth >= 3 ? 1 : 0);
    for (let t = 0; t < 300 && clearings.length < nC; t++) {
      const x = rng.int(4, W - 5), y = rng.int(4, H - 5), i = y * W + x;
      if (pd[i] < 4 || pd[i] > 10 || clearings.some(c => cheb(c.x, c.y, x, y) < 8) || cheb(x, y, S[0], S[1]) < 6 || cheb(x, y, E[0], E[1]) < 6) continue;
      clearings.push({ x, y, rx: rng.int(2, 4), ry: rng.int(2, 4) });
    }
    let hut = null;
    const hutC = rng.chance(0.55) ? clearings.find(c => c.x >= 5 && c.y >= 5 && c.x <= W - 6 && c.y <= H - 6) : null;
    if (hutC) { hutC.rx = Math.max(hutC.rx, 4); hutC.ry = Math.max(hutC.ry, 4); }
    for (let k = 0; k < clearings.length; k++) {
      const c = clearings[k], id = 3 + k;
      for (let dy = -c.ry - 1; dy <= c.ry + 1; dy++) for (let dx = -c.rx - 1; dx <= c.rx + 1; dx++) {
        const x = c.x + dx, y = c.y + dy, j = y * W + x;
        if (!G.inb(x, y) || G.solid[j]) continue;
        if ((dx / (c.rx + 0.5)) ** 2 + (dy / (c.ry + 0.5)) ** 2 <= 1 + (nz[j] - 0.5) * 0.5) { g[y][x] = '.'; clr[j] = 1; if (!pid[j]) fm[j] = 3; }
      }
      let from = c.y * W + c.x;
      if (c === hutC) { // en stuga mitt i gläntan, med fri ring runt om
        const r = { x: c.x - 2, y: c.y - 2, w: 5, h: 5 };
        for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) if (G.inb(x, y) && !G.solid[y * W + x]) { g[y][x] = '.'; clr[y * W + x] = 1; }
        hut = stampBuilding(G, rng, r, '9', 1, 1);
        if (!hut) return null;
        from = hut.doors[0].out[1] * W + hut.doors[0].out[0];
      }
      const b1 = dijkstra(G, [from], i => pid[i] > 0 && pid[i] !== id, cost());
      if (!b1) return null;
      carve(b1, rng.chance(0.5) ? 2 : 1, id);
      if (rng.chance(0.45)) {
        const e = b1[b1.length - 1], ex = e % W, ey = (e / W) | 0;
        const b2 = dijkstra(G, [c.y * W + c.x], i => pid[i] > 0 && pid[i] !== id && cheb(i % W, (i / W) | 0, ex, ey) >= 8, cost(i => pid[i] === id));
        if (b2) carve(b2, 1, id);
      }
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) G.lockMin(c.x + dx, c.y + dy, 1); // gläntans mitt hålls fri
    }
    // isolerade gläntor i bladverket: små fylls, stora får en tunnel
    if (!connectRegions(G, rng, { minSize: 12, fillCh: wc, width: 2, mainAt: S })) return null;
    // enskilda träd: tätare nära skogsbrynet, glest i gläntorna
    const cells = []; for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) cells.push([x, y]);
    for (const [x, y] of rng.shuffle(cells)) {
      const i = y * W + x;
      if (g[y][x] !== '.' || lock[i]) continue;
      let p = Math.max(0.05, Math.min(0.28, 0.05 + (D[i] - T + 0.3) * 0.6));
      if (clr[i]) p *= 0.4;
      if (rng.chance(p)) plant(G, x, y, 't');
    }
    breakOpen(G, rng, 6, (x, y) => { plantNear(G, rng, x, y, 't', 1); if (rng.chance(0.5)) plantNear(G, rng, x + rng.int(-1, 1), y + rng.int(-1, 1), 't', 1); });
    for (let i = 0; i < N; i++) if (fm[i] === 0 && M[i] < 0.22) fm[i] = 2; // lerpölar
    const seeds = clearings.filter(c => c !== hutC).map(c => ({ x: c.x, y: c.y, tag: 'clearing' }));
    if (hut) seeds.unshift({ x: hut.cx, y: hut.cy, tag: 'hut', box: hut });
    return populate(G, rng, depth, opts, { P: S, X: E, seeds, spacing: 8, treasureTags: ['hut', 'clearing'], eliteTags: ['clearing'],
      barrels: { p: 0.2, min: 2, tags: ['clearing', 'hut'] }, secretWall: wc, secretChance: 0.4 });
  }

  // ---------- Borggård: öppen gård omgiven av byggnadslängor med dörrar in mot gården ----------
  function buildCourtyard(rng, depth, opts, look) {
    const [W, H] = mapSize(rng, depth), N = W * H;
    const G = Grid(W, H, look.wall, '4'), { g, fm, lock } = G;
    // längornas inre djup per sida (N Ö S V); 0 = bara ringmur
    const th = [rng.int(4, 7), rng.int(4, 7), rng.int(4, 7), rng.int(4, 7)];
    if (rng.chance(0.4)) th[rng.int(0, 3)] = 0;
    const span = (a, b, L) => L - 2 - (th[a] ? th[a] + 1 : 0) - (th[b] ? th[b] + 1 : 0);
    for (let k = 0; k < 12 && span(1, 3, W) < 12; k++) { const s = th[1] >= th[3] ? 1 : 3; th[s] = th[s] > 4 ? th[s] - 1 : 0; }
    for (let k = 0; k < 12 && span(0, 2, H) < 12; k++) { const s = th[0] >= th[2] ? 0 : 2; th[s] = th[s] > 4 ? th[s] - 1 : 0; }
    const cx0 = 1 + (th[3] ? th[3] + 1 : 0), cx1 = W - 2 - (th[1] ? th[1] + 1 : 0);
    const cy0 = 1 + (th[0] ? th[0] + 1 : 0), cy1 = H - 2 - (th[2] ? th[2] + 1 : 0);
    const mat = [0, 1, 2, 3].map(() => rng.chance(0.25) ? '9' : look.wall);
    const zone = s => s === 0 ? [1, 1, W - 2, cy0 - 1] : s === 2 ? [1, cy1 + 1, W - 2, H - 2] : s === 3 ? [1, cy0, cx0 - 1, cy1] : [cx1 + 1, cy0, W - 2, cy1];
    for (let s = 0; s < 4; s++) if (th[s]) { const [x0, y0, x1, y1] = zone(s); for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { g[y][x] = mat[s]; G.solid[y * W + x] = 1; } }
    for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) { g[y][x] = '.'; G.sky[y * W + x] = 1; G.solid[y * W + x] = 0; }
    // längorna delas i rum
    const rooms = [], strips = [[], [], [], []];
    const split = (s, a0, a1, b0, b1) => {
      for (let pos = a0; pos <= a1;) {
        const rem = a1 - pos + 1, len = rem <= 9 ? rem : rng.int(4, Math.min(8, rem - 5));
        const r = s % 2 === 0 ? { x: pos, y: b0, w: len, h: b1 - b0 + 1 } : { x: b0, y: pos, w: b1 - b0 + 1, h: len };
        r.side = s; r.id = rooms.length; r.cx = r.x + (r.w >> 1); r.cy = r.y + (r.h >> 1);
        rooms.push(r); strips[s].push(r);
        const wood = mat[s] === '9' || rng.chance(0.3);
        for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { g[y][x] = '.'; G.solid[y * W + x] = 0; fm[y * W + x] = wood ? 3 : 2; }
        pos += len + 1;
      }
    };
    if (th[0]) split(0, 1, W - 2, 1, th[0]);
    if (th[2]) split(2, 1, W - 2, H - 1 - th[2], H - 2);
    if (th[3]) split(3, cy0, cy1, 1, th[3]);
    if (th[1]) split(1, cy0, cy1, W - 1 - th[1], W - 2);
    // möjliga dörrar: [x, y, insida x, y, utsida x, y] per förbindelse (b = null: gården)
    const links = [];
    for (const st of strips) for (let k = 0; k + 1 < st.length; k++) {
      const r = st[k], q = st[k + 1], cells = [];
      if (r.side % 2 === 0) { const sx = r.x + r.w; for (let y = r.y; y < r.y + r.h; y++) cells.push([sx, y, sx - 1, y, sx + 1, y]); }
      else { const sy = r.y + r.h; for (let x = r.x; x < r.x + r.w; x++) cells.push([x, sy, x, sy - 1, x, sy + 1]); }
      links.push({ a: r, b: q, cells });
    }
    for (const s of [0, 2]) for (const r of strips[s]) {
      const wy = s === 0 ? cy0 - 1 : cy1 + 1, iy = s === 0 ? wy - 1 : wy + 1, oy = s === 0 ? wy + 1 : wy - 1;
      const yard = [], left = [], right = [];
      for (let x = r.x; x < r.x + r.w; x++) {
        const c = [x, wy, x, iy, x, oy];
        if (x >= cx0 && x <= cx1) yard.push(c); else if (th[3] && x <= cx0 - 2) left.push(c); else if (th[1] && x >= cx1 + 2) right.push(c);
      }
      if (yard.length) links.push({ a: r, b: null, cells: yard });
      if (left.length) links.push({ a: r, b: strips[3][s === 0 ? 0 : strips[3].length - 1], cells: left });
      if (right.length) links.push({ a: r, b: strips[1][s === 0 ? 0 : strips[1].length - 1], cells: right });
    }
    for (const s of [1, 3]) for (const r of strips[s]) {
      const wx = s === 3 ? cx0 - 1 : cx1 + 1, ix = s === 3 ? wx - 1 : wx + 1, ox = s === 3 ? wx + 1 : wx - 1, cells = [];
      for (let y = r.y; y < r.y + r.h; y++) cells.push([wx, y, ix, y, ox, y]);
      links.push({ a: r, b: null, cells });
    }
    const par = rooms.map((_, i) => i).concat([rooms.length]);
    const find = i => (par[i] === i ? i : (par[i] = find(par[i])));
    const node = r => (r ? r.id : rooms.length);
    const yardDoors = [];
    const addDoor = L => {
      const ok = L.cells.filter(([x, y, ix, iy, ox, oy]) => {
        if (!isWall(g[y][x]) || g[iy][ix] !== '.' || g[oy][ox] !== '.') return false;
        const fl = ix === ox ? [g[y][x - 1], g[y][x + 1]] : [g[y - 1][x], g[y + 1][x]];
        if (!isWall(fl[0]) || !isWall(fl[1])) return false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isDoorCh(g[y + dy][x + dx])) return false;
        return true;
      });
      if (!ok.length) return false;
      const mid = (ok.length - 1) / 2, c = ok.map((v, k) => [v, Math.abs(k - mid) + rng.next() * ok.length * 0.4]).sort((u, v) => u[1] - v[1])[0][0];
      g[c[1]][c[0]] = 'D'; markDoor(G, c[0], c[1], c[4], c[5], c[2], c[3]);
      if (!L.b) yardDoors.push(c);
      par[find(node(L.a))] = find(node(L.b)); L.used = true;
      return true;
    };
    for (const L of rng.shuffle(links)) if (rng.chance(L.b ? 0.6 : 0.5)) addDoor(L);
    for (let it = 0; it < 3; it++) for (const L of links.slice().sort((u, v) => (u.b ? 1 : 0) - (v.b ? 1 : 0))) if (!L.used && find(node(L.a)) !== find(node(L.b))) addDoor(L);
    if (rooms.some(r => find(r.id) !== find(rooms.length))) return null;
    for (const L of links) if (yardDoors.length < 3 && !L.b && !L.used) addDoor(L);
    if (yardDoors.length && rng.chance(0.5)) { const c = rng.pick(yardDoors); g[c[1]][c[0]] = 'G'; } // en järngrind
    // stort borgtorn (byggnad) mitt på gården om den är rymlig
    const cwid = cx1 - cx0 + 1, chei = cy1 - cy0 + 1;
    let keep = null;
    if (cwid >= 20 && chei >= 16 && rng.chance(0.75)) {
      const w = rng.int(7, 9), h = rng.int(6, 8);
      const x = Math.max(cx0 + 4, Math.min(cx1 - 3 - w, Math.round((cx0 + cx1 - w) / 2) + rng.int(-2, 2)));
      const y = Math.max(cy0 + 4, Math.min(cy1 - 3 - h, Math.round((cy0 + cy1 - h) / 2) + rng.int(-2, 2)));
      keep = stampBuilding(G, rng, { x, y, w, h }, look.wall, 2, 2);
      if (!keep) return null;
    }
    // gräsfläckar på gruset
    const Mn = fbm(rng, W, H, 5);
    for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) if (G.sky[y * W + x] && Mn[y * W + x] > 0.6) fm[y * W + x] = 1;
    // torn och pelare som skydd, med fri ring runt om
    const towers = [];
    const nT = rng.int(2, 3) + Math.floor(cwid * chei / 220);
    for (let t = 0; t < 150 && towers.length < nT; t++) {
      const s = rng.pick([1, 2, 2, 3]), x = rng.int(cx0 + 2, cx1 - 1 - s), y = rng.int(cy0 + 2, cy1 - 1 - s);
      const r = { x, y, w: s, h: s };
      if (towers.some(o => !(o.x + o.w + 3 <= r.x || r.x + r.w + 3 <= o.x || o.y + o.h + 3 <= r.y || r.y + r.h + 3 <= o.y))) continue;
      let ok = true;
      for (let yy = y - 1; ok && yy <= y + s; yy++) for (let xx = x - 1; xx <= x + s; xx++) {
        const inner = xx >= x && yy >= y && xx < x + s && yy < y + s;
        if (g[yy][xx] !== '.' || !G.sky[yy * W + xx] || (inner && lock[yy * W + xx])) { ok = false; break; }
      }
      if (!ok) continue;
      const round = s === 3 && rng.chance(0.5);
      for (let yy = y; yy < y + s; yy++) for (let xx = x; xx < x + s; xx++) if (!(round && (xx - x) % 2 === 0 && (yy - y) % 2 === 0)) g[yy][xx] = '4';
      towers.push(r);
    }
    for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) if (fm[y * W + x] === 1 && rng.chance(0.06)) plant(G, x, y, 't');
    breakOpen(G, rng, 5, (x, y) => { if (fm[y * W + x] === 1 && rng.chance(0.6)) plantNear(G, rng, x, y, 't', 1); else plantNear(G, rng, x, y, '4', 1); });
    if (!connectRegions(G, rng, { width: 1 })) return null;
    const seeds = rooms.map(r => ({ x: r.cx, y: r.cy, tag: 'room', box: r }));
    if (keep) seeds.unshift({ x: keep.cx, y: keep.cy, tag: 'keep', box: keep });
    return populate(G, rng, depth, opts, { seeds, spacing: 7, treasureTags: ['room'], eliteTags: ['keep', 'open'], barrels: { p: 0.45, min: 3 } });
  }

  LOOKS.caves.build = buildCaves;
  LOOKS.graveyard.build = buildGraveyard;
  LOOKS.forest.build = buildForest;
  LOOKS.courtyard.build = buildCourtyard;

  // ---------- Bossarena ----------
  const ARENAS = {
    graveyard: { biome: 'graveyard', wall: '7', floors: ['floor_grass_dead', 'floor_gravel', 'floor_ground_dirt'], ceil: 'floor_stone', outdoor: true, ambient: [0.24, 0.3],
      fog: NIGHT_FOG, names: ['GRAVKUNGENS VILA', 'DE DÖDAS TRÄDGÅRD', 'BENFÄLTET'] },
    cave: { biome: 'caves', wall: '8', floors: ['floor_cave', 'floor_mud'], ceil: 'ceil_cave', outdoor: false, ambient: [0.13, 0.17],
      fog: rng => rng.pick([[16, 8, 8], [10, 12, 14]]), names: ['DRAKENS HÅLA', 'DET DJUPA SVALGET', 'BESTENS LYA'] },
    forest: { biome: 'forest', wall: '6', floors: ['floor_ground_grass', 'floor_ground_dirt', 'floor_grass_dead'], ceil: 'floor_wood_planks', outdoor: true, ambient: [0.25, 0.32],
      fog: NIGHT_FOG, names: ['DEN SVARTA GLÄNTAN', 'HÄXANS RING', 'DE HÄNGDAS EK'] },
  };
  function boss(seed, opts) {
    opts = opts || {};
    if (opts.arena && ARENAS[opts.arena]) return bossArena(seed, opts.arena, opts);
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
      name: rng.pick(theme.names), biome: 'dungeon', floor: theme.floor, floors: [theme.floor], floorMask: new Array(H).fill('0'.repeat(W)),
      ceil: theme.ceil, sky: null, secretWall: wc, fog: theme.fog.slice(), ambient: roundAmb(rng, theme.ambient),
      map: g.map(r => r.join('')), depth: opts.depth || 6, seed, arena: 'hall',
      rooms: [{ x: AX0, y: AY0, w: AX1 - AX0 + 1, h: AY1 - AY0 + 1, type: 'boss' }, { x: cx - 1, y: 1, w: 3, h: 2, type: 'exit' }],
    };
    return level;
  }

  // arenor utomhus/i grottan: samma grundform som tronsalen (P nere, B uppe, grind G och utgång x bakom),
  // skydd i speglade par runt kanterna men en fri mitt (9x9) där den stora bossen kan röra sig
  function bossArena(seed, arena, opts) {
    const A = ARENAS[arena], root = RNG(seed).fork('boss-' + arena);
    const W = 25, H = 27, cx = 12, AX0 = 1, AX1 = 23, AY0 = 4, AY1 = 25, wc = A.wall;
    const PX = cx, PY = AY1 - 1, BX = cx, BY = AY0 + 3;
    const mid = (x, y) => x >= cx - 4 && x <= cx + 4 && y >= 10 && y <= 18;
    const lrng = root.fork('look'), name = lrng.pick(A.names), fog = A.fog(lrng), ambient = roundAmb(lrng, A.ambient);
    for (let attempt = 0; attempt < 20; attempt++) {
      const rng = root.fork('a' + attempt);
      const G = Grid(W, H, wc), { g, fm } = G;
      for (let y = AY0; y <= AY1; y++) for (let x = AX0; x <= AX1; x++) { g[y][x] = '.'; G.sky[y * W + x] = A.outdoor ? 1 : 0; }
      for (let y = 1; y <= 2; y++) for (let x = cx - 1; x <= cx + 1; x++) { g[y][x] = '.'; G.sky[y * W + x] = arena === 'forest' ? 1 : 0; }
      g[1][cx] = 'x'; g[3][cx] = 'G';
      markDoor(G, cx, 3, cx, 4, cx, 2);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) G.lockMin(BX + dx, BY + dy, 1); // bossen är stor
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) G.lockMin(PX + dx, PY + dy, 1);
      for (let y = 10; y <= 18; y++) for (let x = cx - 4; x <= cx + 4; x++) G.lockMin(x, y, 1);
      const N2 = fbm(rng, W, H, 4);
      // ojämna kanter: berg/bryn växer in från väggen (inte i kyrkogårdens raka mur)
      if (arena !== 'graveyard') {
        for (let y = AY0; y <= AY1; y++) for (let x = AX0; x <= AX1; x++) {
          const e = Math.min(x - AX0, AX1 - x, y - AY0, AY1 - y), v = N2[y * W + x];
          if ((e === 0 && v > 0.3) || (e === 1 && v > 0.6) || (e === 2 && v > 0.85)) plant(G, x, y, wc);
        }
      }
      // skydd i speglade par
      const covers = [];
      const nPairs = rng.int(4, 6);
      for (let t = 0; t < 120 && covers.length < nPairs; t++) {
        const x = rng.int(3, 9), y = rng.int(7, 22);
        if (mid(x, y) || covers.some(c => cheb(c[0], c[1], x, y) < 4)) continue;
        const kind = rng.next();
        const cellsK = arena === 'graveyard' ? (kind < 0.45 ? [[0, 0, 'n'], [2, 0, 'n'], [4, 0, 'n']] : kind < 0.75 ? [[0, 0, 't']] : [[0, 0, wc], [1, 0, wc]])
          : arena === 'cave' ? (kind < 0.6 ? [[0, 0, wc], [1, 0, wc], [0, 1, wc], [1, 1, wc]].filter(() => rng.chance(0.85)) : [[0, 0, wc]])
            : (kind < 0.5 ? [[0, 0, 't'], [1, 1, 't']] : kind < 0.8 ? [[0, 0, 't']] : [[0, 0, wc], [1, 0, wc], [0, 1, wc], [1, 1, wc]]);
        let n = 0;
        for (const [dx, dy, ch] of cellsK) for (const xx of [x + dx, W - 1 - x - dx]) if (plant(G, xx, y + dy, ch)) n++;
        if (n) covers.push([x, y]);
      }
      // strödda gravstenar / träd / droppstenar
      const loose = arena === 'graveyard' ? 'n' : arena === 'forest' ? 't' : wc;
      for (let k = rng.int(5, 9); k > 0; k--) { const x = rng.int(2, 22), y = rng.int(6, 23); if (!mid(x, y)) plant(G, x, y, loose); }
      // eldfat runt kanterna
      const jit = () => rng.int(-1, 1), spots = [];
      for (const x of [3, 7, 17, 21]) spots.push([x + jit(), AY0 + 1], [x + jit(), AY1 - 1]);
      for (const y of [7, 12, 17, 22]) spots.push([AX0 + 1, y + jit()], [AX1 - 1, y + jit()]);
      let nf = 0;
      for (const [x, y] of spots) if (cheb(x, y, cx, AY0) > 2 && cheb(x, y, PX, PY) > 2 && plantNear(G, rng, x, y, 'f', 2)) nf++;
      if (nf < 6) continue;
      g[PY][PX] = 'P'; g[BY][BX] = 'B';
      const fc = [];
      for (let y = 12; y <= AY1; y++) for (let x = AX0; x <= AX1; x++) if (g[y][x] === '.' && G.lock[y * W + x] < 2 && cheb(x, y, PX, PY) >= 2) fc.push([x, y]);
      rng.shuffle(fc);
      const nh = rng.int(3, 4), na = rng.int(3, 4);
      for (let i = 0; i < nh + na && i < fc.length; i++) g[fc[i][1]][fc[i][0]] = i < nh ? 'h' : 'a';
      // golv: grus-/jordstig från start till grinden, annars lera eller vissnat gräs i fläckar
      for (let y = 2; y <= AY1; y++) for (let x = cx - 1; x <= cx + 1; x++) if (arena !== 'cave' && (x === cx || N2[y * W + x] > 0.4)) fm[y * W + x] = 1;
      for (let i = 0; i < W * H; i++) if (!fm[i] && N2[i] < 0.3) fm[i] = arena === 'cave' ? 1 : 2;
      const rows = a => { const out = []; for (let y = 0; y < H; y++) { let s = ''; for (let x = 0; x < W; x++) s += a[y * W + x]; out.push(s); } return out; };
      const level = {
        name, biome: A.biome, floor: A.floors[0], floors: A.floors.slice(), floorMask: rows(fm), ceil: A.ceil, sky: A.outdoor ? rows(G.sky) : null,
        secretWall: wc, fog, ambient, map: g.map(r => r.join('')), depth: opts.depth || 6, seed, arena,
        rooms: [{ x: AX0, y: AY0, w: AX1 - AX0 + 1, h: AY1 - AY0 + 1, type: 'boss' }, { x: cx - 1, y: 1, w: 3, h: 2, type: 'exit' }],
      };
      if (!validate(level).length) return level;
    }
    throw new Error('Gen.boss: kunde inte bygga arenan ' + arena + ' (seed ' + seed + ')');
  }

  // ---------- Validering ----------
  const ENEMY_CHARS = 'SKVILNORWE';
  const VALID = new Set(('123456789DG*xPBhaA$CMfotn.' + ENEMY_CHARS + WEAPON_CHARS).split(''));
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
    // nåbarhet från P (4-grannskap; väggar, eldfat, köpman, träd och gravstenar blockerar)
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
    // biom, golvtexturer, golvmask och himmel (samma storlek som kartan)
    if (level.biome !== undefined && !BIOMES.some(b => b.id === level.biome)) errs.push('okänd biom ' + level.biome);
    const nF = Array.isArray(level.floors) ? level.floors.length : 1;
    if (level.floors !== undefined && (!Array.isArray(level.floors) || !nF || nF > 4 || level.floors.some(f => typeof f !== 'string') || level.floors[0] !== level.floor)) errs.push('floors ogiltigt (1-4 namn, floors[0] = floor)');
    const mask = (k, ok) => {
      const m = level[k];
      if (m === null || m === undefined) return;
      if (!Array.isArray(m) || m.length !== H) { errs.push(k + ' har fel storlek'); return; }
      for (let y = 0; y < H; y++) {
        if (typeof m[y] !== 'string' || m[y].length !== W) { errs.push(k + ' rad ' + y + ' har fel längd'); return; }
        for (let x = 0; x < W; x++) if (!ok(m[y][x])) { errs.push(k + ' har ogiltigt tecken "' + m[y][x] + '" vid ' + x + ',' + y); return; }
      }
    };
    mask('sky', c => c === '0' || c === '1');
    mask('floorMask', c => c >= '0' && c <= '3' && c.charCodeAt(0) - 48 < nF);
    return errs;
  }

  window.Gen = { floor, boss, validate, THEMES, BOSS_THEMES, BIOMES };
})();
