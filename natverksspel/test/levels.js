// Kör varje vecka: kontrollerna ska vara falska från start och sanna efter lösningen.
const G = require('./load.js');
const S = G.sim;
let fails = 0;
function sess(st, dev, via) { return new G.IosSession(st, dev, { privileged: true, via: via || 'console' }); }
function ios(st, dev, cmds) {
  const s = sess(st, dev);
  const outs = [];
  for (const c of cmds) {
    let r = s.handle(c);
    let out = (r.out || '') + (r.stream ? r.stream.map(x => x.text).join('') : '');
    while (s.pending) { const p = s.pending; r = s.handle(p.default || ''); out += r.out || ''; }
    if (/Invalid|Incomplete|Ambiguous|rejected|Bad mask|overlaps/.test(out)) { console.log('   CLI-FEL [' + dev + '] ' + c + '\n' + out); fails++; }
    outs.push(out);
  }
  S.refresh(st);
  return outs;
}
function tick(st, n) { for (let i = 0; i < (n || 5); i++) S.tick(st, 1); }
function renew(st, h) { S.dhcp(st, h); S.refresh(st); }
const flags = {};
const SOL = {
  v1k1: st => ios(st, 'SW1', ['conf t', 'line con 0', 'speed 9600', 'end', 'write memory']),
  v1k2: st => { ios(st, 'SW1', ['conf t', 'int gi0/5', 'no shut', 'end', 'wr']); renew(st, 'PC-Anna'); },
  v1n1: st => ios(st, 'SW2', ['conf t', 'hostname SW-Nordvik-2', 'end', 'copy running-config startup-config']),
  v2k1: st => { st.links.filter(l => l.b.dev === 'PC-Karim')[0].state = 'ok'; S.touch(st); renew(st, 'PC-Karim'); },
  v2k2: st => ios(st, 'SW2', ['conf t', 'int gi0/24', 'speed auto', 'duplex auto', 'end', 'wr']),
  v2n1: st => { ios(st, 'SW1', ['conf t', 'int gi0/7', 'sw acc vlan 20', 'end', 'wr']); renew(st, 'PC-Bo'); },
  v3k1: st => { G.applyIpv4(st, 'PC-Anna', { dhcp: false, ip: '192.168.1.19', mask: '255.255.255.192', gw: '192.168.1.1', dns: '192.168.1.1' }); S.refresh(st); },
  v3k2: st => { ios(st, 'R1', ['conf t', 'ip dhcp pool KONTOR', 'network 192.168.1.0 255.255.255.192', 'end', 'wr']); renew(st, 'PC-Karim'); },
  v3n1: st => { ios(st, 'R1', ['conf t', 'ip dhcp pool EKONOMI', 'dns-server 192.168.1.65', 'end']); renew(st, 'PC-Maja'); },
  v4k1: st => ios(st, 'SW1', ['conf t', 'interface range gi0/24 - 25', 'switchport trunk allowed vlan add 20', 'end']),
  v4k2: st => ios(st, 'SW2', ['conf t', 'int range gi0/24-25', 'sw trunk native vlan 999', 'end']),
  v4n1: st => { flags.stpLooked = true; },
  v5k1: st => ios(st, 'RB', ['conf t', 'ip route 0.0.0.0 0.0.0.0 10.0.0.1', 'end']),
  v5k2: st => ios(st, 'R1', ['conf t', 'no ip route 0.0.0.0 0.0.0.0 203.0.113.9', 'ip route 0.0.0.0 0.0.0.0 203.0.113.1', 'end']),
  v5n1: st => ios(st, 'R1', ['conf t', 'int gi0/0.20', 'encapsulation dot1Q 20', 'end']),
  v6k1: st => ios(st, 'R1', ['conf t', 'int g0/0.10', 'ip nat inside', 'end']),
  v6k2: st => ios(st, 'R1', ['conf t', 'ip domain-name nordvik.example', 'crypto key generate rsa modulus 2048', 'end']),
  v6n1: st => ios(st, 'R1', ['conf t', 'line vty 5 15', 'transport input ssh', 'end']),
  v7k1: st => { ios(st, 'SW1', ['conf t', 'spanning-tree vlan 10', 'end']); ios(st, 'SW2', ['conf t', 'spanning-tree vlan 10', 'end']); },
  v7k2: st => { st.links.filter(l => l.b.dev === 'PC-Karim')[0].state = 'ok'; S.touch(st); },
  v7n1: st => ios(st, 'SW2', ['conf t', 'ntp server 192.168.1.16', 'end']),
  v8k1: st => ios(st, 'SWB', ['conf t', 'int gi0/1', 'power inline auto', 'end']),
  v8k2: st => { const w = new G.WlcSession(st, 'WLC'); w.handle('admin'); w.handle('x'); ['config wlan disable 2', 'config wlan interface 2 gast', 'config wlan enable 2'].forEach(c => { const r = w.handle(c); if (r.out.trim()) { console.log('   WLC:', c, r.out); } }); S.touch(st); renew(st, 'Gast-mobil'); },
  v8n1: st => { const w = new G.WlcSession(st, 'WLC'); w.handle('admin'); w.handle('x'); w.handle('config 802.11b channel ap AP-Lager-3 11'); S.touch(st); },
  v9k1: st => ios(st, 'R1', ['conf t', 'int gi0/0.10', 'no ip access-group KONTOR-UT out', 'ip access-group KONTOR-UT in', 'end']),
  v9k2: st => ios(st, 'R1', ['conf t', 'ip access-list extended GAST', 'permit ip any any', 'end']),
  v9n1: st => { G.levels.removeMiniSwitch(st); S.refresh(st); ios(st, 'SW1', ['conf t', 'int gi0/9', 'shutdown', 'no shutdown', 'end']); renew(st, 'Gast-laptop'); },
};
for (const w of G.levels.WEEKS) {
  const { state: st, def } = G.levels.start(w.week);
  Object.keys(flags).forEach(k => delete flags[k]);
  tick(st, 3);
  console.log('Vecka ' + w.week + ': ' + w.title);
  for (const t of def.tasks) {
    const before = t.check(st, flags);
    if (before) { console.log('  FEL: ' + t.id + ' är redan löst från start'); fails++; }
  }
  for (const t of def.tasks) {
    SOL[t.id](st);
    tick(st, 2);
    const after = t.check(st, flags);
    console.log('  ' + (after ? 'OK  ' : 'FEL ') + t.id + ' ' + t.title);
    if (!after) fails++;
  }
}
console.log(fails ? fails + ' fel' : 'Alla veckor OK');
process.exit(fails ? 1 : 0);
