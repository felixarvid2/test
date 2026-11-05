// Kurs 2 i webbläsaren: menyn har en egen rubrik, veckorna 11–14 startar i alla visningslägen utan fel,
// konsolservern i rack A ger konsolen till R-Molndal-1, och OSPF- och BGP-kommandona fungerar i terminalen.
// Kräver en webbserver på port 8765.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1200, height: 750 } });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 3).join(' | ')));
  await p.addInitScript(() => { localStorage.setItem('krabba-passet.settings', JSON.stringify({ quality: 'low', mode: '2d', modeChosen: true, tutorialDone: true, lastVersion: '11.0' })); });
  await p.goto('http://localhost:8765/index.html', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4500);
  const r = await p.evaluate(async () => {
    const g = NV.game, out = { fail: [] }, F = m => out.fail.push(m);
    g.ui.showMenu();
    out.heading = !!Array.from(document.querySelectorAll('#menu h2')).find(h => /Kurs 2/.test(h.textContent));
    out.weekBtns = [11, 12, 13, 14].filter(w => document.querySelector('#menu [data-week="' + w + '"]')).length;
    g.ui.hideMenu();
    const views = {};
    for (const view of ['2d', 'hd2d', '3d']) {
      for (const w of [11, 12, 13, 14]) {
        g.setMode(view);
        g.startWeek(w); g.ui.closeDialog();
        const W = g.world;
        for (let i = 0; i < 4; i++) { W.update && W.update(1 / 30); if (W.render) W.render(1 / 30, W.zone ? W.zone() : undefined); }
        if (!g.state.devices.RM) F('vecka ' + w + ' saknar R-Molndal-1');
        const ob = g.objective && g.objective();
        views[view + w] = !!ob;
      }
    }
    out.views = views;
    // Konsolservern i frontpanelsvyn (2D) kopplar konsolen till R-Molndal-1
    g.setMode('2d'); g.startWeek(13); g.ui.closeDialog();
    g.ui.rackView('A');
    const units = Array.from(document.querySelectorAll('#dialog .rack-unit'));
    out.rackUnits = units.length;
    const ks = units[units.length - 1].querySelector('canvas');
    ks.click();
    await new Promise(r => setTimeout(r, 300));
    out.consoleTo = g.consoleTargetId;
    const T = g.terminal;
    for (const c of ['sudo screen /dev/ttyUSB0 9600', '', 'enable', 'show ip ospf neighbor', 'show ip ospf interface brief']) { T.submit(c); await new Promise(r => setTimeout(r, 400)); }
    await new Promise(r => setTimeout(r, 800));
    const txt = document.querySelector('#terminal, .terminal') ? document.querySelector('#terminal, .terminal').innerText : document.body.innerText;
    out.prompt = /R-Molndal-1#/.test(txt);
    out.ospfOut = /Neighbor ID/.test(txt) && /Gi0\/1\s+1\s+0\s+10\.0\.0\.10\/30/.test(txt);
    T.hide && T.hide();
    // Handboken och quizen har kurs 2
    out.quiz = !!(NV.levels.QUIZ2 && NV.levels.QUIZ2[13].length === 5);
    out.challenge = !!(NV.challenge.of(14) && NV.challenge.of(11));
    return out;
  });
  r.fail.forEach(f => errs.push(f));
  console.log(JSON.stringify(r));
  if (!r.heading) errs.push('menyn saknar rubriken Kurs 2');
  if (r.weekBtns !== 4) errs.push('menyn saknar veckorna 11–14: ' + r.weekBtns);
  if (Object.values(r.views).some(v => !v)) errs.push('någon vecka saknar mål: ' + JSON.stringify(r.views));
  if (r.consoleTo !== 'RM') errs.push('konsolservern kopplade inte till R-Molndal-1: ' + r.consoleTo);
  if (!r.prompt || !r.ospfOut) errs.push('terminalen mot R-Molndal-1 visade inte OSPF-utdata');
  if (!r.quiz || !r.challenge) errs.push('quiz eller utmaning saknas för kurs 2');
  console.log(errs.length ? errs.join('\n') : 'inga fel');
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
