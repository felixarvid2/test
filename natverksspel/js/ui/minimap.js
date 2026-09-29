// Minikartan i hörnet: rummen runt dig, kollegor med ärenden, målet och Krabban om den är nära.
NV.minimap = (function () {
  var FLOOR = { carpet: '#3d4a63', wood: '#7d5634', raised: '#7d8792', concrete: '#666560', concreteDark: '#5a5c5e' };
  var PX = 7; // pixlar per meter
  var last = null;

  function npcPos(world, n) {
    var p = world.people[n];
    if (!p) return null;
    if (p.group) return p.group.visible ? { x: p.group.position.x, z: p.group.position.z } : null;
    return world.npcVisible && !world.npcVisible(n) ? null : { x: p.x, z: p.z };
  }

  function draw(game) {
    var cv = document.getElementById('minimap');
    if (!cv) return;
    var w = game.world;
    var show = w && game.running && NV.settings.get('minimap') && !game.ui.captures() && !document.body.classList.contains('photo');
    cv.classList.toggle('hidden', !show);
    if (!show) return;
    var g = cv.getContext('2d'), W = cv.width, H = cv.height;
    var b = w.builder, site = w.site, boras = site === 'boras';
    var rot = game.mode === '3d' ? w.yaw : 0;
    var px = w.pos.x, pz = w.pos.z;
    last = { rot: rot, px: px, pz: pz, mode: game.mode, game: game, W: W, H: H };
    if (!cv.dataset.bound) {
      // Klick på minikartan sätter en markering där
      cv.dataset.bound = '1';
      cv.addEventListener('click', function (e) {
        if (!last) return;
        var r = cv.getBoundingClientRect();
        var dx = (e.clientX - r.left) / r.width * last.W - last.W / 2, dy = (e.clientY - r.top) / r.height * last.H - last.H / 2;
        var c = Math.cos(-last.rot), s = Math.sin(-last.rot);
        var mx = dx * c - dy * s, my = dx * s + dy * c;
        last.game.setWaypoint(last.px + mx / PX, last.mode === '3d' ? last.pz + my / PX : last.pz - my / PX);
      });
    }
    g.save();
    g.fillStyle = '#10151b'; g.fillRect(0, 0, W, H);
    g.translate(W / 2, H / 2);
    // 3D: kartan roterar så att framåt är uppåt. 2D: norr (−z i spelet) uppåt som i bilden.
    g.rotate(rot);
    function X(x) { return (x - px) * PX; }
    function Y(z) { return game.mode === '3d' ? (z - pz) * PX : -(z - pz) * PX; }
    b.sem.forEach(function (r) {
      if (r.type !== 'floor' || (r.x1 > 50) !== boras) return;
      g.fillStyle = FLOOR[r.tex] || '#555';
      g.fillRect(X(r.x1), Y(r.z1), (r.x2 - r.x1) * PX, Y(r.z2) - Y(r.z1));
    });
    b.sem.forEach(function (r) {
      if (r.type === 'box' && r.collide && r.h > 0.3 && r.y - r.h / 2 < 0.5 && (r.x > 50) === boras) {
        g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(X(r.x - r.w / 2), Y(r.z - r.d / 2), r.w * PX, Y(r.z + r.d / 2) - Y(r.z - r.d / 2));
      }
      if ((r.type === 'wall' || r.type === 'glass') && ((r.fixed > 50 || r.a > 50) === boras)) {
        g.strokeStyle = r.type === 'glass' ? '#8fd0e6' : '#ece4d0'; g.lineWidth = 2.5;
        var cur = r.a, segs = [];
        (r.doors || []).forEach(function (d) { segs.push([cur, d[0]]); cur = d[1]; });
        segs.push([cur, r.b]);
        segs.forEach(function (sg) { g.beginPath(); if (r.axis === 'x') { g.moveTo(X(sg[0]), Y(r.fixed)); g.lineTo(X(sg[1]), Y(r.fixed)); } else { g.moveTo(X(r.fixed), Y(sg[0])); g.lineTo(X(r.fixed), Y(sg[1])); } g.stroke(); });
      }
      if (r.type === 'pallet' && boras) { g.fillStyle = 'rgba(217,107,31,0.55)'; g.fillRect(X(r.x0), Y(r.z - 0.55), r.bays * r.bay * PX, Y(r.z + 0.55) - Y(r.z - 0.55)); }
    });
    // Kollegor
    Object.keys(w.people).forEach(function (n) {
      var p = npcPos(w, n);
      if (!p) return;
      var f = w.people[n];
      var open = f.marker && f.marker.visible, done = f.done && f.done.visible;
      g.fillStyle = open ? '#f0b429' : (done ? '#3fbf6f' : '#aeb8c4');
      g.beginPath(); g.arc(X(p.x), Y(p.z), open ? 4.5 : 3, 0, Math.PI * 2); g.fill();
    });
    // Krabban syns bara när du är nära
    var c = game.crab;
    if (c && c.active && c.site === site && Math.hypot(c.x - px, c.z - pz) < 7) { g.font = '12px sans-serif'; g.textAlign = 'center'; g.save(); g.translate(X(c.x), Y(c.z)); g.rotate(-rot); g.fillText('🦀', 0, 4); g.restore(); }
    // Målet
    var o = game.objective ? game.objective() : null;
    if (o && NV.settings.get('difficulty') !== 'hard') {
      var ox = X(o.x), oy = Y(o.z), r = Math.hypot(ox, oy), lim = W / 2 - 12;
      if (r > lim) { ox *= lim / r; oy *= lim / r; }
      g.fillStyle = '#ffd54a'; g.strokeStyle = '#1b1b1b'; g.lineWidth = 1.5;
      g.beginPath(); for (var i = 0; i < 10; i++) { var a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? 3 : 7; g.lineTo(ox + Math.cos(a) * rr, oy + Math.sin(a) * rr); } g.closePath(); g.fill(); g.stroke();
    }
    g.restore();
    // Du, alltid i mitten
    g.save(); g.translate(W / 2, H / 2);
    var dirA = game.mode === '3d' ? 0 : [Math.PI, 0, -Math.PI / 2, Math.PI / 2][w.dir || 0];
    g.rotate(dirA);
    g.fillStyle = '#ff5a4f'; g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -8); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.closePath(); g.fill(); g.stroke();
    g.restore();
    // Rund ram i 3D
    if (game.mode === '3d') {
      g.globalCompositeOperation = 'destination-in';
      g.beginPath(); g.arc(W / 2, H / 2, W / 2, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.font = 'bold 11px "Segoe UI", sans-serif'; g.textAlign = 'center';
    var z = w.zone();
    g.fillText(z.name, W / 2, H - 14);
  }

  return { draw: draw };
})();
