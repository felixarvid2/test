// Kör alla tester: node rune/test/run.js
const R = require('./load.js');
let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.log('FEL:', msg); } }
function board(rows) {
  // rows: 5 strängar med symbolbokstäver: S E M D N B K, . = tom, V = vild sol, T = sten
  const map = { S: 0, E: 1, M: 2, D: 3, N: 4, B: 5, K: 6 };
  const b = new Array(25).fill(null);
  rows.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === '.') return;
    const rn = ch === 'V' ? R.newRune(0, { enh: 'vild' }) : ch === 'T' ? R.newRune(null, { enh: 'sten' }) : R.newRune(map[ch]);
    b[r * 5 + c] = { rune: rn, fresh: true };
  }));
  return b;
}
const types = (pats) => pats.map((p) => p.type).sort().join(',');

// ---- Antal och dataintegritet ----
ok(R.RELICS.length === 150, 'det ska finnas 150 reliker, fanns ' + R.RELICS.length);
const ids = new Set(), icons = {};
R.RELICS.forEach((d) => {
  ok(!ids.has(d.id), 'dubblett-id ' + d.id); ids.add(d.id);
  ok(d.n && d.i && d.d && 'CURL'.includes(d.r) && d.c > 0 && d.cat, 'ofullständig relik ' + d.id);
  ok(R.RELIC_CATS.includes(d.cat), 'okänd kategori ' + d.cat);
  (icons[d.i] = icons[d.i] || []).push(d.id);
});
Object.entries(icons).forEach(([i, l]) => ok(l.length === 1, 'samma ikon ' + i + ': ' + l.join(', ')));
ok(R.RISTS.length === 24, '24 ristningar');

// ---- Mönster ----
let p = R.detect(board(['EEE..', '.....', '.....', '.....', '.....']));
ok(types(p) === 'trio', 'trio: ' + types(p));
p = R.detect(board(['EEEE.', '.....', '.....', '.....', '.....']));
ok(types(p) === 'kvartett', 'kvartett: ' + types(p));
p = R.detect(board(['EEEEE', '.....', '.....', '.....', '.....']));
ok(types(p) === 'linje', 'linje: ' + types(p));
p = R.detect(board(['E....', '.E...', '..E..', '.....', '.....']));
ok(types(p) === 'diagonal', 'diagonal: ' + types(p));
p = R.detect(board(['EE...', 'EE...', '.....', '.....', '.....']));
ok(types(p) === 'kvadrat', 'kvadrat: ' + types(p));
p = R.detect(board(['.E...', 'EEE..', '.E...', '.....', '.....']));
ok(types(p) === 'kors,trio,trio', 'kors: ' + types(p));
p = R.detect(board(['SEMDN', '.....', '.....', '.....', '.....']));
ok(types(p) === 'regnbage', 'regnbåge: ' + types(p));
p = R.detect(board(['SEMES', '.....', '.....', '.....', '.....']));
ok(types(p) === 'spegel', 'spegel: ' + types(p));
p = R.detect(board(['KKK..', 'K.K..', 'KKK..', '.....', '.....']));
ok(types(p).startsWith('ring') && types(p).includes('trio'), 'ring: ' + types(p));
p = R.detect(board(['KKK..', 'KKK..', 'KKK..', '.....', '.....']));
ok(types(p).includes('monolit') && types(p).includes('ring') && types(p).includes('kors'), 'monolit: ' + types(p));
p = R.detect(board(['EVE..', '.....', '.....', '.....', '.....']));
ok(types(p) === 'trio', 'vild trio: ' + types(p));
p = R.detect(board(['EDE..', '.....', '.....', '.....', '.....']), { crown: true });
ok(types(p) === 'trio', 'förbannade kronan: ' + types(p));
p = R.detect(board(['ES...', '.....', '.....', '.....', '.....']).map((c, i) => i === 2 ? { rune: R.newRune(1), fresh: true } : c), { lens: true });
ok(types(p) === 'trio', 'sollinsen: ' + types(p));
p = R.detect(board(['E.EE.', '.....', '.....', '.....', '.....']), { bridge: true });
ok(types(p) === 'trio', 'bryggan: ' + types(p));
p = R.detect(board(['SEB..', '.....', '.....', '.....', '.....']), { smear: true });
ok(types(p) === 'trio', 'smetad: ' + types(p));
p = R.detect(board(['E....', '.E...', '..E..', '.....', '.....']), { noDiag: true });
ok(types(p) === '', 'spegeln-väktaren stoppar diagonaler');

// ---- Poäng: 🔥🔥🔥⚡ = överladdad eld ----
{
  const G = new R.Game(1);
  G.selectBlind();
  G.board = board(['EEEB.', '.....', '.....', '.....', '.....']);
  G.board[3].fresh = false;
  const ctx = R.score(G);
  // Trio 20 chips + 3×5, mult 2 × 1.5 (överladdad) = 35 × 3 = 105
  ok(ctx.score === 105, 'överladdad trio ska ge 105, gav ' + ctx.score);
  G.relics.push(G.makeRelic(null, 'overspanning'));
  ok(R.score(G).score === 35 * 6, 'överspänning ×3');
}

// ---- Exakta poäng för några reliker (gemener = gammal runa, versaler = nyplacerad) ----
{
  const map = { S: 0, E: 1, M: 2, D: 3, N: 4, B: 5, K: 6 };
  const setup = (rows, relics) => {
    const G = new R.Game(5); G.selectBlind();
    G.board = new Array(25).fill(null);
    rows.forEach((row, r) => [...row].forEach((ch, c) => { if (ch !== '.') G.board[r * 5 + c] = { rune: R.newRune(map[ch.toUpperCase()]), fresh: ch === ch.toUpperCase() }; }));
    G.relics = relics.map((id) => G.makeRelic(null, id));
    return G;
  };
  const T = 'EEE..', E = '.....', K = ['.E...', 'EEE..', '.E...', E, E];
  [
    ['trio', [T, E, E, E, E], [], 70],
    ['runsten', [T, E, E, E, E], ['runsten'], 35 * 6],
    ['glödkolet', [T, E, E, E, E], ['glodkol'], 35 * 11],
    ['schablonen', [T, E, E, E, E], ['schablonen'], 350],
    ['avtrycket', [T, E, E, E, E], ['avtrycket', 'runsten'], 35 * 10],
    ['tankestormen', [T, E, E, E, E], ['trefaldigheten', 'tankestormen'], 35 * 8],
    ['kors med kedja', K, [], 175 * 15],
    ['lavinen', K, ['lavinen'], 175 * 20],
    ['ouroboros', K, ['ouroboros'], 175 * 40],
    ['överladdad', ['EEEb.', E, E, E, E], [], 105],
    ['alkemisten', ['EEEb.', E, E, E, E], ['alkemisten'], 157],
    ['upplyst', ['EEEs.', E, E, E, E], [], 100],
    ['förbannad', ['EEEd.', E, E, E, E], [], 140],
    ['stenhjärtat', [T, 'm....', '....n', E, E], ['stenhjartat'], 35 * 6],
    ['förbannade kronan', ['EDE..', E, E, E, E], ['forbannade_kronan'], 70],
    ['sollinsen', ['ESE..', E, E, E, E], ['sollinsen'], 70],
    ['hörnstenen', [T, E, E, E, E], ['hornstenen'], 35 * 10],
    ['hängande lappen', [T, E, E, E, E], ['hangande_lappen'], 90],
    ['regnbåge', ['SEMDN', E, E, E, E], [], 425],
    ['pirathatten', [T, E, E, E, E], ['runsten', 'pirathatten'], 35 * 7]
  ].forEach(([name, rows, rel, want]) => { const got = R.score(setup(rows, rel)).score; ok(got === want, name + ': ' + got + ' ≠ ' + want); });
}

// ---- Alla reliker: spela med varje relik utan krascher ----
let crashed = 0;
R.RELICS.forEach((d, k) => {
  try {
    const G = new R.Game(1000 + k);
    G.money = 20;
    G.relics.push(G.makeRelic(null, d.id));
    G.relics.push(G.makeRelic(null, 'runsten'));
    if (d.copy) G.relics.reverse();
    R.botRun(G, { noRelics: true });
    const s = G.save(); R.Game.load(s);
  } catch (e) { crashed++; console.log('KRASCH med', d.id, e.stack.split('\n').slice(0, 3).join(' | ')); }
});
ok(crashed === 0, crashed + ' reliker kraschade');

// ---- Alla förbrukningskort ----
['star', 'rist', 'eko'].forEach((kind) => {
  Object.keys(R.CONS[kind]).forEach((id) => {
    try {
      const G = new R.Game(7);
      G.relics.push(G.makeRelic(null, 'runsten'));
      G.selectBlind();
      const c = { uid: 1, kind, id, ed: null, sv: 0 };
      G.cons.push(c);
      const d = R.consDef(c);
      const sel = G.hand.slice(0, d.need || 0);
      G.useCons(c, sel);
      R.botRound(G);
    } catch (e) { fails++; console.log('KRASCH kort', kind, id, e.stack.split('\n').slice(0, 3).join(' | ')); }
  });
});

// ---- Alla väktare ----
R.BOSSES.forEach((b) => {
  try {
    const G = new R.Game(3);
    G.ante = 8; G.blinds[2].boss = b.id; G.blindIdx = 2;
    G.selectBlind();
    R.botRound(G);
  } catch (e) { fails++; console.log('KRASCH väktare', b.id, e.stack.split('\n').slice(0, 3).join(' | ')); }
});

// ---- Spara och ladda ----
{
  const G = new R.Game(42);
  G.selectBlind(); R.botPlace(G);
  const G2 = R.Game.load(G.save());
  ok(G2.hand.length === G.hand.length && G2.freshCount() === G.freshCount(), 'spara/ladda behåller hand och bräde');
  ok(G2.board.every((c, i) => !c || c.rune === G2.bag.find((r) => r.uid === c.rune.uid)), 'runor delas efter laddning');
}

// ---- Balans: hur långt kommer boten? ----
const runs = Number(process.env.RUNS || 40);
const res = { none: [], relics: [] };
for (let s = 0; s < runs; s++) {
  res.none.push(R.botRun(new R.Game(500 + s), { noRelics: true }).ante);
  res.relics.push(R.botRun(new R.Game(500 + s), {}).ante);
}
const avg = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2);
const hist = (a) => { const h = {}; a.forEach((x) => (h[x] = (h[x] || 0) + 1)); return JSON.stringify(h); };
console.log('Bot utan reliker: snitt cirkel', avg(res.none), hist(res.none));
console.log('Bot med reliker:  snitt cirkel', avg(res.relics), hist(res.relics));

console.log(fails ? fails + ' fel' : 'Alla tester OK');
process.exit(fails ? 1 : 0);
