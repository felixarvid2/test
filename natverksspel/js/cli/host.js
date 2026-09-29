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
      case 'cls': return res('', { clear: true });
      case 'exit': return res('', { close: true });
      case 'getmac': return res('\nFysisk adress       Transportnamn\n=================== ==========================================================\n' + U.macDash(h.nic.mac) + '   \\Device\\Tcpip_{4E2B9A1C-7D11-4F2E-9B3A-1C5E7D9F0A21}');
      case 'netsh': return res(this.netsh(line));
      case 'help': case '/?':
        return res('Kommandon som fungerar här:\n  ipconfig [/all | /release | /renew]\n  ping <adress|namn> [-n antal]\n  tracert <adress|namn>\n  arp -a\n  nslookup <namn>\n  netsh interface ip set address "Ethernet" static <ip> <mask> <gateway>\n  netsh interface ip set address "Ethernet" dhcp\n  netsh interface ip set dns "Ethernet" static <ip>\n  hostname, getmac, cls, exit');
    }
    return res('\'' + a[0] + '\' känns inte igen som ett internt eller externt kommando,\nkörbart program eller kommandofil.');
  };
  WinShell.prototype.ipconfig = function (args) {
    var st = this.state, h = this.h;
    var flag = (args[0] || '').toLowerCase();
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
  WinShell.prototype.ping = function (args) {
    var st = this.state, h = this.h;
    var n = 4, target = null;
    for (var i = 0; i < args.length; i++) {
      if (args[i] === '-n' && args[i + 1]) { n = Math.min(20, parseInt(args[i + 1], 10) || 4); i++; }
      else if (args[i] === '-t') n = 8;
      else if (args[i][0] !== '-') target = args[i];
    }
    if (!target) return res('\nSyntax: ping [-t] [-n antal] mål\n');
    var r = this.resolveName(target);
    if (r.error) return res('Det gick inte att hitta värden ' + target + ' med ping-begäran. Kontrollera namnet och försök igen.', { delay: r.error === 'timeout' ? 2500 : 300 });
    var ip = r.ip;
    var head = U.isIp(target) ? ip : (target.indexOf('.') < 0 ? target + '.nordvik.example' : target) + ' [' + ip + ']';
    var p = S.ping(st, h.id, ip);
    var me = conf(h);
    var stream = [{ text: '\nSkickar ping-signal till ' + head + ' med 32 byte data:\n', delay: 100 }];
    var ok = 0, lostN = 0;
    var times = [];
    for (var k = 0; k < n; k++) {
      var line, delay = 900;
      if (p.ok && Math.random() >= p.loss) {
        var t = p.hops.length ? 1 + p.hops.length * 2 + Math.floor(Math.random() * 3) : 0;
        if (p.loss > 0) t += 8 + Math.floor(Math.random() * 40);
        times.push(t);
        line = 'Svar från ' + ip + ': byte=32 ' + (t < 1 ? 'tid<1 ms' : 'tid=' + t + ' ms') + ' TTL=' + p.ttl;
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
    if (NV.onHostCommand) NV.onHostCommand(this.h.id, line);
    var a = splitArgs(line);
    if (!a.length) return res('');
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
        ].join('\n'));
      case 'clear': return res('', { clear: true });
      case 'exit': case 'logout': return res('', { close: true });
      case 'whoami': return res('tekniker');
      case 'hostname': return res('laptop');
      case 'ls': return res(this.ls(a.slice(1)));
      case 'dmesg': return res(this.dmesg());
      case 'screen': case 'minicom': case 'picocom': return this.screen(a.slice(1), cmd);
      case 'ip': return res(this.ip(a.slice(1)));
      case 'ping': return this.ping(a.slice(1));
      case 'traceroute': case 'tracepath': return this.trace(a.slice(1));
      case 'resolvectl': return res(this.resolvectl(a.slice(1)));
      case 'nslookup': case 'host': case 'dig': return res(this.lookup(a[1]));
      case 'ssh': return this.ssh(a.slice(1));
      case 'telnet': return this.telnet(a.slice(1));
      case 'cat': if (a[1] === 'felrapport.md') return res('(Felrapporten fyller du i spelet med F.)'); return res('cat: ' + (a[1] || '') + ': Filen eller katalogen finns inte');
    }
    return res(cmd + ': command not found');
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
    var n = 4, target = null;
    for (var i = 0; i < args.length; i++) {
      if (args[i] === '-c') { n = Math.min(20, parseInt(args[i + 1], 10) || 4); i++; }
      else if (args[i][0] !== '-') target = args[i];
    }
    if (!target) return res('ping: usage error: Destination address required');
    var ip = target;
    if (!U.isIp(target)) {
      var r = S.resolve(this.state, this.h.id, target);
      if (r.error) return res('ping: ' + target + ': Temporary failure in name resolution', { delay: r.error === 'timeout' ? 2500 : 200 });
      ip = r.ip;
    }
    var p = S.ping(this.state, this.h.id, ip);
    var stream = [{ text: 'PING ' + target + ' (' + ip + ') 56(84) bytes of data.\n', delay: 100 }];
    var ok = 0, errs = 0;
    for (var k = 1; k <= n; k++) {
      if (p.ok && Math.random() >= p.loss) {
        ok++;
        stream.push({ text: '64 bytes from ' + ip + ': icmp_seq=' + k + ' ttl=' + p.ttl + ' time=' + (0.4 + p.hops.length * 0.7 + Math.random()).toFixed(2) + ' ms\n', delay: 700 });
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
    if (!dev || (dev.os !== 'ios' && dev.kind !== 'wlc')) return res('ssh: connect to host ' + host + ' port 22: Connection refused');
    var self = this;
    var isWlc = dev.kind === 'wlc';
    var ask = function () {
      self.pending = { prompt: user + '@' + host + '\'s password: ', secret: true, fn: function (pw) {
        var c = dev.config;
        var line = c.lines.vty0_4;
        var u = c.users[user];
        var okLogin = line.loginLocal ? (u && (u.plain || 'Krabba2026') === pw) : (line.password && line.password === pw);
        if (!okLogin) {
          self.tries = (self.tries || 0) + 1;
          if (self.tries >= 3) { self.tries = 0; return res(user + '@' + host + ': Permission denied (publickey,keyboard-interactive,password).'); }
          ask();
          return res('Permission denied, please try again.');
        }
        self.tries = 0;
        var priv = u && u.priv === 15;
        return res('', { push: { kind: 'ios', dev: devId, via: 'ssh', privileged: priv, user: user } });
      } };
    };
    var go = function () {
      if (isWlc) return res('', { push: { kind: 'wlc', dev: devId } });
      ask();
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
        var okLogin = line.loginLocal ? (uu && (uu.plain || 'Krabba2026') === pw) : line.password === pw;
        if (!okLogin) return res('% Login invalid\n\nConnection closed by foreign host.');
        return res('', { push: { kind: 'ios', dev: dev.id, via: 'telnet', privileged: uu && uu.priv === 15, user: user } });
      } };
      return res('');
    } };
    return res(head + 'Connected to ' + ip + '.\nEscape character is \'^]\'.\n\n\nUser Access Verification\n');
  };

  NV.WinShell = WinShell;
  NV.LinuxShell = LinuxShell;
  NV.applyIpv4 = applyIpv4;
})();
