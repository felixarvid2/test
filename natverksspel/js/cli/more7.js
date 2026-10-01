// Fler kommandon för den trådlösa kontrollern (WLC) och lastbalanseraren (version 7).
(function () {
  var U = NV.util, S = NV.sim;
  function res(out, extra) { var r = { out: out || '' }; for (var k in extra) r[k] = extra[k]; return r; }
  function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }

  // ------------------------------------------------------------------ WLC
  if (NV.WlcSession) {
    var Wp = NV.WlcSession.prototype, origW = Wp.handle;
    Wp.handle = function (line) {
      if (this.pending) return origW.call(this, line);
      var a = line.trim().split(/\s+/).filter(Boolean), st = this.state, w = this.w;
      var t = a.slice(1).join(' ').toLowerCase(), c0 = (a[0] || '').toLowerCase();
      var D = S.get(st), aps = Object.keys(D.apJoined || {});
      if (c0 === 'show' && /^client\s+s/.test(t)) {
        var rows = ['', 'Number of Clients................................ ', '', 'MAC Address       AP Name           Slot Status        WLAN  Auth Protocol         Port Wired Tunnel  Role', '----------------- ----------------- ---- ------------- ----- ---- ---------------- ---- ----- ------- --------'];
        var n = 0;
        Object.keys(st.devices).forEach(function (id) {
          var h = st.devices[id];
          if (!h.nic || !h.wireless) return;
          var conf = S.hostIpConf(h), wl = Object.keys(w.wlans).filter(function (k) { return w.wlans[k].ssid === h.ssid || (!h.ssid && w.wlans[k].enabled); })[0] || '1';
          var ap = aps.length ? aps[U.hash(id) % aps.length] : '-';
          n++;
          rows.push(pad(U.macColon(h.nic.mac), 18) + pad(ap, 18) + pad('1', 5) + pad(conf ? 'Associated' : 'Probing', 14) + pad(wl, 6) + pad('Yes', 5) + pad('802.11n(2.4 GHz)', 17) + pad('1', 5) + pad('No', 6) + pad('No', 8) + 'Local');
        });
        rows[1] += n;
        return res(rows.join('\n'));
      }
      if (c0 === 'show' && /^ap\s+config\s+general/.test(t)) {
        var apn = a[4];
        if (!apn || !st.devices[apn]) return res('\nCisco AP name is invalid.');
        var j = !!(D.apJoined || {})[apn];
        return res('\nCisco AP Name.................................... ' + apn + '\nCountry code..................................... SE  - Sweden\nAP Mode ......................................... Local\nAP Role ......................................... ' + (j ? 'Joined' : 'Not joined') + '\nIP Address Configuration......................... DHCP\nSwitch Port Number .............................. 1\nAP Model......................................... AIR-CAP3702I-E-K9\nPower Type/Mode.................................. PoE/Full Power\nChannel.......................................... ' + ((w.apChannels || {})[apn] || 'auto'));
      }
      if (c0 === 'show' && /^time/.test(t)) return res('\nTime............................................. ' + new Date(Date.UTC(2026, 8, 29, 8, 0, 0) + (st.time || 0) * 1000).toUTCString().replace('GMT', '') + '\nTimezone delta................................... 0:0\nNTP Servers\n    NTP Polling Interval.........................  3600\n     Index     NTP Key Index      NTP Server       Status\n    -------  ---------------------------------------------------\n       1              0            192.168.1.16     In Sync');
      if (c0 === 'show' && /^net(work)?\s+s/.test(t)) return res('\nRF-Network Name............................. Nordvik\nWeb Mode.................................... Disable\nSecure Web Mode............................. Enable\nSecure Shell (ssh).......................... Enable\nTelnet...................................... Disable\nEthernet Multicast Mode..................... Disable\nAP Join Priority............................ Disable');
      if (c0 === 'ping' && a[1]) {
        var p = S.ping(st, this.dev.id, a[1]);
        return res('\nSend count=3, Receive count=' + (p.ok ? 3 : 0) + ' from ' + a[1] + '\n', { delay: p.ok ? 600 : 2500 });
      }
      if (c0 === 'help' || c0 === '?') return res(origW.call(this, line).out + '\n\nFler show-kommandon: show client summary, show ap config general <ap>, show time, show network summary\nping <ip>');
      return origW.call(this, line);
    };
  }

  // ------------------------------------------------------------------ Lastbalanseraren
  if (NV.LbSession) {
    var Lp = NV.LbSession.prototype, origL = Lp.handle;
    Lp.handle = function (line) {
      if (this.pending) return origL.call(this, line);
      var a = line.trim().split(/\s+/).filter(Boolean), st = this.state, c0 = (a[0] || '').toLowerCase();
      if (c0 === 'show' && /^ver/i.test(a[1] || '')) return res('LB-Nordvik 4.2.1 (build 2026-03-11)\nModell: vLB-200, 2 vCPU, 4 GB\nUpptid: 41 dagar, 3 timmar\nLicens: 200 Mbit/s');
      if (c0 === 'show' && /^int/i.test(a[1] || '')) {
        var D = S.get(st), eps = Object.keys(D.eps).map(function (k) { return D.eps[k]; }).filter(function (e) { return e.dev === this.dev.id; }, this);
        return res('Interface  Adress            Status\n' + (eps.length ? eps.map(function (e) { return pad(e.iface === 'nic' ? 'eth0' : e.iface, 11) + pad(e.ip + '/' + U.maskToPrefix(e.mask), 18) + (e.up ? 'up' : 'down'); }).join('\n') : 'eth0       –                 down'));
      }
      if (c0 === 'ping' && a[1]) {
        var p = S.ping(st, this.dev.id, a[1]);
        return res(p.ok ? a[1] + ' svarar (' + (1 + p.hops.length) + ' ms)' : a[1] + ' svarar inte', { delay: p.ok ? 400 : 2000 });
      }
      var r = origL.call(this, line);
      if ((c0 === 'help' || c0 === '?') && r) r.out += '\nshow version             version och licens\nshow interfaces          lastbalanserarens egen adress\nping <ip>                testa om en server svarar';
      return r;
    };
  }
})();
