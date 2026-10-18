'use strict';
// KRYPTA – raycaster-FPS i Wolfenstein/Doom-anda.
// Grafik och ljud kommer från repots assets/ och release assets-large-v1 (RetroWeaponPack, Horror SFX).
(() => {
const W = 320, H = 200, HUD_H = 34, VH = H - HUD_H, HORIZON = VH >> 1;
const BASE_PLANE = 0.75;
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

// ---------- Inställningar och sparning (localStorage kan saknas) ----------
const store = {
  get(k, def) { try { const v = localStorage.getItem('krypta.' + k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem('krypta.' + k, JSON.stringify(v)); } catch (e) { /* ingen lagring */ } },
  del(k) { try { localStorage.removeItem('krypta.' + k); } catch (e) { /* ingen lagring */ } },
};
const settings = Object.assign({ sens: 1, vol: 0.8, muted: false, diff: 1 }, store.get('settings', {}));
if (params.has('diff')) settings.diff = clamp(+params.get('diff'), 0, 2);
const saveSettings = () => store.set('settings', settings);
const DIFF = [
  { name: 'LÄTT', dmg: 0.55, hp: 0.8, ammo: 1.4, speed: 0.9 },
  { name: 'NORMAL', dmg: 1, hp: 1, ammo: 1, speed: 1 },
  { name: 'SVÅR', dmg: 1.45, hp: 1.3, ammo: 0.75, speed: 1.12 },
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
const strip = (img, n) => { const fw = Math.floor(img.width / n); return [...Array(n)].map((_, i) => pixels(img, fw, img.height, i * fw, 0, fw, img.height)); };
const grid = (img, fw, fh, cols, rows) => { const out = []; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push(pixels(img, fw, fh, c * fw, r * fh, fw, fh)); return out; };
const tex = {}, spr = {}, fx = {}, snd = {}, enemyFrames = {}, wimg = {};
const ENEMY_DEFS = {
  S: { name: 'SKELETT', sheet: 'skeleton1', move: 'movement', hp: 5, speed: 1.35, melee: true, dmg: 9, range: 0.95, cd: 0.9, size: 1.0, growl: 'growl', score: 100, atkFps: 14, hitAt: 0.55 },
  K: { name: 'ELDSKELETT', sheet: 'skeleton2', move: 'movemen', hp: 6, speed: 0.95, melee: false, dmg: 8, range: 8.5, cd: 1.8, size: 1.05, growl: 'hiss', score: 150, atkFps: 12, hitAt: 0.5 },
  V: { name: 'VAMPYR', sheet: 'vampire', move: 'movement', hp: 9, speed: 2.15, melee: true, dmg: 14, range: 0.95, cd: 0.75, size: 1.1, growl: 'roar', score: 250, atkFps: 16, hitAt: 0.5 },
};
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
  try { await document.fonts.load('8px "PressStart2P"'); } catch (e) { /* reservtypsnitt */ }
}

// ---------- Ljud (positionsljud med stereo) ----------
let actx = null, master = null;
const SOUNDS = ['shot', 'boom', 'pickup', 'health', 'hurt', 'splat', 'weapon', 'lose', 'win', 'growl', 'hiss', 'pain', 'roar', 'gore', 'drone', 'door', 'steps',
  'reload', 'click', 'shell', 'pot', 'secret', 'whoosh', 'ricochet', 'breath', 'armor', 'gate', 'fireburst'];
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
// mag = magasinsstorlek, ammo = ammotyp, delay = tid mellan skott
const WEAPONS = [
  { id: 'pistol', name: 'PISTOL', short: 'PISTOL', ammo: 'p9', mag: 9, dmg: 2.2, pellets: 1, spread: 0.012, delay: 0.3, auto: false, sound: ['shot', 1.15, 0.85], flash: 0.75, kick: 0.6 },
  { id: 'shotgun', name: 'HAGELGEVÄR', short: 'HAGEL', ammo: 'shells', mag: 6, dmg: 1.7, pellets: 9, spread: 0.07, delay: 0.95, auto: false, sound: ['boom', 0.8, 0.9], flash: 1.4, kick: 2.2, shellReload: true },
  { id: 'rifle', name: 'GEVÄR', short: 'GEVÄR', ammo: 'r556', mag: 24, dmg: 2.8, pellets: 1, spread: 0.014, delay: 0.13, auto: true, sound: ['shot', 0.82, 0.9], flash: 1.0, kick: 0.9 },
  { id: 'smg', name: 'KULSPRUTEPISTOL', short: 'KPIST', ammo: 'p9', mag: 32, dmg: 1.5, pellets: 1, spread: 0.035, delay: 0.085, auto: true, sound: ['shot', 1.45, 0.65], flash: 0.75, kick: 0.5 },
];
const AMMO = { p9: { name: '9MM', max: 200 }, r556: { name: '5.56', max: 150 }, shells: { name: 'PATRONER', max: 50 } };
const WF = window.WEAPON_FRAMES;

// ---------- Spelstate ----------
const P = { x: 2, y: 2, a: 0, vx: 0, vy: 0, hp: 100, armor: 0, weapon: 0, has: [true, false, false, false],
  ammo: { p9: 36, r556: 0, shells: 0 }, mags: [9, 0, 0, 0], flash: 0, bob: 0, bobAmp: 0, hurt: 0, pick: 0, shake: 0, camZ: 0.5, deadT: 0 };
const WS = { state: 'draw', t: 0, aim: 0, next: -1, shot: 99, cd: 0, swayX: 0, swayY: 0, spread: 0, shellPhase: '' };
let map, mw, mh, doors, ents, items, pots, torches, particles, projectiles, light, torchLight, flow, flowCell = -1, seen;
let level = 0, lvl, totalEnemies, kills, secrets, totalSecrets, itemsTaken, totalItems, levelTime = 0;
let state = 'title', tmr = 0, score = 0, showMap = false, hitMark = 0, hitKill = false, hurtDir = [], breathSnd = null, ambient = null, stepT = 0, fireHeld = false;
const msgs = [];
const keys = {};
let mouseDown = false, aimDown = false;

const plain = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
function say(t, d = 2.5) { msgs.unshift({ text: plain(t), t: d }); if (msgs.length > 3) msgs.length = 3; }

function startLevel(n, keep) {
  level = n; lvl = LEVELS[n];
  map = lvl.map.map(r => r.split('')); mh = map.length; mw = map[0].length;
  doors = {}; ents = []; items = []; pots = []; torches = []; particles = []; projectiles = [];
  kills = 0; totalEnemies = 0; secrets = 0; totalSecrets = 0; itemsTaken = 0; totalItems = 0; levelTime = 0;
  light = new Float32Array(mw * mh); seen = new Uint8Array(mw * mh); flow = new Int16Array(mw * mh).fill(-1); flowCell = -1;
  const itemOf = { h: 'health', a: 'ammo', A: 'armor', g: 'shotgun', r: 'rifle', m: 'smg' };
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    const c = map[y][x], cx = x + 0.5, cy = y + 0.5;
    if (c === 'P') { P.x = cx; P.y = cy; P.a = startAngle(x, y); map[y][x] = '.'; }
    else if (ENEMY_DEFS[c]) { ents.push(makeEnemy(c, cx, cy)); totalEnemies++; map[y][x] = '.'; }
    else if (itemOf[c]) { items.push({ type: itemOf[c], x: cx, y: cy, taken: false }); totalItems++; map[y][x] = '.'; }
    else if (c === 'D' || c === 'G' || c === '*') { doors[x + ',' + y] = { open: 0, target: 0, gate: c === 'G', secret: c === '*', x, y }; if (c === '*') totalSecrets++; }
    else if (c === 'x') { map[y][x] = '.'; lvl.exit = { x, y }; }
    else if (c === 'f') { torches.push({ x: cx, y: cy, ph: Math.random() * 10, cells: [] }); }
    else if (c === 'o') { pots.push({ x: cx, y: cy, color: (x * 7 + y * 3) % 4, broken: false, loot: Math.random() < 0.45 ? (Math.random() < 0.5 ? 'ammo' : 'health') : null }); map[y][x] = '.'; }
  }
  prepareTorchLight();
  if (!keep) { P.hp = 100; P.armor = 0; }
  else { P.hp = Math.min(100, P.hp + 20); }
  P.vx = P.vy = 0; P.flash = 0; P.hurt = 0; P.camZ = 0.5; P.deadT = 0; P.shake = 0;
  WS.state = 'draw'; WS.t = 0; WS.aim = 0; WS.shot = 99;
  hurtDir = []; msgs.length = 0;
  state = 'play';
  say(`BANA ${n + 1}: ${lvl.name}`, 3);
  if (!ambient) startAmbient();
  saveProgress(n);
}
function startAngle(x, y) { // titta mot den längsta öppna riktningen
  let best = 0, bd = -1;
  for (const [a, dx, dy] of [[0, 1, 0], [Math.PI / 2, 0, 1], [Math.PI, -1, 0], [-Math.PI / 2, 0, -1]]) {
    let d = 0; while (!isWallChar(map[y + dy * (d + 1)][x + dx * (d + 1)]) && d < 30) d++;
    if (d > bd) { bd = d; best = a; }
  }
  return best;
}
function startAmbient() { ambient = play('drone', 0.32, 1, { loop: true }); }
function makeEnemy(type, x, y) {
  const d = ENEMY_DEFS[type];
  return { type, d, x, y, hp: d.hp * diff().hp, state: 'idle', t: Math.random() * 3, cd: 1, alert: false, flip: Math.random() < 0.5, dead: false, flash: 0, growlT: 2 + Math.random() * 4, didHit: false };
}

// ---------- Kollision / kartfrågor ----------
function cellAt(x, y) { if (x < 0 || y < 0 || x >= mw || y >= mh) return '1'; return map[y | 0][x | 0]; }
function isWallChar(c) { return c >= '1' && c <= '5'; }
const isDoorChar = c => c === 'D' || c === 'G' || c === '*';
function doorAt(x, y) { return doors[(x | 0) + ',' + (y | 0)]; }
function solid(x, y) {
  const c = cellAt(x, y);
  if (isWallChar(c) || c === 'f') return true;
  if (isDoorChar(c)) return doorAt(x, y).open < 0.85;
  return false;
}
function tryMove(o, dx, dy, r) {
  const nx = o.x + dx, ny = o.y + dy;
  if (dx && !solid(nx + Math.sign(dx) * r, o.y) && !solid(nx + Math.sign(dx) * r, o.y + r * 0.9) && !solid(nx + Math.sign(dx) * r, o.y - r * 0.9)) o.x = nx;
  if (dy && !solid(o.x, ny + Math.sign(dy) * r) && !solid(o.x + r * 0.9, ny + Math.sign(dy) * r) && !solid(o.x - r * 0.9, ny + Math.sign(dy) * r)) o.y = ny;
}
function pushOut(o, cx, cy, minD) { // skjut ut ur en cirkel (krukor, fiender)
  const dx = o.x - cx, dy = o.y - cy, d = Math.hypot(dx, dy);
  if (d < minD && d > 1e-4) tryMove(o, dx / d * (minD - d), dy / d * (minD - d), 0.24);
}
// Raycast i rutnätet. Returnerar { dist, side, cell, wx, lx, ly (rutan framför väggen) }
function cast(ox, oy, dx, dy, maxD = 40, mark) {
  let mx = ox | 0, my = oy | 0;
  const ddx = Math.abs(1 / (dx || 1e-9)), ddy = Math.abs(1 / (dy || 1e-9));
  let sx, sy, sdx, sdy;
  if (dx < 0) { sx = -1; sdx = (ox - mx) * ddx; } else { sx = 1; sdx = (mx + 1 - ox) * ddx; }
  if (dy < 0) { sy = -1; sdy = (oy - my) * ddy; } else { sy = 1; sdy = (my + 1 - oy) * ddy; }
  let side = 0, dist = 0;
  for (let i = 0; i < 80; i++) {
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
  torchLight = [];
  for (const t of torches) {
    for (let y = Math.max(0, (t.y | 0) - 7); y < Math.min(mh, (t.y | 0) + 8); y++) for (let x = Math.max(0, (t.x | 0) - 7); x < Math.min(mw, (t.x | 0) + 8); x++) {
      const d = Math.hypot(x + 0.5 - t.x, y + 0.5 - t.y);
      if (d > 7) continue;
      const wallCell = isWallChar(map[y][x]);
      // väggrutor får ljus om rutan framför dem ser facklan
      if (!wallCell && !hasLOS(t.x, t.y, x + 0.5, y + 0.5)) continue;
      t.cells.push([y * mw + x, Math.pow(1 - d / 7, 1.5) * 1.3]);
    }
  }
}
function updateLight() {
  const amb = lvl.ambient;
  light.fill(amb);
  for (const t of torches) {
    const fl = 0.85 + 0.1 * Math.sin(tmr * 9 + t.ph) + 0.06 * Math.sin(tmr * 23 + t.ph * 3);
    for (const [i, w] of t.cells) light[i] += w * fl;
  }
  const flashLight = (lx, ly, strength, r) => {
    for (let y = Math.max(0, (ly | 0) - r); y < Math.min(mh, (ly | 0) + r + 1); y++) for (let x = Math.max(0, (lx | 0) - r); x < Math.min(mw, (lx | 0) + r + 1); x++) {
      const d = Math.hypot(x + 0.5 - lx, y + 0.5 - ly); if (d < r) light[y * mw + x] += strength * (1 - d / r);
    }
  };
  flashLight(P.x, P.y, 0.22, 3); // svagt eget ljus så man ser närmast
  if (P.flash > 0) flashLight(P.x, P.y, P.flash * 9, 4);
  for (const pr of projectiles) flashLight(pr.x, pr.y, 0.5, 3);
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
  const a = P.a + (P.shake ? rnd(-1, 1) * P.shake * 0.02 : 0);
  const dirX = Math.cos(a), dirY = Math.sin(a), plX = -dirY * plane, plY = dirX * plane;
  const camZ = P.camZ + Math.sin(P.bob * 2) * 0.012 * P.bobAmp;
  const hor = HORIZON + (P.shake ? Math.round(rnd(-1, 1) * P.shake * 2) : 0);
  view = { dirX, dirY, plX, plY, hor, camZ, a };
  const fl = tex[lvl.floor], ce = tex[lvl.ceil];
  // golv och tak
  for (let y = 0; y < VH; y++) {
    const isFloor = y > hor;
    if (y === hor) { for (let x = 0; x < W; x++) px[y * W + x] = 0xff000000 | (fogB << 16) | (fogG << 8) | fogR; continue; }
    const rowDist = isFloor ? VH * camZ / (y - hor) : VH * (1 - camZ) / (hor - y);
    const t = isFloor ? fl : ce, dim = isFloor ? 1 : 0.62;
    const x0 = P.x + (dirX - plX) * rowDist, y0 = P.y + (dirY - plY) * rowDist;
    const stx = (2 * plX * rowDist) / W, sty = (2 * plY * rowDist) / W;
    let fx = x0, fy = y0;
    for (let x = 0; x < W; x++) {
      const cx = Math.floor(fx), cy = Math.floor(fy);
      const u = ((fx - cx) * t.w) | 0, v = ((fy - cy) * t.h) | 0;
      const L = (cx >= 0 && cy >= 0 && cx < mw && cy < mh) ? light[cy * mw + cx] : lvl.ambient;
      px[y * W + x] = shadeFog(t.data[v * t.w + u], L * dim, rowDist);
      fx += stx; fy += sty;
    }
  }
  // väggar
  for (let x = 0; x < W; x++) {
    const camX = 2 * x / W - 1, rdx = dirX + plX * camX, rdy = dirY + plY * camX;
    const hit = cast(P.x, P.y, rdx, rdy, 40, true);
    const perp = Math.max(0.05, hit.dist);
    zbuf[x] = perp;
    const scale = VH / perp;
    const top = hor - scale * (1 - camZ), lh = scale;
    const t = hit.cell === 'D' ? tex.door_wood : hit.cell === 'G' ? tex.door_metal_gate : hit.cell === '*' ? tex[wallTexFor[lvl.secretWall]] : tex[wallTexFor[hit.cell]];
    let u = (hit.wx * t.w) | 0;
    if ((hit.side === 0 && rdx > 0) || (hit.side === 1 && rdy < 0)) u = t.w - 1 - u;
    let L = lightAt(hit.lx, hit.ly);
    if (hit.side === 1) L *= 0.8;
    const y0 = Math.max(0, Math.ceil(top)), y1 = Math.min(VH - 1, Math.floor(top + lh - 0.001));
    const step = t.h / lh;
    let v = (y0 - top) * step;
    for (let y = y0; y <= y1; y++) { px[y * W + x] = shadeFog(t.data[Math.min(t.h - 1, v | 0) * t.w + u], L, perp); v += step; }
  }
  // sprites: fiender, föremål, krukor, eldfat, partiklar, eldklot – bakifrån och fram
  const list = [];
  for (const e of ents) list.push({ x: e.x, y: e.y, k: 'e', o: e });
  for (const it of items) if (!it.taken) list.push({ x: it.x, y: it.y, k: 'i', o: it });
  for (const p of pots) if (!p.broken) list.push({ x: p.x, y: p.y, k: 'p', o: p });
  for (const t of torches) list.push({ x: t.x, y: t.y, k: 't', o: t });
  for (const p of particles) list.push({ x: p.x, y: p.y, k: 'x', o: p });
  for (const p of projectiles) list.push({ x: p.x, y: p.y, k: 'f', o: p });
  for (const s of list) s.d = (s.x - P.x) ** 2 + (s.y - P.y) ** 2;
  list.sort((p, q) => q.d - p.d);
  for (const s of list) {
    const o = s.o;
    if (s.k === 'e') {
      if (!o.dead && o.state === 'attack') o.flip = (o.x - P.x) * plX + (o.y - P.y) * plY > 0; // vänd mot mitten när den anfaller
      else if (!o.dead && (o.mvx || o.mvy)) o.flip = o.mvx * plX + o.mvy * plY < 0;
      drawSprite(enemyFrame(o), o.x, o.y, o.d.size * 1.15, 0, o.flip, null, o.flash > 0 ? o.flash : 0);
    }
    else if (s.k === 'i') {
      const img = spr[o.type] || spr['pick_' + o.type];
      const big = o.type === 'health' || o.type === 'armor';
      drawSprite(img, o.x, o.y, big ? 0.42 : o.type === 'ammo' ? 0.32 : 0.3, 0.04 + 0.04 * Math.sin(tmr * 3 + o.x), false, null, 0, 1.1);
    } else if (s.k === 'p') drawSprite(fx.pots[o.color], o.x, o.y, 0.55, 0, false);
    else if (s.k === 't') drawSprite(fx.fire[Math.floor(tmr * 14 + o.ph * 5) % 16], o.x, o.y, 0.85, 0, false, 2.2, 0, 0, true);
    else if (s.k === 'f') drawSprite(fx.fireball[Math.floor(tmr * 16) % 8], o.x, o.y, 0.3, o.z - 0.15, false, 2.4, 0, 0, true);
    else drawSprite(o.img, o.x, o.y, o.size, o.z, false, o.add ? 2 : null, 0, 0, o.add);
  }
  ctx.putImageData(frame, 0, 0);
}
// Tecknar en billboard-sprite. size = höjd i världsenheter, z = höjd över golvet.
function drawSprite(img, wx, wy, size, z, flip, fixedLight, whiteFlash = 0, minLight = 0, additive = false) {
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
  for (let x = x0; x <= x1; x++) {
    if (ty >= zbuf[x]) continue;
    let u = Math.floor((x - left) / sw * img.w); if (flip) u = img.w - 1 - u;
    if (u < 0 || u >= img.w) continue;
    for (let y = y0; y <= y1; y++) {
      const v = Math.floor((y - topY) / sh * img.h);
      if (v < 0 || v >= img.h) continue;
      const c = img.data[v * img.w + u];
      const al = c >>> 24;
      if (al < 100) continue;
      const i = y * W + x;
      if (additive) { // eld lyser: additiv blandning
        const d = px[i], k = ff * (al / 255);
        const r = Math.min(255, (d & 255) + (c & 255) * k), g = Math.min(255, ((d >> 8) & 255) + ((c >> 8) & 255) * k), b = Math.min(255, ((d >> 16) & 255) + ((c >> 16) & 255) * k);
        px[i] = 0xff000000 | (b << 16) | (g << 8) | r;
      } else {
        let col = shadeFog(c, L, ty);
        if (whiteFlash > 0) { const f = Math.min(1, whiteFlash * 6); col = 0xff000000 | ((((col >> 16) & 255) * (1 - f) + 255 * f) << 16) | ((((col >> 8) & 255) * (1 - f) + 255 * f) << 8) | (((col & 255) * (1 - f) + 255 * f) | 0); }
        px[i] = col;
      }
    }
  }
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

// ---------- Förstapersonsvapen ----------
const wcan = document.createElement('canvas'), wctx = wcan.getContext('2d');
function weaponFrame() { // vilken bildruta och förskjutning som ska visas
  const wp = WEAPONS[P.weapon], f = WF[wp.id], st = f.states;
  const aiming = WS.aim > 0.5;
  let idx = aiming ? st.aim[0] : st.idle[0], dy = 0;
  const pick = (arr, k) => arr[clamp(Math.floor(k * arr.length), 0, arr.length - 1)];
  if (WS.state === 'draw') idx = pick(st.draw, WS.t / drawTime());
  else if (WS.state === 'holster') idx = pick(st.draw, 1 - WS.t / 0.22);
  else if (WS.state === 'reload') {
    if (wp.shellReload) {
      const seg = WS.shellPhase === 'start' ? st.reload.slice(0, 3) : WS.shellPhase === 'step' ? st.reload.slice(3, 8) : st.reload.slice(8);
      idx = pick(seg, WS.t / shellSeg(WS.shellPhase));
    } else idx = pick(st.reload, WS.t / f.dur.reload);
  } else if (WS.shot < (aiming ? f.dur.aimfire : f.dur.fire)) {
    idx = pick(aiming ? st.aimfire : st.fire, WS.shot / (aiming ? f.dur.aimfire : f.dur.fire));
  }
  if (state === 'dead') dy = Math.min(80, P.deadT * 140);
  return { f, idx, dy };
}
const drawTime = () => Math.min(0.55, WF[WEAPONS[P.weapon].id].dur.draw * 0.7);
const shellSeg = ph => ph === 'start' ? 0.32 : ph === 'step' ? 0.5 : 0.42;
function drawWeapon() {
  const { f, idx, dy } = weaponFrame();
  const amp = P.bobAmp * (1 - WS.aim * 0.75);
  const ox = Math.round(Math.sin(P.bob) * 4 * amp - WS.swayX), oy = Math.round(Math.abs(Math.cos(P.bob)) * 3 * amp - WS.swayY + dy + P.shake * 2);
  const img = wimg[WEAPONS[P.weapon].id];
  // ljussätt vapnet efter platsen man står på (och mynningsblixten)
  const L = clamp(lightAt(P.x, P.y) * 1.05 + P.flash * 4, 0.28, 1.25);
  if (wcan.width !== f.w || wcan.height !== f.h) { wcan.width = f.w; wcan.height = f.h; }
  wctx.globalCompositeOperation = 'source-over'; wctx.clearRect(0, 0, f.w, f.h);
  wctx.drawImage(img, idx * f.w, 0, f.w, f.h, 0, 0, f.w, f.h);
  if (L < 1) { wctx.globalCompositeOperation = 'source-atop'; wctx.fillStyle = `rgba(${lvl.fog.join(',')},${(1 - L).toFixed(3)})`; wctx.fillRect(0, 0, f.w, f.h); }
  else if (L > 1) { wctx.globalCompositeOperation = 'source-atop'; wctx.fillStyle = `rgba(255,190,120,${((L - 1) * 0.6).toFixed(3)})`; wctx.fillRect(0, 0, f.w, f.h); }
  ctx.drawImage(wcan, f.x + ox, f.y + oy);
  // mynningsflamma vid mynningen i just den här bildrutan
  if (WS.shot < 0.06 && state === 'play') {
    const wp = WEAPONS[P.weapon], m = f.muzzle[idx], s = 34 * wp.flash * (1 - WS.shot / 0.06 * 0.4);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.translate(m[0] + ox, m[1] + oy); ctx.rotate(Math.random() * TAU);
    ctx.drawImage(wimg.flash, -s / 2, -s / 2, s, s);
    ctx.restore();
  }
}

// ---------- HUD ----------
function drawHUD() {
  const g = ctx, y0 = VH;
  // skaderiktning
  for (const h of hurtDir) {
    const rel = h.ang - P.a, sx = W / 2 + Math.sin(rel) * W * 0.42, sy = HORIZON - Math.cos(rel) * VH * 0.4;
    const gr = g.createRadialGradient(sx, sy, 2, sx, sy, 46);
    gr.addColorStop(0, `rgba(220,0,0,${0.55 * h.t})`); gr.addColorStop(1, 'rgba(220,0,0,0)');
    g.fillStyle = gr; g.fillRect(sx - 46, sy - 46, 92, 92);
  }
  if (P.hurt > 0) { g.fillStyle = `rgba(190,0,0,${Math.min(0.45, P.hurt * 0.6)})`; g.fillRect(0, 0, W, VH); }
  if (P.pick > 0) { g.fillStyle = `rgba(255,230,120,${P.pick * 0.22})`; g.fillRect(0, 0, W, VH); }
  if (P.hp < 30 && state === 'play') { // låg hälsa: pulserande röd kant
    const p = 0.25 + 0.2 * Math.sin(tmr * 6);
    const gr = g.createRadialGradient(W / 2, HORIZON, VH * 0.35, W / 2, HORIZON, W * 0.62);
    gr.addColorStop(0, 'rgba(120,0,0,0)'); gr.addColorStop(1, `rgba(150,0,0,${p})`);
    g.fillStyle = gr; g.fillRect(0, 0, W, VH);
  }
  // sikte som vidgas med spridningen
  if (state === 'play') {
    const gap = Math.round(2 + WS.spread * 160), cx = W / 2, cy = HORIZON;
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillRect(cx - gap - 3, cy, 3, 1); g.fillRect(cx + gap + 1, cy, 3, 1); g.fillRect(cx, cy - gap - 3, 1, 3); g.fillRect(cx, cy + gap + 1, 1, 3);
    if (hitMark > 0) {
      g.fillStyle = hitKill ? '#ff4030' : '#ffffff';
      for (let i = 2; i < 5; i++) { g.fillRect(cx - i, cy - i, 1, 1); g.fillRect(cx + i, cy - i, 1, 1); g.fillRect(cx - i, cy + i, 1, 1); g.fillRect(cx + i, cy + i, 1, 1); }
    }
  }
  // nedre listen
  g.fillStyle = '#1b1410'; g.fillRect(0, y0, W, HUD_H);
  g.fillStyle = '#5a4630'; g.fillRect(0, y0, W, 1);
  g.fillStyle = '#3a2c1e'; g.fillRect(0, y0 + 1, W, 1);
  for (const sx of [58, 114, 202, 264]) { g.fillStyle = '#3a2c1e'; g.fillRect(sx, y0 + 4, 1, HUD_H - 8); }
  g.textBaseline = 'top';
  const wp = WEAPONS[P.weapon];
  txt('HÄLSA', 6, y0 + 5, '#c9a87a'); txt(String(Math.max(0, Math.ceil(P.hp))), 6, y0 + 16, P.hp > 30 ? '#e8d9b0' : (tmr % 0.6 < 0.3 ? '#ff4d3d' : '#a02a20'), 2);
  txt('RUSTN', 64, y0 + 5, '#c9a87a'); txt(String(Math.ceil(P.armor)), 64, y0 + 16, P.armor > 0 ? '#9fc4ff' : '#5a4630', 2);
  const mag = P.mags[P.weapon], res = P.ammo[wp.ammo];
  txt(AMMO[wp.ammo].name, 120, y0 + 5, '#c9a87a');
  const low = mag <= Math.ceil(wp.mag * 0.25);
  txt(String(mag), 120, y0 + 16, mag === 0 ? (tmr % 0.5 < 0.25 ? '#ff4d3d' : '#7a2a20') : low ? '#ffb040' : '#e8d9b0', 2);
  txt('/' + res, 122 + String(mag).length * 16, y0 + 22, '#a89070');
  txt(wp.short, 208, y0 + 5, '#c9a87a');
  for (let i = 0; i < 4; i++) txt(String(i + 1), 208 + i * 13, y0 + 15, P.has[i] ? (i === P.weapon ? '#ffd24a' : '#8a7550') : '#3a2c1e', 1, false);
  txt(`${kills}/${totalEnemies}`, 208, y0 + 25, '#e8d9b0');
  txt(`BANA ${level + 1}`, 270, y0 + 5, '#c9a87a');
  txt(String(score).padStart(5, '0'), 270, y0 + 15, '#e8d9b0');
  txt(`${secrets}/${totalSecrets}`, 270, y0 + 25, secrets ? '#9fe0a0' : '#5a4630');
  // meddelanden
  msgs.forEach((m, i) => { const w = textW(m.text); txt(m.text, (W - w) / 2, 6 + i * 11, i ? '#c9b080' : '#ffe9a8', 1, true, Math.min(1, m.t * 2)); });
  if (WS.state === 'idle' && P.mags[P.weapon] === 0 && P.ammo[wp.ammo] > 0 && state === 'play') { const s = 'R = LADDA OM', w = textW(s); txt(s, (W - w) / 2, HORIZON + 14, '#ffb040'); }
  if (showMap) drawMap();
}
function textW(s) { ctx.font = '8px "PressStart2P"'; return ctx.measureText(plain(s)).width; }
function txt(s, x, y, col, scale = 1, shadow = true, alpha = 1) {
  const g = ctx; s = plain(s); g.font = `${8 * scale}px "PressStart2P"`; g.globalAlpha = alpha;
  if (shadow) { g.fillStyle = '#000'; g.fillText(s, x + 1, y + 1); }
  g.fillStyle = col; g.fillText(s, x, y); g.globalAlpha = 1;
}
function drawMap() { // automap: bara rutor man har sett
  const s = 5, ox = (W - mw * s) / 2 | 0, oy = (VH - mh * s) / 2 | 0;
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(ox - 3, oy - 3, mw * s + 6, mh * s + 6);
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    if (!seen[y * mw + x]) continue;
    const c = map[y][x];
    ctx.fillStyle = isWallChar(c) ? '#7d7566' : c === 'D' ? '#c08040' : c === 'G' ? (kills >= totalEnemies ? '#60d060' : '#b04080') : c === '*' ? (doors[x + ',' + y].open > 0 ? '#2a2420' : '#7d7566') : c === 'f' ? '#ff9a30' : '#2a2420';
    ctx.fillRect(ox + x * s, oy + y * s, s, s);
    if (lvl.exit && lvl.exit.x === x && lvl.exit.y === y) { ctx.fillStyle = '#60d060'; ctx.fillRect(ox + x * s + 1, oy + y * s + 1, s - 2, s - 2); }
  }
  for (const it of items) if (!it.taken && seen[(it.y | 0) * mw + (it.x | 0)]) { ctx.fillStyle = '#ffd24a'; ctx.fillRect(ox + it.x * s - 1, oy + it.y * s - 1, 2, 2); }
  ctx.fillStyle = '#4dff7a'; ctx.fillRect(ox + P.x * s - 1, oy + P.y * s - 1, 3, 3);
  ctx.fillRect(ox + (P.x + Math.cos(P.a) * 1.2) * s, oy + (P.y + Math.sin(P.a) * 1.2) * s, 1, 1);
}

// ---------- Strid ----------
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
  P.mags[P.weapon]--; WS.shot = 0; WS.cd = wp.delay; P.flash = 0.07; P.shake = Math.max(P.shake, wp.kick * 0.5);
  WS.swayY -= wp.kick * 2;
  play(wp.sound[0], wp.sound[2], wp.sound[1] * rnd(0.96, 1.04));
  if (wp.id === 'shotgun') { play('boom', 0.45, 0.55); setTimeout(() => play('reload', 0.45, 1.4), 420); }
  // ljudet väcker fiender som kan nås inom ~14 rutor
  for (const e of ents) if (!e.dead && pathDist(e) < 15) alertEnemy(e, false);
  let anyHit = false, killed = false;
  const spread = (wp.spread + WS.spread * 0.5) * (1 - WS.aim * 0.6);
  for (let p = 0; p < wp.pellets; p++) {
    const a = P.a + rnd(-1, 1) * spread;
    const dx = Math.cos(a), dy = Math.sin(a);
    const wall = cast(P.x, P.y, dx, dy);
    let best = null, bd = wall.dist, kind = '';
    for (const e of ents) {
      if (e.dead) continue;
      const rx = e.x - P.x, ry = e.y - P.y, along = rx * dx + ry * dy;
      if (along <= 0.1 || along >= bd) continue;
      if (Math.abs(rx * dy - ry * dx) < 0.3 * e.d.size) { best = e; bd = along; kind = 'e'; }
    }
    for (const pt of pots) {
      if (pt.broken) continue;
      const rx = pt.x - P.x, ry = pt.y - P.y, along = rx * dx + ry * dy;
      if (along <= 0.1 || along >= bd) continue;
      if (Math.abs(rx * dy - ry * dx) < 0.22) { best = pt; bd = along; kind = 'p'; }
    }
    if (kind === 'e') { anyHit = true; if (hurtEnemy(best, wp.dmg * (bd < 2 && wp.id === 'shotgun' ? 1.3 : 1), P.x + dx * bd, P.y + dy * bd)) killed = true; }
    else if (kind === 'p') breakPot(best);
    else if (wall.dist < 30) { // kulnedslag på väggen
      const hx = P.x + dx * (wall.dist - 0.04), hy = P.y + dy * (wall.dist - 0.04);
      if (p < 3) spawnImpact(hx, hy, rnd(0.25, 0.7));
      if (p === 0 && Math.random() < 0.5) play('ricochet', 0.25, rnd(0.8, 1.3), { x: hx, y: hy });
    }
  }
  if (anyHit) { hitMark = 0.15; hitKill = killed; }
  WS.spread = Math.min(0.06, WS.spread + wp.spread * 0.7 + (wp.id === 'shotgun' ? 0.02 : 0.004));
  if (P.mags[P.weapon] === 0 && P.ammo[wp.ammo] > 0) setTimeout(() => { if (WS.state === 'idle' && P.mags[P.weapon] === 0) startReload(); }, wp.delay * 1000 + 120);
}
function startReload() {
  const wp = WEAPONS[P.weapon];
  if (WS.state !== 'idle' || P.mags[P.weapon] >= wp.mag || P.ammo[wp.ammo] <= 0) return;
  WS.state = 'reload'; WS.t = 0; WS.aim = 0;
  if (wp.shellReload) WS.shellPhase = 'start';
  else play('reload', 0.6, 1.0);
}
function finishReload() {
  const wp = WEAPONS[P.weapon], need = wp.mag - P.mags[P.weapon], take = Math.min(need, P.ammo[wp.ammo]);
  P.mags[P.weapon] += take; P.ammo[wp.ammo] -= take;
}
function switchWeapon(n) {
  if (n === P.weapon || !P.has[n] || state !== 'play') return;
  WS.next = n; WS.state = 'holster'; WS.t = 0; WS.aim = 0; play('weapon', 0.25, 1.6);
}
function autoSwitch() {
  for (const i of [1, 2, 3, 0]) { const w = WEAPONS[i]; if (P.has[i] && i !== P.weapon && (P.mags[i] > 0 || P.ammo[w.ammo] > 0)) { switchWeapon(i); return; } }
}
function hurtEnemy(e, dmg, hx, hy) {
  e.hp -= dmg; e.flash = 0.12; alertEnemy(e, true);
  play('splat', 0.35, rnd(0.9, 1.2), { x: e.x, y: e.y });
  for (let i = 0; i < 2; i++) spawnBlood(hx ?? e.x, hy ?? e.y);
  if (e.hp <= 0) {
    e.dead = true; e.t = 0; e.state = 'dead'; kills++; score += e.d.score;
    play('gore', 0.5, rnd(0.9, 1.2), { x: e.x, y: e.y }); play('pain', 0.45, e.type === 'V' ? 1.2 : 0.8, { x: e.x, y: e.y });
    for (let i = 0; i < 5; i++) spawnBlood(e.x, e.y);
    const r = Math.random();
    if (r < 0.28) dropItem('ammo', e.x, e.y); else if (r < 0.4) dropItem('health', e.x, e.y);
    if (kills === totalEnemies) { say('ALLA FIENDER DÖDA – GRINDEN ÄR ÖPPEN', 4); for (const k in doors) if (doors[k].gate) { doors[k].target = 1; play('gate', 0.7, 1, { x: doors[k].x + 0.5, y: doors[k].y + 0.5 }); } }
    return true;
  }
  if (Math.random() < 0.55 && e.state !== 'attack') { e.state = 'pain'; e.t = 0; }
  return false;
}
function dropItem(type, x, y) { items.push({ type, x: x + rnd(-0.15, 0.15), y: y + rnd(-0.15, 0.15), taken: false, drop: true }); }
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
  const p = { x, y, z: z - 0.08, vx: 0, vy: 0, vz: 0, life: 0.25, maxLife: 0.25, frames: fx.hit, img: fx.hit[0], size: 0.16, add: true };
  particles.push(p);
}
function hurtPlayer(d, fx0, fy0) {
  if (params.has('god') || state !== 'play') return;
  d *= diff().dmg;
  const absorbed = Math.min(P.armor, d * 0.5); P.armor -= absorbed; d -= absorbed;
  P.hp -= d; P.hurt = 0.35; P.shake = Math.max(P.shake, 1.2);
  play('hurt', 0.8, rnd(0.9, 1.1));
  if (fx0 !== undefined) hurtDir.push({ ang: Math.atan2(fy0 - P.y, fx0 - P.x), t: 1 });
  if (P.hp <= 0) {
    state = 'dead'; P.hp = 0; P.deadT = 0; play('lose', 0.8);
    if (ambient) { ambient.s.stop(); ambient = null; }
    if (breathSnd) { breathSnd.s.stop(); breathSnd = null; }
  }
}
function useKey() {
  for (const dist of [0.6, 1.0, 1.4]) {
    const nx = P.x + Math.cos(P.a) * dist, ny = P.y + Math.sin(P.a) * dist;
    const d = doorAt(nx, ny);
    if (!d || !isDoorChar(cellAt(nx, ny))) continue;
    if (d.secret) {
      if (d.target) return;
      d.target = 1; secrets++; score += 250; play('secret', 0.8); say('DU HITTADE ETT HEMLIGT RUM!', 3); return;
    }
    if (d.gate && kills < totalEnemies) { say(`GRINDEN ÄR LÅST – ${totalEnemies - kills} FIENDER KVAR`, 2.5); play('click', 0.6, 0.6); return; }
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
  if (!e.alert) { e.alert = true; if (Math.random() < 0.7) play(e.d.growl, 0.5, rnd(0.9, 1.1), { x: e.x, y: e.y }); }
  if (spread) for (const o of ents) if (o !== e && !o.dead && !o.alert && Math.hypot(o.x - e.x, o.y - e.y) < 6 && hasLOS(o.x, o.y, e.x, e.y)) alertEnemy(o, false);
}

// ---------- Vägsökning: avståndsfält (BFS) från spelaren ----------
function walkableForEnemy(x, y) { const c = map[y][x]; return !isWallChar(c) && c !== 'f' && c !== '*' && !(c === 'G' && doors[x + ',' + y].open < 0.85); }
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
  P.hurt = Math.max(0, P.hurt - dt); P.pick = Math.max(0, P.pick - dt * 2); P.flash = Math.max(0, P.flash - dt); P.shake = Math.max(0, P.shake - dt * 5);
  hitMark = Math.max(0, hitMark - dt);
  for (const h of hurtDir) h.t -= dt * 1.2;
  hurtDir = hurtDir.filter(h => h.t > 0);
  updateParticles(dt);
  if (state === 'dead') { P.deadT += dt; P.camZ = Math.max(0.12, 0.5 - P.deadT * 0.8); return; }
  if (state !== 'play') return;
  levelTime += dt;
  // tangentvridning
  const turn = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
  P.a += turn * 2.4 * dt * (1 - WS.aim * 0.4);
  // mjuk rörelse med acceleration och friktion
  const fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const str = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const run = keys.ShiftLeft || keys.ShiftRight;
  const maxSp = (run && WS.aim < 0.5 ? 4.7 : 3.1) * (1 - WS.aim * 0.4);
  let tx = 0, ty = 0;
  if (fwd || str) { const l = Math.hypot(fwd, str); tx = (Math.cos(P.a) * fwd - Math.sin(P.a) * str) / l * maxSp; ty = (Math.sin(P.a) * fwd + Math.cos(P.a) * str) / l * maxSp; }
  const k = Math.min(1, dt * (fwd || str ? 10 : 12));
  P.vx += (tx - P.vx) * k; P.vy += (ty - P.vy) * k;
  tryMove(P, P.vx * dt, P.vy * dt, 0.24);
  for (const e of ents) if (!e.dead) pushOut(P, e.x, e.y, 0.55);
  for (const pt of pots) if (!pt.broken) pushOut(P, pt.x, pt.y, 0.45);
  const speed = Math.hypot(P.vx, P.vy);
  P.bobAmp += (clamp(speed / 3.1, 0, 1.4) - P.bobAmp) * Math.min(1, dt * 8);
  P.bob += dt * (4 + speed * 2.2);
  if (speed > 0.8) { stepT -= dt * speed / 3.1; if (stepT <= 0) { play('steps', 0.1, rnd(1.5, 1.8)); stepT = 0.42; } }
  // dörrar
  for (const key in doors) { const d = doors[key]; if (d.target === 0 && d.open > 0 && occupied(d)) d.target = 1; d.open += Math.sign(d.target - d.open) * Math.min(Math.abs(d.target - d.open), dt * (d.secret ? 0.6 : 1.4)); }
  updateFlow();
  updateWeapon(dt);
  // föremål
  for (const it of items) {
    if (it.taken || Math.hypot(it.x - P.x, it.y - P.y) > 0.55) continue;
    if (!pickUp(it)) continue;
    it.taken = true; P.pick = 1; score += 25; if (!it.drop) itemsTaken++;
  }
  // utgång
  if (lvl.exit && Math.floor(P.x) === lvl.exit.x && Math.floor(P.y) === lvl.exit.y) levelDone();
  for (const e of ents) updateEnemy(e, dt);
  updateProjectiles(dt);
  // andning vid låg hälsa
  if (P.hp < 30 && !breathSnd && actx) breathSnd = play('breath', 0.35, 1, { loop: true });
  if (P.hp >= 30 && breathSnd) { breathSnd.s.stop(); breathSnd = null; }
}
function pickUp(it) {
  const am = diff().ammo;
  if (it.type === 'health') { if (P.hp >= 100) return false; P.hp = Math.min(100, P.hp + 30); say('+30 HÄLSA', 1.5); play('health', 0.7); }
  else if (it.type === 'armor') { if (P.armor >= 100) return false; P.armor = Math.min(100, P.armor + 50); say('+50 RUSTNING', 1.5); play('armor', 0.7); }
  else if (it.type === 'ammo') {
    const full = Object.keys(AMMO).every(k => P.ammo[k] >= AMMO[k].max);
    if (full) return false;
    const add = { p9: Math.round(18 * am), r556: Math.round((P.has[2] ? 20 : 8) * am), shells: Math.round((P.has[1] ? 6 : 3) * am) };
    for (const k in add) P.ammo[k] = Math.min(AMMO[k].max, P.ammo[k] + add[k]);
    say(`AMMO +${add.p9} 9MM +${add.r556} 5.56 +${add.shells} PATR`, 2); play('pickup', 0.7);
  } else {
    const i = { shotgun: 1, rifle: 2, smg: 3 }[it.type], w = WEAPONS[i];
    const first = !P.has[i];
    P.has[i] = true;
    if (first) P.mags[i] = w.mag;
    P.ammo[w.ammo] = Math.min(AMMO[w.ammo].max, P.ammo[w.ammo] + (i === 1 ? 8 : 30));
    say('DU HITTADE: ' + w.name, 2.5); play('weapon', 0.8);
    if (first) switchWeapon(i);
  }
  return true;
}
function updateWeapon(dt) {
  const wp = WEAPONS[P.weapon];
  WS.t += dt; WS.shot += dt; WS.cd -= dt;
  WS.spread = Math.max(0, WS.spread - dt * 0.12) ;
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
          if (P.mags[P.weapon] >= wp.mag || P.ammo.shells <= 0) WS.shellPhase = 'end';
        } else { WS.state = 'idle'; play('reload', 0.45, 1.4); }
      }
    } else {
      const dur = WF[wp.id].dur.reload;
      if (!WS.loaded && WS.t >= dur * 0.65) { WS.loaded = true; finishReload(); play('click', 0.5, 0.9); }
      if (WS.t >= dur) { WS.state = 'idle'; WS.loaded = false; }
    }
  }
  if (WS.state !== 'reload') WS.loaded = false;
  const trig = mouseDown || keys.ControlLeft || keys.KeyF;
  if (trig && (wp.auto || !fireHeld)) fire();
  fireHeld = trig;
}
function updateEnemy(e, dt) {
  e.t += dt; e.flash = Math.max(0, e.flash - dt);
  if (e.dead) return;
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
  let want = !(los && !e.d.melee && dist < e.d.range * 0.6) && dist > 0.75;
  if (!want) return;
  const sp = e.d.speed * diff().speed * dt;
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
  if (Math.hypot(e.x - ox, e.y - oy) < sp * 0.3) { tryMove(e, Math.cos(ang + 1.2) * sp, Math.sin(ang + 1.2) * sp, 0.28); }
  for (const o of ents) if (o !== e && !o.dead) pushOut(e, o.x, o.y, 0.55);
  e.mvx = e.x - ox; e.mvy = e.y - oy;
}
function enemyStrike(e, dist) {
  if (e.d.melee) { if (dist < e.d.range + 0.35) { hurtPlayer(e.d.dmg, e.x, e.y); play('splat', 0.5, 0.7); } else play('whoosh', 0.4, 1.2, { x: e.x, y: e.y }); }
  else { // eldklot som går att undvika
    const lead = 0.25, tx = P.x + P.vx * lead, ty = P.y + P.vy * lead, a = Math.atan2(ty - e.y, tx - e.x) + rnd(-0.05, 0.05);
    projectiles.push({ x: e.x + Math.cos(a) * 0.4, y: e.y + Math.sin(a) * 0.4, z: 0.55, vx: Math.cos(a) * 5.2, vy: Math.sin(a) * 5.2, dmg: e.d.dmg, src: e });
    play('whoosh', 0.6, 0.8, { x: e.x, y: e.y });
  }
}
function updateProjectiles(dt) {
  for (const p of projectiles) {
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (Math.hypot(p.x - P.x, p.y - P.y) < 0.35) { hurtPlayer(p.dmg, p.src.x, p.src.y); p.dead = true; }
    else if (solid(p.x, p.y)) p.dead = true;
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
  if (particles.length > 160) particles.splice(0, particles.length - 160);
}

// ---------- Banslut, statistik och sparat framsteg ----------
let stats = null;
function levelDone() {
  const bonus = Math.round(500 + (kills === totalEnemies ? 250 : 0) + secrets * 100 + Math.max(0, 120 - levelTime) * 3);
  score += bonus;
  stats = { name: lvl.name, kills, totalEnemies, secrets, totalSecrets, items: itemsTaken, totalItems, time: levelTime, bonus, last: level + 1 >= LEVELS.length };
  state = 'stats'; msgs.length = 0; play('win', 0.7);
  mouseDown = false; aimDown = false;
  if (document.pointerLockElement) document.exitPointerLock();
  if (stats.last) { saveBest(); store.del('progress'); }
  else saveProgress(level + 1);
}
function nextLevel() {
  if (!stats) return;
  if (stats.last) { stats = null; state = 'win'; return; }
  stats = null; startLevel(level + 1, true);
}
function saveProgress(n) {
  store.set('progress', { level: n, hp: P.hp, armor: P.armor, has: P.has, ammo: P.ammo, mags: P.mags, weapon: P.weapon, score, diff: settings.diff });
}
function saveBest() { const b = store.get('best', 0); if (score > b) store.set('best', score); }
const fmtTime = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// ---------- Huvudloop ----------
let last = 0;
function loop(t) {
  const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
  if (map && state !== 'title') {
    if (state !== 'pause') update(dt);
    updateLight(); render(); drawWeapon(); drawHUD();
    if (state === 'dead') overlay('DU DOG', ['KLICKA ELLER TRYCK ENTER', 'FÖR ATT BÖRJA OM BANAN'], '#a00000');
    if (state === 'win') { overlay('DU KLARADE DET!', [`POÄNG ${score}`, `REKORD ${store.get('best', score)}`, 'KLICKA FÖR ATT SPELA IGEN'], '#206020'); }
    if (state === 'pause') overlay('PAUS', ['KLICKA FÖR ATT FORTSÄTTA', `KÄNSLIGHET ${settings.sens.toFixed(1)}  [ ]`, `VOLYM ${Math.round(settings.vol * 100)}%  - +`, `SVÅRIGHET ${DIFF[settings.diff].name}`], '#202040');
    if (state === 'stats') drawStats();
  }
  requestAnimationFrame(loop);
}
function overlay(t1, lines, col) {
  ctx.fillStyle = col + 'b0'; ctx.fillRect(0, 0, W, VH);
  ctx.font = '16px "PressStart2P"'; ctx.textBaseline = 'top';
  const w = ctx.measureText(plain(t1)).width; txt(t1, (W - w) / 2, 34, '#fff', 2);
  lines.forEach((s, i) => { txt(s, (W - textW(s)) / 2, 72 + i * 14, i ? '#e0c890' : '#ffe9a8'); });
}
function drawStats() {
  const s = stats;
  ctx.fillStyle = '#100a08e0'; ctx.fillRect(0, 0, W, VH);
  const head = `${s.name} KLARAD`; txt(head, (W - textW(head)) / 2, 18, '#ffd24a');
  const rows = [['FIENDER', `${s.kills}/${s.totalEnemies}`], ['HEMLIGHETER', `${s.secrets}/${s.totalSecrets}`], ['FÖREMÅL', `${s.items}/${s.totalItems}`], ['TID', fmtTime(s.time)], ['BONUS', `+${s.bonus}`], ['POÄNG', String(score)]];
  rows.forEach(([k, v], i) => { const y = 44 + i * 15; txt(k, 70, y, '#c9a87a'); txt(v, 250 - textW(v), y, '#e8d9b0'); });
  const f = s.last ? 'KLICKA FÖR SLUTET' : 'KLICKA FÖR NÄSTA BANA'; if (tmr % 1 < 0.7) txt(f, (W - textW(f)) / 2, 142, '#ffe9a8');
}
function restartLevel() {
  const p = store.get('progress', null);
  if (p && p.level === level) loadProgress(p); else resetPlayer();
  startLevel(level, true); P.hp = Math.max(P.hp, 100);
}
function resetPlayer() {
  P.has = [true, false, false, false]; P.weapon = 0; P.ammo = { p9: 36, r556: 0, shells: 0 }; P.mags = [9, 0, 0, 0]; P.hp = 100; P.armor = 0; score = 0;
}
function loadProgress(p) {
  P.has = p.has.slice(); P.ammo = Object.assign({}, p.ammo); P.mags = p.mags.slice(); P.weapon = p.weapon; P.hp = p.hp; P.armor = p.armor; score = p.score;
}

// ---------- Indata ----------
function begin(cont) {
  const t = document.getElementById('title'); t.hidden = true;
  canvas.focus();
  if (!actx) loadSounds().then(() => { if (state === 'play' && !ambient) startAmbient(); });
  else if (actx.state === 'suspended') actx.resume();
  const p = store.get('progress', null);
  if (cont && p) { settings.diff = p.diff ?? settings.diff; loadProgress(p); startLevel(p.level, true); }
  else { resetPlayer(); startLevel(params.get('level') ? clamp(+params.get('level') - 1, 0, LEVELS.length - 1) : 0, false); }
  if (params.get('level') && !cont) { // testläge: ge vapen för senare banor
    const n = +params.get('level') - 1;
    for (let i = 1; i <= Math.min(3, n); i++) { P.has[i] = true; P.mags[i] = WEAPONS[i].mag; }
    P.ammo = { p9: 80, r556: 60, shells: 16 };
  }
  lockPointer();
}
function lockPointer() { if (!params.has('nolock') && document.pointerLockElement !== canvas && canvas.requestPointerLock) { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* pekarlås valfritt */ } } }
function pause() { if (state === 'play') { state = 'pause'; mouseDown = false; aimDown = false; for (const k in keys) keys[k] = false; if (actx) actx.suspend(); } }
function resume() { if (state === 'pause') { state = 'play'; if (actx) actx.resume(); lockPointer(); } }
addEventListener('keydown', e => {
  if (state === 'title') { if (e.code === 'Enter' && !document.getElementById('start').disabled) begin(false); return; }
  if (e.code === 'Escape' || e.code === 'KeyP') { if (state === 'play') pause(); else if (state === 'pause' && e.code === 'KeyP') resume(); return; }
  keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
  if (e.code === 'BracketLeft' || e.code === 'BracketRight') { settings.sens = clamp(settings.sens + (e.code === 'BracketLeft' ? -0.1 : 0.1), 0.2, 3); saveSettings(); say(`MUSKÄNSLIGHET ${settings.sens.toFixed(1)}`, 1.2); }
  if (e.code === 'Minus' || e.code === 'Equal') { settings.vol = clamp(settings.vol + (e.code === 'Minus' ? -0.1 : 0.1), 0, 1); saveSettings(); applyVolume(); say(`VOLYM ${Math.round(settings.vol * 100)}%`, 1.2); }
  if (e.code === 'KeyN') { settings.muted = !settings.muted; saveSettings(); applyVolume(); say(settings.muted ? 'LJUD AV' : 'LJUD PÅ', 1); }
  if (e.code === 'KeyO') { const el = document.documentElement; if (document.fullscreenElement) document.exitFullscreen(); else if (el.requestFullscreen) el.requestFullscreen().catch(() => {}); }
  if (state === 'play') {
    if (e.code === 'KeyE' || e.code === 'Space') useKey();
    if (e.code === 'KeyR') startReload();
    if (e.code === 'KeyM' || e.code === 'Tab') showMap = !showMap;
    const n = e.code.startsWith('Digit') ? +e.code.slice(5) - 1 : -1;
    if (n >= 0 && n < 4) switchWeapon(n);
    if (e.code === 'KeyQ') cycleWeapon(1);
  } else if (e.code === 'Enter' || e.code === 'Space') {
    if (state === 'dead') restartLevel(); else if (state === 'win') begin(false); else if (state === 'stats') nextLevel();
  }
});
addEventListener('keyup', e => { keys[e.code] = false; });
function cycleWeapon(d) { for (let i = 1; i <= 4; i++) { const n = ((WS.next >= 0 && WS.state === 'holster' ? WS.next : P.weapon) + d * i + 8) % 4; if (P.has[n]) { switchWeapon(n); break; } } }
canvas.addEventListener('mousedown', e => {
  if (state === 'dead') return restartLevel();
  if (state === 'win') return begin(false);
  if (state === 'stats') return nextLevel();
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

// ---------- Startskärm ----------
function setupTitle() {
  const diffBox = document.getElementById('diff');
  const draw = () => { diffBox.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.d === settings.diff))); };
  DIFF.forEach((d, i) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.d = i; b.textContent = d.name; b.onclick = () => { settings.diff = i; saveSettings(); draw(); }; diffBox.appendChild(b); });
  draw();
  const p = store.get('progress', null), cont = document.getElementById('continue');
  if (p && p.level > 0) { cont.hidden = false; cont.textContent = `FORTSÄTT (BANA ${p.level + 1})`; cont.onclick = () => begin(true); }
  const best = store.get('best', 0); if (best) document.getElementById('best').textContent = `REKORD: ${best} POÄNG`;
}
(async () => {
  const st = document.getElementById('status');
  try {
    await loadAll(t => { st.textContent = t; });
    st.textContent = 'KLICKA START';
    document.getElementById('start').disabled = false;
  } catch (e) { st.textContent = 'FEL: ' + e.message; console.error(e); }
  setupTitle();
  requestAnimationFrame(loop);
  window.__game = { P, WS, ents: () => ents, items: () => items, pots: () => pots, state: () => state, level: () => level, kills: () => kills, begin, startLevel, doors: () => doors,
    fire, useKey, startReload, switchWeapon, levelDone, light: () => light, lvl: () => lvl, nextLevel, projectiles: () => projectiles, particles: () => particles, secrets: () => secrets, keys, setMouse: (d, aim) => { mouseDown = d; aimDown = !!aim; }, pause, resume, hurtPlayer };
  if (params.has('autostart')) begin(false);
})();
document.getElementById('start').addEventListener('click', () => begin(false));
})();
