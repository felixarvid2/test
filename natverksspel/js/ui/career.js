// Karriären: erfarenhetspoäng, rang, prestationer och statistik. Sparas i webbläsaren.
NV.career = (function () {
  var KEY = 'krabba-passet.career';
  var RANKS = [
    [0, 'Praktikant'], [250, 'Junior tekniker'], [700, 'Nätverkstekniker'], [1400, 'Senior tekniker'],
    [2500, 'Nätverksarkitekt'], [4000, 'Krabbans ärkefiende'],
  ];
  // Prestationer: id, namn, beskrivning, ikon, villkor
  var ACH = [
    ['crab1', 'Krabbfångare', 'Fånga Krabban.', '🦀', function (s) { return s.crabs >= 1; }],
    ['crab5', 'Krabbjägare', 'Fånga Krabban fem gånger.', '🪤', function (s) { return s.crabs >= 5; }],
    ['coffee5', 'Kaffetörstig', 'Drick fem koppar kaffe.', '☕', function (s) { return s.coffees >= 5; }],
    ['ping50', 'Pingmästare', 'Skicka 50 ping.', '📡', function (s) { return s.pings >= 50; }],
    ['cmd500', 'Terminalfantast', 'Skriv 500 kommandon.', '⌨️', function (s) { return s.commands >= 500; }],
    ['walk2k', 'Maratontekniker', 'Gå två kilometer på jobbet.', '👟', function (s) { return s.dist >= 2000; }],
    ['goggles10', 'Glasögonorm', 'Använd nätverksglasögonen tio gånger.', '🥽', function (s) { return s.goggles >= 10; }],
    ['fix10', 'Felsökare', 'Lös tio fel.', '🔧', function (s) { return s.fixed >= 10; }],
    ['fix27', 'Hela felbiblioteket', 'Lös 27 fel.', '📚', function (s) { return s.fixed >= 27; }],
    ['report20', 'Dokumenterare', 'Skriv 20 helt rätta felrapporter.', '📝', function (s) { return s.perfect >= 20; }],
    ['combo3', 'Kombo', 'Lös tre fel i rad, med högst tre minuter emellan.', '⚡', function (s) { return s.bestCombo >= 3; }],
    ['torch', 'Mörkrädd', 'Tänd ficklampan.', '🔦', function (s) { return s.torch >= 1; }],
    ['cable3', 'Kabeldetektiv', 'Dra ur, sätt i eller byt kablar tre gånger.', '🔌', function (s) { return s.cables >= 3; }],
    ['nohint', 'Utan ledtrådar', 'Klara en vecka utan ledtrådar.', '🧠', function (s) { return s.noHintWeeks >= 1; }],
    ['fast', 'Snabb tekniker', 'Klara en vecka på högst tio minuter.', '⏱️', function (s) { return s.fastWeeks >= 1; }],
    ['exam', 'Examen klarad', 'Klara en examen.', '🎓', function (s) { return s.exams >= 1; }],
    ['allweeks', 'Veckans hjälte', 'Klara alla nio veckor.', '🏆', function (s, p) { return Object.keys(p.weeks || {}).length >= 9; }],
    ['stars27', 'Stjärnsamlare', 'Samla alla 27 stjärnor.', '⭐', function (s, p) { var n = 0; Object.keys(p.weeks || {}).forEach(function (k) { n += p.weeks[k].stars || 0; }); return n >= 27; }],
    ['hard', 'Hårding', 'Klara en vecka på svår nivå.', '💪', function (s) { return s.hardWeeks >= 1; }],
    ['night', 'Övertid', 'Spela i en timme totalt.', '🌙', function (s) { return s.playSec >= 3600; }],
  ];
  var data;
  try { data = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { data = null; }
  if (!data || typeof data !== 'object') data = {};
  data.xp = data.xp || 0; data.stats = data.stats || {}; data.ach = data.ach || {};
  var dirty = false;
  function save() { if (!dirty) return; dirty = false; try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* privat läge */ } }
  setInterval(save, 5000);
  window.addEventListener('beforeunload', save);

  function stats() {
    var s = data.stats, out = {};
    ['dist', 'commands', 'pings', 'fixed', 'reports', 'perfect', 'coffees', 'crabs', 'hints', 'playSec', 'goggles', 'torch', 'cables', 'bestCombo', 'noHintWeeks', 'fastWeeks', 'exams', 'hardWeeks', 'weeks'].forEach(function (k) { out[k] = s[k] || 0; });
    return out;
  }
  function progress() { try { return JSON.parse(localStorage.getItem('krabba-passet.v1') || '{}'); } catch (e) { return {}; } }
  function check() {
    var s = stats(), p = progress(), got = [];
    ACH.forEach(function (a) {
      if (data.ach[a[0]]) return;
      var ok = false;
      try { ok = a[4](s, p); } catch (e) { ok = false; }
      if (ok) { data.ach[a[0]] = Date.now(); dirty = true; got.push(a); }
    });
    got.forEach(function (a) { if (api.onUnlock) api.onUnlock({ id: a[0], name: a[1], desc: a[2], icon: a[3] }); });
  }
  function stat(k, n) { data.stats[k] = (data.stats[k] || 0) + (n === undefined ? 1 : n); dirty = true; if (k !== 'dist' && k !== 'playSec') check(); else if (Math.random() < 0.05) check(); }
  function max(k, v) { if (v > (data.stats[k] || 0)) { data.stats[k] = v; dirty = true; check(); } }
  function rank(xp) {
    if (xp === undefined) xp = data.xp;
    var i = 0;
    for (var k = 0; k < RANKS.length; k++) if (xp >= RANKS[k][0]) i = k;
    var next = RANKS[i + 1];
    return { i: i, name: RANKS[i][1], xp: xp, from: RANKS[i][0], to: next ? next[0] : null, frac: next ? (xp - RANKS[i][0]) / (next[0] - RANKS[i][0]) : 1, nextName: next ? next[1] : null };
  }
  function addXP(n) {
    var before = rank().i;
    data.xp = Math.max(0, data.xp + n);
    dirty = true;
    var r = rank();
    return { rank: r, up: r.i > before };
  }
  // Kommandofamiljer som ger lite XP första gången de används
  function firstUse(family) {
    data.seen = data.seen || {};
    if (data.seen[family]) return false;
    data.seen[family] = 1; dirty = true;
    return true;
  }

  var api = {
    RANKS: RANKS, ACH: ACH, stats: stats, stat: stat, max: max, rank: rank, addXP: addXP, firstUse: firstUse,
    unlocked: function (id) { return !!data.ach[id]; }, unlockedCount: function () { return Object.keys(data.ach).length; }, save: function () { dirty = true; save(); }, check: check,
    xp: function () { return data.xp; }, onUnlock: null,
  };
  return api;
})();
