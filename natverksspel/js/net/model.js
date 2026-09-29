// Nordviks nät: enheter, kablar och "golden config" enligt adressplanen (bilaga G).
NV.model = (function () {
  var U = NV.util;

  function mac(id, n) {
    var h = U.hash(id + ':' + (n || 0)).toString(16);
    while (h.length < 8) h = '0' + h;
    var ouiList = ['3cd92b', 'a4c3f0', '001aa1', '0011bc', '5c5015', 'f8b156', '84b802', '00227e'];
    var oui = ouiList[U.hash(id) % ouiList.length];
    return (oui + h).slice(0, 12);
  }

  function switchPort(n) {
    return {
      shutdown: false, description: '', mode: 'dynamic auto', accessVlan: 1, encap: null,
      allowed: 'all', native: 1, nonegotiate: false, speed: 'auto', duplex: 'auto', poe: 'auto',
      portSec: null, portfast: false, sfp: n > 24,
    };
  }
  function routerPort() {
    return {
      shutdown: true, description: '', ip: null, speed: 'auto', duplex: 'auto',
      natDir: null, aclIn: null, aclOut: null,
    };
  }

  function baseIos(id, model, kind, site) {
    return {
      id: id, kind: kind, model: model, site: site, os: 'ios', powered: true,
      baseMac: mac(id),
      config: {
        hostname: kind === 'router' ? 'Router' : 'Switch',
        enableSecret: null, domainName: null, domainLookup: true, nameServers: [], dnsServer: false,
        hosts: {}, ifaces: {}, vlans: {}, stpOff: [], stpPriority: {}, routes: [], defaultGateway: null,
        dhcpExcluded: [], dhcpPools: {}, acls: {}, nat: { statics: [], dynamic: [] },
        ssh: { version: null }, cryptoKey: null, users: {},
        lines: {
          con: { speed: 9600, loginLocal: false, password: null, logSync: false },
          vty0_4: { transport: 'all', loginLocal: false, password: null },
          vty5_15: { transport: 'all', loginLocal: false, password: null },
        },
        logging: { buffered: true, size: 4096, hosts: [] }, ntpServers: [], timestampsMsec: false,
        ipRouting: kind === 'router',
      },
      startup: null,
      rt: {
        logs: [], dhcpBindings: {}, natTrans: [], aclCounters: {}, errdisabled: {}, secLearned: {},
        counters: {}, bootTime: -86400 * 12 - 3600 * 5, reloads: 0,
      },
    };
  }

  function makeSwitch(id, model, site) {
    var d = baseIos(id, model, 'switch', site);
    for (var i = 1; i <= 28; i++) d.config.ifaces['GigabitEthernet0/' + i] = switchPort(i);
    d.config.ifaces['Vlan1'] = { shutdown: true, ip: null, svi: 1 };
    d.config.vlans = { 1: 'default' };
    d.poeBudget = /PS$/.test(model) ? 370 : 0;
    return d;
  }
  function makeRouter(id, model, site) {
    var d = baseIos(id, model, 'router', site);
    ['GigabitEthernet0/0', 'GigabitEthernet0/1', 'GigabitEthernet0/2'].forEach(function (n) {
      d.config.ifaces[n] = routerPort();
    });
    d.config.ifaces['Embedded-Service-Engine0/0'] = { shutdown: true, ip: null, internal: true };
    return d;
  }
  function makeHost(id, os, opts) {
    return {
      id: id, kind: opts.kind || 'host', os: os, site: opts.site || 'gbg', powered: opts.powered !== false,
      label: opts.label || id, user: opts.user || null,
      nic: {
        mac: mac(id, 7), dhcp: !!opts.dhcp,
        static: opts.ip ? { ip: opts.ip, mask: opts.mask, gw: opts.gw || null, dns: opts.dns || [] } : null,
        enabled: true,
      },
      lease: null, // {ip,mask,gw,dns,server,pool}
      arp: {}, services: opts.services || [], poeClass: opts.poeClass || 0, poeWatts: opts.poeWatts || 0,
      wireless: !!opts.wireless, ssid: null,
    };
  }

  function sub(d, name, vlan, ip, mask, extra) {
    var o = { parent: name.split('.')[0], encap: vlan, ip: { addr: ip, mask: mask }, shutdown: false, natDir: null, aclIn: null, aclOut: null, description: '' };
    for (var k in extra) o[k] = extra[k];
    d.config.ifaces[name] = o;
  }
  function access(d, port, vlan, desc, extra) {
    var p = d.config.ifaces['GigabitEthernet0/' + port];
    p.mode = 'access'; p.accessVlan = vlan; p.description = desc || ''; p.portfast = true;
    for (var k in extra) p[k] = extra[k];
  }
  function trunk(d, port, desc, allowed, native, extra) {
    var p = d.config.ifaces['GigabitEthernet0/' + port];
    p.mode = 'trunk'; p.encap = 'dot1q'; p.allowed = allowed; p.native = native; p.description = desc || '';
    p.nonegotiate = true;
    for (var k in extra) p[k] = extra[k];
  }

  function commonMgmt(d, secret) {
    var c = d.config;
    c.enableSecret = secret;
    c.enablePlain = 'Krabba2026';
    c.domainName = 'nordvik.example';
    c.users = { drift: { priv: 15, secret: '$9$Kx7mP2qRwT$e8Ld0Qf3vB1nZ6yHs5gJ4aUcW9oXrEiM2tNpA7kYl', plain: 'Krabba2026' } };
    c.ssh.version = 2;
    c.cryptoKey = 2048;
    c.lines.con.logSync = true;
    c.lines.vty0_4 = { transport: 'ssh', loginLocal: true, password: null };
    c.lines.vty5_15 = { transport: 'ssh', loginLocal: true, password: null };
    c.logging = { buffered: true, size: 16384, hosts: ['192.168.1.17'] };
    c.ntpServers = ['192.168.1.16'];
    c.timestampsMsec = true;
  }

  function buildGolden(opts) {
    opts = opts || {};
    var devices = {};
    var links = [];
    function add(d) { devices[d.id] = d; return d; }
    function link(a, ap, b, bp, kind, extra) {
      var l = { id: 'L' + links.length, a: { dev: a, port: ap }, b: { dev: b, port: bp }, kind: kind || 'copper', state: 'ok', color: 'blue' };
      for (var k in extra) l[k] = extra[k];
      links.push(l);
      return l;
    }

    // ---------------- Göteborg ----------------
    var R1 = add(makeRouter('R1', 'CISCO2951/K9', 'gbg'));
    var c = R1.config;
    commonMgmt(R1, '$9$nV3qL8sR2dF$h4Jk9Lm2Pq8rSt6Uv1Wx3Yz5Ab7Cd9Ef0Gh2Ij4K');
    c.hostname = 'R-Nordvik-1';
    c.nameServers = ['9.9.9.9']; c.dnsServer = true;
    c.hosts = { filserver: '192.168.1.10', skrivare: '192.168.1.11', ntp: '192.168.1.16', logg: '192.168.1.17', ekonomi: '192.168.1.70', 'lager-pc': '192.168.2.20' };
    c.ifaces['GigabitEthernet0/0'].shutdown = false;
    c.ifaces['GigabitEthernet0/0'].description = 'Trunk mot SW-Nordvik-1';
    sub(R1, 'GigabitEthernet0/0.10', 10, '192.168.1.1', '255.255.255.192', { natDir: 'inside', description: 'KONTOR' });
    sub(R1, 'GigabitEthernet0/0.20', 20, '192.168.1.65', '255.255.255.192', { natDir: 'inside', description: 'EKONOMI' });
    sub(R1, 'GigabitEthernet0/0.30', 30, '192.168.1.129', '255.255.255.192', { natDir: 'inside', aclIn: 'GAST', description: 'GAST' });
    sub(R1, 'GigabitEthernet0/0.99', 99, '192.168.1.193', '255.255.255.192', { natDir: 'inside', description: 'DRIFT' });
    var g1 = c.ifaces['GigabitEthernet0/1'];
    g1.shutdown = false; g1.ip = { addr: '203.0.113.10', mask: '255.255.255.0' }; g1.natDir = 'outside'; g1.description = 'Ut mot operatoren';
    var g2 = c.ifaces['GigabitEthernet0/2'];
    g2.shutdown = false; g2.ip = { addr: '10.0.0.1', mask: '255.255.255.252' }; g2.natDir = 'inside'; g2.description = 'Lank mot Boras';
    c.routes = [
      { net: '0.0.0.0', mask: '0.0.0.0', nh: '203.0.113.1' },
      { net: '192.168.2.0', mask: '255.255.255.0', nh: '10.0.0.2' },
    ];
    c.dhcpExcluded = [['192.168.1.1', '192.168.1.19'], ['192.168.1.65', '192.168.1.79'], ['192.168.1.129', '192.168.1.139']];
    c.dhcpPools = {
      KONTOR: { network: '192.168.1.0', mask: '255.255.255.192', defaultRouter: ['192.168.1.1'], dns: ['192.168.1.1'], lease: 1 },
      EKONOMI: { network: '192.168.1.64', mask: '255.255.255.192', defaultRouter: ['192.168.1.65'], dns: ['192.168.1.65'], lease: 1 },
      GAST: { network: '192.168.1.128', mask: '255.255.255.192', defaultRouter: ['192.168.1.129'], dns: ['9.9.9.9'], lease: 1 },
    };
    c.acls = {
      '1': { type: 'standard', rules: [
        { seq: 10, action: 'permit', src: { ip: '192.168.1.0', wild: '0.0.0.255' } },
        { seq: 20, action: 'permit', src: { ip: '192.168.2.0', wild: '0.0.0.255' } },
      ] },
      'GAST': { type: 'extended', rules: [
        { seq: 10, action: 'deny', proto: 'ip', src: { ip: '192.168.1.128', wild: '0.0.0.63' }, dst: { ip: '192.168.1.0', wild: '0.0.0.255' } },
        { seq: 20, action: 'deny', proto: 'ip', src: { ip: '192.168.1.128', wild: '0.0.0.63' }, dst: { ip: '192.168.2.0', wild: '0.0.0.255' } },
        { seq: 30, action: 'permit', proto: 'ip', src: { any: true }, dst: { any: true } },
      ] },
    };
    if (opts.week >= 9) {
      // Kapitel 9: kontoret ska inte nå ekonominätet
      c.acls['KONTOR-UT'] = { type: 'extended', rules: [
        { seq: 10, action: 'deny', proto: 'ip', src: { ip: '192.168.1.0', wild: '0.0.0.63' }, dst: { ip: '192.168.1.64', wild: '0.0.0.63' } },
        { seq: 20, action: 'permit', proto: 'ip', src: { any: true }, dst: { any: true } },
      ] };
      c.ifaces['GigabitEthernet0/0.10'].aclIn = 'KONTOR-UT';
    }
    c.nat = {
      statics: [{ local: '192.168.1.10', global: '203.0.113.11' }],
      dynamic: [{ acl: '1', iface: 'GigabitEthernet0/1', overload: true }],
    };

    var SW1 = add(makeSwitch('SW1', 'WS-C3560G-24PS', 'gbg'));
    commonMgmt(SW1, '$9$pQ4wE7rT1yU$i8Oo2Pp6Aa4Ss8Dd2Ff6Gg0Hh4Jj8Kk2Ll6Zz0Xx4C');
    c = SW1.config;
    c.hostname = 'SW-Nordvik-1';
    c.vlans = { 1: 'default', 10: 'KONTOR', 20: 'EKONOMI', 30: 'GAST', 99: 'DRIFT' };
    c.stpPriority = { 10: 24576, 20: 24576, 30: 24576, 99: 24576 };
    trunk(SW1, 1, 'Trunk mot R-Nordvik-1', [10, 20, 30, 99], 999);
    access(SW1, 5, 10, 'Anna');
    access(SW1, 6, 10, 'Karim');
    access(SW1, 7, 20, 'Bo');
    access(SW1, 8, 20, 'Maja');
    access(SW1, 9, 30, 'Reception gast', { portSec: { max: 1, violation: 'shutdown', sticky: true, macs: [] } });
    access(SW1, 10, 99, 'Teknikerbanken');
    access(SW1, 11, 10, 'Skrivare');
    access(SW1, 12, 10, 'Sara');
    access(SW1, 20, 99, 'WLC-Nordvik');
    trunk(SW1, 24, 'Trunk mot SW-Nordvik-2', [10, 20, 30, 99], 999);
    trunk(SW1, 25, 'Reservlank mot SW-Nordvik-2', [10, 20, 30, 99], 999);
    c.ifaces['Vlan99'] = { shutdown: false, ip: { addr: '192.168.1.194', mask: '255.255.255.192' }, svi: 99 };
    c.defaultGateway = '192.168.1.193';

    var SW2 = add(makeSwitch('SW2', 'WS-C3750G-24PS', 'gbg'));
    commonMgmt(SW2, '$9$zX5cV9bN3mQ$w2Ee6Rr0Tt4Yy8Uu2Ii6Oo0Pp4Aa8Ss2Dd6Ff0Gg4H');
    c = SW2.config;
    c.hostname = 'SW-Nordvik-2';
    c.vlans = { 1: 'default', 10: 'KONTOR', 20: 'EKONOMI', 30: 'GAST', 99: 'DRIFT' };
    access(SW2, 2, 10, 'Filserver');
    access(SW2, 3, 10, 'NTP-server');
    access(SW2, 4, 10, 'Loggserver');
    access(SW2, 5, 10, 'Lisa');
    access(SW2, 8, 20, 'Ekonomisystem');
    trunk(SW2, 24, 'Trunk mot SW-Nordvik-1', [10, 20, 30, 99], 999);
    trunk(SW2, 25, 'Reservlank mot SW-Nordvik-1', [10, 20, 30, 99], 999);
    c.ifaces['Vlan99'] = { shutdown: false, ip: { addr: '192.168.1.195', mask: '255.255.255.192' }, svi: 99 };
    c.defaultGateway = '192.168.1.193';

    // Värdar i Göteborg
    add(makeHost('PC-Anna', 'windows', { dhcp: true, label: 'Annas dator', user: 'Anna' }));
    add(makeHost('PC-Karim', 'windows', { dhcp: true, label: 'Karims dator', user: 'Karim' }));
    add(makeHost('PC-Bo', 'windows', { dhcp: true, label: 'Bos dator', user: 'Bo' }));
    add(makeHost('PC-Maja', 'windows', { dhcp: true, label: 'Majas dator', user: 'Maja' }));
    add(makeHost('PC-Sara', 'windows', { dhcp: true, label: 'Saras dator', user: 'Sara' }));
    add(makeHost('PC-Lisa', 'windows', { dhcp: true, label: 'Lisas dator', user: 'Lisa' }));
    add(makeHost('Gast-laptop', 'windows', { dhcp: true, label: 'Gästlaptop i receptionen', user: 'Gäst' }));
    add(makeHost('Tekniker', 'linux', { ip: '192.168.1.200', mask: '255.255.255.192', gw: '192.168.1.193', dns: ['192.168.1.193'], label: 'Din laptop' }));
    add(makeHost('Skrivare', 'device', { ip: '192.168.1.11', mask: '255.255.255.192', gw: '192.168.1.1', kind: 'printer', label: 'Skrivare' }));
    add(makeHost('Filserver', 'server', { ip: '192.168.1.10', mask: '255.255.255.192', gw: '192.168.1.1', dns: ['192.168.1.1'], kind: 'server', label: 'Filserver', services: ['smb'] }));
    add(makeHost('NTP-server', 'server', { ip: '192.168.1.16', mask: '255.255.255.192', gw: '192.168.1.1', kind: 'server', label: 'NTP-server', services: ['ntp'] }));
    add(makeHost('Loggserver', 'server', { ip: '192.168.1.17', mask: '255.255.255.192', gw: '192.168.1.1', kind: 'server', label: 'Loggserver', services: ['syslog'] }));
    add(makeHost('Ekonomisystem', 'server', { ip: '192.168.1.70', mask: '255.255.255.192', gw: '192.168.1.65', kind: 'server', label: 'Ekonomisystem', services: ['https'] }));
    add(makeHost('WLC', 'wlc', { ip: '192.168.1.196', mask: '255.255.255.192', gw: '192.168.1.193', kind: 'wlc', label: 'WLC-Nordvik (AIR-WLC4402)' }));
    // Oanvänd brandvägg i racket (kapitel 9 använder routerns ACL:er)
    devices['ASA'] = { id: 'ASA', kind: 'asa', os: 'none', site: 'gbg', powered: true, label: 'ASA5540 (inte i drift än)' };

    SW1.config.ifaces['GigabitEthernet0/9'].portSec.macs = [devices['Gast-laptop'].nic.mac];

    link('SW1', 'GigabitEthernet0/1', 'R1', 'GigabitEthernet0/0', 'copper', { color: 'yellow' });
    link('SW1', 'GigabitEthernet0/24', 'SW2', 'GigabitEthernet0/24', 'copper', { color: 'yellow' });
    link('SW1', 'GigabitEthernet0/25', 'SW2', 'GigabitEthernet0/25', 'fiber', { color: 'orange' });
    link('SW1', 'GigabitEthernet0/5', 'PC-Anna', 'nic');
    link('SW1', 'GigabitEthernet0/6', 'PC-Karim', 'nic');
    link('SW1', 'GigabitEthernet0/7', 'PC-Bo', 'nic');
    link('SW1', 'GigabitEthernet0/8', 'PC-Maja', 'nic');
    link('SW1', 'GigabitEthernet0/9', 'Gast-laptop', 'nic');
    link('SW1', 'GigabitEthernet0/10', 'Tekniker', 'nic', 'copper', { color: 'green' });
    link('SW1', 'GigabitEthernet0/11', 'Skrivare', 'nic');
    link('SW1', 'GigabitEthernet0/12', 'PC-Sara', 'nic');
    link('SW1', 'GigabitEthernet0/20', 'WLC', 'nic', 'copper', { color: 'green' });
    link('SW2', 'GigabitEthernet0/2', 'Filserver', 'nic', 'copper', { color: 'gray' });
    link('SW2', 'GigabitEthernet0/3', 'NTP-server', 'nic', 'copper', { color: 'gray' });
    link('SW2', 'GigabitEthernet0/4', 'Loggserver', 'nic', 'copper', { color: 'gray' });
    link('SW2', 'GigabitEthernet0/5', 'PC-Lisa', 'nic');
    link('SW2', 'GigabitEthernet0/8', 'Ekonomisystem', 'nic', 'copper', { color: 'gray' });

    // ---------------- Operatören / internet ----------------
    devices['ISP'] = {
      id: 'ISP', kind: 'isp', os: 'none', site: 'internet', powered: true, baseMac: mac('ISP'),
      ip: '203.0.113.1', mask: '255.255.255.0',
    };
    link('R1', 'GigabitEthernet0/1', 'ISP', 'nic', 'fiber', { color: 'red' });

    // ---------------- Borås ----------------
    var RB = add(makeRouter('RB', 'CISCO2951/K9', 'boras'));
    commonMgmt(RB, '$9$bR7aS2dF5gH$j3Kk7Ll1Zz5Xx9Cc3Vv7Bb1Nn5Mm9Qq3Ww7Ee1Rr5T');
    c = RB.config;
    c.hostname = 'R-Boras-1';
    c.nameServers = ['9.9.9.9']; c.dnsServer = true;
    c.hosts = { filserver: '192.168.1.10', ekonomi: '192.168.1.70' };
    c.ifaces['GigabitEthernet0/0'].shutdown = false;
    c.ifaces['GigabitEthernet0/0'].description = 'Trunk mot SW-Boras-1';
    sub(RB, 'GigabitEthernet0/0.40', 40, '192.168.2.1', '255.255.255.192', { description: 'LAGER' });
    sub(RB, 'GigabitEthernet0/0.50', 50, '192.168.2.65', '255.255.255.192', { description: 'TRADLOST-GAST' });
    sub(RB, 'GigabitEthernet0/0.99', 99, '192.168.2.193', '255.255.255.192', { description: 'DRIFT' });
    var b2 = c.ifaces['GigabitEthernet0/2'];
    b2.shutdown = false; b2.ip = { addr: '10.0.0.2', mask: '255.255.255.252' }; b2.description = 'Lank mot Goteborg';
    c.routes = [{ net: '0.0.0.0', mask: '0.0.0.0', nh: '10.0.0.1' }];
    c.dhcpExcluded = [['192.168.2.1', '192.168.2.19'], ['192.168.2.65', '192.168.2.69']];
    c.dhcpPools = {
      LAGER: { network: '192.168.2.0', mask: '255.255.255.192', defaultRouter: ['192.168.2.1'], dns: ['192.168.2.1'], lease: 1 },
      'TRADLOST-GAST': { network: '192.168.2.64', mask: '255.255.255.192', defaultRouter: ['192.168.2.65'], dns: ['9.9.9.9'], lease: 1 },
    };
    c.acls = {
      'GAST-B': { type: 'extended', rules: [
        { seq: 10, action: 'deny', proto: 'ip', src: { ip: '192.168.2.64', wild: '0.0.0.63' }, dst: { ip: '192.168.0.0', wild: '0.0.255.255' } },
        { seq: 20, action: 'permit', proto: 'ip', src: { any: true }, dst: { any: true } },
      ] },
    };
    c.ifaces['GigabitEthernet0/0.50'].aclIn = 'GAST-B';

    var SWB = add(makeSwitch('SWB', 'WS-C3560G-24PS', 'boras'));
    commonMgmt(SWB, '$9$mN8bV4cX6zL$k9Jj3Hh7Gg1Ff5Dd9Ss3Aa7Pp1Oo5Ii9Uu3Yy7Tt1R');
    c = SWB.config;
    c.hostname = 'SW-Boras-1';
    c.vlans = { 1: 'default', 40: 'LAGER', 50: 'TRADLOST-GAST', 99: 'DRIFT' };
    c.stpPriority = { 40: 24576, 50: 24576, 99: 24576 };
    [1, 2, 3].forEach(function (n) {
      trunk(SWB, n, 'AP-Lager-' + n, [40, 50, 99], 99, { nonegotiate: true });
      SWB.config.ifaces['GigabitEthernet0/' + n].portfast = true;
    });
    access(SWB, 5, 40, 'Lagerdator');
    trunk(SWB, 24, 'Trunk mot R-Boras-1', [40, 50, 99], 999);
    c.ifaces['Vlan99'] = { shutdown: false, ip: { addr: '192.168.2.194', mask: '255.255.255.192' }, svi: 99 };
    c.defaultGateway = '192.168.2.193';

    add(makeHost('PC-Lager', 'windows', { dhcp: true, site: 'boras', label: 'Lagerdatorn', user: 'Nils' }));
    [1, 2, 3].forEach(function (n) {
      add(makeHost('AP-Lager-' + n, 'ap', { ip: '192.168.2.20' + n, mask: '255.255.255.192', gw: '192.168.2.193', kind: 'ap', site: 'boras', label: 'AP-Lager-' + n + ' (AIR-CAP3702)', poeClass: 3, poeWatts: 15.4 }));
    });
    add(makeHost('Gast-mobil', 'phone', { dhcp: true, site: 'boras', wireless: true, label: 'Gästens mobil', user: 'Gäst' }));
    add(makeHost('Lager-skanner', 'phone', { dhcp: true, site: 'boras', wireless: true, label: 'Streckkodsläsare', user: 'Nils' }));

    link('SWB', 'GigabitEthernet0/24', 'RB', 'GigabitEthernet0/0', 'copper', { color: 'yellow' });
    link('SWB', 'GigabitEthernet0/1', 'AP-Lager-1', 'nic', 'copper', { color: 'white' });
    link('SWB', 'GigabitEthernet0/2', 'AP-Lager-2', 'nic', 'copper', { color: 'white' });
    link('SWB', 'GigabitEthernet0/3', 'AP-Lager-3', 'nic', 'copper', { color: 'white' });
    link('SWB', 'GigabitEthernet0/5', 'PC-Lager', 'nic');
    link('R1', 'GigabitEthernet0/2', 'RB', 'GigabitEthernet0/2', 'wan', { color: 'red' });

    // Trådlösa controllern: AireOS-liknande konfiguration
    devices['WLC'].wlc = {
      sysName: 'WLC-Nordvik',
      interfaces: {
        management: { vlan: 99, ip: '192.168.1.196' },
        lager: { vlan: 40, ip: '192.168.2.10' },
        gast: { vlan: 50, ip: '192.168.2.66' },
      },
      wlans: {
        1: { ssid: 'Nordvik-Lager', iface: 'lager', enabled: true, security: 'WPA2-PSK' },
        2: { ssid: 'Nordvik-Gast', iface: 'gast', enabled: true, security: 'WPA2-PSK' },
      },
      apChannels: { 'AP-Lager-1': 1, 'AP-Lager-2': 6, 'AP-Lager-3': 11 },
      saved: null,
    };

    var state = { devices: devices, links: links, time: 0, flags: {} };
    // Startup = running för alla IOS-enheter
    Object.keys(devices).forEach(function (id) {
      var d = devices[id];
      if (d.os === 'ios') d.startup = U.clone(d.config);
      if (d.wlc) d.wlc.saved = U.clone({ wlans: d.wlc.wlans, apChannels: d.wlc.apChannels });
    });
    return state;
  }

  function linkAt(state, dev, port) {
    for (var i = 0; i < state.links.length; i++) {
      var l = state.links[i];
      if (l.a.dev === dev && l.a.port === port) return { link: l, me: l.a, peer: l.b };
      if (l.b.dev === dev && l.b.port === port) return { link: l, me: l.b, peer: l.a };
    }
    return null;
  }

  return { buildGolden: buildGolden, linkAt: linkAt, mac: mac };
})();
