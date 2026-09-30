// Spelar igenom vecka 1 via gränssnittet (terminalen) i webbläsaren.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 760 } });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message + ' ' + e.stack));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('krabba-passet.settings') || '{}'); s.lastVersion = '6.0'; localStorage.setItem('krabba-passet.settings', JSON.stringify(s)); } catch (e) {} });
  await p.goto('http://localhost:8765/index.html', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4000);
  await p.waitForTimeout(1500);
  await p.evaluate(() => { NV.game.world.lock = () => {}; });
  await p.click('[data-week="1"]'); await p.waitForTimeout(300); await p.click('#dialog button.primary');
  const shot = n => p.screenshot({ path: (process.env.OUT || require('os').tmpdir()) + '/f_' + n + '.png' });
  async function type(line, wait) {
    await p.fill('.term-input', line);
    await p.press('.term-input', 'Enter');
    await p.waitForTimeout(wait || 400);
    for (let i = 0; i < 40; i++) { const busy = await p.evaluate(() => NV.game.terminal.busy); if (!busy) break; await p.waitForTimeout(250); }
  }
  // Koppla in konsolen i SW1
  await p.evaluate(() => NV.game.onInteract({ type: 'console', id: 'SW1' }));
  await p.waitForTimeout(300);
  await type(await p.inputValue('.term-input'));
  await type('');
  await shot('garbled');
  await p.keyboard.down('Control'); await p.keyboard.press('a'); await p.keyboard.up('Control'); await p.keyboard.press('k');
  await type('sudo screen /dev/ttyUSB0 19200');
  await type('');
  await type('en');
  await type('Krabba2026');
  await type('conf t');
  await type('line con 0');
  await type('speed 9600');
  await type('');
  await p.keyboard.down('Control'); await p.keyboard.press('a'); await p.keyboard.up('Control'); await p.keyboard.press('k');
  await type('sudo screen /dev/ttyUSB0 9600');
  await type('');
  await type('end');
  await type('wr');
  await type('show interfaces status');
  await p.fill('.term-input', 'show ip ');
  await p.press('.term-input', '?');
  await p.waitForTimeout(300);
  await p.fill('.term-input', '');
  await type('conf t');
  await type('int gi0/5');
  await type('no shut');
  await type('end');
  await type('write memory', 1500);
  await shot('term');
  const txt = await p.evaluate(() => document.querySelector('.term-out').textContent);
  console.log(txt.slice(-3500));
  await p.waitForTimeout(3500);
  const tasks = await p.evaluate(() => JSON.stringify(NV.game.taskState));
  console.log(tasks);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(500);
  await shot('after');
  console.log(errs.join('\n'));
  await b.close();
})();
