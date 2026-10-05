// Rune – gränssnittet: rendering, inmatning och poänganimationen.
(function () {
  'use strict';
  var R = window.R;
  var $ = function (id) { return document.getElementById(id); };
  var G = null;
  var UI = R.UI = { sel: [], mark: [], anim: false, view: null, menu: true, speed: 1, disp: null, skip: false };
  try { UI.speed = Number(localStorage.getItem('rune-speed')) || 1; } catch (e) { /* ingen lagring */ }

  function save() { try { if (G && G.phase !== 'over') localStorage.setItem('rune-save', G.save()); else localStorage.removeItem('rune-save'); } catch (e) { /* ingen lagring */ } }
  function hasSave() { try { return !!localStorage.getItem('rune-save'); } catch (e) { return false; } }
  function loadSave() { try { var s = localStorage.getItem('rune-save'); if (s) return R.Game.load(s); } catch (e) { /* trasig sparfil */ } return null; }
  function h(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function wait(ms) { return new Promise(function (res) { setTimeout(res, UI.skip ? 0 : ms / UI.speed); }); }

  // ---- Texter ---------------------------------------------------------------
  function runeName(rn) { return rn.enh === 'sten' ? '🪨 Sten-runa' : R.symE(rn.sym) + ' ' + R.symName(rn.sym); }
  function runeTip(rn) {
    var s = '<div class="tn">' + runeName(rn) + '</div><div class="td">+' + R.runeChips(rn) + ' Chips när den poängsätts.</div>';
    if (rn.enh && rn.enh !== 'sten') s += '<div class="tx"><b>' + R.ENH[rn.enh].name + ':</b> ' + R.ENH[rn.enh].desc + '</div>';
    if (rn.enh === 'sten') s += '<div class="tx">' + R.ENH.sten.desc + '</div>';
    if (rn.seal) s += '<div class="tx"><b>' + R.SEALS[rn.seal].name + ':</b> ' + R.SEALS[rn.seal].desc + '</div>';
    if (rn.ed) s += '<div class="tx"><b>' + R.EDITIONS[rn.ed].name + ':</b> ' + R.EDITIONS[rn.ed].desc + '</div>';
    return s;
  }
  function relicTip(inst, price) {
    var d = R.RELIC[inst.id], rr = R.RARITY[d.r];
    var s = '<div class="tn">' + art('relic/' + inst.id, d.i, 'inl') + ' ' + d.n + '</div><div class="tr" style="color:' + rr.color + '">' + rr.name + ' · ' + d.cat + '</div><div class="td">' + d.d + '</div>';
    if (d.info) s += '<div class="tv">' + d.info(inst.st, G) + '</div>';
    if (d.copy && G) { var res = R.resolveRelic(G, inst); s += '<div class="tv">' + (res ? 'Kopierar: ' + res.def.n : 'Kopierar inget just nu') + '</div>'; }
    if (inst.ed) s += '<div class="tx"><b>' + R.EDITIONS[inst.ed].name + ':</b> ' + R.EDITIONS[inst.ed].desc + '</div>';
    if (inst.off) s += '<div class="tx red">Inaktiv under det här kastet.</div>';
    if (price == null && G && G.relics.indexOf(inst) >= 0) s += '<div class="tx">Säljvärde: $' + G.sellValue(inst) + '</div>';
    return s;
  }
  function consTip(c) {
    var d = R.consDef(c);
    var s = '<div class="tn">' + d.i + ' ' + d.n + '</div><div class="tr" style="color:#9fd0ff">' + R.CONS_KIND[c.kind] + (c.ed === 'neg' ? ' · Negativ' : '') + '</div><div class="td">' + d.d + '</div>';
    if (c.kind === 'star') { var lv = G ? G.levels[c.id] : 1; s += '<div class="tv">' + R.PATTERNS[c.id].name + ': nivå ' + lv + ' → ' + (lv + 1) + '</div>'; }
    if (d.need) s += '<div class="tx">Välj ' + (d.min && d.min === d.need ? d.need : 'upp till ' + d.need) + ' runor i handen först.</div>';
    return s;
  }

  // ---- Tooltip ----------------------------------------------------------------
  var tipEl = null;
  function bindTip(el, fn) {
    el.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') showTip(el, fn()); });
    el.addEventListener('pointerleave', hideTip);
  }
  function showTip(el, html) {
    tipEl = tipEl || $('tip');
    tipEl.innerHTML = html; tipEl.classList.remove('hidden');
    var r = el.getBoundingClientRect(), tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
    var x = R.clamp(r.left + r.width / 2 - tw / 2, 6, window.innerWidth - tw - 6);
    var y = r.top - th - 8; if (y < 6) y = r.bottom + 8;
    tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
  }
  function hideTip() { if (tipEl) tipEl.classList.add('hidden'); }

  function toast(msg, kind) {
    var t = h('div', 'toast ' + (kind || ''), R.esc(msg));
    $('toasts').appendChild(t);
    setTimeout(function () { t.remove(); }, 2500);
  }
  function flushToasts() { if (!G) return; while (G.toasts.length) { var t = G.toasts.shift(); toast(t.msg, t.kind); } }

  // ---- Bilder (genererade med tools/gen-assets.js; emoji som reserv) ---------
  function art(key, fallback, cls) {
    if (R.ASSETS && R.ASSETS[key]) return '<img class="art ' + (cls || '') + '" src="assets/' + key + '.webp" alt="" draggable="false">';
    return fallback;
  }
  UI.art = art;

  // ---- Element ---------------------------------------------------------------
  function runeEl(rn, o) {
    o = o || {};
    var e = h('div', 'rune');
    if (rn.enh) e.classList.add('e-' + rn.enh);
    if (rn.ed) e.classList.add('ed-' + rn.ed);
    var sc = rn.sym != null && rn.enh !== 'sten' ? R.SYMS[rn.sym].color : '#aaa';
    e.style.setProperty('--sc', sc + 'aa'); e.style.setProperty('--sg', sc + '44');
    e.appendChild(h('span', 'em', rn.enh === 'sten' ? '' : art('sym/' + R.SYMS[rn.sym].id, R.symE(rn.sym), 'symart')));
    if (rn.seal) e.appendChild(h('span', 'seal s-' + rn.seal));
    if (rn.perm) e.appendChild(h('span', 'perm', '+' + rn.perm));
    if (o.hidden) e.classList.add('hid');
    e.dataset.uid = rn.uid;
    if (!o.noTip) bindTip(e, function () { return o.hidden ? '<div class="tn">Dold runa</div><div class="td">Dimman döljer den tills du placerar den.</div>' : runeTip(rn); });
    return e;
  }
  function relicCard(inst, o) {
    o = o || {};
    var d = R.RELIC[inst.id];
    var e = h('div', 'card');
    e.style.setProperty('--rc', R.RARITY[d.r].color);
    if (inst.ed) e.classList.add('ed-' + inst.ed);
    if (inst.off) e.classList.add('off');
    e.appendChild(h('div', 'ic', art('relic/' + inst.id, d.i)));
    e.appendChild(h('div', 'nm', R.esc(d.n)));
    if (d.info && !o.shop) { var v = h('div', 'val', R.esc(String(d.info(inst.st, G)))); e.appendChild(v); }
    e.dataset.uid = inst.uid;
    bindTip(e, function () { return relicTip(inst, o.price); });
    return e;
  }
  function consCard(c) {
    var d = R.consDef(c);
    var e = h('div', 'card cons ' + c.kind);
    if (c.ed) e.classList.add('ed-' + c.ed);
    if (R.ASSETS && R.ASSETS['card/' + c.kind]) e.style.backgroundImage = 'linear-gradient(#0006, #0006), url(assets/card/' + c.kind + '.webp)';
    e.appendChild(h('div', 'ic', d.i));
    e.appendChild(h('div', 'nm', R.esc(d.n)));
    e.dataset.uid = c.uid;
    bindTip(e, function () { return consTip(c); });
    return e;
  }

  // ---- Rendering --------------------------------------------------------------
  function render() {
    if (!G) { $('screen').classList.remove('hidden'); renderMenu($('screen')); return; }
    renderSide();
    renderTop();
    renderBoard();
    renderHand();
    renderActions();
    renderScreen();
    flushToasts();
  }
  function renderSide() {
    var bb = $('blindbox');
    var b = G.phase === 'round' || G.phase === 'cashout' ? G.blind : null;
    bb.className = 'panel' + (b && b.kind === 'boss' ? ' boss' : '');
    if (b) {
      var info = R.BLIND_INFO[b.kind];
      var boss = b.boss ? R.BOSS[b.boss] : null;
      bb.innerHTML = '<div class="lbl">Cirkel ' + G.ante + ' · ' + (boss ? 'Väktare' : b.kind === 'small' ? 'Prövning 1/3' : 'Prövning 2/3') + '</div><div class="bname">' + (boss ? art('boss/' + boss.id, boss.i, 'inl') + ' ' + boss.n : info.i + ' ' + info.n) + '</div>' +
        '<div class="lbl" style="margin-top:4px">Mål</div><div class="btarget">' + R.fmt(G.target) + '</div>' +
        (boss ? '<div class="bdesc">' + bossDesc(boss) + (G.activeBoss() ? '' : ' <b class="green">(inaktiverad)</b>') + '</div>' : '<div class="bdesc">Belöning: $' + info.reward + '</div>');
    } else {
      bb.innerHTML = '<div class="lbl">Cirkel ' + G.ante + '</div><div class="bname">' + (G.phase === 'shop' ? '🛒 Butiken' : G.phase === 'pack' ? '🎁 Paket' : '🗺️ Välj prövning') + '</div>';
    }
    var sc = UI.disp ? UI.disp.score : (G.phase === 'round' || G.phase === 'cashout' ? G.score : 0);
    $('roundscore').textContent = R.fmt(sc);
    if (!UI.anim) { $('chips').textContent = '0'; $('mult').textContent = '0'; $('patname').textContent = previewName(); }
    var inRound = G.phase === 'round' || UI.anim;
    $('casts').textContent = inRound ? G.casts : '–';
    $('discards').textContent = inRound ? G.discards : '–';
    $('money').textContent = '$' + (UI.disp ? UI.disp.money : G.money);
    $('ante').textContent = G.ante + '/' + R.WIN_ANTE;
  }
  function bossDesc(b) {
    var s = b.d;
    if (b.id === 'forseglaren' && G.bossSym != null) s = s.replace('[symbol]', R.symE(G.bossSym));
    return s;
  }
  function previewName() {
    if (!G || G.phase !== 'round') return '';
    var pats = G.previewPatterns();
    if (!pats.length) return '';
    var names = {};
    pats.forEach(function (p) { names[p.type] = (names[p.type] || 0) + 1; });
    return Object.keys(names).map(function (t) { return R.PATTERNS[t].name + (names[t] > 1 ? ' ×' + names[t] : ''); }).join(' + ');
  }
  function renderTop() {
    var rel = $('relics'); rel.innerHTML = '';
    G.relics.forEach(function (inst, k) {
      var e = relicCard(inst);
      bindRelicDrag(e, k);
      rel.appendChild(e);
    });
    rel.dataset.count = G.relics.length + '/' + G.relicSlots();
    var cons = $('cons'); cons.innerHTML = '';
    G.cons.forEach(function (c) {
      var e = consCard(c);
      e.addEventListener('click', function () { hideTip(); openConsModal(c); });
      cons.appendChild(e);
    });
    cons.dataset.count = G.consUsedSlots() + '/' + G.consSlots();
  }
  function renderBoard() {
    var bd = $('board'); bd.innerHTML = '';
    var board = UI.view || G.board;
    var pv = {};
    if (!UI.anim && G.phase === 'round') G.previewPatterns().forEach(function (p) { p.cells.forEach(function (i) { pv[i] = 1; }); });
    for (var i = 0; i < 25; i++) {
      var cell = h('div', 'cell');
      cell.dataset.i = i;
      if (R.isCorner(i)) cell.classList.add('corner');
      if (G.blocked.indexOf(i) >= 0 && G.phase === 'round') cell.classList.add('blocked');
      var c = board[i];
      if (c) {
        var re = runeEl(c.rune);
        if (c.fresh) re.classList.add('fresh'); else re.classList.add('old');
        if (UI.mark.indexOf(i) >= 0) re.classList.add('mark');
        if (G.activeBoss() && G.activeBoss().weak && G.activeBoss().weak(G, c.rune)) re.classList.add('weak');
        cell.appendChild(re);
        if (pv[i]) cell.classList.add('pv');
      } else if (G.phase === 'round' && G.canPlace(i)) cell.classList.add('can');
      cell.addEventListener('click', onCellClick);
      bd.appendChild(cell);
    }
  }
  function renderHand() {
    var hd = $('hand'); hd.innerHTML = '';
    if (G.phase !== 'round') return;
    G.hand.forEach(function (rn) {
      var e = runeEl(rn, { hidden: !!G.hidden[rn.uid] });
      if (UI.sel.indexOf(rn.uid) >= 0) e.classList.add('sel');
      bindHandRune(e, rn);
      hd.appendChild(e);
    });
    var left = G.draw.length;
    hd.title = left + ' runor kvar i påsen';
  }
  function renderActions() {
    var round = G.phase === 'round' && !UI.anim;
    var cast = $('btn-cast'), disc = $('btn-discard');
    $('actions').style.visibility = G.phase === 'round' ? 'visible' : 'hidden';
    var n = G.freshCount();
    var lay = round && G.canLay();
    cast.textContent = lay ? 'Lägg' : 'Kasta';
    cast.className = 'btn ' + (lay ? 'green' : 'blue');
    cast.disabled = !round || !n;
    cast.title = lay ? 'Inget mönster: runorna läggs ut utan att ett kast går åt (du drar inga nya runor).' : 'Kasta: poängsätt alla mönster som de placerade runorna bildar.';
    var dn = handSelRunes().length + UI.mark.length;
    disc.disabled = !round || !dn || G.discards <= 0 || dn > G.maxPlace();
    $('discard-n').textContent = dn ? '(' + dn + ')' : '';
    $('btn-undo').disabled = !round || !n;
    $('btn-hint').disabled = !round;
    $('btn-sort').disabled = !round;
    var pr = $('preview');
    if (G.phase === 'round' && !UI.anim) {
      var pats = G.previewPatterns();
      var nm = previewName();
      if (nm) {
        pr.innerHTML = nm + (pats.length > 1 ? ' · Kedja med ' + pats.length + ' mönster' : '');
      } else if (n) pr.innerHTML = '<span class="dim">Inget mönster än – ' + n + '/' + G.maxPlace() + ' placerade</span>';
      else pr.innerHTML = '<span class="dim">Välj en runa och klicka på en ruta (eller dra dit den). ' + G.draw.length + ' runor kvar i påsen.</span>';
    } else pr.innerHTML = '';
  }

  function handSelRunes() {
    return UI.sel.map(function (u) { return G.hand.filter(function (r) { return r.uid === u; })[0]; }).filter(Boolean);
  }

  // ---- Inmatning: hand, bräde, reliker --------------------------------------
  var drag = null;
  function bindHandRune(e, rn) {
    e.addEventListener('pointerdown', function (ev) {
      if (UI.anim) return;
      ev.preventDefault();
      drag = { rn: rn, el: e, x: ev.clientX, y: ev.clientY, moved: false, ghost: null, id: ev.pointerId };
      e.setPointerCapture && e.setPointerCapture(ev.pointerId);
    });
    e.addEventListener('pointermove', function (ev) {
      if (!drag || drag.el !== e) return;
      if (!drag.moved && Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) > 8) {
        drag.moved = true; hideTip();
        drag.ghost = runeEl(rn, { noTip: true, hidden: !!G.hidden[rn.uid] });
        drag.ghost.classList.add('ghostrune');
        document.body.appendChild(drag.ghost);
        e.style.opacity = '.3';
      }
      if (drag.moved) {
        drag.ghost.style.left = ev.clientX + 'px'; drag.ghost.style.top = ev.clientY + 'px';
        highlightDrop(ev.clientX, ev.clientY);
      }
    });
    function end(ev) {
      if (!drag || drag.el !== e) return;
      var d = drag; drag = null;
      if (d.ghost) d.ghost.remove();
      e.style.opacity = '';
      highlightDrop(-1, -1);
      if (d.moved) {
        var cell = cellAt(ev.clientX, ev.clientY);
        if (cell >= 0) placeRune(rn, cell);
        else render();
      } else toggleSel(rn);
    }
    e.addEventListener('pointerup', end);
    e.addEventListener('pointercancel', function () { if (drag && drag.ghost) drag.ghost.remove(); drag = null; e.style.opacity = ''; highlightDrop(-1, -1); });
  }
  function cellAt(x, y) {
    var el = document.elementFromPoint(x, y);
    while (el && !(el.classList && el.classList.contains('cell'))) el = el.parentElement;
    return el ? Number(el.dataset.i) : -1;
  }
  function highlightDrop(x, y) {
    var i = x < 0 ? -1 : cellAt(x, y);
    Array.prototype.forEach.call(document.querySelectorAll('.cell'), function (c) { c.classList.toggle('drop', Number(c.dataset.i) === i && G.canPlace(i)); });
  }
  function toggleSel(rn) {
    var k = UI.sel.indexOf(rn.uid);
    if (k >= 0) UI.sel.splice(k, 1); else UI.sel.push(rn.uid);
    R.sfx.pick();
    render();
  }
  function placeRune(rn, cell) {
    if (!G.canPlace(cell)) {
      if (G.freshCount() >= G.maxPlace()) toast('Du får placera högst ' + G.maxPlace() + ' runor per kast.', 'bad');
      render(); return;
    }
    G.place(rn, cell);
    var k = UI.sel.indexOf(rn.uid); if (k >= 0) UI.sel.splice(k, 1);
    R.sfx.place();
    render(); save();
  }
  function onCellClick(ev) {
    if (UI.anim || G.phase !== 'round') return;
    var i = Number(ev.currentTarget.dataset.i);
    var c = G.board[i];
    if (!c) {
      var rs = handSelRunes();
      if (rs.length) placeRune(rs[0], i);
      else if (G.canPlace(i)) toast('Välj först en runa i handen.');
      return;
    }
    if (c.fresh) { G.unplace(i); R.sfx.pick(); render(); save(); return; }
    var k = UI.mark.indexOf(i);
    if (k >= 0) UI.mark.splice(k, 1); else UI.mark.push(i);
    R.sfx.pick();
    render();
  }
  function bindRelicDrag(e, k) {
    var st = null;
    e.addEventListener('pointerdown', function (ev) { st = { x: ev.clientX, y: ev.clientY, moved: false }; e.setPointerCapture && e.setPointerCapture(ev.pointerId); });
    e.addEventListener('pointermove', function (ev) {
      if (!st) return;
      if (!st.moved && Math.abs(ev.clientX - st.x) > 10) { st.moved = true; e.classList.add('dragging'); hideTip(); }
    });
    e.addEventListener('pointerup', function (ev) {
      if (!st) return;
      var moved = st.moved; st = null; e.classList.remove('dragging');
      if (moved) {
        if (UI.anim) { render(); return; }
        var cards = Array.prototype.slice.call($('relics').children);
        var to = cards.length - 1;
        for (var j = 0; j < cards.length; j++) { var r = cards[j].getBoundingClientRect(); if (ev.clientX < r.left + r.width / 2) { to = j; break; } }
        if (to > k) to--;
        if (ev.clientX > cards[cards.length - 1].getBoundingClientRect().right) to = cards.length - 1;
        G.moveRelic(k, to); render(); save();
      } else { hideTip(); openRelicModal(G.relics[k]); }
    });
  }

  // ---- Åtgärder ----------------------------------------------------------------
  function clearSel() { UI.sel = []; UI.mark = []; }
  function doCast() {
    if (UI.anim || G.phase !== 'round') return;
    var err = G.castError();
    if (err) { toast(err, 'bad'); return; }
    if (G.canLay()) {
      G.lay(); R.sfx.place(); UI.mark = [];
      render(); save(); afterPhase();
      return;
    }
    var snap = G.board.map(function (c) { return c ? { rune: c.rune, fresh: c.fresh } : null; });
    var prev = { score: G.score, money: G.money };
    var ctx = G.cast();
    if (!ctx) return;
    UI.mark = UI.mark.filter(function (i) { return G.board[i]; });
    UI.view = snap; UI.anim = true; UI.skip = false;
    UI.disp = { score: prev.score, money: prev.money };
    render();
    animate(ctx).then(function () {
      UI.view = null; UI.anim = false; UI.disp = null;
      clearSel();
      render(); save(); afterPhase();
    });
  }
  function afterPhase() {
    if (G.phase === 'over') R.sfx.lose();
    if (G.phase === 'cashout') R.sfx.win();
    render();
  }
  function doDiscard() {
    if (UI.anim) return;
    var rs = handSelRunes();
    if (!G.discardSel(rs, UI.mark.slice())) { toast('Du kan inte byta just nu.', 'bad'); return; }
    clearSel(); R.sfx.burst();
    render(); save(); afterPhase();
  }
  function doSort() {
    UI.sortBy = UI.sortBy === 'sym' ? 'enh' : 'sym';
    var key = UI.sortBy === 'sym' ? function (r) { return (r.sym == null ? 9 : r.sym) * 100 + (r.enh ? 1 : 0); } : function (r) { return (r.enh ? r.enh.charCodeAt(0) : 0) * 10 + (r.sym == null ? 9 : r.sym); };
    G.hand.sort(function (a, b) { return key(a) - key(b); });
    render();
  }
  function doHint() {
    if (UI.anim || G.phase !== 'round') return;
    G.unplaceAll(); UI.sel = [];
    if (!R.botPlace(G)) { G.unplaceAll(); toast('Inget mönster hittades med handen. Prova att Lägga runor som förberedelse, eller Byt.'); }
    render();
  }

  // ---- Animation ----------------------------------------------------------------
  function cellEl(i) { return document.querySelector('#board .cell[data-i="' + i + '"]'); }
  function relicEl(uid) { return document.querySelector('#relics .card[data-uid="' + uid + '"]'); }
  function popAt(el, text, cls) {
    if (!el) el = $('scorebox');
    var r = el.getBoundingClientRect();
    var p = h('div', 'pop ' + cls, R.esc(text));
    p.style.left = (r.left + r.width / 2) + 'px';
    p.style.top = (r.top + 6) + 'px';
    $('fx').appendChild(p);
    setTimeout(function () { p.remove(); }, 800);
  }
  function banner(text) {
    var b = h('div', 'banner', R.esc(text));
    $('fx').appendChild(b);
    setTimeout(function () { b.remove(); }, 1000);
  }
  function bump(id) { var e = $(id); e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); setTimeout(function () { e.classList.remove('bump'); }, 120); }
  function setCalc(c, m) { $('chips').textContent = R.fmt(c); $('mult').textContent = m >= 1e11 ? R.fmt(m) : (Math.round(m * 100) / 100).toLocaleString('sv-SE'); }
  function targetEl(at) {
    if (!at) return null;
    if (at.relic && !at.cell) return relicEl(at.relic);
    if (at.cell != null) { var c = cellEl(at.cell); return c && (c.firstChild || c); }
    return null;
  }
  function animate(ctx) {
    var evs = ctx.ev, k = 0;
    R.sfx.reset();
    var fast = evs.length > 80 ? 0.4 : evs.length > 45 ? 0.6 : evs.length > 25 ? 0.8 : 1;
    function step() {
      if (k >= evs.length) return finish();
      var e = evs[k++];
      var d = 0;
      switch (e.k) {
        case 'pat':
          Array.prototype.forEach.call(document.querySelectorAll('#board .cell.lit, #board .cell.react'), function (c) { c.classList.remove('lit', 'react'); });
          e.p.cells.forEach(function (i) { var c = cellEl(i); if (c) c.classList.add('lit'); });
          $('patname').textContent = e.p.type === 'los' ? 'Lösa runor' : R.PATTERNS[e.p.type].name + (e.p.sym != null ? ' ' + R.symE(e.p.sym) : '') + ' · nv. ' + e.lvl;
          setCalc(e.c, e.m); bump('chips'); bump('mult');
          R.sfx.pattern(); d = 300; break;
        case 'react': {
          var ce = cellEl(e.cell); if (ce) ce.classList.add('react');
          var rx = R.REACTIONS[e.sym];
          popAt(ce, rx.name + ' ' + R.symE(e.sym) + '!', 'react');
          R.sfx.react(); d = 260; break;
        }
        case 'chips': popAt(targetEl(e.at), '+' + R.fmt(e.v), 'chips'); setCalc(e.c, e.m); bump('chips'); pulse(e.at); R.sfx.chips(); d = 110; break;
        case 'mult': popAt(targetEl(e.at), '+' + R.fmt(e.v) + ' Mult', 'mult'); setCalc(e.c, e.m); bump('mult'); pulse(e.at); R.sfx.mult(); d = 130; break;
        case 'xmult': popAt(targetEl(e.at), '×' + R.fmtX(e.v) + ' Mult', 'xmult'); setCalc(e.c, e.m); bump('mult'); pulse(e.at); R.sfx.xmult(); d = 230; break;
        case 'money': popAt(targetEl(e.at), '+$' + e.v, 'money'); UI.disp.money += e.v; $('money').textContent = '$' + UI.disp.money; pulse(e.at); R.sfx.money(); d = 150; break;
        case 'msg': popAt(targetEl(e.at), e.v, 'msg'); pulse(e.at); d = 120; break;
        case 'note': popAt(relicEl(e.relic), e.msg, 'msg'); jig(relicEl(e.relic)); d = 260; break;
        case 'weak': popAt(targetEl(e.at), 'Försvagad', 'msg'); d = 160; break;
        case 'chain': banner('Kedja ×' + R.fmtX(e.v) + '!'); setCalc(e.c, e.m); bump('mult'); R.sfx.chain(); d = 520; break;
        case 'final': setCalc(e.c, e.m); d = 200; break;
      }
      return wait(d * fast).then(step);
    }
    function pulse(at) {
      if (!at) return;
      if (at.relic) jig(relicEl(at.relic));
      if (at.cell != null) { var c = cellEl(at.cell); var r = c && c.firstChild; if (r) { r.classList.remove('pulse'); void r.offsetWidth; r.classList.add('pulse'); } }
    }
    function jig(el) { if (!el) return; el.classList.remove('jiggle'); void el.offsetWidth; el.classList.add('jiggle'); }
    function finish() {
      if (ctx.empty) { $('patname').textContent = 'Inget mönster'; return wait(400); }
      var from = UI.disp.score, to = from + ctx.score, t0 = performance.now(), dur = UI.skip ? 0 : 600 / UI.speed;
      $('patname').textContent = R.fmt(ctx.score) + ' poäng';
      var big = ctx.score > 0 && ctx.score >= G.target * 0.5;
      return new Promise(function (res) {
        function tick(now) {
          var u = dur ? Math.min(1, (now - t0) / dur) : 1;
          $('roundscore').textContent = R.fmt(Math.floor(from + (to - from) * u));
          if (u < 1) requestAnimationFrame(tick); else res();
        }
        requestAnimationFrame(tick);
      }).then(function () {
        UI.disp.score = to;
        Array.prototype.forEach.call(document.querySelectorAll('#board .cell.lit, #board .cell.react'), function (c) { c.classList.remove('lit', 'react'); });
        ctx.removed.forEach(function (i) { var c = cellEl(i); if (c && c.firstChild) c.firstChild.classList.add('boom'); });
        (ctx.cursed || []).concat(ctx.broken || []).forEach(function (u) { var el = document.querySelector('#board .rune[data-uid="' + u + '"]'); if (el) { el.classList.add('boom'); popAt(el, 'Förstörd!', 'msg'); } });
        if (ctx.removed.length) R.sfx.burst();
        if (big) { banner(ctx.score >= G.target ? 'Episkt kast!' : 'Stort kast!'); return new Promise(function (res) { setTimeout(res, UI.skip ? 300 : 900); }); }
        return wait(380);
      });
    }
    return step();
  }

  // ---- Skärmar (prövningar, kassa, butik, paket, slut) ---------------------------
  function renderScreen() {
    var sc = $('screen');
    var top = $('toprow').offsetHeight;
    sc.style.top = (UI.menu ? 0 : top) + 'px';
    if (UI.menu) { sc.classList.remove('hidden'); return renderMenu(sc); }
    if (G.phase === 'round' || UI.anim) { sc.classList.add('hidden'); return; }
    if (sc.classList.contains('hidden')) $('fx').innerHTML = '';
    sc.classList.remove('hidden');
    sc.innerHTML = '';
    if (G.phase === 'select') renderSelect(sc);
    else if (G.phase === 'cashout') renderCash(sc);
    else if (G.phase === 'shop') renderShop(sc);
    else if (G.phase === 'pack') renderPack(sc);
    else if (G.phase === 'over') renderOver(sc, false);
    else if (G.phase === 'win') renderOver(sc, true);
  }
  function btn(text, cls, fn, disabled) {
    var b = h('button', 'btn ' + (cls || ''), text);
    b.disabled = !!disabled;
    b.addEventListener('click', function () { hideTip(); fn(); });
    return b;
  }
  function renderMenu(sc) {
    sc.innerHTML = '';
    var m = h('div', 'menu');
    m.appendChild(h('div', 'title', 'RUNE'));
    m.appendChild(h('div', 'runes', '☀️🔥🌙💀🌿⚡💎'));
    m.appendChild(h('div', 'sub', 'Placera runor på altaret, bilda mönster och hitta den sjuka kombinationen. 150 reliker, 8 cirklar.'));
    if (G && G.phase !== 'over' && G.phase !== 'win') m.appendChild(btn('Fortsätt', 'gold', function () { UI.menu = false; render(); }));
    else if (hasSave()) m.appendChild(btn('Fortsätt sparad omgång', 'gold', function () { G = loadSave(); UI.menu = false; render(); }));
    var seed = h('input'); seed.placeholder = 'Frö (valfritt)'; seed.maxLength = 16;
    m.appendChild(btn('Ny omgång', 'blue', function () {
      var s = seed.value.trim();
      G = new R.Game(s ? R.hashSeed(s.toUpperCase()) : null);
      G.seedText = s ? s.toUpperCase() : null;
      UI.menu = false; clearSel(); save(); render();
    }));
    m.appendChild(seed);
    m.appendChild(btn('Hur man spelar', 'ghost', openHelp));
    m.appendChild(btn('Kodex: alla reliker och kort', 'ghost', function () { openCodex('Grund'); }));
    m.appendChild(btn('Animationshastighet: ' + UI.speed + '×', 'ghost', function () { UI.speed = UI.speed >= 4 ? 1 : UI.speed * 2; try { localStorage.setItem('rune-speed', UI.speed); } catch (e) { /* ingen lagring */ } render(); }));
    m.appendChild(btn('Ljud: ' + (R.sfx.muted ? 'av' : 'på'), 'ghost', function () { R.sfx.toggle(); render(); }));
    sc.appendChild(m);
  }
  function renderSelect(sc) {
    sc.appendChild(h('h2', '', 'Cirkel ' + G.ante + (G.endless ? ' · oändligt läge' : '')));
    sc.appendChild(h('div', 'sub', 'Välj nästa prövning eller hoppa över den för att få ett märke.'));
    var row = h('div', 'row');
    G.blinds.forEach(function (b, k) {
      var info = R.BLIND_INFO[b.kind], boss = b.boss ? R.BOSS[b.boss] : null;
      var c = h('div', 'blindcard ' + b.state + (boss ? ' boss' : ''));
      c.appendChild(h('div', 'bi', boss ? art('boss/' + boss.id, boss.i) : info.i));
      c.appendChild(h('div', 'bname', '<b>' + (boss ? boss.n : info.n) + '</b>'));
      c.appendChild(h('div', 'lbl', 'Mål'));
      c.appendChild(h('div', 'bt', R.fmt(R.blindTarget(G.ante, b.kind, b.boss))));
      c.appendChild(h('div', 'bd', boss ? boss.d.replace('[symbol]', 'en slumpad symbol') : 'Belöning: $' + info.reward));
      if (b.state === 'next') {
        c.appendChild(btn('Välj', 'gold', function () { G.selectBlind(); clearSel(); R.sfx.place(); save(); render(); }));
        if (b.kind !== 'boss') {
          var t = R.TAG[b.tag];
          var tc = h('div', 'tagchip', 'Hoppa över → ' + art('tag/' + t.id, t.i, 'inl') + ' <b>' + t.n + '</b><br>' + t.d);
          c.appendChild(tc);
          c.appendChild(btn('Hoppa över', 'ghost', function () { G.skipBlind(); save(); render(); }));
        }
      } else if (b.state === 'done') c.appendChild(h('div', 'lbl', 'Klarad'));
      else if (b.state === 'skipped') c.appendChild(h('div', 'lbl', 'Överhoppad'));
      else if (b.kind !== 'boss') c.appendChild(h('div', 'tagchip', 'Märke: ' + art('tag/' + b.tag, R.TAG[b.tag].i, 'inl') + ' ' + R.TAG[b.tag].n));
      void k;
      row.appendChild(c);
    });
    sc.appendChild(row);
  }
  function renderCash(sc) {
    sc.appendChild(h('h2', '', 'Prövningen klarad!'));
    var c = h('div', 'cash');
    c.appendChild(h('div', 'sub', 'Poäng: <b>' + R.fmt(G.score) + '</b> av ' + R.fmt(G.target)));
    G.cashLines.forEach(function (l) { c.appendChild(h('div', 'ln', '<span>' + R.esc(l.t) + '</span><b>+$' + l.v + '</b>')); });
    c.appendChild(h('div', 'tot', 'Totalt: $' + G.cashTotal));
    sc.appendChild(c);
    sc.appendChild(btn('Ta ut $' + G.cashTotal, 'gold', function () { G.cashOut(); R.sfx.money(); save(); render(); }));
  }
  function itemBox(icon, name, desc, extra) {
    var it = h('div', 'item');
    it.appendChild(h('div', 'ii', icon));
    it.appendChild(h('div', 'in', R.esc(name)));
    if (extra) it.appendChild(h('div', 'rar', extra));
    it.appendChild(h('div', 'id', desc));
    return it;
  }
  function renderShop(sc) {
    sc.appendChild(h('h2', '', '🛒 Butiken'));
    sc.appendChild(h('div', 'sub', 'Du har <b class="gold">$' + G.money + '</b>. Klicka på dina reliker ovan för att sälja dem eller dra dem för att ändra ordning (ordningen spelar roll för ×Mult).'));
    var grid = h('div', 'shopgrid');
    G.shop.cards.forEach(function (it, k) {
      var box;
      if (it.type === 'relic') {
        var d = R.RELIC[it.inst.id], rr = R.RARITY[d.r];
        box = itemBox(art('relic/' + it.inst.id, d.i), d.n, d.d, '<span style="color:' + rr.color + '">' + rr.name + '</span>' + (it.inst.ed ? ' · <span class="gold">' + R.EDITIONS[it.inst.ed].name + '</span>' : '') + ' · ' + d.cat);
        if (it.inst.ed) box.classList.add('ed-' + it.inst.ed);
        bindTip(box, function () { return relicTip(it.inst, it.cost); });
      } else {
        var cd = R.consDef(it.c);
        box = itemBox(cd.i, cd.n, cd.d, '<span style="color:#9fd0ff">' + R.CONS_KIND[it.c.kind] + '</span>');
      }
      box.appendChild(h('div', 'price', it.cost ? '$' + it.cost : 'Gratis'));
      var bs = h('div', 'btns');
      var full = it.type === 'relic' ? (it.inst.ed !== 'neg' && G.relics.length >= G.relicSlots()) : G.consUsedSlots() >= G.consSlots();
      bs.appendChild(btn(full ? 'Fullt' : 'Köp', 'gold', function () { if (G.buyCard(k)) { R.sfx.buy(); save(); } else toast('Inte tillräckligt med pengar eller plats.', 'bad'); render(); }, G.money < it.cost || full));
      if (it.type === 'cons' && !R.consDef(it.c).need) bs.appendChild(btn('Använd', 'blue', function () { if (G.buyAndUse(k)) { R.sfx.buy(); save(); } else toast('Går inte att använda nu.', 'bad'); render(); }, G.money < it.cost));
      box.appendChild(bs);
      grid.appendChild(box);
    });
    sc.appendChild(grid);
    var row2 = h('div', 'shopgrid');
    G.shop.packs.forEach(function (pk, k) {
      var p = R.PACK[pk.id];
      var box = itemBox(art('pack/' + p.kind, p.i), p.n, p.d, '<span class="gold">Paket</span>');
      box.appendChild(h('div', 'price', pk.cost ? '$' + pk.cost : 'Gratis'));
      box.appendChild(btn('Öppna', 'gold', function () { if (G.buyPack(k)) { R.sfx.buy(); clearSel(); save(); } render(); }, G.money < pk.cost));
      row2.appendChild(box);
    });
    if (G.shopVoucher) {
      var v = R.VOUCHER[G.shopVoucher], cost = G.price(10);
      var vb = itemBox(art('voucher/' + v.id, v.i), v.n, v.d, '<span style="color:#ff9d00">Altarförbättring</span>');
      vb.appendChild(h('div', 'price', '$' + cost));
      vb.appendChild(btn('Köp', 'gold', function () { if (G.buyVoucher()) { R.sfx.buy(); save(); } render(); }, G.money < cost));
      row2.appendChild(vb);
    }
    sc.appendChild(row2);
    var bar = h('div', 'row');
    var rc = G.rerollCost();
    bar.appendChild(btn('Ny uppsättning ($' + rc + ')', 'green', function () { if (G.reroll()) R.sfx.buy(); save(); render(); }, G.money < rc));
    bar.appendChild(btn('Nästa prövning →', 'red', function () { G.leaveShop(); save(); render(); }));
    sc.appendChild(bar);
  }
  function renderPack(sc) {
    var pk = G.pack, def = R.PACK[pk.id];
    sc.appendChild(h('h2', '', def.i + ' ' + def.n));
    sc.appendChild(h('div', 'sub', 'Välj ' + pk.left + ' till.' + (pk.hand ? ' Markera runor nedan om kortet behöver det.' : '')));
    var grid = h('div', 'shopgrid');
    pk.items.forEach(function (it, k) {
      var box;
      if (it.type === 'rune') {
        box = h('div', 'item');
        var re = runeEl(it.rune); box.appendChild(re);
        box.appendChild(h('div', 'in', runeName(it.rune)));
        var ds = [];
        if (it.rune.enh) ds.push(R.ENH[it.rune.enh].name);
        if (it.rune.seal) ds.push(R.SEALS[it.rune.seal].name);
        if (it.rune.ed) ds.push(R.EDITIONS[it.rune.ed].name);
        box.appendChild(h('div', 'id', ds.join(' · ') || 'Vanlig runa'));
      } else if (it.type === 'relic') {
        var d = R.RELIC[it.inst.id], rr = R.RARITY[d.r];
        box = itemBox(art('relic/' + it.inst.id, d.i), d.n, d.d, '<span style="color:' + rr.color + '">' + rr.name + '</span>' + (it.inst.ed ? ' · ' + R.EDITIONS[it.inst.ed].name : ''));
      } else {
        var cd = R.consDef(it.c);
        box = itemBox(cd.i, cd.n, cd.d, R.CONS_KIND[it.c.kind] + (it.c.kind === 'star' ? ' · nivå ' + G.levels[it.c.id] : ''));
      }
      if (it.taken) box.classList.add('taken');
      else box.appendChild(btn(it.type === 'cons' ? 'Använd' : 'Välj', 'gold', function () {
        var sel = pk.hand ? UI.sel.map(function (u) { return pk.hand.filter(function (r) { return r.uid === u; })[0]; }).filter(Boolean) : [];
        if (G.pickPack(k, sel)) { R.sfx.buy(); UI.sel = []; save(); } else toast(it.type === 'relic' ? 'Ingen plats för fler reliker.' : 'Välj rätt antal runor först.', 'bad');
        render();
      }));
      grid.appendChild(box);
    });
    sc.appendChild(grid);
    if (pk.hand) {
      var hd = h('div', 'row');
      pk.hand.forEach(function (rn) {
        var e = runeEl(rn);
        if (UI.sel.indexOf(rn.uid) >= 0) e.classList.add('sel');
        e.addEventListener('click', function () { var k = UI.sel.indexOf(rn.uid); if (k >= 0) UI.sel.splice(k, 1); else UI.sel.push(rn.uid); render(); });
        hd.appendChild(e);
      });
      sc.appendChild(hd);
    }
    sc.appendChild(btn('Hoppa över', 'ghost', function () { G.skipPack(); UI.sel = []; save(); render(); }));
  }
  function renderOver(sc, win) {
    sc.appendChild(h('h2', '', win ? '🏆 Du besegrade cirkel ' + R.WIN_ANTE + '!' : '💀 Altaret slocknade'));
    var c = h('div', 'cash');
    var st = G.stats;
    [['Cirkel', G.ante], ['Bästa kast', R.fmt(st.best)], ['Kast', st.casts], ['Mest spelade mönster', R.PATTERNS[G.mostPlayed()].name], ['Reliker', G.relics.map(function (r) { return R.RELIC[r.id].i; }).join(' ') || '–'], ['Frö', G.seedText || G.seed]].forEach(function (l) {
      c.appendChild(h('div', 'ln', '<span>' + l[0] + '</span><b>' + l[1] + '</b>'));
    });
    sc.appendChild(c);
    var row = h('div', 'row');
    if (win) row.appendChild(btn('Fortsätt (oändligt läge)', 'gold', function () { G.continueEndless(); save(); render(); }));
    row.appendChild(btn('Ny omgång', 'blue', function () { G = new R.Game(); clearSel(); save(); render(); }));
    row.appendChild(btn('Meny', 'ghost', function () { UI.menu = true; render(); }));
    sc.appendChild(row);
  }

  // ---- Modaler ------------------------------------------------------------------
  function modal(html) {
    var b = $('modal-body'); b.innerHTML = '';
    if (typeof html === 'string') b.innerHTML = html; else b.appendChild(html);
    $('modal').classList.remove('hidden');
  }
  function closeModal() { $('modal').classList.add('hidden'); }
  function openRelicModal(inst) {
    if (!inst) return;
    var box = h('div');
    box.appendChild(h('div', 'tipbody', relicTip(inst)));
    var row = h('div', 'row'); row.style.marginTop = '12px';
    var k = G.relics.indexOf(inst);
    row.appendChild(btn('← Flytta', 'ghost', function () { G.moveRelic(k, k - 1); closeModal(); save(); render(); }, k <= 0 || UI.anim));
    row.appendChild(btn('Flytta →', 'ghost', function () { G.moveRelic(k, k + 1); closeModal(); save(); render(); }, k >= G.relics.length - 1 || UI.anim));
    row.appendChild(btn('Sälj för $' + G.sellValue(inst), 'gold', function () { G.sell(inst); R.sfx.money(); closeModal(); save(); render(); }, UI.anim));
    box.appendChild(row);
    modal(box);
  }
  function openConsModal(c) {
    var box = h('div');
    box.appendChild(h('div', 'tipbody', consTip(c)));
    var sel = G.phase === 'round' ? handSelRunes() : [];
    var d = R.consDef(c);
    var can = !UI.anim && G.canUseCons(c, sel) && (G.phase === 'round' || G.phase === 'shop' || G.phase === 'select' || G.phase === 'cashout') && (!d.need || G.phase === 'round');
    var row = h('div', 'row'); row.style.marginTop = '12px';
    row.appendChild(btn('Använd' + (d.need ? ' (' + sel.length + ' valda)' : ''), 'blue', function () {
      if (G.useCons(c, sel)) { R.sfx.buy(); UI.sel = []; save(); }
      closeModal(); render();
    }, !can));
    row.appendChild(btn('Sälj för $' + G.sellValue(c), 'gold', function () { G.sell(c); R.sfx.money(); closeModal(); save(); render(); }, UI.anim));
    box.appendChild(row);
    if (d.need && G.phase !== 'round') box.appendChild(h('div', 'sub', 'Det här kortet kan bara användas under en prövning, på runor i handen.'));
    modal(box);
  }
  function openPatterns() {
    var s = '<h3>Mönster</h3><table><tr><th>Mönster</th><th>Nivå</th><th>Chips</th><th>Mult</th><th>Spelat</th><th>Beskrivning</th></tr>';
    R.PATTERN_IDS.forEach(function (t) {
      var l = G ? G.levels[t] : 1;
      s += '<tr><td><b>' + R.PATTERNS[t].name + '</b></td><td>' + l + '</td><td class="blue">' + R.patChips(t, l) + '</td><td class="red">' + R.patMult(t, l) + '</td><td>' + (G ? G.stats.played[t] || 0 : 0) + '</td><td>' + R.PATTERNS[t].desc + '</td></tr>';
    });
    s += '</table><h3 style="margin-top:16px">Reaktioner</h3><p class="sub" style="text-align:left">En runa intill ett mönster, med en symbol som inte finns i mönstret, är en <b>katalysator</b>. Varje symbol kan reagera en gång per mönster.</p><table>';
    R.REACTIONS.forEach(function (r) { s += '<tr><td>' + R.symE(r.sym) + '</td><td><b>' + r.name + '</b></td><td>' + r.desc + '</td></tr>'; });
    s += '</table><p class="sub" style="text-align:left"><b>Kedja:</b> varje mönster utöver det första i samma kast ger ×0.25 Mult extra (2 mönster = ×1.25, 3 = ×1.5 …).</p>';
    modal(s);
  }
  function openBag() {
    if (!G) return;
    var box = h('div');
    box.appendChild(h('h3', '', 'Påsen (' + G.bag.length + ' runor)'));
    var counts = R.SYMS.map(function (s, k) { return s.e + ' ' + G.bag.filter(function (r) { return r.sym === k && r.enh !== 'sten'; }).length; }).join(' · ');
    box.appendChild(h('div', 'sub', counts + ' · 🪨 ' + G.bag.filter(function (r) { return r.enh === 'sten'; }).length));
    if (G.phase === 'round') box.appendChild(h('div', 'sub', '<b>' + G.draw.length + '</b> runor kvar att dra under den här prövningen.'));
    var grid = h('div', 'bagview');
    var inDraw = {}; if (G.phase === 'round') G.draw.forEach(function (r) { inDraw[r.uid] = 1; });
    G.bag.slice().sort(function (a, b) { return ((a.sym == null ? 9 : a.sym) - (b.sym == null ? 9 : b.sym)) || ((a.enh || '') < (b.enh || '') ? -1 : 1); }).forEach(function (rn) {
      var e = runeEl(rn);
      if (G.phase === 'round' && !inDraw[rn.uid]) e.style.opacity = '.35';
      grid.appendChild(e);
    });
    box.appendChild(grid);
    var v = G.vouchers.map(function (id) { return R.VOUCHER[id].i + ' ' + R.VOUCHER[id].n; }).join(', ');
    if (v) box.appendChild(h('div', 'sub', 'Altarförbättringar: ' + v));
    modal(box);
  }
  function openCodex(tab) {
    var box = h('div');
    box.appendChild(h('h3', '', 'Kodex'));
    var tabs = h('div', 'tabs');
    var all = R.RELIC_CATS.concat(['Ristningar', 'Stjärnbilder', 'Ekon', 'Väktare', 'Förbättringar', 'Märken']);
    all.forEach(function (t) {
      var n = R.RELIC_CATS.indexOf(t) >= 0 ? ' (' + R.RELICS.filter(function (d) { return d.cat === t; }).length + ')' : '';
      var b = h('button', t === tab ? 'on' : '', t + n);
      b.addEventListener('click', function () { openCodex(t); });
      tabs.appendChild(b);
    });
    box.appendChild(tabs);
    var grid = h('div', 'codex');
    function cx(icon, name, desc, color, extra) { var c = h('div', 'cx', '<b>' + icon + ' ' + R.esc(name) + '</b>' + (extra ? ' <span class="lbl">' + extra + '</span>' : '') + '<div class="cxd">' + desc + '</div>'); c.style.setProperty('--rc', color || 'var(--line)'); return c; }
    if (R.RELIC_CATS.indexOf(tab) >= 0) {
      R.RELICS.filter(function (d) { return d.cat === tab; }).forEach(function (d) { grid.appendChild(cx(art('relic/' + d.id, d.i, 'inl'), d.n, d.d, R.RARITY[d.r].color, R.RARITY[d.r].name + ' · $' + d.c)); });
    } else if (tab === 'Ristningar') R.RISTS.forEach(function (c) { grid.appendChild(cx(c.i, c.n, c.d, '#8b6cff')); });
    else if (tab === 'Stjärnbilder') R.STARS.forEach(function (c) { grid.appendChild(cx(c.i, c.n, c.d, '#4fd8ff')); });
    else if (tab === 'Ekon') R.EKOS.forEach(function (c) { grid.appendChild(cx(c.i, c.n, c.d, '#c77dff')); });
    else if (tab === 'Väktare') R.BOSSES.forEach(function (b) { grid.appendChild(cx(art('boss/' + b.id, b.i, 'inl'), b.n, b.d, b.fin ? '#ff5470' : '#ff9d00', b.fin ? 'Slutväktare' : 'från cirkel ' + (b.min || 1))); });
    else if (tab === 'Förbättringar') R.VOUCHERS.forEach(function (v) { grid.appendChild(cx(art('voucher/' + v.id, v.i, 'inl'), v.n, v.d, '#ff9d00', '$10')); });
    else if (tab === 'Märken') R.TAGS.forEach(function (t) { grid.appendChild(cx(art('tag/' + t.id, t.i, 'inl'), t.n, t.d, '#3ecf8e')); });
    box.appendChild(grid);
    modal(box);
  }
  function openHelp() {
    modal('<div class="help"><h3>Hur man spelar</h3>' +
      '<p><b>Mål:</b> klara varje prövning genom att nå målpoängen innan kasten tar slut. Tre prövningar per cirkel (Lärling, Mästare, Väktare). Klara cirkel 8 för att vinna.</p>' +
      '<p><b>Placera:</b> välj en runa i handen och klicka på en tom ruta, eller dra dit den. Du får placera upp till 5 runor per kast. Klicka på en placerad runa för att ta tillbaka den.</p>' +
      '<p><b>Kasta:</b> alla mönster som innehåller minst en nyplacerad runa poängsätts: <span class="blue">Chips</span> × <span class="red">Mult</span>. Runorna i mönstren förbrukas och lämnar brädet.</p>' +
      '<p><b>Lägg:</b> bildar de placerade runorna inget mönster kan du lägga ut dem utan att ett kast går åt – perfekt för att förbereda en stor kombination. Men du drar inga nya runor.</p>' +
      '<p><b>Byt:</b> markera runor i handen och/eller gamla runor på brädet och byt bort dem (högst 5 åt gången).</p>' +
      '<p><b>Reaktioner:</b> en runa intill ett mönster som har en annan symbol är en katalysator. 🔥🔥🔥 med ⚡ bredvid blir <i>Överladdad eld</i> (×1.5 Mult).</p>' +
      '<p><b>Kedjor:</b> flera mönster i samma kast ger extra ×Mult.</p>' +
      '<p><b>Reliker</b> ändrar reglerna. Deras ordning spelar roll: ×Mult längst till höger ger mest. Dra för att sortera, klicka för att sälja.</p>' +
      '<p><b>Butiken:</b> köp reliker, Ristningar (ändrar runor), Stjärnbilder (höjer mönsternivåer), paket och altarförbättringar. Ränta: $1 per $5 du har (högst $5).</p>' +
      '<p><b>Tangenter:</b> Enter = Kasta/Lägg, D = Byt, Z = ta tillbaka, 1–9 = välj runa, H = tips.</p></div>');
  }

  // ---- Start ----------------------------------------------------------------------
  function bind() {
    $('btn-cast').addEventListener('click', doCast);
    $('btn-discard').addEventListener('click', doDiscard);
    $('btn-sort').addEventListener('click', doSort);
    $('btn-hint').addEventListener('click', doHint);
    $('btn-undo').addEventListener('click', function () { if (!UI.anim) { G.unplaceAll(); render(); } });
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('[data-act]');
      if (!a) return;
      var act = a.dataset.act;
      if (act === 'close') closeModal();
      else if (act === 'patterns') openPatterns();
      else if (act === 'bag') openBag();
      else if (act === 'codex') openCodex('Grund');
      else if (act === 'menu') { UI.menu = true; render(); }
    });
    $('modal').addEventListener('click', function (e) { if (e.target === $('modal')) closeModal(); });
    $('logo').addEventListener('click', function () { UI.menu = true; render(); });
    $('fx').addEventListener('click', function () { UI.skip = true; });
    $('main').addEventListener('click', function () { if (UI.anim) UI.skip = true; }, true);
    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'Escape') { closeModal(); return; }
      if (!G || UI.menu || G.phase !== 'round') return;
      if (e.key === 'Enter') doCast();
      else if (e.key === 'd' || e.key === 'D') doDiscard();
      else if (e.key === 'z' || e.key === 'Z') { G.unplaceAll(); render(); }
      else if (e.key === 'h' || e.key === 'H') doHint();
      else if (/^[1-9]$/.test(e.key)) { var rn = G.hand[Number(e.key) - 1]; if (rn) toggleSel(rn); }
    });
    window.addEventListener('resize', function () { if (G) renderScreen(); });
  }
  // För tester och felsökning i konsolen.
  UI.game = function () { return G; };
  UI.render = render;
  if (R.ASSETS && R.ASSETS['bg/altar']) $('boardwrap').style.backgroundImage = 'linear-gradient(#1d1532cc, #1d1532cc), url(assets/bg/altar.webp)';
  if (R.ASSETS && R.ASSETS['bg/menu']) document.body.style.backgroundImage = 'linear-gradient(#14101fd9, #14101fee), url(assets/bg/menu.webp)';
  bind();
  G = loadSave();
  if (!G) UI.menu = true;
  render();
  if (!G) renderMenu($('screen'));
})();
