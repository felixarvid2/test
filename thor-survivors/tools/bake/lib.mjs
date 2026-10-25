// Shared helpers: static server + browser launch.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const MODELS = path.resolve(HERE, '../../../assets/ashfall-ai/meshy/models');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json', '.wasm': 'application/wasm' };

export function startServer() {
  const roots = [['/three/', path.join(HERE, 'node_modules/three/')], ['/models/', MODELS + '/'], ['/', path.join(HERE, 'page/')]];
  const srv = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    for (const [prefix, dir] of roots) {
      if (!url.startsWith(prefix)) continue;
      const f = path.resolve(dir, url.slice(prefix.length) || 'index.html');
      if (!f.startsWith(dir.replace(/\/$/, '')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) continue;
      res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
      return fs.createReadStream(f).pipe(res);
    }
    res.writeHead(404); res.end();
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ srv, port: srv.address().port })));
}

export function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of fs.readdirSync(base).sort().reverse()) {
    const f = path.join(base, d, 'chrome-linux64/chrome');
    if (d.startsWith('chromium-') && fs.existsSync(f)) return f;
  }
  throw new Error('No Chromium found; set CHROME_PATH');
}

export async function openPage(port, opts = {}) {
  const browser = await chromium.launch({
    executablePath: chromePath(),
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
  });
  const page = await browser.newPage({ viewport: { width: 256, height: 256 } });
  page.on('pageerror', e => console.error('[page error]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('[page]', m.text()); });
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.waitForFunction('window.bakerReady === true', null, { timeout: 30000 });
  const info = await page.evaluate(o => window.baker.init(o), opts);
  return { browser, page, info };
}
