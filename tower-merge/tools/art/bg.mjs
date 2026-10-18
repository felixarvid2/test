// Generates bg_board.svg and bg_menu.svg (720x1280, opaque) into public/assets/sprites/.
// bg_board: seeded-random meadow; decorations keep clear of the path, slots and castle (checked).
// Run: node tools/art/bg.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PATH, PATH_WIDTH, SLOTS, SLOT_SIZE, CASTLE, BOARD } from '../../src/data/map.ts';
import { mix, shade, light } from './creatures-lib.mjs';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'assets', 'sprites');
const W = 720, H = 1280;
const f1 = (v) => +v.toFixed(1);
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ------------------------------------------------------------------ board
const distSeg = (px, py, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / l2));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
};
const pointClear = (x, y) => {
  for (let i = 0; i < PATH.length - 1; i++) if (distSeg(x, y, PATH[i], PATH[i + 1]) < PATH_WIDTH / 2 + 30) return false;
  const sh = SLOT_SIZE / 2 + 12;
  for (const s of SLOTS) if (Math.abs(x - s.x) < sh && Math.abs(y - s.y) < sh) return false;
  return !(Math.abs(x - CASTLE.x) < CASTLE.width / 2 + 12 && Math.abs(y - CASTLE.y) < CASTLE.height / 2 + 12);
};
/**
 * Is a decoration drawn from base point (x, y) upwards, hw wide each side and h tall, clear of the
 * path (PATH_WIDTH/2 + 30), the slots (SLOT_SIZE/2 + 12) and the castle? Samples its whole body.
 */
export function clear(x, y, hw, h) {
  for (let gy = 0; gy >= -h - 1; gy -= 8) {
    const t = (-gy - h / 2) / (h / 2 + 0.001), w = hw * Math.sqrt(Math.max(0, 1 - t * t * 0.9));
    for (let gx = -w; gx <= w + 0.1; gx += 8) if (!pointClear(x + gx, y + gy)) return false;
    if (!pointClear(x + w, y + gy) || !pointClear(x - w, y + gy)) return false;
  }
  return true;
}

const DK = '#2f5a34'; // soft green outline for scenery (calmer than the unit outline)
const G = { base: '#7fbf4d', dark: '#6aa83f', light: '#93cf5f' };
const blob = (cx, cy, r, c, sw = 2.5) => {
  const d = shade(c, 0.28);
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${d}" stroke="${DK}" stroke-width="${sw}"/><circle cx="${f1(cx - r * 0.1)}" cy="${f1(cy - r * 0.12)}" r="${f1(r * 0.82)}" fill="${c}"/><circle cx="${f1(cx - r * 0.32)}" cy="${f1(cy - r * 0.36)}" r="${f1(r * 0.4)}" fill="${light(c, 0.3)}"/>`;
};
const rockPath = (pts) => 'M' + pts.map((p) => p.join(' ')).join('L') + 'z';

function symbols() {
  const s = [];
  const oak = (id, c) => s.push(`<g id="${id}"><ellipse cx="4" cy="2" rx="30" ry="9" fill="#000" opacity=".22"/><path d="M-6 2L-4-28H6L8 2Z" fill="#8a5230" stroke="${DK}" stroke-width="2.5" stroke-linejoin="round"/>${blob(-16, -46, 19, shade(c, 0.1))}${blob(17, -48, 20, shade(c, 0.1))}${blob(0, -62, 25, c)}${blob(-2, -42, 17, mix(c, '#ffffff', 0.05))}</g>`);
  oak('oa', '#5aa545'); oak('ob', '#6bb34a'); oak('oc', '#4c9660');
  const pine = (id, c) => {
    const tier = (y, w, h, cc) => `<path d="M0 ${y - h}L${w} ${y}H${-w}Z" fill="${shade(cc, 0.25)}" stroke="${DK}" stroke-width="2.5" stroke-linejoin="round"/><path d="M0 ${y - h}L${-w} ${y}H0Z" fill="${cc}"/><path d="M0 ${y - h}L${-w * 0.45} ${y - h * 0.4}L${-w * 0.2} ${y - h * 0.7}Z" fill="${light(cc, 0.3)}"/>`;
    s.push(`<g id="${id}"><ellipse cx="4" cy="2" rx="24" ry="7" fill="#000" opacity=".22"/><rect x="-5" y="-14" width="10" height="16" fill="#8a5230" stroke="${DK}" stroke-width="2.5" stroke-linejoin="round"/>${tier(-8, 30, 36, c)}${tier(-34, 25, 34, c)}${tier(-58, 19, 32, c)}</g>`);
  };
  pine('pa', '#3f8a55'); pine('pb', '#4a9a4e');
  const bush = (id, c, fl) => s.push(`<g id="${id}"><ellipse cx="2" cy="2" rx="24" ry="6" fill="#000" opacity=".2"/>${blob(-12, -9, 11, shade(c, 0.05))}${blob(12, -9, 12, shade(c, 0.05))}${blob(0, -15, 14, c)}${fl ? `<circle cx="-8" cy="-14" r="2.8" fill="${fl}"/><circle cx="8" cy="-9" r="2.8" fill="${fl}"/><circle cx="1" cy="-21" r="2.8" fill="${fl}"/><circle cx="-14" cy="-6" r="2.4" fill="${fl}"/>` : ''}</g>`);
  bush('ba', '#5aa545'); bush('bb', '#68b04a'); bush('bc', '#5aa545', '#ff8fb4'); bush('bd', '#68b04a', '#ffe36a');
  const rock = (id, pts, c) => {
    const sc = (k) => pts.map(([x, y]) => [f1(x * k), f1(y * k)]);
    s.push(`<g id="${id}"><ellipse cx="2" cy="1" rx="${Math.max(...pts.map((p) => Math.abs(p[0]))) + 4}" ry="5" fill="#000" opacity=".2"/><path d="${rockPath(pts)}" fill="${shade(c, 0.25)}" stroke="#3a3550" stroke-width="2.5" stroke-linejoin="round"/><path d="${rockPath(pts.map(([x, y]) => [f1(x * 0.88 - 1), f1(y * 0.88 - 2)]))}" fill="${c}"/><path d="${rockPath(pts.map(([x, y]) => [f1(x * 0.5 - 6), f1(y * 0.5 - 12)]))}" fill="${light(c, 0.32)}"/></g>`);
  };
  rock('ra', [[-20, 0], [-22, -12], [-10, -24], [8, -26], [22, -12], [24, 0]], '#9a9bb0');
  rock('rb', [[-12, 0], [-14, -8], [-4, -15], [10, -13], [14, 0]], '#a3a4b8');
  rock('rc', [[-26, 0], [-24, -14], [-8, -20], [10, -22], [26, -10], [28, 0]], '#8f9199');
  const tuft = '<path d="M-5 0Q-6-6-9-9Q-3-6-1 0Q0-9 1-12Q3-7 2 0Q6-6 10-8Q6-2 5 0Z"';
  s.push(`<g id="tf">${tuft} fill="#58963a"/></g><g id="tg">${tuft} fill="#a0d868"/></g>`);
  const flower = (id, c) => s.push(`<g id="${id}"><circle cx="-2.6" cy="0" r="2.4" fill="${c}"/><circle cx="2.6" cy="0" r="2.4" fill="${c}"/><circle cx="0" cy="-2.6" r="2.4" fill="${c}"/><circle cx="0" cy="2.6" r="2.4" fill="${c}"/><circle r="1.6" fill="#ffd54a"/></g>`);
  flower('fw', '#ffffff'); flower('fp', '#ff9dc0'); flower('fy', '#ffe45e'); flower('fb', '#9ec4ff');
  s.push('<g id="pb1"><ellipse rx="4.5" ry="3" fill="#a9a8b8"/><ellipse cx="-1" cy="-1" rx="2" ry="1.2" fill="#cfcedd"/></g>');
  return s.join('');
}

function board() {
  const R = rng(20240607);
  const placed = []; // {x, y, r}: base point and spacing radius
  const items = []; // {y, s}
  const free = (x, y, hw, h, r, gap) => clear(x, y, hw, h) && placed.every((p) => Math.hypot(p.x - x, (p.y - y) * 1.6) > (p.r + r) * gap);
  const put = (id, x, y, r, sc = 1, track = true) => {
    if (track) placed.push({ x, y, r });
    items.push({ y, s: `<use href="#${id}" transform="translate(${f1(x)} ${f1(y)})${sc !== 1 ? ` scale(${f1(sc)})` : ''}"/>` });
  };
  const counts = {};
  // kinds: id -> body half width, height, spacing radius (at scale 1)
  const K = { oa: [40, 92, 26], ob: [40, 92, 26], oc: [40, 92, 26], pa: [32, 74, 22], pb: [32, 74, 22], ba: [28, 34, 17], bb: [28, 34, 17], bc: [28, 34, 17], bd: [28, 34, 17], ra: [26, 28, 16], rb: [16, 18, 11], rc: [30, 24, 18] };
  const scatter = (name, n, ids, kMin, kMax, tries, gap, region = () => true) => {
    let got = 0;
    for (let t = 0; t < tries && got < n; t++) {
      const x = -24 + R() * (W + 48), y = R() * (H + 10), id = ids[Math.floor(R() * ids.length)], k = kMin + R() * (kMax - kMin);
      const [hw, h, r] = K[id];
      if (!region(x, y) || !free(x, y, hw * k, h * k, r * k, gap)) continue;
      put(id, x, y, r * k, k);
      got++;
    }
    counts[name] = got;
  };
  // canopy row across the top (HUD area): big trees whose crowns run off the top edge
  let top = 0;
  for (let x = -10; x < W + 30; x += 40 + R() * 20) {
    const id = ['oa', 'ob', 'oc'][Math.floor(R() * 3)], k = 1.1 + R() * 0.3, y = 74 + R() * 16, [hw, h, r] = K[id];
    if (free(x, y, hw * k, h * k, r * k, 0.4)) { put(id, x, y, r * k, k); top++; }
  }
  counts.canopy = top;
  scatter('trees', 60, ['oa', 'ob', 'oc', 'pa', 'pb'], 0.75, 1.1, 12000, 0.8, (x, y) => y > 100 && y < 1000);
  scatter('bushes', 70, ['ba', 'bb', 'bc', 'bd'], 0.8, 1.4, 12000, 0.9);
  scatter('rocks', 30, ['ra', 'rb', 'rc'], 0.7, 1.3, 8000, 1.0);
  scatter('floor', 40, ['oa', 'oc', 'pa', 'pb', 'ba', 'bb'], 0.9, 1.3, 9000, 0.5, (x, y) => y > 1000);

  // flowers in clusters, tufts and pebbles
  let fl = 0;
  for (let c = 0; c < 900 && fl < 150; c++) {
    const cx = -10 + R() * (W + 20), cy = 100 + R() * (BOARD.bottom - 80), id = ['fw', 'fp', 'fy', 'fb'][Math.floor(R() * 4)];
    if (!clear(cx, cy, 6, 6)) continue;
    for (let i = 0; i < 3 + Math.floor(R() * 4); i++) {
      const x = cx + (R() - 0.5) * 50, y = cy + (R() - 0.5) * 36;
      if (clear(x, y, 5, 5) && placed.every((p) => Math.hypot(p.x - x, p.y - y) > p.r * 0.6)) { put(R() < 0.8 ? id : 'fw', x, y, 5, R() < 0.5 ? 1 : 1.25, false); fl++; }
    }
  }
  counts.flowers = fl;
  let tf = 0;
  for (let t = 0; t < 6000 && tf < 360; t++) {
    const x = R() * W, y = R() * H;
    if (clear(x, y, 8, 12) && placed.every((p) => Math.hypot(p.x - x, p.y - y) > p.r * 0.6)) { put(R() < 0.7 ? 'tf' : 'tg', x, y, 8, 0.8 + R() * 0.7, false); tf++; }
  }
  counts.tufts = tf;
  let pb = 0;
  for (let t = 0; t < 3000 && pb < 80; t++) {
    const x = R() * W, y = R() * H;
    if (clear(x, y, 6, 6) && placed.every((p) => Math.hypot(p.x - x, p.y - y) > p.r * 0.7)) { put('pb1', x, y, 5, 0.8 + R() * 0.8, false); pb++; }
  }
  counts.pebbles = pb;

  // soft colour patches
  const patches = [];
  for (let i = 0; i < 46; i++) {
    const dark = R() < 0.5, x = R() * W, y = R() * H, rx = 60 + R() * 120, ry = 40 + R() * 90;
    patches.push(`<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="url(#${dark ? 'pd' : 'pl'})"/>`);
  }
  items.sort((a, b) => a.y - b.y);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>` +
    `<radialGradient id="pd"><stop offset="0" stop-color="${G.dark}" stop-opacity=".7"/><stop offset="1" stop-color="${G.dark}" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="pl"><stop offset="0" stop-color="${G.light}" stop-opacity=".75"/><stop offset="1" stop-color="${G.light}" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="tp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16381f" stop-opacity=".78"/><stop offset="1" stop-color="#16381f" stop-opacity="0"/></linearGradient>` +
    `<linearGradient id="bt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a3d25" stop-opacity="0"/><stop offset=".25" stop-color="#1a3d25" stop-opacity=".7"/><stop offset="1" stop-color="#10281a" stop-opacity=".95"/></linearGradient>` +
    `<radialGradient id="vg" cx=".5" cy=".5" r=".75"><stop offset=".6" stop-color="#10281a" stop-opacity="0"/><stop offset="1" stop-color="#10281a" stop-opacity=".35"/></radialGradient>` +
    symbols() + `</defs>` +
    `<rect width="${W}" height="${H}" fill="${G.base}"/>${patches.join('')}` +
    Array.from({ length: 9 }, (_, i) => `<rect y="${110 + i * 120}" width="${W}" height="60" fill="#fff" opacity=".05"/>`).join('') +
    items.map((i) => i.s).join('') +
    `<rect y="0" width="${W}" height="150" fill="url(#tp)"/><rect y="990" width="${W}" height="290" fill="url(#bt)"/>` +
    `<rect y="0" width="${W}" height="110" fill="#16381f" opacity=".2"/><rect width="${W}" height="${H}" fill="url(#vg)"/></svg>\n`;
  return { svg, counts };
}

// ------------------------------------------------------------------ menu
function menu() {
  const R = rng(777);
  const ridge = (base, amp, step, seed, sharp = 1) => {
    const r = rng(seed);
    let pts = [], y = base;
    for (let x = -20; x <= W + 20 + step; x += step) { y = base - amp * (0.15 + Math.pow(r(), sharp) * 0.85); pts.push([x, f1(y)]); if (x + step / 2 < W + 20) pts.push([x + step / 2, f1(base - amp * 0.05 - r() * amp * 0.2)]); }
    return 'M-20 ' + (H) + 'L' + pts.map((p) => p.join(' ')).join('L') + `L${W + 40} ${H}Z`;
  };
  let stars = '';
  for (let i = 0; i < 70; i++) { const y = R() * 330; stars += `<circle cx="${f1(R() * W)}" cy="${f1(y)}" r="${f1(0.8 + R() * 1.6)}" fill="#fff" opacity="${f1(0.35 + R() * 0.55 * (1 - y / 360))}"/>`; }
  const cloud = (x, y, w, c, o) => `<path d="M${x} ${y}q${w * 0.1}-14 ${w * 0.25}-8q${w * 0.15}-22 ${w * 0.35}-6q${w * 0.2}-14 ${w * 0.3}6q${w * 0.1}-2 ${w * 0.1}8z" fill="${c}" opacity="${o}"/>`;
  const clouds = cloud(20, 330, 220, '#ff9ab8', 0.55) + cloud(500, 300, 240, '#ffb08a', 0.5) + cloud(540, 440, 180, '#ff8aa8', 0.55) + cloud(-20, 470, 200, '#c86aa0', 0.55) + cloud(250, 560, 260, '#ffb27a', 0.4) + cloud(430, 140, 200, '#b96ab8', 0.35) + cloud(10, 160, 170, '#b96ab8', 0.3);
  // castle silhouette on the right hill
  const CS = '#1b1236', cx = 520, cy = 560;
  const tower = (x, y, w, h, roof) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${CS}"/><path d="M${x - 4} ${y}H${x + w + 4}V${y - 6}H${x + w - 2}V${y - 12}H${x + w - 10}V${y - 6}H${x + 10}V${y - 12}H${x + 2}V${y - 6}H${x - 4}Z" fill="${CS}"/>` + (roof ? `<path d="M${x - 6} ${y}L${x + w / 2} ${y - roof}L${x + w + 6} ${y}Z" fill="${CS}"/>` : '');
  const castle = `<g>${tower(cx - 70, cy - 70, 40, 90, 46)}${tower(cx + 30, cy - 92, 46, 112, 56)}${tower(cx - 22, cy - 40, 52, 62, 0)}${tower(cx + 82, cy - 52, 34, 74, 38)}<rect x="${cx - 80}" y="${cy - 10}" width="190" height="40" fill="${CS}"/>` +
    `<path d="M${cx + 53} ${cy - 148}V${cy - 168}l22 8-22 8" fill="#ff6a5a" stroke="${CS}" stroke-width="2"/><path d="M${cx - 50} ${cy - 116}V${cy - 134}l18 7-18 7" fill="#ffb347" stroke="${CS}" stroke-width="2"/><path d="M${cx + 99} ${cy - 90}V${cy - 106}l16 6-16 6" fill="#ff6a5a" stroke="${CS}" stroke-width="2"/>` +
    [[cx - 54, cy - 40], [cx + 46, cy - 62], [cx + 56, cy - 32], [cx - 8, cy - 18], [cx + 8, cy - 18], [cx + 92, cy - 24], [cx - 54, cy - 14]].map(([x, y]) => `<rect x="${x}" y="${y}" width="8" height="13" rx="3" fill="#ffd27a"/>`).join('') + `<path d="M${cx - 8} ${cy + 30}V${cy + 6}q10-14 20 0V${cy + 30}Z" fill="#ffb347"/></g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>` +
    `<linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e1750"/><stop offset=".22" stop-color="#4b2a82"/><stop offset=".38" stop-color="#a8408e"/><stop offset=".48" stop-color="#ee6a6e"/><stop offset=".55" stop-color="#ffa45e"/><stop offset=".62" stop-color="#ffd27a"/><stop offset="1" stop-color="#ffd27a"/></linearGradient>` +
    `<radialGradient id="sg"><stop offset="0" stop-color="#fff3c0" stop-opacity=".95"/><stop offset=".25" stop-color="#ffc060" stop-opacity=".6"/><stop offset="1" stop-color="#ff8a50" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="m1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a5aa8"/><stop offset="1" stop-color="#d27a98"/></linearGradient>` +
    `<linearGradient id="m2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a3a8c"/><stop offset="1" stop-color="#8a4a90"/></linearGradient>` +
    `<linearGradient id="m3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#352a6e"/><stop offset="1" stop-color="#4a2f78"/></linearGradient>` +
    `<linearGradient id="hl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1e55"/><stop offset=".35" stop-color="#1a1440"/><stop offset="1" stop-color="#0d0a26"/></linearGradient>` +
    `<linearGradient id="fg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d1648"/><stop offset="1" stop-color="#0b0922"/></linearGradient>` +
    `<radialGradient id="vg" cx=".5" cy=".45" r=".78"><stop offset=".55" stop-color="#0a0620" stop-opacity="0"/><stop offset="1" stop-color="#0a0620" stop-opacity=".6"/></radialGradient></defs>` +
    `<rect width="${W}" height="${H}" fill="url(#sk)"/>${stars}` +
    `<circle cx="${cx + 20}" cy="590" r="330" fill="url(#sg)"/><circle cx="${cx + 20}" cy="600" r="64" fill="#fff0b4"/>` + clouds +
    `<path d="${ridge(700, 150, 70, 11, 1.3)}" fill="url(#m1)"/><path d="${ridge(730, 140, 60, 22, 1.1)}" fill="url(#m2)"/>` +
    `<path d="M-20 ${H}L-20 760Q150 700 300 730T${W + 20} 680V${H}Z" fill="url(#m3)"/>` +
    `<path d="M60 ${H}Q150 960 260 800Q380 650 ${cx - 40} 612Q${cx + 30} 580 640 590Q690 592 ${W + 20} 600V${H}Z" fill="url(#hl)"/>` +
    `<path d="M260 800Q380 650 ${cx - 40} 612Q${cx + 30} 580 640 590Q690 592 ${W + 20} 600" fill="none" stroke="#ffb066" stroke-width="3" opacity=".5"/>` +
    castle +
    `<path d="M-20 ${H}V860Q200 800 420 850T${W + 20} 820V${H}Z" fill="url(#fg)"/>` +
    `<path d="M-20 ${H}V990Q240 930 460 975T${W + 20} 950V${H}Z" fill="#0a081f" opacity=".85"/>` +
    [[90, 140, 6], [160, 110, 5], [600, 170, 7], [560, 90, 5]].map(([x, y, s]) => `<path d="M${x} ${y}q${s} ${-s} ${2 * s} 0q${s} ${-s} ${2 * s} 0" fill="none" stroke="#2a1850" stroke-width="2.4" stroke-linecap="round" opacity=".7" transform="translate(0 ${y + 330})"/>`).join('') +
    `<rect width="${W}" height="${H}" fill="url(#vg)"/></svg>\n`;
  return svg;
}

mkdirSync(out, { recursive: true });
const b = board();
writeFileSync(join(out, 'bg_board.svg'), b.svg);
const m = menu();
writeFileSync(join(out, 'bg_menu.svg'), m);
console.log('bg_board', (b.svg.length / 1024).toFixed(1) + ' KB', JSON.stringify(b.counts));
console.log('bg_menu', (m.length / 1024).toFixed(1) + ' KB');
