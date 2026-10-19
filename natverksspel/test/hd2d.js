// HD-2D-läget: pixelfigurer i 3D-världen. Kräver en webbserver på port 8765.
// Kontrollerar menyns tre val, att alla kollegor blir sprites, att klick på golvet och på en kollega
// leder dit (och startar samtalet), att WASD går i kamerans riktning och att lägena går att byta fram och tillbaka.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1100, height: 650 } });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 3).join(' | ')));
  await p.addInitScript(() => { localStorage.setItem('krabba-passet.settings', JSON.stringify({ quality: 'low', mode: '2d', modeChosen: true, tutorialDone: true, lastVersion: '10.4' })); });
  await p.goto('http://localhost:8765/index.html', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4500);
  // Menyn har tre visningslägen
  const buttons = await p.evaluate(() => Array.from(document.querySelectorAll('#menu [data-mode]')).map(b => b.getAttribute('data-mode')));
  if (buttons.join(',') !== '2d,hd2d,3d') errs.push('menyns lägen: ' + buttons.join(','));
  await p.click('#menu [data-mode="hd2d"]');
  await p.waitForTimeout(2500);
  const r = await p.evaluate(async () => {
    const g = NV.game, out = { fail: [] };
    g.ui.hideMenu(); g.startWeek(3); g.ui.closeDialog();
    const w = g.world;
    out.view = g.viewName(); out.hd = w.hd2d; out.saved = NV.settings.get('view3d');
    out.sprites = Object.keys(w.people).filter(n => w.people[n].hdSpr && w.people[n].hdSpr.s.material.map).length;
    for (let i = 0; i < 5; i++) w.update(1 / 30);
    const vis = Object.keys(w.people).filter(n => w.people[n].group.visible);
    out.sprites = vis.filter(n => w.people[n].hdSpr && w.people[n].hdSpr.s.material.map).length; out.visible = vis.length;
    if (w.locked) out.fail.push('musen låstes');
    // Klicka på golvet: figuren går dit runt hindren
    w.teleport('gbg'); w.pos.set(-9.5, 1.65, -1.2);
    w.hdWalk(2.0, 1.0);
    let n = 0; while (w.hdPath && n++ < 2000) w.move(1 / 30);
    out.walk = Math.hypot(w.pos.x - 2.0, w.pos.z - 1.0).toFixed(2);
    // Klicka på Anna: gå dit och prata
    let talked = null; const orig = g.onInteract; g.onInteract = function (i) { talked = i; };
    const a = w.people.Anna.group.position;
    w.hdGoUse({ type: 'npc', id: 'Anna' }, a.x, a.z);
    n = 0; while (w.hdPath && n++ < 3000) w.move(1 / 30);
    g.onInteract = orig;
    out.talked = talked && talked.id;
    // WASD följer kameran: W går uppåt i bilden (mot -z när kameran inte är vriden)
    w.pos.set(0, 1.65, 1); w.hdYaw = w.hdYawT = 0; w.keys.KeyW = true;
    for (let i = 0; i < 20; i++) w.move(1 / 30);
    w.keys.KeyW = false;
    out.wz = (w.pos.z - 1).toFixed(2);
    // Rendering utan fel
    for (let i = 0; i < 5; i++) { w.update(1 / 30); w.render(1 / 30, w.zone()); }
    w.teleport('boras'); for (let i = 0; i < 5; i++) { w.update(1 / 30); w.render(1 / 30, w.zone()); }
    // Byt till förstaperson och tillbaka
    g.setMode('3d'); out.fps = !w.hd2d && NV.settings.get('view3d') === 'fps' && Math.abs(w.camera.fov - NV.settings.get('fov')) < 0.1;
    g.setMode('2d'); out.twoD = g.mode === '2d';
    g.setMode('hd2d'); out.back = g.world.hd2d && g.viewName() === 'hd2d';
    return out;
  });
  r.fail.forEach(f => errs.push(f));
  console.log('läge', r.view, '· sprites', r.sprites, '· gick till', r.walk, 'm från målet · pratade med', r.talked, '· W flyttade z', r.wz, '· förstaperson', r.fps, '· 2D', r.twoD, '· tillbaka', r.back);
  if (r.view !== 'hd2d' || !r.hd || r.saved !== 'hd2d') errs.push('HD-2D slogs inte på');
  if (!r.sprites || r.sprites !== r.visible) errs.push('alla kollegor blev inte sprites: ' + r.sprites + ' av ' + r.visible);
  if (+r.walk > 0.4) errs.push('kom inte fram: ' + r.walk);
  if (r.talked !== 'Anna') errs.push('pratade inte med Anna: ' + r.talked);
  if (!(+r.wz < -0.5)) errs.push('W gick inte uppåt i bilden: ' + r.wz);
  if (!r.fps) errs.push('förstapersonsläget återställdes inte');
  if (!r.twoD || !r.back) errs.push('lägena gick inte att byta');
  console.log(errs.length ? errs.join('\n') : 'inga fel');
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
