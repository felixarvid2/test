// Version 8: HUD för det du bär och samlar, veckans utmaningar, samlingar i handboken, fotoläge och inställningar.
(function () {
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function table(head, rows) {
    return '<table class="tbl"><tr>' + head.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr>' +
      rows.map(function (r) { return '<tr>' + r.map(function (x) { return '<td>' + x + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>';
  }
  var V8 = NV.v8 || (NV.v8 = {});
  function load() { return V8.load ? V8.load() : {}; }
  function save(d) { if (V8.save) V8.save(d); }

  // ------------------------------------------------------------------ Veckans utmaningar
  // Tre små mål per vecka. De räknas från statistiken, så de bockas av vad du än gör för att klara dem.
  var CHALLENGES = [
    ['waterings', 2, 'Vattna två växter', '🪴'], ['trash', 3, 'Plocka upp tre skräp', '🧹'], ['rubberDucks', 1, 'Hitta en gummianka', '🦆'],
    ['fish', 1, 'Få en fisk', '🎣'], ['emotes', 3, 'Använd tre emotes', '👋'], ['boardReads', 1, 'Läs anslagstavlan', '📌'],
    ['coffees', 1, 'Drick en kopp kaffe', '☕'], ['pings', 10, 'Kör ping tio gånger', '📡'], ['returns', 1, 'Lämna tillbaka något borttappat', '🎒'],
    ['sits', 1, 'Sätt dig och vila', '🪑'], ['snacks', 1, 'Köp något i varuautomaten', '🍫'], ['cats', 1, 'Klappa katten', '🐈'],
    ['duckFeeds', 1, 'Mata ankorna', '🦆'], ['goggles', 1, 'Använd nätverksglasögonen', '🥽'], ['crabs', 1, 'Fånga Krabban', '🦀'],
  ];
  V8.CHALLENGES = CHALLENGES;
  function weekChallenges(week) {
    var out = [], i = (week * 7) % CHALLENGES.length;
    while (out.length < 3) { var c = CHALLENGES[i % CHALLENGES.length]; if (out.indexOf(c) < 0) out.push(c); i += 4; }
    return out;
  }
  V8.weekChallenges = weekChallenges;
  function chState(week) {
    var d = load(); d.ch = d.ch || {};
    var k = 'w' + week, s = NV.career.stats();
    if (!d.ch[k]) { d.ch[k] = { base: {}, done: {} }; weekChallenges(week).forEach(function (c) { d.ch[k].base[c[0]] = s[c[0]] || 0; }); save(d); }
    return { d: d, st: d.ch[k], s: s };
  }
  V8.challengeProgress = function (week) {
    var x = chState(week);
    return weekChallenges(week).map(function (c) { var n = Math.max(0, (x.s[c[0]] || 0) - (x.st.base[c[0]] || 0)); return { id: c[0], need: c[1], text: c[2], icon: c[3], n: Math.min(n, c[1]), done: !!x.st.done[c[0]] || n >= c[1] }; });
  };
  function checkChallenges() {
    var g = NV.game;
    if (!g || !g.running || !g.week) return;
    var x = chState(g.week), changed = false;
    weekChallenges(g.week).forEach(function (c) {
      if (x.st.done[c[0]]) return;
      var n = (x.s[c[0]] || 0) - (x.st.base[c[0]] || 0);
      if (n >= c[1]) {
        x.st.done[c[0]] = Date.now(); changed = true;
        g.ui.toast(c[3] + ' <b>Veckans utmaning klar:</b> ' + esc(c[2]), 'good');
        g.xp(15, 'Veckans utmaning', true);
        NV.career.stat('challenges');
        if (g.world && g.world.confetti && g.mode === '2d') g.world.confetti(g.world.pos.x, g.world.pos.z, 30);
      }
    });
    if (changed) save(x.d);
  }

  // ------------------------------------------------------------------ HUD
  function hud() {
    var g = NV.game, el = document.getElementById('hud');
    if (!g || !g.running || !el || el.classList.contains('hidden')) return;
    var box = el.querySelector('.hud-v8');
    if (!box) { box = document.createElement('div'); box.className = 'hud-v8'; el.appendChild(box); }
    var w = g.world, html = '', d = load();
    if (w && w.lost && w.lost.carried) html += '<span class="chip" title="Lämna tillbaka saken till ägaren">' + w.lost.icon + ' ' + esc(w.lost.owner) + 's ' + esc(w.lost.item) + ' → ' + esc(w.lost.owner) + '</span>';
    if (g.boosted && g.boosted()) html += '<span class="chip good" title="Kaffet gör att du går fortare">☕ ' + Math.ceil((g.boostUntil - Date.now()) / 1000) + ' s</span>';
    var nd = Object.keys(d.ducks || {}).length;
    if (nd && V8.DUCKS && nd < V8.DUCKS.length) html += '<span class="chip" title="Gummiankor du har hittat">🦆 ' + nd + '/' + V8.DUCKS.length + '</span>';
    if (w && w.sneak && g.mode === '2d') html += '<span class="chip" title="Du smyger (C)">🤫 Smyger</span>';
    if (w && w.seated) html += '<span class="chip" title="Gå för att resa dig">🪑 Sitter</span>';
    if (g.week && NV.settings.get('hudChallenges') !== false) {
      var pr = V8.challengeProgress(g.week), left = pr.filter(function (p) { return !p.done; });
      html += '<span class="chip ch" title="' + esc(pr.map(function (p) { return (p.done ? '✅ ' : '⬜ ') + p.text + ' (' + p.n + '/' + p.need + ')'; }).join('\n')) + '">🎯 ' + (pr.length - left.length) + '/' + pr.length + ' utmaningar</span>';
    }
    if (box.innerHTML !== html) box.innerHTML = html;
  }

  // ------------------------------------------------------------------ Handboken: Samlingar
  var H = NV.handbook;
  H.saml = function () {
    var d = load(), g = NV.game, out = '';
    var ducks = V8.DUCKS || [], got = d.ducks || {};
    out += '<h3>🎯 Veckans utmaningar</h3>';
    if (g && g.week) out += table(['', 'Utmaning', 'Hur långt'], V8.challengeProgress(g.week).map(function (p) { return [p.done ? '✅' : '⬜', p.icon + ' ' + esc(p.text), p.n + ' / ' + p.need]; })) + '<p class="muted small">15 XP för varje. Nya utmaningar varje vecka.</p>';
    else out += '<p class="muted">Starta en vecka för att se veckans utmaningar.</p>';
    out += '<h3>🦆 Gummiankor: ' + Object.keys(got).length + ' av ' + ducks.length + '</h3>';
    out += '<div class="duck-grid">' + ducks.map(function (k) { return '<span class="duck' + (got[k.id] ? ' got' : '') + '" title="' + (got[k.id] ? 'Hittad ' + esc(k.hint) : (k.x > 50 ? 'Någonstans i Borås' : 'Någonstans i Göteborg')) + '">' + (got[k.id] ? '🦆' : '❔') + '</span>'; }).join('') + '</div>';
    var left = ducks.filter(function (k) { return !got[k.id]; });
    if (left.length && Object.keys(got).length >= 6) out += '<p class="muted small">Ledtråd: en anka finns ' + esc(left[0].hint) + '.</p>';
    var fl = d.fishLog || {}, fk = Object.keys(fl);
    out += '<h3>🐟 Fiskeloggen</h3>' + (fk.length ? table(['Art', 'Största'], fk.map(function (k) { return [esc(k), fl[k] + ' cm']; })) : '<p class="muted">Inga fiskar ännu. Fiska vid dammen väster om kontoret.</p>');
    var lost = d.lostDone || {}, lk = Object.keys(lost);
    out += '<h3>🎒 Hittegods</h3>' + (lk.length ? '<ul>' + lk.map(function (w) { return '<li>Vecka ' + esc(w) + ': ' + esc(lost[w]) + '</li>'; }).join('') + '</ul>' : '<p class="muted">Varje vecka har någon tappat något på kontoret. Håll utkik.</p>');
    var s = NV.career.stats();
    out += '<h3>📊 Småsaker</h3>' + table(['', 'Antal'], [['Vattnade växter', s.waterings || 0], ['Plockat skräp', s.trash || 0], ['Kast med spöet', s.casts || 0], ['Mellanmål', s.snacks || 0], ['Emotes', s.emotes || 0], ['Gånger du satt ner', s.sits || 0], ['Klarade utmaningar', s.challenges || 0], ['Meter gångna', Math.round(s.dist || 0)]]);
    return out;
  };
  // Styrningen i handboken får de nya tangenterna
  var origKeys = H.keys;
  if (origKeys) H.keys = function () {
    return origKeys.apply(this, arguments) + '<h3>Nytt i version 8 (2D)</h3>' + table(['Tangent / mus', 'Gör'], [
      ['Klick', 'Gå dit (figuren hittar vägen runt väggar och möbler)'], ['Dubbelklick', 'Spring dit'], ['Håll inne musknappen', 'Gå mot pekaren'],
      ['Shift + klick', 'Lägg till en mellanstation'], ['Högerklick / Esc', 'Stanna'], ['Klick på minikartan', 'Gå dit'],
      ['C', 'Smyg (krabban, katten och duvorna märker dig senare)'], ['1–6', 'Emotes: vinka, tumme upp, hjärta, fråga, skratt, fika'],
      ['E vid bänk eller soffa', 'Sätt dig'], ['E vid dammen', 'Fiska (E igen när flötet dyker)'], ['P', 'Fotoläge: Enter tar en bild, Tab byter filter'],
    ]);
  };

  // ------------------------------------------------------------------ Fotoläge
  var FILTERS = [['Inget filter', ''], ['Sepia', 'sepia(0.75) contrast(1.05)'], ['Svartvitt', 'grayscale(1) contrast(1.1)'], ['Kvällsljus', 'saturate(1.25) hue-rotate(-12deg) brightness(0.95)'], ['Kallt', 'saturate(0.9) hue-rotate(12deg) brightness(1.05)']];
  var fIdx = 0;
  function photoOn() { return document.body.classList.contains('photo'); }
  function applyFilter() {
    var f = photoOn() ? FILTERS[fIdx][1] : '';
    ['view', 'view2d'].forEach(function (id) { var el = document.getElementById(id); if (el) el.style.filter = f; });
    var tip = document.getElementById('photo-tip');
    if (tip) tip.textContent = 'Fotoläge · ' + FILTERS[fIdx][0] + ' · Enter tar en bild · Tab byter filter · P avslutar';
  }
  function snap() {
    var g = NV.game, cv = g.mode === '2d' ? document.getElementById('view2d') : (g.world && g.world.renderer ? g.world.renderer.domElement : null);
    if (!cv) return;
    if (g.mode === '3d' && g.world.render) try { g.world.render(); } catch (e) { /* ritas nästa bildruta */ }
    var out = document.createElement('canvas'); out.width = cv.width; out.height = cv.height;
    var x = out.getContext('2d');
    x.filter = FILTERS[fIdx][1] || 'none';
    try { x.drawImage(cv, 0, 0); } catch (e) { return; }
    x.filter = 'none';
    // Liten stämpel i hörnet
    var sz = Math.max(12, Math.round(out.height / 50));
    x.font = sz + 'px "Press Start 2P", monospace'; x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillText('Krabba-passet', 14, out.height - 12); x.fillStyle = 'rgba(255,255,255,0.85)'; x.fillText('Krabba-passet', 12, out.height - 14);
    NV.sfx.shutter();
    var fl = document.createElement('div'); fl.className = 'photo-flash'; document.body.appendChild(fl); setTimeout(function () { fl.remove(); }, 450);
    NV.career.stat('photos');
    try {
      var a = document.createElement('a'); a.download = 'krabba-passet-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.png'; a.href = out.toDataURL('image/png');
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { g.ui.toast('Bilden kunde inte sparas i den här webbläsaren.'); }
  }
  document.addEventListener('keydown', function (e) {
    if (!photoOn()) { if (e.code === 'KeyP') setTimeout(applyFilter, 0); return; }
    if (e.code === 'Enter') { e.preventDefault(); e.stopPropagation(); snap(); }
    else if (e.code === 'Tab') { e.preventDefault(); e.stopPropagation(); fIdx = (fIdx + 1) % FILTERS.length; applyFilter(); }
    else if (e.code === 'KeyP') setTimeout(applyFilter, 0);
  }, true);

  // ------------------------------------------------------------------ Inställningar
  var Dd = NV.settings.defaults;
  Dd.pathDots = true; Dd.autoRun = true; Dd.npcWalks = true; Dd.hudChallenges = true; Dd.lookAhead = true;
  var U = NV.UI && NV.UI.prototype;
  if (U && U.settingsDialog) {
    var origSet = U.settingsDialog;
    U.settingsDialog = function () {
      origSet.apply(this, arguments);
      var body = document.querySelector('#dialog .dlg-body'), st = NV.settings;
      if (!body) return;
      var box = document.createElement('div');
      var opts = [['v8-dots', 'pathDots', 'Visa vägen som prickar när du klickar (2D)'], ['v8-run', 'autoRun', 'Spring automatiskt på långa vägar (2D)'],
        ['v8-walk', 'npcWalks', 'Kollegorna går och hämtar kaffe (2D)'], ['v8-ch', 'hudChallenges', 'Visa veckans utmaningar i HUD:en'], ['v8-look', 'lookAhead', 'Kameran tittar framåt där du går (2D)']];
      box.innerHTML = '<h3>Version 8</h3><div class="set-grid">' + opts.map(function (o) { return '<label for="' + o[0] + '">' + o[2] + '</label><input type="checkbox" id="' + o[0] + '"' + (st.get(o[1]) !== false ? ' checked' : '') + '>'; }).join('') + '</div>';
      body.appendChild(box);
      opts.forEach(function (o) { var el = box.querySelector('#' + o[0]); el.addEventListener('input', function () { st.set(o[1], el.checked); }); });
    };
  }

  window.addEventListener('load', function () {
    var g = NV.game;
    if (!g) return;
    setInterval(function () { try { hud(); checkChallenges(); } catch (e) { /* HUD är inte viktig */ } }, 1000);
    // Nya utmaningar när veckan startar
    var origStart = g.startWeek;
    g.startWeek = function (wk) {
      var r = origStart.apply(this, arguments);
      try { var pr = V8.challengeProgress(this.week); setTimeout(function () { if (NV.game.running) NV.game.ui.toast('🎯 <b>Veckans utmaningar:</b> ' + pr.map(function (p) { return p.icon + ' ' + esc(p.text); }).join(' · ')); }, 2500); } catch (e) { /* ingen vecka */ }
      return r;
    };
    // Konfetti runt figuren när du låser upp en prestation i 2D
    var origUnlock = NV.career.onUnlock;
    NV.career.onUnlock = function (a) {
      if (origUnlock) origUnlock.apply(this, arguments);
      var w = g.world;
      if (g.mode === '2d' && w && w.confetti && NV.settings.get('reduceMotion') !== true) w.confetti(w.pos.x, w.pos.z, 40);
    };
  });

  // Prestationer
  [
    ['ch1', 'Utmanare', 'Klara en av veckans utmaningar.', '🎯', function (s) { return s.challenges >= 1; }],
    ['ch10', 'Tio av tio', 'Klara tio veckoutmaningar.', '🥇', function (s) { return s.challenges >= 10; }],
    ['photo', 'Fotograf', 'Ta en bild i fotoläget (P, sedan Enter).', '📸', function (s) { return s.photos >= 1; }],
  ].forEach(function (a) { var A = NV.career.ACH; if (!A.some(function (x) { return x[0] === a[0]; })) A.push(a); });
})();
