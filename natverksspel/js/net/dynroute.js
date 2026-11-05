// Dynamisk routing för kurs 2 (Routing och switching): OSPF (en area-0-process per router) och eBGP.
// Räknas om varje gång simulatorn räknar om nätet (NV.sim.compute) och ger rutter som routingvalet
// jämför med anslutna och statiska efter längsta prefix och sedan administrativt avstånd.
NV.dyn = (function () {
  var U = NV.util;

  var AD = { C: 0, L: 0, S: 1, B: 20, O: 110, 'O*E2': 110, 'O E2': 110 };

  function epsOf(D, dev) {
    var out = [];
    Object.keys(D.eps).forEach(function (k) { if (D.eps[k].dev === dev) out.push(D.eps[k]); });
    return out;
  }
  function isRouter(d) { return d && d.kind === 'router' && d.os === 'ios'; }

  // ------------------------------------------------------------------ OSPF
  // Bandbredd i kbit/s enligt interfacetyp, som IOS standardvärden
  function defaultBw(name) {
    if (/^Serial/.test(name)) return 1544;
    if (/^FastEthernet/.test(name)) return 100000;
    if (/^Loopback/.test(name)) return 8000000;
    return 1000000;
  }
  function bandwidth(d, name) {
    var i = d.config.ifaces[name];
    if (i && i.bandwidth) return i.bandwidth;
    var par = i && i.parent ? d.config.ifaces[i.parent] : null;
    if (par && par.bandwidth) return par.bandwidth;
    return defaultBw(name);
  }
  function ifCost(d, name) {
    var i = d.config.ifaces[name];
    if (i && i.ospfCost) return i.ospfCost;
    var ref = (d.config.ospf && d.config.ospf.refBw) || 100;
    return Math.max(1, Math.floor(ref * 1000 / bandwidth(d, name)));
  }
  function hello(i) { return (i && i.ospfHello) || 10; }
  function dead(i) { return (i && i.ospfDead) || hello(i) * 4; }
  function isPassive(o, name) {
    if (o.passiveDefault) return (o.noPassive || []).indexOf(name) < 0;
    return (o.passive || []).indexOf(name) >= 0;
  }
  // Första network-raden som täcker interfacets adress avgör om det är med och i vilken area
  function matchNetwork(o, ip) {
    var list = o.networks || [];
    for (var k = 0; k < list.length; k++) if (U.wildMatch(ip, list[k].net, list[k].wild)) return list[k];
    return null;
  }
  function routerId(d, D) {
    var o = d.config.ospf;
    if (o && o.routerId) return o.routerId;
    var eps = epsOf(D, d.id).filter(function (e) { return e.up && e.ip; });
    var loops = eps.filter(function (e) { return e.loop; });
    var pool = loops.length ? loops : eps;
    if (!pool.length) return null;
    pool.sort(function (a, b) { return U.ipToInt(b.ip) - U.ipToInt(a.ip); });
    return pool[0].ip;
  }
  function ospfIfaces(state, D, d) {
    var o = d.config.ospf, out = {};
    Object.keys(d.config.ifaces).forEach(function (n) {
      var i = d.config.ifaces[n];
      if (!i.ip || i.internal) return;
      var m = matchNetwork(o, i.ip.addr);
      if (!m) return;
      var ep = D.eps['E:' + d.id + ':' + n];
      out[n] = {
        name: n, area: m.area, passive: isPassive(o, n), cost: ifCost(d, n), hello: hello(i), dead: dead(i),
        ip: i.ip.addr, mask: i.ip.mask, up: !!(ep && ep.up), ep: ep, loop: !!i.loop, serial: /^Serial/.test(n), bw: bandwidth(d, n),
      };
    });
    return out;
  }

  function ospf(state, D, out) {
    var R = {};
    Object.keys(state.devices).forEach(function (id) {
      var d = state.devices[id];
      if (!isRouter(d) || !d.config.ospf) return;
      R[id] = { id: id, d: d, rid: routerId(d, D), ifs: ospfIfaces(state, D, d), nbrs: [], problems: [] };
    });
    // Grannskap: två routrar i samma segment och nät, med samma area, hello och dead, och olika router-id
    var ids = Object.keys(R);
    ids.forEach(function (a) {
      var A = R[a];
      Object.keys(A.ifs).forEach(function (n) {
        var ia = A.ifs[n];
        if (!ia.up || ia.passive || ia.loop) return;
        var seg = D.comp[ia.ep.key];
        (D.bySeg[seg] || []).forEach(function (e) {
          if (e.dev === a || !R[e.dev] || !e.up) return;
          var B = R[e.dev], ib = B.ifs[e.iface];
          if (!ib || !ib.up || ib.passive) return;
          if (!U.sameSubnet(e.ip, ia.ip, ia.mask)) return;
          var why = null;
          if (ia.mask !== ib.mask) why = 'mask';
          else if (ia.area !== ib.area) why = 'area';
          else if (ia.hello !== ib.hello || ia.dead !== ib.dead) why = 'timers';
          else if (A.rid === B.rid) why = 'rid';
          if (why) { A.problems.push({ iface: n, peer: e.dev, peerIp: e.ip, why: why, peerArea: ib.area, peerHello: ib.hello, peerDead: ib.dead }); return; }
          A.nbrs.push({ dev: e.dev, rid: B.rid, ip: e.ip, iface: n, peerIface: e.iface, cost: ia.cost, dead: ia.dead, serial: ia.serial });
        });
      });
    });
    // DR och BDR på Ethernet: högst router-id blir DR (alla har prioritet 1)
    ids.forEach(function (a) {
      R[a].nbrs.forEach(function (nb) {
        if (nb.serial) { nb.role = '-'; return; }
        nb.role = U.ipToInt(nb.rid) > U.ipToInt(R[a].rid) ? 'DR' : 'BDR';
      });
    });
    // Vem har en defaultrutt att sprida (default-information originate)?
    function hasDefault(id) {
      var d = R[id].d;
      if (d.config.ospf.defaultAlways) return true;
      var stat = d.config.routes.some(function (r) {
        if (r.net !== '0.0.0.0' || r.mask !== '0.0.0.0') return false;
        if (r.nh) return epsOf(D, id).some(function (e) { return e.up && e.ip && U.sameSubnet(r.nh, e.ip, e.mask); });
        var ep = D.eps['E:' + id + ':' + r.iface]; return !!(ep && ep.up);
      });
      return stat || (out.routes[id] || []).some(function (r) { return r.type === 'B' && r.net === '0.0.0.0'; });
    }
    // SPF från varje router
    ids.forEach(function (src) {
      var dist = {}, first = {}, done = {};
      dist[src] = 0;
      for (;;) {
        var u = null;
        ids.forEach(function (x) { if (!done[x] && dist[x] !== undefined && (u === null || dist[x] < dist[u] || (dist[x] === dist[u] && x < u))) u = x; });
        if (u === null) break;
        done[u] = true;
        R[u].nbrs.forEach(function (nb) {
          // Grannskapet måste gälla åt båda hållen
          if (!R[nb.dev].nbrs.some(function (q) { return q.dev === u; })) return;
          var nd = dist[u] + nb.cost;
          var hop = u === src ? nb : first[u];
          if (dist[nb.dev] === undefined || nd < dist[nb.dev] || (nd === dist[nb.dev] && U.ipToInt(hop.ip) < U.ipToInt(first[nb.dev].ip))) {
            dist[nb.dev] = nd; first[nb.dev] = hop;
          }
        });
      }
      var S = R[src], best = {};
      var connected = epsOf(D, src).filter(function (e) { return e.up && e.ip; }).map(function (e) { return U.network(e.ip, e.mask) + '/' + e.mask; });
      ids.forEach(function (y) {
        if (y === src || dist[y] === undefined) return;
        Object.keys(R[y].ifs).forEach(function (n) {
          var f = R[y].ifs[n];
          if (!f.up) return;
          var mask = f.loop ? '255.255.255.255' : f.mask;
          var netw = f.loop ? f.ip : U.network(f.ip, f.mask);
          var k = netw + '/' + mask;
          if (connected.indexOf(k) >= 0) return;
          var metric = dist[y] + f.cost;
          var hop = first[y];
          var cur = best[k];
          if (!cur || metric < cur.metric || (metric === cur.metric && U.ipToInt(hop.ip) < U.ipToInt(cur.nh))) {
            best[k] = { type: 'O', net: netw, mask: mask, nh: hop.ip, iface: hop.iface, metric: metric, ad: 110, origin: y };
          }
        });
      });
      // Extern defaultrutt (E2, metric 1) från den som har default-information originate
      ids.forEach(function (y) {
        if (y === src || dist[y] === undefined || !R[y].d.config.ospf.defaultOriginate || !hasDefault(y)) return;
        var hop = first[y], k = '0.0.0.0/0.0.0.0', cur = best[k];
        if (!cur || dist[y] < cur.fwd) best[k] = { type: 'O*E2', net: '0.0.0.0', mask: '0.0.0.0', nh: hop.ip, iface: hop.iface, metric: 1, fwd: dist[y], ad: 110, origin: y };
      });
      Object.keys(best).forEach(function (k) {
        var r = best[k];
        r.ep = D.eps['E:' + src + ':' + r.iface];
        (out.routes[src] = out.routes[src] || []).push(r);
      });
      S.dist = dist;
    });
    out.ospf = R;
  }

  // ------------------------------------------------------------------ BGP (bara eBGP mellan direktanslutna grannar)
  function bgpSpeaker(state, id) {
    var d = state.devices[id];
    if (!d) return null;
    if (isRouter(d) && d.config.bgp) return { id: id, as: d.config.bgp.as, neighbors: d.config.bgp.neighbors || {}, ios: true, d: d };
    if (d.kind === 'isp' && d.bgp) return { id: id, as: d.bgp.as, neighbors: d.bgp.neighbors, ios: false, d: d };
    return null;
  }
  function bgp(state, D, out) {
    var B = {};
    Object.keys(state.devices).forEach(function (id) {
      var d = state.devices[id];
      if (!isRouter(d) || !d.config.bgp || !d.config.bgp.as) return;
      var me = bgpSpeaker(state, id), peers = [], table = [];
      Object.keys(me.neighbors).forEach(function (ip) {
        var nb = me.neighbors[ip];
        var p = { ip: ip, remoteAs: nb.remoteAs, state: 'Active', up: false, reason: null, pfx: 0 };
        peers.push(p);
        if (nb.shutdown) { p.state = 'Idle (Admin)'; p.reason = 'admin'; return; }
        if (!nb.remoteAs) { p.state = 'Idle'; p.reason = 'noas'; return; }
        var local = epsOf(D, id).filter(function (e) { return e.up && e.ip && !e.loop && U.sameSubnet(ip, e.ip, e.mask); })[0];
        if (!local) { p.reason = 'noroute'; return; }
        p.local = local;
        var seg = D.comp[local.key];
        var owner = (D.bySeg[seg] || []).filter(function (e) { return e.up && e.ip === ip; })[0];
        if (!owner) { p.reason = 'noreply'; return; }
        var peer = bgpSpeaker(state, owner.dev);
        if (!peer) { p.reason = 'refused'; return; }
        var back = peer.neighbors[local.ip];
        if (!back || back.shutdown) { p.reason = 'refused'; return; }
        if (nb.remoteAs !== peer.as) { p.reason = 'bad-as'; p.peerAs = peer.as; return; }
        if (back.remoteAs !== me.as) { p.reason = 'peer-bad-as'; return; }
        p.state = 'Established'; p.up = true; p.peerDev = owner.dev;
        // Det grannen annonserar
        var adv = [];
        if (!peer.ios) adv = peer.d.bgp.advertise.map(function (a) { return { net: a.net, mask: a.mask, path: [peer.as].concat(a.path) }; });
        else (peer.d.config.bgp.networks || []).forEach(function (n) { adv.push({ net: n.net, mask: n.mask, path: [peer.as] }); });
        adv.forEach(function (a) {
          if (a.path.indexOf(me.as) >= 0) return; // AS-vägen visar att vägen redan gått genom oss
          table.push({ net: a.net, mask: a.mask, nh: ip, path: a.path, from: ip, iface: local.iface, ep: local });
          p.pfx++;
        });
      });
      // Egna nät (network ... mask ...) finns i tabellen med vägen tom
      (d.config.bgp.networks || []).forEach(function (n) { table.push({ net: n.net, mask: n.mask, nh: '0.0.0.0', path: [], local: true }); });
      // Bästa väg per prefix: kortast AS-väg, sedan lägst grannadress
      var byPfx = {};
      table.forEach(function (r) { (byPfx[r.net + '/' + r.mask] = byPfx[r.net + '/' + r.mask] || []).push(r); });
      Object.keys(byPfx).forEach(function (k) {
        var list = byPfx[k];
        list.sort(function (a, b) { return (a.local ? -1 : 0) - (b.local ? -1 : 0) || a.path.length - b.path.length || U.ipToInt(a.nh) - U.ipToInt(b.nh); });
        list[0].best = true;
        var b = list[0];
        if (b.local) return;
        // Anslutna nät vinner ändå på avståndet, men bara de andra installeras
        var conn = epsOf(D, id).some(function (e) { return e.up && e.ip && U.network(e.ip, e.mask) === b.net && e.mask === b.mask; });
        if (!conn) (out.routes[id] = out.routes[id] || []).push({ type: 'B', net: b.net, mask: b.mask, nh: b.nh, iface: b.iface, ep: b.ep, metric: 0, ad: 20, path: b.path });
      });
      B[id] = { as: me.as, rid: d.config.bgp.routerId || routerId(d, D), peers: peers, table: table };
    });
    out.bgp = B;
  }

  // Loggrader när grannskap och sessioner ändras (minnet ligger i state så att det följer med sparade spel)
  function logChanges(state, out) {
    var mem = state.dynMem = state.dynMem || { ospf: {}, bgp: {}, since: {} };
    // Raderna skrivs först när beräkningen är klar (tidsstämpeln behöver det färdiga nätet)
    var S = { pushLog: function (st, d, msg) { out.logs.push({ d: d, msg: msg }); } };
    Object.keys(out.ospf).forEach(function (id) {
      var R = out.ospf[id], d = R.d, now = {};
      R.nbrs.forEach(function (nb) {
        var k = nb.rid + '@' + nb.iface;
        now[k] = true;
        if (!mem.ospf[id + '|' + k]) {
          if (mem.ready) S.pushLog(state, d, '%OSPF-5-ADJCHG: Process ' + d.config.ospf.pid + ', Nbr ' + nb.rid + ' on ' + nb.iface + ' from LOADING to FULL, Loading Done');
          mem.since[id + '|' + k] = mem.ready ? state.time : (state.time || 0) - 2317;
        }
      });
      Object.keys(mem.ospf).forEach(function (mk) {
        if (mk.indexOf(id + '|') !== 0) return;
        var k = mk.slice(id.length + 1);
        if (!now[k] && mem.ready) {
          var ifn = k.split('@')[1], ep = (state._D && state._D.eps['E:' + id + ':' + ifn]);
          S.pushLog(state, d, '%OSPF-5-ADJCHG: Process ' + d.config.ospf.pid + ', Nbr ' + k.split('@')[0] + ' on ' + ifn + ' from FULL to DOWN, Neighbor Down: ' + (ep && ep.up ? 'Dead timer expired' : 'Interface down or detached'));
        }
        if (!now[k]) delete mem.ospf[mk];
      });
      Object.keys(now).forEach(function (k) { mem.ospf[id + '|' + k] = true; });
      // Fel area loggas av IOS; olika timers syns bara med debug
      R.problems.forEach(function (p) {
        var pk = 'p|' + id + '|' + p.iface + '|' + p.why;
        if (mem.ospf[pk]) return;
        mem.ospf[pk] = true;
        if (!mem.ready) return;
        if (p.why === 'area') S.pushLog(state, d, '%OSPF-4-ERRRCV: Received invalid packet: mismatched area ID from backbone area must be virtual-link but not found from ' + p.peerIp + ', ' + p.iface);
        if (p.why === 'rid') S.pushLog(state, d, '%OSPF-4-DUP_RTRID_NBR: OSPF detected duplicate router-id ' + R.rid + ' from ' + p.peerIp + ' on interface ' + p.iface);
      });
    });
    Object.keys(out.bgp).forEach(function (id) {
      var d = state.devices[id];
      out.bgp[id].peers.forEach(function (p) {
        var k = id + '|' + p.ip, was = mem.bgp[k];
        if (p.up && was !== 'up') {
          if (mem.ready) S.pushLog(state, d, '%BGP-5-ADJCHANGE: neighbor ' + p.ip + ' Up');
          mem.since['b|' + k] = mem.ready ? state.time : (state.time || 0) - 1201;
        }
        if (!p.up && was === 'up' && mem.ready) S.pushLog(state, d, '%BGP-5-ADJCHANGE: neighbor ' + p.ip + ' Down Peer closed the session');
        if (p.reason === 'bad-as' && was !== 'bad-as' && mem.ready) S.pushLog(state, d, '%BGP-3-NOTIFICATION: sent to neighbor ' + p.ip + ' passive 2/2 (peer in wrong AS) 2 bytes ' + ('0000' + (p.peerAs || 0).toString(16).toUpperCase()).slice(-4));
        mem.bgp[k] = p.up ? 'up' : (p.reason || 'down');
      });
    });
    mem.ready = true;
  }

  function compute(state, D, opts) {
    var out = { routes: {}, ospf: {}, bgp: {}, logs: [] };
    // BGP först: en BGP-default kan spridas vidare med OSPF
    bgp(state, D, out);
    ospf(state, D, out);
    D.dyn = out;
    // Tyst när en kontroll bara provar något tillfälligt (t.ex. ett interface nere i kurs2.js)
    if ((!opts || !opts.quiet) && !state._quiet) logChanges(state, out);
    return out;
  }
  function since(state, key) {
    var m = state.dynMem && state.dynMem.since[key];
    return m === undefined ? 0 : m;
  }

  function flush(state, D) {
    var q = D.dyn ? D.dyn.logs : [];
    if (D.dyn) D.dyn.logs = [];
    q.forEach(function (x) { NV.sim.pushLog(state, x.d, x.msg); });
  }

  return { compute: compute, flush: flush, AD: AD, ifCost: ifCost, bandwidth: bandwidth, hello: hello, dead: dead, routerId: routerId, since: since };
})();
