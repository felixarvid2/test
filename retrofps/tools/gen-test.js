'use strict';
// Testar bangeneratorn: node tools/gen-test.js
// Genererar 300 banor + 50 bossarenor, validerar alla och avslutar med exit 1 vid fel.
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
const stats = { n: 0, ms: 0, maxMs: 0, secret: 0, rooms: 0, maxRoomsSeen: 0, minRooms: 99, enemies: 0, retries0: Gen.floor.stats.retries, bydepth: {} };
const samples = {};
const TOTAL = 300;
for (let i = 0; i < TOTAL; i++) {
  const depth = 1 + (i % 5), seed = (i % 3 === 0) ? 'seed-' + i : 1000 + i * 7919;
  const opts = { shop: i % 2 === 0, weapon: weaponOpts[(i >> 1) % weaponOpts.length] };
  const t0 = process.hrtime.bigint();
  const lv = Gen.floor(seed, depth, opts);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  stats.n++; stats.ms += ms; stats.maxMs = Math.max(stats.maxMs, ms);
  const tag = `[seed=${seed} d=${depth} ${JSON.stringify(opts)}]`;
  for (const e of Gen.validate(lv)) fail(tag + ' ' + e);
  const m = lv.map, H = m.length, W = m[0].length;
  const lim = 30 + (depth - 1) * 3 + 2;
  if (W < 30 + (depth - 1) * 3 || W > Math.min(44, lim) || H < 30 + (depth - 1) * 3 || H > Math.min(44, lim)) fail(tag + ` kartstorlek ${W}x${H}`);
  const types = {}; for (const r of lv.rooms) types[r.type] = (types[r.type] || 0) + 1;
  const nMain = lv.rooms.length - (types.secret || 0);
  if (nMain < 7 || lv.rooms.length > 14) fail(tag + ' antal rum ' + lv.rooms.length);
  stats.rooms += lv.rooms.length; stats.minRooms = Math.min(stats.minRooms, lv.rooms.length); stats.maxRoomsSeen = Math.max(stats.maxRoomsSeen, lv.rooms.length);
  if (types.start !== 1 || types.exit !== 1 || types.treasure !== 1) fail(tag + ' rumstyper ' + JSON.stringify(types));
  if ((types.shop || 0) !== (opts.shop ? 1 : 0)) fail(tag + ' shop-rum ' + (types.shop || 0));
  if ((types.elite || 0) < 1 || (types.elite || 0) > 1 + Math.floor(depth / 2)) fail(tag + ' elitrum ' + (types.elite || 0));
  if (count(m, 'E') !== (types.elite || 0)) fail(tag + ' antal E=' + count(m, 'E') + ' elitrum=' + types.elite);
  if (count(m, 'M') !== (opts.shop ? 1 : 0)) fail(tag + ' antal M ' + count(m, 'M'));
  if (count(m, 'C') < 1) fail(tag + ' kortkista saknas');
  if (types.secret) { stats.secret++; if (count(m, '*') !== 1) fail(tag + ' hemlig vägg ' + count(m, '*')); } else if (count(m, '*') !== 0) fail(tag + ' * utan hemligt rum');
  for (const w of 'grmdbsp') if (count(m, w) !== (opts.weapon === w ? 1 : 0)) fail(tag + ` vapen ${w}: ${count(m, w)}`);
  const en = [...'SKVILNORW'].reduce((n, c) => n + count(m, c), 0), want = 6 + 3 * depth;
  if (en < want - 6 || en > want + 3) fail(tag + ` fiender ${en} (väntat ca ${want})`);
  if (depth === 1 && [...'VIONRW'].some(c => count(m, c) > 0)) fail(tag + ' för svår fiende på djup 1');
  if (depth === 2 && [...'NRW'].some(c => count(m, c) > 0)) fail(tag + ' för svår fiende på djup 2');
  for (const c of 'SKVILNORW') stats['typ' + c] = (stats['typ' + c] || 0) + count(m, c);
  stats.enemies += en;
  const gold = count(m, '$'), pots = count(m, 'o'), nf = count(m, 'f');
  if (gold < 3 || gold > 8) fail(tag + ' guld ' + gold);
  if (pots < 1 || pots > 8) fail(tag + ' krukor ' + pots);
  if (nf < 1) fail(tag + ' inga eldfat');
  if (!(lv.ambient >= 0.12 && lv.ambient <= 0.22)) fail(tag + ' ambient ' + lv.ambient);
  // determinism
  if (i % 5 === 0) { const again = Gen.floor(seed, depth, opts); if (JSON.stringify(again) !== JSON.stringify(lv)) fail(tag + ' inte deterministisk'); }
  if (!samples[depth]) samples[depth] = lv;
  (stats.bydepth[depth] = stats.bydepth[depth] || []).push(ms);
}

// ---- boss ----
let bossMs = 0;
for (let i = 0; i < 50; i++) {
  const seed = i % 2 ? 'boss' + i : 500 + i * 31;
  const t0 = process.hrtime.bigint();
  const lv = Gen.boss(seed, {});
  bossMs += Number(process.hrtime.bigint() - t0) / 1e6;
  const tag = `[boss seed=${seed}]`;
  for (const e of Gen.validate(lv)) fail(tag + ' ' + e);
  const m = lv.map;
  if (count(m, 'B') !== 1 || count(m, 'G') !== 1 || count(m, 'x') !== 1 || count(m, 'P') !== 1) fail(tag + ' B/G/x/P antal');
  if (count(m, 'h') < 3 || count(m, 'a') < 3) fail(tag + ' för få h/a');
  if (count(m, 'f') < 6) fail(tag + ' för få eldfat ' + count(m, 'f'));
  if (JSON.stringify(Gen.boss(seed, {})) !== JSON.stringify(lv)) fail(tag + ' inte deterministisk');
  if (i === 0) samples.boss = lv;
}

// ---- validate fångar fel ----
{
  const bad = Gen.floor(1, 1, {});
  const hack = f => { const l = JSON.parse(JSON.stringify(bad)); f(l); return Gen.validate(l).length; };
  if (!hack(l => { l.map[0] = l.map[0].slice(0, -1); })) fail('validate: kort rad ej upptäckt');
  if (!hack(l => { l.map[1] = '.' + l.map[1].slice(1); })) fail('validate: öppen kant ej upptäckt');
  if (!hack(l => { l.map = l.map.map(r => r.replace('P', '.')); })) fail('validate: saknat P ej upptäckt');
  if (!hack(l => { l.map = l.map.map(r => r.replace('x', '.')); })) fail('validate: saknat x ej upptäckt');
  if (!hack(l => { const y = l.map.findIndex(r => r.includes('P')); const x = l.map[y].indexOf('P'); l.map[y] = l.map[y].slice(0, x + 1) + 'D' + l.map[y].slice(x + 2); })) fail('validate: dörr utan väggar ej upptäckt');
}

const show = lv => { console.log(`\n${lv.name} (${lv.theme || '-'}) djup ${lv.depth} ${lv.map[0].length}x${lv.map.length} ambient ${lv.ambient} rum ${lv.rooms.map(r => r.type[0]).join('')}`); console.log(lv.map.join('\n')); };
show(samples[1]); show(samples[5]); show(samples.boss);

console.log('\n---');
console.log(`Banor: ${stats.n}, bossarenor: 50`);
console.log(`Genereringstid golv: snitt ${(stats.ms / stats.n).toFixed(2)} ms, max ${stats.maxMs.toFixed(2)} ms; boss snitt ${(bossMs / 50).toFixed(3)} ms`);
console.log(`Rum: snitt ${(stats.rooms / stats.n).toFixed(1)} (min ${stats.minRooms}, max ${stats.maxRoomsSeen}); hemliga rum ${(100 * stats.secret / stats.n).toFixed(0)} %; fiender snitt ${(stats.enemies / stats.n).toFixed(1)}`);
console.log('Fiendesorter: ' + [...'SKVILNORW'].map(c => c + '=' + (stats['typ' + c] || 0)).join(' '));
console.log(`Omförsök i generatorn: ${Gen.floor.stats.retries - stats.retries0}`);
if (failures) { console.log(`\n${failures} FEL`); process.exit(1); }
console.log('\nALLA TESTER OK');
