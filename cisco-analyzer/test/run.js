// Unit tests: node test/run.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
['net', 'parser', 'topology', 'checks', 'playbooks', 'assistant', 'samples'].forEach(f => require(path.join(__dirname, '..', 'js', f + '.js')));
const CCA = globalThis.CCA;
const N = CCA.net;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}
const load = names => names.map(n => CCA.parser.parseDevice(fs.readFileSync(path.join(__dirname, '..', 'samples', n + '.txt'), 'utf8'), n + '.txt'));
const ids = r => r.findings.map(f => f.id);

console.log('net');
test('mask / wildcard helpers', () => {
  assert.strictEqual(N.maskToPrefix('255.255.255.0'), 24);
  assert.strictEqual(N.maskToPrefix('255.0.255.0'), -1);
  assert.ok(N.wildcardMatch('10.1.2.3', '10.1.0.0', '0.0.255.255'));
  assert.ok(!N.wildcardMatch('10.2.2.3', '10.1.0.0', '0.0.255.255'));
  assert.ok(!N.isHostAddress('192.168.1.0', '255.255.255.0'));
  assert.ok(N.isHostAddress('10.0.0.1', '255.255.255.254'));
});
test('interface names', () => {
  assert.strictEqual(N.normalizeIfName('gi0/1'), 'GigabitEthernet0/1');
  assert.strictEqual(N.normalizeIfName('Fa0/24'), 'FastEthernet0/24');
  assert.strictEqual(N.normalizeIfName('g0/0.10'), 'GigabitEthernet0/0.10');
  assert.strictEqual(N.normalizeIfName('Po1'), 'Port-channel1');
  assert.deepStrictEqual(N.findIfNames('port gi0/1 and Fa0/3 are down'), ['GigabitEthernet0/1', 'FastEthernet0/3']);
});

console.log('parser');
test('splits several pasted configs', () => {
  const all = ['R1', 'R2', 'SW1'].map(n => fs.readFileSync(path.join(__dirname, '..', 'samples', n + '.txt'), 'utf8')).join('\n');
  assert.strictEqual(CCA.parser.splitConfigs(all).length, 3);
});
test('parses the sample router', () => {
  const [r1] = load(['R1']);
  assert.strictEqual(r1.hostname, 'R1');
  assert.strictEqual(r1.type, 'router');
  assert.strictEqual(r1.interfaces['GigabitEthernet0/0.30'].encapsulation.vlan, 3);
  assert.strictEqual(r1.ospf[0].networks.length, 3);
  assert.strictEqual(r1.acls['GUEST-IN'].entries.length, 3);
  assert.strictEqual(r1.dhcpPools.VLAN20.defaultRouter[0], '192.168.2.1');
});
test('parses the sample switch', () => {
  const [sw] = load(['SW1']);
  assert.strictEqual(sw.type, 'switch');
  assert.ok(!sw.ipRouting);
  const gi = sw.interfaces['GigabitEthernet0/1'];
  assert.strictEqual(gi.mode, 'trunk');
  assert.deepStrictEqual([...gi.switchport.trunkAllowed], [10, 99]);
  assert.strictEqual(sw.interfaces['FastEthernet0/7'].mode, 'dynamic auto');
});
test('banners and trunk allowed add/remove', () => {
  const d = CCA.parser.parseDevice('hostname X\nbanner motd #\nline1\n interface fake\n#\ninterface GigabitEthernet0/1\n switchport mode trunk\n switchport trunk allowed vlan 10,20\n switchport trunk allowed vlan add 30-31\n switchport trunk allowed vlan remove 20\n!\nend');
  assert.strictEqual(d.banners[0].text.includes('line1'), true);
  assert.deepStrictEqual([...d.interfaces['GigabitEthernet0/1'].switchport.trunkAllowed].sort((a, b) => a - b), [10, 30, 31]);
  assert.strictEqual(d.interfaceOrder.length, 1);
});

console.log('checks (example lab)');
const lab = CCA.checks.analyze(load(['R1', 'R2', 'SW1']));
const expected = ['ospf-mask-as-wildcard', 'nat-acl-missing-subnet', 'dhcp-gateway-wrong-subnet', 'ospf-adj-area', 'static-nexthop-unreachable',
  'vlan-missing', 'sw-gateway-wrong-subnet', 'ros-vlan-not-allowed', 'ros-native-mismatch', 'if-subif-vlan-number', 'acl-shadowed', 'if-half-duplex', 'sec-telnet', 'sec-enable-password'];
for (const id of expected) test('finds ' + id, () => assert.ok(ids(lab).includes(id), 'missing ' + id));
test('every finding has a fix or verification', () => {
  for (const f of lab.findings) assert.ok(f.verify.length, f.id + ' has no verify steps');
});

console.log('checks (single rules)');
const one = txt => CCA.checks.analyze([CCA.parser.parseDevice(txt)]);
test('ACL with only deny', () => assert.ok(ids(one('hostname A\naccess-list 10 deny 10.0.0.0 0.255.255.255\ninterface Gi0/0\n ip address 10.1.1.1 255.255.255.0\n ip access-group 10 in\n!\nend')).includes('acl-only-deny')));
test('undefined ACL applied', () => assert.ok(ids(one('hostname A\ninterface Gi0/0\n ip address 10.1.1.1 255.255.255.0\n ip access-group 199 in\n!\nend')).includes('acl-undefined')));
test('login local without users', () => assert.ok(ids(one('hostname A\nline vty 0 4\n login local\n transport input ssh\n!\nend')).includes('sec-login-local-no-user')));
test('static next hop is own address', () => assert.ok(ids(one('hostname A\ninterface Gi0/0\n ip address 10.1.1.1 255.255.255.0\n!\nip route 0.0.0.0 0.0.0.0 10.1.1.1\nend')).includes('static-nexthop-self')));
test('L3 switch with SVIs but no ip routing', () => assert.ok(ids(one('hostname S\nvlan 10\nvlan 20\ninterface Vlan10\n ip address 10.10.0.1 255.255.255.0\ninterface Vlan20\n ip address 10.20.0.1 255.255.255.0\ninterface Gi0/1\n switchport mode access\n switchport access vlan 10\nend')).includes('sw-no-ip-routing')));
test('ACL blocking OSPF on a transit link', () => {
  const a = CCA.parser.parseDevice('hostname A\ninterface Gi0/0\n ip address 10.0.0.1 255.255.255.252\n ip access-group 100 in\n!\naccess-list 100 permit tcp any any eq 80\nrouter ospf 1\n network 10.0.0.0 0.0.0.3 area 0\nend');
  const b = CCA.parser.parseDevice('hostname B\ninterface Gi0/0\n ip address 10.0.0.2 255.255.255.252\n!\nrouter ospf 1\n network 10.0.0.0 0.0.0.3 area 0\nend');
  assert.ok(ids(CCA.checks.analyze([a, b])).includes('acl-blocks-ospf'));
});
test('mask mismatch, EIGRP AS mismatch and trunk native mismatch between devices', () => {
  const a = CCA.parser.parseDevice('hostname A\ninterface Gi0/0\n description to B Gi0/0\n ip address 10.0.0.1 255.255.255.0\nrouter eigrp 10\n network 10.0.0.0 0.0.0.255\nend');
  const b = CCA.parser.parseDevice('hostname B\ninterface Gi0/0\n description to A Gi0/0\n ip address 10.0.0.2 255.255.255.0\nrouter eigrp 20\n network 10.0.0.0 0.0.0.255\nend');
  const c = CCA.parser.parseDevice('hostname C\ninterface Gi0/0\n ip address 10.0.0.3 255.255.255.128\nend');
  const s1 = CCA.parser.parseDevice('hostname S1\ninterface Gi0/1\n description uplink to S2 Gi0/1\n switchport mode trunk\n switchport trunk native vlan 99\nend');
  const s2 = CCA.parser.parseDevice('hostname S2\ninterface Gi0/1\n description uplink to S1 Gi0/1\n switchport mode trunk\nend');
  const r = ids(CCA.checks.analyze([a, b, c, s1, s2]));
  assert.ok(r.includes('eigrp-adj-asn'), 'eigrp asn');
  assert.ok(r.includes('link-mask-mismatch'), 'mask');
  assert.ok(r.includes('link-native-mismatch'), 'native');
});
test('clean config has no critical findings', () => {
  const r = one('hostname EDGE\nenable secret 9 $9$x\nservice password-encryption\nusername admin privilege 15 secret 9 $9$y\nip domain-name ex.com\nip ssh version 2\ninterface Gi0/0\n ip address 10.1.1.1 255.255.255.0\n!\nline vty 0 4\n login local\n transport input ssh\n access-class 5 in\naccess-list 5 permit 10.1.1.0 0.0.0.255\nend');
  assert.deepStrictEqual(r.findings.filter(f => f.sev === 'critical').map(f => f.id), []);
});

console.log('topology / path');
test('ACL evaluation', () => {
  const acl = { type: 'extended', entries: [CCA.parser.parseAce('permit tcp 10.0.0.0 0.0.0.255 any eq www', 'extended', 1)] };
  assert.strictEqual(CCA.topology.evaluateAcl(acl, { proto: 'tcp', src: '10.0.0.5', dst: '1.1.1.1', dstPort: 80 }).action, 'permit');
  assert.strictEqual(CCA.topology.evaluateAcl(acl, { proto: 'tcp', src: '10.0.0.5', dst: '1.1.1.1', dstPort: 443 }).action, 'deny');
});
test('guest VLAN is blocked from staff VLAN by GUEST-IN', () => {
  const c = CCA.topology.conversation(lab.model, '192.168.20.5', '192.168.10.5', { proto: 'icmp' });
  assert.strictEqual(c.fwd.status, 'dropped');
  assert.ok(/GUEST-IN/.test(c.fwd.reason));
});
test('VLAN 10 to server LAN fails because OSPF is down', () => {
  const c = CCA.topology.conversation(lab.model, '192.168.10.50', '172.16.2.10', { proto: 'icmp' });
  assert.ok(c.fwd.missingSpecific, 'should note the missing specific route');
});

console.log('assistant');
const ask = q => CCA.assistant.assist(lab, q);
test('DHCP question points at the trunk and the pool', () => {
  const r = ask("PCs in VLAN 20 don't get an IP address from DHCP");
  assert.strictEqual(r.topics[0].pb.id, 'dhcp');
  assert.strictEqual(r.relevant[0].f.id, 'ros-vlan-not-allowed');
  assert.ok(r.relevant.some(x => x.f.id === 'dhcp-gateway-wrong-subnet'));
});
test('Internet question for VLAN 30 finds the NAT ACL', () => {
  const r = ask('The printers in VLAN 30 cannot reach the internet');
  assert.ok(r.relevant.slice(0, 3).some(x => x.f.id === 'nat-acl-missing-subnet'));
});
test('OSPF question finds the area mismatch', () => {
  const r = ask('OSPF neighbor between R1 and R2 is not coming up');
  assert.strictEqual(r.topics[0].pb.id, 'ospf');
  assert.ok(r.relevant.slice(0, 3).some(x => x.f.id === 'ospf-adj-area'));
});
test('SSH question finds the wrong default gateway', () => {
  const r = ask("I can't SSH to SW1 from 192.168.10.20");
  assert.strictEqual(r.relevant[0].f.id, 'sw-gateway-wrong-subnet');
  assert.ok(r.path && r.path.ret.status === 'dropped');
});
test('works without any configs loaded', () => {
  const r = CCA.assistant.assist({ model: CCA.topology.build([]), findings: [] }, 'the network is slow');
  assert.strictEqual(r.topics[0].pb.id, 'performance');
  assert.ok(r.diagnose.length && r.verify.length);
});
test('samples.js is in sync with samples/*.txt', () => {
  for (const s of CCA.samples) assert.strictEqual(s.text, fs.readFileSync(path.join(__dirname, '..', 'samples', s.name), 'utf8'), s.name);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
