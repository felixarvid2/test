// Renders the tower / castle / slot / projectile / fx SVGs onto contact sheets for review.
// Run: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/art/contact-sheet.mjs [outDir] [prefix]
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const SPRITES = join(dirname(fileURLToPath(import.meta.url)), '../../public/assets/sprites');
const OUT = process.argv[2] ?? '/tmp/claude-0/-home-user-test/84709e5b-5b69-5137-a969-1b91453c60a9/scratchpad';
const PREFIX = process.argv[3] ?? 'art-towers';
mkdirSync(OUT, { recursive: true });

const TOWERS = ['arrow', 'cannon', 'frost', 'lightning', 'fire', 'poison', 'sniper', 'magic'];
const PROJ = ['arrow', 'cannonball', 'frostShard', 'fireball', 'poisonGlob', 'magicOrb', 'shard', 'bomblet', 'meteor'];
const FX = ['spark', 'smoke', 'glow', 'ring', 'star', 'coin'];

const uri = (key) => {
  const p = join(SPRITES, `${key}.svg`);
  if (!existsSync(p)) return '';
  return 'data:image/svg+xml;base64,' + readFileSync(p).toString('base64');
};
const img = (key, size, extra = '') => `<img src="${uri(key)}" width="${size}" ${size ? '' : ''}height="${extra.h ?? size}" style="${extra.style ?? ''}">`;
const GRASS = '#7fbf4d';

const towerGrid = (size) => TOWERS.map((t) =>
  `<div class="row">${[1, 2, 3, 4, 5].map((l) => img(`tower_${t}_${l}`, size)).join('')}</div>`).join('');

const sheets = {
  [`${PREFIX}-1x`]: { w: 192 * 5 + 20, html: towerGrid(192) },
  [`${PREFIX}-small`]: {
    w: 5 * 96 + 5 * 64 + 60,
    html: `<div style="display:flex;gap:40px"><div>${towerGrid(96)}</div><div>${towerGrid(64)}</div></div>`,
  },
  [`${PREFIX}-misc`]: {
    w: 1000,
    html: `
      <div class="row">${img('castle', 384, { h: 256 })}${img('castle', 190, { h: 127 })}${img('slot_empty', 128)}${img('slot_locked', 128)}${img('slot_empty', 64)}${img('slot_locked', 64)}</div>
      <div class="row">${PROJ.map((k) => img(`proj_${k}`, 64)).join('')}</div>
      <div class="row">${PROJ.map((k) => img(`proj_${k}`, 32)).join('')}</div>
      <div class="row">${FX.map((k) => img(`fx_${k}`, 64)).join('')}</div>
      <div class="row" style="background:#2a2a40">${FX.map((k) => img(`fx_${k}`, 64)).join('')}</div>`,
  },
};

const browser = await chromium.launch();
for (const [name, s] of Object.entries(sheets)) {
  const page = await browser.newPage({ viewport: { width: s.w, height: 400 } });
  await page.setContent(`<style>body{margin:0;background:${GRASS};padding:10px}.row{display:flex;gap:0;align-items:flex-end;margin-bottom:6px}img{display:block}</style>${s.html}`);
  await page.waitForTimeout(150);
  const file = join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(file);
  await page.close();
}
await browser.close();
