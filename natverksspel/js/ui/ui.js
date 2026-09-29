// Gränssnittet: HUD, dialoger, felrapport, handbok, karta, rackvy, inställningar och meny.
NV.UI = (function () {
  var S = NV.sim, U = NV.util;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function fmtTime(ms) { var s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }

  // Kollegornas småprat, olika varje vecka
  var CHAT = {
    Anna: ['"Jag har lärt mig att ringa dig innan jag startar om datorn."', '"Är det sant att Krabban har en egen nyckel till serverrummet?"', '"Kaffet i fikarummet är bättre än nätet i dag."'],
    Karim: ['"Kunderna säger att vår nya offert-portal är snabb. Tack!"', '"Jag har tre kablar hemma som ser likadana ut. Vilken är nätverkskabel?"', '"Om nätet går ner igen tar jag med mig laptopen till fiket."'],
    Sara: ['"Jag är ny här. Är det normalt att switcharna blinkar så mycket?"', '"Vad betyder DHCP egentligen?"', '"Min förra arbetsplats hade bara Wi-Fi."'],
    Lisa: ['"Skrivaren och jag har ett komplicerat förhållande."', '"Jag gör nyhetsbrevet – vill du vara med som månadens tekniker?"', '"Filservern fungerar, det är det viktigaste."'],
    Bo: ['"Bokslutet väntar inte på nätverket."', '"Ekonomisystemet ska vara stängt för alla utom oss. Det vet du väl?"', '"Jag litar på dig, men jag litar mer på loggar."'],
    Maja: ['"Siffrorna stämmer. Gör nätet det?"', '"Bo räknar på kalkylatorn, jag räknar i Excel."', '"Vi på ekonomi gillar när saker har rätt VLAN."'],
    Omar: ['"Jag skriver Python-skript som frågar routrarna varje timme."', '"Glöm inte write memory. Jag har lärt mig den läxan."', '"Lösenordet står på lappen vid laptopen. Byt det efter kursen!"', '"Krabban brukar slå till på natten. Jag har aldrig sett hen."'],
    Linnea: ['"Välkommen till Nordvik! Gästnätet heter Nordvik-Gast."', '"Besökarna frågar alltid efter Wi-Fi-lösenordet först."', '"Någon lämnade en konstig liten låda med blinkande lampor här."'],
    Eva: ['"Jag granskar säkerheten. Telnet är en röd flagga."', '"Allt som skickas i klartext hamnar i min rapport."'],
    Nils: ['"Truckarna går på el, streckkodsläsarna på Wi-Fi."', '"Här ute är det kallt, men accesspunkterna ska vara varma."', '"Göteborg har fina kontor. Vi har pallar."'],
  };
  // Vecka 10: den hyrda linan är uppsagd och alla pratar om VPN
  var CHAT10 = {
    Bo: ['"Sex tusen kronor i månaden för en lina som användes till fyra procent. Bra att den är borta."', '"Jag har hört att Mölndal också vill ha VPN. Vad kostar det?"'],
    Maja: ['"Om tunneln är krypterad, kan operatören se våra fakturor?"'],
    Omar: ['"Fas 1 är ISAKMP, fas 2 är IPsec. Jag har det på en lapp."', '"Tunneln byggs först när trafik matchar listan. Pinga från rätt källa!"', '"SD-WAN vore fint, men vi börjar med en vanlig crypto map."'],
    Anna: ['"Borås känns närmare nu när allt går över internet. Eller?"'],
    Sara: ['"Vad är skillnaden på en VPN-tunnel och en vanlig tunnel?"'],
    Linnea: ['"En säljare från ett SD-WAN-företag ringde tre gånger i dag."'],
  };

  var TIPS = [
    'Tryck G för nätverksglasögonen: kablarna lyser grönt, rött eller orange efter status.',
    'Kör ping i terminalen och se paketen flyga genom nätet i 3D.',
    'Krabban gömmer sig nära ett av veckans fel. Fånga den för en ledtråd och XP.',
    'Kaffe i fikarummet gör att du går snabbare en stund.',
    'Huka med C för att läsa de nedersta enheterna i racket.',
    'Tre lösta fel i rad inom tre minuter ger kombobonus.',
    'Klicka på kartan (M) för att sätta en egen markering.',
    'Ctrl+F söker i terminalen och → tar den grå kompletteringen.',
    'P döljer allt gränssnitt – perfekt för skärmdumpar.',
    'Lyser statustornet på rack A orange finns det Krabba-fel kvar.',
  ];
  // Frontpaneler i rackvyn
  function hostName(game, id) { return function () { var d = game.state.devices[id]; return d && d.config ? d.config.hostname : id; }; }
  function rackSpecs(game) {
    var r = rackSpecsBase(game);
    // Kapitel 10: lastbalanseraren och tidrapportservrarna
    if (game.state && game.state.devices.LB) {
      r.A.push({ type: 'lb', units: 1, devId: 'LB', sticker: function () { return 'LB-Nordvik'; }, bg: '#243447', health: function () { return NV.shared.lbHealth(game.state); } });
      r.B.push({ type: 'server', units: 1, sticker: function () { return 'Tid-1'; }, bg: '#1d2024', led: 'Tid-1' });
      r.B.push({ type: 'server', units: 1, sticker: function () { return 'Tid-2'; }, bg: '#1d2024', led: 'Tid-2' });
    }
    return r;
  }
  function rackSpecsBase(game) {
    return {
      A: [
        { type: 'switch', units: 1, devId: 'SW1', brand: 'Catalyst 3560G', model: 'WS-C3560G-24PS', bg: '#4c5b6b', sticker: hostName(game, 'SW1') },
        { type: 'switch', units: 1, devId: 'SW2', brand: 'Catalyst 3750G', model: 'WS-C3750G-24PS', bg: '#4c5b6b', sticker: hostName(game, 'SW2') },
        { type: 'router', units: 2, devId: 'R1', brand: 'CISCO 2951', bg: '#cfd2cf', text: '#1d2226', sticker: hostName(game, 'R1') },
        { type: 'asa', units: 1, bg: '#30363d', sticker: function () { return 'ASA (ej i drift)'; } },
        { type: 'wlc', units: 1, devId: 'WLC', bg: '#b9bcbf', text: '#1d2226', sticker: function () { return 'WLC-Nordvik'; } },
      ],
      B: [
        { type: 'server', units: 2, sticker: function () { return 'Filserver'; }, bg: '#1d2024', led: 'Filserver' },
        { type: 'server', units: 1, sticker: function () { return 'NTP'; }, bg: '#1d2024', led: 'NTP-server' },
        { type: 'server', units: 1, sticker: function () { return 'Logg'; }, bg: '#1d2024', led: 'Loggserver' },
        { type: 'server', units: 2, sticker: function () { return 'Ekonomisystem'; }, bg: '#1d2024', led: 'Ekonomisystem' },
      ],
      BO: [
        { type: 'switch', units: 1, devId: 'SWB', brand: 'Catalyst 3560G', model: 'WS-C3560G-24PS', bg: '#4c5b6b', sticker: hostName(game, 'SWB') },
        { type: 'router', units: 2, devId: 'RB', brand: 'CISCO 2951', bg: '#cfd2cf', text: '#1d2226', sticker: hostName(game, 'RB') },
      ],
    };
  }

  function UI(game) {
    this.game = game;
    this.dialog = $('#dialog');
    this.menu = $('#menu');
    this.hud = $('#hud');
    this.hint = $('#hint');
    this.toastEl = $('#toast');
    this.pause = $('#pause');
    this.fade = $('#fade');
    this.compass = $('#compass');
    this.log = [];
    var self = this;
    document.addEventListener('keydown', function (e) {
      if (self.game.terminal.open) return;
      if (e.code === 'F1') { e.preventDefault(); if (!self.menuOpen()) self.helpDialog(); return; }
      if (!self.dialogOpen() && !self.menuOpen() && !self.pauseOpen()) {
        var k = e.code;
        if (k === 'KeyF') { self.reportPicker(); e.preventDefault(); }
        else if (k === 'KeyH') { self.handbook(); e.preventDefault(); }
        else if (k === 'KeyL') { self.hintPicker(); e.preventDefault(); }
        else if (k === 'KeyT') { self.game.openLaptop(); e.preventDefault(); }
        else if (k === 'Tab') { self.taskOverview(); e.preventDefault(); }
        else if (k === 'KeyM') { self.mapDialog(); e.preventDefault(); }
        else if (k === 'KeyN') { self.notesDialog(); e.preventDefault(); }
        else if (k === 'KeyO') { self.logDialog(); e.preventDefault(); }
        else if (k === 'KeyU') { NV.settings.set('hudCollapsed', !NV.settings.get('hudCollapsed')); self.renderHud(); }
        else if (k === 'KeyG') { self.game.toggleGoggles(); e.preventDefault(); }
        else if (k === 'KeyJ') { self.achievementsDialog(); e.preventDefault(); }
        else if (k === 'KeyR') { self.game.replayPing(); e.preventDefault(); }
        else if (k === 'KeyK') { NV.settings.set('minimap', !NV.settings.get('minimap')); self.toast(NV.settings.get('minimap') ? 'Minikartan visas (K).' : 'Minikartan är dold (K).'); }
        else if (k === 'KeyP') { var on = document.body.classList.toggle('photo'); $('#photo-tip').classList.toggle('hidden', !on); }
        else if (k === 'Escape' && self.game.mode === '2d') { self.showPause(); e.preventDefault(); }
      } else if (e.code === 'Escape' && self.dialogOpen() && !self.dialogLocked) {
        self.closeDialog();
      } else if (e.code === 'Escape' && self.pauseOpen() && self.game.mode === '2d') {
        self.hidePause();
      }
    });
    this.pause.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pause]');
      var act = b ? b.getAttribute('data-pause') : 'resume';
      if (act === 'resume') { self.hidePause(); self.game.world.lock(); }
      else if (act === 'settings') { self.hidePause(); self.settingsDialog(); }
      else if (act === 'map') { self.hidePause(); self.mapDialog(); }
      else if (act === 'menu') { self.hidePause(); self.showMenu(); }
      e.stopPropagation();
    });
  }
  var P = UI.prototype;

  P.dialogOpen = function () { return !this.dialog.classList.contains('hidden'); };
  P.menuOpen = function () { return !this.menu.classList.contains('hidden'); };
  P.pauseOpen = function () { return !this.pause.classList.contains('hidden'); };
  P.captures = function () {
    var c = this.dialogOpen() || this.menuOpen() || this.game.terminal.open || (this.game.mode === '2d' && this.pauseOpen());
    // Världen bakom fönster blir suddig (utom bakom terminalen, där pingpaketen ska synas)
    var blur = c && !this.game.terminal.open;
    if (blur !== this._blur) { this._blur = blur; document.body.classList.toggle('covered', blur); }
    return c;
  };
  P.showPause = function () { this.pause.classList.remove('hidden'); };
  P.hidePause = function () { this.pause.classList.add('hidden'); };
  P.onLockChange = function (locked) {
    if (locked) { this.hidePause(); return; }
    if (NV.touch.active()) return;
    if (!this.captures() && this.game.mode === '3d') this.showPause();
  };
  P.afterOverlay = function () {
    if (this.captures()) return;
    if (this.game.mode === '3d' && !NV.touch.active()) {
      this.showPause();
      this.game.world.lock();
    }
  };

  // ------------------------------------------------------------------ HUD
  P.renderHud = function () {
    var g = this.game;
    if (!g.world) return;
    var z = g.world.zone();
    var clock = S.deviceClock(g.state, g.state.devices.R1);
    var collapsed = NV.settings.get('hudCollapsed');
    var html = '<div class="hud-week">' + (g.def ? 'Vecka ' + g.def.week + ' · ' + esc(g.def.title) : 'Fri träning') + (g.exam ? ' <span class="badge">EXAMEN</span>' : '') + '</div>';
    html += '<div class="hud-loc">' + esc(z.name) + ' · ' + clock.hms.slice(0, 5) + (g.def && g.running ? ' · ⏱ ' + fmtTime(g.elapsed()) : '') + (g.consoleTargetId && g.state.devices[g.consoleTargetId] ? ' · 🔌 ' + esc(g.state.devices[g.consoleTargetId].config ? g.state.devices[g.consoleTargetId].config.hostname : (g.consoleTargetId === 'LB' ? 'LB-Nordvik' : 'WLC-Nordvik')) : '') + '</div>';
    var vs = NV.shared && NV.shared.vpnState ? NV.shared.vpnState(g.state) : null;
    if (vs) html += '<div class="hud-loc hud-vpn ' + vs + '">🔐 VPN till Borås: ' + ({ up: 'uppe', partial: 'delvis uppe', down: 'nere' }[vs]) + '</div>';
    if (!collapsed && g.def) {
      html += '<ul class="hud-tasks">';
      g.def.tasks.forEach(function (t) {
        var s = g.taskState[t.id];
        var cls = s.reported ? 'done' : (s.fixed ? 'fixed' : 'open');
        var icon = s.reported ? '✔' : (s.fixed ? '✎' : '○');
        var who = t.krabba ? '🦀 ' : '💬 ';
        var extra = s.fixed && !s.reported ? ' <span class="hud-cta">– skriv felrapport (F)</span>' : '';
        html += '<li class="' + cls + '"><span class="ico">' + icon + '</span>' + who + esc(s.known ? t.title : (t.krabba ? 'Okänt Krabba-fel' : t.title)) + extra + '</li>';
      });
      html += '</ul>';
    }
    var gt = g.guideText && g.guideText();
    if (gt) html += '<div class="hud-guide">👉 ' + esc(gt) + '</div>';
    if (g.boosted && g.boosted()) html += '<div class="hud-loc">☕ Kaffeboost: ' + Math.ceil((g.boostUntil - Date.now()) / 1000) + ' s</div>';
    if (g.goggles) html += '<div class="hud-loc" style="color:#6ee787">🥽 Nätverksglasögon på (G)</div>';
    if (!collapsed) html += '<div class="hud-keys">' + (g.mode === '2d' ? 'WASD/pilar gå · klicka för att gå · <b>E</b> använd · <b>+/−</b> zoom' : 'WASD gå · mus titta · <b>E</b> använd · högerklick zoom · <b>C</b> huka · <b>V</b> ficklampa') + ' · <b>T</b> laptop · <b>F</b> felrapport · <b>L</b> ledtråd · <b>G</b> glasögon · <b>M</b> karta · <b>J</b> prestationer · <b>H</b> handbok · <b>F1</b> hjälp · <b>U</b> dölj</div>';
    this.hud.innerHTML = html;
    this.renderXp();
  };
  // Grafiknivån byts vid omladdning; veckan sparas och fortsätter automatiskt
  P.reloadOffer = function () {
    var g = this.game;
    this.showDialog({ title: 'Byt grafiknivå', html: '<p>Den nya grafiknivån används när spelet laddas om. Din vecka sparas och fortsätter där du var.</p>', buttons: [{ label: 'Ladda om nu', primary: true, onClick: function () { g.reloadKeepRun(); } }, { label: 'Senare' }] });
  };
  P.perfPrompt = function (lower) {
    var self = this;
    var d = document.createElement('div');
    d.className = 'toast warn big';
    d.innerHTML = '🐢 Spelet går trögt på den här datorn. <button class="primary">Byt till ' + esc(NV.gfx.NAMES[lower].split(' (')[0].toLowerCase()) + ' grafik</button>';
    d.querySelector('button').addEventListener('click', function () { NV.settings.set('quality', lower); self.game.reloadKeepRun(); });
    this.toastEl.appendChild(d);
    setTimeout(function () { d.classList.add('out'); }, 14000);
    setTimeout(function () { d.remove(); }, 15000);
  };
  P.renderXp = function () {
    var el = $('#xpbar'), r = NV.career.rank();
    el.classList.toggle('hidden', !this.game.running);
    el.querySelector('.xp-rank').textContent = r.name;
    el.querySelector('.xp-track i').style.width = Math.round(r.frac * 100) + '%';
    el.querySelector('.xp-num').textContent = r.to ? r.xp + ' / ' + r.to + ' XP' : r.xp + ' XP';
    if (this._lastXp !== undefined && r.xp > this._lastXp) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
    this._lastXp = r.xp;
  };
  P.xpToast = function (n, why) { this.toast((n >= 0 ? '<b>+' + n + ' XP</b> · ' : '<b>−' + Math.abs(n) + ' XP</b> · ') + esc(why), 'xp'); };
  P.achievement = function (a) {
    NV.sfx.achievement();
    this.toast('<span class="ai">' + a.icon + '</span><span><b>Prestation: ' + esc(a.name) + '</b><br><span class="muted">' + esc(a.desc) + '</span></span>', 'ach big');
    if (this.game.world && this.game.world.fireworks) this.game.world.fireworks(2);
  };
  P.achievementsDialog = function () {
    var r = NV.career.rank(), st = NV.career.stats();
    var html = '<div class="rank-card"><div class="big">🏅</div><div><b>' + esc(r.name) + '</b> · ' + r.xp + ' XP<div class="bar"><i style="width:' + Math.round(r.frac * 100) + '%"></i></div><span class="muted small">' + (r.to ? 'Nästa rang: ' + esc(r.nextName) + ' vid ' + r.to + ' XP' : 'Högsta rangen!') + '</span></div></div>';
    html += '<h3>Prestationer (' + NV.career.unlockedCount() + ' av ' + NV.career.ACH.length + ')</h3><div class="ach-grid">' + NV.career.ACH.map(function (a) {
      var got = NV.career.unlocked(a[0]);
      return '<div class="ach' + (got ? '' : ' locked') + '"><span class="ai">' + a[3] + '</span><div><b>' + esc(a[1]) + '</b><span>' + esc(a[2]) + '</span></div></div>';
    }).join('') + '</div>';
    var mins = Math.round(st.playSec / 60);
    var rows = [['Speltid', mins + ' min'], ['Gått', (st.dist / 1000).toFixed(2) + ' km'], ['Kommandon', st.commands], ['Ping', st.pings], ['Lösta fel', st.fixed], ['Felrapporter', st.reports + ' (' + st.perfect + ' helt rätt)'], ['Ledtrådar', st.hints], ['Kaffe', st.coffees + ' koppar'], ['Krabban fångad', st.crabs], ['Bästa kombo', '×' + st.bestCombo], ['Klara veckor', st.weeks], ['Kablar', st.cables], ['Ping med DF-bit', st.dfPings || 0], ['show crypto', st.cryptoShows || 0], ['curl', st.curls || 0], ['Resor Göteborg–Borås', st.trips || 0]];
    html += '<h3>Statistik</h3><div class="stat-grid">' + rows.map(function (x) { return '<div><b>' + esc(String(x[1])) + '</b><span>' + esc(x[0]) + '</span></div>'; }).join('') + '</div>';
    this.showDialog({ title: 'Karriär och prestationer', html: html, wide: true, buttons: [{ label: 'Stäng', primary: true }] });
  };
  P.setHint = function (inter, detail) {
    var txt = inter ? this.game.describe(inter) : '';
    if (txt && detail) txt += '  ·  ' + detail;
    else if (!txt && detail) txt = detail;
    this.hint.textContent = txt ? (inter ? 'E – ' : '') + txt : '';
    this.hint.style.display = txt ? '' : 'none';
    var ch = $('#crosshair');
    ch.classList.toggle('active', !!txt);
    ch.setAttribute('data-icon', inter ? ({ console: '🔌', npc: '💬', cable: '⚡', deskcable: '⚡', pc: '🖥', laptop: '💻', travel: '🚗', coffee: '☕', crab: '🦀', rack: '🗄', monitor: '📈', whiteboard: '📋', phone: '📱', miniswitch: '📦' }[inter.type] || '') : '');
  };
  // Pilen mot nästa mål
  P.updateCompass = function () {
    var g = this.game;
    var o = g.world && g.running && !this.captures() && NV.settings.get('difficulty') !== 'hard' && !document.body.classList.contains('photo') ? g.objective() : null;
    if (!o) { this.compass.classList.add('hidden'); return; }
    var dx = o.x - g.world.pos.x, dz = o.z - g.world.pos.z;
    var dist = Math.hypot(dx, dz);
    if (dist < 1.8) { this.compass.classList.add('hidden'); return; }
    var ang;
    if (g.mode === '3d') {
      var fx = -Math.sin(g.world.yaw), fz = -Math.cos(g.world.yaw);
      var rx = Math.cos(g.world.yaw), rz = -Math.sin(g.world.yaw);
      ang = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
    } else ang = Math.atan2(dx, dz);
    this.compass.classList.remove('hidden');
    $('.arrow', this.compass).style.transform = 'rotate(' + (ang - Math.PI / 2) + 'rad)';
    $('.ctext', this.compass).textContent = o.label + ' · ' + Math.round(dist) + ' m';
  };
  P.toast = function (msg, kind) {
    var d = document.createElement('div');
    d.className = 'toast ' + (kind || '');
    d.innerHTML = msg;
    this.toastEl.appendChild(d);
    var clock = this.game.state ? S.deviceClock(this.game.state, this.game.state.devices.R1).hms.slice(0, 5) : '';
    this.log.push({ t: clock, msg: msg, kind: kind });
    if (this.log.length > 80) this.log.shift();
    setTimeout(function () { d.classList.add('out'); }, 4200);
    setTimeout(function () { d.remove(); }, 5000);
  };
  P.fadeTo = function (fn) {
    var f = this.fade;
    f.classList.add('on');
    setTimeout(function () { fn(); setTimeout(function () { f.classList.remove('on'); }, 350); }, 450);
  };
  P.copyText = function (text) {
    var self = this;
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      self.toast(ok ? 'Kopierat till urklipp.' : 'Kunde inte kopiera. Markera texten och kopiera själv.', ok ? 'good' : 'warn');
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { self.toast('Kopierat till urklipp.', 'good'); }, fallback);
        return;
      }
    } catch (e) { /* använder reservvägen */ }
    fallback();
  };

  // ------------------------------------------------------------------ Dialog
  P.showDialog = function (opts) {
    var self = this;
    this.game.world.unlock();
    this.hidePause();
    this.dialogLocked = !!opts.locked;
    if (this.dialogTimer) { clearInterval(this.dialogTimer); this.dialogTimer = null; }
    var d = this.dialog;
    d.className = 'overlay' + (opts.wide ? ' wide' : '') + (opts.cls ? ' ' + opts.cls : '');
    d.innerHTML = '<div class="dlg"><div class="dlg-head"><div class="dlg-title">' + (opts.title || '') + '</div>' + (opts.locked ? '' : '<button class="x" data-close aria-label="Stäng">✕</button>') + '</div><div class="dlg-body">' + (opts.html || '') + '</div><div class="dlg-foot"></div></div>';
    var foot = $('.dlg-foot', d);
    (opts.buttons || []).forEach(function (b) {
      var el = document.createElement('button');
      el.textContent = b.label;
      if (b.primary) el.className = 'primary';
      el.addEventListener('click', function () { NV.sfx.click(); if (b.onClick) { var keep = b.onClick(d); if (keep === true) return; } if (!b.keep) self.closeDialog(); });
      foot.appendChild(el);
    });
    var x = $('[data-close]', d);
    if (x) x.addEventListener('click', function () { self.closeDialog(); });
    if (opts.onOpen) opts.onOpen(d);
    var first = $('.dlg-foot button.primary', d);
    if (first && !opts.noFocus) setTimeout(function () { try { first.focus({ preventScroll: true }); } catch (e) { /* ok */ } }, 30);
  };
  P.closeDialog = function () {
    if (this.dialogTimer) { clearInterval(this.dialogTimer); this.dialogTimer = null; }
    this.dialog.classList.add('hidden');
    this.dialog.innerHTML = '';
    if (this.onDialogClose) { var f = this.onDialogClose; this.onDialogClose = null; f(); }
    this.afterOverlay();
  };

  // ------------------------------------------------------------------ Personer
  P.npcDialog = function (name) {
    var g = this.game, self = this;
    var cast = NV.people.CAST[name];
    var open = g.def ? g.def.tasks.filter(function (t) { return t.npc === name; }) : [];
    var html = '<div class="npc-role">' + esc(cast.role || '') + '</div>';
    if (!open.length) {
      var lines = (g.week === 10 && CHAT10[name]) || CHAT[name] || ['"Allt verkar lugnt här i dag."'];
      html += '<p class="quote">' + lines[(U.hash(name) + (g.week || 0) + Math.floor(g.state.time / 60)) % lines.length] + '</p>';
    }
    this.talkingTo = name;
    this.onDialogClose = function () { self.talkingTo = null; };
    open.forEach(function (t) {
      var s = g.taskState[t.id];
      if (!s.known) g.lastProgress = Date.now();
      s.known = true;
      if (s.reported) html += '<p class="quote">"Tack! Nu fungerar det igen."</p>';
      else if (s.fixed) html += '<p class="quote">"Det verkar fungera nu! Glöm inte att skriva felrapporten."</p>';
      else html += '<p class="quote">' + esc(t.ticket.replace(/^[^:]+:\s*/, '')) + '</p>';
    });
    this.renderHud();
    var buttons = [{ label: 'Okej, jag kollar', primary: true }];
    var unfixed = open.filter(function (t) { return !g.taskState[t.id].fixed; });
    if (unfixed.length && !g.exam) buttons.unshift({ label: 'Ledtråd', onClick: function () { setTimeout(function () { self.hintDialog(unfixed[0]); }, 10); } });
    this.showDialog({ title: esc(name), html: html, buttons: buttons });
  };

  // ------------------------------------------------------------------ Datorer
  P.pcDialog = function (id) {
    var g = this.game, self = this;
    var h = g.state.devices[id];
    var c = S.hostIpConf(h);
    var html = '<p><b>' + esc(h.label || id) + '</b></p><p class="muted">IPv4: ' + (c && c.ip ? esc(c.ip) : '–') + (h.nic.dhcp ? ' (DHCP)' : ' (statisk)') + '</p>';
    var buttons = [
      { label: 'Kommandotolken', primary: true, onClick: function () { setTimeout(function () { g.terminal.openWindows(id); }, 10); } },
      { label: 'Nätverksinställningar', onClick: function () { setTimeout(function () { self.ipv4Dialog(id); }, 10); } },
    ];
    if (id !== 'Gast-laptop') buttons.push({ label: 'Byt patchkabel', onClick: function () { g.replaceCable(id); } });
    this.showDialog({ title: 'Dator', html: html, buttons: buttons });
  };
  P.ipv4Dialog = function (id) {
    var g = this.game;
    var h = g.state.devices[id];
    var st = h.nic.static || {};
    var c = S.hostIpConf(h) || {};
    var html = '<p class="muted">Egenskaper för Internet Protocol version 4 (TCP/IPv4)</p>' +
      '<label class="radio"><input type="radio" id="f-dhcp" name="m" value="dhcp"' + (h.nic.dhcp ? ' checked' : '') + '> Erhåll en IP-adress automatiskt</label>' +
      '<label class="radio"><input type="radio" id="f-static" name="m" value="static"' + (!h.nic.dhcp ? ' checked' : '') + '> Använd följande IP-adress:</label>' +
      '<div class="grid2"><label for="f-ip">IP-adress:</label><input id="f-ip" value="' + esc(st.ip || c.ip || '') + '">' +
      '<label for="f-mask">Nätmask:</label><input id="f-mask" value="' + esc(st.mask || c.mask || '255.255.255.192') + '">' +
      '<label for="f-gw">Standardgateway:</label><input id="f-gw" value="' + esc(st.gw || c.gw || '') + '">' +
      '<label for="f-dns">Önskad DNS-server:</label><input id="f-dns" value="' + esc((st.dns && st.dns[0]) || (c.dns && c.dns[0]) || '') + '"></div>' +
      '<p class="err" id="f-err"></p>';
    var self = this;
    this.showDialog({
      title: 'Nätverksinställningar – ' + esc(h.label || id), html: html,
      buttons: [{ label: 'OK', primary: true, onClick: function (d) {
        var dhcp = $('input[name=m]:checked', d).value === 'dhcp';
        var v = { dhcp: dhcp, ip: $('#f-ip', d).value.trim(), mask: $('#f-mask', d).value.trim(), gw: $('#f-gw', d).value.trim(), dns: $('#f-dns', d).value.trim() };
        if (!dhcp) {
          if (!U.isIp(v.ip) || !U.isIp(v.mask) || !U.isValidMask(v.mask) || (v.gw && !U.isIp(v.gw)) || (v.dns && !U.isIp(v.dns))) { $('#f-err', d).textContent = 'Kontrollera fälten – adresserna skrivs som a.b.c.d och nätmasken måste vara giltig.'; return true; }
        }
        NV.applyIpv4(g.state, id, v);
        S.refresh(g.state);
        self.toast('Inställningarna för ' + esc(h.label || id) + ' har sparats.');
      } }, { label: 'Avbryt' }],
    });
  };

  // ------------------------------------------------------------------ Mobilen
  P.phoneDialog = function () {
    var g = this.game, self = this;
    var ph = g.state.devices['Gast-mobil'];
    var D = S.get(g.state);
    var w = g.state.devices.WLC.wlc;
    var anyAp = Object.keys(D.apJoined).some(function (a) { return D.apJoined[a]; });
    var ssids = anyAp ? Object.keys(w.wlans).filter(function (k) { return w.wlans[k].enabled; }).map(function (k) { return w.wlans[k].ssid; }) : [];
    var wifi = D.wifi['Gast-mobil'];
    var c = S.hostIpConf(ph);
    var html = '<div class="phone"><div class="phone-bar">Wi-Fi</div>';
    if (!ssids.length) html += '<p class="muted">Inga nätverk hittades.</p>';
    ssids.forEach(function (s) {
      var on = ph.ssid === s && wifi;
      html += '<div class="wifi-row' + (on ? ' on' : '') + '"><span>' + (on ? '✓ ' : '') + esc(s) + '</span><button data-ssid="' + esc(s) + '">' + (on ? 'Anslut igen' : 'Anslut') + '</button></div>';
    });
    if (ph.ssid && wifi) {
      html += '<div class="phone-info"><div>Nätverk: <b>' + esc(ph.ssid) + '</b></div><div>IP-adress: <b>' + esc(c && c.ip || '–') + '</b></div><div>Router: ' + esc(c && c.gw || '–') + '</div><div>Signal: ' + (wifi.interference ? 'svag, störningar' : 'utmärkt') + '</div></div>';
      html += '<button class="wide" data-web>Öppna www.example.com</button><div id="web-res" class="muted"></div>';
      html += '<button class="wide" data-scan>Sök efter enheter i nätet</button><div id="scan-res" class="muted"></div>';
    }
    html += '</div>';
    this.showDialog({
      title: 'Gästmobilen', html: html, buttons: [{ label: 'Lägg tillbaka' }],
      onOpen: function (d) {
        d.querySelectorAll('[data-ssid]').forEach(function (b) {
          b.addEventListener('click', function () {
            ph.ssid = b.getAttribute('data-ssid');
            S.touch(g.state);
            S.dhcp(g.state, 'Gast-mobil');
            S.refresh(g.state);
            self.phoneDialog();
          });
        });
        var web = $('[data-web]', d);
        if (web) web.addEventListener('click', function () {
          var r = S.resolve(g.state, 'Gast-mobil', 'www.example.com');
          var ok = !r.error && S.ping(g.state, 'Gast-mobil', r.ip, { proto: 'tcp', dport: 443 }).ok;
          $('#web-res', d).textContent = ok ? 'Sidan laddades. "Example Domain"' : 'Det gick inte att öppna sidan.';
        });
        var scan = $('[data-scan]', d);
        if (scan) scan.addEventListener('click', function () {
          var found = [];
          [['192.168.2.20', 'Lagerdatorn'], ['192.168.1.10', 'Filserver'], ['192.168.2.1', 'Router (lager)']].forEach(function (x) { if (S.ping(g.state, 'Gast-mobil', x[0]).ok) found.push(x[1] + ' (' + x[0] + ')'); });
          $('#scan-res', d).textContent = found.length ? 'Hittade: ' + found.join(', ') : 'Inga andra enheter syns.';
        });
      },
    });
  };

  // ------------------------------------------------------------------ Övervakning och tavla
  P.monitorDialog = function () {
    var g = this.game, self = this;
    var src = g.world.monitorCanvas();
    this.showDialog({
      title: 'Övervakningen', wide: true, html: '<canvas id="mon-copy" width="1024" height="576" style="width:100%;border-radius:8px"></canvas>' + (g.state.devices.LB || g.state.devices.R1.config.crypto ? '<div id="mon-vpn" class="mon-vpn"></div>' : '') + '<p class="muted small">Titta på grafen först, inte på enheten. En kurva som går rakt upp i taket är en loop. Sågtänder betyder en port som går upp och ner.</p>', buttons: [{ label: 'Stäng' }],
      onOpen: function (d) {
        var c = $('#mon-copy', d);
        var vp = $('#mon-vpn', d);
        function draw() { c.getContext('2d').drawImage(src, 0, 0); if (vp) vp.innerHTML = self.vpnPanel(); }
        draw();
        self.dialogTimer = setInterval(draw, 500);
      },
    });
  };
  // Kapitel 10: tunnelns och lastbalanserarens status, som på en riktig NOC-skärm
  P.vpnPanel = function () {
    var st = this.game.state, S = NV.sim;
    var html = '';
    if (st.devices.R1.config.crypto) {
      var cs = S.cryptoStatus(st, 'R1');
      var ike = cs.isakmp[0];
      html += '<div class="mv-box"><div class="mv-title">🔐 VPN Göteborg ↔ Borås</div><div class="mv-row"><span>Fas 1 (ISAKMP)</span><b class="' + (ike && ike.state === 'QM_IDLE' ? 'ok' : 'bad') + '">' + (ike ? ike.state : 'ingen') + '</b></div>';
      cs.sas.forEach(function (a) {
        var name = NV.sim.specNorm(a.rule.src).split('/')[0] + ' ↔ ' + NV.sim.specNorm(a.rule.dst).split('/')[0];
        html += '<div class="mv-row"><span>' + esc(name) + '</span><b class="' + (a.up ? 'ok' : 'bad') + '">' + (a.up ? 'SA uppe' : 'ingen SA') + '</b><small>⬆ ' + a.encaps + ' ⬇ ' + a.decaps + '</small></div>';
      });
      html += '</div>';
    }
    if (st.devices.LB && st.devices.LB.lb) {
      S.lbStatus(st, 'LB').forEach(function (p) {
        html += '<div class="mv-box"><div class="mv-title">⚖️ ' + esc(p.name) + ' · hälsokontroll ' + esc(p.pool.monitor) + '</div>';
        p.members.forEach(function (m) {
          html += '<div class="mv-row"><span>' + esc(m.m.name) + ' ' + esc(m.m.ip) + '</span><b class="' + (!m.m.enabled ? 'warn' : (m.up ? 'ok' : 'bad')) + '">' + (!m.m.enabled ? 'avstängd' : (m.up ? 'UP' : 'DOWN')) + '</b><small>' + m.req + ' förfr. · ' + m.fail + ' fel</small></div>';
        });
        html += '</div>';
      });
    }
    return html;
  };
  // Tavlan: veckans genomgång och frågesport
  P.whiteboardDialog = function () {
    var g = this.game, self = this;
    var st = NV.settings.store('krabba-passet.quiz') || {};
    var w = g.week || 1;
    this.showDialog({ title: 'Tavlan', html: '<p>På tavlan står veckans tema och en skiss över nätet. Vill du testa dig själv med tre frågor?</p>' + (st[w] ? '<p class="muted">Ditt bästa resultat för vecka ' + w + ': ' + st[w] + ' / 3</p>' : ''), buttons: [{ label: 'Frågesport', primary: true, onClick: function () { setTimeout(function () { self.quiz(w); }, 10); } }, { label: 'Läs tavlan', onClick: function () { setTimeout(function () { self.briefing(false); }, 10); } }, { label: 'Stäng' }] });
  };
  P.briefing = function (first) {
    var g = this.game;
    var def = g.def;
    var html = def ? '<p class="brief">' + esc(def.intro).replace(/\n/g, '<br>') + '</p><p class="muted">Kapitel ' + def.chapter + ' i kursboken. Den här veckan tränar du på:</p><ul>' + def.learn.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>'
      : '<p class="brief">Fri träning: Nordviks nät utan fel. Koppla in dig var du vill, bygg om och testa. Inget du gör här sparas.</p>';
    if (g.exam) html += '<div class="box fastnar"><div class="box-title">EXAMENSLÄGE</div>Inga ledtrådar och ingen guide. Tiden går från nu.</div>';
    var ch = def && !g.exam && NV.challenge ? NV.challenge.of(def.week) : null;
    if (ch) html += '<div class="box"><div class="box-title">VECKANS UTMANING 🏅</div>' + esc(ch.title) + (NV.challenge.done(def.week) ? ' <span class="muted">(redan klarad)</span>' : ' – ger 75 XP och en medalj.') + '</div>';
    if (def) html += '<p class="muted small">Väder i dag: ' + ({ sun: '☀️ sol', clouds: '⛅ molnigt', rain: '🌧️ regn' }[g.weather] || '☀️ sol') + '</p>';
    html += '<p class="muted small">Lösenord (står på lappen vid laptopen): enable <code>Krabba2026</code>, ssh <code>drift</code> / <code>Krabba2026</code>. Pilen högst upp visar vägen till nästa mål.</p>';
    this.showDialog({ title: first ? '🦀 Krabba-passet' : 'Tavlan', html: html, buttons: [{ label: first ? 'Sätt igång' : 'Stäng', primary: true }] });
  };

  // ------------------------------------------------------------------ Ledtrådar
  P.hintPicker = function () {
    var g = this.game, self = this;
    if (!g.def) { this.toast('Inga ärenden i fri träning.'); return; }
    if (g.exam) { this.toast('Inga ledtrådar i examensläget. Handboken (H) får du använda.', 'warn'); return; }
    var open = g.def.tasks.filter(function (t) { return !g.taskState[t.id].fixed && g.taskState[t.id].known; });
    if (!open.length) { this.toast('Prata med kollegorna (utropstecken) för att få veta vad som är fel.'); return; }
    if (open.length === 1) { this.hintDialog(open[0]); return; }
    this.showDialog({ title: 'Ledtråd', html: '<p>Vilket ärende vill du ha en ledtråd till? Varje ledtråd kan kosta en stjärna.</p>', buttons: open.map(function (t) { return { label: t.title, onClick: function () { setTimeout(function () { self.hintDialog(t); }, 10); } }; }) });
  };
  P.hintDialog = function (t) {
    var g = this.game, self = this;
    if (g.exam) { this.toast('Inga ledtrådar i examensläget.', 'warn'); return; }
    var s = g.taskState[t.id];
    var html = '<p class="muted">' + esc(t.ticket) + '</p><div class="box fastnar"><div class="box-title">FASTNAR DU HÄR?</div><ol>';
    t.hints.forEach(function (h, i) { html += '<li>' + (i < s.hints ? esc(h) : '<span class="muted">(dold ledtråd)</span>') + '</li>'; });
    html += '</ol></div><p class="muted small">Fler än två ledtrådar under veckan kostar en stjärna.</p>';
    var buttons = [];
    if (s.hints < t.hints.length) buttons.push({ label: 'Visa nästa ledtråd' + (NV.settings.get('difficulty') === 'easy' ? '' : ' (−15 XP)'), primary: true, onClick: function () { s.hints++; g.onHint(t); g.save(); setTimeout(function () { self.hintDialog(t); }, 10); } });
    buttons.push({ label: 'Stäng' });
    this.showDialog({ title: 'Ledtråd – ' + esc(t.title), html: html, buttons: buttons });
  };
  P.taskOverview = function () {
    var g = this.game, self = this;
    if (!g.def) { this.briefing(false); return; }
    var html = '<table class="tbl"><tr><th></th><th>Ärende</th><th>Från</th><th>Status</th><th></th></tr>';
    g.def.tasks.forEach(function (t) {
      var s = g.taskState[t.id];
      html += '<tr><td>' + (t.krabba ? '🦀' : '💬') + '</td><td>' + esc(s.known ? t.title : '???') + '</td><td>' + esc(t.npc) + '</td><td>' + (s.reported ? 'Klar (' + s.score + '/2)' : (s.fixed ? 'Löst – skriv rapport' : 'Öppen')) + '</td><td>' + (s.reported ? '<button data-rep="' + t.id + '">Visa rapport</button>' : '') + '</td></tr>';
    });
    html += '</table><p class="muted small">Utropstecken över en person betyder att hen har ett ärende. Krabba-felen hittar du genom att lyssna på kollegorna och felsöka.</p>';
    this.showDialog({
      title: 'Ärenden – vecka ' + g.def.week, html: html, buttons: [{ label: 'Kopiera felrapport.md', onClick: function () { g.copyReport(); return true; } }, { label: 'Stäng', primary: true }],
      onOpen: function (d) { d.querySelectorAll('[data-rep]').forEach(function (b) { b.addEventListener('click', function () { var t = g.def.tasks.filter(function (x) { return x.id === b.getAttribute('data-rep'); })[0]; self.reportView(t); }); }); },
    });
  };
  P.reportView = function (t) {
    var r = this.game.taskState[t.id].report || {};
    var html = '<dl class="rep"><dt>Vad vi såg</dt><dd>' + esc(r.saw || '–') + '</dd><dt>Vad vi trodde först</dt><dd>' + esc(r.first || '–') + '</dd><dt>Vad vi kontrollerade</dt><dd><pre>' + esc(r.checked || '–') + '</pre></dd><dt>Vad felet var</dt><dd>' + esc(r.cause || '') + '</dd><dt>Hur det skulle rättas</dt><dd>' + esc(r.fix || '') + '</dd></dl>';
    this.showDialog({ title: 'Felrapport – ' + esc(t.title), html: html, wide: true, buttons: [{ label: 'Tillbaka', primary: true, onClick: function () { var s = this; setTimeout(function () { NV.game.ui.taskOverview(); }, 10); } }] });
  };

  // ------------------------------------------------------------------ Felrapport
  P.reportPicker = function () {
    var g = this.game, self = this;
    if (!g.def) { this.toast('Felrapporter skrivs bara under Krabba-passen.'); return; }
    var ready = g.def.tasks.filter(function (t) { return g.taskState[t.id].fixed && !g.taskState[t.id].reported; });
    if (!ready.length) { this.toast('Inget ärende är löst ännu. Lös ett fel först, sedan skriver du rapporten här.'); return; }
    if (ready.length === 1) { this.reportDialog(ready[0]); return; }
    this.showDialog({ title: 'Felrapport', html: '<p>Vilket fel vill du rapportera?</p>', buttons: ready.map(function (t) { return { label: t.title, onClick: function () { setTimeout(function () { self.reportDialog(t); }, 10); } }; }) });
  };
  function shuffled(arr, seed) {
    var a = arr.map(function (x, i) { return { x: x, i: i, k: U.hash(seed + x) }; });
    a.sort(function (p, q) { return p.k - q.k; });
    return a;
  }
  P.reportDialog = function (t) {
    var g = this.game, self = this;
    var checked = g.commandsFor(t).slice(-8).join('\n');
    var html = '<p class="muted">Felrapport enligt Krabba-passets fem fält: vad du såg, vad du trodde först, vad du kontrollerade, vad felet var och hur det skulle rättas.</p>' +
      '<label for="r1">1. Vad såg du?</label><textarea id="r1" rows="2" placeholder="Symptomet, t.ex. vad användaren sa och vad en show-utskrift visade">' + esc(t.ticket.replace(/^[^:]+:\s*/, '').replace(/"/g, '')) + '</textarea>' +
      '<label for="r2">2. Vad trodde du först?</label><textarea id="r2" rows="2" placeholder="Din första hypotes"></textarea>' +
      '<label for="r3">3. Vad kontrollerade du?</label><textarea id="r3" rows="4">' + esc(checked) + '</textarea>' +
      '<fieldset><legend>4. Vad var felet?</legend>' + shuffled(t.report.cause, t.id).map(function (o) { return '<label class="radio"><input type="radio" id="c' + o.i + '" name="cause" value="' + o.i + '"> ' + esc(o.x) + '</label>'; }).join('') + '</fieldset>' +
      '<fieldset><legend>5. Hur skulle det rättas?</legend>' + shuffled(t.report.fix, t.id + 'f').map(function (o) { return '<label class="radio"><input type="radio" id="x' + o.i + '" name="fix" value="' + o.i + '"> ' + esc(o.x) + '</label>'; }).join('') + '</fieldset>' +
      '<p class="err" id="r-err"></p>';
    this.showDialog({
      title: 'Felrapport – ' + esc(t.title), html: html, wide: true, noFocus: true,
      buttons: [{ label: 'Lämna in', primary: true, onClick: function (d) {
        var c = $('input[name=cause]:checked', d), f = $('input[name=fix]:checked', d);
        if (!c || !f) { $('#r-err', d).textContent = 'Välj ett svar på fråga 4 och 5.'; return true; }
        var res = { saw: $('#r1', d).value, first: $('#r2', d).value, checked: $('#r3', d).value, cause: t.report.cause[+c.value], fix: t.report.fix[+f.value], score: (c.value === '0' ? 1 : 0) + (f.value === '0' ? 1 : 0) };
        g.submitReport(t, res);
        setTimeout(function () { self.reportFeedback(t, res); }, 10);
      } }, { label: 'Senare' }],
    });
  };
  // Återkoppling: rätt svar och hur felet löses
  P.reportFeedback = function (t, r) {
    var okC = r.cause === t.report.cause[0], okF = r.fix === t.report.fix[0];
    var html = '<div class="fb ' + (okC ? 'ok' : 'no') + '"><b>' + (okC ? '✔' : '✘') + ' Vad felet var:</b> ' + esc(t.report.cause[0]) + (okC ? '' : '<br><span class="muted">Du svarade: ' + esc(r.cause) + '</span>') + '</div>' +
      '<div class="fb ' + (okF ? 'ok' : 'no') + '"><b>' + (okF ? '✔' : '✘') + ' Hur det skulle rättas:</b> ' + esc(t.report.fix[0]) + (okF ? '' : '<br><span class="muted">Du svarade: ' + esc(r.fix) + '</span>') + '</div>' +
      '<div class="box"><div class="box-title">SÅ HÄR LÖSER DU DET</div><p>' + esc(t.hints[1]) + '</p><p>' + esc(t.hints[2]) + '</p></div>';
    this.showDialog({ title: (okC && okF ? 'Helt rätt!' : 'Rapporten är inlämnad'), html: html, buttons: [{ label: 'Fortsätt', primary: true }] });
  };

  // ------------------------------------------------------------------ Handbok
  P.handbook = function (tab) {
    var self = this;
    var tabs = [['cmd', 'Kommandon'], ['mine', 'Mina kommandon'], ['fel', 'Felbibliotek'], ['plan', 'Adressplan'], ['calc', 'Subnätsräknare'], ['vpn', 'VPN och LB'], ['osi', 'OSI-modellen'], ['ord', 'Ordlista'], ['keys', 'Styrning']];
    tab = tab || this.lastTab || 'cmd';
    this.lastTab = tab;
    var html = '<div class="tabs">' + tabs.map(function (t) { return '<button data-tab="' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      (tab !== 'calc' ? '<input id="hb-search" class="search" placeholder="Sök i ' + tabs.filter(function (t) { return t[0] === tab; })[0][1].toLowerCase() + '…" autocomplete="off">' : '') +
      '<div class="tab-body">' + NV.handbook[tab]() + '</div>';
    this.showDialog({
      title: 'Handbok', html: html, wide: true, buttons: [{ label: 'Stäng', primary: true }], noFocus: true,
      onOpen: function (d) {
        d.querySelectorAll('[data-tab]').forEach(function (b) { b.addEventListener('click', function () { self.handbook(b.getAttribute('data-tab')); }); });
        var s = $('#hb-search', d);
        if (s) s.addEventListener('input', function () {
          var q = s.value.toLowerCase();
          d.querySelectorAll('.tab-body tr').forEach(function (tr, i) { if (tr.querySelector('th')) return; tr.style.display = !q || tr.textContent.toLowerCase().indexOf(q) >= 0 ? '' : 'none'; });
          d.querySelectorAll('.tab-body .osi-layer').forEach(function (el) { el.style.display = !q || el.textContent.toLowerCase().indexOf(q) >= 0 ? '' : 'none'; });
        });
        if (tab === 'calc') {
          NV.handbook.bindCalc(d);
          var tb = document.createElement('div'); tb.className = 'trainer'; tb.innerHTML = '<h3>Subnätsträning</h3><p class="muted small">Slumpade frågor om nätverksadress, broadcast, antal värdar och nätmask. Svara och tryck Enter.</p><button class="primary" id="sn-go">Starta träning</button>';
          $('.tab-body', d).appendChild(tb);
          $('#sn-go', d).addEventListener('click', function () { self.subnetTrainer(tb); });
        }
        if (tab === 'mine') d.querySelectorAll('[data-cmd]').forEach(function (b) { b.addEventListener('click', function () { self.copyText(b.getAttribute('data-cmd')); }); });
      },
    });
  };

  // ------------------------------------------------------------------ Karta
  P.mapDialog = function () {
    var g = this.game, self = this;
    var site = g.world.site;
    var b = g.world.builder;
    var bounds = site === 'boras' ? { x0: 86, x1: 114, z0: -14, z1: 14 } : { x0: -16, x1: 16, z0: -11, z1: 11 };
    var zones = b.zones.filter(function (z) { return z.site === site; });
    var html = '<p class="muted small">Klicka på kartan för att sätta en egen markering som pilen leder dig till.</p><canvas id="map-cv" width="960" height="' + Math.round(960 * (bounds.z1 - bounds.z0) / (bounds.x1 - bounds.x0)) + '" style="width:100%;border-radius:10px;background:#1b2229"></canvas><div class="map-go">' +
      zones.map(function (z, i) { return '<button data-zone="' + i + '">Gå till ' + esc(z.name.toLowerCase()) + '</button>'; }).join('') +
      '<button data-site="' + (site === 'boras' ? 'gbg' : 'boras') + '">' + (site === 'boras' ? 'Åk till Göteborg' : 'Åk till Borås') + '</button></div>';
    this.showDialog({
      title: 'Karta – ' + (site === 'boras' ? 'lagret i Borås' : 'huvudkontoret i Göteborg'), html: html, wide: true, buttons: [{ label: 'Stäng', primary: true }],
      onOpen: function (d) {
        var cv = $('#map-cv', d), gg = cv.getContext('2d');
        var sc = cv.width / (bounds.x1 - bounds.x0);
        function X(x) { return (x - bounds.x0) * sc; }
        function Y(z) { return (bounds.z1 - z) * sc; }
        function draw() {
          gg.fillStyle = '#1b2229'; gg.fillRect(0, 0, cv.width, cv.height);
          var fc = { carpet: '#4a5570', wood: '#9a6a3c', raised: '#9aa3ad', concrete: '#7c7a74', concreteDark: '#6a6c6e' };
          b.sem.forEach(function (r) { if (r.type === 'floor' && (r.x1 > 50) === (site === 'boras')) { gg.fillStyle = fc[r.tex] || '#666'; gg.fillRect(X(r.x1), Y(r.z2), (r.x2 - r.x1) * sc, (r.z2 - r.z1) * sc); } });
          b.sem.forEach(function (r) {
            if ((r.type === 'box' && r.collide && r.h > 0.3 && r.y - r.h / 2 < 0.5) && (r.x > 50) === (site === 'boras')) { gg.fillStyle = 'rgba(255,255,255,0.18)'; gg.fillRect(X(r.x - r.w / 2), Y(r.z + r.d / 2), r.w * sc, r.d * sc); }
            if ((r.type === 'wall' || r.type === 'glass') && (r.fixed > 50 || r.a > 50) === (site === 'boras')) {
              gg.strokeStyle = r.type === 'glass' ? '#8fd0e6' : '#e8e0cc'; gg.lineWidth = 4;
              var cur = r.a, segs = [];
              (r.doors || []).forEach(function (dd) { segs.push([cur, dd[0]]); cur = dd[1]; });
              segs.push([cur, r.b]);
              segs.forEach(function (sg) { gg.beginPath(); if (r.axis === 'x') { gg.moveTo(X(sg[0]), Y(r.fixed)); gg.lineTo(X(sg[1]), Y(r.fixed)); } else { gg.moveTo(X(r.fixed), Y(sg[0])); gg.lineTo(X(r.fixed), Y(sg[1])); } gg.stroke(); });
            }
          });
          gg.font = 'bold 16px "Segoe UI", sans-serif'; gg.textAlign = 'center';
          zones.forEach(function (z) { if (z.name === 'Lagret i Borås') return; gg.fillStyle = 'rgba(255,255,255,0.75)'; gg.fillText(z.name, X((z.minX + z.maxX) / 2), Y((z.minZ + z.maxZ) / 2)); });
          // Kollegor med ärenden
          Object.keys(g.world.people).forEach(function (n) {
            var c = NV.people.CAST[n];
            if (c.site !== site) return;
            var A = b.anchors;
            var p = c.desk ? { x: A.desks[c.desk].x, z: A.desks[c.desk].z + 0.8 } : c.stand;
            var f = g.world.people[n];
            gg.fillStyle = f.marker.visible ? '#f0b429' : (f.done.visible ? '#3fbf6f' : '#9aa6b2');
            gg.beginPath(); gg.arc(X(p.x), Y(p.z), f.marker.visible ? 8 : 5, 0, Math.PI * 2); gg.fill();
            gg.fillStyle = '#fff'; gg.font = '13px "Segoe UI", sans-serif'; gg.fillText(n + (f.marker.visible ? ' !' : ''), X(p.x), Y(p.z) - 12);
          });
          // Du
          var px = X(g.world.pos.x), py = Y(g.world.pos.z);
          gg.fillStyle = '#ff5a4f'; gg.beginPath(); gg.arc(px, py, 9, 0, Math.PI * 2); gg.fill();
          gg.strokeStyle = '#fff'; gg.lineWidth = 3; gg.beginPath(); gg.moveTo(px, py);
          gg.lineTo(px - Math.sin(g.world.yaw) * 22, py + Math.cos(g.world.yaw) * 22); gg.stroke();
          gg.fillStyle = '#fff'; gg.fillText('Du', px, py + 26);
          if (g.crab && g.crab.active && g.crab.site === site && Math.hypot(g.crab.x - g.world.pos.x, g.crab.z - g.world.pos.z) < 7) { gg.font = '20px sans-serif'; gg.fillText('🦀', X(g.crab.x), Y(g.crab.z) + 6); }
          if (g.waypoint) { gg.fillStyle = '#4fc3f7'; gg.beginPath(); gg.arc(X(g.waypoint.x), Y(g.waypoint.z), 7, 0, Math.PI * 2); gg.fill(); gg.fillStyle = '#fff'; gg.font = '13px "Segoe UI", sans-serif'; gg.fillText('Markering', X(g.waypoint.x), Y(g.waypoint.z) - 12); }
          var o = g.objective();
          if (o) { gg.strokeStyle = '#f0b429'; gg.setLineDash([6, 6]); gg.beginPath(); gg.moveTo(px, py); gg.lineTo(X(o.x), Y(o.z)); gg.stroke(); gg.setLineDash([]); }
        }
        draw();
        self.dialogTimer = setInterval(draw, 400);
        cv.style.cursor = 'crosshair';
        cv.addEventListener('click', function (e) {
          var r = cv.getBoundingClientRect();
          var x = bounds.x0 + (e.clientX - r.left) / r.width * cv.width / sc, z = bounds.z1 - (e.clientY - r.top) / r.height * cv.height / sc;
          g.setWaypoint(x, z); draw();
        });
        d.querySelectorAll('[data-zone]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var z = zones[+btn.getAttribute('data-zone')];
            var spot = self.freeSpot(z);
            self.closeDialog();
            self.fadeTo(function () { g.world.pos.x = spot.x; g.world.pos.z = spot.z; if (g.world.cam) g.world.cam = null; });
          });
        });
        var sb = $('[data-site]', d);
        sb.addEventListener('click', function () { var to = sb.getAttribute('data-site'); self.closeDialog(); g.onInteract({ type: 'travel', to: to, label: '' }); });
      },
    });
  };
  // Hitta en ledig plats i ett rum att snabbresa till
  P.freeSpot = function (z) {
    var w = this.game.world;
    var cx = (z.minX + z.maxX) / 2, cz = (z.minZ + z.maxZ) / 2;
    for (var r = 0; r < 6; r += 0.5) for (var a = 0; a < Math.PI * 2; a += 0.6) {
      var x = cx + Math.cos(a) * r, zz = cz + Math.sin(a) * r;
      if (x > z.minX + 0.5 && x < z.maxX - 0.5 && zz > z.minZ + 0.5 && zz < z.maxZ - 0.5 && !w.collides(x, zz, 0.35)) return { x: x, z: zz };
    }
    return { x: cx, z: cz };
  };

  // ------------------------------------------------------------------ Rackvy
  P.rackView = function (id) {
    var g = this.game, self = this;
    var specs = rackSpecs(g)[id];
    if (!specs) return;
    var title = { A: 'Rack A – nät', B: 'Rack B – servrar', BO: 'Lagrets rack' }[id];
    var html = '<p class="muted small">Frontpanelerna på nära håll. Håll musen över en port för att se status. Klicka på en nätverksenhet för att sätta i konsolkabeln.</p><div class="rack-view"></div><div class="rack-info" id="rack-info">&nbsp;</div>';
    var buttons = [];
    if (id === 'A') {
      var l25 = g.state.links.filter(function (l) { return l.a.dev === 'SW1' && l.a.port === 'GigabitEthernet0/25'; })[0];
      if (l25) buttons.push({ label: l25.state === 'unplugged' ? 'Sätt tillbaka reservkabeln Gi0/25' : 'Dra ur reservkabeln Gi0/25', onClick: function () { g.toggleLink(l25.id); setTimeout(function () { self.rackView(id); }, 10); } });
    }
    buttons.push({ label: 'Stäng', primary: true });
    this.showDialog({
      title: title, html: html, wide: true, buttons: buttons,
      onOpen: function (d) {
        var box = $('.rack-view', d), info = $('#rack-info', d);
        var fps = specs.map(function (sp) {
          var fp = new NV.devices3d.Faceplate(sp);
          var wrap = document.createElement('div');
          wrap.className = 'rack-unit' + (sp.devId ? ' can' : '');
          fp.canvas.style.width = '100%';
          fp.canvas.style.display = 'block';
          wrap.appendChild(fp.canvas);
          box.appendChild(wrap);
          fp.canvas.addEventListener('mousemove', function (e) {
            var r = fp.canvas.getBoundingClientRect();
            var px = (e.clientX - r.left) / r.width * 1024, py = (e.clientY - r.top) / r.height * fp.ch;
            var txt = null;
            Object.keys(fp.ports).forEach(function (n) { var q = fp.ports[n]; if (px >= q.x - 4 && px <= q.x + q.w + 4 && py >= q.y - 10 && py <= q.y + q.h + 10) txt = sp.devId ? NV.shared.portInfo(g.state, sp.devId, n) : n; });
            if (!txt && fp.console && px >= fp.console.x - 6 && px <= fp.console.x + fp.console.w + 6 && py >= fp.console.y - 6 && py <= fp.console.y + fp.console.h + 12) txt = 'Konsolporten – klicka för att koppla in';
            info.textContent = txt || (sp.devId ? (sp.sticker() + ' – klicka för konsol') : sp.sticker());
          });
          fp.canvas.addEventListener('click', function () {
            if (!sp.devId) return;
            self.closeDialog();
            g.onInteract({ type: 'console', id: sp.devId });
          });
          return { fp: fp, sp: sp };
        });
        function draw() {
          fps.forEach(function (o) {
            var fn = o.sp.devId && g.state.devices[o.sp.devId].os === 'ios' ? NV.shared.ledFn(g.state, o.sp.devId) : (o.sp.devId || o.sp.led ? NV.shared.ledFn(g.state, o.sp.devId || o.sp.led) : null);
            o.fp.draw(fn, performance.now() / 1000);
          });
        }
        draw();
        self.dialogTimer = setInterval(draw, 200);
      },
    });
  };

  // ------------------------------------------------------------------ Inställningar
  P.settingsDialog = function () {
    var g = this.game, self = this;
    var s = NV.settings;
    var html = '<div class="set-grid">' +
      '<span>Visning</span><div class="seg"><button data-mode="3d" class="' + (g.mode === '3d' ? 'on' : '') + '"' + (g.webgl ? '' : ' disabled') + '>3D</button><button data-mode="2d" class="' + (g.mode === '2d' ? 'on' : '') + '">2D (16-bit)</button></div>' +
      '<label for="s-sens">Muskänslighet</label><input type="range" id="s-sens" min="0.2" max="3" step="0.1" value="' + s.get('sens') + '">' +
      '<label for="s-inv">Invertera Y-axeln</label><input type="checkbox" id="s-inv"' + (s.get('invertY') ? ' checked' : '') + '>' +
      '<label for="s-fov">Synvinkel (FOV)</label><input type="range" id="s-fov" min="55" max="95" step="1" value="' + s.get('fov') + '">' +
      '<label for="s-bob">Gungande kamera</label><input type="checkbox" id="s-bob"' + (s.get('bob') ? ' checked' : '') + '>' +
      '<label for="s-q">Grafik (3D)</label><select id="s-q">' + [['auto', 'Automatiskt' + (NV.gfx.auto ? ' (' + NV.gfx.NAMES[NV.gfx.auto.level].split(' (')[0].toLowerCase() + ')' : '')]].concat(NV.gfx.LEVELS.slice().reverse().map(function (l) { return [l, NV.gfx.NAMES[l]]; })).map(function (x) { return '<option value="' + x[0] + '"' + ((s.get('quality') || 'auto') === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select>' +
      '<label for="s-cap">Max bildfrekvens</label><select id="s-cap">' + [[0, 'Obegränsad'], [60, '60 bilder/s'], [30, '30 bilder/s (sparar batteri)']].map(function (x) { return '<option value="' + x[0] + '"' + (+s.get('fpsCap') === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select>' +
      '<label for="s-post">Efterbehandling (glöd, vinjett, färgton)</label><input type="checkbox" id="s-post"' + (s.get('post') ? ' checked' : '') + '>' +
      '<label for="s-part">Partiklar</label><input type="checkbox" id="s-part"' + (s.get('particles') ? ' checked' : '') + '>' +
      '<label for="s-smooth">Mjuk musrörelse</label><input type="checkbox" id="s-smooth"' + (s.get('smooth') ? ' checked' : '') + '>' +
      '<label for="s-fps">Visa bildfrekvens</label><input type="checkbox" id="s-fps"' + (s.get('showFps') ? ' checked' : '') + '>' +
      '<span>Svårighetsgrad</span><div class="seg" id="s-diff">' + [['easy', 'Lätt'], ['normal', 'Normal'], ['hard', 'Svår']].map(function (x) { return '<button data-diff="' + x[0] + '" class="' + (s.get('difficulty') === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      '<label for="s-mini">Minikarta (K)</label><input type="checkbox" id="s-mini"' + (s.get('minimap') ? ' checked' : '') + '>' +
      '<label for="s-music">Bakgrundsmusik</label><input type="checkbox" id="s-music"' + (s.get('music') ? ' checked' : '') + '>' +
      '<label for="s-mvol">Musikvolym</label><input type="range" id="s-mvol" min="0" max="1" step="0.05" value="' + s.get('musicVol') + '">' +
      '<label for="s-theme">Terminalens utseende</label><select id="s-theme">' + [['auto', 'Automatiskt (pixel i 2D)'], ['classic', 'Klassiskt'], ['green', 'Grön fosfor'], ['amber', 'Bärnsten'], ['snes', 'Pixel (16-bit)']].map(function (x) { return '<option value="' + x[0] + '"' + (s.get('termTheme') === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select>' +
      '<label for="s-snd">Ljud</label><input type="checkbox" id="s-snd"' + (s.get('sound') ? ' checked' : '') + '>' +
      '<label for="s-vol">Volym</label><input type="range" id="s-vol" min="0" max="1" step="0.05" value="' + s.get('volume') + '">' +
      '<label for="s-type">Tangentljud i terminalen</label><input type="checkbox" id="s-type"' + (s.get('typeSound') ? ' checked' : '') + '>' +
      '<label for="s-font">Terminalens textstorlek</label><input type="range" id="s-font" min="11" max="20" step="1" value="' + s.get('termFont') + '">' +
      '<label for="s-zoom">Pixelzoom (2D, 0 = auto)</label><input type="range" id="s-zoom" min="0" max="7" step="1" value="' + s.get('zoom2d') + '">' +
      '</div><p class="muted small">Grafikläge och efterbehandling ändras när sidan laddas om. Allt annat gäller direkt. Lätt: ledtrådar kostar inga poäng. Svår: ingen pil, markör eller utropstecken – men 50 % mer XP.</p>';
    this.showDialog({
      title: 'Inställningar', html: html, buttons: [{ label: 'Klar', primary: true }],
      onOpen: function (d) {
        function bind(id, key, conv) { var el = $('#' + id, d); el.addEventListener('input', function () { s.set(key, conv(el)); if (key === 'termFont') g.terminal.applyFont(); }); }
        bind('s-sens', 'sens', function (e) { return +e.value; });
        bind('s-inv', 'invertY', function (e) { return e.checked; });
        bind('s-fov', 'fov', function (e) { return +e.value; });
        bind('s-bob', 'bob', function (e) { return e.checked; });
        bind('s-q', 'quality', function (e) { return e.value; });
        bind('s-snd', 'sound', function (e) { return e.checked; });
        bind('s-vol', 'volume', function (e) { return +e.value; });
        bind('s-type', 'typeSound', function (e) { return e.checked; });
        bind('s-font', 'termFont', function (e) { return +e.value; });
        bind('s-zoom', 'zoom2d', function (e) { return +e.value; });
        bind('s-post', 'post', function (e) { return e.checked; });
        bind('s-cap', 'fpsCap', function (e) { return +e.value; });
        $('#s-q', d).addEventListener('change', function () { self.reloadOffer(); });
        bind('s-part', 'particles', function (e) { return e.checked; });
        bind('s-smooth', 'smooth', function (e) { return e.checked; });
        bind('s-fps', 'showFps', function (e) { return e.checked; });
        bind('s-mini', 'minimap', function (e) { return e.checked; });
        bind('s-music', 'music', function (e) { NV.sfx.unlock(); setTimeout(function () { NV.sfx.music(); }, 0); return e.checked; });
        bind('s-mvol', 'musicVol', function (e) { return +e.value; });
        bind('s-theme', 'termTheme', function (e) { return e.value; });
        d.querySelectorAll('[data-diff]').forEach(function (b) { b.addEventListener('click', function () { s.set('difficulty', b.getAttribute('data-diff')); g.refreshMarkers(); self.settingsDialog(); }); });
        d.querySelectorAll('[data-mode]').forEach(function (b) { b.addEventListener('click', function () { g.setMode(b.getAttribute('data-mode')); self.settingsDialog(); }); });
      },
    });
  };

  // ------------------------------------------------------------------ Anteckningar, notiser, hjälp
  P.notesDialog = function () {
    var txt = NV.settings.store('krabba-passet.notes') || '';
    this.showDialog({
      title: 'Anteckningar', html: '<p class="muted small">Dina egna anteckningar – som dagbok.md. De sparas i webbläsaren.</p><textarea id="notes" rows="14" placeholder="Vad fastnade du på? Vilka kommandon vill du komma ihåg?">' + esc(txt) + '</textarea>', wide: true, noFocus: true,
      buttons: [{ label: 'Kopiera', onClick: function (d) { NV.game.ui.copyText($('#notes', d).value); return true; } }, { label: 'Spara och stäng', primary: true, onClick: function (d) { NV.settings.store('krabba-passet.notes', $('#notes', d).value); } }],
      onOpen: function (d) { var t = $('#notes', d); t.addEventListener('input', function () { NV.settings.store('krabba-passet.notes', t.value); }); setTimeout(function () { t.focus(); }, 30); },
    });
  };
  P.logDialog = function () {
    var html = this.log.length ? '<ul class="loglist">' + this.log.slice().reverse().map(function (l) { return '<li class="' + (l.kind || '') + '"><span class="muted">' + esc(l.t) + '</span> ' + l.msg + '</li>'; }).join('') + '</ul>' : '<p class="muted">Inga notiser ännu.</p>';
    this.showDialog({ title: 'Notiser', html: html, buttons: [{ label: 'Stäng', primary: true }] });
  };
  P.helpDialog = function () {
    this.showDialog({ title: 'Hjälp', html: NV.handbook.keys(), wide: true, buttons: [{ label: 'Stäng', primary: true }] });
  };

  // ------------------------------------------------------------------ Meny
  P.showMenu = function () {
    var g = this.game, self = this;
    this.game.world.unlock();
    this.hidePause();
    var prog = g.progress();
    var saved = g.savedRun();
    var html = '<div class="menu-inner"><div class="logo">🦀</div><h1>Krabba-passet</h1><p class="tag">Du är nätverkstekniker på Nordvik. Varje vecka gör Krabban sönder något i racket – hitta felen, rätta dem och skriv felrapporter.</p>' +
      '<div class="mode-pick"><span>Välj visning:</span><div class="seg big"><button data-mode="3d" class="' + (g.mode === '3d' ? 'on' : '') + '"' + (g.webgl ? '' : ' disabled title="WebGL saknas"') + '><b>3D</b><small>förstaperson</small></button><button data-mode="2d" class="' + (g.mode === '2d' ? 'on' : '') + '"><b>2D</b><small>16-bitars pixelvärld</small></button></div></div>';
    var rk = NV.career.rank();
    html += '<div class="menu-rank"><span>🏅 <b>' + esc(rk.name) + '</b> · ' + rk.xp + ' XP · ' + NV.career.unlockedCount() + '/' + NV.career.ACH.length + ' prestationer</span><button data-ach>Karriär (J)</button></div>';
    if (saved && !(g.running && g.week === saved.week)) html += '<div class="menu-row"><button class="primary" data-continue>Fortsätt vecka ' + saved.week + ' (' + fmtTime(saved.elapsed || 0) + ')</button></div>';
    html += '<div class="weeks">';
    NV.levels.WEEKS.forEach(function (w) {
      var p = prog.weeks[w.week];
      var stars = p ? '★★★'.slice(0, p.stars) + '☆☆☆'.slice(p.stars) : '';
      html += '<button class="week' + (p ? ' done' : '') + '" data-week="' + w.week + '"><span class="wn">Vecka ' + w.week + '</span><span class="wt">' + esc(w.title) + '</span><span class="wl">' + esc(w.learn.slice(0, 2).join(' · ')) + '</span><span class="ws">' + stars + (p && p.minutes ? ' <span class="muted">bästa ' + p.minutes + ' min</span>' : '') + (p && p.badges && p.badges.length ? ' <span class="muted">· ' + p.badges.length + ' utm.</span>' : '') + '</span></button>';
    });
    html += '</div><div class="menu-row"><button data-week="0">Fri träning (inga fel)</button><button data-exam>Examen (slumpad vecka, inga ledtrådar)</button><button data-settings>Inställningar</button>' + (g.running ? '<button class="primary" data-resume>Tillbaka till spelet</button>' : '') + '</div>' +
      '<p class="tip">💡 ' + esc(TIPS[Math.floor(Math.random() * TIPS.length)]) + '</p>' +
      '<p class="muted small">Byggt för kursen Nätverksteknik. Utrustningen och Nordviks adressplan följer kursboken; felen kommer från bokens avsnitt "Så ser det ut när det är trasigt". Spelet kräver tangentbord – och mus i 3D.</p></div>';
    this.menu.innerHTML = html;
    this.menu.classList.remove('hidden');
    function start(n, opts) {
      function go() { self.hideMenu(); g.startWeek(n, opts); }
      if (g.running && g.def && !g.done && (g.def.week !== n || opts)) {
        self.showDialog({ title: 'Lämna veckan?', html: '<p>Du är mitt i vecka ' + g.def.week + '. Den sparas automatiskt, så du kan fortsätta senare från menyn.</p>', buttons: [{ label: 'Byt vecka', primary: true, onClick: function () { g.saveRun(); setTimeout(go, 10); } }, { label: 'Avbryt' }] });
        return;
      }
      go();
    }
    this.menu.querySelectorAll('[data-week]').forEach(function (b) { b.addEventListener('click', function () { NV.sfx.unlock(); start(parseInt(b.getAttribute('data-week'), 10)); }); });
    this.menu.querySelectorAll('[data-mode]').forEach(function (b) { b.addEventListener('click', function () { g.setMode(b.getAttribute('data-mode')); self.showMenu(); }); });
    var ex = $('[data-exam]', this.menu);
    if (ex) ex.addEventListener('click', function () { start(NV.levels.WEEKS[Math.floor(Math.random() * NV.levels.WEEKS.length)].week, { exam: true }); });
    var c = $('[data-continue]', this.menu);
    if (c) c.addEventListener('click', function () { self.hideMenu(); g.resumeRun(); self.afterOverlay(); });
    var ac = $('[data-ach]', this.menu);
    if (ac) ac.addEventListener('click', function () { self.achievementsDialog(); });
    var st = $('[data-settings]', this.menu);
    if (st) st.addEventListener('click', function () { self.settingsDialog(); });
    var r = $('[data-resume]', this.menu);
    if (r) r.addEventListener('click', function () { self.hideMenu(); self.afterOverlay(); });
  };
  P.hideMenu = function () { this.menu.classList.add('hidden'); };

  P.weekDone = function (res) {
    var g = this.game, self = this;
    var html = '<div class="done-stars">' + '★★★'.slice(0, res.stars) + '<span class="muted">' + '☆☆☆'.slice(res.stars) + '</span></div>' +
      '<p>Du löste alla ärenden på <b>' + res.minutes + ' min</b> med <b>' + res.commands + '</b> kommandon och <b>' + res.hints + '</b> ledtrådar.</p>' +
      '<p>Felrapporterna: <b>' + res.reportScore + ' av ' + res.reportMax + '</b> rätt.</p>' +
      '<p>Du tjänade <b>' + Math.max(0, g.weekXp || 0) + ' XP</b> den här veckan och är nu <b>' + esc(NV.career.rank().name) + '</b>.</p>' +
      (res.badges.length ? '<p>Utmärkelser: ' + res.badges.map(function (b) { return '<span class="badge">' + esc(b) + '</span>'; }).join(' ') + '</p>' : '') +
      '<p class="muted">Kopiera felrapport.md och lägg den i veckans mapp i ditt repo, precis som efter ett riktigt Krabba-pass.</p>';
    this.showDialog({
      title: 'Vecka ' + g.def.week + ' klar!', html: html,
      buttons: [{ label: 'Kopiera felrapport.md', onClick: function () { g.copyReport(); return true; } }, { label: 'Ladda ned', onClick: function () { g.downloadReport(); return true; } }, { label: 'Till menyn', primary: true, onClick: function () { setTimeout(function () { self.showMenu(); }, 10); } }, { label: 'Stanna kvar' }],
    });
  };

  return UI;
})();
