// v5: kapitel 10 i webbläsaren – 3D och 2D, rack, övervakning, terminal och menyer. Skärmbilder i OUT.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const out = (process.env.OUT || require('os').tmpdir()) + '/';
  const errs = [];
  async function page(mode) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(mode + ' pageerror: ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 3).join(' | ')));
    p.on('console', m => { if (m.type() === 'error') errs.push(mode + ' console: ' + m.text()); });
    await p.addInitScript((m) => { try { localStorage.setItem('krabba-passet.settings', JSON.stringify({ quality: 'medium', mode: m, tutorialDone: true, lastVersion: '5.0' })); } catch (e) {} }, mode);
    await p.goto('http://localhost:8765/index.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(4500);
    return p;
  }
  const shot = async (p, n) => { await p.screenshot({ path: out + 'v5_' + n + '.png' }); };

  // Menyn med vecka 10
  const p = await page('3d');
  await shot(p, 'menu');
  const menu = await p.evaluate(() => ({ weeks: document.querySelectorAll('#menu .week[data-week]:not(.build)').length, sum: (document.querySelector('.menu-sum') || {}).textContent, next: !!document.querySelector('.week.next') }));
  console.log('meny', JSON.stringify(menu));
  if (menu.weeks !== 10) errs.push('menyn har ' + menu.weeks + ' veckor');

  // Vecka 10 i 3D
  await p.evaluate(() => { NV.game.world.lock = () => {}; const st = document.createElement('style'); st.textContent = '#pause{display:none!important}'; document.head.appendChild(st); NV.game.ui.hideMenu(); NV.game.startWeek(10); NV.game.ui.closeDialog(); });
  await p.waitForTimeout(1500);
  const pose = async (x, z, yaw, pitch, wait) => { await p.evaluate(([x, z, yaw, pitch]) => { const w = NV.game.world; if (x > 50 && w.site !== 'boras') w.teleport('boras'); if (x < 50 && w.site !== 'gbg') w.teleport('gbg'); w.pos.x = x; w.pos.z = z; w.tYaw = w.yaw = yaw; w.tPitch = w.pitch = pitch; }, [x, z, yaw, pitch]); await p.waitForTimeout(wait || 1800); };
  await pose(-12, -8.2, 0, -0.1); await shot(p, 'rackA');
  await pose(-10.4, -8.3, 0.25, -0.05); await shot(p, 'wall');
  const hud = await p.evaluate(() => (document.querySelector('.hud-vpn') || {}).textContent);
  console.log('hud', hud);
  if (!/VPN/.test(hud || '')) errs.push('VPN saknas i HUD');
  // Övervakningen med VPN-panelen
  await p.evaluate(() => NV.game.ui.monitorDialog());
  await p.waitForTimeout(800);
  const mon = await p.evaluate(() => (document.querySelector('#mon-vpn') || {}).textContent || '');
  console.log('övervakning', mon.slice(0, 160));
  if (!/TID-POOL/.test(mon) || !/Fas 1/.test(mon)) errs.push('VPN/LB-panel saknas');
  await shot(p, 'monitor');
  await p.evaluate(() => NV.game.ui.closeDialog());
  // Rackvyn med lastbalanseraren
  await p.evaluate(() => NV.game.ui.rackView('A'));
  await p.waitForTimeout(600);
  await shot(p, 'rackview');
  await p.evaluate(() => NV.game.ui.closeDialog());
  // Handboken
  await p.evaluate(() => NV.game.ui.handbook('vpn'));
  await p.waitForTimeout(400);
  await shot(p, 'handbook');
  await p.evaluate(() => NV.game.ui.closeDialog());
  // Terminalen: curl mot lastbalanseraren och ssh till LB
  await p.evaluate(() => NV.game.terminal.openLaptop());
  await p.waitForTimeout(300);
  const typeCmd = async (c, wait) => { await p.evaluate((c) => { const t = NV.game.terminal; t.el.input.value = c; t.submit(c); t.el.input.value = ''; }, c); await p.waitForTimeout(wait || 1500); };
  await typeCmd('for i in 1 2 3 4; do curl -s http://tid/; done', 1500);
  await typeCmd('tracepath 192.168.2.193', 4000);
  await typeCmd('ssh admin@192.168.1.13', 600);
  await typeCmd('x', 600);
  await typeCmd('show pool', 800);
  await typeCmd('config pool TID-POOL monitor http', 800);
  await typeCmd('show pool', 800);
  await shot(p, 'terminal');
  const term = await p.evaluate(() => NV.game.terminal.el.out.textContent);
  if (!/502 Bad Gateway/.test(term)) errs.push('curl visade inte 502');
  if (!/pmtu/.test(term)) errs.push('tracepath visade ingen pmtu');
  if (!/DOWN/.test(term)) errs.push('show pool visade inte DOWN efter http-kontroll');
  const fixed = await p.evaluate(() => NV.game.taskState.v10n1.fixed);
  console.log('v10n1 löst', fixed);
  if (!fixed) errs.push('v10n1 blev inte löst');
  await p.evaluate(() => NV.game.terminal.hide());
  // Borås: lagrets rack och väggboxen
  await pose(88.6, -8.2, 1.3, -0.1); await shot(p, 'boras');

  // Vecka 10 i 2D
  const q = await page('2d');
  await q.evaluate(() => { const st = document.createElement('style'); st.textContent = '#pause{display:none!important}'; document.head.appendChild(st); NV.game.ui.hideMenu(); NV.game.startWeek(10); NV.game.ui.closeDialog(); NV.game.world.pos.x = -11; NV.game.world.pos.z = -6.5; });
  await q.waitForTimeout(2000);
  await shot(q, '2d');
  await q.evaluate(() => NV.game.ui.whiteboardDialog());
  await q.waitForTimeout(300);
  await q.evaluate(() => NV.game.ui.closeDialog());

  console.log(errs.length ? errs.join('\n') : 'inga fel');
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
