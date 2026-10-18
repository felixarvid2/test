// Generates castle.svg (384x256), slot_empty/slot_locked.svg (128), proj_*.svg (64) and fx_*.svg (64).
// Run: node tools/art/misc.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Doc, OUT, mat, mix, STONE, WOOD, GOLD, IRON, BLUE, poly, ell, circ, rect, cylD, bricks, groundShadow, star4, f,
} from './tower-lib.mjs';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../public/assets/sprites');
mkdirSync(OUT_DIR, { recursive: true });
const files = {};

// ================================================================== castle
function castle() {
  const d = new Doc(384, 256, 'ca', 8);
  const FLAG = mat('#e5534b', '#b53a3a', '#ff8a7a');
  const GROUND = 236;
  groundShadow(d, 192, GROUND + 4, 182, 15);

  const merlon = d.group(() => {
    d.shape(rect(-8, -15, 16, 15, 2), STONE, { sh: [6, 0], hi: [3, 0], sw: 5 });
  });
  const flagPole = (x, y, h = 30) => {
    d.add(`<path d="M${x} ${y}V${y - h}" stroke="${OUT}" stroke-width="6"/>`);
    d.add(`<path d="M${x} ${y - h}c10 -4 18 4 30 0v16c-12 4 -20 -4 -30 0z" fill="${FLAG.b}" stroke-width="5"/>`);
    d.fill(circ(x, y - h - 1, 5), GOLD.b, { sw: 4.5 });
  };
  const win = (x, y, w = 11, h = 20) => {
    d.add(`<path d="M${x - w / 2} ${y + h}V${y + w / 2}a${w / 2} ${w / 2} 0 0 1 ${w} 0V${y + h}Z" fill="#ffd36b" stroke-width="4.5"/>`);
    d.add(`<path d="M${x} ${y + 2}V${y + h}M${x - w / 2} ${y + h * 0.5}H${x + w / 2}" stroke="${OUT}" stroke-width="2.4"/>`);
  };
  const roof = (x, top, wb, hgt) => {
    const cone = (dx = 0, dy = 0) => `M${f(x - wb + dx)} ${f(top + dy)}L${f(x + dx)} ${f(top - hgt + dy)}L${f(x + wb + dx)} ${f(top + dy)}A${wb} ${f(wb * 0.28)} 0 0 1 ${f(x - wb + dx)} ${f(top + dy)}Z`;
    let tiles = '';
    for (let k = 1; k <= 3; k++) {
      const t = k / 4, y = top - hgt * t, w = wb * (1 - t);
      tiles += `M${f(x - w)} ${f(y)}Q${f(x)} ${f(y + w * 0.5)} ${f(x + w)} ${f(y)}`;
    }
    d.shape(cone, BLUE, { sh: [wb * 0.55, 0], hi: [wb * 0.16, 0], sw: 7,
      inner: `<path d="${tiles}" fill="none" stroke="${BLUE.s}" stroke-width="3" stroke-opacity=".8"/>` });
  };
  const tower = (x, wb, h, roofH, withFlag) => {
    const wt = wb * 0.92, top = GROUND - 4 - h;
    d.shape(cylD(x, GROUND - 4, 10, wb + 6, wb + 5), STONE, { sh: [wb * 0.5, 2], hi: [wb * 0.12, 0], sw: 6 });
    d.shape(cylD(x, GROUND - 8, h, wb, wt), STONE, {
      sh: [wb * 0.5, 3], hi: [wb * 0.16, 0], sw: 7, inner: bricks(x, GROUND - 8, h, wb, wt, 5, STONE.s),
    });
    d.shape(cylD(x, top + 10, 11, wb + 7, wb + 6), GOLD, { sh: [wb * 0.5, 2], hi: [wb * 0.1, 0], sw: 6 });
    return { top, wb };
  };

  // central keep (behind), roof, flag
  const keepX = 192, keepTop = 78;
  d.shape(cylD(keepX, 170, 100, 54, 50), STONE, { sh: [26, 3], hi: [9, 0], sw: 7, inner: bricks(keepX, 170, 100, 54, 50, 4, STONE.s) });
  d.shape(cylD(keepX, keepTop + 11, 11, 61, 60), GOLD, { sh: [30, 2], hi: [6, 0], sw: 6 });
  win(keepX - 24, 98); win(keepX + 24, 98);
  roof(keepX, keepTop - 2, 68, 50);
  flagPole(keepX, keepTop - 48, 22);

  // curtain wall between towers
  const wallTop = 148;
  for (let k = 0; k < 9; k++) {
    d.use(merlon, 60 + k * 33 - 0, wallTop + 2);
  }
  d.shape(rect(40, wallTop, 304, GROUND - wallTop - 3, 4), STONE, { sh: [0, 9], hi: [0, 5], sw: 7,
    inner: bricksFlat(40, wallTop, 304, GROUND - wallTop, 3, STONE.s) });

  // corner towers
  const corner = d.group(() => {
    const t = tower(0, 38, 112, 56);
    win(0, t.top + 34, 12, 22);
    roof(0, t.top + 5, 50, 62);
    flagPole(0, t.top - 56, 26);
  });
  d.use(corner, 60, 0);
  d.use(corner, 324, 0);

  // gatehouse (front, centred)
  const gx = 192, gw = 56, gTop = 112;
  for (let k = 0; k < 5; k++) d.use(merlon, 150 + k * 21, gTop + 2);
  d.shape(rect(136, gTop, 112, GROUND - gTop - 3, 5), STONE, { sh: [14, 0], hi: [6, 0], sw: 7,
    inner: bricksFlat(136, gTop, 112, GROUND - gTop, 3, STONE.s) });
  d.shape(rect(128, gTop - 2, 128, 12, 3), STONE, { sh: [0, 4], hi: [0, 3], sw: 6, base: STONE.h });
  // banners on the wall
  for (const bx of [106, 278]) {
    d.add(`<path d="M${bx - 11} ${wallTop + 10}h22v46l-11 -11l-11 11z" fill="${BLUE.b}" stroke-width="5"/>`);
    d.add(`<path d="M${bx - 11} ${wallTop + 20}h22v7h-22z" fill="${GOLD.b}" stroke="none"/>`);
  }
  // gate: stone arch ring, dark opening, portcullis, doors, keystone
  const gate = (o) => `M${gx - gw / 2 - o} ${GROUND - 3}V${178 + 0 - 0}a${gw / 2 + o} ${gw / 2 + o} 0 0 1 ${gw + 2 * o} 0V${GROUND - 3}Z`;
  d.shape(() => gate(10), STONE, { sh: [8, 0], hi: [4, 0], sw: 6, base: STONE.h });
  d.add(`<path d="${gate(0)}" fill="#1d1330" stroke-width="6"/>`);
  d.add(`<path d="${gate(0)}" fill="${d.linear([[0, '#4a3466', 0], [1, '#4a3466', 0.9]], 0, 0, 0, 1)}" stroke="none"/>`);
  let bars = '';
  for (let k = -2; k <= 2; k++) bars += `M${gx + k * 11} 158V190`;
  d.add(`<path d="${bars}M${gx - 25} 172H${gx + 25}" stroke="${OUT}" stroke-width="7"/><path d="${bars}M${gx - 25} 172H${gx + 25}" stroke="${IRON.h}" stroke-width="3"/>`);
  d.add(`<path d="M${gx - 28} ${GROUND - 3}V190l9 4v${GROUND - 197}z" fill="${WOOD.b}" stroke-width="4.5"/><path d="M${gx + 28} ${GROUND - 3}V190l-9 4v${GROUND - 197}z" fill="${WOOD.s}" stroke-width="4.5"/>`);
  d.add(`<path d="M${gx - 9} 142h18l-4 -16h-10z" fill="${GOLD.b}" stroke-width="5"/>`);
  d.add(`<path d="M${gx} ${gTop - 2}V${gTop - 26}" stroke="${OUT}" stroke-width="6"/>`);
  d.add(`<path d="M${gx} ${gTop - 26}c10 -4 18 4 30 0v16c-12 4 -20 -4 -30 0z" fill="${FLAG.b}" stroke-width="5"/>`);
  d.fill(circ(gx, gTop - 27, 5), GOLD.b, { sw: 4.5 });
  win(160, 132, 10, 18); win(224, 132, 10, 18);
  return d.toString();
}

/** Brick courses for a flat wall (clip content). */
function bricksFlat(x, y, w, h, rows, col) {
  let s = '';
  const rh = h / (rows + 1);
  for (let i = 1; i <= rows; i++) {
    const yy = y + i * rh;
    s += `M${x} ${f(yy)}H${x + w}`;
    const bw = 34, off = i % 2 ? 0 : bw / 2;
    for (let xx = x + off + bw; xx < x + w; xx += bw) s += `M${f(xx)} ${f(yy)}V${f(yy + rh)}`;
  }
  return `<path d="${s}" fill="none" stroke="${col}" stroke-width="2.6" stroke-opacity=".75"/>`;
}
files['castle'] = castle();

// ================================================================== slots
function slot(locked) {
  const d = new Doc(128, 128, locked ? 'sl' : 'se', 4);
  const cx = 64, cy = 58, rx = 52, ry = 33, th = 13;
  const hex = (k, ox = 0, oy = 0, s = 1) => {
    const a = (k * Math.PI) / 3;
    return [cx + ox + Math.cos(a) * rx * s, cy + oy + Math.sin(a) * ry * s];
  };
  const hexPts = (ox = 0, oy = 0, s = 1) => [0, 1, 2, 3, 4, 5].map((k) => hex(k, ox, oy, s));
  const base = locked ? mat('#5e6079', '#474963', '#7c7e99') : mat('#9a9cb5', '#74768f', '#c3c5da');
  groundShadow(d, cx, cy + th + 8, rx + 6, ry - 2);
  const top = hexPts();
  // side wall
  d.shape(poly([top[0], top[1], top[2], top[3], [top[3][0], top[3][1] + th], [top[2][0], top[2][1] + th], [top[1][0], top[1][1] + th], [top[0][0], top[0][1] + th]]),
    mat(base.s), { sh: [10, 0], sw: 4.5, base: base.s });
  d.shape(poly(top), base, { sh: [4, 4], hi: [3, 2], sw: 4.5 });
  // inset (recessed) + rim light on lower-right inner edge
  d.add(`<path d="${poly(hexPts(0, 0, 0.7))()}" fill="${base.s}" stroke="none"/>`);
  d.add(`<path d="${poly(hexPts(1.6, 2.4, 0.66))()}" fill="${mix(base.b, '#ffffff', 0.04)}" stroke="none"/>`);
  d.add(`<path d="${poly(hexPts(0, 0, 0.7))()}" fill="none" stroke="${mix(base.s, OUT, 0.5)}" stroke-width="2.4"/>`);
  let seams = '';
  for (const k of [0, 1, 2, 3, 4, 5]) {
    const [x1, y1] = hex(k, 0, 0, 0.7), [x2, y2] = hex(k, 0, 0, 0.94);
    seams += `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`;
  }
  d.add(`<path d="${seams}" fill="none" stroke="${base.s}" stroke-width="3"/>`);
  d.add(`<path d="M${f(hex(4, 0, -2, 0.86)[0])} ${f(hex(4, 0, -2, 0.86)[1])}L${f(hex(5, 0, -2, 0.86)[0])} ${f(hex(5, 0, -2, 0.86)[1])}" stroke="${base.h}" stroke-width="2.4" stroke-opacity=".9"/>`);
  if (locked) {
    d.add(`<path d="M50 62V50a14 14 0 0 1 28 0V62" fill="none" stroke="${OUT}" stroke-width="12"/><path d="M50 62V50a14 14 0 0 1 28 0V62" fill="none" stroke="#d6d9ea" stroke-width="5.5"/>`);
    d.shape(rect(40, 58, 48, 34, 7), GOLD, { sh: [8, 6], hi: [3, 3], sw: 5 });
    d.add(`<circle cx="64" cy="73" r="5.2" fill="${OUT}" stroke="none"/><path d="M64 74L61 85H67Z" fill="${OUT}" stroke-width="3"/>`);
  }
  return d.toString();
}
files['slot_empty'] = slot(false);
files['slot_locked'] = slot(true);

// ================================================================== projectiles (64x64, pointing right)
const proj = (name, fn) => {
  const d = new Doc(64, 64, `p${name.slice(0, 2)}`, 2.6);
  fn(d);
  files[`proj_${name}`] = d.toString();
};
const STEEL = mat('#b9bbd1', '#8d8fa8', '#e6e7f2');

proj('arrow', (d) => {
  d.fill(poly([[2, 32], [14, 32], [20, 21], [8, 21]]), '#5cb85c');
  d.fill(poly([[2, 32], [14, 32], [20, 43], [8, 43]]), '#3f9a45');
  d.shape(rect(8, 28.5, 42, 7, 3.5), WOOD, { sh: [0, 2.5], hi: [0, 1.5], base: WOOD.h, sw: 2.6 });
  d.shape(poly([[46, 22], [63, 32], [46, 42]]), STEEL, { sh: [3, 3], hi: [2, 1.5], sw: 2.8 });
});
proj('cannonball', (d) => {
  d.add(`<circle cx="24" cy="32" r="14" fill="#ff8a3d" fill-opacity=".35" stroke="none"/>`);
  d.shape(circ(36, 32, 19), IRON, { sh: [6, 6], hi: [3, 3], sw: 3 });
  d.add(`<ellipse cx="29" cy="25" rx="6" ry="4" transform="rotate(-35 29 25)" fill="#fff" fill-opacity=".7" stroke="none"/>`);
});
proj('frostShard', (d) => {
  const A = [62, 32], T = [34, 17], B = [34, 47], Lf = [4, 32];
  d.shape(poly([A, T, Lf, B]), mat('#7fdcff', '#4fb4e0', '#c9f3ff'), { sh: null, hi: null, sw: 3,
    inner: `<path d="${poly([A, T, Lf])()}" fill="#c9f3ff"/><path d="M62 32H4" stroke="#4fb4e0" stroke-width="2"/><path d="M${34} 26L${46} 29L${34} 31Z" fill="#fff" fill-opacity=".9"/>` });
});
proj('fireball', (d) => {
  const tail = 'M42 15C30 12 18 17 4 23C16 27 14 30 2 32C14 34 16 37 4 41C18 47 30 52 42 49Z';
  d.shape(() => tail, mat('#ff5a36', '#d93a1e', '#ff8a4a'), { sh: [0, 4], hi: [0, 3], sw: 3 });
  d.shape(circ(42, 32, 16), mat('#ff5a36', '#d93a1e', '#ff8a4a'), { sh: [4, 4], hi: [2, 2], sw: 3, base: '#ff7a3b' });
  d.add(`<circle cx="43" cy="32" r="10" fill="#ffb03b" stroke="none"/><circle cx="45" cy="31" r="5.5" fill="#ffe58a" stroke="none"/>`);
  d.add(`<path d="M30 26C22 26 14 29 10 32C16 32 24 35 30 38Z" fill="#ffb03b" stroke="none"/>`);
});
proj('poisonGlob', (d) => {
  const glob = 'M3 32Q18 21 30 17A17 17 0 1 1 30 47Q18 43 3 32Z';
  d.shape(() => glob, mat('#8be04e', '#5fb02e', '#c3f58f'), { sh: [4, 5], hi: [3, 3], sw: 3 });
  d.add(`<ellipse cx="38" cy="24" rx="7" ry="4" transform="rotate(-25 38 24)" fill="#e2ffc2" stroke="none"/>`);
  d.add(`<circle cx="44" cy="37" r="4.2" fill="#7a3fa0" stroke="none"/><circle cx="30" cy="36" r="2.6" fill="#7a3fa0" stroke="none"/>`);
  d.add(`<circle cx="22" cy="14" r="3.4" fill="#b6f07a" stroke-width="2"/>`);
});
proj('magicOrb', (d) => {
  d.add(`<circle cx="40" cy="32" r="26" fill="${d.radial([[0, '#5ef0ff', 0.6], [1, '#5ef0ff', 0]])}" stroke="none"/>`);
  d.add(star4(12, 24, 6, '#5ef0ff') + star4(6, 40, 5, '#e6fdff') + star4(20, 44, 4, '#5ef0ff'));
  d.add(`<circle cx="42" cy="32" r="16" fill="${d.radial([[0, '#ffe3fb'], [0.4, '#e05ad6'], [1, '#8c2a8a']], 0.5, 0.5, 0.55, 0.35, 0.3)}" stroke-width="3"/>`);
  d.add(star4(42, 32, 10, '#5ef0ff', 0, 0.3) + star4(42, 32, 4.5, '#fff', Math.PI / 4, 0.4));
});
proj('shard', (d) => {
  d.shape(poly([[63, 32], [34, 21], [4, 27], [8, 32], [4, 37], [34, 43]]), mat('#d4a64a', '#a07a26', '#f0cd7e'), { sh: [0, 5], hi: [0, 3], sw: 3,
    inner: `<path d="M63 32H8" stroke="#a07a26" stroke-width="2"/>` });
  d.add(`<path d="M52 29L34 25.5L40 29Z" fill="#fff6d0" stroke="none"/>`);
});
proj('bomblet', (d) => {
  d.add(`<path d="M42 17Q46 9 52 9" fill="none" stroke="${OUT}" stroke-width="6.5"/><path d="M42 17Q46 9 52 9" fill="none" stroke="#e8d9b0" stroke-width="2.6"/>`);
  d.shape(circ(32, 36, 18), IRON, { sh: [6, 6], hi: [3, 3], sw: 3 });
  d.fill(rect(30, 15, 14, 9, 3), IRON.h, { sw: 3 });
  d.add(star4(54, 8, 9, '#ffb03b') + star4(54, 8, 4.5, '#fff4c4'));
  d.add(`<ellipse cx="25" cy="29" rx="5" ry="3.2" transform="rotate(-35 25 29)" fill="#fff" fill-opacity=".6" stroke="none"/>`);
});
proj('meteor', (d) => {
  d.shape(() => 'M34 12C22 12 12 18 2 25C13 28 11 32 1 34C12 36 14 40 4 47C16 51 26 52 34 51Z', mat('#ff5a36', '#d93a1e', '#ff8a4a'), { sh: [0, 4], hi: [0, 3], sw: 3 });
  d.add(`<path d="M32 22C24 23 16 27 10 31C18 32 24 36 32 40Z" fill="#ffb03b" stroke="none"/>`);
  d.shape(poly([[61, 29], [52, 14], [34, 13], [24, 28], [28, 46], [46, 52], [60, 42]]), mat('#7a6a5e', '#574a42', '#a8978a'), { sh: [5, 5], hi: [3, 3], sw: 3.2 });
  d.add(`<circle cx="46" cy="38" r="4" fill="#4a3a30" stroke="none"/><circle cx="36" cy="26" r="2.8" fill="#4a3a30" stroke="none"/><path d="M40 20L52 22L48 28L40 26Z" fill="#ffb03b" stroke="none"/>`);
});

// ================================================================== fx (white-ish, tinted in code)
const fx = (name, inner, defs = '') => {
  files[`fx_${name}`] = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${defs ? `<defs>${defs}</defs>` : ''}${inner}</svg>\n`;
};
fx('spark',
  `<circle cx="32" cy="32" r="14" fill="url(#xg)"/>` +
  star4(32, 32, 30, '#fff', 0, 0.16).replace(' stroke="none"', '') +
  star4(32, 32, 17, '#fff', Math.PI / 4, 0.2).replace(' stroke="none"', '') +
  `<circle cx="32" cy="32" r="5" fill="#fff"/>`,
  `<radialGradient id="xg"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`);
fx('smoke',
  `<g fill="url(#xg)"><circle cx="32" cy="36" r="22"/><circle cx="20" cy="30" r="15"/><circle cx="44" cy="29" r="16"/><circle cx="32" cy="22" r="14"/></g>`,
  `<radialGradient id="xg"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".6" stop-color="#f2f2f8" stop-opacity=".75"/><stop offset="1" stop-color="#e4e4ee" stop-opacity="0"/></radialGradient>`);
fx('glow',
  `<circle cx="32" cy="32" r="32" fill="url(#xg)"/>`,
  `<radialGradient id="xg"><stop offset="0" stop-color="#fff"/><stop offset=".25" stop-color="#fff" stop-opacity=".85"/><stop offset=".6" stop-color="#fff" stop-opacity=".3"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`);
fx('ring',
  `<circle cx="32" cy="32" r="26" fill="none" stroke="url(#xg)" stroke-width="7"/><circle cx="32" cy="32" r="26" fill="none" stroke="#fff" stroke-width="3"/>`,
  `<radialGradient id="xg" r="0.5"><stop offset=".78" stop-color="#fff" stop-opacity="0"/><stop offset=".88" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`.replace('<radialGradient id="xg" r="0.5">', '<radialGradient id="xg" gradientUnits="userSpaceOnUse" cx="32" cy="32" r="31">'));
{
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2, r = i % 2 === 0 ? 29 : 12.5;
    pts.push(`${f(32 + Math.cos(a) * r)} ${f(33 + Math.sin(a) * r)}`);
  }
  const star = `M${pts.join('L')}Z`;
  fx('star',
    `<path d="${star}" fill="#d9d9ea" stroke="#d9d9ea" stroke-width="4" stroke-linejoin="round"/>` +
    `<path d="${star}" fill="#fff" stroke="#fff" stroke-width="1" stroke-linejoin="round" transform="translate(-1.5 -1.5) scale(.92)" transform-origin="32 33"/>`);
}

// coin: keeps its colour (gold) with the shared dark outline
{
  const d = new Doc(64, 64, 'co', 3);
  d.add(`<ellipse cx="32" cy="58" rx="17" ry="3.6" fill="#000" fill-opacity=".25" stroke="none"/>`);
  d.shape(circ(32, 31, 25), GOLD, { sh: [5, 5], hi: [3, 3], sw: 3.2 });
  d.add(`<circle cx="32" cy="31" r="17.5" fill="none" stroke="${GOLD.s}" stroke-width="3"/>`);
  d.add(`<circle cx="32" cy="31" r="14" fill="${GOLD.b}" stroke="none"/>`);
  d.add(star4(32, 31, 10.5, GOLD.s, 0, 0.45));
  d.add(`<path d="M16 22Q19 14 28 12" fill="none" stroke="#fff6cf" stroke-width="3.2" stroke-opacity=".95"/><circle cx="14" cy="28" r="1.8" fill="#fff6cf" stroke="none"/>`);
  files['fx_coin'] = d.toString();
}

let total = 0;
for (const [k, v] of Object.entries(files)) {
  writeFileSync(join(OUT_DIR, `${k}.svg`), v);
  total += v.length;
  if (v.length > 12000) console.warn(`${k}.svg is ${v.length} bytes`);
}
console.log(`misc written: ${Object.keys(files).length} files, ${total} bytes`);
