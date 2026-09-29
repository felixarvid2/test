// Öppnar alla dialoger och några terminaler i webbläsaren och letar efter fel.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 760 } });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message + ' ' + e.stack));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto('http://localhost:8765/index.html');
  await p.waitForTimeout(1500);
  await p.evaluate(() => { NV.game.world.lock = () => {}; });
  const week = process.env.WEEK || '3';
  await p.click('[data-week="' + week + '"]'); await p.waitForTimeout(300); await p.click('#dialog button.primary');
  const dir = (process.env.OUT || require('os').tmpdir()) + '/';
  async function type(line) {
    await p.fill('.term-input', line); await p.press('.term-input', 'Enter');
    await p.waitForTimeout(300);
    for (let i = 0; i < 60; i++) { if (!(await p.evaluate(() => NV.game.terminal.busy))) break; await p.waitForTimeout(250); }
  }
  // NPC
  await p.evaluate(() => NV.game.onInteract({ type: 'npc', id: 'Anna' })); await p.waitForTimeout(300);
  await p.screenshot({ path: dir + 'u_npc.png' });
  await p.click('#dialog button.primary'); await p.waitForTimeout(200);
  // Dator -> cmd
  await p.evaluate(() => NV.game.onInteract({ type: 'pc', id: 'PC-Anna' })); await p.waitForTimeout(200);
  await p.screenshot({ path: dir + 'u_pc.png' });
  await p.click('#dialog button.primary'); await p.waitForTimeout(300);
  await type('ipconfig');
  await type('ping 192.168.1.70');
  await type('ping filserver');
  await p.screenshot({ path: dir + 'u_cmd.png' });
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  // IPv4-inställningar
  await p.evaluate(() => NV.game.ui.ipv4Dialog('PC-Anna')); await p.waitForTimeout(200);
  await p.screenshot({ path: dir + 'u_ipv4.png' });
  await p.fill('#f-mask', '255.255.255.192');
  await p.click('#dialog button.primary'); await p.waitForTimeout(2500);
  // Felrapport
  await p.evaluate(() => NV.game.ui.reportPicker()); await p.waitForTimeout(300);
  await p.screenshot({ path: dir + 'u_report.png' });
  const radios = await p.$$('input[name=cause]'); if (radios.length) { await p.click('input[name=cause][value="0"]'); await p.click('input[name=fix][value="0"]'); await p.click('#dialog button.primary'); }
  await p.waitForTimeout(400);
  // Handbok, ledtråd, övervakning, mobil
  await p.evaluate(() => NV.game.ui.handbook('fel')); await p.waitForTimeout(200); await p.screenshot({ path: dir + 'u_hand.png' }); await p.keyboard.press('Escape');
  await p.evaluate(() => NV.game.ui.hintDialog(NV.game.def.tasks[1])); await p.waitForTimeout(200); await p.click('#dialog button.primary'); await p.waitForTimeout(200); await p.screenshot({ path: dir + 'u_hint.png' }); await p.keyboard.press('Escape');
  await p.evaluate(() => NV.game.ui.monitorDialog()); await p.waitForTimeout(800); await p.screenshot({ path: dir + 'u_mon.png' }); await p.keyboard.press('Escape');
  await p.evaluate(() => NV.game.onInteract({ type: 'phone' })); await p.waitForTimeout(200);
  const ss = await p.$('[data-ssid]'); if (ss) { await ss.click(); await p.waitForTimeout(300); }
  await p.screenshot({ path: dir + 'u_phone.png' }); await p.keyboard.press('Escape');
  await p.evaluate(() => NV.game.ui.taskOverview()); await p.waitForTimeout(200); await p.keyboard.press('Escape');
  // Laptop -> ssh till routern
  await p.evaluate(() => NV.game.openLaptop()); await p.waitForTimeout(200);
  await type('ssh drift@192.168.1.193'); await type('yes'); await type('Krabba2026');
  await type('show ip dhcp pool KONTOR');
  await type('show ip route');
  await type('exit');
  await type('ssh admin@192.168.1.196'); await type('yes'); await type('x');
  await type('show wlan summary');
  await type('logout');
  await p.screenshot({ path: dir + 'u_ssh.png' });
  const txt = await p.evaluate(() => document.querySelector('.term-out').textContent);
  console.log(txt.slice(-2500));
  await p.keyboard.press('Escape');
  // Resa till Borås
  await p.evaluate(() => NV.game.onInteract({ type: 'travel', to: 'boras' })); await p.waitForTimeout(1500);
  await p.screenshot({ path: dir + 'u_travel.png' });
  console.log('HUD:', await p.evaluate(() => document.getElementById('hud').innerText));
  console.log(errs.join('\n') || 'inga fel');
  await b.close();
})();
