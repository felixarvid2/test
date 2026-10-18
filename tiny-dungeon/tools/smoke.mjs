// Headless smoke test: builds the game, serves it with `vite preview`, plays it in Chromium (phone viewport)
// with simulated keys / pointer drags, takes screenshots into docs/screens/ and fails on any console error.
// Usage: node tools/smoke.mjs [scenario ...]   (scenarios: run boss king dragon rooms pause death; default: all)
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = join(root, 'docs', 'screens');
mkdirSync(shots, { recursive: true });
const PORT = 5198;
const BASE = `http://localhost:${PORT}/`;
const VIEW = { width: 412, height: 915 };
const errors = [];
const wanted = process.argv.slice(2);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
    p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${c}`))));
  });
}

// A static production build: stable while other people edit sources, and debug hooks (?debug=1) still work.
const dist = mkdtempSync(join(tmpdir(), 'td-smoke-'));

async function startServer() {
  await run(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', dist, '--emptyOutDir']);
  const proc = spawn(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--outDir', dist, '--port', String(PORT), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('vite did not start')), 30000);
    proc.stdout.on('data', (d) => { if (String(d).includes('Local')) { clearTimeout(t); resolve(); } });
    proc.on('exit', (c) => reject(new Error('vite exited ' + c)));
  });
  return proc;
}

async function launch() {
  const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
  try {
    return await chromium.launch({ args });
  } catch {
    return chromium.launch({ args, executablePath: '/opt/pw-browsers/chromium' });
  }
}

function watch(page, label) {
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/game_api|youtube\.com|ERR_(NAME|INTERNET|CONNECTION|TUNNEL|PROXY)|Failed to load resource/.test(t)) return;
    errors.push(`[${label}] console: ${t}`);
  });
  page.on('pageerror', (e) => errors.push(`[${label}] pageerror: ${e.message}`));
}

class Session {
  constructor(page, label) { this.page = page; this.label = label; this.keys = new Set(); this.n = 0; }
  async shot(name) {
    const file = join(shots, `${this.label}-${name}.png`);
    await this.page.screenshot({ path: file });
    console.log('  screenshot', file.replace(root + '/', ''));
  }
  async eval(fn, arg) { return this.page.evaluate(fn, arg); }
  async state() {
    return this.eval(() => {
      const g = window.__game;
      if (!g) return null;
      const w = g.world;
      const enemies = [];
      for (const e of w.enemies.all) if (e.active && !e.dying) enemies.push({ x: e.x, y: e.y, boss: e.isBoss, r: e.radius });
      const shots = [];
      return {
        st: g.state(), px: w.player.x, py: w.player.y, hp: g.run.hp, maxHp: g.run.stats.maxHp, room: g.run.room, level: g.run.level,
        kills: g.run.kills, gold: Math.floor(g.run.gold), enemies, pending: w.enemies.pendingCount,
        doors: g.scene.rooms.doors.map((d) => ({ x: d.x, type: d.type })), chest: g.scene.chest ? { x: g.scene.chest.x, y: g.scene.chest.y } : null,
        statue: g.scene.statue.length ? { x: g.scene.statue[1].x, y: g.scene.statue[1].y + 30 } : null,
        overlay: ['Upgrade', 'Pause', 'GameOver'].find((k) => window.__td.game.scene.isActive(k)) ?? null,
        shots,
      };
    });
  }
  async setKeys(want) {
    for (const k of [...this.keys]) if (!want.has(k)) { await this.page.keyboard.up(k); this.keys.delete(k); }
    for (const k of want) if (!this.keys.has(k)) { await this.page.keyboard.down(k); this.keys.add(k); }
  }
  /** Game coordinates -> page coordinates. */
  async toPage(x, y) {
    const r = await this.eval(() => { const b = document.querySelector('canvas').getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, h: b.height }; });
    return { x: r.l + (x / 720) * r.w, y: r.t + (y / 1280) * r.h };
  }
  async click(x, y) {
    const p = await this.toPage(x, y);
    await this.page.mouse.move(p.x, p.y);
    await this.page.mouse.down();
    await sleep(60);
    await this.page.mouse.up();
  }
  /** Pointer drag (virtual joystick) from (x,y) by (dx,dy) in game px, held for ms. */
  async drag(x, y, dx, dy, ms) {
    const a = await this.toPage(x, y);
    const b = await this.toPage(x + dx, y + dy);
    await this.page.mouse.move(a.x, a.y);
    await this.page.mouse.down();
    const steps = 6;
    for (let i = 1; i <= steps; i++) { await this.page.mouse.move(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps); await sleep(ms / steps); }
    await this.page.mouse.up();
  }
  /** One bot decision: chase enemies, walk to chests / statues / doors, pick the first upgrade card. */
  async botStep() {
    const s = await this.state();
    if (!s) return null;
    const want = new Set();
    if (s.overlay === 'Upgrade') {
      await this.setKeys(want);
      await sleep(900);
      await this.click(360, 380);
      await sleep(400);
      const again = await this.eval(() => window.__td.game.scene.isActive('Upgrade'));
      if (again) { await this.click(360, 640); await sleep(300); await this.click(360, 1000); }
      this.n++;
      return s;
    }
    if (s.overlay) { await this.setKeys(want); return s; }
    let tx = null; let ty = null; let keep = 0;
    if (s.st === 'doors' && s.doors.length) { const d = s.doors[s.doors.length - 1]; tx = d.x; ty = 190; }
    else if (s.st === 'fight' && s.chest) { tx = s.chest.x; ty = s.chest.y; }
    else if (s.st === 'fight' && s.statue) { tx = s.statue.x; ty = s.statue.y; }
    else if (s.enemies.length) {
      let best = null; let bd = Infinity;
      for (const e of s.enemies) { const d = Math.hypot(e.x - s.px, e.y - s.py); if (d < bd) { bd = d; best = e; } }
      tx = best.x; ty = best.y; keep = best.boss ? 190 : 70;
      if (bd < keep * 0.7) { tx = s.px * 2 - best.x; ty = s.py * 2 - best.y; }
      else if (bd < keep) { tx = s.px; ty = s.py; }
    } else if (s.st === 'fight') { tx = 360; ty = 700; }
    if (tx !== null) {
      const dx = tx - s.px; const dy = ty - s.py;
      if (Math.abs(dx) > 24) want.add(dx > 0 ? 'ArrowRight' : 'ArrowLeft');
      if (Math.abs(dy) > 24) want.add(dy > 0 ? 'ArrowDown' : 'ArrowUp');
    }
    await this.setKeys(want);
    return s;
  }
  async playFor(ms, onTick) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const s = await this.botStep();
      if (onTick) await onTick(s);
      await sleep(110);
    }
    await this.setKeys(new Set());
  }
  async waitState(pred, ms, tick = 150) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const s = await this.botStep();
      if (s && pred(s)) return s;
      await sleep(tick);
    }
    return null;
  }
}

async function open(browser, label, query) {
  const page = await browser.newPage({ viewport: VIEW, hasTouch: false });
  watch(page, label);
  await page.goto(`${BASE}?mockads=1&debug=1${query ?? ''}`);
  await page.waitForFunction(() => window.__td && window.__td.game && window.__td.game.scene.isActive('Menu'), null, { timeout: 45000 });
  const s = new Session(page, label);
  return s;
}

async function startRun(s, hero = 'knight') {
  await s.eval((h) => { window.__td.game.scene.stop('Menu'); window.__td.game.scene.start('Game', { hero: h, mode: 'normal' }); }, hero);
  await s.page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 20000 });
  await s.eval(() => window.__game.setMaxDt(0.12));
}

const scenarios = {
  // A real run from the menu: movement, combat, level ups, upgrade overlay, doors, next room.
  async run(browser) {
    const s = await open(browser, 'run');
    await sleep(600);
    await s.shot('menu');
    await startRun(s);
    await sleep(700);
    await s.shot('room-start');
    let shot = { combat: false, up: false, doors: false, many: false };
    // pointer drag (floating joystick) for the first seconds
    await s.drag(360, 900, 120, -120, 900);
    await s.playFor(45000, async (st) => {
      if (!st) return;
      if (!shot.many && st.enemies.length >= 2 && st.st === 'fight') { shot.many = true; await s.shot('combat'); }
      if (!shot.up && st.overlay === 'Upgrade') { shot.up = true; await sleep(500); await s.shot('upgrade'); }
      if (!shot.doors && st.st === 'doors') { shot.doors = true; await s.shot('doors'); }
    });
    const end = await s.state();
    console.log('  run ended:', JSON.stringify({ st: end?.st, room: end?.room, level: end?.level, kills: end?.kills, hp: Math.round(end?.hp ?? 0), upgrades: await s.eval(() => Object.keys(window.__game.run.upgrades).length) }));
    if (!end || end.kills < 5) errors.push('[run] bot killed fewer than 5 enemies');
    await s.page.close();
  },
  async boss(browser) {
    const s = await open(browser, 'boss', '&room=5&god=1&up=blade_orbit,fire_weapon,quick_hands');
    await startRun(s);
    await s.waitState((st) => st.st === 'bossIntro', 20000, 80);
    await sleep(500);
    await s.shot('warning');
    await s.waitState((st) => st.enemies.some((e) => e.boss), 15000, 80);
    await sleep(1400);
    await s.shot('intro');
    await s.waitState((st) => st.st === 'fight', 10000);
    await s.playFor(9000, async () => {});
    await s.shot('fight');
    await s.eval(() => window.__game.killAll());
    await s.waitState((st) => st.st === 'bossDying', 20000, 60);
    await sleep(250);
    await s.shot('death');
    await s.waitState((st) => st.overlay === 'Upgrade', 40000);
    await sleep(900);
    await s.shot('upgrade');
    await s.page.close();
  },
  async king(browser) {
    const s = await open(browser, 'king', '&room=10&god=1&up=blade_orbit,quick_hands');
    await startRun(s);
    await s.waitState((st) => st.enemies.some((e) => e.boss), 30000, 80);
    await s.waitState((st) => st.st === 'fight', 10000);
    await s.playFor(14000, async () => {});
    await s.shot('fight');
    await s.playFor(8000, async () => {});
    await s.shot('fight2');
    await s.page.close();
  },
  async dragon(browser) {
    const s = await open(browser, 'dragon', '&room=15&god=1&up=blade_orbit,quick_hands,sharp_blade');
    await startRun(s);
    await s.waitState((st) => st.enemies.some((e) => e.boss), 30000, 80);
    await s.waitState((st) => st.st === 'fight', 10000);
    await s.playFor(14000, async () => {});
    await s.shot('fight');
    await s.playFor(8000, async () => {});
    await s.shot('fight2');
    await s.page.close();
  },
  // special rooms: treasure (chest + egg offer), shrine, elite
  async rooms(browser) {
    for (const type of ['treasure', 'shrine', 'elite']) {
      const s = await open(browser, type, `&room=4&type=${type}&god=1`);
      await startRun(s);
      await s.waitState((st) => st.st === 'fight', 15000);
      await sleep(400);
      await s.shot('start');
      if (type === 'elite') {
        await s.playFor(9000, async () => {});
        await s.shot('fight');
      } else {
        await s.waitState((st) => st.st === 'modal' || st.overlay === 'Upgrade', 30000);
        await sleep(700);
        await s.shot('modal');
      }
      await s.page.close();
    }
  },
  // Auto-battler feel: each hero with a pile of elemental upgrades, screenshots during the fight.
  async combat(browser) {
    const kits = [
      ['knight', 'fire_weapon,chain_lightning,explosive_death,blade_orbit,quick_hands'],
      ['ranger', 'multishot,piercing_shots,fire_weapon,thunderstorm,lucky_strike'],
      ['mage', 'frost_touch,chain_lightning,venom,meteor_storm,arcane_bounce'],
    ];
    for (const [hero, ups] of kits) {
      const s = await open(browser, `combat-${hero}`, `&room=6&god=1&up=${ups}`);
      await startRun(s, hero);
      await s.waitState((st) => st.st === 'fight', 20000, 100);
      let n = 0;
      let last = Date.now();
      await s.playFor(26000, async (st) => {
        if (st && st.st === 'fight' && st.enemies.length >= 1 && Date.now() - last > 6000) { last = Date.now(); await s.shot(`t${++n}`); }
      });
      await s.page.close();
    }
  },
  // Readability check: a crowded room full of enemies and effects.
  async crowd(browser) {
    const s = await open(browser, 'crowd', '&room=9&god=1&up=fire_weapon,chain_lightning,explosive_death,blade_orbit,thunderstorm,quick_hands,frost_touch');
    await startRun(s, 'knight');
    await s.waitState((st) => st.st === 'fight', 20000, 100);
    await s.eval(() => window.__game.spawn(34));
    let n = 0;
    let last = 0;
    await s.playFor(22000, async (st) => {
      if (st && st.enemies.length >= 8 && Date.now() - last > 5000) { last = Date.now(); await s.shot(`t${++n}`); }
    });
    await s.page.close();
  },
  // Forces every boss attack and freezes the scene while its telegraph is almost full, to inspect it.
  async telegraphs(browser) {
    const bosses = [
      ['slime', 5, ['slimeJump', 'slimeBurst', 'slimeSplit']],
      ['king', 10, ['kingSweep', 'kingSummon', 'kingCharge']],
      ['dragon', 15, ['dragonBreath', 'dragonTailSwipe', 'dragonMeteors', 'dragonRing']],
    ];
    for (const [name, room, attacks] of bosses) {
      const s = await open(browser, `tele-${name}`, `&room=${room}&god=1`);
      await startRun(s);
      await s.waitState((st) => st.st === 'fight' && st.enemies.some((e) => e.boss), 40000, 100);
      for (const atk of attacks) {
        await s.eval((a) => window.__game.attack(a), atk);
        const end = Date.now() + 6000;
        let got = false;
        while (Date.now() < end && !got) {
          got = await s.eval(() => {
            const g = window.__game;
            const t = g.world.tele.pool.find((x) => x.on && x.t / x.dur > 0.72);
            const shots = g.world.enemyShots.pool.filter((p) => p.on).length;
            if (t || shots > 6) { window.__td.game.scene.pause('Game'); return true; }
            return false;
          });
          if (!got) await sleep(40);
        }
        await s.shot(atk);
        await s.eval(() => window.__td.game.scene.resume('Game'));
        await s.eval(() => { const g = window.__game.world; g.tele.clear(); g.enemyShots.clear(); g.boss.busy = 0; g.boss.cooldown = 99; });
        await sleep(300);
      }
      await s.page.close();
    }
  },
  async pause(browser) {
    const s = await open(browser, 'pause');
    await startRun(s);
    await sleep(1500);
    await s.page.keyboard.press('Escape');
    await s.waitState((st) => st.overlay === 'Pause', 5000);
    await sleep(500);
    await s.shot('paused');
    await s.page.keyboard.press('Escape');
    await sleep(500);
    const st = await s.state();
    if (st.overlay) errors.push('[pause] overlay still open after Esc');
    await s.page.close();
  },
  async death(browser) {
    const s = await open(browser, 'death');
    await startRun(s);
    await s.waitState((st) => st.st === 'fight', 15000);
    await s.eval(() => { const w = window.__game.world; w.run.hp = 1; w.player.invuln = 0; w.player.hurt(999); });
    await s.waitState((st) => st.overlay === 'GameOver', 15000, 100);
    await sleep(900);
    await s.shot('gameover');
    // restart a run on the reused scene instances: must come up clean
    await s.eval(() => { const sm = window.__td.game.scene; for (const k of ['GameOver', 'Hud', 'Game']) sm.stop(k); sm.start('Game', { hero: 'mage', mode: 'normal' }); });
    await s.waitState((st) => st.st === 'fight' && st.room === 1 && st.hp > 0, 20000, 100);
    await sleep(1200);
    await s.shot('restarted');
    await s.page.close();
  },
};

const server = await startServer();
let browser;
try {
  browser = await launch();
  const names = wanted.length ? wanted : Object.keys(scenarios);
  for (const n of names) {
    console.log(`scenario ${n}`);
    try { await scenarios[n](browser); } catch (e) { errors.push(`[${n}] ${e.message}`); }
  }
} finally {
  await browser?.close();
  server.kill();
}
if (errors.length) {
  console.error('\nSMOKE FAILED:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('\nSMOKE OK');
