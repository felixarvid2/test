// Additional rules: AAA, references to undefined objects, DHCP snooping/DAI, spanning tree,
// tunnels, IPv6, serial links, NAT/DHCP sanity, static-route loops and management hygiene.
(function (root) {
  const CCA = root.CCA = root.CCA || {};
  const N = CCA.net;
  const T = CCA.topology;
  const cfgIf = (ifc, ...cmds) => ['interface ' + ifc.name, ...cmds.map(c => ' ' + c)];
  const ifs = dev => dev.interfaceOrder.map(n => dev.interfaces[n]);
  const inv = m => N.intToIp(~N.ipToInt(m) >>> 0);

  function device(dev, add, model) {
    const h = dev.hostname;
    const sw = dev.type !== 'router';

    if (dev.platform !== 'ios') add({ id: 'platform-unsupported', sev: 'warning', cat: 'Management', dev, tags: ['platform'],
      title: 'This looks like ' + (dev.platform === 'asa' ? 'a Cisco ASA' : 'an NX-OS') + ' configuration', detail: 'The analyzer understands Cisco IOS / IOS-XE syntax. Results for this device are incomplete and some findings may be wrong.',
      fix: [], verify: ['show version'] });

    // ---- AAA
    for (const k of ['vty', 'con']) for (const l of dev.term[k]) {
      if (l.login && l.login.startsWith('aaa:')) {
        const list = l.login.slice(4);
        if (!dev.aaaNewModel) add({ id: 'aaa-list-no-newmodel', sev: 'warning', cat: 'Security', dev, line: l.line, tags: ['aaa', 'login', 'ssh', 'telnet', 'remote access'],
          title: 'line ' + k + ' uses "login authentication ' + list + '" but "aaa new-model" is not enabled', detail: 'The method list is ignored until AAA is enabled.',
          fix: ['aaa new-model', 'aaa authentication login ' + list + ' local'], verify: ['show running-config | include aaa'] });
        else if (list !== 'default' && !dev.aaaLists.login[list]) add({ id: 'aaa-list-missing', sev: 'critical', cat: 'Security', dev, line: l.line, tags: ['aaa', 'login', 'ssh', 'telnet', 'remote access', 'vty'],
          title: 'line ' + k + ' ' + l.from + ' ' + l.to + ' uses AAA login list "' + list + '", which is not defined', detail: 'IOS falls back to no working method: logins on these lines fail.',
          fix: ['aaa authentication login ' + list + ' local'], verify: ['show running-config | include aaa authentication', 'test aaa group … / try to log in'] });
      }
    }
    if (dev.aaaNewModel && !dev.aaaLists.login.default && !dev.users.length && !dev.term.vty.some(l => l.login && l.login.startsWith('aaa:') && dev.aaaLists.login[l.login.slice(4)]))
      add({ id: 'aaa-lockout', sev: 'critical', cat: 'Security', dev, tags: ['aaa', 'login', 'ssh', 'telnet', 'remote access', 'console'],
        title: '"aaa new-model" without a login method list and without local users', detail: 'With AAA enabled and no list, IOS authenticates against the local user database – which is empty. Nobody can log in on VTY (and on newer IOS also not on the console).',
        fix: ['username <user> privilege 15 secret <password>', 'aaa authentication login default local'], verify: ['show running-config | section aaa', 'ssh -l <user> <device-ip>'] });
    const con = dev.term.con[0];
    if (con && !dev.aaaNewModel && (con.login === null || con.login === 'none') && !con.password) add({ id: 'sec-console-open', sev: 'info', cat: 'Security', dev, line: con.line, tags: ['security', 'console', 'password'],
      title: 'Console line has no password', detail: 'Anyone with physical access gets user EXEC (and privileged EXEC if no enable secret is set).',
      fix: ['line con 0', ' login local   ! or: password <pw> + login'], verify: ['Reconnect on the console'] });
    if (sw && dev.term.vty.length === 1 && dev.term.vty[0].to === 4 && (dev.term.vty[0].login || dev.term.vty[0].transportInput)) add({ id: 'sec-vty-5-15', sev: 'info', cat: 'Security', dev, line: dev.term.vty[0].line, tags: ['security', 'vty', 'ssh', 'telnet'],
      title: 'Only line vty 0 4 is configured – switches usually have vty 0 15', detail: 'Lines 5–15 keep their default settings (often Telnet allowed or no login), so the hardening on 0–4 can be bypassed by opening several sessions.',
      fix: ['line vty 0 15', ' login local', ' transport input ssh'], verify: ['show line summary', 'show running-config | section line vty'] });

    // ---- references to objects that do not exist
    for (const i of ifs(dev)) if (i.eigrp.keyChain) {
      const kc = dev.keyChains[i.eigrp.keyChain];
      if (!kc || !kc.keys) add({ id: 'keychain-missing', sev: 'critical', cat: 'Routing', dev, iface: i.name, tags: ['eigrp', 'authentication', 'neighbor', 'adjacency'],
        title: i.short + ' uses key chain "' + i.eigrp.keyChain + '" which ' + (kc ? 'has no keys' : 'does not exist'), detail: 'EIGRP authentication fails, so the neighbor never comes up.',
        fix: ['key chain ' + i.eigrp.keyChain, ' key 1', '  key-string <secret>'], verify: ['show key chain', 'show ip eigrp neighbors'] });
    }
    const refsTo = (re) => { const out = []; const walk = ns => { for (const n of ns) { let m; const r = new RegExp(re.source, 'g'); while ((m = r.exec(n.text))) out.push({ name: m[1], line: n.line, text: n.text }); walk(n.children); } }; walk(dev.top); return out; };
    for (const r of refsTo(/\broute-map\s+(\S+)/)) {
      if (/^route-map\s/.test(r.text) || dev.routeMaps[r.name]) continue;
      add({ id: 'routemap-missing', sev: 'warning', cat: 'Routing', dev, line: r.line, tags: ['route-map', 'routing', 'nat', 'redistribution'],
        title: 'route-map "' + r.name + '" is referenced but not defined', detail: '"' + r.text + '" – an undefined route-map matches nothing (redistribution/NAT/policy does nothing, BGP may deny everything).',
        fix: ['route-map ' + r.name + ' permit 10', ' match …'], verify: ['show route-map ' + r.name] });
    }
    for (const r of refsTo(/\bprefix-list\s+(\S+)/)) {
      if (/^ip prefix-list\s/.test(r.text) || dev.prefixLists[r.name]) continue;
      add({ id: 'prefixlist-missing', sev: 'warning', cat: 'Routing', dev, line: r.line, tags: ['prefix-list', 'routing', 'bgp', 'filter'],
        title: 'prefix-list "' + r.name + '" is referenced but not defined', detail: '"' + r.text + '" – check the name (case sensitive).',
        fix: ['ip prefix-list ' + r.name + ' seq 5 permit <prefix>/<len>'], verify: ['show ip prefix-list ' + r.name] });
    }
    for (const acl of Object.values(dev.acls)) for (const e of acl.entries) for (const sp of [e.src, e.dst]) if (sp && sp.objectGroup && !dev.objectGroups[sp.objectGroup]) {
      add({ id: 'objectgroup-missing', sev: 'warning', cat: 'ACL', dev, line: e.line, tags: ['acl', 'object-group'],
        title: 'ACL "' + acl.name + '" uses object-group "' + sp.objectGroup + '" which is not defined', detail: e.raw.trim(), fix: ['object-group network ' + sp.objectGroup, ' <network> <mask>'], verify: ['show object-group'] });
    }

    // ---- DHCP snooping / DAI
    const trunks = ifs(dev).filter(i => i.isL2 && i.mode === 'trunk' && !i.shutdown);
    const towardsServer = i => trunks.includes(i) || model.l2Links.some(l => (l.a.ifc === i && !l.b.ifc.isL2) || (l.b.ifc === i && !l.a.ifc.isL2));
    if (sw && dev.dhcpSnooping.enabled) {
      if (!dev.dhcpSnooping.vlans) add({ id: 'dhcp-snooping-no-vlan', sev: 'info', cat: 'Security', dev, line: dev.dhcpSnooping.line, tags: ['dhcp', 'dhcp snooping', 'security'],
        title: 'DHCP snooping is enabled globally but for no VLAN', detail: 'Snooping only acts on VLANs listed with "ip dhcp snooping vlan".', fix: ['ip dhcp snooping vlan <vlans>'], verify: ['show ip dhcp snooping'] });
      else {
        const up = ifs(dev).filter(i => i.isL2 && !i.shutdown && towardsServer(i));
        const untrusted = up.filter(i => !i.dhcpSnoopingTrust);
        if (untrusted.length) add({ id: 'dhcp-snooping-untrusted', sev: 'critical', cat: 'DHCP', dev, iface: untrusted[0].name, tags: ['dhcp', 'dhcp snooping', 'no ip address', 'trunk'],
          title: 'DHCP snooping: uplink ' + untrusted.map(i => i.short).join(', ') + ' is not trusted', detail: 'DHCP OFFER/ACK messages arriving on an untrusted port are dropped, so clients in the snooped VLANs get no address. Trust the ports towards the DHCP server/router.',
          fix: cfgIf(untrusted[0], 'ip dhcp snooping trust'), verify: ['show ip dhcp snooping   → uplink "trusted yes"', 'show ip dhcp snooping binding', 'ipconfig /renew on a client'] });
        if (dev.dhcpSnooping.option82) add({ id: 'dhcp-snooping-option82', sev: 'warning', cat: 'DHCP', dev, line: dev.dhcpSnooping.line, tags: ['dhcp', 'dhcp snooping', 'relay', 'option 82'],
          title: 'DHCP snooping inserts option 82 (default)', detail: 'An IOS DHCP server or relay drops requests that carry option 82 with giaddr 0.0.0.0 ("inconsistent relay information"). This is a classic reason for DHCP failing right after enabling snooping.',
          fix: ['no ip dhcp snooping information option', '! or on the router/relay: ip dhcp relay information trust-all'], verify: ['debug ip dhcp server packet (router)', 'show ip dhcp snooping statistics'] });
      }
    }
    if (sw && dev.arpInspection) {
      if (!dev.dhcpSnooping.enabled) add({ id: 'dai-no-snooping', sev: 'critical', cat: 'Security', dev, line: dev.arpInspection.line, tags: ['arp', 'dai', 'dhcp snooping', 'no connectivity', 'intermittent'],
        title: 'Dynamic ARP Inspection is enabled without DHCP snooping', detail: 'DAI validates ARP against the DHCP snooping binding table. Without bindings (or static ARP ACLs) all ARP from hosts is dropped and they lose connectivity.',
        fix: ['ip dhcp snooping', 'ip dhcp snooping vlan <vlans>', 'interface <uplink>', ' ip dhcp snooping trust'], verify: ['show ip arp inspection statistics', 'show ip dhcp snooping binding'] });
      const untrusted = ifs(dev).filter(i => i.isL2 && !i.shutdown && towardsServer(i) && !i.arpTrust);
      if (untrusted.length) add({ id: 'dai-untrusted', sev: 'critical', cat: 'Security', dev, iface: untrusted[0].name, tags: ['arp', 'dai', 'trunk', 'no connectivity'],
        title: 'Dynamic ARP Inspection: uplink ' + untrusted.map(i => i.short).join(', ') + ' is not trusted', detail: 'ARP from the router/other switches has no binding and is dropped, so hosts cannot resolve the gateway.',
        fix: cfgIf(untrusted[0], 'ip arp inspection trust'), verify: ['show ip arp inspection interfaces', 'show ip arp inspection statistics'] });
    }

    // ---- spanning tree / port protection
    if (sw) {
      const prot = ifs(dev).some(i => (i.switchport.portSecurity && i.switchport.portSecurity.enabled) || i.bpduguard) || dev.bpduguardDefault;
      if (prot && !dev.errdisableRecovery) add({ id: 'errdisable-recovery', sev: 'info', cat: 'Switching / VLANs', dev, tags: ['err-disabled', 'port-security', 'bpdu guard'],
        title: 'Port-security/BPDU guard is used but errdisable recovery is not configured', detail: 'Ports shut by a violation stay down until someone does shutdown/no shutdown.',
        fix: ['errdisable recovery cause psecure-violation', 'errdisable recovery cause bpduguard', 'errdisable recovery interval 300'], verify: ['show errdisable recovery'] });
      for (const i of ifs(dev).filter(x => x.bpdufilter)) add({ id: 'stp-bpdufilter', sev: 'warning', cat: 'Switching / VLANs', dev, iface: i.name, tags: ['stp', 'loop', 'spanning-tree'],
        title: i.short + ' has BPDU filter enabled', detail: 'BPDU filter on an interface disables spanning tree on it completely. A cable between two such ports creates a loop that STP cannot stop.',
        fix: cfgIf(i, 'no spanning-tree bpdufilter enable', 'spanning-tree bpduguard enable'), verify: ['show spanning-tree interface ' + i.short + ' detail'] });
      const mgmt = dev.interfaces.Vlan1;
      if (mgmt && mgmt.ipv4.length && !mgmt.shutdown) add({ id: 'mgmt-vlan1', sev: 'info', cat: 'Security', dev, iface: 'Vlan1', tags: ['management', 'vlan', 'security'],
        title: 'Management address on VLAN 1', detail: 'VLAN 1 carries user ports and control traffic by default. Put management in a dedicated VLAN.',
        fix: ['vlan 99', ' name MGMT', 'interface Vlan99', ' ip address <ip> <mask>', 'interface Vlan1', ' shutdown'], verify: ['show ip interface brief | include Vlan'] });
      for (const i of ifs(dev).filter(x => x.isL2 && x.mode === 'access' && !x.shutdown)) {
        const v = dev.vlans[i.switchport.accessVlan || 1];
        if (v && v.suspended) add({ id: 'vlan-suspended', sev: 'critical', cat: 'Switching / VLANs', dev, iface: i.name, vlans: [v.id], tags: ['vlan', 'access port', 'no connectivity', 'dhcp'],
          title: 'VLAN ' + v.id + ' is suspended/shut down but used on ' + i.short, detail: 'Ports in a suspended VLAN forward nothing.', fix: ['vlan ' + v.id, ' state active', ' no shutdown'], verify: ['show vlan brief   → status active'] });
      }
      for (const t of trunks) if (t.switchport.trunkAllowed && t.switchport.trunkAllowed.size === 0) add({ id: 'trunk-allowed-none', sev: 'warning', cat: 'Switching / VLANs', dev, iface: t.name, tags: ['trunk', 'vlan', 'allowed', 'no connectivity'],
        title: 'Trunk ' + t.short + ' allows no VLANs ("allowed vlan none")', detail: 'The trunk is up but forwards nothing.', fix: cfgIf(t, 'switchport trunk allowed vlan <vlans>'), verify: ['show interfaces trunk'] });
    }

    // ---- tunnels
    for (const t of ifs(dev).filter(i => /^Tunnel/.test(i.name) && !i.shutdown)) {
      const tn = t.tunnel || {};
      if (!tn.source || !tn.destination) {
        if (!/ipsec|dmvpn|multipoint/.test(tn.mode || '')) add({ id: 'tunnel-incomplete', sev: 'critical', cat: 'Interfaces', dev, iface: t.name, tags: ['tunnel', 'gre', 'vpn', 'interface down'],
          title: t.short + ' has no tunnel ' + (!tn.source ? 'source' : 'destination'), detail: 'A point-to-point tunnel stays up/down until both source and destination are configured.',
          fix: cfgIf(t, 'tunnel source <wan-interface>', 'tunnel destination <remote-public-ip>'), verify: ['show interfaces ' + t.short + '   → up/up'] });
        continue;
      }
      if (!N.isIp(tn.source)) {
        const src = dev.interfaces[tn.source];
        if (!src || src.shutdown || (!src.ipv4.length && !src.dhcpClient && !src.ipUnnumbered)) add({ id: 'tunnel-source-down', sev: 'critical', cat: 'Interfaces', dev, iface: t.name, tags: ['tunnel', 'gre', 'vpn', 'interface down'],
          title: t.short + ': tunnel source ' + tn.source + ' ' + (!src ? 'does not exist' : src.shutdown ? 'is shut down' : 'has no IP address'), detail: 'The tunnel cannot come up without a working source interface.',
          fix: src ? cfgIf(src, 'no shutdown') : cfgIf(t, 'tunnel source <existing-interface>'), verify: ['show interfaces ' + t.short] });
      }
      if (N.isIp(tn.destination) && dev.ipRouting) {
        const route = T.lookupIn(model.ribs[dev.id], tn.destination);
        if (!route) add({ id: 'tunnel-dest-unreachable', sev: 'critical', cat: 'Routing', dev, iface: t.name, ips: [tn.destination], tags: ['tunnel', 'gre', 'vpn', 'routing', 'missing route'],
          title: t.short + ': no route to tunnel destination ' + tn.destination, detail: 'The tunnel stays up/down (line protocol down) without a route to its destination.',
          fix: ['ip route ' + tn.destination + ' 255.255.255.255 <wan-next-hop>'], verify: ['show ip route ' + tn.destination, 'show interfaces ' + t.short] });
        else if (route.iface === t.name) add({ id: 'tunnel-recursive', sev: 'critical', cat: 'Routing', dev, iface: t.name, ips: [tn.destination], tags: ['tunnel', 'gre', 'routing', 'flapping'],
          title: t.short + ': the tunnel destination ' + tn.destination + ' is routed through the tunnel itself', detail: 'Recursive routing: the tunnel flaps ("%TUN-5-RECURDOWN"). Do not advertise the tunnel endpoints through a routing protocol that runs over the tunnel.',
          fix: ['ip route ' + tn.destination + ' 255.255.255.255 <wan-next-hop>'], verify: ['show logging | include RECURDOWN', 'show ip route ' + tn.destination] });
      }
    }

    // ---- IPv6
    if (!dev.ipv6Routing && dev.type !== 'switch') {
      if (dev.ospfv3.length || ifs(dev).some(i => i.ospfv3)) add({ id: 'ipv6-ospfv3-no-routing', sev: 'critical', cat: 'Routing', dev, tags: ['ipv6', 'ospfv3', 'routing'],
        title: 'OSPFv3 is configured but "ipv6 unicast-routing" is missing', detail: 'IPv6 routing protocols do not run without IPv6 unicast routing.', fix: ['ipv6 unicast-routing'], verify: ['show ipv6 ospf neighbor'] });
      else if (dev.ipv6Routes.length) add({ id: 'ipv6-static-no-routing', sev: 'warning', cat: 'Routing', dev, line: dev.ipv6Routes[0].line, tags: ['ipv6', 'routing', 'static route'],
        title: 'IPv6 static routes without "ipv6 unicast-routing"', detail: 'The router does not forward IPv6, so the routes are useless.', fix: ['ipv6 unicast-routing'], verify: ['show ipv6 route static'] });
    }
    for (const p of dev.ospfv3) if (!ifs(dev).some(i => i.ospfv3 && i.ospfv3.pid === p.pid)) add({ id: 'ospfv3-no-interfaces', sev: 'warning', cat: 'Routing', dev, line: p.line, tags: ['ipv6', 'ospfv3'],
      title: 'OSPFv3 process ' + p.pid + ' has no interfaces', detail: 'OSPFv3 is enabled per interface ("ipv6 ospf ' + p.pid + ' area <a>"), not with network statements.', fix: ['interface <if>', ' ipv6 ospf ' + p.pid + ' area 0'], verify: ['show ipv6 ospf interface brief'] });

    // ---- OSPF details
    for (const o of dev.ospf) {
      if (o.defaultOriginate && !o.defaultOriginate.always && !model.ribs[dev.id].some(r => r.prefix === 0 && r.code !== 'O*'))
        add({ id: 'ospf-default-no-route', sev: 'warning', cat: 'Routing', dev, line: o.defaultOriginate.line, tags: ['ospf', 'default route', 'internet'],
          title: 'OSPF "default-information originate" but this router has no default route', detail: 'Without "always", OSPF only advertises 0.0.0.0/0 when the router itself has a default route. The other routers get no default route.',
          fix: ['ip route 0.0.0.0 0.0.0.0 <isp-next-hop>', '! or: router ospf ' + o.pid, ' default-information originate always'], verify: ['show ip route 0.0.0.0 (on the other routers) → O*E2'] });
      const enabled = model.protocols.ospf.ifs.filter(x => x.dev === dev && x.proc === o);
      if (enabled.length && enabled.every(x => x.passive) && model.devices.length > 1) add({ id: 'ospf-all-passive', sev: 'warning', cat: 'Routing', dev, line: o.line, tags: ['ospf', 'passive', 'neighbor'],
        title: 'All OSPF interfaces on ' + h + ' are passive', detail: 'The router advertises its networks nowhere because it cannot form any neighbor. Use "no passive-interface" on the links to other routers.',
        fix: ['router ospf ' + o.pid, ' no passive-interface <uplink>'], verify: ['show ip ospf neighbor'] });
    }
    for (const e of dev.eigrp) {
      const enabled = model.protocols.eigrp.ifs.filter(x => x.dev === dev && x.proc === e);
      if (enabled.length && enabled.every(x => x.passive) && model.devices.length > 1) add({ id: 'eigrp-all-passive', sev: 'warning', cat: 'Routing', dev, line: e.line, tags: ['eigrp', 'passive', 'neighbor'],
        title: 'All EIGRP interfaces on ' + h + ' are passive', detail: 'No neighbor can form.', fix: ['router eigrp ' + e.asn, ' no passive-interface <uplink>'], verify: ['show ip eigrp neighbors'] });
    }

    // ---- static routes
    const conn = T.l3Addresses(dev, false);
    for (const s of dev.staticRoutes) {
      if (s.vrf || !N.isIp(s.prefix) || N.maskToPrefix(s.mask) <= 0) continue;
      const c = conn.find(a => a.net === N.network(s.prefix, s.mask) && a.mask === s.mask);
      if (c) add({ id: 'static-to-connected', sev: 'info', cat: 'Routing', dev, line: s.line, tags: ['static route', 'routing'],
        title: 'Static route to a directly connected network: ' + s.raw, detail: c.ifc.short + ' already has ' + N.cidr(c.ip, c.mask) + '. The connected route wins; the static is redundant (or a typo).',
        fix: ['no ' + s.raw], verify: ['show ip route ' + s.prefix] });
      if (s.prefix !== N.network(s.prefix, s.mask)) add({ id: 'static-host-bits', sev: 'info', cat: 'Routing', dev, line: s.line, tags: ['static route'],
        title: 'Static route destination has host bits set: ' + s.raw, detail: 'The route really covers ' + N.cidr(s.prefix, s.mask) + '. Check the mask.', fix: [], verify: ['show ip route static'] });
    }

    // ---- ACL sanity
    for (const acl of Object.values(dev.acls)) for (const e of acl.entries) for (const sp of [e.src, e.dst]) {
      if (!sp || !sp.addr || !sp.wild || !N.isIp(sp.addr) || !N.isIp(sp.wild)) continue;
      if ((N.ipToInt(sp.addr) & N.ipToInt(sp.wild)) >>> 0 && N.wildcardToPrefix(sp.wild) >= 0) {
        add({ id: 'acl-host-bits', sev: 'info', cat: 'ACL', dev, line: e.line, tags: ['acl', 'wildcard'],
          title: 'ACL "' + acl.name + '": address ' + sp.addr + ' has bits set inside wildcard ' + sp.wild, detail: '"' + e.raw.trim() + '" – IOS ignores those bits, so this matches ' + N.intToIp((N.ipToInt(sp.addr) & ~N.ipToInt(sp.wild)) >>> 0) + ' ' + sp.wild + '. Did you mean a host entry or another wildcard?',
          fix: [], verify: ['show access-lists ' + acl.name] });
        break;
      }
    }

    // ---- NAT pools
    for (const p of Object.values(dev.nat.pools)) {
      const a = N.ipToInt(p.start), b = N.ipToInt(p.end);
      if (a === null || b === null || a > b || !N.inSubnet(p.start, p.end, p.mask)) { add({ id: 'nat-pool-invalid', sev: 'critical', cat: 'NAT', dev, line: p.line, tags: ['nat', 'internet'],
        title: 'NAT pool ' + p.name + ' is invalid (' + p.start + ' – ' + p.end + ' / ' + p.mask + ')', detail: 'Start must be lower than end and both in the same subnet.', fix: ['ip nat pool ' + p.name + ' <start> <end> netmask <mask>'], verify: ['show ip nat statistics'] }); continue; }
      const size = b - a + 1;
      const users = dev.nat.rules.filter(r => r.pool === p.name);
      if (users.length && !users.some(r => r.overload) && size < 8) add({ id: 'nat-pool-small', sev: 'warning', cat: 'NAT', dev, line: p.line, tags: ['nat', 'internet', 'intermittent'],
        title: 'NAT pool ' + p.name + ' has only ' + size + ' address(es) and no overload', detail: 'Dynamic NAT without overload needs one public address per active inside host. When the pool is exhausted new hosts get no Internet access ("%NAT: … pool exhausted").',
        fix: ['ip nat inside source list ' + (users[0].list || '<acl>') + ' pool ' + p.name + ' overload'], verify: ['show ip nat statistics   → misses not increasing'] });
    }

    // ---- DHCP pools
    const pools = Object.values(dev.dhcpPools).filter(p => p.network && p.mask && N.maskToPrefix(p.mask) >= 0);
    for (const p of pools) {
      const first = N.ipToInt(N.network(p.network, p.mask)) + 1, last = N.ipToInt(N.broadcast(p.network, p.mask)) - 1;
      let free = 0;
      for (let x = first; x <= last && x - first < 70000; x++) if (!dev.dhcpExcluded.some(e => x >= N.ipToInt(e.start) && x <= N.ipToInt(e.end))) { free++; if (free > 2) break; }
      if (free === 0) add({ id: 'dhcp-all-excluded', sev: 'critical', cat: 'DHCP', dev, line: p.line, tags: ['dhcp', 'no ip address'],
        title: 'DHCP pool ' + p.name + ': every address is excluded', detail: 'The excluded-address ranges cover the whole pool, so nothing can be leased.', fix: ['no ip dhcp excluded-address …', 'ip dhcp excluded-address <first> <last-static>'], verify: ['show ip dhcp pool ' + p.name] });
    }
    for (let i = 0; i < pools.length; i++) for (let j = i + 1; j < pools.length; j++) if (N.subnetsOverlap(pools[i].network, pools[i].mask, pools[j].network, pools[j].mask))
      add({ id: 'dhcp-pool-overlap', sev: 'warning', cat: 'DHCP', dev, line: pools[j].line, tags: ['dhcp', 'duplicate'],
        title: 'DHCP pools ' + pools[i].name + ' and ' + pools[j].name + ' overlap', detail: 'Two pools hand out addresses from the same range; clients may get the wrong gateway/options.', fix: ['ip dhcp pool ' + pools[j].name, ' network <other-network> <mask>'], verify: ['show ip dhcp pool'] });
    // ---- relay reachability
    for (const i of ifs(dev)) for (const hp of i.helpers) {
      if (!dev.ipRouting || T.l3Addresses(dev, true).some(a => a.ip === hp.ip)) continue;
      if (!T.lookupIn(model.ribs[dev.id], hp.ip)) add({ id: 'dhcp-helper-unreachable', sev: 'critical', cat: 'DHCP', dev, iface: i.name, ips: [hp.ip], tags: ['dhcp', 'relay', 'helper-address', 'routing'],
        title: i.short + ': no route to DHCP server ' + hp.ip + ' (ip helper-address)', detail: 'The relayed request cannot be forwarded, so clients get no address.', fix: ['ip route <server-network> <mask> <next-hop>   ! or fix the routing protocol'], verify: ['show ip route ' + hp.ip, 'ping ' + hp.ip + ' source ' + i.short] });
    }

    // ---- management hygiene
    if (/^(Router|Switch)$/i.test(h)) add({ id: 'mgmt-default-hostname', sev: 'info', cat: 'Management', dev, line: dev.hostnameLine, tags: ['management'],
      title: 'Device still has the default hostname "' + h + '"', detail: 'A unique hostname makes logs, CDP output and SSH keys unambiguous.', fix: ['hostname <unique-name>'], verify: ['show running-config | include hostname'] });
    const missing = [!dev.ntpServers.length && 'NTP server', !dev.timestamps && 'log timestamps', !dev.loggingBuffered && !dev.loggingHosts.length && 'log buffer or syslog server'].filter(Boolean);
    if (missing.length) add({ id: 'mgmt-logging-time', sev: 'info', cat: 'Management', dev, tags: ['management', 'ntp', 'logging'],
      title: 'Logging and time: no ' + missing.join(', no '), detail: 'During troubleshooting you need log messages that are kept and have correct timestamps, so events on different devices can be correlated.',
      fix: [!dev.ntpServers.length && 'ntp server <ntp-ip>', !dev.timestamps && 'service timestamps log datetime msec localtime show-timezone', !dev.loggingBuffered && !dev.loggingHosts.length && 'logging buffered 64000 informational'].filter(Boolean), verify: ['show ntp status', 'show logging'] });
    if (dev.cdpRun) for (const i of ifs(dev).filter(x => x.nat === 'outside' && !x.cdpDisabled)) add({ id: 'sec-cdp-outside', sev: 'info', cat: 'Security', dev, iface: i.name, tags: ['security', 'cdp'],
      title: 'CDP is enabled on the Internet-facing interface ' + i.short, detail: 'CDP announces model, IOS version and addresses to whatever is connected.', fix: cfgIf(i, 'no cdp enable'), verify: ['show cdp interface ' + i.short] });
  }

  // ------------------------------------------------------------ cross-device
  function cross(model, add) {
    const devs = model.devices;
    // Serial links
    for (const seg of model.segments) {
      const ser = seg.members.filter(m => /^Serial/.test(m.ifc.name) && !m.ifc.name.includes('.'));
      if (ser.length !== 2 || ser[0].dev === ser[1].dev) continue;
      const [a, b] = ser;
      const base = { cat: 'Interfaces', devices: [a.dev, b.dev], dev: a.dev, iface: a.ifc.name, line: a.ifc.line };
      const enc = x => (x.ifc.encapsulation && x.ifc.encapsulation.type) || 'hdlc';
      if (enc(a) !== enc(b)) add({ ...base, id: 'serial-encap-mismatch', sev: 'critical', tags: ['serial', 'wan', 'interface down', 'ppp', 'hdlc', 'link'],
        title: 'Serial encapsulation mismatch: ' + a.dev.hostname + ' ' + a.ifc.short + ' ' + enc(a) + ' vs ' + b.dev.hostname + ' ' + b.ifc.short + ' ' + enc(b), detail: 'The link stays up/down until both ends use the same encapsulation.',
        fix: cfgIf(b.ifc, 'encapsulation ' + enc(a)), verify: ['show interfaces ' + a.ifc.short + '   → up/up, same "Encapsulation"'] });
      else if (enc(a) === 'ppp' && (!!a.ifc.pppAuth) !== (!!b.ifc.pppAuth)) {
        const x = a.ifc.pppAuth ? b : a;
        add({ ...base, id: 'ppp-auth-mismatch', sev: 'critical', dev: x.dev, iface: x.ifc.name, tags: ['serial', 'wan', 'ppp', 'chap', 'pap', 'interface down'],
          title: 'PPP authentication only on one side of ' + a.dev.hostname + '–' + b.dev.hostname, detail: 'One end requires ' + (a.ifc.pppAuth || b.ifc.pppAuth) + ' and the other is not configured for it, so LCP/authentication fails and the link stays up/down. CHAP also needs "username <peer-hostname> password <same-secret>" on both routers.',
          fix: ['! on both routers', 'username <peer-hostname> password <shared-secret>', 'interface <serial>', ' ppp authentication ' + (a.ifc.pppAuth || b.ifc.pppAuth)], verify: ['show interfaces ' + x.ifc.short + '   → LCP Open', 'debug ppp authentication'] });
      }
      if (!a.ifc.clockRate && !b.ifc.clockRate) add({ ...base, id: 'serial-no-clock', sev: 'warning', tags: ['serial', 'wan', 'interface down', 'clock rate', 'link'],
        title: 'Neither end of serial link ' + a.dev.hostname + ' ' + a.ifc.short + ' – ' + b.dev.hostname + ' ' + b.ifc.short + ' has a clock rate', detail: 'On back-to-back serial cables (labs) the DCE end must provide clocking; otherwise the line protocol stays down.',
        fix: ['! on the DCE side (show controllers serial … tells which end)', 'interface <serial>', ' clock rate 128000'], verify: ['show controllers serial ' + a.ifc.short.replace('Se', ''), 'show interfaces ' + a.ifc.short] });
      if ((a.ifc.bandwidth || null) !== (b.ifc.bandwidth || null)) add({ ...base, id: 'link-bandwidth-mismatch', sev: 'info', tags: ['routing', 'ospf', 'eigrp', 'metric'],
        title: 'Different "bandwidth" on the two ends of ' + a.dev.hostname + '–' + b.dev.hostname, detail: 'OSPF cost / EIGRP metric differs per direction, which can cause asymmetric routing.', fix: cfgIf(b.ifc, 'bandwidth ' + (a.ifc.bandwidth || '<kbps>')), verify: ['show interfaces ' + b.ifc.short + ' | include BW'] });
    }
    // OSPF reference bandwidth
    const ospfDevs = devs.filter(d => d.ospf.length);
    const refs = new Set(ospfDevs.map(d => d.ospf[0].refBw));
    if (refs.size > 1) add({ id: 'ospf-refbw-mismatch', sev: 'warning', cat: 'Routing', devices: ospfDevs, dev: ospfDevs[0], tags: ['ospf', 'metric', 'routing'],
      title: 'OSPF auto-cost reference-bandwidth differs: ' + ospfDevs.map(d => d.hostname + '=' + d.ospf[0].refBw).join(', '), detail: 'Routers calculate costs on different scales, which gives suboptimal or asymmetric paths. Use the same value everywhere.',
      fix: ['router ospf <pid>', ' auto-cost reference-bandwidth ' + Math.max(...refs)], verify: ['show ip ospf | include Reference', 'show ip ospf interface brief'] });
    // STP root
    const sws = devs.filter(d => d.type !== 'router' && d.interfaceOrder.some(n => d.interfaces[n].isL2));
    if (sws.length > 1) {
      const vlans = new Set(sws.flatMap(d => Object.keys(d.vlans).map(Number)).concat([1]));
      const noRoot = [...vlans].filter(v => !sws.some(d => d.stpPriority[v] !== undefined && d.stpPriority[v] < 32768));
      if (noRoot.length) add({ id: 'stp-no-root', sev: 'warning', cat: 'Switching / VLANs', devices: sws, dev: sws[0], vlans: noRoot, tags: ['stp', 'spanning-tree', 'root bridge', 'slow', 'loop'],
        title: 'No switch is configured as spanning-tree root for VLAN ' + noRoot.slice(0, 8).join(', ') + (noRoot.length > 8 ? ', …' : ''), detail: 'The root is elected by the lowest MAC address – often the oldest access switch – which gives suboptimal paths and blocks the wrong links.',
        fix: ['! on the core/distribution switch', 'spanning-tree vlan ' + noRoot.join(',') + ' root primary'], verify: ['show spanning-tree root', 'show spanning-tree vlan ' + noRoot[0]] });
      for (const v of vlans) {
        const pr = sws.filter(d => d.stpPriority[v] !== undefined && d.stpPriority[v] < 32768);
        if (pr.length > 1) {
          const min = Math.min(...pr.map(d => d.stpPriority[v]));
          const tie = pr.filter(d => d.stpPriority[v] === min);
          if (tie.length > 1) add({ id: 'stp-root-tie', sev: 'info', cat: 'Switching / VLANs', devices: tie, dev: tie[0], vlans: [v], tags: ['stp', 'root bridge'],
            title: 'VLAN ' + v + ': ' + tie.map(d => d.hostname).join(' and ') + ' have the same root priority ' + min, detail: 'The tie is broken by MAC address. Make one primary (24576) and one secondary (28672).',
            fix: ['spanning-tree vlan ' + v + ' root primary   ! on the intended root', 'spanning-tree vlan ' + v + ' root secondary   ! on the backup'], verify: ['show spanning-tree vlan ' + v] });
        }
      }
    }
    // Duplicate IPv6 addresses
    const v6 = {};
    for (const d of devs) for (const n of d.interfaceOrder) for (const a of d.interfaces[n].ipv6) {
      const k = String(a.addr).toLowerCase().split('/')[0];
      if (/^fe80|link-local|autoconfig|eui-64/i.test(a.addr) || !k.includes(':')) continue;
      (v6[k] = v6[k] || []).push({ d, ifc: d.interfaces[n] });
    }
    for (const [addr, list] of Object.entries(v6)) if (list.length > 1) add({ id: 'dup-ipv6', sev: 'critical', cat: 'Interfaces', devices: list.map(x => x.d), dev: list[0].d, iface: list[0].ifc.name, tags: ['ipv6', 'duplicate'],
      title: 'Duplicate IPv6 address ' + addr + ' on ' + list.map(x => x.d.hostname + ' ' + x.ifc.short).join(' and '), detail: 'Duplicate address detection disables the address on one of them (DAD failed).', fix: cfgIf(list[1].ifc, 'ipv6 address <unique-address>/<len>'), verify: ['show ipv6 interface ' + list[1].ifc.short + '   → no "DUPLICATE"'] });
    // Static-route loops and black holes
    const loopsSeen = new Set();
    for (const d of devs) {
      if (!d.ipRouting) continue;
      for (const s of d.staticRoutes) {
        if (s.vrf || !s.nextHop || !N.isIp(s.prefix) || N.maskToPrefix(s.mask) < 0) continue;
        const probe = N.maskToPrefix(s.mask) >= 31 ? s.prefix : N.intToIp((N.ipToInt(N.network(s.prefix, s.mask)) + 1) >>> 0);
        const own = T.l3Addresses(d, false)[0];
        if (!own || model.all.some(a => N.inSubnet(probe, a.ip, a.mask) && a.dev === d)) continue;
        const tr = T.trace(model, own.ip, probe, { proto: 'icmp' });
        if (tr.status === 'loop' && loopsSeen.has(N.cidr(s.prefix, s.mask))) continue;
        if (tr.status === 'loop') loopsSeen.add(N.cidr(s.prefix, s.mask));
        if (tr.status === 'loop') add({ id: 'static-loop', sev: 'critical', cat: 'Routing', dev: d, devices: [...new Set(tr.hops.map(x => x.dev))], line: s.line, ips: [s.nextHop, s.prefix], tags: ['static route', 'routing', 'loop', 'ttl', 'no connectivity'],
          title: 'Routing loop for ' + N.cidr(s.prefix, s.mask) + ' between ' + [...new Set(tr.hops.map(x => x.dev.hostname))].join(' → '), detail: 'Packets bounce between the routers until the TTL expires (traceroute shows the same hops repeating).',
          fix: ['! fix the next hop on one of the routers so the route points towards the network', 'no ' + s.raw], verify: ['traceroute ' + probe, 'show ip route ' + s.prefix + ' (on each router)'] });
        else if (tr.status === 'dropped' && tr.noRoute && tr.noRoute !== d) add({ id: 'static-blackhole', sev: 'warning', cat: 'Routing', dev: d, devices: [d, tr.noRoute], line: s.line, ips: [s.nextHop, s.prefix], tags: ['static route', 'routing', 'missing route', 'remote network'],
          title: d.hostname + ' sends ' + N.cidr(s.prefix, s.mask) + ' to ' + tr.noRoute.hostname + ', which has no route for it', detail: 'The static route leads into a router that drops the traffic.', fix: ['! on ' + tr.noRoute.hostname, 'ip route ' + N.network(s.prefix, s.mask) + ' ' + s.mask + ' <next-hop-towards-network>'], verify: ['show ip route ' + s.prefix + ' (on ' + tr.noRoute.hostname + ')', 'traceroute ' + probe] });
      }
    }
    // HSRP equal priority without preempt
    for (const seg of model.segments) {
      const ms = seg.members.filter(m => Object.keys(m.ifc.standby).length);
      if (ms.length < 2) continue;
      const pr = ms.map(m => Object.values(m.ifc.standby)[0]);
      if (new Set(pr.map(p => p.priority)).size === 1 && !pr.some(p => p.preempt)) add({ id: 'hsrp-no-preference', sev: 'info', cat: 'Redundancy (HSRP)', devices: ms.map(m => m.dev), dev: ms[0].dev, iface: ms[0].ifc.name, tags: ['hsrp', 'redundancy'],
        title: 'HSRP on ' + seg.key + ': all routers have priority ' + pr[0].priority + ' and no preempt', detail: 'The active router is decided by who booted first / highest IP. Set a higher priority and preempt on the intended active router (often the STP root for that VLAN).',
        fix: ['interface <if>', ' standby <group> priority 110', ' standby <group> preempt'], verify: ['show standby brief'] });
    }
  }

  CCA.checksExtra = { device, cross };
  if (typeof module !== 'undefined' && module.exports) module.exports = CCA;
})(typeof window !== 'undefined' ? window : globalThis);
