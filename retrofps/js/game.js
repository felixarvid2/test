'use strict';
// Retro-FPS: raycaster i Wolfenstein/Doom-anda med assets från repots assets/ och release assets-large-v1.
(() => {
const W = 320, H = 200, HUD_H = 34, VH = H - HUD_H, HORIZON = VH >> 1;
const FOV_PLANE = 0.75;
const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');
canvas.width = W; canvas.height = H;
ctx.imageSmoothingEnabled = false;
const frame = ctx.createImageData(W, VH);
const px = new Uint32Array(frame.data.buffer);
const zbuf = new Float32Array(W);
const params = new URLSearchParams(location.search);

// ---------- Asset-laddning ----------
const A = 'assets/';
const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('saknas: ' + src)); i.src = src; });
function pixels(img, w = img.width, h = img.height, sx = 0, sy = 0, sw = w, sh = h, flip = false) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (flip) { g.translate(w, 0); g.scale(-1, 1); }
  g.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  return { w, h, data: new Uint32Array(g.getImageData(0, 0, w, h).data.buffer) };
}
function scaled(img, w) { // förminskad version (mjuk) för vapen-HUD
  const h = Math.round(img.height * w / img.width);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, w, h); return c;
}
const tex = {}, spr = {}, weaponImg = {}, snd = {}, enemyFrames = {};
let actx = null;
const ENEMY_DEFS = {
  S: { sheet: 'skeleton1', frames: { idle: 6, move: 10, attack: 9, pain: 5, death: 17 }, files: { move: 'movement' }, hp: 5, speed: 1.3, melee: true, dmg: 9, range: 0.95, cd: 0.9, size: 1.0, growl: 'growl', score: 100 },
  K: { sheet: 'skeleton2', frames: { idle: 6, move: 10, attack: 15, pain: 5, death: 15 }, files: { move: 'movemen' }, hp: 6, speed: 0.9, melee: false, dmg: 7, range: 7.5, cd: 1.6, size: 1.05, growl: 'hiss', score: 150 },
  V: { sheet: 'vampire', frames: { idle: 6, move: 8, attack: 16, pain: 5, death: 14 }, files: { move: 'movement' }, hp: 9, speed: 2.1, melee: true, dmg: 14, range: 0.95, cd: 0.7, size: 1.1, growl: 'roar', score: 250 },
};
async function loadAll(setStatus) {
  const walls = ['wall_brick_stone_center', 'wall_brick_small_stone', 'wall_rock', 'wall_stone', 'wall_brick_stone_center_banner', 'door_metal_gate', 'door_wood'];
  const floors = ['floor_stone', 'floor_stone_pattern', 'floor_wood_planks'];
  for (const n of walls.concat(floors)) tex[n] = pixels(await load(A + 'wall/' + n + '.png'));
  // fönster/ banér används som variant 5
  for (const [k, d] of Object.entries(ENEMY_DEFS)) {
    const sets = {};
    for (const st of Object.keys(d.frames)) {
      const file = st === 'move' ? d.files.move : st === 'pain' ? 'take_damage' : st;
      const img = await load(`${A}gfx/enemies-${d.sheet}_${file}.png`);
      const n = Math.floor(img.width / 32);
      sets[st] = [];
      for (let i = 0; i < n; i++) sets[st].push(pixels(img, 32, 32, i * 32, 0, 32, 32));
    }
    enemyFrames[k] = sets;
  }
  setStatus && setStatus('Laddar vapen…');
  for (const n of ['pistol', 'shotgun', 'rifle', 'smg']) {
    const img = await load(`${A}gfx/sp_${n}.png`);
    weaponImg[n] = img;
    spr['pick_' + n] = pixels(img, 32, Math.max(1, Math.round(32 * img.height / img.width)));
  }
  weaponImg.flash = await load(A + 'gfx/MuzzleFlash.png');
  spr.health = pixels(await load(A + 'gfx/health.png'));
  spr.ammo = pixels(await load(A + 'gfx/ammo.png'));
  await document.fonts.load('8px "PressStart2P"');
}
async function loadSounds() {
  actx = new (window.AudioContext || window.webkitAudioContext)();
  const names = ['shot', 'boom', 'pickup', 'health', 'hurt', 'splat', 'weapon', 'lose', 'win', 'growl', 'hiss', 'pain', 'roar', 'gore', 'drone', 'door', 'steps'];
  await Promise.all(names.map(async n => {
    try { const r = await fetch(`${A}snd/${n}.ogg`); snd[n] = await actx.decodeAudioData(await r.arrayBuffer()); } catch (e) { /* ljud är valfritt */ }
  }));
}
function play(name, vol = 1, rate = 1, loop = false) {
  if (!actx || !snd[name] || muted) return null;
  const s = actx.createBufferSource(); s.buffer = snd[name]; s.playbackRate.value = rate; s.loop = loop;
  const g = actx.createGain(); g.gain.value = vol; s.connect(g).connect(actx.destination); s.start();
  return { s, g };
}
let muted = false;

// ---------- Vapen ----------
const WEAPONS = [
  { id: 'pistol', name: 'PISTOL', ammo: 'bullets', cost: 1, dmg: 2, pellets: 1, spread: 0.01, delay: 0.32, auto: false, sound: ['shot', 1.15], w: 58, drop: 8, muzzle: [0.3, 0.02], flash: 0.9 },
  { id: 'shotgun', name: 'SHOTGUN', ammo: 'shells', cost: 1, dmg: 1.6, pellets: 8, spread: 0.075, delay: 0.95, auto: false, sound: ['boom', 0.8], w: 190, drop: 40, muzzle: [0.03, 0.03], flash: 1.5 },
  { id: 'rifle', name: 'GEVÄR', ammo: 'bullets', cost: 1, dmg: 2.4, pellets: 1, spread: 0.012, delay: 0.17, auto: true, sound: ['shot', 0.85], w: 180, drop: 30, muzzle: [0.02, 0.4], flash: 1.1 },
  { id: 'smg', name: 'KPIST', ammo: 'bullets', cost: 1, dmg: 1.4, pellets: 1, spread: 0.04, delay: 0.09, auto: true, sound: ['shot', 1.45], w: 160, drop: 20, muzzle: [0.04, 0.5], flash: 0.8 },
];
const weaponCanvas = {};

// ---------- Spelstate ----------
const P = { x: 2, y: 2, a: 0, hp: 100, bullets: 40, shells: 0, weapon: 0, has: [true, false, false, false], cd: 0, kick: 0, flash: 0, bob: 0, hurt: 0, pick: 0 };
let map, mw, mh, doors, ents, items, level = 0, lvl, totalEnemies, kills, state = 'title', msg = '', msgT = 0, tmr = 0, score = 0, showMap = false;
const keys = {};
let mouseDown = false;

const plain = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function say(t, d = 2.5) { msg = plain(t); msgT = d; }

function startLevel(n, keep) {
  level = n; lvl = LEVELS[n];
  map = lvl.map.map(r => r.split('')); mh = map.length; mw = map[0].length;
  doors = {}; ents = []; items = []; kills = 0; totalEnemies = 0;
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    const c = map[y][x], cx = x + 0.5, cy = y + 0.5;
    if (c === 'P') { P.x = cx; P.y = cy; P.a = 0; map[y][x] = '.'; }
    else if (ENEMY_DEFS[c]) { ents.push(makeEnemy(c, cx, cy)); totalEnemies++; map[y][x] = '.'; }
    else if (c === 'h' || c === 'a') { items.push({ type: c === 'h' ? 'health' : 'ammo', x: cx, y: cy, taken: false }); map[y][x] = '.'; }
    else if (c === 'g' || c === 'r' || c === 'm') { items.push({ type: { g: 'shotgun', r: 'rifle', m: 'smg' }[c], x: cx, y: cy, taken: false }); map[y][x] = '.'; }
    else if (c === 'D' || c === 'G') { doors[x + ',' + y] = { open: 0, target: 0, gate: c === 'G' }; }
    else if (c === 'x') { map[y][x] = '.'; lvl.exit = { x, y }; }
  }
  if (!keep) { P.hp = 100; P.bullets = Math.max(P.bullets, 30); }
  else { P.hp = Math.min(100, P.hp + 25); P.bullets = Math.max(P.bullets, 30); }
  P.cd = 0; P.kick = 0;
  state = 'play';
  say(`BANA ${n + 1}: ${lvl.name}`, 3);
  if (!ambient) startAmbient();
}
let ambient = null;
function startAmbient() { ambient = play('drone', 0.35, 1, true); }

function makeEnemy(type, x, y) {
  const d = ENEMY_DEFS[type];
  return { type, d, x, y, hp: d.hp, state: 'idle', t: Math.random() * 3, cd: 1, alert: false, flip: false, dead: false, fi: 0, hitT: 0, growlT: 2 + Math.random() * 4, vx: 0 };
}

// ---------- Kollision / kartfrågor ----------
function cellAt(x, y) { if (x < 0 || y < 0 || x >= mw || y >= mh) return '1'; return map[y | 0][x | 0]; }
function isWallChar(c) { return c >= '1' && c <= '5'; }
function doorAt(x, y) { return doors[(x | 0) + ',' + (y | 0)]; }
function solid(x, y) {
  const c = cellAt(x, y);
  if (isWallChar(c)) return true;
  if (c === 'D' || c === 'G') { const d = doorAt(x, y); return d.open < 0.85; }
  return false;
}
function tryMove(o, dx, dy, r) {
  const nx = o.x + dx, ny = o.y + dy;
  if (!solid(nx + Math.sign(dx) * r, o.y) && !solid(nx + Math.sign(dx) * r, o.y + r) && !solid(nx + Math.sign(dx) * r, o.y - r)) o.x = nx;
  if (!solid(o.x, ny + Math.sign(dy) * r) && !solid(o.x + r, ny + Math.sign(dy) * r) && !solid(o.x - r, ny + Math.sign(dy) * r)) o.y = ny;
}
// Raycast i rutnätet. Returnerar { dist, side, cell, wx (0..1 along wall), door }
function cast(ox, oy, dx, dy, maxD = 40) {
  let mx = ox | 0, my = oy | 0;
  const ddx = Math.abs(1 / (dx || 1e-9)), ddy = Math.abs(1 / (dy || 1e-9));
  let sx, sy, sdx, sdy;
  if (dx < 0) { sx = -1; sdx = (ox - mx) * ddx; } else { sx = 1; sdx = (mx + 1 - ox) * ddx; }
  if (dy < 0) { sy = -1; sdy = (oy - my) * ddy; } else { sy = 1; sdy = (my + 1 - oy) * ddy; }
  let side = 0, dist = 0;
  for (let i = 0; i < 64; i++) {
    if (sdx < sdy) { dist = sdx; sdx += ddx; mx += sx; side = 0; } else { dist = sdy; sdy += ddy; my += sy; side = 1; }
    if (dist > maxD) return { dist: maxD, side, cell: '1', wx: 0 };
    if (mx < 0 || my < 0 || mx >= mw || my >= mh) return { dist, side, cell: '1', wx: 0 };
    const c = map[my][mx];
    if (isWallChar(c)) { return { dist, side, cell: c, wx: wallX(ox, oy, dx, dy, dist, side), mx, my }; }
    if (c === 'D' || c === 'G') {
      const d = doors[mx + ',' + my];
      if (d.open >= 0.999) continue;
      const wx = wallX(ox, oy, dx, dy, dist, side);
      if (wx < d.open) continue; // dörren har glidit undan här
      return { dist, side, cell: c, wx: wx - d.open, mx, my, door: d };
    }
  }
  return { dist: maxD, side, cell: '1', wx: 0 };
}
function wallX(ox, oy, dx, dy, dist, side) { const w = side === 0 ? oy + dist * dy : ox + dist * dx; return w - Math.floor(w); }
function hasLOS(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
  const r = cast(ax, ay, dx / d, dy / d, d + 1);
  return r.dist >= d - 0.05;
}

// ---------- Rendering ----------
function shade(c, f) { // f 0..256
  const r = ((c & 255) * f) >> 8, g = (((c >> 8) & 255) * f) >> 8, b = (((c >> 16) & 255) * f) >> 8;
  return 0xff000000 | (b << 16) | (g << 8) | r;
}
const wallTexFor = { 1: 'wall_brick_stone_center', 2: 'wall_brick_small_stone', 3: 'wall_rock', 4: 'wall_stone', 5: 'wall_brick_stone_center_banner' };
function render() {
  const dirX = Math.cos(P.a), dirY = Math.sin(P.a), plX = -dirY * FOV_PLANE, plY = dirX * FOV_PLANE;
  const fl = tex[lvl.floor], ce = tex[lvl.ceil];
  const lightBoost = 1 + P.flash * 0.9;
  // golv och tak
  for (let y = HORIZON + 1; y < VH; y++) {
    const rowDist = VH / (2 * (y - HORIZON)), f = Math.min(256, (256 * lightBoost * 1.25 / (1 + rowDist * 0.32)) | 0);
    const x0 = P.x + (dirX - plX) * rowDist, y0 = P.y + (dirY - plY) * rowDist;
    const stx = (2 * plX * rowDist) / W, sty = (2 * plY * rowDist) / W;
    let fx = x0, fy = y0;
    const yc = VH - 1 - y;
    for (let x = 0; x < W; x++) {
      const u = ((fx - Math.floor(fx)) * 64) | 0, v = ((fy - Math.floor(fy)) * 64) | 0;
      px[y * W + x] = shade(fl.data[v * 64 + u], f);
      px[yc * W + x] = shade(ce.data[v * 64 + u], f * 0.6);
      fx += stx; fy += sty;
    }
  }
  for (let x = 0; x < W; x++) px[HORIZON * W + x] = 0xff000000;
  // väggar
  for (let x = 0; x < W; x++) {
    const camX = 2 * x / W - 1, rdx = dirX + plX * camX, rdy = dirY + plY * camX;
    const hit = cast(P.x, P.y, rdx, rdy);
    const perp = Math.max(0.05, hit.dist);
    zbuf[x] = perp;
    const lh = Math.floor(VH / perp), top = (HORIZON - lh / 2) | 0;
    const t = hit.cell === 'D' ? tex.door_wood : hit.cell === 'G' ? tex.door_metal_gate : tex[wallTexFor[hit.cell]];
    let u = (hit.wx * 64) | 0;
    if ((hit.side === 0 && rdx > 0) || (hit.side === 1 && rdy < 0)) u = 63 - u;
    let f = Math.min(256, (256 * lightBoost * 1.5 / (1 + perp * 0.38)) | 0);
    if (hit.side === 1) f = (f * 0.78) | 0;
    const y0 = Math.max(0, top), y1 = Math.min(VH - 1, top + lh - 1);
    const step = t.h / lh;
    let v = (y0 - top) * step;
    for (let y = y0; y <= y1; y++) { px[y * W + x] = shade(t.data[(v | 0) * t.w + u], f); v += step; }
  }
  // sprites (fiender + föremål), bakifrån och fram
  const list = [];
  for (const e of ents) list.push({ x: e.x, y: e.y, e });
  for (const it of items) if (!it.taken) list.push({ x: it.x, y: it.y, it });
  for (const s of list) s.d = (s.x - P.x) ** 2 + (s.y - P.y) ** 2;
  list.sort((a, b) => b.d - a.d);
  const inv = 1 / (plX * dirY - dirX * plY);
  for (const s of list) {
    const rx = s.x - P.x, ry = s.y - P.y;
    const tx = inv * (dirY * rx - dirX * ry), ty = inv * (-plY * rx + plX * ry);
    if (ty < 0.15) continue;
    let img, size, flip = false, lift = 0;
    if (s.e) {
      const e = s.e; img = enemyFrame(e); size = e.d.size * 1.15; flip = e.flip;
    } else {
      const it = s.it;
      img = it.type === 'health' ? spr.health : it.type === 'ammo' ? spr.ammo : spr['pick_' + it.type];
      size = it.type === 'health' || it.type === 'ammo' ? 0.4 : 0.35; lift = 0.04 * Math.sin(tmr * 3 + it.x);
    }
    const sh = VH / ty * size, sw = sh * img.w / img.h * (s.e ? 1 : 1);
    const cx = (W / 2) * (1 + tx / ty);
    const bottom = HORIZON + (VH / ty) / 2 - lift * VH / ty;
    const topY = bottom - sh, left = cx - sw / 2;
    const f = Math.min(256, (256 * lightBoost * 1.5 / (1 + ty * 0.38)) | 0);
    const x0 = Math.max(0, Math.floor(left)), x1 = Math.min(W - 1, Math.floor(left + sw));
    const y0 = Math.max(0, Math.floor(topY)), y1 = Math.min(VH - 1, Math.floor(bottom));
    for (let x = x0; x <= x1; x++) {
      if (ty >= zbuf[x]) continue;
      let u = Math.floor((x - left) / sw * img.w); if (flip) u = img.w - 1 - u;
      if (u < 0 || u >= img.w) continue;
      for (let y = y0; y <= y1; y++) {
        const v = Math.floor((y - topY) / sh * img.h);
        if (v < 0 || v >= img.h) continue;
        const c = img.data[v * img.w + u];
        if ((c >>> 24) < 128) continue;
        px[y * W + x] = shade(c, f);
      }
    }
  }
  ctx.putImageData(frame, 0, 0);
}
function enemyFrame(e) {
  const set = enemyFrames[e.type];
  let key = 'move', n = 0;
  if (e.dead) { key = 'death'; n = Math.min(set.death.length - 1, Math.floor(e.t * 12)); }
  else if (e.state === 'pain') { key = 'pain'; n = Math.min(set.pain.length - 1, Math.floor(e.t * 14)); }
  else if (e.state === 'attack') { key = 'attack'; n = Math.min(set.attack.length - 1, Math.floor(e.t * (e.d.melee ? 14 : 12))); }
  else if (e.state === 'idle') { key = 'idle'; n = Math.floor(tmr * 6 + e.x * 3) % set.idle.length; }
  else { n = Math.floor(e.t * 9) % set.move.length; }
  return set[key][n];
}

// ---------- HUD ----------
function drawHUD() {
  const y0 = VH;
  const g = ctx;
  // vapen i första person
  const wp = WEAPONS[P.weapon], img = weaponCanvas[wp.id];
  const bobX = Math.sin(P.bob) * 5, bobY = Math.abs(Math.cos(P.bob)) * 4;
  const kick = P.kick;
  const ww = img.width, wh = img.height;
  const gx = Math.round(W - ww - 4 + bobX + kick * 6), gy = Math.round(VH - wh + wp.drop + bobY + kick * 12);
  g.drawImage(img, gx, gy);
  if (P.flash > 0.02) {
    g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(1, P.flash * 1.6);
    const fs = 56 * wp.flash;
    g.drawImage(weaponImg.flash, gx + wp.muzzle[0] * ww - fs / 2, gy + wp.muzzle[1] * wh - fs / 2, fs, fs);
    g.restore();
  }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  // röd skadeblixt, plocka-upp-blixt
  if (P.hurt > 0) { g.fillStyle = `rgba(190,0,0,${Math.min(0.5, P.hurt * 0.6)})`; g.fillRect(0, 0, W, VH); }
  if (P.pick > 0) { g.fillStyle = `rgba(255,230,120,${P.pick * 0.25})`; g.fillRect(0, 0, W, VH); }
  // sikte
  g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(W / 2 - 1, HORIZON - 1, 2, 2);
  // nedre listan
  g.fillStyle = '#1b1410'; g.fillRect(0, y0, W, HUD_H);
  g.fillStyle = '#5a4630'; g.fillRect(0, y0, W, 1);
  g.fillStyle = '#3a2c1e'; g.fillRect(0, y0 + 1, W, 1);
  g.font = '8px "PressStart2P"'; g.textBaseline = 'top';
  txt(`HP`, 8, y0 + 5, '#c9a87a'); txt(String(Math.max(0, Math.ceil(P.hp))), 8, y0 + 17, P.hp > 35 ? '#e8d9b0' : '#ff4d3d', 2);
  txt('KULOR', 78, y0 + 5, '#c9a87a'); txt(String(P.bullets), 78, y0 + 17, '#e8d9b0', 2);
  txt('HAGEL', 148, y0 + 5, '#c9a87a'); txt(String(P.shells), 148, y0 + 17, '#e8d9b0', 2);
  txt(wp.name, 204, y0 + 5, '#c9a87a');
  txt(`${kills}/${totalEnemies}`, 204, y0 + 17, '#e8d9b0', 1);
  txt(`BANA ${level + 1}`, 268, y0 + 5, '#c9a87a');
  txt(String(score).padStart(5, '0'), 268, y0 + 17, '#e8d9b0', 1);
  for (let i = 0; i < 4; i++) { g.fillStyle = P.has[i] ? (i === P.weapon ? '#ffd24a' : '#8a7550') : '#3a2c1e'; g.fillRect(204 + i * 12, y0 + 27, 9, 3); }
  if (msgT > 0) { g.font = '8px "PressStart2P"'; const w = g.measureText(msg).width; txt(msg, (W - w) / 2, 8, '#ffe9a8', 1, true); }
  if (showMap) drawMap();
}
function txt(s, x, y, col, scale = 1, shadow = true) {
  const g = ctx; s = plain(s); g.font = `${8 * scale}px "PressStart2P"`;
  if (shadow) { g.fillStyle = '#000'; g.fillText(s, x + 1, y + 1); }
  g.fillStyle = col; g.fillText(s, x, y);
}
function drawMap() {
  const s = 4, ox = 4, oy = 18;
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(ox - 2, oy - 2, mw * s + 4, mh * s + 4);
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    const c = map[y][x];
    if (isWallChar(c)) ctx.fillStyle = '#7d7566'; else if (c === 'D') ctx.fillStyle = '#a0682a'; else if (c === 'G') ctx.fillStyle = '#b04080'; else continue;
    ctx.fillRect(ox + x * s, oy + y * s, s, s);
  }
  for (const e of ents) if (!e.dead) { ctx.fillStyle = '#ff4040'; ctx.fillRect(ox + e.x * s - 1, oy + e.y * s - 1, 3, 3); }
  ctx.fillStyle = '#4dff7a'; ctx.fillRect(ox + P.x * s - 1, oy + P.y * s - 1, 3, 3);
  ctx.fillRect(ox + (P.x + Math.cos(P.a) * 1.2) * s, oy + (P.y + Math.sin(P.a) * 1.2) * s, 1, 1);
}

// ---------- Logik ----------
function fire() {
  const wp = WEAPONS[P.weapon];
  if (P.cd > 0 || state !== 'play') return;
  if (P[wp.ammo] < wp.cost) { P.cd = 0.25; say('SLUT PÅ AMMUNITION', 1.2); play('hurt', 0.2, 2); autoSwitch(); return; }
  P[wp.ammo] -= wp.cost; P.cd = wp.delay; P.kick = 1; P.flash = 0.12;
  play(wp.sound[0], 0.9, wp.sound[1]);
  if (wp.id === 'shotgun') play('boom', 0.5, 0.55);
  // väck fiender i närheten
  for (const e of ents) if (!e.dead && Math.hypot(e.x - P.x, e.y - P.y) < 14) e.alert = true;
  for (let p = 0; p < wp.pellets; p++) {
    const a = P.a + (Math.random() - 0.5) * 2 * wp.spread;
    const dx = Math.cos(a), dy = Math.sin(a);
    const wall = cast(P.x, P.y, dx, dy).dist;
    let best = null, bd = wall;
    for (const e of ents) {
      if (e.dead) continue;
      const rx = e.x - P.x, ry = e.y - P.y, along = rx * dx + ry * dy;
      if (along <= 0.1 || along >= bd) continue;
      const perp = Math.abs(rx * dy - ry * dx);
      if (perp < 0.3 * e.d.size) { best = e; bd = along; }
    }
    if (best) hurtEnemy(best, wp.dmg);
  }
}
function autoSwitch() {
  for (let i = P.has.length - 1; i >= 0; i--) { const w = WEAPONS[i]; if (P.has[i] && P[w.ammo] >= w.cost) { P.weapon = i; return; } }
}
function hurtEnemy(e, dmg) {
  e.hp -= dmg; e.alert = true; play('splat', 0.4, 0.9 + Math.random() * 0.3);
  if (e.hp <= 0) {
    e.dead = true; e.t = 0; e.state = 'dead'; kills++; score += e.d.score;
    play('gore', 0.5, 0.9 + Math.random() * 0.3); play('pain', 0.45, e.type === 'V' ? 1.2 : 0.8);
    if (kills === totalEnemies) say('GRINDEN ÖPPNAS – GÅ TILL UTGÅNGEN', 4);
  } else if (Math.random() < 0.6 && e.state !== 'attack') { e.state = 'pain'; e.t = 0; }
}
function hurtPlayer(d) {
  if (params.has('god')) return;
  P.hp -= d; P.hurt = 0.35; play('hurt', 0.8, 0.9 + Math.random() * 0.2);
  if (P.hp <= 0 && state === 'play') { state = 'dead'; P.hp = 0; play('lose', 0.8); if (ambient) { ambient.s.stop(); ambient = null; } }
}
function useKey() {
  const cx = P.x + Math.cos(P.a) * 0.9, cy = P.y + Math.sin(P.a) * 0.9;
  for (const [nx, ny] of [[cx, cy], [P.x + Math.cos(P.a) * 0.5, P.y + Math.sin(P.a) * 0.5], [P.x + Math.cos(P.a) * 1.4, P.y + Math.sin(P.a) * 1.4]]) {
    const d = doorAt(nx, ny);
    if (d && (cellAt(nx, ny) === 'D' || cellAt(nx, ny) === 'G')) {
      if (d.gate && kills < totalEnemies) { say(`GRINDEN ÄR LÅST – ${totalEnemies - kills} KVAR`, 2.5); play('hurt', 0.4, 0.6); return; }
      d.target = d.target ? 0 : 1; play('door', 0.6, d.gate ? 0.7 : 1); return;
    }
  }
}
function update(dt) {
  tmr += dt;
  if (msgT > 0) msgT -= dt;
  P.hurt = Math.max(0, P.hurt - dt); P.pick = Math.max(0, P.pick - dt * 2); P.flash = Math.max(0, P.flash - dt); P.kick = Math.max(0, P.kick - dt * 5);
  if (state !== 'play') { if (state === 'dead') { P.a += 0; } return; }
  const turn = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
  P.a += turn * 2.4 * dt;
  let fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  let str = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const sp = (keys.ShiftLeft || keys.ShiftRight ? 4.6 : 3.1) * dt;
  if (fwd || str) {
    const l = Math.hypot(fwd, str), mx = (Math.cos(P.a) * fwd - Math.sin(P.a) * str) / l * sp, my = (Math.sin(P.a) * fwd + Math.cos(P.a) * str) / l * sp;
    tryMove(P, mx, my, 0.25);
    P.bob += dt * (keys.ShiftLeft ? 12 : 8);
    stepT -= dt; if (stepT <= 0) { play('steps', 0.12, 1.6 + Math.random() * 0.3); stepT = keys.ShiftLeft ? 0.28 : 0.4; }
  } else P.bob += (0 - Math.sin(P.bob)) * 0; // stå stilla
  // dörrar
  for (const k in doors) { const d = doors[k]; d.open += Math.sign(d.target - d.open) * Math.min(Math.abs(d.target - d.open), dt * 1.4); }
  // vapen
  P.cd = Math.max(0, P.cd - dt);
  if ((mouseDown || keys.ControlLeft || keys.KeyF) && (WEAPONS[P.weapon].auto || !fireHeld)) { fire(); fireHeld = true; }
  if (!(mouseDown || keys.ControlLeft || keys.KeyF)) fireHeld = false;
  if (WEAPONS[P.weapon].auto) fireHeld = false;
  // föremål
  for (const it of items) {
    if (it.taken || Math.hypot(it.x - P.x, it.y - P.y) > 0.55) continue;
    if (it.type === 'health') { if (P.hp >= 100) continue; P.hp = Math.min(100, P.hp + 30); say('+30 HÄLSA', 1.5); play('health', 0.7); }
    else if (it.type === 'ammo') { if (P.bullets >= 200 && P.shells >= 50) continue; P.bullets = Math.min(200, P.bullets + 24); P.shells = Math.min(50, P.shells + 6); say('+24 KULOR  +6 HAGEL', 1.5); play('pickup', 0.7); }
    else { const i = { shotgun: 1, rifle: 2, smg: 3 }[it.type]; P.has[i] = true; P.weapon = i; if (i === 1) P.shells += 10; else P.bullets += 30; say('DU HITTADE: ' + WEAPONS[i].name, 2.5); play('weapon', 0.8); }
    it.taken = true; P.pick = 1; score += 25;
  }
  // utgång
  if (lvl.exit && Math.floor(P.x) === lvl.exit.x && Math.floor(P.y) === lvl.exit.y) {
    if (level + 1 < LEVELS.length) { score += 500; play('win', 0.7); startLevel(level + 1, true); }
    else { state = 'win'; play('win', 0.8); if (ambient) { ambient.s.stop(); ambient = null; } }
  }
  for (const e of ents) updateEnemy(e, dt);
}
let stepT = 0, fireHeld = false;
function updateEnemy(e, dt) {
  e.t += dt;
  if (e.dead) return;
  const dx = P.x - e.x, dy = P.y - e.y, dist = Math.hypot(dx, dy);
  if (!e.alert && dist < 9 && hasLOS(e.x, e.y, P.x, P.y)) { e.alert = true; play(e.d.growl, 0.5, 1); }
  if (!e.alert) { e.state = 'idle'; return; }
  e.growlT -= dt; if (e.growlT <= 0) { e.growlT = 4 + Math.random() * 5; if (dist < 12) play(e.d.growl, Math.max(0.1, 0.6 - dist * 0.04), 0.9 + Math.random() * 0.3); }
  if (e.state === 'pain') { if (e.t > 5 / 14) { e.state = 'move'; e.t = 0; } return; }
  e.cd -= dt;
  if (e.state === 'attack') {
    const dur = e.d.frames.attack / (e.d.melee ? 14 : 12);
    if (!e.didHit && e.t > dur * 0.55) { e.didHit = true; enemyStrike(e, dist); }
    if (e.t > dur) { e.state = 'move'; e.t = 0; e.cd = e.d.cd; }
    return;
  }
  const los = hasLOS(e.x, e.y, P.x, P.y);
  if (los && dist < e.d.range && e.cd <= 0) { e.state = 'attack'; e.t = 0; e.didHit = false; return; }
  e.state = 'move';
  let want = (los && !e.d.melee && dist < e.d.range * 0.55) ? 0 : 1; // distansfiender stannar på avstånd
  if (dist < 0.8) want = 0;
  if (want) {
    let ang = Math.atan2(dy, dx);
    const sp = e.d.speed * dt;
    const tryDir = a => { const ox = e.x, oy = e.y; tryMove(e, Math.cos(a) * sp, Math.sin(a) * sp, 0.28); return Math.hypot(e.x - ox, e.y - oy) > sp * 0.4; };
    if (!tryDir(ang)) { if (!tryDir(ang + 0.9)) tryDir(ang - 0.9); }
    // glid isär från andra fiender
    for (const o of ents) if (o !== e && !o.dead) { const ox = e.x - o.x, oy = e.y - o.y, d = Math.hypot(ox, oy); if (d < 0.6 && d > 0.001) tryMove(e, ox / d * dt * 0.8, oy / d * dt * 0.8, 0.28); }
    if (Math.abs(dx) > 0.05) e.flip = dx < 0;
  }
}
function enemyStrike(e, dist) {
  if (e.d.melee) { if (dist < e.d.range + 0.35) { hurtPlayer(e.d.dmg); play('splat', 0.5, 0.7); } }
  else { play('hiss', 0.4, 1.4); if (hasLOS(e.x, e.y, P.x, P.y) && Math.random() < 0.55 - Math.min(0.3, dist * 0.03)) hurtPlayer(e.d.dmg); }
}

// ---------- Huvudloop ----------
let last = 0;
function loop(t) {
  const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
  if (state === 'play' || state === 'dead' || state === 'win') {
    update(dt); render(); drawHUD();
    if (state === 'dead') overlay('DU DOG', 'KLICKA / ENTER FÖR ATT FÖRSÖKA IGEN', '#a00000');
    if (state === 'win') overlay('DU KLARADE DET!', `POÄNG ${score} – KLICKA FÖR ATT SPELA IGEN`, '#206020');
  }
  requestAnimationFrame(loop);
}
function overlay(t1, t2, col) {
  ctx.fillStyle = col + 'aa'; ctx.fillRect(0, 0, W, VH);
  ctx.font = '16px "PressStart2P"'; ctx.textBaseline = 'top';
  t1 = plain(t1); t2 = plain(t2); let w = ctx.measureText(t1).width; txt(t1, (W - w) / 2, 60, '#fff', 2);
  ctx.font = '8px "PressStart2P"'; w = ctx.measureText(t2).width; txt(t2, (W - w) / 2, 110, '#ffe9a8', 1);
}
function restart(full) {
  if (full) { P.has = [true, false, false, false]; P.weapon = 0; P.bullets = 40; P.shells = 0; score = 0; }
  startLevel(full ? 0 : level, false);
}

// ---------- Indata ----------
function begin() {
  const t = document.getElementById('title'); t.style.display = 'none';
  canvas.focus();
  if (!actx) loadSounds().then(() => { if (state === 'play' && !ambient) startAmbient(); });
  else if (actx.state === 'suspended') actx.resume();
  restart(true);
  if (params.get('level')) startLevel(Math.min(LEVELS.length - 1, +params.get('level') - 1), false);
}
addEventListener('keydown', e => {
  if (e.code === 'Escape') return;
  keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (state === 'play') {
    if (e.code === 'KeyE' || e.code === 'Space') useKey();
    if (e.code === 'KeyM') showMap = !showMap;
    if (e.code === 'KeyN') { muted = !muted; if (ambient) ambient.g.gain.value = muted ? 0 : 0.35; say(muted ? 'LJUD AV' : 'LJUD PÅ', 1); }
    const n = e.code.startsWith('Digit') ? +e.code.slice(5) - 1 : -1;
    if (n >= 0 && n < 4 && P.has[n]) { P.weapon = n; P.cd = Math.max(P.cd, 0.2); play('weapon', 0.3, 1.5); }
    if (e.code === 'KeyQ') { for (let i = 1; i <= 4; i++) { const n2 = (P.weapon + i) % 4; if (P.has[n2]) { P.weapon = n2; break; } } }
  } else if ((state === 'dead' || state === 'win') && (e.code === 'Enter')) restart(state === 'win');
});
addEventListener('keyup', e => { keys[e.code] = false; });
canvas.addEventListener('mousedown', e => {
  if (state === 'dead') return restart(false);
  if (state === 'win') return restart(true);
  if (state !== 'play') return;
  if (document.pointerLockElement !== canvas && !params.has('nolock')) canvas.requestPointerLock && canvas.requestPointerLock();
  mouseDown = true;
});
addEventListener('mouseup', () => { mouseDown = false; });
addEventListener('mousemove', e => { if (document.pointerLockElement === canvas && state === 'play') P.a += e.movementX * 0.0028; });
canvas.addEventListener('wheel', e => { e.preventDefault(); const d = Math.sign(e.deltaY); for (let i = 1; i <= 4; i++) { const n = (P.weapon + d * i + 8) % 4; if (P.has[n]) { P.weapon = n; break; } } }, { passive: false });
canvas.addEventListener('contextmenu', e => e.preventDefault());

(async () => {
  const st = document.getElementById('status');
  try {
    await loadAll(t => { st.textContent = t; });
    for (const w of WEAPONS) weaponCanvas[w.id] = scaled(weaponImg[w.id], w.w);
    st.textContent = 'KLICKA FÖR ATT STARTA';
    document.getElementById('start').disabled = false;
  } catch (e) { st.textContent = 'FEL: ' + e.message; console.error(e); }
  requestAnimationFrame(loop);
  window.__game = { P, ents: () => ents, items: () => items, state: () => state, level: () => level, kills: () => kills, begin, startLevel, doors: () => doors, cast, fire, params };
  if (params.has('autostart')) begin();
})();
document.getElementById('start').addEventListener('click', begin);
addEventListener('keydown', e => { if (state === 'title' && e.code === 'Enter' && !document.getElementById('start').disabled) begin(); });
})();
