// Version 7: prestationer, handboksflikar, HUD-varningar, dagens tips och mer.
(function () {
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function c(s) { return '<code>' + esc(s) + '</code>'; }
  function table(head, rows) {
    return '<table class="tbl"><tr>' + head.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr>' +
      rows.map(function (r) { return '<tr>' + r.map(function (x) { return '<td>' + x + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>';
  }

  // ------------------------------------------------------------------ Nya prestationer
  var A = NV.career.ACH;
  [
    ['nmap', 'Portskannare', 'Skanna ett nät eller en enhet med nmap.', '🔎', function (s) { return s.nmaps >= 1; }],
    ['tdr', 'Kabeltestare', 'Kör ett kabeltest med test cable-diagnostics tdr.', '📐', function (s) { return s.tdrs >= 1; }],
    ['loop', 'Loopback', 'Skapa ett loopback-interface.', '➰', function (s) { return s.loops >= 1; }],
    ['banner', 'Skyltmakare', 'Sätt en banner motd.', '🪧', function (s) { return s.banners >= 1; }],
    ['alias', 'Genvägar', 'Skapa ett eget kortkommando med alias exec.', '⚡', function (s) { return s.aliases >= 1; }],
    ['mtr', 'Ruttspanare', 'Mät förlust per hopp med mtr eller pathping.', '🛰️', function (s) { return s.mtrs >= 1; }],
    ['help50', 'Frågvis', 'Tryck ? i Cisco-terminalen 50 gånger.', '❓', function (s) { return s.helps >= 50; }],
    ['save10', 'Sparsam', 'Spara konfigurationen tio gånger.', '💾', function (s) { return s.saves >= 10; }],
    ['showrun20', 'Konfigläsare', 'Titta på show running-config 20 gånger.', '📜', function (s) { return s.showRuns >= 20; }],
    ['ssh5', 'Fjärrtekniker', 'Logga in med SSH fem gånger.', '🔑', function (s) { return s.sshLogins >= 5; }],
    ['debug', 'Avlusare', 'Slå på debug och stäng av den igen med undebug all.', '🐞', function (s) { return s.undebugs >= 1; }],
    ['range', 'Portintervall', 'Skriv en ACL-rad med range, gt eller lt.', '🎚️', function (s) { return s.aclRanges >= 1; }],
    ['topo', 'Kartläsare', 'Öppna topologin i handboken.', '🗺️', function (s) { return s.topos >= 1; }],
    ['cat', 'Kattvän', 'Klappa kontorskatten.', '🐈', function (s) { return s.cats >= 1; }],
    ['ducks', 'Ankmatare', 'Mata ankorna i dammen.', '🦆', function (s) { return s.duckFeeds >= 1; }],
    ['wget', 'Nedladdare', 'Spara en webbsida till disk med wget.', '📥', function (s) { return s.wgets >= 1; }],
    ['storm', 'Stormvakt', 'Skydda en port mot broadcaststormar med storm-control.', '🌩️', function (s) { return s.storms >= 1; }],
    ['env', 'Hälsokontroll', 'Kontrollera fläktar och temperatur med show environment.', '🌡️', function (s) { return s.envs >= 1; }],
    ['typo10', 'Stavfelsjägare', 'Låt terminalen föreslå rätt kommando tio gånger.', '✏️', function (s) { return s.typos >= 10; }],
  ].forEach(function (a) { if (!A.some(function (x) { return x[0] === a[0]; })) A.push(a); });
  var PATS = [
    [/^\s*nmap\b/, 'nmaps'], [/^\s*test cable/i, 'tdrs'], [/^\s*int(erface)?\s+lo/i, 'loops'], [/^\s*banner\s+(motd|login|exec)/i, 'banners'],
    [/^\s*alias exec/i, 'aliases'], [/^\s*(mtr|pathping)\b/i, 'mtrs'], [/^\s*(wr(ite)?( mem(ory)?)?|copy run(ning-config)? start(up-config)?)\s*$/i, 'saves'],
    [/^\s*(do\s+)?sh(ow?)?\s+run/i, 'showRuns'], [/^\s*(undebug all|u all|no debug all)\s*$/i, 'undebugs'], [/\b(range|gt|lt)\s+\d+/i, 'aclRanges'],
    [/^\s*wget\s+\S/, 'wgets'], [/^\s*storm-control\s+(broadcast|multicast|unicast)\s+level/i, 'storms'], [/^\s*(do\s+)?sh(ow?)?\s+env/i, 'envs'],
  ];
  function track(line) {
    PATS.forEach(function (p) { if (p[0].test(line)) NV.career.stat(p[1]); });
  }

  window.addEventListener('load', function () {
    var g = NV.game;
    if (!g) return;
    var origLog = g.logCommand;
    g.logCommand = function (entry, line) { try { track(line); } catch (e) { /* statistik är inte viktig */ } return origLog.apply(this, arguments); };
    var origDescribe = g.describe;
    g.describe = function (i) {
      if (i.type === 'cat') return 'Klappa katten';
      if (i.type === 'ducks') return 'Mata ankorna';
      return origDescribe.apply(this, arguments);
    };
    var origInteract = g.onInteract;
    g.onInteract = function (i) {
      if (i && i.type === 'cat') { if (this.world.petCat) this.world.petCat(); NV.career.stat('cats'); return; }
      if (i && i.type === 'ducks') { if (this.world.feedDucks) this.world.feedDucks(); NV.career.stat('duckFeeds'); return; }
      return origInteract.apply(this, arguments);
    };
    var origRemote = g.onRemoteLogin;
    g.onRemoteLogin = function (dev, via) { if (via === 'ssh') NV.career.stat('sshLogins'); return origRemote.apply(this, arguments); };
    var t = g.terminal;
    if (t) {
      var origHelp = t.helpNow;
      t.helpNow = function () { NV.career.stat('helps'); return origHelp.apply(this, arguments); };
      var origPrint = t.print;
      t.print = function (text) { if (text && text.indexOf('💡 Menade du') >= 0) NV.career.stat('typos'); return origPrint.apply(this, arguments); };
    }
    setInterval(hudBadges, 2000);
    // XP första gången du använder ett av de nya verktygen
    var NEWFAM = { nmap: 'nmap', mtr: 'mtr', pathping: 'pathping', arping: 'arping', ethtool: 'ethtool', nmcli: 'nmcli', test: 'kabeltest', alias: 'alias', banner: 'banner', vtp: 'vtp', lldp: 'lldp', erase: 'erase', 'test-connection': 'Test-Connection', 'resolve-dnsname': 'Resolve-DnsName', 'config-register': 'config-register', 'channel-group': 'EtherChannel', wget: 'wget', nbtstat: 'nbtstat', lsof: 'lsof', 'storm-control': 'storm-control', 'get-netneighbor': 'Get-NetNeighbor' };
    var origCount = g.countCommand;
    g.countCommand = function (line) {
      var r = origCount.apply(this, arguments);
      var w = String(line || '').trim().split(/\s+/)[0].toLowerCase();
      if (NEWFAM[w] && NV.career.firstUse(NEWFAM[w])) this.xp(10, 'Nytt verktyg: ' + NEWFAM[w]);
      return r;
    };
    var origOnCmd = g.onCommand;
    g.onCommand = function (dev, line) {
      var w = String(line || '').trim().split(/\s+/)[0].toLowerCase();
      if (NEWFAM[w] && NV.career.firstUse(NEWFAM[w])) this.xp(10, 'Nytt kommando: ' + NEWFAM[w]);
      return origOnCmd.apply(this, arguments);
    };
    // Dagar i rad som du har spelat
    try {
      var today = new Date(), key = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate();
      var sk = NV.settings.store('krabba-passet.streak') || { last: null, n: 0 };
      if (sk.last !== key) {
        var y = new Date(today.getTime() - 86400000), ykey = y.getFullYear() + '-' + (y.getMonth() + 1) + '-' + y.getDate();
        sk.n = sk.last === ykey ? sk.n + 1 : 1; sk.last = key;
        NV.settings.store('krabba-passet.streak', sk);
      }
      NV.streak = sk.n;
    } catch (e) { NV.streak = 1; }
  });
  // Handboken minns senaste fliken och ← → byter flik
  if (U && U.handbook) {
    var origHb = U.handbook;
    U.handbook = function (tab) {
      if (!tab && !this.lastTab) tab = NV.settings.get('hbTab') || undefined;
      var r = origHb.call(this, tab);
      NV.settings.set('hbTab', this.lastTab);
      return r;
    };
  }
  document.addEventListener('keydown', function (e) {
    var g = NV.game, ui = g && g.ui;
    if (!ui || !ui.dialogOpen() || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    var tabs = Array.prototype.slice.call(document.querySelectorAll('#dialog .tabs [data-tab]'));
    if (!tabs.length) return;
    var i = tabs.findIndex(function (b) { return b.classList.contains('on'); });
    var n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    if (n) { e.preventDefault(); n.click(); }
  });
  // I öppnar topologin
  document.addEventListener('keydown', function (e) {
    var g = NV.game, ui = g && g.ui;
    if (!ui || g.terminal.open || ui.dialogOpen() || ui.menuOpen() || ui.pauseOpen()) return;
    if (e.code === 'KeyI') { e.preventDefault(); ui.handbook('topo'); }
  });
  // Meddelanden när en länk går ner eller kommer upp igen
  var linkPrev = null, lastToast = 0;
  function linkWatch(st) {
    var now = {}, msgs = [];
    (st.links || []).forEach(function (l) { var s; try { s = NV.shared.linkStatus(st, l); } catch (e) { return; } now[l.id] = s; });
    if (linkPrev && linkPrev._st === st) {
      (st.links || []).forEach(function (l) {
        var a = linkPrev[l.id], b = now[l.id];
        if (!a || a === b) return;
        var name = l.a.dev + ' ' + NV.util.shortIf(l.a.port) + ' ↔ ' + l.b.dev + (l.b.port !== 'nic' ? ' ' + NV.util.shortIf(l.b.port) : '');
        if (b === 'down' && a !== 'down') msgs.push('🔴 Länken ' + name + ' gick ner');
        else if (a === 'down' && b !== 'down') msgs.push('🟢 Länken ' + name + ' är uppe igen');
      });
    }
    now._st = st;
    linkPrev = now;
    if (msgs.length && Date.now() - lastToast > 1500 && NV.game.ui && NV.settings.get('linkAlerts') !== false) { lastToast = Date.now(); NV.game.ui.toast(msgs.slice(0, 2).join('<br>') + (msgs.length > 2 ? '<br>… och ' + (msgs.length - 2) + ' till' : '')); }
  }
  NV.linkWatch = linkWatch;

  // ------------------------------------------------------------------ HUD: osparad konfiguration och länkar som är nere
  function hudBadges() {
    var g = NV.game, hud = document.getElementById('hud');
    if (!g || !g.running || !g.state || !hud || hud.classList.contains('hidden')) return;
    var st = g.state, unsaved = [], down = 0;
    Object.keys(st.devices).forEach(function (id) {
      var d = st.devices[id];
      if (d.os !== 'ios' || !d.startup || !d.config) return;
      if (JSON.stringify(d.config) !== JSON.stringify(d.startup)) unsaved.push(d.config.hostname || id);
    });
    (st.links || []).forEach(function (l) { try { if (NV.shared.linkStatus(st, l) === 'down') down++; } catch (e) { /* länk utan status */ } });
    try { linkWatch(st); } catch (e) { /* ignoreras */ }
    var box = hud.querySelector('.hud-v7');
    if (!box) { box = document.createElement('div'); box.className = 'hud-v7'; hud.appendChild(box); }
    var html = '';
    if (unsaved.length) html += '<span class="chip warn" title="running-config skiljer sig från startup-config. Skriv write memory för att spara.">💾 Osparat: ' + esc(unsaved.slice(0, 3).join(', ')) + (unsaved.length > 3 ? ' +' + (unsaved.length - 3) : '') + '</span>';
    if (down) html += '<span class="chip bad" title="Länkar som är nere just nu. Öppna Handbok → Topologi för att se vilka.">🔴 ' + down + ' länk' + (down === 1 ? '' : 'ar') + ' nere</span>';
    if (box.innerHTML !== html) box.innerHTML = html;
  }

  // ------------------------------------------------------------------ Dagens tips i menyn
  var TIPS = [
    'show ip cef visar vad routern faktiskt skickar paket efter – show ip route visar vad den har lärt sig.', 'storm-control broadcast level 10 begränsar skadan om någon kopplar en slinga.',
    'wget sparar sidan som en fil. Läs den sedan med cat index.html.', 'Get-NetNeighbor är PowerShells arp -a.', 'show protocols ger status och adress för varje interface på en skärm.',
    'Pinga gatewayen först. Svarar den inte är felet nära dig.', 'show interfaces status visar notconnect, err-disabled och fel duplex på en gång.',
    'Native VLAN måste vara samma i båda ändarna av en trunk.', 'switchport trunk allowed vlan add lägger till – utan add skrivs listan över.',
    'En adress som börjar på 169.254 betyder att datorn inte fick något DHCP-svar.', 'show ip route visar vägarna. Mest exakta nätet vinner.',
    'NAT kräver både ip nat inside och ip nat outside.', 'En ACL slutar alltid med ett osynligt deny any.',
    'write memory sparar. Annars är ändringen borta efter nästa omstart.', 'do show … fungerar i konfigurationsläget.',
    'Ctrl+Z tar dig direkt till # från vilket konfigurationsläge som helst.', 'Tab kompletterar, ? visar vad som går att skriva.',
    'show logging berättar ofta vad som hände och när.', 'Klockan i loggarna är bara rätt om NTP fungerar.',
    'nmap -sn 192.168.1.192/26 på laptopen visar vilka enheter som svarar i driftnätet.', 'mtr visar på vilket hopp paketen försvinner.',
    'test cable-diagnostics tdr hittar en trasig kabel – och hur långt bort felet sitter.', 'alias exec sib show ip interface brief ger dig ett eget kortkommando.',
    'Loopback-interface är alltid uppe – perfekta som fast adress på en router.', 'ip route … 200 skapar en reservväg som bara används om den vanliga försvinner.',
    'show spanning-tree root visar vem som är root i varje VLAN.', 'Skriv fel? Terminalen föreslår det närmaste riktiga kommandot.',
    'Klicka på ett tidigare kommando i terminalen för att skriva in det igen.', 'Alt+C kopierar den senaste utskriften – bra till felrapporten.',
    'Dubbel-Tab visar alla kommandon som börjar som det du skrivit.', 'Handbok → Topologi visar hela nätet och vilka länkar som är nere.',
    'En gul ”💾 Osparat” i HUD:en betyder att någon enhet har ändringar som inte är sparade.', 'show mac address-table visar vilken port en dator sitter på.',
    'Portfast ska bara användas mot datorer – aldrig mot en annan switch.', 'show cdp neighbors visar vilken enhet som sitter i andra änden av kabeln.',
    'Duplex mismatch ger late collisions och CRC-fel men länken är uppe.', 'Ett SVI (interface vlan) är bara uppe om VLAN:et finns och har en aktiv port.',
    'ipconfig /displaydns på en Windows-dator visar vilka namn den har slagit upp.', 'tracepath visar den minsta MTU:n på vägen – bra mot VPN-problem.',
    'show crypto isakmp sa: QM_IDLE betyder att fas 1 är uppe.', 'Gästnätet ska aldrig nå kontorsnäten – det är ACL:ens jobb.',
    'Glasögonen (G) visar länkarna i världen: grönt fungerar, rött är nere.', 'Skriv felrapporten med F när ett fel är löst.',
    'Kaffe gör att du går snabbare en stund.', 'Hittar du Krabban får du extra XP.',
  ];
  NV.TIPS = TIPS;
  NV.TIPS = TIPS;
  function tipOfDay() { var d = new Date(); return TIPS[(d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate()) % TIPS.length]; }
  var U = NV.UI && NV.UI.prototype;
  if (U && U.showMenu) {
    var origMenu = U.showMenu;
    U.showMenu = function () {
      origMenu.apply(this, arguments);
      var inner = this.menu && this.menu.querySelector('.menu-inner');
      if (inner && !inner.querySelector('.tip-day') && NV.settings.get('menuTips') !== false) {
        var p = document.createElement('div');
        p.className = 'tip-day';
        var i = TIPS.indexOf(tipOfDay());
        p.innerHTML = '<b>💡 Dagens tips</b> <span class="tip-txt">' + esc(TIPS[i]) + '</span> <button class="tip-next" title="Nästa tips">›</button>';
        p.querySelector('.tip-next').addEventListener('click', function (e) { e.stopPropagation(); i = (i + 1) % TIPS.length; p.querySelector('.tip-txt').textContent = TIPS[i]; });
        // Tipsen ligger ovanför den första rubriken (Krabba-veckorna), inte mellan rubriken och veckorna
        var head = inner.querySelector('h2.menu-h') || inner.querySelector('.menu-sum');
        if (head) head.parentNode.insertBefore(p, head); else inner.appendChild(p);
        var de = NV.dailyExercise && NV.dailyExercise();
        if (de) p.insertAdjacentHTML('afterend', '<div class="tip-day ex-day"><b>🎯 Dagens övning</b> <span class="tip-txt">' + esc(de[1]) + ': ' + esc(de[2]) + '</span></div>');
        if (NV.streak > 1) { var sumEl = inner.querySelector('.menu-sum'); if (sumEl) sumEl.insertAdjacentHTML('beforeend', ' · 🔥 ' + NV.streak + ' dagar i rad'); }
      }
    };
  }

  // Veckosammanfattningen varnar för enheter som har ändringar som inte är sparade
  if (U && U.weekDone) {
    var origDone = U.weekDone;
    U.weekDone = function () {
      origDone.apply(this, arguments);
      var st = this.game.state, body = document.querySelector('#dialog .dlg-body'), un = [];
      if (!st || !body) return;
      Object.keys(st.devices).forEach(function (id) { var d = st.devices[id]; if (d.os === 'ios' && d.startup && JSON.stringify(d.config) !== JSON.stringify(d.startup)) un.push(d.config.hostname || id); });
      if (un.length) body.insertAdjacentHTML('beforeend', '<p class="warn-box">💾 Osparade ändringar på ' + esc(un.join(', ')) + '. På riktigt hade de försvunnit vid nästa strömavbrott – kom ihåg <code>write memory</code>.</p>');
    };
  }

  // Inställningar för det nya i version 7
  var Dd = NV.settings.defaults;
  Dd.menuTips = true; Dd.linkAlerts = true; Dd.animals2d = true;
  if (U && U.settingsDialog) {
    var origSet = U.settingsDialog;
    U.settingsDialog = function () {
      origSet.apply(this, arguments);
      var body = document.querySelector('#dialog .dlg-body'), st = NV.settings;
      if (!body) return;
      var box = document.createElement('div');
      box.innerHTML = '<h3>Mer</h3><div class="set-grid">' +
        '<label for="v7-tips">Dagens tips i menyn</label><input type="checkbox" id="v7-tips"' + (st.get('menuTips') ? ' checked' : '') + '>' +
        '<label for="v7-links">Meddelande när en länk går ner eller upp</label><input type="checkbox" id="v7-links"' + (st.get('linkAlerts') ? ' checked' : '') + '>' +
        '<label for="v7-anim">Djur i 2D (ankor, katt, duvor med flera)</label><input type="checkbox" id="v7-anim"' + (st.get('animals2d') ? ' checked' : '') + '>' +
        '</div>';
      body.appendChild(box);
      [['v7-tips', 'menuTips'], ['v7-links', 'linkAlerts'], ['v7-anim', 'animals2d']].forEach(function (x) { var el = box.querySelector('#' + x[0]); el.addEventListener('input', function () { st.set(x[1], el.checked); }); });
    };
  }

  // ------------------------------------------------------------------ 2D följer ”Minska rörelse”
  if (NV.World2D) {
    var W2 = NV.World2D.prototype;
    ['shake', 'flash', 'slowmo'].forEach(function (k) {
      var f = W2[k];
      W2[k] = function () { if (NV.settings.get('reduceMotion')) return; return f.apply(this, arguments); };
    });
    var origCel = W2.celebrate;
    W2.celebrate = function () { var rm = NV.settings.get('reduceMotion'); if (rm) { var s = this.slowT; origCel.apply(this, arguments); this.slowT = s; this.flashA = 0; this.shakeA = 0; return; } return origCel.apply(this, arguments); };
  }

  // ------------------------------------------------------------------ Handboken: nya flikar
  var H = NV.handbook;
  // Topologi: hela nätet som en logisk karta med länkarnas status just nu
  var POS = {
    ISP: [430, 40, '☁️ Internet'], R1: [250, 120, 'R-Nordvik-1'], RB: [640, 120, 'R-Boras-1'],
    SW1: [250, 230, 'SW-Nordvik-1'], SW2: [80, 330, 'SW-Nordvik-2'], SWB: [640, 230, 'SW-Boras-1'],
    WLC: [395, 300, 'WLC'], Tekniker: [395, 360, 'Laptop'], 'PC-Anna': [170, 400, 'PC-Anna'], 'PC-Karim': [250, 400, 'PC-Karim'], 'PC-Bo': [330, 400, 'PC-Bo'],
    'PC-Maja': [170, 450, 'PC-Maja'], 'PC-Sara': [250, 450, 'PC-Sara'], Skrivare: [330, 450, 'Skrivare'], 'Gast-laptop': [410, 430, 'Gäst-laptop'],
    Filserver: [20, 420, 'Filserver'], 'NTP-server': [80, 450, 'NTP'], Loggserver: [20, 480, 'Logg'], Ekonomisystem: [140, 500, 'Ekonomi'], 'PC-Lisa': [80, 520, 'PC-Lisa'],
    LB: [20, 260, 'LB'], 'Tid-1': [20, 190, 'Tid-1'], 'Tid-2': [90, 190, 'Tid-2'],
    'PC-Lager': [560, 340, 'PC-Lager'], 'AP-Lager-1': [630, 340, 'AP-1'], 'AP-Lager-2': [700, 340, 'AP-2'], 'AP-Lager-3': [770, 340, 'AP-3'],
  };
  H.topo = function () {
    var g = NV.game, st = g && g.state;
    if (!st) return '<p>Starta en vecka för att se nätet.</p>';
    var col = NV.palette ? NV.palette() : { ok: '#3dff6a', bad: '#ff3b30', warn: '#ffb020' };
    var svg = '<svg class="topo" viewBox="0 0 820 560" role="img" aria-label="Nätets topologi">';
    svg += '<rect x="0" y="0" width="820" height="560" fill="none"/>';
    svg += '<rect x="5" y="160" width="490" height="395" rx="14" class="topo-site"/><text x="15" y="178" class="topo-site-t">Göteborg</text>';
    svg += '<rect x="520" y="90" width="295" height="290" rx="14" class="topo-site"/><text x="530" y="108" class="topo-site-t">Borås</text>';
    (st.links || []).forEach(function (l) {
      var a = POS[l.a.dev], b = POS[l.b.dev];
      if (!a || !b || !st.devices[l.a.dev] || !st.devices[l.b.dev]) return;
      var s = 'up';
      try { s = NV.shared.linkStatus(st, l); } catch (e) { /* okänd */ }
      var color = s === 'down' ? col.bad : (s === 'warn' ? col.warn : (s === 'off' ? '#667080' : col.ok));
      svg += '<line data-l="' + esc(l.id) + '" x1="' + (a[0] + 35) + '" y1="' + (a[1] + 14) + '" x2="' + (b[0] + 35) + '" y2="' + (b[1] + 14) + '" stroke="' + color + '" stroke-width="' + (l.kind === 'fiber' ? 4 : 2.5) + '"' + (s === 'down' ? ' stroke-dasharray="6 5"' : '') + '><title>' + esc(l.a.dev + ' ' + l.a.port + ' ↔ ' + l.b.dev + ' ' + l.b.port + ' (' + s + ')') + '</title></line>';
    });
    if (st.devices.R1 && st.devices.RB) svg += '<line x1="285" y1="134" x2="675" y2="134" stroke="#c58bff" stroke-width="2" stroke-dasharray="3 6"><title>Länken / VPN-tunneln mellan Göteborg och Borås</title></line>';
    Object.keys(POS).forEach(function (id) {
      var d = st.devices[id];
      if (!d) return;
      var p = POS[id], kind = d.kind;
      var cls = kind === 'router' ? 'r' : (kind === 'switch' ? 's' : (kind === 'server' || kind === 'lb' ? 'v' : 'h'));
      svg += '<g class="topo-n ' + cls + '" data-dev="' + esc(id) + '" tabindex="0"><rect x="' + p[0] + '" y="' + p[1] + '" width="70" height="28" rx="6"/><text x="' + (p[0] + 35) + '" y="' + (p[1] + 18) + '">' + esc(p[2]) + '</text></g>';
    });
    svg += '</svg>';
    return '<p class="muted small">Grön linje = länken fungerar, gul = varning, röd streckad = nere. Tjock linje är fiber. Klicka på en enhet för att se dess adresser.</p>' + svg + '<div class="topo-info muted small">Klicka på en enhet.</div>';
  };
  H.bind_topo = function (d) {
    NV.career.stat('topos');
    // Topologin uppdateras medan den är öppen
    var iv = setInterval(function () {
      var svg = d.querySelector('svg.topo');
      if (!svg || !document.body.contains(svg)) { clearInterval(iv); return; }
      var st2 = NV.game.state, col = NV.palette ? NV.palette() : { ok: '#3dff6a', bad: '#ff3b30', warn: '#ffb020' };
      var lines = svg.querySelectorAll('line[data-l]');
      lines.forEach(function (ln) { var l = st2.links.filter(function (x) { return x.id === ln.getAttribute('data-l'); })[0]; if (!l) return; var s2 = 'up'; try { s2 = NV.shared.linkStatus(st2, l); } catch (e) { /* okänd */ } ln.setAttribute('stroke', s2 === 'down' ? col.bad : (s2 === 'warn' ? col.warn : (s2 === 'off' ? '#667080' : col.ok))); if (s2 === 'down') ln.setAttribute('stroke-dasharray', '6 5'); else ln.removeAttribute('stroke-dasharray'); });
    }, 1500);
    var st = NV.game.state, S = NV.sim;
    d.querySelectorAll('.topo-n').forEach(function (n) {
      function show() {
        var id = n.getAttribute('data-dev'), dev = st.devices[id], D = S.get(st);
        var ips = Object.keys(D.eps).map(function (k) { return D.eps[k]; }).filter(function (e) { return e.dev === id && e.ip; }).map(function (e) { return e.iface + ' ' + e.ip + (e.up ? '' : ' (nere)'); });
        d.querySelector('.topo-info').innerHTML = '<b>' + esc(dev.config && dev.config.hostname ? dev.config.hostname : (dev.label || id)) + '</b> · ' + esc(dev.model || dev.kind) + (ips.length ? '<br>' + ips.map(esc).join('<br>') : '');
      }
      n.addEventListener('click', show);
      n.addEventListener('keydown', function (e) { if (e.key === 'Enter') show(); });
    });
  };
  H.ports = function () {
    return '<p class="muted small">Portnummer som dyker upp i spelet och på CCNA-provet. TCP och UDP har var sin uppsättning portar.</p>' + table(['Port', 'Protokoll', 'Tjänst', 'Var i spelet'], [
      ['20/21', 'TCP', 'FTP (data/styrning)', 'Gamla filöverföringar'], ['22', 'TCP', 'SSH', 'Inloggning på routrar och switchar'], ['23', 'TCP', 'Telnet (klartext)', 'Ska vara avstängt (vecka 6)'],
      ['25', 'TCP', 'SMTP (e-post)', '–'], ['53', 'UDP/TCP', 'DNS', 'Namnuppslag, ip dns server'], ['67/68', 'UDP', 'DHCP (server/klient)', 'ip helper-address skickar vidare'],
      ['69', 'UDP', 'TFTP', 'copy running-config tftp:'], ['80', 'TCP', 'HTTP', 'Tidrapporten bakom lastbalanseraren'], ['110', 'TCP', 'POP3', '–'],
      ['123', 'UDP', 'NTP', 'Klockan, ntp server 192.168.1.16'], ['161/162', 'UDP', 'SNMP / traps', 'snmp-server community'], ['443', 'TCP', 'HTTPS', 'Webbsidor och WLC'],
      ['445', 'TCP', 'SMB (filresurser)', 'Filservern, net use'], ['500/4500', 'UDP', 'IKE / NAT-T', 'IPsec-tunneln till Borås (vecka 10)'], ['514', 'UDP', 'Syslog', 'logging host 192.168.1.17'],
      ['631', 'TCP', 'IPP (utskrift)', 'Skrivaren'], ['3389', 'TCP', 'RDP (fjärrskrivbord)', 'Windows-datorerna'], ['5246/5247', 'UDP', 'CAPWAP', 'Accesspunkter mot WLC (vecka 8)'],
      ['9100', 'TCP', 'Raw-utskrift', 'Skrivaren'],
    ]) + '<h3>Nummerintervall</h3>' + table(['Intervall', 'Namn'], [['0–1023', 'Välkända portar (well-known)'], ['1024–49151', 'Registrerade portar'], ['49152–65535', 'Dynamiska / privata (klientens källport)']]);
  };
  H.bin = function () {
    var rows = [];
    for (var p = 8; p <= 32; p++) {
      var mask = NV.util.prefixToMask(p), wild = mask.split('.').map(function (o) { return 255 - o; }).join('.');
      rows.push(['/' + p, mask, wild, p >= 31 ? (p === 31 ? '2 (punkt-till-punkt)' : '1') : String(Math.pow(2, 32 - p) - 2)]);
    }
    return '<h3>Omvandlare</h3><div class="bin-conv"><label>Decimal <input id="bin-dec" type="number" min="0" max="255" value="192"></label><label>Binärt <input id="bin-bin" value="11000000" maxlength="8"></label><label>Hex <input id="bin-hex" value="C0" maxlength="2"></label></div>' +
      '<div class="bin-bits" id="bin-bits"></div><p class="muted small">Ändra ett av fälten – de andra räknas om. Varje bit är värd 128, 64, 32, 16, 8, 4, 2 och 1.</p>' +
      '<h3>Prefix, nätmask och wildcard</h3>' + table(['Prefix', 'Nätmask', 'Wildcard (ACL/OSPF)', 'Användbara adresser'], rows);
  };
  H.bind_bin = function (d) {
    var dec = d.querySelector('#bin-dec'), bin = d.querySelector('#bin-bin'), hex = d.querySelector('#bin-hex'), bits = d.querySelector('#bin-bits');
    function draw(v) {
      bits.innerHTML = [128, 64, 32, 16, 8, 4, 2, 1].map(function (w) { var on = (v & w) !== 0; return '<span class="bit ' + (on ? 'on' : '') + '" data-w="' + w + '">' + (on ? 1 : 0) + '<small>' + w + '</small></span>'; }).join('');
      bits.querySelectorAll('.bit').forEach(function (b) { b.addEventListener('click', function () { set(v ^ +b.getAttribute('data-w'), null); }); });
    }
    function set(v, from) {
      v = Math.max(0, Math.min(255, v | 0));
      if (from !== dec) dec.value = v;
      if (from !== bin) bin.value = ('00000000' + v.toString(2)).slice(-8);
      if (from !== hex) hex.value = ('0' + v.toString(16).toUpperCase()).slice(-2);
      draw(v);
    }
    dec.addEventListener('input', function () { set(+dec.value, dec); });
    bin.addEventListener('input', function () { if (/^[01]{1,8}$/.test(bin.value)) set(parseInt(bin.value, 2), bin); });
    hex.addEventListener('input', function () { if (/^[0-9a-f]{1,2}$/i.test(hex.value)) set(parseInt(hex.value, 16), hex); });
    set(192, null);
  };
  H.logg = function () {
    var g = NV.game, log = (g && g.cmdLog) || [];
    if (!log.length) return '<p>Du har inte skrivit några kommandon den här veckan än.</p>';
    function hm(t) { var s = 8 * 3600 + Math.floor(t || 0); return ('0' + Math.floor(s / 3600) % 24).slice(-2) + ':' + ('0' + Math.floor(s / 60) % 60).slice(-2); }
    return '<p class="muted small">Alla kommandon den här veckan, med speltid. Bra underlag för felrapporten. <button class="logg-copy">Kopiera allt</button></p>' +
      table(['Tid', 'Enhet', 'Kommando'], log.slice().reverse().slice(0, 300).map(function (x) { return [hm(x.t), esc(x.where), c(x.line)]; }));
  };
  H.bind_logg = function (d) {
    var b = d.querySelector('.logg-copy');
    if (!b) return;
    b.addEventListener('click', function () {
      var txt = NV.game.cmdLog.map(function (x) { return x.where + ': ' + x.line; }).join('\n');
      try { navigator.clipboard.writeText(txt).then(function () { b.textContent = 'Kopierat!'; }, function () { b.textContent = 'Gick inte att kopiera'; }); } catch (e) { b.textContent = 'Gick inte att kopiera'; }
    });
  };
  H.flow = function () {
    var steps = [
      ['1. Fysiskt', 'Är kabeln i? Lyser porten?', c('show interfaces status') + ', ' + c('test cable-diagnostics tdr') + ', glasögonen (G)'],
      ['2. Länk och VLAN', 'Rätt VLAN på porten? Trunken bär VLAN:et? Native lika?', c('show vlan brief') + ', ' + c('show interfaces trunk')],
      ['3. Spanning tree', 'Blockeras porten? Är det en loop?', c('show spanning-tree vlan 10') + ', ' + c('show spanning-tree root')],
      ['4. Adress', 'Har datorn rätt adress, mask och gateway? 169.254 = inget DHCP', c('ipconfig /all') + ', ' + c('show ip dhcp binding')],
      ['5. Gateway', 'Svarar gatewayen? Är sub-interfacet uppe?', c('ping 192.168.1.1') + ', ' + c('show ip interface brief')],
      ['6. Routing', 'Finns vägen dit – och tillbaka?', c('show ip route') + ', ' + c('traceroute') + ', ' + c('mtr')],
      ['7. Filter och NAT', 'Stoppar en ACL trafiken? Översätts adressen?', c('show access-lists') + ', ' + c('show ip nat translations')],
      ['8. Tjänst', 'Svarar själva tjänsten? DNS? Rätt port?', c('nslookup') + ', ' + c('nmap -p 22,80 <ip>') + ', ' + c('curl')],
      ['9. Spara och dokumentera', 'Spara och skriv felrapporten', c('write memory') + ', F'],
    ];
    return '<p class="muted small">Börja nerifrån (OSI-lager 1) och gå uppåt. Stanna där något inte stämmer.</p>' + table(['Steg', 'Fråga', 'Kommandon'], steps);
  };
  // Teori: korta avsnitt om det som ligger bakom felen i spelet
  H.teori = function () {
    function sec(t, body) { return '<details class="teori"><summary>' + t + '</summary>' + body + '</details>'; }
    return '<p class="muted small">Klicka på en rubrik för att öppna den.</p>' +
      sec('Lägena i Cisco IOS', '<p>' + c('Router>') + ' användarläge → ' + c('enable') + ' → ' + c('Router#') + ' privilegierat läge → ' + c('configure terminal') + ' → ' + c('Router(config)#') + '. Därifrån går du in i ' + c('interface') + ' (config-if), ' + c('line') + ' (config-line), ' + c('vlan') + ' (config-vlan) och ' + c('ip dhcp pool') + ' (dhcp-config). ' + c('exit') + ' backar ett steg, ' + c('end') + ' eller Ctrl+Z går direkt till #.</p>') +
      sec('Felmeddelanden i IOS', table(['Meddelande', 'Betyder'], [[c('% Invalid input detected at \'^\' marker.'), 'Ordet vid ^ finns inte här – fel stavat eller fel läge'], [c('% Incomplete command.'), 'Det saknas något på slutet – tryck ? för att se vad'], [c('% Ambiguous command'), 'Förkortningen passar flera kommandon – skriv fler bokstäver'], [c('% Unknown command or computer name'), 'Användarläget tror att du vill ansluta till en dator med det namnet'], [c('Translating "…"...domain server'), 'Ett felstavat kommando tolkas som ett värdnamn – stäng av med ' + c('no ip domain-lookup')]])) +
      sec('Kablar', table(['Kabel', 'Används till'], [['Rak (straight-through)', 'Dator–switch, router–switch'], ['Korsad (crossover)', 'Switch–switch och dator–dator på gammal utrustning (auto-MDIX löser det i dag)'], ['Konsolkabel (ljusblå)', 'Laptopens USB till enhetens konsolport, 9600 baud 8N1'], ['Fiber (LC)', 'Långa avstånd och störningsfritt, t.ex. reservlänken Gi0/25']])) +
      sec('Privata adresser och specialadresser', table(['Nät', 'Vad det är'], [['10.0.0.0/8', 'Privat'], ['172.16.0.0/12', 'Privat'], ['192.168.0.0/16', 'Privat – används på Nordvik'], ['169.254.0.0/16', 'APIPA: datorn fick inget DHCP-svar'], ['127.0.0.0/8', 'Den egna datorn (loopback)'], ['203.0.113.0/24, 198.51.100.0/24', 'Dokumentationsnät – här ”internet”']])) +
      sec('DHCP: DORA', '<p><b>D</b>iscover (klienten ropar), <b>O</b>ffer (servern erbjuder en adress), <b>R</b>equest (klienten tackar ja), <b>A</b>ck (servern bekräftar). Discover är en broadcast, så den stannar i VLAN:et – därför behövs ' + c('ip helper-address') + ' när servern sitter i ett annat nät.</p>') +
      sec('ARP', '<p>Innan en dator kan skicka till en IP-adress i samma nät måste den veta MAC-adressen. Den skickar en broadcast: ”Vem har 192.168.1.1?” och sparar svaret i ARP-tabellen (' + c('arp -a') + ', ' + c('show arp') + '). Till andra nät skickas paketet till gatewayens MAC-adress.</p>') +
      sec('TCP:s trevägshandskakning', '<p>SYN → SYN-ACK → ACK. Svarar mottagaren med RST är porten stängd (' + c('Connection refused') + '). Kommer inget svar alls är det oftast en brandvägg eller ACL som slänger paketet (timeout).</p>') +
      sec('Spanning tree: roller och tillstånd', table(['Roll / tillstånd', 'Betyder'], [['Root', 'Bästa vägen mot rootbryggan'], ['Desg (designated)', 'Skickar vidare på segmentet'], ['Altn (alternate)', 'Reservväg – blockerad'], ['FWD', 'Skickar trafik'], ['BLK', 'Blockerar för att undvika loopar'], ['Edge (portfast)', 'Port mot en dator, går direkt till FWD']])) +
      sec('Administrativt avstånd', table(['Källa', 'Avstånd'], [['Anslutet nät', '0'], ['Statisk väg', '1'], ['EIGRP', '90'], ['OSPF', '110'], ['RIP', '120'], ['Flytande statisk väg (t.ex.)', '200'], ['Okänd', '255 – används aldrig']])) +
      sec('NAT-typer', table(['Typ', 'Kommando', 'Används till'], [['Statisk', c('ip nat inside source static 192.168.1.10 203.0.113.11'), 'En server som ska nås utifrån'], ['Dynamisk', c('ip nat inside source list 1 pool UT'), 'En pool med publika adresser'], ['PAT (overload)', c('ip nat inside source list 1 interface gi0/1 overload'), 'Hela kontoret delar en adress']])) +
      sec('Var ska en ACL sitta?', '<p><b>Standard-ACL</b> (bara källadress) placeras nära <b>målet</b>, annars stoppar den för mycket. <b>Extended-ACL</b> (källa, mål, protokoll, port) placeras nära <b>källan</b>, så att oönskad trafik stoppas tidigt. Sist i varje lista finns ett osynligt ' + c('deny any') + '.</p>') +
      sec('Wildcardmasker', table(['Wildcard', 'Matchar'], [[c('0.0.0.0'), 'Exakt en adress (samma som host)'], [c('0.0.0.255'), 'Ett /24-nät'], [c('0.0.0.63'), 'Ett /26-nät'], [c('255.255.255.255'), 'Alla adresser (samma som any)']]) + '<p class="muted small">Tips: wildcard = 255.255.255.255 minus nätmasken.</p>') +
      sec('VLAN som alltid finns', '<p>VLAN 1 (default) och 1002–1005 (gamla FDDI/Token Ring) finns på alla Catalyst-switchar och går inte att ta bort. Använd inte VLAN 1 för användare, och lägg native VLAN på ett oanvänt VLAN (här 999).</p>') +
      sec('Broadcaststormar och storm-control', '<p>Om två switchportar kopplas ihop utan att spanning tree blockerar den ena, snurrar broadcastramar runt för evigt och tar hela nätet. ' + c('storm-control broadcast level 10') + ' på en port tappar broadcast när den passerar 10 % av länkens kapacitet. ' + c('show storm-control') + ' visar gränserna. Det ersätter inte spanning tree, men begränsar skadan.</p>') +
      sec('RIB och FIB: show ip route och show ip cef', '<p><b>RIB</b> (Routing Information Base) är routingtabellen som du ser med ' + c('show ip route') + '. Routern väljer där den bästa vägen till varje nät. <b>FIB</b> (Forwarding Information Base, ' + c('show ip cef') + ') är kopian som används när paket faktiskt skickas vidare. Den har också raderna <i>receive</i> (routerns egna adresser) och <i>drop</i>. Om en väg finns i RIB men inte i FIB är något fel på nästa hopp.</p>') +
      sec('Multicast och IGMP snooping', '<p>Multicast skickas till en grupp (224.0.0.0/4) i stället för till alla. Datorer anmäler sig till en grupp med IGMP. Med <b>IGMP snooping</b> (' + c('show ip igmp snooping') + ') lyssnar switchen på anmälningarna och skickar bara gruppens trafik till de portar som vill ha den. Annars behandlas multicast som broadcast. ' + c('ip maddr') + ' på laptopen visar grupperna som datorn är med i.</p>') +
      sec('IPv6 i korthet', '<p>128 bitar, skrivs i hexadecimalt med kolon. ' + c('fe80::/10') + ' är länklokala adresser som varje interface har automatiskt, ' + c('2001:db8::/32') + ' är dokumentationsnät. Det finns ingen broadcast och ingen ARP – grannar hittas med Neighbor Discovery.</p>');
  };
  // Övningar: praktiska uppgifter som bockas av automatiskt när du gör dem
  var EX = [
    ['nmap', 'Skanna driftnätet', 'Kör nmap -sn 192.168.1.192/26 på laptopen och se vilka enheter som svarar.', /^\s*nmap\s.*-sn/],
    ['ports', 'Hitta öppna portar', 'Kör nmap -p 22,23,80 192.168.1.193. Vilka portar är öppna på routern?', /^\s*nmap\s.*-p/],
    ['loop', 'Skapa en loopback', 'interface loopback 0 → ip address 10.255.255.1 255.255.255.255 på R-Nordvik-1, och pinga den.', /^\s*int(erface)?\s+lo/i],
    ['banner', 'Sätt en banner', 'banner motd #Endast behöriga# – och se den när du loggar in med SSH.', /^\s*banner\s+motd/i],
    ['scp', 'Ta en säkerhetskopia', 'ip scp server enable på routern, sedan scp drift@192.168.1.193:running-config backup.cfg på laptopen.', /^\s*scp\s/],
    ['tdr', 'Testa en kabel', 'test cable-diagnostics tdr interface gi0/5 och show cable-diagnostics tdr interface gi0/5 på switchen.', /^\s*(do\s+)?sh(ow?)?\s+cable/i],
    ['float', 'Bygg en reservväg', 'ip route 192.168.2.0 255.255.255.0 203.0.113.1 200 – och kontrollera att den inte syns i show ip route förrän den behövs.', /^\s*ip route .* \d{2,3}\s*$/],
    ['alias', 'Gör ett eget kortkommando', 'alias exec sib show ip interface brief – skriv sedan bara sib.', /^\s*alias exec/i],
    ['mtr', 'Mät förlust per hopp', 'mtr -r 192.168.2.20 på laptopen (eller pathping på en Windows-dator).', /^\s*(mtr|pathping)\s/i],
    ['tcpdump', 'Fånga paket', 'sudo tcpdump -i enp0s31f6 -c 10 – vilka protokoll syns på porten?', /^\s*(sudo\s+)?tcpdump/],
    ['acl', 'Skriv en ACL med portintervall', 'permit tcp any any range 8000 8080 i en extended-ACL.', /\brange\s+\d+\s+\d+/i],
    ['storm', 'Stoppa en broadcaststorm i förväg', 'interface gi0/5 → storm-control broadcast level 10 på switchen, och kontrollera med show storm-control.', /^\s*(do\s+)?sh(ow?)?\s+storm/i],
    ['wget', 'Hämta en webbsida', 'wget http://www.example.com på laptopen, och läs filen med cat index.html.', /^\s*wget\s+\S/],
    ['cef', 'Jämför RIB och FIB', 'show ip route och sedan show ip cef på routern. Ser du samma vägar i båda?', /^\s*(do\s+)?sh(ow?)?\s+ip\s+cef\s*$/i],
    ['root', 'Bli rootbrygga', 'spanning-tree vlan 10 root primary på SW-Nordvik-1 och kontrollera med show spanning-tree root.', /root primary/i],
  ];
  NV.EXERCISES = EX;
  function exDone() { return NV.settings.store('krabba-passet.exercises') || {}; }
  function exMark(line) {
    var d = exDone(), changed = false;
    EX.forEach(function (e) { if (!d[e[0]] && e[3].test(line)) { d[e[0]] = Date.now(); changed = true; if (NV.game && NV.game.ui) NV.game.ui.toast('✅ Övning klar: ' + esc(e[1])); if (NV.game && NV.game.xp) NV.game.xp(15, 'Övning: ' + e[1], true); } });
    if (changed) NV.settings.store('krabba-passet.exercises', d);
  }
  var prevTrack = track;
  track = function (line) { prevTrack(line); exMark(line); };
  H.ovn = function () {
    var d = exDone(), n = EX.filter(function (e) { return d[e[0]]; }).length;
    return '<p class="muted small">Praktiska övningar med de nya verktygen. De bockas av automatiskt när du gör dem i terminalen. ' + n + ' av ' + EX.length + ' klara.</p>' +
      table(['', 'Övning', 'Så gör du'], EX.map(function (e) { return [d[e[0]] ? '✅' : '⬜', '<b>' + esc(e[1]) + '</b>', esc(e[2])]; }));
  };
  NV.dailyExercise = function () {
    var d = exDone(), left = EX.filter(function (e) { return !d[e[0]]; });
    if (!left.length) return null;
    var t = new Date();
    return left[(t.getDate() + t.getMonth() * 31) % left.length];
  };
  // Fler ord i ordlistan
  var origOrd = H.ord;
  H.ord = function () {
    return origOrd.apply(this, arguments) + '<h3>Fler ord</h3>' + table(['Svenska', 'Engelska', 'Kort förklaring'], [
      ['slinga', 'loopback', 'Virtuellt interface som alltid är uppe'], ['reservväg', 'floating static route', 'Statisk väg med högre administrativt avstånd'],
      ['administrativt avstånd', 'administrative distance', 'Hur mycket routern litar på en vägkälla (lägre är bättre)'], ['länkaggregering', 'EtherChannel / LACP', 'Flera kablar som fungerar som en'],
      ['grannprotokoll', 'CDP / LLDP', 'Enheter berättar vilka de är för grannen'], ['kabeltest', 'TDR', 'Mäter var en kabel är avbruten'],
      ['portintervall', 'port range', 'ACL-rad som matchar flera portar'], ['portskanning', 'port scan', 'Testa vilka portar som svarar'],
      ['ruttspårning', 'traceroute', 'Visar routrarna på vägen'], ['DNS-cache', 'DNS cache', 'Sparade namnuppslag i datorn'],
      ['källadress', 'source address', 'Avsändarens IP-adress'], ['destinationsport', 'destination port', 'Vilken tjänst paketet ska till'],
      ['tidsgräns', 'timeout', 'Hur länge man väntar på svar'], ['hopp', 'hop', 'En router på vägen'], ['ramfel', 'CRC error', 'Skadad ram – ofta kabel eller duplex'],
      ['röst-VLAN', 'voice VLAN', 'Eget VLAN för IP-telefoner på samma port'], ['BPDU-skydd', 'BPDU guard', 'Stänger en port som får STP-meddelanden'],
      ['rotbrygga', 'root bridge', 'Switchen som spanning tree räknar från'], ['inloggningsbanner', 'banner motd', 'Text som visas när någon ansluter'],
      ['konfigurationsregister', 'config register', 'Styr hur routern startar (0x2102)'], ['blixtminne', 'flash', 'Där IOS-filen ligger'],
      ['felsökningsläge', 'debug', 'Visar detaljerade händelser – använd sparsamt'], ['reservkonfiguration', 'startup-config', 'Det som laddas vid omstart'],
      ['pågående konfiguration', 'running-config', 'Det som gäller just nu'], ['ARP-cache', 'ARP table', 'Kopplar IP-adresser till MAC-adresser'],
      ['MTU', 'maximum transmission unit', 'Största paketet som får plats utan att delas'], ['fragmentering', 'fragmentation', 'Att dela ett för stort paket'],
      ['tunnel', 'tunnel', 'Paket inuti andra paket (t.ex. IPsec)'], ['hälsokontroll', 'health check', 'Lastbalanseraren testar servrarna'], ['wildcardmask', 'wildcard mask', 'Omvänd nätmask i ACL:er'],
    ]);
  };
})();
