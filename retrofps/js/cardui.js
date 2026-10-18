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
  if (card.rarity === 'legendarisk') node.classList.add('legend');
}
// Tal med tecken eller procent färgas: gröna på fördelar, röda på nackdelar (de sista `bad` raderna).
const NUM_RE = /[+\-\u2212]\d+(?:,\d+)?(?:\s?%)?|\d+(?:,\d+)?\s?%/g;
function fxLine(text, bad) {
  const d = el('div', bad ? 'bad' : '');
  let last = 0;
  text.replace(NUM_RE, (m, off) => {
    if (off > last) d.appendChild(document.createTextNode(text.slice(last, off)));
    d.appendChild(el('span', 'cu-n ' + (bad ? 'neg' : 'pos'), m));
    last = off + m.length;
    return m;
  });
  if (last < text.length) d.appendChild(document.createTextNode(text.slice(last)));
  return d;
}
function fxLines(card) {
  const box = el('div', 'cu-fx');
  const lines = String(card.text).split('\n');
  const badFrom = lines.length - (card.bad || 0);
  lines.forEach((t, i) => box.appendChild(fxLine(t, i >= badFrom)));
  return box;
}
// Effektrader ur Cards.modLines: "+10 % SKADA" i grönt, nackdelar i rött. mul = antal kort.
function modList(card, mul) {
  const box = el('div', 'cu-mods');
  if (!window.Cards.modLines || !card.mods) return box;
  const mods = {};
  for (const k in card.mods) mods[k] = card.mods[k] * (mul || 1);
  for (const l of window.Cards.modLines(mods)) box.appendChild(el('div', l.good ? 'pos' : 'neg', l.text));
  return box;
}
// Piltangenter i ett rutnät: vänster/höger ett steg, upp/ned en rad.
function gridMove(list, e, grid) {
  const step0 = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 }[e.code];
  if (!step0) return false;
  if (!list.length) return true;
  let cols = 0;
  try { cols = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length : 0; } catch (err) { cols = 0; }
  if (!cols) {
    cols = list.length;
    const t0 = list[0].offsetTop, k = list.findIndex(x => x.offsetTop !== t0);
    if (k > 0) cols = k;
  }
  const step = (e.code === 'ArrowUp' || e.code === 'ArrowDown') ? step0 * cols : step0;
  const i = list.indexOf(document.activeElement);
  const n = i < 0 ? 0 : Math.max(0, Math.min(list.length - 1, i + step));
  list[n].focus({ preventScroll: false });
  return true;
}
// Knappgrupp (sortering, filter): opts [[värde, text]], onPick(värde)
function segmented(opts, value, onPick, label) {
  const g = el('div', 'cu-seg'); g.setAttribute('role', 'group'); if (label) g.setAttribute('aria-label', label);
  const btns = opts.map(([v, t]) => {
    const b = el('button', 'cu-sb', t); b.type = 'button'; b.dataset.v = v;
    b.addEventListener('click', ev => { ev.stopPropagation(); set(v); onPick(v); });
    g.appendChild(b); return b;
  });
  function set(v) { btns.forEach(b => { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }); }
  set(value);
  g.set = set;
  return g;
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
// opts: { title, subtitle, skipLabel, owned: [id], seen: Set(id), banish: card => ersättare|null,
//         reroll: { price (tal eller funktion), gold, onReroll: () => [kort] | null } }
function draft(cards, opts, onPick) {
  if (typeof opts === 'function') { onPick = opts; opts = {}; }
  opts = opts || {};
  cards = (cards || []).slice();
  const ownedList = opts.owned || [];
  const owned = {};
  for (const id of ownedList) owned[id] = (owned[id] || 0) + 1;
  const seen = opts.seen ? (opts.seen instanceof Set ? opts.seen : new Set(opts.seen)) : null;
  const synOf = card => (opts.owned && window.Cards.synergy ? window.Cards.synergy(card, ownedList) : '');
  const canBanish = typeof opts.banish === 'function';
  const rr = opts.reroll && typeof opts.reroll.onReroll === 'function' ? opts.reroll : null;
  let gold = rr ? (+rr.gold || 0) : 0;
  const rrPrice = () => (rr ? Math.max(0, +(typeof rr.price === 'function' ? rr.price() : rr.price) || 0) : 0);

  const node = el('div', 'cu-screen cu-draft');
  const wrap = el('div', 'cu-wrap');
  node.appendChild(wrap);
  node.setAttribute('aria-label', opts.title || 'VÄLJ ETT KORT');
  wrap.appendChild(el('h2', 'cu-title', opts.title || 'VÄLJ ETT KORT'));
  if (opts.subtitle) wrap.appendChild(el('p', 'cu-sub', opts.subtitle));
  const row = el('div', 'cu-cards' + (canBanish || opts.owned || seen ? ' extra' : ''));
  wrap.appendChild(row);
  let slots = []; // { card, slot, el, revealed, ban }
  let picked = false, banishUsed = false;

  function makeSlot(card, i) {
    const r = R()[card.rarity];
    const slot = el('div', 'cu-slot down');
    const c = el('div', 'cu-card down');
    c.tabIndex = 0; c.setAttribute('role', 'button');
    const syn = synOf(card);
    const isNew = seen && !seen.has(card.id);
    c.setAttribute('aria-label', (i + 1) + ': ' + card.name + ', ' + (tagOf(card) ? tagOf(card) + ', ' : '') + r.label + '. ' + card.text.replace(/\n/g, ', ')
      + (isNew ? '. NY' : '') + (syn ? '. SYNERGI: ' + syn : ''));
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
    if (isNew) c.appendChild(el('div', 'cu-new', 'NY'));
    c.addEventListener('click', () => pick(slots.findIndex(s => s.el === c)));
    slot.appendChild(c);
    const s = { card, slot, el: c, revealed: false, ban: null };
    if (syn || canBanish) {
      const x = el('div', 'cu-extra');
      if (syn) x.appendChild(el('div', 'cu-syn', 'SYNERGI: ' + syn));
      if (canBanish) {
        const bb = el('button', 'cu-ban', 'FÖRVISA'); bb.type = 'button';
        bb.title = 'BYT UT KORTET MOT ETT ANNAT (EN GÅNG PER VAL)';
        bb.setAttribute('aria-label', 'FÖRVISA ' + card.name);
        bb.disabled = banishUsed;
        bb.addEventListener('click', ev => { ev.stopPropagation(); banish(slots.indexOf(s)); });
        x.appendChild(bb); s.ban = bb;
      }
      slot.appendChild(x);
    }
    return s;
  }
  function build(animate) {
    row.textContent = '';
    row.style.setProperty('--n', Math.max(1, cards.length));
    slots = cards.map((card, i) => { const s = makeSlot(card, i); row.appendChild(s.slot); return s; });
    if (reduced() || !animate) slots.forEach((_, i) => reveal(i, animate));
    else slots.forEach((_, i) => later(() => reveal(i), 300 + i * 380));
    hint.textContent = touchUI() ? 'TRYCK PÅ ETT KORT FÖR ATT VÄLJA' : 'KLICKA ELLER TRYCK 1-' + Math.max(1, cards.length) + ' · PILTANGENTER OCH ENTER' + (rr ? ' · R = NYA KORT' : '');
  }

  const msg = el('div', 'cu-msg'); msg.setAttribute('aria-live', 'polite');
  const foot = el('div', 'cu-foot');
  let rrBtn = null, goldBox = null;
  if (rr) {
    goldBox = el('div', 'cu-gold small'); goldBox.appendChild(el('span', 'cu-coin')); goldBox.appendChild(el('span', 'cu-gv'));
    rrBtn = el('button', 'cu-btn cu-reroll'); rrBtn.type = 'button';
    rrBtn.addEventListener('click', ev => { ev.stopPropagation(); reroll(); });
    foot.appendChild(goldBox); foot.appendChild(rrBtn);
  }
  const canSkip = opts.skipLabel !== false;
  if (canSkip) {
    const skip = el('button', 'cu-btn ghost', esc(opts.skipLabel || 'HOPPA ÖVER'));
    skip.type = 'button';
    skip.addEventListener('click', skipIt);
    foot.appendChild(skip);
  }
  wrap.appendChild(msg);
  wrap.appendChild(foot);
  const hint = el('div', 'cu-hint');
  wrap.appendChild(hint);
  const setMsg = (t, cls) => { msg.textContent = t || ''; msg.className = 'cu-msg' + (cls ? ' ' + cls : ''); };
  function refreshReroll() {
    if (!rr) return;
    const p = rrPrice();
    rrBtn.textContent = 'NYA KORT (' + (p ? p + ' G' : 'GRATIS') + ')';
    rrBtn.classList.toggle('poor', p > gold);
    rrBtn.setAttribute('aria-disabled', p > gold ? 'true' : 'false');
    goldBox.querySelector('.cu-gv').textContent = 'GULD ' + gold;
  }

  function reveal(i, flip) {
    const s = slots[i];
    if (!s || s.revealed) return;
    s.revealed = true;
    if (flip === false) { s.el.classList.remove('down'); s.slot.classList.remove('down'); return; }
    s.el.classList.remove('down'); s.slot.classList.remove('down'); sfx('flip');
  }
  const allRevealed = () => slots.every(s => s.revealed);
  function revealAll() { cur && cur.timers.forEach(clearTimeout); slots.forEach((_, i) => reveal(i)); }
  function pick(i) {
    if (picked || !slots[i]) return;
    if (!allRevealed()) { revealAll(); return; } // första trycket vänder bara upp resten
    picked = true; sfx('pick');
    slots.forEach((s, k) => s.el.classList.add(k === i ? 'picked' : 'faded'));
    slots.forEach(s => s.slot.classList.add('done'));
    const card = slots[i].card;
    const done = () => { close(); if (onPick) onPick(card); };
    if (reduced()) done(); else later(done, 280);
  }
  function deny(node2, text) { sfx('deny'); setMsg(text, 'bad'); node2.classList.remove('shake'); void node2.offsetWidth; node2.classList.add('shake'); }
  function banish(i) {
    if (picked || banishUsed || !slots[i]) return;
    if (!allRevealed()) { revealAll(); return; }
    let rep = null;
    try { rep = opts.banish(slots[i].card); } catch (e) { rep = null; }
    if (!rep) { deny(slots[i].slot, 'INGET KORT ATT BYTA TILL'); return; }
    banishUsed = true;
    const old = slots[i];
    const hadFocus = old.slot.contains(document.activeElement);
    cards[i] = rep;
    const s = makeSlot(rep, i);
    row.replaceChild(s.slot, old.slot);
    slots[i] = s;
    slots.forEach(x => { if (x.ban) x.ban.disabled = true; });
    if (reduced()) reveal(i, false); else later(() => reveal(i), 60);
    setMsg(old.card.name + ' FÖRVISAD', 'ok');
    sfx('flip');
    if (hadFocus) try { s.el.focus({ preventScroll: true }); } catch (e) { /* ingen fokus */ }
  }
  function reroll() {
    if (picked || !rr) return;
    const p = rrPrice();
    if (p > gold) { deny(rrBtn, 'FÖR LITE GULD!'); return; }
    let res = null;
    try { res = rr.onReroll(); } catch (e) { res = null; }
    const list = Array.isArray(res) ? res : res && Array.isArray(res.cards) ? res.cards : null;
    if (!list || !list.length) { deny(rrBtn, 'INGA NYA KORT'); return; }
    gold = res && typeof res.gold === 'number' ? res.gold : gold - p;
    cur && cur.timers.forEach(clearTimeout);
    cards = list.slice();
    build(true);
    refreshReroll();
    setMsg('NYA KORT', 'ok');
    sfx('buy');
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
    if (e.code === 'KeyR' && rr) { reroll(); return true; }
    const els = slots.map(s => s.el);
    if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') { moveFocus(els, -1); return true; }
    if (e.code === 'ArrowRight' || e.code === 'ArrowDown') { moveFocus(els, 1); return true; }
    return activate(e);
  });
  build(true);
  refreshReroll();
}

// ---------- Butik ----------
const GLYPHS = {
  grenade: { color: '#9fe060', map: ['....XX...', '...X..X..', '..XXXX...', '.XXXXXX..', 'XXXXXXXX.', 'XXXXXXXX.', 'XXXXXXXX.', '.XXXXXX..', '..XXXX...'] },
  gamble: { color: '#e8d9b0', map: ['XXXXXXXXX', 'X.......X', 'X.X...X.X', 'X.......X', 'X...X...X', 'X.......X', 'X.X...X.X', 'X.......X', 'XXXXXXXXX'] },
  purge: { color: '#e05a3a', map: ['X.......X', '.X.....X.', '..X...X..', '...X.X...', '....X....', '...X.X...', '..X...X..', '.X.....X.', 'X.......X'] },
  mystery: { color: '#c080ff', map: ['..XXXXX..', '.XX...XX.', '......XX.', '.....XX..', '....XX...', '....XX...', '.........', '....XX...', '....XX...'] },
  meta: { color: '#c0a0ff', map: ['....X....', '...XXX...', '..XXXXX..', '.XXXXXXX.', '...XXX...', '...XXX...', '...XXX...', '...XXX...'] },
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
  purge: ['RENSA', 'TA BORT ETT KORT'],
  mystery: ['MYSTERIUM', 'ETT OKÄNT KORT'],
  meta: ['UPPGRADERING', 'BESTÅENDE'],
  grenade: ['GRANAT', '+1 GRANAT'],
  gamble: ['TÄRNINGSSPEL', 'SATSA GULD'],
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
let deckSort = 'rar'; // kommer ihåg valet under sessionen
const TYPE_RANK = c => (c.set ? 0 : c.pact ? 3 : c.weapon ? 4 : c.curse ? 2 : 1);
function groupOf(c) {
  const C = window.Cards;
  if (c.set && C.SETS && C.SETS[c.set]) return 'SET: ' + C.SETS[c.set].name;
  if (c.pact) return 'PAKTER';
  if (c.weapon) return 'UPPGRADERINGAR: ' + (C.WEAPON_NAME ? C.WEAPON_NAME[c.weapon] : c.weapon);
  if (c.curse) return 'FÖRBANNADE';
  return 'ÖVRIGA KORT';
}
function sortCards(list, mode, get) {
  get = get || (x => x);
  const order = window.Cards.RARITY_ORDER;
  const byName = (a, b) => get(a).name.localeCompare(get(b).name, 'sv');
  const byRar = (a, b) => order.indexOf(get(b).rarity) - order.indexOf(get(a).rarity);
  if (mode === 'name') return list.sort(byName);
  if (mode === 'type') return list.sort((a, b) => TYPE_RANK(get(a)) - TYPE_RANK(get(b)) || groupOf(get(a)).localeCompare(groupOf(get(b)), 'sv') || byRar(a, b) || byName(a, b));
  return list.sort((a, b) => byRar(a, b) || byName(a, b));
}
const SORTS = [['rar', 'SÄLLSYNTHET'], ['name', 'NAMN'], ['type', 'TYP']];
function setSection(ownedIds) {
  const C = window.Cards;
  const box = el('div', 'cu-sets');
  if (!C.setProgress) return box;
  const ownedSet = new Set(ownedIds || []);
  box.appendChild(el('div', 'cu-sh', 'SET · 3 OLIKA KORT GER BONUSEN'));
  const list = el('div', 'cu-setlist');
  for (const sp of C.setProgress(ownedIds || [])) {
    const r = el('div', 'cu-set' + (sp.active ? ' on' : sp.have ? '' : ' dim'));
    const top = el('div', 'cu-settop');
    top.appendChild(el('span', 'cu-setname', sp.name));
    const pips = el('span', 'cu-pips');
    pips.setAttribute('aria-label', sp.have + ' av ' + sp.need);
    for (let i = 0; i < sp.need; i++) pips.appendChild(el('i', i < sp.have ? 'f' : ''));
    pips.appendChild(el('span', 'cu-setn', sp.active ? 'AKTIVT' : sp.have + '/' + sp.need));
    top.appendChild(pips);
    r.appendChild(top);
    r.appendChild(el('div', 'cu-setfx', String(sp.text).replace(/\n/g, ' · ')));
    if (sp.cards) {
      const m = el('div', 'cu-setcards');
      sp.cards.forEach(id => { const c = C.byId(id); if (c) m.appendChild(el('span', ownedSet.has(id) ? 'own' : '', c.name)); });
      r.appendChild(m);
    }
    list.appendChild(r);
  }
  box.appendChild(list);
  return box;
}
function detailFor(detail, card, n) {
  detail.className = 'cu-detail'; detail.textContent = '';
  const C = window.Cards;
  const r = R()[card.rarity];
  const dn = el('div', 'cu-dn', card.name); dn.style.color = r.color;
  detail.appendChild(dn);
  detail.appendChild(el('div', 'cu-dm', tagPre(card) + r.label + (card.set && C.SETS && C.SETS[card.set] ? ' · SET: ' + C.SETS[card.set].name : '')));
  detail.appendChild(fxLines(card));
  const ml = n > 1 ? modList(card, n) : null; // flera exemplar: summan med tecken
  if (ml && ml.childNodes.length) {
    detail.appendChild(el('div', 'cu-dm', 'TOTALT ×' + n));
    detail.appendChild(ml);
  }
}
function deck(ownedIds, onClose) {
  const C = window.Cards;
  const counts = new Map();
  for (const id of ownedIds || []) if (C.byId(id)) counts.set(id, (counts.get(id) || 0) + 1);
  const entries = [...counts].map(([id, n]) => ({ card: C.byId(id), n }));
  const node = el('div', 'cu-screen cu-deck');
  node.setAttribute('aria-label', 'DINA KORT');
  const box = el('div', 'cu-deckbox');
  const wrap = el('div', 'cu-wrap'); wrap.appendChild(box); node.appendChild(wrap);
  box.appendChild(el('h2', 'cu-title', 'DINA KORT'));
  const total = entries.reduce((s, e) => s + e.n, 0);
  box.appendChild(el('p', 'cu-sub', total ? total + ' KORT SAMLADE DENNA RUNDA' : 'DU HAR INGA KORT ÄNNU.'));
  const detail = el('div', 'cu-detail empty', 'VÄLJ ETT KORT FÖR ATT SE DETALJER');
  const grid = el('div', 'cu-grid');
  let tiles = [];
  function show(e, t) {
    tiles.forEach(x => x.classList.toggle('sel', x === t));
    detailFor(detail, e.card, e.n);
  }
  function build() {
    grid.textContent = ''; tiles = [];
    sortCards(entries, deckSort, e => e.card);
    let group = null;
    entries.forEach(e => {
      if (deckSort === 'type') {
        const g = groupOf(e.card);
        if (g !== group) { group = g; grid.appendChild(el('div', 'cu-ghead', g)); }
      }
      const t = el('div', 'cu-tile'); t.tabIndex = 0; t.setAttribute('role', 'button');
      t.setAttribute('aria-label', e.card.name + (e.n > 1 ? ' x' + e.n : '') + ': ' + e.card.text.replace(/\n/g, ', '));
      tint(t, e.card);
      t.title = C.describe(e.card);
      t.appendChild(art(e.card));
      t.appendChild(el('div', 'cu-tn', e.card.name));
      if (e.n > 1) t.appendChild(el('div', 'cu-cnt', '×' + e.n));
      t.addEventListener('click', ev => { ev.stopPropagation(); show(e, t); });
      t.addEventListener('focus', () => show(e, t));
      grid.appendChild(t); tiles.push(t);
    });
  }
  let seg = null;
  if (entries.length) {
    const bar = el('div', 'cu-bar');
    bar.appendChild(el('span', 'cu-barl', 'SORTERA'));
    seg = segmented(SORTS, deckSort, v => { deckSort = v; build(); }, 'SORTERA');
    bar.appendChild(seg);
    box.appendChild(bar);
    build();
    box.appendChild(grid);
    box.appendChild(detail);
  }
  box.appendChild(setSection(ownedIds));
  const foot = el('div', 'cu-foot');
  const btn = el('button', 'cu-btn', esc('STÄNG')); btn.type = 'button';
  foot.appendChild(btn); box.appendChild(foot);
  const finish = () => { close(); if (onClose) onClose(); };
  btn.addEventListener('click', ev => { ev.stopPropagation(); finish(); });
  node.addEventListener('click', ev => { if (ev.target === node || ev.target === wrap) finish(); }); // klick utanför stänger
  open('deck', node, e => {
    if (e.code === 'Escape') { finish(); return true; }
    if (e.code === 'KeyS' && seg) { const i = SORTS.findIndex(x => x[0] === deckSort); deckSort = SORTS[(i + 1) % SORTS.length][0]; seg.set(deckSort); build(); return true; }
    if (gridMove(tiles, e, grid)) return true;
    return activate(e);
  });
}

// ---------- Kortarkiv (codex) ----------
// codex(allCards, { seen: Set, owned: Set, unlocked: Set }, onClose): alla kort, osedda som silhuetter.
let codexFilter = 'alla';
function codex(allCards, info, onClose) {
  if (typeof info === 'function') { onClose = info; info = {}; }
  info = info || {};
  const C = window.Cards;
  const asSet = v => (v instanceof Set ? v : new Set(v || []));
  const seen = asSet(info.seen), owned = asSet(info.owned), unlocked = asSet(info.unlocked);
  const cards = (allCards || C.ALL).slice()
    .sort((a, b) => C.RARITY_ORDER.indexOf(a.rarity) - C.RARITY_ORDER.indexOf(b.rarity) || TYPE_RANK(a) - TYPE_RANK(b) || a.name.localeCompare(b.name, 'sv'));
  const node = el('div', 'cu-screen cu-deck cu-codex');
  node.setAttribute('aria-label', 'KORTARKIVET');
  const box = el('div', 'cu-deckbox');
  const wrap = el('div', 'cu-wrap'); wrap.appendChild(box); node.appendChild(wrap);
  box.appendChild(el('h2', 'cu-title', 'KORTARKIVET'));
  const count = el('p', 'cu-sub'); box.appendChild(count);
  const FILTERS = [['alla', 'ALLA']].concat(C.RARITY_ORDER.map(r => [r, R()[r].label]));
  const seg = segmented(FILTERS, codexFilter, v => { codexFilter = v; apply(); }, 'FILTER');
  const bar = el('div', 'cu-bar'); bar.appendChild(seg); box.appendChild(bar);
  const scroller = el('div', 'cu-scroll');
  const grid = el('div', 'cu-grid'); scroller.appendChild(grid); box.appendChild(scroller);
  const detail = el('div', 'cu-detail empty', 'VÄLJ ETT KORT FÖR ATT SE DETALJER');
  box.appendChild(detail);
  const tiles = cards.map(card => {
    const isSeen = seen.has(card.id) || owned.has(card.id);
    const locked = !!card.unlock && !unlocked.has(card.id) && !owned.has(card.id);
    const t = el('div', 'cu-tile' + (isSeen ? '' : ' unseen') + (locked ? ' locked' : ''));
    t.tabIndex = 0; t.setAttribute('role', 'button');
    if (isSeen) tint(t, card);
    if (isSeen) { t.appendChild(art(card)); t.querySelector('img').loading = 'lazy'; }
    else { // silhuett: bildens ljusa motiv som mask över en mörk färg
      const a = el('div', 'cu-art'), sil = el('div', 'cu-sil');
      const u = 'url("' + img(card) + '")';
      sil.style.webkitMaskImage = u; sil.style.maskImage = u;
      a.appendChild(sil); t.appendChild(a);
    }
    t.appendChild(el('div', 'cu-tn', isSeen ? card.name : '???'));
    if (owned.has(card.id)) t.appendChild(el('div', 'cu-mark own', 'ÄGD'));
    else if (locked) t.appendChild(el('div', 'cu-mark', 'LÅST'));
    t.setAttribute('aria-label', isSeen ? card.name + ', ' + R()[card.rarity].label : 'OKÄNT KORT, ' + R()[card.rarity].label);
    const show = () => {
      tiles.forEach(x => x.node.classList.toggle('sel', x.node === t));
      if (isSeen) {
        detailFor(detail, card, 1);
        if (locked) detail.appendChild(el('div', 'cu-dm', 'LÅST · ' + card.unlock + ' SJÄLAR PÅ ALTARET'));
      } else {
        detail.className = 'cu-detail'; detail.textContent = '';
        detail.appendChild(el('div', 'cu-dn', '???'));
        detail.appendChild(el('div', 'cu-dm', R()[card.rarity].label));
        detail.appendChild(el('div', 'cu-fx', 'DU HAR INTE SETT DET HÄR KORTET ÄNNU.'));
        if (locked) detail.appendChild(el('div', 'cu-dm', 'LÅST · ' + card.unlock + ' SJÄLAR PÅ ALTARET'));
      }
    };
    t.addEventListener('click', ev => { ev.stopPropagation(); show(); });
    t.addEventListener('focus', show);
    grid.appendChild(t);
    return { card, node: t, seen: isSeen };
  });
  function apply() {
    let n = 0, s = 0;
    for (const t of tiles) {
      const vis = codexFilter === 'alla' || t.card.rarity === codexFilter;
      t.node.hidden = !vis;
      if (vis) { n++; if (t.seen) s++; }
    }
    count.textContent = 'SEDDA ' + s + ' AV ' + n;
  }
  apply();
  const foot = el('div', 'cu-foot');
  const btn = el('button', 'cu-btn', esc('STÄNG')); btn.type = 'button';
  foot.appendChild(btn); box.appendChild(foot);
  let done = false;
  const finish = () => { if (done) return; done = true; close(); if (onClose) onClose(); };
  btn.addEventListener('click', ev => { ev.stopPropagation(); finish(); });
  node.addEventListener('click', ev => { if (ev.target === node || ev.target === wrap) finish(); });
  open('codex', node, e => {
    if (e.code === 'Escape') { finish(); return true; }
    const d = digit(e);
    if (d && FILTERS[d - 1]) { codexFilter = FILTERS[d - 1][0]; seg.set(codexFilter); apply(); return true; }
    if (gridMove(tiles.filter(t => !t.node.hidden).map(t => t.node), e, grid)) return true;
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

// ---------- Panel och lista (inställningar, bestiarium, prestationer, profil) ----------
// panel: body(container) fyller i innehållet; onClose körs när panelen stängs (Esc, knappen eller klick utanför)
function panel(title, subtitle, body, onClose) {
  const node = el('div', 'cu-screen cu-deck cu-panel');
  const box = el('div', 'cu-deckbox');
  const wrap = el('div', 'cu-wrap'); wrap.appendChild(box); node.appendChild(wrap);
  box.appendChild(el('h2', 'cu-title', title));
  if (subtitle) box.appendChild(el('p', 'cu-sub', subtitle));
  const content = el('div', 'cu-pbody'); box.appendChild(content);
  body(content);
  const foot = el('div', 'cu-foot');
  const btn = el('button', 'cu-btn', esc('STÄNG')); btn.type = 'button';
  foot.appendChild(btn); box.appendChild(foot);
  let done = false;
  const finish = () => { if (done) return; done = true; close(); if (onClose) onClose(); };
  btn.addEventListener('click', ev => { ev.stopPropagation(); finish(); });
  node.addEventListener('click', ev => { if (ev.target === node || ev.target === wrap) finish(); });
  open('panel', node, e => { if (e.code === 'Escape') { finish(); return true; } return false; });
}
// list: rader { label, text, color, dim } i en panel
function list(title, subtitle, rows, onClose) {
  panel(title, subtitle, c => {
    const ul = el('div', 'cu-list');
    for (const r of rows) {
      const li = el('div', 'cu-li' + (r.dim ? ' dim' : '') + (r.head ? ' head' : ''));
      if (r.img) { const im = document.createElement('img'); im.className = 'cu-limg'; im.src = r.img; im.alt = ''; li.appendChild(im); li.classList.add('img'); }
      const lab = el('div', 'cu-ll', r.label); if (r.color) lab.style.color = r.color;
      li.appendChild(lab); if (r.text) li.appendChild(el('div', 'cu-lt', r.text));
      if (r.onClick) { li.tabIndex = 0; li.setAttribute('role', 'button'); li.classList.add('btn'); li.addEventListener('click', ev => { ev.stopPropagation(); r.onClick(); }); li.addEventListener('keydown', ev => { if (ev.key === 'Enter') r.onClick(); }); }
      ul.appendChild(li);
    }
    c.appendChild(ul);
  }, onClose);
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

Object.assign(api, { draft, shop, deck, codex, toast, choice, panel, list, el, close: () => close(), isOpen: () => !!cur });
window.CardUI = api;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureRoot); else if (document.body) ensureRoot();
})();
