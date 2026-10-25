#!/usr/bin/env node
// Contact sheets of the baked sprites on a dark rock ground.
// Usage: node preview.mjs [--baked DIR] [--out DIR] [--category enemies] [--only name,...]
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { HERE } from './lib.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const BAKED = path.resolve(opt('baked', path.join(HERE, '../../art-src/ashfall-baked')));
const OUT = path.resolve(opt('out', '/tmp/claude-0/-home-user/d0dfc086-ef88-5667-b470-075e1a2eb094/scratchpad/bake'));
const onlyCat = (opt('category', '') || '').split(',').filter(Boolean);
const only = (opt('only', '') || '').split(',').filter(Boolean);
const ROCK = path.resolve(HERE, '../../../assets/ashfall-ai/flux/textures/mine_rock.webp');
fs.mkdirSync(OUT, { recursive: true });

// Ground: the rock texture, darkened and tiled at 256 px.
const tile = await sharp(ROCK).resize(256, 256).modulate({ brightness: 0.4, saturation: 0.7 }).png().toBuffer();
async function ground(w, h) {
  const tiles = [];
  for (let y = 0; y < Math.ceil(h / 256) * 256; y += 256) for (let x = 0; x < Math.ceil(w / 256) * 256; x += 256) tiles.push({ input: tile, left: x, top: y });
  const bw = Math.ceil(w / 256) * 256, bh = Math.ceil(h / 256) * 256;
  return sharp({ create: { width: bw, height: bh, channels: 4, background: '#111' } }).composite(tiles).extract({ left: 0, top: 0, width: w, height: h }).png().toBuffer();
}
const label = (text, w) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="16"><text x="3" y="12" font-family="DejaVu Sans, sans-serif" font-size="11" fill="#e8d9b0" stroke="#000" stroke-width="2.5" paint-order="stroke">${text}</text></svg>`);

// Cut a frame out of the atlas and place it on a transparent logical canvas (frameSize x frameSize).
async function frameImage(atlas, m, [x, y, w, h, ox, oy], k = 1) {
  if (!w) return null;
  let input = await sharp(atlas).extract({ left: x, top: y, width: w, height: h }).png().toBuffer();
  if (k !== 1) input = await sharp(input).resize(Math.max(1, Math.round(w * k))).png().toBuffer();
  return { input, left: Math.round(ox * k), top: Math.round(oy * k) };
}

for (const cat of fs.readdirSync(BAKED).filter(c => fs.statSync(path.join(BAKED, c)).isDirectory()).sort()) {
  if (onlyCat.length && !onlyCat.includes(cat)) continue;
  const names = fs.readdirSync(path.join(BAKED, cat)).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).filter(n => !only.length || only.includes(n)).sort();
  const items = [];
  for (const n of names) {
    const m = JSON.parse(fs.readFileSync(path.join(BAKED, cat, n + '.json')));
    const atlas = fs.readFileSync(path.join(BAKED, cat, m.atlas));
    items.push({ m, atlas });
  }
  const layers = [];
  let W, H;
  if (cat === 'characters' || cat === 'enemies') {
    // Per model: row of the 8 directions (first frame of the main clip) + strip of the main clip facing SE.
    const scaleOf = m => (m.frameSize[0] > 256 ? 0.5 : 1);
    const cell = Math.max(...items.map(i => Math.round(i.m.frameSize[0] * scaleOf(i.m))));
    W = cell * 8 + 64; H = 0;
    const rows = [];
    for (const { m, atlas } of items) {
      const k = scaleOf(m), c = Math.round(m.frameSize[0] * k);
      const clipName = ['walk', 'run', 'idle', 'static'].find(k => m.clips[k]);
      const clip = m.clips[clipName];
      const dirs = m.directions.length;
      const r1 = [], r2 = [];
      for (let d = 0; d < dirs; d++) r1.push([d * c, await frameImage(atlas, m, clip.frames[d][0], k)]);
      const se = Math.min(1, dirs - 1);
      for (let f = 0; f < clip.count && f < 8; f++) r2.push([f * c, await frameImage(atlas, m, clip.frames[se][f], k)]);
      rows.push({ m, c, k, clipName, r1, r2 });
    }
    for (const row of rows) {
      for (const [r, cells] of [[0, row.r1], [1, row.r2]]) {
        const y = H + r * row.c;
        for (const [x, f] of cells) if (f) layers.push({ input: f.input, left: x + f.left, top: y + f.top });
        // feet marker
        layers.push({ input: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="5" height="5"><circle cx="2.5" cy="2.5" r="1.5" fill="#f0f"/></svg>'), left: 0, top: 0, _skip: true });
        layers.pop();
      }
      layers.push({ input: label(`${row.m.name} - ${row.clipName} dirs ${row.m.directions.join(' ')} / SE strip - frame ${row.m.frameSize[0]}px${row.k < 1 ? ' (shown 50%)' : ''}, ${row.m.pxPerMetre} px/m`, 900), left: 2, top: H + 2 });
      H += row.c * 2;
    }
  } else {
    // Static sprites: shelf layout, each at 1x (halved above 256 px so the sheet stays viewable).
    W = 2048; let x = 0, y = 0, rowH = 0;
    for (const { m, atlas } of items) {
      const c = m.frameSize[0], k = c > 256 ? 0.5 : 1, cw = Math.round(c * k);
      if (x + cw > W) { x = 0; y += rowH; rowH = 0; }
      const f = await frameImage(atlas, m, m.clips.static.frames[0][0]);
      if (f) {
        const img = k === 1 ? f.input : await sharp(f.input).resize(Math.max(1, Math.round((await sharp(f.input).metadata()).width * k))).png().toBuffer();
        layers.push({ input: img, left: x + Math.round(f.left * k), top: y + Math.round(f.top * k) });
      }
      layers.push({ input: label(`${m.name}${k < 1 ? ' (50%)' : ''} ${c}px ${m.pxPerMetre}ppm`, Math.max(cw, 150)), left: x + 1, top: y + 1 });
      x += cw; rowH = Math.max(rowH, cw);
    }
    H = y + rowH + 64;
  }
  if (cat === 'characters' || cat === 'enemies') H += 64;
  const bg = await ground(W, H);
  const safe = layers.filter(l => !l._skip).map(({ input, left, top }) => ({ input, left: Math.max(0, left), top: Math.max(0, top) }));
  const file = path.join(OUT, `${cat}.png`);
  await sharp(bg).composite(safe).png().toFile(file);
  console.log(file, W + 'x' + H);
}
