// Facklans Djup – spellogik (ingen DOM, går att köra i Node för test)
(function (root) {
  'use strict';

  const W = 44, H = 28;
  const WALL = 0, FLOOR = 1, STAIRS = 2;
  const LAST_DEPTH = 8;

  const rng = seed => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // t = tile-index i Kenneys tilemap_packed (12 kolumner)
  const MON = {
    rat:    { n: 'Råtta',        t: 123, hp: 4,  atk: 2, def: 0, min: 1, max: 4 },
    bat:    { n: 'Fladdermus',   t: 120, hp: 3,  atk: 2, def: 0, min: 1, max: 5, spd: 2, erratic: true },
    slime:  { n: 'Slem',         t: 108, hp: 7,  atk: 2, def: 1, min: 1, max: 4 },
    goblin: { n: 'Goblin',       t: 112, hp: 8,  atk: 3, def: 0, min: 2, max: 6 },
    spider: { n: 'Jättespindel', t: 122, hp: 9,  atk: 4, def: 0, min: 3, max: 7 },
    wolf:   { n: 'Varg',         t: 124, hp: 11, atk: 4, def: 1, min: 3, max: 8 },
    brute:  { n: 'Dunderbrutus', t: 109, hp: 18, atk: 5, def: 1, min: 4, max: 8, slow: true },
    imp:    { n: 'Imp',          t: 110, hp: 12, atk: 6, def: 1, min: 5, max: 8 },
    ghost:  { n: 'Skugga',       t: 121, hp: 8,  atk: 3, def: 0, ghost: true },
    boss:   { n: 'Mörkrets Herre', t: 111, hp: 45, atk: 7, def: 2, boss: true },
  };

  const WEAPONS = [
    { n: 'Dolk', t: 103, atk: 2 },
    { n: 'Kortsvärd', t: 104, atk: 3 },
    { n: 'Svärd', t: 106, atk: 4 },
    { n: 'Eldsvärd', t: 107, atk: 5 },
    { n: 'Stridsyxa', t: 118, atk: 6 },
    { n: 'Krigshammare', t: 117, atk: 7 },
  ];
  const SHIELDS = [
    { n: 'Träsköld', t: 101, def: 1 },
    { n: 'Stålsköld', t: 102, def: 2 },
  ];

  const NAMES = ['Alvar', 'Brynja', 'Torsten', 'Ylva', 'Gunnar', 'Sigrid', 'Orvar', 'Maja', 'Folke', 'Tora', 'Bertil', 'Embla'];
  const EPITAPHS = [
    'Facklan slocknade före mig.',
    'Jag hörde stegen men såg aldrig vem.',
    'Gå inte längre ner.',
    'Mörkret var hungrigare än jag.',
    'Jag sparade olja till en bättre dag.',
  ];

  function Game(seed, graves, name) {
    const r = rng(seed);
    const g = {
      seed, r, graves: graves || [], name: name || NAMES[Math.floor(r() * NAMES.length)],
      depth: 0, turn: 0, kills: 0, over: false, won: false, cause: '', fallen: null,
      log: [], ev: [], map: null, seen: null, lit: null, monsters: [], items: [], dist: null,
      p: { x: 0, y: 0, hp: 24, max: 24, weapon: 0, shield: -1, torch: 250, maxTorch: 250, snuff: false },
    };
    genLevel(g, 1);
    say(g, `${g.name} stiger ner i djupet med en fackla och en dolk.`);
    return g;
  }

  const rnd = (g, n) => Math.floor(g.r() * n);
  const idx = (x, y) => y * W + x;
  const inb = (x, y) => x > 0 && y > 0 && x < W - 1 && y < H - 1;
  function say(g, t) { g.log.push(t); if (g.log.length > 60) g.log.shift(); }
  function emit(g, t, x, y, v) { g.ev.push({ t, x, y, v }); }

  function genLevel(g, depth) {
    g.depth = depth;
    g.map = new Uint8Array(W * H);
    g.seen = new Uint8Array(W * H);
    g.lit = new Uint8Array(W * H);
    g.monsters = [];
    g.items = [];

    const rooms = [];
    const want = 7 + rnd(g, 4);
    for (let tries = 0; tries < 400 && rooms.length < want; tries++) {
      const w = 4 + rnd(g, 6), h = 4 + rnd(g, 4);
      const x = 1 + rnd(g, W - w - 2), y = 1 + rnd(g, H - h - 2);
      if (rooms.every(o => x > o.x + o.w + 1 || o.x > x + w + 1 || y > o.y + o.h + 1 || o.y > y + h + 1)) {
        rooms.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) });
      }
    }
    for (const o of rooms) for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) g.map[idx(x, y)] = FLOOR;
    const carve = (x, y) => { if (inb(x, y)) g.map[idx(x, y)] = FLOOR; };
    const corridor = (a, b) => {
      let x = a.cx, y = a.cy;
      const horizFirst = g.r() < 0.5;
      const hz = () => { while (x !== b.cx) { x += Math.sign(b.cx - x); carve(x, y); } };
      const vt = () => { while (y !== b.cy) { y += Math.sign(b.cy - y); carve(x, y); } };
      if (horizFirst) { hz(); vt(); } else { vt(); hz(); }
    };
    for (let i = 0; i + 1 < rooms.length; i++) corridor(rooms[i], rooms[i + 1]);
    if (rooms.length > 3) corridor(rooms[rnd(g, rooms.length)], rooms[rnd(g, rooms.length)]);
    g.rooms = rooms;

    const start = rooms[0], last = rooms[rooms.length - 1];
    g.p.x = start.cx; g.p.y = start.cy;
    if (depth < LAST_DEPTH) g.map[idx(last.cx, last.cy)] = STAIRS;

    // monster
    const pool = Object.keys(MON).filter(k => !MON[k].ghost && !MON[k].boss && MON[k].min <= depth && depth <= MON[k].max);
    const n = 3 + depth + rnd(g, 3);
    for (let i = 0; i < n; i++) {
      const room = rooms[1 + rnd(g, rooms.length - 1)];
      const sp = freeSpot(g, room);
      if (sp) addMonster(g, pool[rnd(g, pool.length)], sp.x, sp.y);
    }
    if (depth === LAST_DEPTH) {
      const b = addMonster(g, 'boss', last.cx, last.cy);
      b.asleep = true; b.wake = 6;
      say(g, 'Det luktar svavel. Något stort väntar i det sista rummet.');
    }

    // föremål och kistor
    const loot = 3 + rnd(g, 3);
    for (let i = 0; i < loot; i++) {
      const sp = freeSpot(g, rooms[rnd(g, rooms.length)]);
      if (sp) g.items.push(Object.assign({ x: sp.x, y: sp.y }, rollItem(g, depth)));
    }
    for (let i = 0; i < 1 + rnd(g, 2); i++) {
      const sp = freeSpot(g, rooms[1 + rnd(g, rooms.length - 1)]);
      if (sp) g.items.push({ x: sp.x, y: sp.y, k: 'chest', opened: false });
    }
    // alltid minst en oljeflaska i första halvan
    const oilSp = freeSpot(g, rooms[Math.min(2, rooms.length - 1)]);
    if (oilSp) g.items.push({ x: oilSp.x, y: oilSp.y, k: 'oil' });

    // fallna hjältar från tidigare försök
    const grave = g.graves.filter(e => e.depth === depth && !e.looted).pop();
    if (grave && rooms.length > 2) {
      const room = rooms[1 + rnd(g, rooms.length - 2)];
      const sp = freeSpot(g, room);
      if (sp) {
        const gr = { x: sp.x, y: sp.y, k: 'grave', grave };
        g.items.push(gr);
        const sp2 = freeSpot(g, room) || sp;
        const ghost = addMonster(g, 'ghost', sp2.x, sp2.y, { n: `Spöket av ${grave.name}`, hp: 8 + depth * 3, atk: 2 + depth });
        ghost.asleep = true; ghost.wake = 4; ghost.guard = true;
        gr.guard = ghost;
        say(g, `En grav i närheten… ${grave.name} föll här.`);
      }
    }
    computeFov(g);
  }

  function occupied(g, x, y) {
    if (g.p.x === x && g.p.y === y) return true;
    return g.monsters.some(m => m.x === x && m.y === y) || g.items.some(i => i.x === x && i.y === y && (i.k === 'grave' || (i.k === 'chest' && !i.opened)));
  }
  function freeSpot(g, room) {
    for (let i = 0; i < 30; i++) {
      const x = room.x + rnd(g, room.w), y = room.y + rnd(g, room.h);
      if (g.map[idx(x, y)] === FLOOR && !occupied(g, x, y) && !g.items.some(it => it.x === x && it.y === y)) return { x, y };
    }
    return null;
  }

  function addMonster(g, type, x, y, over) {
    const d = MON[type];
    const scale = type === 'boss' || over ? 1 : 1 + 0.06 * (g.depth - 1);
    const m = Object.assign({}, d, over || {});
    m.hp = (over && over.hp) || Math.round(d.hp * scale);
    Object.assign(m, { type, x, y, max: m.hp, asleep: type !== 'ghost', wake: 0 });
    g.monsters.push(m);
    return m;
  }

  function rollItem(g, depth) {
    const roll = g.r() * 100;
    if (roll < 28) return { k: 'oil' };
    if (roll < 58) return { k: 'heal' };
    if (roll < 66) return { k: 'elixir' };
    if (roll < 82) {
      const tier = Math.min(WEAPONS.length - 1, rnd(g, Math.min(depth + 1, WEAPONS.length)));
      return { k: 'weapon', v: tier };
    }
    return { k: 'shield', v: rnd(g, SHIELDS.length) };
  }

  // ---------- ljus och sikt ----------
  function lightRadius(p) {
    if (p.snuff) return 1;
    const f = p.torch / p.maxTorch;
    return f > 0.5 ? 7 : f > 0.25 ? 5 : f > 0 ? 3 : 1;
  }
  function los(g, x0, y0, x1, y1) {
    let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, x = x0, y = y0;
    while (x !== x1 || y !== y1) {
      if ((x !== x0 || y !== y0) && g.map[idx(x, y)] === WALL) return false;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
    return true;
  }
  function computeFov(g) {
    g.lit.fill(0);
    const { x: px, y: py } = g.p;
    const r = lightRadius(g.p);
    for (let y = Math.max(0, py - r); y <= Math.min(H - 1, py + r); y++) {
      for (let x = Math.max(0, px - r); x <= Math.min(W - 1, px + r); x++) {
        const dx = x - px, dy = y - py;
        if (dx * dx + dy * dy > r * r + 0.5) continue;
        if (los(g, px, py, x, y)) { g.lit[idx(x, y)] = 1; g.seen[idx(x, y)] = 1; }
      }
    }
    g.lightR = r;
  }
  function visible(g, m) { return g.lit[idx(m.x, m.y)] === 1; }

  function distMap(g) {
    const d = new Int16Array(W * H).fill(-1);
    const q = [[g.p.x, g.p.y]]; d[idx(g.p.x, g.p.y)] = 0;
    for (let i = 0; i < q.length; i++) {
      const [x, y] = q[i];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!inb(nx, ny) || g.map[idx(nx, ny)] === WALL || d[idx(nx, ny)] >= 0) continue;
        d[idx(nx, ny)] = d[idx(x, y)] + 1; q.push([nx, ny]);
      }
    }
    return d;
  }

  // ---------- spelarens handlingar ----------
  function monsterAt(g, x, y) { return g.monsters.find(m => m.x === x && m.y === y); }

  function act(g, a) {
    if (g.over) return false;
    g.ev = [];
    const p = g.p;
    if (a === 'wait') { endTurn(g); return true; }
    if (a === 'torch') {
      p.snuff = !p.snuff;
      say(g, p.snuff ? 'Du släcker facklan. Mörkret gör dig svår att se.' : 'Du tänder facklan igen.');
      emit(g, 'torch', p.x, p.y);
      endTurn(g); return true;
    }
    const nx = p.x + a.dx, ny = p.y + a.dy;
    if (!inb(nx, ny) || g.map[idx(nx, ny)] === WALL) return false;
    const m = monsterAt(g, nx, ny);
    if (m) { attack(g, m); endTurn(g); return true; }
    const blocker = g.items.find(i => i.x === nx && i.y === ny && (i.k === 'grave' || (i.k === 'chest' && !i.opened)));
    if (blocker) {
      if (blocker.k === 'chest') openChest(g, blocker);
      else openGrave(g, blocker);
      endTurn(g); return true;
    }
    p.x = nx; p.y = ny;
    emit(g, 'step', nx, ny);
    pickup(g);
    if (g.map[idx(nx, ny)] === STAIRS) { descend(g); return true; }
    endTurn(g);
    return true;
  }

  function attack(g, m) {
    const p = g.p;
    const dmg = Math.max(1, WEAPONS[p.weapon].atk + rnd(g, 3) - m.def);
    m.hp -= dmg; m.asleep = false;
    emit(g, 'hit', m.x, m.y, dmg);
    if (m.hp <= 0) {
      g.monsters.splice(g.monsters.indexOf(m), 1);
      g.kills++;
      say(g, `Du besegrar ${m.n.toLowerCase()}.`);
      emit(g, 'kill', m.x, m.y);
      if (m.boss) { g.won = true; g.over = true; say(g, 'Mörkrets Herre faller. Ljuset återvänder till djupet!'); }
      if (m.guard) say(g, 'Graven är obevakad nu.');
    } else {
      say(g, `Du träffar ${m.n.toLowerCase()} för ${dmg}.`);
    }
  }

  function gain(g, it) {
    const p = g.p;
    switch (it.k) {
      case 'oil':
        p.torch = Math.min(p.maxTorch, p.torch + 80);
        say(g, 'Du fyller på facklan med olja.'); break;
      case 'heal': {
        const before = p.hp; p.hp = Math.min(p.max, p.hp + 12);
        say(g, `Du dricker ett helande (+${p.hp - before} hp).`); break;
      }
      case 'elixir':
        p.max += 4; p.hp = Math.min(p.max, p.hp + 4);
        say(g, 'Livselixir! Max hp +4.'); break;
      case 'weapon':
        if (it.v > p.weapon) { p.weapon = it.v; say(g, `Du tar upp ${WEAPONS[it.v].n.toLowerCase()} (attack ${WEAPONS[it.v].atk}).`); }
        else { p.hp = Math.min(p.max, p.hp + 6); say(g, `${WEAPONS[it.v].n} är sämre än ditt vapen. Du säljer den för mat (+6 hp).`); }
        break;
      case 'shield':
        if (it.v > p.shield) { p.shield = it.v; say(g, `Du tar upp ${SHIELDS[it.v].n.toLowerCase()} (försvar ${SHIELDS[it.v].def}).`); }
        else { p.hp = Math.min(p.max, p.hp + 6); say(g, `${SHIELDS[it.v].n} är sämre än din sköld. Du säljer den för mat (+6 hp).`); }
        break;
    }
    emit(g, 'pickup', p.x, p.y);
  }

  function pickup(g) {
    const i = g.items.findIndex(it => it.x === g.p.x && it.y === g.p.y && it.k !== 'chest' && it.k !== 'grave');
    if (i < 0) return;
    const it = g.items.splice(i, 1)[0];
    gain(g, it);
  }

  function openChest(g, c) {
    if (c.opened) { say(g, 'Kistan är tom.'); return; }
    c.opened = true;
    emit(g, 'chest', c.x, c.y);
    const it = rollItem(g, g.depth + 1);
    say(g, 'Du öppnar kistan.');
    gain(g, it);
    if (g.r() < 0.5) gain(g, { k: 'oil' });
  }

  function openGrave(g, gr) {
    if (gr.guard && g.monsters.includes(gr.guard)) { say(g, `${gr.grave.name}s spöke vaktar graven.`); return; }
    const e = gr.grave;
    e.looted = true;
    g.items.splice(g.items.indexOf(gr), 1);
    emit(g, 'grave', gr.x, gr.y);
    say(g, `Du gräver upp ${e.name}s kvarlevor. "${e.epitaph}"`);
    if (e.weapon > g.p.weapon) gain(g, { k: 'weapon', v: e.weapon });
    if (e.shield > g.p.shield) gain(g, { k: 'shield', v: e.shield });
    gain(g, { k: 'oil' }); gain(g, { k: 'oil' });
    gain(g, { k: 'heal' });
  }

  function descend(g) {
    const p = g.p;
    emit(g, 'stairs', p.x, p.y);
    genLevel(g, g.depth + 1);
    p.torch = Math.min(p.maxTorch, p.torch + 30);
    say(g, `Du når våning ${g.depth}.`);
    computeFov(g);
  }

  // ---------- turordning ----------
  function endTurn(g) {
    if (g.over) return;
    const p = g.p;
    g.turn++;

    if (!p.snuff && p.torch > 0) {
      p.torch = Math.max(0, p.torch - (g.depth === LAST_DEPTH ? 2 : 1));
      const f = p.torch / p.maxTorch;
      if (p.torch === 0) say(g, 'Facklan slocknar! Mörkret sluter sig om dig…');
      else if (Math.abs(f - 0.25) < 0.5 / p.maxTorch && f <= 0.25) say(g, 'Facklan flämtar. Ljuset krymper.');
    }
    const dark = !p.snuff && p.torch <= 0;
    if (dark) {
      if (g.turn % 5 === 0) { hurtPlayer(g, 1, 'mörkret'); say(g, 'Mörkret biter dig.'); }
      if (g.turn % 9 === 0 && g.monsters.length < 40) spawnShadow(g);
    } else if (g.turn % 10 === 0 && p.hp < p.max) p.hp++;
    if (g.over) return;

    computeFov(g);
    const d = distMap(g);
    for (const m of g.monsters.slice()) {
      if (g.over) break;
      if (!g.monsters.includes(m)) continue;
      monsterTurn(g, m, d);
    }
    computeFov(g);
  }

  function spawnShadow(g) {
    for (let i = 0; i < 40; i++) {
      const room = g.rooms[rnd(g, g.rooms.length)];
      const x = room.x + rnd(g, room.w), y = room.y + rnd(g, room.h);
      const dist = Math.abs(x - g.p.x) + Math.abs(y - g.p.y);
      if (g.map[idx(x, y)] !== WALL && !occupied(g, x, y) && dist >= 4 && dist <= 12) {
        const m = addMonster(g, 'ghost', x, y, { hp: 6 + g.depth * 2, atk: 2 + (g.depth >> 1) });
        m.asleep = false;
        say(g, 'Något rör sig i mörkret…');
        return;
      }
    }
  }

  function hurtPlayer(g, dmg, cause) {
    g.p.hp -= dmg;
    emit(g, 'hurt', g.p.x, g.p.y, dmg);
    if (g.p.hp <= 0) {
      g.over = true; g.cause = cause;
      g.fallen = {
        name: g.name, depth: g.depth, weapon: g.p.weapon, shield: g.p.shield,
        turns: g.turn, cause, epitaph: EPITAPHS[rnd(g, EPITAPHS.length)], looted: false,
      };
      say(g, `${g.name} faller på våning ${g.depth}. (${cause})`);
      emit(g, 'die', g.p.x, g.p.y);
    }
  }

  function monsterTurn(g, m, d) {
    const p = g.p;
    const dx = p.x - m.x, dy = p.y - m.y;
    const cheb = Math.max(Math.abs(dx), Math.abs(dy));
    if (m.asleep) {
      const notice = m.wake || (p.snuff ? 2 : lightRadius(p) + 2);
      const noticeD = m.wake ? m.wake : notice;
      if (cheb <= noticeD && los(g, m.x, m.y, p.x, p.y) && g.r() < 0.6) {
        m.asleep = false;
        if (visible(g, m)) say(g, `${m.n} vaknar!`);
      }
      return;
    }
    if (m.slow && (g.turn & 1)) return;
    const steps = m.spd || 1;
    for (let s = 0; s < steps; s++) {
      if (g.over) return;
      const adx = p.x - m.x, ady = p.y - m.y;
      if (Math.abs(adx) + Math.abs(ady) === 1) {
        const shield = p.shield >= 0 ? SHIELDS[p.shield].def : 0;
        const dmg = Math.max(1, m.atk + rnd(g, 3) - 1 - shield);
        say(g, `${m.n} träffar dig för ${dmg}.`);
        hurtPlayer(g, dmg, m.n.toLowerCase());
        return;
      }
      if (m.erratic && g.r() < 0.4) { step(g, m, rnd(g, 3) - 1, rnd(g, 3) - 1, false); continue; }
      if (m.ghost) {
        // spöken glider rakt genom väggar
        if (Math.abs(adx) >= Math.abs(ady)) step(g, m, Math.sign(adx), 0, true);
        else step(g, m, 0, Math.sign(ady), true);
        continue;
      }
      let best = null, bd = d[idx(m.x, m.y)];
      if (bd < 0) return;
      for (const [sx, sy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = m.x + sx, ny = m.y + sy;
        const nd = inb(nx, ny) ? d[idx(nx, ny)] : -1;
        if (nd >= 0 && nd < bd && !monsterAt(g, nx, ny) && !(nx === p.x && ny === p.y) && !blockedByItem(g, nx, ny)) { bd = nd; best = [sx, sy]; }
      }
      if (best) step(g, m, best[0], best[1], false);
    }
  }
  function blockedByItem(g, x, y) { return g.items.some(i => i.x === x && i.y === y && (i.k === 'grave' || (i.k === 'chest' && !i.opened))); }
  function step(g, m, sx, sy, ghost) {
    const nx = m.x + sx, ny = m.y + sy;
    if (!sx && !sy) return;
    if (!inb(nx, ny)) return;
    if (!ghost && g.map[idx(nx, ny)] === WALL) return;
    if (monsterAt(g, nx, ny) || (nx === g.p.x && ny === g.p.y) || blockedByItem(g, nx, ny)) return;
    m.x = nx; m.y = ny;
  }

  const api = { Game, act, rng, MON, WEAPONS, SHIELDS, W, H, WALL, FLOOR, STAIRS, LAST_DEPTH, lightRadius, idx, visible, NAMES };
  if (typeof module !== 'undefined') module.exports = api; else root.Dungeon = api;
})(typeof window !== 'undefined' ? window : globalThis);
