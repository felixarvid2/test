// Spelet: knyter ihop simuleringen, 3D-världen, terminalen och gränssnittet.
(function () {
  var S = NV.sim, U = NV.util;
  var SAVE_KEY = 'krabba-passet.v1';

  function Game() {
    this.state = null;
    this.def = null;
    this.week = null;
    this.running = false;
    this.taskState = {};
    this.flags = {};
    this.cmdLog = [];
    this.consoles = {};
    this.consoleDev = null;
    this.prevUp = {};
    this.startedAt = 0;
    this.hintTotal = 0;
  }
  var G = Game.prototype;

  G.boot = function () {
    var self = this;
    // En tom värld att visa bakom menyn
    this.state = NV.levels.baseState(1);
    this.week = null;
    this.world = new NV.World(document.getElementById('view'), this);
    this.world.init();
    this.world.drawWhiteboard(null);
    this.terminal = new NV.Terminal(this, document.getElementById('terminal'));
    this.ui = new NV.UI(this);
    NV.onCommand = function (devId, line, mode, sess) { self.onCommand(devId, line, mode, sess); };
    NV.onHostCommand = function (id, line) { self.commands++; };
    NV.onReload = function (devId) { self.ui.toast(esc(self.state.devices[devId].config.hostname) + ' startar om…'); };
    NV.onTelnet = function () {};
    this.ui.showMenu();
    this.lastFrame = performance.now();
    requestAnimationFrame(function f(now) {
      var dt = Math.min(0.05, (now - self.lastFrame) / 1000);
      self.lastFrame = now;
      self.world.update(dt);
      self.ui.setHint(self.ui.captures() ? null : self.world.hover);
      requestAnimationFrame(f);
    });
    setInterval(function () { self.tick(); }, 1000);
  };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  G.speedFactor = function () { return 1; };

  // ------------------------------------------------------------------ Veckor
  G.startWeek = function (n) {
    var self = this;
    var r;
    if (n === 0) r = { state: NV.levels.baseState(9), def: null };
    else r = NV.levels.start(n);
    this.state = r.state;
    this.def = r.def;
    this.week = n;
    this.running = true;
    this.taskState = {};
    this.flags = {};
    this.cmdLog = [];
    this.consoles = {};
    this.consoleDev = null;
    this.commands = 0;
    this.startedAt = Date.now();
    this.prevUp = {};
    this.done = false;
    if (this.def) this.def.tasks.forEach(function (t) { self.taskState[t.id] = { fixed: false, reported: false, hints: 0, known: false, score: 0 }; });
    this.world.consoleTarget = null;
    this.world.buildCables();
    this.world.collectInteractables();
    this.world.drawWhiteboard(this.def);
    this.world.teleport(this.def && this.def.site === 'boras' ? 'boras' : 'gbg');
    this.snapshotUp();
    this.refreshMarkers();
    this.ui.renderHud();
    this.ui.briefing(true);
  };

  G.progress = function () {
    try { var p = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); p.weeks = p.weeks || {}; return p; } catch (e) { return { weeks: {} }; }
  };
  G.save = function () {};
  G.saveWeek = function (res) {
    var p = this.progress();
    var old = p.weeks[this.def.week];
    if (!old || res.stars >= old.stars) p.weeks[this.def.week] = { stars: res.stars, minutes: res.minutes };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(p)); } catch (e) { /* privat läge: inget sparas */ }
  };

  // ------------------------------------------------------------------ Klockan går
  G.tick = function () {
    if (!this.state) return;
    S.tick(this.state, 1);
    this.hostBehaviour();
    S.refresh(this.state);
    this.checkTasks();
    this.ui.renderHud();
  };
  G.snapshotUp = function () {
    var D = S.get(this.state), self = this;
    this.prevUp = {};
    Object.keys(this.state.devices).forEach(function (id) {
      var e = D.eps['E:' + id + ':nic'];
      if (e) self.prevUp[id] = !!e.up;
    });
  };
  // Windows ber om ny adress när kabeln kommer tillbaka, och försöker igen efter APIPA
  G.hostBehaviour = function () {
    var st = this.state, self = this;
    var D = S.get(st);
    var changed = false;
    Object.keys(st.devices).forEach(function (id) {
      var h = st.devices[id];
      if (!h.nic || !h.nic.dhcp) return;
      var e = D.eps['E:' + id + ':nic'];
      var up = !!(e && e.up);
      var was = self.prevUp[id];
      self.prevUp[id] = up;
      if (up && !was) { S.dhcp(st, id); changed = true; return; }
      if (up && h.lease && h.lease.apipa && Math.floor(st.time) % 20 === 0) { S.dhcp(st, id); changed = true; }
      if (up && !h.lease) { S.dhcp(st, id); changed = true; }
    });
    if (changed) S.touch(st);
  };

  G.checkTasks = function () {
    if (!this.def || this.done) return;
    var self = this;
    var st = this.state;
    this.def.tasks.forEach(function (t) {
      var s = self.taskState[t.id];
      if (s.fixed) return;
      var ok = false;
      try { ok = t.check(st, self.flags); } catch (e) { ok = false; }
      if (ok) {
        s.fixed = true; s.known = true;
        self.ui.toast('✔ <b>' + esc(t.title) + '</b> är löst! Skriv felrapporten med <b>F</b>.', 'good');
        self.refreshMarkers();
      }
    });
    var all = this.def.tasks.every(function (t) { return self.taskState[t.id].reported; });
    if (all && !this.done) {
      this.done = true;
      var res = this.result();
      this.saveWeek(res);
      setTimeout(function () { self.ui.weekDone(res); }, 900);
    }
  };
  G.result = function () {
    var self = this;
    var minutes = Math.max(1, Math.round((Date.now() - this.startedAt) / 60000));
    var hints = 0, rs = 0;
    this.def.tasks.forEach(function (t) { hints += self.taskState[t.id].hints; rs += self.taskState[t.id].score; });
    var max = this.def.tasks.length * 2;
    var stars = 1 + (rs >= max - 1 ? 1 : 0) + (hints <= 2 ? 1 : 0);
    return { minutes: minutes, hints: hints, reportScore: rs, reportMax: max, stars: stars, commands: this.commands };
  };
  G.submitReport = function (t, r) {
    var s = this.taskState[t.id];
    s.reported = true; s.score = r.score; s.report = r;
    this.refreshMarkers();
    this.ui.renderHud();
    this.checkTasks();
  };
  G.downloadReport = function () {
    var self = this;
    var lines = ['# Felrapport – vecka ' + this.def.week + ': ' + this.def.title, '', 'Krabba-passet i spelet. Datum: 2026-09-29.', ''];
    this.def.tasks.forEach(function (t, i) {
      var s = self.taskState[t.id];
      var r = s.report || {};
      lines.push('## Fel ' + (i + 1) + ': ' + t.title + (t.krabba ? ' (Krabba-fel)' : ' (ärende)'));
      lines.push('');
      lines.push('- **Vad vi såg:** ' + (r.saw || '').replace(/\n/g, ' '));
      lines.push('- **Vad vi trodde först:** ' + (r.first || '').replace(/\n/g, ' '));
      lines.push('- **Vad vi kontrollerade:**');
      (r.checked || '').split('\n').filter(Boolean).forEach(function (l) { lines.push('  - `' + l.replace(/`/g, '') + '`'); });
      lines.push('- **Vad felet var:** ' + (r.cause || ''));
      lines.push('- **Hur det skulle rättas:** ' + (r.fix || ''));
      lines.push('');
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'felrapport-vecka-' + this.def.week + '.md';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  G.refreshMarkers = function () {
    var self = this;
    var people = this.world.people;
    Object.keys(people).forEach(function (n) {
      var f = people[n];
      var tasks = self.def ? self.def.tasks.filter(function (t) { return t.npc === n; }) : [];
      var open = tasks.some(function (t) { return !self.taskState[t.id].fixed; });
      var fixed = tasks.length && tasks.every(function (t) { return self.taskState[t.id].reported; });
      f.marker.visible = open;
      f.done.visible = !open && !!fixed;
    });
  };

  // ------------------------------------------------------------------ Kommandon
  G.onCommand = function (devId, line, mode, sess) {
    this.commands++;
    if (devId === 'SW2' && /^\s*(do\s+)?sh\w*\s+sp/i.test(line)) this.flags.stpLooked = true;
  };
  G.logCommand = function (entry, line) {
    var where = entry.kind === 'win' ? (entry.session.h && entry.session.h.id) : (entry.dev ? (this.state.devices[entry.dev].config ? this.state.devices[entry.dev].config.hostname : entry.dev) : 'laptop');
    this.cmdLog.push({ where: where, dev: entry.dev || (entry.session.h && entry.session.h.id) || 'Tekniker', line: line, t: this.state.time });
    if (this.cmdLog.length > 400) this.cmdLog.shift();
  };
  G.commandsFor = function (t) {
    var rel = /^(show|sh|ping|tracert|traceroute|ipconfig|nslookup|arp|ssh|telnet|ip |resolvectl|config|conf|int|do )/i;
    return this.cmdLog.filter(function (c) { return rel.test(c.line.trim()); }).map(function (c) { return c.where + ': ' + c.line.trim(); });
  };
  G.afterCommand = function () {
    S.refresh(this.state);
    this.checkTasks();
    this.world.updateCables();
  };

  // Konsolsessioner lever kvar per enhet, precis som på riktig utrustning
  G.consoleSession = function (devId) {
    if (!this.consoles[devId]) {
      var d = this.state.devices[devId];
      this.consoles[devId] = d.kind === 'wlc' ? new NV.WlcSession(this.state, devId) : new NV.IosSession(this.state, devId, { via: 'console' });
    }
    return this.consoles[devId];
  };
  G.resetConsoleSession = function (devId) { delete this.consoles[devId]; };
  G.consoleTarget = function () { return this.world.consoleTarget; };
  G.onConsoleConnected = function (devId, garbled) {};
  G.onRemoteLogin = function (devId, via) {};
  G.openLaptop = function () { this.terminal.openLaptop(); };

  // ------------------------------------------------------------------ Interaktion i världen
  G.describe = function (i) {
    var st = this.state;
    switch (i.type) {
      case 'console': var d = st.devices[i.id]; return 'Koppla in konsolkabeln i ' + (d.config ? d.config.hostname : d.label || i.id);
      case 'laptop': return 'Använd laptopen';
      case 'pc': return 'Använd ' + (st.devices[i.id] ? st.devices[i.id].label : i.id);
      case 'npc': return 'Prata med ' + i.id;
      case 'travel': return i.label;
      case 'cable': var l = this.linkById(i.link); return l ? (l.state === 'unplugged' ? 'Sätt tillbaka kabeln ' : 'Dra ur kabeln ') + this.linkName(l) : '';
      case 'deskcable': return 'Titta på nätverkskabeln vid ' + (st.devices[i.id] ? st.devices[i.id].label : i.id);
      case 'miniswitch': return st.devices['Mini-switch'] ? 'Koppla bort den okända miniswitchen' : '';
      case 'phone': return 'Ta upp gästmobilen';
      case 'monitor': return 'Titta på övervakningen';
      case 'whiteboard': return 'Läs tavlan';
      case 'info': return i.label;
    }
    return '';
  };
  G.linkById = function (id) { return this.state.links.filter(function (l) { return l.id === id; })[0]; };
  G.linkName = function (l) {
    var st = this.state;
    function nm(s) { var d = st.devices[s.dev]; return (d && d.config ? d.config.hostname : s.dev) + (s.port !== 'nic' ? ' ' + U.shortIf(s.port) : ''); }
    return nm(l.a) + ' ↔ ' + nm(l.b);
  };
  G.onInteract = function (i) {
    var self = this, st = this.state;
    switch (i.type) {
      case 'console':
        this.world.consoleTarget = i.id;
        this.world.updateCables();
        var d = st.devices[i.id];
        this.ui.toast('Den ljusblå konsolkabeln sitter nu i <b>' + esc(d.config ? d.config.hostname : 'WLC-Nordvik') + '</b>.');
        this.terminal.stack = [];
        this.terminal.openLaptop('sudo screen /dev/ttyUSB0 9600');
        break;
      case 'laptop': this.terminal.openLaptop(); break;
      case 'pc': this.ui.pcDialog(i.id); break;
      case 'npc': this.ui.npcDialog(i.id); break;
      case 'travel':
        this.ui.fadeTo(function () { self.world.teleport(i.to); self.ui.toast(i.to === 'boras' ? 'Du är framme vid lagret i Borås.' : 'Tillbaka på huvudkontoret i Göteborg.'); });
        break;
      case 'cable':
        var l = this.linkById(i.link);
        if (!l) return;
        l.state = l.state === 'unplugged' ? 'ok' : 'unplugged';
        S.touch(st); S.refresh(st);
        this.world.updateCables();
        this.ui.toast((l.state === 'unplugged' ? 'Du drog ur kabeln ' : 'Du satte tillbaka kabeln ') + esc(this.linkName(l)) + '.');
        break;
      case 'deskcable':
        this.ui.showDialog({
          title: 'Nätverkskabeln', html: '<p>Kabeln från ' + esc(st.devices[i.id].label) + ' till golvuttaget. Den ser hel ut, men det syns inte alltid utanpå.</p><p class="muted">Lyser lampan vid uttaget? Grönt = länk.</p>',
          buttons: [{ label: 'Byt patchkabel', primary: true, onClick: function () { self.replaceCable(i.id); } }, { label: 'Låt den vara' }],
        });
        break;
      case 'miniswitch':
        if (NV.levels.removeMiniSwitch(st)) {
          S.refresh(st);
          this.world.buildCables();
          this.world.collectInteractables();
          this.ui.toast('Du kopplade bort miniswitchen och satte tillbaka gästlaptopens kabel direkt i uttaget.');
        }
        break;
      case 'phone': this.ui.phoneDialog(); break;
      case 'monitor': this.ui.monitorDialog(); break;
      case 'whiteboard': this.ui.briefing(false); break;
      case 'info': this.ui.toast(esc(i.label)); break;
    }
  };
  G.replaceCable = function (hostId) {
    var st = this.state;
    var l = st.links.filter(function (x) { return x.a.dev === hostId || x.b.dev === hostId; })[0];
    if (!l) return;
    var was = l.state;
    l.state = 'ok';
    S.touch(st); S.refresh(st);
    this.ui.toast(was === 'ok' ? 'Du bytte kabeln. Ingen skillnad – den gamla var hel.' : 'Du bytte patchkabeln hos ' + esc(st.devices[hostId].label) + '.');
  };

  window.addEventListener('load', function () {
    var g = new Game();
    NV.game = g;
    try { g.boot(); } catch (e) {
      document.getElementById('boot-error').textContent = 'Spelet kunde inte starta: ' + e.message + '. Kontrollera att webbläsaren stöder WebGL.';
      document.getElementById('boot-error').style.display = 'block';
      throw e;
    }
  });
})();
