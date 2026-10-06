// v8: vägsökningen för musklick i 2D och sakerna att göra i världen. Kräver en webbserver på port 8765.
// Kontrollerar att figuren når slumpade mål och alla föremål och kollegor, och att de nya aktiviteterna fungerar.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 760 } });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 3).join(' | ')));
  await p.addInitScript(() => { localStorage.setItem('krabba-passet.settings', JSON.stringify({ quality: 'low', mode: '2d', tutorialDone: true, lastVersion: '9.0' })); localStorage.removeItem('krabba-passet.v8'); });
  await p.goto('http://localhost:8765/index.html', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4500);
  const r = await p.evaluate(() => {
    const g = NV.game;
    g.ui.hideMenu(); g.startWeek(3); g.ui.closeDialog(); g.running = false;
    const w = g.world, out = { fail: [] };
    // 1. Slumpade mål på båda platserna
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let ok = 0, slow = 0;
    for (const site of ['gbg', 'boras']) {
      w.teleport(site);
      const n = w.navGrid();
      for (let k = 0; k < 25; k++) {
        let tx, tz; do { tx = n.s.x0 + rnd() * (n.s.x1 - n.s.x0); tz = n.s.z0 + rnd() * (n.s.z1 - n.s.z0); } while (w.collides(tx, tz, 0.3));
        const t0 = performance.now(); w.walkTo(tx, tz); slow = Math.max(slow, performance.now() - t0);
        let i = 0; while (w.target && i++ < 3000) w.move(1 / 30);
        if (!w.target && Math.hypot(w.pos.x - tx, w.pos.z - tz) < 0.6) ok++; else out.fail.push('mål ' + site + ' ' + tx.toFixed(1) + ',' + tz.toFixed(1));
      }
    }
    out.targets = ok; out.slowestMs = Math.round(slow);
    // 2. Varje föremål och kollega nås med ett klick och används när figuren kommer fram
    const orig = g.onInteract; let used = 0, miss = [];
    g.onInteract = function () { used++; };
    w.inters.filter(i => i.z > -50).forEach(i => {
      if ((i.x > 50) !== (w.site === 'boras')) w.teleport(i.x > 50 ? 'boras' : 'gbg');
      const before = used;
      w.walkTo(i.x, i.z - 0.6, i);
      let n = 0; while (w.target && n++ < 4000) w.move(1 / 30);
      if (used === before) miss.push(i.inter.type + ':' + (i.inter.id || ''));
    });
    g.onInteract = orig;
    out.inters = used; if (miss.length) out.fail.push('nådde inte: ' + miss.join(', '));
    // 3. De nya aktiviteterna
    w.teleport('gbg');
    const d0 = w.duckInters[0]; g.onInteract(d0.inter); if (d0.z > -50) out.fail.push('gummiankan plockades inte upp');
    if (w.lost) { g.onInteract({ type: 'lost' }); g.onInteract({ type: 'npc', id: w.lost.owner }); g.ui.closeDialog(); if (w.lost) out.fail.push('hittegodset lämnades inte tillbaka'); }
    w.plants[0].thirst = -1; g.onInteract({ type: 'plant', id: 0 }); if (w.plants[0].thirst <= 0) out.fail.push('växten vattnades inte');
    const t = w.spawnTrash(); if (!t) out.fail.push('inget skräp'); else { g.onInteract(t.inter.inter); if (w.trash.length) out.fail.push('skräpet låg kvar'); }
    w.pos.x = -16.2; w.pos.z = 1.2; g.onInteract({ type: 'fish', id: 'pond' }); w.fishing.bite = 0; w.updateFx(0.05, 0.05); if (!w.fishing || w.fishing.state !== 'bite') out.fail.push('fisken nappade inte'); g.onInteract({ type: 'fish', id: 'pond' });
    g.onInteract({ type: 'sit', id: 0 }); if (!w.seated) out.fail.push('kunde inte sätta sig'); w.standUp();
    w.reqT = 0; w.updateFx(0.05, 0.05); if (w.coffeeReq) { g.onInteract({ type: 'coffee' }); g.onInteract({ type: 'npc', id: w.coffeeReq.n }); g.ui.closeDialog(); if (w.coffeeReq) out.fail.push('kaffet levererades inte'); }
    w.pos.x = -8.5; w.pos.z = -14.9; w.frame = 1; w.runPath = true; w.ball.x = -8.5; w.ball.z = -15.25; w.ball.vx = w.ball.vz = 0;
    const goals = NV.career.stats().goals || 0; for (let i = 0; i < 200; i++) { w.ballStep(0.02); w.frame = 0; } if ((NV.career.stats().goals || 0) <= goals) out.fail.push('inget mål');
    out.ach = NV.career.ACH.length;
    return out;
  });
  console.log('mål nådda', r.targets, '· föremål använda', r.inters, '· längsta sökning', r.slowestMs, 'ms · prestationer', r.ach);
  r.fail.forEach(f => errs.push(f));
  console.log(errs.length ? errs.join('\n') : 'inga fel');
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
