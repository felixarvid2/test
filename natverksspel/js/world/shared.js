// Delad visuell logik för 3D och 2D: lysdioder, övervakningsgraf och kartdata.
NV.shared = (function () {
  var S = NV.sim, SH = NV.iosShow;

  // Färg på en ports lysdiod, räknad ur simuleringen
  function ledFn(state, devId) {
    var D = S.get(state);
    var d = state.devices[devId];
    var storm = Object.keys(D.storm).some(function (v) { return D.storm[v].indexOf(devId) >= 0; });
    return function (port, t) {
      if (!d || !d.powered) return '#1d261f';
      if (d.os === 'ios') {
        var i = d.config.ifaces[port];
        if (!i) return '#1d261f';
        var ps = SH.portState(state, d, port);
        if (ps === 'err-disabled') return Math.floor(t * 2) % 2 ? '#ffb020' : '#3a2a10';
        if (ps !== 'connected' && ps !== 'inactive') return '#1d261f';
        var p = D.ports[S.key(devId, port)];
        if (p && p.link.state === 'flapping' && (state.time % 23) < 2.5) return '#1d261f';
        var blk = Object.keys(D.blocked).some(function (k) { return k.indexOf(devId + '|' + port + '#') === 0; });
        if (blk) {
          var allBlocked = S.opMode(state, devId, port) === 'trunk' && S.trunkVlans(d, i).every(function (v) { return D.blocked[S.key(devId, port) + '#' + v]; });
          if (allBlocked) return '#ffb020';
        }
        if (storm) return Math.floor(t * 7) % 2 ? '#3dff6a' : '#16301b';
        if (p && p.mismatch) return Math.random() < 0.5 ? '#ffb020' : '#3dff6a';
        return Math.random() < 0.18 ? '#1d4a26' : '#3dff6a';
      }
      var la = NV.model.linkAt(state, devId, 'nic');
      var up = la && D.links[la.link.id] && D.links[la.link.id].up;
      return up ? (Math.random() < 0.2 ? '#1d4a26' : '#3dff6a') : '#1d261f';
    };
  }

  // Beskrivning av en port för verktygstips: "Gi0/7 · Bo · connected · VLAN 20"
  function portInfo(state, devId, port) {
    var d = state.devices[devId];
    if (!d || d.os !== 'ios' || !d.config.ifaces[port]) return null;
    var i = d.config.ifaces[port];
    var st = SH.portState(state, d, port);
    var mode = d.kind === 'switch' ? (S.opMode(state, devId, port) === 'trunk' ? 'trunk' : 'VLAN ' + i.accessVlan) : (i.ip ? i.ip.addr : '');
    var D = S.get(state);
    var blk = Object.keys(D.blocked).filter(function (k) { return k.indexOf(devId + '|' + port + '#') === 0; }).map(function (k) { return D.blocked[k]; })[0];
    return NV.util.shortIf(port) + (i.description ? ' · ' + i.description : '') + ' · ' + st + (mode ? ' · ' + mode : '') + (blk ? ' · STP ' + blk : '');
  }

  // Övervakningsskärmen: fyra grafer och en statusrad
  var SERIES = [
    ['SW-Nordvik-1 Gi0/24 (trunk)', 'SW1', 'GigabitEthernet0/24'],
    ['SW-Nordvik-1 Gi0/6 (Karim)', 'SW1', 'GigabitEthernet0/6'],
    ['R-Nordvik-1 Gi0/1 (internet)', 'R1', 'GigabitEthernet0/1'],
    ['R-Nordvik-1 Gi0/2 (Borås)', 'R1', 'GigabitEthernet0/2'],
  ];
  function sampleMonitor(state, hist) {
    SERIES.forEach(function (s) {
      var h = hist[s[0]] = hist[s[0]] || [];
      h.push(S.linkLoad(state, s[1], s[2]));
      if (h.length > 180) h.shift();
    });
  }
  function drawMonitor(canvas, hist, state, t) {
    var g = canvas.getContext('2d');
    g.fillStyle = '#1b2430'; g.fillRect(0, 0, 1024, 576);
    g.fillStyle = '#e6edf3'; g.font = 'bold 26px "Segoe UI", sans-serif';
    g.fillText('Nordvik · Övervakning', 24, 40);
    g.font = '16px "Segoe UI", sans-serif'; g.fillStyle = '#8b98a5';
    g.fillText('Trafik senaste 3 minuterna (Mbit/s)', 24, 64);
    var D = S.get(state);
    var storm = Object.keys(D.storm).length > 0;
    SERIES.forEach(function (s, i) {
      var h = hist[s[0]] || [];
      var x0 = 24 + (i % 2) * 500, y0 = 80 + Math.floor(i / 2) * 215, w = 476, hh = 190;
      g.fillStyle = '#243040'; g.fillRect(x0, y0, w, hh);
      g.strokeStyle = '#2f3c4d'; g.lineWidth = 1;
      for (var k = 1; k < 4; k++) { g.beginPath(); g.moveTo(x0, y0 + k * hh / 4); g.lineTo(x0 + w, y0 + k * hh / 4); g.stroke(); }
      g.fillStyle = '#c9d4de'; g.font = '15px "Segoe UI", sans-serif'; g.fillText(s[0], x0 + 10, y0 + 22);
      g.beginPath();
      h.forEach(function (v, j) {
        var x = x0 + w - (h.length - 1 - j) * (w / 180);
        var y = y0 + hh - 8 - Math.min(1, v / 1000) * (hh - 40);
        if (j === 0) g.moveTo(x, y); else g.lineTo(x, y);
      });
      var last = h[h.length - 1] || 0;
      g.strokeStyle = last > 800 ? '#ff5a4f' : '#4fc3f7'; g.lineWidth = 2.5; g.stroke();
      g.fillStyle = last > 800 ? '#ff5a4f' : '#4fc3f7'; g.font = 'bold 16px monospace';
      g.fillText(last.toFixed(0) + ' Mbit/s', x0 + w - 130, y0 + 22);
    });
    // Statusrad: accesspunkter, NTP, loop
    var y = 530;
    var items = [];
    ['AP-Lager-1', 'AP-Lager-2', 'AP-Lager-3'].forEach(function (a) {
      var d = state.devices[a];
      items.push([a.replace('AP-Lager-', 'AP'), !d.powered ? 'bad' : (D.apJoined[a] ? 'ok' : 'warn')]);
    });
    ['SW1', 'SW2', 'R1'].forEach(function (id) { items.push(['NTP ' + state.devices[id].config.hostname.replace('Switch', 'SW?'), S.ntpSynced(state, state.devices[id]) ? 'ok' : 'warn']); });
    items.push(['Loop', storm ? 'bad' : 'ok']);
    var x = 24;
    g.font = '15px "Segoe UI", sans-serif';
    items.forEach(function (it) {
      var col = it[1] === 'ok' ? '#3fbf6f' : (it[1] === 'warn' ? '#f0b429' : '#ff5a4f');
      if (it[1] === 'bad' && Math.floor(t * 2) % 2) col = '#7a1f1a';
      g.fillStyle = col; g.beginPath(); g.arc(x + 7, y - 5, 7, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#c9d4de'; g.fillText(it[0], x + 20, y);
      x += g.measureText(it[0]).width + 44;
    });
    if (storm) { g.fillStyle = Math.floor(t * 2) % 2 ? '#ff5a4f' : '#7a1f1a'; g.font = 'bold 22px "Segoe UI", sans-serif'; g.fillText('LARM: trafiken i taket på flera portar', 520, 40); }
  }

  // Ljudnivå och placering för fläktbrus: närmaste rack
  function rackSpots(builder) {
    var A = builder.anchors;
    return [A.rackA, A.rackB, A.borasRack].filter(Boolean);
  }

  return { ledFn: ledFn, portInfo: portInfo, sampleMonitor: sampleMonitor, drawMonitor: drawMonitor, SERIES: SERIES, rackSpots: rackSpots };
})();
