// Rune – 150 reliker (motsvarigheten till Balatros jokrar).
//
// Varje relik: id, n (namn), i (ikon), r (sällsynthet C/U/R/L), c (pris), cat (kategori),
// d (beskrivning), a (närmaste Balatro-motsvarighet, för planen) och krokar:
//   init(st)                          startvärden för relikens räknare
//   info(st, G)                       kort text om nuvarande värde
//   rules {..}                        regeländringar (detektion, reaktioner, kedjor …)
//   mods(st, G) -> {hand, casts, discards, place, slots, cons, interest, freeRerolls}
//   before(ctx, st)                   innan poängräkningen (skalning som räknas direkt)
//   rune(ctx, st, rn, i, p) -> eff     när en runa poängsätts (per trigger)
//   retrig(ctx, st, rn, i, p) -> n     extra triggers för en poängsatt runa
//   pattern(ctx, st, p) -> eff        efter ett mönsters runor
//   held(ctx, st, rn, i) -> eff        för varje runa som ligger kvar på brädet
//   heldRetrig(ctx, st, rn, i) -> n
//   cast(ctx, st) -> eff              relikens huvudeffekt, i relikordning
//   after(ctx, st)                    efter kastet (skalning som räknas nästa gång)
//   discard(G, st, runes), blindSelect(G, st, inst), roundEnd(G, st, inst), cashout(G, st) -> $,
//   reroll(G, st), sellAny(G, st, what), sold(G, st, inst), useCons(G, st, c), packSkip(G, st),
//   added(G, st, runes), destroyed(G, st, runes, why), shopLeave(G, st)
// eff = { chips, mult, xmult, money, msg }
(function () {
  'use strict';
  var R = (typeof window !== 'undefined' ? window : globalThis).R;
  var S = R.SYMS;
  var L = [];
  function def(o) { L.push(o); }
  function rowOf(i) { return Math.floor(i / 5); }

  // ===== Grund =================================================================
  def({ id: 'runsten', n: 'Runsten', i: '🪨', r: 'C', c: 2, cat: 'Grund', a: 'Joker', d: '+4 Mult.',
    cast: function () { return { mult: 4 }; } });
  def({ id: 'samlarsten', n: 'Samlarsten', i: '💍', r: 'C', c: 4, cat: 'Grund', a: 'Abstract Joker', d: '+3 Mult för varje relik du har.',
    cast: function (ctx) { return { mult: 3 * ctx.G.relics.length }; } });
  def({ id: 'feltrycket', n: 'Feltrycket', i: '🎲', r: 'C', c: 4, cat: 'Grund', a: 'Misprint', d: '+0 till +23 Mult, slumpas varje kast.',
    cast: function (ctx) { return { mult: Math.floor(ctx.G.rnd() * 24) }; } });
  def({ id: 'fana', n: 'Fanan', i: '🚩', r: 'C', c: 5, cat: 'Grund', a: 'Banner', d: '+30 Chips för varje byte du har kvar.',
    cast: function (ctx) { return { chips: 30 * ctx.G.discards }; } });
  def({ id: 'bergstopp', n: 'Bergstoppen', i: '🏔️', r: 'C', c: 5, cat: 'Grund', a: 'Mystic Summit', d: '+15 Mult om du har 0 byten kvar.',
    cast: function (ctx) { return ctx.G.discards === 0 ? { mult: 15 } : null; } });
  def({ id: 'halvmane', n: 'Halvmånen', i: '🌗', r: 'C', c: 5, cat: 'Grund', a: 'Half Joker', d: '+20 Mult om du placerar 3 eller färre runor.',
    cast: function (ctx) { return ctx.placedN <= 3 ? { mult: 20 } : null; } });
  def({ id: 'akrobaten', n: 'Akrobaten', i: '🤸', r: 'U', c: 6, cat: 'Grund', a: 'Acrobat', d: '×3 Mult på prövningens sista kast.',
    cast: function (ctx) { return ctx.last ? { xmult: 3 } : null; } });
  def({ id: 'gryningen', n: 'Gryningen', i: '🌅', r: 'U', c: 6, cat: 'Grund', a: '(ny)', d: '×2 Mult på prövningens första kast.',
    cast: function (ctx) { return ctx.first ? { xmult: 2 } : null; } });
  def({ id: 'schablonen', n: 'Schablonen', i: '✂️', r: 'U', c: 8, cat: 'Grund', a: 'Joker Stencil', d: '×1 Mult för varje tomt relikfack (Schablonen räknas som tom).',
    info: function (st, G) { return '×' + (G.relicSlots() - G.relics.length + G.relics.filter(function (x) { return x.id === 'schablonen'; }).length); },
    cast: function (ctx) { var G = ctx.G; var x = G.relicSlots() - G.relics.length + G.relics.filter(function (r) { return r.id === 'schablonen'; }).length; return x > 1 ? { xmult: x } : null; } });
  def({ id: 'pirathatten', n: 'Pirathatten', i: '🏴‍☠️', r: 'C', c: 4, cat: 'Grund', a: 'Swashbuckler', d: 'Lägger till säljvärdet av alla andra reliker som Mult.',
    cast: function (ctx, st) { var m = 0; ctx.G.relics.forEach(function (r) { if (r.st !== st) m += ctx.G.sellValue(r); }); return { mult: m }; } });
  def({ id: 'tjuren', n: 'Tjuren', i: '🐂', r: 'U', c: 6, cat: 'Grund', a: 'Bull', d: '+2 Chips för varje $ du har.',
    cast: function (ctx) { return { chips: 2 * Math.max(0, ctx.G.money) }; } });
  def({ id: 'stovelremmen', n: 'Stövelremmen', i: '👢', r: 'U', c: 7, cat: 'Grund', a: 'Bootstraps', d: '+2 Mult för varje $5 du har.',
    cast: function (ctx) { return { mult: 2 * Math.floor(Math.max(0, ctx.G.money) / 5) }; } });
  def({ id: 'stenmuren', n: 'Stenmuren', i: '🧱', r: 'U', c: 6, cat: 'Grund', a: 'Stone Joker', d: '+25 Chips för varje Sten-runa i påsen.',
    cast: function (ctx) { return { chips: 25 * ctx.G.bag.filter(function (r) { return r.enh === 'sten'; }).length }; } });

  // ===== Element ===============================================================
  var ELEM = [['solsten', 'Solstenen', '🌤️', 'Greedy Joker'], ['glodkol', 'Glödkolet', '🧯', 'Lusty Joker'], ['manesilver', 'Månsilvret', '🥈', 'Wrathful Joker'],
    ['benflojt', 'Benflöjten', '🦴', 'Gluttonous Joker'], ['rotknuta', 'Rotknutan', '🫚', '(ny)'], ['askstav', 'Åskstaven', '🪄', '(ny)'], ['prisma', 'Prismat', '🔺', '(ny)']];
  ELEM.forEach(function (e, s) {
    def({ id: e[0], n: e[1], i: e[2], r: 'C', c: 5, cat: 'Element', a: e[3], d: 'Varje poängsatt ' + S[s].e + ' ger +3 Mult.',
      rune: function (ctx, st, rn, i) { return ctx.is(i, s) ? { mult: 3 } : null; } });
  });
  def({ id: 'ljuslykta', n: 'Ljuslyktan', i: '🏮', r: 'U', c: 7, cat: 'Element', a: 'Arrowhead', d: 'Varje poängsatt ☀️ ger +50 Chips.',
    rune: function (ctx, st, rn, i) { return ctx.is(i, R.SOL) ? { chips: 50 } : null; } });
  def({ id: 'glodsten', n: 'Glödstenen', i: '🩸', r: 'U', c: 7, cat: 'Element', a: 'Bloodstone', d: 'Varje poängsatt 🔥 har 1 på 2 chans att ge ×1.5 Mult.',
    rune: function (ctx, st, rn, i) { return ctx.is(i, R.ELD) && ctx.G.chance(2) ? { xmult: 1.5 } : null; } });
  def({ id: 'tidparla', n: 'Tidpärlan', i: '🦪', r: 'U', c: 7, cat: 'Element', a: 'Rough Gem', d: 'Varje poängsatt 🌙 ger $1.',
    rune: function (ctx, st, rn, i) { return ctx.is(i, R.MANE) ? { money: 1 } : null; } });
  def({ id: 'gravstenen', n: 'Gravurnan', i: '⚱️', r: 'U', c: 7, cat: 'Element', a: 'Onyx Agate', d: 'Varje poängsatt 💀 ger +7 Mult.',
    rune: function (ctx, st, rn, i) { return ctx.is(i, R.DOD) ? { mult: 7 } : null; } });
  def({ id: 'kristallkronan', n: 'Kristallkronan', i: '💠', r: 'U', c: 7, cat: 'Element', a: 'Baron (svagare)', d: 'Varje 💎 som ligger kvar på brädet ger ×1.25 Mult.',
    held: function (ctx, st, rn, i) { return ctx.is(i, R.KRISTALL) ? { xmult: 1.25 } : null; } });
  def({ id: 'nattens_oga', n: 'Nattens öga', i: '👁️', r: 'C', c: 5, cat: 'Element', a: 'Shoot the Moon', d: 'Varje 🌙 som ligger kvar på brädet ger +13 Mult.',
    held: function (ctx, st, rn, i) { return ctx.is(i, R.MANE) ? { mult: 13 } : null; } });
  def({ id: 'visitkortet', n: 'Visitkortet', i: '💼', r: 'C', c: 4, cat: 'Element', a: 'Business Card', d: 'Varje poängsatt 💀 har 1 på 2 chans att ge $2.',
    rune: function (ctx, st, rn, i) { return ctx.is(i, R.DOD) && ctx.G.chance(2) ? { money: 2 } : null; } });
  def({ id: 'blomkrukan', n: 'Blomkrukan', i: '🪴', r: 'U', c: 6, cat: 'Element', a: 'Flower Pot', d: '×3 Mult om kastet poängsätter minst 4 olika symboler.',
    cast: function (ctx) { return ctx.distinctSyms() >= 4 ? { xmult: 3 } : null; } });
  def({ id: 'urtidsrunan', n: 'Urtidsrunan', i: '🏺', r: 'R', c: 8, cat: 'Element', a: 'Ancient Joker', d: 'Varje poängsatt [symbol] ger ×1.5 Mult. Symbolen byts efter varje prövning.',
    init: function (st, G) { st.sym = G ? Math.floor(G.rnd() * 7) : 0; },
    info: function (st) { return 'Symbol: ' + S[st.sym].e; },
    rune: function (ctx, st, rn, i) { return ctx.is(i, st.sym) ? { xmult: 1.5 } : null; },
    roundEnd: function (G, st) { st.sym = Math.floor(G.rnd() * 7); } });
  def({ id: 'idolen', n: 'Idolen', i: '🛐', r: 'U', c: 6, cat: 'Element', a: 'The Idol', d: 'Varje poängsatt [symbol] i [rad] ger ×2 Mult. Byts efter varje prövning.',
    init: function (st, G) { st.sym = G ? Math.floor(G.rnd() * 7) : 0; st.row = G ? Math.floor(G.rnd() * 5) : 0; },
    info: function (st) { return S[st.sym].e + ' i rad ' + (st.row + 1); },
    rune: function (ctx, st, rn, i) { return ctx.is(i, st.sym) && rowOf(i) === st.row ? { xmult: 2 } : null; },
    roundEnd: function (G, st) { st.sym = Math.floor(G.rnd() * 7); st.row = Math.floor(G.rnd() * 5); } });

  // ===== Mönster ===============================================================
  function patMult(id, n, ic, t, m, c, a) {
    def({ id: id, n: n, i: ic, r: 'C', c: c, cat: 'Mönster', a: a, d: '+' + m + ' Mult om kastet innehåller ' + R.patA(t) + '.',
      cast: function (ctx) { return ctx.hasType(t) ? { mult: m } : null; } });
  }
  patMult('glad_trefot', 'Glada trefoten', '🔻', 'trio', 8, 3, 'Jolly Joker');
  patMult('snedsteget', 'Snedsteget', '↗️', 'diagonal', 10, 4, 'Zany Joker');
  patMult('fyrkanten', 'Fyrkanten', '🟪', 'kvadrat', 10, 4, 'Mad Joker');
  patMult('fyrklovern', 'Fyrklövern', '☘️', 'kvartett', 12, 4, 'Crazy Joker');
  patMult('regnbagsfjadern', 'Regnbågsfjädern', '🪶', 'regnbage', 12, 4, 'Droll Joker');
  patMult('spegelskarvan', 'Spegelskärvan', '🪞', 'spegel', 12, 4, '(ny)');
  patMult('korsriddaren', 'Korsriddaren', '⚔️', 'kors', 16, 5, '(ny)');
  patMult('linjalen', 'Linjalen', '📏', 'linje', 18, 5, '(ny)');
  patMult('glorian', 'Glorian', '😇', 'ring', 25, 5, '(ny)');
  patMult('stenhuggaren', 'Stenhuggaren', '🔨', 'monolit', 30, 5, '(ny)');
  function patChips(id, n, ic, t, ch, a) {
    def({ id: id, n: n, i: ic, r: 'C', c: 4, cat: 'Mönster', a: a, d: '+' + ch + ' Chips om kastet innehåller ' + R.patA(t) + '.',
      cast: function (ctx) { return ctx.hasType(t) ? { chips: ch } : null; } });
  }
  patChips('travstaven', 'Trästaven', '🪵', 'trio', 50, 'Sly Joker');
  patChips('tegelstenen', 'Tegelstenen', '🟫', 'kvadrat', 80, 'Clever Joker');
  patChips('fyrfoten', 'Fyrfoten', '🐾', 'kvartett', 100, 'Devious Joker');
  function patX(id, n, ic, t, x, a) {
    def({ id: id, n: n, i: ic, r: 'R', c: 8, cat: 'Mönster', a: a, d: '×' + x + ' Mult om kastet innehåller ' + R.patA(t) + '.',
      cast: function (ctx) { return ctx.hasType(t) ? { xmult: x } : null; } });
  }
  patX('trefaldigheten', 'Trefaldigheten', '🔱', 'trio', 2, 'The Duo');
  patX('snedkronet', 'Snedkrönet', '👒', 'diagonal', 2.5, 'The Trio');
  patX('kubtornet', 'Kubtornet', '🏯', 'kvadrat', 2.5, 'The Family');
  patX('fyrtornet', 'Fyrtornet', '🗼', 'kvartett', 3, 'The Order');
  patX('prismakronan', 'Prismakronan', '🌈', 'regnbage', 3, 'The Tribe');
  patX('tvillingarna', 'Spegeltvillingarna', '👯', 'spegel', 3, '(ny)');

  // ===== Kedjor (flera mönster i samma kast) ===================================
  def({ id: 'kedjelanken', n: 'Kedjelänken', i: '⛓️', r: 'C', c: 4, cat: 'Kedjor', a: '(ny)', d: '+5 Mult för varje mönster i kastet utöver det första.',
    cast: function (ctx) { return ctx.realN > 1 ? { mult: 5 * (ctx.realN - 1) } : null; } });
  def({ id: 'dominobrickan', n: 'Dominobrickan', i: '🁣', r: 'U', c: 6, cat: 'Kedjor', a: '(ny)', d: '×1.25 Mult för varje mönster i kastet utöver det första.',
    cast: function (ctx) { return ctx.realN > 1 ? { xmult: Math.pow(1.25, ctx.realN - 1) } : null; } });
  def({ id: 'lavinen', n: 'Lavinen', i: '❄️', r: 'R', c: 8, cat: 'Kedjor', a: '(ny)', d: 'Kedjebonusen fördubblas: ×0.5 Mult per extra mönster i stället för ×0.25.',
    rules: { chainStep: 0.5 } });
  def({ id: 'ekot', n: 'Ekot', i: '🔔', r: 'U', c: 6, cat: 'Kedjor', a: '(ny)', d: 'Om kastet har 3 eller fler mönster triggas runorna i det första mönstret en extra gång.',
    retrig: function (ctx, st, rn, i, p) { return ctx.realN >= 3 && p === ctx.real[0] ? 1 : 0; } });
  def({ id: 'kaskaden', n: 'Kaskaden', i: '💧', r: 'U', c: 6, cat: 'Kedjor', a: '(ny, skalande)', d: 'Får +2 Mult permanent varje gång ett kast har 3 eller fler mönster.',
    init: function (st) { st.v = 0; }, info: function (st) { return '+' + st.v + ' Mult'; },
    before: function (ctx, st) { if (ctx.realN >= 3) { st.v += 2; ctx.note(st, 'Uppgraderad!'); } },
    cast: function (ctx, st) { return st.v ? { mult: st.v } : null; } });
  def({ id: 'ensamvargen', n: 'Ensamvargen', i: '🐺', r: 'C', c: 4, cat: 'Kedjor', a: '(ny)', d: '+15 Mult om kastet har exakt ett mönster.',
    cast: function (ctx) { return ctx.realN === 1 ? { mult: 15 } : null; } });
  def({ id: 'brokiga', n: 'Brokiga väven', i: '🧶', r: 'U', c: 6, cat: 'Kedjor', a: '(ny)', d: '×2 Mult om kastet innehåller minst 3 olika mönstertyper.',
    cast: function (ctx) { return ctx.typeN() >= 3 ? { xmult: 2 } : null; } });

  // ===== Reaktioner (katalysatorrunor intill mönster) ==========================
  def({ id: 'overspanning', n: 'Överspänningen', i: '🔋', r: 'R', c: 8, cat: 'Reaktioner', a: '(ny)', d: 'Överladdad (⚡ intill ett mönster) ger ×3 Mult i stället för ×1.5.',
    rules: { rxBlixt: 3 } });
  def({ id: 'smedjan', n: 'Smedjan', i: '⚒️', r: 'U', c: 6, cat: 'Reaktioner', a: '(ny)', d: 'Brinnande (🔥 intill ett mönster) ger +20 Mult i stället för +6.',
    rules: { rmEld: 20 } });
  def({ id: 'slipstenen', n: 'Slipstenen', i: '🪚', r: 'U', c: 6, cat: 'Reaktioner', a: '(ny)', d: 'Förstärkt (💎 intill ett mönster) ger +150 Chips i stället för +40.',
    rules: { rcKristall: 150 } });
  def({ id: 'gronskan', n: 'Grönskan', i: '🌱', r: 'C', c: 5, cat: 'Reaktioner', a: '(ny)', d: 'Växande (🌿 intill ett mönster) ger +30 Chips per runa i stället för +10.',
    rules: { rcNatur: 30 } });
  def({ id: 'solglasogonen', n: 'Solglasögonen', i: '🕶️', r: 'R', c: 8, cat: 'Reaktioner', a: '(ny)', d: 'Upplyst (☀️ intill ett mönster) triggar mönstrets runor 2 extra gånger i stället för 1.',
    rules: { rtSol: 2 } });
  def({ id: 'tidvattnet', n: 'Tidvattnet', i: '🌊', r: 'U', c: 6, cat: 'Reaktioner', a: '(ny)', d: 'Månbelyst (🌙 intill ett mönster) ger $3 i stället för $1.',
    rules: { rsMane: 3 } });
  def({ id: 'offerkniven', n: 'Offerkniven', i: '🗡️', r: 'U', c: 6, cat: 'Reaktioner', a: '(ny)', d: 'Förbannad (💀 intill ett mönster) ger ×3 Mult i stället för ×2.',
    rules: { rxDod: 3 } });
  def({ id: 'alkemisten', n: 'Alkemisten', i: '⚗️', r: 'R', c: 9, cat: 'Reaktioner', a: '(ny)', d: 'Alla reaktioner triggas två gånger.',
    rules: { reactTwice: true } });
  def({ id: 'reaktorn', n: 'Reaktorn', i: '☢️', r: 'U', c: 7, cat: 'Reaktioner', a: '(ny, skalande)', d: 'Får +1 Mult permanent för varje reaktion som triggas.',
    init: function (st) { st.v = 0; }, info: function (st) { return '+' + st.v + ' Mult'; },
    before: function (ctx, st) { if (ctx.reactN) { st.v += ctx.reactN; ctx.note(st, '+' + ctx.reactN); } },
    cast: function (ctx, st) { return st.v ? { mult: st.v } : null; } });
  def({ id: 'ledaren', n: 'Ledaren', i: '🧲', r: 'C', c: 5, cat: 'Reaktioner', a: '(ny)', d: 'Katalysatorer räknas även när de ligger diagonalt intill ett mönster.',
    rules: { diagCat: true } });
  def({ id: 'katalysatorn', n: 'Katalysatorn', i: '🧪', r: 'U', c: 6, cat: 'Reaktioner', a: '(ny)', d: '+15 Chips och +3 Mult för varje reaktion i kastet.',
    cast: function (ctx) { return ctx.reactN ? { chips: 15 * ctx.reactN, mult: 3 * ctx.reactN } : null; } });

  // ===== Position ==============================================================
  def({ id: 'hornstenen', n: 'Hörnstenen', i: '📐', r: 'C', c: 5, cat: 'Position', a: '(ny)', d: 'Poängsatta runor i hörnen ger +8 Mult.',
    rune: function (ctx, st, rn, i) { return R.isCorner(i) ? { mult: 8 } : null; } });
  def({ id: 'hjartstenen', n: 'Hjärtstenen', i: '❤️‍🔥', r: 'U', c: 6, cat: 'Position', a: '(ny)', d: 'En poängsatt runa i mittenrutan ger ×2 Mult.',
    rune: function (ctx, st, rn, i) { return i === R.CENTER ? { xmult: 2 } : null; } });
  def({ id: 'kantvakten', n: 'Kantvakten', i: '🛡️', r: 'C', c: 4, cat: 'Position', a: '(ny)', d: 'Poängsatta runor på ytterkanten ger +15 Chips.',
    rune: function (ctx, st, rn, i) { return R.isEdge(i) ? { chips: 15 } : null; } });
  def({ id: 'karnan', n: 'Kärnan', i: '🎯', r: 'C', c: 4, cat: 'Position', a: '(ny)', d: 'Poängsatta runor i den inre 3×3-rutan ger +2 Mult.',
    rune: function (ctx, st, rn, i) { return R.isCore(i) ? { mult: 2 } : null; } });
  def({ id: 'horisonten', n: 'Horisonten', i: '🌄', r: 'C', c: 4, cat: 'Position', a: '(ny)', d: 'Vågräta linjemönster ger +10 Mult.',
    pattern: function (ctx, st, p) { return p.dir === 'h' ? { mult: 10 } : null; } });
  def({ id: 'lodet', n: 'Lodet', i: '⚓', r: 'C', c: 4, cat: 'Position', a: '(ny)', d: 'Lodräta linjemönster ger +10 Mult.',
    pattern: function (ctx, st, p) { return p.dir === 'v' ? { mult: 10 } : null; } });
  def({ id: 'himlavalvet', n: 'Himlavalvet', i: '🌌', r: 'C', c: 4, cat: 'Position', a: '(ny)', d: 'Poängsatta runor i översta raden ger +5 Mult.',
    rune: function (ctx, st, rn, i) { return rowOf(i) === 0 ? { mult: 5 } : null; } });
  def({ id: 'kompassen', n: 'Kompassen', i: '🧭', r: 'U', c: 6, cat: 'Position', a: '(ny)', d: '×3 Mult om alla fyra hörnen är fyllda när du kastar.',
    cast: function (ctx) { return R.CORNERS.every(function (i) { return ctx.board[i]; }) ? { xmult: 3 } : null; } });
  def({ id: 'eremiten', n: 'Eremiten', i: '🏝️', r: 'U', c: 6, cat: 'Position', a: '(ny)', d: '+6 Mult för varje runa på brädet som inte har någon granne.',
    cast: function (ctx) {
      var n = 0;
      for (var i = 0; i < 25; i++) if (ctx.board[i] && !R.orth(i).some(function (j) { return ctx.board[j]; })) n++;
      return n ? { mult: 6 * n } : null;
    } });
  def({ id: 'tomrummet', n: 'Tomrummet', i: '🕳️', r: 'C', c: 5, cat: 'Position', a: '(ny)', d: '+2 Mult för varje tom ruta på brädet när du kastar.',
    cast: function (ctx) { var n = 0; for (var i = 0; i < 25; i++) if (!ctx.board[i]) n++; return n ? { mult: 2 * n } : null; } });

  // ===== Brädet (runor som ligger kvar) =======================================
  def({ id: 'stenhjartat', n: 'Stenhjärtat', i: '🫀', r: 'C', c: 5, cat: 'Brädet', a: 'Raised Fist (förenklad)', d: '+2 Mult för varje runa som ligger kvar på brädet utan att poängsättas.',
    held: function () { return { mult: 2 }; } });
  def({ id: 'murbruket', n: 'Murbruket', i: '🪣', r: 'C', c: 4, cat: 'Brädet', a: '(ny)', d: '+10 Chips för varje runa som ligger kvar på brädet utan att poängsättas.',
    held: function () { return { chips: 10 }; } });
  def({ id: 'skuggspelaren', n: 'Skuggspelaren', i: '🤡', r: 'U', c: 5, cat: 'Brädet', a: 'Mime', d: 'Kvarliggande runors effekter triggas en extra gång.',
    heldRetrig: function () { return 1; } });
  def({ id: 'baronen', n: 'Baronen', i: '🎩', r: 'R', c: 8, cat: 'Brädet', a: 'Baron', d: 'Varje 💀 som ligger kvar på brädet ger ×1.5 Mult.',
    held: function (ctx, st, rn, i) { return ctx.is(i, R.DOD) ? { xmult: 1.5 } : null; } });

  // ===== Skalning ==============================================================
  function scal(o) { o.init = o.init || function (st) { st.v = o.v0 || 0; }; L.push(o); }
  scal({ id: 'vandraren', n: 'Vandraren', i: '🚶', r: 'C', c: 5, cat: 'Skalning', a: 'Ride the Bus', d: '+1 Mult för varje kast i följd utan Trio. Nollställs av en Trio.',
    info: function (st) { return '+' + st.v + ' Mult'; },
    before: function (ctx, st) { if (ctx.hasType('trio')) { st.v = 0; ctx.note(st, 'Nollställd'); } else st.v++; },
    cast: function (ctx, st) { return st.v ? { mult: st.v } : null; } });
  scal({ id: 'grodan', n: 'Grodan', i: '🐸', r: 'C', c: 4, cat: 'Skalning', a: 'Green Joker', d: '+1 Mult per kast, −1 Mult per byte.',
    info: function (st) { return '+' + st.v + ' Mult'; },
    before: function (ctx, st) { st.v++; },
    discard: function (G, st) { st.v = Math.max(0, st.v - 1); },
    cast: function (ctx, st) { return st.v ? { mult: st.v } : null; } });
  scal({ id: 'loparen', n: 'Löparen', i: '🏃', r: 'C', c: 5, cat: 'Skalning', a: 'Runner', d: 'Får +15 Chips permanent när kastet innehåller en Kvartett.',
    info: function (st) { return '+' + st.v + ' Chips'; },
    before: function (ctx, st) { if (ctx.hasType('kvartett')) { st.v += 15; ctx.note(st, 'Uppgraderad!'); } },
    cast: function (ctx, st) { return st.v ? { chips: st.v } : null; } });
  scal({ id: 'glassen', n: 'Glassen', i: '🍦', r: 'C', c: 5, cat: 'Skalning', a: 'Ice Cream', d: '+100 Chips. −5 Chips för varje kast.', v0: 100,
    info: function (st) { return '+' + st.v + ' Chips'; },
    cast: function (ctx, st) { return { chips: st.v }; },
    after: function (ctx, st, inst) { st.v -= 5; if (st.v <= 0) ctx.G.destroyRelic(inst, 'Uppäten!'); } });
  scal({ id: 'rostad_mandel', n: 'Rostad mandel', i: '🥜', r: 'C', c: 5, cat: 'Skalning', a: 'Popcorn', d: '+20 Mult. −4 Mult efter varje klarad prövning.', v0: 20,
    info: function (st) { return '+' + st.v + ' Mult'; },
    cast: function (ctx, st) { return { mult: st.v }; },
    roundEnd: function (G, st, inst) { st.v -= 4; if (st.v <= 0) G.destroyRelic(inst, 'Uppäten!'); } });
  scal({ id: 'astrologen', n: 'Astrologen', i: '🔭', r: 'U', c: 6, cat: 'Skalning', a: 'Constellation', d: 'Får ×0.1 Mult för varje Stjärnbild du använder.', v0: 1,
    info: function (st) { return '×' + R.fmtX(st.v); },
    useCons: function (G, st, c) { if (c.kind === 'star') st.v += 0.1; },
    cast: function (ctx, st) { return st.v > 1 ? { xmult: st.v } : null; } });
  scal({ id: 'hologrammet', n: 'Hologrammet', i: '📀', r: 'U', c: 7, cat: 'Skalning', a: 'Hologram', d: 'Får ×0.25 Mult för varje runa som läggs till i påsen.', v0: 1,
    info: function (st) { return '×' + R.fmtX(st.v); },
    added: function (G, st, runes) { st.v += 0.25 * runes.length; },
    cast: function (ctx, st) { return st.v > 1 ? { xmult: st.v } : null; } });
  scal({ id: 'vampyren', n: 'Vampyren', i: '🧛', r: 'U', c: 7, cat: 'Skalning', a: 'Vampire', d: 'Får ×0.1 Mult för varje förtrollad runa som poängsätts, och suger ut förtrollningen.', v0: 1,
    info: function (st) { return '×' + R.fmtX(st.v); },
    before: function (ctx, st) {
      var n = 0;
      ctx.scoringIdx.forEach(function (i) { var rn = ctx.board[i].rune; if (rn.enh && rn.enh !== 'sten') { rn.enh = null; n++; } });
      if (n) { st.v += 0.1 * n; ctx.note(st, '+×' + R.fmtX(0.1 * n)); }
    },
    cast: function (ctx, st) { return st.v > 1 ? { xmult: st.v } : null; } });
  scal({ id: 'lagerelden', n: 'Lägerelden', i: '🏕️', r: 'R', c: 9, cat: 'Skalning', a: 'Campfire', d: 'Får ×0.25 Mult för varje sak du säljer. Nollställs när en Väktare besegras.', v0: 1,
    info: function (st) { return '×' + R.fmtX(st.v); },
    sellAny: function (G, st) { st.v += 0.25; },
    roundEnd: function (G, st) { if (G.blind && G.blind.kind === 'boss') st.v = 1; },
    cast: function (ctx, st) { return st.v > 1 ? { xmult: st.v } : null; } });
  scal({ id: 'lyckokatten', n: 'Lyckokatten', i: '🐱', r: 'U', c: 6, cat: 'Skalning', a: 'Lucky Cat', d: 'Får ×0.25 Mult varje gång en Lycka-runa slår in.', v0: 1,
    info: function (st) { return '×' + R.fmtX(st.v); },
    lucky: function (G, st) { st.v += 0.25; },
    cast: function (ctx, st) { return st.v > 1 ? { xmult: st.v } : null; } });
  scal({ id: 'glasogat', n: 'Glasögat', i: '🔍', r: 'U', c: 6, cat: 'Skalning', a: 'Glass Joker', d: 'Får ×0.75 Mult för varje Glas-runa som krossas.', v0: 1,
    info: function (st) { return '×' + R.fmtX(st.v); },
    destroyed: function (G, st, runes, why) { if (why === 'glas') st.v += 0.75 * runes.length; },
    cast: function (ctx, st) { return st.v > 1 ? { xmult: st.v } : null; } });
  scal({ id: 'tillbakablicken', n: 'Tillbakablicken', i: '⏪', r: 'U', c: 6, cat: 'Skalning', a: 'Throwback', d: '×0.25 Mult för varje prövning du hoppat över.',
    info: function (st, G) { return '×' + R.fmtX(1 + 0.25 * (G ? G.stats.skipped : 0)); },
    cast: function (ctx) { var s = ctx.G.stats.skipped; return s ? { xmult: 1 + 0.25 * s } : null; } });
  scal({ id: 'offerdolken', n: 'Offerdolken', i: '🔪', r: 'U', c: 6, cat: 'Skalning', a: 'Ceremonial Dagger', d: 'När en prövning väljs: förstör reliken till höger och få dubbla dess säljvärde som Mult permanent.',
    info: function (st) { return '+' + st.v + ' Mult'; },
    blindSelect: function (G, st, inst) {
      var k = G.relics.indexOf(inst), right = G.relics[k + 1];
      if (right) { st.v += 2 * G.sellValue(right); G.destroyRelic(right, 'Offrad!'); }
    },
    cast: function (ctx, st) { return st.v ? { mult: st.v } : null; } });
  scal({ id: 'blixtkortet', n: 'Blixtkortet', i: '📸', r: 'U', c: 6, cat: 'Skalning', a: 'Flash Card', d: 'Får +2 Mult permanent för varje reroll i butiken.',
    info: function (st) { return '+' + st.v + ' Mult'; },
    reroll: function (G, st) { st.v += 2; },
    cast: function (ctx, st) { return st.v ? { mult: st.v } : null; } });
  scal({ id: 'reservfickan', n: 'Reservfickan', i: '👖', r: 'U', c: 6, cat: 'Skalning', a: 'Spare Trousers', d: 'Får +2 Mult permanent när kastet innehåller en Kvadrat.',
    info: function (st) { return '+' + st.v + ' Mult'; },
    before: function (ctx, st) { if (ctx.hasType('kvadrat')) { st.v += 2; ctx.note(st, 'Uppgraderad!'); } },
    cast: function (ctx, st) { return st.v ? { mult: st.v } : null; } });
  scal({ id: 'spakvinnan', n: 'Spåkvinnan', i: '🧙', r: 'C', c: 6, cat: 'Skalning', a: 'Fortune Teller', d: '+1 Mult för varje Ristning du använt den här omgången.',
    info: function (st, G) { return '+' + (G ? G.stats.rist : 0) + ' Mult'; },
    cast: function (ctx) { return ctx.G.stats.rist ? { mult: ctx.G.stats.rist } : null; } });
  scal({ id: 'falskspelaren', n: 'Falskspelaren', i: '🃏', r: 'U', c: 6, cat: 'Skalning', a: 'Card Sharp', d: '×3 Mult om kastets första mönster redan spelats den här prövningen.',
    cast: function (ctx) { var p = ctx.real[0]; return p && ctx.G.blindPlayed[p.type] ? { xmult: 3 } : null; } });
  scal({ id: 'bubbelvattnet', n: 'Bubbelvattnet', i: '🥤', r: 'U', c: 6, cat: 'Skalning', a: 'Seltzer', d: 'Alla poängsatta runor triggas en extra gång under de kommande 10 kasten.', v0: 10,
    info: function (st) { return st.v + ' kast kvar'; },
    retrig: function () { return 1; },
    after: function (ctx, st, inst) { st.v--; if (st.v <= 0) ctx.G.destroyRelic(inst, 'Slut!'); } });
  scal({ id: 'bananen', n: 'Bananen', i: '🍌', r: 'C', c: 5, cat: 'Skalning', a: 'Gros Michel', d: '+15 Mult. 1 på 6 chans att förstöras efter varje prövning.',
    cast: function () { return { mult: 15 }; },
    roundEnd: function (G, st, inst) { if (G.chance(6)) G.destroyRelic(inst, 'Ruttnade!'); } });
  scal({ id: 'tomhetsstenen', n: 'Tomhetsstenen', i: '🌑', r: 'R', c: 8, cat: 'Skalning', a: '(ny – Void Stone)', d: 'Får +1 Mult permanent för varje runa som förstörs eller förbrukas i ett mönster.',
    info: function (st) { return '+' + st.v + ' Mult'; },
    after: function (ctx, st) { st.v += ctx.consumedN; },
    destroyed: function (G, st, runes, why) { if (why !== 'cast') st.v += runes.length; },
    cast: function (ctx, st) { return st.v ? { mult: st.v } : null; } });
  scal({ id: 'vandringsstaven', n: 'Vandringsstaven', i: '🦯', r: 'U', c: 5, cat: 'Skalning', a: 'Hiker', d: 'Varje poängsatt runa får +5 Chips permanent.',
    rune: function (ctx, st, rn) { rn.perm = (rn.perm || 0) + 5; return { msg: 'Uppgraderad!' }; } });
  scal({ id: 'marmorbrottet', n: 'Marmorbrottet', i: '⛏️', r: 'U', c: 6, cat: 'Skalning', a: 'Marble Joker', d: 'När en prövning väljs: lägg en Sten-runa i påsen.',
    blindSelect: function (G) { G.addRunes([R.newRune(null, { enh: 'sten' })], false); } });

  // ===== Ekonomi ===============================================================
  def({ id: 'guldbaggen', n: 'Guldbaggen', i: '🪲', r: 'C', c: 6, cat: 'Ekonomi', a: 'Golden Joker', d: 'Ger $4 när prövningen klaras.',
    cashout: function () { return 4; } });
  def({ id: 'agget', n: 'Ägget', i: '🥚', r: 'C', c: 4, cat: 'Ekonomi', a: 'Egg', d: 'Säljvärdet ökar med $3 efter varje prövning.',
    roundEnd: function (G, st, inst) { inst.sv = (inst.sv || 0) + 3; } });
  def({ id: 'raketen', n: 'Raketen', i: '🚀', r: 'U', c: 6, cat: 'Ekonomi', a: 'Rocket', d: 'Ger $1 när prövningen klaras. Utbetalningen ökar med $2 när en Väktare besegras.',
    init: function (st) { st.v = 1; }, info: function (st) { return '$' + st.v; },
    cashout: function (G, st) { return st.v; },
    roundEnd: function (G, st) { if (G.blind && G.blind.kind === 'boss') st.v += 2; } });
  def({ id: 'till_manen', n: 'Till månen', i: '🌕', r: 'U', c: 5, cat: 'Ekonomi', a: 'To the Moon', d: '$1 extra ränta för varje $5 du har när prövningen klaras.',
    mods: function () { return { interest: 1 }; } });
  def({ id: 'moln_nio', n: 'Moln nio', i: '☁️', r: 'U', c: 7, cat: 'Ekonomi', a: 'Cloud 9', d: 'Ger $1 för varje 💎 i påsen när prövningen klaras.',
    cashout: function (G) { return G.bag.filter(function (r) { return r.sym === R.KRISTALL && r.enh !== 'sten'; }).length; } });
  def({ id: 'fordrojd', n: 'Fördröjd belöning', i: '⏳', r: 'C', c: 4, cat: 'Ekonomi', a: 'Delayed Gratification', d: 'Ger $2 per kvarvarande byte om du inte bytt något under prövningen.',
    cashout: function (G) { return G.blindDiscards === 0 ? 2 * G.discards : 0; } });
  def({ id: 'ansiktslos', n: 'Den ansiktslöse', i: '😶', r: 'C', c: 4, cat: 'Ekonomi', a: 'Faceless Joker', d: 'Ger $5 om du byter bort minst 3 ☀️ samtidigt.',
    discard: function (G, st, runes) { if (runes.filter(function (r) { return r.sym === R.SOL || r.enh === 'vild'; }).length >= 3) G.gain(5, 'Den ansiktslöse'); } });
  def({ id: 'presentkortet', n: 'Presentkortet', i: '🎁', r: 'U', c: 6, cat: 'Ekonomi', a: 'Gift Card', d: 'Efter varje prövning: +$1 säljvärde på alla reliker och förbrukningskort.',
    roundEnd: function (G) { G.relics.forEach(function (r) { r.sv = (r.sv || 0) + 1; }); G.cons.forEach(function (c) { c.sv = (c.sv || 0) + 1; }); } });
  def({ id: 'midasmasken', n: 'Midasmasken', i: '🤑', r: 'U', c: 7, cat: 'Ekonomi', a: 'Midas Mask', d: 'Alla poängsatta ☀️ blir Guld-runor.',
    before: function (ctx) { ctx.scoringIdx.forEach(function (i) { var rn = ctx.board[i].rune; if (ctx.eff[i] === R.SOL && rn.enh !== 'sten') rn.enh = 'guld'; }); } });
  def({ id: 'gyllene_biljetten', n: 'Gyllene biljetten', i: '🎟️', r: 'C', c: 5, cat: 'Ekonomi', a: 'Golden Ticket', d: 'Poängsatta Guld-runor ger $4.',
    rune: function (ctx, st, rn) { return rn.enh === 'guld' ? { money: 4 } : null; } });
  def({ id: 'att_gora', n: 'Att göra-listan', i: '📝', r: 'C', c: 4, cat: 'Ekonomi', a: 'To Do List', d: 'Ger $4 om kastet innehåller [mönster]. Byts efter varje prövning.',
    init: function (st, G) { st.t = G ? G.pick(R.PATTERN_IDS.slice(0, 6)) : 'trio'; },
    info: function (st) { return R.PATTERNS[st.t].name; },
    cast: function (ctx, st) { return ctx.hasType(st.t) ? { money: 4 } : null; },
    roundEnd: function (G, st) { st.t = G.pick(R.PATTERN_IDS.slice(0, 6)); } });

  // ===== Omtriggning ===========================================================
  def({ id: 'hacket', n: 'Hackan', i: '🪓', r: 'U', c: 6, cat: 'Omtriggning', a: 'Hack', d: 'Poängsatta runor i hörnen triggas en extra gång.',
    retrig: function (ctx, st, rn, i) { return R.isCorner(i) ? 1 : 0; } });
  def({ id: 'skymningen', n: 'Skymningen', i: '🌆', r: 'U', c: 5, cat: 'Omtriggning', a: 'Dusk', d: 'Poängsatta runor triggas en extra gång på prövningens sista kast.',
    retrig: function (ctx) { return ctx.last ? 1 : 0; } });
  def({ id: 'maskerna', n: 'Maskerna', i: '🎭', r: 'U', c: 6, cat: 'Omtriggning', a: 'Sock and Buskin', d: 'Poängsatta ☀️ och 🌙 triggas en extra gång.',
    retrig: function (ctx, st, rn, i) { return ctx.is(i, R.SOL) || ctx.is(i, R.MANE) ? 1 : 0; } });
  def({ id: 'hangande_lappen', n: 'Hängande lappen', i: '📎', r: 'C', c: 4, cat: 'Omtriggning', a: 'Hanging Chad', d: 'Kastets första poängsatta runa triggas 2 extra gånger.',
    retrig: function (ctx, st, rn, i, p) { return p === ctx.pats[0] && i === ctx.pats[0].cells[0] ? 2 : 0; } });
  def({ id: 'ekokammaren', n: 'Ekokammaren', i: '🐚', r: 'R', c: 8, cat: 'Omtriggning', a: '(ny)', d: 'En poängsatt runa i mittenrutan triggas 3 extra gånger.',
    retrig: function (ctx, st, rn, i) { return i === R.CENTER ? 3 : 0; } });

  // ===== Regler ================================================================
  def({ id: 'forbannade_kronan', n: 'Förbannade kronan', i: '👑', r: 'R', c: 8, cat: 'Regler', a: '(ny – Cursed Crown)', d: 'Varje 💀 räknas som vilken symbol som helst.',
    rules: { crown: true } });
  def({ id: 'sollinsen', n: 'Sollinsen', i: '🔎', r: 'U', c: 6, cat: 'Regler', a: '(ny – Solar Lens)', d: '☀️ kopierar symbolen bredvid sig (vänster granne först, annars höger).',
    rules: { lens: true } });
  def({ id: 'bryggan', n: 'Bryggan', i: '🌉', r: 'U', c: 6, cat: 'Regler', a: 'Shortcut', d: 'Linjer får hoppa över en tom ruta (🔥 · 🔥 🔥 är en Trio).',
    rules: { bridge: true } });
  def({ id: 'smetade_paletten', n: 'Smetade paletten', i: '🖌️', r: 'U', c: 7, cat: 'Regler', a: 'Smeared Joker', d: '☀️, 🔥 och ⚡ räknas som samma symbol. 🌙, 💀 och 🌿 likaså.',
    rules: { smear: true } });
  def({ id: 'plasket', n: 'Plasket', i: '💦', r: 'C', c: 3, cat: 'Regler', a: 'Splash', d: 'Alla runor du placerar poängsätts, även de som inte ingår i ett mönster.',
    rules: { splash: true } });
  def({ id: 'langa_armen', n: 'Långa armen', i: '🦾', r: 'U', c: 6, cat: 'Regler', a: 'Four Fingers (omvänd)', d: 'Du får placera upp till 7 runor per kast i stället för 5.',
    mods: function () { return { place: 2 }; } });
  def({ id: 'jonglaren', n: 'Jonglören', i: '🤹', r: 'C', c: 4, cat: 'Regler', a: 'Juggler', d: '+1 handstorlek.',
    mods: function () { return { hand: 1 }; } });
  def({ id: 'fyllbulten', n: 'Fyllbulten', i: '🍺', r: 'C', c: 4, cat: 'Regler', a: 'Drunkard', d: '+1 byte per prövning.',
    mods: function () { return { discards: 1 }; } });
  def({ id: 'trubaduren', n: 'Trubaduren', i: '🎻', r: 'U', c: 6, cat: 'Regler', a: 'Troubadour', d: '+2 handstorlek, −1 kast per prövning.',
    mods: function () { return { hand: 2, casts: -1 }; } });
  def({ id: 'inbrottstjuven', n: 'Inbrottstjuven', i: '🦹', r: 'U', c: 6, cat: 'Regler', a: 'Burglar', d: '+3 kast per prövning, men du har inga byten.',
    mods: function () { return { casts: 3, noDiscards: 1 }; } });
  def({ id: 'lyckosolen', n: 'Lyckohjulet', i: '🎰', r: 'U', c: 4, cat: 'Regler', a: 'Oops! All 6s', d: 'Fördubblar alla sannolikheter (1 på 4 blir 2 på 4).',
    mods: function () { return { oops: 1 }; } });
  def({ id: 'gycklaren', n: 'Gycklaren', i: '🎪', r: 'U', c: 5, cat: 'Regler', a: 'Showman', d: 'Reliker och kort du redan har kan dyka upp igen.',
    rules: { showman: true } });
  def({ id: 'dubbelhelixen', n: 'Dubbelhelixen', i: '🧬', r: 'R', c: 8, cat: 'Regler', a: 'DNA', d: 'Om prövningens första kast är en enda placerad runa: lägg en kopia av den i påsen och i handen.',
    after: function (ctx) {
      if (ctx.first && ctx.placedN === 1) {
        var src = ctx.placedRunes[0];
        var cp = R.newRune(src.sym, { enh: src.enh, seal: src.seal, ed: src.ed, perm: src.perm });
        ctx.G.addRunes([cp], true);
      }
    } });
  def({ id: 'sigillbrevet', n: 'Sigillbrevet', i: '📨', r: 'U', c: 6, cat: 'Regler', a: 'Certificate', d: 'När en prövning väljs: lägg en slumpad runa med sigill i handen (och påsen).',
    blindSelect: function (G) { G.addRunes([R.newRune(Math.floor(G.rnd() * 7), { seal: G.pick(['rod', 'guld', 'bla', 'lila']) })], true); } });
  def({ id: 'kaosclownen', n: 'Kaosclownen', i: '🎈', r: 'C', c: 4, cat: 'Regler', a: 'Chaos the Clown', d: '1 gratis reroll i varje butik.',
    mods: function () { return { freeRerolls: 1 }; } });
  def({ id: 'astronomen', n: 'Astronomen', i: '🧑‍🚀', r: 'U', c: 8, cat: 'Regler', a: 'Astronomer', d: 'Stjärnbilder och Stjärnpaket i butiken är gratis.',
    rules: { astronomer: true } });
  def({ id: 'avtrycket', n: 'Avtrycket', i: '📘', r: 'R', c: 10, cat: 'Regler', a: 'Blueprint', d: 'Kopierar effekten av reliken till höger.', copy: 'right' });
  def({ id: 'tankestormen', n: 'Tankestormen', i: '🧠', r: 'R', c: 10, cat: 'Regler', a: 'Brainstorm', d: 'Kopierar effekten av reliken längst till vänster.', copy: 'left' });

  // ===== Skapande ==============================================================
  def({ id: 'spadomskulan', n: 'Spådomskulan', i: '🎱', r: 'C', c: 5, cat: 'Skapande', a: '8 Ball', d: 'Varje poängsatt 🌙 har 1 på 4 chans att skapa en Ristning.',
    rune: function (ctx, st, rn, i) { if (ctx.is(i, R.MANE) && ctx.G.chance(4) && ctx.G.addCons('rist')) return { msg: '+Ristning' }; return null; } });
  def({ id: 'superposition', n: 'Superpositionen', i: '🌀', r: 'C', c: 4, cat: 'Skapande', a: 'Superposition', d: 'Skapar en Ristning om kastet innehåller en Spegel.',
    cast: function (ctx) { if (ctx.hasType('spegel') && ctx.G.addCons('rist')) return { msg: '+Ristning' }; return null; } });
  def({ id: 'rymdfararen', n: 'Rymdfararen', i: '🛸', r: 'U', c: 6, cat: 'Skapande', a: 'Space Joker', d: '1 på 4 chans att höja nivån på kastets första mönster.',
    before: function (ctx, st) { var p = ctx.real[0]; if (p && ctx.G.chance(4)) { ctx.G.levelUp(p.type, 1); ctx.note(st, 'Nivå upp!'); } } });
  def({ id: 'spakortet', n: 'Spåkortet', i: '🪬', r: 'U', c: 6, cat: 'Skapande', a: 'Cartomancer', d: 'Skapar en Ristning när en prövning väljs.',
    blindSelect: function (G) { G.addCons('rist'); } });
  def({ id: 'seansen', n: 'Seansen', i: '🕯️', r: 'U', c: 6, cat: 'Skapande', a: 'Séance', d: 'Skapar ett Eko om kastet innehåller en Full linje.',
    cast: function (ctx) { if (ctx.hasType('linje') && ctx.G.addCons('eko')) return { msg: '+Eko' }; return null; } });
  def({ id: 'bronda_runan', n: 'Brända runan', i: '♨️', r: 'R', c: 8, cat: 'Skapande', a: 'Burnt Joker', d: 'Prövningens första byte höjer nivån på ditt mest spelade mönster.',
    discard: function (G) { if (G.blindDiscards === 1) G.levelUp(G.mostPlayed(), 1); } });
  def({ id: 'packet', n: 'Packet', i: '🐀', r: 'C', c: 6, cat: 'Skapande', a: 'Riff-Raff', d: 'När en prövning väljs: skapa 2 Vanliga reliker (om det finns plats).',
    blindSelect: function (G) { for (var k = 0; k < 2; k++) if (G.relics.length < G.relicSlots()) G.addRelic(G.makeRelic('C')); } });

  // ===== Legendariska ==========================================================
  scal({ id: 'askkungen', n: 'Askkungen', i: '🌋', r: 'L', c: 20, cat: 'Legendariska', a: 'Canio', d: 'Får ×1 Mult för varje runa som förstörs.', v0: 1,
    info: function (st) { return '×' + R.fmtX(st.v); },
    destroyed: function (G, st, runes, why) { if (why !== 'cast') st.v += runes.length; },
    cast: function (ctx, st) { return st.v > 1 ? { xmult: st.v } : null; } });
  def({ id: 'solkonungen', n: 'Solkonungen', i: '🌞', r: 'L', c: 20, cat: 'Legendariska', a: 'Triboulet', d: 'Varje poängsatt ☀️ och 🌙 ger ×2 Mult.',
    rune: function (ctx, st, rn, i) { return ctx.is(i, R.SOL) || ctx.is(i, R.MANE) ? { xmult: 2 } : null; } });
  scal({ id: 'gravvaktaren', n: 'Gravväktaren', i: '🪦', r: 'L', c: 20, cat: 'Legendariska', a: 'Yorick', d: 'Får ×1 Mult för var 23:e runa du byter bort.',
    init: function (st) { st.v = 1; st.left = 23; },
    info: function (st) { return '×' + st.v + ' (' + st.left + ' kvar)'; },
    discard: function (G, st, runes) { for (var k = 0; k < runes.length; k++) { st.left--; if (st.left <= 0) { st.v += 1; st.left = 23; } } },
    cast: function (ctx, st) { return st.v > 1 ? { xmult: st.v } : null; } });
  def({ id: 'vaktarbanan', n: 'Väktarbanan', i: '🐦‍⬛', r: 'L', c: 20, cat: 'Legendariska', a: 'Chicot', d: 'Inaktiverar alla Väktares förmågor.',
    rules: { noBoss: true } });
  def({ id: 'spegelvannen', n: 'Spegelvännen', i: '🪆', r: 'L', c: 20, cat: 'Legendariska', a: 'Perkeo', d: 'När du lämnar butiken: skapa en Negativ kopia av ett slumpat förbrukningskort du har.',
    shopLeave: function (G) { var own = G.cons.filter(function (c) { return true; }); if (own.length) { var c = G.pick(own); G.cons.push({ kind: c.kind, id: c.id, ed: 'neg', uid: R.uid() }); G.toast('Spegelvännen kopierade ' + G.consName(c)); } } });
  def({ id: 'ouroboros', n: 'Ouroboros', i: '🐍', r: 'L', c: 20, cat: 'Legendariska', a: '(ny)', d: 'Kedjebonusen blir ×2 Mult för varje mönster utöver det första.',
    rules: { chainX: 2 } });

  R.RELICS = L;
  R.RELIC = {};
  L.forEach(function (r) { R.RELIC[r.id] = r; });
  R.RELIC_CATS = ['Grund', 'Element', 'Mönster', 'Kedjor', 'Reaktioner', 'Position', 'Brädet', 'Skalning', 'Ekonomi', 'Omtriggning', 'Regler', 'Skapande', 'Legendariska'];
})();
