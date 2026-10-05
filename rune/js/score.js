// Rune – poängräkning. Ger ett ctx med slutpoäng och en händelselista för animationen.
//
// Ordning (som Balatro): för varje mönster: mönstrets grundvärde → varje runa (med triggers)
// → reaktioner → reliker per mönster. Sedan kedjebonus, kvarliggande runor och till sist
// relikernas huvudeffekter från vänster till höger.
(function () {
  'use strict';
  var R = (typeof window !== 'undefined' ? window : globalThis).R;

  // Avtrycket/Tankestormen: hitta vilken relik en relik egentligen kör.
  R.resolveRelic = function (G, inst, depth) {
    depth = depth || 0;
    var d = R.RELIC[inst.id];
    if (!d.copy) return { def: d, inst: inst };
    if (depth > 8) return null;
    var k = G.relics.indexOf(inst);
    var tgt = d.copy === 'right' ? G.relics[k + 1] : G.relics[0];
    if (!tgt || tgt === inst) return null;
    return R.resolveRelic(G, tgt, depth + 1);
  };
  // Kör en kopierbar krok på alla aktiva reliker.
  R.eachRelic = function (G, hook, fn) {
    G.relics.slice().forEach(function (inst) {
      if (inst.off) return;
      var res = R.resolveRelic(G, inst);
      if (!res || !res.def[hook]) return;
      fn(res.def, res.inst, inst);
    });
  };

  function reactVals(rules) {
    return {
      sol: rules.rtSol || 1,
      eld: rules.rmEld || 6,
      mane: rules.rsMane || 1,
      dod: rules.rxDod || 2,
      natur: rules.rcNatur || 10,
      blixt: rules.rxBlixt || 1.5,
      kristall: rules.rcKristall || 40
    };
  }
  R.reactVals = reactVals;

  R.score = function (G, opts) {
    opts = opts || {};
    var board = G.board;
    var rules = G.rules();
    var E = R.effective(board, rules);
    var boss = G.activeBoss();
    var weak = function (i) { return !!(boss && boss.weak && board[i] && boss.weak(G, board[i].rune)); };

    var pats = R.detect(board, rules).filter(function (p) { return p.cells.some(function (i) { return board[i].fresh; }); });
    pats.forEach(function (p) { p.cells.sort(function (a, b) { return a - b; }); });
    pats.sort(function (a, b) { return a.cells[0] - b.cells[0] || R.PATTERN_IDS.indexOf(a.type) - R.PATTERN_IDS.indexOf(b.type); });
    if (boss && boss.gate) pats = boss.gate(G, pats);

    var inPat = {};
    pats.forEach(function (p) { p.cells.forEach(function (i) { inPat[i] = 1; }); });
    var placed = [], los = [];
    for (var i = 0; i < 25; i++) {
      if (!board[i] || !board[i].fresh) continue;
      placed.push(i);
      if (!inPat[i] && (board[i].rune.enh === 'sten' || rules.splash)) los.push(i);
    }
    if (los.length) pats.push({ type: 'los', cells: los, sym: null, key: 'los' });

    var scoringSet = {};
    pats.forEach(function (p) { p.cells.forEach(function (i) { scoringSet[i] = 1; }); });
    var scoringIdx = Object.keys(scoringSet).map(Number).sort(function (a, b) { return a - b; });
    var held = [];
    for (i = 0; i < 25; i++) if (board[i] && !scoringSet[i]) held.push(i);

    var real = pats.filter(function (p) { return p.type !== 'los'; });
    var ctx = {
      G: G, board: board, eff: E.eff, mask: E.mask, rules: rules, pats: pats, real: real, realN: real.length,
      placed: placed, placedN: placed.length, placedRunes: placed.map(function (i) { return board[i].rune; }), scoringIdx: scoringIdx, held: held,
      first: G.blindCasts === 0, last: G.casts <= 1,
      chips: 0, mult: 0, money: 0, ev: [], destroy: [], reactN: 0, consumedN: scoringIdx.length, preview: !!opts.preview
    };
    ctx.is = function (i, s) { return E.mask[i] != null && ((E.mask[i] >> s) & 1) === 1; };
    ctx.hasType = function (t) { return real.some(function (p) { return p.type === t; }); };
    ctx.typeN = function () { var o = {}; real.forEach(function (p) { o[p.type] = 1; }); return Object.keys(o).length; };
    ctx.distinctSyms = function () {
      var o = {}, wild = 0;
      scoringIdx.forEach(function (i) {
        var m = E.mask[i]; if (!m) return;
        if ((m & (m - 1)) !== 0) wild++; else o[E.eff[i]] = 1;
      });
      return Math.min(7, Object.keys(o).length + wild);
    };
    ctx.note = function (st, msg) {
      var inst = G.relics.filter(function (r) { return r.st === st; })[0];
      if (inst) push({ k: 'note', relic: inst.uid, msg: msg });
    };
    function push(e) { e.c = ctx.chips; e.m = ctx.mult; ctx.ev.push(e); }
    ctx.push = push;
    function apply(eff, at) {
      if (!eff) return;
      if (eff.chips) { ctx.chips += eff.chips; push({ k: 'chips', v: eff.chips, at: at }); }
      if (eff.mult) { ctx.mult += eff.mult; push({ k: 'mult', v: eff.mult, at: at }); }
      if (eff.xmult && eff.xmult !== 1) { ctx.mult *= eff.xmult; push({ k: 'xmult', v: eff.xmult, at: at }); }
      if (eff.money) { ctx.money += eff.money; push({ k: 'money', v: eff.money, at: at }); }
      if (eff.msg) push({ k: 'msg', v: eff.msg, at: at });
    }
    ctx.apply = apply;

    // Reaktioner per mönster (behövs innan "before"-krokarna).
    var nb = rules.diagCat ? R.around : R.orth;
    var RV = reactVals(rules);
    real.forEach(function (p) {
      var inP = {}; p.cells.forEach(function (c) { inP[c] = 1; });
      var seen = {}, list = [];
      // Katalysatorn måste vara en symbol som inte redan finns i mönstret.
      var pMask = 0;
      if (p.sym != null) pMask = 1 << p.sym;
      else p.cells.forEach(function (c) { if (E.eff[c] != null) pMask |= 1 << E.eff[c]; });
      p.cells.forEach(function (c) {
        nb(c).forEach(function (j) {
          if (inP[j] || !board[j] || E.eff[j] == null || weak(j)) return;
          if (E.mask[j] & pMask) return;
          var s = E.eff[j];
          if (seen[s]) return;
          seen[s] = 1; list.push({ sym: s, cell: j });
        });
      });
      list.sort(function (a, b) { return a.sym - b.sym; });
      p.reacts = list;
      ctx.reactN += list.length * (rules.reactTwice ? 2 : 1);
    });

    // Före poängräkningen: skalande reliker uppdaterar sig.
    if (!ctx.preview) G.relics.slice().forEach(function (inst) {
      if (inst.off) return;
      var d = R.RELIC[inst.id];
      if (d.before) d.before(ctx, inst.st, inst);
    });

    if (!pats.length) { ctx.score = 0; ctx.empty = true; return ctx; }

    var firstScored = true;
    pats.forEach(function (p, pi) {
      var lvl = G.levels[p.type] || 1;
      if (p.type !== 'los') {
        ctx.chips += R.patChips(p.type, lvl);
        ctx.mult += R.patMult(p.type, lvl);
      }
      push({ k: 'pat', p: p, lvl: lvl });
      var lit = 0;
      p.reacts && p.reacts.forEach(function (rc) {
        push({ k: 'react', p: p, sym: rc.sym, cell: rc.cell });
        if (rc.sym === R.SOL) lit += RV.sol * (rules.reactTwice ? 2 : 1);
      });
      p.cells.forEach(function (ci) {
        var rn = board[ci].rune;
        if (weak(ci)) { push({ k: 'weak', at: { cell: ci } }); return; }
        var n = 1 + (rn.seal === 'rod' ? 1 : 0) + lit;
        R.eachRelic(G, 'retrig', function (d, src) { n += d.retrig(ctx, src.st, rn, ci, p) || 0; });
        for (var t = 0; t < n; t++) {
          if (t > 0) push({ k: 'msg', v: 'Igen!', at: { cell: ci } });
          scoreRune(ctx, rn, ci, p, apply);
        }
        firstScored = false;
      });
      // Reaktionernas effekter.
      (p.reacts || []).forEach(function (rc) {
        var times = rules.reactTwice ? 2 : 1;
        for (var t = 0; t < times; t++) {
          var at = { cell: rc.cell };
          switch (rc.sym) {
            case R.ELD: apply({ mult: RV.eld }, at); break;
            case R.MANE: apply({ money: RV.mane }, at); break;
            case R.DOD: apply({ xmult: RV.dod }, at); if (ctx.destroy.indexOf(rc.cell) < 0) ctx.destroy.push(rc.cell); break;
            case R.NATUR: apply({ chips: RV.natur * p.cells.length }, at); break;
            case R.BLIXT: apply({ xmult: RV.blixt }, at); break;
            case R.KRISTALL: apply({ chips: RV.kristall }, at); break;
          }
        }
      });
      R.eachRelic(G, 'pattern', function (d, src, disp) { apply(d.pattern(ctx, src.st, p), { relic: disp.uid }); });
    });

    // Kedjebonus.
    if (ctx.realN >= 2) {
      var x = rules.chainX ? Math.pow(rules.chainX, ctx.realN - 1) : 1 + (rules.chainStep || 0.25) * (ctx.realN - 1);
      ctx.mult *= x;
      push({ k: 'chain', n: ctx.realN, v: x });
    }

    // Kvarliggande runor.
    held.forEach(function (hi) {
      var rn = board[hi].rune;
      if (weak(hi)) return;
      var n = 1 + (rn.seal === 'rod' ? 1 : 0);
      R.eachRelic(G, 'heldRetrig', function (d, src) { n += d.heldRetrig(ctx, src.st, rn, hi) || 0; });
      for (var t = 0; t < n; t++) {
        if (rn.enh === 'stal') apply({ xmult: 1.5 }, { cell: hi, held: 1 });
        R.eachRelic(G, 'held', function (d, src) { apply(d.held(ctx, src.st, rn, hi), { cell: hi, held: 1 }); });
      }
    });

    // Relikernas huvudeffekter, från vänster till höger.
    G.relics.slice().forEach(function (inst) {
      if (inst.off) return;
      var at = { relic: inst.uid };
      if (inst.ed === 'folie') apply({ chips: 50 }, at);
      if (inst.ed === 'holo') apply({ mult: 10 }, at);
      var res = R.resolveRelic(G, inst);
      if (res && res.def.cast) apply(res.def.cast(ctx, res.inst.st, res.inst), at);
      if (inst.ed === 'poly') apply({ xmult: 1.5 }, at);
    });

    ctx.score = Math.floor(ctx.chips * ctx.mult);
    push({ k: 'final', v: ctx.score });
    return ctx;
  };

  function scoreRune(ctx, rn, ci, p, apply) {
    var G = ctx.G, at = { cell: ci };
    apply({ chips: R.runeChips(rn) }, at);
    if (rn.enh === 'bonus') apply({ chips: 30 }, at);
    if (rn.enh === 'mult') apply({ mult: 4 }, at);
    if (rn.enh === 'glas') apply({ xmult: 2 }, at);
    if (rn.enh === 'lycka') {
      var hit = false;
      if (G.chance(5)) { apply({ mult: 20 }, at); hit = true; }
      if (G.chance(15)) { apply({ money: 20 }, at); hit = true; }
      if (hit) G.callRelics('lucky');
    }
    if (rn.ed === 'folie') apply({ chips: 50 }, at);
    if (rn.ed === 'holo') apply({ mult: 10 }, at);
    if (rn.ed === 'poly') apply({ xmult: 1.5 }, at);
    if (rn.seal === 'guld') apply({ money: 3 }, at);
    R.eachRelic(G, 'rune', function (d, src, disp) {
      var e = d.rune(ctx, src.st, rn, ci, p);
      if (e) apply(e, { cell: ci, relic: disp.uid });
    });
  }
})();
