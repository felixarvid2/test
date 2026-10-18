'use strict';
// Testar bangeneratorn: node tools/gen-test.js
// Genererar 300 fängelsehålor + 75 banor per övrig biom + bossarenor av alla sorter (med och utan bosstema), validerar allt
// (rumstyper, vaktarens sal, fiendegrupper, rekvisita, fällor) och avslutar med exit 1 vid fel.
const fs = require('fs');
const path = require('path');
global.window = global;
for (const f of ['rng.js', 'gen.js']) {
  // eval i global scope så att window.RNG / window.Gen hamnar på global
  (0, eval)(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'));
}

let failures = 0;
const fail = msg => { failures++; if (failures <= 25) console.log('FEL: ' + msg); };
const count = (map, ch) => map.reduce((n, r) => n + r.split(ch).length - 1, 0);
const isWall = c => (c >= '1' && c <= '9') || '#%~&='.includes(c);
const isBlock = c => isWall(c) || 'fMtnkquvwyeHJT'.includes(c);
const ENEMIES = 'SKVILNORWEQ', PROPS = 'ckjquvwyzeiFHJT', LIGHTS = 'cfiF';
const SPECIAL = ['shop', 'shrine', 'treasure', 'secret', 'guardian'];
const GUARD = Gen.GUARDIANS, GUARD_IDS = Object.keys(GUARD);
const timed = f => { const t0 = process.hrtime.bigint(); const v = f(); return [v, Number(process.hrtime.bigint() - t0) / 1e6]; };
// BFS-avstånd från P till x (passerbart = allt som inte blockerar), -1 om det saknas väg
function pathPX(m) {
  const H = m.length, W = m[0].length;
  let s = -1, t = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (m[y][x] === 'P') s = y * W + x; if (m[y][x] === 'x') t = y * W + x; }
  const d = new Int32Array(W * H).fill(-1), q = [s]; d[s] = 0;
  for (let qh = 0; qh < q.length; qh++) {
    const c = q[qh], x = c % W, y = (c / W) | 0;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || d[ny * W + nx] >= 0 || isBlock(m[ny][nx])) continue;
      d[ny * W + nx] = d[c] + 1; q.push(ny * W + nx);
    }
  }
  return d[t];
}

// ---- RNG ----
{
  const a = RNG(42), b = RNG(42), c = RNG(43);
  const sa = Array.from({ length: 8 }, () => a.next()), sb = Array.from({ length: 8 }, () => b.next()), sc = Array.from({ length: 8 }, () => c.next());
  if (JSON.stringify(sa) !== JSON.stringify(sb)) fail('RNG: samma seed gav olika sekvens');
  if (JSON.stringify(sa) === JSON.stringify(sc)) fail('RNG: olika seeds gav samma sekvens');
  const r = RNG('hej');
  for (let i = 0; i < 2000; i++) { const v = r.int(3, 6); if (v < 3 || v > 6 || !Number.isInteger(v)) { fail('RNG.int utanför intervall: ' + v); break; } const f = r.next(); if (f < 0 || f >= 1) { fail('RNG.next utanför [0,1)'); break; } }
  const seen = new Set(); for (let i = 0; i < 500; i++) seen.add(r.int(3, 6)); if (seen.size !== 4 || !seen.has(3) || !seen.has(6)) fail('RNG.int når inte båda ändarna');
  const arr = [1, 2, 3, 4, 5]; if (r.shuffle(arr) !== arr || arr.slice().sort().join() !== '1,2,3,4,5') fail('RNG.shuffle');
  const w = { a: 0, b: 0 }; for (let i = 0; i < 4000; i++) w[r.weighted(['a', 'b'], x => (x === 'a' ? 1 : 3))]++; if (w.b < w.a * 2) fail('RNG.weighted skev');
  if (RNG(7).fork('x').next() !== RNG(7).fork('x').next() || RNG(7).fork('x').next() === RNG(7).fork('y').next()) fail('RNG.fork');
  if (typeof RNG.hash('abc') !== 'number' || RNG.hash('abc') !== RNG.hash('abc')) fail('RNG.hash');
  if (typeof RNG.randomSeed() !== 'number') fail('RNG.randomSeed');
}

const weaponOpts = [undefined, 'g', 'r', 'm', 'd', 'b', 's', 'p'];
const BIOME_IDS = Gen.BIOMES.map(b => b.id);
if (BIOME_IDS.join() !== 'dungeon,caves,graveyard,forest,courtyard') fail('Gen.BIOMES ' + BIOME_IDS.join());
const OUTDOOR = { dungeon: false, caves: false, graveyard: true, forest: true, courtyard: true };
const AMB = { dungeon: [0.12, 0.22], caves: [0.12, 0.17], graveyard: [0.24, 0.32], forest: [0.24, 0.32], courtyard: [0.24, 0.32] };
const SKY_MIN = { graveyard: 0.75, forest: 0.85, courtyard: 0.25 }; // andel himmel bland gångbara rutor
const stats = { retries0: Gen.floor.stats.retries };
const B = {}; // statistik per biom
const samples = {};

// gemensamma kontroller för alla biomer (räkningar som för fängelsehålan)
function checkLevel(lv, seed, depth, opts, biome) {
  const tag = `[${biome} seed=${seed} d=${depth} ${JSON.stringify(opts)}]`;
  for (const e of Gen.validate(lv)) fail(tag + ' ' + e);
  if (lv.biome !== biome) fail(tag + ' biome ' + lv.biome);
  const m = lv.map, H = m.length, W = m[0].length;
  const lim = 30 + (depth - 1) * 3 + 2;
  if (W < 30 + (depth - 1) * 3 || W > Math.min(44, lim) || H < 30 + (depth - 1) * 3 || H > Math.min(44, lim)) fail(tag + ` kartstorlek ${W}x${H}`);
  const types = {}; for (const r of lv.rooms) types[r.type] = (types[r.type] || 0) + 1;
  if (types.start !== 1 || types.exit !== 1 || !(types.treasure >= 1)) fail(tag + ' rumstyper ' + JSON.stringify(types));
  if ((types.shop || 0) !== (opts.shop ? 1 : 0)) fail(tag + ' shop-rum ' + (types.shop || 0));
  if ((types.elite || 0) < 1 || (types.elite || 0) > Math.max(1, Math.floor(depth / 2))) fail(tag + ' elitrum ' + (types.elite || 0));
  if (types.guardian !== 1) fail(tag + ' vaktarsalar ' + types.guardian);
  if (count(m, 'E') !== (types.elite || 0)) fail(tag + ' antal E=' + count(m, 'E') + ' elitrum=' + types.elite);
  if (count(m, 'M') !== (opts.shop ? 1 : 0)) fail(tag + ' antal M ' + count(m, 'M'));
  if (count(m, 'C') < 1) fail(tag + ' kortkista saknas');
  if (types.secret) { if (count(m, '*') !== 1) fail(tag + ' hemlig vägg ' + count(m, '*')); } else if (count(m, '*') !== 0) fail(tag + ' * utan hemligt rum');
  for (const w of 'grmdbsp') if (count(m, w) !== (opts.weapon === w ? 1 : 0)) fail(tag + ` vapen ${w}: ${count(m, w)}`);
  const en = [...'SKVILNORW'].reduce((n, c) => n + count(m, c), 0), want = 6 + 3 * depth;
  if (en < want - 6 || en > Math.round(want * 1.3) + 2) fail(tag + ` fiender ${en} (väntat ca ${want})`);
  const st0 = B[biome] = B[biome] || { n: 0, ms: [], cells: 0, open: 0, px: 0, pxMin: 99, props: 0, secret: 0, areas: 0, sky: 0 };
  st0.enRel = (st0.enRel || 0) + (en + count(m, 'E') + count(m, 'Q')) / want;
  if (depth === 1 && [...'VIONRW'].some(c => count(m, c) > 0)) fail(tag + ' för svår fiende på djup 1');
  if (depth === 2 && [...'NRW'].some(c => count(m, c) > 0)) fail(tag + ' för svår fiende på djup 2');
  // elitfiender och vanliga fiender minst 7 rutor från P
  let px = 0, py = 0; m.forEach((r, y) => { const x = r.indexOf('P'); if (x >= 0) { px = x; py = y; } });
  m.forEach((r, y) => [...r].forEach((c, x) => { if ('SKVILNORWEQZ'.includes(c) && Math.hypot(x - px, y - py) < 7) fail(tag + ` fiende ${c} ${Math.hypot(x - px, y - py).toFixed(1)} från P`); }));
  const gold = count(m, '$'), pots = count(m, 'o'), nf = count(m, 'f');
  if (gold < 3 || gold > 8) fail(tag + ' guld ' + gold);
  if (pots < 1 || pots > 8) fail(tag + ' krukor ' + pots);
  if (nf < 1) fail(tag + ' inga eldfat');
  const ne = count(m, 'e'), nz = count(m, 'z');
  if (ne < 1 || ne > 4) fail(tag + ' explosiva tunnor ' + ne);
  if (nz > 6) fail(tag + ' spikfällor ' + nz);
  if (count(m, 'w') > 1 || count(m, 'y') > 1) fail(tag + ` brunnar ${count(m, 'w')} altare ${count(m, 'y')}`);
  if (count(m, 'w') !== (types.shrine || 0)) fail(tag + ` brunnar ${count(m, 'w')} men helgedomar ${types.shrine || 0}`);
  const amb = AMB[biome];
  if (!(lv.ambient >= amb[0] && lv.ambient <= amb[1])) fail(tag + ' ambient ' + lv.ambient);
  if (!Array.isArray(lv.floors) || lv.floors[0] !== lv.floor || !Array.isArray(lv.floorMask)) fail(tag + ' floors/floorMask');
  // himmel: inomhus null, utomhus mestadels öppen
  let walk = 0, open = 0, skyN = 0, props = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = m[y][x];
    if (c === 't' || c === 'n') props++;
    if (isWall(c)) continue;
    walk++; if (!isBlock(c)) open++;
    if (lv.sky && lv.sky[y][x] === '1') skyN++;
  }
  if (OUTDOOR[biome]) { if (!lv.sky) fail(tag + ' sky saknas utomhus'); else if (skyN / walk < SKY_MIN[biome]) fail(tag + ` för lite himmel ${(skyN / walk).toFixed(2)}`); }
  else if (lv.sky !== null) fail(tag + ' sky ska vara null inomhus');
  // utgången långt bort: väglängd P->x i förhållande till kartans storlek
  const dPX = pathPX(m), rel = dPX / Math.max(W, H);
  if (dPX < 0) fail(tag + ' ingen väg P->x');
  else if (rel < (biome === 'dungeon' ? 0.5 : 0.8)) fail(tag + ` utgången för nära: ${dPX} steg (${rel.toFixed(2)} av kartbredden)`);
  // träd och gravstenar får aldrig stänga av något: ta bort dem och jämför nåbar yta (validate har redan kollat nåbarheten med dem)
  const s = B[biome];
  s.n++; s.cells += W * H; s.open += open / (W * H); s.px += rel; s.pxMin = Math.min(s.pxMin, rel); s.props += props; s.areas += lv.rooms.length;
  if (types.secret) s.secret++;
  if (lv.sky) s.sky += skyN / walk;
  for (const c of 'SKVILNORW') s['typ' + c] = (s['typ' + c] || 0) + count(m, c);
  checkRooms(lv, tag, s, px, py);
  return { tag, types };
}

// rum (via roomMask), vaktarens sal, fiendegrupper, rekvisita och fällor
function checkRooms(lv, tag, s, px, py) {
  const m = lv.map, H = m.length, W = m[0].length, rm = lv.roomMask;
  if (!Array.isArray(rm) || rm.length !== H) { fail(tag + ' roomMask saknas'); return; }
  const R = lv.rooms.map(() => ({ en: 0, props: 0, loot: '', cells: 0, chars: '' }));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = rm[y].charCodeAt(x) - 48, c = m[y][x];
    if (rm[y][x] === '-') { if (ENEMIES.includes(c) || c === 'Z') fail(tag + ` fiende ${c} utanför alla rum vid ${x},${y}`); continue; }
    const r = R[k]; if (!r) { fail(tag + ' roomMask pekar på okänt rum ' + k); return; }
    r.cells++;
    if (ENEMIES.includes(c)) r.en++;
    if (PROPS.includes(c)) r.props++;
    if ('ZMwyChaA$grmdbsp'.includes(c)) r.loot += c;
    if (c !== '.' && !isWall(c)) r.chars += c;
  }
  // vaktaren: exakt ett Z, i salen av typen guardian, väggar i vaktarens tecken, golv i vaktarens textur, fri 5x5
  const gi = lv.rooms.findIndex(r => r.type === 'guardian'), gd = GUARD[lv.guardian];
  if (!gd) fail(tag + ' okänd vaktare ' + lv.guardian);
  if (count(m, 'Z') !== 1) fail(tag + ' antal Z ' + count(m, 'Z'));
  let zx = -1, zy = -1; m.forEach((r, y) => { const x = r.indexOf('Z'); if (x >= 0) { zx = x; zy = y; } });
  if (gi < 0 || !gd) return;
  const G = lv.rooms[gi];
  if (G.guardian !== lv.guardian) fail(tag + ' vaktarsalen saknar guardian-id');
  if (zx >= 0) {
    if (rm[zy].charCodeAt(zx) - 48 !== gi) fail(tag + ' Z ligger inte i vaktarens sal');
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (isBlock(m[zy + dy][zx + dx])) fail(tag + ` hinder ${m[zy + dy][zx + dx]} vid Z (${zx + dx},${zy + dy})`);
    const bf = lv.floors.indexOf(gd.floor);
    if (bf < 0 || +lv.floorMask[zy][zx] !== bf) fail(tag + ' vaktarens golv saknas vid Z');
    // salens golv: nästan allt i vaktarens textur
    let gf = 0, gn = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (rm[y].charCodeAt(x) - 48 === gi) { gn++; if (+lv.floorMask[y][x] === bf) gf++; }
    if (gf < gn * 0.9) fail(tag + ` vaktarens golv bara på ${gf}/${gn} rutor`);
    // väggarna runt salen
    let wn = 0;
    for (let y = G.y - 1; y <= G.y + G.h; y++) for (let x = G.x - 1; x <= G.x + G.w; x++) if (m[y] && m[y][x] === gd.wall) wn++;
    if (wn < 2 * (G.w + G.h)) fail(tag + ` vaktarsalen har bara ${wn} väggar ${gd.wall}`);
    if (G.w < 7 || G.h < 7 || G.w > 13 || G.h > 13) fail(tag + ` vaktarsalen ${G.w}x${G.h}`);
    const lights = [...R[gi].chars].filter(c => c === 'c' || c === 'f').length;
    if (lights < 2 || lights > 4) fail(tag + ' ljuskällor i vaktarsalen ' + lights);
    // vaktaren ligger långt från start: gångavstånd P->Z jämfört med längsta gångavståndet från P
    const d = new Int32Array(W * H).fill(-1), q = [py * W + px]; d[q[0]] = 0; let mx = 0;
    for (let qh = 0; qh < q.length; qh++) { const c = q[qh], x = c % W, y = (c / W) | 0; mx = Math.max(mx, d[c]); for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) { const ni = ny * W + nx; if (d[ni] < 0 && !isBlock(m[ny][nx])) { d[ni] = d[c] + 1; q.push(ni); } } }
    const rel = d[zy * W + zx] / mx;
    if (!(rel >= 0.35)) fail(tag + ` vaktaren för nära start (${rel.toFixed(2)})`);
    s.gdist = (s.gdist || 0) + rel; s.gmin = Math.min(s.gmin === undefined ? 9 : s.gmin, rel);
  }
  // varje rum: aldrig exakt en fiende; stridsrum har en grupp (>= 2), specialrum har sitt innehåll, alla utom start har rekvisita
  s.hist = s.hist || {}; s.arch = s.arch || {}; s.propN = s.propN || {};
  lv.rooms.forEach((r, i) => {
    const q = R[i];
    if (!r.arch) fail(tag + ` rum ${i} (${r.type}) saknar arch`);
    s.arch[r.arch] = (s.arch[r.arch] || 0) + 1;
    if (q.en === 1) fail(tag + ` rum ${i} (${r.type}/${r.arch}) har exakt en fiende`);
    if (r.type === 'start') { if (q.en) fail(tag + ' fiender i startområdet'); return; }
    s.hist[q.en] = (s.hist[q.en] || 0) + 1;
    if (SPECIAL.includes(r.type)) {
      if (q.en) fail(tag + ` specialrum ${i} (${r.type}) har ${q.en} fiender`);
      const need = { shop: 'M', shrine: 'w', treasure: 'C', secret: 'CA', guardian: 'Z' }[r.type];
      if (![...need].some(c => q.loot.includes(c))) fail(tag + ` specialrum ${i} (${r.type}) saknar ${need}`);
    } else if (q.en < 2) fail(tag + ` rum ${i} (${r.type}/${r.arch}) har ${q.en} fiender`);
    if (r.type !== 'guardian' && !q.props) fail(tag + ` rum ${i} (${r.type}/${r.arch}) saknar rekvisita`);
  });
  // spikfällor: aldrig på/intill P, x eller dörrar
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = m[y][x];
    if (PROPS.includes(c)) s.propN[c] = (s.propN[c] || 0) + 1;
    if (c !== 'z') continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ('Px'.includes(m[y + dy][x + dx])) fail(tag + ` spikfälla intill ${m[y + dy][x + dx]} vid ${x},${y}`);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if ('DG*'.includes(m[y + dy][x + dx])) fail(tag + ` spikfälla i dörröppning vid ${x},${y}`);
  }
  // äkta kista finns alltid, mimics bara i rum med andra fiender
  if (count(m, 'C') < 1) fail(tag + ' ingen äkta kista');
  s.mimic = (s.mimic || 0) + count(m, 'Q');
  // rekvisitan stänger inte av något: alla gångbara rutor nås från P med all blockerande rekvisita på plats,
  // och ingen blockerande rekvisita står i en dörröppning
  const reach = mm => { const seen = new Uint8Array(W * H), st = [py * W + px]; seen[st[0]] = 1; let n = 0; while (st.length) { const c = st.pop(); n++; const x = c % W, y = (c / W) | 0; for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) { const ni = ny * W + nx; if (!seen[ni] && !isBlock(mm[ny][nx])) { seen[ni] = 1; st.push(ni); } } } return n; };
  let walk = 0; for (const r of m) for (const c of r) if (!isBlock(c)) walk++;
  if (reach(m) !== walk) fail(tag + ' rekvisita stänger av rutor');
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if ('kquvwyeHJT'.includes(m[y][x]))
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if ('DG*'.includes(m[y + dy][x + dx])) fail(tag + ` ${m[y][x]} i dörröppning vid ${x},${y}`);
}

// ---- fängelsehålan (samma kontroller som tidigare) ----
{
  const TOTAL = 300;
  let minRooms = 99, maxRooms = 0, rooms = 0;
  for (let i = 0; i < TOTAL; i++) {
    const depth = 1 + (i % 5), seed = (i % 3 === 0) ? 'seed-' + i : 1000 + i * 7919;
    const opts = { shop: i % 2 === 0, weapon: weaponOpts[(i >> 1) % weaponOpts.length], biome: 'dungeon' };
    const [lv, ms] = timed(() => Gen.floor(seed, depth, opts));
    const { tag, types } = checkLevel(lv, seed, depth, opts, 'dungeon');
    B.dungeon.ms.push(ms);
    const nMain = lv.rooms.length - (types.secret || 0);
    if (nMain < 7 || lv.rooms.length > 15) fail(tag + ' antal rum ' + lv.rooms.length);
    if (types.treasure !== 1) fail(tag + ' skattrum ' + types.treasure);
    rooms += lv.rooms.length; minRooms = Math.min(minRooms, lv.rooms.length); maxRooms = Math.max(maxRooms, lv.rooms.length);
    if (!lv.floorMask.some(r => /[^0]/.test(r))) fail(tag + ' golvmasken används inte (vaktarens golv saknas)');
    const opts2 = Object.assign({}, opts, { guardian: GUARD_IDS[i % GUARD_IDS.length] });
    if (i % 7 === 0 && Gen.floor(seed, depth, opts2).guardian !== opts2.guardian) fail(tag + ' opts.guardian ignoreras');
    if (i % 5 === 0 && JSON.stringify(Gen.floor(seed, depth, opts)) !== JSON.stringify(lv)) fail(tag + ' inte deterministisk');
    if (!samples.dungeon) samples.dungeon = lv;
  }
  B.dungeon.extra = `rum snitt ${(rooms / TOTAL).toFixed(1)} (min ${minRooms}, max ${maxRooms})`;
}

// ---- övriga biomer ----
const PER_BIOME = 75;
for (const biome of BIOME_IDS.slice(1)) {
  for (let i = 0; i < PER_BIOME; i++) {
    const depth = 1 + (i % 5), seed = (i % 3 === 0) ? biome + '-' + i : 2000 + i * 104729;
    const opts = { biome, shop: i % 2 === 1, weapon: weaponOpts[(i >> 1) % weaponOpts.length], guardian: i % 4 === 3 ? undefined : GUARD_IDS[i % GUARD_IDS.length] };
    const [lv, ms] = timed(() => Gen.floor(seed, depth, opts));
    const { tag } = checkLevel(lv, seed, depth, opts, biome);
    B[biome].ms.push(ms);
    if (i % 5 === 0 && JSON.stringify(Gen.floor(seed, depth, opts)) !== JSON.stringify(lv)) fail(tag + ' inte deterministisk');
    if (biome === 'caves' && /[^8]/.test(lv.map.join('').replace(/[^1-9]/g, ''))) fail(tag + ' grottan har andra väggar än 8 (utom vaktarens)');
    if (opts.guardian && lv.guardian !== opts.guardian) fail(tag + ' opts.guardian ignoreras');
    if (biome === 'forest' && count(lv.map, 't') < 5) fail(tag + ' för få träd');
    if (biome === 'graveyard' && (count(lv.map, 'n') < 15 || count(lv.map, '5') < 10 || count(lv.map, 'D') < 2)) fail(tag + ' kyrkogården saknar gravar/kapell/kryptor');
    if (biome === 'courtyard' && count(lv.map, 'D') + count(lv.map, 'G') < 6) fail(tag + ' för få dörrar på borggården');
    if (!samples[biome]) samples[biome] = lv;
  }
}

// ---- slumpad biom utan opts.biome: vikter och djupintervall ----
{
  const seen = {};
  for (let i = 0; i < 1000; i++) {
    const depth = 1 + (i % 5), lv = Gen.floor('mix' + i, depth, { shop: i % 4 === 0 });
    seen[lv.biome] = (seen[lv.biome] || 0) + 1;
    const b = Gen.BIOMES.find(b => b.id === lv.biome);
    if (!b || depth < b.depth[0] || depth > b.depth[1]) fail(`[mix${i} d=${depth}] biom ${lv.biome} utanför djupintervallet`);
    if (i < 200) for (const e of Gen.validate(lv)) fail(`[mix${i}] ${e}`);
  }
  for (const id of BIOME_IDS) if (!seen[id]) fail('biomen ' + id + ' valdes aldrig slumpmässigt');
  if (seen.dungeon < 300 || seen.dungeon > 500) fail('fängelsehålan valdes ' + seen.dungeon + ' av 1000 gånger');
  stats.mix = BIOME_IDS.map(id => id + '=' + (seen[id] || 0)).join(' ');
  if (Gen.floor(5, 3, { theme: 'kapell' }).biome !== 'dungeon') fail('opts.theme ska ge fängelsehålan');
}

// ---- bossarenor ----
const bossMs = {};
for (const arena of ['hall', 'graveyard', 'cave', 'forest']) {
  bossMs[arena] = 0;
  for (let i = 0; i < 30; i++) {
    const bossId = i % 6 === 5 ? undefined : GUARD_IDS[i % GUARD_IDS.length];
    const seed = i % 2 ? 'boss' + i : 500 + i * 31, opts = arena === 'hall' && i % 3 === 0 ? { boss: bossId } : { arena, boss: bossId };
    const [lv, ms] = timed(() => Gen.boss(seed, opts));
    bossMs[arena] += ms;
    const tag = `[boss ${arena} seed=${seed}]`;
    for (const e of Gen.validate(lv)) fail(tag + ' ' + e);
    const m = lv.map;
    if (count(m, 'B') !== 1 || count(m, 'G') !== 1 || count(m, 'x') !== 1 || count(m, 'P') !== 1) fail(tag + ' B/G/x/P antal');
    if (count(m, 'h') < 3 || count(m, 'a') < 3) fail(tag + ' för få h/a');
    if (count(m, 'f') < 6) fail(tag + ' för få eldfat ' + count(m, 'f'));
    if (JSON.stringify(Gen.boss(seed, opts)) !== JSON.stringify(lv)) fail(tag + ' inte deterministisk');
    if (bossId) {
      // bossens väggtecken, golv och dekor
      const gd = GUARD[bossId], bf = lv.floors.indexOf(gd.floor);
      if (lv.boss !== bossId) fail(tag + ' level.boss ' + lv.boss);
      if (count(m, gd.wall) < 6) fail(tag + ` för få väggar ${gd.wall}: ${count(m, gd.wall)}`);
      if (bf < 0 || +lv.floorMask[14][12] !== bf) fail(tag + ' bossens golv saknas i mitten');
      if (![...m.join('')].some(c => PROPS.includes(c))) fail(tag + ' ingen dekor');
      // samma layout som utan bosstema: alla väggar ligger på samma ställen (bara tecknet byts)
      const plain = Gen.boss(seed, Object.assign({}, opts, { boss: undefined })).map;
      if (arena === 'hall' && plain.some((r, y) => [...r].some((c, x) => isWall(c) !== isWall(m[y][x])))) fail(tag + ' bosstemat ändrar tronsalens form');
    } else if (lv.floors.some(f => f.startsWith('floor_boss_'))) fail(tag + ' bossgolv utan opts.boss');
    if (arena !== 'hall') {
      // fri mitt (9x9) för den stora bossen, och fritt runt bossen
      for (let y = 10; y <= 18; y++) for (let x = 8; x <= 16; x++) if (isBlock(m[y][x])) fail(tag + ` hinder ${m[y][x]} i mitten vid ${x},${y}`);
      if ([...'SKVILNORWEQZ'].some(c => count(m, c))) fail(tag + ' vanliga fiender i bossarenan');
      for (let y = 5; y <= 9; y++) for (let x = 10; x <= 14; x++) if (isBlock(m[y][x])) fail(tag + ` hinder ${m[y][x]} vid bossen ${x},${y}`);
      const outdoor = arena !== 'cave';
      if (!!lv.sky !== outdoor) fail(tag + ' sky');
      const wall = { graveyard: '7', cave: '8', forest: '6' }[arena];
      if (m[0][0] !== wall) fail(tag + ' väggtecken ' + m[0][0]);
      if (arena !== 'cave' && count(m, 'n') + count(m, 't') < 4) fail(tag + ' för lite skydd');
    }
    if (!samples['boss:' + arena]) samples['boss:' + arena] = lv;
  }
}

// ---- validate fångar fel ----
{
  const bad = Gen.floor(1, 1, { biome: 'dungeon' }), out = Gen.floor(3, 2, { biome: 'forest' });
  const hack = (lv, f) => { const l = JSON.parse(JSON.stringify(lv)); f(l); return Gen.validate(l).length; };
  if (!hack(bad, l => { l.map[0] = l.map[0].slice(0, -1); })) fail('validate: kort rad ej upptäckt');
  if (!hack(bad, l => { l.map[1] = '.' + l.map[1].slice(1); })) fail('validate: öppen kant ej upptäckt');
  if (!hack(bad, l => { l.map = l.map.map(r => r.replace('P', '.')); })) fail('validate: saknat P ej upptäckt');
  if (!hack(bad, l => { l.map = l.map.map(r => r.replace('x', '.')); })) fail('validate: saknat x ej upptäckt');
  if (!hack(bad, l => { const y = l.map.findIndex(r => r.includes('P')); const x = l.map[y].indexOf('P'); l.map[y] = l.map[y].slice(0, x + 1) + 'D' + l.map[y].slice(x + 2); })) fail('validate: dörr utan väggar ej upptäckt');
  if (!hack(out, l => { l.sky = l.sky.slice(1); })) fail('validate: fel storlek på sky ej upptäckt');
  if (!hack(out, l => { l.floorMask[3] = 'x' + l.floorMask[3].slice(1); })) fail('validate: ogiltig golvmask ej upptäckt');
  if (!hack(out, l => { l.floorMask[3] = '9' + l.floorMask[3].slice(1); })) fail('validate: golvindex utanför floors ej upptäckt');
  if (!hack(out, l => { l.roomMask[3] = 'z' + l.roomMask[3].slice(1); })) fail('validate: ogiltig rumsmask ej upptäckt');
  if (!hack(bad, l => { const y = l.map.findIndex(r => r.includes('P')), x = l.map[y].indexOf('P'); l.map[y] = l.map[y].slice(0, x + 1) + 'z' + l.map[y].slice(x + 2); })) fail('validate: spikfälla intill P ej upptäckt');
  if (!hack(bad, l => { l.map[3] = l.map[3].slice(0, 2) + 'ww' + l.map[3].slice(4); })) fail('validate: två brunnar ej upptäckt');
  if (!hack(bad, l => { l.floors = Array(11).fill(l.floor); })) fail('validate: för många golv ej upptäckt');
  if (!hack(out, l => { l.floors = ['floor_mud']; })) fail('validate: floors[0] != floor ej upptäckt');
  // en ring av träd runt P stänger in spelaren
  if (!hack(out, l => { const y = l.map.findIndex(r => r.includes('P')), x = l.map[y].indexOf('P'); for (let dy = -1; dy <= 1; dy++) l.map[y + dy] = l.map[y + dy].split('').map((c, xx) => (Math.abs(xx - x) <= 1 && (dy || xx !== x) && !(c >= '1' && c <= '9') ? 't' : c)).join(''); })) fail('validate: instängd av träd ej upptäckt');
}

const show = lv => { console.log(`\n${lv.name} (${lv.biome}${lv.arena ? ':' + lv.arena : ''}) djup ${lv.depth} ${lv.map[0].length}x${lv.map.length} ambient ${lv.ambient}`); console.log(lv.map.join('\n')); };
if (process.argv.includes('--show')) for (const k in samples) show(samples[k]);

console.log('\n---');
const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
for (const id of BIOME_IDS) {
  const s = B[id];
  console.log(`${id.padEnd(10)} ${String(s.n).padStart(3)} banor  tid snitt ${avg(s.ms).toFixed(1)} ms max ${Math.max(...s.ms).toFixed(1)} ms  storlek ${Math.sqrt(s.cells / s.n).toFixed(0)}^2  öppet ${(100 * s.open / s.n).toFixed(0)} %` +
    `  P->x ${(s.px / s.n).toFixed(2)} (min ${s.pxMin.toFixed(2)})  områden ${(s.areas / s.n).toFixed(1)}  t/n ${(s.props / s.n).toFixed(0)}  hemligt ${(100 * s.secret / s.n).toFixed(0)} %` +
    (s.sky ? `  himmel ${(100 * s.sky / s.n).toFixed(0)} %` : '') + (s.extra ? '  ' + s.extra : ''));
}
console.log('Fiendesorter (alla biomer): ' + [...'SKVILNORW'].map(c => c + '=' + BIOME_IDS.reduce((n, id) => n + (B[id]['typ' + c] || 0), 0)).join(' '));
console.log('\nFiender per rum (alla rum utom start: antal fiender -> antal rum):');
for (const id of BIOME_IDS) { const h = B[id].hist; console.log(`  ${id.padEnd(10)} ` + Object.keys(h).sort((a, b) => a - b).map(k => k + ':' + h[k]).join(' ') + `   fiender/budget ${(B[id].enRel / B[id].n).toFixed(2)}  mimics ${B[id].mimic}  P->Z ${(B[id].gdist / B[id].n).toFixed(2)} (min ${B[id].gmin.toFixed(2)}) av längsta vägen`); }
console.log('Rekvisita per bana:');
for (const id of BIOME_IDS) { const p = B[id].propN; console.log(`  ${id.padEnd(10)} ` + [...PROPS].filter(c => p[c]).map(c => c + '=' + (p[c] / B[id].n).toFixed(1)).join(' ')); }
console.log('Rumstyper (antal):');
for (const id of BIOME_IDS) { const a = B[id].arch; console.log(`  ${id.padEnd(10)} ` + Object.keys(a).sort((u, v) => a[v] - a[u]).map(k => k + '=' + a[k]).join(' ')); }
console.log('Slumpad biom (1000 st): ' + stats.mix);
console.log('Bossarenor 4 x 30: ' + Object.entries(bossMs).map(([k, v]) => `${k} ${(v / 30).toFixed(2)} ms`).join(', '));
console.log(`Omförsök i generatorn: ${Gen.floor.stats.retries - stats.retries0}`);
if (failures) { console.log(`\n${failures} FEL`); process.exit(1); }
console.log('\nALLA TESTER OK');
