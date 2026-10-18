'use strict';
// Test av js/cards.js:  node tools/cards-test.js
const fs = require('fs');
const path = require('path');
global.window = global;
require('../js/cards.js');
const root = path.join(__dirname, '..');
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FEL: ' + msg); } };

// Enkel seedad rng med samma gränssnitt som spelets (next, int, pick, weighted)
function makeRng(seed) {
  let s = seed >>> 0;
  const r = {
    next() { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; },
    int(a, b) { return a + Math.floor(r.next() * (b - a + 1)); },
    pick(arr) { return arr[Math.floor(r.next() * arr.length)]; },
    weighted(arr, fn) { let tot = 0; for (const a of arr) tot += fn(a); let x = r.next() * tot; for (const a of arr) { x -= fn(a); if (x <= 0) return a; } return arr[arr.length - 1]; },
  };
  return r;
}

const { ALL, RARITY, MOD_KEYS } = Cards;
const keys = Object.keys(MOD_KEYS);
const BASE = ALL.filter(c => !c.pact && !c.weapon);
ok(BASE.length >= 40 && BASE.length <= 50, 'antal vanliga kort ' + BASE.length + ' ska vara 40-50');
ok(keys.length === 41, 'MOD_KEYS ska ha 41 nycklar, har ' + keys.length);
const ids = new Set(), used = new Set(), perRarity = {};
for (const c of ALL) {
  ok(!ids.has(c.id), 'dubblett-id ' + c.id); ids.add(c.id);
  ok(RARITY[c.rarity], c.id + ': okänd rarity');
  perRarity[c.rarity] = (perRarity[c.rarity] || 0) + 1;
  ok(c.name && c.text && c.icon, c.id + ': saknar name/text/icon');
  ok(c.max >= 1 && c.max <= 5, c.id + ': max utanför 1-5');
  if (c.weapon) ok(c.wup && c.mods && Object.keys(c.mods).length === 0, c.id + ': vapenuppgradering ska ha wup och inga mods');
  else ok(c.mods && Object.keys(c.mods).length > 0, c.id + ': tomma mods');
  for (const k in c.mods) { ok(keys.includes(k), c.id + ': okänd mod-nyckel ' + k); ok(typeof c.mods[k] === 'number' && isFinite(c.mods[k]), c.id + ': ' + k + ' inte tal'); used.add(k); }
  ok(fs.existsSync(path.join(root, c.icon)), c.id + ': ikon saknas ' + c.icon);
  if (c.unlock != null) ok(c.unlock >= 10 && c.unlock <= 60, c.id + ': unlock utanför 10-60');
  if (c.curse) ok(Object.values(c.mods).some(v => v < 0) || c.mods.damageTaken > 0, c.id + ': förbannat kort utan nackdel');
  ok(Cards.byId(c.id) === c, c.id + ': byId');
  ok(Cards.price(c, 0, 0) > 0 && Cards.price(c, 3, 0.2) <= Cards.price(c, 3, 0) * 1.01, c.id + ': pris');
  ok(typeof Cards.describe(c) === 'string' && Cards.describe(c).includes(c.name), c.id + ': describe');
}
for (const r of Object.keys(RARITY)) ok(perRarity[r] > 0, 'inga kort av rarity ' + r);
for (const k of keys) ok(used.has(k), 'mod-nyckel ' + k + ' används av inget kort');
const locked = BASE.filter(c => c.unlock != null).length;
ok(locked / BASE.length > 0.25 && locked / BASE.length < 0.45, 'andel låsta kort ' + locked + '/' + BASE.length);
// vapenpakter: en per vapen, minst fyra unika uppgraderingar var
for (const w of ['pistol', 'shotgun', 'rifle', 'smg']) {
  ok(ALL.filter(c => c.pact === w).length === 1, 'en pakt för ' + w);
  const ups = ALL.filter(c => c.weapon === w);
  ok(ups.length >= 4, w + ' har ' + ups.length + ' uppgraderingar, minst 4');
  ok(new Set(ups.map(c => c.wup)).size === ups.length, w + ': unika wup');
}
for (let seed = 1; seed <= 300; seed++) {
  const rng = makeRng(seed), pact = [null, 'pistol', 'shotgun', 'rifle', 'smg'][seed % 5];
  const got = Cards.draw(rng, 4, { depth: seed % 5, pact });
  for (const c of got) {
    ok(!(pact && c.pact), 'andra pakt dragen med pakt ' + pact);
    ok(!c.weapon || c.weapon === pact, c.id + ' dragen med pakt ' + pact);
  }
}
ok(ALL.filter(c => c.curse).length >= 3, 'för få förbannade kort');
ok(fs.existsSync(path.join(root, 'assets/cards/back.png')), 'kortbaksida saknas');

// computeMods
let m = Cards.computeMods([]);
ok(keys.every(k => m[k] === 0), 'computeMods([]) ska ge nollor för alla nycklar');
m = Cards.computeMods(['slipstenen', 'slipstenen', 'slipstenen', 'kantvakten', 'offerdolken', 'hjartstenen', 'finnsinte']);
ok(Math.abs(m.dmg - 0.3) < 1e-9, 'dmg 3 x 0.10 = ' + m.dmg);
ok(m.maxHp === 10 + 25 - 15, 'maxHp = ' + m.maxHp);
ok(Math.abs(m.critChance - 0.2) < 1e-9, 'critChance = ' + m.critChance);
ok(Object.keys(m).length === keys.length, 'computeMods ska ha exakt MOD_KEYS');

// draw
const unlockedAll = new Set(ALL.map(c => c.id));
for (let seed = 1; seed <= 400; seed++) {
  const rng = makeRng(seed);
  const owned = [];
  for (let i = 0; i < rng.int(0, 40); i++) owned.push(rng.pick(ALL).id);
  const unlocked = seed % 2 ? new Set() : new Set(ALL.filter(c => c.unlock && c.unlock <= 30).map(c => c.id));
  const n = rng.int(1, 5);
  const got = Cards.draw(rng, n, { owned, depth: rng.int(0, 4), luck: rng.int(0, 5) / 10, unlocked });
  const cnt = {}; for (const id of owned) cnt[id] = (cnt[id] || 0) + 1;
  ok(got.length === n, 'draw gav ' + got.length + ' av ' + n + ' (seed ' + seed + ')');
  ok(new Set(got.map(c => c.id)).size === got.length, 'draw gav dubbletter (seed ' + seed + ')');
  for (const c of got) {
    ok((cnt[c.id] || 0) < c.max, 'draw gav ' + c.id + ' som nått max (seed ' + seed + ')');
    ok(!c.unlock || unlocked.has(c.id), 'draw gav låst kort ' + c.id + ' (seed ' + seed + ')');
  }
}
// utan rng.weighted ska reservvägen fungera
const plain = makeRng(7); delete plain.weighted;
ok(Cards.draw(plain, 3, { unlocked: unlockedAll }).length === 3, 'draw utan rng.weighted');
// tom pool: allt maxat
const everything = []; for (const c of ALL) for (let i = 0; i < c.max; i++) everything.push(c.id);
ok(Cards.draw(makeRng(3), 3, { owned: everything, unlocked: unlockedAll }).length === 0, 'maxade kort ska inte dras');
// djup och luck ska ge sällsyntare kort i snitt
function avgRank(depth, luck) {
  const rng = makeRng(99), rk = Cards.RARITY_ORDER; let s = 0, k = 0;
  for (let i = 0; i < 3000; i++) for (const c of Cards.draw(rng, 3, { depth, luck, unlocked: unlockedAll })) { s += rk.indexOf(c.rarity); k++; }
  return s / k;
}
const lo = avgRank(0, 0), hi = avgRank(4, 0.5);
ok(hi > lo + 0.2, 'djup/luck ska höja sällsyntheten (' + lo.toFixed(2) + ' -> ' + hi.toFixed(2) + ')');
// förbannade kort ska förekomma ibland
const rng = makeRng(5); let curses = 0, tot = 0;
for (let i = 0; i < 2000; i++) for (const c of Cards.draw(rng, 3, { unlocked: unlockedAll })) { tot++; if (c.curse) curses++; }
ok(curses > 0 && curses / tot < 0.2, 'förbannade kort andel ' + (curses / tot).toFixed(3));
// pris
const sp = ALL.find(c => c.rarity === 'vanlig');
ok(Cards.price(sp, 3, 0) > Cards.price(sp, 0, 0), 'pris ska öka med djup');
ok(Cards.price(sp, 2, 0.5) < Cards.price(sp, 2, 0), 'pris ska sjunka med rabatt');

console.log('Kort: ' + ALL.length + ' ' + JSON.stringify(perRarity) + ', låsta ' + locked + ', förbannade ' + ALL.filter(c => c.curse).length);
console.log('Slumpad sällsynthet djup0 ' + lo.toFixed(2) + ' -> djup4+luck ' + hi.toFixed(2) + ', förbannade ' + (100 * curses / tot).toFixed(1) + ' %');
if (fails) { console.log(fails + ' fel'); process.exit(1); }
console.log('OK: alla kontroller godkända');
