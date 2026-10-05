// Rune – spelets tillstånd och regler (ingen DOM här, så att testerna kan köra allt i Node).
(function () {
  'use strict';
  var R = (typeof window !== 'undefined' ? window : globalThis).R;

  R.BASE = { seed: 8, hand: 8, casts: 4, discards: 3, place: 5, slots: 5, cons: 2, money: 4, interestCap: 5 };
  R.ANTE_TARGET = [300, 900, 2600, 7000, 17000, 40000, 90000, 200000];
  R.WIN_ANTE = 8;
  R.blindTarget = function (ante, kind, boss) {
    var base = ante <= 8 ? R.ANTE_TARGET[Math.max(0, ante - 1)] : Math.floor(200000 * Math.pow(3.2, ante - 8));
    var m = kind === 'small' ? 1 : kind === 'big' ? 1.5 : (boss && R.BOSS[boss].mult) || 2;
    return Math.floor(base * m);
  };
  R.BLIND_INFO = {
    small: { n: 'Lärlingens prövning', i: '🕯️', reward: 3 },
    big: { n: 'Mästarens prövning', i: '🔮', reward: 4 },
    boss: { n: 'Väktarens prövning', i: '💀', reward: 5 }
  };

  function Game(seed) {
    seed = seed == null ? Math.floor(Math.random() * 1e9) : seed;
    this.seed = seed;
    this.rng = R.makeRng(seed);
    this.toasts = [];
    this.newRun();
  }
  R.Game = Game;
  var P = Game.prototype;

  // ---- Slump ---------------------------------------------------------------
  P.rnd = function () { return this.rng.next(); };
  P.pick = function (a) { return a[Math.floor(this.rnd() * a.length)]; };
  P.shuffle = function (a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(this.rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
  P.chance = function (n) { return this.rnd() < Math.pow(2, this.mods().oops || 0) / n; };
  P.weighted = function (items, wf) {
    var tot = 0; items.forEach(function (x) { tot += wf(x); });
    var u = this.rnd() * tot;
    for (var i = 0; i < items.length; i++) { u -= wf(items[i]); if (u <= 0) return items[i]; }
    return items[items.length - 1];
  };

  // ---- Ny omgång -------------------------------------------------------------
  P.newRun = function () {
    this.ante = 1;
    this.blindIdx = 0;
    this.money = R.BASE.money;
    this.bag = [];
    for (var s = 0; s < 7; s++) for (var k = 0; k < 6; k++) this.bag.push(R.newRune(s));
    this.relics = [];
    this.cons = [];
    this.vouchers = [];
    this.tags = [];
    this.levels = {}; this.timesUsed = {};
    var self = this;
    R.PATTERN_IDS.concat(['los']).forEach(function (t) { self.levels[t] = 1; });
    this.stats = { played: {}, skipped: 0, rist: 0, stars: 0, casts: 0, best: 0, discarded: 0, sold: 0, rerolls: 0, destroyed: 0, blinds: 0 };
    this.handPenalty = 0;
    this.board = new Array(25).fill(null);
    this.hand = []; this.draw = []; this.discardPile = [];
    this.hidden = {};
    this.blocked = [];
    this.lastCons = null;
    this.phase = 'select';
    this.blind = null;
    this.makeAnteBlinds();
    this.shop = null; this.pack = null;
    this.endless = false;
  };

  P.makeAnteBlinds = function () {
    var a = this.ante, self = this;
    var fin = a % R.WIN_ANTE === 0;
    var pool = R.BOSSES.filter(function (b) { return fin ? b.fin : (!b.fin && (b.min || 1) <= a); });
    var used = this.usedBosses || (this.usedBosses = []);
    var fresh = pool.filter(function (b) { return used.indexOf(b.id) < 0; });
    if (!fresh.length) { this.usedBosses = used = used.filter(function (id) { return !pool.some(function (b) { return b.id === id; }); }); fresh = pool; }
    var boss = this.pick(fresh).id;
    used.push(boss);
    this.blinds = [
      { kind: 'small', state: 'next', tag: this.pick(R.TAGS).id },
      { kind: 'big', state: 'upcoming', tag: this.pick(R.TAGS).id },
      { kind: 'boss', state: 'upcoming', boss: boss }
    ];
    this.blindIdx = 0;
    if (!this.voucherAnte || this.voucherAnte !== a) { this.voucherAnte = a; this.shopVoucher = this.rollVoucher(); }
    void self;
  };

  // ---- Modifierare och regler ---------------------------------------------
  P.mods = function () {
    var m = {};
    function add(o) { for (var k in o) m[k] = (m[k] || 0) + o[k]; }
    var self = this;
    this.relics.forEach(function (inst) { if (inst.off) return; var d = R.RELIC[inst.id]; if (d.mods) add(d.mods(inst.st, self)); });
    this.vouchers.forEach(function (id) { add(R.VOUCHER[id].mods); });
    return m;
  };
  P.relicRules = function () {
    var r = {};
    this.relics.forEach(function (inst) {
      if (inst.off) return;
      var d = R.RELIC[inst.id]; if (!d.rules) return;
      for (var k in d.rules) { var v = d.rules[k]; r[k] = typeof v === 'number' ? Math.max(r[k] || 0, v) : (r[k] || v); }
    });
    return r;
  };
  P.activeBoss = function () {
    if (!this.blind || this.blind.kind !== 'boss' || this.bossDisabled) return null;
    if (this.relicRules().noBoss) return null;
    return R.BOSS[this.blind.boss];
  };
  P.rules = function () {
    var r = this.relicRules();
    var b = this.activeBoss();
    if (b && b.rules) for (var k in b.rules) r[k] = b.rules[k];
    return r;
  };
  P.handSize = function () { return Math.max(1, R.BASE.hand + (this.mods().hand || 0) - this.handPenalty); };
  P.maxPlace = function () { return R.BASE.place + (this.mods().place || 0); };
  P.relicSlots = function () { return R.BASE.slots + (this.mods().slots || 0) + this.relics.filter(function (r) { return r.ed === 'neg'; }).length; };
  P.consSlots = function () { return R.BASE.cons + (this.mods().cons || 0); };
  P.consUsedSlots = function () { return this.cons.filter(function (c) { return c.ed !== 'neg'; }).length; };

  // ---- Pengar, meddelanden ----------------------------------------------------
  P.gain = function (n, src) {
    if (!n) return;
    this.money += n;
    this.toast((n > 0 ? '+$' + n : '−$' + (-n)) + (src ? ' · ' + src : ''), n > 0 ? 'money' : 'bad');
  };
  P.toast = function (msg, kind) { this.toasts.push({ msg: msg, kind: kind || 'info' }); };

  // ---- Reliker ---------------------------------------------------------------
  P.sellValue = function (inst) {
    var d = inst.kind ? R.consDef(inst) : R.RELIC[inst.id];
    var base = inst.kind ? (inst.kind === 'eko' ? 4 : 3) : d.c + R.edCost(inst.ed);
    return Math.max(1, Math.floor(base / 2)) + (inst.sv || 0);
  };
  R.edCost = function (ed) { return ed === 'folie' ? 2 : ed === 'holo' ? 3 : ed === 'poly' ? 5 : ed === 'neg' ? 5 : 0; };
  P.ownedIds = function () {
    var o = {};
    this.relics.forEach(function (r) { o[r.id] = 1; });
    if (this.shop) this.shop.cards.forEach(function (c) { if (c.type === 'relic') o[c.inst.id] = 1; });
    if (this.pack) this.pack.items.forEach(function (c) { if (c.type === 'relic') o[c.inst.id] = 1; });
    return o;
  };
  P.makeRelic = function (rar, id) {
    if (!id) {
      if (!rar) { var u = this.rnd(); rar = u < 0.7 ? 'C' : u < 0.95 ? 'U' : 'R'; }
      var owned = this.rules().showman ? {} : this.ownedIds();
      var pool = R.RELICS.filter(function (d) { return d.r === rar && !owned[d.id]; });
      if (!pool.length) pool = R.RELICS.filter(function (d) { return d.r === rar; });
      id = this.pick(pool).id;
    }
    var inst = { uid: R.uid(), id: id, ed: null, st: {}, sv: 0 };
    var d = R.RELIC[id];
    if (d.init) d.init(inst.st, this);
    return inst;
  };
  P.rollEdition = function (allowNeg) {
    var k = this.mods().edRate ? 2 : 1, u = this.rnd();
    if (u < 0.03 * k) return 'folie';
    if (u < 0.05 * k) return 'holo';
    if (u < 0.056 * k) return 'poly';
    if (allowNeg && u < 0.061 * k) return 'neg';
    return null;
  };
  P.addRelic = function (inst) {
    if (inst.ed !== 'neg' && this.relics.length >= this.relicSlots()) return false;
    this.relics.push(inst);
    return true;
  };
  P.destroyRelic = function (inst, msg) {
    var k = this.relics.indexOf(inst);
    if (k < 0) return;
    this.relics.splice(k, 1);
    this.toast(R.RELIC[inst.id].n + (msg ? ': ' + msg : ' förstördes'), 'bad');
  };
  P.callRelics = function (hook) {
    var args = Array.prototype.slice.call(arguments, 1), self = this;
    this.relics.slice().forEach(function (inst) {
      if (inst.off) return;
      var d = R.RELIC[inst.id];
      if (d[hook]) d[hook].apply(null, [self, inst.st].concat(args).concat([inst]));
    });
  };
  P.moveRelic = function (from, to) {
    if (from === to || from < 0 || to < 0 || from >= this.relics.length || to >= this.relics.length) return;
    var x = this.relics.splice(from, 1)[0];
    this.relics.splice(to, 0, x);
  };

  // ---- Förbrukningskort -----------------------------------------------------
  P.consName = function (c) { return R.consDef(c).n; };
  P.randomCons = function (kind, exclude) {
    var list = kind === 'star' ? R.STARS : kind === 'rist' ? R.RISTS : R.EKOS;
    var pool = list.filter(function (c) { return c.id !== exclude; });
    if (kind === 'eko') pool = pool.filter(function (c) { return c.id !== 'sjalen' && c.id !== 'svarta_halet'; }).concat(this.rnd() < 0.06 ? [R.CONS.eko.sjalen, R.CONS.eko.svarta_halet] : []);
    return this.pick(pool).id;
  };
  P.addCons = function (kind, id, exclude) {
    if (this.consUsedSlots() >= this.consSlots()) return false;
    this.cons.push({ uid: R.uid(), kind: kind, id: id || this.randomCons(kind, exclude), ed: null, sv: 0 });
    return true;
  };
  P.canUseCons = function (c, sel) {
    var d = R.consDef(c);
    var n = (sel || []).length;
    if (d.need > 0) {
      if (n < (d.min || 1) || n > d.need) return false;
    }
    if (d.can && !d.can(this)) return false;
    return true;
  };
  // Använder kortet c på de valda runorna. Returnerar true om det gick.
  P.useCons = function (c, sel, fromPack) {
    if (!this.canUseCons(c, sel)) return false;
    var d = R.consDef(c);
    if (!fromPack) { var k = this.cons.indexOf(c); if (k >= 0) this.cons.splice(k, 1); }
    d.use(this, sel || []);
    if (c.kind === 'rist') this.stats.rist++;
    if (c.kind === 'star') this.stats.stars++;
    if (c.kind !== 'eko' && c.id !== 'ansuz') this.lastCons = { kind: c.kind, id: c.id };
    this.callRelics('useCons', c);
    return true;
  };
  P.levelUp = function (t, n, silent) {
    if (!t || t === 'los') return;
    this.levels[t] = (this.levels[t] || 1) + n;
    if (!silent) this.toast(R.PATTERNS[t].name + ' → nivå ' + this.levels[t], 'level');
  };
  P.mostPlayed = function () {
    var best = 'trio', bn = -1, pl = this.stats.played;
    R.PATTERN_IDS.forEach(function (t) { if ((pl[t] || 0) > bn) { bn = pl[t] || 0; best = t; } });
    return best;
  };

  // ---- Runor -----------------------------------------------------------------
  P.addRunes = function (runes, toHand) {
    var self = this;
    runes.forEach(function (r) {
      self.bag.push(r);
      if (self.phase === 'round') {
        if (toHand) self.hand.push(r);
        else self.draw.splice(Math.floor(self.rnd() * (self.draw.length + 1)), 0, r);
      } else if (toHand && self.pack && self.pack.hand) self.pack.hand.push(r);
    });
    this.callRelics('added', runes);
  };
  P.destroyRunes = function (runes, why) {
    var self = this;
    runes = runes.filter(function (r) { return self.bag.indexOf(r) >= 0; });
    if (!runes.length) return;
    runes.forEach(function (r) {
      [self.bag, self.hand, self.draw, self.discardPile].forEach(function (a) { var k = a.indexOf(r); if (k >= 0) a.splice(k, 1); });
      if (self.pack && self.pack.hand) { var k = self.pack.hand.indexOf(r); if (k >= 0) self.pack.hand.splice(k, 1); }
      for (var i = 0; i < 25; i++) if (self.board[i] && self.board[i].rune === r) self.board[i] = null;
    });
    this.stats.destroyed += runes.length;
    this.callRelics('destroyed', runes, why);
  };
  P.drawTo = function () {
    var n = this.handSize(), fog = this.rules().fog;
    while (this.hand.length < n && this.draw.length) {
      var r = this.draw.pop();
      this.hand.push(r);
      if (fog) { this.fogCount = (this.fogCount || 0) + 1; if (this.fogCount % 3 === 0) this.hidden[r.uid] = 1; }
    }
  };

  // ---- Prövningar -----------------------------------------------------------
  P.currentBlind = function () { return this.blinds[this.blindIdx]; };
  P.selectBlind = function () {
    if (this.phase !== 'select') return;
    var b = this.currentBlind();
    b.state = 'current';
    this.blind = { kind: b.kind, boss: b.boss || null };
    this.target = R.blindTarget(this.ante, b.kind, b.boss);
    this.score = 0;
    this.phase = 'round';
    this.bossDisabled = false;
    this.bossType = null; this.bossSym = null; this.blocked = [];
    this.board = new Array(25).fill(null);
    this.hidden = {}; this.fogCount = 0;
    this.blindCasts = 0; this.blindDiscards = 0; this.blindPlayed = {};
    var m = this.mods();
    this.casts = Math.max(1, R.BASE.casts + (m.casts || 0));
    this.discards = m.noDiscards ? 0 : Math.max(0, R.BASE.discards + (m.discards || 0));
    this.draw = this.shuffle(this.bag.slice());
    this.hand = []; this.discardPile = [];
    var boss = this.activeBoss();
    if (boss && boss.setup) boss.setup(this);
    var self = this;
    R.eachRelic(this, 'blindSelect', function (d, src, disp) { d.blindSelect(self, src.st, disp); });
    this.seedBoard(R.BASE.seed + (m.seed || 0));
    this.drawTo();
    this.stats.blinds++;
  };
  P.skipBlind = function () {
    var b = this.currentBlind();
    if (this.phase !== 'select' || b.kind === 'boss') return;
    b.state = 'skipped';
    this.stats.skipped++;
    var t = R.TAG[b.tag];
    if (t.now) t.now(this); else this.tags.push(t.id);
    this.toast('Märke: ' + t.n, 'level');
    this.blindIdx++;
    this.blinds[this.blindIdx].state = 'next';
  };

  // Altaret börjar med några runor ur påsen, utplacerade så att inget mönster redan finns.
  P.seedBoard = function (n) {
    var rules = this.rules();
    for (var k = 0; k < n && this.draw.length; k++) {
      var rn = this.draw.pop(), done = false;
      for (var t = 0; t < 30 && !done; t++) {
        var i = Math.floor(this.rnd() * 25);
        if (this.board[i] || this.blocked.indexOf(i) >= 0) continue;
        this.board[i] = { rune: rn, fresh: false };
        if (R.detect(this.board, rules).length) { this.board[i] = null; continue; }
        done = true;
      }
      if (!done) this.draw.unshift(rn);
    }
  };

  // ---- Placering ----------------------------------------------------------
  P.freshCount = function () { var n = 0; for (var i = 0; i < 25; i++) if (this.board[i] && this.board[i].fresh) n++; return n; };
  P.canPlace = function (cell) {
    return this.phase === 'round' && !this.board[cell] && this.blocked.indexOf(cell) < 0 && this.freshCount() < this.maxPlace();
  };
  P.place = function (rune, cell) {
    var k = this.hand.indexOf(rune);
    if (k < 0 || !this.canPlace(cell)) return false;
    this.hand.splice(k, 1);
    this.board[cell] = { rune: rune, fresh: true };
    delete this.hidden[rune.uid];
    return true;
  };
  P.unplace = function (cell) {
    var c = this.board[cell];
    if (!c || !c.fresh) return false;
    this.board[cell] = null;
    this.hand.push(c.rune);
    return true;
  };
  P.unplaceAll = function () { for (var i = 0; i < 25; i++) if (this.board[i] && this.board[i].fresh) this.unplace(i); };
  P.previewPatterns = function () {
    var self = this;
    return R.detect(this.board, this.rules()).filter(function (p) { return p.cells.some(function (i) { return self.board[i].fresh; }); });
  };
  P.castError = function () {
    var n = this.freshCount();
    if (this.phase !== 'round') return 'Ingen prövning pågår.';
    if (!n) return 'Placera minst en runa på brädet.';
    var b = this.activeBoss();
    if (b && b.check) return b.check(this, n);
    return null;
  };

  // Lägg: placerade runor som inte bildar något mönster ligger kvar utan att ett kast går åt.
  // Du drar inga nya runor.
  P.canLay = function () {
    if (this.phase !== 'round' || !this.freshCount()) return false;
    if (this.rules().splash) return false;
    for (var i = 0; i < 25; i++) if (this.board[i] && this.board[i].fresh && this.board[i].rune.enh === 'sten') return false;
    return this.previewPatterns().length === 0;
  };
  P.lay = function () {
    if (!this.canLay()) return false;
    for (var i = 0; i < 25; i++) if (this.board[i]) this.board[i].fresh = false;
    this.checkStuck();
    return true;
  };
  // Går det inte att göra något mer förloras prövningen.
  P.checkStuck = function () {
    if (this.phase !== 'round') return;
    var boardRunes = this.board.some(function (c) { return c; });
    if (!this.hand.length && (this.discards <= 0 || (!this.draw.length) || !boardRunes)) this.lose();
    var self = this, free = false;
    for (var i = 0; i < 25; i++) if (!this.board[i] && this.blocked.indexOf(i) < 0) free = true;
    if (!free && this.discards <= 0 && !this.board.some(function (c) { return c && c.fresh; })) this.lose();
    void self;
  };

  // Kastar: räknar poäng och uppdaterar allt. Returnerar ctx (med händelser för animationen).
  P.cast = function () {
    if (this.castError()) return null;
    var boss = this.activeBoss(), self = this;
    if (boss && boss.beforeCast) boss.beforeCast(this);
    var ctx = R.score(this);
    this.score += ctx.score;
    this.stats.best = Math.max(this.stats.best, ctx.score);
    this.stats.casts++;
    if (ctx.money) this.money += ctx.money;
    this.casts--;
    this.blindCasts++;
    ctx.real.forEach(function (p) {
      self.blindPlayed[p.type] = (self.blindPlayed[p.type] || 0) + 1;
      self.stats.played[p.type] = (self.stats.played[p.type] || 0) + 1;
    });
    if (ctx.real.length) this.lastPattern = ctx.real[ctx.real.length - 1].type;

    // Glas krossas, Förbannad förstör katalysatorn.
    var broken = [];
    ctx.scoringIdx.forEach(function (i) {
      var c = self.board[i];
      if (c && c.rune.enh === 'glas' && self.chance(4)) broken.push(c.rune);
    });
    var cursed = ctx.destroy.map(function (i) { return self.board[i] && self.board[i].rune; }).filter(Boolean);
    ctx.broken = broken.map(function (r) { return r.uid; });
    ctx.cursed = cursed.map(function (r) { return r.uid; });
    // Förbrukade runor lämnar brädet.
    ctx.removed = [];
    ctx.scoringIdx.forEach(function (i) { var c = self.board[i]; if (c) { self.discardPile.push(c.rune); ctx.removed.push(i); self.board[i] = null; } });
    if (broken.length) this.destroyRunes(broken, 'glas');
    if (cursed.length) this.destroyRunes(cursed, 'reaktion');
    for (var i = 0; i < 25; i++) if (this.board[i]) this.board[i].fresh = false;

    this.relics.slice().forEach(function (inst) {
      if (inst.off) return;
      var d = R.RELIC[inst.id];
      if (d.after) d.after(ctx, inst.st, inst);
    });
    if (boss && boss.after) boss.after(this, ctx);
    if (boss && boss.cleanup) boss.cleanup(this);

    if (this.score >= this.target) this.winBlind();
    else if (this.casts <= 0) this.lose();
    else {
      this.drawTo();
      if (!this.hand.length && !this.draw.length) this.lose();
    }
    return ctx;
  };

  // Byte: runor från handen (och gamla runor från brädet).
  P.discardSel = function (handRunes, boardCells) {
    boardCells = boardCells || [];
    var n = handRunes.length + boardCells.length;
    if (this.phase !== 'round' || this.discards <= 0 || !n || n > this.maxPlace()) return false;
    var self = this, out = [];
    handRunes.forEach(function (r) { var k = self.hand.indexOf(r); if (k >= 0) { self.hand.splice(k, 1); out.push(r); } });
    boardCells.forEach(function (i) { var c = self.board[i]; if (c && !c.fresh) { self.board[i] = null; out.push(c.rune); } });
    out.forEach(function (r) {
      self.discardPile.push(r);
      if (r.seal === 'lila') self.addCons('rist');
    });
    this.discards--;
    this.blindDiscards++;
    this.stats.discarded += out.length;
    this.callRelics('discard', out);
    this.drawTo();
    this.checkStuck();
    return true;
  };
  P.hookDiscard = function (n) {
    for (var k = 0; k < n && this.hand.length; k++) {
      var r = this.hand.splice(Math.floor(this.rnd() * this.hand.length), 1)[0];
      this.discardPile.push(r);
    }
  };
  P.burnLeftovers = function () {
    for (var i = 0; i < 25; i++) if (this.board[i]) { this.discardPile.push(this.board[i].rune); this.board[i] = null; }
  };
  P.rotateBoard = function () {
    var nb = new Array(25).fill(null), bl = [];
    for (var r = 0; r < 5; r++) for (var c = 0; c < 5; c++) nb[c * 5 + (4 - r)] = this.board[r * 5 + c];
    this.blocked.forEach(function (i) { var r = Math.floor(i / 5), c = i % 5; bl.push(c * 5 + (4 - r)); });
    this.board = nb; this.blocked = bl;
  };
  P.gravity = function () {
    for (var c = 0; c < 5; c++) {
      var r = 4;
      while (r >= 0) {
        // Segment nedifrån till närmaste blockerade ruta.
        var seg = [];
        while (r >= 0 && this.blocked.indexOf(r * 5 + c) < 0) { seg.push(r * 5 + c); r--; }
        var items = seg.map(function (i) { return this.board[i]; }, this).filter(Boolean);
        for (var k = 0; k < seg.length; k++) this.board[seg[k]] = items[k] || null;
        r--;
      }
    }
  };

  // ---- Vinst och förlust ---------------------------------------------------
  P.winBlind = function () {
    var b = this.currentBlind(), self = this;
    b.state = 'done';
    // Guld-runor och blå sigill på brädet.
    var lines = [];
    var info = R.BLIND_INFO[b.kind];
    lines.push({ t: info.n, v: info.reward });
    if (this.casts > 0) lines.push({ t: 'Kast kvar (' + this.casts + ' × $1)', v: this.casts });
    var gold = 0;
    for (var i = 0; i < 25; i++) {
      var c = this.board[i]; if (!c) continue;
      if (c.rune.enh === 'guld') gold += 3;
      if (c.rune.seal === 'bla' && this.lastPattern) this.addCons('star', this.lastPattern);
    }
    if (gold) lines.push({ t: 'Guld-runor på brädet', v: gold });
    this.callRelics('roundEnd');
    this.relics.forEach(function (inst) {
      if (inst.off) return;
      var d = R.RELIC[inst.id];
      if (d.cashout) { var v = d.cashout(self, inst.st); if (v) lines.push({ t: d.n, v: v }); }
    });
    var m = this.mods();
    var cap = R.BASE.interestCap + (m.interestCap || 0);
    var per = Math.min(cap, Math.floor(Math.max(0, this.money) / 5));
    var interest = per * (1 + (m.interest || 0));
    if (interest) lines.push({ t: 'Ränta ($1 per $5, högst ' + cap + ')', v: interest });
    this.cashLines = lines;
    this.cashTotal = lines.reduce(function (s, l) { return s + l.v; }, 0);
    this.relics.forEach(function (r) { r.off = false; });
    this.phase = 'cashout';
  };
  P.cashOut = function () {
    if (this.phase !== 'cashout') return;
    this.money += this.cashTotal;
    var wasBoss = this.blind.kind === 'boss';
    this.board = new Array(25).fill(null);
    this.hand = []; this.draw = []; this.blocked = [];
    if (wasBoss && this.ante === R.WIN_ANTE && !this.endless) { this.phase = 'win'; return; }
    this.openShop();
  };
  P.lose = function () { this.phase = 'over'; };
  P.continueEndless = function () { this.endless = true; this.openShop(); };

  // ---- Butiken -------------------------------------------------------------
  P.price = function (base) {
    var m = this.mods(), d = (m.discount || 0) + (this.shop && this.shop.half ? 0.5 : 0);
    return Math.max(base > 0 ? 1 : 0, Math.floor(base * (1 - Math.min(0.75, d)) + 0.0001));
  };
  P.rollShopCard = function () {
    var m = this.mods();
    var wr = 4 * (m.ristRate ? 2 : 1), ws = 4 * (m.starRate ? 2 : 1), u = this.rnd() * (20 + wr + ws);
    if (u < 20) {
      var inst = this.makeRelic();
      inst.ed = this.rollEdition(true);
      return { type: 'relic', inst: inst, cost: this.price(R.RELIC[inst.id].c + R.edCost(inst.ed)) };
    }
    var kind = u < 20 + wr ? 'rist' : 'star';
    var c = { uid: R.uid(), kind: kind, id: this.randomCons(kind), ed: null, sv: 0 };
    var cost = this.price(3);
    if (kind === 'star' && this.rules().astronomer) cost = 0;
    return { type: 'cons', c: c, cost: cost };
  };
  P.rollPack = function () {
    var p = this.weighted(R.PACKS, function (x) { return x.w; });
    var cost = this.price(p.cost);
    if (p.kind === 'star' && this.rules().astronomer) cost = 0;
    return { id: p.id, cost: cost };
  };
  P.rollVoucher = function () {
    var have = this.vouchers;
    var pool = R.VOUCHERS.filter(function (v) { return have.indexOf(v.id) < 0; });
    return pool.length ? this.pick(pool).id : null;
  };
  P.openShop = function () {
    var m = this.mods(), self = this;
    if (this.blind && this.blind.kind === 'boss') { this.ante++; this.makeAnteBlinds(); }
    else { this.blindIdx++; this.blinds[this.blindIdx].state = 'next'; }
    this.phase = 'shop';
    this.shop = { cards: [], packs: [], rerolls: 0, free: m.freeRerolls || 0, half: false };
    var tags = this.tags; this.tags = [];
    if (tags.indexOf('rabatt') >= 0) this.shop.half = true;
    var n = 2 + (m.shopSlots || 0);
    for (var k = 0; k < n; k++) this.shop.cards.push(this.rollShopCard());
    this.shop.packs = [this.rollPack(), this.rollPack()];
    tags.forEach(function (t) {
      if (t === 'relik') { var inst = self.makeRelic('U'); self.shop.cards.push({ type: 'relic', inst: inst, cost: 0 }); }
      var free = { stjarna: 'star_stor', ristning: 'rist_stor', eko: 'eko', runor: 'run_jatte' }[t];
      if (free) self.shop.packs.push({ id: free, cost: 0 });
    });
  };
  P.rerollCost = function () {
    if (this.shop.free > 0) return 0;
    return Math.max(0, 5 + this.shop.rerolls - (this.mods().rerollDiscount || 0));
  };
  P.reroll = function () {
    var cost = this.rerollCost();
    if (this.money - cost < this.minMoney()) return false;
    if (this.shop.free > 0) this.shop.free--; else { this.money -= cost; this.shop.rerolls++; }
    var n = 2 + (this.mods().shopSlots || 0);
    this.shop.cards = [];
    for (var k = 0; k < n; k++) this.shop.cards.push(this.rollShopCard());
    this.stats.rerolls++;
    this.callRelics('reroll');
    return true;
  };
  P.minMoney = function () { return 0; };
  P.buyCard = function (k) {
    var it = this.shop.cards[k];
    if (!it || this.money - it.cost < this.minMoney()) return false;
    if (it.type === 'relic') {
      if (it.inst.ed !== 'neg' && this.relics.length >= this.relicSlots()) return false;
      this.relics.push(it.inst);
    } else {
      if (it.c.ed !== 'neg' && this.consUsedSlots() >= this.consSlots()) return false;
      this.cons.push(it.c);
    }
    this.money -= it.cost;
    this.shop.cards.splice(k, 1);
    return true;
  };
  // Köp och använd direkt (förbrukningskort som inte kräver valda runor).
  P.buyAndUse = function (k) {
    var it = this.shop.cards[k];
    if (!it || it.type !== 'cons' || this.money - it.cost < this.minMoney()) return false;
    if (!this.canUseCons(it.c, [])) return false;
    this.money -= it.cost;
    this.shop.cards.splice(k, 1);
    this.useCons(it.c, [], true);
    return true;
  };
  P.buyVoucher = function () {
    var id = this.shopVoucher;
    if (!id) return false;
    var cost = this.price(10);
    if (this.money - cost < this.minMoney()) return false;
    this.money -= cost;
    this.vouchers.push(id);
    this.shopVoucher = null;
    if (R.VOUCHER[id].mods.shopSlots) this.shop.cards.push(this.rollShopCard());
    return true;
  };
  P.buyPack = function (k) {
    var it = this.shop.packs[k];
    if (!it || this.money - it.cost < this.minMoney()) return false;
    this.money -= it.cost;
    this.shop.packs.splice(k, 1);
    this.openPack(it.id);
    return true;
  };
  P.openPack = function (id) {
    var p = R.PACK[id], self = this, items = [];
    var ids = {};
    this.pack = { id: id, items: items, left: p.pick, hand: null, back: this.phase };
    for (var k = 0; k < p.show; k++) {
      var it;
      if (p.kind === 'rune') {
        var o = {};
        if (this.rnd() < 0.4) o.enh = this.pick(['bonus', 'mult', 'vild', 'glas', 'stal', 'sten', 'guld', 'lycka']);
        if (this.rnd() < 0.1) o.ed = this.pick(['folie', 'folie', 'holo', 'poly']);
        if (this.rnd() < 0.1) o.seal = this.pick(['rod', 'guld', 'bla', 'lila']);
        it = { type: 'rune', rune: R.newRune(Math.floor(this.rnd() * 7), o) };
      } else if (p.kind === 'relic') {
        var inst = this.makeRelic(); inst.ed = this.rollEdition(true);
        it = { type: 'relic', inst: inst };
      } else {
        var cid, tries = 0;
        do { cid = this.randomCons(p.kind); tries++; } while (ids[cid] && tries < 20);
        if (p.kind === 'star' && k === 0 && this.mods().telescope) cid = this.mostPlayed();
        ids[cid] = 1;
        it = { type: 'cons', c: { uid: R.uid(), kind: p.kind, id: cid, ed: null, sv: 0 } };
      }
      items.push(it);
    }
    if (p.kind === 'rist' || p.kind === 'eko') this.pack.hand = this.shuffle(this.bag.slice()).slice(0, this.handSize());
    this.callRelics('packOpen');
    this.phase = 'pack';
    void self;
  };
  P.pickPack = function (k, sel) {
    var pk = this.pack, it = pk && pk.items[k];
    if (!it || it.taken) return false;
    if (it.type === 'rune') this.addRunes([it.rune], false);
    else if (it.type === 'relic') { if (!this.addRelic(it.inst)) return false; }
    else if (!this.useCons(it.c, sel || [], true)) return false;
    it.taken = true;
    pk.left--;
    if (pk.left <= 0) this.closePack();
    return true;
  };
  P.skipPack = function () { this.callRelics('packSkip'); this.closePack(); };
  P.closePack = function () { this.phase = this.pack.back || 'shop'; this.pack = null; };
  P.leaveShop = function () {
    this.callRelics('shopLeave');
    this.shop = null;
    this.phase = 'select';
  };

  // ---- Sälja ---------------------------------------------------------------
  P.sell = function (item) {
    var k = this.relics.indexOf(item);
    if (k >= 0) {
      this.relics.splice(k, 1);
    } else {
      k = this.cons.indexOf(item);
      if (k < 0) return false;
      this.cons.splice(k, 1);
    }
    var v = this.sellValue(item);
    this.money += v;
    this.stats.sold++;
    this.leafSold = true;
    this.callRelics('sellAny', item);
    return true;
  };

  // ---- Spara / ladda ------------------------------------------------------
  var KEYS = ['seed', 'ante', 'blindIdx', 'money', 'bag', 'relics', 'cons', 'vouchers', 'tags', 'levels', 'stats', 'handPenalty', 'board', 'hand', 'draw',
    'discardPile', 'hidden', 'blocked', 'lastCons', 'phase', 'blind', 'blinds', 'shop', 'pack', 'endless', 'target', 'score', 'casts', 'discards',
    'blindCasts', 'blindDiscards', 'blindPlayed', 'bossType', 'bossSym', 'leafSold', 'cashLines', 'cashTotal', 'usedBosses', 'voucherAnte', 'shopVoucher',
    'lastPattern', 'fogCount', 'bossDisabled'];
  P.save = function () {
    var o = { v: 1, rng: this.rng.state, uid: R.uid() };
    var self = this;
    // Runor delas mellan påse, hand och bräde: spara dem som uid-referenser.
    var map = {};
    this.bag.forEach(function (r) { map[r.uid] = r; });
    KEYS.forEach(function (k) { o[k] = self[k]; });
    o.bag = this.bag;
    var ref = function (r) { return r.uid; };
    o.hand = this.hand.map(ref); o.draw = this.draw.map(ref); o.discardPile = this.discardPile.map(ref);
    o.board = this.board.map(function (c) { return c ? { r: c.rune.uid, f: c.fresh } : null; });
    if (this.pack && this.pack.hand) { o.pack = Object.assign({}, this.pack, { hand: this.pack.hand.map(ref) }); }
    return JSON.stringify(o);
  };
  Game.load = function (str) {
    var o = JSON.parse(str);
    var G = Object.create(P);
    G.toasts = [];
    KEYS.forEach(function (k) { G[k] = o[k]; });
    G.rng = R.makeRng(0); G.rng.state = o.rng;
    R.setUid(o.uid + 1);
    var map = {};
    G.bag.forEach(function (r) { map[r.uid] = r; });
    var deref = function (u) { return map[u]; };
    G.hand = (o.hand || []).map(deref).filter(Boolean);
    G.draw = (o.draw || []).map(deref).filter(Boolean);
    G.discardPile = (o.discardPile || []).map(deref).filter(Boolean);
    G.board = (o.board || new Array(25).fill(null)).map(function (c) { return c && map[c.r] ? { rune: map[c.r], fresh: c.f } : null; });
    if (G.pack && G.pack.hand) G.pack.hand = G.pack.hand.map(deref).filter(Boolean);
    return G;
  };
})();
