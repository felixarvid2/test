// Bygg från grunden i webbläsaren: menyn, konsolen och att ett byggsteg bockas av.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const out = (process.env.OUT || require('os').tmpdir()) + '/';
  const errs = [];
  for (const mode of ['3d', '2d']) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(mode + ' pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push(mode + ' console: ' + m.text()); });
    await p.addInitScript((m) => { try { localStorage.setItem('krabba-passet.settings', JSON.stringify({ quality: 'low', mode: m, tutorialDone: true, lastVersion: '6.1' })); } catch (e) {} }, mode);
    await p.goto('http://localhost:8765/index.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(4500);
    const menu = await p.evaluate(() => document.querySelectorAll('#menu .week.build').length);
    if (menu !== 5) errs.push(mode + ': menyn har ' + menu + ' byggen');
    await p.screenshot({ path: out + 'build_menu_' + mode + '.png' });
    await p.click('#menu .week[data-week="101"]');
    await p.waitForTimeout(1200);
    await p.screenshot({ path: out + 'build_brief_' + mode + '.png' });
    await p.evaluate(() => { const st = document.createElement('style'); st.textContent = '#pause{display:none!important}'; document.head.appendChild(st); NV.game.ui.closeDialog(); NV.game.connectConsole('SW1'); });
    await p.waitForTimeout(500);
    const type = async (c) => { await p.evaluate((c) => { const t = NV.game.terminal; t.el.input.value = c; t.submit(c); t.el.input.value = ''; }, c); await p.waitForTimeout(350); };
    for (const c of ['sudo screen /dev/ttyUSB0 9600', '', 'enable', 'configure terminal', 'hostname SW-Nordvik-1', 'end', 'write memory', 'show vlan brief']) await type(c);
    await p.waitForTimeout(800);
    await p.screenshot({ path: out + 'build_term_' + mode + '.png' });
    const r = await p.evaluate(() => ({ fixed: NV.game.taskState.b1a.fixed, reported: NV.game.taskState.b1a.reported, hud: document.querySelector('.hud-week').textContent, prompt: NV.game.terminal.el.prompt.textContent }));
    console.log(mode, JSON.stringify(r));
    if (!r.fixed || !r.reported) errs.push(mode + ': b1a bockades inte av');
    await p.evaluate(() => { NV.game.terminal.hide(); NV.game.ui.handbook('bygg'); });
    await p.waitForTimeout(400);
    await p.screenshot({ path: out + 'build_hb_' + mode + '.png' });
    await ctx.close();
  }
  console.log(errs.length ? errs.join('\n') : 'inga fel');
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
