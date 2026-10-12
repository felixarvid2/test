// User interface: loading configs, listing findings, the troubleshooting assistant and the network view.
(function () {
  const CCA = window.CCA;
  const N = CCA.net;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STORE = 'cisco-config-analyzer.v1';
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Small wrappers so a blocked or full storage never breaks the page.
  const store = {
    get(key, fallback) { try { const v = localStorage.getItem(STORE + '.' + key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; } },
    set(key, value) { try { localStorage.setItem(STORE + '.' + key, JSON.stringify(value)); } catch (e) { /* ignore */ } },
    del(key) { try { localStorage.removeItem(STORE + '.' + key); } catch (e) { /* ignore */ } }
  };

  const prefs = Object.assign({ sevOff: [], group: 'severity', showIgnored: false, theme: 'system' }, store.get('prefs', {}));
  const state = { sources: [], devices: [], analysis: null, sevOff: new Set(prefs.sevOff), lastAssist: null, ignored: new Set(store.get('ignored', [])), changes: null };
  const savePrefs = () => store.set('prefs', { sevOff: [...state.sevOff], group: $('#f-group').value, showIgnored: $('#f-ignored').checked, theme: prefs.theme });

  // --------------------------------------------------------------- toast
  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
  }

  // --------------------------------------------------------------- theme
  function applyTheme() {
    if (prefs.theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', prefs.theme);
    $('#btn-theme').textContent = 'Theme: ' + prefs.theme;
  }
  function cycleTheme() {
    prefs.theme = { system: 'light', light: 'dark', dark: 'system' }[prefs.theme] || 'system';
    applyTheme();
    savePrefs();
  }
  $('#btn-theme').addEventListener('click', cycleTheme);

  // ---------------------------------------------------------------- tabs
  const TABS = ['configs', 'findings', 'troubleshoot', 'network'];
  function showTab(name, focus) {
    if (!TABS.includes(name)) return;
    $$('.tabs button').forEach(b => { const on = b.dataset.tab === name; b.classList.toggle('active', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; });
    $$('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
    try { sessionStorage.setItem(STORE + '.tab', name); } catch (e) { /* ignore */ }
    if (location.hash !== '#' + name) { try { history.replaceState(null, '', '#' + name); } catch (e) { /* ignore */ } }
    if (focus) $('#tabbtn-' + name).focus();
  }
  $$('.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('.tabs').addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const cur = TABS.indexOf($('.tabs button.active').dataset.tab);
    showTab(TABS[(cur + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length], true);
  });
  window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));

  // ------------------------------------------------------------- loading
  const hostOf = text => { const m = String(text).match(/^hostname\s+(\S+)/m); return m ? m[1] : null; };

  // Adds configs; a device whose hostname is already loaded is replaced in place.
  function addText(text, name) {
    const chunks = CCA.parser.splitConfigs(text);
    const replaced = [];
    chunks.forEach((c, i) => {
      const host = hostOf(c);
      const src = { name: chunks.length > 1 ? name + ' #' + (i + 1) : name, text: c, host };
      const at = host ? state.sources.findIndex(s => (s.host || hostOf(s.text)) === host) : -1;
      if (at >= 0) { state.sources[at] = src; replaced.push(host); }
      else state.sources.push(src);
    });
    return { added: chunks.length, replaced };
  }

  const keyOf = f => f.id + '|' + f.device + '|' + f.title;

  function rebuild(compare) {
    const before = state.analysis ? new Map(state.analysis.findings.filter(f => f.sev !== 'info').map(f => [keyOf(f), f])) : null;
    state.devices = state.sources.map((s, i) => {
      const d = CCA.parser.parseDevice(s.text, s.name);
      d.id = 'd' + (i + 1);
      return d;
    });
    state.analysis = state.devices.length ? CCA.checks.analyze(state.devices) : null;
    state.changes = null;
    if (compare && before && state.analysis) {
      const after = new Map(state.analysis.findings.filter(f => f.sev !== 'info').map(f => [keyOf(f), f]));
      state.changes = { resolved: [...before.keys()].filter(k => !after.has(k)).map(k => before.get(k)), added: [...after.keys()].filter(k => !before.has(k)).map(k => after.get(k)) };
    }
    persist();
    renderDevices();
    renderChanges();
    renderFindings();
    renderNetwork();
    $('#cnt-devices').textContent = state.devices.length;
    $('#cnt-findings').textContent = state.analysis ? visibleFindings().filter(f => f.sev !== 'info').length : 0;
  }

  function persist() {
    try {
      if ($('#remember').checked) localStorage.setItem(STORE, JSON.stringify(state.sources));
      else localStorage.removeItem(STORE);
    } catch (e) { /* storage unavailable */ }
  }

  function afterLoad(res, label) {
    if (!res.added) { toast('No configuration found in ' + label + '. Paste the output of "show running-config".'); return; }
    rebuild(true);
    const msg = res.added + ' device' + (res.added > 1 ? 's' : '') + ' loaded' + (res.replaced.length ? ' (replaced ' + res.replaced.join(', ') + ')' : '');
    toast(msg + '.');
  }

  $('#file').addEventListener('change', e => readFiles(e.target.files));
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => readFiles(e.dataTransfer.files));

  function readFiles(files) {
    const list = [...files];
    let pending = list.length;
    if (!pending) return;
    const total = { added: 0, replaced: [] };
    const skipped = [];
    list.forEach(f => {
      const r = new FileReader();
      r.onload = () => {
        const text = String(r.result);
        if (/\u0000/.test(text.slice(0, 2000))) skipped.push(f.name);
        else { const res = addText(text, f.name); total.added += res.added; total.replaced.push(...res.replaced); if (!res.added) skipped.push(f.name); }
        if (--pending === 0) finish();
      };
      r.onerror = () => { skipped.push(f.name); if (--pending === 0) finish(); };
      r.readAsText(f);
    });
    function finish() {
      if (total.added) afterLoad(total, 'the files');
      if (skipped.length) setTimeout(() => toast('Skipped ' + skipped.join(', ') + ': no Cisco configuration found.'), total.added ? 3300 : 0);
    }
    $('#file').value = '';
  }

  function addPasted() {
    const t = $('#paste').value;
    if (!t.trim()) { toast('Paste a configuration first.'); return; }
    const res = addText(t, 'pasted ' + (state.sources.length + 1));
    if (res.added) $('#paste').value = '';
    afterLoad(res, 'the pasted text');
  }
  $('#btn-paste').addEventListener('click', addPasted);
  $('#paste').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); addPasted(); } });

  const labs = CCA.labs || [{ id: 'branch', title: 'Example lab', files: CCA.samples }];
  $('#lab-select').innerHTML = labs.map(l => '<option value="' + esc(l.id) + '">' + esc(l.title) + ' (' + l.files.map(f => f.name.replace(/\.txt$/, '')).join(', ') + ')</option>').join('');
  $('#lab-select').title = labs[0].text || '';
  $('#lab-select').addEventListener('change', () => { const l = labs.find(x => x.id === $('#lab-select').value); $('#lab-select').title = l ? l.text : ''; });
  $('#btn-sample').addEventListener('click', () => {
    const lab = labs.find(l => l.id === $('#lab-select').value) || labs[0];
    const total = { added: 0, replaced: [] };
    for (const s of lab.files) { const r = addText(s.text, s.name); total.added += r.added; total.replaced.push(...r.replaced); }
    afterLoad(total, 'the example');
  });
  $('#btn-clear').addEventListener('click', () => { state.sources = []; state.analysis = null; rebuild(); $('#assist').innerHTML = ''; toast('All devices removed.'); });
  $('#remember').addEventListener('change', persist);

  // ------------------------------------------------------------- devices
  function sevCounts(dev) {
    const c = { critical: 0, warning: 0, info: 0 };
    if (state.analysis) for (const f of visibleFindings()) if (f.devices.includes(dev)) c[f.sev]++;
    return c;
  }
  const typeName = d => d.type === 'l3switch' ? 'Layer-3 switch' : d.type === 'switch' ? 'Switch' : 'Router';

  function renderDevices() {
    const box = $('#devices');
    if (!state.devices.length) {
      box.innerHTML = '<div class="empty-state"><p><b>No configs loaded yet.</b></p><p class="muted small">Drop the <code>show running-config</code> files of the routers and switches involved, or load an example lab to see what the analyzer finds.</p></div>';
      $('#summary').innerHTML = '';
      return;
    }
    box.innerHTML = state.devices.map((d, i) => {
      const c = sevCounts(d);
      return '<div class="device"><div class="dmain"><div class="name">' + esc(d.hostname) + ' <span class="badge neutral">' + typeName(d) + '</span>' + (d.platform !== 'ios' ? ' <span class="badge warning">' + esc(d.platform.toUpperCase()) + '?</span>' : '') + '</div>' +
        '<div class="meta">' + esc(d.source) + ' · ' + d.interfaceOrder.length + ' interfaces · ' + d.lines.length + ' lines' + (d.version ? ' · IOS ' + esc(d.version) : '') + '</div>' +
        '<div class="pills">' + (c.critical ? '<span class="badge critical">' + c.critical + ' critical</span>' : '') + (c.warning ? '<span class="badge warning">' + c.warning + ' warning</span>' : '') + (c.info ? '<span class="badge info">' + c.info + ' info</span>' : '') + (!c.critical && !c.warning ? '<span class="badge ok">no problems found</span>' : '') + '</div></div>' +
        '<div class="actions"><button class="small" data-findings="' + d.id + '">Findings</button><button class="small" data-script="' + d.id + '">Fix script</button><button class="small" data-view="' + i + '">Config</button><button class="small ghost" data-remove="' + i + '" aria-label="Remove ' + esc(d.hostname) + '">✕</button></div></div>';
    }).join('');
    box.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => openViewer(state.devices[b.dataset.view])));
    box.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => { const n = state.devices[b.dataset.remove].hostname; state.sources.splice(Number(b.dataset.remove), 1); rebuild(); toast(n + ' removed.'); }));
    box.querySelectorAll('[data-findings]').forEach(b => b.addEventListener('click', () => { $('#f-device').value = b.dataset.findings; renderFindings(); showTab('findings'); }));
    box.querySelectorAll('[data-script]').forEach(b => b.addEventListener('click', () => showFixScript(state.devices.find(d => d.id === b.dataset.script))));
    const all = visibleFindings();
    const crit = all.filter(f => f.sev === 'critical').length, warn = all.filter(f => f.sev === 'warning').length, info = all.filter(f => f.sev === 'info').length;
    const tot = Math.max(1, crit + warn + info);
    $('#summary').innerHTML = '<h3>Result</h3><div class="meter" aria-hidden="true"><span class="m-crit" style="width:' + (crit / tot * 100) + '%"></span><span class="m-warn" style="width:' + (warn / tot * 100) + '%"></span><span class="m-info" style="width:' + (info / tot * 100) + '%"></span></div>' +
      '<p>' + (crit ? '<b>' + crit + ' critical</b> problem(s) that probably break something, ' : 'No critical problems, ') + warn + ' warning(s) and ' + info + ' best-practice note(s).' + (state.ignored.size ? ' <span class="muted small">(' + state.ignored.size + ' ignored)</span>' : '') + '</p>' +
      '<div class="row"><button class="primary" id="go-findings">Show findings</button><button id="go-ts">Troubleshoot a problem</button></div>';
    $('#go-findings').addEventListener('click', () => showTab('findings'));
    $('#go-ts').addEventListener('click', () => showTab('troubleshoot'));
  }

  function renderChanges() {
    const box = $('#changes');
    const c = state.changes;
    if (!c || (!c.resolved.length && !c.added.length)) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="changes"><h3>Changes since the previous analysis</h3>' +
      (c.resolved.length ? '<p class="ok-text">✓ ' + c.resolved.length + ' problem(s) resolved</p><ul class="small">' + c.resolved.slice(0, 8).map(f => '<li>' + esc(f.device + ': ' + f.title) + '</li>').join('') + '</ul>' : '') +
      (c.added.length ? '<p class="bad-text">+ ' + c.added.length + ' new problem(s)</p><ul class="small">' + c.added.slice(0, 8).map(f => '<li>' + esc(f.device + ': ' + f.title) + '</li>').join('') + '</ul>' : '') + '</div>';
  }

  // ---------------------------------------------------------- fix script
  function fixScript(dev) {
    const fs = visibleFindings().filter(f => f.dev === dev && f.sev !== 'info' && f.fix.length);
    const out = ['! Fix script for ' + dev.hostname + ' – generated by Cisco Config Analyzer', '! Review every line before you paste it. Replace values in <angle brackets>.', '! Lines that start with "!" are comments.', 'configure terminal'];
    for (const f of fs) {
      out.push('!', '! [' + f.sev + '] ' + f.title);
      for (const l of f.fix) out.push(/<[^>]+>/.test(l) && !l.trim().startsWith('!') ? l + '   ! <-- edit' : l);
    }
    out.push('end', '! When it works: copy running-config startup-config');
    return { text: out.join('\n'), count: fs.length, verify: [...new Set(fs.flatMap(f => f.verify))] };
  }
  function showFixScript(dev) {
    const s = fixScript(dev);
    showTab('findings');
    showExport('Fix script for ' + dev.hostname + ' (' + s.count + ' problem' + (s.count === 1 ? '' : 's') + ')', s.text + '\n\n! ---- verify afterwards ----\n' + s.verify.map(v => '! ' + v).join('\n'), dev.hostname + '-fix.txt');
  }

  // -------------------------------------------------------- config viewer
  const SECRET = /\b(password|secret|key-string|community|key|authentication-key|md5|pre-shared-key)(\s+\d)?\s+(\S+)/gi;
  let viewerDev = null, viewerLine = null;
  function openViewer(dev, line) {
    viewerDev = dev; viewerLine = line || null;
    $('#viewer-title').textContent = dev.hostname + ' – ' + dev.source;
    $('#viewer-search').value = '';
    renderViewer();
    const dlg = $('#viewer');
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    if (line) {
      const el = $('#viewer-body').children[line - 1];
      if (el) setTimeout(() => el.scrollIntoView({ block: 'center' }), 30);
    }
  }
  function renderViewer() {
    const dev = viewerDev;
    if (!dev) return;
    const mask = $('#viewer-mask').checked;
    const q = $('#viewer-search').value.trim().toLowerCase();
    const flags = {};
    for (const f of visibleFindings()) if (f.dev === dev && f.line) (flags[f.line] = flags[f.line] || []).push(f);
    let hits = 0;
    $('#viewer-body').innerHTML = dev.lines.map((l, i) => {
      const n = i + 1;
      const text = mask ? l.replace(SECRET, (m, k, t) => k + (t || '') + ' ********') : l;
      const fl = flags[n];
      const match = q && text.toLowerCase().includes(q);
      if (match) hits++;
      const sev = fl ? (fl.some(f => f.sev === 'critical') ? 'critical' : fl.some(f => f.sev === 'warning') ? 'warning' : 'info') : '';
      return '<span class="ln' + (n === viewerLine ? ' hl' : '') + (match ? ' match' : '') + (fl ? ' flag ' + sev : '') + '" data-n="' + n + '"' + (fl ? ' title="' + esc(fl.map(f => f.title).join('\n')) + '"' : '') + '>' + esc(text) + '</span>';
    }).join('');
    $('#viewer-hits').textContent = q ? hits + ' match' + (hits === 1 ? '' : 'es') : '';
    if (q && hits) { const el = $('#viewer-body .match'); if (el) el.scrollIntoView({ block: 'center' }); }
  }
  $('#viewer-search').addEventListener('input', debounce(renderViewer, 150));
  // In a search field Esc only clears the text; close the dialog when it is already empty.
  $('#viewer-search').addEventListener('keydown', e => { if (e.key === 'Escape' && !e.target.value) { e.preventDefault(); $('#viewer').close(); } });
  $('#viewer-mask').addEventListener('change', renderViewer);
  $('#viewer-copy').addEventListener('click', e => copyText(viewerDev ? viewerDev.lines.join('\n') : '', e.currentTarget));
  $('#viewer-close').addEventListener('click', () => $('#viewer').close());
  $('#viewer').addEventListener('click', e => { if (e.target.id === 'viewer') $('#viewer').close(); });
  $('#btn-help').addEventListener('click', () => $('#help').showModal());
  $('#help-close').addEventListener('click', () => $('#help').close());
  $('#help').addEventListener('click', e => { if (e.target.id === 'help') $('#help').close(); });

  // ------------------------------------------------------------ findings
  function visibleFindings() {
    if (!state.analysis) return [];
    return state.analysis.findings.filter(f => !state.ignored.has(keyOf(f)));
  }

  function codeBox(lines) {
    if (!lines || !lines.length) return '';
    const text = Array.isArray(lines) ? lines.join('\n') : lines;
    return '<div class="codebox"><pre class="cmd">' + esc(text) + '</pre><button class="copy" data-copy="' + esc(text) + '">Copy</button></div>';
  }

  function findingHtml(f, extra) {
    const dev = f.dev;
    const ignored = state.ignored.has(keyOf(f));
    const lineLink = dev && f.line ? ' · <button class="lnk" data-dev="' + dev.id + '" data-line="' + f.line + '">line ' + f.line + ' in ' + esc(dev.hostname) + '</button>' : '';
    return '<details class="finding ' + f.sev + (ignored ? ' ignored' : '') + '"' + (extra && extra.open ? ' open' : '') + '><summary><span class="badge ' + f.sev + '">' + f.sev + '</span><span class="t">' + esc(f.title) +
      (extra && extra.why && extra.why.length ? '<div class="why">Relevant because it ' + esc(extra.why.join(', ')) + '.</div>' : '') +
      '</span><span class="d">' + esc(f.device) + ' · ' + esc(f.cat) + '</span></summary><div class="body"><p>' + esc(f.detail) + lineLink + '</p>' +
      '<div class="cols"><div><h3>Suggested fix</h3>' + (f.fix.length ? codeBox(f.fix) : '<p class="muted small">See the description.</p>') + '</div>' +
      '<div><h3>Verify the fix</h3><ul class="verify">' + f.verify.map(v => '<li><code>' + esc(v) + '</code></li>').join('') + '</ul></div></div>' +
      '<div class="row"><button class="small ghost" data-ignore="' + esc(keyOf(f)) + '">' + (ignored ? 'Stop ignoring' : 'Ignore this finding') + '</button><span class="muted small">Rule: ' + esc(f.id) + '</span></div></div></details>';
  }

  function bindFindingLinks(root) {
    root.querySelectorAll('[data-line]').forEach(b => b.addEventListener('click', e => {
      e.preventDefault();
      const d = state.devices.find(x => x.id === b.dataset.dev);
      if (d) openViewer(d, Number(b.dataset.line));
    }));
    root.querySelectorAll('[data-ignore]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.ignore;
      if (state.ignored.has(k)) state.ignored.delete(k); else state.ignored.add(k);
      store.set('ignored', [...state.ignored]);
      toast(state.ignored.has(k) ? 'Finding ignored. Tick "Show ignored" to see it again.' : 'Finding restored.');
      renderFindings(); renderDevices(); renderNetwork();
      $('#cnt-findings').textContent = visibleFindings().filter(f => f.sev !== 'info').length;
    }));
  }

  const CAT_ORDER = ['Interfaces', 'Switching / VLANs', 'Routing', 'ACL', 'NAT', 'DHCP', 'Redundancy (HSRP)', 'Security', 'Management'];
  function renderFindings() {
    const box = $('#findings');
    const a = state.analysis;
    const devSel = $('#f-device'), catSel = $('#f-cat');
    if (!a) {
      box.innerHTML = '<div class="card empty-state"><p><b>Nothing to show yet.</b></p><p class="muted small">Load at least one configuration on the Configs tab.</p></div>';
      $('#sevchips').innerHTML = '';
      devSel.innerHTML = '<option value="">All devices</option>';
      catSel.innerHTML = '<option value="">All categories</option>';
      return;
    }
    const keepDev = devSel.value, keepCat = catSel.value;
    devSel.innerHTML = '<option value="">All devices</option>' + state.devices.map(d => '<option value="' + d.id + '">' + esc(d.hostname) + '</option>').join('');
    devSel.value = state.devices.some(d => d.id === keepDev) ? keepDev : '';
    const showIgnored = $('#f-ignored').checked;
    const pool = showIgnored ? a.findings : visibleFindings();
    const cats = [...new Set(pool.map(f => f.cat))].sort((x, y) => CAT_ORDER.indexOf(x) - CAT_ORDER.indexOf(y));
    catSel.innerHTML = '<option value="">All categories</option>' + cats.map(c => '<option>' + esc(c) + '</option>').join('');
    catSel.value = cats.includes(keepCat) ? keepCat : '';
    const counts = { critical: 0, warning: 0, info: 0 };
    pool.forEach(f => counts[f.sev]++);
    $('#sevchips').innerHTML = ['critical', 'warning', 'info'].map(s => '<button class="sevchip ' + s + (state.sevOff.has(s) ? ' off' : '') + '" data-sev="' + s + '" aria-pressed="' + (!state.sevOff.has(s)) + '">' + counts[s] + ' ' + s + '</button>').join('');
    $('#sevchips').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { state.sevOff.has(b.dataset.sev) ? state.sevOff.delete(b.dataset.sev) : state.sevOff.add(b.dataset.sev); savePrefs(); renderFindings(); }));
    const q = $('#f-search').value.trim().toLowerCase();
    const list = pool.filter(f => !state.sevOff.has(f.sev) && (!devSel.value || f.devices.some(d => d.id === devSel.value)) && (!catSel.value || f.cat === catSel.value) &&
      (!q || (f.title + ' ' + f.detail + ' ' + f.device + ' ' + f.cat + ' ' + f.id + ' ' + f.tags.join(' ')).toLowerCase().includes(q)));
    if (!list.length) {
      box.innerHTML = '<div class="card empty-state"><p>' + (a.findings.length ? 'No findings match the filter.' : '<b>No problems found</b> in the loaded configurations.') + '</p></div>';
      return;
    }
    const group = $('#f-group').value;
    const keyFn = group === 'device' ? f => f.device : group === 'cat' ? f => f.cat : f => f.sev;
    const order = group === 'severity' ? ['critical', 'warning', 'info'] : group === 'cat' ? CAT_ORDER : [...new Set(list.map(keyFn))].sort();
    const groups = {};
    for (const f of list) (groups[keyFn(f)] = groups[keyFn(f)] || []).push(f);
    const names = [...order.filter(k => groups[k]), ...Object.keys(groups).filter(k => !order.includes(k))];
    const label = { critical: 'Critical – probably breaks something', warning: 'Warning – may cause problems', info: 'Info – best practice' };
    box.innerHTML = names.map(k => '<h3 class="group">' + esc(label[k] || k) + ' <span class="count">' + groups[k].length + '</span></h3>' + groups[k].map(f => findingHtml(f)).join('')).join('');
    bindFindingLinks(box);
  }
  ['#f-device', '#f-cat'].forEach(s => $(s).addEventListener('change', renderFindings));
  $('#f-group').addEventListener('change', () => { savePrefs(); renderFindings(); });
  $('#f-ignored').addEventListener('change', () => { savePrefs(); renderFindings(); });
  $('#f-search').addEventListener('input', debounce(renderFindings, 120));
  $('#btn-expand').addEventListener('click', () => $$('#findings details').forEach(d => { d.open = true; }));
  $('#btn-collapse').addEventListener('click', () => $$('#findings details').forEach(d => { d.open = false; }));

  // ----------------------------------------------------------- clipboard
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-copy]');
    if (b) copyText(b.dataset.copy, b);
  });
  function copyText(text, btn) {
    const old = btn ? btn.textContent : '';
    const done = () => { if (btn) { btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = old; }, 1200); } };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
      else fallbackCopy(text, done);
    } catch (e) { fallbackCopy(text, done); }
  }
  function fallbackCopy(text, done) {
    const t = document.createElement('textarea');
    t.value = text; document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed – select the text and copy it manually.'); }
    t.remove();
  }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  // -------------------------------------------------------------- export
  function showExport(title, text, filename) {
    const box = $('#export-box');
    box.hidden = false;
    box.innerHTML = '<div class="row spread"><h2>' + esc(title) + '</h2><div class="row" style="margin-top:0"><button class="primary small" id="export-copy">Copy</button>' +
      (CCA.allowDownload !== false ? '<button class="small" id="export-dl">Download</button>' : '') + '<button class="ghost small" id="export-close">Close</button></div></div><textarea id="export-text" rows="16" readonly spellcheck="false">' + esc(text) + '</textarea>';
    $('#export-copy').addEventListener('click', e => copyText(text, e.currentTarget));
    if ($('#export-dl')) $('#export-dl').addEventListener('click', () => download(filename, text));
    $('#export-close').addEventListener('click', () => { box.hidden = true; });
    box.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }
  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function reportMarkdown() {
    const list = visibleFindings();
    const out = ['# Cisco configuration analysis', '', 'Generated ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' · Devices: ' + state.devices.map(d => d.hostname + ' (' + typeName(d) + ')').join(', '), '',
      '| Severity | Count |', '|---|---|', ...['critical', 'warning', 'info'].map(s => '| ' + s + ' | ' + list.filter(f => f.sev === s).length + ' |'), ''];
    for (const d of state.devices) {
      const fs = list.filter(f => f.dev === d);
      if (!fs.length) continue;
      out.push('## ' + d.hostname, '');
      for (const f of fs) {
        out.push('### [' + f.sev.toUpperCase() + '] ' + f.title, '', '*Category:* ' + f.cat + (f.line ? ' · *Config line:* ' + f.line : '') + ' · *Rule:* `' + f.id + '`', '', f.detail, '');
        if (f.fix.length) out.push('**Suggested fix**', '', '```', ...f.fix, '```', '');
        if (f.verify.length) out.push('**Verify**', '', ...f.verify.map(v => '- `' + v + '`'), '');
      }
    }
    if (state.ignored.size) out.push('', '_' + state.ignored.size + ' finding(s) were marked as ignored and are not included._');
    return out.join('\n');
  }
  $('#btn-export').addEventListener('click', () => { if (state.analysis) showExport('Report (Markdown)', reportMarkdown(), 'cisco-analysis.md'); else toast('Load configs first.'); });
  $('#btn-json').addEventListener('click', () => {
    if (!state.analysis) { toast('Load configs first.'); return; }
    const data = { generated: new Date().toISOString(), devices: state.devices.map(d => ({ hostname: d.hostname, type: d.type, source: d.source })),
      findings: visibleFindings().map(f => ({ rule: f.id, severity: f.sev, category: f.cat, devices: f.devices.map(d => d.hostname), title: f.title, detail: f.detail, line: f.line || null, fix: f.fix, verify: f.verify })) };
    showExport('Findings (JSON)', JSON.stringify(data, null, 2), 'cisco-analysis.json');
  });

  // -------------------------------------------------------- troubleshoot
  const EXAMPLES = [
    "PCs in VLAN 20 don't get an IP address",
    'The printers in VLAN 30 cannot reach the Internet',
    'I cannot ping 172.16.2.10 from VLAN 10',
    "I can't SSH to SW1 from 192.168.10.20",
    'OSPF neighbor between R1 and R2 does not come up',
    'Datorerna i VLAN 20 får ingen IP-adress',
    'The serial link between HQ-RTR and BR-RTR is down'
  ];
  $('#examples').innerHTML = '<span class="muted small">Examples:</span>' + EXAMPLES.map(x => '<button type="button">' + esc(x) + '</button>').join('');
  $('#examples').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { $('#problem').value = b.textContent; runAssist(); }));
  $('#t-svc').addEventListener('change', () => { $('#t-custom-wrap').hidden = $('#t-svc').value !== 'custom'; });
  $('#btn-assist').addEventListener('click', runAssist);
  $('#btn-problem-clear').addEventListener('click', () => { $('#problem').value = ''; store.del('draft'); $('#assist').innerHTML = ''; $('#problem').focus(); });
  $('#problem').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) runAssist(); });
  $('#problem').addEventListener('input', debounce(() => store.set('draft', $('#problem').value), 300));

  function renderHistory() {
    const h = store.get('history', []);
    $('#history').innerHTML = h.length ? '<span class="muted small">Recent:</span>' + h.map((x, i) => '<button type="button" class="hist" data-h="' + i + '">' + esc(x.length > 60 ? x.slice(0, 57) + '…' : x) + '</button>').join('') : '';
    $('#history').querySelectorAll('[data-h]').forEach(b => b.addEventListener('click', () => { $('#problem').value = h[Number(b.dataset.h)]; runAssist(); }));
  }
  function remember(text) {
    const h = store.get('history', []).filter(x => x !== text);
    h.unshift(text);
    store.set('history', h.slice(0, 6));
    renderHistory();
  }

  function parseService(v, custom) {
    if (!v) return null;
    if (v === 'icmp') return { proto: 'icmp', label: 'ping (ICMP echo)' };
    const s = v === 'custom' ? (custom || '') : v;
    const m = s.trim().toLowerCase().match(/^(tcp|udp)\s*[: ]\s*(\d+)$/) || s.trim().match(/^()(\d+)$/);
    if (!m) return null;
    const proto = m[1] || 'tcp';
    return { proto, dstPort: Number(m[2]), label: proto.toUpperCase() + ' ' + m[2] };
  }

  function runAssist() {
    const box = $('#assist');
    const text = $('#problem').value.trim();
    if (!text) { box.innerHTML = '<div class="card"><p class="empty">Describe the problem first.</p></div>'; $('#problem').focus(); return; }
    const analysis = state.analysis ? { model: state.analysis.model, findings: visibleFindings() } : { model: CCA.topology.build([]), findings: [] };
    const opts = {};
    const src = $('#t-src').value.trim(), dst = $('#t-dst').value.trim();
    if (src) { if (!N.isIp(src)) { box.innerHTML = '<div class="card"><p class="result unk">Source must be an IPv4 address, e.g. 192.168.10.20.</p></div>'; return; } opts.src = src; }
    if (dst) { if (!N.isIp(dst)) { box.innerHTML = '<div class="card"><p class="result unk">Destination must be an IPv4 address, e.g. 172.16.2.10.</p></div>'; return; } opts.dst = dst; }
    const svc = parseService($('#t-svc').value, $('#t-custom').value);
    if (svc) opts.service = svc;
    if ($('#t-svc').value === 'custom' && !svc) { box.innerHTML = '<div class="card"><p class="result unk">Write the port as tcp:8080 or udp:161.</p></div>'; return; }
    const r = CCA.assistant.assist(analysis, text, opts);
    state.lastAssist = r;
    remember(text);
    box.innerHTML = renderAssist(r, !!state.analysis);
    bindFindingLinks(box);
    bindAssist(box, r);
    box.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }

  function onList(on) { return on.length ? on.map(esc).join(', ') : 'the relevant devices'; }
  const confidence = s => s >= 6 ? 'strong match' : s >= 3 ? 'match' : 'possible';

  function planText(r) {
    const out = ['Problem: ' + r.ex.text, '', 'Topic: ' + r.topics.map(t => t.pb.title).join(', '), ''];
    if (r.path) out.push('Path ' + r.path.src + ' -> ' + r.path.dst + ': ' + r.path.fwd.status + ' – ' + r.path.fwd.reason, r.path.ret ? 'Return: ' + r.path.ret.status + ' – ' + r.path.ret.reason : '', '');
    if (r.relevant.length) { out.push('Likely causes in the configuration:'); r.relevant.forEach((x, i) => out.push('  ' + (i + 1) + '. [' + x.f.sev + '] ' + x.f.device + ': ' + x.f.title)); out.push(''); }
    out.push('Test steps:');
    r.diagnose.forEach((s, i) => out.push('  ' + (i + 1) + '. (' + s.on.join(', ') + ') ' + s.cmd, '     ' + s.why + ' Expected: ' + s.expect));
    out.push('', 'Verify the fix:');
    r.verify.forEach(s => out.push('  [ ] (' + s.on.join(', ') + ') ' + s.cmd + ' – ' + s.expect));
    return out.join('\n');
  }

  function stepsHtml(r, byDevice) {
    if (!byDevice) return '<ol class="steps">' + r.diagnose.map(s =>
      '<li><div class="on">Run on: ' + onList(s.on) + '</div>' + codeBox(s.cmd) +
      '<div>' + esc(s.why) + '</div><div class="exp">Expected: ' + esc(s.expect) + '</div></li>').join('') + '</ol>';
    const per = {};
    for (const s of r.diagnose) for (const d of (s.on.length ? s.on : ['any device'])) (per[d] = per[d] || []).push(s);
    return Object.keys(per).map(d => '<div class="perdev"><div class="row spread"><h3>' + esc(d) + '</h3><button class="small" data-copy="' + esc(per[d].map(s => s.cmd).join('\n')) + '">Copy all commands</button></div><ul class="verify">' +
      per[d].map(s => '<li><code>' + esc(s.cmd) + '</code> <span class="muted small">– ' + esc(s.expect) + '</span></li>').join('') + '</ul></div>').join('');
  }

  function renderAssist(r, hasConfigs) {
    const h = [];
    h.push('<div class="card"><div class="row spread"><h2>What I understood</h2><button class="small" id="copy-plan">Copy the whole plan</button></div><div>' + r.topics.map(t => '<span class="badge neutral topic">' + esc(t.pb.title) + ' · ' + confidence(t.score) + '</span>').join('') + '</div>' +
      '<p>' + r.topics.map(t => esc(t.pb.summary)).join('</p><p>') + '</p>');
    const chips = [];
    r.ex.vlans.forEach(v => chips.push(['VLAN ' + v, 'vlan']));
    r.ex.ips.forEach(x => chips.push([x.ip + (x.prefix !== null ? '/' + x.prefix : ''), 'ip']));
    r.ex.ifaces.forEach(n => chips.push([N.shortIfName(n), 'if']));
    r.ex.devs.forEach(d => chips.push([d.hostname, 'dev']));
    if (r.ex.service) chips.push([r.ex.service.label, 'svc']);
    if (r.ex.internet) chips.push(['Internet', 'svc']);
    if (chips.length) h.push('<div class="chips"><span class="muted small">Recognised:</span>' + chips.map(([t, k]) => '<span class="chip ' + k + '">' + esc(t) + '</span>').join('') + '</div>');
    if (!hasConfigs) h.push('<p class="result unk">No configurations are loaded, so the advice below is generic. Load the configs of the devices involved for a precise analysis.</p>');
    if (r.insights.length) h.push('<h3>What the configs say about it</h3>' + r.insights.map(i => i.lines.map(l => '<div class="insight"><b>' + esc(i.title) + '</b> ' + esc(l) + '</div>').join('')).join(''));
    h.push('</div>');

    if (r.path) h.push('<div class="card"><h2>Path analysis: ' + esc(r.path.src) + ' → ' + esc(r.path.dst) + ' <span class="badge neutral">' + esc(r.path.service.label || r.path.service.proto) + '</span></h2>' +
      (r.path.notes.length ? '<p class="muted small">' + r.path.notes.map(esc).join(' ') + '</p>' : '') + renderPath(r.path) + '</div>');

    if (hasConfigs) {
      h.push('<div class="card"><h2>Most likely causes in your configuration</h2>');
      if (r.relevant.length) h.push(r.relevant.map((x, i) => findingHtml(x.f, { why: x.why, open: i < 2 && x.f.sev !== 'info' })).join(''));
      else h.push('<p class="empty">No configuration problem matches this description. The fault may be outside the loaded configs (hosts, cabling, devices not loaded) – follow the test steps below.</p>');
      h.push('</div>');
    }

    h.push('<div class="card"><h2>Possible causes to rule out</h2><ul class="causes">' + r.causes.map(c => '<li>' + esc(c.text) +
      (c.findings.length ? ' <span class="badge critical">found in config</span>' : '') + '</li>').join('') + '</ul>' +
      '<h3>Questions that narrow it down</h3><ul>' + r.questions.map(q => '<li>' + esc(q) + '</li>').join('') + '</ul></div>');

    h.push('<div class="card"><div class="row spread"><h2>How to find the fault – step by step</h2><label class="check inline"><input type="checkbox" id="steps-bydev"> Group by device</label></div><div id="steps">' + stepsHtml(r, false) + '</div></div>');

    h.push('<div class="card"><h2>How to verify that the problem is solved</h2><ul class="checklist">' + r.verify.map((s, i) =>
      '<li><input type="checkbox" id="vchk' + i + '"><label for="vchk' + i + '" class="vlabel"><code>' + esc(s.cmd) + '</code> <span class="muted small">on ' + onList(s.on) + '</span><br><span class="muted small">' + esc(s.expect) + '</span></label></li>').join('') +
      '</ul><p class="muted small" id="vprogress"></p><p class="muted small">After the fix, load the changed configs again: the analyzer shows which problems were resolved.</p></div>');
    return h.join('');
  }

  function bindAssist(box, r) {
    $('#copy-plan').addEventListener('click', e => copyText(planText(r), e.currentTarget));
    $('#steps-bydev').addEventListener('change', e => { $('#steps').innerHTML = stepsHtml(r, e.target.checked); });
    const upd = () => { const all = box.querySelectorAll('.checklist input'); const done = [...all].filter(x => x.checked).length; $('#vprogress').textContent = done ? done + ' of ' + all.length + ' checks done' + (done === all.length ? ' – the problem should be solved.' : '.') : ''; };
    box.querySelectorAll('.checklist input').forEach(x => x.addEventListener('change', upd));
  }

  function renderHops(t) {
    return '<ol class="hops">' + t.hops.map(hp => {
      const bits = ['<div>' + esc(hp.note || hp.dev.hostname) + '</div>'];
      const aclTxt = (res) => esc(res.action) + (res.entry ? ' (' + esc(res.entry.raw.trim()) + ')' : res.undefinedAcl ? ' (ACL not defined → permits all)' : ' (implicit deny)') + (res.uncertain ? ' <span class="badge warning">uses object-groups or unknown syntax – verify</span>' : '');
      if (hp.aclIn) bits.push('<div class="sub">Inbound ACL ' + esc(hp.aclIn.name) + ': ' + aclTxt(hp.aclIn.res) + '</div>');
      if (hp.route) bits.push('<div class="sub">' + esc(hp.dev.hostname) + ' route: ' + esc(hp.route.code + ' ' + hp.route.net + '/' + hp.route.prefix + (hp.route.nextHop ? ' via ' + hp.route.nextHop : hp.route.dhcp ? ' (default from DHCP)' : ' directly connected') + (hp.route.iface ? ', ' + N.shortIfName(hp.route.iface) : '')) + '</div>');
      if (hp.aclOut) bits.push('<div class="sub">Outbound ACL ' + esc(hp.aclOut.name) + ': ' + aclTxt(hp.aclOut.res) + '</div>');
      if (hp.nat) bits.push('<div class="sub">' + esc(hp.nat) + '</div>');
      if (hp.warn) bits.push('<div class="warn">⚠ ' + esc(hp.warn) + '</div>');
      for (const w of hp.l2 || []) bits.push('<div class="warn">⚠ Layer 2: ' + esc(w) + '</div>');
      return '<li>' + bits.join('') + '</li>';
    }).join('') + '</ol>';
  }

  function resultBox(t) {
    const natMiss = t.hops.some(h => h.nat && /no NAT rule/.test(h.nat));
    if (natMiss && t.status === 'exit') return '<div class="result bad">Leaves the loaded network untranslated: ' + esc(t.reason) + ' Replies from the Internet will not come back to a private source address.</div>';
    const cls = t.status === 'delivered' && !t.serviceIssue && !t.hops.some(h => (h.l2 || []).length) ? 'ok' : t.status === 'delivered' ? 'unk' : (t.status === 'exit' || t.status === 'unknown') && !t.missingSpecific ? 'unk' : 'bad';
    const label = { delivered: 'Reaches the destination', dropped: 'Dropped', exit: 'Leaves the loaded network', loop: 'Routing loop', unknown: 'Cannot simulate' }[t.status] || t.status;
    let s = '<div class="result ' + cls + '">' + esc(label) + ': ' + esc(t.reason) + '</div>';
    if (t.serviceIssue) s += '<div class="result bad">But the connection is refused: ' + esc(t.serviceIssue) + '</div>';
    if (t.status === 'delivered' && t.hops.some(h => (h.l2 || []).length)) s += '<div class="result bad">Layer-3 path is OK, but there are layer-2 (VLAN/trunk) problems on the way – see ⚠ above.</div>';
    return s;
  }

  function renderPath(p) {
    let s = '<div class="path"><h4>Forward: ' + esc(p.src) + ' → ' + esc(p.dst) + ' <span class="muted small">(' + p.fwd.hops.length + ' hop' + (p.fwd.hops.length === 1 ? '' : 's') + ')</span></h4>' + renderHops(p.fwd) + resultBox(p.fwd);
    if (p.ret) s += '<h4>Return: ' + esc(p.dst) + ' → ' + esc(p.fwd.pkt && p.fwd.pkt.src ? p.fwd.pkt.src : p.src) + '</h4>' + renderHops(p.ret) + resultBox(p.ret);
    else if (p.fwd.status === 'exit') s += '<p class="muted small">The reply path cannot be simulated because the destination is outside the loaded configs.</p>';
    return s + '</div>';
  }

  // ------------------------------------------------------------- network
  $('#btn-path').addEventListener('click', runPath);
  [$('#p-src'), $('#p-dst')].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') runPath(); }));
  $('#btn-swap').addEventListener('click', () => { const a = $('#p-src').value; $('#p-src').value = $('#p-dst').value; $('#p-dst').value = a; });
  function runPath() {
    const box = $('#path');
    const src = $('#p-src').value.trim(), dst = $('#p-dst').value.trim();
    if (!state.analysis) { box.innerHTML = '<p class="empty">Load configs first.</p>'; return; }
    if (!N.isIp(src) || !N.isIp(dst)) { box.innerHTML = '<p class="result unk">Enter a valid source and destination IPv4 address.</p>'; return; }
    const svc = parseService($('#p-svc').value) || { proto: 'icmp' };
    const conv = CCA.topology.conversation(state.analysis.model, src, dst, svc);
    box.innerHTML = renderPath({ src, dst, ...conv });
  }

  function renderNetwork() {
    const a = state.analysis;
    if (!a) {
      ['#net-devices', '#net-links', '#rib', '#diagram'].forEach(s => { $(s).innerHTML = '<p class="empty">Load configs first.</p>'; });
      $('#rib-dev').innerHTML = '';
      return;
    }
    const m = a.model;
    const groups = new Set(state.devices.map(d => m.componentOf(d))).size;
    $('#diagram').innerHTML = (CCA.diagram ? CCA.diagram.render(m, visibleFindings()) : '') +
      (groups > 1 ? '<p class="muted small">The loaded devices form ' + groups + ' separate networks (no shared subnet or described link between them).</p>' : '');
    $('#diagram').querySelectorAll('[data-dev]').forEach(g => {
      const go = () => { $('#rib-dev').value = g.dataset.dev; renderRib(); $('#rib-card').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }); };
      g.addEventListener('click', go);
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
    $('#net-devices').innerHTML = '<div class="tablewrap"><table><thead><tr><th>Device</th><th>Type</th><th>Addresses</th><th>Routing</th><th>VLANs</th></tr></thead><tbody>' +
      state.devices.map(d => {
        const addrs = CCA.topology.l3Addresses(d, true).map(x => x.ifc.short + ' ' + x.ip + '/' + x.prefix + (x.ifc.shutdown ? ' (shut)' : '') + (x.vrf ? ' [vrf ' + x.vrf + ']' : ''));
        const protos = [d.ospf.length && 'OSPF ' + d.ospf.map(o => o.pid).join(','), d.eigrp.length && 'EIGRP ' + d.eigrp.map(e => e.asn).join(','), d.rip && 'RIP v' + d.rip.version, d.bgp && 'BGP AS ' + d.bgp.asn, d.ospfv3.length && 'OSPFv3', d.staticRoutes.length && d.staticRoutes.length + ' static'].filter(Boolean);
        const vl = Object.keys(d.vlans).join(', ');
        return '<tr><td><b>' + esc(d.hostname) + '</b></td><td>' + typeName(d) + (d.type !== 'router' ? (d.ipRouting ? ' (ip routing)' : '') : '') + '</td><td class="mono">' + addrs.map(esc).join('<br>') + '</td><td>' + esc(protos.join(', ') || '–') + '</td><td>' + esc(vl || (d.type === 'router' ? '–' : 'not in config')) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    const segs = m.segments.filter(s => new Set(s.members.map(x => x.dev)).size > 1);
    let links = '<h3>Layer 3 (shared subnets)</h3>';
    links += segs.length ? '<div class="tablewrap"><table><thead><tr><th>Subnet</th><th>Members</th><th>Routing adjacency</th></tr></thead><tbody>' + segs.map(s => {
      const adj = [];
      for (const [name, pm] of [['OSPF', m.protocols.ospf], ['EIGRP', m.protocols.eigrp], ['RIP', m.protocols.rip]]) {
        for (const x of pm.adj) if (x.a.net + '/' + x.a.prefix === s.key) adj.push('<span class="badge ok">' + name + ' ' + esc(x.a.dev.hostname + '–' + x.b.dev.hostname) + '</span>');
        for (const x of pm.issues) if (x.a.net + '/' + x.a.prefix === s.key) adj.push('<span class="badge critical">' + name + ' ' + esc(x.a.dev.hostname + '–' + x.b.dev.hostname) + ': ' + esc(x.problems.map(p => p.kind).join(', ')) + '</span>');
      }
      return '<tr><td class="mono">' + esc(s.key) + (s.vrf ? ' <span class="muted">vrf ' + esc(s.vrf) + '</span>' : '') + '</td><td>' + s.members.map(x => esc(x.dev.hostname + ' ' + x.ifc.short + ' ' + x.ip)).join('<br>') + '</td><td>' + (adj.join(' ') || '<span class="muted">none</span>') + '</td></tr>';
    }).join('') + '</tbody></table></div>' : '<p class="empty">No subnets shared between loaded devices.</p>';
    if (m.maskMismatches.length) links += '<p class="result bad">Mask mismatches: ' + m.maskMismatches.map(([x, y]) => esc(x.dev.hostname + ' ' + x.ip + '/' + x.prefix + ' vs ' + y.dev.hostname + ' ' + y.ip + '/' + y.prefix)).join('; ') + '</p>';
    links += '<h3>Layer 2 (from descriptions)</h3>';
    links += m.l2Links.length ? '<div class="tablewrap"><table><thead><tr><th>Side A</th><th>Side B</th></tr></thead><tbody>' + m.l2Links.map(l => {
      const side = x => esc(x.dev.hostname + ' ' + x.ifc.short) + ' <span class="muted small">' + esc(x.ifc.isL2 ? x.ifc.mode + (x.ifc.mode === 'access' ? ' VLAN ' + (x.ifc.switchport.accessVlan || 1) : x.ifc.mode === 'trunk' ? ' native ' + (x.ifc.switchport.nativeVlan || 1) + ', allowed ' + (x.ifc.switchport.trunkAllowedRaw || 'all') : '') : 'routed') + (x.ifc.shutdown ? ', SHUT' : '') + '</span>';
      return '<tr><td>' + side(l.a) + '</td><td>' + side(l.b) + '</td></tr>';
    }).join('') + '</tbody></table></div>' : '<p class="empty">None found. Add descriptions like "Uplink to SW2 Gi0/1" to let the analyzer check trunks between devices.</p>';
    $('#net-links').innerHTML = links;
    const sel = $('#rib-dev');
    const keep = sel.value;
    sel.innerHTML = state.devices.map(d => '<option value="' + d.id + '">' + esc(d.hostname) + '</option>').join('');
    if (state.devices.some(d => d.id === keep)) sel.value = keep;
    renderRib();
  }
  $('#rib-dev').addEventListener('change', renderRib);
  function renderRib() {
    const a = state.analysis;
    if (!a) return;
    const id = $('#rib-dev').value;
    const d = state.devices.find(x => x.id === id);
    if (!d) return;
    const rib = a.model.ribs[id];
    let s = '';
    if (!d.ipRouting) s += '<p class="muted small">' + esc(d.hostname) + ' is not routing (no "ip routing"). Default gateway: ' + esc(d.defaultGateway ? d.defaultGateway.ip : 'none') + '.</p>';
    s += rib.length ? '<div class="tablewrap"><table><thead><tr><th>Code</th><th>Network</th><th>Next hop</th><th>Interface</th><th>Learned from</th></tr></thead><tbody>' + rib.map(r =>
      '<tr><td>' + esc(r.code) + '</td><td class="mono">' + esc(r.net + '/' + r.prefix) + '</td><td class="mono">' + esc(r.nextHop || (r.dhcp ? 'DHCP' : 'connected')) + '</td><td>' + esc(r.iface ? N.shortIfName(r.iface) : '') + '</td><td>' + esc(r.origin || (r.code.startsWith('S') ? 'static' : '')) + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="empty">No routes.</p>';
    if (!rib.some(r => r.prefix === 0) && d.ipRouting) s += '<p class="muted small">No default route (gateway of last resort not set).</p>';
    $('#rib').innerHTML = s;
  }

  // ---------------------------------------------------------- shortcuts
  document.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[1-4]$/.test(e.key)) { showTab(TABS[Number(e.key) - 1]); e.preventDefault(); }
    else if (e.key === '/') { showTab('findings'); $('#f-search').focus(); e.preventDefault(); }
    else if (e.key === '?') { $('#help').showModal(); e.preventDefault(); }
    else if (e.key === 't' || e.key === 'T') cycleTheme();
  });

  // --------------------------------------------------------------- start
  applyTheme();
  $('#f-group').value = prefs.group;
  $('#f-ignored').checked = !!prefs.showIgnored;
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (Array.isArray(saved) && saved.length) { state.sources = saved; $('#remember').checked = true; }
  } catch (e) { /* ignore */ }
  $('#problem').value = store.get('draft', '');
  renderHistory();
  rebuild();
  let start = location.hash.slice(1);
  if (!TABS.includes(start)) { try { start = sessionStorage.getItem(STORE + '.tab'); } catch (e) { start = null; } }
  if (start && TABS.includes(start)) showTab(start);
})();
