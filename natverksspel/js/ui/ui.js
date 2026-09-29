// Gränssnittet: HUD, dialoger, felrapport, handbok, meny.
NV.UI = (function () {
  var S = NV.sim, U = NV.util;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function $(sel, root) { return (root || document).querySelector(sel); }

  function UI(game) {
    this.game = game;
    this.dialog = $('#dialog');
    this.menu = $('#menu');
    this.hud = $('#hud');
    this.hint = $('#hint');
    this.toastEl = $('#toast');
    this.pause = $('#pause');
    this.fade = $('#fade');
    var self = this;
    document.addEventListener('keydown', function (e) {
      if (self.game.terminal.open) return;
      if (!self.dialogOpen() && !self.menuOpen()) {
        if (e.code === 'KeyF') { self.reportPicker(); e.preventDefault(); }
        else if (e.code === 'KeyH') { self.handbook(); e.preventDefault(); }
        else if (e.code === 'KeyL') { self.hintPicker(); e.preventDefault(); }
        else if (e.code === 'KeyT') { self.game.openLaptop(); e.preventDefault(); }
        else if (e.code === 'Tab') { self.taskOverview(); e.preventDefault(); }
      } else if (e.code === 'Escape' && self.dialogOpen() && !self.dialogLocked) {
        self.closeDialog();
      }
    });
    this.pause.addEventListener('click', function () { self.game.world.lock(); });
  }
  var P = UI.prototype;

  P.dialogOpen = function () { return !this.dialog.classList.contains('hidden'); };
  P.menuOpen = function () { return !this.menu.classList.contains('hidden'); };
  P.captures = function () { return this.dialogOpen() || this.menuOpen() || this.game.terminal.open; };
  P.onLockChange = function (locked) {
    if (locked) { this.pause.classList.add('hidden'); return; }
    if (!this.captures()) this.pause.classList.remove('hidden');
  };
  P.afterOverlay = function () {
    if (!this.captures()) {
      this.pause.classList.remove('hidden');
      this.game.world.lock();
    }
  };

  // ------------------------------------------------------------------ HUD
  P.renderHud = function () {
    var g = this.game;
    var z = g.world.zone();
    var clock = S.deviceClock(g.state, g.state.devices.R1);
    var html = '<div class="hud-week">' + (g.def ? 'Vecka ' + g.def.week + ' · ' + esc(g.def.title) : 'Fri träning') + '</div>';
    html += '<div class="hud-loc">' + esc(z.name) + ' · ' + clock.hms.slice(0, 5) + '</div>';
    if (g.def) {
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
    html += '<div class="hud-keys">WASD gå · mus titta · <b>E</b> använd · <b>T</b> laptop · <b>F</b> felrapport · <b>L</b> ledtråd · <b>H</b> handbok · <b>Tab</b> ärenden</div>';
    this.hud.innerHTML = html;
  };
  P.setHint = function (inter) {
    var txt = inter ? this.game.describe(inter) : '';
    this.hint.textContent = txt ? 'E – ' + txt : '';
    this.hint.style.display = txt ? '' : 'none';
    $('#crosshair').classList.toggle('active', !!txt);
  };
  P.toast = function (msg, kind) {
    var d = document.createElement('div');
    d.className = 'toast ' + (kind || '');
    d.innerHTML = msg;
    this.toastEl.appendChild(d);
    setTimeout(function () { d.classList.add('out'); }, 4200);
    setTimeout(function () { d.remove(); }, 5000);
  };
  P.fadeTo = function (fn) {
    var f = this.fade;
    f.classList.add('on');
    setTimeout(function () { fn(); setTimeout(function () { f.classList.remove('on'); }, 350); }, 450);
  };

  // ------------------------------------------------------------------ Dialog
  P.showDialog = function (opts) {
    var self = this;
    this.game.world.unlock();
    this.pause.classList.add('hidden');
    this.dialogLocked = !!opts.locked;
    var d = this.dialog;
    d.className = 'overlay' + (opts.wide ? ' wide' : '') + (opts.cls ? ' ' + opts.cls : '');
    var html = '<div class="dlg"><div class="dlg-head"><div class="dlg-title">' + (opts.title || '') + '</div>' + (opts.locked ? '' : '<button class="x" data-close>✕</button>') + '</div><div class="dlg-body">' + (opts.html || '') + '</div><div class="dlg-foot"></div></div>';
    d.innerHTML = html;
    var foot = $('.dlg-foot', d);
    (opts.buttons || []).forEach(function (b) {
      var el = document.createElement('button');
      el.textContent = b.label;
      if (b.primary) el.className = 'primary';
      el.addEventListener('click', function () { if (b.onClick) { var keep = b.onClick(d); if (keep === true) return; } if (!b.keep) self.closeDialog(); });
      foot.appendChild(el);
    });
    var x = $('[data-close]', d);
    if (x) x.addEventListener('click', function () { self.closeDialog(); });
    if (opts.onOpen) opts.onOpen(d);
  };
  P.closeDialog = function () {
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
      var small = ['"Allt verkar lugnt här i dag."', '"Kaffe? Det står i fikarummet."', '"Jag har hört att Krabban brukar slå till på natten…"', '"Tack för att du håller ordning på nätet!"'];
      html += '<p class="quote">' + small[U.hash(name + (g.week || 0)) % small.length] + '</p>';
    }
    open.forEach(function (t) {
      var s = g.taskState[t.id];
      s.known = true;
      if (s.reported) html += '<p class="quote">"Tack! Nu fungerar det igen."</p>';
      else if (s.fixed) html += '<p class="quote">"Det verkar fungera nu! Glöm inte att skriva felrapporten."</p>';
      else html += '<p class="quote">' + esc(t.ticket.replace(/^[^:]+:\s*/, '')) + '</p>';
    });
    this.renderHud();
    var buttons = [{ label: 'Okej, jag kollar', primary: true }];
    if (open.some(function (t) { return !g.taskState[t.id].fixed; })) buttons.unshift({ label: 'Ledtråd', onClick: function () { setTimeout(function () { self.hintDialog(open.filter(function (t) { return !g.taskState[t.id].fixed; })[0]); }, 10); } });
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
      '<label class="radio"><input type="radio" name="m" value="dhcp"' + (h.nic.dhcp ? ' checked' : '') + '> Erhåll en IP-adress automatiskt</label>' +
      '<label class="radio"><input type="radio" name="m" value="static"' + (!h.nic.dhcp ? ' checked' : '') + '> Använd följande IP-adress:</label>' +
      '<div class="grid2"><span>IP-adress:</span><input id="f-ip" value="' + esc(st.ip || c.ip || '') + '">' +
      '<span>Nätmask:</span><input id="f-mask" value="' + esc(st.mask || c.mask || '255.255.255.192') + '">' +
      '<span>Standardgateway:</span><input id="f-gw" value="' + esc(st.gw || c.gw || '') + '">' +
      '<span>Önskad DNS-server:</span><input id="f-dns" value="' + esc((st.dns && st.dns[0]) || (c.dns && c.dns[0]) || '') + '"></div>' +
      '<p class="err" id="f-err"></p>';
    var self = this;
    this.showDialog({
      title: 'Nätverksinställningar – ' + esc(h.label || id), html: html,
      buttons: [{ label: 'OK', primary: true, onClick: function (d) {
        var dhcp = $('input[name=m]:checked', d).value === 'dhcp';
        var v = { dhcp: dhcp, ip: $('#f-ip', d).value.trim(), mask: $('#f-mask', d).value.trim(), gw: $('#f-gw', d).value.trim(), dns: $('#f-dns', d).value.trim() };
        if (!dhcp) {
          if (!U.isIp(v.ip) || !U.isIp(v.mask) || !U.isValidMask(v.mask) || (v.gw && !U.isIp(v.gw)) || (v.dns && !U.isIp(v.dns))) { $('#f-err', d).textContent = 'Kontrollera fälten – adresserna måste skrivas som a.b.c.d.'; return true; }
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
    var g = this.game;
    var src = g.world.dev.extra.monitorWall.canvas;
    this.showDialog({
      title: 'Övervakningen', wide: true, html: '<canvas id="mon-copy" width="1024" height="576" style="width:100%;border-radius:8px"></canvas>', buttons: [{ label: 'Stäng' }],
      onOpen: function (d) {
        var c = $('#mon-copy', d);
        function draw() { if (!document.body.contains(c)) return; c.getContext('2d').drawImage(src, 0, 0); setTimeout(draw, 500); }
        draw();
      },
    });
  };
  P.briefing = function (first) {
    var g = this.game, self = this;
    var def = g.def;
    var html = def ? '<p class="brief">' + esc(def.intro).replace(/\n/g, '<br>') + '</p><p class="muted">Kapitel ' + def.chapter + ' i kursboken. Den här veckan tränar du på:</p><ul>' + def.learn.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>'
      : '<p class="brief">Fri träning: Nordviks nät utan fel. Koppla in dig var du vill, bygg om och testa. Inget du gör här sparas.</p>';
    html += '<p class="muted small">Lösenord (står på lappen vid laptopen): enable <code>Krabba2026</code>, ssh <code>drift</code> / <code>Krabba2026</code></p>';
    this.showDialog({ title: first ? '🦀 Krabba-passet' : 'Tavlan', html: html, buttons: [{ label: first ? 'Sätt igång' : 'Stäng', primary: true }] });
  };

  // ------------------------------------------------------------------ Ledtrådar
  P.hintPicker = function () {
    var g = this.game, self = this;
    if (!g.def) { this.toast('Inga ärenden i fri träning.'); return; }
    var open = g.def.tasks.filter(function (t) { return !g.taskState[t.id].fixed && g.taskState[t.id].known; });
    if (!open.length) { this.toast('Prata med kollegorna (utropstecken) för att få veta vad som är fel.'); return; }
    if (open.length === 1) { this.hintDialog(open[0]); return; }
    var html = '<p>Vilket ärende vill du ha en ledtråd till?</p>';
    this.showDialog({
      title: 'Ledtråd', html: html,
      buttons: open.map(function (t) { return { label: t.title, onClick: function () { setTimeout(function () { self.hintDialog(t); }, 10); } }; }),
    });
  };
  P.hintDialog = function (t) {
    var g = this.game, self = this;
    var s = g.taskState[t.id];
    var html = '<p class="muted">' + esc(t.ticket) + '</p><div class="box fastnar"><div class="box-title">FASTNAR DU HÄR?</div><ol>';
    t.hints.forEach(function (h, i) { html += '<li>' + (i < s.hints ? esc(h) : '<span class="muted">(dold ledtråd)</span>') + '</li>'; });
    html += '</ol></div>';
    var buttons = [];
    if (s.hints < t.hints.length) buttons.push({ label: 'Visa nästa ledtråd', primary: true, onClick: function () { s.hints++; g.save(); setTimeout(function () { self.hintDialog(t); }, 10); } });
    buttons.push({ label: 'Stäng' });
    this.showDialog({ title: 'Ledtråd – ' + esc(t.title), html: html, buttons: buttons });
  };
  P.taskOverview = function () {
    var g = this.game;
    if (!g.def) { this.briefing(false); return; }
    var html = '<table class="tbl"><tr><th></th><th>Ärende</th><th>Från</th><th>Status</th></tr>';
    g.def.tasks.forEach(function (t) {
      var s = g.taskState[t.id];
      html += '<tr><td>' + (t.krabba ? '🦀' : '💬') + '</td><td>' + esc(s.known ? t.title : '???') + '</td><td>' + esc(t.npc) + '</td><td>' + (s.reported ? 'Klar (' + s.score + '/2)' : (s.fixed ? 'Löst – skriv rapport' : 'Öppen')) + '</td></tr>';
    });
    html += '</table><p class="muted small">Utropstecken över en person betyder att hen har ett ärende. Krabba-felen hittar du genom att lyssna på kollegorna och felsöka.</p>';
    this.showDialog({ title: 'Ärenden – vecka ' + g.def.week, html: html, buttons: [{ label: 'Stäng', primary: true }] });
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
    var s = g.taskState[t.id];
    var checked = g.commandsFor(t).slice(-8).join('\n');
    var html = '<p class="muted">Felrapport enligt Krabba-passets fem fält: vad du såg, vad du trodde först, vad du kontrollerade, vad felet var och hur det skulle rättas.</p>' +
      '<label>1. Vad såg du?</label><textarea id="r1" rows="2" placeholder="Symptomet, t.ex. vad användaren sa och vad en show-utskrift visade">' + esc(t.ticket.replace(/^[^:]+:\s*/, '').replace(/"/g, '')) + '</textarea>' +
      '<label>2. Vad trodde du först?</label><textarea id="r2" rows="2" placeholder="Din första hypotes"></textarea>' +
      '<label>3. Vad kontrollerade du?</label><textarea id="r3" rows="4">' + esc(checked) + '</textarea>' +
      '<label>4. Vad var felet?</label>' + shuffled(t.report.cause, t.id).map(function (o) { return '<label class="radio"><input type="radio" name="cause" value="' + o.i + '"> ' + esc(o.x) + '</label>'; }).join('') +
      '<label>5. Hur skulle det rättas?</label>' + shuffled(t.report.fix, t.id + 'f').map(function (o) { return '<label class="radio"><input type="radio" name="fix" value="' + o.i + '"> ' + esc(o.x) + '</label>'; }).join('') +
      '<p class="err" id="r-err"></p>';
    this.showDialog({
      title: 'Felrapport – ' + esc(t.title), html: html, wide: true,
      buttons: [{ label: 'Lämna in', primary: true, onClick: function (d) {
        var c = $('input[name=cause]:checked', d), f = $('input[name=fix]:checked', d);
        if (!c || !f) { $('#r-err', d).textContent = 'Välj ett svar på fråga 4 och 5.'; return true; }
        var score = (c.value === '0' ? 1 : 0) + (f.value === '0' ? 1 : 0);
        g.submitReport(t, { saw: $('#r1', d).value, first: $('#r2', d).value, checked: $('#r3', d).value, cause: t.report.cause[+c.value], fix: t.report.fix[+f.value], score: score });
        if (score === 2) self.toast('Felrapporten är inlämnad. Helt rätt! ✔', 'good');
        else self.toast('Felrapporten är inlämnad. Rätt orsak: <i>' + esc(t.report.cause[0]) + '</i>', 'warn');
      } }, { label: 'Senare' }],
    });
  };

  // ------------------------------------------------------------------ Handbok
  P.handbook = function (tab) {
    var self = this;
    var tabs = [['cmd', 'Kommandon'], ['fel', 'Felbibliotek'], ['plan', 'Adressplan'], ['keys', 'Styrning']];
    tab = tab || this.lastTab || 'cmd';
    this.lastTab = tab;
    var html = '<div class="tabs">' + tabs.map(function (t) { return '<button data-tab="' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div><div class="tab-body">' + NV.handbook[tab]() + '</div>';
    this.showDialog({
      title: 'Handbok', html: html, wide: true, buttons: [{ label: 'Stäng', primary: true }],
      onOpen: function (d) { d.querySelectorAll('[data-tab]').forEach(function (b) { b.addEventListener('click', function () { self.handbook(b.getAttribute('data-tab')); }); }); },
    });
  };

  // ------------------------------------------------------------------ Meny
  P.showMenu = function () {
    var g = this.game, self = this;
    this.game.world.unlock();
    this.pause.classList.add('hidden');
    var prog = g.progress();
    var html = '<div class="menu-inner"><div class="logo">🦀</div><h1>Krabba-passet</h1><p class="tag">Du är nätverkstekniker på Nordvik. Varje vecka gör Krabban sönder något i racket – hitta felen, rätta dem och skriv felrapporter.</p><div class="weeks">';
    NV.levels.WEEKS.forEach(function (w) {
      var p = prog.weeks[w.week];
      var stars = p ? '★★★'.slice(0, p.stars) + '☆☆☆'.slice(p.stars) : '';
      html += '<button class="week' + (p ? ' done' : '') + '" data-week="' + w.week + '"><span class="wn">Vecka ' + w.week + '</span><span class="wt">' + esc(w.title) + '</span><span class="ws">' + stars + '</span></button>';
    });
    html += '</div><div class="menu-row"><button data-week="0">Fri träning (inga fel)</button>' + (g.state && g.week !== null && g.running ? '<button class="primary" data-resume>Fortsätt</button>' : '') + '</div>' +
      '<p class="muted small">Byggt för kursen Nätverksteknik. Utrustningen och Nordviks adressplan följer kursboken; felen kommer från bokens avsnitt "Så ser det ut när det är trasigt". Spelet kräver mus och tangentbord.</p></div>';
    this.menu.innerHTML = html;
    this.menu.classList.remove('hidden');
    this.menu.querySelectorAll('[data-week]').forEach(function (b) {
      b.addEventListener('click', function () { self.hideMenu(); g.startWeek(parseInt(b.getAttribute('data-week'), 10)); });
    });
    var r = $('[data-resume]', this.menu);
    if (r) r.addEventListener('click', function () { self.hideMenu(); self.afterOverlay(); });
  };
  P.hideMenu = function () { this.menu.classList.add('hidden'); };

  P.weekDone = function (res) {
    var g = this.game, self = this;
    var html = '<div class="done-stars">' + '★★★'.slice(0, res.stars) + '<span class="muted">' + '☆☆☆'.slice(res.stars) + '</span></div>' +
      '<p>Du löste alla ärenden på <b>' + res.minutes + ' min</b> med <b>' + res.commands + '</b> kommandon och <b>' + res.hints + '</b> ledtrådar.</p>' +
      '<p>Felrapporterna: <b>' + res.reportScore + ' av ' + res.reportMax + '</b> rätt.</p><p class="muted">Ladda ned felrapport.md och lägg den i veckans mapp i ditt repo, precis som efter ett riktigt Krabba-pass.</p>';
    this.showDialog({
      title: 'Vecka ' + g.def.week + ' klar!', html: html,
      buttons: [{ label: 'Ladda ned felrapport.md', onClick: function () { g.downloadReport(); return true; } }, { label: 'Till menyn', primary: true, onClick: function () { setTimeout(function () { self.showMenu(); }, 10); } }, { label: 'Stanna kvar' }],
    });
  };

  return UI;
})();
