// Färgar Kenneys vita ramar (Fantasy UI Borders, CC0) i spelets färger.
// Körs en gång lokalt: node rune/tools/tint-borders.js <mapp med kenney_fantasy-ui-borders/PNG>
// Kräver Playwright (Chromium) för canvas-färgningen.
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const SRC = process.argv[2];
const OUT = path.join(__dirname, '..', 'assets', 'ui');
const JOBS = [
  ['Default/Border/panel-border-016.png', { 'frame-panel': '#6d58a8', 'frame-gold': '#ffc63d', 'frame-red': '#ff4d6a' }],
  ['Double/Border/panel-border-007.png', { 'frame-board': '#c9a24a' }],
  ['Default/Border/panel-border-001.png', { 'frame-btn': '#a993e6' }],
  ['Default/Divider Fade/divider-fade-003.png', { 'divider': '#ffc63d' }]
];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const [file, tints] of JOBS) {
    const data = 'data:image/png;base64,' + fs.readFileSync(path.join(SRC, file)).toString('base64');
    for (const [name, color] of Object.entries(tints)) {
      const out = await p.evaluate(async ([data, color]) => {
        const img = new Image(); img.src = data; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        g.globalCompositeOperation = 'source-in';
        g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
        return c.toDataURL('image/png');
      }, [data, color]);
      fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(out.split(',')[1], 'base64'));
      console.log(name);
    }
  }
  await b.close();
})();
