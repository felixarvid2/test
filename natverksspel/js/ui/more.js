// Tillägg i version 4: tillgänglighet, veckans utmaning, frågesport, subnätsträning,
// topplista, rumsskyltar, bättre notiser, sparad position och mycket annat smått.
(function () {
  var S = NV.sim;
  var VERSION = '7.0';
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  var U = NV.UI.prototype;

  // ------------------------------------------------------------------ Inställningar för tillgänglighet
  var D = NV.settings.defaults;
  D.uiScale = 1; D.colorblind = false; D.highContrast = false; D.reduceMotion = false; D.captions = false; D.crosshair = 1;
  D.volFx = 1; D.volAmb = 1; D.volMusic = 1; D.lastVersion = null;
  NV.applyA11y = function () {
    var s = NV.settings, b = document.body;
    b.classList.toggle('cb', !!s.get('colorblind'));
    b.classList.toggle('hc', !!s.get('highContrast'));
    b.classList.toggle('rm', !!s.get('reduceMotion'));
    document.documentElement.style.setProperty('--ui', s.get('uiScale'));
    document.documentElement.style.setProperty('--ch', s.get('crosshair'));
  };
  // Färger som går att skilja på även vid färgblindhet (blått = bra, orange = fel)
  NV.palette = function () {
    return NV.settings.get('colorblind') ? { ok: '#3da5ff', okDim: '#1d3a5a', bad: '#ff8a1f', warn: '#ffe14d' } : { ok: '#3dff6a', okDim: '#1d4a26', bad: '#ff3b30', warn: '#ffb020' };
  };
  // Textning av ljud för den som spelar utan ljud
  var lastCap = {};
  NV.caption = function (txt) {
    if (!NV.settings.get('captions') || !NV.game || !NV.game.ui) return;
    var now = Date.now();
    if (lastCap[txt] && now - lastCap[txt] < 8000) return;
    lastCap[txt] = now;
    NV.game.ui.toast('<span class="muted">[' + esc(txt) + ']</span>', 'cap');
  };
  [['ring', 'Telefonen ringer'], ['alarm', 'Larm från serverrummet'], ['honk', 'Trucken tutar'], ['door', 'En dörr öppnas'], ['pour', 'Kaffet porlar'], ['squeak', 'Krabban piper'], ['levelUp', 'Fanfar'], ['printer', 'Skrivaren skriver ut'], ['bubble', 'Det bubblar i vattenautomaten']].forEach(function (x) {
    var f = NV.sfx[x[0]];
    if (!f) return;
    NV.sfx[x[0]] = function () { NV.caption(x[1]); return f.apply(this, arguments); };
  });

  var origSettings = U.settingsDialog;
  U.settingsDialog = function () {
    origSettings.apply(this, arguments);
    var self = this, s = NV.settings, body = $('#dialog .dlg-body');
    if (!body) return;
    var box = document.createElement('div');
    box.innerHTML = '<h3>Tillgänglighet</h3><div class="set-grid">' +
      '<label for="a-scale">Storlek på text och fönster</label><input type="range" id="a-scale" min="0.8" max="1.4" step="0.05" value="' + s.get('uiScale') + '">' +
      '<label for="a-cb">Färgblindläge (blått/orange)</label><input type="checkbox" id="a-cb"' + (s.get('colorblind') ? ' checked' : '') + '>' +
      '<label for="a-hc">Hög kontrast</label><input type="checkbox" id="a-hc"' + (s.get('highContrast') ? ' checked' : '') + '>' +
      '<label for="a-rm">Minska rörelse (inga skakningar, blixtar eller gung)</label><input type="checkbox" id="a-rm"' + (s.get('reduceMotion') ? ' checked' : '') + '>' +
      '<label for="a-cap">Textning av ljud</label><input type="checkbox" id="a-cap"' + (s.get('captions') ? ' checked' : '') + '>' +
      '<label for="a-ch">Siktets storlek</label><input type="range" id="a-ch" min="0.6" max="2.5" step="0.1" value="' + s.get('crosshair') + '">' +
      '<label for="a-hap">Vibration (mobil)</label><input type="checkbox" id="a-hap"' + (s.get('haptics') ? ' checked' : '') + '>' +
      '</div><h3>Ljudnivåer</h3><div class="set-grid">' +
      '<label for="v-fx">Effekter</label><input type="range" id="v-fx" min="0" max="1" step="0.05" value="' + s.get('volFx') + '">' +
      '<label for="v-amb">Miljöljud (fläktar, sorl, regn)</label><input type="range" id="v-amb" min="0" max="1" step="0.05" value="' + s.get('volAmb') + '">' +
      '</div><h3>Data</h3><div class="map-go"><button data-x="reset">Återställ inställningar</button><button data-x="export">Exportera framsteg</button><button data-x="import">Importera framsteg</button><button data-x="wipe">Nollställ framsteg…</button></div>';
    body.appendChild(box);
    function bind(id, key, conv) { var el = $('#' + id, box); el.addEventListener('input', function () { s.set(key, conv(el)); NV.applyA11y(); }); }
    bind('a-scale', 'uiScale', function (e) { return +e.value; });
    bind('a-cb', 'colorblind', function (e) { return e.checked; });
    bind('a-hc', 'highContrast', function (e) { return e.checked; });
    bind('a-rm', 'reduceMotion', function (e) { return e.checked; });
    bind('a-cap', 'captions', function (e) { return e.checked; });
    bind('a-ch', 'crosshair', function (e) { return +e.value; });
    bind('a-hap', 'haptics', function (e) { return e.checked; });
    bind('v-fx', 'volFx', function (e) { return +e.value; });
    bind('v-amb', 'volAmb', function (e) { return +e.value; });
    box.querySelectorAll('[data-x]').forEach(function (b) {
      b.addEventListener('click', function () {
        var x = b.getAttribute('data-x');
        if (x === 'reset') { try { localStorage.removeItem('krabba-passet.settings'); } catch (e) { /* ok */ } self.toast('Inställningarna är återställda. Ladda om sidan för att allt ska gälla.'); self.closeDialog(); }
        if (x === 'export') self.exportDialog();
        if (x === 'import') self.importDialog();
        if (x === 'wipe') self.wipeDialog();
      });
    });
  };
  var KEYS = ['krabba-passet.v1', 'krabba-passet.career', 'krabba-passet.notes', 'krabba-passet.best', 'krabba-passet.quiz'];
  U.exportDialog = function () {
    var data = {};
    KEYS.forEach(function (k) { try { data[k] = localStorage.getItem(k); } catch (e) { /* ok */ } });
    var txt = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    var self = this;
    this.showDialog({ title: 'Exportera framsteg', html: '<p class="muted">Kopiera texten och spara den. Klistra in den under Importera på en annan dator.</p><textarea id="exp" rows="6" readonly>' + txt + '</textarea>', buttons: [{ label: 'Kopiera', primary: true, onClick: function () { self.copyText(txt); return true; } }, { label: 'Stäng' }] });
  };
  U.importDialog = function () {
    var self = this;
    this.showDialog({ title: 'Importera framsteg', html: '<p class="muted">Klistra in texten från Exportera. Dina nuvarande framsteg ersätts.</p><textarea id="imp" rows="6"></textarea><p class="err" id="imp-err"></p>', noFocus: true, buttons: [{ label: 'Importera', primary: true, onClick: function (d) {
      try {
        var data = JSON.parse(decodeURIComponent(escape(atob($('#imp', d).value.trim()))));
        Object.keys(data).forEach(function (k) { if (KEYS.indexOf(k) >= 0 && data[k]) localStorage.setItem(k, data[k]); });
        self.toast('Framstegen är importerade. Sidan laddas om.', 'good');
        setTimeout(function () { location.reload(); }, 900);
      } catch (e) { $('#imp-err', d).textContent = 'Texten gick inte att läsa. Kopiera hela texten från Exportera.'; return true; }
    } }, { label: 'Avbryt' }] });
  };
  U.wipeDialog = function () {
    var self = this;
    this.showDialog({ title: 'Nollställ framsteg?', html: '<p>Alla stjärnor, XP, prestationer, rekord och anteckningar raderas. Det går inte att ångra.</p>', buttons: [{ label: 'Radera allt', onClick: function () { KEYS.concat(['krabba-passet.run']).forEach(function (k) { try { localStorage.removeItem(k); } catch (e) { /* ok */ } }); self.toast('Allt är nollställt. Sidan laddas om.'); setTimeout(function () { location.reload(); }, 900); } }, { label: 'Avbryt', primary: true }] });
  };

  // ------------------------------------------------------------------ Notiser: högst fyra, klicka bort
  var origToast = U.toast;
  U.toast = function (msg, kind) {
    origToast.call(this, msg, kind);
    var list = this.toastEl.querySelectorAll('.toast:not(.out)');
    for (var i = 0; i < list.length - 4; i++) { list[i].classList.add('out'); (function (n) { setTimeout(function () { n.remove(); }, 400); })(list[i]); }
    var last = this.toastEl.lastElementChild;
    if (last && !last.querySelector('button')) last.addEventListener('click', function () { last.classList.add('out'); setTimeout(function () { last.remove(); }, 300); });
  };

  // ------------------------------------------------------------------ HUD: klickbara ärenden, kombo, autospar
  var origHud = U.renderHud;
  U.renderHud = function () {
    origHud.apply(this, arguments);
    var g = this.game, self = this;
    if (!g.def) return;
    var extra = '';
    if (g.combo >= 1 && g.lastFixAt && Date.now() - g.lastFixAt < 180000) {
      var left = Math.ceil((180000 - (Date.now() - g.lastFixAt)) / 1000);
      extra += '<div class="hud-loc hud-combo">⚡ Kombo ×' + (g.combo + 1) + ' om du löser nästa fel inom ' + Math.floor(left / 60) + ':' + ('0' + left % 60).slice(-2) + '</div>';
    }
    var ch = NV.challenge.of(g.week);
    if (ch && !g.exam) extra += '<div class="hud-loc hud-chal">🏅 ' + esc(ch.title) + (NV.challenge.broken(g) ? ' <span class="muted">(missad)</span>' : '') + '</div>';
    if (extra) this.hud.insertAdjacentHTML('beforeend', extra);
    if (g.savedFlash && Date.now() - g.savedFlash < 1500) this.hud.insertAdjacentHTML('beforeend', '<div class="hud-saved">💾 Sparat</div>');
    this.hud.querySelectorAll('.hud-tasks li').forEach(function (li, i) {
      li.style.cursor = 'pointer';
      li.title = 'Visa vägen hit';
      li.addEventListener('click', function () { var t = g.def.tasks[i]; var p = g.taskSpot(t); if (p) { g.setWaypoint(p.x, p.z); } else self.toast('Det här ärendet har ingen plats på kartan ännu. Prata med kollegorna först.'); });
    });
  };
  // Pausen visar ärenden, tid och ett tips
  var origPause = U.showPause;
  U.showPause = function () {
    origPause.apply(this, arguments);
    var g = this.game, sub = $('.pause-sub', this.pause);
    if (!sub) return;
    var base = 'Musen styr blicken när den är låst. Går det inte att låsa: håll ned musknappen och dra.';
    if (g.def && g.running) {
      var open = g.def.tasks.filter(function (t) { return !g.taskState[t.id].reported; }).length;
      base = NV.levels.name(g.def) + ' · ' + open + (g.def.build ? ' byggsteg kvar · ' : ' ärenden kvar · ') + Math.floor(g.elapsed() / 60000) + ' min · ' + base;
    }
    sub.innerHTML = esc(base) + '<br><span class="tip">💡 ' + esc(NV.TIPS[Math.floor(Math.random() * NV.TIPS.length)]) + '</span>' +
      (g.def && g.running ? '<div class="pause-learn">Den här veckan: ' + g.def.learn.map(esc).join(' · ') + '</div>' : '');
    if (!$('[data-pause="mute"]', this.pause)) {
      var b = document.createElement('button'); b.setAttribute('data-pause', 'mute'); $('.pause-buttons', this.pause).appendChild(b);
      b.addEventListener('click', function (e) { NV.settings.set('sound', !NV.settings.get('sound')); b.textContent = NV.settings.get('sound') ? '🔊 Ljud på' : '🔇 Ljud av'; e.stopPropagation(); });
    }
    $('[data-pause="mute"]', this.pause).textContent = NV.settings.get('sound') ? '🔊 Ljud på' : '🔇 Ljud av';
  };
  NV.TIPS = ['Tryck G för nätverksglasögonen.', 'R spelar upp det senaste pingspåret.', 'Krabban gömmer sig nära ett av veckans fel.', 'Kaffe gör att du går snabbare.', 'Klicka på ett ärende i listan uppe till vänster för att få vägen dit.', 'Frågesporten vid tavlan i fikarummet ger XP.', 'I handboken finns subnätsträning med rekord.', 'Ctrl+W tar bort senaste ordet i terminalen.', 'Klicka på en IP-adress i terminalen för att pinga den.', 'Veckans utmaning ger en extra medalj.',
    'Ctrl+R i terminalen söker bland dina tidigare kommandon.', 'Alt+. klistrar in sista ordet från förra kommandot.', 'tracepath visar den minsta MTU:n på vägen.', 'ping -f -l 1400 hittar MTU-problem på Windows.',
    'Pinga från rätt källa: ping 192.168.2.1 source gi0/0.10 på routern.', 'show ... | count räknar raderna som matchar.', 'Bara "ping" på routern startar den utökade pingen.', 'curl i en for-slinga visar hur lastbalanseraren fördelar trafiken.'];

  // ------------------------------------------------------------------ Kartan: teckenförklaring och markering på minikartan
  var origMap = U.mapDialog;
  U.mapDialog = function () {
    origMap.apply(this, arguments);
    var body = $('#dialog .dlg-body');
    if (body) body.insertAdjacentHTML('beforeend', '<div class="legend"><span><i style="background:#ff5a4f"></i>Du</span><span><i style="background:#f0b429"></i>Kollega med ärende</span><span><i style="background:#3fbf6f"></i>Klart ärende</span><span><i style="background:#9aa6b2"></i>Kollega</span><span><i style="background:#4fc3f7"></i>Din markering</span><span>🦀 Krabban (när den är nära)</span><span><i class="line"></i>Vägen till nästa mål</span></div>');
  };

  // ------------------------------------------------------------------ Anteckningar: infoga tid och plats
  var origNotes = U.notesDialog;
  U.notesDialog = function () {
    origNotes.apply(this, arguments);
    var g = this.game, foot = $('#dialog .dlg-foot');
    if (!foot) return;
    var b = document.createElement('button');
    b.textContent = 'Infoga tid och plats';
    b.addEventListener('click', function () {
      var t = $('#notes'); if (!t) return;
      var clock = S.deviceClock(g.state, g.state.devices.R1).hms.slice(0, 5);
      var line = '\n## ' + clock + ' · ' + g.world.zone().name + (g.def ? ' · ' + NV.levels.name(g.def).toLowerCase() : '') + '\n';
      t.value += line; t.focus(); NV.settings.store('krabba-passet.notes', t.value);
    });
    foot.insertBefore(b, foot.firstChild);
  };

  // ------------------------------------------------------------------ Menyn: siffertangenter, pilar, version och nyheter
  var origMenu = U.showMenu;
  U.showMenu = function () {
    origMenu.apply(this, arguments);
    var m = this.menu, self = this;
    var inner = $('.menu-inner', m);
    if (inner) inner.insertAdjacentHTML('beforeend', '<p class="muted small ver">Krabba-passet ' + VERSION + ' · siffrorna 1–9 och 0 startar en vecka · piltangenterna flyttar mellan veckorna</p>');
    var best = NV.best.all();
    // Summering och nästa vecka att spela
    var prog = this.game.progress(), nW = NV.levels.WEEKS.length, doneW = 0, stars = 0, next = null;
    NV.levels.WEEKS.forEach(function (w) { var p = prog.weeks[w.week]; if (p) { doneW++; stars += p.stars || 0; } else if (next === null) next = w.week; });
    var wk = $('.weeks:not(.builds)', m);
    if (wk) wk.insertAdjacentHTML('beforebegin', '<div class="menu-sum">' + doneW + ' / ' + nW + ' veckor klara · ' + stars + ' / ' + nW * 3 + ' ★</div>');
    if (next !== null) { var nb = m.querySelector('.week[data-week="' + next + '"]'); if (nb) { nb.classList.add('next'); nb.querySelector('.wn').insertAdjacentHTML('beforeend', ' <span class="next-badge">Nästa</span>'); } }
    var w10 = m.querySelector('.week[data-week="10"]');
    if (w10 && !prog.weeks[10]) w10.querySelector('.wn').insertAdjacentHTML('beforeend', ' <span class="new-badge">NY</span>');
    m.querySelectorAll('.week[data-week]').forEach(function (w) {
      var n = +w.getAttribute('data-week');
      if (NV.challenge.done(n)) w.querySelector('.ws').insertAdjacentHTML('beforeend', ' <span title="Veckans utmaning klar">🏅</span>');
      if (best[n]) w.title = 'Bästa tid: ' + best[n].min + ' min';
    });
    if (NV.settings.get('lastVersion') !== VERSION) { NV.settings.set('lastVersion', VERSION); setTimeout(function () { if (self.menuOpen()) self.whatsNew(); }, 400); }
  };
  document.addEventListener('keydown', function (e) {
    var g = NV.game;
    if (!g || !g.ui.menuOpen() || g.ui.dialogOpen()) return;
    var weeks = Array.prototype.slice.call(document.querySelectorAll('#menu .week[data-week]'));
    if (/^Digit[0-9]$/.test(e.code)) { var wn = e.code.slice(5) === '0' ? '10' : e.code.slice(5); var b = document.querySelector('#menu .week[data-week="' + wn + '"]'); if (b) { b.click(); e.preventDefault(); } return; }
    if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].indexOf(e.key) < 0 || !weeks.length) return;
    var i = weeks.indexOf(document.activeElement);
    var cols = Math.max(1, Math.round(document.querySelector('#menu .weeks').offsetWidth / weeks[0].offsetWidth));
    var d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
    weeks[Math.max(0, Math.min(weeks.length - 1, i < 0 ? 0 : i + d))].focus();
    e.preventDefault();
  });
  U.whatsNew = function () {
    this.showDialog({ title: 'Nytt i version ' + VERSION, html: '<ul class="news"><li><b>Version 7: 300 förbättringar.</b> Över 60 nya kommandon på laptopen och Windows-datorerna (nmap, mtr, tcpdump, iperf3, scp, pathping, PowerShell …), loopback-interface, kabeltest, VLAN-suspend, ACL-portintervall och alias i Cisco, en topologikarta (I), nya handboksflikar med teori och övningar, djur och liv i 2D-världen och mycket mer. Hela listan finns i README.</li><li><b>Inget enable-lösenord längre.</b> Via konsolen kommer du rakt in. Bara SSH kräver inloggning: <code>drift</code> / <code>nordvik</code> (står på lappen, och terminalen påminner dig om du skriver fel).</li><li><b>Större terminal</b> med större text. Knappen ⛶ (eller F11) gör den till helskärm.</li><li><b>Omkring 90 nya Cisco-kommandon</b>: banner motd, access-class, flytande statiska vägar, show spanning-tree root, EtherChannel, VTP, LLDP, erase startup-config, ssh och telnet från routern, debug med mera. Se handboken.</li><li><b>Ny grafik i 2D.</b> Allt är omritat pixel för pixel: gräs med blommor och tuvor, tegelfasad, trägolv med ådring, kakel och en damm med fiskar och näckrosor.</li><li>Träd som vajar i vinden (körsbär, ek, gran och höstlöv), fallande kronblad, fjärilar, trollsländor och eldflugor på kvällen.</li><li>Ljus och skuggor: lampor i taket, solstrålar genom fönstren, gatlyktor och billyktor på kvällen, mjuka skuggor under allt.</li><li>Figurerna blinkar och andas, dörrarna glider upp och du speglas i dammen.</li><li>Skärpedjup och glöd på hög grafiknivå – kan stängas av i inställningarna.</li><li>Kapitel 10 med VPN, SD-WAN och lastbalansering finns kvar från version 5.</li></ul>', buttons: [{ label: 'Kör!', primary: true }] });
  };

  // ------------------------------------------------------------------ Veckans utmaning
  function used(g, re) { return g.cmdLog.some(function (c) { return re.test(c.line.trim()); }); }
  var CH = {
    1: { title: 'Lös veckan utan show running-config', test: function (g) { return !used(g, /^(do\s+)?sh\w*\s+run/i); } },
    2: { title: 'Högst 40 kommandon', test: function (g) { return g.commands <= 40; } },
    3: { title: 'Inga ledtrådar', test: function (g) { return g.def.tasks.every(function (t) { return !g.taskState[t.id].hints; }); } },
    4: { title: 'Använd show interfaces trunk', need: true, test: function (g) { return used(g, /^(do\s+)?sh\w*\s+int\w*\s+tr/i); } },
    5: { title: 'Använd traceroute minst en gång', need: true, test: function (g) { return used(g, /^(traceroute|tracert|trace)\b/i); } },
    6: { title: 'Klar på högst 15 minuter', test: function (g) { return g.elapsed() <= 15 * 60000; } },
    7: { title: 'Titta på övervakningen innan du rör racket', test: function (g) { return !!g.flags.monitorFirst; } },
    8: { title: 'Alla felrapporter helt rätt', test: function (g) { return g.def.tasks.every(function (t) { return g.taskState[t.id].score === 2; }); } },
    9: { title: 'Använd show access-lists', need: true, test: function (g) { return used(g, /^(do\s+)?sh\w*\s+acc/i); } },
    10: { title: 'Bevisa felet med show crypto ipsec sa och en DF-ping', need: true, test: function (g) { return used(g, /^(do\s+)?sh\w*\s+cry\w*\s+ips/i) && used(g, /^ping\b.*(\s-f\b|\s-M\s+do\b|\sdf-bit\b)/i); } },
  };
  NV.challenge = {
    of: function (w) { return CH[w] || null; },
    // "Missad" visas bara för utmaningar som redan går att avgöra under veckan
    broken: function (g) { var c = CH[g.week]; if (!c || c.need) return false; if (g.week === 6 || g.week === 8 || g.week === 7) return false; try { return !c.test(g); } catch (e) { return false; } },
    done: function (w) { var p = NV.settings.store('krabba-passet.chal') || {}; return !!p[w]; },
    mark: function (w) { var p = NV.settings.store('krabba-passet.chal') || {}; p[w] = Date.now(); NV.settings.store('krabba-passet.chal', p); },
  };
  KEYS.push('krabba-passet.chal');

  // ------------------------------------------------------------------ Bästa tider
  NV.best = {
    all: function () { return NV.settings.store('krabba-passet.best') || {}; },
    add: function (w, min, stars) { var b = this.all(); var o = b[w]; if (!o || min < o.min) { b[w] = { min: min, stars: stars, at: Date.now() }; NV.settings.store('krabba-passet.best', b); return true; } return false; },
  };

  // ------------------------------------------------------------------ Frågesport vid tavlan
  var QUIZ = {
    1: [['Vad gör Ctrl+Z i konfigurationsläge?', 'Tar dig direkt till privilegierat läge (#)', 'Ångrar senaste kommandot', 'Stänger av enheten'], ['Vad betyder ett ? efter ett kommando?', 'Visar vad som går att skriva härnäst', 'Kör kommandot i testläge', 'Söker i loggen'], ['Vilken hastighet har konsolporten på en Cisco-switch som standard?', '9600 baud', '115200 baud', '1200 baud'], ['Vilken prompt visar privilegierat läge?', '#', '>', '(config)#'], ['Vad gör write memory?', 'Sparar running-config till startup-config', 'Startar om enheten', 'Raderar konfigurationen']],
    2: [['Vad mäter test cable-diagnostics tdr?', 'Var en kabel är avbruten och hur lång den är', 'Hur mycket trafik som går i kabeln', 'Vilket VLAN kabeln tillhör'], ['Vad visar show interfaces status err-disabled?', 'Portar som switchen har stängt av på grund av ett fel', 'Portar utan kabel', 'Portar i VLAN 1'], ['Vad betyder notconnect på en port?', 'Ingen länk – kabel eller motpart saknas', 'Porten är avstängd med shutdown', 'Porten är err-disabled'], ['Vad är ett typiskt tecken på duplex mismatch?', 'Late collisions och CRC-fel', 'Porten får ingen IP-adress', 'Pingen går snabbare'], ['Hur lång är en MAC-adress?', '48 bitar', '32 bitar', '128 bitar']],
    3: [['Vilket kommando tömmer DNS-cachen i Windows?', 'ipconfig /flushdns', 'ipconfig /release', 'nslookup -clear'], ['Hur många användbara adresser ryms i ett /30?', '2', '4', '6'], ['Vad betyder en adress som börjar på 169.254?', 'Datorn fick inget DHCP-svar', 'Datorn har internetåtkomst', 'Adressen är statisk'], ['Hur många värdadresser ryms i ett /26?', '62', '64', '30'], ['Vilken nätmask motsvarar /27?', '255.255.255.224', '255.255.255.192', '255.255.255.240']],
    4: [['Vad gör state suspend under ett VLAN?', 'Pausar VLAN:et så att ingen trafik går i det', 'Raderar VLAN:et', 'Gör VLAN:et till native VLAN'], ['Vad gör spanning-tree vlan 10 root primary?', 'Gör switchen till root för VLAN 10', 'Stänger av spanning tree i VLAN 10', 'Blockerar alla portar i VLAN 10'], ['Vad gör switchport trunk allowed vlan add 30?', 'Lägger till VLAN 30 i listan', 'Ersätter listan med bara VLAN 30', 'Tar bort VLAN 30'], ['Vad händer vid native VLAN mismatch?', 'Otaggad trafik hamnar i fel VLAN', 'Trunken går ner direkt', 'Alla VLAN blockeras'], ['Varför blockerar STP en port?', 'För att undvika loopar', 'För att porten är trasig', 'För att spara ström']],
    5: [['Vad är en flytande statisk väg?', 'En reservväg med högre administrativt avstånd', 'En väg som byter nästa hopp varje minut', 'En väg som bara gäller på natten'], ['Varför är ett loopback-interface bra som routerns adress?', 'Det är alltid uppe, oberoende av kablar', 'Det är snabbare än andra interface', 'Det kan inte pingas'], ['Vad visar show ip route?', 'Routingtabellen', 'ARP-tabellen', 'MAC-tabellen'], ['Varför behövs en returväg?', 'Svaret måste också hitta tillbaka', 'För att DNS ska fungera', 'För att öka hastigheten'], ['Vad gör encapsulation dot1Q 20?', 'Kopplar ett subinterface till VLAN 20', 'Skapar VLAN 20 på switchen', 'Sätter IP-adress 20']],
    6: [['Vad gör access-class 10 in under line vty?', 'Bara adresser som ACL 10 släpper får logga in', 'Stänger SSH helt', 'Kräver lösenordet 10'], ['Vilken port använder SSH?', '22', '23', '443'], ['Vad saknas om NAT-översättningarna är tomma?', 'ip nat inside eller outside på ett interface', 'En standardroute i switchen', 'Ett VLAN-interface'], ['Varför är telnet en risk?', 'Allt skickas i klartext', 'Det är långsammare än SSH', 'Det kräver en nyckel'], ['Vad behövs för att skapa SSH-nycklar?', 'Hostname och ip domain-name', 'En DHCP-pool', 'Ett trunkinterface']],
    7: [['Vad betyder Loss% i mtr?', 'Hur stor andel av paketen som försvinner vid varje hopp', 'Hur full länken är', 'Hur många hopp som saknas'], ['Vad ska du göra efter debug ip packet?', 'Stänga av den med undebug all', 'Starta om routern', 'Spara med write memory'], ['Hur ser en broadcaststorm ut i övervakningen?', 'Trafiken går rakt upp i taket', 'Trafiken blir noll', 'Kurvan blir sågtandad'], ['Vad betyder sågtänder i grafen?', 'En port som går upp och ner', 'En loop', 'Att NTP fungerar'], ['Varför behövs NTP?', 'Rätt tid i loggarna', 'Snabbare routing', 'Fler VLAN']],
    8: [['Vad visar show lldp neighbors?', 'Grannenheter som pratar LLDP', 'Trådlösa klienter', 'Accesspunkternas ström'], ['Varför har IP-telefoner ofta ett eget röst-VLAN?', 'Så att rösttrafiken hålls isär och kan prioriteras', 'För att telefoner inte klarar VLAN 1', 'För att spara IP-adresser'], ['Vad visar show power inline?', 'Hur mycket ström PoE-portarna ger', 'Strömförbrukningen i racket', 'Batteriet i UPS:en'], ['Vad händer om SSID mappas mot fel VLAN?', 'Klienterna får adress i fel nät', 'Accesspunkten stängs av', 'Wi-Fi blir snabbare'], ['Varför ska grannar inte ha samma kanal?', 'De stör varandra', 'Det sparar ström', 'Det krävs av PoE']],
    10: [['Vilken UDP-port använder IKE för att starta en IPsec-tunnel?', '500', '53', '161'], ['Vad visar tracepath som traceroute inte visar?', 'Den minsta MTU:n på vägen (pmtu)', 'DNS-namnet på varje hopp', 'Vilket VLAN paketen går i'], ['Vad betyder QM_IDLE i show crypto isakmp sa?', 'Fas 1 är klar och tunneln väntar på trafik', 'Tunneln är nere', 'Nyckeln är fel'], ['Varför måste NAT-listan ha en deny-rad för VPN-trafiken?', 'NAT görs före kryptering, så översatt trafik matchar inte crypto-ACL:en', 'Annars krypteras internettrafiken', 'Deny-raden gör tunneln snabbare'], ['Vad gör ip tcp adjust-mss 1360?', 'Datorerna förhandlar fram segment som får plats i tunneln', 'Tunneln får större MTU', 'Stora paket delas upp av operatören']],
    9: [['Vad matchar permit tcp any any range 8000 8080?', 'TCP-trafik till portarna 8000–8080', 'Bara port 8000 och 8080', 'All trafik utom 8000–8080'], ['Vad gör ip access-list resequence GAST 10 10?', 'Numrerar om raderna 10, 20, 30 …', 'Tar bort rad 10', 'Flyttar listan till interface 10'], ['Vad händer sist i varje ACL?', 'Ett osynligt deny any', 'Ett osynligt permit any', 'Ingenting'], ['Vad avgör om en ACL ska vara in eller out?', 'Riktningen trafiken går genom interfacet', 'Vilket VLAN porten har', 'Hur många rader ACL:en har'], ['Vad betyder err-disabled efter port security?', 'Porten stängdes av vid en överträdelse', 'Porten saknar kabel', 'Porten är en trunk']],
  };
  U.quiz = function (week) {
    var g = this.game, self = this;
    var list = QUIZ[week] || QUIZ[1];
    var st = NV.settings.store('krabba-passet.quiz') || {};
    var answers = [];
    function ask(i) {
      if (i >= list.length) return finish();
      var q = list[i];
      var opts = [1, 2, 3].map(function (k) { return { t: q[k], ok: k === 1, r: NV.util.hash(q[0] + q[k]) }; }).sort(function (a, b) { return a.r - b.r; });
      self.showDialog({
        title: 'Frågesport – fråga ' + (i + 1) + ' av ' + list.length, html: '<p class="quote">' + esc(q[0]) + '</p><div class="quiz">' + opts.map(function (o, k) { return '<button data-k="' + k + '">' + esc(o.t) + '</button>'; }).join('') + '</div><p id="qz-fb" class="muted"></p>',
        buttons: [{ label: 'Avbryt' }],
        onOpen: function (d) {
          d.querySelectorAll('[data-k]').forEach(function (b) {
            b.addEventListener('click', function () {
              var o = opts[+b.getAttribute('data-k')];
              answers.push(o.ok);
              d.querySelectorAll('[data-k]').forEach(function (x) { x.disabled = true; if (opts[+x.getAttribute('data-k')].ok) x.classList.add('right'); });
              if (!o.ok) b.classList.add('wrong');
              if (o.ok) NV.sfx.success(); else NV.sfx.fail();
              $('#qz-fb', d).textContent = o.ok ? 'Rätt!' : 'Inte riktigt – rätt svar är markerat.';
              setTimeout(function () { ask(i + 1); }, 1100);
            });
          });
        },
      });
    }
    function finish() {
      var right = answers.filter(Boolean).length;
      var prev = st[week] || 0;
      var gain = Math.max(0, right - prev) * 20;
      if (right > prev) { st[week] = right; NV.settings.store('krabba-passet.quiz', st); }
      NV.career.stat('quizRight', right);
      if (right === list.length) NV.career.stat('quizPerfect');
      if (gain) g.xp(gain, 'Frågesport');
      self.showDialog({ title: 'Frågesport klar', html: '<div class="done-stars">' + right + ' / ' + list.length + '</div><p>' + (right === list.length ? 'Alla rätt!' : 'Bra jobbat! Du kan göra om frågesporten när du vill.') + (gain ? ' Du fick ' + gain + ' XP.' : ' XP ges bara för nya rätta svar.') + '</p>', buttons: [{ label: 'Stäng', primary: true }] });
    }
    ask(0);
  };

  // ------------------------------------------------------------------ Subnätsträning i handboken
  U.subnetTrainer = function (box) {
    var U2 = NV.util, streak = 0;
    var rec = (NV.settings.store('krabba-passet.quiz') || {}).subnet || 0;
    function q() {
      var pfx = 24 + Math.floor(Math.random() * 7), a = 10 + Math.floor(Math.random() * 180), b = Math.floor(Math.random() * 255), c = Math.floor(Math.random() * 255), h = 1 + Math.floor(Math.random() * 250);
      var ip = a + '.' + b + '.' + c + '.' + h, mask = U2.prefixToMask(pfx);
      var wild = U2.intToIp((~U2.ipToInt(mask)) >>> 0);
      var mtu = [1420, 1400, 1438, 1380, 1460][Math.floor(Math.random() * 5)];
      var kinds = [['Vilket är nätverksadressen för', U2.network(ip, mask)], ['Vilken är broadcastadressen för', U2.broadcast(ip, mask)], ['Hur många värdadresser har', String(Math.pow(2, 32 - pfx) - 2)], ['Vilken nätmask har', mask],
        ['Vilken wildcard-mask (för ACL) har', wild], ['MSS', String(mtu - 40), 'Tunneln släpper igenom ' + mtu + ' byte (MTU). Vilken TCP-MSS ska du klämma till? (20 byte IP + 20 byte TCP)']];
      var k = kinds[Math.floor(Math.random() * kinds.length)];
      box.innerHTML = '<p><b>' + (k[2] || k[0] + ' ' + ip + '/' + pfx + '?') + '</b></p><input id="sn-a" class="search" autocomplete="off" placeholder="Ditt svar"><p id="sn-f" class="muted">Svit: ' + streak + ' · rekord: ' + rec + '</p>';
      var inp = $('#sn-a', box);
      inp.focus();
      inp.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.stopPropagation();
        var ok = inp.value.trim() === k[1];
        if (ok) { streak++; NV.sfx.xp(); if (streak > rec) { rec = streak; var st = NV.settings.store('krabba-passet.quiz') || {}; st.subnet = rec; NV.settings.store('krabba-passet.quiz', st); NV.career.max('subnetBest', rec); } setTimeout(q, 500); $('#sn-f', box).innerHTML = '<span class="t-ok">Rätt!</span>'; }
        else { NV.sfx.fail(); $('#sn-f', box).innerHTML = '<span class="t-bad">Rätt svar: ' + esc(k[1]) + '</span> · svit ' + streak + ' bruten'; streak = 0; setTimeout(q, 1800); }
      });
    }
    q();
  };

  // ------------------------------------------------------------------ Veckans slut: betyg, topplista och mest använda kommandon
  var origDone = U.weekDone;
  U.weekDone = function (res) {
    origDone.apply(this, arguments);
    var g = this.game, body = $('#dialog .dlg-body');
    if (!body) return;
    var score = res.stars * 2 + (res.reportScore === res.reportMax ? 2 : 0) + (res.minutes <= 15 ? 1 : 0) - Math.min(3, res.hints);
    var grade = score >= 8 ? 'A' : score >= 7 ? 'B' : score >= 5 ? 'C' : score >= 3 ? 'D' : 'E';
    var rec = NV.best.add(g.def.week, res.minutes, res.stars);
    var counts = {};
    g.cmdLog.forEach(function (c) { var w = c.line.trim().split(/\s+/).slice(0, 2).join(' '); if (w) counts[w] = (counts[w] || 0) + 1; });
    var top = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 5);
    var ch = NV.challenge.of(g.def.week), chOk = false;
    if (ch && !g.exam) { try { chOk = ch.test(g); } catch (e) { chOk = false; } if (chOk && !NV.challenge.done(g.def.week)) { NV.challenge.mark(g.def.week); NV.career.stat('challenges'); g.xp(75, 'Veckans utmaning'); } }
    body.insertAdjacentHTML('afterbegin', '<div class="grade">Betyg <b>' + grade + '</b>' + (rec ? ' · <span class="t-ok">nytt rekord!</span>' : '') + '</div>');
    body.insertAdjacentHTML('beforeend', (ch && !g.exam ? '<p>🏅 Veckans utmaning – ' + esc(ch.title) + ': <b>' + (chOk ? 'klarad!' : 'inte den här gången') + '</b></p>' : '') + (top.length ? '<p class="muted small">Mest använda: ' + top.map(function (t) { return '<code>' + esc(t) + '</code> ×' + counts[t]; }).join(' · ') + '</p>' : ''));
  };

  // Topplista i karriärfönstret
  var origAch = U.achievementsDialog;
  U.achievementsDialog = function () {
    origAch.apply(this, arguments);
    var body = $('#dialog .dlg-body'), best = NV.best.all();
    if (!body) return;
    var rows = NV.levels.WEEKS.map(function (w) { var b = best[w.week]; return '<tr><td>Vecka ' + w.week + '</td><td>' + esc(w.title) + '</td><td>' + (b ? b.min + ' min' : '–') + '</td><td>' + (b ? '★★★'.slice(0, b.stars) : '') + '</td><td>' + (NV.challenge.done(w.week) ? '🏅' : '') + '</td></tr>'; }).join('');
    body.insertAdjacentHTML('beforeend', '<h3>Dina bästa tider</h3><table class="tbl"><tr><th>Vecka</th><th>Tema</th><th>Tid</th><th>Stjärnor</th><th>Utmaning</th></tr>' + rows + '</table>');
  };

  // ------------------------------------------------------------------ Felrapport: utkast sparas
  var origRep = U.reportDialog;
  U.reportDialog = function (t) {
    origRep.apply(this, arguments);
    var g = this.game, d = this.dialog;
    g.drafts = g.drafts || {};
    var dr = g.drafts[t.id];
    ['r1', 'r2', 'r3'].forEach(function (id) {
      var el = $('#' + id, d); if (!el) return;
      if (dr && dr[id] !== undefined) el.value = dr[id];
      el.addEventListener('input', function () { g.drafts[t.id] = g.drafts[t.id] || {}; g.drafts[t.id][id] = el.value; });
    });
    if (dr) $('.dlg-body', d).insertAdjacentHTML('afterbegin', '<p class="muted small">✎ Ditt utkast är återställt.</p>');
  };

  // ------------------------------------------------------------------ Karriär: nya prestationer
  var A = NV.career.ACH;
  A.push(['chal1', 'Utmanare', 'Klara en veckoutmaning.', '🏅', function (s) { return s.challenges >= 1; }]);
  A.push(['chal9', 'Alla utmaningar', 'Klara alla tio veckoutmaningar.', '🎖️', function (s) { return s.challenges >= NV.levels.WEEKS.length; }]);
  A.push(['quiz1', 'Pluggis', 'Svara rätt på alla frågor i en frågesport.', '🧑‍🎓', function (s) { return s.quizPerfect >= 1; }]);
  A.push(['quiz20', 'Frågemaskin', 'Svara rätt på 20 frågor totalt.', '❓', function (s) { return s.quizRight >= 20; }]);
  A.push(['subnet10', 'Subnätsproffs', 'Tio rätt i rad i subnätsträningen.', '🧮', function (s) { return s.subnetBest >= 10; }]);
  A.push(['rain', 'Regnjacka', 'Spela en vecka när det regnar.', '🌧️', function (s) { return s.rainWeeks >= 1; }]);
  A.push(['vacuum', 'Städpatrull', 'Hitta dammsugarroboten.', '🤖', function (s) { return s.vacuum >= 1; }]);
  A.push(['water', 'Vätskebalans', 'Drick vatten från vattenautomaten.', '💧', function (s) { return s.water >= 1; }]);
  A.push(['printer', 'Utskrift', 'Skriv ut något på skrivaren.', '🖨️', function (s) { return s.prints >= 1; }]);
  A.push(['mobile', 'På språng', 'Spela på en pekskärm.', '📱', function (s) { return s.touch >= 1; }]);
  A.push(['quiz30', 'Hela kursen', 'Svara rätt på 30 frågor i frågesporten.', '🎓', function (s) { return s.quizRight >= 30; }]);
  var origStats = NV.career.stats;
  NV.career.stats = function () {
    var o = origStats();
    var raw = (function () { try { return JSON.parse(localStorage.getItem('krabba-passet.career') || '{}').stats || {}; } catch (e) { return {}; } })();
    ['challenges', 'quizRight', 'quizPerfect', 'subnetBest', 'rainWeeks', 'vacuum', 'water', 'prints', 'touch'].forEach(function (k) { o[k] = raw[k] || 0; });
    return o;
  };

  // ------------------------------------------------------------------ Rumsskylt när du går in i ett nytt rum
  var lastZone = null, zoneEl = null;
  NV.zoneBanner = function (game) {
    if (!game.world || !game.running || game.ui.captures()) return;
    var z = game.world.zone().name;
    if (z === lastZone) return;
    var first = lastZone === null;
    lastZone = z;
    if (first) return;
    if (!zoneEl) { zoneEl = document.createElement('div'); zoneEl.id = 'zone-banner'; document.body.appendChild(zoneEl); }
    zoneEl.textContent = z;
    zoneEl.classList.remove('show'); void zoneEl.offsetWidth; zoneEl.classList.add('show');
    NV.sfx.zone();
  };
})();
