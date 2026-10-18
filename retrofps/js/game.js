'use strict';
// KRYPTA – roguelike-FPS (raycaster i Doom/Wolfenstein-anda).
// Varje runda: genererade våningar (Gen), kort som ger bonusar (Cards/CardUI), guld, butik, elitfiender
// och en boss på sista våningen. Döden avslutar rundan; själar ger upplåsningar till nästa.
(() => {
const W = 320, H = 200, HUD_H = 34, VH = H - HUD_H, HORIZON = VH >> 1;
let BASE_PLANE = 0.75; // sätts från synfältet (FOV) i inställningarna
const applyFov = () => { BASE_PLANE = Math.tan(clamp(settings.fov, 60, 100) * Math.PI / 360); };
const FLOORS = 5; // vanliga våningar per varv; våning FLOORS + 1 är bossen
// efter bossen kan man gå djupare: varv 2 är våning 7-12 med en starkare boss på 12, och så vidare
const isBossDepth = d => d % (FLOORS + 1) === 0;
const cycleOf = d => Math.floor((d - 1) / (FLOORS + 1));
const cyclePos = d => (d - 1) % (FLOORS + 1) + 1;
const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');
canvas.width = W; canvas.height = H;
ctx.imageSmoothingEnabled = false;
const frame = ctx.createImageData(W, VH);
const px = new Uint32Array(frame.data.buffer);
const zbuf = new Float32Array(W);
const params = new URLSearchParams(location.search);
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------- Inställningar, profil och sparning (localStorage kan saknas) ----------
const store = {
  get(k, def) { try { const v = localStorage.getItem('krypta.' + k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem('krypta.' + k, JSON.stringify(v)); } catch (e) { /* ingen lagring */ } },
  del(k) { try { localStorage.removeItem('krypta.' + k); } catch (e) { /* ingen lagring */ } },
};
const settings = Object.assign({ sens: 1, vol: 0.8, muted: false, diff: 1, fov: 74, gamma: 1, shake: 1, xstyle: 'kors', xcolor: '', fps: false, lowfx: false, bob: true,
  vibrate: true, lefty: false, btnScale: 1, map: 1 }, store.get('settings', {}));
if (params.has('diff')) settings.diff = clamp(+params.get('diff'), 0, 3);
const saveSettings = () => store.set('settings', settings);
applyFov();
const profile = Object.assign({ souls: 0, unlocked: [], runs: 0, wins: 0, bestDepth: 0, bestScore: 0, history: [] }, store.get('profile', {}));
const saveProfile = () => store.set('profile', profile);
// ---------- Prestationer ----------
const ACH = [
  ['first', 'FÖRSTA STEGET', 'KLARA EN VÅNING', p => p.bestDepth >= 2],
  ['cycle', 'NERÅT', 'NÅ VÅNING 6', p => p.bestDepth >= 6],
  ['deep', 'DJUPET', 'NÅ VÅNING 12', p => p.bestDepth >= 12],
  ['win', 'KRYPTANS HERRE', 'VINN EN RUNDA', p => p.wins >= 1],
  ['nightmare', 'MARDRÖMMEN', 'VINN PÅ MARDRÖM', p => p.nightmareWin],
  ['k100', 'SLAKTARE', 'DÖDA 100 FIENDER TOTALT', p => (p.kills || 0) >= 100],
  ['k1000', 'LIKSTRÖ', 'DÖDA 1000 FIENDER TOTALT', p => (p.kills || 0) >= 1000],
  ['boss1', 'BOSSJÄGARE', 'BESEGRA EN BOSS', p => Object.keys(p.bossWins || {}).length >= 1],
  ['bossall', 'ALLA HUVUDEN', 'BESEGRA ALLA FEM BOSSAR', p => Object.keys(p.bossWins || {}).length >= 5],
  ['guard', 'VÄKTARDRÅPARE', 'BESEGRA EN VÄKTARE', p => (p.guardians || 0) >= 1],
  ['rich', 'GULDFEBER', 'HA 500 GULD SAMTIDIGT', (p, r) => r && r.gold >= 500],
  ['deck', 'SAMLAREN', 'HA 15 KORT I EN RUNDA', (p, r) => r && r.owned.length >= 15],
  ['pact', 'PAKTEN', 'SLUT EN VAPENPAKT', (p, r) => r && r.pact],
  ['secret', 'SPÅRHUND', 'HITTA 10 HEMLIGHETER TOTALT', p => (p.secrets || 0) >= 10],
  ['fast', 'BLIXTEN', 'KLARA EN VÅNING PÅ UNDER 60 S', (p, r) => r && r.fast],
  ['untouched', 'ORÖRBAR', 'KLARA EN VÅNING UTAN ATT TA SKADA', (p, r) => r && r.untouched],
  ['multi', 'MASSAKER', 'DÖDA 5 FIENDER I SAMMA SALVA', () => P.multi >= 5],
  ['altar', 'OFFRET', 'KÖP EN UPPGRADERING VID SJÄLAALTARET', p => Object.values(p.meta || {}).some(v => v > 0)],
  ['arsenal', 'ARSENALEN', 'BÄR 6 VAPEN SAMTIDIGT', () => P.has.filter(Boolean).length >= 6],
  ['daily', 'DAGBOKEN', 'SPELA EN DAGENS RUNDA', p => p.history.some(h => h.daily)],
];
function checkAch() {
  profile.ach = profile.ach || [];
  for (const [id, name, text, test] of ACH) {
    if (profile.ach.includes(id)) continue;
    let ok = false; try { ok = !!test(profile, run); } catch (e) { ok = false; }
    if (!ok) continue;
    profile.ach.push(id); profile.souls += 10; saveProfile();
    if (state !== 'title') { say('PRESTATION: ' + name + ' (+10 SJÄLAR)', 3); play('gem', 0.8, 0.8); }
  }
}
function showAchievements() {
  const got = profile.ach || [];
  CardUI.list('PRESTATIONER', `${got.length} AV ${ACH.length} · VARJE GER 10 SJÄLAR`, ACH.map(([id, name, text]) => ({ label: (got.includes(id) ? '★ ' : '☆ ') + name, text, color: got.includes(id) ? '#ffd24a' : '', dim: !got.includes(id) })), () => refreshTitle());
}
function showBestiary() {
  const b = profile.bestiary || {};
  const rows = Object.entries(ENEMY_DEFS).map(([t, d]) => b[t] ? { label: d.name, text: `DÖDADE ${b[t]}` + (d.tip ? ' · ' + d.tip : '') } : { label: '???', text: 'INTE MÖTT ÄNNU', dim: true });
  for (const [id, bd] of Object.entries(BOSSES)) { const n = (profile.bossWins || {})[id] || 0; rows.push(n ? { label: bd.title || bd.name, text: `BESEGRAD ${n} GÅNG${n > 1 ? 'ER' : ''}`, color: '#ff8a5a' } : { label: '??? (BOSS)', text: 'INTE BESEGRAD', dim: true }); }
  CardUI.list('BESTIARIUM', `${Object.keys(b).length} AV ${Object.keys(ENEMY_DEFS).length} FIENDER`, rows, () => refreshTitle());
}
function showProfile() {
  const h = profile.history || [], fmtT = t => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`;
  const fav = Object.entries(profile.wkills || {}).sort((a, b) => b[1] - a[1])[0];
  const rows = [
    { label: 'RUNDOR', text: `${profile.runs} (${profile.wins} SEGRAR)` },
    { label: 'DÖDADE FIENDER', text: String(profile.kills || 0) },
    { label: 'SPELTID', text: fmtT(profile.time || 0) },
    { label: 'BÄSTA VÅNING', text: String(profile.bestDepth) },
    { label: 'FAVORITVAPEN', text: fav ? `${(WEAPONS.find(w => w.id === fav[0]) || {}).name || fav[0]} (${fav[1]})` : '–' },
    { label: 'PRESTATIONER', text: `${(profile.ach || []).length} AV ${ACH.length}` },
    { label: 'TOPP 5', head: true, color: '#ffd24a' },
    ...h.slice().sort((a, b) => b.score - a.score).slice(0, 5).map((r, i) => ({ label: `${i + 1}. ${r.score} P`, text: `VÅNING ${r.depth} · ${r.kills} DÖDADE · FRÖ ${r.seed}${r.win ? ' · SEGER' : ''}` })),
    { label: 'SENASTE RUNDOR', head: true, color: '#ffd24a' },
    ...h.slice(0, 8).map(r => ({ label: `${r.win ? 'SEGER' : r.cause === 'GAV UPP' ? 'GAV UPP' : 'DOG'} VÅNING ${r.depth}`, text: [BIOME_NAME[r.biome] || '', r.cause && r.cause !== 'GAV UPP' ? 'DÖDAD AV ' + r.cause : '', r.daily ? 'DAGENS' : '', DIFF[r.diff ?? 1] ? DIFF[r.diff ?? 1].name : ''].filter(Boolean).join(' · '), dim: !r.win })),
  ];
  CardUI.list('PROFIL', '', rows, () => refreshTitle());
}
const DIFF = [
  { name: 'LÄTT', dmg: 0.55, hp: 0.8, ammo: 1.4, speed: 0.9, souls: 0.7 },
  { name: 'NORMAL', dmg: 1, hp: 1, ammo: 1, speed: 1, souls: 1 },
  { name: 'SVÅR', dmg: 1.45, hp: 1.3, ammo: 0.75, speed: 1.12, souls: 1.5 },
  { name: 'MARDRÖM', dmg: 1.9, hp: 1.6, ammo: 0.6, speed: 1.22, souls: 2.2 },
];
const diff = () => DIFF[settings.diff];

// ---------- Asset-laddning ----------
const A = 'assets/';
const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('saknas: ' + src)); i.src = src; });
function pixels(img, w = img.width, h = img.height, sx = 0, sy = 0, sw = w, sh = h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  return { w, h, data: new Uint32Array(g.getImageData(0, 0, w, h).data.buffer) };
}
const strip = (img, n, scale = 1) => { const fw = Math.floor(img.width / n); return [...Array(n)].map((_, i) => pixels(img, Math.round(fw * scale), Math.round(img.height * scale), i * fw, 0, fw, img.height)); };
const grid = (img, fw, fh, cols, rows) => { const out = []; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push(pixels(img, fw, fh, c * fw, r * fh, fw, fh)); return out; };
const tex = {}, spr = {}, fx = {}, snd = {}, enemyFrames = {}, wimg = {}, bossFx = {};
const ENEMY_DEFS = {
  Q: { name: 'MIMIC', sheet: 'mimic', move: 'movement', hp: 12, speed: 1.9, melee: true, dmg: 15, range: 0.95, cd: 0.85, size: 0.95, growl: 'growl', score: 300, atkFps: 14, hitAt: 0.5, tip: 'KISTAN HADE TÄNDER' },
  S: { name: 'SKELETT', sheet: 'skeleton1', move: 'movement', hp: 5, speed: 1.35, melee: true, dmg: 9, range: 0.95, cd: 0.9, size: 1.0, growl: 'growl', score: 100, atkFps: 14, hitAt: 0.55 },
  K: { name: 'ELDSKELETT', sheet: 'skeleton2', move: 'movemen', hp: 6, speed: 0.95, melee: false, dmg: 8, range: 8.5, cd: 1.8, size: 1.05, growl: 'hiss', score: 150, atkFps: 12, hitAt: 0.5 },
  V: { name: 'VAMPYR', sheet: 'vampire', move: 'movement', hp: 9, speed: 2.15, melee: true, dmg: 14, range: 0.95, cd: 0.75, size: 1.1, growl: 'roar', score: 250, atkFps: 16, hitAt: 0.5 },
  // nya fiender med eget beteende (ai), 64-pixelsrutor från tools/enemy-sprites/prep.py
  I: { name: 'SMÅDJÄVUL', sheet: 'imp', fw: 64, move: 'movement', hp: 4, speed: 2.5, melee: true, dmg: 8, range: 0.9, cd: 0.7, size: 1.35, growl: 'hiss', score: 150, atkFps: 14, hitAt: 0.5, ai: 'blink', tip: 'HOPPAR UNDAN VID TRÄFF' },
  L: { name: 'BLODSLEM', sheet: 'blob', fw: 64, move: 'movement', hp: 10, speed: 0.75, melee: true, dmg: 11, range: 0.95, cd: 1.1, size: 1.6, growl: 'growl', score: 150, atkFps: 12, hitAt: 0.55, ai: 'split', tip: 'DELAR SIG NÄR DEN DÖR' },
  l: { name: 'BLODDROPPE', frames: 'L', hp: 2.5, speed: 1.8, melee: true, dmg: 5, range: 0.8, cd: 0.8, size: 0.95, growl: 'growl', score: 40, atkFps: 14, hitAt: 0.5 },
  N: { name: 'BENMAGIKER', sheet: 'mage', fw: 64, move: 'movement', hp: 7, speed: 0.9, melee: false, dmg: 10, range: 9, cd: 2.4, size: 1.0, growl: 'hiss', score: 300, atkFps: 12, hitAt: 0.75, ai: 'summon', proj: 'orb', kite: 3.5, tip: 'VÄCKER DE DÖDA' },
  O: { name: 'ORKSHAMAN', sheet: 'shaman', fw: 64, move: 'movement', hp: 6, speed: 1.15, melee: false, dmg: 6, range: 7, cd: 2.0, size: 1.0, growl: 'growl', score: 300, atkFps: 12, hitAt: 0.75, ai: 'heal', proj: 'bolt', kite: 4, tip: 'HELAR – DÖDA DEN FÖRST' },
  R: { name: 'GRAVRÖVARE', sheet: 'rogue', fw: 64, move: 'movement', hp: 6, speed: 2.3, melee: true, dmg: 12, range: 0.95, cd: 0.8, size: 1.0, growl: 'hiss', score: 250, atkFps: 16, hitAt: 0.5, ai: 'stealth', tip: 'OSYNLIG PÅ AVSTÅND' },
  W: { name: 'ORKKRIGARE', sheet: 'warrior', fw: 64, move: 'movement', hp: 16, speed: 1.05, melee: true, dmg: 16, range: 1.05, cd: 1.2, size: 1.1, growl: 'roar', score: 350, atkFps: 12, hitAt: 0.5, ai: 'charge', armor: 0.6, tip: 'STORMAR – LÅT DEN KROCKA' },
};
// Bossar: en per varv i slumpad ordning. arena = vilken bossarena gen.js bygger.
const BOSSES = {
  demon: { title: 'HERRE ÖVER BENHUSEN', name: 'BENDEMONEN', hp: 320, speed: 1.0, size: 2.6, dmg: 22, range: 3.2, arena: 'hall', phaseMsg: ['BENDEMONEN KALLAR PÅ DE DÖDA', 'BENDEMONEN RASAR!'] },
  beast: { title: 'GLÖDENS FÖRSTFÖDDE', name: 'HELVETESBESTEN', hp: 300, speed: 0.6, size: 2.5, dmg: 16, range: 2.5, arena: 'cave', phaseMsg: ['BESTEN SJUNKER NED I GLÖDEN', 'MARKEN BRINNER!'] },
  nightmare: { title: 'DEN SVARTA RIDTEN', name: 'MARDRÖMMEN', hp: 280, speed: 2.0, size: 2.3, dmg: 24, range: 1.6, arena: 'graveyard', phaseMsg: ['MARDRÖMMEN STEGRAR SIG', 'MARDRÖMMEN SKENAR!'] },
  ogre: { title: 'SKOGENS SLAKTARE', name: 'OGERN', hp: 420, speed: 1.3, size: 2.6, dmg: 26, range: 3.0, arena: 'forest', phaseMsg: ['OGERN KALLAR PÅ SINA SÖNER', 'OGERN BLIR RASANDE!'] },
  ghost: { title: 'DEN SOM ALDRIG SOVER', name: 'VÅLNADEN', hp: 260, speed: 1.6, size: 2.3, dmg: 14, range: 1.4, arena: 'graveyard', phaseMsg: ['VÅLNADEN VÄCKER DE DÖDA', 'VÅLNADENS SKRIK FYLLER LUFTEN!'] },
};
const BOSS_IDS = Object.keys(BOSSES);
// föremål i rummen: bild (prop_<img>.png), antal rutor, höjd, blockerar, ljus, hur de används
const PROP_DEFS = {
  c: { img: 'candles', n: 3, size: 0.78, anim: 7, light: 0.75 },
  j: { img: 'bones', size: 0.22 },
  k: { img: 'coffin', size: 0.38, block: true },
  q: { img: 'bookshelf', size: 1.0, block: true },
  u: { img: 'statue', size: 1.05, block: true },
  v: { img: 'cage', size: 0.95, block: true },
  w: { img: 'well', n: 2, size: 0.62, block: true, light: 0.55, use: 'well' },
  y: { img: 'altar', n: 2, size: 0.65, block: true, light: 0.55, use: 'altar' },
  e: { img: 'barrel_red', size: 0.55, block: true, boom: true },
  H: { img: 'armor', size: 0.95, block: true },
  J: { img: 'table', size: 0.5, block: true },
  T: { img: 'crate', size: 0.42, block: true, crate: true },
  z: { img: 'spikes', n: 2, size: 0.18, trap: true },
  i: { img: 'crystal', n: 2, size: 0.5, anim: 1.5, light: 0.7 },
  F: { img: 'mushroom', n: 2, size: 0.38, anim: 1.2, light: 0.45 },
};
const bossFor = depth => BOSSES[params.get('boss')] ? params.get('boss') : RNG(run.seed).fork('bossar').shuffle(BOSS_IDS.slice())[cycleOf(depth) % BOSS_IDS.length]; // ?boss=id för test
const ELITE_MODS = [
  { id: 'fast', name: 'SNABB', tint: [120, 220, 255] },
  { id: 'tough', name: 'SEG', tint: [180, 180, 180] },
  { id: 'vamp', name: 'BLODTÖRSTIG', tint: [255, 60, 60] },
  { id: 'explosive', name: 'EXPLOSIV', tint: [255, 170, 40] },
  { id: 'brute', name: 'BRUTAL', tint: [200, 90, 255] },
  { id: 'teleport', name: 'SPRÅNGANDE', tint: [255, 120, 220] },
  { id: 'regen', name: 'SEGLIVAD', tint: [110, 255, 140] },
  { id: 'shielded', name: 'SKÖLDAD', tint: [140, 190, 255] },
];
async function loadAll(setStatus) {
  const walls = ['wall_brick_stone_center', 'wall_brick_small_stone', 'wall_rock', 'wall_stone', 'wall_brick_stone_center_banner', 'door_metal_gate', 'door_wood',
    'wall_forest', 'wall_cemetery', 'wall_cave', 'wall_house', 'wall_house_window', ...BOSS_IDS.map(b => 'wall_boss_' + b)];
  const floors = ['floor_stone', 'floor_stone_pattern', 'floor_wood_planks', 'floor_tiles_blue',
    'floor_ground_grass', 'floor_ground_dirt', 'floor_grass_dead', 'floor_gravel', 'floor_cave', 'floor_mud', 'ceil_cave', ...BOSS_IDS.map(b => 'floor_boss_' + b)];
  for (const n of walls.concat(floors)) { try { tex[n] = pixels(await load(A + 'wall/' + n + '.png')); } catch (e) { if (!n.includes('_boss_')) throw e; } }
  setStatus('Laddar fiender…');
  for (const [k, d] of Object.entries(ENEMY_DEFS)) {
    if (d.frames) { enemyFrames[k] = enemyFrames[d.frames]; continue; }
    const sets = {};
    for (const [st, file] of [['idle', 'idle'], ['move', d.move], ['attack', 'attack'], ['pain', 'take_damage'], ['death', 'death']]) {
      const img = await load(`${A}gfx/enemies-${d.sheet}_${file}.png`);
      sets[st] = strip(img, Math.floor(img.width / (d.fw || 32)));
    }
    enemyFrames[k] = sets;
  }
  // bossen: vingad demon (Gothicvania, CC0), förminskad för snabbare sprite-ritning
  enemyFrames.B = {
    idle: strip(await load(A + 'gfx/boss_idle.png'), 6, 0.5),
    attack: strip(await load(A + 'gfx/boss_attack.png'), 18, 0.5),
    breath: strip(await load(A + 'gfx/boss_breath.png'), 18, 0.5),
  };
  // de andra bossarna (tools/boss-sprites/prep.py): [animation, antal rutor]
  const BOSS_SHEETS = { beast: [['idle', 6], ['breath', 4], ['burn', 4], ['pillar', 2]], nightmare: [['idle', 4], ['run', 3]],
    ogre: [['idle', 4], ['walk', 6], ['attack', 7]], ghost: [['idle', 7], ['chase', 4], ['shriek', 4], ['vanish', 7], ['appear', 6]] };
  for (const [id, anims] of Object.entries(BOSS_SHEETS)) {
    bossFx[id] = {};
    for (const [a, n] of anims) bossFx[id][a] = strip(await load(`${A}gfx/boss_${id}_${a}.png`), n);
  }
  setStatus('Laddar vapen…');
  for (const n of WEAPONS.map(w => w.id)) {
    wimg[n] = await load(`${A}gfx/fp_${n}.png`);
    spr['pick_' + n] = pixels(await load(`${A}gfx/pick_${n}.png`));
  }
  wimg.flash = await load(A + 'gfx/MuzzleFlash.png');
  spr.health = pixels(await load(A + 'gfx/health.png'));
  spr.armor = pixels(await load(A + 'gfx/armor.png'));
  spr.ammo = pixels(await load(A + 'gfx/ammo.png'));
  fx.fire = strip(await load(A + 'gfx/fire.png'), 16);
  fx.fireball = strip(await load(A + 'gfx/fireball.png'), 8);
  fx.hit = strip(await load(A + 'gfx/hit.png'), 8);
  fx.blood = strip(await load(A + 'gfx/blood.png'), 3);
  fx.pots = strip(await load(A + 'gfx/pots.png'), 4);
  fx.shards = grid(await load(A + 'gfx/shards.png'), 12, 12, 6, 4);
  fx.coin = strip(await load(A + 'gfx/coin.png'), 4);
  fx.chest = strip(await load(A + 'gfx/chest.png'), 4);
  fx.chestOpen = strip(await load(A + 'gfx/chest_open.png'), 4);
  fx.merchant = strip(await load(A + 'gfx/merchant.png'), 6);
  fx.portal = strip(await load(A + 'gfx/portal.png'), 8);
  // utomhus: natthimmel, träd och gravstenar
  spr.sky = pixels(await load(A + 'gfx/sky_night.png'));
  spr.cardback = pixels(await load(A + 'cards/back.png'), 24, 24);
  fx.trees = [pixels(await load(A + 'gfx/tree_1.png')), pixels(await load(A + 'gfx/tree_2.png'))];
  fx.graves = strip(await load(A + 'gfx/grave.png'), 3);
  fx.props = {}; // föremål i rummen (tools/props/make.py)
  for (const d of Object.values(PROP_DEFS)) if (!fx.props[d.img]) { try { fx.props[d.img] = strip(await load(`${A}gfx/prop_${d.img}.png`), d.n || 1); } catch (e) { /* valfri */ } }
  try { fx.crateBits = strip(await load(A + 'gfx/prop_crate_broken.png'), 4); } catch (e) { fx.crateBits = null; }
  fx.parts = {}; // biompartiklar (tools/props/make.py); saknas en används träffgnistan
  for (const [n, k] of [['leaf', 4], ['firefly', 2], ['drop', 1], ['rain', 1], ['fog', 1], ['bat', 4], ['ember', 2], ['dust', 1], ['wisp', 4], ['shell', 1], ['blood_pool', 3]]) {
    try { fx.parts[n] = strip(await load(`${A}gfx/part_${n}.png`), k); } catch (e) { /* valfri */ }
  }
  try { await document.fonts.load('8px "PressStart2P"'); } catch (e) { /* reservtypsnitt */ }
}

// ---------- Ljud (positionsljud med stereo) ----------
let actx = null, master = null;
const SOUNDS = ['shot', 'boom', 'pickup', 'health', 'hurt', 'splat', 'weapon', 'lose', 'win', 'growl', 'hiss', 'pain', 'roar', 'gore', 'drone', 'door', 'steps',
  'reload', 'click', 'shell', 'pot', 'secret', 'whoosh', 'ricochet', 'breath', 'armor', 'gate', 'fireburst', 'bossroar', 'coin', 'chest', 'card', 'buy', 'bigboom', 'stinger',
  'amb_wind', 'amb_drip', 'amb_rain', 'amb_frogs', 'amb_creepy', 'bell', 'moan', 'gasp', 'kick', 'bonesnap', 'step_grass', 'step_gravel', 'step_wood', 'gem', 'splash', 'music_boss', 'heart'];
async function loadSounds() {
  actx = new (window.AudioContext || window.webkitAudioContext)();
  master = actx.createGain(); master.connect(actx.destination); applyVolume();
  await Promise.all(SOUNDS.map(async n => {
    try { const r = await fetch(`${A}snd/${n}.ogg`); snd[n] = await actx.decodeAudioData(await r.arrayBuffer()); } catch (e) { /* ljud är valfritt */ }
  }));
}
function applyVolume() { if (master) master.gain.value = settings.muted ? 0 : settings.vol; }
function play(name, vol = 1, rate = 1, opt = {}) {
  if (!actx || !snd[name]) return null;
  let v = vol, pan = 0;
  if (opt.x !== undefined) {
    const dx = opt.x - P.x, dy = opt.y - P.y, d = Math.hypot(dx, dy);
    if (d > 22) return null;
    v *= clamp(1 - d / 22, 0, 1) ** 1.4;
    if (map && !hasLOS(P.x, P.y, opt.x, opt.y)) v *= 0.45;
    pan = clamp(Math.sin(Math.atan2(dy, dx) - P.a), -1, 1) * 0.8;
  }
  const s = actx.createBufferSource(); s.buffer = snd[name]; s.playbackRate.value = rate; s.loop = !!opt.loop;
  const g = actx.createGain(); g.gain.value = v;
  let node = s.connect(g);
  if (pan && actx.createStereoPanner) { const p = actx.createStereoPanner(); p.pan.value = pan; node = node.connect(p); }
  node.connect(master); s.start();
  return { s, g };
}

// ---------- Vapen ----------
const WEAPONS = [
  { id: 'pistol', name: 'PISTOL', short: 'PISTOL', ammo: 'p9', mag: 9, dmg: 2.2, pellets: 1, spread: 0.012, delay: 0.3, auto: false, sound: ['shot', 1.15, 0.85], flash: 0.75, kick: 0.8, reload: 1.1, falloff: [7, 18, 0.5], recoil: [0.012, -0.006] },
  { id: 'shotgun', name: 'HAGELGEVÄR', short: 'HAGEL', ammo: 'shells', mag: 6, dmg: 1.7, pellets: 9, spread: 0.07, delay: 0.95, auto: false, sound: ['boom', 0.8, 0.9], flash: 1.4, kick: 2.2, shellReload: true, reload: 0, falloff: [3, 11, 0.35], recoil: [0.02] },
  { id: 'rifle', name: 'GEVÄR', short: 'GEVÄR', ammo: 'r556', mag: 24, dmg: 2.8, pellets: 1, spread: 0.014, delay: 0.13, auto: true, sound: ['shot', 0.82, 0.9], flash: 1.0, kick: 0.9, reload: 1.7, falloff: [12, 30, 0.6], recoil: [0.004, 0.006, -0.003, 0.007, -0.005, 0.004, -0.006] },
  { id: 'smg', name: 'KULSPRUTEPISTOL', short: 'KPIST', ammo: 'p9', mag: 32, dmg: 1.5, pellets: 1, spread: 0.035, delay: 0.085, auto: true, sound: ['shot', 1.45, 0.65], flash: 0.75, kick: 0.5, reload: 1.5, falloff: [6, 16, 0.45], recoil: [0.003, -0.004, 0.005, -0.002, 0.004, -0.005] },
  // fyra vapen ur andra modellpaket (tools/weapon-frames/render-static.mjs)
  { id: 'dbshotgun', name: 'DUBBELBÖSSA', short: 'DUBBEL', ammo: 'shells', mag: 2, dmg: 1.9, pellets: 10, spread: 0.08, delay: 0.25, auto: false, sound: ['boom', 0.7, 1.0], flash: 1.6, kick: 2.6, reload: 1.5, falloff: [3, 10, 0.3], recoil: [0.025, -0.02] },
  { id: 'crossbow', name: 'ARMBORST', short: 'ARMBST', ammo: 'bolts', mag: 1, dmg: 10, pellets: 1, spread: 0.004, delay: 0.2, auto: false, sound: ['whoosh', 1.3, 0.8], flash: 0, kick: 0.5, reload: 0.85, falloff: [30, 40, 1], recoil: [0.004], silent: true, pierceAll: true },
  { id: 'flaregun', name: 'SIGNALPISTOL', short: 'SIGNAL', ammo: 'flares', mag: 1, dmg: 4, pellets: 1, spread: 0.01, delay: 0.3, auto: false, sound: ['shot', 0.6, 0.7], flash: 1.2, kick: 1.0, reload: 1.1, falloff: [30, 40, 1], recoil: [0.01], proj: 'flare' },
  { id: 'sniper', name: 'PRICKSKYTTEGEVÄR', short: 'PRICK', ammo: 'r556', mag: 5, dmg: 14, pellets: 1, spread: 0.002, delay: 1.0, auto: false, sound: ['boom', 1.25, 0.85], flash: 1.1, kick: 2.8, reload: 2.2, falloff: [40, 50, 1], recoil: [0.015, -0.01], pierce: 2, zoom: 0.5, hip: 0.05 },
];
const AMMO = { p9: { name: '9MM', max: 200 }, r556: { name: '5.56', max: 150 }, shells: { name: 'PATRONER', max: 50 }, bolts: { name: 'PILAR', max: 40 }, flares: { name: 'BLOSS', max: 24 } };
const NOAMMO = () => ({ p9: 36, r556: 0, shells: 0, bolts: 0, flares: 0 });
const weaponIndex = id => WEAPONS.findIndex(w => w.id === id);
// tecknet för vapnet på kartan (gen.js) -> vapnets id
const WEAPON_CHAR = { g: 'shotgun', r: 'rifle', m: 'smg', d: 'dbshotgun', b: 'crossbow', s: 'flaregun', p: 'sniper' };
const WF = window.WEAPON_FRAMES;

// ---------- Spelstate ----------
const P = { pitch: 0, ryaw: 0, burst: 0, burstT: 0, chainN: 0, iframe: 0, slowT: 0, kickT: 0, lastWeapon: 0, boom: 0, x: 2, y: 2, a: 0, vx: 0, vy: 0, hp: 100, armor: 0, shield: 0, shieldT: 0, haste: 0, weapon: 0, has: [true, false, false, false, false, false, false, false],
  ammo: { p9: 36, r556: 0, shells: 0, bolts: 0, flares: 0 }, mags: [9, 0, 0, 0, 0, 0, 0, 0], flash: 0, bob: 0, bobAmp: 0, hurt: 0, pick: 0, shake: 0, camZ: 0.5, deadT: 0 };
const WS = { state: 'draw', t: 0, aim: 0, next: -1, shot: 99, cd: 0, swayX: 0, swayY: 0, spread: 0, shellPhase: '', spin: 0, focus: 0, hunt: false, kick: 0, boost: false, tried: false, nameT: 0, punch: 0, lowWarned: {} };
let portals = []; // portaler: 'floor' leder till nästa våning, 'boss' låter en välja mellan djupare och att avsluta
let map, mw, mh, doors, ents, items, pots, torches, chests, merchants, particles, projectiles, light, flow, flowCell = -1, seen;
let lvl, totalEnemies, kills, secrets, totalSecrets, itemsTaken, totalItems, levelTime = 0, boss = null, bossBanner = 0;
let state = 'title', tmr = 0, score = 0, showMap = settings.map ?? 1, hitMark = 0, hitKill = false, hitCrit = false, hurtDir = [], breathSnd = null, ambient = null, stepT = 0, fireHeld = false;
let run = null, M = {}, hint = '', hitStop = 0, slowmo = 0, levelBanner = 0;
const lvlStat = { shots: 0, hits: 0, taken: 0 };
const shakeAmt = () => { const tr = Math.min(1, P.shake / 2.5); return tr * tr * (settings.shake ?? 1); }; // trauma²: små träffar knappt märks, stora slår till
const msgs = [];
const keys = {};
let mouseDown = false, aimDown = false;
const mod = k => M[k] || 0;
let UP = new Set(); // vapenuppgraderingar (kortens wup) för vapnet man har svurit sig till
function recomputeMods() {
  M = window.Cards && run ? Cards.computeMods(run.owned) : {};
  UP = new Set(window.Cards && run ? run.owned.map(id => Cards.byId(id)).filter(c => c && c.wup).map(c => c.wup) : []);
}
const up = k => UP.has(k) && !!run && WEAPONS[P.weapon].id === run.pact;

const plain = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
function say(t, d = 2.5) { msgs.unshift({ text: plain(t), t: d }); if (msgs.length > 3) msgs.length = 3; }

// ---------- Runda och våningar ----------
const dailySeed = () => { const d = new Date(); return RNG.hash(`krypta-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`); };
const seedText = s => (s >>> 0).toString(36).toUpperCase();
// dagens runda har en utmaning som gäller hela rundan
const DAILY_MODS = [
  { id: 'glass', name: 'GLASKANON', text: 'DU GÖR OCH TAR 50 % MER SKADA' },
  { id: 'gold', name: 'GULDFEBER', text: 'DUBBELT GULD, 30 % SÄMRE HELNING' },
  { id: 'dark', name: 'MÖRKRET', text: 'MYCKET MÖRKARE, MEN FIENDERNA SER SÄMRE' },
  { id: 'swift', name: 'DE SNABBA DÖDA', text: 'FIENDERNA ÄR 25 % SNABBARE OCH GER 50 % MER GULD' },
  { id: 'elite', name: 'ELITJAKTEN', text: 'FLER ELITER, VARJE ELIT TAPPAR ETT KORT' },
];
const dmod = id => !!(run && run.modifier && run.modifier.id === id);
function newRun(seed, daily) {
  run = { seed: seed >>> 0, daily: !!daily, depth: 0, owned: [], gold: 25 * meta('gold'), kills: 0, time: 0, livesUsed: 0, souls: 0, rerolls: 0, diff: settings.diff, bossKilled: false };
  run.cardRng = RNG(run.seed).fork('kort');
  if (daily) run.modifier = RNG(run.seed).fork('dagens').pick(DAILY_MODS);
  resetPlayer(); recomputeMods();
  profile.runs++; saveProfile();
}
function weaponFor(depth) { // ett nytt vapen per våning i slumpad ordning; de sista dyker upp i varv 2
  const order = RNG(run.seed).fork('vapen').shuffle(Object.keys(WEAPON_CHAR));
  const want = order[depth - 1 - cycleOf(depth)];
  if (!want) return null;
  return P.has[weaponIndex(WEAPON_CHAR[want])] ? null : want;
}
// biomer: varje varv går igenom alla fem i slumpad ordning (?biome=id för test)
const BIOME_IDS = ['dungeon', 'caves', 'graveyard', 'forest', 'courtyard'];
const biomeFor = depth => BIOME_IDS.includes(params.get('biome')) ? params.get('biome')
  : RNG(run.seed).fork('biom' + cycleOf(depth)).shuffle(BIOME_IDS.slice())[(cyclePos(depth) - 1) % BIOME_IDS.length];
// väktaren på varje vanlig våning: en annan boss än varvets egen, i mindre format
const guardianFor = depth => { const own = bossFor((cycleOf(depth) + 1) * (FLOORS + 1)); return RNG(run.seed).fork('väktare' + depth).pick(BOSS_IDS.filter(b => b !== own)); };
function loadFloor(depth) {
  run.depth = depth;
  const c = cycleOf(depth), pos = cyclePos(depth);
  const level = !isBossDepth(depth)
    ? Gen.floor(RNG.hash(run.seed + ':' + depth), Math.min(5, pos + c), { shop: pos === 2 || pos === 4, weapon: weaponFor(depth), biome: biomeFor(depth), guardian: guardianFor(depth) })
    : Gen.boss(RNG.hash(run.seed + ':boss' + (c ? ':' + c : '')), { arena: BOSSES[bossFor(depth)].arena, boss: bossFor(depth) });
  if (isBossDepth(depth)) level.bossId = bossFor(depth);
  startLevel(level);
  P.armor = Math.min(200, P.armor + mod('armorPerFloor'));
  saveRun();
}
function saveRun() { // ögonblicksbild vid våningens start, raderas vid död (permadöd)
  store.set('run', { run: Object.assign({}, run, { cardRng: undefined }), p: { hp: P.hp, armor: P.armor, has: P.has, ammo: P.ammo, mags: P.mags, weapon: P.weapon }, score });
}
function loadRunSave() {
  const s = store.get('run', null); if (!s) return false;
  run = Object.assign({}, s.run); run.cardRng = RNG(RNG.hash(run.seed + ':kort:' + run.depth));
  const pad = (a, v) => WEAPONS.map((_, i) => a[i] ?? v); // äldre sparningar hade fyra vapen
  Object.assign(P, { hp: s.p.hp, armor: s.p.armor, has: pad(s.p.has, false), ammo: Object.assign(NOAMMO(), s.p.ammo), mags: pad(s.p.mags, 0), weapon: s.p.weapon });
  score = s.score; settings.diff = run.diff; recomputeMods();
  return true;
}
function resetPlayer() {
  P.has = WEAPONS.map((_, i) => i === 0); P.weapon = 0; P.ammo = NOAMMO(); P.mags = WEAPONS.map((_, i) => i === 0 ? 9 : 0); P.hp = 100; P.armor = 0; P.shield = 0; score = 0;
  P.ammo.p9 = Math.round(P.ammo.p9 * (1 + 0.5 * meta('ammo'))); P.armor = 25 * meta('armor'); P.hp = 100 + meta('hp') * 10; // själaaltaret
}
function startLevel(level) {
  lvl = level;
  map = lvl.map.map(r => r.split('')); mh = map.length; mw = map[0].length;
  doors = {}; ents = []; items = []; pots = []; torches = []; chests = []; merchants = []; particles = []; projectiles = []; numbers.length = 0; fuses.length = 0; portals = []; hazards = []; decals.length = 0;
  lvlStat.shots = lvlStat.hits = lvlStat.taken = 0;
  guardianE = null; kills = 0; totalEnemies = 0; secrets = 0; totalSecrets = 0; itemsTaken = 0; totalItems = 0; levelTime = 0; boss = null; bossBanner = 0;
  light = new Float32Array(mw * mh); seen = new Uint8Array(mw * mh); flow = new Int16Array(mw * mh).fill(-1); flowCell = -1;
  const lrng = RNG(RNG.hash(run.seed + ':spawn:' + run.depth));
  const itemOf = { h: 'health', a: 'ammo', A: 'armor', $: 'goldpile', ...WEAPON_CHAR };
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    const c = map[y][x], cx = x + 0.5, cy = y + 0.5;
    if (c === 'P') { P.x = cx; P.y = cy; P.a = startAngle(x, y); map[y][x] = '.'; }
    else if (c === 'Q') { const e = makeEnemy(c, cx, cy); e.dormant = true; ents.push(e); map[y][x] = '.'; } // mimicen räknas först när den vaknar
    else if (c === 'Z') { const g = makeGuardian(cx, cy); if (g) { ents.push(g); totalEnemies++; } map[y][x] = '.'; }
    else if (ENEMY_DEFS[c]) { ents.push(makeEnemy(c, cx, cy)); totalEnemies++; map[y][x] = '.'; }
    else if (c === 'E' || (dmod('elite') && ENEMY_DEFS[c] && lrng.chance(0.15))) { ents.push(makeElite(lrng, cx, cy)); totalEnemies++; map[y][x] = '.'; }
    else if (c === 'B') { boss = makeBoss(cx, cy); ents.push(boss); totalEnemies++; map[y][x] = '.'; }
    else if (itemOf[c]) { items.push({ type: itemOf[c], x: cx, y: cy, taken: false }); totalItems++; map[y][x] = '.'; }
    else if (c === 'D' || c === 'G' || c === '*') { doors[x + ',' + y] = { open: 0, target: 0, gate: c === 'G', secret: c === '*', x, y }; if (c === '*') totalSecrets++; }
    else if (c === 'x') { map[y][x] = '.'; lvl.exit = { x, y }; }
    else if (c === 'f') { torches.push({ x: cx, y: cy, ph: Math.random() * 10, cells: [] }); }
    else if (c === 'o') { pots.push({ x: cx, y: cy, color: (x * 7 + y * 3) % 4, broken: false, loot: lrng.chance(0.5) ? lrng.pick(['ammo', 'health', 'gold', 'gold']) : null }); map[y][x] = '.'; }
    else if (c === 'C') { chests.push({ x: cx, y: cy, open: false, t: 0 }); totalItems++; map[y][x] = '.'; }
    else if (c === 'M') { merchants.push({ x: cx, y: cy, stock: null }); } // köpmannen blockerar sin ruta
  }
  floorTexs = (lvl.floors || [lvl.floor]).map(n => tex[n] || tex.floor_stone);
  cellFloor = new Uint8Array(mw * mh); cellSky = new Uint8Array(mw * mh); props = [];
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    if (lvl.floorMask) cellFloor[y * mw + x] = Math.min(floorTexs.length - 1, +lvl.floorMask[y][x] || 0);
    if (lvl.sky) cellSky[y * mw + x] = lvl.sky[y][x] === '1' ? 1 : 0;
    const c = map[y][x], h = (x * 73856093 ^ y * 19349663) >>> 0;
    if (c === 't') props.push({ x: x + 0.5 + ((h % 7) - 3) * 0.03, y: y + 0.5 + (((h >> 3) % 7) - 3) * 0.03, img: fx.trees[h % 2], size: 1.45 + (h % 5) * 0.08, flip: !!(h & 16) });
    else if (c === 'n') props.push({ x: x + 0.5, y: y + 0.5, img: fx.graves[h % 3], size: 0.62, flip: false });
    else if (PROP_DEFS[c] && fx.props[PROP_DEFS[c].img]) {
      const d = PROP_DEFS[c], frames = fx.props[d.img];
      const o = { x: x + 0.5, y: y + 0.5, cx: x, cy: y, ch: c, def: d, frames, img: frames[0], size: d.size, flip: !d.n && !!(h & 16), ph: (h % 100) / 10 };
      props.push(o);
      if (d.light) torches.push({ x: o.x, y: o.y, ph: o.ph, cells: [], hidden: true, str: d.light, r: 4, prop: o });
      if (!d.block) map[y][x] = '.'; // ben, ljus, svamp och fällor går att gå över
    }
  }
  prepareTorchLight();
  P.vx = P.vy = 0; P.flash = 0; P.hurt = 0; P.camZ = 0.5; P.deadT = 0; P.shake = 0; P.haste = 0;
  P.hp = Math.min(P.hp, maxHp()); P.shield = mod('shield');
  WS.state = 'draw'; WS.t = 0; WS.aim = 0; WS.shot = 99;
  hurtDir = []; msgs.length = 0;
  state = 'play';
  if (!boss) levelBanner = 3; // stort titelkort med namn och biom
  else say(lvl.name, 3);
  if (boss) { bossBanner = 3.5; slowmo = 1.2; play('stinger', 0.8); setTimeout(() => play('bossroar', 0.9, 0.8), 600); }
  startAmbient(); buildGrade(); fogK = biomeFx().fogK; lightning = 0; lightningT = rnd(4, 10);
  setMusic(!!boss);
}
function startAngle(x, y) { // titta mot den längsta öppna riktningen
  let best = 0, bd = -1;
  for (const [a, dx, dy] of [[0, 1, 0], [Math.PI / 2, 0, 1], [Math.PI, -1, 0], [-Math.PI / 2, 0, -1]]) {
    let d = 0; while (d < 30 && !isWallChar(cellAt(x + dx * (d + 1), y + dy * (d + 1)))) d++;
    if (d > bd) { bd = d; best = a; }
  }
  return best;
}

const depthHp = () => 1 + 0.2 * Math.max(0, run.depth - 1);
function makeEnemy(type, x, y) {
  const d = ENEMY_DEFS[type], hp = d.hp * diff().hp * depthHp();
  return { type, d, x, y, hp, maxHp: hp, flank: [-1, 0, 1][(Math.random() * 3) | 0], state: 'idle', t: Math.random() * 3, cd: 1, alert: false, flip: Math.random() < 0.5, dead: false, flash: 0, growlT: 2 + Math.random() * 4, didHit: false, burn: 0, slow: 0, burnAcc: 0 };
}
function makeElite(rng, x, y) {
  const type = rng.pick(run.depth >= 3 ? ['S', 'K', 'V', 'L', 'I', 'W', 'R'] : run.depth >= 2 ? ['S', 'K', 'V', 'L', 'I'] : ['S', 'K', 'L']);
  const e = makeEnemy(type, x, y), m = rng.pick(ELITE_MODS);
  e.elite = m; e.hp = e.maxHp = e.maxHp * (m.id === 'tough' ? 4 : 2.4);
  if (m.id === 'shielded') e.eshield = e.eshieldMax = e.maxHp * 0.6; // skölden tar skadan först
  // djupare varv: eliter kan få en andra egenskap
  if (cycleOf(run.depth) > 0 && rng.chance(0.5)) { const m2 = rng.pick(ELITE_MODS.filter(x => x !== m && x.id !== 'tough')); e.elite2 = m2; e.elite = { ...m, name: m.name + ' & ' + m2.name }; if (m2.id === 'shielded') e.eshield = e.eshieldMax = e.maxHp * 0.6; }
  e.d = Object.assign({}, e.d, { size: e.d.size * 1.3, speed: e.d.speed * (m.id === 'fast' ? 1.7 : 1), dmg: e.d.dmg * (m.id === 'brute' ? 1.8 : 1.2), cd: e.d.cd * (m.id === 'fast' ? 0.7 : 1) });
  return e;
}
function makeGuardian(x, y) { // väktaren: en mindre version av en boss, vaktar sitt rum på vanliga våningar
  const id = lvl.guardian; if (!BOSSES[id]) return null;
  const def = BOSSES[id], hp = def.hp * 0.32 * diff().hp * depthHp() * (1 + 0.4 * cycleOf(run.depth));
  const d = { ...def, name: 'VÄKTAREN ' + def.name, size: def.size * 0.72, dmg: def.dmg * 0.7, range: def.range * 0.8, melee: true, score: 1500, growl: 'bossroar', cd: 2,
    phaseMsg: def.phaseMsg.map(m => m.replace(def.name, 'VÄKTAREN')) };
  return { type: 'B', boss: true, guardian: true, id, d, x, y, hp, maxHp: hp, state: 'idle', t: 0, cd: 2.5, alert: false, asleep: true, flip: false, dead: false, flash: 0, growlT: 6, phase: 1, summonT: 14, burn: 0, slow: 0, burnAcc: 0, dying: 0 };
}
let guardianE = null; // väktaren man slåss mot just nu
function wakeGuardian(g) {
  g.asleep = false; guardianE = g; setMusic(true); bossBanner = 2.5; levelBanner = 0; slowmo = 0.6; play('stinger', 0.7); play('bossroar', 0.8, 1.1, { x: g.x, y: g.y });
  // stäng och försegla dörrarna till väktarens rum
  const room = (lvl.rooms || []).find(r => r.type === 'guardian' && g.x >= r.x && g.y >= r.y && g.x < r.x + r.w && g.y < r.y + r.h);
  for (const d of Object.values(doors)) {
    if (d.secret) continue;
    const near = room ? d.x >= room.x - 1 && d.y >= room.y - 1 && d.x <= room.x + room.w && d.y <= room.y + room.h : Math.hypot(d.x + 0.5 - g.x, d.y + 0.5 - g.y) < 8;
    if (!near) continue;
    d.glock = true; if (!occupied(d)) d.target = 0;
  }
  if (Object.values(doors).some(d => d.glock)) { say('DÖRRARNA SLÅS IGEN!', 2); play('gate', 0.8, 0.8); }
}
function finishGuardian(g) {
  kills++; run.kills++; run.guardians = (run.guardians || 0) + 1; profile.guardians = (profile.guardians || 0) + 1; saveProfile(); checkAch();
  guardianE = null; setMusic(false); play('bigboom', 0.8, 0.9); P.shake = 2;
  say(g.d.name + ' ÄR BESEGRAD!', 3);
  for (let i = 0; i < 8; i++) dropItem('gold', g.x + rnd(-0.8, 0.8), g.y + rnd(-0.8, 0.8));
  items.push({ type: 'cardpick', x: g.x, y: g.y, taken: false, drop: true, luck: 0.9, title: 'VÄKTARENS SKATT' });
  for (const d of Object.values(doors)) if (d.glock) { d.glock = false; d.target = 1; }
  if (!portals.length) spawnPortal(g.x, g.y, 'floor');
}
function makeBoss(x, y) {
  const id = lvl.bossId || 'demon', def = BOSSES[id];
  const hp = def.hp * diff().hp * (1 + 0.6 * cycleOf(run.depth));
  return { type: 'B', boss: true, id, d: { ...def, melee: true, score: 5000, growl: 'bossroar', cd: 2 }, x, y, hp, maxHp: hp, state: 'idle', t: 0, cd: 2.5, alert: true, flip: false, dead: false, flash: 0, growlT: 6, phase: 1, summonT: 10, burn: 0, slow: 0, burnAcc: 0, dying: 0 };
}

// ---------- Kollision / kartfrågor ----------
function cellAt(x, y) { if (x < 0 || y < 0 || x >= mw || y >= mh) return '1'; return map[y | 0][x | 0]; }
function isWallChar(c) { return (c >= '1' && c <= '9') || c === '#' || c === '%' || c === '~' || c === '&' || c === '='; } // 6 skog, 7 kyrkogårdsmur, 8 grotta, 9 husvägg, #%~&= bossväggar
const isPropChar = c => c === 't' || c === 'n' || !!(PROP_DEFS[c] && PROP_DEFS[c].block); // träd, gravstenar och möbler: blockerar men är sprites
const isDoorChar = c => c === 'D' || c === 'G' || c === '*';
function doorAt(x, y) { return doors[(x | 0) + ',' + (y | 0)]; }
function solid(x, y) {
  const c = cellAt(x, y);
  if (isWallChar(c) || c === 'f' || c === 'M' || isPropChar(c)) return true;
  if (isDoorChar(c)) return doorAt(x, y).open < 0.85;
  return false;
}
function tryMove(o, dx, dy, r) {
  const nx = o.x + dx, ny = o.y + dy;
  if (dx && !solid(nx + Math.sign(dx) * r, o.y) && !solid(nx + Math.sign(dx) * r, o.y + r * 0.9) && !solid(nx + Math.sign(dx) * r, o.y - r * 0.9)) o.x = nx;
  if (dy && !solid(o.x, ny + Math.sign(dy) * r) && !solid(o.x + r * 0.9, ny + Math.sign(dy) * r) && !solid(o.x - r * 0.9, ny + Math.sign(dy) * r)) o.y = ny;
}
function pushOut(o, cx, cy, minD) { // skjut ut ur en cirkel (krukor, fiender, kistor)
  const dx = o.x - cx, dy = o.y - cy, d = Math.hypot(dx, dy);
  if (d < minD && d > 1e-4) tryMove(o, dx / d * (minD - d), dy / d * (minD - d), 0.24);
}
// Raycast i rutnätet. Returnerar { dist, side, cell, wx, lx, ly (rutan framför väggen) }
function cast(ox, oy, dx, dy, maxD = 48, mark) {
  let mx = ox | 0, my = oy | 0;
  const ddx = Math.abs(1 / (dx || 1e-9)), ddy = Math.abs(1 / (dy || 1e-9));
  let sx, sy, sdx, sdy;
  if (dx < 0) { sx = -1; sdx = (ox - mx) * ddx; } else { sx = 1; sdx = (mx + 1 - ox) * ddx; }
  if (dy < 0) { sy = -1; sdy = (oy - my) * ddy; } else { sy = 1; sdy = (my + 1 - oy) * ddy; }
  let side = 0, dist = 0;
  for (let i = 0; i < 120; i++) {
    const lx = mx, ly = my;
    if (mark) seen[my * mw + mx] = 1;
    if (sdx < sdy) { dist = sdx; sdx += ddx; mx += sx; side = 0; } else { dist = sdy; sdy += ddy; my += sy; side = 1; }
    if (dist > maxD) return { dist: maxD, side, cell: '1', wx: 0, lx, ly };
    if (mx < 0 || my < 0 || mx >= mw || my >= mh) return { dist, side, cell: '1', wx: 0, lx, ly };
    const c = map[my][mx];
    if (isWallChar(c)) { if (mark) seen[my * mw + mx] = 1; return { dist, side, cell: c, wx: wallX(ox, oy, dx, dy, dist, side), mx, my, lx, ly }; }
    if (isDoorChar(c)) {
      const d = doors[mx + ',' + my];
      if (mark) seen[my * mw + mx] = 1;
      if (d.open >= 0.999) continue;
      const wx = wallX(ox, oy, dx, dy, dist, side);
      if (wx < d.open) continue; // dörren har glidit undan här
      return { dist, side, cell: c, wx: wx - d.open, mx, my, lx, ly, door: d };
    }
  }
  return { dist: maxD, side, cell: '1', wx: 0, lx: mx, ly: my };
}
function wallX(ox, oy, dx, dy, dist, side) { const w = side === 0 ? oy + dist * dy : ox + dist * dx; return w - Math.floor(w); }
function hasLOS(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
  if (d < 0.01) return true;
  const r = cast(ax, ay, dx / d, dy / d, d + 1);
  return r.dist >= d - 0.05;
}

// ---------- Ljus: grundljus + flimrande eldfat + mynningsblixtar ----------
function prepareTorchLight() {
  for (const t of torches) {
    for (let y = Math.max(0, (t.y | 0) - 7); y < Math.min(mh, (t.y | 0) + 8); y++) for (let x = Math.max(0, (t.x | 0) - 7); x < Math.min(mw, (t.x | 0) + 8); x++) {
      const d = Math.hypot(x + 0.5 - t.x, y + 0.5 - t.y);
      const r = t.r || 7;
      if (d > r || isWallChar(map[y][x])) continue;
      if (!hasLOS(t.x, t.y, x + 0.5, y + 0.5)) continue;
      t.cells.push([y * mw + x, Math.pow(1 - d / r, 1.5) * (t.str || 1.3)]);
    }
  }
}
function updateLight() {
  light.fill(lvl.ambient * (dmod('dark') ? 0.6 : 1));
  for (const t of torches) {
    const fl = 0.85 + 0.1 * Math.sin(tmr * 9 + t.ph) + 0.06 * Math.sin(tmr * 23 + t.ph * 3);
    const k = t.prop && t.prop.used ? 0.15 : 1; // använd brunn och släckt altare lyser knappt
    for (const [i, w] of t.cells) light[i] += w * fl * k;
  }
  const flashLight = (lx, ly, strength, r) => {
    for (let y = Math.max(0, (ly | 0) - r); y < Math.min(mh, (ly | 0) + r + 1); y++) for (let x = Math.max(0, (lx | 0) - r); x < Math.min(mw, (lx | 0) + r + 1); x++) {
      const d = Math.hypot(x + 0.5 - lx, y + 0.5 - ly); if (d < r) light[y * mw + x] += strength * (1 - d / r);
    }
  };
  flashLight(P.x, P.y, 0.22 + mod('light') * 0.25, 3 + Math.round(mod('light'))); // eget sken
  if (P.flash > 0) flashLight(P.x, P.y, P.flash * 9, 4);
  for (const pr of projectiles) flashLight(pr.x, pr.y, 0.5, 3);
  for (const f of flashes) flashLight(f.x, f.y, f.t * 5, f.r | 0);
  for (const c of chests) if (!c.open) flashLight(c.x, c.y, 0.18, 2);
  if (lvl.exit) flashLight(lvl.exit.x + 0.5, lvl.exit.y + 0.5, 0.35 + 0.1 * Math.sin(tmr * 3), 3); // utgången lyser
  for (const p of portals) flashLight(p.x, p.y, 0.7, 4);
}
const lightAt = (x, y) => (x < 0 || y < 0 || x >= mw || y >= mh) ? lvl.ambient : light[(y | 0) * mw + (x | 0)];

// ---------- Biomernas särdrag: färgton, dimma, ljudmattor och väder ----------
// grade = färgton (r, g, b) över hela bilden, fogK = hur tät dimman är, amb = ljudslingor [namn, volym, fart]
const BIOME_FX = {
  dungeon: { grade: [1.06, 0.96, 0.84], fogK: 0.085, amb: [['drone', 0.3, 1], ['amb_creepy', 0.12, 1]], weather: 'dust' },
  caves: { grade: [0.84, 0.98, 1.12], fogK: 0.11, amb: [['drone', 0.25, 0.8], ['amb_drip', 0.35, 1]], weather: 'drips' },
  graveyard: { grade: [0.8, 0.9, 1.16], fogK: 0.07, amb: [['amb_wind', 0.32, 0.9]], weather: 'groundfog' },
  forest: { grade: [0.86, 1.08, 0.84], fogK: 0.09, amb: [['amb_wind', 0.18, 1.1], ['amb_frogs', 0.22, 1]], weather: 'leaves' },
  courtyard: { grade: [1.0, 0.95, 1.02], fogK: 0.075, amb: [['amb_rain', 0.32, 1], ['drone', 0.12, 1.2]], weather: 'rain' },
};
const BIOME_NAME = { dungeon: 'KRYPTAN', caves: 'GROTTORNA', graveyard: 'KYRKOGÅRDEN', forest: 'SKOGEN', courtyard: 'BORGGÅRDEN' };
const biomeFx = () => BIOME_FX[lvl && lvl.biome] || BIOME_FX.dungeon;
const gradeLUT = [new Uint8ClampedArray(256), new Uint8ClampedArray(256), new Uint8ClampedArray(256)];
function buildGrade() { // färgtonen som uppslagstabeller; ljusstyrkan (gamma) från inställningarna ingår
  const g = biomeFx().grade, gam = 1 / clamp(settings.gamma || 1, 0.6, 1.8);
  for (let c = 0; c < 3; c++) for (let i = 0; i < 256; i++) gradeLUT[c][i] = 255 * Math.pow(i / 255, gam) * g[c];
}
function applyGrade() {
  const [lr, lg, lb] = gradeLUT;
  for (let i = 0; i < px.length; i++) { const c = px[i]; px[i] = 0xff000000 | (lb[(c >> 16) & 255] << 16) | (lg[(c >> 8) & 255] << 8) | lr[c & 255]; }
}
let fpsN = 0, fpsT = 0, fpsShow = 0, heartT = 0, ambLoops = [], lightning = 0, lightningT = 10, musicSnd = null, crackleT = 2;
function stopAmbient() { for (const a of ambLoops) try { a.s.stop(); } catch (e) { /* redan stoppad */ } ambLoops = []; ambient = null; }
function startAmbient() {
  stopAmbient();
  ambLoops = biomeFx().amb.map(([n, v, r]) => play(n, v, r, { loop: true })).filter(Boolean);
  ambient = ambLoops[0] || null;
}
function setMusic(on) { // bossmusik under bosstrider
  if (on && !musicSnd) musicSnd = play('music_boss', 0.45, 1, { loop: true });
  if (!on && musicSnd) { try { musicSnd.s.stop(); } catch (e) { /* redan stoppad */ } musicSnd = null; }
}
// väder och svävande partiklar runt spelaren
function updateWeather(dt) {
  if (settings.lowfx && Math.random() < 0.6) dt *= 0; // minskade effekter: färre partiklar
  const w = biomeFx().weather, near = (r = 6) => { const a = rnd(0, TAU), d = rnd(0.5, r); return [P.x + Math.cos(a) * d, P.y + Math.sin(a) * d]; };
  const ok = (x, y) => x > 0 && y > 0 && x < mw && y < mh && !solid(x, y);
  const pp = n => fx.parts[n] || fx.hit;
  const add = (o, n) => { o.frames = pp(n); o.img = o.frames[0]; o.maxLife = o.life; o.drift = true; particles.push(o); };
  if (w === 'leaves' && Math.random() < dt * 5) { const [x, y] = near(); if (ok(x, y)) add({ x, y, z: 1.1, vx: rnd(-0.4, 0.4), vy: rnd(-0.4, 0.4), vz: -0.35, life: 3, size: 0.09, sway: rnd(0, 6) }, 'leaf'); }
  if (w === 'leaves' && Math.random() < dt * 3) { const [x, y] = near(); if (ok(x, y)) add({ x, y, z: rnd(0.2, 0.8), vx: rnd(-0.2, 0.2), vy: rnd(-0.2, 0.2), vz: rnd(-0.1, 0.1), life: 3, size: 0.06, add: true, sway: rnd(0, 6), fade: true }, 'firefly'); }
  if (w === 'groundfog' && Math.random() < dt * 4) { const [x, y] = near(8); if (ok(x, y)) add({ x, y, z: 0, vx: rnd(-0.25, 0.25), vy: rnd(-0.25, 0.25), vz: 0, life: 5, size: rnd(0.25, 0.4), add: true, fade: true }, 'fog'); }
  if (w === 'groundfog' && Math.random() < dt * 0.4) { const [x, y] = near(9); if (ok(x, y)) add({ x, y, z: rnd(0.3, 0.7), vx: rnd(-0.5, 0.5), vy: rnd(-0.5, 0.5), vz: rnd(-0.05, 0.05), life: 4, size: 0.22, add: true, fade: true, sway: rnd(0, 6) }, 'wisp'); }
  if (w === 'drips' && Math.random() < dt * 5) { const [x, y] = near(5); if (ok(x, y)) add({ x, y, z: 0.98, vx: 0, vy: 0, vz: -3, life: 0.32, size: 0.06, add: true }, 'drop'); }
  if (w === 'drips' && Math.random() < dt * 0.15) { const [x, y] = near(6); if (ok(x, y)) { const a = rnd(0, TAU); add({ x, y, z: rnd(0.6, 0.9), vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, vz: 0, life: 2.2, size: 0.14, flap: true }, 'bat'); } }
  if (w === 'rain') for (let i = 0; i < 3; i++) if (Math.random() < dt * 30) { const [x, y] = near(6); if (ok(x, y) && cellSky[(y | 0) * mw + (x | 0)]) add({ x, y, z: 1.2, vx: 0.4, vy: 0.2, vz: -9, life: 0.13, size: 0.16, add: true }, 'rain'); }
  if (w === 'dust' && Math.random() < dt * 3) { const [x, y] = near(4); if (ok(x, y)) add({ x, y, z: rnd(0.2, 0.9), vx: rnd(-0.08, 0.08), vy: rnd(-0.08, 0.08), vz: rnd(-0.03, 0.03), life: 4, size: 0.025, add: true, fade: true }, 'dust'); }
  // glittrande guldhögar, utgångens sken, drag från lönnväggar och sprakande eldfat
  if (!settings.lowfx) {
    for (const it of items) if (!it.taken && it.type === 'goldpile' && Math.random() < dt * 1.5 && Math.hypot(it.x - P.x, it.y - P.y) < 10)
      particles.push({ x: it.x + rnd(-0.15, 0.15), y: it.y + rnd(-0.15, 0.15), z: rnd(0.05, 0.25), vx: 0, vy: 0, vz: 0.2, life: 0.4, maxLife: 0.4, frames: fx.hit, img: fx.hit[0], size: 0.07, add: true, tint: [255, 220, 90], drift: true });
    if (lvl.exit && Math.random() < dt * 6 && Math.hypot(lvl.exit.x + 0.5 - P.x, lvl.exit.y + 0.5 - P.y) < 14)
      particles.push({ x: lvl.exit.x + rnd(0.2, 0.8), y: lvl.exit.y + rnd(0.2, 0.8), z: 0.02, vx: 0, vy: 0, vz: rnd(0.4, 0.9), life: 1.1, maxLife: 1.1, frames: fx.hit, img: fx.hit[0], size: 0.08, add: true, tint: [120, 255, 140], drift: true });
    for (const k in doors) { const d = doors[k]; if (!d.secret || d.target) continue;
      if (Math.abs(d.x + 0.5 - P.x) + Math.abs(d.y + 0.5 - P.y) < 3.5 && Math.random() < dt * 3) particles.push({ x: d.x + 0.5 + rnd(-0.6, 0.6), y: d.y + 0.5 + rnd(-0.6, 0.6), z: rnd(0.1, 0.9), vx: rnd(-0.3, 0.3), vy: rnd(-0.3, 0.3), vz: 0.05, life: 1, maxLife: 1, frames: fx.hit, img: fx.hit[0], size: 0.04, add: true, tint: [180, 180, 160], drift: true, fade: true }); }
  }
  crackleT -= dt; if (crackleT <= 0) { crackleT = rnd(1.5, 3); let best = null, bd = 3.5; for (const t of torches) { if (t.hidden) continue; const d = Math.hypot(t.x - P.x, t.y - P.y); if (d < bd) { bd = d; best = t; } } if (best) play('fireburst', 0.07, rnd(1.4, 1.8), { x: best.x, y: best.y }); }
  // blixtar över kyrkogården
  lightning = Math.max(0, lightning - dt * 3);
  if (w === 'groundfog') { lightningT -= dt; if (lightningT <= 0) { lightningT = rnd(9, 22); lightning = 1; setTimeout(() => play('bigboom', 0.35, 0.35), rnd(300, 900)); if (Math.random() < 0.5) setTimeout(() => play('bell', 0.3, 0.8), 1600); } }
}

// ---------- Rendering ----------
let fogR = 0, fogG = 0, fogB = 0, fogK = 0.085;
function shadeFog(c, L, dist) {
  const ff = Math.exp(-dist * fogK);
  const k = L * ff;
  let r = (c & 255) * k + fogR * (1 - ff), g = ((c >> 8) & 255) * k + fogG * (1 - ff), b = ((c >> 16) & 255) * k + fogB * (1 - ff);
  r = r > 255 ? 255 : r; g = g > 255 ? 255 : g; b = b > 255 ? 255 : b;
  return 0xff000000 | (b << 16) | (g << 8) | r;
}
const wallTexFor = { 1: 'wall_brick_stone_center', 2: 'wall_brick_small_stone', 3: 'wall_rock', 4: 'wall_stone', 5: 'wall_brick_stone_center_banner',
  6: 'wall_forest', 7: 'wall_cemetery', 8: 'wall_cave', 9: 'wall_house',
  '#': 'wall_boss_demon', '%': 'wall_boss_beast', '~': 'wall_boss_nightmare', '&': 'wall_boss_ogre', '=': 'wall_boss_ghost' }; // väktar- och bossrum
// golvtextur per ruta (floorMask) och öppen himmel (sky) räknas fram när våningen startar
let cellFloor = null, cellSky = null, floorTexs = [], props = [];
const colAng = new Float32Array(W);
let plane = BASE_PLANE, view = { dirX: 1, dirY: 0, plX: 0, plY: BASE_PLANE, hor: HORIZON, camZ: 0.5, a: 0 };
function render() {
  [fogR, fogG, fogB] = lvl.fog || [0, 0, 0];
  if (lightning > 0) { const k = lightning * 120; fogR = Math.min(255, fogR + k); fogG = Math.min(255, fogG + k); fogB = Math.min(255, fogB + k * 1.2); } // blixten lyser upp dimman
  const sh = shakeAmt();
  const a = P.a + sh * 0.035 * Math.sin(tmr * 37);
  const dirX = Math.cos(a), dirY = Math.sin(a), plX = -dirY * plane, plY = dirX * plane;
  const camZ = P.camZ + Math.sin(P.bob * 2) * 0.012 * P.bobAmp;
  const hor = HORIZON + Math.round(sh * 6 * Math.sin(tmr * 53 + 1) + P.pitch);
  view = { dirX, dirY, plX, plY, hor, camZ, a };
  const ce = tex[lvl.ceil] || tex.floor_stone, sky = spr.sky, outdoor = !!lvl.sky;
  for (let x = 0; x < W; x++) { const camX = 2 * x / W - 1; colAng[x] = Math.atan2(dirY + plY * camX, dirX + plX * camX); }
  // golv och tak (eller natthimmel där rutan är öppen)
  for (let y = 0; y < VH; y++) {
    const isFloor = y > hor;
    if (y === hor) { for (let x = 0; x < W; x++) px[y * W + x] = 0xff000000 | (fogB << 16) | (fogG << 8) | fogR; continue; }
    const rowDist = isFloor ? VH * camZ / (y - hor) : VH * (1 - camZ) / (hor - y);
    const dim = isFloor ? 1 : 0.62;
    const x0 = P.x + (dirX - plX) * rowDist, y0 = P.y + (dirY - plY) * rowDist;
    const stx = (2 * plX * rowDist) / W, sty = (2 * plY * rowDist) / W;
    const sv = Math.min(sky.h - 1, Math.max(0, (sky.h * (1 - (hor - y) / Math.max(40, hor + 30))) | 0)) * sky.w; // himlens rad
    let fx2 = x0, fy2 = y0;
    for (let x = 0; x < W; x++) {
      const cx = Math.floor(fx2), cy = Math.floor(fy2), inside = cx >= 0 && cy >= 0 && cx < mw && cy < mh, ci = cy * mw + cx;
      if (!isFloor && (inside ? cellSky[ci] : outdoor)) { // öppen himmel: panoramat följer blickriktningen
        px[y * W + x] = sky.data[sv + ((((colAng[x] / TAU) + 1) * sky.w) | 0) % sky.w];
      } else {
        const t = isFloor ? floorTexs[inside ? cellFloor[ci] : 0] : ce;
        const u = ((fx2 - cx) * t.w) | 0, v = ((fy2 - cy) * t.h) | 0;
        px[y * W + x] = shadeFog(t.data[v * t.w + u], (inside ? light[ci] : lvl.ambient) * dim, rowDist);
      }
      fx2 += stx; fy2 += sty;
    }
  }
  // väggar
  for (let x = 0; x < W; x++) {
    const camX = 2 * x / W - 1, rdx = dirX + plX * camX, rdy = dirY + plY * camX;
    const hit = cast(P.x, P.y, rdx, rdy, 48, true);
    const perp = Math.max(0.05, hit.dist);
    zbuf[x] = perp;
    const scale = VH / perp;
    const top = hor - scale * (1 - camZ), lh = scale;
    const t = hit.cell === 'D' ? tex.door_wood : hit.cell === 'G' ? tex.door_metal_gate : hit.cell === '*' ? tex[wallTexFor[lvl.secretWall] || wallTexFor[1]]
      : hit.cell === '9' && (hit.mx * 7 + hit.my * 3) % 3 === 0 ? tex.wall_house_window : tex[wallTexFor[hit.cell]]; // vart tredje hus har ett upplyst fönster
    let u = (hit.wx * t.w) | 0;
    if ((hit.side === 0 && rdx > 0) || (hit.side === 1 && rdy < 0)) u = t.w - 1 - u;
    let L = lightAt(hit.lx, hit.ly);
    if (hit.side === 1) L *= 0.8;
    const y0 = Math.max(0, Math.ceil(top)), y1 = Math.min(VH - 1, Math.floor(top + lh - 0.001));
    const step = t.h / lh;
    let v = (y0 - top) * step;
    for (let y = y0; y <= y1; y++) { px[y * W + x] = shadeFog(t.data[Math.min(t.h - 1, v | 0) * t.w + u], L, perp); v += step; }
  }
  // sprites bakifrån och fram
  const list = [];
  for (const e of ents) list.push({ x: e.x, y: e.y, k: 'e', o: e });
  for (const it of items) if (!it.taken) list.push({ x: it.x, y: it.y, k: 'i', o: it });
  for (const p of pots) if (!p.broken) list.push({ x: p.x, y: p.y, k: 'p', o: p });
  for (const t of torches) if (!t.hidden) list.push({ x: t.x, y: t.y, k: 't', o: t });
  for (const c of chests) list.push({ x: c.x, y: c.y, k: 'c', o: c });
  for (const m of merchants) list.push({ x: m.x, y: m.y, k: 'm', o: m });
  for (const p of particles) list.push({ x: p.x, y: p.y, k: 'x', o: p });
  for (const p of projectiles) list.push({ x: p.x, y: p.y, k: 'f', o: p });
  for (const p of portals) list.push({ x: p.x, y: p.y, k: 'g', o: p });
  for (const d of decals) list.push({ x: d.x, y: d.y, k: 'q', o: d });
  for (const h of hazards) if (h.t >= h.warn) list.push({ x: h.x, y: h.y, k: 'z', o: h });
  for (const p of props) { if (p.broken) continue; const dx = p.x - P.x, dy = p.y - P.y; if (dx * dx + dy * dy < 900) list.push({ x: p.x, y: p.y, k: 'q', o: p }); }
  for (const s of list) s.d = (s.x - P.x) ** 2 + (s.y - P.y) ** 2;
  list.sort((p, q) => q.d - p.d);
  for (const s of list) {
    const o = s.o;
    if (s.k === 'e') {
      if (o.boss) {
        if (o.dead || o.hidden) continue;
        const moving = Math.hypot(o.mvx || 0, o.mvy || 0) > 0.002; // springer: titta åt rörelsen, annars mot spelaren
        const flip = moving ? (o.mvx * plX + o.mvy * plY) < 0 : (o.x - P.x) * plX + (o.y - P.y) * plY > 0;
        drawSprite(bossFrame(o), o.x, o.y, o.d.size, o.dying ? -o.dying * 0.3 : 0, flip, null, o.flash > 0 ? o.flash : 0, 0.75, false,
          o.dying ? [255, 120, 60] : o.stun > 0 ? [160, 200, 255] : o.id === 'ghost' ? [190, 220, 255] : null, o.id === 'ghost' ? 0.2 : 0);
        continue;
      }
      if (!o.dead && o.state === 'attack') o.flip = (o.x - P.x) * plX + (o.y - P.y) * plY > 0; // vänd mot mitten när den anfaller
      else if (!o.dead && (o.mvx || o.mvy)) o.flip = o.mvx * plX + o.mvy * plY < 0;
      const tint = o.dead ? null : o.burn > 0 ? [255, 150, 70] : o.slow > 0 ? [120, 170, 255] : o.marks >= 4 ? [210, 110, 255] : o.poison > 0 ? [140, 255, 100] : o.haste > 0 ? [150, 255, 150] : o.elite ? o.elite.tint : null;
      drawSprite(enemyFrame(o), o.x, o.y, o.d.size * 1.15, 0, o.flip, null, o.flash > 0 ? o.flash : 0, o.elite ? 0.3 : 0, false, tint, o.dead ? 0 : o.ghost || 0);
    } else if (s.k === 'i') {
      if (o.type === 'gold' || o.type === 'goldpile') { drawSprite(fx.coin[Math.floor(tmr * 8 + o.x * 3) % 4], o.x, o.y, o.type === 'goldpile' ? 0.24 : 0.16, 0.05 + 0.03 * Math.sin(tmr * 4 + o.y), false, null, 0, 0.6); continue; }
      if (o.type === 'cardpick') { drawSprite(spr.cardback, o.x, o.y, 0.34, 0.12 + 0.05 * Math.sin(tmr * 3 + o.x), false, 2, 0, 0.8); continue; }
      const img = spr[o.type] || spr['pick_' + o.type];
      if (o.type === 'shard') { drawSprite(spr.armor, o.x, o.y, 0.2, 0.04 + 0.04 * Math.sin(tmr * 4 + o.x), false, null, 0, 0.5, false, [150, 200, 255]); continue; }
      const big = o.type === 'health' || o.type === 'armor';
      drawSprite(img, o.x, o.y, big ? 0.42 : o.type === 'ammo' ? 0.32 : 0.3, 0.04 + 0.04 * Math.sin(tmr * 3 + o.x), false, null, 0, 0.5);
    } else if (s.k === 'p') drawSprite(fx.pots[o.color], o.x, o.y, 0.55, 0, false);
    else if (s.k === 't') drawSprite(fx.fire[Math.floor(tmr * 14 + o.ph * 5) % 16], o.x, o.y, 0.85, 0, false, 2.2, 0, 0, true);
    else if (s.k === 'c') drawSprite(o.open ? fx.chestOpen[Math.min(3, Math.floor(o.t * 10))] : fx.chest[Math.floor(tmr * 3) % 4], o.x, o.y, 0.5, 0, false, null, 0, 0.6);
    else if (s.k === 'm') drawSprite(fx.merchant[Math.floor(tmr * 5) % 6], o.x, o.y, 1.05, 0, (o.x - P.x) * plX + (o.y - P.y) * plY > 0, null, 0, 0.55);
    else if (s.k === 'q') { if (o.def) drawSprite(propImg(o), o.x, o.y, o.size, 0, o.flip, o.def.light && !o.used ? 1.6 : null, o.flashT > tmr ? 0.8 : 0, 0.3); else drawSprite(o.img, o.x, o.y, o.size, 0, o.flip); }
    else if (s.k === 'z') { const k = Math.min(1, (o.t - o.warn) * 6, (o.warn + o.life - o.t) * 4); // faror växer upp och sjunker undan
      if (o.kind === 'pillar') drawSprite(bossFx.beast.pillar[Math.floor(tmr * 10) % 2], o.x, o.y, 2.2 * k, 0, false, 2.4, 0, 0, true);
      else drawSprite(fx.fire[Math.floor(tmr * 14 + o.x * 5) % 16], o.x, o.y, 0.7 * k, 0, false, 2.2, 0, 0, true, [25, 80, 255]); }
    else if (s.k === 'g') drawSprite(fx.portal[Math.floor(tmr * 10) % 8], o.x, o.y, Math.min(1.25, o.t * 3), 0.02, false, 2.4, 0, 0, true, o.kind === 'boss' ? [255, 170, 120] : null);
    else if (s.k === 'f') drawSprite(fx.fireball[Math.floor(tmr * 16) % 8], o.x, o.y, o.big ? 0.5 : o.kind === 'gren' || o.kind === 'spark' ? 0.18 : o.kind === 'flare' ? 0.26 : 0.3, o.z - 0.15, false, 2.4, 0, 0, true, PROJ_TINT[o.kind] || null);
    else drawSprite(o.img, o.x, o.y, o.size, o.z, false, o.add ? (o.fade ? 2 * Math.min(1, o.life * 2, (o.maxLife - o.life) * 2) : 2) : null, 0, 0, o.add, o.tint || null);
  }
  applyGrade();
  ctx.putImageData(frame, 0, 0);
}
// Tecknar en billboard-sprite. size = höjd i världsenheter, z = höjd över golvet. tint = [r,g,b] färgton.
function drawSprite(img, wx, wy, size, z, flip, fixedLight, whiteFlash = 0, minLight = 0, additive = false, tint = null, ghost = 0) {
  const { dirX, dirY, plX, plY, hor, camZ } = view;
  const rx = wx - P.x, ry = wy - P.y;
  const inv = 1 / (plX * dirY - dirX * plY);
  const tx = inv * (dirY * rx - dirX * ry), ty = inv * (-plY * rx + plX * ry);
  if (ty < 0.12) return;
  const scale = VH / ty;
  const sh = scale * size, sw = sh * img.w / img.h;
  const cx = (W / 2) * (1 + tx / ty);
  const bottom = hor + scale * (camZ - z);
  const topY = bottom - sh, left = cx - sw / 2;
  const L = fixedLight || Math.max(minLight, lightAt(wx, wy));
  const x0 = Math.max(0, Math.ceil(left)), x1 = Math.min(W - 1, Math.floor(left + sw));
  const y0 = Math.max(0, Math.ceil(topY)), y1 = Math.min(VH - 1, Math.floor(bottom));
  const ff = Math.exp(-ty * fogK);
  const aMul = additive && fixedLight != null ? Math.min(1.2, fixedLight / 2) : 1; // additiva sprites: fixedLight styr styrkan (uttoning)
  const tr = tint ? tint[0] / 255 * 1.3 : 1, tg = tint ? tint[1] / 255 * 1.3 : 1, tb = tint ? tint[2] / 255 * 1.3 : 1;
  for (let x = x0; x <= x1; x++) {
    if (ty >= zbuf[x]) continue;
    let u = Math.floor((x - left) / sw * img.w); if (flip) u = img.w - 1 - u;
    if (u < 0 || u >= img.w) continue;
    for (let y = y0; y <= y1; y++) {
      const v = Math.floor((y - topY) / sh * img.h);
      if (v < 0 || v >= img.h) continue;
      let c = img.data[v * img.w + u];
      const al = c >>> 24;
      if (al < 100) continue;
      if (ghost && ((x * 7 + y * 13) % 10) < ghost * 10) continue; // gravrövaren: bara några pixlar syns
      const i = y * W + x;
      if (additive) { // eld lyser: additiv blandning
        const d = px[i], k = ff * (al / 255) * aMul;
        const r = Math.min(255, (d & 255) + (c & 255) * k * tr), g = Math.min(255, ((d >> 8) & 255) + ((c >> 8) & 255) * k * tg), b = Math.min(255, ((d >> 16) & 255) + ((c >> 16) & 255) * k * tb);
        px[i] = 0xff000000 | (b << 16) | (g << 8) | r;
      } else {
        if (tint) c = 0xff000000 | (Math.min(255, ((c >> 16) & 255) * tb) << 16) | (Math.min(255, ((c >> 8) & 255) * tg) << 8) | Math.min(255, (c & 255) * tr);
        let col = shadeFog(c, L, ty);
        if (whiteFlash > 0) { const f = Math.min(1, whiteFlash * 6); col = 0xff000000 | ((((col >> 16) & 255) * (1 - f) + 255 * f) << 16) | ((((col >> 8) & 255) * (1 - f) + 255 * f) << 8) | (((col & 255) * (1 - f) + 255 * f) | 0); }
        px[i] = col;
      }
    }
  }
}
// projicera en världspunkt till skärmen (för skadesiffror och livmätare)
function project(wx, wy, z) {
  const { dirX, dirY, plX, plY, hor, camZ } = view;
  const rx = wx - P.x, ry = wy - P.y, inv = 1 / (plX * dirY - dirX * plY);
  const tx = inv * (dirY * rx - dirX * ry), ty = inv * (-plY * rx + plX * ry);
  if (ty < 0.2) return null;
  const sx = Math.round((W / 2) * (1 + tx / ty));
  if (sx < 0 || sx >= W || zbuf[sx] < ty) return null;
  return { sx, sy: hor + (VH / ty) * (camZ - z), scale: VH / ty };
}
function enemyFrame(e) {
  const set = enemyFrames[e.type];
  let key = 'move', n = 0;
  if (e.dead) { key = 'death'; n = Math.min(set.death.length - 1, Math.floor(e.t * 12)); }
  else if (e.state === 'pain') { key = 'pain'; n = Math.min(set.pain.length - 1, Math.floor(e.t * 14)); }
  else if (e.state === 'attack') { key = 'attack'; n = Math.min(set.attack.length - 1, Math.floor(e.t * e.d.atkFps)); }
  else if (e.state === 'idle') { key = 'idle'; n = Math.floor(tmr * 6 + e.x * 3) % set.idle.length; }
  else { n = Math.floor(e.t * 9 * e.d.speed / 1.3) % set.move.length; }
  return set[key][n];
}
function propImg(o) {
  const f = o.frames, d = o.def;
  if (d.use) return f[o.used ? 1 : 0];
  if (d.trap) return f[o.up ? 1 : 0];
  if (d.anim) return f[Math.floor(tmr * d.anim + o.ph) % f.length];
  return f[0];
}
function bossFrame(b) {
  const at = (arr, k) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(k)))], loop = (arr, fps) => arr[Math.floor(tmr * fps) % arr.length];
  if (b.id === 'demon' || !bossFx[b.id]) {
    const set = enemyFrames.B;
    if (b.state === 'breath') return set.breath[Math.min(17, Math.floor(b.t * 12))];
    if (b.state === 'slam') return set.attack[Math.min(17, Math.floor(b.t * 14))];
    return set.idle[Math.floor(tmr * 7) % 6];
  }
  const f = bossFx[b.id];
  switch (b.id) {
    case 'beast': return b.state === 'breath' ? loop(f.breath, 8) : b.state === 'burn' || b.state === 'sink' ? at(f.burn, b.t * 6) : loop(f.idle, 7);
    case 'nightmare': return b.state === 'charge' || b.state === 'circle' ? loop(f.run, 10) : loop(f.idle, b.state === 'windup' ? 14 : 6);
    case 'ogre': return b.state === 'smash' || b.state === 'throw' ? at(f.attack, b.t / 1.1 * 7) : Math.hypot(b.mvx || 0, b.mvy || 0) > 0.002 ? loop(f.walk, 8) : loop(f.idle, 5);
    case 'ghost': return b.state === 'vanish' ? at(f.vanish, b.t * 10) : b.state === 'appear' ? at(f.appear, b.t * 10) : b.state === 'shriek' ? loop(f.shriek, 10) : b.state === 'orbs' ? loop(f.idle, 10) : loop(f.chase, 8);
  }
  return loop(f.idle, 6);
}

// ---------- Förstapersonsvapen ----------
const wcan = document.createElement('canvas'), wctx = wcan.getContext('2d');
function weaponFrame() { // bildruta och förskjutning: vapnet sticker rakt fram (Doom/Quake), rörelser görs här
  const wp = WEAPONS[P.weapon], f = WF[wp.id], st = f.states;
  const pick = (arr, k) => arr[clamp(Math.floor(k * arr.length), 0, arr.length - 1)];
  let idx = st.idle[0], dx = 0, dy = 0;
  if (WS.shot < f.dur.fire) idx = pick(st.fire, WS.shot / f.dur.fire);
  const kt = WS.shot / 0.16; // rekyl: knyck nedåt och tillbaka
  if (kt < 1) dy += Math.sin(Math.min(1, kt) * Math.PI) * wp.kick * 7 * (1 - WS.aim * 0.5);
  if (WS.state === 'draw') dy += (1 - easeOut(WS.t / drawTime())) * f.h;
  else if (WS.state === 'holster') dy += easeIn(WS.t / 0.22) * f.h;
  else if (WS.state === 'reload') {
    if (wp.shellReload) { // ner lite för varje patron
      const k = WS.t / shellSeg(WS.shellPhase);
      dy += WS.shellPhase === 'start' ? easeOut(k) * 34 : WS.shellPhase === 'end' ? (1 - easeIn(k)) * 34 : 34 + Math.sin(k * Math.PI) * 10;
      dx += WS.shellPhase === 'step' ? -Math.sin(k * Math.PI) * 4 : 0;
    } else dy += Math.sin(clamp(WS.t / (wp.reload * reloadMul()), 0, 1) * Math.PI) * f.h * 0.75;
  }
  dx += (160 - (f.x + f.w / 2)) * WS.aim * 0.6; dy -= WS.aim * 6; // sikta: in mot mitten och upp
  if (state === 'dead' || state === 'runover') dy += Math.min(f.h, P.deadT * 160);
  return { f, idx, dx, dy };
}
const easeOut = k => 1 - (1 - clamp(k, 0, 1)) ** 2, easeIn = k => clamp(k, 0, 1) ** 2;
const drawTime = () => 0.32;
const shellSeg = ph => (ph === 'start' ? 0.32 : ph === 'step' ? 0.5 : 0.42) * reloadMul();
function drawWeapon() {
  const { f, idx, dx, dy } = weaponFrame();
  const amp = P.bobAmp * (1 - WS.aim * 0.75);
  const breathe = settings.bob === false ? 0 : Math.sin(tmr * 1.7) * 1.3 * (1 - Math.min(1, amp)); // vapnet andas i vila
  const ox = Math.round(Math.sin(P.bob) * 4 * amp * (settings.bob === false ? 0.3 : 1) - WS.swayX + dx), oy = Math.round(Math.abs(Math.cos(P.bob)) * 3 * amp * (settings.bob === false ? 0.3 : 1) - WS.swayY + dy + breathe + shakeAmt() * 4 * Math.sin(tmr * 41) + P.pitch * 0.6 + Math.sin(Math.min(1, WS.kick / 0.3) * Math.PI) * 14);
  const img = wimg[WEAPONS[P.weapon].id];
  const L = clamp(lightAt(P.x, P.y) * 1.05 + P.flash * 4, 0.28, 1.25);
  if (wcan.width !== f.w || wcan.height !== f.h) { wcan.width = f.w; wcan.height = f.h; }
  wctx.globalCompositeOperation = 'source-over'; wctx.clearRect(0, 0, f.w, f.h);
  wctx.drawImage(img, idx * f.w, 0, f.w, f.h, 0, 0, f.w, f.h);
  if (L < 1) { wctx.globalCompositeOperation = 'source-atop'; wctx.fillStyle = `rgba(${lvl.fog.join(',')},${(1 - L).toFixed(3)})`; wctx.fillRect(0, 0, f.w, f.h); }
  else if (L > 1) { wctx.globalCompositeOperation = 'source-atop'; wctx.fillStyle = `rgba(255,190,120,${((L - 1) * 0.6).toFixed(3)})`; wctx.fillRect(0, 0, f.w, f.h); }
  ctx.drawImage(wcan, f.x + ox, f.y + oy);
  if (WS.shot < 0.06 && state === 'play') { // mynningsflamma vid mynningen i just den här bildrutan
    const wp = WEAPONS[P.weapon], m = f.muzzle[idx], s = 34 * wp.flash * (1 - WS.shot / 0.06 * 0.4);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.translate(m[0] + ox, m[1] + oy); ctx.rotate(Math.random() * TAU);
    ctx.drawImage(wimg.flash, -s / 2, -s / 2, s, s);
    ctx.restore();
  }
}

// ---------- HUD ----------
function drawWorldOverlay() { // skadesiffror, livmätare för eliter
  ctx.textBaseline = 'top';
  for (const e of ents) {
    if (e.dead || e.boss || e.hidden || (e.ghost || 0) > 0.5) continue;
    const p = project(e.x, e.y, e.d.size * 1.2 + 0.08); if (!p) continue;
    const y = Math.round(p.sy) - 4;
    if (e.spotT > 0) txt('!', Math.round(p.sx - 3), y - 12 - Math.round(Math.sin(e.spotT * 9) * 2), '#ff5030', 1, true, Math.min(1, e.spotT * 3)); // har sett dig
    if (!e.elite && (e.hp >= e.maxHp || p.scale < 14)) continue; // vanliga fiender visar mätaren när de skadats
    const w = Math.round(clamp(p.scale * (e.elite ? 0.6 : 0.35), e.elite ? 12 : 8, e.elite ? 40 : 20)), x = Math.round(p.sx - w / 2);
    ctx.fillStyle = '#000a'; ctx.fillRect(x - 1, y - 1, w + 2, 4);
    ctx.fillStyle = e.elite ? '#c03020' : '#a04030'; ctx.fillRect(x, y, Math.max(0, w * e.hp / e.maxHp), 2);
    if (e.eshield > 0) { ctx.fillStyle = '#6fb0ff'; ctx.fillRect(x, y + 2, Math.max(0, w * e.eshield / e.eshieldMax), 1); }
    if (e.elite && p.scale > 40) txt(e.elite.name, Math.round(p.sx - textW(e.elite.name) / 2), y - 10, '#ffd24a');
  }
  for (const n of numbers) {
    const p = project(n.x, n.y, n.z); if (!p) continue;
    const s = String(n.v);
    const big = n.crit && n.v >= 40; // stora kritiska träffar syns tydligt
    ctx.font = (big ? 16 : 8) + 'px "PressStart2P"'; const w = ctx.measureText(plain(s)).width;
    txt(s, Math.round(p.sx - w / 2), Math.round(p.sy) - (big ? 6 : 0), n.crit ? '#ffd24a' : '#f0e0c0', big ? 2 : 1, true, clamp(n.t * 2, 0, 1));
  }
}
function enemyUnderCrosshair() {
  for (const e of ents) {
    if (e.dead || e.hidden) continue;
    const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy); if (d > 18) continue;
    let off = Math.atan2(dy, dx) - P.a; off = Math.atan2(Math.sin(off), Math.cos(off));
    if (Math.abs(off) < Math.max(0.02, 0.3 * e.d.size * (e.boss ? 1.8 : 1) / d) && hasLOS(P.x, P.y, e.x, e.y)) return true;
  }
  return false;
}
function drawHUD() {
  const g = ctx, y0 = VH;
  drawWorldOverlay();
  for (const h of hurtDir) {
    const rel = h.ang - P.a, sx = W / 2 + Math.sin(rel) * W * 0.42, sy = HORIZON - Math.cos(rel) * VH * 0.4;
    const gr = g.createRadialGradient(sx, sy, 2, sx, sy, 46);
    gr.addColorStop(0, `rgba(220,0,0,${0.55 * h.t})`); gr.addColorStop(1, 'rgba(220,0,0,0)');
    g.fillStyle = gr; g.fillRect(sx - 46, sy - 46, 92, 92);
  }
  if (P.hurt > 0) { g.fillStyle = `rgba(190,0,0,${Math.min(0.45, P.hurt * 0.6)})`; g.fillRect(0, 0, W, VH); }
  if (P.pick > 0) { g.fillStyle = `rgba(255,230,120,${P.pick * 0.22})`; g.fillRect(0, 0, W, VH); }
  if (P.boom > 0) { g.fillStyle = `rgba(255,240,210,${P.boom.toFixed(3)})`; g.fillRect(0, 0, W, VH); } // nära explosion
  if (state === 'play' && up('bullettime') && WS.aim > 0.8) { g.fillStyle = 'rgba(90,140,255,0.13)'; g.fillRect(0, 0, W, VH); } // tidsstoppet
  if (P.hp < maxHp() * 0.3 && state === 'play') {
    const p = 0.25 + 0.2 * Math.sin(tmr * 6);
    const gr = g.createRadialGradient(W / 2, HORIZON, VH * 0.35, W / 2, HORIZON, W * 0.62);
    gr.addColorStop(0, 'rgba(120,0,0,0)'); gr.addColorStop(1, `rgba(150,0,0,${p})`);
    g.fillStyle = gr; g.fillRect(0, 0, W, VH);
  }
  if (state === 'play') { // sikte
    const gap = Math.round(2 + WS.spread * 160), cx = W / 2, cy = HORIZON;
    g.fillStyle = enemyUnderCrosshair() ? 'rgba(255,80,60,0.95)' : (settings.xcolor || 'rgba(255,255,255,0.85)');
    if (settings.xstyle === 'punkt') g.fillRect(cx - 1, cy - 1, 2, 2);
    else if (settings.xstyle === 'cirkel') { g.fillRect(cx, cy, 1, 1); const r = gap + 3; for (let i = 0; i < 16; i++) g.fillRect(Math.round(cx + Math.cos(i / 16 * TAU) * r), Math.round(cy + Math.sin(i / 16 * TAU) * r), 1, 1); }
    else { g.fillRect(cx - gap - 3, cy, 3, 1); g.fillRect(cx + gap + 1, cy, 3, 1); g.fillRect(cx, cy - gap - 3, 1, 3); g.fillRect(cx, cy + gap + 1, 1, 3); }
    if (WS.focus > 0) { // kalla blodet laddas
      g.strokeStyle = WS.focus >= 1 ? (tmr % 0.3 < 0.15 ? '#ffd24a' : '#ff8030') : 'rgba(255,210,74,0.7)'; g.lineWidth = 1;
      g.beginPath(); g.arc(cx + 0.5, cy + 0.5, 9, -Math.PI / 2, -Math.PI / 2 + TAU * WS.focus); g.stroke();
    }
    if (hitMark > 0) {
      g.fillStyle = hitKill ? '#ff4030' : hitCrit ? '#ffd24a' : '#ffffff';
      for (let i = 2; i < 5; i++) { g.fillRect(cx - i, cy - i, 1, 1); g.fillRect(cx + i, cy - i, 1, 1); g.fillRect(cx - i, cy + i, 1, 1); g.fillRect(cx + i, cy + i, 1, 1); }
    }
  }
  const hb = boss && !boss.dead ? boss : guardianE && !guardianE.dead && !guardianE.dying ? guardianE : null;
  if (hb && state === 'play') { // bossens (eller väktarens) livmätare
    const w = hb.guardian ? 140 : 200, x = (W - w) / 2, y = 22;
    g.fillStyle = '#000b'; g.fillRect(x - 2, y - 2, w + 4, 8);
    g.fillStyle = hb.guardian ? '#3a1050' : '#5a1010'; g.fillRect(x, y, w, 4);
    g.fillStyle = hb.guardian ? '#c050ff' : hb.phase === 3 ? '#ff5020' : '#d02818'; g.fillRect(x, y, w * Math.max(0, hb.hp) / hb.maxHp, 4);
    txt(hb.d.name, (W - textW(hb.d.name)) / 2, y + 7, '#ffd24a');
  }
  if (levelBanner > 0 && state === 'play') {
    const a = Math.min(1, levelBanner, (3 - levelBanner) * 3), sub = (cycleOf(run.depth) ? `VARV ${cycleOf(run.depth) + 1} · ` : '') + `VÅNING ${run.depth} · ${BIOME_NAME[lvl.biome] || ''}`;
    ctx.font = '16px "PressStart2P"'; const w = ctx.measureText(plain(lvl.name)).width;
    if (w < W - 8) txt(lvl.name, (W - w) / 2, 46, '#e8d9b0', 2, true, a); else txt(lvl.name, (W - textW(lvl.name)) / 2, 50, '#e8d9b0', 1, true, a);
    txt(sub, (W - textW(sub)) / 2, 66, '#c9a87a', 1, true, a);
  }
  if (bossBanner > 0 && !boss && guardianE && guardianE.d.title) { const s = guardianE.d.title; txt(s, (W - textW(s)) / 2, 60, '#d080ff', 1, true, Math.min(1, bossBanner)); }
  if (bossBanner > 0 && boss && boss.d.title) { const t = boss.d.title; txt(t, (W - textW(t)) / 2, 72, '#e8d9b0', 1, true, Math.min(1, bossBanner)); }
  if (bossBanner > 0 && boss) { const s = boss.d.name; ctx.font = '16px "PressStart2P"'; const w = ctx.measureText(plain(s)).width; txt(s, (W - w) / 2, 50, '#ff5030', 2, true, Math.min(1, bossBanner)); }
  // nedre listen
  g.fillStyle = '#1b1410'; g.fillRect(0, y0, W, HUD_H);
  g.fillStyle = '#5a4630'; g.fillRect(0, y0, W, 1);
  g.fillStyle = '#3a2c1e'; g.fillRect(0, y0 + 1, W, 1);
  for (const sx of [58, 114, 202, 264]) { g.fillStyle = '#3a2c1e'; g.fillRect(sx, y0 + 4, 1, HUD_H - 8); }
  g.textBaseline = 'top';
  const wp = WEAPONS[P.weapon];
  txt('HÄLSA', 6, y0 + 5, '#c9a87a'); txt(String(Math.max(0, Math.ceil(P.hp))), 6, y0 + 16, P.hp > maxHp() * 0.3 ? '#e8d9b0' : (tmr % 0.6 < 0.3 ? '#ff4d3d' : '#a02a20'), 2);
  if (mod('shield') > 0) { g.fillStyle = '#20344a'; g.fillRect(6, y0 + 31, 48, 2); g.fillStyle = '#7fc0ff'; g.fillRect(6, y0 + 31, 48 * P.shield / mod('shield'), 2); }
  txt('RUSTN', 64, y0 + 5, '#c9a87a'); txt(String(Math.ceil(P.armor)), 64, y0 + 16, P.armor > 0 ? '#9fc4ff' : '#5a4630', 2);
  const mag = P.mags[P.weapon], res = P.ammo[wp.ammo];
  txt(AMMO[wp.ammo].name, 120, y0 + 5, '#c9a87a');
  const low = mag <= Math.ceil(effMag(P.weapon) * 0.25);
  txt(String(mag), 120, y0 + 16, mag === 0 ? (tmr % 0.5 < 0.25 ? '#ff4d3d' : '#7a2a20') : low ? '#ffb040' : '#e8d9b0', 2);
  txt('/' + res, 122 + String(mag).length * 16, y0 + 22, '#a89070');
  txt(wp.short, 208, y0 + 5, '#c9a87a');
  if (run.pact) txt('EDEN', 208, y0 + 15, '#ff7050', 1, false);
  else for (let i = 0; i < WEAPONS.length; i++) { g.fillStyle = P.has[i] ? (i === P.weapon ? '#ffd24a' : '#8a7550') : '#3a2c1e'; g.fillRect(208 + i * 7, y0 + 16, 5, 6); }
  txt(`${kills}/${totalEnemies}`, 208, y0 + 25, '#e8d9b0');
  txt(boss ? 'BOSS' : `VÅN ${run.depth}`, 270, y0 + 5, '#c9a87a');
  txt(`${run.gold}G`, 270, y0 + 15, '#ffd24a');
  txt(`${run.owned.length} KORT`.slice(0, 6), 270, y0 + 25, '#b9a0e8');
  msgs.forEach((m, i) => { const w = textW(m.text); txt(m.text, (W - w) / 2, 6 + i * 11, i ? '#c9b080' : '#ffe9a8', 1, true, Math.min(1, m.t * 2)); });
  if (state === 'play' && WS.state === 'reload' && !WEAPONS[P.weapon].shellReload) { // omladdningsmätare med det aktiva fältet
    const k = clamp(WS.t / (WEAPONS[P.weapon].reload * reloadMul()), 0, 1), bw = 44, bx = (W - bw) / 2, by = HORIZON + 10;
    g.fillStyle = '#000a'; g.fillRect(bx - 1, by - 1, bw + 2, 5);
    if (!WS.tried) { g.fillStyle = '#5a7a3a'; g.fillRect(bx + bw * ACTIVE_WIN[0], by, bw * (ACTIVE_WIN[1] - ACTIVE_WIN[0]), 3); }
    g.fillStyle = '#e8d9b0'; g.fillRect(bx + bw * k - 1, by - 1, 2, 5);
  }
  if (portals.length && state === 'play') { // pil mot portalen
    const pt = portals[0], d = Math.hypot(pt.x - P.x, pt.y - P.y);
    if (d > 3) {
      let rel = Math.atan2(pt.y - P.y, pt.x - P.x) - P.a; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      const cx = W / 2 + clamp(rel, -1.4, 1.4) * 70, cy = 30;
      g.save(); g.translate(cx, cy); g.rotate(rel); g.fillStyle = tmr % 0.8 < 0.4 ? '#c080ff' : '#9060e0';
      g.beginPath(); g.moveTo(7, 0); g.lineTo(-4, -4); g.lineTo(-2, 0); g.lineTo(-4, 4); g.closePath(); g.fill(); g.restore();
      const t = `${Math.round(d)}`; txt(t, cx - textW(t) / 2, cy + 6, '#c9a0ff', 1, true, 0.8);
    }
  }
  if (WS.nameT > 0 && state === 'play') { const nm = WEAPONS[P.weapon].name; txt(nm, (W - textW(nm)) / 2, VH - 14, '#ffd24a', 1, true, Math.min(1, WS.nameT * 2)); }
  if (WS.boost && state === 'play') txt('+15%', W / 2 + 12, HORIZON - 14, '#9fe060', 1, true, 0.8);
  if (state === 'play') { // aktiva effekter nere till vänster
    const st = [];
    if (P.haste > 0) st.push(['FART', '#9fe060']);
    if (P.iframe > 0) st.push(['OSÅRBAR', '#ffffff']);
    if (P.slowT > 0) st.push(['LÅNGSAM', '#80b0ff']);
    if (P.shield > 0) st.push([`SKÖLD ${Math.ceil(P.shield)}`, '#7fc0ff']);
    if (up('bullettime') && WS.aim > 0.8) st.push(['TIDSSTOPP', '#80b0ff']);
    if (run.modifier) st.push([run.modifier.name, '#ff9050']);
    st.forEach(([t, c], i) => txt(t, 4, VH - 12 - i * 10, c, 1, true, 0.85));
  }
  if (hint && state === 'play') txt(hint, (W - textW(hint)) / 2, HORIZON + 26, '#ffd24a');
  else if (WS.state === 'idle' && P.mags[P.weapon] === 0 && P.ammo[wp.ammo] > 0 && state === 'play') { const s = isTouch() ? 'LADDA OM!' : 'R = LADDA OM', w = textW(s); txt(s, (W - w) / 2, HORIZON + 14, '#ffb040'); }
  if (settings.fps) { fpsN++; if (tmr - fpsT >= 1 || tmr < fpsT) { fpsShow = fpsN; fpsN = 0; fpsT = tmr; } txt(fpsShow + ' FPS', 4, 4, '#9fe060', 1, true, 0.8); }
  if (showMap === 2) drawMap(false); else if (showMap === 1 && state === 'play') drawMap(true);
}
function textW(s) { ctx.font = '8px "PressStart2P"'; return ctx.measureText(plain(s)).width; }
function txt(s, x, y, col, scale = 1, shadow = true, alpha = 1) {
  const g = ctx; s = plain(s); g.font = `${8 * scale}px "PressStart2P"`; g.globalAlpha = alpha;
  if (shadow) { g.fillStyle = '#000'; g.fillText(s, x + 1, y + 1); }
  g.fillStyle = col; g.fillText(s, x, y); g.globalAlpha = 1;
}
function drawMap(mini) { // automap: bara rutor man har sett. mini = liten karta i hörnet runt spelaren
  let s, ox, oy, x0 = 0, y0 = 0, x1 = mw, y1 = mh;
  if (mini) {
    s = 3; const r = 10;
    x0 = clamp((P.x | 0) - r, 0, Math.max(0, mw - 2 * r - 1)); y0 = clamp((P.y | 0) - r, 0, Math.max(0, mh - 2 * r - 1));
    x1 = Math.min(mw, x0 + 2 * r + 1); y1 = Math.min(mh, y0 + 2 * r + 1);
    ox = W - 4 - (x1 - x0) * s - x0 * s; oy = 4 - y0 * s;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(ox + x0 * s - 2, oy + y0 * s - 2, (x1 - x0) * s + 4, (y1 - y0) * s + 4);
  } else {
    s = clamp(Math.floor(Math.min((W - 10) / mw, (VH - 10) / mh)), 2, 5); ox = (W - mw * s) / 2 | 0; oy = (VH - mh * s) / 2 | 0;
    ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(ox - 3, oy - 3, mw * s + 6, mh * s + 6);
  }
  const inside = (x, y) => x >= x0 && y >= y0 && x < x1 && y < y1;
  const sense = mod('secretSense') > 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const c = map[y][x];
    if (c === '*' && sense && doors[x + ',' + y].open === 0) { ctx.fillStyle = tmr % 1 < 0.5 ? '#c060ff' : '#7030a0'; ctx.fillRect(ox + x * s, oy + y * s, s, s); continue; }
    if (!seen[y * mw + x]) continue;
    ctx.fillStyle = isWallChar(c) ? '#7d7566' : c === 'D' ? '#c08040' : c === 'G' ? '#b04080' : c === '*' ? (doors[x + ',' + y].open > 0 ? '#2a2420' : '#7d7566') : c === 'f' ? '#ff9a30' : c === 'M' ? '#ff4040' : c === 't' ? '#3a5a2a' : c === 'n' ? '#8a8a96' : MAP_COL[c] || '#2a2420';
    ctx.fillRect(ox + x * s, oy + y * s, s, s);
    if (lvl.exit && lvl.exit.x === x && lvl.exit.y === y) { ctx.fillStyle = '#60d060'; ctx.fillRect(ox + x * s, oy + y * s, s, s); }
  }
  for (const it of items) if (!it.taken && inside(it.x | 0, it.y | 0) && seen[(it.y | 0) * mw + (it.x | 0)]) { ctx.fillStyle = it.type.startsWith('gold') ? '#ffd24a' : it.type === 'cardpick' ? '#c0a0ff' : '#e8d9b0'; ctx.fillRect(ox + it.x * s - 1, oy + it.y * s - 1, 2, 2); }
  for (const c of chests) if (inside(c.x | 0, c.y | 0) && seen[(c.y | 0) * mw + (c.x | 0)]) { ctx.fillStyle = c.open ? '#6a5030' : '#ffb030'; ctx.fillRect(ox + c.x * s - 1, oy + c.y * s - 1, 3, 3); }
  for (const e of ents) { // fiender som syns just nu, väktare och boss alltid när rummet har setts
    if (e.dead || !inside(e.x | 0, e.y | 0) || e.hidden || e.dormant) continue;
    const big = e.boss || e.guardian;
    if (!(big && seen[(e.y | 0) * mw + (e.x | 0)]) && !(Math.hypot(e.x - P.x, e.y - P.y) < 12 && hasLOS(P.x, P.y, e.x, e.y))) continue;
    ctx.fillStyle = big ? (tmr % 0.5 < 0.25 ? '#ff60ff' : '#a030a0') : e.elite ? '#ffb030' : '#ff4030'; ctx.fillRect(ox + e.x * s - (big ? 2 : 1), oy + e.y * s - (big ? 2 : 1), big ? 4 : 2, big ? 4 : 2);
  }
  for (const p of portals) if (inside(p.x | 0, p.y | 0)) { ctx.fillStyle = tmr % 0.6 < 0.3 ? '#c080ff' : '#7040d0'; ctx.fillRect(ox + p.x * s - 2, oy + p.y * s - 2, 4, 4); }
  ctx.fillStyle = '#4dff7a'; ctx.fillRect(ox + P.x * s - 1, oy + P.y * s - 1, 3, 3);
  ctx.fillRect(ox + (P.x + Math.cos(P.a) * 1.4) * s, oy + (P.y + Math.sin(P.a) * 1.4) * s, 1, 1);
}
const MAP_COL = { w: '#ff5060', y: '#c040ff', e: '#ff6030', k: '#6a5040', q: '#6a5040', u: '#9090a0', v: '#707070', H: '#9090a0', J: '#6a5040', T: '#8a6a40' }; // brunn, altare, krutfat och möbler på kartan

// ---------- Strid (påverkas av korten via mod()) ----------
// skada faller av med avståndet (fullt nära, golv långt bort) så att pistolen inte prickskjuter över hela banan
function falloff(wp, d) { const [n, f, m] = wp.falloff; return d <= n ? 1 : d >= f ? m : 1 + (m - 1) * (d - n) / (f - n); }
// siktstöd på pekskärm: kulan dras lätt mot en synlig fiende nära hårkorset
function aimAssist(a) {
  let best = null, bd = 0.07;
  for (const e of ents) { if (e.dead) continue; const d = Math.hypot(e.x - P.x, e.y - P.y); if (d > 16) continue;
    let da = Math.atan2(e.y - P.y, e.x - P.x) - a; da = Math.atan2(Math.sin(da), Math.cos(da));
    const lim = Math.max(0.025, 0.35 / d); if (Math.abs(da) < Math.min(bd, lim) && hasLOS(P.x, P.y, e.x, e.y)) { bd = Math.abs(da); best = da; } }
  return best === null ? a : a + best * 0.7;
}
const effMag = i => Math.max(1, Math.round(WEAPONS[i].mag * (1 + mod('magSize'))));
const effDelay = wp => wp.delay / (1 + mod('fireRate'));
const reloadMul = () => 1 / (1 + mod('reloadSpeed'));
function canFire() { return state === 'play' && (WS.state === 'idle' || (WS.state === 'reload' && WEAPONS[P.weapon].shellReload && P.mags[P.weapon] > 0)) && WS.cd <= 0; }
function fire() {
  const wp = WEAPONS[P.weapon];
  if (!canFire()) return;
  if (P.mags[P.weapon] <= 0) {
    if (!fireHeld) play('click', 0.6, 1.2);
    WS.cd = 0.3; // liten paus mellan klick
    if (P.ammo[wp.ammo] > 0) startReload(); else if (!fireHeld) { say('SLUT PÅ AMMUNITION', 1.2); autoSwitch(); }
    return;
  }
  if (WS.state === 'reload') WS.state = 'idle'; // avbryt hagelomladdning
  const firstShot = P.mags[P.weapon] >= effMag(P.weapon);
  // vapenuppgraderingar som ändrar själva skottet
  const lastRound = up('lastround') && P.mags[P.weapon] === 1;
  const slug = up('slug') && WS.aim > 0.5;
  const dbl = up('double') && !slug && P.mags[P.weapon] >= 2;
  const focus = up('focus') && WS.focus >= 1;
  const chain = up('chainshot'), triple = up('triple'), hunt = WS.hunt && up('headhunter');
  const fan = up('fan') && fireHeld; // hanefläkten: skotten efter det första i svepet
  if (Math.random() >= mod('ammoSave')) P.mags[P.weapon]--;
  if (dbl) P.mags[P.weapon]--;
  if (up('belt')) { const t = Math.min(P.ammo[wp.ammo], effMag(P.weapon) - P.mags[P.weapon]); P.mags[P.weapon] += t; P.ammo[wp.ammo] -= t; } // blybältet matar ur reserven
  lvlStat.shots++; run.shots = (run.shots || 0) + 1;
  WS.shot = 0; WS.cd = effDelay(wp) * (fan ? 0.4 : 1) * (dbl ? 1.35 : 1) / (1 + WS.spin * 0.55);
  if (focus) WS.focus = 0;
  const kick = wp.kick * (dbl || slug ? 1.6 : 1);
  P.flash = 0.07; P.shake = Math.max(P.shake, kick * 0.5);
  // lärbart rekylmönster: samma sidoryck i samma ordning varje salva, plus en uppåtknyck som återhämtar sig
  const kickYaw = wp.recoil[P.burst % wp.recoil.length] * (1 - WS.aim * 0.5);
  P.a += kickYaw; P.ryaw += kickYaw * 0.6; P.pitch += kick * 4 * (1 - WS.aim * 0.5);
  P.burst++; P.burstT = effDelay(wp) + 0.25;
  WS.swayY -= kick * 2;
  play(wp.sound[0], wp.sound[2], wp.sound[1] * rnd(0.96, 1.04) * (1 + WS.spin * 0.08));
  if (wp.id === 'shotgun') { play('boom', 0.45, 0.55); setTimeout(() => play('reload', 0.45, 1.4), 420 / (1 + mod('fireRate'))); }
  if (dbl || slug || focus) play('boom', 0.6, slug ? 0.4 : 0.5);
  if (!wp.proj && wp.id !== 'crossbow') ejectShell(wp.id === 'shotgun' || wp.id === 'dbshotgun');
  if (kick >= 2) WS.punch = Math.min(0.08, kick * 0.022); // synfältet slår till vid tunga skott
  if (P.mags[P.weapon] === 0) setTimeout(() => play('click', 0.35, 0.8), 140); // sista skottet
  lowAmmoCheck(wp);
  if (wp.id === 'dbshotgun') play('boom', 0.5, 0.45);
  if (wp.id === 'crossbow') play('click', 0.5, 0.7);
  // duellanten: vilka som inte hade märkt något när skottet gick
  const unaware = up('duel') ? new Set(ents.filter(e => !e.dead && !e.alert)) : null;
  // ljudet väcker fiender som kan nå dig inom ~15 rutor (armborsten är tyst)
  for (const e of ents) if (!e.dead && pathDist(e) < (wp.silent ? 2 : 15)) alertEnemy(e, false);
  let anyHit = false, killed = false, crit = false, boomAt = null;
  const hitSet = new Set(), killSet = new Set();
  const spread = slug ? 0 : (wp.spread + WS.spread * 0.5 + (wp.hip || 0) * (1 - WS.aim)) * (1 - WS.aim * 0.6) / (1 + mod('accuracy'))
    * (fan ? 3 : 1) * (up('belt') ? 1 + Math.min(P.burst, 30) / 20 : 1);
  let base = wp.dmg * (1 + mod('dmg')) * (WS.boost ? 1.15 : 1) * (dmod('glass') ? 1.5 : 1);
  if (firstShot) base *= 1 + mod('firstShot');
  if (P.hp < maxHp() * 0.35) base *= 1 + mod('lowHpDmg');
  if (lastRound) base *= 3;
  if (slug) base *= 7;
  if (focus) base *= 4;
  if (chain) base *= 3;
  if (hunt) { base *= 2; WS.hunt = false; }
  const pellets = slug ? 1 : chain || triple ? 3 : (wp.pellets + Math.round(mod('extraPellets'))) * (dbl ? 2 : 1);
  for (let p = 0; p < pellets; p++) {
    let a = triple ? P.a + (p - 1) * 0.09 : P.a + (P.burst > 1 || pellets > 1 || wp.hip ? rnd(-1, 1) * spread : 0); // första skottet går där siktet är
    if (p === 0 && touch.active) a = aimAssist(a);
    if (wp.proj) { shootFlare(a, base); continue; } // signalpistolen skjuter ett bloss, ingen stråle
    const dx = Math.cos(a), dy = Math.sin(a);
    const wall = cast(P.x, P.y, dx, dy);
    const wallDist = up('wallpierce') ? throughWall(dx, dy, wall.dist) : wall.dist; // genomborraren
    // allt som kulan kan träffa längs strålen, närmast först
    const hits = [];
    for (const e of ents) {
      if (e.dead) continue;
      const rx = e.x - P.x, ry = e.y - P.y, along = rx * dx + ry * dy;
      if (along <= 0.1 || along >= wallDist) continue;
      if (Math.abs(rx * dy - ry * dx) < 0.3 * e.d.size * (e.boss ? 1.8 : 1)) hits.push({ o: e, d: along, k: 'e' });
    }
    for (const pr of projectiles) { // sökande klot och eldklot går att skjuta ned
      if (pr.friendly || pr.dead || pr.kind === 'rock') continue;
      const rx = pr.x - P.x, ry = pr.y - P.y, along = rx * dx + ry * dy;
      if (along > 0.1 && along < wallDist && Math.abs(rx * dy - ry * dx) < (pr.big ? 0.35 : 0.25)) hits.push({ o: pr, d: along, k: 'f' });
    }
    for (const pt of pots) {
      if (pt.broken) continue;
      const rx = pt.x - P.x, ry = pt.y - P.y, along = rx * dx + ry * dy;
      if (along <= 0.1 || along >= wall.dist) continue;
      if (Math.abs(rx * dy - ry * dx) < 0.22) hits.push({ o: pt, d: along, k: 'p' });
    }
    for (const pr of props) { // krutfat smäller, lådor spricker, andra föremål stoppar kulan
      if (!pr.def || pr.broken || !pr.def.block) continue;
      const rx = pr.x - P.x, ry = pr.y - P.y, along = rx * dx + ry * dy;
      if (along <= 0.1 || along >= wall.dist) continue;
      if (Math.abs(rx * dy - ry * dx) < 0.3) hits.push({ o: pr, d: along, k: 'o' });
    }
    hits.sort((u, v) => u.d - v.d);
    let left = slug || focus || chain || wp.pierceAll ? 99 : 1 + (wp.pierce || 0) + Math.round(mod('pierce')), stopped = false;
    for (const h of hits) {
      if (left <= 0) { stopped = true; break; }
      if (h.k === 'p') { breakPot(h.o); left--; continue; }
      if (h.k === 'o') { if (!hitProp(h.o, P.x + dx * h.d, P.y + dy * h.d)) { stopped = true; break; } left--; continue; }
      if (h.k === 'f') { h.o.dead = true; h.o.life = 0; play('ricochet', 0.4, 1.6, { x: h.o.x, y: h.o.y }); hitMark = 0.12; left--; continue; }
      const far = up('marksman') && h.d > 7; // skarpskytten: långa träffar är alltid kritiska utan avståndsförlust
      let dmg = base * (far || slug ? 1 : falloff(wp, h.d)) * (h.d < 2 && wp.id === 'shotgun' && !slug ? 1.3 : 1);
      const c = far || Math.random() < mod('critChance');
      if (c) { dmg *= 2 + mod('critDmg'); crit = true; hitStop = Math.max(hitStop, 0.03); }
      if (h.o.elite || h.o.boss) dmg *= 1 + mod('bossDmg');
      if (unaware && unaware.has(h.o)) { if (h.o.elite || h.o.boss) dmg *= 3; else dmg = Math.max(dmg, h.o.hp + 1); say('DUELLANTEN!', 0.8); }
      if (up('dragon')) { h.o.burn = Math.max(h.o.burn, 3); h.o.burnAcc = Math.max(h.o.burnAcc, 0.3); }
      anyHit = true;
      const hx = P.x + dx * h.d, hy = P.y + dy * h.d;
      const k = hurtEnemy(h.o, dmg, hx, hy, { crit: c });
      if (!k && !h.o.boss && !h.o.d.armor) tryMove(h.o, dx * Math.min(0.12, dmg * 0.02), dy * Math.min(0.12, dmg * 0.02), 0.28); // träffen knuffar
      if (k) { killed = true; killSet.add(h.o); } else hitSet.add(h.o);
      if (!boomAt) boomAt = { x: hx, y: hy };
      afterHit(h.o, dmg, hx, hy, p);
      left--;
    }
    if (!stopped && left > 0 && wallDist < 30) { // kulnedslag på väggen
      const hx = P.x + dx * (wallDist - 0.04), hy = P.y + dy * (wallDist - 0.04);
      if (p < 3) spawnImpact(hx, hy, rnd(0.25, 0.7));
      if (p === 0 && Math.random() < 0.5) play('ricochet', 0.25, rnd(0.8, 1.3), { x: hx, y: hy });
      if (!boomAt) boomAt = { x: hx, y: hy };
      if (up('ricowall')) ricochetWall(hx, hy, dx, dy, wall.side, base * 0.8);
    }
  }
  if (lastRound && boomAt) { explode(boomAt.x, boomAt.y, 5 * (1 + mod('dmg')), 1.7); play('bigboom', 0.6, 1.2); P.shake = Math.max(P.shake, 1.5); }
  if (up('knock')) for (const e of hitSet) knockBack(e);
  if (up('shrapnel')) for (const e of killSet) shrapnel(e, base);
  // uppgraderingar för dubbelbössa, armborst och prickskyttegevär
  if (up('harvest') && killSet.size) { heal(3 * killSet.size); P.ammo.shells = Math.min(AMMO.shells.max, P.ammo.shells + killSet.size); }
  if (up('doublekill') && killSet.size >= 2) { finishReload(); say('DUBBELDÖD!', 1); play('reload', 0.6, 1.6); }
  if (up('stormstep')) { for (let i = 0; i < 6; i++) tryMove(P, -Math.cos(P.a) * 0.2, -Math.sin(P.a) * 0.2, 0.25); P.iframe = 0.4; }
  if (up('recover') && killSet.size) { P.ammo.bolts = Math.min(AMMO.bolts.max, P.ammo.bolts + killSet.size); finishReload(); }
  if (up('blastbolt')) for (const e of [...hitSet, ...killSet]) fuses.push({ e, x: e.x, y: e.y, t: 0.8, dmg: 8 * (1 + mod('dmg')) });
  if (up('poison')) for (const e of hitSet) e.poison = 4;
  if (up('headhunter') && killSet.size) { WS.cd = 0.08; WS.hunt = true; say('HUVUDJÄGAREN', 0.8); }
  if (anyHit) { lvlStat.hits++; run.hits = (run.hits || 0) + 1; }
  if (anyHit) { hitMark = 0.15; hitKill = killed; hitCrit = crit; play(killed ? 'gem' : 'click', killed ? 0.22 : 0.18, killed ? 1.6 : 2.4); }
  WS.spread = Math.min(0.06, WS.spread + wp.spread * 0.7 + (wp.id === 'shotgun' ? 0.02 : 0.004));
  if (P.mags[P.weapon] === 0 && P.ammo[wp.ammo] > 0) setTimeout(() => { if (WS.state === 'idle' && P.mags[P.weapon] === 0) startReload(); }, effDelay(wp) * 1000 + 120);
}
// ---------- Vapenuppgraderingar (kort med wup, kräver vapnets pakt) ----------
function nearestFoes(e, r, n) { // levande fiender nära e som e har fri sikt till, närmast först
  return ents.filter(o => o !== e && !o.dead && !o.dying && Math.hypot(o.x - e.x, o.y - e.y) < r && hasLOS(e.x, e.y, o.x, o.y))
    .sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y)).slice(0, n);
}
function zap(ax, ay, bx, by, tint) { // synlig stråle mellan två punkter (studs, blixt)
  for (let i = 1; i <= 5; i++) { const t = i / 6; particles.push({ x: ax + (bx - ax) * t + rnd(-0.08, 0.08), y: ay + (by - ay) * t + rnd(-0.08, 0.08), z: 0.5 + rnd(-0.1, 0.1), vx: 0, vy: 0, vz: 0, life: 0.18, maxLife: 0.18, frames: fx.hit, img: fx.hit[0], size: 0.18, add: true, tint }); }
}
function afterHit(e, dmg, hx, hy, pellet) {
  if (up('explosive')) explode(hx, hy, 5 * (1 + mod('dmg')), 1.5);
  if (up('ricochet') && pellet === 0) { // studskulan
    const o = nearestFoes(e, 6, 1)[0];
    if (o) { zap(e.x, e.y, o.x, o.y, [255, 230, 160]); play('ricochet', 0.45, rnd(1.2, 1.5), { x: o.x, y: o.y }); hurtEnemy(o, dmg * 0.8, o.x, o.y, { noProc: true }); }
  }
  if (up('chain') && ++P.chainN % 4 === 0) { // kedjeblixten
    let from = e;
    for (const o of nearestFoes(e, 4.5, 3)) { zap(from.x, from.y, o.x, o.y, [140, 190, 255]); hurtEnemy(o, dmg * 1.2, o.x, o.y, { noProc: true }); from = o; }
    play('whoosh', 0.5, 2, { x: e.x, y: e.y });
  }
  if (up('marks') && !e.dead) { // dödsmärket
    e.marks = (e.marks || 0) + 1;
    if (e.marks >= 8) { e.marks = 0; explode(e.x, e.y, 9 * (1 + mod('dmg')), 1.4); play('bigboom', 0.5, 1.4, { x: e.x, y: e.y }); say('DÖDSMÄRKET!', 0.8); }
  }
}
function ricochetWall(hx, hy, dx, dy, side, dmg) { // rikoschetten: kulan studsar en gång mot väggen
  if (side === 0) dx = -dx; else dy = -dy;
  const w2 = cast(hx, hy, dx, dy, 10);
  let best = null, bd = w2.dist;
  for (const e of ents) {
    if (e.dead) continue;
    const rx = e.x - hx, ry = e.y - hy, along = rx * dx + ry * dy;
    if (along > 0.05 && along < bd && Math.abs(rx * dy - ry * dx) < 0.3 * e.d.size) { best = e; bd = along; }
  }
  if (best) { zap(hx, hy, best.x, best.y, [255, 220, 150]); hurtEnemy(best, dmg, best.x, best.y, { noProc: true }); hitMark = 0.15; }
  else if (Math.random() < 0.3) spawnImpact(hx + dx * (w2.dist - 0.04), hy + dy * (w2.dist - 0.04), rnd(0.3, 0.6));
}
function knockBack(e) { // slagkraften: nära fiender slungas bakåt, krock i vägg skadar
  if (e.dead || e.boss) return;
  const d = Math.hypot(e.x - P.x, e.y - P.y); if (d > 3.5) return;
  const a = Math.atan2(e.y - P.y, e.x - P.x), dist = (1.6 - d * 0.3) * (e.elite ? 0.5 : 1);
  const ox = e.x, oy = e.y;
  for (let i = 0; i < 6; i++) tryMove(e, Math.cos(a) * dist / 6, Math.sin(a) * dist / 6, 0.28);
  e.charge = 0; e.state = 'pain'; e.t = 0;
  if (Math.hypot(e.x - ox, e.y - oy) < dist * 0.7) { hurtEnemy(e, 3 * (1 + mod('dmg')), e.x, e.y, { noProc: true }); play('bigboom', 0.35, 1.5, { x: e.x, y: e.y }); P.shake = Math.max(P.shake, 1.2); }
}
function shrapnel(e, dmg) { // splitterhaglet: döda fiender sprängs och skadar grannarna
  play('fireburst', 0.5, 1.3, { x: e.x, y: e.y });
  for (let i = 0; i < 8; i++) { const a = rnd(0, TAU), sp = rnd(1.5, 3); particles.push({ x: e.x, y: e.y, z: 0.5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: rnd(0.5, 2), life: 0.5, img: fx.shards[(i * 5) % fx.shards.length], size: 0.12, grav: true }); }
  for (const o of nearestFoes(e, 2.6, 3)) hurtEnemy(o, dmg * 1.5, o.x, o.y, { noProc: true });
}
function throughWall(dx, dy, d) { // genomborraren: hitta väggens baksida (högst 2 rutor) och fortsätt därifrån
  for (let t = d + 0.05; t < d + 2.2; t += 0.05) {
    const x = P.x + dx * t, y = P.y + dy * t;
    if (!solid(x, y)) return t + cast(x, y, dx, dy).dist;
  }
  return d;
}
const fuses = []; // sprängspetsen: pilar som smäller efter en stund
function updateFuses(dt) {
  for (const f of fuses) {
    f.t -= dt; if (!f.e.dead) { f.x = f.e.x; f.y = f.e.y; }
    if (f.t <= 0) { explode(f.x, f.y, f.dmg, f.r || 1.8, f.hurt); play('bigboom', f.hurt ? 0.8 : 0.5, f.hurt ? 1 : 1.3, { x: f.x, y: f.y }); if (f.hurt) P.shake = Math.max(P.shake, 1.2); }
  }
  for (let i = fuses.length - 1; i >= 0; i--) if (fuses[i].t <= 0) fuses.splice(i, 1);
}
function shootFlare(a, dmg) { // signalpistolens bloss: flyger, träffar, sprängs och tänder eld
  projectiles.push({ x: P.x + Math.cos(a) * 0.4, y: P.y + Math.sin(a) * 0.4, z: 0.48, vx: Math.cos(a) * 13, vy: Math.sin(a) * 13, dmg, src: P, friendly: true, kind: 'flare', life: 2.5 });
  play('whoosh', 0.6, 0.6);
}
function flareBurst(x, y, dmg, r = 1.7, spark = false) {
  explode(x, y, dmg * 1.2, r);
  if (!spark && up('cluster')) for (let i = 0; i < 5; i++) { // fyrverkeriet
    const a = i / 5 * TAU + rnd(-0.3, 0.3);
    projectiles.push({ x, y, z: 0.45, vx: Math.cos(a) * 6, vy: Math.sin(a) * 6, dmg: dmg * 0.5, src: P, friendly: true, kind: 'spark', life: 0.35 });
  }
  if (!spark && up('blind')) { // solblosset
    for (const e of ents) if (!e.dead && !e.boss && Math.hypot(e.x - x, e.y - y) < 3.2) { e.stun = 2.2; e.charge = 0; }
    particles.push({ x, y, z: 0.5, vx: 0, vy: 0, vz: 0, life: 0.3, maxLife: 0.3, frames: fx.hit, img: fx.hit[0], size: 1.6, add: true, tint: [255, 255, 220] });
  }
  for (const e of ents) if (!e.dead && Math.hypot(e.x - x, e.y - y) < r + 0.3) { e.burn = Math.max(e.burn, 4); }
  for (let i = 0; i < 6; i++) particles.push({ x, y, z: 0.3, vx: rnd(-2, 2), vy: rnd(-2, 2), vz: rnd(1, 3), life: 0.8, maxLife: 0.8, frames: fx.fire, img: fx.fire[0], size: 0.35, grav: true, add: true });
  play('fireburst', 0.7, 0.8, { x, y });
}
function throwMag() { // kastmagasinet: det gamla magasinet flyger iväg som en granat
  const a = P.a;
  projectiles.push({ x: P.x + Math.cos(a) * 0.4, y: P.y + Math.sin(a) * 0.4, z: 0.5, vx: Math.cos(a) * 8, vy: Math.sin(a) * 8, dmg: 9 * (1 + mod('dmg')), src: P, friendly: true, kind: 'gren', life: 0.9 });
  play('whoosh', 0.5, 0.8);
}
// aktiv omladdning: tryck R igen när visaren är i det ljusa fältet så går det direkt och nästa magasin gör 15 % mer skada
const ACTIVE_WIN = [0.3, 0.45];
function reloadKey() {
  const wp = WEAPONS[P.weapon];
  if (WS.state !== 'reload' || wp.shellReload) { startReload(); return; }
  if (WS.tried || WS.loaded) return;
  WS.tried = true;
  const k = WS.t / (wp.reload * reloadMul());
  if (k >= ACTIVE_WIN[0] && k <= ACTIVE_WIN[1]) {
    finishReload(); WS.state = 'idle'; WS.loaded = false; WS.boost = true;
    play('click', 0.8, 1.7); play('reload', 0.4, 2); say('PERFEKT OMLADDNING!', 1); WS.swayY += 5;
  } else { WS.t -= wp.reload * reloadMul() * 0.3; play('click', 0.6, 0.5); say('KÄRVADE', 0.8); }
}
function ejectShell(big) { // hylsan flyger ut åt höger och studsar
  const img = fx.parts.shell ? fx.parts.shell[0] : null; if (!img || settings.lowfx) return;
  const r = P.a + Math.PI / 2, f = P.a;
  particles.push({ x: P.x + Math.cos(f) * 0.35 + Math.cos(r) * 0.12, y: P.y + Math.sin(f) * 0.35 + Math.sin(r) * 0.12, z: 0.42, vx: Math.cos(r) * rnd(1, 1.8) + P.vx * 0.5, vy: Math.sin(r) * rnd(1, 1.8) + P.vy * 0.5, vz: rnd(1.2, 2), life: rnd(1.2, 2), img, size: big ? 0.05 : 0.035, grav: true, bounce: true, tint: big ? [255, 80, 60] : null });
}
function lowAmmoCheck(wp) { // varning när reserven nästan är slut
  const left = P.ammo[wp.ammo] + P.mags[P.weapon];
  if (left > 0 && left <= Math.max(3, wp.mag) && !WS.lowWarned[wp.ammo]) { WS.lowWarned[wp.ammo] = true; say('LITE AMMUNITION: ' + AMMO[wp.ammo].name, 1.5); play('click', 0.5, 0.6); }
  if (left > wp.mag * 2) WS.lowWarned[wp.ammo] = false;
}
function startReload() {
  const wp = WEAPONS[P.weapon];
  if (WS.state !== 'idle' || P.mags[P.weapon] >= effMag(P.weapon) || P.ammo[wp.ammo] <= 0) return;
  WS.boost = false; WS.tried = false;
  if (up('grenade')) throwMag();
  if (up('quickload') && P.mags[P.weapon] === 0) { finishReload(); play('reload', 0.6, 1.8); WS.cd = Math.max(WS.cd, 0.1); WS.swayY += 6; return; } // tomhylsan
  WS.state = 'reload'; WS.t = 0; WS.aim = 0;
  if (wp.shellReload) WS.shellPhase = 'start';
  else play('reload', 0.6, 1.0 / reloadMul());
}
function finishReload() {
  const wp = WEAPONS[P.weapon], need = effMag(P.weapon) - P.mags[P.weapon], take = Math.min(need, P.ammo[wp.ammo]);
  P.mags[P.weapon] += take; P.ammo[wp.ammo] -= take;
}
function switchWeapon(n) {
  if (n === P.weapon || !P.has[n] || state !== 'play') return;
  P.lastWeapon = P.weapon;
  WS.next = n; WS.state = 'holster'; WS.t = 0; WS.aim = 0; play('weapon', 0.25, 1.6);
}
function autoSwitch() {
  for (const i of [...WEAPONS.keys()].slice(1).concat(0)) { const w = WEAPONS[i]; if (P.has[i] && i !== P.weapon && (P.mags[i] > 0 || P.ammo[w.ammo] > 0)) { switchWeapon(i); return; } }
}
// opt: { crit, noProc (ingen explosion/brand), source }
function hurtEnemy(e, dmg, hx, hy, opt = {}) {
  if (e.dead || e.dying || e.hidden) return false;
  if (e.eshield > 0) { const a = Math.min(e.eshield, dmg); e.eshield -= a; dmg -= a; e.flash = 0.08; if (e.eshield <= 0) { play('ricochet', 0.7, 0.6, { x: e.x, y: e.y }); say('SKÖLDEN BRAST', 1); } if (dmg <= 0) { alertEnemy(e, true); spawnNumber(e.x, e.y, a, false); return false; } }
  e.lastHurt = tmr;
  if (e.d.armor) { const before = dmg; dmg = Math.max(dmg * 0.25, dmg - e.d.armor); if (dmg < before * 0.6 && !opt.quiet) play('ricochet', 0.35, rnd(1.2, 1.5), { x: e.x, y: e.y }); }
  e.revealT = 2;
  if (!e.boss && !e.elite && mod('execute') > 0 && (e.hp - dmg) / e.maxHp < mod('execute')) dmg = e.hp;
  e.hp -= dmg; e.flash = 0.12; alertEnemy(e, true);
  if (mod('lifesteal') > 0) heal(dmg * mod('lifesteal'), true);
  spawnNumber(e.x, e.y, dmg, opt.crit);
  if (!opt.quiet) { play('splat', 0.35, rnd(0.9, 1.2), { x: e.x, y: e.y }); for (let i = 0; i < 2; i++) spawnBlood(hx ?? e.x, hy ?? e.y); }
  if (!opt.noProc) {
    if (Math.random() < mod('burnChance')) e.burn = 3;
    if (Math.random() < mod('slowChance')) e.slow = 2.5;
    if (Math.random() < mod('explodeChance')) explode(hx ?? e.x, hy ?? e.y, dmg * 0.6, 1.4);
  }
  if (e.hp <= 0) { killEnemy(e); return true; }
  if (e.d.ai === 'blink' && (e.blinkCd || 0) <= 0 && Math.random() < 0.45) blink(e);
  if (!e.boss && !opt.quiet && Math.random() < 0.55 && e.state !== 'attack') { e.state = 'pain'; e.t = 0; }
  return false;
}
const killTimes = [];
function multiKill() { // flera dödade inom kort tid: meddelande och lite guld
  killTimes.push(tmr); while (killTimes.length && tmr - killTimes[0] > 1.3) killTimes.shift();
  const n = killTimes.length;
  if (n >= 2) { const t = n === 2 ? 'DUBBELT!' : n === 3 ? 'TRIPPEL!' : n === 4 ? 'FYRDUBBELT!' : 'MASSAKER!'; say(`${t} +${n * 3} GULD`, 1.2); run.gold += 3; P.multi = Math.max(P.multi || 0, n); }
}
function killEnemy(e) {
  hitStop = Math.max(hitStop, e.boss ? 0.15 : e.elite ? 0.07 : 0.02);
  e.dead = true; e.t = 0; e.state = 'dead'; kills++; run.kills++; score += e.d.score * (e.elite ? 3 : 1);
  multiKill(); addDecal(e.x, e.y); profile.bestiary = profile.bestiary || {}; if (!e.boss) profile.bestiary[e.type] = (profile.bestiary[e.type] || 0) + 1; run.wkills = run.wkills || {}; run.wkills[WEAPONS[P.weapon].id] = (run.wkills[WEAPONS[P.weapon].id] || 0) + 1;
  play('gore', 0.5, rnd(0.9, 1.2), { x: e.x, y: e.y });
  const dsnd = { S: ['bonesnap', 1], K: ['bonesnap', 0.8], N: ['bonesnap', 0.7], R: ['bonesnap', 1.2], V: ['pain', 1.2], I: ['hiss', 1.5], L: ['splat', 0.6], l: ['splat', 1.2], O: ['pain', 0.9], W: ['pain', 0.6] }[e.type] || ['pain', 0.8];
  play(dsnd[0], 0.5, dsnd[1] * rnd(0.92, 1.08), { x: e.x, y: e.y });
  for (let i = 0; i < 5; i++) spawnBlood(e.x, e.y);
  if (mod('killHeal')) heal(mod('killHeal'));
  if (mod('killArmor')) P.armor = Math.min(200, P.armor + mod('killArmor'));
  if (mod('speedOnKill')) P.haste = Math.max(P.haste, mod('speedOnKill'));
  if (e.boss) { bossDefeated(e); return; }
  if (e.d.ai === 'split') splitBlob(e);
  if (e.poison > 0 && up('poison')) for (const o of nearestFoes(e, 3, 4)) o.poison = 4;
  if (e.burn > 0 && up('wildfire')) for (const o of nearestFoes(e, 3, 4)) { o.burn = Math.max(o.burn, 4); zap(e.x, e.y, o.x, o.y, [255, 140, 60]); }
  if (e.elite) {
    if (Math.random() < (dmod('elite') ? 1 : 0.15)) dropItem('cardpick', e.x, e.y); // ibland ett kortval
    for (let i = 0; i < 4; i++) dropItem('gold', e.x, e.y);
    dropItem(Math.random() < 0.5 ? 'health' : 'ammo', e.x, e.y);
    if (e.elite.id === 'explosive') explode(e.x, e.y, 18, 1.8, true);
  } else {
    const r = Math.random();
    const lowHp = P.hp < maxHp() * 0.35; // låg hälsa: hälsa faller oftare
    if (r < 0.22) dropItem('ammo', e.x, e.y); else if (r < (lowHp ? 0.45 : 0.32)) dropItem('health', e.x, e.y);
    if (Math.random() < 0.5) dropItem('gold', e.x, e.y);
  }
  // portal: när våningens sista elit dör, eller när alla fiender är döda
  if (!boss && !portals.length && ((e.elite && !ents.some(o => o.elite && !o.dead)) || kills >= totalEnemies)) {
    if (e.elite) spawnPortal(e.x, e.y, 'floor'); else spawnPortal(P.x + Math.cos(P.a) * 1.8, P.y + Math.sin(P.a) * 1.8, 'floor');
  }
}
// Explosion: skadar fiender (och spelaren om hurtsPlayer) inom radien
const flashes = []; // tillfälligt ljus från explosioner
function explode(x, y, dmg, r, hurtsPlayer) {
  play('fireburst', 0.6, rnd(0.8, 1), { x, y });
  flashes.push({ x, y, t: 0.3, r: Math.min(6, 2 + r * 1.5) });
  const dp = Math.hypot(P.x - x, P.y - y); if (dp < 4.5) P.boom = Math.max(P.boom, 0.35 * (1 - dp / 4.5));
  for (let i = 0; i < 5; i++) particles.push({ x: x + rnd(-0.3, 0.3), y: y + rnd(-0.3, 0.3), z: rnd(0.2, 0.6), vx: rnd(-1, 1), vy: rnd(-1, 1), vz: rnd(0, 1), life: 0.4, maxLife: 0.4, frames: fx.fireball, img: fx.fireball[0], size: 0.45, add: true });
  for (const e of ents) if (!e.dead && Math.hypot(e.x - x, e.y - y) < r) hurtEnemy(e, dmg, e.x, e.y, { noProc: true });
  for (const pt of pots) if (!pt.broken && Math.hypot(pt.x - x, pt.y - y) < r) breakPot(pt);
  for (const pr of props) if (pr.def && !pr.broken && (pr.def.boom || pr.def.crate) && Math.hypot(pr.x - x, pr.y - y) < r + 0.4) hitProp(pr, x, y); // kedjereaktioner
  if (hurtsPlayer && Math.hypot(P.x - x, P.y - y) < r) hurtPlayer(dmg, x, y, 'proj');
  P.flash = Math.max(P.flash, 0.05);
}
function dropItem(type, x, y) { items.push({ type, x: x + rnd(-0.2, 0.2), y: y + rnd(-0.2, 0.2), taken: false, drop: true }); }
// ---------- Föremål: krutfat, lådor, brunnar, altare och spikfällor ----------
function hitProp(pr, hx, hy) { // sant om kulan kan fortsätta
  const d = pr.def;
  if (d.boom) { // krutfatet smäller efter ett ögonblick, kan sätta igång andra fat
    pr.broken = true; map[pr.cy][pr.cx] = '.'; flowCell = -1;
    fuses.push({ e: { dead: true }, x: pr.x, y: pr.y, t: 0.18, dmg: 30 * (1 + mod('dmg') * 0.5), r: 2.4, hurt: true });
    play('fireburst', 0.5, 1.4, { x: pr.x, y: pr.y }); return true;
  }
  if (d.crate) { breakCrate(pr); return true; }
  pr.flashT = tmr + 0.06; spawnSpark(hx, hy); play('ricochet', 0.25, rnd(1.2, 1.6), { x: hx, y: hy }); return false;
}
function spawnSpark(x, y) { particles.push({ x, y, z: 0.5, vx: 0, vy: 0, vz: 0, life: 0.15, maxLife: 0.15, frames: fx.hit, img: fx.hit[0], size: 0.25, add: true }); }
function breakCrate(pr) {
  pr.broken = true; map[pr.cy][pr.cx] = '.'; flowCell = -1; score += 15;
  play('pot', 0.8, 0.6, { x: pr.x, y: pr.y }); play('kick', 0.5, 0.8, { x: pr.x, y: pr.y });
  for (let i = 0; i < 8; i++) {
    const a = rnd(0, TAU), sp = rnd(0.6, 2);
    particles.push({ x: pr.x, y: pr.y, z: 0.25, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: rnd(1, 2.5), life: rnd(0.9, 1.5), img: fx.crateBits ? fx.crateBits[i % 4] : fx.shards[i % 6], size: 0.16, grav: true, bounce: true });
  }
  const r = Math.random();
  if (r < 0.35) dropItem(Math.random() < 0.5 ? 'ammo' : 'health', pr.x, pr.y);
  else if (r < 0.7) for (let i = 0; i < 3; i++) dropItem('gold', pr.x, pr.y);
  else if (r < 0.78) dropItem('shard', pr.x, pr.y);
}
function breakProps(x, y, r) { // sparken: lådor går sönder, krutfat smäller
  let hit = false;
  for (const pr of props) if (pr.def && !pr.broken && (pr.def.crate || pr.def.boom) && Math.hypot(pr.x - x, pr.y - y) < r + 0.3) { hitProp(pr, x, y); hit = true; }
  return hit;
}
function useProp() { // brunnen helar en gång, altaret ger ett förbannat kort och guld
  for (const pr of props) {
    if (!pr.def || !pr.def.use || pr.used || Math.hypot(pr.x - P.x, pr.y - P.y) > 1.3) continue;
    if (pr.def.use === 'well') {
      if (P.hp >= maxHp()) { say('DU ÄR REDAN FRISK – SPARA BRUNNEN', 1.5); return true; }
      pr.used = true; heal(40 * (1 + mod('healMul'))); play('splash', 0.8); play('health', 0.6, 0.8); say('DU DRICKER UR BRUNNEN', 2);
      for (let i = 0; i < 10; i++) particles.push({ x: pr.x, y: pr.y, z: 0.4, vx: rnd(-0.6, 0.6), vy: rnd(-0.6, 0.6), vz: rnd(1, 2), life: 0.8, maxLife: 0.8, frames: fx.hit, img: fx.hit[0], size: 0.15, add: true, tint: [255, 80, 90] });
      return true;
    }
    if (pr.def.use === 'altar') {
      const curses = Cards.ALL.filter(c => c.curse && !run.owned.includes(c.id));
      openUI(() => CardUI.choice({ title: 'DET FÖRBANNADE ALTARET', subtitle: 'BLOD FÖR GULD. ALTARET GER 60 GULD OCH ETT SLUMPAT FÖRBANNAT KORT.', cancel: 1,
        options: [{ label: 'OFFRA', text: '+60 GULD, +1 FÖRBANNELSE' }, { label: 'GÅ DÄRIFRÅN', text: '' }] }, i => {
        if (i === 0) {
          pr.used = true; run.gold += 60; play('bigboom', 0.4, 1.6); play('coin', 0.8, 0.8); P.flash = 0.2;
          const c = curses.length ? curses[(Math.random() * curses.length) | 0] : null;
          if (c) { gainCard(c); setTimeout(() => CardUI.toast(c, 'FÖRBANNELSE'), 100); } else say('ALTARET HAR INGET KVAR ATT GE', 2);
        }
        closeUI();
      }));
      return true;
    }
  }
  return false;
}
function updateProps(dt) {
  for (const pr of props) {
    if (!pr.def || !pr.def.trap) continue;
    const cyc = (tmr + pr.ph) % 3.2, wasUp = pr.up;
    pr.up = cyc > 2.3; // uppe i knappt en sekund var tredje sekund
    if (pr.up && !wasUp && Math.hypot(pr.x - P.x, pr.y - P.y) < 8) play('click', 0.5, 0.6, { x: pr.x, y: pr.y });
    if (!pr.up) { if (cyc > 1.9 && cyc < 2.0 && Math.hypot(pr.x - P.x, pr.y - P.y) < 3 && (pr.warnT || 0) < tmr) { pr.warnT = tmr + 2; play('click', 0.25, 1.4, { x: pr.x, y: pr.y }); } continue; }
    if (Math.abs(P.x - pr.x) < 0.48 && Math.abs(P.y - pr.y) < 0.48 && (pr.hitT || 0) < tmr) { pr.hitT = tmr + 0.9; run.cause = 'SPIKFÄLLA'; hurtPlayer(10, pr.x, pr.y); spawnBlood(P.x, P.y); }
    for (const e of ents) if (!e.dead && !e.boss && !e.dormant && Math.abs(e.x - pr.x) < 0.48 && Math.abs(e.y - pr.y) < 0.48 && (e.spikeT || 0) < tmr) { e.spikeT = tmr + 0.9; hurtEnemy(e, 6, e.x, e.y, { noProc: true }); }
  }
}
function breakPot(pt) {
  pt.broken = true; play('pot', 0.7, rnd(0.9, 1.15), { x: pt.x, y: pt.y }); score += 10;
  for (let i = 0; i < 7; i++) {
    const a = rnd(0, TAU), sp = rnd(0.6, 2);
    particles.push({ x: pt.x, y: pt.y, z: 0.2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: rnd(1, 2.5), life: rnd(0.8, 1.4), img: fx.shards[pt.color * 6 + (i % 6)], size: 0.14, grav: true, bounce: true });
  }
  if (pt.loot) dropItem(pt.loot, pt.x, pt.y);
  else if (Math.random() < 0.15) dropItem('shard', pt.x, pt.y); // rustningsskärva
  if (Math.random() < 0.05) { for (let i = 0; i < 6; i++) dropItem('gold', pt.x, pt.y); say('JACKPOTT!', 1); play('coin', 0.8, 0.8); } // ibland en guldskatt
}
function spawnBlood(x, y) {
  const a = rnd(0, TAU), sp = rnd(0.3, 1.2);
  particles.push({ x, y, z: rnd(0.35, 0.65), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: rnd(0, 1.5), life: rnd(0.35, 0.7), img: fx.blood[(Math.random() * 3) | 0], size: rnd(0.1, 0.18), grav: true });
}
function spawnImpact(x, y, z) {
  particles.push({ x, y, z: z - 0.08, vx: 0, vy: 0, vz: 0, life: 0.25, maxLife: 0.25, frames: fx.hit, img: fx.hit[0], size: 0.16, add: true });
}
const decals = []; // blodpölar på golvet
function addDecal(x, y) { const f = fx.parts.blood_pool; if (f && !solid(x, y)) { decals.push({ x: x + rnd(-0.15, 0.15), y: y + rnd(-0.15, 0.15), img: f[(Math.random() * f.length) | 0], size: rnd(0.07, 0.1) }); if (decals.length > 70) decals.shift(); } }
const numbers = []; // skadesiffror som flyger upp
function spawnNumber(x, y, dmg, crit) { numbers.push({ x: x + rnd(-0.15, 0.15), y: y + rnd(-0.15, 0.15), z: 0.9, v: Math.max(1, Math.round(dmg * 10)), crit, t: 0.8 }); if (numbers.length > 40) numbers.shift(); }
const maxHp = () => 100 + mod('maxHp') + meta('hp') * 10;
// själaaltaret: bestående uppgraderingar som köps med själar på startskärmen
const META = [
  { id: 'hp', name: 'HÄRDAD', text: '+10 MAX HP PER NIVÅ', max: 3, cost: [30, 60, 100] },
  { id: 'gold', name: 'ARVET', text: '+25 STARTGULD PER NIVÅ', max: 3, cost: [20, 40, 70] },
  { id: 'ammo', name: 'KRUTVÄSKAN', text: '+50 % STARTAMMO PER NIVÅ', max: 2, cost: [25, 50] },
  { id: 'armor', name: 'BRYNJAN', text: '+25 STARTRUSTNING PER NIVÅ', max: 2, cost: [30, 60] },
  { id: 'choice', name: 'SIARENS ÖGA', text: '+1 VAL AV STARTKORT', max: 1, cost: [80] },
];
const meta = id => (profile.meta && profile.meta[id]) || 0;
function openAltar() {
  const items = () => META.map(m => ({ kind: 'meta', id: m.id, label: `${m.name} ${meta(m.id)}/${m.max}`, text: meta(m.id) >= m.max ? 'FULLT' : m.text, price: meta(m.id) >= m.max ? 0 : m.cost[meta(m.id)], owned: meta(m.id) >= m.max }));
  CardUI.shop(items(), profile.souls, item => {
    const m = META.find(x => x.id === item.id);
    if (item.owned || profile.souls < item.price) return { ok: false, gold: profile.souls };
    profile.souls -= item.price; profile.meta = profile.meta || {}; profile.meta[m.id] = meta(m.id) + 1; saveProfile(); play('buy', 0.8); checkAch();
    return { ok: true, gold: profile.souls, items: items() };
  }, () => refreshTitle(), { title: 'SJÄLAALTARET', currency: 'SJÄLAR', currencyColor: '#c0a0ff' });
}
function heal(n, silent) { if (dmod('gold')) n *= 0.7; const before = P.hp; P.hp = Math.min(maxHp(), P.hp + n); return P.hp - before; }
// kind: 'melee' | 'proj' | undefined
function hurtPlayer(d, fx0, fy0, kind) {
  if (params.has('god') || state !== 'play' || P.iframe > 0) return;
  if (Math.random() < mod('dodge')) { say('UNDVEK!', 0.8); play('whoosh', 0.4, 1.5); return; }
  d *= diff().dmg * Math.max(0.15, 1 + mod('damageTaken')) * (dmod('glass') ? 1.5 : 1);
  if (kind === 'proj') d *= Math.max(0, 1 - mod('projectileResist'));
  if (kind === 'melee') d *= Math.max(0, 1 - mod('meleeResist'));
  P.shieldT = 4;
  if (P.shield > 0) { const s = Math.min(P.shield, d); P.shield -= s; d -= s; }
  const absorbed = Math.min(P.armor, d * 0.5); P.armor -= absorbed; d -= absorbed;
  P.hp -= d; P.hurt = 0.35; P.shake = Math.max(P.shake, 1.2); lvlStat.taken += d;
  if (settings.vibrate !== false && navigator.vibrate) try { navigator.vibrate(Math.min(120, 20 + d * 4)); } catch (e) { /* ingen vibration */ }
  play('hurt', 0.8, rnd(0.9, 1.1));
  if (fx0 !== undefined) hurtDir.push({ ang: Math.atan2(fy0 - P.y, fx0 - P.x), t: 1 });
  if (P.hp <= 0 && fx0 !== undefined) run.cause = (ents.find(e => !e.dead && Math.abs(e.x - fx0) < 0.01 && Math.abs(e.y - fy0) < 0.01) || {}).d?.name || run.cause || '';
  if (P.hp <= 0) {
    if (run.livesUsed < mod('extraLife')) { // återupplivning från ett kort
      run.livesUsed++; P.hp = maxHp() * 0.5; P.hurt = 1; say('DU VÄGRAR DÖ!', 3); play('secret', 0.8, 1.4);
      for (const e of ents) if (!e.dead && Math.hypot(e.x - P.x, e.y - P.y) < 3) hurtEnemy(e, 8, e.x, e.y, { noProc: true });
      return;
    }
    state = 'dead'; P.hp = 0; P.deadT = 0; play('lose', 0.8);
    stopAmbient(); setMusic(false);
    if (breathSnd) { breathSnd.s.stop(); breathSnd = null; }
    endRun(false);
  }
}


// ---------- Interaktion: dörrar, kistor, köpman ----------
function useKey() {
  if (useProp()) return;
  for (const e of ents) if (e.dormant && Math.hypot(e.x - P.x, e.y - P.y) < 1.4) { wakeMimic(e); return; }
  for (const c of chests) if (!c.open && Math.hypot(c.x - P.x, c.y - P.y) < 1.2) { openChest(c); return; }
  for (const m of merchants) if (Math.hypot(m.x - P.x, m.y - P.y) < 1.6) { openShop(m); return; }
  for (const dist of [0.6, 1.0, 1.4]) {
    const nx = P.x + Math.cos(P.a) * dist, ny = P.y + Math.sin(P.a) * dist;
    const d = doorAt(nx, ny);
    if (!d || !isDoorChar(cellAt(nx, ny))) continue;
    if (d.secret) {
      if (d.target) return;
      d.target = 1; secrets++; score += 250; profile.secrets = (profile.secrets || 0) + 1; play('secret', 0.8); say('DU HITTADE ETT HEMLIGT RUM!', 3); return;
    }
    if (d.glock) { say('DÖRREN ÄR FÖRSEGLAD – BESEGRA VÄKTAREN', 2); play('click', 0.6, 0.6); return; }
    if (d.gate && boss && !boss.dead) { say('GRINDEN ÄR LÅST – DÖDA ' + boss.d.name, 2.5); play('click', 0.6, 0.6); return; }
    if (d.target && occupied(d)) { say('NÅGOT STÅR I VÄGEN', 1.2); return; }
    d.target = d.target ? 0 : 1; play(d.gate ? 'gate' : 'door', 0.6, 1, { x: d.x + 0.5, y: d.y + 0.5 }); return;
  }
  kick(); // inget att använda: sparka i stället
}
function kick() { // spark: knuffar fiender bakåt, bryter krukor och lådor
  if (P.kickT > 0 || state !== 'play') return;
  P.kickT = 0.55; WS.kick = 0.3; play('whoosh', 0.4, 1.4);
  let hit = false;
  for (const e of ents) {
    if (e.dead || e.dying || e.hidden) continue;
    const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy);
    let off = Math.atan2(dy, dx) - P.a; off = Math.atan2(Math.sin(off), Math.cos(off));
    if (d > 1.5 + e.d.size * 0.3 || Math.abs(off) > 0.7) continue;
    hit = true; hurtEnemy(e, 2 * (1 + mod('dmg')), e.x, e.y, { noProc: true });
    if (!e.boss && !e.dead) { for (let i = 0; i < 6; i++) tryMove(e, dx / d * 0.22, dy / d * 0.22, 0.28); e.state = 'pain'; e.t = 0; e.charge = 0; }
  }
  for (const pt of pots) if (!pt.broken && Math.hypot(pt.x - P.x, pt.y - P.y) < 1.4) { breakPot(pt); hit = true; }
  if (typeof breakProps === 'function' && breakProps(P.x + Math.cos(P.a) * 0.9, P.y + Math.sin(P.a) * 0.9, 0.7)) hit = true;
  if (hit) { play('kick', 0.7, rnd(0.9, 1.1)); P.shake = Math.max(P.shake, 0.6); hitStop = Math.max(hitStop, 0.03); }
}
function occupied(d) { // dörren får inte stängas på någon
  const inCell = o => Math.abs(o.x - (d.x + 0.5)) < 0.8 && Math.abs(o.y - (d.y + 0.5)) < 0.8;
  return inCell(P) || ents.some(e => !e.dead && inCell(e));
}
function alertEnemy(e, spread) {
  if (e.dead) return;
  if (!e.alert && e.d.tip && run) { // första mötet med en ny sorts fiende i rundan
    run.seen = run.seen || [];
    if (!run.seen.includes(e.type)) { run.seen.push(e.type); say(`${e.d.name}: ${e.d.tip}`, 4); }
  }
  if (!e.alert) { e.alert = true; e.spotT = 0.9; e.cd = Math.max(e.cd, rnd(0.35, 0.8)); if (Math.random() < 0.7) play(e.d.growl, 0.5, rnd(0.9, 1.1), { x: e.x, y: e.y }); }
  if (spread) for (const o of ents) if (o !== e && !o.dead && !o.alert && Math.hypot(o.x - e.x, o.y - e.y) < 6 && hasLOS(o.x, o.y, e.x, e.y)) alertEnemy(o, false);
}
// UI-lägen: släpp musen, pausa världen, återgå när UI stängs
function openUI(fn) {
  state = 'ui'; mouseDown = false; aimDown = false; for (const k in keys) keys[k] = false;
  if (document.pointerLockElement) document.exitPointerLock();
  fn();
}
function closeUI(next = 'play') { state = next; if (next === 'play') lockPointer(); }
function drawCards(n, opt = {}) { return Cards.draw(run.cardRng, n + Math.round(mod('cardChoices')), { owned: run.owned, depth: run.depth, luck: mod('luck') + (opt.luck || 0), unlocked: new Set(profile.unlocked), pact: run.pact }); }
function gainCard(card) {
  if (!card) return;
  run.owned.push(card.id); recomputeMods(); play('card', 0.8);
  if (card.pact) swearPact(card.pact);
  if (P.hp > maxHp()) P.hp = maxHp();
  P.shield = Math.min(P.shield, mod('shield'));
}
const pactAmmo = () => WEAPONS.find(w => w.id === run.pact).ammo;
function swearPact(id) { // vapenpakt: bara ett vapen resten av rundan, men det kan få unika uppgraderingar
  run.pact = id;
  const i = WEAPONS.findIndex(w => w.id === id), wp = WEAPONS[i];
  if (!P.has[i]) { P.has[i] = true; P.mags[i] = effMag(i); }
  P.ammo[wp.ammo] = Math.min(AMMO[wp.ammo].max, P.ammo[wp.ammo] + { p9: 40, r556: 40, shells: 12, bolts: 14, flares: 8 }[wp.ammo]);
  for (let k = 0; k < WEAPONS.length; k++) if (k !== i) P.has[k] = false;
  if (P.weapon !== i) { P.weapon = i; WS.state = 'draw'; WS.t = 0; WS.next = -1; }
  say('DU HAR SVURIT DIG TILL ' + wp.name, 3); play('secret', 0.7, 0.7);
}
function openChest(c) {
  c.open = true; c.t = 0; play('chest', 0.8); itemsTaken++; score += 100;
  for (let i = 0; i < 3; i++) dropItem('gold', c.x, c.y);
  openUI(() => CardUI.draft(drawCards(3, { luck: 0.5 + run.depth * 0.06 }), { title: 'KISTAN', subtitle: 'VÄLJ ETT KORT', skipLabel: 'TA INGET' }, card => { gainCard(card); closeUI(); }));
}
function shopItems(m) {
  if (!m.stock) {
    const disc = clamp(mod('shopDiscount'), 0, 0.8);
    const cards = drawCards(3).map(card => ({ kind: 'card', card, price: Cards.price(card, run.depth, disc) }));
    m.stock = cards.concat([
      { kind: 'health', label: '+40 HÄLSA', price: Math.round(30 * (1 - disc)) },
      { kind: 'armor', label: '+50 RUSTNING', price: Math.round(40 * (1 - disc)) },
      { kind: 'ammo', label: 'AMMUNITION', price: Math.round(25 * (1 - disc)) },
      { kind: 'reroll', label: 'NYA KORT', price: 15 + 10 * run.rerolls },
      { kind: 'purge', label: 'RENSA ETT KORT', text: 'TA BORT ETT KORT UR LEKEN', price: Math.round((50 + 15 * run.depth) * (1 - disc)) },
      { kind: 'mystery', label: 'MYSTERIEKORT', text: 'ETT OKÄNT KORT, MINST SÄLLSYNT', price: Math.round(90 * (1 - disc)) },
    ]);
  }
  // efter en pakt: inga andra pakter och bara uppgraderingar för det egna vapnet
  m.stock = m.stock.filter(s => s.kind !== 'card' || (!(run.pact && s.card.pact) && (!s.card.weapon || s.card.weapon === run.pact)));
  return m.stock;
}
function openShop(m) {
  openUI(() => CardUI.shop(shopItems(m), run.gold, item => {
    if (run.gold < item.price) return { ok: false, gold: run.gold };
    if (item.kind === 'health' && P.hp >= maxHp()) { say('DU ÄR REDAN FRISK', 1.2); return { ok: false, gold: run.gold }; }
    run.gold -= item.price; play('buy', 0.8);
    if (item.kind === 'card') { gainCard(item.card); m.stock = m.stock.filter(s => s !== item); if (item.card.pact) return { ok: true, gold: run.gold, items: shopItems(m) }; }
    else if (item.kind === 'health') heal(40 * (1 + mod('healMul')));
    else if (item.kind === 'armor') P.armor = Math.min(200, P.armor + 50);
    else if (item.kind === 'ammo') pickUp({ type: 'ammo' }, true);
    else if (item.kind === 'mystery') { // ett sällsynt eller legendariskt kort, okänt tills det köps
      const pool = drawCards(8, { luck: 2 }).filter(c => c.rarity === 'sallsynt' || c.rarity === 'legendarisk'); const c = pool[0] || drawCards(1, { luck: 2 })[0];
      if (c) { gainCard(c); CardUI.toast(c, 'MYSTERIEKORTET'); } m.stock = m.stock.filter(s => s !== item); return { ok: true, gold: run.gold, items: shopItems(m) };
    } else if (item.kind === 'purge') {
      m.stock = m.stock.filter(s => s !== item);
      setTimeout(() => { const own = [...new Set(run.owned)].map(id => Cards.byId(id)).filter(c => c && !c.pact);
        if (!own.length) { closeUI(); return; }
        CardUI.draft(own, { title: 'RENSA ETT KORT', subtitle: 'VALT KORT FÖRSVINNER UR LEKEN', skipLabel: 'ÅNGRA (PENGARNA TILLBAKA)' }, c => { if (c) { run.owned.splice(run.owned.indexOf(c.id), 1); recomputeMods(); say(c.name + ' ÄR BORTA', 2); } else run.gold += item.price; closeUI(); }); }, 50);
      return { ok: true, gold: run.gold };
    }
    else if (item.kind === 'reroll') { run.rerolls++; m.stock = null; return { ok: true, gold: run.gold, items: shopItems(m) }; }
    return { ok: true, gold: run.gold };
  }, () => closeUI(), { title: 'DÖDGRÄVARENS BOD', currency: 'GULD' }));
}

// ---------- Vägsökning: avståndsfält (BFS) från spelaren ----------
function walkableForEnemy(x, y) { const c = map[y][x]; return !isWallChar(c) && c !== 'f' && c !== 'M' && !isPropChar(c) && c !== '*' && !(c === 'G' && doors[x + ',' + y].open < 0.85); }
function updateFlow() {
  const pc = (P.y | 0) * mw + (P.x | 0);
  if (pc === flowCell) return;
  flowCell = pc; flow.fill(-1);
  const q = [pc]; flow[pc] = 0;
  for (let h = 0; h < q.length; h++) {
    const c = q[h], x = c % mw, y = (c / mw) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= mw || ny >= mh) continue;
      const n = ny * mw + nx; if (flow[n] >= 0 || !walkableForEnemy(nx, ny)) continue;
      flow[n] = flow[c] + 1; q.push(n);
    }
  }
}
const pathDist = e => { const v = flow[(e.y | 0) * mw + (e.x | 0)]; return v < 0 ? 999 : v; };

// ---------- Uppdatering ----------
function stepSound() { // fotsteg låter olika på gräs, grus, trä och sten
  const n = (lvl.floors || [lvl.floor])[cellFloor ? cellFloor[(P.y | 0) * mw + (P.x | 0)] : 0] || '';
  if (/grass/.test(n)) return ['step_grass', 0.22, 1];
  if (/gravel|dirt|mud|cave/.test(n)) return ['step_gravel', 0.16, 1];
  if (/wood/.test(n)) return ['step_wood', 0.2, 1];
  return ['steps', 0.1, 1.65];
}
function update(dt) {
  tmr += dt;
  for (const m of msgs) m.t -= dt;
  while (msgs.length && msgs[msgs.length - 1].t <= 0) msgs.pop();
  P.hurt = Math.max(0, P.hurt - dt); P.pick = Math.max(0, P.pick - dt * 2); P.flash = Math.max(0, P.flash - dt); P.shake = Math.max(0, P.shake - dt * 3);
  // rekyl återhämtar sig mot ursprungligt sikte
  P.pitch -= P.pitch * Math.min(1, dt * 9); const ry = P.ryaw * Math.min(1, dt * 5); P.a -= ry; P.ryaw -= ry;
  P.burstT -= dt; if (P.burstT <= 0) P.burst = 0;
  hitMark = Math.max(0, hitMark - dt); bossBanner = Math.max(0, bossBanner - dt); levelBanner = Math.max(0, levelBanner - dt);
  for (const h of hurtDir) h.t -= dt * 1.2;
  hurtDir = hurtDir.filter(h => h.t > 0);
  for (const n of numbers) { n.t -= dt; n.z += dt * 0.6; }
  while (numbers.length && numbers[0].t <= 0) numbers.shift();
  for (const c of chests) if (c.open) c.t += dt;
  updateParticles(dt);
  for (const f of flashes) f.t -= dt; while (flashes.length && flashes[0].t <= 0) flashes.shift();
  P.boom = Math.max(0, P.boom - dt);
  if (map && state === 'play') updateWeather(dt);
  if (state === 'dead' || state === 'runover') { P.deadT += dt; P.camZ = Math.max(0.12, 0.5 - P.deadT * 0.8); return; }
  if (state !== 'play') return;
  levelTime += dt; run.time += dt;
  if (mod('regen') > 0) heal(mod('regen') * dt, true);
  P.shieldT -= dt; if (P.shieldT <= 0 && P.shield < mod('shield')) P.shield = Math.min(mod('shield'), P.shield + dt * 10);
  P.haste = Math.max(0, P.haste - dt);
  const turn = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
  P.a += turn * 2.4 * dt * (1 - WS.aim * 0.4);
  // mjuk rörelse med acceleration och friktion
  let fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  let str = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  if (touch.active) { // mobil: analog joystick och dra-för-att-vrida
    fwd -= touch.my; str += touch.mx;
    const overEnemy = ents.some(e => !e.dead && Math.abs(Math.atan2(Math.sin(Math.atan2(e.y - P.y, e.x - P.x) - P.a), Math.cos(Math.atan2(e.y - P.y, e.x - P.x) - P.a))) < Math.max(0.03, 0.3 / Math.hypot(e.x - P.x, e.y - P.y)));
    P.a += touch.look * 0.011 * settings.sens * (1 - WS.aim * 0.35) * (overEnemy ? 0.55 : 1);
    WS.swayX = clamp(WS.swayX + touch.look * 0.25, -10, 10); WS.swayY = clamp(WS.swayY + touch.lookY * 0.15, -6, 6);
    touch.look = 0; touch.lookY = 0;
  }
  const running = keys.ShiftLeft || keys.ShiftRight || touch.mag > 0.95;
  const maxSp = (running && WS.aim < 0.5 ? 4.7 : 3.1) * (1 - WS.aim * 0.4) * (1 + mod('moveSpeed')) * (P.haste > 0 ? 1.35 : 1) * (P.slowT > 0 ? 0.55 : 1);
  let tx = 0, ty = 0;
  if (Math.abs(fwd) + Math.abs(str) > 0.05) { const l = Math.hypot(fwd, str), s = Math.min(1, l) / l * maxSp; tx = (Math.cos(P.a) * fwd - Math.sin(P.a) * str) * s; ty = (Math.sin(P.a) * fwd + Math.cos(P.a) * str) * s; }
  const k = Math.min(1, dt * (tx || ty ? 10 : 12));
  P.vx += (tx - P.vx) * k; P.vy += (ty - P.vy) * k;
  tryMove(P, P.vx * dt, P.vy * dt, 0.24);
  if (Math.hypot(P.vx, P.vy) > 1) { // gå in i en stängd dörr så öppnas den
    const nx = P.x + P.vx / Math.hypot(P.vx, P.vy) * 0.45, ny = P.y + P.vy / Math.hypot(P.vx, P.vy) * 0.45, d = doorAt(nx, ny);
    if (d && !d.secret && !d.gate && d.target === 0 && cellAt(nx, ny) === 'D') { d.target = 1; play('door', 0.6, 1, { x: d.x + 0.5, y: d.y + 0.5 }); }
  }
  for (const e of ents) if (!e.dead && !e.dying) pushOut(P, e.x, e.y, e.boss ? 1.1 : 0.55);
  for (const pt of pots) if (!pt.broken) pushOut(P, pt.x, pt.y, 0.45);
  for (const c of chests) pushOut(P, c.x, c.y, 0.5);
  const speed = Math.hypot(P.vx, P.vy);
  P.bobAmp += (clamp(speed / 3.1, 0, 1.4) - P.bobAmp) * Math.min(1, dt * 8);
  P.bob += dt * (4 + speed * 2.2);
  if (speed > 0.8) { stepT -= dt * speed / 3.1; if (stepT <= 0) { const st = stepSound(); play(st[0], st[1], rnd(0.9, 1.1) * st[2]); stepT = 0.42; } }
  for (const key in doors) { const d = doors[key]; if (d.target === 0 && d.open > 0 && occupied(d)) d.target = 1; d.open += Math.sign(d.target - d.open) * Math.min(Math.abs(d.target - d.open), dt * (d.secret ? 0.6 : 1.4)); }
  updateFlow();
  updateWeapon(dt);
  // föremål (guld dras till spelaren, magnetkort gäller allt)
  const reach = 0.55, mag = mod('magnet');
  for (const it of items) {
    if (it.taken) continue;
    const d = Math.hypot(it.x - P.x, it.y - P.y);
    const pull = (it.type === 'gold' || it.type === 'goldpile' ? 1.2 : 0) + mag;
    if (pull > 0 && d < pull + reach && d > 0.05) { it.x += (P.x - it.x) / d * dt * 4; it.y += (P.y - it.y) / d * dt * 4; }
    if (d > reach) continue;
    if (!pickUp(it)) continue;
    it.taken = true; P.pick = it.type.startsWith('gold') ? 0.3 : 1; score += 25; if (!it.drop) itemsTaken++;
  }
  hint = '';
  for (const c of chests) if (!c.open && Math.hypot(c.x - P.x, c.y - P.y) < 1.2) hint = isTouch() ? 'HANDEN: ÖPPNA KISTAN' : 'E: ÖPPNA KISTAN';
  for (const m of merchants) if (Math.hypot(m.x - P.x, m.y - P.y) < 1.6) hint = isTouch() ? 'HANDEN: HANDLA' : 'E: HANDLA';
  if (lvl.exit && Math.floor(P.x) === lvl.exit.x && Math.floor(P.y) === lvl.exit.y) { floorDone(); return; }
  for (const e of ents) { if (e.boss) updateBoss(e, dt); else updateEnemy(e, dt); }
  updateProjectiles(dt); updateFuses(dt); updatePortals(dt); updateHazards(dt); updateProps(dt);
  if (P.slowT > 0) P.slowT -= dt;
  if (P.hp < maxHp() * 0.3 && !breathSnd && actx) breathSnd = play('breath', 0.35, 1, { loop: true });
  if (P.hp < maxHp() * 0.3) { heartT -= dt; if (heartT <= 0) { heartT = 0.55 + P.hp / maxHp() * 1.5; play('heart', 0.55); } } // hjärtat bultar snabbare ju närmare döden
  if (P.hp >= maxHp() * 0.3 && breathSnd) { breathSnd.s.stop(); breathSnd = null; }
}
function pickUp(it, bought) {
  const am = diff().ammo * (1 + mod('ammoMul'));
  if (it.type === 'gold' || it.type === 'goldpile') {
    const n = Math.round((it.type === 'goldpile' ? rnd(8, 14) + run.depth * 3 : rnd(2, 5) + run.depth) * (1 + mod('goldMul')));
    const n2 = dmod('gold') ? n : dmod('swift') ? Math.round(n * 0.5) : 0; run.gold += n2;
    run.gold += n; play('coin', 0.5, rnd(0.95, 1.15)); if (it.type === 'goldpile') say(`+${n} GULD`, 1.2); return true;
  }
  if (it.type === 'cardpick') { // kortval från elit, väktare och boss
    play('card', 0.8, 1.2);
    openUI(() => CardUI.draft(drawCards(3, { luck: it.luck || 0.3 }), { title: it.title || 'BYTE', subtitle: 'VÄLJ ETT KORT', skipLabel: 'TA INGET' }, card => { gainCard(card); closeUI(); }));
    return true;
  }
  if (it.type === 'health') { if (P.hp >= maxHp()) return false; const n = Math.round(30 * (1 + mod('healMul'))); heal(n); say(`+${n} HÄLSA`, 1.5); play('health', 0.7); }
  else if (it.type === 'shard') { if (P.armor >= 200) return false; P.armor = Math.min(200, P.armor + 10); say('+10 RUSTNING', 1); play('armor', 0.5, 1.4); }
  else if (it.type === 'armor') { if (P.armor >= 200) return false; P.armor = Math.min(200, P.armor + 50); say('+50 RUSTNING', 1.5); play('armor', 0.7); }
  else if (it.type === 'ammo' && run.pact) { // pakten: all ammo blir vapnets egen
    const k = pactAmmo(), n = Math.round({ p9: 30, r556: 28, shells: 9, bolts: 8, flares: 5 }[k] * am);
    if (P.ammo[k] >= AMMO[k].max && !bought) return false;
    P.ammo[k] = Math.min(AMMO[k].max, P.ammo[k] + n); say(`AMMO +${n} ${AMMO[k].name}`, 2); play('pickup', 0.7);
  } else if (it.type === 'ammo') {
    const full = Object.keys(AMMO).every(k => P.ammo[k] >= AMMO[k].max);
    if (full && !bought) return false;
    const has = id => P.has[weaponIndex(id)];
    const add = { p9: Math.round(18 * am), r556: Math.round((has('rifle') || has('sniper') ? 20 : 8) * am), shells: Math.round((has('shotgun') || has('dbshotgun') ? 6 : 3) * am),
      bolts: Math.round((has('crossbow') ? 5 : 0) * am), flares: Math.round((has('flaregun') ? 3 : 0) * am) };
    add[WEAPONS[P.weapon].ammo] = Math.round(add[WEAPONS[P.weapon].ammo] * 1.5); // mer till vapnet du håller
    for (const k in add) P.ammo[k] = Math.min(AMMO[k].max, P.ammo[k] + add[k]);
    say('AMMO ' + Object.keys(add).filter(k => add[k] > 0).map(k => `+${add[k]} ${AMMO[k].name}`).join(' '), 2); play('pickup', 0.7);
  } else {
    const i = weaponIndex(it.type), w = WEAPONS[i];
    if (run.pact && w.id !== run.pact) { // pakten: andra vapen blir ammo och guld
      const k = pactAmmo(); P.ammo[k] = Math.min(AMMO[k].max, P.ammo[k] + { p9: 30, r556: 30, shells: 8, bolts: 8, flares: 5 }[k]); run.gold += 20;
      say(`EDEN: ${w.name} BLIR AMMO OCH 20 GULD`, 2.5); play('coin', 0.7); return true;
    }
    const first = !P.has[i];
    P.has[i] = true;
    if (first) P.mags[i] = effMag(i);
    P.ammo[w.ammo] = Math.min(AMMO[w.ammo].max, P.ammo[w.ammo] + { p9: 30, r556: 30, shells: 8, bolts: 10, flares: 6 }[w.ammo]);
    say('DU HITTADE: ' + w.name, 2.5); play('weapon', 0.8);
    if (first) switchWeapon(i);
  }
  return true;
}
function updateWeapon(dt) {
  const wp = WEAPONS[P.weapon];
  WS.t += dt; WS.shot += dt; WS.cd -= dt;
  WS.spread = Math.max(0, WS.spread - dt * 0.12);
  const moving = Math.hypot(P.vx, P.vy) / 3.1;
  WS.spread = Math.max(WS.spread, moving * 0.012 * (1 - WS.aim * 0.7));
  WS.swayX *= Math.pow(0.0001, dt); WS.swayY *= Math.pow(0.0001, dt);
  const wantAim = aimDown && (WS.state === 'idle') ? 1 : 0;
  WS.aim += (wantAim - WS.aim) * Math.min(1, dt * 10);
  WS.punch = Math.max(0, WS.punch - dt * 0.35); WS.kick = Math.max(0, WS.kick - dt); WS.nameT = Math.max(0, WS.nameT - dt); P.kickT = Math.max(0, P.kickT - dt);
  plane = BASE_PLANE * (1 - WS.aim * (wp.zoom || 0.22)) * (1 + WS.punch);
  if (WS.state === 'holster' && WS.t >= 0.22) { P.weapon = WS.next; WS.state = 'draw'; WS.t = 0; WS.nameT = 1.6; }
  else if (WS.state === 'draw' && WS.t >= drawTime()) { WS.state = 'idle'; WS.t = 0; }
  else if (WS.state === 'reload') {
    if (wp.shellReload) {
      if (WS.t >= shellSeg(WS.shellPhase)) {
        WS.t = 0;
        if (WS.shellPhase === 'start') WS.shellPhase = 'step';
        else if (WS.shellPhase === 'step') {
          P.mags[P.weapon]++; P.ammo.shells--; play('shell', 0.5, rnd(1.1, 1.3));
          if (P.mags[P.weapon] >= effMag(P.weapon) || P.ammo.shells <= 0) WS.shellPhase = 'end';
        } else { WS.state = 'idle'; play('reload', 0.45, 1.4); }
      }
    } else {
      const dur = wp.reload * reloadMul();
      if (!WS.loaded && WS.t >= dur * 0.65) { WS.loaded = true; finishReload(); play('click', 0.5, 0.9); }
      if (WS.t >= dur) { WS.state = 'idle'; WS.loaded = false; }
    }
  }
  if (WS.state !== 'reload') WS.loaded = false;
  if (touch.tap > 0) touch.tap -= dt;
  if (P.iframe > 0) P.iframe -= dt;
  const trig = mouseDown || keys.ControlLeft || keys.KeyF || touch.tap > 0;
  WS.spin = trig && up('spin') ? Math.min(2, WS.spin + dt) : Math.max(0, WS.spin - dt * 3);
  WS.focus = up('focus') && WS.aim > 0.8 && WS.state === 'idle' ? Math.min(1, WS.focus + dt) : 0;
  if (trig && (wp.auto || up('fan') || !fireHeld)) fire();
  fireHeld = trig;
}
const hasMod = (e, id) => !!e.elite && (e.elite.id === id || (e.elite2 && e.elite2.id === id));
function eliteTick(e, dt) { // elitegenskaper som verkar över tid
  if (!e.elite) return;
  if (hasMod(e, 'regen') && tmr - (e.lastHurt || 0) > 2 && e.hp < e.maxHp) { e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.04 * dt); if (Math.random() < dt * 4) spawnPuff(e.x, e.y, 1); }
  if (hasMod(e, 'teleport') && e.alert) {
    e.tpT = (e.tpT ?? 3) - dt;
    const d = Math.hypot(P.x - e.x, P.y - e.y);
    if (e.tpT <= 0 && d > 3) { e.tpT = rnd(3.5, 5); const a = Math.atan2(e.y - P.y, e.x - P.x) + rnd(-1, 1), r = rnd(1.6, 2.4), x = P.x + Math.cos(a) * r, y = P.y + Math.sin(a) * r;
      if (freeSpot(x, y, 0.3) && hasLOS(P.x, P.y, x, y)) { spawnPuff(e.x, e.y, 6); e.x = x; e.y = y; spawnPuff(x, y, 6); play('whoosh', 0.6, 1.8, { x, y }); } }
  }
}
function statusFx(e, dt) { // syns på fienden: glöd när den brinner, bubblor av gift, frost när den är långsam
  if (settings.lowfx || !fx.parts.ember) return;
  const pick = e.burn > 0 ? [255, 140, 50] : e.poison > 0 ? [120, 255, 90] : e.slow > 0 ? [140, 200, 255] : null;
  if (pick && Math.random() < dt * 6) particles.push({ x: e.x + rnd(-0.2, 0.2), y: e.y + rnd(-0.2, 0.2), z: rnd(0.2, 0.8) * e.d.size, vx: 0, vy: 0, vz: 0.6, life: 0.6, maxLife: 0.6, frames: fx.parts.ember, img: fx.parts.ember[0], size: 0.05, add: true, tint: pick, drift: true });
}
function statusTick(e, dt) { // brand och långsamhet
  statusFx(e, dt);
  e.slow = Math.max(0, e.slow - dt); e.haste = Math.max(0, (e.haste || 0) - dt);
  if (e.burn > 0 && !e.panic && Math.random() < 0.5) e.panic = rnd(0, TAU); else if (e.burn <= 0) e.panic = 0;
  if (e.burn > 0 && e.panic && Math.random() < dt * 1.5) e.panic += rnd(-1.2, 1.2);
  if (e.poison > 0) { // giftspetsen
    e.poison -= dt; e.poisonAcc = (e.poisonAcc || 0) + dt;
    if (e.poisonAcc >= 0.5) { e.poisonAcc = 0; hurtEnemy(e, Math.min(e.maxHp * 0.05, 2.5) * (1 + mod('dmg')), e.x, e.y, { noProc: true, quiet: true }); if (e.dead) return; }
  }
  if (e.burn > 0) {
    e.burn -= dt; e.burnAcc += dt;
    if (e.burnAcc >= 0.5) { e.burnAcc = 0; hurtEnemy(e, 0.8 * (1 + mod('dmg')), e.x, e.y, { noProc: true, quiet: true }); }
  }
}
function wakeMimic(e) {
  e.dormant = false; totalEnemies++; alertEnemy(e); e.state = 'attack'; e.t = 0; e.cd = 0.4; e.didHit = false;
  play('chest', 0.9, 0.7, { x: e.x, y: e.y }); play('roar', 0.6, 1.5, { x: e.x, y: e.y }); say('KISTAN LEVER!', 1.5); P.shake = Math.max(P.shake, 0.8);
}
function updateEnemy(e, dt) {
  e.t += dt; e.flash = Math.max(0, e.flash - dt); e.spotT = Math.max(0, (e.spotT || 0) - dt);
  if (e.dead) return;
  if (e.dormant) { e.state = 'idle'; if (e.hp < e.maxHp || Math.hypot(P.x - e.x, P.y - e.y) < 1.15) wakeMimic(e); return; } // mimicen väntar som en kista
  statusTick(e, dt); if (e.dead) return;
  eliteTick(e, dt);
  const dx = P.x - e.x, dy = P.y - e.y, dist = Math.hypot(dx, dy);
  const los = dist < 14 && hasLOS(e.x, e.y, P.x, P.y);
  if (!e.alert && los && dist < (dmod('dark') ? 6 : 10)) alertEnemy(e, true);
  if (!e.alert) { e.state = 'idle'; return; }
  e.growlT -= dt; if (e.growlT <= 0) { e.growlT = rnd(4, 9); play(e.d.growl, e.d.ai === 'stealth' ? 0.15 : 0.45, rnd(0.9, 1.2), { x: e.x, y: e.y }); }
  if (e.stun > 0 && e.d.ai !== 'charge') { e.stun -= dt; e.state = 'pain'; e.t = Math.min(e.t, 0.25); return; } // bländad
  if (e.d.ai && ENEMY_AI[e.d.ai](e, dt, dist, los)) return;
  if (e.state === 'pain') { if (e.t > 5 / 14) { e.state = 'move'; e.t = 0; } return; }
  e.cd -= dt;
  if (e.state === 'attack') {
    const dur = enemyFrames[e.type].attack.length / e.d.atkFps;
    if (!e.didHit && e.t > dur * e.d.hitAt) { e.didHit = true; enemyStrike(e, dist); }
    if (e.t > dur) { e.state = 'move'; e.t = 0; e.cd = e.d.cd * rnd(0.8, 1.2); }
    return;
  }
  if (los && dist < e.d.range && e.cd <= 0) { e.state = 'attack'; e.t = 0; e.didHit = false; return; }
  e.state = 'move'; e.mvx = 0; e.mvy = 0;
  const want = (e.d.kite && los && dist < e.d.kite * (e.hp < e.maxHp * 0.3 ? 2 : 1)) || (e.burn > 0 && e.panic) || (!(los && !e.d.melee && dist < e.d.range * 0.6) && dist > 0.75);
  if (!want) return;
  const sp = e.d.speed * diff().speed * dt * (e.slow > 0 ? 0.5 : 1) * (e.haste > 0 ? 1.45 : 1) * (dmod('swift') ? 1.25 : 1);
  let tx = P.x, ty = P.y;
  if (!los || dist > 6) { // följ avståndsfältet runt hörn
    const cx = e.x | 0, cy = e.y | 0; let best = flow[cy * mw + cx], bx = -1, by = -1;
    for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + ddx, ny = cy + ddy; if (nx < 0 || ny < 0 || nx >= mw || ny >= mh) continue;
      const v = flow[ny * mw + nx]; if (v >= 0 && (best < 0 || v < best)) { best = v; bx = nx; by = ny; }
    }
    if (bx >= 0) {
      tx = bx + 0.5; ty = by + 0.5;
      const d = doors[bx + ',' + by]; // fiender öppnar dörrar
      if (d && !d.gate && !d.secret && d.target === 0) { d.target = 1; play('door', 0.5, 1, { x: bx + 0.5, y: by + 0.5 }); }
    }
  }
  let ang = Math.atan2(ty - e.y, tx - e.x);
  const fleeing = e.d.kite && e.hp < e.maxHp * 0.3; // skadade magiker och shamaner flyr
  if (e.burn > 0 && !e.elite && e.d.melee && e.panic) ang = e.panic; // brinnande fiender springer i panik
  else if (e.d.kite && los && dist < e.d.kite * (fleeing ? 2 : 1)) ang += Math.PI; // magiker och shamaner håller avstånd
  else if (e.d.ai === 'blink' && los) ang += Math.sin(e.t * 5 + e.x * 3) * 0.7; // smådjävulen sicksackar
  else if (los && e.d.melee && dist > 1.8 && dist < 7) ang += (e.flank || 0) * clamp((dist - 1.8) / 4, 0, 1) * 0.6; // grupper sprider sig och kommer från sidorna
  const ox = e.x, oy = e.y;
  tryMove(e, Math.cos(ang) * sp, Math.sin(ang) * sp, 0.28);
  if (Math.hypot(e.x - ox, e.y - oy) < sp * 0.3) tryMove(e, Math.cos(ang + 1.2) * sp, Math.sin(ang + 1.2) * sp, 0.28);
  for (const o of ents) if (o !== e && !o.dead) pushOut(e, o.x, o.y, o.boss ? 1.2 : 0.55);
  e.mvx = e.x - ox; e.mvy = e.y - oy;
}
function enemyStrike(e, dist) {
  let dmg = e.d.dmg * (1 + 0.1 * (run.depth - 1));
  if (e.d.melee) {
    if (dist < e.d.range + 0.35) {
      if (e.d.ai === 'stealth') { // rygghugg om spelaren tittar bort
        let off = Math.abs(Math.atan2(e.y - P.y, e.x - P.x) - P.a) % TAU; if (off > Math.PI) off = TAU - off;
        if (off > 1.75) { dmg *= 1.7; say('RYGGHUGG!', 1); }
      }
      hurtPlayer(dmg, e.x, e.y, 'melee'); play('splat', 0.5, 0.7);
      if (mod('thorns') > 0) hurtEnemy(e, mod('thorns'), e.x, e.y, { noProc: true });
      if (e.elite && e.elite.id === 'vamp') e.hp = Math.min(e.maxHp, e.hp + dmg);
    } else play('whoosh', 0.4, 1.2, { x: e.x, y: e.y });
  } else { // eldklot som går att undvika
    const lead = 0.25, tx = P.x + P.vx * lead, ty = P.y + P.vy * lead, a = Math.atan2(ty - e.y, tx - e.x) + rnd(-0.05, 0.05);
    const kind = e.d.proj, speed = kind === 'orb' ? 3.4 : kind === 'bolt' ? 6.5 : 5.2;
    shootFireball(e, a, speed, dmg, false, kind);
    if (e.elite) { shootFireball(e, a - 0.18, speed, dmg, false, kind); shootFireball(e, a + 0.18, speed, dmg, false, kind); }
    play('whoosh', 0.6, 0.8, { x: e.x, y: e.y });
  }
}
// ---------- Specialfiender ----------
function spawnPuff(x, y, n = 5) { // magisk rök när något dyker upp eller försvinner
  for (let j = 0; j < n; j++) particles.push({ x: x + rnd(-0.2, 0.2), y: y + rnd(-0.2, 0.2), z: rnd(0.2, 0.6), vx: rnd(-0.8, 0.8), vy: rnd(-0.8, 0.8), vz: rnd(0.5, 1.5), life: 0.45, maxLife: 0.45, frames: fx.hit, img: fx.hit[0], size: 0.4, add: true });
}
function freeSpot(x, y, r) { return !solid(x, y) && !solid(x + r, y) && !solid(x - r, y) && !solid(x, y + r) && !solid(x, y - r); }
function blink(e) { // smådjävulen hoppar åt sidan
  const side = Math.atan2(P.y - e.y, P.x - e.x) + (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
  for (const d of [2.2, 1.6, 1.1]) {
    const x = e.x + Math.cos(side) * d, y = e.y + Math.sin(side) * d;
    if (freeSpot(x, y, 0.3)) { spawnPuff(e.x, e.y); e.x = x; e.y = y; spawnPuff(x, y); e.blinkCd = 1.6; play('whoosh', 0.5, 1.6, { x, y }); return; }
  }
}
function splitBlob(e) { // blodslemmet delar sig i två droppar
  for (const s of [-1, 1]) {
    const a = Math.atan2(P.y - e.y, P.x - e.x) + s * 1.2, x = e.x + Math.cos(a) * 0.45, y = e.y + Math.sin(a) * 0.45;
    const c = makeEnemy('l', freeSpot(x, y, 0.2) ? x : e.x, freeSpot(x, y, 0.2) ? y : e.y);
    c.alert = true; c.state = 'move'; c.cd = 0.8; ents.push(c); totalEnemies++;
  }
  play('splat', 0.7, 0.6, { x: e.x, y: e.y });
}
const ENEMY_AI = { // returnerar true när beteendet tar över hela uppdateringen
  blink(e, dt) { e.blinkCd = (e.blinkCd || 0) - dt; return false; },
  split() { return false; },
  summon(e, dt, dist, los) { // benmagikern väcker skelett, högst två åt gången
    e.summonT = (e.summonT ?? rnd(2, 4)) - dt;
    if (e.summonT > 0 || !los || dist > 12 || e.state !== 'move') return false;
    e.summonT = rnd(8, 11);
    if (ents.filter(o => o.master === e && !o.dead).length >= 2) return false;
    const a0 = rnd(0, TAU); let x = 0, y = 0, found = false;
    for (let k = 0; k < 8 && !found; k++) { const a = a0 + k * TAU / 8; x = e.x + Math.cos(a) * 1.3; y = e.y + Math.sin(a) * 1.3; found = freeSpot(x, y, 0.3); }
    if (!found) return false;
    const m = makeEnemy('S', x, y); m.alert = true; m.master = e; m.state = 'pain'; m.t = 0; ents.push(m); totalEnemies++;
    spawnPuff(x, y, 8); play('hiss', 0.6, 0.6, { x, y }); say('BENMAGIKERN VÄCKER DE DÖDA', 1.5);
    return false;
  },
  heal(e, dt) { // orkshamanen helar och driver på sina vänner
    e.healT = (e.healT ?? rnd(1.5, 3)) - dt;
    if (e.healT > 0 || e.state === 'attack' || e.state === 'pain') return false;
    e.healT = 5;
    let n = 0;
    for (const o of ents) {
      if (o.dead || o.boss || Math.hypot(o.x - e.x, o.y - e.y) > 5.5) continue;
      if (o !== e && o.hp < o.maxHp) { o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.35); n++; }
      if (o !== e) { o.haste = 3.5; o.alert = true; }
      for (let j = 0; j < 3; j++) particles.push({ x: o.x + rnd(-0.2, 0.2), y: o.y + rnd(-0.2, 0.2), z: rnd(0.2, 0.8), vx: 0, vy: 0, vz: rnd(0.6, 1.2), life: 0.6, maxLife: 0.6, frames: fx.hit, img: fx.hit[0], size: 0.22, add: true });
    }
    play('health', 0.4, 0.6, { x: e.x, y: e.y });
    if (n) e.flash = 0.1;
    return false;
  },
  stealth(e, dt, dist) { // gravrövaren syns bara på nära håll, när den anfaller eller har träffats
    e.revealT = Math.max(0, (e.revealT || 0) - dt);
    const want = e.state === 'attack' || e.state === 'pain' || dist < 2.2 || e.revealT > 0 ? 0 : 0.88;
    e.ghost = e.ghost === undefined ? want : e.ghost + clamp(want - e.ghost, -dt * 3, dt * 1.2);
    return false;
  },
  charge(e, dt, dist, los) { // orkkrigaren stormar fram och blir yr om den krockar i en vägg
    e.chargeCd = (e.chargeCd ?? rnd(2, 4)) - dt;
    if (e.stun > 0) { e.stun -= dt; e.state = 'pain'; e.t = Math.min(e.t, 0.25); return true; }
    if (e.charge > 0) {
      e.charge -= dt; e.state = 'move';
      const sp = 5.2 * diff().speed * dt * (e.slow > 0 ? 0.5 : 1), ox = e.x, oy = e.y;
      tryMove(e, Math.cos(e.chargeA) * sp, Math.sin(e.chargeA) * sp, 0.3);
      e.mvx = e.x - ox; e.mvy = e.y - oy;
      if (Math.hypot(P.x - e.x, P.y - e.y) < 0.8) { // träff: skada och knuff
        e.charge = 0; e.cd = 1;
        hurtPlayer(e.d.dmg * 1.3 * (1 + 0.1 * (run.depth - 1)), e.x, e.y, 'melee'); play('bigboom', 0.5, 1.3);
        tryMove(P, Math.cos(e.chargeA) * 0.7, Math.sin(e.chargeA) * 0.7, 0.25); P.shake = Math.max(P.shake, 2);
      } else if (Math.hypot(e.x - ox, e.y - oy) < sp * 0.35) { // krock i väggen
        e.charge = 0; e.stun = 1.6; e.t = 0; play('bigboom', 0.5, 0.7, { x: e.x, y: e.y }); say('ORKKRIGAREN ÄR YR!', 1);
      }
      return true;
    }
    if (los && dist > 2.5 && dist < 8 && e.chargeCd <= 0 && e.state === 'move') {
      e.chargeCd = rnd(5, 7); e.charge = 1.3; e.chargeA = Math.atan2(P.y - e.y, P.x - e.x);
      play('roar', 0.7, 0.7, { x: e.x, y: e.y });
      return true;
    }
    return false;
  },
};
// kind: undefined = eldklot, 'orb' = benmagikerns sökande klot, 'bolt' = shamanens gröna blixt
const PROJ_TINT = { blue: [90, 170, 255], rock: [150, 110, 80], orb: [190, 100, 255], bolt: [110, 255, 110], gren: [230, 230, 200], flare: [255, 110, 70], spark: [255, 200, 90] };
function shootFireball(src, a, speed, dmg, big, kind) {
  const r = src.boss ? 1.1 : 0.4;
  projectiles.push({ x: src.x + Math.cos(a) * r, y: src.y + Math.sin(a) * r, z: src.boss ? 0.8 : 0.55, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, dmg, src, big, kind, life: kind === 'orb' ? 5 : 6 });
}
function updateProjectiles(dt) {
  for (const p of projectiles) {
    if (p.kind === 'orb') { // svänger mot spelaren, men långsamt nog att springa ifrån
      const sp = Math.hypot(p.vx, p.vy), cur = Math.atan2(p.vy, p.vx);
      let d = Math.atan2(P.y - p.y, P.x - p.x) - cur; d = Math.atan2(Math.sin(d), Math.cos(d));
      const na = cur + clamp(d, -1.4 * dt, 1.4 * dt); p.vx = Math.cos(na) * sp; p.vy = Math.sin(na) * sp;
    }
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    if (p.z > 0.55) p.z -= dt * 0.25;
    if (p.friendly) { // spelarens granat och bloss: smäller vid fiende, vägg eller när tiden är ute
      const hit = ents.find(e => !e.dead && !e.dying && Math.hypot(e.x - p.x, e.y - p.y) < (p.kind === 'gren' ? 0.5 : 0.45));
      if (solid(p.x, p.y) && !hit && p.kind === 'flare' && up('bounce') && (p.bounces || 0) < 2) { // ekoblosset
        const ox = p.x - p.vx * dt, oy = p.y - p.vy * dt;
        if (solid(p.x, oy)) p.vx = -p.vx; if (solid(ox, p.y)) p.vy = -p.vy;
        p.x = ox; p.y = oy; p.bounces = (p.bounces || 0) + 1; play('ricochet', 0.5, 0.8, { x: p.x, y: p.y });
        continue;
      }
      if (solid(p.x, p.y) || p.life <= 0 || hit) {
        p.dead = true;
        const x = p.x - p.vx * 0.03, y = p.y - p.vy * 0.03;
        if (p.kind === 'spark') { if (hit) hurtEnemy(hit, p.dmg, x, y, { noProc: true }); flareBurst(x, y, p.dmg, 1.0, true); }
        else if (p.kind === 'flare') { if (hit) { hurtEnemy(hit, p.dmg, x, y); hitMark = 0.15; } flareBurst(x, y, p.dmg); }
        else { explode(x, y, p.dmg, 2.0); play('bigboom', 0.6, 1.1, { x: p.x, y: p.y }); P.shake = Math.max(P.shake, 1); }
      }
      continue;
    }
    if (Math.hypot(p.x - P.x, p.y - P.y) < (p.big ? 0.5 : 0.35)) { hurtPlayer(p.dmg, p.src.x, p.src.y, 'proj'); p.dead = true; }
    else if (solid(p.x, p.y) || p.life <= 0) p.dead = true;
    if (p.dead) {
      play('fireburst', 0.5, rnd(0.9, 1.1), { x: p.x, y: p.y });
      for (let i = 0; i < 3; i++) particles.push({ x: p.x - p.vx * 0.02, y: p.y - p.vy * 0.02, z: 0.45, vx: rnd(-1, 1), vy: rnd(-1, 1), vz: rnd(0, 1), life: 0.35, maxLife: 0.35, frames: fx.fireball, img: fx.fireball[0], size: 0.3, add: true });
    }
  }
  projectiles = projectiles.filter(p => !p.dead);
}
function updateParticles(dt) {
  for (const p of particles) {
    p.life -= dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.drift) { p.z += p.vz * dt; if (p.sway !== undefined) { p.sway += dt * 3; p.x += Math.cos(p.sway) * dt * 0.3; p.y += Math.sin(p.sway * 1.3) * dt * 0.3; } }
    if (solid(p.x, p.y)) { p.x -= p.vx * dt; p.y -= p.vy * dt; p.vx *= -0.3; p.vy *= -0.3; }
    if (p.grav) { p.vz -= 6 * dt; p.z += p.vz * dt; if (p.z < 0) { p.z = 0; if (p.bounce && p.vz < -1) { p.vz *= -0.35; } else { p.vz = 0; p.vx *= 0.8; p.vy *= 0.8; } } }
    if (p.flap || p.sway !== undefined) p.img = p.frames[Math.floor(tmr * (p.flap ? 14 : 6) + (p.sway || 0)) % p.frames.length];
    else if (p.frames) p.img = p.frames[clamp(Math.floor((1 - p.life / p.maxLife) * p.frames.length), 0, p.frames.length - 1)];
  }
  particles = particles.filter(p => p.life > 0 && (p.z > -0.05 || !p.drift));
  if (particles.length > 260) particles.splice(0, particles.length - 260);
}

// ---------- Bossarna ----------
// Gemensamt: dödsanimation, status, faser (2 under 2/3 HP, 3 under 1/3) och läten. Resten styrs av BOSS_AI[id].
function updateBoss(b, dt) {
  b.t += dt; b.flash = Math.max(0, b.flash - dt);
  if (b.dying) {
    b.dying += dt; P.shake = Math.max(P.shake, 1.5);
    if (Math.random() < dt * 12) explodeFx(b.x + rnd(-1, 1), b.y + rnd(-1, 1), rnd(0.3, 1.6));
    if (b.dying > (b.guardian ? 1.6 : 2.6)) { b.dying = 0; b.dead = true; if (b.guardian) finishGuardian(b); else finishBoss(b); }
    return;
  }
  if (b.dead) return;
  if (b.asleep) { // väktaren vaknar när man kommer in i rummet eller skjuter på den
    if (b.hp < b.maxHp || (Math.hypot(P.x - b.x, P.y - b.y) < 6.5 && hasLOS(b.x, b.y, P.x, P.y))) wakeGuardian(b); else return;
  }
  statusTick(b, dt); if (b.dead || b.dying) return;
  const dx = P.x - b.x, dy = P.y - b.y, dist = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
  const ph = b.hp < b.maxHp / 3 ? 3 : b.hp < b.maxHp * 2 / 3 ? 2 : 1;
  if (ph !== b.phase) { b.phase = ph; hitStop = 0.18; play('bossroar', 1, ph === 3 ? 1.1 : 0.9); say(b.d.phaseMsg[ph - 2], 2.5); P.shake = 2; }
  b.growlT -= dt; if (b.growlT <= 0) { b.growlT = rnd(6, 10); play('bossroar', 0.6, rnd(0.8, 1)); }
  b.mvx = b.mvy = 0;
  if (b.stun > 0) { b.stun -= dt; return; }
  BOSS_AI[b.id](b, dt, dist, ang, ph);
}
function bossWarn(b, text) { if ((b.warnT || 0) < tmr) { b.warnT = tmr + 3; say(text, 1.2); play('stinger', 0.25, 1.6); } }
function bossMove(b, a, sp) { const ox = b.x, oy = b.y; tryMove(b, Math.cos(a) * sp, Math.sin(a) * sp, 0.9); b.mvx = b.x - ox; b.mvy = b.y - oy; return Math.hypot(b.mvx, b.mvy); }
function freeSpotFar(minD, maxD) { // fri plats på lagom avstånd från spelaren (teleport, framträdanden)
  for (let i = 0; i < 40; i++) {
    const a = rnd(0, TAU), r = rnd(minD, maxD), x = P.x + Math.cos(a) * r, y = P.y + Math.sin(a) * r;
    if (freeSpot(x, y, 0.9) && hasLOS(P.x, P.y, x, y)) return [x, y];
  }
  return null;
}
const BOSS_AI = {
  // Bendemonen: eldfläktar och vingslag, kallar på skelett från fas 2, snabbare i fas 3
  demon(b, dt, dist, ang, ph) {
    const fast = ph === 3 ? 1.5 : 1;
    if (ph >= 2) { b.summonT -= dt; if (b.summonT <= 0) { b.summonT = ph === 3 ? 9 : 13; summonMinions(b); } }
    if (b.state === 'breath') { // eldfläkt
      const k = Math.floor(b.t * 12);
      if (k >= 6 && k <= 14 && k !== b.lastShot && k % 2 === 0) {
        b.lastShot = k; const n = ph === 3 ? 7 : 5;
        for (let i = 0; i < n; i++) shootFireball(b, ang + (i - (n - 1) / 2) * 0.16 + rnd(-0.03, 0.03), 5.5 + ph * 0.5, 9, true);
        play('whoosh', 0.7, 0.6, { x: b.x, y: b.y });
      }
      if (b.t > 1.5) { b.state = 'idle'; b.t = 0; b.cd = rnd(1.4, 2.2) / fast; }
      return;
    }
    if (b.state === 'slam') { // vingslag + stöt
      if (!b.didHit && b.t > 0.85) {
        b.didHit = true; P.shake = Math.max(P.shake, 2.5); play('bigboom', 0.7, 0.8);
        if (dist < b.d.range) hurtPlayer(b.d.dmg, b.x, b.y, 'melee');
        const n = ph === 3 ? 14 : 10;
        if (ph >= 2) for (let i = 0; i < n; i++) shootFireball(b, i / n * TAU + b.t, 4.2, 8, true);
      }
      if (b.t > 1.3) { b.state = 'idle'; b.t = 0; b.cd = rnd(1.2, 2) / fast; }
      return;
    }
    b.cd -= dt;
    if (b.cd <= 0 && hasLOS(b.x, b.y, P.x, P.y)) {
      b.t = 0; b.didHit = false; b.lastShot = -1;
      b.state = dist < b.d.range + 0.6 || (ph >= 2 && Math.random() < 0.35) ? 'slam' : 'breath';
      if (b.state === 'slam') { play('bossroar', 0.7, 1.2); bossWarn(b, 'BENDEMONEN LYFTER VINGARNA!'); }
      return;
    }
    if (dist > 3) bossMove(b, ang, b.d.speed * fast * dt * (b.slow > 0 ? 0.5 : 1));
  },
  // Helvetesbesten: eldklot och eldpelare under spelaren; från fas 2 sjunker den ned och dyker upp någon annanstans
  beast(b, dt, dist, ang, ph) {
    if (b.state === 'breath') {
      const k = Math.floor(b.t / 0.22);
      if (k >= 1 && k <= 3 + (ph === 3 ? 2 : 0) && k !== b.lastShot) { b.lastShot = k; shootFireball(b, ang + rnd(-0.05, 0.05), 6.5, 10, true); play('whoosh', 0.6, 0.7, { x: b.x, y: b.y }); }
      if (b.t > 1.3) { b.state = 'idle'; b.t = 0; b.cd = rnd(1.3, 2) / (ph === 3 ? 1.4 : 1); }
      return;
    }
    if (b.state === 'burn') {
      if (!b.didHit && b.t > 0.35) {
        b.didHit = true; play('fireburst', 0.8, 0.6);
        const n = 1 + ph * 2;
        for (let i = 0; i < n; i++) { const a = rnd(0, TAU), r = i ? rnd(0.8, 2.6) : 0; addHazard(P.x + Math.cos(a) * r + P.vx * 0.3, P.y + Math.sin(a) * r + P.vy * 0.3, 'pillar', { warn: 0.9, life: 0.9, r: 0.75, dmg: 16 }); }
      }
      if (b.t > 0.9) { b.state = 'idle'; b.t = 0; b.cd = rnd(1.2, 1.8); }
      return;
    }
    if (b.state === 'sink') { // försvinner ned i marken och dyker upp igen
      if (b.t > 0.6 && !b.hidden) { b.hidden = true; play('fireburst', 0.7, 0.5, { x: b.x, y: b.y }); }
      if (b.t > 1.4) {
        const spot = freeSpotFar(5, 9); if (spot) [b.x, b.y] = spot;
        b.hidden = false; b.state = 'idle'; b.t = 0; b.cd = 0.4; spawnPuff(b.x, b.y, 12); play('bossroar', 0.8, 0.8);
        if (ph === 3) for (let i = 0; i < 10; i++) shootFireball(b, i / 10 * TAU, 4.5, 8, true);
      }
      return;
    }
    b.cd -= dt; b.sinkT = (b.sinkT ?? 8) - dt;
    if (ph >= 2 && b.sinkT <= 0) { b.sinkT = ph === 3 ? 7 : 10; b.state = 'sink'; b.t = 0; return; }
    if (b.cd <= 0 && hasLOS(b.x, b.y, P.x, P.y)) { b.t = 0; b.didHit = false; b.lastShot = -1; b.state = Math.random() < (ph === 1 ? 0.45 : 0.6) ? 'burn' : 'breath'; play('bossroar', 0.6, 1.3); if (b.state === 'burn') bossWarn(b, 'MARKEN GLÖDER – FLYTTA DIG!'); return; }
    if (dist > 6) bossMove(b, ang, b.d.speed * dt * (b.slow > 0 ? 0.5 : 1));
  },
  // Mardrömmen: cirklar och skjuter blå eld, stampar och stormar fram med ett spår av blå eld; yr om den krockar
  nightmare(b, dt, dist, ang, ph) {
    const sp = (ph === 3 ? 1.3 : 1) * (b.slow > 0 ? 0.5 : 1);
    if (b.state === 'windup') { if (b.t > (ph === 3 ? 0.5 : 0.8)) { b.state = 'charge'; b.t = 0; b.chargeA = Math.atan2(P.y - b.y, P.x - b.x); b.trail = 0; } return; }
    if (b.state === 'charge') {
      const moved = bossMove(b, b.chargeA, 8 * sp * dt);
      b.trail += moved; if (b.trail > 0.45) { b.trail = 0; addHazard(b.x, b.y, 'bluefire', { warn: 0, life: 3, r: 0.6, dmg: 7 }); }
      if (dist < 1.3 && !b.didHit) { b.didHit = true; hurtPlayer(b.d.dmg, b.x, b.y, 'melee'); tryMove(P, Math.cos(b.chargeA) * 0.9, Math.sin(b.chargeA) * 0.9, 0.25); P.shake = 2.5; play('bigboom', 0.6, 1.2); }
      if (moved < 8 * sp * dt * 0.3 || b.t > 2) { // vägg: yr och sårbar en stund
        if (b.t <= 2) { b.stun = 1.4; P.shake = Math.max(P.shake, 1.5); play('bigboom', 0.7, 0.7, { x: b.x, y: b.y }); say('MARDRÖMMEN ÄR YR!', 1); }
        b.charges = (b.charges || 1) - 1;
        b.state = b.charges > 0 ? 'windup' : 'circle'; b.t = 0; b.cd = rnd(2, 3);
      }
      return;
    }
    // cirkla runt spelaren på avstånd och skjut blå eld
    b.cd -= dt; b.shotT = (b.shotT ?? 1.2) - dt; b.state = 'circle';
    const want = 6, side = ang + Math.PI / 2 * (b.dir || 1) + (dist > want ? -0.6 : 0.6) * (b.dir || 1);
    if (bossMove(b, side, b.d.speed * sp * dt) < b.d.speed * sp * dt * 0.3) b.dir = -(b.dir || 1);
    if (b.shotT <= 0 && hasLOS(b.x, b.y, P.x, P.y)) { b.shotT = ph === 3 ? 0.8 : 1.2; shootFireball(b, ang + rnd(-0.04, 0.04), 6, 9, false, 'blue'); play('whoosh', 0.5, 1.1, { x: b.x, y: b.y }); }
    if (b.cd <= 0 && hasLOS(b.x, b.y, P.x, P.y)) { b.state = 'windup'; b.t = 0; b.didHit = false; b.charges = ph >= 2 ? 2 : 1; play('bossroar', 0.9, 1.4); bossWarn(b, 'MARDRÖMMEN STAMPAR – GÅ ÅT SIDAN!'); }
  },
  // Ogern: kliver fram och krossar marken (stötvåg av stenar), kastar block på håll, kallar på orkkrigare i fas 2
  ogre(b, dt, dist, ang, ph) {
    const fast = (ph === 3 ? 1.45 : 1) * (b.slow > 0 ? 0.5 : 1);
    if (b.state === 'smash' || b.state === 'throw') {
      if (!b.didHit && b.t > 0.6) {
        b.didHit = true;
        if (b.state === 'smash') {
          P.shake = Math.max(P.shake, 3); play('bigboom', 0.9, 0.6);
          if (dist < b.d.range + 0.3) hurtPlayer(b.d.dmg, b.x, b.y, 'melee');
          const n = ph === 3 ? 18 : 12;
          for (let i = 0; i < n; i++) shootFireball(b, i / n * TAU + rnd(-0.1, 0.1), 4.5, 10, false, 'rock');
        } else { shootFireball(b, ang, 7.5, 18, true, 'rock'); play('whoosh', 0.8, 0.5, { x: b.x, y: b.y }); }
      }
      if (b.t > 1.1) { b.state = 'walk'; b.t = 0; b.cd = rnd(1, 1.8) / fast; }
      return;
    }
    if (ph >= 2) { b.summonT -= dt; if (b.summonT <= 0) { b.summonT = 14; const spot = freeSpotFar(3, 6); if (spot) { const e = makeEnemy('W', spot[0], spot[1]); e.alert = true; e.minion = true; ents.push(e); totalEnemies++; spawnPuff(spot[0], spot[1], 8); say('OGERNS SÖNER KOMMER', 1.5); } } }
    b.cd -= dt; b.state = 'walk';
    if (b.cd <= 0 && dist < b.d.range + 0.5) { b.state = 'smash'; b.t = 0; b.didHit = false; play('bossroar', 0.8, 0.7); bossWarn(b, 'OGERN HÖJER KLUBBAN!'); return; }
    if (b.cd <= 0 && dist > 5 && hasLOS(b.x, b.y, P.x, P.y) && Math.random() < dt * 1.5) { b.state = 'throw'; b.t = 0; b.didHit = false; return; }
    if (dist > 2) bossMove(b, ang, b.d.speed * fast * dt);
  },
  // Vålnaden: svävar, skjuter sökande klot, försvinner och dyker upp nära spelaren med ett skrik som saktar ned
  ghost(b, dt, dist, ang, ph) {
    if (b.state === 'vanish') { if (b.t > 0.7) { b.state = 'hidden'; b.t = 0; b.hidden = true; } return; }
    if (b.state === 'hidden') {
      if (b.t > 1.2) { const spot = freeSpotFar(2.2, 3.5); if (spot) [b.x, b.y] = spot; b.hidden = false; b.state = 'appear'; b.t = 0; spawnPuff(b.x, b.y, 10); }
      return;
    }
    if (b.state === 'appear') { if (b.t > 0.6) { b.state = 'shriek'; b.t = 0; b.didHit = false; play('bossroar', 1, 1.7); } return; }
    if (b.state === 'shriek') {
      if (!b.didHit && b.t > 0.3) {
        b.didHit = true; P.shake = Math.max(P.shake, 1.5);
        if (dist < 5) { P.slowT = 2.2; hurtPlayer(b.d.dmg * 0.6, b.x, b.y); say('SKRIKET FÖRLAMAR DIG', 1); }
        if (ph >= 2) for (let i = 0; i < 2; i++) { const spot = freeSpotFar(3, 6); if (spot) { const e = makeEnemy('S', spot[0], spot[1]); e.alert = true; e.minion = true; ents.push(e); totalEnemies++; spawnPuff(spot[0], spot[1], 6); } }
      }
      if (b.t > 0.9) { b.state = 'chase'; b.t = 0; b.cd = rnd(1, 1.6); }
      return;
    }
    if (b.state === 'orbs') {
      const k = Math.floor(b.t / 0.3);
      if (k >= 1 && k <= (ph === 3 ? 5 : 3) && k !== b.lastShot) { b.lastShot = k; shootFireball(b, ang + rnd(-0.4, 0.4), 3.4, 9, false, 'orb'); play('hiss', 0.5, 0.7, { x: b.x, y: b.y }); }
      if (b.t > 1.8) { b.state = 'chase'; b.t = 0; b.cd = rnd(1.4, 2.2); }
      return;
    }
    b.cd -= dt; b.vanishT = (b.vanishT ?? 6) - dt; b.state = 'chase';
    if (b.vanishT <= 0) { b.vanishT = ph === 3 ? 4.5 : 7; b.state = 'vanish'; b.t = 0; play('whoosh', 0.7, 0.5, { x: b.x, y: b.y }); play('moan', 0.6, 0.9); bossWarn(b, 'VÅLNADEN FÖRSVANN...'); return; }
    if (b.cd <= 0 && hasLOS(b.x, b.y, P.x, P.y)) { b.state = 'orbs'; b.t = 0; b.lastShot = -1; return; }
    if (dist < b.d.range + 0.3 && (b.hitT = (b.hitT || 0) - dt) <= 0) { b.hitT = 1; hurtPlayer(b.d.dmg, b.x, b.y, 'melee'); }
    if (dist > 1.6) bossMove(b, ang + Math.sin(b.t * 2) * 0.5, b.d.speed * (ph === 3 ? 1.3 : 1) * dt * (b.slow > 0 ? 0.5 : 1));
  },
};
// ---------- Faror på marken: eldpelare (varning, sedan eld) och blå eld efter Mardrömmen ----------
let hazards = [];
function addHazard(x, y, kind, o) { if (!solid(x, y)) hazards.push({ x, y, kind, t: 0, warn: o.warn, life: o.life, r: o.r, dmg: o.dmg, hitT: 0 }); }
function updateHazards(dt) {
  for (const h of hazards) {
    h.t += dt; h.hitT -= dt;
    if (h.t < h.warn) { if (Math.random() < dt * 14) particles.push({ x: h.x + rnd(-h.r, h.r) * 0.7, y: h.y + rnd(-h.r, h.r) * 0.7, z: 0.02, vx: 0, vy: 0, vz: 0.4, life: 0.25, maxLife: 0.25, frames: fx.hit, img: fx.hit[0], size: 0.2, add: true, tint: [255, 80, 40] }); continue; }
    if (h.hitT <= 0 && Math.hypot(P.x - h.x, P.y - h.y) < h.r) { h.hitT = 0.5; hurtPlayer(h.dmg, h.x, h.y, 'proj'); }
  }
  hazards = hazards.filter(h => h.t < h.warn + h.life);
}
function summonMinions(b) {
  play('bossroar', 0.8, 1.3); say('SKELETTEN RESER SIG', 1.5);
  for (let i = 0; i < 2; i++) {
    const a = rnd(0, TAU), x = b.x + Math.cos(a) * 2.5, y = b.y + Math.sin(a) * 2.5;
    if (solid(x, y)) continue;
    const e = makeEnemy(Math.random() < 0.5 ? 'S' : 'K', x, y); e.alert = true; e.minion = true; ents.push(e); totalEnemies++;
    for (let j = 0; j < 4; j++) particles.push({ x, y, z: 0.2, vx: rnd(-1, 1), vy: rnd(-1, 1), vz: rnd(1, 2), life: 0.5, maxLife: 0.5, frames: fx.fireball, img: fx.fireball[0], size: 0.3, add: true });
  }
}
function explodeFx(x, y, z) {
  play('fireburst', 0.5, rnd(0.6, 0.9), { x, y });
  particles.push({ x, y, z, vx: rnd(-0.5, 0.5), vy: rnd(-0.5, 0.5), vz: 0, life: 0.45, maxLife: 0.45, frames: fx.fireball, img: fx.fireball[0], size: rnd(0.5, 0.9), add: true });
}
function bossDefeated(b) { // dödsanimation först
  b.dead = false; b.dying = 0.01; b.state = 'idle'; play('bossroar', 1, 0.6);
  kills--; run.kills--; // räknas när animationen är klar
  for (const e of ents) if (e.minion && !e.dead) { e.hp = 0; killEnemy(e); }
}
function finishBoss(b) {
  kills++; run.kills++; run.bossKilled = true; run.bosses = (run.bosses || 0) + 1; setMusic(false);
  profile.bossWins = profile.bossWins || {}; profile.bossWins[b.id] = (profile.bossWins[b.id] || 0) + 1; saveProfile(); checkAch(); play('bigboom', 1, 0.7); P.shake = 3;
  say(b.d.name + ' ÄR BESEGRAD!', 4); say('GRINDEN ÖPPNAS', 4);
  for (let i = 0; i < 12; i++) dropItem('gold', b.x + rnd(-1, 1), b.y + rnd(-1, 1));
  items.push({ type: 'cardpick', x: b.x, y: b.y, taken: false, drop: true, luck: 1.2, title: 'BOSSENS SKATT' }); // bättre kortval
  for (const k in doors) if (doors[k].gate) { doors[k].target = 1; play('gate', 0.8, 1, { x: doors[k].x + 0.5, y: doors[k].y + 0.5 }); }
  spawnPortal(b.x, b.y, 'boss');
}
function spawnPortal(x, y, kind) {
  // närmaste fria plats (inte i en vägg)
  let px = x, py = y;
  if (!freeSpot(px, py, 0.35)) {
    let best = null;
    for (let r = 0.5; r < 4 && !best; r += 0.5) for (let a = 0; a < TAU; a += TAU / 12) { const tx = x + Math.cos(a) * r, ty = y + Math.sin(a) * r; if (freeSpot(tx, ty, 0.35)) { best = [tx, ty]; break; } }
    if (best) [px, py] = best; else [px, py] = [P.x, P.y];
  }
  portals.push({ x: px, y: py, kind, t: 0, armed: Math.hypot(P.x - px, P.y - py) > 1 });
  spawnPuff(px, py, 10); play('secret', 0.8, 0.7); play('gate', 0.5, 1.4, { x: px, y: py });
  say(kind === 'boss' ? 'PORTALEN: DJUPARE ELLER HEM?' : 'PORTALEN TILL NÄSTA VÅNING ÄR ÖPPEN', 4);
}
function updatePortals(dt) {
  for (const p of portals) {
    p.t += dt;
    const d = Math.hypot(P.x - p.x, P.y - p.y);
    if (d > 1.1) p.armed = true; // man måste gå ur och in igen för att använda den på nytt
    if (p.armed && d < 0.55 && p.t > 0.6) { p.armed = false; enterPortal(p); return; }
    if (Math.random() < dt * 6) particles.push({ x: p.x + rnd(-0.3, 0.3), y: p.y + rnd(-0.3, 0.3), z: rnd(0.1, 1), vx: 0, vy: 0, vz: rnd(0.3, 0.8), life: 0.6, maxLife: 0.6, frames: fx.hit, img: fx.hit[0], size: 0.15, add: true, tint: [200, 150, 255] });
  }
  if (portals.length && state === 'play') { const p = portals[0], d = Math.hypot(P.x - p.x, P.y - p.y); if (d < 2.5 && !hint) hint = p.kind === 'boss' ? 'GÅ IN I PORTALEN FÖR ATT VÄLJA' : 'GÅ IN I PORTALEN: NÄSTA VÅNING'; }
}
function enterPortal(p) {
  play('whoosh', 0.8, 0.5);
  let got = 0; // guld i närheten följer med genom portalen
  for (const it of items) if (!it.taken && (it.type === 'gold' || it.type === 'goldpile') && Math.hypot(it.x - P.x, it.y - P.y) < 8) { const g0 = run.gold; pickUp(it); it.taken = true; got += run.gold - g0; }
  if (got) say(`+${got} GULD FÖLJDE MED`, 2);
  if (p.kind === 'floor') { floorDone(); return; }
  const next = run.depth + 1;
  openUI(() => CardUI.choice({
    title: (boss ? boss.d.name : 'BOSSEN') + ' ÄR BESEGRAD', subtitle: `VARV ${cycleOf(run.depth) + 1} KLARAT. VART VILL DU GÅ?`, cancel: 2,
    options: [
      { label: 'GÅ DJUPARE', text: `VARV ${cycleOf(next) + 1}: FEM NYA VÅNINGAR OCH EN NY, STARKARE BOSS. FIENDERNA BLIR TUFFARE, MEN SJÄLARNA FLER.` },
      { label: 'AVSLUTA RUNDAN', text: 'GÅ HEM SOM SEGRARE OCH TA MED SJÄLARNA.' },
      { label: 'STANNA KVAR', text: 'PLOCKA UPP GULDET FÖRST. PORTALEN FINNS KVAR.' },
    ],
  }, i => {
    closeUI();
    if (i === 0) goDeeper();
    else if (i === 1) endRun(true);
  }));
}
function goDeeper() {
  run.loop = (run.loop || 0) + 1; run.gold += 50;
  P.hp = maxHp(); play('bossroar', 0.7, 0.6);
  openUI(() => CardUI.draft(drawCards(3, { luck: 0.3 }), { title: `VARV ${cycleOf(run.depth + 1) + 1}`, subtitle: 'DU STIGER NED DJUPARE. VÄLJ ETT KORT.', skipLabel: 'HOPPA ÖVER (+25 GULD)' }, card => {
    if (card) gainCard(card); else run.gold += 25;
    loadFloor(run.depth + 1); lockPointer();
  }));
}

// ---------- Våningsslut, rundslut och själar ----------
let stats = null;
function floorDone() {
  if (boss) { endRun(true); return; }
  const bonus = Math.round(300 + (kills === totalEnemies ? 200 : 0) + secrets * 100 + Math.max(0, 180 - levelTime) * 2);
  score += bonus;
  const extra = []; // guldbonusar: snabb, orörd, alla hemligheter
  if (levelTime < 120) { run.gold += 20; extra.push('SNABB: +20 GULD'); }
  if (lvlStat.taken < 1) { run.gold += 40; extra.push('ORÖRD: +40 GULD'); run.untouched = (run.untouched || 0) + 1; }
  if (totalSecrets && secrets >= totalSecrets) { run.gold += 30; extra.push('ALLA HEMLIGHETER: +30 GULD'); }
  let open = 0, saw = 0; for (let i = 0; i < mw * mh; i++) { const c = map[(i / mw) | 0][i % mw]; if (!isWallChar(c)) { open++; if (seen[i]) saw++; } }
  stats = { name: lvl.name, kills, totalEnemies, secrets, totalSecrets, items: itemsTaken, totalItems, time: levelTime, bonus,
    extra, acc: lvlStat.shots ? Math.round(100 * lvlStat.hits / lvlStat.shots) : 0, taken: Math.round(lvlStat.taken), explored: Math.round(100 * saw / Math.max(1, open)), tip: TIPS[(Math.random() * TIPS.length) | 0] };
  state = 'stats'; msgs.length = 0; play('win', 0.7); if (levelTime < 60) run.fast = true; checkAch();
  mouseDown = false; aimDown = false;
  if (document.pointerLockElement) document.exitPointerLock();
}
function nextFloor() { // efter statistiken: välj ett kort, sedan nästa våning
  if (state !== 'stats') return;
  stats = null;
  const depth = run.depth + 1;
  openUI(() => CardUI.draft(drawCards(3), { title: `VÅNING ${run.depth} KLARAD`, subtitle: isBossDepth(depth) ? 'VÄLJ ETT KORT INFÖR BOSSEN' : 'VÄLJ ETT KORT', skipLabel: 'HOPPA ÖVER (+25 GULD)' }, card => {
    if (card) gainCard(card); else run.gold += 25;
    loadFloor(depth); lockPointer();
  }));
}
function endRun(win) {
  const r = run;
  const souls = Math.round((r.kills * 0.6 + (r.depth - 1) * 6 + (win ? 60 : 0) + (r.bossKilled ? 20 : 0) + (r.guardians || 0) * 5 + (r.bosses || 0) * 15) * diff().souls);
  profile.kills = (profile.kills || 0) + r.kills; profile.time = (profile.time || 0) + r.time;
  profile.wkills = profile.wkills || {}; for (const [k, v] of Object.entries(r.wkills || {})) profile.wkills[k] = (profile.wkills[k] || 0) + v;
  if (win && r.diff === 3) profile.nightmareWin = true;
  r.souls = souls; r.win = win;
  if (win) score += 5000 + r.gold * 5;
  profile.souls += souls; if (win) profile.wins++;
  profile.bestDepth = Math.max(profile.bestDepth, r.depth);
  profile.bestScore = Math.max(profile.bestScore, score);
  profile.history.unshift({ seed: seedText(r.seed), depth: r.depth, win, score, kills: r.kills, cards: r.owned.length, time: Math.round(r.time), souls, daily: r.daily, d: Date.now(),
    biome: lvl && lvl.biome, cause: r.cause || '', diff: r.diff });
  checkAch();
  profile.history.length = Math.min(profile.history.length, 20);
  saveProfile(); store.del('run');
  if (win) { state = 'runover'; P.deadT = 0; play('win', 1); if (document.pointerLockElement) document.exitPointerLock(); }
}
const TIPS = ['SPARKA MED V (ELLER HANDEN) NÄR DU STÅR NÄRA', 'TRYCK R IGEN I DET GRÖNA FÄLTET', 'KRUTFAT SMÄLLER – LOCKA DIT FIENDERNA', 'SKJUT NED SÖKANDE KLOT', 'Q BYTER TILL FÖRRA VAPNET',
  'M VÄXLAR MELLAN LITEN OCH STOR KARTA', 'SHAMANEN HELAR – DÖDA DEN FÖRST', 'LÅT ORKKRIGAREN KROCKA I VÄGGEN', 'BLODSLEMMET DELAR SIG', 'GRAVRÖVAREN SYNS BARA NÄRA', 'EN VAPENPAKT GER UNIKA UPPGRADERINGAR',
  'PORTALEN SUGER MED SIG GULDET', 'KLARA VÅNINGEN UTAN SKADA FÖR BONUS', 'BRUNNAR HELAR EN GÅNG', 'ALTARET GER GULD MEN ETT FÖRBANNAT KORT', 'LÅDOR OCH KRUKOR GÖMMER SAKER', 'SJÄLAALTARET GER BESTÅENDE UPPGRADERINGAR',
  'VÄKTAREN VAKTAR VÅNINGENS PORTAL', 'MIMICS SER UT SOM KISTOR', 'ELITER KAN TAPPA ETT KORT', 'SKÖLDADE ELITER MÅSTE FÖRST FÖRLORA SKÖLDEN'];
const fmtTime = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// ---------- Huvudloop ----------
let last = 0;
function loop(t) {
  const realDt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
  let dt = realDt; if (hitStop > 0) { hitStop -= realDt; dt = realDt * 0.06; } // träffstopp: tiden står nästan still ett ögonblick
  if (state === 'play' && run && up('bullettime') && WS.aim > 0.8) dt *= 0.5; // tidsstoppet
  if (slowmo > 0) { slowmo -= realDt; dt *= 0.35; } // bossens entré
  if (map && state !== 'title') {
    if (state !== 'pause' && state !== 'ui') update(dt);
    updateLight(); render(); drawWeapon(); drawHUD();
    if (state === 'dead' && P.deadT > 1.2) drawRunOver(false);
    if (state === 'runover') drawRunOver(true);
    if (state === 'pause') overlay('PAUS', (isTouch()
    ? ['TRYCK FÖR ATT FORTSÄTTA', `FRÖ ${seedText(run.seed)}  VÅNING ${run.depth}`, `KORT ${run.owned.length}`, `SVÅRIGHET ${DIFF[settings.diff].name}`]
    : ['KLICKA FÖR ATT FORTSÄTTA', `FRÖ ${seedText(run.seed)}  VÅNING ${run.depth}`, `KORT ${run.owned.length}  (C = VISA)`, `SVÅRIGHET ${DIFF[settings.diff].name}`, 'I = INSTÄLLNINGAR  G = GE UPP']).concat(bonusLines()), '#202040');
    if (state === 'stats') drawStats();
  }
  requestAnimationFrame(loop);
}
function bonusLines() { // de viktigaste bonusarna från korten, sammanfattade
  const f = (k, label, pct = true) => M[k] ? `${label} ${M[k] > 0 ? '+' : ''}${pct ? Math.round(M[k] * 100) + '%' : Math.round(M[k] * 10) / 10}` : null;
  const parts = [f('dmg', 'SKADA'), f('fireRate', 'ELD'), f('critChance', 'KRIT'), f('maxHp', 'HP', false), f('moveSpeed', 'FART'), f('lifesteal', 'LIVSSTÖLD')].filter(Boolean);
  const out = [];
  if (parts.length) { out.push(parts.slice(0, 3).join('  ')); if (parts.length > 3) out.push(parts.slice(3).join('  ')); }
  if (run.pact) out.push(`EDEN: ${Cards.WEAPON_NAME[run.pact]}  (${[...UP].length} UPPGR.)`);
  return out;
}
function overlay(t1, lines, col) {
  ctx.fillStyle = col + 'b0'; ctx.fillRect(0, 0, W, VH);
  ctx.font = '16px "PressStart2P"'; ctx.textBaseline = 'top';
  const w = ctx.measureText(plain(t1)).width; txt(t1, (W - w) / 2, 22, '#fff', 2);
  lines.forEach((s, i) => { txt(s, (W - textW(s)) / 2, 54 + i * 13, i ? '#e0c890' : '#ffe9a8'); });
}
function drawStats() {
  const s = stats;
  ctx.fillStyle = '#100a08e0'; ctx.fillRect(0, 0, W, VH);
  const head = `${s.name} KLARAD`; txt(head, (W - textW(head)) / 2, 14, '#ffd24a');
  const rows = [['FIENDER', `${s.kills}/${s.totalEnemies}`], ['HEMLIGHETER', `${s.secrets}/${s.totalSecrets}`], ['UTFORSKAT', `${s.explored}%`], ['TRÄFFSÄKERHET', `${s.acc}%`], ['SKADA TAGEN', String(s.taken)], ['TID', fmtTime(s.time)], ['BONUS', `+${s.bonus}`], ['GULD', String(run.gold)]];
  rows.forEach(([k, v], i) => { const y = 30 + i * 11; txt(k, 60, y, '#c9a87a'); txt(v, 260 - textW(v), y, '#e8d9b0'); });
  if (s.extra) s.extra.forEach((e, i) => txt(e, (W - textW(e)) / 2, 120 + i * 9, '#9fe060'));
  // varvets väg: biomerna i ordning med den nuvarande markerad
  const c0 = cycleOf(run.depth) * (FLOORS + 1);
  for (let i = 1; i <= FLOORS + 1; i++) { const d = c0 + i, bx = W / 2 - 51 + (i - 1) * 17, cur = d === run.depth;
    ctx.fillStyle = d < run.depth ? '#6a5a40' : cur ? '#ffd24a' : '#3a2c1e'; ctx.fillRect(bx, 18, 14, 6);
    if (isBossDepth(d)) { ctx.fillStyle = '#c03020'; ctx.fillRect(bx + 5, 19, 4, 4); } }
  if (s.tip) { const t = 'TIPS: ' + s.tip; txt(t, (W - textW(t)) / 2, 152, '#8a7550'); }
  const f = isTouch() ? 'TRYCK FÖR ATT VÄLJA KORT' : 'KLICKA FÖR ATT VÄLJA KORT'; if (tmr % 1 < 0.7) txt(f, (W - textW(f)) / 2, 140, '#ffe9a8');
}
function drawRunOver(win) {
  const r = run;
  ctx.fillStyle = win ? '#0c1a0ce8' : '#1a0606e8'; ctx.fillRect(0, 0, W, VH);
  ctx.font = '16px "PressStart2P"'; const t1 = win ? 'SEGER!' : 'RUNDAN ÄR SLUT'; const w = ctx.measureText(plain(t1)).width;
  txt(t1, (W - w) / 2, 10, win ? '#9fe0a0' : '#ff5040', 2);
  const rows = [['VÅNING', win ? (r.loop ? `VARV ${r.loop + 1} KLARAT` : 'BOSSEN BESEGRAD') : r.depth > FLOORS + 1 ? `${r.depth} (VARV ${cycleOf(r.depth) + 1})` : `${r.depth} AV ${FLOORS + 1}`], ['FIENDER', String(r.kills)], ['KORT', String(r.owned.length)], ['GULD', String(r.gold)], ['TID', fmtTime(r.time)], ['POÄNG', String(score)], ['SJÄLAR', `+${r.souls || 0}`], ['FRÖ', seedText(r.seed)]];
  const fav = Object.entries(r.wkills || {}).sort((a, b) => b[1] - a[1])[0];
  if (fav) rows.splice(2, 0, ['FAVORITVAPEN', `${WEAPONS[weaponIndex(fav[0])].short} (${fav[1]})`]);
  if (r.shots) rows.splice(3, 0, ['TRÄFFSÄKERHET', `${Math.round(100 * (r.hits || 0) / r.shots)}%`]);
  rows.forEach(([k, v], i) => { const y = 30 + i * 11; txt(k, 50, y, '#c9a87a'); txt(v, 270 - textW(v), y, k === 'SJÄLAR' ? '#c0a0ff' : '#e8d9b0'); });
  const f = isTouch() ? 'TRYCK FÖR MENYN' : 'KLICKA FÖR MENYN'; if (tmr % 1 < 0.7) txt(f, (W - textW(f)) / 2, 145, '#ffe9a8');
}

// ---------- Indata ----------
function showTitle() {
  state = 'title'; map = null;
  stopAmbient(); setMusic(false);
  if (breathSnd) { breathSnd.s.stop(); breathSnd = null; }
  if (document.pointerLockElement) document.exitPointerLock();
  document.getElementById('title').hidden = false;
  refreshTitle();
}
function ensureAudio() {
  if (!actx) loadSounds().then(() => { if (state === 'play' && !ambient) startAmbient(); });
  else if (actx.state === 'suspended') actx.resume();
}
function begin(mode) { // mode: 'new' | 'daily' | 'continue'
  document.getElementById('title').hidden = true;
  canvas.focus(); ensureAudio();
  if (mode === 'continue' && loadRunSave()) { loadFloor(run.depth); lockPointer(); return; }
  let seed = mode === 'daily' ? dailySeed() : RNG.randomSeed();
  const typed = (document.getElementById('seed').value || '').trim();
  if (mode === 'new' && typed) seed = /^[0-9a-z]{1,7}$/i.test(typed) ? parseInt(typed, 36) >>> 0 : RNG.hash(typed);
  if (params.has('seed')) seed = RNG.hash(params.get('seed'));
  newRun(seed, mode === 'daily');
  const startDepth = params.get('floor') ? clamp(+params.get('floor'), 1, FLOORS + 1) : 1;
  if (startDepth > 1) { for (let i = 1; i <= Math.min(3, startDepth - 1); i++) { P.has[i] = true; P.mags[i] = WEAPONS[i].mag; } P.ammo = Object.assign(NOAMMO(), { p9: 90, r556: 60, shells: 20 }); }
  loadFloor(startDepth);
  if (params.has('nocards')) { lockPointer(); return; }
  // startkort: välj ett av tre innan första våningen
  if (run.modifier) say('DAGENS UTMANING: ' + run.modifier.name, 4);
  openUI(() => CardUI.draft(drawCards(3 + meta('choice')), { title: 'RUNDAN BÖRJAR', subtitle: run.modifier ? 'DAGENS UTMANING: ' + run.modifier.name + ' – ' + run.modifier.text : 'VÄLJ ETT STARTKORT', skipLabel: 'INGET KORT' }, card => { gainCard(card); closeUI(); }));
}
function lockPointer() { if (!params.has('nolock') && !isTouch() && document.pointerLockElement !== canvas && canvas.requestPointerLock) { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* pekarlås valfritt */ } } }
addEventListener('blur', () => pause());
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
function openSettingsUI() { const back = state; openUI(() => openSettings(() => closeUI(back === 'pause' ? 'pause' : 'play'))); }
function abandonRun() { // ge upp rundan från pausen
  openUI(() => CardUI.choice({ title: 'GE UPP RUNDAN?', subtitle: 'RUNDAN AVSLUTAS SOM EN FÖRLUST. SJÄLARNA DU HAR SAMLAT FÅR DU BEHÅLLA.', cancel: 1,
    options: [{ label: 'GE UPP', text: 'TILLBAKA TILL STARTSKÄRMEN' }, { label: 'FORTSÄTT SPELA', text: '' }] }, i => {
    if (i === 0) { stopAmbient(); setMusic(false); run.cause = 'GAV UPP'; endRun(false); showTitle(); } else closeUI('pause');
  }));
}
// ---------- Inställningar (startskärmen och pausen) ----------
function openSettings(onClose) {
  CardUI.panel('INSTÄLLNINGAR', '', c => {
    const row = (label, input) => { const r = CardUI.el('label', 'cu-row'); r.appendChild(CardUI.el('span', '', label)); r.appendChild(input); c.appendChild(r); return input; };
    const range = (label, key, min, max, step, fmt, after) => { const i = document.createElement('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = settings[key];
      const r = row(label + ' ' + fmt(settings[key]), i); i.oninput = () => { settings[key] = +i.value; r.previousSibling.textContent = label + ' ' + fmt(settings[key]); saveSettings(); if (after) after(); }; };
    const select = (label, key, opts, after) => { const sel = document.createElement('select'); for (const [v, t] of opts) { const o = document.createElement('option'); o.value = v; o.textContent = t; if (String(settings[key]) === String(v)) o.selected = true; sel.appendChild(o); }
      row(label, sel); sel.onchange = () => { const v = sel.value; settings[key] = isNaN(+v) || v === '' ? v : +v; saveSettings(); if (after) after(); }; };
    const check = (label, key, after) => { const i = document.createElement('input'); i.type = 'checkbox'; i.checked = !!settings[key]; row(label, i); i.onchange = () => { settings[key] = i.checked; saveSettings(); if (after) after(); }; };
    range('KÄNSLIGHET', 'sens', 0.2, 3, 0.1, v => v.toFixed(1));
    range('SYNFÄLT', 'fov', 60, 100, 2, v => v + '°', applyFov);
    range('VOLYM', 'vol', 0, 1, 0.05, v => Math.round(v * 100) + '%', applyVolume);
    range('LJUSSTYRKA', 'gamma', 0.6, 1.6, 0.05, v => Math.round(v * 100) + '%', () => { if (lvl) buildGrade(); });
    select('SKÄRMSKAK', 'shake', [[0, 'AV'], [0.5, 'LÅG'], [1, 'FULL']]);
    select('SIKTE', 'xstyle', [['kors', 'KORS'], ['punkt', 'PUNKT'], ['cirkel', 'CIRKEL']]);
    select('SIKTESFÄRG', 'xcolor', [['', 'VIT'], ['rgba(120,255,120,0.9)', 'GRÖN'], ['rgba(255,220,80,0.9)', 'GUL'], ['rgba(110,230,255,0.9)', 'CYAN']]);
    select('KARTA', 'map', [[0, 'AV'], [1, 'LITEN I HÖRNET'], [2, 'STOR']], () => { showMap = settings.map; });
    check('VISA FPS', 'fps');
    check('MINSKADE EFFEKTER', 'lowfx');
    check('VAPNET GUNGAR', 'bob');
    check('VIBRATION (MOBIL)', 'vibrate');
    check('VÄNSTERHÄNT (MOBIL)', 'lefty', applyTouchLayout);
    range('KNAPPSTORLEK (MOBIL)', 'btnScale', 0.7, 1.4, 0.05, v => Math.round(v * 100) + '%', applyTouchLayout);
  }, onClose);
}
function applyTouchLayout() { const ui = document.getElementById('touch'); if (!ui) return; ui.classList.toggle('lefty', !!settings.lefty); ui.style.setProperty('--bs', settings.btnScale || 1); }
function pause() { if (state === 'play') { state = 'pause'; mouseDown = false; aimDown = false; for (const k in keys) keys[k] = false; if (actx) actx.suspend(); } }
function resume() { if (state === 'pause') { state = 'play'; if (actx) actx.resume(); lockPointer(); } }
function leaveRunScreen() { if ((state === 'dead' && P.deadT > 1.2) || (state === 'runover' && P.deadT > 1)) showTitle(); }
function showDeck() { const back = state; openUI(() => CardUI.deck(run.owned, () => closeUI(back === 'pause' ? 'pause' : 'play'))); }
addEventListener('keydown', e => {
  if (state === 'title' || (window.CardUI && CardUI.isOpen())) return;
  if (state === 'ui') return;
  if (e.code === 'Escape' || e.code === 'KeyP') { if (state === 'play') pause(); else if (state === 'pause' && e.code === 'KeyP') resume(); return; }
  if (state === 'pause' && e.code === 'KeyI') { openSettingsUI(); return; }
  if (state === 'pause' && e.code === 'KeyG') { abandonRun(); return; }
  keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
  if (e.code === 'BracketLeft' || e.code === 'BracketRight') { settings.sens = clamp(settings.sens + (e.code === 'BracketLeft' ? -0.1 : 0.1), 0.2, 3); saveSettings(); say(`MUSKÄNSLIGHET ${settings.sens.toFixed(1)}`, 1.2); }
  if (e.code === 'Minus' || e.code === 'Equal') { settings.vol = clamp(settings.vol + (e.code === 'Minus' ? -0.1 : 0.1), 0, 1); saveSettings(); applyVolume(); say(`VOLYM ${Math.round(settings.vol * 100)}%`, 1.2); }
  if (e.code === 'Comma' || e.code === 'Period') { settings.fov = clamp(settings.fov + (e.code === 'Comma' ? -4 : 4), 60, 100); saveSettings(); say(`SYNFÄLT ${settings.fov}°`, 1.2); }
  if (e.code === 'KeyN') { settings.muted = !settings.muted; saveSettings(); applyVolume(); say(settings.muted ? 'LJUD AV' : 'LJUD PÅ', 1); }
  if (e.code === 'KeyO') toggleFullscreen();
  if (e.code === 'KeyC' && (state === 'play' || state === 'pause')) { showDeck(); return; }
  if (state === 'play') {
    if (e.code === 'KeyE' || e.code === 'Space') useKey();
    if (e.code === 'KeyR') reloadKey();
    if (e.code === 'KeyV') kick();
    if (e.code === 'KeyM' || e.code === 'Tab') { showMap = (showMap + 1) % 3; settings.map = showMap; saveSettings(); }
    const n = e.code.startsWith('Digit') ? +e.code.slice(5) - 1 : -1;
    if (n >= 0 && n < WEAPONS.length) switchWeapon(n);
    if (e.code === 'KeyQ') { if (P.has[P.lastWeapon] && P.lastWeapon !== P.weapon) switchWeapon(P.lastWeapon); else cycleWeapon(1); }
  } else if (e.code === 'Enter' || e.code === 'Space') {
    if (state === 'stats') nextFloor(); else leaveRunScreen();
  }
});
addEventListener('keyup', e => { keys[e.code] = false; });
function cycleWeapon(d) { const N = WEAPONS.length; for (let i = 1; i <= N; i++) { const n = ((WS.next >= 0 && WS.state === 'holster' ? WS.next : P.weapon) + d * i + N * 2) % N; if (P.has[n]) { switchWeapon(n); break; } } }
canvas.addEventListener('mousedown', e => {
  if (state === 'dead' || state === 'runover') return leaveRunScreen();
  if (state === 'stats') return nextFloor();
  if (state === 'pause') return resume();
  if (state !== 'play') return;
  if (document.pointerLockElement !== canvas) lockPointer();
  if (e.button === 2) aimDown = true; else mouseDown = true;
});
addEventListener('mouseup', e => { if (e.button === 2) aimDown = false; else mouseDown = false; });
addEventListener('mousemove', e => {
  if (document.pointerLockElement === canvas && state === 'play') {
    const s = 0.0026 * settings.sens * (1 - WS.aim * 0.35);
    P.a += e.movementX * s;
    WS.swayX = clamp(WS.swayX + e.movementX * 0.05, -10, 10); WS.swayY = clamp(WS.swayY + e.movementY * 0.03, -6, 6);
  }
});
document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== canvas && state === 'play' && !params.has('nolock')) pause(); });
addEventListener('blur', () => pause());
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
canvas.addEventListener('wheel', e => { e.preventDefault(); if (state === 'play') cycleWeapon(Math.sign(e.deltaY)); }, { passive: false });
canvas.addEventListener('contextmenu', e => e.preventDefault());

// ---------- Helskärm ----------
const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;
const fsSupported = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
function toggleFullscreen() {
  const el = document.documentElement;
  try {
    if (fsElement()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req || !fsSupported()) { say('HELSKÄRM GÅR INTE HÄR – ÖPPNA SIDAN I WEBBLÄSAREN', 3); return; }
    const r = req.call(el, { navigationUI: 'hide' });
    const lock = () => { try { const o = screen.orientation; if (o && o.lock) o.lock('landscape').catch(() => {}); } catch (e) { /* valfritt */ } };
    if (r && r.then) r.then(lock).catch(() => say('HELSKÄRM NEKADES', 2)); else lock();
  } catch (e) { say('HELSKÄRM GÅR INTE HÄR', 2); }
}
const syncFsIcons = () => { const big = !fsElement(); document.querySelectorAll('.fsicon').forEach(i => { i.src = A + 'touch/icon_size_' + (big ? 'larger' : 'smaller') + '.png'; }); };
document.addEventListener('fullscreenchange', syncFsIcons); document.addEventListener('webkitfullscreenchange', syncFsIcons);

// ---------- Mobilstyrning (Kenney Mobile Controls, CC0) ----------
// Vänster halva: flytande joystick (gå/springa). Höger halva: dra för att vrida. Knappar: skjut (dra också för att sikta), sikta, ladda om, använd, byt vapen, karta, kort, paus.
const touch = { active: false, mx: 0, my: 0, mag: 0, look: 0, lookY: 0, tap: 0 };
const TAP_MOVE = 12, TAP_TIME = 250; // px, ms: kort tryck i vridzonen = ett skott, dra = vrid
// stående: bilden ligger överst och hela bilden är vridzon, joysticken bor under den
const lookFloor = () => innerHeight > innerWidth ? canvas.getBoundingClientRect().bottom : 0;
const isTouch = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
function setupTouch() {
  const ui = document.getElementById('touch');
  const T = A + 'touch/';
  const btn = (act, icon, cls) => `<button class="tb ${cls}" data-act="${act}" aria-label="${act}"><img src="${T}btn.png" alt=""><img class="ic${act === 'fullscreen' ? ' fsicon' : ''}" src="${T}icon_${icon}.png" alt=""></button>`;
  ui.innerHTML = `<div class="joy" hidden><img class="pad" src="${T}pad.png" alt=""><img class="nub" src="${T}nub.png" alt=""></div>
    ${btn('fire', 'crosshair', 'fire')}${btn('aim', 'target', 'aim')}${btn('reload', 'arrow_rotate', 'reload')}${btn('use', 'hand', 'use')}${btn('swap', 'arrow_curved', 'swap')}
    ${btn('map', 'map', 'map small')}${btn('deck', 'star', 'deck small')}${btn('pause', 'pause', 'pausebtn small')}${btn('fullscreen', 'size_larger', 'fsbtn small')}${btn('settings', 'gear', 'gearbtn small')}${btn('giveup', 'exit', 'giveupbtn small')}`;
  applyTouchLayout();
  const joy = ui.querySelector('.joy'), nub = ui.querySelector('.nub');
  const ptrs = new Map(); // pointerId -> { kind, x, y, ox, oy }
  const R = () => Math.min(innerWidth, innerHeight) * 0.13; // joystickens radie
  ui.addEventListener('pointerdown', e => {
    const fsb = e.target.closest('.fsbtn');
    if (fsb) { ui.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { kind: 'btn', btn: fsb, fs: true }); fsb.classList.add('on'); e.preventDefault(); return; }
    if (state === 'pause' && e.target.closest('.gearbtn')) { openSettingsUI(); e.preventDefault(); return; }
    if (state === 'pause' && e.target.closest('.giveupbtn')) { abandonRun(); e.preventDefault(); return; }
    if (state !== 'play') { // tryck för att fortsätta, gå vidare osv.
      if (state === 'pause') resume(); else if (state === 'stats') nextFloor(); else leaveRunScreen();
      e.preventDefault(); return;
    }
    touch.active = true; ensureAudio();
    const b = e.target.closest('.tb');
    ui.setPointerCapture(e.pointerId);
    if (b) {
      const act = b.dataset.act; b.classList.add('on');
      if (act === 'fire') { mouseDown = true; ptrs.set(e.pointerId, { kind: 'look', x: e.clientX, y: e.clientY, btn: b, fire: true }); }
      else {
        ptrs.set(e.pointerId, { kind: 'btn', btn: b });
        if (act === 'aim') aimDown = !aimDown;
        if (act === 'reload') reloadKey();
        if (act === 'use') useKey();
        if (act === 'swap') cycleWeapon(1);
        if (act === 'map') { showMap = (showMap + 1) % 3; settings.map = showMap; saveSettings(); }
        if (act === 'deck') showDeck();
        if (act === 'pause') pause();
      }
    } else if ((settings.lefty ? e.clientX > innerWidth * 0.55 : e.clientX < innerWidth * 0.45) && e.clientY > lookFloor()) { // flytande joystick där tummen landar
      ptrs.set(e.pointerId, { kind: 'joy', ox: e.clientX, oy: e.clientY });
      joy.hidden = false; joy.style.left = (settings.lefty ? innerWidth - e.clientX : e.clientX) + 'px'; // spegelvänd layout för vänsterhänta joy.style.top = e.clientY + 'px'; nub.style.transform = 'translate(-50%,-50%)';
    } else { // vridzon: tryck för att skjuta, dra för att vrida
      ptrs.set(e.pointerId, { kind: 'look', x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t0: performance.now(), tap: true });
    }
    e.preventDefault();
  });
  ui.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    if (p.kind === 'joy') {
      let dx = e.clientX - p.ox, dy = e.clientY - p.oy; const d = Math.hypot(dx, dy), r = R();
      if (d > r) { dx *= r / d; dy *= r / d; }
      touch.mx = dx / r; touch.my = dy / r; touch.mag = Math.min(1, d / r);
      nub.style.transform = `translate(calc(-50% + ${settings.lefty ? -dx : dx}px), calc(-50% + ${dy}px))`;
    } else if (p.kind === 'look') {
      touch.look += (e.clientX - p.x) * 320 / innerWidth; touch.lookY += (e.clientY - p.y) * 200 / innerHeight;
      p.x = e.clientX; p.y = e.clientY;
      if (p.tap && Math.hypot(p.x - p.sx, p.y - p.sy) > TAP_MOVE) p.tap = false;
    }
    e.preventDefault();
  });
  const end = e => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    ptrs.delete(e.pointerId);
    if (p.kind === 'joy') { touch.mx = touch.my = touch.mag = 0; joy.hidden = true; }
    if (p.btn) p.btn.classList.remove('on');
    if (p.fire) mouseDown = false;
    if (p.tap && e.type === 'pointerup' && performance.now() - p.t0 < TAP_TIME && state === 'play') touch.tap = 0.12; // snabbt tryck = skott
    if (p.fs && e.type === 'pointerup') toggleFullscreen(); // helskärm måste begäras när fingret släpps (användargest)
  };
  ui.addEventListener('pointerup', end); ui.addEventListener('pointercancel', end);
  ui.addEventListener('contextmenu', e => e.preventDefault());
  ui.addEventListener('touchstart', e => e.preventDefault(), { passive: false }); // inga efterföljande musklick som stänger kortleken direkt
  // visa kontrollerna bara när det behövs
  setInterval(() => {
    const show = isTouch() && map && state !== 'title' && state !== 'ui';
    ui.hidden = !show;
    ui.classList.toggle('playing', state === 'play');
    ui.querySelector('[data-act=aim]').classList.toggle('lit', aimDown);
    ui.classList.toggle('paused', state === 'pause');
  }, 150);
}

// ---------- Startskärm och upplåsningar ----------
function setupSliders() {
  const sens = document.getElementById('sens'), fov = document.getElementById('fov');
  const show = () => { document.getElementById('sensv').textContent = settings.sens.toFixed(1); document.getElementById('fovv').textContent = settings.fov + '°'; };
  sens.value = settings.sens; fov.value = settings.fov; show();
  sens.oninput = () => { settings.sens = +sens.value; saveSettings(); show(); };
  fov.oninput = () => { settings.fov = +fov.value; saveSettings(); show(); };
}
function refreshTitle() {
  const diffBox = document.getElementById('diff');
  if (!diffBox.children.length) DIFF.forEach((d, i) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.d = i; b.textContent = d.name; b.onclick = () => { settings.diff = i; saveSettings(); refreshTitle(); }; diffBox.appendChild(b); });
  diffBox.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.d === settings.diff)));
  const saved = store.get('run', null), cont = document.getElementById('continue');
  cont.hidden = !saved; if (saved) cont.textContent = `FORTSÄTT (VÅNING ${saved.run.depth})`;
  const locked = window.Cards ? Cards.ALL.filter(c => c.unlock && !profile.unlocked.includes(c.id)).length : 0;
  document.getElementById('souls').textContent = `SJÄLAR: ${profile.souls}  ·  LÅSTA KORT: ${locked}`;
  document.getElementById('best').textContent = profile.runs ? `RUNDOR ${profile.runs} · SEGRAR ${profile.wins} · BÄSTA VÅNING ${profile.bestDepth} · REKORD ${profile.bestScore}` : '';
}
function openUnlocks() {
  const items = Cards.ALL.filter(c => c.unlock).sort((a, b) => a.unlock - b.unlock).map(card => ({ kind: 'card', card, price: card.unlock, owned: profile.unlocked.includes(card.id) }));
  CardUI.shop(items, profile.souls, item => {
    if (item.owned || profile.souls < item.price) return { ok: false, gold: profile.souls };
    profile.souls -= item.price; profile.unlocked.push(item.card.id); item.owned = true; saveProfile(); play('buy', 0.8);
    return { ok: true, gold: profile.souls };
  }, () => refreshTitle(), { title: 'LÅS UPP KORT', currency: 'SJÄLAR', currencyColor: '#c0a0ff' });
}
(async () => {
  const st = document.getElementById('status');
  try {
    await loadAll(t => { st.textContent = t; });
    st.textContent = '';
    for (const id of ['start', 'daily', 'unlocks', 'altar']) document.getElementById(id).disabled = false;
  } catch (e) { st.textContent = 'FEL: ' + e.message; console.error(e); }
  checkAch(); refreshTitle(); setupTouch(); setupSliders();
  if (isTouch()) document.body.classList.add('touch');
  CardUI.sfx = n => { const m = { flip: ['card', 0.4, 1.3], pick: ['card', 0.8, 0.9], deny: ['click', 0.6, 0.7], open: ['card', 0.3, 0.8] }[n]; if (m) play(m[0], m[1], m[2]); };
  requestAnimationFrame(loop);
  window.__game = { P, WS, ents: () => ents, items: () => items, pots: () => pots, chests: () => chests, merchants: () => merchants, state: () => state, run: () => run, kills: () => kills, begin, doors: () => doors,
    fire, useKey, startReload, switchWeapon, floorDone, nextFloor, projectiles: () => projectiles, secrets: () => secrets, keys, setMouse: (d, aim) => { mouseDown = d; aimDown = !!aim; }, pause, resume, hurtPlayer,
    light: () => light, lvl: () => lvl, boss: () => boss, gainCard, startLevel, props: () => props, guardian: () => guardianE, mods: () => M, loadFloor, openShop, openChest, profile, showTitle, endRun, hurtEnemy,
    spawnEnemy: (type, x, y) => { const e = makeEnemy(type, x, y); ents.push(e); totalEnemies++; return e; }, portals: () => portals, particles: () => particles, hazards: () => hazards };
  if (params.has('autostart')) begin('new');
})();
document.getElementById('start').addEventListener('click', () => begin('new'));
document.getElementById('daily').addEventListener('click', () => begin('daily'));
document.getElementById('continue').addEventListener('click', () => begin('continue'));
document.getElementById('unlocks').addEventListener('click', () => { ensureAudio(); openUnlocks(); });
document.getElementById('altar').addEventListener('click', () => { ensureAudio(); openAltar(); });
document.getElementById('settingsbtn').addEventListener('click', () => { ensureAudio(); openSettings(() => refreshTitle()); });
document.getElementById('profilebtn').addEventListener('click', () => showProfile());
document.getElementById('bestiary').addEventListener('click', () => showBestiary());
document.getElementById('achbtn').addEventListener('click', () => showAchievements());
addEventListener('keydown', e => { if (state === 'title' && e.code === 'Enter' && !CardUI.isOpen() && document.activeElement?.tagName !== 'INPUT' && !document.getElementById('start').disabled) { e.preventDefault(); begin('new'); } });
document.getElementById('fullscreen').addEventListener('click', () => toggleFullscreen());
})();
