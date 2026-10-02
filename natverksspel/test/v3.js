// Går igenom v3: efterbehandling, partiklar, krabban, kaffe, glasögon, pingspår, terminalen och 2D-effekterna.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 760 } });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 3).join(' | ')));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const out = (process.env.OUT || require('os').tmpdir()) + '/';
  const shot = async (n) => { await p.screenshot({ path: out + 'v3_' + n + '.png' }); };
  const wait = (ms) => p.waitForTimeout(ms);
  await p.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('krabba-passet.settings') || '{}'); s.lastVersion = '8.0'; localStorage.setItem('krabba-passet.settings', JSON.stringify(s)); } catch (e) {} });
  await p.goto('http://localhost:8765/index.html', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4000);
  await wait(4000);
  await shot('menu');
  await p.evaluate(() => { NV.game.world.lock = () => {}; const st = document.createElement('style'); st.textContent = '#pause{display:none!important}'; document.head.appendChild(st); });
  const only = process.env.ONLY || '';
  if (!only || only.includes('3d')) {
    await p.click('[data-mode="3d"]'); await wait(1500);
    await p.click('[data-week="1"]'); await wait(600);
    await p.click('#dialog button.primary'); await wait(1500);
    const pose = async (x, z, yaw, pitch) => {
      await p.evaluate(([x, z, yaw, pitch]) => { const w = NV.game.world; if (x > 50 && w.site !== 'boras') w.teleport('boras'); if (x < 50 && w.site !== 'gbg') w.teleport('gbg'); w.pos.x = x; w.pos.z = z; w.tYaw = w.yaw = yaw; w.tPitch = w.pitch = pitch; }, [x, z, yaw, pitch]);
      await wait(1600);
    };
    const views = (process.env.VIEWS || 'office:0,1,0,-0.1;server:-10.5,-5,0.4,-0.05;racks:-12,-7.2,0,-0.1;fika:-3,-5,0,0;reception:8,-4,1.6,0;boras:91,3,-1.57,0.05;officewin:0,5,3.14,0').split(';');
    for (const v of views) {
      const [name, rest] = v.split(':');
      const [x, z, yaw, pitch] = rest.split(',').map(Number);
      await pose(x, z, yaw, pitch);
      await shot('3d_' + name);
    }
    // Krabban, kaffe och glasögon
    await p.evaluate(() => { const g = NV.game; g.crab.x = -11.6; g.crab.z = -7.6; g.crab.homeX = -11.6; g.crab.homeZ = -7.6; g.crab.site = 'gbg'; g.crab.active = true; });
    await pose(-11.6, -6.2, 0, -0.5);
    await shot('3d_crab');
    await p.evaluate(() => NV.game.catchCrab()); await wait(900);
    await shot('3d_crab_caught');
    await pose(-12, -6.8, 0, -0.1);
    await p.evaluate(() => NV.game.toggleGoggles()); await wait(1600);
    await shot('3d_goggles');
    await p.evaluate(() => NV.game.toggleGoggles());
    await pose(-2.8, -8.2, 0, -0.2);
    await p.evaluate(() => NV.game.drinkCoffee()); await wait(1200);
    await shot('3d_coffee');
    // Pingspår: konsol i SW1 och ping till Annas dator
    await pose(-11, -6.5, 0.35, 0.05);
    await p.evaluate(() => { NV.game.connectConsole('SW1'); });
    await wait(400);
    await p.evaluate(() => { const t = NV.game.terminal; t.submit('sudo screen /dev/ttyUSB0 19200'); });
    await wait(600);
    await p.evaluate(() => { const t = NV.game.terminal; t.submit(''); t.submit('enable'); t.submit('show ip interface brief'); });
    await wait(1500);
    await shot('3d_terminal');
    await p.evaluate(() => { const t = NV.game.terminal; t.submit('ping 192.168.1.130'); t.submit('foo bar'); t.el.input.value = 'show vl'; t.updateGhost(); });
    await wait(1200);
    await shot('3d_terminal_ping');
    await p.evaluate(() => { NV.game.terminal.hide(); NV.game.ui.closeDialog(); });
    await pose(-8.5, -3.5, 0.9, 0.15);
    await p.evaluate(() => { const t = NV.game.terminal; t.openLaptop(); t.submit('ping -c 4 192.168.1.193'); setTimeout(() => t.hide(), 50); });
    await wait(1100);
    await shot('3d_pingtrace');
    await p.evaluate(() => { NV.game.onFixed({ target: 'SW1', title: 'x' }, { hints: 0 }); });
    await wait(500);
    await shot('3d_celebrate');
    await p.evaluate(() => { NV.game.world.fireworks(4); }); await wait(1400);
    await shot('3d_fireworks');
    await p.evaluate(() => NV.game.ui.achievementsDialog()); await wait(500);
    await shot('achievements');
    await p.evaluate(() => NV.game.ui.closeDialog());
    await p.evaluate(() => NV.game.ui.settingsDialog()); await wait(500);
    await shot('settings');
    await p.evaluate(() => NV.game.ui.closeDialog());
    const fps = await p.evaluate(() => ({ fps: NV.game.world.fps, pr: NV.game.world.prScale, parts: NV.game.world.fx.count(), post: !!NV.game.world.post }));
    console.log('3D', JSON.stringify(fps));
  }
  if (!only || only.includes('2d')) {
    await p.evaluate(() => { NV.game.ui.closeDialog(); NV.game.terminal.hide(); NV.game.setMode('2d'); NV.game.ui.hideMenu(); if (!NV.game.running) NV.game.startWeek(1); NV.game.ui.closeDialog(); });
    await wait(1200);
    const at = async (x, z) => { await p.evaluate(([x, z]) => { const w = NV.game.world; if (x > 50 && w.site !== 'boras') w.teleport('boras'); if (x < 50 && w.site !== 'gbg') w.teleport('gbg'); w.pos.x = x; w.pos.z = z; w.cam = null; }, [x, z]); await wait(900); };
    await at(-3, -8);
    await p.evaluate(() => { const g = NV.game; g.crab.x = -4; g.crab.z = -7.5; g.crab.homeX = -4; g.crab.homeZ = -7.5; g.crab.site = 'gbg'; g.crab.active = true; });
    await wait(500);
    await shot('2d_fika_crab');
    await p.evaluate(() => { NV.game.onFixed({ target: null, title: 'x' }, { hints: 1 }); NV.game.world.fireworks(3); });
    await wait(700);
    await shot('2d_celebrate');
    await at(-10, -5);
    await p.evaluate(() => NV.game.toggleGoggles()); await wait(900);
    await shot('2d_goggles');
    await p.evaluate(() => NV.game.toggleGoggles());
    await p.evaluate(() => { NV.game.connectConsole('SW1'); const t = NV.game.terminal; t.submit('sudo screen /dev/ttyUSB0 19200'); t.submit(''); t.submit('enable'); t.submit('show interfaces status'); t.submit('ping 192.168.1.10'); t.el.input.value = 'conf'; t.updateGhost(); });
    await wait(1600);
    await shot('2d_terminal');
    await p.evaluate(() => { NV.game.terminal.hide(); });
    await wait(900);
    await shot('2d_pingtrace');
    await at(6, -14);
    await shot('2d_outside');
    await p.evaluate(() => NV.game.ui.npcDialog('Anna')); await wait(400);
    await shot('2d_dialog');
    await p.evaluate(() => NV.game.ui.closeDialog());
  }
  console.log(errs.join('\n') || 'inga fel');
  await b.close();
})();
