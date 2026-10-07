// Parses Cisco IOS / IOS-XE "show running-config" output into a structured device model.
(function (root) {
  const CCA = root.CCA = root.CCA || {};
  const N = CCA.net;

  // Splits text that may contain several pasted configs into one chunk per device.
  function splitConfigs(text) {
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    const chunks = [];
    let cur = [];
    let seenHostname = false;
    const flush = () => {
      if (cur.some(l => l.trim() && l.trim() !== '!' && l.trim() !== 'end')) chunks.push(cur.join('\n'));
      cur = [];
      seenHostname = false;
    };
    for (const line of lines) {
      const t = line.trim();
      if (/^(Building configuration|Current configuration\s*:)/i.test(t) && cur.some(l => /^hostname\s/.test(l))) flush();
      if (/^hostname\s+\S+/.test(line)) {
        if (seenHostname) flush();
        seenHostname = true;
      }
      cur.push(line);
      if (t === 'end') flush();
    }
    flush();
    return chunks;
  }

  // Builds a tree of { text, line, children } from indentation.
  function buildTree(text) {
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    const rootNode = { text: '', line: 0, indent: -1, children: [] };
    const stack = [rootNode];
    const banners = [];
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const lineNo = i + 1;
      if (!raw.trim()) continue;
      const trimmed = raw.trim();
      // Multi-line banners: skip to the closing delimiter.
      const b = trimmed.match(/^banner\s+(motd|login|exec|incoming)\s+(\^C|\S)(.*)$/i);
      if (b && raw.search(/\S/) === 0) {
        const delim = b[2];
        let body = b[3];
        let end = body.indexOf(delim);
        let j = i;
        if (end >= 0) body = body.slice(0, end);
        else {
          const acc = [body];
          while (++j < lines.length) {
            const k = lines[j].indexOf(delim);
            if (k >= 0) { acc.push(lines[j].slice(0, k)); break; }
            acc.push(lines[j]);
          }
          body = acc.join('\n');
        }
        banners.push({ type: b[1].toLowerCase(), text: body.trim(), line: lineNo });
        rootNode.children.push({ text: 'banner ' + b[1].toLowerCase(), line: lineNo, indent: 0, children: [] });
        stack.length = 1;
        i = j;
        continue;
      }
      if (trimmed === '!' || trimmed.startsWith('!')) { if (raw.search(/\S/) === 0) stack.length = 1; continue; }
      if (/^(Building configuration|Current configuration|Last configuration change|NVRAM config last)/i.test(trimmed)) continue;
      if (trimmed === 'end' && raw.search(/\S/) === 0) continue;
      // Skip the prompt line that often comes with a paste ("R1#show run").
      if (/^\S+[#>]\s*(sh|show)\b/i.test(trimmed)) continue;
      const indent = raw.search(/\S/);
      const node = { text: trimmed, line: lineNo, indent, children: [] };
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    }
    return { root: rootNode, banners, lines };
  }

  const PORTS = {
    echo: 7, discard: 9, daytime: 13, 'ftp-data': 20, ftp: 21, ssh: 22, telnet: 23, smtp: 25, time: 37,
    tacacs: 49, domain: 53, bootps: 67, bootpc: 68, tftp: 69, gopher: 70, finger: 79, www: 80, http: 80,
    pop2: 109, pop3: 110, sunrpc: 111, ident: 113, nntp: 119, ntp: 123, 'netbios-ns': 137, 'netbios-dgm': 138,
    'netbios-ss': 139, snmp: 161, snmptrap: 162, bgp: 179, irc: 194, ldap: 389, https: 443, isakmp: 500,
    syslog: 514, cmd: 514, lpd: 515, rip: 520, 'non500-isakmp': 4500
  };
  function portNum(p) {
    if (/^\d+$/.test(p)) return Number(p);
    return PORTS[String(p).toLowerCase()] !== undefined ? PORTS[String(p).toLowerCase()] : null;
  }

  // Parses one address spec from a token list: any | host X | X wildcard | object-group N.
  function takeAddr(tok, i, standard) {
    const t = tok[i];
    if (t === undefined) return [null, i];
    if (t === 'any') return [{ any: true }, i + 1];
    if (t === 'host') return [{ addr: tok[i + 1], wild: '0.0.0.0' }, i + 2];
    if (t === 'object-group' || t === 'addrgroup') return [{ objectGroup: tok[i + 1] }, i + 2];
    if (N.isIp(t)) {
      if (tok[i + 1] && N.isIp(tok[i + 1])) return [{ addr: t, wild: tok[i + 1] }, i + 2];
      if (standard) return [{ addr: t, wild: '0.0.0.0' }, i + 1];
    }
    return [{ unknown: t }, i + 1];
  }

  function takePort(tok, i) {
    const op = tok[i];
    if (['eq', 'neq', 'gt', 'lt'].includes(op)) {
      const ports = [];
      let j = i + 1;
      // "eq" may list several ports
      while (j < tok.length && portNum(tok[j]) !== null && (op === 'eq' || ports.length === 0)) { ports.push(portNum(tok[j])); j++; }
      return [{ op, ports }, j];
    }
    if (op === 'range') return [{ op, ports: [portNum(tok[i + 1]), portNum(tok[i + 2])] }, i + 3];
    return [null, i];
  }

  function parseAce(text, type, line) {
    const raw = text;
    let tok = text.split(/\s+/);
    let seq = null;
    if (/^\d+$/.test(tok[0])) { seq = Number(tok[0]); tok = tok.slice(1); }
    const action = tok[0];
    if (action === 'remark') return { remark: tok.slice(1).join(' '), raw, line, seq };
    if (action !== 'permit' && action !== 'deny') return null;
    const ace = { action, raw, line, seq };
    if (type === 'standard') {
      const [src] = takeAddr(tok, 1, true);
      ace.proto = 'ip';
      ace.src = src;
      ace.dst = { any: true };
    } else {
      ace.proto = tok[1];
      let i = 2;
      let src, dst, sp, dp;
      [src, i] = takeAddr(tok, i, false);
      [sp, i] = takePort(tok, i);
      [dst, i] = takeAddr(tok, i, false);
      [dp, i] = takePort(tok, i);
      Object.assign(ace, { src, dst, srcPort: sp, dstPort: dp, extra: tok.slice(i) });
    }
    ace.log = /\blog(-input)?\b/.test(raw);
    return ace;
  }

  function parseAddrMask(tok, i) {
    if (tok[i] === 'dhcp') return [{ dhcp: true }, i + 1];
    if (N.isIp(tok[i]) && N.isIp(tok[i + 1])) return [{ ip: tok[i], mask: tok[i + 1] }, i + 2];
    const c = (tok[i] || '').match(/^(\d+\.\d+\.\d+\.\d+)\/(\d+)$/);
    if (c) return [{ ip: c[1], mask: N.prefixToMask(Number(c[2])) }, i + 1];
    return [null, i + 1];
  }

  function newInterface(name, line) {
    return {
      name, short: N.shortIfName(name), type: N.ifType(name), line, description: '', shutdown: false,
      ipv4: [], dhcpClient: false, ipv6: [], ipUnnumbered: null,
      switchport: { explicit: false, mode: null, accessVlan: null, voiceVlan: null, trunkAllowed: null, trunkAllowedRaw: null,
        nativeVlan: null, encapsulation: null, nonegotiate: false, portSecurity: null },
      noSwitchport: false, encapsulation: null, helpers: [], accessGroup: { in: null, out: null },
      nat: null, ospf: {}, eigrp: {}, standby: {}, vrrp: {}, channelGroup: null, speed: null, duplex: null,
      mtu: null, ipMtu: null, portfast: false, bpduguard: false, stormControl: false, cdpDisabled: false,
      pppAuth: null, keepalive: null, bandwidth: null, lines: []
    };
  }

  // Expands "1-5,10,20-21" into a Set of numbers.
  function vlanList(str) {
    const s = new Set();
    for (const part of String(str).split(',')) {
      const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
      if (!m) continue;
      const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
      for (let v = a; v <= b && v - a < 4096; v++) s.add(v);
    }
    return s;
  }

  function parseInterface(node, dev) {
    const name = N.normalizeIfName(node.text.replace(/^interface\s+/i, '').split(/\s+/)[0]) || node.text.replace(/^interface\s+/i, '').trim();
    const ifc = newInterface(name, node.line);
    for (const c of node.children) {
      const t = c.text;
      ifc.lines.push(c);
      const tok = t.split(/\s+/);
      let m;
      if (t === 'shutdown') ifc.shutdown = true;
      else if (t === 'no shutdown') ifc.shutdown = false;
      else if (tok[0] === 'description') ifc.description = t.slice(12);
      else if (/^ip address\s/.test(t)) {
        const [a] = parseAddrMask(tok, 2);
        if (a && a.dhcp) ifc.dhcpClient = true;
        else if (a) ifc.ipv4.push({ ip: a.ip, mask: a.mask, secondary: tok.includes('secondary'), line: c.line });
      }
      else if (t === 'no ip address') ifc.ipv4 = [];
      else if ((m = t.match(/^ip unnumbered\s+(\S+)/))) ifc.ipUnnumbered = N.normalizeIfName(m[1]) || m[1];
      else if (/^ipv6 address\s/.test(t)) ifc.ipv6.push({ addr: tok[2], line: c.line });
      else if (t === 'no switchport') ifc.noSwitchport = true;
      else if (t === 'switchport') { ifc.switchport.explicit = true; ifc.noSwitchport = false; }
      else if ((m = t.match(/^switchport mode\s+(.+)$/))) { ifc.switchport.mode = m[1].trim(); ifc.switchport.explicit = true; ifc.switchport.modeLine = c.line; }
      else if ((m = t.match(/^switchport access vlan\s+(\d+)/))) { ifc.switchport.accessVlan = Number(m[1]); ifc.switchport.explicit = true; ifc.switchport.accessLine = c.line; }
      else if ((m = t.match(/^switchport voice vlan\s+(\d+)/))) { ifc.switchport.voiceVlan = Number(m[1]); ifc.switchport.explicit = true; }
      else if ((m = t.match(/^switchport trunk native vlan\s+(\d+)/))) { ifc.switchport.nativeVlan = Number(m[1]); ifc.switchport.explicit = true; ifc.switchport.nativeLine = c.line; }
      else if ((m = t.match(/^switchport trunk allowed vlan\s+(.+)$/))) {
        const spec = m[1].trim();
        const sp = ifc.switchport;
        sp.explicit = true;
        sp.allowedLine = c.line;
        let mm;
        if (spec === 'all') sp.trunkAllowed = null;
        else if (spec === 'none') sp.trunkAllowed = new Set();
        else if ((mm = spec.match(/^add\s+(.+)$/))) { sp.trunkAllowed = sp.trunkAllowed || new Set(); vlanList(mm[1]).forEach(v => sp.trunkAllowed.add(v)); }
        else if ((mm = spec.match(/^remove\s+(.+)$/))) { if (!sp.trunkAllowed) sp.trunkAllowed = vlanList('1-4094'); vlanList(mm[1]).forEach(v => sp.trunkAllowed.delete(v)); }
        else if ((mm = spec.match(/^except\s+(.+)$/))) { sp.trunkAllowed = vlanList('1-4094'); vlanList(mm[1]).forEach(v => sp.trunkAllowed.delete(v)); }
        else sp.trunkAllowed = vlanList(spec);
        sp.trunkAllowedRaw = (sp.trunkAllowedRaw ? sp.trunkAllowedRaw + ' / ' : '') + spec;
      }
      else if ((m = t.match(/^switchport trunk encapsulation\s+(\S+)/))) { ifc.switchport.encapsulation = m[1]; ifc.switchport.explicit = true; }
      else if (t === 'switchport nonegotiate') { ifc.switchport.nonegotiate = true; ifc.switchport.explicit = true; }
      else if (/^switchport port-security/.test(t)) {
        const ps = ifc.switchport.portSecurity = ifc.switchport.portSecurity || { enabled: false, maximum: 1, violation: 'shutdown', sticky: false, macs: [], line: c.line };
        ifc.switchport.explicit = true;
        if (t === 'switchport port-security') ps.enabled = true;
        else if ((m = t.match(/maximum\s+(\d+)/))) ps.maximum = Number(m[1]);
        else if ((m = t.match(/violation\s+(\S+)/))) ps.violation = m[1];
        else if (/mac-address sticky\s*$/.test(t)) ps.sticky = true;
        else if ((m = t.match(/mac-address (?:sticky )?([0-9a-f.]{14})/i))) ps.macs.push(m[1]);
      }
      else if ((m = t.match(/^encapsulation (dot1q|dot1Q)\s+(\d+)(\s+native)?/i))) ifc.encapsulation = { type: 'dot1q', vlan: Number(m[2]), native: !!m[3], line: c.line };
      else if ((m = t.match(/^encapsulation\s+(\S+)/))) ifc.encapsulation = { type: m[1].toLowerCase(), line: c.line };
      else if ((m = t.match(/^ip helper-address\s+(\S+)/))) ifc.helpers.push({ ip: m[1], line: c.line });
      else if ((m = t.match(/^ip access-group\s+(\S+)\s+(in|out)/))) ifc.accessGroup[m[2]] = { name: m[1], line: c.line };
      else if ((m = t.match(/^ip nat (inside|outside)/))) ifc.nat = m[1];
      else if ((m = t.match(/^ip ospf\s+(\d+)\s+area\s+(\S+)/))) ifc.ospf.area = { pid: m[1], area: normArea(m[2]), line: c.line };
      else if ((m = t.match(/^ip ospf hello-interval\s+(\d+)/))) ifc.ospf.hello = Number(m[1]);
      else if ((m = t.match(/^ip ospf dead-interval\s+(\d+)/))) ifc.ospf.dead = Number(m[1]);
      else if ((m = t.match(/^ip ospf network\s+(\S+)/))) ifc.ospf.networkType = m[1];
      else if ((m = t.match(/^ip ospf cost\s+(\d+)/))) ifc.ospf.cost = Number(m[1]);
      else if ((m = t.match(/^ip ospf priority\s+(\d+)/))) ifc.ospf.priority = Number(m[1]);
      else if ((m = t.match(/^ip ospf authentication(\s+(\S+))?/))) ifc.ospf.auth = m[2] || 'simple';
      else if ((m = t.match(/^ip ospf message-digest-key\s+(\d+)\s+md5\s+(?:\d\s+)?(\S+)/))) ifc.ospf.md5 = { key: m[1], secret: m[2] };
      else if ((m = t.match(/^ip ospf authentication-key\s+(?:\d\s+)?(\S+)/))) ifc.ospf.authKey = m[1];
      else if ((m = t.match(/^ip hello-interval eigrp\s+(\d+)\s+(\d+)/))) ifc.eigrp.hello = Number(m[2]);
      else if ((m = t.match(/^ip authentication mode eigrp\s+(\d+)\s+md5/))) ifc.eigrp.auth = 'md5';
      else if ((m = t.match(/^ip authentication key-chain eigrp\s+(\d+)\s+(\S+)/))) ifc.eigrp.keyChain = m[2];
      else if ((m = t.match(/^standby\s+(?:(\d+)\s+)?(ip|priority|preempt|version|authentication)\b\s*(.*)$/))) {
        const g = m[1] || '0';
        const s = ifc.standby[g] = ifc.standby[g] || { group: Number(g), ip: null, priority: 100, preempt: false, line: c.line };
        if (m[2] === 'ip') s.ip = m[3].split(/\s+/)[0] || null;
        else if (m[2] === 'priority') s.priority = Number(m[3]);
        else if (m[2] === 'preempt') s.preempt = true;
        else if (m[2] === 'version') s.version = Number(m[3]);
        else if (m[2] === 'authentication') s.auth = m[3];
      }
      else if ((m = t.match(/^vrrp\s+(\d+)\s+(ip|priority)\s+(\S+)/))) {
        const v = ifc.vrrp[m[1]] = ifc.vrrp[m[1]] || { group: Number(m[1]), ip: null, priority: 100 };
        if (m[2] === 'ip') v.ip = m[3]; else v.priority = Number(m[3]);
      }
      else if ((m = t.match(/^channel-group\s+(\d+)\s+mode\s+(\S+)/))) ifc.channelGroup = { id: Number(m[1]), mode: m[2], line: c.line };
      else if ((m = t.match(/^speed\s+(\S+)/))) ifc.speed = m[1];
      else if ((m = t.match(/^duplex\s+(\S+)/))) ifc.duplex = { value: m[1], line: c.line };
      else if ((m = t.match(/^mtu\s+(\d+)/))) ifc.mtu = Number(m[1]);
      else if ((m = t.match(/^ip mtu\s+(\d+)/))) ifc.ipMtu = Number(m[1]);
      else if (/^spanning-tree portfast(\s+edge)?\s*$/.test(t) || /^spanning-tree portfast( edge)? trunk/.test(t)) ifc.portfast = true;
      else if (/^spanning-tree bpduguard enable/.test(t)) ifc.bpduguard = true;
      else if (/^storm-control/.test(t)) ifc.stormControl = true;
      else if (t === 'no cdp enable') ifc.cdpDisabled = true;
      else if ((m = t.match(/^ppp authentication\s+(.+)$/))) ifc.pppAuth = m[1];
      else if ((m = t.match(/^bandwidth\s+(\d+)/))) ifc.bandwidth = Number(m[1]);
      else if ((m = t.match(/^clock rate\s+(\d+)/))) ifc.clockRate = Number(m[1]);
      else if ((m = t.match(/^(?:ip )?vrf forwarding\s+(\S+)/))) ifc.vrf = m[1];
      else if ((m = t.match(/^ip nat\s/))) { /* handled above */ }
    }
    if (ifc.ipv4.length && !ifc.ipv4.some(a => !a.secondary)) ifc.ipv4[0].secondary = false;
    return ifc;
  }

  function normArea(a) {
    if (N.isIp(a)) return String(N.ipToInt(a));
    return String(Number(a));
  }

  function parseRouterOspf(node) {
    const m = node.text.match(/^router ospf\s+(\d+)(?:\s+vrf\s+(\S+))?/);
    const o = { pid: m[1], vrf: m[2] || null, line: node.line, routerId: null, networks: [], passiveDefault: false, passive: [], noPassive: [],
      defaultOriginate: null, redistribute: [], areaAuth: {}, autoCost: null };
    for (const c of node.children) {
      const t = c.text;
      let mm;
      if ((mm = t.match(/^router-id\s+(\S+)/))) o.routerId = mm[1];
      else if ((mm = t.match(/^network\s+(\S+)\s+(\S+)\s+area\s+(\S+)/))) o.networks.push({ addr: mm[1], wild: mm[2], area: normArea(mm[3]), areaRaw: mm[3], line: c.line });
      else if (t === 'passive-interface default') o.passiveDefault = true;
      else if ((mm = t.match(/^no passive-interface\s+(\S+)/))) o.noPassive.push(N.normalizeIfName(mm[1]) || mm[1]);
      else if ((mm = t.match(/^passive-interface\s+(\S+)/))) o.passive.push(N.normalizeIfName(mm[1]) || mm[1]);
      else if ((mm = t.match(/^default-information originate(.*)$/))) o.defaultOriginate = { always: /always/.test(mm[1]), line: c.line };
      else if ((mm = t.match(/^redistribute\s+(\S+)(.*)$/))) o.redistribute.push({ proto: mm[1], args: mm[2].trim(), line: c.line });
      else if ((mm = t.match(/^area\s+(\S+)\s+authentication(\s+message-digest)?/))) o.areaAuth[normArea(mm[1])] = mm[2] ? 'message-digest' : 'simple';
    }
    return o;
  }

  function parseRouterEigrp(node) {
    const m = node.text.match(/^router eigrp\s+(\S+)/);
    const e = { asn: m[1], named: !/^\d+$/.test(m[1]), line: node.line, networks: [], autoSummary: null, passiveDefault: false, passive: [], noPassive: [],
      redistribute: [], kValues: null, routerId: null };
    const walk = (children) => {
      for (const c of children) {
        const t = c.text;
        let mm;
        if ((mm = t.match(/^address-family ipv4(?:\s+unicast)?(?:\s+vrf\s+\S+)?\s+autonomous-system\s+(\d+)/))) { e.asn = mm[1]; walk(c.children); }
        else if ((mm = t.match(/^network\s+(\S+)(?:\s+(\S+))?/))) e.networks.push({ addr: mm[1], wild: mm[2] || null, line: c.line });
        else if (t === 'no auto-summary') e.autoSummary = false;
        else if (t === 'auto-summary') e.autoSummary = true;
        else if (t === 'passive-interface default') e.passiveDefault = true;
        else if ((mm = t.match(/^no passive-interface\s+(\S+)/))) e.noPassive.push(N.normalizeIfName(mm[1]) || mm[1]);
        else if ((mm = t.match(/^passive-interface\s+(\S+)/))) e.passive.push(N.normalizeIfName(mm[1]) || mm[1]);
        else if ((mm = t.match(/^metric weights\s+(.+)$/))) e.kValues = mm[1].trim();
        else if ((mm = t.match(/^(?:eigrp )?router-id\s+(\S+)/))) e.routerId = mm[1];
        else if ((mm = t.match(/^redistribute\s+(\S+)(.*)$/))) e.redistribute.push({ proto: mm[1], args: mm[2].trim(), line: c.line });
        else if (c.children.length) walk(c.children);
      }
    };
    walk(node.children);
    return e;
  }

  function parseRouterRip(node) {
    const r = { version: 1, versionSet: false, networks: [], autoSummary: null, passive: [], passiveDefault: false, line: node.line, redistribute: [], defaultOriginate: false };
    for (const c of node.children) {
      const t = c.text;
      let mm;
      if ((mm = t.match(/^version\s+(\d)/))) { r.version = Number(mm[1]); r.versionSet = true; }
      else if ((mm = t.match(/^network\s+(\S+)/))) r.networks.push({ addr: mm[1], line: c.line });
      else if (t === 'no auto-summary') r.autoSummary = false;
      else if (t === 'passive-interface default') r.passiveDefault = true;
      else if ((mm = t.match(/^passive-interface\s+(\S+)/))) r.passive.push(N.normalizeIfName(mm[1]) || mm[1]);
      else if (/^default-information originate/.test(t)) r.defaultOriginate = true;
      else if ((mm = t.match(/^redistribute\s+(\S+)(.*)$/))) r.redistribute.push({ proto: mm[1], args: mm[2].trim(), line: c.line });
    }
    return r;
  }

  function parseRouterBgp(node) {
    const m = node.text.match(/^router bgp\s+(\S+)/);
    const b = { asn: m[1], line: node.line, routerId: null, neighbors: {}, networks: [] };
    const nb = ip => (b.neighbors[ip] = b.neighbors[ip] || { ip, remoteAs: null, activated: null, shutdown: false, updateSource: null, multihop: null });
    const walk = (children) => {
      for (const c of children) {
        const t = c.text;
        let mm;
        if ((mm = t.match(/^bgp router-id\s+(\S+)/))) b.routerId = mm[1];
        else if ((mm = t.match(/^neighbor\s+(\S+)\s+remote-as\s+(\S+)/))) { const n = nb(mm[1]); n.remoteAs = mm[2]; n.line = c.line; }
        else if ((mm = t.match(/^neighbor\s+(\S+)\s+update-source\s+(\S+)/))) nb(mm[1]).updateSource = N.normalizeIfName(mm[2]) || mm[2];
        else if ((mm = t.match(/^neighbor\s+(\S+)\s+ebgp-multihop(?:\s+(\d+))?/))) nb(mm[1]).multihop = mm[2] ? Number(mm[2]) : 255;
        else if ((mm = t.match(/^neighbor\s+(\S+)\s+shutdown/))) nb(mm[1]).shutdown = true;
        else if ((mm = t.match(/^neighbor\s+(\S+)\s+activate/))) nb(mm[1]).activated = true;
        else if ((mm = t.match(/^network\s+(\S+)(?:\s+mask\s+(\S+))?/))) b.networks.push({ addr: mm[1], mask: mm[2] || null, line: c.line });
        else if (c.children.length) walk(c.children);
      }
    };
    walk(node.children);
    return b;
  }

  function parseAclBlock(name, type, children, acl) {
    for (const c of children) {
      const ace = parseAce(c.text, type, c.line);
      if (ace) acl.entries.push(ace);
    }
  }

  function guessDeviceType(dev, tree) {
    const all = [];
    const walk = n => { for (const c of n.children) { all.push(c.text); walk(c); } };
    walk(tree);
    const hasSwitchport = all.some(t => /^switchport\b/.test(t));
    const hasVlanIf = Object.keys(dev.interfaces).some(n => /^Vlan\d/.test(n));
    const hasStp = all.some(t => /^spanning-tree (mode|extend|vlan)/.test(t));
    const hasVtp = all.some(t => /^vtp /.test(t));
    const hasSerial = Object.keys(dev.interfaces).some(n => /^Serial/.test(n));
    const physCount = Object.keys(dev.interfaces).filter(n => /Ethernet/.test(n) && !n.includes('.')).length;
    if (hasSwitchport || hasVtp || (hasVlanIf && physCount > 4) || (hasStp && physCount > 4)) return 'switch';
    if (hasSerial) return 'router';
    if (hasVlanIf && !Object.keys(dev.interfaces).some(n => n.includes('.'))) return 'switch';
    return 'router';
  }

  function parseDevice(text, sourceName) {
    const { root: tree, banners, lines } = buildTree(text);
    const dev = {
      id: null, source: sourceName || 'pasted', text, lines, hostname: null, hostnameLine: null, version: null,
      interfaces: {}, interfaceOrder: [], vlans: {}, vlanStatements: false, staticRoutes: [], defaultGateway: null,
      ospf: [], eigrp: [], rip: null, bgp: null, acls: {}, nat: { rules: [], pools: {} }, dhcpPools: {}, dhcpExcluded: [],
      dhcpDisabled: false, term: { con: [], aux: [], vty: [] }, users: [], enableSecret: null, enablePassword: null,
      servicePasswordEncryption: false, sshVersion: null, domainName: null, httpServer: false, httpsServer: false,
      snmp: [], stpMode: null, vtp: {}, banners, loggingHosts: [], ntpServers: [], cdpRun: true, lldpRun: false,
      ipv6Routing: false, domainLookup: true, nameServers: [], ipRoutingLine: null, noIpRouting: false, ipRoutingExplicit: false,
      aaaNewModel: false, keyChains: {}, routeMaps: {}, prefixLists: {}, top: tree.children
    };
    for (const node of tree.children) {
      const t = node.text;
      const tok = t.split(/\s+/);
      let m;
      if ((m = t.match(/^hostname\s+(\S+)/))) { dev.hostname = m[1]; dev.hostnameLine = node.line; }
      else if ((m = t.match(/^version\s+(\S+)/))) dev.version = m[1];
      else if (/^interface\s/.test(t)) {
        const ifc = parseInterface(node, dev);
        dev.interfaces[ifc.name] = ifc;
        dev.interfaceOrder.push(ifc.name);
      }
      else if ((m = t.match(/^vlan\s+([\d,\-]+)\s*$/))) {
        dev.vlanStatements = true;
        for (const v of vlanList(m[1])) {
          const vl = dev.vlans[v] = { id: v, name: null, line: node.line };
          for (const c of node.children) { const mm = c.text.match(/^name\s+(.+)$/); if (mm) vl.name = mm[1]; }
        }
      }
      else if (t === 'ip routing') { dev.ipRoutingExplicit = true; dev.ipRoutingLine = node.line; }
      else if (t === 'no ip routing') dev.noIpRouting = true;
      else if ((m = t.match(/^ip default-gateway\s+(\S+)/))) dev.defaultGateway = { ip: m[1], line: node.line };
      else if (/^ip route\s/.test(t)) {
        let i = 2;
        let vrf = null;
        if (tok[2] === 'vrf') { vrf = tok[3]; i = 4; }
        const r = { prefix: tok[i], mask: tok[i + 1], nextHop: null, iface: null, ad: 1, vrf, line: node.line, raw: t, permanent: tok.includes('permanent') };
        let j = i + 2;
        if (tok[j] && !N.isIp(tok[j]) && N.normalizeIfName(tok[j])) { r.iface = N.normalizeIfName(tok[j]); j++; }
        else if (tok[j] && !N.isIp(tok[j]) && /^(Null|null)/.test(tok[j])) { r.iface = 'Null0'; j++; }
        if (tok[j] && N.isIp(tok[j])) { r.nextHop = tok[j]; j++; }
        if (tok[j] && /^\d+$/.test(tok[j])) r.ad = Number(tok[j]);
        dev.staticRoutes.push(r);
      }
      else if (/^router ospf\s/.test(t)) dev.ospf.push(parseRouterOspf(node));
      else if (/^router eigrp\s/.test(t)) dev.eigrp.push(parseRouterEigrp(node));
      else if (/^router rip\b/.test(t)) dev.rip = parseRouterRip(node);
      else if (/^router bgp\s/.test(t)) dev.bgp = parseRouterBgp(node);
      else if ((m = t.match(/^access-list\s+(\d+)\s+(.*)$/))) {
        const num = Number(m[1]);
        const type = (num < 100 || (num >= 1300 && num < 2000)) ? 'standard' : 'extended';
        const acl = dev.acls[m[1]] = dev.acls[m[1]] || { name: m[1], type, entries: [], line: node.line, numbered: true };
        const ace = parseAce(m[2], type, node.line);
        if (ace) acl.entries.push(ace);
      }
      else if ((m = t.match(/^ip access-list\s+(standard|extended)\s+(\S+)/))) {
        const acl = dev.acls[m[2]] = dev.acls[m[2]] || { name: m[2], type: m[1], entries: [], line: node.line, numbered: false };
        parseAclBlock(m[2], m[1], node.children, acl);
      }
      else if ((m = t.match(/^ip nat inside source\s+(.*)$/))) {
        const rest = m[1];
        let mm;
        if ((mm = rest.match(/^list\s+(\S+)\s+(pool\s+(\S+)|interface\s+(\S+))(.*)$/))) {
          dev.nat.rules.push({ type: 'list', list: mm[1], pool: mm[3] || null, iface: mm[4] ? (N.normalizeIfName(mm[4]) || mm[4]) : null, overload: /overload/.test(mm[5]), line: node.line });
        } else if ((mm = rest.match(/^static\s+(?:(tcp|udp)\s+)?(\S+)\s+(?:(\d+)\s+)?(\S+)/))) {
          dev.nat.rules.push({ type: 'static', proto: mm[1] || null, local: mm[2], global: mm[4], line: node.line });
        } else if ((mm = rest.match(/^route-map\s+(\S+)\s+(pool\s+(\S+)|interface\s+(\S+))(.*)$/))) {
          dev.nat.rules.push({ type: 'route-map', routeMap: mm[1], pool: mm[3] || null, iface: mm[4] ? (N.normalizeIfName(mm[4]) || mm[4]) : null, overload: /overload/.test(mm[5]), line: node.line });
        }
      }
      else if ((m = t.match(/^ip nat pool\s+(\S+)\s+(\S+)\s+(\S+)\s+(netmask|prefix-length)\s+(\S+)/))) {
        dev.nat.pools[m[1]] = { name: m[1], start: m[2], end: m[3], mask: m[4] === 'netmask' ? m[5] : N.prefixToMask(Number(m[5])), line: node.line };
      }
      else if ((m = t.match(/^ip dhcp excluded-address\s+(\S+)(?:\s+(\S+))?/))) dev.dhcpExcluded.push({ start: m[1], end: m[2] || m[1], line: node.line });
      else if ((m = t.match(/^ip dhcp pool\s+(\S+)/))) {
        const p = { name: m[1], line: node.line, network: null, mask: null, defaultRouter: [], dns: [], host: null };
        for (const c of node.children) {
          let mm;
          if ((mm = c.text.match(/^network\s+(\S+)\s+(\S+)/))) { p.network = mm[1]; p.mask = mm[2].startsWith('/') ? N.prefixToMask(Number(mm[2].slice(1))) : mm[2]; p.networkLine = c.line; }
          else if ((mm = c.text.match(/^default-router\s+(.+)$/))) { p.defaultRouter = mm[1].trim().split(/\s+/); p.defaultRouterLine = c.line; }
          else if ((mm = c.text.match(/^dns-server\s+(.+)$/))) p.dns = mm[1].trim().split(/\s+/);
          else if ((mm = c.text.match(/^host\s+(\S+)/))) p.host = mm[1];
        }
        dev.dhcpPools[p.name] = p;
      }
      else if (t === 'no service dhcp') dev.dhcpDisabled = true;
      else if ((m = t.match(/^line\s+(con|console|aux|vty)\s+(\d+)(?:\s+(\d+))?/))) {
        const kind = m[1] === 'console' ? 'con' : m[1];
        const ln = { kind, from: Number(m[2]), to: m[3] ? Number(m[3]) : Number(m[2]), line: node.line, login: null, password: null,
          transportInput: null, accessClass: null, execTimeout: null, loggingSync: false };
        for (const c of node.children) {
          let mm;
          const ct = c.text;
          if (ct === 'login') ln.login = 'line';
          else if (ct === 'login local') ln.login = 'local';
          else if ((mm = ct.match(/^login authentication\s+(\S+)/))) ln.login = 'aaa:' + mm[1];
          else if (ct === 'no login') ln.login = 'none';
          else if ((mm = ct.match(/^password\s+(?:(\d)\s+)?(\S+)/))) ln.password = { type: mm[1] ? Number(mm[1]) : 0, line: c.line };
          else if ((mm = ct.match(/^transport input\s+(.+)$/))) { ln.transportInput = mm[1].trim(); ln.transportLine = c.line; }
          else if ((mm = ct.match(/^access-class\s+(\S+)\s+(in|out)/))) ln.accessClass = { name: mm[1], dir: mm[2], line: c.line };
          else if ((mm = ct.match(/^exec-timeout\s+(\d+)(?:\s+(\d+))?/))) ln.execTimeout = { min: Number(mm[1]), sec: Number(mm[2] || 0), line: c.line };
          else if (ct === 'logging synchronous') ln.loggingSync = true;
        }
        dev.term[kind].push(ln);
      }
      else if ((m = t.match(/^username\s+(\S+)(.*)$/))) {
        const rest = m[2];
        const u = { name: m[1], privilege: 1, kind: null, type: null, line: node.line };
        let mm;
        if ((mm = rest.match(/privilege\s+(\d+)/))) u.privilege = Number(mm[1]);
        if ((mm = rest.match(/\b(secret|password)\s+(?:(\d)\s+)?\S+/))) { u.kind = mm[1]; u.type = mm[2] ? Number(mm[2]) : 0; }
        if ((mm = rest.match(/\balgorithm-type\s+(\S+)/))) u.algorithm = mm[1];
        dev.users.push(u);
      }
      else if ((m = t.match(/^enable secret\s+(?:(\d+)\s+)?\S+/))) dev.enableSecret = { type: m[1] ? Number(m[1]) : 0, line: node.line };
      else if ((m = t.match(/^enable password\s+(?:(\d+)\s+)?\S+/))) dev.enablePassword = { type: m[1] ? Number(m[1]) : 0, line: node.line };
      else if (t === 'service password-encryption') dev.servicePasswordEncryption = true;
      else if ((m = t.match(/^ip ssh version\s+(\d)/))) dev.sshVersion = Number(m[1]);
      else if ((m = t.match(/^ip domain[- ]name\s+(\S+)/))) dev.domainName = m[1];
      else if (t === 'ip http server') dev.httpServer = { line: node.line };
      else if (t === 'ip http secure-server') dev.httpsServer = true;
      else if ((m = t.match(/^snmp-server community\s+(\S+)(?:\s+(RO|RW|ro|rw))?(?:\s+(\S+))?/))) dev.snmp.push({ community: m[1], access: (m[2] || 'RO').toUpperCase(), acl: m[3] || null, line: node.line });
      else if ((m = t.match(/^spanning-tree mode\s+(\S+)/))) dev.stpMode = m[1];
      else if ((m = t.match(/^vtp\s+(mode|domain|version|password)\s+(\S+)/))) dev.vtp[m[1]] = m[2];
      else if ((m = t.match(/^logging(?:\s+host)?\s+(\d+\.\d+\.\d+\.\d+)/))) dev.loggingHosts.push(m[1]);
      else if ((m = t.match(/^ntp server\s+(\S+)/))) dev.ntpServers.push(m[1]);
      else if (t === 'no cdp run') dev.cdpRun = false;
      else if (t === 'lldp run') dev.lldpRun = true;
      else if (t === 'ipv6 unicast-routing') dev.ipv6Routing = true;
      else if (t === 'no ip domain-lookup' || t === 'no ip domain lookup') dev.domainLookup = false;
      else if ((m = t.match(/^ip name-server\s+(.+)$/))) dev.nameServers.push(...m[1].trim().split(/\s+/));
      else if (t === 'aaa new-model') dev.aaaNewModel = true;
    }
    dev.type = guessDeviceType(dev, tree);
    dev.ipRouting = dev.type === 'router' ? !dev.noIpRouting : dev.ipRoutingExplicit;
    if (dev.type === 'switch' && dev.ipRouting) dev.type = 'l3switch';
    // Decide which interfaces are layer 2 switchports.
    for (const name of dev.interfaceOrder) {
      const ifc = dev.interfaces[name];
      const routedByType = /^(Vlan|Loopback|Tunnel|Null|Dialer|BVI|Serial|Multilink)/.test(name) || name.includes('.');
      if (dev.type === 'router') ifc.isL2 = ifc.switchport.explicit && !ifc.noSwitchport;
      else ifc.isL2 = !routedByType && !ifc.noSwitchport;
      ifc.mode = ifc.isL2 ? (ifc.switchport.mode || 'dynamic auto') : 'routed';
    }
    dev.hostname = dev.hostname || (sourceName ? sourceName.replace(/\.[^.]+$/, '') : 'unnamed');
    return dev;
  }

  // Convenience: every IPv4 address on the device with its interface.
  function addresses(dev) {
    const out = [];
    for (const name of dev.interfaceOrder) {
      const ifc = dev.interfaces[name];
      for (const a of ifc.ipv4) out.push({ dev, ifc, ip: a.ip, mask: a.mask, secondary: a.secondary, line: a.line });
    }
    return out;
  }

  CCA.parser = { splitConfigs, buildTree, parseDevice, addresses, vlanList, portNum, parseAce };
  if (typeof module !== 'undefined' && module.exports) module.exports = CCA;
})(typeof window !== 'undefined' ? window : globalThis);
