// Lastbalanseraren LB-Nordvik (enkel CLI i stil med HAProxy/F5, kapitel 10).
(function () {
  var U = NV.util, S = NV.sim;
  function res(out, extra) { var r = { out: out || '' }; for (var k in extra) r[k] = extra[k]; return r; }
  var MON = {
    icmp: 'icmp (ping mot servern)',
    tcp: 'tcp (anslutning till porten)',
    http: 'http (GET /status, väntar 200 OK)',
  };

  function LbSession(state, devId) {
    this.state = state; this.dev = state.devices[devId]; this.lb = this.dev.lb; this.closed = false;
    var self = this;
    this.pending = { prompt: 'login: ', fn: function () {
      self.pending = { prompt: 'Password: ', secret: true, fn: function () { return res('\nLB-Nordvik 4.2 (lastbalanserare för tidrapporteringen)\nSkriv help för kommandon.\n'); } };
      return res('');
    } };
  }
  var P = LbSession.prototype;
  P.prompt = function () { return this.lb.name + '# '; };
  P.promptText = function () { return this.pending ? this.pending.prompt : this.prompt(); };
  P.banner = function () { return '\nLB-Nordvik (192.168.1.13)\n'; };
  var HELP = [
    'show pool [namn]                      servrarna i poolen och hälsokontrollens svar',
    'show stats                            förfrågningar och fel per server',
    'show monitor                          vilken hälsokontroll poolen använder',
    'show running-config                   hela konfigurationen',
    'config pool <namn> monitor <icmp|tcp|http>',
    'config pool <namn> member <server> <enable|disable>',
    'clear stats                           nollställ räknarna',
    'save config                           spara (överlever omstart)',
    'logout                                avsluta',
  ];
  P.help = function () { return HELP.join('\n'); };
  P.complete = function (line) {
    var words = ['show pool', 'show stats', 'show monitor', 'show running-config', 'config pool TID-POOL monitor http', 'config pool TID-POOL member', 'clear stats', 'save config', 'logout'];
    var hit = words.filter(function (w) { return w.indexOf(line.trim()) === 0 && line.trim(); });
    return hit.length === 1 ? hit[0] + ' ' : null;
  };
  function changed(lb) { return JSON.stringify(lb.pools) !== JSON.stringify(lb.saved); }
  P.handle = function (line) {
    if (this.pending) { var p = this.pending; this.pending = null; return p.fn.call(this, line.trim()); }
    if (NV.onCommand) NV.onCommand(this.dev.id, line, 'lb', this);
    var a = line.trim().split(/\s+/).filter(Boolean);
    if (!a.length) return res('');
    var lb = this.lb, st = this.state;
    var c0 = a[0].toLowerCase();
    function m(word, full, min) { return !!word && word.length >= (min || 2) && full.indexOf(word.toLowerCase()) === 0; }
    if (c0 === '?' || m(c0, 'help')) return res(this.help());
    if (m(c0, 'logout') || m(c0, 'exit') || m(c0, 'quit')) {
      if (changed(lb)) {
        this.pending = { prompt: 'Det finns osparade ändringar. Spara nu? (y/N) ', fn: function (x) {
          if (/^y/i.test(x)) lb.saved = U.clone(lb.pools);
          return res('', { close: true });
        } };
        return res('');
      }
      return res('', { close: true });
    }
    if (m(c0, 'save') && m(a[1], 'config')) { lb.saved = U.clone(lb.pools); return res('Konfigurationen sparad.'); }
    if (m(c0, 'clear') && m(a[1], 'stats')) { lb.stats = {}; return res('Räknarna nollställda.'); }
    if (m(c0, 'show')) {
      var w = (a[1] || '').toLowerCase();
      if (m(w, 'pool', 1)) return res(this.showPool(a[2]));
      if (m(w, 'stats', 2)) return res(this.showStats());
      if (m(w, 'monitor', 1)) return res(this.showMonitor());
      if (m(w, 'running-config', 1)) return res(this.running());
      return res('% Okänt show-kommando. Prova: show pool, show stats, show monitor');
    }
    if (m(c0, 'config', 1)) {
      if (!m(a[1], 'pool', 1)) return res('% Använd: config pool <namn> monitor <icmp|tcp|http>');
      var pname = Object.keys(lb.pools).filter(function (n) { return n.toLowerCase() === (a[2] || '').toLowerCase(); })[0];
      if (!pname) return res('% Poolen "' + (a[2] || '') + '" finns inte. Pooler: ' + Object.keys(lb.pools).join(', '));
      var pool = lb.pools[pname];
      if (m(a[3], 'monitor', 1)) {
        var t = (a[4] || '').toLowerCase();
        if (!MON[t]) return res('% Hälsokontroll måste vara icmp, tcp eller http.');
        pool.monitor = t;
        S.touch(st);
        return res('Pool ' + pname + ': hälsokontroll ' + MON[t] + '.');
      }
      if (m(a[3], 'member', 1)) {
        var mem = pool.members.filter(function (x) { return x.name === (a[4] || '').toLowerCase() || x.ip === a[4]; })[0];
        if (!mem) return res('% Servern "' + (a[4] || '') + '" finns inte i ' + pname + '.');
        var op = (a[5] || '').toLowerCase();
        if (op !== 'enable' && op !== 'disable') return res('% Använd: config pool ' + pname + ' member ' + mem.name + ' <enable|disable>');
        mem.enabled = op === 'enable';
        S.touch(st);
        return res('Server ' + mem.name + ' ' + (mem.enabled ? 'aktiverad' : 'avaktiverad (får ingen trafik)') + '.');
      }
      return res('% Använd: config pool <namn> monitor <icmp|tcp|http>  |  config pool <namn> member <server> <enable|disable>');
    }
    return res('% Okänt kommando "' + a[0] + '". Skriv help.');
  };
  P.showPool = function (name) {
    var list = S.lbStatus(this.state, this.dev.id).filter(function (p) { return !name || p.name.toLowerCase() === name.toLowerCase(); });
    if (!list.length) return '% Poolen finns inte.';
    var o = [];
    list.forEach(function (p) {
      o.push('Pool ' + p.name + '   VIP ' + p.pool.vip + ':' + p.pool.port + '   metod ' + p.pool.method + '   hälsokontroll ' + p.pool.monitor);
      o.push('  Server    Adress              Admin     Hälsa   Förfr.   Fel');
      o.push('  --------  ------------------  --------  ------  -------  -----');
      p.members.forEach(function (x) {
        o.push('  ' + U.pad(x.m.name, 10) + U.pad(x.m.ip + ':' + x.m.port, 20) + U.pad(x.m.enabled ? 'enabled' : 'disabled', 10) + U.pad(!x.m.enabled ? '-' : (x.up ? 'UP' : 'DOWN'), 8) + U.padL(x.req, 7) + U.padL(x.fail, 7));
      });
      o.push('');
    });
    return o.join('\n');
  };
  P.showStats = function () {
    var o = ['Server    Förfrågningar  Fel   Felandel'];
    S.lbStatus(this.state, this.dev.id).forEach(function (p) {
      p.members.forEach(function (x) {
        o.push(U.pad(x.m.name, 10) + U.padL(x.req, 13) + U.padL(x.fail, 5) + U.padL(x.req ? Math.round(x.fail * 100 / x.req) + ' %' : '–', 11));
      });
    });
    return o.join('\n');
  };
  P.showMonitor = function () {
    var lb = this.lb;
    return Object.keys(lb.pools).map(function (n) {
      var p = lb.pools[n];
      return 'Pool ' + n + ': ' + MON[p.monitor] + ', var 5:e sekund, 3 missar = DOWN';
    }).join('\n');
  };
  P.running = function () {
    var lb = this.lb;
    var o = ['! LB-Nordvik', 'hostname ' + lb.name, 'interface eth0 address 192.168.1.13/26 gateway 192.168.1.1', '!'];
    Object.keys(lb.pools).forEach(function (n) {
      var p = lb.pools[n];
      o.push('pool ' + n, ' vip ' + p.vip + ' port ' + p.port, ' method ' + p.method, ' monitor ' + p.monitor + (p.monitor === 'http' ? ' path /status expect 200' : ''));
      p.members.forEach(function (m) { o.push(' member ' + m.name + ' ' + m.ip + ':' + m.port + (m.enabled ? '' : ' disabled')); });
      o.push('!');
    });
    return o.join('\n');
  };

  NV.LbSession = LbSession;
})();
