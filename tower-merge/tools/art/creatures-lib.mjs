// Shared SVG helpers for the creature / icon / background generators (style: docs/ART_STYLE.md).
// Cel shading is done with masks: shadow = shape minus itself shifted up-left (lower-right
// crescent), highlight = shape minus itself shifted down-right (upper-left crescent).
export const OUT = '#2b1d3a';

const h2r = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const mix = (a, b, t) => {
  const A = h2r(a), B = h2r(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
};
export const shade = (c, t = 0.3) => mix(c, '#2a1550', t);
export const light = (c, t = 0.34) => mix(c, '#ffffff', t);

const n1 = (v) => +v.toFixed(1);
export const ell = (cx, cy, rx, ry = rx) =>
  `M${n1(cx - rx)} ${n1(cy)}a${n1(rx)} ${n1(ry)} 0 1 0 ${n1(2 * rx)} 0a${n1(rx)} ${n1(ry)} 0 1 0 ${n1(-2 * rx)} 0z`;
export const rr = (x, y, w, h, r = 4) =>
  `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`;
/** Regular star / burst polygon. */
export const star = (cx, cy, ro, ri, n = 5, rot = -Math.PI / 2) => {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? ri : ro, a = rot + (i * Math.PI) / n;
    d += (i ? 'L' : 'M') + n1(cx + Math.cos(a) * r) + ' ' + n1(cy + Math.sin(a) * r);
  }
  return d + 'z';
};
export const poly = (pts) => 'M' + pts.map((p) => p.join(' ')).join('L') + 'z';

export class Art {
  /** id: unique prefix for gradient/mask ids; sw: outline width; k: cel crescent thickness. */
  constructor(id, w, h, sw, k) {
    Object.assign(this, { id, w, h, sw, k: k ?? Math.round(sw * 1.3), n: 0, defs: [], body: [] });
  }
  uid() { return this.id + (this.n++).toString(36); }
  add(s) { this.body.push(s); return this; }
  /** Filled shape with 3-tone cel shading and an outline. */
  cel(d, base, o = {}) {
    const { k = this.k, sw = this.sw, sh = true, hi = true, shc = shade(base), hic = light(base), line = true } = o;
    const id = this.uid(), { w, h } = this;
    this.defs.push(`<path id="${id}" d="${d}"/>`);
    const mask = (suffix, dx) =>
      `<mask id="${id}${suffix}" maskUnits="userSpaceOnUse" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#fff"/><use href="#${id}" transform="translate(${dx} ${dx})" fill="#000"/></mask>`;
    let s = `<use href="#${id}" fill="${base}"/>`;
    if (hi) { this.defs.push(mask('h', k)); s += `<use href="#${id}" fill="${hic}" mask="url(#${id}h)"/>`; }
    if (sh) { this.defs.push(mask('s', -k)); s += `<use href="#${id}" fill="${shc}" mask="url(#${id}s)"/>`; }
    if (line && sw) s += `<use href="#${id}" fill="none" stroke="${OUT}" stroke-width="${sw}"/>`;
    return this.add(s);
  }
  /** Flat (unshaded) filled shape with outline. */
  flat(d, fill, o = {}) {
    const { sw = this.sw, extra = '' } = o;
    return this.add(`<path d="${d}" fill="${fill}"${sw ? ` stroke="${OUT}" stroke-width="${sw}"` : ''}${extra}/>`);
  }
  /** Thick rounded line with an outline (limbs, handles, tails). */
  limb(d, color, w, o = {}) {
    const { sw = this.sw, hi = true } = o;
    let s = `<path d="${d}" fill="none" stroke="${OUT}" stroke-width="${w + sw * 1.5}"/><path d="${d}" fill="none" stroke="${color}" stroke-width="${w}"/>`;
    if (hi && w >= 8) s += `<path d="${d}" fill="none" stroke="${light(color)}" stroke-width="${n1(w * 0.28)}" transform="translate(${-w * 0.18} ${-w * 0.18})" opacity=".8"/>`;
    return this.add(s);
  }
  /** Plain stroke, no outline. */
  stroke(d, color, w, extra = '') {
    return this.add(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}"${extra}/>`);
  }
  dot(cx, cy, r, fill) { return this.add(`<circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(r)}" fill="${fill}"/>`); }
  /** Cartoon eye: white sclera, dark pupil looking (px,py) from centre, glint. */
  eye(cx, cy, rx, ry, o = {}) {
    const { px = rx * 0.3, py = 0, pr = rx * 0.55, sw = this.sw * 0.6, sclera = '#fff', pupil = OUT } = o;
    this.add(`<ellipse cx="${n1(cx)}" cy="${n1(cy)}" rx="${n1(rx)}" ry="${n1(ry)}" fill="${sclera}" stroke="${OUT}" stroke-width="${n1(sw)}"/>`);
    this.add(`<ellipse cx="${n1(cx + px)}" cy="${n1(cy + py)}" rx="${n1(pr)}" ry="${n1(pr * 1.15)}" fill="${pupil}"/>`);
    return this.dot(cx + px - pr * 0.3, cy + py - pr * 0.4, Math.max(1, pr * 0.32), '#fff');
  }
  shadow(cx, cy, rx, ry, op = 0.25) {
    return this.add(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#000" opacity="${op}"/>`);
  }
  /** Soft radial glow (magic, gems, runes). */
  glow(cx, cy, r, color, op = 0.9) {
    const id = this.uid();
    this.defs.push(`<radialGradient id="${id}"><stop offset="0" stop-color="${light(color, 0.6)}" stop-opacity="${op}"/><stop offset=".45" stop-color="${color}" stop-opacity="${op * 0.55}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`);
    return this.add(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id})"/>`);
  }
  /** Linear gradient fill id (vertical by default). */
  grad(stops, o = {}) {
    const id = this.uid(), { x2 = 0, y2 = 1 } = o;
    this.defs.push(`<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([off, c]) => `<stop offset="${off}" stop-color="${c}"/>`).join('')}</linearGradient>`);
    return `url(#${id})`;
  }
  toString() {
    const { w, h } = this;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${this.defs.join('')}</defs><g stroke-linejoin="round" stroke-linecap="round">${this.body.join('')}</g></svg>\n`;
  }
}
