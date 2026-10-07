// User interface: loading configs, listing findings, the troubleshooting assistant and the network view.
(function () {
  const CCA = window.CCA;
  const N = CCA.net;
  const $ = s => document.querySelector(s);
  const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STORE = 'cisco-config-analyzer.v1';

  const state = { sources: [], devices: [], analysis: null, sevOff: new Set(), lastAssist: null };

  // ---------------------------------------------------------------- tabs
  function showTab(name) {
    document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
    try { sessionStorage.setItem(STORE + '.tab', name); } catch (e) { /* ignore */ }
  }
  document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

  // ------------------------------------------------------------- loading
  function addText(text, name) {
    const chunks = CCA.parser.splitConfigs(text);
    if (!chunks.length) return 0;
    chunks.forEach((c, i) => state.sources.push({ name: chunks.length > 1 ? name + ' #' + (i + 1) : name, text: c }));
    return chunks.length;
  }

  function rebuild() {
    state.devices = state.sources.map((s, i) => {
      const d = CCA.parser.parseDevice(s.text, s.name);
      d.id = 'd' + (i + 1);
      return d;
    });
    state.analysis = state.devices.length ? CCA.checks.analyze(state.devices) : null;
    persist();
    renderDevices();
    renderFindings();
    renderNetwork();
    $('#cnt-devices').textContent = state.devices.length;
    $('#cnt-findings').textContent = state.analysis ? state.analysis.findings.filter(f => f.sev !== 'info').length : 0;
  }

  function persist() {
    try {
      if ($('#remember').checked) localStorage.setItem(STORE, JSON.stringify(state.sources));
      else localStorage.removeItem(STORE);
    } catch (e) { /* storage unavailable */ }
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
    list.forEach(f => {
      const r = new FileReader();
      r.onload = () => { addText(String(r.result), f.name); if (--pending === 0) rebuild(); };
      r.onerror = () => { if (--pending === 0) rebuild(); };
      r.readAsText(f);
    });
    $('#file').value = '';
  }

  $('#btn-paste').addEventListener('click', () => {
    const t = $('#paste').value;
    if (!t.trim()) return;
    const n = addText(t, 'pasted ' + (state.sources.length + 1));
    if (n) { $('#paste').value = ''; rebuild(); }
  });
  $('#btn-sample').addEventListener('click', () => {
    for (const s of CCA.samples) if (!state.sources.some(x => x.name === s.name)) addText(s.text, s.name);
    rebuild();
  });
  $('#btn-clear').addEventListener('click', () => { state.sources = []; rebuild(); $('#assist').innerHTML = ''; });
  $('#remember').addEventListener('change', persist);

  // ------------------------------------------------------------- devices
  function sevCounts(dev) {
    const c = { critical: 0, warning: 0, info: 0 };
    if (state.analysis) for (const f of state.analysis.findings) if (f.devices.includes(dev)) c[f.sev]++;
    return c;
  }
  const typeName = d => d.type === 'l3switch' ? 'Layer-3 switch' : d.type === 'switch' ? 'Switch' : 'Router';

  function renderDevices() {
    const box = $('#devices');
    if (!state.devices.length) { box.innerHTML = '<p class="empty">No configs loaded yet.</p>'; $('#summary').innerHTML = ''; return; }
    box.innerHTML = state.devices.map((d, i) => {
      const c = sevCounts(d);
      return '<div class="device"><div><div class="name">' + esc(d.hostname) + ' <span class="badge neutral">' + typeName(d) + '</span></div>' +
        '<div class="meta">' + esc(d.source) + ' · ' + d.interfaceOrder.length + ' interfaces' + (d.version ? ' · IOS ' + esc(d.version) : '') + '</div>' +
        '<div class="pills">' + (c.critical ? '<span class="badge critical">' + c.critical + ' critical</span>' : '') + (c.warning ? '<span class="badge warning">' + c.warning + ' warning</span>' : '') + (c.info ? '<span class="badge info">' + c.info + ' info</span>' : '') + (!c.critical && !c.warning ? '<span class="badge ok">no problems found</span>' : '') + '</div></div>' +
        '<div class="actions"><button class="small" data-view="' + i + '">View config</button><button class="small ghost" data-remove="' + i + '" aria-label="Remove">✕</button></div></div>';
    }).join('');
    box.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => openViewer(state.devices[b.dataset.view])));
    box.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => { state.sources.splice(Number(b.dataset.remove), 1); rebuild(); }));
    const all = state.analysis.findings;
    const crit = all.filter(f => f.sev === 'critical').length, warn = all.filter(f => f.sev === 'warning').length;
    $('#summary').innerHTML = '<h3>Result</h3><p>' + (crit ? '<b>' + crit + ' critical</b> problem(s) that probably break something, ' : 'No critical problems, ') + warn + ' warning(s) and ' + all.filter(f => f.sev === 'info').length + ' best-practice note(s).</p>' +
      '<div class="row"><button class="primary" id="go-findings">Show findings</button><button id="go-ts">Troubleshoot a problem</button></div>';
    $('#go-findings').addEventListener('click', () => showTab('findings'));
    $('#go-ts').addEventListener('click', () => showTab('troubleshoot'));
  }

  // -------------------------------------------------------- config viewer
  function openViewer(dev, line) {
    $('#viewer-title').textContent = dev.hostname + ' – ' + dev.source;
    $('#viewer-body').innerHTML = dev.lines.map((l, i) => '<span class="ln' + (i + 1 === line ? ' hl' : '') + '" data-n="' + (i + 1) + '">' + esc(l) + '</span>').join('');
    const dlg = $('#viewer');
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    if (line) {
      const el = $('#viewer-body').children[line - 1];
      if (el) setTimeout(() => el.scrollIntoView({ block: 'center' }), 30);
    }
  }
  $('#viewer-close').addEventListener('click', () => $('#viewer').close());
  $('#viewer').addEventListener('click', e => { if (e.target.id === 'viewer') $('#viewer').close(); });

  // ------------------------------------------------------------ findings
  function codeBox(lines) {
    if (!lines || !lines.length) return '';
    const text = lines.join('\n');
    return '<div class="codebox"><pre class="cmd">' + esc(text) + '</pre><button class="copy" data-copy="' + esc(text) + '">Copy</button></div>';
  }

  function findingHtml(f, extra) {
    const dev = f.dev;
    const lineLink = dev && f.line ? ' · <button class="lnk" data-dev="' + dev.id + '" data-line="' + f.line + '">line ' + f.line + ' in ' + esc(dev.hostname) + '</button>' : '';
    return '<details class="finding ' + f.sev + '"' + (extra && extra.open ? ' open' : '') + '><summary><span class="badge ' + f.sev + '">' + f.sev + '</span><span class="t">' + esc(f.title) +
      (extra && extra.why && extra.why.length ? '<div class="why">Relevant because it ' + esc(extra.why.join(', ')) + '.</div>' : '') +
      '</span><span class="d">' + esc(f.device) + ' · ' + esc(f.cat) + '</span></summary><div class="body"><p>' + esc(f.detail) + lineLink + '</p>' +
      '<div class="cols"><div><h3>Suggested fix</h3>' + (f.fix.length ? codeBox(f.fix) : '<p class="muted small">See the description.</p>') + '</div>' +
      '<div><h3>Verify the fix</h3><ul class="verify">' + f.verify.map(v => '<li><code>' + esc(v) + '</code></li>').join('') + '</ul></div></div></div></details>';
  }

  function bindFindingLinks(root) {
    root.querySelectorAll('[data-line]').forEach(b => b.addEventListener('click', e => {
      e.preventDefault();
      const d = state.devices.find(x => x.id === b.dataset.dev);
      if (d) openViewer(d, Number(b.dataset.line));
    }));
  }

  function renderFindings() {
    const box = $('#findings');
    const a = state.analysis;
    const devSel = $('#f-device'), catSel = $('#f-cat');
    if (!a) {
      box.innerHTML = '<div class="card"><p class="empty">Load at least one configuration first.</p></div>';
      $('#sevchips').innerHTML = '';
      devSel.innerHTML = '<option value="">All devices</option>';
      catSel.innerHTML = '<option value="">All categories</option>';
      return;
    }
    const keepDev = devSel.value, keepCat = catSel.value;
    devSel.innerHTML = '<option value="">All devices</option>' + state.devices.map(d => '<option value="' + d.id + '">' + esc(d.hostname) + '</option>').join('');
    devSel.value = state.devices.some(d => d.id === keepDev) ? keepDev : '';
    const cats = [...new Set(a.findings.map(f => f.cat))].sort();
    catSel.innerHTML = '<option value="">All categories</option>' + cats.map(c => '<option>' + esc(c) + '</option>').join('');
    catSel.value = cats.includes(keepCat) ? keepCat : '';
    const counts = { critical: 0, warning: 0, info: 0 };
    a.findings.forEach(f => counts[f.sev]++);
    $('#sevchips').innerHTML = ['critical', 'warning', 'info'].map(s => '<button class="sevchip ' + s + (state.sevOff.has(s) ? ' off' : '') + '" data-sev="' + s + '">' + counts[s] + ' ' + s + '</button>').join('');
    $('#sevchips').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { state.sevOff.has(b.dataset.sev) ? state.sevOff.delete(b.dataset.sev) : state.sevOff.add(b.dataset.sev); renderFindings(); }));
    const q = $('#f-search').value.trim().toLowerCase();
    const list = a.findings.filter(f => !state.sevOff.has(f.sev) && (!devSel.value || f.devices.some(d => d.id === devSel.value)) && (!catSel.value || f.cat === catSel.value) &&
      (!q || (f.title + ' ' + f.detail + ' ' + f.device + ' ' + f.cat + ' ' + f.tags.join(' ')).toLowerCase().includes(q)));
    box.innerHTML = list.length ? list.map(f => findingHtml(f)).join('') : '<div class="card"><p class="empty">' + (a.findings.length ? 'No findings match the filter.' : 'No problems found in the loaded configurations.') + '</p></div>';
    bindFindingLinks(box);
  }
  ['#f-device', '#f-cat'].forEach(s => $(s).addEventListener('change', renderFindings));
  $('#f-search').addEventListener('input', renderFindings);

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    const text = b.dataset.copy;
    const done = () => { b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1200); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    else fallbackCopy(text, done);
  });
  function fallbackCopy(text, done) {
    const t = document.createElement('textarea');
    t.value = text; document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
    t.remove();
  }

  // -------------------------------------------------------------- export
  $('#btn-export').addEventListener('click', () => {
    const a = state.analysis;
    if (!a) return;
    const out = ['# Cisco configuration analysis', '', 'Devices: ' + state.devices.map(d => d.hostname + ' (' + typeName(d) + ')').join(', '), '',
      '| Severity | Count |', '|---|---|', ...['critical', 'warning', 'info'].map(s => '| ' + s + ' | ' + a.findings.filter(f => f.sev === s).length + ' |'), ''];
    for (const f of a.findings) {
      out.push('## [' + f.sev.toUpperCase() + '] ' + f.title, '', '*Device:* ' + f.device + ' · *Category:* ' + f.cat + (f.line ? ' · *Config line:* ' + f.line : ''), '', f.detail, '');
      if (f.fix.length) out.push('**Suggested fix**', '', '```', ...f.fix, '```', '');
      if (f.verify.length) out.push('**Verify**', '', ...f.verify.map(v => '- `' + v + '`'), '');
    }
    download('cisco-analysis.md', out.join('\n'));
  });
  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // -------------------------------------------------------- troubleshoot
  const EXAMPLES = [
    "PCs in VLAN 20 don't get an IP address",
    'The printers in VLAN 30 cannot reach the Internet',
    'Users in VLAN 10 cannot reach the server 172.16.2.10',
    "I can't SSH to SW1 from 192.168.10.20",
    'OSPF neighbor between R1 and R2 does not come up',
    'The network is very slow on one port'
  ];
  $('#examples').innerHTML = '<span class="muted small">Examples:</span>' + EXAMPLES.map(x => '<button type="button">' + esc(x) + '</button>').join('');
  $('#examples').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { $('#problem').value = b.textContent; runAssist(); }));
  $('#t-svc').addEventListener('change', () => { $('#t-custom-wrap').hidden = $('#t-svc').value !== 'custom'; });
  $('#btn-assist').addEventListener('click', runAssist);
  $('#problem').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) runAssist(); });

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
    if (!text) { box.innerHTML = '<div class="card"><p class="empty">Describe the problem first.</p></div>'; return; }
    const analysis = state.analysis || { model: CCA.topology.build([]), findings: [] };
    const opts = {};
    const src = $('#t-src').value.trim(), dst = $('#t-dst').value.trim();
    if (src) { if (!N.isIp(src)) return alert('Source must be an IPv4 address'); opts.src = src; }
    if (dst) { if (!N.isIp(dst)) return alert('Destination must be an IPv4 address'); opts.dst = dst; }
    const svc = parseService($('#t-svc').value, $('#t-custom').value);
    if (svc) opts.service = svc;
    const r = CCA.assistant.assist(analysis, text, opts);
    state.lastAssist = r;
    box.innerHTML = renderAssist(r, !!state.analysis);
    bindFindingLinks(box);
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function onList(on) { return on.length ? on.map(esc).join(', ') : 'the relevant devices'; }

  function renderAssist(r, hasConfigs) {
    const h = [];
    h.push('<div class="card"><h2>What I understood</h2><div>' + r.topics.map(t => '<span class="badge neutral topic">' + esc(t.pb.title) + '</span>').join('') + '</div>' +
      '<p>' + r.topics.map(t => esc(t.pb.summary)).join('</p><p>') + '</p>');
    const ent = [];
    if (r.ex.vlans.length) ent.push('VLAN ' + r.ex.vlans.join(', '));
    if (r.ex.ips.length) ent.push('IP ' + r.ex.ips.map(x => x.ip).join(', '));
    if (r.ex.ifaces.length) ent.push('interface ' + r.ex.ifaces.map(N.shortIfName).join(', '));
    if (r.ex.devs.length) ent.push('device ' + r.ex.devs.map(d => d.hostname).join(', '));
    if (r.ex.service) ent.push(r.ex.service.label);
    if (r.ex.internet) ent.push('Internet');
    if (ent.length) h.push('<p class="muted small">Recognised: ' + ent.map(esc).join(' · ') + '</p>');
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

    h.push('<div class="card"><h2>How to find the fault – step by step</h2><ol class="steps">' + r.diagnose.map(s =>
      '<li><div class="on">Run on: ' + onList(s.on) + '</div><div class="codebox"><pre class="cmd">' + esc(s.cmd) + '</pre><button class="copy" data-copy="' + esc(s.cmd) + '">Copy</button></div>' +
      '<div>' + esc(s.why) + '</div><div class="exp">Expected: ' + esc(s.expect) + '</div></li>').join('') + '</ol></div>');

    h.push('<div class="card"><h2>How to verify that the problem is solved</h2><ul class="checklist">' + r.verify.map((s, i) =>
      '<li><input type="checkbox" id="vchk' + i + '"><label for="vchk' + i + '" style="display:block;color:var(--text);font-size:14px"><code>' + esc(s.cmd) + '</code> <span class="muted small">on ' + onList(s.on) + '</span><br><span class="muted small">' + esc(s.expect) + '</span></label></li>').join('') +
      '</ul><p class="muted small">Re-load the changed configs here afterwards: the related findings should disappear.</p></div>');
    return h.join('');
  }

  function renderHops(t) {
    return '<ol class="hops">' + t.hops.map(hp => {
      const bits = ['<div>' + esc(hp.note || hp.dev.hostname) + '</div>'];
      if (hp.aclIn) bits.push('<div class="sub">Inbound ACL ' + esc(hp.aclIn.name) + ': ' + esc(hp.aclIn.res.action) + (hp.aclIn.res.entry ? ' (' + esc(hp.aclIn.res.entry.raw.trim()) + ')' : hp.aclIn.res.undefinedAcl ? ' (ACL not defined → permits all)' : ' (implicit deny)') + '</div>');
      if (hp.route) bits.push('<div class="sub">' + esc(hp.dev.hostname) + ' route: ' + esc(hp.route.code + ' ' + hp.route.net + '/' + hp.route.prefix + (hp.route.nextHop ? ' via ' + hp.route.nextHop : ' directly connected') + (hp.route.iface ? ', ' + N.shortIfName(hp.route.iface) : '')) + '</div>');
      if (hp.aclOut) bits.push('<div class="sub">Outbound ACL ' + esc(hp.aclOut.name) + ': ' + esc(hp.aclOut.res.action) + (hp.aclOut.res.entry ? ' (' + esc(hp.aclOut.res.entry.raw.trim()) + ')' : '') + '</div>');
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
    let s = '<div class="path"><h4>Forward: ' + esc(p.src) + ' → ' + esc(p.dst) + '</h4>' + renderHops(p.fwd) + resultBox(p.fwd);
    if (p.ret) s += '<h4>Return: ' + esc(p.ret.hops[0] ? p.dst : '') + ' → ' + esc(p.fwd.pkt && p.fwd.pkt.src ? p.fwd.pkt.src : p.src) + '</h4>' + renderHops(p.ret) + resultBox(p.ret);
    else if (p.fwd.status === 'exit') s += '<p class="muted small">The reply path cannot be simulated because the destination is outside the loaded configs.</p>';
    return s + '</div>';
  }

  // ------------------------------------------------------------- network
  $('#btn-path').addEventListener('click', () => {
    const box = $('#path');
    const src = $('#p-src').value.trim(), dst = $('#p-dst').value.trim();
    if (!state.analysis) { box.innerHTML = '<p class="empty">Load configs first.</p>'; return; }
    if (!N.isIp(src) || !N.isIp(dst)) { box.innerHTML = '<p class="result unk">Enter a valid source and destination IPv4 address.</p>'; return; }
    const svc = parseService($('#p-svc').value) || { proto: 'icmp' };
    const conv = CCA.topology.conversation(state.analysis.model, src, dst, svc);
    box.innerHTML = renderPath({ src, dst, ...conv });
  });

  function renderNetwork() {
    const a = state.analysis;
    if (!a) {
      ['#net-devices', '#net-links', '#rib'].forEach(s => { $(s).innerHTML = '<p class="empty">Load configs first.</p>'; });
      $('#rib-dev').innerHTML = '';
      return;
    }
    const m = a.model;
    $('#net-devices').innerHTML = '<div class="tablewrap"><table><thead><tr><th>Device</th><th>Type</th><th>Addresses</th><th>Routing</th><th>VLANs</th></tr></thead><tbody>' +
      state.devices.map(d => {
        const addrs = CCA.topology.l3Addresses(d, true).map(x => x.ifc.short + ' ' + x.ip + '/' + x.prefix + (x.ifc.shutdown ? ' (shut)' : ''));
        const protos = [d.ospf.length && 'OSPF ' + d.ospf.map(o => o.pid).join(','), d.eigrp.length && 'EIGRP ' + d.eigrp.map(e => e.asn).join(','), d.rip && 'RIP v' + d.rip.version, d.bgp && 'BGP AS ' + d.bgp.asn, d.staticRoutes.length && d.staticRoutes.length + ' static'].filter(Boolean);
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
      return '<tr><td class="mono">' + esc(s.key) + '</td><td>' + s.members.map(x => esc(x.dev.hostname + ' ' + x.ifc.short + ' ' + x.ip)).join('<br>') + '</td><td>' + (adj.join(' ') || '<span class="muted">none</span>') + '</td></tr>';
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
      '<tr><td>' + esc(r.code) + '</td><td class="mono">' + esc(r.net + '/' + r.prefix) + '</td><td class="mono">' + esc(r.nextHop || 'connected') + '</td><td>' + esc(r.iface ? N.shortIfName(r.iface) : '') + '</td><td>' + esc(r.origin || (r.code.startsWith('S') ? 'static' : '')) + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="empty">No routes.</p>';
    if (!rib.some(r => r.prefix === 0) && d.ipRouting) s += '<p class="muted small">No default route (gateway of last resort not set).</p>';
    $('#rib').innerHTML = s;
  }

  // --------------------------------------------------------------- start
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (Array.isArray(saved) && saved.length) { state.sources = saved; $('#remember').checked = true; }
  } catch (e) { /* ignore */ }
  rebuild();
  try { const t = sessionStorage.getItem(STORE + '.tab'); if (t && $('#tab-' + t)) showTab(t); } catch (e) { /* ignore */ }
})();
