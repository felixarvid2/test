// Handboken i spelet: kommandon, felbibliotek, adressplan och styrning.
NV.handbook = (function () {
  function table(head, rows) {
    return '<table class="tbl"><tr>' + head.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr>' +
      rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>';
  }
  function c(s) { return '<code>' + s + '</code>'; }

  return {
    cmd: function () {
      return '<h3>Ta dig runt</h3>' + table(['Kommando', 'Vad det gör'], [
        [c('enable'), 'Från &gt; till # (privilegierat läge)'],
        [c('configure terminal') + ' / ' + c('conf t'), 'Från # till (config)#'],
        [c('interface gi0/5'), 'Konfigurera en port, (config-if)#'],
        [c('interface range gi0/24 - 25'), 'Flera portar samtidigt'],
        [c('end') + ' eller Ctrl+Z', 'Tillbaka till #'],
        [c('exit'), 'Ett steg tillbaka'],
        [c('do show ...'), 'Kör ett show-kommando i konfigurationsläge'],
        [c('?') + ' och Tab', 'Visa vad som går att skriva / fyll i ordet'],
        ['Ctrl+A K', 'Stäng screen (konsolen)'],
      ]) + '<h3>Spara</h3>' + table(['Kommando', 'Vad det gör'], [
        [c('write memory') + ' / ' + c('wr'), 'Sparar running-config till startup-config'],
        [c('copy running-config startup-config'), 'Samma sak, längre form'],
        [c('show running-config') + ' / ' + c('show startup-config'), 'Det som gäller nu / det som gäller efter omstart'],
      ]) + '<h3>Vem sitter var?</h3>' + table(['Kommando', 'Svarar på'], [
        [c('show interfaces status'), 'connected, notconnect, disabled, err-disabled – och duplex/hastighet'],
        [c('show mac address-table'), 'Vilken port och vilket VLAN en MAC-adress finns på'],
        [c('show interfaces gi0/24'), 'Räknare: CRC, runts, late collisions'],
        [c('show cdp neighbors'), 'Vilka Cisco-enheter som sitter i andra änden'],
        [c('show logging | include UPDOWN'), 'Filtrera loggen'],
      ]) + '<h3>Adresser, DHCP och DNS</h3>' + table(['Kommando', 'Svarar på'], [
        [c('show ip interface brief'), 'Adress och status per interface'],
        [c('show ip dhcp pool') + ', ' + c('show ip dhcp binding'), 'Poolens storlek och utdelade adresser'],
        [c('ip dhcp pool KONTOR') + ' → ' + c('network') + ', ' + c('default-router') + ', ' + c('dns-server'), 'Bygg eller rätta en pool'],
        [c('ipconfig /all') + ', ' + c('ipconfig /renew'), 'På en Windows-dator'],
        [c('nslookup filserver'), 'Testa DNS'],
      ]) + '<h3>VLAN och trunkar</h3>' + table(['Kommando', 'Svarar på'], [
        [c('show vlan brief'), 'Accessportar per VLAN (trunkar syns inte här)'],
        [c('show interfaces trunk'), 'Native VLAN och tillåtna VLAN per trunk'],
        [c('switchport mode access') + ' + ' + c('switchport access vlan 20'), 'Sätt en port i ett VLAN'],
        [c('switchport trunk allowed vlan add 20'), 'Lägg till – utan add skrivs listan över!'],
        [c('switchport trunk native vlan 999'), 'Samma i båda ändarna'],
        [c('show spanning-tree vlan 10'), 'Root, Role (Root/Desg/Altn) och Sts (FWD/BLK)'],
      ]) + '<h3>Routing, NAT och SSH</h3>' + table(['Kommando', 'Svarar på'], [
        [c('show ip route'), 'Routingtabellen. Mest exakta raden vinner.'],
        [c('ip route 0.0.0.0 0.0.0.0 10.0.0.1'), 'Default route'],
        [c('encapsulation dot1Q 20'), 'VLAN på ett sub-interface (router-on-a-stick)'],
        [c('traceroute') + ' / ' + c('tracert'), 'Var tar vägen slut?'],
        [c('show ip nat statistics') + ', ' + c('show ip nat translations'), 'Inside/outside och översättningar'],
        [c('ip domain-name nordvik.example') + ' + ' + c('crypto key generate rsa modulus 2048'), 'Slå på SSH'],
        [c('line vty 0 4') + ' och ' + c('line vty 5 15') + ' → ' + c('transport input ssh'), 'Stäng telnet på alla linjer'],
      ]) + '<h3>Drift, trådlöst och säkerhet</h3>' + table(['Kommando', 'Svarar på'], [
        [c('show clock') + ', ' + c('show ntp status') + ', ' + c('ntp server 192.168.1.16'), 'Stjärna = klockan är inte satt'],
        [c('show power inline'), 'PoE per port och återstående budget'],
        [c('show wlan summary') + ', ' + c('show ap summary') + ' (WLC)', 'SSID mot interface, anslutna AP'],
        [c('config wlan interface 2 gast') + ' (WLC)', 'Byt VLAN för ett SSID (WLAN:et måste vara avstängt)'],
        [c('show access-lists'), 'Raderna och deras träffar (matches)'],
        [c('ip access-group GAST in'), 'Sätt en ACL på ett interface'],
        [c('show port-security interface gi0/9'), 'Max/antal MAC-adresser och överträdelser'],
      ]) + '<h3>VPN och lastbalansering (kapitel 10)</h3>' + table(['Kommando', 'Svarar på'], [
        [c('show crypto isakmp sa'), 'Fas 1: QM_IDLE = uppe, MM_NO_STATE / MM_KEY_EXCH = problem'],
        [c('show crypto ipsec sa | include ident|encaps|decaps'), 'Fas 2: vilka nät som skyddas och om paketen räknas'],
        [c('show crypto map') + ', ' + c('show crypto session'), 'Peer, ACL och transform-set i en blick'],
        [c('show access-lists VPN-TRAFIK'), 'Crypto-ACL:en – ska vara spegelvänd på andra sidan'],
        [c('ip access-list extended NAT-UT') + ' → ' + c('5 deny ip ...'), 'NAT-undantag först i listan (NAT görs före kryptering)'],
        [c('ip tcp adjust-mss 1360'), 'Stora TCP-segment får plats i tunneln'],
        [c('ping 192.168.1.10 source gi0/0.40 size 1500 df-bit'), 'Testa tunneln från rätt källa och med stora paket'],
        [c('clear crypto sa'), 'Riv tunneln – den byggs igen vid nästa matchande paket'],
        [c('show pool') + ', ' + c('config pool TID-POOL monitor http') + ' (LB)', 'Lastbalanserarens servrar och hälsokontroll'],
      ]) + '<h3>Laptopen (Linux)</h3>' + table(['Kommando', 'Vad det gör'], [
        [c('sudo screen /dev/ttyUSB0 9600'), 'Konsol mot enheten där den ljusblå kabeln sitter'],
        [c('ssh drift@192.168.1.193'), 'Logga in över nätet'],
        [c('ip -4 addr show') + ', ' + c('ip route show default') + ', ' + c('ip -4 neigh show'), 'Laptopens egna inställningar'],
        [c('ping -c 4 192.168.1.10') + ', ' + c('resolvectl query filserver'), 'Testa nät och DNS'],
        [c('ping -s 1400 -M do 192.168.2.193') + ', ' + c('tracepath 192.168.2.193'), 'Stora paket med DF satt och vägens MTU'],
        [c('curl http://tid/') + ', ' + c('for i in 1 2 3 4; do curl -s http://tid/; done'), 'Webbsidor och lastbalanserare'],
        [c('ip route get 192.168.2.1') + ', ' + c('man ping') + ', ' + c('!!'), 'Vilken väg? Hjälp. Kör om senaste kommandot.'],
        [c('ip a | grep inet'), 'Filtrera en utskrift'],
      ]) + '<h3>Windows</h3>' + table(['Kommando', 'Vad det gör'], [
        [c('ping -f -l 1400 192.168.1.10'), 'Stort paket med DF satt (1472 är max på vanlig Ethernet)'],
        [c('copy \\\\filserver\\ritningar\\hyllplan.pdf .'), 'Kopiera en fil från filservern'],
        [c('curl http://tid/'), 'Hämta en webbsida'],
        [c('ipconfig /all | findstr DNS'), 'Filtrera en utskrift'],
      ]);
    },
    fel: function () {
      return '<p class="muted">Slå upp symptomet, inte kapitlet.</p>' + table(['Du ser', 'Oftast', 'Kap'], [
        ['Konstiga tecken i konsolen', 'Fel hastighet. Ska vara 9600 8N1.', '1'],
        ['% Invalid input vid ^', 'Fel läge – titta på prompten', '1'],
        ['Namnet borta efter omstart', 'Aldrig sparat (write memory)', '1'],
        [c('disabled') + ' i status', 'Porten är avstängd med shutdown', '1'],
        [c('notconnect'), 'Lager 1: kabel, port eller enhet', '2'],
        ['Seg trafik, late collisions / CRC', 'Duplex mismatch', '2'],
        ['MAC-adressen i fel VLAN', 'Accessporten ligger i fel VLAN', '2'],
        ['Adress 169.254.x.x', 'Inget DHCP-svar eller tom pool', '3'],
        ['Når vissa men inte alla', 'Fel nätmask någonstans', '3'],
        ['Ping till adress går, till namn inte', 'DNS, inte nätet', '3'],
        ['Ett VLAN kommer inte över trunken', 'Saknas i allowed-listan', '4'],
        ['Två VLAN dör, NATIVE_VLAN_MISMATCH', 'Olika native VLAN i ändarna', '4'],
        ['BLK / Altn på en port med kabel', 'STP-reserv. Rör den inte.', '4'],
        ['Ping kommer fram men inget svar', 'Returvägen saknas', '5'],
        ['Rutten finns men trafiken dör', 'Nästa hopp svarar inte (blackhole)', '5'],
        ['Samma VLAN når varandra men inte gatewayen', 'Fel encapsulation dot1Q eller gateway', '5'],
        ['Inget kommer ut, NAT-tabellen tom', 'ip nat inside/outside saknas eller fel', '6'],
        ['SSH Disabled', 'Nyckel/domännamn saknas', '6'],
        ['Telnet går trots transport input ssh', 'line vty 5 15 glömdes', '6'],
        ['Alla lampor blinkar i takt, allt trögt', 'Broadcaststorm – loop utan STP', '7'],
        ['Korta avbrott, status ser bra ut', 'Flappande port – titta i loggen', '7'],
        ['Stjärna före tiden, 1993', 'NTP saknas', '7'],
        ['AP helt släckt', 'Ingen PoE (show power inline)', '8'],
        ['Gäster i fel nät', 'SSID mappat mot fel VLAN', '8'],
        ['Dålig täckning trots många AP', 'Samma kanal – använd 1, 6, 11', '8'],
        ['Regeln har inga matches', 'Fel interface eller fel riktning', '9'],
        ['Allt tystnar när ACL:en sätts', 'permit ip any any saknas (implicit deny)', '9'],
        [c('err-disabled'), 'Port security – för många MAC-adresser', '9'],
        ['Tunneln uppe (QM_IDLE) men encaps/decaps står still', 'Crypto-ACL:erna speglar inte varandra, eller NAT före kryptering', '10'],
        ['proxy identities not supported i loggen', 'ACL:erna på de två sidorna är inte spegelvända', '10'],
        ['MM_KEY_EXCH / MM_NO_STATE', 'Fel nyckel eller policy i fas 1', '10'],
        ['Ping fungerar, stora filer hänger', 'MTU i tunneln – ip tcp adjust-mss 1360', '10'],
        ['Webbsidan fungerar varannan gång', 'Lastbalanserarens hälsokontroll pingar bara', '10'],
      ]);
    },
    plan: function () {
      return '<h3>Göteborg – 192.168.1.0/24 delat i fyra /26</h3>' + table(['VLAN', 'Namn', 'Nät', 'Gateway'], [
        ['10', 'KONTOR', '192.168.1.0/26', '192.168.1.1'],
        ['20', 'EKONOMI', '192.168.1.64/26', '192.168.1.65'],
        ['30', 'GAST', '192.168.1.128/26', '192.168.1.129'],
        ['99', 'DRIFT', '192.168.1.192/26', '192.168.1.193'],
      ]) + table(['Vad', 'Adress'], [
        ['Filserver', '192.168.1.10'], ['Skrivare', '192.168.1.11'], ['NTP-server', '192.168.1.16'], ['Loggserver', '192.168.1.17'],
        ['Ekonomisystem', '192.168.1.70'], ['SW-Nordvik-1 / -2 (drift)', '192.168.1.194 / .195'], ['WLC-Nordvik', '192.168.1.196'], ['Din laptop', '192.168.1.200'],
      ]) + '<h3>Borås – 192.168.2.0/24</h3>' + table(['VLAN', 'Namn', 'Nät', 'Gateway'], [
        ['40', 'LAGER', '192.168.2.0/26', '192.168.2.1'],
        ['50', 'TRADLOST-GAST', '192.168.2.64/26', '192.168.2.65'],
        ['99', 'DRIFT', '192.168.2.192/26', '192.168.2.193'],
      ]) + '<h3>Länkar och utsidan</h3>' + table(['Vad', 'Adress'], [
        ['Göteborg–Borås', '10.0.0.0/30 (.1 Göteborg, .2 Borås)'], ['Operatörens gateway', '203.0.113.1'],
        ['Nordviks utsida (PAT)', '203.0.113.10'], ['Filserverns utsida (statisk NAT)', '203.0.113.11'],
        ['Borås utsida (från vecka 10)', '203.0.113.20'], ['VPN-tunneln', '192.168.1.0/26 ↔ 192.168.2.0/26 och drift ↔ drift'],
        ['Lastbalanseraren LB-Nordvik (VIP)', '192.168.1.13 (tid.nordvik.example)'], ['Tidrapportservrarna', 'Tid-1 192.168.1.14 · Tid-2 192.168.1.15'],
        ['Mölndal (planerat)', '192.168.3.0/26 – ännu utan förbindelse'],
      ]) + '<h3>Racket</h3>' + table(['Enhet', 'Portar'], [
        ['R-Nordvik-1 (2951)', 'Gi0/0 trunk mot SW-Nordvik-1 Gi0/1 · Gi0/1 ut · Gi0/2 Borås'],
        ['SW-Nordvik-1 (3560G)', 'Gi0/5–6 kontor · Gi0/7–8 ekonomi · Gi0/9 gäst · Gi0/10 teknikerbänken · Gi0/11 skrivare · Gi0/12 Sara · Gi0/20 WLC · Gi0/24 trunk · Gi0/25 reservlänk'],
        ['SW-Nordvik-2 (3750G)', 'Gi0/2 filserver · Gi0/3 NTP · Gi0/4 logg · Gi0/5 Lisa · Gi0/8 ekonomisystem · Gi0/24–25 trunkar'],
        ['SW-Boras-1 (3560G)', 'Gi0/1–3 accesspunkter (PoE, trunk) · Gi0/5 lagerdatorn · Gi0/24 trunk mot R-Boras-1'],
      ]);
    },
    mine: function () {
      var g = NV.game, seen = {}, list = [];
      function e(s) { return String(s).replace(/[&<>"]/g, function (x) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[x]; }); }
      (g && g.cmdLog || []).slice().reverse().forEach(function (x) { var l = x.line.trim(); if (l && !seen[l] && list.length < 40) { seen[l] = 1; list.push(x); } });
      if (!list.length) return '<p class="muted">Här samlas kommandona du skriver under veckan. Klicka på ett för att kopiera det.</p>';
      return '<p class="muted">Dina senaste unika kommandon. Klicka för att kopiera.</p>' + table(['Var', 'Kommando', ''], list.map(function (x) { return [e(x.where), c(e(x.line.trim())), '<button data-cmd="' + e(x.line.trim()) + '">Kopiera</button>']; }));
    },
    keys: function () {
      return '<h3>3D</h3>' + table(['Tangent', 'Gör'], [
        ['W A S D / piltangenter', 'Gå (Shift = spring)'], ['Mus', 'Titta – klicka i bilden för att låsa musen'], ['Håll musknappen och dra', 'Titta utan muslås (om låset inte fungerar)'],
        ['Högerklick (håll) eller Z', 'Zooma in – läs frontpaneler och portar'], ['E eller klick', 'Använd det du tittar på'], ['Esc', 'Släpp musen och öppna pausmenyn'],
        ['C eller Ctrl', 'Huka – läs de nedersta enheterna'], ['Mellanslag', 'Hoppa'], ['V', 'Ficklampa'],
      ]) + '<h3>2D</h3>' + table(['Tangent', 'Gör'], [
        ['W A S D / piltangenter', 'Gå (Shift = spring)'], ['Klick på golvet', 'Gå dit'], ['Klick på en sak eller person', 'Gå dit och använd den'],
        ['E / mellanslag / Enter', 'Använd det du står vid'], ['+ / − eller mushjulet', 'Zooma'], ['Esc', 'Pausmeny'],
      ]) + '<h3>Alltid</h3>' + table(['Tangent', 'Gör'], [
        ['T', 'Öppna laptopen'], ['F', 'Skriv felrapport för ett löst ärende'], ['L', 'Ledtråd'], ['H', 'Handboken'], ['M', 'Karta och snabbresa'],
        ['Tab', 'Ärendelistan och dina rapporter'], ['N', 'Anteckningar'], ['O', 'Notislogg'], ['U', 'Fäll ihop HUD'], ['F1', 'Den här hjälpen'],
        ['G', 'Nätverksglasögon: kablar i statusfärg'], ['R', 'Spela upp senaste pingspåret'], ['J', 'Karriär, prestationer och statistik'], ['K', 'Visa eller dölj minikartan'], ['P', 'Fotoläge (döljer gränssnittet)'],
      ]) + '<h3>I terminalen</h3>' + table(['Tangent', 'Gör'], [
        ['?', 'Hjälp direkt (IOS)'], ['Tab', 'Fyll i kommandot eller interfacetypen'], ['↑ ↓', 'Tidigare kommandon'], ['Ctrl+C', 'Avbryt ping och liknande'],
        ['Ctrl+Z', 'Hoppa till # från konfigurationsläge'], ['Ctrl+L', 'Rensa skärmen'], ['PageUp / PageDown', 'Bläddra'], ['Ctrl+Shift+C', 'Kopiera markerad text'],
        ['Ctrl+A K', 'Stäng konsolen (screen)'], ['Esc', 'Stäng terminalfönstret'],
        ['→', 'Ta den grå kompletteringen'], ['Ctrl+F', 'Sök i utskriften (Enter = nästa)'], ['⟲', 'Lista med tidigare kommandon'],
        ['Ctrl+R', 'Sök bakåt bland tidigare kommandon (tryck igen för nästa träff)'], ['Ctrl+K', 'Ta bort resten av raden'], ['Alt+.', 'Sista ordet från förra kommandot'],
        ['Ctrl+D', 'Logga ut (på tom rad)'], ['!!', 'Kör om senaste kommandot (Linux)'],
      ]) + '<h3>Pekskärm</h3>' + table(['Gest', 'Gör'], [
        ['Styrspaken nere till vänster', 'Gå (knappen 🏃 växlar spring)'], ['Dra med fingret', 'Titta (3D)'], ['Tryck på något', 'Använd det (3D och 2D)'], ['Nyp med två fingrar', 'Zooma (2D)'],
        ['☰ uppe till höger', 'Alla funktioner: karta, handbok, glasögon, helskärm …'], ['Tangentraden i terminalen', 'Tab, ?, pilar, Ctrl+C, Ctrl+Z och Ctrl+A K'],
      ]) + '<p class="muted">Tips: gå fram till en enhet i racket och tryck E för att sätta i konsolkabeln. Laptopen öppnas då med rätt kommando förifyllt. I 2D öppnas rackvyn där du klickar på enheten.</p>';
    },
    calc: function () {
      return '<p class="muted">Skriv en adress med prefix eller nätmask, till exempel <code>192.168.1.100/26</code> eller <code>10.0.0.2 255.255.255.252</code>.</p>' +
        '<input id="calc-in" class="search" value="192.168.1.100/26" autocomplete="off"><div id="calc-out"></div>';
    },
    bindCalc: function (d) {
      var U = NV.util;
      var inp = d.querySelector('#calc-in'), out = d.querySelector('#calc-out');
      function run() {
        var v = inp.value.trim().replace(/\s+/g, ' ');
        var m = /^(\d+\.\d+\.\d+\.\d+)\s*(?:\/(\d{1,2})|\s(\d+\.\d+\.\d+\.\d+))$/.exec(v);
        if (!m || !U.isIp(m[1])) { out.innerHTML = '<p class="err">Skriv t.ex. 192.168.1.100/26</p>'; return; }
        var pfx = m[2] !== undefined ? parseInt(m[2], 10) : U.maskToPrefix(m[3]);
        if (pfx === null || pfx > 32) { out.innerHTML = '<p class="err">Ogiltig nätmask.</p>'; return; }
        var mask = U.prefixToMask(pfx);
        var net = U.network(m[1], mask), bc = U.broadcast(m[1], mask);
        var size = Math.pow(2, 32 - pfx);
        var hosts = pfx >= 31 ? (pfx === 32 ? 1 : 2) : size - 2;
        var octet = Math.min(3, Math.floor(pfx / 8));
        var block = 256 - parseInt(mask.split('.')[octet], 10);
        var wild = U.intToIp((~U.ipToInt(mask)) >>> 0);
        var first = pfx >= 31 ? net : U.intToIp(U.ipToInt(net) + 1), last = pfx >= 31 ? bc : U.intToIp(U.ipToInt(bc) - 1);
        out.innerHTML = table(['Vad', 'Värde'], [
          ['Nätmask', c(mask) + ' (/' + pfx + ')'], ['Wildcard (för ACL)', c(wild)], ['Blocksteg', block + ' i oktett ' + (octet + 1)],
          ['Nätadress', c(net)], ['Första användbara', c(first)], ['Sista användbara', c(last)], ['Broadcast', c(bc)], ['Antal värdar', hosts],
        ]) + '<p class="muted small">Blocksteget: 256 minus masken i den oktett där masken slutar. Näten börjar på jämna multiplar av blocksteget.</p>';
      }
      inp.addEventListener('input', run);
      run();
    },
    osi: function () {
      var L = [
        ['7 Applikation', 'Programmen: webb, DNS-uppslag, SSH.', 'Ping till adress går men inte till namn (v3), telnet i stället för SSH (v6), lastbalanserarens hälsokontroll (v10)'],
        ['6 Presentation', 'Format och kryptering.', 'SSH-nyckeln saknas (v6)'],
        ['5 Session', 'Dialogen mellan två system.', 'Inloggning på vty-linjerna (v6)'],
        ['4 Transport', 'TCP och UDP, portnummer.', 'ACL som blockerar en port (v9), NAT/PAT byter portar (v6)'],
        ['3 Nät', 'IP-adresser och routing.', 'Fel nätmask (v3), returväg saknas (v5), blackhole-rutt (v5), ACL i fel riktning (v9), IPsec-tunneln och MTU (v10)'],
        ['2 Länk', 'Ramar, MAC-adresser, switchar, VLAN.', 'Fel VLAN (v2), allowed-listan (v4), native VLAN (v4), STP och loopar (v4, v7), port security (v9)'],
        ['1 Fysiskt', 'Kablar, kontakter, ström och radio.', 'Trasig kabel (v2), duplex (v2), flappande port (v7), PoE (v8), kanaler (v8)'],
      ];
      return '<p class="muted">Börja nerifrån när något inte fungerar. Varje lager är beroende av lagret under.</p>' +
        L.map(function (l) { return '<div class="osi-layer"><b>' + l[0] + '</b><span>' + l[1] + '</span><span class="muted small">Fel i spelet: ' + l[2] + '</span></div>'; }).join('');
    },
    vpn: function () {
      return '<p class="muted">Kapitel 10: den hyrda linan Göteborg–Borås kostade 6 000 kr i månaden och användes till 4 %. Nu går trafiken krypterad över internet.</p>' +
        '<h3>Så byggs tunneln</h3>' + table(['Steg', 'Vad händer', 'Kolla med'], [
          ['1', 'Ett paket matchar crypto-ACL:en (VPN-TRAFIK)', c('show access-lists VPN-TRAFIK')],
          ['2', 'Fas 1 (ISAKMP): policy och nyckel måste stämma', c('show crypto isakmp sa') + ' → QM_IDLE'],
          ['3', 'Fas 2 (IPsec): transform-set och spegelvända ACL:er', c('show crypto ipsec sa') + ' → encaps/decaps'],
          ['4', 'Paketet krypteras (ESP) och får ett nytt IP-huvud 203.0.113.10 → .20', c('ping ... source gi0/0.10')],
        ]) +
        '<h3>Felsökningsordning</h3><ol><li>Når routrarna varandras utsidor? (ping 203.0.113.20)</li><li>Fas 1 uppe? QM_IDLE.</li><li>Räknas paketen? encaps på ena sidan ska bli decaps på den andra.</li><li>Speglar ACL:erna varandra exakt?</li><li>Har NAT-listan deny-rader för VPN-trafiken <b>först</b>?</li><li>Stora paket: ping med DF-bit och ip tcp adjust-mss 1360.</li></ol>' +
        '<h3>VPN, SD-WAN och lastbalansering</h3>' + table(['Begrepp', 'Kort'], [
          ['Site-to-site', 'Två kontor, alltid uppe – det Nordvik bygger'], ['Remote access', 'En användare från hemmet eller hotellet (t.ex. WireGuard, AnyConnect)'],
          ['Full / split tunnel', 'Allt i tunneln, eller bara företagstrafiken'], ['GRE över IPsec', 'När routingprotokoll ska gå i tunneln'],
          ['NAT traversal', 'IPsec i UDP 4500 när någon NAT:ar på vägen'], ['SD-WAN', 'Flera förbindelser (fiber, 4G) som väljs efter regler och mäts hela tiden'],
          ['Lager 4-balansering', 'Tittar på IP och port – snabb, vet inget om innehållet'], ['Lager 7-balansering', 'Tittar på HTTP (sökväg, cookies) – t.ex. NGINX, HAProxy, Traefik, F5'],
          ['Hälsokontroll', 'Ping säger bara att servern lever. Testa tjänsten: GET /status → 200 OK'],
        ]) +
        '<h3>Tio veckor i repris</h3>' + table(['Vecka', 'Tema', 'Kommandot att komma ihåg'], NV.levels.WEEKS.map(function (w) { return [String(w.week), w.title, c((w.chips && w.chips[0]) || '')]; }));
    },
    ord: function () {
      return table(['Svenska', 'Engelska', 'Kort förklaring'], [
        ['nätmask', 'subnet mask', 'Avgör var nätet slutar'], ['standardgateway', 'default gateway', 'Vägen ut ur det egna nätet'], ['sändning till alla', 'broadcast', 'En ram till alla i samma VLAN'],
        ['växel', 'switch', 'Skickar ramar med hjälp av MAC-tabellen'], ['vägväljare', 'router', 'Skickar paket mellan nät'], ['nätverkskort', 'NIC', 'Datorns anslutning'],
        ['stamlänk', 'trunk', 'En kabel som bär flera VLAN med 802.1Q-taggar'], ['åtkomstport', 'access port', 'Port i ett enda VLAN'], ['inbyggt VLAN', 'native VLAN', 'VLAN:et utan tagg på en trunk'],
        ['spännande träd', 'spanning tree (STP)', 'Stänger reservvägar så att ramar inte går runt'], ['rotbrygga', 'root bridge', 'Switchen som STP räknar från'], ['adressöversättning', 'NAT/PAT', 'Byter adress (och port) på väg ut'],
        ['åtkomstlista', 'ACL', 'Regler som släpper eller stoppar trafik'], ['implicit neka', 'implicit deny', 'Den osynliga sista raden i varje ACL'], ['hastighetsförhandling', 'autonegotiation', 'Ändarna kommer överens om fart och duplex'],
        ['duplexfel', 'duplex mismatch', 'Ena änden full, andra halv duplex'], ['ström via kabeln', 'PoE', 'Accesspunkter och telefoner får ström från switchen'], ['trådlös controller', 'WLC', 'Styr accesspunkterna centralt'],
        ['nätnamn', 'SSID', 'Namnet på ett trådlöst nät'], ['klockserver', 'NTP-server', 'Ger enheterna rätt tid'], ['konsolport', 'console port', 'Seriell ingång, 9600 8N1'],
        ['startkonfiguration', 'startup-config', 'Det som gäller efter omstart'], ['aktuell konfiguration', 'running-config', 'Det som gäller just nu'], ['felbibliotek', 'troubleshooting guide', 'Symptom → orsak'],
        ['krypterad tunnel', 'VPN', 'Ett privat nät över internet'], ['plats-till-plats', 'site-to-site', 'Tunnel mellan två kontor'], ['fjärråtkomst', 'remote access', 'En användare in i företagets nät'],
        ['nyckelutbyte', 'IKE / ISAKMP', 'Fas 1: routrarna kommer överens och byter nycklar'], ['säkerhetsassociation', 'SA', 'Överenskommelsen för en tunnelriktning'], ['inkapslad säkerhetslast', 'ESP', 'IPsec-huvudet som krypterar paketet'],
        ['delad tunnel', 'split tunnel', 'Bara företagstrafiken går i tunneln'], ['största paketstorlek', 'MTU', '1500 byte på Ethernet, mindre i en tunnel'], ['största segment', 'MSS', 'TCP-data per paket = MTU − 40'],
        ['programstyrt WAN', 'SD-WAN', 'Flera förbindelser som styrs centralt efter regler'], ['lastbalanserare', 'load balancer', 'Fördelar förfrågningar mellan servrar'], ['hälsokontroll', 'health check', 'Testar om en server (tjänsten) lever'],
      ]);
    },
  };
})();
