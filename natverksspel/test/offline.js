// Spelet öppnat direkt från disken (file://), utan webbserver. Kopierar spelet till en tillfällig mapp och
// kontrollerar att det fungerar med spelets egna modeller utan assets3d/offline.js, och att v9-testet
// (modeller, texturer, fotsteg) går igenom på file:// när paketet är byggt med tools/offline.js.
// HD-2D och 3D ska då inte få några blockerade filer.
const { chromium } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const src = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'krabba-offline-'));
fs.cpSync(src, dir, { recursive: true, filter: f => !/[\\/]test$/.test(f) && !/offline\.js$/.test(f) || /tools[\\/]offline\.js$/.test(f) });
const url = 'file://' + dir + '/index.html';
const errs = [];
async function open(b, mode) {
  const p = await b.newPage({ viewport: { width: 1100, height: 650 } });
  const r = { errs: [], blocked: [] };
  p.on('pageerror', e => r.errs.push(e.message));
  p.on('requestfailed', q => r.blocked.push(q.url().slice(dir.length + 8) + ' ' + (q.failure() || {}).errorText));
  p.on('console', m => { if (/Access to|CORS|SecurityError|cross-origin/i.test(m.text())) r.blocked.push(m.text().slice(0, 120)); });
  await p.addInitScript(m => { localStorage.setItem('krabba-passet.settings', JSON.stringify({ quality: 'medium', mode: m === 'hd2d' ? '2d' : m, modeChosen: true, tutorialDone: true, lastVersion: '11.1' })); }, mode);
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(4000);
  if (mode === 'hd2d') { await p.click('#menu [data-mode="hd2d"]'); await p.waitForTimeout(500); }
  await p.evaluate(() => { const g = NV.game; g.ui.hideMenu(); g.startWeek(3); g.ui.closeDialog(); });
  if (mode === '3d') await p.waitForFunction(() => NV.assets3d.ready() || !NV.assets3d.offline(), null, { timeout: 30000 }).catch(() => r.errs.push('modellerna blev aldrig klara'));
  await p.waitForTimeout(3000);
  Object.assign(r, await p.evaluate(() => ({ view: NV.game.viewName(), offline: NV.assets3d.offline(), ready: NV.assets3d.ready(), week: NV.game.def && NV.game.def.week })));
  await p.close();
  return r;
}
function check(name, r, want) {
  console.log(name + ': visning ' + r.view + ' · paket ' + r.offline + ' · modeller ' + r.ready + ' · blockerat ' + r.blocked.length);
  r.errs.forEach(e => errs.push(name + ': ' + e));
  if (r.week !== 3) errs.push(name + ': vecka 3 startade inte');
  if (r.view !== want.view) errs.push(name + ': visningen blev ' + r.view);
  if (r.offline !== want.offline) errs.push(name + ': paketet ' + (want.offline ? 'laddades inte' : 'laddades fast det saknas'));
  if (want.offline && r.blocked.length) errs.push(name + ': blockerade filer: ' + r.blocked.join(' · '));
  if (want.ready && !r.ready) errs.push(name + ': modellerna laddades inte');
}
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  // Utan paketet: spelets egna modeller, inga fel
  check('3D utan paket', await open(b, '3d'), { view: '3d', offline: false });
  // Med paketet
  console.log(cp.execFileSync('node', [path.join(dir, 'tools', 'offline.js'), dir]).toString().trim());
  check('3D med paket', await open(b, '3d'), { view: '3d', offline: true, ready: true });
  check('HD-2D med paket', await open(b, 'hd2d'), { view: 'hd2d', offline: true });
  check('2D med paket', await open(b, '2d'), { view: '2d', offline: true });
  await b.close();
  const v9 = cp.spawnSync('node', [path.join(__dirname, 'v9.js')], { env: Object.assign({}, process.env, { GAME_URL: url }) });
  const out = v9.stdout.toString().trim();
  console.log('v9 på file://:\n  ' + out.split('\n').join('\n  '));
  if (v9.status !== 0) errs.push('v9 på file:// gick inte igenom: ' + v9.stderr.toString().split('\n')[0]);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(errs.length ? errs.join('\n') : 'inga fel');
  process.exit(errs.length ? 1 : 0);
})();
