// Draws the inferred topology as an SVG: routers on top, layer-3 switches in the middle,
// layer-2 switches at the bottom. Links with problems are drawn in the critical colour.
(function (root) {
  const CCA = root.CCA = root.CCA || {};
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LINK_IDS = /^(link-|ros-|ospf-adj|eigrp-adj|rip-adj|serial-|ppp-|ospf-one-sided|eigrp-one-sided|rip-one-sided|hsrp-mismatch|bgp-)/;

  function render(model, findings) {
    const devs = model.devices;
    if (!devs.length) return '';
    const layerOf = d => d.type === 'router' ? 0 : d.type === 'l3switch' ? 1 : 2;
    const layers = [[], [], []];
    devs.forEach(d => layers[layerOf(d)].push(d));
    const used = layers.filter(l => l.length);
    const W = Math.max(640, Math.max(...used.map(l => l.length)) * 250);
    const rowH = 150;
    const H = used.length * rowH + 30;
    const pos = {};
    // Neighbours (shared subnet or described link) – used to order each row so links cross less.
    const nb = {};
    const link = (a, b) => { (nb[a.id] = nb[a.id] || new Set()).add(b.id); (nb[b.id] = nb[b.id] || new Set()).add(a.id); };
    for (const seg of model.segments) { const ds = [...new Set(seg.members.map(m => m.dev))]; for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) link(ds[i], ds[j]); }
    for (const l of model.l2Links) link(l.a.dev, l.b.dev);
    used.forEach((l, li) => {
      if (li > 0) {
        const bary = d => { const xs = [...(nb[d.id] || [])].map(id => pos[id]).filter(Boolean).map(p => p.x); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : W / 2; };
        l.sort((a, b) => bary(a) - bary(b));
      } else {
        // Keep connected routers next to each other.
        const order = [];
        const seen = new Set();
        const visit = d => { if (seen.has(d.id)) return; seen.add(d.id); order.push(d); for (const id of nb[d.id] || []) { const o = l.find(x => x.id === id); if (o) visit(o); } };
        l.slice().sort((a, b) => a.hostname.localeCompare(b.hostname)).forEach(visit);
        l.splice(0, l.length, ...order);
      }
      l.forEach((d, i) => { pos[d.id] = { x: Math.round(W * (i + 1) / (l.length + 1)), y: 60 + li * rowH }; });
    });
    const worst = {};
    for (const f of findings) for (const d of f.devices) {
      const w = worst[d.id];
      if (!w || (f.sev === 'critical') || (f.sev === 'warning' && w === 'info')) worst[d.id] = f.sev;
    }
    const problem = (a, b) => findings.some(f => f.sev !== 'info' && LINK_IDS.test(f.id) && f.devices.includes(a) && f.devices.includes(b));
    const edges = [];
    const nodes = [];
    // Layer-3 segments
    for (const seg of model.segments) {
      const ds = [...new Set(seg.members.map(m => m.dev))];
      if (ds.length < 2) continue;
      if (ds.length === 2) edges.push({ a: ds[0], b: ds[1], label: seg.key, bad: problem(ds[0], ds[1]), kind: 'l3' });
      else {
        const cx = Math.round(ds.reduce((s, d) => s + pos[d.id].x, 0) / ds.length);
        const cy = Math.round(ds.reduce((s, d) => s + pos[d.id].y, 0) / ds.length) + 18;
        const id = 'seg:' + seg.key;
        pos[id] = { x: cx, y: cy };
        nodes.push({ id, label: seg.key });
        for (const d of ds) edges.push({ a: d, b: { id }, label: '', bad: ds.some(o => o !== d && problem(d, o)), kind: 'l3' });
      }
    }
    // Layer-2 links that are not already drawn as a layer-3 link
    for (const l of model.l2Links) {
      const dup = edges.some(e => e.kind === 'l3' && ((e.a === l.a.dev && e.b === l.b.dev) || (e.a === l.b.dev && e.b === l.a.dev)));
      edges.push({ a: l.a.dev, b: l.b.dev, label: dup ? '' : l.a.ifc.short + ' – ' + l.b.ifc.short, title: l.a.dev.hostname + ' ' + l.a.ifc.short + ' – ' + l.b.dev.hostname + ' ' + l.b.ifc.short, bad: problem(l.a.dev, l.b.dev), kind: 'l2', offset: dup ? 10 : 0 });
    }
    const out = [];
    out.push('<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Network topology" class="topo">');
    for (const e of edges) {
      const p = pos[e.a.id], q = pos[e.b.id];
      if (!p || !q) continue;
      const o = e.offset || 0;
      out.push('<line class="edge ' + e.kind + (e.bad ? ' bad' : '') + '" x1="' + (p.x + o) + '" y1="' + p.y + '" x2="' + (q.x + o) + '" y2="' + q.y + '"><title>' + esc((e.title || e.label) + (e.bad ? ' – has problems' : '')) + '</title></line>');
      if (e.label) {
        const mx = (p.x + q.x) / 2 + o, my = p.y === q.y ? p.y - 34 : (p.y + q.y) / 2 - 4;
        out.push('<text class="elabel' + (e.bad ? ' bad' : '') + '" x="' + mx + '" y="' + my + '" text-anchor="middle">' + esc(e.label) + '</text>');
      }
    }
    for (const n of nodes) {
      const p = pos[n.id];
      out.push('<g class="segnode"><circle cx="' + p.x + '" cy="' + p.y + '" r="6"/><text x="' + p.x + '" y="' + (p.y + 20) + '" text-anchor="middle" class="elabel">' + esc(n.label) + '</text></g>');
    }
    for (const d of devs) {
      const p = pos[d.id];
      const sev = worst[d.id] || 'ok';
      const kind = d.type === 'router' ? 'Router' : d.type === 'l3switch' ? 'L3 switch' : 'Switch';
      out.push('<g class="node sev-' + sev + '" data-dev="' + d.id + '" tabindex="0" role="button" aria-label="' + esc(d.hostname + ', ' + kind) + '">' +
        '<rect x="' + (p.x - 62) + '" y="' + (p.y - 24) + '" width="124" height="48" rx="' + (d.type === 'router' ? 24 : 6) + '"/>' +
        '<text x="' + p.x + '" y="' + (p.y - 2) + '" text-anchor="middle" class="nname">' + esc(d.hostname) + '</text>' +
        '<text x="' + p.x + '" y="' + (p.y + 14) + '" text-anchor="middle" class="ntype">' + esc(kind) + '</text></g>');
    }
    out.push('</svg>');
    return out.join('');
  }

  CCA.diagram = { render };
  if (typeof module !== 'undefined' && module.exports) module.exports = CCA;
})(typeof window !== 'undefined' ? window : globalThis);
