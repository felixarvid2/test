// Trådlösa controllern (AireOS-liknande CLI).
(function () {
  var U = NV.util, S = NV.sim;
  function res(out, extra) { var r = { out: out || '' }; for (var k in extra) r[k] = extra[k]; return r; }

  function WlcSession(state, devId) {
    this.state = state; this.dev = state.devices[devId]; this.w = this.dev.wlc; this.closed = false; this.pending = null;
    this.stage = 'user';
    var self = this;
    this.pending = { prompt: 'User: ', fn: function (u) {
      self.pending = { prompt: 'Password:', secret: true, fn: function () { self.stage = 'ok'; return res(''); } };
      return res('');
    } };
  }
  var P = WlcSession.prototype;
  P.prompt = function () { return '(' + this.w.sysName + ') >'; };
  P.promptText = function () { return this.pending ? this.pending.prompt : this.prompt(); };
  P.banner = function () { return '\n(Cisco Controller)\nEnter User Name (or \'Recover-Config\' if this is a recovery)\n'; };
  P.help = function () {
    return ['config         Configure switch options and settings.', 'save           Save switch configurations.', 'show           Display switch options and settings.', 'logout         Exit this session.'].join('\n');
  };
  P.complete = function () { return null; };

  function joined(state) { return S.get(state).apJoined; }

  P.handle = function (line) {
    if (this.pending) { var p = this.pending; this.pending = null; return p.fn.call(this, line.trim()); }
    if (NV.onCommand) NV.onCommand(this.dev.id, line, 'wlc', this);
    var a = line.trim().split(/\s+/).filter(Boolean);
    if (!a.length) return res('');
    var w = this.w, st = this.state;
    var c0 = a[0].toLowerCase();
    function m(word, full) { return word && full.indexOf(word.toLowerCase()) === 0; }
    if (m(c0, 'logout') || m(c0, 'exit')) {
      var changed = JSON.stringify({ wlans: w.wlans, apChannels: w.apChannels }) !== JSON.stringify(w.saved);
      if (changed) {
        this.pending = { prompt: 'The system has unsaved changes.\nWould you like to save them now? (y/N) ', fn: function (x) {
          if (/^y/i.test(x)) w.saved = U.clone({ wlans: w.wlans, apChannels: w.apChannels });
          return res('', { close: true });
        } };
        return res('');
      }
      return res('', { close: true });
    }
    if (m(c0, 'save') && m(a[1], 'config')) {
      this.pending = { prompt: '\n\nAre you sure you want to save? (y/n) ', fn: function (x) {
        if (!/^y/i.test(x)) return res('');
        w.saved = U.clone({ wlans: w.wlans, apChannels: w.apChannels });
        return res('\n\nConfiguration Saved!');
      } };
      return res('');
    }
    if (m(c0, 'show')) {
      var t = a.slice(1).join(' ').toLowerCase();
      if (/^wl(an)?\s+s/.test(t)) return res(this.wlanSummary());
      if (/^wl(an)?\s+\d+/.test(t)) return res(this.wlanDetail(parseInt(a[2], 10)));
      if (/^int(erface)?\s+s/.test(t)) return res(this.ifSummary());
      if (/^ap\s+s/.test(t)) return res(this.apSummary());
      if (/^adv(anced)?\s+802\.11b\s+s/.test(t) || /^ap\s+ch/.test(t)) return res(this.channels());
      if (/^sys(info)?/.test(t)) return res('Manufacturer\'s Name.............................. Cisco Systems Inc.\nProduct Name..................................... Cisco Controller\nProduct Version.................................. 7.0.252.0\nSystem Name...................................... ' + w.sysName + '\nIP Address....................................... 192.168.1.196\nNumber of WLANs.................................. ' + Object.keys(w.wlans).length);
      return res('\nIncorrect usage. Use the \'?\' or <TAB> key to list commands.');
    }
    if (m(c0, 'config')) {
      var sub = (a[1] || '').toLowerCase();
      if (sub === 'wlan') {
        var op = (a[2] || '').toLowerCase();
        var id = parseInt(a[3], 10);
        var wl = w.wlans[id];
        if ((op === 'enable' || op === 'disable') && wl) { wl.enabled = op === 'enable'; S.touch(st); return res(''); }
        if (op === 'interface' && wl) {
          var ifn = a[4];
          if (!w.interfaces[ifn]) return res('\nInterface does not exist.');
          if (wl.enabled) return res('\nRequest failed: WLAN must be disabled before changing its interface.\n(Use "config wlan disable ' + id + '" first.)');
          wl.iface = ifn; S.touch(st);
          return res('');
        }
        if (!wl && id) return res('\nWLAN identifier is invalid.');
        return res('\nIncorrect usage. Use: config wlan {enable|disable} <id>  |  config wlan interface <id> <interface-name>');
      }
      if (sub === '802.11b' && (a[2] || '').toLowerCase() === 'channel' && (a[3] || '').toLowerCase() === 'ap') {
        var ap = a[4], ch = parseInt(a[5], 10);
        if (!w.apChannels.hasOwnProperty(ap)) return res('\nAP ' + ap + ' is not associated.');
        if (!(ch >= 1 && ch <= 13)) return res('\nInvalid channel. Channels 1-13 are allowed in regulatory domain -E.');
        w.apChannels[ap] = ch; S.touch(st);
        return res('');
      }
      return res('\nIncorrect usage. Use the \'?\' or <TAB> key to list commands.');
    }
    if (c0 === '?' || c0 === 'help') return res(this.help());
    return res('\nIncorrect usage. Use the \'?\' or <TAB> key to list commands.');
  };
  P.wlanSummary = function () {
    var w = this.w;
    var o = ['', 'Number of WLANs.................................. ' + Object.keys(w.wlans).length, '',
      'WLAN ID  WLAN Profile Name / SSID               Status    Interface Name        PMIPv6 Mobility',
      '-------  -------------------------------------  --------  --------------------  ---------------'];
    Object.keys(w.wlans).forEach(function (id) {
      var wl = w.wlans[id];
      o.push(U.pad(id, 9) + U.pad(wl.ssid + ' / ' + wl.ssid, 39) + U.pad(wl.enabled ? 'Enabled' : 'Disabled', 10) + U.pad(wl.iface, 22) + 'none');
    });
    return o.join('\n');
  };
  P.wlanDetail = function (id) {
    var wl = this.w.wlans[id];
    if (!wl) return '\nWLAN identifier is invalid.';
    var ifc = this.w.interfaces[wl.iface];
    return ['', 'WLAN Identifier.................................. ' + id, 'Profile Name..................................... ' + wl.ssid, 'Network Name (SSID).............................. ' + wl.ssid,
      'Status........................................... ' + (wl.enabled ? 'Enabled' : 'Disabled'), 'Interface........................................ ' + wl.iface,
      'VLAN............................................. ' + (ifc ? ifc.vlan : '?'), 'Security', '   802.11 Authentication:........................ Open System', '   Static WEP Keys............................... Disabled', '   Wi-Fi Protected Access (WPA/WPA2)............. Enabled'].join('\n');
  };
  P.ifSummary = function () {
    var w = this.w;
    var o = ['', 'Number of Interfaces.......................... ' + Object.keys(w.interfaces).length, '',
      'Interface Name                   Port Vlan Id  IP Address      Type    Ap Mgr Guest',
      '-------------------------------- ---- -------- --------------- ------- ------ -----'];
    Object.keys(w.interfaces).sort().forEach(function (n) {
      var i = w.interfaces[n];
      o.push(U.pad(n, 33) + U.pad('1', 5) + U.pad(i.vlan, 9) + U.pad(i.ip, 16) + U.pad(n === 'management' ? 'Static' : 'Dynamic', 8) + U.pad(n === 'management' ? 'Yes' : 'No', 7) + 'No');
    });
    return o.join('\n');
  };
  P.apSummary = function () {
    var st = this.state;
    var j = joined(st);
    var names = Object.keys(j).filter(function (a) { return j[a]; }).sort();
    var o = ['', 'Number of APs.................................... ' + names.length, '', 'Global AP User Name.............................. admin', '',
      'AP Name             Slots  AP Model              Ethernet MAC       Location          Country  IP Address       Clients',
      '------------------  -----  --------------------  -----------------  ----------------  -------  ---------------  -------'];
    names.forEach(function (n) {
      var d = st.devices[n];
      var clients = Object.keys(S.get(st).wifi).filter(function (c) { return S.get(st).wifi[c].ap === n; }).length;
      o.push(U.pad(n, 20) + U.pad('2', 7) + U.pad('AIR-CAP3702I-E-K9', 22) + U.pad(U.macColon(d.nic.mac), 19) + U.pad('Boras lager', 18) + U.pad('SE', 9) + U.pad(d.nic.static.ip, 17) + clients);
    });
    return o.join('\n');
  };
  P.channels = function () {
    var st = this.state, w = this.w;
    var j = joined(st);
    var o = ['Member RRM Information', 'AP Name            MAC Address        Slot   Admin   Oper    Channel   TxPower',
      '------------------ ------------------ ----- -------- ------- --------- -------'];
    Object.keys(w.apChannels).sort().forEach(function (n) {
      var d = st.devices[n];
      if (!j[n]) return;
      o.push(U.pad(n, 19) + U.pad(U.macColon(d.nic.mac), 19) + U.pad('0', 6) + U.pad('ENABLED', 9) + U.pad('UP', 8) + U.pad(String(w.apChannels[n]), 10) + '*1/8 (20 dBm)');
    });
    return o.join('\n');
  };

  NV.WlcSession = WlcSession;
})();
