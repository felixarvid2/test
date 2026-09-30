// Nätverkssimulatorn. Allt härleds ur konfigurationen och den fysiska kopplingen,
// så att ett fel bara försvinner när orsaken faktiskt är rättad.
NV.sim = (function () {
  var U = NV.util;

  var INTERNET = {
    '9.9.9.9': { name: 'dns.quad9.net', dns: true },
    '198.51.100.80': { name: 'www.example.com', web: true },
    '198.51.100.25': { name: 'mail.example.com' },
  };
  var PUBLIC_DNS = { 'www.example.com': '198.51.100.80', 'example.com': '198.51.100.80', 'dns.quad9.net': '9.9.9.9', 'mail.example.com': '198.51.100.25', 'www.nordvik.example': '203.0.113.11' };

  function ifc(dev, name) { return dev.config && dev.config.ifaces[name]; }
  function isSwitch(d) { return d && d.kind === 'switch'; }
  function isRouter(d) { return d && d.kind === 'router'; }
  function portNum(name) { var m = /(\d+)$/.exec(name); return m ? parseInt(m[1], 10) : 0; }
  function key(dev, port) { return dev + '|' + port; }

  // ---------------------------------------------------------------- Lager 1
  function sideAdminUp(state, dev, port) {
    var d = state.devices[dev];
    if (!d || !d.powered) return false;
    if (d.os === 'ios') {
      var i = ifc(d, port);
      if (!i || i.shutdown) return false;
      if (d.rt.errdisabled[port]) return false;
      return true;
    }
    if (d.kind === 'hub') return true;
    if (d.nic) return d.nic.enabled;
    return true;
  }
  function sideNeg(state, dev, port, linkKind) {
    var d = state.devices[dev];
    if (linkKind === 'fiber' || linkKind === 'wan') return { speed: 'auto', duplex: 'auto', max: 1000 };
    if (d && d.os === 'ios') {
      var i = ifc(d, port);
      return { speed: i.speed || 'auto', duplex: i.duplex || 'auto', max: 1000 };
    }
    return { speed: 'auto', duplex: 'auto', max: 1000 };
  }
  function negotiate(a, b) {
    var autoA = a.speed === 'auto' && a.duplex === 'auto';
    var autoB = b.speed === 'auto' && b.duplex === 'auto';
    function sp(x) { return x.speed === 'auto' ? Math.min(a.max, b.max) : parseInt(x.speed, 10); }
    function dp(x) { return x.duplex === 'auto' ? 'full' : x.duplex; }
    if (autoA && autoB) {
      var s = Math.min(a.max, b.max);
      return { ok: true, a: { speed: s, duplex: 'full', auto: true }, b: { speed: s, duplex: 'full', auto: true } };
    }
    if (autoA !== autoB) {
      var fixed = autoA ? b : a;
      var S = sp(fixed);
      var fx = { speed: S, duplex: dp(fixed), auto: false };
      var au = { speed: S, duplex: S >= 1000 ? 'full' : 'half', auto: true };
      return autoA ? { ok: true, a: au, b: fx } : { ok: true, a: fx, b: au };
    }
    var sa = sp(a), sb = sp(b);
    if (sa !== sb) return { ok: false };
    return { ok: true, a: { speed: sa, duplex: dp(a), auto: false }, b: { speed: sb, duplex: dp(b), auto: false } };
  }

  // PoE: vilka enheter får ström
  function computePoe(state, D) {
    Object.keys(state.devices).forEach(function (id) {
      var sw = state.devices[id];
      if (!isSwitch(sw)) return;
      var used = 0;
      var info = { available: sw.poeBudget, used: 0, remaining: sw.poeBudget, ports: {} };
      var names = Object.keys(sw.config.ifaces).filter(function (n) { return /^GigabitEthernet0\/\d+$/.test(n) && portNum(n) <= 24; });
      names.sort(function (x, y) { return portNum(x) - portNum(y); });
      names.forEach(function (n) {
        var i = sw.config.ifaces[n];
        var la = NV.model.linkAt(state, id, n);
        var pd = la && state.devices[la.peer.dev];
        var p = { admin: i.poe === 'never' ? 'off' : 'auto', oper: 'off', watts: 0, device: 'n/a', cls: 'n/a' };
        if (pd && pd.poeWatts && la.link.state !== 'unplugged' && la.link.state !== 'broken' && !pd.externalPower) {
          if (sw.poeBudget > 0 && i.poe !== 'never' && !i.shutdown && sw.powered) {
            if (sw.poeBudget - used - (state.flags.poeExtra && state.flags.poeExtra[id] || 0) >= pd.poeWatts) {
              used += pd.poeWatts;
              p.oper = 'on'; p.watts = pd.poeWatts; p.device = pd.poeModel || 'AIR-CAP3702I-E-K9'; p.cls = pd.poeClass;
            } else {
              p.oper = 'faulty'; p.device = 'n/a';
            }
          }
        }
        info.ports[n] = p;
      });
      var extra = state.flags.poeExtra && state.flags.poeExtra[id] || 0;
      info.used = Math.round((used + extra) * 10) / 10;
      info.remaining = Math.round((sw.poeBudget - used - extra) * 10) / 10;
      D.poe[id] = info;
    });
    // Ström till PoE-enheter
    Object.keys(state.devices).forEach(function (id) {
      var d = state.devices[id];
      if (!d.poeWatts) return;
      if (d.externalPower) { d.powered = true; return; }
      var la = findHostLink(state, id);
      var on = false;
      if (la) {
        var pi = D.poe[la.peer.dev] && D.poe[la.peer.dev].ports[la.peer.port];
        on = !!(pi && pi.oper === 'on');
      }
      d.powered = on;
    });
  }
  function findHostLink(state, id) {
    for (var i = 0; i < state.links.length; i++) {
      var l = state.links[i];
      if (l.a.dev === id) return { link: l, me: l.a, peer: l.b };
      if (l.b.dev === id) return { link: l, me: l.b, peer: l.a };
    }
    return null;
  }

  function physical(state, D) {
    state.links.forEach(function (l) {
      var upA = sideAdminUp(state, l.a.dev, l.a.port);
      var upB = sideAdminUp(state, l.b.dev, l.b.port);
      var cable = l.state === 'ok' || l.state === 'flapping';
      var neg = negotiate(sideNeg(state, l.a.dev, l.a.port, l.kind), sideNeg(state, l.b.dev, l.b.port, l.kind));
      var up = upA && upB && cable && neg.ok;
      var mismatch = up && neg.a.duplex !== neg.b.duplex;
      D.links[l.id] = { up: up, mismatch: mismatch, flapping: up && l.state === 'flapping', negA: neg.a, negB: neg.b };
      [[l.a, l.b, neg.a, upA], [l.b, l.a, neg.b, upB]].forEach(function (s) {
        D.ports[key(s[0].dev, s[0].port)] = {
          link: l, peer: s[1], up: up, adminUp: s[3], neg: s[2] || null, mismatch: mismatch,
        };
      });
    });
  }

  // ---------------------------------------------------------------- Lager 2
  function vlanExists(sw, v) { return !!sw.config.vlans[v]; }
  function opMode(state, dev, port) {
    var d = state.devices[dev];
    var i = ifc(d, port);
    if (i.mode === 'access') return 'access';
    if (i.mode === 'trunk') return 'trunk';
    var la = NV.model.linkAt(state, dev, port);
    if (!la) return 'access';
    var pd = state.devices[la.peer.dev];
    if (!isSwitch(pd)) return 'access';
    var pi = ifc(pd, la.peer.port);
    if (i.nonegotiate || pi.nonegotiate) return pi.mode === 'trunk' && i.mode === 'trunk' ? 'trunk' : 'access';
    var me = i.mode, other = pi.mode;
    if (other === 'trunk' && me !== 'access') return 'trunk';
    if (other === 'dynamic desirable' && (me === 'dynamic auto' || me === 'dynamic desirable')) return 'trunk';
    if (me === 'dynamic desirable' && other === 'dynamic auto') return 'trunk';
    return 'access';
  }
  function trunkVlans(sw, i) {
    var list = i.allowed === 'all' ? Object.keys(sw.config.vlans).map(Number) : i.allowed.slice();
    return list.filter(function (v) { return vlanExists(sw, v); }).sort(function (a, b) { return a - b; });
  }
  function carriesVlan(state, dev, port, v) {
    var d = state.devices[dev];
    var i = ifc(d, port);
    var m = opMode(state, dev, port);
    if (m === 'access') return i.accessVlan === v && vlanExists(d, v);
    return trunkVlans(d, i).indexOf(v) >= 0;
  }
  function bridgeId(sw, v) {
    var pr = (sw.config.stpPriority[v] || 32768) + v;
    return { pr: pr, mac: sw.baseMac };
  }
  function bidLess(a, b) { return a.pr < b.pr || (a.pr === b.pr && a.mac < b.mac); }

  // STP och native-mismatch: räknar ut blockerade (port, vlan)
  function spanningTree(state, D) {
    var swLinks = [];
    state.links.forEach(function (l) {
      var A = state.devices[l.a.dev], B = state.devices[l.b.dev];
      if (isSwitch(A) && isSwitch(B) && D.links[l.id].up) swLinks.push(l);
    });
    // native mismatch
    swLinks.forEach(function (l) {
      var ma = opMode(state, l.a.dev, l.a.port), mb = opMode(state, l.b.dev, l.b.port);
      if (ma === 'trunk' && mb === 'trunk') {
        var na = ifc(state.devices[l.a.dev], l.a.port).native, nb = ifc(state.devices[l.b.dev], l.b.port).native;
        if (na !== nb) {
          D.nativeMismatch.push({ link: l, a: l.a, b: l.b, na: na, nb: nb });
          [l.a, l.b].forEach(function (s) {
            D.blocked[key(s.dev, s.port) + '#' + na] = 'BKN*';
            D.blocked[key(s.dev, s.port) + '#' + nb] = 'BKN*';
          });
        }
      }
    });
    // alla VLAN som finns på någon switch
    var vset = {};
    Object.keys(state.devices).forEach(function (id) {
      var d = state.devices[id];
      if (isSwitch(d)) Object.keys(d.config.vlans).forEach(function (v) { vset[v] = true; });
    });
    Object.keys(vset).map(Number).forEach(function (v) {
      var carrying = swLinks.filter(function (l) {
        return carriesVlan(state, l.a.dev, l.a.port, v) && carriesVlan(state, l.b.dev, l.b.port, v) &&
          !D.blocked[key(l.a.dev, l.a.port) + '#' + v];
      });
      // Rotbrygga per sammanhängande grupp (här räcker enkel jämförelse)
      var groups = {};
      carrying.forEach(function (l) {
        var pair = [l.a.dev, l.b.dev].sort().join('+');
        (groups[pair] = groups[pair] || []).push(l);
      });
      Object.keys(groups).forEach(function (pair) {
        var ls = groups[pair];
        var s1 = state.devices[ls[0].a.dev], s2 = state.devices[ls[0].b.dev];
        var on1 = s1.config.stpOff.indexOf(v) < 0, on2 = s2.config.stpOff.indexOf(v) < 0;
        var root = bidLess(bridgeId(s1, v), bridgeId(s2, v)) ? s1 : s2;
        var non = root === s1 ? s2 : s1;
        D.stp[root.id] = D.stp[root.id] || {};
        D.stp[non.id] = D.stp[non.id] || {};
        D.stp[root.id][v] = { root: root.id, isRoot: true };
        D.stp[non.id][v] = { root: root.id, isRoot: false };
        if (ls.length < 2) {
          var l0 = ls[0];
          var np = l0.a.dev === non.id ? l0.a.port : l0.b.port;
          D.stp[non.id][v].rootPort = np;
          return;
        }
        if (!on1 && !on2) {
          D.storm[v] = D.storm[v] || [];
          D.storm[v].push(s1.id, s2.id);
          return;
        }
        var sides = ls.map(function (l) { return l.a.dev === non.id ? l.a.port : l.b.port; });
        sides.sort(function (x, y) { return portNum(x) - portNum(y); });
        D.stp[non.id][v].rootPort = sides[0];
        for (var k = 1; k < sides.length; k++) D.blocked[key(non.id, sides[k]) + '#' + v] = 'BLK';
      });
    });
  }

  function blockedNode(D, n) {
    var m = /^E:(.+):nic$/.exec(n);
    return !!(m && D.secBlocked[m[1]]);
  }
  function addEdge(D, a, b, linkId, lossy) {
    (D.adj[a] = D.adj[a] || []).push({ to: b, link: linkId, lossy: lossy || 0 });
    (D.adj[b] = D.adj[b] || []).push({ to: a, link: linkId, lossy: lossy || 0 });
  }

  // Vad en port lämnar ut på kabeln: kanal -> nod
  function portChannels(state, D, dev, port, pass) {
    var d = state.devices[dev];
    var ch = {};
    if (!d) return ch;
    if (isSwitch(d)) {
      var i = ifc(d, port);
      var m = opMode(state, dev, port);
      var k = key(dev, port);
      if (m === 'access') {
        if (vlanExists(d, i.accessVlan) && !D.blocked[k + '#' + i.accessVlan]) ch.u = 'S:' + dev + ':' + i.accessVlan;
      } else {
        trunkVlans(d, i).forEach(function (v) {
          if (D.blocked[k + '#' + v]) return;
          if (v === i.native) ch.u = 'S:' + dev + ':' + v; else ch['t' + v] = 'S:' + dev + ':' + v;
        });
        if (D.nativeMismatch.some(function (nm) { return (nm.a.dev === dev && nm.a.port === port) || (nm.b.dev === dev && nm.b.port === port); })) delete ch.u;
      }
      return ch;
    }
    if (isRouter(d)) {
      var ph = ifc(d, port);
      if (ph.ip) ch.u = 'E:' + dev + ':' + port;
      Object.keys(d.config.ifaces).forEach(function (n) {
        var s = d.config.ifaces[n];
        if (s.parent === port && s.encap && !s.shutdown) ch['t' + s.encap] = 'E:' + dev + ':' + n;
      });
      return ch;
    }
    if (d.kind === 'hub') { ch.u = 'H:' + dev; return ch; }
    if (d.kind === 'ap') {
      ch.u = 'E:' + dev + ':nic';
      if (pass === 2 && D.apJoined[dev]) {
        var w = state.devices['WLC'].wlc;
        Object.keys(w.wlans).forEach(function (id) {
          var wl = w.wlans[id];
          if (!wl.enabled) return;
          var ifc2 = w.interfaces[wl.iface];
          if (ifc2) ch['t' + ifc2.vlan] = 'W:' + dev + ':' + ifc2.vlan;
        });
      }
      return ch;
    }
    ch.u = 'E:' + dev + ':nic';
    return ch;
  }

  function buildL2(state, D, pass) {
    D.adj = {};
    state.links.forEach(function (l) {
      var info = D.links[l.id];
      if (!info.up) return;
      var ca = portChannels(state, D, l.a.dev, l.a.port, pass);
      var cb = portChannels(state, D, l.b.dev, l.b.port, pass);
      var lossy = info.mismatch ? 0.35 : 0;
      Object.keys(ca).forEach(function (c) {
        if (!cb[c]) return;
        if (blockedNode(D, ca[c]) || blockedNode(D, cb[c])) return;
        addEdge(D, ca[c], cb[c], l.id, lossy);
      });
    });
    // SVI:er
    Object.keys(state.devices).forEach(function (id) {
      var d = state.devices[id];
      if (!isSwitch(d)) return;
      Object.keys(d.config.ifaces).forEach(function (n) {
        var s = d.config.ifaces[n];
        if (s.svi && !s.shutdown && vlanExists(d, s.svi)) addEdge(D, 'E:' + id + ':' + n, 'S:' + id + ':' + s.svi, null, 0);
      });
    });
    // Trådlösa klienter
    if (pass === 2) {
      D.wifi = {};
      var w = state.devices['WLC'] && state.devices['WLC'].wlc;
      Object.keys(state.devices).forEach(function (id) {
        var c = state.devices[id];
        if (!c.wireless || !c.ssid || !c.powered || !w) return;
        var wlanId = Object.keys(w.wlans).filter(function (k) { return w.wlans[k].ssid === c.ssid && w.wlans[k].enabled; })[0];
        if (!wlanId) return;
        var aps = Object.keys(D.apJoined).filter(function (a) { return D.apJoined[a] && state.devices[a].site === c.site; }).sort();
        if (!aps.length) return;
        var ap = aps[0];
        var vlan = w.interfaces[w.wlans[wlanId].iface].vlan;
        var interf = channelConflict(state, D, c.site);
        addEdge(D, 'E:' + id + ':nic', 'W:' + ap + ':' + vlan, 'wifi', interf ? 0.4 : 0);
        D.wifi[id] = { ap: ap, vlan: vlan, ssid: c.ssid, interference: interf, aps: aps };
      });
    }
    // Komponenter
    D.comp = {};
    var n = 0;
    Object.keys(D.adj).forEach(function (start) {
      if (D.comp[start] !== undefined) return;
      var q = [start];
      D.comp[start] = n;
      while (q.length) {
        var x = q.shift();
        (D.adj[x] || []).forEach(function (e) {
          if (D.comp[e.to] === undefined) { D.comp[e.to] = n; q.push(e.to); }
        });
      }
      n++;
    });
  }

  function channelConflict(state, D, site) {
    var w = state.devices['WLC'].wlc;
    var seen = {};
    var aps = Object.keys(D.apJoined).filter(function (a) { return D.apJoined[a] && state.devices[a].site === site; });
    for (var i = 0; i < aps.length; i++) {
      var ch = w.apChannels[aps[i]];
      if (seen[ch]) return true;
      seen[ch] = true;
    }
    return false;
  }

  // ---------------------------------------------------------------- Endpoints
  function hostIpConf(h) {
    if (h.nic.dhcp) return h.lease;
    return h.nic.static ? { ip: h.nic.static.ip, mask: h.nic.static.mask, gw: h.nic.static.gw, dns: h.nic.static.dns } : null;
  }

  function buildEndpoints(state, D) {
    D.eps = {};
    Object.keys(state.devices).forEach(function (id) {
      var d = state.devices[id];
      if (d.os === 'ios') {
        Object.keys(d.config.ifaces).forEach(function (n) {
          var i = d.config.ifaces[n];
          if (!i.ip || i.internal) return;
          var up;
          if (i.svi) up = !i.shutdown && vlanExists(d, i.svi) && svIUp(state, D, id, i.svi);
          else if (i.parent) { var par = D.ports[key(id, i.parent)]; up = !i.shutdown && par && par.up; }
          else { var pp = D.ports[key(id, n)]; up = !!(pp && pp.up); }
          var ek = 'E:' + id + ':' + n;
          D.eps[ek] = { key: ek, dev: id, iface: n, ip: i.ip.addr, mask: i.ip.mask, mac: d.baseMac, up: !!up && D.comp[ek] !== undefined };
        });
      } else if (d.kind === 'isp') {
        var ek2 = 'E:ISP:nic';
        var pp2 = D.ports[key('ISP', 'nic')];
        D.eps[ek2] = { key: ek2, dev: 'ISP', iface: 'nic', ip: d.ip, mask: d.mask, mac: d.baseMac, up: !!(pp2 && pp2.up) };
      } else if (d.nic) {
        var conf = hostIpConf(d);
        var ek3 = 'E:' + id + ':nic';
        var up3 = d.powered && d.nic.enabled && D.comp[ek3] !== undefined;
        if (!d.wireless) { var pp3 = D.ports[key(id, 'nic')]; up3 = up3 && !!(pp3 && pp3.up); }
        D.eps[ek3] = { key: ek3, dev: id, iface: 'nic', ip: conf ? conf.ip : null, mask: conf ? conf.mask : null, gw: conf ? conf.gw : null, mac: d.nic.mac, up: up3 };
      }
    });
    D.bySeg = {};
    Object.keys(D.eps).forEach(function (k) {
      var e = D.eps[k];
      var c = D.comp[k];
      if (c === undefined) return;
      (D.bySeg[c] = D.bySeg[c] || []).push(e);
    });
  }
  function svIUp(state, D, dev, v) {
    var node = 'S:' + dev + ':' + v;
    return (D.adj[node] || []).some(function (e) { return e.link !== null; });
  }

  // ---------------------------------------------------------------- Port security
  function portSecurity(state, D) {
    D.secBlocked = {};
    Object.keys(state.devices).forEach(function (id) {
      var sw = state.devices[id];
      if (!isSwitch(sw)) return;
      Object.keys(sw.config.ifaces).forEach(function (n) {
        var i = sw.config.ifaces[n];
        if (!i.portSec || i.mode !== 'access') return;
        var la = NV.model.linkAt(state, id, n);
        if (!la || (la.link.state !== 'ok' && la.link.state !== 'flapping') || i.shutdown) { sw.rt.secLearned[n] = []; return; }
        var peer = state.devices[la.peer.dev];
        var macs = [];
        var owners = [];
        if (peer.kind === 'hub') {
          state.links.forEach(function (l) {
            var o = l.a.dev === peer.id ? l.b : (l.b.dev === peer.id ? l.a : null);
            if (!o || o.dev === id) return;
            var h = state.devices[o.dev];
            if (h && h.nic && h.powered && l.state === 'ok') { macs.push(h.nic.mac); owners.push(h.id); }
          });
        } else if (peer.nic && peer.powered) { macs.push(peer.nic.mac); owners.push(peer.id); }
        var ps = i.portSec;
        var allowed = ps.macs.slice();
        var violators = [];
        macs.forEach(function (m, idx) {
          if (allowed.indexOf(m) >= 0) return;
          if (allowed.length < ps.max) { allowed.push(m); if (ps.sticky) ps.macs.push(m); } else violators.push(owners[idx]);
        });
        sw.rt.secLearned[n] = macs;
        if (violators.length) {
          if (ps.violation === 'shutdown') {
            if (!sw.rt.errdisabled[n]) {
              sw.rt.errdisabled[n] = 'psecure-violation';
              sw.rt.secViolations = (sw.rt.secViolations || 0) + 1;
              pushLog(state, sw, '%PORT_SECURITY-2-PSECURE_VIOLATION: Security violation occurred, caused by MAC address ' + U.macDots(state.devices[violators[0]].nic.mac) + ' on port ' + n + '.');
              pushLog(state, sw, '%PM-4-ERR_DISABLE: psecure-violation error detected on ' + U.shortIf(n) + ', putting ' + U.shortIf(n) + ' in err-disable state');
            }
          } else {
            violators.forEach(function (v) { D.secBlocked[v] = true; });
            sw.rt.secViolations = (sw.rt.secViolations || 0) + 1;
          }
        }
      });
    });
  }

  // ---------------------------------------------------------------- Beräkning
  function compute(state) {
    var D = { ports: {}, links: {}, poe: {}, blocked: {}, nativeMismatch: [], stp: {}, storm: {}, apJoined: {}, secBlocked: {}, wifi: {} };
    computePoe(state, D);
    portSecurity(state, D);
    physical(state, D);
    spanningTree(state, D);
    buildL2(state, D, 1);
    buildEndpoints(state, D);
    // Accesspunkter ansluter till controllern
    Object.keys(state.devices).forEach(function (id) {
      var d = state.devices[id];
      if (d.kind !== 'ap' || !d.powered) return;
      var r = pingInternal(state, D, id, '192.168.1.196', { proto: 'udp', dport: 5246 });
      D.apJoined[id] = r.ok;
    });
    buildL2(state, D, 2);
    buildEndpoints(state, D);
    state._D = D;
    state._dirty = false;
    return D;
  }
  function get(state) {
    if (!state._D || state._dirty) compute(state);
    return state._D;
  }
  function touch(state) { state._dirty = true; }

  // ---------------------------------------------------------------- Lager 3
  function epOf(D, dev, iface) { return D.eps['E:' + dev + ':' + iface]; }
  function devEps(D, dev) {
    return Object.keys(D.eps).map(function (k) { return D.eps[k]; }).filter(function (e) { return e.dev === dev; });
  }
  // BFS-väg mellan två noder: ger förlust längs vägen
  function l2Loss(state, D, from, to) {
    if (from === to) return 0;
    var prev = {}; prev[from] = null;
    var q = [from];
    var edgeTo = {};
    while (q.length) {
      var x = q.shift();
      if (x === to) break;
      (D.adj[x] || []).forEach(function (e) {
        if (prev[e.to] === undefined) { prev[e.to] = x; edgeTo[e.to] = e; q.push(e.to); }
      });
    }
    if (prev[to] === undefined) return 1;
    var loss = 0;
    var cur = to;
    var stormHit = false, stormSwitch = false;
    var stormSw = {};
    Object.keys(D.storm).forEach(function (v) { D.storm[v].forEach(function (s) { stormSw[s] = true; }); });
    while (cur !== null) {
      var m = /^S:([^:]+):(\d+)$/.exec(cur);
      if (m && D.storm[m[2]]) stormHit = true;
      if (m && stormSw[m[1]]) stormSwitch = true;
      if (cur === from) break;
      var e = edgeTo[cur];
      loss = Math.max(loss, e.lossy);
      cur = prev[cur];
    }
    // Belastningen drabbar allt som går genom switcharna i cirkeln
    if (stormSwitch) loss = Math.max(loss, 0.7);
    if (stormHit) loss = 1;
    return loss;
  }
  // Vem svarar på ARP för ip i segmentet
  function arpOwner(state, D, seg, ip, exceptKey) {
    var list = D.bySeg[seg] || [];
    var hits = list.filter(function (e) { return e.up && e.ip === ip && e.key !== exceptKey; });
    if (hits.length) return hits[0];
    // Proxy-ARP för statisk NAT på utsidan
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e.up) continue;
      var d = state.devices[e.dev];
      if (isRouter(d)) {
        var ic = d.config.ifaces[e.iface];
        if (ic.natDir === 'outside' && d.config.nat.statics.some(function (s) { return s.global === ip && U.sameSubnet(ip, e.ip, e.mask); })) return e;
      }
    }
    return null;
  }
  function routerOwns(D, dev, ip) {
    return devEps(D, dev).some(function (e) { return e.up && e.ip === ip; });
  }
  function routeLookup(state, D, dev, dst) {
    var d = state.devices[dev];
    var best = null;
    var cand = [];
    devEps(D, dev).forEach(function (e) {
      if (!e.up) return;
      cand.push({ type: 'C', net: U.network(e.ip, e.mask), mask: e.mask, iface: e.iface, ep: e });
    });
    d.config.routes.forEach(function (r) {
      if (r.nh) {
        // Rekursiv upplösning: nästa hopp måste ligga i ett anslutet nät
        var via = null;
        devEps(D, dev).forEach(function (e) { if (e.up && U.sameSubnet(r.nh, e.ip, e.mask)) via = e; });
        if (via) cand.push({ type: 'S', net: r.net, mask: r.mask, nh: r.nh, iface: via.iface, ep: via, ad: r.ad || 1 });
      } else if (r.iface) {
        var ep = epOf(D, dev, r.iface);
        if (ep && ep.up) cand.push({ type: 'S', net: r.net, mask: r.mask, iface: r.iface, ep: ep, direct: true, ad: r.ad || 1 });
      }
    });
    cand.forEach(function (c) {
      if (U.inNet(dst, c.net, c.mask)) {
        var p = U.maskToPrefix(c.mask);
        // Längsta prefix vinner; vid lika prefix vinner anslutet nät och sedan lägst administrativt avstånd (flytande statiska rutter)
        if (!best || p > best.p || (p === best.p && c.type === 'C' && best.type !== 'C') || (p === best.p && c.type === 'S' && best.type === 'S' && c.ad < best.ad)) { best = c; best.p = p; }
      }
    });
    return best;
  }
  function installedRoutes(state, D, dev) {
    var d = state.devices[dev];
    var out = [];
    devEps(D, dev).forEach(function (e) {
      if (!e.up) return;
      out.push({ type: 'C', net: U.network(e.ip, e.mask), mask: e.mask, iface: e.iface });
      out.push({ type: 'L', net: e.ip, mask: '255.255.255.255', iface: e.iface });
    });
    var st = [];
    d.config.routes.forEach(function (r) {
      var dflt = r.net === '0.0.0.0' && r.mask === '0.0.0.0';
      if (r.nh) {
        var ok = devEps(D, dev).some(function (e) { return e.up && U.sameSubnet(r.nh, e.ip, e.mask); });
        if (ok) st.push({ type: dflt ? 'S*' : 'S', net: r.net, mask: r.mask, nh: r.nh, ad: r.ad || 1 });
      } else if (r.iface) {
        var ep = epOf(D, dev, r.iface);
        if (ep && ep.up) st.push({ type: dflt ? 'S*' : 'S', net: r.net, mask: r.mask, iface: r.iface, ad: r.ad || 1 });
      }
    });
    // Bara rutterna med lägst administrativt avstånd per nät installeras
    st.forEach(function (r) {
      var best = st.every(function (q) { return q.net !== r.net || q.mask !== r.mask || q.ad >= r.ad; });
      if (best) out.push(r);
    });
    return out;
  }

  // ACL-utvärdering
  function aclCheck(state, dev, name, pkt, dir) {
    if (!name) return true;
    var d = state.devices[dev];
    var acl = d.config.acls[name];
    if (!acl) return true; // Ciscos beteende: en lista som inte finns släpper allt
    for (var i = 0; i < acl.rules.length; i++) {
      var r = acl.rules[i];
      if (r.remark) continue;
      if (aclMatch(acl.type, r, pkt)) {
        var c = d.rt.aclCounters[name] = d.rt.aclCounters[name] || {};
        c[r.seq] = (c[r.seq] || 0) + (pkt.count || 1);
        return r.action === 'permit';
      }
    }
    return false;
  }
  // Utvärdera en ACL utan att räkna träffar (för kontroller)
  function aclEval(state, dev, name, pkt) {
    var acl = state.devices[dev].config.acls[name];
    if (!acl) return true;
    for (var i = 0; i < acl.rules.length; i++) {
      var r = acl.rules[i];
      if (r.remark) continue;
      if (aclMatch(acl.type, r, pkt)) return r.action === 'permit';
    }
    return false;
  }
  function addrMatch(spec, ip) {
    if (!spec || spec.any) return true;
    if (spec.host) return spec.host === ip;
    return U.wildMatch(ip, spec.ip, spec.wild || '0.0.0.0');
  }
  function aclMatch(type, r, pkt) {
    if (!addrMatch(r.src, pkt.src)) return false;
    if (type === 'standard') return true;
    if (r.proto && r.proto !== 'ip' && r.proto !== pkt.proto) return false;
    if (!addrMatch(r.dst, pkt.dst)) return false;
    if (r.dport && pkt.dport !== r.dport) return false;
    return true;
  }
  function natMatchList(state, dev, aclName, src, dst) {
    var acl = state.devices[dev].config.acls[aclName];
    if (!acl) return false;
    for (var i = 0; i < acl.rules.length; i++) {
      var r = acl.rules[i];
      if (r.remark) continue;
      if (aclMatch(acl.type, r, { src: src, dst: dst || '0.0.0.0', proto: 'ip' })) return r.action === 'permit';
    }
    return false;
  }

  // ---------------------------------------------------------------- IPsec (kapitel 10)
  // Crypto map-tunnlar mellan två routrar över internet. NAT sker före kryptering,
  // precis som i IOS, så en NAT-lista utan deny-rad gör att trafiken aldrig krypteras.
  var TUNNEL_MTU = 1420; // ESP i tunnelläge äter ungefär 80 byte av 1500
  function cryptoOf(d) { return d && d.config && d.config.crypto; }
  function specNorm(s) {
    if (!s || s.any) return '0.0.0.0/255.255.255.255';
    if (s.host) return s.host + '/0.0.0.0';
    var w = s.wild || '0.0.0.0';
    var ip = U.intToIp((U.ipToInt(s.ip) & ~U.ipToInt(w)) >>> 0);
    return ip + '/' + w;
  }
  function mirrors(a, b) {
    return a.action === 'permit' && b.action === 'permit' && (a.proto || 'ip') === (b.proto || 'ip') &&
      specNorm(a.src) === specNorm(b.dst) && specNorm(a.dst) === specNorm(b.src);
  }
  function cryptoEntries(d, mapName) {
    var cr = cryptoOf(d);
    if (!cr || !mapName || !cr.maps[mapName]) return [];
    var m = cr.maps[mapName];
    return Object.keys(m).map(Number).sort(function (a, b) { return a - b; }).map(function (seq) { var e = m[seq]; e.seq = seq; e.map = mapName; return e; });
  }
  // Vilken crypto map-rad (och ACL-rad) matchar paketet på väg ut genom ifname?
  function cryptoMatch(state, dev, ifname, pkt) {
    var d = state.devices[dev];
    var i = d.config.ifaces[ifname];
    if (!i || !i.cryptoMap) return null;
    var list = cryptoEntries(d, i.cryptoMap);
    for (var k = 0; k < list.length; k++) {
      var e = list[k];
      if (!e.peer || !e.ts || !e.acl) continue; // ofullständig rad används inte
      var acl = d.config.acls[e.acl];
      if (!acl || acl.type !== 'extended') continue;
      for (var j = 0; j < acl.rules.length; j++) {
        var r = acl.rules[j];
        if (r.remark) continue;
        if (aclMatch('extended', r, { src: pkt.src, dst: pkt.dst, proto: pkt.proto })) {
          if (r.action === 'deny') break;
          return { entry: e, rule: r, iface: ifname };
        }
      }
    }
    return null;
  }
  function routerByIp(state, D, ip) {
    var hit = null;
    Object.keys(D.eps).forEach(function (k) {
      var e = D.eps[k];
      if (!hit && e.up && e.ip === ip && isRouter(state.devices[e.dev])) hit = e;
    });
    return hit;
  }
  function samePolicy(a, b) { return a.enc === b.enc && a.hash === b.hash && a.auth === b.auth && a.group === b.group; }
  // Fas 1 (ISAKMP) för en crypto map-rad. Returnerar peer-info eller orsak.
  function phase1(state, D, dev, e, ifname) {
    var d = state.devices[dev];
    var cr = cryptoOf(d);
    var local = D.eps['E:' + dev + ':' + ifname];
    if (!local || !local.up) return { ok: false, reason: 'down', state: 'MM_NO_STATE' };
    var pe = routerByIp(state, D, e.peer);
    if (!pe) return { ok: false, reason: 'nopeer', state: 'MM_NO_STATE' };
    // Nås peer över internet?
    var rt = routeLookup(state, D, dev, e.peer);
    if (!rt) return { ok: false, reason: 'noroute', state: 'MM_NO_STATE' };
    var pd = state.devices[pe.dev];
    var pcr = cryptoOf(pd);
    var pif = pd.config.ifaces[pe.iface];
    if (!pcr || !pif.cryptoMap) return { ok: false, reason: 'peer-nomap', state: 'MM_NO_STATE' };
    var pEntries = cryptoEntries(pd, pif.cryptoMap).filter(function (x) { return x.peer === local.ip; });
    if (!pEntries.length) return { ok: false, reason: 'peer-nomap', state: 'MM_NO_STATE' };
    var pol = Object.keys(cr.isakmp.policies).map(function (k) { return cr.isakmp.policies[k]; });
    var ppol = Object.keys(pcr.isakmp.policies).map(function (k) { return pcr.isakmp.policies[k]; });
    var match = pol.some(function (a) { return ppol.some(function (b) { return samePolicy(a, b); }); });
    if (!match) return { ok: false, reason: 'policy', state: 'MM_NO_STATE' };
    var k1 = cr.isakmp.keys[e.peer], k2 = pcr.isakmp.keys[local.ip];
    if (!k1 || !k2 || k1 !== k2) return { ok: false, reason: 'key', state: 'MM_KEY_EXCH' };
    return { ok: true, state: 'QM_IDLE', peerDev: pe.dev, peerEp: pe, peerEntries: pEntries, localIp: local.ip };
  }
  // Fas 2 (IPsec SA) för en ACL-rad: transform-set och spegelvänd ACL på andra sidan
  function phase2(state, dev, e, rule, p1) {
    var d = state.devices[dev], cr = cryptoOf(d);
    var pd = state.devices[p1.peerDev], pcr = cryptoOf(pd);
    var ts = cr.transformSets[e.ts];
    for (var i = 0; i < p1.peerEntries.length; i++) {
      var pe = p1.peerEntries[i];
      var pts = pcr.transformSets[pe.ts];
      if (!ts || !pts || ts.transforms.join(' ') !== pts.transforms.join(' ')) continue;
      var pacl = pd.config.acls[pe.acl];
      if (!pacl) continue;
      for (var j = 0; j < pacl.rules.length; j++) {
        if (mirrors(rule, pacl.rules[j])) return { ok: true, peerEntry: pe, peerRule: pacl.rules[j] };
      }
    }
    return { ok: false, reason: ts ? 'proxy' : 'transform' };
  }
  function saKey(e, rule) { return e.map + ':' + e.seq + ':' + rule.seq; }
  function ikeMark(state, dev, peerIp, up) {
    var d = state.devices[dev];
    d.rt.ike = d.rt.ike || {};
    var cur = d.rt.ike[peerIp];
    if (!cur) d.rt.ike[peerIp] = { since: state.time, connId: 1001 + (U.hash(dev + peerIp) % 5), up: up };
    else cur.up = up;
  }
  // Försöker skicka paketet genom tunneln. Räknar encaps/decaps och loggar fel som IOS gör.
  function tunnelFor(state, D, dev, cm, pkt) {
    var d = state.devices[dev];
    var e = cm.entry;
    var p1 = phase1(state, D, dev, e, cm.iface);
    ikeMark(state, dev, e.peer, p1.ok);
    if (!p1.ok) return { ok: false, reason: p1.reason };
    ikeMark(state, p1.peerDev, p1.localIp, true);
    var p2 = phase2(state, dev, e, cm.rule, p1);
    var pd = state.devices[p1.peerDev];
    if (!p2.ok) {
      var fk = saKey(e, cm.rule);
      pd.rt.p2fail = pd.rt.p2fail || {};
      if (!pd.rt.p2fail[fk]) {
        pd.rt.p2fail[fk] = true;
        pushLog(state, pd, '%CRYPTO-6-IKMP_MODE_FAILURE: Processing of Quick mode failed with peer at ' + p1.localIp);
        if (p2.reason === 'proxy') pushLog(state, pd, '%CRYPTO-4-IKMP_NO_SA: IPSEC(validate_transform_proposal): proxy identities not supported');
        pushLog(state, d, '%CRYPTO-6-IKMP_MODE_FAILURE: Processing of Quick mode failed with peer at ' + e.peer);
      }
      return { ok: false, reason: p2.reason };
    }
    var n = pkt.count || 1;
    var k = saKey(e, cm.rule), pk = saKey(p2.peerEntry, p2.peerRule);
    d.rt.ipsec = d.rt.ipsec || {};
    pd.rt.ipsec = pd.rt.ipsec || {};
    var a = d.rt.ipsec[k] = d.rt.ipsec[k] || { encaps: 0, decaps: 0, since: state.time };
    var b = pd.rt.ipsec[pk] = pd.rt.ipsec[pk] || { encaps: 0, decaps: 0, since: state.time };
    a.encaps += n; b.decaps += n;
    if (pd.rt.p2fail) pd.rt.p2fail = {};
    return { ok: true, peerDev: p1.peerDev, peerEp: p1.peerEp };
  }
  // Status för show crypto: fas 1 per peer och SA per ACL-rad
  function cryptoStatus(state, dev) {
    var D = get(state);
    var d = state.devices[dev];
    var out = { isakmp: [], sas: [] };
    if (!cryptoOf(d)) return out;
    Object.keys(d.config.ifaces).forEach(function (n) {
      var i = d.config.ifaces[n];
      if (!i.cryptoMap) return;
      var local = D.eps['E:' + dev + ':' + n];
      cryptoEntries(d, i.cryptoMap).forEach(function (e) {
        if (!e.peer) return;
        var ike = d.rt.ike && d.rt.ike[e.peer];
        var p1 = phase1(state, D, dev, e, n);
        if (ike) out.isakmp.push({ dst: e.peer, src: local ? local.ip : (i.ip ? i.ip.addr : ''), state: p1.ok ? 'QM_IDLE' : p1.state, connId: p1.ok ? ike.connId : 0, status: 'ACTIVE' });
        var acl = e.acl && d.config.acls[e.acl];
        if (!acl) return;
        acl.rules.forEach(function (r) {
          if (r.remark || r.action !== 'permit') return;
          var p2 = p1.ok && ike ? phase2(state, dev, e, r, p1) : { ok: false };
          var c = (d.rt.ipsec && d.rt.ipsec[saKey(e, r)]) || { encaps: 0, decaps: 0 };
          out.sas.push({ iface: n, map: e.map, seq: e.seq, local: local ? local.ip : '', peer: e.peer, rule: r, up: p2.ok, encaps: c.encaps, decaps: c.decaps, spi: U.hash(dev + e.peer + r.seq) >>> 0, mtu: TUNNEL_MTU });
        });
      });
    });
    return out;
  }
  function clearCrypto(state, dev) {
    var d = state.devices[dev];
    d.rt.ike = {}; d.rt.ipsec = {}; d.rt.p2fail = {};
  }

  // Skickar ett paket från en enhet. Returnerar var det tog vägen.
  function send(state, D, fromDev, pkt, opts) {
    opts = opts || {};
    var hops = [];
    var loss = 0;
    var dev = fromDev, ingress = null;
    var d, i;
    pkt = { src: pkt.src, dst: pkt.dst, proto: pkt.proto || 'icmp', dport: pkt.dport, ttl: pkt.ttl || 64, count: pkt.count, natLocal: pkt.natLocal };
    for (var step = 0; step < 40; step++) {
      d = state.devices[dev];
      var egressEp = null, nh = null;
      if (d.kind === 'isp') {
        if (ingress && (pkt.dst === d.ip)) return { ok: true, at: dev, pkt: pkt, hops: hops, loss: loss };
        if (INTERNET[pkt.dst]) {
          hops.push({ dev: 'ISP', ip: d.ip });
          return { ok: true, at: 'INTERNET:' + pkt.dst, pkt: pkt, hops: hops, loss: loss };
        }
        if (U.isPrivate(pkt.dst)) return { ok: false, reason: 'drop', where: dev, hops: hops, loss: loss };
        if (ingress) hops.push({ dev: 'ISP', ip: d.ip });
        if (U.inNet(pkt.dst, '203.0.113.0', '255.255.255.0')) { egressEp = D.eps['E:ISP:nic']; nh = pkt.dst; }
        else return { ok: false, reason: 'drop', where: dev, hops: hops, loss: loss };
      } else if (isRouter(d)) {
        if (ingress) {
          var inIf = d.config.ifaces[ingress.iface];
          if (!aclCheck(state, dev, inIf.aclIn, pkt, 'in')) return { ok: false, reason: 'acl', where: dev, iface: ingress.iface, hops: hops, loss: loss, fromIp: ingress.ip };
          if (inIf.natDir === 'outside') {
            var tr = natLookupGlobal(state, dev, pkt.dst, pkt.natLocal);
            if (tr) pkt.dst = tr;
          }
          hops.push({ dev: dev, ip: ingress.ip });
        }
        if (routerOwns(D, dev, pkt.dst)) return { ok: true, at: dev, pkt: pkt, hops: hops, loss: loss, ingress: ingress };
        var rt = routeLookup(state, D, dev, pkt.dst);
        if (!rt) return { ok: false, reason: 'net-unreachable', where: dev, hops: hops, loss: loss, fromIp: ingress ? ingress.ip : null };
        pkt.ttl--;
        if (pkt.ttl <= 0) return { ok: false, reason: 'ttl', where: dev, hops: hops, loss: loss, fromIp: ingress ? ingress.ip : null };
        var outIf = d.config.ifaces[rt.iface];
        if (!ingress && !pkt.src) pkt.src = rt.ep.ip;
        if (!aclCheck(state, dev, outIf.aclOut, pkt, 'out')) return { ok: false, reason: 'acl', where: dev, iface: rt.iface, hops: hops, loss: loss, fromIp: ingress ? ingress.ip : null };
        if (ingress && d.config.ifaces[ingress.iface].natDir === 'inside' && outIf.natDir === 'outside') {
          var local0 = pkt.src;
          var g = natTranslate(state, dev, pkt, rt.iface, D);
          if (g) { pkt.src = g; pkt.natLocal = local0; }
        }
        // ip tcp adjust-mss på vägen: SYN-paketen skrivs om i båda riktningarna
        var mssIf = (ingress && d.config.ifaces[ingress.iface].adjustMss) || outIf.adjustMss;
        if (mssIf) pkt.mss = Math.min(pkt.mss || 65535, mssIf);
        if (outIf.cryptoMap) {
          var cm = cryptoMatch(state, dev, rt.iface, pkt);
          if (cm) {
            var tu = tunnelFor(state, D, dev, cm, pkt);
            if (!tu.ok) return { ok: false, reason: 'ipsec', ipsec: tu.reason, where: dev, hops: hops, loss: loss, fromIp: ingress ? ingress.ip : null };
            if (opts.size && opts.df && opts.size > TUNNEL_MTU) return { ok: false, reason: 'frag', mtu: TUNNEL_MTU, where: dev, hops: hops, loss: loss, fromIp: ingress ? ingress.ip : rt.ep.ip };
            pkt.tunnel = true;
            dev = tu.peerDev;
            ingress = tu.peerEp;
            continue;
          }
        }
        egressEp = rt.ep;
        nh = rt.nh || pkt.dst;
      } else {
        // Värd (eller switch som skickar från sitt drift-interface)
        var me = D.eps['E:' + dev + ':nic'];
        if (isSwitch(d)) {
          me = devEps(D, dev).filter(function (e) { return e.up; })[0] || null;
          if (me) me = { key: me.key, dev: me.dev, iface: me.iface, ip: me.ip, mask: me.mask, gw: d.config.defaultGateway, mac: me.mac, up: true };
          if (ingress) {
            if (devEps(D, dev).some(function (e) { return e.up && e.ip === pkt.dst; })) return { ok: true, at: dev, pkt: pkt, hops: hops, loss: loss };
            return { ok: false, reason: 'drop', where: dev, hops: hops, loss: loss };
          }
        }
        if (ingress) {
          if (me && me.ip === pkt.dst) return { ok: true, at: dev, pkt: pkt, hops: hops, loss: loss };
          return { ok: false, reason: 'drop', where: dev, hops: hops, loss: loss };
        }
        if (!me || !me.up) return { ok: false, reason: 'nolink', where: dev, hops: hops, loss: loss };
        if (!me.ip) return { ok: false, reason: 'noip', where: dev, hops: hops, loss: loss };
        if (pkt.dst === me.ip) return { ok: true, at: dev, pkt: pkt, hops: hops, loss: 0 };
        if (!pkt.src) pkt.src = me.ip;
        if (U.sameSubnet(pkt.dst, me.ip, me.mask)) nh = pkt.dst;
        else if (me.gw) nh = me.gw;
        else return { ok: false, reason: 'nogw', where: dev, hops: hops, loss: loss };
        egressEp = me;
      }
      // ARP i utgående segment
      var seg = D.comp[egressEp.key];
      if (seg === undefined) return { ok: false, reason: 'arp', where: dev, hops: hops, loss: loss, nh: nh, fromIp: egressEp.ip };
      var owner = arpOwner(state, D, seg, nh, egressEp.key);
      if (!owner) return { ok: false, reason: 'arp', where: dev, hops: hops, loss: loss, nh: nh, fromIp: egressEp.ip, local: dev === fromDev };
      if (opts.learnArp) learnArp(state, dev, egressEp, nh, owner);
      loss = 1 - (1 - loss) * (1 - l2Loss(state, D, egressEp.key, owner.key));
      if (state.devices[owner.dev].kind === 'hub') return { ok: false, reason: 'drop', hops: hops, loss: loss };
      dev = owner.dev;
      ingress = owner;
    }
    return { ok: false, reason: 'ttl', where: dev, hops: hops, loss: loss };
  }
  function learnArp(state, dev, ep, ip, owner) {
    var d = state.devices[dev];
    if (d.arp) d.arp[ip] = { mac: owner.mac, t: state.time };
  }
  function natLookupGlobal(state, dev, dst, natLocal) {
    var d = state.devices[dev];
    var st = d.config.nat.statics.filter(function (s) { return s.global === dst; })[0];
    if (st) return st.local;
    var tr = d.rt.natTrans.filter(function (t) { return t.global === dst && (!natLocal || t.local === natLocal); })[0];
    return tr ? tr.local : null;
  }
  // NAT-undantag: en deny-rad i NAT-listan som träffar (källa, mål) stoppar all översättning,
  // även den statiska (i IOS görs det med route-map, här räcker listan)
  function natExempt(state, dev, pkt) {
    var d = state.devices[dev];
    return d.config.nat.dynamic.some(function (r) {
      var acl = d.config.acls[r.acl];
      if (!acl || acl.type !== 'extended') return false;
      for (var i = 0; i < acl.rules.length; i++) {
        var x = acl.rules[i];
        if (x.remark) continue;
        if (aclMatch('extended', x, { src: pkt.src, dst: pkt.dst, proto: 'ip' })) return x.action === 'deny';
      }
      return false;
    });
  }
  function natTranslate(state, dev, pkt, egressIf, D) {
    var d = state.devices[dev];
    if (natExempt(state, dev, pkt)) return null;
    var st = d.config.nat.statics.filter(function (s) { return s.local === pkt.src; })[0];
    if (st) { addTrans(d, pkt, st.global, st.local, false); return st.global; }
    for (var i = 0; i < d.config.nat.dynamic.length; i++) {
      var r = d.config.nat.dynamic[i];
      if (r.iface !== egressIf) continue;
      if (!natMatchList(state, dev, r.acl, pkt.src, pkt.dst)) continue;
      var ep = epOf(D, dev, r.iface);
      if (!ep || !ep.ip) continue;
      if (!r.overload && d.rt.natTrans.some(function (t) { return t.global === ep.ip && t.local !== pkt.src; })) continue;
      addTrans(d, pkt, ep.ip, pkt.src, true);
      return ep.ip;
    }
    return null;
  }
  function addTrans(d, pkt, global, local, dyn) {
    var port = pkt.proto === 'icmp' ? (1 + (U.hash(local) % 50)) : 49152 + (U.hash(local + pkt.dst) % 16000);
    var exists = d.rt.natTrans.some(function (t) { return t.local === local && t.dst === pkt.dst && t.proto === pkt.proto; });
    if (!exists && dyn) d.rt.natTrans.push({ proto: pkt.proto, global: global, local: local, port: port, dst: pkt.dst, dport: pkt.dport || port });
    if (!dyn && !exists && pkt.proto !== 'icmp') d.rt.natTrans.push({ proto: pkt.proto, global: global, local: local, port: pkt.dport, dst: pkt.dst, dport: pkt.dport, fromStatic: true });
  }

  function listens(state, D, at, proto, dport) {
    if (proto === 'icmp') return true;
    if (at.indexOf('INTERNET:') === 0) {
      var h = INTERNET[at.slice(9)];
      return !!(h && ((dport === 53 && h.dns) || ((dport === 80 || dport === 443) && h.web)));
    }
    var d = state.devices[at];
    if (d.os === 'ios') {
      if (dport === 22) return !!sshEnabled(d) && vtyAllows(d, 'ssh');
      if (dport === 23) return vtyAllows(d, 'telnet');
      if (dport === 53) return !!d.config.dnsServer;
      if (dport === 67) return true;
      return false;
    }
    if (d.kind === 'wlc') return dport === 5246 || dport === 443 || dport === 22;
    if (d.kind === 'lb') return (dport === 80 && lbPool(d, null) !== null) || dport === 22 || dport === 443;
    if (d.services) {
      if ((dport === 80 || dport === 8080) && d.services.indexOf('http') >= 0) return true;
      if (dport === 445 && d.services.indexOf('smb') >= 0) return true;
      if (dport === 123 && d.services.indexOf('ntp') >= 0) return true;
      if (dport === 514 && d.services.indexOf('syslog') >= 0) return true;
      if (dport === 443 && d.services.indexOf('https') >= 0) return true;
      if (dport === 631 && d.kind === 'printer') return true;
    }
    return d.kind === 'printer' && dport === 9100;
  }
  function sshEnabled(d) {
    var c = d.config;
    return c.cryptoKey && c.hostname && c.hostname !== 'Router' && c.hostname !== 'Switch' && c.domainName ? (c.ssh.version || '1.99') : null;
  }
  function vtyAllows(d, what) {
    var l = d.config.lines;
    function ok(line) { return line.transport === 'all' || line.transport === what || (line.transport === 'telnet ssh' || line.transport === 'ssh telnet'); }
    return ok(l.vty0_4) || ok(l.vty5_15);
  }

  // Ping tur och retur. Returnerar resultat utan slump (loss anges separat).
  function pingInternal(state, D, fromDev, dst, opts) {
    opts = opts || {};
    var out = send(state, D, fromDev, { dst: dst, src: opts.src, proto: opts.proto || 'icmp', dport: opts.dport }, { learnArp: opts.learnArp, size: opts.size, df: opts.df });
    if (!out.ok) return { ok: false, reason: out.reason, where: out.where, fromIp: out.fromIp, hops: out.hops, local: out.local, iface: out.iface, mtu: out.mtu, ipsec: out.ipsec };
    if (!listens(state, D, out.at, opts.proto || 'icmp', opts.dport)) return { ok: false, reason: 'refused', at: out.at, hops: out.hops };
    // Svaret
    var rDev = out.at;
    var back;
    if (rDev.indexOf('INTERNET:') === 0) {
      back = sendFromInternet(state, D, out.pkt.dst, out.pkt.src, opts, out.pkt.natLocal);
    } else {
      back = send(state, D, rDev, { src: out.pkt.dst, dst: out.pkt.src, proto: opts.proto || 'icmp', natLocal: out.pkt.natLocal }, { learnArp: opts.learnArp });
    }
    if (!back.ok) return { ok: false, reason: 'noreply', back: back, hops: out.hops, at: out.at };
    var loss = 1 - (1 - out.loss) * (1 - back.loss);
    var ttl = 128;
    if (rDev.indexOf('INTERNET:') === 0) ttl = 56 - out.hops.length;
    else { var rd = state.devices[rDev]; ttl = (rd.os === 'ios' ? 255 : (rd.os === 'linux' ? 64 : 128)) - out.hops.filter(function (h) { return h.dev !== rDev; }).length; }
    return { ok: true, loss: loss, hops: out.hops, at: out.at, ttl: ttl, replyFrom: out.pkt.dst, srcUsed: out.pkt.src,
      tunnel: !!(out.pkt.tunnel || (back.pkt && back.pkt.tunnel)), mss: Math.min(out.pkt.mss || 65535, (back.pkt && back.pkt.mss) || 65535) };
  }

  // Stor TCP-överföring (filkopiering, webbsida). Genom en tunnel utan adjust-mss
  // fastnar de fulla paketen: handskakningen går igenom men överföringen hänger.
  function bigTransfer(state, fromDev, dst, dport) {
    var D = get(state);
    var r = pingInternal(state, D, fromDev, dst, { proto: 'tcp', dport: dport, learnArp: true });
    if (!r.ok) return { ok: false, stage: 'connect', res: r };
    if (r.tunnel && r.mss > TUNNEL_MTU - 40) return { ok: false, stage: 'transfer', res: r, mtu: TUNNEL_MTU };
    return { ok: true, res: r };
  }

  // ---------------------------------------------------------------- Lastbalanserare
  function lbPool(d, vip) {
    if (!d || !d.lb) return null;
    var names = Object.keys(d.lb.pools);
    for (var i = 0; i < names.length; i++) {
      var p = d.lb.pools[names[i]];
      if (!vip || p.vip === vip) return p;
    }
    return null;
  }
  function lbMemberUp(state, D, lbId, pool, m) {
    if (!m.enabled) return false;
    if (pool.monitor === 'icmp') return pingInternal(state, D, lbId, m.ip, {}).ok;
    return pingInternal(state, D, lbId, m.ip, { proto: 'tcp', dport: m.port }).ok;
  }
  function lbStatus(state, lbId) {
    var D = get(state);
    var d = state.devices[lbId];
    var out = [];
    Object.keys(d.lb.pools).forEach(function (n) {
      var p = d.lb.pools[n];
      out.push({ name: n, pool: p, members: p.members.map(function (m) {
        var st = d.lb.stats[m.ip] || { req: 0, fail: 0 };
        return { m: m, up: lbMemberUp(state, D, lbId, p, m), req: st.req, fail: st.fail };
      }) });
    });
    return out;
  }
  // En HTTP-förfrågan från en klient till en adress. Går den till en lastbalanserare
  // väljs en server med round robin bland dem som hälsokontrollen säger är uppe.
  function httpGet(state, fromDev, ip, port) {
    var D = get(state);
    port = port || 80;
    var r = pingInternal(state, D, fromDev, ip, { proto: 'tcp', dport: port, learnArp: true });
    if (!r.ok) return { ok: false, code: 0, res: r };
    var d = state.devices[r.at];
    if (!d || d.kind !== 'lb') return { ok: true, code: 200, server: r.at, res: r };
    var pool = lbPool(d, r.replyFrom) || lbPool(d, null);
    var up = pool.members.filter(function (m) { return lbMemberUp(state, D, d.id, pool, m); });
    if (!up.length) return { ok: false, code: 503, via: d.id, res: r };
    var m = up[d.lb.rr % up.length];
    d.lb.rr = (d.lb.rr + 1) % 1000;
    var s = d.lb.stats[m.ip] = d.lb.stats[m.ip] || { req: 0, fail: 0 };
    s.req++;
    var r2 = pingInternal(state, D, d.id, m.ip, { proto: 'tcp', dport: m.port });
    if (!r2.ok) { s.fail++; return { ok: false, code: 502, via: d.id, member: m, res: r }; }
    return { ok: true, code: 200, via: d.id, member: m, server: r2.at, res: r };
  }
  function sendFromInternet(state, D, src, dst, opts, natLocal) {
    // Internet skickar tillbaka via operatören
    if (U.isPrivate(dst)) return { ok: false, reason: 'drop', loss: 0 };
    var isp = state.devices['ISP'];
    var ep = D.eps['E:ISP:nic'];
    if (!ep || !ep.up) return { ok: false, reason: 'drop', loss: 0 };
    var seg = D.comp[ep.key];
    var owner = arpOwner(state, D, seg, dst, ep.key);
    if (!owner) return { ok: false, reason: 'drop', loss: 0 };
    // Fortsätt in i routern som om paketet kom in där
    var sub = sendIngress(state, D, owner, { src: src, dst: dst, proto: opts.proto || 'icmp', ttl: 60, natLocal: natLocal });
    return sub;
  }
  function sendIngress(state, D, ingressEp, pkt) {
    // Liten variant av send som börjar med ett paket som redan anlänt till en enhet
    var fake = { dev: ingressEp.dev };
    var d = state.devices[fake.dev];
    if (!isRouter(d)) {
      return { ok: ingressEp.ip === pkt.dst, loss: 0 };
    }
    var inIf = d.config.ifaces[ingressEp.iface];
    if (!aclCheck(state, fake.dev, inIf.aclIn, pkt, 'in')) return { ok: false, reason: 'acl', loss: 0 };
    if (inIf.natDir === 'outside') {
      var tr = natLookupGlobal(state, fake.dev, pkt.dst, pkt.natLocal);
      if (tr) pkt.dst = tr;
    }
    if (routerOwns(D, fake.dev, pkt.dst)) return { ok: true, loss: 0 };
    var rt = routeLookup(state, D, fake.dev, pkt.dst);
    if (!rt) return { ok: false, reason: 'net-unreachable', loss: 0 };
    var outIf = d.config.ifaces[rt.iface];
    if (!aclCheck(state, fake.dev, outIf.aclOut, pkt, 'out')) return { ok: false, reason: 'acl', loss: 0 };
    var nh = rt.nh || pkt.dst;
    var seg = D.comp[rt.ep.key];
    var owner = arpOwner(state, D, seg, nh, rt.ep.key);
    if (!owner) return { ok: false, reason: 'arp', loss: 0 };
    var loss = l2Loss(state, D, rt.ep.key, owner.key);
    if (state.devices[owner.dev].kind === 'hub') return { ok: false, loss: 0 };
    if (owner.ip === pkt.dst && !isRouter(state.devices[owner.dev])) return { ok: true, loss: loss };
    var more = sendIngress(state, D, owner, pkt);
    return { ok: more.ok, loss: 1 - (1 - loss) * (1 - (more.loss || 0)), reason: more.reason };
  }

  function ping(state, fromDev, dst, opts) {
    var D = get(state);
    opts = opts || {};
    opts.learnArp = true;
    return pingInternal(state, D, fromDev, dst, opts);
  }
  function traceroute(state, fromDev, dst, src) {
    var D = get(state);
    var out = send(state, D, fromDev, { dst: dst, src: src }, {});
    var r = pingInternal(state, D, fromDev, dst, { src: src });
    return { forward: out, full: r };
  }

  // ---------------------------------------------------------------- DHCP
  function dhcp(state, hostId) {
    var D = get(state);
    var h = state.devices[hostId];
    var me = D.eps['E:' + hostId + ':nic'];
    function apipa() {
      var x = U.hash(h.nic.mac);
      return { ip: '169.254.' + (1 + (x % 254)) + '.' + (1 + ((x >> 8) % 254)), mask: '255.255.0.0', gw: null, dns: [], apipa: true };
    }
    if (!me || !me.up) { h.lease = apipa(); h.lease.nolink = true; touch(state); return h.lease; }
    var seg = D.comp[me.key];
    var servers = (D.bySeg[seg] || []).filter(function (e) { return e.up && isRouter(state.devices[e.dev]); });
    var chainLoss = l2Loss(state, D, me.key, servers.length ? servers[0].key : me.key);
    if (chainLoss >= 1) servers = [];
    for (var i = 0; i < servers.length; i++) {
      var s = servers[i];
      var r = state.devices[s.dev];
      var inIf = r.config.ifaces[s.iface];
      if (!aclCheck(state, r.id, inIf.aclIn, { src: '0.0.0.0', dst: '255.255.255.255', proto: 'udp', dport: 67 }, 'in')) continue;
      var poolName = Object.keys(r.config.dhcpPools).filter(function (p) {
        var pl = r.config.dhcpPools[p];
        return pl.network && U.inNet(s.ip, pl.network, pl.mask);
      })[0];
      if (!poolName) continue;
      var pool = r.config.dhcpPools[poolName];
      var ip = allocate(state, D, r, pool, poolName, h, seg);
      if (!ip) {
        pushLog(state, r, '%DHCPD-4-NO_FREE_ADDRESS: No free address in pool ' + poolName + ' for client ' + U.macDots(h.nic.mac) + '.');
        continue;
      }
      h.lease = { ip: ip, mask: pool.mask, gw: pool.defaultRouter[0] || null, dns: pool.dns.slice(), server: s.ip, pool: poolName, obtained: state.time };
      touch(state);
      return h.lease;
    }
    h.lease = apipa();
    touch(state);
    return h.lease;
  }
  function excluded(r, ip) {
    return r.config.dhcpExcluded.some(function (x) {
      var n = U.ipToInt(ip);
      return n >= U.ipToInt(x[0]) && n <= U.ipToInt(x[1] || x[0]);
    });
  }
  function allocate(state, D, r, pool, poolName, h, seg) {
    var b = r.rt.dhcpBindings;
    for (var ip in b) if (b[ip].mac === h.nic.mac && b[ip].pool === poolName && U.inNet(ip, pool.network, pool.mask)) return ip;
    var net = U.ipToInt(U.network(pool.network, pool.mask));
    var bc = U.ipToInt(U.broadcast(pool.network, pool.mask));
    for (var n = net + 1; n < bc; n++) {
      var cand = U.intToIp(n);
      if (excluded(r, cand)) continue;
      if (b[cand]) continue;
      if (devEps(D, r.id).some(function (e) { return e.ip === cand; })) continue;
      var inUse = (D.bySeg[seg] || []).some(function (e) { return e.up && e.ip === cand && e.dev !== h.id; });
      if (inUse) {
        b[cand] = { mac: null, pool: poolName, conflict: true, t: state.time };
        pushLog(state, r, '%DHCPD-4-PING_CONFLICT: DHCP address conflict:  server pinged ' + cand + '.');
        continue;
      }
      b[cand] = { mac: h.nic.mac, pool: poolName, t: state.time, host: h.id };
      return cand;
    }
    return null;
  }
  function release(state, hostId) {
    var h = state.devices[hostId];
    Object.keys(state.devices).forEach(function (id) {
      var d = state.devices[id];
      if (!isRouter(d)) return;
      Object.keys(d.rt.dhcpBindings).forEach(function (ip) { if (d.rt.dhcpBindings[ip].mac === h.nic.mac) delete d.rt.dhcpBindings[ip]; });
    });
    h.lease = null;
    touch(state);
  }

  // ---------------------------------------------------------------- DNS
  function resolve(state, hostId, name) {
    name = name.toLowerCase();
    if (U.isIp(name)) return { ip: name };
    var D = get(state);
    var h = state.devices[hostId];
    var dnsList;
    if (h.os === 'ios') {
      if (h.config.hosts[name]) return { ip: h.config.hosts[name] };
      if (!h.config.domainLookup) return { error: 'nolookup' };
      dnsList = h.config.nameServers;
      if (!dnsList.length) dnsList = ['255.255.255.255'];
    } else {
      var conf = hostIpConf(h);
      dnsList = conf && conf.dns ? conf.dns : [];
    }
    if (!dnsList.length) return { error: 'noserver' };
    for (var i = 0; i < dnsList.length; i++) {
      var srv = dnsList[i];
      var r = pingInternal(state, D, hostId, srv, { proto: 'udp', dport: 53 });
      if (!r.ok) continue;
      var at = r.at;
      if (at.indexOf('INTERNET:') === 0) {
        var ip = PUBLIC_DNS[name];
        return ip ? { ip: ip, server: srv } : { error: 'nxdomain', server: srv };
      }
      var sd = state.devices[at];
      if (sd.os === 'ios' && sd.config.dnsServer) {
        var short = name.replace(/\.nordvik\.example$/, '');
        if (sd.config.hosts[short]) return { ip: sd.config.hosts[short], server: srv };
        if (sd.config.domainLookup && sd.config.nameServers.length) {
          var f = pingInternal(state, D, sd.id, sd.config.nameServers[0], { proto: 'udp', dport: 53 });
          if (f.ok) {
            var ip2 = PUBLIC_DNS[name];
            return ip2 ? { ip: ip2, server: srv } : { error: 'nxdomain', server: srv };
          }
          return { error: 'servfail', server: srv };
        }
        return { error: 'nxdomain', server: srv };
      }
    }
    return { error: 'timeout', server: dnsList[0] };
  }

  // ---------------------------------------------------------------- Klocka och loggar
  var START = Date.UTC(2026, 8, 29, 6, 0, 0); // 08:00 svensk tid (CEST)
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function two(n) { return (n < 10 ? '0' : '') + n; }
  function three(n) { return (n < 10 ? '00' : n < 100 ? '0' : '') + n; }
  function ntpSynced(state, d) {
    if (!d.config.ntpServers.length) return false;
    var cacheKey = '_ntp_' + d.id;
    if (state._D && state._D[cacheKey] !== undefined) return state._D[cacheKey];
    var srcIf = d.config.ntpSource && d.config.ifaces[d.config.ntpSource];
    var ok = pingInternal(state, get(state), d.id, d.config.ntpServers[0], { proto: 'udp', dport: 123, src: srcIf && srcIf.ip ? srcIf.ip.addr : undefined }).ok;
    state._D[cacheKey] = ok;
    return ok;
  }
  function deviceClock(state, d) {
    var synced = d.os === 'ios' ? ntpSynced(state, d) : true;
    var ms;
    if (synced) ms = START + state.time * 1000 + 2 * 3600 * 1000;
    else if (d.rt && d.rt.clockSet) ms = d.rt.clockSet.ms + (state.time - d.rt.clockSet.at) * 1000;
    else ms = Date.UTC(1993, 2, 1, 0, 0, 0) + (state.time - d.rt.bootTime) * 1000;
    var t = new Date(ms);
    return {
      synced: synced, date: t,
      mon: MON[t.getUTCMonth()], day: t.getUTCDate(), dow: DAY[t.getUTCDay()], year: t.getUTCFullYear(),
      hms: two(t.getUTCHours()) + ':' + two(t.getUTCMinutes()) + ':' + two(t.getUTCSeconds()), ms: three((t.getUTCMilliseconds() + (typeof Date !== 'undefined' ? Date.now() : 0)) % 1000),
    };
  }
  function stamp(state, d) {
    if (!d.config.timestampsMsec) {
      var up = Math.max(0, Math.floor(state.time - d.rt.bootTime));
      var dd = Math.floor(up / 86400), hh = Math.floor(up % 86400 / 3600), mm = Math.floor(up % 3600 / 60), ss = up % 60;
      return dd > 0 ? dd + 'd' + two(hh) + 'h' : two(hh) + ':' + two(mm) + ':' + two(ss);
    }
    var c = deviceClock(state, d);
    return (c.synced ? '' : '*') + c.mon + ' ' + (c.day < 10 ? ' ' : '') + c.day + ' ' + c.hms + '.' + c.ms;
  }
  function pushLog(state, d, msg) {
    if (!d || d.os !== 'ios') return;
    var line = stamp(state, d) + ': ' + msg;
    d.rt.logs.push(line);
    if (d.rt.logs.length > 400) d.rt.logs.shift();
    if (NV.onLog) NV.onLog(d.id, line);
  }

  // Jämför portstatus före och efter en ändring och skriver loggrader
  function statusOf(state, D, dev, port) {
    var d = state.devices[dev];
    var i = ifc(d, port);
    var p = D.ports[key(dev, port)];
    if (!i) return 'none';
    if (i.shutdown) return 'admin';
    if (d.rt.errdisabled[port]) return 'err';
    return p && p.up ? 'up' : 'down';
  }
  function refresh(state) {
    var before = state._portSnap || {};
    touch(state);
    var D = get(state);
    var snap = {};
    Object.keys(state.devices).forEach(function (id) {
      var d = state.devices[id];
      if (d.os !== 'ios') return;
      Object.keys(d.config.ifaces).forEach(function (n) {
        var i = d.config.ifaces[n];
        if (i.internal) return;
        var s;
        if (i.svi || i.parent) {
          var ep = D.eps['E:' + id + ':' + n];
          s = i.shutdown ? 'admin' : (ep && ep.up ? 'up' : 'down');
        } else s = statusOf(state, D, id, n);
        var k = key(id, n);
        snap[k] = s;
        var b = before[k];
        if (b === undefined || b === s) return;
        if (i.parent) return;
        var sh = n;
        if (s === 'up') {
          if (!i.svi) pushLog(state, d, '%LINK-3-UPDOWN: Interface ' + sh + ', changed state to up');
          pushLog(state, d, '%LINEPROTO-5-UPDOWN: Line protocol on Interface ' + sh + ', changed state to up');
        } else if (b === 'up') {
          pushLog(state, d, '%LINEPROTO-5-UPDOWN: Line protocol on Interface ' + sh + ', changed state to down');
          if (!i.svi) pushLog(state, d, s === 'admin' ? '%LINK-5-CHANGED: Interface ' + sh + ', changed state to administratively down' : '%LINK-3-UPDOWN: Interface ' + sh + ', changed state to down');
        } else if (s === 'admin' && b !== 'admin') {
          if (!i.svi) pushLog(state, d, '%LINK-5-CHANGED: Interface ' + sh + ', changed state to administratively down');
        }
      });
    });
    state._portSnap = snap;
    return D;
  }

  // Tiden går: räknare, flappande portar, periodiska loggar
  function tick(state, dt) {
    var prevT = state.time;
    state.time += dt;
    var D = get(state);
    var t = state.time;
    // Räknare
    Object.keys(D.ports).forEach(function (k) {
      var p = D.ports[k];
      var parts = k.split('|');
      var d = state.devices[parts[0]];
      if (!d || d.os !== 'ios') return;
      var c = d.rt.counters[parts[1]] = d.rt.counters[parts[1]] || { inp: 0, outp: 0, crc: 0, late: 0, runts: 0, coll: 0, flaps: 0 };
      if (!p.up) return;
      var rate = 40;
      if (Object.keys(D.storm).length) rate = 90000;
      c.inp += rate * dt * (0.8 + Math.random() * 0.4);
      c.outp += rate * dt * (0.8 + Math.random() * 0.4);
      if (p.mismatch) {
        if (p.neg && p.neg.duplex === 'half') { c.late += dt * 0.6; c.coll += dt * 2; }
        else { c.crc += dt * 1.1; c.runts += dt * 0.4; }
      }
      if (p.link.state === 'flapping') c.crc += dt * 0.2;
    });
    // Flappande kablar: länken går ner och upp
    state.links.forEach(function (l) {
      if (l.state !== 'flapping') return;
      var period = 23;
      if (Math.floor(prevT / period) !== Math.floor(t / period)) {
        [l.a, l.b].forEach(function (s) {
          var d = state.devices[s.dev];
          if (d.os !== 'ios' || d.config.ifaces[s.port].shutdown) return;
          pushLog(state, d, '%LINK-3-UPDOWN: Interface ' + s.port + ', changed state to down');
          pushLog(state, d, '%LINEPROTO-5-UPDOWN: Line protocol on Interface ' + s.port + ', changed state to down');
          pushLog(state, d, '%LINK-3-UPDOWN: Interface ' + s.port + ', changed state to up');
          pushLog(state, d, '%LINEPROTO-5-UPDOWN: Line protocol on Interface ' + s.port + ', changed state to up');
          var c = d.rt.counters[s.port]; if (c) c.flaps++;
        });
      }
    });
    // Periodiska meddelanden var 60:e sekund
    if (Math.floor(prevT / 60) !== Math.floor(t / 60)) {
      state.links.forEach(function (l) {
        var info = D.links[l.id];
        if (!info || !info.mismatch) return;
        var A = state.devices[l.a.dev], B = state.devices[l.b.dev];
        if (A.os === 'ios' && B.os === 'ios') {
          pushLog(state, A, '%CDP-4-DUPLEX_MISMATCH: duplex mismatch discovered on ' + l.a.port + ' (not ' + info.negA.duplex + ' duplex), with ' + B.config.hostname + ' ' + l.b.port + ' (' + info.negB.duplex + ' duplex).');
          pushLog(state, B, '%CDP-4-DUPLEX_MISMATCH: duplex mismatch discovered on ' + l.b.port + ' (not ' + info.negB.duplex + ' duplex), with ' + A.config.hostname + ' ' + l.a.port + ' (' + info.negA.duplex + ' duplex).');
        }
      });
      D.nativeMismatch.forEach(function (nm) {
        var A = state.devices[nm.a.dev], B = state.devices[nm.b.dev];
        pushLog(state, A, '%CDP-4-NATIVE_VLAN_MISMATCH: Native VLAN mismatch discovered on ' + nm.a.port + ' (' + nm.na + '), with ' + B.config.hostname + ' ' + nm.b.port + ' (' + nm.nb + ').');
        pushLog(state, A, '%SPANTREE-2-RECV_PVID_ERR: Received BPDU with inconsistent peer vlan id ' + nm.nb + ' on ' + nm.a.port + ' VLAN' + nm.na + '.');
        pushLog(state, A, '%SPANTREE-2-BLOCK_PVID_LOCAL: Blocking ' + nm.a.port + ' on VLAN' + pad4(nm.na) + '. Inconsistent local vlan.');
        pushLog(state, B, '%CDP-4-NATIVE_VLAN_MISMATCH: Native VLAN mismatch discovered on ' + nm.b.port + ' (' + nm.nb + '), with ' + A.config.hostname + ' ' + nm.a.port + ' (' + nm.na + ').');
        pushLog(state, B, '%SPANTREE-2-RECV_PVID_ERR: Received BPDU with inconsistent peer vlan id ' + nm.na + ' on ' + nm.b.port + ' VLAN' + nm.nb + '.');
      });
    }
    if (Math.floor(prevT / 7) !== Math.floor(t / 7)) {
      Object.keys(D.storm).forEach(function (v) {
        (D.storm[v] || []).forEach(function (id, idx) {
          if (idx > 1) return;
          var d = state.devices[id];
          var victim = state.devices['PC-Anna'];
          pushLog(state, d, '%SW_MATM-4-MACFLAP_NOTIF: Host ' + U.macDots(victim.nic.mac) + ' in vlan ' + v + ' is flapping between port Gi0/24 and port Gi0/25');
        });
      });
    }
  }
  function pad4(n) { n = String(n); while (n.length < 4) n = '0' + n; return n; }

  // Trafikbelastning för övervakningsgrafen (Mbit/s)
  function linkLoad(state, dev, port) {
    var D = get(state);
    var p = D.ports[key(dev, port)];
    if (!p || !p.up) return 0;
    var storm = Object.keys(D.storm).length > 0;
    if (storm) return 940 + Math.random() * 50;
    if (p.link.state === 'flapping') {
      var ph = state.time % 23;
      if (ph < 2.5) return 0;
      return 30 + ph * 4 + Math.random() * 8;
    }
    var base = 60 + 40 * Math.sin(state.time / 40) + Math.random() * 20;
    if (p.mismatch) base *= 0.3;
    return base;
  }

  return {
    compute: compute, get: get, touch: touch, refresh: refresh, tick: tick,
    ping: ping, traceroute: traceroute, dhcp: dhcp, release: release, resolve: resolve,
    installedRoutes: installedRoutes, routeLookup: routeLookup, opMode: opMode, trunkVlans: trunkVlans,
    vlanExists: vlanExists, hostIpConf: hostIpConf, sshEnabled: sshEnabled, vtyAllows: vtyAllows,
    pushLog: pushLog, deviceClock: deviceClock, ntpSynced: ntpSynced, stamp: stamp, linkLoad: linkLoad,
    key: key, portNum: portNum, aclEval: aclEval, bridgeId: bridgeId, INTERNET: INTERNET, pingInternal: pingInternal, devEps: devEps,
    cryptoStatus: cryptoStatus, clearCrypto: clearCrypto, bigTransfer: bigTransfer, httpGet: httpGet, lbStatus: lbStatus, lbPool: lbPool,
    TUNNEL_MTU: TUNNEL_MTU, specNorm: specNorm, mirrors: mirrors,
  };
})();
