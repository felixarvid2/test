// Generates public/assets/sprites/tower_<type>_<1..5>.svg (192x192, base centre (96,168)).
// Every tower = shared footing/body/platform/battlements/banners per LEVEL + a per-TYPE weapon motif.
// Run: node tools/art/towers.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Doc, OUT, mat, mix, STONE, WOOD, GOLD, IRON, poly, ell, circ, rect, cylD, bricks, planks, banner,
  groundShadow, star4, f,
} from './tower-lib.mjs';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../public/assets/sprites');

const TYPES = {
  arrow:     { c: '#5cb85c', gem: '#b6f5a0', glow: '#8be04e', hMul: 1.0, wMul: 1.0, ws: 1.0 },
  cannon:    { c: '#ff8a3d', gem: '#ffc47a', glow: '#ff8a3d', hMul: 1.0, wMul: 1.0, ws: 1.0 },
  frost:     { c: '#7fdcff', gem: '#e6fbff', glow: '#7fdcff', hMul: 0.86, wMul: 1.0, ws: 1.0 },
  lightning: { c: '#9d6bff', gem: '#ffe14d', glow: '#b99aff', hMul: 0.88, wMul: 1.0, ws: 1.0 },
  fire:      { c: '#ff5a36', gem: '#ffd36b', glow: '#ff7a3b', hMul: 1.0, wMul: 1.0, ws: 1.0 },
  poison:    { c: '#7a3fa0', gem: '#8be04e', glow: '#8be04e', hMul: 1.0, wMul: 1.0, ws: 1.0 },
  sniper:    { c: '#3b5b9a', gem: '#6fd0ff', glow: '#6f9bff', hMul: 1.12, wMul: 0.8, ws: 1.0 },
  magic:     { c: '#e05ad6', gem: '#5ef0ff', glow: '#e05ad6', hMul: 0.9, wMul: 1.0, ws: 1.0 },
};

const NAVY = mat('#3b5b9a', '#2b4377', '#5f82c6');
const BRASS = mat('#d4a64a', '#a07a26', '#f0cd7e');
const ICE = mat('#7fdcff', '#4fb4e0', '#c9f3ff');
const VIOLET = mat('#9d6bff', '#6c40c9', '#d2b8ff');
const MAGENTA = mat('#e05ad6', '#a82fa0', '#f59cee');
const STEEL = mat('#b9bbd1', '#8d8fa8', '#e6e7f2');

// ------------------------------------------------------------------ weapons (local coords, y up = negative)
const flame = (cx, yb, w, h, lean = 0) => (dx = 0, dy = 0) => {
  const X = cx + dx, Y = yb + dy;
  return `M${f(X - w)} ${f(Y)}C${f(X - w)} ${f(Y - h * 0.45)} ${f(X - w * 0.3)} ${f(Y - h * 0.6)} ${f(X + lean)} ${f(Y - h)}` +
    `C${f(X + w * 0.35)} ${f(Y - h * 0.55)} ${f(X + w)} ${f(Y - h * 0.45)} ${f(X + w)} ${f(Y)}Q${f(X)} ${f(Y + w * 0.6)} ${f(X - w)} ${f(Y)}Z`;
};

const WEAPONS = {
  arrow(d, L) {
    d.shape(rect(-6, -16, 12, 16, 2), WOOD, { sh: [4, 0], hi: [2, 0], sw: 4.5 });
    d.add(`<g transform="rotate(-16 0 -30)">`);
    const tip = L >= 4 ? GOLD : WOOD;
    // string (dark underlay + cream line), bow limb, arrow
    d.add(`<path d="M-6 -56L-24 -30L-6 -4" fill="none" stroke="${OUT}" stroke-width="5.5"/><path d="M-6 -56L-24 -30L-6 -4" fill="none" stroke="#f3e9d2" stroke-width="2"/>`);
    d.shape((dx = 0, dy = 0) => `M${-6 + dx} ${-58 + dy}Q${40 + dx} ${-30 + dy} ${-6 + dx} ${-2 + dy}Q${16 + dx} ${-30 + dy} ${-6 + dx} ${-58 + dy}Z`,
      WOOD, { sh: [4, 0], hi: [3, 0], sw: 4.5 });
    d.fill(circ(-6, -58, 4.6), tip.b, { sw: 3.5 });
    d.fill(circ(-6, -2, 4.6), tip.b, { sw: 3.5 });
    d.fill(rect(9, -36, 8, 12, 2), '#5cb85c', { sw: 3.5 });
    d.fill(poly([[-30, -30], [-18, -30], [-12, -41], [-24, -41]]), '#5cb85c', { sw: 3.5 });
    d.fill(poly([[-30, -30], [-18, -30], [-12, -19], [-24, -19]]), '#3f9a45', { sw: 3.5 });
    d.fill(rect(-26, -32.5, 62, 5, 2.5), WOOD.h, { sw: 3.5 });
    d.fill(poly([[34, -38], [56, -30], [34, -22]]), STEEL.b, { sw: 4 });
    d.add('</g>');
  },
  cannon(d, L) {
    // cannonball pile
    const ball = (x, y, r) => {
      d.shape(circ(x, y, r), IRON, { sh: [3, 3], hi: [1.6, 1.6], sw: 4 });
    };
    ball(-34, -7, 7.5); ball(-19, -7, 7.5); ball(-27, -19, 7.5);
    // carriage
    d.shape(poly([[-20, 0], [26, 0], [20, -15], [-14, -21]]), WOOD, { sh: [4, 3], hi: [2, 2], sw: 5 });
    d.add(`<g transform="rotate(-24 0 -26)">`);
    const band = L >= 4 ? GOLD.b : '#ff8a3d';
    d.shape(rect(-20, -37, 56, 22, 8), IRON, { sh: [3, 7], hi: [-0, 5], sw: 5.5 });
    d.fill(circle0(-22, -26, 8), IRON.s, { sw: 5 });
    d.fill(rect(24, -41, 13, 30, 4), IRON.h, { sw: 5 });
    d.fill(rect(2, -38.5, 9, 25, 2), band, { sw: 4 });
    d.fill(rect(-10, -38.5, 3, 25, 1), band, { sw: 0, extra: ' stroke="none"' });
    d.add(`<path d="M-14 -33H18" stroke="${IRON.h}" stroke-width="3.2" stroke-opacity=".8"/>`);
    d.add(`<ellipse cx="37" cy="-26" rx="3.6" ry="9" fill="#1f1830" stroke="none"/>`);
    d.add('</g>');
    // wheel
    d.shape(circ(-4, -9, 11), WOOD, { sh: [4, 4], hi: [2, 2], sw: 5 });
    d.fill(circ(-4, -9, 4.5), IRON.b, { sw: 3.5 });
  },
  frost(d, L) {
    const crystal = (x, yb, w, h, lean) => {
      const A = [x + lean, yb - h], SL = [x - w / 2, yb - h * 0.68], SR = [x + w / 2, yb - h * 0.68];
      const BL = [x - w * 0.38, yb], BR = [x + w * 0.38, yb], BC = [x + w * 0.04, yb];
      d.shape(poly([A, SR, BR, BL, SL]), ICE, {
        sh: [w * 0.3, 0], hi: null, sw: 5,
        inner: `<path d="${poly([A, SL, BL, BC])()}" fill="${ICE.h}"/>` +
          `<path d="M${f(A[0])} ${f(A[1])}L${f(BC[0])} ${f(BC[1])}M${f(SL[0])} ${f(SL[1])}L${f(x + w * 0.04)} ${f(yb - h * 0.62)}L${f(SR[0])} ${f(SR[1])}" fill="none" stroke="${ICE.s}" stroke-width="2.4" stroke-opacity=".9"/>` +
          `<path d="${poly([[x - w * 0.3, yb - h * 0.58], [x - w * 0.18, yb - h * 0.62], [x - w * 0.24, yb - h * 0.22], [x - w * 0.34, yb - h * 0.2]])()}" fill="#fff" fill-opacity=".85"/>`,
      });
    };
    d.shape(ell(0, -3, 30, 9), mat('#e4f6ff', '#a9d4ea', '#ffffff'), { sh: [3, 3], hi: null, sw: 5 });
    crystal(-21, -5, 17, 36, -3);
    crystal(21, -5, 15, 30, 3);
    crystal(0, -4, 26, 58, 1);
    if (L >= 4) { d.add(star4(-24, -52, 6, '#fff')); d.add(star4(26, -46, 5, '#fff')); }
  },
  lightning(d, L) {
    const bolt = (cx, cy, s, c = '#ffe14d', sw = 3.5) =>
      d.fill(poly([[4, -15], [-7, 1], [-1, 1], [-5, 15], [8, -3], [2, -3], [8, -15]].map(([x, y]) => [cx + x * s, cy + y * s])), c, { sw });
    // electrodes
    const rod = (x2, y2) => d.add(`<path d="M${Math.sign(x2) * 6} -14Q${x2 * 0.9} -14 ${x2} ${y2}" fill="none" stroke="${OUT}" stroke-width="8"/><path d="M${Math.sign(x2) * 6} -14Q${x2 * 0.9} -14 ${x2} ${y2}" fill="none" stroke="${IRON.h}" stroke-width="3.2"/>`);
    if (L >= 2) {
      rod(-24, -34); rod(24, -34);
      d.fill(circ(-24, -35, 5), VIOLET.b, { sw: 4 }); d.fill(circ(24, -35, 5), VIOLET.b, { sw: 4 });
      d.add(star4(-24, -35, 6.5, '#ffe14d')); d.add(star4(24, -35, 6.5, '#ffe14d'));
    }
    d.shape(cylD(0, -3, 24, 9, 6.5), IRON, { sh: [5, 2], hi: [2, 0], sw: 5 });
    d.shape(ell(0, -15, 12, 4.2), VIOLET, { sh: [2, 2], hi: null, sw: 4 });
    d.shape(ell(0, -25, 10, 3.6), VIOLET, { sh: [2, 2], hi: null, sw: 4 });
    const og = d.radial([[0, '#f1e6ff'], [0.4, '#b48cff'], [1, '#6c40c9']], 0.5, 0.5, 0.55, 0.35, 0.3);
    const R = 17;
    d.add(`<circle cx="0" cy="-45" r="${R + 9}" fill="${d.radial([[0, '#d2b8ff', 0.7], [1, '#d2b8ff', 0]])}" stroke="none"/>`);
    d.add(`<circle cx="0" cy="-45" r="${R}" fill="${og}"/>`);
    bolt(0, -45, 0.82);
  },
  fire(d, L) {
    const rimMat = L >= 4 ? GOLD : IRON;
    d.shape(poly([[-9, -7], [9, -7], [14, 0], [-14, 0]]), IRON, { sh: [4, 2], hi: null, sw: 5 });
    // flames behind the bowl rim
    const fl = (cx, yb, w, h, lean, m, sw) => d.shape(flame(cx, yb, w, h, lean), m, { sh: [w * 0.35, 0], hi: null, sw });
    fl(-17, -26, 8, 24, -4, mat('#ff5a36', '#d93a1e'), 4);
    fl(17, -26, 8, 22, 4, mat('#ff5a36', '#d93a1e'), 4);
    fl(0, -26, 17, 52, 2, mat('#ff5a36', '#d93a1e', '#ff8a4a'), 5);
    fl(0, -26, 11, 36, 1, mat('#ffb03b', '#ff8a3d', '#ffd36b'), 0);
    fl(0, -26, 5.5, 19, 0, mat('#ffe58a', '#ffd36b', '#fff4c4'), 0);
    d.shape((dx = 0, dy = 0) => `M${-25 + dx} ${-26 + dy}C${-25 + dx} ${-8 + dy} ${-13 + dx} ${-5 + dy} ${dx} ${-5 + dy}C${13 + dx} ${-5 + dy} ${25 + dx} ${-8 + dy} ${25 + dx} ${-26 + dy}Z`, IRON, { sh: [8, 4], hi: [3, 3], sw: 5.5 });
    d.shape(ell(0, -26, 26, 6), rimMat, { sh: [3, 0], hi: [1, 1], sw: 5, base: rimMat.h });
    d.add(`<ellipse cx="0" cy="-26" rx="20" ry="3.8" fill="#ff8a3d" stroke="none"/><ellipse cx="0" cy="-26.5" rx="14" ry="2.2" fill="#ffd36b" stroke="none"/>`);
    if (L >= 3) d.add(star4(-24, -56, 5, '#ffd36b') + star4(22, -62, 4, '#ffd36b'));
  },
  poison(d, L) {
    const rim = L >= 4 ? GOLD : IRON;
    d.shape(poly([[-17, -3], [-9, -3], [-12, 2], [-21, 2]]), IRON, { sh: [2, 1], hi: null, sw: 4 });
    d.shape(poly([[17, -3], [9, -3], [12, 2], [21, 2]]), IRON, { sh: [2, 1], hi: null, sw: 4 });
    // bubbles behind/over liquid
    const bub = (x, y, r) => {
      d.add(`<circle cx="${x}" cy="${y}" r="${r}" fill="#b6f07a" stroke-width="4"/><circle cx="${x - r * 0.35}" cy="${y - r * 0.35}" r="${f(r * 0.28)}" fill="#fff" stroke="none"/>`);
    };
    d.shape((dx = 0, dy = 0) => `M${-25 + dx} ${-32 + dy}C${-32 + dx} ${-8 + dy} ${-17 + dx} ${-1 + dy} ${dx} ${-1 + dy}C${17 + dx} ${-1 + dy} ${32 + dx} ${-8 + dy} ${25 + dx} ${-32 + dy}Z`,
      IRON, { sh: [9, 4], hi: [3, 3], sw: 5.5,
        inner: `<path d="M-40 -23H40V-14H-40Z" fill="#7a3fa0"/><path d="M-40 -23H40V-20H-40Z" fill="#a066cc"/>` });
    d.shape(ell(0, -32, 27, 7.5), rim, { sh: [3, 0], hi: [1, 1], sw: 5, base: rim.h });
    d.add(`<ellipse cx="0" cy="-32" rx="21.5" ry="5" fill="#8be04e" stroke="none"/><ellipse cx="-5" cy="-33.2" rx="11" ry="2" fill="#c8f58f" stroke="none"/>`);
    bub(-9, -39, 8.5); bub(10, -48, 6.5); bub(-2, -57, 4.8);
    if (L >= 3) bub(17, -38, 4.2);
    if (L >= 4) bub(-15, -53, 3.8);
    // drip
    d.add(`<path d="M24 -31q5 1 5 7q0 6-4 6q-4 0-4-6z" fill="#8be04e" stroke-width="3.6"/>`);
  },
  sniper(d, L) {
    const brass = L >= 4 ? BRASS : BRASS;
    const leg = (x1, x2) => d.add(`<path d="M${x1} -25L${x2} -1" stroke="${OUT}" stroke-width="8"/><path d="M${x1} -25L${x2} -1" stroke="${BRASS.b}" stroke-width="3.2"/>`);
    leg(-5, -17); leg(7, 18);
    d.shape(rect(-9, -31, 18, 12, 3), NAVY, { sh: [6, 3], hi: [2, 2], sw: 5 });
    d.add(`<g transform="rotate(-12 0 -26)">`);
    d.shape(poly([[-6, -33], [-30, -32], [-34, -19], [-22, -17], [-6, -23]]), NAVY, { sh: [6, 3], hi: [2, 2], sw: 5 });
    d.shape(rect(-6, -33, 62, 9, 3.5), brass, { sh: [3, 4], hi: [0, 3], sw: 5 });
    d.fill(rect(48, -36, 10, 15, 3), BRASS.s, { sw: 4.5 });
    d.fill(rect(2, -29, 5, 6, 1), BRASS.s, { sw: 3 });
    d.shape(rect(0, -45, 28, 10, 5), NAVY, { sh: [4, 4], hi: [2, 2], sw: 4.5 });
    d.fill(rect(4, -46, 4, 12, 1.5), BRASS.b, { sw: 3 });
    d.fill(rect(22, -46, 4, 12, 1.5), BRASS.b, { sw: 3 });
    d.fill(rect(10, -36, 5, 4, 0), NAVY.s, { sw: 3 });
    d.add(`<ellipse cx="28.5" cy="-40" rx="2.4" ry="4.4" fill="#6fd0ff" stroke="${OUT}" stroke-width="2.5"/>`);
    d.add('</g>');
  },
  magic(d, L) {
    const R = 18, cy = -42;
    const ringArc = (lower) => {
      const p = lower ? 'M-30 0A30 9 0 0 0 30 0' : 'M-30 0A30 9 0 0 1 30 0';
      d.add(`<g transform="translate(0 ${cy}) rotate(-20)"><path d="${p}" fill="none" stroke="${OUT}" stroke-width="9"/><path d="${p}" fill="none" stroke="#5ef0ff" stroke-width="4"/></g>`);
    };
    d.shape(cylD(0, -1, 9, 13, 10), STONE, { sh: [5, 2], hi: [2, 0], sw: 5 });
    d.shape((dx = 0, dy = 0) => `M${-19 + dx} ${-27 + dy}Q${-17 + dx} ${-10 + dy} ${dx} ${-10 + dy}Q${17 + dx} ${-10 + dy} ${19 + dx} ${-27 + dy}Q${dx} ${-19 + dy} ${-19 + dx} ${-27 + dy}Z`, GOLD, { sh: [4, 2], hi: [2, 1], sw: 4.5 });
    d.add(`<circle cx="0" cy="${cy}" r="${R + 11}" fill="${d.radial([[0, '#5ef0ff', 0.55], [1, '#5ef0ff', 0]])}" stroke="none"/>`);
    ringArc(false);
    const og = d.radial([[0, '#ffe3fb'], [0.35, '#e05ad6'], [1, '#8c2a8a']], 0.5, 0.5, 0.55, 0.35, 0.3);
    d.add(`<circle cx="0" cy="${cy}" r="${R}" fill="${og}"/>`);
    d.add(star4(0, cy + 1, 11, '#5ef0ff', 0, 0.3) + star4(0, cy + 1, 5, '#e6fdff', Math.PI / 4, 0.4));
    ringArc(true);
    d.add(`<circle cx="-23" cy="${cy + 11}" r="3.2" fill="#e6fdff" stroke-width="2.6"/><circle cx="24" cy="${cy - 12}" r="2.6" fill="#e6fdff" stroke-width="2.4"/>`);
    if (L >= 3) d.add(star4(-26, cy - 14, 6, '#e6fdff') + star4(26, cy + 10, 5, '#e6fdff'));
  },
};
function circle0(cx, cy, r) { return circ(cx, cy, r); }

// ------------------------------------------------------------------ tower body
const FOOT = [30, 38, 44, 50, 64];
const WB = [20, 28, 34, 39, 44];
const BH = [24, 36, 46, 56, 64];
const WSCALE = [1.08, 1.18, 1.26, 1.32, 1.36];
// unscaled weapon height above the platform floor; used to keep the tallest levels inside the canvas
const HW = { arrow: 62, cannon: 58, frost: 62, lightning: 64, fire: 80, poison: 66, sniper: 56, magic: 66 };
const FLOOR_EXTRA = [6, 5, 7, 8, 9];

function merlon(d, w, h, gold) {
  d.shape(rect(-w / 2, -h, w, h, 1.5), STONE, { sh: [w * 0.4, 0], hi: [1.6, 0], sw: 4 });
  if (gold) d.fill(rect(-w / 2 - 1.5, -h - 3.5, w + 3, 6, 2), GOLD.b, { sw: 3.5 });
}

export function towerSvg(type, L) {
  const T = TYPES[type];
  const d = new Doc(192, 192, `${type.slice(0, 2)}${L}`);
  const cx = 96, i = L - 1;
  const footW = FOOT[i];
  const wb = WB[i] * T.wMul, wt = wb * 0.9;
  const H = BH[i] * T.hMul;
  const yb0 = 152, top = yb0 - H;
  const wf = wt + FLOOR_EXTRA[i];
  const wood = L === 1;
  const bodyMat = wood ? WOOD : STONE;
  const tm = mat(T.c);

  if (L === 5) {
    d.add(`<circle cx="96" cy="98" r="94" fill="${d.radial([[0, T.glow, 0.5], [0.6, T.glow, 0.22], [1, T.glow, 0]])}" stroke="none"/>`);
  }
  groundShadow(d, cx, 168, footW + 12, 13);

  // L5 flanking turrets (one definition, placed twice)
  if (L === 5) {
    const tg = d.group(() => {
      const x = 0, w = 14, th = H * 0.6, ty = yb0 - th;
      d.shape(cylD(x, yb0, th, w, w * 0.92), STONE, { sh: [w * 0.5, 3], hi: [w * 0.18, 0], sw: 5.5, inner: bricks(x, yb0, th, w, w * 0.92, 3, STONE.s) });
      d.shape(cylD(x, ty + 5, 8, w + 3.5, w + 2.5), GOLD, { sh: [5, 2], hi: [2, 0], sw: 5 });
      const wy = yb0 - th * 0.5;
      d.shape(poly([[x - 6, wy + 12], [x - 6, wy + 3], [x - 3, wy], [x + 3, wy], [x + 6, wy + 3], [x + 6, wy + 12]]), mat('#ffd36b', '#e0a63a', '#fff0b0'), { sh: [2, 0], sw: 3.5 });
      const cone = (dx = 0, dy = 0) => `M${f(x - 18 + dx)} ${f(ty + dy)}L${f(x + dx)} ${f(ty - 40 + dy)}L${f(x + 18 + dx)} ${f(ty + dy)}A18 5 0 0 1 ${f(x - 18 + dx)} ${f(ty + dy)}Z`;
      d.add(`<path d="M${x} ${ty - 38}V${ty - 54}" stroke="${OUT}" stroke-width="5"/>`);
      d.add(`<path d="M${x} ${ty - 54}l15 5l-15 5z" fill="${GOLD.b}" stroke-width="4"/>`);
      d.shape(cone, tm, { sh: [11, 0], hi: [3, 0], sw: 5.5 });
      d.fill(circ(x, ty - 40, 4.2), GOLD.b, { sw: 4 });
    });
    d.use(tg, cx - wb - 15, 0);
    d.use(tg, cx + wb + 15, 0);
  }

  // footing
  d.shape(cylD(cx, 164, 12, footW, footW - 2), STONE, { sh: [footW * 0.45, 2], hi: [footW * 0.12, 0], sw: 5.5, inner: bricks(cx, 164, 12, footW, footW - 2, 1, STONE.s) });
  d.shape(ell(cx, 152, footW - 2, (footW - 2) * 0.28), STONE, { sh: null, hi: null, sw: 5.5, base: STONE.h });

  // body
  d.shape(cylD(cx, yb0, H, wb, wt), bodyMat, {
    sh: [wb * 0.5, 3], hi: [wb * 0.16, 0], sw: 6,
    inner: wood ? planks(cx, yb0, H, wb, wt, WOOD.s, 4) + `<path d="M${cx - wb} ${yb0 - H * 0.3}Q${cx} ${yb0 - H * 0.3 + wb * 0.5} ${cx + wb} ${yb0 - H * 0.3}" fill="none" stroke="${IRON.b}" stroke-width="3.5"/>`
      : bricks(cx, yb0, H, wb, wt, L + 1, STONE.s),
  });
  if (L >= 4) {
    d.shape(cylD(cx, yb0 + 2, 7, wb + 3, wb + 2), GOLD, { sh: [wb * 0.5, 1], hi: [wb * 0.15, 0], sw: 4.5 });
  }

  // door (L3+)
  if (L >= 3) {
    const dw = 6 + L, dh = 12 + L * 2, yd = yb0 + wb * 0.28 - 2;
    const arch = `M${cx - dw} ${yd}V${yd - dh + dw}A${dw} ${dw} 0 0 1 ${cx + dw} ${yd - dh + dw}V${yd}Z`;
    d.add(`<path d="${arch}" fill="${WOOD.s}" stroke-width="4.5"/><path d="M${cx} ${yd - dh}V${yd}" stroke="${OUT}" stroke-width="2.4" fill="none"/>`);
    if (L >= 4) d.add(`<path d="${arch}" fill="none" stroke="${GOLD.b}" stroke-width="2.4"/>`);
  }
  // banners
  const bw = [0, 14, 12, 13, 15][i], bh = [0, 28, 32, 36, 44][i];
  if (L >= 2) {
    const bg = d.group(() => banner(d, 0, 0, bw, bh, T.c, GOLD, L >= 4));
    if (L === 2) d.use(bg, cx, top + 7);
    else { d.use(bg, cx - wb * 0.58, top + 7); d.use(bg, cx + wb * 0.58, top + 7); }
  }
  // gem
  if (L >= 4) {
    const gy = top + H * (L === 4 ? 0.40 : 0.37), r = L === 4 ? 7 : 9;
    d.add(`<circle cx="${cx}" cy="${gy}" r="${r + 3.5}" fill="${GOLD.b}"/>`);
    d.add(`<circle cx="${cx}" cy="${gy}" r="${r}" fill="${d.radial([[0, '#ffffff'], [0.35, T.gem], [1, T.c]], 0.5, 0.5, 0.6, 0.35, 0.3)}" stroke-width="3.5"/>`);
    d.add(`<circle cx="${f(cx - r * 0.3)}" cy="${f(gy - r * 0.35)}" r="${f(r * 0.22)}" fill="#fff" stroke="none"/>`);
  }

  // platform
  const slabMat = L >= 4 ? GOLD : wood ? WOOD : STONE;
  const slabH = 9;
  const floorY = top - 3;
  d.shape(cylD(cx, top + 6, slabH, wf, wf - 1), slabMat, {
    sh: [wf * 0.45, 2], hi: [wf * 0.1, 0], sw: 5.5,
    inner: L === 2 || L === 3 ? `<path d="M${cx - wf} ${top + 3}H${cx + wf}V${top + 6}H${cx - wf}Z" fill="${T.c}"/>` : '',
  });
  d.shape(ell(cx, floorY, wf - 1, (wf - 1) * 0.28), slabMat, { sh: null, hi: null, sw: 5.5, base: wood ? WOOD.h : L >= 4 ? GOLD.h : STONE.h });
  if (L >= 3) d.add(`<ellipse cx="${cx}" cy="${f(floorY + 0.5)}" rx="${f(wf - 7)}" ry="${f((wf - 7) * 0.26)}" fill="${L >= 4 ? GOLD.s : STONE.s}" stroke="none"/>`);

  // back merlons / posts / crown
  const ring = (n, phase, rr, fn, half) => {
    const arr = [];
    for (let k = 0; k < n; k++) {
      const th = phase + (k * 2 * Math.PI) / n;
      const s = Math.sin(th);
      arr.push({ x: cx + rr * Math.cos(th), y: floorY + rr * 0.28 * s, s });
    }
    arr.filter((p) => (half === 'back' ? p.s < -0.01 : p.s >= -0.01)).sort((a, b) => a.s - b.s).forEach((p) => fn(p));
  };
  const rr = wf - 3;
  const nM = [0, 0, 7, 9, 9][i];
  const mW = [0, 0, 9.5, 9.5, 10.5][i], mH = [0, 0, 10, 11, 12][i];
  const post = wood ? d.group(() => d.shape(rect(-2.7, -11, 5.4, 11, 1.5), WOOD, { sh: [2, 0], sw: 3.8 })) : null;
  const mg = L >= 3 ? d.group(() => merlon(d, mW, mH, L >= 4)) : null;
  if (wood) ring(6, Math.PI / 6, wf - 3.5, (p) => d.use(post, p.x, p.y), 'back');
  if (L >= 3) ring(nM, Math.PI / 2, rr, (p) => d.use(mg, p.x, p.y), 'back');
  if (L === 5) {
    // gold crown behind the weapon
    const spike = d.group(() => {
      d.fill(poly([[-5, -4], [0, -26], [5, -4]]), GOLD.b, { sw: 4 });
      d.fill(circ(0, -26, 3.6), tm.h, { sw: 3.2 });
    });
    ring(7, Math.PI / 2 + Math.PI / 7, rr - 1, (p) => d.use(spike, p.x, p.y), 'back');
  }

  // weapon
  const s = Math.min(WSCALE[i] * T.ws, (floorY - 5) / HW[type]);
  if (L >= 4) {
    d.add(`<circle cx="${cx}" cy="${floorY - 34 * s}" r="${f(34 * s)}" fill="${d.radial([[0, T.glow, L === 4 ? 0.4 : 0.55], [1, T.glow, 0]])}" stroke="none"/>`);
  }
  d.add(`<g transform="translate(${cx} ${f(floorY)}) scale(${s})" stroke-width="${f(6 / s)}">`);
  WEAPONS[type](d, L);
  d.add('</g>');

  // front merlons / posts
  if (wood) ring(6, Math.PI / 6, wf - 3.5, (p) => d.use(post, p.x, p.y), 'front');
  if (L >= 3) ring(nM, Math.PI / 2, rr, (p) => d.use(mg, p.x, p.y), 'front');
  if (L === 5) {
    d.add(star4(150, 40, 7, '#fff') + star4(40, 56, 5, '#fff') + star4(158, 96, 4, '#fff'));
  }
  return d.toString();
}

const only = process.argv[2];
mkdirSync(OUT_DIR, { recursive: true });
let total = 0;
for (const type of Object.keys(TYPES)) {
  for (let L = 1; L <= 5; L++) {
    if (only && only !== type) continue;
    const svg = towerSvg(type, L);
    writeFileSync(join(OUT_DIR, `tower_${type}_${L}.svg`), svg);
    total += svg.length;
    if (svg.length > 12000) console.warn(`tower_${type}_${L}.svg is ${svg.length} bytes`);
  }
}
console.log(`towers written, ${total} bytes`);
