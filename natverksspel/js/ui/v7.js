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
    ['typo10', 'Stavfelsjägare', 'Låt terminalen föreslå rätt kommando tio gånger.', '✏️', function (s) { return s.typos >= 10; }],
  ].forEach(function (a) { if (!A.some(function (x) { return x[0] === a[0]; })) A.push(a); });
  var PATS = [
    [/^\s*nmap\b/, 'nmaps'], [/^\s*test cable/i, 'tdrs'], [/^\s*int(erface)?\s+lo/i, 'loops'], [/^\s*banner\s+(motd|login|exec)/i, 'banners'],
    [/^\s*alias exec/i, 'aliases'], [/^\s*(mtr|pathping)\b/i, 'mtrs'], [/^\s*(wr(ite)?( mem(ory)?)?|copy run(ning-config)? start(up-config)?)\s*$/i, 'saves'],
    [/^\s*(do\s+)?sh(ow?)?\s+run/i, 'showRuns'], [/^\s*(undebug all|u all|no debug all)\s*$/i, 'undebugs'], [/\b(range|gt|lt)\s+\d+/i, 'aclRanges'],
  ];
  function track(line) {
    PATS.forEach(function (p) { if (p[0].test(line)) NV.career.stat(p[1]); });
  }

  window.addEventListener('load', function () {
    var g = NV.game;
    if (!g) return;
    var origLog = g.logCommand;
    g.logCommand = function (entry, line) { try { track(line); } catch (e) { /* statistik är inte viktig */ } return origLog.apply(this, arguments); };
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
  });

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
    var box = hud.querySelector('.hud-v7');
    if (!box) { box = document.createElement('div'); box.className = 'hud-v7'; hud.appendChild(box); }
    var html = '';
    if (unsaved.length) html += '<span class="chip warn" title="running-config skiljer sig från startup-config. Skriv write memory för att spara.">💾 Osparat: ' + esc(unsaved.slice(0, 3).join(', ')) + (unsaved.length > 3 ? ' +' + (unsaved.length - 3) : '') + '</span>';
    if (down) html += '<span class="chip bad" title="Länkar som är nere just nu. Öppna Handbok → Topologi för att se vilka.">🔴 ' + down + ' länk' + (down === 1 ? '' : 'ar') + ' nere</span>';
    if (box.innerHTML !== html) box.innerHTML = html;
  }

  // ------------------------------------------------------------------ Dagens tips i menyn
  var TIPS = [
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
  function tipOfDay() { var d = new Date(); return TIPS[(d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate()) % TIPS.length]; }
  var U = NV.UI && NV.UI.prototype;
  if (U && U.showMenu) {
    var origMenu = U.showMenu;
    U.showMenu = function () {
      origMenu.apply(this, arguments);
      var inner = this.menu && this.menu.querySelector('.menu-inner');
      if (inner && !inner.querySelector('.tip-day')) {
        var p = document.createElement('div');
        p.className = 'tip-day';
        var i = TIPS.indexOf(tipOfDay());
        p.innerHTML = '<b>💡 Dagens tips</b> <span class="tip-txt">' + esc(TIPS[i]) + '</span> <button class="tip-next" title="Nästa tips">›</button>';
        p.querySelector('.tip-next').addEventListener('click', function (e) { e.stopPropagation(); i = (i + 1) % TIPS.length; p.querySelector('.tip-txt').textContent = TIPS[i]; });
        var sum = inner.querySelector('.menu-sum');
        if (sum) sum.parentNode.insertBefore(p, sum); else inner.appendChild(p);
      }
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
      svg += '<line x1="' + (a[0] + 35) + '" y1="' + (a[1] + 14) + '" x2="' + (b[0] + 35) + '" y2="' + (b[1] + 14) + '" stroke="' + color + '" stroke-width="' + (l.kind === 'fiber' ? 4 : 2.5) + '"' + (s === 'down' ? ' stroke-dasharray="6 5"' : '') + '><title>' + esc(l.a.dev + ' ' + l.a.port + ' ↔ ' + l.b.dev + ' ' + l.b.port + ' (' + s + ')') + '</title></line>';
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
