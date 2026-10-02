// Påminnelsen om felrapporter: gul ruta i HUD:en och en dialog när alla Krabba-fel är lösta.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const out = (process.env.OUT || require('os').tmpdir()) + '/';
  const errs = [];
  const p = await b.newPage({ viewport: { width: 1280, height: 760 } });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await p.addInitScript(() => { try { localStorage.setItem('krabba-passet.settings', JSON.stringify({ quality: 'low', mode: '2d', tutorialDone: true, lastVersion: '8.0' })); } catch (e) {} });
  await p.goto('http://localhost:8765/index.html', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4000);
  await p.evaluate(() => { NV.game.ui.hideMenu(); NV.game.startWeek(2); NV.game.ui.closeDialog(); });
  // Rätta Karims kabel (Krabba-fel 1)
  await p.evaluate(() => { const g = NV.game; const l = g.state.links.filter(x => x.b.dev === 'PC-Karim')[0]; l.state = 'ok'; NV.sim.touch(g.state); NV.sim.dhcp(g.state, 'PC-Karim'); g.afterCommand(); g.ui.renderHud(); });
  await p.waitForTimeout(600);
  const hud1 = await p.evaluate(() => (document.querySelector('.hud-report') || {}).textContent || '');
  console.log('efter ett fel:', hud1);
  if (!/1 felrapport/.test(hud1)) errs.push('HUD visar inte 1 felrapport');
  // Rätta duplex (Krabba-fel 2) – nu är alla Krabba-fel lösta
  await p.evaluate(() => { const g = NV.game; const s = new NV.IosSession(g.state, 'SW2', { privileged: true }); ['conf t', 'int gi0/24', 'speed auto', 'duplex auto', 'end'].forEach(c => s.handle(c)); g.afterCommand(); g.ui.renderHud(); });
  await p.waitForTimeout(2200);
  const dlg = await p.evaluate(() => { const d = document.querySelector('#dialog'); return d && !d.classList.contains('hidden') ? d.textContent : ''; });
  console.log('dialog:', dlg.slice(0, 160));
  if (!/Alla Krabba-fel är lösta/.test(dlg)) errs.push('ingen dialog när alla Krabba-fel var lösta');
  await p.screenshot({ path: out + 'report_nag.png' });
  // Knappen öppnar felrapporten
  await p.click('#dialog .dlg-foot button.primary');
  await p.waitForTimeout(500);
  const next = await p.evaluate(() => document.querySelector('#dialog .dlg-title, #dialog h2') ? document.querySelector('#dialog').textContent.slice(0, 80) : '');
  console.log('sedan:', next);
  if (!/Felrapport/.test(next)) errs.push('knappen öppnade inte felrapporten');
  await p.evaluate(() => NV.game.ui.closeDialog());
  await p.waitForTimeout(300);
  await p.screenshot({ path: out + 'report_hud.png' });
  console.log(errs.length ? errs.join('\n') : 'inga fel');
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
