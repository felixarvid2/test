// Veckorna. Varje vecka har två Krabba-fel och ett ärende från en kollega.
// Felen bygger på avsnitten "Så ser det ut när det är trasigt" i kurslitteraturen.
NV.levels = (function () {
  var U = NV.util, S = NV.sim;

  function both(d, fn) { fn(d.config); if (d.startup) fn(d.startup); }
  function iface(c, n) { return c.ifaces[n]; }
  function ok(state, from, to) { var r = S.ping(state, from, to); return r.ok && r.loss < 0.9; }
  function leaseIn(state, host, net, mask) {
    var c = S.hostIpConf(state.devices[host]);
    return !!(c && c.ip && !c.apipa && U.inNet(c.ip, net, mask));
  }
  function hostSetup(state, list) { list.forEach(function (h) { S.dhcp(state, h); }); }

  var DHCP_HOSTS = ['PC-Anna', 'PC-Karim', 'PC-Bo', 'PC-Maja', 'PC-Sara', 'PC-Lisa', 'Gast-laptop', 'PC-Lager', 'Gast-mobil', 'Lager-skanner'];

  function baseState(week) {
    var st = NV.model.buildGolden({ week: week });
    st.devices['Gast-mobil'].ssid = 'Nordvik-Gast';
    st.devices['Lager-skanner'].ssid = 'Nordvik-Lager';
    S.refresh(st);
    hostSetup(st, DHCP_HOSTS);
    S.refresh(st);
    return st;
  }

  var WEEKS = [
    // ------------------------------------------------------------------ Vecka 1
    {
      week: 1, title: 'Sladden, prompten och lådorna', chapter: 1, site: 'gbg',
      intro: 'Välkommen till Nordvik! Du är ny nätverkstekniker på huvudkontoret i Göteborg.\n\nI natt har Krabban varit i racket. Två saker är sönder, och en kollega har redan hört av sig om en tredje sak.\n\nGå runt, prata med folk (E), koppla in konsolkabeln i enheterna och ta reda på vad som hänt. När ett fel är löst skriver du en felrapport.',
      learn: ['Konsolkabeln och 9600 8N1', 'Lägena >, #, (config)# och (config-if)#', 'running-config och startup-config', 'shutdown / no shutdown', 'write memory'],
      setup: function (st) {
        both(st.devices.SW1, function (c) { c.lines.con.speed = 19200; });
        both(st.devices.SW1, function (c) { iface(c, 'GigabitEthernet0/5').shutdown = true; });
        var sw2 = st.devices.SW2;
        sw2.startup.hostname = 'Switch';
        sw2.config = U.clone(sw2.startup);
        sw2.rt.bootTime = -540;
        sw2.rt.logs = [];
        sw2.rt.reloads = 1;
      },
      after: function (st) { S.dhcp(st, 'PC-Anna'); },
      tasks: [
        {
          id: 'v1k1', krabba: true, npc: 'Omar', target: 'SW1',
          title: 'Konsolen visar bara skräptecken',
          ticket: 'Omar från drift: "Jag försökte logga in på SW-Nordvik-1 i morse, men skärmen fylldes med konstiga tecken. Kan du kolla?"',
          hints: [
            'Obegripliga tecken i konsolen betyder nästan alltid att hastigheten inte stämmer. Standard är 9600 8N1.',
            'Prova en annan hastighet: sudo screen /dev/ttyUSB0 19200 (vanliga värden är 9600, 19200, 38400 och 115200).',
            'När du kommer in: configure terminal → line con 0 → speed 9600. Anslut sedan igen med 9600 och kör write memory.',
          ],
          check: function (st) {
            var d = st.devices.SW1;
            return d.config.lines.con.speed === 9600 && d.startup.lines.con.speed === 9600;
          },
          report: {
            cause: ['Konsolporten var inställd på 19200 baud i stället för 9600', 'Konsolkabeln var trasig', 'Switchen hade ingen ström', 'Fel seriell port var vald i terminalprogrammet'],
            fix: ['Ansluta med 19200, sätta speed 9600 under line con 0 och spara', 'Byta konsolkabel', 'Starta om switchen', 'Köra no shutdown på Gi0/1'],
          },
        },
        {
          id: 'v1k2', krabba: true, npc: 'Anna', target: 'SW1',
          title: 'Anna har inget nätverk',
          ticket: 'Anna: "Min dator säger att nätverkskabeln inte är ansluten, men den sitter ju i!"',
          hints: [
            'Börja på switchen: show interfaces status. Leta upp Annas port (beskrivningen "Anna").',
            'Status disabled betyder att porten är avstängd i konfigurationen – inte ett kabelfel.',
            'interface gi0/5 → no shutdown. Kontrollera att porten blir connected och spara med write memory.',
          ],
          check: function (st) {
            var i = st.devices.SW1.config.ifaces['GigabitEthernet0/5'];
            return !i.shutdown && ok(st, 'PC-Anna', '192.168.1.10');
          },
          report: {
            cause: ['Porten Gi0/5 var avstängd med shutdown', 'Annas nätverkskabel var trasig', 'Annas dator hade fel IP-adress', 'Switchen saknade VLAN 10'],
            fix: ['no shutdown på Gi0/5 och spara', 'Byta kabel', 'Starta om Annas dator', 'Skapa VLAN 10'],
          },
        },
        {
          id: 'v1n1', krabba: false, npc: 'Omar', target: 'SW2',
          title: 'SW-Nordvik-2 heter "Switch"',
          ticket: 'Omar: "Strömmen gick i serverrummet i natt. Nu heter SW-Nordvik-2 bara Switch i övervakningen. Någon döpte den i går…"',
          hints: [
            'Namnet försvinner vid omstart om det aldrig sparades. Jämför show running-config med show startup-config.',
            'Sätt namnet igen: configure terminal → hostname SW-Nordvik-2.',
            'Spara med write memory (eller copy running-config startup-config) och kontrollera startup-config.',
          ],
          check: function (st) {
            var d = st.devices.SW2;
            return d.config.hostname === 'SW-Nordvik-2' && d.startup.hostname === 'SW-Nordvik-2';
          },
          report: {
            cause: ['Namnbytet låg bara i running-config och sparades aldrig', 'Någon hade bytt ut switchen', 'Switchen hade fått fel IP-adress', 'Konsolkabeln satt i fel switch'],
            fix: ['Sätta hostname SW-Nordvik-2 och köra write memory', 'Starta om switchen igen', 'Byta konsolkabel', 'Sätta tillbaka strömmen'],
          },
        },
      ],
    },
    // ------------------------------------------------------------------ Vecka 2
    {
      week: 2, title: 'Ramar och MAC-adresser', chapter: 2, site: 'gbg',
      intro: 'Vecka 2. Krabban har varit framme igen.\n\nDen här veckan handlar om lager 1 och 2: kablar, duplex, MAC-tabellen och VLAN-kolumnen. Kom ihåg: slå upp symptomet, inte kapitlet.',
      learn: ['show interfaces status och notconnect', 'Duplex mismatch: late collisions mot CRC', 'show mac address-table', 'VLAN-kolumnen'],
      setup: function (st) {
        st.links.forEach(function (l) { if (l.a.dev === 'SW1' && l.a.port === 'GigabitEthernet0/6') l.state = 'broken'; });
        both(st.devices.SW2, function (c) { var i = iface(c, 'GigabitEthernet0/24'); i.speed = '100'; i.duplex = 'full'; });
        both(st.devices.SW1, function (c) { iface(c, 'GigabitEthernet0/7').accessVlan = 1; });
      },
      after: function (st) { S.dhcp(st, 'PC-Karim'); S.dhcp(st, 'PC-Bo'); },
      tasks: [
        {
          id: 'v2k1', krabba: true, npc: 'Karim', target: 'PC-Karim',
          title: 'Karims port är notconnect',
          ticket: 'Karim: "Jag har inget nät alls. Det står att kabeln är urkopplad."',
          hints: [
            'show interfaces status på SW-Nordvik-1. notconnect är ett lager 1-fel: kabel, port eller enheten i andra änden.',
            'Gå till Karims skrivbord och titta på kabeln. Lyser lampan vid nätverksuttaget?',
            'Byt patchkabel vid Karims dator (E på kabeln). Kontrollera att Gi0/6 blir connected.',
          ],
          check: function (st) {
            var l = st.links.filter(function (x) { return x.b.dev === 'PC-Karim'; })[0];
            return l.state === 'ok' && ok(st, 'PC-Karim', '192.168.1.10');
          },
          report: {
            cause: ['Patchkabeln till Karims dator var trasig', 'Porten var avstängd med shutdown', 'Karims dator hade fel VLAN', 'DHCP-poolen var full'],
            fix: ['Byta patchkabel och kontrollera att porten blir connected', 'no shutdown på Gi0/6', 'Sätta porten i VLAN 20', 'Göra poolen större'],
          },
        },
        {
          id: 'v2k2', krabba: true, npc: 'Lisa', target: 'SW2',
          title: 'Allt mellan switcharna går segt',
          ticket: 'Lisa: "Det tar evigheter att skriva ut, och Anna säger att filservern känns seg. Men det fungerar… typ."',
          hints: [
            'Seg men fungerande trafik och stigande felräknare pekar ofta på duplex. Titta i show logging på båda switcharna.',
            'Jämför show interfaces gi0/24 på SW-Nordvik-1 och SW-Nordvik-2. Den ena sidan räknar late collisions, den andra CRC.',
            'Sätt samma inställning i båda ändarna – enklast speed auto och duplex auto på SW-Nordvik-2 Gi0/24.',
          ],
          check: function (st) {
            var D = S.get(st);
            var p = D.ports['SW2|GigabitEthernet0/24'];
            return !!(p && p.up && !p.mismatch);
          },
          report: {
            cause: ['Duplex mismatch: ena änden fast inställd, andra på auto', 'Trasig kabel mellan switcharna', 'För många VLAN på trunken', 'Spanning tree blockerade porten'],
            fix: ['Samma inställning i båda ändarna (auto/auto)', 'Byta kabel', 'Ta bort VLAN från trunken', 'Stänga av spanning tree'],
          },
        },
        {
          id: 'v2n1', krabba: false, npc: 'Bo', target: 'PC-Bo',
          title: 'Bo når ingenting',
          ticket: 'Bo på ekonomi: "Datorn säger Ingen internetanslutning och jag kommer inte åt ekonomisystemet. Maja bredvid mig har inga problem."',
          hints: [
            'Kör ipconfig hos Bo. Börjar adressen på 169.254 fick datorn inget DHCP-svar.',
            'Leta upp Bos MAC-adress i show mac address-table på SW-Nordvik-1. Vilket VLAN står den i jämfört med Majas port (Gi0/8)?',
            'interface gi0/7 → switchport access vlan 20. Kör sedan ipconfig /renew hos Bo.',
          ],
          check: function (st) { return ok(st, 'PC-Bo', '192.168.1.70'); },
          report: {
            cause: ['Bos port låg i VLAN 1 i stället för VLAN 20', 'Bos kabel var trasig', 'Ekonomisystemet var avstängt', 'Bo hade fel DNS-server'],
            fix: ['switchport access vlan 20 på Gi0/7 och förnya adressen', 'Byta kabel', 'Starta ekonomisystemet', 'Ändra DNS'],
          },
        },
      ],
    },
    // ------------------------------------------------------------------ Vecka 3
    {
      week: 3, title: 'IP-adresser och subnätning', chapter: 3, site: 'gbg',
      intro: 'Vecka 3: adresser, nätmasker, DHCP och DNS.\n\nKontorets nät är 192.168.1.0/26 (255.255.255.192), ekonomi 192.168.1.64/26. Räkna blocksteget: 256 − 192 = 64.',
      learn: ['Nätmask och blocksteg', '169.254 = inget DHCP-svar', 'show ip dhcp pool / binding', 'DNS är inte DHCP'],
      setup: function (st) {
        var anna = st.devices['PC-Anna'];
        anna.nic.dhcp = false;
        anna.nic.static = { ip: '192.168.1.19', mask: '255.255.255.0', gw: '192.168.1.1', dns: ['192.168.1.1'] };
        S.release(st, 'PC-Anna');
        both(st.devices.R1, function (c) { c.dhcpPools.KONTOR.mask = '255.255.255.248'; });
        both(st.devices.R1, function (c) { c.dhcpPools.EKONOMI.dns = []; });
      },
      after: function (st) {
        S.dhcp(st, 'PC-Karim');
        S.dhcp(st, 'PC-Maja');
      },
      tasks: [
        {
          id: 'v3k1', krabba: true, npc: 'Anna', target: 'PC-Anna',
          title: 'Anna når vissa men inte alla',
          ticket: 'Anna: "Filservern fungerar, men ekonomisystemet på 192.168.1.70 svarar aldrig. Bo kommer åt det."',
          hints: [
            'Når du vissa adresser men inte andra är nätmasken ofta fel någonstans.',
            'Kör ipconfig hos Anna. Kontorsnätet är 192.168.1.0/26, alltså 255.255.255.192.',
            'Rätta nätmasken i Annas nätverksinställningar (E på datorn → Nätverksinställningar), eller välj DHCP.',
          ],
          check: function (st) { return ok(st, 'PC-Anna', '192.168.1.70') && ok(st, 'PC-Anna', '192.168.1.10'); },
          report: {
            cause: ['Annas dator hade nätmasken 255.255.255.0 i stället för 255.255.255.192', 'Ekonomisystemet var nere', 'Routern saknade en rutt', 'Annas DNS-server var fel'],
            fix: ['Sätta rätt nätmask (eller DHCP) på Annas dator', 'Starta om ekonomisystemet', 'Lägga till en statisk rutt', 'Byta DNS-server'],
          },
        },
        {
          id: 'v3k2', krabba: true, npc: 'Karim', target: 'R1',
          title: 'Karim fick en 169.254-adress',
          ticket: 'Karim: "Min dator fick en konstig adress, 169.254-någonting, och jag når ingenting."',
          hints: [
            '169.254 betyder att ingen DHCP-server svarade, eller att poolen inte hade någon adress att ge.',
            'Kör show ip dhcp pool KONTOR och show ip dhcp binding på R-Nordvik-1. Hur många adresser har poolen?',
            'ip dhcp pool KONTOR → network 192.168.1.0 255.255.255.192. Förnya sedan adressen hos Karim (ipconfig /renew).',
          ],
          check: function (st) { return leaseIn(st, 'PC-Karim', '192.168.1.0', '255.255.255.192') && ok(st, 'PC-Karim', '192.168.1.10'); },
          report: {
            cause: ['DHCP-poolen KONTOR hade nätmasken /29, så alla adresser var undantagna', 'Karims kabel var trasig', 'Routern var avstängd', 'Karims port låg i fel VLAN'],
            fix: ['Rätta poolens nät till 192.168.1.0/26 och förnya adressen', 'Byta kabel', 'Starta om routern', 'Byta VLAN'],
          },
        },
        {
          id: 'v3n1', krabba: false, npc: 'Maja', target: 'R1',
          title: 'Namn fungerar inte hos Maja',
          ticket: 'Maja: "ping ekonomi säger att värden inte hittas. Men Bo säger att det går med 192.168.1.70?"',
          hints: [
            'Fungerar adressen men inte namnet är det DNS, inte nätverket.',
            'Kör ipconfig /all hos Maja. Står det någon DNS-server? Titta sedan på poolen EKONOMI på routern.',
            'ip dhcp pool EKONOMI → dns-server 192.168.1.65. Kör sedan ipconfig /renew hos Maja.',
          ],
          check: function (st) { var r = S.resolve(st, 'PC-Maja', 'ekonomi'); return !r.error; },
          report: {
            cause: ['DHCP-poolen EKONOMI delade inte ut någon DNS-server', 'Ekonomisystemet var nere', 'Majas nätmask var fel', 'Routern saknade default route'],
            fix: ['Lägga in dns-server i poolen och förnya adressen', 'Starta ekonomisystemet', 'Rätta nätmasken', 'Lägga in en default route'],
          },
        },
      ],
    },
    // ------------------------------------------------------------------ Vecka 4
    {
      week: 4, title: 'VLAN och trunkar', chapter: 4, site: 'gbg',
      intro: 'Vecka 4: VLAN, trunkar, native VLAN och spanning tree.\n\nNordviks fyra VLAN: 10 KONTOR, 20 EKONOMI, 30 GAST, 99 DRIFT. Trunkarna mellan switcharna har native VLAN 999.',
      learn: ['show interfaces trunk', 'allowed vlan add', 'Native VLAN mismatch', 'STP: Altn BLK'],
      setup: function (st) {
        both(st.devices.SW1, function (c) { ['GigabitEthernet0/24', 'GigabitEthernet0/25'].forEach(function (n) { iface(c, n).allowed = [10, 30, 99]; }); });
        both(st.devices.SW2, function (c) { ['GigabitEthernet0/24', 'GigabitEthernet0/25'].forEach(function (n) { iface(c, n).native = 10; }); });
      },
      tasks: [
        {
          id: 'v4k1', krabba: true, npc: 'Bo', target: 'SW1',
          title: 'Ekonomisystemet svarar inte',
          ticket: 'Bo: "Ekonomisystemet är borta sedan i morse. Internet fungerar, konstigt nog."',
          hints: [
            'Ekonomisystemet sitter på SW-Nordvik-2, Bo på SW-Nordvik-1. Trafiken måste över trunken.',
            'Kör show interfaces trunk i båda ändarna och jämför listan "Vlans allowed on trunk".',
            'På SW-Nordvik-1: interface range gi0/24 - 25 → switchport trunk allowed vlan add 20. Utan add skriver du över listan!',
          ],
          check: function (st) { return ok(st, 'PC-Bo', '192.168.1.70'); },
          report: {
            cause: ['VLAN 20 saknades i trunkens allowed-lista (skrevs över utan add)', 'Ekonomisystemet var avstängt', 'Bos port var i fel VLAN', 'Routern saknade sub-interface för VLAN 20'],
            fix: ['switchport trunk allowed vlan add 20 på trunkportarna', 'Starta ekonomisystemet', 'Byta VLAN på Bos port', 'Skapa sub-interface'],
          },
        },
        {
          id: 'v4k2', krabba: true, npc: 'Lisa', target: 'SW2',
          title: 'Lisa kan inte skriva ut',
          ticket: 'Lisa: "Skrivaren svarar inte och jag kommer inte ut på internet. Filservern fungerar fortfarande."',
          hints: [
            'Titta i show logging på SW-Nordvik-2. Står det något om NATIVE_VLAN_MISMATCH eller PVID?',
            'Jämför kolumnen Native vlan i show interfaces trunk på båda switcharna.',
            'Sätt samma native VLAN i båda ändarna: på SW-Nordvik-2 gi0/24 och gi0/25 → switchport trunk native vlan 999.',
          ],
          check: function (st) { return S.get(st).nativeMismatch.length === 0 && ok(st, 'PC-Lisa', '192.168.1.11'); },
          report: {
            cause: ['Trunkens ändar hade olika native VLAN (10 och 999)', 'Skrivaren var avstängd', 'Lisas kabel var trasig', 'VLAN 10 fanns inte på SW-Nordvik-2'],
            fix: ['Samma native VLAN (999) i båda ändarna', 'Starta skrivaren', 'Byta kabel', 'Skapa VLAN 10'],
          },
        },
        {
          id: 'v4n1', krabba: false, npc: 'Omar', target: 'SW2', flag: 'stpLooked',
          title: 'Orange lampa på port 25',
          ticket: 'Omar: "Lampan vid port 25 på SW-Nordvik-2 lyser orange hela tiden. Är porten trasig? Ska vi byta?"',
          hints: [
            'Kör show spanning-tree på SW-Nordvik-2 och titta på kolumnerna Role och Sts för Gi0/25.',
            'Altn BLK betyder att STP har stängt av en reservväg, eftersom det finns två kablar mellan samma switchar.',
            'Här ska du inte rätta något. Skriv i felrapporten vad du såg och varför det är rätt beteende.',
          ],
          check: function (st, flags) { return !!flags.stpLooked; },
          report: {
            cause: ['Inget fel: STP blockerar reservlänken (Altn BLK) för att undvika en loop', 'Porten är trasig', 'Kabeln är för lång', 'Porten ligger i fel VLAN'],
            fix: ['Inte röra porten – den är en reserv som tar över om Gi0/24 går ner', 'Byta port', 'Stänga av spanning tree', 'Dra ur reservkabeln'],
          },
        },
      ],
    },
    // ------------------------------------------------------------------ Vecka 5
    {
      week: 5, title: 'Routing', chapter: 5, site: 'gbg',
      intro: 'Vecka 5: routing mellan Göteborg och lagret i Borås.\n\nLänken mellan kontoren är 10.0.0.0/30 (.1 Göteborg, .2 Borås). Borås har 192.168.2.0/24. Du tar dig till Borås med bilen vid entrén.\n\nFråga alltid: hur hittar svaret hem?',
      learn: ['show ip route', 'Returvägen', 'Blackhole-rutter och traceroute', 'Router-on-a-stick'],
      setup: function (st) {
        both(st.devices.RB, function (c) { c.routes = []; });
        both(st.devices.R1, function (c) { c.routes[0].nh = '203.0.113.9'; });
        both(st.devices.R1, function (c) { iface(c, 'GigabitEthernet0/0.20').encap = 21; });
      },
      tasks: [
        {
          id: 'v5k1', krabba: true, npc: 'Nils', target: 'RB',
          title: 'Lagret når inte Göteborg',
          ticket: 'Nils på lagret i Borås: "Jag kommer inte åt filservern i Göteborg, och inte internet heller."',
          hints: [
            'Ping från Göteborg till 192.168.2.1 kommer fram, men svaret hittar inte hem. Vem saknar rutten?',
            'Åk till Borås, koppla in dig på R-Boras-1 och kör show ip route. Finns det en väg tillbaka till 192.168.1.0?',
            'På R-Boras-1: ip route 0.0.0.0 0.0.0.0 10.0.0.1 (en default route mot Göteborg). Spara.',
          ],
          check: function (st) { return ok(st, 'PC-Lager', '192.168.1.10'); },
          report: {
            cause: ['R-Boras-1 saknade returväg (default route mot 10.0.0.1)', 'Länken mellan kontoren var nere', 'Filservern var avstängd', 'Fel VLAN på lagerdatorn'],
            fix: ['Lägga en default route på R-Boras-1 via 10.0.0.1', 'Byta WAN-kabel', 'Starta filservern', 'Byta VLAN'],
          },
        },
        {
          id: 'v5k2', krabba: true, npc: 'Karim', target: 'R1',
          title: 'Ingen i Göteborg kommer ut',
          ticket: 'Karim: "Internet är helt dött. Men filservern fungerar."',
          hints: [
            'Kör tracert www.example.com hos Karim eller traceroute på routern. Var tar det slut?',
            'show ip route på R-Nordvik-1: default-rutten finns – men svarar nästa hopp? Pinga det.',
            'Operatörens gateway är 203.0.113.1. Ta bort den felaktiga rutten (no ip route 0.0.0.0 0.0.0.0 203.0.113.9) och lägg in rätt.',
          ],
          check: function (st) { return ok(st, 'PC-Anna', '198.51.100.80'); },
          report: {
            cause: ['Default-rutten pekade på fel nästa hopp (blackhole-rutt)', 'Operatörens länk var nere', 'NAT var avstängt', 'DNS fungerade inte'],
            fix: ['Rätta default-rutten till 203.0.113.1', 'Ringa operatören', 'Slå på NAT', 'Byta DNS-server'],
          },
        },
        {
          id: 'v5n1', krabba: false, npc: 'Maja', target: 'R1',
          title: 'Ekonomi når bara varandra',
          ticket: 'Maja: "Jag och Bo kan pinga varandras datorer, men ingenting annat fungerar. Inte ens gatewayen."',
          hints: [
            'Datorer i samma VLAN når varandra, men inte gatewayen 192.168.1.65. Felet sitter mellan switchen och routern.',
            'show running-config interface gi0/0.20 på R-Nordvik-1. Stämmer VLAN-numret i encapsulation?',
            'interface gi0/0.20 → encapsulation dot1Q 20 (sätt sedan tillbaka ip address 192.168.1.65 255.255.255.192 om den försvann).',
          ],
          check: function (st) { return ok(st, 'PC-Bo', '192.168.1.65') && ok(st, 'PC-Bo', '192.168.1.10'); },
          report: {
            cause: ['Sub-interfacet Gi0/0.20 hade encapsulation dot1Q 21 i stället för 20', 'Ekonomis switchport var avstängd', 'DHCP-poolen var full', 'Default-rutten saknades'],
            fix: ['Rätta encapsulation till dot1Q 20', 'no shutdown på porten', 'Göra poolen större', 'Lägga in default route'],
          },
        },
      ],
    },
    // ------------------------------------------------------------------ Vecka 6
    {
      week: 6, title: 'NAT och säker inloggning', chapter: 6, site: 'gbg',
      intro: 'Vecka 6: NAT och SSH.\n\nNordviks utsida är 203.0.113.10 (PAT). Filservern har den statiska adressen 203.0.113.11. All inloggning ska ske med SSH som användaren drift.',
      learn: ['ip nat inside / outside', 'show ip nat statistics', 'crypto key generate rsa', 'line vty 0 4 och 5 15'],
      setup: function (st) {
        both(st.devices.R1, function (c) { iface(c, 'GigabitEthernet0/0.10').natDir = null; });
        both(st.devices.R1, function (c) { c.domainName = null; c.cryptoKey = null; });
        both(st.devices.R1, function (c) { c.lines.vty5_15 = { transport: 'all', loginLocal: true, password: null }; });
      },
      tasks: [
        {
          id: 'v6k1', krabba: true, npc: 'Anna', target: 'R1',
          title: 'Kontoret kommer inte ut',
          ticket: 'Anna: "Internet fungerar inte för oss på kontoret. Bo på ekonomi säger att hans fungerar."',
          hints: [
            'Datorerna når gatewayen men inte utsidan. Kör show ip nat translations och show ip nat statistics.',
            'Läs raderna Inside interfaces och Outside interfaces. Saknas kontorets sub-interface?',
            'interface gi0/0.10 → ip nat inside. Sub-interfacen ska märkas, inte moderporten.',
          ],
          check: function (st) { return ok(st, 'PC-Anna', '198.51.100.80'); },
          report: {
            cause: ['Gi0/0.10 var inte märkt med ip nat inside', 'Default-rutten saknades', 'Operatören var nere', 'Kontorets DNS var fel'],
            fix: ['ip nat inside på Gi0/0.10', 'Lägga in default route', 'Ringa operatören', 'Byta DNS'],
          },
        },
        {
          id: 'v6k2', krabba: true, npc: 'Omar', target: 'R1',
          title: 'SSH mot routern fungerar inte',
          ticket: 'Omar: "Mitt Python-skript får timeout mot R-Nordvik-1. Och ssh drift@192.168.1.193 säger Connection refused."',
          hints: [
            'Prova själv från laptopen: ssh drift@192.168.1.193. Kör sedan show ip ssh på routern (via konsolen).',
            'SSH Disabled betyder att nyckeln saknas. Den kräver både hostname och domännamn: show running-config | include hostname|domain.',
            'ip domain-name nordvik.example → crypto key generate rsa modulus 2048. Kontrollera med show ip ssh.',
          ],
          check: function (st) { var d = st.devices.R1; return S.sshEnabled(d) === 2 && ok(st, 'Tekniker', '192.168.1.193'); },
          report: {
            cause: ['RSA-nyckeln och domännamnet saknades, så SSH var avstängt', 'Laptopen hade fel IP-adress', 'Användaren drift saknades', 'Routern var avstängd'],
            fix: ['Sätta ip domain-name och köra crypto key generate rsa', 'Byta IP på laptopen', 'Skapa användaren', 'Starta routern'],
          },
        },
        {
          id: 'v6n1', krabba: false, npc: 'Eva', target: 'R1',
          title: 'Revisorn kom in med telnet',
          ticket: 'Eva från revisionen: "Jag kunde logga in på routern med telnet från gästnätet – lösenordet skickas ju i klartext!"',
          hints: [
            'Prova telnet 192.168.1.193 från laptopen. Vilka linjer tar emot telnet?',
            'Titta på line vty i show running-config. Både vty 0 4 och vty 5 15 behöver samma rader.',
            'line vty 5 15 → transport input ssh (och login local). Spara.',
          ],
          check: function (st) { return !S.vtyAllows(st.devices.R1, 'telnet'); },
          report: {
            cause: ['line vty 5 15 tillät fortfarande telnet', 'Lösenordet var för enkelt', 'SSH var avstängt', 'Gästnätet var i fel VLAN'],
            fix: ['transport input ssh även på line vty 5 15', 'Byta lösenord', 'Slå på SSH', 'Byta VLAN'],
          },
        },
      ],
    },
    // ------------------------------------------------------------------ Vecka 7
    {
      week: 7, title: 'Drift och övervakning', chapter: 7, site: 'gbg',
      intro: 'Vecka 7: loggar, klockor och grafer.\n\nÖvervakningsskärmen i serverrummet visar trafiken på de viktigaste portarna. Titta på grafen först, inte på enheten.',
      learn: ['Broadcaststorm och STP', 'Flappande portar i loggen', 'show logging | include', 'NTP och show clock'],
      setup: function (st) {
        both(st.devices.SW1, function (c) { c.stpOff = [10]; });
        both(st.devices.SW2, function (c) { c.stpOff = [10]; });
        st.links.forEach(function (l) { if (l.b.dev === 'PC-Karim') l.state = 'flapping'; });
        both(st.devices.SW2, function (c) { c.ntpServers = []; });
      },
      tasks: [
        {
          id: 'v7k1', krabba: true, npc: 'Anna', target: 'SW1',
          title: 'Allt är trögt och lamporna blinkar i takt',
          ticket: 'Anna: "Allt har stannat! Lamporna på switcharna blinkar som ett discogolv."',
          hints: [
            'Titta på övervakningsskärmen: går kurvan rakt upp i taket? Det är en broadcaststorm – trafiken går runt i en cirkel.',
            'Bryt cirkeln fysiskt: dra ur reservkabeln Gi0/25 mellan switcharna (E på kabeln i racket). Titta sedan i show spanning-tree vlan 10.',
            'Spanning tree är avstängt för VLAN 10 på båda switcharna. Slå på det: spanning-tree vlan 10. Sätt tillbaka kabeln.',
          ],
          check: function (st) {
            var D = S.get(st);
            return Object.keys(D.storm).length === 0 && st.devices.SW1.config.stpOff.indexOf(10) < 0 && st.devices.SW2.config.stpOff.indexOf(10) < 0;
          },
          report: {
            cause: ['Spanning tree var avstängt för VLAN 10, så reservlänken skapade en loop', 'En switch var trasig', 'För mycket trafik från filservern', 'Duplex mismatch'],
            fix: ['Bryta loopen och slå på spanning-tree vlan 10 igen', 'Byta switch', 'Stänga av filservern', 'Sätta duplex auto'],
          },
        },
        {
          id: 'v7k2', krabba: true, npc: 'Karim', target: 'SW1',
          title: 'Karim tappar nätet ibland',
          ticket: 'Karim: "Nätet försvinner hela tiden i några sekunder. När du tittar ser allt säkert bra ut…"',
          hints: [
            'show interfaces status ljuger inte, men den visar bara just nu. Kör show logging | include UPDOWN på SW-Nordvik-1.',
            'Går Gi0/6 upp och ner om och om igen? Titta också på grafen för Karims port – sågtänder?',
            'Byt patchkabel hos Karim. Kontrollera efteråt att inga nya UPDOWN-rader kommer.',
          ],
          check: function (st) { var l = st.links.filter(function (x) { return x.b.dev === 'PC-Karim'; })[0]; return l.state === 'ok'; },
          report: {
            cause: ['Porten flappade på grund av en dålig kabel', 'Karims port var avstängd', 'DHCP-leasen gick ut', 'STP blockerade porten'],
            fix: ['Byta kabel och räkna nya rader i loggen', 'no shutdown', 'Förnya adressen', 'Stänga av STP'],
          },
        },
        {
          id: 'v7n1', krabba: false, npc: 'Omar', target: 'SW2',
          title: 'Loggarna säger 1993',
          ticket: 'Omar: "Loggraderna från SW-Nordvik-2 har datum från 1993 och en stjärna framför. Jag kan inte jämföra dem med routerns."',
          hints: [
            'Kör show clock och show ntp status på SW-Nordvik-2. En stjärna betyder att klockan inte är satt från en pålitlig källa.',
            'Jämför med SW-Nordvik-1: show running-config | include ntp.',
            'ntp server 192.168.1.16 på SW-Nordvik-2. Kontrollera med show ntp status.',
          ],
          check: function (st) { return S.ntpSynced(st, st.devices.SW2); },
          report: {
            cause: ['SW-Nordvik-2 saknade ntp server', 'NTP-servern var avstängd', 'Loggservern var full', 'Switchen hade startat om'],
            fix: ['Lägga in ntp server 192.168.1.16', 'Starta NTP-servern', 'Tömma loggservern', 'Starta om switchen'],
          },
        },
      ],
    },
    // ------------------------------------------------------------------ Vecka 8
    {
      week: 8, title: 'Trådlöst', chapter: 8, site: 'boras',
      intro: 'Vecka 8: trådlöst på lagret i Borås.\n\nTre accesspunkter (AIR-CAP3702) sitter i taket och får ström via PoE från SW-Boras-1. De hämtar sina inställningar från controllern WLC-Nordvik i Göteborgs rack.\n\nSSID Nordvik-Lager → VLAN 40, Nordvik-Gast → VLAN 50.',
      learn: ['show power inline', 'SSID mot VLAN', 'Kanaler 1, 6 och 11', 'Accesspunkt och controller'],
      setup: function (st) {
        both(st.devices.SWB, function (c) { iface(c, 'GigabitEthernet0/1').poe = 'never'; });
        var w = st.devices.WLC.wlc;
        w.wlans[2].iface = 'lager';
        w.apChannels['AP-Lager-3'] = 6;
        w.saved = U.clone({ wlans: w.wlans, apChannels: w.apChannels });
      },
      after: function (st) { S.touch(st); S.dhcp(st, 'Gast-mobil'); },
      tasks: [
        {
          id: 'v8k1', krabba: true, npc: 'Nils', target: 'SWB',
          title: 'Accesspunkten lyser inte',
          ticket: 'Nils: "Accesspunkten vid lastkajen (AP-Lager-1) är helt släckt sedan i morse."',
          hints: [
            'Får den ström? Kör show power inline på SW-Boras-1.',
            'Står porten Gi0/1 som off med Admin off? Då är PoE avstängt på porten.',
            'interface gi0/1 → power inline auto. Vänta en stund och kontrollera show ap summary på controllern.',
          ],
          check: function (st) { return !!S.get(st).apJoined['AP-Lager-1']; },
          report: {
            cause: ['PoE var avstängt på porten (power inline never)', 'Accesspunkten var trasig', 'Controllern var nere', 'Fel kanal'],
            fix: ['power inline auto på Gi0/1', 'Byta accesspunkt', 'Starta om controllern', 'Byta kanal'],
          },
        },
        {
          id: 'v8k2', krabba: true, npc: 'Nils', target: 'WLC',
          title: 'Gästerna hamnar i lagernätet',
          ticket: 'Nils: "En besökare sa att hon såg vår lagerdator i nätverkslistan när hon var ansluten till Nordvik-Gast. Det låter inte bra."',
          hints: [
            'Ta gästmobilen på disken (E) och anslut till Nordvik-Gast. Vilken adress får den? Gästnätet är 192.168.2.64/26.',
            'Logga in på controllern WLC-Nordvik (konsol i Göteborgs rack eller ssh admin@192.168.1.196) och kör show wlan summary.',
            'config wlan disable 2 → config wlan interface 2 gast → config wlan enable 2 → save config. Anslut mobilen igen.',
          ],
          check: function (st) { return leaseIn(st, 'Gast-mobil', '192.168.2.64', '255.255.255.192'); },
          report: {
            cause: ['SSID Nordvik-Gast var mappat mot interfacet lager (VLAN 40)', 'Gästerna hade fel lösenord', 'Accesspunkten var trasig', 'DHCP-poolen för gäster var full'],
            fix: ['Mappa WLAN 2 mot interfacet gast (VLAN 50) i controllern', 'Byta lösenord', 'Byta accesspunkt', 'Göra poolen större'],
          },
        },
        {
          id: 'v8n1', krabba: false, npc: 'Nils', target: 'WLC',
          title: 'Dåligt Wi-Fi vid packbordet',
          ticket: 'Nils: "Vi har tre accesspunkter men streckkodsläsaren tappar ändå nätet vid packbordet. Fler accesspunkter hjälper inte!"',
          hints: [
            'Flera accesspunkter på samma kanal stör varandra. Vilka kanaler används?',
            'På controllern: show advanced 802.11b summary.',
            'config 802.11b channel ap AP-Lager-3 11. Håll dig till 1, 6 och 11.',
          ],
          check: function (st) {
            var ch = st.devices.WLC.wlc.apChannels;
            var v = Object.keys(ch).map(function (k) { return ch[k]; });
            return v.length === 3 && v[0] !== v[1] && v[1] !== v[2] && v[0] !== v[2];
          },
          report: {
            cause: ['Två accesspunkter stod på samma kanal (6)', 'För få accesspunkter', 'PoE-budgeten var slut', 'Fel SSID'],
            fix: ['Flytta AP-Lager-3 till kanal 11 (1/6/11)', 'Köpa fler accesspunkter', 'Minska PoE', 'Byta SSID'],
          },
        },
      ],
    },
    // ------------------------------------------------------------------ Vecka 9
    {
      week: 9, title: 'Säkerhet och brandvägg', chapter: 9, site: 'gbg',
      intro: 'Vecka 9: ACL:er och port security. Ingen Krabba – det här är din repetition inför stationsexaminationen.\n\nKONTOR-UT ska stoppa kontoret från ekonominätet. GAST ska stoppa gästerna från allt inne i huset men släppa ut dem på internet.\n\nLäs listan uppifrån och ner, som routern gör.',
      learn: ['show access-lists och matches', 'Riktning in/out', 'Implicit deny', 'Port security och err-disabled'],
      setup: function (st) {
        both(st.devices.R1, function (c) { var i = iface(c, 'GigabitEthernet0/0.10'); i.aclIn = null; i.aclOut = 'KONTOR-UT'; });
        both(st.devices.R1, function (c) { c.acls.GAST.rules = c.acls.GAST.rules.filter(function (r) { return r.seq !== 30; }); });
        // En gäst har kopplat in en egen liten switch i receptionen
        st.links = st.links.filter(function (l) { return !(l.a.dev === 'SW1' && l.a.port === 'GigabitEthernet0/9'); });
        st.devices['Mini-switch'] = { id: 'Mini-switch', kind: 'hub', os: 'none', site: 'gbg', powered: true, label: 'Okänd miniswitch' };
        st.devices['Okand-laptop'] = { id: 'Okand-laptop', kind: 'host', os: 'windows', site: 'gbg', powered: true, label: 'Okänd laptop', nic: { mac: NV.model.mac('Okand-laptop', 7), dhcp: true, static: null, enabled: true }, lease: null, arp: {}, services: [] };
        st.links.push({ id: 'Lhub1', a: { dev: 'SW1', port: 'GigabitEthernet0/9' }, b: { dev: 'Mini-switch', port: 'p1' }, kind: 'copper', state: 'ok', color: 'blue' });
        st.links.push({ id: 'Lhub2', a: { dev: 'Mini-switch', port: 'p2' }, b: { dev: 'Gast-laptop', port: 'nic' }, kind: 'copper', state: 'ok', color: 'blue' });
        st.links.push({ id: 'Lhub3', a: { dev: 'Mini-switch', port: 'p3' }, b: { dev: 'Okand-laptop', port: 'nic' }, kind: 'copper', state: 'ok', color: 'purple' });
      },
      tasks: [
        {
          id: 'v9k1', krabba: true, npc: 'Maja', target: 'R1',
          title: 'Kontoret når ekonomisystemet',
          ticket: 'Maja: "Anna på kontoret kom åt ekonomisystemet i dag. Det ska ju vara stängt för kontoret!"',
          hints: [
            'show access-lists KONTOR-UT. Har deny-raden några matches? En rad utan siffra har aldrig träffat något.',
            'show ip interface gi0/0.10: står listan som Inbound eller Outgoing?',
            'interface gi0/0.10 → no ip access-group KONTOR-UT out → ip access-group KONTOR-UT in.',
          ],
          check: function (st) {
            var i = st.devices.R1.config.ifaces['GigabitEthernet0/0.10'];
            return !ok(st, 'PC-Anna', '192.168.1.70') && ok(st, 'PC-Anna', '198.51.100.80') && i.aclIn === 'KONTOR-UT';
          },
          report: {
            cause: ['KONTOR-UT satt i fel riktning (out i stället för in)', 'ACL:en saknade permit ip any any', 'Ordningen i listan var fel', 'Anna satt i ekonominätet'],
            fix: ['Sätta listan inbound: ip access-group KONTOR-UT in', 'Lägga till permit ip any any', 'Skriva om listan', 'Byta VLAN'],
          },
        },
        {
          id: 'v9k2', krabba: true, npc: 'Linnea', target: 'R1',
          title: 'Gästerna når ingenting',
          ticket: 'Linnea i receptionen: "Gästerna kommer inte ut på internet sedan någon ändrade något i brandväggen."',
          hints: [
            'show access-lists GAST. Räkna de tillåtande raderna.',
            'Den osynliga sista raden är deny any. Utan en permit stoppas allt som inte uttryckligen tillåts.',
            'ip access-list extended GAST → permit ip any any (den hamnar sist). Kontrollera att deny-raderna står först.',
          ],
          check: function (st) {
            var i = st.devices.R1.config.ifaces['GigabitEthernet0/0.30'];
            if (i.aclIn !== 'GAST') return false;
            var src = '192.168.1.140';
            return S.aclEval(st, 'R1', 'GAST', { src: src, dst: '198.51.100.80', proto: 'icmp' }) &&
              S.aclEval(st, 'R1', 'GAST', { src: src, dst: '9.9.9.9', proto: 'udp', dport: 53 }) &&
              !S.aclEval(st, 'R1', 'GAST', { src: src, dst: '192.168.1.10', proto: 'tcp', dport: 445 }) &&
              !S.aclEval(st, 'R1', 'GAST', { src: src, dst: '192.168.1.70', proto: 'tcp', dport: 443 });
          },
          report: {
            cause: ['GAST saknade permit ip any any, så implicit deny stoppade allt', 'Gästnätets DHCP var full', 'NAT saknades', 'Listan satt i fel riktning'],
            fix: ['Lägga till permit ip any any sist i GAST', 'Göra poolen större', 'Slå på NAT', 'Byta riktning'],
          },
        },
        {
          id: 'v9n1', krabba: false, npc: 'Linnea', target: 'SW1',
          title: 'Receptionsporten är död',
          ticket: 'Linnea: "Gästplatsen i receptionen fungerar inte alls längre. En besökare kopplade in något där i morse…"',
          hints: [
            'show interfaces status på SW-Nordvik-1: står Gi0/9 som err-disabled?',
            'show port-security interface gi0/9. Jämför Total MAC Addresses med Maximum. Titta sedan vid gästplatsen i receptionen.',
            'Koppla bort den okända miniswitchen (E på den). Slå sedan på porten igen: shutdown följt av no shutdown.',
          ],
          check: function (st) {
            return !st.devices.SW1.rt.errdisabled['GigabitEthernet0/9'] && !st.devices['Mini-switch'] && ok(st, 'Gast-laptop', '198.51.100.80');
          },
          report: {
            cause: ['Port security såg fler MAC-adresser än tillåtet (en inkopplad miniswitch) och stängde porten', 'Kabeln var trasig', 'Gästnätet var fullt', 'ACL:en blockerade porten'],
            fix: ['Ta bort den okända enheten och köra shutdown / no shutdown', 'Byta kabel', 'Göra poolen större', 'Ta bort ACL:en'],
          },
        },
      ],
    },
  ];

  function start(week) {
    var def = WEEKS.filter(function (w) { return w.week === week; })[0];
    var st = baseState(week || 1);
    if (!def) return { state: st, def: null };
    // Ta en ögonblicksbild så att ändringarna ger loggrader
    S.refresh(st);
    def.setup(st);
    S.touch(st);
    S.refresh(st);
    if (def.after) def.after(st);
    S.refresh(st);
    return { state: st, def: def };
  }

  // Så tas miniswitchen bort (vecka 9)
  function removeMiniSwitch(st) {
    if (!st.devices['Mini-switch']) return false;
    st.links = st.links.filter(function (l) { return l.a.dev !== 'Mini-switch' && l.b.dev !== 'Mini-switch'; });
    delete st.devices['Mini-switch'];
    delete st.devices['Okand-laptop'];
    st.links.push({ id: 'Lgast', a: { dev: 'SW1', port: 'GigabitEthernet0/9' }, b: { dev: 'Gast-laptop', port: 'nic' }, kind: 'copper', state: 'ok', color: 'blue' });
    S.touch(st);
    return true;
  }

  return { WEEKS: WEEKS, start: start, baseState: baseState, removeMiniSwitch: removeMiniSwitch, DHCP_HOSTS: DHCP_HOSTS };
})();
