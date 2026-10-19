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
ok(BASE.length === 130, 'antal vanliga kort ' + BASE.length + ' ska vara 130 (50 gamla + 50 i version 4 + 30 i version 5)');
ok(keys.length === 80, 'MOD_KEYS ska ha 80 nycklar, har ' + keys.length);
// de 27 nya mod-nycklarna
const NEW_KEYS = ['grenades', 'grenadeDmg', 'stamina', 'dashCd', 'airDmg', 'backstab', 'comboGold', 'trapResist', 'freezeChance', 'poisonChance',
  'shockChance', 'interest', 'floorHeal', 'killExplode', 'reloadNova', 'eliteGold', 'trapSense', 'enemySense', 'critHeal', 'dashDmg',
  'shieldOnKill', 'ammoRegen', 'knockback', 'chestChoice', 'freeReroll', 'hazardImmune', 'doubleJump'];
for (const k of NEW_KEYS) ok(keys.includes(k) && /[a-zåäö]/i.test(MOD_KEYS[k]), 'ny mod-nyckel saknas eller saknar beskrivning: ' + k);
// de 50 nya korten: ordning i DEFS efter OUROBOROS och före pakterna
const NEW_IDS = ['fyllbulten', 'fyrfoten', 'hornstenen', 'agget', 'benflojt', 'hangande_lappen', 'gronskan', 'att_gora', 'grodan', 'halvmane',
  'dominobrickan', 'sollinsen', 'glasogat', 'akrobaten', 'urtidsrunan', 'fyrkanten', 'idolen', 'moln_nio', 'askstav', 'feltrycket',
  'spakvinnan', 'kristallkronan', 'tankestormen', 'inbrottstjuven', 'snedsteget', 'spakortet', 'avtrycket', 'tomrummet', 'trubaduren',
  'lyckokatten', 'sigillbrevet', 'rotknuta', 'schablonen', 'maskerna', 'baronen', 'vandringsstaven', 'bryggan', 'kubtornet', 'spadomskulan',
  'glad_trefot', 'pirathatten', 'horisonten', 'runsten', 'eremiten', 'snedkronet', 'prismakronan', 'gryningen', 'travstaven', 'brokiga', 'ansiktslos'];
ok(NEW_IDS.length === 50 && new Set(NEW_IDS).size === 50, 'listan över nya kort ska ha 50 unika id');
const NEW = NEW_IDS.map(id => Cards.byId(id));
ok(NEW.every(Boolean), 'nya kort saknas: ' + NEW_IDS.filter(id => !Cards.byId(id)).join(','));
const newRar = {};
for (const c of NEW.filter(Boolean)) {
  newRar[c.rarity] = (newRar[c.rarity] || 0) + 1;
  ok(!c.pact && !c.weapon, c.id + ': nytt kort ska inte vara pakt eller uppgradering');
  ok(fs.existsSync(path.join(root, c.icon)), c.id + ': bild saknas');
  ok(c.text === c.text.toUpperCase(), c.id + ': texten ska vara versaler');
  ok(c.name === c.name.toUpperCase(), c.id + ': namnet ska vara versaler');
  ok(/\d/.test(c.text) || Object.values(c.mods).every(v => v === 1), c.id + ': texten ska ange talen');
  if (fs.existsSync(path.join(root, c.icon))) {
    const b = fs.readFileSync(path.join(root, c.icon));
    ok(b.readUInt32BE(16) === 96 && b.readUInt32BE(20) === 96, c.id + ': bilden ska vara 96x96');
  }
}
ok(newRar.vanlig === 20 && newRar.ovanlig === 15 && newRar.sallsynt === 10 && newRar.legendarisk === 5, 'nya kort per sällsynthet ' + JSON.stringify(newRar));
ok(NEW.filter(c => c && c.curse).length === 4, '4 nya förbannade kort');
ok(NEW_KEYS.every(k => NEW.some(c => c && k in c.mods)), 'alla nya mod-nycklar ska användas av nya kort');
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
for (const w of ['pistol', 'shotgun', 'rifle', 'smg', 'dbshotgun', 'crossbow', 'flaregun', 'sniper', 'axe', 'flamer', 'launcher']) {
  ok(ALL.filter(c => c.pact === w).length === 1, 'en pakt för ' + w);
  const ups = ALL.filter(c => c.weapon === w);
  ok(ups.length >= 4, w + ' har ' + ups.length + ' uppgraderingar, minst 4');
  ok(new Set(ups.map(c => c.wup)).size === ups.length, w + ': unika wup');
}
for (let seed = 1; seed <= 300; seed++) {
  const rng = makeRng(seed), pact = [null, 'pistol', 'shotgun', 'rifle', 'smg', 'dbshotgun', 'crossbow', 'flaregun', 'sniper', 'axe', 'flamer', 'launcher'][seed % 12];
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

// ---------- set ----------
const SETS = Cards.SETS;
ok(SETS && Object.keys(SETS).length === 8, '8 set');
for (const sid in SETS) {
  const st = SETS[sid], members = ALL.filter(c => c.set === sid);
  ok(st.name && st.text && st.mods && Object.keys(st.mods).length, sid + ': name/text/mods');
  for (const k in st.mods) ok(keys.includes(k), sid + ': okänd mod-nyckel ' + k);
  ok(members.length >= 4 && members.length <= 6, sid + ': ' + members.length + ' kort, ska vara 4-6');
  ok(members.every(c => !c.pact && !c.weapon), sid + ': pakter/uppgraderingar ska inte ingå i set');
  // computeMods: 3 olika kort ger bonusen, 2 gör det inte, dubbletter räknas inte
  const three = members.slice(0, 3).map(c => c.id), two = three.slice(0, 2);
  const base3 = {}; for (const id of three) for (const k in Cards.byId(id).mods) base3[k] = (base3[k] || 0) + Cards.byId(id).mods[k];
  const m3 = Cards.computeMods(three), m2 = Cards.computeMods(two.concat([two[0], two[0]]));
  for (const k in st.mods) ok(Math.abs(m3[k] - ((base3[k] || 0) + st.mods[k])) < 1e-6, sid + ': computeMods med 3 setkort ska ge bonusen ' + k + ' (' + m3[k] + ')');
  const base2 = {}; for (const id of two.concat([two[0], two[0]])) for (const k in Cards.byId(id).mods) base2[k] = (base2[k] || 0) + Cards.byId(id).mods[k];
  for (const k in st.mods) ok(Math.abs(m2[k] - (base2[k] || 0)) < 1e-6, sid + ': 2 olika setkort ska inte ge bonusen (' + k + ')');
  // setProgress
  const sp = Cards.setProgress(three).find(x => x.id === sid);
  ok(sp && sp.active && sp.have === 3 && sp.need === 3 && sp.name === st.name && sp.text === st.text, sid + ': setProgress aktiv');
  const sp1 = Cards.setProgress(three.slice(0, 1)).find(x => x.id === sid);
  ok(sp1 && !sp1.active && sp1.have === 1, sid + ': setProgress 1/3');
  // synergy: kort som fortsätter ett påbörjat set
  const s1 = Cards.synergy(Cards.byId(three[1]), [three[0]]);
  ok(typeof s1 === 'string' && s1.includes(st.name), sid + ': synergy ska nämna setet: "' + s1 + '"');
  const s2 = Cards.synergy(Cards.byId(three[2]), two);
  ok(/^FULLBORDAR /.test(s2), sid + ': synergy ska säga FULLBORDAR: "' + s2 + '"');
}
ok(Cards.setProgress([]).length === 8 && Cards.setProgress([]).every(x => x.have === 0 && !x.active), 'setProgress([])');
// synergy: syn-taggar och tomma fall
ok(Cards.synergy(Cards.byId('grodan'), ['spakvinnan']).includes('GIFT'), 'gift + gift ska vara synergi');
ok(Cards.synergy(Cards.byId('offerkniven'), ['solkonungen']).includes('KRIT'), 'krit + kritskada ska vara synergi');
ok(Cards.synergy(Cards.byId('agget'), ['bronda_runan']) !== '', 'eld + explosion ska vara synergi');
ok(Cards.synergy(Cards.byId('slipstenen'), ['glodkol', 'grodan']) === '', 'kort utan set/syn ska ge tom sträng');
ok(Cards.synergy(Cards.byId('grodan'), []) === '', 'inga ägda kort ska ge tom sträng');
ok(Cards.synergy(Cards.byId('grodan'), ['grodan']) === '', 'kortet själv räknas inte som synergi');
for (const c of ALL) { const r = Cards.synergy(c, ['glodkol', 'korsriddaren', 'grodan', 'halvmane', 'fyrfoten', 'guldbaggen', 'manesilver']); ok(typeof r === 'string' && r === r.toUpperCase() && r.length <= 40, c.id + ': synergy-sträng ' + r); }
ok(ALL.filter(c => c.syn && c.syn.length).length >= 30, 'minst 30 kort med syn-taggar');
// modLines: tal med rätt tecken
const ml = Cards.modLines(Cards.byId('ansiktslos'));
ok(ml.length === 5 && ml.find(l => l.key === 'maxHp').text === '-30 MAX HP' && !ml.find(l => l.key === 'maxHp').good && ml.find(l => l.key === 'dmg').text === '+20 % SKADA', 'modLines ' + JSON.stringify(ml));
ok(Cards.modLines({ damageTaken: 0.25 })[0].good === false && Cards.modLines({ damageTaken: -0.2 })[0].good === true, 'modLines damageTaken är omvänd');
for (const c of ALL) for (const l of Cards.modLines(c)) ok(l.text && l.text === l.text.toUpperCase(), c.id + ': modLines-text');
// draw med nya kort: owned/unlocked/pakt-reglerna gäller fortfarande
for (let seed = 1; seed <= 400; seed++) {
  const rng = makeRng(seed * 7 + 1), pact = seed % 3 ? null : 'shotgun';
  const owned = NEW_IDS.filter((_, i) => (i + seed) % 4 === 0).flatMap(id => Array(Cards.byId(id).max).fill(id));
  const unlocked = new Set(NEW.filter((c, i) => c.unlock && (i + seed) % 2).map(c => c.id));
  const got = Cards.draw(rng, 5, { owned, depth: seed % 6, luck: (seed % 4) / 10, unlocked, pact });
  ok(got.length === 5, 'draw med nya kort gav ' + got.length);
  for (const c of got) {
    ok(!owned.includes(c.id), 'draw gav maxat nytt kort ' + c.id);
    ok(!c.unlock || unlocked.has(c.id), 'draw gav låst kort ' + c.id);
    ok(!(pact && c.pact), 'draw gav en andra pakt');
    ok(!c.weapon || c.weapon === pact, 'draw gav uppgradering ' + c.id + ' utan pakt');
  }
}
{ // nya kort dras över huvud taget
  const rng = makeRng(42), hit = new Set();
  for (let i = 0; i < 3000; i++) for (const c of Cards.draw(rng, 3, { unlocked: unlockedAll, depth: i % 6 })) hit.add(c.id);
  ok(NEW_IDS.every(id => hit.has(id)), 'alla nya kort ska kunna dras: saknas ' + NEW_IDS.filter(id => !hit.has(id)).join(','));
}
ok(Cards.describe(Cards.byId('glodkol')).includes('SET: ASKANS ORDEN'), 'describe nämner setet');

// ---------- version 5: nya kort, mod-nycklar, pakter, set och sammansmältning ----------
const V5_KEYS = ['potionPower', 'potionChance', 'petPower', 'meleeDmg', 'fireDmg', 'coldResist', 'headshot', 'bleedChance', 'allyChance', 'lightRadius', 'weaponDrop', 'npcDiscount'];
for (const k of V5_KEYS) {
  ok(keys.includes(k) && /[a-zåäö]/i.test(MOD_KEYS[k]), 'version 5-nyckel saknas eller saknar beskrivning: ' + k);
  const l = Cards.modLines({ [k]: 0.1 });
  ok(l.length === 1 && l[0].good && l[0].text === l[0].text.toUpperCase() && /\d/.test(l[0].text), k + ': modLines ' + JSON.stringify(l));
}
const V5_IDS = ['lakebladet', 'groddrunan', 'vargtanden', 'jarnnaven', 'eldrunan', 'frosttoppen', 'slaktkroken', 'spejarkikaren', 'manrunan',
  'marknadstaltet', 'vapenladorna', 'dodsrunan', 'blandbradet', 'flockens_horn', 'gapet', 'bodelsnalen', 'ristarboden', 'brinnande_tornet',
  'trogna_anden', 'overflodet', 'spokspegeln', 'ishavet', 'jagarogat', 'dimvasen', 'gavoasken', 'haxkvasten', 'trallbojan', 'purpurkitteln',
  'karmosinhjartat', 'dodsbesvarjaren'];
ok(V5_IDS.length === 30 && new Set(V5_IDS).size === 30, '30 unika version 5-id');
const V5 = V5_IDS.map(id => Cards.byId(id)).filter(Boolean);
ok(V5.length === 30, 'version 5-kort saknas: ' + V5_IDS.filter(id => !Cards.byId(id)).join(','));
const v5Rar = {};
for (const c of V5) {
  v5Rar[c.rarity] = (v5Rar[c.rarity] || 0) + 1;
  ok(!c.pact && !c.weapon && !NEW_IDS.includes(c.id), c.id + ': version 5-kort ska vara ett vanligt nytt kort');
  ok(c.name === c.name.toUpperCase() && c.text === c.text.toUpperCase() && /\d/.test(c.text), c.id + ': versaler och tal i texten');
  const f = path.join(root, c.icon);
  ok(fs.existsSync(f), c.id + ': bild saknas');
  if (fs.existsSync(f)) { const b = fs.readFileSync(f); ok(b.readUInt32BE(16) === 96 && b.readUInt32BE(20) === 96, c.id + ': bilden ska vara 96x96'); }
  ok(Cards.modLines(c).length === Object.keys(c.mods).length, c.id + ': varje mod ska ha en effektrad');
  ok(c.text.split('\n').length >= Cards.modLines(c).length, c.id + ': texten ska nämna alla effekter');
}
ok(v5Rar.vanlig === 12 && v5Rar.ovanlig === 9 && v5Rar.sallsynt === 6 && v5Rar.legendarisk === 3, 'version 5 per sällsynthet ' + JSON.stringify(v5Rar));
ok(V5.filter(c => c.curse).length === 2, '2 förbannade version 5-kort');
ok(V5_KEYS.every(k => V5.some(c => k in c.mods)), 'alla version 5-nycklar ska användas: saknas ' + V5_KEYS.filter(k => !V5.some(c => k in c.mods)).join(','));
{ // bilderna ska vara olika (ingen bild återanvänd)
  const seenImg = new Map();
  for (const c of ALL) {
    const f = path.join(root, c.icon);
    if (!fs.existsSync(f)) continue;
    const h = require('crypto').createHash('md5').update(fs.readFileSync(f)).digest('hex');
    ok(!seenImg.has(h) || !V5_IDS.concat(['pakt_yxa', 'pakt_eld', 'pakt_gk']).includes(c.id), c.id + ': samma bild som ' + seenImg.get(h));
    seenImg.set(h, c.id);
  }
}
// pakter och uppgraderingar för yxan, eldkastaren och granatkastaren
const PACTS5 = { axe: ['pakt_yxa', ['axe_whirl', 'axe_bleed', 'axe_boomerang', 'axe_butcher']], flamer: ['pakt_eld', ['fl_napalm', 'fl_blue', 'fl_frugal', 'fl_wall']], launcher: ['pakt_gk', ['gl_cluster', 'gl_sticky', 'gl_mega', 'gl_drum']] };
for (const w in PACTS5) {
  const [pid, wups] = PACTS5[w], p = Cards.byId(pid);
  ok(p && p.pact === w && p.rarity === 'sallsynt' && p.max === 1 && p.mods.dmg === 0.15 && p.bad === 1, pid + ': pakt för ' + w);
  ok(p && fs.existsSync(path.join(root, p.icon)), pid + ': bild');
  ok(Cards.WEAPON_NAME[w] && p && p.text.includes(Cards.WEAPON_NAME[w]), w + ': WEAPON_NAME och pakttext');
  const ups = ALL.filter(c => c.weapon === w);
  ok(ups.length === 4 && JSON.stringify(ups.map(c => c.wup).sort()) === JSON.stringify(wups.slice().sort()), w + ': uppgraderingar ' + ups.map(c => c.wup).join(','));
  for (const u of ups) {
    ok(u.max === 1 && Object.keys(u.mods).length === 0 && fs.existsSync(path.join(root, u.icon)) && Cards.tag(u) === Cards.WEAPON_NAME[w], u.id + ': uppgradering');
    ok(u.name === u.name.toUpperCase() && u.text === u.text.toUpperCase(), u.id + ': versaler');
  }
  // dras bara med vapnets pakt
  const rng = makeRng(11); let hit = 0;
  for (let i = 0; i < 300; i++) for (const c of Cards.draw(rng, 4, { pact: w, unlocked: unlockedAll })) { ok(!c.pact && (!c.weapon || c.weapon === w), 'draw med pakt ' + w + ' gav ' + c.id); if (c.weapon === w) hit++; }
  ok(hit > 50, w + ': uppgraderingarna ska dras ofta efter pakten (' + hit + ')');
}
ok(Object.keys(Cards.WEAPON_NAME).length === 11 && ALL.filter(c => c.pact).length === 11, '11 vapen och 11 pakter');
// set: alkemi och flock
for (const sid of ['alkemi', 'flock']) {
  const members = ALL.filter(c => c.set === sid);
  ok(SETS[sid] && members.length >= 4 && members.length <= 6, sid + ': ' + members.length + ' kort');
  ok(members.every(c => V5_IDS.includes(c.id)), sid + ': medlemmar');
}
ok(Object.keys(SETS.alkemi.mods).every(k => ['potionPower', 'potionChance', 'npcDiscount'].includes(k)), 'alkemi-bonusen handlar om drycker');
ok('petPower' in SETS.flock.mods && 'allyChance' in SETS.flock.mods, 'flock-bonusen handlar om följeslagare');
ok(Cards.synergy(Cards.byId('groddrunan'), ['lakebladet']).includes(SETS.alkemi.name), 'synergy alkemi');
ok(Cards.synergy(Cards.byId('jarnnaven'), ['gapet']).includes('NÄRSTRID'), 'synergy närstrid');

// ---------- sammansmältning ----------
ok(typeof Cards.fuse === 'function' && typeof Cards.canFuse === 'function', 'fuse och canFuse finns');
ok(Cards.fuse('slipstenen') === 'slipstenen+', 'fuse ger <id>+');
const sp2 = Cards.byId('slipstenen+');
ok(sp2 && sp2.id === 'slipstenen+' && sp2.name === 'SLIPSTENEN+' && sp2.rarity === 'ovanlig' && sp2.mods.dmg === 0.16 && sp2.icon === Cards.byId('slipstenen').icon && sp2.fused && sp2.base === 'slipstenen', 'byId(slipstenen+) ' + JSON.stringify(sp2));
ok(Cards.byId('slipstenen+') === sp2, 'byId cachar sammansmälta kort');
ok(!ALL.includes(sp2), 'sammansmälta kort ska inte ligga i ALL');
for (const bad of ['pakt_pistol', 'studskulan', 'ansiktslos', 'finnsinte', 'slipstenen+', '', '+']) ok(Cards.fuse(bad) === null, 'fuse(' + bad + ') ska vara null');
for (const bad of ['pakt_pistol+', 'studskulan+', 'ansiktslos+', 'finnsinte+', 'slipstenen++', '+', 'constructor', '__proto__']) ok(Cards.byId(bad) === null, 'byId(' + bad + ') ska vara null');
let nf = 0;
for (const c of ALL) {
  const fid = Cards.fuse(c.id);
  ok(!!fid === (c.max >= 2 && !c.pact && !c.weapon), c.id + ': fuse när max >= 2');
  if (!fid) continue;
  nf++;
  const f = Cards.byId(fid), ri = Cards.RARITY_ORDER.indexOf(c.rarity);
  ok(f.rarity === Cards.RARITY_ORDER[Math.min(3, ri + 1)], fid + ': ett steg sällsyntare');
  ok(f.name === c.name + '+' && f.icon === c.icon && f.max >= 1 && f.max <= c.max, fid + ': namn, bild och max');
  ok(f.set === c.set && f.curse === c.curse, fid + ': set och förbannelse');
  ok(f.text === f.text.toUpperCase() && f.text !== c.text && /\d/.test(f.text), fid + ': ny text ' + JSON.stringify(f.text));
  ok(f.text.split('\n').length - (f.bad || 0) >= 1, fid + ': text och bad');
  for (const k in c.mods) {
    const a = c.mods[k], b = f.mods[k];
    if (Cards.modLines({ [k]: a })[0] && /^[A-ZÅÄÖ]/.test(Cards.modLines({ [k]: a })[0].text)) { ok(b === a, fid + ': på/av-nyckel ' + k + ' oförändrad'); continue; }
    ok(Math.sign(a) === Math.sign(b) && Math.abs(b) > Math.abs(a), fid + ': ' + k + ' ' + a + ' -> ' + b + ' ska bli starkare');
    ok(b / a >= 1.25 && b / a <= 2 + 1e-9 && (Math.abs(b / a - Cards.FUSE_MUL) < 0.35 || Math.abs(a) === 1), fid + ': ' + k + ' ' + a + ' -> ' + b + ' ungefär ×1,6 (1 blir 2)');
    ok(Math.abs(b * 1e6 - Math.round(b * 1e6)) < 1e-6, fid + ': ' + k + ' avrundning ' + b);
  }
  ok(Cards.price(f, 2, 0) >= Cards.price(c, 2, 0), fid + ': pris');
  ok(Cards.describe(f).includes(f.name), fid + ': describe');
}
ok(nf >= 100, 'minst 100 kort kan smältas (' + nf + ')');
ok(Cards.byId('lagerelden+').mods.regen === 0.5 && Cards.byId('loparen+').mods.speedOnKill === 2.4 && Cards.byId('kantvakten+').mods.maxHp === 16, 'avrundning av platta tal');
ok(Cards.byId('trefaldigheten+').text === '+2 KULOR PER SKOTT' && Cards.byId('agget+').text === '+2 MAX GRANATER', 'plural i sammansmälta texter: ' + Cards.byId('trefaldigheten+').text + ' / ' + Cards.byId('agget+').text);
ok(Cards.byId('offerdolken+').bad === 1 && /^-\d+ MAX HP$/.test(Cards.byId('offerdolken+').text.split('\n')[1]), 'förbannat sammansmält kort behåller nackdelen');
ok(JSON.stringify(Cards.canFuse(['slipstenen', 'slipstenen', 'kantvakten', 'ansiktslos', 'ansiktslos', 'pakt_pistol', 'pakt_pistol', 'slipstenen+', 'slipstenen+', 'glodkol', 'glodkol', 'glodkol'])) === '["slipstenen","glodkol"]', 'canFuse ' + JSON.stringify(Cards.canFuse(['slipstenen', 'slipstenen', 'kantvakten', 'ansiktslos', 'ansiktslos', 'pakt_pistol', 'pakt_pistol', 'slipstenen+', 'slipstenen+', 'glodkol', 'glodkol', 'glodkol'])));
ok(Cards.canFuse([]).length === 0 && Cards.canFuse(null).length === 0 && Cards.canFuse(['finnsinte', 'finnsinte']).length === 0, 'canFuse tomt');
m = Cards.computeMods(['slipstenen+']);
ok(m.dmg === 0.16 && Object.keys(m).length === keys.length, 'computeMods med + ' + m.dmg);
m = Cards.computeMods(['slipstenen+', 'slipstenen', 'kantvakten+', 'kantvakten+']);
ok(Math.abs(m.dmg - 0.26) < 1e-9 && m.maxHp === 32, 'computeMods blandat ' + m.dmg + ' ' + m.maxHp);
{ // ett sammansmält kort räknas som sitt grundkort i set
  const st = SETS.eld, mem = ALL.filter(c => c.set === 'eld').map(c => c.id);
  const m3 = Cards.computeMods([mem[0] + '+', mem[1], mem[2]]), m2 = Cards.computeMods([mem[0] + '+', mem[0], mem[1]]);
  const base3 = Cards.computeMods([mem[0] + '+', mem[1], mem[2]].map(id => id)), only = {};
  for (const id of [mem[0] + '+', mem[1], mem[2]]) for (const k in Cards.byId(id).mods) only[k] = (only[k] || 0) + Cards.byId(id).mods[k];
  for (const k in st.mods) ok(Math.abs(base3[k] - ((only[k] || 0) + st.mods[k])) < 1e-6, 'set med sammansmält kort: ' + k);
  ok(Cards.setProgress([mem[0] + '+', mem[0], mem[1]]).find(x => x.id === 'eld').have === 2, 'kort och sammansmält kort räknas som ett i set');
  ok(m2 && m3, 'computeMods med set');
  ok(Cards.synergy(Cards.byId(mem[1]), [mem[0] + '+']).includes(st.name), 'synergy med sammansmält kort');
  ok(Cards.synergy(Cards.byId(mem[0]), [mem[0] + '+']) === '' || !Cards.synergy(Cards.byId(mem[0]), [mem[0] + '+']).includes('1/3'), 'grundkortet fortsätter inte setet när man har det sammansmälta');
}
for (let seed = 1; seed <= 200; seed++) { // '<id>+' räknas som två exemplar mot max
  const got = Cards.draw(makeRng(seed), 5, { owned: ['slipstenen+', 'slipstenen+', 'slipstenen', 'lagerelden+', 'lagerelden', 'offerkniven+', 'offerkniven'], unlocked: unlockedAll });
  for (const c of got) ok(!['slipstenen', 'lagerelden', 'offerkniven'].includes(c.id) && !c.fused, 'draw gav ' + c.id + ' trots sammansmälta kort');
}

console.log('Version 5: ' + V5.length + ' kort ' + JSON.stringify(v5Rar) + ', ' + nf + ' kort kan smältas, pakter ' + Object.values(PACTS5).map(x => x[0]).join(' '));
console.log('Set: ' + Object.keys(SETS).map(k => k + '(' + ALL.filter(c => c.set === k).length + ')').join(' '));
console.log('Kort: ' + ALL.length + ' ' + JSON.stringify(perRarity) + ', låsta ' + locked + ', förbannade ' + ALL.filter(c => c.curse).length);
console.log('Slumpad sällsynthet djup0 ' + lo.toFixed(2) + ' -> djup4+luck ' + hi.toFixed(2) + ', förbannade ' + (100 * curses / tot).toFixed(1) + ' %');
if (fails) { console.log(fails + ' fel'); process.exit(1); }
console.log('OK: alla kontroller godkända');
