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
    this.vac = { x: 5, z: 1.2, dir: 0.3, turn: 0, spin: 1 };
    NV.gfx.resolve();
    NV.touch.init(this);
    NV.applyA11y();
    if (NV.touch.active()) NV.career.stat('touch');
    // Mobiler startar i 2D (lättast att styra och snabbast), men 3D finns i menyn
    var mode = NV.settings.get('mode') || (this.webgl && !NV.gfx.isMobile() ? '3d' : '2d');
    if (mode === '3d' && !this.webgl) mode = '2d';
    this.setMode(mode, true);
    NV.onCommand = function (devId, line) { self.onCommand(devId, line); };
    NV.onHostCommand = function (id, line) { self.commands++; self.countCommand(line); };
    // Ping från terminalen syns som paket som färdas genom nätet
    var origPing = S.ping;
    S.ping = function (st, from, ip, opts) {
      var r = origPing.apply(S, arguments);
      if (self.cmdActive && st === self.state) self.onPing(from, ip, r, opts);
      return r;
    };
    NV.career.onUnlock = function (a) { self.ui.achievement(a); self.xp(50, 'Prestation', true); };
    NV.onReload = function (devId) { self.ui.toast(esc(self.state.devices[devId].config.hostname) + ' startar om…'); };
    NV.onTelnet = function () {};
    NV.onSetting = function (k) { if (self.world && self.world.applySettings) self.world.applySettings(); if (k === 'volume') NV.sfx.setVolume(NV.settings.get('volume')); };
    document.addEventListener('pointerdown', function () { NV.sfx.unlock(); }, { once: false });
    window.addEventListener('beforeunload', function () { self.saveRun(); });
    document.getElementById('loading').classList.add('hidden');
    if (NV.settings.get('resumeOnLoad') && this.savedRun()) { NV.settings.set('resumeOnLoad', false); this.resumeRun(); }
    else this.ui.showMenu();
    this.lastFrame = performance.now();
    requestAnimationFrame(function f(now) {
      // Tak för bildfrekvensen (sparar batteri och värme på äldre datorer)
      var cap = NV.settings.get('fpsCap') || (NV.gfx.p ? NV.gfx.p.fpsCap : 0);
      if (cap && now - self.lastFrame < 1000 / cap - 3) { requestAnimationFrame(f); return; }
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
      if (self.frameNo % 6 === 0) { NV.minimap.draw(self); NV.touch.tick(); NV.zoneBanner(self); }
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
    if (mode === '2d') this.ui.hidePause();
    this.terminal.applyTheme && this.terminal.open && this.terminal.applyTheme();
    document.body.classList.toggle('mode-3d', mode === '3d');
    this.world.consoleTarget = this.consoleTargetId || null;
    this.world.buildCables();
    this.world.collectInteractables();
    this.world.drawWhiteboard(this.def);
    if (!first) this.world.teleport(prevSite);
    if (this.world.setGoggles) this.world.setGoggles(!!this.goggles);
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
    this.combo = 0; this.lastFixAt = 0; this.lastProgress = Date.now(); this.nudges = 0; this.coffeeXp = false; this.boostUntil = 0; this.waypoint = null; this.weekXp = 0;
    this.difficulty = NV.settings.get('difficulty');
    if (this.def) this.def.tasks.forEach(function (t) { self.taskState[t.id] = { fixed: false, reported: false, hints: 0, known: false, score: 0 }; });
    this.weather = this.weatherFor(n);
    if (this.weather === 'rain') NV.career.stat('rainWeeks');
    this.afterStateChange(this.def && this.def.site === 'boras' ? 'boras' : 'gbg');
    this.spawnCrab();
    this.ui.renderHud();
    this.ui.briefing(true);
    NV.settings.remove(RUN_KEY);
  };
  // Vädret skiftar mellan veckorna (samma vecka har alltid samma väder)
  G.weatherFor = function (n) { return ['sun', 'clouds', 'rain', 'sun', 'rain', 'clouds', 'sun', 'rain', 'clouds', 'rain'][(n || 1) - 1] || 'sun'; };
  // Var i världen hör ett visst ärende hemma?
  G.taskSpot = function (t) {
    var A = this.world.builder.anchors, s = this.taskState[t.id];
    var rackOf = { SW1: A.rackA, SW2: A.rackA, R1: A.rackA, WLC: A.rackA, LB: A.rackA, RB: A.borasRack, SWB: A.borasRack };
    if (!s.known) { var c = NV.people.CAST[t.npc]; if (c.desk) { var d = A.desks[c.desk]; return { x: d.x, z: d.z + 0.9 }; } return { x: c.stand.x, z: c.stand.z + 0.8 }; }
    if (rackOf[t.target]) return { x: rackOf[t.target].x + (rackOf[t.target].x > 50 ? 1 : 0), z: rackOf[t.target].z + (rackOf[t.target].x > 50 ? 0 : 1) };
    if (A.desks[t.target]) return { x: A.desks[t.target].x, z: A.desks[t.target].z - 0.6 };
    return null;
  };
  G.afterStateChange = function (site) {
    if (this.world.setWeather) this.world.setWeather(this.def ? this.weather : 'sun');
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
      pos: { x: this.world.pos.x, z: this.world.pos.z, yaw: this.world.yaw || 0 }, weekXp: this.weekXp || 0, drafts: this.drafts || {}, weather: this.weather,
    });
    this.savedFlash = Date.now();
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
    this.combo = 0; this.lastFixAt = 0; this.lastProgress = Date.now(); this.nudges = 0; this.boostUntil = 0; this.waypoint = null;
    this.difficulty = NV.settings.get('difficulty');
    S.refresh(this.state);
    this.weekXp = r.weekXp || 0; this.drafts = r.drafts || {}; this.weather = r.weather || this.weatherFor(r.week);
    this.afterStateChange(r.site || 'gbg');
    // Tillbaka där du stod och åt det håll du tittade
    if (r.pos && !this.world.collides(r.pos.x, r.pos.z, 0.3)) { this.world.pos.x = r.pos.x; this.world.pos.z = r.pos.z; if (this.mode === '3d') { this.world.yaw = this.world.tYaw = r.pos.yaw; } }
    this.spawnCrab();
    this.ui.renderHud();
    this.ui.toast('Välkommen tillbaka! Vecka ' + r.week + ' fortsätter där du var.');
  };

  G.reloadKeepRun = function () {
    this.saveRun();
    NV.settings.set('resumeOnLoad', !!(this.running && this.def && !this.done));
    setTimeout(function () { location.reload(); }, 60);
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
    if (this.running) NV.career.stat('playSec', 1);
    this.nudge();
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
        NV.touch.buzz([30, 40, 60]);
        self.ui.toast('✔ <b>' + esc(t.title) + '</b> är löst! Skriv felrapporten med <b>F</b>.', 'good');
        self.onFixed(t, s);
        self.refreshMarkers();
      }
    });
    var all = this.def.tasks.every(function (t) { return self.taskState[t.id].reported; });
    if (all && !this.done) {
      this.done = true;
      var res = this.result();
      this.saveWeek(res);
      this.onWeekDone(res);
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
    NV.career.stat('reports');
    if (r.score === 2) { NV.career.stat('perfect'); this.xp(60, 'Helt rätt felrapport'); }
    else if (r.score === 1) this.xp(25, 'Felrapport');
    this.lastProgress = Date.now();
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
      var hard = NV.settings.get('difficulty') === 'hard';
      f.marker.visible = open && !hard;
      f.done.visible = !open && !!fixed;
      f.hasTicket = open;
      f.ringing = tasks.some(function (t) { return !self.taskState[t.id].known; });
      var mood = open ? 'open' : (fixed ? 'happy' : null);
      if (mood !== f.mood) { if (mood === 'happy' && f.mood === 'open' && self.world.thank) self.world.thank(n); f.mood = mood; f.happyDone = false; }
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
    if (this.waypoint) {
      var wp = this.waypoint;
      if ((wp.x > 50) === (this.world.site === 'boras')) {
        if (Math.hypot(wp.x - this.world.pos.x, wp.z - this.world.pos.z) < 1.5) { this.waypoint = null; this.ui.toast('Du är framme vid din markering.'); }
        else return { x: wp.x, z: wp.z, label: 'Din markering' };
      }
    }
    if (!this.def) return null;
    var A = this.world.builder.anchors;
    var cast = NV.people.CAST;
    var self = this;
    var rackOf = { SW1: A.rackA, SW2: A.rackA, R1: A.rackA, WLC: A.rackA, LB: A.rackA, RB: A.borasRack, SWB: A.borasRack };
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
    this.countCommand(line);
    if (devId === 'SW2' && /^\s*(do\s+)?sh\w*\s+sp/i.test(line)) this.flags.stpLooked = true;
  };
  G.logCommand = function (entry, line) {
    var where = entry.kind === 'win' ? (entry.session.h && entry.session.h.id) : (entry.dev ? (this.state.devices[entry.dev].config ? this.state.devices[entry.dev].config.hostname : entry.dev) : 'laptop');
    this.cmdLog.push({ where: where, dev: entry.dev || (entry.session.h && entry.session.h.id) || 'Tekniker', line: line, t: this.state.time });
    if (this.cmdLog.length > 400) this.cmdLog.shift();
  };
  G.commandsFor = function () {
    var rel = /^(show|sh|ping|tracert|traceroute|tracepath|ipconfig|nslookup|arp|ssh|telnet|ip |resolvectl|config|conf|int|do |nc |route|test-net|curl|wget|copy|for |crypto|clear crypto)/i;
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
      this.consoles[devId] = d.kind === 'wlc' ? new NV.WlcSession(this.state, devId) : (d.kind === 'lb' ? new NV.LbSession(this.state, devId) : new NV.IosSession(this.state, devId, { via: 'console' }));
    }
    return this.consoles[devId];
  };
  G.resetConsoleSession = function (devId) { delete this.consoles[devId]; };
  G.consoleTarget = function () { return this.consoleTargetId; };
  G.onConsoleConnected = function () { this.flags.consoleOpened = true; };
  G.onRemoteLogin = function () {};
  G.openLaptop = function () { this.terminal.openLaptop(); };
  G.connectConsole = function (id) {
    this.flags.touchedRack = true;
    this.consoleTargetId = id;
    this.world.consoleTarget = id;
    this.world.updateCables();
    if (this.world.consoleFx) this.world.consoleFx(id);
    var d = this.state.devices[id];
    this.ui.toast('Den ljusblå konsolkabeln sitter nu i <b>' + esc(d.config ? d.config.hostname : (d.kind === 'lb' ? 'LB-Nordvik' : 'WLC-Nordvik')) + '</b>.');
    this.terminal.stack = [];
    this.terminal.openLaptop('sudo screen /dev/ttyUSB0 9600');
  };

  // ------------------------------------------------------------------ Interaktion i världen
  G.describe = function (i) {
    var st = this.state;
    switch (i.type) {
      case 'console': var d = st.devices[i.id]; if (!d) return ''; return 'Koppla in konsolkabeln i ' + (d.config ? d.config.hostname : d.label || i.id);
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
      case 'coffee': return this.boosted() ? 'Du har redan fått kaffe (' + Math.ceil((this.boostUntil - Date.now()) / 1000) + ' s kvar)' : 'Ta en kopp kaffe';
      case 'water': return 'Ta ett glas vatten';
      case 'printer': return 'Skriv ut veckans ärendelista (192.168.1.11)';
      case 'vacuum': return 'Säg hej till dammsugarroboten';
      case 'crab': return 'Fånga Krabban!';
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
    NV.career.stat('cables');
    if (this.world.cableFx) this.world.cableFx(l);
    this.ui.toast((l.state === 'unplugged' ? 'Du drog ur kabeln ' : 'Du satte tillbaka kabeln ') + esc(this.linkName(l)) + '.');
  };
  G.onInteract = function (i) {
    var self = this, st = this.state;
    NV.sfx.open();
    switch (i.type) {
      case 'console': if (st.devices[i.id]) this.connectConsole(i.id); break;
      case 'rack': this.ui.rackView(i.id); break;
      case 'laptop': this.terminal.openLaptop(); break;
      case 'pc': this.ui.pcDialog(i.id); break;
      case 'npc': this.ui.npcDialog(i.id); break;
      case 'travel':
        NV.career.stat('trips');
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
      case 'monitor': if (!this.flags.touchedRack) this.flags.monitorFirst = true; this.ui.monitorDialog(); break;
      case 'whiteboard': this.ui.whiteboardDialog(); break;
      case 'water': this.drinkWater(); break;
      case 'printer': this.printPage(); break;
      case 'vacuum': this.ui.toast('🤖 Dammsugarroboten "Städ-Sture" piper glatt och fortsätter städa.'); NV.career.stat('vacuum'); break;
      case 'info': this.ui.toast(esc(i.label)); break;
      case 'coffee': this.drinkCoffee(); break;
      case 'crab': this.catchCrab(); break;
    }
  };
  G.replaceCable = function (hostId) {
    var st = this.state;
    var l = st.links.filter(function (x) { return x.a.dev === hostId || x.b.dev === hostId; })[0];
    if (!l) return;
    var was = l.state;
    l.state = 'ok';
    NV.career.stat('cables');
    S.touch(st); S.refresh(st);
    this.ui.toast(was === 'ok' ? 'Du bytte kabeln. Ingen skillnad – den gamla var hel.' : 'Du bytte patchkabeln hos ' + esc(st.devices[hostId].label) + '.');
  };

  // ------------------------------------------------------------------ Karriär: XP, kombo, krabban, kaffe
  G.xp = function (n, why, silent) {
    var d = NV.settings.get('difficulty');
    if (n > 0) n = Math.round(n * (d === 'hard' ? 1.5 : (d === 'easy' ? 0.75 : 1)));
    var r = NV.career.addXP(n);
    this.weekXp = (this.weekXp || 0) + n;
    if (!silent || n) {
      if (this.world && this.world.popup) this.world.popup((n >= 0 ? '+' : '−') + Math.abs(n) + ' XP', n >= 0 ? '#ffd54a' : '#ff8a7a');
      if (n > 0) NV.sfx.xp();
    }
    if (why && n) this.ui.xpToast(n, why);
    if (r.up) this.levelUp(r.rank);
    this.ui.renderHud();
    return r;
  };
  G.levelUp = function (rank) {
    NV.sfx.levelUp();
    this.ui.toast('🎉 <b>Ny rang: ' + esc(rank.name) + '</b>' + (rank.nextName ? ' · nästa: ' + esc(rank.nextName) : ''), 'good big');
    if (this.world.flash) this.world.flash(0xfff0b0, 0.55);
    if (this.world.shake) this.world.shake(0.7);
    if (this.world.fireworks) this.world.fireworks(3);
  };
  G.onFixed = function (t, s) {
    var now = Date.now();
    this.combo = now - this.lastFixAt < 180000 ? this.combo + 1 : 1;
    this.lastFixAt = now;
    this.lastProgress = now;
    NV.career.stat('fixed');
    NV.career.max('bestCombo', this.combo);
    this.xp(100 + (s.hints === 0 ? 50 : 0), s.hints === 0 ? 'Fel löst utan ledtråd' : 'Fel löst');
    if (this.combo >= 2) { var self = this; setTimeout(function () { self.xp(40 * (self.combo - 1), 'Kombo ×' + self.combo); }, 700); }
    if (this.world.celebrate) this.world.celebrate(t.target);
  };
  G.onWeekDone = function (res) {
    var st = NV.career;
    st.stat('weeks');
    if (res.hints === 0) st.stat('noHintWeeks');
    if (res.minutes <= 10) st.stat('fastWeeks');
    if (this.exam) st.stat('exams');
    if (NV.settings.get('difficulty') === 'hard') st.stat('hardWeeks');
    this.xp(200 + 50 * res.stars, 'Veckan klar');
    if (res.minutes <= 15) { var self = this; setTimeout(function () { self.xp(100, 'Klar före fikat'); }, 600); }
    if (this.world.fireworks) this.world.fireworks(6);
    st.check();
  };
  G.onHint = function () {
    NV.career.stat('hints');
    this.lastProgress = Date.now();
    if (NV.settings.get('difficulty') !== 'easy') this.xp(-15, 'Ledtråd');
  };
  var FAMILY = { show: 'show', sh: 'show', ping: 'ping', traceroute: 'traceroute', tracert: 'traceroute', configure: 'configure', conf: 'configure', write: 'write', copy: 'write', ipconfig: 'ipconfig', nslookup: 'nslookup', ssh: 'ssh', debug: 'debug', clear: 'clear', curl: 'curl', tracepath: 'tracepath', crypto: 'crypto' };
  G.countCommand = function (line) {
    NV.career.stat('commands');
    var l = String(line || '').trim();
    var w = l.split(/\s+/)[0].toLowerCase();
    var fam = FAMILY[w];
    if (fam && NV.career.firstUse(fam)) this.xp(10, 'Nytt kommando: ' + fam);
    // Statistik för prestationerna i kapitel 10
    if (/^ping\b.*(\s-f\b|\s-M\s+do\b|\sdf-bit\b)/i.test(l)) NV.career.stat('dfPings');
    if (/^(do\s+)?sh\w*\s+cry/i.test(l)) NV.career.stat('cryptoShows');
    if (/^(curl|wget|for\s)/i.test(l)) NV.career.stat('curls');
  };
  G.onPing = function (from, ip, r, opts) {
    if (this.pingShown) return;
    this.pingShown = true;
    NV.career.stat('pings');
    this.lastPing = { from: from, r: r, n: opts && opts.proto === 'tcp' ? 1 : 4 };
    if (this.world.pingTrace) this.world.pingTrace(from, r, this.lastPing.n);
  };
  G.addDistance = function (d) {
    this.distAcc = (this.distAcc || 0) + d;
    if (this.distAcc >= 5) { NV.career.stat('dist', this.distAcc); this.distAcc = 0; }
  };
  G.boosted = function () { return this.boostUntil > Date.now(); };
  G.drinkWater = function () {
    NV.sfx.bubble();
    NV.career.stat('water');
    this.ui.toast('💧 Uppfriskande! Glöm inte att dricka vatten mellan felsökningarna.');
    if (this.world.waterFx) this.world.waterFx();
  };
  // Skrivaren skriver bara ut om den nås i nätet – ett litet test i sig
  G.printPage = function () {
    var ok = true;
    try { ok = S.ping(this.state, 'PC-Lisa', '192.168.1.11').ok; } catch (e) { ok = true; }
    if (!ok) { this.ui.toast('🖨️ Skrivaren svarar inte. Något i nätet är trasigt mellan kontoret och skrivaren.', 'warn'); NV.sfx.fail(); return; }
    NV.sfx.printer();
    NV.career.stat('prints');
    if (this.world.printFx) this.world.printFx();
    var open = this.def ? this.def.tasks.filter(function (t) { return !this.taskState[t.id].reported; }, this).length : 0;
    this.ui.toast('🖨️ Skrivaren skrev ut veckans ärendelista: ' + (this.def ? open + ' ärenden kvar.' : 'fri träning, inga ärenden.'));
  };
  G.drinkCoffee = function () {
    if (this.boosted()) { this.ui.toast('Du har redan kaffe i kroppen. Vänta lite.'); return; }
    NV.sfx.pour();
    this.boostUntil = Date.now() + 90000;
    NV.career.stat('coffees');
    this.ui.toast('☕ <b>Kaffe!</b> Du går 30 % snabbare i 90 sekunder.', 'good');
    if (!this.coffeeXp) { this.coffeeXp = true; this.xp(5, 'Kaffepaus'); }
  };
  // Krabban gömmer sig nära ett av veckans fel – en liten ledtråd för den som hittar den
  G.crabSpot = function () {
    var A = this.world.builder.anchors, self = this;
    var rackOf = { SW1: A.rackA, SW2: A.rackA, R1: A.rackA, WLC: A.rackA, LB: A.rackA, RB: A.borasRack, SWB: A.borasRack };
    var t = this.def ? this.def.tasks.filter(function (x) { return x.krabba && !self.taskState[x.id].fixed; })[0] : null;
    if (t && rackOf[t.target]) { var a = rackOf[t.target]; return a.x > 50 ? { x: a.x + 1.25, z: a.z + 0.6 } : { x: a.x + 0.3, z: a.z + 1.3 }; }
    if (t && A.desks[t.target]) { var d = A.desks[t.target]; return { x: d.x + 1.25, z: d.z }; }
    return this.def && this.def.site === 'boras' ? { x: 90.5, z: -4 } : { x: -10, z: -5.5 };
  };
  G.spawnCrab = function () {
    var p = this.crabSpot();
    this.crab = { active: true, site: p.x > 50 ? 'boras' : 'gbg', x: p.x, z: p.z, homeX: p.x, homeZ: p.z, face: 0, anim: 0 };
  };
  G.catchCrab = function () {
    var c = this.crab;
    if (!c || !c.active) return;
    var d = Math.hypot(c.x - this.world.pos.x, c.z - this.world.pos.z);
    if (d > 2.1) { this.ui.toast('Krabban är för långt bort. Smyg närmare – huka med C i 3D.'); return; }
    c.active = false;
    NV.sfx.squeak(); NV.sfx.success();
    NV.career.stat('crabs');
    if (this.world.crabCaught) this.world.crabCaught(c);
    var self = this;
    var t = this.def ? this.def.tasks.filter(function (x) { return x.krabba && !self.taskState[x.id].fixed; })[0] : null;
    var dev = t && this.state.devices[t.target];
    var note = dev ? ' Den tappade en lapp: <i>"Jag har pillat på ' + esc(dev.config ? dev.config.hostname : (dev.label || t.target)) + '…"</i>' : ' Den verkar ha varit sysslolös den här veckan.';
    this.ui.toast('🦀 <b>Du fångade Krabban!</b>' + note, 'good big');
    this.xp(75, 'Krabban fångad');
  };
  G.toggleGoggles = function () {
    this.goggles = !this.goggles;
    if (this.world.setGoggles) this.world.setGoggles(this.goggles);
    NV.sfx.goggles(this.goggles);
    if (this.goggles) {
      NV.career.stat('goggles');
      if (!NV.settings.get('gogglesSeen')) { NV.settings.set('gogglesSeen', true); this.ui.toast('🥽 <b>Nätverksglasögon:</b> gröna kablar är uppe, röda nere och orange har problem (err-disabled, blockerad eller duplexfel). G stänger av.', 'good big'); }
    }
  };
  G.replayPing = function () {
    if (!this.lastPing) { this.ui.toast('Inget pingspår ännu. Kör ping i terminalen först.'); return; }
    this.world.pingTrace(this.lastPing.from, this.lastPing.r, this.lastPing.n);
    this.ui.toast('Spelar upp senaste pingspåret (R).');
  };
  G.setWaypoint = function (x, z) { this.waypoint = { x: x, z: z }; this.ui.toast('Markering satt. Pilen visar vägen dit.'); };
  // Knuff från Omar om inget händer på länge (aldrig på svår nivå eller under examen)
  G.nudge = function () {
    if (!this.def || this.done || this.exam || !this.running || NV.settings.get('difficulty') === 'hard') return;
    if (this.ui.captures() || Date.now() - this.lastProgress < 300000 || this.nudges >= 3) return;
    var self = this;
    var t = this.def.tasks.filter(function (x) { return !self.taskState[x.id].fixed; })[0];
    if (!t) return;
    var s = this.taskState[t.id];
    var msg = !s.known ? 'Har du pratat med ' + t.npc + '? Det lyser ett utropstecken där.' : (s.hints === 0 ? 'Börja i symptomet: vilket show-kommando visar det ' + t.npc + ' beskrev? L ger en ledtråd.' : 'Jämför med ett ställe som fungerar. Vad skiljer sig i show-utskriften?');
    this.ui.toast('📱 <b>Omar:</b> ' + esc(msg));
    this.nudges++;
    this.lastProgress = Date.now();
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
