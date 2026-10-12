// v10: förbättringarna i HD-2D och 3D. Kräver en webbserver på port 8765.
// Kontrollerar mjuk zoom, X till målet, vägprickar, emotes och vinkning tillbaka, hopp, Alt-konturer,
// rutten i 3D, hjulzoom, jubel när ett fel löses, F4 och pausmenyns visningsknappar, inställningarna
// och en simulerad handkontroll.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1100, height: 650 } });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 3).join(' | ')));
  await p.addInitScript(() => {
    localStorage.setItem('krabba-passet.settings', JSON.stringify({ quality: 'low', mode: '3d', view3d: 'hd2d', modeChosen: true, tutorialDone: true, lastVersion: '10.1' }));
    // En låtsad handkontroll som håller vänster spak framåt
    window.__pad = { connected: true, id: 'Testkontroll', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    navigator.getGamepads = () => [window.__pad];
  });
  await p.goto('http://localhost:8765/index.html', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4500);
  const r = await p.evaluate(async () => {
    const g = NV.game, out = { fail: [] }, F = (m) => out.fail.push(m);
    g.ui.hideMenu(); g.startWeek(3); g.ui.closeDialog();
    const w = g.world;
    if (!w.hd2d) F('HD-2D är inte på');
    const step = (n) => { for (let i = 0; i < n; i++) w.update(1 / 30); };
    step(3);
    // 1: mjuk zoom
    w.hdDistT = 10; step(1); const mid = w.hdDist; step(60);
    if (!(mid > 10.5 && Math.abs(w.hdDist - 10) < 0.3)) F('zoomen är inte mjuk: ' + mid.toFixed(2) + ' → ' + w.hdDist.toFixed(2));
    // 22: X går till nästa mål (Anna i vecka 3)
    w.teleport('gbg'); w.pos.set(-9.5, 1.65, -1.2);
    w.hdGoObjective();
    if (!w.hdPath) F('X gav ingen väg');
    // 21: prickarna syns medan figuren går
    step(2);
    out.dots = w.hdMore.dots.filter(d => d.visible).length;
    let n = 0; while (w.hdPath && n++ < 3000) w.move(1 / 30);
    const o = g.objective(); out.goalDist = o ? Math.hypot(o.x - w.pos.x, o.z - w.pos.z).toFixed(2) : 'inget';
    // 29, 111: emote och vinkning tillbaka
    w.emoteCd = 0; w.emote(0); step(1);
    out.emote = !!w.hdMore.emote;
    out.waveBack = Object.keys(w.people).some(n => w.people[n].gestKind === 'wave' && w.people[n].gest > 0);
    // 28: hopp
    w.hdHop = 0.0001; step(5); out.hop = w.hdMe.s.position.y > 0.05;
    step(15);
    // 112: Alt visar det du kan använda
    w.altHeld = true; step(1); out.alt = w.altBoxes ? w.altBoxes.filter(b => b.visible).length : 0; w.altHeld = false; step(1);
    // 72: ikoner nära kaffemaskinen
    w.pos.set(-2.8, 1.65, -8.3); w.hdFocus = null; step(3);
    out.icons = w.hdMore.icons.filter(s => s.visible).length;
    // 91: handkontrollens spak flyttar figuren
    const z0 = w.pos.z; window.__pad.axes[1] = -1; step(20); window.__pad.axes[1] = 0; out.padMoved = (z0 - w.pos.z).toFixed(2);
    // 3D: rutt, hjulzoom, jubel
    g.setMode('3d'); step(2);
    if (w.hd2d) F('3D slogs inte på');
    w.teleport('gbg'); w.pos.set(-9.5, 1.65, -1.2);
    w.showRoute(); out.route = w.routeG ? w.routeG.children.length : 0;
    w.wheelZoom = 0.6; const fov0 = w.camera.fov; step(20); out.zoom = (fov0 - w.camera.fov).toFixed(1); w.wheelZoom = 0; step(20);
    w.pos.set(0, 1.65, 5); w.celebrate('SW1'); out.cheer = Object.keys(w.people).some(n => w.people[n].gestKind === 'cheer' && w.people[n].gest > 0);
    w.emoteCd = 0; w.emote(1);
    // 136: F4 byter visning
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'F4', bubbles: true })); out.f4a = g.viewName();
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'F4', bubbles: true })); out.f4b = g.viewName();
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'F4', bubbles: true })); out.f4c = g.viewName();
    // 184: pausmenyn har visningsknappar
    out.pauseViews = document.querySelectorAll('#pause [data-view]').length;
    // 139–148: inställningarna
    g.ui.settingsDialog();
    out.settings = ['s-tiltamt', 's-hddist', 's-hdpitch', 's-hdscale', 's-hdstep', 's-hdpath', 's-hdicons', 's-bobamt', 's-padsens', 's-padrumble'].filter(id => document.getElementById(id)).length;
    g.ui.closeDialog();
    out.ach = ['hdRooms', 'hdTurns', 'hdAuto', 'hdHop', 'hdEmotes', 'pad', 'views3', 'routes', 'cheers', 'waveBack', 'zoomer'].filter(id => NV.career.ACH.some(a => a[0] === id)).length;
    // Rendering utan fel i alla lägen
    for (const v of ['hd2d', '3d']) { g.setMode(v); for (let i = 0; i < 4; i++) { w.update(1 / 30); w.render(1 / 30, w.zone()); } }
    return out;
  });
  r.fail.forEach(f => errs.push(f));
  console.log(JSON.stringify(r));
  if (!(r.dots > 3)) errs.push('inga vägprickar');
  if (!(+r.goalDist < 2.6)) errs.push('X kom inte fram till målet: ' + r.goalDist);
  if (!r.emote) errs.push('ingen emote');
  if (!r.waveBack) errs.push('ingen vinkade tillbaka');
  if (!r.hop) errs.push('inget hopp');
  if (!(r.alt > 0)) errs.push('Alt visade inget');
  if (!(r.icons > 0)) errs.push('inga ikoner vid kaffemaskinen');
  if (!(+r.padMoved > 0.5)) errs.push('handkontrollen flyttade inte figuren: ' + r.padMoved);
  if (!(r.route > 3)) errs.push('ingen rutt i 3D');
  if (!(+r.zoom > 5)) errs.push('hjulzoomen fungerar inte: ' + r.zoom);
  if (!r.cheer) errs.push('ingen jublade');
  if (r.f4a !== '2d' || r.f4b !== 'hd2d' || r.f4c !== '3d') errs.push('F4: ' + [r.f4a, r.f4b, r.f4c].join(' → '));
  if (r.pauseViews !== 3) errs.push('pausmenyn saknar visningsknappar');
  if (r.settings !== 10) errs.push('inställningar saknas: ' + r.settings);
  if (r.ach !== 11) errs.push('prestationer saknas: ' + r.ach);
  console.log(errs.length ? errs.join('\n') : 'inga fel');
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
