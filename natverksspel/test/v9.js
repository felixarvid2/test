// v9: Kenney-modellerna i 3D. Kräver en webbserver på port 8765.
// Kontrollerar att figurer, möbler, rekvisita, texturer och fotsteg laddas, att kollegorna animeras,
// att kaffemaskinen och kollegorna fortfarande går att använda och att spelet klarar sig utan modellerna.
const { chromium } = require('playwright');
async function run(b, models) {
  const p = await b.newPage({ viewport: { width: 1100, height: 650 } });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 3).join(' | ')));
  await p.addInitScript((m) => { localStorage.setItem('krabba-passet.settings', JSON.stringify({ quality: 'low', mode: '3d', modeChosen: true, tutorialDone: true, lastVersion: '9.0', models3d: m })); }, models);
  await p.goto('http://localhost:8765/index.html', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);
  await p.evaluate(() => { const g = NV.game; g.ui.hideMenu(); g.startWeek(3); g.ui.closeDialog(); });
  if (models) await p.waitForFunction(() => NV.game.world.kenney, null, { timeout: 30000 }).catch(() => errs.push('modellerna laddades inte'));
  else await p.waitForTimeout(1500);
  const r = await p.evaluate(async () => {
    const g = NV.game, w = g.world, out = { fail: [] };
    out.kit = w.kit ? w.kit.children.length : 0;
    out.people = Object.keys(w.people).filter(n => w.people[n].k).length;
    // Kollegorna växlar animation: sitter, går och vinkar
    const omar = w.people.Omar, anna = w.people.Anna;
    if (omar.k) {
      for (let i = 0; i < 400 && omar.k.cur !== 'walk'; i++) { w.pos.set(20, 1.6, 20); NV.people.update(w.people, 0.05, i * 0.05, w.pos, 3, null); }
      if (omar.k.cur !== 'walk') out.fail.push('Omar går inte (' + omar.k.cur + ')');
      if (anna.k.cur !== 'sit') out.fail.push('Anna sitter inte (' + anna.k.cur + ')');
      if (anna.J.hips.visible) out.fail.push('den gamla figuren syns');
      omar.speed = 0; omar.gest = 1; omar.gestKind = 'wave'; omar.paceT = 99;
      w.pos.set(omar.group.position.x, 1.6, omar.group.position.z + 3);
      NV.people.update(w.people, 0.05, 0, w.pos, 3, null);
      if (omar.k.cur !== 'emote-yes') out.fail.push('Omar vinkar inte (' + omar.k.cur + ')');
    }
    // Kaffemaskinen och kollegorna går fortfarande att klicka på
    const cm = w.builder.anchors.coffee;
    if (!w.interactables.includes(cm)) out.fail.push('kaffemaskinen går inte att använda');
    if (!w.interactables.includes(anna.hit)) out.fail.push('Anna går inte att prata med');
    w.pos.set(-2.8, 1.6, -8.4); w.yaw = w.tYaw = 0; w.pitch = w.tPitch = -0.45; w.camera.position.copy(w.pos); w.camera.rotation.set(w.pitch, w.yaw, 0, 'YXZ'); w.camera.updateMatrixWorld();
    const h = w.pick();
    out.pick = h && h.userData && h.userData.interact ? h.userData.interact.type : (h && h.type);
    // Texturerna och himlen är utbytta
    out.tex = ['wood', 'concrete', 'concreteDark', 'sky'].filter(n => NV.tex.get(n).image && NV.tex.get(n).image.tagName === 'IMG').length;
    // Ingen möbel står där spelaren startar eller vid dörrarna
    [['gbg', -9.5, -1.2], ['gbg', 10.5, -9.3], ['boras', 89.6, 0]].forEach(s => { if (w.collides(s[1], s[2], 0.25)) out.fail.push('blockerat vid ' + s.join(' ')); });
    // Fotstegen
    NV.sfx.unlock(); NV.sfx.step('wood');
    await new Promise(r => setTimeout(r, 1500));
    out.steps = ['carpet', 'wood', 'concrete'].map(s => (NV.assets3d.steps[s] || []).length).join('/');
    for (let i = 0; i < 5; i++) { NV.sfx.step('carpet'); NV.sfx.step('metal'); NV.sfx.step('concrete'); }
    // Några bildrutor ska ritas utan fel
    w.teleport('boras'); for (let i = 0; i < 5; i++) w.update(1 / 30);
    w.teleport('gbg'); for (let i = 0; i < 5; i++) w.update(1 / 30);
    return out;
  });
  r.fail.forEach(f => errs.push(f));
  await p.close();
  return { r, errs };
}
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const a = await run(b, true), errs = a.errs;
  console.log('med modeller: rekvisita', a.r.kit, '· kollegor', a.r.people, '· texturer', a.r.tex, '· fotsteg', a.r.steps, '· sikte', a.r.pick);
  if (a.r.kit < 60) errs.push('för få modeller: ' + a.r.kit);
  if (a.r.people !== 10) errs.push('alla kollegor byttes inte: ' + a.r.people);
  if (a.r.tex !== 4) errs.push('texturerna byttes inte: ' + a.r.tex);
  if (!/^[1-5]\/[1-5]\/[1-5]$/.test(a.r.steps)) errs.push('fotstegen laddades inte: ' + a.r.steps);
  if (a.r.pick !== 'coffee') errs.push('kaffemaskinen träffas inte: ' + a.r.pick);
  const c = await run(b, false);
  console.log('utan modeller: rekvisita', c.r.kit, '· kollegor', c.r.people, '· sikte', c.r.pick);
  if (c.r.kit || c.r.people) errs.push('modellerna laddades fast de var avstängda');
  c.errs.forEach(e => errs.push('utan modeller: ' + e));
  console.log(errs.length ? errs.join('\n') : 'inga fel');
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
