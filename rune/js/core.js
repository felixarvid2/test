// Rune – kärna: symboler, mönster, förtrollningar, slump och små hjälpfunktioner.
(function () {
  'use strict';
  var R = (typeof window !== 'undefined' ? window : globalThis).R = {};

  // ---- Symboler -----------------------------------------------------------
  R.SYMS = [
    { id: 'sol', e: '☀️', name: 'Sol', color: '#ffc94a' },
    { id: 'eld', e: '🔥', name: 'Eld', color: '#ff6b3d' },
    { id: 'mane', e: '🌙', name: 'Måne', color: '#9fb4ff' },
    { id: 'dod', e: '💀', name: 'Död', color: '#cfc6e0' },
    { id: 'natur', e: '🌿', name: 'Natur', color: '#5fd068' },
    { id: 'blixt', e: '⚡', name: 'Blixt', color: '#ffe14d' },
    { id: 'kristall', e: '💎', name: 'Kristall', color: '#4fd8ff' }
  ];
  R.SOL = 0; R.ELD = 1; R.MANE = 2; R.DOD = 3; R.NATUR = 4; R.BLIXT = 5; R.KRISTALL = 6;
  R.NSYM = 7;
  R.symE = function (s) { return s == null ? '🪨' : R.SYMS[s].e; };
  R.symName = function (s) { return s == null ? 'Sten' : R.SYMS[s].name; };

  // ---- Brädet --------------------------------------------------------------
  R.N = 5; R.CELLS = 25;
  R.rc = function (i) { return [Math.floor(i / 5), i % 5]; };
  R.idx = function (r, c) { return (r < 0 || c < 0 || r > 4 || c > 4) ? -1 : r * 5 + c; };
  R.CORNERS = [0, 4, 20, 24];
  R.CENTER = 12;
  R.isCorner = function (i) { return i === 0 || i === 4 || i === 20 || i === 24; };
  R.isEdge = function (i) { var p = R.rc(i); return p[0] === 0 || p[1] === 0 || p[0] === 4 || p[1] === 4; };
  R.isCore = function (i) { return !R.isEdge(i); };
  R.orth = function (i) {
    var p = R.rc(i), out = [];
    [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (d) { var j = R.idx(p[0] + d[0], p[1] + d[1]); if (j >= 0) out.push(j); });
    return out;
  };
  R.around = function (i) {
    var p = R.rc(i), out = [];
    for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      var j = R.idx(p[0] + dr, p[1] + dc); if (j >= 0) out.push(j);
    }
    return out;
  };

  // ---- Mönster (motsvarar Balatros pokerhänder) ---------------------------
  // chips/mult = nivå 1, lc/lm = ökning per nivå.
  R.PATTERNS = {
    trio:     { name: 'Trio',       chips: 20,  mult: 2,  lc: 15, lm: 1, desc: '3 lika i rad, vågrätt eller lodrätt.' },
    diagonal: { name: 'Diagonal',   chips: 30,  mult: 3,  lc: 20, lm: 1, desc: '3 lika i rad på en diagonal.' },
    kvadrat:  { name: 'Kvadrat',    chips: 35,  mult: 3,  lc: 20, lm: 2, desc: '2×2 lika.' },
    kvartett: { name: 'Kvartett',   chips: 50,  mult: 4,  lc: 25, lm: 2, desc: '4 lika i rad, i valfri riktning.' },
    regnbage: { name: 'Regnbåge',   chips: 60,  mult: 5,  lc: 25, lm: 2, desc: 'En hel rad eller kolumn med 5 olika symboler.' },
    spegel:   { name: 'Spegel',     chips: 50,  mult: 4,  lc: 20, lm: 2, desc: 'En hel rad eller kolumn som är symmetrisk (A B C B A), men inte 5 lika.' },
    kors:     { name: 'Kors',       chips: 80,  mult: 6,  lc: 30, lm: 3, desc: 'En runa och dess 4 grannar (upp, ner, vänster, höger) lika.' },
    linje:    { name: 'Full linje', chips: 120, mult: 8,  lc: 40, lm: 3, desc: '5 lika i en hel rad, kolumn eller huvuddiagonal.' },
    ring:     { name: 'Ring',       chips: 160, mult: 10, lc: 50, lm: 3, desc: '8 lika runt en ruta (mitten valfri).' },
    monolit:  { name: 'Monolit',    chips: 250, mult: 16, lc: 60, lm: 4, desc: '3×3 lika.' },
    los:      { name: 'Lösa runor', chips: 0,   mult: 0,  lc: 0,  lm: 0, desc: 'Runor som poängsätts utan att ingå i ett mönster.' }
  };
  R.patA = function (t) { return (t === 'kors' ? 'ett ' : 'en ') + R.PATTERNS[t].name; };
  R.PATTERN_IDS = ['trio', 'diagonal', 'kvadrat', 'kvartett', 'regnbage', 'spegel', 'kors', 'linje', 'ring', 'monolit'];
  R.patChips = function (id, lvl) { var p = R.PATTERNS[id]; return p.chips + p.lc * (lvl - 1); };
  R.patMult = function (id, lvl) { var p = R.PATTERNS[id]; return Math.max(1, p.mult + p.lm * (lvl - 1)) * (id === 'los' ? 0 : 1); };

  // ---- Reaktioner: en katalysatorruna intill ett mönster -------------------
  R.REACTIONS = [
    { sym: R.SOL,      name: 'Upplyst',     desc: 'Mönstrets runor triggas en extra gång.' },
    { sym: R.ELD,      name: 'Brinnande',   desc: '+6 Mult.' },
    { sym: R.MANE,     name: 'Månbelyst',   desc: '+$1.' },
    { sym: R.DOD,      name: 'Förbannad',   desc: '×2 Mult, men katalysatorn förstörs.' },
    { sym: R.NATUR,    name: 'Växande',     desc: '+10 Chips per runa i mönstret.' },
    { sym: R.BLIXT,    name: 'Överladdad',  desc: '×1.5 Mult.' },
    { sym: R.KRISTALL, name: 'Förstärkt',   desc: '+40 Chips.' }
  ];

  // ---- Runornas modifierare ------------------------------------------------
  R.ENH = {
    bonus: { name: 'Bonus',  desc: '+30 Chips när den poängsätts.' },
    mult:  { name: 'Mult',   desc: '+4 Mult när den poängsätts.' },
    vild:  { name: 'Vild',   desc: 'Räknas som alla symboler.' },
    glas:  { name: 'Glas',   desc: '×2 Mult när den poängsätts. 1 på 4 att krossas.' },
    stal:  { name: 'Stål',   desc: '×1.5 Mult medan den ligger kvar på brädet utan att poängsättas.' },
    sten:  { name: 'Sten',   desc: '+50 Chips. Saknar symbol men poängsätts alltid när den placeras.' },
    guld:  { name: 'Guld',   desc: '$3 om den ligger kvar på brädet när prövningen klaras.' },
    lycka: { name: 'Lycka',  desc: '1 på 5: +20 Mult. 1 på 15: $20.' }
  };
  R.SEALS = {
    rod:  { name: 'Rött sigill',  desc: 'Runan triggas en extra gång.' },
    guld: { name: 'Guldsigill',   desc: '$3 när runan poängsätts.' },
    bla:  { name: 'Blått sigill', desc: 'Skapar Stjärnbilden för senaste mönstret om runan ligger kvar på brädet när prövningen klaras.' },
    lila: { name: 'Lila sigill',  desc: 'Skapar en Ristning när runan byts bort.' }
  };
  R.EDITIONS = {
    folie: { name: 'Folie',      desc: '+50 Chips.' },
    holo:  { name: 'Holografisk', desc: '+10 Mult.' },
    poly:  { name: 'Polykrom',   desc: '×1.5 Mult.' },
    neg:   { name: 'Negativ',    desc: '+1 relikfack.' }
  };

  R.RARITY = {
    C: { name: 'Vanlig', color: '#4aa3ff' },
    U: { name: 'Ovanlig', color: '#3ecf8e' },
    R: { name: 'Sällsynt', color: '#ff5470' },
    L: { name: 'Legendarisk', color: '#c77dff' }
  };

  // ---- Slump (seedad, mulberry32) -----------------------------------------
  R.makeRng = function (seed) {
    var s = seed >>> 0;
    return {
      get state() { return s; }, set state(v) { s = v >>> 0; },
      next: function () {
        s = (s + 0x6D2B79F5) >>> 0;
        var t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      }
    };
  };
  R.hashSeed = function (str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };

  // ---- Hjälpfunktioner ----------------------------------------------------
  R.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  R.fmt = function (n) {
    if (!isFinite(n)) return '∞';
    if (Math.abs(n) >= 1e11) return n.toExponential(3).replace('e+', 'e');
    var neg = n < 0; n = Math.floor(Math.abs(n));
    var s = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return (neg ? '−' : '') + s;
  };
  R.fmtX = function (x) { return (Math.round(x * 100) / 100).toString(); };
  R.esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  var uid = 1;
  R.uid = function () { return uid++; };
  R.setUid = function (v) { uid = Math.max(uid, v); };
  R.newRune = function (sym, o) {
    o = o || {};
    return { uid: R.uid(), sym: sym, enh: o.enh || null, seal: o.seal || null, ed: o.ed || null, perm: o.perm || 0 };
  };
  R.runeChips = function (r) { return (r.enh === 'sten' ? 50 : 5) + (r.perm || 0); };
})();
