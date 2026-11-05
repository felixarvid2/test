// OSPF och BGP i IOS-kommandotolken (kurs 2, Routing och switching).
// Konfigurationen sparas i dev.config.ospf och dev.config.bgp; simulatorn räknar grannskap och rutter
// i js/net/dynroute.js. Utdata följer IOS 15 och Packet Tracer 9 så långt labbarna använder dem.
(function () {
  if (!NV.IosSession || !NV.IosSession.api) return;
  var A = NV.IosSession.api, def = A.def, showDef = A.showDef;
  var U = NV.util, S = NV.sim, SH = NV.iosShow;
  var pad = U.pad, padL = U.padL;

  function cfg(s) { return s.dev.config; }
  function isRouter(s) { return s.dev.kind === 'router'; }
  function touch(s) { S.touch(s.state); }
  function D(s) { return S.get(s.state); }
  function two(n) { return (n < 10 ? '0' : '') + n; }
  function hms(sec) { sec = Math.max(0, Math.floor(sec)); return two(Math.floor(sec / 3600) % 24) + ':' + two(Math.floor(sec / 60) % 60) + ':' + two(sec % 60); }
  function ospfOf(s) { return cfg(s).ospf; }
  function bgpOf(s) { return cfg(s).bgp; }
  function routerOnly(fn) { return function (v, n, k, l) { if (!isRouter(this)) return A.invalidMarker(this, l, k[0] || 'router'); return fn.call(this, v, n, k, l); }; }

  // ------------------------------------------------------------------ Hjälptexter
  var H = A.HELP;
  [['router', 'Enable a routing process'], ['ospf', 'Open Shortest Path First (OSPF)'], ['bgp', 'Border Gateway Protocol (BGP)'],
   ['router-id', 'router-id for this OSPF process'], ['area', 'Set the OSPF area ID'], ['passive-interface', 'Suppress routing updates on an interface'],
   ['default', 'Suppress routing updates on all interfaces'], ['auto-cost', 'Calculate OSPF interface cost according to bandwidth'],
   ['reference-bandwidth', 'Use reference bandwidth method to assign OSPF cost'], ['default-information', 'Control distribution of default information'],
   ['originate', 'Distribute a default route'], ['always', 'Always advertise default route'], ['log-adjacency-changes', 'Log changes in adjacency state'],
   ['neighbor', 'Specify a neighbor router'], ['remote-as', 'Specify a BGP neighbor'], ['bgp', 'BGP specific commands'],
   ['log-neighbor-changes', 'Log neighbor up/down and reset reason'], ['hello-interval', 'Time between HELLO packets'], ['dead-interval', 'Interval after which a neighbor is declared dead'],
   ['cost', 'Interface cost'], ['bandwidth', 'Set bandwidth informational parameter'], ['clock', 'Configure serial interface clock'], ['rate', 'Configure serial interface clock speed'],
   ['summary', 'Summary of BGP neighbor status'], ['database', 'Database summary'], ['process', 'Reset OSPF process']].forEach(function (h) { if (!H[h[0]]) H[h[0]] = h[1]; });
  var SHH = A.SHOW_HELP;
  [['ospf', 'OSPF information'], ['bgp', 'BGP information'], ['protocols', 'IP routing protocol process parameters and statistics']].forEach(function (h) { SHH[h[0]] = SHH[h[0]] || h[1]; });

  // ------------------------------------------------------------------ Lägen
  function endFn() { this.mode = 'exec'; this.ctx = {}; S.pushLog(this.state, this.dev, '%SYS-5-CONFIG_I: Configured from ' + (this.via === 'console' ? 'console by console' : 'vty0 (192.168.1.200)')); return ''; }
  ['ospf', 'bgp'].forEach(function (m) {
    def(m, 'end', endFn, { no: false });
    def(m, 'exit', function () { this.leaveSub(); this.mode = 'config'; return ''; }, { no: false });
  });

  // ------------------------------------------------------------------ OSPF: konfiguration
  def('config', 'router ospf <n:1-65535>', routerOnly(function (v, neg) {
    var c = cfg(this);
    if (neg) { if (c.ospf && c.ospf.pid === v[0]) delete c.ospf; touch(this); return ''; }
    if (!c.ospf) c.ospf = { pid: v[0], routerId: null, networks: [], passiveDefault: false, passive: [], noPassive: [], refBw: 100, defaultOriginate: false, defaultAlways: false, logAdj: true };
    else if (c.ospf.pid !== v[0]) return '% OSPF process ' + c.ospf.pid + ' is already running. Only one process is supported here.';
    this.mode = 'ospf'; this.ctx = { pid: v[0] };
    touch(this);
    return '';
  }));
  def('ospf', 'router-id <ip>', function (v, neg) {
    var o = ospfOf(this);
    o.routerId = neg ? null : v[0];
    touch(this);
    return '';
  });
  function areaNum(a) { return typeof a === 'number' ? a : (U.isIp(a) ? U.ipToInt(a) : parseInt(a, 10)); }
  function networkCmd(v, neg) {
    var o = ospfOf(this), area = areaNum(v[2]);
    var same = function (x) { return x.net === v[0] && x.wild === v[1]; };
    if (neg) { o.networks = o.networks.filter(function (x) { return !(same(x) && x.area === area); }); touch(this); return ''; }
    var ex = o.networks.filter(same)[0];
    if (ex && ex.area !== area) return '% OSPF: "network ' + v[0] + ' ' + v[1] + ' area ' + ex.area + '" is already configured';
    if (!ex) o.networks.push({ net: v[0], wild: v[1], area: area });
    touch(this);
    return '';
  }
  def('ospf', 'network <ip> <wild> area <n:0-4294967295>', networkCmd);
  def('ospf', 'network <ip> <wild> area <ip>', networkCmd);
  def('ospf', 'passive-interface <if>', function (v, neg) {
    var o = ospfOf(this), n = v[0];
    if (!cfg(this).ifaces[n]) return '% Invalid input detected at \'^\' marker.';
    o.passive = o.passive || []; o.noPassive = o.noPassive || [];
    if (o.passiveDefault) {
      if (neg) { if (o.noPassive.indexOf(n) < 0) o.noPassive.push(n); }
      else o.noPassive = o.noPassive.filter(function (x) { return x !== n; });
    } else if (neg) o.passive = o.passive.filter(function (x) { return x !== n; });
    else if (o.passive.indexOf(n) < 0) o.passive.push(n);
    touch(this);
    return '';
  });
  def('ospf', 'passive-interface default', function (v, neg) {
    var o = ospfOf(this);
    o.passiveDefault = !neg; o.passive = []; o.noPassive = [];
    touch(this);
    return '';
  });
  def('ospf', 'auto-cost reference-bandwidth <n:1-4294967>', function (v, neg) {
    ospfOf(this).refBw = neg ? 100 : v[0];
    touch(this);
    return neg ? '' : '% OSPF: Reference bandwidth is changed.\n        Please ensure reference bandwidth is consistent across all routers.';
  });
  def('ospf', 'default-information originate', function (v, neg) { var o = ospfOf(this); o.defaultOriginate = !neg; if (neg) o.defaultAlways = false; touch(this); return ''; });
  def('ospf', 'default-information originate always', function (v, neg) { var o = ospfOf(this); o.defaultOriginate = !neg; o.defaultAlways = !neg; touch(this); return ''; });
  def('ospf', 'log-adjacency-changes', function (v, neg) { ospfOf(this).logAdj = !neg; return ''; });
  def('ospf', 'log-adjacency-changes detail', function (v, neg) { ospfOf(this).logAdj = !neg; return ''; });

  // Interfacekommandon
  function setIf(key) {
    return function (v, neg) {
      var s = this;
      return A.eachIf(this, function (i) { if (neg) delete i[key]; else i[key] = v[0]; touch(s); });
    };
  }
  def('if', 'ip ospf hello-interval <n:1-65535>', setIf('ospfHello'));
  def('if', 'ip ospf dead-interval <n:1-65535>', setIf('ospfDead'));
  def('if', 'ip ospf cost <n:1-65535>', setIf('ospfCost'));
  def('if', 'bandwidth <n:1-10000000>', setIf('bandwidth'));
  [['ip ospf hello-interval', 'ospfHello'], ['ip ospf dead-interval', 'ospfDead'], ['ip ospf cost', 'ospfCost'], ['bandwidth', 'bandwidth'], ['clock rate', 'clockRate']].forEach(function (x) {
    def('if', x[0], function () { var s = this; return A.eachIf(this, function (i) { delete i[x[1]]; touch(s); }); }, { noOnly: true });
  });
  def('ospf', 'router-id', function () { ospfOf(this).routerId = null; touch(this); return ''; }, { noOnly: true });
  def('ospf', 'auto-cost reference-bandwidth', function () { ospfOf(this).refBw = 100; touch(this); return ''; }, { noOnly: true });
  def('if', 'clock rate <n:300-8000000>', function (v, neg) {
    var s = this;
    return A.eachIf(this, function (i, n) {
      if (!/^Serial/.test(n)) return '% Invalid input detected at \'^\' marker.';
      if (neg) delete i.clockRate; else i.clockRate = v[0];
      touch(s);
    });
  });

  // ------------------------------------------------------------------ BGP: konfiguration
  def('config', 'router bgp <n:1-4294967295>', routerOnly(function (v, neg) {
    var c = cfg(this);
    if (neg) { if (c.bgp && c.bgp.as === v[0]) delete c.bgp; touch(this); return ''; }
    if (c.bgp && c.bgp.as && c.bgp.as !== v[0]) return 'BGP is already running; AS is ' + c.bgp.as;
    if (!c.bgp) c.bgp = { as: v[0], routerId: null, neighbors: {}, networks: [], logChanges: true };
    this.mode = 'bgp'; this.ctx = { as: v[0] };
    touch(this);
    return '';
  }));
  def('bgp', 'bgp router-id <ip>', function (v, neg) { bgpOf(this).routerId = neg ? null : v[0]; touch(this); return ''; });
  def('bgp', 'bgp log-neighbor-changes', function (v, neg) { bgpOf(this).logChanges = !neg; return ''; });
  def('bgp', 'neighbor <ip> remote-as <n:1-4294967295>', function (v, neg) {
    var b = bgpOf(this);
    if (neg) delete b.neighbors[v[0]];
    else { var nb = b.neighbors[v[0]] = b.neighbors[v[0]] || {}; nb.remoteAs = v[1]; }
    touch(this);
    return '';
  });
  function nbr(s, ip) { return bgpOf(s).neighbors[ip]; }
  def('bgp', 'neighbor <ip> shutdown', function (v, neg) {
    var nb = nbr(this, v[0]);
    if (!nb) return '% Specify remote-as or peer-group commands first';
    nb.shutdown = !neg;
    touch(this);
    return '';
  });
  def('bgp', 'neighbor <ip> description <text>', function (v, neg, k, line) {
    var nb = nbr(this, v[0]);
    if (!nb) return '% Specify remote-as or peer-group commands first';
    if (neg) delete nb.description; else nb.description = line.replace(/^.*?description\s+/i, '');
    return '';
  });
  function classMask(ip) {
    var f = parseInt(ip.split('.')[0], 10);
    return f < 128 ? '255.0.0.0' : (f < 192 ? '255.255.0.0' : '255.255.255.0');
  }
  function bgpNetwork(net, mask, neg) {
    var b = bgpOf(this);
    b.networks = b.networks || [];
    b.networks = b.networks.filter(function (n) { return !(n.net === net && n.mask === mask); });
    if (!neg) b.networks.push({ net: net, mask: mask });
    touch(this);
    return '';
  }
  def('bgp', 'network <ip> mask <mask>', function (v, neg) { return bgpNetwork.call(this, v[0], v[1], neg); });
  def('bgp', 'network <ip>', function (v, neg) { return bgpNetwork.call(this, v[0], classMask(v[0]), neg); });

  def('exec', 'clear ip ospf process', function () {
    var self = this;
    if (!ospfOf(this)) return '';
    this.pending = { prompt: 'Reset ALL OSPF processes? [no]: ', fn: function (a) {
      if (/^y/i.test(a || '')) { self.state.dynMem && Object.keys(self.state.dynMem.ospf).forEach(function (k) { if (k.indexOf(self.dev.id + '|') === 0) delete self.state.dynMem.ospf[k]; }); touch(self); }
      return A.result('');
    } };
    return '';
  });
  def('exec', 'clear ip bgp *', function () { touch(this); return ''; });
  def('exec', 'clear ip bgp <ip>', function () { touch(this); return ''; });

  // ------------------------------------------------------------------ OSPF: show
  function R(s) { var d = D(s); return d.dyn && d.dyn.ospf[s.dev.id]; }
  function ifRole(s, r, n) {
    var f = r.ifs[n];
    if (f.loop) return 'LOOP';
    if (!f.up) return 'DOWN';
    if (f.serial) return 'P2P';
    var nbs = r.nbrs.filter(function (x) { return x.iface === n; });
    if (!nbs.length) return 'DR';
    return nbs.some(function (x) { return x.role === 'DR'; }) ? 'BDR' : 'DR';
  }
  function deadLeft(s, nb) { var t = Math.floor(s.state.time || 0); return nb.dead - (t % 10) - 3; }
  showDef('ip ospf neighbor', function () {
    var r = R(this);
    if (!r) return '';
    var self = this;
    var o = ['', 'Neighbor ID     Pri   State           Dead Time   Address         Interface'];
    r.nbrs.forEach(function (nb) {
      var st = 'FULL/' + (nb.role === '-' ? '  -' : nb.role);
      o.push(pad(nb.rid, 16) + padL(nb.serial ? 0 : 1, 3) + '   ' + pad(st, 16) + pad(hms(deadLeft(self, nb)), 12) + pad(nb.ip, 16) + nb.iface);
    });
    return o.join('\n');
  }, true);
  showDef('ip ospf neighbor detail', function () {
    var r = R(this), self = this;
    if (!r) return '';
    return r.nbrs.map(function (nb) {
      return ' Neighbor ' + nb.rid + ', interface address ' + nb.ip + '\n    In the area 0 via interface ' + nb.iface + '\n    Neighbor priority is ' + (nb.serial ? 0 : 1) + ', State is FULL, 6 state changes\n    Options is 0x12 in Hello (E-bit, L-bit)\n    Dead timer due in ' + hms(deadLeft(self, nb)) + '\n    Neighbor is up for ' + hms((self.state.time || 0) - NV.dyn.since(self.state, self.dev.id + '|' + nb.rid + '@' + nb.iface));
    }).join('\n');
  }, true);
  function ifBrief(s, r) {
    var o = ['Interface    PID   Area            IP Address/Mask    Cost  State Nbrs F/C'];
    SH.ifaceNames(s.dev).forEach(function (n) {
      var f = r.ifs[n];
      if (!f) return;
      var nb = r.nbrs.filter(function (x) { return x.iface === n; }).length;
      o.push(pad(U.shortIf(n), 13) + pad(ospfOf(s).pid, 6) + pad(f.area, 16) + pad(f.ip + '/' + U.maskToPrefix(f.mask), 19) + pad(f.cost, 6) + pad(ifRole(s, r, n), 6) + nb + '/' + nb);
    });
    return o.join('\n');
  }
  showDef('ip ospf interface brief', function () { var r = R(this); return r ? ifBrief(this, r) : ''; }, true);
  function ifDetail(s, r, n) {
    var f = r.ifs[n], c = cfg(s), i = c.ifaces[n];
    var up = f && f.up;
    var head = n + ' is ' + (i.shutdown ? 'administratively down' : (up ? 'up' : 'down')) + ', line protocol is ' + (up ? 'up' : 'down');
    if (!f) return head + '\n  Internet Address ' + (i.ip ? i.ip.addr + '/' + U.maskToPrefix(i.ip.mask) : 'unassigned') + '\n  %OSPF: OSPF not enabled on ' + n;
    var role = ifRole(s, r, n), nbs = r.nbrs.filter(function (x) { return x.iface === n; });
    var o = [head,
      '  Internet Address ' + f.ip + '/' + U.maskToPrefix(f.mask) + ', Area ' + f.area + ', Attached via Network Statement',
      '  Process ID ' + ospfOf(s).pid + ', Router ID ' + r.rid + ', Network Type ' + (f.loop ? 'LOOPBACK' : (f.serial ? 'POINT_TO_POINT' : 'BROADCAST')) + ', Cost: ' + f.cost,
      '  Topology-MTID    Cost    Disabled    Shutdown      Topology Name',
      '        0           ' + pad(f.cost, 10) + 'no          no            Base'];
    if (f.loop) { o.push('  Loopback interface is treated as a stub Host'); return o.join('\n'); }
    if (f.serial) o.push('  Transmit Delay is 1 sec, State POINT_TO_POINT');
    else {
      o.push('  Transmit Delay is 1 sec, State ' + role + ', Priority 1');
      var dr = role === 'DR' ? { rid: r.rid, ip: f.ip } : nbs.filter(function (x) { return x.role === 'DR'; })[0];
      if (dr) o.push('  Designated Router (ID) ' + dr.rid + ', Interface address ' + dr.ip);
      var bdr = role === 'BDR' ? { rid: r.rid, ip: f.ip } : nbs.filter(function (x) { return x.role === 'BDR'; })[0];
      o.push(bdr ? '  Backup Designated router (ID) ' + bdr.rid + ', Interface address ' + bdr.ip : '  No backup designated router on this network');
    }
    o.push('  Timer intervals configured, Hello ' + f.hello + ', Dead ' + f.dead + ', Wait ' + f.dead + ', Retransmit 5');
    o.push('    oob-resync timeout ' + f.dead);
    if (f.passive) o.push('    No Hellos (Passive interface)');
    else o.push('    Hello due in 00:00:0' + (f.hello - 1 - (Math.floor(s.state.time || 0) % f.hello) + 10) % 10);
    o.push('  Supports Link-local Signaling (LLS)');
    o.push('  Index 1/1, flood queue length 0');
    o.push('  Last flood scan length is 1, maximum is 3');
    o.push('  Neighbor Count is ' + nbs.length + ', Adjacent neighbor count is ' + nbs.length);
    nbs.forEach(function (x) { o.push('    Adjacent with neighbor ' + x.rid + (x.role === 'DR' ? '  (Designated Router)' : (x.role === 'BDR' ? '  (Backup Designated Router)' : ''))); });
    o.push('  Suppress hello for 0 neighbor(s)');
    return o.join('\n');
  }
  showDef('ip ospf interface', function () {
    var r = R(this), self = this;
    if (!r) return '';
    return SH.ifaceNames(this.dev).filter(function (n) { return r.ifs[n]; }).map(function (n) { return ifDetail(self, r, n); }).join('\n');
  }, true);
  showDef('ip ospf interface <if>', function (v) {
    var r = R(this);
    if (!cfg(this).ifaces[v[0]]) return '% Invalid input detected at \'^\' marker.';
    if (!r) return '';
    return ifDetail(this, r, v[0]);
  }, true);
  showDef('ip ospf', function () {
    var r = R(this), o = ospfOf(this);
    if (!r) return '%OSPF: Router process not running';
    var ifs = Object.keys(r.ifs);
    return [' Routing Process "ospf ' + o.pid + '" with ID ' + r.rid,
      ' Start time: 00:00:05.120, Time elapsed: 12d05h',
      ' Supports only single TOS(TOS0) routes',
      ' Supports opaque LSA',
      (o.defaultOriginate ? ' It is an autonomous system boundary router' : ''),
      ' Router is not originating router-LSAs with maximum metric',
      ' Initial SPF schedule delay 5000 msecs',
      ' Number of areas in this router is 1. 1 normal 0 stub 0 nssa',
      ' Reference bandwidth unit is ' + o.refBw + ' mbps',
      '    Area BACKBONE(0)',
      '        Number of interfaces in this area is ' + ifs.length + ' (' + ifs.filter(function (n) { return r.ifs[n].loop; }).length + ' loopback)',
      '        Area has no authentication',
      '        SPF algorithm last executed 00:01:12.344 ago',
      '        SPF algorithm executed 7 times'].filter(Boolean).join('\n');
  }, true);
  showDef('ip ospf database', function () {
    var d = D(this), r = R(this);
    if (!r) return '';
    var o = ['', '            OSPF Router with ID (' + r.rid + ') (Process ID ' + ospfOf(this).pid + ')', '', '                Router Link States (Area 0)', '',
      'Link ID         ADV Router      Age         Seq#       Checksum Link count'];
    Object.keys(d.dyn.ospf).forEach(function (id) {
      var x = d.dyn.ospf[id];
      if (x.dist && r.dist && r.dist[id] === undefined && id !== r.id) return;
      o.push(pad(x.rid, 16) + pad(x.rid, 16) + pad(300 + (U.hash(id) % 900), 12) + pad('0x8000000' + (3 + U.hash(id) % 6), 11) + pad('0x00' + (U.hash(x.rid) % 0xFFFF).toString(16).toUpperCase(), 9) + Object.keys(x.ifs).length);
    });
    return o.join('\n');
  }, true);
  showDef('ip route ospf', function () { return SH.ipRoute(this.state, this.dev, 'ospf'); }, true);
  showDef('ip route bgp', function () { return SH.ipRoute(this.state, this.dev, 'bgp'); }, true);

  // ------------------------------------------------------------------ show ip protocols
  showDef('ip protocols', function () {
    if (!isRouter(this) && !cfg(this).ipRouting) return '';
    var o = ['*** IP Routing is NSF aware ***', ''], r = R(this), q = ospfOf(this), b = bgpOf(this), self = this;
    if (q && r) {
      o.push('Routing Protocol is "ospf ' + q.pid + '"');
      o.push('  Outgoing update filter list for all interfaces is not set');
      o.push('  Incoming update filter list for all interfaces is not set');
      o.push('  Router ID ' + r.rid);
      if (q.defaultOriginate) o.push('  It is an autonomous system boundary router', '  Redistributing External Routes from,');
      o.push('  Number of areas in this router is 1. 1 normal 0 stub 0 nssa');
      o.push('  Maximum path: 4');
      o.push('  Routing for Networks:');
      (q.networks || []).forEach(function (x) { o.push('    ' + x.net + ' ' + x.wild + ' area ' + x.area); });
      var pas = Object.keys(r.ifs).filter(function (n) { return r.ifs[n].passive; });
      if (pas.length) { o.push('  Passive Interface(s):'); pas.forEach(function (n) { o.push('    ' + n); }); }
      o.push('  Routing Information Sources:');
      o.push('    Gateway         Distance      Last Update');
      r.nbrs.forEach(function (nb) { o.push('    ' + pad(nb.rid, 16) + padL(110, 8) + '      ' + hms((self.state.time || 0) - NV.dyn.since(self.state, self.dev.id + '|' + nb.rid + '@' + nb.iface))); });
      o.push('  Distance: (default is 110)', '');
    }
    if (b && b.as) {
      var bs = D(this).dyn.bgp[this.dev.id];
      o.push('Routing Protocol is "bgp ' + b.as + '"');
      o.push('  Outgoing update filter list for all interfaces is not set');
      o.push('  Incoming update filter list for all interfaces is not set');
      o.push('  IGP synchronization is disabled');
      o.push('  Automatic route summarization is disabled');
      o.push('  Neighbor(s):');
      o.push('    Address          FiltIn FiltOut DistIn DistOut Weight RouteMap');
      Object.keys(b.neighbors || {}).forEach(function (ip) { o.push('    ' + ip); });
      o.push('  Maximum path: 1');
      o.push('  Routing Information Sources:');
      o.push('    Gateway         Distance      Last Update');
      (bs ? bs.peers : []).filter(function (p) { return p.up; }).forEach(function (p) { o.push('    ' + pad(p.ip, 16) + padL(20, 8) + '      ' + hms((self.state.time || 0) - NV.dyn.since(self.state, 'b|' + self.dev.id + '|' + p.ip))); });
      o.push('  Distance: external 20 internal 200 local 200', '');
    }
    return o.join('\n');
  }, true);

  // ------------------------------------------------------------------ BGP: show
  function B(s) { var d = D(s); return d.dyn && d.dyn.bgp[s.dev.id]; }
  function msgs(s, p) {
    if (!p.up) return [0, 0];
    var age = (s.state.time || 0) - NV.dyn.since(s.state, 'b|' + s.dev.id + '|' + p.ip);
    var n = 4 + Math.floor(age / 60);
    return [n, n + 2];
  }
  function bgpUp(s, p) { return hms((s.state.time || 0) - NV.dyn.since(s.state, 'b|' + s.dev.id + '|' + p.ip)); }
  showDef('ip bgp summary', function () {
    var b = B(this), self = this;
    if (!b) return '% BGP not active';
    var pfx = {};
    b.table.forEach(function (t) { pfx[t.net + '/' + t.mask] = true; });
    var np = Object.keys(pfx).length, ver = 1 + np * 2;
    var o = ['BGP router identifier ' + (b.rid || '0.0.0.0') + ', local AS number ' + b.as,
      'BGP table version is ' + ver + ', main routing table version ' + ver];
    if (np) {
      o.push(np + ' network entries using ' + (np * 144) + ' bytes of memory');
      o.push(b.table.length + ' path entries using ' + (b.table.length * 80) + ' bytes of memory');
      o.push((np + 1) + '/' + np + ' BGP path/bestpath attribute entries using ' + ((np + 1) * 136) + ' bytes of memory');
      o.push(np + ' BGP AS-PATH entries using ' + (np * 40) + ' bytes of memory');
      o.push('0 BGP route-map cache entries using 0 bytes of memory');
      o.push('0 BGP filter-list cache entries using 0 bytes of memory');
      o.push('BGP using ' + (np * 400) + ' total bytes of memory');
      o.push('BGP activity ' + np + '/0 prefixes, ' + b.table.length + '/0 paths, scan interval 60 secs');
    }
    o.push('');
    o.push('Neighbor        V           AS MsgRcvd MsgSent   TblVer  InQ OutQ Up/Down  State/PfxRcd');
    b.peers.forEach(function (p) {
      var m = msgs(self, p);
      o.push(pad(p.ip, 16) + '4' + padL(p.remoteAs || '?', 13) + padL(m[0], 8) + padL(m[1], 8) + padL(p.up ? ver : 1, 9) + padL(0, 5) + padL(0, 5) + ' ' + pad(p.up ? bgpUp(self, p) : 'never', 9) + (p.up ? padL(p.pfx, 8) : p.state));
    });
    return o.join('\n');
  }, true);
  function classful(net, mask) { return mask === (function (f) { return f < 128 ? '255.0.0.0' : (f < 192 ? '255.255.0.0' : '255.255.255.0'); })(parseInt(net.split('.')[0], 10)); }
  showDef('ip bgp', function () {
    var b = B(this), self = this;
    if (!b) return '% BGP not active';
    var o = ['BGP table version is ' + (1 + b.table.length * 2) + ', local router ID is ' + (b.rid || '0.0.0.0'),
      'Status codes: s suppressed, d damped, h history, * valid, > best, i - internal,',
      '              r RIB-failure, S Stale, m multipath, b backup-path, f RT-Filter,',
      '              x best-external, a additional-path, c RIB-compressed,',
      'Origin codes: i - IGP, e - EGP, ? - incomplete',
      'RPKI validation codes: V valid, I invalid, N Not found', '',
      '     Network          Next Hop            Metric LocPrf Weight Path'];
    var d = D(this), conn = S.devEps(d, this.dev.id).filter(function (e) { return e.up && e.ip; }).map(function (e) { return U.network(e.ip, e.mask) + '/' + e.mask; });
    var rows = b.table.slice().sort(function (x, y) { return U.ipToInt(x.net) - U.ipToInt(y.net) || (y.best ? 1 : 0) - (x.best ? 1 : 0); });
    var lastNet = null;
    rows.forEach(function (t) {
      var k = t.net + '/' + t.mask;
      var shown = k === lastNet ? '' : (classful(t.net, t.mask) ? t.net : t.net + '/' + U.maskToPrefix(t.mask));
      lastNet = k;
      var rib = t.best && !t.local && conn.indexOf(k) >= 0;
      var code = (rib ? ' r' : ' *') + (t.best ? '>' : ' ');
      var hop = t.local ? '0.0.0.0' : t.nh;
      o.push(code + '  ' + pad(shown, 17) + pad(hop, 20) + padL(t.local ? 0 : (t.path.length === 1 ? 0 : ''), 6) + '       ' + padL(t.local ? 32768 : 0, 6) + ' ' + (t.path.length ? t.path.join(' ') + ' ' : '') + 'i');
    });
    if (!rows.length) return '';
    return o.join('\n');
  }, true);
  showDef('ip bgp neighbors', function () {
    var b = B(this), self = this;
    if (!b) return '% BGP not active';
    return b.peers.map(function (p) {
      var m = msgs(self, p);
      return 'BGP neighbor is ' + p.ip + ',  remote AS ' + (p.remoteAs || '?') + ', external link\n  BGP version 4, remote router ID ' + (p.up ? p.ip : '0.0.0.0') + '\n  BGP state = ' + (p.up ? 'Established, up for ' + bgpUp(self, p) : p.state.split(' ')[0]) +
        '\n  Last read 00:00:21, last write 00:00:12, hold time is 180, keepalive interval is 60 seconds\n  Message statistics:\n    InQ depth is 0\n    OutQ depth is 0\n                         Sent       Rcvd\n    Total:          ' + padL(m[1], 9) + '  ' + padL(m[0], 9) +
        (p.reason === 'bad-as' ? '\n  Last reset 00:00:12, due to BGP Notification sent, peer in wrong AS' : '');
    }).join('\n\n');
  }, true);
})();
