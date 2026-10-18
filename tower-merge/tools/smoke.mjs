#!/usr/bin/env node
/**
 * Browser smoke test (`npm run smoke`).
 *
 * Starts the Vite DEV server on a free port (the dev build exposes `window.game`, which the test
 * needs; set SMOKE_URL=http://host:port/ to test an already running server instead), then drives the
 * game in Chromium (Playwright, PLAYWRIGHT_BROWSERS_PATH defaults to /opt/pw-browsers):
 *
 *   fresh save -> menu -> PLAY -> BUY -> real mouse drag merge -> real TOUCH drag merge (CDP) ->
 *   fast-forward through waves (upgrade cards, events, rewards via clicks) until defeat ->
 *   GameOver results -> PLAY AGAIN -> defeat again -> MENU -> DAILY CHALLENGE -> PLAY DAILY (daily seed)
 *   -> viewports 360x640, 412x915 and landscape 1280x720 (fit / letterbox).
 *
 * Any console error or page error fails the run. Screenshots go to $SMOKE_OUT (default
 * <tmpdir>/tower-merge-smoke). Exit code 0 = PASS.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.SMOKE_OUT || path.join(os.tmpdir(), 'tower-merge-smoke');
mkdirSync(OUT, { recursive: true });
const { chromium } = await import('playwright');

const W = 720;
const H = 1280;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const problems = [];

// ------------------------------------------------------------------------------------------------
// Dev server
// ------------------------------------------------------------------------------------------------

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
    s.on('error', reject);
  });
}

async function startServer() {
  if (process.env.SMOKE_URL) return { url: process.env.SMOKE_URL, stop: () => {} };
  const port = await freePort();
  const child = spawn('npx', ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const url = `http://127.0.0.1:${port}/`;
  const t0 = Date.now();
  for (;;) {
    try { if ((await fetch(url)).ok) break; } catch { /* not up yet */ }
    if (Date.now() - t0 > 60000) { try { process.kill(-child.pid); } catch { /* gone */ } throw new Error('vite did not start:\n' + log); }
    await sleep(250);
  }
  return { url, stop: () => { try { process.kill(-child.pid); } catch { /* gone */ } } };
}

// ------------------------------------------------------------------------------------------------
// Page helpers
// ------------------------------------------------------------------------------------------------

async function newSession(browser, url, opts = {}) {
  const { tag = 'main', ...ctxOpts } = opts;
  const ctx = await browser.newContext({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 1, ...ctxOpts });
  // Vite's HMR socket would reload the page whenever someone edits a source file mid-run: swallow it
  await ctx.routeWebSocket(() => true, () => {});
  const page = await ctx.newPage();
  page.setDefaultTimeout(300000); // software GL on a busy machine renders only a few fps
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = m.location()?.url ?? '';
    if (/favicon/.test(loc) || /favicon/.test(m.text())) return;
    problems.push(`[${tag}] console error: ${m.text()} ${loc}`);
  });
  page.on('pageerror', (e) => problems.push(`[${tag}] page error: ${e.message}`));
  await page.goto(url);
  await page.waitForFunction(() => window.game && window.game.scene.isActive('Menu'), null, { timeout: 180000 });
  await sleep(500);
  return { ctx, page, tag };
}

/** Interactive objects of a scene (recursively through containers) with their world rectangle and label. */
const collect = (page, sceneKey) => page.evaluate((key) => {
  const sc = window.game.scene.getScene(key);
  if (!sc || !sc.sys.isActive()) return [];
  const out = [];
  const walk = (obj, texts, parents) => {
    if (!obj.visible) return;
    if (obj.input && obj.input.enabled) {
      const m = obj.getWorldTransformMatrix();
      const p = m.transformPoint(0, 0);
      const sx = Math.hypot(m.a, m.b);
      const sy = Math.hypot(m.c, m.d);
      const w = (obj.width ?? 0) * sx;
      const h = (obj.height ?? 0) * sy;
      out.push({ label: (texts || []).join(' ').trim(), x: p.x, y: p.y, w, h, type: obj.type });
    }
    if (obj.list) {
      const t = obj.list.filter((c) => c.type === 'Text' && c.visible).map((c) => c.text);
      for (const c of obj.list) walk(c, t.length ? t : texts);
    }
  };
  for (const o of sc.children.list) walk(o, null);
  return out;
}, sceneKey);

const canvasRect = (page) => page.evaluate(() => {
  const r = document.querySelector('canvas').getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
});

const toPage = async (page, x, y) => {
  const r = await canvasRect(page);
  return [r.left + (x * r.width) / W, r.top + (y * r.height) / H];
};

const isActive = (page, key) => page.evaluate((k) => window.game.scene.isActive(k), key);
const waitActive = (page, key, timeout = 240000) => page.waitForFunction((k) => window.game.scene.isActive(k), key, { timeout });
const inPage = (page, fn, ...a) => page.evaluate(fn, ...a);

async function clickButton(page, sceneKey, labelRe, { timeout = 120000, pick = 'first' } = {}) {
  const t0 = Date.now();
  for (;;) {
    const all = (await collect(page, sceneKey)).filter((b) => labelRe.test(b.label));
    if (all.length) {
      const b = pick === 'last' ? all[all.length - 1] : all[0];
      const [px, py] = await toPage(page, b.x, b.y);
      await page.mouse.click(px, py);
      return b;
    }
    if (Date.now() - t0 > timeout) {
      throw new Error(`button ${labelRe} not found in ${sceneKey}; have: ${(await collect(page, sceneKey)).map((b) => b.label).join(' | ')}`);
    }
    await sleep(150);
  }
}

async function startRun(page) {
  await clickButton(page, 'Menu', /^PLAY$/i);
  await waitActive(page, 'Game');
  await page.waitForFunction(() => window.__tm && window.__tm.world() && window.__tm.world().phase, null, { timeout: 120000 });
  await sleep(800);
}

const towersOf = (page) => inPage(page, () => window.__tm.world().slots
  .map((s) => (s.tower ? { slot: s.id, type: s.tower.type, level: s.tower.level } : null)).filter(Boolean));
const anchorOf = (page, slot) => inPage(page, (s) => { const a = window.__tm.scene.towers.views[s].anchor(); return { x: a.x, y: a.y }; }, slot);

const findPair = (page) => inPage(page, () => {
  const w = window.__tm.world();
  for (let a = 0; a < 12; a++) for (let b = a + 1; b < 12; b++) if (w.canMerge(a, b)) return [a, b];
  return null;
});

async function ensurePair(page) {
  let p = await findPair(page);
  if (!p) {
    const first = (await towersOf(page))[0];
    await inPage(page, (ty) => window.__tm.world().grantTower(ty, 1), first ? first.type : 'arrow');
    await sleep(900);
    p = await findPair(page);
  }
  if (!p) throw new Error('could not create a mergeable pair');
  return p;
}

const levelsOf = async (page) => (await towersOf(page)).map((t) => t.level);

/** Mouse: real press, moves, release. The finger ends 40 px below the target (the tower is lifted above it). */
async function mouseDrag(page, a, b) {
  const [x0, y0] = await toPage(page, a.x, a.y - 30);
  const [x1, y1] = await toPage(page, b.x, b.y + 40);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= 16; i++) { await page.mouse.move(x0 + ((x1 - x0) * i) / 16, y0 + ((y1 - y0) * i) / 16); await sleep(16); }
  await sleep(120);
  await page.mouse.up();
}

/** Touch: genuine touchStart / touchMove / touchEnd events through the DevTools protocol. */
async function touchDrag(page, cdp, a, b) {
  const [x0, y0] = await toPage(page, a.x, a.y - 30);
  const [x1, y1] = await toPage(page, b.x, b.y + 40);
  const pt = (x, y) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x0, y0) });
  for (let i = 1; i <= 16; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x0 + ((x1 - x0) * i) / 16, y0 + ((y1 - y0) * i) / 16) });
    await sleep(16);
  }
  await sleep(120);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function mergeWith(page, drag) {
  const [a, b] = await ensurePair(page);
  const before = await inPage(page, () => window.__tm.world().stats.towersMerged);
  await drag(await anchorOf(page, a), await anchorOf(page, b));
  await page.waitForFunction((n) => window.__tm.world().stats.towersMerged > n, before, { timeout: 120000 });
  await sleep(900);
  const lv = await levelsOf(page);
  if (!lv.some((l) => l >= 2)) throw new Error(`no level 2 tower after merge: ${lv}`);
}

// ------------------------------------------------------------------------------------------------
// Playing through waves
// ------------------------------------------------------------------------------------------------

async function handleOverlay(page, name, log) {
  if (name === 'Upgrade') {
    // cards deal and flip in with an animation; taps are ignored until the scene unlocks them
    try {
      await page.waitForFunction(() => {
        const sc = window.game.scene.getScene('Upgrade');
        return !sc || !sc.sys.isActive() || sc.picked || (sc.locked === false && sc.cards && sc.cards.length > 0);
      }, null, { timeout: 240000, polling: 500 });
    } catch (e) {
      const st = await inPage(page, () => {
        const sc = window.game.scene.getScene('Upgrade');
        return JSON.stringify({ active: sc.sys.isActive(), locked: sc.locked, busy: sc.busy, picked: sc.picked, cards: sc.cards?.length, phase: window.__tm.world().phase, reduced: window.__tm.scene.fx.reduced, fps: window.game.loop.actualFps });
      }).catch((err) => String(err));
      await page.screenshot({ path: path.join(OUT, 'upgrade-stuck.png') });
      throw new Error(`upgrade cards never unlocked: ${st}`);
    }
    const picked = await inPage(page, () => { const sc = window.game.scene.getScene('Upgrade'); return !sc.sys.isActive() || sc.picked; });
    if (picked) return; // already chosen, the overlay is closing
    const cards = (await collect(page, 'Upgrade')).filter((b) => b.h > 300);
    if (!cards.length) throw new Error('no upgrade cards to click');
    const [px, py] = await toPage(page, cards[0].x, cards[0].y);
    await page.mouse.click(px, py);
    await sleep(500);
    await clickButton(page, 'Upgrade', /CHOOSE/i, { timeout: 30000 });
    log.upgrades++;
  } else if (name === 'Event') {
    const all = (await collect(page, 'Event')).filter((b) => b.w > 50);
    if (all.length) {
      const b = all.sort((p, q) => q.y - p.y)[0];
      const [px, py] = await toPage(page, b.x, b.y);
      await page.mouse.click(px, py);
      log.events++;
    }
  } else if (name === 'Reward') {
    await clickButton(page, 'Reward', /no thanks|skip|close/i, { timeout: 90000 });
    log.rewards++;
  }
}

/** Fast-forwards (__tm.speed plus direct sim steps, since headless GL is slow) until the GameOver overlay shows. */
async function playUntilGameOver(page, limitMs = 1500000) {
  const log = { upgrades: 0, events: 0, rewards: 0, waves: 0 };
  await inPage(page, () => window.__tm.speed(8));
  const t0 = Date.now();
  while (Date.now() - t0 < limitMs) {
    if (await isActive(page, 'GameOver')) break;
    const st = await inPage(page, () => ({ phase: window.__tm.world().phase, overlay: window.__tm.scene.overlay, wave: window.__tm.world().wave }));
    log.waves = Math.max(log.waves, st.wave);
    if (st.overlay === 'Upgrade' || st.overlay === 'Event' || st.overlay === 'Reward') {
      await sleep(600);
      await handleOverlay(page, st.overlay, log);
      await sleep(900);
      continue;
    }
    if (st.overlay === null && (st.phase === 'prewave' || st.phase === 'wave')) {
      await inPage(page, () => {
        const w = window.__tm.world();
        const sc = window.__tm.scene;
        if (w.phase === 'prewave') w.startWaveNow();
        for (let i = 0; i < 40 && (w.phase === 'wave' || w.phase === 'prewave'); i++) { w.update(1 / 20); sc.flush(); }
      });
    }
    await sleep(120);
  }
  if (!(await isActive(page, 'GameOver'))) throw new Error(`never reached GameOver (wave ${log.waves})`);
  return log;
}

/** GameOver: skip the revive offer (Give up) so the results screen shows. */
async function toResults(page) {
  const t0 = Date.now();
  for (;;) {
    const labels = (await collect(page, 'GameOver')).map((b) => b.label);
    if (labels.some((l) => /PLAY AGAIN/i.test(l))) return labels;
    if (labels.some((l) => /give up/i.test(l))) await clickButton(page, 'GameOver', /give up/i, { timeout: 60000 });
    if (Date.now() - t0 > 300000) throw new Error('results never showed: ' + labels.join(' | '));
    await sleep(400);
  }
}

// ------------------------------------------------------------------------------------------------
// Steps
// ------------------------------------------------------------------------------------------------

async function step(name, fn) {
  const t0 = Date.now();
  const before = problems.length;
  try {
    const detail = await fn();
    if (problems.length > before) throw new Error(problems.slice(before).join('; '));
    results.push({ name, ok: true });
    console.log(`PASS  ${name}${detail ? ` (${detail})` : ''} [${((Date.now() - t0) / 1000).toFixed(1)}s]`);
  } catch (e) {
    results.push({ name, ok: false });
    console.log(`FAIL  ${name}: ${e.message}`);
    throw e;
  }
}

async function checkFit(browser, url, name, viewport, opts = {}) {
  const s = await newSession(browser, url, { viewport, tag: name, ...opts });
  await startRun(s.page);
  const r = await canvasRect(s.page);
  await s.page.screenshot({ path: path.join(OUT, `viewport-${name}.png`) });
  await s.ctx.close();
  const fits = r.width <= viewport.width + 1 && r.height <= viewport.height + 1;
  const centered = Math.abs(r.left + r.width / 2 - viewport.width / 2) < 2 && Math.abs(r.top + r.height / 2 - viewport.height / 2) < 2;
  if (!fits) throw new Error(`canvas ${r.width}x${r.height} exceeds ${viewport.width}x${viewport.height}`);
  if (Math.abs(r.width / r.height - W / H) > 0.01) throw new Error(`canvas aspect ${(r.width / r.height).toFixed(3)} != ${(W / H).toFixed(3)}`);
  if (!centered) throw new Error('canvas not centered');
  return `${Math.round(r.width)}x${Math.round(r.height)} in ${viewport.width}x${viewport.height}`;
}

const server = await startServer();
console.log(`smoke: ${server.url} (screenshots in ${OUT})`);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = false;
try {
  const main = await newSession(browser, server.url, { tag: 'mouse' });
  const page = main.page;

  await step('fresh save: menu shows PLAY', async () => {
    const labels = (await collect(page, 'Menu')).map((b) => b.label);
    if (!labels.some((l) => /^PLAY$/i.test(l))) throw new Error('no PLAY button: ' + labels.join('|'));
    const done = await inPage(page, () => JSON.stringify(localStorage).includes('firstRunDone":true'));
    if (done) throw new Error('save is not fresh');
  });

  await step('PLAY starts a run', async () => {
    await startRun(page);
    const ph = await inPage(page, () => window.__tm.world().phase);
    if (ph !== 'prewave') throw new Error('phase ' + ph);
    await page.screenshot({ path: path.join(OUT, 'run-start.png') });
    return 'prewave';
  });

  await step('BUY places a tower (real click)', async () => {
    const before = await inPage(page, () => window.__tm.world().stats.towersBought);
    await clickButton(page, 'Game', /^BUY/i);
    await page.waitForFunction((n) => window.__tm.world().stats.towersBought > n, before, { timeout: 120000 });
    await sleep(700);
    return `${(await towersOf(page)).length} towers`;
  });

  await step('touch targets: bottom bar >= 88 px, synergy chips >= 64 px', async () => {
    const all = await collect(page, 'Game');
    const bottom = all.filter((b) => b.y > 1030);
    const small = bottom.filter((b) => b.w < 87.5 || b.h < 87.5);
    if (bottom.length < 3) throw new Error('bottom bar buttons not found');
    if (small.length) throw new Error('too small: ' + small.map((b) => `${b.label || b.type} ${Math.round(b.w)}x${Math.round(b.h)}`).join(', '));
    const pause = all.filter((b) => b.y < 80 && b.x > 600);
    if (!pause.length || pause.some((b) => b.w < 87.5 || b.h < 87.5)) throw new Error('pause hit area missing or too small');
    await inPage(page, () => { const w = window.__tm.world(); w.s.slots.forEach((s) => { s.unlocked = true; }); w.grantTower('fire', 1); w.grantTower('poison', 1); });
    await sleep(1000);
    const chips = (await collect(page, 'Game')).filter((b) => b.y > 60 && b.y < 130 && b.w < 80 && b.x > 150);
    if (chips.length === 0) throw new Error('no synergy chips appeared');
    if (chips.some((c) => c.h < 63.5)) throw new Error('chip height ' + Math.min(...chips.map((c) => c.h)));
    return `${bottom.length} bottom buttons, ${chips.length} chips`;
  });

  await step('real mouse drag merges two towers', async () => {
    await mergeWith(page, (a, b) => mouseDrag(page, a, b));
    return `levels ${(await levelsOf(page)).join(',')}`;
  });

  const touch = await newSession(browser, server.url, { tag: 'touch', hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await step('touch drag (CDP touch events) merges two towers', async () => {
    const tp = touch.page;
    // tap PLAY (retry: a tap can land while the menu is still animating in)
    let started = false;
    for (let attempt = 0; attempt < 8 && !started; attempt++) {
      const play = (await collect(tp, 'Menu')).filter((b) => /^PLAY$/i.test(b.label))[0];
      if (play) {
        const [px, py] = await toPage(tp, play.x, play.y);
        await tp.touchscreen.tap(px, py);
      }
      started = await tp.waitForFunction(() => window.game.scene.isActive('Game'), null, { timeout: 30000 }).then(() => true, () => false);
    }
    if (!started) throw new Error('touch tap on PLAY never started the game');
    await tp.waitForFunction(() => window.__tm && window.__tm.world(), null, { timeout: 120000 });
    await sleep(900);
    const cdp = await touch.ctx.newCDPSession(tp);
    await mergeWith(tp, (a, b) => touchDrag(tp, cdp, a, b));
    return `levels ${(await levelsOf(tp)).join(',')}`;
  });
  await touch.ctx.close();

  // Headless software GL renders only a few frames per second and the game clock is frame based, so the
  // intro animations of the overlays would take minutes: switch on the player-facing "reduced motion"
  // setting (a supported code path) for the long play-through.
  await inPage(page, async () => {
    const { services } = await import('/src/services.ts');
    await services.save.update((d) => { d.settings.reducedMotion = true; });
  });
  let log = { upgrades: 0 };
  await step('fast-forward waves (upgrades, events, rewards by click) until defeat', async () => {
    log = await playUntilGameOver(page);
    return `wave ${log.waves}, ${log.upgrades} upgrades, ${log.events} events, ${log.rewards} rewards`;
  });
  if (log.upgrades === 0) console.log('NOTE  no upgrade overlay was clicked (defeated before the first wave clear)');

  await step('GameOver results visible', async () => {
    const labels = await toResults(page);
    await page.screenshot({ path: path.join(OUT, 'gameover.png') });
    return labels.filter(Boolean).join(' / ');
  });

  await step('PLAY AGAIN starts a fresh run', async () => {
    const rid = await inPage(page, () => window.__tm.scene.runId);
    await clickButton(page, 'GameOver', /PLAY AGAIN/i);
    await page.waitForFunction((r) => window.__tm.scene.runId && window.__tm.scene.runId !== r
      && window.game.scene.isActive('Game') && !window.game.scene.isActive('GameOver'), rid, { timeout: 240000 });
    await sleep(800);
    const w = await inPage(page, () => ({ phase: window.__tm.world().phase, wave: window.__tm.world().wave }));
    if (w.phase !== 'prewave' || w.wave !== 1) throw new Error(JSON.stringify(w));
    return 'new run, wave 1';
  });

  await step('defeat again, MENU returns to the menu', async () => {
    await playUntilGameOver(page);
    await toResults(page);
    await clickButton(page, 'GameOver', /^MENU$/i);
    await waitActive(page, 'Menu');
    if (await isActive(page, 'Game')) throw new Error('Game still active behind the menu');
  });

  await step('DAILY CHALLENGE -> PLAY DAILY starts a run with the daily seed', async () => {
    await sleep(500);
    await clickButton(page, 'Menu', /DAILY/i);
    await waitActive(page, 'Daily');
    await sleep(600);
    await clickButton(page, 'Daily', /PLAY DAILY/i);
    await waitActive(page, 'Game');
    await page.waitForFunction(() => window.__tm && window.__tm.scene.sceneData && window.__tm.world().phase, null, { timeout: 120000 });
    const d = await inPage(page, () => ({ daily: window.__tm.scene.sceneData.daily ?? null, seed: window.__tm.world().options.seed }));
    if (!d.daily) throw new Error('GameScene got no daily data');
    if (d.seed !== d.daily.seed) throw new Error(`world seed ${d.seed} != daily seed ${d.daily.seed}`);
    return `seed ${d.seed}, key ${d.daily.key}`;
  });
  await main.ctx.close();

  await step('viewport 360x640 fits', () => checkFit(browser, server.url, '360x640', { width: 360, height: 640 }));
  await step('viewport 412x915 fits (letterboxed)', () => checkFit(browser, server.url, '412x915', { width: 412, height: 915 }, { deviceScaleFactor: 2 }));
  await step('viewport 1280x720 landscape fits (pillarboxed)', () => checkFit(browser, server.url, '1280x720', { width: 1280, height: 720 }));
} catch (e) {
  failed = true;
  console.log('\nstopped at first failure:', e.message);
} finally {
  await browser.close().catch(() => {});
  server.stop();
}

if (problems.length) {
  failed = true;
  console.log('\nconsole/page errors:');
  for (const p of problems) console.log('  ' + p);
}
console.log(`\nSMOKE ${failed ? 'FAIL' : 'PASS'}: ${results.filter((r) => r.ok).length}/${results.length} steps passed`);
process.exit(failed ? 1 : 0);
