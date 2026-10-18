// Shared SVG building blocks for the tower / castle / projectile art (style: docs/ART_STYLE.md).
// A Doc collects <defs> and body elements; shapes are described by path functions d(dx, dy) so the
// 3-tone cel shading (shadow lower-right, highlight upper-left) can be made from offset copies.
export const OUT = '#2b1d3a';

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (a) => '#' + a.map((v) => clamp(v).toString(16).padStart(2, '0')).join('');
export const mix = (a, b, t) => {
  const x = rgb(a), y = rgb(b);
  return hex(x.map((v, i) => v + (y[i] - v) * t));
};
/** 3-tone material from a base colour (shadow ~25% darker and cooler, highlight ~25% lighter). */
export const mat = (b, s, h) => ({ b, s: s ?? mix(b, '#2b1d3a', 0.3), h: h ?? mix(b, '#ffffff', 0.3) });
export const STONE = mat('#8d8fa8', '#686a85', '#b9bbd1');
export const WOOD = mat('#a8673a', '#7a4523', '#cf8c55');
export const GOLD = mat('#f5c542', '#c48a1c', '#ffe58a');
export const IRON = mat('#4a4f63');
export const BLUE = mat('#3f7fd1', '#2d5ea5', '#6aa6ec');

export const f = (n) => String(Math.round(n * 2) / 2);

// ---- path shape factories: each returns d(dx, dy) ----
export const poly = (pts) => (dx = 0, dy = 0) =>
  'M' + pts.map(([x, y]) => `${f(x + dx)} ${f(y + dy)}`).join('L') + 'Z';
export const ell = (cx, cy, rx, ry) => (dx = 0, dy = 0) =>
  `M${f(cx - rx + dx)} ${f(cy + dy)}a${f(rx)} ${f(ry)} 0 1 0 ${f(2 * rx)} 0a${f(rx)} ${f(ry)} 0 1 0 ${f(-2 * rx)} 0Z`;
export const circ = (cx, cy, r) => ell(cx, cy, r, r);
export const rect = (x, y, w, h, r = 0) => (dx = 0, dy = 0) => {
  const X = x + dx, Y = y + dy;
  if (!r) return `M${f(X)} ${f(Y)}h${f(w)}v${f(h)}h${f(-w)}Z`;
  return `M${f(X + r)} ${f(Y)}h${f(w - 2 * r)}q${r} 0 ${r} ${r}v${f(h - 2 * r)}q0 ${r} ${-r} ${r}h${f(-(w - 2 * r))}q${-r} 0 ${-r} ${-r}v${f(-(h - 2 * r))}q0 ${-r} ${r} ${-r}Z`;
};
/** Free path: segments is a function (dx,dy)=>string. */
export const raw = (fn) => fn;
/** Tapered cylinder: bottom ellipse centre (cx,yb), height h, half widths wb (bottom) / wt (top). */
export const cylD = (cx, yb, h, wb, wt, k = 0.28) => (dx = 0, dy = 0) => {
  const yt = yb - h;
  return `M${f(cx - wb + dx)} ${f(yb + dy)}L${f(cx - wt + dx)} ${f(yt + dy)}L${f(cx + wt + dx)} ${f(yt + dy)}L${f(cx + wb + dx)} ${f(yb + dy)}A${f(wb)} ${f(wb * k)} 0 0 1 ${f(cx - wb + dx)} ${f(yb + dy)}Z`;
};

export class Doc {
  constructor(w, h, prefix, outline = 6) {
    this.w = w; this.h = h; this.p = prefix; this.sw = outline;
    this.defs = []; this.out = []; this.n = 0;
  }
  id(k = 's') { return `${this.p}${k}${this.n++}`; }
  add(s) { this.out.push(s); return this; }
  /** Radial gradient (colour stops [offset, colour, opacity]); returns url(#id). */
  radial(stops, cx = 0.5, cy = 0.5, r = 0.5, fx = cx, fy = cy) {
    const id = this.id('g');
    this.defs.push(`<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}" fx="${fx}" fy="${fy}">` +
      stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a < 1 ? ` stop-opacity="${a}"` : ''}/>`).join('') + '</radialGradient>');
    return `url(#${id})`;
  }
  linear(stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1) {
    const id = this.id('g');
    this.defs.push(`<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` +
      stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}"${a < 1 ? ` stop-opacity="${a}"` : ''}/>`).join('') + '</linearGradient>');
    return `url(#${id})`;
  }
  /** Plain outlined (or unoutlined) fill. */
  fill(d, fill, o = {}) {
    const ex = o.stroke === false ? ' stroke="none"' : o.sw ? ` stroke-width="${o.sw}"` : '';
    this.add(`<path d="${d()}" fill="${fill}"${ex}${o.extra ?? ''}/>`);
  }
  /**
   * Cel-shaded outlined shape. m = {b,s,h}. o.sh=[ax,ay] width of the lower-right shadow crescent,
   * o.hi=[bx,by] width of the upper-left highlight crescent (omit/null to skip either), o.inner =
   * svg drawn inside the clip (bricks, stripes), o.base overrides the base fill. Built from three
   * translated <use> copies of one path, so the geometry is only stored once.
   */
  shape(d, m, o = {}) {
    const sh = o.sh === undefined ? [3, 3] : o.sh, hi = o.hi ?? null;
    const id = this.id('p');
    this.defs.push(`<path id="${id}" d="${d()}"/>`, `<clipPath id="c${id}"><use href="#${id}"/></clipPath>`);
    const base = o.base ?? m.b;
    const u = (x, y, c) => `<use href="#${id}"${x || y ? ` transform="translate(${f(x)} ${f(y)})"` : ''} fill="${c}"/>`;
    let g = `<g clip-path="url(#c${id})" stroke="none">`;
    const [hx, hy] = hi ?? [0, 0];
    if (hi && sh) g += u(0, 0, m.h) + u(hx, hy, m.s) + u(hx - sh[0], hy - sh[1], base);
    else if (hi) g += u(0, 0, m.h) + u(hx, hy, base);
    else if (sh) g += u(0, 0, m.s) + u(-sh[0], -sh[1], base);
    else g += u(0, 0, base);
    if (o.inner) g += o.inner;
    g += o.sw === 0 ? '</g>' : `</g><use href="#${id}" fill="none"${o.sw ? ` stroke-width="${o.sw}"` : ''}/>`;
    this.add(g);
  }
  /** Records body elements produced by fn() into a reusable <g id> in defs; returns its id. */
  group(fn) {
    const id = this.id('r');
    const saved = this.out;
    this.out = [];
    fn();
    this.defs.push(`<g id="${id}">${this.out.join('')}</g>`);
    this.out = saved;
    return id;
  }
  use(id, x = 0, y = 0) { this.add(`<use href="#${id}" x="${f(x)}" y="${f(y)}"/>`); }
  toString(extraRoot = '') {
    const sw = this.sw;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.w}" height="${this.h}" viewBox="0 0 ${this.w} ${this.h}"${extraRoot}>` +
      (this.defs.length ? `<defs>${this.defs.join('')}</defs>` : '') +
      `<g stroke="${OUT}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round">${this.out.join('')}</g></svg>\n`;
  }
}

/** Soft ground shadow ellipse (25% black). */
export const groundShadow = (doc, cx, cy, rx, ry) =>
  doc.add(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#000" fill-opacity=".25" stroke="none"/>`);

/** Curved brick courses for a tapered stone cylinder (drawn inside a clip). */
export function bricks(cx, yb, h, wb, wt, rows, col, k = 0.28) {
  let s = '';
  const sag = (w) => w * k * 0.9;
  for (let i = 1; i <= rows; i++) {
    const t = i / (rows + 1);
    const y = yb - h * t;
    const w = wb + (wt - wb) * t;
    s += `M${f(cx - w)} ${f(y)}Q${f(cx)} ${f(y + sag(w) * 2)} ${f(cx + w)} ${f(y)}`;
    // vertical joints, staggered
    const y2 = yb - h * ((i + 1) / (rows + 1));
    const w2 = wb + (wt - wb) * ((i + 1) / (rows + 1));
    const n = 3;
    for (let j = 0; j < n; j++) {
      const u = ((j + (i % 2 ? 0.25 : 0.75)) / n) * 2 - 1; // -1..1
      const xa = cx + u * w, xb = cx + u * w2;
      const ya = y + sag(w) * (1 - u * u) * 1.0, yb2 = y2 + sag(w2) * (1 - u * u) * 1.0;
      s += `M${f(xa)} ${f(ya)}L${f(xb)} ${f(yb2)}`;
    }
  }
  return `<path d="${s}" fill="none" stroke="${col}" stroke-width="2.2" stroke-opacity=".75"/>`;
}

/** Vertical plank lines for a wooden cylinder. */
export function planks(cx, yb, h, wb, wt, col, n = 3, k = 0.28) {
  let s = '';
  for (let j = 1; j < n; j++) {
    const u = (j / n) * 2 - 1;
    s += `M${f(cx + u * wt)} ${f(yb - h)}L${f(cx + u * wb)} ${f(yb + wb * k * Math.sqrt(1 - u * u))}`;
  }
  return `<path d="${s}" fill="none" stroke="${col}" stroke-width="2.4" stroke-opacity=".8"/>`;
}

/** Hanging banner (swallow-tail) with rod. Returns nothing; draws into doc. */
export function banner(doc, x, y, w, h, c, trim = GOLD, withTrim = false) {
  const m = mat(c);
  const d = poly([[x - w / 2, y], [x + w / 2, y], [x + w / 2, y + h], [x, y + h - h * 0.2], [x - w / 2, y + h]]);
  doc.shape(d, m, { sh: [w * 0.28, 0], hi: [w * 0.16, 0], sw: 4,
    inner: withTrim ? `<path d="${poly([[x - w, y + h * 0.18], [x + w, y + h * 0.18], [x + w, y + h * 0.3], [x - w, y + h * 0.3]])()}" fill="${trim.b}"/>` : '' });
  doc.fill(rect(x - w / 2 - 2, y - 3, w + 4, 5, 2), WOOD.b, { sw: 3.5 });
}

export const star4 = (cx, cy, r, c, rot = 0, pinch = 0.28) => {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = rot + (i * Math.PI) / 4 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * pinch;
    pts.push(`${f(cx + Math.cos(a) * rr)} ${f(cy + Math.sin(a) * rr)}`);
  }
  return `<path d="M${pts.join('L')}Z" fill="${c}" stroke="none"/>`;
};
