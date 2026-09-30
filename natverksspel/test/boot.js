// Startar spelet i båda lägena och tar skärmbilder.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 760 } });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 3).join(' | ')));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const out = (process.env.OUT || require('os').tmpdir()) + '/';
  await p.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('krabba-passet.settings') || '{}'); s.lastVersion = '6.0'; localStorage.setItem('krabba-passet.settings', JSON.stringify(s)); } catch (e) {} });
  await p.goto('http://localhost:8765/index.html', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4000);
  await p.waitForTimeout(2500);
  await p.screenshot({ path: out + 'b_menu.png' });
  await p.evaluate(() => { NV.game.world.lock = () => {}; });
  await p.click('[data-mode="2d"]'); await p.waitForTimeout(1200);
  await p.click('[data-week="1"]'); await p.waitForTimeout(400);
  await p.click('#dialog button.primary'); await p.waitForTimeout(1200);
  await p.screenshot({ path: out + 'b_2d_start.png' });
  const spots = (process.env.SPOTS || '-6,6;-11,-6;5,-6;2,-13;96,2').split(';');
  for (const s of spots) {
    const [x, z] = s.split(',').map(Number);
    await p.evaluate(([x, z]) => { const w = NV.game.world; if (x > 50 && w.site !== 'boras') w.teleport('boras'); if (x < 50 && w.site !== 'gbg') w.teleport('gbg'); w.pos.x = x; w.pos.z = z; w.cam = null; }, [x, z]);
    await p.waitForTimeout(700);
    await p.screenshot({ path: out + 'b_2d_' + s.replace(/[,.-]/g, '_') + '.png' });
  }
  console.log(errs.join('\n') || 'inga fel');
  await b.close();
})();
