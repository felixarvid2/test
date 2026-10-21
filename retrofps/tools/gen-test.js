'use strict';
// Testar bangeneratorn: node tools/gen-test.js
// Genererar 300 fängelsehålor + 75 banor per övrig biom (även träsket och frostfästet) + bossarenor av alla sorter (med och
// utan bosstema, även ishallen), validerar allt (rumstyper, vaktarens sal, fiendegrupper, rekvisita, fällor, valv med
// grindar/lås, farliga golv, nya fiender per biom och djup, specialrum, NPC:er, husdjursbur, drycker, istappar, nya vapen)
// och avslutar med exit 1 vid fel. Skriver statistik per biom.
// Version 6: vulkanen (75 banor) och obsidianhallen, Gen.secret (hemliga skattvåningar i alla utseenden), de nya tecknen
// (fiender Ñ Æ Þ Ð Ý, lägereld ¶, anslagstavla ®, tunnor µ ß, hemlig trappa ÷, runsten ª, kött ð, fällor ° ¬ ± ¨) bara där de
// får finnas, taken, och att smulande golv ¬ aldrig är enda vägen (¬ som vägg: P->x, Z och alla rum nås ändå).
// --show visar en bana per biom/arena.
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
const isWall = c => (c >= '0' && c <= '9') || '#%~&=Ø¦Ò¤'.includes(c);
const INTERACT = '()[?;/', GATES = '|]{', DOORS = 'DG*|]{', NPCS = '£€©', V6BLOCK = '¶®÷µß';
const isBlock = c => isWall(c) || ('fMtnkquvwyeHJT' + INTERACT + GATES + NPCS + V6BLOCK).includes(c);
const NEW_EN = 'UXY!@^+ÅÄÖÉÜÑÆÞÐÝ', OLD_EN = 'SKVILNORW', ENEMIES = OLD_EN + NEW_EN + 'EQ', PROPS = 'ckjquvwyzeiFHJT' + INTERACT + V6BLOCK, LIGHTS = 'cfiF';
const HAZ = '_-:"z<>Ç°¬±¨', LOOT = 'CAha$,¥ª';
const WCH = Object.keys(Gen.WEAPONS).join(''); // vapentecknen (g r m d b s p å ä ö)
const wchOf = w => (!w ? null : Gen.WEAPONS[w] ? w : [...WCH].find(c => Gen.WEAPONS[c] === w));
const SPECIAL = ['shop', 'shrine', 'treasure', 'secret', 'guardian', 'special', 'vault'];
// nya fiender: första djup och biomer där de får finnas
const NEW_DEPTH = { U: 1, X: 1, Y: 2, '^': 2, '+': 2, '!': 3, '@': 3, 'Å': 1, 'Ä': 2, 'Ö': 2, 'É': 1, 'Ü': 2, 'Ñ': 3, 'Æ': 2, 'Þ': 1, 'Ð': 3, 'Ý': 2 };
const NEW_BIOME = { caves: 'UXÜÑÆ', forest: 'YUXÉÑ', graveyard: 'X!^ÅÄÖÑÐÝ', dungeon: '@!U+ÅÄÖÑÆÐ', courtyard: '@Y!ÄÖÑÐ', swamp: '^UYXÅÑÝ', frost: 'ÉÜ@ÑÝ',
  volcano: 'YXÆ!ÑÐÞ' };
const FEAT = { anvil: '(', fortune: ')', prisoner: '[', challenge: '?', offering: ';', lever: '/', locked: ']', cracked: '{', arrows: '<', gas: '>', lava: '_', water: '-', ice: ':', webs: '"',
  alchemist: '£', priest: '€', petcage: '©', potions: '¥', icicles: 'Ç',
  campfire: '¶', questboard: '®', runes: 'ª', meat: 'ð', firejets: '°', crumble: '¬', pendulums: '±', plates: '¨', secretstairs: '÷', poisonbarrels: 'µ', frostbarrels: 'ß' };
const V6CAP = { '¶': 1, '®': 1, '÷': 1, 'ª': 1, 'ð': 2, '°': 4, '¬': 8, '±': 3, '¨': 2, 'Ñ': 2, 'Ð': 2 };
const SP_CH = { fortune: ')', challenge: '?', offering: ';', smithy: '(', alchemy: '£', chapel2: '€', camp: '¶' };
const GUARD = Gen.GUARDIANS, GUARD_IDS = Object.keys(GUARD);
const timed = f => { const t0 = process.hrtime.bigint(); const v = f(); return [v, Number(process.hrtime.bigint() - t0) / 1e6]; };
// flood fill från (sx, sy) med pass(tecken); returnerar avstånd (-1 = nås inte)
function floodD(m, sx, sy, pass) {
  const H = m.length, W = m[0].length, d = new Int32Array(W * H).fill(-1), q = [sy * W + sx]; d[q[0]] = 0;
  for (let qh = 0; qh < q.length; qh++) {
    const c = q[qh], x = c % W, y = (c / W) | 0;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || d[ny * W + nx] >= 0 || !pass(m[ny][nx])) continue;
      d[ny * W + nx] = d[c] + 1; q.push(ny * W + nx);
    }
  }
  return d;
}
const findCh = (m, ch) => { for (let y = 0; y < m.length; y++) { const x = m[y].indexOf(ch); if (x >= 0) return [x, y]; } return null; };
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

const GAME_WEAPONS = [null, 'shotgun', 'rifle', 'smg', 'dbshotgun', 'crossbow', 'flaregun', 'sniper', 'axe', 'flamer', 'launcher', 'nailgun', 'staff', 'bow'];
const weaponOpts = [undefined, 'g', 'r', 'm', 'd', 'b', 's', 'p', 'å', 'ä', 'ö', 'flamer', 'é', 'ü', 'ñ', 'bow'];
const BIOME_IDS = Gen.BIOMES.map(b => b.id);
if (BIOME_IDS.join() !== 'dungeon,caves,graveyard,forest,courtyard,swamp,frost,volcano') fail('Gen.BIOMES ' + BIOME_IDS.join());
const OUTDOOR = { dungeon: false, caves: false, graveyard: true, forest: true, courtyard: true, swamp: true, frost: true, volcano: true };
const AMB = { dungeon: [0.12, 0.22], caves: [0.12, 0.17], graveyard: [0.24, 0.32], forest: [0.24, 0.32], courtyard: [0.24, 0.32], swamp: [0.2, 0.3], frost: [0.2, 0.26], volcano: [0.19, 0.25] };
const SKY_MIN = { graveyard: 0.75, forest: 0.85, courtyard: 0.25, swamp: 0.85, frost: 0.2, volcano: 0.2 }; // andel himmel bland gångbara rutor
for (const a of ['lava', 'nest', 'frozen', 'flooded', 'smithy', 'trap', 'gas', 'fortune', 'prison', 'challenge', 'offering', 'levervault', 'lockedvault', 'hut', 'sunkenshrine', 'bog',
  'throne', 'frozenlake', 'barracks', 'crystalhall', 'alchemy', 'chapel2', 'forge', 'lavalake', 'ashfield', 'magmachamber', 'camp'])
  if (!Gen.ARCHES.includes(a)) fail('Gen.ARCHES saknar ' + a);
if (Gen.WEAPONS['å'] !== 'axe' || Gen.WEAPONS['ä'] !== 'flamer' || Gen.WEAPONS['ö'] !== 'launcher' || Gen.WEAPONS.g !== 'shotgun') fail('Gen.WEAPONS ' + JSON.stringify(Gen.WEAPONS));
if (Gen.WEAPONS['é'] !== 'nailgun' || Gen.WEAPONS['ü'] !== 'staff' || Gen.WEAPONS['ñ'] !== 'bow') fail('Gen.WEAPONS (version 6) ' + JSON.stringify(Gen.WEAPONS));
if (!Gen.GUARDIANS.frost || Gen.GUARDIANS.frost.wall !== '¦' || Gen.GUARDIANS.frost.floor !== 'floor_boss_frost' || Gen.GUARDIANS.frost.light !== 'c') fail('Gen.GUARDIANS.frost');
const FL = Gen.GUARDIANS.flame;
if (!FL || FL.wall !== '¤' || FL.floor !== 'floor_boss_volcano' || !'fc'.includes(FL.light) || [...FL.decor].some(c => !'ui'.includes(c))) fail('Gen.GUARDIANS.flame');
if (!Gen.ARENAS.includes('frost') || !Gen.ARENAS.includes('volcano')) fail('Gen.ARENAS saknar frost/volcano');
if (typeof Gen.secret !== 'function') fail('Gen.secret saknas');
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
  if (types.secret) { if (count(m, '*') + count(m, '{') !== 1) fail(tag + ' hemlig/sprucken vägg ' + count(m, '*') + '/' + count(m, '{')); } else if (count(m, '*') + count(m, '{') !== 0) fail(tag + ' * eller { utan hemligt rum');
  for (const w of WCH) if (count(m, w) !== (wchOf(opts.weapon) === w ? 1 : 0)) fail(tag + ` vapen ${w}: ${count(m, w)}`);
  const en = [...OLD_EN + NEW_EN].reduce((n, c) => n + count(m, c), 0), want = 6 + 3 * depth;
  if (en < want - 6 || en > Math.round(want * 1.3) + 2) fail(tag + ` fiender ${en} (väntat ca ${want})`);
  const st0 = B[biome] = B[biome] || { n: 0, ms: [], cells: 0, open: 0, px: 0, pxMin: 99, props: 0, secret: 0, areas: 0, sky: 0 };
  st0.enRel = (st0.enRel || 0) + (en + count(m, 'E') + count(m, 'Q')) / want;
  if (depth === 1 && [...'VIONRW'].some(c => count(m, c) > 0)) fail(tag + ' för svår fiende på djup 1');
  if (depth === 2 && [...'NRW'].some(c => count(m, c) > 0)) fail(tag + ' för svår fiende på djup 2');
  for (const c of NEW_EN) if (count(m, c) && (depth < NEW_DEPTH[c] || !NEW_BIOME[biome].includes(c))) fail(tag + ` ny fiende ${c} får inte finnas här (${count(m, c)})`);
  // elitfiender och vanliga fiender minst 7 rutor från P
  let px = 0, py = 0; m.forEach((r, y) => { const x = r.indexOf('P'); if (x >= 0) { px = x; py = y; } });
  m.forEach((r, y) => [...r].forEach((c, x) => { if ((ENEMIES + 'Z').includes(c) && Math.hypot(x - px, y - py) < 7) fail(tag + ` fiende ${c} ${Math.hypot(x - px, y - py).toFixed(1)} från P`); }));
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
  else if (rel < (biome === 'dungeon' || biome === 'frost' || biome === 'volcano' ? 0.5 : 0.8)) fail(tag + ` utgången för nära: ${dPX} steg (${rel.toFixed(2)} av kartbredden)`);
  // träd och gravstenar får aldrig stänga av något: ta bort dem och jämför nåbar yta (validate har redan kollat nåbarheten med dem)
  const s = B[biome];
  s.n++; s.cells += W * H; s.open += open / (W * H); s.px += rel; s.pxMin = Math.min(s.pxMin, rel); s.props += props; s.areas += lv.rooms.length;
  if (types.secret) s.secret++;
  if (lv.sky) s.sky += skyN / walk;
  for (const c of OLD_EN + NEW_EN) s['typ' + c] = (s['typ' + c] || 0) + count(m, c);
  checkRooms(lv, tag, s, px, py);
  checkNew(lv, tag, s, biome, px, py);
  checkV6(lv, tag, s, biome, px, py, depth);
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
    if (('ZMwyChaA$¥' + WCH).includes(c)) r.loot += c;
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
    if (!(rel >= 0.3)) fail(tag + ` vaktaren för nära start (${rel.toFixed(2)})`);
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
      const need = r.type === 'special' ? SP_CH[r.arch] : r.type === 'vault' ? LOOT : { shop: 'M', shrine: 'w', treasure: 'C', secret: 'CA', guardian: 'Z' }[r.type];
      if (!need || ![...need].some(c => q.chars.includes(c))) fail(tag + ` specialrum ${i} (${r.type}/${r.arch}) saknar ${need}`);
    } else if (q.en < 2) fail(tag + ` rum ${i} (${r.type}/${r.arch}) har ${q.en} fiender`);
    if (r.type !== 'guardian' && !q.props) fail(tag + ` rum ${i} (${r.type}/${r.arch}) saknar rekvisita`);
  });
  // spikfällor: aldrig på/intill P, x eller dörrar (även grindar, låsta dörrar och spruckna väggar)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = m[y][x];
    if (PROPS.includes(c)) s.propN[c] = (s.propN[c] || 0) + 1;
    if (c !== 'z') continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ('Px'.includes(m[y + dy][x + dx])) fail(tag + ` spikfälla intill ${m[y + dy][x + dx]} vid ${x},${y}`);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (DOORS.includes(m[y + dy][x + dx])) fail(tag + ` spikfälla i dörröppning vid ${x},${y}`);
  }
  // äkta kista finns alltid, mimics bara i rum med andra fiender
  if (count(m, 'C') < 1) fail(tag + ' ingen äkta kista');
  s.mimic = (s.mimic || 0) + count(m, 'Q');
  // rekvisitan stänger inte av något: med grindar/låsta dörrar/spruckna väggar stängda och utan att gå på lava eller spikar
  // nås alla gångbara rutor utom valven och hemliga rum; med allt öppet nås allt. Ingen blockerande sak står i en dörröppning.
  const closed = floodD(m, px, py, c => !isBlock(c) && c !== '_' && c !== 'z' && c !== '¬'), opened = floodD(m, px, py, c => (!isBlock(c) || GATES.includes(c)) && c !== '_' && c !== 'z' && c !== '¬');
  const anyway = floodD(m, px, py, c => !isBlock(c) || GATES.includes(c));
  const roomOf = (x, y) => lv.rooms[rm[y].charCodeAt(x) - 48];
  let bad = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = m[y][x], i = y * W + x;
    if (isBlock(c)) continue;
    const r = roomOf(x, y), opt = r && (r.type === 'vault' || r.type === 'secret');
    const hz = c === '_' || c === 'z' || c === '¬';
    if (anyway[i] < 0 || (!hz && opened[i] < 0) || (!hz && closed[i] < 0 && !opt)) bad++;
    if (closed[i] >= 0 && r && r.type === 'vault') fail(tag + ` valvet nås utan att öppna grinden/låset vid ${x},${y}`);
  }
  if (bad) fail(tag + ` ${bad} rutor nås inte (rekvisita, lava, spikar eller grindar stänger av)`);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (('kquvwyeHJT' + INTERACT + NPCS + V6BLOCK).includes(m[y][x]))
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (DOORS.includes(m[y + dy][x + dx])) fail(tag + ` ${m[y][x]} i dörröppning vid ${x},${y}`);
  // säker väg (utan lava och spikar) P->x och P->Z
  const X = findCh(m, 'x'), Zc = findCh(m, 'Z');
  if (!X || closed[X[1] * W + X[0]] < 0) fail(tag + ' ingen väg P->x utan lava/spikar');
  if (!Zc || ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => closed[(Zc[1] + dy) * W + Zc[0] + dx] >= 0)) fail(tag + ' ingen väg P->Z utan lava/spikar');
}

// nya saker (version 4): antal, tak, placering, valv med grindar och lås, farliga golv, specialrum
function checkNew(lv, tag, s, biome, px, py) {
  const m = lv.map, H = m.length, W = m[0].length, rm = lv.roomMask;
  const roomOf = (x, y) => lv.rooms[rm[y].charCodeAt(x) - 48];
  const n = {}; for (const r of m) for (const c of r) n[c] = (n[c] || 0) + 1;
  const N = c => n[c] || 0;
  // level.features stämmer med kartan
  if (!lv.features) fail(tag + ' level.features saknas');
  else for (const k in FEAT) if (lv.features[k] !== N(FEAT[k])) fail(tag + ` features.${k} = ${lv.features[k]}, kartan har ${N(FEAT[k])}`);
  // tak
  for (const c of INTERACT + "}'") if (N(c) > 1) fail(tag + ` ${N(c)} st ${c}`);
  if (N('<') > 4) fail(tag + ' pilplattor ' + N('<'));
  if (N('>') > 3) fail(tag + ' gasventiler ' + N('>'));
  if (N(',') < 1 || N(',') > 5) fail(tag + ' granatknippen ' + N(','));
  if (N('£') > 1 || N('€') > 1 || N('©') > 1 || N('¥') > 2 || N('Ç') > 8) fail(tag + ` tak: £${N('£')} €${N('€')} ©${N('©')} ¥${N('¥')} Ç${N('Ç')}`);
  if (!!N('|') !== !!N('/')) fail(tag + ` grindar ${N('|')} men spakar ${N('/')}`);
  if (!!N(']') !== !!N('}')) fail(tag + ` låsta dörrar ${N(']')} men nycklar ${N('}')}`);
  // valv: type vault med lock, ingångar bara | (spak) eller en ] (nyckel), inga fiender, något att hämta
  const vaults = lv.rooms.map((r, i) => [r, i]).filter(([r]) => r.type === 'vault');
  const vl = vaults.filter(([r]) => r.lock === 'lever').length, vk = vaults.filter(([r]) => r.lock === 'key').length;
  if (vl > 1 || vk > 1 || vl !== (N('/') ? 1 : 0) || vk !== (N('}') ? 1 : 0)) fail(tag + ` valv: spak ${vl}, lås ${vk}`);
  if (N(']') > 1) fail(tag + ' flera låsta dörrar');
  for (const [r, i] of vaults) {
    if (r.arch !== (r.lock === 'lever' ? 'levervault' : 'lockedvault')) fail(tag + ` valv ${i} har arch ${r.arch}`);
    let loot = 0, gates = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (rm[y].charCodeAt(x) - 48 !== i) continue;
      if (LOOT.includes(m[y][x])) loot++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy, c = m[yy][xx];
        if (rm[yy].charCodeAt(xx) - 48 === i || isWall(c)) continue;
        if (c !== (r.lock === 'lever' ? '|' : ']')) fail(tag + ` valv ${i} har ingången "${c}" vid ${xx},${yy}`); else gates++;
      }
    }
    if (!loot) fail(tag + ` valv ${i} är tomt`);
    if (!gates || (r.lock === 'key' && gates !== 1)) fail(tag + ` valv ${i} har ${gates} ingångar`);
  }
  s.feat = s.feat || {}; s.featN = s.featN || {}; s.vault = s.vault || { lever: 0, key: 0, pocket: 0 };
  for (const [r] of vaults) { s.vault[r.lock]++; if (r.w === 3 && r.h === 3 && r.tag === 'vault') s.vault.pocket++; }
  // placering
  const near = (x, y, ch, d) => { for (let yy = y - d; yy <= y + d; yy++) for (let xx = x - d; xx <= x + d; xx++) if (m[yy] && m[yy][xx] === ch) return true; return false; };
  const closed = floodD(m, px, py, c => !isBlock(c) && c !== '_' && c !== 'z' && c !== '¬');
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const c = m[y][x], r = roomOf(x, y);
    if (HAZ.includes(c) && (near(x, y, 'P', 1) || near(x, y, 'x', 1))) fail(tag + ` ${c} intill P/x vid ${x},${y}`);
    if (c === '<') {
      let ok = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let k = 1; k <= 6; k++) { const a = m[y + dy * k] && m[y + dy * k][x + dx * k]; if (a === undefined) break; if (isWall(a)) { ok = true; break; } if (isBlock(a)) break; }
      if (!ok) fail(tag + ` pilplatta utan vägg inom 6 vid ${x},${y}`);
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => DOORS.includes(m[y + dy][x + dx]))) fail(tag + ` pilplatta i dörröppning vid ${x},${y}`);
    }
    if ((INTERACT + NPCS).includes(c) && ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => closed[(y + dy) * W + x + dx] >= 0)) fail(tag + ` ${c} nås inte vid ${x},${y}`);
    if ('/}'.includes(c) && (!r || r.type === 'vault' || r.type === 'secret' || r.type === 'guardian')) fail(tag + ` ${c} ligger i ${r ? r.type : 'korridor'} vid ${x},${y}`);
    if (c === '}' && closed[y * W + x] < 0) fail(tag + ` nyckeln nås inte utan att öppna något vid ${x},${y}`);
    // nya tecken bara där de hör hemma
    const arch = r ? r.arch : '';
    if (c === '_' && !(biome === 'caves' && arch === 'lava') && !(biome === 'volcano' && r)) fail(tag + ` lava utanför lavarum (${arch}) vid ${x},${y}`);
    if (c === ':' && arch !== 'frozen' && !(biome === 'frost' && r)) fail(tag + ` is utanför frusna rum (${arch}) vid ${x},${y}`);
    // version 5: istappar bara i frostfästets rum (eller frusna rum), aldrig vid dörrar; NPC:er i sina rum, butiken eller specialrum;
    // husdjursburen i ett stridsrum; drycker i rum
    if (c === 'Ç') {
      if (!r || (biome !== 'frost' && arch !== 'frozen')) fail(tag + ` istapp i ${biome}/${arch} vid ${x},${y}`);
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => DOORS.includes(m[y + dy][x + dx]))) fail(tag + ` istapp i dörröppning vid ${x},${y}`);
      if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => isWall(m[y + dy][x + dx]))) fail(tag + ` istapp inte vid en vägg ${x},${y}`);
    }
    if ((c === '£' || c === '€') && (!r || !(r.type === 'shop' || (r.type === 'special' && r.arch !== 'challenge')))) fail(tag + ` NPC ${c} i ${r ? r.type + '/' + arch : 'korridor'} vid ${x},${y}`);
    if (c === '£' && r && r.type === 'special' && !['alchemy', 'fortune', 'offering', 'smithy', 'chapel2'].includes(arch)) fail(tag + ` alkemist i ${arch}`);
    if (c === '©' && (!r || !['normal', 'elite', 'exit'].includes(r.type))) fail(tag + ` husdjursbur i ${r && r.type}`);
    if (c === '¥' && !r) fail(tag + ` dryck utanför rum vid ${x},${y}`);
    if (NPCS.includes(c) && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => isBlock(m[y + dy][x + dx]))) fail(tag + ` ${c} har ingen fri sida vid ${x},${y}`);
    if (c === '-' && biome !== 'swamp' && !['flooded', 'mudflat'].includes(arch)) fail(tag + ` vatten i ${biome}/${arch} vid ${x},${y}`);
    if (c === '>' && arch !== 'gas' && biome !== 'caves' && biome !== 'swamp') fail(tag + ` gasventil i ${biome}/${arch} vid ${x},${y}`);
    if (c === '"' && !r) fail(tag + ` spindelväv utanför rum vid ${x},${y}`);
    if (c === '?' && (!r || r.arch !== 'challenge' || r.w < 7 || r.h < 7)) fail(tag + ` utmaningsaltare i ${arch} ${r && r.w}x${r && r.h}`);
    if (c === ')' && arch !== 'fortune') fail(tag + ` spåaltare i ${arch}`);
    if (c === ';' && arch !== 'offering') fail(tag + ` offerskål i ${arch}`);
    if (c === '(' && !['smithy', 'armory', 'camp', 'drill', 'storeroom', 'forge'].includes(arch)) fail(tag + ` städ i ${arch}`);
    if (c === '[' && (!r || !['normal', 'elite', 'exit'].includes(r.type))) fail(tag + ` fångbur i ${r && r.type}`);
    if (c === '+' && biome !== 'dungeon') fail(tag + ' levande rustning utanför fängelsehålan');
  }
  for (const k in FEAT) { s.feat[k] = (s.feat[k] || 0) + (N(FEAT[k]) ? 1 : 0); s.featN[k] = (s.featN[k] || 0) + N(FEAT[k]); }
  for (const c of ",'}") { s.feat[c] = (s.feat[c] || 0) + (N(c) ? 1 : 0); s.featN[c] = (s.featN[c] || 0) + N(c); }
  for (const c of WCH) s.wpn = (s.wpn || 0) + N(c);
  if (lv.rooms.some(r => r.type === 'secret')) s.secretN = (s.secretN || 0) + 1;
  // spindelbon har spindlar och väv, lavarum har lava, frusna rum is
  lv.rooms.forEach((r, i) => {
    let ch = '', free = 0;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (rm[y] && rm[y].charCodeAt(x) - 48 === i) { ch += m[y][x]; if (m[y][x] === '.' && Math.abs(x - px) + Math.abs(y - py) > 3) free++; }
    if (free < 6) return; // rummet är fullt (rekvisita, dörrpassager)
    if (r.arch === 'nest' && !ch.includes('"')) fail(tag + ` spindelbo ${i} utan väv`);
    if (r.arch === 'nest' && ['normal', 'exit'].includes(r.type) && !ch.includes('U')) fail(tag + ` spindelbo ${i} utan spindlar`);
    if (r.arch === 'frozen' && !ch.includes(':')) fail(tag + ` fruset rum ${i} utan is`);
    if (r.arch === 'flooded' && !ch.includes('-')) fail(tag + ` översvämmat rum ${i} utan vatten`);
    if (r.arch === 'frozenlake' && !ch.includes(':')) fail(tag + ` frusen sjö ${i} utan is`);
    if (r.arch === 'alchemy' && !ch.includes('£')) fail(tag + ` alkemistens rum ${i} utan alkemist`);
    if (r.arch === 'chapel2' && !ch.includes('€')) fail(tag + ` prästens kapell ${i} utan präst`);
  });
}

// version 6: nya tecken bara där de får finnas, taken, och smulande golv som aldrig är enda vägen
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function checkV6(lv, tag, s, biome, px, py, depth) {
  const m = lv.map, H = m.length, W = m[0].length, rm = lv.roomMask;
  const ri = (x, y) => (rm[y][x] === '-' ? -1 : rm[y].charCodeAt(x) - 48), roomOf = (x, y) => lv.rooms[ri(x, y)];
  const n = {}; for (const r of m) for (const c of r) n[c] = (n[c] || 0) + 1;
  const N = c => n[c] || 0;
  for (const c in V6CAP) if (N(c) > V6CAP[c]) fail(tag + ` för många ${c}: ${N(c)}`);
  if (N('µ') + N('ß') > 3) fail(tag + ` gift-/frosttunnor ${N('µ')}+${N('ß')}`);
  // startrummet och rummen som gränsar till det (bara korridorer/dörrar emellan)
  const si = lv.rooms.findIndex(r => r.type === 'start'), adj = new Set([si]);
  {
    const seen = new Uint8Array(W * H), st = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ri(x, y) === si) { seen[y * W + x] = 1; st.push(y * W + x); }
    while (st.length) {
      const c = st.pop(), x = c % W, y = (c / W) | 0;
      for (const [dx, dy] of N4) {
        const nx = x + dx, ny = y + dy, ni = ny * W + nx;
        if (seen[ni] || isWall(m[ny][nx])) continue;
        seen[ni] = 1;
        if (ri(nx, ny) < 0) st.push(ni); else adj.add(ri(nx, ny));
      }
    }
  }
  const nearDoor = (x, y) => N4.some(([dx, dy]) => DOORS.includes(m[y + dy][x + dx]));
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const c = m[y][x], r = ri(x, y) >= 0 ? roomOf(x, y) : null;
    if (!'¶®÷ðª°¬±¨ÞÑÆÐÝµß'.includes(c)) continue;
    if (c === '¶' && (!r || r.type !== 'special' || r.arch !== 'camp')) fail(tag + ` lägereld i ${r ? r.type + '/' + r.arch : 'korridor'} vid ${x},${y}`);
    if (c === '®' && (!r || !adj.has(ri(x, y)))) fail(tag + ` anslagstavla i ${r ? r.type : 'korridor'} som inte gränsar till start vid ${x},${y}`);
    if (c === '÷' && (!r || r.type !== 'secret')) fail(tag + ` hemlig trappa i ${r ? r.type : 'korridor'} vid ${x},${y}`);
    if (c === 'ð' && (!r || !['camp', 'barracks', 'forge'].includes(r.arch))) fail(tag + ` kött i ${r ? r.arch : 'korridor'} vid ${x},${y}`);
    if (c === 'ª' && !r) fail(tag + ` runsten utanför rum vid ${x},${y}`);
    if (c === '°') {
      if (biome !== 'dungeon' && biome !== 'volcano') fail(tag + ` eldstråle i ${biome}`);
      if (r && !N4.some(([dx, dy]) => isWall(m[y + dy][x + dx]))) fail(tag + ` eldstråle mitt i rummet vid ${x},${y}`);
    }
    if (c === '±' && (r || !((isWall(m[y - 1][x]) && isWall(m[y + 1][x])) || (isWall(m[y][x - 1]) && isWall(m[y][x + 1]))))) fail(tag + ` pendelblad utanför en smal korridor vid ${x},${y}`);
    if (c === '¨') {
      let ok = false;
      if (r) for (let yy = 1; yy < H - 1 && !ok; yy++) for (let xx = 1; xx < W - 1; xx++) if (ri(xx, yy) === ri(x, y) && N4.some(([dx, dy]) => '*{'.includes(m[yy + dy][xx + dx]))) { ok = true; break; }
      if (!ok) fail(tag + ` tryckplatta utan hemlig/sprucken vägg i rummet vid ${x},${y}`);
    }
    if ('°¬±¨'.includes(c) && nearDoor(x, y)) fail(tag + ` fälla ${c} i dörröppning vid ${x},${y}`);
    if (c === 'Þ' && (biome !== 'volcano' || !N4.some(([dx, dy]) => m[y + dy][x + dx] === '_'))) fail(tag + ` lavamask utan lava (${biome}) vid ${x},${y}`);
    if ('ÑÆÞÐÝ'.includes(c) && (!r || !['normal', 'elite', 'exit'].includes(r.type))) fail(tag + ` ny fiende ${c} i ${r ? r.type : 'korridor'}`);
  }
  // smulande golv: med ¬ som vägg (grindar stängda, ingen lava/spikar) nås x, vaktaren och varje ruta i alla rum utom valv och hemliga rum
  if (N('¬')) {
    const d = floodD(m, px, py, c => !isBlock(c) && c !== '¬' && c !== '_' && c !== 'z'), X = findCh(m, 'x'), Zc = findCh(m, 'Z');
    if (!X || d[X[1] * W + X[0]] < 0) fail(tag + ' smulande golv stänger av vägen P->x');
    if (Zc && !N4.some(([dx, dy]) => d[(Zc[1] + dy) * W + Zc[0] + dx] >= 0)) fail(tag + ' smulande golv stänger av vaktaren');
    const lost = new Set();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = m[y][x], r = ri(x, y) >= 0 ? roomOf(x, y) : null;
      if (!r || r.type === 'vault' || r.type === 'secret' || isBlock(c) || '¬_z'.includes(c)) continue;
      if (d[y * W + x] < 0) lost.add(ri(x, y));
    }
    if (lost.size) fail(tag + ` smulande golv stänger av rum ${[...lost].join(',')}`);
    s.crumbleOK = (s.crumbleOK || 0) + 1;
  }
}

// ---- fängelsehålan (samma kontroller som tidigare) ----
{
  const TOTAL = Math.max(300, +process.env.GEN_TEST_N || 0);
  let minRooms = 99, maxRooms = 0, rooms = 0;
  for (let i = 0; i < TOTAL; i++) {
    const depth = 1 + (i % 5), seed = (i % 3 === 0) ? 'seed-' + i : 1000 + i * 7919;
    const opts = { shop: i % 2 === 0, weapon: weaponOpts[(i >> 1) % weaponOpts.length], biome: 'dungeon' };
    const [lv, ms] = timed(() => Gen.floor(seed, depth, opts));
    const { tag, types } = checkLevel(lv, seed, depth, opts, 'dungeon');
    B.dungeon.ms.push(ms);
    const nMain = lv.rooms.length - (types.secret || 0) - lv.rooms.filter(r => r.type === 'vault' && r.tag === 'vault').length; // utan utmejslade valv
    if (nMain < 7 || nMain > 15) fail(tag + ' antal rum ' + lv.rooms.length);
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
const PER_BIOME = +process.env.GEN_TEST_N || 75; // GEN_TEST_N=300 för fler banor per biom
for (const biome of BIOME_IDS.slice(1)) {
  for (let i = 0; i < PER_BIOME; i++) {
    const depth = 1 + (i % 5), seed = (i % 3 === 0) ? biome + '-' + i : 2000 + i * 104729;
    // vulkanen med spelets opts: alltid vaktare, butik på position 2 och 4, vapen-id eller null
    const opts = biome === 'volcano' ? { biome, shop: i % 5 === 2 || i % 5 === 4, weapon: GAME_WEAPONS[i % GAME_WEAPONS.length], guardian: GUARD_IDS[i % GUARD_IDS.length] }
      : { biome, shop: i % 2 === 1, weapon: weaponOpts[(i >> 1) % weaponOpts.length], guardian: i % 4 === 3 ? undefined : GUARD_IDS[i % GUARD_IDS.length] };
    const [lv, ms] = timed(() => Gen.floor(seed, depth, opts));
    const { tag } = checkLevel(lv, seed, depth, opts, biome);
    B[biome].ms.push(ms);
    if (i % 5 === 0 && JSON.stringify(Gen.floor(seed, depth, opts)) !== JSON.stringify(lv)) fail(tag + ' inte deterministisk');
    if (biome === 'caves' && /[^8]/.test(lv.map.join('').replace(/[^1-9]/g, ''))) fail(tag + ' grottan har andra väggar än 8 (utom vaktarens)');
    if (opts.guardian && lv.guardian !== opts.guardian) fail(tag + ' opts.guardian ignoreras');
    if (biome === 'forest' && count(lv.map, 't') < 5) fail(tag + ' för få träd');
    const doors = count(lv.map, 'D') + count(lv.map, 'G') + count(lv.map, '|') + count(lv.map, ']');
    if (biome === 'graveyard' && (count(lv.map, 'n') < 15 || count(lv.map, '5') < 10 || doors < 2)) fail(tag + ' kyrkogården saknar gravar/kapell/kryptor');
    if (biome === 'courtyard' && doors < 6) fail(tag + ' för få dörrar på borggården');
    if (biome === 'swamp') {
      // träsket: vägg 0 runt om, mycket vatten, döda träd, hyddor med dörr, golv mossa/spänger
      let walk = 0; for (const r of lv.map) for (const c of r) if (!isBlock(c)) walk++;
      const wet = count(lv.map, '-') / walk;
      B.swamp.wet = (B.swamp.wet || 0) + wet;
      if (wet < 0.2 || wet > 0.6) fail(tag + ` vattenandel ${wet.toFixed(2)}`);
      if (lv.map[0].replace(/0/g, '') !== '' || lv.map.some(r => r[0] !== '0' || r[r.length - 1] !== '0')) fail(tag + ' kanten är inte 0');
      if (count(lv.map, 't') < 5) fail(tag + ' för få döda träd');
      if (lv.floors[0] !== 'floor_swamp' || !lv.floors.includes('floor_wood_planks')) fail(tag + ' golv ' + lv.floors.join());
      if (!lv.floorMask.some(r => r.includes(String(lv.floors.indexOf('floor_wood_planks'))))) fail(tag + ' inga spänger');
      if (!(lv.fog[1] > lv.fog[0] && lv.fog[1] > lv.fog[2])) fail(tag + ' dimman är inte grön ' + lv.fog);
      B.swamp.huts = (B.swamp.huts || 0) + lv.rooms.filter(r => r.tag === 'hut').length;
    }
    if (biome === 'frost') {
      // frostfästet: väggar av frusen sten Ø (vaktarens salar i sitt tecken), snögårdar under himlen, golv frusen sten/snö,
      // kall blåvit dimma, istappar högst 8 och bara intill väggar
      const m = lv.map, gw = GUARD[lv.guardian].wall, walls = new Set();
      for (const r of m) for (const c of r) if (isWall(c)) walls.add(c);
      for (const c of walls) if (c !== 'Ø' && c !== gw) fail(tag + ' frostfästet har väggen ' + c);
      if (m[0].replace(/Ø/g, '') !== '' || m.some(r => r[0] !== 'Ø' || r[r.length - 1] !== 'Ø')) fail(tag + ' kanten är inte Ø');
      if (lv.floors[0] !== 'floor_frost_stone' || !lv.floors.includes('floor_snow') || lv.floor !== 'floor_frost_stone') fail(tag + ' golv ' + lv.floors.join());
      if (!(lv.fog[2] > lv.fog[1] && lv.fog[1] > lv.fog[0] && lv.fog[0] >= 15)) fail(tag + ' dimman är inte kall blåvit ' + lv.fog);
      if (lv.theme !== 'frost' || lv.secretWall !== 'Ø' || typeof lv.ceil !== 'string') fail(tag + ' tema/hemlig vägg/tak');
      const snow = lv.floors.indexOf('floor_snow'), yards = lv.rooms.map((r, i) => [r, i]).filter(([r]) => r.tag === 'yard');
      if (!yards.length) fail(tag + ' inga gårdar');
      for (const [r, i] of yards) {
        let n = 0, sky = 0, sn = 0;
        for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (lv.roomMask[y].charCodeAt(x) - 48 === i) { n++; if (lv.sky[y][x] === '1') sky++; if (+lv.floorMask[y][x] === snow) sn++; }
        if (sky < n || sn < n * 0.6) fail(tag + ` gård ${i}: himmel ${sky}/${n}, snö ${sn}/${n}`);
      }
      // inomhus (utom gårdarna) är taket på
      lv.rooms.forEach((r, i) => { if (r.tag !== 'yard') for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (lv.roomMask[y].charCodeAt(x) - 48 === i && lv.sky[y][x] === '1') { fail(tag + ` himmel i salen ${i} (${r.arch})`); return; } });
      if (count(m, 'Ç') !== lv.features.icicles || count(m, 'Ç') > 8) fail(tag + ' istappar ' + count(m, 'Ç'));
      if (opts.guardian === 'frost' && count(m, '¦') < 30) fail(tag + ' frostväktarens sal saknar isväggar ¦');
      const st = B.frost; st.yards = (st.yards || 0) + yards.length; st.ice = (st.ice || 0) + count(m, ':'); st.icic = (st.icic || 0) + count(m, 'Ç');
      for (const r of lv.rooms) if (r.arch === 'throne') st.throne = (st.throne || 0) + 1;
    }
    if (biome === 'volcano') {
      // vulkanen: väggar av obsidian Ò (vaktarens salar i sitt tecken), askfält under röd himmel, golv basalt/aska, röd dimma,
      // lava i rummen (aldrig enda vägen), lavamaskar vid lavan
      const m = lv.map, gw = GUARD[lv.guardian].wall, walls = new Set();
      for (const r of m) for (const c of r) if (isWall(c)) walls.add(c);
      for (const c of walls) if (c !== 'Ò' && c !== gw) fail(tag + ' vulkanen har väggen ' + c);
      if (m[0].replace(/Ò/g, '') !== '' || m.some(r => r[0] !== 'Ò' || r[r.length - 1] !== 'Ò')) fail(tag + ' kanten är inte Ò');
      if (lv.floors[0] !== 'floor_basalt' || !lv.floors.includes('floor_ash') || lv.floor !== 'floor_basalt' || lv.ceil !== 'floor_basalt') fail(tag + ' golv/tak ' + lv.floors.join() + ' ' + lv.ceil);
      if (!(lv.fog[0] > lv.fog[1] && lv.fog[1] >= lv.fog[2] && lv.fog[0] >= 28)) fail(tag + ' dimman är inte röd ' + lv.fog);
      if (lv.theme !== 'volcano' || lv.secretWall !== 'Ò') fail(tag + ' tema/hemlig vägg');
      if (!/^(ASKFÄSTET|DEN BRINNANDE SMEDJAN|MAGMAKAMRARNA|OBSIDIANHALLARNA|ASKFÄLTEN|ELDBERGETS HJÄRTA)$/.test(lv.name)) fail(tag + ' namn ' + lv.name);
      const ash = lv.floors.indexOf('floor_ash'), yards = lv.rooms.map((r, i) => [r, i]).filter(([r]) => r.tag === 'yard');
      if (!yards.length) fail(tag + ' inga askfält');
      for (const [r, i] of yards) {
        let n = 0, sky = 0, an = 0;
        for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (lv.roomMask[y].charCodeAt(x) - 48 === i) { n++; if (lv.sky[y][x] === '1') sky++; if (+lv.floorMask[y][x] === ash) an++; }
        if (sky < n || an < n * 0.6) fail(tag + ` askfält ${i}: himmel ${sky}/${n}, aska ${an}/${n}`);
      }
      lv.rooms.forEach((r, i) => { if (r.tag !== 'yard') for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (lv.roomMask[y].charCodeAt(x) - 48 === i && lv.sky[y][x] === '1') { fail(tag + ` himmel i salen ${i} (${r.arch})`); return; } });
      if (count(m, ':') || count(m, 'Ç') || count(m, '-')) fail(tag + ' is/istappar/vatten i vulkanen');
      if (opts.guardian === 'flame' && count(m, '¤') < 30) fail(tag + ' flamväktarens sal saknar väggar ¤');
      if (count(m, '_') < 8) fail(tag + ' för lite lava ' + count(m, '_'));
      const st = B.volcano;
      st.yards = (st.yards || 0) + yards.length; st.lavaN = (st.lavaN || 0) + count(m, '_'); st.lavaL = (st.lavaL || 0) + (count(m, '_') ? 1 : 0);
      st.worms = (st.worms || 0) + count(m, 'Þ'); st.wormL = (st.wormL || 0) + (count(m, 'Þ') ? 1 : 0);
      st.bridges = (st.bridges || 0) + lv.map.reduce((k, r, y) => k + [...r].filter((c, x) => c !== '_' && !isWall(c) && y > 0 && y < m.length - 1 && ((m[y - 1][x] === '_' && m[y + 1][x] === '_') || (r[x - 1] === '_' && r[x + 1] === '_'))).length, 0);
    }
    if (!samples[biome]) samples[biome] = lv;
  }
}

// ---- NPC:er, husdjursbur, drycker och nya vapen: frekvenser över alla biomer ----
{
  let n = 0; const f = { alchemist: 0, priest: 0, petcage: 0, potions: 0, icicles: 0 }, fn = { potions: 0 };
  for (const id of BIOME_IDS) { const s = B[id]; n += s.n; for (const k in f) f[k] += s.feat[k] || 0; fn.potions += s.featN.potions || 0; }
  const pc = k => f[k] / n;
  if (pc('alchemist') < 0.18 || pc('alchemist') > 0.42) fail('alkemist på ' + (100 * pc('alchemist')).toFixed(0) + ' % av banorna (väntat ~30 %)');
  if (pc('priest') < 0.14 || pc('priest') > 0.36) fail('präst på ' + (100 * pc('priest')).toFixed(0) + ' % av banorna (väntat ~25 %)');
  if (pc('petcage') < 0.07 || pc('petcage') > 0.25) fail('husdjursbur på ' + (100 * pc('petcage')).toFixed(0) + ' % av banorna (väntat ~15 %)');
  if (fn.potions / n < 0.3 || fn.potions / n > 1.6) fail('drycker per bana ' + (fn.potions / n).toFixed(2));
  if ((B.frost.feat.icicles || 0) < B.frost.n * 0.8) fail('för få frostbanor med istappar ' + B.frost.feat.icicles);
  stats.npc = Object.keys(f).map(k => `${k} ${(100 * pc(k)).toFixed(0)} %`).join(', ') + `, drycker ${(fn.potions / n).toFixed(2)} per bana`;
  // de nya vapnen går att lägga ut i alla biomer (tecken och id)
  for (const id of BIOME_IDS) for (const w of ['å', 'ä', 'ö', 'axe', 'launcher', 'é', 'ü', 'ñ', 'nailgun', 'staff', 'bow']) {
    const lv = Gen.floor('wpn-' + id + w, 3, { biome: id, weapon: w });
    if (count(lv.map, wchOf(w)) !== 1) fail(`[${id}] vapnet ${w} lades inte ut`);
  }
}

// ---- version 6: frekvenser för de nya sakerna över alla biomer, och per biom där de hör hemma ----
{
  let n = 0; const f = {};
  const K6 = ['campfire', 'questboard', 'secretstairs', 'runes', 'meat', 'firejets', 'crumble', 'pendulums', 'plates', 'poisonbarrels', 'frostbarrels'];
  for (const id of BIOME_IDS) { const s = B[id]; n += s.n; for (const k of K6) f[k] = (f[k] || 0) + (s.feat[k] || 0); }
  const pc = k => f[k] / n, share = (id, k) => (B[id].feat[k] || 0) / B[id].n, avgN = (id, k) => (B[id].featN[k] || 0) / B[id].n;
  if (pc('campfire') < 0.15 || pc('campfire') > 0.35) fail('lägereld på ' + (100 * pc('campfire')).toFixed(0) + ' % av banorna (väntat ~25 %)');
  if (pc('questboard') < 0.2 || pc('questboard') > 0.4) fail('anslagstavla på ' + (100 * pc('questboard')).toFixed(0) + ' % av banorna (väntat ~30 %)');
  if (pc('secretstairs') < 0.08 || pc('secretstairs') > 0.24) fail('hemlig trappa på ' + (100 * pc('secretstairs')).toFixed(0) + ' % av banorna (väntat ~15 %)');
  if (pc('runes') < 0.25 || pc('runes') > 0.45) fail('runsten på ' + (100 * pc('runes')).toFixed(0) + ' % av banorna (väntat ~35 %)');
  if (share('volcano', 'firejets') < 0.8 || share('volcano', 'crumble') < 0.8 || share('volcano', 'lava') < 0.9) fail(`vulkanen: eldstrålar ${share('volcano', 'firejets')}, smulande golv ${share('volcano', 'crumble')}, lava ${share('volcano', 'lava')}`);
  if (B.volcano.wormL < B.volcano.n * 0.9) fail('för få vulkanbanor med lavamaskar ' + B.volcano.wormL);
  // vulkanen precis som spelet anropar den (seed RNG.hash(...), alltid vaktare, butik på position 2/4, vapen-id eller null)
  {
    let lo = 0, noWorm = 0, lava = 0; const N = 120;
    for (let i = 0; i < N; i++) {
      const pos = i % 5, cyc = i % 3, opts = { shop: pos === 2 || pos === 4, weapon: GAME_WEAPONS[i % GAME_WEAPONS.length], biome: 'volcano', guardian: GUARD_IDS[i % GUARD_IDS.length] };
      const lv = Gen.floor(RNG.hash('run' + i + ':' + pos), Math.min(5, pos + 1 + cyc), opts), m = lv.map;
      for (const e of Gen.validate(lv)) fail(`[volcano spel ${i}] ${e}`);
      const nl = count(m, '_'); lava += nl;
      if (nl < 8) lo++;
      if (!count(m, 'Þ')) noWorm++;
    }
    if (lo) fail(`vulkanen med spelets opts: ${lo} av ${N} banor har under 8 lavarutor`);
    if (noWorm > N * 0.05) fail(`vulkanen med spelets opts: ${noWorm} av ${N} banor saknar lavamaskar`);
    stats.volcGame = `lava ${(lava / N).toFixed(1)} rutor per bana, utan lavamask ${noWorm}/${N}`;
  }
  for (const id of BIOME_IDS) if (id !== 'volcano' && id !== 'swamp' && avgN(id, 'poisonbarrels') >= avgN('volcano', 'poisonbarrels')) fail(`gifttunnor: ${id} har fler än vulkanen`);
  for (const id of BIOME_IDS) if (id !== 'frost' && avgN(id, 'frostbarrels') >= avgN('frost', 'frostbarrels')) fail(`frosttunnor: ${id} har fler än frostfästet`);
  for (const id of ['caves', 'graveyard', 'forest', 'courtyard', 'swamp', 'frost']) if (B[id].feat.firejets) fail('eldstrålar i ' + id);
  stats.v6 = K6.map(k => `${k} ${(100 * pc(k)).toFixed(0)} %`).join(', ');
  let crumbleL = 0; for (const id of BIOME_IDS) crumbleL += B[id].crumbleOK || 0;
  stats.crumble = crumbleL;
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
  if (seen.dungeon < 270 || seen.dungeon > 500) fail('fängelsehålan valdes ' + seen.dungeon + ' av 1000 gånger');
  if (seen.volcano < 50 || seen.volcano > 150) fail('vulkanen valdes ' + seen.volcano + ' av 1000 gånger');
  stats.mix = BIOME_IDS.map(id => id + '=' + (seen[id] || 0)).join(' ');
  if (Gen.floor(5, 3, { theme: 'kapell' }).biome !== 'dungeon') fail('opts.theme ska ge fängelsehålan');
}

// ---- bossarenor ----
const bossMs = {};
for (const arena of ['hall', 'graveyard', 'cave', 'forest', 'swamp', 'frost', 'volcano']) {
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
    if (!lv.features || lv.features.water !== count(m, '-')) fail(tag + ' level.features');
    m.forEach((r, y) => [...r].forEach((c, x) => { if (HAZ.includes(c) && [-1, 0, 1].some(dy => [-1, 0, 1].some(dx => 'PxB'.includes((m[y + dy] || '')[x + dx])))) fail(tag + ` ${c} intill P/x/B vid ${x},${y}`); }));
    if (arena === 'swamp' && count(m, '-') < 30) fail(tag + ' för lite vatten i träskarenan ' + count(m, '-'));
    if (arena === 'frost') { // ishallen: frusen sjö i mitten, pelare av Ø, istappar, inomhus, snö och frusen sten
      if (count(m, ':') < 30 || m[14][12] !== ':' && m[14][12] !== 'h' && m[14][12] !== 'a') fail(tag + ' ingen frusen sjö i mitten ' + count(m, ':'));
      if (count(m, 'Ø') < 60 + 8) fail(tag + ' för få pelare av Ø');
      if (count(m, 'Ç') < 2 || count(m, 'Ç') > 8 || lv.features.icicles !== count(m, 'Ç')) fail(tag + ' istappar ' + count(m, 'Ç'));
      if (lv.floors[0] !== 'floor_frost_stone' || lv.floors[1] !== 'floor_snow' || lv.biome !== 'frost') fail(tag + ' golv/biom ' + lv.floors + ' ' + lv.biome);
    }
    if (arena === 'volcano') { // obsidianhallen: vallgrav av lava runt den fria mitten, fyra broar, pelare av Ò, inomhus, basalt och aska
      if (count(m, '_') < 40) fail(tag + ' för lite lava i vallgraven ' + count(m, '_'));
      for (let y = 10; y <= 18; y++) for (let x = 8; x <= 16; x++) if (m[y][x] === '_') fail(tag + ` lava i mitten vid ${x},${y}`);
      for (const [x, y, what] of [[12, 8, 'norr'], [12, 9, 'norr'], [12, 20, 'söder'], [12, 21, 'söder'], [5, 14, 'väster'], [6, 14, 'väster'], [18, 14, 'öster'], [19, 14, 'öster']])
        if (m[y][x] === '_' || isBlock(m[y][x])) fail(tag + ` bron i ${what} är stängd vid ${x},${y} (${m[y][x]})`);
      let ring = 0; for (let y = 8; y <= 21; y++) for (let x = 5; x <= 19; x++) if (m[y][x] === '_') ring++;
      if (ring !== count(m, '_')) fail(tag + ' lava utanför vallgraven');
      if (count(m, 'Ò') < 60 + 8) fail(tag + ' för få pelare av Ò');
      if (lv.floors[0] !== 'floor_basalt' || lv.floors[1] !== 'floor_ash' || lv.biome !== 'volcano' || lv.sky !== null || lv.ceil !== 'floor_basalt') fail(tag + ' golv/biom/tak ' + lv.floors + ' ' + lv.biome);
      if (count(m, '¶')) fail(tag + ' lägereld i bossarenan');
    }
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
      const outdoor = arena !== 'cave' && arena !== 'frost' && arena !== 'volcano';
      if (!!lv.sky !== outdoor) fail(tag + ' sky');
      const wall = { graveyard: '7', cave: '8', forest: '6', swamp: '0', frost: 'Ø', volcano: 'Ò' }[arena];
      if (m[0][0] !== wall) fail(tag + ' väggtecken ' + m[0][0]);
      if (outdoor && count(m, 'n') + count(m, 't') < 4) fail(tag + ' för lite skydd');
    }
    if (!samples['boss:' + arena]) samples['boss:' + arena] = lv;
  }
}

// ---- hemliga skattvåningar (Gen.secret): alla utseenden ----
const secretMs = [];
{
  const looks = [undefined].concat(BIOME_IDS), names = new Set();
  for (let i = 0; i < 90; i++) {
    const biome = looks[i % looks.length], seed = i % 2 ? 'sec' + i : 9000 + i * 13, opts = biome ? { biome, depth: 1 + (i % 5) } : {};
    const [lv, ms] = timed(() => Gen.secret(seed, opts));
    secretMs.push(ms);
    const tag = `[secret ${biome || '(standard)'} seed=${seed}]`, m = lv.map;
    for (const e of Gen.validate(lv)) fail(tag + ' ' + e);
    if (lv.biome !== (biome || 'dungeon') || !lv.secret || typeof lv.name !== 'string' || lv.sky !== null) fail(tag + ' fält ' + lv.biome);
    names.add(lv.name);
    if (!Array.isArray(lv.floorMask) || !Array.isArray(lv.roomMask) || !lv.features || lv.floors[0] !== lv.floor) fail(tag + ' masker/features');
    for (const k in FEAT) if (lv.features[k] !== count(m, FEAT[k])) fail(tag + ' features.' + k);
    const types = lv.rooms.map(r => r.type);
    if (types.length < 2 || types.length > 4 || types[0] !== 'start' || types[types.length - 1] !== 'exit' || types.slice(1, -1).some(t => t !== 'treasure')) fail(tag + ' rum ' + types.join());
    if (count(m, 'C') < 2 || count(m, 'C') > 4 || count(m, '$') < 3 || count(m, 'ª') !== 1 || count(m, 'E') < 1 || count(m, 'E') > 3 || count(m, 'P') !== 1 || count(m, 'x') !== 1)
      fail(tag + ` innehåll C${count(m, 'C')} $${count(m, '$')} ª${count(m, 'ª')} E${count(m, 'E')}`);
    if ([...OLD_EN + NEW_EN + 'QZB'].some(c => count(m, c)) || [...HAZ].some(c => count(m, c))) fail(tag + ' vanliga fiender eller fällor på den hemliga våningen');
    for (const r of m) for (const c of r) if (isWall(c) && c !== lv.secretWall) { fail(tag + ' väggen ' + c); break; }
    const P = findCh(m, 'P');
    m.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'E' && Math.hypot(x - P[0], y - P[1]) < 7) fail(tag + ' elit för nära P'); }));
    if (pathPX(m) < 0) fail(tag + ' ingen väg P->x');
    const d = floodD(m, P[0], P[1], c => !isBlock(c));
    m.forEach((r, y) => [...r].forEach((c, x) => { if ('CE$ª'.includes(c) && d[y * r.length + x] < 0) fail(tag + ` ${c} nås inte vid ${x},${y}`); }));
    if (JSON.stringify(Gen.secret(seed, opts)) !== JSON.stringify(lv)) fail(tag + ' inte deterministisk');
    if (!samples['secret:' + lv.biome]) samples['secret:' + lv.biome] = lv;
  }
  if (Gen.secret(1).biome !== 'dungeon' || Gen.secret(1, { biome: 'nope' }).biome !== 'dungeon') fail('Gen.secret: standardutseendet är inte dungeon');
  if (names.size < 8) fail('Gen.secret: för få namn ' + [...names].join());
  stats.secretNames = [...names].slice(0, 6).join(', ');
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
  if (!hack(bad, l => { l.map[3] = l.map[3].slice(0, 2) + '££' + l.map[3].slice(4); })) fail('validate: två alkemister ej upptäckt');
  if (!hack(bad, l => { const y = l.map.findIndex(r => r.includes('P')), x = l.map[y].indexOf('P'); l.map[y] = l.map[y].slice(0, x + 1) + 'Ç' + l.map[y].slice(x + 2); })) fail('validate: istapp intill P ej upptäckt');
  if (!hack(bad, l => { l.map[3] = l.map[3].slice(0, 2) + 'ÿ' + l.map[3].slice(3); })) fail('validate: okänt tecken ej upptäckt');
  if (!hack(out, l => { l.floors = ['floor_mud']; })) fail('validate: floors[0] != floor ej upptäckt');
  // version 6: tak, hemlig trappa utanför hemligt rum, pendelblad mitt i ett rum, lavamask utan lava, ¬ som enda vägen
  const msg = (lv, f, re) => { const l = JSON.parse(JSON.stringify(lv)); f(l); return Gen.validate(l).some(e => re.test(e)); };
  // en fri golvruta mitt i ett vanligt rum (inga väggar runt om, minst 2 från P, rummet har ingen hemlig vägg)
  const startDot = l => {
    const P = findCh(l.map, 'P'), m = l.map, ri = (x, y) => l.roomMask[y].charCodeAt(x) - 48;
    const secretRoom = k => m.some((r, y) => [...r].some((c, x) => ri(x, y) === k && N4.some(([dx, dy]) => '*{'.includes(m[y + dy][x + dx]))));
    for (let y = 1; y < m.length - 1; y++) for (let x = 1; x < m[0].length - 1; x++) {
      if (m[y][x] !== '.' || l.roomMask[y][x] === '-' || Math.max(Math.abs(x - P[0]), Math.abs(y - P[1])) < 2) continue;
      if (!['start', 'normal', 'elite', 'exit'].includes(l.rooms[ri(x, y)].type) || N4.some(([dx, dy]) => isBlock(m[y + dy][x + dx]))) continue;
      if (!secretRoom(ri(x, y))) return [x, y];
    }
    return null;
  };
  const putCh = (l, [x, y], ch) => { l.map[y] = l.map[y].slice(0, x) + ch + l.map[y].slice(x + 1); };
  if (!msg(bad, l => { l.map[3] = l.map[3].slice(0, 2) + '¶¶' + l.map[3].slice(4); }, /lägereldar/)) fail('validate: två lägereldar ej upptäckt');
  if (!msg(bad, l => { l.map[3] = l.map[3].slice(0, 2) + 'µßµß' + l.map[3].slice(6); }, /tunnor/)) fail('validate: fyra tunnor ej upptäckt');
  if (!startDot(bad)) fail('validate-test: ingen fri ruta i ett vanligt rum');
  else {
    if (!msg(bad, l => putCh(l, startDot(l), '÷'), /hemlig trappa utanför/)) fail('validate: hemlig trappa utanför hemligt rum ej upptäckt');
    if (!msg(bad, l => putCh(l, startDot(l), '±'), /pendelblad/)) fail('validate: pendelblad mitt i rummet ej upptäckt');
    if (!msg(bad, l => putCh(l, startDot(l), 'Þ'), /lavamask/)) fail('validate: lavamask utan lava ej upptäckt');
    if (!msg(bad, l => putCh(l, startDot(l), '¨'), /tryckplatta/)) fail('validate: tryckplatta utan hemlig vägg ej upptäckt');
  }
  { // smulande golv i en dörr-/korridorruta som är enda vägen: validate säger att något bara nås över lava/¬
    let found = false;
    for (let sd = 1; sd <= 12 && !found; sd++) {
    const lv0 = Gen.floor(sd, 1 + (sd % 5), { biome: 'dungeon' }), m = lv0.map;
    for (let y = 1; y < m.length - 1 && !found; y++) for (let x = 1; x < m[0].length - 1 && !found; x++) {
      if (m[y][x] !== '.' || lv0.roomMask[y][x] !== '-') continue;
      const ew = isWall(m[y - 1][x]) && isWall(m[y + 1][x]), ns = isWall(m[y][x - 1]) && isWall(m[y][x + 1]);
      if (!ew && !ns) continue;
      const l = JSON.parse(JSON.stringify(lv0)); putCh(l, [x, y], '¬');
      const reach = mm => floodD(mm, ...findCh(mm, 'P'), c => !isBlock(c) && c !== '¬' && c !== '_' && c !== 'z').reduce((k, v) => k + (v >= 0 ? 1 : 0), 0);
      if (reach(l.map) >= reach(m) - 1) continue; // inte enda vägen till något
      found = true;
      if (!Gen.validate(l).some(e => /lava\/spikar/.test(e))) fail('validate: smulande golv som enda vägen ej upptäckt');
    }
    }
    if (!found) fail('validate-test: hittade ingen korridorruta som är enda vägen');
  }
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
console.log('Fiendesorter (alla biomer): ' + [...OLD_EN + NEW_EN].map(c => c + '=' + BIOME_IDS.reduce((n, id) => n + (B[id]['typ' + c] || 0), 0)).join(' '));
console.log('Fiendemix per biom (andel av vanliga fiender, %):');
for (const id of BIOME_IDS) { const s = B[id], tot = [...OLD_EN + NEW_EN].reduce((n, c) => n + (s['typ' + c] || 0), 0); console.log(`  ${id.padEnd(10)} ` + [...OLD_EN + NEW_EN].filter(c => s['typ' + c]).map(c => c + '=' + (100 * s['typ' + c] / tot).toFixed(0)).join(' ') + `   nya ${(100 * [...NEW_EN].reduce((n, c) => n + (s['typ' + c] || 0), 0) / tot).toFixed(0)} %`); }
console.log('Nya saker per biom (andel banor med saken %, snitt antal per bana):');
const FK = Object.keys(FEAT).concat([',', "'", '}']);
for (const id of BIOME_IDS) { const s = B[id]; console.log(`  ${id.padEnd(10)} ` + FK.map(k => `${k}=${(100 * (s.feat[k] || 0) / s.n).toFixed(0)}%/${((s.featN[k] || 0) / s.n).toFixed(1)}`).join(' ')); }
console.log('Valv (antal): ' + BIOME_IDS.map(id => `${id} spak ${B[id].vault.lever} lås ${B[id].vault.key} (utmejslade ${B[id].vault.pocket})`).join(', '));
console.log(`Träsket: vattenandel ${(100 * B.swamp.wet / B.swamp.n).toFixed(0)} % av gångbara rutor, hyddor ${(B.swamp.huts / B.swamp.n).toFixed(1)} per bana`);
console.log(`Frostfästet: gårdar ${(B.frost.yards / B.frost.n).toFixed(1)} per bana, is ${(B.frost.ice / B.frost.n).toFixed(0)} rutor, istappar ${(B.frost.icic / B.frost.n).toFixed(1)}, istronsalar ${B.frost.throne || 0}`);
console.log(`Vulkanen: askfält ${(B.volcano.yards / B.volcano.n).toFixed(1)} per bana, lava ${(B.volcano.lavaN / B.volcano.n).toFixed(0)} rutor (på ${(100 * B.volcano.lavaL / B.volcano.n).toFixed(0)} %), broar ${(B.volcano.bridges / B.volcano.n).toFixed(1)} rutor, lavamaskar ${(B.volcano.worms / B.volcano.n).toFixed(1)} (på ${(100 * B.volcano.wormL / B.volcano.n).toFixed(0)} %)`);
console.log('Vulkanen med spelets opts (vaktare, butik, vapen): ' + stats.volcGame);
console.log('Version 6 (andel banor, alla biomer): ' + stats.v6 + `; smulande golv kontrollerat med ¬ som vägg på ${stats.crumble} banor`);
console.log(`Hemliga våningar: 90 st, snitt ${avg(secretMs).toFixed(2)} ms, t.ex. ${stats.secretNames}`);
console.log('NPC:er m.m. (andel banor, alla biomer): ' + stats.npc);
console.log('\nFiender per rum (alla rum utom start: antal fiender -> antal rum):');
for (const id of BIOME_IDS) { const h = B[id].hist; console.log(`  ${id.padEnd(10)} ` + Object.keys(h).sort((a, b) => a - b).map(k => k + ':' + h[k]).join(' ') + `   fiender/budget ${(B[id].enRel / B[id].n).toFixed(2)}  mimics ${B[id].mimic}  P->Z ${(B[id].gdist / B[id].n).toFixed(2)} (min ${B[id].gmin.toFixed(2)}) av längsta vägen`); }
console.log('Rekvisita per bana:');
for (const id of BIOME_IDS) { const p = B[id].propN; console.log(`  ${id.padEnd(10)} ` + [...PROPS].filter(c => p[c]).map(c => c + '=' + (p[c] / B[id].n).toFixed(1)).join(' ')); }
console.log('Rumstyper (antal):');
for (const id of BIOME_IDS) { const a = B[id].arch; console.log(`  ${id.padEnd(10)} ` + Object.keys(a).sort((u, v) => a[v] - a[u]).map(k => k + '=' + a[k]).join(' ')); }
console.log('Slumpad biom (1000 st): ' + stats.mix);
console.log('Bossarenor 7 x 30: ' + Object.entries(bossMs).map(([k, v]) => `${k} ${(v / 30).toFixed(2)} ms`).join(', '));
console.log(`Omförsök i generatorn: ${Gen.floor.stats.retries - stats.retries0}`);
if (failures) { console.log(`\n${failures} FEL`); process.exit(1); }
console.log('\nALLA TESTER OK');
