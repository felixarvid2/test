// v4: figurer, animationer, modeller, prestanda och mobil. Skärmbilder i OUT.
const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const out = (process.env.OUT || require('os').tmpdir()) + '/';
  const errs = [];
  const only = process.env.ONLY || 'desk';
  const quality = process.env.Q || 'high';
  async function page(opts, q2) {
    const ctx = await b.newContext(opts || { viewport: { width: 1280, height: 760 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push('pageerror: ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 3).join(' | ')));
    p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await p.addInitScript((q) => { try { localStorage.setItem('krabba-passet.settings', JSON.stringify({ quality: q, mode: '3d', tutorialDone: true })); } catch (e) {} }, q2 || quality);
    await p.goto('http://localhost:8765/index.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(4500);
    return p;
  }
  const shot = async (p, n) => { await p.screenshot({ path: out + 'v4_' + n + '.png' }); };
  if (only.includes('desk')) {
    const p = await page();
    await p.evaluate(() => { NV.game.world.lock = () => {}; const st = document.createElement('style'); st.textContent = '#pause{display:none!important}'; document.head.appendChild(st); NV.game.ui.hideMenu(); NV.game.startWeek(1); NV.game.ui.closeDialog(); });
    const pose = async (x, z, yaw, pitch, wait) => { await p.evaluate(([x, z, yaw, pitch]) => { const w = NV.game.world; if (x > 50 && w.site !== 'boras') w.teleport('boras'); if (x < 50 && w.site !== 'gbg') w.teleport('gbg'); w.pos.x = x; w.pos.z = z; w.tYaw = w.yaw = yaw; w.tPitch = w.pitch = pitch; }, [x, z, yaw, pitch]); await p.waitForTimeout(wait || 1800); };
    const views = (process.env.VIEWS || 'people:-1.2,6.6,-0.9,-0.15;anna:-2.1,6.0,-0.5,-0.2;omar:-2.2,-6.4,0.6,-0.1;linnea:7.2,-5.2,0,-0.1;racks:-12,-6.6,0,-0.05;door:-10.4,0.5,0,0;truck:103,-2.2,0.2,-0.1;chairs:9,3,1.1,-0.35').split(';');
    for (const v of views) {
      const [name, rest] = v.split(':');
      const [x, z, yaw, pitch] = rest.split(',').map(Number);
      await pose(x, z, yaw, pitch);
      await shot(p, name);
    }
    await p.evaluate(() => { const g = NV.game; g.crab.x = -11.9; g.crab.z = -6.9; g.crab.homeX = -11.9; g.crab.homeZ = -6.9; g.crab.site = 'gbg'; g.crab.active = true; });
    await pose(-11.9, -6.0, 0, -0.75, 900);
    await shot(p, 'crab');
    await p.evaluate(() => { NV.game.ui.npcDialog('Omar'); });
    await pose(-3.2, -6.6, 0.3, -0.05, 1500);
    await shot(p, 'talk');
    const info = await p.evaluate(() => { const r = NV.game.world.renderer.info; return { calls: NV.game.world.drawCalls, merged: NV.game.world.mergeInfo, tris: r.render.triangles, geos: r.memory.geometries, tex: r.memory.textures, fps: NV.game.world.fps, q: NV.gfx && NV.gfx.quality }; });
    console.log('desk', JSON.stringify(info));
  }
  if (only.includes('mobile')) {
    const p = await page({ ...devices['Pixel 7'], viewport: { width: 915, height: 412 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }, 'auto');
    await shot(p, 'm_menu');
    await p.evaluate(() => { NV.game.ui.hideMenu(); NV.game.startWeek(1); });
    await p.waitForTimeout(800);
    await shot(p, 'm_brief');
    await p.evaluate(() => NV.game.ui.closeDialog());
    await p.waitForTimeout(1500);
    await shot(p, 'm_play');
    const tb = await p.$('#touch-menu');
    if (tb) { await tb.tap(); await p.waitForTimeout(500); await shot(p, 'm_sheet'); await p.evaluate(() => NV.game.ui.closeDialog()); }
    await p.evaluate(() => { NV.game.connectConsole('SW1'); });
    await p.waitForTimeout(800);
    await shot(p, 'm_term');
    await p.evaluate(() => { NV.game.terminal.hide(); NV.game.setMode('2d'); NV.game.ui.closeDialog(); });
    await p.waitForTimeout(1200);
    await shot(p, 'm_2d');
    const q = await p.evaluate(() => ({ touch: document.body.classList.contains('touch'), q: NV.gfx && NV.gfx.quality }));
    console.log('mobile', JSON.stringify(q));
  }
  console.log(errs.join('\n') || 'inga fel');
  await b.close();
})();
