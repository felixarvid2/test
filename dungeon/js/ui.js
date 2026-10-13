// Facklans Djup – rendering, ljud och inmatning
(function () {
  'use strict';
  const D = window.Dungeon;
  const { W, H, WALL, STAIRS, idx } = D;
  const T = 16, VW = 21, VH = 15;
  const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const $ = id => document.getElementById(id);

  const sheet = new Image();
  sheet.src = 'assets/tiny-dungeon/tilemap_packed.png';
  let sheetReady = false;
  sheet.onload = () => { sheetReady = true; };

  function tile(n, x, y) { ctx.drawImage(sheet, (n % 12) * T, Math.floor(n / 12) * T, T, T, x, y, T, T); }

  // ---------- spara ----------
  const KEY = 'facklansdjup.graves';
  function loadGraves() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function saveGraves(list) { try { localStorage.setItem(KEY, JSON.stringify(list.slice(-24))); } catch (e) { /* privat läge */ } }

  // ---------- ljud ----------
  let muted = false;
  const SND = {
    step: ['footstep00', 'footstep03', 'footstep06'], hit: ['knifeSlice', 'knifeSlice2'], hurt: ['metalPot1'],
    pickup: ['handleSmallLeather'], chest: ['doorOpen_1'], stairs: ['doorClose_1'], die: ['metalPot3'],
    torch: ['metalLatch'], grave: ['dropLeather'], kill: ['handleCoins'],
  };
  const cache = {};
  function sfx(kind) {
    if (muted || !SND[kind]) return;
    const name = SND[kind][Math.floor(Math.random() * SND[kind].length)];
    try {
      const a = (cache[name] = cache[name] || new Audio(`assets/audio/${name}.ogg`)).cloneNode();
      a.volume = kind === 'step' ? 0.25 : 0.5;
      a.play().catch(() => {});
    } catch (e) { /* inget ljud */ }
  }

  // ---------- spel ----------
  let g = null, state = 'title';
  let floaters = [], shake = 0;
  const graves = loadGraves();

  function start() {
    g = D.Game((Math.random() * 2 ** 31) | 0, graves);
    state = 'play'; floaters = [];
    $('overlay').className = 'hidden';
    render();
  }

  function overlay(html) { const o = $('overlay'); o.innerHTML = html; o.className = ''; }

  function showTitle() {
    state = 'title';
    const fallen = graves.filter(e => !e.looted).length;
    overlay(`
      <h1>FACKLANS DJUP</h1>
      <p>Du har en fackla, en dolk och åtta våningar framför dig. <b>Facklan brinner ner</b> för varje steg – när den slocknar biter mörkret och skuggor kommer. Fyll på med olja, eller <b>släck den (T)</b> och smyg: i mörker ser du nästan ingenting, men inte heller monstren dig.</p>
      <p><b>Dina fallna hjältar stannar kvar.</b> Dör du på våning 4 vilar du där nästa gång – med vapen och sköld, bevakad av ditt eget spöke. Besegra det och gräv upp dina egna ägodelar.</p>
      <p>${fallen ? `${fallen} fallen hjälte väntar i djupet.` : 'Inga hjältar har fallit än.'}</p>
      <button id="go">Stig ner (Enter)</button>`);
    $('go').onclick = start;
  }

  function showEnd() {
    const won = g.won;
    if (!won && g.fallen) { graves.push(g.fallen); saveGraves(graves); }
    state = 'end';
    const score = g.depth * 50 + g.kills * 5 + (won ? 500 : 0);
    overlay(`
      <h1>${won ? 'LJUSET ÅTERVÄNDER' : 'FACKLAN SLOCKNAR'}</h1>
      <p>${won ? `${g.name} besegrade Mörkrets Herre.` : `${g.name} föll på våning ${g.depth} (${g.cause}).`}</p>
      <p>Poäng <b>${score}</b> · besegrade <b>${g.kills}</b> · steg <b>${g.turn}</b></p>
      <p>${won ? '' : `En grav markerar platsen på våning ${g.depth}. Nästa hjälte kan hämta ${g.name}s ägodelar – om spöket besegras.`}</p>
      <button id="go">Ny hjälte (Enter)</button>`);
    $('go').onclick = start;
  }

  function handleEvents() {
    for (const e of g.ev) {
      sfx(e.t);
      if (e.t === 'hit') floaters.push({ x: e.x, y: e.y, text: '-' + e.v, color: '#ffe27a', t: 0 });
      if (e.t === 'hurt') { floaters.push({ x: e.x, y: e.y, text: '-' + e.v, color: '#ff5a4a', t: 0 }); shake = 6; }
      if (e.t === 'grave') saveGraves(graves);
    }
  }

  function act(a) {
    if (state !== 'play') return;
    if (D.act(g, a)) {
      handleEvents();
      if (g.over) { render(); setTimeout(showEnd, 900); state = 'dying'; }
    }
  }

  // ---------- inmatning ----------
  const KEYS = {
    ArrowUp: 'up', w: 'up', k: 'up', ArrowDown: 'down', s: 'down', j: 'down', ArrowLeft: 'left', a: 'left', h: 'left',
    ArrowRight: 'right', d: 'right', l: 'right', ' ': 'wait', '.': 'wait', z: 'wait', t: 'torch', m: 'mute',
  };
  const DIRS = { up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 }, left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 } };
  function command(c) {
    if (c === 'mute') { muted = !muted; document.querySelector('[data-a=mute]').textContent = muted ? '🔇' : '🔊'; return; }
    if (c === 'wait' || c === 'torch') return act(c);
    act(DIRS[c]);
  }
  addEventListener('keydown', e => {
    if (e.key === 'Enter' && (state === 'title' || state === 'end')) { start(); return; }
    const c = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (c) { e.preventDefault(); command(c); }
  });
  document.querySelectorAll('#pad button').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); command(b.dataset.a); }));
  // svep på spelplanen
  let sx = 0, sy = 0;
  $('stage').addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; });
  $('stage').addEventListener('pointerup', e => {
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.hypot(dx, dy) < 24) return;
    command(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  });

  // ---------- rendering ----------
  function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function neighbourFloor(x, y) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && g.map[idx(nx, ny)] !== WALL) return true;
    }
    return false;
  }

  let last = 0;
  function render(now) {
    if (!g || !sheetReady) return;
    now = now || performance.now();
    const dt = Math.min(64, now - last); last = now;
    const p = g.p;
    const camX = Math.max(0, Math.min(W - VW, p.x - (VW >> 1))), camY = Math.max(0, Math.min(H - VH, p.y - (VH >> 1)));
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
    const ox = shake > 0 ? Math.round((Math.random() - 0.5) * shake) : 0, oy = shake > 0 ? Math.round((Math.random() - 0.5) * shake) : 0;
    ctx.save(); ctx.translate(ox, oy);
    const flick = Math.sin(now / 90) * 0.25 + Math.sin(now / 37) * 0.15;
    const r = g.lightR + (p.snuff ? 0 : flick);

    for (let vy = 0; vy < VH; vy++) for (let vx = 0; vx < VW; vx++) {
      const x = camX + vx, y = camY + vy, i = idx(x, y);
      if (!g.seen[i]) continue;
      const px = vx * T, py = vy * T, t = g.map[i];
      if (t === WALL) { if (neighbourFloor(x, y)) tile(hash(x, y) < 0.3 ? 59 : 40, px, py); else continue; }
      else {
        const h = hash(x, y);
        tile(h < 0.04 ? 24 : 0, px, py);
        if (t === STAIRS) tile(56, px, py);
      }
    }
    // föremål
    for (const it of g.items) {
      const i = idx(it.x, it.y);
      if (!g.seen[i] || it.x < camX || it.y < camY || it.x >= camX + VW || it.y >= camY + VH) continue;
      const n = it.k === 'oil' ? 130 : it.k === 'heal' ? 127 : it.k === 'elixir' ? 116 :
        it.k === 'weapon' ? D.WEAPONS[it.v].t : it.k === 'shield' ? D.SHIELDS[it.v].t :
        it.k === 'chest' ? (it.opened ? 91 : 89) : 65;
      tile(n, (it.x - camX) * T, (it.y - camY) * T);
    }
    // monster syns bara i ljuset
    for (const m of g.monsters) {
      if (!g.lit[idx(m.x, m.y)] || m.x < camX || m.y < camY || m.x >= camX + VW || m.y >= camY + VH) continue;
      const px = (m.x - camX) * T, py = (m.y - camY) * T;
      if (m.ghost) ctx.globalAlpha = 0.75;
      tile(m.t, px, py);
      ctx.globalAlpha = 1;
      if (m.asleep) { ctx.fillStyle = '#9ad'; ctx.fillRect(px + 12, py, 3, 1); ctx.fillRect(px + 13, py + 1, 2, 1); ctx.fillRect(px + 12, py + 2, 3, 1); }
      if (m.hp < m.max) { ctx.fillStyle = '#000'; ctx.fillRect(px + 1, py + 14, 14, 2); ctx.fillStyle = '#d8453a'; ctx.fillRect(px + 1, py + 14, Math.max(1, Math.round(14 * m.hp / m.max)), 2); }
    }
    tile(88, (p.x - camX) * T, (p.y - camY) * T);

    // ljus och mörker
    for (let vy = 0; vy < VH; vy++) for (let vx = 0; vx < VW; vx++) {
      const x = camX + vx, y = camY + vy, i = idx(x, y);
      if (!g.seen[i]) continue;
      let a;
      if (g.lit[i]) {
        const d = Math.hypot(x - p.x, y - p.y);
        a = Math.max(0, Math.min(0.92, (d - r * 0.45) / (r * 0.65 + 0.4)));
        if (!p.snuff && p.torch > 0 && a < 0.6) { ctx.fillStyle = `rgba(255,140,30,${(0.1 * (1 - a)).toFixed(3)})`; ctx.fillRect(vx * T, vy * T, T, T); }
      } else a = 0.74;
      ctx.fillStyle = `rgba(0,0,0,${a.toFixed(3)})`;
      ctx.fillRect(vx * T, vy * T, T, T);
    }
    // flytande siffror
    ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
    for (const f of floaters) {
      f.t += dt;
      const px = (f.x - camX) * T + 8, py = (f.y - camY) * T - f.t / 60;
      ctx.globalAlpha = Math.max(0, 1 - f.t / 700);
      ctx.fillStyle = '#000'; ctx.fillText(f.text, px + 1, py + 1);
      ctx.fillStyle = f.color; ctx.fillText(f.text, px, py);
    }
    ctx.globalAlpha = 1;
    floaters = floaters.filter(f => f.t < 700);
    ctx.restore();
    if (shake > 0) shake = Math.max(0, shake - 0.5);
    hud();
  }

  function hud() {
    const p = g.p;
    $('hpv').textContent = `${Math.max(0, p.hp)}/${p.max}`;
    $('hpbar').firstElementChild.style.width = Math.max(0, p.hp / p.max * 100) + '%';
    $('torchv').textContent = `${p.torch}/${p.maxTorch}`;
    $('torchbar').firstElementChild.style.width = (p.torch / p.maxTorch * 100) + '%';
    $('depth').textContent = `Våning ${g.depth}/${D.LAST_DEPTH}`;
    $('state').textContent = p.snuff ? '🌑 släckt – smyger' : p.torch <= 0 ? '⚠ MÖRKER' : '🔥 tänd';
    $('gear').textContent = `${D.WEAPONS[p.weapon].n} (${D.WEAPONS[p.weapon].atk})  ${p.shield >= 0 ? D.SHIELDS[p.shield].n + ' (' + D.SHIELDS[p.shield].def + ')' : 'ingen sköld'}`;
    $('score').textContent = `${g.name} · ${g.kills} dödade · steg ${g.turn}`;
    const log = $('log'), lines = g.log.slice(-4).map(t => `<div>${t.replace(/</g, '&lt;')}</div>`).join('');
    if (log.innerHTML !== lines) log.innerHTML = lines;
  }

  function loop(now) { render(now); requestAnimationFrame(loop); }
  showTitle();
  requestAnimationFrame(loop);
  window.__game = () => g; // för test
})();
