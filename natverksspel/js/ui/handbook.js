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
      ]) + '<h3>Laptopen (Linux)</h3>' + table(['Kommando', 'Vad det gör'], [
        [c('sudo screen /dev/ttyUSB0 9600'), 'Konsol mot enheten där den ljusblå kabeln sitter'],
        [c('ssh drift@192.168.1.193'), 'Logga in över nätet'],
        [c('ip -4 addr show') + ', ' + c('ip route show default') + ', ' + c('ip -4 neigh show'), 'Laptopens egna inställningar'],
        [c('ping -c 4 192.168.1.10') + ', ' + c('resolvectl query filserver'), 'Testa nät och DNS'],
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
      ]) + '<h3>Racket</h3>' + table(['Enhet', 'Portar'], [
        ['R-Nordvik-1 (2951)', 'Gi0/0 trunk mot SW-Nordvik-1 Gi0/1 · Gi0/1 ut · Gi0/2 Borås'],
        ['SW-Nordvik-1 (3560G)', 'Gi0/5–6 kontor · Gi0/7–8 ekonomi · Gi0/9 gäst · Gi0/10 teknikerbänken · Gi0/11 skrivare · Gi0/12 Sara · Gi0/20 WLC · Gi0/24 trunk · Gi0/25 reservlänk'],
        ['SW-Nordvik-2 (3750G)', 'Gi0/2 filserver · Gi0/3 NTP · Gi0/4 logg · Gi0/5 Lisa · Gi0/8 ekonomisystem · Gi0/24–25 trunkar'],
        ['SW-Boras-1 (3560G)', 'Gi0/1–3 accesspunkter (PoE, trunk) · Gi0/5 lagerdatorn · Gi0/24 trunk mot R-Boras-1'],
      ]);
    },
    keys: function () {
      return table(['Tangent', 'Gör'], [
        ['W A S D / piltangenter', 'Gå (Shift = spring)'], ['Mus', 'Titta'], ['E eller klick', 'Använd det du tittar på'],
        ['T', 'Öppna laptopen'], ['F', 'Skriv felrapport för ett löst ärende'], ['L', 'Ledtråd'], ['H', 'Handboken'], ['Tab', 'Ärendelistan'], ['Esc', 'Släpp musen / stäng fönster'],
      ]) + '<h3>I terminalen</h3>' + table(['Tangent', 'Gör'], [
        ['?', 'Hjälp direkt (IOS)'], ['Tab', 'Fyll i kommandot'], ['↑ ↓', 'Tidigare kommandon'], ['Ctrl+C', 'Avbryt ping och liknande'],
        ['Ctrl+Z', 'Hoppa till # från konfigurationsläge'], ['Ctrl+A K', 'Stäng konsolen (screen)'], ['Esc', 'Stäng terminalfönstret'],
      ]) + '<p class="muted">Tips: gå fram till en enhet i racket och tryck E för att sätta i konsolkabeln. Laptopen öppnas då med rätt kommando förifyllt.</p>';
    },
  };
})();
