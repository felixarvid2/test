// Review contact sheets for enemies, bosses, icons and backgrounds (Playwright screenshots).
// Usage: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/art/sheet-creatures.mjs [enemies|bosses|icons|bg ...]
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { BOSS_IDS, ENEMY_IDS, ICON_KEYS } from '../../src/data/types.ts';
import { PATH, PATH_WIDTH, SLOTS, SLOT_SIZE, CASTLE, BOARD, FLY_LANE } from '../../src/data/map.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sprites = join(root, 'public', 'assets', 'sprites');
const outDir = '/tmp/claude-0/-home-user-test/84709e5b-5b69-5137-a969-1b91453c60a9/scratchpad';
mkdirSync(outDir, { recursive: true });
const GRASS = '#7fbf4d', PATH_C = '#d9b27c', NAVY = '#1b2140';
const url = (k) => pathToFileURL(join(sprites, k + '.svg')).href + '?' + Date.now();
const has = (k) => existsSync(join(sprites, k + '.svg'));
const img = (k, s) => (has(k) ? `<img src="${url(k)}" width="${s}" height="${s}">` : `<div style="width:${s}px;height:${s}px;border:1px dashed red"></div>`);
const css = `body{margin:0;background:#333;font:11px sans-serif;color:#ddd}.row{display:flex;flex-wrap:wrap}.t{display:flex;align-items:center;justify-content:center;position:relative}.t small{position:absolute;left:2px;top:0;color:#000;opacity:.6;font-size:9px}h3{margin:6px 8px}`;

const sheets = {
  enemies() {
    const tile = (k, s, bg, w = s + 12) => `<div class="t" style="background:${bg};width:${w}px;height:${s + 12}px">${img(k, s)}</div>`;
    const ks = ENEMY_IDS.map((e) => 'enemy_' + e);
    let h = `<h3>1x on grass / path</h3><div class="row">${ks.map((k) => tile(k, 128, GRASS)).join('')}</div><div class="row">${ks.map((k) => tile(k, 128, PATH_C)).join('')}</div>`;
    h += `<h3>in-game 64 / 48 px (grass | path)</h3><div class="row">${ks.map((k) => tile(k, 64, GRASS, 70) + tile(k, 64, PATH_C, 70) + tile(k, 48, GRASS, 56) + tile(k, 48, PATH_C, 56)).join('')}</div>`;
    return { html: h, width: 1420, name: 'enemies' };
  },
  zoom() {
    const ks = ENEMY_IDS.map((e) => 'enemy_' + e);
    return { html: `<div class="row">${ks.map((k, i) => `<div class="t" style="background:${i % 2 ? PATH_C : GRASS};width:256px;height:256px">${img(k, 256)}</div>`).join('')}</div>`, width: 1280, name: 'zoom' };
  },
  bosses() {
    const ks = BOSS_IDS.map((e) => 'boss_' + e);
    const t = (k, s, bg) => `<div class="t" style="background:${bg};width:${s + 8}px;height:${s + 8}px">${img(k, s)}</div>`;
    return { html: `<div class="row">${ks.map((k) => t(k, 320, GRASS)).join('')}</div><div class="row">${ks.map((k) => t(k, 320, PATH_C)).join('')}</div><h3>170 px</h3><div class="row">${ks.map((k) => t(k, 170, GRASS) + t(k, 170, PATH_C)).join('')}</div>`, width: 1000, name: 'bosses' };
  },
  icons() {
    const ks = ICON_KEYS.map((k) => 'icon_' + k);
    const t = (k, s) => `<div class="t" style="background:${NAVY};width:${s + 14}px;height:${s + 14}px">${img(k, s)}</div>`;
    return { html: `<div class="row">${ks.map((k) => t(k, 96)).join('')}</div><h3>40 px</h3><div class="row">${ks.map((k) => t(k, 40)).join('')}</div><h3>on badges 56px</h3><div class="row">${ks.map((k, i) => `<div class="t" style="width:70px;height:70px;background:${NAVY}"><div style="width:56px;height:56px;border-radius:50%;background:hsl(${(i * 47) % 360} 45% 45%);display:flex;align-items:center;justify-content:center">${img(k, 40)}</div></div>`).join('')}</div>`, width: 1450, name: 'icons' };
  },
  bg() {
    const s = 0.62, W = 720 * s, H = 1280 * s;
    const pts = PATH.map((p) => `${p.x},${p.y}`).join(' ');
    const board = `<div style="position:relative;width:${W}px;height:${H}px"><img src="${url('bg_board')}" width="${W}" height="${H}"><svg style="position:absolute;left:0;top:0" width="${W}" height="${H}" viewBox="0 0 720 1280"><polyline points="${pts}" fill="none" stroke="${PATH_C}" stroke-opacity=".75" stroke-width="${PATH_WIDTH}" stroke-linejoin="round"/><polyline points="${pts}" fill="none" stroke="#f0f" stroke-opacity=".5" stroke-width="${PATH_WIDTH + 60}" stroke-linejoin="round"/>${SLOTS.map((p) => `<rect x="${p.x - SLOT_SIZE / 2}" y="${p.y - SLOT_SIZE / 2}" width="${SLOT_SIZE}" height="${SLOT_SIZE}" rx="14" fill="#8d8fa8" fill-opacity=".7" stroke="#2b1d3a" stroke-width="3"/>`).join('')}<rect x="${CASTLE.x - CASTLE.width / 2}" y="${CASTLE.y - CASTLE.height / 2}" width="${CASTLE.width}" height="${CASTLE.height}" fill="#fc0" fill-opacity=".5"/><line x1="0" x2="720" y1="${BOARD.top}" y2="${BOARD.top}" stroke="#fff"/><line x1="0" x2="720" y1="${BOARD.bottom}" y2="${BOARD.bottom}" stroke="#fff"/><line x1="${FLY_LANE[0].x}" y1="${FLY_LANE[0].y}" x2="${FLY_LANE[1].x}" y2="${FLY_LANE[1].y}" stroke="#0ff" stroke-dasharray="8 6" stroke-width="3"/></svg></div>`;
    const plain = `<img src="${url('bg_board')}" width="${W}" height="${H}">`;
    const menu = `<img src="${url('bg_menu')}" width="${W}" height="${H}">`;
    return { html: `<div class="row" style="gap:6px">${board}${plain}${menu}</div>`, width: Math.ceil(W * 3 + 14), name: 'bg' };
  },
};

// crop: node sheet-creatures.mjs crop <sprite key> x y w h scale  -> art-creatures-crop.png (sprite in world px)
if (process.argv[2] === 'crop') {
  const [, , , key, x, y, w, h, sc] = process.argv.map((v, i) => (i > 3 ? +v : v));
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: Math.round(w * sc), height: Math.round(h * sc) } });
  const f = join(outDir, 'art-creatures-crop.html');
  writeFileSync(f, `<body style="margin:0"><div style="width:${w * sc}px;height:${h * sc}px;overflow:hidden;position:relative"><img src="${url(key)}" style="position:absolute;left:${-x * sc}px;top:${-y * sc}px;width:${(key.startsWith('boss') ? 320 : key.startsWith('bg') ? 720 : 128) * sc}px"></div>`);
  await pg.goto(pathToFileURL(f).href);
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: join(outDir, 'art-creatures-crop.png') });
  await b.close();
  console.log(join(outDir, 'art-creatures-crop.png'));
  process.exit(0);
}
const which = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(sheets).filter((k) => k !== 'zoom');
const browser = await chromium.launch();
for (const name of which) {
  const { html, width, name: n } = sheets[name]();
  const page = await browser.newPage({ viewport: { width, height: 400 } });
  const f = join(outDir, `art-creatures-${n}.html`);
  writeFileSync(f, `<!doctype html><meta charset=utf-8><style>${css}</style>${html}`);
  await page.goto(pathToFileURL(f).href);
  await page.waitForLoadState('load');
  await page.waitForTimeout(300);
  const png = join(outDir, `art-creatures-${n}.png`);
  await page.screenshot({ path: png, fullPage: true });
  console.log(png);
  await page.close();
}
await browser.close();
