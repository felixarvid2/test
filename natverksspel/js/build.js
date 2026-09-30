// Bygg från grunden: enheterna kommer fabriksinställda och hela nätet sätts upp via CLI,
// steg för steg efter kursboken och Nordviks adressplan (bilaga G).
(function () {
  var L = NV.levels, U = NV.util, S = NV.sim;

  function both(d, fn) { fn(d.config); if (d.startup) fn(d.startup); }
  function ok(st, from, to) { var r = S.ping(st, from, to); return r.ok && r.loss < 0.9; }
  // Som en riktig dator försöker DHCP-klienten igen om den saknar en giltig adress
  function lease(st, host, net, mask) {
    var h = st.devices[host];
    if (!h) return false;
    var c = S.hostIpConf(h);
    if (!c || c.apipa || !c.ip || !U.inNet(c.ip, net, mask)) { S.dhcp(st, host); c = S.hostIpConf(h); }
    return !!(c && c.ip && !c.apipa && U.inNet(c.ip, net, mask));
  }
  function ifc(st, dev, n) { return st.devices[dev].config.ifaces[n] || {}; }
  function cfg(st, dev) { return st.devices[dev].config; }
  // Nollställ en IOS-enhet till fabriksinställningar: ingen konfiguration och inget sparat
  function wipe(st, id) {
    var d = st.devices[id];
    d.config = NV.model.factoryConfig(d);
    d.startup = null;
    d.rt.dhcpBindings = {}; d.rt.natTrans = []; d.rt.errdisabled = {}; d.rt.aclCounters = {}; d.rt.logs = []; d.rt.ike = {}; d.rt.ipsec = {};
  }
  function renewAll(st) { L.DHCP_HOSTS.forEach(function (h) { if (st.devices[h]) S.dhcp(st, h); }); }
  function vlanNamed(c, id, re) { return !!c.vlans[id] && re.test(c.vlans[id]); }
  function access(c, port, vlan) { var i = c.ifaces['GigabitEthernet0/' + port]; return i.mode === 'access' && i.accessVlan === vlan; }
  function sshOk(st, dev) {
    var d = st.devices[dev], c = d.config;
    return !!S.sshEnabled(d) && S.vtyAllows(d, 'ssh') && !S.vtyAllows(d, 'telnet') && !!c.users.drift;
  }
  function samePol(a, b) { return a.enc === b.enc && a.hash === b.hash && a.auth === b.auth && a.group === b.group; }

  var BUILDS = [
    // ------------------------------------------------------------------ Bygge 1: switchen
    {
      build: 1, week: 101, base: 9, site: 'gbg', chapter: '1, 2 och 4',
      title: 'Switchen från kartongen',
      chips: ['show running-config', 'show vlan brief', 'show interfaces trunk'],
      intro: 'Bygge 1: SW-Nordvik-1 har bytts mot en ny switch direkt från kartongen. Den har ingen konfiguration alls – prompten är Switch>.\n\nBygg upp den igen efter adressplanen:\n• VLAN 10 KONTOR, 20 EKONOMI, 30 GAST, 99 DRIFT\n• Gi0/5–6 och Gi0/11–12 kontor, Gi0/7–8 ekonomi, Gi0/9 gäst, Gi0/10 och Gi0/20 drift\n• Trunkar: Gi0/1 mot routern, Gi0/24 och Gi0/25 mot SW-Nordvik-2 (native VLAN 999)\n• Drift: Vlan99 192.168.1.194/26, gateway 192.168.1.193, bara SSH\n\nKoppla in konsolkabeln i racket och börja med enable.',
      learn: ['hostname och spara konfigurationen', 'vlan och name', 'switchport mode access', 'Trunkar och native VLAN', 'SVI och ip default-gateway', 'SSH på en switch'],
      setup: function (st) { wipe(st, 'SW1'); },
      tasks: [
        {
          id: 'b1a', npc: 'Omar', target: 'SW1', title: 'Grundkonfiguration och spara',
          ticket: 'Omar: "Den nya switchen heter bara Switch. Ge den rätt namn och spara – annars är allt borta efter nästa strömavbrott."',
          hints: ['Konsolen: 9600 8N1. Skriv enable och sedan configure terminal.', 'hostname SW-Nordvik-1 → line con 0 → logging synchronous. Inget lösenord behövs på konsolen.', 'end och sedan write memory (eller copy running-config startup-config). Kontrollera med show startup-config.'],
          check: function (st) { var d = st.devices.SW1; return d.config.hostname === 'SW-Nordvik-1' && !!d.startup && d.startup.hostname === 'SW-Nordvik-1'; },
        },
        {
          id: 'b1b', npc: 'Omar', target: 'SW1', title: 'Skapa VLAN:en',
          ticket: 'Omar: "Switchen känner bara till VLAN 1. Skapa kontorets fyra VLAN med namn, så att show vlan brief blir läsbar."',
          hints: ['I (config)#: vlan 10 och sedan name KONTOR.', 'Samma för vlan 20 EKONOMI, vlan 30 GAST och vlan 99 DRIFT.', 'Kontrollera med do show vlan brief.'],
          check: function (st) { var c = cfg(st, 'SW1'); return vlanNamed(c, 10, /^kontor$/i) && vlanNamed(c, 20, /^ekonomi$/i) && vlanNamed(c, 30, /^gast$/i) && vlanNamed(c, 99, /^drift$/i); },
        },
        {
          id: 'b1c', npc: 'Anna', target: 'SW1', title: 'Accessportar till rätt VLAN',
          ticket: 'Anna: "Min dator får en konstig 169.254-adress. Karim och Sara också. Och ekonomi säger samma sak."',
          hints: ['interface range gi0/5 - 6 → switchport mode access → switchport access vlan 10.', 'Gi0/11–12 VLAN 10, Gi0/7–8 VLAN 20, Gi0/9 VLAN 30, Gi0/10 och Gi0/20 VLAN 99.', 'Lägg gärna spanning-tree portfast på portarna mot datorer. Kontrollera med show interfaces status.'],
          check: function (st) {
            var c = cfg(st, 'SW1');
            return access(c, 5, 10) && access(c, 6, 10) && access(c, 11, 10) && access(c, 12, 10) && access(c, 7, 20) && access(c, 8, 20) && access(c, 9, 30) && access(c, 10, 99) && access(c, 20, 99);
          },
        },
        {
          id: 'b1d', npc: 'Anna', target: 'SW1', title: 'Trunkar mot routern och SW-Nordvik-2',
          ticket: 'Anna: "Nu står det rätt VLAN, men jag får fortfarande ingen adress och kommer inte åt filservern."',
          hints: ['DHCP-servern är routern, och filservern sitter på SW-Nordvik-2. Båda nås bara via trunkar. Jämför med show interfaces trunk på SW-Nordvik-2.', 'interface gi0/1 → switchport trunk encapsulation dot1q → switchport mode trunk → switchport trunk native vlan 999 → switchport trunk allowed vlan 10,20,30,99 → switchport nonegotiate.', 'Samma för interface range gi0/24 - 25. STP blockerar den ena länken – det är rätt. Förnya sedan med ipconfig /renew.'],
          check: function (st) {
            return lease(st, 'PC-Anna', '192.168.1.0', '255.255.255.192') && lease(st, 'PC-Bo', '192.168.1.64', '255.255.255.192') && ok(st, 'PC-Anna', '192.168.1.10') && ok(st, 'Tekniker', '192.168.1.193');
          },
        },
        {
          id: 'b1e', npc: 'Omar', target: 'SW1', title: 'Driftadress och SSH',
          ticket: 'Omar: "Mitt övervakningsskript når inte switchen. Den behöver en adress i drift-VLAN:et och SSH – inget telnet."',
          hints: ['interface vlan 99 → ip address 192.168.1.194 255.255.255.192 → no shutdown. Sedan ip default-gateway 192.168.1.193.', 'ip domain-name nordvik.example → crypto key generate rsa modulus 2048 → ip ssh version 2 → username drift privilege 15 secret nordvik. SSH kräver ett konto, och lösenordet (här nordvik) är det du skriver när du loggar in.', 'line vty 0 15 → transport input ssh → login local. Testa från laptopen: ssh drift@192.168.1.194 och lösenordet nordvik.'],
          check: function (st) { return sshOk(st, 'SW1') && ok(st, 'Tekniker', '192.168.1.194') && ok(st, 'SW1', '192.168.1.10'); },
        },
      ],
    },
    // ------------------------------------------------------------------ Bygge 2: routern
    {
      build: 2, week: 102, base: 9, site: 'gbg', chapter: '3, 5 och 6',
      title: 'Routern från grunden',
      chips: ['show ip interface brief', 'show ip dhcp binding', 'show ip nat statistics'],
      intro: 'Bygge 2: R-Nordvik-1 har fått ett nytt moderkort och startar med Router>. Alla interface är avstängda.\n\n• Gi0/0 trunk mot SW-Nordvik-1 med sub-interface: .10 192.168.1.1/26, .20 .65/26, .30 .129/26, .99 .193/26\n• DHCP för KONTOR, EKONOMI och GAST (servrarna ligger under .20)\n• DNS på routern: filserver = 192.168.1.10, uppslag vidare till 9.9.9.9\n• Gi0/1 203.0.113.10/24 mot operatören 203.0.113.1, PAT och statisk NAT 192.168.1.10 → 203.0.113.11\n• Gi0/2 10.0.0.1/30 mot Borås, 192.168.2.0/24 via 10.0.0.2\n• Namn, enable secret och bara SSH',
      learn: ['Router-on-a-stick', 'ip dhcp pool och excluded-address', 'ip dns server och ip host', 'ip nat inside/outside och overload', 'Statiska rutter', 'SSH på routern'],
      setup: function (st) { wipe(st, 'R1'); },
      tasks: [
        {
          id: 'b2a', npc: 'Omar', target: 'R1', title: 'Router-on-a-stick',
          ticket: 'Omar: "Inga VLAN pratar med varandra och ingen når sin gateway. Routern har inga adresser alls."',
          hints: ['interface gi0/0 → no shutdown. Sub-interface: interface gi0/0.10 → encapsulation dot1Q 10 → ip address 192.168.1.1 255.255.255.192.', 'Samma för .20 (192.168.1.65), .30 (192.168.1.129) och .99 (192.168.1.193), alla med mask 255.255.255.192.', 'Testa: filservern (192.168.1.10) ska nå ekonomisystemet (192.168.1.70). show ip interface brief.'],
          check: function (st) { return ok(st, 'Tekniker', '192.168.1.193') && ok(st, 'Filserver', '192.168.1.1') && ok(st, 'Ekonomisystem', '192.168.1.65') && ok(st, 'Filserver', '192.168.1.70'); },
        },
        {
          id: 'b2b', npc: 'Anna', target: 'R1', title: 'DHCP för kontoret, ekonomi och gäster',
          ticket: 'Anna: "Nu får vi 169.254-adresser igen. Gästerna i receptionen också."',
          hints: ['ip dhcp excluded-address 192.168.1.1 192.168.1.19 (och .65–.79, .129–.139) så att servrarnas adresser inte delas ut.', 'ip dhcp pool KONTOR → network 192.168.1.0 255.255.255.192 → default-router 192.168.1.1 → dns-server 192.168.1.1.', 'Samma för EKONOMI (192.168.1.64, gateway .65) och GAST (192.168.1.128, gateway .129, dns 9.9.9.9). show ip dhcp binding.'],
          check: function (st) {
            if (!lease(st, 'PC-Anna', '192.168.1.0', '255.255.255.192') || !lease(st, 'PC-Bo', '192.168.1.64', '255.255.255.192') || !lease(st, 'Gast-laptop', '192.168.1.128', '255.255.255.192')) return false;
            var a = S.hostIpConf(st.devices['PC-Anna']);
            return a.gw === '192.168.1.1' && !!a.dns && a.dns.length > 0 && ok(st, 'PC-Anna', '192.168.1.1');
          },
        },
        {
          id: 'b2c', npc: 'Lisa', target: 'R1', title: 'DNS på routern',
          ticket: 'Lisa: "\\\\\\\\filserver fungerar inte längre, men om Omar skriver adressen går det. Vad har hänt?"',
          hints: ['Kontorets datorer frågar routern (192.168.1.1) om namn. Routern måste vara DNS-server.', 'ip dns server → ip host filserver 192.168.1.10 → ip name-server 9.9.9.9.', 'Testa på en dator: nslookup filserver.'],
          check: function (st) { var r = S.resolve(st, 'PC-Anna', 'filserver'); return !r.error && r.ip === '192.168.1.10'; },
        },
        {
          id: 'b2d', npc: 'Karim', target: 'R1', title: 'Ut på internet med NAT',
          ticket: 'Karim: "Kunderna når inte vår webb och vi når inte internet. Offert-portalen är död."',
          hints: ['interface gi0/1 → ip address 203.0.113.10 255.255.255.0 → ip nat outside → no shutdown. Sub-interfacen får ip nat inside.', 'ip route 0.0.0.0 0.0.0.0 203.0.113.1 → access-list 1 permit 192.168.1.0 0.0.0.255 → ip nat inside source list 1 interface gi0/1 overload.', 'Filservern utifrån: ip nat inside source static 192.168.1.10 203.0.113.11. Kontrollera med show ip nat translations.'],
          check: function (st) {
            var n = cfg(st, 'R1').nat;
            return ok(st, 'PC-Anna', '198.51.100.80') && ok(st, 'Gast-laptop', '198.51.100.80') && n.statics.some(function (s) { return s.local === '192.168.1.10' && s.global === '203.0.113.11'; });
          },
        },
        {
          id: 'b2e', npc: 'Nils', target: 'R1', title: 'Länken till Borås',
          ticket: 'Nils: "Lagret når varken filservern eller internet sedan i morse. Här i Borås är inget ändrat!"',
          hints: ['interface gi0/2 → ip address 10.0.0.1 255.255.255.252 → no shutdown (ip nat inside, för Borås ska också ut på internet).', 'ip route 192.168.2.0 255.255.255.0 10.0.0.2 – returvägen till lagret.', 'Lägg till access-list 1 permit 192.168.2.0 0.0.0.255 så att lagret NAT:as. Testa ping 192.168.2.1.'],
          check: function (st) { return ok(st, 'PC-Lager', '192.168.1.10') && ok(st, 'PC-Lager', '198.51.100.80'); },
        },
        {
          id: 'b2f', npc: 'Eva', target: 'R1', title: 'Namn, SSH-konto och bara SSH',
          ticket: 'Eva från revisionen: "Routern heter Router och tar emot telnet utan inloggning. Den ska bara gå att nå med SSH och ett konto."',
          hints: ['hostname R-Nordvik-1 → ip domain-name nordvik.example.', 'crypto key generate rsa modulus 2048 → ip ssh version 2 → username drift privilege 15 secret nordvik (lösenordet du loggar in med).', 'line vty 0 15 → transport input ssh → login local. Glöm inte write memory.'],
          check: function (st) { var c = cfg(st, 'R1'); return c.hostname === 'R-Nordvik-1' && sshOk(st, 'R1') && ok(st, 'Tekniker', '192.168.1.193'); },
        },
      ],
    },
    // ------------------------------------------------------------------ Bygge 3: Borås
    {
      build: 3, week: 103, base: 9, site: 'boras', chapter: '4, 5 och 8',
      title: 'Lagret i Borås',
      chips: ['show vlan brief', 'show interfaces trunk', 'show ip route'],
      intro: 'Bygge 3: lagret får ny utrustning. SW-Boras-1 och R-Boras-1 är fabriksinställda.\n\n• VLAN 40 LAGER, 50 TRADLOST-GAST, 99 DRIFT\n• SW-Boras-1: Gi0/5 lagerdatorn (VLAN 40), Gi0/1–3 accesspunkter (trunk, native 99), Gi0/24 trunk mot routern\n• R-Boras-1: .40 192.168.2.1/26, .50 .65/26, .99 .193/26, Gi0/2 10.0.0.2/30, default route via 10.0.0.1\n• DHCP för LAGER och TRADLOST-GAST\n• Gästerna får inte nå 192.168.0.0/16',
      learn: ['VLAN och trunkar i Borås', 'Trunk till accesspunkter (native VLAN)', 'Sub-interface och default route', 'DHCP-pooler', 'ACL för gästnätet'],
      setup: function (st) { wipe(st, 'RB'); wipe(st, 'SWB'); },
      tasks: [
        {
          id: 'b3a', npc: 'Nils', target: 'SWB', title: 'Switchen i lagret',
          ticket: 'Nils: "Den nya switchen blinkar men inget fungerar. Den heter Switch."',
          hints: ['hostname SW-Boras-1 → vlan 40 → name LAGER, vlan 50 → name TRADLOST-GAST, vlan 99 → name DRIFT.', 'interface gi0/5 → switchport mode access → switchport access vlan 40 → spanning-tree portfast.', 'show vlan brief ska visa Gi0/5 i VLAN 40.'],
          check: function (st) { var c = cfg(st, 'SWB'); return c.hostname === 'SW-Boras-1' && vlanNamed(c, 40, /^lager$/i) && !!c.vlans[50] && vlanNamed(c, 99, /^drift$/i) && access(c, 5, 40); },
        },
        {
          id: 'b3b', npc: 'Nils', target: 'SWB', title: 'Trunkar mot router och accesspunkter',
          ticket: 'Nils: "Accesspunkterna lyser men hittar ingen controller, och lagerdatorn når inte ens routern."',
          hints: ['Accesspunkterna har sin adress i VLAN 99 utan tagg – därför native VLAN 99 på deras portar.', 'interface range gi0/1 - 3 → switchport trunk encapsulation dot1q → switchport mode trunk → switchport trunk native vlan 99 → switchport trunk allowed vlan 40,50,99.', 'interface gi0/24 → trunk mot routern (native 999, allowed 40,50,99). show interfaces trunk.'],
          check: function (st) {
            var c = cfg(st, 'SWB');
            return S.opMode(st, 'SWB', 'GigabitEthernet0/24') === 'trunk' && [1, 2, 3].every(function (n) { var i = c.ifaces['GigabitEthernet0/' + n]; return S.opMode(st, 'SWB', 'GigabitEthernet0/' + n) === 'trunk' && i.native === 99; });
          },
        },
        {
          id: 'b3c', npc: 'Nils', target: 'RB', title: 'Routern i Borås',
          ticket: 'Nils: "Omar säger att routern här ute inte har några adresser. Kan du fixa den?"',
          hints: ['interface gi0/0 → no shutdown. interface gi0/0.40 → encapsulation dot1Q 40 → ip address 192.168.2.1 255.255.255.192. Samma för .50 (192.168.2.65) och .99 (192.168.2.193).', 'interface gi0/2 → ip address 10.0.0.2 255.255.255.252 → no shutdown.', 'ip route 0.0.0.0 0.0.0.0 10.0.0.1. Testa: ping 192.168.1.10.'],
          check: function (st) { return ok(st, 'AP-Lager-1', '192.168.2.193') && ok(st, 'AP-Lager-1', '192.168.1.196') && ok(st, 'RB', '192.168.1.10'); },
        },
        {
          id: 'b3d', npc: 'Nils', target: 'RB', title: 'DHCP på lagret',
          ticket: 'Nils: "Lagerdatorn och streckkodsläsarna får fortfarande ingen adress."',
          hints: ['ip dhcp excluded-address 192.168.2.1 192.168.2.19 och 192.168.2.65 192.168.2.69.', 'ip dhcp pool LAGER → network 192.168.2.0 255.255.255.192 → default-router 192.168.2.1 → dns-server 9.9.9.9.', 'ip dhcp pool TRADLOST-GAST → network 192.168.2.64 255.255.255.192 → default-router 192.168.2.65 → dns-server 9.9.9.9.'],
          check: function (st) { return lease(st, 'PC-Lager', '192.168.2.0', '255.255.255.192') && ok(st, 'PC-Lager', '192.168.1.10') && ok(st, 'PC-Lager', '198.51.100.80'); },
        },
        {
          id: 'b3e', npc: 'Nils', target: 'WLC', title: 'Wi-Fi i lagret',
          ticket: 'Nils: "Streckkodsläsaren och besökarnas mobiler hittar nätet men får ingen adress."',
          hints: ['Alla tre accesspunkterna ska synas i show ap summary på controllern WLC-Nordvik.', 'Trådlösa klienter hamnar i VLAN 40 och 50 – de måste finnas på trunkarna till accesspunkterna och ha en DHCP-pool.', 'Kontrollera show power inline på switchen (PoE) och show interfaces trunk.'],
          check: function (st) {
            var D = S.get(st);
            return D.apJoined['AP-Lager-1'] && D.apJoined['AP-Lager-2'] && D.apJoined['AP-Lager-3'] && lease(st, 'Lager-skanner', '192.168.2.0', '255.255.255.192') && lease(st, 'Gast-mobil', '192.168.2.64', '255.255.255.192');
          },
        },
        {
          id: 'b3f', npc: 'Nils', target: 'RB', title: 'Gästerna ska bara ut på internet',
          ticket: 'Nils: "En besökare kunde pinga vår lagerdator från gästnätet. Så får det inte vara."',
          hints: ['En extended ACL på gästernas sub-interface, inkommande.', 'ip access-list extended GAST-B → deny ip 192.168.2.64 0.0.0.63 192.168.0.0 0.0.255.255 → permit ip any any.', 'interface gi0/0.50 → ip access-group GAST-B in. show access-lists visar träffarna.'],
          check: function (st) { return !!ifc(st, 'RB', 'GigabitEthernet0/0.50').aclIn && lease(st, 'Gast-mobil', '192.168.2.64', '255.255.255.192') &&!ok(st, 'Gast-mobil', '192.168.1.10') && ok(st, 'Gast-mobil', '198.51.100.80'); },
        },
      ],
    },
    // ------------------------------------------------------------------ Bygge 4: säkerhet och drift
    {
      build: 4, week: 104, base: 9, site: 'gbg', chapter: '6, 7 och 9',
      title: 'Säkerhet och drift',
      chips: ['show access-lists', 'show ntp status', 'show logging'],
      intro: 'Bygge 4: nätet fungerar, men allt skydd och all drift saknas. Inga ACL:er, ingen port security, ingen klocka och inga loggar till loggservern.\n\n• GAST: gästerna (192.168.1.128/26) får inte nå interna nät, bara internet\n• KONTOR-UT: kontoret (192.168.1.0/26) får inte nå ekonomi (192.168.1.64/26)\n• Port security på receptionsporten Gi0/9: max 1 MAC, sticky, shutdown\n• NTP-server 192.168.1.16 och loggserver 192.168.1.17 på R-Nordvik-1 och båda switcharna',
      learn: ['Extended ACL och implicit deny', 'ip access-group in', 'Port security', 'ntp server', 'logging host och tidsstämplar'],
      setup: function (st) {
        both(st.devices.R1, function (c) {
          delete c.acls.GAST; delete c.acls['KONTOR-UT'];
          c.ifaces['GigabitEthernet0/0.30'].aclIn = null; c.ifaces['GigabitEthernet0/0.10'].aclIn = null;
        });
        both(st.devices.SW1, function (c) { c.ifaces['GigabitEthernet0/9'].portSec = null; });
        ['R1', 'SW1', 'SW2'].forEach(function (id) { both(st.devices[id], function (c) { c.ntpServers = []; c.logging.hosts = []; c.timestampsMsec = false; }); });
      },
      tasks: [
        {
          id: 'b4a', npc: 'Linnea', target: 'R1', title: 'Gästnätet ska bara nå internet',
          ticket: 'Linnea: "En besökare sa att hen kunde se vår filserver från gästnätet!"',
          hints: ['Skriv listan uppifrån och ner: först det som ska stoppas, sist det som får passera.', 'ip access-list extended GAST → deny ip 192.168.1.128 0.0.0.63 192.168.1.0 0.0.0.255 → deny ip 192.168.1.128 0.0.0.63 192.168.2.0 0.0.0.255 → permit ip any any.', 'interface gi0/0.30 → ip access-group GAST in. Testa från gästlaptopen.'],
          check: function (st) {
            var i = ifc(st, 'R1', 'GigabitEthernet0/0.30');
            return !!i.aclIn && !ok(st, 'Gast-laptop', '192.168.1.10') && ok(st, 'Gast-laptop', '198.51.100.80');
          },
        },
        {
          id: 'b4b', npc: 'Maja', target: 'R1', title: 'Kontoret ska inte nå ekonomi',
          ticket: 'Maja: "Ekonomisystemet ska bara vara öppet för oss på ekonomi. I dag kom Anna åt det."',
          hints: ['Stoppa trafiken så nära källan som möjligt: inkommande på kontorets sub-interface.', 'ip access-list extended KONTOR-UT → deny ip 192.168.1.0 0.0.0.63 192.168.1.64 0.0.0.63 → permit ip any any.', 'interface gi0/0.10 → ip access-group KONTOR-UT in.'],
          check: function (st) { return !ok(st, 'PC-Anna', '192.168.1.70') && ok(st, 'PC-Anna', '198.51.100.80') && ok(st, 'PC-Anna', '192.168.1.10') && ok(st, 'PC-Bo', '192.168.1.70'); },
        },
        {
          id: 'b4c', npc: 'Linnea', target: 'SW1', title: 'Port security i receptionen',
          ticket: 'Linnea: "Besökare drar ur gästlaptopen och kopplar in sina egna saker. Kan porten bara ta emot vår dator?"',
          hints: ['interface gi0/9 på SW-Nordvik-1. Porten måste vara en accessport.', 'switchport port-security → switchport port-security maximum 1 → switchport port-security mac-address sticky → switchport port-security violation shutdown.', 'show port-security interface gi0/9 ska visa Secure-up och en MAC-adress.'],
          check: function (st) { var p = ifc(st, 'SW1', 'GigabitEthernet0/9').portSec; return !!p && !p.disabled && p.max === 1 && p.violation === 'shutdown' && !st.devices.SW1.rt.errdisabled['GigabitEthernet0/9'] && ok(st, 'Gast-laptop', '198.51.100.80'); },
        },
        {
          id: 'b4d', npc: 'Omar', target: 'SW2', title: 'Rätt tid överallt',
          ticket: 'Omar: "Loggarna har stjärnor och datum från 1993. Jag kan inte lägga ihop dem."',
          hints: ['NTP-servern är 192.168.1.16.', 'ntp server 192.168.1.16 på R-Nordvik-1, SW-Nordvik-1 och SW-Nordvik-2.', 'show ntp status ska säga Clock is synchronized. show clock utan stjärna.'],
          check: function (st) { return ['R1', 'SW1', 'SW2'].every(function (id) { return S.ntpSynced(st, st.devices[id]); }); },
        },
        {
          id: 'b4e', npc: 'Omar', target: 'R1', title: 'Loggar till loggservern',
          ticket: 'Omar: "Loggservern 192.168.1.17 är tom. Och jag vill ha millisekunder i tidsstämplarna."',
          hints: ['logging host 192.168.1.17 på alla tre enheterna.', 'service timestamps log datetime msec på alla tre.', 'show logging visar Logging to 192.168.1.17.'],
          check: function (st) { return ['R1', 'SW1', 'SW2'].every(function (id) { var c = cfg(st, id); return c.logging.hosts.indexOf('192.168.1.17') >= 0 && c.timestampsMsec; }); },
        },
      ],
    },
    // ------------------------------------------------------------------ Bygge 5: VPN
    {
      build: 5, week: 105, base: 10, site: 'gbg', chapter: '10',
      title: 'VPN från grunden',
      chips: ['show crypto isakmp sa', 'show crypto ipsec sa | include ident|encaps|decaps', 'show access-lists'],
      intro: 'Bygge 5: den hyrda linan är uppsagd och båda routrarna har internet, men ingen tunnel finns. Lagret når inte filservern och accesspunkterna tappar controllern.\n\n• Fas 1: isakmp policy 10 – aes 256, sha256, pre-share, group 14 – och samma nyckel på båda sidor\n• Fas 2: transform-set NORDVIK-TS esp-aes 256 esp-sha256-hmac\n• VPN-TRAFIK: 192.168.1.0/26 ↔ 192.168.2.0/26 och 192.168.1.192/26 ↔ 192.168.2.192/26, spegelvänt i Borås\n• Crypto map VPN-MAP 10 på Gi0/1, peer 203.0.113.20 / 203.0.113.10\n• NAT-undantag först i NAT-UT, och ip tcp adjust-mss 1360',
      learn: ['ISAKMP-policy och nyckel', 'Transform-set', 'Spegelvända crypto-ACL:er', 'Crypto map på interface', 'NAT-undantag', 'ip tcp adjust-mss'],
      setup: function (st) {
        ['R1', 'RB'].forEach(function (id) {
          both(st.devices[id], function (c) {
            delete c.crypto;
            delete c.acls['VPN-TRAFIK'];
            c.acls['NAT-UT'].rules = c.acls['NAT-UT'].rules.filter(function (r) { return r.action === 'permit'; });
            Object.keys(c.ifaces).forEach(function (n) { c.ifaces[n].cryptoMap = null; c.ifaces[n].adjustMss = null; });
          });
        });
      },
      tasks: [
        {
          id: 'b5a', npc: 'Omar', target: 'R1', title: 'Fas 1: policy och nyckel',
          ticket: 'Omar: "Vi börjar med fas 1. Båda routrarna måste vara överens om kryptering, hash, autentisering, DH-grupp – och ha samma nyckel."',
          hints: ['crypto isakmp policy 10 → encryption aes 256 → hash sha256 → authentication pre-share → group 14.', 'crypto isakmp key Nordvik-VPN-2026 address 203.0.113.20 (i Borås: address 203.0.113.10).', 'Samma policy i R-Boras-1 – nå den med konsolen i lagret. show crypto isakmp policy.'],
          check: function (st) {
            var a = cfg(st, 'R1').crypto, b = cfg(st, 'RB').crypto;
            if (!a || !b) return false;
            var pa = Object.keys(a.isakmp.policies).map(function (k) { return a.isakmp.policies[k]; }), pb = Object.keys(b.isakmp.policies).map(function (k) { return b.isakmp.policies[k]; });
            var pol = pa.some(function (x) { return x.auth === 'pre-share' && pb.some(function (y) { return samePol(x, y); }); });
            return pol && !!a.isakmp.keys['203.0.113.20'] && a.isakmp.keys['203.0.113.20'] === b.isakmp.keys['203.0.113.10'];
          },
        },
        {
          id: 'b5b', npc: 'Omar', target: 'R1', title: 'Fas 2: transform-set och spegelvända listor',
          ticket: 'Omar: "Nu vad som ska krypteras och hur. Listorna i Göteborg och Borås måste vara exakta spegelbilder."',
          hints: ['crypto ipsec transform-set NORDVIK-TS esp-aes 256 esp-sha256-hmac → mode tunnel. Samma i Borås.', 'Göteborg: ip access-list extended VPN-TRAFIK → permit ip 192.168.1.0 0.0.0.63 192.168.2.0 0.0.0.63 → permit ip 192.168.1.192 0.0.0.63 192.168.2.192 0.0.0.63.', 'Borås: samma rader med källa och mål omvända (192.168.2.0 0.0.0.63 192.168.1.0 0.0.0.63 …).'],
          check: function (st) {
            var a = cfg(st, 'R1'), b = cfg(st, 'RB');
            if (!a.crypto || !b.crypto) return false;
            var ts = Object.keys(a.crypto.transformSets).some(function (n) { var x = a.crypto.transformSets[n]; return Object.keys(b.crypto.transformSets).some(function (m) { return b.crypto.transformSets[m].transforms.join(' ') === x.transforms.join(' '); }); });
            var ma = a.acls['VPN-TRAFIK'], mb = b.acls['VPN-TRAFIK'];
            if (!ts || !ma || !mb) return false;
            var need = { action: 'permit', proto: 'ip', src: { ip: '192.168.1.0', wild: '0.0.0.63' }, dst: { ip: '192.168.2.0', wild: '0.0.0.63' } };
            return ma.rules.some(function (r) { return S.mirrors(need, { action: r.action, proto: r.proto, src: r.dst, dst: r.src }); }) && mb.rules.some(function (r) { return S.mirrors(need, r); });
          },
        },
        {
          id: 'b5c', npc: 'Nils', target: 'RB', title: 'Crypto map och NAT-undantag',
          ticket: 'Nils: "Lagret når fortfarande inte filservern. Är tunneln på nu?"',
          hints: ['crypto map VPN-MAP 10 ipsec-isakmp → set peer 203.0.113.20 → set transform-set NORDVIK-TS → match address VPN-TRAFIK. Sedan interface gi0/1 → crypto map VPN-MAP. Samma i Borås med peer 203.0.113.10.', 'NAT görs före kryptering. ip access-list extended NAT-UT → 5 deny ip 192.168.1.0 0.0.0.63 192.168.2.0 0.0.0.63 (i Borås omvänt).', 'Testa: ping 192.168.1.10 från lagerdatorn och show crypto ipsec sa | include encaps|decaps.'],
          check: function (st) { return ok(st, 'PC-Lager', '192.168.1.10') && ok(st, 'PC-Anna', '192.168.2.1'); },
        },
        {
          id: 'b5d', npc: 'Nils', target: 'WLC', title: 'Drift genom tunneln',
          ticket: 'Nils: "Accesspunkterna har tappat controllern och Omar kan inte logga in på routern här ute."',
          hints: ['Accesspunkterna (192.168.2.201–203) pratar med controllern 192.168.1.196 – båda ligger i drift-näten.', 'Drift ↔ drift måste finnas i VPN-TRAFIK på båda sidor och undantas från NAT (deny 192.168.1.192 0.0.0.63 192.168.2.192 0.0.0.63).', 'Testa ssh drift@192.168.2.193 från laptopen och show ap summary på controllern.'],
          check: function (st) { var D = S.get(st); return !!D.apJoined['AP-Lager-1'] && ok(st, 'Tekniker', '192.168.2.193'); },
        },
        {
          id: 'b5e', npc: 'Nils', target: 'RB', title: 'Stora filer genom tunneln',
          ticket: 'Nils: "Ping fungerar, men ritningarna fastnar på 0 %."',
          hints: ['Tunneln lägger till ungefär 80 byte. Prova ping -f -l 1400 192.168.1.10 på lagerdatorn.', 'interface gi0/1 → ip tcp adjust-mss 1360 (räcker på ena sidan, snyggast på båda).', 'Kopiera igen: copy \\\\filserver\\ritningar\\hyllplan.pdf .'],
          check: function (st) { return S.bigTransfer(st, 'PC-Lager', '192.168.1.10', 445).ok; },
        },
      ],
    },
  ];
  BUILDS.forEach(function (b) {
    b.tasks.forEach(function (t) { t.build = true; t.krabba = false; });
    b.after = function (st) { renewAll(st); };
  });

  var origStart = L.start;
  L.start = function (n) {
    var def = BUILDS.filter(function (b) { return b.week === n; })[0];
    if (!def) return origStart(n);
    var st = L.baseState(def.base);
    S.refresh(st);
    def.setup(st);
    S.touch(st);
    S.refresh(st);
    def.after(st);
    S.refresh(st);
    return { state: st, def: def };
  };
  L.BUILDS = BUILDS;
  L.def = function (n) { return L.WEEKS.filter(function (w) { return w.week === n; })[0] || BUILDS.filter(function (b) { return b.week === n; })[0] || null; };
  L.name = function (d) {
    if (typeof d === 'number') d = L.def(d) || { week: d };
    if (!d) return 'Fri träning';
    return d.build ? 'Bygge ' + d.build : 'Vecka ' + d.week;
  };
  L.isBuild = function (n) { return n > 100; };
})();
