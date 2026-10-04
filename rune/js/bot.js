// Rune – en enkel bot. Används av testerna för att spela igenom omgångar,
// och i spelet för knappen "Tips" som föreslår ett drag.
(function () {
  'use strict';
  var R = (typeof window !== 'undefined' ? window : globalThis).R;

  // Uppskattat värde av mönstren som de färska runorna bildar (utan sidoeffekter).
  function estimate(G) {
    var pats = G.previewPatterns(), v = 0;
    pats.forEach(function (p) {
      var lvl = G.levels[p.type] || 1;
      v += (R.patChips(p.type, lvl) + 5 * p.cells.length) * R.patMult(p.type, lvl);
    });
    if (pats.length > 1) v *= 1 + 0.25 * (pats.length - 1);
    return v;
  }
  R.estimate = estimate;

  function empties(G) {
    var out = [];
    for (var i = 0; i < 25; i++) if (!G.board[i] && G.blocked.indexOf(i) < 0) out.push(i);
    return out;
  }

  // Girigt: lägg en runa i taget där den höjer värdet mest.
  R.botPlace = function (G) {
    var best = estimate(G), placedAny = false;
    while (G.freshCount() < G.maxPlace() && G.hand.length) {
      var bestMove = null, bestV = best;
      var seen = {};
      for (var h = 0; h < G.hand.length; h++) {
        var rn = G.hand[h];
        var key = rn.sym + ':' + rn.enh;
        if (seen[key]) continue;
        seen[key] = 1;
        var cells = empties(G);
        for (var c = 0; c < cells.length; c++) {
          if (!G.place(rn, cells[c])) continue;
          var v = estimate(G);
          G.unplace(cells[c]);
          if (v > bestV + 0.01) { bestV = v; bestMove = [rn, cells[c]]; }
        }
      }
      if (!bestMove && G.freshCount() + 2 <= G.maxPlace()) {
        // Inget enskilt drag hjälper: prova två runor av samma symbol nära varandra.
        var pair = bestPair(G, bestV);
        if (pair) {
          G.place(pair[0], pair[1]); G.place(pair[2], pair[3]);
          best = pair[4]; placedAny = true;
          continue;
        }
      }
      if (!bestMove) break;
      G.place(bestMove[0], bestMove[1]);
      best = bestV; placedAny = true;
    }
    return placedAny && best > 0;
  };

  function bestPair(G, floor) {
    var res = null, bv = floor, seen = {};
    var cells = empties(G);
    for (var a = 0; a < G.hand.length; a++) for (var b = a + 1; b < G.hand.length; b++) {
      var ra = G.hand[a], rb = G.hand[b];
      if (ra.sym !== rb.sym && ra.enh !== 'vild' && rb.enh !== 'vild') continue;
      var key = ra.sym + ':' + ra.enh + '|' + rb.sym + ':' + rb.enh;
      if (seen[key]) continue;
      seen[key] = 1;
      for (var i = 0; i < cells.length; i++) {
        if (!G.place(ra, cells[i])) continue;
        var ci = R.rc(cells[i]);
        for (var j = 0; j < cells.length; j++) {
          if (j === i) continue;
          var cj = R.rc(cells[j]);
          if (Math.abs(ci[0] - cj[0]) > 2 || Math.abs(ci[1] - cj[1]) > 2) continue;
          if (!G.place(rb, cells[j])) continue;
          var v = estimate(G);
          G.unplace(cells[j]);
          if (v > bv + 0.01) { bv = v; res = [ra, cells[i], rb, cells[j], v]; }
        }
        G.unplace(cells[i]);
      }
    }
    return res;
  }

  // Förberedande drag: lägg runor bredvid samma symbol (bygger par som kan bli mönster).
  R.botSetup = function (G, n) {
    var k = 0;
    while (k < n && G.hand.length && G.freshCount() < G.maxPlace()) {
      var best = null, bs = -1;
      G.hand.forEach(function (rn) {
        empties(G).forEach(function (i) {
          var s = 0;
          R.orth(i).forEach(function (j) { if (G.board[j] && G.board[j].rune.sym === rn.sym) s += 2; });
          R.around(i).forEach(function (j) { if (G.board[j] && G.board[j].rune.sym === rn.sym) s += 0.5; });
          s += G.rnd() * 0.2;
          if (s > bs) { bs = s; best = [rn, i]; }
        });
      });
      if (!best) break;
      G.place(best[0], best[1]);
      k++;
    }
  };

  R.botRound = function (G) {
    var guard = 0;
    while (G.phase === 'round' && guard++ < 60) {
      var scored = R.botPlace(G);
      var err = G.castError();
      if (!scored) {
        G.unplaceAll();
        // Bygg upp brädet gratis medan handen är stor.
        if (G.hand.length > 5) {
          R.botSetup(G, 2);
          if (G.lay()) continue;
          G.unplaceAll();
        }
        // Byt bort de minst användbara runorna om vi kan.
        if (G.discards > 0) {
          var cnt = {};
          G.hand.forEach(function (r) { cnt[r.sym] = (cnt[r.sym] || 0) + 1; });
          for (var i = 0; i < 25; i++) if (G.board[i]) cnt[G.board[i].rune.sym] = (cnt[G.board[i].rune.sym] || 0) + 1;
          var sorted = G.hand.slice().sort(function (a, b) { return (cnt[a.sym] || 0) - (cnt[b.sym] || 0); });
          var bad = sorted.slice(0, Math.min(G.maxPlace(), Math.max(1, G.hand.length - 4)));
          G.discardSel(bad, []);
          continue;
        }
        R.botSetup(G, 2);
        err = G.castError();
      }
      if (err) {
        // Psyket m.fl.: fyll på tills kastet är giltigt.
        R.botSetup(G, G.maxPlace());
        if (G.castError()) { G.lose(); break; }
      }
      G.cast();
    }
  };

  R.botShop = function (G, opts) {
    opts = opts || {};
    var guard = 0;
    while (G.phase === 'shop' && guard++ < 20) {
      var bought = false;
      for (var k = 0; k < G.shop.cards.length; k++) {
        var it = G.shop.cards[k];
        if (it.type === 'relic' && opts.noRelics) continue;
        if (it.type === 'cons' && it.c.kind === 'star') { if (G.buyAndUse(k)) { bought = true; break; } }
        else if (it.type === 'relic' && G.money - it.cost >= (opts.keep || 0)) { if (G.buyCard(k)) { bought = true; break; } }
      }
      if (!bought && G.shop.packs.length && G.money >= 10) {
        var pk = G.shop.packs[0];
        if (G.buyPack(0)) {
          var g2 = 0;
          while (G.phase === 'pack' && g2++ < 10) {
            var ok = false;
            for (var j = 0; j < G.pack.items.length; j++) {
              var item = G.pack.items[j];
              if (item.taken) continue;
              var sel = [];
              if (item.type === 'cons') {
                var d = R.consDef(item.c);
                if (d.need) sel = (G.pack.hand || []).slice(0, d.need);
              }
              if (G.pickPack(j, sel)) { ok = true; break; }
            }
            if (!ok) G.skipPack();
          }
          bought = true;
          void pk;
        }
      }
      if (!bought) break;
    }
    if (G.phase === 'shop') G.leaveShop();
  };

  // Spelar en hel omgång. Returnerar uppnådd cirkel.
  R.botRun = function (G, opts) {
    var guard = 0;
    while (guard++ < 400) {
      if (G.phase === 'select') G.selectBlind();
      else if (G.phase === 'round') R.botRound(G);
      else if (G.phase === 'cashout') G.cashOut();
      else if (G.phase === 'shop') R.botShop(G, opts);
      else if (G.phase === 'pack') G.skipPack();
      else break;
    }
    return G;
  };
})();
