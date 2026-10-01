// Utskrifter för Cisco IOS: show-kommandon och running-config.
NV.iosShow = (function () {
  var U = NV.util, S = NV.sim;
  var pad = U.pad, padL = U.padL;

  function isSw(d) { return d.kind === 'switch'; }
  function ifaceNames(d) {
    var names = Object.keys(d.config.ifaces);
    function rank(n) {
      if (/^Embedded/.test(n)) return [0, 0, 0];
      var m = /^GigabitEthernet0\/(\d+)(?:\.(\d+))?$/.exec(n);
      if (m) return [1, parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : -1];
      var lo = /^Loopback(\d+)$/.exec(n);
      if (lo) return [2, parseInt(lo[1], 10), 0];
      var v = /^Vlan(\d+)$/.exec(n);
      if (v) return [3, parseInt(v[1], 10), 0];
      return [4, 0, 0];
    }
    names.sort(function (a, b) {
      var x = rank(a), y = rank(b);
      for (var i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
      return 0;
    });
    return names;
  }
  function physPorts(d) {
    return ifaceNames(d).filter(function (n) { return /^GigabitEthernet0\/\d+$/.test(n); });
  }
  function portState(state, d, n) {
    var D = S.get(state);
    var i = d.config.ifaces[n];
    var p = D.ports[S.key(d.id, n)];
    if (i.shutdown) return 'disabled';
    if (d.rt.errdisabled[n]) return 'err-disabled';
    if (!p || !p.up) return 'notconnect';
    if (isSw(d) && S.opMode(state, d.id, n) === 'access' && !S.vlanExists(d, i.accessVlan)) return 'inactive';
    return 'connected';
  }

  // ---------------------------------------------------------------- running-config
  function aceText(type, r) {
    if (r.remark) return 'remark ' + r.remark;
    function addr(a) {
      if (!a || a.any) return 'any';
      if (a.host) return 'host ' + a.host;
      if (type === 'standard' && (!a.wild || a.wild === '0.0.0.0')) return a.ip;
      return a.ip + ' ' + a.wild;
    }
    var act = r.action === 'deny' ? 'deny  ' : 'permit';
    if (type === 'standard') return act + ' ' + addr(r.src);
    var s = act + ' ' + (r.proto || 'ip') + ' ' + addr(r.src) + ' ' + addr(r.dst);
    if (r.dport) s += r.dop === 'range' ? ' range ' + portName(r.dport) + ' ' + portName(r.dport2) : ' ' + (r.dop || 'eq') + ' ' + portName(r.dport);
    if (r.log) s += ' log';
    return s;
  }
  function portName(p) {
    return { 21: 'ftp', 22: '22', 23: 'telnet', 25: 'smtp', 53: 'domain', 67: 'bootps', 68: 'bootpc', 80: 'www', 110: 'pop3', 123: 'ntp', 161: 'snmp', 443: '443', 514: 'syslog' }[p] || String(p);
  }
  function lineCfg(l, isCon, enc) {
    var out = [];
    if (l.accessClass && !isCon) out.push(' access-class ' + l.accessClass + ' in');
    if (l.privLevel != null) out.push(' privilege level ' + l.privLevel);
    if (isCon && l.logSync) out.push(' logging synchronous');
    if (l.password) out.push(enc ? ' password 7 ' + fakeType7(l.password) : ' password ' + l.password);
    if (l.loginLocal) out.push(' login local');
    else if (l.password && !isCon) out.push(' login');
    if (isCon && l.speed && l.speed !== 9600) out.push(' speed ' + l.speed);
    if (!isCon) {
      if (l.transport === 'all') { /* standard, visas inte */ } else out.push(' transport input ' + l.transport);
    }
    Object.keys(l.x || {}).forEach(function (k) { out.push(' ' + l.x[k]); });
    return out;
  }
  function fakeType7(s) {
    var h = U.hash(s).toString(16).toUpperCase();
    return ('0' + h + h).slice(0, 18);
  }
  function hashSecret(s) {
    var alpha = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    var out = '$9$';
    var h = U.hash(s);
    for (var i = 0; i < 14; i++) { out += alpha[h % alpha.length]; h = U.hash(out + s); }
    out += '$';
    for (var j = 0; j < 43; j++) { out += alpha[h % alpha.length]; h = U.hash(out); }
    return out;
  }

  function ifaceBlock(state, d, n, c) {
    c = c || d.config;
    var i = c.ifaces[n];
    var o = ['interface ' + n];
    if (i.description) o.push(' description ' + i.description);
    if (i.parent) {
      if (i.encap) o.push(' encapsulation dot1Q ' + i.encap);
    }
    if (isSw(d) && !i.svi && !i.loop) {
      if (i.mode === 'trunk' || i.mode === 'dynamic auto' || i.mode === 'dynamic desirable' || i.mode === 'access') {
        if (i.accessVlan !== 1) o.push(' switchport access vlan ' + i.accessVlan);
        if (i.encap === 'dot1q') o.push(' switchport trunk encapsulation dot1q');
        if (i.native !== 1) o.push(' switchport trunk native vlan ' + i.native);
        if (i.allowed !== 'all') o.push(' switchport trunk allowed vlan ' + U.vlanListStr(i.allowed));
        if (i.mode !== 'dynamic auto') o.push(' switchport mode ' + i.mode);
        if (i.nonegotiate) o.push(' switchport nonegotiate');
        if (i.portSec) {
          var ps = i.portSec;
          o.push(' switchport port-security');
          if (ps.max !== 1) o.push(' switchport port-security maximum ' + ps.max);
          if (ps.violation !== 'shutdown') o.push(' switchport port-security violation ' + ps.violation);
          if (ps.sticky) {
            o.push(' switchport port-security mac-address sticky');
            ps.macs.forEach(function (m) { o.push(' switchport port-security mac-address sticky ' + U.macDots(m)); });
          }
        }
      }
      if (i.speed !== 'auto') o.push(' speed ' + i.speed);
      if (i.duplex !== 'auto') o.push(' duplex ' + i.duplex);
      if (i.poe === 'never') o.push(' power inline never');
      if (i.portfast && i.mode !== 'trunk') o.push(' spanning-tree portfast');
      else if (i.portfast && i.mode === 'trunk') o.push(' spanning-tree portfast trunk');
    } else {
      if (i.ip) o.push(' ip address ' + i.ip.addr + ' ' + i.ip.mask);
      else if (!i.parent) o.push(' no ip address');
      if (i.aclIn) o.push(' ip access-group ' + i.aclIn + ' in');
      if (i.aclOut) o.push(' ip access-group ' + i.aclOut + ' out');
      if (i.natDir) o.push(' ip nat ' + i.natDir);
      if (i.mtu) o.push(' ip mtu ' + i.mtu);
      if (i.adjustMss) o.push(' ip tcp adjust-mss ' + i.adjustMss);
      if (i.cryptoMap) o.push(' crypto map ' + i.cryptoMap);
      if (!i.svi && !i.parent && !i.internal && !i.loop) {
        if (d.kind === 'router') {
          o.push(i.duplex === 'auto' ? ' duplex auto' : ' duplex ' + i.duplex);
          o.push(i.speed === 'auto' ? ' speed auto' : ' speed ' + i.speed);
        }
      }
    }
    if (i.voiceVlan) o.push(' switchport voice vlan ' + i.voiceVlan);
    if (i.chGroup) o.push(' channel-group ' + i.chGroup.n + ' mode ' + i.chGroup.mode);
    if (i.hsrp && i.hsrp.ip) {
      o.push(' standby ' + i.hsrp.grp + ' ip ' + i.hsrp.ip);
      if (i.hsrp.pri !== 100) o.push(' standby ' + i.hsrp.grp + ' priority ' + i.hsrp.pri);
      if (i.hsrp.preempt) o.push(' standby ' + i.hsrp.grp + ' preempt');
    }
    Object.keys(i.x || {}).forEach(function (k) { o.push(' ' + i.x[k]); });
    if (i.shutdown) o.push(' shutdown');
    return o;
  }

  function runningConfig(state, d, c) {
    c = c || d.config;
    var router = d.kind === 'router';
    var o = [];
    o.push('!');
    o.push('version ' + (router ? '15.2' : '12.2'));
    o.push('no service pad');
    o.push('service timestamps debug datetime msec');
    o.push(c.timestampsMsec ? 'service timestamps log datetime msec' : 'service timestamps log uptime');
    o.push(c.pwEncrypt ? 'service password-encryption' : 'no service password-encryption');
    o.push('!');
    o.push('hostname ' + c.hostname);
    o.push('!');
    o.push('boot-start-marker');
    o.push('boot-end-marker');
    o.push('!');
    if (c.logging.buffered) o.push('logging buffered ' + c.logging.size + (c.logging.level ? ' ' + c.logging.level : ''));
    else o.push('no logging buffered');
    if (c.enableSecret) o.push('enable secret 9 ' + c.enableSecret);
    if (c.enablePassword) o.push('enable password ' + (c.pwEncrypt ? '7 ' + fakeType7(c.enablePassword) : c.enablePassword));
    o.push('!');
    Object.keys(c.users).forEach(function (u) {
      var us = c.users[u];
      o.push('username ' + u + ' privilege ' + us.priv + (us.pwType === 'password' ? ' password ' + (c.pwEncrypt ? '7 ' + fakeType7(us.plain) : '0 ' + us.plain) : ' secret 9 ' + us.secret));
    });
    o.push('no aaa new-model');
    if (c.minPwLen) o.push('security passwords min-length ' + c.minPwLen);
    if (c.vtp && (c.vtp.domain || c.vtp.mode !== 'server')) { if (c.vtp.domain) o.push('vtp domain ' + c.vtp.domain); if (c.vtp.mode !== 'server') o.push('vtp mode ' + c.vtp.mode); }
    if (!router) o.push('system mtu routing 1500');
    if (!router && c.ipRouting) o.push('ip routing');
    if (router) {
      o.push('!');
      c.dhcpExcluded.forEach(function (x) { o.push('ip dhcp excluded-address ' + x[0] + (x[1] && x[1] !== x[0] ? ' ' + x[1] : '')); });
      o.push('!');
      Object.keys(c.dhcpPools).forEach(function (p) {
        var pl = c.dhcpPools[p];
        o.push('ip dhcp pool ' + p);
        if (pl.network) o.push(' network ' + pl.network + ' ' + pl.mask);
        if (pl.defaultRouter.length) o.push(' default-router ' + pl.defaultRouter.join(' '));
        if (pl.dns.length) o.push(' dns-server ' + pl.dns.join(' '));
        if (pl.lease !== 1) {
          if (pl.lease === Math.floor(pl.lease)) o.push(' lease ' + pl.lease);
          else { var mins = Math.round(pl.lease * 1440); o.push(' lease ' + Math.floor(mins / 1440) + ' ' + Math.floor((mins % 1440) / 60) + (mins % 60 ? ' ' + (mins % 60) : '')); }
        }
        if (pl.opt150) o.push(' option 150 ip ' + pl.opt150);
        o.push('!');
      });
    }
    o.push('!');
    if (!c.domainLookup) o.push('no ip domain lookup');
    if (c.domainName) o.push((router ? 'ip domain name ' : 'ip domain-name ') + c.domainName);
    Object.keys(c.hosts).forEach(function (h) { o.push('ip host ' + h + ' ' + c.hosts[h]); });
    if (c.nameServers.length) o.push('ip name-server ' + c.nameServers.join(' '));
    if (router) o.push('ip cef');
    o.push('no ipv6 cef');
    o.push('!');
    if (c.ssh.timeout) o.push('ip ssh time-out ' + c.ssh.timeout);
    if (c.ssh.retries != null) o.push('ip ssh authentication-retries ' + c.ssh.retries);
    if (c.ssh.version) o.push('ip ssh version ' + c.ssh.version);
    o.push('!');
    o.push('spanning-tree mode pvst');
    o.push('spanning-tree extend system-id');
    if (!router) {
      var pr = {};
      Object.keys(c.stpPriority).forEach(function (v) { (pr[c.stpPriority[v]] = pr[c.stpPriority[v]] || []).push(parseInt(v, 10)); });
      Object.keys(pr).forEach(function (p) { o.push('spanning-tree vlan ' + U.vlanListStr(pr[p].sort(function (a, b) { return a - b; })) + ' priority ' + p); });
      if (c.stpOff.length) o.push('no spanning-tree vlan ' + U.vlanListStr(c.stpOff.slice().sort(function (a, b) { return a - b; })));
      o.push('!');
      o.push('vlan internal allocation policy ascending');
      o.push('!');
      Object.keys(c.vlans).map(Number).sort(function (a, b) { return a - b; }).forEach(function (v) {
        if (v === 1) return;
        o.push('vlan ' + v);
        o.push(' name ' + c.vlans[v]);
        if (c.vlanState && c.vlanState[v] === 'suspend') o.push(' state suspend');
        if (c.vlanState && c.vlanState[v] === 'shutdown') o.push(' shutdown');
        o.push('!');
      });
    }
    o.push('!');
    cryptoConfig(c).forEach(function (l) { o.push(l); });
    ifaceNames(d).forEach(function (n) {
      if (!c.ifaces[n]) return;
      ifaceBlock(state, d, n, c).forEach(function (l) { o.push(l); });
      o.push('!');
    });
    if (!router && c.defaultGateway) o.push('ip default-gateway ' + c.defaultGateway);
    o.push('ip forward-protocol nd');
    o.push('!');
    o.push('no ip http server');
    o.push('no ip http secure-server');
    if (c.dnsServer) o.push('ip dns server');
    c.nat.dynamic.forEach(function (n) {
      o.push('ip nat inside source list ' + n.acl + ' interface ' + n.iface + (n.overload ? ' overload' : ''));
    });
    c.nat.statics.forEach(function (n) { o.push('ip nat inside source static ' + n.local + ' ' + n.global); });
    c.routes.forEach(function (r) { o.push('ip route ' + r.net + ' ' + r.mask + ' ' + (r.nh || r.iface) + (r.ad && r.ad !== 1 ? ' ' + r.ad : '')); });
    o.push('!');
    Object.keys(c.acls).forEach(function (name) {
      var a = c.acls[name];
      if (/^\d+$/.test(name)) return;
      o.push('ip access-list ' + a.type + ' ' + name);
      a.rules.forEach(function (r) { o.push(' ' + aceText(a.type, r)); });
      o.push('!');
    });
    c.logging.hosts.forEach(function (h) { o.push('logging host ' + h); });
    if (c.cdpOff) o.push('no cdp run');
    if (c.lldp) o.push('lldp run');
    Object.keys(c.x || {}).forEach(function (k) { o.push(c.x[k]); });
    if (c.snmp) {
      Object.keys(c.snmp.communities).forEach(function (k) { o.push('snmp-server community ' + k + ' ' + c.snmp.communities[k]); });
      if (c.snmp.location) o.push('snmp-server location ' + c.snmp.location);
      if (c.snmp.contact) o.push('snmp-server contact ' + c.snmp.contact);
    }
    Object.keys(c.acls).forEach(function (name) {
      var a = c.acls[name];
      if (!/^\d+$/.test(name)) return;
      a.rules.forEach(function (r) { o.push('access-list ' + name + ' ' + aceText(a.type, r)); });
    });
    o.push('!');
    ['exec', 'login', 'motd'].forEach(function (k) { var b = c.banners && c.banners[k]; if (b) o.push('banner ' + k + ' ^C' + b.text + '^C'); });
    o.push('!');
    o.push('line con 0');
    lineCfg(c.lines.con, true, c.pwEncrypt).forEach(function (l) { o.push(l); });
    if (router) { o.push('line aux 0'); }
    o.push('line vty 0 4');
    lineCfg(c.lines.vty0_4, false, c.pwEncrypt).forEach(function (l) { o.push(l); });
    o.push('line vty 5 15');
    lineCfg(c.lines.vty5_15, false, c.pwEncrypt).forEach(function (l) { o.push(l); });
    o.push('!');
    if (c.ntpSource) o.push('ntp source ' + c.ntpSource);
    c.ntpServers.forEach(function (n) { o.push('ntp server ' + n + (c.ntpPrefer === n ? ' prefer' : '')); });
    o.push('end');
    var body = o.join('\n');
    return 'Building configuration...\n\nCurrent configuration : ' + (body.length + 40) + ' bytes\n' + body;
  }
  // ---------------------------------------------------------------- Crypto (kapitel 10)
  var ENC_TEXT = { 'des': 'DES - Data Encryption Standard (56 bit keys).', '3des': 'Three key triple DES', 'aes': 'AES - Advanced Encryption Standard (128 bit keys).', 'aes 192': 'AES - Advanced Encryption Standard (192 bit keys).', 'aes 256': 'AES - Advanced Encryption Standard (256 bit keys).' };
  var HASH_TEXT = { sha: 'Secure Hash Standard', sha256: 'Secure Hash Standard 2 (256 bit)', sha384: 'Secure Hash Standard 2 (384 bit)', md5: 'Message Digest 5' };
  var GROUP_BITS = { 1: 768, 2: 1024, 5: 1536, 14: 2048, 15: 3072, 16: 4096, 19: 256, 20: 384, 24: 2048 };
  function cryptoConfig(c) {
    var cr = c.crypto, o = [];
    if (!cr) return o;
    Object.keys(cr.isakmp.policies).map(Number).sort(function (a, b) { return a - b; }).forEach(function (n) {
      var p = cr.isakmp.policies[n];
      o.push('crypto isakmp policy ' + n);
      if (p.enc !== 'des') o.push(' encr ' + p.enc);
      if (p.hash !== 'sha') o.push(' hash ' + p.hash);
      if (p.auth !== 'rsa-sig') o.push(' authentication ' + p.auth);
      if (p.group !== 1) o.push(' group ' + p.group);
      if (p.lifetime !== 86400) o.push(' lifetime ' + p.lifetime);
    });
    Object.keys(cr.isakmp.keys).forEach(function (ip) { o.push('crypto isakmp key ' + cr.isakmp.keys[ip] + ' address ' + ip); });
    o.push('!', '!');
    Object.keys(cr.transformSets).forEach(function (n) {
      var t = cr.transformSets[n];
      o.push('crypto ipsec transform-set ' + n + ' ' + t.transforms.join(' '));
      o.push(' mode ' + (t.mode || 'tunnel'));
    });
    o.push('!', '!', '!');
    Object.keys(cr.maps).forEach(function (m) {
      Object.keys(cr.maps[m]).map(Number).sort(function (a, b) { return a - b; }).forEach(function (seq) {
        var e = cr.maps[m][seq];
        o.push('crypto map ' + m + ' ' + seq + ' ipsec-isakmp');
        if (e.peer) o.push(' set peer ' + e.peer);
        if (e.ts) o.push(' set transform-set ' + e.ts);
        if (e.acl) o.push(' match address ' + e.acl);
      });
    });
    o.push('!');
    return o;
  }
  function wildToMask(w) { return U.intToIp((~U.ipToInt(w || '0.0.0.0')) >>> 0); }
  function identOf(spec) {
    if (!spec || spec.any) return '0.0.0.0/0.0.0.0';
    if (spec.host) return spec.host + '/255.255.255.255';
    return S.specNorm(spec).split('/')[0] + '/' + wildToMask(spec.wild);
  }
  function cryptoIsakmpSa(state, d) {
    var s = S.cryptoStatus(state, d.id);
    var o = ['IPv4 Crypto ISAKMP SA', 'dst             src             state          conn-id status'];
    s.isakmp.forEach(function (x) { o.push(pad(x.dst, 16) + pad(x.src, 16) + pad(x.state, 15) + padL(x.connId, 7) + ' ' + x.status); });
    o.push('', 'IPv6 Crypto ISAKMP SA', '');
    return o.join('\n');
  }
  function cryptoIpsecSa(state, d) {
    var s = S.cryptoStatus(state, d.id);
    if (!s.sas.length) return '';
    var o = [];
    var lastIf = null;
    s.sas.forEach(function (x) {
      if (x.iface !== lastIf) {
        o.push('', 'interface: ' + x.iface, '    Crypto map tag: ' + x.map + ', local addr ' + x.local);
        lastIf = x.iface;
      }
      var n = x.up ? x : { encaps: 0, decaps: 0 };
      o.push('', '   protected vrf: (none)',
        '   local  ident (addr/mask/prot/port): (' + identOf(x.rule.src) + '/0/0)',
        '   remote ident (addr/mask/prot/port): (' + identOf(x.rule.dst) + '/0/0)',
        '   current_peer ' + x.peer + ' port 500',
        '     PERMIT, flags={origin_is_acl,}',
        '    #pkts encaps: ' + n.encaps + ', #pkts encrypt: ' + n.encaps + ', #pkts digest: ' + n.encaps,
        '    #pkts decaps: ' + n.decaps + ', #pkts decrypt: ' + n.decaps + ', #pkts verify: ' + n.decaps,
        '    #pkts compressed: 0, #pkts decompressed: 0',
        '    #pkts not compressed: 0, #pkts compr. failed: 0',
        '    #pkts not decompressed: 0, #pkts decompress failed: 0',
        '    #send errors 0, #recv errors 0',
        '',
        '     local crypto endpt.: ' + x.local + ', remote crypto endpt.: ' + x.peer,
        '     plaintext mtu ' + x.mtu + ', path mtu 1500, ip mtu 1500, ip mtu idb ' + x.iface,
        '     current outbound spi: ' + (x.up ? '0x' + x.spi.toString(16).toUpperCase() + '(' + x.spi + ')' : '0x0(0)'),
        '     PFS (Y/N): N, DH group: none',
        '',
        '     inbound esp sas:');
      if (x.up) {
        var sIn = (x.spi ^ 0x5a5a5a5a) >>> 0;
        o.push('      spi: 0x' + sIn.toString(16).toUpperCase() + '(' + sIn + ')', '        transform: esp-256-aes esp-sha256-hmac ,', '        in use settings ={Tunnel, }', '        sa timing: remaining key lifetime (k/sec): (4607998/3284)', '        IV size: 16 bytes', '        replay detection support: Y', '        Status: ACTIVE(ACTIVE)');
      }
      o.push('', '     inbound ah sas:', '', '     inbound pcp sas:', '', '     outbound esp sas:');
      if (x.up) o.push('      spi: 0x' + x.spi.toString(16).toUpperCase() + '(' + x.spi + ')', '        transform: esp-256-aes esp-sha256-hmac ,', '        in use settings ={Tunnel, }', '        sa timing: remaining key lifetime (k/sec): (4607998/3284)', '        IV size: 16 bytes', '        replay detection support: Y', '        Status: ACTIVE(ACTIVE)');
      o.push('', '     outbound ah sas:', '', '     outbound pcp sas:');
    });
    return o.join('\n');
  }
  function cryptoMapShow(state, d) {
    var c = d.config, cr = c.crypto;
    if (!cr || !Object.keys(cr.maps).length) return '';
    var o = [];
    Object.keys(cr.maps).forEach(function (m) {
      var ifs = Object.keys(c.ifaces).filter(function (n) { return c.ifaces[n].cryptoMap === m; });
      Object.keys(cr.maps[m]).map(Number).sort(function (a, b) { return a - b; }).forEach(function (seq) {
        var e = cr.maps[m][seq];
        o.push('Crypto Map IPv4 "' + m + '" ' + seq + ' ipsec-isakmp');
        o.push('\tPeer = ' + (e.peer || ''));
        var acl = e.acl && c.acls[e.acl];
        if (acl) {
          o.push('\tExtended IP access list ' + e.acl);
          acl.rules.forEach(function (r) { if (!r.remark) o.push('\t    access-list ' + e.acl + ' ' + aceText(acl.type, r).replace(/\s+/g, ' ')); });
        } else o.push('\tNo matching address list set.');
        o.push('\tCurrent peer: ' + (e.peer || ''), '\tSecurity association lifetime: 4608000 kilobytes/3600 seconds', '\tResponder-Only (Y/N): N', '\tPFS (Y/N): N', '\tMixed-mode : Disabled', '\tTransform sets={ ');
        var t = e.ts && cr.transformSets[e.ts];
        if (t) o.push('\t\t' + e.ts + ':  { ' + t.transforms.join(' ') + '  } , ');
        o.push('\t}');
        if (!e.peer || !e.ts || !e.acl) o.push('\tWARNING: This crypto map is incomplete!', '\t  To remedy the situation add a peer, a transform-set and an access list.');
      });
      o.push('\tInterfaces using crypto map ' + m + ':');
      ifs.forEach(function (n) { o.push('\t\t' + n); });
      o.push('');
    });
    return o.join('\n');
  }
  function cryptoIsakmpPolicy(state, d) {
    var cr = d.config.crypto;
    var o = ['', 'Global IKE policy'];
    if (cr) Object.keys(cr.isakmp.policies).map(Number).sort(function (a, b) { return a - b; }).forEach(function (n) {
      var p = cr.isakmp.policies[n];
      o.push('Protection suite of priority ' + n,
        '\tencryption algorithm:\t' + (ENC_TEXT[p.enc] || p.enc),
        '\thash algorithm:\t\t' + (HASH_TEXT[p.hash] || p.hash),
        '\tauthentication method:\t' + (p.auth === 'pre-share' ? 'Pre-Shared Key' : 'Rivest-Shamir-Adleman Signature'),
        '\tDiffie-Hellman group:\t#' + p.group + ' (' + (GROUP_BITS[p.group] || 1024) + ' bit)',
        '\tlifetime:\t\t' + p.lifetime + ' seconds, no volume limit');
    });
    o.push('Default protection suite', '\tencryption algorithm:\tDES - Data Encryption Standard (56 bit keys).', '\thash algorithm:\t\tSecure Hash Standard', '\tauthentication method:\tRivest-Shamir-Adleman Signature', '\tDiffie-Hellman group:\t#1 (768 bit)', '\tlifetime:\t\t86400 seconds, no volume limit');
    return o.join('\n');
  }
  function cryptoSession(state, d) {
    var s = S.cryptoStatus(state, d.id);
    var o = ['Crypto session current status', ''];
    s.isakmp.forEach(function (x) {
      var up = s.sas.some(function (a) { return a.peer === x.dst && a.up; });
      o.push('Interface: ' + (s.sas[0] ? s.sas[0].iface : ''), 'Session status: ' + (x.state === 'QM_IDLE' ? (up ? 'UP-ACTIVE' : 'UP-IDLE') : 'DOWN-NEGOTIATING'), 'Peer: ' + x.dst + ' port 500 ', '  IKEv1 SA: local ' + x.src + '/500 remote ' + x.dst + '/500 ' + (x.state === 'QM_IDLE' ? 'Active' : 'Inactive'));
      s.sas.filter(function (a) { return a.peer === x.dst; }).forEach(function (a) {
        o.push('  IPSEC FLOW: permit ip ' + identOf(a.rule.src) + ' ' + identOf(a.rule.dst), '        Active SAs: ' + (a.up ? 2 : 0) + ', origin: crypto map');
      });
      o.push('');
    });
    return o.join('\n');
  }

  function startupConfig(state, d) {
    if (!d.startup) return 'startup-config is not present';
    var s = runningConfig(state, d, d.startup).split('\n');
    s.splice(0, 3, 'Using ' + (s.join('\n').length) + ' out of 524288 bytes');
    return s.join('\n');
  }
  function runningInterface(state, d, n) {
    var body = ['!'].concat(ifaceBlock(state, d, n)).concat(['end']).join('\n');
    return 'Building configuration...\n\nCurrent configuration : ' + body.length + ' bytes\n' + body;
  }

  // ---------------------------------------------------------------- Interface-utskrifter
  function interfacesStatus(state, d, filter) {
    var D = S.get(state);
    var o = ['', 'Port      Name               Status       Vlan       Duplex  Speed Type'];
    physPorts(d).forEach(function (n) {
      if (filter && filter !== n) return;
      var i = d.config.ifaces[n];
      var p = D.ports[S.key(d.id, n)];
      var st = portState(state, d, n);
      var vlan = S.opMode(state, d.id, n) === 'trunk' && st === 'connected' ? 'trunk' : (i.mode === 'trunk' ? 'trunk' : String(i.accessVlan));
      var dup, spd;
      if (st === 'connected' && p && p.neg) {
        dup = (p.neg.auto ? 'a-' : '') + p.neg.duplex;
        spd = (p.neg.auto ? 'a-' : '') + p.neg.speed;
      } else { dup = i.duplex; spd = i.speed; }
      var type = i.sfp ? (p ? '1000BaseSX SFP' : 'Not Present') : '10/100/1000BaseTX';
      o.push(pad(U.shortIf(n), 10) + pad((i.description || '').slice(0, 18), 19) + pad(st, 13) + pad(vlan, 11) + padL(dup, 6) + ' ' + padL(spd, 6) + ' ' + type);
    });
    return o.join('\n');
  }

  function ipIntBrief(state, d) {
    var D = S.get(state);
    var o = ['Interface                  IP-Address      OK? Method Status                Protocol'];
    ifaceNames(d).forEach(function (n) {
      var i = d.config.ifaces[n];
      var st, pr;
      if (i.svi || i.parent || i.internal || i.loop || d.kind === 'router') {
        var ep = D.eps['E:' + d.id + ':' + n];
        if (i.shutdown) { st = 'administratively down'; pr = 'down'; }
        else if (i.loop) { st = 'up'; pr = 'up'; }
        else if (i.parent) {
          var parent = d.config.ifaces[i.parent];
          var pp = D.ports[S.key(d.id, i.parent)];
          if (parent.shutdown) { st = 'administratively down'; pr = 'down'; }
          else if (pp && pp.up) { st = 'up'; pr = 'up'; } else { st = 'down'; pr = 'down'; }
        } else if (i.svi) {
          var upv = ep && ep.up;
          st = 'up'; pr = upv ? 'up' : 'down';
          if (!S.vlanExists(d, i.svi)) { st = 'down'; pr = 'down'; }
        } else {
          var p = D.ports[S.key(d.id, n)];
          st = p && p.up ? 'up' : 'down'; pr = st;
        }
      } else {
        var ps = portState(state, d, n);
        if (ps === 'disabled') { st = 'administratively down'; pr = 'down'; }
        else if (ps === 'connected') { st = 'up'; pr = 'up'; }
        else { st = 'down'; pr = 'down'; }
      }
      var ip = i.ip ? i.ip.addr : 'unassigned';
      o.push(pad(n, 27) + pad(ip, 16) + 'YES ' + pad(i.ip || d.kind === 'router' ? 'NVRAM' : 'unset', 7) + pad(st, 22) + pr);
    });
    return o.join('\n');
  }

  function showInterface(state, d, n) {
    var D = S.get(state);
    var i = d.config.ifaces[n];
    if (i.loop) {
      var lst = i.shutdown ? 'administratively down' : 'up';
      return n + ' is ' + lst + ', line protocol is ' + (i.shutdown ? 'down' : 'up') + ' \n  Hardware is Loopback\n' + (i.description ? '  Description: ' + i.description + '\n' : '') + (i.ip ? '  Internet address is ' + i.ip.addr + '/' + U.maskToPrefix(i.ip.mask) + '\n' : '') + '  MTU 1514 bytes, BW 8000000 Kbit/sec, DLY 5000 usec, \n     reliability 255/255, txload 1/255, rxload 1/255\n  Encapsulation LOOPBACK, loopback not set\n  Keepalive set (10 sec)\n  Last input never, output never, output hang never\n  Last clearing of "show interface" counters never\n  Input queue: 0/75/0/0 (size/max/drops/flushes); Total output drops: 0\n  Queueing strategy: fifo\n  Output queue: 0/0 (size/max)\n  5 minute input rate 0 bits/sec, 0 packets/sec\n  5 minute output rate 0 bits/sec, 0 packets/sec\n     0 packets input, 0 bytes, 0 no buffer\n     0 packets output, 0 bytes, 0 underruns';
    }
    var p = D.ports[S.key(d.id, n)];
    var up, lp, extra = '';
    if (i.parent) {
      var pp = D.ports[S.key(d.id, i.parent)];
      var par = d.config.ifaces[i.parent];
      up = i.shutdown || par.shutdown ? 'administratively down' : (pp && pp.up ? 'up' : 'down');
      lp = up === 'up' ? 'up' : 'down';
      return [n + ' is ' + up + ', line protocol is ' + lp,
        '  Hardware is iGbE, address is ' + U.macDots(d.baseMac) + ' (bia ' + U.macDots(d.baseMac) + ')',
        i.description ? '  Description: ' + i.description : null,
        i.ip ? '  Internet address is ' + i.ip.addr + '/' + U.maskToPrefix(i.ip.mask) : null,
        '  MTU 1500 bytes, BW 1000000 Kbit/sec, DLY 10 usec,',
        '     reliability 255/255, txload 1/255, rxload 1/255',
        '  Encapsulation 802.1Q Virtual LAN, Vlan ID  ' + (i.encap || 'unset') + '.',
        '  ARP type: ARPA, ARP Timeout 04:00:00',
        '  Keepalive set (10 sec)',
        '  Last clearing of "show interface" counters never'].filter(Boolean).join('\n');
    }
    if (i.svi) {
      var ep = D.eps['E:' + d.id + ':' + n];
      up = i.shutdown ? 'administratively down' : 'up';
      lp = ep && ep.up ? 'up' : 'down';
      return [n + ' is ' + up + ', line protocol is ' + lp,
        '  Hardware is EtherSVI, address is ' + U.macDots(d.baseMac) + ' (bia ' + U.macDots(d.baseMac) + ')',
        i.ip ? '  Internet address is ' + i.ip.addr + '/' + U.maskToPrefix(i.ip.mask) : null,
        '  MTU 1500 bytes, BW 1000000 Kbit/sec, DLY 10 usec,'].filter(Boolean).join('\n');
    }
    var st = portState(state, d, n);
    if (st === 'disabled') { up = 'administratively down'; lp = 'down'; extra = ' (disabled)'; }
    else if (st === 'err-disabled') { up = 'down'; lp = 'down'; extra = ' (err-disabled)'; }
    else if (st === 'connected') { up = 'up'; lp = 'up'; extra = isSw(d) ? ' (connected)' : ''; }
    else { up = 'down'; lp = 'down'; extra = isSw(d) ? ' (notconnect)' : ''; }
    var c = d.rt.counters[n] || { inp: 0, outp: 0, crc: 0, late: 0, runts: 0, coll: 0, flaps: 0 };
    var neg = p && p.up && p.neg ? p.neg : null;
    var dupTxt = neg ? (neg.duplex === 'full' ? 'Full-duplex' : 'Half-duplex') : (i.duplex === 'half' ? 'Half-duplex' : (i.duplex === 'full' ? 'Full-duplex' : 'Auto-duplex'));
    var spdTxt = neg ? neg.speed + 'Mb/s' : (i.speed === 'auto' ? 'Auto-speed' : i.speed + 'Mb/s');
    if (neg && neg.speed === 1000) spdTxt = '1000Mb/s';
    var bw = neg ? neg.speed * 1000 : 1000000;
    var load = S.linkLoad(state, d.id, n);
    var inRate = Math.round(load * 1000000 * 0.45), outRate = Math.round(load * 1000000 * 0.4);
    var crc = Math.floor(c.crc), runts = Math.floor(c.runts), late = Math.floor(c.late), coll = Math.floor(c.coll);
    var inErr = crc + runts;
    var o = [
      n + ' is ' + up + ', line protocol is ' + lp + extra,
      '  Hardware is Gigabit Ethernet, address is ' + U.macDots(portMac(d, n)) + ' (bia ' + U.macDots(portMac(d, n)) + ')',
    ];
    if (i.description) o.push('  Description: ' + i.description);
    if (i.ip) o.push('  Internet address is ' + i.ip.addr + '/' + U.maskToPrefix(i.ip.mask));
    o.push('  MTU 1500 bytes, BW ' + bw + ' Kbit/sec, DLY 10 usec,');
    o.push('     reliability ' + (inErr > 0 ? 250 : 255) + '/255, txload 1/255, rxload 1/255');
    o.push('  Encapsulation ARPA, loopback not set');
    o.push('  Keepalive set (10 sec)');
    o.push('  ' + dupTxt + ', ' + spdTxt + ', media type is ' + (i.sfp ? '1000BaseSX SFP' : '10/100/1000BaseTX'));
    o.push('  input flow-control is off, output flow-control is unsupported');
    o.push('  ARP type: ARPA, ARP Timeout 04:00:00');
    o.push('  Last input 00:00:00, output 00:00:00, output hang never');
    o.push('  Last clearing of "show interface" counters ' + (c.cleared !== undefined ? fmtAgo(state.time - c.cleared) : 'never'));
    o.push('  Input queue: 0/75/0/0 (size/max/drops/flushes); Total output drops: 0');
    o.push('  Queueing strategy: fifo');
    o.push('  Output queue: 0/40 (size/max)');
    o.push('  5 minute input rate ' + (lp === 'up' ? inRate : 0) + ' bits/sec, ' + (lp === 'up' ? Math.round(inRate / 8000) : 0) + ' packets/sec');
    o.push('  5 minute output rate ' + (lp === 'up' ? outRate : 0) + ' bits/sec, ' + (lp === 'up' ? Math.round(outRate / 8000) : 0) + ' packets/sec');
    o.push('     ' + Math.floor(c.inp) + ' packets input, ' + Math.floor(c.inp * 412) + ' bytes, 0 no buffer');
    o.push('     Received ' + Math.floor(c.inp * 0.03) + ' broadcasts (' + Math.floor(c.inp * 0.02) + ' multicasts)');
    o.push('     ' + runts + ' runts, 0 giants, 0 throttles');
    o.push('     ' + inErr + ' input errors, ' + crc + ' CRC, 0 frame, 0 overrun, 0 ignored');
    o.push('     0 watchdog, ' + Math.floor(c.inp * 0.02) + ' multicast, 0 pause input');
    o.push('     0 input packets with dribble condition detected');
    o.push('     ' + Math.floor(c.outp) + ' packets output, ' + Math.floor(c.outp * 398) + ' bytes, 0 underruns');
    o.push('     0 output errors, ' + coll + ' collisions, ' + (1 + c.flaps) + ' interface resets');
    o.push('     0 unknown protocol drops');
    o.push('     0 babbles, ' + late + ' late collision, ' + Math.floor(coll / 3) + ' deferred');
    o.push('     0 lost carrier, 0 no carrier, 0 pause output');
    o.push('     0 output buffer failures, 0 output buffers swapped out');
    return o.join('\n');
  }
  function portMac(d, n) { return d.baseMac.slice(0, 10) + ('0' + (S.portNum(n) + 1).toString(16)).slice(-2); }
  function fmtAgo(s) {
    s = Math.max(0, Math.floor(s));
    return two(Math.floor(s / 3600)) + ':' + two(Math.floor(s % 3600 / 60)) + ':' + two(s % 60);
  }
  function two(n) { return (n < 10 ? '0' : '') + n; }

  function switchport(state, d, n) {
    var i = d.config.ifaces[n];
    var op = S.opMode(state, d.id, n);
    var st = portState(state, d, n);
    var adm = i.mode === 'access' ? 'static access' : (i.mode === 'trunk' ? 'trunk' : i.mode);
    var oper = st !== 'connected' && st !== 'inactive' ? 'down' : (op === 'trunk' ? 'trunk' : 'static access');
    return [
      'Name: ' + U.shortIf(n),
      'Switchport: Enabled',
      'Administrative Mode: ' + adm,
      'Operational Mode: ' + oper,
      'Administrative Trunking Encapsulation: ' + (i.encap === 'dot1q' ? 'dot1q' : 'negotiate'),
      'Operational Trunking Encapsulation: ' + (op === 'trunk' ? 'dot1q' : 'native'),
      'Negotiation of Trunking: ' + (i.nonegotiate || i.mode === 'access' ? 'Off' : 'On'),
      'Access Mode VLAN: ' + i.accessVlan + ' (' + (d.config.vlans[i.accessVlan] || 'Inactive') + ')',
      'Trunking Native Mode VLAN: ' + i.native + ' (' + (d.config.vlans[i.native] || 'Inactive') + ')',
      'Administrative Native VLAN tagging: enabled',
      'Voice VLAN: none',
      'Administrative private-vlan host-association: none',
      'Operational private-vlan: none',
      'Trunking VLANs Enabled: ' + (i.allowed === 'all' ? 'ALL' : U.vlanListStr(i.allowed)),
      'Pruning VLANs Enabled: 2-1001',
      'Capture Mode Disabled',
      'Capture VLANs Allowed: ALL',
      '',
      'Protected: false',
      'Unknown unicast blocked: disabled',
      'Unknown multicast blocked: disabled',
      'Appliance trust: none',
    ].join('\n');
  }

  function vlanBrief(state, d) {
    var D = S.get(state);
    var o = ['', 'VLAN Name                             Status    Ports',
      '---- -------------------------------- --------- -------------------------------'];
    var vl = Object.keys(d.config.vlans).map(Number).sort(function (a, b) { return a - b; });
    vl.forEach(function (v) {
      var ports = physPorts(d).filter(function (n) {
        var i = d.config.ifaces[n];
        if (S.opMode(state, d.id, n) === 'trunk') return false;
        if (i.mode === 'trunk') return false;
        return i.accessVlan === v;
      }).map(U.shortIf);
      var lines = [];
      for (var k = 0; k < ports.length; k += 4) lines.push(ports.slice(k, k + 4).join(', '));
      if (!lines.length) lines.push('');
      o.push(pad(v, 5) + pad(d.config.vlans[v], 33) + pad(d.config.vlanState && d.config.vlanState[v] === 'suspend' ? 'suspended' : (d.config.vlanState && d.config.vlanState[v] === 'shutdown' ? 'act/lshut' : 'active'), 10) + lines[0]);
      for (var j = 1; j < lines.length; j++) o.push(pad('', 48) + lines[j]);
    });
    o.push('1002 fddi-default                     act/unsup ');
    o.push('1003 token-ring-default               act/unsup ');
    o.push('1004 fddinet-default                  act/unsup ');
    o.push('1005 trnet-default                    act/unsup ');
    // Portar vars VLAN saknas
    physPorts(d).forEach(function (n) {
      var i = d.config.ifaces[n];
      if (S.opMode(state, d.id, n) !== 'trunk' && !d.config.vlans[i.accessVlan]) {
        o.push('% Port ' + U.shortIf(n) + ' is assigned to VLAN ' + i.accessVlan + ', which does not exist');
      }
    });
    return o.join('\n');
  }

  function interfacesTrunk(state, d) {
    var D = S.get(state);
    var trunks = physPorts(d).filter(function (n) {
      return S.opMode(state, d.id, n) === 'trunk' && portState(state, d, n) === 'connected';
    });
    if (!trunks.length) return '';
    var o = ['', 'Port        Mode             Encapsulation  Status        Native vlan'];
    trunks.forEach(function (n) {
      var i = d.config.ifaces[n];
      o.push(pad(U.shortIf(n), 12) + pad(i.mode === 'trunk' ? 'on' : (i.mode === 'dynamic desirable' ? 'desirable' : 'auto'), 17) + pad('802.1q', 15) + pad('trunking', 14) + i.native);
    });
    o.push('');
    o.push('Port        Vlans allowed on trunk');
    trunks.forEach(function (n) {
      var i = d.config.ifaces[n];
      o.push(pad(U.shortIf(n), 12) + (i.allowed === 'all' ? '1-4094' : U.vlanListStr(i.allowed)));
    });
    o.push('');
    o.push('Port        Vlans allowed and active in management domain');
    trunks.forEach(function (n) {
      o.push(pad(U.shortIf(n), 12) + U.vlanListStr(S.trunkVlans(d, d.config.ifaces[n])));
    });
    o.push('');
    o.push('Port        Vlans in spanning tree forwarding state and not pruned');
    trunks.forEach(function (n) {
      var list = S.trunkVlans(d, d.config.ifaces[n]).filter(function (v) { return !D.blocked[S.key(d.id, n) + '#' + v]; });
      o.push(pad(U.shortIf(n), 12) + U.vlanListStr(list));
    });
    return o.join('\n');
  }

  function macTable(state, d, filt) {
    var D = S.get(state);
    var rows = [];
    // Vilka ändpunkter kan nås genom varje port, per VLAN
    physPorts(d).forEach(function (n) {
      var p = D.ports[S.key(d.id, n)];
      if (!p || !p.up) return;
      var i = d.config.ifaces[n];
      var vlans = S.opMode(state, d.id, n) === 'trunk' ? S.trunkVlans(d, i) : [i.accessVlan];
      vlans.forEach(function (v) {
        if (D.blocked[S.key(d.id, n) + '#' + v]) return;
        var node = 'S:' + d.id + ':' + v;
        // Följ kanten via just denna port
        (D.adj[node] || []).forEach(function (e) {
          if (e.link !== p.link.id) return;
          var seen = {}; seen[node] = true;
          var q = [e.to]; seen[e.to] = true;
          while (q.length) {
            var x = q.shift();
            var m = /^E:(.+):(.+)$/.exec(x);
            if (m && D.eps[x] && D.eps[x].up) {
              var dv = state.devices[m[1]];
              var mac = D.eps[x].mac;
              if (!rows.some(function (r) { return r.mac === mac && r.vlan === v; })) rows.push({ vlan: v, mac: mac, port: n, host: m[1] });
            }
            (D.adj[x] || []).forEach(function (f) { if (!seen[f.to]) { seen[f.to] = true; q.push(f.to); } });
          }
        });
      });
    });
    if (filt && filt.address) rows = rows.filter(function (r) { return U.macDots(r.mac).indexOf(filt.address.toLowerCase()) === 0 || r.mac === filt.address.replace(/[.:-]/g, '').toLowerCase(); });
    if (filt && filt.iface) rows = rows.filter(function (r) { return r.port === filt.iface; });
    if (filt && filt.vlan) rows = rows.filter(function (r) { return r.vlan === filt.vlan; });
    rows.sort(function (a, b) { return a.vlan - b.vlan || S.portNum(a.port) - S.portNum(b.port); });
    var o = ['          Mac Address Table', '-------------------------------------------', '',
      'Vlan    Mac Address       Type        Ports', '----    -----------       --------    -----'];
    if (!filt) {
      o.push(' All    0100.0ccc.cccc    STATIC      CPU');
      o.push(' All    0180.c200.0000    STATIC      CPU');
      o.push(' All    ffff.ffff.ffff    STATIC      CPU');
    }
    rows.forEach(function (r) {
      o.push(padL(r.vlan, 4) + '    ' + U.macDots(r.mac) + '    DYNAMIC     ' + U.shortIf(r.port));
    });
    o.push('Total Mac Addresses for this criterion: ' + (rows.length + (filt ? 0 : 3)));
    return o.join('\n');
  }

  function spanningTree(state, d, onlyVlan) {
    var D = S.get(state);
    var o = [];
    var vl = Object.keys(d.config.vlans).map(Number).sort(function (a, b) { return a - b; });
    if (onlyVlan) vl = vl.filter(function (v) { return v === onlyVlan; });
    if (onlyVlan && !vl.length) return 'Spanning tree instance(s) for vlan ' + onlyVlan + ' does not exist.';
    vl.forEach(function (v) {
      var ports = physPorts(d).filter(function (n) {
        var p = D.ports[S.key(d.id, n)];
        if (!p || !p.up) return false;
        var i = d.config.ifaces[n];
        if (S.opMode(state, d.id, n) === 'trunk') return S.trunkVlans(d, i).indexOf(v) >= 0;
        return i.accessVlan === v;
      });
      if (!ports.length && v !== 1) return;
      if (!ports.length) return;
      o.push('');
      o.push('VLAN' + ('000' + v).slice(-4));
      if (d.config.stpOff.indexOf(v) >= 0) {
        o.push('  Spanning tree instance for vlan ' + v + ' is disabled');
        return;
      }
      var info = D.stp[d.id] && D.stp[d.id][v];
      var rootDev = info ? state.devices[info.root] : d;
      var rb = S.bridgeId(rootDev, v), mb = S.bridgeId(d, v);
      o.push('  Spanning tree enabled protocol ieee');
      o.push('  Root ID    Priority    ' + rb.pr);
      o.push('             Address     ' + U.macDots(rootDev.baseMac));
      if (!info || info.isRoot) o.push('             This bridge is the root');
      else {
        o.push('             Cost        4');
        o.push('             Port        ' + S.portNum(info.rootPort) + ' (' + info.rootPort + ')');
      }
      o.push('             Hello Time   2 sec  Max Age 20 sec  Forward Delay 15 sec');
      o.push('');
      o.push('  Bridge ID  Priority    ' + mb.pr + '  (priority ' + (mb.pr - v) + ' sys-id-ext ' + v + ')');
      o.push('             Address     ' + U.macDots(d.baseMac));
      o.push('             Hello Time   2 sec  Max Age 20 sec  Forward Delay 15 sec');
      o.push('             Aging Time  300 sec');
      o.push('');
      o.push('Interface           Role Sts Cost      Prio.Nbr Type');
      o.push('------------------- ---- --- --------- -------- --------------------------------');
      ports.forEach(function (n) {
        var k = S.key(d.id, n) + '#' + v;
        var role = 'Desg', sts = 'FWD', type = 'P2p';
        var i = d.config.ifaces[n];
        if (D.blocked[k] === 'BLK') { role = 'Altn'; sts = 'BLK'; }
        else if (D.blocked[k] === 'BKN*') { role = 'Desg'; sts = 'BKN*'; type = 'P2p *PVID_Inc'; }
        else if (info && !info.isRoot && info.rootPort === n) role = 'Root';
        if (i.portfast && S.opMode(state, d.id, n) !== 'trunk') type = 'P2p Edge';
        var p = D.ports[S.key(d.id, n)];
        var cost = p && p.neg && p.neg.speed === 100 ? 19 : 4;
        o.push(pad(U.shortIf(n), 20) + pad(role, 5) + pad(sts, 4) + pad(cost, 10) + pad('128.' + S.portNum(n), 9) + type);
      });
    });
    return o.join('\n');
  }

  function powerInline(state, d, only) {
    var D = S.get(state);
    var info = D.poe[d.id];
    if (!info || !d.poeBudget) return '% This switch does not support inline power';
    var o = ['', 'Available:' + info.available.toFixed(1) + '(w)  Used:' + info.used.toFixed(1) + '(w)  Remaining:' + info.remaining.toFixed(1) + '(w)', '',
      'Interface Admin  Oper       Power   Device              Class Max',
      '                           (Watts)                            ',
      '--------- ------ ---------- ------- ------------------- ----- ----'];
    Object.keys(info.ports).forEach(function (n) {
      if (only && only !== n) return;
      var p = info.ports[n];
      o.push(pad(U.shortIf(n), 10) + pad(p.admin, 7) + pad(p.oper, 11) + padL(p.watts.toFixed(1), 7) + ' ' + pad(p.device, 20) + pad(p.cls, 6) + '15.4');
    });
    return o.join('\n');
  }

  function portSecurity(state, d, only) {
    if (only) {
      var i = d.config.ifaces[only];
      if (!i || !i.portSec) return 'Port Security              : Disabled\nPort Status                : Secure-down\nViolation Mode             : Shutdown';
      var ps = i.portSec;
      var learned = d.rt.secLearned[only] || [];
      var ed = d.rt.errdisabled[only];
      return [
        'Port Security              : Enabled',
        'Port Status                : ' + (ed ? 'Secure-shutdown' : (portState(state, d, only) === 'connected' ? 'Secure-up' : 'Secure-down')),
        'Violation Mode             : ' + (ps.violation === 'shutdown' ? 'Shutdown' : (ps.violation === 'restrict' ? 'Restrict' : 'Protect')),
        'Aging Time                 : 0 mins',
        'Aging Type                 : Absolute',
        'SecureStatic Address Aging : Disabled',
        'Maximum MAC Addresses      : ' + ps.max,
        'Total MAC Addresses        : ' + Math.max(learned.length, ps.macs.length),
        'Configured MAC Addresses   : 0',
        'Sticky MAC Addresses       : ' + (ps.sticky ? ps.macs.length : 0),
        'Last Source Address:Vlan   : ' + (learned.length ? U.macDots(learned[learned.length - 1]) + ':' + i.accessVlan : '0000.0000.0000:0'),
        'Security Violation Count   : ' + (d.rt.secViolations || 0),
      ].join('\n');
    }
    var o = ['Secure Port  MaxSecureAddr  CurrentAddr  SecurityViolation  Security Action',
      '                (Count)       (Count)          (Count)',
      '---------------------------------------------------------------------------'];
    physPorts(d).forEach(function (n) {
      var i = d.config.ifaces[n];
      if (!i.portSec) return;
      var learned = d.rt.secLearned[n] || [];
      o.push(padL(U.shortIf(n), 11) + padL(i.portSec.max, 15) + padL(Math.min(learned.length, i.portSec.max), 13) + padL(d.rt.secViolations || 0, 19) + '         ' + (i.portSec.violation === 'shutdown' ? 'Shutdown' : 'Restrict'));
    });
    o.push('---------------------------------------------------------------------------');
    return o.join('\n');
  }

  function cdpNeighbors(state, d) {
    var D = S.get(state);
    var o = ['Capability Codes: R - Router, T - Trans Bridge, B - Source Route Bridge',
      '                  S - Switch, H - Host, I - IGMP, r - Repeater, P - Phone,',
      '                  D - Remote, C - CVTA, M - Two-port Mac Relay', '',
      'Device ID        Local Intrfce     Holdtme    Capability  Platform  Port ID'];
    Object.keys(d.config.ifaces).forEach(function (n) {
      var p = D.ports[S.key(d.id, n)];
      if (!p || !p.up) return;
      var peer = state.devices[p.peer.dev];
      if (!peer) return;
      var name, cap, plat, pid;
      if (peer.os === 'ios') { name = peer.config.hostname + '.nordvik.example'; cap = peer.kind === 'router' ? 'R B S I' : 'S I'; plat = peer.model.replace('CISCO', '').replace('/K9', '').replace('WS-C', 'WS-C'); pid = U.shortIf(p.peer.port); }
      else if (peer.kind === 'ap') { name = peer.id; cap = 'T B I'; plat = 'AIR-CAP37'; pid = 'Gig 0'; }
      else return;
      o.push(pad(name.slice(0, 16), 17) + pad(U.shortIf(n).replace('Gi', 'Gig '), 18) + pad('165', 11) + pad(cap, 12) + pad(plat.slice(0, 9), 10) + pid.replace('Gi', 'Gig '));
    });
    o.push('');
    o.push('Total cdp entries displayed : ' + (o.length - 6));
    return o.join('\n');
  }

  // ---------------------------------------------------------------- Routing
  function ipRoute(state, d, filt) {
    var D = S.get(state);
    var routes = S.installedRoutes(state, D, d.id);
    if (filt && S.opMode && U.isIp(filt)) {
      var r = S.routeLookup(state, D, d.id, filt);
      if (!r) return '% Network not in table';
      var hdr = 'Routing entry for ' + r.net + '/' + U.maskToPrefix(r.mask) + (r.net === '0.0.0.0' ? ', supernet' : '');
      var lines = [hdr];
      if (r.type === 'C') {
        lines.push('  Known via "connected", distance 0, metric 0 (connected, via interface)');
        lines.push('  Routing Descriptor Blocks:');
        lines.push('  * directly connected, via ' + r.iface);
      } else {
        lines.push('  Known via "static", distance 1, metric 0' + (r.net === '0.0.0.0' ? ', candidate default path' : ''));
        lines.push('  Routing Descriptor Blocks:');
        lines.push('  * ' + (r.nh || 'directly connected, via ' + r.iface));
        lines.push('      Route metric is 0, traffic share count is 1');
      }
      return lines.join('\n');
    }
    if (filt === 'static') routes = routes.filter(function (r) { return r.type[0] === 'S'; });
    if (filt === 'connected') routes = routes.filter(function (r) { return r.type === 'C' || r.type === 'L'; });
    var def = routes.filter(function (r) { return r.type === 'S*'; })[0];
    var o = ['Codes: L - local, C - connected, S - static, R - RIP, M - mobile, B - BGP',
      '       D - EIGRP, EX - EIGRP external, O - OSPF, IA - OSPF inter area',
      '       N1 - OSPF NSSA external type 1, N2 - OSPF NSSA external type 2',
      '       E1 - OSPF external type 1, E2 - OSPF external type 2',
      '       i - IS-IS, su - IS-IS summary, L1 - IS-IS level-1, L2 - IS-IS level-2',
      '       ia - IS-IS inter area, * - candidate default, U - per-user static route',
      '       o - ODR, P - periodic downloaded static route, H - NHRP, l - LISP',
      '       + - replicated route, % - next hop override', '',
      'Gateway of last resort is ' + (def ? (def.nh || '0.0.0.0') + ' to network 0.0.0.0' : 'not set'), ''];
    // Gruppera per klassfullt nät för utskriftens rubriker
    var groups = {};
    routes.forEach(function (r) {
      var first = parseInt(r.net.split('.')[0], 10);
      var cls = r.net === '0.0.0.0' ? '0.0.0.0/0' : (first < 128 ? r.net.split('.')[0] + '.0.0.0/8' : (first < 192 ? r.net.split('.').slice(0, 2).join('.') + '.0.0/16' : r.net.split('.').slice(0, 3).join('.') + '.0/24'));
      (groups[cls] = groups[cls] || []).push(r);
    });
    Object.keys(groups).sort(function (a, b) { return U.ipToInt(a.split('/')[0]) - U.ipToInt(b.split('/')[0]); }).forEach(function (g) {
      var rs = groups[g];
      if (g === '0.0.0.0/0') {
        rs.forEach(function (r) { o.push(r.nh ? 'S*    0.0.0.0/0 [' + (r.ad || 1) + '/0] via ' + r.nh : 'S*    0.0.0.0/0 is directly connected, ' + r.iface); });
        return;
      }
      var masks = {};
      rs.forEach(function (r) { masks[r.mask] = true; });
      if (rs.length > 1 || U.maskToPrefix(rs[0].mask) !== parseInt(g.split('/')[1], 10)) {
        o.push('      ' + g + ' is variably subnetted, ' + rs.length + ' subnets, ' + Object.keys(masks).length + ' masks');
      }
      rs.sort(function (a, b) { return U.ipToInt(a.net) - U.ipToInt(b.net) || (a.type === 'C' ? -1 : 1); });
      rs.forEach(function (r) {
        var pfx = r.net + '/' + U.maskToPrefix(r.mask);
        if (r.type === 'C') o.push('C        ' + pfx + ' is directly connected, ' + r.iface);
        else if (r.type === 'L') o.push('L        ' + pfx + ' is directly connected, ' + r.iface);
        else if (r.nh) o.push('S        ' + pfx + ' [' + (r.ad || 1) + '/0] via ' + r.nh);
        else o.push('S        ' + pfx + ' is directly connected, ' + r.iface);
      });
    });
    return o.join('\n');
  }

  function dhcpBinding(state, d) {
    var o = ['Bindings from all pools not associated with VRF:',
      'IP address          Client-ID/              Lease expiration        Type       State      Interface',
      '                    Hardware address/',
      '                    User name'];
    var b = d.rt.dhcpBindings;
    Object.keys(b).sort(function (x, y) { return U.ipToInt(x) - U.ipToInt(y); }).forEach(function (ip) {
      var e = b[ip];
      if (e.conflict) return;
      var mac = e.mac ? '01' + e.mac : '';
      var cid = mac.match(/.{1,4}/g).join('.');
      o.push(pad(ip, 20) + pad(cid, 24) + pad('Sep 30 2026 08:00 AM', 24) + pad('Automatic', 11) + pad('Active', 11) + subIfFor(d, ip));
    });
    return o.join('\n');
  }
  function subIfFor(d, ip) {
    var n = Object.keys(d.config.ifaces).filter(function (k) { var i = d.config.ifaces[k]; return i.ip && U.sameSubnet(ip, i.ip.addr, i.ip.mask); })[0];
    return n ? U.shortIf(n) : 'Unknown';
  }
  function dhcpPool(state, d, only) {
    var o = [];
    Object.keys(d.config.dhcpPools).forEach(function (name) {
      if (only && only !== name) return;
      var p = d.config.dhcpPools[name];
      if (!p.network) { o.push('', 'Pool ' + name + ' :', ' Utilization mark (high/low)    : 100 / 0', ' Subnet size (first/next)       : 0 / 0', ' Total addresses                : 0', ' Leased addresses               : 0'); return; }
      var total = Math.pow(2, 32 - U.maskToPrefix(p.mask)) - 2;
      var leased = Object.keys(d.rt.dhcpBindings).filter(function (ip) { return d.rt.dhcpBindings[ip].pool === name && !d.rt.dhcpBindings[ip].conflict; }).length;
      var ex = 0;
      var net = U.ipToInt(p.network);
      for (var n = net + 1; n < net + 1 + total; n++) {
        var ip = U.intToIp(n);
        if (d.config.dhcpExcluded.some(function (x) { var v = U.ipToInt(ip); return v >= U.ipToInt(x[0]) && v <= U.ipToInt(x[1] || x[0]); })) ex++;
      }
      o.push('');
      o.push('Pool ' + name + ' :');
      o.push(' Utilization mark (high/low)    : 100 / 0');
      o.push(' Subnet size (first/next)       : 0 / 0 ');
      o.push(' Total addresses                : ' + total);
      o.push(' Leased addresses               : ' + leased);
      o.push(' Excluded addresses             : ' + ex);
      o.push(' Pending event                  : none');
      o.push(' 1 subnet is currently in the pool :');
      o.push(' Current index        IP address range                    Leased/Excluded/Total');
      o.push(' ' + pad(U.intToIp(net + 1 + Math.min(total - 1, leased + ex)), 21) + pad(U.intToIp(net + 1) + '     - ' + U.intToIp(net + total), 36) + leased + '    / ' + ex + '     / ' + total);
    });
    return o.join('\n');
  }

  function natTranslations(state, d) {
    var o = ['Pro Inside global         Inside local          Outside local         Outside global'];
    d.config.nat.statics.forEach(function (s) {
      o.push(pad('---', 4) + pad(s.global, 22) + pad(s.local, 22) + pad('---', 22) + '---');
    });
    d.rt.natTrans.forEach(function (t) {
      if (t.fromStatic) return;
      var pro = t.proto === 'icmp' ? 'icmp' : t.proto;
      o.push(pad(pro, 4) + pad(t.global + ':' + t.port, 22) + pad(t.local + ':' + t.port, 22) + pad(t.dst + ':' + t.dport, 22) + t.dst + ':' + t.dport);
    });
    if (o.length === 1) return '';
    return o.join('\n');
  }
  function natStatistics(state, d) {
    var ins = [], outs = [];
    ifaceNames(d).forEach(function (n) {
      var i = d.config.ifaces[n];
      if (i.natDir === 'inside') ins.push(n);
      if (i.natDir === 'outside') outs.push(n);
    });
    var dyn = d.rt.natTrans.filter(function (t) { return !t.fromStatic; }).length;
    var o = ['Total active translations: ' + (dyn + d.config.nat.statics.length) + ' (' + d.config.nat.statics.length + ' static, ' + dyn + ' dynamic; ' + dyn + ' extended)',
      'Peak translations: ' + (dyn + d.config.nat.statics.length + 3),
      'Outside interfaces:', '  ' + (outs.join(', ') || ''),
      'Inside interfaces: ', '  ' + (ins.join(', ') || ''),
      'Hits: ' + (d.rt.natHits || dyn * 12) + '  Misses: 0',
      'CEF Translated packets: ' + (dyn * 12) + ', CEF Punted packets: 0',
      'Expired translations: 0',
      'Dynamic mappings:'];
    d.config.nat.dynamic.forEach(function (n) {
      o.push('-- Inside Source');
      o.push('[Id: 1] access-list ' + n.acl + ' interface ' + n.iface + ' refcount ' + dyn);
    });
    o.push('Total doors: 0');
    o.push('Appl doors: 0');
    o.push('Normal doors: 0');
    o.push('Queued Packets: 0');
    return o.join('\n');
  }

  function accessLists(state, d, only, ipOnly) {
    var o = [];
    Object.keys(d.config.acls).forEach(function (name) {
      if (only && only !== name) return;
      var a = d.config.acls[name];
      var numbered = /^\d+$/.test(name);
      o.push((a.type === 'standard' ? 'Standard' : 'Extended') + ' IP access list ' + name);
      var c = d.rt.aclCounters[name] || {};
      a.rules.forEach(function (r) {
        if (r.remark) return;
        var txt = aceText(a.type, r).replace('deny  ', 'deny').replace(/\s+/g, ' ');
        if (a.type === 'standard' && r.src && !r.src.any && !r.src.host && r.src.wild && r.src.wild !== '0.0.0.0') txt = r.action + ' ' + r.src.ip + ', wildcard bits ' + r.src.wild;
        var m = c[r.seq] ? ' (' + c[r.seq] + ' match' + (c[r.seq] === 1 ? '' : 'es') + ')' : '';
        o.push('    ' + r.seq + ' ' + txt + m);
      });
    });
    return o.join('\n');
  }

  function ipInterface(state, d, n) {
    var i = d.config.ifaces[n];
    var D = S.get(state);
    var ep = D.eps['E:' + d.id + ':' + n];
    var up = ep && ep.up;
    var first = ipIntBrief(state, d).split('\n').filter(function (l) { return l.indexOf(n + ' ') === 0; })[0];
    var st = first ? first.slice(60, 82).trim() : 'down';
    var o = [n + ' is ' + st + ', line protocol is ' + (up ? 'up' : 'down')];
    if (i.ip) {
      o.push('  Internet address is ' + i.ip.addr + '/' + U.maskToPrefix(i.ip.mask));
      o.push('  Broadcast address is 255.255.255.255');
      o.push('  Address determined by non-volatile memory');
      o.push('  MTU is ' + (i.mtu || 1500) + ' bytes');
      o.push('  Helper address is not set');
      o.push('  Directed broadcast forwarding is disabled');
      o.push('  Outgoing access list is ' + (i.aclOut || 'not set'));
      o.push('  Inbound  access list is ' + (i.aclIn || 'not set'));
      o.push('  Proxy ARP is enabled');
      o.push('  Local Proxy ARP is disabled');
      o.push('  Security level is default');
      o.push('  Split horizon is enabled');
      o.push('  ICMP redirects are always sent');
      o.push('  ICMP unreachables are always sent');
      o.push('  ICMP mask replies are never sent');
      o.push('  IP fast switching is enabled');
      o.push('  IP CEF switching is enabled');
      o.push('  Network address translation is ' + (i.natDir ? 'enabled, interface in domain ' + i.natDir : 'disabled'));
      o.push('  TCP Adjust MSS is ' + (i.adjustMss ? i.adjustMss : 'disabled'));
      if (i.cryptoMap) o.push('  Crypto map ' + i.cryptoMap + ' is applied (IPsec, plaintext mtu ' + S.TUNNEL_MTU + ')');
    } else {
      o.push('  Internet protocol processing disabled');
    }
    return o.join('\n');
  }

  function arpTable(state, d) {
    var D = S.get(state);
    var o = ['Protocol  Address          Age (min)  Hardware Addr   Type   Interface'];
    var rows = [];
    S.devEps(D, d.id).forEach(function (e) {
      if (!e.up) return;
      rows.push({ ip: e.ip, age: '-', mac: e.mac, iface: e.iface });
      var seg = D.comp[e.key];
      (D.bySeg[seg] || []).forEach(function (x) {
        if (x.dev === d.id || !x.up || !x.ip) return;
        if (!U.sameSubnet(x.ip, e.ip, e.mask)) return;
        var dv = state.devices[x.dev];
        if (dv.kind === 'switch' && d.kind !== 'router') return;
        rows.push({ ip: x.ip, age: String(1 + (U.hash(x.ip) % 40)), mac: x.mac, iface: e.iface });
      });
    });
    rows.sort(function (a, b) { return U.ipToInt(a.ip) - U.ipToInt(b.ip); });
    rows.forEach(function (r) {
      o.push('Internet  ' + pad(r.ip, 17) + pad(r.age, 11) + pad(U.macDots(r.mac), 16) + 'ARPA   ' + r.iface);
    });
    return o.join('\n');
  }

  function ipSsh(state, d) {
    var v = S.sshEnabled(d);
    if (!v) return 'SSH Disabled - version 1.99\n%Please create RSA keys to enable SSH (and of atleast 768 bits for SSH v2).\nAuthentication methods:publickey,keyboard-interactive,password\nAuthentication timeout: 120 secs; Authentication retries: 3';
    return 'SSH Enabled - version ' + (v === 2 ? '2.0' : '1.99') + '\nAuthentication methods:publickey,keyboard-interactive,password\nAuthentication Publickey Algorithms:x509v3-ssh-rsa,ssh-rsa\nHostkey Algorithms:x509v3-ssh-rsa,ssh-rsa\nEncryption Algorithms:aes128-ctr,aes192-ctr,aes256-ctr\nMAC Algorithms:hmac-sha2-256,hmac-sha2-512,hmac-sha1\nAuthentication timeout: ' + (d.config.ssh.timeout || 120) + ' secs; Authentication retries: ' + (d.config.ssh.retries != null ? d.config.ssh.retries : 3) + '\nMinimum expected Diffie Hellman key size : 2048 bits\nIOS Keys in SECSH format(ssh-rsa, base64 encoded): ' + d.config.hostname + '\nssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC' + d.baseMac + 'k9Xp2vT...';
  }

  function showVersion(state, d) {
    var up = Math.max(0, Math.floor(state.time - d.rt.bootTime));
    var dd = Math.floor(up / 86400), hh = Math.floor(up % 86400 / 3600), mm = Math.floor(up % 3600 / 60);
    var upTxt = (dd ? dd + ' day' + (dd > 1 ? 's' : '') + ', ' : '') + (hh ? hh + ' hour' + (hh > 1 ? 's' : '') + ', ' : '') + mm + ' minute' + (mm !== 1 ? 's' : '');
    if (d.kind === 'router') {
      return ['Cisco IOS Software, C2951 Software (C2951-UNIVERSALK9-M), Version 15.2(4)M11, RELEASE SOFTWARE (fc2)',
        'Technical Support: http://www.cisco.com/techsupport',
        'Copyright (c) 1986-2016 by Cisco Systems, Inc.',
        '',
        'ROM: System Bootstrap, Version 15.0(1r)M15, RELEASE SOFTWARE (fc1)',
        '',
        d.config.hostname + ' uptime is ' + upTxt,
        'System returned to ROM by ' + (d.rt.reloads ? 'reload at ' + NV.sim.stamp(state, d) : 'power-on'),
        'System image file is "flash0:c2951-universalk9-mz.SPA.152-4.M11.bin"',
        'Last reload type: Normal Reload',
        '',
        'Cisco CISCO2951/K9 (revision 1.0) with 491520K/32768K bytes of memory.',
        'Processor board ID FTX1629AHB2',
        '3 Gigabit Ethernet interfaces',
        '1 terminal line',
        'DRAM configuration is 72 bits wide with parity enabled.',
        '255K bytes of non-volatile configuration memory.',
        '255744K bytes of ATA System CompactFlash 0 (Read/Write)',
        '',
        'Configuration register is ' + (d.config.confReg || '0x2102') + (d.config.confRegNext && d.config.confRegNext !== (d.config.confReg || '0x2102') ? ' (will be ' + d.config.confRegNext + ' at next reload)' : '')].join('\n');
    }
    var img = d.model.indexOf('3750') >= 0 ? 'C3750-IPSERVICESK9-M' : 'C3560-IPSERVICESK9-M';
    return ['Cisco IOS Software, ' + img.split('-')[0] + ' Software (' + img + '), Version 12.2(55)SE12, RELEASE SOFTWARE (fc2)',
      'Technical Support: http://www.cisco.com/techsupport',
      'Copyright (c) 1986-2017 by Cisco Systems, Inc.',
      '',
      'ROM: Bootstrap program is ' + img.split('-')[0] + ' boot loader',
      '',
      d.config.hostname + ' uptime is ' + upTxt,
      'System returned to ROM by ' + (d.rt.reloads ? 'reload' : 'power-on'),
      'System image file is "flash:/' + img.toLowerCase() + '.122-55.SE12.bin"',
      '',
      'cisco ' + d.model + ' (PowerPC405) processor (revision F0) with 131072K bytes of memory.',
      'Processor board ID FOC1133Z0R4',
      '28 Gigabit Ethernet interfaces',
      'The password-recovery mechanism is enabled.',
      '',
      '512K bytes of flash-simulated non-volatile configuration memory.',
      'Base ethernet MAC Address       : ' + U.macColon(d.baseMac).toUpperCase(),
      'Model number                    : ' + d.model,
      '',
      'Configuration register is ' + (d.config.confReg || '0xF') + (d.config.confRegNext && d.config.confRegNext !== (d.config.confReg || '0xF') ? ' (will be ' + d.config.confRegNext + ' at next reload)' : '')].join('\n');
  }

  function showClock(state, d) {
    var c = S.deviceClock(state, d);
    return (c.synced ? '' : '*') + c.hms + '.' + c.ms + ' ' + (c.synced ? 'CEST' : 'UTC') + ' ' + c.dow + ' ' + c.mon + ' ' + c.day + ' ' + c.year;
  }
  function showClockDetail(state, d) {
    var c = S.deviceClock(state, d);
    return showClock(state, d) + '\n' + (c.synced ? 'Time source is NTP' : 'No time source') + (d.config.ntpSource ? ' (source interface ' + d.config.ntpSource + ')' : '');
  }
  function ntpAssociations(state, d) {
    var ok = S.ntpSynced(state, d);
    var o = ['', '  address         ref clock       st   when   poll reach  delay  offset   disp'];
    d.config.ntpServers.forEach(function (n, i) {
      var good = ok && i === 0;
      o.push((good ? '*~' : ' ~') + pad(n, 16) + pad(good ? '.GPS.' : '.INIT.', 16) + padL(good ? 1 : 16, 2) + padL(good ? 37 : '-', 7) + padL(64, 7) + padL(good ? 377 : 0, 6) + padL(good ? '1.230' : '0.000', 7) + padL(good ? '0.452' : '0.000', 8) + padL(good ? '0.911' : '15937', 7));
    });
    o.push(' * sys.peer, # selected, + candidate, - outlyer, x falseticker, ~ configured');
    return o.join('\n');
  }
  function ipCef(state, d, ip) {
    var rt = S.routeLookup(state, S.get(state), d.id, ip);
    if (!rt) return '0.0.0.0/0\n  no route';
    var pfx = U.maskToPrefix(rt.mask);
    return rt.net + '/' + pfx + '\n  ' + (rt.nh ? 'nexthop ' + rt.nh + ' ' + rt.iface : 'attached to ' + rt.iface);
  }
  function ntpStatus(state, d) {
    if (!d.config.ntpServers.length) return '%NTP is not enabled.';
    var ok = S.ntpSynced(state, d);
    if (ok) return 'Clock is synchronized, stratum 3, reference is ' + d.config.ntpServers[0] + '\nnominal freq is 119.2092 Hz, actual freq is 119.2090 Hz, precision is 2**18\nreference time is E8A1F3C2.1D2F9A11 (08:00:01.114 CEST Tue Sep 29 2026)\nclock offset is 0.4521 msec, root delay is 1.23 msec';
    return 'Clock is unsynchronized, stratum 16, no reference clock\nnominal freq is 119.2092 Hz, actual freq is 119.2092 Hz, precision is 2**18\nreference time is 00000000.00000000 (00:00:00.000 UTC Mon Jan 1 1900)';
  }
  function showLogging(state, d) {
    var c = d.config.logging;
    var o = ['Syslog logging: enabled (0 messages dropped, 0 messages rate-limited, 0 flushes, 0 overruns, xml disabled, filtering disabled)', '',
      'No Active Message Discriminator.', '', 'No Inactive Message Discriminator.', '',
      '    Console logging: level debugging, ' + (d.rt.logs.length + 40) + ' messages logged, xml disabled,',
      '                     filtering disabled',
      '    Monitor logging: level debugging, 0 messages logged, xml disabled,',
      '                     filtering disabled',
      '    Buffer logging:  ' + (c.buffered ? 'level debugging, ' + d.rt.logs.length + ' messages logged, xml disabled,' : 'disabled'),
      '                    filtering disabled',
      '    Exception Logging: size (8192 bytes)',
      '    Count and timestamp logging messages: disabled',
      '    Persistent logging: disabled', '',
      'No active filter modules.', '',
      '    Trap logging: level informational, ' + (d.rt.logs.length + 12) + ' message lines logged'];
    c.hosts.forEach(function (h) { o.push('        Logging to ' + h + '  (udp port 514, audit disabled,', '              link up),', '              ' + d.rt.logs.length + ' message lines logged,', '              0 message lines rate-limited,', '              0 message lines dropped-by-MD,', '              xml disabled, sequence number disabled', '              filtering disabled'); });
    if (c.buffered) {
      o.push('');
      o.push('Log Buffer (' + c.size + ' bytes):');
      o.push('');
      d.rt.logs.forEach(function (l) { o.push(l); });
    }
    return o.join('\n');
  }

  function interfacesDescription(state, d) {
    var o = ['Interface                      Status         Protocol Description'];
    ifaceNames(d).forEach(function (n) {
      var i = d.config.ifaces[n];
      if (i.internal) return;
      var line = ipIntBrief(state, d).split('\n').filter(function (l) { return l.indexOf(n + ' ') === 0; })[0] || '';
      var st = line.slice(60, 82).trim(), pr = line.slice(82).trim();
      if (st === 'administratively down') st = 'admin down';
      o.push(pad(U.shortIf(n), 31) + pad(st, 15) + pad(pr, 9) + (i.description || ''));
    });
    return o.join('\n');
  }

  function vlanId(state, d, v) {
    var full = vlanBrief(state, d).split('\n');
    var rows = full.filter(function (l) { return new RegExp('^' + v + '\\s').test(l); });
    if (!rows.length) return 'VLAN id ' + v + ' not found in current VLAN database';
    var idx = full.indexOf(rows[0]);
    var out = ['', 'VLAN Name                             Status    Ports', '---- -------------------------------- --------- -------------------------------', rows[0]];
    for (var i = idx + 1; i < full.length && /^\s{40,}/.test(full[i]); i++) out.push(full[i]);
    var trunks = physPorts(d).filter(function (n) { return S.opMode(state, d.id, n) === 'trunk' && S.trunkVlans(d, d.config.ifaces[n]).indexOf(v) >= 0 && portState(state, d, n) === 'connected'; }).map(U.shortIf);
    out.push('');
    out.push('VLAN Type  SAID       MTU   Parent RingNo BridgeNo Stp  BrdgMode Trans1 Trans2');
    out.push('---- ----- ---------- ----- ------ ------ -------- ---- -------- ------ ------');
    out.push(pad(v, 5) + 'enet  ' + pad(100000 + v, 11) + '1500  -      -      -        -    -        0      0');
    if (trunks.length) { out.push(''); out.push('Trunkar som bär VLAN ' + v + ': ' + trunks.join(', ')); }
    return out.join('\n');
  }
  function processesCpu(state, d) {
    var D = S.get(state);
    var storm = Object.keys(D.storm).some(function (v) { return D.storm[v].indexOf(d.id) >= 0; });
    var c5 = storm ? 99 : 3 + (U.hash(d.id) % 5), c1 = storm ? 98 : c5 + 1, c5m = storm ? 96 : c5;
    var o = ['CPU utilization for five seconds: ' + c5 + '%/' + (storm ? 91 : 0) + '%; one minute: ' + c1 + '%; five minutes: ' + c5m + '%',
      ' PID Runtime(ms)     Invoked      uSecs   5Sec   1Min   5Min TTY Process'];
    var procs = storm ? [['96', '98765432', '1234567', '80', '71.43%', '70.12%', '69.80%', 'Hulc LED Process'], ['4', '5432100', '99887', '54', '19.81%', '18.90%', '18.02%', 'ARP Input'], ['18', '120000', '5000', '24', '4.51%', '4.40%', '4.33%', 'Spanning Tree']]
      : [['96', '12345', '8765', '1408', '1.12%', '1.05%', '1.01%', 'Hulc LED Process'], ['4', '2345', '1998', '1173', '0.15%', '0.12%', '0.11%', 'ARP Input'], ['18', '980', '877', '1117', '0.08%', '0.07%', '0.07%', 'Spanning Tree']];
    procs.forEach(function (p) { o.push(padL(p[0], 4) + padL(p[1], 12) + padL(p[2], 13) + padL(p[3], 11) + padL(p[4], 7) + padL(p[5], 7) + padL(p[6], 7) + '   0 ' + p[7]); });
    return o.join('\n');
  }
  function cdpDetail(state, d) {
    var D = S.get(state);
    var o = [];
    Object.keys(d.config.ifaces).forEach(function (n) {
      var p = D.ports[S.key(d.id, n)];
      if (!p || !p.up) return;
      var peer = state.devices[p.peer.dev];
      if (!peer || (peer.os !== 'ios' && peer.kind !== 'ap')) return;
      var ip = peer.os === 'ios' ? (S.devEps(D, peer.id).filter(function (e) { return e.up && e.ip; })[0] || {}).ip : peer.nic.static && peer.nic.static.ip;
      o.push('-------------------------');
      o.push('Device ID: ' + (peer.os === 'ios' ? peer.config.hostname + '.nordvik.example' : peer.id));
      o.push('Entry address(es): ');
      if (ip) o.push('  IP address: ' + ip);
      o.push('Platform: cisco ' + (peer.model || 'AIR-CAP3702I-E-K9') + ',  Capabilities: ' + (peer.kind === 'router' ? 'Router Switch IGMP' : (peer.kind === 'ap' ? 'Trans-Bridge Source-Route-Bridge IGMP' : 'Switch IGMP')));
      o.push('Interface: ' + n + ',  Port ID (outgoing port): ' + (peer.os === 'ios' ? p.peer.port : 'GigabitEthernet0'));
      o.push('Holdtime : 164 sec');
      o.push('');
      o.push('Version :');
      o.push(peer.kind === 'router' ? 'Cisco IOS Software, C2951 Software (C2951-UNIVERSALK9-M), Version 15.2(4)M11' : (peer.kind === 'ap' ? 'Cisco AP Software, ap3g2-k9w8 Version: 15.3(3)JA' : 'Cisco IOS Software, C3560 Software (C3560-IPSERVICESK9-M), Version 12.2(55)SE12'));
      o.push('');
      if (peer.os === 'ios' && peer.config.ifaces[p.peer.port].native) o.push('Native VLAN: ' + peer.config.ifaces[p.peer.port].native);
      o.push('Duplex: ' + (p.neg ? p.neg.duplex : 'full'));
      if (ip) o.push('Management address(es): ', '  IP address: ' + ip);
      o.push('');
    });
    o.push('Total cdp entries displayed : ' + o.filter(function (l) { return /^Device ID/.test(l); }).length);
    return o.join('\n');
  }
  function stpSummary(state, d) {
    var D = S.get(state);
    var vl = Object.keys(d.config.vlans).map(Number).sort(function (a, b) { return a - b; });
    var root = vl.filter(function (v) { var i = D.stp[d.id] && D.stp[d.id][v]; return i && i.isRoot; });
    var o = ['Switch is in pvst mode', 'Root bridge for: ' + (root.length ? root.map(function (v) { return 'VLAN' + ('000' + v).slice(-4); }).join(', ') : 'none'),
      'Extended system ID                      is enabled', 'Portfast Default                        is disabled', 'PortFast BPDU Guard Default             is disabled',
      'Loopguard Default                       is disabled', 'EtherChannel misconfig guard            is enabled', 'UplinkFast                              is disabled', 'BackboneFast                            is disabled',
      '', 'Name                   Blocking Listening Learning Forwarding STP Active', '---------------------- -------- --------- -------- ---------- ----------'];
    var tb = 0, tf = 0, nv = 0;
    vl.forEach(function (v) {
      if (d.config.stpOff.indexOf(v) >= 0) return;
      var ports = physPorts(d).filter(function (n) {
        var p = D.ports[S.key(d.id, n)];
        if (!p || !p.up) return false;
        var i = d.config.ifaces[n];
        return S.opMode(state, d.id, n) === 'trunk' ? S.trunkVlans(d, i).indexOf(v) >= 0 : i.accessVlan === v;
      });
      if (!ports.length) return;
      nv++;
      var b = ports.filter(function (n) { return D.blocked[S.key(d.id, n) + '#' + v]; }).length;
      tb += b; tf += ports.length - b;
      o.push(pad('VLAN' + ('000' + v).slice(-4), 23) + padL(b, 8) + padL(0, 10) + padL(0, 9) + padL(ports.length - b, 11) + padL(ports.length, 11));
    });
    o.push('---------------------- -------- --------- -------- ---------- ----------');
    o.push(pad(nv + ' vlans', 23) + padL(tb, 8) + padL(0, 10) + padL(0, 9) + padL(tf, 11) + padL(tb + tf, 11));
    if (d.config.stpOff.length) o.push('', 'Spanning tree is DISABLED for VLAN ' + U.vlanListStr(d.config.stpOff.slice().sort(function (a, b) { return a - b; })));
    return o.join('\n');
  }
  function stpBlocked(state, d) {
    var D = S.get(state);
    var o = ['', 'Name                 Blocked Interfaces List', '-------------------- ------------------------------------'];
    var n = 0;
    Object.keys(D.blocked).forEach(function (k) {
      if (k.indexOf(d.id + '|') !== 0) return;
      var parts = k.split('|')[1].split('#');
      o.push(pad('VLAN' + ('000' + parts[1]).slice(-4), 21) + U.shortIf(parts[0]) + (D.blocked[k] === 'BKN*' ? ' (*PVID_Inc)' : ''));
      n++;
    });
    o.push('');
    o.push('Number of blocked ports (segments) in the system : ' + n);
    return o.join('\n');
  }
  function inventory(state, d) {
    var sn = 'FOC' + (U.hash(d.id) % 900000 + 100000) + 'X' + (U.hash(d.id + 'x') % 90 + 10);
    if (d.kind === 'router') return 'NAME: "CISCO2951/K9 chassis", DESCR: "CISCO2951/K9 chassis"\nPID: CISCO2951/K9      , VID: V05 , SN: ' + sn + '\n\nNAME: "PVDM3-32 on Motherboard", DESCR: "PVDMIII DSP SIMM with two DSPs"\nPID: PVDM3-32          , VID: V01 , SN: ' + sn.replace('FOC', 'FOX');
    var D = S.get(state);
    var sfp = physPorts(d).filter(function (n) { return d.config.ifaces[n].sfp && D.ports[S.key(d.id, n)]; });
    var o = ['NAME: "1", DESCR: "' + d.model + '"', 'PID: ' + d.model + '    , VID: V02  , SN: ' + sn];
    sfp.forEach(function (n) { o.push('', 'NAME: "' + n + '", DESCR: "1000BaseSX SFP"', 'PID: GLC-SX-MMD          , VID: V01  , SN: AGM' + (U.hash(n + d.id) % 9000000)); });
    return o.join('\n');
  }
  function countersErrors(state, d) {
    var o = ['', 'Port        Align-Err     FCS-Err    Xmit-Err     Rcv-Err  UnderSize  OutDiscards'];
    physPorts(d).forEach(function (n) {
      var c = d.rt.counters[n] || { crc: 0, runts: 0, late: 0, coll: 0 };
      o.push(pad(U.shortIf(n), 10) + padL(0, 12) + padL(Math.floor(c.crc), 12) + padL(0, 12) + padL(Math.floor(c.crc + c.runts), 12) + padL(Math.floor(c.runts), 11) + padL(0, 13));
    });
    o.push('', 'Port      Single-Col  Multi-Col   Late-Col  Excess-Col  Carri-Sen      Runts');
    physPorts(d).forEach(function (n) {
      var c = d.rt.counters[n] || { crc: 0, runts: 0, late: 0, coll: 0 };
      o.push(pad(U.shortIf(n), 10) + padL(Math.floor(c.coll * 0.6), 10) + padL(Math.floor(c.coll * 0.4), 11) + padL(Math.floor(c.late), 11) + padL(0, 12) + padL(0, 11) + padL(Math.floor(c.runts), 11));
    });
    return o.join('\n');
  }

  return {
    vlanId: vlanId, processesCpu: processesCpu, cdpDetail: cdpDetail, stpSummary: stpSummary, stpBlocked: stpBlocked, inventory: inventory, countersErrors: countersErrors,
    runningConfig: runningConfig, startupConfig: startupConfig, runningInterface: runningInterface,
    interfacesStatus: interfacesStatus, ipIntBrief: ipIntBrief, showInterface: showInterface, switchport: switchport,
    vlanBrief: vlanBrief, interfacesTrunk: interfacesTrunk, macTable: macTable, spanningTree: spanningTree,
    powerInline: powerInline, portSecurity: portSecurity, cdpNeighbors: cdpNeighbors, ipRoute: ipRoute,
    dhcpBinding: dhcpBinding, dhcpPool: dhcpPool, natTranslations: natTranslations, natStatistics: natStatistics,
    accessLists: accessLists, ipInterface: ipInterface, arpTable: arpTable, ipSsh: ipSsh, showVersion: showVersion,
    showClock: showClock, ntpStatus: ntpStatus, showLogging: showLogging, interfacesDescription: interfacesDescription,
    hashSecret: hashSecret, aceText: aceText, ifaceNames: ifaceNames, physPorts: physPorts, portState: portState,
    showClockDetail: showClockDetail, ntpAssociations: ntpAssociations, ipCef: ipCef,
    cryptoIsakmpSa: cryptoIsakmpSa, cryptoIpsecSa: cryptoIpsecSa, cryptoMapShow: cryptoMapShow, cryptoIsakmpPolicy: cryptoIsakmpPolicy, cryptoSession: cryptoSession,
  };
})();
