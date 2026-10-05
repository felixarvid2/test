// Rune – förbrukningskort, väktare, märken, paket och altarförbättringar.
(function () {
  'use strict';
  var R = (typeof window !== 'undefined' ? window : globalThis).R;

  // ---- Stjärnbilder (Balatros planetkort): höjer ett mönsters nivå ----------
  var STAR_NAMES = { trio: 'Orion', diagonal: 'Kassiopeia', kvadrat: 'Pegasus', kvartett: 'Draken', regnbage: 'Lyran', spegel: 'Tvillingarna', kors: 'Södra korset', linje: 'Skytten', ring: 'Norra kronan', monolit: 'Stora björnen' };
  R.STARS = R.PATTERN_IDS.map(function (t) {
    var p = R.PATTERNS[t];
    return { kind: 'star', id: t, n: STAR_NAMES[t], i: '✦', d: 'Höjer ' + p.name + ' en nivå: +' + p.lc + ' Chips och +' + p.lm + ' Mult.', need: 0,
      use: function (G) { G.levelUp(t, 1); } };
  });

  // ---- Ristningar (Balatros tarotkort): den äldre futharken, 24 runor -------
  function convert(sym) {
    return function (G, sel) { sel.forEach(function (r) { r.sym = sym; if (r.enh === 'sten') r.enh = null; }); };
  }
  function enhance(enh) { return function (G, sel) { sel.forEach(function (r) { r.enh = enh; }); }; }
  R.RISTS = [
    { id: 'fehu', n: 'Fehu', i: 'ᚠ', d: 'Fördubblar dina mynt (högst +$20).', need: 0,
      use: function (G) { G.gain(R.clamp(G.money, 0, 20), 'Fehu'); } },
    { id: 'uruz', n: 'Uruz', i: 'ᚢ', d: 'Upp till 2 valda runor blir Mult-runor.', need: 2, use: enhance('mult') },
    { id: 'thurisaz', n: 'Thurisaz', i: 'ᚦ', d: 'Upp till 3 valda runor blir ⚡.', need: 3, use: convert(R.BLIXT) },
    { id: 'ansuz', n: 'Ansuz', i: 'ᚨ', d: 'Skapar en kopia av den senast använda Ristningen eller Stjärnbilden (inte Ansuz).', need: 0,
      can: function (G) { return !!G.lastCons && G.cons.length <= G.consSlots(); },
      use: function (G) { G.addCons(G.lastCons.kind, G.lastCons.id); } },
    { id: 'raidho', n: 'Raidho', i: 'ᚱ', d: 'Välj 2 runor: den vänstra blir en kopia av den högra.', need: 2, min: 2,
      use: function (G, sel) { var a = sel[0], b = sel[1]; a.sym = b.sym; a.enh = b.enh; a.seal = b.seal; a.ed = b.ed; a.perm = b.perm; } },
    { id: 'kenaz', n: 'Kenaz', i: 'ᚲ', d: 'Upp till 3 valda runor blir 🔥.', need: 3, use: convert(R.ELD) },
    { id: 'gebo', n: 'Gebo', i: 'ᚷ', d: 'Upp till 2 valda runor blir Bonus-runor.', need: 2, use: enhance('bonus') },
    { id: 'wunjo', n: 'Wunjo', i: 'ᚹ', d: 'Upp till 2 valda runor blir Lycka-runor.', need: 2, use: enhance('lycka') },
    { id: 'hagalaz', n: 'Hagalaz', i: 'ᚺ', d: '1 vald runa blir en Glas-runa.', need: 1, use: enhance('glas') },
    { id: 'nauthiz', n: 'Nauthiz', i: 'ᚾ', d: 'Förstör upp till 2 valda runor.', need: 2,
      use: function (G, sel) { G.destroyRunes(sel, 'rist'); } },
    { id: 'isa', n: 'Isa', i: 'ᛁ', d: 'Upp till 3 valda runor blir 💎.', need: 3, use: convert(R.KRISTALL) },
    { id: 'jera', n: 'Jera', i: 'ᛃ', d: 'Skapar upp till 2 Stjärnbilder.', need: 0,
      use: function (G) { G.addCons('star'); G.addCons('star'); } },
    { id: 'eihwaz', n: 'Eihwaz', i: 'ᛇ', d: 'Upp till 3 valda runor blir 💀.', need: 3, use: convert(R.DOD) },
    { id: 'perthro', n: 'Perthro', i: 'ᛈ', d: '1 på 4 chans att ge en slumpad relik Folie, Holografisk eller Polykrom.', need: 0,
      can: function (G) { return G.relics.some(function (r) { return !r.ed; }); },
      use: function (G) {
        if (!G.chance(4)) { G.toast('Perthro: inget hände'); return; }
        var r = G.pick(G.relics.filter(function (x) { return !x.ed; }));
        var u = G.rnd(); r.ed = u < 0.5 ? 'folie' : u < 0.85 ? 'holo' : 'poly';
        G.toast(R.RELIC[r.id].n + ' blev ' + R.EDITIONS[r.ed].name);
      } },
    { id: 'algiz', n: 'Algiz', i: 'ᛉ', d: '1 vald runa blir en Stål-runa.', need: 1, use: enhance('stal') },
    { id: 'sowilo', n: 'Sowilo', i: 'ᛊ', d: 'Upp till 3 valda runor blir ☀️.', need: 3, use: convert(R.SOL) },
    { id: 'tiwaz', n: 'Tiwaz', i: 'ᛏ', d: 'Ger lika många $ som säljvärdet av alla dina reliker (högst $50).', need: 0,
      use: function (G) { var s = 0; G.relics.forEach(function (r) { s += G.sellValue(r); }); G.gain(Math.min(50, s), 'Tiwaz'); } },
    { id: 'berkano', n: 'Berkano', i: 'ᛒ', d: 'Upp till 3 valda runor blir 🌿.', need: 3, use: convert(R.NATUR) },
    { id: 'ehwaz', n: 'Ehwaz', i: 'ᛖ', d: '1 vald runa blir en Vild runa.', need: 1, use: enhance('vild') },
    { id: 'mannaz', n: 'Mannaz', i: 'ᛗ', d: 'Skapar en slumpad relik (kräver plats).', need: 0,
      can: function (G) { return G.relics.length < G.relicSlots(); },
      use: function (G) { G.addRelic(G.makeRelic()); } },
    { id: 'laguz', n: 'Laguz', i: 'ᛚ', d: 'Upp till 3 valda runor blir 🌙.', need: 3, use: convert(R.MANE) },
    { id: 'ingwaz', n: 'Ingwaz', i: 'ᛜ', d: '1 vald runa blir en Guld-runa.', need: 1, use: enhance('guld') },
    { id: 'dagaz', n: 'Dagaz', i: 'ᛞ', d: 'Skapar upp till 2 Ristningar.', need: 0,
      use: function (G) { G.addCons('rist', null, 'dagaz'); G.addCons('rist', null, 'dagaz'); } },
    { id: 'othala', n: 'Othala', i: 'ᛟ', d: '1 vald runa blir en Sten-runa.', need: 1, use: enhance('sten') }
  ];
  R.RISTS.forEach(function (c) { c.kind = 'rist'; });

  // ---- Ekon (Balatros spektralkort) ---------------------------------------
  R.EKOS = [
    { id: 'sjalen', n: 'Själen', i: '🕊️', d: 'Skapar en Legendarisk relik (kräver plats).', need: 0,
      can: function (G) { return G.relics.length < G.relicSlots(); },
      use: function (G) { G.addRelic(G.makeRelic('L')); } },
    { id: 'svarta_halet', n: 'Svarta hålet', i: '⚫', d: 'Höjer alla mönster en nivå.', need: 0,
      use: function (G) { R.PATTERN_IDS.forEach(function (t) { G.levelUp(t, 1, true); }); G.toast('Alla mönster +1 nivå'); } },
    { id: 'ektoplasman', n: 'Ektoplasman', i: '🫧', d: 'Ger en slumpad relik Negativ (+1 relikfack). −1 handstorlek.', need: 0,
      can: function (G) { return G.relics.some(function (r) { return !r.ed; }); },
      use: function (G) { var r = G.pick(G.relics.filter(function (x) { return !x.ed; })); r.ed = 'neg'; G.handPenalty++; } },
    { id: 'ankh', n: 'Ankh', i: '☥', d: 'Skapar en kopia av en slumpad relik. Alla andra reliker förstörs.', need: 0,
      can: function (G) { return G.relics.length > 0; },
      use: function (G) {
        var keep = G.pick(G.relics);
        G.relics.slice().forEach(function (r) { if (r !== keep) G.destroyRelic(r); });
        var cp = G.makeRelic(null, keep.id); cp.st = JSON.parse(JSON.stringify(keep.st)); if (keep.ed !== 'neg') cp.ed = keep.ed;
        G.relics.push(cp);
      } },
    { id: 'hexet', n: 'Hexet', i: '🔯', d: 'Ger en slumpad relik Polykrom. Alla andra reliker förstörs.', need: 0,
      can: function (G) { return G.relics.some(function (r) { return !r.ed; }); },
      use: function (G) {
        var keep = G.pick(G.relics.filter(function (x) { return !x.ed; }));
        keep.ed = 'poly';
        G.relics.slice().forEach(function (r) { if (r !== keep) G.destroyRelic(r); });
      } },
    { id: 'auran', n: 'Auran', i: '🌟', d: 'Ger 1 vald runa Folie, Holografisk eller Polykrom.', need: 1, min: 1,
      use: function (G, sel) { var u = G.rnd(); sel[0].ed = u < 0.5 ? 'folie' : u < 0.85 ? 'holo' : 'poly'; } },
    { id: 'kryptiden', n: 'Kryptiden', i: '🦕', d: 'Skapar 2 kopior av 1 vald runa i handen.', need: 1, min: 1,
      use: function (G, sel) { var s = sel[0]; G.addRunes([0, 1].map(function () { return R.newRune(s.sym, { enh: s.enh, seal: s.seal, ed: s.ed, perm: s.perm }); }), true); } },
    { id: 'sigillet', n: 'Sigillet', i: '🔣', d: 'Alla runor i handen blir samma slumpade symbol.', need: 0,
      can: function (G) { return G.hand.length > 0; },
      use: function (G) { var s = Math.floor(G.rnd() * 7); G.hand.forEach(function (r) { r.sym = s; if (r.enh === 'sten') r.enh = null; }); } },
    { id: 'transen', n: 'Transen', i: '🔵', d: '1 vald runa får ett Blått sigill.', need: 1, min: 1, use: function (G, sel) { sel[0].seal = 'bla'; } },
    { id: 'mediet', n: 'Mediet', i: '🟣', d: '1 vald runa får ett Lila sigill.', need: 1, min: 1, use: function (G, sel) { sel[0].seal = 'lila'; } },
    { id: 'dejavu', n: 'Déjà vu', i: '🔴', d: '1 vald runa får ett Rött sigill.', need: 1, min: 1, use: function (G, sel) { sel[0].seal = 'rod'; } },
    { id: 'talismanen', n: 'Talismanen', i: '🟡', d: '1 vald runa får ett Guldsigill.', need: 1, min: 1, use: function (G, sel) { sel[0].seal = 'guld'; } },
    { id: 'inkantationen', n: 'Inkantationen', i: '✴️', d: 'Förstör 1 slumpad runa i handen och lägger 3 slumpade förtrollade runor i handen.', need: 0,
      can: function (G) { return G.hand.length > 0; },
      use: function (G) {
        G.destroyRunes([G.pick(G.hand)], 'rist');
        var en = ['bonus', 'mult', 'vild', 'glas', 'stal', 'guld', 'lycka'];
        G.addRunes([0, 1, 2].map(function () { return R.newRune(Math.floor(G.rnd() * 7), { enh: G.pick(en) }); }), true);
      } }
  ];
  R.EKOS.forEach(function (c) { c.kind = 'eko'; });

  R.CONS = { star: {}, rist: {}, eko: {} };
  R.STARS.forEach(function (c) { R.CONS.star[c.id] = c; });
  R.RISTS.forEach(function (c) { R.CONS.rist[c.id] = c; });
  R.EKOS.forEach(function (c) { R.CONS.eko[c.id] = c; });
  R.consDef = function (c) { return R.CONS[c.kind][c.id]; };
  R.CONS_KIND = { star: 'Stjärnbild', rist: 'Ristning', eko: 'Eko' };

  // ---- Väktare (Balatros boss blinds) -------------------------------------
  // setup(G) när prövningen startar, rules (detektion), weak(G, rn) försvagar runa,
  // check(G, placedN) -> felmeddelande, gate(G, ctx) -> filtrera poäng, after(G, ctx).
  R.BOSSES = [
    { id: 'muren', n: 'Muren', i: '🧱', d: 'Mittenrutan är blockerad.', min: 1,
      setup: function (G) { G.blocked = [R.CENTER]; } },
    { id: 'stenfaltet', n: 'Stenfältet', i: '🪨', d: '4 slumpade rutor är blockerade.', min: 2,
      setup: function (G) { var all = []; for (var i = 0; i < 25; i++) all.push(i); G.shuffle(all); G.blocked = all.slice(0, 4); } },
    { id: 'spegeln', n: 'Spegeln', i: '🪞', d: 'Diagonaler räknas inte.', min: 1, rules: { noDiag: true } },
    { id: 'forseglaren', n: 'Förseglaren', i: '🔒', d: 'Alla [symbol] är försvagade (ger inga chips eller effekter).', min: 1,
      setup: function (G) { G.bossSym = Math.floor(G.rnd() * 7); },
      weak: function (G, rn) { return rn.sym === G.bossSym && rn.enh !== 'vild'; } },
    { id: 'kedjan', n: 'Kedjan', i: '⛓️', d: 'Bara kastets första mönster räknas.', min: 2,
      gate: function (G, pats) { var real = pats.filter(function (p) { return p.type !== 'los'; }); return real.slice(0, 1).concat(pats.filter(function (p) { return p.type === 'los'; })); } },
    { id: 'psyket', n: 'Psyket', i: '🧠', d: 'Du måste placera exakt 5 runor per kast.', min: 1,
      check: function (G, n) { return n !== 5 && G.hand.length + n >= 5 ? 'Psyket kräver exakt 5 runor.' : null; } },
    { id: 'vattnet', n: 'Vattnet', i: '💧', d: 'Du börjar med 0 byten.', min: 2,
      setup: function (G) { G.discards = 0; } },
    { id: 'armen', n: 'Armen', i: '💪', d: 'Kastets första mönster sänks en nivå.', min: 2,
      after: function (G, ctx) { var p = ctx.real[0]; if (p && G.levels[p.type] > 1) { G.levels[p.type]--; G.toast(R.PATTERNS[p.type].name + ' sänktes en nivå'); } } },
    { id: 'nalen', n: 'Nålen', i: '🪡', d: 'Bara ett kast. Målet är lägre.', min: 2, mult: 1,
      setup: function (G) { G.casts = 1; } },
    { id: 'virveln', n: 'Virveln', i: '🌀', d: 'Brädet roteras 90° medurs efter varje kast.', min: 3,
      after: function (G) { G.rotateBoard(); } },
    { id: 'tornet', n: 'Tornet', i: '🗼', d: 'Runorna faller nedåt efter varje kast.', min: 1,
      after: function (G) { G.gravity(); } },
    { id: 'tanden', n: 'Tanden', i: '🦷', d: 'Du förlorar $1 för varje placerad runa.', min: 3,
      after: function (G, ctx) { G.gain(-ctx.placedN, 'Tanden'); } },
    { id: 'kroken', n: 'Kroken', i: '🪝', d: 'Efter varje kast byts 2 slumpade runor i handen bort.', min: 1,
      after: function (G) { G.hookDiscard(2); } },
    { id: 'ogat', n: 'Ögat', i: '👁️', d: 'Ingen mönstertyp får spelas två gånger under prövningen.', min: 3,
      gate: function (G, pats) { return pats.filter(function (p) { return p.type === 'los' || !G.blindPlayed[p.type]; }); } },
    { id: 'munnen', n: 'Munnen', i: '👄', d: 'Bara en mönstertyp får spelas under prövningen.', min: 2,
      gate: function (G, pats) {
        var t = G.bossType || (pats.filter(function (p) { return p.type !== 'los'; })[0] || {}).type;
        return pats.filter(function (p) { return p.type === 'los' || p.type === t; });
      },
      after: function (G, ctx) { if (!G.bossType && ctx.real[0]) G.bossType = ctx.real[0].type; } },
    { id: 'bergvaggen', n: 'Bergväggen', i: '⛰️', d: 'Extra stort mål.', min: 2, mult: 4 },
    { id: 'gloden', n: 'Glöden', i: '♨️', d: 'Runor som inte poängsätts bränns bort efter varje kast.', min: 2,
      after: function (G) { G.burnLeftovers(); } },
    { id: 'dimman', n: 'Dimman', i: '🌫️', d: 'Var tredje runa du drar är dold tills den placeras.', min: 2, rules: { fog: true } },
    // Slutväktare (cirkel 8, 16 …)
    { id: 'purpurkarlet', n: 'Purpurkärlet', i: '🏺', d: 'Gigantiskt mål.', fin: true, mult: 6 },
    { id: 'karmosinhjartat', n: 'Karmosinhjärtat', i: '❤️', d: 'En slumpad relik är inaktiv under varje kast.', fin: true,
      beforeCast: function (G) { G.relics.forEach(function (r) { r.off = false; }); if (G.relics.length) G.pick(G.relics).off = true; },
      cleanup: function (G) { G.relics.forEach(function (r) { r.off = false; }); } },
    { id: 'grona_bladet', n: 'Gröna bladet', i: '🍃', d: 'Alla runor är försvagade tills du säljer en relik.', fin: true,
      setup: function (G) { G.leafSold = false; },
      weak: function (G) { return !G.leafSold; } },
    { id: 'askstormen', n: 'Askstormen', i: '🌪️', d: '6 blockerade rutor. Brädet roteras efter varje kast.', fin: true,
      setup: function (G) { var all = []; for (var i = 0; i < 25; i++) all.push(i); G.shuffle(all); G.blocked = all.slice(0, 6); },
      after: function (G) { G.rotateBoard(); } }
  ];
  R.BOSS = {};
  R.BOSSES.forEach(function (b) { R.BOSS[b.id] = b; });

  // ---- Märken (fås när man hoppar över en prövning) -----------------------
  R.TAGS = [
    { id: 'pengar', n: 'Myntmärket', i: '💰', d: 'Få $8 direkt.', now: function (G) { G.gain(8, 'Myntmärket'); } },
    { id: 'relik', n: 'Relikmärket', i: '🎁', d: 'Nästa butik har en gratis Ovanlig relik.' },
    { id: 'stjarna', n: 'Stjärnmärket', i: '🌠', d: 'Nästa butik har ett gratis Stort Stjärnpaket.' },
    { id: 'ristning', n: 'Ristningsmärket', i: '🪄', d: 'Nästa butik har ett gratis Stort Ristningspaket.' },
    { id: 'rabatt', n: 'Rabattmärket', i: '🏷️', d: 'Allt i nästa butik kostar hälften.' },
    { id: 'eko', n: 'Ekomärket', i: '👻', d: 'Nästa butik har ett gratis Ekopaket.' },
    { id: 'runor', n: 'Runmärket', i: '🎴', d: 'Nästa butik har ett gratis Jättepaket med runor.' }
  ];
  R.TAG = {};
  R.TAGS.forEach(function (t) { R.TAG[t.id] = t; });

  // ---- Paket ---------------------------------------------------------------
  R.PACKS = [
    { id: 'run', n: 'Runpaket', i: '🎴', kind: 'rune', show: 3, pick: 1, cost: 4, w: 4, d: 'Välj 1 av 3 runor att lägga i påsen.' },
    { id: 'run_stor', n: 'Stort runpaket', i: '🎴', kind: 'rune', show: 5, pick: 1, cost: 6, w: 2, d: 'Välj 1 av 5 runor att lägga i påsen.' },
    { id: 'run_jatte', n: 'Jättepaket med runor', i: '🎴', kind: 'rune', show: 5, pick: 2, cost: 8, w: 0.5, d: 'Välj 2 av 5 runor att lägga i påsen.' },
    { id: 'rist', n: 'Ristningspaket', i: '🪄', kind: 'rist', show: 3, pick: 1, cost: 4, w: 4, d: 'Välj 1 av 3 Ristningar att använda direkt.' },
    { id: 'rist_stor', n: 'Stort ristningspaket', i: '🪄', kind: 'rist', show: 5, pick: 1, cost: 6, w: 2, d: 'Välj 1 av 5 Ristningar att använda direkt.' },
    { id: 'rist_jatte', n: 'Jättepaket med ristningar', i: '🪄', kind: 'rist', show: 5, pick: 2, cost: 8, w: 0.5, d: 'Välj 2 av 5 Ristningar att använda direkt.' },
    { id: 'star', n: 'Stjärnpaket', i: '🌠', kind: 'star', show: 3, pick: 1, cost: 4, w: 4, d: 'Välj 1 av 3 Stjärnbilder att använda direkt.' },
    { id: 'star_stor', n: 'Stort stjärnpaket', i: '🌠', kind: 'star', show: 5, pick: 1, cost: 6, w: 2, d: 'Välj 1 av 5 Stjärnbilder att använda direkt.' },
    { id: 'star_jatte', n: 'Jättepaket med stjärnbilder', i: '🌠', kind: 'star', show: 5, pick: 2, cost: 8, w: 0.5, d: 'Välj 2 av 5 Stjärnbilder att använda direkt.' },
    { id: 'relik', n: 'Relikpaket', i: '🏺', kind: 'relic', show: 2, pick: 1, cost: 4, w: 1.2, d: 'Välj 1 av 2 reliker.' },
    { id: 'relik_stor', n: 'Stort relikpaket', i: '🏺', kind: 'relic', show: 4, pick: 1, cost: 6, w: 0.6, d: 'Välj 1 av 4 reliker.' },
    { id: 'eko', n: 'Ekopaket', i: '👻', kind: 'eko', show: 2, pick: 1, cost: 4, w: 0.3, d: 'Välj 1 av 2 Ekon att använda direkt.' },
    { id: 'eko_stor', n: 'Stort ekopaket', i: '👻', kind: 'eko', show: 4, pick: 1, cost: 6, w: 0.15, d: 'Välj 1 av 4 Ekon att använda direkt.' }
  ];
  R.PACK = {};
  R.PACKS.forEach(function (p) { R.PACK[p.id] = p; });

  // ---- Altarförbättringar (Balatros vouchers) -----------------------------
  R.VOUCHERS = [
    { id: 'overflod', n: 'Överflöd', i: '🧺', d: '+1 fack för förbrukningskort.', mods: { cons: 1 } },
    { id: 'rensning', n: 'Rensningen', i: '🧹', d: '+1 byte per prövning.', mods: { discards: 1 } },
    { id: 'krigsrop', n: 'Krigsropet', i: '📯', d: '+1 kast per prövning.', mods: { casts: 1 } },
    { id: 'hamstraren', n: 'Hamstraren', i: '🐹', d: 'Räntetaket höjs från $5 till $10.', mods: { interestCap: 5 } },
    { id: 'rea', n: 'Rean', i: '🛍️', d: 'Allt i butiken kostar 25% mindre.', mods: { discount: 0.25 } },
    { id: 'lager', n: 'Fullt lager', i: '📦', d: '+1 kortplats i butiken.', mods: { shopSlots: 1 } },
    { id: 'omrullning', n: 'Omrullningen', i: '🔄', d: 'Reroll kostar $2 mindre.', mods: { rerollDiscount: 2 } },
    { id: 'teleskop', n: 'Teleskopet', i: '🔭', d: 'Stjärnpaket innehåller alltid Stjärnbilden för ditt mest spelade mönster.', mods: { telescope: 1 } },
    { id: 'ristarbod', n: 'Ristarboden', i: '🛖', d: 'Ristningar dyker upp dubbelt så ofta i butiken.', mods: { ristRate: 1 } },
    { id: 'stjarnbod', n: 'Stjärnboden', i: '🏪', d: 'Stjärnbilder dyker upp dubbelt så ofta i butiken.', mods: { starRate: 1 } },
    { id: 'slipning', n: 'Slipningen', i: '💫', d: 'Folie, Holografisk och Polykrom dyker upp dubbelt så ofta.', mods: { edRate: 1 } },
    { id: 'penseln', n: 'Penseln', i: '🖌️', d: '+1 handstorlek.', mods: { hand: 1 } },
    { id: 'antimateria', n: 'Antimateria', i: '⚛️', d: '+1 relikfack.', mods: { slots: 1 } }
  ];
  R.VOUCHER = {};
  R.VOUCHERS.forEach(function (v) { R.VOUCHER[v.id] = v; });
})();
