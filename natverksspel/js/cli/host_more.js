// Fler kommandon i Windows- och Linux-terminalerna (version 7).
// Lägger sig framför de vanliga kommandona: känns kommandot inte igen här går det vidare.
(function () {
  var U = NV.util, S = NV.sim;
  function res(out, extra) { var r = { out: out || '' }; for (var k in extra) r[k] = extra[k]; return r; }
  function conf(h) { return S.hostIpConf(h); }
  function args(line) { return line.trim().split(/\s+/).filter(Boolean); }
  function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }
  function padL(s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; }
  function nicUp(state, h) { var e = S.get(state).eps['E:' + h.id + ':nic']; return !!(e && e.up); }
  function portOf(state, h) {
    var D = S.get(state), p = D.ports[S.key(h.id, 'nic')];
    return p || null;
  }
  // Namn som har slagits upp i sessionen sparas, som i en riktig DNS-cache
  function remember(sh, name, ip) {
    if (!name || U.isIp(name) || !ip) return;
    sh.dnsCache = sh.dnsCache || {};
    sh.dnsCache[name.toLowerCase()] = { ip: ip, at: sh.state.time || 0 };
  }
  function resolveFor(sh, name) {
    if (U.isIp(name)) return { ip: name };
    var r = S.resolve(sh.state, sh.h.id, name);
    if (!r.error) remember(sh, name, r.ip);
    return r;
  }
  function subnetHosts(cidr) {
    var m = /^(\d+\.\d+\.\d+\.\d+)\/(\d+)$/.exec(cidr || '');
    if (!m) return null;
    var pre = parseInt(m[2], 10);
    if (pre < 24 || pre > 30) return 'big';
    var mask = U.prefixToMask ? U.prefixToMask(pre) : U.intToIp((0xffffffff << (32 - pre)) >>> 0);
    var net = U.ipToInt(U.network(m[1], mask)), n = Math.pow(2, 32 - pre);
    var out = [];
    for (var i = 1; i < n - 1; i++) out.push(U.intToIp((net + i) >>> 0));
    return out;
  }
  var PORTNAMES = { 21: 'ftp', 22: 'ssh', 23: 'telnet', 25: 'smtp', 53: 'domain', 67: 'dhcps', 80: 'http', 123: 'ntp', 161: 'snmp', 443: 'https', 445: 'microsoft-ds', 514: 'syslog', 631: 'ipp', 3389: 'ms-wbt-server', 5246: 'capwap-control', 8080: 'http-proxy', 9100: 'jetdirect' };
  function deviceName(state, ip) {
    var D = S.get(state), hit = null;
    Object.keys(D.eps).forEach(function (k) { var e = D.eps[k]; if (e.ip === ip && e.up) hit = e.dev; });
    if (!hit) return null;
    var d = state.devices[hit];
    return d && d.config && d.config.hostname ? d.config.hostname.toLowerCase() : (d ? String(d.label && d.kind === 'wlc' ? 'wlc-nordvik' : d.id).toLowerCase() : null);
  }

  // Förslag när ett kommando inte finns: närmaste kända kommando (Levenshtein-avstånd högst 2)
  function lev(a, b) {
    var m = [], i, j;
    for (i = 0; i <= a.length; i++) { m[i] = [i]; }
    for (j = 0; j <= b.length; j++) m[0][j] = j;
    for (i = 1; i <= a.length; i++) for (j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return m[a.length][b.length];
  }
  function suggest(word, pool) {
    // Korta ord får bara ett litet avstånd, annars föreslås orelaterade kommandon (df → dig)
    var best = null, bd = word.length <= 2 ? 1 : (word.length <= 4 ? 2 : 3);
    pool.forEach(function (w) { var d = lev(word.toLowerCase(), w); if (d < bd && d < word.length) { bd = d; best = w; } });
    return best;
  }
  NV.suggestCmd = suggest;
  var WIN_ALL = ['ipconfig', 'ping', 'tracert', 'nslookup', 'arp', 'netsh', 'curl', 'copy', 'route', 'netstat', 'getmac', 'hostname', 'whoami', 'systeminfo', 'test-netconnection', 'pathping', 'test-connection', 'resolve-dnsname', 'get-netipaddress', 'get-netipconfiguration', 'get-netadapter', 'net', 'w32tm', 'dir', 'tasklist', 'cls', 'exit', 'help', 'echo', 'ver', 'date', 'time', 'nbtstat', 'get-netneighbor', 'clear-dnsclientcache', 'get-nettcpconnection', 'get-date', 'get-command'];
  var LIN_ALL = ['ssh', 'screen', 'ping', 'traceroute', 'tracepath', 'curl', 'wget', 'nslookup', 'dig', 'host', 'resolvectl', 'ip', 'telnet', 'nc', 'man', 'history', 'clear', 'exit', 'nmap', 'mtr', 'ss', 'netstat', 'route', 'ethtool', 'nmcli', 'arping', 'ssh-keygen', 'hostnamectl', 'uname', 'help', 'ls', 'cat', 'echo', 'date', 'whoami', 'uptime', 'dmesg', 'hostname', 'pwd', 'free', 'df', 'ps', 'lsof', 'w', 'last', 'env', 'ping6', 'ssh-copy-id', 'tcpdump', 'iperf3', 'scp'];

  // ================================================================ Windows
  var W = NV.WinShell.prototype, origWin = W.handle;
  var WIN_EXTRA = ['get-history', 'doskey', 'get-netneighbor', 'clear-dnsclientcache', 'get-nettcpconnection', 'get-date', 'get-command', 'nbtstat', 'get-netroute', 'get-dnsclientserveraddress', 'pathping', 'test-connection', 'resolve-dnsname', 'get-netipaddress', 'get-netipconfiguration', 'get-netadapter', 'net', 'w32tm', 'dir', 'cd', 'type', 'tasklist', 'set'];
  // Spelet räknar varje kommando en gång, med det namn du skrev (inte de interna anropen, som wget → curl)
  function counted(sh, fn, line) {
    if (sh.pending) return fn.call(sh, line);
    var hook = NV.onHostCommand, r;
    NV.onHostCommand = null;
    try { r = fn.call(sh, line); } finally { NV.onHostCommand = hook; }
    if (hook && line.trim()) hook(sh.h.id, line);
    return r;
  }
  W.handle = function (line) { return counted(this, winHandle, line); };
  function winHandle(line) {
    var a = args(line);
    if (!a.length) return origWin.call(this, line);
    if (line.trim() === '?') return this.handle('help');
    var cmd = a[0].toLowerCase(), st = this.state, h = this.h, self = this;
    // Historik: doskey /history i cmd och Get-History (h) i PowerShell
    this.whist = this.whist || [];
    if ((cmd === 'doskey' && /\/history/i.test(line)) || cmd === 'get-history' || (cmd === 'h' && a.length === 1)) {
      var wl = this.whist.slice();
      this.whist.push(line.trim());
      if (cmd === 'doskey') return res(wl.join('\n'));
      return res('\n  Id CommandLine\n  -- -----------\n' + wl.map(function (l, i) { return padL(i + 1, 4) + ' ' + l; }).join('\n'));
    }
    if (cmd === 'doskey') return res('💡 doskey /history visar kommandona du har skrivit.');
    this.whist.push(line.trim());
    if (this.whist.length > 200) this.whist.shift();
    // Kom ihåg uppslagna namn för ipconfig /displaydns
    if (/^(ping|tracert|nslookup|curl|curl\.exe|pathping|tnc|test-netconnection)$/.test(cmd)) {
      var nm = a.slice(1).filter(function (x) { return x[0] !== '-' && x[0] !== '/' && !/^\d+$/.test(x) && !/^https?:/i.test(x); })[0];
      if (nm) resolveFor(this, nm);
      var url = /^https?:\/\/([^\/:]+)/i.exec(a.slice(1).join(' '));
      if (url) resolveFor(this, url[1]);
    }
    if (cmd === 'ipconfig' && /\/flushdns/i.test(line)) { this.dnsCache = {}; return res('\nWindows IP-konfiguration\n\nRensade DNS-matchningscachen.'); }
    if (cmd === 'ipconfig' && /\/displaydns/i.test(line)) {
      var cache = this.dnsCache || {}, keys = Object.keys(cache);
      if (!keys.length) return res('\nWindows IP-konfiguration\n\nDNS-matchningscachen är tom. (Pinga ett namn först.)');
      return res('\nWindows IP-konfiguration\n\n' + keys.map(function (k) {
        var left = Math.max(1, 300 - Math.round((st.time || 0) - cache[k].at));
        return '    ' + k + (k.indexOf('.') < 0 ? '.nordvik.example' : '') + '\n    ----------------------------------------\n    Postnamn . . . . . . : ' + k + '\n    Posttyp  . . . . . . : 1\n    Livstid  . . . . . . : ' + left + '\n    Datalängd  . . . . . : 4\n    Avsnitt  . . . . . . : Svar\n    A-post (värd)  . . . : ' + cache[k].ip + '\n';
      }).join('\n'));
    }
    if (cmd === 'arp' && a[1] === '-d') { h.arp = {}; return res(''); }
    if (cmd === 'netsh' && /interface\s+show\s+interface/i.test(line)) {
      var upn = nicUp(st, h);
      return res('\nAdministratörstillstånd   Tillstånd     Typ              Gränssnittsnamn\n-------------------------------------------------------------------------\nAktiverad                ' + pad(upn ? 'Ansluten' : 'Frånkopplad', 14) + 'Dedikerad        Ethernet');
    }
    if (cmd === 'netsh' && /interface\s+ipv4\s+show\s+config/i.test(line)) {
      var cn = conf(h);
      return res('\nKonfiguration för gränssnittet "Ethernet"\n    DHCP aktiverat:                         ' + (h.nic.dhcp ? 'Ja' : 'Nej') + '\n    IP-adress:                              ' + (cn ? cn.ip : '–') + '\n    Undernätsprefix:                        ' + (cn ? U.network(cn.ip, cn.mask) + '/' + U.maskToPrefix(cn.mask) + ' (mask ' + cn.mask + ')' : '–') + '\n    Standardgateway:                        ' + (cn && cn.gw ? cn.gw : '') + '\n    Gatewaymått:                            0\n    Gränssnittsmått:                        25\n    DNS-servrar som konfigurerats via DHCP: ' + (cn && cn.dns ? cn.dns.join(', ') : ''));
    }
    if (cmd === 'ping' && a[1] === '-a' && a[2]) {
      var rn2 = reverse(st, a[2]);
      var rp = origWin.call(this, 'ping ' + a.slice(2).join(' '));
      if (rn2 && rp.stream && rp.stream.length) rp.stream[0].text = rp.stream[0].text.replace('till ' + a[2], 'till ' + rn2 + ' [' + a[2] + ']');
      return rp;
    }
    if (cmd === 'getmac' && /\/v/i.test(line)) return res('\nAnslutningsnamn  Nätverkskort     Fysisk adress       Transportnamn\n================ ================ =================== ==========================================================\nEthernet         Intel(R) Etherne ' + U.macDash(h.nic.mac) + '   \\Device\\Tcpip_{4E2B9A1C-7D11-4F2E-9B3A-1C5E7D9F0A21}');
    if (cmd === 'ping' && a.indexOf('-t') >= 0) {
      var rest = a.slice(1).filter(function (x) { return x !== '-t'; });
      var r = origWin.call(this, 'ping -n 8 ' + rest.join(' '));
      if (r.stream) r.stream.push({ text: '\nControl-C\n^C (ping -t pingar tills du trycker Ctrl+C – här stannar den efter 8 svar)', delay: 100 });
      return r;
    }
    if (cmd === 'netstat' && /-a/.test(line)) {
      return res('\nAktiva anslutningar\n\n  Proto  Lokal adress           Utländsk adress        Tillstånd\n  TCP    0.0.0.0:135            0.0.0.0:0              LYSSNAR\n  TCP    0.0.0.0:445            0.0.0.0:0              LYSSNAR\n  TCP    0.0.0.0:3389           0.0.0.0:0              LYSSNAR\n  UDP    0.0.0.0:5353           *:*\n  UDP    127.0.0.1:1900         *:*');
    }
    switch (cmd) {
      case 'pathping': {
        var tgt = a.slice(1).filter(function (x) { return x[0] !== '-'; })[0];
        if (!tgt) return res('Användning: pathping <målnamn>');
        var rr = resolveFor(this, tgt);
        if (rr.error) return res('Det gick inte att matcha målsystemnamnet ' + tgt + '.');
        var tr = S.traceroute(st, h.id, rr.ip), hops = tr.forward.hops.map(function (x) { return x.ip; });
        if (tr.full.ok && hops[hops.length - 1] !== rr.ip) hops.push(rr.ip);
        var me = (conf(h) || {}).ip || '0.0.0.0';
        var stream = [{ text: '\nSpårar väg till ' + tgt + ' [' + rr.ip + ']\növer högst 30 hopp:\n  0  ' + h.id + ' [' + me + ']\n', delay: 200 }];
        hops.forEach(function (ip, i) { stream.push({ text: padL(i + 1, 3) + '  ' + ip + '\n', delay: 350 }); });
        if (!tr.full.ok) stream.push({ text: padL(hops.length + 1, 3) + '     *        *        *\n', delay: 900 });
        stream.push({ text: '\nBeräknar statistik för ' + (hops.length + 1) * 25 + ' sekunder...\n', delay: 1200 });
        stream.push({ text: '            Källa till hit   Den här noden/länken\nHopp  RTT    Förlust/Skick = Pct  Förlust/Skick = Pct  Adress\n  0                                           ' + me + '\n', delay: 300 });
        hops.forEach(function (ip, i) {
          var lost = !tr.full.ok && i === hops.length - 1 ? 100 : 0;
          stream.push({ text: '                                0/ 100 =  0%   |\n' + padL(i + 1, 3) + padL((i + 1) * 2, 6) + 'ms' + padL(lost, 8) + '/ 100 = ' + padL(lost, 2) + '%' + padL(lost, 8) + '/ 100 = ' + padL(lost, 2) + '%  ' + ip + '\n', delay: 120 });
        });
        stream.push({ text: '\nSpårningen är slutförd.', delay: 100 });
        return res('', { stream: stream });
      }
      case 'test-connection': {
        var t2 = a.slice(1).filter(function (x) { return x[0] !== '-'; })[0];
        if (!t2) return res('Test-Connection: Parametern -TargetName saknas.');
        var r2 = resolveFor(this, t2);
        if (r2.error) return res('Test-Connection: Det gick inte att matcha värdnamnet ' + t2 + '.');
        var p2 = S.ping(st, h.id, r2.ip);
        var rows = ['', '   Destination: ' + t2, '', 'Ping Source           Address                   Latency BufferSize Status', '                                                   (ms)        (B)', '---- ------           -------                   ------- ---------- ------'];
        for (var i = 1; i <= 4; i++) rows.push(padL(i, 4) + ' ' + pad(h.id.toUpperCase(), 21) + pad(r2.ip, 26) + padL(p2.ok ? 1 + i % 2 : 0, 7) + padL(32, 11) + ' ' + (p2.ok ? 'Success' : 'TimedOut'));
        return res(rows.join('\n'), { delay: p2.ok ? 600 : 3000 });
      }
      case 'resolve-dnsname': {
        var n3 = a[1];
        if (!n3) return res('Resolve-DnsName: Parametern -Name saknas.');
        var r3 = resolveFor(this, n3);
        if (r3.error) return res('Resolve-DnsName : ' + n3 + ' : DNS-namnet finns inte');
        return res('\nName                                           Type   TTL   Section    IPAddress\n----                                           ----   ---   -------    ---------\n' + pad(n3 + (n3.indexOf('.') < 0 ? '.nordvik.example' : ''), 47) + 'A      300   Answer     ' + r3.ip);
      }
      case 'get-netipaddress': case 'get-netipconfiguration': {
        var c = conf(h), up = nicUp(st, h);
        if (cmd === 'get-netipaddress') return res('\nIPAddress         : ' + (c ? c.ip : '169.254.' + (U.hash(h.id) % 250 + 1) + '.' + (U.hash(h.id + 'x') % 250 + 1)) + '\nInterfaceIndex    : 12\nInterfaceAlias    : Ethernet\nAddressFamily     : IPv4\nType              : Unicast\nPrefixLength      : ' + (c ? U.maskToPrefix(c.mask) : 16) + '\nPrefixOrigin      : ' + (h.nic.dhcp ? 'Dhcp' : 'Manual') + '\nAddressState      : ' + (up ? 'Preferred' : 'Tentative'));
        return res('\nInterfaceAlias       : Ethernet\nInterfaceIndex       : 12\nInterfaceDescription : Intel(R) Ethernet Connection I219-LM\nNetProfile.Name      : nordvik.local\nIPv4Address          : ' + (c ? c.ip : '–') + '\nIPv4DefaultGateway   : ' + (c && c.gw ? c.gw : '') + '\nDNSServer            : ' + (c && c.dns ? c.dns.join(', ') : '') + '\nNetAdapter.Status    : ' + (up ? 'Up' : 'Disconnected'));
      }
      case 'get-netadapter': {
        var pt = portOf(st, h), up2 = nicUp(st, h);
        var sp = pt && pt.neg && pt.neg.speed ? pt.neg.speed + ' Mbps' : '0 bps';
        return res('\nName      InterfaceDescription                 ifIndex Status       MacAddress         LinkSpeed\n----      --------------------                 ------- ------       ----------         ---------\nEthernet  Intel(R) Ethernet Connection I219-LM      12 ' + pad(up2 ? 'Up' : 'Disconnected', 13) + U.macDash(h.nic.mac) + '  ' + (up2 ? (sp === '0 bps' ? '1 Gbps' : sp.replace('1000 Mbps', '1 Gbps')) : '0 bps'));
      }
      case 'net': {
        var sub = (a[1] || '').toLowerCase();
        if (sub === 'use') {
          var drv = a[2], share = a[3];
          if (!drv) return res('Nya anslutningar kommer att sparas.\n\nDet finns inga poster i listan.');
          var m = /^\\\\([^\\]+)\\(.+)$/.exec(share || '');
          if (!m) return res('Kommandots syntax är:\n\nNET USE [enhet:] \\\\dator\\resurs');
          var r4 = resolveFor(this, m[1]);
          if (r4.error) return res('Systemfel 53 har uppstått.\n\nNätverkssökvägen hittades inte.', { delay: 2000 });
          var p4 = S.ping(st, h.id, r4.ip, { proto: 'tcp', dport: 445 });
          if (!p4.ok) return res('Systemfel 53 har uppstått.\n\nNätverkssökvägen hittades inte.', { delay: 2500 });
          return res('Kommandot har slutförts.', { delay: 500 });
        }
        if (sub === 'view') {
          var m2 = /^\\\\(.+)$/.exec(a[2] || '');
          if (!m2) return res('Systemfel 6118 har uppstått.\n\nListan med servrar för den här arbetsgruppen är inte tillgänglig.');
          var r5 = resolveFor(this, m2[1]);
          var p5 = r5.error ? { ok: false } : S.ping(st, h.id, r5.ip, { proto: 'tcp', dport: 445 });
          if (!p5.ok) return res('Systemfel 53 har uppstått.\n\nNätverkssökvägen hittades inte.', { delay: 2500 });
          return res('Delade resurser på \\\\' + m2[1] + '\n\nResursnamn  Typ   Används som  Kommentar\n\n-------------------------------------------------------------------------------\ndelat       Disk               Gemensamma filer\nekonomi     Disk               Bara ekonomi\nscan        Disk               Skannade dokument\nKommandot har slutförts.', { delay: 600 });
        }
        return res('Kommandots syntax är:\n\nNET\n    [ USE | VIEW ]');
      }
      case 'w32tm': {
        if (!/\/query/i.test(line)) return res('w32tm /query /status');
        var gwip = (conf(h) || {}).gw;
        return res('Skottindikator: 0(ingen varning)\nSkikt: 4 (sekundär referens - synkroniserad via (S)NTP)\nPrecision: -23 (119,209ns per tick)\nRotfördröjning: 0.0039 s\nKälla: ' + (gwip ? '192.168.1.16 (ntp.nordvik.example)' : 'Local CMOS Clock') + '\nSenaste lyckade synkroniseringstid: 2026-09-29 07:58:12\nAvsökningsintervall: 10 (1024s)');
      }
      case 'get-netroute': {
        var cr = conf(h);
        if (!cr) return res('');
        return res('\nifIndex DestinationPrefix                              NextHop                                  RouteMetric ifMetric PolicyStore\n------- -----------------                              -------                                  ----------- -------- -----------\n' + (cr.gw ? '12      0.0.0.0/0                                      ' + pad(cr.gw, 41) + '0           25       ActiveStore\n' : '') + '12      ' + pad(U.network(cr.ip, cr.mask) + '/' + U.maskToPrefix(cr.mask), 47) + pad('0.0.0.0', 41) + '256         25       ActiveStore');
      }
      case 'get-dnsclientserveraddress': { var cd = conf(h); return res('\nInterfaceAlias               Interface Address ServerAddresses\n                             Index     Family\n--------------               --------- ------- ---------------\nEthernet                            12 IPv4    {' + (cd && cd.dns ? cd.dns.join(', ') : '') + '}'); }
      case 'dir': return res(' Volymen i enhet C har ingen etikett.\n Volymens serienummer är 4A1F-9C2E\n\n Innehåll i katalogen C:\\Users\\' + this.user + '\n\n2026-09-28  16:20    <KATALOG>          .\n2026-09-28  16:20    <KATALOG>          ..\n2026-09-21  09:12    <KATALOG>          Desktop\n2026-09-29  07:55    <KATALOG>          Documents\n2026-09-27  14:03    <KATALOG>          Downloads\n               0 fil(er)              0 byte\n               5 katalog(er)  182 431 744 000 byte ledigt');
      case 'cd': return res(a[1] ? '' : 'C:\\Users\\' + this.user);
      case 'type': return res(/hosts/i.test(a[1] || '') ? '# Copyright (c) 1993-2009 Microsoft Corp.\n#\n# This is a sample HOSTS file used by Microsoft TCP/IP for Windows.\n\n# localhost name resolution is handled within DNS itself.\n#\t127.0.0.1       localhost' : 'Det går inte att hitta den angivna filen.');
      case 'tasklist': return res('\nAvbildningsnamn                PID Sessionsnamn       Session#    Minnesanv.\n========================= ======== ================ =========== ============\nSystem                           4 Services                   0        144 kB\nsvchost.exe                    988 Services                   0     24 312 kB\nexplorer.exe                  5120 Console                    1     98 004 kB\nOUTLOOK.EXE                   7344 Console                    1    212 880 kB\ncmd.exe                       9012 Console                    1      4 120 kB');
      case 'nbtstat': {
        if (!/^-n$/i.test(a[1] || '')) return res('\nVisar protokollstatistik och aktuella TCP/IP-anslutningar med NBT.\n\nNBTSTAT [-n] [-c] [-a fjärrnamn] [-A IP-adress]\n💡 Prova nbtstat -n');
        var cn2 = conf(h);
        return res('\nEthernet:\nNodens IP-adress: [' + (cn2 ? cn2.ip : '0.0.0.0') + '] Scope-ID: []\n\n                Lokal NetBIOS-namntabell\n\n       Namn               Typ          Status\n    ---------------------------------------------\n    ' + pad(h.id.toUpperCase(), 15) + '<00>  UNIK         Registrerad\n    NORDVIK        <00>  GRUPP        Registrerad\n    ' + pad(h.id.toUpperCase(), 15) + '<20>  UNIK         Registrerad');
      }
      case 'get-netneighbor': {
        var rows = Object.keys(h.arp || {}).map(function (ip) { return pad('12', 8) + pad(ip, 40) + pad(U.macDash ? U.macDash(h.arp[ip].mac) : h.arp[ip].mac, 20) + 'Reachable   ActiveStore'; });
        return res('\nifIndex IPAddress                               LinkLayerAddress    State       PolicyStore\n------- ---------                               ----------------    -----       -----------\n' + (rows.join('\n') || '(ARP-tabellen är tom: pinga något först)'));
      }
      case 'clear-dnsclientcache': this.dnsCache = {}; return res('');
      case 'get-nettcpconnection': {
        var cn3 = conf(h);
        if (!cn3) return res('');
        return res('\nLocalAddress                        LocalPort RemoteAddress                       RemotePort State       AppliedSetting\n------------                        --------- -------------                       ---------- -----       --------------\n' + pad(cn3.ip, 36) + pad('50122', 10) + pad('192.168.1.10', 36) + pad('445', 11) + 'Established Internet\n' + pad('0.0.0.0', 36) + pad('135', 10) + pad('0.0.0.0', 36) + pad('0', 11) + 'Listen\n' + pad('0.0.0.0', 36) + pad('445', 10) + pad('0.0.0.0', 36) + pad('0', 11) + 'Listen');
      }
      case 'get-date': { var sec = 8 * 3600 + (st.time || 0); return res('\nden 29 september 2026 ' + ('0' + Math.floor(sec / 3600) % 24).slice(-2) + ':' + ('0' + Math.floor(sec / 60) % 60).slice(-2) + ':' + ('0' + Math.floor(sec) % 60).slice(-2) + '\n'); }
      case 'get-command': return res('\nCommandType     Name                                Source\n-----------     ----                                ------\n' + ['Clear-DnsClientCache', 'Get-DnsClientServerAddress', 'Get-NetAdapter', 'Get-NetIPAddress', 'Get-NetIPConfiguration', 'Get-NetNeighbor', 'Get-NetRoute', 'Get-NetTCPConnection', 'Resolve-DnsName', 'Test-Connection', 'Test-NetConnection'].map(function (w) { return pad('Cmdlet', 16) + pad(w, 36) + (/Dns/.test(w) ? 'DnsClient' : (/Adapter/.test(w) ? 'NetAdapter' : (/Connection$/.test(w) && w !== 'Get-NetTCPConnection' ? (w === 'Test-Connection' ? 'Microsoft.PowerShell.Management' : 'NetTCPIP') : 'NetTCPIP'))); }).join('\n'));
      case 'telnet': return res('\'telnet\' känns inte igen som ett internt eller externt kommando,\nkörbart program eller kommandofil.\n💡 Telnet-klienten är inte installerad i Windows. Testa en port med: Test-NetConnection <adress> -Port <nummer>');
      case 'set': return res('COMPUTERNAME=' + h.id.toUpperCase() + '\nUSERDOMAIN=NORDVIK\nUSERNAME=' + this.user + '\nOS=Windows_NT\nPROCESSOR_ARCHITECTURE=AMD64');
    }
    if (cmd === 'help' || cmd === '/?') {
      var r6 = origWin.call(this, line);
      r6.out += '\n\nFler kommandon:\n  ipconfig /displaydns, ipconfig /flushdns   DNS-cachen\n  ping -t <adress>                    pinga tills du avbryter\n  pathping <adress>                   väg och förlust per hopp\n  arp -d                              töm ARP-cachen\n  netstat -an                         portar som lyssnar\n  net use Z: \\\\filserver\\delat          koppla en nätverksenhet\n  net view \\\\filserver                  visa delade mappar\n  w32tm /query /status                varifrån datorn får tiden\n  ping -a <ip>                        visa namnet för en adress\n  netsh interface show interface      är nätverkskortet anslutet?\n  netsh interface ipv4 show config    adress, gateway och DNS\n  getmac /v                           MAC-adress per nätverkskort\n  PowerShell: Test-Connection, Resolve-DnsName, Get-NetIPAddress,\n              Get-NetIPConfiguration, Get-NetAdapter, Get-NetRoute,\n              Get-DnsClientServerAddress';
      return r6;
    }
    var rw = origWin.call(this, line);
    if (rw && /känns inte igen som ett internt/.test(rw.out || '')) { var sg = suggest(cmd, WIN_ALL); if (sg) rw.out += '\n💡 Menade du ' + sg + '?'; }
    return rw;
  }
  var origWinComplete = W.complete;
  W.complete = function (line) {
    var r = origWinComplete.call(this, line);
    if (r) return r;
    var m = /^(\S*)$/.exec(line);
    if (!m || !m[1]) return null;
    var hits = WIN_EXTRA.filter(function (w) { return w.indexOf(m[1].toLowerCase()) === 0; });
    return hits.length === 1 ? hits[0] + ' ' : null;
  };

  // Omvänt namnuppslag: adress → namn (från DNS-serverns ip host-tabell eller enhetens namn)
  function reverse(state, ip) {
    var R1 = state.devices.R1, hit = null;
    if (R1 && R1.config && R1.config.hosts) Object.keys(R1.config.hosts).forEach(function (n) { if (R1.config.hosts[n] === ip) hit = n + '.nordvik.example'; });
    return hit || (deviceName(state, ip) ? deviceName(state, ip) + '.nordvik.example' : null);
  }
  function ourGwPort(state, h) {
    var p = portOf(state, h);
    return p;
  }

  // ================================================================ Linux
  var L = NV.LinuxShell.prototype, origLin = L.handle;
  var MAN2 = {
    wget: 'WGET(1)\n  wget http://<adress>/\n  Hämtar en webbsida och sparar den som index.html. Läs den med cat index.html. Ger samma fel som curl när servern inte svarar.',
    ps: 'PS(1)\n  ps\n  Visar processerna i terminalen.',
    df: 'DF(1)\n  df -h\n  Visar hur mycket plats som finns kvar på diskarna.',
    free: 'FREE(1)\n  free -h\n  Visar hur mycket minne som används.',
    lsof: 'LSOF(8)\n  lsof -i\n  Visar vilka program som lyssnar på eller använder nätverksportar.',
    ping6: 'PING6(8)\n  ping6 ::1\n  Pingar en IPv6-adress. Nordviks nät kör bara IPv4.',
    w: 'W(1)\n  w\n  Visar vem som är inloggad och vad de gör.',
    nmap: 'NMAP(1)\n  nmap -sn 192.168.1.192/26     vilka adresser svarar i nätet (ping-svep)\n  nmap -p 22,23,80 <ip>         vilka TCP-portar är öppna\n  Använd bara mot nät du har lov att skanna – här är det ditt eget.',
    mtr: 'MTR(8)\n  mtr -r -c 10 <mål>\n  Traceroute och ping i ett: förlust och svarstid per hopp.',
    ss: 'SS(8)\n  ss -tuln    portar som lyssnar på den här datorn\n  ss -tn      öppna TCP-anslutningar',
    ethtool: 'ETHTOOL(8)\n  ethtool enp0s31f6\n  Visar hastighet, duplex och om länken är uppe. Bra när en port har auto/half duplex-problem.',
    nmcli: 'NMCLI(1)\n  nmcli device status       nätverkskortens status\n  nmcli device show         adress, gateway och DNS',
    arping: 'ARPING(8)\n  arping -c 3 <ip>\n  Skickar ARP-frågor i stället för ping. Fungerar även om målet blockerar ICMP.',
    tcpdump: 'TCPDUMP(8)\n  sudo tcpdump -i enp0s31f6 -c 10\n  Fångar paket på nätverkskortet: ARP, DNS, NTP, STP och annat som syns på porten.',
    iperf3: 'IPERF3(1)\n  iperf3 -c <server>\n  Mäter hur snabbt det går att skicka data till en server. Låg fart och många omsändningar tyder ofta på duplex-fel.',
    'ssh-keygen': 'SSH-KEYGEN(1)\n  ssh-keygen -R <värd>\n  Tar bort en sparad värdnyckel ur ~/.ssh/known_hosts (när en enhet har bytts ut).',
    netstat: 'NETSTAT(8)\n  netstat -rn    routingtabellen\n  netstat -tuln  portar som lyssnar',
    dhclient: 'DHCLIENT(8)\n  sudo dhclient -r    släpp adressen\n  sudo dhclient       begär en ny adress',
    traceroute: 'TRACEROUTE(8)\n  traceroute [-n] <mål>\n  Visar routrarna på vägen. * * * betyder att ett hopp inte svarar.',
    dig: 'DIG(1)\n  dig <namn>        fullständigt DNS-svar\n  dig +short <namn> bara adressen',
    nc: 'NC(1)\n  nc -zv värd port\n  Testar om en TCP-port svarar.',
  };
  // Kommandon som hanteras här ska också hamna i historiken (history, !n och ↑)
  L.handle = function (line) {
    if (this.pending) return origLin.call(this, line);
    var before = (this.hist || []).length;
    var r = counted(this, linHandle, line);
    // Det som skrevs ska stå i historiken, inte kommandot som det översattes till internt (wget → curl)
    var hh = this.hist || [];
    if (line.trim() && !/^\s*!/.test(line)) { if (hh.length === before) hh.push(line.trim()); else { hh.length = before + 1; hh[before] = line.trim(); } this.hist = hh; }
    return r;
  };
  function linHandle(line) {
    // !<n> kör om kommando nummer n i historiken
    var bang = /^\s*!(\d+)\s*$/.exec(line);
    if (bang) {
      var hc = (this.hist || [])[parseInt(bang[1], 10) - 1];
      if (!hc) return res('bash: !' + bang[1] + ': event not found');
      var rb = this.handle(hc);
      rb.out = hc + '\n' + (rb.out || '');
      return rb;
    }
    var a = args(line);
    if (a[0] === 'sudo') a = a.slice(1);
    if (line.trim() === '?') return this.handle('help');
    if (!a.length || /[|]|!!/.test(line)) return origLin.call(this, line);
    var cmd = a[0], st = this.state, h = this.h, self = this, c = conf(h);
    if (cmd === 'man' && MAN2[(a[1] || '').toLowerCase()]) return res(MAN2[a[1].toLowerCase()]);
    if (cmd === 'ip' && (a[1] === '-br' || a[1] === '-brief') && /^a/.test(a[2] || 'a')) {
      var upb = nicUp(st, h);
      return res(pad('lo', 17) + pad('UNKNOWN', 15) + '127.0.0.1/8 ::1/128\n' + pad('enp0s31f6', 17) + pad(upb ? 'UP' : 'DOWN', 15) + (c ? c.ip + '/' + U.maskToPrefix(c.mask) + ' ' : '') + 'fe80::' + h.nic.mac.slice(0, 4) + ':' + h.nic.mac.slice(4, 8) + ':' + h.nic.mac.slice(8, 12) + ':1/64');
    }
    if (cmd === 'ip' && a[1] === '-s' && /^l/.test(a[2] || '')) {
      var up3 = nicUp(st, h), rxb = up3 ? 184203311 + Math.floor((st.time || 0) * 2100) : 0;
      return res('2: enp0s31f6: <BROADCAST,MULTICAST,UP' + (up3 ? ',LOWER_UP' : '') + '> mtu 1500 qdisc fq_codel state ' + (up3 ? 'UP' : 'DOWN') + ' mode DEFAULT group default qlen 1000\n    link/ether ' + U.macColon(h.nic.mac) + ' brd ff:ff:ff:ff:ff:ff\n    RX:     bytes  packets errors dropped  missed   mcast\n    ' + padL(rxb, 13) + padL(Math.floor(rxb / 820), 9) + '      0       0       0    1204\n    TX:     bytes  packets errors dropped carrier collsns\n    ' + padL(Math.floor(rxb / 3), 13) + padL(Math.floor(rxb / 2400), 9) + '      0       0       0       0');
    }
    if (cmd === 'ip' && /^ma/.test(a[1] || '')) return res('1:\tlo\n\tinet  224.0.0.1\n\tinet6 ff02::1\n2:\tenp0s31f6\n\tlink  01:00:5e:00:00:01\n\tlink  33:33:00:00:00:01\n\tinet  224.0.0.251\n\tinet  224.0.0.1\n\tinet6 ff02::fb\n\tinet6 ff02::1');
    if (cmd === 'ip' && /^n/.test(a[1] || '') && a[2] === 'flush') { h.arp = {}; return res(''); }
    if (cmd === 'ip' && a[1] === '-6' && /^a/.test(a[2] || '')) return res('1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 state UNKNOWN qlen 1000\n    inet6 ::1/128 scope host\n2: enp0s31f6: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 state UP qlen 1000\n    inet6 fe80::' + h.nic.mac.slice(0, 4) + ':' + h.nic.mac.slice(4, 8) + ':' + h.nic.mac.slice(8, 12) + ':1/64 scope link\n       valid_lft forever preferred_lft forever');
    if (cmd === 'dig' && a[1] === '-x' && a[2]) {
      var rn = reverse(st, a[2]);
      return res('; <<>> DiG 9.18.24 <<>> -x ' + a[2] + '\n;; ->>HEADER<<- opcode: QUERY, status: ' + (rn ? 'NOERROR' : 'NXDOMAIN') + '\n\n;; QUESTION SECTION:\n;' + a[2].split('.').reverse().join('.') + '.in-addr.arpa.\tIN\tPTR\n' + (rn ? '\n;; ANSWER SECTION:\n' + a[2].split('.').reverse().join('.') + '.in-addr.arpa. 300 IN\tPTR\t' + rn + '.\n' : '') + '\n;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)');
    }
    switch (cmd) {
      case 'tcpdump': {
        if (!nicUp(st, h) || !c) return res('tcpdump: enp0s31f6: That device is not up');
        var nC = 6, ci = a.indexOf('-c'); if (ci >= 0) nC = Math.min(20, parseInt(a[ci + 1], 10) || 6);
        var gw = c.gw || c.ip, now = 8 * 3600 + (st.time || 0), lines = ['tcpdump: verbose output suppressed, use -v[v]... for full protocol decode', 'listening on enp0s31f6, link-type EN10MB (Ethernet), snapshot length 262144 bytes'];
        var pool = [
          function (t) { return t + ' ARP, Request who-has ' + gw + ' tell ' + c.ip + ', length 28'; },
          function (t) { return t + ' ARP, Reply ' + gw + ' is-at ' + (h.arp[gw] ? U.macColon(h.arp[gw].mac) : '5c:50:15:45:e2:af') + ', length 46'; },
          function (t) { return t + ' IP ' + gw + ' > 224.0.0.10: EIGRP Hello, length 40'.replace('EIGRP Hello', 'CDPv2/LLDP announce'); },
          function (t) { return t + ' STP 802.1d, Config, Flags [none], bridge-id 8063.00:1a:a1:7d:d1:bd.8008, length 43'; },
          function (t) { return t + ' IP ' + c.ip + '.41022 > ' + (c.dns && c.dns[0] || gw) + '.53: 2471+ A? filserver.nordvik.example. (43)'; },
          function (t) { return t + ' IP ' + (c.dns && c.dns[0] || gw) + '.53 > ' + c.ip + '.41022: 2471* 1/0/0 A 192.168.1.10 (59)'; },
          function (t) { return t + ' IP 192.168.1.16.123 > ' + c.ip + '.123: NTPv4, Server, length 48'; },
          function (t) { return t + ' IP 192.168.1.17.514 > 255.255.255.255.514: SYSLOG local7.notice, length 92'; },
        ];
        for (var ii = 0; ii < nC; ii++) { var sec = now + ii * 0.41; var ts = ('0' + Math.floor(sec / 3600) % 24).slice(-2) + ':' + ('0' + Math.floor(sec / 60) % 60).slice(-2) + ':' + ('0' + Math.floor(sec) % 60).slice(-2) + '.' + ('00000' + Math.floor((sec % 1) * 1e6)).slice(-6); lines.push(pool[(ii + U.hash(h.id)) % pool.length](ts)); }
        lines.push(nC + ' packets captured', nC + ' packets received by filter', '0 packets dropped by kernel');
        return res(lines.join('\n'), { delay: 1200 });
      }
      case 'iperf3': {
        var si = a.indexOf('-c'), srv = si >= 0 ? a[si + 1] : null;
        if (!srv) return res('iperf3: parameter error - must either be a client (-c) or server (-s)\nAnvänd: iperf3 -c <server>   (filservern 192.168.1.10 kör en iperf3-server)');
        var r0 = resolveFor(this, srv);
        if (r0.error) return res('iperf3: error - unable to connect to server: Name or service not known');
        var pr = S.ping(st, h.id, r0.ip);
        if (!pr.ok) return res('iperf3: error - unable to connect to server: Connection timed out', { delay: 3000 });
        var pt = portOf(st, h), mb = pt && pt.neg && pt.neg.speed ? pt.neg.speed : 1000;
        var half = pt && pt.neg && pt.neg.duplex === 'half';
        var rate = mb * (half ? 0.35 : 0.94) * (1 - (pr.loss || 0) * 3) * (pr.tunnel ? 0.6 : 1);
        if (r0.ip.indexOf('192.168.2.') === 0) rate = Math.min(rate, 95);
        var out2 = ['Connecting to host ' + r0.ip + ', port 5201', '[  5] local ' + c.ip + ' port 48122 connected to ' + r0.ip + ' port 5201', '[ ID] Interval           Transfer     Bitrate         Retr'];
        for (var sI = 0; sI < 5; sI++) { var rr2 = Math.max(0.5, rate * (0.96 + ((U.hash(srv + sI) % 8) / 100))); out2.push('[  5]   ' + sI + '.00-' + (sI + 1) + '.00   sec  ' + padL((rr2 / 8).toFixed(1), 5) + ' MBytes  ' + padL(rr2.toFixed(0), 4) + ' Mbits/sec  ' + padL(half ? 40 + sI * 7 : 0, 3)); }
        out2.push('- - - - - - - - - - - - - - - - - - - - - - - - -', '[  5]   0.00-5.00   sec  ' + padL((rate * 5 / 8).toFixed(0), 5) + ' MBytes  ' + padL(rate.toFixed(0), 4) + ' Mbits/sec                  sender', '', 'iperf Done.' + (half ? '\n💡 Många omsändningar (Retr) och låg fart: kontrollera duplex på switchporten.' : ''));
        return res('', { stream: out2.map(function (l, i) { return { text: l + '\n', delay: i > 2 && i < 8 ? 600 : 50 }; }) });
      }
      case 'nmap': {
        var target = a.slice(1).filter(function (x) { return x[0] !== '-' && !/^\d+(,\d+)*$/.test(x); })[0];
        if (!target) return res('Nmap 7.94SVN ( https://nmap.org )\nUsage: nmap [Scan Type(s)] [Options] {target specification}\n  nmap -sn 192.168.1.192/26\n  nmap -p 22,23,80 192.168.1.193');
        var head = 'Starting Nmap 7.94SVN ( https://nmap.org ) at 2026-09-29 ' + '08:' + ('0' + Math.floor((st.time || 0) / 60) % 60).slice(-2) + ' CEST\n';
        if (a.indexOf('-sn') >= 0) {
          var hosts = subnetHosts(target);
          if (hosts === 'big') return res(head + 'Det här labbet skannar högst ett /24-nät åt gången. Prova till exempel 192.168.1.192/26.');
          if (!hosts) hosts = [target];
          var up = [], stream = [{ text: head, delay: 200 }];
          hosts.forEach(function (ip) {
            if (c && ip === c.ip) { up.push(ip); return; }
            var p = S.ping(st, h.id, ip);
            if (p.ok) up.push(ip);
          });
          up.forEach(function (ip) { var nm = c && ip === c.ip ? 'laptop' : deviceName(st, ip); stream.push({ text: 'Nmap scan report for ' + (nm ? nm + ' (' + ip + ')' : ip) + '\nHost is up (0.00' + (U.hash(ip) % 9 + 1) + 's latency).\n', delay: 120 }); });
          stream.push({ text: 'Nmap done: ' + hosts.length + ' IP address' + (hosts.length > 1 ? 'es' : '') + ' (' + up.length + ' host' + (up.length === 1 ? '' : 's') + ' up) scanned in ' + (1 + hosts.length * 0.03).toFixed(2) + ' seconds', delay: 500 });
          return res('', { stream: stream });
        }
        var pi = a.indexOf('-p'), ports = pi >= 0 && a[pi + 1] ? a[pi + 1].split(',').map(Number).filter(Boolean) : [22, 23, 53, 80, 443, 445];
        var r = resolveFor(this, target);
        if (r.error) return res(head + 'Failed to resolve "' + target + '".\nWARNING: No targets were specified, so 0 hosts scanned.\nNmap done: 0 IP addresses (0 hosts up) scanned in 0.05 seconds');
        var alive = S.ping(st, h.id, r.ip);
        var rows = [head + 'Nmap scan report for ' + (deviceName(st, r.ip) ? deviceName(st, r.ip) + ' (' + r.ip + ')' : r.ip)];
        if (!alive.ok && alive.reason !== 'acl') return res(rows[0].split('\n')[0] + '\nNote: Host seems down. If it is really up, but blocking our ping probes, try -Pn\nNmap done: 1 IP address (0 hosts up) scanned in 3.04 seconds', { delay: 2500 });
        rows.push('Host is up (0.0011s latency).', '', 'PORT     STATE    SERVICE');
        ports.slice(0, 20).forEach(function (pn) {
          var t = S.ping(st, h.id, r.ip, { proto: 'tcp', dport: pn });
          var state = t.ok ? 'open' : (t.reason === 'refused' ? 'closed' : 'filtered');
          rows.push(pad(pn + '/tcp', 9) + pad(state, 9) + (PORTNAMES[pn] || 'unknown'));
        });
        rows.push('', 'Nmap done: 1 IP address (1 host up) scanned in 1.21 seconds');
        return res(rows.join('\n'), { delay: 900 });
      }
      case 'mtr': {
        var t2 = a.slice(1).filter(function (x) { return x[0] !== '-' && !/^\d+$/.test(x); })[0];
        if (!t2) return res('mtr: No hostname specified');
        var r2 = resolveFor(this, t2);
        if (r2.error) return res('mtr: Failed to resolve host: ' + t2 + ': Name or service not known');
        var tr = S.traceroute(st, h.id, r2.ip), hops = tr.forward.hops.map(function (x) { return x.ip; });
        if (tr.full.ok && hops[hops.length - 1] !== r2.ip) hops.push(r2.ip);
        var o = ['Start: 2026-09-29T08:00:00+0200', 'HOST: laptop                      Loss%   Snt   Last   Avg  Best  Wrst StDev'];
        hops.forEach(function (ip, i) { o.push(padL(i + 1, 3) + '.|-- ' + pad(ip, 28) + padL('0.0%', 6) + padL(10, 6) + padL((0.5 + i * 0.7).toFixed(1), 7) + padL((0.6 + i * 0.7).toFixed(1), 6) + padL((0.4 + i * 0.7).toFixed(1), 6) + padL((1.2 + i * 0.7).toFixed(1), 6) + padL('0.2', 6)); });
        if (!tr.full.ok) o.push(padL(hops.length + 1, 3) + '.|-- ???                          100.0    10    0.0   0.0   0.0   0.0   0.0');
        return res(o.join('\n'), { delay: 1500 });
      }
      case 'ss': case 'netstat': {
        if (/-r/.test(line) && cmd === 'netstat') {
          if (!c) return res('Kernel IP routing table\nDestination     Gateway         Genmask         Flags   MSS Window  irtt Iface');
          return res('Kernel IP routing table\nDestination     Gateway         Genmask         Flags   MSS Window  irtt Iface\n' + (c.gw ? pad('0.0.0.0', 16) + pad(c.gw, 16) + pad('0.0.0.0', 16) + 'UG        0 0          0 enp0s31f6\n' : '') + pad(U.network(c.ip, c.mask), 16) + pad('0.0.0.0', 16) + pad(c.mask, 16) + 'U         0 0          0 enp0s31f6');
        }
        var fl = a.slice(1).filter(function (x) { return x[0] === '-'; }).join('');
        if (cmd === 'ss' && fl.indexOf('t') >= 0 && fl.indexOf('l') < 0) return res('State    Recv-Q   Send-Q     Local Address:Port      Peer Address:Port  Process');
        return res((cmd === 'ss' ? 'Netid  State   Recv-Q  Send-Q   Local Address:Port    Peer Address:Port  Process\nudp    UNCONN  0       0        127.0.0.53%lo:53           0.0.0.0:*\ntcp    LISTEN  0       4096     127.0.0.53%lo:53           0.0.0.0:*\ntcp    LISTEN  0       128          127.0.0.1:631          0.0.0.0:*' : 'Active Internet connections (only servers)\nProto Recv-Q Send-Q Local Address           Foreign Address         State\ntcp        0      0 127.0.0.53:53           0.0.0.0:*               LISTEN\ntcp        0      0 127.0.0.1:631           0.0.0.0:*               LISTEN\nudp        0      0 127.0.0.53:53           0.0.0.0:*'));
      }
      case 'route': {
        if (!c) return res('Kernel IP routing table\nDestination     Gateway         Genmask         Flags Metric Ref    Use Iface');
        return res('Kernel IP routing table\nDestination     Gateway         Genmask         Flags Metric Ref    Use Iface\n' + (c.gw ? pad('0.0.0.0', 16) + pad(c.gw, 16) + pad('0.0.0.0', 16) + 'UG    100    0        0 enp0s31f6\n' : '') + pad(U.network(c.ip, c.mask), 16) + pad('0.0.0.0', 16) + pad(c.mask, 16) + 'U     100    0        0 enp0s31f6');
      }
      case 'ethtool': {
        var pt = portOf(st, h), up = nicUp(st, h);
        var sp = pt && pt.neg ? pt.neg.speed : null, dp = pt && pt.neg ? pt.neg.duplex : null;
        return res('Settings for ' + (a[1] || 'enp0s31f6') + ':\n\tSupported ports: [ TP ]\n\tSupported link modes:   10baseT/Half 10baseT/Full\n\t                        100baseT/Half 100baseT/Full\n\t                        1000baseT/Full\n\tAuto-negotiation: on\n\tSpeed: ' + (up && sp ? sp + 'Mb/s' : 'Unknown!') + '\n\tDuplex: ' + (up && dp ? (dp === 'half' ? 'Half' : 'Full') : 'Unknown! (255)') + '\n\tPort: Twisted Pair\n\tMDI-X: on (auto)\n\tLink detected: ' + (up ? 'yes' : 'no'));
      }
      case 'nmcli': {
        var up2 = nicUp(st, h);
        if (/show/.test(line)) return res('GENERAL.DEVICE:                         enp0s31f6\nGENERAL.TYPE:                           ethernet\nGENERAL.HWADDR:                         ' + U.macColon(h.nic.mac).toUpperCase() + '\nGENERAL.STATE:                          ' + (up2 ? '100 (connected)' : '20 (unavailable)') + '\nWIRED-PROPERTIES.CARRIER:               ' + (up2 ? 'on' : 'off') + '\nIP4.ADDRESS[1]:                         ' + (c ? c.ip + '/' + U.maskToPrefix(c.mask) : '') + '\nIP4.GATEWAY:                            ' + (c && c.gw ? c.gw : '--') + '\nIP4.DNS[1]:                             ' + (c && c.dns && c.dns[0] ? c.dns[0] : ''));
        return res('DEVICE     TYPE      STATE         CONNECTION\nenp0s31f6  ethernet  ' + pad(up2 ? 'connected' : 'unavailable', 14) + (up2 ? 'Nordvik drift' : '--') + '\nlo         loopback  connected (externally)  lo');
      }
      case 'dhclient': {
        if (!h.nic.dhcp) return res('Laptopen har en statisk adress (' + (c ? c.ip : '') + ') i drift-VLAN:et, så den frågar ingen DHCP-server.\nTips: datorerna på kontoret använder DHCP – där fungerar ipconfig /renew.');
        if (a.indexOf('-r') >= 0) { S.release(st, h.id); return res(''); }
        S.dhcp(st, h.id); return res('', { delay: 1200 });
      }
      case 'arping': {
        var t3 = a.slice(1).filter(function (x) { return x[0] !== '-' && !/^\d+$/.test(x); })[0];
        if (!t3 || !U.isIp(t3)) return res('Usage: arping [-c count] <ip>');
        if (!c || !U.sameSubnet(t3, c.ip, c.mask)) return res('arping: ' + t3 + ' finns inte i det lokala nätet – ARP fungerar bara inom samma subnät.');
        var p3 = S.ping(st, h.id, t3);
        var ok = p3.ok || p3.reason === 'acl' || p3.reason === 'refused';
        var mac = ok && h.arp && h.arp[t3] ? U.macColon(h.arp[t3].mac) : null;
        var lines = ['ARPING ' + t3];
        for (var k = 0; k < 3; k++) lines.push(mac ? '60 bytes from ' + mac + ' (' + t3 + '): index=' + k + ' time=' + (0.3 + k * 0.1).toFixed(3) + ' msec' : 'Timeout');
        lines.push('', '--- ' + t3 + ' statistics ---', '3 packets transmitted, ' + (mac ? 3 : 0) + ' packets received, ' + (mac ? '0' : '100') + '% unanswered (0 extra)');
        return res(lines.join('\n'), { delay: mac ? 900 : 3000 });
      }
      case 'ssh-keygen': {
        var hi = a.indexOf('-R');
        if (hi < 0 || !a[hi + 1]) return res('usage: ssh-keygen -R hostname');
        var host = a[hi + 1];
        var had = this.known && this.known[host];
        if (this.known) delete this.known[host];
        return res(had ? '# Host ' + host + ' found: line 1\n/home/tekniker/.ssh/known_hosts updated.\nOriginal contents retained as /home/tekniker/.ssh/known_hosts.old' : 'Host ' + host + ' not found in /home/tekniker/.ssh/known_hosts');
      }
      case 'scp': {
        var src = a[1], dst = a[2];
        var m = /^(?:([^@\s]+)@)?([^:\s]+):(\S+)$/.exec(src || '');
        if (!m || !dst) return res('usage: scp drift@<ip>:running-config backup.cfg\n💡 Routern måste ha ip scp server enable för att lämna ut filer.');
        var r9 = resolveFor(this, m[2]);
        if (r9.error) return res('ssh: Could not resolve hostname ' + m[2] + ': Name or service not known');
        var p9 = S.ping(st, h.id, r9.ip, { proto: 'tcp', dport: 22 });
        if (!p9.ok) return res('ssh: connect to host ' + m[2] + ' port 22: ' + (p9.reason === 'refused' ? 'Connection refused' : 'Connection timed out'), { delay: p9.reason === 'refused' ? 300 : 3000 });
        var tid = null, D9 = S.get(st);
        Object.keys(D9.eps).forEach(function (k) { var e = D9.eps[k]; if (e.ip === r9.ip && e.up && st.devices[e.dev].os === 'ios') tid = e.dev; });
        var dev9 = tid && st.devices[tid];
        if (!dev9) return res('scp: ' + m[3] + ': No such file or directory');
        var user9 = m[1] || 'tekniker', u9 = dev9.config.users[user9];
        var self9 = this;
        this.pending = { prompt: user9 + '@' + m[2] + '\'s password: ', secret: true, fn: function (pw) {
          if (!u9 || u9.plain !== pw) return res('Permission denied, please try again.' + (u9 && u9.byGame ? '\n💡 Lösenordet för ' + user9 + ' är ' + u9.plain + '.' : ''));
          if (!dev9.config.scpServer) return res('scp: Connection closed\n💡 Routern lämnar bara ut filer med scp om ip scp server enable är konfigurerat.');
          var file = /running/.test(m[3]) ? NV.iosShow.runningConfig(st, dev9) : (/startup/.test(m[3]) ? (dev9.startup ? NV.iosShow.runningConfig(st, dev9, dev9.startup) : null) : null);
          if (!file) return res('scp: ' + m[3] + ': No such file or directory');
          self9.files = self9.files || {};
          var name = dst === '.' ? m[3] : dst;
          self9.files[name] = file;
          return res(pad(m[3], 40) + '100% ' + padL(file.length, 6) + '   ' + (file.length / 1024 / 0.3).toFixed(1) + 'KB/s   00:00', { delay: 700 });
        } };
        return res('');
      }
      case 'curl':
        if (a.indexOf('-v') >= 0) {
          var uu = a.slice(1).filter(function (x) { return x[0] !== '-'; })[0] || '';
          var mm = /^(?:https?:\/\/)?([^\/:]+)(?::(\d+))?(\/\S*)?/i.exec(uu);
          if (!mm) break;
          var rv = resolveFor(this, mm[1]);
          var base = origLin.call(this, 'curl ' + uu);
          if (rv.error) return res('* Could not resolve host: ' + mm[1] + '\n' + base.out, { delay: base.delay });
          var portv = mm[2] || (/^https/i.test(uu) ? 443 : 80);
          var okv = !/curl: \(/.test(base.out);
          return res('*   Trying ' + rv.ip + ':' + portv + '...\n' + (okv ? '* Connected to ' + mm[1] + ' (' + rv.ip + ') port ' + portv + '\n> GET ' + (mm[3] || '/') + ' HTTP/1.1\n> Host: ' + mm[1] + '\n> User-Agent: curl/8.5.0\n> Accept: */*\n>\n< HTTP/1.1 200 OK\n< Content-Type: text/html; charset=utf-8\n<\n' : '') + base.out + (okv ? '\n* Connection #0 to host ' + mm[1] + ' left intact' : ''), { delay: base.delay });
        }
        break;
      case 'ping':
        if (a.indexOf('-q') >= 0) {
          var rq = origLin.call(this, a.filter(function (x) { return x !== '-q'; }).join(' '));
          if (rq.stream) { var txt = rq.stream.map(function (x) { return x.text; }).join(''); var lines2 = txt.split('\n'); return res(lines2[0] + '\n' + lines2.slice(lines2.findIndex(function (l) { return /statistics/.test(l); }) - 1).join('\n'), { delay: 1500 }); }
          return rq;
        }
        break;
      case 'ssh':
        if (a[1] === '-V') return res('OpenSSH_9.6p1 Ubuntu-3ubuntu13.5, OpenSSL 3.0.13 30 Jan 2024');
        break;
      case 'hostnamectl': return res(' Static hostname: laptop\n       Icon name: computer-laptop\n         Chassis: laptop 💻\n      Machine ID: 4f1c2d9e8b7a4c3e9f0a1b2c3d4e5f60\n Operating System: Ubuntu 24.04 LTS\n          Kernel: Linux 6.8.0-45-generic\n    Architecture: x86-64');
      case 'free': return res('               total        used        free      shared  buff/cache   available\nMem:            15Gi       3,2Gi       8,9Gi       412Mi       3,4Gi        11Gi\nSwap:          2,0Gi          0B       2,0Gi');
      case 'df': return res('Filesystem      Size  Used Avail Use% Mounted on\ntmpfs           1,6G  2,1M  1,6G   1% /run\n/dev/nvme0n1p2  468G   61G  384G  14% /\n/dev/nvme0n1p1  1,1G  6,2M  1,1G   1% /boot/efi');
      case 'ps': return res('    PID TTY          TIME CMD\n   2231 pts/0    00:00:00 bash\n' + '   2402 pts/0    00:00:00 ps');
      case 'lsof': return res('COMMAND    PID     USER   FD   TYPE DEVICE SIZE/OFF NODE NAME\nsystemd-r  611 systemd-resolve 13u IPv4  21345      0t0  UDP 127.0.0.53:53\nsshd       902     root    3u  IPv4  23011      0t0  TCP *:22 (LISTEN)\nchronyd    744  _chrony    5u  IPv4  22987      0t0  UDP 127.0.0.1:323');
      case 'w': { var sec2 = 8 * 3600 + (st.time || 0), hhmm = ('0' + Math.floor(sec2 / 3600) % 24).slice(-2) + ':' + ('0' + Math.floor(sec2 / 60) % 60).slice(-2); return res(' ' + hhmm + ':00 up 3 days,  2:14,  1 user,  load average: 0,08, 0,12, 0,10\nUSER     TTY      FROM             LOGIN@   IDLE   JCPU   PCPU WHAT\ntekniker pts/0    -                08:00    0.00s  0.04s  0.00s w'); }
      case 'last': return res('tekniker pts/0        :0               Tue Sep 29 08:00   still logged in\ntekniker pts/0        :0               Mon Sep 28 07:58 - 16:31  (08:33)\nreboot   system boot  6.8.0-45-generic Sat Sep 26 06:12   still running\n\nwtmp begins Tue Sep  1 07:55:02 2026');
      case 'env': return res('USER=tekniker\nHOME=/home/tekniker\nSHELL=/bin/bash\nLANG=sv_SE.UTF-8\nPATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin\nTERM=xterm-256color\nHOSTNAME=laptop');
      case 'ping6': {
        var t7 = a.slice(1).filter(function (x) { return x[0] !== '-' && !/^\d+$/.test(x); })[0];
        if (!t7) return res('ping6: usage error: Destination address required');
        if (t7 === '::1' || t7 === 'localhost') return res('', { stream: [0, 1, 2, 3].map(function (i) { return { text: (i ? '64 bytes from ::1: icmp_seq=' + i + ' ttl=64 time=0.0' + (3 + i) + ' ms' : 'PING ::1(::1) 56 data bytes') + '\n', delay: i ? 1000 : 50 }; }) });
        return res('ping6: connect: Network is unreachable\n💡 Nordviks nät kör bara IPv4. Datorn har bara en länklokal IPv6-adress (fe80::), som inte kan nå andra nät.');
      }
      case 'ssh-copy-id': {
        var t6 = a.slice(1).filter(function (x) { return x[0] !== '-'; })[0] || '';
        return res('/usr/bin/ssh-copy-id: INFO: attempting to log in with the new key(s)\n/usr/bin/ssh-copy-id: ERROR: ' + (t6 || 'host') + ' is a Cisco IOS device: no shell to install authorized_keys in\n💡 På Cisco-enheter läggs nycklar in med ip ssh pubkey-chain i konfigurationsläget. I spelet räcker lösenord.');
      }
      case 'wget': {
        var wu = a.slice(1).filter(function (x) { return x[0] !== '-'; })[0];
        if (!wu) return res('wget: missing URL\nUsage: wget [OPTION]... [URL]...');
        var wb = origLin.call(this, 'curl ' + wu), wm = /^(?:https?:\/\/)?([^\/:]+)/i.exec(wu), wsec = 8 * 3600 + (st.time || 0);
        var stamp = '--2026-09-29 ' + ('0' + Math.floor(wsec / 3600) % 24).slice(-2) + ':' + ('0' + Math.floor(wsec / 60) % 60).slice(-2) + ':00--  ' + (/^https?:/.test(wu) ? wu : 'http://' + wu + '/');
        if (/Could not resolve/.test(wb.out)) return res(stamp + '\nResolving ' + wm[1] + ' (' + wm[1] + ')... failed: Name or service not known.\nwget: unable to resolve host address \u2018' + wm[1] + '\u2019', { delay: wb.delay });
        var wr = resolveFor(this, wm[1]), wip = wr.ip || wm[1];
        if (/curl: \(/.test(wb.out)) return res(stamp + '\nConnecting to ' + wm[1] + ' (' + wm[1] + ')|' + wip + '|:80... failed: ' + (/timed out|Timeout/i.test(wb.out) ? 'Connection timed out' : 'Connection refused') + '.', { delay: wb.delay });
        this.files = this.files || {}; this.files['index.html'] = wb.out;
        return res(stamp + '\nConnecting to ' + wm[1] + ' (' + wm[1] + ')|' + wip + '|:80... connected.\nHTTP request sent, awaiting response... 200 OK\nLength: ' + wb.out.length + ' (' + (wb.out.length / 1024).toFixed(1) + 'K) [text/html]\nSaving to: \u2018index.html\u2019\n\nindex.html          100%[===================>]   ' + wb.out.length + '  --.-KB/s    in 0s\n\n\u2018index.html\u2019 saved [' + wb.out.length + '/' + wb.out.length + ']\n💡 Visa filen med cat index.html', { delay: wb.delay });
      }
      case 'history':
        if (/^\d+$/.test(a[1] || '')) { var hh = origLin.call(this, line).out.split('\n'); return res(hh.slice(-parseInt(a[1], 10)).join('\n')); }
        break;
      case 'pwd': return res('/home/tekniker');
      case 'cd': return res('');
      case 'cat':
        if (this.files && this.files[a[1]]) return res(this.files[a[1]]);
        if (a[1] === '~/.ssh/known_hosts' || a[1] === '/home/tekniker/.ssh/known_hosts' || a[1] === '.ssh/known_hosts') {
          var ks = Object.keys(this.known || {});
          return res(ks.map(function (k2) { return k2 + ' ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC' + U.hash(k2).toString(36) + '...'; }).join('\n'));
        }
        if (a[1] === '/etc/os-release') return res('PRETTY_NAME="Ubuntu 24.04 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nVERSION="24.04 LTS (Noble Numbat)"\nID=ubuntu');
        break;
      case 'ls':
        if (!a[1] && this.files && Object.keys(this.files).length) { var lr = origLin.call(this, line); lr.out = (lr.out ? lr.out + '  ' : '') + Object.keys(this.files).join('  '); return lr; }
        if ((a[1] || '').indexOf('.ssh') >= 0) return res('known_hosts' + (Object.keys(this.known || {}).length ? '' : '  (tom)'));
        break;
    }
    if (cmd === 'help' || (cmd === 'man' && !a[1])) {
      var r7 = origLin.call(this, line);
      if (cmd === 'help') r7.out += '\n\nFler kommandon:\n  nmap -sn <nät/prefix>          vilka adresser svarar (ping-svep)\n  sudo tcpdump -i enp0s31f6 -c 10  fånga paket på nätverkskortet\n  iperf3 -c <server>             mät överföringshastigheten\n  ip -br a, ip -s link, ip -6 a, ip neigh flush all, dig -x <ip>\n  scp drift@<ip>:running-config backup.cfg   säkerhetskopia (kräver ip scp server enable)\n  curl -v <url>, ping -q -c 10 <ip>, ssh -V\n  nmap -p 22,23,80 <ip>          vilka portar är öppna\n  mtr -r <mål>                   förlust och svarstid per hopp\n  arping -c 3 <ip>               ARP i stället för ping (samma nät)\n  ethtool enp0s31f6              hastighet, duplex och länk\n  nmcli device status | show     nätverkskortets status\n  ss -tuln, netstat -rn, route -n\n  ssh-keygen -R <ip>             glöm en gammal värdnyckel\n  hostnamectl, pwd, cat /etc/os-release, cat ~/.ssh/known_hosts';
      return r7;
    }
    var rl = origLin.call(this, line);
    if (rl && /: command not found$/.test(rl.out || '')) { var sl = suggest(cmd, LIN_ALL); if (sl) rl.out += '\n💡 Menade du ' + sl + '?'; }
    return rl;
  }
  var origLinComplete = L.complete;
  var LIN_EXTRA = ['wget', 'free', 'df', 'ps', 'lsof', 'last', 'env', 'ping6', 'ssh-copy-id', 'scp', 'tcpdump', 'iperf3', 'nmap', 'mtr', 'ss', 'netstat', 'route', 'ethtool', 'nmcli', 'dhclient', 'arping', 'ssh-keygen', 'hostnamectl', 'pwd'];
  L.complete = function (line) {
    var r = origLinComplete.call(this, line);
    if (r) return r;
    if (this.pending) return null;
    var m = /^(\S*)$/.exec(line);
    if (!m || !m[1]) return null;
    var hits = LIN_EXTRA.filter(function (w) { return w.indexOf(m[1]) === 0; });
    return hits.length === 1 ? hits[0] + ' ' : null;
  };
})();
