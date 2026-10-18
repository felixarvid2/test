// UI smoke test: serves the built game, visits the menu screens and overlays in headless Chromium at a
// phone size, takes screenshots into docs/screens/ and fails on any console error or failed check.
//
//   npm run build && node tools/ui-smoke.mjs            (serves ./dist)
//   node tools/ui-smoke.mjs --dist=/some/other/dist --out=docs/screens
//
// The debug hook (window.__td) is enabled with ?debug=1; mock ads with ?mockads=1. Browsers are never
// downloaded: Chromium comes from PLAYWRIGHT_BROWSERS_PATH or /opt/pw-browsers/chromium.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { preview } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, def) => (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${def}`).split('=').slice(1).join('=');
const dist = path.resolve(root, arg('dist', 'dist'));
const outDir = path.resolve(root, arg('out', 'docs/screens'));
fs.mkdirSync(outDir, { recursive: true });

const SAVE_KEY = 'tinydungeon.save';
const today = new Date().toISOString().slice(0, 10);
const day = 86400000;
const SEED = {
  version: 1,
  gold: 5000,
  meta: { vitality: 2, might: 1 },
  heroes: ['knight'],
  selectedHero: 'knight',
  unlocks: [],
  achievements: { kills_100: Date.now() - 3 * day, room_5: Date.now() - 2 * day },
  stats: {
    runs: 9, totalKills: 480, totalGold: 900, bestRoom: 9, bestRoomByHero: { knight: 9 }, legendariesTotal: 2,
    bossesDefeated: { giant_slime: 1 }, bestNoDamageRooms: 2, bestKillsInRun: 120, bestLevel: 8, maxSynergiesInRun: 1,
    dailyCompleted: 1,
  },
  settings: { musicVolume: 0.6, sfxVolume: 0.8, screenShake: true, reducedMotion: false, damageNumbers: true, joystick: 'floating' },
  daily: { [today]: { bestRoom: 7, kills: 90, attempts: 2 } },
  rewards: { day: '', claimsToday: 0, claimed: {}, tokens: 2 },
  cosmetics: { owned: ['skin_gold', 'skin_emerald'], equipped: {} },
  lastRun: { runId: 'seed-run', mode: 'normal', hero: 'knight', roomsCleared: 8, kills: 100, gold: 200, level: 8, bossesDefeated: [], synergies: [], durationSec: 300, noDamageRooms: 0, legendaries: 0 },
};

const failures = [];
const consoleErrors = [];
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
  if (!ok) failures.push(name);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = await preview({
  root,
  base: './',
  build: { outDir: dist },
  preview: { port: 4179, strictPort: false, host: '127.0.0.1', open: false },
  logLevel: 'error',
});
const url = server.resolvedUrls.local[0];

const exe = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? exe,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});

async function newPage(query = '?debug=1&mockads=1', seed = SEED) {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, hasTouch: false });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => consoleErrors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
  // The YouTube SDK is not reachable offline and is a no-op outside Playables.
  await page.route('**/game_api/**', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  if (seed) {
    await page.addInitScript(([key, json]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, json);
    }, [SAVE_KEY, JSON.stringify(seed)]);
  }
  await page.goto(url + query);
  await page.waitForFunction(() => window.__td && window.__td.game.scene.isActive('Menu'), null, { timeout: 30000 });
  await sleep(1200);
  return page;
}

const td = (page, fn, arg) => page.evaluate(fn, arg);
const save = (page) => td(page, () => JSON.parse(JSON.stringify(window.__td.services.save.data)));
const active = (page, key) => td(page, (k) => window.__td.game.scene.isActive(k), key);
const waitFor = (page, fn, arg, timeout = 15000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });
async function waitScene(page, key) {
  await waitFor(page, (k) => window.__td.game.scene.isActive(k), key);
  await sleep(1400);
}

/** World position (game coordinates) of the interactive container that holds a Text with this content. */
function textPos(page, text) {
  return page.evaluate((wanted) => {
    const found = [];
    const walk = (o) => {
      if (o.type === 'Text' && (wanted.endsWith('*') ? o.text.startsWith(wanted.slice(0, -1)) : o.text === wanted)) {
        let a = o;
        while (a && !a.input) a = a.parentContainer;
        if (a && a.input && a.visible && a.input.enabled) {
          const m = a.getWorldTransformMatrix();
          found.push({ x: m.tx, y: m.ty });
        }
      }
      if (o.list) o.list.forEach(walk);
    };
    for (const sc of window.__td.game.scene.getScenes(true)) sc.children.list.forEach(walk);
    return found.length ? found[found.length - 1] : null;
  }, text);
}
async function waitText(page, text, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const p = await textPos(page, text);
    if (p) return p;
    await sleep(250);
  }
  return null;
}
/** True when any active scene shows a Text with exactly this content. */
function hasText(page, text) {
  return page.evaluate((wanted) => {
    const walk = (o) => (o.type === 'Text' && o.text === wanted && o.visible) || (o.list ? o.list.some(walk) : false);
    return window.__td.game.scene.getScenes(true).some((sc) => sc.children.list.some(walk));
  }, text);
}
/** Position of any game object given by a JS expression evaluated in the page. */
function objPos(page, expr) {
  return page.evaluate((e) => {
    const o = new Function('td', `return (${e});`)(window.__td);
    const m = o.getWorldTransformMatrix();
    return { x: m.tx, y: m.ty };
  }, expr);
}
async function tap(page, gx, gy) {
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box.x + (gx * box.width) / 720, box.y + (gy * box.height) / 1280);
}
async function tapText(page, text) {
  const p = await textPos(page, text);
  if (!p) throw new Error(`no tappable text "${text}" on screen`);
  await tap(page, p.x, p.y);
}
async function drag(page, gx, gy, tx, ty, steps = 14) {
  const box = await page.locator('canvas').boundingBox();
  const px = (v) => box.x + (v * box.width) / 720;
  const py = (v) => box.y + (v * box.height) / 1280;
  await page.mouse.move(px(gx), py(gy));
  await page.mouse.down();
  await page.mouse.move(px(tx), py(ty), { steps });
  await page.mouse.up();
}
async function shot(page, name) {
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  console.log(`      screenshot ${name}.png`);
}
/** Software GL browsers render a few frames per second; run animations faster so tests stay short. */
const speedUp = (page, k = 10) => td(page, (v) => window.__td.speed(v), k);
const stopMenu = (page) => td(page, () => window.__td.game.scene.stop('Menu'));
/** Clicks the mock rewarded ad's "Claim" button once its countdown has finished. */
async function claimMockAd(page) {
  const btn = page.locator('[aria-label="Mock rewarded ad"] button', { hasText: 'Claim' });
  await btn.waitFor({ timeout: 8000 });
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll('[aria-label="Mock rewarded ad"] button')].find((x) => x.textContent === 'Claim');
    return b && !b.disabled;
  }, null, { timeout: 8000 });
  await btn.click();
}

try {
  // ---- Menu -----------------------------------------------------------------------------------------
  let page = await newPage();
  await speedUp(page);
  await sleep(2500);
  await shot(page, '01-menu');
  check('menu shows the saved gold', (await save(page)).gold === 5000);
  check('menu has a Play button and no quit/exit button', !!(await textPos(page, 'PLAY')) && !(await textPos(page, 'Quit')) && !(await textPos(page, 'Exit')));

  await tap(page, 652, 58); // "?" explains Fortune Tokens
  await sleep(1500);
  await shot(page, '02-menu-token-info');
  await tapText(page, 'Got it');
  await sleep(600);

  // ---- Heroes ---------------------------------------------------------------------------------------
  await tapText(page, 'Heroes');
  await waitScene(page, 'HeroSelect');
  await speedUp(page);
  await sleep(1500);
  await shot(page, '10-heroes-knight');
  await tap(page, 360, 300); // ranger card (locked)
  await sleep(1800);
  await shot(page, '11-heroes-ranger-locked');
  const goldBefore = (await save(page)).gold;
  const heroCost = await td(page, () => window.__td.game.scene.getScene('HeroSelect').action.list.find((o) => o.type === 'Text').text.replace(/\D/g, ''));
  await tapText(page, 'Unlock*');
  await sleep(2200);
  const afterHero = await save(page);
  check('hero unlock spends gold and unlocks the ranger', afterHero.heroes.includes('ranger') && afterHero.gold === goldBefore - Number(heroCost) && Number(heroCost) > 0, `gold ${goldBefore} -> ${afterHero.gold}`);
  await shot(page, '12-heroes-ranger-unlocked');
  await tapText(page, 'Select');
  await sleep(1200);
  check('selecting a hero saves it', (await save(page)).selectedHero === 'ranger');
  await tap(page, 200, 1054); // first skin chip
  await sleep(1500);
  check('a skin can be equipped', (await save(page)).cosmetics.equipped.ranger === 'skin_gold');
  await shot(page, '13-heroes-skin');
  await tap(page, 584, 300); // mage: gold is enough but this only previews
  await sleep(1500);
  await shot(page, '14-heroes-mage');
  await tapText(page, '◀ Back');
  await waitScene(page, 'Menu');
  await shot(page, '15-menu-ranger');

  // ---- Shop -----------------------------------------------------------------------------------------
  await tapText(page, 'Upgrades');
  await waitScene(page, 'Shop');
  await speedUp(page);
  await sleep(1200);
  await shot(page, '20-shop');
  const before = await save(page);
  const buy = await objPos(page, "td.game.scene.getScene('Shop').rows[0].btn");
  await tap(page, buy.x, buy.y);
  await sleep(3500);
  const after = await save(page);
  check('shop purchase raises the level and spends gold', (after.meta.vitality ?? 0) === (before.meta.vitality ?? 0) + 1 && after.gold < before.gold, `gold ${before.gold} -> ${after.gold}`);
  await shot(page, '21-shop-bought');
  await drag(page, 360, 1000, 360, 350);
  await sleep(2500);
  await shot(page, '22-shop-scrolled');
  await page.mouse.move(300, 500);
  await page.mouse.wheel(0, 4000);
  await sleep(1500);
  await shot(page, '23-shop-bottom');
  check('shop list scrolls', await td(page, () => window.__td.game.scene.getScene('Shop').list.scrollY > 300));
  await tapText(page, '◀ Back');
  await waitScene(page, 'Menu');

  // ---- Trophies -------------------------------------------------------------------------------------
  await tapText(page, 'Trophies');
  await waitScene(page, 'Achievements');
  await speedUp(page);
  await sleep(1200);
  await shot(page, '30-achievements');
  await drag(page, 360, 1000, 360, 350);
  await sleep(2500);
  await shot(page, '31-achievements-scrolled');
  await tapText(page, '◀ Back');
  await waitScene(page, 'Menu');

  // ---- Settings -------------------------------------------------------------------------------------
  await tapText(page, 'Settings');
  await waitScene(page, 'Settings');
  await speedUp(page);
  await sleep(1200);
  await shot(page, '40-settings');
  await drag(page, 360, 290, 140, 290, 10); // drag the music knob to ~6%
  await sleep(500);
  check('dragging the music slider changes the volume live', (await save(page)).settings.musicVolume <= 0.1);
  await tap(page, 310, 290); // music slider -> ~40%
  await sleep(500);
  await tap(page, 510, 452); // effects slider -> ~80%
  await sleep(500);
  await tap(page, 360, 566); // screen shake off
  await sleep(500);
  await tap(page, 360, 884); // joystick fixed
  await sleep(1200);
  const st = (await save(page)).settings;
  check('sliders and toggles apply and save', st.musicVolume < 0.5 && st.screenShake === false && st.joystick === 'fixed', JSON.stringify(st));
  await shot(page, '41-settings-changed');
  await tapText(page, 'Credits');
  await sleep(1500);
  await shot(page, '42-settings-credits');
  await tapText(page, 'Close');
  await sleep(600);
  await tapText(page, 'Reset progress');
  await sleep(1500);
  await shot(page, '43-settings-reset-confirm');
  await tapText(page, 'Keep my progress');
  await sleep(600);
  check('cancelling the reset keeps the save', (await save(page)).gold > 0);
  await tapText(page, '◀ Back');
  await waitScene(page, 'Menu');
  await page.close();

  // ---- Reset flow -----------------------------------------------------------------------------------
  page = await newPage();
  await speedUp(page);
  await tapText(page, 'Settings');
  await waitScene(page, 'Settings');
  await speedUp(page);
  await tapText(page, 'Reset progress');
  await sleep(2500); // the erase button arms after a short delay
  await tapText(page, 'Yes, erase everything');
  await waitScene(page, 'Menu');
  check('reset erases progress and returns to the menu', (await save(page)).gold === 0 && (await save(page)).stats.runs === 0);
  await shot(page, '44-menu-after-reset');
  await page.close();

  // ---- Fresh player ---------------------------------------------------------------------------------
  page = await newPage('?debug=1&mockads=1', null);
  await speedUp(page);
  await sleep(2500);
  await shot(page, '50-menu-fresh');
  await page.close();

  // ---- Upgrade overlay ------------------------------------------------------------------------------
  page = await newPage();
  await speedUp(page);
  await td(page, () => window.__td.upgradeWith(['sharp_blade', 'double_strike', 'blade_orbit', 'meteor_storm'], { room: 6, upgrades: ['frost_touch', 'fire_weapon'], rerolls: 2 }));
  await stopMenu(page);
  await sleep(4000);
  await shot(page, '60-upgrade-4cards');
  await page.close();

  page = await newPage();
  await td(page, () => window.__td.upgradeWith(['explosive_death', 'keen_edge', 'thunderstorm'], { room: 6, upgrades: ['fire_weapon', 'sharp_blade', 'sharp_blade'], rerolls: 1, reason: 'boss', offerExtra: true }));
  await stopMenu(page);
  // A tap right after the scene opens (real time, normal game speed) must not pick anything.
  await sleep(150);
  await tap(page, 360, 364);
  await sleep(200);
  check('tapping before the cards are live picks nothing', await td(page, () => !window.__td.game.scene.getScene('Upgrade').picking));
  await speedUp(page);
  await waitFor(page, () => window.__td.game.scene.getScene('Upgrade').cards.every((c) => c.outer.getData('front').visible && c.outer.input));
  await sleep(800);
  await shot(page, '61-upgrade-3cards');
  const reroll = await textPos(page, 'Reroll (1)');
  check('reroll button shows the free rerolls left', !!reroll);
  const firstIds = await td(page, () => window.__td.game.scene.getScene('Upgrade').cards.map((c) => c.choice.def.id).join(','));
  await tapText(page, 'Reroll (1)');
  await sleep(2500);
  const secondIds = await td(page, () => window.__td.game.scene.getScene('Upgrade').cards.map((c) => c.choice.def.id).join(','));
  check('reroll deals new cards and uses up the free reroll', firstIds !== secondIds && !(await textPos(page, 'Reroll (0)')), `${firstIds} -> ${secondIds}`);
  await waitFor(page, () => window.__td.game.scene.getScene('Upgrade').cards.every((c) => c.outer.getData('front').visible && c.outer.input));
  await sleep(800);
  await shot(page, '62-upgrade-rerolled');
  // Reroll via ad (no free rerolls left): the mock ad offers it.
  const adReroll = await td(page, () => window.__td.game.scene.getScene('Upgrade').rerollBtn.visible);
  check('with no free rerolls the ad / token reroll is offered', adReroll);
  const idsBeforeAd = await td(page, () => window.__td.game.scene.getScene('Upgrade').cards.map((c) => c.choice.def.id).join(','));
  await tapText(page, 'Reroll  ▶ Watch ad');
  await sleep(800);
  await claimMockAd(page);
  await sleep(2500);
  const idsAfterAd = await td(page, () => window.__td.game.scene.getScene('Upgrade').cards.map((c) => c.choice.def.id).join(','));
  check('a reroll unlocked with the (mock) ad deals new cards', idsBeforeAd !== idsAfterAd, `${idsBeforeAd} -> ${idsAfterAd}`);
  check('the ad reroll can be used only once per room', !(await td(page, () => window.__td.game.scene.getScene('Upgrade').rerollBtn.visible)));
  await waitFor(page, () => window.__td.game.scene.getScene('Upgrade').cards.every((c) => c.outer.getData('front').visible && c.outer.input));
  await sleep(500);
  const c0 = await objPos(page, "td.game.scene.getScene('Upgrade').cards[0].outer");
  await tap(page, c0.x, c0.y);
  await sleep(600);
  await shot(page, '63-upgrade-picked');
  await sleep(3500);
  await shot(page, '64-upgrade-after-pick');
  const offerText = await waitText(page, 'No thanks', 20000);
  await sleep(800);
  await shot(page, '65-upgrade-extra-offer');
  if (offerText) {
    await tapText(page, '▶ Watch ad');
    await sleep(800);
    await claimMockAd(page);
    await sleep(3500);
    await shot(page, '66-upgrade-bonus');
    check('bonus set is titled "Bonus Upgrade"', await td(page, () => window.__td.game.scene.getScene('Upgrade').title.text === 'Bonus Upgrade'));
    await waitFor(page, () => window.__td.game.scene.getScene('Upgrade').cards.every((c) => c.outer.getData('front').visible && c.outer.input));
    const b0 = await objPos(page, "td.game.scene.getScene('Upgrade').cards[0].outer");
    await tap(page, b0.x, b0.y);
  } else {
    check('extra upgrade offered after a pick (synergy banner or prompt)', false, 'no prompt found');
  }
  await waitFor(page, () => !window.__td.game.scene.isActive('Upgrade'), null, 20000).catch(() => undefined);
  check('upgrade scene closed and onDone called exactly once', !(await active(page, 'Upgrade')) && (await td(page, () => window.__td.state.upgradeDone)) === 1);
  await page.close();

  // Synergy banner: Explosive Death completes Inferno Burst (Fire + Explosive Death).
  page = await newPage();
  await speedUp(page);
  await td(page, () => window.__td.upgradeWith(['explosive_death', 'keen_edge', 'thunderstorm'], { room: 6, upgrades: ['fire_weapon'], rerolls: 0 }));
  await stopMenu(page);
  await waitFor(page, () => window.__td.game.scene.getScene('Upgrade').cards.every((c) => c.outer.getData('front').visible && c.outer.input));
  await sleep(500);
  const e0 = await objPos(page, "td.game.scene.getScene('Upgrade').cards[0].outer");
  await speedUp(page, 2);
  await tap(page, e0.x, e0.y);
  await sleep(1500);
  await shot(page, '66-upgrade-picking');
  await speedUp(page, 3);
  await waitFor(page, () => window.__td.game.scene.getScene('Upgrade').children.list.some((o) => o.depth === 3000), null, 30000);
  await sleep(3500);
  await shot(page, '67-upgrade-synergy-banner');
  check('a completed synergy shows its banner', await hasText(page, 'Inferno Burst'));
  await page.close();

  // ---- Game over: revive offer, give up, banking, double gold ---------------------------------------
  page = await newPage();
  await speedUp(page);
  const goldStart = (await save(page)).gold;
  const runId = await td(page, () => window.__td.gameOver({ canRevive: true, room: 9, kills: 340, level: 12, gold: 180, upgrades: ['fire_weapon', 'double_strike', 'sharp_blade'], runId: 'smoke-run-1' }).runId);
  await stopMenu(page);
  await sleep(3000);
  await shot(page, '70-gameover-revive');
  check('revive offer shown with a countdown', !!(await textPos(page, 'Give up')));
  await tapText(page, 'Give up');
  await waitFor(page, () => window.__td.game.scene.getScene('GameOver').goldShown > 0 || window.__td.services.save.data.lastRun?.runId === 'smoke-run-1', null, 20000);
  await sleep(1500);
  await shot(page, '71-gameover-counting');
  await waitFor(page, () => window.__td.game.scene.getScene('GameOver').goldShown >= 190, null, 30000);
  await sleep(2500);
  await shot(page, '72-gameover-results');
  const banked = await save(page);
  check('the run is banked once (lastRun, run count, gold)', banked.lastRun?.runId === runId && banked.stats.runs === 10 && banked.gold > goldStart, `gold ${goldStart} -> ${banked.gold}`);
  // double gold through the mock ad
  const gainedBefore = banked.gold;
  const runGold = await td(page, () => window.__td.game.scene.getScene('GameOver').banked.gold);
  await tap(page, ...(await textPos(page, `Double gold (+${runGold})`).then((p) => [p.x, p.y])));
  await sleep(800);
  await claimMockAd(page);
  await sleep(3500);
  const doubled = await save(page);
  check('double gold grants the run gold exactly once', doubled.gold - gainedBefore === runGold, `+${doubled.gold - gainedBefore} vs ${runGold}`);
  check('double gold button is gone afterwards', !(await textPos(page, `Double gold (+${runGold})`)));
  await shot(page, '73-gameover-doubled');
  // Opening the results again for the same run must not bank it a second time.
  const goldNow = (await save(page)).gold;
  await td(page, () => window.__td.game.scene.stop('GameOver'));
  await td(page, () => window.__td.gameOver({ room: 9, kills: 340, level: 12, gold: 180, runId: 'smoke-run-1' }));
  await sleep(4000);
  const again = await save(page);
  check('the same run id is never banked twice', again.gold === goldNow && again.stats.runs === 10, `gold ${goldNow} -> ${again.gold}, runs ${again.stats.runs}`);
  await page.close();

  // New best: burst, victory jingle, trophies.
  page = await newPage();
  await speedUp(page);
  await td(page, () => window.__td.gameOver({ room: 14, kills: 400, level: 14, gold: 300, upgrades: ['fire_weapon', 'double_strike'], runId: 'smoke-run-4' }));
  await stopMenu(page);
  await waitFor(page, () => window.__td.game.scene.getScene('GameOver').banked?.newBest === true, null, 20000);
  check('a deeper room than the best is flagged as a new best', (await save(page)).stats.bestRoom === 14);
  await waitFor(page, () => window.__td.game.scene.getScene('GameOver').goldShown >= 300, null, 40000);
  await sleep(600);
  await shot(page, '75-gameover-new-best');
  check('NEW BEST! is shown', await hasText(page, 'NEW BEST!'));
  await sleep(2500);
  await shot(page, '76-gameover-new-best-settled');
  await page.close();

  // revive path
  page = await newPage();
  await speedUp(page);
  await td(page, () => window.__td.gameOver({ canRevive: true, room: 4, kills: 20, runId: 'smoke-run-2' }));
  await stopMenu(page);
  await sleep(2500);
  await tapText(page, '▶ Watch ad');
  await sleep(800);
  await claimMockAd(page);
  await waitFor(page, () => window.__td.state.revived >= 1, null, 15000).catch(() => undefined);
  check('revive claim calls onRevive once and closes the scene', (await td(page, () => window.__td.state.revived)) === 1 && !(await active(page, 'GameOver')));
  check('a revived run is not banked', (await save(page)).lastRun?.runId !== 'smoke-run-2');
  await page.close();

  // abandoned run
  page = await newPage();
  await speedUp(page);
  await td(page, () => window.__td.gameOver({ abandoned: true, canRevive: true, room: 3, kills: 12, runId: 'smoke-run-3' }));
  await stopMenu(page);
  await sleep(5000);
  await shot(page, '74-gameover-abandoned');
  check('abandoned runs skip the revive offer', !(await textPos(page, 'Give up')));
  await page.close();

  // ---- Overlay settings -----------------------------------------------------------------------------
  page = await newPage();
  await speedUp(page);
  await td(page, () => {
    const sm = window.__td.game.scene;
    sm.sleep('Menu');
    sm.run('Settings', { overlay: true, returnTo: 'Menu' });
  });
  await sleep(2500);
  await shot(page, '80-settings-overlay');
  await tapText(page, '◀ Back');
  await sleep(1500);
  check('overlay settings wakes the return scene and stops itself', (await active(page, 'Menu')) && !(await active(page, 'Settings')));
  await page.close();
} catch (e) {
  failures.push(`exception: ${e?.stack ?? e}`);
  console.error(e);
} finally {
  await browser.close();
  await server.close();
}

if (consoleErrors.length) {
  console.log('\nConsole errors:');
  for (const e of [...new Set(consoleErrors)]) console.log('  ' + e);
}
const bad = failures.length + consoleErrors.length;
console.log(bad === 0 ? '\nUI smoke test passed.' : `\nUI smoke test FAILED (${failures.length} check(s), ${consoleErrors.length} console error(s)).`);
process.exit(bad === 0 ? 0 : 1);

