import fs from 'node:fs';
import path from 'node:path';
import { startServer, openPage, MODELS } from './lib.mjs';
const { srv, port } = await startServer();
const { browser, page, info } = await openPage(port);
console.log('renderer:', info);
for (const cat of fs.readdirSync(MODELS)) for (const f of fs.readdirSync(path.join(MODELS, cat)).sort()) {
  const r = await page.evaluate(u => window.baker.load(u), `/models/${cat}/${f}`);
  console.log(cat, f.padEnd(26), r.size.map(v => v.toFixed(2)).join(' x '), r.clips.map(c => c.name + ':' + c.duration.toFixed(2)).join(' '));
}
await browser.close(); srv.close();
