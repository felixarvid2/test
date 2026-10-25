#!/usr/bin/env node
// Bakes Ashfall GLB models into 8-direction 2D sprite atlases (PNG + JSON) for Thor Survivors.
// Usage: node bake.mjs [--only a,b] [--category enemies] [--out DIR] [--ss 3] [--ppm 64]
//                      [--elevation 38] [--no-outline] [--no-quant] [--list] [--check]
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { startServer, openPage, MODELS, HERE } from './lib.mjs';

// ---------------------------------------------------------------- options
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : (argv[i + 1] ?? true); };
const flag = n => argv.includes('--' + n);
const OUT = path.resolve(opt('out', path.join(HERE, '../../art-src/ashfall-baked')));
const SS = +opt('ss', 3);                 // supersampling factor (render at SS x, downscale)
const PPM = +opt('ppm', 64);              // pixels per metre (horizontal) -> a 1.8 m human is ~96 px tall
const ELEV = +opt('elevation', 38);       // camera elevation above the ground plane, degrees
const OUTLINE = !flag('no-outline');
const QUANT = !flag('no-quant');
const only = (opt('only', '') || '').split(',').filter(Boolean);
const onlyCat = (opt('category', '') || '').split(',').filter(Boolean);

// ---------------------------------------------------------------- conventions
// Yaw step i*45 deg turns the model from facing the camera (S) clockwise as seen on screen.
export const DIRECTIONS = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'];
const FRAME_COUNT = { idle: 4, walk: 8, run: 8, attack: 7, attack2: 7, hit: 3, death: 8 }; // others: 6
const LOOPS = new Set(['idle', 'walk', 'run']);
const SIZES = [32, 48, 64, 96, 128, 160, 192, 256, 320, 384, 448, 512];
const MAX_FRAME = 512;
const MARGIN = 2; // px around the measured silhouette (plus the outline)
const OUTLINE_RGBA = [8, 6, 5];

const catList = fs.readdirSync(MODELS).filter(c => fs.statSync(path.join(MODELS, c)).isDirectory()).sort();
const jobs = [];
for (const category of catList) {
  if (onlyCat.length && !onlyCat.includes(category)) continue;
  for (const f of fs.readdirSync(path.join(MODELS, category)).sort()) {
    if (!f.endsWith('.glb')) continue;
    const name = f.slice(0, -4);
    if (only.length && !only.includes(name)) continue;
    jobs.push({ category, name, file: path.join(MODELS, category, f) });
  }
}
if (flag('list')) { for (const j of jobs) console.log(j.category + '/' + j.name); process.exit(0); }

// ---------------------------------------------------------------- helpers
const frameCount = c => FRAME_COUNT[c] ?? 6;
const sampleT = (i, n, dur, loop) => (n <= 1 ? 0 : loop ? (i / n) * dur : (i / (n - 1)) * dur);
const round = (v, d = 2) => +v.toFixed(d);

// Dark rim: 1 px outline around the silhouette, in a near-black brown.
function addOutline(px, W) {
  const out = Buffer.from(px);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (px[i + 3] >= 255) continue;
    let m = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= W) continue;
      const a = px[(yy * W + xx) * 4 + 3];
      if (a > m) m = a;
    }
    const a = Math.round(m * 0.75);
    if (a > px[i + 3]) { // blend outline under the existing (semi-transparent edge) pixel
      const own = px[i + 3] / 255, oa = a / 255;
      const ta = own + oa * (1 - own);
      for (let c = 0; c < 3; c++) out[i + c] = Math.round((px[i + c] * own + OUTLINE_RGBA[c] * oa * (1 - own)) / ta);
      out[i + 3] = Math.round(ta * 255);
    }
  }
  return out;
}

function alphaBounds(px, W) {
  let x0 = W, y0 = W, x1 = -1, y1 = -1;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    if (px[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return x1 < 0 ? null : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}

function crop(px, W, [bx, by, bw, bh]) {
  const out = Buffer.alloc(bw * bh * 4);
  for (let y = 0; y < bh; y++) px.copy(out, y * bw * 4, ((by + y) * W + bx) * 4, ((by + y) * W + bx + bw) * 4);
  return out;
}

// Shelf packer (deterministic). Returns {w,h,pos[]} for the width with the smallest area.
function pack(rects, pad = 1) {
  const order = rects.map((r, i) => i).filter(i => rects[i].w > 0).sort((a, b) => rects[b].h - rects[a].h || a - b);
  let best = null;
  for (const W of [256, 512, 1024, 2048]) {
    if (rects.some(r => r.w + 2 * pad > W)) continue;
    const pos = new Array(rects.length).fill(null);
    let x = pad, y = pad, rowH = 0;
    for (const i of order) {
      const { w, h } = rects[i];
      if (x + w + pad > W) { x = pad; y += rowH + pad; rowH = 0; }
      pos[i] = [x, y]; x += w + pad; rowH = Math.max(rowH, h);
    }
    const H = y + rowH + pad;
    if (!best || W * H < best.w * best.h) best = { w: W, h: H, pos };
  }
  return best;
}

// ---------------------------------------------------------------- bake one model
async function bake(page, job) {
  const { category, name } = job;
  const meta = await page.evaluate(u => window.baker.load(u), `/models/${category}/${path.basename(job.file)}`);
  const rigged = meta.clips.length > 0;
  const multiDir = category === 'characters' || category === 'enemies';
  const dirCount = multiDir ? 8 : 1;
  const minSize = multiDir ? 128 : 32;

  // Clip plan: every clip of the file, or one "static" frame.
  const clips = rigged
    ? meta.clips.filter(c => c.duration > 0).map(c => ({ name: c.name, n: frameCount(c.name), duration: c.duration, loop: LOOPS.has(c.name) }))
    : [{ name: 'static', n: 1, duration: 0, loop: false, none: true }];
  const poseOf = (clip, i) => ({ clip: clip.none ? null : clip.name, t: sampleT(i, clip.n, clip.duration, clip.loop) });

  // Pass 1: measure the union of silhouettes (half-res), pick ppm, frame size and anchor.
  const PM = 512, AXM = 256, AYM = 384; // measure canvas and anchor (in half-res px)
  let ppm = PPM, union, size, anchor;
  for (let attempt = 0; attempt < 40; attempt++) {
    const m = await page.evaluate(({ clips, dirCount, ppm, PM, AXM, AYM }) => {
      let u = [1e9, 1e9, -1, -1];
      const per = {};
      for (const c of clips) for (let i = 0; i < c.n; i++) for (let d = 0; d < dirCount; d++) {
        const b = window.baker.measure({ clip: c.clip, t: c.t[i], yawDeg: d * 45, size: PM, ppm: ppm / 2, anchorX: AXM, anchorY: AYM });
        if (b) {
          u = [Math.min(u[0], b[0]), Math.min(u[1], b[1]), Math.max(u[2], b[2]), Math.max(u[3], b[3])];
          const p = per[c.name] ??= [1e9, 1e9, -1, -1];
          per[c.name] = [Math.min(p[0], b[0]), Math.min(p[1], b[1]), Math.max(p[2], b[2]), Math.max(p[3], b[3])];
        }
      }
      u.per = per;
      return { u, per };
    }, { clips: clips.map(c => ({ name: c.name, clip: poseOf(c, 0).clip, n: c.n, t: Array.from({ length: c.n }, (_, i) => poseOf(c, i).t) })), dirCount, ppm, PM, AXM, AYM });
    union = m.u;
    if (flag('verbose')) console.log('  ppm', ppm, 'per-clip bounds (half-res, anchor 256,384):', JSON.stringify(m.per));
    if (union[2] < 0) throw new Error('model renders empty');
    const touches = union[0] <= 1 || union[1] <= 1 || union[2] >= PM - 2 || union[3] >= PM - 2;
    const left = (AXM - union[0]) * 2 + MARGIN + 1, right = (union[2] + 1 - AXM) * 2 + MARGIN + 1;
    const above = (AYM - union[1]) * 2 + MARGIN + 1, below = (union[3] + 1 - AYM) * 2 + MARGIN + 1;
    const need = Math.max(2 * Math.max(left, right), above + below);
    if (touches || need > MAX_FRAME) { ppm = round(ppm * (touches ? 0.7 : Math.min(0.95, (MAX_FRAME / need) * 0.98)), 2); continue; }
    size = SIZES.find(s => s >= Math.max(need, minSize));
    const ax = size / 2;
    const ay = above + Math.floor((size - above - below) / 2);
    anchor = [ax, ay];
    break;
  }
  if (!size) throw new Error('could not fit model');

  // Pass 2: render every frame at SS x, downscale, outline, measure, trim.
  const W = size;
  const frames = []; // {clip, dir, i, px, bounds}
  for (const c of clips) for (let d = 0; d < dirCount; d++) for (let i = 0; i < c.n; i++) {
    const { clip, t } = poseOf(c, i);
    const b64 = await page.evaluate(p => window.baker.render(p), { clip, t, yawDeg: d * 45, size: W, ppm, anchorX: anchor[0], anchorY: anchor[1], ss: SS });
    const hi = Buffer.from(b64, 'base64');
    let px = await sharp(hi, { raw: { width: W * SS, height: W * SS, channels: 4 } }).resize(W, W, { kernel: 'lanczos3' }).raw().toBuffer();
    if (OUTLINE) px = addOutline(px, W);
    frames.push({ clip: c.name, dir: d, i, px, bounds: alphaBounds(px, W) });
  }

  // Pack trimmed frames into one atlas.
  const rects = frames.map(f => ({ w: f.bounds ? f.bounds[2] : 0, h: f.bounds ? f.bounds[3] : 0 }));
  const packed = pack(rects);
  const composites = frames.map((f, k) => f.bounds && ({ input: crop(f.px, W, f.bounds), raw: { width: f.bounds[2], height: f.bounds[3], channels: 4 }, left: packed.pos[k][0], top: packed.pos[k][1] })).filter(Boolean);
  let img = sharp({ create: { width: packed.w, height: packed.h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(composites);
  const png = await img.png(QUANT ? { palette: true, colours: 256, quality: 85, effort: 10, dither: 0.6 } : { compressionLevel: 9 }).toBuffer();

  // Manifest: frames[dir][i] = [x, y, w, h, ox, oy]; (ox, oy) is the trim offset inside the logical frame,
  // so the opaque bounds of a frame are [ox, oy, w, h]. Empty frames are [0,0,0,0,0,0].
  const manifest = {
    name, category, source: `assets/ashfall-ai/meshy/models/${category}/${name}.glb`,
    atlas: `${name}.png`, atlasSize: [packed.w, packed.h],
    frameSize: [W, W], anchor, // anchor = feet point (ground contact, model origin) in logical frame px
    pxPerMetre: ppm, camera: { type: 'orthographic', elevationDeg: ELEV, supersample: SS },
    modelSizeM: meta.size.map(v => round(v)),
    directions: multiDir ? DIRECTIONS : ['S'], // yaw step 45 deg clockwise on screen; S faces the camera
    clips: {},
  };
  let k = 0;
  for (const c of clips) {
    const dirs = [];
    for (let d = 0; d < dirCount; d++) {
      const row = [];
      for (let i = 0; i < c.n; i++, k++) {
        const f = frames[k], r = packed.pos[k];
        row.push(f.bounds ? [r[0], r[1], f.bounds[2], f.bounds[3], f.bounds[0], f.bounds[1]] : [0, 0, 0, 0, 0, 0]);
      }
      dirs.push(row);
    }
    // fps: loops play N frames per cycle; one-shots play N-1 intervals over the clip duration.
    const fps = c.duration ? round(Math.min(30, Math.max(1, (c.loop ? c.n : Math.max(1, c.n - 1)) / c.duration)), 1) : 0;
    manifest.clips[c.name] = { fps, count: c.n, loop: c.loop, duration: round(c.duration), frames: dirs };
  }
  const dir = path.join(OUT, category);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.png`), png);
  fs.writeFileSync(path.join(dir, `${name}.json`), compactJson(manifest) + '\n');
  return { name, category, frameSize: W, ppm, frames: frames.length, atlas: [packed.w, packed.h], bytes: png.length, clips: clips.map(c => c.name) };
}

// JSON with frame rects on one line each.
function compactJson(o) {
  return JSON.stringify(o, null, 1).replace(/\[\s+(-?[\d.]+(?:,\s+-?[\d.]+)*)\s+\]/g, (m, inner) => '[' + inner.replace(/\s+/g, '') + ']');
}

// ---------------------------------------------------------------- main
const t0 = Date.now();
const { srv, port } = await startServer();
const { browser, page, info } = await openPage(port, { elevation: ELEV });
console.log('WebGL renderer:', info.renderer, '|', info.version);
if (flag('check')) { await browser.close(); srv.close(); process.exit(0); }
const results = [], failed = [];
for (const job of jobs) {
  const t1 = Date.now();
  try {
    const r = await bake(page, job);
    results.push(r);
    console.log(`${job.category}/${job.name}: frame ${r.frameSize}px, ppm ${r.ppm}, ${r.frames} frames, atlas ${r.atlas.join('x')}, ${(r.bytes / 1024).toFixed(0)} KB, ${((Date.now() - t1) / 1000).toFixed(1)}s`);
  } catch (e) { failed.push(job.name); console.error(`FAILED ${job.category}/${job.name}:`, e.message); }
}
await browser.close(); srv.close();
const byCat = {};
for (const r of results) { byCat[r.category] ??= { n: 0, bytes: 0 }; byCat[r.category].n++; byCat[r.category].bytes += r.bytes; }
for (const [c, v] of Object.entries(byCat)) console.log(`${c}: ${v.n} models, ${(v.bytes / 1048576).toFixed(2)} MB`);
console.log(`total ${(results.reduce((s, r) => s + r.bytes, 0) / 1048576).toFixed(2)} MB in ${((Date.now() - t0) / 1000).toFixed(0)}s${failed.length ? '; FAILED: ' + failed.join(', ') : ''}`);
process.exit(failed.length ? 1 : 0);
