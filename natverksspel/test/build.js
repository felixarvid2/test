// Bygg från grunden: varje uppgift ska vara olöst från start och lösas med CLI-kommandon som i boken.
const G = require('./load.js');
const S = G.sim;
let fails = 0;
function ios(st, dev, cmds) {
  const s = new G.IosSession(st, dev, { privileged: true, via: 'console' });
  for (const c of cmds) {
    let r = s.handle(c);
    let out = (r.out || '') + (r.stream ? r.stream.map(x => x.text).join('') : '');
    while (s.pending) { r = s.handle(''); out += r.out || ''; }
    if (/Invalid|Incomplete|Ambiguous|rejected|Bad mask|overlaps|ERROR/.test(out)) { console.log('   CLI-FEL [' + dev + '] ' + c + '\n' + out); fails++; }
  }
  S.refresh(st);
}
const SSH = ['ip domain-name nordvik.example', 'crypto key generate rsa modulus 2048', 'ip ssh version 2', 'username drift privilege 15 secret Krabba2026', 'line vty 0 15', 'transport input ssh', 'login local', 'exit'];
const trunk = (r, extra) => ['interface ' + r, 'switchport trunk encapsulation dot1q', 'switchport mode trunk'].concat(extra || []).concat(['exit']);
const SOL = {
  b1a: st => ios(st, 'SW1', ['conf t', 'hostname SW-Nordvik-1', 'enable secret Krabba2026', 'line con 0', 'logging synchronous', 'end', 'write memory']),
  b1b: st => ios(st, 'SW1', ['conf t', 'vlan 10', 'name KONTOR', 'vlan 20', 'name EKONOMI', 'vlan 30', 'name GAST', 'vlan 99', 'name DRIFT', 'end']),
  b1c: st => ios(st, 'SW1', ['conf t', 'interface range gi0/5 - 6', 'switchport mode access', 'switchport access vlan 10', 'spanning-tree portfast', 'interface range gi0/11 - 12', 'switchport mode access', 'switchport access vlan 10',
    'interface range gi0/7 - 8', 'switchport mode access', 'switchport access vlan 20', 'interface gi0/9', 'switchport mode access', 'switchport access vlan 30', 'interface gi0/10', 'switchport mode access', 'switchport access vlan 99', 'interface gi0/20', 'switchport mode access', 'switchport access vlan 99', 'end']),
  b1d: st => ios(st, 'SW1', ['conf t'].concat(trunk('gi0/1', ['switchport trunk native vlan 999', 'switchport trunk allowed vlan 10,20,30,99', 'switchport nonegotiate'])).concat(trunk('range gi0/24 - 25', ['switchport trunk native vlan 999', 'switchport trunk allowed vlan 10,20,30,99', 'switchport nonegotiate'])).concat(['end'])),
  b1e: st => ios(st, 'SW1', ['conf t', 'interface vlan 99', 'ip address 192.168.1.194 255.255.255.192', 'no shutdown', 'exit', 'ip default-gateway 192.168.1.193'].concat(SSH).concat(['end', 'wr'])),
  b2a: st => ios(st, 'R1', ['conf t', 'interface gi0/0', 'no shutdown', 'interface gi0/0.10', 'encapsulation dot1Q 10', 'ip address 192.168.1.1 255.255.255.192', 'interface gi0/0.20', 'encapsulation dot1Q 20', 'ip address 192.168.1.65 255.255.255.192',
    'interface gi0/0.30', 'encapsulation dot1Q 30', 'ip address 192.168.1.129 255.255.255.192', 'interface gi0/0.99', 'encapsulation dot1Q 99', 'ip address 192.168.1.193 255.255.255.192', 'end']),
  b2b: st => ios(st, 'R1', ['conf t', 'ip dhcp excluded-address 192.168.1.1 192.168.1.19', 'ip dhcp excluded-address 192.168.1.65 192.168.1.79', 'ip dhcp excluded-address 192.168.1.129 192.168.1.139',
    'ip dhcp pool KONTOR', 'network 192.168.1.0 255.255.255.192', 'default-router 192.168.1.1', 'dns-server 192.168.1.1', 'ip dhcp pool EKONOMI', 'network 192.168.1.64 255.255.255.192', 'default-router 192.168.1.65', 'dns-server 192.168.1.65',
    'ip dhcp pool GAST', 'network 192.168.1.128 255.255.255.192', 'default-router 192.168.1.129', 'dns-server 9.9.9.9', 'end']),
  b2c: st => ios(st, 'R1', ['conf t', 'ip dns server', 'ip host filserver 192.168.1.10', 'ip name-server 9.9.9.9', 'end']),
  b2d: st => ios(st, 'R1', ['conf t', 'interface gi0/1', 'ip address 203.0.113.10 255.255.255.0', 'ip nat outside', 'no shutdown', 'interface gi0/0.10', 'ip nat inside', 'interface gi0/0.20', 'ip nat inside', 'interface gi0/0.30', 'ip nat inside', 'interface gi0/0.99', 'ip nat inside', 'exit',
    'ip route 0.0.0.0 0.0.0.0 203.0.113.1', 'access-list 1 permit 192.168.1.0 0.0.0.255', 'ip nat inside source list 1 interface gi0/1 overload', 'ip nat inside source static 192.168.1.10 203.0.113.11', 'end']),
  b2e: st => ios(st, 'R1', ['conf t', 'interface gi0/2', 'ip address 10.0.0.1 255.255.255.252', 'ip nat inside', 'no shutdown', 'exit', 'ip route 192.168.2.0 255.255.255.0 10.0.0.2', 'access-list 1 permit 192.168.2.0 0.0.0.255', 'end']),
  b2f: st => ios(st, 'R1', ['conf t', 'hostname R-Nordvik-1', 'enable secret Krabba2026'].concat(SSH).concat(['end', 'wr'])),
  b3a: st => ios(st, 'SWB', ['conf t', 'hostname SW-Boras-1', 'vlan 40', 'name LAGER', 'vlan 50', 'name TRADLOST-GAST', 'vlan 99', 'name DRIFT', 'exit', 'interface gi0/5', 'switchport mode access', 'switchport access vlan 40', 'spanning-tree portfast', 'end']),
  b3b: st => ios(st, 'SWB', ['conf t'].concat(trunk('range gi0/1 - 3', ['switchport trunk native vlan 99', 'switchport trunk allowed vlan 40,50,99'])).concat(trunk('gi0/24', ['switchport trunk native vlan 999', 'switchport trunk allowed vlan 40,50,99'])).concat(['end'])),
  b3c: st => ios(st, 'RB', ['conf t', 'interface gi0/0', 'no shutdown', 'interface gi0/0.40', 'encapsulation dot1Q 40', 'ip address 192.168.2.1 255.255.255.192', 'interface gi0/0.50', 'encapsulation dot1Q 50', 'ip address 192.168.2.65 255.255.255.192',
    'interface gi0/0.99', 'encapsulation dot1Q 99', 'ip address 192.168.2.193 255.255.255.192', 'interface gi0/2', 'ip address 10.0.0.2 255.255.255.252', 'no shutdown', 'exit', 'ip route 0.0.0.0 0.0.0.0 10.0.0.1', 'end']),
  b3d: st => ios(st, 'RB', ['conf t', 'ip dhcp excluded-address 192.168.2.1 192.168.2.19', 'ip dhcp excluded-address 192.168.2.65 192.168.2.69', 'ip dhcp pool LAGER', 'network 192.168.2.0 255.255.255.192', 'default-router 192.168.2.1', 'dns-server 9.9.9.9',
    'ip dhcp pool TRADLOST-GAST', 'network 192.168.2.64 255.255.255.192', 'default-router 192.168.2.65', 'dns-server 9.9.9.9', 'end']),
  b3e: st => { S.touch(st); S.refresh(st); },
  b3f: st => ios(st, 'RB', ['conf t', 'ip access-list extended GAST-B', 'deny ip 192.168.2.64 0.0.0.63 192.168.0.0 0.0.255.255', 'permit ip any any', 'exit', 'interface gi0/0.50', 'ip access-group GAST-B in', 'end']),
  b4a: st => ios(st, 'R1', ['conf t', 'ip access-list extended GAST', 'deny ip 192.168.1.128 0.0.0.63 192.168.1.0 0.0.0.255', 'deny ip 192.168.1.128 0.0.0.63 192.168.2.0 0.0.0.255', 'permit ip any any', 'exit', 'interface gi0/0.30', 'ip access-group GAST in', 'end']),
  b4b: st => ios(st, 'R1', ['conf t', 'ip access-list extended KONTOR-UT', 'deny ip 192.168.1.0 0.0.0.63 192.168.1.64 0.0.0.63', 'permit ip any any', 'exit', 'interface gi0/0.10', 'ip access-group KONTOR-UT in', 'end']),
  b4c: st => ios(st, 'SW1', ['conf t', 'interface gi0/9', 'switchport port-security', 'switchport port-security maximum 1', 'switchport port-security mac-address sticky', 'switchport port-security violation shutdown', 'end']),
  b4d: st => ['R1', 'SW1', 'SW2'].forEach(d => ios(st, d, ['conf t', 'ntp server 192.168.1.16', 'end'])),
  b4e: st => ['R1', 'SW1', 'SW2'].forEach(d => ios(st, d, ['conf t', 'logging host 192.168.1.17', 'service timestamps log datetime msec', 'end'])),
  b5a: st => {
    const pol = ['crypto isakmp policy 10', 'encryption aes 256', 'hash sha256', 'authentication pre-share', 'group 14', 'exit'];
    ios(st, 'R1', ['conf t'].concat(pol).concat(['crypto isakmp key Nordvik-VPN-2026 address 203.0.113.20', 'end']));
    ios(st, 'RB', ['conf t'].concat(pol).concat(['crypto isakmp key Nordvik-VPN-2026 address 203.0.113.10', 'end']));
  },
  b5b: st => {
    ios(st, 'R1', ['conf t', 'crypto ipsec transform-set NORDVIK-TS esp-aes 256 esp-sha256-hmac', 'mode tunnel', 'exit', 'ip access-list extended VPN-TRAFIK', 'permit ip 192.168.1.0 0.0.0.63 192.168.2.0 0.0.0.63', 'permit ip 192.168.1.192 0.0.0.63 192.168.2.192 0.0.0.63', 'end']);
    ios(st, 'RB', ['conf t', 'crypto ipsec transform-set NORDVIK-TS esp-aes 256 esp-sha256-hmac', 'mode tunnel', 'exit', 'ip access-list extended VPN-TRAFIK', 'permit ip 192.168.2.0 0.0.0.63 192.168.1.0 0.0.0.63', 'permit ip 192.168.2.192 0.0.0.63 192.168.1.192 0.0.0.63', 'end']);
  },
  b5c: st => {
    ios(st, 'R1', ['conf t', 'crypto map VPN-MAP 10 ipsec-isakmp', 'set peer 203.0.113.20', 'set transform-set NORDVIK-TS', 'match address VPN-TRAFIK', 'exit', 'interface gi0/1', 'crypto map VPN-MAP', 'exit', 'ip access-list extended NAT-UT', '5 deny ip 192.168.1.0 0.0.0.63 192.168.2.0 0.0.0.63', 'end']);
    ios(st, 'RB', ['conf t', 'crypto map VPN-MAP 10 ipsec-isakmp', 'set peer 203.0.113.10', 'set transform-set NORDVIK-TS', 'match address VPN-TRAFIK', 'exit', 'interface gi0/1', 'crypto map VPN-MAP', 'exit', 'ip access-list extended NAT-UT', '5 deny ip 192.168.2.0 0.0.0.63 192.168.1.0 0.0.0.63', 'end']);
  },
  b5d: st => {
    ios(st, 'R1', ['conf t', 'ip access-list extended NAT-UT', '6 deny ip 192.168.1.192 0.0.0.63 192.168.2.192 0.0.0.63', 'end']);
    ios(st, 'RB', ['conf t', 'ip access-list extended NAT-UT', '6 deny ip 192.168.2.192 0.0.0.63 192.168.1.192 0.0.0.63', 'end']);
  },
  b5e: st => ios(st, 'RB', ['conf t', 'interface gi0/1', 'ip tcp adjust-mss 1360', 'end']),
};
for (const b of G.levels.BUILDS) {
  const { state: st, def } = G.levels.start(b.week);
  console.log('Bygge ' + b.build + ': ' + b.title);
  for (const t of def.tasks) if (t.check(st, {})) { console.log('  FEL: ' + t.id + ' är redan löst från start'); fails++; }
  for (const t of def.tasks) {
    SOL[t.id](st);
    for (let i = 0; i < 2; i++) S.tick(st, 1);
    const ok = t.check(st, {});
    console.log('  ' + (ok ? 'OK  ' : 'FEL ') + t.id + ' ' + t.title);
    if (!ok) fails++;
  }
}
console.log(fails ? fails + ' fel' : 'Alla byggen OK');
process.exit(fails ? 1 : 0);
