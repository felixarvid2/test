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
    this.el = {
      title: root.querySelector('.term-title'),
      out: root.querySelector('.term-out'),
      prompt: root.querySelector('.term-prompt'),
      input: root.querySelector('.term-input'),
      screen: root.querySelector('.term-screen'),
      disconnect: root.querySelector('[data-act=disconnect]'),
      close: root.querySelector('[data-act=close]'),
      quick: root.querySelector('.term-quick'),
    };
    var self = this;
    this.el.input.addEventListener('keydown', function (e) { self.onKey(e); });
    this.el.screen.addEventListener('mousedown', function (e) { if (e.target === self.el.screen || e.target === self.el.out) setTimeout(function () { self.focus(); }, 0); });
    this.el.close.addEventListener('click', function () { self.hide(); });
    root.querySelector('[data-act="font-"]').addEventListener('click', function () { NV.settings.set('termFont', Math.max(11, NV.settings.get('termFont') - 1)); self.applyFont(); self.focus(); });
    root.querySelector('[data-act="font+"]').addEventListener('click', function () { NV.settings.set('termFont', Math.min(20, NV.settings.get('termFont') + 1)); self.applyFont(); self.focus(); });
    root.querySelector('[data-act="copy"]').addEventListener('click', function () { self.copySelection(); });
    this.applyFont();
    this.el.disconnect.addEventListener('click', function () { self.popSerial(true); });
    this.el.input.addEventListener('paste', function (e) {
      var txt = (e.clipboardData || window.clipboardData).getData('text');
      if (txt.indexOf('\n') < 0) return;
      e.preventDefault();
      var lines = txt.replace(/\r/g, '').split('\n');
      lines.forEach(function (l, i) { if (i < lines.length - 1 || l) self.queue.push(l); });
      self.drain();
    });
    NV.onLog = function (devId, line) { self.onDeviceLog(devId, line); };
    NV.onConsoleSpeed = function () { self.checkSpeed(); };
  }
  var P = Terminal.prototype;

  P.top = function () { return this.stack[this.stack.length - 1]; };
  P.applyFont = function () { this.el.screen.style.fontSize = NV.settings.get('termFont') + 'px'; };
  P.copySelection = function () {
    var sel = window.getSelection ? String(window.getSelection()) : '';
    if (!sel) { this.game.ui.toast('Markera text i terminalen först, sedan Kopiera.'); return; }
    this.game.ui.copyText(sel);
  };
  P.focus = function () { try { this.el.input.focus({ preventScroll: true }); } catch (e) { this.el.input.focus(); } };

  P.show = function () {
    this.root.classList.remove('hidden');
    this.open = true;
    this.game.world.unlock();
    this.focus();
    this.refreshHeader();
  };
  P.hide = function () {
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

  P.print = function (text) {
    if (!text) return;
    var t = this.top();
    if (t && t.garbled) text = garble(text);
    var out = this.el.out;
    out.appendChild(document.createTextNode(text));
    // Begränsa mängden text
    if (out.childNodes.length > 1500) { for (var i = 0; i < 300; i++) out.removeChild(out.firstChild); }
    this.scroll();
  };
  P.scroll = function () { this.el.screen.scrollTop = this.el.screen.scrollHeight; };
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
    var secret = s && s.pending && s.pending.secret;
    this.el.input.type = secret ? 'password' : 'text';
    this.scroll();
  };

  P.onKey = function (e) {
    var t = this.top();
    if (!t) return;
    var s = t.session;
    if (e.ctrlKey && (e.key === 'a' || e.key === 'A')) { this.ctrlA = true; e.preventDefault(); return; }
    if (this.ctrlA) {
      this.ctrlA = false;
      if (e.key === 'k' || e.key === 'K' || e.key === '\\') { e.preventDefault(); this.popSerial(true); return; }
    }
    if (e.key === 'Escape') { e.preventDefault(); this.hide(); return; }
    if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); this.el.out.textContent = ''; this.renderPrompt(); return; }
    if (e.ctrlKey && e.shiftKey && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); this.copySelection(); return; }
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
        if (c) this.el.input.value = c;
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
      return;
    }
  };
  P.helpNow = function () {
    var t = this.top();
    if (!t || !t.ios || t.garbled || !t.started) return;
    var s = t.session;
    var cur = this.el.input.value;
    this.print(this.el.prompt.textContent + cur + '?\n');
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
    this.print((this.el.prompt.textContent || '') + shown + '\n');
    if (!secret && line.trim()) {
      var h = this.hist[t.histKey || t.kind] = this.hist[t.histKey || t.kind] || { list: [], idx: 0 };
      h.list.push(line); h.idx = h.list.length;
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
    var r = s.handle(line) || { out: '' };
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
    this.el.prompt.textContent = '';
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
      this.game.onConsoleConnected(p.target, entry.garbled);
    } else if (p.kind === 'ios') {
      var s2 = new NV.IosSession(st, p.dev, { via: p.via, privileged: p.privileged, user: p.user });
      var d2 = st.devices[p.dev];
      this.push({ kind: 'ssh', session: s2, dev: p.dev, ios: true, started: true, histKey: 'ssh:' + p.dev, title: p.via + ' ' + (p.user || '') + '@' + d2.config.hostname });
      if (p.via === 'ssh') this.print('\n');
      this.game.onRemoteLogin(p.dev, p.via);
    } else if (p.kind === 'wlc') {
      var w = new NV.WlcSession(st, p.dev);
      this.push({ kind: 'ssh', session: w, dev: p.dev, ios: false, started: true, title: 'ssh admin@WLC-Nordvik' });
      this.print('\n(Cisco Controller)\n');
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
