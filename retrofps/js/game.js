'use strict';
// KRYPTA – roguelike-FPS (raycaster i Doom/Wolfenstein-anda).
// Varje runda: genererade våningar (Gen), kort som ger bonusar (Cards/CardUI), guld, butik, elitfiender
// och en boss på sista våningen. Döden avslutar rundan; själar ger upplåsningar till nästa.
(() => {
const W = 320, H = 200, HUD_H = 34, VH = H - HUD_H, HORIZON = VH >> 1;
let BASE_PLANE = 0.75; // sätts från synfältet (FOV) i inställningarna
const applyFov = () => { BASE_PLANE = Math.tan(clamp(settings.fov, 60, 100) * Math.PI / 360); };
const FLOORS = 5; // vanliga våningar; våning FLOORS + 1 är bossen
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
const settings = Object.assign({ sens: 1, vol: 0.8, muted: false, diff: 1, fov: 74 }, store.get('settings', {}));
if (params.has('diff')) settings.diff = clamp(+params.get('diff'), 0, 2);
const saveSettings = () => store.set('settings', settings);
applyFov();
const profile = Object.assign({ souls: 0, unlocked: [], runs: 0, wins: 0, bestDepth: 0, bestScore: 0, history: [] }, store.get('profile', {}));
const saveProfile = () => store.set('profile', profile);
const DIFF = [
  { name: 'LÄTT', dmg: 0.55, hp: 0.8, ammo: 1.4, speed: 0.9, souls: 0.7 },
  { name: 'NORMAL', dmg: 1, hp: 1, ammo: 1, speed: 1, souls: 1 },
  { name: 'SVÅR', dmg: 1.45, hp: 1.3, ammo: 0.75, speed: 1.12, souls: 1.5 },
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
const tex = {}, spr = {}, fx = {}, snd = {}, enemyFrames = {}, wimg = {};
const ENEMY_DEFS = {
  S: { name: 'SKELETT', sheet: 'skeleton1', move: 'movement', hp: 5, speed: 1.35, melee: true, dmg: 9, range: 0.95, cd: 0.9, size: 1.0, growl: 'growl', score: 100, atkFps: 14, hitAt: 0.55 },
  K: { name: 'ELDSKELETT', sheet: 'skeleton2', move: 'movemen', hp: 6, speed: 0.95, melee: false, dmg: 8, range: 8.5, cd: 1.8, size: 1.05, growl: 'hiss', score: 150, atkFps: 12, hitAt: 0.5 },
  V: { name: 'VAMPYR', sheet: 'vampire', move: 'movement', hp: 9, speed: 2.15, melee: true, dmg: 14, range: 0.95, cd: 0.75, size: 1.1, growl: 'roar', score: 250, atkFps: 16, hitAt: 0.5 },
};
const BOSS_DEF = { name: 'BENDEMONEN', hp: 320, speed: 1.0, size: 2.6, melee: true, dmg: 22, range: 3.2, score: 5000, growl: 'bossroar' };
const ELITE_MODS = [
  { id: 'fast', name: 'SNABB', tint: [120, 220, 255] },
  { id: 'tough', name: 'SEG', tint: [180, 180, 180] },
  { id: 'vamp', name: 'BLODTÖRSTIG', tint: [255, 60, 60] },
  { id: 'explosive', name: 'EXPLOSIV', tint: [255, 170, 40] },
  { id: 'brute', name: 'BRUTAL', tint: [200, 90, 255] },
];
async function loadAll(setStatus) {
  const walls = ['wall_brick_stone_center', 'wall_brick_small_stone', 'wall_rock', 'wall_stone', 'wall_brick_stone_center_banner', 'door_metal_gate', 'door_wood'];
  const floors = ['floor_stone', 'floor_stone_pattern', 'floor_wood_planks', 'floor_tiles_blue'];
  for (const n of walls.concat(floors)) tex[n] = pixels(await load(A + 'wall/' + n + '.png'));
  setStatus('Laddar fiender…');
  for (const [k, d] of Object.entries(ENEMY_DEFS)) {
    const sets = {};
    for (const [st, file] of [['idle', 'idle'], ['move', d.move], ['attack', 'attack'], ['pain', 'take_damage'], ['death', 'death']]) {
      const img = await load(`${A}gfx/enemies-${d.sheet}_${file}.png`);
      sets[st] = strip(img, Math.floor(img.width / 32));
    }
    enemyFrames[k] = sets;
  }
  // bossen: vingad demon (Gothicvania, CC0), förminskad för snabbare sprite-ritning
  enemyFrames.B = {
    idle: strip(await load(A + 'gfx/boss_idle.png'), 6, 0.5),
    attack: strip(await load(A + 'gfx/boss_attack.png'), 18, 0.5),
    breath: strip(await load(A + 'gfx/boss_breath.png'), 18, 0.5),
  };
  setStatus('Laddar vapen…');
  for (const n of ['pistol', 'shotgun', 'rifle', 'smg']) {
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
  try { await document.fonts.load('8px "PressStart2P"'); } catch (e) { /* reservtypsnitt */ }
}

// ---------- Ljud (positionsljud med stereo) ----------
let actx = null, master = null;
const SOUNDS = ['shot', 'boom', 'pickup', 'health', 'hurt', 'splat', 'weapon', 'lose', 'win', 'growl', 'hiss', 'pain', 'roar', 'gore', 'drone', 'door', 'steps',
  'reload', 'click', 'shell', 'pot', 'secret', 'whoosh', 'ricochet', 'breath', 'armor', 'gate', 'fireburst', 'bossroar', 'coin', 'chest', 'card', 'buy', 'bigboom', 'stinger'];
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
];
const AMMO = { p9: { name: '9MM', max: 200 }, r556: { name: '5.56', max: 150 }, shells: { name: 'PATRONER', max: 50 } };
const WF = window.WEAPON_FRAMES;

// ---------- Spelstate ----------
const P = { pitch: 0, ryaw: 0, burst: 0, burstT: 0, x: 2, y: 2, a: 0, vx: 0, vy: 0, hp: 100, armor: 0, shield: 0, shieldT: 0, haste: 0, weapon: 0, has: [true, false, false, false],
  ammo: { p9: 36, r556: 0, shells: 0 }, mags: [9, 0, 0, 0], flash: 0, bob: 0, bobAmp: 0, hurt: 0, pick: 0, shake: 0, camZ: 0.5, deadT: 0 };
const WS = { state: 'draw', t: 0, aim: 0, next: -1, shot: 99, cd: 0, swayX: 0, swayY: 0, spread: 0, shellPhase: '' };
let map, mw, mh, doors, ents, items, pots, torches, chests, merchants, particles, projectiles, light, flow, flowCell = -1, seen;
let lvl, totalEnemies, kills, secrets, totalSecrets, itemsTaken, totalItems, levelTime = 0, boss = null, bossBanner = 0;
let state = 'title', tmr = 0, score = 0, showMap = false, hitMark = 0, hitKill = false, hitCrit = false, hurtDir = [], breathSnd = null, ambient = null, stepT = 0, fireHeld = false;
let run = null, M = {}, hint = '', hitStop = 0;
const shakeAmt = () => { const tr = Math.min(1, P.shake / 2.5); return tr * tr; }; // trauma²: små träffar knappt märks, stora slår till
const msgs = [];
const keys = {};
let mouseDown = false, aimDown = false;
const mod = k => M[k] || 0;
function recomputeMods() { M = window.Cards && run ? Cards.computeMods(run.owned) : {}; }

const plain = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
function say(t, d = 2.5) { msgs.unshift({ text: plain(t), t: d }); if (msgs.length > 3) msgs.length = 3; }

// ---------- Runda och våningar ----------
const dailySeed = () => { const d = new Date(); return RNG.hash(`krypta-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`); };
const seedText = s => (s >>> 0).toString(36).toUpperCase();
function newRun(seed, daily) {
  run = { seed: seed >>> 0, daily: !!daily, depth: 0, owned: [], gold: 0, kills: 0, time: 0, livesUsed: 0, souls: 0, rerolls: 0, diff: settings.diff, bossKilled: false };
  run.cardRng = RNG(run.seed).fork('kort');
  resetPlayer(); recomputeMods();
  profile.runs++; saveProfile();
}
function weaponFor(depth) { // ett nytt vapen på var och en av de första våningarna, i slumpad ordning per runda
  const order = RNG(run.seed).fork('vapen').shuffle(['g', 'r', 'm']);
  const want = order[depth - 1];
  if (!want) return null;
  return P.has[{ g: 1, r: 2, m: 3 }[want]] ? null : want;
}
function loadFloor(depth) {
  run.depth = depth;
  const level = depth <= FLOORS
    ? Gen.floor(RNG.hash(run.seed + ':' + depth), depth, { shop: depth === 2 || depth === 4, weapon: weaponFor(depth) })
    : Gen.boss(RNG.hash(run.seed + ':boss'), {});
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
  Object.assign(P, { hp: s.p.hp, armor: s.p.armor, has: s.p.has.slice(), ammo: Object.assign({}, s.p.ammo), mags: s.p.mags.slice(), weapon: s.p.weapon });
  score = s.score; settings.diff = run.diff; recomputeMods();
  return true;
}
function resetPlayer() {
  P.has = [true, false, false, false]; P.weapon = 0; P.ammo = { p9: 36, r556: 0, shells: 0 }; P.mags = [9, 0, 0, 0]; P.hp = 100; P.armor = 0; P.shield = 0; score = 0;
}
function startLevel(level) {
  lvl = level;
  map = lvl.map.map(r => r.split('')); mh = map.length; mw = map[0].length;
  doors = {}; ents = []; items = []; pots = []; torches = []; chests = []; merchants = []; particles = []; projectiles = []; numbers.length = 0;
  kills = 0; totalEnemies = 0; secrets = 0; totalSecrets = 0; itemsTaken = 0; totalItems = 0; levelTime = 0; boss = null; bossBanner = 0;
  light = new Float32Array(mw * mh); seen = new Uint8Array(mw * mh); flow = new Int16Array(mw * mh).fill(-1); flowCell = -1;
  const lrng = RNG(RNG.hash(run.seed + ':spawn:' + run.depth));
  const itemOf = { h: 'health', a: 'ammo', A: 'armor', g: 'shotgun', r: 'rifle', m: 'smg', $: 'goldpile' };
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    const c = map[y][x], cx = x + 0.5, cy = y + 0.5;
    if (c === 'P') { P.x = cx; P.y = cy; P.a = startAngle(x, y); map[y][x] = '.'; }
    else if (ENEMY_DEFS[c]) { ents.push(makeEnemy(c, cx, cy)); totalEnemies++; map[y][x] = '.'; }
    else if (c === 'E') { ents.push(makeElite(lrng, cx, cy)); totalEnemies++; map[y][x] = '.'; }
    else if (c === 'B') { boss = makeBoss(cx, cy); ents.push(boss); totalEnemies++; map[y][x] = '.'; }
    else if (itemOf[c]) { items.push({ type: itemOf[c], x: cx, y: cy, taken: false }); totalItems++; map[y][x] = '.'; }
    else if (c === 'D' || c === 'G' || c === '*') { doors[x + ',' + y] = { open: 0, target: 0, gate: c === 'G', secret: c === '*', x, y }; if (c === '*') totalSecrets++; }
    else if (c === 'x') { map[y][x] = '.'; lvl.exit = { x, y }; }
    else if (c === 'f') { torches.push({ x: cx, y: cy, ph: Math.random() * 10, cells: [] }); }
    else if (c === 'o') { pots.push({ x: cx, y: cy, color: (x * 7 + y * 3) % 4, broken: false, loot: lrng.chance(0.5) ? lrng.pick(['ammo', 'health', 'gold', 'gold']) : null }); map[y][x] = '.'; }
    else if (c === 'C') { chests.push({ x: cx, y: cy, open: false, t: 0 }); totalItems++; map[y][x] = '.'; }
    else if (c === 'M') { merchants.push({ x: cx, y: cy, stock: null }); } // köpmannen blockerar sin ruta
  }
  prepareTorchLight();
  P.vx = P.vy = 0; P.flash = 0; P.hurt = 0; P.camZ = 0.5; P.deadT = 0; P.shake = 0; P.haste = 0;
  P.hp = Math.min(P.hp, maxHp()); P.shield = mod('shield');
  WS.state = 'draw'; WS.t = 0; WS.aim = 0; WS.shot = 99;
  hurtDir = []; msgs.length = 0;
  state = 'play';
  say(boss ? `${lvl.name}` : `VÅNING ${run.depth}: ${lvl.name}`, 3);
  if (boss) { bossBanner = 3; play('stinger', 0.8); setTimeout(() => play('bossroar', 0.9, 0.8), 600); }
  if (!ambient) startAmbient();
}
function startAngle(x, y) { // titta mot den längsta öppna riktningen
  let best = 0, bd = -1;
  for (const [a, dx, dy] of [[0, 1, 0], [Math.PI / 2, 0, 1], [Math.PI, -1, 0], [-Math.PI / 2, 0, -1]]) {
    let d = 0; while (d < 30 && !isWallChar(cellAt(x + dx * (d + 1), y + dy * (d + 1)))) d++;
    if (d > bd) { bd = d; best = a; }
  }
  return best;
}
function startAmbient() { ambient = play('drone', 0.32, 1, { loop: true }); }
const depthHp = () => 1 + 0.2 * Math.max(0, run.depth - 1);
function makeEnemy(type, x, y) {
  const d = ENEMY_DEFS[type], hp = d.hp * diff().hp * depthHp();
  return { type, d, x, y, hp, maxHp: hp, state: 'idle', t: Math.random() * 3, cd: 1, alert: false, flip: Math.random() < 0.5, dead: false, flash: 0, growlT: 2 + Math.random() * 4, didHit: false, burn: 0, slow: 0, burnAcc: 0 };
}
function makeElite(rng, x, y) {
  const type = run.depth >= 2 ? rng.pick(['S', 'K', 'V']) : rng.pick(['S', 'K']);
  const e = makeEnemy(type, x, y), m = rng.pick(ELITE_MODS);
  e.elite = m; e.hp = e.maxHp = e.maxHp * (m.id === 'tough' ? 4 : 2.4);
  e.d = Object.assign({}, e.d, { size: e.d.size * 1.3, speed: e.d.speed * (m.id === 'fast' ? 1.7 : 1), dmg: e.d.dmg * (m.id === 'brute' ? 1.8 : 1.2), cd: e.d.cd * (m.id === 'fast' ? 0.7 : 1) });
  return e;
}
function makeBoss(x, y) {
  const hp = BOSS_DEF.hp * diff().hp;
  return { type: 'B', boss: true, d: { ...BOSS_DEF, cd: 2 }, x, y, hp, maxHp: hp, state: 'idle', t: 0, cd: 2.5, alert: true, flip: false, dead: false, flash: 0, growlT: 6, phase: 1, summonT: 10, burn: 0, slow: 0, burnAcc: 0, dying: 0 };
}

// ---------- Kollision / kartfrågor ----------
function cellAt(x, y) { if (x < 0 || y < 0 || x >= mw || y >= mh) return '1'; return map[y | 0][x | 0]; }
function isWallChar(c) { return c >= '1' && c <= '5'; }
const isDoorChar = c => c === 'D' || c === 'G' || c === '*';
function doorAt(x, y) { return doors[(x | 0) + ',' + (y | 0)]; }
function solid(x, y) {
  const c = cellAt(x, y);
  if (isWallChar(c) || c === 'f' || c === 'M') return true;
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
      if (d > 7 || isWallChar(map[y][x])) continue;
      if (!hasLOS(t.x, t.y, x + 0.5, y + 0.5)) continue;
      t.cells.push([y * mw + x, Math.pow(1 - d / 7, 1.5) * 1.3]);
    }
  }
}
function updateLight() {
  light.fill(lvl.ambient);
  for (const t of torches) {
    const fl = 0.85 + 0.1 * Math.sin(tmr * 9 + t.ph) + 0.06 * Math.sin(tmr * 23 + t.ph * 3);
    for (const [i, w] of t.cells) light[i] += w * fl;
  }
  const flashLight = (lx, ly, strength, r) => {
    for (let y = Math.max(0, (ly | 0) - r); y < Math.min(mh, (ly | 0) + r + 1); y++) for (let x = Math.max(0, (lx | 0) - r); x < Math.min(mw, (lx | 0) + r + 1); x++) {
      const d = Math.hypot(x + 0.5 - lx, y + 0.5 - ly); if (d < r) light[y * mw + x] += strength * (1 - d / r);
    }
  };
  flashLight(P.x, P.y, 0.22 + mod('light') * 0.25, 3 + Math.round(mod('light'))); // eget sken
  if (P.flash > 0) flashLight(P.x, P.y, P.flash * 9, 4);
  for (const pr of projectiles) flashLight(pr.x, pr.y, 0.5, 3);
  for (const c of chests) if (!c.open) flashLight(c.x, c.y, 0.18, 2);
}
const lightAt = (x, y) => (x < 0 || y < 0 || x >= mw || y >= mh) ? lvl.ambient : light[(y | 0) * mw + (x | 0)];

// ---------- Rendering ----------
let fogR = 0, fogG = 0, fogB = 0;
function shadeFog(c, L, dist) {
  const ff = Math.exp(-dist * 0.085);
  const k = L * ff;
  let r = (c & 255) * k + fogR * (1 - ff), g = ((c >> 8) & 255) * k + fogG * (1 - ff), b = ((c >> 16) & 255) * k + fogB * (1 - ff);
  r = r > 255 ? 255 : r; g = g > 255 ? 255 : g; b = b > 255 ? 255 : b;
  return 0xff000000 | (b << 16) | (g << 8) | r;
}
const wallTexFor = { 1: 'wall_brick_stone_center', 2: 'wall_brick_small_stone', 3: 'wall_rock', 4: 'wall_stone', 5: 'wall_brick_stone_center_banner' };
let plane = BASE_PLANE, view = { dirX: 1, dirY: 0, plX: 0, plY: BASE_PLANE, hor: HORIZON, camZ: 0.5, a: 0 };
function render() {
  [fogR, fogG, fogB] = lvl.fog;
  const sh = shakeAmt();
  const a = P.a + sh * 0.035 * Math.sin(tmr * 37);
  const dirX = Math.cos(a), dirY = Math.sin(a), plX = -dirY * plane, plY = dirX * plane;
  const camZ = P.camZ + Math.sin(P.bob * 2) * 0.012 * P.bobAmp;
  const hor = HORIZON + Math.round(sh * 6 * Math.sin(tmr * 53 + 1) + P.pitch);
  view = { dirX, dirY, plX, plY, hor, camZ, a };
  const fl = tex[lvl.floor] || tex.floor_stone, ce = tex[lvl.ceil] || tex.floor_stone;
  // golv och tak
  for (let y = 0; y < VH; y++) {
    const isFloor = y > hor;
    if (y === hor) { for (let x = 0; x < W; x++) px[y * W + x] = 0xff000000 | (fogB << 16) | (fogG << 8) | fogR; continue; }
    const rowDist = isFloor ? VH * camZ / (y - hor) : VH * (1 - camZ) / (hor - y);
    const t = isFloor ? fl : ce, dim = isFloor ? 1 : 0.62;
    const x0 = P.x + (dirX - plX) * rowDist, y0 = P.y + (dirY - plY) * rowDist;
    const stx = (2 * plX * rowDist) / W, sty = (2 * plY * rowDist) / W;
    let fx2 = x0, fy2 = y0;
    for (let x = 0; x < W; x++) {
      const cx = Math.floor(fx2), cy = Math.floor(fy2);
      const u = ((fx2 - cx) * t.w) | 0, v = ((fy2 - cy) * t.h) | 0;
      const L = (cx >= 0 && cy >= 0 && cx < mw && cy < mh) ? light[cy * mw + cx] : lvl.ambient;
      px[y * W + x] = shadeFog(t.data[v * t.w + u], L * dim, rowDist);
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
    const t = hit.cell === 'D' ? tex.door_wood : hit.cell === 'G' ? tex.door_metal_gate : hit.cell === '*' ? tex[wallTexFor[lvl.secretWall] || wallTexFor[1]] : tex[wallTexFor[hit.cell]];
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
  for (const t of torches) list.push({ x: t.x, y: t.y, k: 't', o: t });
  for (const c of chests) list.push({ x: c.x, y: c.y, k: 'c', o: c });
  for (const m of merchants) list.push({ x: m.x, y: m.y, k: 'm', o: m });
  for (const p of particles) list.push({ x: p.x, y: p.y, k: 'x', o: p });
  for (const p of projectiles) list.push({ x: p.x, y: p.y, k: 'f', o: p });
  for (const s of list) s.d = (s.x - P.x) ** 2 + (s.y - P.y) ** 2;
  list.sort((p, q) => q.d - p.d);
  for (const s of list) {
    const o = s.o;
    if (s.k === 'e') {
      if (o.boss) { if (!o.dead) drawSprite(bossFrame(o), o.x, o.y, o.d.size, o.dying ? -o.dying * 0.3 : 0, (o.x - P.x) * plX + (o.y - P.y) * plY > 0, null, o.flash > 0 ? o.flash : 0, 0.75, false, o.dying ? [255, 120, 60] : null); continue; }
      if (!o.dead && o.state === 'attack') o.flip = (o.x - P.x) * plX + (o.y - P.y) * plY > 0; // vänd mot mitten när den anfaller
      else if (!o.dead && (o.mvx || o.mvy)) o.flip = o.mvx * plX + o.mvy * plY < 0;
      const tint = o.dead ? null : o.burn > 0 ? [255, 150, 70] : o.slow > 0 ? [120, 170, 255] : o.elite ? o.elite.tint : null;
      drawSprite(enemyFrame(o), o.x, o.y, o.d.size * 1.15, 0, o.flip, null, o.flash > 0 ? o.flash : 0, o.elite ? 0.3 : 0, false, tint);
    } else if (s.k === 'i') {
      if (o.type === 'gold' || o.type === 'goldpile') { drawSprite(fx.coin[Math.floor(tmr * 8 + o.x * 3) % 4], o.x, o.y, o.type === 'goldpile' ? 0.24 : 0.16, 0.05 + 0.03 * Math.sin(tmr * 4 + o.y), false, null, 0, 0.6); continue; }
      const img = spr[o.type] || spr['pick_' + o.type];
      const big = o.type === 'health' || o.type === 'armor';
      drawSprite(img, o.x, o.y, big ? 0.42 : o.type === 'ammo' ? 0.32 : 0.3, 0.04 + 0.04 * Math.sin(tmr * 3 + o.x), false, null, 0, 0.5);
    } else if (s.k === 'p') drawSprite(fx.pots[o.color], o.x, o.y, 0.55, 0, false);
    else if (s.k === 't') drawSprite(fx.fire[Math.floor(tmr * 14 + o.ph * 5) % 16], o.x, o.y, 0.85, 0, false, 2.2, 0, 0, true);
    else if (s.k === 'c') drawSprite(o.open ? fx.chestOpen[Math.min(3, Math.floor(o.t * 10))] : fx.chest[Math.floor(tmr * 3) % 4], o.x, o.y, 0.5, 0, false, null, 0, 0.6);
    else if (s.k === 'm') drawSprite(fx.merchant[Math.floor(tmr * 5) % 6], o.x, o.y, 1.05, 0, (o.x - P.x) * plX + (o.y - P.y) * plY > 0, null, 0, 0.55);
    else if (s.k === 'f') drawSprite(fx.fireball[Math.floor(tmr * 16) % 8], o.x, o.y, o.big ? 0.5 : 0.3, o.z - 0.15, false, 2.4, 0, 0, true);
    else drawSprite(o.img, o.x, o.y, o.size, o.z, false, o.add ? 2 : null, 0, 0, o.add);
  }
  ctx.putImageData(frame, 0, 0);
}
// Tecknar en billboard-sprite. size = höjd i världsenheter, z = höjd över golvet. tint = [r,g,b] färgton.
function drawSprite(img, wx, wy, size, z, flip, fixedLight, whiteFlash = 0, minLight = 0, additive = false, tint = null) {
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
  const ff = Math.exp(-ty * 0.085);
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
      const i = y * W + x;
      if (additive) { // eld lyser: additiv blandning
        const d = px[i], k = ff * (al / 255);
        const r = Math.min(255, (d & 255) + (c & 255) * k), g = Math.min(255, ((d >> 8) & 255) + ((c >> 8) & 255) * k), b = Math.min(255, ((d >> 16) & 255) + ((c >> 16) & 255) * k);
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
function bossFrame(b) {
  const set = enemyFrames.B;
  if (b.state === 'breath') return set.breath[Math.min(17, Math.floor(b.t * 12))];
  if (b.state === 'slam') return set.attack[Math.min(17, Math.floor(b.t * 14))];
  return set.idle[Math.floor(tmr * 7) % 6];
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
  const ox = Math.round(Math.sin(P.bob) * 4 * amp - WS.swayX + dx), oy = Math.round(Math.abs(Math.cos(P.bob)) * 3 * amp - WS.swayY + dy + shakeAmt() * 4 * Math.sin(tmr * 41) + P.pitch * 0.6);
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
    if (e.dead || !e.elite || (e.hp >= e.maxHp && !e.alert)) continue;
    const p = project(e.x, e.y, e.d.size * 1.2 + 0.08); if (!p) continue;
    const w = Math.round(clamp(p.scale * 0.6, 12, 40)), x = Math.round(p.sx - w / 2), y = Math.round(p.sy) - 4;
    ctx.fillStyle = '#000a'; ctx.fillRect(x - 1, y - 1, w + 2, 4);
    ctx.fillStyle = '#c03020'; ctx.fillRect(x, y, Math.max(0, w * e.hp / e.maxHp), 2);
    if (p.scale > 40) txt(e.elite.name, Math.round(p.sx - textW(e.elite.name) / 2), y - 10, '#ffd24a');
  }
  for (const n of numbers) {
    const p = project(n.x, n.y, n.z); if (!p) continue;
    const s = String(n.v);
    txt(s, Math.round(p.sx - textW(s) / 2), Math.round(p.sy), n.crit ? '#ffd24a' : '#f0e0c0', 1, true, clamp(n.t * 2, 0, 1));
  }
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
  if (P.hp < maxHp() * 0.3 && state === 'play') {
    const p = 0.25 + 0.2 * Math.sin(tmr * 6);
    const gr = g.createRadialGradient(W / 2, HORIZON, VH * 0.35, W / 2, HORIZON, W * 0.62);
    gr.addColorStop(0, 'rgba(120,0,0,0)'); gr.addColorStop(1, `rgba(150,0,0,${p})`);
    g.fillStyle = gr; g.fillRect(0, 0, W, VH);
  }
  if (state === 'play') { // sikte
    const gap = Math.round(2 + WS.spread * 160), cx = W / 2, cy = HORIZON;
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillRect(cx - gap - 3, cy, 3, 1); g.fillRect(cx + gap + 1, cy, 3, 1); g.fillRect(cx, cy - gap - 3, 1, 3); g.fillRect(cx, cy + gap + 1, 1, 3);
    if (hitMark > 0) {
      g.fillStyle = hitKill ? '#ff4030' : hitCrit ? '#ffd24a' : '#ffffff';
      for (let i = 2; i < 5; i++) { g.fillRect(cx - i, cy - i, 1, 1); g.fillRect(cx + i, cy - i, 1, 1); g.fillRect(cx - i, cy + i, 1, 1); g.fillRect(cx + i, cy + i, 1, 1); }
    }
  }
  if (boss && !boss.dead && state === 'play') { // bossens livmätare
    const w = 200, x = (W - w) / 2, y = 22;
    g.fillStyle = '#000b'; g.fillRect(x - 2, y - 2, w + 4, 8);
    g.fillStyle = '#5a1010'; g.fillRect(x, y, w, 4);
    g.fillStyle = boss.phase === 3 ? '#ff5020' : '#d02818'; g.fillRect(x, y, w * Math.max(0, boss.hp) / boss.maxHp, 4);
    txt(BOSS_DEF.name, (W - textW(BOSS_DEF.name)) / 2, y + 7, '#ffd24a');
  }
  if (bossBanner > 0) { const s = BOSS_DEF.name; ctx.font = '16px "PressStart2P"'; const w = ctx.measureText(plain(s)).width; txt(s, (W - w) / 2, 50, '#ff5030', 2, true, Math.min(1, bossBanner)); }
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
  for (let i = 0; i < 4; i++) txt(String(i + 1), 208 + i * 13, y0 + 15, P.has[i] ? (i === P.weapon ? '#ffd24a' : '#8a7550') : '#3a2c1e', 1, false);
  txt(`${kills}/${totalEnemies}`, 208, y0 + 25, '#e8d9b0');
  txt(boss ? 'BOSS' : `VÅN ${run.depth}`, 270, y0 + 5, '#c9a87a');
  txt(`${run.gold}G`, 270, y0 + 15, '#ffd24a');
  txt(`${run.owned.length} KORT`.slice(0, 6), 270, y0 + 25, '#b9a0e8');
  msgs.forEach((m, i) => { const w = textW(m.text); txt(m.text, (W - w) / 2, 6 + i * 11, i ? '#c9b080' : '#ffe9a8', 1, true, Math.min(1, m.t * 2)); });
  if (hint && state === 'play') txt(hint, (W - textW(hint)) / 2, HORIZON + 26, '#ffd24a');
  else if (WS.state === 'idle' && P.mags[P.weapon] === 0 && P.ammo[wp.ammo] > 0 && state === 'play') { const s = 'R = LADDA OM', w = textW(s); txt(s, (W - w) / 2, HORIZON + 14, '#ffb040'); }
  if (showMap) drawMap();
}
function textW(s) { ctx.font = '8px "PressStart2P"'; return ctx.measureText(plain(s)).width; }
function txt(s, x, y, col, scale = 1, shadow = true, alpha = 1) {
  const g = ctx; s = plain(s); g.font = `${8 * scale}px "PressStart2P"`; g.globalAlpha = alpha;
  if (shadow) { g.fillStyle = '#000'; g.fillText(s, x + 1, y + 1); }
  g.fillStyle = col; g.fillText(s, x, y); g.globalAlpha = 1;
}
function drawMap() { // automap: bara rutor man har sett
  const s = clamp(Math.floor(Math.min((W - 10) / mw, (VH - 10) / mh)), 2, 5), ox = (W - mw * s) / 2 | 0, oy = (VH - mh * s) / 2 | 0;
  ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(ox - 3, oy - 3, mw * s + 6, mh * s + 6);
  const sense = mod('secretSense') > 0;
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    const c = map[y][x];
    if (c === '*' && sense && doors[x + ',' + y].open === 0) { ctx.fillStyle = tmr % 1 < 0.5 ? '#c060ff' : '#7030a0'; ctx.fillRect(ox + x * s, oy + y * s, s, s); continue; }
    if (!seen[y * mw + x]) continue;
    ctx.fillStyle = isWallChar(c) ? '#7d7566' : c === 'D' ? '#c08040' : c === 'G' ? '#b04080' : c === '*' ? (doors[x + ',' + y].open > 0 ? '#2a2420' : '#7d7566') : c === 'f' ? '#ff9a30' : c === 'M' ? '#ff4040' : '#2a2420';
    ctx.fillRect(ox + x * s, oy + y * s, s, s);
    if (lvl.exit && lvl.exit.x === x && lvl.exit.y === y) { ctx.fillStyle = '#60d060'; ctx.fillRect(ox + x * s, oy + y * s, s, s); }
  }
  for (const it of items) if (!it.taken && seen[(it.y | 0) * mw + (it.x | 0)]) { ctx.fillStyle = it.type.startsWith('gold') ? '#ffd24a' : '#e8d9b0'; ctx.fillRect(ox + it.x * s - 1, oy + it.y * s - 1, 2, 2); }
  for (const c of chests) if (seen[(c.y | 0) * mw + (c.x | 0)]) { ctx.fillStyle = c.open ? '#6a5030' : '#ffb030'; ctx.fillRect(ox + c.x * s - 1, oy + c.y * s - 1, 3, 3); }
  ctx.fillStyle = '#4dff7a'; ctx.fillRect(ox + P.x * s - 1, oy + P.y * s - 1, 3, 3);
  ctx.fillRect(ox + (P.x + Math.cos(P.a) * 1.4) * s, oy + (P.y + Math.sin(P.a) * 1.4) * s, 1, 1);
}

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
  if (Math.random() >= mod('ammoSave')) P.mags[P.weapon]--;
  WS.shot = 0; WS.cd = effDelay(wp); P.flash = 0.07; P.shake = Math.max(P.shake, wp.kick * 0.5);
  // lärbart rekylmönster: samma sidoryck i samma ordning varje salva, plus en uppåtknyck som återhämtar sig
  const kickYaw = wp.recoil[P.burst % wp.recoil.length] * (1 - WS.aim * 0.5);
  P.a += kickYaw; P.ryaw += kickYaw * 0.6; P.pitch += wp.kick * 4 * (1 - WS.aim * 0.5);
  P.burst++; P.burstT = effDelay(wp) + 0.25;
  WS.swayY -= wp.kick * 2;
  play(wp.sound[0], wp.sound[2], wp.sound[1] * rnd(0.96, 1.04));
  if (wp.id === 'shotgun') { play('boom', 0.45, 0.55); setTimeout(() => play('reload', 0.45, 1.4), 420 / (1 + mod('fireRate'))); }
  // ljudet väcker fiender som kan nå dig inom ~15 rutor
  for (const e of ents) if (!e.dead && pathDist(e) < 15) alertEnemy(e, false);
  let anyHit = false, killed = false, crit = false;
  const spread = (wp.spread + WS.spread * 0.5) * (1 - WS.aim * 0.6) / (1 + mod('accuracy'));
  let base = wp.dmg * (1 + mod('dmg'));
  if (firstShot) base *= 1 + mod('firstShot');
  if (P.hp < maxHp() * 0.35) base *= 1 + mod('lowHpDmg');
  const pellets = wp.pellets + Math.round(mod('extraPellets'));
  for (let p = 0; p < pellets; p++) {
    let a = P.a + (P.burst > 1 || pellets > 1 ? rnd(-1, 1) * spread : 0); // första skottet går där siktet är
    if (p === 0 && touch.active) a = aimAssist(a);
    const dx = Math.cos(a), dy = Math.sin(a);
    const wall = cast(P.x, P.y, dx, dy);
    // allt som kulan kan träffa längs strålen, närmast först
    const hits = [];
    for (const e of ents) {
      if (e.dead) continue;
      const rx = e.x - P.x, ry = e.y - P.y, along = rx * dx + ry * dy;
      if (along <= 0.1 || along >= wall.dist) continue;
      if (Math.abs(rx * dy - ry * dx) < 0.3 * e.d.size * (e.boss ? 1.8 : 1)) hits.push({ o: e, d: along, k: 'e' });
    }
    for (const pt of pots) {
      if (pt.broken) continue;
      const rx = pt.x - P.x, ry = pt.y - P.y, along = rx * dx + ry * dy;
      if (along <= 0.1 || along >= wall.dist) continue;
      if (Math.abs(rx * dy - ry * dx) < 0.22) hits.push({ o: pt, d: along, k: 'p' });
    }
    hits.sort((u, v) => u.d - v.d);
    let left = 1 + Math.round(mod('pierce')), stopped = false;
    for (const h of hits) {
      if (left <= 0) { stopped = true; break; }
      if (h.k === 'p') { breakPot(h.o); left--; continue; }
      let dmg = base * falloff(wp, h.d) * (h.d < 2 && wp.id === 'shotgun' ? 1.3 : 1);
      const c = Math.random() < mod('critChance');
      if (c) { dmg *= 2 + mod('critDmg'); crit = true; hitStop = Math.max(hitStop, 0.03); }
      if (h.o.elite || h.o.boss) dmg *= 1 + mod('bossDmg');
      anyHit = true;
      if (hurtEnemy(h.o, dmg, P.x + dx * h.d, P.y + dy * h.d, { crit: c })) killed = true;
      left--;
    }
    if (!stopped && left > 0 && wall.dist < 30) { // kulnedslag på väggen
      const hx = P.x + dx * (wall.dist - 0.04), hy = P.y + dy * (wall.dist - 0.04);
      if (p < 3) spawnImpact(hx, hy, rnd(0.25, 0.7));
      if (p === 0 && Math.random() < 0.5) play('ricochet', 0.25, rnd(0.8, 1.3), { x: hx, y: hy });
    }
  }
  if (anyHit) { hitMark = 0.15; hitKill = killed; hitCrit = crit; }
  WS.spread = Math.min(0.06, WS.spread + wp.spread * 0.7 + (wp.id === 'shotgun' ? 0.02 : 0.004));
  if (P.mags[P.weapon] === 0 && P.ammo[wp.ammo] > 0) setTimeout(() => { if (WS.state === 'idle' && P.mags[P.weapon] === 0) startReload(); }, effDelay(wp) * 1000 + 120);
}
function startReload() {
  const wp = WEAPONS[P.weapon];
  if (WS.state !== 'idle' || P.mags[P.weapon] >= effMag(P.weapon) || P.ammo[wp.ammo] <= 0) return;
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
  WS.next = n; WS.state = 'holster'; WS.t = 0; WS.aim = 0; play('weapon', 0.25, 1.6);
}
function autoSwitch() {
  for (const i of [1, 2, 3, 0]) { const w = WEAPONS[i]; if (P.has[i] && i !== P.weapon && (P.mags[i] > 0 || P.ammo[w.ammo] > 0)) { switchWeapon(i); return; } }
}
// opt: { crit, noProc (ingen explosion/brand), source }
function hurtEnemy(e, dmg, hx, hy, opt = {}) {
  if (e.dead || e.dying) return false;
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
  if (!e.boss && !opt.quiet && Math.random() < 0.55 && e.state !== 'attack') { e.state = 'pain'; e.t = 0; }
  return false;
}
function killEnemy(e) {
  hitStop = Math.max(hitStop, e.boss ? 0.15 : e.elite ? 0.07 : 0.02);
  e.dead = true; e.t = 0; e.state = 'dead'; kills++; run.kills++; score += e.d.score * (e.elite ? 3 : 1);
  play('gore', 0.5, rnd(0.9, 1.2), { x: e.x, y: e.y }); play('pain', 0.45, e.type === 'V' ? 1.2 : 0.8, { x: e.x, y: e.y });
  for (let i = 0; i < 5; i++) spawnBlood(e.x, e.y);
  if (mod('killHeal')) heal(mod('killHeal'));
  if (mod('killArmor')) P.armor = Math.min(200, P.armor + mod('killArmor'));
  if (mod('speedOnKill')) P.haste = Math.max(P.haste, mod('speedOnKill'));
  if (e.boss) { bossDefeated(e); return; }
  if (e.elite) {
    for (let i = 0; i < 4; i++) dropItem('gold', e.x, e.y);
    dropItem(Math.random() < 0.5 ? 'health' : 'ammo', e.x, e.y);
    if (e.elite.mod === 'explosive') explode(e.x, e.y, 18, 1.8, true);
  } else {
    const r = Math.random();
    if (r < 0.22) dropItem('ammo', e.x, e.y); else if (r < 0.32) dropItem('health', e.x, e.y);
    if (Math.random() < 0.5) dropItem('gold', e.x, e.y);
  }
}
// Explosion: skadar fiender (och spelaren om hurtsPlayer) inom radien
function explode(x, y, dmg, r, hurtsPlayer) {
  play('fireburst', 0.6, rnd(0.8, 1), { x, y });
  for (let i = 0; i < 5; i++) particles.push({ x: x + rnd(-0.3, 0.3), y: y + rnd(-0.3, 0.3), z: rnd(0.2, 0.6), vx: rnd(-1, 1), vy: rnd(-1, 1), vz: rnd(0, 1), life: 0.4, maxLife: 0.4, frames: fx.fireball, img: fx.fireball[0], size: 0.45, add: true });
  for (const e of ents) if (!e.dead && Math.hypot(e.x - x, e.y - y) < r) hurtEnemy(e, dmg, e.x, e.y, { noProc: true });
  for (const pt of pots) if (!pt.broken && Math.hypot(pt.x - x, pt.y - y) < r) breakPot(pt);
  if (hurtsPlayer && Math.hypot(P.x - x, P.y - y) < r) hurtPlayer(dmg, x, y, 'proj');
  P.flash = Math.max(P.flash, 0.05);
}
function dropItem(type, x, y) { items.push({ type, x: x + rnd(-0.2, 0.2), y: y + rnd(-0.2, 0.2), taken: false, drop: true }); }
function breakPot(pt) {
  pt.broken = true; play('pot', 0.7, rnd(0.9, 1.15), { x: pt.x, y: pt.y }); score += 10;
  for (let i = 0; i < 7; i++) {
    const a = rnd(0, TAU), sp = rnd(0.6, 2);
    particles.push({ x: pt.x, y: pt.y, z: 0.2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: rnd(1, 2.5), life: rnd(0.8, 1.4), img: fx.shards[pt.color * 6 + (i % 6)], size: 0.14, grav: true, bounce: true });
  }
  if (pt.loot) dropItem(pt.loot, pt.x, pt.y);
}
function spawnBlood(x, y) {
  const a = rnd(0, TAU), sp = rnd(0.3, 1.2);
  particles.push({ x, y, z: rnd(0.35, 0.65), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: rnd(0, 1.5), life: rnd(0.35, 0.7), img: fx.blood[(Math.random() * 3) | 0], size: rnd(0.1, 0.18), grav: true });
}
function spawnImpact(x, y, z) {
  particles.push({ x, y, z: z - 0.08, vx: 0, vy: 0, vz: 0, life: 0.25, maxLife: 0.25, frames: fx.hit, img: fx.hit[0], size: 0.16, add: true });
}
const numbers = []; // skadesiffror som flyger upp
function spawnNumber(x, y, dmg, crit) { numbers.push({ x: x + rnd(-0.15, 0.15), y: y + rnd(-0.15, 0.15), z: 0.9, v: Math.max(1, Math.round(dmg * 10)), crit, t: 0.8 }); if (numbers.length > 40) numbers.shift(); }
const maxHp = () => 100 + mod('maxHp');
function heal(n, silent) { const before = P.hp; P.hp = Math.min(maxHp(), P.hp + n); return P.hp - before; }
// kind: 'melee' | 'proj' | undefined
function hurtPlayer(d, fx0, fy0, kind) {
  if (params.has('god') || state !== 'play') return;
  if (Math.random() < mod('dodge')) { say('UNDVEK!', 0.8); play('whoosh', 0.4, 1.5); return; }
  d *= diff().dmg * Math.max(0.15, 1 + mod('damageTaken'));
  if (kind === 'proj') d *= Math.max(0, 1 - mod('projectileResist'));
  if (kind === 'melee') d *= Math.max(0, 1 - mod('meleeResist'));
  P.shieldT = 4;
  if (P.shield > 0) { const s = Math.min(P.shield, d); P.shield -= s; d -= s; }
  const absorbed = Math.min(P.armor, d * 0.5); P.armor -= absorbed; d -= absorbed;
  P.hp -= d; P.hurt = 0.35; P.shake = Math.max(P.shake, 1.2);
  play('hurt', 0.8, rnd(0.9, 1.1));
  if (fx0 !== undefined) hurtDir.push({ ang: Math.atan2(fy0 - P.y, fx0 - P.x), t: 1 });
  if (P.hp <= 0) {
    if (run.livesUsed < mod('extraLife')) { // återupplivning från ett kort
      run.livesUsed++; P.hp = maxHp() * 0.5; P.hurt = 1; say('DU VÄGRAR DÖ!', 3); play('secret', 0.8, 1.4);
      for (const e of ents) if (!e.dead && Math.hypot(e.x - P.x, e.y - P.y) < 3) hurtEnemy(e, 8, e.x, e.y, { noProc: true });
      return;
    }
    state = 'dead'; P.hp = 0; P.deadT = 0; play('lose', 0.8);
    if (ambient) { ambient.s.stop(); ambient = null; }
    if (breathSnd) { breathSnd.s.stop(); breathSnd = null; }
    endRun(false);
  }
}


// ---------- Interaktion: dörrar, kistor, köpman ----------
function useKey() {
  for (const c of chests) if (!c.open && Math.hypot(c.x - P.x, c.y - P.y) < 1.2) { openChest(c); return; }
  for (const m of merchants) if (Math.hypot(m.x - P.x, m.y - P.y) < 1.6) { openShop(m); return; }
  for (const dist of [0.6, 1.0, 1.4]) {
    const nx = P.x + Math.cos(P.a) * dist, ny = P.y + Math.sin(P.a) * dist;
    const d = doorAt(nx, ny);
    if (!d || !isDoorChar(cellAt(nx, ny))) continue;
    if (d.secret) {
      if (d.target) return;
      d.target = 1; secrets++; score += 250; play('secret', 0.8); say('DU HITTADE ETT HEMLIGT RUM!', 3); return;
    }
    if (d.gate && boss && !boss.dead) { say('GRINDEN ÄR LÅST – DÖDA BENDEMONEN', 2.5); play('click', 0.6, 0.6); return; }
    if (d.target && occupied(d)) { say('NÅGOT STÅR I VÄGEN', 1.2); return; }
    d.target = d.target ? 0 : 1; play(d.gate ? 'gate' : 'door', 0.6, 1, { x: d.x + 0.5, y: d.y + 0.5 }); return;
  }
}
function occupied(d) { // dörren får inte stängas på någon
  const inCell = o => Math.abs(o.x - (d.x + 0.5)) < 0.8 && Math.abs(o.y - (d.y + 0.5)) < 0.8;
  return inCell(P) || ents.some(e => !e.dead && inCell(e));
}
function alertEnemy(e, spread) {
  if (e.dead) return;
  if (!e.alert) { e.alert = true; e.cd = Math.max(e.cd, rnd(0.35, 0.8)); if (Math.random() < 0.7) play(e.d.growl, 0.5, rnd(0.9, 1.1), { x: e.x, y: e.y }); }
  if (spread) for (const o of ents) if (o !== e && !o.dead && !o.alert && Math.hypot(o.x - e.x, o.y - e.y) < 6 && hasLOS(o.x, o.y, e.x, e.y)) alertEnemy(o, false);
}
// UI-lägen: släpp musen, pausa världen, återgå när UI stängs
function openUI(fn) {
  state = 'ui'; mouseDown = false; aimDown = false; for (const k in keys) keys[k] = false;
  if (document.pointerLockElement) document.exitPointerLock();
  fn();
}
function closeUI(next = 'play') { state = next; if (next === 'play') lockPointer(); }
function drawCards(n, opt = {}) { return Cards.draw(run.cardRng, n + Math.round(mod('cardChoices')), { owned: run.owned, depth: run.depth, luck: mod('luck') + (opt.luck || 0), unlocked: new Set(profile.unlocked) }); }
function gainCard(card) {
  if (!card) return;
  run.owned.push(card.id); recomputeMods(); play('card', 0.8);
  if (P.hp > maxHp()) P.hp = maxHp();
  P.shield = Math.min(P.shield, mod('shield'));
}
function openChest(c) {
  c.open = true; c.t = 0; play('chest', 0.8); itemsTaken++; score += 100;
  for (let i = 0; i < 3; i++) dropItem('gold', c.x, c.y);
  openUI(() => CardUI.draft(drawCards(3, { luck: 0.5 }), { title: 'KISTAN', subtitle: 'VÄLJ ETT KORT', skipLabel: 'TA INGET' }, card => { gainCard(card); closeUI(); }));
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
    ]);
  }
  return m.stock;
}
function openShop(m) {
  openUI(() => CardUI.shop(shopItems(m), run.gold, item => {
    if (run.gold < item.price) return { ok: false, gold: run.gold };
    if (item.kind === 'health' && P.hp >= maxHp()) { say('DU ÄR REDAN FRISK', 1.2); return { ok: false, gold: run.gold }; }
    run.gold -= item.price; play('buy', 0.8);
    if (item.kind === 'card') { gainCard(item.card); m.stock = m.stock.filter(s => s !== item); }
    else if (item.kind === 'health') heal(40 * (1 + mod('healMul')));
    else if (item.kind === 'armor') P.armor = Math.min(200, P.armor + 50);
    else if (item.kind === 'ammo') pickUp({ type: 'ammo' }, true);
    else if (item.kind === 'reroll') { run.rerolls++; m.stock = null; return { ok: true, gold: run.gold, items: shopItems(m) }; }
    return { ok: true, gold: run.gold };
  }, () => closeUI(), { title: 'DÖDGRÄVARENS BOD', currency: 'GULD' }));
}

// ---------- Vägsökning: avståndsfält (BFS) från spelaren ----------
function walkableForEnemy(x, y) { const c = map[y][x]; return !isWallChar(c) && c !== 'f' && c !== 'M' && c !== '*' && !(c === 'G' && doors[x + ',' + y].open < 0.85); }
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
function update(dt) {
  tmr += dt;
  for (const m of msgs) m.t -= dt;
  while (msgs.length && msgs[msgs.length - 1].t <= 0) msgs.pop();
  P.hurt = Math.max(0, P.hurt - dt); P.pick = Math.max(0, P.pick - dt * 2); P.flash = Math.max(0, P.flash - dt); P.shake = Math.max(0, P.shake - dt * 3);
  // rekyl återhämtar sig mot ursprungligt sikte
  P.pitch -= P.pitch * Math.min(1, dt * 9); const ry = P.ryaw * Math.min(1, dt * 5); P.a -= ry; P.ryaw -= ry;
  P.burstT -= dt; if (P.burstT <= 0) P.burst = 0;
  hitMark = Math.max(0, hitMark - dt); bossBanner = Math.max(0, bossBanner - dt);
  for (const h of hurtDir) h.t -= dt * 1.2;
  hurtDir = hurtDir.filter(h => h.t > 0);
  for (const n of numbers) { n.t -= dt; n.z += dt * 0.6; }
  while (numbers.length && numbers[0].t <= 0) numbers.shift();
  for (const c of chests) if (c.open) c.t += dt;
  updateParticles(dt);
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
  const maxSp = (running && WS.aim < 0.5 ? 4.7 : 3.1) * (1 - WS.aim * 0.4) * (1 + mod('moveSpeed')) * (P.haste > 0 ? 1.35 : 1);
  let tx = 0, ty = 0;
  if (Math.abs(fwd) + Math.abs(str) > 0.05) { const l = Math.hypot(fwd, str), s = Math.min(1, l) / l * maxSp; tx = (Math.cos(P.a) * fwd - Math.sin(P.a) * str) * s; ty = (Math.sin(P.a) * fwd + Math.cos(P.a) * str) * s; }
  const k = Math.min(1, dt * (tx || ty ? 10 : 12));
  P.vx += (tx - P.vx) * k; P.vy += (ty - P.vy) * k;
  tryMove(P, P.vx * dt, P.vy * dt, 0.24);
  for (const e of ents) if (!e.dead && !e.dying) pushOut(P, e.x, e.y, e.boss ? 1.1 : 0.55);
  for (const pt of pots) if (!pt.broken) pushOut(P, pt.x, pt.y, 0.45);
  for (const c of chests) pushOut(P, c.x, c.y, 0.5);
  const speed = Math.hypot(P.vx, P.vy);
  P.bobAmp += (clamp(speed / 3.1, 0, 1.4) - P.bobAmp) * Math.min(1, dt * 8);
  P.bob += dt * (4 + speed * 2.2);
  if (speed > 0.8) { stepT -= dt * speed / 3.1; if (stepT <= 0) { play('steps', 0.1, rnd(1.5, 1.8)); stepT = 0.42; } }
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
  for (const c of chests) if (!c.open && Math.hypot(c.x - P.x, c.y - P.y) < 1.2) hint = 'E: ÖPPNA KISTAN';
  for (const m of merchants) if (Math.hypot(m.x - P.x, m.y - P.y) < 1.6) hint = 'E: HANDLA';
  if (lvl.exit && Math.floor(P.x) === lvl.exit.x && Math.floor(P.y) === lvl.exit.y) { floorDone(); return; }
  for (const e of ents) { if (e.boss) updateBoss(e, dt); else updateEnemy(e, dt); }
  updateProjectiles(dt);
  if (P.hp < maxHp() * 0.3 && !breathSnd && actx) breathSnd = play('breath', 0.35, 1, { loop: true });
  if (P.hp >= maxHp() * 0.3 && breathSnd) { breathSnd.s.stop(); breathSnd = null; }
}
function pickUp(it, bought) {
  const am = diff().ammo * (1 + mod('ammoMul'));
  if (it.type === 'gold' || it.type === 'goldpile') {
    const n = Math.round((it.type === 'goldpile' ? rnd(8, 14) + run.depth * 3 : rnd(2, 5) + run.depth) * (1 + mod('goldMul')));
    run.gold += n; play('coin', 0.5, rnd(0.95, 1.15)); if (it.type === 'goldpile') say(`+${n} GULD`, 1.2); return true;
  }
  if (it.type === 'health') { if (P.hp >= maxHp()) return false; const n = Math.round(30 * (1 + mod('healMul'))); heal(n); say(`+${n} HÄLSA`, 1.5); play('health', 0.7); }
  else if (it.type === 'armor') { if (P.armor >= 200) return false; P.armor = Math.min(200, P.armor + 50); say('+50 RUSTNING', 1.5); play('armor', 0.7); }
  else if (it.type === 'ammo') {
    const full = Object.keys(AMMO).every(k => P.ammo[k] >= AMMO[k].max);
    if (full && !bought) return false;
    const add = { p9: Math.round(18 * am), r556: Math.round((P.has[2] ? 20 : 8) * am), shells: Math.round((P.has[1] ? 6 : 3) * am) };
    for (const k in add) P.ammo[k] = Math.min(AMMO[k].max, P.ammo[k] + add[k]);
    say(`AMMO +${add.p9} 9MM +${add.r556} 5.56 +${add.shells} PATR`, 2); play('pickup', 0.7);
  } else {
    const i = { shotgun: 1, rifle: 2, smg: 3 }[it.type], w = WEAPONS[i];
    const first = !P.has[i];
    P.has[i] = true;
    if (first) P.mags[i] = effMag(i);
    P.ammo[w.ammo] = Math.min(AMMO[w.ammo].max, P.ammo[w.ammo] + (i === 1 ? 8 : 30));
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
  plane = BASE_PLANE * (1 - WS.aim * 0.22);
  if (WS.state === 'holster' && WS.t >= 0.22) { P.weapon = WS.next; WS.state = 'draw'; WS.t = 0; }
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
  const trig = mouseDown || keys.ControlLeft || keys.KeyF;
  if (trig && (wp.auto || !fireHeld)) fire();
  fireHeld = trig;
}
function statusTick(e, dt) { // brand och långsamhet
  e.slow = Math.max(0, e.slow - dt);
  if (e.burn > 0) {
    e.burn -= dt; e.burnAcc += dt;
    if (e.burnAcc >= 0.5) { e.burnAcc = 0; hurtEnemy(e, 0.8 * (1 + mod('dmg')), e.x, e.y, { noProc: true, quiet: true }); }
  }
}
function updateEnemy(e, dt) {
  e.t += dt; e.flash = Math.max(0, e.flash - dt);
  if (e.dead) return;
  statusTick(e, dt); if (e.dead) return;
  const dx = P.x - e.x, dy = P.y - e.y, dist = Math.hypot(dx, dy);
  const los = dist < 14 && hasLOS(e.x, e.y, P.x, P.y);
  if (!e.alert && los && dist < 10) alertEnemy(e, true);
  if (!e.alert) { e.state = 'idle'; return; }
  e.growlT -= dt; if (e.growlT <= 0) { e.growlT = rnd(4, 9); play(e.d.growl, 0.45, rnd(0.9, 1.2), { x: e.x, y: e.y }); }
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
  const want = !(los && !e.d.melee && dist < e.d.range * 0.6) && dist > 0.75;
  if (!want) return;
  const sp = e.d.speed * diff().speed * dt * (e.slow > 0 ? 0.5 : 1);
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
  const ang = Math.atan2(ty - e.y, tx - e.x);
  const ox = e.x, oy = e.y;
  tryMove(e, Math.cos(ang) * sp, Math.sin(ang) * sp, 0.28);
  if (Math.hypot(e.x - ox, e.y - oy) < sp * 0.3) tryMove(e, Math.cos(ang + 1.2) * sp, Math.sin(ang + 1.2) * sp, 0.28);
  for (const o of ents) if (o !== e && !o.dead) pushOut(e, o.x, o.y, o.boss ? 1.2 : 0.55);
  e.mvx = e.x - ox; e.mvy = e.y - oy;
}
function enemyStrike(e, dist) {
  const dmg = e.d.dmg * (1 + 0.1 * (run.depth - 1));
  if (e.d.melee) {
    if (dist < e.d.range + 0.35) {
      hurtPlayer(dmg, e.x, e.y, 'melee'); play('splat', 0.5, 0.7);
      if (mod('thorns') > 0) hurtEnemy(e, mod('thorns'), e.x, e.y, { noProc: true });
      if (e.elite && e.elite.id === 'vamp') e.hp = Math.min(e.maxHp, e.hp + dmg);
    } else play('whoosh', 0.4, 1.2, { x: e.x, y: e.y });
  } else { // eldklot som går att undvika
    const lead = 0.25, tx = P.x + P.vx * lead, ty = P.y + P.vy * lead, a = Math.atan2(ty - e.y, tx - e.x) + rnd(-0.05, 0.05);
    shootFireball(e, a, 5.2, dmg);
    if (e.elite) { shootFireball(e, a - 0.18, 5.2, dmg); shootFireball(e, a + 0.18, 5.2, dmg); }
    play('whoosh', 0.6, 0.8, { x: e.x, y: e.y });
  }
}
function shootFireball(src, a, speed, dmg, big) {
  const r = src.boss ? 1.1 : 0.4;
  projectiles.push({ x: src.x + Math.cos(a) * r, y: src.y + Math.sin(a) * r, z: src.boss ? 0.8 : 0.55, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, dmg, src, big, life: 6 });
}
function updateProjectiles(dt) {
  for (const p of projectiles) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    if (p.z > 0.55) p.z -= dt * 0.25;
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
    if (solid(p.x, p.y)) { p.x -= p.vx * dt; p.y -= p.vy * dt; p.vx *= -0.3; p.vy *= -0.3; }
    if (p.grav) { p.vz -= 6 * dt; p.z += p.vz * dt; if (p.z < 0) { p.z = 0; if (p.bounce && p.vz < -1) { p.vz *= -0.35; } else { p.vz = 0; p.vx *= 0.8; p.vy *= 0.8; } } }
    if (p.frames) p.img = p.frames[clamp(Math.floor((1 - p.life / p.maxLife) * p.frames.length), 0, p.frames.length - 1)];
  }
  particles = particles.filter(p => p.life > 0);
  if (particles.length > 180) particles.splice(0, particles.length - 180);
}

// ---------- Bossen: BENDEMONEN ----------
// Fas 1: eldfläktar och slag. Fas 2 (< 2/3 HP): kallar på skelett, ring av eldklot efter slaget. Fas 3 (< 1/3): snabbare och tätare.
function updateBoss(b, dt) {
  b.t += dt; b.flash = Math.max(0, b.flash - dt);
  if (b.dying) {
    b.dying += dt; P.shake = Math.max(P.shake, 1.5);
    if (Math.random() < dt * 12) explodeFx(b.x + rnd(-1, 1), b.y + rnd(-1, 1), rnd(0.3, 1.6));
    if (b.dying > 2.6) { b.dying = 0; b.dead = true; finishBoss(b); }
    return;
  }
  if (b.dead) return;
  statusTick(b, dt); if (b.dead || b.dying) return;
  const dx = P.x - b.x, dy = P.y - b.y, dist = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
  const ph = b.hp < b.maxHp / 3 ? 3 : b.hp < b.maxHp * 2 / 3 ? 2 : 1;
  if (ph !== b.phase) { b.phase = ph; hitStop = 0.18; play('bossroar', 1, ph === 3 ? 1.1 : 0.9); say(ph === 3 ? 'BENDEMONEN RASAR!' : 'BENDEMONEN KALLAR PÅ DE DÖDA', 2.5); P.shake = 2; }
  const fast = ph === 3 ? 1.5 : 1;
  b.growlT -= dt; if (b.growlT <= 0) { b.growlT = rnd(6, 10); play('bossroar', 0.6, rnd(0.8, 1)); }
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
      if (dist < BOSS_DEF.range) hurtPlayer(BOSS_DEF.dmg, b.x, b.y, 'melee');
      const n = ph === 3 ? 14 : 10;
      if (ph >= 2) for (let i = 0; i < n; i++) shootFireball(b, i / n * TAU + b.t, 4.2, 8, true);
    }
    if (b.t > 1.3) { b.state = 'idle'; b.t = 0; b.cd = rnd(1.2, 2) / fast; }
    return;
  }
  b.cd -= dt;
  const los = hasLOS(b.x, b.y, P.x, P.y);
  if (b.cd <= 0 && los) {
    b.t = 0; b.didHit = false; b.lastShot = -1;
    b.state = dist < BOSS_DEF.range + 0.6 || (ph >= 2 && Math.random() < 0.35) ? 'slam' : 'breath';
    if (b.state === 'slam') play('bossroar', 0.7, 1.2);
    return;
  }
  if (dist > 3) { const sp = BOSS_DEF.speed * fast * dt * (b.slow > 0 ? 0.5 : 1); tryMove(b, Math.cos(ang) * sp, Math.sin(ang) * sp, 0.9); }
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
  kills++; run.kills++; run.bossKilled = true; play('bigboom', 1, 0.7); P.shake = 3;
  say('BENDEMONEN ÄR BESEGRAD!', 4); say('GRINDEN ÖPPNAS', 4);
  for (let i = 0; i < 12; i++) dropItem('gold', b.x + rnd(-1, 1), b.y + rnd(-1, 1));
  for (const k in doors) if (doors[k].gate) { doors[k].target = 1; play('gate', 0.8, 1, { x: doors[k].x + 0.5, y: doors[k].y + 0.5 }); }
}

// ---------- Våningsslut, rundslut och själar ----------
let stats = null;
function floorDone() {
  if (boss) { endRun(true); return; }
  const bonus = Math.round(300 + (kills === totalEnemies ? 200 : 0) + secrets * 100 + Math.max(0, 180 - levelTime) * 2);
  score += bonus;
  stats = { name: lvl.name, kills, totalEnemies, secrets, totalSecrets, items: itemsTaken, totalItems, time: levelTime, bonus };
  state = 'stats'; msgs.length = 0; play('win', 0.7);
  mouseDown = false; aimDown = false;
  if (document.pointerLockElement) document.exitPointerLock();
}
function nextFloor() { // efter statistiken: välj ett kort, sedan nästa våning
  if (state !== 'stats') return;
  stats = null;
  const depth = run.depth + 1;
  openUI(() => CardUI.draft(drawCards(3), { title: `VÅNING ${run.depth} KLARAD`, subtitle: depth > FLOORS ? 'VÄLJ ETT KORT INFÖR BOSSEN' : 'VÄLJ ETT KORT', skipLabel: 'HOPPA ÖVER (+25 GULD)' }, card => {
    if (card) gainCard(card); else run.gold += 25;
    loadFloor(depth); lockPointer();
  }));
}
function endRun(win) {
  const r = run;
  const souls = Math.round((r.kills * 0.6 + (r.depth - 1) * 6 + (win ? 60 : 0) + (r.bossKilled ? 20 : 0)) * diff().souls);
  r.souls = souls; r.win = win;
  if (win) score += 5000 + r.gold * 5;
  profile.souls += souls; if (win) profile.wins++;
  profile.bestDepth = Math.max(profile.bestDepth, win ? FLOORS + 1 : r.depth);
  profile.bestScore = Math.max(profile.bestScore, score);
  profile.history.unshift({ seed: seedText(r.seed), depth: r.depth, win, score, kills: r.kills, cards: r.owned.length, time: Math.round(r.time), souls, daily: r.daily, d: Date.now() });
  profile.history.length = Math.min(profile.history.length, 20);
  saveProfile(); store.del('run');
  if (win) { state = 'runover'; P.deadT = 0; play('win', 1); if (document.pointerLockElement) document.exitPointerLock(); }
}
const fmtTime = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// ---------- Huvudloop ----------
let last = 0;
function loop(t) {
  const realDt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
  let dt = realDt; if (hitStop > 0) { hitStop -= realDt; dt = realDt * 0.06; } // träffstopp: tiden står nästan still ett ögonblick
  if (map && state !== 'title') {
    if (state !== 'pause' && state !== 'ui') update(dt);
    updateLight(); render(); drawWeapon(); drawHUD();
    if (state === 'dead' && P.deadT > 1.2) drawRunOver(false);
    if (state === 'runover') drawRunOver(true);
    if (state === 'pause') overlay('PAUS', ['KLICKA FÖR ATT FORTSÄTTA', `FRÖ ${seedText(run.seed)}  VÅNING ${run.depth}`, `KORT ${run.owned.length}  (C = VISA)`, `KÄNSLIGHET ${settings.sens.toFixed(1)}  [ ]`, `SYNFÄLT ${settings.fov}°  , .`, `VOLYM ${Math.round(settings.vol * 100)}%  - +`, `SVÅRIGHET ${DIFF[settings.diff].name}`], '#202040');
    if (state === 'stats') drawStats();
  }
  requestAnimationFrame(loop);
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
  const rows = [['FIENDER', `${s.kills}/${s.totalEnemies}`], ['HEMLIGHETER', `${s.secrets}/${s.totalSecrets}`], ['FÖREMÅL', `${s.items}/${s.totalItems}`], ['TID', fmtTime(s.time)], ['BONUS', `+${s.bonus}`], ['GULD', String(run.gold)], ['POÄNG', String(score)]];
  rows.forEach(([k, v], i) => { const y = 36 + i * 14; txt(k, 70, y, '#c9a87a'); txt(v, 250 - textW(v), y, '#e8d9b0'); });
  const f = 'KLICKA FÖR ATT VÄLJA KORT'; if (tmr % 1 < 0.7) txt(f, (W - textW(f)) / 2, 142, '#ffe9a8');
}
function drawRunOver(win) {
  const r = run;
  ctx.fillStyle = win ? '#0c1a0ce8' : '#1a0606e8'; ctx.fillRect(0, 0, W, VH);
  ctx.font = '16px "PressStart2P"'; const t1 = win ? 'SEGER!' : 'RUNDAN ÄR SLUT'; const w = ctx.measureText(plain(t1)).width;
  txt(t1, (W - w) / 2, 10, win ? '#9fe0a0' : '#ff5040', 2);
  const rows = [['VÅNING', win ? 'BOSSEN BESEGRAD' : `${r.depth} AV ${FLOORS + 1}`], ['FIENDER', String(r.kills)], ['KORT', String(r.owned.length)], ['GULD', String(r.gold)], ['TID', fmtTime(r.time)], ['POÄNG', String(score)], ['SJÄLAR', `+${r.souls || 0}`], ['FRÖ', seedText(r.seed)]];
  rows.forEach(([k, v], i) => { const y = 34 + i * 13; txt(k, 50, y, '#c9a87a'); txt(v, 270 - textW(v), y, k === 'SJÄLAR' ? '#c0a0ff' : '#e8d9b0'); });
  const f = 'KLICKA FÖR MENYN'; if (tmr % 1 < 0.7) txt(f, (W - textW(f)) / 2, 145, '#ffe9a8');
}

// ---------- Indata ----------
function showTitle() {
  state = 'title'; map = null;
  if (ambient) { ambient.s.stop(); ambient = null; }
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
  if (startDepth > 1) { for (let i = 1; i <= Math.min(3, startDepth - 1); i++) { P.has[i] = true; P.mags[i] = WEAPONS[i].mag; } P.ammo = { p9: 90, r556: 60, shells: 20 }; }
  loadFloor(startDepth);
  if (params.has('nocards')) { lockPointer(); return; }
  // startkort: välj ett av tre innan första våningen
  openUI(() => CardUI.draft(drawCards(3), { title: 'RUNDAN BÖRJAR', subtitle: 'VÄLJ ETT STARTKORT', skipLabel: 'INGET KORT' }, card => { gainCard(card); closeUI(); }));
}
function lockPointer() { if (!params.has('nolock') && !isTouch() && document.pointerLockElement !== canvas && canvas.requestPointerLock) { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* pekarlås valfritt */ } } }
function pause() { if (state === 'play') { state = 'pause'; mouseDown = false; aimDown = false; for (const k in keys) keys[k] = false; if (actx) actx.suspend(); } }
function resume() { if (state === 'pause') { state = 'play'; if (actx) actx.resume(); lockPointer(); } }
function leaveRunScreen() { if ((state === 'dead' && P.deadT > 1.2) || (state === 'runover' && P.deadT > 1)) showTitle(); }
function showDeck() { const back = state; openUI(() => CardUI.deck(run.owned, () => closeUI(back === 'pause' ? 'pause' : 'play'))); }
addEventListener('keydown', e => {
  if (state === 'title' || (window.CardUI && CardUI.isOpen())) return;
  if (state === 'ui') return;
  if (e.code === 'Escape' || e.code === 'KeyP') { if (state === 'play') pause(); else if (state === 'pause' && e.code === 'KeyP') resume(); return; }
  keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
  if (e.code === 'BracketLeft' || e.code === 'BracketRight') { settings.sens = clamp(settings.sens + (e.code === 'BracketLeft' ? -0.1 : 0.1), 0.2, 3); saveSettings(); say(`MUSKÄNSLIGHET ${settings.sens.toFixed(1)}`, 1.2); }
  if (e.code === 'Minus' || e.code === 'Equal') { settings.vol = clamp(settings.vol + (e.code === 'Minus' ? -0.1 : 0.1), 0, 1); saveSettings(); applyVolume(); say(`VOLYM ${Math.round(settings.vol * 100)}%`, 1.2); }
  if (e.code === 'Comma' || e.code === 'Period') { settings.fov = clamp(settings.fov + (e.code === 'Comma' ? -4 : 4), 60, 100); saveSettings(); say(`SYNFÄLT ${settings.fov}°`, 1.2); }
  if (e.code === 'KeyN') { settings.muted = !settings.muted; saveSettings(); applyVolume(); say(settings.muted ? 'LJUD AV' : 'LJUD PÅ', 1); }
  if (e.code === 'KeyO') { const el = document.documentElement; if (document.fullscreenElement) document.exitFullscreen(); else if (el.requestFullscreen) el.requestFullscreen().catch(() => {}); }
  if (e.code === 'KeyC' && (state === 'play' || state === 'pause')) { showDeck(); return; }
  if (state === 'play') {
    if (e.code === 'KeyE' || e.code === 'Space') useKey();
    if (e.code === 'KeyR') startReload();
    if (e.code === 'KeyM' || e.code === 'Tab') showMap = !showMap;
    const n = e.code.startsWith('Digit') ? +e.code.slice(5) - 1 : -1;
    if (n >= 0 && n < 4) switchWeapon(n);
    if (e.code === 'KeyQ') cycleWeapon(1);
  } else if (e.code === 'Enter' || e.code === 'Space') {
    if (state === 'stats') nextFloor(); else leaveRunScreen();
  }
});
addEventListener('keyup', e => { keys[e.code] = false; });
function cycleWeapon(d) { for (let i = 1; i <= 4; i++) { const n = ((WS.next >= 0 && WS.state === 'holster' ? WS.next : P.weapon) + d * i + 8) % 4; if (P.has[n]) { switchWeapon(n); break; } } }
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

// ---------- Mobilstyrning (Kenney Mobile Controls, CC0) ----------
// Vänster halva: flytande joystick (gå/springa). Höger halva: dra för att vrida. Knappar: skjut (dra också för att sikta), sikta, ladda om, använd, byt vapen, karta, kort, paus.
const touch = { active: false, mx: 0, my: 0, mag: 0, look: 0, lookY: 0 };
const isTouch = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
function setupTouch() {
  const ui = document.getElementById('touch');
  const T = A + 'touch/';
  const btn = (act, icon, cls) => `<button class="tb ${cls}" data-act="${act}" aria-label="${act}"><img src="${T}btn.png" alt=""><img class="ic" src="${T}icon_${icon}.png" alt=""></button>`;
  ui.innerHTML = `<div class="joy" hidden><img class="pad" src="${T}pad.png" alt=""><img class="nub" src="${T}nub.png" alt=""></div>
    ${btn('fire', 'crosshair', 'fire')}${btn('aim', 'target', 'aim')}${btn('reload', 'arrow_rotate', 'reload')}${btn('use', 'hand', 'use')}${btn('swap', 'arrow_curved', 'swap')}
    ${btn('map', 'search', 'map small')}${btn('deck', 'star', 'deck small')}${btn('pause', 'pause', 'pausebtn small')}
    <div class="rotate">VRID TELEFONEN TILL LIGGANDE LÄGE</div>`;
  const joy = ui.querySelector('.joy'), nub = ui.querySelector('.nub');
  const ptrs = new Map(); // pointerId -> { kind, x, y, ox, oy }
  const R = () => Math.min(innerWidth, innerHeight) * 0.13; // joystickens radie
  ui.addEventListener('pointerdown', e => {
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
        if (act === 'reload') startReload();
        if (act === 'use') useKey();
        if (act === 'swap') cycleWeapon(1);
        if (act === 'map') showMap = !showMap;
        if (act === 'deck') showDeck();
        if (act === 'pause') pause();
      }
    } else if (e.clientX < innerWidth * 0.45) { // flytande joystick där tummen landar
      ptrs.set(e.pointerId, { kind: 'joy', ox: e.clientX, oy: e.clientY });
      joy.hidden = false; joy.style.left = e.clientX + 'px'; joy.style.top = e.clientY + 'px'; nub.style.transform = 'translate(-50%,-50%)';
    } else ptrs.set(e.pointerId, { kind: 'look', x: e.clientX, y: e.clientY });
    e.preventDefault();
  });
  ui.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    if (p.kind === 'joy') {
      let dx = e.clientX - p.ox, dy = e.clientY - p.oy; const d = Math.hypot(dx, dy), r = R();
      if (d > r) { dx *= r / d; dy *= r / d; }
      touch.mx = dx / r; touch.my = dy / r; touch.mag = Math.min(1, d / r);
      nub.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    } else if (p.kind === 'look') {
      touch.look += (e.clientX - p.x) * 320 / innerWidth; touch.lookY += (e.clientY - p.y) * 200 / innerHeight;
      p.x = e.clientX; p.y = e.clientY;
    }
    e.preventDefault();
  });
  const end = e => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    ptrs.delete(e.pointerId);
    if (p.kind === 'joy') { touch.mx = touch.my = touch.mag = 0; joy.hidden = true; }
    if (p.btn) p.btn.classList.remove('on');
    if (p.fire) mouseDown = false;
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
    for (const id of ['start', 'daily', 'unlocks']) document.getElementById(id).disabled = false;
  } catch (e) { st.textContent = 'FEL: ' + e.message; console.error(e); }
  refreshTitle(); setupTouch(); setupSliders();
  if (isTouch()) document.body.classList.add('touch');
  CardUI.sfx = n => { const m = { flip: ['card', 0.4, 1.3], pick: ['card', 0.8, 0.9], deny: ['click', 0.6, 0.7], open: ['card', 0.3, 0.8] }[n]; if (m) play(m[0], m[1], m[2]); };
  requestAnimationFrame(loop);
  window.__game = { P, WS, ents: () => ents, items: () => items, pots: () => pots, chests: () => chests, merchants: () => merchants, state: () => state, run: () => run, kills: () => kills, begin, doors: () => doors,
    fire, useKey, startReload, switchWeapon, floorDone, nextFloor, projectiles: () => projectiles, secrets: () => secrets, keys, setMouse: (d, aim) => { mouseDown = d; aimDown = !!aim; }, pause, resume, hurtPlayer,
    light: () => light, lvl: () => lvl, boss: () => boss, gainCard, mods: () => M, loadFloor, openShop, openChest, profile, showTitle, endRun, hurtEnemy };
  if (params.has('autostart')) begin('new');
})();
document.getElementById('start').addEventListener('click', () => begin('new'));
document.getElementById('daily').addEventListener('click', () => begin('daily'));
document.getElementById('continue').addEventListener('click', () => begin('continue'));
document.getElementById('unlocks').addEventListener('click', () => { ensureAudio(); openUnlocks(); });
})();
