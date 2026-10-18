// Generates icon_<key>.svg (128x128, transparent) for every ICON_KEY into public/assets/sprites/.
// Bold outlined glyphs with 3-tone cel shading (docs/ART_STYLE.md). Run: node tools/art/icons.mjs [key ...]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Art, OUT, ell, rr, poly, star, shade, light } from './creatures-lib.mjs';
import { ICON_KEYS } from '../../src/data/types.ts';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'assets', 'sprites');
const WOOD = '#a8673a', STONE = '#8d8fa8', GOLD = '#f5c542', STEEL = '#c3c7da', BONE = '#f2e9d0', ICE = '#7fdcff';
const RED = '#e0394f', ORANGE = '#ff8a3d', GREEN = '#6fcf4e', VIOLET = '#9d6bff', CYAN = '#5ef0ff', MAGENTA = '#e05ad6', NAVY = '#3b5b9a';
const I = (id) => new Art(id, 128, 128, 4, 4);
const rot = (pts, deg, cx = 64, cy = 64) => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return pts.map(([x, y]) => [+(cx + (x - cx) * c - (y - cy) * s).toFixed(1), +(cy + (x - cx) * s + (y - cy) * c).toFixed(1)]);
};
const P = (pts, deg = 0, cx, cy) => poly(rot(pts, deg, cx, cy));
const pt = (x, y, deg, cx, cy) => rot([[x, y]], deg, cx, cy)[0];
const path = (pts, deg = 0, cx, cy, close = false) => 'M' + rot(pts, deg, cx, cy).map((p) => p.join(' ')).join('L') + (close ? 'z' : '');
const sparkle = (A, x, y, r, c = '#fff') => A.cel(star(x, y, r, r * 0.3, 4), c, { sh: false, hi: false, sw: 2.5 });
const arrowHead = (x, y, ang, s = 16) => poly(rot([[x + s, y], [x - s * 0.6, y - s * 0.8], [x - s * 0.6, y + s * 0.8]], ang, x, y));

const icons = {};

// ---------------------------------------------------------------- stat glyphs
const sword = (A, deg, cx = 64, cy = 64, blade = STEEL, grip = WOOD) => {
  A.cel(P([[64, 4], [75, 18], [75, 80], [53, 80], [53, 18]], deg, cx, cy), blade);
  A.stroke(path([[64, 14], [64, 74]], deg, cx, cy), light(blade, 0.5), 3);
  A.cel(P([[36, 78], [92, 78], [92, 90], [36, 90]], deg, cx, cy), GOLD, { k: 3 });
  A.cel(P([[58, 90], [70, 90], [70, 110], [58, 110]], deg, cx, cy), grip, { k: 3 });
  const [px, py] = pt(64, 116, deg, cx, cy);
  A.cel(ell(px, py, 8), GOLD, { k: 3 });
};
icons.damage = () => { const A = I('dm'); sword(A, 45); return A; };

icons.speed = () => {
  const A = I('sp');
  A.stroke('M6 40H30M2 64H26M6 88H30', '#fff', 5, ' opacity=".85"');
  A.cel('M34 16L78 16L118 64L78 112L34 112L74 64Z', GOLD);
  A.cel('M44 36L62 36L84 64L62 92L44 92L66 64Z', '#fff2a8', { sh: false, hi: false, sw: 0, line: false });
  return A;
};

icons.range = () => {
  const A = I('rg');
  A.add(`<circle cx="64" cy="64" r="36" fill="none" stroke="${OUT}" stroke-width="18"/><circle cx="64" cy="64" r="36" fill="none" stroke="#8fc4ff" stroke-width="10"/><circle cx="64" cy="64" r="36" fill="none" stroke="#dff0ff" stroke-width="3" stroke-dasharray="26 200" transform="rotate(-150 64 64)"/>`);
  A.cel(ell(64, 64, 14), '#4f8be0', { sw: 3.5, k: 3 });
  for (const d of [0, 90, 180, 270]) A.cel(arrowHead(...pt(64, 10, d), d - 90, 12), GOLD, { k: 3, sw: 3.5 });
  return A;
};

icons.coin = () => {
  const A = I('co');
  A.cel(ell(64, 64, 54), GOLD);
  A.cel(ell(64, 64, 40), '#ffd95a', { sw: 3 });
  A.stroke(ell(64, 64, 40), '#c48a1c', 3);
  A.cel(star(64, 66, 24, 11, 5), '#fff0a0', { k: 3, sw: 3.5 });
  return A;
};

icons.heart = () => {
  const A = I('ht');
  A.cel('M64 118C20 88 8 58 22 36C36 18 58 24 64 42C70 24 92 18 106 36C120 58 108 88 64 118Z', RED);
  A.cel(ell(38, 44, 9, 7), '#ffd0d6', { sh: false, hi: false, sw: 0, line: false });
  return A;
};

icons.shield = () => {
  const A = I('sd');
  const sh = (s, dy = 0) => `M64 ${8 + dy}L${64 + 48 * s} ${22 + dy}Q${64 + 48 * s} ${74 + dy} 64 ${120 - dy}Q${64 - 48 * s} ${74 + dy} ${64 - 48 * s} ${22 + dy}Z`;
  A.cel(sh(1), STEEL);
  A.cel('M64 22L98 32Q98 70 64 104Q30 70 30 32Z', '#3f7fe0', { sw: 3 });
  A.cel('M64 22L98 32Q98 70 64 104Z', '#2f64bd', { sh: false, hi: false, sw: 0, line: false });
  A.cel(star(64, 58, 20, 9, 5), GOLD, { k: 3, sw: 3.5 });
  return A;
};

icons.crit = () => {
  const A = I('cr');
  A.cel(star(64, 64, 58, 28, 10), ORANGE);
  A.cel(star(64, 64, 42, 20, 10), GOLD, { sw: 3 });
  A.cel(star(64, 64, 22, 10, 6), '#fff6c0', { sw: 3, k: 3 });
  return A;
};

icons.chain = () => {
  const A = I('ch');
  const ring = (cx, cy, c) => `<ellipse cx="${cx}" cy="${cy}" rx="17" ry="34" transform="rotate(-45 ${cx} ${cy})" fill="none" stroke="${OUT}" stroke-width="18"/><ellipse cx="${cx}" cy="${cy}" rx="17" ry="34" transform="rotate(-45 ${cx} ${cy})" fill="none" stroke="${c}" stroke-width="10"/><ellipse cx="${cx}" cy="${cy}" rx="17" ry="34" transform="rotate(-45 ${cx} ${cy})" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="30 300" stroke-dashoffset="-120" opacity=".8"/>`;
  A.add(ring(44, 44, '#d4d8ea'));
  A.add(ring(84, 84, '#a9aec6'));
  // pass the first link back over the second on one side only (interlock)
  const id = A.uid();
  A.defs.push(`<clipPath id="${id}"><rect x="64" y="46" width="40" height="36" transform="rotate(-45 64 64)"/></clipPath>`);
  A.add(`<g clip-path="url(#${id})">${ring(44, 44, '#d4d8ea')}</g>`);
  return A;
};

icons.explosion = () => {
  const A = I('ex');
  A.cel(ell(40, 30, 14, 12), '#8d8fa8', { k: 3 });
  A.cel(ell(94, 26, 12, 10), '#8d8fa8', { k: 3 });
  A.cel(star(64, 70, 56, 33, 12, -1.45), '#e8402a');
  A.cel(star(64, 70, 40, 22, 10, -1.2), ORANGE, { sw: 3 });
  A.cel(star(64, 70, 22, 12, 8, -1.0), '#ffe97a', { sw: 3, k: 3 });
  return A;
};

icons.split = () => {
  const A = I('sl');
  const c = CYAN;
  A.limb('M64 118V76M64 76Q64 56 34 38M64 76Q64 56 94 38M64 76V28', c, 11, { hi: false });
  A.cel(arrowHead(...pt(64, 14, 0), -90, 18), '#c9fbff', { k: 3, sw: 4 });
  A.cel(arrowHead(26, 30, -145, 18), '#c9fbff', { k: 3, sw: 4 });
  A.cel(arrowHead(102, 30, -35, 18), '#c9fbff', { k: 3, sw: 4 });
  return A;
};

// ---------------------------------------------------------------- tower glyphs
icons.arrow = () => {
  const A = I('ar');
  A.limb('M50 10Q112 64 50 118', WOOD, 11);
  A.stroke('M50 10V118', '#fff', 3);
  A.limb('M20 64H100', '#cf8c55', 7, { hi: false });
  A.cel('M122 64L96 50L96 78Z', STEEL, { k: 3, sw: 3.5 });
  A.cel('M20 64L8 52H30L38 64L30 76H8Z', GREEN, { k: 3, sw: 3.5 });
  return A;
};

icons.cannon = () => {
  const A = I('cn');
  A.cel(ell(46, 92, 26), WOOD);
  A.cel(ell(46, 92, 10), '#4a4f63', { k: 3, sw: 3.5 });
  A.stroke('M46 66V118M20 92H72M28 74L64 110M64 74L28 110', '#7a4523', 3);
  A.cel(P([[20, 52], [100, 46], [100, 82], [20, 76]], -28, 60, 66), '#6a7190');
  A.cel(P([[88, 42], [108, 40], [108, 88], [88, 90]], -28, 60, 66), '#8a91b0', { k: 3 });
  const [bx, by] = pt(118, 62, -28, 60, 66);
  A.glow(bx - 2, by + 2, 18, ORANGE);
  A.cel(ell(bx + 4, by - 6, 11), '#4a4f63', { k: 3 });
  A.dot(bx, by - 10, 3, '#9aa0ba');
  return A;
};

icons.frost = () => {
  const A = I('fr');
  const arms = [];
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI) / 3, c = Math.cos(a), s = Math.sin(a);
    const p = (r, o = 0) => `${(64 + c * r - s * o).toFixed(1)} ${(64 + s * r + c * o).toFixed(1)}`;
    arms.push(`M${p(-54)}L${p(54)}`);
    for (const r of [34, -34]) arms.push(`M${p(r * 1.0)}L${p(r * 1.0 + (r > 0 ? 14 : -14), 15)}M${p(r)}L${p(r + (r > 0 ? 14 : -14), -15)}`);
  }
  A.limb(arms.join(''), ICE, 9);
  A.cel(star(64, 64, 15, 12, 6, 0), '#e6f9ff', { k: 3, sw: 3.5 });
  return A;
};

icons.lightning = () => {
  const A = I('lg');
  A.glow(64, 64, 62, VIOLET, 0.8);
  A.cel('M76 4L24 70H54L42 124L104 50H72L96 4Z', '#ffe14d');
  A.cel('M72 22L44 62H66L58 98L86 58H64Z', '#fff7b0', { sh: false, hi: false, sw: 0, line: false });
  return A;
};

icons.fire = () => {
  const A = I('fi');
  A.cel('M64 6C70 32 102 48 100 84C98 108 82 120 64 120C46 120 28 108 28 84C28 62 44 56 48 34C56 42 58 24 64 6Z', '#ff5a36');
  A.cel('M64 52C68 72 86 78 84 98C82 112 74 116 64 116C54 116 44 110 44 98C44 84 60 78 64 52Z', '#ffb03b', { sw: 3 });
  A.cel('M64 84C66 94 74 96 72 106C70 112 68 112 64 112C58 112 56 108 56 104C56 96 62 94 64 84Z', '#fff2a8', { sw: 0, line: false, k: 3 });
  return A;
};

icons.poison = () => {
  const A = I('po');
  A.cel(rr(48, 6, 32, 14, 5), WOOD, { k: 3 });
  A.cel('M52 18H76V44Q104 56 104 84Q104 118 64 118Q24 118 24 84Q24 56 52 44Z', '#d6f6ff');
  A.cel('M28 80Q64 68 100 80Q104 118 64 118Q26 116 28 80Z', '#8be04e', { sw: 0, line: false, k: 5 });
  A.stroke('M52 18H76V44Q104 56 104 84Q104 118 64 118Q24 118 24 84Q24 56 52 44Z', OUT, 4);
  A.cel(ell(64, 92, 14, 12), BONE, { k: 3, sw: 3 });
  A.dot(58, 91, 3.2, OUT); A.dot(70, 91, 3.2, OUT);
  A.dot(52, 70, 4.5, '#c9ff8a'); A.dot(76, 64, 3.2, '#c9ff8a');
  return A;
};

icons.sniper = () => {
  const A = I('sn');
  A.cel(ell(64, 64, 52), NAVY);
  A.cel(ell(64, 64, 38), '#dfe9ff', { sw: 3 });
  A.stroke(ell(64, 64, 38), NAVY, 3);
  A.stroke('M64 4V50M64 78V124M4 64H50M78 64H124', '#d4a64a', 6);
  A.stroke('M64 4V50M64 78V124M4 64H50M78 64H124', OUT, 2);
  A.cel(ell(64, 64, 9), RED, { k: 3, sw: 3.5 });
  return A;
};

icons.magic = () => {
  const A = I('mg');
  A.glow(64, 58, 60, MAGENTA, 0.7);
  A.cel('M34 118L42 96Q64 106 86 96L94 118Z', GOLD, { k: 4 });
  A.cel(ell(64, 62, 38), MAGENTA);
  A.cel(ell(64, 66, 22), '#b0309e', { sh: false, hi: false, sw: 0, line: false });
  A.cel(ell(50, 46, 12, 8), '#ffd6fa', { sh: false, hi: false, sw: 0, line: false });
  sparkle(A, 76, 62, 12, CYAN);
  sparkle(A, 22, 22, 9, '#fff');
  sparkle(A, 108, 24, 8, '#fff');
  return A;
};

// ---------------------------------------------------------------- abilities
icons.meteor = () => {
  const A = I('mt');
  A.cel('M8 10C40 14 64 30 78 52L96 70L62 96C40 72 18 44 8 10Z', '#ff8a3d');
  A.cel('M22 24C44 30 60 44 70 62L58 80C42 62 30 44 22 24Z', '#ffd24a', { sw: 3, k: 3 });
  A.cel('M52 70L74 50L104 56L120 84L108 112L78 122L54 108Z', '#8a5a3a');
  A.cel('M62 78L80 62L98 70L100 90L84 100L66 94Z', '#a8764c', { sh: false, hi: false, sw: 0, line: false });
  A.dot(90, 86, 4, '#5a3a24'); A.dot(76, 104, 3, '#5a3a24');
  return A;
};

icons.freeze = () => {
  const A = I('fz');
  A.cel(ell(64, 66, 46), '#e6f9ff');
  A.cel(ell(64, 66, 36), ICE, { sw: 3 });
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    A.stroke(`M${(64 + Math.cos(a) * 30).toFixed(1)} ${(66 + Math.sin(a) * 30).toFixed(1)}L${(64 + Math.cos(a) * 24).toFixed(1)} ${(66 + Math.sin(a) * 24).toFixed(1)}`, '#fff', 3);
  }
  A.limb('M64 66V42M64 66L82 78', '#2b5a8a', 7, { hi: false });
  A.dot(64, 66, 5, '#fff');
  // ice crystals
  A.cel('M16 14L26 4L32 20L24 34Z', '#c9f3ff', { k: 3, sw: 3.5 });
  A.cel('M104 8L116 18L106 36L98 24Z', '#c9f3ff', { k: 3, sw: 3.5 });
  A.cel('M60 124L50 112H78Z', '#c9f3ff', { k: 3, sw: 3.5 });
  return A;
};

icons.repair = () => {
  const A = I('rp');
  A.cel(P([[56, 40], [72, 40], [72, 118], [56, 118]], 40, 64, 64), WOOD);
  A.cel(P([[28, 6], [100, 6], [100, 44], [28, 44]], 40, 64, 64), '#9aa0ba', { k: 5 });
  A.cel(P([[28, 6], [46, 6], [46, 44], [28, 44]], 40, 64, 64), '#6c7290', { sh: false, hi: false, sw: 0, line: false });
  A.cel(P([[56, 42], [72, 42], [72, 50], [56, 50]], 40, 64, 64), GOLD, { k: 2 });
  sparkle(A, 100, 100, 14, '#8be04e');
  sparkle(A, 24, 96, 9, '#fff');
  return A;
};

icons.frenzy = () => {
  const A = I('fy');
  A.cel('M64 2C74 30 118 44 116 88C114 112 92 124 64 124C36 124 14 112 12 88C10 44 54 30 64 2Z', '#ff5a36');
  A.cel('M64 34C72 54 100 62 98 92C96 110 82 118 64 118C46 118 32 110 30 92C28 62 56 54 64 34Z', '#ffb03b', { sw: 3 });
  sword(A, 45, 64, 72, STEEL);
  sword(A, -45, 64, 72, '#dfe3f2');
  return A;
};

// ---------------------------------------------------------------- misc glyphs
const skull = (A, cx, cy, s, c = BONE, eye = OUT) => {
  const x = (v) => cx + (v - 64) * s, y = (v) => cy + (v - 64) * s;
  A.cel(`M${x(18)} ${y(58)}Q${x(18)} ${y(8)} ${x(64)} ${y(8)}Q${x(110)} ${y(8)} ${x(110)} ${y(58)}Q${x(110)} ${y(76)} ${x(96)} ${y(84)}V${y(100)}Q${x(96)} ${y(110)} ${x(86)} ${y(110)}H${x(42)}Q${x(32)} ${y(110)} ${x(32)} ${y(100)}V${y(84)}Q${x(18)} ${y(76)} ${x(18)} ${y(58)}Z`, c);
  A.cel(ell(x(44), y(60), 15 * s, 17 * s), eye, { sh: false, hi: false, sw: 0, line: false });
  A.cel(ell(x(84), y(60), 15 * s, 17 * s), eye, { sh: false, hi: false, sw: 0, line: false });
  A.cel(`M${x(64)} ${y(76)}l${-7 * s} ${12 * s}h${14 * s}z`, eye, { sh: false, hi: false, sw: 0, line: false });
  A.stroke(`M${x(50)} ${y(98)}V${y(110)}M${x(64)} ${y(98)}V${y(110)}M${x(78)} ${y(98)}V${y(110)}`, OUT, 3);
};
icons.skull = () => { const A = I('sk'); skull(A, 64, 64, 0.92); return A; };

icons.star = () => {
  const A = I('sr');
  A.cel(star(64, 68, 60, 28, 5), GOLD);
  A.cel(star(64, 68, 32, 15, 5), '#fff0a0', { sw: 0, line: false, sh: false });
  return A;
};

icons.clock = () => {
  const A = I('ck');
  A.cel(ell(64, 64, 54), GOLD);
  A.cel(ell(64, 64, 41), '#fff7e0', { sw: 3 });
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6, c = Math.cos(a), s = Math.sin(a);
    A.stroke(`M${(64 + c * 36).toFixed(1)} ${(64 + s * 36).toFixed(1)}L${(64 + c * 30).toFixed(1)} ${(64 + s * 30).toFixed(1)}`, OUT, 3);
  }
  A.limb('M64 64V34M64 64L86 76', '#3b2a4a', 7, { hi: false, sw: 2 });
  A.cel(ell(64, 64, 6), RED, { k: 2, sw: 3 });
  return A;
};

icons.merge = () => {
  const A = I('mr');
  A.cel('M4 46H32V22L62 64L32 106V82H4Z', '#6fcf4e');
  A.cel('M124 46H96V22L66 64L96 106V82H124Z', '#4fb34a');
  A.glow(64, 64, 36, '#fff6a8', 0.9);
  sparkle(A, 64, 64, 24, '#fff6a8');
  return A;
};

icons.vortex = () => {
  const A = I('vx');
  let d = '';
  for (let i = 0; i <= 60; i++) {
    const t = i / 60, a = t * Math.PI * 5.2, r = 6 + t * 48;
    d += (i ? 'L' : 'M') + (64 + Math.cos(a) * r).toFixed(1) + ' ' + (64 + Math.sin(a) * r).toFixed(1);
  }
  A.glow(64, 64, 62, VIOLET, 0.5);
  A.limb(d, '#7a5cf0', 14, { hi: false });
  A.stroke(d, '#b9a2ff', 5, ' transform="translate(-1.5 -1.5)"');
  A.stroke(d, '#fff', 2, ' transform="translate(-2 -2)" opacity=".8"');
  return A;
};

icons.gem = () => {
  const A = I('gm');
  A.cel('M34 10H94L120 44L64 120L8 44Z', '#3fc4e8');
  A.cel('M34 10L50 44H78L94 10Z', '#9cf0ff', { sh: false, hi: false, k: 3, sw: 3.5 });
  A.cel('M8 44H50L64 120Z', '#2a9fcb', { sh: false, hi: false, sw: 3.5 });
  A.cel('M120 44H78L64 120Z', '#2380ae', { sh: false, hi: false, sw: 3.5 });
  A.cel('M50 44H78L64 120Z', '#5fd8f5', { sh: false, hi: false, sw: 3.5 });
  sparkle(A, 32, 34, 9);
  return A;
};

icons.chest = () => {
  const A = I('cs');
  A.cel('M14 58Q14 22 64 22Q114 22 114 58Z', WOOD);
  A.cel(rr(12, 56, 104, 58, 8), '#8a5230');
  A.cel(rr(12, 56, 104, 14, 5), GOLD, { k: 3, sw: 3.5 });
  A.cel(rr(28, 22, 12, 94, 4), GOLD, { k: 3, sw: 3.5 });
  A.cel(rr(88, 22, 12, 94, 4), GOLD, { k: 3, sw: 3.5 });
  A.cel(rr(52, 56, 24, 30, 6), GOLD, { k: 3 });
  A.dot(64, 68, 4.5, OUT);
  A.stroke('M64 70V78', OUT, 4);
  sparkle(A, 108, 14, 10, '#fff6a8');
  return A;
};

icons.merchant = () => {
  const A = I('mc');
  A.cel('M44 14Q64 26 84 14L78 34Q108 52 108 84Q108 118 64 118Q20 118 20 84Q20 52 50 34Z', '#c0703a');
  A.cel(rr(40, 28, 48, 12, 6), '#e0394f', { k: 3 });
  A.cel(ell(64, 84, 24), GOLD, { k: 4, sw: 3.5 });
  A.stroke(ell(64, 84, 16), '#c48a1c', 3);
  A.cel(star(64, 85, 10, 5, 5), '#fff0a0', { sh: false, hi: false, sw: 0, line: false });
  return A;
};

icons.curse = () => {
  const A = I('cu');
  A.glow(64, 64, 62, '#a040e0', 0.6);
  skull(A, 64, 66, 0.9, '#9a62d8', '#1d1230');
  A.dot(44, 56, 5, '#8bf06a'); A.dot(84, 56, 5, '#8bf06a');
  A.add('<circle cx="44" cy="56" r="9" fill="#8bf06a" opacity=".3"/><circle cx="84" cy="56" r="9" fill="#8bf06a" opacity=".3"/>');
  return A;
};

icons.treasure = () => {
  const A = I('tz');
  const coin = (x, y, r = 22) => { A.cel(ell(x, y, r, r * 0.55), GOLD, { k: 3 }); A.stroke(ell(x, y - 1, r * 0.6, r * 0.28), '#c48a1c', 2.5); };
  A.cel('M64 4L80 30L64 54L48 30Z', '#e05ad6', { k: 3 });
  A.cel('M64 4L80 30H48Z', '#ffa8f4', { sh: false, hi: false, sw: 3, k: 3 });
  coin(30, 100); coin(98, 100); coin(64, 108, 26);
  coin(46, 80); coin(82, 80); coin(64, 66, 24);
  return A;
};

icons.elite = () => {
  const A = I('el');
  skull(A, 64, 76, 0.86, BONE);
  A.cel('M22 46L16 12L42 30L64 4L86 30L112 12L106 46Q64 58 22 46Z', GOLD);
  A.cel(rr(22, 40, 84, 12, 5), '#ffe58a', { k: 3, sw: 3.5 });
  A.cel(ell(64, 26, 7), RED, { k: 3, sw: 3.5 });
  return A;
};

icons.trophy = () => {
  const A = I('tp');
  A.limb('M30 26Q4 30 16 56Q24 70 42 70', '#e0a82a', 9, { hi: false });
  A.limb('M98 26Q124 30 112 56Q104 70 86 70', '#e0a82a', 9, { hi: false });
  A.cel('M26 12H102Q104 48 92 68Q82 80 70 82V96H58V82Q46 80 36 68Q24 48 26 12Z', GOLD);
  A.cel(star(64, 44, 18, 8, 5), '#fff0a0', { sh: false, hi: false, sw: 3 });
  A.cel(rr(40, 94, 48, 12, 4), '#a8673a', { k: 3 });
  A.cel(rr(30, 106, 68, 14, 5), '#7a4523', { k: 3 });
  return A;
};

icons.lock = () => {
  const A = I('lk');
  A.limb('M38 58V38Q38 12 64 12Q90 12 90 38V58', STEEL, 14, { hi: false });
  A.cel(rr(18, 52, 92, 68, 14), GOLD);
  A.cel(ell(64, 82, 10, 10), '#3b2a4a', { sh: false, hi: false, sw: 0, line: false });
  A.cel(rr(60, 86, 8, 18, 3), '#3b2a4a', { sh: false, hi: false, sw: 0, line: false });
  return A;
};

icons.slot = () => {
  const A = I('st');
  A.cel(rr(10, 10, 108, 108, 20), STONE);
  A.cel(rr(24, 24, 80, 80, 12), '#7a7c96', { sh: false, hi: false, sw: 3 });
  A.cel('M52 34H76V52H94V76H76V94H52V76H34V52H52Z', '#a8e86a', { k: 3, sw: 4 });
  return A;
};

icons.crown = () => {
  const A = I('cw');
  A.cel('M12 36L30 70L48 24L64 66L80 24L98 70L116 36L106 104H22Z', GOLD);
  A.cel(rr(20, 96, 88, 22, 7), '#ffd95a', { k: 4 });
  A.cel(ell(64, 106, 7), RED, { k: 3, sw: 3.5 });
  A.cel(ell(36, 106, 5), CYAN, { k: 2, sw: 3 });
  A.cel(ell(92, 106, 5), CYAN, { k: 2, sw: 3 });
  A.cel(ell(12, 34, 8), '#ffe58a', { k: 3, sw: 3.5 });
  A.cel(ell(116, 34, 8), '#ffe58a', { k: 3, sw: 3.5 });
  A.cel(ell(48, 20, 8), '#ffe58a', { k: 3, sw: 3.5 });
  A.cel(ell(80, 20, 8), '#ffe58a', { k: 3, sw: 3.5 });
  return A;
};

icons.dragon = () => {
  const A = I('dg');
  A.cel('M30 52L6 44L26 70L8 86L38 84Z', '#ff9a3b', { k: 3, sw: 3.5 });
  A.cel('M44 38L24 8L60 24Z', '#f4e2b0', { k: 3, sw: 3.5 });
  A.cel('M62 26L58 2L84 24Z', '#f4e2b0', { k: 3, sw: 3.5 });
  A.cel('M36 70Q30 30 62 26Q84 22 96 34L120 38Q128 50 120 58L96 66Q70 70 36 70Z', '#e04a34');
  A.cel('M52 70L118 64Q112 74 104 76L56 84Z', '#5b1d2e', { sh: false, hi: false, sw: 3.5, k: 3 });
  A.cel('M44 78Q54 100 80 104Q104 100 114 84L104 74L56 82Z', '#c93a2c', { k: 4 });
  A.flat('M72 72l4 8 5-9zM94 69l4 8 4-10z', '#fff', { sw: 2.5 });
  A.eye(64, 46, 9, 10, { px: 3, sclera: '#fff3a0', sw: 3 });
  A.limb('M50 34L76 44', OUT, 5, { sw: 0, hi: false });
  A.dot(108, 46, 3.2, OUT);
  return A;
};

icons.golem = () => {
  const A = I('gl');
  A.cel('M20 34L38 8H90L108 34L112 90L94 120H34L16 90Z', '#9c9eb6');
  A.cel('M38 8H90L96 26H32Z', '#c9cbe0', { sh: false, hi: false, sw: 0, line: false });
  A.cel(rr(28, 44, 30, 22, 6), '#16384a', { sh: false, hi: false, sw: 4 });
  A.cel(rr(70, 44, 30, 22, 6), '#16384a', { sh: false, hi: false, sw: 4 });
  A.glow(43, 55, 22, CYAN); A.glow(85, 55, 22, CYAN);
  A.cel(rr(34, 51, 18, 8, 3), '#c9fbff', { sh: false, hi: false, sw: 0, line: false });
  A.cel(rr(76, 51, 18, 8, 3), '#c9fbff', { sh: false, hi: false, sw: 0, line: false });
  A.stroke('M44 92H84M54 80V104M74 80V104', OUT, 4);
  A.stroke('M60 90H68', CYAN, 4);
  A.cel('M20 34L34 26L42 34L28 42Z', '#6aa83f', { k: 3, sw: 3.5 });
  return A;
};

icons.eye = () => {
  const A = I('ey');
  A.cel('M4 64Q34 14 64 14Q94 14 124 64Q94 114 64 114Q34 114 4 64Z', '#fff');
  A.cel(ell(64, 64, 30), '#3fa0e8', { k: 5 });
  A.cel(ell(64, 64, 14), OUT, { sh: false, hi: false, sw: 0, line: false });
  A.dot(52, 50, 7, '#fff'); A.dot(76, 78, 3.5, '#fff');
  return A;
};

icons.target = () => {
  const A = I('tg');
  A.cel(ell(60, 68, 52), '#fff');
  A.cel(ell(60, 68, 38), RED, { sw: 3 });
  A.cel(ell(60, 68, 25), '#fff', { sw: 3 });
  A.cel(ell(60, 68, 12), RED, { sw: 3, k: 3 });
  A.limb('M62 66L108 20', WOOD, 6, { hi: false });
    A.cel('M100 20L124 6L116 32Z', '#8be04e', { k: 2, sw: 3 });
  return A;
};

icons.castle = () => {
  const A = I('ct');
  A.cel(rr(8, 50, 28, 70, 3), STONE, { k: 4 });
  A.cel(rr(92, 50, 28, 70, 3), STONE, { k: 4 });
  A.cel('M4 52H40V36H34V28H28V36H22V28H16V36H10V28H4Z', '#b9bbd1', { k: 3, sw: 3.5 });
  A.cel('M88 52H124V36H118V28H112V36H106V28H100V36H94V28H88Z', '#b9bbd1', { k: 3, sw: 3.5 });
  A.cel(rr(30, 64, 68, 56, 3), '#a2a5be', { k: 5 });
  A.cel('M26 64H102V48H96V38H88V48H80V38H72V48H64V38H56V48H48V38H40V48H32V38H26Z', '#b9bbd1', { k: 3, sw: 3.5 });
  A.cel('M50 120V96Q50 80 64 80Q78 80 78 96V120Z', '#6a4326', { sh: false, hi: false, sw: 4 });
  A.cel('M16 28V8L40 18Z', RED, { k: 3, sw: 3 });
  A.stroke('M16 8V30', OUT, 4);
  A.cel(rr(18, 66, 8, 14, 3), '#3b2a4a', { sh: false, hi: false, sw: 0, line: false });
  A.cel(rr(102, 66, 8, 14, 3), '#3b2a4a', { sh: false, hi: false, sw: 0, line: false });
  return A;
};

mkdirSync(out, { recursive: true });
const only = process.argv.slice(2);
let total = 0, missing = [];
for (const key of ICON_KEYS) {
  if (only.length && !only.includes(key)) continue;
  if (!icons[key]) { missing.push(key); continue; }
  const s = icons[key]().toString();
  writeFileSync(join(out, `icon_${key}.svg`), s);
  total += s.length;
  if (s.length > 15000) console.warn('too big', key, s.length);
}
console.log('icons total', (total / 1024).toFixed(1) + ' KB', missing.length ? 'MISSING: ' + missing.join(',') : '');
