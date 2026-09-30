// Terminaler på datorerna: Windows (svensk) och teknikerns Linux-laptop.
(function () {
  var U = NV.util, S = NV.sim;

  function res(out, extra) { var r = { out: out || '' }; for (var k in extra) r[k] = extra[k]; return r; }
  function conf(h) { return S.hostIpConf(h); }
  function nicUp(state, h) {
    var D = S.get(state);
    var e = D.eps['E:' + h.id + ':nic'];
    return !!(e && e.up);
  }
  function fe80(h) { var m = h.nic.mac; return 'fe80::' + m.slice(0, 4) + ':' + m.slice(4, 8) + ':' + m.slice(8, 12) + ':1'; }
  function splitArgs(line) { return line.trim().split(/\s+/).filter(Boolean); }
  // Klockan i spelet (dagen börjar 08:00)
  function clock(st) { var s = 8 * 3600 + Math.floor(st.time || 0); return [Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60].map(function (n) { return ('0' + n).slice(-2); }).join(':'); }
  var FORTUNES = [
    'Det är alltid DNS. Utom när det är kabeln.',
    'Glöm inte write memory – strömmen går alltid när du minst anar det.',
    'Pinga gatewayen först. Sedan allt annat.',
    'En switchport i fel VLAN ser helt frisk ut. Det är det som är problemet.',
    'Den som dokumenterar slipper felsöka samma sak två gånger.',
    'show logging vet mer än du tror.',
    'Om det fungerade i går: vad ändrades i natt?',
  ];

  // ---------------------------------------------------------------- Webb och filkopiering (kapitel 10)
  function parseUrl(u) {
    var m = /^(?:(https?):\/\/)?([^\/:\s]+)(?::(\d+))?(\/\S*)?$/i.exec(u || '');
    if (!m) return null;
    return { scheme: (m[1] || 'http').toLowerCase(), host: m[2], port: m[3] ? parseInt(m[3], 10) : ((m[1] || '').toLowerCase() === 'https' ? 443 : 80), path: m[4] || '/' };
  }
  // Gemensam curl: returnerar { text, delay }
  function curlText(state, hostId, resolveFn, url, headOnly) {
    var u = parseUrl(url);
    if (!u) return { text: 'curl: (3) URL using bad/illegal format or missing URL', delay: 50 };
    var ip = u.host;
    if (!U.isIp(ip)) {
      var r = resolveFn(u.host);
      if (r.error) return { text: 'curl: (6) Could not resolve host: ' + u.host, delay: r.error === 'timeout' ? 2500 : 200 };
      ip = r.ip;
    }
    var h = S.httpGet(state, hostId, ip, u.port);
    if (!h.ok && h.code === 0) {
      if (h.res.reason === 'refused') return { text: 'curl: (7) Failed to connect to ' + u.host + ' port ' + u.port + ' after 2 ms: Couldn\'t connect to server', delay: 200 };
      return { text: 'curl: (28) Failed to connect to ' + u.host + ' port ' + u.port + ' after 10002 ms: Timeout was reached', delay: 3500 };
    }
    // Fulla paket genom en tunnel utan adjust-mss fastnar efter handskakningen
    var big = S.bigTransfer(state, hostId, ip, u.port);
    if (!big.ok && big.stage === 'transfer') return { text: 'curl: (28) Operation timed out after 30000 milliseconds with 0 out of 48213 bytes received', delay: 4500 };
    var inet = S.INTERNET[ip];
    if (h.code === 503) return { text: headOnly ? 'HTTP/1.1 503 Service Unavailable\nServer: LB-Nordvik\nContent-Length: 107' : '<html><body><h1>503 Service Unavailable</h1>\nNo server is available to handle this request.\n</body></html>', delay: 400 };
    if (h.code === 502) return { text: headOnly ? 'HTTP/1.1 502 Bad Gateway\nServer: LB-Nordvik\nContent-Length: 107' : '<html><body><h1>502 Bad Gateway</h1>\nThe server returned an invalid or incomplete response.\n</body></html>', delay: 1200 };
    var server = h.server ? (state.devices[h.server] ? state.devices[h.server].label : h.server) : (inet ? inet.name : u.host);
    if (headOnly) return { text: 'HTTP/1.1 200 OK\nServer: ' + (h.member ? 'nginx/1.24.0' : 'Apache') + '\nContent-Type: text/html; charset=utf-8' + (h.member ? '\nX-Backend: ' + h.member.name : ''), delay: 250 };
    if (h.member) return { text: '<!doctype html>\n<title>Tidrapport – Nordvik</title>\n<h1>Tidrapport</h1>\n<p>Vecka 40 · inloggad via SSO</p>\n<!-- betjänad av ' + h.member.name + ' (' + h.member.ip + ') -->', delay: 300 };
    return { text: '<!doctype html>\n<html><head><title>' + server + '</title></head>\n<body><h1>' + server + '</h1></body></html>', delay: 300 };
  }

  // Enkla filter efter | (grep i Linux, findstr i Windows). Strömmande utskrift samlas ihop först.
  function pipeFilter(r, pat, opts) {
    var text = (r.out || '') + (r.stream ? r.stream.map(function (x) { return x.text; }).join('') : '');
    var re;
    try { re = new RegExp(pat, opts.i ? 'i' : ''); } catch (e) { re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), opts.i ? 'i' : ''); }
    var lines = text.split('\n').filter(function (l) { return opts.count || l.length; });
    var hit = lines.filter(function (l) { return re.test(l) !== !!opts.v; });
    var total = r.stream ? r.stream.reduce(function (a, x) { return a + (x.delay || 0); }, 0) : (r.delay || 0);
    var out = { out: opts.count ? String(hit.length) : hit.join('\n'), delay: Math.min(3000, total) };
    ['push', 'close', 'clear'].forEach(function (k) { if (r[k]) out[k] = r[k]; });
    return out;
  }
  function splitPipe(line) {
    var m = /^(.*?)\s\|\s*(grep|findstr|egrep)\s+(.*)$/i.exec(line);
    if (!m) return null;
    var args = m[3].trim().split(/\s+/), o = { i: false, v: false, count: false }, pat = [];
    args.forEach(function (x) {
      var lx = x.toLowerCase();
      if (lx === '-i' || lx === '/i') o.i = true;
      else if (lx === '-v' || lx === '/v') o.v = true;
      else if (lx === '-c' || lx === '/c') o.count = true;
      else if (lx === '-e' || lx === '-E') return;
      else pat.push(x.replace(/^["']|["']$/g, ''));
    });
    if (m[2].toLowerCase() === 'findstr') pat = [pat.join('|').replace(/\s+/g, '|')];
    return { left: m[1], pat: pat.join(' '), opts: o };
  }

  // ================================================================ Windows
  function WinShell(state, hostId) {
    this.state = state; this.h = state.devices[hostId]; this.closed = false; this.pending = null;
    this.user = (this.h.user || 'user').toLowerCase().replace('ä', 'a').replace('å', 'a').replace('ö', 'o');
  }
  WinShell.prototype.prompt = function () { return 'C:\\Users\\' + this.user + '>'; };
  WinShell.prototype.promptText = function () { return this.prompt(); };
  WinShell.prototype.banner = function () {
    return 'Microsoft Windows [Version 10.0.19045.4894]\n(c) Microsoft Corporation. Med ensamrätt.\n';
  };
  WinShell.prototype.handle = function (line) {
    var pp = splitPipe(line);
    if (pp) return pipeFilter(this.handle(pp.left), pp.pat, pp.opts);
    var a = splitArgs(line);
    if (NV.onHostCommand) NV.onHostCommand(this.h.id, line);
    if (!a.length) return res('');
    var cmd = a[0].toLowerCase();
    var st = this.state, h = this.h;
    switch (cmd) {
      case 'ipconfig': return res(this.ipconfig(a.slice(1)));
      case 'ping': return this.ping(a.slice(1));
      case 'tracert': return this.tracert(a.slice(1));
      case 'arp': return res(this.arp(a.slice(1)));
      case 'nslookup': return res(this.nslookup(a.slice(1)));
      case 'hostname': return res(h.id);
      case 'echo': return res(line.trim().slice(5).replace(/%USERNAME%/gi, this.user).replace(/%COMPUTERNAME%/gi, h.id.toUpperCase()) || 'ECHO är aktiverat.');
      case 'cls': return res('', { clear: true });
      case 'exit': return res('', { close: true });
      case 'ver': return res('\nMicrosoft Windows [Version 10.0.19045.4894]\n');
      case 'whoami': return res('nordvik\\' + this.user);
      case 'date': return res('Aktuellt datum: 2026-09-29');
      case 'time': return res('Aktuell tid: ' + clock(st));
      case 'systeminfo': return res(['', 'Värdnamn:                  ' + h.id.toUpperCase(), 'OS-namn:                   Microsoft Windows 10 Pro', 'Registrerad ägare:         Nordvik AB', 'Domän:                     nordvik.local', 'Nätverkskort:              1 NIC(s) installerade.', '                           [01]: Intel(R) Ethernet Connection', '                                 DHCP aktiverat: ' + (h.nic && h.nic.dhcp ? 'Ja' : 'Nej'), '                                 IP-adresser: ' + (((NV.sim.hostIpConf(h) || {}).ip) || '–'), ''].join('\n'));
      case 'route': return res(this.routePrint());
      case 'netstat': return res(/-r/i.test(line) ? this.routePrint() : 'Aktiva anslutningar\n\n  Proto  Lokal adress           Utländsk adress        Tillstånd');
      case 'test-netconnection': case 'tnc': return this.tnc(a.slice(1));
      case 'getmac': return res('\nFysisk adress       Transportnamn\n=================== ==========================================================\n' + U.macDash(h.nic.mac) + '   \\Device\\Tcpip_{4E2B9A1C-7D11-4F2E-9B3A-1C5E7D9F0A21}');
      case 'netsh': return res(this.netsh(line));
      case 'curl': case 'curl.exe': case 'iwr': case 'invoke-webrequest': {
        var url = a.slice(1).filter(function (x) { return x[0] !== '-'; })[0];
        if (!url) return res('curl: try \'curl --help\' for more information');
        var self = this;
        var ct = curlText(st, h.id, function (n) { return self.resolveName(n); }, url, a.indexOf('-I') >= 0);
        return res(ct.text, { delay: ct.delay });
      }
      case 'copy': case 'xcopy': case 'robocopy': return this.copy(a.slice(1));
      case 'help': case '/?':
        return res('Kommandon som fungerar här:\n  ipconfig [/all | /release | /renew]\n  ping <adress|namn> [-n antal] [-l storlek] [-f]\n  tracert <adress|namn>\n  arp -a\n  nslookup <namn>\n  curl http://<adress|namn>/      (webbsida, t.ex. tidrapporten)\n  copy \\\\<server>\\<share>\\<fil> .   (hämta en fil från en filserver)\n  netsh interface ip set address "Ethernet" static <ip> <mask> <gateway>\n  netsh interface ip set address "Ethernet" dhcp\n  netsh interface ip set dns "Ethernet" static <ip>\n  hostname, getmac, whoami, ver, date, time, systeminfo, cls, exit');
    }
    return res('\'' + a[0] + '\' känns inte igen som ett internt eller externt kommando,\nkörbart program eller kommandofil.');
  };
  WinShell.prototype.routePrint = function () {
    var c = conf(this.h);
    var o = ['===========================================================================', 'Gränssnittslista', ' 12...' + U.macDash(this.h.nic.mac).replace(/-/g, ' ') + ' ......Intel(R) Ethernet Connection I219-LM', '  1...........................Software Loopback Interface 1', '===========================================================================', '', 'IPv4-routningstabell', '===========================================================================', 'Aktiva vägar:', 'Nätverksmål           Nätmask         Gateway        Gränssnitt  Mått'];
    if (c && c.ip) {
      if (c.gw) o.push(U.pad('          0.0.0.0', 22) + U.pad('0.0.0.0', 16) + U.pad(c.gw, 15) + U.pad(c.ip, 12) + '25');
      o.push(U.pad('      ' + U.network(c.ip, c.mask), 22) + U.pad(c.mask, 16) + U.pad('På länk', 15) + U.pad(c.ip, 12) + '281');
      o.push(U.pad('      ' + c.ip, 22) + U.pad('255.255.255.255', 16) + U.pad('På länk', 15) + U.pad(c.ip, 12) + '281');
    }
    o.push(U.pad('        127.0.0.0', 22) + U.pad('255.0.0.0', 16) + U.pad('På länk', 15) + U.pad('127.0.0.1', 12) + '331');
    o.push('===========================================================================');
    o.push('Beständiga vägar:', '  Inga');
    return o.join('\n');
  };
  WinShell.prototype.tnc = function (args) {
    var host = null, port = null;
    for (var i = 0; i < args.length; i++) { if (/^-port$/i.test(args[i])) { port = parseInt(args[i + 1], 10); i++; } else if (args[i][0] !== '-') host = args[i]; }
    if (!host) return res('Test-NetConnection <värd> [-Port <nummer>]');
    var r = this.resolveName(host);
    if (r.error) return res('WARNING: Name resolution of ' + host + ' failed', { delay: 800 });
    var p = port ? S.ping(this.state, this.h.id, r.ip, { proto: 'tcp', dport: port }) : S.ping(this.state, this.h.id, r.ip);
    var c = conf(this.h);
    var o = ['', 'ComputerName     : ' + host, 'RemoteAddress    : ' + r.ip];
    if (port) o.push('RemotePort       : ' + port);
    o.push('InterfaceAlias   : Ethernet', 'SourceAddress    : ' + ((c && c.ip) || ''));
    if (port) o.push('TcpTestSucceeded : ' + (p.ok ? 'True' : 'False'));
    else o.push('PingSucceeded    : ' + (p.ok ? 'True' : 'False'));
    return res(o.join('\n'), { delay: p.ok ? 400 : 2500 });
  };
  WinShell.prototype.ipconfig = function (args) {
    var st = this.state, h = this.h;
    var flag = (args[0] || '').toLowerCase();
    if (flag === '/flushdns') return '\nWindows IP-konfiguration\n\nDNS-matchningscachen har tömts.';
    if (flag === '/displaydns') return '\nWindows IP-konfiguration\n\n    filserver.nordvik.example\n    ----------------------------------------\n    Postnamn . . . . . . . : filserver.nordvik.example\n    Posttyp  . . . . . . . : 1\n    Data-sektion . . . . . : Svar\n    A-post (värd)  . . . . : 192.168.1.10';
    if (flag === '/release') {
      if (!h.nic.dhcp) return '\nWindows IP-konfiguration\n\nDet gick inte att utföra åtgärden på gränssnittet Ethernet eftersom DHCP inte är aktiverat.';
      S.release(st, h.id);
      return '\nWindows IP-konfiguration\n\nEthernet-kort Ethernet:\n\n   Anslutningsspecifikt DNS-suffix. . :\n   Länklokal IPv6-adress . . . . . . . : ' + fe80(h) + '%12\n   Standardgateway . . . . . . . . . . :';
    }
    if (flag === '/renew') {
      if (!h.nic.dhcp) return '\nWindows IP-konfiguration\n\nDet gick inte att utföra åtgärden på gränssnittet Ethernet eftersom DHCP inte är aktiverat.';
      if (!nicUp(st, h)) { S.dhcp(st, h.id); return '\nWindows IP-konfiguration\n\nDet går inte att utföra någon åtgärd på Ethernet när mediet är frånkopplat.'; }
      var l = S.dhcp(st, h.id);
      if (l.apipa) return '\nWindows IP-konfiguration\n\nEtt fel uppstod när gränssnittet Ethernet förnyades: Det gick inte att kontakta\nDHCP-servern. Tidsgränsen för begäran har överskridits.';
      return this.ipconfig([]);
    }
    var all = flag === '/all';
    var o = ['', 'Windows IP-konfiguration', ''];
    if (all) {
      o.push('   Värdnamn . . . . . . . . . . . . . : ' + h.id);
      o.push('   Primärt DNS-suffix . . . . . . . . :');
      o.push('   Nodtyp . . . . . . . . . . . . . . : Hybrid');
      o.push('   IP-routning aktiverad. . . . . . . : Nej');
      o.push('   WINS-proxy aktiverad . . . . . . . : Nej');
      o.push('');
    }
    o.push('');
    o.push((h.wireless ? 'Trådlöst nätverkskort Wi-Fi:' : 'Ethernet-kort Ethernet:'));
    o.push('');
    var up = nicUp(st, h);
    var c = conf(h);
    if (!up && !(c && c.apipa && !c.nolink && h.nic.dhcp)) {
      o.push('   Mediastatus . . . . . . . . . . . . : Media frånkopplat');
      o.push('   Anslutningsspecifikt DNS-suffix. . :');
      if (all) {
        o.push('   Beskrivning . . . . . . . . . . . . : Intel(R) Ethernet Connection I219-LM');
        o.push('   Fysisk adress . . . . . . . . . . . : ' + U.macDash(h.nic.mac));
        o.push('   DHCP aktiverat. . . . . . . . . . . : ' + (h.nic.dhcp ? 'Ja' : 'Nej'));
        o.push('   Autokonfiguration aktiverad . . . . : Ja');
      }
      return o.join('\n');
    }
    o.push('   Anslutningsspecifikt DNS-suffix. . : ' + (c && !c.apipa && h.nic.dhcp ? 'nordvik.example' : ''));
    if (all) {
      o.push('   Beskrivning . . . . . . . . . . . . : ' + (h.wireless ? 'Intel(R) Wi-Fi 6 AX201 160MHz' : 'Intel(R) Ethernet Connection I219-LM'));
      o.push('   Fysisk adress . . . . . . . . . . . : ' + U.macDash(h.nic.mac));
      o.push('   DHCP aktiverat. . . . . . . . . . . : ' + (h.nic.dhcp ? 'Ja' : 'Nej'));
      o.push('   Autokonfiguration aktiverad . . . . : Ja');
    }
    o.push('   Länklokal IPv6-adress . . . . . . . : ' + fe80(h) + '%12' + (all ? '(Föredragen)' : ''));
    if (!c) {
      o.push('   Standardgateway . . . . . . . . . . :');
      return o.join('\n');
    }
    if (c.apipa) o.push('   Autokonfiguration av IPv4-adress. . : ' + c.ip + (all ? '(Föredragen)' : ''));
    else o.push('   IPv4-adress . . . . . . . . . . . . : ' + c.ip + (all ? (c.dup ? '(Dubblett)' : '(Föredragen)') : ''));
    o.push('   Nätmask . . . . . . . . . . . . . . : ' + c.mask);
    if (all && h.nic.dhcp && !c.apipa) {
      o.push('   Lån erhållet. . . . . . . . . . . . : den 29 september 2026 07:5' + (U.hash(h.id) % 10) + ':12');
      o.push('   Lånet upphör att gälla. . . . . . . : den 30 september 2026 07:5' + (U.hash(h.id) % 10) + ':12');
    }
    o.push('   Standardgateway . . . . . . . . . . : ' + (c.gw || ''));
    if (all) {
      if (h.nic.dhcp && !c.apipa) o.push('   DHCP-server . . . . . . . . . . . . : ' + c.server);
      var dns = c.dns && c.dns.length ? c.dns : [];
      if (dns.length) {
        o.push('   DNS-servrar . . . . . . . . . . . . : ' + dns[0]);
        for (var i = 1; i < dns.length; i++) o.push('                                         ' + dns[i]);
      } else {
        o.push('   DNS-servrar . . . . . . . . . . . . : fec0:0:0:ffff::1%1');
        o.push('                                         fec0:0:0:ffff::2%1');
      }
      o.push('   NetBIOS över TCP/IP . . . . . . . . : Aktiverat');
    }
    return o.join('\n');
  };
  WinShell.prototype.resolveName = function (name) {
    if (U.isIp(name)) return { ip: name };
    return S.resolve(this.state, this.h.id, name);
  };
  WinShell.prototype.copy = function (args) {
    var src = args[0] || '';
    var m = /^\\\\([^\\]+)\\([^\\]+)\\(.+)$/.exec(src);
    if (!m) return res('Syntaxen för kommandot är felaktig.\n(Exempel: copy \\\\filserver\\ritningar\\hyllplan.pdf .)');
    var r = this.resolveName(m[1]);
    if (r.error) return res('Det gick inte att hitta nätverkssökvägen.', { delay: 2500 });
    var t = S.bigTransfer(this.state, this.h.id, r.ip, 445);
    if (!t.ok && t.stage === 'connect') {
      if (t.res.reason === 'refused') return res('Det gick inte att hitta nätverkssökvägen.', { delay: 600 });
      return res('Det gick inte att hitta nätverkssökvägen.', { delay: 3500 });
    }
    if (!t.ok) return res('Det angivna nätverksnamnet är inte längre tillgängligt.\n        0 fil(er) kopierade.', { delay: 5000 });
    return res('        1 fil(er) kopierade.', { delay: 700 });
  };
  WinShell.prototype.ping = function (args) {
    var st = this.state, h = this.h;
    var n = 4, target = null, size = 32, df = false;
    for (var i = 0; i < args.length; i++) {
      if (args[i] === '-n' && args[i + 1]) { n = Math.min(20, parseInt(args[i + 1], 10) || 4); i++; }
      else if (args[i] === '-l' && args[i + 1]) { size = Math.max(0, Math.min(65500, parseInt(args[i + 1], 10) || 32)); i++; }
      else if (args[i] === '-f') df = true;
      else if (args[i] === '-t') n = 8;
      else if (args[i][0] !== '-') target = args[i];
    }
    if (!target) return res('\nSyntax: ping [-t] [-n antal] [-l storlek] [-f] mål\n');
    var r = this.resolveName(target);
    if (r.error) return res('Det gick inte att hitta värden ' + target + ' med ping-begäran. Kontrollera namnet och försök igen.', { delay: r.error === 'timeout' ? 2500 : 300 });
    var ip = r.ip;
    var head = U.isIp(target) ? ip : (target.indexOf('.') < 0 ? target + '.nordvik.example' : target) + ' [' + ip + ']';
    var me = conf(h);
    var intro = '\nSkickar ping-signal till ' + head + ' med ' + size + ' byte data:\n';
    // Det egna nätkortet har MTU 1500: 1472 byte data + 28 byte huvud
    if (df && size > 1472) {
      var loc = [{ text: intro, delay: 100 }];
      for (var q = 0; q < n; q++) loc.push({ text: 'Paketet måste fragmenteras men DF har angetts.\n', delay: 200 });
      loc.push({ text: '\nPing-statistik för ' + ip + ':\n    Paket: Skickade = ' + n + ', Mottagna = 0, Förlorade = ' + n + ' (100 % förlust),', delay: 50 });
      return res('', { stream: loc });
    }
    var p = S.ping(st, h.id, ip, { size: size + 28, df: df });
    if (!p.ok && p.reason === 'frag') {
      var fr = [{ text: intro, delay: 100 }];
      for (var q2 = 0; q2 < n; q2++) fr.push({ text: 'Paketet måste fragmenteras men DF har angetts.\n', delay: 400 });
      fr.push({ text: '\nPing-statistik för ' + ip + ':\n    Paket: Skickade = ' + n + ', Mottagna = 0, Förlorade = ' + n + ' (100 % förlust),', delay: 50 });
      return res('', { stream: fr });
    }
    var stream = [{ text: intro, delay: 100 }];
    var ok = 0, lostN = 0;
    var times = [];
    for (var k = 0; k < n; k++) {
      var line, delay = 900;
      if (p.ok && Math.random() >= p.loss) {
        var t = p.hops.length ? 1 + p.hops.length * 2 + Math.floor(Math.random() * 3) : 0;
        if (p.loss > 0) t += 8 + Math.floor(Math.random() * 40);
        times.push(t);
        line = 'Svar från ' + ip + ': byte=' + size + ' ' + (t < 1 ? 'tid<1 ms' : 'tid=' + t + ' ms') + ' TTL=' + p.ttl;
        ok++; delay = 600;
      } else if (!p.ok && p.reason === 'nolink') {
        return res('PING: överföringen misslyckades. Allmänt fel.', { delay: 200 });
      } else if (!p.ok && p.reason === 'noip') {
        return res('PING: överföringen misslyckades. Allmänt fel.', { delay: 200 });
      } else if (!p.ok && (p.reason === 'nogw')) {
        return res('PING: överföringen misslyckades. Allmänt fel.', { delay: 200 });
      } else if (!p.ok && p.reason === 'arp' && p.local) {
        line = 'Svar från ' + (me && me.ip) + ': Målvärddatorn kan inte nås.';
        delay = 2600; lostN++;
      } else if (!p.ok && (p.reason === 'net-unreachable') && p.fromIp) {
        line = 'Svar från ' + p.fromIp + ': Målnätverket kan inte nås.';
        delay = 300; lostN++;
      } else if (!p.ok && p.reason === 'acl' && p.fromIp) {
        line = 'Svar från ' + p.fromIp + ': Målvärddatorn kan inte nås.';
        delay = 300; lostN++;
      } else if (!p.ok && p.reason === 'arp' && p.fromIp && !p.local) {
        line = 'Svar från ' + p.fromIp + ': Målvärddatorn kan inte nås.';
        delay = 2600; lostN++;
      } else {
        line = 'Begäran gjorde time out.';
        delay = 3000; lostN++;
      }
      stream.push({ text: line + '\n', delay: delay });
    }
    var answered = ok + (p.ok ? 0 : (p.reason === 'net-unreachable' || p.reason === 'acl' || p.reason === 'arp' ? lostN : 0));
    var lost = n - answered;
    stream.push({ text: '\nPing-statistik för ' + ip + ':\n    Paket: Skickade = ' + n + ', Mottagna = ' + answered + ', Förlorade = ' + lost + ' (' + Math.round(lost * 100 / n) + ' % förlust),' + (ok ? '\nUngefärlig tid för tur och retur i millisekunder:\n    Lägsta = ' + Math.min.apply(null, times) + ' ms, Högsta = ' + Math.max.apply(null, times) + ' ms, Medel = ' + Math.round(times.reduce(function (a, b) { return a + b; }, 0) / times.length) + ' ms' : ''), delay: 50 });
    return res('', { stream: stream });
  };
  WinShell.prototype.tracert = function (args) {
    var target = args.filter(function (x) { return x[0] !== '-'; })[0];
    if (!target) return res('\nSyntax: tracert mål\n');
    var r = this.resolveName(target);
    if (r.error) return res('Det gick inte att matcha målsystemnamnet ' + target + '.');
    var ip = r.ip;
    var tr = S.traceroute(this.state, this.h.id, ip);
    var stream = [{ text: '\nSpårar väg till ' + (U.isIp(target) ? ip : target + ' [' + ip + ']') + '\növer högst 30 hopp:\n\n', delay: 200 }];
    var n = 1;
    tr.forward.hops.forEach(function (hp) {
      stream.push({ text: U.padL(n, 3) + '    <1 ms    <1 ms    <1 ms  ' + hp.ip + '\n', delay: 500 });
      n++;
    });
    if (tr.full.ok) {
      if (!tr.forward.hops.length || tr.forward.hops[tr.forward.hops.length - 1].ip !== ip) stream.push({ text: U.padL(n, 3) + '     1 ms    <1 ms     1 ms  ' + ip + '\n', delay: 500 });
      stream.push({ text: '\nSpårningen är slutförd.', delay: 100 });
    } else {
      for (var k = 0; k < 4; k++) { stream.push({ text: U.padL(n, 3) + '     *        *        *     Begäran gjorde time out.\n', delay: 2200 }); n++; }
      stream.push({ text: '\n(Spårningen avbröts av dig efter ' + (n - 1) + ' hopp.)', delay: 100 });
    }
    return res('', { stream: stream });
  };
  WinShell.prototype.arp = function (args) {
    if ((args[0] || '').toLowerCase() === '-d') { this.h.arp = {}; return ''; }
    if ((args[0] || '').toLowerCase() !== '-a' && (args[0] || '').toLowerCase() !== '-g') return '\nVisar och ändrar översättningstabeller för IP-adresser till fysiska adresser\nsom används av ARP (Address Resolution Protocol).\n\nARP -a';
    var c = conf(this.h);
    if (!c || !nicUp(this.state, this.h)) return 'Inga ARP-poster hittades.';
    var o = ['', 'Gränssnitt: ' + c.ip + ' --- 0xc', '  Internetadress        Fysisk adress         Typ'];
    var arp = this.h.arp;
    Object.keys(arp).sort(function (a, b) { return U.ipToInt(a) - U.ipToInt(b); }).forEach(function (ip) {
      o.push('  ' + U.pad(ip, 22) + U.pad(U.macDash(arp[ip].mac).toLowerCase(), 22) + 'dynamisk');
    });
    o.push('  ' + U.pad(U.broadcast(c.ip, c.mask), 22) + U.pad('ff-ff-ff-ff-ff-ff', 22) + 'statisk');
    o.push('  ' + U.pad('224.0.0.22', 22) + U.pad('01-00-5e-00-00-16', 22) + 'statisk');
    o.push('  ' + U.pad('255.255.255.255', 22) + U.pad('ff-ff-ff-ff-ff-ff', 22) + 'statisk');
    return o.join('\n');
  };
  WinShell.prototype.nslookup = function (args) {
    var name = args[0];
    var c = conf(this.h);
    var srv = c && c.dns && c.dns[0];
    if (!srv) return 'Standardservern är inte tillgänglig\nServer:  UnKnown\nAddress:  ::1\n\n*** UnKnown hittar inte ' + (name || '') + ': No response from server';
    if (!name) return 'Standardserver:  UnKnown\nAddress:  ' + srv + '\n\n> (skriv exit för att avsluta – här räcker nslookup <namn>)';
    var r = S.resolve(this.state, this.h.id, name);
    if (r.error === 'timeout') return 'DNS request timed out.\n    timeout was 2 seconds.\nServer:  UnKnown\nAddress:  ' + srv + '\n\n*** Tidsgränsen för begäran till UnKnown överskreds';
    if (r.error) return 'Server:  UnKnown\nAddress:  ' + srv + '\n\n*** UnKnown hittar inte ' + name + ': Non-existent domain';
    var fq = name.indexOf('.') < 0 ? name + '.nordvik.example' : name;
    return 'Server:  UnKnown\nAddress:  ' + srv + '\n\n' + (U.isPrivate(r.ip) ? '' : 'Icke-auktoritativt svar:\n') + 'Namn:    ' + fq + '\nAddress:  ' + r.ip;
  };
  WinShell.prototype.netsh = function (line) {
    var h = this.h;
    var m = /interface\s+(?:ipv4|ip)\s+set\s+address\s+(?:name=)?"?[^"]*"?\s+(?:source=)?(static|dhcp)\s*(.*)$/i.exec(line);
    if (m) {
      if (m[1].toLowerCase() === 'dhcp') {
        h.nic.dhcp = true; S.touch(this.state); S.dhcp(this.state, h.id);
        return 'Ok.';
      }
      var p = m[2].trim().split(/\s+/).map(function (x) { return x.replace(/^\w+=/, ''); });
      if (!U.isIp(p[0]) || !U.isIp(p[1]) || !U.isValidMask(p[1]) || (p[2] && !U.isIp(p[2]))) return 'Den angivna parametern är ogiltig.';
      var dns = h.nic.static ? h.nic.static.dns : (h.lease && h.lease.dns ? h.lease.dns.slice() : []);
      h.nic.dhcp = false;
      h.nic.static = { ip: p[0], mask: p[1], gw: p[2] || null, dns: dns };
      S.release(this.state, h.id);
      S.touch(this.state);
      return 'Ok.';
    }
    var d = /interface\s+(?:ipv4|ip)\s+set\s+dns\s+(?:name=)?"?[^"]*"?\s+(?:source=)?(static|dhcp)\s*(\S*)/i.exec(line);
    if (d) {
      if (d[1].toLowerCase() === 'static') {
        if (!U.isIp(d[2])) return 'Den angivna parametern är ogiltig.';
        if (h.nic.static) h.nic.static.dns = [d[2]];
        else if (h.lease) h.lease.dns = [d[2]];
      }
      S.touch(this.state);
      return 'Ok.';
    }
    return 'Följande kommando hittades inte: ' + line.replace(/^netsh\s*/i, '') + '.';
  };

  // Samma sak från nätverksinställningarnas dialogruta
  function applyIpv4(state, hostId, s) {
    var h = state.devices[hostId];
    if (s.dhcp) {
      h.nic.dhcp = true;
      S.touch(state);
      S.dhcp(state, hostId);
    } else {
      var old = h.nic.static || {};
      h.nic.dhcp = false;
      h.nic.static = { ip: s.ip, mask: s.mask, gw: s.gw || null, dns: s.dns ? [s.dns] : (old.dns || []) };
      h.lease = null;
      S.touch(state);
    }
    if (NV.onHostCommand) NV.onHostCommand(hostId, '[inställningar]');
  }

  // ================================================================ Linux (teknikerns laptop)
  function LinuxShell(state, hostId, env) {
    this.state = state; this.h = state.devices[hostId]; this.env = env || {}; this.closed = false; this.pending = null;
    this.known = {};
  }
  LinuxShell.prototype.prompt = function () { return 'tekniker@laptop:~$ '; };
  LinuxShell.prototype.promptText = function () { return this.pending ? this.pending.prompt : this.prompt(); };
  LinuxShell.prototype.banner = function () {
    return 'Ubuntu 24.04 LTS  —  teknikerns laptop\nTips: sudo screen /dev/ttyUSB0 9600   öppnar konsolen på enheten där konsolkabeln sitter.\n      Skriv help för fler kommandon.\n';
  };
  LinuxShell.prototype.handle = function (line) {
    if (this.pending) { var p = this.pending; this.pending = null; return p.fn.call(this, line); }
    // !! kör om senaste kommandot (bash skriver ut det först)
    if (/!!/.test(line)) {
      var lastCmd = (this.hist || []).filter(function (x) { return !/!!/.test(x); }).slice(-1)[0];
      if (!lastCmd) return res('bash: !!: event not found');
      var nl = line.replace(/!!/g, lastCmd);
      var rr = this.handle(nl);
      rr.out = nl + '\n' + (rr.out || '');
      return rr;
    }
    var pp = splitPipe(line);
    if (pp) { this.hist = this.hist || []; var r0 = this.handle(pp.left); this.hist[this.hist.length - 1] = line.trim(); return pipeFilter(r0, pp.pat, pp.opts); }
    if (NV.onHostCommand) NV.onHostCommand(this.h.id, line);
    var a = splitArgs(line);
    if (!a.length) return res('');
    this.hist = this.hist || [];
    this.hist.push(line.trim());
    if (a[0] === 'sudo') { a = a.slice(1); if (!a.length) return res('usage: sudo command'); }
    var cmd = a[0];
    var st = this.state, h = this.h;
    switch (cmd) {
      case 'help':
        return res([
          'Kommandon på laptopen:',
          '  screen /dev/ttyUSB0 9600      konsol mot enheten där konsolkabeln sitter (Ctrl+A K eller Esc stänger)',
          '  ls /dev/ttyUSB*              se om USB-konsoladaptern syns',
          '  ssh drift@<ip>               logga in på en enhet över nätet',
          '  telnet <ip>                  (osäkert – används bara för att testa)',
          '  ping -c 4 <ip|namn>          ip -4 addr show     ip route show default',
          '  ip link show                 ip -4 neigh show    resolvectl query <namn>',
          '  traceroute <ip>              nslookup <namn>     clear',
          '  curl http://<ip|namn>/       ping -s 1400 -M do <ip>   (stora paket, DF satt)',
          '  for i in 1 2 3 4; do curl -s http://tid/; done   (testa lastbalanseraren)',
          '  tracepath <ip>               ip route get <ip>   dig +short <namn>',
          '  kommando | grep <mönster>    !! (kör om)         man <kommando>',
          '  date   uptime   whoami   neofetch   fortune   history   echo',
        ].join('\n'));
      case 'clear': return res('', { clear: true });
      case 'exit': case 'logout': return res('', { close: true });
      case 'whoami': return res('tekniker');
      case 'date': return res('tis 29 sep 2026 ' + clock(st) + ' CEST');
      case 'uptime': return res(' ' + clock(st) + ' up 3 days,  2:14,  1 user,  load average: 0,08, 0,12, 0,10');
      case 'fortune': return res(FORTUNES[Math.floor(Math.random() * FORTUNES.length)]);
      case 'neofetch': return res(['        .--.         tekniker@laptop', '       |o_o |        ---------------', '       |:_/ |        OS: Ubuntu 24.04 LTS', '      //   \\ \\       Värd: Nordviks teknikerlaptop', '     (|     | )      Skal: bash 5.2', '    /\'\\_   _/`\\      Terminal: Krabba-passet', '    \\___)=(___/      Konsol: /dev/ttyUSB0 (ljusblå kabel)', '                     IP: ' + (((conf(h) || {}).ip) || '–')].join('\n'));
      case 'history': if (a[1] === '-c') { this.hist = []; return res(''); } return res((this.hist || []).map(function (l, i) { return U.padL(i + 1, 5) + '  ' + l; }).join('\n'));
      case 'ifconfig': return res('Command \'ifconfig\' not found, but can be installed with:\nsudo apt install net-tools\n\nTips: använd ip a (adresser) och ip r (vägar) i stället.');
      case 'arp': return res(this.ip(['neigh']).split('\n').filter(Boolean).map(function (l) { var p = l.split(' '); return U.pad(p[0], 22) + 'ether   ' + p[4] + '   C   enp0s31f6'; }).join('\n') || 'Address                  HWtype  HWaddress           Flags Mask            Iface');
      case 'nc': case 'netcat': return this.nc(a.slice(1));
      case 'curl': case 'wget': {
        var url = a.slice(1).filter(function (x) { return x[0] !== '-'; })[0];
        if (!url) return res(cmd + ': try \'' + cmd + ' --help\' for more information');
        var ct = curlText(st, h.id, function (n) { return S.resolve(st, h.id, n); }, url, a.indexOf('-I') >= 0);
        return res(ct.text, { delay: ct.delay });
      }
      case 'for': {
        // for i in 1 2 3 4; do curl -s http://tid/; done  – vanligt sätt att testa en lastbalanserare
        var fm = /^for\s+\w+\s+in\s+([\d\s]+|\{1\.\.(\d+)\})\s*;\s*do\s+(curl[^;]*);\s*done$/.exec(line.trim());
        if (!fm) return res('bash: syntax: for i in 1 2 3 4; do curl -s http://<adress>/; done');
        var times = fm[2] ? parseInt(fm[2], 10) : fm[1].trim().split(/\s+/).length;
        var ca = splitArgs(fm[3]);
        var u2 = ca.slice(1).filter(function (x) { return x[0] !== '-'; })[0];
        var outs = [];
        for (var ti = 0; ti < Math.min(times, 12); ti++) outs.push(curlText(st, h.id, function (n) { return S.resolve(st, h.id, n); }, u2, ca.indexOf('-I') >= 0).text.split('\n').filter(function (l) { return /h1|betjänad|curl:|HTTP|Backend/.test(l); }).join(' '));
        return res(outs.join('\n'), { delay: 400 });
      }
      case 'hostname': return res(a[1] === '-I' ? ((conf(h) || {}).ip || '') : 'laptop');
      case 'ls': return res(this.ls(a.slice(1)));
      case 'dmesg': return res(this.dmesg());
      case 'screen': case 'minicom': case 'picocom': return this.screen(a.slice(1), cmd);
      case 'ip': return res(this.ip(a.slice(1)));
      case 'ping': return this.ping(a.slice(1));
      case 'traceroute': return this.trace(a.slice(1));
      case 'tracepath': return this.tracepath(a.slice(1));
      case 'man': return res(MAN[(a[1] || '').toLowerCase()] || (a[1] ? 'Ingen manualsida för ' + a[1] + '. Prova man ping, man ssh, man curl, man tracepath eller man ip.' : 'Vilken manualsida vill du ha?\nTill exempel: man ping'));
      case 'echo': return res(a.slice(1).join(' ').replace(/^["']|["']$/g, '').replace(/\$USER/g, 'tekniker').replace(/\$HOSTNAME/g, 'laptop'));
      case 'sl': return res(['      ====        ________                ___________', '  _D _|  |_______/        \\__I_I_____===__|_________|', '   |(_)---  |   H\\________/ |   |        =|___ ___|', '   /     |  |   H  |  |     |   |         ||_| |_||', '  |      |  |   H  |__--------------------| [___] |', '  | ________|___H__/__|_____/[][]~\\_______|       |', '  |/ |   |-----------I_____I [][] []  D   |=======|_', '(Du menade nog ls. Tåget går till Borås – via VPN.)'].join('\n'), { delay: 300 });
      case 'resolvectl': return res(this.resolvectl(a.slice(1)));
      case 'nslookup': case 'host': case 'dig': {
        var nm = a.slice(1).filter(function (x) { return x[0] !== '+' && x[0] !== '-'; })[0];
        if (cmd === 'dig' && a.indexOf('+short') >= 0) { var rs = S.resolve(st, h.id, nm || ''); return res(rs.error ? '' : rs.ip); }
        return res(this.lookup(nm));
      }
      case 'ssh': return this.ssh(a.slice(1));
      case 'telnet': return this.telnet(a.slice(1));
      case 'uname': return res(a[1] === '-a' ? 'Linux laptop 6.8.0-45-generic #45-Ubuntu SMP PREEMPT_DYNAMIC x86_64 GNU/Linux' : 'Linux');
      case 'id': return res('uid=1000(tekniker) gid=1000(tekniker) grupper=1000(tekniker),4(adm),20(dialout),27(sudo)');
      case 'cat': if (a[1] === '/etc/hosts') return res('127.0.0.1\tlocalhost\n127.0.1.1\tlaptop\n\n# Nordvik – bra att ha när DNS krånglar\n192.168.1.193\tr-nordvik-1\n192.168.2.193\tr-boras-1\n192.168.1.13\tlb-nordvik tid');
        if (a[1] === '/etc/resolv.conf') return res('# This is /run/systemd/resolve/stub-resolv.conf managed by man:systemd-resolved(8).\nnameserver 127.0.0.53\noptions edns0 trust-ad\nsearch nordvik.example\n\n# Den riktiga DNS-servern: resolvectl status');
        if (a[1] === 'felrapport.md') return res('(Felrapporten fyller du i spelet med F.)'); return res('cat: ' + (a[1] || '') + ': Filen eller katalogen finns inte');
    }
    return res(cmd + ': command not found');
  };
  LinuxShell.prototype.nc = function (args) {
    var rest = args.filter(function (x) { return x[0] !== '-'; });
    var host = rest[0], port = parseInt(rest[1], 10);
    if (!host || !port) return res('usage: nc -zv <värd> <port>   (testar om en TCP-port svarar)');
    var ip = host;
    if (!U.isIp(host)) { var r = S.resolve(this.state, this.h.id, host); if (r.error) return res('nc: getaddrinfo for host "' + host + '" port ' + port + ': Name or service not known'); ip = r.ip; }
    var p = S.ping(this.state, this.h.id, ip, { proto: 'tcp', dport: port });
    if (p.ok) return res('Connection to ' + host + ' ' + port + ' port [tcp/*] succeeded!', { delay: 300 });
    if (p.reason === 'refused') return res('nc: connect to ' + host + ' port ' + port + ' (tcp) failed: Connection refused', { delay: 300 });
    return res('nc: connect to ' + host + ' port ' + port + ' (tcp) failed: Connection timed out', { delay: 3000 });
  };
  LinuxShell.prototype.ls = function (args) {
    var p = args.join(' ');
    if (/\/dev\/tty/.test(p)) {
      if (!this.env.consoleTarget()) return 'ls: cannot access \'' + p + '\': No such file or directory';
      return '/dev/ttyUSB0';
    }
    return 'Dokument  Hämtningar  configs  dagbok.md  felrapport.md';
  };
  LinuxShell.prototype.dmesg = function () {
    var t = this.env.consoleTarget();
    if (!t) return '[ 1204.221] usb 1-2: USB disconnect, device number 7';
    return '[ 1301.117] usb 1-2: new full-speed USB device number 8 using xhci_hcd\n[ 1301.270] usb 1-2: New USB device found, idVendor=0403, idProduct=6001\n[ 1301.271] usb 1-2: Product: FT232R USB UART\n[ 1301.280] ftdi_sio 1-2:1.0: FTDI USB Serial Device converter detected\n[ 1301.282] usb 1-2: FTDI USB Serial Device converter now attached to ttyUSB0';
  };
  LinuxShell.prototype.screen = function (args, cmd) {
    var devPath = args.filter(function (x) { return /^\/dev\//.test(x); })[0];
    var speedArg = args.filter(function (x) { return /^\d+$/.test(x); })[0];
    if (cmd === 'picocom') { var bi = args.indexOf('-b'); speedArg = bi >= 0 ? args[bi + 1] : '9600'; }
    if (cmd === 'minicom') { speedArg = '9600'; devPath = devPath || '/dev/ttyUSB0'; }
    if (!devPath) return res('Använd: screen /dev/ttyUSB0 9600');
    var target = this.env.consoleTarget();
    if (devPath !== '/dev/ttyUSB0' || !target) return res('Cannot exec \'' + devPath + '\': No such file or directory', { delay: 200 });
    var speed = parseInt(speedArg || '9600', 10);
    return res('', { push: { kind: 'serial', target: target, speed: speed } });
  };
  LinuxShell.prototype.ip = function (args) {
    var st = this.state, h = this.h;
    var c = conf(h);
    var up = nicUp(st, h);
    var s = args.join(' ');
    if (/^(-4\s+)?(link|l)(\s+show)?/.test(s)) {
      return '1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN mode DEFAULT group default qlen 1000\n    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00\n2: enp0s31f6: <BROADCAST,MULTICAST' + (up ? ',UP,LOWER_UP' : ',UP') + '> mtu 1500 qdisc fq_codel state ' + (up ? 'UP' : 'DOWN') + ' mode DEFAULT group default qlen 1000\n    link/ether ' + U.macColon(h.nic.mac) + ' brd ff:ff:ff:ff:ff:ff';
    }
    if (/(^|\s)(addr|a|address)(\s|$)/.test(s)) {
      var o = '1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000\n    inet 127.0.0.1/8 scope host lo\n       valid_lft forever preferred_lft forever\n2: enp0s31f6: <BROADCAST,MULTICAST' + (up ? ',UP,LOWER_UP' : ',UP') + '> mtu 1500 qdisc fq_codel state ' + (up ? 'UP' : 'DOWN') + ' group default qlen 1000';
      if (c) o += '\n    inet ' + c.ip + '/' + U.maskToPrefix(c.mask) + ' brd ' + U.broadcast(c.ip, c.mask) + ' scope global noprefixroute enp0s31f6\n       valid_lft forever preferred_lft forever';
      return o;
    }
    var rg = /(^|\s)(route|r)\s+get\s+(\S+)/.exec(s);
    if (rg) {
      if (!c) return 'RTNETLINK answers: Network is unreachable';
      var dstIp = rg[3];
      if (!U.isIp(dstIp)) return 'Error: any valid prefix is expected rather than "' + dstIp + '".';
      var via = U.sameSubnet(dstIp, c.ip, c.mask) ? '' : (c.gw ? ' via ' + c.gw : '');
      if (!via && !U.sameSubnet(dstIp, c.ip, c.mask)) return 'RTNETLINK answers: Network is unreachable';
      return dstIp + via + ' dev enp0s31f6 src ' + c.ip + ' uid 1000 \n    cache ';
    }
    if (/(^|\s)(route|r)(\s|$)/.test(s)) {
      if (!c) return '';
      var d = c.gw ? 'default via ' + c.gw + ' dev enp0s31f6 proto static metric 100' : '';
      if (/default/.test(s)) return d;
      return (d ? d + '\n' : '') + U.network(c.ip, c.mask) + '/' + U.maskToPrefix(c.mask) + ' dev enp0s31f6 proto kernel scope link src ' + c.ip + ' metric 100';
    }
    if (/(^|\s)(neigh|n|neighbour)(\s|$)/.test(s)) {
      var arp = h.arp;
      return Object.keys(arp).map(function (ip) { return ip + ' dev enp0s31f6 lladdr ' + U.macColon(arp[ip].mac) + ' REACHABLE'; }).join('\n');
    }
    return 'Usage: ip [ OPTIONS ] OBJECT { COMMAND | help }\n       ip -4 addr show | ip link show | ip route show default | ip -4 neigh show';
  };
  LinuxShell.prototype.ping = function (args) {
    var n = 4, target = null, size = 56, df = false;
    for (var i = 0; i < args.length; i++) {
      if (args[i] === '-c') { n = Math.min(20, parseInt(args[i + 1], 10) || 4); i++; }
      else if (args[i] === '-s') { size = Math.max(0, Math.min(65507, parseInt(args[i + 1], 10) || 56)); i++; }
      else if (args[i] === '-M') { df = args[i + 1] === 'do'; i++; }
      else if (args[i][0] !== '-') target = args[i];
    }
    if (!target) return res('ping: usage error: Destination address required');
    var ip = target;
    if (!U.isIp(target)) {
      var r = S.resolve(this.state, this.h.id, target);
      if (r.error) return res('ping: ' + target + ': Temporary failure in name resolution', { delay: r.error === 'timeout' ? 2500 : 200 });
      ip = r.ip;
    }
    if (df && size > 1472) return res('PING ' + target + ' (' + ip + ') ' + size + '(' + (size + 28) + ') bytes of data.\nping: local error: message too long, mtu=1500\n\n--- ' + target + ' ping statistics ---\n' + n + ' packets transmitted, 0 received, +' + n + ' errors, 100% packet loss');
    var p = S.ping(this.state, this.h.id, ip, { size: size + 28, df: df });
    var stream = [{ text: 'PING ' + target + ' (' + ip + ') ' + size + '(' + (size + 28) + ') bytes of data.\n', delay: 100 }];
    var ok = 0, errs = 0;
    for (var k = 1; k <= n; k++) {
      if (!p.ok && p.reason === 'frag') {
        errs++;
        stream.push({ text: 'From ' + (p.fromIp || ip) + ' icmp_seq=' + k + ' Frag needed and DF set (mtu = ' + p.mtu + ')\n', delay: 600 });
      } else if (p.ok && Math.random() >= p.loss) {
        ok++;
        stream.push({ text: (size + 8) + ' bytes from ' + ip + ': icmp_seq=' + k + ' ttl=' + p.ttl + ' time=' + (0.4 + p.hops.length * 0.7 + Math.random()).toFixed(2) + ' ms\n', delay: 700 });
      } else if (!p.ok && (p.reason === 'nolink' || p.reason === 'nogw')) {
        return res('ping: connect: Network is unreachable');
      } else if (!p.ok && p.reason === 'arp' && p.local) {
        errs++;
        if (k % 3 === 0 || k === n) stream.push({ text: 'From ' + (conf(this.h) || {}).ip + ' icmp_seq=' + k + ' Destination Host Unreachable\n', delay: 2800 });
      } else if (!p.ok && (p.reason === 'net-unreachable' || p.reason === 'acl') && p.fromIp) {
        errs++;
        stream.push({ text: 'From ' + p.fromIp + ' icmp_seq=' + k + (p.reason === 'acl' ? ' Packet filtered' : ' Destination Net Unreachable') + '\n', delay: 700 });
      } else {
        stream.push({ text: '', delay: 1000 });
      }
    }
    stream.push({ text: '\n--- ' + target + ' ping statistics ---\n' + n + ' packets transmitted, ' + ok + ' received, ' + (errs ? '+' + errs + ' errors, ' : '') + Math.round((n - ok) * 100 / n) + '% packet loss, time ' + (n * 1000 - 1000) + 'ms', delay: 100 });
    return res('', { stream: stream });
  };
  LinuxShell.prototype.trace = function (args) {
    var target = args.filter(function (x) { return x[0] !== '-'; })[0];
    if (!target) return res('Usage: traceroute <host>');
    var ip = target;
    if (!U.isIp(target)) { var r = S.resolve(this.state, this.h.id, target); if (r.error) return res(target + ': Temporary failure in name resolution'); ip = r.ip; }
    var tr = S.traceroute(this.state, this.h.id, ip);
    var stream = [{ text: 'traceroute to ' + target + ' (' + ip + '), 30 hops max, 60 byte packets\n', delay: 100 }];
    var n = 1;
    tr.forward.hops.forEach(function (hp) { stream.push({ text: U.padL(n, 2) + '  ' + hp.ip + ' (' + hp.ip + ')  0.' + (300 + n * 91) + ' ms  0.' + (280 + n * 77) + ' ms  0.' + (310 + n * 55) + ' ms\n', delay: 400 }); n++; });
    if (tr.full.ok) { if (!tr.forward.hops.length || tr.forward.hops[tr.forward.hops.length - 1].ip !== ip) stream.push({ text: U.padL(n, 2) + '  ' + ip + ' (' + ip + ')  1.012 ms  0.981 ms  0.977 ms\n', delay: 400 }); }
    else for (var k = 0; k < 4; k++) { stream.push({ text: U.padL(n, 2) + '  * * *\n', delay: 1500 }); n++; }
    return res('', { stream: stream });
  };
  // tracepath: vägen och den minsta MTU:n längs vägen (PMTU)
  LinuxShell.prototype.tracepath = function (args) {
    var target = args.filter(function (x) { return x[0] !== '-'; })[0];
    if (!target) return res('Usage: tracepath [-n] <destination>');
    var ip = target;
    if (!U.isIp(target)) { var r = S.resolve(this.state, this.h.id, target); if (r.error) return res('tracepath: ' + target + ': Name or service not known'); ip = r.ip; }
    var tr = S.traceroute(this.state, this.h.id, ip);
    var big = S.ping(this.state, this.h.id, ip, { size: 1500, df: true });
    var pmtu = !big.ok && big.reason === 'frag' ? big.mtu : 1500;
    var stream = [{ text: ' 1?: [LOCALHOST]                      pmtu 1500\n', delay: 150 }];
    var n = 1;
    tr.forward.hops.forEach(function (hp, i) {
      stream.push({ text: U.padL(n, 2) + ':  ' + U.pad(hp.ip, 34) + (0.4 + n * 0.6).toFixed(3) + 'ms ' + (i === 0 && pmtu < 1500 ? '\n' + U.padL(n, 2) + ':  ' + U.pad(hp.ip, 34) + (0.5 + n * 0.6).toFixed(3) + 'ms pmtu ' + pmtu : '') + '\n', delay: 350 });
      n++;
    });
    if (tr.full.ok) {
      if (!tr.forward.hops.length || tr.forward.hops[tr.forward.hops.length - 1].ip !== ip) { stream.push({ text: U.padL(n, 2) + ':  ' + U.pad(ip, 34) + (1 + n * 0.6).toFixed(3) + 'ms reached\n', delay: 350 }); n++; }
      stream.push({ text: '     Resume: pmtu ' + pmtu + ' hops ' + (n - 1) + ' back ' + (n - 1), delay: 100 });
    } else {
      for (var k = 0; k < 3; k++) { stream.push({ text: U.padL(n, 2) + ':  no reply\n', delay: 1200 }); n++; }
      stream.push({ text: '     Too many hops: pmtu ' + pmtu, delay: 100 });
    }
    return res('', { stream: stream });
  };
  var MAN = {
    ping: 'PING(8)\n  ping [-c antal] [-s storlek] [-M do] mål\n  -c  antal paket\n  -s  datastorlek i byte (56 som standard, + 28 byte huvud)\n  -M do  sätt DF-biten: routrar får inte dela paketet (hittar MTU-problem)',
    ssh: 'SSH(1)\n  ssh [-l användare] [användare@]värd\n  Krypterad inloggning. Första gången frågar ssh om värdens nyckel.',
    curl: 'CURL(1)\n  curl [-I] [-s] URL\n  -I  bara svarshuvudet (statuskod, server)\n  -s  tyst läge\n  Testa en lastbalanserare: for i in 1 2 3 4; do curl -s http://tid/; done',
    tracepath: 'TRACEPATH(8)\n  tracepath mål\n  Som traceroute, men visar också den minsta MTU:n på vägen (pmtu).',
    ip: 'IP(8)\n  ip -4 addr show     adresser\n  ip route show       vägar\n  ip route get <ip>   vilken väg ett paket tar\n  ip -4 neigh show    ARP-tabellen',
    screen: 'SCREEN(1)\n  screen /dev/ttyUSB0 9600\n  Seriell konsol. Ctrl+A K stänger.',
    nc: 'NC(1)\n  nc -zv värd port\n  Testar om en TCP-port svarar.',
    grep: 'GREP(1)\n  kommando | grep [-i] [-v] [-c] mönster\n  -i  skiftlägesokänsligt  -v  visa rader som INTE matchar  -c  räkna',
  };
  LinuxShell.prototype.resolvectl = function (args) {
    var c = conf(this.h);
    if (args[0] === 'query' && args[1]) {
      var r = S.resolve(this.state, this.h.id, args[1]);
      if (r.error) return args[1] + ': resolve call failed: ' + (r.error === 'timeout' ? 'All attempts to contact name servers or networks failed' : '\'' + args[1] + '\' not found');
      return args[1] + ': ' + r.ip + '                          -- link: enp0s31f6\n\n-- Information acquired via protocol DNS in 3.1ms.\n-- Data is authenticated: no; Data was acquired via local or encrypted transport: no';
    }
    return 'Global\n       Protocols: +LLMNR +mDNS -DNSOverTLS DNSSEC=no/unsupported\nresolv.conf mode: stub\n\nLink 2 (enp0s31f6)\n    Current Scopes: DNS\n         Protocols: +DefaultRoute -LLMNR -mDNS -DNSOverTLS DNSSEC=no/unsupported\nCurrent DNS Server: ' + ((c && c.dns[0]) || '') + '\n       DNS Servers: ' + ((c && c.dns.join(' ')) || '') + '\n        DNS Domain: nordvik.example';
  };
  LinuxShell.prototype.lookup = function (name) {
    if (!name) return 'Usage: nslookup <namn>';
    var c = conf(this.h);
    var r = S.resolve(this.state, this.h.id, name);
    if (r.error === 'timeout') return ';; communications error to ' + ((c && c.dns[0]) || '') + '#53: timed out\n;; no servers could be reached';
    if (r.error) return 'Server:\t\t' + ((c && c.dns[0]) || '') + '\nAddress:\t' + ((c && c.dns[0]) || '') + '#53\n\n** server can\'t find ' + name + ': NXDOMAIN';
    return 'Server:\t\t' + ((c && c.dns[0]) || '') + '\nAddress:\t' + ((c && c.dns[0]) || '') + '#53\n\nName:\t' + (name.indexOf('.') < 0 ? name + '.nordvik.example' : name) + '\nAddress: ' + r.ip;
  };
  function findIosByIp(state, ip) {
    var D = S.get(state);
    var hit = null;
    Object.keys(D.eps).forEach(function (k) {
      var e = D.eps[k];
      if (e.ip === ip && e.up && state.devices[e.dev].os === 'ios') hit = e.dev;
    });
    // Statisk NAT pekar inte på IOS-enheter här
    return hit;
  }
  LinuxShell.prototype.ssh = function (args) {
    var user = null, host = null;
    for (var i = 0; i < args.length; i++) {
      if (args[i] === '-l') { user = args[i + 1]; i++; }
      else if (args[i][0] !== '-') host = args[i];
    }
    if (!host) return res('usage: ssh [-l login_name] [user@]hostname');
    if (host.indexOf('@') > 0) { user = host.split('@')[0]; host = host.split('@')[1]; }
    user = user || 'tekniker';
    var ip = host;
    if (!U.isIp(host)) { var r = S.resolve(this.state, this.h.id, host); if (r.error) return res('ssh: Could not resolve hostname ' + host + ': Name or service not known'); ip = r.ip; }
    var p = S.ping(this.state, this.h.id, ip, { proto: 'tcp', dport: 22 });
    if (!p.ok) {
      if (p.reason === 'refused') return res('ssh: connect to host ' + host + ' port 22: Connection refused', { delay: 300 });
      if (p.reason === 'nolink' || p.reason === 'nogw') return res('ssh: connect to host ' + host + ' port 22: Network is unreachable');
      return res('ssh: connect to host ' + host + ' port 22: Connection timed out', { delay: 3500 });
    }
    var devId = findIosByIp(this.state, ip) || p.at;
    var dev = this.state.devices[devId];
    if (!dev || (dev.os !== 'ios' && dev.kind !== 'wlc' && dev.kind !== 'lb')) return res('ssh: connect to host ' + host + ' port 22: Connection refused');
    var self = this;
    var isWlc = dev.kind === 'wlc';
    // access-class på vty-linjerna: källadressen måste släppas igenom av listan
    var vl = dev.config && dev.config.lines && dev.config.lines.vty0_4;
    if (vl && vl.accessClass && p.srcUsed && !S.aclEval(this.state, devId, vl.accessClass, { src: p.srcUsed, dst: ip, proto: 'tcp', dport: 22 })) return res('ssh: connect to host ' + host + ' port 22: Connection refused', { delay: 300 });
    if (dev.kind === 'lb') {
      this.pending = { prompt: user + '@' + host + '\'s password: ', secret: true, fn: function () { return res('', { push: { kind: 'lb', dev: devId } }); } };
      return res('');
    }
    var ask = function () {
      self.pending = { prompt: user + '@' + host + '\'s password: ', secret: true, fn: function (pw) {
        var c = dev.config;
        var line = c.lines.vty0_4;
        var u = c.users[user];
        var okLogin = line.loginLocal ? (u && u.plain === pw) : (line.password && line.password === pw);
        if (!okLogin) {
          self.tries = (self.tries || 0) + 1;
          var tip = pwTip(c, user, line);
          if (self.tries >= 3) { self.tries = 0; return res(user + '@' + host + ': Permission denied (publickey,keyboard-interactive,password).' + tip); }
          ask();
          return res('Permission denied, please try again.' + tip);
        }
        self.tries = 0;
        var priv = (u && u.priv === 15) || line.privLevel === 15;
        return res('', { push: { kind: 'ios', dev: devId, via: 'ssh', privileged: priv, user: user } });
      } };
    };
    var go = function () {
      if (isWlc) return res('', { push: { kind: 'wlc', dev: devId } });
      ask();
      // Första gången visas lösenordet som spelet har satt, så att du vet vad du ska skriva
      var gu = dev.config && dev.config.users[user];
      if (gu && gu.byGame && !self.pwShown) { self.pwShown = true; return res('💡 Kontot ' + user + ' har lösenordet ' + gu.plain + ' (står på lappen vid laptopen).'); }
      return res('');
    };
    if (!this.known[ip]) {
      this.pending = { prompt: 'The authenticity of host \'' + host + ' (' + ip + ')\' can\'t be established.\nRSA key fingerprint is SHA256:' + btoa32((dev.baseMac || dev.nic.mac) + (dev.config ? dev.config.hostname : 'wlc')) + '.\nThis key is not known by any other names.\nAre you sure you want to continue connecting (yes/no/[fingerprint])? ', fn: function (a) {
        if (a !== 'yes') return res('Host key verification failed.');
        self.known[ip] = true;
        var r = go();
        r.out = 'Warning: Permanently added \'' + host + '\' (RSA) to the list of known hosts.' + (r.out ? '\n' + r.out : '');
        return r;
      } };
      return res('');
    }
    return go();
  };
  // Spelets tips om lösenordet efter ett felaktigt försök (i riktiga livet får man förstås inget sådant)
  function pwTip(c, user, line) {
    var u = c.users[user];
    if (!line.loginLocal) return line.password ? '\n💡 Linjen använder lösenordet som står under line vty i konfigurationen.' : '';
    if (!u) {
      var names = Object.keys(c.users);
      return '\n💡 Det finns inget konto som heter ' + user + '.' + (names.length ? ' Konton: ' + names.join(', ') + '.' : ' Skapa ett med username <namn> privilege 15 secret <lösenord>.');
    }
    if (u.byGame) return '\n💡 Lösenordet för ' + user + ' är ' + u.plain + ' (står på lappen vid laptopen).';
    return '\n💡 Det är lösenordet du själv satte med username ' + user + ' ... secret: ' + u.plain;
  }
  function btoa32(s) {
    var alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var h = U.hash(s), o = '';
    for (var i = 0; i < 43; i++) { o += alpha[h % 64]; h = U.hash(o + s); }
    return o;
  }
  LinuxShell.prototype.telnet = function (args) {
    var host = args[0];
    if (!host) return res('usage: telnet [host [port]]');
    var ip = host;
    var p = S.ping(this.state, this.h.id, ip, { proto: 'tcp', dport: 23 });
    var head = 'Trying ' + ip + '...\n';
    if (!p.ok) {
      if (p.reason === 'refused') return res(head + 'telnet: Unable to connect to remote host: Connection refused', { delay: 300 });
      return res(head + 'telnet: Unable to connect to remote host: Connection timed out', { delay: 3500 });
    }
    var dev = this.state.devices[p.at];
    var c = dev.config;
    var line = c.lines.vty0_4.transport === 'ssh' ? c.lines.vty5_15 : c.lines.vty0_4;
    var self = this;
    if (!line.loginLocal && !line.password) return res(head + 'Connected to ' + ip + '.\nEscape character is \'^]\'.\n\n\nPassword required, but none set\nConnection closed by foreign host.');
    if (NV.onTelnet) NV.onTelnet(dev.id);
    var user = null;
    this.pending = { prompt: 'Username: ', fn: function (u) {
      user = u;
      self.pending = { prompt: 'Password: ', secret: true, fn: function (pw) {
        var uu = c.users[user];
        var okLogin = line.loginLocal ? (uu && uu.plain === pw) : line.password === pw;
        if (!okLogin) return res('% Login invalid\n\nConnection closed by foreign host.' + pwTip(c, user, line));
        return res('', { push: { kind: 'ios', dev: dev.id, via: 'telnet', privileged: (uu && uu.priv === 15) || line.privLevel === 15, user: user } });
      } };
      return res('');
    } };
    return res(head + 'Connected to ' + ip + '.\nEscape character is \'^]\'.\n\n\nUser Access Verification\n');
  };

  // Tab-komplettering av kommandonamn och vanliga argument
  function completeFrom(words, line) {
    var m = /^(.*?)(\S*)$/.exec(line);
    var head = m[1], last = m[2];
    if (!last) return null;
    var pool = head.trim() ? ARGS : words;
    var hits = pool.filter(function (w) { return w.indexOf(last) === 0 && w !== last; });
    if (!hits.length) return null;
    var common = hits.reduce(function (a, b) { var i = 0; while (i < a.length && a[i] === b[i]) i++; return a.slice(0, i); });
    if (common.length <= last.length) return null;
    return head + common + (hits.length === 1 ? ' ' : '');
  }
  var ARGS = ['192.168.1.1', '192.168.1.10', '192.168.1.13', '192.168.1.193', '192.168.2.1', '192.168.2.193', '198.51.100.80', 'drift@192.168.1.193', 'drift@192.168.2.193', 'admin@192.168.1.13', 'admin@192.168.1.196', 'http://tid/', '/dev/ttyUSB0', 'filserver', 'www.example.com'];
  var LINUX_CMDS = ['ssh', 'screen', 'ping', 'traceroute', 'tracepath', 'curl', 'wget', 'nslookup', 'dig', 'resolvectl', 'ip', 'telnet', 'nc', 'man', 'history', 'clear', 'exit', 'echo', 'help', 'hostname', 'dmesg', 'ls', 'neofetch', 'fortune', 'uptime', 'date', 'whoami', 'sudo', 'for'];
  var WIN_CMDS = ['ipconfig', 'ping', 'tracert', 'nslookup', 'arp', 'netsh', 'curl', 'copy', 'route', 'netstat', 'getmac', 'hostname', 'whoami', 'systeminfo', 'test-netconnection', 'cls', 'exit', 'help', 'ver', 'date', 'time'];
  LinuxShell.prototype.complete = function (line) { return this.pending ? null : completeFrom(LINUX_CMDS, line); };
  WinShell.prototype.complete = function (line) { return completeFrom(WIN_CMDS, line); };

  NV.WinShell = WinShell;
  NV.LinuxShell = LinuxShell;
  NV.applyIpv4 = applyIpv4;
})();
