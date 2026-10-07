// Builds a network model from all loaded devices: links, routing protocol adjacencies,
// estimated routing tables, ACL evaluation and hop-by-hop path tracing.
(function (root) {
  const CCA = root.CCA = root.CCA || {};
  const N = CCA.net;

  function classfulMask(ip) {
    const a = N.ipToInt(ip) >>> 24;
    if (a < 128) return '255.0.0.0';
    if (a < 192) return '255.255.0.0';
    return '255.255.255.0';
  }

  function ifUp(dev, ifc) {
    if (!ifc || ifc.shutdown) return false;
    if (ifc.name.includes('.')) {
      const parent = dev.interfaces[ifc.name.split('.')[0]];
      if (parent && parent.shutdown) return false;
    }
    return true;
  }

  // Layer-3 addresses that actually route traffic (switchports and admin-down interfaces excluded).
  function l3Addresses(dev, includeDown) {
    const out = [];
    for (const name of dev.interfaceOrder) {
      const ifc = dev.interfaces[name];
      if (ifc.isL2) continue;
      if (!includeDown && !ifUp(dev, ifc)) continue;
      for (const a of ifc.ipv4) {
        if (N.maskToPrefix(a.mask) < 0) continue;
        out.push({ dev, ifc, ip: a.ip, mask: a.mask, secondary: a.secondary, net: N.network(a.ip, a.mask), prefix: N.maskToPrefix(a.mask) });
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- links
  function buildSegments(devices) {
    const all = [];
    for (const d of devices) all.push(...l3Addresses(d, true));
    const segments = {};
    for (const a of all) {
      const key = a.net + '/' + a.prefix;
      (segments[key] = segments[key] || { key, net: a.net, mask: a.mask, prefix: a.prefix, members: [] }).members.push(a);
    }
    // Pairs that look like the same link but use different masks.
    const maskMismatches = [];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j];
        if (a.dev === b.dev || a.mask === b.mask) continue;
        if (N.inSubnet(a.ip, b.ip, b.mask) || N.inSubnet(b.ip, a.ip, a.mask)) {
          // Avoid flagging a /32 loopback that happens to sit inside a bigger LAN range.
          if (a.prefix === 32 || b.prefix === 32) continue;
          maskMismatches.push([a, b]);
        }
      }
    }
    return { all, segments: Object.values(segments), maskMismatches };
  }

  // Layer-2 links inferred from interface descriptions ("Link to SW2 Gi0/1").
  function buildL2Links(devices) {
    const links = [];
    const seen = new Set();
    const byName = {};
    for (const d of devices) byName[d.hostname.toLowerCase()] = d;
    const mentions = (desc, host) => new RegExp('(^|[^A-Za-z0-9_-])' + host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^A-Za-z0-9_-])', 'i').test(desc);
    for (const a of devices) {
      for (const name of a.interfaceOrder) {
        const ia = a.interfaces[name];
        if (!ia.description || name.includes('.') || /^(Vlan|Loopback|Tunnel|Null)/.test(name)) continue;
        for (const b of devices) {
          if (b === a || !mentions(ia.description, b.hostname)) continue;
          let ib = null;
          // 1) description names the remote port
          const after = ia.description.slice(ia.description.toLowerCase().indexOf(b.hostname.toLowerCase()) + b.hostname.length);
          for (const n of N.findIfNames(after)) if (b.interfaces[n]) { ib = b.interfaces[n]; break; }
          // 2) remote has exactly one port whose description names us
          if (!ib) {
            const back = b.interfaceOrder.map(n => b.interfaces[n]).filter(x => x.description && !x.name.includes('.') && mentions(x.description, a.hostname));
            const exact = back.filter(x => N.findIfNames(x.description).includes(ia.name));
            if (exact.length === 1) ib = exact[0];
            else if (back.length === 1) ib = back[0];
          }
          if (!ib) continue;
          const key = [a.id + ia.name, b.id + ib.name].sort().join('|');
          if (seen.has(key)) continue;
          seen.add(key);
          links.push({ a: { dev: a, ifc: ia }, b: { dev: b, ifc: ib }, source: 'description' });
        }
      }
    }
    return links;
  }

  // ------------------------------------------------- routing protocol model
  const DEFAULT_COST = name => /^(Loopback)/.test(name) ? 1 : /^Serial/.test(name) ? 64 : /^Ethernet/.test(name) ? 10 : 1;

  function ospfFor(dev, ifc, addr) {
    if (ifc.ospf.area) {
      const proc = dev.ospf.find(o => o.pid === ifc.ospf.area.pid) || { pid: ifc.ospf.area.pid, passive: [], noPassive: [], passiveDefault: false };
      return { proc, area: ifc.ospf.area.area, via: 'interface' };
    }
    for (const proc of dev.ospf) {
      for (const n of proc.networks) {
        if (N.isIp(n.addr) && N.isIp(n.wild) && N.wildcardMatch(addr.ip, n.addr, n.wild)) return { proc, area: n.area, via: 'network', stmt: n };
      }
    }
    return null;
  }

  function eigrpFor(dev, addr) {
    for (const proc of dev.eigrp) {
      for (const n of proc.networks) {
        const wild = n.wild || N.intToIp(~N.ipToInt(classfulMask(n.addr)) >>> 0);
        if (N.isIp(n.addr) && N.isIp(wild) && N.wildcardMatch(addr.ip, n.addr, wild)) return { proc, stmt: n };
      }
    }
    return null;
  }

  function ripFor(dev, addr) {
    if (!dev.rip) return null;
    for (const n of dev.rip.networks) {
      if (N.isIp(n.addr) && N.inSubnet(addr.ip, n.addr, classfulMask(n.addr))) return { proc: dev.rip, stmt: n };
    }
    return null;
  }

  function isPassive(proc, ifName) {
    if (!proc) return false;
    return proc.passiveDefault ? !(proc.noPassive || []).includes(ifName) : (proc.passive || []).includes(ifName);
  }

  function ospfTimers(ifc) {
    const type = ifc.ospf.networkType || (/^Serial/.test(ifc.name) && ifc.encapsulation && /frame/.test(ifc.encapsulation.type) ? 'non-broadcast' : (/^Serial/.test(ifc.name) ? 'point-to-point' : (/^Loopback/.test(ifc.name) ? 'loopback' : 'broadcast')));
    const defHello = (type === 'non-broadcast' || type === 'point-to-multipoint') ? 30 : 10;
    const hello = ifc.ospf.hello || defHello;
    const dead = ifc.ospf.dead || (ifc.ospf.hello ? hello * 4 : defHello * 4);
    return { type, hello, dead };
  }

  function ospfAuth(proc, area, ifc) {
    if (ifc.ospf.auth === 'null') return 'none';
    if (ifc.ospf.auth) return ifc.ospf.auth === 'message-digest' ? 'md5' : (ifc.ospf.auth === 'key-chain' ? 'key-chain' : 'simple');
    const a = proc && proc.areaAuth && proc.areaAuth[area];
    return a ? (a === 'message-digest' ? 'md5' : 'simple') : 'none';
  }

  // Computes enabled interfaces, adjacencies and problems for one protocol.
  function protocolModel(devices, segments) {
    const ospfIfs = [], eigrpIfs = [], ripIfs = [];
    for (const d of devices) {
      for (const a of l3Addresses(d, false)) {
        if (a.secondary) continue;
        const o = d.ospf.length || a.ifc.ospf.area ? ospfFor(d, a.ifc, a) : null;
        if (o) {
          const t = ospfTimers(a.ifc);
          ospfIfs.push({ ...a, proc: o.proc, area: o.area, passive: isPassive(o.proc, a.ifc.name) || t.type === 'loopback', timers: t,
            auth: ospfAuth(o.proc, o.area, a.ifc), mtu: a.ifc.ipMtu || a.ifc.mtu || 1500, cost: a.ifc.ospf.cost || DEFAULT_COST(a.ifc.name), stmt: o.stmt });
        }
        const e = eigrpFor(d, a);
        if (e) eigrpIfs.push({ ...a, proc: e.proc, passive: isPassive(e.proc, a.ifc.name) || /^Loopback/.test(a.ifc.name), asn: e.proc.asn,
          k: e.proc.kValues || '0 1 0 1 0 0', auth: a.ifc.eigrp.auth || 'none', hello: a.ifc.eigrp.hello || 5, cost: /^Serial/.test(a.ifc.name) ? 20 : 1 });
        const r = ripFor(d, a);
        if (r) ripIfs.push({ ...a, proc: r.proc, passive: isPassive(r.proc, a.ifc.name) || /^Loopback/.test(a.ifc.name), version: r.proc.version, cost: 1 });
      }
    }
    const segKey = a => a.net + '/' + a.prefix;
    function adjacencies(list, compare) {
      const adj = [], issues = [];
      const bySeg = {};
      for (const x of list) (bySeg[segKey(x)] = bySeg[segKey(x)] || []).push(x);
      for (const key of Object.keys(bySeg)) {
        const xs = bySeg[key];
        for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) {
          const a = xs[i], b = xs[j];
          if (a.dev === b.dev) continue;
          const problems = compare(a, b);
          if (problems.length) issues.push({ a, b, problems });
          else adj.push({ a, b });
        }
      }
      return { adj, issues };
    }
    const ospf = adjacencies(ospfIfs, (a, b) => {
      const p = [];
      if (a.passive || b.passive) p.push({ kind: 'passive', text: 'passive-interface on ' + (a.passive ? a.dev.hostname + ' ' + a.ifc.short : b.dev.hostname + ' ' + b.ifc.short) });
      if (a.area !== b.area) p.push({ kind: 'area', text: 'area mismatch (' + a.dev.hostname + ': area ' + areaName(a.area) + ', ' + b.dev.hostname + ': area ' + areaName(b.area) + ')' });
      if (a.timers.hello !== b.timers.hello || a.timers.dead !== b.timers.dead) p.push({ kind: 'timers', text: 'hello/dead mismatch (' + a.timers.hello + '/' + a.timers.dead + ' vs ' + b.timers.hello + '/' + b.timers.dead + ')' });
      if (a.auth !== b.auth) p.push({ kind: 'auth', text: 'authentication mismatch (' + a.auth + ' vs ' + b.auth + ')' });
      else if (a.auth === 'md5' && a.ifc.ospf.md5 && b.ifc.ospf.md5 && (a.ifc.ospf.md5.key !== b.ifc.ospf.md5.key || a.ifc.ospf.md5.secret !== b.ifc.ospf.md5.secret)) p.push({ kind: 'auth', text: 'MD5 key ID or key string differs' });
      else if (a.auth === 'simple' && a.ifc.ospf.authKey && b.ifc.ospf.authKey && a.ifc.ospf.authKey !== b.ifc.ospf.authKey) p.push({ kind: 'auth', text: 'authentication key differs' });
      if (a.mtu !== b.mtu) p.push({ kind: 'mtu', text: 'MTU mismatch (' + a.mtu + ' vs ' + b.mtu + ') – neighbors get stuck in EXSTART/EXCHANGE' });
      const rid = x => x.proc.routerId;
      if (rid(a) && rid(b) && rid(a) === rid(b)) p.push({ kind: 'rid', text: 'duplicate router-id ' + rid(a) });
      return p;
    });
    // Network-type mismatch still forms (broadcast vs p2p) but breaks routes; keep it as a soft issue.
    ospf.soft = ospf.adj.filter(x => x.a.timers.type !== x.b.timers.type).map(x => ({ a: x.a, b: x.b, problems: [{ kind: 'nettype', text: 'OSPF network type mismatch (' + x.a.timers.type + ' vs ' + x.b.timers.type + ')' }] }));
    const eigrp = adjacencies(eigrpIfs, (a, b) => {
      const p = [];
      if (a.passive || b.passive) p.push({ kind: 'passive', text: 'passive-interface on ' + (a.passive ? a.dev.hostname + ' ' + a.ifc.short : b.dev.hostname + ' ' + b.ifc.short) });
      if (a.asn !== b.asn) p.push({ kind: 'asn', text: 'autonomous system mismatch (' + a.asn + ' vs ' + b.asn + ')' });
      if (a.k !== b.k) p.push({ kind: 'k', text: 'K-value mismatch (' + a.k + ' vs ' + b.k + ')' });
      if (a.auth !== b.auth) p.push({ kind: 'auth', text: 'authentication mismatch (' + a.auth + ' vs ' + b.auth + ')' });
      return p;
    });
    const rip = adjacencies(ripIfs, (a, b) => {
      const p = [];
      if (a.passive || b.passive) p.push({ kind: 'passive', text: 'passive-interface on ' + (a.passive ? a.dev.hostname + ' ' + a.ifc.short : b.dev.hostname + ' ' + b.ifc.short) + ' (it still receives, but does not send updates)' });
      if (a.proc.versionSet !== b.proc.versionSet || a.version !== b.version) p.push({ kind: 'version', text: 'RIP version mismatch (' + (a.proc.versionSet ? 'v' + a.version : 'default v1') + ' vs ' + (b.proc.versionSet ? 'v' + b.version : 'default v1') + ')' });
      return p;
    });
    // Segments where only one side runs the protocol.
    function oneSided(list, protoName) {
      const out = [];
      const enabled = new Set(list.map(x => x.dev.id + '|' + x.ifc.name));
      const runs = new Set(list.map(x => x.dev.id));
      for (const seg of segments) {
        const routers = seg.members.filter(m => !m.secondary && ifUp(m.dev, m.ifc) && m.dev.ipRouting !== false && (m.dev.type !== 'switch'));
        const on = routers.filter(m => enabled.has(m.dev.id + '|' + m.ifc.name));
        const off = routers.filter(m => !enabled.has(m.dev.id + '|' + m.ifc.name) && runs.has(m.dev.id));
        if (on.length && off.length) out.push({ seg, on, off, proto: protoName });
      }
      return out;
    }
    return {
      ospf: { ifs: ospfIfs, ...ospf, oneSided: oneSided(ospfIfs, 'OSPF') },
      eigrp: { ifs: eigrpIfs, ...eigrp, oneSided: oneSided(eigrpIfs, 'EIGRP') },
      rip: { ifs: ripIfs, ...rip, oneSided: oneSided(ripIfs, 'RIP') }
    };
  }

  function areaName(a) { return a; }

  // --------------------------------------------------------------- RIB
  function routeKey(r) { return r.net + '/' + r.prefix; }

  function buildRibs(devices, model) {
    const ribs = {};
    for (const d of devices) ribs[d.id] = [];
    const add = (d, r) => ribs[d.id].push(r);
    // Connected
    for (const d of devices) {
      for (const a of l3Addresses(d, false)) {
        add(d, { code: 'C', ad: 0, net: a.net, mask: a.mask, prefix: a.prefix, iface: a.ifc.name, nextHop: null, dev: d });
      }
    }
    const connectedHas = (d, ip) => ribs[d.id].some(r => r.code === 'C' && N.inSubnet(ip, r.net, r.mask));
    // Static
    for (const d of devices) {
      for (const s of d.staticRoutes) {
        if (s.vrf) continue;
        if (!N.isIp(s.prefix) || N.maskToPrefix(s.mask) < 0) continue;
        let ok = false, iface = s.iface;
        if (s.iface === 'Null0') ok = true;
        else if (s.iface) ok = ifUp(d, d.interfaces[s.iface]);
        else if (s.nextHop) ok = connectedHas(d, s.nextHop) && !l3Addresses(d, false).some(a => a.ip === s.nextHop);
        if (s.nextHop && !s.iface) {
          const c = ribs[d.id].find(r => r.code === 'C' && N.inSubnet(s.nextHop, r.net, r.mask));
          iface = c ? c.iface : null;
          if (!c && !l3Addresses(d, false).some(a => a.ip === s.nextHop)) ok = 'recursive';
        }
        add(d, { code: s.prefix === '0.0.0.0' && s.mask === '0.0.0.0' ? 'S*' : 'S', ad: s.ad, net: N.network(s.prefix, s.mask), mask: s.mask,
          prefix: N.maskToPrefix(s.mask), iface, nextHop: s.nextHop, dev: d, static: s, valid: ok });
      }
    }
    // Resolve recursive statics once (next hop reachable through another route).
    for (const d of devices) {
      for (const r of ribs[d.id]) {
        if (r.valid !== 'recursive') continue;
        const via = lookupIn(ribs[d.id].filter(x => x !== r && x.valid !== false && x.valid !== 'recursive'), r.nextHop);
        r.valid = !!via;
        if (via) r.iface = via.iface;
      }
    }
    for (const d of devices) ribs[d.id] = ribs[d.id].filter(r => r.valid !== false);

    // Dynamic protocols: Dijkstra over the adjacency graph, advertise enabled networks.
    function runProto(code, ad, pm, advertised) {
      const graph = {};
      const devById = {};
      for (const x of pm.ifs) { graph[x.dev.id] = graph[x.dev.id] || []; devById[x.dev.id] = x.dev; }
      for (const { a, b } of pm.adj) {
        graph[a.dev.id].push({ to: b.dev.id, out: a, nbr: b, cost: a.cost });
        graph[b.dev.id].push({ to: a.dev.id, out: b, nbr: a, cost: b.cost });
      }
      for (const src of Object.keys(graph)) {
        const dist = { [src]: 0 }, first = {};
        const q = [src];
        const done = new Set();
        while (q.length) {
          q.sort((x, y) => dist[x] - dist[y]);
          const u = q.shift();
          if (done.has(u)) continue;
          done.add(u);
          for (const e of graph[u]) {
            const nd = dist[u] + e.cost;
            if (dist[e.to] === undefined || nd < dist[e.to]) {
              dist[e.to] = nd;
              first[e.to] = u === src ? e : first[u];
              q.push(e.to);
            }
          }
        }
        const me = devById[src];
        for (const dst of Object.keys(dist)) {
          if (dst === src) continue;
          const hop = first[dst];
          for (const p of advertised(devById[dst])) {
            if (ribs[src].some(r => r.code === 'C' && r.net === p.net && r.prefix === p.prefix)) continue;
            ribs[src].push({ code: p.def ? code + '*' : code, ad, net: p.net, mask: p.mask, prefix: p.prefix, iface: hop.out.ifc.name, nextHop: hop.nbr.ip,
              dev: me, origin: devById[dst].hostname, metric: dist[dst] });
          }
        }
      }
    }
    const advFrom = (pm, protoKey) => d => {
      const own = pm.ifs.filter(x => x.dev === d);
      const out = own.map(x => (x.ifc.name.startsWith('Loopback') && protoKey === 'ospf' && x.timers.type === 'loopback')
        ? { net: x.ip, mask: '255.255.255.255', prefix: 32 } : { net: x.net, mask: x.mask, prefix: x.prefix });
      const procs = protoKey === 'ospf' ? d.ospf : protoKey === 'eigrp' ? d.eigrp : (d.rip ? [d.rip] : []);
      const hasDefault = ribs[d.id].some(r => r.code === 'S*');
      for (const p of procs) {
        for (const r of p.redistribute || []) {
          if (r.proto === 'static') for (const s of ribs[d.id].filter(x => x.code === 'S')) out.push({ net: s.net, mask: s.mask, prefix: s.prefix });
          if (r.proto === 'connected') for (const s of ribs[d.id].filter(x => x.code === 'C')) out.push({ net: s.net, mask: s.mask, prefix: s.prefix });
        }
        const dio = protoKey === 'ospf' ? p.defaultOriginate : (protoKey === 'rip' ? p.defaultOriginate : null);
        if ((dio && (dio === true || dio.always || hasDefault)) || ((p.redistribute || []).some(r => r.proto === 'static') && hasDefault && protoKey !== 'ospf')) {
          out.push({ net: '0.0.0.0', mask: '0.0.0.0', prefix: 0, def: true });
        }
      }
      return out;
    };
    runProto('O', 110, model.ospf, advFrom(model.ospf, 'ospf'));
    runProto('D', 90, model.eigrp, advFrom(model.eigrp, 'eigrp'));
    runProto('R', 120, model.rip, advFrom(model.rip, 'rip'));

    // Keep only best AD per prefix.
    for (const d of devices) {
      const best = {};
      for (const r of ribs[d.id]) {
        const k = routeKey(r);
        if (!best[k] || r.ad < best[k][0].ad) best[k] = [r];
        else if (r.ad === best[k][0].ad && r.code === best[k][0].code && !best[k].some(x => x.nextHop === r.nextHop && x.iface === r.iface)) best[k].push(r);
      }
      ribs[d.id] = Object.values(best).flat().sort((x, y) => N.ipToInt(x.net) - N.ipToInt(y.net) || x.prefix - y.prefix);
    }
    return ribs;
  }

  function lookupIn(rib, ip) {
    let best = null;
    for (const r of rib) {
      if (N.inSubnet(ip, r.net, r.mask) && (!best || r.prefix > best.prefix || (r.prefix === best.prefix && r.ad < best.ad))) best = r;
    }
    return best;
  }

  // ----------------------------------------------------------------- ACLs
  const PROTO_NUM = { 1: 'icmp', 6: 'tcp', 17: 'udp', 47: 'gre', 50: 'esp', 51: 'ahp', 88: 'eigrp', 89: 'ospf', 103: 'pim', 112: 'vrrp' };
  const ICMP_TYPES = ['echo', 'echo-reply', 'unreachable', 'ttl-exceeded', 'time-exceeded', 'traceroute', 'packet-too-big', 'redirect', 'host-unreachable', 'port-unreachable'];

  function addrMatch(spec, ip) {
    if (!spec) return { ok: false, uncertain: true };
    if (spec.any) return { ok: true };
    if (spec.objectGroup || spec.unknown) return { ok: false, uncertain: true };
    return { ok: N.wildcardMatch(ip, spec.addr, spec.wild) };
  }

  function portMatch(spec, port) {
    if (!spec) return true;
    if (port === undefined || port === null) return false;
    const [a, b] = spec.ports;
    switch (spec.op) {
      case 'eq': return spec.ports.includes(port);
      case 'neq': return port !== a;
      case 'gt': return port > a;
      case 'lt': return port < a;
      case 'range': return port >= a && port <= b;
    }
    return false;
  }

  // pkt: { src, dst, proto: 'icmp'|'tcp'|'udp'|'ospf'|..., srcPort, dstPort, icmpType, established }
  function evaluateAcl(acl, pkt) {
    if (!acl) return { action: 'permit', undefinedAcl: true };
    let uncertain = false;
    for (const e of acl.entries) {
      if (e.remark) continue;
      let proto = e.proto;
      if (/^\d+$/.test(proto)) proto = PROTO_NUM[proto] || proto;
      if (proto !== 'ip' && proto !== pkt.proto) continue;
      const s = addrMatch(e.src, pkt.src);
      if (s.uncertain) uncertain = true;
      if (!s.ok) continue;
      if (acl.type === 'extended') {
        const d = addrMatch(e.dst, pkt.dst);
        if (d.uncertain) uncertain = true;
        if (!d.ok) continue;
        if ((proto === 'tcp' || proto === 'udp')) {
          if (!portMatch(e.srcPort, pkt.srcPort)) continue;
          if (!portMatch(e.dstPort, pkt.dstPort)) continue;
          if (proto === 'tcp' && (e.extra || []).includes('established') && !pkt.established) continue;
        }
        if (proto === 'icmp') {
          const t = (e.extra || []).find(x => ICMP_TYPES.includes(x));
          if (t && pkt.icmpType && t !== pkt.icmpType && !(t === 'time-exceeded' && pkt.icmpType === 'ttl-exceeded')) continue;
        }
      }
      return { action: e.action, entry: e, uncertain };
    }
    return { action: 'deny', implicit: true, uncertain };
  }

  // ------------------------------------------------------------- the model
  function build(devices) {
    devices.forEach((d, i) => { d.id = d.id || 'd' + (i + 1); });
    const seg = buildSegments(devices);
    const l2 = buildL2Links(devices);
    const protocols = protocolModel(devices, seg.segments);
    const ribs = buildRibs(devices, protocols);
    const model = { devices, ...seg, l2Links: l2, protocols, ribs };
    model.ownerOf = ip => seg.all.find(a => a.ip === ip) || null;
    model.devById = id => devices.find(d => d.id === id);
    return model;
  }


  // Layer-2 problems between a routed VLAN interface (subinterface/SVI) and the hosts in that VLAN.
  function vlanIssues(model, dev, ifc) {
    const out = [];
    if (!ifc) return out;
    let vlan = null, parentName = null;
    if (ifc.encapsulation && ifc.encapsulation.type === 'dot1q') { vlan = ifc.encapsulation.vlan; parentName = ifc.name.split('.')[0]; }
    else if (/^Vlan(\d+)$/.test(ifc.name)) vlan = Number(ifc.name.slice(4));
    if (vlan === null) return out;
    const native = ifc.encapsulation && ifc.encapsulation.native;
    if (parentName) {
      for (const l of model.l2Links) {
        const [me, other] = l.a.dev === dev && l.a.ifc.name === parentName ? [l.a, l.b] : (l.b.dev === dev && l.b.ifc.name === parentName ? [l.b, l.a] : [null, null]);
        if (!me) continue;
        const sp = other.ifc;
        const where = other.dev.hostname + ' ' + sp.short;
        if (sp.shutdown) out.push(where + ' (towards ' + dev.hostname + ' ' + me.ifc.short + ') is administratively shut down.');
        if (sp.isL2 && sp.mode === 'trunk') {
          if (sp.switchport.trunkAllowed && !sp.switchport.trunkAllowed.has(vlan)) out.push('VLAN ' + vlan + ' is not allowed on the trunk ' + where + ' (allowed: ' + sp.switchport.trunkAllowedRaw + ').');
          const swNative = sp.switchport.nativeVlan || 1;
          if (native && swNative !== vlan) out.push(dev.hostname + ' ' + ifc.short + ' uses VLAN ' + vlan + ' as native (untagged) but ' + where + ' has native VLAN ' + swNative + '.');
          if (!native && swNative === vlan) out.push('VLAN ' + vlan + ' is the native VLAN on ' + where + ' (sent untagged) but ' + dev.hostname + ' ' + ifc.short + ' expects it tagged – add "native" to the encapsulation or change the native VLAN.');
        } else if (sp.isL2) {
          out.push(where + ' is not a trunk (mode ' + sp.mode + '), so tagged VLAN ' + vlan + ' frames from ' + dev.hostname + ' are dropped.');
        }
        const sw = other.dev;
        if (sw.vlanStatements && !sw.vlans[vlan]) out.push('VLAN ' + vlan + ' does not exist in the VLAN database of ' + sw.hostname + '.');
      }
    }
    return out;
  }

  // Finds the first-hop gateway for a host address.
  function gatewayFor(model, ip) {
    const cands = model.all.filter(a => ifUp(a.dev, a.ifc) && N.inSubnet(ip, a.ip, a.mask) && a.ip !== ip);
    if (!cands.length) return { gw: null, cands };
    // Prefer an address handed out as default-router by any DHCP pool for that subnet.
    for (const d of model.devices) for (const p of Object.values(d.dhcpPools)) {
      if (p.network && p.mask && N.inSubnet(ip, p.network, p.mask)) {
        const hit = cands.find(c => p.defaultRouter.includes(c.ip));
        if (hit) return { gw: hit, cands, why: 'DHCP pool ' + p.name + ' hands out ' + hit.ip + ' as default gateway' };
        const vip = p.defaultRouter[0];
        if (vip) {
          const hsrp = cands.filter(c => Object.values(c.ifc.standby).some(s => s.ip === vip));
          if (hsrp.length) {
            hsrp.sort((x, y) => Math.max(...Object.values(y.ifc.standby).map(s => s.priority)) - Math.max(...Object.values(x.ifc.standby).map(s => s.priority)));
            return { gw: hsrp[0], cands, why: 'HSRP active router (highest priority) for virtual IP ' + vip };
          }
        }
      }
    }
    const routing = cands.filter(c => c.dev.ipRouting);
    return { gw: routing[0] || cands[0], cands, why: routing.length ? 'the routed interface in that subnet' : 'the only device with an address in that subnet' };
  }

  function natTranslate(dev, inIfc, outIfc, pkt) {
    if (!inIfc || !outIfc || inIfc.nat !== 'inside' || outIfc.nat !== 'outside') return null;
    for (const r of dev.nat.rules) {
      if (r.type === 'static' && r.local === pkt.src) return { to: r.global, rule: r };
      if (r.type === 'list') {
        const res = evaluateAcl(dev.acls[r.list], { ...pkt, dst: pkt.dst });
        if (dev.acls[r.list] && res.action === 'permit') {
          let to = null;
          if (r.iface && dev.interfaces[r.iface] && dev.interfaces[r.iface].ipv4[0]) to = dev.interfaces[r.iface].ipv4[0].ip;
          if (r.pool && dev.nat.pools[r.pool]) to = dev.nat.pools[r.pool].start;
          return { to, rule: r };
        }
      }
    }
    return { to: null, rule: null, miss: true };
  }

  // Simulates one direction. Returns { hops, status, reason }.
  function trace(model, src, dst, opts) {
    opts = opts || {};
    const pkt = { src, dst, proto: opts.proto || 'icmp', dstPort: opts.dstPort, srcPort: opts.srcPort, icmpType: opts.icmpType || 'echo', established: !!opts.established };
    const hops = [];
    let dev, inIfc = null, local = false;
    const owner = model.ownerOf(src);
    if (owner && ifUp(owner.dev, owner.ifc)) { dev = owner.dev; local = true; hops.push({ dev, note: 'Packet sourced from ' + dev.hostname + ' ' + owner.ifc.short + ' (' + src + ')' }); }
    else {
      const g = gatewayFor(model, src);
      if (!g.gw) return { hops, status: 'unknown', reason: 'None of the loaded devices has an interface in the same subnet as ' + src + '. Load the config of its gateway, or check the host\'s IP address/mask.' };
      dev = g.gw.dev; inIfc = g.gw.ifc;
      hops.push({ dev, inIfc, note: 'Host ' + src + ' uses ' + g.gw.ip + ' on ' + dev.hostname + ' ' + inIfc.short + ' as gateway (' + g.why + ')', l2: vlanIssues(model, dev, inIfc) });
      if (!dev.ipRouting) return { hops, status: 'dropped', reason: dev.hostname + ' is a layer-2 switch without "ip routing" – it cannot route between subnets.' };
    }
    const visited = {};
    let missingSpecific = null;
    const done = r => { if (missingSpecific) { r.missingSpecific = missingSpecific; if (r.status !== 'delivered') r.reason += ' Note: ' + missingSpecific.dev.hostname + ' had no specific route to ' + missingSpecific.net + ' (which exists on ' + missingSpecific.dstDev.hostname + ') and followed its default route.'; } return r; };
    for (let step = 0; step < 32; step++) {
      const vk = dev.id + '|' + (inIfc ? inIfc.name : '');
      visited[vk] = (visited[vk] || 0) + 1;
      if (visited[vk] > 1) return done({ hops, status: 'loop', reason: 'Routing loop detected at ' + dev.hostname + '.' });
      const hop = hops[hops.length - 1];
      if (inIfc && inIfc.accessGroup.in) {
        const r = evaluateAcl(dev.acls[inIfc.accessGroup.in.name], pkt);
        hop.aclIn = { name: inIfc.accessGroup.in.name, res: r };
        if (r.action === 'deny') return done({ hops, status: 'dropped', reason: 'Denied by inbound ACL ' + inIfc.accessGroup.in.name + ' on ' + dev.hostname + ' ' + inIfc.short + (r.implicit ? ' (implicit deny at the end)' : ' (line: ' + r.entry.raw + ')') + '.', acl: { dev, name: inIfc.accessGroup.in.name, res: r } });
      }
      // Arrived at the device that owns the destination?
      const mine = l3Addresses(dev, false).find(a => a.ip === pkt.dst);
      if (mine) {
        const res = { hops, status: 'delivered', reason: 'Reached ' + dev.hostname + ' (' + mine.ifc.short + ' ' + pkt.dst + ').', endDev: dev, pkt };
        if (pkt.proto === 'tcp' && (pkt.dstPort === 22 || pkt.dstPort === 23)) {
          const vty = checkVty(dev, pkt);
          if (vty) res.serviceIssue = vty;
          else res.reason += ' The VTY lines accept ' + (pkt.dstPort === 22 ? 'SSH' : 'Telnet') + '.';
        }
        return done(res);
      }
      const rib = dev.ipRouting ? model.ribs[dev.id] : model.ribs[dev.id].filter(r => r.code === 'C');
      let route = lookupIn(rib, pkt.dst);
      if (!route && !dev.ipRouting && dev.defaultGateway) {
        const c = model.ribs[dev.id].find(r => r.code === 'C' && N.inSubnet(dev.defaultGateway.ip, r.net, r.mask));
        if (c) route = { code: 'gw', net: '0.0.0.0', mask: '0.0.0.0', prefix: 0, iface: c.iface, nextHop: dev.defaultGateway.ip };
      }
      if (!route) return done({ hops, status: 'dropped', reason: dev.hostname + ' has no route to ' + pkt.dst + ' (no matching route and no default route).', noRoute: dev });
      hop.route = route;
      if (route.prefix === 0 && !missingSpecific) {
        const real = model.all.find(a => N.inSubnet(pkt.dst, a.ip, a.mask) && a.dev !== dev);
        if (real) {
          missingSpecific = { dev, dstDev: real.dev, net: N.cidr(real.ip, real.mask) };
          hop.warn = dev.hostname + ' has no specific route to ' + missingSpecific.net + ' (connected on ' + real.dev.hostname + ') and uses its default route instead.';
        }
      }
      if (route.iface === 'Null0') return done({ hops, status: 'dropped', reason: dev.hostname + ' routes ' + pkt.dst + ' to Null0 (discarded).' });
      const outIfc = dev.interfaces[route.iface];
      hop.outIfc = outIfc;
      if (outIfc && outIfc.accessGroup.out && !local) {
        const r = evaluateAcl(dev.acls[outIfc.accessGroup.out.name], pkt);
        hop.aclOut = { name: outIfc.accessGroup.out.name, res: r };
        if (r.action === 'deny') return done({ hops, status: 'dropped', reason: 'Denied by outbound ACL ' + outIfc.accessGroup.out.name + ' on ' + dev.hostname + ' ' + outIfc.short + (r.implicit ? ' (implicit deny at the end)' : ' (line: ' + r.entry.raw + ')') + '.', acl: { dev, name: outIfc.accessGroup.out.name, res: r } });
      }
      const nat = natTranslate(dev, inIfc, outIfc, pkt);
      if (nat && nat.to) { hop.nat = 'NAT: source ' + pkt.src + ' → ' + nat.to; pkt.origSrc = pkt.origSrc || pkt.src; pkt.src = nat.to; }
      else if (nat && nat.miss) hop.nat = 'NAT: no NAT rule matches source ' + pkt.src + ' – it leaves untranslated (private addresses will not get replies from the Internet).';
      const nextIp = route.nextHop || pkt.dst;
      const nextOwner = model.all.find(a => a.ip === nextIp && a.dev !== dev && ifUp(a.dev, a.ifc));
      if (!nextOwner) {
        if (!route.nextHop && outIfc) hop.l2 = (hop.l2 || []).concat(vlanIssues(model, dev, outIfc));
        if (!route.nextHop) return done({ hops, status: 'delivered', reason: 'Delivered onto the connected subnet ' + route.net + '/' + route.prefix + ' via ' + dev.hostname + ' ' + (outIfc ? outIfc.short : route.iface) + ' (assuming host ' + pkt.dst + ' exists there and uses a correct gateway).', endDev: dev, endIfc: outIfc, toHost: true, pkt });
        return done({ hops, status: 'exit', reason: dev.hostname + ' forwards to next hop ' + route.nextHop + ' via ' + (outIfc ? outIfc.short : route.iface) + ', which is not among the loaded configs. The trace ends here.', endDev: dev, pkt });
      }
      if (!route.nextHop && outIfc) hop.l2 = (hop.l2 || []).concat(vlanIssues(model, dev, outIfc));
      hops.push({ dev: nextOwner.dev, inIfc: nextOwner.ifc, note: 'via ' + dev.hostname + ' ' + (outIfc ? outIfc.short : route.iface) + ' → ' + nextOwner.dev.hostname + ' ' + nextOwner.ifc.short });
      dev = nextOwner.dev; inIfc = nextOwner.ifc; local = false;
    }
    return { hops, status: 'loop', reason: 'Too many hops – probably a routing loop.' };
  }

  function checkVty(dev, pkt) {
    const vtys = dev.term.vty;
    if (!vtys.length) return null;
    const want = pkt.dstPort === 22 ? 'ssh' : 'telnet';
    const ok = vtys.filter(v => !v.transportInput || v.transportInput.split(/\s+/).some(t => t === want || t === 'all'));
    if (!ok.length) return dev.hostname + ' does not accept ' + want + ' on its VTY lines (transport input ' + vtys[0].transportInput + ').';
    for (const v of ok) {
      if (v.accessClass && v.accessClass.dir === 'in') {
        const r = evaluateAcl(dev.acls[v.accessClass.name], { ...pkt, proto: 'tcp' });
        if (r.action === 'deny') return 'access-class ' + v.accessClass.name + ' on line vty ' + v.from + ' ' + v.to + ' of ' + dev.hostname + ' denies source ' + (pkt.origSrc || pkt.src) + '.';
      }
      if (v.login === 'local' && !dev.users.length && !dev.aaaNewModel) return dev.hostname + ' uses "login local" on VTY but has no username configured – login is impossible.';
      if ((v.login === 'line' || v.login === null) && !v.password && !dev.aaaNewModel) return dev.hostname + ' VTY lines have no password – IOS refuses remote login ("Password required, but none set").';
      if (want === 'ssh' && !dev.domainName) return dev.hostname + ' has no "ip domain-name"; RSA keys (and SSH) are probably not available.';
    }
    return null;
  }

  // Forward and return path for a src→dst conversation.
  function conversation(model, src, dst, opts) {
    opts = opts || {};
    const fwd = trace(model, src, dst, opts);
    let ret = null;
    if (fwd.status === 'delivered') {
      const back = { proto: opts.proto || 'icmp', icmpType: 'echo-reply', established: true, srcPort: opts.dstPort, dstPort: opts.dstPort ? 50000 : undefined };
      const replySrc = dst;
      const replyDst = fwd.pkt && fwd.pkt.src ? fwd.pkt.src : src;
      ret = trace(model, replySrc, replyDst, back);
      if (fwd.pkt && fwd.pkt.origSrc && ret.status === 'delivered') ret.reason += ' NAT on the way back translates it to ' + fwd.pkt.origSrc + '.';
    }
    return { fwd, ret };
  }

  CCA.topology = { build, trace, vlanIssues, conversation, evaluateAcl, lookupIn, l3Addresses, ifUp, classfulMask, gatewayFor, ospfTimers, isPassive, checkVty };
  if (typeof module !== 'undefined' && module.exports) module.exports = CCA;
})(typeof window !== 'undefined' ? window : globalThis);
