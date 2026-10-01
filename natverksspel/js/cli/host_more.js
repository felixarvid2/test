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
    var best = null, bd = 3;
    pool.forEach(function (w) { var d = lev(word.toLowerCase(), w); if (d < bd) { bd = d; best = w; } });
    return best;
  }
  NV.suggestCmd = suggest;
  var WIN_ALL = ['ipconfig', 'ping', 'tracert', 'nslookup', 'arp', 'netsh', 'curl', 'copy', 'route', 'netstat', 'getmac', 'hostname', 'whoami', 'systeminfo', 'test-netconnection', 'pathping', 'test-connection', 'resolve-dnsname', 'get-netipaddress', 'get-netipconfiguration', 'get-netadapter', 'net', 'w32tm', 'dir', 'tasklist', 'cls', 'exit', 'help', 'echo', 'ver', 'date', 'time'];
  var LIN_ALL = ['ssh', 'screen', 'ping', 'traceroute', 'tracepath', 'curl', 'wget', 'nslookup', 'dig', 'host', 'resolvectl', 'ip', 'telnet', 'nc', 'man', 'history', 'clear', 'exit', 'nmap', 'mtr', 'ss', 'netstat', 'route', 'ethtool', 'nmcli', 'arping', 'ssh-keygen', 'hostnamectl', 'uname', 'help', 'ls', 'cat', 'echo', 'date', 'whoami', 'uptime', 'dmesg', 'hostname', 'pwd'];

  // ================================================================ Windows
  var W = NV.WinShell.prototype, origWin = W.handle;
  var WIN_EXTRA = ['pathping', 'test-connection', 'resolve-dnsname', 'get-netipaddress', 'get-netipconfiguration', 'get-netadapter', 'net', 'w32tm', 'dir', 'cd', 'type', 'tasklist', 'set'];
  W.handle = function (line) {
    var a = args(line);
    if (!a.length) return origWin.call(this, line);
    var cmd = a[0].toLowerCase(), st = this.state, h = this.h, self = this;
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
      case 'dir': return res(' Volymen i enhet C har ingen etikett.\n Volymens serienummer är 4A1F-9C2E\n\n Innehåll i katalogen C:\\Users\\' + this.user + '\n\n2026-09-28  16:20    <KATALOG>          .\n2026-09-28  16:20    <KATALOG>          ..\n2026-09-21  09:12    <KATALOG>          Desktop\n2026-09-29  07:55    <KATALOG>          Documents\n2026-09-27  14:03    <KATALOG>          Downloads\n               0 fil(er)              0 byte\n               5 katalog(er)  182 431 744 000 byte ledigt');
      case 'cd': return res(a[1] ? '' : 'C:\\Users\\' + this.user);
      case 'type': return res(/hosts/i.test(a[1] || '') ? '# Copyright (c) 1993-2009 Microsoft Corp.\n#\n# This is a sample HOSTS file used by Microsoft TCP/IP for Windows.\n\n# localhost name resolution is handled within DNS itself.\n#\t127.0.0.1       localhost' : 'Det går inte att hitta den angivna filen.');
      case 'tasklist': return res('\nAvbildningsnamn                PID Sessionsnamn       Session#    Minnesanv.\n========================= ======== ================ =========== ============\nSystem                           4 Services                   0        144 kB\nsvchost.exe                    988 Services                   0     24 312 kB\nexplorer.exe                  5120 Console                    1     98 004 kB\nOUTLOOK.EXE                   7344 Console                    1    212 880 kB\ncmd.exe                       9012 Console                    1      4 120 kB');
      case 'set': return res('COMPUTERNAME=' + h.id.toUpperCase() + '\nUSERDOMAIN=NORDVIK\nUSERNAME=' + this.user + '\nOS=Windows_NT\nPROCESSOR_ARCHITECTURE=AMD64');
    }
    if (cmd === 'help' || cmd === '/?') {
      var r6 = origWin.call(this, line);
      r6.out += '\n\nFler kommandon:\n  ipconfig /displaydns, ipconfig /flushdns   DNS-cachen\n  ping -t <adress>                    pinga tills du avbryter\n  pathping <adress>                   väg och förlust per hopp\n  arp -d                              töm ARP-cachen\n  netstat -an                         portar som lyssnar\n  net use Z: \\\\filserver\\delat          koppla en nätverksenhet\n  net view \\\\filserver                  visa delade mappar\n  w32tm /query /status                varifrån datorn får tiden\n  PowerShell: Test-Connection, Resolve-DnsName, Get-NetIPAddress,\n              Get-NetIPConfiguration, Get-NetAdapter';
      return r6;
    }
    var rw = origWin.call(this, line);
    if (rw && /känns inte igen som ett internt/.test(rw.out || '')) { var sg = suggest(cmd, WIN_ALL); if (sg) rw.out += '\n💡 Menade du ' + sg + '?'; }
    return rw;
  };
  var origWinComplete = W.complete;
  W.complete = function (line) {
    var r = origWinComplete.call(this, line);
    if (r) return r;
    var m = /^(\S*)$/.exec(line);
    if (!m || !m[1]) return null;
    var hits = WIN_EXTRA.filter(function (w) { return w.indexOf(m[1].toLowerCase()) === 0; });
    return hits.length === 1 ? hits[0] + ' ' : null;
  };

  // ================================================================ Linux
  var L = NV.LinuxShell.prototype, origLin = L.handle;
  var MAN2 = {
    nmap: 'NMAP(1)\n  nmap -sn 192.168.1.192/26     vilka adresser svarar i nätet (ping-svep)\n  nmap -p 22,23,80 <ip>         vilka TCP-portar är öppna\n  Använd bara mot nät du har lov att skanna – här är det ditt eget.',
    mtr: 'MTR(8)\n  mtr -r -c 10 <mål>\n  Traceroute och ping i ett: förlust och svarstid per hopp.',
    ss: 'SS(8)\n  ss -tuln    portar som lyssnar på den här datorn\n  ss -tn      öppna TCP-anslutningar',
    ethtool: 'ETHTOOL(8)\n  ethtool enp0s31f6\n  Visar hastighet, duplex och om länken är uppe. Bra när en port har auto/half duplex-problem.',
    nmcli: 'NMCLI(1)\n  nmcli device status       nätverkskortens status\n  nmcli device show         adress, gateway och DNS',
    arping: 'ARPING(8)\n  arping -c 3 <ip>\n  Skickar ARP-frågor i stället för ping. Fungerar även om målet blockerar ICMP.',
    'ssh-keygen': 'SSH-KEYGEN(1)\n  ssh-keygen -R <värd>\n  Tar bort en sparad värdnyckel ur ~/.ssh/known_hosts (när en enhet har bytts ut).',
    netstat: 'NETSTAT(8)\n  netstat -rn    routingtabellen\n  netstat -tuln  portar som lyssnar',
    dhclient: 'DHCLIENT(8)\n  sudo dhclient -r    släpp adressen\n  sudo dhclient       begär en ny adress',
    traceroute: 'TRACEROUTE(8)\n  traceroute [-n] <mål>\n  Visar routrarna på vägen. * * * betyder att ett hopp inte svarar.',
    dig: 'DIG(1)\n  dig <namn>        fullständigt DNS-svar\n  dig +short <namn> bara adressen',
    nc: 'NC(1)\n  nc -zv värd port\n  Testar om en TCP-port svarar.',
  };
  L.handle = function (line) {
    if (this.pending) return origLin.call(this, line);
    var a = args(line);
    if (a[0] === 'sudo') a = a.slice(1);
    if (!a.length || /[|]|!!/.test(line)) return origLin.call(this, line);
    var cmd = a[0], st = this.state, h = this.h, self = this, c = conf(h);
    if (cmd === 'man' && MAN2[(a[1] || '').toLowerCase()]) return res(MAN2[a[1].toLowerCase()]);
    switch (cmd) {
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
      case 'hostnamectl': return res(' Static hostname: laptop\n       Icon name: computer-laptop\n         Chassis: laptop 💻\n      Machine ID: 4f1c2d9e8b7a4c3e9f0a1b2c3d4e5f60\n Operating System: Ubuntu 24.04 LTS\n          Kernel: Linux 6.8.0-45-generic\n    Architecture: x86-64');
      case 'pwd': return res('/home/tekniker');
      case 'cd': return res('');
      case 'cat':
        if (a[1] === '~/.ssh/known_hosts' || a[1] === '/home/tekniker/.ssh/known_hosts' || a[1] === '.ssh/known_hosts') {
          var ks = Object.keys(this.known || {});
          return res(ks.map(function (k2) { return k2 + ' ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC' + U.hash(k2).toString(36) + '...'; }).join('\n'));
        }
        if (a[1] === '/etc/os-release') return res('PRETTY_NAME="Ubuntu 24.04 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nVERSION="24.04 LTS (Noble Numbat)"\nID=ubuntu');
        break;
      case 'ls':
        if ((a[1] || '').indexOf('.ssh') >= 0) return res('known_hosts' + (Object.keys(this.known || {}).length ? '' : '  (tom)'));
        break;
    }
    if (cmd === 'help' || (cmd === 'man' && !a[1])) {
      var r7 = origLin.call(this, line);
      if (cmd === 'help') r7.out += '\n\nFler kommandon:\n  nmap -sn <nät/prefix>          vilka adresser svarar (ping-svep)\n  nmap -p 22,23,80 <ip>          vilka portar är öppna\n  mtr -r <mål>                   förlust och svarstid per hopp\n  arping -c 3 <ip>               ARP i stället för ping (samma nät)\n  ethtool enp0s31f6              hastighet, duplex och länk\n  nmcli device status | show     nätverkskortets status\n  ss -tuln, netstat -rn, route -n\n  ssh-keygen -R <ip>             glöm en gammal värdnyckel\n  hostnamectl, pwd, cat /etc/os-release, cat ~/.ssh/known_hosts';
      return r7;
    }
    var rl = origLin.call(this, line);
    if (rl && /: command not found$/.test(rl.out || '')) { var sl = suggest(cmd, LIN_ALL); if (sl) rl.out += '\n💡 Menade du ' + sl + '?'; }
    return rl;
  };
  var origLinComplete = L.complete;
  var LIN_EXTRA = ['nmap', 'mtr', 'ss', 'netstat', 'route', 'ethtool', 'nmcli', 'dhclient', 'arping', 'ssh-keygen', 'hostnamectl', 'pwd'];
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
