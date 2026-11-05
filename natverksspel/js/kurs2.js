// Kurs 2: Routing och switching (YH, 20 poäng). Fyra veckor efter kursrepots labbar och CTF:er:
// 02A nav och ekrar, 02B brandvägg och VPN, 03A OSPF och 03B BGP, PAT och default i OSPF.
// Samma Nordvik som i kurs 1, nu med Mölndal (Bergquist) och två internetoperatörer.
(function () {
  var L = NV.levels, U = NV.util, S = NV.sim;
  if (!L) return;

  function both(d, fn) { fn(d.config); if (d.startup) fn(d.startup); }
  function iface(c, n) { return c.ifaces[n]; }
  function ok(st, from, to, opts) { var r = S.ping(st, from, to, opts); return r.ok && r.loss < 0.9; }
  function fwd(st, from, to) { var t = S.traceroute(st, from, to); return !!(t.forward && t.forward.ok); }
  function via(st, from, to, ip) { var t = S.traceroute(st, from, to); return !!(t.forward && t.forward.ok && t.forward.hops.some(function (h) { return h.ip === ip; })); }
  function look(st, dev, ip) { return S.routeLookup(st, S.get(st), dev, ip); }
  // Prova något med ett interface nere, och ställ tillbaka det efteråt
  function withDown(st, dev, ifn, fn) {
    var i = st.devices[dev].config.ifaces[ifn], was = i.shutdown;
    st._quiet = true;
    i.shutdown = true; S.touch(st);
    try { return fn(); } finally {
      i.shutdown = was; S.touch(st); S.get(st);
      st._quiet = false;
    }
  }
  function ospfNbrs(st, dev) { var D = S.get(st); var r = D.dyn && D.dyn.ospf[dev]; return r ? r.nbrs.map(function (n) { return n.rid; }) : []; }
  function bgpPeer(st, dev, ip) { var D = S.get(st); var b = D.dyn && D.dyn.bgp[dev]; return b ? b.peers.filter(function (p) { return p.ip === ip; })[0] : null; }
  function staticCover(c, dst, nh, minAd) {
    return c.routes.some(function (r) { return r.nh === nh && (r.ad || 1) >= minAd && U.inNet(dst, r.net, r.mask) && r.net !== '0.0.0.0'; });
  }

  var WEEKS = [
    // ------------------------------------------------------------------ Vecka 11 · kursvecka 02, labb 02A
    {
      chips: ['show ip route', 'show ip route static', 'traceroute 192.168.3.10'],
      week: 11, kurs: 2, title: 'Nav och ekrar', chapter: 5, site: 'gbg',
      course: 'Kurs 2 Routing och switching, vecka 02: labb 02A (hub & spoke med statiska rutter)',
      intro: 'Kurs 2 · Routing och switching. Nordvik har köpt Bergquist, och deras kontor i Mölndal hör nu till nätet. Göteborg är navet, Borås och Mölndal är ekrarna: all trafik mellan kontoren går via R-Nordvik-1.\n\nGöteborg Gi0/2 10.0.0.1/30 ↔ Borås Gi0/2 10.0.0.2\nGöteborg Se0/0/0 10.0.0.5/30 ↔ Mölndal Se0/0/0 10.0.0.6 (hyrd förbindelse, 1544 kbit/s)\nMölndal: 192.168.3.0/26, R-Molndal-1 192.168.3.1 och Elins dator 192.168.3.10.\n\nMölndal har ingen egen tekniker. R-Molndal-1 når du via konsolservern i rack A. I natt har Krabban varit framme.',
      learn: ['Ekrarna: en defaultrutt till navet', 'Navet: en rutt per kontorsnät', 'traceroute visar en routingloop', 'Längsta prefixet vinner', 'Administrativt avstånd och flytande statiska rutter'],
      setup: function (st) {
        // Fel 1: Mölndals defaultrutt pekar på Göteborgs adress mot Borås. Den ligger inte i något anslutet nät,
        // så rutten installeras aldrig och Mölndal når ingenting utanför sitt LAN.
        both(st.devices.RM, function (c) { c.routes = [{ net: '0.0.0.0', mask: '0.0.0.0', nh: '10.0.0.1' }]; });
        // Fel 2: navets rutt till Mölndal pekar mot Borås, och Borås defaultrutt skickar tillbaka: en loop
        both(st.devices.R1, function (c) { c.routes.forEach(function (r) { if (r.net === '192.168.3.0') r.nh = '10.0.0.2'; }); });
      },
      after: function (st) {
        S.ping(st, 'PC-Molndal', '192.168.1.10');
        S.ping(st, 'PC-Lager', '192.168.3.10');
      },
      tasks: [
        {
          id: 'v11k1', krabba: true, npc: 'Linnea', target: 'RM',
          title: 'Mölndal når ingenting utanför kontoret',
          ticket: 'Linnea: "Elin på Mölndalskontoret ringde till receptionen. Hennes dator når skrivaren bredvid sig, men inte filservern och inte internet. Hon har startat om datorn två gånger."',
          hints: [
            'Koppla in dig på R-Molndal-1 via konsolservern i rack A. En eker behöver en enda väg ut: en defaultrutt mot navet. Kör show ip route – vad står på raden Gateway of last resort?',
            'show running-config | include ip route visar att rutten finns i konfigurationen. Men en statisk rutt installeras bara om nästa hopp ligger i ett anslutet nät. Vilket nät har Se0/0/0 (show ip interface brief), och vilken adress har Göteborg på den länken?',
            'R-Molndal-1: conf t → no ip route 0.0.0.0 0.0.0.0 10.0.0.1 → ip route 0.0.0.0 0.0.0.0 10.0.0.5 → end → write memory. Kontrollera med show ip route: S* 0.0.0.0/0 [1/0] via 10.0.0.5.',
          ],
          check: function (st) { return fwd(st, 'PC-Molndal', '192.168.1.10'); },
          report: {
            cause: ['Mölndals defaultrutt pekade på 10.0.0.1, som inte ligger i något anslutet nät, så rutten installerades aldrig', 'Den hyrda förbindelsen var nere', 'Elins dator hade fel IP-adress', 'Filservern blockerade Mölndal'],
            fix: ['Peka defaultrutten på Göteborgs adress på serielänken, 10.0.0.5', 'Ringa operatören om förbindelsen', 'Ge Elins dator en statisk adress', 'Öppna filservern för 192.168.3.0/26'],
          },
        },
        {
          id: 'v11k2', krabba: true, npc: 'Nils', target: 'R1',
          title: 'Från Borås når ingen Mölndal',
          ticket: 'Nils: "Vi skulle skicka plocklistan till Mölndal, men ingenting går fram. Ping står och väntar och sedan kommer det TTL expired."',
          hints: [
            'Kör traceroute 192.168.3.10 från R-Boras-1 (eller tracert från lagerdatorn). Ser du samma adresser om och om igen?',
            'En loop: paketet åker fram och tillbaka mellan 10.0.0.1 och 10.0.0.2 tills TTL tar slut. Borås skickar allt till navet med sin defaultrutt. Vart skickar navet trafiken till 192.168.3.0/26? show ip route static på R-Nordvik-1.',
            'R-Nordvik-1: conf t → no ip route 192.168.3.0 255.255.255.192 10.0.0.2 → ip route 192.168.3.0 255.255.255.192 10.0.0.6 → end → wr. traceroute 192.168.3.10: 10.0.0.1, 10.0.0.6 och sedan datorn.',
          ],
          check: function (st) { return fwd(st, 'PC-Lager', '192.168.3.10') && fwd(st, 'PC-Anna', '192.168.3.10'); },
          report: {
            cause: ['Navets rutt till Mölndal pekade mot Borås, och Borås defaultrutt skickade tillbaka trafiken: en routingloop', 'Borås saknade en rutt till Mölndal', 'TTL var för lågt på lagerdatorn', 'Serielänken tappade paket'],
            fix: ['Rätta navets rutt till 192.168.3.0/26 så att den pekar på Mölndal, 10.0.0.6', 'Lägga en rutt till Mölndal på R-Boras-1', 'Höja TTL på lagerdatorn', 'Sänka hastigheten på serielänken'],
          },
        },
        {
          id: 'v11n1', krabba: false, npc: 'Omar', target: 'RB',
          title: 'Reservväg mellan Borås och Mölndal',
          ticket: 'Omar: "Vi har dragit en kabel mellan Borås och Mölndal, 10.0.0.8/30 (.9 Borås, .10 Mölndal). Den ska bara användas när ekrarnas länk till Göteborg är nere – normalt ska trafiken mellan ekrarna gå via navet. Kan du lägga flytande statiska rutter på båda ekrarna?"',
          hints: [
            'En flytande statisk rutt är en vanlig ip route med ett högre administrativt avstånd sist, t.ex. 200. Den används bara när en bättre rutt till samma nät saknas.',
            'Lägg ip route 192.168.3.0 255.255.255.192 10.0.0.10 200 på R-Boras-1 och kör traceroute 192.168.3.10. Går trafiken via Göteborg? Nej: /26 är ett längre prefix än defaultrutten, och längsta prefixet vinner före avståndet. Det behövs en vanlig rutt till samma nät via navet också.',
            'R-Boras-1: ip route 192.168.3.0 255.255.255.192 10.0.0.1 och ip route 192.168.3.0 255.255.255.192 10.0.0.10 200. R-Molndal-1: ip route 192.168.2.0 255.255.255.0 10.0.0.5 och ip route 192.168.2.0 255.255.255.0 10.0.0.9 200. show ip route static visar bara [1/0]-rutterna så länge navet är uppe.',
          ],
          check: function (st) {
            var rb = st.devices.RB.config, rm = st.devices.RM.config;
            if (!staticCover(rb, '192.168.3.10', '10.0.0.10', 2) || !staticCover(rm, '192.168.2.1', '10.0.0.9', 2)) return false;
            if (!via(st, 'PC-Lager', '192.168.3.10', '10.0.0.1') || !via(st, 'PC-Molndal', '192.168.2.1', '10.0.0.5')) return false;
            // Länken Borås–Göteborg nere: Borås ska ta direktvägen
            return withDown(st, 'RB', 'GigabitEthernet0/2', function () { var r = look(st, 'RB', '192.168.3.10'); return !!(r && r.nh === '10.0.0.10'); });
          },
          report: {
            cause: ['Ekrarna saknade en reservväg, och en flytande rutt ensam vinner på längsta prefix och tar all trafik', 'Kabeln mellan Borås och Mölndal var trasig', 'Navet hade för många rutter', 'OSPF var avstängt'],
            fix: ['Lägga en vanlig rutt via navet och en flytande rutt (AD 200) via direktlänken på båda ekrarna', 'Byta kabeln', 'Ta bort navets rutter', 'Slå på OSPF på navet'],
          },
        },
      ],
    },
    // ------------------------------------------------------------------ Vecka 12 · kursvecka 02, labb 02B och CTF 02
    {
      chips: ['show crypto isakmp sa', 'show crypto isakmp policy', 'show crypto ipsec sa'],
      week: 12, kurs: 2, title: 'Brandvägg och VPN', chapter: 10, site: 'gbg',
      course: 'Kurs 2 Routing och switching, vecka 02: labb 02B (site-to-site VPN) och CTF 02',
      intro: 'Kurs 2, vecka 02 (labb 02B). Borås och Göteborg pratar över internet i en IPsec-tunnel. Värdena ska vara lika på båda sidor:\n\nFas 1: AES 256, SHA, delad nyckel NordvikLabb123, DH-grupp 5, livstid 86400 s\nFas 2: ESP med AES 256 och SHA-HMAC · transform set TS-NORDVIK · crypto map CMAP · access-lista VPN-BORAS\n\nGöteborg 203.0.113.10 · Borås 203.0.113.20. PAT på båda routrarna, och NAT-undantag för tunneltrafiken. Mölndal hänger kvar på den hyrda förbindelsen till Göteborg.',
      learn: ['Fas 1 (IKE) och fas 2 (IPsec)', 'show crypto isakmp sa: MM_NO_STATE och QM_IDLE', 'DH-gruppen måste stämma', 'NAT före kryptering: undantaget', 'Access-listor: första träffen vinner', 'Krav N-1: ekonomisystemet'],
      setup: function (st) {
        // Fel 1: Borås kör DH-grupp 2, Göteborg grupp 5. Ingen policy matchar, så fas 1 blir aldrig klar.
        both(st.devices.RB, function (c) { c.crypto.isakmp.policies[10].group = 2; });
        // Fel 2: någon ändrade NAT-undantaget i Göteborg strax efter nio. Det pekar på Mölndals nät i stället för lagrets.
        both(st.devices.R1, function (c) { c.acls['NAT-UT'].rules[0].dst = { ip: '192.168.3.0', wild: '0.0.0.63' }; });
      },
      after: function (st) {
        S.ping(st, 'PC-Lager', '192.168.1.10');
        S.ping(st, 'Tekniker', '192.168.2.193');
        S.pushLog(st, st.devices.R1, '%PARSER-5-CFGLOG_LOGGEDCMD: User:konsult  logged command:ip access-list extended NAT-UT');
        S.pushLog(st, st.devices.R1, '%PARSER-5-CFGLOG_LOGGEDCMD: User:konsult  logged command:10 deny ip 192.168.1.0 0.0.0.63 192.168.3.0 0.0.0.63');
      },
      tasks: [
        {
          id: 'v12k1', krabba: true, npc: 'Nils', target: 'RB',
          title: 'Tunneln kommer aldrig upp',
          ticket: 'Nils: "Vi når inte filservern från lagret sedan i morse. Omar säger att VPN-tunneln inte ens kommer förbi första steget."',
          hints: [
            'show crypto isakmp sa på R-Nordvik-1. QM_IDLE betyder att fas 1 är klar. MM_NO_STATE betyder att routrarna aldrig kom överens om något.',
            'Fas 1 kräver att en policy matchar på båda sidor: kryptering, hash, autentisering, DH-grupp. Jämför show crypto isakmp policy på R-Nordvik-1 och R-Boras-1 rad för rad. Labben säger grupp 5.',
            'R-Boras-1 (åk till Borås, eller konsol där): conf t → crypto isakmp policy 10 → group 5 → end → wr. Pinga filservern från lagret och kör show crypto isakmp sa igen: QM_IDLE.',
          ],
          check: function (st) {
            S.ping(st, 'Tekniker', '192.168.2.193');
            var c = S.cryptoStatus(st, 'R1');
            return c.isakmp.some(function (x) { return x.dst === '203.0.113.20' && x.state === 'QM_IDLE'; });
          },
          report: {
            cause: ['Borås IKE-policy använde DH-grupp 2 och Göteborgs grupp 5, så ingen policy matchade i fas 1', 'Den delade nyckeln var fel', 'Transform set saknades', 'Operatören blockerade UDP 500'],
            fix: ['Sätta group 5 i crypto isakmp policy 10 på R-Boras-1', 'Byta nyckel på båda sidor', 'Skapa ett nytt transform set', 'Ringa operatören'],
          },
        },
        {
          id: 'v12k2', krabba: true, npc: 'Anna', target: 'R1',
          title: 'Tunneln är uppe, men svaren kommer inte fram',
          ticket: 'Anna: "Lagret säger att de ser filservern nu, men när jag försöker öppna lagerdatorns delade mapp händer ingenting. Och Nils filer till oss hänger."',
          hints: [
            'Kör show crypto ipsec sa på R-Nordvik-1 medan du pingar 192.168.2.1 från en kontorsdator. Ökar #pkts encaps? NAT görs före kryptering: översatt trafik matchar inte längre VPN-BORAS.',
            'show ip nat translations: syns kontorsdatorer mot 192.168.2.x? Då översätts tunneltrafiken. show access-lists NAT-UT: deny-raden först ska undanta trafiken till lagret. Vilket nät pekar den på? show logging visar vem som ändrade den.',
            'R-Nordvik-1: ip access-list extended NAT-UT → no 10 → 10 deny ip 192.168.1.0 0.0.0.63 192.168.2.0 0.0.0.63 → end → clear ip nat translation * → wr.',
          ],
          check: function (st) { return ok(st, 'PC-Lager', '192.168.1.10') && ok(st, 'PC-Anna', '192.168.2.1'); },
          report: {
            cause: ['NAT-undantaget pekade på Mölndals nät, så tunneltrafiken till lagret översattes före krypteringen och matchade inte VPN-BORAS', 'Tunneln var nere', 'Lagerdatorn hade fel gateway', 'Filservern var full'],
            fix: ['Peka deny-raden i NAT-UT på lagrets nät 192.168.2.0/26', 'Starta om tunneln', 'Byta gateway på lagerdatorn', 'Rensa filservern'],
          },
        },
        {
          id: 'v12n1', krabba: false, npc: 'Eva', target: 'R1',
          title: 'Bara ekonomi får nå ekonomisystemet (N-1)',
          ticket: 'Eva: "Revisorn testade i går: från Mölndal går det att öppna ekonomisystemet, 192.168.1.70. Kravet N-1 säger att det bara får nås från ekonominätet, VLAN 20. Filservern och internet ska Mölndal förstås ha kvar."',
          hints: [
            'Vem når 192.168.1.70 i dag? Pröva från R-Molndal-1: ping 192.168.1.70 source 192.168.3.1. Kontoret (VLAN 10) stoppas redan av KONTOR-UT – men ingen lista gäller trafiken från Mölndal.',
            'Trafiken från Mölndal kommer in på R-Nordvik-1 Se0/0/0. En utökad access-lista inåt där kan neka Mölndals nät mot ekonomisystemet och släppa resten. Glöm inte permit ip any any sist – annars stoppar det osynliga deny allt.',
            'R-Nordvik-1: ip access-list extended MOLNDAL-IN → 10 deny ip 192.168.3.0 0.0.0.63 host 192.168.1.70 → 20 permit ip any any → interface se0/0/0 → ip access-group MOLNDAL-IN in → end → wr.',
          ],
          check: function (st) {
            return !ok(st, 'PC-Molndal', '192.168.1.70', { proto: 'tcp', dport: 443 }) && ok(st, 'PC-Bo', '192.168.1.70', { proto: 'tcp', dport: 443 }) &&
              ok(st, 'PC-Molndal', '192.168.1.10', { proto: 'tcp', dport: 445 }) && ok(st, 'PC-Molndal', '9.9.9.9');
          },
          report: {
            cause: ['Ingen access-lista gällde trafiken från Mölndal, så ekonomisystemet gick att nå därifrån', 'Ekonomisystemet saknade lösenord', 'VLAN 20 var felkonfigurerat', 'Mölndal låg i samma VLAN som ekonomi'],
            fix: ['En utökad lista inåt på Se0/0/0 som nekar Mölndal mot 192.168.1.70 och släpper resten', 'Byta lösenord i ekonomisystemet', 'Ta bort VLAN 20', 'Flytta Mölndal till ett eget VLAN'],
          },
        },
      ],
    },
    // ------------------------------------------------------------------ Vecka 13 · kursvecka 03, labb 03A och CTF 03
    {
      chips: ['show ip ospf neighbor', 'show ip ospf interface brief', 'show ip route ospf'],
      week: 13, kurs: 2, title: 'OSPF', chapter: 5, site: 'gbg',
      course: 'Kurs 2 Routing och switching, vecka 03: labb 03A (OSPF i triangeln) och CTF 03',
      intro: 'Kurs 2, vecka 03 (labb 03A). De statiska rutterna är borta. Göteborg, Borås och Mölndal kör OSPF i en triangel, allt i area 0 och process 1. Router-id: Göteborg 1.1.1.1, Borås 2.2.2.2, Mölndal 3.3.3.3.\n\nGöteborg–Borås Gi0/2 10.0.0.0/30 (Gigabit)\nGöteborg–Mölndal Se0/0/0 10.0.0.4/30 (seriell, bandwidth 1544)\nBorås–Mölndal Gi0/1 10.0.0.8/30 (Gigabit)\n\nLAN-portarna är passiva. Göteborg sprider sin defaultrutt med default-information originate. OSPF räknar kostnad som 100 Mbit/s delat med bandwidth.',
      learn: ['show ip ospf neighbor: FULL', 'Det som måste stämma: area, hello och dead, nätet', 'Kostnad = referens / bandwidth', 'show ip ospf interface brief', 'passive-interface', 'Ett nytt nät utan statiska rutter (N-2)'],
      setup: function (st) {
        // Fel 1 a: Borås länkar ligger i area 1, grannarna i area 0. Inga grannskap alls.
        both(st.devices.RB, function (c) { c.ospf.networks.forEach(function (n) { if (n.net !== '192.168.2.0') n.area = 1; }); });
        // Fel 1 b: Mölndals sida av länken mot Borås har andra timers (syns först när arean är rättad)
        both(st.devices.RM, function (c) { iface(c, 'GigabitEthernet0/1').ospfHello = 30; iface(c, 'GigabitEthernet0/1').ospfDead = 120; });
        // Fel 2: någon har satt bandwidth 100000 på Göteborgs serielänk. OSPF tror att den är snabb.
        both(st.devices.R1, function (c) { iface(c, 'Serial0/0/0').bandwidth = 100000; });
      },
      after: function (st) {
        S.ping(st, 'PC-Lager', '192.168.1.10');
        S.ping(st, 'PC-Molndal', '192.168.1.10');
      },
      tasks: [
        {
          id: 'v13k1', krabba: true, npc: 'Nils', target: 'RB',
          title: 'Borås har inga OSPF-grannar',
          ticket: 'Nils: "Sedan ni bytte till det där OSPF når lagret ingenting utanför Borås. Inte filservern, inte internet, inte Mölndal."',
          hints: [
            'show ip ospf neighbor på R-Boras-1 är tom. Två routrar blir bara grannar om flera saker stämmer på båda sidor av länken: samma nät och mask, samma area, samma hello- och dead-intervall, och interfacet får inte vara passivt.',
            'show ip ospf interface brief visar arean per interface. Jämför med grannarna. show logging visar mismatched area ID. När arean är rättad: show ip ospf interface gi0/1 på båda sidor – raden Timer intervals.',
            'R-Boras-1: router ospf 1 → no network 10.0.0.0 0.0.0.3 area 1 → network 10.0.0.0 0.0.0.3 area 0 → samma för 10.0.0.8. R-Molndal-1: interface gi0/1 → no ip ospf hello-interval → no ip ospf dead-interval. Nu ska Borås ha två grannar i FULL.',
          ],
          check: function (st) { var n = ospfNbrs(st, 'RB'); return n.indexOf('1.1.1.1') >= 0 && n.indexOf('3.3.3.3') >= 0; },
          report: {
            cause: ['Borås länkar låg i area 1 och Mölndals sida mot Borås hade hello 30/dead 120, så inga grannskap kom upp', 'Kabeln till Borås var trasig', 'Borås hade samma router-id som Göteborg', 'OSPF-processen var avstängd'],
            fix: ['Lägga länkarna i area 0 och ta tillbaka standardtimers (10/40) på Mölndals Gi0/1', 'Byta kabel', 'Byta router-id', 'Starta om routern'],
          },
        },
        {
          id: 'v13k2', krabba: true, npc: 'Omar', target: 'R1',
          title: 'Varför är Mölndal så långsamt?',
          ticket: 'Omar: "Mölndal klagar på att allt mot Göteborg går segt sedan i går. Vi har ju Gigabit via Borås – varför går trafiken på den gamla seriella linan?"',
          hints: [
            'show ip route ospf på R-Nordvik-1: vilket nästa hopp och vilken metric har 192.168.3.0/26? Via Borås kostar vägen 1 + 1 + 1 = 3. Via serielänken ska den kosta 64 + 1.',
            'show ip ospf interface brief: vilken kostnad har Se0/0/0? Kostnaden är 100 Mbit/s delat med bandwidth. OSPF mäter aldrig hastigheten själv, den litar på kommandot bandwidth. show run interface se0/0/0.',
            'R-Nordvik-1: interface se0/0/0 → no bandwidth (tillbaka till 1544) → end. Se0/0/0 får kostnad 64, och show ip route ospf visar O 192.168.3.0 [110/3] via 10.0.0.2.',
          ],
          check: function (st) { var r = look(st, 'R1', '192.168.3.10'); return !!(r && r.type === 'O' && r.nh === '10.0.0.2' && r.metric === 3); },
          report: {
            cause: ['bandwidth 100000 på serielänken gav den kostnad 1, så OSPF valde den långsamma linan', 'Serielänken hade fel klockfrekvens', 'Mölndal hade för många användare', 'Borås-länken var passiv'],
            fix: ['Ta bort bandwidth-raden så att serielänken får kostnad 64 och vägen via Borås väljs', 'Höja clock rate', 'Begränsa trafiken i Mölndal', 'Göra Borås-länken aktiv'],
          },
        },
        {
          id: 'v13n1', krabba: false, npc: 'Karim', target: 'RM',
          title: 'Ett nytt nät i Mölndal (N-2)',
          ticket: 'Karim: "Bergquist ska testa en ny tjänst i Mölndal på adressen 10.255.0.3. Den ska synas i hela Nordvik direkt, utan att någon skriver statiska rutter för hand – det är ju krav N-2. Kan du lägga den som en loopback på R-Molndal-1?"',
          hints: [
            'Ett loopback-interface är alltid uppe. interface loopback 0 och ip address 10.255.0.3 255.255.255.255 på R-Molndal-1.',
            'OSPF annonserar bara interface som täcks av en network-rad. show ip protocols visar vilka nät processen har. En loopback annonseras som /32.',
            'R-Molndal-1: interface loopback0 → ip address 10.255.0.3 255.255.255.255 → router ospf 1 → network 10.255.0.3 0.0.0.0 area 0. På R-Nordvik-1: show ip route ospf visar O 10.255.0.3/32.',
          ],
          check: function (st) {
            var D = S.get(st);
            var r = S.installedRoutes(st, D, 'R1').filter(function (x) { return x.type === 'O' && x.mask === '255.255.255.255' && x.origin === 'RM'; });
            var anyStatic = ['R1', 'RB'].some(function (id) { return st.devices[id].config.routes.some(function (q) { return q.mask === '255.255.255.255'; }); });
            return r.length > 0 && !anyStatic;
          },
          report: {
            cause: ['Det nya nätet fanns inte på Mölndals router, och OSPF annonserar bara nät som en network-rad täcker', 'Göteborg saknade en statisk rutt', 'Loopback-interface kan inte annonseras', 'Mölndal behövde en egen area'],
            fix: ['Skapa Loopback0 med 10.255.0.3/32 och täcka den med en network-rad i area 0', 'Lägga statiska rutter på alla routrar', 'Använda ett fysiskt interface', 'Skapa area 3 för Mölndal'],
          },
        },
      ],
    },
    // ------------------------------------------------------------------ Vecka 14 · kursvecka 03, labb 03B
    {
      chips: ['show ip bgp summary', 'show ip bgp', 'show ip nat translations'],
      week: 14, kurs: 2, title: 'BGP, PAT och default', chapter: 6, site: 'gbg',
      course: 'Kurs 2 Routing och switching, vecka 03: labb 03B (eBGP mot operatören, PAT och default i OSPF)',
      intro: 'Kurs 2, vecka 03 (labb 03B). Nordvik (AS 65010) pratar eBGP med operatörerna. ISP-A (AS 64500) sitter på Gi0/1, 203.0.113.1. ISP-B (AS 64501) har levererat en seriell förbindelse på Se0/0/1, 198.51.100.1/30. ISP-A och ISP-B pratar redan BGP med varandra, och ISP-B annonserar webbserverns nät 198.51.100.64/27.\n\nHela Nordvik går ut på internet via Göteborg: PAT på 203.0.113.10 och en defaultrutt som R-Nordvik-1 sprider med OSPF (default-information originate). Router-id i BGP: 1.1.1.1.',
      learn: ['router bgp och neighbor remote-as', 'show ip bgp summary: Up/Down och PfxRcd', 'AS-vägen: kortast vinner', 'default-information originate', 'PAT: ip nat inside på alla vägar in', 'Två operatörer (N-3)'],
      setup: function (st) {
        // Fel 1: fel AS-nummer på grannen ISP-A (64050 i stället för 64500). Sessionen kommer aldrig upp.
        both(st.devices.R1, function (c) { c.bgp.neighbors['203.0.113.1'].remoteAs = 64050; });
        // Fel 2: Gi0/2 mot Borås saknar ip nat inside. Trafiken från Borås, och Mölndal som går via Borås, översätts inte.
        both(st.devices.R1, function (c) { iface(c, 'GigabitEthernet0/2').natDir = null; });
      },
      after: function (st) {
        S.ping(st, 'PC-Lager', '9.9.9.9');
        S.ping(st, 'PC-Molndal', '198.51.100.80', { proto: 'tcp', dport: 80 });
      },
      tasks: [
        {
          id: 'v14k1', krabba: true, npc: 'Omar', target: 'R1',
          title: 'BGP-grannen mot ISP-A kommer aldrig upp',
          ticket: 'Omar: "ISP-A ringde. Vår BGP-session mot dem har aldrig kommit upp sedan bytet i går kväll. De ser inga försök med rätt AS-nummer från oss."',
          hints: [
            'show ip bgp summary på R-Nordvik-1. En granne som är uppe visar en tid och ett tal sist på raden. Active eller Idle betyder att sessionen inte är uppe – Active betyder inte aktiv.',
            'Titta på loggraderna som börjar med %BGP i show logging. En BGP-granne konfigureras med två uppgifter: grannens adress och grannens AS-nummer. Vad står i intro-texten? Läs siffra för siffra.',
            'R-Nordvik-1: router bgp 65010 → no neighbor 203.0.113.1 remote-as 64050 → neighbor 203.0.113.1 remote-as 64500 → end → wr. show ip bgp ska visa 198.51.100.64/27 med vägen 64500 64501.',
          ],
          check: function (st) {
            var p = bgpPeer(st, 'R1', '203.0.113.1');
            return !!(p && p.up);
          },
          report: {
            cause: ['neighbor 203.0.113.1 remote-as stod på 64050 i stället för ISP-A:s 64500, så ISP-A avvisade sessionen', 'Länken till ISP-A var nere', 'Nordvik saknade ett eget AS-nummer', 'BGP-timers var för korta'],
            fix: ['Rätta remote-as till 64500 för grannen 203.0.113.1', 'Ringa ISP-A om länken', 'Skaffa ett publikt AS', 'Höja keepalive-tiden'],
          },
        },
        {
          id: 'v14k2', krabba: true, npc: 'Nils', target: 'R1',
          title: 'Borås och Mölndal kommer inte ut på internet',
          ticket: 'Nils: "Göteborg surfar som vanligt, men från lagret går det inte att nå någon webbsida. Elin i Mölndal säger samma sak."',
          hints: [
            'show ip route på R-Boras-1: finns O*E2 0.0.0.0/0? Då fungerar defaultrutten. Pinga 9.9.9.9 från lagret och kör show ip nat translations på R-Nordvik-1: syns 192.168.2.x?',
            'Översättningen sker bara när trafiken kommer in på ett interface med ip nat inside och går ut på ett med ip nat outside. Trafiken från Borås, och normalt också från Mölndal, kommer in på Gi0/2. show ip nat statistics listar inside- och outside-interfacen.',
            'R-Nordvik-1: interface gi0/2 → ip nat inside → end → wr. Prova igen från lagret: show ip nat translations visar 192.168.2.x som inside local.',
          ],
          check: function (st) { return ok(st, 'PC-Lager', '9.9.9.9') && ok(st, 'PC-Molndal', '198.51.100.80', { proto: 'tcp', dport: 80 }); },
          report: {
            cause: ['Gi0/2 mot Borås saknade ip nat inside, så trafiken från Borås och Mölndal översattes inte och fick inga svar', 'Borås saknade defaultrutt', 'ISP-A blockerade Borås', 'DNS var fel i Mölndal'],
            fix: ['ip nat inside på R-Nordvik-1 Gi0/2', 'Lägga en statisk defaultrutt på R-Boras-1', 'Ringa ISP-A', 'Byta DNS-server'],
          },
        },
        {
          id: 'v14n1', krabba: false, npc: 'Maja', target: 'R1',
          title: 'Internet även när ISP-A ligger nere (N-3)',
          ticket: 'Maja: "Vi betalar för två operatörer, men den nya linan från ISP-B används inte. Krav N-3 säger att internet ska fungera även när en av dem ligger nere. Kan du koppla upp ISP-B?"',
          hints: [
            'ISP-B:s uppgifter: Se0/0/1, deras adress 198.51.100.1 och AS 64501. Sätt upp en BGP-granne till och kontrollera med show ip bgp att det finns två vägar till 198.51.100.64/27. Vilken blir bäst (>), och varför?',
            'Vägen via ISP-B är kortast (bara 64501), så trafiken till webbservern går nu ut på Se0/0/1. Då måste PAT gälla där också: ip nat outside på Se0/0/1 och en egen NAT-regel för det interfacet. Samma access-lista kan bara stå i en regel (route-map finns inte i Packet Tracer), så gör en kopia av lista 1. Och när Gi0/1 är nere försvinner den statiska defaultrutten – en flytande defaultrutt via ISP-B behövs.',
            'R-Nordvik-1: router bgp 65010 → neighbor 198.51.100.1 remote-as 64501. access-list 2 permit 192.168.1.0 0.0.0.255 (och 192.168.2.0 0.0.0.255, 192.168.3.0 0.0.0.63). ip nat inside source list 2 interface serial0/0/1 overload. interface se0/0/1 → ip nat outside. ip route 0.0.0.0 0.0.0.0 198.51.100.1 250. Testa med shutdown på Gi0/1 och sedan no shutdown.',
          ],
          check: function (st) {
            var p = bgpPeer(st, 'R1', '198.51.100.1');
            if (!p || !p.up) return false;
            if (!ok(st, 'PC-Molndal', '198.51.100.80', { proto: 'tcp', dport: 80 }) || !ok(st, 'PC-Anna', '9.9.9.9')) return false;
            return withDown(st, 'R1', 'GigabitEthernet0/1', function () {
              return ok(st, 'PC-Anna', '9.9.9.9') && ok(st, 'PC-Molndal', '198.51.100.80', { proto: 'tcp', dport: 80 });
            });
          },
          report: {
            cause: ['ISP-B saknade BGP-granne, PAT och reservdefault, så all trafik berodde på ISP-A', 'ISP-B:s förbindelse var trasig', 'Två operatörer kan inte användas samtidigt', 'Nordvik behövde fler publika adresser'],
            fix: ['BGP mot 198.51.100.1 (AS 64501), PAT på Se0/0/1 och en flytande defaultrutt via ISP-B', 'Ringa ISP-B', 'Säga upp ISP-B', 'Köpa fler adresser'],
          },
        },
      ],
    },
  ];

  // Frågesport vid tavlan: [fråga, rätt svar, fel, fel]. Efter kursrepots koaner, självtester och övningsprov.
  L.QUIZ2 = {
    11: [['Varför räcker en defaultrutt på en eker?', 'Ekern har bara en väg ut, till navet', 'Defaultrutter är snabbare', 'Navet skickar alltid allt'],
      ['Hur många förbindelser behöver fem kontor i full mesh?', '10', '4', '20'],
      ['Två rutter matchar 192.168.3.10: 0.0.0.0/0 med AD 1 och 192.168.3.0/26 med AD 200. Vilken används?', '/26-rutten, eftersom längsta prefixet vinner före avståndet', 'Defaultrutten, eftersom AD 1 är lägst', 'Båda, trafiken delas'],
      ['Vad visar en traceroute när det finns en routingloop?', 'Samma adresser om och om igen tills TTL tar slut', 'Bara stjärnor', 'Ett enda hopp'],
      ['Vad gör ett högre administrativt avstånd sist i ip route?', 'Gör rutten till en reserv som bara används när bättre saknas', 'Gör rutten snabbare', 'Tar bort rutten efter en timme']],
    12: [['Vad förhandlas i fas 1 (IKE)?', 'Hur routrarna skyddar sitt eget samtal: kryptering, hash, nyckel och DH-grupp', 'Vilka paket som ska krypteras', 'Vilken NAT-adress som ska användas'],
      ['Vad betyder MM_NO_STATE i show crypto isakmp sa?', 'Routrarna har inte kommit överens om fas 1', 'Tunneln är uppe och väntar', 'Fas 2 är klar'],
      ['Varför slutar tunneln fungera när PAT slås på?', 'NAT görs före kryptering, så översatt trafik matchar inte crypto-ACL:en', 'PAT stänger UDP 500', 'PAT kräver en ny nyckel'],
      ['Vad avgör vilken trafik som krypteras?', 'Access-listan i crypto map (match address)', 'Transform set', 'Routingtabellen'],
      ['Varför byggs internet-VPN ofta som hub & spoke?', 'Det räcker med en tunnel per kontor till huvudkontoret', 'Ekrarna får då snabbare internet', 'Full mesh går inte med IPsec']],
    13: [['Vad måste stämma för att två OSPF-routrar ska bli grannar?', 'Samma nät och mask, area, hello- och dead-intervall', 'Samma router-id', 'Samma bandwidth'],
      ['Vilken kostnad får en seriell länk med bandwidth 1544 och referens 100 Mbit/s?', '64', '1', '1544'],
      ['Vad gör passive-interface?', 'Interfacet skickar inga hello, men dess nät annonseras ändå', 'Interfacet stängs av', 'Nätet annonseras inte'],
      ['På vilken sorts nät väljer OSPF DR och BDR?', 'Ethernet, där flera routrar kan sitta', 'Punkt-till-punkt-serielänkar', 'Loopback-interface'],
      ['Vad heter tiden innan en tyst granne förklaras död?', 'Dead interval', 'Hello interval', 'Hold-down timer']],
    14: [['R-Nordvik-1 lär sig samma nät via eBGP och via OSPF. Vilken rutt installeras?', 'eBGP, eftersom AD 20 är lägre än OSPF:s 110', 'OSPF, eftersom den räknar bandbredd', 'Den som kom först'],
      ['Vilket attribut innehåller listan över AS på vägen?', 'AS_PATH', 'Router-id', 'TTL'],
      ['Vad betyder Active i sista kolumnen i show ip bgp summary?', 'Sessionen är inte uppe, routern försöker', 'Sessionen är aktiv', 'Grannen skickar trafik'],
      ['Datorerna i Borås kommer inte ut, och show ip nat translations är tom. Vad är vanligast?', 'Interfacet där trafiken kommer in saknar ip nat inside', 'PAT kräver två publika adresser', 'Listan måste vara extended'],
      ['Vad gör default-information originate under router ospf?', 'Sprider routerns defaultrutt till de andra OSPF-routrarna', 'Skapar en defaultrutt till internet', 'Stänger av statiska rutter']],
  };
  // Veckans utmaning (75 XP och en medalj)
  function used(g, re) { return g.cmdLog.some(function (c) { return re.test(c.line.trim()); }); }
  L.CH2 = {
    11: { title: 'Följ paketet med traceroute från två routrar', need: true, test: function (g) { return g.cmdLog.filter(function (c) { return /^(traceroute|tracert|trace)\b/i.test(c.line.trim()); }).map(function (c) { return c.dev; }).filter(function (d, i, a) { return a.indexOf(d) === i; }).length >= 2; } },
    12: { title: 'Jämför show crypto isakmp policy på båda sidor', need: true, test: function (g) { var devs = g.cmdLog.filter(function (c) { return /^(do\s+)?sh\w*\s+cry\w*\s+isa\w*\s+pol/i.test(c.line.trim()); }).map(function (c) { return c.dev; }); return devs.indexOf('R1') >= 0 && devs.indexOf('RB') >= 0; } },
    13: { title: 'Använd show ip ospf interface brief', need: true, test: function (g) { return used(g, /^(do\s+)?sh\w*\s+ip\s+ospf\s+int\w*\s+br/i); } },
    14: { title: 'Använd både show ip bgp och show ip bgp summary', need: true, test: function (g) { return used(g, /^(do\s+)?sh\w*\s+ip\s+bgp\s*$/i) && used(g, /^(do\s+)?sh\w*\s+ip\s+bgp\s+sum/i); } },
  };

  WEEKS.forEach(function (w) { L.WEEKS.push(w); });
  L.WEEKS.sort(function (a, b) { return a.week - b.week; });
  L.KURS2 = WEEKS.map(function (w) { return w.week; });
})();
