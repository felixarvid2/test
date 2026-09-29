// Tar skärmbilder från givna positioner: node view.js x z yaw pitch namn [x z yaw pitch namn ...]
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 760 } });
  p.on('pageerror', e => console.log('pageerror: ' + e.message));
  await p.goto('http://localhost:8765/index.html');
  await p.waitForTimeout(1500);
  await p.evaluate(() => { NV.game.world.lock = () => {}; });
  const week = process.env.WEEK || '1';
  await p.click('[data-week="' + week + '"]');
  await p.waitForTimeout(400);
  await p.click('#dialog button.primary');
  await p.evaluate(() => { document.getElementById('pause').classList.add('hidden'); });
  const a = process.argv.slice(2);
  for (let i = 0; i + 4 < a.length + 1; i += 5) {
    await p.evaluate(([x, z, yaw, pitch]) => { const w = NV.game.world; w.pos.set(+x, 1.65, +z); w.yaw = +yaw; w.pitch = +pitch; }, a.slice(i, i + 4));
    await p.waitForTimeout(1300);
    await p.screenshot({ path: (process.env.OUT || require('os').tmpdir()) + '/v_' + a[i + 4] + '.png' });
  }
  await b.close();
})();
