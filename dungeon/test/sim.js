// Kör många slumpade omgångar med en enkel bot och kontrollerar invarianter.
// node dungeon/test/sim.js
const D = require('../js/core.js');
const { W, H, WALL, STAIRS, idx } = D;
let wins = 0, deaths = 0, maxDepth = 0, fails = 0;
const depthDeaths = {};

function reachable(g) {
  const seen = new Set([g.p.x + ',' + g.p.y]); const q = [[g.p.x, g.p.y]];
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = (x + dx) + ',' + (y + dy);
      if (g.map[idx(x + dx, y + dy)] !== WALL && !seen.has(k)) { seen.add(k); q.push([x + dx, y + dy]); }
    }
  }
  return seen;
}
function check(cond, msg, g) { if (!cond) { fails++; console.log('FEL:', msg, 'seed', g.seed, 'djup', g.depth); } }

function stairsPos(g) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g.map[idx(x, y)] === STAIRS) return [x, y];
  return null;
}
function botStep(g) {
  // slå först mot grannar, sök sedan upp föremål och kistor
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (g.monsters.some(m => m.x === g.p.x + dx && m.y === g.p.y + dy && !m.asleep)) return { dx, dy };
  }
  const want = g.items.filter(i => i.k !== 'grave' && !i.opened).map(i => [i.x, i.y])
    .sort((a, b) => (Math.abs(a[0] - g.p.x) + Math.abs(a[1] - g.p.y)) - (Math.abs(b[0] - g.p.x) + Math.abs(b[1] - g.p.y)))[0];
  if (want && Math.abs(want[0] - g.p.x) + Math.abs(want[1] - g.p.y) < 14) return pathTo(g, want);
  return pathTo(g, null);
}
function pathTo(g, target) {
  // BFS mot trappan (eller bossen på sista våningen), attackerar det som står i vägen
  target = target || stairsPos(g);
  if (!target) { const b = g.monsters.find(m => m.boss); target = b ? [b.x, b.y] : [g.p.x, g.p.y]; }
  const prev = new Map([[g.p.x + ',' + g.p.y, null]]); const q = [[g.p.x, g.p.y]];
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    if (x === target[0] && y === target[1]) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (g.map[idx(nx, ny)] === WALL || prev.has(k)) continue;
      prev.set(k, [x, y, dx, dy]); q.push([nx, ny]);
    }
  }
  let cur = target[0] + ',' + target[1], move = null;
  while (prev.get(cur)) { const [px, py, dx, dy] = prev.get(cur); move = { dx, dy }; cur = px + ',' + py; }
  if (g.p.hp < g.p.max / 2 && g.r() < 0.1) return 'wait';
  return move || 'wait';
}

for (let seed = 1; seed <= 300; seed++) {
  const graves = seed % 3 === 0 ? [1, 2, 3, 4].map(d => ({ name: 'Test', depth: d, weapon: 2, shield: 0, epitaph: 'x', looted: false })) : [];
  const g = D.Game(seed, graves);
  let turns = 0;
  while (!g.over && turns < 6000) {
    if (g.turn % 50 === 0 || turns === 0) {
      const r = reachable(g);
      const s = stairsPos(g);
      if (s) check(r.has(s[0] + ',' + s[1]), 'trappan nåbar', g);
    }
    if (g.p.torch === 0 && g.r() < 0.02) D.act(g, 'torch');
    D.act(g, botStep(g)) || D.act(g, 'wait');
    check(g.map[idx(g.p.x, g.p.y)] !== WALL, 'spelare i vägg', g);
    const seen = new Set();
    for (const m of g.monsters) {
      const k = m.x + ',' + m.y;
      check(!seen.has(k), 'två monster på samma ruta', g); seen.add(k);
      check(!(m.x === g.p.x && m.y === g.p.y), 'monster på spelaren', g);
      if (!m.ghost) check(g.map[idx(m.x, m.y)] !== WALL, 'monster i vägg', g);
    }
    turns++;
  }
  maxDepth = Math.max(maxDepth, g.depth);
  if (g.won) wins++; else if (g.over) { deaths++; depthDeaths[g.depth] = (depthDeaths[g.depth] || 0) + 1; }
  else { fails++; console.log('FEL: fastnade, seed', seed, 'djup', g.depth); }
}
console.log({ wins, deaths, maxDepth, depthDeaths, fails });
process.exit(fails ? 1 : 0);
