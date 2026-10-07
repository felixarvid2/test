// Troubleshooting assistant: reads a free-text problem description, combines it with the
// loaded configs and returns likely causes, a test plan and verification steps.
(function (root) {
  const CCA = root.CCA = root.CCA || {};
  const N = CCA.net;
  const T = CCA.topology;

  const SERVICES = [
    [/\bssh\b/, { proto: 'tcp', dstPort: 22, label: 'SSH (TCP 22)' }],
    [/\btelnet\b/, { proto: 'tcp', dstPort: 23, label: 'Telnet (TCP 23)' }],
    [/\bhttps\b/, { proto: 'tcp', dstPort: 443, label: 'HTTPS (TCP 443)' }],
    [/\b(http|web ?server|website|web page|browse|browser)\b/, { proto: 'tcp', dstPort: 80, label: 'HTTP (TCP 80)' }],
    [/\b(dns|nslookup)\b/, { proto: 'udp', dstPort: 53, label: 'DNS (UDP 53)' }],
    [/\b(ftp)\b/, { proto: 'tcp', dstPort: 21, label: 'FTP (TCP 21)' }],
    [/\b(smtp|mail)\b/, { proto: 'tcp', dstPort: 25, label: 'SMTP (TCP 25)' }],
    [/\b(rdp|remote desktop)\b/, { proto: 'tcp', dstPort: 3389, label: 'RDP (TCP 3389)' }]
  ];

  function extract(text, devices) {
    const lower = text.toLowerCase();
    const ips = N.findIps(text);
    const vlans = [];
    const re = /\bvlan\s*(\d{1,4})\b/gi;
    let m;
    while ((m = re.exec(text))) { const v = Number(m[1]); if (v >= 1 && v <= 4094 && !vlans.includes(v)) vlans.push(v); }
    const ifaces = N.findIfNames(text).filter(n => !/^Vlan/.test(n));
    const devs = devices.filter(d => new RegExp('(^|[^A-Za-z0-9_-])' + d.hostname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^A-Za-z0-9_-])', 'i').test(text));
    let service = null;
    for (const [rx, s] of SERVICES) if (rx.test(lower)) { service = s; break; }
    const internet = /\b(internet|google|8\.8\.8\.8|online|isp|outside world|websites?|youtube|external)\b/.test(lower);
    return { ips, vlans, ifaces, devs, service, internet, lower };
  }

  function scorePlaybooks(ex) {
    const out = [];
    for (const pb of CCA.playbooks) {
      let s = 0;
      const hits = [];
      for (const k of pb.keywords) {
        const rx = new RegExp('(^|[^a-z0-9])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])');
        if (rx.test(ex.lower)) { s += k.includes(' ') ? 3 : 2; hits.push(k); }
      }
      if (ex.vlans.length && ['intervlan', 'trunk', 'dhcp'].includes(pb.id)) s += ex.vlans.length > 1 && pb.id === 'intervlan' ? 3 : 1;
      if (ex.internet && pb.id === 'internet') s += 3;
      if (ex.service && ex.service.dstPort <= 23 && pb.id === 'remote') s += 2;
      out.push({ pb, score: s, hits });
    }
    out.sort((a, b) => b.score - a.score);
    const top = out[0].score;
    if (!top) return [{ pb: CCA.playbooks.find(p => p.id === 'connectivity'), score: 0, hits: [] }];
    return out.filter(x => x.score > 0 && x.score >= top * 0.4).slice(0, 3);
  }

  // Routed interfaces that act as gateway for a VLAN.
  // With loose=true, a subinterface numbered .<vlan> counts even if it is tagged with another VLAN.
  function vlanGateways(model, v, loose) {
    const out = [];
    for (const d of model.devices) for (const n of d.interfaceOrder) {
      const i = d.interfaces[n];
      const exact = (i.encapsulation && i.encapsulation.type === 'dot1q' && i.encapsulation.vlan === v) || (n === 'Vlan' + v);
      const byNumber = loose && !exact && n.includes('.') && Number(n.split('.')[1]) === v;
      if (exact || byNumber) for (const a of i.ipv4) out.push({ dev: d, ifc: i, ip: a.ip, mask: a.mask, mismatch: byNumber });
    }
    return out;
  }

  function hostIn(net, mask) {
    const base = N.ipToInt(N.network(net, mask));
    const size = 2 ** (32 - N.maskToPrefix(mask));
    const off = size > 64 ? 50 : Math.max(1, Math.floor(size / 2));
    return N.intToIp((base + off) >>> 0);
  }

  function pickHost(model, gws) {
    const g = gws.find(x => T.ifUp(x.dev, x.ifc)) || gws[0];
    if (!g) return null;
    // Avoid choosing an address that is assigned to a device.
    let h = hostIn(g.ip, g.mask);
    if (model.ownerOf(h)) h = N.intToIp((N.ipToInt(h) + 7) >>> 0);
    return h;
  }

  function choosePath(model, ex, opts) {
    let src = opts.src || null, dst = opts.dst || null;
    const notes = [];
    const ips = ex.ips.map(x => x.ip);
    if (!src && !dst && ips.length >= 2) { src = ips[0]; dst = ips[1]; }
    else if (!src && ips.length >= 1 && dst && ips[0] !== dst) src = ips[0];
    else if (!dst && ips.length >= 1 && src && ips[0] !== src) dst = ips[0];
    const vlanHost = v => { const h = pickHost(model, vlanGateways(model, v, true)); if (h) notes.push('A host in VLAN ' + v + ' is represented by ' + h + '.'); return h; };
    if (!src && ex.vlans.length) src = vlanHost(ex.vlans[0]);
    if (!dst && ex.vlans.length > 1) dst = vlanHost(ex.vlans[1]);
    if (!src && ips.length === 1 && (ex.internet || ex.vlans.length || ex.devs.length)) src = ips[0];
    if (!dst && ips.length === 1 && src && src !== ips[0]) dst = ips[0];
    if (!dst && ex.devs.length && src) {
      const d = ex.devs.find(x => !T.l3Addresses(x, false).some(a => a.ip === src)) || ex.devs[0];
      const a = T.l3Addresses(d, false)[0];
      if (a && a.ip !== src) { dst = a.ip; notes.push('Destination ' + d.hostname + ' is represented by its address ' + a.ip + ' (' + a.ifc.short + ').'); }
    }
    if (!dst && ex.internet && src) { dst = '8.8.8.8'; notes.push('"The Internet" is represented by 8.8.8.8.'); }
    if (!src || !dst || src === dst) return null;
    return { src, dst, notes };
  }

  function describeIp(model, ip) {
    const owner = model.ownerOf(ip);
    if (owner) return ip + ' is configured on ' + owner.dev.hostname + ' ' + owner.ifc.short + (owner.ifc.shutdown ? ' (interface is SHUT DOWN)' : '') + '.';
    const g = T.gatewayFor(model, ip);
    if (!g.gw) return ip + ' is not inside any subnet of the loaded devices' + (ip === '8.8.8.8' ? ' (Internet).' : '.');
    const a = g.gw;
    let s = ip + ' is in ' + N.cidr(a.ip, a.mask) + ' – gateway ' + a.ip + ' on ' + a.dev.hostname + ' ' + a.ifc.short;
    if (a.ifc.encapsulation && a.ifc.encapsulation.vlan) s += ' (VLAN ' + a.ifc.encapsulation.vlan + ')';
    if (/^Vlan\d+/.test(a.ifc.name)) s += ' (VLAN ' + a.ifc.name.slice(4) + ')';
    if (!N.isHostAddress(ip, a.mask)) s += '. NOTE: this is the network or broadcast address and cannot be used by a host';
    const pool = findPool(model, ip);
    if (pool) s += '. DHCP: pool ' + pool.p.name + ' on ' + pool.dev.hostname + ' (gateway handed out: ' + (pool.p.defaultRouter.join(', ') || 'none') + ')';
    return s + '.';
  }

  function findPool(model, ip) {
    for (const dev of model.devices) for (const p of Object.values(dev.dhcpPools)) if (p.network && p.mask && N.inSubnet(ip, p.network, p.mask)) return { dev, p };
    return null;
  }

  function describeVlan(model, v) {
    const lines = [];
    for (const d of model.devices) {
      const parts = [];
      const access = d.interfaceOrder.map(n => d.interfaces[n]).filter(i => i.isL2 && i.mode === 'access' && (i.switchport.accessVlan || 1) === v);
      const trunks = d.interfaceOrder.map(n => d.interfaces[n]).filter(i => i.isL2 && i.mode === 'trunk');
      if (d.type !== 'router') {
        if (d.vlanStatements) parts.push(d.vlans[v] ? 'VLAN exists' + (d.vlans[v].name ? ' ("' + d.vlans[v].name + '")' : '') : 'VLAN NOT defined');
        if (access.length) parts.push('access ports: ' + access.map(i => i.short + (i.shutdown ? ' (shut)' : '')).join(', '));
        const carry = trunks.filter(t => !t.switchport.trunkAllowed || t.switchport.trunkAllowed.has(v));
        const block = trunks.filter(t => t.switchport.trunkAllowed && !t.switchport.trunkAllowed.has(v));
        if (carry.length) parts.push('carried on trunk ' + carry.map(t => t.short + ((t.switchport.nativeVlan || 1) === v ? ' (native)' : '')).join(', '));
        if (block.length) parts.push('NOT allowed on trunk ' + block.map(t => t.short).join(', '));
      }
      for (const g of vlanGateways(model, v).filter(x => x.dev === d)) {
        parts.push('gateway ' + g.ifc.short + ' ' + g.ip + '/' + N.maskToPrefix(g.mask) + (T.ifUp(d, g.ifc) ? '' : ' (DOWN)') + (g.ifc.helpers.length ? ', helper ' + g.ifc.helpers.map(h => h.ip).join(', ') : ''));
        const pool = findPool(model, g.ip);
        if (pool) parts.push('DHCP pool ' + pool.p.name + ' on ' + pool.dev.hostname + ' (default-router ' + (pool.p.defaultRouter.join(', ') || 'none') + ')');
      }
      if (parts.length) lines.push(d.hostname + ': ' + parts.join('; '));
    }
    if (!vlanGateways(model, v).length) {
      const near = vlanGateways(model, v, true);
      if (near.length) for (const g of near) lines.push(g.dev.hostname + ': ' + g.ifc.short + ' (' + g.ip + '/' + N.maskToPrefix(g.mask) + (g.ifc.description ? ', "' + g.ifc.description + '"' : '') + ') looks like the VLAN ' + v + ' gateway but is tagged with VLAN ' + (g.ifc.encapsulation ? g.ifc.encapsulation.vlan : 'none') + '!');
      else lines.push('No loaded device has a gateway (subinterface or SVI) for VLAN ' + v + '.');
    }
    return lines;
  }

  function describeIface(model, ex, name) {
    const out = [];
    const devs = ex.devs.length ? ex.devs : model.devices;
    for (const d of devs) {
      const i = d.interfaces[name];
      if (!i) continue;
      const bits = [];
      bits.push(i.shutdown ? 'administratively DOWN' : 'enabled');
      if (i.description) bits.push('"' + i.description + '"');
      if (i.isL2) bits.push('switchport ' + i.mode + (i.mode === 'access' ? ' VLAN ' + (i.switchport.accessVlan || 1) : '') + (i.mode === 'trunk' ? ' (native ' + (i.switchport.nativeVlan || 1) + ', allowed ' + (i.switchport.trunkAllowedRaw || 'all') + ')' : ''));
      for (const a of i.ipv4) bits.push(a.ip + '/' + N.maskToPrefix(a.mask));
      if (i.accessGroup.in) bits.push('ACL in ' + i.accessGroup.in.name);
      if (i.accessGroup.out) bits.push('ACL out ' + i.accessGroup.out.name);
      if (i.duplex) bits.push('duplex ' + i.duplex.value);
      if (i.switchport.portSecurity && i.switchport.portSecurity.enabled) bits.push('port-security max ' + i.switchport.portSecurity.maximum);
      const link = model.l2Links.find(l => (l.a.dev === d && l.a.ifc === i) || (l.b.dev === d && l.b.ifc === i));
      if (link) { const o = link.a.dev === d ? link.b : link.a; bits.push('connected to ' + o.dev.hostname + ' ' + o.ifc.short); }
      out.push(d.hostname + ' ' + i.short + ': ' + bits.join(', '));
    }
    return out;
  }

  function devicesFor(on, model, focus) {
    const pool = focus && focus.length ? focus : model.devices;
    if (on === 'host') return ['PC/host'];
    let ds = pool;
    if (on === 'router') ds = pool.filter(d => d.type === 'router');
    else if (on === 'switch') ds = pool.filter(d => d.type !== 'router');
    else if (on === 'l3') ds = pool.filter(d => d.type !== 'switch');
    if (!ds.length && pool !== model.devices) return devicesFor(on, model, null);
    return ds.map(d => d.hostname);
  }

  function fillPlaceholders(cmd, ctx) {
    let s = cmd;
    if (ctx.dst) s = s.replace(/<destination(-ip)?>/g, ctx.dst).replace(/<remote-address>/g, ctx.dst).replace(/<remote>/g, ctx.dst);
    if (ctx.gw) s = s.replace(/<default-gateway>|<own-gateway>/g, ctx.gw);
    if (ctx.vlan) s = s.replace(/<vlan>/g, String(ctx.vlan));
    if (ctx.iface) s = s.replace(/<interface>|<port>/g, ctx.iface);
    if (ctx.deviceIp) s = s.replace(/<device-ip>|<switch-ip>/g, ctx.deviceIp);
    return s;
  }

  function assist(analysis, text, opts) {
    opts = opts || {};
    const { model, findings } = analysis;
    const ex = extract(text || '', model.devices);
    if (opts.vlan && !ex.vlans.includes(Number(opts.vlan))) ex.vlans.unshift(Number(opts.vlan));
    const topics = scorePlaybooks(ex);
    const pbs = topics.map(t => t.pb);
    const tags = new Set(pbs.flatMap(p => p.tags));

    // Path analysis
    let path = null;
    if (model.devices.length) {
      const chosen = choosePath(model, ex, opts);
      if (chosen) {
        const svc = opts.service || ex.service || { proto: 'icmp', label: 'ping (ICMP echo)' };
        const conv = T.conversation(model, chosen.src, chosen.dst, svc);
        path = { ...chosen, service: svc, ...conv };
      }
    }
    const pathDevs = path ? [...new Set([...path.fwd.hops, ...(path.ret ? path.ret.hops : [])].map(h => h.dev))] : [];

    // Score findings
    const scored = [];
    for (const f of findings) {
      let s = 0;
      const why = [];
      const overlap = f.tags.filter(t => tags.has(t));
      if (overlap.length) { s += Math.min(6, overlap.length * 2); why.push('matches the problem type'); }
      if (f.vlans && ex.vlans.some(v => f.vlans.includes(v))) { s += 6; why.push('involves the VLAN you mentioned'); }
      if (f.ips && ex.ips.some(x => f.ips.includes(x.ip))) { s += 6; why.push('involves the IP address you mentioned'); }
      if (f.iface && ex.ifaces.includes(f.iface)) { s += 4; why.push('on the interface you mentioned'); }
      if (ex.devs.length && f.devices.some(d => ex.devs.includes(d))) { s += 3; why.push('on a device you mentioned'); }
      if (path) {
        const iss = [path.fwd, path.ret].filter(Boolean);
        if (f.devices.some(d => pathDevs.includes(d))) s += 1;
        for (const r of iss) {
          if (r.acl && f.dev === r.acl.dev && f.cat === 'ACL' && f.title.includes('"' + r.acl.name + '"')) { s += 8; why.push('this ACL drops the traffic in the path analysis'); }
          if (r.noRoute && f.devices.includes(r.noRoute) && f.cat === 'Routing') { s += 4; why.push('the path analysis stops on this router'); }
          if (r.missingSpecific && f.cat === 'Routing' && f.devices.some(d => d === r.missingSpecific.dev || d === r.missingSpecific.dstDev)) { s += 5; why.push('explains the missing route between ' + r.missingSpecific.dev.hostname + ' and ' + r.missingSpecific.dstDev.hostname); }
          if (r.serviceIssue && f.sev !== 'info' && f.devices.includes(r.endDev) && f.tags.some(t => ['ssh', 'telnet', 'vty', 'login', 'remote access'].includes(t))) { s += 5; why.push('explains why the login is refused'); }
          if (r.status !== 'delivered' && r.hops.length && f.devices.includes(r.hops[r.hops.length - 1].dev) && f.tags.some(t => ['gateway', 'routing', 'missing route'].includes(t))) { s += 3; why.push('on the device where the path breaks'); }
          for (const h of r.hops) if (h.l2 && h.l2.length && f.devices.includes(h.dev) && f.cat === 'Switching / VLANs') s += 2;
          if (r.hops.some(h => h.nat && /no NAT rule/.test(h.nat)) && f.cat === 'NAT') { s += 6; why.push('the path analysis shows the traffic is not translated'); }
        }
        const srcGw = T.gatewayFor(model, path.src).gw;
        if (srcGw && f.iface === srcGw.ifc.name && f.dev === srcGw.dev) { s += 4; why.push('on the gateway of the source'); }
        if (f.ips && f.ips.some(ip => (srcGw && N.inSubnet(ip, srcGw.ip, srcGw.mask)))) s += 2;
      }
      if (ex.vlans.length && f.vlans && !f.vlans.some(v => ex.vlans.includes(v)) && !overlap.length) s -= 2;
      if (s <= 1) continue;
      s += f.sev === 'critical' ? 2 : f.sev === 'warning' ? 1 : -3;
      scored.push({ f, score: s, why: [...new Set(why)] });
    }
    scored.sort((a, b) => b.score - a.score);
    const topScore = scored.length ? scored[0].score : 0;
    const relevant = scored.filter(x => x.score >= Math.max(3, topScore * 0.35)).slice(0, 10);

    // Insights about mentioned entities
    const insights = [];
    for (const v of ex.vlans) insights.push({ title: 'VLAN ' + v, lines: describeVlan(model, v) });
    for (const x of ex.ips) insights.push({ title: x.ip, lines: [describeIp(model, x.ip)] });
    for (const n of ex.ifaces) { const l = describeIface(model, ex, n); if (l.length) insights.push({ title: N.shortIfName(n), lines: l }); }
    for (const d of ex.devs) {
      const mgmt = T.l3Addresses(d, false).map(a => a.ifc.short + ' ' + a.ip).slice(0, 4);
      const protos = [d.ospf.length && 'OSPF', d.eigrp.length && 'EIGRP', d.rip && 'RIP', d.bgp && 'BGP', d.staticRoutes.length && d.staticRoutes.length + ' static route(s)'].filter(Boolean);
      insights.push({ title: d.hostname, lines: [d.hostname + ' is a ' + (d.type === 'l3switch' ? 'layer-3 switch' : d.type === 'switch' ? 'layer-2 switch' : 'router') + '. Addresses: ' + (mgmt.join(', ') || 'none') + '. Routing: ' + (protos.join(', ') || 'none') + '.' + (d.type === 'switch' ? ' Default gateway: ' + (d.defaultGateway ? d.defaultGateway.ip : 'NOT SET') + '.' : '')] });
    }

    // Causes, with confirmation from findings
    const causes = [];
    const seenCause = new Set();
    for (const pb of pbs) for (const c of pb.causes) {
      if (seenCause.has(c.text)) continue;
      seenCause.add(c.text);
      const hits = relevant.filter(r => r.f.tags.some(t => c.tags.includes(t))).map(r => r.f);
      causes.push({ text: c.text, findings: hits.slice(0, 3) });
    }
    causes.sort((a, b) => (b.findings.length ? 1 : 0) - (a.findings.length ? 1 : 0));

    // Context for placeholders
    const ctx = { vlan: ex.vlans[0], iface: ex.ifaces[0] ? N.shortIfName(ex.ifaces[0]) : null };
    if (path) {
      ctx.dst = path.dst;
      const g = T.gatewayFor(model, path.src).gw;
      if (g) ctx.gw = g.ip;
    } else if (ex.ips[0]) ctx.dst = ex.ips[0].ip;
    if (!ctx.gw && ex.vlans.length) { const g = vlanGateways(model, ex.vlans[0])[0]; if (g) ctx.gw = g.ip; }
    if (ex.devs[0]) { const a = T.l3Addresses(ex.devs[0], false)[0]; if (a) ctx.deviceIp = a.ip; }
    const focus = [...new Set([...ex.devs, ...pathDevs, ...relevant.slice(0, 5).flatMap(r => r.f.devices)])];
    const steps = (key) => {
      const out = [];
      const seen = new Set();
      for (const pb of pbs) for (const st of pb[key]) {
        const cmd = fillPlaceholders(st.cmd, ctx);
        if (seen.has(cmd)) continue;
        seen.add(cmd);
        out.push({ cmd, on: devicesFor(st.on, model, focus), why: st.why, expect: st.expect, topic: pb.title });
      }
      return out;
    };
    const diagnose = steps('diagnose');
    const verify = steps('verify');
    // Add the specific verification commands of the top findings
    const specific = [];
    for (const r of relevant.filter(r => r.f.sev !== 'info').slice(0, 5)) for (const v of r.f.verify.slice(0, 2)) specific.push({ cmd: v, on: [r.f.device], expect: 'after fixing: ' + r.f.title, specific: true });

    const questions = [...new Set(pbs.flatMap(p => p.questions))];
    return { ex, topics, path, relevant, insights, causes, diagnose, verify: [...specific, ...verify], questions, ctx };
  }

  CCA.assistant = { assist, extract, vlanGateways };
  if (typeof module !== 'undefined' && module.exports) module.exports = CCA;
})(typeof window !== 'undefined' ? window : globalThis);
