// Rule-based analysis. Every finding explains the problem, suggests a fix and tells
// you how to verify that the fix worked.
(function (root) {
  const CCA = root.CCA = root.CCA || {};
  const N = CCA.net;
  const T = CCA.topology;

  const SEV_ORDER = { critical: 0, warning: 1, info: 2 };

  function analyze(devices) {
    const model = T.build(devices);
    const findings = [];
    const add = f => {
      f.devices = f.devices || (f.dev ? [f.dev] : []);
      f.device = f.dev ? f.dev.hostname : f.devices.map(d => d.hostname).join(', ');
      f.tags = f.tags || [];
      f.fix = f.fix || [];
      f.verify = f.verify || [];
      findings.push(f);
    };
    for (const dev of devices) {
      checkSecurity(dev, add);
      checkInterfaces(dev, add, model);
      checkSwitching(dev, add, model);
      checkRouting(dev, add, model);
      checkAcls(dev, add, model);
      checkNat(dev, add, model);
      checkDhcp(dev, add, model);
      checkHsrp(dev, add);
    }
    checkCross(model, add);
    // The router-on-a-stick check names the exact trunk; drop the generic duplicate.
    const ros = findings.filter(f => f.id === 'ros-vlan-not-allowed');
    for (let i = findings.length - 1; i >= 0; i--) {
      const f = findings[i];
      if (f.id === 'vlan-not-on-trunk' && ros.some(r => r.dev === f.dev && r.vlans.some(v => f.vlans.includes(v)))) findings.splice(i, 1);
    }
    findings.forEach((f, i) => { f.uid = 'f' + (i + 1); });
    findings.sort((a, b) => SEV_ORDER[a.sev] - SEV_ORDER[b.sev] || a.device.localeCompare(b.device));
    return { model, findings };
  }

  const cfgIf = (ifc, ...cmds) => ['interface ' + ifc.name, ...cmds.map(c => ' ' + c)];

  // ------------------------------------------------------------ security
  function checkSecurity(dev, add) {
    const h = dev.hostname;
    if (!dev.enableSecret) {
      if (dev.enablePassword) add({ id: 'sec-enable-password', sev: 'warning', cat: 'Security', dev, line: dev.enablePassword.line, tags: ['security', 'password', 'enable'],
        title: 'Privileged EXEC is protected by "enable password" instead of "enable secret"',
        detail: '"enable password" is stored in clear text (or weak type 7). "enable secret" uses a strong hash and takes precedence if both exist.',
        fix: ['no enable password', 'enable secret <strong-password>'], verify: ['show running-config | include enable', 'disable  → then "enable" and log in with the new secret'] });
      else add({ id: 'sec-no-enable', sev: 'warning', cat: 'Security', dev, tags: ['security', 'password', 'enable', 'ssh', 'telnet'],
        title: 'No enable secret configured',
        detail: 'Anyone with console access gets privileged EXEC. Remote VTY users cannot enter "enable" at all ("% No password set"), which often looks like "I can log in but can\'t configure anything".',
        fix: ['enable secret <strong-password>'], verify: ['show running-config | include enable secret', 'From a remote session: enable'] });
    }
    const type0 = [];
    for (const k of ['con', 'aux', 'vty']) for (const l of dev.term[k]) if (l.password && l.password.type === 0) type0.push(l);
    if (dev.enablePassword && dev.enablePassword.type === 0) type0.push(dev.enablePassword);
    if (!dev.servicePasswordEncryption && type0.length) add({ id: 'sec-cleartext', sev: 'info', cat: 'Security', dev, line: type0[0].line, tags: ['security', 'password'],
      title: 'Clear-text passwords in the configuration',
      detail: type0.length + ' password(s) are stored as plain text. "service password-encryption" at least hides them from shoulder-surfing (type 7 is reversible, so prefer secrets).',
      fix: ['service password-encryption'], verify: ['show running-config | include password'] });

    const vtys = dev.term.vty;
    for (const v of vtys) {
      const range = 'line vty ' + v.from + ' ' + v.to;
      const transports = v.transportInput ? v.transportInput.split(/\s+/) : null;
      if (transports && (transports.includes('telnet') || transports.includes('all'))) add({ id: 'sec-telnet', sev: 'warning', cat: 'Security', dev, line: v.transportLine || v.line, tags: ['security', 'telnet', 'ssh', 'remote access', 'vty'],
        title: 'Telnet allowed on ' + range, detail: 'Telnet sends usernames and passwords in clear text. Use SSH only.',
        fix: ['ip domain-name <domain>', 'crypto key generate rsa modulus 2048', 'ip ssh version 2', 'username <user> privilege 15 secret <password>', range, ' transport input ssh', ' login local'],
        verify: ['show ip ssh', 'show running-config | section line vty', 'ssh -l <user> <device-ip>   (from a PC)'] });
      if (!dev.aaaNewModel) {
        if (v.login === 'local' && !dev.users.length) add({ id: 'sec-login-local-no-user', sev: 'critical', cat: 'Security', dev, line: v.line, tags: ['ssh', 'telnet', 'remote access', 'vty', 'login'],
          title: range + ' uses "login local" but no username exists',
          detail: 'Remote login is impossible: there is no local user to authenticate against.',
          fix: ['username <user> privilege 15 secret <password>'], verify: ['show running-config | include username', 'ssh -l <user> <device-ip>'] });
        if ((v.login === 'line' || v.login === null) && !v.password) add({ id: 'sec-vty-no-password', sev: 'critical', cat: 'Security', dev, line: v.line, tags: ['ssh', 'telnet', 'remote access', 'vty', 'login'],
          title: range + ' requires a line password but none is set',
          detail: 'With "login" and no password IOS rejects every remote session with "Password required, but none set".',
          fix: [range, ' login local', '!  (and create a user)  or:', ' password <password>', ' login'], verify: ['show running-config | section line vty', 'telnet/ssh to the device from a PC'] });
        if (v.login === 'none') add({ id: 'sec-vty-no-login', sev: 'critical', cat: 'Security', dev, line: v.line, tags: ['security', 'vty', 'remote access'],
          title: range + ' has "no login" – anyone can connect without a password', detail: 'Remote users get a shell without authentication.',
          fix: [range, ' login local'], verify: ['show running-config | section line vty'] });
      }
      if (transports && transports.includes('ssh')) {
        if (!dev.domainName) add({ id: 'sec-ssh-no-domain', sev: 'warning', cat: 'Security', dev, line: v.transportLine, tags: ['ssh', 'remote access'],
          title: 'SSH is required on ' + range + ' but "ip domain-name" is missing',
          detail: 'RSA keys need a hostname and a domain name. Without keys SSH is disabled and the connection is refused. (RSA keys are not shown in the running-config – check with "show ip ssh".)',
          fix: ['ip domain-name <domain>', 'crypto key generate rsa modulus 2048', 'ip ssh version 2'], verify: ['show ip ssh   → "SSH Enabled - version 2.0"', 'show crypto key mypubkey rsa'] });
        if (/^(Router|Switch)$/i.test(dev.hostname)) add({ id: 'sec-ssh-default-hostname', sev: 'warning', cat: 'Security', dev, tags: ['ssh'],
          title: 'Default hostname – RSA keys for SSH cannot be generated', detail: 'IOS refuses "crypto key generate rsa" while the hostname is the default.',
          fix: ['hostname <name>', 'crypto key generate rsa modulus 2048'], verify: ['show ip ssh'] });
      }
      if (transports && transports.includes('ssh') && dev.sshVersion !== 2) add({ id: 'sec-ssh-v1', sev: 'info', cat: 'Security', dev, tags: ['ssh'],
        title: 'SSH version 2 is not enforced', detail: 'Without "ip ssh version 2" the device may also accept the insecure SSHv1.',
        fix: ['ip ssh version 2'], verify: ['show ip ssh'] });
      if (v.execTimeout && v.execTimeout.min === 0 && v.execTimeout.sec === 0) add({ id: 'sec-exec-timeout', sev: 'info', cat: 'Security', dev, line: v.execTimeout.line, tags: ['security', 'vty'],
        title: 'exec-timeout 0 0 on ' + range, detail: 'Idle sessions never time out and can occupy all VTY lines.',
        fix: [range, ' exec-timeout 10 0'], verify: ['show running-config | section line vty'] });
    }
    if (vtys.length && !vtys.some(v => v.accessClass)) add({ id: 'sec-vty-acl', sev: 'info', cat: 'Security', dev, line: vtys[0].line, tags: ['security', 'vty', 'acl'],
      title: 'No access-class restricts who may connect to the VTY lines', detail: 'Consider allowing remote management only from the management network.',
      fix: ['ip access-list standard MGMT', ' permit <mgmt-network> <wildcard>', 'line vty 0 15', ' access-class MGMT in'], verify: ['show access-lists MGMT   (hit counters increase on login)'] });
    for (const u of dev.users) if (u.kind === 'password') add({ id: 'sec-user-password', sev: 'info', cat: 'Security', dev, line: u.line, tags: ['security', 'password'],
      title: 'User "' + u.name + '" uses "password" instead of "secret"', detail: 'Local user passwords should be stored hashed.',
      fix: ['username ' + u.name + ' privilege ' + u.privilege + ' secret <password>'], verify: ['show running-config | include username'] });
    for (const s of dev.snmp) {
      if (/^(public|private)$/i.test(s.community)) add({ id: 'sec-snmp-default', sev: 'warning', cat: 'Security', dev, line: s.line, tags: ['security', 'snmp'],
        title: 'SNMP community "' + s.community + '" is a well-known default', detail: 'Anyone who can reach the device can read' + (s.access === 'RW' ? ' and CHANGE' : '') + ' its configuration via SNMP.',
        fix: ['no snmp-server community ' + s.community, 'snmp-server community <random-string> RO <acl>'], verify: ['show snmp community'] });
      else if (s.access === 'RW' && !s.acl) add({ id: 'sec-snmp-rw', sev: 'warning', cat: 'Security', dev, line: s.line, tags: ['security', 'snmp'],
        title: 'SNMP read-write community without ACL', detail: 'RW SNMP allows changing the configuration remotely. Restrict it to a management host with an ACL.',
        fix: ['snmp-server community ' + s.community + ' RW <acl>'], verify: ['show snmp community'] });
    }
    if (dev.httpServer) add({ id: 'sec-http', sev: 'info', cat: 'Security', dev, line: dev.httpServer.line, tags: ['security', 'http'],
      title: 'Unencrypted HTTP management server is enabled', detail: 'Disable it unless you need it, or use "ip http secure-server".',
      fix: ['no ip http server'], verify: ['show running-config | include ip http'] });
    if (!dev.banners.some(b => b.type === 'motd' || b.type === 'login')) add({ id: 'sec-banner', sev: 'info', cat: 'Security', dev, tags: ['security'],
      title: 'No login banner', detail: 'A legal warning banner is commonly required by security policy.',
      fix: ['banner motd ^Authorized access only^'], verify: ['Log in again and check the banner'] });
    const con = dev.term.con[0];
    if (con && !con.loggingSync) add({ id: 'mgmt-logging-sync', sev: 'info', cat: 'Management', dev, line: con.line, tags: ['management', 'console'],
      title: 'Console without "logging synchronous"', detail: 'Log messages interrupt what you are typing on the console.',
      fix: ['line con 0', ' logging synchronous'], verify: ['Type on the console while an interface changes state'] });
    if (dev.domainLookup && !dev.nameServers.length) add({ id: 'mgmt-domain-lookup', sev: 'info', cat: 'Management', dev, tags: ['management', 'dns'],
      title: 'DNS lookup enabled without a name server', detail: 'A mistyped command is treated as a hostname and the CLI hangs for ~30 seconds while it tries to resolve it.',
      fix: ['no ip domain-lookup'], verify: ['Type a non-existing command: it should fail immediately'] });
  }

  // ---------------------------------------------------------- interfaces
  function checkInterfaces(dev, add, model) {
    const seenIp = {};
    const addrs = T.l3Addresses(dev, true);
    for (const a of addrs) {
      const ifc = a.ifc;
      if (seenIp[a.ip]) add({ id: 'if-dup-ip-local', sev: 'critical', cat: 'Interfaces', dev, line: ifc.line, iface: ifc.name, ips: [a.ip], tags: ['ip address', 'duplicate'],
        title: 'IP ' + a.ip + ' is configured on both ' + seenIp[a.ip].short + ' and ' + ifc.short, detail: 'An address can only exist once.',
        fix: cfgIf(ifc, 'ip address <correct-ip> ' + a.mask), verify: ['show ip interface brief'] });
      seenIp[a.ip] = ifc;
    }
    for (const name of dev.interfaceOrder) {
      const ifc = dev.interfaces[name];
      for (const a of ifc.ipv4) {
        if (N.maskToPrefix(a.mask) < 0) { add({ id: 'if-bad-mask', sev: 'critical', cat: 'Interfaces', dev, line: a.line, iface: name, tags: ['ip address', 'mask', 'subnet'],
          title: name + ': invalid subnet mask ' + a.mask, detail: 'The mask is not contiguous.', fix: cfgIf(ifc, 'ip address ' + a.ip + ' <valid-mask>'), verify: ['show ip interface ' + ifc.short] }); continue; }
        if (!N.isHostAddress(a.ip, a.mask)) add({ id: 'if-net-or-bcast', sev: 'critical', cat: 'Interfaces', dev, line: a.line, iface: name, ips: [a.ip], tags: ['ip address', 'mask', 'subnet'],
          title: ifc.short + ': ' + a.ip + '/' + N.maskToPrefix(a.mask) + ' is the network or broadcast address', detail: 'Use a usable host address in ' + N.cidr(a.ip, a.mask) + '.',
          fix: cfgIf(ifc, 'ip address <host-ip> ' + a.mask), verify: ['show ip interface brief'] });
      }
      const hasConfig = ifc.ipv4.length || ifc.switchport.explicit || ifc.encapsulation || ifc.channelGroup || ifc.description;
      if (ifc.shutdown && hasConfig && !/^Vlan1$/.test(name)) add({ id: 'if-shutdown', sev: ifc.ipv4.length || ifc.description ? 'warning' : 'info', cat: 'Interfaces', dev, line: ifc.line, iface: name, tags: ['interface down', 'shutdown', 'link'],
        title: ifc.short + ' is administratively shut down but configured' + (ifc.description ? ' ("' + ifc.description + '")' : ''),
        detail: 'The interface has configuration (' + [ifc.ipv4.length && 'IP address', ifc.switchport.explicit && 'switchport settings', ifc.description && 'description'].filter(Boolean).join(', ') + ') but is disabled with "shutdown". If it should carry traffic, enable it.',
        fix: cfgIf(ifc, 'no shutdown'), verify: ['show ip interface brief   → Status "up", Protocol "up"', 'show interfaces ' + ifc.short + ' status'] });
      if (name.includes('.')) {
        const parent = dev.interfaces[name.split('.')[0]];
        if (parent && parent.shutdown && !ifc.shutdown) add({ id: 'if-parent-down', sev: 'critical', cat: 'Interfaces', dev, line: parent.line, iface: parent.name, tags: ['router on a stick', 'subinterface', 'interface down', 'vlan', 'inter-vlan'],
          title: 'Parent ' + parent.short + ' is shut down, so subinterface ' + ifc.short + ' is down too', detail: 'Subinterfaces inherit the state of the physical interface.',
          fix: cfgIf(parent, 'no shutdown'), verify: ['show ip interface brief | include ' + parent.short] });
        if (ifc.ipv4.length && !ifc.encapsulation) add({ id: 'if-subif-no-encap', sev: 'critical', cat: 'Interfaces', dev, line: ifc.line, iface: name, tags: ['router on a stick', 'subinterface', 'vlan', 'inter-vlan', 'trunk'],
          title: ifc.short + ' has an IP address but no "encapsulation dot1Q"', detail: 'Without encapsulation the subinterface does not belong to any VLAN and cannot send or receive frames.',
          fix: cfgIf(ifc, 'encapsulation dot1Q <vlan-id>', 'ip address ' + (ifc.ipv4[0] ? ifc.ipv4[0].ip + ' ' + ifc.ipv4[0].mask : '<ip> <mask>')), verify: ['show vlans   (on the router)', 'show ip interface brief'] });
        const sub = Number(name.split('.')[1]);
        if (ifc.encapsulation && ifc.encapsulation.type === 'dot1q' && ifc.encapsulation.vlan !== sub) add({ id: 'if-subif-vlan-number', sev: 'warning', cat: 'Interfaces', dev, line: ifc.encapsulation.line, iface: name, vlans: [ifc.encapsulation.vlan, sub], tags: ['router on a stick', 'subinterface', 'vlan', 'inter-vlan'],
          title: ifc.short + ' is tagged with VLAN ' + ifc.encapsulation.vlan + ', not VLAN ' + sub,
          detail: 'The subinterface number does not have to match the VLAN, but it almost always does by convention. ' + (ifc.description ? 'Description: "' + ifc.description + '". ' : '') + 'Check that VLAN ' + ifc.encapsulation.vlan + ' is really the VLAN of subnet ' + (ifc.ipv4[0] ? N.cidr(ifc.ipv4[0].ip, ifc.ipv4[0].mask) : '?') + '.',
          fix: cfgIf(ifc, 'encapsulation dot1Q ' + sub), verify: ['show vlans', 'show interfaces ' + ifc.short, 'ping a host in that VLAN'] });
      }
      if (ifc.duplex && ifc.duplex.value === 'half') add({ id: 'if-half-duplex', sev: 'warning', cat: 'Interfaces', dev, line: ifc.duplex.line, iface: name, tags: ['slow', 'duplex', 'errors', 'performance', 'collisions'],
        title: ifc.short + ' is forced to half duplex', detail: 'If the other end runs full duplex (or auto) you get a duplex mismatch: late collisions, CRC errors and very slow throughput.',
        fix: cfgIf(ifc, 'duplex auto', 'speed auto'), verify: ['show interfaces ' + ifc.short + '   → "Full-duplex", no late collisions/CRC increasing', 'show interfaces ' + ifc.short + ' counters errors'] });
      if (ifc.isL2 && ifc.mode === 'access' && (ifc.switchport.trunkAllowedRaw || ifc.switchport.nativeVlan)) add({ id: 'if-access-with-trunk-cmds', sev: 'info', cat: 'Switching / VLANs', dev, line: ifc.line, iface: name, tags: ['trunk', 'vlan'],
        title: ifc.short + ' is an access port but has trunk settings', detail: 'The trunk commands are ignored while the port is in access mode. Was it supposed to be a trunk?',
        fix: cfgIf(ifc, 'switchport mode trunk'), verify: ['show interfaces trunk', 'show interfaces ' + ifc.short + ' switchport'] });
      if (ifc.isL2 && ifc.mode === 'trunk' && ifc.switchport.accessVlan) add({ id: 'if-trunk-with-access-vlan', sev: 'info', cat: 'Switching / VLANs', dev, line: ifc.switchport.accessLine, iface: name, tags: ['trunk', 'vlan'],
        title: ifc.short + ' is a trunk but has "switchport access vlan ' + ifc.switchport.accessVlan + '"', detail: 'The access VLAN is ignored on a trunk. If the port should be an access port, change the mode.',
        fix: cfgIf(ifc, 'switchport mode access'), verify: ['show interfaces ' + ifc.short + ' switchport'] });
      const ps = ifc.switchport.portSecurity;
      if (ps && ps.enabled && ifc.switchport.voiceVlan && ps.maximum < 2) add({ id: 'if-portsec-phone', sev: 'warning', cat: 'Switching / VLANs', dev, line: ps.line, iface: name, tags: ['port-security', 'err-disabled', 'phone', 'voice'],
        title: ifc.short + ': port-security maximum ' + ps.maximum + ' with a voice VLAN', detail: 'An IP phone plus a PC need at least 2 (often 3) MAC addresses. The port will be err-disabled.',
        fix: cfgIf(ifc, 'switchport port-security maximum 3'), verify: ['show port-security interface ' + ifc.short, 'show interfaces status err-disabled'] });
      if (ps && ps.enabled && ps.violation === 'shutdown') ifc._portsec = true;
      if (ifc.helpers.some(hp => T.l3Addresses(dev, true).some(a => a.ip === hp.ip))) add({ id: 'dhcp-helper-self', sev: 'warning', cat: 'DHCP', dev, iface: name, tags: ['dhcp'],
        title: ifc.short + ': ip helper-address points to this device itself', detail: 'A relay to its own address is pointless; if this device is the DHCP server, the pool answers locally anyway.',
        fix: cfgIf(ifc, 'no ip helper-address ' + ifc.helpers[0].ip), verify: ['show ip dhcp binding'] });
      if (ifc.ipv6.length && !dev.ipv6Routing && dev.type !== 'switch' && dev.interfaceOrder.filter(n => dev.interfaces[n].ipv6.length).length > 1) {
        if (!dev._v6flag) add({ id: 'if-ipv6-routing', sev: 'warning', cat: 'Routing', dev, tags: ['ipv6', 'routing'],
          title: 'IPv6 addresses configured but "ipv6 unicast-routing" is missing', detail: 'Without it the router does not forward IPv6 between interfaces and does not send Router Advertisements (SLAAC clients get no gateway).',
          fix: ['ipv6 unicast-routing'], verify: ['show ipv6 interface brief', 'show ipv6 route', 'ping ipv6 <remote-address>'] });
        dev._v6flag = true;
      }
    }
    // Overlapping subnets on different interfaces of the same device.
    const up = T.l3Addresses(dev, false);
    for (let i = 0; i < up.length; i++) for (let j = i + 1; j < up.length; j++) {
      const a = up[i], b = up[j];
      if (a.ifc === b.ifc || a.ip === b.ip) continue;
      if (N.subnetsOverlap(a.net, a.mask, b.net, b.mask)) add({ id: 'if-overlap', sev: 'critical', cat: 'Interfaces', dev, line: b.ifc.line, iface: b.ifc.name, ips: [a.ip, b.ip], tags: ['ip address', 'subnet', 'overlap', 'routing'],
        title: 'Overlapping subnets: ' + a.ifc.short + ' ' + N.cidr(a.ip, a.mask) + ' and ' + b.ifc.short + ' ' + N.cidr(b.ip, b.mask), detail: 'Two interfaces cannot be in the same/overlapping subnet; traffic will go out the wrong one.',
        fix: cfgIf(b.ifc, 'ip address <ip-in-another-subnet> <mask>'), verify: ['show ip route connected'] });
    }
    // Encapsulation duplicates
    const encs = {};
    for (const name of dev.interfaceOrder) {
      const ifc = dev.interfaces[name];
      if (!ifc.encapsulation || ifc.encapsulation.type !== 'dot1q') continue;
      const parent = name.split('.')[0];
      const k = parent + '|' + ifc.encapsulation.vlan;
      if (encs[k]) add({ id: 'if-subif-dup-vlan', sev: 'critical', cat: 'Interfaces', dev, line: ifc.encapsulation.line, iface: name, vlans: [ifc.encapsulation.vlan], tags: ['router on a stick', 'subinterface', 'vlan'],
        title: 'VLAN ' + ifc.encapsulation.vlan + ' is used by both ' + encs[k].short + ' and ' + ifc.short, detail: 'Each VLAN can only be terminated on one subinterface per physical port.',
        fix: cfgIf(ifc, 'encapsulation dot1Q <correct-vlan>'), verify: ['show vlans'] });
      encs[k] = ifc;
    }
  }

  // ---------------------------------------------------------- switching
  function checkSwitching(dev, add, model) {
    if (dev.type === 'router') return;
    const ports = dev.interfaceOrder.map(n => dev.interfaces[n]).filter(i => i.isL2);
    const access = ports.filter(i => i.mode === 'access' && !i.shutdown);
    const trunks = ports.filter(i => i.mode === 'trunk' && !i.shutdown);
    const vlanKnown = dev.vlanStatements;
    const usedVlans = {};
    for (const p of access) {
      const v = p.switchport.accessVlan || 1;
      (usedVlans[v] = usedVlans[v] || []).push(p);
      if (p.switchport.voiceVlan) (usedVlans[p.switchport.voiceVlan] = usedVlans[p.switchport.voiceVlan] || []).push(p);
    }
    if (vlanKnown) {
      for (const v of Object.keys(usedVlans).map(Number)) {
        if (v === 1 || dev.vlans[v]) continue;
        const ps = usedVlans[v];
        add({ id: 'vlan-missing', sev: 'critical', cat: 'Switching / VLANs', dev, line: ps[0].switchport.accessLine || ps[0].line, iface: ps[0].name, vlans: [v], tags: ['vlan', 'access port', 'dhcp', 'no connectivity'],
          title: 'VLAN ' + v + ' is assigned to ' + ps.map(p => p.short).join(', ') + ' but does not exist',
          detail: 'Ports in a VLAN that is not in the VLAN database are inactive – hosts get no link to anything (and no DHCP address). Newer IOS creates the VLAN automatically when you assign it, but this configuration does not contain it.',
          fix: ['vlan ' + v, ' name <name>'], verify: ['show vlan brief   → VLAN ' + v + ' active, ports listed', 'show interfaces ' + ps[0].short + ' switchport   → "Access Mode VLAN: ' + v + '"'] });
      }
      for (const name of dev.interfaceOrder) {
        const m = name.match(/^Vlan(\d+)$/);
        if (!m) continue;
        const v = Number(m[1]);
        const svi = dev.interfaces[name];
        if (v !== 1 && !dev.vlans[v] && !svi.shutdown) add({ id: 'svi-no-vlan', sev: 'warning', cat: 'Switching / VLANs', dev, line: svi.line, iface: name, vlans: [v], tags: ['svi', 'vlan', 'interface down', 'inter-vlan', 'management'],
          title: 'SVI ' + name + ' exists but VLAN ' + v + ' is not defined', detail: 'An SVI is only up/up if the VLAN exists and at least one port in that VLAN (or a trunk carrying it) is up.',
          fix: ['vlan ' + v], verify: ['show ip interface brief | include Vlan' + v, 'show vlan brief'] });
      }
    }
    // SVIs with no port that carries the VLAN
    for (const name of dev.interfaceOrder) {
      const m = name.match(/^Vlan(\d+)$/);
      if (!m) continue;
      const v = Number(m[1]);
      const svi = dev.interfaces[name];
      if (svi.shutdown || !svi.ipv4.length) continue;
      const carried = (usedVlans[v] || []).length || trunks.some(t => !t.switchport.trunkAllowed || t.switchport.trunkAllowed.has(v));
      if (!carried) add({ id: 'svi-no-ports', sev: 'warning', cat: 'Switching / VLANs', dev, line: svi.line, iface: name, vlans: [v], tags: ['svi', 'vlan', 'interface down', 'management', 'inter-vlan'],
        title: name + ' will be up/down: no access port or trunk carries VLAN ' + v, detail: 'The SVI line protocol only comes up when an active port in VLAN ' + v + ' exists.',
        fix: ['interface <port>', ' switchport access vlan ' + v, '! or allow the VLAN on a trunk:', 'interface <trunk>', ' switchport trunk allowed vlan add ' + v], verify: ['show ip interface brief | include Vlan' + v] });
    }
    // Access VLANs not carried on any trunk
    if (trunks.length) {
      for (const v of Object.keys(usedVlans).map(Number)) {
        const hasSvi = dev.interfaces['Vlan' + v] && !dev.interfaces['Vlan' + v].shutdown && dev.ipRouting;
        if (hasSvi) continue;
        if (!trunks.some(t => !t.switchport.trunkAllowed || t.switchport.trunkAllowed.has(v))) {
          const tr = trunks[0];
          add({ id: 'vlan-not-on-trunk', sev: 'critical', cat: 'Switching / VLANs', dev, line: tr.switchport.allowedLine || tr.line, iface: tr.name, vlans: [v], tags: ['vlan', 'trunk', 'dhcp', 'no connectivity', 'inter-vlan', 'gateway'],
            title: 'VLAN ' + v + ' has access ports (' + usedVlans[v].map(p => p.short).slice(0, 4).join(', ') + ') but no trunk carries it',
            detail: 'Hosts in VLAN ' + v + ' can only talk to each other on this switch. They cannot reach their gateway or a DHCP server elsewhere. Allowed on trunks: ' + trunks.map(t => t.short + ' = ' + (t.switchport.trunkAllowedRaw || 'all')).join('; ') + '.',
            fix: cfgIf(tr, 'switchport trunk allowed vlan add ' + v), verify: ['show interfaces trunk   → VLAN ' + v + ' under "allowed and active"', 'ping the gateway from a host in VLAN ' + v] });
        }
      }
    }
    for (const t of trunks) {
      if (t.switchport.trunkAllowed && vlanKnown) {
        const missing = [...t.switchport.trunkAllowed].filter(v => v !== 1 && !dev.vlans[v] && v < 1002);
        if (missing.length && missing.length < 20) add({ id: 'trunk-vlan-undefined', sev: 'info', cat: 'Switching / VLANs', dev, line: t.switchport.allowedLine, iface: t.name, vlans: missing, tags: ['trunk', 'vlan'],
          title: t.short + ' allows VLAN ' + missing.join(', ') + ' which does not exist on this switch', detail: 'The VLAN will not be forwarded ("allowed" but not "active") until it is created.',
          fix: missing.map(v => 'vlan ' + v), verify: ['show interfaces trunk'] });
      }
      if (!t.switchport.nativeVlan || t.switchport.nativeVlan === 1) t._native1 = true;
    }
    const native1 = trunks.filter(t => t._native1);
    if (native1.length) add({ id: 'sec-native-vlan1', sev: 'info', cat: 'Security', dev, iface: native1[0].name, tags: ['trunk', 'native vlan', 'security'],
      title: 'Trunk(s) use native VLAN 1: ' + native1.map(t => t.short).join(', '), detail: 'Best practice is an unused native VLAN to prevent VLAN hopping. It must be the same on both ends of the trunk.',
      fix: cfgIf(native1[0], 'switchport trunk native vlan <unused-vlan>'), verify: ['show interfaces trunk', 'show cdp neighbors / no "Native VLAN mismatch" logs'] });
    const dtp = ports.filter(i => !i.shutdown && (i.mode.startsWith('dynamic')) && (i.switchport.explicit || i.description));
    if (dtp.length) add({ id: 'sw-dtp', sev: 'info', cat: 'Switching / VLANs', dev, iface: dtp[0].name, tags: ['trunk', 'dtp', 'security'],
      title: dtp.length + ' port(s) rely on DTP (dynamic mode): ' + dtp.slice(0, 5).map(p => p.short).join(', '), detail: 'Two "dynamic auto" ports never form a trunk, and DTP lets attackers negotiate a trunk. Set the mode explicitly.',
      fix: cfgIf(dtp[0], 'switchport mode access   ! or: switchport mode trunk'), verify: ['show interfaces ' + dtp[0].short + ' switchport   → Administrative/Operational Mode'] });
    const unused = ports.filter(i => !i.shutdown && !i.switchport.explicit && !i.description && !i.channelGroup && !i.lines.length);
    if (unused.length >= 2) add({ id: 'sec-unused-ports', sev: 'info', cat: 'Security', dev, iface: unused[0].name, tags: ['security', 'unused ports'],
      title: unused.length + ' unconfigured port(s) are enabled (' + unused.slice(0, 4).map(p => p.short).join(', ') + (unused.length > 4 ? ', …' : '') + ')',
      detail: 'Unused ports should be shut down and placed in an unused VLAN.',
      fix: ['interface range ' + unused[0].short + ' - ' + unused[unused.length - 1].name.split('/').pop(), ' switchport mode access', ' switchport access vlan <unused-vlan>', ' shutdown'], verify: ['show interfaces status'] });
    const pfNoGuard = access.filter(p => p.portfast && !p.bpduguard);
    if (pfNoGuard.length && !dev.top.some(n => /^spanning-tree portfast (edge )?bpduguard default/.test(n.text))) add({ id: 'stp-bpduguard', sev: 'info', cat: 'Switching / VLANs', dev, iface: pfNoGuard[0].name, tags: ['stp', 'spanning-tree', 'loop', 'portfast'],
      title: 'PortFast without BPDU Guard on ' + pfNoGuard.length + ' port(s)', detail: 'If someone connects a switch to a PortFast port a loop can form before STP reacts.',
      fix: ['spanning-tree portfast bpduguard default'], verify: ['show spanning-tree summary   → "BPDU Guard Default is enabled"'] });
    if (dev.stpMode && dev.stpMode !== 'rapid-pvst' && dev.stpMode !== 'mst') add({ id: 'stp-mode', sev: 'info', cat: 'Switching / VLANs', dev, tags: ['stp', 'spanning-tree', 'slow', 'convergence'],
      title: 'Spanning tree runs ' + dev.stpMode + ' (legacy 802.1D)', detail: 'Classic PVST+ takes 30–50 s to converge (ports stay in listening/learning). Rapid PVST+ converges in seconds.',
      fix: ['spanning-tree mode rapid-pvst'], verify: ['show spanning-tree summary'] });
    // Switch management / default gateway
    const svis = dev.interfaceOrder.filter(n => /^Vlan\d+$/.test(n)).map(n => dev.interfaces[n]).filter(i => i.ipv4.length && !i.shutdown);
    if (!dev.ipRouting) {
      if (svis.length && !dev.defaultGateway) add({ id: 'sw-no-default-gateway', sev: 'warning', cat: 'Management', dev, iface: svis[0].name, tags: ['management', 'gateway', 'ssh', 'telnet', 'ping', 'remote access'],
        title: 'Layer-2 switch has a management IP but no "ip default-gateway"', detail: 'The switch can only be reached from its own subnet ' + N.cidr(svis[0].ipv4[0].ip, svis[0].ipv4[0].mask) + '. Remote management from other networks fails.',
        fix: ['ip default-gateway <router-ip-in-' + N.cidr(svis[0].ipv4[0].ip, svis[0].ipv4[0].mask) + '>'], verify: ['show running-config | include default-gateway', 'ping <ip-in-another-subnet> (from the switch)'] });
      if (dev.defaultGateway && svis.length && !svis.some(s => s.ipv4.some(a => N.inSubnet(dev.defaultGateway.ip, a.ip, a.mask)))) add({ id: 'sw-gateway-wrong-subnet', sev: 'critical', cat: 'Management', dev, line: dev.defaultGateway.line, ips: [dev.defaultGateway.ip], tags: ['management', 'gateway', 'ssh', 'telnet', 'ping', 'remote access'],
        title: 'ip default-gateway ' + dev.defaultGateway.ip + ' is not in the management subnet', detail: 'The gateway must be in the same subnet as an SVI (' + svis.map(s => s.short + ' ' + N.cidr(s.ipv4[0].ip, s.ipv4[0].mask)).join(', ') + '). Probably a typo.',
        fix: ['ip default-gateway <router-ip-in-' + N.cidr(svis[0].ipv4[0].ip, svis[0].ipv4[0].mask) + '>'], verify: ['show running-config | include default-gateway', 'ping <ip-in-another-subnet> (from the switch)'] });
      const sviNets = new Set(svis.map(s => N.cidr(s.ipv4[0].ip, s.ipv4[0].mask)));
      if (sviNets.size > 1) add({ id: 'sw-no-ip-routing', sev: 'warning', cat: 'Routing', dev, iface: svis[0].name, tags: ['inter-vlan', 'routing', 'svi', 'gateway', 'layer 3 switch'],
        title: 'Several SVIs with IP addresses but "ip routing" is not enabled', detail: 'Without "ip routing" a multilayer switch does not route between VLANs: ' + [...sviNets].join(', ') + '. Hosts using these SVIs as gateway cannot reach other VLANs.',
        fix: ['ip routing'], verify: ['show ip route   → connected routes for every SVI', 'ping between hosts in different VLANs'] });
      if (dev.staticRoutes.length) add({ id: 'sw-static-no-routing', sev: 'warning', cat: 'Routing', dev, line: dev.staticRoutes[0].line, tags: ['routing', 'static route'],
        title: 'Static routes configured but "ip routing" is off', detail: 'The switch is not routing, so the routes are not used (only "ip default-gateway" is).',
        fix: ['ip routing'], verify: ['show ip route'] });
    } else if (dev.defaultGateway) add({ id: 'sw-default-gateway-ignored', sev: 'info', cat: 'Routing', dev, line: dev.defaultGateway.line, tags: ['routing', 'gateway', 'layer 3 switch'],
      title: '"ip default-gateway" is ignored because "ip routing" is enabled', detail: 'A routing switch needs a default route instead.',
      fix: ['ip route 0.0.0.0 0.0.0.0 ' + dev.defaultGateway.ip], verify: ['show ip route   → "Gateway of last resort is …"'] });
    // EtherChannel consistency
    const groups = {};
    for (const p of ports) if (p.channelGroup) (groups[p.channelGroup.id] = groups[p.channelGroup.id] || []).push(p);
    for (const p of dev.interfaceOrder.map(n => dev.interfaces[n]).filter(i => !i.isL2 && i.channelGroup)) (groups[p.channelGroup.id] = groups[p.channelGroup.id] || []).push(p);
    for (const id of Object.keys(groups)) {
      const mem = groups[id];
      const sig = p => [p.mode, p.switchport.accessVlan || 1, p.switchport.trunkAllowedRaw || 'all', p.switchport.nativeVlan || 1, p.speed || 'auto', (p.duplex && p.duplex.value) || 'auto'].join('|');
      const sigs = new Set(mem.map(sig));
      if (sigs.size > 1) add({ id: 'etherchannel-inconsistent', sev: 'critical', cat: 'Switching / VLANs', dev, line: mem[0].line, iface: mem[0].name, tags: ['etherchannel', 'port-channel', 'trunk', 'suspended'],
        title: 'Port-channel ' + id + ' members have different settings', detail: 'All members must have identical mode, VLANs, native VLAN, speed and duplex or they are suspended. Members: ' + mem.map(p => p.short + ' (' + sig(p).replace(/\|/g, ', ') + ')').join('; ') + '.',
        fix: ['interface range <members>', ' ! apply the same switchport/speed/duplex settings to all members', 'interface Port-channel' + id, ' ! configure VLAN settings on the Port-channel – they are pushed to the members'],
        verify: ['show etherchannel summary   → members flagged (P)', 'show interfaces port-channel ' + id + ' etherchannel'] });
      const modes = new Set(mem.map(p => p.channelGroup.mode));
      if (modes.has('on') && modes.size > 1) add({ id: 'etherchannel-mode-mix', sev: 'critical', cat: 'Switching / VLANs', dev, line: mem[0].channelGroup.line, iface: mem[0].name, tags: ['etherchannel', 'port-channel'],
        title: 'Port-channel ' + id + ' mixes mode "on" with negotiated modes', detail: 'Use the same mode family on all members (on / LACP active-passive / PAgP desirable-auto).',
        fix: ['interface range <members>', ' channel-group ' + id + ' mode active'], verify: ['show etherchannel summary'] });
      if (!dev.interfaces['Port-channel' + id]) add({ id: 'etherchannel-no-po', sev: 'info', cat: 'Switching / VLANs', dev, iface: mem[0].name, tags: ['etherchannel', 'port-channel'],
        title: 'Interface Port-channel' + id + ' is not in the configuration', detail: 'It is normally created automatically. Make sure the logical interface has the intended VLAN/trunk settings.',
        fix: ['interface Port-channel' + id], verify: ['show etherchannel summary'] });
    }
  }

  // ------------------------------------------------------------- routing
  function wildcardLooksLikeMask(w) {
    if (!N.isIp(w) || w === '255.255.255.255' || w === '0.0.0.0') return false;
    return N.wildcardToPrefix(w) < 0 && N.maskToPrefix(w) > 0;
  }

  function checkRouting(dev, add, model) {
    const addrs = T.l3Addresses(dev, true);
    const upAddrs = T.l3Addresses(dev, false);
    const inv = w => N.intToIp(~N.ipToInt(w) >>> 0);
    for (const o of dev.ospf) {
      for (const n of o.networks) {
        if (wildcardLooksLikeMask(n.wild)) add({ id: 'ospf-mask-as-wildcard', sev: 'critical', cat: 'Routing', dev, line: n.line, tags: ['ospf', 'routing', 'neighbor', 'missing route', 'wildcard'],
          title: 'OSPF network statement uses a subnet mask instead of a wildcard: "network ' + n.addr + ' ' + n.wild + ' area ' + n.areaRaw + '"',
          detail: 'OSPF expects a wildcard mask (inverse mask). ' + n.wild + ' means "ignore the first ' + (N.maskToPrefix(n.wild)) + ' bits", so the statement matches the wrong interfaces. Use ' + inv(n.wild) + '.',
          fix: ['router ospf ' + o.pid, ' no network ' + n.addr + ' ' + n.wild + ' area ' + n.areaRaw, ' network ' + n.addr + ' ' + inv(n.wild) + ' area ' + n.areaRaw],
          verify: ['show ip ospf interface brief   → the interface is listed in area ' + n.areaRaw, 'show ip protocols', 'show ip route ospf (on the neighbor)'] });
        else if (N.isIp(n.wild) && !addrs.some(a => N.wildcardMatch(a.ip, n.addr, n.wild))) add({ id: 'ospf-network-no-match', sev: 'warning', cat: 'Routing', dev, line: n.line, tags: ['ospf', 'routing', 'missing route', 'neighbor'],
          title: 'OSPF "network ' + n.addr + ' ' + n.wild + ' area ' + n.areaRaw + '" matches no interface', detail: 'No interface IP falls inside this statement, so it does nothing. Typo in the address or wildcard?',
          fix: ['router ospf ' + o.pid, ' no network ' + n.addr + ' ' + n.wild + ' area ' + n.areaRaw, ' network <interface-network> <wildcard> area ' + n.areaRaw], verify: ['show ip ospf interface brief'] });
      }
      if (!o.routerId && !dev.interfaceOrder.some(nm => /^Loopback/.test(nm) && dev.interfaces[nm].ipv4.length)) add({ id: 'ospf-no-rid', sev: 'info', cat: 'Routing', dev, line: o.line, tags: ['ospf'],
        title: 'OSPF ' + o.pid + ' has no router-id and no loopback', detail: 'The router ID will be the highest active interface IP and may change when that interface goes down (after an OSPF restart).',
        fix: ['router ospf ' + o.pid, ' router-id <x.x.x.x>', 'end', 'clear ip ospf process'], verify: ['show ip protocols | include Router ID'] });
      const areas = new Set(o.networks.map(n => n.area));
      dev.interfaceOrder.forEach(nm => { const a = dev.interfaces[nm].ospf.area; if (a && a.pid === o.pid) areas.add(a.area); });
      if (areas.size > 1 && !areas.has('0')) add({ id: 'ospf-no-backbone', sev: 'warning', cat: 'Routing', dev, line: o.line, tags: ['ospf', 'area', 'missing route'],
        title: 'OSPF ' + o.pid + ' has several areas but none of them is area 0', detail: 'Inter-area routes are only exchanged through the backbone (area 0) – an ABR must have an interface in area 0 (or a virtual link).',
        fix: ['router ospf ' + o.pid, ' network <backbone-network> <wildcard> area 0'], verify: ['show ip ospf   → "Area BACKBONE(0)"', 'show ip route ospf   → "O IA" routes'] });
      for (const p of o.passive) {
        if (!dev.interfaces[p]) add({ id: 'ospf-passive-unknown', sev: 'info', cat: 'Routing', dev, line: o.line, tags: ['ospf', 'passive'],
          title: 'passive-interface ' + p + ' refers to an interface that is not in the config', detail: 'Check the interface name.', fix: [], verify: ['show ip protocols'] });
      }
    }
    for (const e of dev.eigrp) {
      for (const n of e.networks) {
        if (n.wild && wildcardLooksLikeMask(n.wild)) {
          add({ id: 'eigrp-mask-as-wildcard', sev: 'warning', cat: 'Routing', dev, line: n.line, tags: ['eigrp', 'routing', 'wildcard', 'neighbor'],
            title: 'EIGRP network statement uses a subnet mask as wildcard: "network ' + n.addr + ' ' + n.wild + '"',
            detail: 'Newer IOS converts a subnet mask automatically, but older IOS and Packet Tracer may not. Use the wildcard ' + inv(n.wild) + ' to be sure.',
            fix: ['router eigrp ' + e.asn, ' no network ' + n.addr + ' ' + n.wild, ' network ' + n.addr + ' ' + inv(n.wild)], verify: ['show ip eigrp interfaces', 'show ip protocols'] });
          continue;
        }
        const wild = n.wild || inv(T.classfulMask(n.addr));
        if (N.isIp(n.addr) && !addrs.some(a => N.wildcardMatch(a.ip, n.addr, wild))) add({ id: 'eigrp-network-no-match', sev: 'warning', cat: 'Routing', dev, line: n.line, tags: ['eigrp', 'routing', 'missing route', 'neighbor'],
          title: 'EIGRP "network ' + n.addr + (n.wild ? ' ' + n.wild : '') + '" matches no interface', detail: 'No interface is enabled for EIGRP by this statement.',
          fix: ['router eigrp ' + e.asn, ' network <interface-network> <wildcard>'], verify: ['show ip eigrp interfaces'] });
      }
      const ver = parseFloat(dev.version || '15');
      if (e.autoSummary === true || (e.autoSummary === null && ver < 15 && !e.named)) add({ id: 'eigrp-auto-summary', sev: 'warning', cat: 'Routing', dev, line: e.line, tags: ['eigrp', 'routing', 'missing route', 'summarization', 'discontiguous'],
        title: 'EIGRP ' + e.asn + ' performs auto-summary', detail: 'Classful auto-summarization breaks discontiguous networks (e.g. 10.1.1.0/24 and 10.2.2.0/24 separated by 172.16.x.x) – routes disappear or traffic is load-shared to the wrong place.',
        fix: ['router eigrp ' + e.asn, ' no auto-summary'], verify: ['show ip protocols   → "Automatic network summarization is not in effect"', 'show ip route eigrp'] });
    }
    if (dev.rip) {
      const r = dev.rip;
      if (r.version !== 2) add({ id: 'rip-v1', sev: 'warning', cat: 'Routing', dev, line: r.line, tags: ['rip', 'routing', 'missing route', 'vlsm'],
        title: 'RIP is running version 1', detail: 'RIPv1 is classful: it does not send subnet masks, so VLSM and discontiguous networks fail.',
        fix: ['router rip', ' version 2', ' no auto-summary'], verify: ['show ip protocols   → "Default version control: send version 2, receive version 2"', 'debug ip rip'] });
      else if (r.autoSummary !== false) add({ id: 'rip-auto-summary', sev: 'warning', cat: 'Routing', dev, line: r.line, tags: ['rip', 'routing', 'summarization', 'missing route'],
        title: 'RIPv2 without "no auto-summary"', detail: 'Routes are summarized at classful boundaries, which breaks discontiguous subnets.',
        fix: ['router rip', ' no auto-summary'], verify: ['show ip route rip'] });
      for (const n of r.networks) if (!addrs.some(a => N.inSubnet(a.ip, n.addr, T.classfulMask(n.addr)))) add({ id: 'rip-network-no-match', sev: 'warning', cat: 'Routing', dev, line: n.line, tags: ['rip', 'routing'],
        title: 'RIP "network ' + n.addr + '" matches no interface', detail: 'RIP network statements are classful; this one enables no interface.',
        fix: ['router rip', ' no network ' + n.addr, ' network <classful-network>'], verify: ['show ip protocols'] });
    }
    // Interfaces not advertised by the routing protocol in use
    const runs = dev.ospf.length || dev.eigrp.length || dev.rip;
    if (runs && dev.ipRouting) {
      const enabled = new Set([...model.protocols.ospf.ifs, ...model.protocols.eigrp.ifs, ...model.protocols.rip.ifs].filter(x => x.dev === dev).map(x => x.ifc.name));
      const redistConn = [...dev.ospf, ...dev.eigrp, ...(dev.rip ? [dev.rip] : [])].some(p => (p.redistribute || []).some(r => r.proto === 'connected'));
      if (!redistConn) for (const a of upAddrs) {
        if (a.secondary || enabled.has(a.ifc.name) || a.ifc.nat === 'outside') continue;
        if (model.segments.find(s => s.key === a.net + '/' + a.prefix && s.members.some(m => m.dev !== dev))) continue; // transit link handled elsewhere
        add({ id: 'route-not-advertised', sev: 'info', cat: 'Routing', dev, line: a.ifc.line, iface: a.ifc.name, ips: [a.ip], tags: ['routing', 'missing route', 'ospf', 'eigrp', 'rip', 'no connectivity', 'remote network'],
          title: a.ifc.short + ' ' + N.cidr(a.ip, a.mask) + ' is not advertised by any routing protocol', detail: 'Other routers will not learn this network unless they have a static route to it. Is that intended?',
          fix: dev.ospf.length ? ['router ospf ' + dev.ospf[0].pid, ' network ' + a.net + ' ' + N.intToIp(~N.ipToInt(a.mask) >>> 0) + ' area <area>'] : dev.eigrp.length ? ['router eigrp ' + dev.eigrp[0].asn, ' network ' + a.net + ' ' + N.intToIp(~N.ipToInt(a.mask) >>> 0)] : ['router rip', ' network ' + a.net],
          verify: ['show ip protocols', 'show ip route ' + a.net + '   (on a remote router)'] });
      }
    }
    // Static routes
    for (const s of dev.staticRoutes) {
      if (s.vrf) continue;
      if (s.nextHop && addrs.some(a => a.ip === s.nextHop)) add({ id: 'static-nexthop-self', sev: 'critical', cat: 'Routing', dev, line: s.line, ips: [s.nextHop], tags: ['static route', 'routing', 'missing route'],
        title: 'Static route points to this router\'s own address: ' + s.raw, detail: 'The next hop must be the neighbor\'s address, not your own.',
        fix: ['no ' + s.raw, 'ip route ' + s.prefix + ' ' + s.mask + ' <neighbor-ip>'], verify: ['show ip route static', 'traceroute ' + s.prefix] });
      else if (s.nextHop && !s.iface && !upAddrs.some(a => N.inSubnet(s.nextHop, a.ip, a.mask))) {
        const rib = model.ribs[dev.id];
        const viaOther = rib.find(r => r.static !== s && r.code !== 'S*' && N.inSubnet(s.nextHop, r.net, r.mask));
        const downNet = addrs.find(a => N.inSubnet(s.nextHop, a.ip, a.mask));
        if (!viaOther) add({ id: 'static-nexthop-unreachable', sev: 'critical', cat: 'Routing', dev, line: s.line, ips: [s.nextHop, s.prefix], tags: ['static route', 'routing', 'missing route', 'no connectivity', 'remote network'],
          title: 'Static route next hop ' + s.nextHop + ' is not reachable: ' + s.raw,
          detail: downNet ? 'The next hop is in the subnet of ' + downNet.ifc.short + ', which is shut down, so the route is not installed.' : 'No connected subnet contains ' + s.nextHop + ', so the route is not installed in the routing table. Typo? Connected networks: ' + upAddrs.map(a => N.cidr(a.ip, a.mask)).join(', ') + '.',
          fix: downNet ? cfgIf(downNet.ifc, 'no shutdown') : ['no ' + s.raw, 'ip route ' + s.prefix + ' ' + s.mask + ' <neighbor-ip-on-a-connected-subnet>'], verify: ['show ip route static   → the route is listed', 'ping ' + s.nextHop, 'traceroute ' + s.prefix] });
      }
      if (s.iface && s.iface !== 'Null0') {
        const ifc = dev.interfaces[s.iface];
        if (!ifc) add({ id: 'static-iface-missing', sev: 'critical', cat: 'Routing', dev, line: s.line, tags: ['static route', 'routing'],
          title: 'Static route uses interface ' + s.iface + ' which does not exist', detail: s.raw, fix: ['no ' + s.raw], verify: ['show ip route static'] });
        else if (ifc.shutdown) add({ id: 'static-iface-down', sev: 'warning', cat: 'Routing', dev, line: s.line, iface: ifc.name, tags: ['static route', 'routing', 'interface down'],
          title: 'Static route exits via ' + ifc.short + ' which is shut down', detail: s.raw + ' is not installed while the interface is down.', fix: cfgIf(ifc, 'no shutdown'), verify: ['show ip route static'] });
        else if (!s.nextHop && /Ethernet/.test(ifc.name)) add({ id: 'static-ethernet-no-nh', sev: 'info', cat: 'Routing', dev, line: s.line, iface: ifc.name, tags: ['static route', 'routing', 'arp'],
          title: 'Static route out an Ethernet interface without next-hop: ' + s.raw, detail: 'The router ARPs for every destination and relies on proxy ARP of the neighbor. Add the next-hop address.',
          fix: ['no ' + s.raw, 'ip route ' + s.prefix + ' ' + s.mask + ' ' + ifc.name + ' <next-hop-ip>'], verify: ['show ip route static', 'show ip arp'] });
      }
    }
    // Device with NAT outside but no default route
    const outside = dev.interfaceOrder.map(n => dev.interfaces[n]).find(i => i.nat === 'outside');
    if (outside && dev.ipRouting && !model.ribs[dev.id].some(r => r.prefix === 0)) add({ id: 'no-default-route', sev: 'critical', cat: 'Routing', dev, iface: outside.name, tags: ['internet', 'default route', 'routing', 'nat'],
      title: 'No default route although ' + outside.short + ' is the NAT outside (Internet) interface', detail: 'Traffic to the Internet has no route and is dropped.',
      fix: ['ip route 0.0.0.0 0.0.0.0 <isp-next-hop>'], verify: ['show ip route   → "Gateway of last resort is …"', 'ping 8.8.8.8 source <inside-interface>'] });
    // BGP
    if (dev.bgp) {
      for (const n of Object.values(dev.bgp.neighbors)) {
        if (n.shutdown) add({ id: 'bgp-neighbor-shutdown', sev: 'warning', cat: 'Routing', dev, line: n.line, ips: [n.ip], tags: ['bgp', 'neighbor'],
          title: 'BGP neighbor ' + n.ip + ' is administratively shut down', detail: 'The session will stay in Idle (Admin).', fix: ['router bgp ' + dev.bgp.asn, ' no neighbor ' + n.ip + ' shutdown'], verify: ['show ip bgp summary'] });
        const ibgp = n.remoteAs === dev.bgp.asn;
        const direct = upAddrs.some(a => N.inSubnet(n.ip, a.ip, a.mask));
        if (!ibgp && !direct && !n.multihop) add({ id: 'bgp-ebgp-multihop', sev: 'warning', cat: 'Routing', dev, line: n.line, ips: [n.ip], tags: ['bgp', 'neighbor'],
          title: 'eBGP neighbor ' + n.ip + ' is not directly connected and ebgp-multihop is not set', detail: 'eBGP uses TTL 1 by default, so a session to a loopback/remote address will never come up.',
          fix: ['router bgp ' + dev.bgp.asn, ' neighbor ' + n.ip + ' ebgp-multihop 2', ' neighbor ' + n.ip + ' update-source <loopback>'], verify: ['show ip bgp summary   → State/PfxRcd shows a number'] });
        if (ibgp && !direct && !n.updateSource) add({ id: 'bgp-ibgp-update-source', sev: 'warning', cat: 'Routing', dev, line: n.line, ips: [n.ip], tags: ['bgp', 'neighbor'],
          title: 'iBGP neighbor ' + n.ip + ' (remote address) without update-source', detail: 'The session is sourced from the outgoing interface address, which the peer does not expect – it stays in Active/Idle.',
          fix: ['router bgp ' + dev.bgp.asn, ' neighbor ' + n.ip + ' update-source Loopback0'], verify: ['show ip bgp summary'] });
      }
      for (const nw of dev.bgp.networks) {
        const mask = nw.mask || T.classfulMask(nw.addr);
        if (!model.ribs[dev.id].some(r => r.net === nw.addr && r.mask === mask)) add({ id: 'bgp-network-not-in-rib', sev: 'warning', cat: 'Routing', dev, line: nw.line, tags: ['bgp', 'missing route', 'advertise'],
          title: 'BGP "network ' + nw.addr + (nw.mask ? ' mask ' + nw.mask : '') + '" has no exact match in the routing table', detail: 'BGP only advertises a network statement if exactly that prefix exists in the routing table (connected, static or IGP).',
          fix: ['ip route ' + nw.addr + ' ' + mask + ' Null0   ! if you want to advertise an aggregate'], verify: ['show ip bgp   → the prefix is listed with "*>"', 'show ip route ' + nw.addr] });
      }
    }
  }

  // ---------------------------------------------------------------- ACLs
  function covers(a, b) {
    if (!a || !b) return false;
    if (a.any) return true;
    if (b.any) return false;
    if (a.unknown || b.unknown || a.objectGroup || b.objectGroup) return false;
    const wa = N.ipToInt(a.wild), wb = N.ipToInt(b.wild);
    if (wa === null || wb === null) return false;
    if (((wa | wb) >>> 0) !== wa) return false;
    return N.wildcardMatch(b.addr, a.addr, a.wild);
  }
  function portCovers(a, b) {
    if (!a) return true;
    if (!b) return false;
    return JSON.stringify(a) === JSON.stringify(b);
  }
  function aceCovers(a, b, type) {
    if (a.proto !== 'ip' && a.proto !== b.proto) return false;
    if (!covers(a.src, b.src)) return false;
    if (type === 'standard') return true;
    if (!covers(a.dst, b.dst)) return false;
    if (!portCovers(a.srcPort, b.srcPort) || !portCovers(a.dstPort, b.dstPort)) return false;
    const ea = (a.extra || []).filter(x => x !== 'log' && x !== 'log-input');
    const eb = (b.extra || []).filter(x => x !== 'log' && x !== 'log-input');
    return ea.length === 0 || JSON.stringify(ea) === JSON.stringify(eb);
  }

  function aclRefs(dev) {
    const refs = {};
    const ref = (name, where, line) => (refs[name] = refs[name] || []).push({ where, line });
    for (const n of dev.interfaceOrder) {
      const i = dev.interfaces[n];
      if (i.accessGroup.in) ref(i.accessGroup.in.name, { kind: 'access-group', ifc: i, dir: 'in' }, i.accessGroup.in.line);
      if (i.accessGroup.out) ref(i.accessGroup.out.name, { kind: 'access-group', ifc: i, dir: 'out' }, i.accessGroup.out.line);
    }
    for (const k of ['vty', 'con', 'aux']) for (const l of dev.term[k]) if (l.accessClass) ref(l.accessClass.name, { kind: 'access-class', vty: l }, l.accessClass.line);
    for (const r of dev.nat.rules) if (r.list) ref(r.list, { kind: 'nat', rule: r }, r.line);
    for (const s of dev.snmp) if (s.acl) ref(s.acl, { kind: 'snmp' }, s.line);
    // Generic textual references (route-maps, distribute-lists, class-maps …)
    const walk = nodes => { for (const n of nodes) {
      let m;
      if ((m = n.text.match(/^(?:match ip address|distribute-list|match access-group(?: name)?|access-class|ip access-group|snmp-server .* |ntp access-group \S+)\s+(?:prefix-list\s+)?(\S+)/))) ref(m[1], { kind: 'other', text: n.text }, n.line);
      if (n.children.length) walk(n.children);
    } };
    walk(dev.top);
    return refs;
  }

  function checkAcls(dev, add, model) {
    const refs = aclRefs(dev);
    for (const [name, list] of Object.entries(refs)) {
      if (dev.acls[name] || /^\d+$/.test(name) === false && !/^[A-Za-z0-9_-]+$/.test(name)) continue;
      if (dev.acls[name]) continue;
      const w = list[0].where;
      if (w.kind === 'access-group') add({ id: 'acl-undefined', sev: 'warning', cat: 'ACL', dev, line: list[0].line, iface: w.ifc.name, tags: ['acl', 'filter', 'security'],
        title: w.ifc.short + ' applies ACL "' + name + '" ' + w.dir + ', but that ACL does not exist', detail: 'An undefined ACL permits everything, so the intended filtering is not happening. Typo in the name/number?',
        fix: ['ip access-list extended ' + name, ' ...'], verify: ['show ip interface ' + w.ifc.short + ' | include access list', 'show access-lists ' + name] });
      else if (w.kind === 'access-class') add({ id: 'acl-undefined-vty', sev: 'warning', cat: 'ACL', dev, line: list[0].line, tags: ['acl', 'vty', 'ssh', 'telnet', 'remote access'],
        title: 'VTY access-class "' + name + '" does not exist', detail: 'Remote management is not restricted as intended.', fix: ['ip access-list standard ' + name, ' permit <mgmt-network> <wildcard>'], verify: ['show access-lists ' + name] });
      else if (w.kind === 'nat') add({ id: 'nat-acl-undefined', sev: 'critical', cat: 'NAT', dev, line: list[0].line, tags: ['nat', 'internet', 'acl'],
        title: 'NAT rule references ACL "' + name + '" which does not exist', detail: 'No traffic matches, so nothing is translated and inside hosts cannot reach the Internet.',
        fix: ['access-list ' + (/^\d+$/.test(name) ? name : '') + ' permit <inside-network> <wildcard>'], verify: ['show ip nat translations', 'show ip nat statistics'] });
    }
    for (const acl of Object.values(dev.acls)) {
      const ents = acl.entries.filter(e => !e.remark);
      if (!refs[acl.name]) add({ id: 'acl-unused', sev: 'info', cat: 'ACL', dev, line: acl.line, tags: ['acl'],
        title: 'ACL "' + acl.name + '" is defined but never applied', detail: 'It has no effect until it is applied to an interface (ip access-group), a VTY line (access-class), NAT or a route-map. Forgot "ip access-group"?',
        fix: ['interface <interface>', ' ip access-group ' + acl.name + ' in'], verify: ['show ip interface <interface> | include access list'] });
      if (ents.length && ents.every(e => e.action === 'deny')) add({ id: 'acl-only-deny', sev: 'critical', cat: 'ACL', dev, line: acl.line, tags: ['acl', 'blocked', 'no connectivity', 'filter'],
        title: 'ACL "' + acl.name + '" contains only deny entries', detail: 'Every ACL ends with an implicit "deny any". With no permit statement this ACL blocks ALL traffic where it is applied' + (refs[acl.name] ? ' (' + refs[acl.name].map(r => r.where.ifc ? r.where.ifc.short + ' ' + r.where.dir : r.where.kind).join(', ') + ')' : '') + '.',
        fix: [acl.numbered ? 'access-list ' + acl.name + ' permit ' + (acl.type === 'standard' ? 'any' : 'ip any any') : 'ip access-list ' + acl.type + ' ' + acl.name, ...(acl.numbered ? [] : [' permit ' + (acl.type === 'standard' ? 'any' : 'ip any any')])],
        verify: ['show access-lists ' + acl.name + '   → matches increase on the permit line', 'ping through the interface'] });
      for (let i = 0; i < ents.length; i++) {
        const e = ents[i];
        for (const spec of [e.src, e.dst]) {
          if (spec && spec.wild && wildcardLooksLikeMask(spec.wild)) {
            add({ id: 'acl-mask-as-wildcard', sev: 'warning', cat: 'ACL', dev, line: e.line, tags: ['acl', 'wildcard', 'filter', 'blocked'],
              title: 'ACL "' + acl.name + '" uses a subnet mask where a wildcard is expected', detail: '"' + e.raw.trim() + '" – ' + spec.wild + ' is a subnet mask. As a wildcard it matches a completely different set of addresses. Use ' + N.intToIp(~N.ipToInt(spec.wild) >>> 0) + '.',
              fix: ['! re-create the entry with wildcard ' + N.intToIp(~N.ipToInt(spec.wild) >>> 0)], verify: ['show access-lists ' + acl.name] });
            break;
          }
        }
        for (let j = 0; j < i; j++) {
          if (aceCovers(ents[j], e, acl.type)) {
            const conflict = ents[j].action !== e.action;
            add({ id: conflict ? 'acl-shadowed' : 'acl-redundant', sev: conflict ? 'warning' : 'info', cat: 'ACL', dev, line: e.line, tags: ['acl', 'filter', 'order'],
              title: 'ACL "' + acl.name + '": entry "' + e.raw.trim() + '" can never match', detail: 'An earlier entry "' + ents[j].raw.trim() + '" already matches all of its traffic. ACLs are processed top-down and stop at the first match.' + (conflict ? ' The later ' + e.action + ' therefore has no effect – it probably needs to be placed before the broader entry.' : ''),
              fix: acl.numbered ? ['! numbered ACL: remove it and re-create it in the right order', 'no access-list ' + acl.name] : ['ip access-list ' + acl.type + ' ' + acl.name, ' no ' + e.raw.trim(), ' <seq-lower-than-' + (ents[j].seq || 'the-broad-entry') + '> ' + e.raw.trim().replace(/^\d+\s+/, '')],
              verify: ['show access-lists ' + acl.name + '   → the moved entry gets matches'] });
            break;
          }
        }
      }
    }
    // ACLs that block routing protocols or DHCP on the interface where they are applied.
    for (const name of dev.interfaceOrder) {
      const ifc = dev.interfaces[name];
      if (!ifc.accessGroup.in || !dev.acls[ifc.accessGroup.in.name]) continue;
      const acl = dev.acls[ifc.accessGroup.in.name];
      const a = ifc.ipv4[0];
      if (!a) continue;
      const seg = model.segments.find(s => s.members.some(m => m.dev === dev && m.ifc === ifc));
      const peer = seg && seg.members.find(m => m.dev !== dev);
      const nbrIp = peer ? peer.ip : N.intToIp((N.ipToInt(a.ip) ^ 1) >>> 0);
      const tests = [];
      if (model.protocols.ospf.ifs.some(x => x.dev === dev && x.ifc === ifc && !x.passive)) tests.push(['ospf', { proto: 'ospf', src: nbrIp, dst: '224.0.0.5' }, 'OSPF hellos (protocol 89 to 224.0.0.5)', 'permit ospf any any']);
      if (model.protocols.eigrp.ifs.some(x => x.dev === dev && x.ifc === ifc && !x.passive)) tests.push(['eigrp', { proto: 'eigrp', src: nbrIp, dst: '224.0.0.10' }, 'EIGRP hellos (protocol 88 to 224.0.0.10)', 'permit eigrp any any']);
      if (model.protocols.rip.ifs.some(x => x.dev === dev && x.ifc === ifc && !x.passive)) tests.push(['rip', { proto: 'udp', src: nbrIp, dst: '224.0.0.9', srcPort: 520, dstPort: 520 }, 'RIP updates (UDP 520)', 'permit udp any any eq rip']);
      if (dev.bgp && Object.keys(dev.bgp.neighbors).some(n => N.inSubnet(n, a.ip, a.mask))) tests.push(['bgp', { proto: 'tcp', src: nbrIp, dst: a.ip, srcPort: 50000, dstPort: 179 }, 'BGP (TCP 179)', 'permit tcp any any eq bgp']);
      if (ifc.helpers.length || Object.values(dev.dhcpPools).some(p => p.network && N.inSubnet(a.ip, p.network, p.mask))) tests.push(['dhcp', { proto: 'udp', src: '0.0.0.0', dst: '255.255.255.255', srcPort: 68, dstPort: 67 }, 'DHCP requests (UDP 67 from 0.0.0.0)', 'permit udp any any eq bootps']);
      for (const [key, pkt, what, fixLine] of tests) {
        const r = T.evaluateAcl(acl, pkt);
        if (r.action === 'deny') add({ id: 'acl-blocks-' + key, sev: 'critical', cat: 'ACL', dev, line: ifc.accessGroup.in.line, iface: ifc.name, tags: ['acl', key, 'neighbor', 'blocked', key === 'dhcp' ? 'dhcp' : 'routing'],
          title: 'Inbound ACL "' + acl.name + '" on ' + ifc.short + ' blocks ' + what, detail: (r.implicit ? 'No entry permits it, so the implicit "deny any" at the end drops it.' : 'It is dropped by "' + r.entry.raw.trim() + '".') + (key === 'dhcp' ? ' Clients on this interface will not get an address.' : ' The neighbor relationship will not come up.'),
          fix: acl.numbered ? ['access-list ' + acl.name + ' ' + fixLine.replace('permit ', 'permit ') + '   ! must be placed before the denies – re-create the list'] : ['ip access-list extended ' + acl.name, ' 1 ' + fixLine],
          verify: ['show access-lists ' + acl.name + '   → matches on the new line', key === 'dhcp' ? 'show ip dhcp binding' : 'show ip ' + (key === 'rip' ? 'protocols' : key + (key === 'bgp' ? ' summary' : ' neighbor'))] });
      }
    }
  }

  // ----------------------------------------------------------------- NAT
  function checkNat(dev, add, model) {
    const rules = dev.nat.rules;
    if (!rules.length) {
      const ifs = dev.interfaceOrder.map(n => dev.interfaces[n]).filter(i => i.nat);
      if (ifs.length) add({ id: 'nat-no-rule', sev: 'warning', cat: 'NAT', dev, iface: ifs[0].name, tags: ['nat', 'internet'],
        title: 'Interfaces are marked ip nat inside/outside but no NAT rule exists', detail: 'Nothing will be translated.',
        fix: ['access-list 1 permit <inside-network> <wildcard>', 'ip nat inside source list 1 interface <outside-interface> overload'], verify: ['show ip nat translations'] });
      return;
    }
    const inside = dev.interfaceOrder.map(n => dev.interfaces[n]).filter(i => i.nat === 'inside');
    const outside = dev.interfaceOrder.map(n => dev.interfaces[n]).filter(i => i.nat === 'outside');
    if (!inside.length) add({ id: 'nat-no-inside', sev: 'critical', cat: 'NAT', dev, line: rules[0].line, tags: ['nat', 'internet'],
      title: 'NAT is configured but no interface has "ip nat inside"', detail: 'Translation only happens for traffic entering an inside interface and leaving an outside interface.',
      fix: ['interface <lan-interface>', ' ip nat inside'], verify: ['show ip nat statistics   → "Inside interfaces:"', 'show ip nat translations'] });
    if (!outside.length) add({ id: 'nat-no-outside', sev: 'critical', cat: 'NAT', dev, line: rules[0].line, tags: ['nat', 'internet'],
      title: 'NAT is configured but no interface has "ip nat outside"', detail: 'Translation only happens when traffic leaves an outside interface.',
      fix: ['interface <wan-interface>', ' ip nat outside'], verify: ['show ip nat statistics   → "Outside interfaces:"'] });
    for (const r of rules) {
      if (r.iface) {
        const i = dev.interfaces[r.iface];
        if (!i) add({ id: 'nat-iface-missing', sev: 'critical', cat: 'NAT', dev, line: r.line, tags: ['nat', 'internet'], title: 'NAT overload interface ' + r.iface + ' does not exist', detail: 'Check the interface name in the NAT rule.', fix: [], verify: ['show ip nat statistics'] });
        else if (i.nat !== 'outside') add({ id: 'nat-iface-not-outside', sev: 'warning', cat: 'NAT', dev, line: r.line, iface: i.name, tags: ['nat', 'internet'],
          title: 'NAT translates to ' + i.short + ', which is not marked "ip nat outside"', detail: 'Normally the overload interface is the outside interface.', fix: cfgIf(i, 'ip nat outside'), verify: ['show ip nat statistics'] });
      }
      if (r.pool && !dev.nat.pools[r.pool]) add({ id: 'nat-pool-missing', sev: 'critical', cat: 'NAT', dev, line: r.line, tags: ['nat', 'internet'],
        title: 'NAT rule uses pool "' + r.pool + '" which does not exist', detail: 'Pool names are case sensitive.', fix: ['ip nat pool ' + r.pool + ' <start-ip> <end-ip> netmask <mask>'], verify: ['show ip nat statistics'] });
      if (r.type === 'list' && dev.acls[r.list]) {
        const acl = dev.acls[r.list];
        for (const i of inside) for (const a of i.ipv4) {
          const host = N.intToIp((N.ipToInt(N.network(a.ip, a.mask)) + 2) >>> 0);
          const res = T.evaluateAcl(acl, { proto: 'tcp', src: host, dst: '8.8.8.8', srcPort: 50000, dstPort: 443 });
          if (res.action !== 'permit') add({ id: 'nat-acl-missing-subnet', sev: 'critical', cat: 'NAT', dev, line: acl.line, iface: i.name, ips: [a.ip], vlans: [...(i.encapsulation && i.encapsulation.vlan ? [i.encapsulation.vlan] : []), ...(i.name.includes('.') ? [Number(i.name.split('.')[1])] : []), ...(/^Vlan\d+/.test(i.name) ? [Number(i.name.slice(4))] : [])], tags: ['nat', 'internet', 'acl', 'no connectivity'],
            title: 'NAT ACL "' + acl.name + '" does not include inside network ' + N.cidr(a.ip, a.mask) + ' (' + i.short + ')', detail: 'Hosts in ' + N.cidr(a.ip, a.mask) + ' are not translated, so they cannot reach the Internet (private source addresses are dropped by the ISP).',
            fix: acl.numbered ? ['access-list ' + acl.name + ' permit ' + N.network(a.ip, a.mask) + ' ' + N.intToIp(~N.ipToInt(a.mask) >>> 0)] : ['ip access-list ' + acl.type + ' ' + acl.name, ' permit ' + (acl.type === 'extended' ? 'ip ' : '') + N.network(a.ip, a.mask) + ' ' + N.intToIp(~N.ipToInt(a.mask) >>> 0) + (acl.type === 'extended' ? ' any' : '')],
            verify: ['ping 8.8.8.8 from a host in ' + N.cidr(a.ip, a.mask), 'show ip nat translations   → entries with inside local ' + N.network(a.ip, a.mask).replace(/\.0$/, '.x'), 'show access-lists ' + acl.name] });
        }
      }
    }
  }

  // ---------------------------------------------------------------- DHCP
  function checkDhcp(dev, add, model) {
    const pools = Object.values(dev.dhcpPools).filter(p => p.network && p.mask);
    if (pools.length && dev.dhcpDisabled) add({ id: 'dhcp-service-off', sev: 'critical', cat: 'DHCP', dev, tags: ['dhcp'],
      title: 'DHCP pools exist but "no service dhcp" disables the DHCP server', detail: 'No addresses will be handed out.', fix: ['service dhcp'], verify: ['show ip dhcp binding'] });
    for (const p of pools) {
      const where = 'pool ' + p.name + ' (' + p.network + '/' + N.maskToPrefix(p.mask) + ')';
      if (!p.defaultRouter.length) add({ id: 'dhcp-no-gateway', sev: 'warning', cat: 'DHCP', dev, line: p.line, tags: ['dhcp', 'gateway', 'no connectivity'],
        title: 'DHCP ' + where + ' has no default-router', detail: 'Clients get an address but no gateway – they can only reach their own subnet.',
        fix: ['ip dhcp pool ' + p.name, ' default-router <gateway-ip>'], verify: ['ipconfig /all (on a client) → Default Gateway', 'show ip dhcp binding'] });
      for (const gw of p.defaultRouter) {
        if (!N.inSubnet(gw, p.network, p.mask)) add({ id: 'dhcp-gateway-wrong-subnet', sev: 'critical', cat: 'DHCP', dev, line: p.defaultRouterLine || p.line, ips: [gw], tags: ['dhcp', 'gateway', 'no connectivity', 'internet', 'remote network'],
          title: 'DHCP ' + where + ' hands out default-router ' + gw + ', which is outside the pool subnet', detail: 'Clients get a gateway they cannot reach – they can only talk to their own subnet. Probably a typo.',
          fix: ['ip dhcp pool ' + p.name, ' default-router ' + (model.all.find(a => N.inSubnet(a.ip, p.network, p.mask)) || { ip: '<gateway-ip>' }).ip],
          verify: ['ipconfig /release && ipconfig /renew (client)', 'ipconfig /all → Default Gateway', 'ping <gateway> and a remote address from the client'] });
        else {
          const owner = model.all.find(a => a.ip === gw) || model.all.find(a => Object.values(a.ifc.standby).some(s => s.ip === gw) || Object.values(a.ifc.vrrp).some(s => s.ip === gw));
          const gwIfs = model.all.filter(a => N.inSubnet(a.ip, p.network, p.mask) && !a.ifc.isL2 && a.dev.ipRouting);
          if (!owner && gwIfs.length) add({ id: 'dhcp-gateway-not-router', sev: 'critical', cat: 'DHCP', dev, line: p.defaultRouterLine || p.line, ips: [gw], tags: ['dhcp', 'gateway', 'no connectivity', 'internet', 'remote network'],
            title: 'DHCP ' + where + ' hands out gateway ' + gw + ', but no router interface has that address', detail: 'The routed interface(s) in that subnet: ' + gwIfs.map(a => a.dev.hostname + ' ' + a.ifc.short + ' ' + a.ip).join(', ') + '.',
            fix: ['ip dhcp pool ' + p.name, ' default-router ' + gwIfs[0].ip], verify: ['ipconfig /renew (client) → Default Gateway ' + gwIfs[0].ip, 'ping ' + gwIfs[0].ip + ' from a client'] });
        }
        const excluded = dev.dhcpExcluded.some(x => N.ipToInt(gw) >= N.ipToInt(x.start) && N.ipToInt(gw) <= N.ipToInt(x.end));
        if (N.inSubnet(gw, p.network, p.mask) && !excluded) add({ id: 'dhcp-gateway-not-excluded', sev: 'info', cat: 'DHCP', dev, line: p.line, ips: [gw], tags: ['dhcp', 'duplicate', 'ip conflict'],
          title: 'Gateway ' + gw + ' is not in an "ip dhcp excluded-address" range', detail: 'IOS normally detects the conflict (ping before offer) but it is cleaner to exclude static addresses (gateway, servers, printers).',
          fix: ['ip dhcp excluded-address ' + gw], verify: ['show ip dhcp conflict'] });
      }
      if (!p.dns.length) add({ id: 'dhcp-no-dns', sev: 'info', cat: 'DHCP', dev, line: p.line, tags: ['dhcp', 'dns', 'internet', 'name resolution'],
        title: 'DHCP ' + where + ' has no dns-server', detail: 'Clients can ping IP addresses but not names (e.g. "ping google.com" fails).',
        fix: ['ip dhcp pool ' + p.name, ' dns-server <dns-ip>'], verify: ['ipconfig /all → DNS Servers', 'nslookup www.cisco.com'] });
      // Is the pool reachable by clients? Local interface, or a relay elsewhere pointing to us.
      const local = T.l3Addresses(dev, false).find(a => N.inSubnet(a.ip, p.network, p.mask));
      if (local && local.mask !== p.mask) add({ id: 'dhcp-mask-mismatch', sev: 'warning', cat: 'DHCP', dev, line: p.networkLine || p.line, tags: ['dhcp', 'mask', 'subnet'],
        title: 'DHCP ' + where + ' mask differs from ' + local.ifc.short + ' (' + N.cidr(local.ip, local.mask) + ')', detail: 'Clients get a different mask than the router uses.', fix: ['ip dhcp pool ' + p.name, ' network ' + N.network(local.ip, local.mask) + ' ' + local.mask], verify: ['ipconfig /all'] });
      if (!local) {
        const myIps = T.l3Addresses(dev, true).map(a => a.ip);
        const gwIf = model.all.find(a => a.dev !== dev && N.inSubnet(a.ip, p.network, p.mask) && !a.ifc.isL2);
        if (gwIf) {
          const relays = gwIf.ifc.helpers.map(h => h.ip);
          if (!relays.some(ip => myIps.includes(ip))) add({ id: 'dhcp-relay-missing', sev: 'critical', cat: 'DHCP', dev: gwIf.dev, devices: [gwIf.dev, dev], line: gwIf.ifc.line, iface: gwIf.ifc.name, tags: ['dhcp', 'relay', 'helper-address'],
            title: gwIf.ifc.short + ' on ' + gwIf.dev.hostname + ' has no ip helper-address to the DHCP server ' + dev.hostname, detail: 'DHCP Discover is a broadcast and is not routed. Pool ' + p.name + ' on ' + dev.hostname + ' serves ' + p.network + '/' + N.maskToPrefix(p.mask) + ', whose gateway is ' + gwIf.dev.hostname + ' ' + gwIf.ifc.short + '. ' + (relays.length ? 'The current helper (' + relays.join(', ') + ') does not point to ' + dev.hostname + '.' : ''),
            fix: cfgIf(gwIf.ifc, 'ip helper-address ' + (T.l3Addresses(dev, false)[0] || { ip: '<dhcp-server-ip>' }).ip), verify: ['show ip interface ' + gwIf.ifc.short + ' | include Helper', 'show ip dhcp binding (on ' + dev.hostname + ')', 'ipconfig /renew on a client'] });
        } else if (!model.devices.some(d => d.interfaceOrder.some(n => d.interfaces[n].helpers.some(h => myIps.includes(h.ip))))) add({ id: 'dhcp-pool-orphan', sev: 'info', cat: 'DHCP', dev, line: p.line, tags: ['dhcp', 'relay'],
          title: 'DHCP ' + where + ' does not match any local interface', detail: 'Clients reach this pool only through a DHCP relay (ip helper-address) on their gateway – which is not among the loaded configs. Check the relay.',
          fix: ['! on the gateway of ' + p.network + ':', 'interface <gateway-interface>', ' ip helper-address <ip-of-' + dev.hostname + '>'], verify: ['show ip dhcp binding'] });
      }
    }
  }

  // ---------------------------------------------------------------- HSRP
  function checkHsrp(dev, add) {
    for (const n of dev.interfaceOrder) {
      const ifc = dev.interfaces[n];
      for (const g of Object.values(ifc.standby)) {
        const a = ifc.ipv4.find(x => !x.secondary);
        if (!g.ip) continue;
        if (a && !N.inSubnet(g.ip, a.ip, a.mask)) add({ id: 'hsrp-vip-subnet', sev: 'critical', cat: 'Redundancy (HSRP)', dev, line: g.line, iface: n, ips: [g.ip], tags: ['hsrp', 'gateway', 'redundancy'],
          title: ifc.short + ': HSRP group ' + g.group + ' virtual IP ' + g.ip + ' is not in the interface subnet', detail: 'The virtual IP must be in ' + N.cidr(a.ip, a.mask) + '.', fix: cfgIf(ifc, 'standby ' + g.group + ' ip <ip-in-subnet>'), verify: ['show standby brief'] });
        if (a && a.ip === g.ip) add({ id: 'hsrp-vip-is-real', sev: 'critical', cat: 'Redundancy (HSRP)', dev, line: g.line, iface: n, ips: [g.ip], tags: ['hsrp', 'gateway', 'duplicate'],
          title: ifc.short + ': HSRP virtual IP equals the interface IP ' + g.ip, detail: 'The virtual IP must be a separate, unused address.', fix: cfgIf(ifc, 'standby ' + g.group + ' ip <unused-ip>'), verify: ['show standby brief'] });
        if (g.priority > 100 && !g.preempt) add({ id: 'hsrp-no-preempt', sev: 'info', cat: 'Redundancy (HSRP)', dev, line: g.line, iface: n, tags: ['hsrp', 'redundancy', 'failover'],
          title: ifc.short + ': HSRP priority ' + g.priority + ' without preempt', detail: 'This router will not take back the active role after it recovers.', fix: cfgIf(ifc, 'standby ' + g.group + ' preempt'), verify: ['show standby brief   → Active router'] });
      }
    }
  }

  // --------------------------------------------------------------- cross
  function checkCross(model, add) {
    const devs = model.devices;
    // Duplicate hostnames
    const names = {};
    for (const d of devs) (names[d.hostname.toLowerCase()] = names[d.hostname.toLowerCase()] || []).push(d);
    for (const list of Object.values(names)) if (list.length > 1) add({ id: 'dup-hostname', sev: 'warning', cat: 'Management', devices: list, tags: ['hostname'],
      title: 'Hostname "' + list[0].hostname + '" is used by ' + list.length + ' loaded configs', detail: 'Either the same config was loaded twice or devices share a name (confusing in logs, CDP and SSH keys).', fix: ['hostname <unique-name>'], verify: ['show cdp neighbors'] });
    // Duplicate IPs across devices
    const byIp = {};
    for (const a of model.all) (byIp[a.ip] = byIp[a.ip] || []).push(a);
    for (const [ip, list] of Object.entries(byIp)) {
      const ds = [...new Set(list.map(a => a.dev))];
      if (ds.length > 1) add({ id: 'dup-ip', sev: 'critical', cat: 'Interfaces', devices: ds, dev: ds[0], ips: [ip], line: list[0].ifc.line, iface: list[0].ifc.name, tags: ['ip address', 'duplicate', 'ip conflict', 'intermittent'],
        title: 'Duplicate IP ' + ip + ' on ' + list.map(a => a.dev.hostname + ' ' + a.ifc.short).join(' and '), detail: 'Two devices answer ARP for the same address – traffic goes to whichever answered last (intermittent connectivity, "%IP-4-DUPADDR" messages).',
        fix: cfgIf(list[1].ifc, 'ip address <unique-ip> ' + list[1].mask), verify: ['show ip arp ' + ip, 'show logging | include DUPADDR'] });
    }
    // Mask mismatches
    for (const [a, b] of model.maskMismatches) add({ id: 'link-mask-mismatch', sev: 'critical', cat: 'Interfaces', devices: [a.dev, b.dev], dev: a.dev, line: a.ifc.line, iface: a.ifc.name, ips: [a.ip, b.ip], tags: ['subnet', 'mask', 'neighbor', 'ospf', 'eigrp', 'link', 'ping'],
      title: 'Subnet mask mismatch: ' + a.dev.hostname + ' ' + a.ifc.short + ' ' + a.ip + '/' + a.prefix + ' vs ' + b.dev.hostname + ' ' + b.ifc.short + ' ' + b.ip + '/' + b.prefix,
      detail: 'Both ends of a link must use the same mask. OSPF will not form an adjacency on broadcast networks with different masks, and some addresses become unreachable from one side.',
      fix: cfgIf(b.ifc, 'ip address ' + b.ip + ' ' + a.mask + '   ! or change the other side'), verify: ['show ip interface ' + a.ifc.short + ' / ' + b.ifc.short + '  → same prefix length', 'ping across the link'] });
    // Routing protocol adjacency problems
    const P = model.protocols;
    const adjFind = (proto, list, sevMap) => {
      for (const iss of list) {
        for (const p of iss.problems) {
          const { a, b } = iss;
          const sev = (sevMap && sevMap[p.kind]) || 'critical';
          const fix = adjFix(proto, p.kind, a, b);
          add({ id: proto.toLowerCase() + '-adj-' + p.kind, sev, cat: 'Routing', devices: [a.dev, b.dev], dev: a.dev, line: (p.kind === 'passive' && a.passive ? a.proc.line : a.ifc.line), iface: a.ifc.name, ips: [a.ip, b.ip],
            tags: [proto.toLowerCase(), 'neighbor', 'adjacency', 'routing', 'missing route', 'remote network'],
            title: proto + ' neighbors ' + a.dev.hostname + ' (' + a.ifc.short + ') and ' + b.dev.hostname + ' (' + b.ifc.short + ') will not become adjacent: ' + p.text,
            detail: adjDetail(proto, p.kind), fix, verify: adjVerify(proto) });
        }
      }
    };
    adjFind('OSPF', P.ospf.issues);
    adjFind('OSPF', P.ospf.soft, { nettype: 'warning' });
    adjFind('EIGRP', P.eigrp.issues);
    adjFind('RIP', P.rip.issues, { passive: 'warning', version: 'warning' });
    for (const [proto, pm] of [['OSPF', P.ospf], ['EIGRP', P.eigrp], ['RIP', P.rip]]) {
      for (const o of pm.oneSided) for (const off of o.off) add({ id: proto.toLowerCase() + '-one-sided', sev: 'critical', cat: 'Routing', devices: [off.dev, ...o.on.map(x => x.dev)], dev: off.dev, line: off.ifc.line, iface: off.ifc.name, ips: [off.ip],
        tags: [proto.toLowerCase(), 'neighbor', 'adjacency', 'routing', 'missing route', 'remote network'],
        title: proto + ' is not enabled on ' + off.dev.hostname + ' ' + off.ifc.short + ' (' + N.cidr(off.ip, off.mask) + '), but ' + o.on.map(x => x.dev.hostname).join(', ') + ' runs ' + proto + ' on that link',
        detail: 'No ' + proto + ' network statement on ' + off.dev.hostname + ' covers ' + off.ip + ', so no neighbor relationship forms over this link and routes are not exchanged.',
        fix: proto === 'OSPF' ? ['router ospf ' + (off.dev.ospf[0] ? off.dev.ospf[0].pid : '1'), ' network ' + N.network(off.ip, off.mask) + ' ' + N.intToIp(~N.ipToInt(off.mask) >>> 0) + ' area ' + o.on[0].area]
          : proto === 'EIGRP' ? ['router eigrp ' + (off.dev.eigrp[0] ? off.dev.eigrp[0].asn : o.on[0].asn), ' network ' + N.network(off.ip, off.mask) + ' ' + N.intToIp(~N.ipToInt(off.mask) >>> 0)]
          : ['router rip', ' network ' + N.network(off.ip, T.classfulMask(off.ip))],
        verify: adjVerify(proto) });
    }
    // Duplicate router IDs
    const rids = {};
    for (const d of devs) for (const o of d.ospf) if (o.routerId) (rids[o.routerId] = rids[o.routerId] || []).push(d);
    for (const [rid, list] of Object.entries(rids)) if (new Set(list).size > 1) add({ id: 'ospf-dup-rid', sev: 'critical', cat: 'Routing', devices: list, dev: list[0], tags: ['ospf', 'router-id', 'neighbor', 'flapping'],
      title: 'OSPF router-id ' + rid + ' is used by ' + list.map(d => d.hostname).join(' and '), detail: 'Router IDs must be unique in the OSPF domain. Expect "%OSPF-4-DUP_RTRID" messages, failed adjacencies and flapping routes.',
      fix: ['router ospf <pid>', ' router-id <unique-id>', 'end', 'clear ip ospf process'], verify: ['show ip ospf | include ID', 'show ip ospf neighbor'] });
    // BGP pairs
    for (const d of devs) {
      if (!d.bgp) continue;
      for (const n of Object.values(d.bgp.neighbors)) {
        const owner = model.ownerOf(n.ip);
        if (!owner) continue;
        const p = owner.dev;
        if (!p.bgp) { add({ id: 'bgp-peer-no-bgp', sev: 'critical', cat: 'Routing', devices: [d, p], dev: d, line: n.line, ips: [n.ip], tags: ['bgp', 'neighbor'],
          title: d.hostname + ' peers with ' + n.ip + ' (' + p.hostname + '), but ' + p.hostname + ' does not run BGP', detail: 'The session will stay in Active/Idle.', fix: ['! on ' + p.hostname, 'router bgp <asn>', ' neighbor <ip-of-' + d.hostname + '> remote-as ' + d.bgp.asn], verify: ['show ip bgp summary'] }); continue; }
        if (n.remoteAs && n.remoteAs !== p.bgp.asn) add({ id: 'bgp-remote-as', sev: 'critical', cat: 'Routing', devices: [d, p], dev: d, line: n.line, ips: [n.ip], tags: ['bgp', 'neighbor'],
          title: d.hostname + ': neighbor ' + n.ip + ' remote-as ' + n.remoteAs + ', but ' + p.hostname + ' is AS ' + p.bgp.asn, detail: 'The OPEN message is rejected ("bad remote AS") and the session never establishes.',
          fix: ['router bgp ' + d.bgp.asn, ' neighbor ' + n.ip + ' remote-as ' + p.bgp.asn], verify: ['show ip bgp summary   → State/PfxRcd is a number', 'show logging | include BGP'] });
        const myIps = T.l3Addresses(d, true).map(a => a.ip);
        const back = Object.values(p.bgp.neighbors).find(x => myIps.includes(x.ip));
        if (!back) add({ id: 'bgp-one-sided', sev: 'critical', cat: 'Routing', devices: [d, p], dev: p, line: p.bgp.line, ips: [n.ip], tags: ['bgp', 'neighbor'],
          title: d.hostname + ' has ' + p.hostname + ' (' + n.ip + ') as BGP neighbor, but ' + p.hostname + ' has no neighbor statement for ' + d.hostname,
          detail: 'BGP neighbors must be configured on both sides, using the address the other side sources the session from. ' + d.hostname + ' addresses: ' + myIps.join(', ') + '.',
          fix: ['router bgp ' + p.bgp.asn, ' neighbor <ip-of-' + d.hostname + '> remote-as ' + d.bgp.asn], verify: ['show ip bgp summary'] });
      }
    }
    // HSRP on shared segments
    for (const seg of model.segments) {
      const ms = seg.members.filter(m => Object.keys(m.ifc.standby).length);
      if (ms.length < 2) continue;
      const groups = new Set(ms.flatMap(m => Object.keys(m.ifc.standby)));
      const vips = new Set(ms.flatMap(m => Object.values(m.ifc.standby).map(s => s.ip).filter(Boolean)));
      if (groups.size > 1 || vips.size > 1) add({ id: 'hsrp-mismatch', sev: 'critical', cat: 'Redundancy (HSRP)', devices: ms.map(m => m.dev), dev: ms[0].dev, iface: ms[0].ifc.name, line: ms[0].ifc.line, tags: ['hsrp', 'gateway', 'redundancy', 'failover'],
        title: 'HSRP on ' + seg.key + ' does not match: ' + ms.map(m => m.dev.hostname + ' ' + m.ifc.short + ' group ' + Object.keys(m.ifc.standby).join('/') + ' VIP ' + Object.values(m.ifc.standby).map(s => s.ip).join('/')).join('; '),
        detail: 'Group number and virtual IP must be identical on all routers of the group; otherwise both become active ("%HSRP-4-DUPADDR" / two active routers).',
        fix: cfgIf(ms[1].ifc, 'standby ' + [...groups][0] + ' ip ' + [...vips][0]), verify: ['show standby brief   → one Active, one Standby'] });
      const versions = new Set(ms.flatMap(m => Object.values(m.ifc.standby).map(s => s.version || 1)));
      if (versions.size > 1) add({ id: 'hsrp-version', sev: 'warning', cat: 'Redundancy (HSRP)', devices: ms.map(m => m.dev), dev: ms[0].dev, iface: ms[0].ifc.name, tags: ['hsrp'],
        title: 'HSRP version mismatch on ' + seg.key, detail: 'HSRPv1 and v2 use different multicast addresses and do not see each other.', fix: ['interface <if>', ' standby version 2'], verify: ['show standby'] });
    }
    // Layer-2 links (inferred from descriptions)
    for (const l of model.l2Links) checkL2Link(l, add, model);
    // VTP domain mismatch between switches in server/client mode
    const vtpDevs = devs.filter(d => d.vtp.domain && d.vtp.mode !== 'transparent' && d.vtp.mode !== 'off');
    const doms = new Set(vtpDevs.map(d => d.vtp.domain));
    if (doms.size > 1) add({ id: 'vtp-domain', sev: 'warning', cat: 'Switching / VLANs', devices: vtpDevs, dev: vtpDevs[0], tags: ['vtp', 'vlan', 'trunk'],
      title: 'Different VTP domains: ' + vtpDevs.map(d => d.hostname + '=' + d.vtp.domain).join(', '), detail: 'VLANs are not propagated between different VTP domains, and DTP will not negotiate trunks between them.',
      fix: ['vtp domain <same-name>'], verify: ['show vtp status'] });
  }

  function checkL2Link(l, add, model) {
    const A = l.a, B = l.b;
    const ia = A.ifc, ib = B.ifc;
    const name = A.dev.hostname + ' ' + ia.short + ' ↔ ' + B.dev.hostname + ' ' + ib.short;
    const base = { cat: 'Switching / VLANs', devices: [A.dev, B.dev], dev: A.dev, iface: ia.name, line: ia.line };
    if (ia.shutdown !== ib.shutdown) {
      const down = ia.shutdown ? A : B;
      add({ ...base, id: 'link-one-side-down', sev: 'critical', dev: down.dev, iface: down.ifc.name, line: down.ifc.line, tags: ['link', 'interface down', 'no connectivity', 'shutdown'],
        title: 'Link ' + name + ': ' + down.dev.hostname + ' ' + down.ifc.short + ' is shut down', detail: 'The link is down/down on the other side.', fix: cfgIf(down.ifc, 'no shutdown'), verify: ['show interfaces ' + down.ifc.short + ' status', 'show cdp neighbors'] });
    }
    const dup = x => (x.duplex && x.duplex.value) || 'auto';
    const spd = x => x.speed || 'auto';
    if ((dup(ia) !== dup(ib) && (dup(ia) === 'half' || dup(ib) === 'half' || (dup(ia) !== 'auto' && dup(ib) === 'auto') || (dup(ia) === 'auto' && dup(ib) !== 'auto'))) || (spd(ia) !== spd(ib) && spd(ia) !== 'auto' && spd(ib) !== 'auto'))
      add({ ...base, id: 'link-duplex-mismatch', sev: 'warning', tags: ['duplex', 'speed', 'slow', 'errors', 'performance', 'collisions'],
        title: 'Speed/duplex differ on ' + name + ' (' + spd(ia) + '/' + dup(ia) + ' vs ' + spd(ib) + '/' + dup(ib) + ')', detail: 'If one side is hard-coded and the other auto-negotiates, the auto side falls back to half duplex → duplex mismatch, late collisions, CRC errors and poor performance.',
        fix: [...cfgIf(ia, 'speed auto', 'duplex auto'), ...cfgIf(ib, 'speed auto', 'duplex auto')], verify: ['show interfaces ' + ia.short + ' | include duplex', 'show interfaces ' + ia.short + ' counters errors', 'show cdp neighbors detail / "%CDP-4-DUPLEX_MISMATCH"'] });
    const l2a = ia.isL2, l2b = ib.isL2;
    if (l2a && l2b) {
      const ma = ia.mode, mb = ib.mode;
      if ((ma === 'trunk') !== (mb === 'trunk') && ![ma, mb].includes('dynamic desirable') && !(ma === 'trunk' && mb.startsWith('dynamic')) && !(mb === 'trunk' && ma.startsWith('dynamic'))) add({ ...base, id: 'link-trunk-access', sev: 'critical', tags: ['trunk', 'vlan', 'access port', 'no connectivity', 'dhcp'],
        title: 'Trunk/access mismatch on ' + name + ' (' + ma + ' vs ' + mb + ')', detail: 'One side tags frames (trunk) and the other expects untagged frames (access). Only the native VLAN works, and you may see "native VLAN mismatch" errors.',
        fix: cfgIf(ma === 'trunk' ? ib : ia, 'switchport mode trunk'), verify: ['show interfaces trunk (on both switches)', 'show interfaces ' + ia.short + ' switchport'] });
      if (ma === 'dynamic auto' && mb === 'dynamic auto') add({ ...base, id: 'link-dtp-auto-auto', sev: 'critical', tags: ['trunk', 'dtp', 'vlan'],
        title: 'Both ends of ' + name + ' are "dynamic auto" – no trunk forms', detail: 'Two passive DTP ports never negotiate a trunk, so the link becomes an access link in VLAN 1.',
        fix: [...cfgIf(ia, 'switchport mode trunk'), ...cfgIf(ib, 'switchport mode trunk')], verify: ['show interfaces trunk'] });
      if (ma === 'trunk' && mb === 'trunk') {
        const na = ia.switchport.nativeVlan || 1, nb = ib.switchport.nativeVlan || 1;
        if (na !== nb) add({ ...base, id: 'link-native-mismatch', sev: 'critical', vlans: [na, nb], tags: ['trunk', 'native vlan', 'vlan', 'cdp'],
          title: 'Native VLAN mismatch on ' + name + ' (' + na + ' vs ' + nb + ')', detail: 'Untagged traffic leaks between VLAN ' + na + ' and VLAN ' + nb + ', STP may block the port (PVID inconsistent), and CDP logs "%CDP-4-NATIVE_VLAN_MISMATCH".',
          fix: cfgIf(ib, 'switchport trunk native vlan ' + na), verify: ['show interfaces trunk   → same Native vlan on both', 'show spanning-tree inconsistentports'] });
        const aa = ia.switchport.trunkAllowed, ab = ib.switchport.trunkAllowed;
        if (aa || ab) {
          const set = s => s || new Set(Array.from({ length: 4094 }, (_, i) => i + 1));
          const sa = set(aa), sb = set(ab);
          const relevant = v => (A.dev.vlans[v] || B.dev.vlans[v] || usesVlan(A.dev, v) || usesVlan(B.dev, v));
          const onlyA = [...sa].filter(v => !sb.has(v) && relevant(v));
          const onlyB = [...sb].filter(v => !sa.has(v) && relevant(v));
          if (onlyA.length || onlyB.length) add({ ...base, id: 'link-allowed-mismatch', sev: 'warning', vlans: [...onlyA, ...onlyB], tags: ['trunk', 'vlan', 'allowed', 'no connectivity', 'dhcp'],
            title: 'Allowed VLANs differ on ' + name, detail: (onlyA.length ? 'Only ' + A.dev.hostname + ' allows ' + onlyA.join(', ') + '. ' : '') + (onlyB.length ? 'Only ' + B.dev.hostname + ' allows ' + onlyB.join(', ') + '. ' : '') + 'These VLANs are not carried across the trunk.',
            fix: [...(onlyA.length ? cfgIf(ib, 'switchport trunk allowed vlan add ' + onlyA.join(',')) : []), ...(onlyB.length ? cfgIf(ia, 'switchport trunk allowed vlan add ' + onlyB.join(',')) : [])],
            verify: ['show interfaces trunk (both sides) → "VLANs allowed and active in management domain"'] });
        }
      }
      if (ma === 'access' && mb === 'access' && (ia.switchport.accessVlan || 1) !== (ib.switchport.accessVlan || 1)) add({ ...base, id: 'link-access-vlan-mismatch', sev: 'warning', vlans: [ia.switchport.accessVlan || 1, ib.switchport.accessVlan || 1], tags: ['vlan', 'access port'],
        title: 'Access link ' + name + ' joins VLAN ' + (ia.switchport.accessVlan || 1) + ' with VLAN ' + (ib.switchport.accessVlan || 1), detail: 'The two VLANs are merged into one broadcast domain. Probably one of the access VLANs is wrong.',
        fix: cfgIf(ib, 'switchport access vlan ' + (ia.switchport.accessVlan || 1)), verify: ['show interfaces ' + ib.short + ' switchport', 'show cdp neighbors detail'] });
      if (ia.channelGroup || ib.channelGroup) {
        const ca = ia.channelGroup ? ia.channelGroup.mode : 'none', cb = ib.channelGroup ? ib.channelGroup.mode : 'none';
        const ok = (x, y) => (x === 'on' && y === 'on') || (['active', 'passive'].includes(x) && ['active', 'passive'].includes(y) && !(x === 'passive' && y === 'passive')) || (['desirable', 'auto'].includes(x) && ['desirable', 'auto'].includes(y) && !(x === 'auto' && y === 'auto'));
        if (!ok(ca, cb)) add({ ...base, id: 'link-etherchannel-mode', sev: 'critical', tags: ['etherchannel', 'port-channel', 'lacp', 'pagp'],
          title: 'EtherChannel modes on ' + name + ' do not form a bundle (' + ca + ' vs ' + cb + ')', detail: 'Valid combinations: on–on, active–active/passive (LACP), desirable–desirable/auto (PAgP). passive–passive and auto–auto never negotiate.',
          fix: [...cfgIf(ia, 'channel-group ' + (ia.channelGroup ? ia.channelGroup.id : 1) + ' mode active'), ...cfgIf(ib, 'channel-group ' + (ib.channelGroup ? ib.channelGroup.id : 1) + ' mode active')], verify: ['show etherchannel summary   → (SU) and members (P)'] });
      }
    }
    // Router-on-a-stick ↔ switch port
    for (const [R, S] of [[A, B], [B, A]]) {
      if (R.ifc.isL2 || !S.ifc.isL2) continue;
      const subs = R.dev.interfaceOrder.filter(n => n.startsWith(R.ifc.name + '.')).map(n => R.dev.interfaces[n]).filter(i => i.encapsulation && i.encapsulation.type === 'dot1q');
      if (!subs.length) continue;
      const sp = S.ifc;
      const bb = { cat: 'Switching / VLANs', devices: [R.dev, S.dev], dev: S.dev, iface: sp.name, line: sp.line };
      if (sp.mode !== 'trunk') { add({ ...bb, id: 'ros-not-trunk', sev: 'critical', vlans: subs.map(s => s.encapsulation.vlan), tags: ['router on a stick', 'trunk', 'inter-vlan', 'vlan', 'gateway', 'dhcp'],
        title: S.dev.hostname + ' ' + sp.short + ' connects to ' + R.dev.hostname + ' subinterfaces but is not a trunk (' + sp.mode + ')', detail: 'Router-on-a-stick needs an 802.1Q trunk on the switch port. Tagged frames from the router are dropped.',
        fix: cfgIf(sp, 'switchport mode trunk'), verify: ['show interfaces trunk', 'ping the router subinterface from a host in each VLAN'] }); continue; }
      const missing = subs.filter(s => sp.switchport.trunkAllowed && !sp.switchport.trunkAllowed.has(s.encapsulation.vlan));
      if (missing.length) add({ ...bb, id: 'ros-vlan-not-allowed', sev: 'critical', line: sp.switchport.allowedLine || sp.line, vlans: missing.map(s => s.encapsulation.vlan), tags: ['router on a stick', 'trunk', 'inter-vlan', 'vlan', 'gateway', 'dhcp', 'allowed', 'no connectivity'],
        title: 'Trunk ' + S.dev.hostname + ' ' + sp.short + ' does not allow VLAN ' + missing.map(s => s.encapsulation.vlan).join(', ') + ' used by ' + R.dev.hostname + ' ' + missing.map(s => s.short).join(', '),
        detail: 'Hosts in ' + missing.map(s => 'VLAN ' + s.encapsulation.vlan + (s.ipv4[0] ? ' (' + N.cidr(s.ipv4[0].ip, s.ipv4[0].mask) + ')' : '')).join(', ') + ' cannot reach their gateway – no inter-VLAN routing, no Internet, and no DHCP if the router is the DHCP server. Allowed now: ' + sp.switchport.trunkAllowedRaw + '.',
        fix: cfgIf(sp, 'switchport trunk allowed vlan add ' + missing.map(s => s.encapsulation.vlan).join(',')), verify: ['show interfaces trunk   → the VLANs listed as allowed and active', 'ping ' + (missing[0].ipv4[0] ? missing[0].ipv4[0].ip : '<gateway>') + ' from a host in VLAN ' + missing[0].encapsulation.vlan] });
      const nativeSub = subs.find(s => s.encapsulation.native);
      const swNative = sp.switchport.nativeVlan || 1;
      if (nativeSub && nativeSub.encapsulation.vlan !== swNative) add({ ...bb, id: 'ros-native-mismatch', sev: 'critical', line: sp.switchport.nativeLine || sp.line, vlans: [nativeSub.encapsulation.vlan, swNative], tags: ['router on a stick', 'native vlan', 'trunk', 'vlan', 'management'],
        title: 'Native VLAN mismatch: ' + R.dev.hostname + ' ' + nativeSub.short + ' is native VLAN ' + nativeSub.encapsulation.vlan + ', ' + S.dev.hostname + ' ' + sp.short + ' native VLAN ' + swNative,
        detail: 'The router sends VLAN ' + nativeSub.encapsulation.vlan + ' untagged, and the switch puts untagged frames in VLAN ' + swNative + '. VLAN ' + nativeSub.encapsulation.vlan + ' hosts (often management) cannot reach the router.',
        fix: cfgIf(sp, 'switchport trunk native vlan ' + nativeSub.encapsulation.vlan), verify: ['show interfaces trunk   → Native vlan ' + nativeSub.encapsulation.vlan, 'show vlans (on the router)', 'ping ' + (nativeSub.ipv4[0] ? nativeSub.ipv4[0].ip : '<router>') + ' from a host in VLAN ' + nativeSub.encapsulation.vlan] });
      if (!nativeSub && subs.some(s => s.encapsulation.vlan === swNative) && swNative !== 1) {
        const s = subs.find(x => x.encapsulation.vlan === swNative);
        add({ ...bb, id: 'ros-native-tagged', sev: 'warning', vlans: [swNative], tags: ['router on a stick', 'native vlan', 'trunk'],
          title: 'VLAN ' + swNative + ' is native (untagged) on ' + S.dev.hostname + ' ' + sp.short + ' but tagged on ' + R.dev.hostname + ' ' + s.short, detail: 'Add "native" to the router encapsulation or use another native VLAN on the switch.',
          fix: cfgIf(s, 'encapsulation dot1Q ' + swNative + ' native'), verify: ['show vlans (router)', 'show interfaces trunk'] });
      }
      if (S.dev.vlanStatements) {
        const absent = subs.filter(s => !S.dev.vlans[s.encapsulation.vlan] && s.encapsulation.vlan !== 1);
        if (absent.length) add({ ...bb, id: 'ros-vlan-unknown', sev: 'warning', vlans: absent.map(s => s.encapsulation.vlan), tags: ['router on a stick', 'vlan', 'inter-vlan'],
          title: R.dev.hostname + ' tags VLAN ' + absent.map(s => s.encapsulation.vlan).join(', ') + ' but ' + S.dev.hostname + ' has no such VLAN', detail: absent.map(s => s.short + (s.description ? ' ("' + s.description + '")' : '') + ' → VLAN ' + s.encapsulation.vlan).join('; ') + '. Either the VLAN is missing on the switch or the router encapsulation has the wrong VLAN ID.',
          fix: ['! on ' + S.dev.hostname + ':', ...absent.map(s => 'vlan ' + s.encapsulation.vlan), '! or correct the encapsulation on ' + R.dev.hostname], verify: ['show vlan brief (switch)', 'show vlans (router)'] });
      }
    }
  }

  function usesVlan(dev, v) {
    return dev.interfaceOrder.some(n => {
      const i = dev.interfaces[n];
      return (i.isL2 && i.mode === 'access' && (i.switchport.accessVlan || 1) === v) || n === 'Vlan' + v || (i.encapsulation && i.encapsulation.vlan === v);
    });
  }

  function adjDetail(proto, kind) {
    const d = {
      passive: 'A passive interface does not send ' + proto + ' hellos/updates, so no neighbor forms over it. Use passive only towards end hosts.',
      area: 'OSPF neighbors on the same link must be in the same area. The hellos are discarded ("mismatched area ID").',
      timers: 'Hello and dead intervals must match exactly; otherwise the hellos are ignored.',
      auth: 'Authentication type and key must match, otherwise hellos are rejected ("Mismatched authentication").',
      mtu: 'Neighbors with different IP MTU get stuck in EXSTART/EXCHANGE because the database description packets are rejected.',
      rid: 'Two routers with the same router ID cannot become neighbors.',
      nettype: 'Different OSPF network types (e.g. broadcast vs point-to-point) give different hello behaviour and LSA types – the adjacency may flap or routes may be missing.',
      asn: 'EIGRP neighbors must use the same autonomous system number.',
      k: 'EIGRP K-values (metric weights) must match ("K-value mismatch").',
      version: 'A RIPv2 router ignores RIPv1 updates; use "version 2" on all routers.'
    };
    return d[kind] || '';
  }

  function adjFix(proto, kind, a, b) {
    const ifA = a.ifc, ifB = b.ifc;
    if (kind === 'passive') {
      const x = a.passive ? a : b;
      const p = proto === 'OSPF' ? 'router ospf ' + x.proc.pid : proto === 'EIGRP' ? 'router eigrp ' + x.proc.asn : 'router rip';
      return ['! on ' + x.dev.hostname, p, ' no passive-interface ' + x.ifc.name];
    }
    if (kind === 'area') {
      const s = b.stmt;
      return s ? ['! on ' + b.dev.hostname + ' (or change ' + a.dev.hostname + ')', 'router ospf ' + b.proc.pid, ' no network ' + s.addr + ' ' + s.wild + ' area ' + s.areaRaw, ' network ' + s.addr + ' ' + s.wild + ' area ' + a.area]
        : ['! on ' + b.dev.hostname, 'interface ' + ifB.name, ' ip ospf ' + b.proc.pid + ' area ' + a.area];
    }
    if (kind === 'timers') return ['! make both sides equal, e.g. on ' + b.dev.hostname, 'interface ' + ifB.name, ' ip ospf hello-interval ' + a.timers.hello, ' ip ospf dead-interval ' + a.timers.dead];
    if (kind === 'auth') return ['! configure the same authentication on both ' + a.dev.hostname + ' ' + ifA.short + ' and ' + b.dev.hostname + ' ' + ifB.short, proto === 'OSPF' ? ' ip ospf authentication message-digest' : ' ip authentication mode eigrp <as> md5', proto === 'OSPF' ? ' ip ospf message-digest-key 1 md5 <key>' : ' ip authentication key-chain eigrp <as> <chain>'];
    if (kind === 'mtu') return ['! on ' + b.dev.hostname, 'interface ' + ifB.name, ' ip mtu ' + a.mtu, '! (or: ip ospf mtu-ignore on both)'];
    if (kind === 'rid') return ['router ospf ' + b.proc.pid, ' router-id <unique-id>', 'end', 'clear ip ospf process'];
    if (kind === 'nettype') return ['interface ' + ifB.name, ' ip ospf network ' + a.timers.type];
    if (kind === 'asn') return ['! on ' + b.dev.hostname + ': run EIGRP with the same AS as ' + a.dev.hostname, 'router eigrp ' + a.asn, ' network ' + b.net + ' ' + N.intToIp(~N.ipToInt(b.mask) >>> 0)];
    if (kind === 'k') return ['router eigrp <as>', ' metric weights 0 1 0 1 0 0   ! default on both'];
    if (kind === 'version') return ['router rip', ' version 2', ' no auto-summary   ! on all routers'];
    return [];
  }

  function adjVerify(proto) {
    if (proto === 'OSPF') return ['show ip ospf neighbor   → state FULL (or 2WAY/DROTHER on LANs)', 'show ip ospf interface brief', 'show ip route ospf', 'debug ip ospf adj   (look for "mismatch")'];
    if (proto === 'EIGRP') return ['show ip eigrp neighbors', 'show ip eigrp interfaces', 'show ip route eigrp'];
    if (proto === 'RIP') return ['show ip protocols', 'show ip route rip', 'debug ip rip'];
    return [];
  }

  CCA.checks = { analyze, SEV_ORDER };
  if (typeof module !== 'undefined' && module.exports) module.exports = CCA;
})(typeof window !== 'undefined' ? window : globalThis);
