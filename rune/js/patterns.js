// Rune – hittar mönster på brädet.
// board: 25 celler, varje null eller { rune, fresh }.
// rules: { lens, crown, smear, bridge, noDiag, ... } (från reliker och väktare)
(function () {
  'use strict';
  var R = (typeof window !== 'undefined' ? window : globalThis).R;
  var ALL = (1 << R.NSYM) - 1;
  var GROUP_A = (1 << R.SOL) | (1 << R.ELD) | (1 << R.BLIXT);
  var GROUP_B = (1 << R.MANE) | (1 << R.DOD) | (1 << R.NATUR);

  // Linjer: rader, kolumner och diagonaler med minst 3 rutor.
  var LINES = [];
  (function () {
    var r, c, k;
    for (r = 0; r < 5; r++) { var row = []; for (c = 0; c < 5; c++) row.push(r * 5 + c); LINES.push({ cells: row, dir: 'h', full: true }); }
    for (c = 0; c < 5; c++) { var col = []; for (r = 0; r < 5; r++) col.push(r * 5 + c); LINES.push({ cells: col, dir: 'v', full: true }); }
    for (k = -2; k <= 2; k++) { // diagonal ↘ där c - r = k
      var d1 = []; for (r = 0; r < 5; r++) { c = r + k; if (c >= 0 && c < 5) d1.push(r * 5 + c); }
      LINES.push({ cells: d1, dir: 'd', full: d1.length === 5 });
    }
    for (k = 2; k <= 6; k++) { // diagonal ↙ där r + c = k
      var d2 = []; for (r = 0; r < 5; r++) { c = k - r; if (c >= 0 && c < 5) d2.push(r * 5 + c); }
      LINES.push({ cells: d2, dir: 'd', full: d2.length === 5 });
    }
  })();
  R.LINES = LINES;

  // Effektiv symbol (Sollinsen) och matchmask per ruta.
  R.effective = function (board, rules) {
    rules = rules || {};
    var eff = new Array(25), mask = new Array(25);
    for (var i = 0; i < 25; i++) {
      var cell = board[i];
      if (!cell) { eff[i] = null; mask[i] = null; continue; }
      var rn = cell.rune, s = rn.sym;
      if (rn.enh === 'sten' || s == null) { eff[i] = null; mask[i] = 0; continue; }
      if (rules.lens && s === R.SOL) {
        var c = i % 5, src = null;
        if (c > 0 && board[i - 1] && board[i - 1].rune.enh !== 'sten' && board[i - 1].rune.sym !== R.SOL) src = board[i - 1].rune.sym;
        else if (c < 4 && board[i + 1] && board[i + 1].rune.enh !== 'sten' && board[i + 1].rune.sym !== R.SOL) src = board[i + 1].rune.sym;
        if (src != null) s = src;
      }
      eff[i] = s;
      var m = 1 << s;
      if (rn.enh === 'vild') m = ALL;
      if (rules.crown && s === R.DOD) m = ALL;
      if (rules.allWild && rules.allWild === s) m = ALL;
      if (rules.smear) m |= (m & GROUP_A ? GROUP_A : 0) | (m & GROUP_B ? GROUP_B : 0);
      mask[i] = m;
    }
    return { eff: eff, mask: mask };
  };

  R.detect = function (board, rules) {
    rules = rules || {};
    var E = R.effective(board, rules), eff = E.eff, mask = E.mask;
    var out = [], seen = {};
    function has(i, s) { return mask[i] != null && (mask[i] & (1 << s)) !== 0; }
    function add(type, cells, s, dir) {
      // Minst en ruta måste "på riktigt" vara symbolen (annars är det bara vildkort som råkar passa).
      if (s != null && !cells.some(function (i) { return eff[i] === s; })) return;
      var key = type + ':' + cells.slice().sort(function (a, b) { return a - b; }).join(',');
      if (seen[key]) return;
      seen[key] = 1;
      out.push({ type: type, cells: cells.slice(), sym: s, dir: dir || null, key: key });
    }

    // Raka linjer.
    LINES.forEach(function (L) {
      if (rules.noDiag && L.dir === 'd') return;
      var cs = L.cells, n = cs.length;
      for (var s = 0; s < R.NSYM; s++) {
        var i = 0;
        while (i < n) {
          if (!has(cs[i], s)) { i++; continue; }
          var run = [cs[i]], gap = false, j = i + 1;
          while (j < n) {
            if (has(cs[j], s)) { run.push(cs[j]); j++; continue; }
            if (rules.bridge && !gap && !board[cs[j]] && j + 1 < n && has(cs[j + 1], s)) { gap = true; j++; continue; }
            break;
          }
          var k = run.length;
          if (k >= 3) {
            var type = k >= 5 ? 'linje' : k === 4 ? 'kvartett' : (L.dir === 'd' ? 'diagonal' : 'trio');
            add(type, run, s, L.dir);
          }
          i = j;
        }
      }
    });

    var r, c, s2;
    // Kvadrat 2×2.
    for (r = 0; r < 4; r++) for (c = 0; c < 4; c++) {
      var sq = [r * 5 + c, r * 5 + c + 1, r * 5 + c + 5, r * 5 + c + 6];
      for (s2 = 0; s2 < R.NSYM; s2++) if (sq.every(function (i) { return has(i, s2); })) add('kvadrat', sq, s2);
    }
    // Kors, ring och monolit kring en inre ruta.
    for (r = 1; r < 4; r++) for (c = 1; c < 4; c++) {
      var ctr = r * 5 + c;
      var cross = [ctr, ctr - 5, ctr + 5, ctr - 1, ctr + 1];
      var ring = [ctr - 6, ctr - 5, ctr - 4, ctr - 1, ctr + 1, ctr + 4, ctr + 5, ctr + 6];
      for (s2 = 0; s2 < R.NSYM; s2++) {
        if (cross.every(function (i) { return has(i, s2); })) add('kors', cross, s2);
        if (ring.every(function (i) { return has(i, s2); })) {
          add('ring', ring, s2);
          if (has(ctr, s2)) add('monolit', ring.concat([ctr]), s2);
        }
      }
    }
    // Regnbåge och spegel på hela rader/kolumner.
    LINES.forEach(function (L) {
      if (L.dir === 'd') return;
      var cs = L.cells;
      if (!cs.every(function (i) { return board[i]; })) return;
      var ms = cs.map(function (i) { return mask[i]; });
      // Regnbåge: tilldela 5 olika symboler.
      (function () {
        var used = 0;
        function bt(k) {
          if (k === 5) return true;
          for (var s = 0; s < R.NSYM; s++) {
            if ((ms[k] & (1 << s)) && !(used & (1 << s))) { used |= 1 << s; if (bt(k + 1)) return true; used &= ~(1 << s); }
          }
          return false;
        }
        if (bt(0)) add('regnbage', cs, null, L.dir);
      })();
      // Spegel: A B C B A men inte fem lika.
      if ((ms[0] & ms[4]) && (ms[1] & ms[3])) {
        var common = ms[0] & ms[1] & ms[2] & ms[3] & ms[4];
        if (!common) add('spegel', cs, null, L.dir);
      }
    });
    return out;
  };

  // Mönstrets "riktning" för reliker som bryr sig om vågrätt/lodrätt.
  R.patDir = function (p) {
    if (p.dir) return p.dir;
    return null;
  };
})();
