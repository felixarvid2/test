'use strict';
// KRYPTA – kortgränssnitt: draft (välj 1 av n), butik, kortlek och toast.
// Ladda helst före game.js så att UI:ts tangentlyssnare (window, capture) körs först och
// kan stoppa tangenter från att nå spelet medan ett fönster är öppet.
(() => {
const SCRIPT = document.currentScript;
let BASE = '';
try { BASE = new URL('../', SCRIPT.src).href; } catch (e) { BASE = ''; }
const touchUI = () => !!(window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window; // inga tangentbordstips på pekskärm
const esc = t => touchUI() ? t : t + ' (ESC)';
const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const R = () => window.Cards.RARITY;

let root = null, toasts = null, cur = null;
const swallow = new Set(); // tangenter (code) vars keyup ska stoppas efter att UI:t tog keydown
const api = { base: BASE, sfx: null }; // sfx(namn): valfri ljudkrok ('open','flip','pick','buy','deny','close')
const sfx = n => { try { if (api.sfx) api.sfx(n); } catch (e) { /* ljud är valfritt */ } };

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function ensureCss() {
  if (document.querySelector('link[href*="cards.css"]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = (BASE || '') + 'css/cards.css';
  document.head.appendChild(l);
}
function ensureRoot() {
  ensureCss();
  if (root && root.isConnected) return root;
  root = document.getElementById('cardui');
  if (!root) { root = document.createElement('div'); root.id = 'cardui'; }
  if (!root.isConnected) document.body.insertBefore(root, document.body.firstChild);
  return root;
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}
const img = card => (api.base || '') + card.icon;
// etikett: FÖRBANNAD, PAKT eller vapnet en uppgradering hör till
const tagOf = card => (window.Cards.tag ? window.Cards.tag(card) : card.curse ? 'FÖRBANNAD' : '');
const tagPre = card => (tagOf(card) ? tagOf(card) + ' · ' : '');
function tint(node, card) {
  const c = R()[card.rarity].color;
  node.style.setProperty('--rc', c);
  node.style.setProperty('--glow', hexA(c, 0.35));
  if (card.curse) node.classList.add('curse');
  if (card.pact) node.classList.add('pact');
}
function fxLines(card) {
  const box = el('div', 'cu-fx');
  const lines = String(card.text).split('\n');
  const badFrom = lines.length - (card.bad || 0);
  lines.forEach((t, i) => box.appendChild(el('div', i >= badFrom ? 'bad' : '', t)));
  return box;
}
function art(card) {
  const a = el('div', 'cu-art');
  const i = el('img'); i.src = img(card); i.alt = ''; i.draggable = false;
  a.appendChild(i);
  return a;
}

// ---------- Öppna / stänga ----------
function open(type, node, onKey) {
  close(true);
  ensureRoot();
  const prev = document.activeElement;
  node.setAttribute('role', 'dialog'); node.setAttribute('aria-modal', 'true');
  node.tabIndex = -1;
  // Musen ska inte nå spelet (t.ex. för att låsa pekaren) medan UI:t är öppet.
  for (const ev of ['mousedown', 'click', 'wheel', 'contextmenu', 'touchstart']) {
    node.addEventListener(ev, e => { e.stopPropagation(); if (ev === 'contextmenu') e.preventDefault(); }, { passive: ev !== 'contextmenu' });
  }
  root.appendChild(node);
  cur = { type, node, onKey, timers: [], prev };
  try { node.focus({ preventScroll: true }); } catch (e) { /* ingen fokus */ }
  sfx('open');
  return cur;
}
function later(fn, ms) { const c = cur; const t = setTimeout(() => { if (cur === c) fn(); }, ms); c.timers.push(t); return t; }
function close(silent) {
  if (!cur) return;
  const c = cur; cur = null;
  c.timers.forEach(clearTimeout);
  if (c.node.parentNode) c.node.parentNode.removeChild(c.node);
  if (c.prev && c.prev.isConnected && c.prev.focus) { try { c.prev.focus({ preventScroll: true }); } catch (e) { /* ignorera */ } }
  if (!silent) sfx('close');
}

// ---------- Tangenter ----------
function digit(e) {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code || '');
  return m ? +m[1] : (/^[1-9]$/.test(e.key) ? +e.key : 0);
}
function moveFocus(list, dir) {
  if (!list.length) return;
  const i = list.indexOf(document.activeElement);
  const n = i < 0 ? (dir > 0 ? 0 : list.length - 1) : Math.max(0, Math.min(list.length - 1, i + dir));
  list[n].focus({ preventScroll: false });
}
function onKeyDown(e) {
  if (!cur) return;
  e.stopImmediatePropagation(); // inget av detta ska nå spelet
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Tab') return; // fokusflytt sköts av webbläsaren
  let handled = false;
  if (cur.onKey) handled = cur.onKey(e);
  if (handled) { e.preventDefault(); swallow.add(e.code); }
  else if (['Enter', 'Space', 'Escape'].includes(e.code)) swallow.add(e.code);
}
function onKeyUp(e) {
  if (swallow.has(e.code)) { swallow.delete(e.code); e.stopImmediatePropagation(); }
}
window.addEventListener('keydown', onKeyDown, true);
window.addEventListener('keyup', onKeyUp, true);
window.addEventListener('blur', () => swallow.clear());

function activate(e) { // Enter/Mellanslag klickar fokuserat element i UI:t
  const a = document.activeElement;
  if ((e.code === 'Enter' || e.code === 'Space') && a && cur && cur.node.contains(a) && a !== cur.node) { a.click(); return true; }
  return false;
}

// ---------- Draft ----------
function draft(cards, opts, onPick) {
  if (typeof opts === 'function') { onPick = opts; opts = {}; }
  opts = opts || {};
  cards = (cards || []).slice();
  const owned = {};
  for (const id of opts.owned || []) owned[id] = (owned[id] || 0) + 1;
  const node = el('div', 'cu-screen cu-draft');
  const wrap = el('div', 'cu-wrap');
  node.appendChild(wrap);
  node.setAttribute('aria-label', opts.title || 'VÄLJ ETT KORT');
  wrap.appendChild(el('h2', 'cu-title', opts.title || 'VÄLJ ETT KORT'));
  if (opts.subtitle) wrap.appendChild(el('p', 'cu-sub', opts.subtitle));
  const row = el('div', 'cu-cards');
  row.style.setProperty('--n', Math.max(1, cards.length));
  wrap.appendChild(row);
  const revealed = cards.map(() => false);
  const els = [];
  let picked = false;

  cards.forEach((card, i) => {
    const r = R()[card.rarity];
    const c = el('div', 'cu-card down' + (card.rarity === 'legendarisk' ? ' legend' : ''));
    c.tabIndex = 0; c.setAttribute('role', 'button');
    c.setAttribute('aria-label', (i + 1) + ': ' + card.name + ', ' + (tagOf(card) ? tagOf(card) + ', ' : '') + r.label + '. ' + card.text.replace(/\n/g, ', '));
    tint(c, card);
    const inner = el('div', 'cu-inner');
    const back = el('div', 'cu-face cu-back');
    const front = el('div', 'cu-face cu-front');
    if (tagOf(card)) front.appendChild(el('div', 'cu-ribbon' + (card.curse ? '' : card.pact ? ' pact' : ' wpn'), tagOf(card)));
    const rar = el('div', 'cu-rar'); rar.appendChild(el('span', '', r.label)); rar.appendChild(el('span', 'cu-key', '[' + (i + 1) + ']'));
    front.appendChild(rar);
    front.appendChild(art(card));
    front.appendChild(el('div', 'cu-name', card.name));
    front.appendChild(el('div', 'cu-sep'));
    front.appendChild(fxLines(card));
    if (owned[card.id]) front.appendChild(el('div', 'cu-own', 'ÄGER ' + owned[card.id] + '/' + card.max));
    inner.appendChild(back); inner.appendChild(front);
    c.appendChild(inner);
    c.addEventListener('click', () => pick(i));
    row.appendChild(c);
    els.push(c);
  });

  const foot = el('div', 'cu-foot');
  const canSkip = opts.skipLabel !== false;
  if (canSkip) {
    const skip = el('button', 'cu-btn ghost', esc(opts.skipLabel || 'HOPPA ÖVER'));
    skip.type = 'button';
    skip.addEventListener('click', skipIt);
    foot.appendChild(skip);
  }
  wrap.appendChild(foot);
  wrap.appendChild(el('div', 'cu-hint', touchUI() ? 'TRYCK PÅ ETT KORT FÖR ATT VÄLJA' : 'KLICKA ELLER TRYCK 1-' + Math.max(1, cards.length) + ' · PILTANGENTER OCH ENTER'));

  function reveal(i) {
    if (revealed[i]) return;
    revealed[i] = true; els[i].classList.remove('down'); sfx('flip');
  }
  function revealAll() { cur && cur.timers.forEach(clearTimeout); cards.forEach((_, i) => reveal(i)); }
  function pick(i) {
    if (picked || !cards[i]) return;
    if (!revealed.every(Boolean)) { revealAll(); return; } // första trycket vänder bara upp resten
    picked = true; sfx('pick');
    els.forEach((c, k) => c.classList.add(k === i ? 'picked' : 'faded'));
    const card = cards[i];
    const done = () => { close(); if (onPick) onPick(card); };
    if (reduced()) done(); else later(done, 280);
  }
  function skipIt() {
    if (picked) return;
    picked = true; close(); if (onPick) onPick(null);
  }

  open('draft', node, e => {
    if (picked) return true;
    const d = digit(e);
    if (d) { pick(d - 1); return true; }
    if (e.code === 'Escape') { if (canSkip) skipIt(); return true; }
    if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') { moveFocus(els, -1); return true; }
    if (e.code === 'ArrowRight' || e.code === 'ArrowDown') { moveFocus(els, 1); return true; }
    return activate(e);
  });
  if (reduced()) cards.forEach((_, i) => reveal(i));
  else cards.forEach((_, i) => later(() => reveal(i), 300 + i * 380));
}

// ---------- Butik ----------
const GLYPHS = {
  health: { color: '#d8442a', map: ['.XX...XX.', 'XXXX.XXXX', 'XXXXXXXXX', 'XXXXXXXXX', '.XXXXXXX.', '..XXXXX..', '...XXX...', '....X....'] },
  armor: { color: '#8ab4d8', map: ['XXXXXXXXX', 'XXXXXXXXX', 'XXXX.XXXX', 'XXXX.XXXX', 'XXXXXXXXX', '.XXXXXXX.', '.XXXXXXX.', '..XXXXX..', '...XXX...', '....X....'] },
  ammo: { color: '#ffd24a', map: ['.X..X..X.', 'XX.XX.XX.', 'XX.XX.XX.', 'XX.XX.XX.', 'XX.XX.XX.', 'XX.XX.XX.', 'XX.XX.XX.'] },
  reroll: { color: '#e8d9b0', map: ['XXXXXXXXX', 'X.......X', 'X.XX.XX.X', 'X.XX.XX.X', 'X.......X', 'X.XX.XX.X', 'X.XX.XX.X', 'X.......X', 'XXXXXXXXX'] },
};
const DEFAULTS = {
  health: ['LÄKEDRYCK', 'ÅTERSTÄLLER HP'],
  armor: ['RUSTNINGSBIT', 'GER RUSTNING'],
  ammo: ['KRUTLÅDA', 'FYLLER PÅ AMMO'],
  reroll: ['BYT UTBUD', 'NYA VAROR I HYLLAN'],
};
function glyph(kind) {
  const g = GLYPHS[kind] || GLYPHS.reroll;
  const h = g.map.length, w = g.map[0].length;
  let rects = '';
  g.map.forEach((line, y) => { for (let x = 0; x < w; x++) if (line[x] === 'X') rects += '<rect x="' + x + '" y="' + y + '" width="1" height="1"/>'; });
  const box = el('div', 'cu-ico');
  box.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" fill="' + g.color + '" aria-hidden="true">' + rects + '</svg>';
  return box;
}

function shop(items, gold, onBuy, onClose, opts) {
  opts = opts || {};
  const title = opts.title || 'BUTIKEN';
  const currency = opts.currency || 'GULD';
  let list = (items || []).slice();
  let money = gold | 0;
  let busy = false;
  const node = el('div', 'cu-screen cu-shop');
  node.setAttribute('aria-label', title);
  const box = el('div', 'cu-shopbox');
  const wrap = el('div', 'cu-wrap'); wrap.appendChild(box); node.appendChild(wrap);
  const head = el('div', 'cu-shophead');
  head.appendChild(el('h2', 'cu-title', title));
  const goldBox = el('div', 'cu-gold');
  if (opts.currencyColor) goldBox.style.color = opts.currencyColor;
  goldBox.appendChild(el('span', 'cu-coin'));
  const goldTxt = el('span'); goldBox.appendChild(goldTxt);
  head.appendChild(goldBox);
  box.appendChild(head);
  const grid = el('div', 'cu-items');
  box.appendChild(grid);
  const msg = el('div', 'cu-msg'); msg.setAttribute('aria-live', 'polite');
  box.appendChild(msg);
  const foot = el('div', 'cu-foot');
  const leave = el('button', 'cu-btn', esc('LÄMNA')); leave.type = 'button';
  foot.appendChild(leave); box.appendChild(foot);
  let tiles = []; // { item, node }

  const setMsg = (t, cls) => { msg.textContent = t || ''; msg.className = 'cu-msg' + (cls ? ' ' + cls : ''); };
  const setGold = flash => {
    goldTxt.textContent = currency + ' ' + money;
    if (flash && !reduced()) { goldBox.classList.remove('flash'); void goldBox.offsetWidth; goldBox.classList.add('flash'); }
  };
  function build() {
    grid.textContent = ''; tiles = [];
    list.forEach(item => {
      const isCard = item.kind === 'card' && item.card;
      const t = el('div', 'cu-item'); t.tabIndex = 0; t.setAttribute('role', 'button');
      const top = el('div', 'cu-top');
      const nm = el('div');
      let name, fx;
      if (isCard) {
        const r = R()[item.card.rarity];
        tint(t, item.card);
        top.appendChild(art(item.card));
        name = item.label || item.card.name;
        nm.appendChild(el('div', 'cu-iname', name));
        nm.appendChild(el('div', 'cu-irar', tagPre(item.card) + r.label));
        fx = fxLines(item.card);
      } else {
        const d = DEFAULTS[item.kind] || DEFAULTS.reroll;
        top.appendChild(glyph(item.kind));
        name = item.label || d[0];
        nm.appendChild(el('div', 'cu-iname', name));
        fx = el('div', 'cu-fx'); fx.appendChild(el('div', '', item.text || d[1]));
      }
      top.appendChild(nm);
      t.appendChild(top); t.appendChild(fx);
      const pr = el('div', 'cu-price');
      pr.appendChild(el('span', 'cu-num'));
      pr.appendChild(el('span', 'cu-pv', item.owned ? 'UPPLÅST' : String(item.price)));
      t.appendChild(pr);
      t.addEventListener('click', () => buy(item, t));
      grid.appendChild(t);
      tiles.push({ item, node: t });
    });
    if (!tiles.length) grid.appendChild(el('div', 'cu-empty', 'HYLLORNA ÄR TOMMA.'));
    refresh();
  }
  function refresh() {
    tiles.forEach((t, i) => {
      const it = t.item;
      t.node.classList.toggle('owned', !!it.owned);
      t.node.classList.toggle('poor', !it.owned && it.price > money);
      t.node.setAttribute('aria-disabled', (it.owned || it.price > money) ? 'true' : 'false');
      t.node.querySelector('.cu-num').textContent = i < 9 ? '[' + (i + 1) + ']' : '';
      const nm = it.kind === 'card' && it.card ? (it.label || it.card.name) : (it.label || (DEFAULTS[it.kind] || DEFAULTS.reroll)[0]);
      t.node.setAttribute('aria-label', nm + ', ' + (it.owned ? 'upplåst' : it.price + ' ' + currency.toLowerCase()));
    });
  }
  function deny(t, text) { sfx('deny'); setMsg(text, 'bad'); t.classList.remove('shake'); void t.offsetWidth; t.classList.add('shake'); }
  function buy(item, t) {
    if (busy) return;
    if (item.owned) { deny(t, 'REDAN UPPLÅST'); return; }
    if (item.price > money) { deny(t, 'FÖR LITE ' + currency + '!'); return; }
    busy = true;
    let res;
    try { res = onBuy ? onBuy(item) : { ok: true }; } catch (err) { res = { ok: false }; }
    Promise.resolve(res).then(r => {
      busy = false;
      if (cur && cur.node !== node) return; // UI:t har bytts ut
      r = r || {};
      if (typeof r.gold === 'number') money = r.gold;
      else if (r.ok) money -= item.price;
      if (r.ok) {
        sfx('buy');
        const nm = item.kind === 'card' && item.card ? (item.label || item.card.name) : (item.label || (DEFAULTS[item.kind] || DEFAULTS.reroll)[0]);
        setMsg(r.msg || ('KÖPT: ' + nm), 'ok');
        setGold(true);
        if (Array.isArray(r.items)) { list = r.items.slice(); build(); }
        else if (item.kind === 'card') {
          list = list.filter(x => x !== item);
          const k = tiles.findIndex(x => x.item === item);
          if (k >= 0) {
            const tn = tiles[k].node; tiles.splice(k, 1);
            const hadFocus = document.activeElement === tn;
            if (reduced()) tn.remove(); else { tn.classList.add('sold'); setTimeout(() => tn.remove(), 300); }
            if (hadFocus && tiles.length) tiles[Math.min(k, tiles.length - 1)].node.focus();
            if (!tiles.length) grid.appendChild(el('div', 'cu-empty', 'HYLLORNA ÄR TOMMA.'));
          }
          refresh();
        } else refresh();
      } else {
        setGold(false); refresh();
        deny(t, r.msg || 'KAN INTE KÖPAS');
      }
    });
  }
  function leaveShop() { close(); if (onClose) onClose(); }
  leave.addEventListener('click', leaveShop);
  setGold(false); build();
  setMsg(touchUI() ? 'TRYCK PÅ EN VARA FÖR ATT KÖPA' : 'KLICKA ELLER TRYCK 1-9 FÖR ATT KÖPA');

  open('shop', node, e => {
    const d = digit(e);
    if (d) { if (tiles[d - 1]) buy(tiles[d - 1].item, tiles[d - 1].node); return true; }
    if (e.code === 'Escape') { leaveShop(); return true; }
    const all = tiles.map(t => t.node);
    if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') { moveFocus(all, -1); return true; }
    if (e.code === 'ArrowRight' || e.code === 'ArrowDown') { moveFocus(all, 1); return true; }
    return activate(e);
  });
}

// ---------- Kortlek ----------
function deck(ownedIds, onClose) {
  const counts = new Map();
  for (const id of ownedIds || []) if (window.Cards.byId(id)) counts.set(id, (counts.get(id) || 0) + 1);
  const order = window.Cards.RARITY_ORDER;
  const entries = [...counts].map(([id, n]) => ({ card: window.Cards.byId(id), n }))
    .sort((a, b) => order.indexOf(b.card.rarity) - order.indexOf(a.card.rarity) || a.card.name.localeCompare(b.card.name, 'sv'));
  const node = el('div', 'cu-screen cu-deck');
  node.setAttribute('aria-label', 'DINA KORT');
  const box = el('div', 'cu-deckbox');
  const wrap = el('div', 'cu-wrap'); wrap.appendChild(box); node.appendChild(wrap);
  box.appendChild(el('h2', 'cu-title', 'DINA KORT'));
  const total = entries.reduce((s, e) => s + e.n, 0);
  box.appendChild(el('p', 'cu-sub', total ? total + ' KORT SAMLADE DENNA RUNDA' : 'DU HAR INGA KORT ÄNNU.'));
  const detail = el('div', 'cu-detail empty', 'VÄLJ ETT KORT FÖR ATT SE DETALJER');
  const grid = el('div', 'cu-grid');
  const tiles = [];
  function show(e, t) {
    tiles.forEach(x => x.classList.toggle('sel', x === t));
    detail.className = 'cu-detail'; detail.textContent = '';
    const r = R()[e.card.rarity];
    const dn = el('div', 'cu-dn', e.card.name); dn.style.color = r.color;
    detail.appendChild(dn);
    detail.appendChild(el('div', 'cu-dm', tagPre(e.card) + r.label));
    detail.appendChild(fxLines(e.card));
    detail.appendChild(el('div', 'cu-dm', 'ÄGER ' + e.n + ' AV MAX ' + e.card.max));
  }
  entries.forEach(e => {
    const t = el('div', 'cu-tile'); t.tabIndex = 0; t.setAttribute('role', 'button');
    t.setAttribute('aria-label', e.card.name + (e.n > 1 ? ' x' + e.n : '') + ': ' + e.card.text.replace(/\n/g, ', '));
    tint(t, e.card);
    t.title = window.Cards.describe(e.card);
    t.appendChild(art(e.card));
    t.appendChild(el('div', 'cu-tn', e.card.name));
    if (e.n > 1) t.appendChild(el('div', 'cu-cnt', '×' + e.n));
    t.addEventListener('click', ev => { ev.stopPropagation(); show(e, t); });
    t.addEventListener('focus', () => show(e, t));
    grid.appendChild(t); tiles.push(t);
  });
  if (entries.length) box.appendChild(grid);
  box.appendChild(detail);
  const foot = el('div', 'cu-foot');
  const btn = el('button', 'cu-btn', esc('STÄNG')); btn.type = 'button';
  foot.appendChild(btn); box.appendChild(foot);
  const finish = () => { close(); if (onClose) onClose(); };
  btn.addEventListener('click', ev => { ev.stopPropagation(); finish(); });
  node.addEventListener('click', ev => { if (!ev.target.closest('.cu-tile, .cu-detail')) finish(); }); // klick utanför kort stänger
  open('deck', node, e => {
    if (e.code === 'Escape') { finish(); return true; }
    if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') { moveFocus(tiles, -1); return true; }
    if (e.code === 'ArrowRight' || e.code === 'ArrowDown') { moveFocus(tiles, 1); return true; }
    return activate(e);
  });
}

// ---------- Val (t.ex. portalen efter bossen) ----------
// opts: { title, subtitle, options: [{ label, text }], cancel: index som Esc väljer (valfritt) }
function choice(opts, onPick) {
  const node = el('div', 'cu-screen cu-deck cu-choice');
  const box = el('div', 'cu-deckbox');
  const wrap = el('div', 'cu-wrap'); wrap.appendChild(box); node.appendChild(wrap);
  box.appendChild(el('h2', 'cu-title', opts.title));
  if (opts.subtitle) box.appendChild(el('p', 'cu-sub', opts.subtitle));
  const list = el('div', 'cu-choices'), btns = [];
  let done = false;
  const finish = i => { if (done) return; done = true; sfx('pick'); close(true); onPick(i); };
  opts.options.forEach((o, i) => {
    const b = el('button', 'cu-btn cu-opt'); b.type = 'button';
    b.appendChild(el('div', 'cu-ol', (touchUI() ? '' : '[' + (i + 1) + '] ') + o.label));
    if (o.text) b.appendChild(el('div', 'cu-ot', o.text));
    b.addEventListener('click', ev => { ev.stopPropagation(); finish(i); });
    list.appendChild(b); btns.push(b);
  });
  box.appendChild(list);
  open('choice', node, e => {
    const n = e.code.startsWith('Digit') ? +e.code.slice(5) - 1 : -1;
    if (n >= 0 && n < btns.length) { finish(n); return true; }
    if (e.code === 'Escape' && opts.cancel != null) { finish(opts.cancel); return true; }
    if (e.code === 'ArrowUp' || e.code === 'ArrowLeft') { moveFocus(btns, -1); return true; }
    if (e.code === 'ArrowDown' || e.code === 'ArrowRight') { moveFocus(btns, 1); return true; }
    return activate(e);
  });
  if (cur) cur.timers.push(setTimeout(() => { try { btns[0].focus({ preventScroll: true }); } catch (e) { /* ingen fokus */ } }, 60));
}

// ---------- Toast ----------
function toast(card, label) {
  ensureRoot();
  if (!toasts || !toasts.isConnected) { toasts = el('div', 'cu-toasts'); root.appendChild(toasts); }
  const t = el('div', 'cu-toast');
  tint(t, card);
  const i = el('img'); i.src = img(card); i.alt = '';
  const body = el('div');
  body.appendChild(el('div', 'cu-tk', label || (card.curse ? 'FÖRBANNAT KORT' : card.pact ? 'VAPENPAKT' : card.weapon ? 'VAPENUPPGRADERING' : 'NYTT KORT')));
  body.appendChild(el('div', 'cu-tnm', card.name));
  body.appendChild(el('div', 'cu-tfx', String(card.text).replace(/\n/g, ' · ')));
  t.appendChild(i); t.appendChild(body);
  toasts.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), reduced() ? 0 : 320); }, 2500);
  sfx('toast');
}

Object.assign(api, { draft, shop, deck, toast, choice, close: () => close(), isOpen: () => !!cur });
window.CardUI = api;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureRoot); else if (document.body) ensureRoot();
})();
