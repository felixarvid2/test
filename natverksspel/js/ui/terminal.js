// Terminalen: sessionsstack (laptop → screen → IOS, ssh, Windows), strömmad utskrift och tangenter.
NV.Terminal = (function () {
  var GARBAGE = 'ÿþ~€¿x§¤ÆØ¶ßð½±¬¦';

  function Terminal(game, root) {
    this.game = game;
    this.root = root;
    this.stack = [];
    this.open = false;
    this.busy = false;
    this.queue = [];
    this.hist = {};
    // Kommandohistoriken sparas mellan omladdningar (högst 60 rader per enhet)
    try { var sv = NV.settings.store('krabba-passet.termhist'); if (sv && typeof sv === 'object') Object.keys(sv).forEach(function (k) { this.hist[k] = { list: (sv[k] || []).slice(-60), idx: (sv[k] || []).slice(-60).length }; }, this); } catch (e) { /* ingen sparad historik */ }
    this.el = {
      title: root.querySelector('.term-title'),
      out: root.querySelector('.term-out'),
      prompt: root.querySelector('.term-prompt'),
      input: root.querySelector('.term-input'),
      screen: root.querySelector('.term-screen'),
      disconnect: root.querySelector('[data-act=disconnect]'),
      close: root.querySelector('[data-act=close]'),
      quick: root.querySelector('.term-quick'),
      ghost: root.querySelector('.term-ghost'),
      cursor: root.querySelector('.term-cursor'),
      status: root.querySelector('.term-status'),
      find: root.querySelector('.term-find'),
      histBox: root.querySelector('.term-hist'),
      icon: root.querySelector('.term-icon'),
      term: root.querySelector('.term'),
    };
    var self = this;
    this.el.input.addEventListener('keydown', function (e) { self.onKey(e); });
    this.el.screen.addEventListener('mousedown', function (e) { if (e.target === self.el.screen || e.target === self.el.out) setTimeout(function () { self.focus(); }, 0); });
    this.el.close.addEventListener('click', function () { self.hide(); });
    root.querySelector('[data-act="font-"]').addEventListener('click', function () { NV.settings.set('termFont', Math.max(11, NV.settings.get('termFont') - 1)); self.applyFont(); self.focus(); });
    root.querySelector('[data-act="font+"]').addEventListener('click', function () { NV.settings.set('termFont', Math.min(28, NV.settings.get('termFont') + 1)); self.applyFont(); self.focus(); });
    root.querySelector('[data-act="copy"]').addEventListener('click', function () { self.copySelection(); });
    root.querySelector('[data-act="copyall"]').addEventListener('click', function () { self.game.ui.copyText(self.el.out.textContent + (self.el.prompt.textContent || '')); });
    // Klicka på en adress eller ett portnamn i utskriften för att använda det
    this.el.out.addEventListener('click', function (e) {
      var t = e.target;
      if (!t.classList || String(window.getSelection ? window.getSelection() : '')) return;
      var top = self.top(), ios = top && top.ios;
      if (t.classList.contains('t-ip')) { self.el.input.value = (top && top.kind === 'win' ? 'ping ' : 'ping ') + t.textContent.replace(/\/\d+$/, ''); self.focus(); self.updateGhost(); }
      else if (t.classList.contains('t-if') && ios) { self.el.input.value = 'show interfaces ' + t.textContent; self.focus(); self.updateGhost(); }
    });
    // Dubbelklick på ett ord skriver in det i prompten
    this.el.out.addEventListener('dblclick', function () {
      var w = String(window.getSelection ? window.getSelection() : '').trim();
      if (!w || /\s/.test(w)) return;
      var v = self.el.input.value;
      self.el.input.value = v + (v && !/\s$/.test(v) ? ' ' : '') + w;
      self.focus(); self.updateGhost();
    });
    // Knapp som hoppar ned när nya rader kommit medan du läser längre upp
    this.el.newlines = root.querySelector('.term-new');
    this.el.newlines.addEventListener('click', function () { self.el.screen.scrollTop = self.el.screen.scrollHeight; self.el.newlines.classList.add('hidden'); self.focus(); });
    this.el.screen.addEventListener('scroll', function () { self.userUp = !self.atBottom(); if (!self.userUp) self.el.newlines.classList.add('hidden'); });
    // Fönstrets storlek sparas
    if (window.ResizeObserver) new ResizeObserver(function () {
      if (!self.open || window.innerWidth < 760 || self.el.term.classList.contains('maxed')) return;
      if (self.skipSize) { self.skipSize = false; return; }
      var r = self.el.term.getBoundingClientRect();
      if (r.width > 300) NV.settings.set('termSize2', [Math.round(r.width), Math.round(r.height)]);
    }).observe(this.el.term);
    this.applyFont();
    var mx = root.querySelector('[data-act="max"]');
    if (mx) mx.addEventListener('click', function () { self.toggleMax(); self.focus(); });
    root.querySelector('[data-act="hist"]').addEventListener('click', function () { self.toggleHistory(); });
    // Tangentraden för mobiler (och den som vill klicka)
    root.querySelectorAll('.term-keys [data-k]').forEach(function (b) {
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.addEventListener('click', function (e) { e.preventDefault(); self.pressKey(b.getAttribute('data-k')); self.focus(); });
    });
    this.el.input.addEventListener('input', function () { self.updateGhost(); });
    this.el.input.addEventListener('keyup', function () { self.updateCursor(); });
    this.el.input.addEventListener('click', function () { self.updateCursor(); });
    this.el.find.addEventListener('input', function () { self.find(self.el.find.value, false); });
    this.el.find.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); self.find(self.el.find.value, true); }
      if (e.key === 'Escape') { e.preventDefault(); self.el.find.value = ''; self.find('', false); self.focus(); }
      e.stopPropagation();
    });
    setInterval(function () { if (self.open) self.updateStatus(); }, 1000);
    this.el.disconnect.addEventListener('click', function () { self.popSerial(true); });
    this.el.input.addEventListener('paste', function (e) {
      var txt = (e.clipboardData || window.clipboardData).getData('text');
      if (txt.indexOf('\n') < 0) return;
      e.preventDefault();
      var lines = txt.replace(/\r/g, '').split('\n');
      lines.forEach(function (l, i) { if (i < lines.length - 1 || l) self.queue.push(l); });
      self.drain();
    });
    // Klicka på ett tidigare kommando för att lägga in det på raden igen
    this.el.out.addEventListener('click', function (e) {
      var el = e.target;
      if (!el || !el.classList || !el.classList.contains('t-cmd') || (window.getSelection && String(window.getSelection()))) return;
      self.el.input.value = el.textContent; self.updateGhost(); self.focus();
    });
    // Ctrl + mushjulet ändrar textstorleken
    this.el.screen.addEventListener('wheel', function (e) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      NV.settings.set('termFont', Math.max(11, Math.min(28, NV.settings.get('termFont') + (e.deltaY < 0 ? 1 : -1))));
      self.applyFont();
    }, { passive: false });
    NV.onLog = function (devId, line) { self.onDeviceLog(devId, line); };
    NV.onConsoleSpeed = function () { self.checkSpeed(); };
  }
  var P = Terminal.prototype;

  P.top = function () { return this.stack[this.stack.length - 1]; };
  // Skicka en tangent som om den trycktes på tangentbordet
  P.pressKey = function (k) {
    var ev = { key: k, ctrlKey: false, shiftKey: false, metaKey: false, preventDefault: function () {} };
    if (k === 'ctrl-c') { ev.key = 'c'; ev.ctrlKey = true; }
    else if (k === 'ctrl-z') { ev.key = 'z'; ev.ctrlKey = true; }
    else if (k === 'ctrl-u') { ev.key = 'u'; ev.ctrlKey = true; }
    else if (k === 'ctrl-a-k') { this.onKey({ key: 'a', ctrlKey: true, preventDefault: function () {} }); ev.key = 'k'; }
    else if (k === 'ctrl-r') { ev.key = 'r'; ev.ctrlKey = true; }
    else if (k.indexOf('ins:') === 0) {
      // Tecken som är krångliga att hitta på mobilens tangentbord
      var inp = this.el.input, txt = k.slice(4), at = inp.selectionStart || inp.value.length;
      inp.value = inp.value.slice(0, at) + txt + inp.value.slice(at);
      try { inp.setSelectionRange(at + txt.length, at + txt.length); } catch (e) { /* äldre webbläsare */ }
      this.updateGhost();
      return;
    }
    this.onKey(ev);
  };
  // Helskärm: terminalen fyller hela fönstret (knappen ⛶ eller F11 när terminalen är öppen)
  P.toggleMax = function () {
    var on = !this.el.term.classList.contains('maxed');
    this.el.term.classList.toggle('maxed', on); this.root.classList.toggle('maxed', on);
    NV.settings.set('termMax', on);
    this.el.screen.scrollTop = this.el.screen.scrollHeight;
  };
  P.applyFont = function () {
    var pix = this.theme() === 'snes';
    this.el.screen.style.fontSize = (NV.settings.get('termFont') + (pix ? 6 : 0)) + 'px';
    this.updateGhost();
  };
  // Tema: pixel-SNES i 2D, klassiskt i 3D, eller spelarens val
  P.theme = function () {
    var t = NV.settings.get('termTheme');
    if (t === 'auto' || !t) return this.game.mode === '2d' ? 'snes' : 'classic';
    return t;
  };
  P.applyTheme = function () {
    var th = this.theme();
    var r = this.root;
    ['classic', 'green', 'amber', 'snes'].forEach(function (x) { r.classList.toggle('theme-' + x, x === th); });
    this.applyFont();
  };
  // Kopiera utskriften efter det senaste kommandot
  P.copyLastOutput = function () {
    var cmds = this.el.out.querySelectorAll('.t-cmd');
    if (!cmds.length) return;
    var last = cmds[cmds.length - 1], txt = '', n = last.nextSibling;
    while (n) { txt += n.textContent; n = n.nextSibling; }
    txt = txt.replace(/^\n/, '');
    var self = this;
    try { navigator.clipboard.writeText(txt).then(function () { self.setStatusHint('Senaste utskriften kopierad (' + txt.split('\n').length + ' rader)'); }, function () { self.setStatusHint('Kunde inte kopiera – markera texten och tryck Ctrl+Shift+C'); }); } catch (e) { this.setStatusHint('Kunde inte kopiera'); }
  };
  P.copySelection = function () {
    var sel = window.getSelection ? String(window.getSelection()) : '';
    if (!sel) { this.game.ui.toast('Markera text i terminalen först, sedan Kopiera.'); return; }
    this.game.ui.copyText(sel);
  };
  P.focus = function () { try { this.el.input.focus({ preventScroll: true }); } catch (e) { this.el.input.focus(); } };

  P.show = function () {
    var was = this.open;
    this.applyTheme();
    var sz = NV.settings.get('termSize2');
    this.skipSize = true;
    var mxOn = !!NV.settings.get('termMax');
    this.el.term.classList.toggle('maxed', mxOn); this.root.classList.toggle('maxed', mxOn);
    if (sz && window.innerWidth >= 760) { this.el.term.style.width = Math.min(sz[0], window.innerWidth - 16) + 'px'; this.el.term.style.height = Math.min(sz[1], window.innerHeight - 16) + 'px'; }
    this.root.classList.remove('hidden');
    this.open = true;
    if (!was) {
      var term = this.el.term;
      term.classList.remove('crt-on'); void term.offsetWidth; term.classList.add('crt-on');
      if (this.theme() === 'snes' || this.theme() === 'green' || this.theme() === 'amber') NV.sfx.crt(); else NV.sfx.open();
    }
    this.game.world.unlock();
    this.focus();
    this.refreshHeader();
  };
  P.hide = function () {
    this.el.histBox.classList.add('hidden');
    this.el.find.value = '';
    this.root.classList.add('hidden');
    this.open = false;
    this.stack = [];
    this.el.out.textContent = '';
    this.game.ui.afterOverlay();
  };

  // Öppna laptopen (Linux) eller en Windows-dator
  P.openLaptop = function (prefill) {
    if (!this.open || !this.stack.length) {
      this.stack = [];
      this.el.out.textContent = '';
      var sh = new NV.LinuxShell(this.game.state, 'Tekniker', { consoleTarget: this.game.consoleTarget.bind(this.game) });
      this.push({ kind: 'linux', session: sh, title: 'tekniker@laptop' });
      this.print(sh.banner() + '\n');
    }
    this.show();
    this.renderPrompt();
    if (prefill) { this.el.input.value = prefill; }
  };
  P.openWindows = function (hostId) {
    this.stack = [];
    this.el.out.textContent = '';
    var sh = new NV.WinShell(this.game.state, hostId);
    this.push({ kind: 'win', session: sh, title: 'Kommandotolken – ' + (this.game.state.devices[hostId].label || hostId) });
    this.print(sh.banner() + '\n');
    this.show();
    this.renderPrompt();
  };

  P.push = function (entry) {
    this.stack.push(entry);
    this.refreshHeader();
  };
  P.refreshHeader = function () {
    var t = this.top();
    this.el.title.textContent = t ? t.title : 'Terminal';
    this.drawIcon(t);
    var serial = this.stack.some(function (s) { return s.kind === 'serial' || s.kind === 'ssh'; });
    this.el.disconnect.style.display = serial ? '' : 'none';
    this.el.quick.innerHTML = '';
    var self = this;
    if (t && t.kind === 'linux') {
      var tgt = this.game.consoleTarget();
      var chips = [];
      if (tgt) chips.push(['screen 9600', 'sudo screen /dev/ttyUSB0 9600']);
      chips.push(['ssh R-Nordvik-1', 'ssh drift@192.168.1.193'], ['ping gateway', 'ping -c 4 192.168.1.193'], ['help', 'help']);
      if (this.game.week === 8) chips.push(['ssh WLC', 'ssh admin@192.168.1.196']);
      if (this.game.week === 10) chips.push(['ssh R-Boras-1', 'ssh drift@192.168.2.193'], ['ssh LB', 'ssh admin@192.168.1.13'], ['curl ×4', 'for i in 1 2 3 4; do curl -s http://tid/; done'], ['tracepath Borås', 'tracepath 192.168.2.193']);
      chips.forEach(function (c) {
        var b = document.createElement('button');
        b.textContent = c[0];
        b.title = c[1];
        b.addEventListener('click', function () { self.el.input.value = c[1]; self.focus(); });
        self.el.quick.appendChild(b);
      });
    }
    if (t && (t.kind === 'serial' || t.kind === 'ssh') && t.ios) {
      var wk = this.game.def && this.game.def.chips ? this.game.def.chips.map(function (x) { return [x, x]; }) : [['show ip int brief', 'show ip interface brief'], ['show run', 'show running-config']];
      [['?', '?']].concat(wk).concat([['show logging', 'show logging']]).forEach(function (c) {
        var b = document.createElement('button');
        b.textContent = c[0];
        b.addEventListener('click', function () {
          if (c[1] === '?') { self.helpNow(); return; }
          self.el.input.value = c[1]; self.focus();
        });
        self.el.quick.appendChild(b);
      });
    }
  };

  P.print = function (text, plain) {
    if (!text) return;
    var t = this.top();
    if (t && t.garbled) { text = garble(text); plain = true; }
    var out = this.el.out;
    if (plain) out.appendChild(document.createTextNode(text));
    else out.appendChild(highlight(text, this));
    // Begränsa mängden text
    if (out.childNodes.length > 1500) { for (var i = 0; i < 300; i++) out.removeChild(out.firstChild); }
    this.scroll();
  };
  P.atBottom = function () { var s = this.el.screen; return s.scrollHeight - s.scrollTop - s.clientHeight < 40; };
  // Rulla bara ned om du redan är längst ned – annars visas knappen "Nya rader"
  P.scroll = function (force) {
    if (force || !this.userUp) { this.el.screen.scrollTop = this.el.screen.scrollHeight; if (this.el.newlines) this.el.newlines.classList.add('hidden'); }
    else if (this.el.newlines) this.el.newlines.classList.remove('hidden');
  };
  // Kommandot som skrevs: prompten och texten får egna färger
  P.echo = function (prompt, cmd) {
    var t = this.top();
    if (t && t.garbled) { this.print(prompt + cmd + '\n', true); return; }
    var f = document.createDocumentFragment();
    var a = document.createElement('span'); a.className = 't-prompt' + promptClass(prompt); a.textContent = prompt; f.appendChild(a);
    var b = document.createElement('span'); b.className = 't-cmd'; b.textContent = cmd; f.appendChild(b);
    f.appendChild(document.createTextNode('\n'));
    this.el.out.appendChild(f);
    this.scroll();
  };
  function promptClass(p) {
    if (/\(config[^)]*\)#\s*$/.test(p)) return ' p-conf';
    if (/#\s*$/.test(p)) return ' p-priv';
    if (/>\s*$/.test(p)) return ' p-user';
    return '';
  }

  // Färgning av utskrifter: upp/nere, adresser, portnamn, loggar och fel
  var RULES = [
    ['t-err', /^%\s*(Invalid input|Incomplete command|Ambiguous command|Unknown command|Unrecognized|Bad|Error).*$/],
    ['t-log', /%[A-Z0-9_]+-\d-[A-Z0-9_]+/],
    ['t-warn', /#pkts (?:encaps|decaps): 0\b|Frag needed and DF set|Paketet måste fragmenteras men DF har angetts\.|MM_KEY_EXCH|DOWN-NEGOTIATING|UP-IDLE/],
    ['t-bad', /\b(?:MM_NO_STATE|502 Bad Gateway|503 Service Unavailable|proxy identities not supported|Begäran gjorde time out\.?|0 fil\(er\) kopierade)/],
    ['t-ok', /\b(?:QM_IDLE|UP-ACTIVE|200 OK|1 fil\(er\) kopierade|Svar från)/],
    ['t-bad', /\b(administratively down|err-disabled|notconnect|not connected|down|DOWN|disabled|Request timed out|Destination host unreachable|unreachable|timed out|denied|Denied|refused|failed|FAILED|Success rate is 0 percent)\b/],
    ['t-warn', /\b(BLK|blocking|Blocking|flapping|mismatch|late collisions?|CRC|input errors|inactive|Altn|APIPA|Media disconnected)\b/],
    ['t-ok', /\b(connected|up|UP|FWD|forwarding|Established|Success rate is 100 percent|Reply from|bytes from|open|Connected|Enabled|Registered)\b|!{3,}/],
    ['t-mac', /\b[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}\b|\b([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}\b/],
    ['t-ip', /\b\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?\b/],
    ['t-if', /\b(GigabitEthernet|FastEthernet|Port-channel|Loopback|Serial|Vlan|Tunnel|Gi|Fa|Po|Lo|Se)\d+(\/\d+)*(\.\d+)?\b/],
  ];
  var ANCH = RULES.map(function (r) { return new RegExp('^(?:' + r[1].source + ')$'); });
  var BIG = new RegExp(RULES.map(function (r) { return '(' + r[1].source + ')'; }).join('|'), 'gm');
  function highlight(text, term) {
    var f = document.createDocumentFragment();
    if (text.length > 60000) { f.appendChild(document.createTextNode(text)); return f; }
    var last = 0, m, err = false;
    BIG.lastIndex = 0;
    while ((m = BIG.exec(text))) {
      if (m[0] === '') { BIG.lastIndex++; continue; }
      var cls = null;
      for (var i = 0; i < RULES.length; i++) { if (ANCH[i].test(m[0])) { cls = RULES[i][0]; break; } }
      if (!cls) continue;
      if (cls === 't-ip' && /^169\.254\./.test(m[0])) cls = 't-warn';
      if (cls === 't-err') err = true;
      if (m.index > last) f.appendChild(document.createTextNode(text.slice(last, m.index)));
      var sp = document.createElement('span'); sp.className = cls; sp.textContent = m[0];
      f.appendChild(sp);
      last = m.index + m[0].length;
    }
    if (last < text.length) f.appendChild(document.createTextNode(text.slice(last)));
    if (err && term) term.errorFlash();
    return f;
  }
  P.errorFlash = function () {
    var sc = this.el.screen;
    NV.sfx.bell();
    sc.classList.remove('err-flash'); void sc.offsetWidth; sc.classList.add('err-flash');
  };

  // Spökkomplettering: resten av kommandot visas grått, → eller Tab tar det
  P.measure = function (txt) {
    var c = this._mc || (this._mc = document.createElement('canvas').getContext('2d'));
    var cs = getComputedStyle(this.el.input);
    c.font = cs.fontSize + ' ' + cs.fontFamily;
    return c.measureText(txt).width;
  };
  P.updateGhost = function () {
    var t = this.top(), s = t && t.session, el = this.el;
    var v = el.input.value;
    var ghost = '';
    if (s && s.complete && !t.garbled && v && !(s.pending && s.pending.secret) && /\S$/.test(v)) {
      try { var c = s.complete(v); if (c && c.toLowerCase().indexOf(v.toLowerCase()) === 0 && c.length > v.length) ghost = c.slice(v.length); } catch (e) { ghost = ''; }
    }
    this.ghostText = ghost;
    el.ghost.textContent = ghost;
    el.ghost.style.left = this.measure(el.input.type === 'password' ? '' : v) + 'px';
    this.updateCursor();
  };
  P.updateCursor = function () {
    var el = this.el, v = el.input.value;
    var atEnd = el.input.selectionStart === v.length;
    el.cursor.style.left = this.measure(el.input.type === 'password' ? '' : v) + 'px';
    el.cursor.style.display = atEnd ? '' : 'none';
    this.root.classList.toggle('caret-native', !atEnd);
  };
  // Statusrad: anslutning, läge och klocka
  P.setStatusHint = function (txt) {
    var m = this.el.status && this.el.status.querySelector('.ts-mode');
    if (m) m.textContent = txt;
  };
  P.updateStatus = function () {
    var t = this.top(), el = this.el.status;
    if (!t) return;
    var conn = t.kind === 'serial' ? '🔌 Konsol ' + t.speed + ' 8N1' + (t.garbled ? ' · fel hastighet?' : '') : (t.kind === 'ssh' ? '🔒 ' + (t.title.indexOf('telnet') === 0 ? 'Telnet (okrypterat!)' : 'SSH') : (t.kind === 'win' ? '🪟 Windows' : '🐧 Laptop (Linux)'));
    var p = this.el.prompt.textContent || '';
    var mode = '';
    if (t.ios || t.kind === 'serial') {
      if (!t.started) mode = 'Tryck Enter';
      else if (/\(config-if[^)]*\)#/.test(p)) mode = 'Interfacekonfiguration';
      else if (/\(config-line\)#/.test(p)) mode = 'Linjekonfiguration';
      else if (/\(config-isakmp\)#/.test(p)) mode = 'ISAKMP-policy (fas 1)';
      else if (/\(config-crypto-map\)#/.test(p)) mode = 'Crypto map';
      else if (/\(cfg-crypto-trans\)#/.test(p)) mode = 'Transform-set (fas 2)';
      else if (/\(config-ext-nacl\)#|\(config-std-nacl\)#/.test(p)) mode = 'Åtkomstlista';
      else if (/\(config[^)]*\)#/.test(p)) mode = 'Konfigurationsläge';
      else if (/#\s*$/.test(p)) mode = 'Privilegierat läge (#)';
      else if (/>\s*$/.test(p)) mode = 'Användarläge (>)';
      else mode = p ? 'Inloggning' : '';
    } else if (t.dev === 'LB') mode = 'Lastbalanserare';
    else if (t.dev === 'WLC') mode = 'Controller (AireOS)';
    else mode = t.kind === 'win' ? 'cmd.exe' : 'bash';
    var clock = this.game.state ? NV.sim.deviceClock(this.game.state, this.game.state.devices.R1).hms : '';
    el.querySelector('.ts-conn').textContent = conn;
    el.querySelector('.ts-mode').textContent = (this.busy ? '⏳ arbetar… (Ctrl+C avbryter) · ' : '') + mode;
    el.querySelector('.ts-time').textContent = clock;
  };
  // Liten pixelikon för sessionen
  P.drawIcon = function (t) {
    var c = this.el.icon, g = c.getContext('2d');
    g.clearRect(0, 0, 16, 16);
    var kind = !t ? 'lap' : (t.kind === 'win' ? 'win' : (t.dev ? (/^R/.test(t.dev) ? 'router' : (t.dev === 'WLC' ? 'wlc' : (t.dev === 'LB' ? 'lb' : 'switch'))) : 'lap'));
    function r(x, y, w, h, col) { g.fillStyle = col; g.fillRect(x, y, w, h); }
    if (kind === 'lb') { r(1, 5, 14, 7, '#2a3a4a'); r(1, 5, 14, 1, '#6b8db0'); r(3, 8, 2, 2, '#3dff6a'); r(7, 8, 2, 2, '#3dff6a'); r(11, 8, 2, 2, '#ffb020'); r(7, 2, 2, 3, '#9fb4c8'); return; }
    if (kind === 'switch') { r(0, 5, 16, 7, '#4c5b6b'); r(0, 5, 16, 1, '#8ea3b8'); for (var i = 0; i < 6; i++) { r(2 + i * 2, 8, 1, 2, '#10151a'); r(2 + i * 2, 7, 1, 1, i % 2 ? '#3dff6a' : '#ffb020'); } }
    else if (kind === 'router') { r(1, 4, 14, 9, '#cfd2cf'); r(1, 4, 14, 1, '#ffffff'); r(3, 7, 3, 3, '#1d2226'); r(8, 7, 3, 3, '#1d2226'); r(13, 6, 1, 1, '#3dff6a'); }
    else if (kind === 'wlc') { r(1, 6, 14, 6, '#b9bcbf'); r(4, 2, 1, 4, '#555'); r(11, 2, 1, 4, '#555'); r(12, 8, 1, 1, '#3dff6a'); }
    else if (kind === 'win') { r(2, 2, 12, 12, '#1f6fd6'); r(7, 2, 1, 12, '#cfe3ff'); r(2, 7, 12, 1, '#cfe3ff'); }
    else { r(2, 3, 12, 8, '#2b2d31'); r(3, 4, 10, 6, '#300a24'); r(4, 5, 3, 1, '#8fe388'); r(1, 11, 14, 2, '#55585e'); }
  };
  // Tidigare kommandon i en lista
  P.toggleHistory = function () {
    var box = this.el.histBox, self = this;
    if (!box.classList.contains('hidden')) { box.classList.add('hidden'); this.focus(); return; }
    var t = this.top();
    var h = t ? this.hist[t.histKey || t.kind] : null;
    var list = h ? h.list.slice(-15).reverse() : [];
    box.innerHTML = list.length ? '' : '<div class="muted">Inga kommandon ännu.</div>';
    list.forEach(function (l) {
      var b = document.createElement('button');
      b.textContent = l;
      b.addEventListener('click', function () { self.el.input.value = l; box.classList.add('hidden'); self.focus(); self.updateGhost(); });
      box.appendChild(b);
    });
    box.classList.remove('hidden');
  };
  // Sök i utskriften
  P.find = function (q, next) {
    var out = this.el.out;
    out.querySelectorAll('mark.t-find').forEach(function (m) { m.replaceWith(document.createTextNode(m.textContent)); });
    out.normalize();
    if (!q) return;
    var ql = q.toLowerCase(), marks = [];
    var walker = document.createTreeWalker(out, NodeFilter.SHOW_TEXT), nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function (node) {
      var txt = node.nodeValue, low = txt.toLowerCase(), i = low.indexOf(ql);
      if (i < 0) return;
      var f = document.createDocumentFragment(), last = 0;
      while (i >= 0) {
        f.appendChild(document.createTextNode(txt.slice(last, i)));
        var m = document.createElement('mark'); m.className = 't-find'; m.textContent = txt.slice(i, i + q.length);
        f.appendChild(m); marks.push(m);
        last = i + q.length; i = low.indexOf(ql, last);
      }
      f.appendChild(document.createTextNode(txt.slice(last)));
      node.replaceWith(f);
    });
    if (!marks.length) return;
    this.findIx = next ? ((this.findIx || 0) + 1) % marks.length : marks.length - 1;
    var cur = marks[this.findIx];
    cur.classList.add('cur');
    cur.scrollIntoView({ block: 'center' });
  };
  function garble(text) {
    var o = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (ch === '\n') { o += '\n'; continue; }
      if (Math.random() < 0.7) o += GARBAGE[Math.floor(Math.random() * GARBAGE.length)];
      else if (Math.random() < 0.5) o += String.fromCharCode(33 + Math.floor(Math.random() * 90));
    }
    return o;
  }

  P.renderPrompt = function () {
    var t = this.top();
    var s = t && t.session;
    var promptText = '';
    if (t && t.kind === 'serial' && !t.started) promptText = '';
    else if (s) promptText = s.promptText ? s.promptText() : s.prompt();
    if (t && t.garbled && promptText) promptText = garble(promptText);
    this.el.prompt.textContent = promptText;
    this.el.prompt.className = 'term-prompt' + promptClass(promptText);
    var secret = s && s.pending && s.pending.secret;
    this.el.input.type = secret ? 'password' : 'text';
    this.updateGhost();
    this.updateStatus();
    this.scroll();
  };

  P.onKey = function (e) {
    var t = this.top();
    if (!t) return;
    var s = t.session;
    // Utanför screen-konsolen fungerar Ctrl+A och Ctrl+E som i IOS och bash: början och slutet av raden
    if (e.ctrlKey && (e.key === 'a' || e.key === 'A') && t.kind !== 'serial') { e.preventDefault(); try { this.el.input.setSelectionRange(0, 0); } catch (er) { /* äldre webbläsare */ } return; }
    if (e.ctrlKey && (e.key === 'e' || e.key === 'E')) { e.preventDefault(); var ln = this.el.input.value.length; try { this.el.input.setSelectionRange(ln, ln); } catch (er) { /* äldre webbläsare */ } return; }
    if (e.ctrlKey && (e.key === 'p' || e.key === 'P' || e.key === 'n' || e.key === 'N')) { e.preventDefault(); this.onKey({ key: /p/i.test(e.key) ? 'ArrowUp' : 'ArrowDown', preventDefault: function () {} }); return; }
    if (e.key === 'F1') { e.preventDefault(); this.print('\nTangenter i terminalen:\n  Tab / Tab Tab     komplettera / visa alternativ      ?          hjälp (Cisco)\n  ↑ ↓ eller Ctrl+P/N  tidigare kommandon             Ctrl+R     sök bakåt i historiken\n  Ctrl+A / Ctrl+E   början / slutet av raden           Ctrl+U/K/W rensa rad / resten / ordet\n  Ctrl+C            avbryt                            Ctrl+Z     tillbaka till # (Cisco)\n  Ctrl+L            rensa skärmen                      Ctrl+F     sök i utskriften\n  Ctrl + / −, Ctrl+mushjul  textstorlek                F11        helskärm\n  Alt+.             sista ordet i förra kommandot      Alt+C      kopiera senaste utskriften\n  Alt+B / Alt+F     ett ord bakåt / framåt             Alt+D      radera ordet framåt\n  Ctrl+T            byt plats på två tecken\n  Ctrl+A K          stäng screen-konsolen              Ctrl+D     logga ut\n  Klicka på ett tidigare kommando för att skriva in det igen.\n\n'); this.renderPrompt(); return; }
    if (e.altKey && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); this.copyLastOutput(); return; }
    if (e.ctrlKey && (e.key === 'a' || e.key === 'A')) { this.ctrlA = true; e.preventDefault(); return; }
    if (this.ctrlA) {
      this.ctrlA = false;
      if (e.key === 'k' || e.key === 'K' || e.key === '\\') { e.preventDefault(); this.popSerial(true); return; }
    }
    if (e.key === 'F11') { e.preventDefault(); this.toggleMax(); return; }
    if (e.key === 'Escape') { e.preventDefault(); if (!this.el.histBox.classList.contains('hidden')) { this.el.histBox.classList.add('hidden'); return; } this.hide(); return; }
    if (e.ctrlKey && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); this.el.find.focus(); this.el.find.select(); return; }
    if (e.key === 'ArrowRight' && this.ghostText && this.el.input.selectionStart === this.el.input.value.length) { e.preventDefault(); this.el.input.value += this.ghostText; this.updateGhost(); return; }
    if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) { e.preventDefault(); this.el.input.value = ''; this.updateGhost(); return; }
    if (e.ctrlKey && (e.key === 'w' || e.key === 'W')) { e.preventDefault(); this.el.input.value = this.el.input.value.replace(/\s*\S+\s*$/, ''); this.updateGhost(); return; }
    if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); this.el.out.textContent = ''; this.renderPrompt(); return; }
    // Ctrl+K: ta bort resten av raden från markören
    if (e.ctrlKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); var inp = this.el.input; inp.value = inp.value.slice(0, inp.selectionStart); this.updateGhost(); return; }
    // Ctrl+R: bläddra bakåt bland tidigare kommandon som innehåller det du skrivit
    if (e.ctrlKey && (e.key === 'r' || e.key === 'R')) {
      e.preventDefault();
      var hr = this.hist[t.histKey || t.kind];
      if (!hr || !hr.list.length) return;
      if (!this.rsearch || this.rsearch.key !== (t.histKey || t.kind)) this.rsearch = { key: t.histKey || t.kind, q: this.el.input.value, from: hr.list.length };
      for (var ri = this.rsearch.from - 1; ri >= 0; ri--) {
        if (hr.list[ri].indexOf(this.rsearch.q) >= 0) { this.rsearch.from = ri; this.el.input.value = hr.list[ri]; this.setStatusHint('(sökning bakåt) ‘' + this.rsearch.q + '’'); this.updateGhost(); return; }
      }
      this.rsearch.from = hr.list.length;
      return;
    }
    if (!(e.ctrlKey && (e.key === 'r' || e.key === 'R'))) this.rsearch = null;
    // Alt+. : sista ordet i föregående kommando (som i bash)
    // Ordvis redigering som i IOS och bash: Alt+B/Alt+F flyttar ett ord, Alt+D raderar ordet framåt, Ctrl+T byter plats på två tecken
    var inpW = this.el.input, cur = inpW.selectionStart, val = inpW.value;
    if (e.altKey && (e.key === 'b' || e.key === 'B' || e.code === 'KeyB')) { e.preventDefault(); var pb = val.slice(0, cur).replace(/\S+\s*$/, '').length; inpW.setSelectionRange(pb, pb); return; }
    if (e.altKey && (e.key === 'f' || e.key === 'F' || e.code === 'KeyF')) { e.preventDefault(); var mf = /^\s*\S+/.exec(val.slice(cur)), pf = cur + (mf ? mf[0].length : 0); inpW.setSelectionRange(pf, pf); return; }
    if (e.altKey && (e.key === 'd' || e.key === 'D' || e.code === 'KeyD')) { e.preventDefault(); var md = /^\s*\S+/.exec(val.slice(cur)); if (md) { inpW.value = val.slice(0, cur) + val.slice(cur + md[0].length); inpW.setSelectionRange(cur, cur); this.updateGhost(); } return; }
    if (e.ctrlKey && (e.key === 't' || e.key === 'T') && val.length > 1) { e.preventDefault(); var pt = cur >= val.length ? val.length - 1 : Math.max(1, cur); inpW.value = val.slice(0, pt - 1) + val[pt] + val[pt - 1] + val.slice(pt + 1); inpW.setSelectionRange(pt + 1, pt + 1); this.updateGhost(); return; }
    if (e.altKey && e.key === '.') {
      e.preventDefault();
      var hl = this.hist[t.histKey || t.kind];
      var prev = hl && hl.list[hl.list.length - 1];
      if (prev) { var wds = prev.trim().split(/\s+/); this.el.input.value += wds[wds.length - 1]; this.updateGhost(); }
      return;
    }
    // Ctrl+D på tom rad loggar ut, som i ett riktigt skal
    if (e.ctrlKey && (e.key === 'd' || e.key === 'D') && !this.el.input.value && !this.busy && (t.kind === 'linux' || t.kind === 'ssh' || t.kind === 'win')) {
      e.preventDefault();
      this.submit(t.kind === 'win' ? 'exit' : (t.ios ? 'exit' : 'logout'));
      return;
    }
    if (e.ctrlKey && e.shiftKey && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); this.copySelection(); return; }
    if (e.ctrlKey && (e.key === '+' || e.key === '=' || e.key === '-')) { e.preventDefault(); NV.settings.set('termFont', Math.max(11, Math.min(28, NV.settings.get('termFont') + (e.key === '-' ? -1 : 1)))); this.applyFont(); return; }
    if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); this.el.screen.scrollTop += (e.key === 'PageUp' ? -1 : 1) * this.el.screen.clientHeight * 0.85; return; }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) NV.sfx.key();
    if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      if (this.busy) { this.abort = true; this.print('^C\n'); return; }
      this.print((this.el.prompt.textContent || '') + this.el.input.value + '^C\n');
      this.el.input.value = '';
      if (s && s.pending) s.pending = null;
      this.renderPrompt();
      return;
    }
    if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (t.ios && s.mode && s.mode !== 'user' && s.mode !== 'exec') {
        this.print(this.el.prompt.textContent + this.el.input.value + '^Z\n');
        this.el.input.value = '';
        s.handle('end');
        this.renderPrompt();
      }
      return;
    }
    if (this.busy) { e.preventDefault(); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      var line = this.el.input.value;
      this.el.input.value = '';
      this.submit(line);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (s && s.complete && !t.garbled) {
        var c = s.complete(this.el.input.value);
        var now = Date.now();
        if (c) { this.el.input.value = c; this.lastTab = 0; }
        else if (this.lastTab && now - this.lastTab < 700) { this.lastTab = 0; this.listCandidates(); }
        else this.lastTab = now;
        this.updateGhost();
      }
      return;
    }
    if (e.key === '?' && t.ios && !(s.pending)) {
      e.preventDefault();
      this.helpNow();
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      var h = this.hist[t.histKey || t.kind] = this.hist[t.histKey || t.kind] || { list: [], idx: 0 };
      if (!h.list.length) return;
      if (e.key === 'ArrowUp') h.idx = Math.max(0, h.idx - 1); else h.idx = Math.min(h.list.length, h.idx + 1);
      this.el.input.value = h.list[h.idx] || '';
      this.updateGhost();
      return;
    }
  };
  P.saveHist = function () {
    var out = {}, self = this;
    Object.keys(this.hist).forEach(function (k) { out[k] = self.hist[k].list.slice(-60); });
    NV.settings.store('krabba-passet.termhist', out);
  };
  // Dubbel-Tab: visa vilka ord som passar när kompletteringen inte är entydig
  P.listCandidates = function () {
    var t = this.top(), s = t && t.session, cur = this.el.input.value;
    var words = [];
    if (t.ios && s && s.help) {
      var h = s.help(cur);
      words = h.split('\n').map(function (l) { return l.trim().split(/\s+/)[0]; }).filter(function (w) { return w && !/^</.test(w) && w !== '%'; });
    } else {
      var m = /(\S*)$/.exec(cur), last = m ? m[1] : '';
      var pool = t.kind === 'win' ? ['ipconfig', 'ping', 'tracert', 'nslookup', 'arp', 'netsh', 'curl', 'copy', 'route', 'netstat', 'getmac', 'hostname', 'whoami', 'systeminfo', 'test-netconnection', 'pathping', 'test-connection', 'resolve-dnsname', 'get-netipaddress', 'get-netadapter', 'net', 'w32tm', 'cls', 'exit', 'help']
        : ['ssh', 'screen', 'ping', 'traceroute', 'tracepath', 'curl', 'nslookup', 'dig', 'resolvectl', 'ip', 'telnet', 'nc', 'man', 'history', 'clear', 'exit', 'nmap', 'mtr', 'ss', 'netstat', 'route', 'ethtool', 'nmcli', 'arping', 'ssh-keygen', 'hostnamectl', 'uname', 'help'];
      words = pool.filter(function (w) { return w.indexOf(last) === 0; });
    }
    if (!words.length) return;
    this.echo(this.el.prompt.textContent, cur);
    this.print(words.join('   ') + '\n');
    this.renderPrompt();
    this.el.input.value = cur;
  };
  P.helpNow = function () {
    var t = this.top();
    if (!t || !t.ios || t.garbled || !t.started) return;
    var s = t.session;
    var cur = this.el.input.value;
    this.echo(this.el.prompt.textContent, cur + '?');
    var h = s.help(cur);
    this.print(h + '\n\n');
    this.renderPrompt();
    this.el.input.value = cur;
    this.focus();
  };

  P.submit = function (line) {
    var t = this.top();
    var s = t.session;
    var secret = s && s.pending && s.pending.secret;
    var shown = secret ? '' : line;
    if (t.garbled) shown = line;
    this.echo(this.el.prompt.textContent || '', shown);
    if (!secret && line.trim()) {
      var h = this.hist[t.histKey || t.kind] = this.hist[t.histKey || t.kind] || { list: [], idx: 0 };
      // Samma kommando två gånger i rad sparas bara en gång (som HISTCONTROL=ignoredups)
      if (h.list[h.list.length - 1] !== line) h.list.push(line);
      if (h.list.length > 200) h.list.splice(0, h.list.length - 200);
      h.idx = h.list.length;
      this.saveHist();
      this.game.logCommand(t, line);
    }
    // Seriell konsol: första Enter "väcker" konsolen
    if (t.kind === 'serial') {
      if (t.garbled) {
        this.print(garble('\n' + (t.session.prompt ? t.session.prompt() : '>') + '\n'));
        this.renderPrompt();
        return;
      }
      if (!t.started) {
        t.started = true;
        if (t.session.booting) { t.session.finishBoot(); }
        if (t.session.banner && !t.bannerShown) { this.print(t.session.banner()); t.bannerShown = true; }
        this.print('\n');
        this.renderPrompt();
        return;
      }
      if (t.waitReturn) {
        t.waitReturn = false;
        t.session.finishBoot && t.session.finishBoot();
        this.print('\n');
        this.renderPrompt();
        return;
      }
    }
    // Ping som körs av kommandot visas som paket i världen
    this.game.cmdActive = true; this.game.pingShown = false;
    var r;
    try { r = s.handle(line) || { out: '' }; } finally { this.game.cmdActive = false; }
    this.consume(r);
  };

  P.consume = function (r) {
    var self = this;
    var t = this.top();
    function finish() {
      if (r.clear) self.el.out.textContent = '';
      if (r.push) { self.pushSession(r.push); return; }
      if (r.close) { self.closeTop(); return; }
      if (r.waitReturn && t) t.waitReturn = true;
      self.renderPrompt();
      self.game.afterCommand();
    }
    var chunks = [];
    if (r.out) chunks.push({ text: r.out + (/\n$/.test(r.out) ? '' : '\n'), delay: r.delay || 0 });
    else if (r.delay) chunks.push({ text: '', delay: r.delay });
    if (r.stream) {
      r.stream.forEach(function (c) { chunks.push(c); });
      chunks.push({ text: '\n', delay: 0 });
    }
    if (!chunks.length) { finish(); return; }
    this.busy = true;
    this.abort = false;
    this.userUp = false;
    this.el.prompt.textContent = '';
    this.updateStatus();
    var i = 0;
    function next() {
      if (self.abort) { self.busy = false; self.abort = false; finish(); return; }
      if (i >= chunks.length) { self.busy = false; finish(); return; }
      var c = chunks[i++];
      var d = Math.min(c.delay || 0, 3200);
      setTimeout(function () { self.print(c.text); next(); }, d * self.game.speedFactor());
    }
    next();
  };

  P.pushSession = function (p) {
    var st = this.game.state;
    if (p.kind === 'serial') {
      var dev = st.devices[p.target];
      var sess = this.game.consoleSession(p.target);
      var entry = { kind: 'serial', session: sess, dev: p.target, speed: p.speed, ios: dev.os === 'ios', histKey: 'con:' + p.target, started: false, title: 'screen /dev/ttyUSB0 ' + p.speed + ' — ' + (dev.config ? dev.config.hostname : dev.label) };
      this.push(entry);
      this.checkSpeed();
      this.print('\n');
      if (sess.booting) { this.print('\n'); }
      else if (dev.config && dev.config.banners && dev.config.banners.motd) this.print(dev.config.banners.motd.text + '\n');
      this.game.onConsoleConnected(p.target, entry.garbled);
    } else if (p.kind === 'ios') {
      var s2 = new NV.IosSession(st, p.dev, { via: p.via, privileged: p.privileged, user: p.user });
      var d2 = st.devices[p.dev];
      this.push({ kind: 'ssh', session: s2, dev: p.dev, ios: true, started: true, histKey: 'ssh:' + p.dev, title: p.via + ' ' + (p.user || '') + '@' + d2.config.hostname });
      if (p.via === 'ssh') this.print('\n');
      if (d2.config.banners && d2.config.banners.motd) this.print(d2.config.banners.motd.text + '\n');
      this.game.onRemoteLogin(p.dev, p.via);
    } else if (p.kind === 'wlc') {
      var w = new NV.WlcSession(st, p.dev);
      this.push({ kind: 'ssh', session: w, dev: p.dev, ios: false, started: true, title: 'ssh admin@WLC-Nordvik' });
      this.print('\n(Cisco Controller)\n');
    } else if (p.kind === 'lb') {
      var lbs = new NV.LbSession(st, p.dev);
      lbs.pending = null;
      this.push({ kind: 'ssh', session: lbs, dev: p.dev, ios: false, started: true, title: 'ssh admin@LB-Nordvik' });
      this.print('\nLB-Nordvik 4.2 (lastbalanserare för tidrapporteringen)\nSkriv help för kommandon.\n');
    }
    this.renderPrompt();
  };
  P.closeTop = function () {
    var t = this.stack.pop();
    if (t && t.kind === 'ssh') this.print('Connection to ' + (t.session.dev && t.session.dev.config ? t.session.dev.config.hostname : 'host') + ' closed.\n');
    if (t && t.kind === 'serial') {
      // Konsolen loggar ut men sessionen finns kvar i enheten
      t.started = false;
      this.print('\n' + (t.session.dev.config ? t.session.dev.config.hostname : '') + ' con0 is now available\n\n\n\nPress RETURN to get started.\n');
      this.stack.push(t);
      this.game.resetConsoleSession(t.dev);
      t.session = this.game.consoleSession(t.dev);
    }
    if (!this.stack.length) { this.hide(); return; }
    this.refreshHeader();
    this.renderPrompt();
  };
  P.popSerial = function (announce) {
    // Stänger screen (Ctrl+A K) eller ssh
    var idx = -1;
    for (var i = this.stack.length - 1; i >= 0; i--) if (this.stack[i].kind === 'serial' || this.stack[i].kind === 'ssh') { idx = i; break; }
    if (idx < 0) return;
    var t = this.stack[idx];
    this.stack = this.stack.slice(0, idx);
    if (announce) this.print('\n' + (t.kind === 'serial' ? '[screen is terminating]' : 'Connection closed.') + '\n');
    this.busy = false;
    this.refreshHeader();
    this.renderPrompt();
    this.focus();
  };

  P.checkSpeed = function () {
    var self = this;
    this.stack.forEach(function (t) {
      if (t.kind !== 'serial') return;
      var dev = self.game.state.devices[t.dev];
      var want = dev.config && dev.config.lines ? dev.config.lines.con.speed : 9600;
      var was = t.garbled;
      t.garbled = want !== t.speed;
      if (t.garbled && !was && t.started) self.print(garble('\n' + 'speed changed\n'));
    });
    this.renderPrompt();
  };

  P.onDeviceLog = function (devId, line) {
    if (!this.open) return;
    var t = this.top();
    if (!t || !t.started) return;
    var show = (t.kind === 'serial' && t.dev === devId) || (t.kind === 'ssh' && t.dev === devId && t.session.monitor);
    if (!show) return;
    if (/%SYS-5-CONFIG_I/.test(line) && t.kind === 'serial') { /* skrivs som vanligt */ }
    var cur = this.el.input.value;
    this.print(line + '\n');
    if (!this.busy) { this.renderPrompt(); this.el.input.value = cur; }
  };

  P.drain = function () {
    var self = this;
    if (this.busy || !this.queue.length) { if (this.queue.length) setTimeout(function () { self.drain(); }, 120); return; }
    var l = this.queue.shift();
    this.submit(l);
    setTimeout(function () { self.drain(); }, 60);
  };

  return Terminal;
})();
