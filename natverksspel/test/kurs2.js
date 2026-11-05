// Kurs 2 (Routing och switching), vecka 11–14: varje fel ska synas från start och försvinna med
// lösningen i ledtrådarna. Kontrollerar också OSPF- och BGP-utdata mot kursrepots facit.
const G = require('./load.js');
const S = G.sim;
let fails = 0;
function fail(m) { console.log('   FEL: ' + m); fails++; }
function ios(st, dev, cmds) {
  const s = new G.IosSession(st, dev, { privileged: true, via: 'console' });
  const outs = [];
  for (const c of cmds) {
    let r = s.handle(c);
    let out = (r.out || '') + (r.stream ? r.stream.map(x => x.text).join('') : '');
    while (s.pending) { r = s.handle(s.pending.default || 'y'); out += r.out || ''; }
    if (/Invalid|Incomplete|Ambiguous|already|not active/.test(out)) fail('CLI [' + dev + '] ' + c + '\n' + out);
    outs.push(out);
  }
  S.refresh(st);
  return outs.join('\n');
}
const SOL = {
  v11k1: st => ios(st, 'RM', ['conf t', 'no ip route 0.0.0.0 0.0.0.0 10.0.0.1', 'ip route 0.0.0.0 0.0.0.0 10.0.0.5', 'end', 'wr']),
  v11k2: st => ios(st, 'R1', ['conf t', 'no ip route 192.168.3.0 255.255.255.192 10.0.0.2', 'ip route 192.168.3.0 255.255.255.192 10.0.0.6', 'end', 'wr']),
  v11n1: st => {
    ios(st, 'RB', ['conf t', 'ip route 192.168.3.0 255.255.255.192 10.0.0.1', 'ip route 192.168.3.0 255.255.255.192 10.0.0.10 200', 'end', 'wr']);
    ios(st, 'RM', ['conf t', 'ip route 192.168.2.0 255.255.255.0 10.0.0.5', 'ip route 192.168.2.0 255.255.255.0 10.0.0.9 200', 'end', 'wr']);
  },
  v12k1: st => ios(st, 'RB', ['conf t', 'crypto isakmp policy 10', 'group 5', 'end', 'wr']),
  v12k2: st => ios(st, 'R1', ['conf t', 'ip access-list extended NAT-UT', 'no 10', '10 deny ip 192.168.1.0 0.0.0.63 192.168.2.0 0.0.0.63', 'end', 'clear ip nat translation *', 'wr']),
  v12n1: st => ios(st, 'R1', ['conf t', 'ip access-list extended MOLNDAL-IN', '10 deny ip 192.168.3.0 0.0.0.63 host 192.168.1.70', '20 permit ip any any', 'exit', 'interface se0/0/0', 'ip access-group MOLNDAL-IN in', 'end', 'wr']),
  v13k1: st => {
    ios(st, 'RB', ['conf t', 'router ospf 1', 'no network 10.0.0.0 0.0.0.3 area 1', 'network 10.0.0.0 0.0.0.3 area 0', 'no network 10.0.0.8 0.0.0.3 area 1', 'network 10.0.0.8 0.0.0.3 area 0', 'end', 'wr']);
    ios(st, 'RM', ['conf t', 'interface gi0/1', 'no ip ospf hello-interval', 'no ip ospf dead-interval', 'end', 'wr']);
  },
  v13k2: st => ios(st, 'R1', ['conf t', 'interface se0/0/0', 'no bandwidth', 'end', 'wr']),
  v13n1: st => ios(st, 'RM', ['conf t', 'interface loopback0', 'ip address 10.255.0.3 255.255.255.255', 'router ospf 1', 'network 10.255.0.3 0.0.0.0 area 0', 'end', 'wr']),
  v14k1: st => ios(st, 'R1', ['conf t', 'router bgp 65010', 'no neighbor 203.0.113.1 remote-as 64050', 'neighbor 203.0.113.1 remote-as 64500', 'end', 'wr']),
  v14k2: st => ios(st, 'R1', ['conf t', 'interface gi0/2', 'ip nat inside', 'end', 'wr']),
  v14n1: st => ios(st, 'R1', ['conf t', 'router bgp 65010', 'neighbor 198.51.100.1 remote-as 64501', 'exit', 'interface se0/0/1', 'ip nat outside', 'exit',
    'access-list 2 permit 192.168.1.0 0.0.0.255', 'access-list 2 permit 192.168.2.0 0.0.0.255', 'access-list 2 permit 192.168.3.0 0.0.0.63',
    'ip nat inside source list 2 interface serial0/0/1 overload', 'ip route 0.0.0.0 0.0.0.0 198.51.100.1 250', 'end', 'wr']),
};

const weeks = G.levels.WEEKS.filter(w => w.kurs === 2);
if (weeks.map(w => w.week).join(',') !== '11,12,13,14') fail('veckorna 11–14 saknas: ' + weeks.map(w => w.week));
for (const w of weeks) {
  const { state: st, def } = G.levels.start(w.week);
  console.log('Vecka ' + w.week + ' – ' + def.title);
  for (const t of def.tasks) {
    if (t.check(st)) fail(t.id + ' är löst från start');
    if (!t.hints || t.hints.length !== 3) fail(t.id + ' har inte tre ledtrådar');
    if (!t.report || t.report.cause.length !== 4 || t.report.fix.length !== 4) fail(t.id + ' saknar rapportval');
  }
  for (const t of def.tasks) {
    if (!SOL[t.id]) { fail('ingen lösning för ' + t.id); continue; }
    SOL[t.id](st);
    if (!t.check(st)) fail(t.id + ' är inte löst efter lösningen');
    else console.log('  OK  ' + t.id + ' ' + t.title);
  }
  // Efter alla lösningar ska alla tre kontoren nå filservern
  for (const h of ['PC-Anna', 'PC-Lager', 'PC-Molndal']) if (!S.ping(st, h, '192.168.1.10').ok) fail('vecka ' + w.week + ': ' + h + ' når inte filservern efter lösningarna');
}

// Utdata mot kursrepots facit (labb 03A och 03B)
{
  const st = G.levels.baseState(13);
  const nb = ios(st, 'RB', ['show ip ospf neighbor']);
  if (!/1\.1\.1\.1 .*FULL/.test(nb) || !/3\.3\.3\.3 .*FULL/.test(nb)) fail('show ip ospf neighbor på R-Boras-1:\n' + nb);
  const rt = ios(st, 'R1', ['show ip route ospf']);
  if (!/O\s+192\.168\.3\.0\/26 \[110\/3\] via 10\.0\.0\.2/.test(rt)) fail('show ip route ospf på R-Nordvik-1:\n' + rt);
  const br = ios(st, 'R1', ['show ip ospf interface brief']);
  if (!/Se0\/0\/0\s+1\s+0\s+10\.0\.0\.5\/30\s+64\s+P2P/.test(br)) fail('serielänken ska ha kostnad 64:\n' + br);
  ios(st, 'R1', ['conf t', 'interface gi0/2', 'shutdown', 'end']);
  const rt2 = ios(st, 'R1', ['show ip route ospf']);
  if (!/192\.168\.3\.0\/26 \[110\/65\] via 10\.0\.0\.6, [\d:]+, Serial0\/0\/0/.test(rt2)) fail('efter shutdown på Gi0/2 ska vägen gå på serielänken med metric 65:\n' + rt2);
  ios(st, 'R1', ['conf t', 'interface gi0/2', 'no shutdown', 'end']);
  const def = ios(st, 'RB', ['show ip route']);
  if (!/O\*E2\s+0\.0\.0\.0\/0 \[110\/1\] via 10\.0\.0\.1/.test(def)) fail('R-Boras-1 ska ha O*E2 0.0.0.0/0 via 10.0.0.1:\n' + def);
  const st14 = G.levels.baseState(14);
  const bgp = ios(st14, 'R1', ['show ip bgp']);
  if (!/198\.51\.100\.64\/27\s+203\.0\.113\.1\s+0 64500 64501 i/.test(bgp)) fail('show ip bgp ska visa 198.51.100.64/27 med vägen 64500 64501:\n' + bgp);
  ios(st14, 'R1', ['conf t', 'router bgp 65010', 'neighbor 198.51.100.1 remote-as 64501', 'end']);
  const bgp2 = ios(st14, 'R1', ['show ip bgp']);
  if (!/\*>\s+198\.51\.100\.64\/27\s+198\.51\.100\.1 .* 64501 i/.test(bgp2)) fail('med ISP-B ska vägen 64501 vara bäst:\n' + bgp2);
  const sum = ios(st14, 'R1', ['show ip bgp summary']);
  if (!/203\.0\.113\.1\s+4\s+64500/.test(sum)) fail('show ip bgp summary:\n' + sum);
  const run = ios(st14, 'R1', ['show running-config']);
  if (!/router ospf 1\n router-id 1\.1\.1\.1/.test(run) || !/router bgp 65010\n bgp router-id 1\.1\.1\.1/.test(run) || !/interface Serial0\/0\/0[\s\S]*clock rate 128000/.test(run)) fail('show running-config saknar router ospf, router bgp eller Serial0/0/0');
  // Fel AS ger en loggrad som i labbens felfil
  const st14b = G.levels.start(14).state;
  const lg = ios(st14b, 'R1', ['show logging']);
  if (!/%BGP-3-NOTIFICATION: sent to neighbor 203\.0\.113\.1/.test(lg)) fail('ingen %BGP-3-NOTIFICATION i loggen i vecka 14');
  const st13 = G.levels.start(13).state;
  const lg13 = ios(st13, 'R1', ['show logging']);
  if (!/%OSPF-4-ERRRCV: Received invalid packet: mismatched area ID/.test(lg13)) fail('ingen mismatched area ID i loggen i vecka 13');
}
console.log(fails ? fails + ' fel' : 'Alla kurs 2-veckor OK');
process.exit(fails ? 1 : 0);
