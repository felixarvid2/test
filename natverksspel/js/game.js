// Spelet: knyter ihop simuleringen, världen (3D eller 2D), terminalen och gränssnittet.
(function () {
  var S = NV.sim, U = NV.util;
  var SAVE_KEY = 'krabba-passet.v1';
  var RUN_KEY = 'krabba-passet.run';

  function Game() {
    this.state = null;
    this.def = null;
    this.week = null;
    this.running = false;
    this.taskState = {};
    this.flags = {};
    this.cmdLog = [];
    this.consoles = {};
    this.prevUp = {};
    this.startedAt = 0;
    this.worlds = {};
    this.mode = null;
    this.exam = false;
    this.commands = 0;
  }
  var G = Game.prototype;
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function hasWebGL() {
    try { var c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; }
  }

  G.boot = function () {
    var self = this;
    this.state = NV.levels.baseState(1);
    this.terminal = new NV.Terminal(this, document.getElementById('terminal'));
    this.ui = new NV.UI(this);
    this.webgl = hasWebGL();
    var mode = NV.settings.get('mode') || (this.webgl ? '3d' : '2d');
    if (mode === '3d' && !this.webgl) mode = '2d';
    this.setMode(mode, true);
    NV.onCommand = function (devId, line) { self.onCommand(devId, line); };
    NV.onHostCommand = function () { self.commands++; };
    NV.onReload = function (devId) { self.ui.toast(esc(self.state.devices[devId].config.hostname) + ' startar om…'); };
    NV.onTelnet = function () {};
    NV.onSetting = function (k) { if (self.world && self.world.applySettings) self.world.applySettings(); if (k === 'volume') NV.sfx.setVolume(NV.settings.get('volume')); };
    document.addEventListener('pointerdown', function () { NV.sfx.unlock(); }, { once: false });
    window.addEventListener('beforeunload', function () { self.saveRun(); });
    document.getElementById('loading').classList.add('hidden');
    this.ui.showMenu();
    this.lastFrame = performance.now();
    requestAnimationFrame(function f(now) {
      var dt = Math.min(0.05, (now - self.lastFrame) / 1000);
      self.lastFrame = now;
      // Ingen rendering när fliken är dold
      self.frameNo = (self.frameNo || 0) + 1;
      // Bakom ett fönster räcker det att rita världen var fjärde bildruta
      var covered = self.ui.captures();
      self.coverDt = (self.coverDt || 0) + dt;
      if (!document.hidden && self.world && (!covered || self.frameNo % 4 === 0)) {
        self.world.update(covered ? Math.min(0.2, self.coverDt) : dt);
        self.coverDt = 0;
        self.ui.setHint(self.ui.captures() ? null : self.world.hover, self.world.hoverDetail);
        self.ui.updateCompass();
      }
      requestAnimationFrame(f);
    });
    setInterval(function () { if (!document.hidden) self.tick(); }, 1000);
    setInterval(function () { self.saveRun(); }, 10000);
  };

  // Byt mellan 3D och 2D. Världen byggs första gången den behövs.
  G.setMode = function (mode, first) {
    var prevSite = this.world ? this.world.site : 'gbg';
    if (!this.worlds[mode]) {
      try {
        var w = mode === '3d' ? new NV.World(document.getElementById('view'), this) : new NV.World2D(document.getElementById('view2d'), this);
        this.world = w;
        w.init();
        this.worlds[mode] = w;
      } catch (e) {
        if (mode === '3d') { this.ui.toast('3D fungerar inte i den här webbläsaren. Spelet visas i 2D.', 'warn'); return this.setMode('2d', first); }
        throw e;
      }
    }
    var self = this;
    Object.keys(this.worlds).forEach(function (m) { self.worlds[m].setActive(m === mode); });
    this.world = this.worlds[mode];
    this.mode = mode;
    NV.settings.set('mode', mode);
    document.body.classList.toggle('mode-2d', mode === '2d');
    document.body.classList.toggle('mode-3d', mode === '3d');
    this.world.consoleTarget = this.consoleTargetId || null;
    this.world.buildCables();
    this.world.collectInteractables();
    this.world.drawWhiteboard(this.def);
    if (!first) this.world.teleport(prevSite);
    this.refreshMarkers();
  };

  // ------------------------------------------------------------------ Veckor
  G.startWeek = function (n, opts) {
    opts = opts || {};
    var self = this;
    var r;
    if (n === 0) r = { state: NV.levels.baseState(9), def: null };
    else r = NV.levels.start(n);
    this.state = r.state;
    this.def = r.def;
    this.week = n;
    this.exam = !!opts.exam;
    this.running = true;
    this.taskState = {};
    this.flags = {};
    this.cmdLog = [];
    this.consoles = {};
    this.consoleTargetId = null;
    this.commands = 0;
    this.startedAt = Date.now();
    this.prevUp = {};
    this.done = false;
    this.guideStep = (n === 1 && !NV.settings.get('tutorialDone') && !this.exam) ? 0 : -1;
    if (this.def) this.def.tasks.forEach(function (t) { self.taskState[t.id] = { fixed: false, reported: false, hints: 0, known: false, score: 0 }; });
    this.afterStateChange(this.def && this.def.site === 'boras' ? 'boras' : 'gbg');
    this.ui.renderHud();
    this.ui.briefing(true);
    NV.settings.remove(RUN_KEY);
  };
  G.afterStateChange = function (site) {
    this.world.consoleTarget = this.consoleTargetId;
    this.world.buildCables();
    this.world.collectInteractables();
    this.world.drawWhiteboard(this.def);
    this.world.teleport(site);
    this.snapshotUp();
    this.refreshMarkers();
  };

  // Autosparning av pågående vecka
  G.saveRun = function () {
    if (!this.running || !this.def || this.done) return;
    var st = JSON.stringify(this.state, function (k, v) { return k.charAt(0) === '_' ? undefined : v; });
    NV.settings.store(RUN_KEY, {
      week: this.week, exam: this.exam, state: st, taskState: this.taskState, flags: this.flags, cmdLog: this.cmdLog.slice(-200),
      elapsed: Date.now() - this.startedAt, console: this.consoleTargetId, site: this.world.site, commands: this.commands, savedAt: Date.now(),
    });
  };
  G.savedRun = function () { var r = NV.settings.store(RUN_KEY); return r && r.week ? r : null; };
  G.resumeRun = function () {
    var r = this.savedRun();
    if (!r) return;
    this.state = JSON.parse(r.state);
    S.touch(this.state);
    this.def = NV.levels.WEEKS.filter(function (w) { return w.week === r.week; })[0];
    this.week = r.week; this.exam = r.exam; this.running = true; this.done = false;
    this.taskState = r.taskState; this.flags = r.flags || {}; this.cmdLog = r.cmdLog || [];
    this.consoles = {}; this.consoleTargetId = r.console || null; this.commands = r.commands || 0;
    this.startedAt = Date.now() - (r.elapsed || 0);
    this.guideStep = -1;
    S.refresh(this.state);
    this.afterStateChange(r.site || 'gbg');
    this.ui.renderHud();
    this.ui.toast('Välkommen tillbaka! Vecka ' + r.week + ' fortsätter där du var.');
  };

  G.progress = function () {
    try { var p = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); p.weeks = p.weeks || {}; return p; } catch (e) { return { weeks: {} }; }
  };
  G.save = function () { this.saveRun(); };
  G.saveWeek = function (res) {
    var p = this.progress();
    var old = p.weeks[this.def.week] || {};
    var badges = (old.badges || []).slice();
    res.badges.forEach(function (b) { if (badges.indexOf(b) < 0) badges.push(b); });
    p.weeks[this.def.week] = {
      stars: Math.max(res.stars, old.stars || 0),
      minutes: old.minutes ? Math.min(old.minutes, res.minutes) : res.minutes,
      badges: badges,
    };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(p)); } catch (e) { /* privat läge: inget sparas */ }
    NV.settings.remove(RUN_KEY);
  };

  // ------------------------------------------------------------------ Klockan går
  G.tick = function () {
    if (!this.state) return;
    S.tick(this.state, 1);
    this.hostBehaviour();
    S.refresh(this.state);
    this.checkTasks();
    this.checkGuide();
    // Larm från övervakningen vid broadcaststorm när man är i serverrummet
    var D = S.get(this.state);
    if (Object.keys(D.storm).length && this.world.zone().name === 'Serverrummet' && Math.floor(this.state.time) % 3 === 0) NV.sfx.alarm();
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
        s.fixed = true; s.known = true; s.fixedAt = Date.now() - self.startedAt;
        NV.sfx.success();
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
  G.speedFactor = function () { return 1; };
  G.elapsed = function () { return this.running ? Date.now() - this.startedAt : 0; };
  G.result = function () {
    var self = this;
    var minutes = Math.max(1, Math.round((Date.now() - this.startedAt) / 60000));
    var hints = 0, rs = 0;
    this.def.tasks.forEach(function (t) { hints += self.taskState[t.id].hints; rs += self.taskState[t.id].score; });
    var max = this.def.tasks.length * 2;
    var stars = 1 + (rs >= max - 1 ? 1 : 0) + (hints <= 2 ? 1 : 0);
    var badges = [];
    if (hints === 0) badges.push('Utan ledtrådar');
    if (minutes <= 10) badges.push('Snabb tekniker');
    if (rs === max) badges.push('Felfria rapporter');
    if (this.exam) badges.push('Examen klarad');
    return { minutes: minutes, hints: hints, reportScore: rs, reportMax: max, stars: stars, commands: this.commands, badges: badges };
  };
  G.submitReport = function (t, r) {
    var s = this.taskState[t.id];
    s.reported = true; s.score = r.score; s.report = r;
    if (r.score === 2) NV.sfx.success(); else NV.sfx.fail();
    this.refreshMarkers();
    this.ui.renderHud();
    this.checkTasks();
  };
  G.reportMarkdown = function () {
    var self = this;
    var lines = ['# Felrapport – vecka ' + this.def.week + ': ' + this.def.title, '', 'Krabba-passet i spelet. Datum: 2026-09-29.', ''];
    this.def.tasks.forEach(function (t, i) {
      var s = self.taskState[t.id];
      if (!s.reported) return;
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
    return lines.join('\n');
  };
  G.downloadReport = function () {
    var blob = new Blob([this.reportMarkdown()], { type: 'text/markdown' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'felrapport-vecka-' + this.def.week + '.md';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  G.copyReport = function () { return this.ui.copyText(this.reportMarkdown()); };

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

  // ------------------------------------------------------------------ Guide och målpil
  var GUIDE = [
    ['Prata med Omar i fikarummet – följ pilen och tryck E.', function (g) { return g.taskState.v1k1 && g.taskState.v1k1.known; }],
    ['Gå till serverrummet och tryck E på SW-Nordvik-1 i Rack A.', function (g) { return g.consoleTargetId === 'SW1'; }],
    ['Kör kommandot som står i laptopen med Enter. Tryck sedan Enter igen för att väcka konsolen.', function (g) { return g.flags.consoleOpened; }],
    ['Skräptecken? Hastigheten stämmer inte. Ctrl+A K stänger, prova sudo screen /dev/ttyUSB0 19200. (L = ledtråd)', function (g) { return g.taskState.v1k1 && g.taskState.v1k1.fixed; }],
    ['Bra! Tryck F och skriv felrapporten.', function (g) { return g.taskState.v1k1 && g.taskState.v1k1.reported; }],
  ];
  G.guideText = function () { return this.guideStep >= 0 && this.guideStep < GUIDE.length ? GUIDE[this.guideStep][0] : null; };
  G.checkGuide = function () {
    if (this.guideStep < 0) return;
    while (this.guideStep < GUIDE.length && GUIDE[this.guideStep][1](this)) this.guideStep++;
    if (this.guideStep >= GUIDE.length) { this.guideStep = -1; NV.settings.set('tutorialDone', true); this.ui.toast('Guiden är klar. Resten klarar du själv – lycka till!', 'good'); }
  };
  // Var i världen ligger nästa mål?
  G.objective = function () {
    if (!this.def) return null;
    var A = this.world.builder.anchors;
    var cast = NV.people.CAST;
    var self = this;
    var rackOf = { SW1: A.rackA, SW2: A.rackA, R1: A.rackA, WLC: A.rackA, RB: A.borasRack, SWB: A.borasRack };
    var open = this.def.tasks.filter(function (t) { return !self.taskState[t.id].fixed; });
    if (!open.length) return null;
    var t = open[0];
    var s = this.taskState[t.id];
    var where, label;
    if (!s.known) {
      var c = cast[t.npc];
      if (c.desk) { var d = A.desks[c.desk]; where = { x: d.x, z: d.z + 0.8 }; } else where = { x: c.stand.x, z: c.stand.z };
      label = 'Prata med ' + t.npc;
    } else if (rackOf[t.target]) { where = { x: rackOf[t.target].x, z: rackOf[t.target].z + 0.9 }; label = t.title; }
    else if (A.desks[t.target]) { where = { x: A.desks[t.target].x, z: A.desks[t.target].z - 0.6 }; label = t.title; }
    else return null;
    var site = where.x > 50 ? 'boras' : 'gbg';
    if (site !== this.world.site) { where = site === 'boras' ? { x: 10.5, z: -9.4 } : { x: 89, z: 0 }; label = site === 'boras' ? 'Åk till Borås' : 'Åk till Göteborg'; }
    return { x: where.x, z: where.z, label: label };
  };

  // ------------------------------------------------------------------ Kommandon
  G.onCommand = function (devId, line) {
    this.commands++;
    if (devId === 'SW2' && /^\s*(do\s+)?sh\w*\s+sp/i.test(line)) this.flags.stpLooked = true;
  };
  G.logCommand = function (entry, line) {
    var where = entry.kind === 'win' ? (entry.session.h && entry.session.h.id) : (entry.dev ? (this.state.devices[entry.dev].config ? this.state.devices[entry.dev].config.hostname : entry.dev) : 'laptop');
    this.cmdLog.push({ where: where, dev: entry.dev || (entry.session.h && entry.session.h.id) || 'Tekniker', line: line, t: this.state.time });
    if (this.cmdLog.length > 400) this.cmdLog.shift();
  };
  G.commandsFor = function () {
    var rel = /^(show|sh|ping|tracert|traceroute|ipconfig|nslookup|arp|ssh|telnet|ip |resolvectl|config|conf|int|do |nc |route|test-net)/i;
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
  G.consoleTarget = function () { return this.consoleTargetId; };
  G.onConsoleConnected = function () { this.flags.consoleOpened = true; };
  G.onRemoteLogin = function () {};
  G.openLaptop = function () { this.terminal.openLaptop(); };
  G.connectConsole = function (id) {
    this.consoleTargetId = id;
    this.world.consoleTarget = id;
    this.world.updateCables();
    var d = this.state.devices[id];
    this.ui.toast('Den ljusblå konsolkabeln sitter nu i <b>' + esc(d.config ? d.config.hostname : 'WLC-Nordvik') + '</b>.');
    this.terminal.stack = [];
    this.terminal.openLaptop('sudo screen /dev/ttyUSB0 9600');
  };

  // ------------------------------------------------------------------ Interaktion i världen
  G.describe = function (i) {
    var st = this.state;
    switch (i.type) {
      case 'console': var d = st.devices[i.id]; return 'Koppla in konsolkabeln i ' + (d.config ? d.config.hostname : d.label || i.id);
      case 'rack': return 'Titta på ' + ({ A: 'Rack A (nät)', B: 'Rack B (servrar)', BO: 'lagrets rack' }[i.id] || 'racket');
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
  G.toggleLink = function (id) {
    var l = this.linkById(id);
    if (!l) return;
    var st = this.state;
    l.state = l.state === 'unplugged' ? 'ok' : 'unplugged';
    S.touch(st); S.refresh(st);
    this.world.updateCables();
    NV.sfx.click();
    this.ui.toast((l.state === 'unplugged' ? 'Du drog ur kabeln ' : 'Du satte tillbaka kabeln ') + esc(this.linkName(l)) + '.');
  };
  G.onInteract = function (i) {
    var self = this, st = this.state;
    NV.sfx.open();
    switch (i.type) {
      case 'console': this.connectConsole(i.id); break;
      case 'rack': this.ui.rackView(i.id); break;
      case 'laptop': this.terminal.openLaptop(); break;
      case 'pc': this.ui.pcDialog(i.id); break;
      case 'npc': this.ui.npcDialog(i.id); break;
      case 'travel':
        this.ui.fadeTo(function () { self.world.teleport(i.to); self.ui.toast(i.to === 'boras' ? 'Du är framme vid lagret i Borås.' : 'Tillbaka på huvudkontoret i Göteborg.'); });
        break;
      case 'cable': this.toggleLink(i.link); break;
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
      document.getElementById('loading').classList.add('hidden');
      document.getElementById('boot-error').textContent = 'Spelet kunde inte starta: ' + e.message + '.';
      document.getElementById('boot-error').style.display = 'block';
      throw e;
    }
  });
})();
