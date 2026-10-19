'use strict';
// KRYPTA – roguelike-FPS (raycaster i Doom/Wolfenstein-anda).
// Varje runda: genererade våningar (Gen), kort som ger bonusar (Cards/CardUI), guld, butik, elitfiender
// och en boss på sista våningen. Döden avslutar rundan; själar ger upplåsningar till nästa.
(() => {
const W = 320, H = 200, HUD_H = 34, VH = H - HUD_H, HORIZON = VH >> 1;
let BASE_PLANE = 0.75; // sätts från synfältet (FOV) i inställningarna
const applyFov = () => { BASE_PLANE = Math.tan(clamp(settings.fov, 60, 100) * Math.PI / 360); };
const FLOORS = 5; // vanliga våningar per varv; våning FLOORS + 1 är bossen
// efter bossen kan man gå djupare: varv 2 är våning 7-12 med en starkare boss på 12, och så vidare
const isBossDepth = d => d % (FLOORS + 1) === 0;
const cycleOf = d => Math.floor((d - 1) / (FLOORS + 1));
const cyclePos = d => (d - 1) % (FLOORS + 1) + 1;
const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');
canvas.width = W; canvas.height = H;
ctx.imageSmoothingEnabled = false;
const frame = ctx.createImageData(W, VH);
const px = new Uint32Array(frame.data.buffer);
const zbuf = new Float32Array(W);
const params = new URLSearchParams(location.search);
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------- Inställningar, profil och sparning (localStorage kan saknas) ----------
const store = {
  get(k, def) { try { const v = localStorage.getItem('krypta.' + k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem('krypta.' + k, JSON.stringify(v)); } catch (e) { /* ingen lagring */ } },
  del(k) { try { localStorage.removeItem('krypta.' + k); } catch (e) { /* ingen lagring */ } },
};
const DEVICE = (() => { try { return matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window ? 'mobil' : 'dator'; } catch (e) { return 'dator'; } })(); // inställningar sparas per enhetstyp
const settings = Object.assign({ sens: 1, vol: 0.8, muted: false, diff: 1, fov: 74, gamma: 1, shake: 1, xstyle: 'kors', xcolor: '', fps: false, lowfx: false, bob: true,
  vibrate: true, lefty: false, btnScale: 1, map: 1 }, store.get('settings.' + DEVICE, null) || store.get('settings', {}));
if (params.has('diff')) settings.diff = clamp(+params.get('diff'), 0, 3);
const saveSettings = () => { store.set('settings.' + DEVICE, settings); store.set('settings', settings); };
applyFov();
const profile = Object.assign({ souls: 0, unlocked: [], runs: 0, wins: 0, bestDepth: 0, bestScore: 0, history: [] }, store.get('profile', {}));
const saveProfile = () => store.set('profile', profile);
// ---------- Prestationer ----------
const ACH = [
  ['first', 'FÖRSTA STEGET', 'KLARA EN VÅNING', p => p.bestDepth >= 2],
  ['cycle', 'NERÅT', 'NÅ VÅNING 6', p => p.bestDepth >= 6],
  ['deep', 'DJUPET', 'NÅ VÅNING 12', p => p.bestDepth >= 12],
  ['win', 'KRYPTANS HERRE', 'VINN EN RUNDA', p => p.wins >= 1],
  ['nightmare', 'MARDRÖMMEN', 'VINN PÅ MARDRÖM', p => p.nightmareWin],
  ['k100', 'SLAKTARE', 'DÖDA 100 FIENDER TOTALT', p => (p.kills || 0) >= 100],
  ['k1000', 'LIKSTRÖ', 'DÖDA 1000 FIENDER TOTALT', p => (p.kills || 0) >= 1000],
  ['boss1', 'BOSSJÄGARE', 'BESEGRA EN BOSS', p => Object.keys(p.bossWins || {}).length >= 1],
  ['bossall', 'ALLA HUVUDEN', 'BESEGRA ALLA SEX BOSSAR', p => Object.keys(p.bossWins || {}).length >= BOSS_IDS.length, p => [Object.keys(p.bossWins || {}).length, BOSS_IDS.length]],
  ['guard', 'VÄKTARDRÅPARE', 'BESEGRA EN VÄKTARE', p => (p.guardians || 0) >= 1],
  ['rich', 'GULDFEBER', 'HA 500 GULD SAMTIDIGT', (p, r) => r && r.gold >= 500],
  ['deck', 'SAMLAREN', 'HA 15 KORT I EN RUNDA', (p, r) => r && r.owned.length >= 15],
  ['pact', 'PAKTEN', 'SLUT EN VAPENPAKT', (p, r) => r && r.pact],
  ['secret', 'SPÅRHUND', 'HITTA 10 HEMLIGHETER TOTALT', p => (p.secrets || 0) >= 10],
  ['fast', 'BLIXTEN', 'KLARA EN VÅNING PÅ UNDER 60 S', (p, r) => r && r.fast],
  ['untouched', 'ORÖRBAR', 'KLARA EN VÅNING UTAN ATT TA SKADA', (p, r) => r && r.untouched],
  ['multi', 'MASSAKER', 'DÖDA 5 FIENDER I SAMMA SALVA', () => P.multi >= 5],
  ['altar', 'OFFRET', 'KÖP EN UPPGRADERING VID SJÄLAALTARET', p => Object.values(p.meta || {}).some(v => v > 0)],
  ['arsenal', 'ARSENALEN', 'BÄR 6 VAPEN SAMTIDIGT', () => P.has.filter(Boolean).length >= 6],
  ['daily', 'DAGBOKEN', 'SPELA EN DAGENS RUNDA', p => p.history.some(h => h.daily)],
  ['jump', 'HOPPETOSSA', 'HOPPA 100 GÅNGER', p => (p.jumps || 0) >= 100, p => [p.jumps || 0, 100]],
  ['dash', 'RUSAREN', 'RUSA 50 GÅNGER', p => (p.dashes || 0) >= 50, p => [p.dashes || 0, 50]],
  ['gren', 'GRANATKASTAREN', 'KASTA 25 GRANATER', p => (p.grenadesThrown || 0) >= 25, p => [p.grenadesThrown || 0, 25]],
  ['gib', 'SLAKTHUSET', 'SPRÄNG 50 FIENDER I BITAR', p => (p.gibs || 0) >= 50, p => [p.gibs || 0, 50]],
  ['combo10', 'KOMBOKUNGEN', 'NÅ KOMBO x10', (p, r) => r && (r.bestCombo || 0) >= 10],
  ['champ', 'GULDJÄGAREN', 'DÖDA 3 CHAMPIONS', p => (p.champions || 0) >= 3, p => [p.champions || 0, 3]],
  ['smith', 'SMEDEN', 'SMID ETT VAPEN TILL NIVÅ 3', (p, r) => r && Object.values(r.wlvl || {}).some(v => v >= 3)],
  ['freed', 'BEFRIAREN', 'BEFRIA 5 FÅNGAR', p => (p.freed || 0) >= 5, p => [p.freed || 0, 5]],
  ['challenge', 'UTMANAREN', 'KLARA 3 UTMANINGAR', p => (p.challenges || 0) >= 3, p => [p.challenges || 0, 3]],
  ['goldroom', 'GULDKAMMAREN', 'HITTA GULDKAMMAREN', p => (p.goldRooms || 0) >= 1],
  ['rush', 'BOSSRUSHEN', 'VINN EN BOSSRUSH', p => (p.rushWins || 0) >= 1],
  ['asc1', 'UPPSTIGEN', 'VINN PÅ UPPSTIGNING 1', p => (p.ascMax || 0) >= 2],
  ['swamp', 'TRÄSKVANDRAREN', 'KLARA EN VÅNING I TRÄSKET', p => (p.swampFloors || 0) >= 1],
  ['seen100', 'KORTKÄNNAREN', 'SE 100 OLIKA KORT', p => (p.cardsSeen || []).length >= 100, p => [(p.cardsSeen || []).length, 100]],
  ['set', 'SETMÄSTAREN', 'FULLBORDA ETT KORTSET', (p, r) => r && Cards.setProgress && Cards.setProgress(r.owned).some(x => x.active)],
  ['unlock', 'NYCKELBÄRAREN', 'ÖPPNA 5 LÅSTA DÖRRAR ELLER KISTOR', p => (p.unlocks || 0) >= 5, p => [p.unlocks || 0, 5]],
  ['lever', 'SPAKDRAGAREN', 'DRA I EN SPAK', p => (p.levers || 0) >= 1],
  ['wall', 'RIVAREN', 'SPRÄNG EN SPRUCKEN VÄGG', p => (p.walls || 0) >= 1],
  ['bounty', 'PRISJÄGAREN', 'DÖDA 5 MÄRKTA ELITER', p => (p.bounties || 0) >= 5, p => [p.bounties || 0, 5]],
  ['ghost', 'ANDEFRID', 'HJÄLP SPÖKET HITTA SINA BEN', p => (p.ghosts || 0) >= 1],
  ['classes', 'MÅNGSYSSLAREN', 'LÅS UPP ALLA KLASSER', p => Object.keys(CLASSES).every(c => !CLASSES[c].cost || (p.classes || []).includes(c))],
  ['k5000', 'DÖDENS HANDLANGARE', 'DÖDA 5000 FIENDER TOTALT', p => (p.kills || 0) >= 5000, p => [p.kills || 0, 5000]],
  ['deep3', 'AVGRUNDEN', 'NÅ VARV 3', p => p.bestDepth >= 13],
  ['nohit3', 'SKUGGAN', 'KLARA 3 VÅNINGAR UTAN SKADA I EN RUNDA', (p, r) => r && (r.untouched || 0) >= 3],
  ['souls', 'SJÄLASAMLAREN', 'HA 500 SJÄLAR SAMTIDIGT', p => p.souls >= 500],
  ['events', 'ÖDETS VÄDER', 'UPPLEV 5 VÅNINGSHÄNDELSER', p => (p.events || 0) >= 5, p => [p.events || 0, 5]],
  ['fortune', 'SPÅDD', 'BESÖK SPÅALTARET', p => (p.fortunes || 0) >= 1],
  ['mimic5', 'MIMICJÄGAREN', 'DÖDA 5 MIMICS', p => ((p.bestiary || {}).Q || 0) >= 5, p => [(p.bestiary || {}).Q || 0, 5]],
  ['sneak', 'LÖNNMÖRDAREN', 'GÖR 25 BAKHÅLL', p => (p.sneaks || 0) >= 25, p => [p.sneaks || 0, 25]],
  ['speed', 'SNABBAST', 'VINN PÅ UNDER 30 MINUTER', p => (p.fastestWin || 1e9) < 1800],
  // version 5
  ['frostboss', 'ISHJÄRTAT', 'BESEGRA ISDRAKEN', p => !!(p.bossWins || {}).frost],
  ['pet', 'FLOCKLEDAREN', 'FÅ EN FÖLJESLAGARE', p => (p.petsGot || 0) >= 1],
  ['petlv', 'TRÄNAREN', 'FÅ EN FÖLJESLAGARE TILL NIVÅ 5', () => petLv() >= 5],
  ['potion10', 'LÄRLINGEN', 'DRICK 10 DRYCKER', p => (p.potions_n || 0) >= 10, p => [p.potions_n || 0, 10]],
  ['potall', 'DRYCKESKÄNNAREN', 'LÄR DIG ALLA FEM DRYCKER', p => (p.potions || []).length >= 5, p => [(p.potions || []).length, 5]],
  ['blend', 'BLANDAREN', 'LÅT ALKEMISTEN BLANDA EN DRYCK', p => (p.blends || 0) >= 1],
  ['bless', 'VÄLSIGNAD', 'FÅ PRÄSTENS VÄLSIGNELSE', p => (p.blessings || 0) >= 1],
  ['curselift', 'RENAD', 'LÅT PRÄSTEN LYFTA EN FÖRBANNELSE', p => (p.cursesLifted || 0) >= 1],
  ['ally10', 'DE DÖDAS HÄR', 'FÅ 10 ALLIERADE', p => (p.allies || 0) >= 10, p => [p.allies || 0, 10]],
  ['fuse', 'SMÄLTDEGELN', 'SMÄLT SAMMAN TVÅ KORT', p => (p.fusions || 0) >= 1],
  ['head50', 'HUVUDJÄGAREN', 'GÖR 50 HUVUDTRÄFFAR', p => (p.headshots || 0) >= 50, p => [p.headshots || 0, 50]],
  ['frostfloor', 'VINTERVANDRAREN', 'KLARA EN VÅNING I FROSTFÄSTET', p => ((p.biomeFloors || {}).frost || 0) >= 1],
  ['hardchal', 'DEN SVÅRA VÄGEN', 'KLARA EN SVÅR UTMANING', p => (p.hardChallenges || 0) >= 1],
  ['routes', 'VÄGVÄLJAREN', 'VÄLJ DEN SVÅRA VÄGEN 3 GÅNGER', p => (p.hardRoutes || 0) >= 3, p => [p.hardRoutes || 0, 3]],
  ['axe100', 'BÄRSÄRKEN', 'DÖDA 100 FIENDER MED YXAN', p => ((p.wkills || {}).axe || 0) >= 100, p => [(p.wkills || {}).axe || 0, 100]],
  ['flame100', 'MORDBRÄNNAREN', 'DÖDA 100 FIENDER MED ELDKASTAREN', p => ((p.wkills || {}).flamer || 0) >= 100, p => [(p.wkills || {}).flamer || 0, 100]],
  ['onehit', 'ETT ENDA SLAG', 'NÅ VÅNING 3 I LÄGET ETT SLAG', p => ((p.cmodeBest || {}).onehit || 0) >= 3],
  ['pistolwin', 'BARA PISTOLEN', 'VINN I LÄGET BARA PISTOL', p => !!(p.cmodeWins || {}).pistol],
  ['nocards', 'UTAN KORT', 'NÅ VÅNING 4 I LÄGET INGA KORT', p => ((p.cmodeBest || {}).nocards || 0) >= 4],
  ['days7', 'DEN TROGNA', 'SPELA SJU OLIKA DAGAR', p => (p.days || []).length >= 7, p => [(p.days || []).length, 7]],
];
function checkAch() {
  profile.ach = profile.ach || [];
  if (run && run.practice) return; // inga prestationer i övningsläget
  for (const [id, name, text, test] of ACH) {
    if (profile.ach.includes(id)) continue;
    let ok = false; try { ok = !!test(profile, run); } catch (e) { ok = false; }
    if (!ok) continue;
    profile.ach.push(id); profile.souls += 10; saveProfile();
    if (state !== 'title') { say('PRESTATION: ' + name + ' (+10 SJÄLAR)', 3); play('gem', 0.8, 0.8); }
  }
}
function showNews() {
  CardUI.list('NYHETER', 'VERSION 5: 200 NYA FÖRBÄTTRINGAR', [
    { label: 'VERSION 5', head: true, color: '#9fe0ff' },
    { label: 'TRE NYA VAPEN', text: 'YXAN (LADDA, KASTA, BLOCKERA), ELDKASTAREN OCH GRANATKASTAREN – MED EGNA PAKTER' }, { label: 'FEM NYA FIENDER', text: 'GHOUL, KULTIST, GARGOYL, ISVARG OCH IRRBLOSS' },
    { label: 'FROSTFÄSTET', text: 'EN NY BIOM MED SNÖ, IS, KYLA OCH ISTAPPAR – OCH ISDRAKEN' }, { label: 'FÖLJESLAGARE', text: 'KORPEN, LYKTAN OCH VARGVALPEN. LÅS UPP DEM I SJÄLAALTARET' },
    { label: 'DRYCKER', text: 'H DRICKER, J BYTER. FEM SORTER, OKÄNDA TILLS DU SMAKAT' }, { label: 'NPC:ER', text: 'ALKEMISTEN, PRÄSTEN, DEN HEMLIGA HANDLAREN OCH VÄGVAL MELLAN TVÅ PORTALER' },
    { label: '30 NYA KORT', text: 'KORTFUSION, KORTSTATISTIK OCH TVÅ NYA KORTSET' }, { label: 'KÄNSLA', text: 'FÄRGAT LJUS, HUVUDTRÄFFAR, GLÖDANDE ÖGON OCH BLODSPÅR' },
    { label: 'MER', text: 'TVÅ NYA KLASSER, UTMANINGSLÄGEN, 20 PRESTATIONER, DÖDSRAPPORT OCH TILLGÄNGLIGHET' },
    { label: 'VERSION 4', head: true, color: '#ffd24a' },
    { label: 'RÖRELSE', text: 'HOPP, DUCKA, GLID, RUSNING OCH UTHÅLLIGHET' }, { label: 'GRANATER', text: 'F KASTAR, HÅLL FÖR LÄNGRE KAST' },
    { label: 'TRÄSKET', text: 'EN NY BIOM MED VATTEN, NÄT OCH SVAMPAR' }, { label: 'SJU NYA FIENDER', text: 'SPINDLAR, FLADDERMÖSS, HUNDAR, BOMBSKELETT, SKÖLDBÄRARE, SVAMPMÄN OCH LEVANDE RUSTNINGAR' },
    { label: 'BOSSAR', text: 'TVÅ NYA ANFALL PER BOSS, YRSEL, ILSKA OCH BOSSRUSH' }, { label: 'FÖREMÅL', text: 'SMEDJA, SPÅALTARE, FÅNGAR, UTMANINGAR, SPAKAR, NYCKLAR, FÄLLOR OCH SPRUCKNA VÄGGAR' },
    { label: '50 NYA KORT', text: 'OCH SEX KORTSET MED BONUSAR' }, { label: 'KLASSER', text: 'FEM KLASSER OCH UPPSTIGNING PÅ MARDRÖM' },
    { label: 'HANDKONTROLL', text: 'OCH TANGENTBYTE, GYRO, FÄRGBLINDLÄGEN OCH UNDERTEXTER' }], () => refreshTitle());
}
function showManual() {
  CardUI.list('HANDBOK', 'SÅ FUNGERAR KRYPTA', [
    { label: 'MÅLET', head: true, color: '#ffd24a' }, { label: 'RUNDAN', text: 'FEM VÅNINGAR OCH EN BOSS PER VARV. PORTALEN ÖPPNAS NÄR ELITERNA, VÄKTAREN ELLER ALLA FIENDER ÄR DÖDA.' },
    { label: 'DÖDEN', text: 'DÖDEN AVSLUTAR RUNDAN. SJÄLARNA DU SAMLAT LÅSER UPP KORT, KLASSER OCH UPPGRADERINGAR.' },
    { label: 'KONTROLLER', head: true, color: '#ffd24a' }, { label: 'TANGENTBORD', text: 'WASD GÅ · MUS SIKTA · SPACE HOPPA · CTRL DUCKA · SHIFT SPRING · Z RUSA · E ANVÄND · R LADDA OM · F GRANAT · V SPARK · Q FÖRRA VAPNET' },
    { label: 'HANDKONTROLL', text: 'VÄNSTER SPAK GÅ · HÖGER SPAK SIKTA · RT SKJUT · LT SIKTA · A HOPPA · B DUCKA · X ANVÄND · Y BYT VAPEN · LB RUSA · RB GRANAT · UPP LADDA OM · START PAUS' },
    { label: 'STATUS', head: true, color: '#ffd24a' }, { label: 'BRAND', text: 'SKADAR ÖVER TID. BRÄNNER NÄT. BRÄNDA FIENDER BLIR ASKA.' }, { label: 'GIFT', text: 'SKADAR ÖVER TID OCH SPRIDS IBLAND.' },
    { label: 'FRYSNING', text: 'FIENDEN STÅR STILL OCH SPLITTRAS OM DEN DÖR.' }, { label: 'BLIXT', text: 'HOPPAR TILL EN FIENDE I NÄRHETEN.' },
    { label: 'VÄRLDEN', head: true, color: '#ffd24a' }, { label: 'LAVA', text: 'BRÄNNER – HOPPA ÖVER.' }, { label: 'VATTEN OCH NÄT', text: 'SAKTAR NED. NÄT BRINNER.' }, { label: 'IS', text: 'HALT.' },
    { label: 'NYCKLAR', text: 'ÖPPNAR LÅSTA DÖRRAR OCH KISTOR.' }, { label: 'SPAKAR', text: 'ÖPPNAR JÄRNGALLER NÅGONSTANS PÅ VÅNINGEN.' }, { label: 'SPRUCKNA VÄGGAR', text: 'SPRÄNG DEM MED GRANATER ELLER KRUTFAT.' },
    { label: 'SMEDJAN', text: 'GER VAPNET +12 % SKADA PER NIVÅ.' }, { label: 'UTMANINGEN', text: 'TRE VÅGOR – BELÖNING: KISTA, GULD OCH KORT.' }], () => refreshTitle());
}
function showCodex() { const sets = s => new Set(s || []); CardUI.codex(Cards.ALL.filter(c => !c.weapon), { seen: sets(profile.cardsSeen), owned: sets(run ? run.owned : []), unlocked: new Set(Cards.ALL.filter(c => !c.unlock || profile.unlocked.includes(c.id)).map(c => c.id)), picks: profile.cardPicks || {} }, () => refreshTitle()); }
function showAchievements() {
  const got = profile.ach || [];
  CardUI.list('PRESTATIONER', `${got.length} AV ${ACH.length} · VARJE GER 10 SJÄLAR`, ACH.map(([id, name, text, , prog]) => { const pr = prog && !got.includes(id) ? prog(profile) : null; // framsteg för räknande prestationer
    return { label: (got.includes(id) ? '★ ' : '☆ ') + name, text: text + (pr ? ` (${Math.min(pr[0], pr[1])}/${pr[1]})` : ''), color: got.includes(id) ? '#ffd24a' : '', dim: !got.includes(id) }; }), () => refreshTitle());
}
function enemyIcon(t, dark) { // första bilden i fiendens stillastående animation
  try { const f = enemyFrames[t] && enemyFrames[t].idle[0]; if (!f) return null; const c = document.createElement('canvas'); c.width = f.w; c.height = f.h; const g = c.getContext('2d'), im = g.createImageData(f.w, f.h);
    new Uint32Array(im.data.buffer).set(dark ? f.data.map(v => v >>> 24 ? 0xff201810 : 0) : f.data); g.putImageData(im, 0, 0); return c.toDataURL(); } catch (e) { return null; }
}
function showBestiary() {
  const b = profile.bestiary || {};
  const by = profile.deathsBy || {};
  const rows = Object.entries(ENEMY_DEFS).map(([t, d]) => b[t] ? { img: enemyIcon(t), label: d.name, text: `DÖDADE ${b[t]}${by[d.name] ? ` · DÖDADE DIG ${by[d.name]}` : ''} · HP ${d.hp} · SKADA ${d.dmg} · FART ${d.speed}` + (d.tip ? ' · ' + d.tip : '') } : { img: enemyIcon(t, true), label: '???', text: 'INTE MÖTT ÄNNU', dim: true });
  for (const [id, bd] of Object.entries(BOSSES)) { const n = (profile.bossWins || {})[id] || 0; rows.push(n ? { label: bd.title || bd.name, text: `BESEGRAD ${n} GÅNG${n > 1 ? 'ER' : ''}`, color: '#ff8a5a' } : { label: '??? (BOSS)', text: 'INTE BESEGRAD', dim: true }); }
  CardUI.list('BESTIARIUM', `${Object.keys(b).length} AV ${Object.keys(ENEMY_DEFS).length} FIENDER`, rows, () => refreshTitle());
}
function showProfile() {
  const h = profile.history || [], fmtT = t => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`;
  const fav = Object.entries(profile.wkills || {}).sort((a, b) => b[1] - a[1])[0];
  const rows = [
    { label: 'RUNDOR', text: `${profile.runs} (${profile.wins} SEGRAR)` },
    { label: 'DÖDADE FIENDER', text: String(profile.kills || 0) },
    { label: 'SPELTID', text: fmtT(profile.time || 0) },
    { label: 'BÄSTA VÅNING', text: String(profile.bestDepth) },
    { label: 'FAVORITVAPEN', text: fav ? `${(WEAPONS.find(w => w.id === fav[0]) || {}).name || fav[0]} (${fav[1]})` : '–' },
    { label: 'PRESTATIONER', text: `${(profile.ach || []).length} AV ${ACH.length}` },
    { label: 'SNABBASTE SEGER', text: profile.fastestWin ? fmtT(profile.fastestWin) : '–' },
    { label: 'UPPSTIGNING', text: `HÖGSTA ${profile.ascMax || 0}` },
    { label: 'TOTAL SKADA', text: String(profile.totalDmg || 0) }, { label: 'LÄNGSTA KOMBO', text: String(profile.bestCombo || 0) },
    { label: 'FLEST PÅ EN VÅNING', text: String(profile.bestFloorKills || 0) }, { label: 'FLEST I EN RUNDA', text: String(profile.bestRunKills || 0) },
    { label: 'HUVUDTRÄFFAR', text: String(profile.headshots || 0) }, { label: 'DRYCKER', text: `${profile.potions_n || 0} DRUCKNA · ${(profile.potions || []).length} AV 5 KÄNDA` },
    { label: 'PER VAPEN', head: true, color: '#ffd24a' }, ...Object.entries(profile.wkills || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: (WEAPONS.find(w => w.id === k) || {}).name || k, text: `${v} DÖDADE` })),
    { label: 'PER BIOM', head: true, color: '#ffd24a' }, ...Object.entries(profile.biomeFloors || {}).map(([k, v]) => ({ label: BIOME_NAME[k] || k, text: `${v} VÅNINGAR KLARADE` })),
    { label: 'BOSSREKORD', head: true, color: '#ffd24a' }, ...Object.entries(profile.bossTimes || {}).map(([k, v]) => ({ label: (BOSSES[k] || {}).name || k, text: 'BÄSTA TID ' + fmtT(v) })),
    ...(store.get('errors', []).length ? [{ label: 'SENASTE FEL (SKICKA GÄRNA EN SKÄRMBILD)', head: true, color: '#ff7060' }, ...store.get('errors', []).slice(0, 3).map(e => ({ label: e.msg.toUpperCase().slice(0, 60), text: `${new Date(e.t).toLocaleString('sv-SE')} · VÅNING ${e.depth ?? '?'} · ${(e.stack || '').slice(0, 160)}`, dim: true })),
      { label: 'KOPIERA FELRAPPORTEN', text: 'KLICKA FÖR ATT KOPIERA ALLA FEL TILL URKLIPP', color: '#ffb080', onClick: () => { try { navigator.clipboard.writeText(JSON.stringify({ version: 5, ua: navigator.userAgent, errors: store.get('errors', []) }, null, 1)); CardUI.toast && CardUI.toast(null, 'FELRAPPORTEN ÄR KOPIERAD'); } catch (e) { /* inget urklipp */ } } }] : []),
    { label: 'DAGENS RUNDA – TOPPLISTA', head: true, color: '#ffd24a' }, ...(profile.dailyTop || []).slice(0, 5).map((d, i) => ({ label: `${i + 1}. ${d.score} P`, text: `${d.d} · VÅNING ${d.depth}` })),
    { label: 'TOPP 5', head: true, color: '#ffd24a' },
    ...h.slice().sort((a, b) => b.score - a.score).slice(0, 5).map((r, i) => ({ label: `${i + 1}. ${r.score} P`, text: `VÅNING ${r.depth} · ${r.kills} DÖDADE · FRÖ ${r.seed}${r.win ? ' · SEGER' : ''}` })),
    { label: 'SENASTE RUNDOR', head: true, color: '#ffd24a' },
    ...h.slice(0, 8).map(r => ({ label: `${r.win ? 'SEGER' : r.cause === 'GAV UPP' ? 'GAV UPP' : 'DOG'} VÅNING ${r.depth}`, text: [BIOME_NAME[r.biome] || '', r.cause && r.cause !== 'GAV UPP' ? 'DÖDAD AV ' + r.cause : '', r.daily ? 'DAGENS' : '', DIFF[r.diff ?? 1] ? DIFF[r.diff ?? 1].name : ''].filter(Boolean).join(' · '), dim: !r.win })),
  ];
  CardUI.list('PROFIL', '', rows, () => refreshTitle());
}
const DIFF = [
  { name: 'LÄTT', dmg: 0.55, hp: 0.8, ammo: 1.4, speed: 0.9, souls: 0.7 },
  { name: 'NORMAL', dmg: 1, hp: 1, ammo: 1, speed: 1, souls: 1 },
  { name: 'SVÅR', dmg: 1.45, hp: 1.3, ammo: 0.75, speed: 1.12, souls: 1.5 },
  { name: 'MARDRÖM', dmg: 1.9, hp: 1.6, ammo: 0.6, speed: 1.22, souls: 2.2 },
];
const diff = () => DIFF[settings.diff];

// ---------- Asset-laddning ----------
const A = 'assets/';
let loadN = 0; // laddningsförlopp
const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => { loadN++; res(i); }; i.onerror = () => { loadN++; rej(new Error('saknas: ' + src)); }; i.src = src; });
const sndCache = {}; // ljudfilerna hämtas i bakgrunden medan du är på startskärmen
function prefetchSounds() { for (const n of SOUNDS) if (!sndCache[n]) sndCache[n] = fetch(`${A}snd/${n}.ogg`).then(r => r.ok ? r.arrayBuffer() : null).catch(() => null); }
function pixels(img, w = img.width, h = img.height, sx = 0, sy = 0, sw = w, sh = h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  return { w, h, data: new Uint32Array(g.getImageData(0, 0, w, h).data.buffer) };
}
const strip = (img, n, scale = 1) => { const fw = Math.floor(img.width / n); return [...Array(n)].map((_, i) => pixels(img, Math.round(fw * scale), Math.round(img.height * scale), i * fw, 0, fw, img.height)); };
const grid = (img, fw, fh, cols, rows) => { const out = []; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push(pixels(img, fw, fh, c * fw, r * fh, fw, fh)); return out; };
const tex = {}, spr = {}, fx = {}, snd = {}, enemyFrames = {}, wimg = {}, bossFx = {};
const ENEMY_DEFS = {
  Q: { name: 'MIMIC', sheet: 'mimic', move: 'movement', hp: 12, speed: 1.9, melee: true, dmg: 15, range: 0.95, cd: 0.85, size: 0.95, growl: 'growl', score: 300, atkFps: 14, hitAt: 0.5, tip: 'KISTAN HADE TÄNDER' },
  U: { name: 'SPINDEL', sheet: 'spider', fw: 64, move: 'movement', hp: 6, speed: 2.2, melee: true, dmg: 8, range: 0.95, cd: 0.9, size: 1.2, growl: 'spider', score: 150, atkFps: 14, hitAt: 0.5, ai: 'spider', tip: 'SPOTTAR NÄT SOM SAKTAR NED' },
  X: { name: 'FLADDERMUS', sheet: 'bat', move: 'movement', hp: 2, speed: 3.4, melee: true, dmg: 5, range: 0.8, cd: 0.8, size: 0.7, growl: 'bat', score: 60, atkFps: 16, hitAt: 0.5, ai: 'fly', tip: 'FLYGER I FLOCK – SNABB MEN SKÖR' },
  Y: { name: 'HELVETESHUND', sheet: 'hound', fw: 64, move: 'movement', hp: 7, speed: 2.8, melee: true, dmg: 10, range: 0.95, cd: 0.9, size: 1.3, growl: 'hound', score: 180, atkFps: 14, hitAt: 0.5, ai: 'leap', tip: 'HOPPAR PÅ DIG – TRÄFFA DEN I SPRÅNGET' },
  '!': { name: 'BOMBSKELETT', sheet: 'bomber', fw: 64, move: 'movement', hp: 5, speed: 2.4, melee: true, dmg: 0, range: 1.2, cd: 1, size: 1.0, growl: 'fuse', score: 160, atkFps: 12, hitAt: 0.9, ai: 'bomb', tip: 'SPRÄNGER SIG SJÄLV – SKJUT PÅ AVSTÅND' },
  '@': { name: 'SKÖLDBÄRARE', sheet: 'shieldman', fw: 64, move: 'movement', hp: 10, speed: 1.2, melee: true, dmg: 12, range: 1.05, cd: 1.1, size: 1.05, growl: 'growl', score: 220, atkFps: 12, hitAt: 0.5, ai: 'shield', tip: 'SKÖLDEN STOPPAR SKOTT – GÅ RUNT ELLER SPRÄNG' },
  '^': { name: 'SVAMPMAN', sheet: 'shroom', fw: 64, move: 'movement', hp: 8, speed: 0.7, melee: false, dmg: 4, range: 4, cd: 3.5, size: 1.1, growl: 'spore', score: 140, atkFps: 12, hitAt: 0.5, ai: 'spore', tip: 'SLÄPPER GIFTMOLN' },
  '+': { name: 'LEVANDE RUSTNING', sheet: 'livearmor', fw: 64, move: 'movement', hp: 16, speed: 1.1, melee: true, dmg: 15, range: 1.05, cd: 1.2, size: 1.1, growl: 'shield_block', score: 260, atkFps: 12, hitAt: 0.55, armor: 2, tip: 'RUSTNINGEN VAKNAR NÄR DU KOMMER NÄRA' },
  'Å': { name: 'GHOUL', sheet: 'ghoul', move: 'movement', hp: 6, speed: 2.5, melee: true, dmg: 9, range: 0.95, cd: 0.8, size: 1.05, growl: 'ghoul', score: 160, atkFps: 14, hitAt: 0.5, ai: 'ghoul', tip: 'ÄTER LIK FÖR ATT LÄKA' },
  'Ä': { name: 'KULTIST', sheet: 'cultist', move: 'movement', hp: 7, speed: 1.0, melee: false, dmg: 6, range: 8, cd: 2.6, size: 1.05, growl: 'cultist', score: 220, atkFps: 10, hitAt: 0.6, ai: 'cultist', proj: 'orb', kite: 4, tip: 'FÖRBANNAR DIG OCH STÄRKER ANDRA' },
  'Ö': { name: 'GARGOYL', sheet: 'gargoyle', move: 'movement', hp: 14, speed: 2.0, melee: true, dmg: 13, range: 1.0, cd: 1.0, size: 1.15, growl: 'gargoyle', score: 260, atkFps: 12, hitAt: 0.5, ai: 'fly', stone: true, tip: 'STEN: KULOR BITER DÅLIGT, SPRÄNG DEN' },
  'É': { name: 'ISVARG', sheet: 'icewolf', move: 'movement', hp: 6, speed: 2.9, melee: true, dmg: 9, range: 0.95, cd: 0.85, size: 1.35, growl: 'icewolf', score: 170, atkFps: 14, hitAt: 0.5, ai: 'leap', frostBite: true, tip: 'BETTET SAKTAR NED – JAGAR I FLOCK' },
  'Ñ': { name: 'NEKROMANT', sheet: 'necromancer', move: 'movement', hp: 8, speed: 1.0, melee: false, dmg: 7, range: 8, cd: 2.4, size: 1.05, growl: 'necromancer', score: 300, atkFps: 10, hitAt: 0.6, ai: 'necro', proj: 'skull', kite: 5, tip: 'VÄCKER DE DÖDA – DÖDA HONOM FÖRST' },
  'Æ': { name: 'ELDELEMENTAL', sheet: 'fireelemental', move: 'movement', hp: 7, speed: 1.6, melee: false, dmg: 8, range: 7, cd: 2.0, size: 1.1, growl: 'fire_elemental', score: 200, atkFps: 12, hitAt: 0.5, ai: 'elemental', proj: 'fire', kite: 2.5, fireproof: true, tip: 'DELAR SIG I FLAMMOR NÄR DEN DÖR' },
  'Þ': { name: 'LAVAMASK', sheet: 'lavaworm', move: 'movement', hp: 10, speed: 2.4, melee: true, dmg: 12, range: 1.1, cd: 1.2, size: 1.3, growl: 'lavaworm', score: 260, atkFps: 12, hitAt: 0.5, ai: 'worm', fireproof: true, tip: 'GRÄVER SIG UNDER DIG – FLYTTA DIG NÄR MARKEN GLÖDER' },
  'Ð': { name: 'DÖDSRIDDARE', sheet: 'deathknight', move: 'movement', hp: 22, speed: 1.1, melee: true, dmg: 15, range: 1.1, cd: 1.3, size: 1.25, growl: 'deathknight', score: 450, atkFps: 10, hitAt: 0.55, ai: 'knight', armor: 0.4, tip: 'SKÖLDEN SKYDDAR FRAMIFRÅN – ANFALL BAKIFRÅN' },
  'Ý': { name: 'BANSHEE', sheet: 'banshee', move: 'movement', hp: 6, speed: 1.6, melee: true, dmg: 7, range: 1.0, cd: 1.1, size: 1.1, growl: 'banshee', score: 230, atkFps: 10, hitAt: 0.5, ai: 'banshee', tip: 'SKRIKET SAKTAR NED OCH FÖRVIRRAR' },
  'Ü': { name: 'IRRBLOSS', sheet: 'wisp', move: 'movement', hp: 3, speed: 2.2, melee: true, dmg: 0, range: 1.0, cd: 1, size: 0.8, growl: 'wisp', score: 120, atkFps: 12, hitAt: 0.5, ai: 'wisp', tip: 'SPRÄNGS I FROST – HÅLL AVSTÅND' },
  S: { name: 'SKELETT', sheet: 'skeleton1', move: 'movement', hp: 5, speed: 1.35, melee: true, dmg: 9, range: 0.95, cd: 0.9, size: 1.0, growl: 'growl', score: 100, atkFps: 14, hitAt: 0.55 },
  K: { name: 'ELDSKELETT', sheet: 'skeleton2', move: 'movemen', hp: 6, speed: 0.95, melee: false, dmg: 8, range: 8.5, cd: 1.8, size: 1.05, growl: 'hiss', score: 150, atkFps: 12, hitAt: 0.5 },
  V: { name: 'VAMPYR', sheet: 'vampire', move: 'movement', hp: 9, speed: 2.15, melee: true, dmg: 14, range: 0.95, cd: 0.75, size: 1.1, growl: 'roar', score: 250, atkFps: 16, hitAt: 0.5 },
  // nya fiender med eget beteende (ai), 64-pixelsrutor från tools/enemy-sprites/prep.py
  I: { name: 'SMÅDJÄVUL', sheet: 'imp', fw: 64, move: 'movement', hp: 4, speed: 2.5, melee: true, dmg: 8, range: 0.9, cd: 0.7, size: 1.35, growl: 'hiss', score: 150, atkFps: 14, hitAt: 0.5, ai: 'blink', tip: 'HOPPAR UNDAN VID TRÄFF' },
  L: { name: 'BLODSLEM', sheet: 'blob', fw: 64, move: 'movement', hp: 10, speed: 0.75, melee: true, dmg: 11, range: 0.95, cd: 1.1, size: 1.6, growl: 'growl', score: 150, atkFps: 12, hitAt: 0.55, ai: 'split', tip: 'DELAR SIG NÄR DEN DÖR' },
  l: { name: 'BLODDROPPE', frames: 'L', hp: 2.5, speed: 1.8, melee: true, dmg: 5, range: 0.8, cd: 0.8, size: 0.95, growl: 'growl', score: 40, atkFps: 14, hitAt: 0.5 },
  N: { name: 'BENMAGIKER', sheet: 'mage', fw: 64, move: 'movement', hp: 7, speed: 0.9, melee: false, dmg: 10, range: 9, cd: 2.4, size: 1.0, growl: 'hiss', score: 300, atkFps: 12, hitAt: 0.75, ai: 'summon', proj: 'orb', kite: 3.5, tip: 'VÄCKER DE DÖDA' },
  O: { name: 'ORKSHAMAN', sheet: 'shaman', fw: 64, move: 'movement', hp: 6, speed: 1.15, melee: false, dmg: 6, range: 7, cd: 2.0, size: 1.0, growl: 'growl', score: 300, atkFps: 12, hitAt: 0.75, ai: 'heal', proj: 'bolt', kite: 4, tip: 'HELAR – DÖDA DEN FÖRST' },
  R: { name: 'GRAVRÖVARE', sheet: 'rogue', fw: 64, move: 'movement', hp: 6, speed: 2.3, melee: true, dmg: 12, range: 0.95, cd: 0.8, size: 1.0, growl: 'hiss', score: 250, atkFps: 16, hitAt: 0.5, ai: 'stealth', tip: 'OSYNLIG PÅ AVSTÅND' },
  W: { name: 'ORKKRIGARE', sheet: 'warrior', fw: 64, move: 'movement', hp: 16, speed: 1.05, melee: true, dmg: 16, range: 1.05, cd: 1.2, size: 1.1, growl: 'roar', score: 350, atkFps: 12, hitAt: 0.5, ai: 'charge', armor: 0.6, tip: 'STORMAR – LÅT DEN KROCKA' },
};
// Bossar: en per varv i slumpad ordning. arena = vilken bossarena gen.js bygger.
const BOSSES = {
  demon: { title: 'HERRE ÖVER BENHUSEN', name: 'BENDEMONEN', hp: 320, speed: 1.0, size: 2.6, dmg: 22, range: 3.2, arena: 'hall', phaseMsg: ['BENDEMONEN KALLAR PÅ DE DÖDA', 'BENDEMONEN RASAR!'] },
  beast: { title: 'GLÖDENS FÖRSTFÖDDE', name: 'HELVETESBESTEN', hp: 300, speed: 0.6, size: 2.5, dmg: 16, range: 2.5, arena: 'cave', phaseMsg: ['BESTEN SJUNKER NED I GLÖDEN', 'MARKEN BRINNER!'] },
  nightmare: { title: 'DEN SVARTA RIDTEN', name: 'MARDRÖMMEN', hp: 280, speed: 2.0, size: 2.3, dmg: 24, range: 1.6, arena: 'graveyard', phaseMsg: ['MARDRÖMMEN STEGRAR SIG', 'MARDRÖMMEN SKENAR!'] },
  ogre: { title: 'SKOGENS SLAKTARE', name: 'OGERN', hp: 420, speed: 1.3, size: 2.6, dmg: 26, range: 3.0, arena: 'forest', phaseMsg: ['OGERN KALLAR PÅ SINA SÖNER', 'OGERN BLIR RASANDE!'] },
  frost: { title: 'VINTERNS HJÄRTA', name: 'ISDRAKEN', hp: 330, speed: 1.0, size: 2.4, dmg: 18, range: 2.2, arena: 'frost', phaseMsg: ['ISDRAKEN KALLAR PÅ STORMEN', 'ISDRAKEN BLIR KALLARE ÄN DÖDEN!'] },
  flame: { title: 'VULKANENS HJÄRTA', name: 'ELDKUNGEN', hp: 360, speed: 1.05, size: 2.5, dmg: 19, range: 2.3, arena: 'volcano', phaseMsg: ['ELDKUNGEN TÄNDER MARKEN', 'ELDKUNGEN RASAR – ALLT BRINNER!'] },
  ghost: { title: 'DEN SOM ALDRIG SOVER', name: 'VÅLNADEN', hp: 260, speed: 1.6, size: 2.3, dmg: 14, range: 1.4, arena: 'swamp', phaseMsg: ['VÅLNADEN VÄCKER DE DÖDA', 'VÅLNADENS SKRIK FYLLER LUFTEN!'] },
};
const BOSS_IDS = Object.keys(BOSSES);
// föremål i rummen: bild (prop_<img>.png), antal rutor, höjd, blockerar, ljus, hur de används
const PROP_DEFS = {
  c: { img: 'candles', n: 3, size: 0.78, anim: 7, light: 0.75 },
  j: { img: 'bones', size: 0.22 },
  k: { img: 'coffin', size: 0.38, block: true },
  q: { img: 'bookshelf', size: 1.0, block: true, use: 'shelf' },
  u: { img: 'statue', size: 1.05, block: true },
  v: { img: 'cage', size: 0.95, block: true },
  w: { img: 'well', n: 2, size: 0.62, block: true, light: 0.55, use: 'well' },
  y: { img: 'altar', n: 2, size: 0.65, block: true, light: 0.55, use: 'altar' },
  e: { img: 'barrel_red', size: 0.55, block: true, boom: true },
  H: { img: 'armor', size: 0.95, block: true },
  J: { img: 'table', size: 0.5, block: true },
  T: { img: 'crate', size: 0.42, block: true, crate: true },
  z: { img: 'spikes', n: 2, size: 0.18, trap: true },
  i: { img: 'crystal', n: 2, size: 0.5, anim: 1.5, light: 0.7 },
  F: { img: 'mushroom', n: 2, size: 0.38, anim: 1.2, light: 0.45 },
  '(': { img: 'anvil', size: 0.42, block: true, use: 'anvil', fb: 'table' },
  ')': { img: 'fortune', n: 2, size: 0.62, block: true, use: 'fortune', light: 0.5, fb: 'altar' },
  '[': { img: 'prisoner', n: 2, size: 0.95, block: true, use: 'prisoner', fb: 'cage' },
  '?': { img: 'challenge', n: 2, size: 0.7, block: true, use: 'challenge', light: 0.7, fb: 'altar' },
  ';': { img: 'bowl', n: 2, size: 0.42, block: true, use: 'bowl', fb: 'well' },
  '/': { img: 'lever', n: 2, size: 0.5, block: true, use: 'lever', fb: 'statue' },
  '<': { img: 'arrowplate', n: 2, size: 0.1, trap: 'arrow' },
  '>': { img: 'gasvent', n: 2, size: 0.12, trap: 'gas' },
  '"': { img: 'web', size: 0.85, web: true },
  '£': { img: 'npc_alchemist', src: 'npc_alchemist', n: 4, anim: 5, size: 0.95, block: true, use: 'alchemist', fb: 'prisoner', npc: true },
  '€': { img: 'npc_priest', src: 'npc_priest', n: 4, anim: 4, size: 0.95, block: true, use: 'priest', fb: 'prisoner', npc: true },
  '©': { img: 'petcage', n: 2, size: 0.8, block: true, use: 'petcage', fb: 'cage' },
  // version 6: fällor och fat
  '°': { img: 'firejet', n: 2, size: 0.3, trap: 'fire', fb: 'gasvent' },
  '±': { img: 'pendulum', size: 1.0, trap: 'pendulum', fb: 'statue' },
  '¨': { img: 'pressureplate', n: 2, size: 0.08, trap: 'plate', fb: 'arrowplate' },
  'µ': { img: 'barrel_poison', size: 0.55, block: true, boom: 'poison', fb: 'barrel_red' },
  'ß': { img: 'barrel_frost', size: 0.55, block: true, boom: 'frost', fb: 'barrel_red' },
  '¶': { img: 'campfire', n: 4, anim: 9, size: 0.6, block: true, use: 'camp', light: 1.0, fb: 'candles' },
  '®': { img: 'questboard', size: 0.95, block: true, use: 'quests', fb: 'bookshelf' },
  '÷': { img: 'stairs', size: 0.8, block: true, use: 'stairs', light: 0.4, fb: 'well' },
};
const bossFor = depth => run && run.practice && run.practice.boss ? run.practice.boss : BOSSES[params.get('boss')] ? params.get('boss') : RNG(run.seed).fork('bossar').shuffle(BOSS_IDS.slice())[cycleOf(depth) % BOSS_IDS.length]; // ?boss=id för test
const ELITE_MODS = [
  { id: 'fast', name: 'SNABB', tint: [120, 220, 255] },
  { id: 'tough', name: 'SEG', tint: [180, 180, 180] },
  { id: 'vamp', name: 'BLODTÖRSTIG', tint: [255, 60, 60] },
  { id: 'explosive', name: 'EXPLOSIV', tint: [255, 170, 40] },
  { id: 'brute', name: 'BRUTAL', tint: [200, 90, 255] },
  { id: 'teleport', name: 'SPRÅNGANDE', tint: [255, 120, 220] },
  { id: 'regen', name: 'SEGLIVAD', tint: [110, 255, 140] },
  { id: 'shielded', name: 'SKÖLDAD', tint: [140, 190, 255] },
  { id: 'splitter', name: 'DELANDE', tint: [255, 200, 120] },
  { id: 'venom', name: 'GIFTIG', tint: [150, 255, 80] },
  { id: 'frost', name: 'ISKALL', tint: [170, 230, 255] },
  { id: 'flicker', name: 'FLIMRANDE', tint: [220, 200, 255] },
  { id: 'mirror', name: 'SPEGLANDE', tint: [200, 230, 255] },
  { id: 'caller', name: 'KALLANDE', tint: [255, 230, 150] },
  { id: 'stalker', name: 'SMYGANDE', tint: [150, 150, 170] },
  { id: 'burning', name: 'BRINNANDE', tint: [255, 120, 40] },
  { id: 'magnet', name: 'MAGNETISK', tint: [150, 120, 255] },
  { id: 'undying', name: 'ODÖDLIG', tint: [200, 255, 200] },
];
const NEW_ENEMIES = ['U', 'X', 'Y', '!', '@', '^', '+', 'Å', 'Ä', 'Ö', 'É', 'Ü', 'Ñ', 'Æ', 'Þ', 'Ð', 'Ý'];
async function loadEnemySheet(k, d) {
  const sets = {};
  for (const [st, file] of [['idle', 'idle'], ['move', d.move], ['attack', 'attack'], ['pain', 'take_damage'], ['death', 'death']]) { const img = await load(`${A}gfx/enemies-${d.sheet}_${file}.png`); sets[st] = strip(img, Math.max(1, Math.round(img.width / (d.fw || img.height)))); } // kvadratiska rutor
  enemyFrames[k] = sets;
}
const BOSS_FW = { flame: 0 }; // bossrutornas bredd när de inte är kvadratiska
async function loadAll(setStatus) {
  const walls = ['wall_brick_stone_center', 'wall_brick_small_stone', 'wall_rock', 'wall_stone', 'wall_brick_stone_center_banner', 'door_metal_gate', 'door_wood',
    'wall_forest', 'wall_cemetery', 'wall_cave', 'wall_house', 'wall_house_window', ...BOSS_IDS.map(b => 'wall_boss_' + b), 'wall_swamp', 'wall_cracked', 'door_locked', 'wall_frost', 'wall_ice_crystal', 'wall_obsidian', 'wall_boss_volcano'];
  const floors = ['floor_stone', 'floor_stone_pattern', 'floor_wood_planks', 'floor_tiles_blue',
    'floor_ground_grass', 'floor_ground_dirt', 'floor_grass_dead', 'floor_gravel', 'floor_cave', 'floor_mud', 'ceil_cave', ...BOSS_IDS.map(b => 'floor_boss_' + b), 'floor_swamp', 'floor_water', 'floor_water2', 'floor_lava', 'floor_lava2', 'floor_ice', 'floor_snow', 'floor_frost_stone', 'floor_ash', 'floor_basalt', 'floor_pit', 'floor_crack', 'floor_boss_volcano'];
  const OPTIONAL = /_boss_|swamp|water|lava|ice|cracked|locked|frost|snow|obsidian|ash|basalt|pit|crack/;
  for (const n of walls.concat(floors)) { try { tex[n] = pixels(await load(A + 'wall/' + n + '.png')); } catch (e) { if (!OPTIONAL.test(n)) throw e; } }
  tex.wall_swamp = tex.wall_swamp || tex.wall_forest; tex.wall_cracked = tex.wall_cracked || tex.wall_brick_stone_center; tex.door_locked = tex.door_locked || tex.door_wood;
  tex.floor_swamp = tex.floor_swamp || tex.floor_mud; tex.floor_water = tex.floor_water || tex.floor_tiles_blue; tex.floor_water2 = tex.floor_water2 || tex.floor_water;
  tex.wall_frost = tex.wall_frost || tex.wall_stone; tex.floor_snow = tex.floor_snow || tex.floor_tiles_blue; tex.floor_frost_stone = tex.floor_frost_stone || tex.floor_stone;
  tex.wall_obsidian = tex.wall_obsidian || tex.wall_rock; tex.wall_boss_volcano = tex.wall_boss_volcano || tex.wall_boss_beast || tex.wall_obsidian;
  tex.floor_ash = tex.floor_ash || tex.floor_gravel; tex.floor_basalt = tex.floor_basalt || tex.floor_cave || tex.floor_stone; tex.floor_boss_volcano = tex.floor_boss_volcano || tex.floor_boss_beast || tex.floor_basalt;
  tex.floor_pit = tex.floor_pit || tex.floor_mud; tex.floor_crack = tex.floor_crack || tex.floor_stone;
  tex.wall_boss_frost = tex.wall_boss_frost || tex.wall_frost; tex.floor_boss_frost = tex.floor_boss_frost || tex.floor_snow;
  tex.floor_lava = tex.floor_lava || tex.floor_stone; tex.floor_lava2 = tex.floor_lava2 || tex.floor_lava; tex.floor_ice = tex.floor_ice || tex.floor_tiles_blue;
  setStatus('Laddar fiender…');
  for (const [k, d] of Object.entries(ENEMY_DEFS)) {
    if (d.frames) { enemyFrames[k] = enemyFrames[d.frames]; continue; }
    if (NEW_ENEMIES.includes(k)) { try { await loadEnemySheet(k, d); } catch (e) { d.size = 1; d.fw = 32; } continue; } // nya fiender är valfria
    const sets = {};
    for (const [st, file] of [['idle', 'idle'], ['move', d.move], ['attack', 'attack'], ['pain', 'take_damage'], ['death', 'death']]) {
      const img = await load(`${A}gfx/enemies-${d.sheet}_${file}.png`);
      sets[st] = strip(img, Math.floor(img.width / (d.fw || 32)));
    }
    enemyFrames[k] = sets;
  }
  for (const k of NEW_ENEMIES) if (!enemyFrames[k]) enemyFrames[k] = enemyFrames.S; // saknas bilderna: skelettets bilder
  // bossen: vingad demon (Gothicvania, CC0), förminskad för snabbare sprite-ritning
  enemyFrames.B = {
    idle: strip(await load(A + 'gfx/boss_idle.png'), 6, 0.5),
    attack: strip(await load(A + 'gfx/boss_attack.png'), 18, 0.5),
    breath: strip(await load(A + 'gfx/boss_breath.png'), 18, 0.5),
  };
  // de andra bossarna (tools/boss-sprites/prep.py): [animation, antal rutor]
  const BOSS_SHEETS = { beast: [['idle', 6], ['breath', 4], ['burn', 4], ['pillar', 2]], nightmare: [['idle', 4], ['run', 3]],
    ogre: [['idle', 4], ['walk', 6], ['attack', 7]], ghost: [['idle', 7], ['chase', 4], ['shriek', 4], ['vanish', 7], ['appear', 6]] };
  bossFx.frost = {}; // isdraken: valfria bilder, 124 px breda rutor
  for (const a of ['idle', 'attack', 'cast', 'hurt', 'death']) { try { const img = await load(`${A}gfx/boss_frost_${a}.png`); bossFx.frost[a] = strip(img, Math.max(1, Math.round(img.width / (img.height === 59 ? 124 : img.height)))); } catch (e) { /* saknas */ } }
  bossFx.flame = {}; // eldkungen: valfria bilder (rutornas bredd = bildens höjd om inget annat anges)
  for (const a of ['idle', 'attack', 'cast', 'hurt', 'death']) { try { const img = await load(`${A}gfx/boss_flame_${a}.png`); bossFx.flame[a] = strip(img, Math.max(1, Math.round(img.width / (BOSS_FW.flame || img.height)))); } catch (e) { /* saknas */ } }
  if (!bossFx.flame.idle) delete bossFx.flame; else { bossFx.flame.attack = bossFx.flame.attack || bossFx.flame.idle; bossFx.flame.cast = bossFx.flame.cast || bossFx.flame.idle; }
  if (!bossFx.frost.idle) delete bossFx.frost; else { bossFx.frost.attack = bossFx.frost.attack || bossFx.frost.idle; bossFx.frost.cast = bossFx.frost.cast || bossFx.frost.idle; }
  for (const [id, anims] of Object.entries(BOSS_SHEETS)) {
    bossFx[id] = {};
    for (const [a, n] of anims) bossFx[id][a] = strip(await load(`${A}gfx/boss_${id}_${a}.png`), n);
  }
  setStatus('Laddar vapen…');
  for (const n of WEAPONS.map(w => w.id)) {
    if (['axe', 'flamer', 'launcher', 'nailgun', 'staff', 'bow'].includes(n)) { try { wimg[n] = await load(`${A}gfx/fp_${n}.png`); spr['pick_' + n] = pixels(await load(`${A}gfx/pick_${n}.png`)); } catch (e) { wimg[n] = wimg.pistol; spr['pick_' + n] = spr.pick_pistol; } continue; } // nya vapen: valfria bilder
    wimg[n] = await load(`${A}gfx/fp_${n}.png`);
    spr['pick_' + n] = pixels(await load(`${A}gfx/pick_${n}.png`));
  }
  wimg.flash = await load(A + 'gfx/MuzzleFlash.png');
  spr.health = pixels(await load(A + 'gfx/health.png'));
  spr.armor = pixels(await load(A + 'gfx/armor.png'));
  spr.ammo = pixels(await load(A + 'gfx/ammo.png'));
  fx.fire = strip(await load(A + 'gfx/fire.png'), 16);
  fx.fireball = strip(await load(A + 'gfx/fireball.png'), 8);
  fx.hit = strip(await load(A + 'gfx/hit.png'), 8);
  fx.blood = strip(await load(A + 'gfx/blood.png'), 3);
  fx.pots = strip(await load(A + 'gfx/pots.png'), 4);
  fx.shards = grid(await load(A + 'gfx/shards.png'), 12, 12, 6, 4);
  fx.coin = strip(await load(A + 'gfx/coin.png'), 4);
  fx.chest = strip(await load(A + 'gfx/chest.png'), 4);
  fx.chestOpen = strip(await load(A + 'gfx/chest_open.png'), 4);
  fx.merchant = strip(await load(A + 'gfx/merchant.png'), 6);
  fx.portal = strip(await load(A + 'gfx/portal.png'), 8);
  // utomhus: natthimmel, träd och gravstenar
  spr.sky = pixels(await load(A + 'gfx/sky_night.png'));
  spr.cardback = pixels(await load(A + 'cards/back.png'), 24, 24);
  for (const [k, f] of [['grenade', 'item_grenade'], ['key', 'item_key'], ['scroll', 'item_map'], ['ammo_small', 'item_ammo_small'], ['ammo_big', 'item_ammo_big'], ['moon', 'moon'], ['clouds', 'clouds']]) {
    try { spr[k] = pixels(await load(`${A}gfx/${f}.png`)); } catch (e) { /* valfri */ }
  }
  fx.trees = [pixels(await load(A + 'gfx/tree_1.png')), pixels(await load(A + 'gfx/tree_2.png'))];
  fx.graves = strip(await load(A + 'gfx/grave.png'), 3);
  fx.props = {}; // föremål i rummen (tools/props/make.py)
  for (const d of Object.values(PROP_DEFS)) if (!fx.props[d.img]) { try { fx.props[d.img] = strip(await load(`${A}gfx/${d.src || 'prop_' + d.img}.png`), d.n || 1); } catch (e) { /* valfri */ } }
  const sq = img => strip(img, Math.max(1, Math.round(img.width / img.height))); // kvadratiska rutor
  fx.pets = {}; // följeslagarna (valfria; saknas de används fladdermus, irrbloss och isvarg)
  for (const id of ['raven', 'lantern', 'pup']) {
    const set = {};
    for (const [k, f] of [['idle', ''], ['idle', '_idle'], ['move', '_movement'], ['attack', '_attack']]) if (!set[k] || f) { try { set[k] = sq(await load(`${A}gfx/pet_${id}${f}.png`)); } catch (e) { /* valfri */ } }
    if (set.idle) fx.pets[id] = set;
  }
  for (const k of ['rune_fire', 'rune_ice', 'rune_poison', 'rune_storm', 'rune_blood', 'rune_echo', 'ab_blink', 'ab_slowmo', 'ab_bubble', 'ab_summon', 'ab_quake']) { try { const im = await load(`${A}gfx/${k}.png`); spr[k] = pixels(im); hudImg[k] = im; } catch (e) { /* valfri */ } }
  try { spr.meat = pixels(await load(`${A}gfx/item_meat.png`)); } catch (e) { /* valfri */ }
  for (const k of ['potion_heal', 'potion_rage', 'potion_ghost', 'potion_speed', 'potion_ice', 'potion_unknown']) { try { const im = await load(`${A}gfx/${k}.png`); spr[k] = pixels(im); hudImg[k] = im; } catch (e) { /* valfri */ } }
  try { fx.crateBits = strip(await load(A + 'gfx/prop_crate_broken.png'), 4); } catch (e) { fx.crateBits = null; }
  fx.parts = {}; // biompartiklar (tools/props/make.py); saknas en används träffgnistan
  for (const [n, k] of [['nail', 1], ['arrow', 1], ['lightning', 4], ['ashfall', 2], ['lavadrop', 2], ['heat', 1], ['snow', 2], ['footprint', 1], ['breath', 2], ['icicle', 1], ['flame', 4], ['blood_trail', 2], ['eye', 1], ['leaf', 4], ['firefly', 2], ['drop', 1], ['rain', 1], ['fog', 1], ['bat', 4], ['ember', 2], ['dust', 1], ['wisp', 4], ['shell', 1], ['blood_pool', 3],
    ['gib', 4], ['spore', 2], ['webshot', 1], ['scorch', 1], ['hole', 2], ['ash', 2], ['smoke', 4], ['ice', 3], ['gas', 2], ['skull', 2], ['log', 2], ['rock', 1], ['shadow', 1], ['zzz', 1], ['star', 1], ['meteor', 2]]) {
    try { fx.parts[n] = strip(await load(`${A}gfx/part_${n}.png`), k); } catch (e) { /* valfri */ }
  }
  try { await document.fonts.load('8px "PressStart2P"'); } catch (e) { /* reservtypsnitt */ }
}

// ---------- Ljud (positionsljud med stereo) ----------
let actx = null, master = null;
const SOUNDS = ['shot', 'boom', 'pickup', 'health', 'hurt', 'splat', 'weapon', 'lose', 'win', 'growl', 'hiss', 'pain', 'roar', 'gore', 'drone', 'door', 'steps',
  'reload', 'click', 'shell', 'pot', 'secret', 'whoosh', 'ricochet', 'breath', 'armor', 'gate', 'fireburst', 'bossroar', 'coin', 'chest', 'card', 'buy', 'bigboom', 'stinger',
  'amb_wind', 'amb_drip', 'amb_rain', 'amb_frogs', 'amb_creepy', 'bell', 'moan', 'gasp', 'kick', 'bonesnap', 'step_grass', 'step_gravel', 'step_wood', 'gem', 'splash', 'music_boss', 'heart',
  'jump', 'land', 'dash', 'grenade_throw', 'grenade_bounce', 'grenade_beep', 'lever', 'unlock', 'key', 'anvil', 'lava', 'web', 'bat', 'hound', 'spider', 'fuse', 'shield_block', 'spore', 'gong',
  'ui_hover', 'ui_click', 'bullet_wall', 'gib', 'ice_break', 'gas', 'arrow', 'prisoner', 'fortune', 'freeze', 'shock', 'stamina_out', 'slide', 'map_unroll', 'combo', 'champion',
  'axe_swing', 'axe_hit', 'axe_charge', 'axe_throw', 'flamer_loop', 'flamer_start', 'flamer_end', 'launcher_fire', 'ghoul', 'ghoul_eat', 'cultist', 'curse', 'gargoyle_wake', 'gargoyle',
  'icewolf', 'wolf_bite', 'wisp', 'wisp_burst', 'frost_boss_roar', 'ice_crack', 'icicle_fall', 'snow_step', 'wind_cold', 'drink', 'potion_rage', 'potion_ghost', 'potion_speed', 'potion_ice',
  'raven', 'lantern', 'pup_bark', 'pup_bite', 'npc_alchemist', 'npc_priest', 'bless', 'route_choice', 'fuse_cards', 'headshot', 'low_ammo', 'daily_reward',
  'nailgun_fire', 'nail_hit', 'nail_flesh', 'staff_zap', 'staff_charge', 'staff_orb', 'bow_draw', 'bow_release', 'arrow_hit', 'arrow_pickup', 'necromancer', 'necro_raise', 'fire_elemental', 'elemental_split',
  'lavaworm', 'worm_emerge', 'deathknight', 'knight_wave', 'banshee', 'banshee_scream', 'lava_bubble', 'volcano_rumble', 'eruption', 'firejet', 'crumble', 'pendulum', 'plate_click', 'barrel_poison', 'barrel_frost',
  'campfire', 'eat', 'rest', 'quest_done', 'quest_new', 'rune_socket', 'rune_proc', 'secret_stairs', 'ab_blink', 'ab_slowmo', 'ab_bubble', 'ab_summon', 'ab_quake', 'ability_ready', 'flame_boss_roar', 'survival_wave', 'tutorial', 'heartbeat_fast'];
async function loadSounds() {
  actx = new (window.AudioContext || window.webkitAudioContext)();
  master = actx.createGain(); master.connect(actx.destination); applyVolume();
  if (window.Music) { Music.init(actx, master); applyMixer(); }
  await Promise.all(SOUNDS.map(async n => {
    try { const buf = await (sndCache[n] || fetch(`${A}snd/${n}.ogg`).then(r => r.arrayBuffer())); if (buf) snd[n] = await actx.decodeAudioData(buf.slice(0)); } catch (e) { /* ljud är valfritt */ }
  }));
}
function applyVolume() { if (master) master.gain.value = settings.muted ? 0 : settings.vol; }
const SUBS = { growl: 'MORRANDE', hiss: 'VÄSANDE', roar: 'VRÅL', bossroar: 'BOSSENS VRÅL', door: 'EN DÖRR', gate: 'ETT GALLER', moan: 'STÖNANDE', bell: 'KLOCKOR', fireburst: 'EXPLOSION', bigboom: 'SMÄLL', arrow: 'EN PIL', gas: 'PYSANDE GAS', spider: 'SPINDEL', bat: 'FLADDERMÖSS', hound: 'SKALL', fuse: 'STUBIN' };
let subs = [];
function play(name, vol = 1, rate = 1, opt = {}) {
  if (settings.subtitles && SUBS[name] && opt.x !== undefined && state === 'play') { const rel = Math.atan2(Math.sin(Math.atan2(opt.y - P.y, opt.x - P.x) - P.a), Math.cos(Math.atan2(opt.y - P.y, opt.x - P.x) - P.a)), dist = Math.hypot(opt.x - P.x, opt.y - P.y);
    if (dist < 16 && !subs.some(s => s.n === name)) { subs.push({ n: name, text: `[${SUBS[name]} ${Math.abs(rel) < 0.6 ? 'FRAMFÖR' : Math.abs(rel) > 2.4 ? 'BAKOM' : rel > 0 ? 'TILL HÖGER' : 'TILL VÄNSTER'}]`, t: 2 }); if (subs.length > 3) subs.shift(); } }
  if (!actx || !snd[name]) return null;
  let v = vol, pan = 0;
  if (opt.x !== undefined) {
    const dx = opt.x - P.x, dy = opt.y - P.y, d = Math.hypot(dx, dy);
    if (d > 22) return null;
    v *= clamp(1 - d / 22, 0, 1) ** 1.4;
    if (map && !hasLOS(P.x, P.y, opt.x, opt.y)) v *= 0.45;
    pan = clamp(Math.sin(Math.atan2(dy, dx) - P.a), -1, 1) * 0.8;
  }
  const s = actx.createBufferSource(); s.buffer = snd[name]; s.playbackRate.value = rate; s.loop = !!opt.loop;
  const g = actx.createGain(); g.gain.value = v;
  let node = s.connect(g);
  if (pan && actx.createStereoPanner) { const p = actx.createStereoPanner(); p.pan.value = pan; node = node.connect(p); }
  if (opt.loop) { s.loopStart = 0; s.loopEnd = Math.max(0.05, s.buffer.duration - 0.025); } // Vorbis-filerna är lite för långa: loopa före slutet
  if (name !== 'heart' && name !== 'combo' && !opt.loop && rate === 1 && /hurt|pain|growl|hiss|pot|coin|splat|click|steps|step_/.test(name)) s.playbackRate.value = rnd(0.94, 1.06); // upprepade ljud varierar
  node.connect(window.Music && Music.sfxIn ? (opt.amb ? Music.ambIn : Music.sfxIn) : master); s.start();
  return { s, g };
}

// ---------- Vapen ----------
const WEAPONS = [
  { id: 'pistol', name: 'PISTOL', short: 'PISTOL', ammo: 'p9', mag: 9, dmg: 2.2, pellets: 1, spread: 0.012, delay: 0.3, auto: false, sound: ['shot', 1.15, 0.85], flash: 0.75, kick: 0.8, reload: 1.1, falloff: [7, 18, 0.5], recoil: [0.012, -0.006] },
  { id: 'shotgun', name: 'HAGELGEVÄR', short: 'HAGEL', ammo: 'shells', mag: 6, dmg: 1.7, pellets: 9, spread: 0.07, delay: 0.95, auto: false, sound: ['boom', 0.8, 0.9], flash: 1.4, kick: 2.2, shellReload: true, reload: 0, falloff: [3, 11, 0.35], recoil: [0.02] },
  { id: 'rifle', name: 'GEVÄR', short: 'GEVÄR', ammo: 'r556', mag: 24, dmg: 2.8, pellets: 1, spread: 0.014, delay: 0.13, auto: true, sound: ['shot', 0.82, 0.9], flash: 1.0, kick: 0.9, reload: 1.7, falloff: [12, 30, 0.6], recoil: [0.004, 0.006, -0.003, 0.007, -0.005, 0.004, -0.006] },
  { id: 'smg', name: 'KULSPRUTEPISTOL', short: 'KPIST', ammo: 'p9', mag: 32, dmg: 1.5, pellets: 1, spread: 0.035, delay: 0.085, auto: true, sound: ['shot', 1.45, 0.65], flash: 0.75, kick: 0.5, reload: 1.5, falloff: [6, 16, 0.45], recoil: [0.003, -0.004, 0.005, -0.002, 0.004, -0.005] },
  // fyra vapen ur andra modellpaket (tools/weapon-frames/render-static.mjs)
  { id: 'dbshotgun', name: 'DUBBELBÖSSA', short: 'DUBBEL', ammo: 'shells', mag: 2, dmg: 1.9, pellets: 10, spread: 0.08, delay: 0.25, auto: false, sound: ['boom', 0.7, 1.0], flash: 1.6, kick: 2.6, reload: 1.5, falloff: [3, 10, 0.3], recoil: [0.025, -0.02] },
  { id: 'crossbow', name: 'ARMBORST', short: 'ARMBST', ammo: 'bolts', mag: 1, dmg: 10, pellets: 1, spread: 0.004, delay: 0.2, auto: false, sound: ['whoosh', 1.3, 0.8], flash: 0, kick: 0.5, reload: 0.85, falloff: [30, 40, 1], recoil: [0.004], silent: true, pierceAll: true },
  { id: 'flaregun', name: 'SIGNALPISTOL', short: 'SIGNAL', ammo: 'flares', mag: 1, dmg: 4, pellets: 1, spread: 0.01, delay: 0.3, auto: false, sound: ['shot', 0.6, 0.7], flash: 1.2, kick: 1.0, reload: 1.1, falloff: [30, 40, 1], recoil: [0.01], proj: 'flare' },
  // version 5: närstrid, eld och granater
  { id: 'axe', name: 'YXAN', short: 'YXA', ammo: 'none', mag: 1, dmg: 9, pellets: 1, spread: 0, delay: 0.5, auto: false, sound: ['axe_swing', 1, 0.8], flash: 0, kick: 1.2, reload: 0, falloff: [2, 3, 1], recoil: [0], melee: true },
  { id: 'flamer', name: 'ELDKASTAREN', short: 'ELD', ammo: 'fuel', mag: 60, dmg: 0.55, pellets: 1, spread: 0, delay: 0.06, auto: true, sound: ['', 1, 0], flash: 0.5, kick: 0.15, reload: 1.8, falloff: [4.5, 6, 1], recoil: [0], flame: true },
  { id: 'launcher', name: 'GRANATKASTAREN', short: 'GRKAST', ammo: 'lgren', mag: 6, dmg: 30, pellets: 1, spread: 0.01, delay: 0.6, auto: false, sound: ['launcher_fire', 0.9, 1], flash: 0.8, kick: 2, reload: 2.1, falloff: [30, 40, 1], recoil: [0.01], lob: true },
  // version 6: spikar, blixt och båge (läggs sist så att de gamla platserna behålls)
  { id: 'sniper', name: 'PRICKSKYTTEGEVÄR', short: 'PRICK', ammo: 'r556', mag: 5, dmg: 14, pellets: 1, spread: 0.002, delay: 1.0, auto: false, sound: ['boom', 1.25, 0.85], flash: 1.1, kick: 2.8, reload: 2.2, falloff: [40, 50, 1], recoil: [0.015, -0.01], pierce: 2, zoom: 0.5, hip: 0.05 },
  { id: 'nailgun', name: 'SPIKGEVÄRET', short: 'SPIK', ammo: 'nails', mag: 50, dmg: 1.5, pellets: 1, spread: 0.02, delay: 0.1, auto: true, sound: ['nailgun_fire', 0.9, 1], flash: 0.4, kick: 0.4, reload: 1.6, falloff: [30, 40, 1], recoil: [0.002, -0.002], nail: true },
  { id: 'staff', name: 'BLIXTSTAVEN', short: 'STAV', ammo: 'mana', mag: 100, dmg: 2.4, pellets: 1, spread: 0, delay: 0.32, auto: true, sound: ['staff_zap', 0.8, 1], flash: 0.6, kick: 0.5, reload: 0, falloff: [12, 14, 1], recoil: [0.004], staff: true },
  { id: 'bow', name: 'LÅNGBÅGEN', short: 'BÅGE', ammo: 'arrows', mag: 1, dmg: 7, pellets: 1, spread: 0.02, delay: 0.25, auto: false, sound: ['bow_release', 1, 1], flash: 0, kick: 0.6, reload: 0.45, falloff: [30, 40, 1], recoil: [0.006], bow: true, silent: true },
];
const AMMO = { p9: { name: '9MM', max: 200 }, r556: { name: '5.56', max: 150 }, shells: { name: 'PATRONER', max: 50 }, bolts: { name: 'BULTAR', max: 40 }, flares: { name: 'BLOSS', max: 24 },
  fuel: { name: 'BRÄNSLE', max: 240 }, lgren: { name: 'GRANATER', max: 24 }, none: { name: 'NÄRSTRID', max: 1 },
  nails: { name: 'SPIKAR', max: 300 }, mana: { name: 'MANA', max: 0 }, arrows: { name: 'PILAR', max: 40 } };
const NOAMMO = () => ({ p9: 36, r556: 0, shells: 0, bolts: 0, flares: 0, fuel: 0, lgren: 0, none: 1, nails: 0, mana: 0, arrows: 0 });
const weaponIndex = id => WEAPONS.findIndex(w => w.id === id);
// tecknet för vapnet på kartan (gen.js) -> vapnets id
const WEAPON_CHAR = { g: 'shotgun', r: 'rifle', m: 'smg', d: 'dbshotgun', b: 'crossbow', s: 'flaregun', p: 'sniper', 'å': 'axe', 'ä': 'flamer', 'ö': 'launcher', 'é': 'nailgun', 'ü': 'staff', 'ñ': 'bow' };
const WF = window.WEAPON_FRAMES;

// ---------- Spelstate ----------
const P = { pitch: 0, ryaw: 0, burst: 0, burstT: 0, chainN: 0, iframe: 0, slowT: 0, kickT: 0, lastWeapon: 0, boom: 0, x: 2, y: 2, a: 0, vx: 0, vy: 0, hp: 100, armor: 0, shield: 0, shieldT: 0, haste: 0, weapon: 0, has: [true, false, false, false, false, false, false, false],
  ammo: { p9: 36, r556: 0, shells: 0, bolts: 0, flares: 0 }, mags: [9, 0, 0, 0, 0, 0, 0, 0], flash: 0, bob: 0, bobAmp: 0, hurt: 0, pick: 0, shake: 0, camZ: 0.5, deadT: 0,
  jz: 0, jv: 0, dj: false, crouch: 0, slide: 0, stam: 1, stamT: 0, dashT: 0, dashCd: 0, grenades: 2, keys: 0, combo: 0, comboT: 0, runK: 0, roll: 0, landT: 0 };
const WS = { state: 'draw', t: 0, aim: 0, next: -1, shot: 99, cd: 0, swayX: 0, swayY: 0, spread: 0, shellPhase: '', spin: 0, focus: 0, hunt: false, kick: 0, boost: false, tried: false, nameT: 0, punch: 0, lowWarned: {}, inspect: 0, idleT: 0, throwT: -1 };
let portals = []; // portaler: 'floor' leder till nästa våning, 'boss' låter en välja mellan djupare och att avsluta
let map, mw, mh, doors, ents, items, pots, torches, chests, merchants, particles, projectiles, light, flow, flowCell = -1, seen;
let lvl, totalEnemies, kills, secrets, totalSecrets, itemsTaken, totalItems, levelTime = 0, boss = null, bossBanner = 0;
let state = 'title', tmr = 0, score = 0, showMap = settings.map ?? 1, hitMark = 0, hitKill = false, hitCrit = false, hurtDir = [], breathSnd = null, ambient = null, stepT = 0, fireHeld = false;
let run = null, M = {}, hint = '', hitStop = 0, slowmo = 0, levelBanner = 0;
const lvlStat = { shots: 0, hits: 0, taken: 0 };
const shakeAmt = () => { const tr = Math.min(1, P.shake / 2.5); return tr * tr * (settings.shake ?? 1); }; // trauma²: små träffar knappt märks, stora slår till
const msgs = [];
const keys = {};
let mouseDown = false, aimDown = false;
const mod = k => M[k] || 0;
let UP = new Set(); // vapenuppgraderingar (kortens wup) för vapnet man har svurit sig till
// ---------- Klasser: olika start ----------
const CLASSES = {
  vandrare: { name: 'VANDRAREN', text: 'PISTOLEN OCH INGET MER. KLASSISK START.', color: '#c9a87a', cost: 0, mods: {} },
  krigare: { name: 'KRIGAREN', text: 'HAGELGEVÄR, 25 RUSTNING OCH +15 MAX HP', color: '#d04030', cost: 30, mods: { maxHp: 15 }, weapon: 'shotgun', armor: 25 },
  prickskytt: { name: 'PRICKSKYTTEN', text: 'GEVÄR, +6 % KRIT OCH +15 % TRÄFFSÄKERHET', color: '#60a0ff', cost: 40, mods: { critChance: 0.06, accuracy: 0.15 }, weapon: 'rifle' },
  alkemist: { name: 'ALKEMISTEN', text: '5 GRANATER, +10 % GIFTCHANS OCH +25 % GRANATSKADA', color: '#70d060', cost: 40, mods: { poisonChance: 0.1, grenadeDmg: 0.25, grenades: 2 }, grenades: 5 },
  nekromantiker: { name: 'NEKROMANTIKERN', text: 'DÖDA FIENDER KAN RESA SIG SOM DINA ALLIERADE (12 %)', color: '#70e080', cost: 60, mods: { allyChance: 0.12 }, grenades: 1 },
  jagare: { name: 'JÄGAREN', text: 'ARMBORST OCH EN VARGVALP SOM FÖLJESLAGARE', color: '#b0c080', cost: 50, mods: { petPower: 0.2 }, weapon: 'crossbow', pet: 'pup' },
  spejare: { name: 'SPEJAREN', text: 'LÅNGBÅGE OCH LYKTAN SOM FÖLJESLAGARE', color: '#a0c0a0', cost: 55, mods: { headshot: 0.15 }, weapon: 'bow', pet: 'lantern' },
  smed: { name: 'SMEDEN', text: 'PISTOLEN SMIDD TILL NIVÅ 2 MED EN ELDRUNA', color: '#d08040', cost: 55, mods: { armorPerFloor: 5 }, smith: true },
  plundrare: { name: 'PLUNDRAREN', text: '80 GULD, +10 % FART, BÄTTRE TUR OCH MAGNET', color: '#ffd24a', cost: 50, mods: { moveSpeed: 0.1, magnet: 1, luck: 0.06 }, gold: 80 },
};
const classOpen = id => !CLASSES[id].cost || (profile.classes || []).includes(id);
function applyClassStart() {
  const c = CLASSES[run.cls]; if (!c) return;
  if (c.weapon && run.cmode !== 'pistol') { const i = weaponIndex(c.weapon); P.has[i] = true; P.mags[i] = effMag(i); const w = WEAPONS[i]; P.ammo[w.ammo] = Math.min(AMMO[w.ammo].max, P.ammo[w.ammo] + { r556: 40, shells: 16 }[w.ammo] || 20); }
  if (c.armor) P.armor += c.armor; if (c.grenades) P.grenades = c.grenades; if (c.gold) run.gold += c.gold;
  if (c.pet && !run.pet) run.pet = c.pet;
  if (c.smith) { run.wlvl = { pistol: 2 }; run.wrunes = { pistol: ['fire'] }; }
}
const stat = (k, n = 1) => { profile[k] = (profile[k] || 0) + n; };
function cardGained(card) { if (!card) return; const r = Cards.RARITY[card.rarity]; cardBanner = { name: card.name, color: r ? r.color : '#e8d9b0', t: 2.2 }; logEvent('KORT: ' + card.name); }
function recomputeMods() {
  M = window.Cards && run ? Cards.computeMods(run.owned) : {};
  const cls = run && CLASSES[run.cls]; if (cls) for (const [k, v] of Object.entries(cls.mods)) M[k] = (M[k] || 0) + v; // klassens bonusar
  if (run && meta('luck')) M.luck = (M.luck || 0) + meta('luck') * 0.05;
  UP = new Set(window.Cards && run ? run.owned.map(id => Cards.byId(id)).filter(c => c && c.wup).map(c => c.wup) : []);
}
const up = k => UP.has(k) && !!run && WEAPONS[P.weapon].id === run.pact;

const plain = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
function say(t, d = 2.5) { msgs.unshift({ text: plain(t), t: d }); if (msgs.length > 3) msgs.length = 3; }

// ---------- Runda och våningar ----------
const dailySeed = () => { const d = new Date(); return RNG.hash(`krypta-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`); };
const seedText = s => (s >>> 0).toString(36).toUpperCase();
// dagens runda har en utmaning som gäller hela rundan
const DAILY_MODS = [
  { id: 'glass', name: 'GLASKANON', text: 'DU GÖR OCH TAR 50 % MER SKADA' },
  { id: 'gold', name: 'GULDFEBER', text: 'DUBBELT GULD, 30 % SÄMRE HELNING' },
  { id: 'dark', name: 'MÖRKRET', text: 'MYCKET MÖRKARE, MEN FIENDERNA SER SÄMRE' },
  { id: 'swift', name: 'DE SNABBA DÖDA', text: 'FIENDERNA ÄR 25 % SNABBARE OCH GER 50 % MER GULD' },
  { id: 'elite', name: 'ELITJAKTEN', text: 'FLER ELITER, VARJE ELIT TAPPAR ETT KORT' },
];
const dmod = id => !!(run && ((run.modifier && run.modifier.id === id) || (run.modifier2 && run.modifier2.id === id)));
const weekNo = () => { const d = new Date(), j = new Date(d.getFullYear(), 0, 1); return `${d.getFullYear()}-${Math.ceil(((d - j) / 864e5 + j.getDay() + 1) / 7)}`; };
function newRun(seed, daily) {
  run = { seed: seed >>> 0, daily: !!daily, depth: 0, owned: [], gold: 25 * meta('gold'), kills: 0, time: 0, livesUsed: 0, souls: 0, rerolls: 0, diff: settings.diff, bossKilled: false,
    cls: classOpen(settings.cls || 'vandrare') ? settings.cls || 'vandrare' : 'vandrare', asc: settings.diff === 3 ? Math.min(settings.asc || 0, profile.ascMax || 0) : 0, graph: [], practice: practice ? { ...practice } : null };
  run.cardRng = RNG(run.seed).fork('kort');
  newMission();
  if (daily) run.modifier = RNG(run.seed).fork('dagens').pick(DAILY_MODS);
  run.cmode = run.practice || daily ? '' : CMODES[settings.cmode] ? settings.cmode || '' : '';
  resetPlayer(); recomputeMods(); if (settings.pet && PETS[settings.pet] && petOpen(settings.pet)) run.pet = settings.pet; applyClassStart();
  if (run.cmode === 'onehit') { P.hp = 1; P.armor = 0; }
  if (meta('startrune')) { run.wrunes = run.wrunes || {}; run.wrunes.pistol = (run.wrunes.pistol || []).concat(RUNE_IDS[(Math.random() * RUNE_IDS.length) | 0]).slice(-runeSlots()); }
  if (!run.practice) { profile.runs++; saveProfile(); dailyReward(); }
}
function weaponFor(depth) { // ett nytt vapen per våning i slumpad ordning; de sista dyker upp i varv 2
  const order = RNG(run.seed).fork('vapen').shuffle(Object.keys(WEAPON_CHAR));
  const want = order[depth - 1 - cycleOf(depth)];
  if (!want) return null;
  return P.has[weaponIndex(WEAPON_CHAR[want])] ? null : want;
}
// biomer: varje varv går igenom alla fem i slumpad ordning (?biome=id för test)
const BIOME_IDS = ['dungeon', 'caves', 'graveyard', 'forest', 'courtyard', 'swamp', 'frost', 'volcano'];
let practice = null; // övningsläge: { biome } eller { boss }
const biomeFor = depth => run && run.practice && run.practice.biome ? run.practice.biome : BIOME_IDS.includes(params.get('biome')) ? params.get('biome') : run && run.biomeChoice && run.biomeChoice[depth] ? run.biomeChoice[depth]
  : RNG(run.seed).fork('biom' + cycleOf(depth)).shuffle(BIOME_IDS.slice())[(cyclePos(depth) - 1) % BIOME_IDS.length];
// väktaren på varje vanlig våning: en annan boss än varvets egen, i mindre format
const guardianFor = depth => { const own = bossFor((cycleOf(depth) + 1) * (FLOORS + 1)); return RNG(run.seed).fork('väktare' + depth).pick(BOSS_IDS.filter(b => b !== own)); };
function loadFloor(depth) {
  run.depth = depth;
  const c = cycleOf(depth), pos = cyclePos(depth);
  const level = !isBossDepth(depth)
    ? Gen.floor(RNG.hash(run.seed + ':' + depth), Math.min(5, pos + c), { shop: pos === 2 || pos === 4, weapon: weaponFor(depth), biome: biomeFor(depth), guardian: guardianFor(depth) })
    : Gen.boss(RNG.hash(run.seed + ':boss' + (c ? ':' + c : '')), { arena: BOSSES[bossFor(depth)].arena, boss: bossFor(depth) });
  if (isBossDepth(depth)) level.bossId = bossFor(depth);
  startLevel(level);
  P.armor = Math.min(200, P.armor + mod('armorPerFloor'));
  if (mod('floorHeal')) heal(mod('floorHeal'), true);
  run.freeRerolls = Math.round(mod('freeReroll')) + (depth === 1 || run.metaReroll === undefined ? (run.metaReroll = meta('reroll')) : 0);
  saveRun();
}
function saveRun() { // ögonblicksbild vid våningens start, raderas vid död (permadöd)
  store.set('run', { run: Object.assign({}, run, { cardRng: undefined }), p: { hp: P.hp, armor: P.armor, has: P.has, ammo: P.ammo, mags: P.mags, weapon: P.weapon, potions: P.potions || [], grenades: P.grenades, keys: P.keys }, score });
}
function loadRunSave() {
  const s = store.get('run', null); if (!s) return false;
  run = Object.assign({}, s.run); run.cardRng = RNG(RNG.hash(run.seed + ':kort:' + run.depth));
  const pad = (a, v) => WEAPONS.map((_, i) => a[i] ?? v); // äldre sparningar hade fyra vapen
  Object.assign(P, { hp: s.p.hp, armor: s.p.armor, has: pad(s.p.has, false), ammo: Object.assign(NOAMMO(), s.p.ammo), mags: pad(s.p.mags, 0), weapon: s.p.weapon, potions: s.p.potions || [], grenades: s.p.grenades ?? P.grenades, keys: s.p.keys ?? P.keys });
  score = s.score; settings.diff = run.diff; recomputeMods();
  return true;
}
function resetPlayer() {
  P.has = WEAPONS.map((_, i) => i === 0); P.weapon = 0; P.ammo = NOAMMO(); P.mags = WEAPONS.map((_, i) => i === 0 ? 9 : 0); P.hp = 100; P.armor = 0; P.shield = 0; score = 0;
  P.ammo.p9 = Math.round(P.ammo.p9 * (1 + 0.5 * meta('ammo'))); P.armor = 25 * meta('armor'); P.hp = 100 + meta('hp') * 10; // själaaltaret
  P.grenades = 2 + meta('grenade'); P.keys = meta('key'); P.stam = 1; P.combo = 0;
  P.potions = meta('potstart') ? [{ id: 'heal', strong: false }] : []; P.rageT = P.ghostT = P.speedT = 0; pet = null; allies = [];
}
function startLevel(level) {
  wallMarks.clear();
  lvl = level;
  map = lvl.map.map(r => r.split('')); mh = map.length; mw = map[0].length;
  icicles.length = 0; groundFires.length = 0; spores.length = 0; challenge = null; iceSteps = {}; P.cold = 0; waves = []; clones = []; mirrors = []; darkT = 0; doors = {}; ents = []; items = []; pots = []; torches = []; chests = []; merchants = []; particles = []; projectiles = []; numbers.length = 0; fuses.length = 0; portals = []; hazards = []; decals.length = 0;
  lvlStat.shots = lvlStat.hits = lvlStat.taken = 0; lvlStat.healed = 0;
  guardianE = null; kills = 0; totalEnemies = 0; secrets = 0; totalSecrets = 0; itemsTaken = 0; totalItems = 0; levelTime = 0; boss = null; bossBanner = 0;
  light = new Float32Array(mw * mh); lcol = settings.colorLight === false ? null : new Float32Array(mw * mh * 3); seen = new Uint8Array(mw * mh); flow = new Int16Array(mw * mh).fill(-1); flowCell = -1;
  const lrng = RNG(RNG.hash(run.seed + ':spawn:' + run.depth));
  const itemOf = { h: 'health', a: 'ammo', A: 'armor', $: 'goldpile', ',': 'grenade', '}': 'key', "'": 'scroll', '¥': 'potion', 'ª': 'rune', 'ð': 'meat', ...WEAPON_CHAR };
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    const c = map[y][x], cx = x + 0.5, cy = y + 0.5;
    if (c === 'P') { P.x = cx; P.y = cy; P.a = startAngle(x, y); map[y][x] = '.'; }
    else if (c === 'Ç') { icicles.push({ x: cx, y: cy, fall: -1 }); map[y][x] = '.'; }
    else if (c === 'Q' || c === '+' || c === 'Ö') { const e = makeEnemy(c, cx, cy); e.dormant = true; ents.push(e); map[y][x] = '.'; } // mimicen och rustningen räknas först när de vaknar
    else if (c === 'Z') { const g = makeGuardian(cx, cy); if (g) { ents.push(g); totalEnemies++; } map[y][x] = '.'; }
    else if (ENEMY_DEFS[c]) { ents.push(makeEnemy(c, cx, cy)); totalEnemies++; map[y][x] = '.'; }
    else if (c === 'E' || (dmod('elite') && ENEMY_DEFS[c] && lrng.chance(0.15))) { ents.push(makeElite(lrng, cx, cy)); totalEnemies++; map[y][x] = '.'; }
    else if (c === 'B') { boss = makeBoss(cx, cy); ents.push(boss); totalEnemies++; map[y][x] = '.'; }
    else if (itemOf[c]) { const it = { type: itemOf[c], x: cx, y: cy, taken: false }; if (c === 'a') { const r = lrng.next(); it.mult = r < 0.2 ? 0.5 : r < 0.33 ? 2 : 1; } if (c === '¥') it.pot = randomPotion(() => lrng.next()); if (c === 'ª') it.rune = lrng.pick(RUNE_IDS); items.push(it); totalItems++; map[y][x] = '.'; } // ammolådor i tre storlekar
    else if (isDoorChar(c)) { doors[x + ',' + y] = { open: 0, target: 0, gate: c === 'G', secret: c === '*', lever: c === '|', locked: c === ']', x, y }; if (c === '*') totalSecrets++; }
    else if (c === '{') totalSecrets++;
    else if (c === 'x') { map[y][x] = '.'; lvl.exit = { x, y }; }
    else if (c === 'f') { torches.push({ x: cx, y: cy, ph: Math.random() * 10, cells: [] }); }
    else if (c === 'o') { pots.push({ x: cx, y: cy, color: (x * 7 + y * 3) % 4, broken: false, loot: lrng.chance(0.5) ? lrng.pick(['ammo', 'health', 'gold', 'gold', 'grenade', lrng.chance(0.15) ? 'key' : 'gold', lrng.chance(0.25 + mod('potionChance')) ? 'potion' : 'gold']) : null }); map[y][x] = '.'; }
    else if (c === 'C') { chests.push({ x: cx, y: cy, open: false, t: 0 }); totalItems++; map[y][x] = '.'; }
    else if (c === 'M') { merchants.push({ x: cx, y: cy, stock: null }); } // köpmannen blockerar sin ruta
  }
  setupEnemyRoles(lrng); setupV6Roles(lrng);
  ghosts = []; echoes = []; quakeT = 8;
  floorTexs = (lvl.floors || [lvl.floor]).map(n => tex[n] || tex.floor_stone);
  cellFloor = new Uint8Array(mw * mh); cellSky = new Uint8Array(mw * mh); props = []; hazGrid = new Uint8Array(mw * mh);
  const hazTex = { '_': 'floor_lava', '-': 'floor_water', ':': 'floor_ice', '¬': 'floor_crack', '·': 'floor_pit' }, hazIdx = {}, nBase = floorTexs.length;
  for (const [ch, n] of Object.entries(hazTex)) { hazIdx[ch] = floorTexs.length; floorTexs.push(tex[n]); }
  animTex = { lava: hazIdx['_'], water: hazIdx['-'], ice: hazIdx[':'], pit: hazIdx['·'] }; let lavaLights = 0; crumbles = {};
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    if (lvl.floorMask) cellFloor[y * mw + x] = Math.min(nBase - 1, +lvl.floorMask[y][x] || 0);
    if (map[y][x] === '¬') crumbles[y * mw + x] = { t: -1 }; // skör platta
    if (hazIdx[map[y][x]] !== undefined) cellFloor[y * mw + x] = hazIdx[map[y][x]];
    if (map[y][x] === '_' && (x + y) % 3 === 0 && lavaLights++ < 50) torches.push({ x: x + 0.5, y: y + 0.5, ph: Math.random() * 10, cells: [], hidden: true, str: 0.45, r: 3 }); // lavan lyser
    if (lvl.sky) cellSky[y * mw + x] = lvl.sky[y][x] === '1' ? 1 : 0;
    const c = map[y][x], h = (x * 73856093 ^ y * 19349663) >>> 0;
    if (c === 't') props.push({ x: x + 0.5 + ((h % 7) - 3) * 0.03, y: y + 0.5 + (((h >> 3) % 7) - 3) * 0.03, img: fx.trees[h % 2], size: 1.45 + (h % 5) * 0.08, flip: !!(h & 16) });
    else if (c === 'n') props.push({ x: x + 0.5, y: y + 0.5, img: fx.graves[h % 3], size: 0.62, flip: false });
    else if (PROP_DEFS[c] && (fx.props[PROP_DEFS[c].img] || fx.props[PROP_DEFS[c].fb])) {
      const d = PROP_DEFS[c], frames = fx.props[d.img] || fx.props[d.fb];
      const o = { x: x + 0.5, y: y + 0.5, cx: x, cy: y, ch: c, def: d, frames, img: frames[0], size: d.size, flip: !d.n && !!(h & 16), ph: (h % 100) / 10 };
      props.push(o);
      if (d.light) torches.push({ x: o.x, y: o.y, ph: o.ph, cells: [], hidden: true, str: d.light, r: 4, prop: o });
      if (d.trap || c === 'z') hazGrid[y * mw + x] = 1;
      if (d.web) { o.size = 0.85; o.z = 0.05; continue; } // nätet ligger kvar i kartan (saktar ned, kan brinna)
      if (!d.block) map[y][x] = '.'; // ben, ljus, svamp och fällor går att gå över
    }
  }
  prepareTorchLight();
  quests = null; run.inSecret = !!lvl.secret;
  pickFloorEvent(lrng); setupQuests(lrng); addCobwebs(lrng); lockChests(lrng); setupNpcFloor(lrng);
  if (run.floorCurse) for (const e of ents) if (!e.boss) { e.hp = e.maxHp = e.maxHp * 1.2; e.d = { ...e.d, dmg: e.d.dmg * 1.3 }; }
  if (!boss && !merchants.length && run.depth >= 2 && lrng.next() < 0.15) { const sp = randomFreeCell(lrng); if (sp) { merchants.push({ x: sp[0], y: sp[1], stock: null, wander: true }); map[sp[1] | 0][sp[0] | 0] = 'M'; logEvent('VANDRANDE KÖPMAN'); } } // vandrande köpman
  if (floorEvent === 'mist') fogMul = 1.8; else fogMul = 1;
  P.vx = P.vy = 0; P.flash = 0; P.hurt = 0; P.camZ = 0.5; P.deadT = 0; P.shake = 0; P.haste = 0;
  P.hp = Math.min(P.hp, maxHp()); P.shield = mod('shield');
  WS.state = 'draw'; WS.t = 0; WS.aim = 0; WS.shot = 99;
  hurtDir = []; msgs.length = 0;
  state = 'play';
  if (!boss) levelBanner = 3; // stort titelkort med namn och biom
  else say(lvl.name, 3);
  if (boss) { bossIntro = 2.2; boss.cd = Math.max(boss.cd, 3); }
  if (boss) { bossBanner = 3.5; slowmo = 1.2; play('stinger', 0.8); if (window.Music) Music.sting('boss'); setTimeout(() => play('bossroar', 0.9, 0.8), 600); }
  startAmbient(); buildGrade(); fogK = biomeFx().fogK * fogMul; lightning = 0; lightningT = rnd(4, 10);
  setMusic(!!boss);
}
// ---------- Våningshändelser ----------
const EVENTS = {
  bloodmoon: { name: 'BLODMÅNE', text: 'STARKARE FIENDER, DUBBELT GULD', outdoor: true },
  mist: { name: 'DIMNATT', text: 'TÄT DIMMA, MEN FLER SKATTER' },
  quake: { name: 'JORDBÄVNING', text: 'STENAR FALLER FRÅN TAKET' },
  dark: { name: 'MÖRK VÅNING', text: 'BARA FACKLORNA LYSER' },
  goldrain: { name: 'GULDREGN', text: 'MER GULD, SNABBARE FIENDER' },
};
function pickFloorEvent(rng) {
  floorEvent = ''; floorQuest = null;
  if (boss || !run || run.depth < 2 || rng.next() > 0.28) return;
  const ids = Object.keys(EVENTS).filter(k => !EVENTS[k].outdoor || lvl.sky);
  floorEvent = ids[(rng.next() * ids.length) | 0];
  if (floorEvent === 'bloodmoon') for (const e of ents) if (!e.boss) { e.hp = e.maxHp = e.maxHp * 1.3; e.d = { ...e.d, dmg: e.d.dmg * 1.25 }; }
  if (floorEvent === 'goldrain') for (const e of ents) if (!e.boss) e.d = { ...e.d, speed: e.d.speed * 1.15 };
  if (floorEvent === 'mist') { for (let i = 0; i < 4; i++) { const s = randomFreeCell(rng); if (s) items.push({ type: 'goldpile', x: s[0], y: s[1], taken: false }); } const s = randomFreeCell(rng); if (s) chests.push({ x: s[0], y: s[1], open: false, t: 0 }); }
  logEvent(EVENTS[floorEvent].name); stat('events');
}
function randomFreeCell(rng) { for (let i = 0; i < 60; i++) { const x = (rng.next() * mw) | 0, y = (rng.next() * mh) | 0; if (map[y][x] === '.' && Math.hypot(x + 0.5 - P.x, y + 0.5 - P.y) > 6) return [x + 0.5, y + 0.5]; } return null; }
let floorQuest = null, quakeT = 8;
function setupQuests(rng) { // jakt, tidsutmaning, mimicjakt, spöket och ditt förra lik
  const elites = ents.filter(e => e.elite && !e.boss);
  if (elites.length && rng.next() < 0.3) { const e = elites[(rng.next() * elites.length) | 0]; e.bounty = true; floorQuest = { kind: 'bounty', text: 'JAKT: DÖDA DEN MÄRKTA ELITEN' }; }
  else if (!boss && rng.next() < 0.2) { const lim = 90 + mw * mh / 12; floorQuest = { kind: 'time', limit: Math.round(lim), text: `TIDSUTMANING: PORTALEN INOM ${fmtTime(lim)}` }; }
  else if (ents.some(e => e.type === 'Q')) floorQuest = { kind: 'mimic', text: 'EN MIMIC GÖMMER SIG PÅ VÅNINGEN' };
  if (floorQuest) say(floorQuest.text, 4);
  // spöket som söker sina ben
  const bones = props.filter(p => p.ch === 'j');
  if (!boss && bones.length >= 2 && rng.next() < 0.18 && bossFx.ghost) {
    const spot = randomFreeCell(rng);
    if (spot) { const b = bones[(rng.next() * bones.length) | 0]; b.questBones = true; ghosts.push({ x: spot[0], y: spot[1], talked: false, done: false, bones: b }); }
  }
  // där du dog senast (samma frö och våning)
  const ld = profile.lastDeath;
  if (ld && ld.seed === run.seed && ld.depth === run.depth && !boss) { echoes.push({ x: ld.x, y: ld.y, cause: ld.cause }); for (let i = 0; i < 4; i++) items.push({ type: 'gold', x: ld.x + rnd(-0.3, 0.3), y: ld.y + rnd(-0.3, 0.3), taken: false, drop: true }); }
}
let ghosts = [], echoes = [];
function logEvent(t) { if (!run) return; run.log = run.log || []; run.log.push(`V${run.depth}: ${t}`); if (run.log.length > 12) run.log.shift(); }
function updateWorldEvents(dt) {
  if (floorEvent === 'quake') { quakeT -= dt; if (quakeT <= 0) { quakeT = rnd(7, 12); P.shake = Math.max(P.shake, 1.8); play('bigboom', 0.6, 0.5); say('MARKEN SKAKAR', 1.2); for (let i = 0; i < 4; i++) { const a = rnd(0, TAU), r = rnd(0.5, 4); fallHazard(P.x + Math.cos(a) * r, P.y + Math.sin(a) * r, 'rockfall', 9, 1.2 + i * 0.15); } } }
  for (const g of ghosts) { // spöket ber om sina ben
    const d = Math.hypot(g.x - P.x, g.y - P.y);
    if (!g.talked && d < 2) { g.talked = true; play('moan', 0.6, 1.3); say('SPÖKET: "HITTA MINA BEN ... JAG BELÖNAR DIG"', 4); logEvent('SPÖKET BAD OM SINA BEN'); }
    if (g.talked && !g.done && g.bones && Math.hypot(g.bones.x - P.x, g.bones.y - P.y) < 1.1) {
      g.done = true; stat('ghosts'); play('secret', 0.8, 1.3); say('BENEN ÄR FUNNA – SPÖKET FÅR RO', 3); spawnPuff(g.x, g.y, 10); logEvent('SPÖKET FICK RO');
      setTimeout(() => openUI(() => draftUI(drawCards(3, { luck: 1 }), { title: 'SPÖKETS TACK', subtitle: 'VÄLJ ETT KORT', skipLabel: 'TA INGET' }, c => { if (c) gainCard(c); closeUI(); })), 600);
    }
    if (g.talked && !g.done && g.bones && Math.random() < dt * 4) particles.push({ x: g.bones.x + rnd(-0.2, 0.2), y: g.bones.y + rnd(-0.2, 0.2), z: 0.1, vx: 0, vy: 0, vz: 0.5, life: 0.8, maxLife: 0.8, img: fx.hit[1], size: 0.05, add: true, tint: [150, 210, 255], drift: true });
  }
  ghosts = ghosts.filter(g => !g.done);
  for (const e of echoes) if (!e.told && Math.hypot(e.x - P.x, e.y - P.y) < 1.5) { e.told = true; say(`HÄR DOG DU SENAST${e.cause ? ' (' + e.cause + ')' : ''}`, 3); play('moan', 0.4, 0.8); }
  if (lvl.sky && !settings.lowfx) { starT -= dt; if (starT <= 0) { starT = rnd(12, 30); star = { a: P.a + rnd(-0.6, 0.6), y: rnd(8, 30), t: 0 }; } if (star) { star.t += dt; if (star.t > 0.9) star = null; } } // stjärnfall
}
let starT = 15, star = null;
function addCobwebs(rng) { // spindelväv uppe i mörka hörn inomhus
  if (lvl.sky && lvl.biome !== 'courtyard') return;
  let n = 0;
  for (let y = 1; y < mh - 1 && n < 40; y++) for (let x = 1; x < mw - 1 && n < 40; x++) {
    if (isWallChar(map[y][x]) || rng.next() > 0.25) continue;
    for (const [dx, dy, side] of [[1, 0, 0], [-1, 0, 0], [0, 1, 1], [0, -1, 1]]) {
      if (!isWallChar(map[y + dy][x + dx])) continue;
      const corner = side === 0 ? (isWallChar(map[y - 1][x + dx]) || isWallChar(map[y + 1][x + dx])) && (isWallChar(map[y - 1][x]) || isWallChar(map[y + 1][x])) : (isWallChar(map[y + dy][x - 1]) || isWallChar(map[y + dy][x + 1])) && (isWallChar(map[y][x - 1]) || isWallChar(map[y][x + 1]));
      if (!corner) continue;
      const hit = { mx: x + dx, my: y + dy, side, cell: map[y + dy][x + dx], wx: rng.next() < 0.5 ? 0.06 : 0.94 };
      wallMark(hit, dx, dy, 0.9, 'web'); n++; break;
    }
  }
}
function lockChests(rng) { // låsta kistor (en per nyckel) och förbannade kistor
  let keysOnLevel = items.filter(i => i.type === 'key').length;
  for (const c of chests) {
    if (keysOnLevel > 0 && rng.next() < 0.5) { c.locked = true; keysOnLevel--; continue; }
    if (rng.next() < 0.18) c.rare = true; else if (rng.next() < 0.08) c.cursed = true;
  }
}
function setupEnemyRoles(rng) { // sovande, patrullerande, champions och veteraner
  const sr = lvl.rooms ? lvl.rooms.find(r => r.type === 'start') : null;
  for (const e of ents) {
    if (e.boss || e.dormant || e.minion) continue;
    if (sr && e.x >= sr.x && e.y >= sr.y && e.x < sr.x + sr.w && e.y < sr.y + sr.h) continue;
    const r = rng.next();
    if (r < 0.2 && !e.elite) e.sleep = true;
    else if (r < 0.45) { const a = rng.next() * TAU; let best = null; for (let k = 4; k >= 1.5; k -= 0.5) { const x2 = e.x + Math.cos(a) * k, y2 = e.y + Math.sin(a) * k; if (!solid(x2, y2) && hasLOS(e.x, e.y, x2, y2)) { best = [x2, y2]; break; } } if (best) e.patrol = { x1: e.x, y1: e.y, x2: best[0], y2: best[1], leg: true, wait: rng.next() * 2 }; }
    if (!e.elite && rng.next() < 0.025 + run.depth * 0.004) makeChampion(e);
    if (cycleOf(run.depth) > 0 && !e.elite && !e.champion) { e.veteran = true; e.hp = e.maxHp = e.maxHp * 1.25; }
  }
}
function startAngle(x, y) { // titta mot den längsta öppna riktningen
  let best = 0, bd = -1;
  for (const [a, dx, dy] of [[0, 1, 0], [Math.PI / 2, 0, 1], [Math.PI, -1, 0], [-Math.PI / 2, 0, -1]]) {
    let d = 0; while (d < 30 && !isWallChar(cellAt(x + dx * (d + 1), y + dy * (d + 1)))) d++;
    if (d > bd) { bd = d; best = a; }
  }
  return best;
}

const depthHp = () => (1 + 0.2 * Math.max(0, run.depth - 1)) * (asc() >= 1 ? 1.1 : 1);
const depthMul = () => 1 + 0.25 * Math.max(0, cycleOf(run.depth) - 2); // oändligt läge: poängmultiplikator efter varv 3
const asc = () => (run && run.asc) || 0; // uppstigning 1–5 på MARDRÖM
function makeEnemy(type, x, y) {
  const d = ENEMY_DEFS[type], hp = d.hp * diff().hp * depthHp();
  const r = Math.random();
  return { type, d, x, y, hp, maxHp: hp, cowardly: r < 0.35, dodgy: 'IVR'.includes(type) && r > 0.4, flank: [-1, 0, 1][(Math.random() * 3) | 0], state: 'idle', t: Math.random() * 3, cd: 1, alert: false, flip: Math.random() < 0.5, dead: false, flash: 0, growlT: 2 + Math.random() * 4, didHit: false, burn: 0, slow: 0, burnAcc: 0 };
}
function makeChampion(e) { // sällsynt gyllene fiende
  e.champion = true; e.hp = e.maxHp = e.maxHp * 3; e.d = { ...e.d, size: e.d.size * 1.15, dmg: e.d.dmg * 1.3, score: e.d.score * 4 }; return e;
}
function makeElite(rng, x, y) {
  const type = rng.pick(run.depth >= 3 ? ['S', 'K', 'V', 'L', 'I', 'W', 'R'] : run.depth >= 2 ? ['S', 'K', 'V', 'L', 'I'] : ['S', 'K', 'L']);
  const e = makeEnemy(type, x, y), m = rng.pick(ELITE_MODS);
  e.elite = m; e.hp = e.maxHp = e.maxHp * (m.id === 'tough' ? 4 : 2.4);
  if (m.id === 'shielded') e.eshield = e.eshieldMax = e.maxHp * 0.6; // skölden tar skadan först
  // djupare varv: eliter kan få en andra egenskap
  if (cycleOf(run.depth) > 0 && rng.chance(0.5)) { const m2 = rng.pick(ELITE_MODS.filter(x => x !== m && x.id !== 'tough')); e.elite2 = m2; e.elite = { ...m, name: m.name + ' & ' + m2.name }; if (m2.id === 'shielded') e.eshield = e.eshieldMax = e.maxHp * 0.6; }
  e.d = Object.assign({}, e.d, { size: e.d.size * 1.3, speed: e.d.speed * (m.id === 'fast' ? 1.7 : 1), dmg: e.d.dmg * (m.id === 'brute' ? 1.8 : 1.2) * (asc() >= 4 ? 1.2 : 1), cd: e.d.cd * (m.id === 'fast' ? 0.7 : 1) });
  return e;
}
function makeGuardian(x, y) { // väktaren: en mindre version av en boss, vaktar sitt rum på vanliga våningar
  const id = lvl.guardian; if (!BOSSES[id]) return null;
  const def = BOSSES[id], hp = def.hp * 0.32 * diff().hp * depthHp() * (1 + 0.4 * cycleOf(run.depth));
  const d = { ...def, name: 'VÄKTAREN ' + def.name, size: def.size * 0.72, dmg: def.dmg * 0.7, range: def.range * 0.8, melee: true, score: 1500, growl: 'bossroar', cd: 2,
    phaseMsg: def.phaseMsg.map(m => m.replace(def.name, 'VÄKTAREN')) };
  return { type: 'B', boss: true, guardian: true, id, d, x, y, hp, maxHp: hp, state: 'idle', t: 0, cd: 2.5, alert: false, asleep: true, flip: false, dead: false, flash: 0, growlT: 6, phase: 1, summonT: 14, burn: 0, slow: 0, burnAcc: 0, dying: 0 };
}
let guardianE = null; // väktaren man slåss mot just nu
function wakeGuardian(g) {
  g.asleep = false; guardianE = g; setMusic(true); bossBanner = 2.5; levelBanner = 0; slowmo = 0.6; play('stinger', 0.7); play('bossroar', 0.8, 1.1, { x: g.x, y: g.y });
  // stäng och försegla dörrarna till väktarens rum
  const room = (lvl.rooms || []).find(r => r.type === 'guardian' && g.x >= r.x && g.y >= r.y && g.x < r.x + r.w && g.y < r.y + r.h);
  for (const d of Object.values(doors)) {
    if (d.secret) continue;
    const near = room ? d.x >= room.x - 1 && d.y >= room.y - 1 && d.x <= room.x + room.w && d.y <= room.y + room.h : Math.hypot(d.x + 0.5 - g.x, d.y + 0.5 - g.y) < 8;
    if (!near) continue;
    d.glock = true; if (!occupied(d)) d.target = 0;
  }
  if (Object.values(doors).some(d => d.glock)) { say('DÖRRARNA SLÅS IGEN!', 2); play('gate', 0.8, 0.8); }
}
function finishGuardian(g) {
  kills++; run.kills++; run.guardians = (run.guardians || 0) + 1; profile.guardians = (profile.guardians || 0) + 1; saveProfile(); checkAch();
  guardianE = null; setMusic(false); play('bigboom', 0.8, 0.9); P.shake = 2;
  say(g.d.name + ' ÄR BESEGRAD!', 3);
  for (let i = 0; i < 8; i++) dropItem('gold', g.x + rnd(-0.8, 0.8), g.y + rnd(-0.8, 0.8));
  items.push({ type: 'cardpick', x: g.x, y: g.y, taken: false, drop: true, luck: cycleOf(run.depth) > 0 ? 3 : 0.9, title: cycleOf(run.depth) > 0 ? 'VÄKTARENS RELIK' : 'VÄKTARENS SKATT' });
  for (const d of Object.values(doors)) if (d.glock) { d.glock = false; d.target = 1; }
  if (!portals.length) spawnPortal(g.x, g.y, 'floor');
}
function makeBoss(x, y) {
  const id = lvl.bossId || 'demon', def = BOSSES[id];
  const hp = def.hp * diff().hp * (1 + 0.6 * cycleOf(run.depth)) * (asc() >= 5 ? 1.25 : 1);
  return { type: 'B', boss: true, id, d: { ...def, melee: true, score: 5000, growl: 'bossroar', cd: 2 }, x, y, hp, maxHp: hp, state: 'idle', t: 0, cd: 2.5, alert: true, flip: false, dead: false, flash: 0, growlT: 6, phase: 1, summonT: 10, burn: 0, slow: 0, burnAcc: 0, dying: 0 };
}

// ---------- Kollision / kartfrågor ----------
function cellAt(x, y) { if (x < 0 || y < 0 || x >= mw || y >= mh) return '1'; return map[y | 0][x | 0]; }
function isWallChar(c) { return (c >= '0' && c <= '9') || c === '#' || c === '%' || c === '~' || c === '&' || c === '=' || c === '{' || c === 'Ø' || c === '¦' || c === 'Ò' || c === '¤'; } // Ø frusen mur, ¦ frostbossens vägg // 0 träsk, { sprucken vägg // 6 skog, 7 kyrkogårdsmur, 8 grotta, 9 husvägg, #%~&= bossväggar
const isPropChar = c => c === 't' || c === 'n' || !!(PROP_DEFS[c] && PROP_DEFS[c].block); // träd, gravstenar och möbler: blockerar men är sprites
const isDoorChar = c => c === 'D' || c === 'G' || c === '*' || c === '|' || c === ']'; // | galler som öppnas med spak, ] låst dörr
function doorAt(x, y) { return doors[(x | 0) + ',' + (y | 0)]; }
function solid(x, y) {
  const c = cellAt(x, y);
  if (isWallChar(c) || c === 'f' || c === 'M' || c === '·' || isPropChar(c)) return true;
  if (isDoorChar(c)) return doorAt(x, y).open < 0.85;
  return false;
}
function tryMove(o, dx, dy, r) {
  const nx = o.x + dx, ny = o.y + dy;
  if (dx && !solid(nx + Math.sign(dx) * r, o.y) && !solid(nx + Math.sign(dx) * r, o.y + r * 0.9) && !solid(nx + Math.sign(dx) * r, o.y - r * 0.9)) o.x = nx;
  if (dy && !solid(o.x, ny + Math.sign(dy) * r) && !solid(o.x + r * 0.9, ny + Math.sign(dy) * r) && !solid(o.x - r * 0.9, ny + Math.sign(dy) * r)) o.y = ny;
}
function pushOut(o, cx, cy, minD) { // skjut ut ur en cirkel (krukor, fiender, kistor)
  const dx = o.x - cx, dy = o.y - cy, d = Math.hypot(dx, dy);
  if (d < minD && d > 1e-4) tryMove(o, dx / d * (minD - d), dy / d * (minD - d), 0.24);
}
// Raycast i rutnätet. Returnerar { dist, side, cell, wx, lx, ly (rutan framför väggen) }
function cast(ox, oy, dx, dy, maxD = 48, mark) {
  let mx = ox | 0, my = oy | 0;
  const ddx = Math.abs(1 / (dx || 1e-9)), ddy = Math.abs(1 / (dy || 1e-9));
  let sx, sy, sdx, sdy;
  if (dx < 0) { sx = -1; sdx = (ox - mx) * ddx; } else { sx = 1; sdx = (mx + 1 - ox) * ddx; }
  if (dy < 0) { sy = -1; sdy = (oy - my) * ddy; } else { sy = 1; sdy = (my + 1 - oy) * ddy; }
  let side = 0, dist = 0;
  for (let i = 0; i < 120; i++) {
    const lx = mx, ly = my;
    if (mark) seen[my * mw + mx] = 1;
    if (sdx < sdy) { dist = sdx; sdx += ddx; mx += sx; side = 0; } else { dist = sdy; sdy += ddy; my += sy; side = 1; }
    if (dist > maxD) return { dist: maxD, side, cell: '1', wx: 0, lx, ly };
    if (mx < 0 || my < 0 || mx >= mw || my >= mh) return { dist, side, cell: '1', wx: 0, lx, ly };
    const c = map[my][mx];
    if (isWallChar(c)) { if (mark) seen[my * mw + mx] = 1; return { dist, side, cell: c, wx: wallX(ox, oy, dx, dy, dist, side), mx, my, lx, ly }; }
    if (isDoorChar(c)) {
      const d = doors[mx + ',' + my];
      if (mark) seen[my * mw + mx] = 1;
      if (d.open >= 0.999) continue;
      const wx = wallX(ox, oy, dx, dy, dist, side);
      if (wx < d.open) continue; // dörren har glidit undan här
      return { dist, side, cell: c, wx: wx - d.open, mx, my, lx, ly, door: d };
    }
  }
  return { dist: maxD, side, cell: '1', wx: 0, lx: mx, ly: my };
}
const wallMat = c => c === 'G' || c === '|' || c === ']' || c === '~' ? 'metal' : c === 'D' || c === '9' || c === '&' || c === '6' ? 'wood' : 'stone'; // träffljud per material
function wallX(ox, oy, dx, dy, dist, side) { const w = side === 0 ? oy + dist * dy : ox + dist * dx; return w - Math.floor(w); }
function hasLOS(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
  if (d < 0.01) return true;
  const r = cast(ax, ay, dx / d, dy / d, d + 1);
  return r.dist >= d - 0.05;
}

// ---------- Ljus: grundljus + flimrande eldfat + mynningsblixtar ----------
function prepareTorchLight() {
  for (const t of torches) {
    for (let y = Math.max(0, (t.y | 0) - 7); y < Math.min(mh, (t.y | 0) + 8); y++) for (let x = Math.max(0, (t.x | 0) - 7); x < Math.min(mw, (t.x | 0) + 8); x++) {
      const d = Math.hypot(x + 0.5 - t.x, y + 0.5 - t.y);
      const r = t.r || 7;
      if (d > r || isWallChar(map[y][x])) continue;
      if (!hasLOS(t.x, t.y, x + 0.5, y + 0.5)) continue;
      t.cells.push([y * mw + x, Math.pow(1 - d / r, 1.5) * (t.str || 1.3)]);
    }
  }
}
let lcol = null; // färgat ljus: förskjutning per ruta (r, g, b) som läggs på gråskaleljuset
const MUZZLE_COL = { flamer: [255, 130, 40], flaregun: [255, 80, 60], crossbow: [200, 255, 200], launcher: [255, 190, 90], sniper: [255, 245, 220], axe: [220, 220, 255] };
function torchCol(t) { return t.prop ? PROP_GLOW[t.prop.ch] || [255, 170, 80] : t.hidden ? [255, 100, 30] : [255, 160, 70]; }
function addCol(i, w, c, k = 1) { const a = (c[0] + c[1] + c[2]) / 3, f = w * k * 1.5 / 255, j = i * 3; lcol[j] += (c[0] - a) * f; lcol[j + 1] += (c[1] - a) * f; lcol[j + 2] += (c[2] - a) * f; }
function updateLight() {
  if (lcol) { if (settings.colorLight === false || settings.lowfx) lcol = null; else lcol.fill(0); }
  else if (settings.colorLight !== false && !settings.lowfx && light) lcol = new Float32Array(mw * mh * 3);
  const darkK = darkT > 0 ? Math.max(0.15, 1 - Math.min(1, darkT) * 0.85) : 1;
  light.fill(lvl.ambient * (dmod('dark') ? 0.6 : 1) * darkK * (boss && boss.phase === 3 && !boss.dead ? 0.75 + 0.25 * Math.sin(tmr * 3) : 1) * (floorEvent === 'dark' ? 0.45 : 1));
  for (const t of torches) {
    const wind = lvl.sky ? 1.8 : 1; // facklorna fladdrar i vinden utomhus
    const fl = 0.85 + 0.1 * wind * Math.sin(tmr * 9 + t.ph) + 0.06 * wind * Math.sin(tmr * 23 + t.ph * 3);
    const k = t.prop && t.prop.used ? 0.15 : 1; // använd brunn och släckt altare lyser knappt
    for (const [i, w] of t.cells) light[i] += w * fl * k * darkK;
    if (lcol) { const c = t.col || (t.col = torchCol(t)), ck = t.prop || t.hidden ? 0.8 : 0.35; for (const [i, w] of t.cells) addCol(i, w * fl * k * darkK, c, ck); }
  }
  const flashLight = (lx, ly, strength, r, col) => {
    for (let y = Math.max(0, (ly | 0) - r); y < Math.min(mh, (ly | 0) + r + 1); y++) for (let x = Math.max(0, (lx | 0) - r); x < Math.min(mw, (lx | 0) + r + 1); x++) {
      const d = Math.hypot(x + 0.5 - lx, y + 0.5 - ly); if (d < r) { light[y * mw + x] += strength * (1 - d / r); if (col && lcol) addCol(y * mw + x, strength * (1 - d / r), col); }
    }
  };
  flashLight(P.x, P.y, 0.22 + mod('light') * 0.25, 3 + Math.round(mod('light') + mod('lightRadius'))); // eget sken
  if (pet && pet.id === 'lantern') flashLight(pet.x, pet.y, (pet.rest > 0 ? 0.2 : 0.55) * Math.min(2, petPow()) * (0.92 + 0.08 * Math.sin(tmr * 7)), 4 + (petLv() >> 1), [255, 210, 120]); // lyktan
  if (P.flash > 0) flashLight(P.x, P.y, P.flash * 9, 4, MUZZLE_COL[WEAPONS[P.weapon].id] || [255, 200, 120]); // mynningsflamman i vapnets färg
  for (const pr of projectiles) flashLight(pr.x, pr.y, 0.5, 3, pr.friendly && pr.kind !== 'flare' ? null : PROJ_TINT[pr.kind] || [255, 130, 50]);
  for (const f of flashes) flashLight(f.x, f.y, f.t * 5, f.r | 0, f.col || [255, 150, 60]);
  for (const c of chests) if (!c.open) flashLight(c.x, c.y, 0.18, 2);
  if (lvl.exit) flashLight(lvl.exit.x + 0.5, lvl.exit.y + 0.5, 0.35 + 0.1 * Math.sin(tmr * 3), 3); // utgången lyser
  for (const p of portals) flashLight(p.x, p.y, 0.7, 4, p.kind === 'gold' ? [255, 220, 90] : (p.biome && portals.length > 1 && BIOME_TINT[p.biome]) || [190, 130, 255]);
}
const lightAt = (x, y) => (x < 0 || y < 0 || x >= mw || y >= mh) ? lvl.ambient : light[(y | 0) * mw + (x | 0)];

// ---------- Biomernas särdrag: färgton, dimma, ljudmattor och väder ----------
// grade = färgton (r, g, b) över hela bilden, fogK = hur tät dimman är, amb = ljudslingor [namn, volym, fart]
const BIOME_FX = {
  dungeon: { grade: [1.06, 0.96, 0.84], fogK: 0.085, amb: [['drone', 0.3, 1], ['amb_creepy', 0.12, 1]], weather: 'dust' },
  caves: { grade: [0.84, 0.98, 1.12], fogK: 0.11, amb: [['drone', 0.25, 0.8], ['amb_drip', 0.35, 1]], weather: 'drips' },
  graveyard: { grade: [0.8, 0.9, 1.16], fogK: 0.07, amb: [['amb_wind', 0.32, 0.9]], weather: 'groundfog' },
  forest: { grade: [0.86, 1.08, 0.84], fogK: 0.09, amb: [['amb_wind', 0.18, 1.1], ['amb_frogs', 0.22, 1]], weather: 'leaves' },
  courtyard: { grade: [1.0, 0.95, 1.02], fogK: 0.075, amb: [['amb_rain', 0.32, 1], ['drone', 0.12, 1.2]], weather: 'rain' },
  volcano: { grade: [1.16, 0.9, 0.78], fogK: 0.08, amb: [['volcano_rumble', 0.3, 1], ['lava_bubble', 0.22, 1]], weather: 'ash' },
  frost: { grade: [0.9, 0.98, 1.14], fogK: 0.09, amb: [['wind_cold', 0.3, 1], ['amb_wind', 0.15, 0.7]], weather: 'snow' },
  swamp: { grade: [0.9, 1.04, 0.86], fogK: 0.12, amb: [['amb_frogs', 0.3, 0.85], ['amb_drip', 0.18, 0.7], ['amb_wind', 0.12, 0.8]], weather: 'swamp' },
};
const BIOME_TINT = { volcano: [255, 120, 60], dungeon: [255, 200, 140], caves: [140, 200, 255], graveyard: [180, 180, 255], forest: [140, 255, 140], courtyard: [255, 255, 200], swamp: [160, 255, 120], frost: [190, 240, 255] };
const BIOME_NAME = { dungeon: 'KRYPTAN', caves: 'GROTTORNA', graveyard: 'KYRKOGÅRDEN', forest: 'SKOGEN', courtyard: 'BORGGÅRDEN', swamp: 'TRÄSKET', frost: 'FROSTFÄSTET', volcano: 'VULKANEN' };
const biomeFx = () => BIOME_FX[lvl && lvl.biome] || BIOME_FX.dungeon;
const gradeLUT = [new Uint8ClampedArray(256), new Uint8ClampedArray(256), new Uint8ClampedArray(256)];
function buildGrade() { // färgtonen som uppslagstabeller; ljusstyrkan (gamma) från inställningarna ingår
  const g = biomeFx().grade, gam = 1 / clamp(settings.gamma || 1, 0.6, 1.8);
  for (let c = 0; c < 3; c++) for (let i = 0; i < 256; i++) gradeLUT[c][i] = 255 * Math.pow(i / 255, gam) * g[c];
}
function applyGrade() {
  const [lr, lg, lb] = gradeLUT;
  for (let i = 0; i < px.length; i++) { const c = px[i]; px[i] = 0xff000000 | (lb[(c >> 16) & 255] << 16) | (lg[(c >> 8) & 255] << 8) | lr[c & 255]; }
  if (settings.cb && CB[settings.cb]) daltonize(CB[settings.cb]);
}
// färgblindlägen: simulera färgseendet och flytta skillnaden till färger som syns (daltonisering)
const CB = { protan: [0.152, 1.053, -0.205, 0.115, 0.786, 0.099, -0.004, -0.048, 1.052], deutan: [0.367, 0.861, -0.228, 0.280, 0.673, 0.047, -0.012, 0.043, 0.969], tritan: [1.256, -0.077, -0.179, -0.078, 0.931, 0.148, 0.005, 0.691, 0.304] };
function daltonize(m) {
  for (let i = 0; i < px.length; i++) {
    const c = px[i], r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255;
    const er = r - (m[0] * r + m[1] * g + m[2] * b), eg = g - (m[3] * r + m[4] * g + m[5] * b), eb = b - (m[6] * r + m[7] * g + m[8] * b);
    const g2 = clamp(g + 0.7 * er + eg, 0, 255), b2 = clamp(b + 0.7 * er + eb, 0, 255);
    px[i] = 0xff000000 | ((b2 | 0) << 16) | ((g2 | 0) << 8) | r;
  }
}
let wakeLock = null, lowFpsT = 0;
function updateWakeLock() { // skärmen släcks inte under spel på mobilen
  const want = state === 'play' && isTouch() && settings.wakeLock !== false;
  if (want && !wakeLock && navigator.wakeLock) { wakeLock = 'pending'; navigator.wakeLock.request('screen').then(l => { wakeLock = l; l.addEventListener('release', () => { wakeLock = null; }); }).catch(() => { wakeLock = null; }); }
  if (!want && wakeLock && wakeLock !== 'pending') { wakeLock.release().catch(() => {}); wakeLock = null; }
}
function lowFpsGuard(realDt) { // låg bildfrekvens en längre stund: minska effekterna automatiskt
  if (settings.autoLowFx === false || settings.lowfx || state !== 'play') { lowFpsT = 0; return; }
  lowFpsT = realDt > 1 / 28 ? lowFpsT + realDt : Math.max(0, lowFpsT - realDt * 2);
  if (lowFpsT > 6) { settings.lowfx = true; saveSettings(); lowFpsT = 0; say('LÅG FPS: MINSKADE EFFEKTER ÄR PÅ', 3); }
}
function applyDisplay() { // skärpa och textstorlek
  canvas.style.imageRendering = settings.smooth ? 'auto' : 'pixelated';
  document.documentElement.style.setProperty('--ui-zoom', settings.uiScale || 1);
  document.documentElement.style.setProperty('--bo', settings.btnOpacity ?? 0.6);
}
let fpsN = 0, fpsT = 0, fpsShow = 0, heartT = 0, ambLoops = [], lightning = 0, lightningT = 10, musicSnd = null, crackleT = 2;
function stopAmbient() { for (const a of ambLoops) try { a.s.stop(); } catch (e) { /* redan stoppad */ } ambLoops = []; ambient = null; }
function startAmbient() {
  stopAmbient();
  ambLoops = biomeFx().amb.map(([n, v, r]) => play(n, v, r, { loop: true, amb: true })).filter(Boolean);
  if (window.Music) { Music.reverb(boss ? 'boss' : { dungeon: 'crypt', caves: 'cave', courtyard: 'crypt' }[lvl.biome] || 'outdoor'); playMusic(); }
  ambient = ambLoops[0] || null;
}
function setMusic(on) { // bossmusik under bosstrider, annars biomens musik
  musicSnd = on;
  if (window.Music && Music.sfxIn) { playMusic(); return; }
  if (on && !musicLoop) musicLoop = play('music_boss', 0.45, 1, { loop: true });
  if (!on && musicLoop) { try { musicLoop.s.stop(); } catch (e) { /* redan stoppad */ } musicLoop = null; }
}
let musicLoop = null;
function playMusic() { if (!window.Music) return; if (settings.music === false) { Music.stop(1); return; } const b = boss || guardianE; Music.play(state === 'title' || !lvl ? 'title' : lvl.secret && !musicSnd ? 'secret' : musicSnd ? (b && b.id === 'frost' ? 'boss2' : b && b.id === 'flame' ? 'boss3' : 'boss') : lvl.biome || 'dungeon'); }
function applyMixer() { if (window.Music) Music.setVolumes({ music: settings.music === false ? 0 : settings.musicVol ?? 0.6, sfx: settings.sfxVol ?? 1, amb: settings.ambVol ?? 0.8 }); }
let intensity = 0;
function updateAudioMood(dt) { // musiken intensivare i strid, dov ljudbild vid låg hälsa
  if (!window.Music || !Music.sfxIn) return;
  const fighting = ents.filter(e => e.alert && !e.dead && !e.dormant && Math.hypot(e.x - P.x, e.y - P.y) < 12).length;
  const want = boss && !boss.dead ? 0.4 + boss.phase * 0.2 : clamp(fighting / 5, 0, 1);
  intensity += (want - intensity) * Math.min(1, dt * 0.8); Music.setIntensity(intensity);
  if (settings.focusMode) { const amb = (settings.ambVol ?? 0.8) * (1 - Math.min(0.8, intensity * 0.9)); if (Math.abs(amb - (P.ambSet ?? -1)) > 0.03) { P.ambSet = amb; Music.setVolumes({ music: settings.music === false ? 0 : settings.musicVol ?? 0.6, sfx: settings.sfxVol ?? 1, amb }); } } // fokusläge
  const low = P.hp < maxHp() * 0.25 && settings.lowHpGray !== false; if (low !== P.muffled) { P.muffled = low; Music.muffle(low); }
  if (P.boom > 0.2 && !P.duckT) { P.duckT = 0.5; Music.duck(0.6, 0.6); } if (P.duckT) P.duckT = Math.max(0, P.duckT - dt);
}
// väder och svävande partiklar runt spelaren
function updateWeather(dt) {
  if (settings.lowfx && Math.random() < 0.6) dt *= 0; // minskade effekter: färre partiklar
  const w = biomeFx().weather, near = (r = 6) => { const a = rnd(0, TAU), d = rnd(0.5, r); return [P.x + Math.cos(a) * d, P.y + Math.sin(a) * d]; };
  const ok = (x, y) => x > 0 && y > 0 && x < mw && y < mh && !solid(x, y);
  const pp = n => fx.parts[n] || fx.hit;
  const add = (o, n) => { o.frames = pp(n); o.img = o.frames[0]; o.maxLife = o.life; o.drift = true; particles.push(o); };
  if (w === 'leaves' && Math.random() < dt * 5) { const [x, y] = near(); if (ok(x, y)) add({ x, y, z: 1.1, vx: rnd(-0.4, 0.4), vy: rnd(-0.4, 0.4), vz: -0.35, life: 3, size: 0.09, sway: rnd(0, 6) }, 'leaf'); }
  if (w === 'leaves' && Math.random() < dt * 3) { const [x, y] = near(); if (ok(x, y)) add({ x, y, z: rnd(0.2, 0.8), vx: rnd(-0.2, 0.2), vy: rnd(-0.2, 0.2), vz: rnd(-0.1, 0.1), life: 3, size: 0.06, add: true, sway: rnd(0, 6), fade: true }, 'firefly'); }
  if (w === 'groundfog' && Math.random() < dt * 4) { const [x, y] = near(8); if (ok(x, y)) add({ x, y, z: 0, vx: rnd(-0.25, 0.25), vy: rnd(-0.25, 0.25), vz: 0, life: 5, size: rnd(0.25, 0.4), add: true, fade: true }, 'fog'); }
  if (w === 'groundfog' && Math.random() < dt * 0.4) { const [x, y] = near(9); if (ok(x, y)) add({ x, y, z: rnd(0.3, 0.7), vx: rnd(-0.5, 0.5), vy: rnd(-0.5, 0.5), vz: rnd(-0.05, 0.05), life: 4, size: 0.22, add: true, fade: true, sway: rnd(0, 6) }, 'wisp'); }
  if (w === 'drips' && Math.random() < dt * 5) { const [x, y] = near(5); if (ok(x, y)) add({ x, y, z: 0.98, vx: 0, vy: 0, vz: -3, life: 0.32, size: 0.06, add: true }, 'drop'); }
  if (w === 'drips' && Math.random() < dt * 0.15) { const [x, y] = near(6); if (ok(x, y)) { const a = rnd(0, TAU); add({ x, y, z: rnd(0.6, 0.9), vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, vz: 0, life: 2.2, size: 0.14, flap: true }, 'bat'); } }
  if (w === 'rain') for (let i = 0; i < 3; i++) if (Math.random() < dt * 30) { const [x, y] = near(6); if (ok(x, y) && cellSky[(y | 0) * mw + (x | 0)]) add({ x, y, z: 1.2, vx: 0.4, vy: 0.2, vz: -9, life: 0.13, size: 0.16, add: true }, 'rain'); }
  if (w === 'ash') { if (Math.random() < dt * 16) { const [x, y] = near(6); if (ok(x, y)) add({ x, y, z: 1.1, vx: rnd(-0.2, 0.2) + 0.15, vy: rnd(-0.2, 0.2), vz: -0.45, life: 2.4, size: 0.04, sway: rnd(0, 6) }, fx.parts.ashfall ? 'ashfall' : 'ash'); } // askregn
    if (Math.random() < dt * 4) { const [x, y] = near(5); if (ok(x, y)) add({ x, y, z: 0.05, vx: rnd(-0.2, 0.2), vy: rnd(-0.2, 0.2), vz: rnd(0.4, 0.9), life: 1.4, size: 0.035, add: true, fade: true }, 'ember'); } }
  if (w === 'snow') for (let i = 0; i < 2; i++) if (Math.random() < dt * 22) { const [x, y] = near(6); if (ok(x, y) && cellSky[(y | 0) * mw + (x | 0)]) add({ x, y, z: 1.1, vx: rnd(-0.3, 0.3) + 0.3, vy: rnd(-0.3, 0.3), vz: -0.8, life: 1.4, size: 0.035, sway: rnd(0, 6) }, 'snow'); } // snöfall
  if (w === 'snow' && Math.random() < dt * 0.7 && !settings.lowfx) { const a = P.a; add({ x: P.x + Math.cos(a) * 0.65, y: P.y + Math.sin(a) * 0.65, z: P.camZ - 0.1, vx: Math.cos(a) * 0.3 + P.vx * 0.8, vy: Math.sin(a) * 0.3 + P.vy * 0.8, vz: 0.05, life: 0.9, size: 0.06, add: true, fade: true }, 'breath'); } // andedräkt
  if (w === 'swamp' && Math.random() < dt * 4) { const [x, y] = near(8); if (ok(x, y)) add({ x, y, z: 0, vx: rnd(-0.2, 0.2), vy: rnd(-0.2, 0.2), vz: 0, life: 5, size: rnd(0.3, 0.45), add: true, fade: true, tint: [120, 170, 110] }, 'fog'); } // träsket: dimma, eldflugor och bubblor
  if (w === 'swamp' && Math.random() < dt * 4) { const [x, y] = near(); if (ok(x, y)) add({ x, y, z: rnd(0.2, 0.8), vx: rnd(-0.2, 0.2), vy: rnd(-0.2, 0.2), vz: rnd(-0.1, 0.1), life: 3, size: 0.06, add: true, sway: rnd(0, 6), fade: true }, 'firefly'); }
  if (w === 'swamp' && Math.random() < dt * 2) { const [x, y] = near(4); if (ok(x, y) && cellAt(x, y) === '-') add({ x, y, z: 0, vx: 0, vy: 0, vz: 0.3, life: 0.6, size: 0.04, add: true, fade: true, tint: [160, 220, 160] }, 'drop'); }
  if (w === 'dust' && Math.random() < dt * 3) { const [x, y] = near(4); if (ok(x, y)) add({ x, y, z: rnd(0.2, 0.9), vx: rnd(-0.08, 0.08), vy: rnd(-0.08, 0.08), vz: rnd(-0.03, 0.03), life: 4, size: 0.025, add: true, fade: true }, 'dust'); }
  // glittrande guldhögar, utgångens sken, drag från lönnväggar och sprakande eldfat
  if (!settings.lowfx) {
    for (const it of items) if (!it.taken && it.type === 'goldpile' && Math.random() < dt * 1.5 && Math.hypot(it.x - P.x, it.y - P.y) < 10)
      particles.push({ x: it.x + rnd(-0.15, 0.15), y: it.y + rnd(-0.15, 0.15), z: rnd(0.05, 0.25), vx: 0, vy: 0, vz: 0.2, life: 0.4, maxLife: 0.4, frames: fx.hit, img: fx.hit[0], size: 0.07, add: true, tint: [255, 220, 90], drift: true });
    if (lvl.exit && Math.random() < dt * 6 && Math.hypot(lvl.exit.x + 0.5 - P.x, lvl.exit.y + 0.5 - P.y) < 14)
      particles.push({ x: lvl.exit.x + rnd(0.2, 0.8), y: lvl.exit.y + rnd(0.2, 0.8), z: 0.02, vx: 0, vy: 0, vz: rnd(0.4, 0.9), life: 1.1, maxLife: 1.1, frames: fx.hit, img: fx.hit[0], size: 0.08, add: true, tint: [120, 255, 140], drift: true });
    for (const k in doors) { const d = doors[k]; if (!d.secret || d.target) continue;
      if (Math.abs(d.x + 0.5 - P.x) + Math.abs(d.y + 0.5 - P.y) < 3.5 && Math.random() < dt * 3) particles.push({ x: d.x + 0.5 + rnd(-0.6, 0.6), y: d.y + 0.5 + rnd(-0.6, 0.6), z: rnd(0.1, 0.9), vx: rnd(-0.3, 0.3), vy: rnd(-0.3, 0.3), vz: 0.05, life: 1, maxLife: 1, frames: fx.hit, img: fx.hit[0], size: 0.04, add: true, tint: [180, 180, 160], drift: true, fade: true }); }
  }
  crackleT -= dt; if (crackleT <= 0) { crackleT = rnd(1.5, 3); let best = null, bd = 3.5; for (const t of torches) { if (t.hidden) continue; const d = Math.hypot(t.x - P.x, t.y - P.y); if (d < bd) { bd = d; best = t; } } if (best) play('fireburst', 0.07, rnd(1.4, 1.8), { x: best.x, y: best.y }); }
  // blixtar över kyrkogården
  lightning = Math.max(0, lightning - dt * 3);
  if (w === 'groundfog') { lightningT -= dt; if (lightningT <= 0) { lightningT = rnd(9, 22); lightning = 1; setTimeout(() => play('bigboom', 0.35, 0.35), rnd(300, 900)); if (Math.random() < 0.5) setTimeout(() => play('bell', 0.3, 0.8), 1600); } }
}

// ---------- Rendering ----------
let fogR = 0, fogG = 0, fogB = 0, fogK = 0.085;
function shadeFog(c, L, dist, ci = -1) {
  const ff = Math.exp(-dist * fogK);
  const k = L * ff;
  let kr = k, kg = k, kb = k;
  if (ci >= 0 && lcol) { const j = ci * 3; kr += lcol[j] * ff; kg += lcol[j + 1] * ff; kb += lcol[j + 2] * ff; if (kr < 0) kr = 0; if (kg < 0) kg = 0; if (kb < 0) kb = 0; } // färgat ljus
  let r = (c & 255) * kr + fogR * (1 - ff), g = ((c >> 8) & 255) * kg + fogG * (1 - ff), b = ((c >> 16) & 255) * kb + fogB * (1 - ff);
  r = r > 255 ? 255 : r; g = g > 255 ? 255 : g; b = b > 255 ? 255 : b;
  return 0xff000000 | (b << 16) | (g << 8) | r;
}
const wallTexFor = { 1: 'wall_brick_stone_center', 2: 'wall_brick_small_stone', 3: 'wall_rock', 4: 'wall_stone', 5: 'wall_brick_stone_center_banner',
  6: 'wall_forest', 7: 'wall_cemetery', 8: 'wall_cave', 9: 'wall_house',
  0: 'wall_swamp', '{': 'wall_cracked', 'Ø': 'wall_frost', '¦': 'wall_boss_frost', 'Ò': 'wall_obsidian', '¤': 'wall_boss_volcano', '#': 'wall_boss_demon', '%': 'wall_boss_beast', '~': 'wall_boss_nightmare', '&': 'wall_boss_ogre', '=': 'wall_boss_ghost' }; // väktar- och bossrum
// golvtextur per ruta (floorMask) och öppen himmel (sky) räknas fram när våningen startar
let cellFloor = null, cellSky = null, floorTexs = [], props = [], hazGrid = null, animTex = {};
const colAng = new Float32Array(W);
let plane = BASE_PLANE, view = { dirX: 1, dirY: 0, plX: 0, plY: BASE_PLANE, hor: HORIZON, camZ: 0.5, a: 0 };
function render() {
  [fogR, fogG, fogB] = lvl.fog || [0, 0, 0];
  if (floorEvent === 'bloodmoon') { fogR = Math.min(255, fogR + 40); fogG = fogG * 0.6; fogB = fogB * 0.6; }
  if (lightning > 0 && !settings.noFlash) { const k = lightning * 120; fogR = Math.min(255, fogR + k); fogG = Math.min(255, fogG + k); fogB = Math.min(255, fogB + k * 1.2); } // blixten lyser upp dimman
  const sh = shakeAmt();
  const a = P.a + sh * 0.035 * Math.sin(tmr * 37);
  const dirX = Math.cos(a), dirY = Math.sin(a), plX = -dirY * plane, plY = dirX * plane;
  const camZ = P.camZ + Math.sin(P.bob * 2) * 0.012 * P.bobAmp;
  const hor = HORIZON + Math.round(sh * 6 * Math.sin(tmr * 53 + 1) + P.pitch);
  view = { dirX, dirY, plX, plY, hor, camZ, a };
  const ce = tex[lvl.ceil] || tex.floor_stone, sky = spr.sky, outdoor = !!lvl.sky;
  skyFx = outdoor && !settings.lowfx;
  for (let x = 0; x < W; x++) { const camX = 2 * x / W - 1; colAng[x] = Math.atan2(dirY + plY * camX, dirX + plX * camX); }
  // golv och tak (eller natthimmel där rutan är öppen)
  for (let y = 0; y < VH; y++) {
    const isFloor = y > hor;
    if (y === hor) { for (let x = 0; x < W; x++) px[y * W + x] = 0xff000000 | (fogB << 16) | (fogG << 8) | fogR; continue; }
    const rowDist = isFloor ? VH * camZ / (y - hor) : VH * (1 - camZ) / (hor - y);
    const dim = isFloor ? 1 : 0.62;
    const x0 = P.x + (dirX - plX) * rowDist, y0 = P.y + (dirY - plY) * rowDist;
    const stx = (2 * plX * rowDist) / W, sty = (2 * plY * rowDist) / W;
    const sv = Math.min(sky.h - 1, Math.max(0, (sky.h * (1 - (hor - y) / Math.max(40, hor + 30))) | 0)) * sky.w; // himlens rad
    let fx2 = x0, fy2 = y0;
    for (let x = 0; x < W; x++) {
      const cx = Math.floor(fx2), cy = Math.floor(fy2), inside = cx >= 0 && cy >= 0 && cx < mw && cy < mh, ci = cy * mw + cx;
      if (!isFloor && (inside ? cellSky[ci] : outdoor)) { // öppen himmel: panoramat följer blickriktningen
        let c = sky.data[sv + ((((colAng[x] / TAU) + 1) * sky.w) | 0) % sky.w];
        if (skyFx) c = skyPixel(c, x, y, hor);
        px[y * W + x] = c;
      } else {
        const t = isFloor ? floorTexs[inside ? cellFloor[ci] : 0] : ce;
        const u = ((fx2 - cx) * t.w) | 0, v = ((fy2 - cy) * t.h) | 0;
        px[y * W + x] = shadeFog(t.data[v * t.w + u], (inside ? light[ci] : lvl.ambient) * dim, rowDist, inside ? ci : -1);
      }
      fx2 += stx; fy2 += sty;
    }
  }
  // väggar
  for (let x = 0; x < W; x++) {
    const camX = 2 * x / W - 1, rdx = dirX + plX * camX, rdy = dirY + plY * camX;
    const hit = cast(P.x, P.y, rdx, rdy, 48, true);
    const perp = Math.max(0.05, hit.dist);
    zbuf[x] = perp;
    const scale = VH / perp;
    const top = hor - scale * (1 - camZ), lh = scale;
    const t = hit.cell === 'D' ? tex.door_wood : hit.cell === 'G' || hit.cell === '|' ? tex.door_metal_gate : hit.cell === ']' ? tex.door_locked : hit.cell === '*' ? tex[wallTexFor[lvl.secretWall] || wallTexFor[1]]
      : hit.cell === '9' && (hit.mx * 7 + hit.my * 3) % 3 === 0 ? tex.wall_house_window : tex[wallTexFor[hit.cell]]; // vart tredje hus har ett upplyst fönster
    let u = (hit.wx * t.w) | 0;
    if ((hit.side === 0 && rdx > 0) || (hit.side === 1 && rdy < 0)) u = t.w - 1 - u;
    let L = lightAt(hit.lx, hit.ly);
    if (hit.side === 1) L *= 0.8;
    const wci = hit.lx >= 0 && hit.ly >= 0 && hit.lx < mw && hit.ly < mh ? (hit.ly | 0) * mw + (hit.lx | 0) : -1;
    const y0 = Math.max(0, Math.ceil(top)), y1 = Math.min(VH - 1, Math.floor(top + lh - 0.001));
    const step = t.h / lh;
    let v = (y0 - top) * step;
    for (let y = y0; y <= y1; y++) { px[y * W + x] = shadeFog(t.data[Math.min(t.h - 1, v | 0) * t.w + u], L, perp, wci); v += step; }
    if (hit.mx !== undefined && wallMarks.size) { // kulhål och blodstänk
      const marks = wallMarks.get((hit.my * mw + hit.mx) * 4 + faceOf(hit.side, rdx, rdy));
      if (marks) for (const m of marks) {
        const du = Math.abs(m.u - hit.wx); if (du > m.r) continue;
        const hh = Math.sqrt(m.r * m.r - du * du) * (m.kind === 'blood' ? 1.6 : 1), cy = top + (1 - m.z) * lh;
        const ya = Math.max(0, Math.ceil(cy - hh * lh)), yb = Math.min(VH - 1, Math.floor(cy + hh * lh));
        const col = m.kind === 'blood' ? shadeFog(0xff10109a, L, perp) : m.kind === 'web' ? shadeFog(0xffc8c8c8, L, perp) : shadeFog(0xff101418, L * 0.8, perp);
        for (let y = ya; y <= yb; y++) if ((m.kind !== 'blood' || ((y * 7 + x * 3 + m.seed) % 5) > 0.8) && (m.kind !== 'web' || ((y + x) % 3 === 0 || (y * 3 + x * 5) % 7 === 0))) px[y * W + x] = col;
        if (m.kind === 'blood' && yb + 1 < VH) for (let y = yb + 1; y < Math.min(VH, yb + 1 + Math.round(lh * 0.06 * ((m.seed + x) % 3) / 2)); y++) px[y * W + x] = col; // rinner nedåt
      }
    }
  }
  // sprites bakifrån och fram
  const list = [];
  for (const e of ents) list.push({ x: e.x, y: e.y, k: 'e', o: e });
  for (const it of items) if (!it.taken) list.push({ x: it.x, y: it.y, k: 'i', o: it });
  for (const p of pots) if (!p.broken) list.push({ x: p.x, y: p.y, k: 'p', o: p });
  for (const t of torches) if (!t.hidden) list.push({ x: t.x, y: t.y, k: 't', o: t });
  for (const c of chests) list.push({ x: c.x, y: c.y, k: 'c', o: c });
  for (const m of merchants) if (shadowVisible(m)) list.push({ x: m.x, y: m.y, k: 'm', o: m });
  if (pet) list.push({ x: pet.x, y: pet.y, k: 'pet', o: pet });
  for (const a of allies) list.push({ x: a.x, y: a.y, k: 'al', o: a });
  for (const p of particles) list.push({ x: p.x, y: p.y, k: 'x', o: p });
  for (const p of projectiles) list.push({ x: p.x, y: p.y, k: 'f', o: p });
  for (const p of portals) list.push({ x: p.x, y: p.y, k: 'g', o: p });
  for (const d of decals) list.push({ x: d.x, y: d.y, k: 'q', o: d });
  for (const h of hazards) if (h.t >= h.warn || h.kind === 'meteor' || h.kind === 'rockfall') list.push({ x: h.x, y: h.y, k: 'z', o: h });
  for (const c of clones) if (c.t >= 0) list.push({ x: c.x, y: c.y, k: 'n', o: c });
  for (const g of ghosts) list.push({ x: g.x, y: g.y, k: 'h', o: g });
  for (const ic of icicles) list.push({ x: ic.x, y: ic.y, k: 'ic', o: ic });
  for (const e of echoes) list.push({ x: e.x, y: e.y, k: 'y', o: e });
  for (const m of mirrors) list.push({ x: m.x, y: m.y, k: 'w', o: m });
  for (const p of props) { if (p.broken) continue; const dx = p.x - P.x, dy = p.y - P.y; if (dx * dx + dy * dy < 900) list.push({ x: p.x, y: p.y, k: 'q', o: p }); }
  for (const s of list) s.d = (s.x - P.x) ** 2 + (s.y - P.y) ** 2;
  list.sort((p, q) => q.d - p.d);
  for (const s of list) try { // en trasig sprite får inte stoppa bilden
    const o = s.o;
    if (s.k === 'x' && s.d < 0.2 && o.size < 0.3) continue; // småpartiklar alldeles framför kameran blir jättestora
    if (s.k === 'e') {
      if (o.boss) {
        if (o.dead || o.hidden) continue;
        const moving = Math.hypot(o.mvx || 0, o.mvy || 0) > 0.002; // springer: titta åt rörelsen, annars mot spelaren
        const flip = moving ? (o.mvx * plX + o.mvy * plY) < 0 : (o.x - P.x) * plX + (o.y - P.y) * plY > 0;
        drawSprite(bossFrame(o), o.x, o.y, o.d.size, o.dying ? -o.dying * 0.3 : 0, flip, null, o.flash > 0 ? o.flash : 0, 0.75, false,
          o.dying ? [255, 120, 60] : o.stun > 0 ? [160, 200, 255] : o.id === 'ghost' ? [190, 220, 255] : null, o.id === 'ghost' ? 0.2 : 0);
        continue;
      }
      if (!o.dead && o.state === 'attack') o.flip = (o.x - P.x) * plX + (o.y - P.y) * plY > 0; // vänd mot mitten när den anfaller
      else if (!o.dead && (o.mvx || o.mvy)) o.flip = o.mvx * plX + o.mvy * plY < 0;
      if (o.gibbed) continue;
      const tint = o.dead ? null : o.backT > tmr ? [255, 150, 40] : o.empowered ? [210, 120, 255] : o.bounty ? (tmr % 0.6 < 0.3 ? [255, 120, 60] : [255, 200, 90]) : o.champion ? [255, 215, 90] : o.frozen > 0 ? [150, 210, 255] : o.burn > 0 ? [255, 150, 70] : o.slow > 0 ? [120, 170, 255] : o.marks >= 4 ? [210, 110, 255] : o.poison > 0 ? [140, 255, 100] : o.haste > 0 ? [150, 255, 150] : o.elite ? o.elite.tint : o.veteran ? [255, 175, 165] : null;
      if (!o.dead && fx.parts.shadow && s.d < 200) drawSprite(fx.parts.shadow[0], o.x, o.y, 0.05 * o.d.size, 0, false, null, 0, 0); // skugga på golvet
      const tele = !o.dead && o.state === 'attack' && o.d.melee && enemyFrames[o.type] && o.t < enemyFrames[o.type].attack.length / o.d.atkFps * o.d.hitAt && o.t > enemyFrames[o.type].attack.length / o.d.atkFps * o.d.hitAt - 0.18 ? 0.45 : 0; // anfallet blinkar i förväg
      const tw = o.dead && o.t < 0.5 && !o.boss ? Math.sin(tmr * 70) * 0.025 * (0.5 - o.t) * 2 : 0; // sista ryckningen
      if (settings.outline && !o.dead && !o.dormant) spriteOutline = o.elite || o.boss ? 0xff30c0ff : 0xff3050ff;
      drawSprite(enemyFrame(o), o.x + tw * plX, o.y + tw * plY, o.d.size * 1.15, (o.d.ai === 'fly' || o.d.ai === 'wisp') && !o.dead ? 0.3 + Math.sin(tmr * 3 + o.x) * 0.06 : 0, o.flip, null, Math.max(tele, o.flash > 0 ? o.flash : 0), o.elite ? 0.3 : 0, false, tint, o.dead ? 0 : o.ghost || 0);
      spriteOutline = 0;
      if (o.carry && !o.dead && !(o.ghost > 0.5)) { const ci = o.carry === 'key' ? spr.key : o.carry === 'grenade' ? spr.grenade : o.carry === 'potion' ? spr.potion_unknown || spr.health : fx.coin[Math.floor(tmr * 8) % 4]; if (ci) drawSprite(ci, o.x, o.y, 0.12, o.d.size * 1.05 + 0.05 * Math.sin(tmr * 4), false, null, 0, 0.6); } // bär ett föremål
      if (o.leader && !o.dead && fx.parts.star) drawSprite(fx.parts.star[0], o.x, o.y, 0.08, o.d.size * 1.12, false, 1.6, 0, 0, true, [255, 220, 90]); // ledaren
      if (!o.dead && o.alert && !o.dormant && !(o.ghost > 0.5) && s.d < 220 && lightAt(o.x, o.y) < 0.4 && o.d.ai !== 'wisp') drawSprite(fx.parts.eye ? fx.parts.eye[0] : fx.hit[1], o.x, o.y, fx.parts.eye ? 0.035 * o.d.size : 0.03, (o.d.ai === 'fly' ? 0.3 : 0) + o.d.size * 0.82, false, 2.2, 0, 0, true, [255, 50, 30]); // glödande ögon i mörkret
    } else if (s.k === 'i') {
      const hopZ = o.hop > 0 ? Math.sin(o.hop / 0.5 * Math.PI) * 0.25 : 0;
      if (o.type === 'gold' || o.type === 'goldpile') { drawSprite(fx.coin[Math.floor(tmr * 8 + o.x * 3) % 4], o.x, o.y + 0 * hopZ, o.type === 'goldpile' ? 0.24 : 0.16, 0.05 + 0.03 * Math.sin(tmr * 4 + o.y) + hopZ, false, null, 0, 0.6); continue; }
      if (o.type === 'rune') { const im = spr['rune_' + o.rune] || spr.rune_item; drawSprite(im || fx.hit[1], o.x, o.y, 0.16, 0.12 + 0.05 * Math.sin(tmr * 3 + o.x), false, 1.8, 0, 0, !im, im ? null : [200, 160, 255]); continue; }
      if (o.type === 'meat') { drawSprite(spr.meat || fx.parts.gib && fx.parts.gib[0] || fx.hit[0], o.x, o.y, 0.14, 0.04, false, null, 0, 0.5); continue; }
      if (o.type === 'arrowpick') { drawSprite(fx.parts.arrow ? fx.parts.arrow[0] : fx.hit[1], o.x, o.y, 0.05, 0.25, false, null, 0, 0.5); continue; }
      if (o.type === 'potion') { const im = spr[potKnown(o.pot) ? 'potion_' + o.pot : 'potion_unknown'] || spr['potion_' + o.pot]; drawSprite(im || spr.health, o.x, o.y, im ? 0.22 : 0.3, 0.05 + 0.04 * Math.sin(tmr * 3 + o.x) + hopZ, false, null, 0, 0.6, false, im ? null : POTIONS[o.pot] ? POTIONS[o.pot].tint : null); continue; }
      if (o.type === 'cardpick') { drawSprite(spr.cardback, o.x, o.y, 0.34, 0.12 + 0.05 * Math.sin(tmr * 3 + o.x), false, 2, 0, 0.8); continue; }
      if (o.type === 'grenade' || o.type === 'key' || o.type === 'scroll') { drawSprite(spr[o.type] || fx.coin[0], o.x, o.y, o.type === 'key' ? 0.2 : 0.18, 0.05 + 0.04 * Math.sin(tmr * 3 + o.x), false, null, 0, 0.7); continue; }
      if (o.type === 'ammo' && o.mult && o.mult !== 1) { drawSprite((o.mult > 1 ? spr.ammo_big : spr.ammo_small) || spr.ammo, o.x, o.y, o.mult > 1 ? 0.42 : 0.24, 0.04 + 0.04 * Math.sin(tmr * 3 + o.x), false, null, 0, 0.5); continue; }
      const img = spr[o.type] || spr['pick_' + o.type];
      if (o.type === 'shard') { drawSprite(spr.armor, o.x, o.y, 0.2, 0.04 + 0.04 * Math.sin(tmr * 4 + o.x), false, null, 0, 0.5, false, [150, 200, 255]); continue; }
      const big = o.type === 'health' || o.type === 'armor';
      drawSprite(img, o.x, o.y, big ? 0.42 : o.type === 'ammo' ? 0.32 : 0.3, 0.04 + 0.04 * Math.sin(tmr * 3 + o.x), false, null, 0, 0.5);
    } else if (s.k === 'p') drawSprite(fx.pots[o.color], o.x, o.y, 0.55, 0, false);
    else if (s.k === 't') drawSprite(fx.fire[Math.floor(tmr * 14 + o.ph * 5) % 16], o.x, o.y, 0.85, 0, false, 2.2, 0, 0, true);
    else if (s.k === 'c') { drawSprite(o.open ? fx.chestOpen[Math.min(3, Math.floor(o.t * 10))] : fx.chest[Math.floor(tmr * 3) % 4], o.x, o.y, 0.5, 0, false, null, 0, 0.6, false, o.open ? null : o.locked ? [255, 220, 120] : o.cursed ? [200, 120, 255] : null);
      if (!o.open && o.rare && Math.random() < 0.15) particles.push({ x: o.x + rnd(-0.25, 0.25), y: o.y + rnd(-0.25, 0.25), z: rnd(0.1, 0.4), vx: 0, vy: 0, vz: 0.3, life: 0.5, maxLife: 0.5, img: fx.hit[1], size: 0.05, add: true, tint: [255, 230, 120], drift: true }); } // sällsynta kistor glittrar
    else if (s.k === 'm') drawSprite(fx.merchant[Math.floor(tmr * 5) % 6], o.x, o.y, 1.05, 0, (o.x - P.x) * plX + (o.y - P.y) * plY > 0, null, 0, o.shadow ? 0.25 : 0.55, false, o.shadow ? [150, 120, 255] : null, o.shadow ? 0.35 : 0);
    else if (s.k === 'pet') drawPet(o, plX, plY);
    else if (s.k === 'al') drawSprite(enemyFrame(o), o.x, o.y, o.d.size * 1.15, o.d.ai === 'fly' ? 0.3 : 0, (o.mvx || o.mvy) ? o.mvx * plX + o.mvy * plY < 0 : false, null, 0, 0.4, false, o.tint, 0.15);
    else if (s.k === 'q') { if (o.def && o.def.light && !o.used && !settings.lowfx && s.d < 150) drawSprite(fx.fireball[4], o.x, o.y, o.size * 0.9, o.size * 0.3, false, 0.35 + 0.05 * Math.sin(tmr * 7 + o.ph), 0, 0, true, o.poisoned ? [90, 255, 80] : PROP_GLOW[o.ch] || [255, 170, 80]); // glöd
      if (o.def) drawSprite(propImg(o), o.x + (o.off && !o.axis ? o.off : 0), o.y + (o.off && o.axis ? o.off : 0), o.size, o.z || 0, o.flip, o.def.light && !o.used ? 1.6 : null, o.flashT > tmr ? 0.8 : 0, o.def.npc ? 0.45 : 0.3, false, o.poisoned ? [130, 255, 120] : null); else drawSprite(o.img, o.x, o.y, o.size, 0, o.flip); }
    else if (s.k === 'ic') drawSprite(fx.parts.icicle ? fx.parts.icicle[0] : fx.hit[1], o.x, o.y, 0.3, o.fall < 0 ? 0.68 : Math.max(0, 0.68 - o.fall * o.fall * 4), false, null, 0, 0.5, false, [200, 230, 255]);
    else if (s.k === 'h') drawSprite(bossFx.ghost.idle[Math.floor(tmr * 7) % bossFx.ghost.idle.length], o.x, o.y, 0.9, 0.15 + Math.sin(tmr * 2) * 0.05, (o.x - P.x) * plX + (o.y - P.y) * plY > 0, 1.2, 0, 0, false, [170, 230, 200], 0.45);
    else if (s.k === 'y') drawSprite(fx.graves[0], o.x, o.y, 0.5, 0, false, null, 0, 0.5, false, [200, 160, 255]);
    else if (s.k === 'n') drawSprite(bossFx.nightmare ? bossFx.nightmare.run[Math.floor(tmr * 10) % bossFx.nightmare.run.length] : fx.fireball[0], o.x, o.y, 1.6, 0, Math.cos(o.a) * plX + Math.sin(o.a) * plY < 0, 0.5, 0, 0, false, [60, 40, 90], 0.5);
    else if (s.k === 'w') drawSprite(bossFx.ghost ? bossFx.ghost.idle[Math.floor(tmr * 7) % bossFx.ghost.idle.length] : fx.fireball[0], o.x, o.y, 1.65, 0.1 + Math.sin(tmr * 2 + o.x) * 0.05, false, null, 0, 0.75, false, [190, 220, 255], 0.35);
    else if (s.k === 'z' && (o.kind === 'meteor' || o.kind === 'rockfall') && o.t < o.warn) { const k = 1 - o.t / o.warn; // faller ned
      drawSprite(o.kind === 'meteor' ? (fx.parts.meteor ? fx.parts.meteor[Math.floor(tmr * 10) % 2] : fx.fireball[0]) : (fx.parts.rock ? fx.parts.rock[0] : fx.shards[7]), o.x, o.y, o.kind === 'meteor' ? 0.5 : 0.35, k * 3, false, o.kind === 'meteor' ? 2.2 : null, 0, 0.5, o.kind === 'meteor'); }
    else if (s.k === 'z' && (o.kind === 'meteor' || o.kind === 'rockfall')) { /* nedslaget syns som partiklar */ }
    else if (s.k === 'z') { const k = Math.min(1, (o.t - o.warn) * 6, (o.warn + o.life - o.t) * 4); // faror växer upp och sjunker undan
      if (o.kind === 'lavaburst') drawSprite(fx.fire[Math.floor(tmr * 14 + o.x * 5) % 16], o.x, o.y, 0.9 * k, 0, false, 2.4, 0, 0, true, [255, 120, 40]);
      else if (o.kind === 'icespike') drawSprite(fx.parts.icicle ? fx.parts.icicle[0] : fx.hit[1], o.x, o.y, 0.6 * k, 0, false, 1.4, 0, 0, false, [190, 230, 255]);
      else if (o.kind === 'pillar') drawSprite(bossFx.beast.pillar[Math.floor(tmr * 10) % 2], o.x, o.y, 2.2 * k, 0, false, 2.4, 0, 0, true);
      else drawSprite(fx.fire[Math.floor(tmr * 14 + o.x * 5) % 16], o.x, o.y, 0.7 * k, 0, false, 2.2, 0, 0, true, [25, 80, 255]); }
    else if (s.k === 'g') drawSprite(fx.portal[Math.floor(tmr * 10) % 8], o.x, o.y, Math.min(1.25, o.t * 3), 0.02, false, 2.4, 0, 0, true, o.kind === 'boss' ? [255, 170, 120] : o.biome && portals.length > 1 ? BIOME_TINT[o.biome] || null : null);
    else if (s.k === 'f' && o.kind === 'axe') drawSprite(spr.pick_axe || fx.hit[0], o.x, o.y, 0.3, o.z - 0.1, Math.floor(tmr * 12) % 2 === 0, null, 0, 0.6);
    else if (s.k === 'f' && o.kind === 'barrel') drawSprite(o.img, o.x, o.y, 0.5, 0, Math.floor(tmr * 8) % 2 === 0, null, 0, 0.5);
    else if (s.k === 'f' && o.kind === 'log') drawSprite(fx.parts.log ? fx.parts.log[Math.floor(tmr * 8) % fx.parts.log.length] : fx.hit[0], o.x, o.y, 0.3, 0, false, null, 0, 0.5);
    else if (s.k === 'f' && o.kind === 'skull') drawSprite(fx.parts.skull ? fx.parts.skull[Math.floor(tmr * 8) % 2] : fx.fireball[0], o.x, o.y, 0.24, o.z - 0.1, false, 2, 0, 0, true, [120, 190, 255]);
    else if (s.k === 'f' && o.kind === 'web') drawSprite(fx.parts.webshot ? fx.parts.webshot[0] : fx.hit[0], o.x, o.y, 0.15, o.z - 0.05, false, null, 0, 0.7);
    else if (s.k === 'f' && o.kind === 'arrow') drawSprite(fx.parts.rock ? fx.parts.rock[0] : fx.hit[0], o.x, o.y, 0.08, o.z - 0.05, false, null, 0, 0.6, false, PROJ_TINT_ARROW);
    else if (s.k === 'f' && o.kind === 'nail') drawSprite(fx.parts.nail ? fx.parts.nail[0] : fx.hit[1], o.x, o.y, 0.03, o.z - 0.02, false, o.hot ? 2 : null, 0, 0.6, !!o.hot, o.hot ? [255, 150, 60] : [200, 200, 210]);
    else if (s.k === 'f' && o.kind === 'parrow') drawSprite(fx.parts.arrow ? fx.parts.arrow[0] : fx.hit[1], o.x, o.y, 0.05, o.z - 0.03, Math.cos(Math.atan2(o.vy, o.vx) - view.a) < 0, null, 0, 0.6, false, o.full ? [255, 230, 150] : null);
    else if (s.k === 'f' && o.kind === 'sorb') drawSprite(fx.parts.lightning ? fx.parts.lightning[Math.floor(tmr * 14) % fx.parts.lightning.length] : fx.fireball[Math.floor(tmr * 16) % 8], o.x, o.y, o.big ? 0.55 : 0.4, o.z - 0.2, false, 2.4, 0, 0, true, [150, 200, 255]);
    else if (s.k === 'f' && o.kind === 'pgren') drawSprite(spr.grenade || fx.coin[0], o.x, o.y, 0.13, o.z, false, null, 0, 0.6);
    else if (s.k === 'f') {
      if (!o.friendly && !settings.lowfx) drawSprite(fx.fireball[Math.floor(tmr * 16) % 8], o.x, o.y, o.big ? 0.9 : 0.55, o.z - 0.3, false, 1.0, 0, 0, true, PROJ_TINT[o.kind] || [255, 140, 60]); // fiendeskott glöder
      drawSprite(fx.fireball[Math.floor(tmr * 16) % 8], o.x, o.y, o.big ? 0.5 : o.kind === 'gren' || o.kind === 'spark' ? 0.18 : o.kind === 'flare' ? 0.26 : 0.3, o.z - 0.15, false, 2.4, 0, 0, true, PROJ_TINT[o.kind] || null); }
    else drawSprite(o.img, o.x, o.y, o.size, o.z, false, o.add ? (o.fade ? 2 * Math.min(1, o.life * 2, (o.maxLife - o.life) * 2) : 2) : null, 0, 0, o.add, o.tint || null);
  } catch (err) { spriteError(err, s); }
  applyGrade();
  if (P.hp < maxHp() * 0.3 && state === 'play' && settings.lowHpGray !== false) desaturate(0.55 * (1 - P.hp / (maxHp() * 0.3))); // låg HP: bilden gråas
  if (Math.abs(P.roll) > 0.002 && state === 'play') { // lutning vid sidosteg
    rollCtx.putImageData(frame, 0, 0);
    ctx.save(); ctx.translate(W / 2, VH / 2); ctx.rotate(P.roll); ctx.scale(1.05, 1.05); ctx.drawImage(rollCan, -W / 2, -VH / 2); ctx.restore();
  } else ctx.putImageData(frame, 0, 0);
  if (photo) { ctx.fillStyle = '#000'; ctx.fillRect(0, VH, W, HUD_H); }
}
let skyFx = false, bossIntro = 0;
const MOON_A = 0.9;
function skyPixel(c, x, y, hor) { // månen, molnen och stjärnfall på natthimlen
  const a = colAng[x], top = hor - y;
  if (spr.moon) { let da = a - MOON_A; da = Math.atan2(Math.sin(da), Math.cos(da)); const mx = (da / 0.16 + 0.5) * spr.moon.w, my = spr.moon.h - (top - 34) / 26 * spr.moon.h;
    if (mx >= 0 && mx < spr.moon.w && my >= 0 && my < spr.moon.h) { const m = spr.moon.data[(my | 0) * spr.moon.w + (mx | 0)]; if (m >>> 24) c = floorEvent === 'bloodmoon' ? (m & 0xff00ffff) | 0x60 << 8 : m; } }
  if (spr.clouds && top > 6 && top < 30) { const cl = spr.clouds, u = ((((a / TAU) + 1) * cl.w * 2 + tmr * 3) | 0) % cl.w, v = ((top - 6) / 24 * cl.h) | 0; const m = cl.data[(cl.h - 1 - v) * cl.w + u]; if (m >>> 24) c = m; }
  if (lvl && lvl.biome === 'volcano') c = (c & 0xff000000) | (Math.min(255, ((c >> 16) & 255) * 0.5) << 16) | (Math.min(255, ((c >> 8) & 255) * 0.6 + 8) << 8) | Math.min(255, (c & 255) * 1.3 + 40 + (top > 20 ? 0 : (20 - top) * 2)); // röd himmel av glöd och rök
  if (star) { let da = a - star.a; da = Math.atan2(Math.sin(da), Math.cos(da)); const sx = star.t * 0.5, sy = star.y + star.t * 14; if (Math.abs(da - sx) < 0.05 && Math.abs(top - (40 - sy) + da * 60) < 1.2 && da < sx) c = 0xffffffff; }
  return c;
}
const rollCan = document.createElement('canvas'); rollCan.width = W; rollCan.height = VH; const rollCtx = rollCan.getContext('2d');
function desaturate(k) {
  for (let i = 0; i < px.length; i++) { const c = px[i], r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255, l = (r * 0.3 + g * 0.59 + b * 0.11);
    px[i] = 0xff000000 | (((b + (l - b) * k) | 0) << 16) | (((g + (l - g) * k) | 0) << 8) | ((r + (l - r) * k) | 0); }
}
// Tecknar en billboard-sprite. size = höjd i världsenheter, z = höjd över golvet. tint = [r,g,b] färgton.
let spriteOutline = 0;
function drawSprite(img, wx, wy, size, z, flip, fixedLight, whiteFlash = 0, minLight = 0, additive = false, tint = null, ghost = 0) {
  const { dirX, dirY, plX, plY, hor, camZ } = view;
  const rx = wx - P.x, ry = wy - P.y;
  const inv = 1 / (plX * dirY - dirX * plY);
  const tx = inv * (dirY * rx - dirX * ry), ty = inv * (-plY * rx + plX * ry);
  if (ty < 0.12) return;
  const scale = VH / ty;
  const sh = scale * size, sw = sh * img.w / img.h;
  const cx = (W / 2) * (1 + tx / ty);
  const bottom = hor + scale * (camZ - z);
  const topY = bottom - sh, left = cx - sw / 2;
  const L = fixedLight || Math.max(minLight, lightAt(wx, wy));
  const sci = !fixedLight && wx >= 0 && wy >= 0 && wx < mw && wy < mh ? (wy | 0) * mw + (wx | 0) : -1;
  const x0 = Math.max(0, Math.ceil(left)), x1 = Math.min(W - 1, Math.floor(left + sw));
  const y0 = Math.max(0, Math.ceil(topY)), y1 = Math.min(VH - 1, Math.floor(bottom));
  const ff = Math.exp(-ty * fogK);
  const aMul = additive && fixedLight != null ? Math.min(1.2, fixedLight / 2) : 1; // additiva sprites: fixedLight styr styrkan (uttoning)
  const tr = tint ? tint[0] / 255 * 1.3 : 1, tg = tint ? tint[1] / 255 * 1.3 : 1, tb = tint ? tint[2] / 255 * 1.3 : 1;
  for (let x = x0; x <= x1; x++) {
    if (ty >= zbuf[x]) continue;
    let u = Math.floor((x - left) / sw * img.w); if (flip) u = img.w - 1 - u;
    if (u < 0 || u >= img.w) continue;
    for (let y = y0; y <= y1; y++) {
      const v = Math.floor((y - topY) / sh * img.h);
      if (v < 0 || v >= img.h) continue;
      let c = img.data[v * img.w + u];
      const al = c >>> 24;
      if (al < 100) { if (spriteOutline && ty < zbuf[x] && ((u > 0 && img.data[v * img.w + u - 1] >>> 24 >= 100) || (u < img.w - 1 && img.data[v * img.w + u + 1] >>> 24 >= 100) || (v > 0 && img.data[(v - 1) * img.w + u] >>> 24 >= 100) || (v < img.h - 1 && img.data[(v + 1) * img.w + u] >>> 24 >= 100))) px[y * W + x] = spriteOutline; continue; } // kontur (inställning)
      if (ghost && ((x * 7 + y * 13) % 10) < ghost * 10) continue; // gravrövaren: bara några pixlar syns
      const i = y * W + x;
      if (additive) { // eld lyser: additiv blandning
        const d = px[i], k = ff * (al / 255) * aMul;
        const r = Math.min(255, (d & 255) + (c & 255) * k * tr), g = Math.min(255, ((d >> 8) & 255) + ((c >> 8) & 255) * k * tg), b = Math.min(255, ((d >> 16) & 255) + ((c >> 16) & 255) * k * tb);
        px[i] = 0xff000000 | (b << 16) | (g << 8) | r;
      } else {
        if (tint) c = 0xff000000 | (Math.min(255, ((c >> 16) & 255) * tb) << 16) | (Math.min(255, ((c >> 8) & 255) * tg) << 8) | Math.min(255, (c & 255) * tr);
        let col = shadeFog(c, L, ty, sci);
        if (whiteFlash > 0) { const f = Math.min(1, whiteFlash * 6); col = 0xff000000 | ((((col >> 16) & 255) * (1 - f) + 255 * f) << 16) | ((((col >> 8) & 255) * (1 - f) + 255 * f) << 8) | (((col & 255) * (1 - f) + 255 * f) | 0); }
        px[i] = col;
      }
    }
  }
}
// projicera en världspunkt till skärmen (för skadesiffror och livmätare)
function project(wx, wy, z) {
  const { dirX, dirY, plX, plY, hor, camZ } = view;
  const rx = wx - P.x, ry = wy - P.y, inv = 1 / (plX * dirY - dirX * plY);
  const tx = inv * (dirY * rx - dirX * ry), ty = inv * (-plY * rx + plX * ry);
  if (ty < 0.2) return null;
  const sx = Math.round((W / 2) * (1 + tx / ty));
  if (sx < 0 || sx >= W || zbuf[sx] < ty) return null;
  return { sx, sy: hor + (VH / ty) * (camZ - z), scale: VH / ty };
}
function enemyFrame(e) {
  const set = enemyFrames[e.type];
  let key = 'move', n = 0;
  if (e.dead) { key = 'death'; n = Math.min(set.death.length - 1, Math.floor(e.t * 12)); }
  else if (e.state === 'pain') { key = 'pain'; n = Math.min(set.pain.length - 1, Math.floor(e.t * 14)); }
  else if (e.state === 'attack') { key = 'attack'; n = Math.min(set.attack.length - 1, Math.floor(e.t * e.d.atkFps)); }
  else if (e.state === 'idle') { key = 'idle'; n = Math.floor(tmr * 6 + e.x * 3) % set.idle.length; }
  else { n = Math.floor(e.t * 9 * e.d.speed / 1.3) % set.move.length; }
  return set[key][n];
}
function propImg(o) {
  const f = o.frames, d = o.def;
  if (d.npc || (d.use && d.anim && !o.used)) return f[Math.floor(tmr * d.anim + o.ph) % f.length];
  if (d.use) return f[o.used && f.length > 1 ? 1 : 0];
  if (d.trap) return f[o.up && f.length > 1 ? 1 : 0];
  if (d.anim) return f[Math.floor(tmr * d.anim + o.ph) % f.length];
  return f[0];
}
function bossFrame(b) {
  const at = (arr, k) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(k)))], loop = (arr, fps) => arr[Math.floor(tmr * fps) % arr.length];
  if (b.id === 'demon' || !bossFx[b.id]) {
    const set = enemyFrames.B;
    if (b.state === 'breath') return set.breath[Math.min(17, Math.floor(b.t * 12))];
    if (b.state === 'slam') return set.attack[Math.min(17, Math.floor(b.t * 14))];
    return set.idle[Math.floor(tmr * 7) % 6];
  }
  const f = bossFx[b.id];
  switch (b.id) {
    case 'beast': return b.state === 'breath' ? loop(f.breath, 8) : b.state === 'burn' || b.state === 'sink' ? at(f.burn, b.t * 6) : loop(f.idle, 7);
    case 'nightmare': return b.state === 'charge' || b.state === 'circle' ? loop(f.run, 10) : loop(f.idle, b.state === 'windup' ? 14 : 6);
    case 'ogre': return b.state === 'smash' || b.state === 'throw' ? at(f.attack, b.t / 1.1 * 7) : Math.hypot(b.mvx || 0, b.mvy || 0) > 0.002 ? loop(f.walk, 8) : loop(f.idle, 5);
    case 'flame': return b.dying && f.death ? at(f.death, b.dying * 6) : b.flash > 0.06 && f.hurt && b.state !== 'slam' ? loop(f.hurt, 12) : b.state === 'slam' ? at(f.attack, b.t / 1.3 * f.attack.length) : b.state === 'volley' || b.state === 'special' ? loop(f.cast, 9) : loop(f.idle, 7);
    case 'frost': return b.dying && f.death ? at(f.death, b.dying * 6) : b.flash > 0.06 && f.hurt && b.state !== 'slam' ? loop(f.hurt, 12) : b.state === 'slam' ? at(f.attack, b.t / 1.1 * f.attack.length) : b.state === 'shards' || b.state === 'special' ? loop(f.cast, 9) : loop(f.idle, 6);
    case 'ghost': return b.state === 'vanish' ? at(f.vanish, b.t * 10) : b.state === 'appear' ? at(f.appear, b.t * 10) : b.state === 'shriek' ? loop(f.shriek, 10) : b.state === 'orbs' ? loop(f.idle, 10) : loop(f.chase, 8);
  }
  return loop(f.idle, 6);
}

// ---------- Förstapersonsvapen ----------
const wcan = document.createElement('canvas'), wctx = wcan.getContext('2d');
function weaponFrame() { // bildruta och förskjutning: vapnet sticker rakt fram (Doom/Quake), rörelser görs här
  const wp = WEAPONS[P.weapon], f = WF[wp.id] || WF.pistol, st = f.states;
  const pick = (arr, k) => arr[clamp(Math.floor(k * arr.length), 0, arr.length - 1)];
  let idx = st.idle[0], dx = 0, dy = 0;
  if (WS.shot < f.dur.fire) idx = pick(st.fire, WS.shot / f.dur.fire);
  else if (st.draw && WS.draw > 0) idx = pick(st.draw, WS.draw * 0.999); // bågen spänns
  const kt = WS.shot / 0.16; // rekyl: knyck nedåt och tillbaka
  if (kt < 1) dy += Math.sin(Math.min(1, kt) * Math.PI) * wp.kick * 7 * (1 - WS.aim * 0.5);
  if (WS.state === 'draw') dy += (1 - easeOut(WS.t / drawTime())) * f.h;
  else if (WS.state === 'holster') dy += easeIn(WS.t / 0.22) * f.h;
  else if (WS.state === 'reload') {
    if (wp.shellReload) { // ner lite för varje patron
      const k = WS.t / shellSeg(WS.shellPhase);
      dy += WS.shellPhase === 'start' ? easeOut(k) * 34 : WS.shellPhase === 'end' ? (1 - easeIn(k)) * 34 : 34 + Math.sin(k * Math.PI) * 10;
      dx += WS.shellPhase === 'step' ? -Math.sin(k * Math.PI) * 4 : 0;
    } else dy += Math.sin(clamp(WS.t / (wp.reload * reloadMul()), 0, 1) * Math.PI) * f.h * 0.75;
  }
  dx += (160 - (f.x + f.w / 2)) * WS.aim * 0.6; dy -= WS.aim * 6; // sikta: in mot mitten och upp
  if (state === 'dead' || state === 'runover') dy += Math.min(f.h, P.deadT * 160);
  return { f, idx, dx, dy };
}
const easeOut = k => 1 - (1 - clamp(k, 0, 1)) ** 2, easeIn = k => clamp(k, 0, 1) ** 2;
const drawTime = () => 0.32;
const shellSeg = ph => (ph === 'start' ? 0.32 : ph === 'step' ? 0.5 : 0.42) * reloadMul();
function drawWeapon() {
  const { f, idx, dx, dy } = weaponFrame();
  const amp = P.bobAmp * (1 - WS.aim * 0.75);
  const breathe = settings.bob === false ? 0 : Math.sin(tmr * 1.7) * 1.3 * (1 - Math.min(1, amp)); // vapnet andas i vila
  const insp = WS.inspect > 0 ? Math.sin(Math.min(1, (1.6 - WS.inspect) / 1.6) * Math.PI) : 0;
  const ox = Math.round(Math.sin(P.bob) * 4 * amp * (settings.bob === false ? 0.3 : 1) - WS.swayX + dx - insp * 34), oy = Math.round(P.runK * 12 + insp * 10 + P.jv * -2 + Math.abs(Math.cos(P.bob)) * 3 * amp * (settings.bob === false ? 0.3 : 1) - WS.swayY + dy + breathe + shakeAmt() * 4 * Math.sin(tmr * 41) + P.pitch * 0.6 + Math.sin(Math.min(1, WS.kick / 0.3) * Math.PI) * 14);
  const img = WF[WEAPONS[P.weapon].id] ? wimg[WEAPONS[P.weapon].id] : wimg.pistol;
  const L = clamp(lightAt(P.x, P.y) * 1.05 + P.flash * 4, 0.28, 1.25);
  if (wcan.width !== f.w || wcan.height !== f.h) { wcan.width = f.w; wcan.height = f.h; }
  wctx.globalCompositeOperation = 'source-over'; wctx.clearRect(0, 0, f.w, f.h);
  wctx.drawImage(img, idx * f.w, 0, f.w, f.h, 0, 0, f.w, f.h);
  if (L < 1) { wctx.globalCompositeOperation = 'source-atop'; wctx.fillStyle = `rgba(${lvl.fog.join(',')},${(1 - L).toFixed(3)})`; wctx.fillRect(0, 0, f.w, f.h); }
  else if (L > 1) { wctx.globalCompositeOperation = 'source-atop'; wctx.fillStyle = `rgba(255,190,120,${((L - 1) * 0.6).toFixed(3)})`; wctx.fillRect(0, 0, f.w, f.h); }
  { const rs = curRunes(); if (rs.length) { const t = RUNES[rs[(tmr | 0) % rs.length]].tint; wctx.globalCompositeOperation = 'source-atop'; wctx.fillStyle = `rgba(${t[0]},${t[1]},${t[2]},${(0.1 + 0.07 * Math.sin(tmr * 4)).toFixed(3)})`; wctx.fillRect(0, 0, f.w, f.h); } } // runans glöd
  if (settings.skin && SKINS[settings.skin] && skinOpen(settings.skin)) { wctx.globalCompositeOperation = 'source-atop'; wctx.fillStyle = SKINS[settings.skin].col; wctx.fillRect(0, 0, f.w, f.h); } // vapenfärg
  ctx.drawImage(wcan, f.x + ox, f.y + oy);
  if (WS.shot < 0.06 && state === 'play') { // mynningsflamma vid mynningen i just den här bildrutan
    const wp = WEAPONS[P.weapon], m = f.muzzle[idx], s = 34 * wp.flash * (1 - WS.shot / 0.06 * 0.4);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.translate(m[0] + ox, m[1] + oy); ctx.rotate(Math.random() * TAU);
    ctx.drawImage(wimg.flash, -s / 2, -s / 2, s, s);
    ctx.restore();
  }
}

// ---------- HUD ----------
function drawWorldOverlay() { // skadesiffror, livmätare för eliter
  ctx.textBaseline = 'top';
  for (const e of ents) {
    if (e.dead || e.boss || e.hidden || (e.ghost || 0) > 0.5) continue;
    const p = project(e.x, e.y, e.d.size * 1.2 + 0.08); if (!p) continue;
    const y = Math.round(p.sy) - 4;
    if (e.spotT > 0) txt('!', Math.round(p.sx - 3), y - 12 - Math.round(Math.sin(e.spotT * 9) * 2), '#ff5030', 1, true, Math.min(1, e.spotT * 3)); // har sett dig
    if (settings.enemyBars === false || (!e.elite && (e.hp >= e.maxHp || p.scale < 14))) continue; // vanliga fiender visar mätaren när de skadats
    const w = Math.round(clamp(p.scale * (e.elite ? 0.6 : 0.35), e.elite ? 12 : 8, e.elite ? 40 : 20)), x = Math.round(p.sx - w / 2);
    ctx.fillStyle = '#000a'; ctx.fillRect(x - 1, y - 1, w + 2, 4);
    ctx.fillStyle = e.frozen > 0 ? '#80c8ff' : e.poison > 0 ? '#70d050' : e.burn > 0 ? '#ff9030' : e.elite ? '#c03020' : '#a04030'; ctx.fillRect(x, y, Math.max(0, w * e.hp / e.maxHp), 2);
    let sx = x + w + 2; for (const [on, col] of [[e.burn > 0, '#ff9030'], [e.poison > 0, '#70d050'], [e.frozen > 0 || e.slow > 0, '#80c8ff'], [e.bleed > 0, '#d02030'], [e.stun > 0, '#ffe070']]) if (on) { ctx.fillStyle = col; ctx.fillRect(sx, y - 1, 2, 3); sx += 3; } // statusprickar
    if (e.eshield > 0) { ctx.fillStyle = '#6fb0ff'; ctx.fillRect(x, y + 2, Math.max(0, w * e.eshield / e.eshieldMax), 1); }
    if (e.elite && p.scale > 40) txt(e.elite.name, Math.round(p.sx - textW(e.elite.name) / 2), y - 10, '#ffd24a');
  }
  for (const n of numbers) {
    if (settings.dmgNumbers === false && !n.color) continue;
    const p = project(n.x, n.y, n.z); if (!p) continue;
    const s = String(n.v);
    const big = n.crit && n.v >= 40;
    if (n.color) { const w = textW(s); txt(s, Math.round(p.sx - w / 2), Math.round(p.sy), n.color, 1, true, clamp(n.t * 2, 0, 1)); continue; } // stora kritiska träffar syns tydligt
    ctx.font = (big ? 16 : 8) + 'px "PressStart2P"'; const w = ctx.measureText(plain(s)).width;
    txt(s, Math.round(p.sx - w / 2), Math.round(p.sy) - (big ? 6 : 0), n.crit ? '#ffd24a' : '#f0e0c0', big ? 2 : 1, true, clamp(n.t * 2, 0, 1));
  }
}
function enemyUnderCrosshair() {
  for (const e of ents) {
    if (e.dead || e.hidden) continue;
    const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy); if (d > 18) continue;
    let off = Math.atan2(dy, dx) - P.a; off = Math.atan2(Math.sin(off), Math.cos(off));
    if (Math.abs(off) < Math.max(0.02, 0.3 * e.d.size * (e.boss ? 1.8 : 1) / d) && hasLOS(P.x, P.y, e.x, e.y)) return true;
  }
  return false;
}
function drawHUD() {
  const g = ctx, y0 = VH;
  if (state === 'play') drawHeatFx(g);
  drawWorldOverlay();
  for (const h of hurtDir) {
    const rel = h.ang - P.a, sx = W / 2 + Math.sin(rel) * W * 0.42, sy = HORIZON - Math.cos(rel) * VH * 0.4;
    const gr = g.createRadialGradient(sx, sy, 2, sx, sy, 46);
    gr.addColorStop(0, `rgba(${h.col || '220,0,0'},${0.55 * h.t})`); gr.addColorStop(1, `rgba(${h.col || '220,0,0'},0)`);
    g.fillStyle = gr; g.fillRect(sx - 46, sy - 46, 92, 92);
  }
  if (P.hurt > 0) { g.fillStyle = `rgba(190,0,0,${Math.min(0.45, P.hurt * 0.6)})`; g.fillRect(0, 0, W, VH); }
  if (P.pick > 0 && !settings.noFlash) { g.fillStyle = `rgba(255,230,120,${P.pick * 0.22})`; g.fillRect(0, 0, W, VH); }
  if (P.boom > 0 && !settings.noFlash) { g.fillStyle = `rgba(255,240,210,${P.boom.toFixed(3)})`; g.fillRect(0, 0, W, VH); } // nära explosion
  if (state === 'play' && up('bullettime') && WS.aim > 0.8) { g.fillStyle = 'rgba(90,140,255,0.13)'; g.fillRect(0, 0, W, VH); } // tidsstoppet
  if (P.hp < maxHp() * 0.3 && state === 'play') {
    const p = 0.25 + 0.2 * Math.sin(tmr * 6);
    const gr = g.createRadialGradient(W / 2, HORIZON, VH * 0.35, W / 2, HORIZON, W * 0.62);
    gr.addColorStop(0, 'rgba(120,0,0,0)'); gr.addColorStop(1, `rgba(150,0,0,${p})`);
    g.fillStyle = gr; g.fillRect(0, 0, W, VH);
  }
  const xs = settings.xsize || 1; if (state === 'play' && xs !== 1) { g.save(); g.translate(W / 2, HORIZON); g.scale(xs, xs); g.translate(-W / 2, -HORIZON); }
  if (state === 'play') { // sikte
    const gap = Math.round(2 + WS.spread * 160), cx = W / 2, cy = HORIZON;
    g.fillStyle = enemyUnderCrosshair() ? 'rgba(255,80,60,0.95)' : (settings.xcolor || 'rgba(255,255,255,0.85)');
    if (settings.xstyle === 'punkt') g.fillRect(cx - 1, cy - 1, 2, 2);
    else if (settings.xstyle === 'cirkel') { g.fillRect(cx, cy, 1, 1); const r = gap + 3; for (let i = 0; i < 16; i++) g.fillRect(Math.round(cx + Math.cos(i / 16 * TAU) * r), Math.round(cy + Math.sin(i / 16 * TAU) * r), 1, 1); }
    else { g.fillRect(cx - gap - 3, cy, 3, 1); g.fillRect(cx + gap + 1, cy, 3, 1); g.fillRect(cx, cy - gap - 3, 1, 3); g.fillRect(cx, cy + gap + 1, 1, 3); }
    if (WS.focus > 0) { // kalla blodet laddas
      g.strokeStyle = WS.focus >= 1 ? (tmr % 0.3 < 0.15 ? '#ffd24a' : '#ff8030') : 'rgba(255,210,74,0.7)'; g.lineWidth = 1;
      g.beginPath(); g.arc(cx + 0.5, cy + 0.5, 9, -Math.PI / 2, -Math.PI / 2 + TAU * WS.focus); g.stroke();
    }
    if (hitMark > 0) {
      g.fillStyle = hitKill ? '#ff4030' : hitCrit ? '#ffd24a' : '#ffffff';
      for (let i = 2; i < 5; i++) { g.fillRect(cx - i, cy - i, 1, 1); g.fillRect(cx + i, cy - i, 1, 1); g.fillRect(cx - i, cy + i, 1, 1); g.fillRect(cx + i, cy + i, 1, 1); }
    }
  }
  if (state === 'play' && xs !== 1) g.restore();
  const hb = boss && !boss.dead ? boss : guardianE && !guardianE.dead && !guardianE.dying ? guardianE : null;
  if (hb && state === 'play') { // bossens (eller väktarens) livmätare
    const w = hb.guardian ? 140 : 200, x = (W - w) / 2, y = 22;
    g.fillStyle = '#000b'; g.fillRect(x - 2, y - 2, w + 4, 8);
    g.fillStyle = hb.guardian ? '#3a1050' : '#5a1010'; g.fillRect(x, y, w, 4);
    hb.shownHp = hb.shownHp === undefined ? hb.hp : Math.max(hb.hp, hb.shownHp - hb.maxHp * 0.15 * (1 / 60)); // fördröjd stapel
    g.fillStyle = '#f0e0c0'; g.fillRect(x, y, w * Math.max(0, hb.shownHp) / hb.maxHp, 4);
    g.fillStyle = hb.guardian ? '#c050ff' : hb.phase === 3 ? '#ff5020' : '#d02818'; g.fillRect(x, y, w * Math.max(0, hb.hp) / hb.maxHp, 4);
    g.fillStyle = '#000'; g.fillRect(Math.round(x + w / 3), y - 1, 1, 6); g.fillRect(Math.round(x + w * 2 / 3), y - 1, 1, 6); // fasgränser
    if (hb.enraged) txt('RASANDE', x + w + 4, y - 1, tmr % 0.5 < 0.25 ? '#ff4030' : '#a02010');
    txt(hb.d.name, (W - textW(hb.d.name)) / 2, y + 7, '#ffd24a');
  }
  if (levelBanner > 0 && state === 'play') {
    const a = Math.min(1, levelBanner, (3 - levelBanner) * 3), sub = (cycleOf(run.depth) ? `VARV ${cycleOf(run.depth) + 1} · ` : '') + `VÅNING ${run.depth} · ${BIOME_NAME[lvl.biome] || ''}`;
    ctx.font = '16px "PressStart2P"'; const w = ctx.measureText(plain(lvl.name)).width;
    if (w < W - 8) txt(lvl.name, (W - w) / 2, 46, '#e8d9b0', 2, true, a); else txt(lvl.name, (W - textW(lvl.name)) / 2, 50, '#e8d9b0', 1, true, a);
    txt(sub, (W - textW(sub)) / 2, 66, '#c9a87a', 1, true, a);
    if (floorEvent) { const ev = EVENTS[floorEvent].name + ' – ' + EVENTS[floorEvent].text; txt(ev, (W - textW(ev)) / 2, 78, '#ff7060', 1, true, a); }
    if (run.floorCurse) { const t = 'FÖRBANNAD VÅNING: +60 GULD OM DU KLARAR DEN'; txt(t, (W - textW(t)) / 2, 90, '#c080ff', 1, true, a); }
    if (!run.practice && profile.bestDepth > 1) { const t = run.depth > profile.bestDepth ? 'DJUPARE ÄN NÅGONSIN!' : `DJUPMÄTARE: ${run.depth} AV DITT REKORD ${profile.bestDepth}`; txt(t, (W - textW(t)) / 2, 102, run.depth > profile.bestDepth ? '#9fe0a0' : '#8a7a60', 1, true, a * 0.9); }
    if (run.route && run.route[run.depth] > 1) { const t = riskText(lvl.biome); txt(t, (W - textW(t)) / 2, 114, '#ffb060', 1, true, a); }
  }
  if (bossBanner > 0 && !boss && guardianE && guardianE.d.title) { const s = guardianE.d.title; txt(s, (W - textW(s)) / 2, 60, '#d080ff', 1, true, Math.min(1, bossBanner)); }
  if (bossBanner > 0 && boss && boss.d.title) { const t = boss.d.title; txt(t, (W - textW(t)) / 2, 72, '#e8d9b0', 1, true, Math.min(1, bossBanner)); }
  if (bossBanner > 0 && boss) { const s = boss.d.name; ctx.font = '16px "PressStart2P"'; const w = ctx.measureText(plain(s)).width; txt(s, (W - w) / 2, 50, '#ff5030', 2, true, Math.min(1, bossBanner)); }
  // nedre listen
  g.fillStyle = '#1b1410'; g.fillRect(0, y0, W, HUD_H);
  g.fillStyle = '#5a4630'; g.fillRect(0, y0, W, 1);
  g.fillStyle = '#3a2c1e'; g.fillRect(0, y0 + 1, W, 1);
  for (const sx of [58, 114, 202, 264]) { g.fillStyle = '#3a2c1e'; g.fillRect(sx, y0 + 4, 1, HUD_H - 8); }
  g.textBaseline = 'top';
  const wp = WEAPONS[P.weapon];
  txt('HÄLSA', 6, y0 + 5, '#c9a87a'); txt(String(Math.max(0, Math.ceil(P.hp))), 6, y0 + 16, P.hp > maxHp() * 0.3 ? '#e8d9b0' : (tmr % 0.6 < 0.3 ? '#ff4d3d' : '#a02a20'), 2);
  if (mod('shield') > 0) { g.fillStyle = '#20344a'; g.fillRect(6, y0 + 31, 48, 2); g.fillStyle = '#7fc0ff'; g.fillRect(6, y0 + 31, 48 * P.shield / mod('shield'), 2); }
  txt('RUSTN', 64, y0 + 5, '#c9a87a'); txt(String(Math.ceil(P.armor)), 64, y0 + 16, P.armor > 0 ? '#9fc4ff' : '#5a4630', 2);
  const mag = wp.melee ? '--' : wp.staff ? Math.floor(P.mags[P.weapon]) : P.mags[P.weapon], res = wp.melee || wp.staff ? '--' : P.ammo[wp.ammo];
  txt(AMMO[wp.ammo].name, 120, y0 + 5, '#c9a87a');
  const low = !wp.melee && mag <= Math.ceil(effMag(P.weapon) * 0.25);
  txt(String(mag), 120, y0 + 16, mag === 0 ? (tmr % 0.5 < 0.25 ? '#ff4d3d' : '#7a2a20') : low ? '#ffb040' : '#e8d9b0', 2);
  txt('/' + res, 122 + String(mag).length * 16, y0 + 22, '#a89070');
  txt(wp.short, 208, y0 + 5, '#c9a87a');
  if (run.pact) txt('EDEN', 208, y0 + 15, '#ff7050', 1, false);
  else for (let i = 0; i < WEAPONS.length; i++) { g.fillStyle = P.has[i] ? (i === P.weapon ? '#ffd24a' : '#8a7550') : '#3a2c1e'; g.fillRect(208 + i * 4, y0 + 16, 3, 6); }
  txt(`${kills}/${totalEnemies}`, 208, y0 + 25, '#e8d9b0');
  txt(boss ? 'BOSS' : `VÅN ${run.depth}`, 270, y0 + 5, '#c9a87a');
  txt(`${run.gold}G`, 270, y0 + 15, '#ffd24a');
  txt(`${run.owned.length} KORT`.slice(0, 6), 270, y0 + 25, '#b9a0e8');
  if (settings.bigHud) { let yy = 6; msgs.forEach((m, i) => { const a = Math.min(1, m.t * 2); if (i === 0) for (const ln of wrapText(m.text, 19).slice(0, 2)) { g.fillStyle = `rgba(0,0,0,${0.55 * a})`; g.fillRect((W - textW(ln) * 2) / 2 - 3, yy - 2, textW(ln) * 2 + 6, 19); txt(ln, (W - textW(ln) * 2) / 2, yy, '#ffe9a8', 2, true, a); yy += 19; } else { txt(m.text, (W - textW(m.text)) / 2, yy, '#c9b080', 1, true, a); yy += 11; } }); }
  else msgs.forEach((m, i) => { const w = textW(m.text); txt(m.text, (W - w) / 2, 6 + i * 11, i ? '#c9b080' : '#ffe9a8', 1, true, Math.min(1, m.t * 2)); });
  if (state === 'play' && WS.state === 'reload' && !WEAPONS[P.weapon].shellReload) { // omladdningsmätare med det aktiva fältet
    const k = clamp(WS.t / (WEAPONS[P.weapon].reload * reloadMul()), 0, 1), bw = 44, bx = (W - bw) / 2, by = HORIZON + 10;
    g.fillStyle = '#000a'; g.fillRect(bx - 1, by - 1, bw + 2, 5);
    if (!WS.tried) { g.fillStyle = '#5a7a3a'; g.fillRect(bx + bw * ACTIVE_WIN[0], by, bw * (ACTIVE_WIN[1] - ACTIVE_WIN[0]), 3); }
    g.fillStyle = '#e8d9b0'; g.fillRect(bx + bw * k - 1, by - 1, 2, 5);
  }
  if (portals.length && state === 'play') { // pil mot portalen
    const pt = portals[0], d = Math.hypot(pt.x - P.x, pt.y - P.y);
    if (d > 3) {
      let rel = Math.atan2(pt.y - P.y, pt.x - P.x) - P.a; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      const cx = W / 2 + clamp(rel, -1.4, 1.4) * 70, cy = 30;
      g.save(); g.translate(cx, cy); g.rotate(rel); g.fillStyle = tmr % 0.8 < 0.4 ? '#c080ff' : '#9060e0';
      g.beginPath(); g.moveTo(7, 0); g.lineTo(-4, -4); g.lineTo(-2, 0); g.lineTo(-4, 4); g.closePath(); g.fill(); g.restore();
      const t = `${Math.round(d)}`; txt(t, cx - textW(t) / 2, cy + 6, '#c9a0ff', 1, true, 0.8);
    }
  }
  if (WS.nameT > 0 && state === 'play') { const w = WEAPONS[P.weapon], nm = w.name; txt(nm, (W - textW(nm)) / 2, VH - 24, '#ffd24a', 1, true, Math.min(1, WS.nameT * 2));
    const info = `SKADA ${Math.round(w.dmg * (w.pellets || 1) * 10)} · ${w.melee ? 'NÄRSTRID' : (1 / w.delay).toFixed(1) + ' SKOTT/S'}${wlvl(w.id) ? ' · NIVÅ ' + wlvl(w.id) : ''}`; txt(info, (W - textW(info)) / 2, VH - 14, '#c9a87a', 1, true, Math.min(1, WS.nameT * 2)); }
  if (WS.boost && state === 'play') txt('+15%', W / 2 + 12, HORIZON - 14, '#9fe060', 1, true, 0.8);
  if (state === 'play') { drawBowAim(g); drawStaffCharge(g); drawAbilityHud(g); }
  if (state === 'play') drawHudExtras(g);
  if (wheel && !wheel.open && performance.now() - wheel.t0 > 260) wheel.open = true;
  if (wheel && wheel.open && state === 'play') drawWheel(g);
  if (state === 'play') { // aktiva effekter nere till vänster, med nedräkning
    const st = [], sec = t => ` ${Math.ceil(t)}`;
    if (P.haste > 0) st.push(['FART' + sec(P.haste), '#9fe060']);
    if (P.rageT > 0) st.push(['RASERI' + sec(P.rageT), POTIONS.rage.color]);
    if (P.ghostT > 0) st.push(['OSYNLIG' + sec(P.ghostT), POTIONS.ghost.color]);
    if (P.speedT > 0) st.push(['SNABBHET' + sec(P.speedT), POTIONS.speed.color]);
    if (P.iframe > 0) st.push(['OSÅRBAR', '#ffffff']);
    if (P.slowT > 0) st.push(['LÅNGSAM' + sec(P.slowT), '#80b0ff']);
    if (P.poisonT > 0) st.push(['FÖRGIFTAD' + sec(P.poisonT), '#9fe060']);
    if (P.comboT > 0 && P.combo >= 2) st.push([`KOMBO x${P.combo}`, '#ffb040']);
    if (floorEvent) st.push([EVENTS[floorEvent].name, '#ff7060']);
    if (P.shield > 0) st.push([`SKÖLD ${Math.ceil(P.shield)}`, '#7fc0ff']);
    if (up('bullettime') && WS.aim > 0.8) st.push(['TIDSSTOPP', '#80b0ff']);
    if (run.modifier) st.push([run.modifier.name, '#ff9050']);
    if (run.modifier2) st.push([run.modifier2.name, '#ff9050']);
    if (run.floorCurse) st.push(['FÖRBANNAD VÅNING', '#c080ff']);
    const poff = P.potions && P.potions.length ? 16 : 0; // dryckerna ligger underst
    st.forEach(([t, c], i) => txt(t, 4, VH - 12 - poff - i * 10, c, 1, true, 0.85));
  }
  if (hint && state === 'play') txt(hint, (W - textW(hint)) / 2, HORIZON + 26, '#ffd24a');
  else if (WS.state === 'idle' && P.mags[P.weapon] === 0 && P.ammo[wp.ammo] > 0 && state === 'play') { const s = isTouch() ? 'LADDA OM!' : 'R = LADDA OM', w = textW(s); txt(s, (W - w) / 2, HORIZON + 14, '#ffb040'); }
  if (subs.length && state === 'play') { subs.forEach((s, i) => { s.t -= 1 / 60; txt(s.text, (W - textW(s.text)) / 2, VH - 40 - i * 10, '#e8e8e8', 1, true, Math.min(1, s.t * 2)); }); subs = subs.filter(s => s.t > 0); }
  if (settings.fps) { fpsN++; if (tmr - fpsT >= 1 || tmr < fpsT) { fpsShow = fpsN; fpsN = 0; fpsT = tmr; } txt(fpsShow + ' FPS', 4, 4, '#9fe060', 1, true, 0.8); }
  if (showMap === 2) drawMap(false); else if (showMap === 1 && state === 'play') drawMap(true);
}
let hpShown = 100;
function drawHudExtras(g) { // uthållighet, granater, nycklar, mål, pilar och mer
  const y0 = VH, wp = WEAPONS[P.weapon];
  // fördröjd hälsostapel och uthållighet
  hpShown = hpShown > P.hp ? Math.max(P.hp, hpShown - maxHp() * 0.4 / 60) : P.hp;
  g.fillStyle = '#2a1410'; g.fillRect(6, y0 + 34, 48, 2); g.fillStyle = '#f0e0c0'; g.fillRect(6, y0 + 34, 48 * clamp(hpShown / maxHp(), 0, 1), 2); g.fillStyle = '#d04030'; g.fillRect(6, y0 + 34, 48 * clamp(P.hp / maxHp(), 0, 1), 2);
  if (P.stam < STAM_MAX() - 0.01) { const w = 40, x = (W - w) / 2, y = VH - 6; g.fillStyle = '#000a'; g.fillRect(x - 1, y - 1, w + 2, 4); g.fillStyle = P.stam < 0.3 ? '#c06020' : '#d8c060'; g.fillRect(x, y, w * P.stam / STAM_MAX(), 2); }
  // granater, nycklar, smideslevel
  txt(`G${P.grenades}`, 176, y0 + 25, P.grenades ? '#c0ff90' : '#5a4630');
  drawPotionHud(g); drawRuneHud(g);
  if (P.keys) txt(`N${P.keys}`, 176, y0 + 15, '#ffd24a');
  const lv = wlvl(wp.id); if (lv) txt('★'.repeat(lv), 208 + textW(wp.short) + 3, y0 + 5, '#ffd24a');
  if (WS.throwT >= 0) { const k = Math.min(1, WS.throwT); g.fillStyle = '#000a'; g.fillRect(W / 2 - 16, HORIZON + 18, 32, 3); g.fillStyle = '#c0ff90'; g.fillRect(W / 2 - 16, HORIZON + 18, 32 * k, 3); }
  if (P.ammo[wp.ammo] === 0 && tmr % 0.6 < 0.3) txt('/0', 122 + String(P.mags[P.weapon]).length * 16, y0 + 22, '#ff4d3d'); // reserven är slut
  // hagelspridningen i siktet
  if (wp.pellets > 1 && settings.xstyle !== 'punkt') { const r = Math.round((wp.spread + WS.spread * 0.5 + (wp.hip || 0) * (1 - WS.aim)) * (1 - WS.aim * 0.6) / (1 + mod('accuracy')) / Math.atan(plane) * W / 2); g.strokeStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.arc(W / 2 + 0.5, HORIZON + 0.5, Math.max(4, r), 0, TAU); g.stroke(); }
  if (HUD_THEMES[settings.hudTheme]) { g.save(); g.globalCompositeOperation = 'color'; g.fillStyle = HUD_THEMES[settings.hudTheme]; g.fillRect(0, y0, W, HUD_H); g.restore(); } // HUD-tema
  // mål och timer
  const oy = showMap === 1 ? 4 + 21 * (settings.mapScale || 3) + 4 : 4; // under minikartan, till höger
  if (settings.objective !== false && showMap !== 2 && levelBanner <= 0 && bossBanner <= 0) { const obj = objective(); if (obj) txt(obj, W - 4 - textW(obj), oy, '#e8d9b0', 1, true, 0.75); }
  if (settings.timer) { const t = fmtTime(levelTime); txt(t, W - 4 - textW(t), oy + 10, '#c9a87a', 1, true, 0.8); }
  if (challenge) { const t = challenge.wave ? `VÅG ${challenge.wave}/${challenge.max} · ${challenge.alive.filter(e => !e.dead).length} KVAR` : 'GÖR DIG REDO'; txt(t, (W - textW(t)) / 2, 34, '#ff9050'); }
  // pilar vid kanten mot väktare, eliter och bytet utanför bilden
  for (const e of ents) {
    if (e.dead || e.dormant || e.hidden || !(e.guardian || e.elite || e.bounty) || (e.guardian && e.asleep && !seen[(e.y | 0) * mw + (e.x | 0)])) continue;
    const d = Math.hypot(e.x - P.x, e.y - P.y); if (d > 18 || d < 2) continue;
    let rel = Math.atan2(e.y - P.y, e.x - P.x) - P.a; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    if (Math.abs(rel) < Math.atan(plane) * 0.95) continue;
    const x = rel > 0 ? W - 8 : 8, y = HORIZON + clamp(Math.abs(rel) - 1.6, -1, 1) * 30;
    g.fillStyle = e.guardian ? '#c050ff' : e.bounty ? '#ff9050' : '#ffb030'; g.beginPath(); if (rel > 0) { g.moveTo(x + 5, y); g.lineTo(x - 2, y - 5); g.lineTo(x - 2, y + 5); } else { g.moveTo(x - 5, y); g.lineTo(x + 2, y - 5); g.lineTo(x + 2, y + 5); } g.closePath(); g.fill();
  }
  // varning för anfall bakifrån
  for (const e of ents) {
    if (e.dead || !e.alert || e.dormant || e.boss || !e.d.melee) continue;
    const d = Math.hypot(e.x - P.x, e.y - P.y); if (d > 2.6) continue;
    let rel = Math.atan2(e.y - P.y, e.x - P.x) - P.a; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    if (Math.abs(rel) < 1.9) continue;
    g.fillStyle = tmr % 0.3 < 0.15 ? '#ff3020' : '#a01810'; const bx = W / 2 + Math.sin(rel) * 30, by = VH - 18;
    g.beginPath(); g.moveTo(bx, by + 6); g.lineTo(bx - 6, by); g.lineTo(bx + 6, by); g.closePath(); g.fill();
    if (settings.backCue !== false && (P.backT || 0) < tmr) { P.backT = tmr + 0.8; play('click', 0.35, 0.6, { x: e.x, y: e.y }); }
    break;
  }
  // frost och långsamhet i kanterna
  if (P.slowT > 0 && settings.noFlash !== true) { const gr = g.createRadialGradient(W / 2, HORIZON, VH * 0.4, W / 2, HORIZON, W * 0.6); gr.addColorStop(0, 'rgba(120,180,255,0)'); gr.addColorStop(1, 'rgba(120,180,255,0.28)'); g.fillStyle = gr; g.fillRect(0, 0, W, VH); }
  if (P.poisonT > 0) { const gr = g.createRadialGradient(W / 2, HORIZON, VH * 0.4, W / 2, HORIZON, W * 0.6); gr.addColorStop(0, 'rgba(90,255,90,0)'); gr.addColorStop(1, 'rgba(90,255,90,0.2)'); g.fillStyle = gr; g.fillRect(0, 0, W, VH); }
  // klassens färg
  if (run.cls && CLASSES[run.cls]) { g.fillStyle = CLASSES[run.cls].color; g.fillRect(0, y0 + 2, 2, HUD_H - 4); }
  if (cardBanner) { cardBanner.t -= 1 / 60; const a = Math.min(1, cardBanner.t * 2); const t = 'NYTT KORT: ' + cardBanner.name; g.globalAlpha = a; g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect((W - textW(t)) / 2 - 4, VH - 29, textW(t) + 8, 13); g.strokeStyle = cardBanner.color; g.strokeRect((W - textW(t)) / 2 - 3.5, VH - 28.5, textW(t) + 7, 12); g.globalAlpha = 1; txt(t, (W - textW(t)) / 2, VH - 26, cardBanner.color, 1, true, a); if (cardBanner.t <= 0) cardBanner = null; } // ram i kortets raritetsfärg
}
let cardBanner = null;
function objective() { // vad man ska göra just nu
  if (boss && !boss.dead) return 'BESEGRA ' + boss.d.name;
  if (challenge) return 'ÖVERLEV VÅGORNA';
  if (guardianE && !guardianE.dead) return 'BESEGRA VÄKTAREN';
  if (portals.length) return 'GÅ IN I PORTALEN';
  if (floorQuest) return floorQuest.kind === 'time' ? `PORTALEN INOM ${fmtTime(Math.max(0, floorQuest.limit - levelTime))}` : floorQuest.text;
  const el = ents.filter(e => e.elite && !e.dead).length;
  return el ? `DÖDA ELITERNA (${el} KVAR)` : `DÖDA FIENDERNA (${Math.max(0, totalEnemies - kills)} KVAR)`;
}
let photo = false, mapMark = null;
function screenshot() { // sparar bilden som PNG
  try { canvas.toBlob(b => { if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `krypta-${Date.now()}.png`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }, 'image/png'); say('SKÄRMBILD SPARAD', 1.2); play('click', 0.5, 1.8); } catch (e) { say('SKÄRMBILD GICK INTE', 1.2); }
}
function textW(s) { ctx.font = '8px "PressStart2P"'; return ctx.measureText(plain(s)).width; }
function txt(s, x, y, col, scale = 1, shadow = true, alpha = 1) {
  const g = ctx; s = plain(s); g.font = `${8 * scale}px "PressStart2P"`; g.globalAlpha = alpha;
  if (shadow) { g.fillStyle = '#000'; g.fillText(s, x + 1, y + 1); }
  g.fillStyle = col; g.fillText(s, x, y); g.globalAlpha = 1;
}
function drawMap(mini) {
  if (mini && settings.mapRotate) { // minikartan roterar med spelaren
    const s = settings.mapScale || 3, r = Math.round(30 / s), size = (2 * r + 1) * s, cx = W - 4 - size / 2, cy = 4 + size / 2;
    ctx.save(); ctx.beginPath(); ctx.rect(W - 4 - size - 2, 2, size + 4, size + 4); ctx.clip();
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(W - 4 - size - 2, 2, size + 4, size + 4);
    ctx.translate(cx, cy); ctx.rotate(-P.a - Math.PI / 2); ctx.translate(-(P.x * s), -(P.y * s));
    drawMapCells(true, s, 0, 0, Math.max(0, (P.x | 0) - r - 4), Math.max(0, (P.y | 0) - r - 4), Math.min(mw, (P.x | 0) + r + 5), Math.min(mh, (P.y | 0) + r + 5));
    ctx.restore(); return;
  }
  drawMapBox(mini);
}
function drawMapBox(mini) { // automap: bara rutor man har sett. mini = liten karta i hörnet runt spelaren
  let s, ox, oy, x0 = 0, y0 = 0, x1 = mw, y1 = mh;
  if (mini) {
    s = settings.mapScale || 3; const r = Math.round(30 / s);
    x0 = clamp((P.x | 0) - r, 0, Math.max(0, mw - 2 * r - 1)); y0 = clamp((P.y | 0) - r, 0, Math.max(0, mh - 2 * r - 1));
    x1 = Math.min(mw, x0 + 2 * r + 1); y1 = Math.min(mh, y0 + 2 * r + 1);
    ox = W - 4 - (x1 - x0) * s - x0 * s; oy = 4 - y0 * s;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(ox + x0 * s - 2, oy + y0 * s - 2, (x1 - x0) * s + 4, (y1 - y0) * s + 4);
  } else {
    s = clamp(Math.floor(Math.min((W - 10) / mw, (VH - 10) / mh)), 2, 5); ox = (W - mw * s) / 2 | 0; oy = (VH - mh * s) / 2 | 0;
    ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(ox - 3, oy - 3, mw * s + 6, mh * s + 6);
    const leg = [['#60d060', 'UTGÅNG'], ['#c080ff', 'PORTAL'], ['#ffe070', 'ANVÄNDBART'], ['#ff6030', 'KRUTFAT'], ['#ffd24a', 'GULD'], ['#ff4030', 'FIENDE'], ['#40ffff', 'MARKÖR (B)']];
    if (W - (ox + mw * s) > 70) leg.forEach(([c, t], i) => { ctx.fillStyle = c; ctx.fillRect(ox + mw * s + 8, oy + 4 + i * 10, 4, 4); txt(t, ox + mw * s + 15, oy + 2 + i * 10, '#c9a87a', 1, true, 0.9); }); // teckenförklaring
  }
  drawMapCells(mini, s, ox, oy, x0, y0, x1, y1);
}
function drawMapCells(mini, s, ox, oy, x0, y0, x1, y1) {
  const inside = (x, y) => x >= x0 && y >= y0 && x < x1 && y < y1;
  const sense = mod('secretSense') > 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const c = map[y][x];
    if (c === '*' && sense && doors[x + ',' + y].open === 0) { ctx.fillStyle = tmr % 1 < 0.5 ? '#c060ff' : '#7030a0'; ctx.fillRect(ox + x * s, oy + y * s, s, s); continue; }
    if (!seen[y * mw + x]) continue;
    ctx.fillStyle = isWallChar(c) ? '#7d7566' : c === 'D' ? '#c08040' : c === 'G' ? '#b04080' : c === '*' ? (doors[x + ',' + y].open > 0 ? '#2a2420' : '#7d7566') : c === 'f' ? '#ff9a30' : c === 'M' ? '#ff4040' : c === 't' ? '#3a5a2a' : c === 'n' ? '#8a8a96' : MAP_COL[c] || '#2a2420';
    ctx.fillRect(ox + x * s, oy + y * s, s, s);
    if (lvl.exit && lvl.exit.x === x && lvl.exit.y === y) { ctx.fillStyle = '#60d060'; ctx.fillRect(ox + x * s, oy + y * s, s, s); }
  }
  for (const pr of props) if (pr.def && !pr.broken && (pr.def.use || pr.def.boom || pr.def.trap) && inside(pr.cx, pr.cy) && seen[pr.cy * mw + pr.cx]) { // användbara föremål blinkar, fällor och krutfat syns
    ctx.fillStyle = pr.def.use && !pr.used ? (tmr % 0.8 < 0.4 ? '#ffe070' : '#a08030') : pr.def.boom ? '#ff6030' : pr.def.trap ? '#c05020' : '#555'; ctx.fillRect(ox + pr.cx * s, oy + pr.cy * s, s, s); }
  if (lvl.rooms) for (const r of lvl.rooms) { const col = { shop: '#ff4040', guardian: '#c050ff', shrine: '#ff5060', treasure: '#ffd24a', vault: '#ffd24a' }[r.type]; const cx = r.x + (r.w >> 1), cy = r.y + (r.h >> 1); if (col && inside(cx, cy) && seen[cy * mw + cx]) { ctx.strokeStyle = col; ctx.strokeRect(ox + r.x * s + 0.5, oy + r.y * s + 0.5, r.w * s - 1, r.h * s - 1); } }
  if (mapMark && inside(mapMark.x | 0, mapMark.y | 0)) { ctx.fillStyle = tmr % 0.6 < 0.3 ? '#40ffff' : '#20a0a0'; ctx.fillRect(ox + mapMark.x * s - 2, oy + mapMark.y * s - 2, 4, 4); }
  for (const it of items) if (!it.taken && inside(it.x | 0, it.y | 0) && seen[(it.y | 0) * mw + (it.x | 0)]) { ctx.fillStyle = it.type.startsWith('gold') ? '#ffd24a' : it.type === 'cardpick' ? '#c0a0ff' : it.type === 'potion' ? '#ff70c0' : '#e8d9b0'; ctx.fillRect(ox + it.x * s - 1, oy + it.y * s - 1, 2, 2); }
  for (const c of chests) if (inside(c.x | 0, c.y | 0) && seen[(c.y | 0) * mw + (c.x | 0)]) { ctx.fillStyle = c.open ? '#6a5030' : '#ffb030'; ctx.fillRect(ox + c.x * s - 1, oy + c.y * s - 1, 3, 3); }
  for (const pr of props) if (pr.def && (pr.def.trap || pr.def.boom) && !pr.broken && inside(pr.cx, pr.cy) && (mod('trapSense') > 0 || pr.lit > tmr - 30)) { ctx.fillStyle = tmr % 0.8 < 0.4 ? '#ff7030' : '#a03010'; ctx.fillRect(ox + pr.x * s - 1, oy + pr.y * s - 1, 2, 2); }
  for (const e of ents) { // fiender som syns just nu, väktare och boss alltid när rummet har setts
    if (e.dead || !inside(e.x | 0, e.y | 0) || e.hidden || e.dormant) continue;
    const big = e.boss || e.guardian;
    if (!(big && seen[(e.y | 0) * mw + (e.x | 0)]) && !(Math.hypot(e.x - P.x, e.y - P.y) < 12 && hasLOS(P.x, P.y, e.x, e.y)) && !(mod('enemySense') > 0 && Math.hypot(e.x - P.x, e.y - P.y) < 14)) continue;
    ctx.fillStyle = big ? (tmr % 0.5 < 0.25 ? '#ff60ff' : '#a030a0') : e.elite ? '#ffb030' : '#ff4030'; ctx.fillRect(ox + e.x * s - (big ? 2 : 1), oy + e.y * s - (big ? 2 : 1), big ? 4 : 2, big ? 4 : 2);
  }
  if (pet && inside(pet.x | 0, pet.y | 0)) { ctx.fillStyle = PETS[pet.id].color; ctx.fillRect(ox + pet.x * s - 1, oy + pet.y * s - 1, 2, 2); }
  for (const a of allies) if (inside(a.x | 0, a.y | 0)) { ctx.fillStyle = '#60ff80'; ctx.fillRect(ox + a.x * s - 1, oy + a.y * s - 1, 2, 2); }
  for (const p of portals) if (inside(p.x | 0, p.y | 0)) { ctx.fillStyle = tmr % 0.6 < 0.3 ? '#c080ff' : '#7040d0'; ctx.fillRect(ox + p.x * s - 2, oy + p.y * s - 2, 4, 4); }
  ctx.fillStyle = '#4dff7a'; ctx.fillRect(ox + P.x * s - 1, oy + P.y * s - 1, 3, 3);
  ctx.fillRect(ox + (P.x + Math.cos(P.a) * 1.4) * s, oy + (P.y + Math.sin(P.a) * 1.4) * s, 1, 1);
}
const MAP_COL = { '£': '#60e0a0', '€': '#fff0a0', '©': '#c0d0e0', w: '#ff5060', y: '#c040ff', e: '#ff6030', k: '#6a5040', q: '#6a5040', u: '#9090a0', v: '#707070', H: '#9090a0', J: '#6a5040', T: '#8a6a40' }; // brunn, altare, krutfat och möbler på kartan

// ---------- Strid (påverkas av korten via mod()) ----------
// skada faller av med avståndet (fullt nära, golv långt bort) så att pistolen inte prickskjuter över hela banan
function falloff(wp, d) { const [n, f, m] = wp.falloff; return d <= n ? 1 : d >= f ? m : 1 + (m - 1) * (d - n) / (f - n); }
// siktstöd på pekskärm: kulan dras lätt mot en synlig fiende nära hårkorset
function aimAssist(a) {
  let best = null, bd = 0.07;
  for (const e of ents) { if (e.dead) continue; const d = Math.hypot(e.x - P.x, e.y - P.y); if (d > 16) continue;
    let da = Math.atan2(e.y - P.y, e.x - P.x) - a; da = Math.atan2(Math.sin(da), Math.cos(da));
    const lim = Math.max(0.025, 0.35 / d); if (Math.abs(da) < Math.min(bd, lim) && hasLOS(P.x, P.y, e.x, e.y)) { bd = Math.abs(da); best = da; } }
  return best === null ? a : a + best * 0.7;
}
const effMag = i => Math.max(1, Math.round(WEAPONS[i].mag * (1 + mod('magSize'))));
const effDelay = wp => wp.delay / (1 + mod('fireRate'));
const reloadMul = () => 1 / (1 + mod('reloadSpeed'));
function canFire() { return state === 'play' && (WS.state === 'idle' || (WS.state === 'reload' && WEAPONS[P.weapon].shellReload && P.mags[P.weapon] > 0)) && WS.cd <= 0; }
function fire() {
  const wp = WEAPONS[P.weapon];
  if (!canFire()) return;
  if (wp.melee) { axeSwing(false); return; } // yxan: hanteras för sig
  if (wp.staff) { staffZap(wp, wp.dmg * (1 + mod('dmg')) * (1 + 0.12 * wlvl(wp.id)) * (P.rageT > 0 ? 1.5 : 1)); return; } // blixtstaven: mana i stället för magasin
  if (wp.bow) return; // bågen skjuter när den släpps
  if (P.mags[P.weapon] <= 0) {
    if (!fireHeld) play('click', 0.6, 1.2);
    WS.cd = 0.3; // liten paus mellan klick
    if (P.ammo[wp.ammo] > 0) startReload();
    else if (!fireHeld) { if (!WEAPONS.some((w, i) => P.has[i] && (P.mags[i] > 0 || P.ammo[w.ammo] > 0))) { bash(); return; } say('SLUT PÅ AMMUNITION', 1.2); autoSwitch(); }
    return;
  }
  if (WS.state === 'reload') WS.state = 'idle'; // avbryt hagelomladdning
  const firstShot = P.mags[P.weapon] >= effMag(P.weapon);
  // vapenuppgraderingar som ändrar själva skottet
  const lastRound = up('lastround') && P.mags[P.weapon] === 1;
  const slug = up('slug') && WS.aim > 0.5;
  const dbl = up('double') && !slug && P.mags[P.weapon] >= 2;
  const focus = up('focus') && WS.focus >= 1;
  const chain = up('chainshot'), triple = up('triple'), hunt = WS.hunt && up('headhunter');
  const fan = up('fan') && fireHeld; // hanefläkten: skotten efter det första i svepet
  if (Math.random() >= mod('ammoSave')) P.mags[P.weapon]--;
  if (dbl) P.mags[P.weapon]--;
  if (up('belt')) { const t = Math.min(P.ammo[wp.ammo], effMag(P.weapon) - P.mags[P.weapon]); P.mags[P.weapon] += t; P.ammo[wp.ammo] -= t; } // blybältet matar ur reserven
  lvlStat.shots++; run.shots = (run.shots || 0) + 1;
  WS.shot = 0; WS.cd = effDelay(wp) * (fan ? 0.4 : 1) * (dbl ? 1.35 : 1) / (1 + WS.spin * 0.55);
  if (focus) WS.focus = 0;
  const kick = wp.kick * (dbl || slug ? 1.6 : 1);
  P.flash = 0.07; P.shake = Math.max(P.shake, kick * 0.5);
  // lärbart rekylmönster: samma sidoryck i samma ordning varje salva, plus en uppåtknyck som återhämtar sig
  const kickYaw = wp.recoil[P.burst % wp.recoil.length] * (1 - WS.aim * 0.5);
  P.a += kickYaw; P.ryaw += kickYaw * 0.6; P.pitch += kick * 4 * (1 - WS.aim * 0.5);
  P.burst++; P.burstT = effDelay(wp) + 0.25;
  WS.swayY -= kick * 2;
  play(wp.sound[0], wp.sound[2], wp.sound[1] * rnd(0.96, 1.04) * (1 + WS.spin * 0.08));
  if (wp.id === 'shotgun') { play('boom', 0.45, 0.55); setTimeout(() => play('reload', 0.45, 1.4), 420 / (1 + mod('fireRate'))); }
  if (dbl || slug || focus) play('boom', 0.6, slug ? 0.4 : 0.5);
  if (!wp.proj && !wp.flame && !wp.lob && wp.id !== 'crossbow') ejectShell(wp.id === 'shotgun' || wp.id === 'dbshotgun');
  muzzleSmoke();
  if (kick >= 2) WS.punch = Math.min(0.08, kick * 0.022); // synfältet slår till vid tunga skott
  if (P.mags[P.weapon] === 0) setTimeout(() => play('click', 0.35, 0.8), 140); // sista skottet
  lowAmmoCheck(wp);
  if (wp.id === 'dbshotgun') play('boom', 0.5, 0.45);
  if (wp.id === 'crossbow') play('click', 0.5, 0.7);
  // duellanten: vilka som inte hade märkt något när skottet gick
  const unaware = up('duel') ? new Set(ents.filter(e => !e.dead && !e.alert)) : null;
  const sneak = new Set(ents.filter(e => !e.dead && !e.alert && !e.boss && !e.dormant)); // bakhåll: fiender som inte sett dig
  // ljudet väcker fiender som kan nå dig inom ~15 rutor (armborsten är tyst)
  for (const e of ents) if (!e.dead && pathDist(e) < (wp.silent ? 2 : 15)) alertEnemy(e, false);
  let anyHit = false, killed = false, crit = false, boomAt = null;
  const hitSet = new Set(), killSet = new Set();
  const spread = slug ? 0 : (wp.spread + WS.spread * 0.5 + (wp.hip || 0) * (1 - WS.aim)) * (1 - WS.aim * 0.6) / (1 + mod('accuracy'))
    * (fan ? 3 : 1) * (up('belt') ? 1 + Math.min(P.burst, 30) / 20 : 1);
  let base = wp.dmg * (1 + mod('dmg')) * (WS.boost ? 1.15 : 1) * (dmod('glass') ? 1.5 : 1) * (1 + 0.12 * wlvl(wp.id)) * (P.jz > 0.05 ? 1 + mod('airDmg') : 1) * (P.rageT > 0 ? 1.5 : 1) * (1 + (run.mealFloor === run.depth ? P.mealDmg || 0 : 0));
  WS.inspect = 0; WS.idleT = 0;
  if (wp.flame) { flameTick(wp, base); return; } // eldkastaren
  if (wp.lob) { launcherShot(wp, base); return; } // granatkastaren
  if (wp.nail) { nailShot(wp, base, false); return; } // spikgeväret
  if (firstShot) base *= 1 + mod('firstShot');
  if (P.hp < maxHp() * 0.35) base *= 1 + mod('lowHpDmg');
  if (lastRound) base *= 3;
  if (slug) base *= 7;
  if (focus) base *= 4;
  if (chain) base *= 3;
  if (hunt) { base *= 2; WS.hunt = false; }
  const pellets = slug ? 1 : chain || triple ? 3 : (wp.pellets + Math.round(mod('extraPellets'))) * (dbl ? 2 : 1);
  for (let p = 0; p < pellets; p++) {
    let a = triple ? P.a + (p - 1) * 0.09 : P.a + (P.burst > 1 || pellets > 1 || wp.hip ? rnd(-1, 1) * spread : 0); // första skottet går där siktet är
    if (p === 0 && touch.active) a = aimAssist(a);
    if (wp.proj) { shootFlare(a, base); continue; } // signalpistolen skjuter ett bloss, ingen stråle
    const dx = Math.cos(a), dy = Math.sin(a);
    const wall = cast(P.x, P.y, dx, dy);
    if ((wp.id === 'rifle' || wp.id === 'sniper' || (wp.id === 'smg' && Math.random() < 0.3)) && p === 0) tracer(dx, dy, Math.min(wall.dist, 30));
    const wallDist = up('wallpierce') ? throughWall(dx, dy, wall.dist) : wall.dist; // genomborraren
    // allt som kulan kan träffa längs strålen, närmast först
    const hits = [];
    for (const e of ents) {
      if (e.dead) continue;
      const rx = e.x - P.x, ry = e.y - P.y, along = rx * dx + ry * dy;
      if (along <= 0.1 || along >= wallDist) continue;
      const perp = Math.abs(rx * dy - ry * dx); if (perp < 0.3 * e.d.size * (e.boss ? 1.8 : 1)) hits.push({ o: e, d: along, k: 'e', perp });
    }
    for (const pr of projectiles) { // sökande klot och eldklot går att skjuta ned
      if (pr.friendly || pr.dead || pr.kind === 'rock') continue;
      const rx = pr.x - P.x, ry = pr.y - P.y, along = rx * dx + ry * dy;
      if (along > 0.1 && along < wallDist && Math.abs(rx * dy - ry * dx) < (pr.big ? 0.35 : 0.25)) hits.push({ o: pr, d: along, k: 'f' });
    }
    for (const pt of pots) {
      if (pt.broken) continue;
      const rx = pt.x - P.x, ry = pt.y - P.y, along = rx * dx + ry * dy;
      if (along <= 0.1 || along >= wall.dist) continue;
      if (Math.abs(rx * dy - ry * dx) < 0.22) hits.push({ o: pt, d: along, k: 'p' });
    }
    for (const ic of icicles) { if (ic.fall >= 0) continue; const rx = ic.x - P.x, ry = ic.y - P.y, along = rx * dx + ry * dy; if (along > 0.1 && along < wall.dist && Math.abs(rx * dy - ry * dx) < 0.25) { ic.fall = 0; play('ice_crack', 0.6, 1.3, { x: ic.x, y: ic.y }); } } // istappar faller
    for (const pr of props) { // krutfat smäller, lådor spricker, andra föremål stoppar kulan; ljus går sönder
      if (!pr.def || pr.broken || (!pr.def.block && pr.ch !== 'c')) continue;
      const rx = pr.x - P.x, ry = pr.y - P.y, along = rx * dx + ry * dy;
      if (along <= 0.1 || along >= wall.dist) continue;
      if (Math.abs(rx * dy - ry * dx) < 0.3) hits.push({ o: pr, d: along, k: 'o' });
    }
    hits.sort((u, v) => u.d - v.d);
    let left = slug || focus || chain || wp.pierceAll ? 99 : 1 + (wp.pierce || 0) + Math.round(mod('pierce')), stopped = false;
    for (const h of hits) {
      if (left <= 0) { stopped = true; break; }
      if (h.k === 'p') { breakPot(h.o); continue; } // krukor och lådor tar inte stopp på kulan
      if (h.k === 'o') { const pass = h.o.def.crate || h.o.ch === 'c'; if (!hitProp(h.o, P.x + dx * h.d, P.y + dy * h.d)) { stopped = true; break; } if (!pass) left--; continue; }
      if (h.k === 'f') { h.o.dead = true; h.o.life = 0; play('ricochet', 0.4, 1.6, { x: h.o.x, y: h.o.y }); hitMark = 0.12; left--; continue; }
      const far = up('marksman') && h.d > 7; // skarpskytten: långa träffar är alltid kritiska utan avståndsförlust
      let dmg = base * (far || slug ? 1 : falloff(wp, h.d)) * (h.d < 2 && wp.id === 'shotgun' && !slug ? 1.3 : 1);
      const c = far || Math.random() < mod('critChance');
      if (c) { dmg *= 2 + mod('critDmg'); if (!crit) play('gem', 0.3, 2.2); crit = true; hitStop = Math.max(hitStop, 0.03); }
      if (h.o.elite || h.o.boss) dmg *= 1 + mod('bossDmg');
      const hs = headshotCheck(h.o, h.perp, wp); if (hs > 1) { dmg *= hs; hitCrit = true; }
      if (sneak.has(h.o) && !(unaware && unaware.has(h.o))) { dmg *= 1.5 + mod('backstab'); stat('sneaks'); if (!P.sneakMsgT || P.sneakMsgT < tmr) { P.sneakMsgT = tmr + 1; spawnText(h.o.x, h.o.y, 'BAKHÅLL', '#ff9050'); } h.o.backT = tmr + 0.25; }
      if (unaware && unaware.has(h.o)) { if (h.o.elite || h.o.boss) dmg *= 3; else dmg = Math.max(dmg, h.o.hp + 1); say('DUELLANTEN!', 0.8); }
      if (up('dragon')) { h.o.burn = Math.max(h.o.burn, 3); h.o.burnAcc = Math.max(h.o.burnAcc, 0.3); }
      if ((h.o.type === '@' || h.o.type === 'Ð') && !h.o.dead && !(h.o.stun > 0) && h.o.face !== undefined) { // skölden stoppar skott framifrån
        let rel = Math.atan2(P.y - h.o.y, P.x - h.o.x) - h.o.face; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        if (Math.abs(rel) < 1.1) { sparks(P.x + dx * h.d, P.y + dy * h.d, 0.5, 4); play('shield_block', 0.6, rnd(0.9, 1.2), { x: h.o.x, y: h.o.y }); spawnText(h.o.x, h.o.y, 'BLOCK', '#a0c0ff'); alertEnemy(h.o, true); left = 0; stopped = true; break; }
      }
      anyHit = true;
      const hx = P.x + dx * h.d, hy = P.y + dy * h.d;
      const k = hurtEnemy(h.o, dmg, hx, hy, { crit: c });
      if (!k && !h.o.boss && !h.o.d.armor) tryMove(h.o, dx * Math.min(0.12, dmg * 0.02), dy * Math.min(0.12, dmg * 0.02), 0.28); // träffen knuffar
      if (k) { killed = true; killSet.add(h.o); } else hitSet.add(h.o);
      if (!boomAt) boomAt = { x: hx, y: hy };
      if (p < 2 && wall.dist - h.d < 1.4) wallMark(wall, dx, dy, rnd(0.25, 0.6), 'blood'); // blodstänk på väggen bakom
      afterHit(h.o, dmg, hx, hy, p);
      left--;
    }
    if (!stopped && left > 0 && wallDist < 30) { // kulnedslag på väggen
      const hx = P.x + dx * (wallDist - 0.04), hy = P.y + dy * (wallDist - 0.04);
      if (p < 3) spawnImpact(hx, hy, rnd(0.25, 0.7));
      if (p < 4 && wallDist === wall.dist) wallMark(wall, dx, dy, P.camZ + rnd(-0.06, 0.06) + P.pitch * -0.004, 'hole');
      if (p === 0) sparks(hx, hy, P.camZ, 3);
      if (p === 0 && Math.random() < 0.5) play(wallMat(wall.cell) === 'metal' ? 'ricochet' : wallMat(wall.cell) === 'wood' ? 'kick' : Math.random() < 0.6 ? 'bullet_wall' : 'ricochet', 0.3, rnd(0.8, 1.3), { x: hx, y: hy });
      if (!boomAt) boomAt = { x: hx, y: hy };
      if (up('ricowall')) ricochetWall(hx, hy, dx, dy, wall.side, base * 0.8);
    }
  }
  if (lastRound && boomAt) { explode(boomAt.x, boomAt.y, 5 * (1 + mod('dmg')), 1.7); play('bigboom', 0.6, 1.2); P.shake = Math.max(P.shake, 1.5); }
  if (up('knock')) for (const e of hitSet) knockBack(e);
  if (up('shrapnel')) for (const e of killSet) shrapnel(e, base);
  // uppgraderingar för dubbelbössa, armborst och prickskyttegevär
  if (up('harvest') && killSet.size) { heal(3 * killSet.size); P.ammo.shells = Math.min(AMMO.shells.max, P.ammo.shells + killSet.size); }
  if (up('doublekill') && killSet.size >= 2) { finishReload(); say('DUBBELDÖD!', 1); play('reload', 0.6, 1.6); }
  if (up('stormstep')) { for (let i = 0; i < 6; i++) tryMove(P, -Math.cos(P.a) * 0.2, -Math.sin(P.a) * 0.2, 0.25); P.iframe = 0.4; }
  if (up('recover') && killSet.size) { P.ammo.bolts = Math.min(AMMO.bolts.max, P.ammo.bolts + killSet.size); finishReload(); }
  if (up('blastbolt')) for (const e of [...hitSet, ...killSet]) fuses.push({ e, x: e.x, y: e.y, t: 0.8, dmg: 8 * (1 + mod('dmg')) });
  if (up('poison')) for (const e of hitSet) e.poison = 4;
  if (up('headhunter') && killSet.size) { WS.cd = 0.08; WS.hunt = true; say('HUVUDJÄGAREN', 0.8); }
  if (anyHit) { lvlStat.hits++; run.hits = (run.hits || 0) + 1; }
  if (anyHit) { hitMark = 0.15; hitKill = killed; hitCrit = crit; play(killed ? 'gem' : 'click', killed ? 0.22 : 0.18, killed ? 1.6 : 2.4); }
  WS.spread = Math.min(0.06, WS.spread + wp.spread * 0.7 + (wp.id === 'shotgun' ? 0.02 : 0.004));
  if (P.mags[P.weapon] === 0 && P.ammo[wp.ammo] > 0) setTimeout(() => { if (WS.state === 'idle' && P.mags[P.weapon] === 0) startReload(); }, effDelay(wp) * 1000 + 120);
}
// ---------- Vapenuppgraderingar (kort med wup, kräver vapnets pakt) ----------
function nearestFoes(e, r, n) { // levande fiender nära e som e har fri sikt till, närmast först
  return ents.filter(o => o !== e && !o.dead && !o.dying && Math.hypot(o.x - e.x, o.y - e.y) < r && hasLOS(e.x, e.y, o.x, o.y))
    .sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y)).slice(0, n);
}
function zap(ax, ay, bx, by, tint) { // synlig stråle mellan två punkter (studs, blixt)
  for (let i = 1; i <= 5; i++) { const t = i / 6; particles.push({ x: ax + (bx - ax) * t + rnd(-0.08, 0.08), y: ay + (by - ay) * t + rnd(-0.08, 0.08), z: 0.5 + rnd(-0.1, 0.1), vx: 0, vy: 0, vz: 0, life: 0.18, maxLife: 0.18, frames: fx.hit, img: fx.hit[0], size: 0.18, add: true, tint }); }
}
function afterHit(e, dmg, hx, hy, pellet) {
  if (pellet === 0) runeProc(e, dmg);
  if (up('explosive')) explode(hx, hy, 5 * (1 + mod('dmg')), 1.5);
  if (up('ricochet') && pellet === 0) { // studskulan
    const o = nearestFoes(e, 6, 1)[0];
    if (o) { zap(e.x, e.y, o.x, o.y, [255, 230, 160]); play('ricochet', 0.45, rnd(1.2, 1.5), { x: o.x, y: o.y }); hurtEnemy(o, dmg * 0.8, o.x, o.y, { noProc: true }); }
  }
  if (up('chain') && ++P.chainN % 4 === 0) { // kedjeblixten
    let from = e;
    for (const o of nearestFoes(e, 4.5, 3)) { zap(from.x, from.y, o.x, o.y, [140, 190, 255]); hurtEnemy(o, dmg * 1.2, o.x, o.y, { noProc: true }); from = o; }
    play('whoosh', 0.5, 2, { x: e.x, y: e.y });
  }
  if (up('marks') && !e.dead) { // dödsmärket
    e.marks = (e.marks || 0) + 1;
    if (e.marks >= 8) { e.marks = 0; explode(e.x, e.y, 9 * (1 + mod('dmg')), 1.4); play('bigboom', 0.5, 1.4, { x: e.x, y: e.y }); say('DÖDSMÄRKET!', 0.8); }
  }
}
function ricochetWall(hx, hy, dx, dy, side, dmg) { // rikoschetten: kulan studsar en gång mot väggen
  if (side === 0) dx = -dx; else dy = -dy;
  const w2 = cast(hx, hy, dx, dy, 10);
  let best = null, bd = w2.dist;
  for (const e of ents) {
    if (e.dead) continue;
    const rx = e.x - hx, ry = e.y - hy, along = rx * dx + ry * dy;
    if (along > 0.05 && along < bd && Math.abs(rx * dy - ry * dx) < 0.3 * e.d.size) { best = e; bd = along; }
  }
  if (best) { zap(hx, hy, best.x, best.y, [255, 220, 150]); hurtEnemy(best, dmg, best.x, best.y, { noProc: true }); hitMark = 0.15; }
  else if (Math.random() < 0.3) spawnImpact(hx + dx * (w2.dist - 0.04), hy + dy * (w2.dist - 0.04), rnd(0.3, 0.6));
}
function knockBack(e) { // slagkraften: nära fiender slungas bakåt, krock i vägg skadar
  if (e.dead || e.boss) return;
  const d = Math.hypot(e.x - P.x, e.y - P.y); if (d > 3.5) return;
  const a = Math.atan2(e.y - P.y, e.x - P.x), dist = (1.6 - d * 0.3) * (e.elite ? 0.5 : 1);
  const ox = e.x, oy = e.y;
  for (let i = 0; i < 6; i++) tryMove(e, Math.cos(a) * dist / 6, Math.sin(a) * dist / 6, 0.28);
  e.charge = 0; e.state = 'pain'; e.t = 0;
  if (Math.hypot(e.x - ox, e.y - oy) < dist * 0.7) { hurtEnemy(e, 3 * (1 + mod('dmg')), e.x, e.y, { noProc: true }); play('bigboom', 0.35, 1.5, { x: e.x, y: e.y }); P.shake = Math.max(P.shake, 1.2); }
}
function shrapnel(e, dmg) { // splitterhaglet: döda fiender sprängs och skadar grannarna
  play('fireburst', 0.5, 1.3, { x: e.x, y: e.y });
  for (let i = 0; i < 8; i++) { const a = rnd(0, TAU), sp = rnd(1.5, 3); particles.push({ x: e.x, y: e.y, z: 0.5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: rnd(0.5, 2), life: 0.5, img: fx.shards[(i * 5) % fx.shards.length], size: 0.12, grav: true }); }
  for (const o of nearestFoes(e, 2.6, 3)) hurtEnemy(o, dmg * 1.5, o.x, o.y, { noProc: true });
}
function throughWall(dx, dy, d) { // genomborraren: hitta väggens baksida (högst 2 rutor) och fortsätt därifrån
  for (let t = d + 0.05; t < d + 2.2; t += 0.05) {
    const x = P.x + dx * t, y = P.y + dy * t;
    if (!solid(x, y)) return t + cast(x, y, dx, dy).dist;
  }
  return d;
}
const groundFires = [];
function updateGroundFires(dt) {
  for (const f of groundFires) {
    f.t -= dt; f.acc += dt;
    if (Math.random() < dt * 10) particles.push({ x: f.x + rnd(-0.5, 0.5), y: f.y + rnd(-0.5, 0.5), z: 0, vx: 0, vy: 0, vz: 0.4, life: 0.5, maxLife: 0.5, frames: fx.fire, img: fx.fire[0], size: 0.3, add: true, drift: true });
    if (f.acc >= 0.5) { f.acc = 0; for (const e of ents) if (!e.dead && !e.dormant && Math.hypot(e.x - f.x, e.y - f.y) < 0.9) { e.burn = Math.max(e.burn, 2); hurtEnemy(e, 1.2 * (1 + mod('dmg')), e.x, e.y, { noProc: true, quiet: true }); } burnWebs(f.x, f.y, 0.8); }
  }
  for (let i = groundFires.length - 1; i >= 0; i--) if (groundFires[i].t <= 0) groundFires.splice(i, 1);
}
const fuses = []; // sprängspetsen: pilar som smäller efter en stund
function updateFuses(dt) {
  for (const f of fuses) {
    f.t -= dt; if (!f.e.dead) { f.x = f.e.x; f.y = f.e.y; }
    if (f.t <= 0 && f.kind) { barrelBurst(f); explode(f.x, f.y, f.dmg * 0.35, 1.6, f.hurt); continue; } // gift- och isfat
    if (f.t <= 0) { explode(f.x, f.y, f.dmg, f.r || 1.8, f.hurt); play('bigboom', f.hurt ? 0.8 : 0.5, f.hurt ? 1 : 1.3, { x: f.x, y: f.y }); if (f.hurt) P.shake = Math.max(P.shake, 1.2); }
  }
  for (let i = fuses.length - 1; i >= 0; i--) if (fuses[i].t <= 0) fuses.splice(i, 1);
}
function shootFlare(a, dmg) { // signalpistolens bloss: flyger, träffar, sprängs och tänder eld
  projectiles.push({ x: P.x + Math.cos(a) * 0.4, y: P.y + Math.sin(a) * 0.4, z: 0.48, vx: Math.cos(a) * 13, vy: Math.sin(a) * 13, dmg, src: P, friendly: true, kind: 'flare', life: 2.5 });
  play('whoosh', 0.6, 0.6);
}
function flareBurst(x, y, dmg, r = 1.7, spark = false) {
  explode(x, y, dmg * 1.2, r);
  if (!spark) groundFires.push({ x, y, t: 4, acc: 0 }); // blosset lämnar brinnande mark
  if (!spark && up('cluster')) for (let i = 0; i < 5; i++) { // fyrverkeriet
    const a = i / 5 * TAU + rnd(-0.3, 0.3);
    projectiles.push({ x, y, z: 0.45, vx: Math.cos(a) * 6, vy: Math.sin(a) * 6, dmg: dmg * 0.5, src: P, friendly: true, kind: 'spark', life: 0.35 });
  }
  if (!spark && up('blind')) { // solblosset
    for (const e of ents) if (!e.dead && !e.boss && Math.hypot(e.x - x, e.y - y) < 3.2) { e.stun = 2.2; e.charge = 0; }
    particles.push({ x, y, z: 0.5, vx: 0, vy: 0, vz: 0, life: 0.3, maxLife: 0.3, frames: fx.hit, img: fx.hit[0], size: 1.6, add: true, tint: [255, 255, 220] });
  }
  for (const e of ents) if (!e.dead && Math.hypot(e.x - x, e.y - y) < r + 0.3) { e.burn = Math.max(e.burn, 4); }
  for (let i = 0; i < 6; i++) particles.push({ x, y, z: 0.3, vx: rnd(-2, 2), vy: rnd(-2, 2), vz: rnd(1, 3), life: 0.8, maxLife: 0.8, frames: fx.fire, img: fx.fire[0], size: 0.35, grav: true, add: true });
  play('fireburst', 0.7, 0.8, { x, y });
}
function throwMag() { // kastmagasinet: det gamla magasinet flyger iväg som en granat
  const a = P.a;
  projectiles.push({ x: P.x + Math.cos(a) * 0.4, y: P.y + Math.sin(a) * 0.4, z: 0.5, vx: Math.cos(a) * 8, vy: Math.sin(a) * 8, dmg: 9 * (1 + mod('dmg')), src: P, friendly: true, kind: 'gren', life: 0.9 });
  play('whoosh', 0.5, 0.8);
}
// aktiv omladdning: tryck R igen när visaren är i det ljusa fältet så går det direkt och nästa magasin gör 15 % mer skada
const ACTIVE_WIN = [0.3, 0.45];
function reloadKey() {
  const wp = WEAPONS[P.weapon];
  if (WS.state !== 'reload' || wp.shellReload) { startReload(); return; }
  if (WS.tried || WS.loaded) return;
  WS.tried = true;
  const k = WS.t / (wp.reload * reloadMul());
  if (k >= ACTIVE_WIN[0] && k <= ACTIVE_WIN[1]) {
    finishReload(); WS.state = 'idle'; WS.loaded = false; WS.boost = true;
    play('click', 0.8, 1.7); play('reload', 0.4, 2); say('PERFEKT OMLADDNING!', 1); WS.swayY += 5;
  } else { WS.t -= wp.reload * reloadMul() * 0.3; play('click', 0.6, 0.5); say('KÄRVADE', 0.8); }
}
function ejectShell(big) { // hylsan flyger ut åt höger och studsar
  const img = fx.parts.shell ? fx.parts.shell[0] : null; if (!img || settings.lowfx) return;
  const r = P.a + Math.PI / 2, f = P.a;
  particles.push({ x: P.x + Math.cos(f) * 0.35 + Math.cos(r) * 0.12, y: P.y + Math.sin(f) * 0.35 + Math.sin(r) * 0.12, z: 0.42, vx: Math.cos(r) * rnd(1, 1.8) + P.vx * 0.5, vy: Math.sin(r) * rnd(1, 1.8) + P.vy * 0.5, vz: rnd(1.2, 2), life: rnd(1.2, 2), img, size: big ? 0.05 : 0.035, grav: true, bounce: true, tint: big ? [255, 80, 60] : null });
}
function lowAmmoCheck(wp) { // varning när reserven nästan är slut
  const left = P.ammo[wp.ammo] + P.mags[P.weapon];
  if (left > 0 && left <= Math.max(3, wp.mag) && !WS.lowWarned[wp.ammo]) { WS.lowWarned[wp.ammo] = true; say('LITE AMMUNITION: ' + AMMO[wp.ammo].name, 1.5); play('low_ammo', 0.7); }
  if (left > wp.mag * 2) WS.lowWarned[wp.ammo] = false;
}
function startReload() {
  const wp = WEAPONS[P.weapon];
  if (wp.melee) return;
  if (WS.state !== 'idle' || P.mags[P.weapon] >= effMag(P.weapon) || P.ammo[wp.ammo] <= 0) return;
  WS.boost = false; WS.tried = false;
  if (up('grenade')) throwMag();
  if (mod('reloadNova') > 0) { for (const e of ents) if (!e.dead && !e.dormant && Math.hypot(e.x - P.x, e.y - P.y) < 2.4) { hurtEnemy(e, mod('reloadNova'), e.x, e.y, { noProc: true }); for (let i = 0; i < 3; i++) tryMove(e, (e.x - P.x) * 0.1, (e.y - P.y) * 0.1, 0.28); } play('shock', 0.5, 0.8); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; particles.push({ x: P.x + Math.cos(a) * 0.8, y: P.y + Math.sin(a) * 0.8, z: 0.3, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, vz: 0, life: 0.3, maxLife: 0.3, img: fx.hit[1], size: 0.08, add: true, tint: [160, 210, 255] }); } }
  if (up('quickload') && P.mags[P.weapon] === 0) { finishReload(); play('reload', 0.6, 1.8); WS.cd = Math.max(WS.cd, 0.1); WS.swayY += 6; return; } // tomhylsan
  WS.state = 'reload'; WS.t = 0; WS.aim = 0;
  if (wp.shellReload) WS.shellPhase = 'start';
  else play('reload', 0.6, 1.0 / reloadMul());
}
function finishReload() {
  const wp = WEAPONS[P.weapon], need = effMag(P.weapon) - P.mags[P.weapon], take = Math.min(need, P.ammo[wp.ammo]);
  P.mags[P.weapon] += take; P.ammo[wp.ammo] -= take;
}
function switchWeapon(n) {
  if (!(n >= 0 && n < WEAPONS.length) || n === P.weapon || !P.has[n] || state !== 'play') return;
  P.lastWeapon = P.weapon;
  WS.next = n; WS.state = 'holster'; WS.t = 0; WS.aim = 0; play('weapon', 0.25, 1.6);
}
// ---------- Version 5: yxan, eldkastaren och granatkastaren ----------
const meleeMul = () => (1 + mod('dmg') + mod('meleeDmg')) * (1 + 0.12 * wlvl('axe')) * (P.rageT > 0 ? 1.5 : 1) * (P.curseT > 0 ? 0.75 : 1);
function axeSwing(charged) { // svep framåt; laddat slag slungar fiender
  const wp = WEAPONS[P.weapon];
  WS.shot = 0; WS.cd = effDelay(wp) * (charged ? 1.4 : 1); WS.charge = 0; WS.kick = 0.25;
  play(charged ? 'axe_charge' : 'axe_swing', 0.8, rnd(0.9, 1.1)); lvlStat.shots++;
  const whirl = charged && up('axe_whirl'), arc = whirl ? Math.PI : 0.85, reach = charged ? 2.1 : 1.7;
  let hits = 0;
  for (const e of ents) {
    if (e.dead || e.dying || e.hidden) continue;
    const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy); let off = Math.atan2(dy, dx) - P.a; off = Math.atan2(Math.sin(off), Math.cos(off));
    if (d > reach + e.d.size * 0.3 || Math.abs(off) > arc) continue;
    if (e.dormant) { e.hp -= 0.01; continue; }
    const dmg = wp.dmg * meleeMul() * (charged ? 2.2 : 1) * (Math.random() < mod('critChance') ? 2 + mod('critDmg') : 1);
    const k = hurtEnemy(e, dmg, e.x, e.y, { melee: true }); hits++;
    if (up('axe_bleed') && !k) e.bleed = 4;
    if (k && up('axe_butcher')) heal(5);
    if (!k && !e.boss) for (let i = 0; i < (charged ? 8 : 3); i++) tryMove(e, dx / d * 0.12, dy / d * 0.12, 0.28);
    if (charged && !e.boss) e.stun = Math.max(e.stun || 0, 0.8);
  }
  for (const pt of pots) if (!pt.broken && Math.hypot(pt.x - P.x, pt.y - P.y) < reach) breakPot(pt);
  breakProps(P.x + Math.cos(P.a) * 1, P.y + Math.sin(P.a) * 1, 0.8);
  if (hits) { play('axe_hit', 0.9, rnd(0.9, 1.1)); hitStop = Math.max(hitStop, charged ? 0.09 : 0.05); P.shake = Math.max(P.shake, charged ? 1.4 : 0.7); hitMark = 0.15; lvlStat.hits++; }
}
function axeThrow() { // högerklick med yxan: kastas och kommer tillbaka
  if (WS.thrown || WS.state !== 'idle' || state !== 'play') return;
  WS.thrown = true; play('axe_throw', 0.8);
  projectiles.push({ x: P.x, y: P.y, z: 0.5, vx: Math.cos(P.a) * 10, vy: Math.sin(P.a) * 10, kind: 'axe', friendly: true, life: 1.4, dmg: 12 * meleeMul(), hits: new Set(), back: false });
}
function updateThrownAxe(p, dt) {
  const tx = P.x - p.x, ty = P.y - p.y, d = Math.hypot(tx, ty);
  if (p.back || p.life < 0.8) { p.back = true; p.vx += (tx / d * 14 - p.vx) * Math.min(1, dt * 6); p.vy += (ty / d * 14 - p.vy) * Math.min(1, dt * 6); }
  p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
  if (solid(p.x, p.y) && !p.back) { p.back = true; play('axe_hit', 0.5, 1.3, { x: p.x, y: p.y }); }
  for (const e of ents) if (!e.dead && !e.dormant && !p.hits.has(e) && Math.hypot(e.x - p.x, e.y - p.y) < 0.6) { p.hits.add(e); hurtEnemy(e, p.dmg, e.x, e.y, { melee: true }); play('axe_hit', 0.6, 1.1, { x: e.x, y: e.y }); if (!up('axe_boomerang') || p.hits.size >= 2) p.back = true; }
  if ((p.back && d < 0.6) || p.life < -2) { p.dead = true; WS.thrown = false; play('click', 0.5, 0.8); }
}
let flameSnd = null;
function flameTick(wp, base) { // eldkastaren: en kägla av eld som tänder allt
  const frugal = up('fl_frugal'), blue = up('fl_blue');
  if (frugal && Math.random() < 0.5) P.mags[P.weapon]++; // bränslesnålen: hälften av dropparna är gratis
  WS.shot = 0; WS.cd = effDelay(wp);
  if (!flameSnd && actx) { play('flamer_start', 0.6); flameSnd = play('flamer_loop', 0.45, 1, { loop: true }); }
  P.flameT = 0.15; P.flash = Math.max(P.flash, 0.04);
  const range = blue ? 6 : 4.5, dmg = base * (blue ? 1.5 : 1) * (1 + mod('fireDmg'));
  const f = fx.parts.flame;
  for (let i = 0; i < (settings.lowfx ? 1 : 2); i++) { const a = P.a + rnd(-0.12, 0.12), sp = rnd(6, 8); particles.push({ x: P.x + Math.cos(a) * 0.5, y: P.y + Math.sin(a) * 0.5, z: P.camZ - 0.15, vx: Math.cos(a) * sp + P.vx, vy: Math.sin(a) * sp + P.vy, vz: rnd(-0.1, 0.3), life: range / 7, maxLife: range / 7, frames: f || fx.fire, img: (f || fx.fire)[0], size: 0.35, add: true, tint: blue ? [120, 170, 255] : null, flame: true }); }
  const wd = cast(P.x, P.y, Math.cos(P.a), Math.sin(P.a)).dist;
  for (const e of ents) {
    if (e.dead || e.dormant || e.hidden) continue;
    const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy); let off = Math.atan2(dy, dx) - P.a; off = Math.atan2(Math.sin(off), Math.cos(off));
    if (d > Math.min(range, wd + 0.3) || Math.abs(off) > 0.28 + 0.3 / Math.max(1, d)) continue;
    hurtEnemy(e, dmg, e.x, e.y, { noProc: true, quiet: true }); e.burn = Math.max(e.burn, 3); e.burnAcc = e.burnAcc || 0;
    if (!e.boss && !e.elite && Math.random() < 0.04) e.fleeT = 1.2; // eld skrämmer
  }
  const ex = P.x + Math.cos(P.a) * Math.min(range, wd), ey = P.y + Math.sin(P.a) * Math.min(range, wd);
  burnWebs(ex, ey, 1); for (const pr of props) if (pr.def && pr.def.boom && !pr.broken && Math.hypot(pr.x - ex, pr.y - ey) < 1.2) hitProp(pr, ex, ey);
  if (up('fl_napalm') && Math.random() < 0.15) groundFires.push({ x: ex, y: ey, t: 3, acc: 0 });
  lvlStat.shots++;
}
function flameWall() { // eldväggen (uppgradering): högerklick
  const wp = WEAPONS[P.weapon]; if ((P.flameWallT || 0) > tmr || P.mags[P.weapon] < 10) return;
  P.flameWallT = tmr + 3; P.mags[P.weapon] -= 10; play('fireburst', 0.8, 0.8);
  for (let i = -2; i <= 2; i++) { const x = P.x + Math.cos(P.a) * 2.5 + Math.cos(P.a + Math.PI / 2) * i * 0.6, y = P.y + Math.sin(P.a) * 2.5 + Math.sin(P.a + Math.PI / 2) * i * 0.6; if (!solid(x, y)) groundFires.push({ x, y, t: 5, acc: 0 }); }
}
function launcherShot(wp, base) { // granatkastaren: studsande granater, siktad = smäller vid första träff
  const n = up('gl_drum') ? Math.min(3, P.mags[P.weapon] + 1) : 1;
  for (let i = 0; i < n; i++) setTimeout(() => { if (state !== 'play' || !map) return; const mega = up('gl_mega'), sp = mega ? 7 : 10, a = P.a + rnd(-0.02, 0.02);
    projectiles.push({ x: P.x + Math.cos(a) * 0.5, y: P.y + Math.sin(a) * 0.5, z: P.camZ - 0.1, vz: 1.6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, kind: 'pgren', friendly: true, life: 2.2, dmg: base * (mega ? 1.2 : 1) * (1 + mod('grenadeDmg')),
      beepT: 0.2, impact: WS.aim > 0.5, sticky: up('gl_sticky'), cluster: up('gl_cluster'), radius: mega ? 4.4 : 2.4, launched: true });
    if (i) { P.mags[P.weapon] = Math.max(0, P.mags[P.weapon] - 1); play(wp.sound[0], wp.sound[2], wp.sound[1]); } }, i * 160);
  WS.shot = 0; WS.cd = effDelay(wp) * n; P.shake = Math.max(P.shake, 0.8); lvlStat.shots++;
}
function inspect() { if (WS.state === 'idle' && WS.inspect <= 0) { WS.inspect = 1.6; play('click', 0.3, 0.8); setTimeout(() => play('click', 0.3, 1.1), 700); } }
// ---------- Granater (F): håll för längre kast ----------
const GREN_MAX = () => 3 + Math.round(mod('grenades'));
function grenadeStart() { if (state !== 'play' || WS.throwT >= 0) return; if (P.grenades <= 0) { say('INGA GRANATER', 1); play('click', 0.4, 0.7); return; } WS.throwT = 0; }
function grenadeThrow() {
  if (WS.throwT < 0) return;
  const hold = Math.min(1, WS.throwT); WS.throwT = -1;
  if (state !== 'play' || P.grenades <= 0) return;
  P.grenades--; stat('grenadesThrown'); WS.kick = 0.3; play('grenade_throw', 0.6, 1, {}); play('whoosh', 0.4, 1.2);
  const sp = 5 + hold * 6, a = P.a;
  projectiles.push({ x: P.x + Math.cos(a) * 0.4, y: P.y + Math.sin(a) * 0.4, z: P.camZ - 0.05, vz: 2.2 + hold * 1.4, vx: Math.cos(a) * sp + P.vx * 0.5, vy: Math.sin(a) * sp + P.vy * 0.5,
    kind: 'pgren', friendly: true, life: 1.8, dmg: 38 * (1 + mod('grenadeDmg')) * (1 + mod('dmg') * 0.5), beepT: 0 });
  for (const e of ents) if (!e.dead && !e.boss && Math.hypot(e.x - P.x, e.y - P.y) < 9 && e.d.ai !== 'charge' && Math.random() < 0.5) e.fleeT = 1.2; // fiender som ser kastet springer undan
}
function updateGrenade(p, dt) { // studsar mot väggar och golv, piper och smäller
  if (p.stuck) { if (p.stuck.dead) p.stuck = null; else { p.x = p.stuck.x; p.y = p.stuck.y; p.z = 0.5; } }
  if (p.launched && !p.stuck && (p.impact || p.sticky)) { const e = ents.find(e => !e.dead && !e.dormant && Math.hypot(e.x - p.x, e.y - p.y) < 0.5); if (e) { if (p.sticky && !p.impact) { p.stuck = e; play('click', 0.5, 0.6, { x: p.x, y: p.y }); } else p.life = 0; } }
  if (p.launched && p.impact && solid(p.x + p.vx * dt, p.y + p.vy * dt)) p.life = 0;
  p.vz -= 9 * dt; p.z += p.vz * dt;
  if (p.z <= 0.05) { p.z = 0.05; if (p.vz < -1.2) { p.vz *= -0.42; p.vx *= 0.7; p.vy *= 0.7; play('grenade_bounce', 0.4, rnd(0.9, 1.2), { x: p.x, y: p.y }); } else { p.vz = 0; p.vx *= 0.9; p.vy *= 0.9; } }
  const ox = p.x - p.vx * dt, oy = p.y - p.vy * dt;
  if (solid(p.x, p.y)) { if (solid(p.x, oy)) p.vx = -p.vx * 0.5; if (solid(ox, p.y)) p.vy = -p.vy * 0.5; p.x = ox; p.y = oy; play('grenade_bounce', 0.4, 1.3, { x: p.x, y: p.y }); }
  p.beepT -= dt; if (p.beepT <= 0) { p.beepT = p.life < 0.6 ? 0.12 : 0.35; play('grenade_beep', 0.35, p.life < 0.6 ? 1.3 : 1, { x: p.x, y: p.y }); }
  if (p.life <= 0) {
    p.dead = true; explode(p.x, p.y, p.dmg, p.radius || 2.6, settings.diff > 0, true);
    if (p.cluster) for (let i = 0; i < 3; i++) { const a = rnd(0, TAU); projectiles.push({ x: p.x, y: p.y, z: 0.4, vz: 1.5, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, kind: 'pgren', friendly: true, life: 0.7, dmg: p.dmg * 0.4, beepT: 9, radius: 1.4 }); }
    play('bigboom', 0.85, 1, { x: p.x, y: p.y }); P.shake = Math.max(P.shake, 1.4);
  }
}
function autoSwitch() {
  for (const i of [...WEAPONS.keys()].slice(1).concat(0)) { const w = WEAPONS[i]; if (P.has[i] && i !== P.weapon && (P.mags[i] > 0 || P.ammo[w.ammo] > 0)) { switchWeapon(i); return; } }
}
// opt: { crit, noProc (ingen explosion/brand), source }
function hurtEnemy(e, dmg, hx, hy, opt = {}) {
  if (e.dead || e.dying || e.hidden) return false;
  if (e.eshield > 0) { const a = Math.min(e.eshield, dmg); e.eshield -= a; dmg -= a; e.flash = 0.08; if (e.eshield <= 0) { play('ricochet', 0.7, 0.6, { x: e.x, y: e.y }); say('SKÖLDEN BRAST', 1); } if (dmg <= 0) { alertEnemy(e, true); spawnNumber(e.x, e.y, a, false); return false; } }
  e.lastHurt = tmr;
  if (e.d.stone && !opt.boom && !opt.melee) { dmg *= 0.5; if (Math.random() < 0.3) sparks(e.x, e.y, 0.6, 2); } // sten: kulor biter dåligt
  if (hasMod(e, 'mirror') && !opt.noProc && !opt.boom) { const r = dmg * 0.15; if (r > 0.3) { hurtPlayer(r); if ((e.mirT || 0) < tmr) { e.mirT = tmr + 1; spawnText(e.x, e.y, 'SPEGLAR', '#c0e0ff'); } } }
  if (e.d.armor) { const before = dmg; dmg = Math.max(dmg * 0.25, dmg - e.d.armor); if (dmg < before * 0.6 && !opt.quiet) play('ricochet', 0.35, rnd(1.2, 1.5), { x: e.x, y: e.y }); }
  e.revealT = 2;
  if (!e.boss && !e.elite && mod('execute') > 0 && (e.hp - dmg) / e.maxHp < mod('execute')) dmg = e.hp;
  if (e.charge > 0 && e.d.ai === 'charge' && !e.boss) { e.charge = 0; e.stun = 0.6; spawnText(e.x, e.y, 'SNUBBLAR', '#e8d9b0'); } // träffad mitt i språnget
  if (e.leapT > 0 && !e.boss) { e.leapT = 0; e.stun = 0.5; }
  if (run) run.dmgDealt = (run.dmgDealt || 0) + Math.max(0, Math.min(dmg, e.hp));
  e.hp -= dmg; e.flash = 0.12; alertEnemy(e, true);
  if (e.boss && !e.dying) { bossStagger(e, dmg); if (e.id === 'ghost' && mirrors.length) { for (const m of mirrors) spawnPuff(m.x, m.y, 6); mirrors = []; } }
  if (e.hp <= 0 && -e.hp > e.maxHp * 0.6 && !e.boss) e.overkill = true; // överdöd: sprängs i bitar
  if (mod('lifesteal') > 0) heal(dmg * mod('lifesteal'), true);
  spawnNumber(e.x, e.y, dmg, opt.crit);
  if (!opt.quiet) { play('splat', 0.35, rnd(0.9, 1.2), { x: e.x, y: e.y }); for (let i = 0; i < 2; i++) spawnBlood(hx ?? e.x, hy ?? e.y); }
  if (!opt.noProc) {
    if (Math.random() < mod('burnChance')) e.burn = 3;
    if (Math.random() < mod('slowChance')) e.slow = 2.5;
    if (Math.random() < mod('explodeChance')) explode(hx ?? e.x, hy ?? e.y, dmg * 0.6, 1.4);
    if (Math.random() < mod('freezeChance')) freeze(e, 2);
    if (Math.random() < mod('poisonChance')) e.poison = Math.max(e.poison || 0, 4);
    if (Math.random() < mod('bleedChance')) e.bleed = Math.max(e.bleed || 0, 4);
    if (Math.random() < mod('shockChance')) { const o = nearestFoes(e, 4, 1)[0]; if (o) { zap(e.x, e.y, o.x, o.y, [160, 210, 255]); play('shock', 0.4, rnd(0.9, 1.2), { x: o.x, y: o.y }); hurtEnemy(o, dmg * 0.5, o.x, o.y, { noProc: true }); } }
    if (opt.crit && mod('critHeal')) heal(mod('critHeal'), true);
  }
  if (e.hp <= 0 && hasMod(e, 'undying') && !e.revived) { e.revived = true; e.hp = e.maxHp * 0.5; e.burn = 0; e.poison = 0; spawnText(e.x, e.y, 'ÅTERUPPSTÅR!', '#c0ffc0'); spawnPuff(e.x, e.y, 8); play('necro_raise', 0.6, 1.2, { x: e.x, y: e.y }); return false; } // odödlig en gång
  if (e.hp <= 0) { killEnemy(e); return true; }
  if (e.d.ai === 'blink' && (e.blinkCd || 0) <= 0 && Math.random() < 0.45) blink(e);
  if (!e.boss && !opt.quiet && Math.random() < 0.55 && e.state !== 'attack') { e.state = 'pain'; e.t = 0; }
  return false;
}
const killTimes = [];
function multiKill() { // flera dödade inom kort tid: meddelande och lite guld
  killTimes.push(tmr); while (killTimes.length && tmr - killTimes[0] > 1.3) killTimes.shift();
  const n = killTimes.length;
  if (n >= 2) { const t = n === 2 ? 'DUBBELT!' : n === 3 ? 'TRIPPEL!' : n === 4 ? 'FYRDUBBELT!' : 'MASSAKER!'; say(`${t} +${n * 3} GULD`, 1.2); run.gold += 3; P.multi = Math.max(P.multi || 0, n); }
}
function gib(e) { // köttbitar och ben flyger
  e.gibbed = true; stat('gibs'); play('gib', 0.5, rnd(0.9, 1.1), { x: e.x, y: e.y });
  const f = fx.parts.gib;
  for (let i = 0; i < 8; i++) { const a = rnd(0, TAU), sp = rnd(1, 3); particles.push({ x: e.x, y: e.y, z: 0.4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: rnd(1.5, 3.5), life: rnd(1.5, 2.5), img: f ? f[i % f.length] : fx.blood[i % 3], size: 0.1, grav: true, bounce: true }); }
  for (let i = 0; i < 6; i++) spawnBlood(e.x, e.y); addDecal(e.x, e.y); addDecal(e.x + rnd(-0.4, 0.4), e.y + rnd(-0.4, 0.4));
}
function shatter(e) { // frusna fiender splittras
  e.gibbed = true; play('ice_break', 0.7, rnd(0.9, 1.1), { x: e.x, y: e.y });
  const f = fx.parts.ice;
  for (let i = 0; i < 10; i++) { const a = rnd(0, TAU), sp = rnd(1, 3); particles.push({ x: e.x, y: e.y, z: 0.4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: rnd(1.5, 3), life: rnd(1, 1.6), img: f ? f[i % f.length] : fx.hit[0], size: 0.08, grav: true, bounce: true, tint: f ? null : [160, 210, 255] }); }
}
function comboKill(e) { // kombomätare: dödanden i följd inom 3 s
  P.combo = P.comboT > 0 ? P.combo + 1 : 1; P.comboT = 3;
  if (P.combo >= 3) { const g = 1 + Math.floor(P.combo / 3) + Math.round(mod('comboGold')); run.gold += g; if (P.combo % 3 === 0) { play('combo', 0.5, 1 + Math.min(1, P.combo / 15)); spawnText(e.x, e.y, `KOMBO x${P.combo}`, '#ffb040'); } }
  run.bestCombo = Math.max(run.bestCombo || 0, P.combo);
}
function killEnemy(e) {
  hitStop = Math.max(hitStop, e.boss ? 0.15 : e.elite ? 0.07 : 0.02);
  e.dead = true; e.t = 0; e.state = 'dead'; kills++; run.kills++; score += Math.round(e.d.score * (e.elite ? 3 : 1) * depthMul());
  multiKill(); addDecal(e.x, e.y); comboKill(e); vib(e.boss ? 'boss' : 'kill');
  play('click', 0.3, 2.4); // tydligt dödsljud
  if (e.boss || e.guardian) for (let i = 0; i < 5; i++) if (fx.parts.scorch) decals.push({ x: e.x + rnd(-0.8, 0.8), y: e.y + rnd(-0.8, 0.8), img: fx.parts.scorch[0], size: rnd(0.14, 0.24) }); // bossen lämnar en krater
  if (e.d.ai === 'wisp' || e.type === 'Ü') dissolve(e);
  else if (e.frozen > 0) shatter(e); else if (e.overkill) gib(e);
  else if (e.burn > 0 && !e.boss) { e.gibbed = true; for (let i = 0; i < 6; i++) particles.push({ x: e.x + rnd(-0.2, 0.2), y: e.y + rnd(-0.2, 0.2), z: rnd(0.1, 0.7), vx: rnd(-0.3, 0.3), vy: rnd(-0.3, 0.3), vz: 0.4, life: 1.5, maxLife: 1.5, img: fx.parts.ash ? fx.parts.ash[i % 2] : fx.hit[0], size: 0.07, drift: true }); if (fx.parts.scorch) decals.push({ x: e.x, y: e.y, img: fx.parts.scorch[0], size: 0.08 }); } // brända blir aska
  if (e.leader) leaderDied(e);
  abilityKill();
  if (quests) for (const q of quests) { if (q.kind === 'wkills' && !q.done && WEAPONS[P.weapon].id === q.weapon) q.have++; if (q.kind === 'elite' && e.elite) q.eliteKilled = true; }
  if ('YÉÅ'.includes(e.type) && Math.random() < 0.15) dropItem('meat', e.x, e.y);
  if (e.carry) { dropItem(e.carry, e.x, e.y); e.carry = null; }
  if (e.bounty) { stat('bounties'); run.gold += 40; items.push({ type: 'cardpick', x: e.x, y: e.y, taken: false, drop: true, luck: 0.6, title: 'BYTET' }); say('JAKTEN ÄR ÖVER: +40 GULD', 3); floorQuest = null; }
  if (e.type === 'Q' && floorQuest && floorQuest.kind === 'mimic') { run.gold += 30; say('MIMICEN ÄR FUNNEN: +30 GULD', 2.5); floorQuest = null; }
  if (e.champion) { stat('champions'); play('champion', 0.8); for (let i = 0; i < 10; i++) dropItem('gold', e.x, e.y); dropItem('goldpile', e.x, e.y); say('CHAMPION BESEGRAD!', 2); run.champions = (run.champions || 0) + 1; }
  if (mod('shieldOnKill')) P.shield = Math.min(mod('shield') + 30, P.shield + mod('shieldOnKill'));
  if (Math.random() < mod('killExplode')) explode(e.x, e.y, 12 * (1 + mod('dmg')), 1.6);
  if (!e.boss && !boss && kills >= totalEnemies && totalEnemies > 2) { slowmo = Math.max(slowmo, 0.9); say('VÅNINGEN ÄR RENSAD', 2); } // sista fienden: slow motion
  profile.bestiary = profile.bestiary || {}; if (!e.boss) profile.bestiary[e.type] = (profile.bestiary[e.type] || 0) + 1; run.wkills = run.wkills || {}; run.wkills[WEAPONS[P.weapon].id] = (run.wkills[WEAPONS[P.weapon].id] || 0) + 1;
  play('gore', 0.5, rnd(0.9, 1.2), { x: e.x, y: e.y });
  const dsnd = { S: ['bonesnap', 1], K: ['bonesnap', 0.8], N: ['bonesnap', 0.7], R: ['bonesnap', 1.2], V: ['pain', 1.2], I: ['hiss', 1.5], L: ['splat', 0.6], l: ['splat', 1.2], O: ['pain', 0.9], W: ['pain', 0.6] }[e.type] || ['pain', 0.8];
  play(dsnd[0], 0.5, dsnd[1] * rnd(0.92, 1.08), { x: e.x, y: e.y });
  for (let i = 0; i < 5; i++) spawnBlood(e.x, e.y);
  if (mod('killHeal')) heal(mod('killHeal'));
  petXp(1);
  if (!e.boss && !e.guardian && !e.minion && enemyFrames[e.type] && Math.random() < mod('allyChance')) { e.gibbed = true; const a = spawnAlly(e.type, e.x, e.y, 15, {}); if (a) { spawnText(e.x, e.y, 'RESER SIG', '#80ff90'); play('moan', 0.5, 1.3, { x: e.x, y: e.y }); } } // nekromanti
  if (mod('killArmor')) P.armor = Math.min(200, P.armor + mod('killArmor'));
  if (mod('speedOnKill')) P.haste = Math.max(P.haste, mod('speedOnKill'));
  if (e.boss) { bossDefeated(e); return; }
  if (e.d.ai === 'split') splitBlob(e);
  if (e.type === '!') { explode(e.x, e.y, 20, 2.0, true, true); play('bigboom', 0.8, 1.1, { x: e.x, y: e.y }); e.gibbed = true; }
  if (e.type === '^') sporeCloud(e.x, e.y);
  if (e.type === 'Ü') frostBurst(e.x, e.y);
  if (e.type === 'Æ') elementalSplit(e);
  if (e.poison > 0 && up('poison')) for (const o of nearestFoes(e, 3, 4)) o.poison = 4;
  if (e.burn > 0 && up('wildfire')) for (const o of nearestFoes(e, 3, 4)) { o.burn = Math.max(o.burn, 4); zap(e.x, e.y, o.x, o.y, [255, 140, 60]); }
  if (e.elite) {
    if (Math.random() < (dmod('elite') ? 1 : 0.15)) dropItem('cardpick', e.x, e.y); // ibland ett kortval
    for (let i = 0; i < 4; i++) dropItem('gold', e.x, e.y);
    dropItem(Math.random() < 0.5 ? 'health' : 'ammo', e.x, e.y);
    if (e.elite.id === 'explosive') explode(e.x, e.y, 18, 1.8, true);
    if (Math.random() < 0.06 + mod('weaponDrop')) { const miss = WEAPONS.map((w, i) => i).filter(i => !P.has[i]); if (miss.length && !run.pact && run.cmode !== 'pistol') { dropItem(WEAPONS[miss[(Math.random() * miss.length) | 0]].id, e.x, e.y); say('ELITEN TAPPADE ETT VAPEN', 2); } }
    if (hasMod(e, 'splitter')) for (let i = 0; i < 2; i++) { const a = rnd(0, TAU), o = makeEnemy(e.type, e.x + Math.cos(a) * 0.5, e.y + Math.sin(a) * 0.5); o.hp = o.maxHp = o.maxHp * 0.45; o.d = { ...o.d, size: o.d.size * 0.75 }; o.alert = true; o.minion = true; ents.push(o); totalEnemies++; spawnPuff(o.x, o.y, 4); }
    if (e.eliteGoldDone !== true) { e.eliteGoldDone = true; const g = Math.round(8 * mod('eliteGold')); if (g > 0) run.gold += g; }
  } else {
    const r = Math.random();
    const lowHp = P.hp < maxHp() * 0.35; // låg hälsa: hälsa faller oftare
    if (r < 0.22) dropItem('ammo', e.x, e.y); else if (r < (lowHp ? 0.45 : 0.32) * (asc() >= 3 ? 0.55 : 1) + 0.22 * (asc() >= 3 ? 0.45 : 0)) dropItem('health', e.x, e.y);
    if (Math.random() < 0.5) dropItem('gold', e.x, e.y);
  }
  // portal: när våningens sista elit dör, eller när alla fiender är döda
  if (!boss && !portals.length && ((e.elite && !ents.some(o => o.elite && !o.dead)) || kills >= totalEnemies)) {
    if (e.elite) spawnPortal(e.x, e.y, 'floor'); else spawnPortal(P.x + Math.cos(P.a) * 1.8, P.y + Math.sin(P.a) * 1.8, 'floor');
  }
}
// Explosion: skadar fiender (och spelaren om hurtsPlayer) inom radien
const flashes = []; // tillfälligt ljus från explosioner
function explode(x, y, dmg, r, hurtsPlayer, big) {
  const pd = Math.hypot(P.x - x, P.y - y);
  if (pd < r + 1.2 && pd > 0.05) { const k = (1 - pd / (r + 1.2)) * (big ? 0.9 : 0.4); for (let i = 0; i < 5; i++) tryMove(P, (P.x - x) / pd * k / 5, (P.y - y) / pd * k / 5, 0.24); if (big) P.jv = Math.max(P.jv, 1.2 * (1 - pd / (r + 1.2))); } // tryckvågen knuffar dig
  if (fx.parts.scorch && !solid(x, y)) { decals.push({ x, y, img: fx.parts.scorch[0], size: 0.05 + r * 0.03 }); if (decals.length > 70) decals.shift(); } // sotfläck
  for (const e of ents) if (!e.dead && !e.boss && !e.dormant) { const d = Math.hypot(e.x - x, e.y - y); if (d < r + 0.8 && d > 0.05) for (let i = 0; i < 4; i++) tryMove(e, (e.x - x) / d * 0.1 * (1 + mod('knockback')), (e.y - y) / d * 0.1 * (1 + mod('knockback')), 0.28); }
  for (const e of ents) if (e.dead && !e.gibbed && !e.boss && Math.hypot(e.x - x, e.y - y) < r * 0.8) gib(e); // liken sprängs i bitar
  burnWebs(x, y, r);
  if (pet && Math.hypot(pet.x - x, pet.y - y) < r + 0.5 && hurtsPlayer) hurtPet(10);
  for (const e of ents) if (!e.dead && e.sleep && Math.hypot(e.x - x, e.y - y) < 8) { e.sleep = false; alertEnemy(e, false); } // explosioner väcker sovande
  play('fireburst', 0.6, rnd(0.8, 1), { x, y });
  flashes.push({ x, y, t: 0.3, r: Math.min(6, 2 + r * 1.5) });
  const dp = Math.hypot(P.x - x, P.y - y); if (dp < 4.5) P.boom = Math.max(P.boom, 0.35 * (1 - dp / 4.5));
  if (dp < 12) P.shake = Math.max(P.shake, (big ? 2.4 : 1.2 + r * 0.2) * (1 - dp / 12)); // skakar efter avstånd
  for (let i = 0; i < 5; i++) particles.push({ x: x + rnd(-0.3, 0.3), y: y + rnd(-0.3, 0.3), z: rnd(0.2, 0.6), vx: rnd(-1, 1), vy: rnd(-1, 1), vz: rnd(0, 1), life: 0.4, maxLife: 0.4, frames: fx.fireball, img: fx.fireball[0], size: 0.45, add: true });
  for (const e of ents) if (!e.dead && Math.hypot(e.x - x, e.y - y) < r) hurtEnemy(e, dmg, e.x, e.y, { noProc: true, boom: true });
  for (const pt of pots) if (!pt.broken && Math.hypot(pt.x - x, pt.y - y) < r) breakPot(pt);
  for (const pr of props) if (pr.def && !pr.broken && (pr.def.boom || pr.def.crate) && Math.hypot(pr.x - x, pr.y - y) < r + 0.4) hitProp(pr, x, y); // kedjereaktioner
  for (let cy = Math.max(0, (y - r - 1) | 0); cy <= Math.min(mh - 1, (y + r + 1) | 0); cy++) for (let cx = Math.max(0, (x - r - 1) | 0); cx <= Math.min(mw - 1, (x + r + 1) | 0); cx++)
    if (map[cy][cx] === '{' && Math.hypot(cx + 0.5 - x, cy + 0.5 - y) < r + 0.9) blowWall(cx, cy); // spruckna väggar rasar
  if (hurtsPlayer && Math.hypot(P.x - x, P.y - y) < r) hurtPlayer(dmg, x, y, 'proj');
  P.flash = Math.max(P.flash, 0.05);
}
function dropItem(type, x, y) { const a = rnd(0, TAU), it = { type, x, y, taken: false, drop: true, hop: 0.5, hvx: Math.cos(a) * rnd(0.6, 1.4), hvy: Math.sin(a) * rnd(0.6, 1.4) }; if (type === 'potion') it.pot = randomPotion(); if (type === 'rune') it.rune = RUNE_IDS[(Math.random() * RUNE_IDS.length) | 0]; items.push(it); return it; } // studsar ut
// ---------- Föremål: krutfat, lådor, brunnar, altare och spikfällor ----------
function blowWall(cx, cy) {
  map[cy][cx] = '.'; flowCell = -1; secrets++; score += 250; profile.secrets = (profile.secrets || 0) + 1; stat('walls');
  play('bigboom', 0.7, 0.7, { x: cx + 0.5, y: cy + 0.5 }); play('secret', 0.8); say('VÄGGEN RASADE – ETT HEMLIGT RUM!', 3);
  for (let i = 0; i < 10; i++) { const a = rnd(0, TAU); particles.push({ x: cx + 0.5, y: cy + 0.5, z: rnd(0.2, 0.8), vx: Math.cos(a) * rnd(0.5, 2), vy: Math.sin(a) * rnd(0.5, 2), vz: rnd(0.5, 2), life: 1.2, img: fx.shards[(i % 6) + 6], size: 0.12, grav: true, bounce: true }); }
  spawnPuff(cx + 0.5, cy + 0.5, 8);
}
function hitProp(pr, hx, hy) { // sant om kulan kan fortsätta
  const d = pr.def;
  if (d.boom) { // krutfatet smäller efter ett ögonblick, kan sätta igång andra fat
    pr.broken = true; map[pr.cy][pr.cx] = '.'; flowCell = -1;
    fuses.push({ e: { dead: true }, x: pr.x, y: pr.y, t: 0.18, dmg: 30 * (1 + mod('dmg') * 0.5), r: 2.4, hurt: true, kind: typeof d.boom === 'string' ? d.boom : undefined });
    play('fireburst', 0.5, 1.4, { x: pr.x, y: pr.y }); return true;
  }
  if (d.crate) { breakCrate(pr); return true; }
  if (pr.ch === 'c') { pr.broken = true; const t = torches.find(t => t.prop === pr); if (t) t.cells = []; play('pot', 0.5, 1.6, { x: pr.x, y: pr.y }); sparks(pr.x, pr.y, 0.5, 5); return true; } // ljuset släcks
  pr.flashT = tmr + 0.06; spawnSpark(hx, hy); play('ricochet', 0.25, rnd(1.2, 1.6), { x: hx, y: hy }); return false;
}
function spawnSpark(x, y) { particles.push({ x, y, z: 0.5, vx: 0, vy: 0, vz: 0, life: 0.15, maxLife: 0.15, frames: fx.hit, img: fx.hit[0], size: 0.25, add: true }); }
function breakCrate(pr) {
  pr.broken = true; map[pr.cy][pr.cx] = '.'; flowCell = -1; score += 15;
  play('pot', 0.8, 0.6, { x: pr.x, y: pr.y }); play('kick', 0.5, 0.8, { x: pr.x, y: pr.y });
  for (let i = 0; i < 8; i++) {
    const a = rnd(0, TAU), sp = rnd(0.6, 2);
    particles.push({ x: pr.x, y: pr.y, z: 0.25, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: rnd(1, 2.5), life: rnd(0.9, 1.5), img: fx.crateBits ? fx.crateBits[i % 4] : fx.shards[i % 6], size: 0.16, grav: true, bounce: true });
  }
  const r = Math.random();
  if (r < 0.35) dropItem(Math.random() < 0.5 ? 'ammo' : 'health', pr.x, pr.y);
  else if (r < 0.7) for (let i = 0; i < 3; i++) dropItem('gold', pr.x, pr.y);
  else if (r < 0.78) dropItem('shard', pr.x, pr.y);
}
function breakProps(x, y, r, kicking) { // sparken: lådor går sönder, krutfat smäller
  let hit = false;
  for (const pr of props) if (pr.def && !pr.broken && (pr.def.crate || (pr.def.boom && !kicking)) && Math.hypot(pr.x - x, pr.y - y) < r + 0.3) { hitProp(pr, x, y); hit = true; }
  return hit;
}
function useProp() { // brunnen helar en gång, altaret ger ett förbannat kort och guld
  for (const pr of props) {
    if (!pr.def || !pr.def.use || (pr.used && pr.def.use !== 'anvil') || Math.hypot(pr.x - P.x, pr.y - P.y) > 1.3) continue;
    if (USES[pr.def.use]) { USES[pr.def.use](pr); return true; }
    if (pr.def.use === 'well') {
      if (P.hp >= maxHp()) { say('DU ÄR REDAN FRISK – SPARA BRUNNEN', 1.5); return true; }
      if (pr.poisoned) { pr.used = true; heal(10); P.poisonT = 7; play('splash', 0.8); play('gas', 0.5, 1.3); say('VATTNET VAR FÖRGIFTAT!', 2); stat('poisonWells'); return true; }
      pr.used = true; heal(40 * (1 + mod('healMul'))); play('splash', 0.8); play('health', 0.6, 0.8); say('DU DRICKER UR BRUNNEN', 2);
      for (let i = 0; i < 10; i++) particles.push({ x: pr.x, y: pr.y, z: 0.4, vx: rnd(-0.6, 0.6), vy: rnd(-0.6, 0.6), vz: rnd(1, 2), life: 0.8, maxLife: 0.8, frames: fx.hit, img: fx.hit[0], size: 0.15, add: true, tint: [255, 80, 90] });
      return true;
    }
    if (pr.def.use === 'altar') {
      const curses = Cards.ALL.filter(c => c.curse && !run.owned.includes(c.id));
      openUI(() => CardUI.choice({ title: 'DET FÖRBANNADE ALTARET', subtitle: 'BLOD FÖR GULD. ALTARET GER 60 GULD OCH ETT SLUMPAT FÖRBANNAT KORT.', cancel: 1,
        options: [{ label: 'OFFRA', text: '+60 GULD, +1 FÖRBANNELSE' }, { label: 'GÅ DÄRIFRÅN', text: '' }] }, i => {
        if (i === 0) {
          pr.used = true; run.gold += 60; play('bigboom', 0.4, 1.6); play('coin', 0.8, 0.8); P.flash = 0.2;
          const c = curses.length ? curses[(Math.random() * curses.length) | 0] : null;
          if (c) { gainCard(c); setTimeout(() => CardUI.toast(c, 'FÖRBANNELSE'), 100); } else say('ALTARET HAR INGET KVAR ATT GE', 2);
        }
        closeUI();
      }));
      return true;
    }
  }
  return false;
}
const USE_NAME = { well: 'DRICK UR BRUNNEN', altar: 'OFFRA VID ALTARET', anvil: 'SMEDJAN', fortune: 'SPÅALTARET', prisoner: 'BEFRIA FÅNGEN', challenge: 'BLÅS I HORNET', bowl: 'OFFERSKÅLEN', lever: 'DRA I SPAKEN', shelf: 'LETA I BOKHYLLAN', alchemist: 'TALA MED ALKEMISTEN', priest: 'TALA MED PRÄSTEN', petcage: 'ÖPPNA DJURBUREN', camp: 'SLÅ LÄGER VID ELDEN', quests: 'LÄS ANSLAGSTAVLAN', stairs: 'GÅ NED FÖR TRAPPAN' };
const wlvl = id => (run && run.wlvl && run.wlvl[id]) || 0;
const USES = {
  shelf(pr) { // bokhyllor kan gömma något
    pr.used = true; play('card', 0.5, 0.7);
    const r = Math.random();
    if (r < 0.12) { const c = drawCards(1, { luck: 0.5 })[0]; if (c) { gainCard(c); setTimeout(() => CardUI.toast(c, 'GÖMT I EN BOK'), 50); } }
    else if (r < 0.25) { run.gold += 15; say('EN PUNG I BOKHYLLAN: +15 GULD', 2); play('coin', 0.7); }
    else if (r < 0.3) { dropItem('scroll', P.x + Math.cos(P.a) * 0.5, P.y + Math.sin(P.a) * 0.5); say('EN GAMMAL KARTA FALLER UT', 2); }
    else if (r < 0.38 + mod('potionChance') * 0.3) { dropItem('potion', P.x + Math.cos(P.a) * 0.5, P.y + Math.sin(P.a) * 0.5); say('EN FLASKA BAKOM BÖCKERNA', 2); }
    else say('BARA DAMMIGA BÖCKER', 1.2);
  },
  anvil(pr) { // smedjan: +12 % skada per nivå på vapnet du håller
    const wp = WEAPONS[P.weapon], lv = wlvl(wp.id), price = [60, 110, 170][lv];
    const bag = (run.runeBag || []).length;
    if (lv >= 3 && !bag) { say(wp.name + ' ÄR REDAN FULLT SMIDD', 2); return; }
    openUI(() => CardUI.choice({ title: 'SMEDJAN', subtitle: `${wp.name}: NIVÅ ${lv} AV 3. NÄSTA NIVÅ GER +12 % SKADA. DU HAR ${run.gold} GULD.`, cancel: 2,
      options: [{ label: lv >= 3 ? 'FULLT SMIDD' : `SMID (${price} GULD)`, text: lv >= 3 ? '' : run.gold >= price ? '+12 % SKADA FÖR ALLTID' : 'FÖR LITE GULD' }, { label: `FÄST EN RUNA (${bag})`, text: bag ? 'RUNAN SÄTTS I VAPNET DU HÅLLER' : 'DU HAR INGA RUNOR' }, { label: 'GÅ DÄRIFRÅN', text: '' }] }, i => {
      if (i === 1) { closeUI(); if (bag) setTimeout(openRuneSocket, 50); return; }
      if (lv >= 3) { closeUI(); return; }
      if (i === 0 && run.gold >= price) { run.gold -= price; run.wlvl = run.wlvl || {}; run.wlvl[wp.id] = lv + 1; play('anvil', 0.9); P.shake = 0.5; say(`${wp.name} NIVÅ ${lv + 1}`, 2); sparks(pr.x, pr.y, 0.4, 8); }
      else if (i === 0) { say('FÖR LITE GULD', 1.5); play('click', 0.5, 0.6); }
      closeUI();
    }));
  },
  fortune(pr) { // spåaltaret: en slumpad välsignelse, ibland en förbannelse
    pr.used = true; stat('fortunes'); play('fortune', 0.8); P.flash = 0.15;
    if (!run.bossrush) { const bd = (cycleOf(run.depth) + 1) * (FLOORS + 1), b = BOSSES[bossFor(bd)]; if (b) setTimeout(() => say(`SPÅDOMEN: ${b.name} VÄNTAR I DJUPET${b.title ? ' – ' + b.title : ''}`, 4), 2600); } // spådom om nästa boss
    const r = Math.random();
    if (r < 0.55) { const c = drawCards(1, { luck: 1 })[0]; if (c) { gainCard(c); setTimeout(() => CardUI.toast(c, 'SPÅDOMEN'), 100); } say('SPÅKVINNAN SER LYCKA', 2.5); }
    else if (r < 0.8) { run.gold += 80; say('SPÅKVINNAN SER GULD: +80', 2.5); play('coin', 0.8, 0.8); }
    else if (r < 0.9) { P.grenades = Math.min(GREN_MAX(), P.grenades + 3); heal(40); say('SPÅKVINNAN SER STRID: +3 GRANATER, +40 HP', 2.5); }
    else { const cs = Cards.ALL.filter(c => c.curse && !run.owned.includes(c.id)); const c = cs[(Math.random() * cs.length) | 0]; if (c) { gainCard(c); setTimeout(() => CardUI.toast(c, 'OLYCKSBÅDAN'), 100); } run.gold += 120; say('SPÅKVINNAN SER OLYCKA – OCH 120 GULD', 3); }
  },
  prisoner(pr) { // fången: befria för guld och granater, eller ta med fången som allierad på våningen
    const g = 30 + run.depth * 6;
    openUI(() => CardUI.choice({ title: 'FÅNGEN', subtitle: '"SLÄPP UT MIG! JAG KAN BETALA – ELLER SLÅSS VID DIN SIDA."', cancel: 2,
      options: [{ label: 'TA BELÖNINGEN', text: `+${g} GULD OCH 2 GRANATER` }, { label: 'FÖLJ MED MIG', text: 'FÅNGEN SLÅSS FÖR DIG RESTEN AV VÅNINGEN' }, { label: 'INTE NU', text: '' }] }, i => {
      closeUI(); if (i === 2 || pr.used) return;
      pr.used = true; play('prisoner', 0.8); play('gate', 0.6, 1.3, { x: pr.x, y: pr.y }); spawnPuff(pr.x, pr.y, 6); stat('freed'); run.freed = (run.freed || 0) + 1;
      if (i === 1) { const a = spawnAlly('R', pr.x + Math.cos(P.a + Math.PI), pr.y + Math.sin(P.a + Math.PI), 9999, { tint: [255, 225, 180], dmg: 6 + run.depth, name: 'FÅNGEN' }); if (a && solid(a.x, a.y)) { a.x = P.x; a.y = P.y; } say('FÅNGEN FÖLJER DIG: "FÖR FRIHETEN!"', 3); }
      else { run.gold += g; P.grenades = Math.min(GREN_MAX(), P.grenades + 2); say(`FÅNGEN ÄR FRI! +${g} GULD OCH 2 GRANATER`, 3); }
      if (Math.random() < 0.4) dropItem('key', pr.x, pr.y);
      setTimeout(() => say('FÅNGEN VISKAR: ' + floorHint(pr), 4), 2500);
    }));
  },
  challenge(pr) { // utmaningsaltaret: överlev vågor
    if (challenge) return;
    openUI(() => CardUI.choice({ title: 'UTMANINGEN', subtitle: 'BLÅS I HORNET OCH ÖVERLEV VÅGOR AV FIENDER. DÖRRARNA STÄNGS. VÄLJ SVÅRIGHET.', cancel: 3,
      options: [{ label: 'LÄTT: 2 VÅGOR', text: 'GULD OCH ETT KORTVAL' }, { label: 'NORMAL: 3 VÅGOR', text: 'EN KISTA, GULD OCH ETT KORTVAL' }, { label: 'SVÅR: 5 VÅGOR', text: 'EN GLITTRANDE KISTA, MYCKET GULD, ETT BÄTTRE KORTVAL OCH EN DRYCK' }, { label: 'INTE NU', text: '' }] },
      i => { closeUI(); if (i < 3) startChallenge(pr, [2, 3, 5][i]); }));
  },
  bowl(pr) { // offerskålen: betala hälsa för ett kort
    if (P.hp <= 25) { say('DU HAR FÖR LITE BLOD ATT OFFRA', 2); return; }
    const petGift = !run.pet && P.hp > 35;
    openUI(() => CardUI.choice({ title: 'OFFERSKÅLEN', subtitle: 'SKÅLEN TÖRSTAR. OFFRA HÄLSA FÖR ETT KORT' + (petGift ? ' ELLER EN FÖLJESLAGARE.' : '.'), cancel: petGift ? 2 : 1,
      options: [{ label: 'OFFRA 20 HP', text: 'VÄLJ 1 AV 3 KORT' }, ...(petGift ? [{ label: 'OFFRA 30 HP', text: 'EN FÖLJESLAGARE FÖR RESTEN AV RUNDAN' }] : []), { label: 'GÅ DÄRIFRÅN', text: '' }] }, i => {
      if (petGift && i === 1) { closeUI(); pr.used = true; P.hp -= 30; P.hurt = 0.5; play('splat', 0.8, 0.7); givePet(PET_IDS[(Math.random() * PET_IDS.length) | 0], 'SKÅLEN GAV DIG'); return; }
      if (i !== 0) { closeUI(); return; }
      pr.used = true; P.hp -= 20; P.hurt = 0.5; play('splat', 0.8, 0.7); play('fortune', 0.5, 0.7);
      setTimeout(() => draftUI(drawCards(3, { luck: 0.8 }), { title: 'OFFERSKÅLEN', subtitle: 'VÄLJ ETT KORT', skipLabel: 'TA INGET' }, c => { if (c) gainCard(c); closeUI(); }), 50);
    }));
  },
  alchemist(pr) { openAlchemist(pr); },
  priest(pr) { openPriest(pr); },
  petcage(pr) { openPetCage(pr); },
  camp(pr) { openCampfire(pr); },
  quests(pr) { openQuestBoard(pr); },
  stairs(pr) { enterSecretStairs(pr); },
  lever(pr) { // spaken öppnar alla järngaller
    if (pr.used) return; pr.used = true; stat('levers'); play('lever', 0.9); P.shake = 0.3;
    let n = 0; for (const d of Object.values(doors)) if (d.lever) { d.lever = false; d.target = 1; n++; setTimeout(() => play('gate', 0.7, 0.9, { x: d.x + 0.5, y: d.y + 0.5 }), 300); }
    say(n ? 'NÅGONSTANS ÖPPNAS ETT GALLER' : 'SPAKEN GNISSLAR', 2.5);
  },
};
// ---------- Följeslagare: korpen, lyktan och vargvalpen ----------
const PETS = {
  raven: { name: 'KORPEN', text: 'HÄMTAR GULD OCH FÖREMÅL ÅT DIG', color: '#9a9ac8', snd: 'raven' },
  lantern: { name: 'LYKTAN', text: 'LYSER UPP MÖRKRET OCH VISAR FÄLLOR', color: '#ffd070', snd: 'lantern' },
  pup: { name: 'VARGVALPEN', text: 'BITER FIENDER SOM KOMMER NÄRA', color: '#c0d0e0', snd: 'pup_bark' },
};
const PET_IDS = Object.keys(PETS);
const petOpen = id => PET_IDS.indexOf(id) < meta('pet') || (profile.pets || []).includes(id);
let pet = null, allies = [];
const petLv = () => run && run.pet ? Math.min(5, 1 + Math.floor((run.petXp || 0) / 12)) : 0;
const petPow = () => (1 + (petLv() - 1) * 0.2) * (1 + mod('petPower'));
function givePet(id, why) {
  if (!run || !PETS[id]) return;
  run.pet = id; run.petXp = run.petXp || 0; spawnPet(); play(PETS[id].snd, 0.8);
  say(`${why || 'EN NY FÖLJESLAGARE'}: ${PETS[id].name} – ${PETS[id].text}`, 3.5); logEvent('FÖLJESLAGARE: ' + PETS[id].name); stat('petsGot');
  if (pet) spawnPuff(pet.x, pet.y, 6);
}
function spawnPet() {
  pet = run && run.pet ? { id: run.pet, x: P.x - Math.cos(P.a) * 0.7, y: P.y - Math.sin(P.a) * 0.7, z: 0, t: 0, st: 'follow', cd: 1, rest: 0, tired: 0, target: null, mvx: 0, mvy: 0 } : null;
  if (pet && solid(pet.x, pet.y)) { pet.x = P.x; pet.y = P.y; }
}
function petXp(n) {
  if (!run || !run.pet) return; const lv = petLv(); run.petXp = (run.petXp || 0) + n;
  if (petLv() > lv) { say(`${PETS[run.pet].name} NÅDDE NIVÅ ${petLv()}`, 2); play(PETS[run.pet].snd, 0.7, 1.2); if (pet) spawnPuff(pet.x, pet.y, 5); }
}
function hurtPet(n) { // följeslagaren kan inte dö, men skadas den för mycket måste den vila
  if (!pet || pet.rest > 0) return; pet.tired += n;
  if (pet.tired >= 20) { pet.rest = 6; pet.tired = 0; pet.target = null; say(`${PETS[pet.id].name} ÄR SKADAD OCH VILAR EN STUND`, 1.8); play(PETS[pet.id].snd, 0.5, 0.7, { x: pet.x, y: pet.y }); }
}
function petMove(p, tx, ty, sp, dt, fly) {
  const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy); if (d < 0.05) { p.mvx = p.mvy = 0; return d; }
  const st = Math.min(d, sp * dt), ox = p.x, oy = p.y;
  if (fly) { p.x += dx / d * st; p.y += dy / d * st; } else tryMove(p, dx / d * st, dy / d * st, 0.18);
  p.mvx = p.x - ox; p.mvy = p.y - oy; return d;
}
const RAVEN_TAKES = it => it.type === 'gold' || it.type === 'goldpile' || it.type === 'shard' || it.type === 'key' || it.type === 'scroll'
  || (it.type === 'potion' && (P.potions || []).length < potSlots()) || (it.type === 'grenade' && P.grenades < GREN_MAX()) || (it.type === 'health' && P.hp < maxHp() * 0.8);
function updatePet(dt) {
  if (!run || !run.pet || boss && boss.dead === false && run.bossrush) { if (!run || !run.pet) pet = null; }
  if (!run || !run.pet) return;
  if (!pet || pet.id !== run.pet) spawnPet();
  const p = pet, lv = petLv(), fly = p.id !== 'pup'; p.t += dt; p.cd -= dt;
  p.z = fly ? 0.42 + Math.sin(p.t * 3) * 0.06 : 0;
  const side = P.a + 2.3, hx = P.x + Math.cos(side) * 0.9, hy = P.y + Math.sin(side) * 0.9; // snett bakom dig
  if (Math.hypot(p.x - P.x, p.y - P.y) > 11 || (!fly && solid(p.x, p.y))) { p.x = solid(hx, hy) ? P.x : hx; p.y = solid(hx, hy) ? P.y : hy; spawnPuff(p.x, p.y, 3); }
  if (p.rest > 0) { // vilar: sitter still och sover
    p.rest -= dt; p.st = 'rest'; p.mvx = p.mvy = 0;
    if (Math.random() < dt * 1.2) particles.push({ x: p.x, y: p.y, z: 0.4, vx: 0, vy: 0, vz: 0.3, life: 1, maxLife: 1, img: fx.parts.zzz ? fx.parts.zzz[0] : fx.hit[1], size: 0.08, drift: true });
    if (p.rest <= 0) p.st = 'follow'; return;
  }
  p.tired = Math.max(0, p.tired - dt * 0.6);
  if (p.id === 'raven') { // korpen hämtar det som ligger nära
    if (p.target && (p.target.taken || !RAVEN_TAKES(p.target))) p.target = null;
    if (!p.target && p.cd <= 0) {
      let best = null, bd = 6 + lv;
      for (const it of items) if (!it.taken && !(it.hop > 0) && RAVEN_TAKES(it)) { const d = Math.hypot(it.x - P.x, it.y - P.y); if (d < bd && d > 0.8 && seen[(it.y | 0) * mw + (it.x | 0)]) { bd = d; best = it; } }
      p.target = best; p.cd = 0.4;
      if (best && Math.random() < 0.3) play('raven', 0.4, rnd(0.9, 1.2), { x: p.x, y: p.y });
    }
    if (p.target) {
      p.st = 'move';
      if (petMove(p, p.target.x, p.target.y, (4 + lv * 0.6) * (1 + mod('petPower') * 0.5), dt, true) < 0.3) {
        const it = p.target; p.target = null; p.cd = Math.max(0.3, 1.3 - lv * 0.18);
        if (!it.taken && pickUp(it)) { it.taken = true; score += 25; if (!it.drop) itemsTaken++; petXp(0.4); spawnPuff(it.x, it.y, 2); }
      }
      return;
    }
  }
  if (p.id === 'pup') { // valpen anfaller fiender som är nära dig
    if (p.target && (p.target.dead || p.target.dormant || Math.hypot(p.target.x - P.x, p.target.y - P.y) > 8 + lv)) p.target = null;
    if (!p.target && p.cd <= 0) {
      let best = null, bd = 5 + lv;
      for (const e of ents) if (!e.dead && !e.dormant && !e.hidden && e.alert && !(e.ghost > 0.5)) { const d = Math.hypot(e.x - P.x, e.y - P.y); if (d < bd && hasLOS(p.x, p.y, e.x, e.y)) { bd = d; best = e; } }
      p.target = best; if (best) { play('pup_bark', 0.5, rnd(0.95, 1.15), { x: p.x, y: p.y }); p.cd = 0.3; }
    }
    if (p.target) {
      const e = p.target; p.st = p.st === 'attack' && p.t < 0.35 ? 'attack' : 'move';
      const d = petMove(p, e.x, e.y, 4.4 + lv * 0.3, dt, false);
      if (d < 0.75 + e.d.size * 0.3 && p.cd <= 0) {
        p.st = 'attack'; p.t = 0; p.cd = Math.max(0.55, 1.2 - lv * 0.1);
        const k = hurtEnemy(e, 4 * petPow(), e.x, e.y, { noProc: true }); e.slow = Math.max(e.slow || 0, 0.6);
        play('pup_bite', 0.6, rnd(0.9, 1.1), { x: e.x, y: e.y }); spawnBlood(e.x, e.y);
        if (k) { petXp(2); p.target = null; } else hurtPet(e.elite || e.boss ? 3 : 1.5);
      }
      return;
    }
  }
  if (p.id === 'lantern') { // lyktan visar fällor och smygande fiender nära dig
    if (p.cd <= 0) {
      p.cd = 0.5;
      for (const pr of props) if (pr.def && (pr.def.trap || pr.ch === 'z') && !pr.broken && Math.hypot(pr.x - p.x, pr.y - p.y) < 4 + lv) { pr.lit = tmr + 1; particles.push({ x: pr.x, y: pr.y, z: 0.2, vx: 0, vy: 0, vz: 0.4, life: 0.6, maxLife: 0.6, img: fx.hit[1], size: 0.06, add: true, tint: [255, 140, 60], fade: true }); }
      for (const e of ents) if (!e.dead && hasMod(e, 'stalker') && Math.hypot(e.x - p.x, e.y - p.y) < 4 + lv) e.revealT = Math.max(e.revealT || 0, 1);
    }
  }
  p.st = Math.hypot(p.x - hx, p.y - hy) > 0.4 ? 'move' : 'idle';
  petMove(p, hx, hy, Math.max(2.5, Math.hypot(P.vx, P.vy) * 1.15), dt, fly);
}
function petFrames(id) {
  const f = fx.pets && fx.pets[id];
  if (f) return f;
  if (id === 'raven') return { idle: fx.parts.bat || fx.hit, tint: [70, 70, 90] };
  if (id === 'lantern') return { idle: fx.parts.wisp || fx.fireball, tint: [255, 210, 120], add: true };
  return enemyFrames['É'] ? { idle: enemyFrames['É'].idle, move: enemyFrames['É'].move, attack: enemyFrames['É'].attack, tint: [200, 190, 170] } : { idle: fx.hit };
}
function drawPet(o, plX, plY) {
  const f = petFrames(o.id), set = (o.st === 'attack' && f.attack) || ((o.st === 'move') && f.move) || f.idle;
  const n = o.st === 'attack' ? Math.min(set.length - 1, Math.floor(o.t * 10)) : Math.floor(tmr * (o.st === 'move' ? 10 : 6) + o.x) % set.length;
  const flip = (o.mvx || o.mvy) ? o.mvx * plX + o.mvy * plY < 0 : false;
  const size = o.id === 'pup' ? 0.48 : 0.3;
  drawSprite(set[n], o.x, o.y, size, o.z, flip, o.id === 'lantern' ? 2 : null, 0, 0.55, !!f.add, o.rest > 0 ? [150, 150, 170] : f.tint || null);
}
// allierade: befriade fångar, nekromantikerns uppväckta döda
function spawnAlly(type, x, y, life, opt = {}) {
  const d = ENEMY_DEFS[type]; if (!d || !enemyFrames[type]) return null;
  const a = { type, d, x, y, t: 0, state: 'move', life, cd: 0.6, dmg: opt.dmg || Math.max(3, d.dmg * 0.6), tint: opt.tint || [120, 255, 140], ally: true, mvx: 0, mvy: 0, name: opt.name || d.name };
  allies.push(a); spawnPuff(x, y, 6); stat('allies'); return a;
}
function updateAllies(dt) {
  for (const a of allies) {
    a.t += dt; a.life -= dt; a.cd -= dt;
    if (a.life <= 0) { a.gone = true; spawnPuff(a.x, a.y, 5); continue; }
    if (a.state === 'attack') { if (a.t > 0.55) { a.state = 'move'; a.t = 0; } continue; }
    let foe = null, fd = 9;
    for (const e of ents) if (!e.dead && !e.dormant && !e.hidden) { const d = Math.hypot(e.x - a.x, e.y - a.y); if (d < fd && hasLOS(a.x, a.y, e.x, e.y)) { fd = d; foe = e; } }
    const ox = a.x, oy = a.y, sp = a.d.speed * dt * 1.1;
    if (foe) {
      if (fd < 0.85 + foe.d.size * 0.3) { if (a.cd <= 0) { a.state = 'attack'; a.t = 0; a.cd = 1.1; hurtEnemy(foe, a.dmg * (1 + mod('petPower') * 0.5), foe.x, foe.y, { noProc: true }); play('splat', 0.3, 1.1, { x: foe.x, y: foe.y }); } }
      else tryMove(a, (foe.x - a.x) / fd * sp, (foe.y - a.y) / fd * sp, 0.25);
    } else { const d = Math.hypot(P.x - a.x, P.y - a.y); if (d > 1.8) tryMove(a, (P.x - a.x) / d * sp, (P.y - a.y) / d * sp, 0.25); if (d > 14) { a.x = P.x - Math.cos(P.a); a.y = P.y - Math.sin(P.a); } }
    a.mvx = a.x - ox; a.mvy = a.y - oy; if (!a.mvx && !a.mvy && a.state === 'move') a.state = 'idle';
    else if (a.state === 'idle' && (a.mvx || a.mvy)) a.state = 'move';
  }
  allies = allies.filter(a => !a.gone);
}

// ---------- Drycker: två platser, H dricker, J byter ----------
const POTIONS = {
  heal: { name: 'LÄKEDRYCK', text: '+50 HÄLSA', color: '#e04848', tint: [255, 80, 80], snd: 'drink' },
  rage: { name: 'RASERIDRYCK', text: '+50 % SKADA I 8 S', color: '#ff9030', tint: [255, 140, 40], snd: 'potion_rage' },
  ghost: { name: 'OSYNLIGHETSDRYCK', text: 'FIENDERNA TAPPAR DIG I 6 S', color: '#b070ff', tint: [170, 110, 255], snd: 'potion_ghost' },
  speed: { name: 'SNABBHETSDRYCK', text: '+40 % FART I 8 S', color: '#60e060', tint: [100, 255, 120], snd: 'potion_speed' },
  ice: { name: 'ISDRYCK', text: 'FRYSER FIENDER RUNT DIG, +30 RUSTNING', color: '#70e0ff', tint: [120, 220, 255], snd: 'potion_ice' },
};
const POTION_IDS = Object.keys(POTIONS);
const potKnown = id => (profile.potions || []).includes(id);
const potSlots = () => 2 + meta('potslot');
const potName = p => potKnown(p.id) ? (p.strong ? 'STARK ' : '') + POTIONS[p.id].name : (p.strong ? 'STARK ' : '') + 'OKÄND DRYCK';
const randomPotion = (r = Math.random) => r() < 0.34 ? 'heal' : POTION_IDS[1 + ((r() * 4) | 0)];
const hudImg = {};
let potBtn = null;
function givePotion(id, strong, silent) {
  P.potions = P.potions || [];
  if (P.potions.length >= potSlots()) { if (!silent && (P.potMsgT || 0) < tmr) { P.potMsgT = tmr + 3; say('DRYCKESPLATSERNA ÄR FULLA – DRICK MED H', 1.5); } return false; }
  P.potions.push({ id, strong: !!strong });
  if (!silent) { say(`DU FICK: ${potName(P.potions[P.potions.length - 1])}`, 2); play('pickup', 0.6, 1.3); }
  return true;
}
function drinkPotion() {
  if (state !== 'play') return;
  if (!P.potions || !P.potions.length) { if ((P.potMsgT || 0) < tmr) { P.potMsgT = tmr + 1.5; say('DU HAR INGA DRYCKER', 1); play('click', 0.4, 0.8); } return; }
  if ((P.drinkCd || 0) > tmr) return; P.drinkCd = tmr + 0.6;
  const p = P.potions.shift(), d = POTIONS[p.id], k = (1 + mod('potionPower')) * (p.strong ? 1.6 : 1);
  const first = !potKnown(p.id); if (first) { profile.potions = (profile.potions || []).concat(p.id); saveProfile(); }
  play('drink', 0.8); if (d.snd !== 'drink') setTimeout(() => play(d.snd, 0.7), 280);
  stat('potions_n'); vib('potion'); run.potionsDrunk = (run.potionsDrunk || 0) + 1; P.potFlash = { tint: d.tint, t: 0.7 }; WS.kick = Math.max(WS.kick, 0.15);
  if (p.id === 'heal') { const n = Math.round(heal(50 * k * (1 + mod('healMul')))); spawnText(P.x + Math.cos(P.a), P.y + Math.sin(P.a), `+${n} HP`, '#ff7060'); }
  else if (p.id === 'rage') P.rageT = 8 * k;
  else if (p.id === 'ghost') { P.ghostT = 6 * k; for (const e of ents) if (!e.dead && !e.boss && e.alert && !e.guardian) { e.alert = false; e.lostT = 0; e.searchT = 2; e.state = 'idle'; } }
  else if (p.id === 'speed') P.speedT = 8 * k;
  else if (p.id === 'ice') { P.coolT = 12;
    const r = 4 * Math.sqrt(k); for (const e of ents) if (!e.dead && !e.dormant && Math.hypot(e.x - P.x, e.y - P.y) < r) freeze(e, 3 * k);
    P.armor = Math.min(200, P.armor + Math.round(30 * k)); play('freeze', 0.7, 0.8);
    for (let i = 0; i < 18; i++) { const a = i / 18 * TAU; particles.push({ x: P.x, y: P.y, z: 0.3, vx: Math.cos(a) * r * 1.5, vy: Math.sin(a) * r * 1.5, vz: 0, life: 0.6, maxLife: 0.6, img: fx.parts.ice ? fx.parts.ice[i % 3] : fx.hit[1], size: 0.08, add: !fx.parts.ice, tint: [170, 230, 255], fade: true }); }
  }
  say((first ? 'NY DRYCK UPPTÄCKT: ' : '') + `${(p.strong ? 'STARK ' : '') + d.name} – ${d.text}`, 2.5);
  checkAch();
}
function swapPotion() {
  if (!P.potions || P.potions.length < 2) { say(P.potions && P.potions.length ? 'DU HAR BARA EN DRYCK' : 'DU HAR INGA DRYCKER', 1); return; }
  P.potions.push(P.potions.shift()); play('click', 0.5, 1.4); say('NÄSTA DRYCK: ' + potName(P.potions[0]), 1.2);
}
function updatePotions(dt) {
  if (!potBtn) potBtn = document.querySelector('#touch .potb'); if (potBtn) potBtn.classList.toggle('empty', !(P.potions && P.potions.length));
  if (P.potFlash) { P.potFlash.t -= dt; if (P.potFlash.t <= 0) P.potFlash = null; }
  for (const k of ['rageT', 'ghostT', 'speedT']) if (P[k] > 0) { P[k] -= dt; if (P[k] <= 0) { P[k] = 0; say({ rageT: 'RASERIET LÄGGER SIG', ghostT: 'DU SYNS IGEN', speedT: 'FARTEN AVTAR' }[k], 1.2); } }
  if (P.rageT > 0 && !settings.lowfx && Math.random() < dt * 8) particles.push({ x: P.x + Math.cos(P.a) * 0.6 + rnd(-0.3, 0.3), y: P.y + Math.sin(P.a) * 0.6 + rnd(-0.3, 0.3), z: rnd(0.1, 0.4), vx: 0, vy: 0, vz: 0.6, life: 0.4, maxLife: 0.4, img: fx.hit[1], size: 0.04, add: true, tint: [255, 90, 40], fade: true });
}
function drawPotionHud(g) { // dryckerna i listen och färgen i bilden
  const fxOn = [P.rageT > 0 && POTIONS.rage, P.ghostT > 0 && POTIONS.ghost, P.speedT > 0 && POTIONS.speed].filter(Boolean);
  for (const d of fxOn) { const [r, gg, b] = d.tint; g.fillStyle = `rgba(${r},${gg},${b},0.07)`; g.fillRect(0, 0, W, VH); g.strokeStyle = `rgba(${r},${gg},${b},0.35)`; g.lineWidth = 3; g.strokeRect(1.5, 1.5, W - 3, VH - 3); g.lineWidth = 1; }
  if (P.potFlash) { const [r, gg, b] = P.potFlash.tint; g.fillStyle = `rgba(${r},${gg},${b},${0.3 * P.potFlash.t})`; g.fillRect(0, 0, W, VH); }
  const n = potSlots(), x0 = 6, y = VH - 16;
  if (!(P.potions && P.potions.length) && !settings.potHud) return;
  for (let i = 0; i < n; i++) {
    const p = P.potions && P.potions[i], x = x0 + i * 11;
    g.fillStyle = i === 0 ? 'rgba(80,60,40,0.75)' : 'rgba(30,22,18,0.6)'; g.fillRect(x, y, 10, 12);
    if (!p) continue;
    const im = hudImg[potKnown(p.id) ? 'potion_' + p.id : 'potion_unknown'] || hudImg['potion_' + p.id];
    if (im) g.drawImage(im, x + 1, y, 8, 12);
    else { g.fillStyle = potKnown(p.id) ? POTIONS[p.id].color : '#909090'; g.fillRect(x + 3, y + 4, 4, 7); g.fillRect(x + 4, y + 1, 2, 3); }
    if (p.strong) { g.fillStyle = '#ffe070'; g.fillRect(x + 8, y, 2, 2); }
  }
  if (!isTouch()) txt(keyName((settings.binds || {}).KeyH || 'KeyH'), x0 + n * 11 + 2, y + 3, '#c9a87a', 1, true, 0.7);
}

// ---------- NPC:er: alkemisten och prästen ----------
const NPC_LINES = {
  merchant: ['KÖP NÅGOT, VANDRARE', 'MINA PRISER ÄR DE BÄSTA HÄR NERE', 'DU SER UT ATT BEHÖVA KRUT', 'GULD ÄR GULD, ÄVEN BLAND DE DÖDA'],
  alchemist: ['BUBBEL... BUBBEL...', 'VILL DU SMAKA? DET ÄR NÄSTAN SÄKERT', 'TVÅ DRYCKER BLIR EN STARKARE', 'JAG HAR NÅGOT FÖR VARJE KRÄMPA'],
  priest: ['MÅ LJUSET VAKA ÖVER DIG', 'JAG KAN LYFTA DIN FÖRBANNELSE – MOT EN GÅVA', 'KNÄFALL, OCH BLI VÄLSIGNAD', 'DE DÖDA VILAR INTE HÄR NERE'],
  prisoner: ['HJÄLP MIG, SNÄLLA!', 'NYCKELN... NÅGON TOG NYCKELN', 'SLÄPP UT MIG SÅ HJÄLPER JAG DIG'],
};
const NPC_OF = { '£': 'alchemist', '€': 'priest', '[': 'prisoner' };
let npcTalkT = 0;
function updateNpcTalk(dt) {
  npcTalkT -= dt; if (npcTalkT > 0) return; npcTalkT = 0.5;
  const talk = (o, kind, x, y) => { if ((o.talkT || 0) > tmr || Math.hypot(x - P.x, y - P.y) > 3.2 || !hasLOS(P.x, P.y, x, y)) return false;
    o.talkT = tmr + 25; const ls = NPC_LINES[kind]; say(`${{ merchant: 'KÖPMANNEN', alchemist: 'ALKEMISTEN', priest: 'PRÄSTEN', prisoner: 'FÅNGEN' }[kind]}: "${ls[(Math.random() * ls.length) | 0]}"`, 3);
    play(kind === 'alchemist' ? 'npc_alchemist' : kind === 'priest' ? 'npc_priest' : kind === 'prisoner' ? 'prisoner' : 'npc_alchemist', 0.5, kind === 'merchant' ? 0.8 : 1, { x, y }); return true; };
  for (const m of merchants) if (!m.shadow && talk(m, 'merchant', m.x, m.y)) return;
  for (const pr of props) if (pr.def && NPC_OF[pr.ch] && !pr.used && talk(pr, NPC_OF[pr.ch], pr.x, pr.y)) return;
}
const npcDisc = () => clamp(mod('npcDiscount'), 0, 0.6);
function openAlchemist(pr) {
  if (!pr.stock) { const r = RNG(RNG.hash(run.seed + ':alk:' + run.depth)); pr.stock = [randomPotion(() => r.next()), randomPotion(() => r.next()), randomPotion(() => r.next())]; if (!pr.stock.includes('heal')) pr.stock[0] = 'heal'; }
  const price = id => Math.round((id === 'heal' ? 30 : 42) * (1 - npcDisc()) * (1 + run.depth * 0.04));
  const items = () => [
    ...pr.stock.map((id, i) => ({ kind: 'potion', act: 'buy', idx: i, color: potKnown(id) ? POTIONS[id].color : '#a0a0a0', label: potKnown(id) ? POTIONS[id].name : 'OKÄND DRYCK', text: potKnown(id) ? POTIONS[id].text : 'DRICK DEN FÖR ATT LÄRA DIG VAD DEN GÖR', price: price(id) })),
    { kind: 'blend', act: 'blend', label: 'BLANDA DRYCKER', text: (P.potions || []).length >= 2 ? `${potName(P.potions[0])} + ${potName(P.potions[1])} BLIR EN STARK DRYCK (+60 %)` : 'BÄR TVÅ DRYCKER SÅ BLANDAR JAG DEM TILL EN STARKARE', price: Math.round(20 * (1 - npcDisc())) },
    { kind: 'potion', act: 'mystery', color: '#c080ff', label: 'ALKEMISTENS EXPERIMENT', text: 'EN STARK, OKÄND DRYCK', price: Math.round(55 * (1 - npcDisc())) },
  ];
  play('npc_alchemist', 0.6);
  openUI(() => CardUI.shop(items(), run.gold, item => {
    if (run.gold < item.price) return { ok: false, gold: run.gold };
    if (item.act === 'buy' || item.act === 'mystery') {
      const id = item.act === 'buy' ? pr.stock[item.idx] : randomPotion();
      if (!givePotion(id, item.act === 'mystery', true)) return { ok: false, gold: run.gold, msg: 'DRYCKESPLATSERNA ÄR FULLA' };
      run.gold -= item.price; play('buy', 0.8); play('pickup', 0.5, 1.3); if (item.act === 'buy') pr.stock.splice(item.idx, 1); stat('potionsBought');
      return { ok: true, gold: run.gold, items: items(), msg: 'DU FICK: ' + potName(P.potions[P.potions.length - 1]) };
    }
    if (item.act === 'blend') {
      if ((P.potions || []).length < 2) return { ok: false, gold: run.gold, msg: 'DU BEHÖVER TVÅ DRYCKER' };
      run.gold -= item.price; const a = P.potions.shift(), b = P.potions.shift(), id = a.id === b.id || Math.random() < 0.5 ? a.id : b.id;
      P.potions.unshift({ id, strong: true }); play('potion_ice', 0.6, 1.3); play('npc_alchemist', 0.5); stat('blends');
      return { ok: true, gold: run.gold, items: items(), msg: 'DU FICK: ' + potName(P.potions[0]) };
    }
    return { ok: false, gold: run.gold };
  }, () => closeUI(), { title: 'ALKEMISTEN', currency: 'GULD' }));
}
function openPriest(pr) {
  const curses = [...new Set(run.owned)].map(id => Cards.byId(id)).filter(c => c && c.curse);
  const cPrice = Math.round((50 + 12 * run.depth) * (1 - npcDisc())), bPrice = Math.round(40 * (1 - npcDisc()));
  play('npc_priest', 0.6);
  openUI(() => CardUI.choice({ title: 'PRÄSTEN', subtitle: `"MÅ LJUSET VAKA ÖVER DIG." DU HAR ${run.gold} GULD.`, cancel: 2,
    options: [
      { label: `LYFT EN FÖRBANNELSE (${cPrice} GULD)`, text: curses.length ? `TA BORT ETT FÖRBANNAT KORT (${curses.length} I LEKEN)` : 'DU BÄR INGA FÖRBANNELSER' },
      { label: run.blessed ? 'REDAN VÄLSIGNAD' : `VÄLSIGNELSE (${bPrice} GULD)`, text: run.blessed ? 'EN VÄLSIGNELSE PER RUNDA' : '+20 MAX HP RESTEN AV RUNDAN, OCH FULL HÄLSA' },
      { label: 'GÅ DÄRIFRÅN', text: '' },
    ] }, i => {
    if (i === 0 && curses.length && run.gold >= cPrice) {
      setTimeout(() => CardUI.draft(curses, { title: 'LYFT EN FÖRBANNELSE', subtitle: 'VÄLJ KORTET SOM SKA BORT', skipLabel: 'ÅNGRA' }, c => {
        if (c) { run.gold -= cPrice; run.owned.splice(run.owned.indexOf(c.id), 1); recomputeMods(); play('bless', 0.8); P.flash = 0.2; say(c.name + ' ÄR LYFT', 2.5); stat('cursesLifted'); }
        closeUI(); }), 50);
      return;
    }
    if (i === 1 && !run.blessed && run.gold >= bPrice) { run.gold -= bPrice; run.blessed = 1; heal(maxHp()); play('bless', 0.9); P.flash = 0.3; say('DU ÄR VÄLSIGNAD: +20 MAX HP', 3); stat('blessings'); spawnPuff(P.x + Math.cos(P.a), P.y + Math.sin(P.a), 8); }
    else if (i < 2 && !(i === 0 && !curses.length) && !(i === 1 && run.blessed)) { say('FÖR LITE GULD', 1.5); play('click', 0.5, 0.6); }
    closeUI();
  }));
}
function openPetCage(pr) {
  const have = run.pet, pool = PET_IDS.filter(id => id !== have), id = pool[RNG(RNG.hash(run.seed + ':bur:' + run.depth)).int(0, pool.length - 1)];
  openUI(() => CardUI.choice({ title: 'DJURBUREN', subtitle: `${PETS[id].name} SITTER INSPÄRRAD. ${PETS[id].text}.${have ? ` DIN ${PETS[have].name} ÅKER HEM.` : ''}`, cancel: 1,
    options: [{ label: 'BEFRIA ' + PETS[id].name, text: 'FÖLJER DIG RESTEN AV RUNDAN' }, { label: 'LÅT DEN VARA', text: '' }] }, i => {
    closeUI(); if (i !== 0) return;
    pr.used = true; play('gate', 0.6, 1.4, { x: pr.x, y: pr.y }); run.petXp = Math.max(run.petXp || 0, 6);
    givePet(id, 'DU BEFRIADE'); if (pet) { pet.x = pr.x; pet.y = pr.y; if (solid(pet.x, pet.y)) { pet.x = P.x; pet.y = P.y; } }
    profile.pets = [...new Set([...(profile.pets || []), id])]; saveProfile();
  }));
}

// ---------- Vägval: två portaler mot olika biomer ----------
const BIOME_RISK = { volcano: 3, dungeon: 1, caves: 1, forest: 1, graveyard: 2, courtyard: 2, swamp: 3, frost: 3 };
const riskText = b => ['', 'LUGN VÄG', 'FARLIG VÄG: +15 % GULD', 'SVÅR VÄG: +30 % GULD OCH FLER ELITER'][BIOME_RISK[b] || 1];
function routePortals(p) { // en andra portal mot en annan biom
  if (!run || run.bossrush || run.practice || isBossDepth(run.depth + 1) || params.get('biome')) return;
  const next = run.depth + 1, def = biomeFor(next), r = RNG(RNG.hash(run.seed + ':väg:' + next));
  const alt = r.pick(BIOME_IDS.filter(b => b !== def));
  for (const ang of [P.a + Math.PI / 2, P.a - Math.PI / 2, P.a + Math.PI, P.a]) {
    const x = p.x + Math.cos(ang) * 2.2, y = p.y + Math.sin(ang) * 2.2;
    if (freeSpot(x, y, 0.35) && hasLOS(p.x, p.y, x, y)) { p.biome = def; portals.push({ x, y, kind: 'floor', biome: alt, t: 0, armed: Math.hypot(P.x - x, P.y - y) > 1 }); spawnPuff(x, y, 8); say('TVÅ PORTALER – VÄLJ VÄG', 3); return; }
  }
}
const goldRisk = () => run && lvl && !boss ? [0, 0, 0.15, 0.3][(run.route && run.route[run.depth]) || 0] || 0 : 0;

// ---------- Hemlig handlare (syns bara i mörker) och förgiftade brunnar ----------
function addPropAt(ch, x, y) { // ny rekvisita under spelets gång
  const d = PROP_DEFS[ch], frames = fx.props[d.img] || fx.props[d.fb]; if (!frames) return null;
  const o = { x: x + 0.5, y: y + 0.5, cx: x, cy: y, ch, def: d, frames, img: frames[0], size: d.size, flip: false, ph: Math.random() * 10 };
  props.push(o); if (d.block) map[y][x] = ch; flowCell = -1;
  if (d.light) { const t = { x: o.x, y: o.y, ph: o.ph, cells: [], hidden: true, str: d.light, r: 4, prop: o }; torches.push(t); const keep = torches.slice(); torches.length = 0; torches.push(t); prepareTorchLight(); torches.length = 0; torches.push(...keep); }
  return o;
}
function setupNpcFloor(lrng) {
  for (const pr of props) if (pr.ch === 'w' && run.depth >= 2 && lrng.chance(0.2)) pr.poisoned = true; // grönt vatten
  if (!boss && run.depth >= 2 && lrng.chance(0.12)) { // den hemliga handlaren står där det är mörkast
    let best = null, bd = 0;
    for (let i = 0; i < 40; i++) { const s = randomFreeCell(lrng); if (!s) continue; const d = Math.min(99, ...torches.filter(t => !t.hidden).map(t => Math.hypot(t.x - s[0], t.y - s[1]))); if (d > bd) { bd = d; best = s; } }
    if (best && bd > 4) { merchants.push({ x: best[0], y: best[1], stock: null, shadow: true }); map[best[1] | 0][best[0] | 0] = 'M'; logEvent('HEMLIG HANDLARE'); }
  }
  if (run.route && run.route[run.depth] === 3) for (const e of ents) if (!e.boss && !e.elite && !e.guardian && lrng.chance(0.08)) { e.hp = e.maxHp = e.maxHp * 1.6; e.veteran = true; } // svår väg: fler härdade fiender
  if (meta('camp') && !boss && !lvl.secret && !props.some(p => p.ch === '¶') && lrng.chance(0.35)) { const sr = lvl.rooms && lvl.rooms.find(r => r.type === 'start'); if (sr) for (let k = 0; k < 30; k++) { const x = sr.x + 1 + ((lrng.next() * (sr.w - 2)) | 0), y = sr.y + 1 + ((lrng.next() * (sr.h - 2)) | 0); if (map[y][x] === '.' && Math.hypot(x + 0.5 - P.x, y + 0.5 - P.y) > 1.5) { addPropAt('¶', x, y); break; } } } // vandrarens eld
  if (run.nextMap) { run.nextMap = false; seen.fill(1); say('KARTOGRAFENS KARTA VISAR VÅNINGEN', 3); }
  allies = allies.filter(a => a.life > 0 && a.keep); for (const a of allies) { a.x = P.x - Math.cos(P.a); a.y = P.y - Math.sin(P.a); }
  if (run.pet) spawnPet(); else pet = null;
}
const shadowVisible = m => !m.shadow || lightAt(m.x, m.y) < 0.42;
// ---------- Version 5: kortstatistik, fusion, utmaningslägen, rekord och tillgänglighet ----------
function noteCardPick(card) { // statistik per kort: valt antal gånger (profilen), skada och dödade sedan kortet togs (rundan)
  if (!card || !run) return;
  run.cardAt = run.cardAt || {}; if (!run.cardAt[card.id]) run.cardAt[card.id] = { dmg: run.dmgDealt || 0, kills: run.kills };
  profile.cardPicks = profile.cardPicks || {}; profile.cardPicks[card.id] = (profile.cardPicks[card.id] || 0) + 1;
}
function cardStats() {
  const out = {}; if (!run) return out;
  for (const id of new Set(run.owned)) { const at = (run.cardAt || {})[id] || { dmg: 0, kills: 0 }; out[id] = { dmg: Math.round(((run.dmgDealt || 0) - at.dmg) * 10), kills: run.kills - at.kills, picks: (profile.cardPicks || {})[id] || 0 }; }
  return out;
}
function fuseCard(id) { // två likadana kort blir ett starkare
  const f = Cards.fuse && Cards.fuse(id);
  if (!f || run.owned.filter(x => x === id).length < 2) return false;
  for (let k = 0; k < 2; k++) run.owned.splice(run.owned.indexOf(id), 1);
  run.owned.push(f); run.cardAt = run.cardAt || {}; run.cardAt[f] = run.cardAt[id] || { dmg: run.dmgDealt || 0, kills: run.kills };
  recomputeMods(); play('fuse_cards', 0.8); stat('fusions'); vib('fuse'); logEvent('SMÄLTE: ' + (Cards.byId(f) || {}).name); checkAch();
  return run.owned.slice();
}
const ownedCount = () => { const o = {}; if (run) for (const id of run.owned) o[id] = (o[id] || 0) + 1; return o; };
// utmaningslägen: ett slag, bara pistol, inga kort
const CMODES = { '': { name: 'INGEN UTMANING', text: 'VANLIG RUNDA' }, onehit: { name: 'ETT SLAG', text: '1 HP – EN TRÄFF OCH DU ÄR DÖD. +50 % SJÄLAR' },
  pistol: { name: 'BARA PISTOL', text: 'ANDRA VAPEN BLIR AMMO OCH GULD. +30 % SJÄLAR' }, nocards: { name: 'INGA KORT', text: 'KORTVAL BLIR GULD. +40 % SJÄLAR' } };
const cmode = id => !!(run && run.cmode === id);
// vibrationsmönster
const VIB = { pickup: [12], kill: [18, 30, 18], boss: [90, 40, 140], potion: [25, 25, 25], level: [40, 60, 40], fuse: [30, 20, 60], headshot: [10, 15, 30], hurt: null };
function vib(k) { if (settings.vibrate === false || !navigator.vibrate || !VIB[k] || !isTouch()) return; try { navigator.vibrate(VIB[k]); } catch (e) { /* ingen vibration */ } }
// dödsrapporten: vem skadade dig mest
function noteDamage(d, fx0, fy0, kind) {
  if (!run || !(d > 0)) return;
  let who = kind === 'trap' ? 'FÄLLOR' : 'MILJÖN';
  if (fx0 !== undefined) { let best = null, bd = 3.5; for (const e of ents) { const dd = Math.hypot(e.x - fx0, e.y - fy0); if (!e.dead && dd < bd) { bd = dd; best = e; } } if (best) who = best.boss ? best.d.name : best.d.name; else if (kind === 'proj') who = 'PROJEKTILER'; }
  run.dmgBy = run.dmgBy || {}; run.dmgBy[who] = (run.dmgBy[who] || 0) + d;
}
// rekord: jämför med profilen när rundan tar slut
function recordCheck(r) {
  const rec = [];
  const best = (k, v, label) => { if (v > (profile[k] || 0)) { if ((profile[k] || 0) > 0) rec.push(label); profile[k] = v; } };
  best('bestRunKills', r.kills, 'FLEST DÖDADE');
  best('bestCombo', r.bestCombo || 0, 'LÄNGSTA KOMBO');
  best('bestFloorKills', r.bestFloorKills || 0, 'FLEST PÅ EN VÅNING');
  if (r.depth > (profile.bestDepth || 0) && profile.bestDepth > 0) rec.push('DJUPASTE VÅNINGEN');
  if (score > (profile.bestScore || 0) && profile.bestScore > 0) rec.push('HÖGSTA POÄNG');
  profile.totalDmg = Math.round((profile.totalDmg || 0) + (r.dmgDealt || 0) * 10);
  r.records = rec; if (rec.length) setTimeout(() => play('daily_reward', 0.6, 1.2), 600);
}
// dagens belöning: första rundan varje dag ger extra själar
const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
function dailyReward() {
  if (!run || run.practice || profile.lastDay === today()) return;
  profile.lastDay = today(); profile.days = [...new Set([...(profile.days || []), today()])].slice(-60); profile.souls += 15; saveProfile();
  setTimeout(() => { say('DAGENS BELÖNING: +15 SJÄLAR', 3); play('daily_reward', 0.8); }, 1800);
}
function dailyInfo() { // dagens frö och tid kvar
  const n = new Date(), m = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1), left = Math.max(0, m - n), h = Math.floor(left / 36e5), mi = Math.floor(left / 6e4) % 60;
  return `DAGENS FRÖ ${seedText(dailySeed())} · NYTT OM ${h} H ${mi} MIN`;
}
// vapenfärger (låses upp med prestationer)
const SKINS = { '': { name: 'STANDARD' }, gold: { name: 'GULD', ach: 'win', col: 'rgba(255,200,60,0.35)' }, frost: { name: 'FROST', ach: 'frostboss', col: 'rgba(120,200,255,0.35)' },
  blood: { name: 'BLOD', ach: 'k1000', col: 'rgba(200,20,30,0.35)' }, void: { name: 'TOMRUM', ach: 'nightmare', col: 'rgba(140,60,220,0.38)' } };
const skinOpen = id => !id || (profile.ach || []).includes(SKINS[id].ach);
// HUD-teman: färgläggning av listen
const HUD_THEMES = { '': null, blue: 'rgba(60,110,200,0.55)', green: 'rgba(60,160,80,0.5)', gold: 'rgba(210,160,40,0.5)' };
// träffkänsla: blodspår, glödande ögon och facklornas rök
function enemyFeel(e, dt) {
  if (e.hp < e.maxHp * 0.5 && !e.d.stone && e.d.ai !== 'wisp' && (e.mvx || e.mvy) && fx.parts.blood_trail && !settings.lowfx) {
    e.trailT = (e.trailT || 0) - dt;
    if (e.trailT <= 0) { e.trailT = rnd(0.35, 0.7); if (!solid(e.x, e.y)) { decals.push({ x: e.x + rnd(-0.1, 0.1), y: e.y + rnd(-0.1, 0.1), img: fx.parts.blood_trail[(Math.random() * 2) | 0], size: 0.03, life: 12 }); if (decals.length > 90) decals.shift(); } }
  }
}
let smokeAcc = 0;
function updateTorchFx(dt) { // facklor ryker och gnistrar
  if (settings.lowfx) return;
  smokeAcc += dt; if (smokeAcc < 0.08) return; smokeAcc = 0;
  for (const t of torches) {
    if (t.hidden || Math.abs(t.x - P.x) > 10 || Math.abs(t.y - P.y) > 10) continue;
    if (lvl.biome === 'frost' && Math.random() < 0.5) { const a = rnd(0, TAU); particles.push({ x: t.x + Math.cos(a) * 3, y: t.y + Math.sin(a) * 3, z: 0.02, vx: 0, vy: 0, vz: 0.25, life: 0.9, maxLife: 0.9, img: fx.hit[1], size: 0.03, add: true, tint: [255, 140, 50], fade: true }); } // värmeauran: inom ringen fryser du inte
    if (Math.random() < 0.25 && fx.parts.smoke) particles.push({ x: t.x + rnd(-0.05, 0.05), y: t.y + rnd(-0.05, 0.05), z: 0.9, vx: rnd(-0.1, 0.1), vy: rnd(-0.1, 0.1), vz: 0.35, life: 1.6, maxLife: 1.6, frames: fx.parts.smoke, img: fx.parts.smoke[0], size: 0.18, drift: true, fade: true });
    if (Math.random() < 0.18) particles.push({ x: t.x, y: t.y, z: 0.75, vx: rnd(-0.5, 0.5), vy: rnd(-0.5, 0.5), vz: rnd(0.6, 1.4), life: 0.7, maxLife: 0.7, img: fx.parts.ember ? fx.parts.ember[0] : fx.hit[1], size: 0.03, add: true, tint: [255, 170, 60], grav: true, fade: true });
  }
}
function dissolve(e) { // spöken och irrbloss löses upp
  e.gibbed = true;
  for (let i = 0; i < 12; i++) particles.push({ x: e.x + rnd(-0.25, 0.25), y: e.y + rnd(-0.25, 0.25), z: rnd(0.1, 0.9), vx: rnd(-0.3, 0.3), vy: rnd(-0.3, 0.3), vz: rnd(0.3, 0.9), life: rnd(0.8, 1.4), maxLife: 1.4, img: fx.hit[1], size: rnd(0.04, 0.08), add: true, tint: e.type === 'Ü' ? [150, 220, 255] : [200, 255, 220], fade: true, drift: true });
}
function headshotCheck(e, perp, wp) { // träff mitt i fienden (huvudet) med ett enkelskottsvapen
  if (wp.pellets > 1 || wp.proj || e.d.stone || perp > 0.075 * e.d.size * (e.boss ? 1.8 : 1)) return 1;
  stat('headshots'); run.headshots = (run.headshots || 0) + 1;
  if ((P.hsT || 0) < tmr) { P.hsT = tmr + 0.4; spawnText(e.x, e.y, '★ HUVUDTRÄFF', '#ffe070'); play('headshot', 0.55, rnd(0.95, 1.1)); vib('headshot'); }
  return 1.5 + mod('headshot');
}
function wrapText(t, max) { const out = []; let line = ''; for (const w of t.split(' ')) { if ((line + ' ' + w).trim().length > max) { if (line) out.push(line); line = w; } else line = (line + ' ' + w).trim(); } if (line) out.push(line); return out; }
// ett mönster på enhanden: gå framåt automatiskt
let autoWalk = false;
// ---------- Version 6: spikgeväret, blixtstaven och långbågen ----------
const MANA_COST = { zap: 9, orb: 35 };
function nailShot(wp, base, spread) { // spikgeväret: snabba spikar som projektiler, värms upp under eldgivning
  WS.heatNg = Math.min(2.5, (WS.heatNg || 0) + 0.12);
  const n = spread ? 5 : 1;
  for (let i = 0; i < n; i++) {
    const a = P.a + (spread ? (i - 2) * 0.07 : rnd(-1, 1) * (wp.spread + WS.spread * 0.4) * (1 - WS.aim * 0.6));
    projectiles.push({ x: P.x + Math.cos(a) * 0.35, y: P.y + Math.sin(a) * 0.35, z: 0.47, vx: Math.cos(a) * 26, vy: Math.sin(a) * 26, dmg: base, src: P, friendly: true, kind: 'nail', life: 1.2, hot: up('ng_heat') && WS.heatNg > 1.5, bounces: up('ng_ricochet') ? 1 : 0 });
  }
  P.mags[P.weapon] -= n; lvlStat.shots += n; run.shots = (run.shots || 0) + n;
  WS.shot = 0; WS.cd = effDelay(wp) / (1 + Math.min(1, WS.heatNg / 2.5) * 0.6) * (spread ? 4 : 1); WS.spread = Math.min(0.06, WS.spread + 0.004);
  play(wp.sound[0], 0.45, rnd(0.95, 1.08) * (1 + WS.heatNg * 0.04)); P.flash = Math.max(P.flash, 0.03); P.pitch += 0.4; P.shake = Math.max(P.shake, 0.15);
  noise(9);
}
function updateNail(p, dt) { // spikens flykt: fastnålning mot vägg, studs och värme
  const hit = ents.find(e => !e.dead && !e.dying && !e.hidden && Math.hypot(e.x - p.x, e.y - p.y) < 0.32 * e.d.size * (e.boss ? 1.8 : 1));
  if (hit) {
    p.dead = true; const k = hurtEnemy(hit, p.dmg * (hit.shredT > tmr ? 1.25 : 1), p.x, p.y, { crit: Math.random() < mod('critChance') }); hitMark = 0.1; hitKill = k; lvlStat.hits++; run.hits = (run.hits || 0) + 1;
    play('nail_flesh', 0.35, rnd(0.9, 1.15), { x: p.x, y: p.y });
    if (p.hot) { hit.burn = Math.max(hit.burn || 0, 2); hit.burnAcc = hit.burnAcc || 0; }
    runeProc(hit, p.dmg);
    if (up('ng_shred')) hit.shredT = tmr + 3;
    const sp = Math.hypot(p.vx, p.vy), bx = hit.x + p.vx / sp * 0.6, by = hit.y + p.vy / sp * 0.6;
    if (!k && !hit.boss && solid(bx, by)) { hit.stun = Math.max(hit.stun || 0, up('ng_pin') ? 1.8 : 0.7); spawnText(hit.x, hit.y, 'FASTNÅLAD', '#c0c0d0'); }
    else if (!k && !hit.boss) tryMove(hit, p.vx / sp * 0.05, p.vy / sp * 0.05, 0.28);
    return;
  }
  if (solid(p.x, p.y) || p.life <= 0) {
    const ox = p.x - p.vx * dt, oy = p.y - p.vy * dt;
    if (p.life > 0 && (p.bounces > 0 || Math.random() < 0.18)) { // studsar mot sten
      if (solid(p.x, oy)) p.vx = -p.vx; if (solid(ox, p.y)) p.vy = -p.vy; p.x = ox; p.y = oy; p.bounces = Math.max(0, (p.bounces || 0) - 1); p.dmg *= 0.7;
      play('nail_hit', 0.3, rnd(1.1, 1.4), { x: p.x, y: p.y }); sparks(p.x, p.y, 0.47, 2); return;
    }
    p.dead = true; if (p.life > 0) { spawnImpact(ox, oy, 0.47); if (Math.random() < 0.4) play('nail_hit', 0.25, rnd(0.9, 1.3), { x: p.x, y: p.y }); }
  }
}
function staffZap(wp, base) { // blixtstaven: kedjeblixt till närmaste fiende i siktet
  if (P.mags[P.weapon] < MANA_COST.zap) { if (!fireHeld) { say('FÖR LITE MANA', 0.8); play('click', 0.5, 0.7); } WS.cd = 0.25; return; }
  let best = null, bd = 13;
  for (const e of ents) { if (e.dead || e.dormant || e.hidden) continue; const d = Math.hypot(e.x - P.x, e.y - P.y); if (d > bd) continue;
    let da = Math.atan2(e.y - P.y, e.x - P.x) - P.a; da = Math.abs(Math.atan2(Math.sin(da), Math.cos(da))); if (da > Math.max(0.18, 0.5 / d)) continue;
    if (hasLOS(P.x, P.y, e.x, e.y)) { bd = d; best = e; } }
  P.mags[P.weapon] -= MANA_COST.zap; WS.shot = 0; WS.cd = effDelay(wp); lvlStat.shots++; run.shots = (run.shots || 0) + 1;
  play(wp.sound[0], 0.6, rnd(0.9, 1.1)); P.flash = Math.max(P.flash, 0.06); noise(10);
  const tx = best ? best.x : P.x + Math.cos(P.a) * Math.min(10, cast(P.x, P.y, Math.cos(P.a), Math.sin(P.a)).dist - 0.1), ty = best ? best.y : P.y + Math.sin(P.a) * Math.min(10, cast(P.x, P.y, Math.cos(P.a), Math.sin(P.a)).dist - 0.1);
  zap(P.x + Math.cos(P.a) * 0.4, P.y + Math.sin(P.a) * 0.4, tx, ty, [150, 200, 255]);
  flashes.push({ x: tx, y: ty, t: 0.12, r: 4, col: [130, 170, 255] }); // blixten lyser upp rummet
  if (!best) { if (cellAt(tx, ty) === '-') electrify(tx, ty, base); return; }
  lvlStat.hits++; run.hits = (run.hits || 0) + 1; hitMark = 0.12;
  const hitSet = new Set([best]); let cur = best, dmg = base;
  for (let j = 0; j < 3 + (up('st_chain') ? 2 : 0); j++) {
    if (j > 0) { const nx = ents.filter(o => !o.dead && !o.dormant && !o.hidden && !hitSet.has(o) && Math.hypot(o.x - cur.x, o.y - cur.y) < 4.5 && hasLOS(cur.x, cur.y, o.x, o.y)).sort((a, b) => Math.hypot(a.x - cur.x, a.y - cur.y) - Math.hypot(b.x - cur.x, b.y - cur.y))[0];
      if (!nx) break; zap(cur.x, cur.y, nx.x, nx.y, [150, 200, 255]); hitSet.add(nx); cur = nx; dmg *= 0.75; }
    const k = hurtEnemy(cur, dmg, cur.x, cur.y, { crit: Math.random() < mod('critChance') }); hitKill = hitKill || k;
    if (up('st_stun') && !cur.boss) cur.stun = Math.max(cur.stun || 0, 0.8);
    if (j === 0) runeProc(cur, dmg);
    if (!k && cellAt(cur.x, cur.y) === '-') electrify(cur.x, cur.y, dmg * 0.6);
    if (fx.parts.lightning && !settings.lowfx) particles.push({ x: cur.x, y: cur.y, z: 0.5, vx: 0, vy: 0, vz: 0, life: 0.25, maxLife: 0.25, frames: fx.parts.lightning, img: fx.parts.lightning[0], size: 0.3, add: true });
  }
  play('shock', 0.4, rnd(1, 1.2), { x: best.x, y: best.y });
}
function electrify(x, y, dmg) { // blixt i vatten: alla i samma vatten i närheten får en stöt
  for (const e of ents) if (!e.dead && !e.dormant && cellAt(e.x, e.y) === '-' && Math.hypot(e.x - x, e.y - y) < 4.5) { zap(x, y, e.x, e.y, [120, 190, 255]); hurtEnemy(e, dmg, e.x, e.y, { noProc: true }); if (!e.boss) e.stun = Math.max(e.stun || 0, 0.6); }
  if (cellAt(P.x, P.y) === '-' && Math.hypot(P.x - x, P.y - y) < 3) { hurtPlayer(4, x, y, 'proj'); say('VATTNET LEDER STRÖM!', 1.2); }
}
function staffOrb(wp, base, k) { // laddat blixtklot
  if (P.mags[P.weapon] < MANA_COST.orb) { say('FÖR LITE MANA FÖR KLOTET', 1); play('click', 0.5, 0.7); return; }
  P.mags[P.weapon] -= MANA_COST.orb; WS.shot = 0; WS.cd = 0.6;
  const a = P.a, big = up('st_orb');
  projectiles.push({ x: P.x + Math.cos(a) * 0.5, y: P.y + Math.sin(a) * 0.5, z: 0.5, vx: Math.cos(a) * 7, vy: Math.sin(a) * 7, dmg: base * (2 + k * 2), src: P, friendly: true, kind: 'sorb', life: 3, bounces: big ? 3 : 0, big, zapT: 0 });
  play('staff_orb', 0.7); P.flash = Math.max(P.flash, 0.1);
}
function updateSorb(p, dt) { // klotet zappar fiender i närheten medan det flyger
  p.zapT -= dt;
  if (p.zapT <= 0) { p.zapT = 0.25; for (const e of ents) if (!e.dead && !e.dormant && !e.hidden && Math.hypot(e.x - p.x, e.y - p.y) < (p.big ? 3.2 : 2.4) && hasLOS(p.x, p.y, e.x, e.y)) { zap(p.x, p.y, e.x, e.y, [150, 200, 255]); hurtEnemy(e, p.dmg * 0.18, e.x, e.y, { noProc: true }); } }
  const hit = ents.find(e => !e.dead && !e.dying && !e.hidden && Math.hypot(e.x - p.x, e.y - p.y) < 0.55);
  if (solid(p.x, p.y) && !hit && p.bounces > 0) { const ox = p.x - p.vx * dt, oy = p.y - p.vy * dt; if (solid(p.x, oy)) p.vx = -p.vx; if (solid(ox, p.y)) p.vy = -p.vy; p.x = ox; p.y = oy; p.bounces--; play('staff_zap', 0.4, 0.7, { x: p.x, y: p.y }); return; }
  if (hit || solid(p.x, p.y) || p.life <= 0) {
    p.dead = true; const x = p.x - p.vx * 0.03, y = p.y - p.vy * 0.03;
    for (const e of ents) if (!e.dead && Math.hypot(e.x - x, e.y - y) < 2.4) { hurtEnemy(e, p.dmg * (e === hit ? 1 : 0.6), e.x, e.y, {}); if (!e.boss) e.stun = Math.max(e.stun || 0, 0.8); zap(x, y, e.x, e.y, [170, 210, 255]); }
    flashes.push({ x, y, t: 0.3, r: 5, col: [130, 170, 255] }); play('staff_orb', 0.8, 0.8, { x, y }); P.shake = Math.max(P.shake, 0.8);
    if (cellAt(x, y) === '-') electrify(x, y, p.dmg * 0.5);
  }
}
function bowRelease(wp, base) { // långbågen: skadan växer med hur hårt den är spänd
  const k = clamp(WS.draw || 0, 0.15, 1), full = k >= 1; WS.draw = 0; WS.drawSnd = false;
  if (P.mags[P.weapon] <= 0) { if (P.ammo.arrows > 0) startReload(); else { say('INGA PILAR', 1); play('click', 0.5, 0.8); } return; }
  P.mags[P.weapon]--; lvlStat.shots++; run.shots = (run.shots || 0) + 1;
  const n = up('bw_triple') ? 3 : 1;
  for (let i = 0; i < n; i++) {
    const a = P.a + (n > 1 ? (i - 1) * 0.08 : 0) + rnd(-1, 1) * wp.spread * (1 - k);
    projectiles.push({ x: P.x + Math.cos(a) * 0.35, y: P.y + Math.sin(a) * 0.35, z: 0.5, vx: Math.cos(a) * (14 + k * 14), vy: Math.sin(a) * (14 + k * 14), dmg: base * (0.35 + 0.65 * k) * (full ? 2 : 1), src: P, friendly: true, kind: 'parrow', life: 2, pierce: full || up('bw_pierce') ? 9 : 0, hitSet: new Set(), full });
  }
  WS.shot = 0; WS.cd = effDelay(wp); play(wp.sound[0], 0.7, 0.9 + k * 0.2); noise(3);
  if (P.ammo.arrows > 0 && P.mags[P.weapon] <= 0) setTimeout(() => { if (WEAPONS[P.weapon].bow && WS.state === 'idle') startReload(); }, 250); // nästa pil läggs på
}
function updateArrow(p, dt) {
  for (const e of ents) {
    if (e.dead || e.dying || e.hidden || p.hitSet.has(e) || Math.hypot(e.x - p.x, e.y - p.y) > 0.3 * e.d.size * (e.boss ? 1.8 : 1)) continue;
    p.hitSet.add(e); const k = hurtEnemy(e, p.dmg, p.x, p.y, { crit: p.full || Math.random() < mod('critChance') }); hitMark = 0.14; hitKill = hitKill || k; lvlStat.hits++; run.hits = (run.hits || 0) + 1;
    play('arrow_hit', 0.5, rnd(0.9, 1.1), { x: p.x, y: p.y }); runeProc(e, p.dmg);
    if (up('bw_explosive')) explode(p.x, p.y, p.dmg * 0.5, 1.4);
    if (up('bw_retrieve') || Math.random() < mod('arrowRetrieve')) P.ammo.arrows = Math.min(AMMO.arrows.max, P.ammo.arrows + 1);
    if (p.pierce-- <= 0) { p.dead = true; return; }
  }
  if (solid(p.x, p.y) || p.life <= 0) { // pilen fastnar och kan plockas upp
    p.dead = true; const x = p.x - p.vx * dt * 1.2, y = p.y - p.vy * dt * 1.2;
    if (p.life > 0) { play('arrow_hit', 0.3, 1.3, { x, y }); if (!solid(x, y) && !up('bw_explosive')) items.push({ type: 'arrowpick', x, y, taken: false, drop: true, a: Math.atan2(p.vy, p.vx) }); }
    if (up('bw_explosive')) explode(x, y, p.dmg * 0.5, 1.4);
  }
}
function weaponV6Tick(wp, dt, trig) { // laddning och mana för de nya vapnen; true = hanterat
  const si = weaponIndex('staff');
  if (si >= 0 && P.has[si]) P.mags[si] = Math.min(effMag(si), P.mags[si] + dt * 7 * (1 + mod('manaRegen')) * (up('st_mana') ? 2 : 1)); // manan laddas alltid, även i fickan
  if (wp.nail) { if (!trig) WS.heatNg = Math.max(0, (WS.heatNg || 0) - dt * 1.5); if (aimDown && !WS.aimHeld && P.mags[P.weapon] >= 5 && canFire()) nailShot(wp, wp.dmg * (1 + mod('dmg')), true); WS.aimHeld = aimDown; return false; }
  if (wp.staff) {
    if (aimDown && WS.state === 'idle') { WS.orbCharge = Math.min(1, (WS.orbCharge || 0) + dt / 1.1); if (!WS.orbSnd) { WS.orbSnd = true; play('staff_charge', 0.5); } }
    else if (!aimDown && WS.orbCharge > 0) { const k = WS.orbCharge; WS.orbCharge = 0; WS.orbSnd = false; if (k > 0.3 && canFire()) staffOrb(wp, wp.dmg * (1 + mod('dmg')) * (1 + 0.12 * wlvl(wp.id)), k); }
    return false;
  }
  if (wp.bow) { // håll för att spänna, släpp för att skjuta
    if (trig && WS.state === 'idle' && WS.cd <= 0 && P.mags[P.weapon] > 0) { WS.draw = Math.min(1, (WS.draw || 0) + dt / 0.9 * (1 + mod('fireRate'))); if (!WS.drawSnd) { WS.drawSnd = true; play('bow_draw', 0.5); } }
    else if (!trig && WS.draw > 0) { if (WS.state === 'idle') bowRelease(wp, wp.dmg * (1 + mod('dmg')) * (1 + 0.12 * wlvl(wp.id)) * (P.rageT > 0 ? 1.5 : 1)); else WS.draw = 0; }
    else if (trig && !fireHeld && P.mags[P.weapon] <= 0 && WS.state === 'idle') { if (P.ammo.arrows > 0) startReload(); else { say('INGA PILAR', 1); play('click', 0.5, 0.8); } }
    fireHeld = trig; return true;
  }
  return false;
}
function drawBowAim(g) { // siktet drar ihop sig när bågen spänns
  if (!WEAPONS[P.weapon].bow || !(WS.draw > 0)) return;
  const r = Math.round(14 - WS.draw * 10), cx = W / 2, cy = HORIZON;
  g.strokeStyle = WS.draw >= 1 ? 'rgba(255,220,90,0.95)' : 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(cx + 0.5, cy + 0.5, r, 0, TAU); g.stroke();
  if (WS.draw >= 1 && tmr % 0.4 < 0.2) txt('FULLT SPÄND', cx - textW('FULLT SPÄND') / 2, cy + 18, '#ffd24a', 1, true, 0.9);
}
function drawStaffCharge(g) {
  if (!WEAPONS[P.weapon].staff) return;
  const m = P.mags[P.weapon] / effMag(P.weapon); g.fillStyle = '#0a1430'; g.fillRect(W / 2 - 20, HORIZON + 22, 40, 2); g.fillStyle = '#70a8ff'; g.fillRect(W / 2 - 20, HORIZON + 22, 40 * m, 2);
  if (WS.orbCharge > 0) { g.strokeStyle = `rgba(150,200,255,${0.4 + WS.orbCharge * 0.5})`; g.beginPath(); g.arc(W / 2 + 0.5, HORIZON + 0.5, 4 + WS.orbCharge * 8, 0, TAU); g.stroke(); }
}

// ---------- Version 6: nekromant, eldelemental, lavamask, dödsriddare och banshee ----------
const AI_V6 = {
  necro(e, dt, dist, los) { // väcker döda fiender i närheten och håller avstånd
    e.raiseT = (e.raiseT ?? rnd(2, 4)) - dt;
    if (e.raiseT <= 0) {
      const corpses = ents.filter(o => o.dead && !o.gibbed && !o.boss && !o.raised && o.type !== 'Ñ' && enemyFrames[o.type] && Math.hypot(o.x - e.x, o.y - e.y) < 7).slice(0, 2);
      if (corpses.length) { e.raiseT = rnd(6, 8); e.state = 'attack'; e.t = 0; e.didHit = true; play('necro_raise', 0.8, 1, { x: e.x, y: e.y }); say('NEKROMANTEN VÄCKER DE DÖDA!', 1.5);
        for (const c of corpses) { const o = makeEnemy(c.type, c.x, c.y); o.hp = o.maxHp = o.maxHp * 0.5; o.alert = true; o.minion = true; o.raised = true; o.d = { ...o.d, score: 0 }; c.gibbed = true; ents.push(o); totalEnemies++; zap(e.x, e.y, c.x, c.y, [120, 255, 140]); spawnPuff(c.x, c.y, 6); }
        return true; }
      e.raiseT = 1.5;
    }
    return false;
  },
  elemental(e, dt) { // tänder marken där den går
    e.fireT = (e.fireT ?? 1) - dt;
    if (e.fireT <= 0 && (e.mvx || e.mvy) && !e.small) { e.fireT = rnd(1.2, 2); if (!solid(e.x, e.y)) groundFires.push({ x: e.x, y: e.y, t: 3, acc: 0 }); burnWebs(e.x, e.y, 1); }
    return false;
  },
  worm(e, dt, dist) { // gräver sig fram under jorden och dyker upp under dig
    e.wst = e.wst || 'under'; e.wt = (e.wt || 0) + dt;
    if (e.wst === 'under') {
      e.hidden = true; e.state = 'idle';
      const a = Math.atan2(P.y - e.y, P.x - e.x), sp = e.d.speed * dt * 1.1; const ox = e.x, oy = e.y; tryMove(e, Math.cos(a) * sp, Math.sin(a) * sp, 0.25); e.mvx = e.x - ox; e.mvy = e.y - oy;
      if (!settings.lowfx && Math.random() < dt * 8) particles.push({ x: e.x + rnd(-0.2, 0.2), y: e.y + rnd(-0.2, 0.2), z: 0.02, vx: rnd(-0.5, 0.5), vy: rnd(-0.5, 0.5), vz: 0.8, life: 0.5, maxLife: 0.5, img: fx.parts.rock ? fx.parts.rock[0] : fx.hit[1], size: 0.05, grav: true, tint: [120, 90, 70] }); // jorden rör sig
      if ((dist < 1.2 && e.wt > 1.5) || e.wt > 7) { e.wst = 'warn'; e.wt = 0; e.tx = P.x; e.ty = P.y; play('lavaworm', 0.7, 1, { x: e.x, y: e.y }); }
      return true;
    }
    if (e.wst === 'warn') { // sprickor och glöd: flytta dig!
      e.hidden = true; if (Math.random() < dt * 25) particles.push({ x: e.tx + rnd(-0.5, 0.5), y: e.ty + rnd(-0.5, 0.5), z: 0.02, vx: 0, vy: 0, vz: 1.2, life: 0.4, maxLife: 0.4, img: fx.parts.ember ? fx.parts.ember[0] : fx.hit[1], size: 0.06, add: true, tint: [255, 120, 40] });
      if (e.wt > 0.9) { e.wst = 'up'; e.wt = 0; e.x = e.tx; e.y = e.ty; e.hidden = false; e.state = 'attack'; e.t = 0; e.didHit = true; play('worm_emerge', 0.9, 1, { x: e.x, y: e.y }); P.shake = Math.max(P.shake, 0.8);
        if (Math.hypot(P.x - e.x, P.y - e.y) < 1.1) hurtPlayer(e.d.dmg * 1.4, e.x, e.y, 'melee');
        for (let i = 0; i < 8; i++) { const a = rnd(0, TAU); particles.push({ x: e.x, y: e.y, z: 0.1, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2, vz: rnd(1, 3), life: 0.8, img: fx.parts.lavadrop ? fx.parts.lavadrop[0] : fx.fireball[0], size: 0.08, add: true, grav: true }); } }
      return true;
    }
    if (e.wst === 'up') { // ovanför marken: sårbar, spottar lava
      if (e.wt > 0.8 && !e.spat && dist < 8) { e.spat = true; const a = Math.atan2(P.y - e.y, P.x - e.x); shootFireball(e, a, 6, 7, false); }
      if (e.wt > 2.6) { e.wst = 'under'; e.wt = 0; e.spat = false; spawnPuff(e.x, e.y, 5); play('lavaworm', 0.5, 0.8, { x: e.x, y: e.y }); }
      return false;
    }
    return false;
  },
  knight(e, dt, dist, los) { // dödsriddaren: svärdsvåg på håll och sköldstöt
    e.waveT = (e.waveT ?? rnd(3, 5)) - dt;
    if (e.waveT <= 0 && los && dist > 2.5 && dist < 10) { e.waveT = rnd(4.5, 6); e.state = 'attack'; e.t = 0; e.didHit = true; const a = Math.atan2(P.y - e.y, P.x - e.x);
      projectiles.push({ x: e.x + Math.cos(a) * 0.5, y: e.y + Math.sin(a) * 0.5, z: 0.4, vx: Math.cos(a) * 7, vy: Math.sin(a) * 7, dmg: e.d.dmg * 0.8, src: e, kind: 'wave', big: true, life: 2.5 }); play('knight_wave', 0.7, 1, { x: e.x, y: e.y }); return true; }
    if (los && dist > 2.6 && dist < 6 && (e.bashT || 0) < tmr) { e.bashT = tmr + rnd(5, 7); e.charge = 0.45; e.chargeA = Math.atan2(P.y - e.y, P.x - e.x); play('deathknight', 0.6, 1, { x: e.x, y: e.y }); }
    if (e.charge > 0) { e.charge -= dt; tryMove(e, Math.cos(e.chargeA) * dt * 8, Math.sin(e.chargeA) * dt * 8, 0.3); if (dist < 1) { e.charge = 0; hurtPlayer(e.d.dmg * 0.7, e.x, e.y, 'melee'); for (let i = 0; i < 4; i++) tryMove(P, Math.cos(e.chargeA) * 0.15, Math.sin(e.chargeA) * 0.15, 0.24); P.shake = Math.max(P.shake, 1.2); } return true; }
    e.face = Math.atan2(P.y - e.y, P.x - e.x);
    return false;
  },
  banshee(e, dt, dist, los) { // syns bara som en skugga på håll; skriket saktar ned och förvirrar
    e.ghost = dist > 6 ? 0.7 : dist > 3.5 ? 0.35 : 0;
    e.screamT = (e.screamT ?? rnd(3, 5)) - dt;
    if (e.screamT <= 0 && los && dist < 7) { e.screamT = rnd(6, 8); e.state = 'attack'; e.t = 0; e.didHit = true; play('banshee_scream', 0.9, 1, { x: e.x, y: e.y });
      P.slowT = Math.max(P.slowT, 2); P.confT = 1.6; P.shake = Math.max(P.shake, 0.9); say('BANSHEEN SKRIKER – DU TAPPAR FOTFÄSTET', 1.5); hurtPlayer(3, e.x, e.y, 'proj'); return true; }
    if (e.state === 'move') { const a = Math.atan2(P.y - e.y, P.x - e.x) + Math.PI / 2, w = Math.sin(e.t * 2 + e.x) * dt * 1.2; tryMove(e, Math.cos(a) * w, Math.sin(a) * w, 0.2); }
    return false;
  },
};
function elementalSplit(e) { // eldelementalen delar sig i små flammor
  if (e.small) return;
  play('elemental_split', 0.7, 1, { x: e.x, y: e.y });
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU, x = e.x + Math.cos(a) * 0.6, y = e.y + Math.sin(a) * 0.6; if (solid(x, y)) continue;
    const o = makeEnemy('Æ', x, y); o.small = true; o.hp = o.maxHp = 1.5; o.d = { ...o.d, size: o.d.size * 0.5, dmg: o.d.dmg * 0.4, speed: o.d.speed * 1.4, score: 20 }; o.alert = true; o.minion = true; ents.push(o); totalEnemies++; }
}
// ---------- Version 6: vulkanen – hetta, askregn, utbrott ----------
function updateHeat(dt) {
  if (!lvl || lvl.biome !== 'volcano') { P.heat = 0; return; }
  let near = 0; const cx = P.x | 0, cy = P.y | 0;
  for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) if (map[y] && map[y][x] === '_') near++;
  const wet = cellUnder() === '-' || (P.coolT || 0) > 0;
  if (wet) P.heat = Math.max(0, (P.heat || 0) - dt * 4);
  else P.heat = clamp((P.heat || 0) + dt * (near * 0.12 - 0.35) * Math.max(0.1, 1 - mod('heatResist')), 0, 10);
  if (P.coolT > 0) P.coolT -= dt;
  if (P.heat > 6) { P.heatAcc = (P.heatAcc || 0) + dt; if (P.heatAcc > 1.5) { P.heatAcc = 0; if (P.hp > 5) { P.hp -= 2; P.hurt = 0.1; } if ((P.heatMsgT || 0) < tmr) { P.heatMsgT = tmr + 8; say('HETTAN BRÄNNER – SÖK SVALKA I VATTEN', 2.5); } } }
  eruptT -= dt;
  if (eruptT <= 0 && !boss) { eruptT = rnd(14, 24); say('VULKANEN MULLRAR – LAVABOMBER!', 1.8); play('eruption', 0.8); P.shake = Math.max(P.shake, 1.2); for (let i = 0; i < 4; i++) { const a = rnd(0, TAU), r = rnd(1, 5); const x = P.x + Math.cos(a) * r, y = P.y + Math.sin(a) * r; if (!solid(x, y)) fallHazard(x, y, 'meteor', 10, 1.2 + i * 0.3); } }
}
let eruptT = 18;
function drawHeatFx(g) { // värmedis och hetta i bilden
  if (!lvl || lvl.biome !== 'volcano' || settings.lowfx) return;
  if (P.heat > 1) { g.fillStyle = `rgba(255,90,20,${Math.min(0.22, P.heat * 0.025)})`; g.fillRect(0, 0, W, VH); }
  if (P.heat > 0.5 || (tmr * 7 | 0) % 2 === 0) { // värmedisen: förskjut några rader i underkanten av bilden
    const im = g.getImageData(0, HORIZON, W, VH - HORIZON), d = new Uint32Array(im.data.buffer), row = new Uint32Array(W);
    for (let y = 0; y < VH - HORIZON; y += 1) { const s = Math.round(Math.sin(tmr * 6 + y * 0.35) * (0.6 + Math.min(1.4, P.heat * 0.2)) * (y / (VH - HORIZON))); if (!s) continue; row.set(d.subarray(y * W, y * W + W)); for (let x = 0; x < W; x++) d[y * W + x] = row[clamp(x + s, 0, W - 1)]; }
    g.putImageData(im, 0, HORIZON);
  }
}
// ---------- Version 6: fällor – eldjet, pendel, tryckplatta, sköra plattor och nya fat ----------
const V6_TRAPS = new Set(['fire', 'pendulum', 'plate']);
let crumbles = {}; // sköra plattor: index -> { t } (t < 0 = orörd)
function trapV6(pr, dt) {
  const d = pr.def, inCell = (x, y, r = 0.48) => Math.abs(x - pr.x) < r && Math.abs(y - pr.y) < r;
  if (d.trap === 'fire') { // eldjeten sprutar i takt
    const cyc = (tmr + pr.ph * 0.7) % 3.4, was = pr.up; pr.up = cyc > 2.2;
    if (!pr.up && cyc > 1.8 && Math.random() < dt * 10) particles.push({ x: pr.x + rnd(-0.1, 0.1), y: pr.y + rnd(-0.1, 0.1), z: 0.05, vx: 0, vy: 0, vz: 0.6, life: 0.3, maxLife: 0.3, img: fx.parts.ember ? fx.parts.ember[0] : fx.hit[1], size: 0.04, add: true, tint: [255, 140, 50] }); // varning
    if (pr.up) {
      if (!was && Math.hypot(pr.x - P.x, pr.y - P.y) < 9) play('firejet', 0.55, rnd(0.95, 1.05), { x: pr.x, y: pr.y });
      if (!settings.lowfx && Math.random() < dt * 30) particles.push({ x: pr.x + rnd(-0.12, 0.12), y: pr.y + rnd(-0.12, 0.12), z: 0.05, vx: 0, vy: 0, vz: rnd(1.5, 2.6), life: 0.4, maxLife: 0.4, frames: fx.fire, img: fx.fire[0], size: 0.35, add: true });
      flashes.push({ x: pr.x, y: pr.y, t: 0.05, r: 3, col: [255, 120, 40] });
      if (inCell(P.x, P.y) && (pr.hitT || 0) < tmr) { pr.hitT = tmr + 0.6; run.cause = 'ELDJET'; hurtPlayer(9 * trapMul() * Math.max(0.2, 1 - mod('heatResist')), pr.x, pr.y); }
      for (const e of ents) if (!e.dead && !e.boss && !e.d.fireproof && inCell(e.x, e.y)) e.burn = Math.max(e.burn || 0, 2);
      burnWebs(pr.x, pr.y, 0.6);
    }
    return;
  }
  if (d.trap === 'pendulum') { // pendelbladet svänger längs korridoren
    if (pr.axis === undefined) pr.axis = solid(pr.x + 1, pr.y) && solid(pr.x - 1, pr.y) ? 1 : 0; // väggar öst/väst: korridoren går nord–syd
    const s = Math.sin(tmr * 2.2 + pr.ph); pr.off = s * 0.55;
    const bx = pr.x + (pr.axis ? 0 : pr.off), by = pr.y + (pr.axis ? pr.off : 0);
    if (Math.abs(s) < 0.25 && !pr.swT) { pr.swT = 1; if (Math.hypot(pr.x - P.x, pr.y - P.y) < 7) play('pendulum', 0.5, rnd(0.9, 1.1), { x: pr.x, y: pr.y }); } else if (Math.abs(s) > 0.6) pr.swT = 0;
    if (Math.hypot(P.x - bx, P.y - by) < 0.42 && (pr.hitT || 0) < tmr && !(P.crouch > 0.5 && P.slide > 0)) { pr.hitT = tmr + 0.8; run.cause = 'PENDELBLAD'; hurtPlayer(14 * trapMul(), bx, by, 'melee'); spawnBlood(P.x, P.y); }
    for (const e of ents) if (!e.dead && !e.boss && Math.hypot(e.x - bx, e.y - by) < 0.42 && (e.spikeT || 0) < tmr) { e.spikeT = tmr + 0.8; hurtEnemy(e, 10, e.x, e.y, { noProc: true }); }
    return;
  }
  if (d.trap === 'plate') { // tryckplattan öppnar en hemlighet i närheten
    const on = inCell(P.x, P.y, 0.45) && P.jz < 0.1; pr.up = !on && !pr.used;
    if (on && !pr.used) {
      pr.used = true; play('plate_click', 0.8); P.shake = Math.max(P.shake, 0.3);
      let best = null, bd = 14;
      for (const k in doors) { const dd = doors[k]; if (dd.secret && !dd.target) { const dist = Math.hypot(dd.x + 0.5 - pr.x, dd.y + 0.5 - pr.y); if (dist < bd) { bd = dist; best = dd; } } }
      if (best) { best.target = 1; secrets++; score += 250; profile.secrets = (profile.secrets || 0) + 1; play('secret', 0.8); say('TRYCKPLATTAN ÖPPNADE EN HEMLIG DÖRR!', 3); return; }
      for (let y = Math.max(0, pr.cy - 8); y < Math.min(mh, pr.cy + 9); y++) for (let x = Math.max(0, pr.cx - 8); x < Math.min(mw, pr.cx + 9); x++) if (map[y][x] === '{') { blowWall(x, y); return; }
      say('PLATTAN KLICKAR... INGET HÄNDER', 1.5);
    }
  }
}
function updateCrumbles(dt) { // sköra plattor rasar strax efter att någon gått på dem
  const k = (P.y | 0) * mw + (P.x | 0);
  if (crumbles[k] && crumbles[k].t < 0 && P.jz < 0.1) { crumbles[k].t = 0; play('crumble', 0.6, 1.2); }
  if (!crumbles[k] || crumbles[k].t < 0) { P.safeX = P.x; P.safeY = P.y; }
  for (const key in crumbles) {
    const c = crumbles[key]; if (c.t < 0 || c.done) continue;
    c.t += dt; const x = key % mw, y = (key / mw) | 0;
    if (Math.random() < dt * 12) particles.push({ x: x + rnd(0.1, 0.9), y: y + rnd(0.1, 0.9), z: 0.02, vx: 0, vy: 0, vz: 0.4, life: 0.4, maxLife: 0.4, img: fx.parts.dust ? fx.parts.dust[0] : fx.hit[1], size: 0.06, tint: [150, 130, 110] });
    if (c.t > 0.75) {
      c.done = true; map[y][x] = '·'; flowCell = -1; if (animTex.pit !== undefined) cellFloor[+key] = animTex.pit; play('crumble', 0.8, 0.8, { x: x + 0.5, y: y + 0.5 });
      for (let i = 0; i < 6; i++) particles.push({ x: x + 0.5, y: y + 0.5, z: 0.05, vx: rnd(-0.6, 0.6), vy: rnd(-0.6, 0.6), vz: rnd(0.5, 1.5), life: 0.8, img: fx.parts.rock ? fx.parts.rock[0] : fx.shards[7], size: 0.08, grav: true });
      if ((P.x | 0) === x && (P.y | 0) === y) { run.cause = 'RASET'; hurtPlayer(15 * trapMul()); say('GOLVET RASADE!', 1.5); P.x = P.safeX ?? P.x; P.y = P.safeY ?? P.y; if ((P.x | 0) === x && (P.y | 0) === y) { const s = randomFreeCell(RNG(Date.now())); if (s) [P.x, P.y] = s; } }
      for (const e of ents) if (!e.dead && !e.boss && (e.x | 0) === x && (e.y | 0) === y) { hurtEnemy(e, 999, e.x, e.y, { noProc: true }); }
    }
  }
}
function barrelBurst(f) { // gift- och isfat
  if (f.kind === 'poison') { play('barrel_poison', 0.8, 1, { x: f.x, y: f.y }); sporeCloud(f.x, f.y); for (const e of ents) if (!e.dead && Math.hypot(e.x - f.x, e.y - f.y) < 2.6) e.poison = Math.max(e.poison || 0, 6); if (Math.hypot(P.x - f.x, P.y - f.y) < 2.2) P.poisonT = Math.max(P.poisonT || 0, 4); }
  if (f.kind === 'frost') { play('barrel_frost', 0.8, 1, { x: f.x, y: f.y }); frostBurst(f.x, f.y); for (const e of ents) if (!e.dead && Math.hypot(e.x - f.x, e.y - f.y) < 2.6) freeze(e, 3); if (Math.hypot(P.x - f.x, P.y - f.y) < 2) P.slowT = Math.max(P.slowT, 2); }
}
// ---------- Version 6: smartare fiender ----------
function enemyFeelV6(e, dt) {
  if (e.boss || e.dormant) return;
  for (const p of projectiles) if (p.kind === 'pgren' && Math.hypot(p.x - e.x, p.y - e.y) < 2.4 && !e.stun) { const d = Math.hypot(e.x - p.x, e.y - p.y) || 1; tryMove(e, (e.x - p.x) / d * dt * 3, (e.y - p.y) / d * dt * 3, 0.28); if (!e.dodgeMsg) { e.dodgeMsg = 1; spawnText(e.x, e.y, '!', '#ffb040'); } } // undviker granater
  if (e.hp < e.maxHp * 0.4 && e.type !== 'O' && !e.elite) { const sh = ents.find(o => o.type === 'O' && !o.dead && Math.hypot(o.x - e.x, o.y - e.y) < 9); if (sh && Math.hypot(sh.x - e.x, sh.y - e.y) > 1.5) { const d = Math.hypot(sh.x - e.x, sh.y - e.y); tryMove(e, (sh.x - e.x) / d * dt * e.d.speed, (sh.y - e.y) / d * dt * e.d.speed, 0.28); } } // till shamanen för helning
  if (hasMod(e, 'burning') && Math.hypot(P.x - e.x, P.y - e.y) < 1.7 && (e.auraT || 0) < tmr) { e.auraT = tmr + 1; hurtPlayer(3, e.x, e.y, 'proj'); }
  if (hasMod(e, 'burning') && !settings.lowfx && Math.random() < dt * 10) particles.push({ x: e.x + rnd(-0.4, 0.4), y: e.y + rnd(-0.4, 0.4), z: rnd(0, 0.5), vx: 0, vy: 0, vz: 0.8, life: 0.4, maxLife: 0.4, frames: fx.fire, img: fx.fire[0], size: 0.2, add: true });
  if (hasMod(e, 'magnet') && e.alert && Math.hypot(P.x - e.x, P.y - e.y) < 6 && Math.hypot(P.x - e.x, P.y - e.y) > 1.2) { const d = Math.hypot(P.x - e.x, P.y - e.y); tryMove(P, (e.x - P.x) / d * dt * 1.2, (e.y - P.y) / d * dt * 1.2, 0.24); }
}
function leaderDied(e) { // gruppens ledare dör: de andra sprider sig och flyr en stund
  for (const o of ents) if (!o.dead && !o.boss && o !== e && Math.hypot(o.x - e.x, o.y - e.y) < 7) { o.fleeT = 2.2; spawnText(o.x, o.y, '?', '#e8d9b0'); }
  say('LEDAREN FÖLL – DE ANDRA TVEKAR', 1.5);
}
function setupV6Roles(rng) { // ledare och fiender som bär föremål
  if (!lvl.rooms || boss) return;
  const byRoom = {};
  for (const e of ents) { if (e.boss || e.dormant || e.minion || e.elite) continue; const r = roomAt(e.x, e.y); if (!r) continue; (byRoom[lvl.rooms.indexOf(r)] = byRoom[lvl.rooms.indexOf(r)] || []).push(e); }
  for (const k in byRoom) { const g = byRoom[k]; if (g.length >= 3 && rng.next() < 0.5) { const l = g.sort((a, b) => b.maxHp - a.maxHp)[0]; l.leader = true; l.hp = l.maxHp = l.maxHp * 1.5; l.d = { ...l.d, size: l.d.size * 1.1 }; } }
  for (const e of ents) if (!e.boss && !e.dormant && rng.next() < 0.08) e.carry = rng.pick(['key', 'potion', 'goldpile', 'grenade']);
}
// ---------- Version 6: runor som fästs i vapnen ----------
const RUNES = {
  fire: { name: 'ELDRUNAN', text: 'SKOTTEN TÄNDER ELD', col: '#ff8030', tint: [255, 128, 48] },
  ice: { name: 'ISRUNAN', text: 'SKOTTEN SAKTAR NED OCH FRYSER IBLAND', col: '#80d0ff', tint: [128, 208, 255] },
  poison: { name: 'GIFTRUNAN', text: 'SKOTTEN FÖRGIFTAR', col: '#70e050', tint: [112, 224, 80] },
  storm: { name: 'STORMRUNAN', text: 'SKOTTEN SLÅR IBLAND NED BLIXT I EN ANNAN FIENDE', col: '#a0b8ff', tint: [160, 184, 255] },
  blood: { name: 'BLODRUNAN', text: 'SKOTTEN GER DIG LIV TILLBAKA', col: '#e03040', tint: [224, 48, 64] },
  echo: { name: 'EKORUNAN', text: 'VAR FEMTE TRÄFF UPPREPAS', col: '#e8d9b0', tint: [232, 217, 176] },
};
const RUNE_IDS = Object.keys(RUNES);
const runeSlots = () => 1 + meta('runeslot') + Math.round(mod('runeSlots'));
const runesOf = id => (run && run.wrunes && run.wrunes[id]) || [];
const curRunes = () => run ? runesOf(WEAPONS[P.weapon].id) : [];
function giveRune(id, why) {
  run.runeBag = run.runeBag || []; run.runeBag.push(id); play('rune_proc', 0.7); stat('runesFound');
  say(`${why || 'DU HITTADE'} ${RUNES[id].name}: ${RUNES[id].text}`, 3);
  const wp = WEAPONS[P.weapon];
  if (!wp.melee || true) setTimeout(() => { if (state !== 'play') return; openUI(() => CardUI.choice({ title: RUNES[id].name, subtitle: `${RUNES[id].text}. FÄST DEN I ${wp.name} NU, ELLER SPARA DEN TILL SMEDJAN.`, cancel: 1,
    options: [{ label: 'FÄST I ' + wp.name, text: runesOf(wp.id).length >= runeSlots() ? 'ERSÄTTER ' + RUNES[runesOf(wp.id)[0]].name : `${runesOf(wp.id).length + 1} AV ${runeSlots()} RUNPLATSER` }, { label: 'SPARA', text: 'FÄST DEN VID EN SMEDJA SENARE' }] },
    i => { closeUI(); if (i === 0) socketRune(id, wp.id); })); }, 400);
}
function socketRune(id, wid) {
  const bag = run.runeBag || [], i = bag.indexOf(id); if (i < 0) return; bag.splice(i, 1);
  run.wrunes = run.wrunes || {}; const list = (run.wrunes[wid] = run.wrunes[wid] || []);
  if (list.length >= runeSlots()) { const old = list.shift(); say(RUNES[old].name + ' SPRACK', 1.5); }
  list.push(id); play('rune_socket', 0.9); stat('runesSocketed'); logEvent('RUNA: ' + RUNES[id].name);
  say(`${RUNES[id].name} SITTER I ${WEAPONS[weaponIndex(wid)].name}`, 2.5);
  for (let k = 0; k < 10; k++) particles.push({ x: P.x + Math.cos(P.a) * 0.6, y: P.y + Math.sin(P.a) * 0.6, z: 0.4, vx: rnd(-1, 1), vy: rnd(-1, 1), vz: rnd(0.5, 1.5), life: 0.6, maxLife: 0.6, img: fx.hit[1], size: 0.05, add: true, tint: RUNES[id].tint, fade: true });
}
function runeProc(e, dmg) { // runornas effekter på spelarens träffar
  const rs = curRunes(); if (!rs.length || e.dead && !e.dying) return;
  const pw = 1 + mod('runePower');
  for (const r of rs) {
    if (r === 'fire' && Math.random() < 0.35 * pw && !e.d.fireproof) { e.burn = Math.max(e.burn || 0, 3); e.burnAcc = e.burnAcc || 0; }
    if (r === 'ice') { e.slow = Math.max(e.slow || 0, 1.5 * pw); if (Math.random() < 0.12 * pw) freeze(e, 1.5); }
    if (r === 'poison' && Math.random() < 0.4 * pw) e.poison = Math.max(e.poison || 0, 4);
    if (r === 'storm' && Math.random() < 0.12 * pw) { const o = nearestFoes(e, 5, 1)[0]; if (o) { zap(e.x, e.y, o.x, o.y, [160, 190, 255]); hurtEnemy(o, dmg * 0.8, o.x, o.y, { noProc: true }); play('shock', 0.4, 1.3, { x: o.x, y: o.y }); flashes.push({ x: o.x, y: o.y, t: 0.1, r: 3, col: [140, 170, 255] }); } }
    if (r === 'blood') heal(dmg * 0.06 * pw, true);
    if (r === 'echo') { WS.echoN = (WS.echoN || 0) + 1; if (WS.echoN % 5 === 0 && !e.dead) { setTimeout(() => { if (!e.dead && map) { hurtEnemy(e, dmg, e.x, e.y, { noProc: true }); spawnText(e.x, e.y, 'EKO', '#e8d9b0'); } }, 150); } }
  }
  if (!settings.lowfx && Math.random() < 0.3) { const t = RUNES[rs[0]].tint; particles.push({ x: e.x, y: e.y, z: 0.5, vx: rnd(-0.6, 0.6), vy: rnd(-0.6, 0.6), vz: 0.8, life: 0.4, maxLife: 0.4, img: fx.hit[1], size: 0.05, add: true, tint: t, fade: true }); }
}
function openRuneSocket() { // smedjan: fäst en sparad runa i vapnet du håller
  const bag = run.runeBag || [], wp = WEAPONS[P.weapon];
  if (!bag.length) { say('DU HAR INGA RUNOR', 1.5); return; }
  openUI(() => CardUI.list('FÄST EN RUNA', `${wp.name}: ${runesOf(wp.id).map(r => RUNES[r].name).join(', ') || 'INGA RUNOR'} (${runeSlots()} PLATS${runeSlots() > 1 ? 'ER' : ''})`,
    bag.map(id => ({ label: RUNES[id].name, text: RUNES[id].text, color: RUNES[id].col, img: hudImg['rune_' + id] ? hudImg['rune_' + id].src : undefined, onClick: () => { CardUI.close(); socketRune(id, wp.id); closeUI(); } })), () => closeUI()));
}
// ---------- Version 6: lägerelden ----------
function floorHint(from) { // fångens tips om våningen
  const dir = (x, y) => { const a = Math.atan2(y - from.y, x - from.x), k = Math.round(((a + TAU) % TAU) / (TAU / 8)) % 8; return ['ÖSTER', 'SYDOST', 'SÖDER', 'SYDVÄST', 'VÄSTER', 'NORDVÄST', 'NORR', 'NORDOST'][k]; };
  const st = props.find(p => p.ch === '÷' && !p.used); if (st) return 'EN HEMLIG TRAPPA FINNS NÅGONSTANS I ' + dir(st.x, st.y);
  for (const k in doors) { const d = doors[k]; if (d.secret && !d.target) return 'JAG HÖRDE ETT EKO BAKOM EN VÄGG I ' + dir(d.x, d.y); }
  const v = lvl.rooms && lvl.rooms.find(r => r.type === 'vault' || r.type === 'treasure'); if (v) return 'SKATTEN LIGGER I ' + dir(v.x + v.w / 2, v.y + v.h / 2);
  const el = ents.find(e => e.elite && !e.dead); if (el) return 'EN STARK FIENDE VAKTAR I ' + dir(el.x, el.y);
  return 'INGENTING ÄR SOM DET SER UT HÄR NERE';
}
function openCampfire(pr) {
  if (pr.used) { say('ELDEN HAR BRUNNIT NED', 1.5); return; }
  const wp = WEAPONS[P.weapon], lv = wlvl(wp.id), healN = Math.round(maxHp() * 0.4 * (1 + mod('campfireHeal'))), meat = run.meat || 0;
  const canRefine = window.Cards && Cards.refine && run.owned.some(id => Cards.refine(id));
  play('campfire', 0.6); play('rest', 0.5);
  openUI(() => CardUI.choice({ title: 'LÄGERELDEN', subtitle: 'ELDEN SPRAKAR. DU HAR TID FÖR EN SAK INNAN DU MÅSTE GÅ VIDARE.', cancel: 4,
    options: [
      { label: `VILA (+${healN} HP)`, text: P.hp >= maxHp() ? 'DU ÄR REDAN UTVILAD' : 'LÄK DINA SÅR' },
      { label: 'SMIDA', text: lv >= 3 ? `${wp.name} ÄR FULLT SMIDD` : `${wp.name} NIVÅ ${lv} → ${lv + 1} (+12 % SKADA)` },
      { label: 'FÖRÄDLA ETT KORT', text: canRefine ? 'ETT KORT BLIR STARKARE (+)' : 'INGA KORT KAN FÖRÄDLAS' },
      { label: meat ? `LAGA MAT (${meat} KÖTT)` : 'LAGA MAT', text: meat ? '+40 HP, +5 MAX HP OCH +10 % SKADA PÅ VÅNINGEN' : 'DU HAR INGET KÖTT' },
      { label: 'GÅ VIDARE', text: '' },
    ] }, i => {
    if (i === 0 && P.hp < maxHp()) { pr.used = true; heal(healN); play('rest', 0.8); say('DU VILAR VID ELDEN', 2); }
    else if (i === 1 && lv < 3) { pr.used = true; run.wlvl = run.wlvl || {}; run.wlvl[wp.id] = lv + 1; play('anvil', 0.8); say(`${wp.name} NIVÅ ${lv + 1}`, 2); }
    else if (i === 2 && canRefine) { pr.used = true; closeUI(); setTimeout(() => openUI(() => CardUI.refine(run.owned.filter(id => Cards.refine(id)), id => { const f = Cards.refine(id); if (f) { run.owned.splice(run.owned.indexOf(id), 1, f); run.cardAt = run.cardAt || {}; run.cardAt[f] = run.cardAt[id]; recomputeMods(); play('fuse_cards', 0.8); say((Cards.byId(f) || {}).name + ' – FÖRÄDLAT', 2.5); stat('refined'); } closeUI(); }, () => closeUI())), 50); return; }
    else if (i === 3 && meat) { pr.used = true; run.meat--; const k = 1 + mod('mealPower'); heal(40 * k); run.mealHp = (run.mealHp || 0) + 5; run.mealFloor = run.depth; P.mealDmg = 0.1 * k; play('eat', 0.8); say('EN STARK MÅLTID: +5 MAX HP, MER SKADA PÅ VÅNINGEN', 2.5); stat('meals'); }
    else if (i < 4) { say('DET GÅR INTE NU', 1.2); play('click', 0.5, 0.7); }
    closeUI(); checkAch();
  }));
}
// ---------- Version 6: anslagstavlan och sidouppdrag ----------
let quests = null;
function makeQuests(rng) {
  const own = WEAPONS.map((w, i) => i).filter(i => P.has[i] && !WEAPONS[i].melee), wi = own.length ? own[(rng.next() * own.length) | 0] : 0, n = 4 + Math.min(4, run.depth);
  const pool = [
    { kind: 'wkills', weapon: WEAPONS[wi].id, n, have: 0, text: `DÖDA ${n} FIENDER MED ${WEAPONS[wi].name}` },
    totalSecrets ? { kind: 'secret', text: 'HITTA EN HEMLIGHET PÅ VÅNINGEN', start: secrets } : null,
    { kind: 'nopotion', text: 'KLARA VÅNINGEN UTAN DRYCKER', start: (run.potionsDrunk || 0) },
    ents.some(e => e.elite && !e.dead) ? { kind: 'elite', text: 'DÖDA EN ELIT INOM 90 SEKUNDER', limit: 90 } : null,
    { kind: 'combo', n: 5 + run.depth, text: `NÅ KOMBO x${5 + run.depth}` },
    { kind: 'nohurt', text: 'TA INGEN SKADA PÅ 60 SEKUNDER', limit: 60 },
  ].filter(Boolean);
  const out = [];
  while (out.length < 3 && pool.length) out.push(pool.splice((rng.next() * pool.length) | 0, 1)[0]);
  for (const q of out) q.reward = rng.pick(['gold', 'gold', 'card', 'rune']);
  return out;
}
function openQuestBoard(pr) {
  if (!quests) { quests = makeQuests(RNG(RNG.hash(run.seed + ':uppdrag:' + run.depth))); for (const q of quests) { q.t0 = levelTime; q.hurt0 = lvlStat.taken; } play('quest_new', 0.8); }
  const rw = { gold: `${Math.round(50 * (1 + mod('questGold')))} GULD`, card: 'ETT KORTVAL', rune: 'EN RUNA' };
  openUI(() => CardUI.list('ANSLAGSTAVLAN', 'TRE UPPDRAG FÖR VÅNINGEN – DE RÄKNAS FRÅN NU', quests.map(q => ({ label: q.text, text: (q.done ? 'KLART! ' : q.failed ? 'MISSLYCKAT · ' : 'BELÖNING: ') + rw[q.reward], color: q.done ? '#9fe0a0' : q.failed ? '#a05040' : '#e8d9b0' })), () => closeUI()));
}
function questTick() {
  if (!quests || state !== 'play') return;
  for (const q of quests) {
    if (q.done || q.failed) continue;
    let ok = false;
    if (q.kind === 'wkills') ok = q.have >= q.n;
    else if (q.kind === 'secret') ok = secrets > q.start;
    else if (q.kind === 'elite') { if (levelTime - q.t0 > q.limit) q.failed = true; else ok = !!q.eliteKilled; }
    else if (q.kind === 'combo') ok = P.combo >= q.n;
    else if (q.kind === 'nohurt') { if (lvlStat.taken > q.hurt0) { q.hurt0 = lvlStat.taken; q.t0 = levelTime; } ok = levelTime - q.t0 >= q.limit; }
    else if (q.kind === 'nopotion') { if ((run.potionsDrunk || 0) > q.start) q.failed = true; }
    if (q.failed) { say('UPPDRAGET MISSLYCKADES: ' + q.text, 2); play('click', 0.6, 0.5); }
    if (ok) questDone(q);
  }
}
function questDone(q) {
  q.done = true; stat('quests'); play('quest_done', 0.8); say('UPPDRAG KLART: ' + q.text, 3);
  if (q.reward === 'gold') { const g = Math.round(50 * (1 + mod('questGold'))); run.gold += g; spawnText(P.x + Math.cos(P.a), P.y + Math.sin(P.a), `+${g} GULD`, '#ffd24a'); }
  else if (q.reward === 'card') items.push({ type: 'cardpick', x: P.x + Math.cos(P.a) * 0.8, y: P.y + Math.sin(P.a) * 0.8, taken: false, drop: true, luck: 0.7, title: 'UPPDRAGETS BELÖNING' });
  else giveRune(RUNE_IDS[(Math.random() * RUNE_IDS.length) | 0], 'BELÖNING:');
  checkAch();
}
function questFloorEnd() { // vid våningens slut: uppdraget utan drycker klaras
  if (!quests) return;
  for (const q of quests) if (q.kind === 'nopotion' && !q.done && !q.failed) questDone(q);
}
// ---------- Version 6: hemliga trappor ----------
function enterSecretStairs(pr) {
  if (!Gen.secret) { say('TRAPPAN ÄR RASAD', 1.5); return; }
  openUI(() => CardUI.choice({ title: 'DEN HEMLIGA TRAPPAN', subtitle: 'EN TRAPPA LEDER NED I MÖRKRET. DÄR NERE FINNS SKATTER – MEN VÅNINGEN HÄR LÄMNAR DU UTAN BONUS.', cancel: 1,
    options: [{ label: 'GÅ NED', text: 'TILL DEN HEMLIGA VÅNINGEN' }, { label: 'INTE NU', text: '' }] }, i => {
    closeUI(); if (i !== 0) return;
    pr.used = true; play('secret_stairs', 0.9); stat('secretFloors'); logEvent('HEMLIG VÅNING');
    const L = Gen.secret(RNG.hash(run.seed + ':hemlig:' + run.depth), { biome: lvl.biome });
    L.secret = true; L.name = L.name || 'DEN GLÖMDA SKATTKAMMAREN'; L.ambient = Math.max(L.ambient || 0.2, 0.32);
    run.inSecret = true; startLevel(L); say('DU HAR HITTAT EN HEMLIG VÅNING!', 3);
  }));
}
// ---------- Version 6: aktiva förmågor (kort med active, tangent T) ----------
const ABILITIES = {
  blink: { name: 'BLINKEN', col: '#a0e0ff' }, slowmo: { name: 'TIDSBUBBLAN', col: '#a0a0ff' }, bubble: { name: 'SKÖLDBUBBLAN', col: '#80c0ff' },
  summon: { name: 'VÅLNADSKALLET', col: '#a0ffc0' }, quake: { name: 'JORDSKALVET', col: '#d0a060' },
};
let abCd = 0, slowBubble = 0;
const activeCard = () => window.Cards && Cards.activeOf && run ? Cards.activeOf(run.owned) : null;
function useAbility() {
  if (state !== 'play') return;
  const c = activeCard();
  if (!c) { if ((P.abMsgT || 0) < tmr) { P.abMsgT = tmr + 2; say('DU HAR INGEN FÖRMÅGA – SÖK ETT KORT MED "AKTIV"', 1.5); } return; }
  if (abCd > 0) { play('click', 0.4, 0.7); return; }
  abCd = (c.cd || 15) * Math.max(0.3, 1 - mod('activeCd'));
  const id = c.active; play('ab_' + id, 0.8); stat('abilities');
  if (id === 'blink') { const d = Math.min(5, cast(P.x, P.y, Math.cos(P.a), Math.sin(P.a)).dist - 0.5); spawnPuff(P.x, P.y, 6); let k = d; while (k > 0 && !freeSpot(P.x + Math.cos(P.a) * k, P.y + Math.sin(P.a) * k, 0.25)) k -= 0.25; if (k > 0) { P.x += Math.cos(P.a) * k; P.y += Math.sin(P.a) * k; } P.iframe = Math.max(P.iframe, 0.3); spawnPuff(P.x, P.y, 6); P.flash = 0.1; }
  else if (id === 'slowmo') { slowBubble = 5; say('TIDEN SAKTAR NED', 1.2); }
  else if (id === 'bubble') { P.bubbleT = 4; say('SKÖLDBUBBLAN', 1); }
  else if (id === 'summon') { for (let i = 0; i < 2; i++) { const a = P.a + (i ? 1.2 : -1.2), x = P.x + Math.cos(a), y = P.y + Math.sin(a); spawnAlly(enemyFrames['Ý'] && enemyFrames['Ý'] !== enemyFrames.S ? 'Ý' : 'S', solid(x, y) ? P.x : x, solid(x, y) ? P.y : y, 20, { tint: [150, 220, 255], dmg: 6 + run.depth }); } say('VÅLNADERNA SVARAR', 1.5); }
  else if (id === 'quake') { P.shake = 2.5; for (const e of ents) { if (e.dead || e.dormant) continue; const d = Math.hypot(e.x - P.x, e.y - P.y); if (d > 5) continue; hurtEnemy(e, 6 * (1 + mod('dmg')), e.x, e.y, { noProc: true }); if (!e.boss) { e.stun = Math.max(e.stun || 0, 2); for (let i = 0; i < 4; i++) tryMove(e, (e.x - P.x) / (d || 1) * 0.15, (e.y - P.y) / (d || 1) * 0.15, 0.28); } } for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; particles.push({ x: P.x, y: P.y, z: 0.05, vx: Math.cos(a) * 5, vy: Math.sin(a) * 5, vz: 0.5, life: 0.5, maxLife: 0.5, img: fx.parts.dust ? fx.parts.dust[0] : fx.hit[1], size: 0.12, fade: true, tint: [170, 140, 100] }); } }
}
function updateAbility(dt) {
  const c = activeCard();
  if (c && !profile.abilityTip) { profile.abilityTip = 1; saveProfile(); say(`FÖRMÅGA: ${c.name} – TRYCK ${isTouch() ? 'PÅ STJÄRNKNAPPEN' : 'T'}`, 4); play('tutorial', 0.6); }
  if (abCd > 0) { abCd -= dt; if (abCd <= 0 && c) { abCd = 0; play('ability_ready', 0.5); } }
  if (slowBubble > 0) slowBubble -= dt;
  if (P.bubbleT > 0) { P.bubbleT -= dt; for (const p of projectiles) if (!p.friendly && !p.dead && Math.hypot(p.x - P.x, p.y - P.y) < 1.4) { p.dead = true; sparks(p.x, p.y, 0.5, 3); play('shield_block', 0.4, 1.3); } }
  const b = abBtn(); if (b) b.classList.toggle('empty', !c || abCd > 0);
}
let abBtnEl = null; const abBtn = () => abBtnEl || (abBtnEl = document.querySelector('#touch .abb'));
function abilityKill() { if (abCd > 0) abCd = Math.max(0, abCd - (P.combo >= 3 ? 1 : 0.4)); } // dödanden laddar förmågan
function drawAbilityHud(g) {
  const c = activeCard(); if (!c) return;
  const x = W - 22, y = VH - 22, im = hudImg['ab_' + c.active], col = (ABILITIES[c.active] || {}).col || '#e8d9b0';
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x - 2, y - 2, 20, 20);
  if (im) g.drawImage(im, x, y, 16, 16); else { g.fillStyle = col; g.fillRect(x + 4, y + 4, 8, 8); }
  if (abCd > 0) { const k = abCd / ((c.cd || 15) * Math.max(0.3, 1 - mod('activeCd'))); g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(x, y, 16, Math.round(16 * k)); txt(String(Math.ceil(abCd)), x + 8 - textW(String(Math.ceil(abCd))) / 2, y + 4, '#ffffff', 1, true, 0.9); }
  else if (tmr % 1 < 0.5) { g.strokeStyle = col; g.strokeRect(x - 1.5, y - 1.5, 19, 19); }
  if (!isTouch()) txt(keyName((settings.binds || {}).KeyT || 'KeyT'), x - 10, y + 5, '#c9a87a', 1, true, 0.7);
  if (slowBubble > 0) { g.fillStyle = 'rgba(120,120,255,0.1)'; g.fillRect(0, 0, W, VH); }
  if (P.bubbleT > 0) { g.strokeStyle = `rgba(130,190,255,${0.3 + 0.2 * Math.sin(tmr * 8)})`; g.lineWidth = 2; g.beginPath(); g.arc(W / 2, HORIZON, 70, 0, TAU); g.stroke(); g.lineWidth = 1; }
}
function drawRuneHud(g) { // runorna på vapnet syns i listen
  const rs = curRunes(); let x = 256;
  for (const r of rs) { const im = hudImg['rune_' + r]; if (im) g.drawImage(im, x, VH + 4, 8, 8); else { g.fillStyle = RUNES[r].col; g.fillRect(x + 1, VH + 5, 6, 6); } x -= 9; }
}
// ---------- Utmaningsrummet: tre vågor ----------
let challenge = null;
function startChallenge(pr, max = 3) {
  challenge = { pr, wave: 0, t: 1.5, alive: [], max }; pr.used = true; play('gong', 1); if (window.Music) Music.sting('challenge'); setMusic(true); P.shake = 0.8;
  const room = roomAt(pr.x, pr.y);
  for (const d of Object.values(doors)) if (!d.secret && room && d.x >= room.x - 1 && d.y >= room.y - 1 && d.x <= room.x + room.w && d.y <= room.y + room.h) { d.glock = true; if (!occupied(d)) d.target = 0; }
  say('UTMANINGEN BÖRJAR!', 2.5);
}
function roomAt(x, y) { const rm = lvl.roomMask; if (!rm || !lvl.rooms) return null; const ch = rm[y | 0] && rm[y | 0][x | 0]; if (!ch || ch === '-') return null; return lvl.rooms[ch.charCodeAt(0) - 48] || null; }
function updateChallenge(dt) {
  const c = challenge; if (!c) return;
  c.alive = c.alive.filter(e => !e.dead);
  if (c.alive.length) return;
  c.t -= dt; if (c.t > 0) return;
  if (c.wave >= c.max) { // klart: belöning
    challenge = null; setMusic(false); play('gong', 0.8, 1.3); play('win', 0.6);
    for (const d of Object.values(doors)) if (d.glock && !(guardianE && !guardianE.dead)) { d.glock = false; d.target = 1; }
    if (c.max >= 3) { chests.push({ x: c.pr.x + 1, y: c.pr.y, open: false, t: 0, rare: c.max >= 5 }); if (solid(c.pr.x + 1, c.pr.y)) chests[chests.length - 1].x = P.x + Math.cos(P.a); }
    items.push({ type: 'cardpick', x: c.pr.x, y: c.pr.y + 1, taken: false, drop: true, luck: c.max >= 5 ? 1.6 : 0.8, title: 'UTMANINGENS BELÖNING' });
    for (let i = 0; i < [0, 0, 5, 8, 0, 16][c.max]; i++) dropItem('gold', c.pr.x + rnd(-1, 1), c.pr.y + rnd(-1, 1));
    if (c.max >= 5) { dropItem('potion', c.pr.x, c.pr.y); stat('hardChallenges'); if (run.owned.some(id => { const cd = Cards.byId(id); return cd && cd.curse; })) { const cs = run.owned.filter(id => { const cd = Cards.byId(id); return cd && cd.curse; }); const id = cs[0]; run.owned.splice(run.owned.indexOf(id), 1); recomputeMods(); setTimeout(() => say(`UTMANINGEN BRÖT FÖRBANNELSEN: ${Cards.byId(id).name}`, 3), 1500); } } // svår utmaning bryter en förbannelse
    run.challenges = (run.challenges || 0) + 1; stat('challenges'); checkAch(); say('UTMANINGEN KLARAD!', 3); return;
  }
  c.wave++; c.t = 2.5;
  const pool = run.depth >= 3 ? ['S', 'K', 'V', 'I', 'L', 'W', 'R'] : ['S', 'K', 'L', 'I'], n = 2 + c.wave + Math.floor(run.depth / 2);
  for (let i = 0; i < n; i++) {
    const spot = freeSpotFar(2.5, 6) || [c.pr.x + rnd(-2, 2), c.pr.y + rnd(-2, 2)];
    if (solid(spot[0], spot[1])) continue;
    const e = makeEnemy(pool[(Math.random() * pool.length) | 0], spot[0], spot[1]); e.alert = true; e.minion = true; ents.push(e); totalEnemies++; c.alive.push(e); spawnPuff(spot[0], spot[1], 6);
  }
  if (c.wave === 3 || c.wave === 5) { const e = c.alive[0]; if (e) { const el = makeElite(RNG(Date.now()), e.x, e.y); el.alert = true; ents.push(el); totalEnemies++; c.alive.push(el); } }
  say(`VÅG ${c.wave} AV ${c.max}`, 2); play('gong', 0.6, 1 + c.wave * 0.1);
}
// ---------- Farlig mark: lava, vatten, is, nät, pilfällor och gas ----------
function burnWebs(x, y, r) { // eld och explosioner bränner upp nät, som sprider sig till nät intill
  for (let cy = Math.max(0, (y - r) | 0); cy <= Math.min(mh - 1, (y + r) | 0); cy++) for (let cx = Math.max(0, (x - r) | 0); cx <= Math.min(mw - 1, (x + r) | 0); cx++)
    if (map[cy][cx] === '"' && Math.hypot(cx + 0.5 - x, cy + 0.5 - y) <= r + 0.5) burnWeb(cx, cy);
}
function burnWeb(cx, cy) {
  if (map[cy][cx] !== '"') return;
  map[cy][cx] = '.'; const pr = props.find(o => o.cx === cx && o.cy === cy && o.def && o.def.web); if (pr) pr.broken = true;
  for (let i = 0; i < 3; i++) particles.push({ x: cx + 0.5 + rnd(-0.3, 0.3), y: cy + 0.5 + rnd(-0.3, 0.3), z: rnd(0.1, 0.6), vx: 0, vy: 0, vz: 0.5, life: 0.5, maxLife: 0.5, frames: fx.fire, img: fx.fire[0], size: 0.35, add: true, drift: true });
  play('fireburst', 0.25, 1.4, { x: cx + 0.5, y: cy + 0.5 });
  setTimeout(() => { if (map) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (cy + dy >= 0 && cy + dy < mh && cx + dx >= 0 && cx + dx < mw && map[cy + dy][cx + dx] === '"') burnWeb(cx + dx, cy + dy); }, 250);
}
const trapMul = () => Math.max(0.1, 1 - mod('trapResist'));
let hazAcc = 0, animAcc = 0;
function updateCold(dt) { // Frostfästet: stilla ute i kylan så fryser du, eld och rörelse värmer
  if (lvl.biome !== 'frost' || boss) { P.cold = 0; return; }
  const out = cellSky && cellSky[(P.y | 0) * mw + (P.x | 0)], warm = torches.some(t => (!t.hidden || (t.prop && t.prop.ch === '¶')) && Math.hypot(t.x - P.x, t.y - P.y) < 3) || P.flameT > 0;
  if (warm) { P.cold = Math.max(0, (P.cold || 0) - dt * 3); if (Math.random() < dt * 3) particles.push({ x: P.x + rnd(-0.6, 0.6), y: P.y + rnd(-0.6, 0.6), z: 0.2, vx: 0, vy: 0, vz: 0.5, life: 0.6, maxLife: 0.6, frames: fx.parts.ember || fx.hit, img: (fx.parts.ember || fx.hit)[0], size: 0.04, add: true, drift: true }); }
  else if (out && Math.hypot(P.vx, P.vy) < 0.5) P.cold = (P.cold || 0) + dt * Math.max(0.2, 1 - mod('coldResist'));
  else P.cold = Math.max(0, (P.cold || 0) - dt * 0.5);
  if (P.cold > 6) { P.coldAcc = (P.coldAcc || 0) + dt; if (P.coldAcc > 2) { P.coldAcc = 0; if (P.hp > maxHp() * 0.25) { P.hp -= 2; P.hurt = 0.1; } if (!P.coldMsgT || P.coldMsgT < tmr) { P.coldMsgT = tmr + 8; say('DU FRYSER – RÖR PÅ DIG ELLER HITTA EN ELD', 2.5); } } }
  if (cellUnder() === ':' && Math.hypot(P.vx, P.vy) > 4 && lvl.biome === 'frost') { const k = ((P.y | 0) * mw + (P.x | 0)); iceSteps[k] = (iceSteps[k] || 0) + dt; if (iceSteps[k] > 1.2) { iceSteps[k] = -99; map[P.y | 0][P.x | 0] = '-'; cellFloor[k] = animTex.water ?? cellFloor[k]; play('ice_crack', 0.8); say('ISEN BRAST!', 1); P.vx *= 0.3; P.vy *= 0.3; } } // isen spricker
}
let iceSteps = {};
function updateGround(dt) {
  updateCold(dt);
  if (!settings.lowfx && Math.random() < dt * 6) { const a = rnd(0, TAU), r = rnd(1, 5), x = P.x + Math.cos(a) * r, y = P.y + Math.sin(a) * r; if (cellAt(x, y) === '-') particles.push({ x, y, z: 0.01, vx: 0, vy: 0, vz: 0, life: 0.4, maxLife: 0.4, img: fx.hit[1], size: 0.04, add: true, tint: [200, 230, 255], fade: true }); } // vattnet blänker
  animAcc += dt; if (animAcc > 0.45) { animAcc = 0; const f = Math.floor(tmr / 0.45) % 2; // animerad lava och vatten
    if (animTex.lava !== undefined) floorTexs[animTex.lava] = f ? tex.floor_lava2 : tex.floor_lava;
    if (animTex.water !== undefined) floorTexs[animTex.water] = f ? tex.floor_water2 : tex.floor_water; }
  hazAcc += dt; if (hazAcc < 0.5) return; hazAcc = 0;
  const c = cellUnder(), immune = mod('hazardImmune') > 0;
  if (c === '_' && P.jz < 0.12 && !immune) { run.cause = 'LAVA'; hurtPlayer(9 * trapMul()); play('lava', 0.5, rnd(0.9, 1.1)); P.burnFx = 0.6; }
  for (const e of ents) if (!e.dead && !e.boss && !e.dormant && cellAt(e.x, e.y) === '_' && e.d.ai !== 'fly') { hurtEnemy(e, 5, e.x, e.y, { noProc: true, quiet: true }); e.burn = Math.max(e.burn, 1.5); }
  // nära lava: fräsande ljud
  if (!P.lavaSndT || P.lavaSndT < tmr) { for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; if (cellAt(P.x + Math.cos(a) * 2, P.y + Math.sin(a) * 2) === '_') { play('lava', 0.2, rnd(0.8, 1)); P.lavaSndT = tmr + 3; break; } } }
}
function trapTick(pr, dt) {
  const d = pr.def;
  if (d.trap === 'arrow') { // tryckplattan skjuter pilar från närmaste vägg
    const on = Math.abs(P.x - pr.x) < 0.45 && Math.abs(P.y - pr.y) < 0.45 && P.jz < 0.1;
    pr.up = !on;
    if (on && (pr.cdT || 0) < tmr) {
      pr.cdT = tmr + 1.4; play('click', 0.6, 0.5, { x: pr.x, y: pr.y });
      let best = null;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { let k = 1; while (k < 7 && !isWallChar(cellAt(pr.cx + dx * k, pr.cy + dy * k))) k++; if (k < 7 && (!best || k < best.k)) best = { dx, dy, k }; }
      if (best) { const sx = pr.x + best.dx * (best.k - 0.6), sy = pr.y + best.dy * (best.k - 0.6); setTimeout(() => { if (!map) return; play('arrow', 0.7, 1, { x: sx, y: sy });
        projectiles.push({ x: sx, y: sy, z: 0.5, vx: -best.dx * 9, vy: -best.dy * 9, dmg: 11 * trapMul(), src: { x: sx, y: sy }, kind: 'arrow', life: 1.2 }); }, 120); }
    }
    return;
  }
  if (d.trap === 'gas') { // gasventilen pyser med jämna mellanrum
    const cyc = (tmr + pr.ph) % 6; pr.up = cyc > 4;
    if (pr.up) {
      if (Math.random() < dt * 8) particles.push({ x: pr.x + rnd(-0.4, 0.4), y: pr.y + rnd(-0.4, 0.4), z: 0.1, vx: rnd(-0.3, 0.3), vy: rnd(-0.3, 0.3), vz: 0.3, life: 1.2, maxLife: 1.2, frames: fx.parts.gas || fx.hit, img: (fx.parts.gas || fx.hit)[0], size: 0.45, add: true, tint: [120, 255, 120], drift: true, fade: true });
      if (!pr.sndT || pr.sndT < tmr) { pr.sndT = tmr + 2.2; play('gas', 0.5, 1, { x: pr.x, y: pr.y }); }
      if (Math.hypot(P.x - pr.x, P.y - pr.y) < 1.3 && (pr.hitT || 0) < tmr && mod('hazardImmune') <= 0) { pr.hitT = tmr + 0.5; run.cause = 'GIFTGAS'; hurtPlayer(4 * trapMul()); P.poisonFx = 0.6; }
      for (const e of ents) if (!e.dead && !e.boss && Math.hypot(e.x - pr.x, e.y - pr.y) < 1.3) e.poison = Math.max(e.poison || 0, 1.5);
    }
  }
}
function updateProps(dt) {
  updateGround(dt); updateChallenge(dt);
  for (const pr of props) if (pr.def && (pr.def.trap === 'arrow' || pr.def.trap === 'gas')) trapTick(pr, dt); else if (pr.def && V6_TRAPS.has(pr.def.trap)) trapV6(pr, dt);
  updateCrumbles(dt);
  for (const pr of props) {
    if (!pr.def || !pr.def.trap || pr.def.trap === 'arrow' || pr.def.trap === 'gas' || V6_TRAPS.has(pr.def.trap)) continue;
    const cyc = (tmr + pr.ph) % 3.2, wasUp = pr.up;
    pr.up = cyc > 2.3; // uppe i knappt en sekund var tredje sekund
    if (pr.up && !wasUp && Math.hypot(pr.x - P.x, pr.y - P.y) < 8) play('click', 0.5, 0.6, { x: pr.x, y: pr.y });
    if (!pr.up) { if (cyc > 1.9 && cyc < 2.0 && Math.hypot(pr.x - P.x, pr.y - P.y) < 3 && (pr.warnT || 0) < tmr) { pr.warnT = tmr + 2; play('click', 0.25, 1.4, { x: pr.x, y: pr.y }); } continue; }
    if (Math.abs(P.x - pr.x) < 0.48 && Math.abs(P.y - pr.y) < 0.48 && (pr.hitT || 0) < tmr && P.jz < 0.15) { pr.hitT = tmr + 0.9; run.cause = 'SPIKFÄLLA'; hurtPlayer(10 * trapMul(), pr.x, pr.y); spawnBlood(P.x, P.y); }
    for (const e of ents) if (!e.dead && !e.boss && !e.dormant && Math.abs(e.x - pr.x) < 0.48 && Math.abs(e.y - pr.y) < 0.48 && (e.spikeT || 0) < tmr) { e.spikeT = tmr + 0.9; hurtEnemy(e, 6, e.x, e.y, { noProc: true }); }
  }
}
function breakPot(pt) {
  pt.broken = true; play('pot', 0.7, rnd(0.9, 1.15), { x: pt.x, y: pt.y }); score += 10;
  for (let i = 0; i < 7; i++) {
    const a = rnd(0, TAU), sp = rnd(0.6, 2);
    particles.push({ x: pt.x, y: pt.y, z: 0.2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: rnd(1, 2.5), life: rnd(0.8, 1.4), img: fx.shards[pt.color * 6 + (i % 6)], size: 0.14, grav: true, bounce: true });
  }
  if (pt.loot) dropItem(pt.loot, pt.x, pt.y);
  else if (Math.random() < 0.15) dropItem('shard', pt.x, pt.y); // rustningsskärva
  if (Math.random() < 0.05) { for (let i = 0; i < 6; i++) dropItem('gold', pt.x, pt.y); say('JACKPOTT!', 1); play('coin', 0.8, 0.8); } // ibland en guldskatt
}
function spawnBlood(x, y) {
  const a = rnd(0, TAU), sp = rnd(0.3, 1.2);
  particles.push({ x, y, z: rnd(0.35, 0.65), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: rnd(0, 1.5), life: rnd(0.35, 0.7), img: fx.blood[(Math.random() * 3) | 0], size: rnd(0.1, 0.18), grav: true });
}
// ---------- Effekter: kulhål, gnistor, spårljus, rök ----------
const wallMarks = new Map(); // kulhål och blod på väggar: nyckel = ruta och sida
const faceOf = (side, dx, dy) => side === 0 ? (dx > 0 ? 0 : 1) : (dy > 0 ? 2 : 3);
function wallMark(hit, dx, dy, z, kind) {
  if (!hit || hit.mx === undefined || !isWallChar(hit.cell)) return;
  const key = (hit.my * mw + hit.mx) * 4 + faceOf(hit.side, dx, dy);
  let arr = wallMarks.get(key); if (!arr) { arr = []; wallMarks.set(key, arr); }
  arr.push({ u: hit.wx, z: clamp(z, 0.05, 0.95), kind, r: kind === 'blood' ? rnd(0.04, 0.07) : kind === 'web' ? 0.08 : 0.016, seed: Math.random() * 1000 });
  if (arr.length > 14) arr.shift();
  if (wallMarks.size > 500) wallMarks.delete(wallMarks.keys().next().value);
}
function sparks(x, y, z, n) {
  for (let i = 0; i < n; i++) particles.push({ x, y, z, vx: rnd(-1.5, 1.5), vy: rnd(-1.5, 1.5), vz: rnd(0.5, 2), life: 0.35, maxLife: 0.35, img: fx.hit[2], frames: null, size: 0.05, add: true, tint: [255, 220, 120], grav: true });
}
function tracer(dx, dy, d) {
  for (let t = 1.2; t < d; t += 0.9) particles.push({ x: P.x + dx * t, y: P.y + dy * t, z: P.camZ - 0.06, vx: 0, vy: 0, vz: 0, life: 0.06, maxLife: 0.06, img: fx.hit[1], size: 0.06, add: true, tint: [255, 240, 180] });
}
function muzzleSmoke() {
  if (settings.lowfx || !fx.parts.smoke) return;
  const a = P.a, f = fx.parts.smoke;
  particles.push({ x: P.x + Math.cos(a) * 0.7, y: P.y + Math.sin(a) * 0.7, z: P.camZ - 0.12, vx: P.vx * 0.5 + rnd(-0.1, 0.1), vy: P.vy * 0.5 + rnd(-0.1, 0.1), vz: 0.4, life: 0.8, maxLife: 0.8, frames: f, img: f[0], size: 0.14, drift: true });
}
function spawnText(x, y, text, color) { numbers.push({ x: x + rnd(-0.1, 0.1), y: y + rnd(-0.1, 0.1), z: 0.95, v: text, color, crit: false, t: 1.1 }); }
function bash() { // kolvslag: när allt ammo är slut
  if (P.kickT > 0) return; P.kickT = 0.5; WS.kick = 0.3; play('whoosh', 0.5, 1.1);
  for (const e of ents) {
    if (e.dead || e.hidden || e.dormant) continue;
    const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy); let off = Math.atan2(dy, dx) - P.a; off = Math.atan2(Math.sin(off), Math.cos(off));
    if (d < 1.4 + e.d.size * 0.3 && Math.abs(off) < 0.6) { hurtEnemy(e, 4 * (1 + mod('dmg')), e.x, e.y); play('kick', 0.7); P.shake = Math.max(P.shake, 0.6); }
  }
}
function spawnImpact(x, y, z) {
  particles.push({ x, y, z: z - 0.08, vx: 0, vy: 0, vz: 0, life: 0.25, maxLife: 0.25, frames: fx.hit, img: fx.hit[0], size: 0.16, add: true });
}
const decals = []; // blodpölar på golvet
function addDecal(x, y) { const f = fx.parts.blood_pool; if (f && !solid(x, y)) { decals.push({ x: x + rnd(-0.15, 0.15), y: y + rnd(-0.15, 0.15), img: f[(Math.random() * f.length) | 0], size: rnd(0.07, 0.1) }); if (decals.length > 70) decals.shift(); } }
const numbers = []; // skadesiffror som flyger upp
function spawnNumber(x, y, dmg, crit) {
  for (let i = numbers.length - 1; i >= Math.max(0, numbers.length - 6); i--) { const n = numbers[i]; if (typeof n.v === 'number' && n.t > 0.6 && n.crit === crit && Math.hypot(n.x - x, n.y - y) < 0.45) { n.v += Math.max(1, Math.round(dmg * 10)); n.t = 0.8; n.z = Math.min(n.z, 0.95); n.big = true; return; } } // snabba träffar klumpas ihop
  numbers.push({ x: x + rnd(-0.15, 0.15), y: y + rnd(-0.15, 0.15), z: 0.9, v: Math.max(1, Math.round(dmg * 10)), crit, t: 0.8 }); if (numbers.length > 40) numbers.shift(); }
const maxHp = () => run && run.cmode === 'onehit' ? 1 : 100 + mod('maxHp') + meta('hp') * 10 + (run && run.blessed ? 20 : 0) + (run && run.mealHp || 0);
// själaaltaret: bestående uppgraderingar som köps med själar på startskärmen
const META = [
  { id: 'hp', name: 'HÄRDAD', text: '+10 MAX HP PER NIVÅ', max: 3, cost: [30, 60, 100] },
  { id: 'gold', name: 'ARVET', text: '+25 STARTGULD PER NIVÅ', max: 3, cost: [20, 40, 70] },
  { id: 'ammo', name: 'KRUTVÄSKAN', text: '+50 % STARTAMMO PER NIVÅ', max: 2, cost: [25, 50] },
  { id: 'armor', name: 'BRYNJAN', text: '+25 STARTRUSTNING PER NIVÅ', max: 2, cost: [30, 60] },
  { id: 'choice', name: 'SIARENS ÖGA', text: '+1 VAL AV STARTKORT', max: 1, cost: [80] },
  { id: 'grenade', name: 'KRUTHORNET', text: '+1 STARTGRANAT PER NIVÅ', max: 2, cost: [20, 45] },
  { id: 'stamina', name: 'LÅNGA ANDAN', text: '+15 % UTHÅLLIGHET PER NIVÅ', max: 2, cost: [25, 50] },
  { id: 'luck', name: 'FYRKLÖVERN', text: 'BÄTTRE KORT PER NIVÅ', max: 3, cost: [35, 70, 120] },
  { id: 'reroll', name: 'TÄRNINGEN', text: 'ETT GRATIS "NYA KORT" PER RUNDA', max: 1, cost: [60] },
  { id: 'key', name: 'DYRKEN', text: 'BÖRJA MED EN NYCKEL', max: 1, cost: [45] },
  { id: 'pet', name: 'FLOCKEN', text: 'LÅS UPP EN FÖLJESLAGARE PER NIVÅ: KORPEN, LYKTAN, VARGVALPEN', max: 3, cost: [40, 70, 110] },
  { id: 'potslot', name: 'BANDOLJÄREN', text: 'EN TREDJE DRYCKESPLATS', max: 1, cost: [60] },
  { id: 'potstart', name: 'MORGONDOPPET', text: 'BÖRJA RUNDAN MED EN LÄKEDRYCK', max: 1, cost: [35] },
  { id: 'runeslot', name: 'RUNSMEDEN', text: 'EN ANDRA RUNPLATS I VARJE VAPEN', max: 1, cost: [90] },
  { id: 'camp', name: 'VANDRARENS ELD', text: 'LÄGERELDAR DYKER UPP OFTARE', max: 1, cost: [50] },
  { id: 'startrune', name: 'ARVSRUNAN', text: 'BÖRJA RUNDAN MED EN RUNA I PISTOLEN', max: 1, cost: [70] },
];
const meta = id => (profile.meta && profile.meta[id]) || 0;
function openAltar() {
  const items = () => META.map(m => ({ kind: 'meta', id: m.id, label: `${m.name} ${meta(m.id)}/${m.max}`, text: meta(m.id) >= m.max ? 'FULLT' : m.text, price: meta(m.id) >= m.max ? 0 : m.cost[meta(m.id)], owned: meta(m.id) >= m.max }));
  CardUI.shop(items(), profile.souls, item => {
    const m = META.find(x => x.id === item.id);
    if (item.owned || profile.souls < item.price) return { ok: false, gold: profile.souls };
    profile.souls -= item.price; profile.meta = profile.meta || {}; profile.meta[m.id] = meta(m.id) + 1; saveProfile(); play('buy', 0.8); checkAch();
    return { ok: true, gold: profile.souls, items: items() };
  }, () => refreshTitle(), { title: 'SJÄLAALTARET', currency: 'SJÄLAR', currencyColor: '#c0a0ff' });
}
function heal(n, silent) { if (dmod('gold')) n *= 0.7; const before = P.hp; if (!silent) lvlStat.healed = (lvlStat.healed || 0) + 1; P.hp = Math.min(maxHp(), P.hp + n); return P.hp - before; }
// kind: 'melee' | 'proj' | undefined
function hurtPlayer(d, fx0, fy0, kind) {
  if (params.has('god') || state !== 'play' || P.iframe > 0) return;
  if (Math.random() < mod('dodge')) { say('UNDVEK!', 0.8); play('whoosh', 0.4, 1.5); return; }
  d *= diff().dmg * Math.max(0.15, 1 + mod('damageTaken')) * (dmod('glass') ? 1.5 : 1);
  if (kind === 'proj') d *= Math.max(0, 1 - mod('projectileResist'));
  if (kind === 'melee') d *= Math.max(0, 1 - mod('meleeResist'));
  P.shieldT = 4;
  if (P.shield > 0) { const s = Math.min(P.shield, d); P.shield -= s; d -= s; }
  const hadArmor = P.armor > 0, absorbed = Math.min(P.armor, d * 0.5); P.armor -= absorbed; d -= absorbed;
  if (hadArmor && P.armor <= 0.5) { P.armor = 0; play('ice_break', 0.7, 0.8); say('RUSTNINGEN BRAST', 1.5); for (let i = 0; i < 8; i++) particles.push({ x: P.x + Math.cos(P.a) * 0.5, y: P.y + Math.sin(P.a) * 0.5, z: 0.4, vx: rnd(-1.5, 1.5), vy: rnd(-1.5, 1.5), vz: rnd(0.5, 2), life: 0.8, img: fx.hit[2], size: 0.06, add: true, tint: [140, 190, 255], grav: true }); }

  if (fx0 !== undefined && (boss || guardianE)) { const b = boss || guardianE; if (Math.hypot(b.x - fx0, b.y - fy0) < 3) taunt(b); }
  noteDamage(d, fx0, fy0, kind);
  P.hp -= d; P.hurt = 0.35; P.shake = Math.max(P.shake, 1.2); lvlStat.taken += d;
  if (settings.vibrate !== false && navigator.vibrate) try { navigator.vibrate(Math.min(120, 20 + d * 4)); } catch (e) { /* ingen vibration */ }
  play('hurt', 0.8, rnd(0.9, 1.1)); rumble(Math.min(1, 0.3 + d / 30), 160);
  if (fx0 !== undefined) hurtDir.push({ ang: Math.atan2(fy0 - P.y, fx0 - P.x), t: 1, col: kind === 'proj' ? '255,120,0' : kind === 'melee' ? '220,0,0' : '200,60,200' });
  if (P.hp <= 0 && fx0 !== undefined) run.cause = (ents.find(e => !e.dead && Math.abs(e.x - fx0) < 0.01 && Math.abs(e.y - fy0) < 0.01) || {}).d?.name || run.cause || '';
  if (P.hp <= 0) {
    if (run.livesUsed < mod('extraLife')) { // återupplivning från ett kort
      run.livesUsed++; P.hp = maxHp() * 0.5; P.hurt = 1; say('DU VÄGRAR DÖ!', 3); play('secret', 0.8, 1.4);
      for (const e of ents) if (!e.dead && Math.hypot(e.x - P.x, e.y - P.y) < 3) hurtEnemy(e, 8, e.x, e.y, { noProc: true });
      return;
    }
    state = 'dead'; P.hp = 0; P.deadT = 0; play('lose', 0.8);
    profile.lastDeath = { seed: run.seed, depth: run.depth, x: P.x, y: P.y, cause: run.cause || '' };
    stopAmbient(); setMusic(false);
    if (breathSnd) { breathSnd.s.stop(); breathSnd = null; }
    endRun(false);
  }
}


// ---------- Interaktion: dörrar, kistor, köpman ----------
function useKey() {
  if (useProp()) return;
  for (const e of ents) if (e.dormant && Math.hypot(e.x - P.x, e.y - P.y) < 1.4) { wakeMimic(e); return; }
  for (const c of chests) if (!c.open && Math.hypot(c.x - P.x, c.y - P.y) < 1.2) { openChest(c); return; }
  for (const m of merchants) if (Math.hypot(m.x - P.x, m.y - P.y) < 1.6 && shadowVisible(m)) { openShop(m); return; }
  for (const dist of [0.6, 1.0, 1.4]) {
    const nx = P.x + Math.cos(P.a) * dist, ny = P.y + Math.sin(P.a) * dist;
    const d = doorAt(nx, ny);
    if (!d || !isDoorChar(cellAt(nx, ny))) continue;
    if (d.secret) {
      if (d.target) return;
      d.target = 1; secrets++; score += 250; profile.secrets = (profile.secrets || 0) + 1; play('secret', 0.8); say('DU HITTADE ETT HEMLIGT RUM!', 3); return;
    }
    if (d.glock) { say('DÖRREN ÄR FÖRSEGLAD – BESEGRA VÄKTAREN', 2); play('click', 0.6, 0.6); return; }
    if (d.lever && !d.target) { say('GALLRET RÖR SIG INTE – HITTA SPAKEN', 2); play('click', 0.6, 0.6); return; }
    if (d.locked) { if (P.keys > 0) { P.keys--; stat('unlocks'); d.locked = false; d.target = 1; play('unlock', 0.9); say('DU LÅSER UPP DÖRREN', 2); } else { say('LÅST – DU BEHÖVER EN NYCKEL', 2); play('click', 0.6, 0.6); } return; }
    if (d.gate && boss && !boss.dead) { say('GRINDEN ÄR LÅST – DÖDA ' + boss.d.name, 2.5); play('click', 0.6, 0.6); return; }
    if (d.target && occupied(d)) { say('NÅGOT STÅR I VÄGEN', 1.2); return; }
    d.target = d.target ? 0 : 1; play(d.gate ? 'gate' : 'door', 0.6, 1, { x: d.x + 0.5, y: d.y + 0.5 });
    for (const e of ents) if (!e.dead && !e.alert && !e.dormant && Math.hypot(e.x - d.x - 0.5, e.y - d.y - 0.5) < 5) { e.sleep = false; e.lookAt = { x: d.x + 0.5, y: d.y + 0.5 }; if (Math.random() < 0.5) alertEnemy(e, false); } // fienderna hör dörren
    return;
  }
  kick(); // inget att använda: sparka i stället
}
function kick() { // spark: knuffar fiender bakåt, bryter krukor och lådor
  if (P.kickT > 0 || state !== 'play') return;
  P.kickT = 0.55; WS.kick = 0.3; play('whoosh', 0.4, 1.4);
  let hit = false;
  for (const e of ents) {
    if (e.dead || e.dying || e.hidden) continue;
    const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy);
    let off = Math.atan2(dy, dx) - P.a; off = Math.atan2(Math.sin(off), Math.cos(off));
    if (d > 1.5 + e.d.size * 0.3 || Math.abs(off) > 0.7) continue;
    hit = true; hurtEnemy(e, 2 * (1 + mod('dmg')), e.x, e.y, { noProc: true });
    if (!e.boss && !e.dead) { for (let i = 0; i < 6; i++) tryMove(e, dx / d * 0.22, dy / d * 0.22, 0.28); e.state = 'pain'; e.t = 0; e.charge = 0; }
  }
  for (const pt of pots) if (!pt.broken && Math.hypot(pt.x - P.x, pt.y - P.y) < 1.4) { breakPot(pt); hit = true; }
  const fx0 = P.x + Math.cos(P.a) * 0.9, fy0 = P.y + Math.sin(P.a) * 0.9, dd = doorAt(fx0, fy0);
  if (dd && cellAt(fx0, fy0) === 'D' && dd.target === 0 && !dd.glock) { dd.target = 1; dd.open = Math.max(dd.open, 0.5); play('kick', 0.9, 0.7); play('door', 0.8, 1.4, { x: dd.x + 0.5, y: dd.y + 0.5 }); hit = true; } // sparka upp dörrar
  for (const pr of props) { // sparka krutfat iväg, statyer kan gömma guld
    if (!pr.def || pr.broken || Math.hypot(pr.x - fx0, pr.y - fy0) > 0.8) continue;
    if (pr.def.boom) { pr.broken = true; map[pr.cy][pr.cx] = '.'; flowCell = -1; projectiles.push({ x: pr.x, y: pr.y, z: 0.3, vx: Math.cos(P.a) * 6, vy: Math.sin(P.a) * 6, kind: 'barrel', friendly: true, life: 2, dmg: 30, img: pr.frames[0] }); hit = true; say('KRUTFATET RULLAR!', 1); }
    else if (pr.ch === 'u' && !pr.kicked) { pr.kicked = true; hit = true; if (Math.random() < 0.3) { for (let i = 0; i < 6; i++) dropItem('gold', pr.x, pr.y); say('GULD I SOCKELN!', 1.5); play('coin', 0.8); } }
  }
  if (breakProps(P.x + Math.cos(P.a) * 0.9, P.y + Math.sin(P.a) * 0.9, 0.7, true)) hit = true;
  if (hit) { play('kick', 0.7, rnd(0.9, 1.1)); P.shake = Math.max(P.shake, 0.6); hitStop = Math.max(hitStop, 0.03); }
}
function occupied(d) { // dörren får inte stängas på någon
  const inCell = o => Math.abs(o.x - (d.x + 0.5)) < 0.8 && Math.abs(o.y - (d.y + 0.5)) < 0.8;
  return inCell(P) || ents.some(e => !e.dead && inCell(e));
}
function aimedAt(e) { const d = Math.hypot(e.x - P.x, e.y - P.y); let off = Math.atan2(e.y - P.y, e.x - P.x) - P.a; off = Math.atan2(Math.sin(off), Math.cos(off)); return Math.abs(off) < Math.max(0.03, 0.4 * e.d.size / d); }
function idleBehaviour(e, dt, dist) { // patrullering, sömn och ljud från fiender som inte sett dig
  e.state = 'idle';
  if (e.sleep) { if (Math.random() < dt * 0.6 && dist < 12 && fx.parts.zzz) particles.push({ x: e.x, y: e.y, z: e.d.size * 0.7, vx: 0.1, vy: 0, vz: 0.35, life: 1.4, maxLife: 1.4, img: fx.parts.zzz[0], size: 0.08, drift: true }); return; }
  if (e.searchT > 0) { e.searchT -= dt; if (Math.random() < dt * 2) spawnText(e.x, e.y, '?', '#e8d9b0'); }
  if (e.patrol) {
    const [tx, ty] = e.patrol.leg ? [e.patrol.x2, e.patrol.y2] : [e.patrol.x1, e.patrol.y1];
    const d = Math.hypot(tx - e.x, ty - e.y);
    if (d < 0.3) { e.patrol.wait -= dt; if (e.patrol.wait <= 0) { e.patrol.leg = !e.patrol.leg; e.patrol.wait = rnd(1, 3); } }
    else { const a = Math.atan2(ty - e.y, tx - e.x), sp = e.d.speed * 0.45 * dt, ox = e.x, oy = e.y; tryMove(e, Math.cos(a) * sp, Math.sin(a) * sp, 0.28); e.mvx = e.x - ox; e.mvy = e.y - oy; e.state = 'move'; if (Math.hypot(e.mvx, e.mvy) < sp * 0.2) e.patrol.leg = !e.patrol.leg; }
  }
  if (dist < 3.5 && (e.breathT || 0) < tmr) { e.breathT = tmr + rnd(4, 8); play(e.d.growl, 0.15, rnd(0.7, 0.9), { x: e.x, y: e.y }); } // nära: man hör dem andas
}
function noise(r, cause) { // ljud som fiender kan höra (fotsteg, spring, explosioner)
  for (const e of ents) if (!e.dead && !e.alert && !e.dormant && pathDist(e) < (e.sleep ? r * 0.5 : r)) { if (e.sleep && cause !== 'boom') continue; e.sleep = false; alertEnemy(e, false); }
}
function alertEnemy(e, spread) {
  if (e.dead) return;
  if (!e.alert && e.d.tip && run) { // första mötet med en ny sorts fiende i rundan
    run.seen = run.seen || [];
    if (!run.seen.includes(e.type)) { run.seen.push(e.type); say(`${e.d.name}: ${e.d.tip}`, 4); }
  }
  if (!e.alert && e.type === 'É' && !e.howled) { e.howled = true; play('icewolf', 0.8, rnd(0.9, 1.1), { x: e.x, y: e.y }); for (const o of ents) if (o.type === 'É' && !o.dead && Math.hypot(o.x - e.x, o.y - e.y) < 15) { o.howled = true; if (!o.alert) { o.alert = true; o.spotT = 0.9; } } } // ylet kallar flocken
  if (!e.alert) { e.alert = true; e.spotT = 0.9; e.cd = Math.max(e.cd, rnd(0.35, 0.8)); if (Math.random() < 0.7) play(e.d.growl, 0.5, rnd(0.9, 1.1), { x: e.x, y: e.y }); }
  if (spread) for (const o of ents) if (o !== e && !o.dead && !o.alert && Math.hypot(o.x - e.x, o.y - e.y) < 6 && hasLOS(o.x, o.y, e.x, e.y)) alertEnemy(o, false);
}
// UI-lägen: släpp musen, pausa världen, återgå när UI stängs
function openUI(fn) {
  state = 'ui'; mouseDown = false; aimDown = false; for (const k in keys) keys[k] = false;
  if (document.pointerLockElement) document.exitPointerLock();
  fn();
}
function closeUI(next = 'play') { state = next; if (next === 'play') lockPointer(); }
function draftUI(cards, opts, cb) { // kortval med synergi, NY-märken, förvisning (en gång per våning) och nya kort för guld
  profile.cardsSeen = profile.cardsSeen || [];
  const seen = new Set(profile.cardsSeen), n = cards.length, luck = opts.luck;
  const mark = cs => { for (const c of cs) if (c && !profile.cardsSeen.includes(c.id)) profile.cardsSeen.push(c.id); saveProfile(); };
  mark(cards);
  if (run.cmode === 'nocards') { const g = 25 + run.depth * 3; run.gold += g; say(`INGA KORT: +${g} GULD I STÄLLET`, 2); play('coin', 0.7); setTimeout(() => cb(null), 0); return; } // utmaningsläget
  const o = Object.assign({ owned: run.owned.slice(), seen, ownedCount: ownedCount() }, opts);
  if (run.banishFloor !== run.depth) o.banish = card => { run.banished = run.banished || []; run.banished.push(card.id); run.banishFloor = run.depth; const r = drawCards(1, { luck })[0] || null; if (r) mark([r]); return r; };
  const price = () => (run.freeRerolls || 0) > 0 ? 0 : 15 + 10 * (run.draftRerolls || 0);
  o.reroll = { price, gold: run.gold, onReroll: () => { const pr = price(); if (run.gold < pr) return null; if (pr === 0) run.freeRerolls--; else { run.gold -= pr; run.draftRerolls = (run.draftRerolls || 0) + 1; } const cs = drawCards(n - Math.round(mod('cardChoices')), { luck }); mark(cs); return { cards: cs, gold: run.gold }; } };
  return CardUI.draft(cards, o, cb);
}
function drawCards(n, opt = {}) { return Cards.draw(run.cardRng, n + Math.round(mod('cardChoices')), { owned: run.owned.concat(...(run.banished || []).map(id => Array(9).fill(id))), depth: run.depth, luck: mod('luck') + (opt.luck || 0), unlocked: new Set(profile.unlocked), pact: run.pact }); }
function gainCard(card) {
  cardGained(card);
  if (!card) return;
  noteCardPick(card);
  run.owned.push(card.id); recomputeMods(); play('card', 0.8);
  if (card.pact) swearPact(card.pact);
  if (P.hp > maxHp()) P.hp = maxHp();
  P.shield = Math.min(P.shield, mod('shield'));
}
const pactAmmo = () => WEAPONS.find(w => w.id === run.pact).ammo;
function swearPact(id) { // vapenpakt: bara ett vapen resten av rundan, men det kan få unika uppgraderingar
  run.pact = id;
  const i = WEAPONS.findIndex(w => w.id === id), wp = WEAPONS[i];
  if (!P.has[i]) { P.has[i] = true; P.mags[i] = effMag(i); }
  P.ammo[wp.ammo] = Math.min(AMMO[wp.ammo].max, P.ammo[wp.ammo] + ({ p9: 40, r556: 40, shells: 12, bolts: 14, flares: 8, fuel: 120, lgren: 10, nails: 100, arrows: 15 }[wp.ammo] || 0));
  for (let k = 0; k < WEAPONS.length; k++) if (k !== i) P.has[k] = false;
  if (P.weapon !== i) { P.weapon = i; WS.state = 'draw'; WS.t = 0; WS.next = -1; }
  say('DU HAR SVURIT DIG TILL ' + wp.name, 3); play('secret', 0.7, 0.7);
}
function openChest(c) {
  if (c.locked) { if (P.keys > 0) { P.keys--; stat('unlocks'); c.locked = false; play('unlock', 0.9); c.rare = true; } else { say('KISTAN ÄR LÅST – DU BEHÖVER EN NYCKEL', 2); play('click', 0.6, 0.6); return; } }
  c.open = true; c.t = 0; play('chest', 0.8); itemsTaken++; score += 100;
  for (let i = 0; i < 3; i++) dropItem('gold', c.x, c.y);
  if (Math.random() < 0.2 + mod('potionChance')) dropItem('potion', c.x, c.y); // ibland en dryck
  if (c.cursed && Math.random() < 0.5) { // förbannad kista: en fälla
    say('KISTAN VAR FÖRBANNAD!', 2); play('bossroar', 0.6, 1.6);
    for (let i = 0; i < 3; i++) { const a = i / 3 * TAU, x = c.x + Math.cos(a) * 1.6, y = c.y + Math.sin(a) * 1.6; if (!solid(x, y)) { const e = makeEnemy(run.depth >= 3 ? 'V' : 'S', x, y); e.alert = true; e.minion = true; ents.push(e); totalEnemies++; spawnPuff(x, y, 6); } }
  }
  const n = 3 + Math.round(mod('chestChoice')) + (c.cursed ? 1 : 0);
  openUI(() => draftUI(drawCards(n, { luck: 0.5 + run.depth * 0.06 + (c.rare ? 0.8 : 0) + (c.cursed ? 0.6 : 0) }), { title: c.rare ? 'DEN GLITTRANDE KISTAN' : c.cursed ? 'DEN FÖRBANNADE KISTAN' : 'KISTAN', subtitle: 'VÄLJ ETT KORT', skipLabel: 'TA INGET' }, card => { gainCard(card); closeUI(); }));
}
function shopItems(m) {
  if (!m.stock) {
    const unhurt = lvlStat.taken === 0 && levelTime > 10; // oskadd: köpmannen ger rabatt
    const disc = clamp(mod('shopDiscount') - (asc() >= 2 ? 0.2 : 0) + (unhurt ? 0.15 : 0) + (m.shadow ? 0.25 : 0), -0.3, 0.8);
    if (unhurt) setTimeout(() => say('KÖPMANNEN: "OSKADD? IMPONERANDE. 15 % RABATT."', 3), 200);
    const cards = drawCards(3).map(card => ({ kind: 'card', card, price: Cards.price(card, run.depth, disc) }));
    m.stock = cards.concat([
      { kind: 'health', label: '+40 HÄLSA', price: Math.round(30 * (1 - disc)) },
      { kind: 'armor', label: '+50 RUSTNING', price: Math.round(40 * (1 - disc)) },
      { kind: 'ammo', label: 'AMMUNITION', price: Math.round(25 * (1 - disc)) },
      { kind: 'reroll', label: 'NYA KORT', price: (run.freeRerolls || 0) > 0 ? 0 : 15 + 10 * run.rerolls },
      { kind: 'purge', label: 'RENSA ETT KORT', text: 'TA BORT ETT KORT UR LEKEN', price: Math.round((50 + 15 * run.depth) * (1 - disc)) },
      { kind: 'rune', label: 'RUNSTEN', text: 'EN SLUMPAD RUNA ATT FÄSTA I ETT VAPEN', price: Math.round(70 * (1 - disc)) },
      { kind: 'potion', act: 'potion', pot: 'heal', color: '#e04848', label: 'LÄKEDRYCK', text: '+50 HÄLSA NÄR DU DRICKER DEN (H)', price: Math.round(35 * (1 - disc)) },
      ...(isBossDepth(run.depth + 1) ? [] : [{ kind: 'map', label: 'KARTOGRAFENS KARTA', text: 'HELA NÄSTA VÅNING SYNS PÅ KARTAN', price: Math.round(30 * (1 - disc)) }]),
      ...((run.depth >= 3 || m.shadow || (run.seed + run.depth) % 3 === 0) && !run.pact && run.cmode !== 'pistol' && WEAPONS.some((w, i) => !P.has[i]) ? [(() => { const miss = WEAPONS.map((w, i) => i).filter(i => !P.has[i]), i = miss[(run.depth * 7) % miss.length]; return { kind: 'weapon', label: WEAPONS[i].name, text: 'ETT NYTT VAPEN', price: Math.round(120 * (1 - disc)), wid: WEAPONS[i].id }; })()] : []),
      { kind: 'grenade', label: 'GRANAT', text: '+1 GRANAT', price: Math.round(25 * (1 - disc)) },
      { kind: 'gamble', label: 'TÄRNINGSSPEL', text: 'SATSA 30 GULD: HÄLFTEN AV GÅNGERNA FÅR DU 70', price: 30 },
      { kind: 'mystery', label: 'MYSTERIEKORT', text: 'ETT OKÄNT KORT, MINST SÄLLSYNT', price: Math.round(90 * (1 - disc)) },
    ]);
  }
  // efter en pakt: inga andra pakter och bara uppgraderingar för det egna vapnet
  m.stock = m.stock.filter(s => s.kind !== 'card' || (!(run.pact && s.card.pact) && (!s.card.weapon || s.card.weapon === run.pact)));
  if (run.cmode === 'nocards') m.stock = m.stock.filter(s => s.kind !== 'card' && s.kind !== 'mystery' && s.kind !== 'purge');
  return m.stock;
}
function openShop(m) {
  openUI(() => CardUI.shop(shopItems(m), run.gold, item => {
    if (run.gold < item.price) return { ok: false, gold: run.gold };
    if (item.kind === 'health' && P.hp >= maxHp()) { say('DU ÄR REDAN FRISK', 1.2); return { ok: false, gold: run.gold }; }
    run.gold -= item.price; play('buy', 0.8);
    if (item.kind === 'card') { gainCard(item.card); m.stock = m.stock.filter(s => s !== item); if (item.card.pact) return { ok: true, gold: run.gold, items: shopItems(m) }; }
    else if (item.kind === 'health') heal(40 * (1 + mod('healMul')));
    else if (item.kind === 'armor') P.armor = Math.min(200, P.armor + 50);
    else if (item.kind === 'ammo') pickUp({ type: 'ammo' }, true);
    else if (item.kind === 'potion') { if (!givePotion(item.pot, false, true)) { run.gold += item.price; return { ok: false, gold: run.gold, msg: 'DRYCKESPLATSERNA ÄR FULLA' }; } }
    else if (item.kind === 'rune') { m.stock = m.stock.filter(s => s !== item); setTimeout(() => { closeUI(); giveRune(RUNE_IDS[(Math.random() * RUNE_IDS.length) | 0], 'DU KÖPTE'); }, 50); return { ok: true, gold: run.gold }; }
    else if (item.kind === 'map') { run.nextMap = true; play('map_unroll', 0.8); m.stock = m.stock.filter(s => s !== item); return { ok: true, gold: run.gold, items: shopItems(m), msg: 'KARTAN VISAR NÄSTA VÅNING' }; }
    else if (item.kind === 'weapon') { pickUp({ type: item.wid, x: P.x, y: P.y }, true); m.stock = m.stock.filter(s => s !== item); return { ok: true, gold: run.gold, items: shopItems(m) }; }
    else if (item.kind === 'grenade') { if (P.grenades >= GREN_MAX()) { run.gold += item.price; return { ok: false, gold: run.gold, msg: 'DU KAN INTE BÄRA FLER' }; } P.grenades++; play('pickup', 0.7, 0.8); }
    else if (item.kind === 'gamble') { // dödgrävaren spelar tärning
      play('click', 0.6, 0.8); setTimeout(() => play('click', 0.6, 1.1), 150);
      if (Math.random() < 0.5) { run.gold += 70; play('coin', 0.9, 0.8); return { ok: true, gold: run.gold, msg: 'TÄRNINGARNA VISAR SEXOR: +70 GULD' }; }
      return { ok: true, gold: run.gold, msg: 'ETTOR. DÖDGRÄVAREN FLINAR.' };
    }
    else if (item.kind === 'mystery') { // ett sällsynt eller legendariskt kort, okänt tills det köps
      const pool = drawCards(8, { luck: 2 }).filter(c => c.rarity === 'sallsynt' || c.rarity === 'legendarisk'); const c = pool[0] || drawCards(1, { luck: 2 })[0];
      if (c) { gainCard(c); CardUI.toast(c, 'MYSTERIEKORTET'); } m.stock = m.stock.filter(s => s !== item); return { ok: true, gold: run.gold, items: shopItems(m) };
    } else if (item.kind === 'purge') {
      m.stock = m.stock.filter(s => s !== item);
      setTimeout(() => { const own = [...new Set(run.owned)].map(id => Cards.byId(id)).filter(c => c && !c.pact);
        if (!own.length) { closeUI(); return; }
        CardUI.draft(own, { title: 'RENSA ETT KORT', subtitle: 'VALT KORT FÖRSVINNER UR LEKEN', skipLabel: 'ÅNGRA (PENGARNA TILLBAKA)' }, c => { if (c) { run.owned.splice(run.owned.indexOf(c.id), 1); recomputeMods(); say(c.name + ' ÄR BORTA', 2); } else run.gold += item.price; closeUI(); }); }, 50);
      return { ok: true, gold: run.gold };
    }
    else if (item.kind === 'reroll') { if (item.price === 0) run.freeRerolls--; else run.rerolls++; m.stock = null; return { ok: true, gold: run.gold, items: shopItems(m) }; }
    return { ok: true, gold: run.gold };
  }, () => closeUI(), { title: m.shadow ? 'SKUGGHANDLAREN' : 'DÖDGRÄVARENS BOD', currency: 'GULD' }));
}

// ---------- Vägsökning: avståndsfält (BFS) från spelaren ----------
function walkableForEnemy(x, y) { const c = map[y][x]; return !isWallChar(c) && c !== 'f' && c !== 'M' && c !== '·' && c !== '¬' && !isPropChar(c) && c !== '*' && c !== '_' && !(hazGrid && hazGrid[y * mw + x])
  && !((c === 'G' || c === '|' || c === ']') && doors[x + ',' + y].open < 0.85); } // fiender undviker lava och fällor
function updateFlow() {
  const pc = (P.y | 0) * mw + (P.x | 0);
  if (pc === flowCell) return;
  flowCell = pc; flow.fill(-1);
  const q = [pc]; flow[pc] = 0;
  for (let h = 0; h < q.length; h++) {
    const c = q[h], x = c % mw, y = (c / mw) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= mw || ny >= mh) continue;
      const n = ny * mw + nx; if (flow[n] >= 0 || !walkableForEnemy(nx, ny)) continue;
      flow[n] = flow[c] + 1; q.push(n);
    }
  }
}
const pathDist = e => { const v = flow[(e.y | 0) * mw + (e.x | 0)]; return v < 0 ? 999 : v; };

// ---------- Uppdatering ----------
function ripple(x, y) { for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; particles.push({ x: x + Math.cos(a) * 0.15, y: y + Math.sin(a) * 0.15, z: 0.01, vx: Math.cos(a) * 0.8, vy: Math.sin(a) * 0.8, vz: 0, life: 0.5, maxLife: 0.5, img: fx.hit[1], size: 0.03, add: true, tint: [180, 210, 240], fade: true }); } } // vattenringar
function stepSound() { // fotsteg låter olika på gräs, grus, trä och sten
  const ch = cellUnder(); if (ch === '-') { ripple(P.x, P.y); return ['splash', 0.25, rnd(1.1, 1.4)]; }
  const fln = (lvl.floors || [lvl.floor])[cellFloor ? cellFloor[(P.y | 0) * mw + (P.x | 0)] : 0] || '';
  if (/snow/.test(fln)) { if (fx.parts.footprint) { decals.push({ x: P.x + rnd(-0.08, 0.08), y: P.y + rnd(-0.08, 0.08), img: fx.parts.footprint[0], size: 0.04, life: 25 }); if (decals.length > 70) decals.shift(); } return ['snow_step', 0.3, rnd(0.9, 1.1)]; } // fotspår i snön if (ch === ':') return ['step_gravel', 0.12, 1.6];
  const n = (lvl.floors || [lvl.floor])[cellFloor ? cellFloor[(P.y | 0) * mw + (P.x | 0)] : 0] || '';
  if (/grass/.test(n)) return ['step_grass', 0.22, 1];
  if (/gravel|dirt|mud|cave/.test(n)) return ['step_gravel', 0.16, 1];
  if (/wood/.test(n)) return ['step_wood', 0.2, 1];
  return ['steps', 0.1, 1.65];
}
function update(dt) {
  tmr += dt;
  for (const m of msgs) m.t -= dt;
  while (msgs.length && msgs[msgs.length - 1].t <= 0) msgs.pop();
  P.hurt = Math.max(0, P.hurt - dt); P.pick = Math.max(0, P.pick - dt * 2); P.flash = Math.max(0, P.flash - dt); P.shake = Math.max(0, P.shake - dt * 3);
  // rekyl återhämtar sig mot ursprungligt sikte
  P.pitch -= P.pitch * Math.min(1, dt * 9); const ry = P.ryaw * Math.min(1, dt * 5); P.a -= ry; P.ryaw -= ry;
  P.burstT -= dt; if (P.burstT <= 0) P.burst = 0;
  hitMark = Math.max(0, hitMark - dt); bossBanner = Math.max(0, bossBanner - dt); levelBanner = Math.max(0, levelBanner - dt);
  for (const h of hurtDir) h.t -= dt * 1.2;
  hurtDir = hurtDir.filter(h => h.t > 0);
  for (const n of numbers) { n.t -= dt; n.z += dt * 0.6; }
  while (numbers.length && numbers[0].t <= 0) numbers.shift();
  for (const c of chests) if (c.open) c.t += dt;
  updateParticles(dt);
  for (const f of flashes) f.t -= dt; while (flashes.length && flashes[0].t <= 0) flashes.shift();
  P.boom = Math.max(0, P.boom - dt);
  if (map && state === 'play') updateWeather(dt);
  if (state === 'dead' || state === 'runover') { P.deadT += dt; P.camZ = Math.max(0.12, 0.5 - P.deadT * 0.8); return; }
  if (state !== 'play') return;
  levelTime += dt; run.time += dt;
  if (mod('regen') > 0) heal(mod('regen') * dt, true);
  P.shieldT -= dt; if (P.shieldT <= 0 && P.shield < mod('shield')) P.shield = Math.min(mod('shield'), P.shield + dt * 10);
  P.haste = Math.max(0, P.haste - dt);
  const turn = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
  P.a += turn * 2.4 * dt * (1 - WS.aim * 0.4);
  // mjuk rörelse med acceleration och friktion
  let fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  let str = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  if (touch.active) { // mobil: analog joystick och dra-för-att-vrida
    fwd -= touch.my; str += touch.mx; if (autoWalk && settings.oneHand && !touch.mag) fwd += 1; // enhandsläget: gå framåt
    const overEnemy = ents.some(e => !e.dead && Math.abs(Math.atan2(Math.sin(Math.atan2(e.y - P.y, e.x - P.x) - P.a), Math.cos(Math.atan2(e.y - P.y, e.x - P.x) - P.a))) < Math.max(0.03, 0.3 / Math.hypot(e.x - P.x, e.y - P.y)));
    P.a += touch.look * 0.011 * settings.sens * (1 - WS.aim * 0.35) * (overEnemy ? 0.55 : 1);
    WS.swayX = clamp(WS.swayX + touch.look * 0.25, -10, 10); WS.swayY = clamp(WS.swayY + touch.lookY * 0.15, -6, 6);
    touch.look = 0; touch.lookY = 0;
  }
  if (bossIntro > 0 && boss) { bossIntro -= dt; let da = Math.atan2(boss.y - P.y, boss.x - P.x) - P.a; da = Math.atan2(Math.sin(da), Math.cos(da)); P.a += da * Math.min(1, dt * 4); fwd = 0; str = 0; if (mouseDown || keys.Space) bossIntro = 0; } // bossintro: kameran vänder sig mot bossen
  if (P.confT > 0) { P.confT -= dt; P.a += Math.sin(tmr * 3.1) * dt * 0.9; str += Math.sin(tmr * 2.3) * 0.35; } // bansheens skrik: du tappar fotfästet
  updateMovement(dt, fwd, str);
  if (Math.hypot(P.vx, P.vy) > 1) { // gå in i en stängd dörr så öppnas den
    const nx = P.x + P.vx / Math.hypot(P.vx, P.vy) * 0.45, ny = P.y + P.vy / Math.hypot(P.vx, P.vy) * 0.45, d = doorAt(nx, ny);
    if (d && !d.secret && !d.gate && d.target === 0 && cellAt(nx, ny) === 'D') { d.target = 1; play('door', 0.6, 1, { x: d.x + 0.5, y: d.y + 0.5 }); }
  }
  for (const e of ents) if (!e.dead && !e.dying) pushOut(P, e.x, e.y, e.boss ? 1.1 : 0.55);
  for (const pt of pots) if (!pt.broken) pushOut(P, pt.x, pt.y, 0.45);
  for (const c of chests) pushOut(P, c.x, c.y, 0.5);
  const speed = Math.hypot(P.vx, P.vy);
  P.bobAmp += (clamp(speed / 3.1, 0, 1.4) - P.bobAmp) * Math.min(1, dt * 8);
  P.bob += dt * (4 + speed * 2.2);
  if (speed > 0.8 && onGround()) { stepT -= dt * speed / 3.1; if (stepT <= 0) { const st = stepSound(); play(st[0], st[1] * (P.crouch > 0.5 ? 0.4 : 1), rnd(0.9, 1.1) * st[2]); stepT = 0.42; if (P.crouch < 0.5) noise(speed > 4 ? 5 : 1.8); } } // springande fotsteg hörs
  for (const key in doors) { const d = doors[key]; if (d.target === 0 && d.open > 0 && occupied(d)) d.target = 1; d.open += Math.sign(d.target - d.open) * Math.min(Math.abs(d.target - d.open), dt * (d.secret ? 0.6 : 1.4)); }
  updateFlow();
  updateWeapon(dt);
  // föremål (guld dras till spelaren, magnetkort gäller allt)
  const reach = 0.55, mag = mod('magnet');
  for (const it of items) {
    if (it.taken) continue;
    if (!settings.lowfx && Math.random() < dt * 0.6 && Math.hypot(it.x - P.x, it.y - P.y) < 8) particles.push({ x: it.x + rnd(-0.1, 0.1), y: it.y + rnd(-0.1, 0.1), z: rnd(0.05, 0.3), vx: 0, vy: 0, vz: 0, life: 0.3, maxLife: 0.3, img: fx.hit[1], size: 0.04, add: true, tint: [255, 250, 200], fade: true }); // glänser
    if (it.hop > 0) { it.hop -= dt; const ox = it.x, oy = it.y; it.x += it.hvx * dt; it.y += it.hvy * dt; if (solid(it.x, it.y)) { it.x = ox; it.y = oy; } }
    const d = Math.hypot(it.x - P.x, it.y - P.y);
    const pull = (it.type === 'gold' || it.type === 'goldpile' ? 1.2 : 0) + mag;
    if (pull > 0 && d < pull + reach && d > 0.05) { it.x += (P.x - it.x) / d * dt * 4; it.y += (P.y - it.y) / d * dt * 4; }
    if (d > reach) continue;
    if (!pickUp(it)) continue;
    it.taken = true; P.pick = it.type.startsWith('gold') ? 0.3 : 1; score += 25; if (!it.drop) itemsTaken++;
  }
  hint = '';
  for (const pr of props) if (pr.def && pr.def.use && !(pr.used && pr.def.use !== 'anvil') && Math.hypot(pr.x - P.x, pr.y - P.y) < 1.3) hint = (isTouch() ? 'HANDEN: ' : 'E: ') + (pr.poisoned ? 'DRICK – VATTNET ÄR GRÖNT...' : USE_NAME[pr.def.use]);
  for (const c of chests) if (!c.open && Math.hypot(c.x - P.x, c.y - P.y) < 1.2) hint = isTouch() ? 'HANDEN: ÖPPNA KISTAN' : 'E: ÖPPNA KISTAN';
  for (const m of merchants) if (Math.hypot(m.x - P.x, m.y - P.y) < 1.6 && shadowVisible(m)) hint = isTouch() ? 'HANDEN: HANDLA' : 'E: HANDLA';
  if (lvl.exit && Math.floor(P.x) === lvl.exit.x && Math.floor(P.y) === lvl.exit.y) { floorDone(); return; }
  const edt = slowBubble > 0 ? dt * 0.35 : dt; // tidsbubblan
  for (const e of ents) try { if (e.boss) updateBoss(e, edt); else updateEnemy(e, edt); } catch (err) { spriteError(err, { o: e }); if (e.renderFail > 30 && !e.boss) { e.dead = true; e.gibbed = true; } } // en trasig fiende får inte stoppa spelet
  updateProjectiles(edt); updateFuses(dt); updatePortals(dt); updateHazards(dt); updateProps(dt); updateGroundFires(dt); updateBossFx(dt); updateWorldEvents(dt); updateSpores(dt); updateIcicles(dt);
  updatePet(dt); updateAllies(dt); updatePotions(dt); updateNpcTalk(dt); updateTorchFx(dt); updateHeat(dt); updateAbility(dt); questTick();
  if (run.cmode === 'onehit') P.armor = 0;
  for (let i = decals.length - 1; i >= 0; i--) if (decals[i].life !== undefined && (decals[i].life -= dt) <= 0) decals.splice(i, 1);
  if (P.comboT > 0) { P.comboT -= dt; if (P.comboT <= 0 && P.combo >= 3) say(`KOMBO x${P.combo}`, 1.5); }
  if (P.slowT > 0) P.slowT -= dt;
  updateAudioMood(dt);
  if (P.poisonT > 0) { P.poisonT -= dt; P.poisonAcc = (P.poisonAcc || 0) + dt; if (P.poisonAcc > 0.7) { P.poisonAcc = 0; if (P.hp > 5) { P.hp -= 2; P.hurt = 0.15; } } }
  if (P.hp < maxHp() * 0.3 && !breathSnd && actx) breathSnd = play('breath', 0.35, 1, { loop: true });
  if (P.hp < maxHp() * 0.3) { heartT -= dt; if (heartT <= 0) { heartT = 0.55 + P.hp / maxHp() * 1.5; play('heart', 0.55); } } // hjärtat bultar snabbare ju närmare döden
  if (P.hp >= maxHp() * 0.3 && breathSnd) { breathSnd.s.stop(); breathSnd = null; }
}
// ---------- Rörelse: spring, hopp, ducka, glid, rusning och uthållighet ----------
const STAM_MAX = () => 1 + mod('stamina') + meta('stamina') * 0.15;
const cellUnder = () => cellAt(P.x, P.y);
const onGround = () => P.jz <= 0.001;
function wantRun() { return (settings.toggleRun ? runToggled : (keys.ShiftLeft || keys.ShiftRight)) || touch.mag > 0.95 || gp.run || touch.run; }
let runToggled = false;
// ---------- Handkontroll (Gamepad API) ----------
const gp = { prev: [], look: 0, active: false, crouch: false, run: false };
function pollGamepad(dt) {
  let pads = []; try { pads = navigator.getGamepads ? navigator.getGamepads() || [] : []; } catch (e) { pads = []; } // kan nekas i inbäddade sidor
  const g = [...pads].find(p => p && p.connected);
  if (!g) { if (gp.active && gp.fire) { mouseDown = false; gp.fire = false; } gp.active = false; return { f: 0, s: 0 }; }
  const dz = v => Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85, b = i => !!(g.buttons[i] && g.buttons[i].pressed), edge = i => b(i) && !gp.prev[i];
  const lx = dz(g.axes[0] || 0), ly = dz(g.axes[1] || 0), rx = dz(g.axes[2] || 0), ry = dz(g.axes[3] || 0);
  if (lx || ly || rx || b(7)) gp.active = true;
  if (state === 'play') {
    P.a += rx * Math.abs(rx) * 3.2 * dt * settings.sens * (1 - WS.aim * 0.45); P.pitch = clamp(P.pitch, -20, 20);
    const fire = (g.buttons[7] && g.buttons[7].value > 0.4) || false; if (fire !== !!gp.fire) { mouseDown = fire; gp.fire = fire; }
    aimDown = (g.buttons[6] && g.buttons[6].value > 0.4) || (aimDown && !gp.active);
    if (edge(0)) jump(); if (edge(2)) useKey(); if (edge(3) || edge(15)) cycleWeapon(1); if (edge(14)) cycleWeapon(-1); if (edge(4)) dash(0, 0); if (edge(12)) reloadKey(); if (edge(13)) { if (P.potions && P.potions.length) drinkPotion(); else inspect(); } if (edge(11)) kick(); if (edge(10)) useAbility();
    if (edge(5)) grenadeStart(); if (!b(5) && gp.prev[5]) grenadeThrow();
    if (edge(8)) { showMap = (showMap + 1) % 3; settings.map = showMap; saveSettings(); }
    gp.crouch = b(1); gp.run = b(10) || Math.hypot(lx, ly) > 0.95;
    if (edge(9)) pause();
  } else if (state === 'pause' && edge(9)) resume();
  else if (state === 'stats' && (edge(0) || edge(9))) nextFloor();
  else if ((state === 'dead' || state === 'runover') && (edge(0) || edge(9))) leaveRunScreen();
  gp.prev = g.buttons.map(x => x.pressed); gp.pad = g;
  return state === 'play' ? { f: -ly, s: lx } : { f: 0, s: 0 };
}
function rumble(strong, ms) { try { const g = gp.pad; if (settings.vibrate !== false && g && g.vibrationActuator) g.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: strong * 0.6 }); } catch (e) { /* ingen vibration */ } }
let gyroLast = null;
function onGyro(ev) { // gyro-sikte: vrid telefonen för att sikta
  if (!settings.gyro || state !== 'play' || ev.alpha == null) { gyroLast = null; return; }
  const land = Math.abs(window.orientation || (screen.orientation && screen.orientation.angle) || 0) === 90, v = land ? ev.beta : ev.gamma;
  if (gyroLast !== null) { let d = v - gyroLast; if (Math.abs(d) < 20) P.a += d * Math.PI / 180 * 1.2 * settings.sens * (land && (window.orientation === -90 || (screen.orientation && screen.orientation.angle === 270)) ? -1 : 1); }
  gyroLast = v;
}
addEventListener('deviceorientation', onGyro);
function enableGyro() { // iOS kräver att man ger tillåtelse vid en knapptryckning
  try { if (window.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission) DeviceOrientationEvent.requestPermission().then(r => { if (r !== 'granted') { settings.gyro = false; saveSettings(); } }).catch(() => {}); } catch (e) { /* stöds inte */ }
}
function aimAssist(dt) { // siktstöd för pekskärm och handkontroll: dras mjukt mot en fiende nära siktet
  if (settings.aimAssist === false || !(gp.active || touch.active)) return;
  let best = null, bo = 0.09;
  for (const e of ents) { if (e.dead || e.dormant || e.hidden) continue; const d = Math.hypot(e.x - P.x, e.y - P.y); if (d > 14) continue; let off = Math.atan2(e.y - P.y, e.x - P.x) - P.a; off = Math.atan2(Math.sin(off), Math.cos(off)); if (Math.abs(off) < bo && hasLOS(P.x, P.y, e.x, e.y)) { bo = Math.abs(off); best = off; } }
  if (best !== null) P.a += best * Math.min(1, dt * 2.5);
  touch.autoFire = !!(settings.autoFire && touch.active && best !== null && Math.abs(best) < 0.03);
}
function updateMovement(dt, fwd, str) {
  const pad = pollGamepad(dt); fwd += pad.f; str += pad.s; aimAssist(dt);
  const c = cellUnder(), ground = onGround(), immune = mod('hazardImmune') > 0;
  const crouchKey = keys.ControlLeft || keys.ControlRight || touch.crouch || gp.crouch;
  // uthållighet: spring och rusning tar, vila ger tillbaka
  let running = wantRun() && WS.aim < 0.5 && P.stam > 0.02 && !P.crouchLock && (Math.abs(fwd) + Math.abs(str) > 0.1);
  if (running) { P.stam = Math.max(0, P.stam - dt * 0.16); P.stamT = 0.9; if (P.stam <= 0.02) { play('stamina_out', 0.5); say('ANDFÅDD', 0.8); } }
  else { P.stamT -= dt; if (P.stamT <= 0) P.stam = Math.min(STAM_MAX(), P.stam + dt * 0.32); }
  // ducka och glid
  if (crouchKey && running && Math.hypot(P.vx, P.vy) > 3.6 && ground && P.slide <= 0 && !P.wasCrouch) { P.slide = 0.55; P.vx *= 1.25; P.vy *= 1.25; play('slide', 0.5, 1, {}); }
  P.wasCrouch = !!crouchKey;
  P.crouch += ((crouchKey || P.slide > 0 ? 1 : 0) - P.crouch) * Math.min(1, dt * 12);
  if (P.slide > 0) { P.slide -= dt; running = false; }
  // fart: vatten, lera, nät och is
  const fl = lvl.floors ? lvl.floors[cellFloor ? cellFloor[(P.y | 0) * mw + (P.x | 0)] : 0] || '' : '';
  let terrain = 1;
  if (!immune && ground) { if (c === '-') terrain = 0.62; else if (c === '"') terrain = 0.42; else if (/mud|swamp/.test(fl)) terrain = 0.85; }
  if (c === '"' && !immune) { P.webT = (P.webT || 0) + dt; if (P.webT > 0.4) { P.webT = 0; play('web', 0.35, rnd(0.9, 1.1)); } }
  const maxSp = (running ? 4.7 : 3.1) * (1 - WS.aim * 0.4) * (1 + mod('moveSpeed')) * (P.haste > 0 ? 1.35 : 1) * (P.speedT > 0 ? 1.4 : 1) * (P.slowT > 0 ? 0.55 : 1) * (P.crouch > 0.5 && P.slide <= 0 ? 0.55 : 1) * terrain;
  let tx = 0, ty = 0;
  if (Math.abs(fwd) + Math.abs(str) > 0.05) { const l = Math.hypot(fwd, str), sp = Math.min(1, l) / l * maxSp; tx = (Math.cos(P.a) * fwd - Math.sin(P.a) * str) * sp; ty = (Math.sin(P.a) * fwd + Math.cos(P.a) * str) * sp; }
  let k = Math.min(1, dt * (tx || ty ? 10 : 12));
  if (c === ':' && ground && !immune) k *= 0.12; // is: halt
  if (P.slide > 0) k *= 0.08; // glidning: farten håller i sig
  if (!ground) k *= 0.35; // i luften styr man sämre
  if (P.dashT > 0) { P.dashT -= dt; k = 0; dashHits(); }
  P.vx += (tx - P.vx) * k; P.vy += (ty - P.vy) * k;
  tryMove(P, P.vx * dt, P.vy * dt, 0.24);
  P.dashCd = Math.max(0, P.dashCd - dt);
  // hopp och fall
  if (!ground || P.jv > 0) {
    P.jz += P.jv * dt; P.jv -= 9.5 * dt;
    if (P.jz <= 0) {
      P.jz = 0; P.dj = false;
      if (P.jv < -2.2) { play('land', 0.5, rnd(0.9, 1.1)); P.shake = Math.max(P.shake, 0.35); P.landT = 0.18; if (c === '-') play('splash', 0.5);
        if (!settings.lowfx) for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; particles.push({ x: P.x + Math.cos(a) * 0.2, y: P.y + Math.sin(a) * 0.2, z: 0.03, vx: Math.cos(a) * 1.2, vy: Math.sin(a) * 1.2, vz: 0.2, life: 0.5, maxLife: 0.5, img: fx.parts.dust ? fx.parts.dust[0] : fx.hit[1], size: 0.1, fade: true, tint: lvl.biome === 'frost' ? [240, 245, 255] : [170, 150, 120] }); } } // damm när du landar
      P.jv = 0;
    }
  }
  P.landT = Math.max(0, P.landT - dt);
  // kamerahöjd, lutning och synfält
  P.camZ = 0.5 + P.jz * 0.55 - P.crouch * 0.17 - Math.sin(P.landT / 0.18 * Math.PI) * 0.04;
  const side = (-Math.sin(P.a) * P.vx + Math.cos(P.a) * P.vy) / 4.7;
  P.roll += ((settings.tilt === false ? 0 : side * 0.035) - P.roll) * Math.min(1, dt * 8);
  P.runK += ((running && Math.hypot(P.vx, P.vy) > 3.4 ? 1 : 0) - P.runK) * Math.min(1, dt * 6);
}
function jump() {
  if (state !== 'play') return;
  if (onGround()) { if (P.stam < 0.1) return; stat('jumps'); P.jv = 3.4; P.jz = 0.001; P.stam = Math.max(0, P.stam - 0.12); P.stamT = 0.9; play('jump', 0.4, rnd(0.95, 1.05)); P.crouch = 0; return; }
  if (mod('doubleJump') > 0 && !P.dj) { P.dj = true; P.jv = 3.0; play('jump', 0.45, 1.25); spawnPuff(P.x, P.y, 4); }
}
function dash(dx, dy) { // rusning: snabbt utfall med kort osårbarhet
  if (state !== 'play' || P.dashCd > 0 || P.stam < 0.3) return;
  if (!dx && !dy) { dx = Math.cos(P.a); dy = Math.sin(P.a); }
  const l = Math.hypot(dx, dy); dx /= l; dy /= l;
  P.vx = dx * 11; P.vy = dy * 11; P.dashT = 0.17; P.iframe = Math.max(P.iframe, 0.22); P.stam -= 0.3; P.stamT = 0.9;
  P.dashCd = 0.9 * Math.max(0.3, 1 - mod('dashCd')); P.dashHit = new Set(); stat('dashes');
  play('dash', 0.6, rnd(0.95, 1.05)); WS.punch = Math.max(WS.punch, 0.05);
}
function dashHits() { // rusa igenom fiender: skada (kort), guld dras till dig
  for (const it of items) if (!it.taken && it.type.startsWith('gold') && Math.hypot(it.x - P.x, it.y - P.y) < 2.2) { it.x += (P.x - it.x) * 0.5; it.y += (P.y - it.y) * 0.5; }
  if (!mod('dashDmg')) return;
  for (const e of ents) if (!e.dead && !e.dormant && !P.dashHit.has(e) && Math.hypot(e.x - P.x, e.y - P.y) < 0.8) { P.dashHit.add(e); hurtEnemy(e, mod('dashDmg'), e.x, e.y, { noProc: true }); }
}
const tapT = {}; // dubbeltryck på en riktning = rusning
function dirTap(code) {
  const now = performance.now();
  if (settings.doubleTapDash !== false && tapT[code] && now - tapT[code] < 260) {
    const f = code === 'KeyW' ? 1 : code === 'KeyS' ? -1 : 0, st = code === 'KeyD' ? 1 : code === 'KeyA' ? -1 : 0;
    dash(Math.cos(P.a) * f - Math.sin(P.a) * st, Math.sin(P.a) * f + Math.cos(P.a) * st); tapT[code] = 0; return;
  }
  tapT[code] = now;
}
function pickUp(it, bought) {
  let am = diff().ammo * (1 + mod('ammoMul'));
  if (it.type === 'gold' || it.type === 'goldpile') {
    const n = Math.round((it.type === 'goldpile' ? rnd(8, 14) + run.depth * 3 : rnd(2, 5) + run.depth) * (1 + mod('goldMul')) * (floorEvent === 'bloodmoon' ? 2 : floorEvent === 'goldrain' ? 1.5 : 1) * (1 + goldRisk()));
    spawnText(it.x, it.y, `+${n}`, '#ffd24a'); // guld som plockas upp syns som siffror
    const n2 = dmod('gold') ? n : dmod('swift') ? Math.round(n * 0.5) : 0; run.gold += n2;
    run.gold += n; play('coin', 0.5, rnd(0.95, 1.15)); if (it.type === 'goldpile') say(`+${n} GULD`, 1.2); return true;
  }
  if (it.type === 'cardpick') { // kortval från elit, väktare och boss
    play('card', 0.8, 1.2);
    let cs = drawCards(3, { luck: it.luck || 0.3 });
    if (it.legend && !cs.some(c => c.rarity === 'legendarisk')) { const lg = drawCards(12, { luck: 3 }).find(c => c.rarity === 'legendarisk' && !cs.some(o => o.id === c.id)); if (lg) cs[cs.length - 1] = lg; } // efter bossar: alltid ett legendariskt
    openUI(() => draftUI(cs, { title: it.title || 'BYTE', subtitle: 'VÄLJ ETT KORT', skipLabel: 'TA INGET' }, card => { gainCard(card); closeUI(); }));
    return true;
  }
  if (it.type === 'grenade') { if (P.grenades >= GREN_MAX()) return false; const n = Math.min(GREN_MAX() - P.grenades, bought ? 1 : 2); P.grenades += n; say(`+${n} GRANAT${n > 1 ? 'ER' : ''}`, 1.5); play('pickup', 0.7, 0.8); spawnText(it.x, it.y, `+${n} GRANAT`, '#c0ff90'); return true; }
  if (it.type === 'rune') { giveRune(it.rune || RUNE_IDS[(Math.random() * RUNE_IDS.length) | 0]); return true; }
  if (it.type === 'meat') { run.meat = (run.meat || 0) + 1; say('KÖTT – LAGA MAT VID EN LÄGERELD', 1.5); play('pickup', 0.6, 0.7); return true; }
  if (it.type === 'arrowpick') { if (P.ammo.arrows >= AMMO.arrows.max) return false; P.ammo.arrows++; play('arrow_pickup', 0.5, rnd(0.95, 1.1)); return true; }
  if (it.type === 'potion') { const id = it.pot || randomPotion(); if (!givePotion(id, it.strong, true)) { givePotion(id, false); return false; } say(`DU FICK: ${potName(P.potions[P.potions.length - 1])}`, 2); play('pickup', 0.6, 1.3); spawnText(it.x, it.y, potKnown(id) ? POTIONS[id].name : 'DRYCK', potKnown(id) ? POTIONS[id].color : '#c0c0c0'); return true; }
  if (it.type === 'key') { P.keys++; say('DU HITTADE EN NYCKEL', 2); play('key', 0.8); return true; }
  if (it.type === 'scroll') { seen.fill(1); run.mapRevealed = true; say('SKATTKARTAN VISAR HELA VÅNINGEN', 3); play('map_unroll', 0.8); if (!showMap) showMap = 1; return true; }
  if (it.type === 'health') { if (P.hp >= maxHp()) return false; const n = Math.round(30 * (1 + mod('healMul'))); heal(n); say(`+${n} HÄLSA`, 1.5); play('health', 0.7); spawnText(it.x, it.y, `+${n} HP`, '#ff7060'); }
  else if (it.type === 'shard') { if (P.armor >= 200) return false; P.armor = Math.min(200, P.armor + 10); say('+10 RUSTNING', 1); play('armor', 0.5, 1.4); spawnText(it.x, it.y, '+10', '#9fc4ff'); }
  else if (it.type === 'armor') { if (P.armor >= 200) return false; P.armor = Math.min(200, P.armor + 50); say('+50 RUSTNING', 1.5); play('armor', 0.7); }
  else if (it.type === 'ammo' && run.pact) { // pakten: all ammo blir vapnets egen
    const k = pactAmmo(), n = Math.round(({ p9: 30, r556: 28, shells: 9, bolts: 8, flares: 5, fuel: 60, lgren: 4, none: 0, nails: 40, arrows: 6, mana: 0 }[k] || 0) * am);
    if (P.ammo[k] >= AMMO[k].max && !bought) return false;
    P.ammo[k] = Math.min(AMMO[k].max, P.ammo[k] + n); say(`AMMO +${n} ${AMMO[k].name}`, 2); play('pickup', 0.7);
  } else if (it.type === 'ammo') {
    const full = Object.keys(AMMO).every(k => P.ammo[k] >= AMMO[k].max);
    if (full && !bought) return false;
    const has = id => P.has[weaponIndex(id)];
    am *= it.mult || 1;
    const add = { p9: Math.round(18 * am), r556: Math.round((has('rifle') || has('sniper') ? 20 : 8) * am), shells: Math.round((has('shotgun') || has('dbshotgun') ? 6 : 3) * am),
      bolts: Math.round((has('crossbow') ? 5 : 0) * am), flares: Math.round((has('flaregun') ? 3 : 0) * am), fuel: Math.round((has('flamer') ? 40 : 0) * am), lgren: Math.round((has('launcher') ? 3 : 0) * am),
      nails: Math.round((has('nailgun') ? 30 : 0) * am), arrows: Math.round((has('bow') ? 4 : 0) * am) };
    add[WEAPONS[P.weapon].ammo] = Math.round(add[WEAPONS[P.weapon].ammo] * 1.5); // mer till vapnet du håller
    for (const k in add) P.ammo[k] = Math.min(AMMO[k].max, P.ammo[k] + add[k]);
    say('AMMO ' + Object.keys(add).filter(k => add[k] > 0).map(k => `+${add[k]} ${AMMO[k].name}`).join(' '), 2); play('pickup', 0.7);
    const wk = WEAPONS[P.weapon].ammo; if (add[wk]) spawnText(it.x, it.y, `+${add[wk]} ${AMMO[wk].name}`, '#ffd24a');
  } else {
    const i = weaponIndex(it.type), w = WEAPONS[i];
    if (run.cmode === 'pistol' && w.id !== 'pistol') { P.ammo.p9 = Math.min(AMMO.p9.max, P.ammo.p9 + 30); run.gold += 20; say(`BARA PISTOL: ${w.name} BLIR AMMO OCH 20 GULD`, 2.5); play('coin', 0.7); return true; }
    if (run.pact && w.id !== run.pact) { // pakten: andra vapen blir ammo och guld
      const k = pactAmmo(); P.ammo[k] = Math.min(AMMO[k].max, P.ammo[k] + ({ p9: 30, r556: 30, shells: 8, bolts: 8, flares: 5, fuel: 60, lgren: 4, none: 0, nails: 40, arrows: 6, mana: 0 }[k] || 0)); run.gold += 20;
      say(`EDEN: ${w.name} BLIR AMMO OCH 20 GULD`, 2.5); play('coin', 0.7); return true;
    }
    const first = !P.has[i];
    P.has[i] = true;
    if (first) P.mags[i] = effMag(i);
    P.ammo[w.ammo] = Math.min(AMMO[w.ammo].max, P.ammo[w.ammo] + ({ p9: 30, r556: 30, shells: 8, bolts: 10, flares: 6, fuel: 80, lgren: 8, none: 0, nails: 70, arrows: 12, mana: 0 }[w.ammo] || 0));
    say('DU HITTADE: ' + w.name, 2.5); play('weapon', 0.8);
    if (first && settings.autoSwitch !== false) switchWeapon(i);
  }
  return true;
}
function updateWeapon(dt) {
  const wp = WEAPONS[P.weapon];
  WS.t += dt; WS.shot += dt; WS.cd -= dt;
  WS.spread = Math.max(0, WS.spread - dt * 0.12);
  const moving = Math.hypot(P.vx, P.vy) / 3.1;
  WS.spread = Math.max(WS.spread, moving * 0.012 * (1 - WS.aim * 0.7));
  WS.swayX *= Math.pow(0.0001, dt); WS.swayY *= Math.pow(0.0001, dt);
  const wantAim = aimDown && (WS.state === 'idle') && !WEAPONS[P.weapon].melee ? 1 : 0;
  WS.aim += (wantAim - WS.aim) * Math.min(1, dt * 10);
  WS.punch = Math.max(0, WS.punch - dt * 0.35); WS.kick = Math.max(0, WS.kick - dt); WS.nameT = Math.max(0, WS.nameT - dt); P.kickT = Math.max(0, P.kickT - dt);
  plane = BASE_PLANE * (1 - WS.aim * (wp.zoom || 0.22)) * (1 + WS.punch) * (1 + P.runK * 0.07);
  if (WS.inspect > 0) WS.inspect = Math.max(0, WS.inspect - dt);
  if (WS.throwT >= 0) WS.throwT += dt;
  // ladda om automatiskt efter en stund utan skott (inställning)
  WS.idleT = WS.state === 'idle' && !mouseDown ? WS.idleT + dt : 0;
  if (settings.autoReload !== false && WS.idleT > 2.2 && P.mags[P.weapon] < effMag(P.weapon) * 0.5 && P.ammo[wp.ammo] > 0) { WS.idleT = 0; startReload(); }
  if (mod('ammoRegen') > 0) { P.ammoAcc = (P.ammoAcc || 0) + dt * mod('ammoRegen') * effMag(P.weapon); if (P.ammoAcc >= 1) { const n = Math.floor(P.ammoAcc); P.ammoAcc -= n; P.ammo[wp.ammo] = Math.min(AMMO[wp.ammo].max, P.ammo[wp.ammo] + n); } }
  if (WS.state === 'holster' && WS.t >= 0.22) { P.weapon = WS.next; WS.state = 'draw'; WS.t = 0; WS.nameT = 1.6; }
  else if (WS.state === 'draw' && WS.t >= drawTime()) { WS.state = 'idle'; WS.t = 0; }
  else if (WS.state === 'reload') {
    if (wp.shellReload) {
      if (WS.t >= shellSeg(WS.shellPhase)) {
        WS.t = 0;
        if (WS.shellPhase === 'start') WS.shellPhase = 'step';
        else if (WS.shellPhase === 'step') {
          P.mags[P.weapon]++; P.ammo.shells--; play('shell', 0.5, rnd(1.1, 1.3));
          if (P.mags[P.weapon] >= effMag(P.weapon) || P.ammo.shells <= 0) WS.shellPhase = 'end';
        } else { WS.state = 'idle'; play('reload', 0.45, 1.4); }
      }
    } else {
      const dur = wp.reload * reloadMul();
      if (!WS.loaded && WS.t >= dur * 0.65) { WS.loaded = true; finishReload(); play('click', 0.5, 0.9); }
      if (WS.t >= dur) { WS.state = 'idle'; WS.loaded = false; }
    }
  }
  if (WS.state !== 'reload') WS.loaded = false;
  if (touch.tap > 0) touch.tap -= dt;
  if (P.iframe > 0) P.iframe -= dt;
  const trig = mouseDown || touch.tap > 0 || touch.autoFire;
  if (wp.melee) { // yxan: håll för laddat slag, högerklick kastar
    if (trig && WS.state === 'idle' && WS.cd <= 0) { WS.charge = (WS.charge || 0) + dt; if (WS.charge > 0.5 && !WS.chargeSnd) { WS.chargeSnd = true; play('axe_charge', 0.4, 1.3); } }
    else if (!trig && WS.charge > 0) { const c = WS.charge >= 0.5; WS.charge = 0; WS.chargeSnd = false; if (canFire()) axeSwing(c); }
    if (aimDown && !WS.aimHeld) axeThrow(); WS.aimHeld = aimDown;
    fireHeld = trig; return;
  }
  if (weaponV6Tick(wp, dt, trig)) return;
  if (wp.flame && aimDown && up('fl_wall') && !WS.aimHeld) flameWall(); if (!wp.nail) WS.aimHeld = aimDown;
  if (flameSnd && (!trig || !wp.flame || P.mags[P.weapon] <= 0)) { try { flameSnd.s.stop(); } catch (e) { /* stoppad */ } flameSnd = null; if (wp.flame) play('flamer_end', 0.4); }
  WS.spin = trig && up('spin') ? Math.min(2, WS.spin + dt) : Math.max(0, WS.spin - dt * 3);
  WS.focus = up('focus') && WS.aim > 0.8 && WS.state === 'idle' ? Math.min(1, WS.focus + dt) : 0;
  if (trig && (wp.auto || up('fan') || !fireHeld)) fire();
  fireHeld = trig;
}
const hasMod = (e, id) => !!e.elite && (e.elite.id === id || (e.elite2 && e.elite2.id === id));
function eliteTick(e, dt) { // elitegenskaper som verkar över tid
  if (!e.elite) return;
  if (!settings.lowfx && Math.random() < dt * 5 && fx.parts.ember) particles.push({ x: e.x + rnd(-0.3, 0.3), y: e.y + rnd(-0.3, 0.3), z: rnd(0, 0.3), vx: 0, vy: 0, vz: 0.8, life: 0.7, maxLife: 0.7, frames: fx.parts.ember, img: fx.parts.ember[0], size: 0.06, add: true, tint: e.elite.tint, drift: true }); // glödande aura
  if (hasMod(e, 'frost') && Math.hypot(P.x - e.x, P.y - e.y) < 2.6) { P.slowT = Math.max(P.slowT, 0.3); if (Math.random() < dt * 3) particles.push({ x: P.x + rnd(-0.6, 0.6), y: P.y + rnd(-0.6, 0.6), z: rnd(0.2, 0.6), vx: 0, vy: 0, vz: -0.2, life: 0.6, maxLife: 0.6, img: fx.hit[1], size: 0.05, add: true, tint: [170, 230, 255], drift: true }); }
  if (hasMod(e, 'flicker')) e.ghost = 0.35 + 0.35 * Math.sin(tmr * 4 + e.x);
  if (hasMod(e, 'stalker')) e.ghost = Math.hypot(P.x - e.x, P.y - e.y) < 2.5 || e.state === 'attack' ? 0 : 0.9; // osynlig tills den anfaller
  if (hasMod(e, 'caller') && !e.called && e.hp < e.maxHp * 0.3) { e.called = true; say('ELITEN KALLAR PÅ HJÄLP!', 1.5); play('roar', 0.7, 0.8, { x: e.x, y: e.y }); for (let i = 0; i < 2; i++) { const a = rnd(0, TAU), x = e.x + Math.cos(a) * 1.5, y = e.y + Math.sin(a) * 1.5; if (!solid(x, y)) { const o = makeEnemy(e.type, x, y); o.alert = true; o.minion = true; ents.push(o); totalEnemies++; spawnPuff(x, y, 5); } } }
  if (hasMod(e, 'regen') && tmr - (e.lastHurt || 0) > 2 && e.hp < e.maxHp) { e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.04 * dt); if (Math.random() < dt * 4) spawnPuff(e.x, e.y, 1); }
  if (hasMod(e, 'teleport') && e.alert) {
    e.tpT = (e.tpT ?? 3) - dt;
    const d = Math.hypot(P.x - e.x, P.y - e.y);
    if (e.tpT <= 0 && d > 3) { e.tpT = rnd(3.5, 5); const a = Math.atan2(e.y - P.y, e.x - P.x) + rnd(-1, 1), r = rnd(1.6, 2.4), x = P.x + Math.cos(a) * r, y = P.y + Math.sin(a) * r;
      if (freeSpot(x, y, 0.3) && hasLOS(P.x, P.y, x, y)) { spawnPuff(e.x, e.y, 6); e.x = x; e.y = y; spawnPuff(x, y, 6); play('whoosh', 0.6, 1.8, { x, y }); } }
  }
}
function statusFx(e, dt) { // syns på fienden: glöd när den brinner, bubblor av gift, frost när den är långsam
  if (settings.lowfx || !fx.parts.ember) return;
  const pick = e.burn > 0 ? [255, 140, 50] : e.poison > 0 ? [120, 255, 90] : e.slow > 0 ? [140, 200, 255] : null;
  if (pick && Math.random() < dt * 6) particles.push({ x: e.x + rnd(-0.2, 0.2), y: e.y + rnd(-0.2, 0.2), z: rnd(0.2, 0.8) * e.d.size, vx: 0, vy: 0, vz: 0.6, life: 0.6, maxLife: 0.6, frames: fx.parts.ember, img: fx.parts.ember[0], size: 0.05, add: true, tint: pick, drift: true });
}
function freeze(e, t) {
  if (e.boss) { e.slow = Math.max(e.slow, t); return; }
  if (!(e.frozen > 0)) play('freeze', 0.5, rnd(0.9, 1.1), { x: e.x, y: e.y });
  e.frozen = Math.max(e.frozen || 0, t); e.burn = 0;
}
function statusTick(e, dt) { // brand och långsamhet
  statusFx(e, dt);
  if (e.d.fireproof) e.burn = 0; // eldväsen brinner inte
  if (e.frozen > 0) e.frozen -= dt;
  e.slow = Math.max(0, e.slow - dt); e.haste = Math.max(0, (e.haste || 0) - dt);
  if (e.burn > 0 && !e.panic && Math.random() < 0.5) e.panic = rnd(0, TAU); else if (e.burn <= 0) e.panic = 0;
  if (e.burn > 0 && e.panic && Math.random() < dt * 1.5) e.panic += rnd(-1.2, 1.2);
  if (e.bleed > 0) { // blödning: yxan och blodkort
    e.bleed -= dt; e.bleedAcc = (e.bleedAcc || 0) + dt;
    if (e.bleedAcc >= 0.4) { e.bleedAcc = 0; if (fx.parts.blood_trail) particles.push({ x: e.x + rnd(-0.1, 0.1), y: e.y + rnd(-0.1, 0.1), z: 0.4, vx: 0, vy: 0, vz: 0, life: 0.6, img: fx.parts.blood_trail[(Math.random() * 2) | 0], size: 0.05, grav: true }); hurtEnemy(e, 0.7 * (1 + mod('dmg')) * (1 + mod('meleeDmg') * 0.5), e.x, e.y, { noProc: true, quiet: true }); if (e.dead) return; }
  }
  if (e.poison > 0) { // giftspetsen
    e.poison -= dt; e.poisonAcc = (e.poisonAcc || 0) + dt;
    if (e.poisonAcc >= 0.5) { e.poisonAcc = 0; hurtEnemy(e, Math.min(e.maxHp * 0.05, 2.5) * (1 + mod('dmg')), e.x, e.y, { noProc: true, quiet: true }); if (e.dead) return; }
  }
  if (e.burn > 0) {
    e.burn -= dt; e.burnAcc += dt;
    if (e.burnAcc >= 0.5) { e.burnAcc = 0; hurtEnemy(e, 0.8 * (1 + mod('dmg')), e.x, e.y, { noProc: true, quiet: true }); }
  }
}
function wispBurst(e) { // frostexplosion: skadar, saktar ned och fryser marken
  if (e.burst) return; e.burst = true; e.hp = 0; e.gibbed = true; killEnemy(e);
}
function frostBurst(x, y) {
  play('wisp_burst', 0.8, 1, { x, y }); spawnPuff(x, y, 6);
  for (let i = 0; i < 10; i++) { const a = rnd(0, TAU), sp = rnd(1, 3), f = fx.parts.ice; particles.push({ x, y, z: 0.5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: rnd(0.5, 2), life: 1, img: f ? f[i % f.length] : fx.hit[1], size: 0.07, grav: true, bounce: true }); }
  if (Math.hypot(P.x - x, P.y - y) < 1.8) { hurtPlayer(8 * Math.max(0.2, 1 - mod('coldResist')), x, y, 'proj'); P.slowT = Math.max(P.slowT, 2.5 * Math.max(0.2, 1 - mod('coldResist'))); }
  for (const o of ents) if (!o.dead && !o.boss && Math.hypot(o.x - x, o.y - y) < 1.8) freeze(o, 1.5);
  for (let cy = Math.max(1, (y - 1) | 0); cy <= Math.min(mh - 2, (y + 1) | 0); cy++) for (let cx = Math.max(1, (x - 1) | 0); cx <= Math.min(mw - 2, (x + 1) | 0); cx++) if (map[cy][cx] === '.') { map[cy][cx] = ':'; cellFloor[cy * mw + cx] = animTex.ice ?? cellFloor[cy * mw + cx]; } // frusen mark
}
function bomberBlow(e) { if (e.dead) return; e.lit = undefined; e.hp = 0; e.gibbed = true; killEnemy(e); }
const spores = [], icicles = [];
function updateIcicles(dt) {
  for (const ic of icicles) {
    if (ic.fall < 0) continue; ic.fall += dt;
    if (ic.fall > 0.45 && !ic.hit) { ic.hit = true; play('icicle_fall', 0.7, 1, { x: ic.x, y: ic.y }); P.shake = Math.max(P.shake, 0.3);
      for (const e of ents) if (!e.dead && !e.dormant && Math.hypot(e.x - ic.x, e.y - ic.y) < 0.9) hurtEnemy(e, 14, e.x, e.y, { noProc: true, boom: true });
      if (Math.hypot(P.x - ic.x, P.y - ic.y) < 0.8) hurtPlayer(10, ic.x, ic.y);
      for (let i = 0; i < 6; i++) { const f = fx.parts.ice; particles.push({ x: ic.x, y: ic.y, z: 0.1, vx: rnd(-1.5, 1.5), vy: rnd(-1.5, 1.5), vz: rnd(1, 2), life: 0.8, img: f ? f[i % f.length] : fx.hit[1], size: 0.06, grav: true, bounce: true }); } }
  }
  for (let i = icicles.length - 1; i >= 0; i--) if (icicles[i].hit && icicles[i].fall > 1) icicles.splice(i, 1);
}
function sporeCloud(x, y) {
  spores.push({ x, y, t: 4 }); play('spore', 0.6, rnd(0.9, 1.1), { x, y });
}
function updateSpores(dt) {
  for (const c of spores) {
    c.t -= dt;
    if (!settings.lowfx && Math.random() < dt * 10) { const f = fx.parts.spore || fx.hit; particles.push({ x: c.x + rnd(-0.8, 0.8), y: c.y + rnd(-0.8, 0.8), z: rnd(0.05, 0.6), vx: rnd(-0.2, 0.2), vy: rnd(-0.2, 0.2), vz: 0.15, life: 1, maxLife: 1, frames: f, img: f[0], size: 0.12, add: true, tint: [170, 255, 120], drift: true, fade: true }); }
    if (Math.hypot(P.x - c.x, P.y - c.y) < 1.3 && mod('hazardImmune') <= 0) { P.poisonT = Math.max(P.poisonT || 0, 2.5); run.cause = 'SVAMPMAN'; }
  }
  for (let i = spores.length - 1; i >= 0; i--) if (spores[i].t <= 0) spores.splice(i, 1);
}
function wakeMimic(e) {
  e.dormant = false; totalEnemies++; alertEnemy(e); e.state = 'attack'; e.t = 0; e.cd = 0.4; e.didHit = false; P.shake = Math.max(P.shake, 0.8);
  if (e.type === '+') { play('shield_block', 0.9, 0.7, { x: e.x, y: e.y }); say('RUSTNINGEN RÖR SIG!', 1.5); return; }
  if (e.type === 'Ö') { play('gargoyle_wake', 0.9, 1, { x: e.x, y: e.y }); say('STATYN VAKNAR!', 1.5); return; }
  play('chest', 0.9, 0.7, { x: e.x, y: e.y }); play('roar', 0.6, 1.5, { x: e.x, y: e.y }); say('KISTAN LEVER!', 1.5);
}
function updateEnemy(e, dt) {
  e.t += dt; e.flash = Math.max(0, e.flash - dt); e.spotT = Math.max(0, (e.spotT || 0) - dt);
  if (e.dead) return;
  if (e.dormant) { e.state = 'idle'; if (e.hp < e.maxHp || Math.hypot(P.x - e.x, P.y - e.y) < (e.type === 'Ö' ? 3 : 1.15)) wakeMimic(e); return; } // mimicen väntar som en kista, gargoylen som en staty
  if (e.frozen > 0) { statusTick(e, dt); e.state = 'pain'; e.t = 0; return; }
  statusTick(e, dt); if (e.dead) return;
  eliteTick(e, dt); enemyFeel(e, dt); enemyFeelV6(e, dt);
  const dx = P.x - e.x, dy = P.y - e.y, dist = Math.hypot(dx, dy);
  const los = dist < 14 && !(P.ghostT > 0 && dist > 1.3 && !e.boss) && hasLOS(e.x, e.y, P.x, P.y); // osynlighetsdrycken
  const sight = e.sleep ? 2.2 : (dmod('dark') ? 6 : 10) * (P.crouch > 0.5 ? 0.7 : 1);
  if (!e.alert && los && dist < sight) { if (e.sleep) { e.sleep = false; spawnText(e.x, e.y, '!', '#ff5030'); } alertEnemy(e, true); }
  if (!e.alert) { idleBehaviour(e, dt, dist); return; }
  // tappar sikten: letar där spelaren senast syntes, ger upp efter en stund
  if (los) { e.lostT = 0; e.lx = P.x; e.ly = P.y; } else e.lostT = (e.lostT || 0) + dt;
  if (e.lostT > 7 && dist > 9 && !e.minion && !e.elite) { e.alert = false; e.lostT = 0; e.searchT = 1.5; e.state = 'idle'; return; }
  if (e.fleeT > 0) { e.fleeT -= dt; const sp = e.d.speed * diff().speed * dt * 1.3, a = Math.atan2(e.y - P.y, e.x - P.x) + Math.sin(e.t * 3) * 0.4; const ox = e.x, oy = e.y; tryMove(e, Math.cos(a) * sp, Math.sin(a) * sp, 0.28); e.mvx = e.x - ox; e.mvy = e.y - oy; e.state = 'move'; return; }
  if (!e.fledOnce && !e.elite && !e.minion && e.hp < e.maxHp * 0.25 && e.d.melee && e.cowardly) { e.fledOnce = true; e.fleeT = 2.5; spawnText(e.x, e.y, 'FLYR', '#c9a87a'); } // vissa flyr när de är svårt skadade
  if (e.dodgy && los && (e.dodgeT || 0) < tmr && dist > 2.5 && aimedAt(e)) { e.dodgeT = tmr + rnd(1.8, 3); const side = Math.random() < 0.5 ? 1 : -1, a = Math.atan2(dy, dx) + side * Math.PI / 2; for (let i = 0; i < 6; i++) tryMove(e, Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0.28); } // viker undan när du siktar
  e.growlT -= dt; if (e.growlT <= 0) { e.growlT = rnd(4, 9); play(e.d.growl, e.d.ai === 'stealth' ? 0.15 : 0.45, rnd(0.9, 1.2), { x: e.x, y: e.y }); }
  if (e.frozen > 0) { e.state = 'pain'; e.t = 0; return; } // frusen
  if (e.stun > 0 && e.d.ai !== 'charge') { e.stun -= dt; e.state = 'pain'; e.t = Math.min(e.t, 0.25); return; } // bländad
  if (e.d.ai && ENEMY_AI[e.d.ai](e, dt, dist, los)) return;
  if (e.state === 'pain') { if (e.t > 5 / 14) { e.state = 'move'; e.t = 0; } return; }
  e.cd -= dt;
  if (e.state === 'attack') {
    const dur = enemyFrames[e.type].attack.length / e.d.atkFps;
    if (!e.didHit && e.t > dur * e.d.hitAt) { e.didHit = true; enemyStrike(e, dist); }
    if (e.t > dur) { e.state = 'move'; e.t = 0; e.cd = e.d.cd * rnd(0.8, 1.2); }
    return;
  }
  if (los && dist < e.d.range && e.cd <= 0) { e.state = 'attack'; e.t = 0; e.didHit = false; return; }
  e.state = 'move'; e.mvx = 0; e.mvy = 0;
  const want = (e.d.kite && los && dist < e.d.kite * (e.hp < e.maxHp * 0.3 ? 2 : 1)) || (e.burn > 0 && e.panic) || (!(los && !e.d.melee && dist < e.d.range * 0.6) && dist > 0.75);
  if (!want) return;
  const sp = e.d.speed * diff().speed * dt * (e.slow > 0 ? 0.5 : 1) * (e.haste > 0 ? 1.45 : 1) * (dmod('swift') ? 1.25 : 1) * (cellAt(e.x, e.y) === ':' && e.d.ai !== 'fly' && e.type !== 'É' ? rnd(0.6, 1.6) : 1) * (cellAt(e.x, e.y) === '-' && e.d.ai !== 'fly' ? 0.65 : 1) * (cellAt(e.x, e.y) === '"' && e.type !== 'U' ? 0.5 : 1);
  let tx = P.x, ty = P.y;
  if (!los || dist > 6) { // följ avståndsfältet runt hörn
    const cx = e.x | 0, cy = e.y | 0; let best = flow[cy * mw + cx], bx = -1, by = -1;
    for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + ddx, ny = cy + ddy; if (nx < 0 || ny < 0 || nx >= mw || ny >= mh) continue;
      const v = flow[ny * mw + nx]; if (v >= 0 && (best < 0 || v < best)) { best = v; bx = nx; by = ny; }
    }
    if (bx >= 0) {
      tx = bx + 0.5; ty = by + 0.5;
      const d = doors[bx + ',' + by]; // fiender öppnar dörrar
      if (d && !d.gate && !d.secret && d.target === 0) { d.target = 1; play('door', 0.5, 1, { x: bx + 0.5, y: by + 0.5 }); }
    }
  }
  let ang = Math.atan2(ty - e.y, tx - e.x);
  const fleeing = e.d.kite && e.hp < e.maxHp * 0.3; // skadade magiker och shamaner flyr
  if (e.burn > 0 && !e.elite && e.d.melee && e.panic) ang = e.panic; // brinnande fiender springer i panik
  else if (e.d.kite && los && dist < e.d.kite * (fleeing ? 2 : 1)) ang += Math.PI; // magiker och shamaner håller avstånd
  else if (e.d.ai === 'blink' && los) ang += Math.sin(e.t * 5 + e.x * 3) * 0.7; // smådjävulen sicksackar
  else if (los && e.d.melee && dist > 1.8 && dist < 7) ang += (e.flank || 0) * clamp((dist - 1.8) / 4, 0, 1) * 0.6; // grupper sprider sig och kommer från sidorna
  const ox = e.x, oy = e.y;
  tryMove(e, Math.cos(ang) * sp, Math.sin(ang) * sp, 0.28);
  if (Math.hypot(e.x - ox, e.y - oy) < sp * 0.3) tryMove(e, Math.cos(ang + 1.2) * sp, Math.sin(ang + 1.2) * sp, 0.28);
  for (const o of ents) if (o !== e && !o.dead) pushOut(e, o.x, o.y, o.boss ? 1.2 : 0.55);
  e.mvx = e.x - ox; e.mvy = e.y - oy;
}
function enemyStrike(e, dist) {
  let dmg = e.d.dmg * (1 + 0.1 * (run.depth - 1));
  if (e.d.melee) {
    if (dist < e.d.range + 0.35) {
      if (e.d.ai === 'stealth') { // rygghugg om spelaren tittar bort
        let off = Math.abs(Math.atan2(e.y - P.y, e.x - P.x) - P.a) % TAU; if (off > Math.PI) off = TAU - off;
        if (off > 1.75) { dmg *= 1.7; say('RYGGHUGG!', 1); }
      }
      hurtPlayer(dmg, e.x, e.y, 'melee'); play(e.type === 'É' ? 'wolf_bite' : 'splat', 0.5, 0.7);
      if (e.d.frostBite) P.slowT = Math.max(P.slowT, 1.5 * Math.max(0.2, 1 - mod('coldResist')));
      if (hasMod(e, 'mirror')) { /* speglande eliter skadar dig när du träffar dem, se hurtEnemy */ }
      if (mod('thorns') > 0) hurtEnemy(e, mod('thorns'), e.x, e.y, { noProc: true });
      if (e.elite && e.elite.id === 'vamp') e.hp = Math.min(e.maxHp, e.hp + dmg);
      if (hasMod(e, 'venom')) { P.poisonT = 4; say('DU ÄR FÖRGIFTAD', 1); }
    } else play('whoosh', 0.4, 1.2, { x: e.x, y: e.y });
  } else { // eldklot som går att undvika
    const kind0 = e.d.proj, sp0 = kind0 === 'orb' ? 3.4 : kind0 === 'bolt' ? 6.5 : 5.2, lead = clamp(dist / sp0, 0.1, 1) * (e.elite ? 0.9 : 0.6), tx = P.x + P.vx * lead, ty = P.y + P.vy * lead, a = Math.atan2(ty - e.y, tx - e.x) + rnd(-0.05, 0.05);
    const kind = e.d.proj, speed = kind === 'orb' ? 3.4 : kind === 'bolt' ? 6.5 : 5.2;
    shootFireball(e, a, speed, dmg, false, kind);
    if (e.elite) { shootFireball(e, a - 0.18, speed, dmg, false, kind); shootFireball(e, a + 0.18, speed, dmg, false, kind); }
    play('whoosh', 0.6, 0.8, { x: e.x, y: e.y });
  }
}
// ---------- Specialfiender ----------
function spawnPuff(x, y, n = 5) { // magisk rök när något dyker upp eller försvinner
  for (let j = 0; j < n; j++) particles.push({ x: x + rnd(-0.2, 0.2), y: y + rnd(-0.2, 0.2), z: rnd(0.2, 0.6), vx: rnd(-0.8, 0.8), vy: rnd(-0.8, 0.8), vz: rnd(0.5, 1.5), life: 0.45, maxLife: 0.45, frames: fx.hit, img: fx.hit[0], size: 0.4, add: true });
}
function freeSpot(x, y, r) { return !solid(x, y) && !solid(x + r, y) && !solid(x - r, y) && !solid(x, y + r) && !solid(x, y - r); }
function blink(e) { // smådjävulen hoppar åt sidan
  const side = Math.atan2(P.y - e.y, P.x - e.x) + (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
  for (const d of [2.2, 1.6, 1.1]) {
    const x = e.x + Math.cos(side) * d, y = e.y + Math.sin(side) * d;
    if (freeSpot(x, y, 0.3)) { spawnPuff(e.x, e.y); e.x = x; e.y = y; spawnPuff(x, y); e.blinkCd = 1.6; play('whoosh', 0.5, 1.6, { x, y }); return; }
  }
}
function splitBlob(e) { // blodslemmet delar sig i två droppar
  for (const s of [-1, 1]) {
    const a = Math.atan2(P.y - e.y, P.x - e.x) + s * 1.2, x = e.x + Math.cos(a) * 0.45, y = e.y + Math.sin(a) * 0.45;
    const c = makeEnemy('l', freeSpot(x, y, 0.2) ? x : e.x, freeSpot(x, y, 0.2) ? y : e.y);
    c.alert = true; c.state = 'move'; c.cd = 0.8; ents.push(c); totalEnemies++;
  }
  play('splat', 0.7, 0.6, { x: e.x, y: e.y });
}
const ENEMY_AI = { // returnerar true när beteendet tar över hela uppdateringen
  necro: (...a) => AI_V6.necro(...a), elemental: (...a) => AI_V6.elemental(...a), worm: (...a) => AI_V6.worm(...a), knight: (...a) => AI_V6.knight(...a), banshee: (...a) => AI_V6.banshee(...a),
  ghoul(e, dt, dist) { // ghoulen äter lik för att läka och undviker starkt ljus
    if (e.eatT > 0) { e.eatT -= dt; e.state = 'attack'; e.t = 0.1; if (e.eatT <= 0 && e.meal) { e.meal.gibbed = true; e.meal.eaten = true; e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.4); play('ghoul_eat', 0.6, 1, { x: e.x, y: e.y }); spawnText(e.x, e.y, '+HP', '#9fe060'); e.meal = null; } return true; }
    if (e.hp < e.maxHp * 0.8 && dist > 2.5) { const c = ents.find(o => o.dead && !o.gibbed && !o.boss && !o.eaten && Math.hypot(o.x - e.x, o.y - e.y) < 6);
      if (c) { const d = Math.hypot(c.x - e.x, c.y - e.y); if (d < 0.6) { e.eatT = 1.5; e.meal = c; return true; } const a = Math.atan2(c.y - e.y, c.x - e.x), sp = e.d.speed * dt, ox = e.x, oy = e.y; tryMove(e, Math.cos(a) * sp, Math.sin(a) * sp, 0.28); e.mvx = e.x - ox; e.mvy = e.y - oy; e.state = 'move'; return true; } }
    if (lightAt(e.x, e.y) > 1.3 && !e.fleeT) e.fleeT = 0.5; // starkt ljus skrämmer
    return false;
  },
  cultist(e, dt, dist, los) { // kultisten förbannar dig, stärker andra och offrar dem
    e.curseT = (e.curseT ?? rnd(2, 4)) - dt;
    if (e.curseT <= 0 && los && dist < 9) { e.curseT = rnd(5, 7); e.state = 'attack'; e.t = 0; e.didHit = true;
      const ally = ents.find(o => o !== e && !o.dead && !o.boss && !o.empowered && Math.hypot(o.x - e.x, o.y - e.y) < 6);
      if (ally && Math.random() < 0.5) { ally.empowered = true; ally.d = { ...ally.d, dmg: ally.d.dmg * 1.3, speed: ally.d.speed * 1.15 }; zap(e.x, e.y, ally.x, ally.y, [190, 90, 255]); play('curse', 0.6, 1.2, { x: e.x, y: e.y }); }
      else { P.curseT = 6; say('KULTISTEN FÖRBANNAR DIG: −25 % SKADA', 2); play('curse', 0.8, 1, { x: e.x, y: e.y }); zap(e.x, e.y, P.x, P.y, [190, 90, 255]); }
      return true; }
    if (e.hp < e.maxHp * 0.4 && !e.sacrificed) { const v = ents.find(o => o !== e && !o.dead && !o.boss && !o.elite && Math.hypot(o.x - e.x, o.y - e.y) < 4); // offret
      if (v) { e.sacrificed = true; v.hp = 0; killEnemy(v); e.hp = e.maxHp; e.empowered = true; e.d = { ...e.d, dmg: e.d.dmg * 1.4 }; zap(e.x, e.y, v.x, v.y, [255, 60, 80]); say('KULTISTEN OFFRAR EN ANNAN!', 2); play('curse', 0.9, 0.7, { x: e.x, y: e.y }); } }
    return false;
  },
  wisp(e, dt, dist) { // irrblosset sprängs i frost nära dig
    if (dist < 1.1 && !e.dead) { wispBurst(e); return true; }
    if (e.state === 'move') { const a = Math.atan2(P.y - e.y, P.x - e.x) + Math.PI / 2, w = Math.sin(e.t * 5 + e.x * 3) * dt * 1.5; tryMove(e, Math.cos(a) * w, Math.sin(a) * w, 0.2); }
    return false;
  },
  spider(e, dt, dist, los) { // spottar nät på håll
    e.webT = (e.webT ?? rnd(1, 3)) - dt;
    if (e.webT <= 0 && los && dist > 2.5 && dist < 8) { e.webT = rnd(3, 4.5); const a = Math.atan2(P.y - e.y, P.x - e.x); projectiles.push({ x: e.x + Math.cos(a) * 0.4, y: e.y + Math.sin(a) * 0.4, z: 0.35, vx: Math.cos(a) * 6, vy: Math.sin(a) * 6, dmg: 3, src: e, kind: 'web', life: 2 }); play('spider', 0.5, 1.2, { x: e.x, y: e.y }); e.state = 'attack'; e.t = 0; e.didHit = true; }
    return false;
  },
  fly(e, dt, dist, los) { // fladdermöss fladdrar i sicksack
    if (e.state === 'move' && los) { const a = Math.atan2(P.y - e.y, P.x - e.x) + Math.PI / 2, w = Math.sin(e.t * 7 + e.x * 5) * dt * 2.2; tryMove(e, Math.cos(a) * w, Math.sin(a) * w, 0.2); }
    return false;
  },
  leap(e, dt, dist, los) { // hunden hoppar på dig
    if (e.leapT > 0) { e.leapT -= dt; const ox = e.x, oy = e.y; tryMove(e, Math.cos(e.leapA) * 7 * dt, Math.sin(e.leapA) * 7 * dt, 0.28); e.mvx = e.x - ox; e.mvy = e.y - oy; e.state = 'attack'; e.t = 0.1;
      if (!e.leapHit && dist < 0.9) { e.leapHit = true; hurtPlayer(e.d.dmg, e.x, e.y, 'melee'); if (e.d.frostBite) P.slowT = Math.max(P.slowT, 1.5 * Math.max(0.2, 1 - mod('coldResist'))); } return true; }
    e.leapCd = (e.leapCd ?? rnd(1, 2)) - dt;
    if (e.leapCd <= 0 && los && dist > 2.2 && dist < 4.5) { e.leapCd = rnd(2.5, 3.5); e.leapT = 0.45; e.leapHit = false; e.leapA = Math.atan2(P.y - e.y, P.x - e.x); play('hound', 0.6, rnd(0.9, 1.1), { x: e.x, y: e.y }); return true; }
    return false;
  },
  bomb(e, dt, dist) { // bombskelettet springer fram och sprängs
    e.fuseSndT = (e.fuseSndT || 0) - dt; if (e.fuseSndT <= 0 && dist < 8) { e.fuseSndT = 1.2; play('fuse', 0.4, 1, { x: e.x, y: e.y }); }
    if (e.lit !== undefined) { e.lit -= dt; e.state = 'attack'; if (e.lit <= 0) bomberBlow(e); return true; }
    if (dist < 1.3) { e.lit = 0.6; e.t = 0; play('fuse', 0.8, 1.6, { x: e.x, y: e.y }); spawnText(e.x, e.y, '!!', '#ff5030'); return true; }
    return false;
  },
  shield(e, dt) { // sköldbäraren vänder sig långsamt mot dig
    const want = Math.atan2(P.y - e.y, P.x - e.x); let d = want - (e.face ?? want); d = Math.atan2(Math.sin(d), Math.cos(d)); e.face = (e.face ?? want) + clamp(d, -1.6 * dt, 1.6 * dt);
    return false;
  },
  spore(e, dt, dist, los) { // svampmannen släpper giftmoln
    e.sporeT = (e.sporeT ?? rnd(1, 2.5)) - dt;
    if (e.sporeT <= 0 && dist < 5 && los) { e.sporeT = rnd(3.5, 5); sporeCloud(e.x + (P.x - e.x) * 0.35, e.y + (P.y - e.y) * 0.35); e.state = 'attack'; e.t = 0; e.didHit = true; }
    return false;
  },
  blink(e, dt) { e.blinkCd = (e.blinkCd || 0) - dt; return false; },
  split() { return false; },
  summon(e, dt, dist, los) { // benmagikern väcker skelett, högst två åt gången
    e.summonT = (e.summonT ?? rnd(2, 4)) - dt;
    if (e.summonT > 0 || !los || dist > 12 || e.state !== 'move') return false;
    e.summonT = rnd(8, 11);
    if (ents.filter(o => o.master === e && !o.dead).length >= 2) return false;
    const a0 = rnd(0, TAU); let x = 0, y = 0, found = false;
    for (let k = 0; k < 8 && !found; k++) { const a = a0 + k * TAU / 8; x = e.x + Math.cos(a) * 1.3; y = e.y + Math.sin(a) * 1.3; found = freeSpot(x, y, 0.3); }
    if (!found) return false;
    const m = makeEnemy('S', x, y); m.alert = true; m.master = e; m.state = 'pain'; m.t = 0; ents.push(m); totalEnemies++;
    spawnPuff(x, y, 8); play('hiss', 0.6, 0.6, { x, y }); say('BENMAGIKERN VÄCKER DE DÖDA', 1.5);
    return false;
  },
  heal(e, dt) { // orkshamanen helar och driver på sina vänner
    e.healT = (e.healT ?? rnd(1.5, 3)) - dt;
    if (e.healT > 0 || e.state === 'attack' || e.state === 'pain') return false;
    e.healT = 5;
    let n = 0;
    for (const o of ents) {
      if (o.dead || o.boss || Math.hypot(o.x - e.x, o.y - e.y) > 5.5) continue;
      if (o !== e && o.hp < o.maxHp) { o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.35); n++; }
      if (o !== e) { o.haste = 3.5; o.alert = true; }
      for (let j = 0; j < 3; j++) particles.push({ x: o.x + rnd(-0.2, 0.2), y: o.y + rnd(-0.2, 0.2), z: rnd(0.2, 0.8), vx: 0, vy: 0, vz: rnd(0.6, 1.2), life: 0.6, maxLife: 0.6, frames: fx.hit, img: fx.hit[0], size: 0.22, add: true });
    }
    play('health', 0.4, 0.6, { x: e.x, y: e.y });
    if (n) e.flash = 0.1;
    return false;
  },
  stealth(e, dt, dist) { // gravrövaren syns bara på nära håll, när den anfaller eller har träffats
    e.revealT = Math.max(0, (e.revealT || 0) - dt);
    const want = e.state === 'attack' || e.state === 'pain' || dist < 2.2 || e.revealT > 0 ? 0 : 0.88;
    e.ghost = e.ghost === undefined ? want : e.ghost + clamp(want - e.ghost, -dt * 3, dt * 1.2);
    return false;
  },
  charge(e, dt, dist, los) { // orkkrigaren stormar fram och blir yr om den krockar i en vägg
    e.chargeCd = (e.chargeCd ?? rnd(2, 4)) - dt;
    if (e.stun > 0) { e.stun -= dt; e.state = 'pain'; e.t = Math.min(e.t, 0.25); return true; }
    if (e.charge > 0) {
      e.charge -= dt; e.state = 'move';
      const sp = 5.2 * diff().speed * dt * (e.slow > 0 ? 0.5 : 1), ox = e.x, oy = e.y;
      tryMove(e, Math.cos(e.chargeA) * sp, Math.sin(e.chargeA) * sp, 0.3);
      e.mvx = e.x - ox; e.mvy = e.y - oy;
      if (Math.hypot(P.x - e.x, P.y - e.y) < 0.8) { // träff: skada och knuff
        e.charge = 0; e.cd = 1;
        hurtPlayer(e.d.dmg * 1.3 * (1 + 0.1 * (run.depth - 1)), e.x, e.y, 'melee'); play('bigboom', 0.5, 1.3);
        tryMove(P, Math.cos(e.chargeA) * 0.7, Math.sin(e.chargeA) * 0.7, 0.25); P.shake = Math.max(P.shake, 2);
      } else if (Math.hypot(e.x - ox, e.y - oy) < sp * 0.35) { // krock i väggen
        e.charge = 0; e.stun = 1.6; e.t = 0; play('bigboom', 0.5, 0.7, { x: e.x, y: e.y }); say('ORKKRIGAREN ÄR YR!', 1);
      }
      return true;
    }
    if (los && dist > 2.5 && dist < 8 && e.chargeCd <= 0 && e.state === 'move') {
      e.chargeCd = rnd(5, 7); e.charge = 1.3; e.chargeA = Math.atan2(P.y - e.y, P.x - e.x);
      play('roar', 0.7, 0.7, { x: e.x, y: e.y });
      return true;
    }
    return false;
  },
};
// kind: undefined = eldklot, 'orb' = benmagikerns sökande klot, 'bolt' = shamanens gröna blixt
const PROP_GLOW = { c: [255, 170, 70], i: [90, 200, 255], F: [80, 255, 200], w: [255, 60, 70], y: [200, 80, 255], ')': [190, 120, 255], '?': [255, 140, 50] };
const PROJ_TINT_ARROW = [200, 180, 140];
const PROJ_TINT = { wave: [200, 200, 255], sorb: [150, 200, 255], ice: [170, 230, 255], blue: [90, 170, 255], rock: [150, 110, 80], orb: [190, 100, 255], bolt: [110, 255, 110], gren: [230, 230, 200], flare: [255, 110, 70], spark: [255, 200, 90] };
function shootFireball(src, a, speed, dmg, big, kind) {
  const r = src.boss ? 1.1 : 0.4;
  projectiles.push({ x: src.x + Math.cos(a) * r, y: src.y + Math.sin(a) * r, z: kind === 'rock' && !big ? 0.22 : src.boss ? 0.8 : 0.55, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, dmg, src, big, kind, life: kind === 'orb' ? 5 : 6 }); // ogerns stenring rullar lågt: hoppa över
}
function updateProjectiles(dt) {
  for (const p of projectiles) {
    if (p.kind === 'orb') { // svänger mot spelaren, men långsamt nog att springa ifrån
      const sp = Math.hypot(p.vx, p.vy), cur = Math.atan2(p.vy, p.vx);
      let d = Math.atan2(P.y - p.y, P.x - p.x) - cur; d = Math.atan2(Math.sin(d), Math.cos(d));
      const na = cur + clamp(d, -1.4 * dt, 1.4 * dt); p.vx = Math.cos(na) * sp; p.vy = Math.sin(na) * sp;
    }
    if (p.kind === 'skull') { const sp = Math.hypot(p.vx, p.vy), cur = Math.atan2(p.vy, p.vx); let d = Math.atan2(P.y - p.y, P.x - p.x) - cur; d = Math.atan2(Math.sin(d), Math.cos(d)); const na = cur + clamp(d, -2.4 * dt, 2.4 * dt); p.vx = Math.cos(na) * sp; p.vy = Math.sin(na) * sp; }
    const px0 = p.x, py0 = p.y;
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    if ((p.kind === 'magma' || p.kind === 'log') && solid(p.x, p.y) && (p.bounces ?? 0) > 0) { p.bounces--; if (solid(p.x, py0)) p.vx = -p.vx; if (solid(px0, p.y)) p.vy = -p.vy; p.x = px0; p.y = py0; play('grenade_bounce', 0.4, 0.6, { x: p.x, y: p.y }); continue; }
    if (p.z > 0.55 && p.kind !== 'log' && p.kind !== 'rock') p.z -= dt * 0.25;
    if (p.kind === 'pgren') { updateGrenade(p, dt); continue; }
    if (p.kind === 'axe') { updateThrownAxe(p, dt); continue; }
    if (p.kind === 'nail') { updateNail(p, dt); continue; }
    if (p.kind === 'parrow') { updateArrow(p, dt); continue; }
    if (p.kind === 'sorb') { updateSorb(p, dt); continue; }
    if (p.kind === 'barrel') { // sparkat krutfat: smäller mot fiende eller vägg
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; p.vx *= 0.99; p.vy *= 0.99;
      if (solid(p.x, p.y) || p.life <= 0 || ents.some(e => !e.dead && !e.dormant && Math.hypot(e.x - p.x, e.y - p.y) < 0.6)) { p.dead = true; fuses.push({ e: { dead: true }, x: p.x - p.vx * 0.03, y: p.y - p.vy * 0.03, t: 0.01, dmg: 30 * (1 + mod('dmg') * 0.5), r: 2.4, hurt: true }); }
      continue;
    }
    if (p.friendly) { // spelarens granat och bloss: smäller vid fiende, vägg eller när tiden är ute
      const hit = ents.find(e => !e.dead && !e.dying && Math.hypot(e.x - p.x, e.y - p.y) < (p.kind === 'gren' ? 0.5 : 0.45));
      if (solid(p.x, p.y) && !hit && p.kind === 'flare' && up('bounce') && (p.bounces || 0) < 2) { // ekoblosset
        const ox = p.x - p.vx * dt, oy = p.y - p.vy * dt;
        if (solid(p.x, oy)) p.vx = -p.vx; if (solid(ox, p.y)) p.vy = -p.vy;
        p.x = ox; p.y = oy; p.bounces = (p.bounces || 0) + 1; play('ricochet', 0.5, 0.8, { x: p.x, y: p.y });
        continue;
      }
      if (solid(p.x, p.y) || p.life <= 0 || hit) {
        p.dead = true;
        const x = p.x - p.vx * 0.03, y = p.y - p.vy * 0.03;
        if (p.kind === 'spark') { if (hit) hurtEnemy(hit, p.dmg, x, y, { noProc: true }); flareBurst(x, y, p.dmg, 1.0, true); }
        else if (p.kind === 'flare') { if (hit) { hurtEnemy(hit, p.dmg, x, y); hitMark = 0.15; } flareBurst(x, y, p.dmg); }
        else { explode(x, y, p.dmg, 2.0); play('bigboom', 0.6, 1.1, { x: p.x, y: p.y }); P.shake = Math.max(P.shake, 1); }
      }
      continue;
    }
    if (WS.charge > 0.15 && WEAPONS[P.weapon].melee && Math.hypot(p.x - P.x, p.y - P.y) < 1 && Math.abs(Math.atan2(Math.sin(Math.atan2(p.y - P.y, p.x - P.x) - P.a), Math.cos(Math.atan2(p.y - P.y, p.x - P.x) - P.a))) < 0.9) { p.dead = true; play('shield_block', 0.6, 1.2); sparks(p.x, p.y, 0.5, 4); continue; } // yxan blockerar
    const pr = (p.big ? 0.5 : 0.35) * (P.crouch > 0.5 ? 0.6 : 1), low = (p.z || 0.5) < 0.32;
    if (Math.hypot(p.x - P.x, p.y - P.y) < pr && !(low && P.jz > 0.22)) { hurtPlayer(p.dmg, p.src.x, p.src.y, 'proj'); p.dead = true; if (p.kind === 'web' && mod('hazardImmune') <= 0) { P.slowT = Math.max(P.slowT, 2.5); say('FAST I NÄTET', 1); play('web', 0.7); } }
    else if (solid(p.x, p.y) || p.life <= 0) p.dead = true;
    if (p.dead) {
      play('fireburst', 0.5, rnd(0.9, 1.1), { x: p.x, y: p.y });
      for (let i = 0; i < 3; i++) particles.push({ x: p.x - p.vx * 0.02, y: p.y - p.vy * 0.02, z: 0.45, vx: rnd(-1, 1), vy: rnd(-1, 1), vz: rnd(0, 1), life: 0.35, maxLife: 0.35, frames: fx.fireball, img: fx.fireball[0], size: 0.3, add: true });
    }
  }
  projectiles = projectiles.filter(p => !p.dead);
}
function updateParticles(dt) {
  for (const p of particles) {
    p.life -= dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.drift) { p.z += p.vz * dt; if (p.sway !== undefined) { p.sway += dt * 3; p.x += Math.cos(p.sway) * dt * 0.3; p.y += Math.sin(p.sway * 1.3) * dt * 0.3; } }
    if (solid(p.x, p.y)) { p.x -= p.vx * dt; p.y -= p.vy * dt; p.vx *= -0.3; p.vy *= -0.3; }
    if (p.grav) { p.vz -= 6 * dt; p.z += p.vz * dt; if (p.z < 0) { p.z = 0; if (p.bounce && p.vz < -1) { p.vz *= -0.35; } else { p.vz = 0; p.vx *= 0.8; p.vy *= 0.8; } } }
    if (p.flap || p.sway !== undefined) p.img = p.frames[Math.floor(tmr * (p.flap ? 14 : 6) + (p.sway || 0)) % p.frames.length];
    else if (p.frames) p.img = p.frames[clamp(Math.floor((1 - p.life / p.maxLife) * p.frames.length), 0, p.frames.length - 1)];
  }
  particles = particles.filter(p => p.life > 0 && (p.z > -0.05 || !p.drift));
  if (particles.length > 260) particles.splice(0, particles.length - 260);
}

// ---------- Bossarna ----------
// Gemensamt: dödsanimation, status, faser (2 under 2/3 HP, 3 under 1/3) och läten. Resten styrs av BOSS_AI[id].
function updateBoss(b, dt) {
  b.t += dt; b.flash = Math.max(0, b.flash - dt);
  if (b.dying) {
    b.dying += dt; P.shake = Math.max(P.shake, 1.5);
    if (Math.random() < dt * 12) explodeFx(b.x + rnd(-1, 1), b.y + rnd(-1, 1), rnd(0.3, 1.6));
    if (b.dying > (b.guardian ? 1.6 : 2.6)) { b.dying = 0; b.dead = true; if (b.guardian) finishGuardian(b); else finishBoss(b); }
    return;
  }
  if (b.dead) return;
  if (b.asleep) { // väktaren vaknar när man kommer in i rummet eller skjuter på den
    if (b.hp < b.maxHp || (Math.hypot(P.x - b.x, P.y - b.y) < 6.5 && hasLOS(b.x, b.y, P.x, P.y))) wakeGuardian(b); else return;
  }
  statusTick(b, dt); if (b.dead || b.dying) return;
  const dx = P.x - b.x, dy = P.y - b.y, dist = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
  const ph = b.hp < b.maxHp / 3 ? 3 : b.hp < b.maxHp * 2 / 3 ? 2 : 1;
  if (ph !== b.phase) { b.phase = ph; hitStop = 0.18; play('bossroar', 1, ph === 3 ? 1.1 : 0.9); say(b.d.phaseMsg[ph - 2], 2.5); P.shake = 2; }
  b.growlT -= dt; if (b.growlT <= 0) { b.growlT = rnd(6, 10); play('bossroar', 0.6, rnd(0.8, 1)); }
  b.mvx = b.mvy = 0;
  b.fightT = (b.fightT || 0) + dt;
  if (!b.enraged && b.fightT > (b.guardian ? 60 : 90)) { b.enraged = true; b.d = { ...b.d, speed: b.d.speed * 1.3, dmg: b.d.dmg * 1.2 }; say(b.d.name + ' BLIR RASANDE!', 2.5); play('bossroar', 1, 0.7); } // ilskemätaren
  if (b.stun > 0) { b.stun -= dt; return; }
  if (b.state === 'special') { BOSS_SPECIAL[b.id](b, dt, dist, ang, ph); return; }
  b.spT = (b.spT ?? rnd(6, 9)) - dt;
  if (b.spT <= 0 && b.state !== 'hidden' && b.state !== 'charge' && b.state !== 'sink' && !b.hidden && hasLOS(b.x, b.y, P.x, P.y)) { b.spT = rnd(9, 13) / (ph === 3 ? 1.4 : 1); b.state = 'special'; b.t = 0; b.didHit = false; b.spK = b.spK ? 0 : 1; return; }
  BOSS_AI[b.id](b, dt, dist, ang, ph);
}
function bossStagger(b, dmg) { // många träffar i följd: bossen blir yr
  b.stagAcc = (b.stagAcc || 0) * Math.exp(-(tmr - (b.stagT || tmr)) / 2) + dmg; b.stagT = tmr;
  if (b.stagAcc > b.maxHp * 0.12 && (b.stagCd || 0) < tmr && !b.hidden) { b.stagAcc = 0; b.stagCd = tmr + 9; b.stun = 1.2; b.state = b.id === 'ogre' ? 'walk' : 'idle'; say(b.d.name + ' VACKLAR!', 1.5); play('bigboom', 0.5, 0.8, { x: b.x, y: b.y }); }
}
// ---------- Bossarnas specialanfall (två per boss, växlar) ----------
const TAUNTS = { frost: ['FRYS!', 'DITT BLOD STELNAR', 'VINTERN TAR ALLA'], demon: ['DINA BEN BLIR MINA', 'BRINN!', 'KNÄFALL!'], beast: ['GLÖDEN VÄNTAR DIG', 'SMÄLT!', 'GRRRAAH!'], nightmare: ['DU KAN INTE VAKNA', 'MÖRKRET ÄR MITT', 'SPRING, LILLA RÅTTA'],
  ogre: ['OGERN KROSSA!', 'LITEN MAT!', 'HAHA! PLATT!'], ghost: ['STANNA HOS MIG...', 'KALLT, VISST?', 'DU HÖR TILL OSS NU'] };
function taunt(b) { if (!b || (b.tauntT || 0) > tmr || Math.random() > 0.35) return; b.tauntT = tmr + 8; const t = TAUNTS[b.id]; if (t) say(`${b.d.name}: "${t[(Math.random() * t.length) | 0]}"`, 2.2); }
function fallHazard(x, y, kind, dmg, warn) { addHazard(x, y, kind, { warn, life: 0.25, r: 0.85, dmg }); if (fx.parts.shadow) decals.push({ x, y, img: fx.parts.shadow[0], size: 0.06, life: warn + 0.3, shadow: true }); }
const BOSS_SPECIAL = {
  frost(b, dt, dist, ang, ph) {
    if (b.spK) { // frostnova: hoppa för att undvika
      if (b.t < 0.05) { bossWarn(b, 'FROSTNOVA – HOPPA!'); play('frost_boss_roar', 0.9, 0.9); }
      if (!settings.lowfx && b.t < 1) for (let i = 0; i < 3; i++) { const a = rnd(0, TAU), r = (1 - b.t) * 6; particles.push({ x: b.x + Math.cos(a) * r, y: b.y + Math.sin(a) * r, z: 0.05, vx: 0, vy: 0, vz: 0, life: 0.2, maxLife: 0.2, img: fx.hit[1], size: 0.08, add: true, tint: [150, 210, 255] }); }
      if (b.t > 1 && !b.didHit) { b.didHit = true; frostBurst(b.x, b.y); if (dist < 7 && P.jz < 0.2) { hurtPlayer(10, b.x, b.y, 'proj'); P.slowT = Math.max(P.slowT, 2.5); say('DU ÄR NEDKYLD', 1.2); } }
      if (b.t > 1.4) { b.state = 'idle'; b.t = 0; b.cd = 0.8; }
      return;
    }
    if (b.t < 0.05) { say('ISDRAKEN KALLAR PÅ IRRBLOSS', 1.5); play('wisp', 0.8, 0.7); for (let i = 0; i < 1 + ph; i++) { const spot = freeSpotFar(3, 6); if (spot) { const e = makeEnemy('Ü', spot[0], spot[1]); e.alert = true; e.minion = true; ents.push(e); totalEnemies++; spawnPuff(spot[0], spot[1], 6); } } }
    if (b.t > 0.8) { b.state = 'idle'; b.t = 0; b.cd = 0.6; }
  },
  demon(b, dt, dist, ang, ph) {
    if (b.spK) { // meteorregn
      if (b.t < 0.05) { bossWarn(b, 'ELD FALLER FRÅN OVAN!'); play('bossroar', 0.8, 1.1); for (let i = 0; i < 4 + ph * 2; i++) { const a = rnd(0, TAU), r = i ? rnd(0.8, 4) : 0; fallHazard(P.x + Math.cos(a) * r, P.y + Math.sin(a) * r, 'meteor', 14, 1 + i * 0.12); } }
      if (b.t > 1.8) { b.state = 'idle'; b.t = 0; b.cd = 1; }
      return;
    }
    // dykanfall: lyfter och dyker rakt genom spelarens plats
    if (b.t < 0.05) { b.diveA = ang; b.diveHit = false; bossWarn(b, 'BENDEMONEN DYKER!'); play('whoosh', 0.9, 0.6); }
    if (b.t > 0.7 && b.t < 1.6) { bossMove(b, b.diveA, 9 * dt); if (!b.diveHit && Math.hypot(P.x - b.x, P.y - b.y) < 1.3 && P.crouch < 0.5) { b.diveHit = true; hurtPlayer(b.d.dmg, b.x, b.y, 'melee'); P.shake = 2; taunt(b); } }
    if (b.t > 1.9) { b.state = 'idle'; b.t = 0; b.cd = 0.8; }
  },
  beast(b, dt, dist, ang, ph) {
    if (b.spK) { // lavavåg: en ring som växer – hoppa över den
      if (b.t < 0.05) { bossWarn(b, 'LAVAVÅGEN – HOPPA!'); play('fireburst', 0.9, 0.5); waves.push({ x: b.x, y: b.y, r: 0.5, sp: 3.6, dmg: 14, hit: false }); if (ph === 3) setTimeout(() => waves.push({ x: b.x, y: b.y, r: 0.5, sp: 3.6, dmg: 14, hit: false }), 900); }
      if (b.t > 1.2) { b.state = 'idle'; b.t = 0; b.cd = 1.2; }
      return;
    }
    // studsande magmabollar
    if (b.t < 0.05) { play('fireburst', 0.8, 0.7); for (let i = 0; i < 2 + ph; i++) projectiles.push({ x: b.x, y: b.y, z: 0.5, vx: Math.cos(ang + rnd(-0.8, 0.8)) * 5, vy: Math.sin(ang + rnd(-0.8, 0.8)) * 5, dmg: 10, src: b, big: true, kind: 'magma', life: 6, bounces: 4 }); }
    if (b.t > 0.8) { b.state = 'idle'; b.t = 0; b.cd = 1; }
  },
  nightmare(b, dt, dist, ang, ph) {
    if (b.spK) { // skuggkloner stormar in från sidorna
      if (b.t < 0.05) { bossWarn(b, 'SKUGGORNA RIDER!'); play('bossroar', 0.8, 1.5);
        for (let i = 0; i < 1 + ph; i++) { const a = rnd(0, TAU), x = P.x + Math.cos(a) * 7, y = P.y + Math.sin(a) * 7; if (!solid(x, y)) clones.push({ x, y, a: Math.atan2(P.y - y, P.x - x), t: -0.6 - i * 0.4, hit: false }); } }
      if (b.t > 1.5) { b.state = 'idle'; b.t = 0; b.cd = 1; }
      return;
    }
    if (b.t < 0.05) { darkT = 5; say('MARDRÖMMEN SLÄCKER LJUSET', 2); play('moan', 0.8, 0.6); }
    if (b.t > 0.6) { b.state = 'idle'; b.t = 0; b.cd = 0.5; }
  },
  ogre(b, dt, dist, ang, ph) {
    if (b.spK) { // taket rasar: stenar med skuggor som varning
      if (b.t < 0.05) { P.shake = 2.5; play('bigboom', 0.9, 0.5); bossWarn(b, 'TAKET RASAR!'); for (let i = 0; i < 5 + ph * 2; i++) { const a = rnd(0, TAU), r = i ? rnd(0.6, 4.5) : 0.2; fallHazard(P.x + Math.cos(a) * r, P.y + Math.sin(a) * r, 'rockfall', 12, 1.1 + i * 0.1); } }
      if (b.t > 2) { b.state = 'walk'; b.t = 0; b.cd = 0.8; }
      return;
    }
    // rullande stockar längs marken – hoppa över
    if (b.t < 0.05) { bossWarn(b, 'STOCKAR – HOPPA!'); play('whoosh', 0.8, 0.4); for (let i = -1; i <= 1; i += ph === 1 ? 2 : 1) projectiles.push({ x: b.x, y: b.y, z: 0.15, vx: Math.cos(ang + i * 0.3) * 4.5, vy: Math.sin(ang + i * 0.3) * 4.5, dmg: 12, src: b, big: true, kind: 'log', life: 5 }); }
    if (b.t > 0.9) { b.state = 'walk'; b.t = 0; b.cd = 1; }
  },
  ghost(b, dt, dist, ang, ph) {
    if (b.spK) { // spegelbilder som skjuter
      if (b.t < 0.05) { play('moan', 0.8, 1.2); say('VÅLNADEN DELAR SIG', 1.5); for (let i = 0; i < 2; i++) { const spot = freeSpotFar(3, 6); if (spot) mirrors.push({ x: spot[0], y: spot[1], t: 0, life: 7, shotT: rnd(1, 2) }); } }
      if (b.t > 0.8) { b.state = 'chase'; b.t = 0; b.cd = 1; }
      return;
    }
    if (b.t < 0.05) { play('hiss', 0.8, 0.5); for (let i = 0; i < 2 + ph; i++) projectiles.push({ x: b.x, y: b.y, z: 0.6, vx: Math.cos(ang + (i - 1) * 0.5) * 3, vy: Math.sin(ang + (i - 1) * 0.5) * 3, dmg: 8, src: b, kind: 'skull', life: 4.5 }); }
    if (b.t > 0.7) { b.state = 'chase'; b.t = 0; b.cd = 1; }
  },
};
let waves = [], clones = [], mirrors = [], darkT = 0, floorEvent = '', fogMul = 1;
function updateBossFx(dt) { // vågor, kloner och spegelbilder
  darkT = Math.max(0, darkT - dt);
  for (const w of waves) {
    w.r += w.sp * dt;
    if (!settings.lowfx) for (let i = 0; i < 4; i++) { const a = rnd(0, TAU); particles.push({ x: w.x + Math.cos(a) * w.r, y: w.y + Math.sin(a) * w.r, z: 0, vx: 0, vy: 0, vz: 0.6, life: 0.3, maxLife: 0.3, frames: fx.fire, img: fx.fire[0], size: 0.3, add: true, drift: true }); }
    const d = Math.hypot(P.x - w.x, P.y - w.y);
    if (!w.hit && Math.abs(d - w.r) < 0.35 && P.jz < 0.22) { w.hit = true; hurtPlayer(w.dmg, w.x, w.y, 'proj'); }
  }
  waves = waves.filter(w => w.r < 14);
  for (const c of clones) {
    c.t += dt; if (c.t < 0) continue;
    const ox = c.x, oy = c.y; c.x += Math.cos(c.a) * 7 * dt; c.y += Math.sin(c.a) * 7 * dt;
    if (solid(c.x, c.y)) { c.t = 99; spawnPuff(ox, oy, 6); }
    if (!c.hit && Math.hypot(P.x - c.x, P.y - c.y) < 0.9) { c.hit = true; hurtPlayer(12, c.x, c.y, 'melee'); }
  }
  clones = clones.filter(c => c.t < 2.5);
  for (const m of mirrors) {
    m.t += dt; m.shotT -= dt;
    if (m.shotT <= 0 && boss && !boss.dead) { m.shotT = rnd(1.6, 2.4); shootFireball({ x: m.x, y: m.y, boss: false }, Math.atan2(P.y - m.y, P.x - m.x), 3.2, 6, false, 'orb'); }
  }
  mirrors = mirrors.filter(m => m.t < m.life && !(boss && boss.dead));
}
function bossWarn(b, text) { if ((b.warnT || 0) < tmr) { b.warnT = tmr + 3; say(text, 1.2); play('stinger', 0.25, 1.6); } }
function bossMove(b, a, sp) { const ox = b.x, oy = b.y; tryMove(b, Math.cos(a) * sp, Math.sin(a) * sp, 0.9); b.mvx = b.x - ox; b.mvy = b.y - oy; return Math.hypot(b.mvx, b.mvy); }
function freeSpotFar(minD, maxD) { // fri plats på lagom avstånd från spelaren (teleport, framträdanden)
  for (let i = 0; i < 40; i++) {
    const a = rnd(0, TAU), r = rnd(minD, maxD), x = P.x + Math.cos(a) * r, y = P.y + Math.sin(a) * r;
    if (freeSpot(x, y, 0.9) && hasLOS(P.x, P.y, x, y)) return [x, y];
  }
  return null;
}
const BOSS_AI = {
  // Bendemonen: eldfläktar och vingslag, kallar på skelett från fas 2, snabbare i fas 3
  demon(b, dt, dist, ang, ph) {
    const fast = ph === 3 ? 1.5 : 1;
    if (ph >= 2) { b.summonT -= dt; if (b.summonT <= 0) { b.summonT = ph === 3 ? 9 : 13; summonMinions(b); } }
    if (b.state === 'breath') { // eldfläkt
      const k = Math.floor(b.t * 12);
      if (k >= 6 && k <= 14 && k !== b.lastShot && k % 2 === 0) {
        b.lastShot = k; const n = ph === 3 ? 7 : 5;
        for (let i = 0; i < n; i++) shootFireball(b, ang + (i - (n - 1) / 2) * 0.16 + rnd(-0.03, 0.03), 5.5 + ph * 0.5, 9, true);
        play('whoosh', 0.7, 0.6, { x: b.x, y: b.y });
      }
      if (b.t > 1.5) { b.state = 'idle'; b.t = 0; b.cd = rnd(1.4, 2.2) / fast; }
      return;
    }
    if (b.state === 'slam') { // vingslag + stöt
      if (!b.didHit && b.t > 0.85) {
        b.didHit = true; P.shake = Math.max(P.shake, 2.5); play('bigboom', 0.7, 0.8);
        if (dist < b.d.range) hurtPlayer(b.d.dmg, b.x, b.y, 'melee');
        const n = ph === 3 ? 14 : 10;
        if (ph >= 2) for (let i = 0; i < n; i++) shootFireball(b, i / n * TAU + b.t, 4.2, 8, true);
      }
      if (b.t > 1.3) { b.state = 'idle'; b.t = 0; b.cd = rnd(1.2, 2) / fast; }
      return;
    }
    b.cd -= dt;
    if (b.cd <= 0 && hasLOS(b.x, b.y, P.x, P.y)) {
      b.t = 0; b.didHit = false; b.lastShot = -1;
      b.state = dist < b.d.range + 0.6 || (ph >= 2 && Math.random() < 0.35) ? 'slam' : 'breath';
      if (b.state === 'slam') { play('bossroar', 0.7, 1.2); bossWarn(b, 'BENDEMONEN LYFTER VINGARNA!'); }
      return;
    }
    if (dist > 3) bossMove(b, ang, b.d.speed * fast * dt * (b.slow > 0 ? 0.5 : 1));
  },
  // Helvetesbesten: eldklot och eldpelare under spelaren; från fas 2 sjunker den ned och dyker upp någon annanstans
  beast(b, dt, dist, ang, ph) {
    if (b.state === 'breath') {
      const k = Math.floor(b.t / 0.22);
      if (k >= 1 && k <= 3 + (ph === 3 ? 2 : 0) && k !== b.lastShot) { b.lastShot = k; shootFireball(b, ang + rnd(-0.05, 0.05), 6.5, 10, true); play('whoosh', 0.6, 0.7, { x: b.x, y: b.y }); }
      if (b.t > 1.3) { b.state = 'idle'; b.t = 0; b.cd = rnd(1.3, 2) / (ph === 3 ? 1.4 : 1); }
      return;
    }
    if (b.state === 'burn') {
      if (!b.didHit && b.t > 0.35) {
        b.didHit = true; play('fireburst', 0.8, 0.6);
        const n = 1 + ph * 2;
        for (let i = 0; i < n; i++) { const a = rnd(0, TAU), r = i ? rnd(0.8, 2.6) : 0; addHazard(P.x + Math.cos(a) * r + P.vx * 0.3, P.y + Math.sin(a) * r + P.vy * 0.3, 'pillar', { warn: 0.9, life: 0.9, r: 0.75, dmg: 16 }); }
      }
      if (b.t > 0.9) { b.state = 'idle'; b.t = 0; b.cd = rnd(1.2, 1.8); }
      return;
    }
    if (b.state === 'sink') { // försvinner ned i marken och dyker upp igen
      if (b.t > 0.6 && !b.hidden) { b.hidden = true; play('fireburst', 0.7, 0.5, { x: b.x, y: b.y }); }
      if (b.t > 1.4) {
        const spot = freeSpotFar(5, 9); if (spot) [b.x, b.y] = spot;
        b.hidden = false; b.state = 'idle'; b.t = 0; b.cd = 0.4; spawnPuff(b.x, b.y, 12); play('bossroar', 0.8, 0.8);
        if (ph === 3) for (let i = 0; i < 10; i++) shootFireball(b, i / 10 * TAU, 4.5, 8, true);
      }
      return;
    }
    b.cd -= dt; b.sinkT = (b.sinkT ?? 8) - dt;
    if (ph >= 2 && b.sinkT <= 0) { b.sinkT = ph === 3 ? 7 : 10; b.state = 'sink'; b.t = 0; return; }
    if (b.cd <= 0 && hasLOS(b.x, b.y, P.x, P.y)) { b.t = 0; b.didHit = false; b.lastShot = -1; b.state = Math.random() < (ph === 1 ? 0.45 : 0.6) ? 'burn' : 'breath'; play('bossroar', 0.6, 1.3); if (b.state === 'burn') bossWarn(b, 'MARKEN GLÖDER – FLYTTA DIG!'); return; }
    if (dist > 6) bossMove(b, ang, b.d.speed * dt * (b.slow > 0 ? 0.5 : 1));
  },
  // Mardrömmen: cirklar och skjuter blå eld, stampar och stormar fram med ett spår av blå eld; yr om den krockar
  nightmare(b, dt, dist, ang, ph) {
    const sp = (ph === 3 ? 1.3 : 1) * (b.slow > 0 ? 0.5 : 1);
    if (b.state === 'windup') { if (b.t > (ph === 3 ? 0.5 : 0.8)) { b.state = 'charge'; b.t = 0; b.chargeA = Math.atan2(P.y - b.y, P.x - b.x); b.trail = 0; } return; }
    if (b.state === 'charge') {
      const moved = bossMove(b, b.chargeA, 8 * sp * dt);
      b.trail += moved; if (b.trail > 0.45) { b.trail = 0; addHazard(b.x, b.y, 'bluefire', { warn: 0, life: 3, r: 0.6, dmg: 7 }); }
      if (dist < 1.3 && !b.didHit) { b.didHit = true; hurtPlayer(b.d.dmg, b.x, b.y, 'melee'); tryMove(P, Math.cos(b.chargeA) * 0.9, Math.sin(b.chargeA) * 0.9, 0.25); P.shake = 2.5; play('bigboom', 0.6, 1.2); }
      if (moved < 8 * sp * dt * 0.3 || b.t > 2) { // vägg: yr och sårbar en stund
        if (b.t <= 2) { b.stun = 1.4; P.shake = Math.max(P.shake, 1.5); play('bigboom', 0.7, 0.7, { x: b.x, y: b.y }); say('MARDRÖMMEN ÄR YR!', 1); }
        b.charges = (b.charges || 1) - 1;
        b.state = b.charges > 0 ? 'windup' : 'circle'; b.t = 0; b.cd = rnd(2, 3);
      }
      return;
    }
    // cirkla runt spelaren på avstånd och skjut blå eld
    b.cd -= dt; b.shotT = (b.shotT ?? 1.2) - dt; b.state = 'circle';
    const want = 6, side = ang + Math.PI / 2 * (b.dir || 1) + (dist > want ? -0.6 : 0.6) * (b.dir || 1);
    if (bossMove(b, side, b.d.speed * sp * dt) < b.d.speed * sp * dt * 0.3) b.dir = -(b.dir || 1);
    if (b.shotT <= 0 && hasLOS(b.x, b.y, P.x, P.y)) { b.shotT = ph === 3 ? 0.8 : 1.2; shootFireball(b, ang + rnd(-0.04, 0.04), 6, 9, false, 'blue'); play('whoosh', 0.5, 1.1, { x: b.x, y: b.y }); }
    if (b.cd <= 0 && hasLOS(b.x, b.y, P.x, P.y)) { b.state = 'windup'; b.t = 0; b.didHit = false; b.charges = ph >= 2 ? 2 : 1; play('bossroar', 0.9, 1.4); bossWarn(b, 'MARDRÖMMEN STAMPAR – GÅ ÅT SIDAN!'); }
  },
  // Ogern: kliver fram och krossar marken (stötvåg av stenar), kastar block på håll, kallar på orkkrigare i fas 2
  ogre(b, dt, dist, ang, ph) {
    const fast = (ph === 3 ? 1.45 : 1) * (b.slow > 0 ? 0.5 : 1);
    if (b.state === 'smash' || b.state === 'throw') {
      if (!b.didHit && b.t > 0.6) {
        b.didHit = true;
        if (b.state === 'smash') {
          P.shake = Math.max(P.shake, 3); play('bigboom', 0.9, 0.6);
          if (dist < b.d.range + 0.3) hurtPlayer(b.d.dmg, b.x, b.y, 'melee');
          const n = ph === 3 ? 18 : 12;
          for (let i = 0; i < n; i++) shootFireball(b, i / n * TAU + rnd(-0.1, 0.1), 4.5, 10, false, 'rock');
        } else { shootFireball(b, ang, 7.5, 18, true, 'rock'); play('whoosh', 0.8, 0.5, { x: b.x, y: b.y }); }
      }
      if (b.t > 1.1) { b.state = 'walk'; b.t = 0; b.cd = rnd(1, 1.8) / fast; }
      return;
    }
    if (ph >= 2) { b.summonT -= dt; if (b.summonT <= 0) { b.summonT = 14; const spot = freeSpotFar(3, 6); if (spot) { const e = makeEnemy('W', spot[0], spot[1]); e.alert = true; e.minion = true; ents.push(e); totalEnemies++; spawnPuff(spot[0], spot[1], 8); say('OGERNS SÖNER KOMMER', 1.5); } } }
    b.cd -= dt; b.state = 'walk';
    if (b.cd <= 0 && dist < b.d.range + 0.5) { b.state = 'smash'; b.t = 0; b.didHit = false; play('bossroar', 0.8, 0.7); bossWarn(b, 'OGERN HÖJER KLUBBAN!'); return; }
    if (b.cd <= 0 && dist > 5 && hasLOS(b.x, b.y, P.x, P.y) && Math.random() < dt * 1.5) { b.state = 'throw'; b.t = 0; b.didHit = false; return; }
    if (dist > 2) bossMove(b, ang, b.d.speed * fast * dt);
  },
  // Isdraken: isskärvor i solfjäder, istaggar runt sig, snöstorm i fas 2
  frost(b, dt, dist, ang, ph) {
    const fast = ph === 3 ? 1.35 : 1;
    if (ph >= 2) { P.slowT = Math.max(P.slowT, 0.15); if (!settings.lowfx && Math.random() < dt * 25) particles.push({ x: P.x + rnd(-3, 3), y: P.y + rnd(-3, 3), z: 1, vx: 2, vy: rnd(-0.5, 0.5), vz: -1, life: 1, maxLife: 1, frames: fx.parts.snow || fx.hit, img: (fx.parts.snow || fx.hit)[0], size: 0.04, drift: true }); } // snöstorm
    if (b.state === 'shards') {
      const k = Math.floor(b.t / 0.18);
      if (k >= 1 && k <= 3 + ph && k !== b.lastShot) { b.lastShot = k; const n = 3 + ph; for (let i = 0; i < n; i++) shootFireball(b, ang + (i - (n - 1) / 2) * 0.14, 6, 8, false, 'ice'); play('wisp', 0.6, 0.8, { x: b.x, y: b.y }); }
      if (b.t > 1.4) { b.state = 'idle'; b.t = 0; b.cd = rnd(1.2, 2) / fast; }
      return;
    }
    if (b.state === 'slam') {
      if (!b.didHit && b.t > 0.7) { b.didHit = true; P.shake = Math.max(P.shake, 2); play('ice_crack', 1, 0.6); if (dist < b.d.range) hurtPlayer(b.d.dmg, b.x, b.y, 'melee');
        const n = 8 + ph * 2; for (let i = 0; i < n; i++) { const a = i / n * TAU, r = 2.2 + (i % 2) * 1.2; addHazard(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r, 'icespike', { warn: 0.5, life: 0.8, r: 0.6, dmg: 12 }); } }
      if (b.t > 1.2) { b.state = 'idle'; b.t = 0; b.cd = rnd(1, 1.6) / fast; }
      return;
    }
    b.cd -= dt;
    if (b.cd <= 0 && hasLOS(b.x, b.y, P.x, P.y)) { b.t = 0; b.didHit = false; b.lastShot = -1; b.state = dist < b.d.range + 1 ? 'slam' : 'shards'; if (b.state === 'slam') { play('frost_boss_roar', 0.8, 1.1); bossWarn(b, 'ISDRAKEN HÖJER SPIRAN!'); } return; }
    if (dist > 3) bossMove(b, ang, b.d.speed * fast * dt * (b.slow > 0 ? 0.5 : 1));
  },
  // Vålnaden: svävar, skjuter sökande klot, försvinner och dyker upp nära spelaren med ett skrik som saktar ned
  ghost(b, dt, dist, ang, ph) {
    if (b.state === 'vanish') { if (b.t > 0.7) { b.state = 'hidden'; b.t = 0; b.hidden = true; } return; }
    if (b.state === 'hidden') {
      if (b.t > 1.2) { const spot = freeSpotFar(2.2, 3.5); if (spot) [b.x, b.y] = spot; b.hidden = false; b.state = 'appear'; b.t = 0; spawnPuff(b.x, b.y, 10); }
      return;
    }
    if (b.state === 'appear') { if (b.t > 0.6) { b.state = 'shriek'; b.t = 0; b.didHit = false; play('bossroar', 1, 1.7); } return; }
    if (b.state === 'shriek') {
      if (!b.didHit && b.t > 0.3) {
        b.didHit = true; P.shake = Math.max(P.shake, 1.5);
        if (dist < 5) { P.slowT = 2.2; hurtPlayer(b.d.dmg * 0.6, b.x, b.y); say('SKRIKET FÖRLAMAR DIG', 1); }
        if (ph >= 2) for (let i = 0; i < 2; i++) { const spot = freeSpotFar(3, 6); if (spot) { const e = makeEnemy('S', spot[0], spot[1]); e.alert = true; e.minion = true; ents.push(e); totalEnemies++; spawnPuff(spot[0], spot[1], 6); } }
      }
      if (b.t > 0.9) { b.state = 'chase'; b.t = 0; b.cd = rnd(1, 1.6); }
      return;
    }
    if (b.state === 'orbs') {
      const k = Math.floor(b.t / 0.3);
      if (k >= 1 && k <= (ph === 3 ? 5 : 3) && k !== b.lastShot) { b.lastShot = k; shootFireball(b, ang + rnd(-0.4, 0.4), 3.4, 9, false, 'orb'); play('hiss', 0.5, 0.7, { x: b.x, y: b.y }); }
      if (b.t > 1.8) { b.state = 'chase'; b.t = 0; b.cd = rnd(1.4, 2.2); }
      return;
    }
    b.cd -= dt; b.vanishT = (b.vanishT ?? 6) - dt; b.state = 'chase';
    if (b.vanishT <= 0) { b.vanishT = ph === 3 ? 4.5 : 7; b.state = 'vanish'; b.t = 0; play('whoosh', 0.7, 0.5, { x: b.x, y: b.y }); play('moan', 0.6, 0.9); bossWarn(b, 'VÅLNADEN FÖRSVANN...'); return; }
    if (b.cd <= 0 && hasLOS(b.x, b.y, P.x, P.y)) { b.state = 'orbs'; b.t = 0; b.lastShot = -1; return; }
    if (dist < b.d.range + 0.3 && (b.hitT = (b.hitT || 0) - dt) <= 0) { b.hitT = 1; hurtPlayer(b.d.dmg, b.x, b.y, 'melee'); }
    if (dist > 1.6) bossMove(b, ang + Math.sin(b.t * 2) * 0.5, b.d.speed * (ph === 3 ? 1.3 : 1) * dt * (b.slow > 0 ? 0.5 : 1));
  },
};
// ---------- Faror på marken: eldpelare (varning, sedan eld) och blå eld efter Mardrömmen ----------
let hazards = [];
function addHazard(x, y, kind, o) { if (!solid(x, y)) hazards.push({ x, y, kind, t: 0, warn: o.warn, life: o.life, r: o.r, dmg: o.dmg, hitT: 0 }); }
function updateHazards(dt) {
  for (const h of hazards) {
    h.t += dt; h.hitT -= dt;
    if (h.t < h.warn && (h.kind === 'meteor' || h.kind === 'rockfall')) continue; // fallande: skuggan varnar
    if (h.t < h.warn) { if (Math.random() < dt * 14) particles.push({ x: h.x + rnd(-h.r, h.r) * 0.7, y: h.y + rnd(-h.r, h.r) * 0.7, z: 0.02, vx: 0, vy: 0, vz: 0.4, life: 0.25, maxLife: 0.25, frames: fx.hit, img: fx.hit[0], size: 0.2, add: true, tint: [255, 80, 40] }); continue; }
    if ((h.kind === 'meteor' || h.kind === 'rockfall') && !h.landed) { h.landed = true; play(h.kind === 'meteor' ? 'fireburst' : 'bigboom', 0.6, h.kind === 'meteor' ? 0.7 : 1.2, { x: h.x, y: h.y }); P.shake = Math.max(P.shake, 0.6);
      for (let i = 0; i < 4; i++) particles.push({ x: h.x, y: h.y, z: 0.1, vx: rnd(-1.5, 1.5), vy: rnd(-1.5, 1.5), vz: rnd(1, 2), life: 0.6, img: h.kind === 'meteor' ? fx.fireball[2] : (fx.parts.rock ? fx.parts.rock[0] : fx.shards[7]), size: 0.12, grav: true, add: h.kind === 'meteor' }); }
    if (h.hitT <= 0 && Math.hypot(P.x - h.x, P.y - h.y) < h.r) { h.hitT = 0.5; hurtPlayer(h.dmg, h.x, h.y, 'proj'); }
  }
  hazards = hazards.filter(h => h.t < h.warn + h.life);
}
function summonMinions(b) {
  play('bossroar', 0.8, 1.3); say('SKELETTEN RESER SIG', 1.5);
  for (let i = 0; i < 2; i++) {
    const a = rnd(0, TAU), x = b.x + Math.cos(a) * 2.5, y = b.y + Math.sin(a) * 2.5;
    if (solid(x, y)) continue;
    const e = makeEnemy(Math.random() < 0.5 ? 'S' : 'K', x, y); e.alert = true; e.minion = true; ents.push(e); totalEnemies++;
    for (let j = 0; j < 4; j++) particles.push({ x, y, z: 0.2, vx: rnd(-1, 1), vy: rnd(-1, 1), vz: rnd(1, 2), life: 0.5, maxLife: 0.5, frames: fx.fireball, img: fx.fireball[0], size: 0.3, add: true });
  }
}
function explodeFx(x, y, z) {
  play('fireburst', 0.5, rnd(0.6, 0.9), { x, y });
  particles.push({ x, y, z, vx: rnd(-0.5, 0.5), vy: rnd(-0.5, 0.5), vz: 0, life: 0.45, maxLife: 0.45, frames: fx.fireball, img: fx.fireball[0], size: rnd(0.5, 0.9), add: true });
}
function bossDefeated(b) { // dödsanimation först
  b.dead = false; b.dying = 0.01; b.state = 'idle'; play('bossroar', 1, 0.6);
  kills--; run.kills--; // räknas när animationen är klar
  for (const e of ents) if (e.minion && !e.dead) { e.hp = 0; killEnemy(e); }
}
function missionCheck() { if (run.mission && missionProgress() >= run.mission.n) { run.gold += 100; profile.souls += 15; say('VARVETS UPPDRAG KLARAT: +100 GULD, +15 SJÄLAR', 4); logEvent('UPPDRAG KLARAT'); } run.mission = null; }
function finishBoss(b) {
  missionCheck();
  kills++; run.kills++; run.bossKilled = true; run.bosses = (run.bosses || 0) + 1; setMusic(false);
  profile.bossWins = profile.bossWins || {}; profile.bossWins[b.id] = (profile.bossWins[b.id] || 0) + 1; saveProfile(); checkAch(); play('bigboom', 1, 0.7); P.shake = 3;
  say(b.d.name + ' ÄR BESEGRAD!', 4); say('GRINDEN ÖPPNAS', 4);
  const ft = b.fightT || 0; profile.bossTimes = profile.bossTimes || {}; const rec = profile.bossTimes[b.id];
  if (!rec || ft < rec) { profile.bossTimes[b.id] = Math.round(ft); saveProfile(); say(`TID ${fmtTime(ft)} – NYTT REKORD!`, 4); } else say(`TID ${fmtTime(ft)} (REKORD ${fmtTime(rec)})`, 4);
  for (let i = 0; i < 12; i++) dropItem('gold', b.x + rnd(-1, 1), b.y + rnd(-1, 1));
  items.push({ type: 'cardpick', x: b.x, y: b.y, taken: false, drop: true, luck: 1.2, title: 'BOSSENS SKATT', legend: true }); // bättre kortval
  for (const k in doors) if (doors[k].gate) { doors[k].target = 1; play('gate', 0.8, 1, { x: doors[k].x + 0.5, y: doors[k].y + 0.5 }); }
  spawnPortal(b.x, b.y, 'boss');
}
function spawnPortal(x, y, kind) {
  // närmaste fria plats (inte i en vägg)
  let px = x, py = y;
  if (!freeSpot(px, py, 0.35)) {
    let best = null;
    for (let r = 0.5; r < 4 && !best; r += 0.5) for (let a = 0; a < TAU; a += TAU / 12) { const tx = x + Math.cos(a) * r, ty = y + Math.sin(a) * r; if (freeSpot(tx, ty, 0.35)) { best = [tx, ty]; break; } }
    if (best) [px, py] = best; else [px, py] = [P.x, P.y];
  }
  portals.push({ x: px, y: py, kind, t: 0, armed: Math.hypot(P.x - px, P.y - py) > 1 });
  if (kind === 'floor') routePortals(portals[portals.length - 1]);
  if (kind === 'floor' && !lvl.goldRoom && run && Math.random() < 0.06) { const a = rnd(0, TAU); const gx = px + Math.cos(a) * 1.8, gy = py + Math.sin(a) * 1.8; if (freeSpot(gx, gy, 0.35)) { portals.push({ x: gx, y: gy, kind: 'gold', t: 0, armed: true }); say('EN GYLLENE PORTAL!', 3); } } // sällsynt guldkammare
  spawnPuff(px, py, 10); play('secret', 0.8, 0.7); play('gate', 0.5, 1.4, { x: px, y: py });
  say(kind === 'boss' ? 'PORTALEN: DJUPARE ELLER HEM?' : 'PORTALEN TILL NÄSTA VÅNING ÄR ÖPPEN', 4);
}
function updatePortals(dt) {
  for (const p of portals) {
    p.t += dt;
    if (!settings.lowfx && Math.random() < dt * 14) { const a = rnd(0, TAU), r = rnd(1.2, 1.8); particles.push({ x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r, z: rnd(0.1, 1), vx: -Math.cos(a) * r * 1.6, vy: -Math.sin(a) * r * 1.6, vz: 0, life: 0.6, maxLife: 0.6, img: fx.hit[1], size: 0.05, add: true, tint: p.kind === 'gold' ? [255, 220, 90] : [190, 130, 255], fade: true }); } // drar in ljus
    const d = Math.hypot(P.x - p.x, P.y - p.y);
    if (d > 1.1) p.armed = true; // man måste gå ur och in igen för att använda den på nytt
    if (p.armed && d < 0.55 && p.t > 0.6) { p.armed = false; enterPortal(p); return; }
    if (d < 2.5 && p.kind === 'floor' && !run.bossrush) { const b = p.biome || biomeFor(run.depth + 1); hint = `PORTAL → ${isBossDepth(run.depth + 1) ? 'BOSSEN' : (BIOME_NAME[b] || 'NÄSTA VÅNING') + (p.biome ? ' · ' + riskText(b) : '')}`; } // vart portalen leder
    if (Math.random() < dt * 6) particles.push({ x: p.x + rnd(-0.3, 0.3), y: p.y + rnd(-0.3, 0.3), z: rnd(0.1, 1), vx: 0, vy: 0, vz: rnd(0.3, 0.8), life: 0.6, maxLife: 0.6, frames: fx.hit, img: fx.hit[0], size: 0.15, add: true, tint: [200, 150, 255] });
  }
  if (portals.length && state === 'play') { const p = portals[0], d = Math.hypot(P.x - p.x, P.y - p.y); if (d < 2.5 && !hint) hint = p.kind === 'boss' ? 'GÅ IN I PORTALEN FÖR ATT VÄLJA' : 'GÅ IN I PORTALEN: NÄSTA VÅNING'; }
}
function enterPortal(p) {
  play('whoosh', 0.8, 0.5);
  let got = 0; // guld i närheten följer med genom portalen
  for (const it of items) if (!it.taken && (it.type === 'gold' || it.type === 'goldpile') && Math.hypot(it.x - P.x, it.y - P.y) < 8) { const g0 = run.gold; pickUp(it); it.taken = true; got += run.gold - g0; }
  if (got) say(`+${got} GULD FÖLJDE MED`, 2);
  if (p.kind === 'gold') { enterGoldRoom(); return; }
  if (p.kind === 'floor' && p.biome) { run.biomeChoice = Object.assign({}, run.biomeChoice, { [run.depth + 1]: p.biome }); run.route = Object.assign({}, run.route, { [run.depth + 1]: BIOME_RISK[p.biome] || 1 }); play('route_choice', 0.7); logEvent('VÄG: ' + BIOME_NAME[p.biome]); }
  if (p.kind === 'floor') { if (floorQuest && floorQuest.kind === 'time' && levelTime <= floorQuest.limit) { run.gold += 50; say('TIDSUTMANINGEN KLARAD: +50 GULD', 3); } floorDone(); return; }
  if (run.bossrush) { bossRushNext(); return; }
  const next = run.depth + 1;
  openUI(() => CardUI.choice({
    title: (boss ? boss.d.name : 'BOSSEN') + ' ÄR BESEGRAD', subtitle: `VARV ${cycleOf(run.depth) + 1} KLARAT. VART VILL DU GÅ?`, cancel: 2,
    options: [
      { label: 'GÅ DJUPARE', text: `VARV ${cycleOf(next) + 1}: FEM NYA VÅNINGAR OCH EN NY, STARKARE BOSS. FIENDERNA BLIR TUFFARE, MEN SJÄLARNA FLER.` },
      { label: 'AVSLUTA RUNDAN', text: 'GÅ HEM SOM SEGRARE OCH TA MED SJÄLARNA.' },
      { label: 'STANNA KVAR', text: 'PLOCKA UPP GULDET FÖRST. PORTALEN FINNS KVAR.' },
    ],
  }, i => {
    closeUI();
    if (i === 0) goDeeper();
    else if (i === 1) endRun(true);
  }));
}
const MISSIONS = [{ id: 'champions', text: 'DÖDA 2 CHAMPIONS', n: 2, k: 'champions' }, { id: 'freed', text: 'BEFRIA 2 FÅNGAR', n: 2, k: 'freed' }, { id: 'challenges', text: 'KLARA 1 UTMANING', n: 1, k: 'challenges' },
  { id: 'bounty', text: 'DÖDA 2 MÄRKTA ELITER', n: 2, k: 'bounties' }, { id: 'secrets', text: 'HITTA 3 HEMLIGHETER', n: 3, k: 'secrets' }];
function missionProgress() { return run.mission ? (profile[run.mission.k] || 0) - run.mission.start : 0; }
function newMission() { const m = MISSIONS[(Math.random() * MISSIONS.length) | 0]; run.mission = { ...m, start: profile[m.k] || 0 }; }
function bossRushNext() { // bossrush: nästa boss direkt, med ett kort och full hälsa emellan
  const n = (run.rushN || 0) + 1; run.rushN = n;
  if (n >= BOSS_IDS.length) { endRun(true); return; }
  P.hp = maxHp(); P.grenades = Math.min(GREN_MAX(), P.grenades + 2);
  openUI(() => draftUI(drawCards(3, { luck: 1 }), { title: `BOSSRUSH ${n} AV ${BOSS_IDS.length}`, subtitle: 'VÄLJ ETT KORT INFÖR NÄSTA BOSS', skipLabel: 'INGET KORT' }, card => { if (card) gainCard(card); loadFloor((n + 1) * (FLOORS + 1)); lockPointer(); }));
}
function enterGoldRoom() { // hemlig nivå: guldkammaren
  logEvent('GULDKAMMAREN'); stat('goldRooms'); play('secret', 1, 0.8);
  const m = ['111111111111', '1$.$.$..$.$1', '1.C......C.1', '1$..$..$..$1', '1....P.....1', '1$..$..$..$1', '1.....$....1', '1$.$....$.$1', '111111111111'];
  const prevName = lvl.name, prevBiome = lvl.biome;
  startLevel({ map: m, name: 'GULDKAMMAREN', biome: prevBiome, floor: 'floor_tiles_blue', ceil: 'floor_stone_pattern', fog: [40, 30, 10], ambient: 0.75, rooms: [], goldRoom: true });
  spawnPortal(6.5, 6.5, 'floor'); say('GULDKAMMAREN – TA ALLT DU KAN', 4); levelBanner = 0; lvl.name = prevName;
}
function goDeeper() {
  run.loop = (run.loop || 0) + 1; run.gold += 50; newMission();
  P.hp = maxHp(); play('bossroar', 0.7, 0.6);
  openUI(() => draftUI(drawCards(3, { luck: 0.3 }), { title: `VARV ${cycleOf(run.depth + 1) + 1}`, subtitle: 'DU STIGER NED DJUPARE. VÄLJ ETT KORT.', skipLabel: 'HOPPA ÖVER (+25 GULD)' }, card => {
    if (card) gainCard(card); else run.gold += 25;
    loadFloor(run.depth + 1); lockPointer();
  }));
}

// ---------- Våningsslut, rundslut och själar ----------
let stats = null;
function floorDone() {
  if (boss) { endRun(true); return; }
  const bonus = Math.round(300 + (kills === totalEnemies ? 200 : 0) + secrets * 100 + Math.max(0, 180 - levelTime) * 2);
  score += bonus;
  const extra = []; // guldbonusar: snabb, orörd, alla hemligheter
  if (levelTime < 120) { run.gold += 20; extra.push('SNABB: +20 GULD'); }
  if (lvlStat.taken < 1) { run.gold += 40; extra.push('ORÖRD: +40 GULD'); run.untouched = (run.untouched || 0) + 1; }
  if (totalSecrets && secrets >= totalSecrets) { run.gold += 30; extra.push('ALLA HEMLIGHETER: +30 GULD'); }
  if (totalEnemies && kills >= totalEnemies) { run.gold += 25; extra.push('ALLA FIENDER: +25 GULD'); }
  if (chests.length && chests.every(c => c.open)) { run.gold += 20; extra.push('ALLA KISTOR: +20 GULD'); }
  if (!lvlStat.healed) { run.gold += 15; extra.push('INGEN HÄLSA: +15 GULD'); }
  if (mod('interest') > 0) { const g = Math.min(30, Math.round(run.gold * mod('interest'))); if (g) { run.gold += g; extra.push(`RÄNTA: +${g} GULD`); } }
  if (floorEvent) extra.push('HÄNDELSE: ' + EVENTS[floorEvent].name);
  if (run.floorCurse) { run.gold += 60; extra.push('FÖRBANNELSEN BRUTEN: +60 GULD'); run.floorCurse = false; }
  let open = 0, saw = 0; for (let i = 0; i < mw * mh; i++) { const c = map[(i / mw) | 0][i % mw]; if (!isWallChar(c)) { open++; if (seen[i]) saw++; } }
  stats = { name: lvl.name, kills, totalEnemies, secrets, totalSecrets, items: itemsTaken, totalItems, time: levelTime, bonus,
    extra, acc: lvlStat.shots ? Math.round(100 * lvlStat.hits / lvlStat.shots) : 0, taken: Math.round(lvlStat.taken), explored: Math.round(100 * saw / Math.max(1, open)), tip: TIPS[(Math.random() * TIPS.length) | 0] };
  run.graph = run.graph || []; run.graph.push({ hp: P.hp / maxHp(), gold: run.gold });
  if (lvl.biome === 'swamp') stat('swampFloors');
  questFloorEnd();
  run.bestFloorKills = Math.max(run.bestFloorKills || 0, kills); if (run.route && run.route[run.depth] === 3) stat('hardRoutes'); vib('level');
  if (lvl.biome) { profile.biomeFloors = profile.biomeFloors || {}; profile.biomeFloors[lvl.biome] = (profile.biomeFloors[lvl.biome] || 0) + 1; }
  state = 'stats'; msgs.length = 0; play('win', 0.7); if (levelTime < 60) run.fast = true; checkAch();
  mouseDown = false; aimDown = false;
  if (document.pointerLockElement) document.exitPointerLock();
}
function nextFloor() { // efter statistiken: välj ett kort, sedan nästa våning
  if (state !== 'stats') return;
  stats = null;
  const depth = run.depth + 1;
  run.floorCurse = false;
  if (!isBossDepth(depth) && depth > 2 && Math.random() < 0.3 && !run.practice) { // ibland: förbanna nästa våning för en belöning
    openUI(() => CardUI.choice({ title: 'EN RÖST I MÖRKRET', subtitle: 'FÖRBANNA NÄSTA VÅNING? FIENDERNA SLÅR 30 % HÅRDARE OCH HAR MER HÄLSA, MEN DU FÅR 60 GULD NÄR DU KLARAR DEN.', cancel: 1,
      options: [{ label: 'TA FÖRBANNELSEN', text: '+60 GULD EFTERÅT' }, { label: 'NEJ TACK', text: '' }] }, i => { run.floorCurse = i === 0; setTimeout(() => floorDraft(depth), 50); }));
    return;
  }
  floorDraft(depth);
}
function floorDraft(depth) {
  openUI(() => draftUI(drawCards(3), { title: `VÅNING ${run.depth} KLARAD`, subtitle: isBossDepth(depth) ? 'VÄLJ ETT KORT INFÖR BOSSEN' : 'VÄLJ ETT KORT', skipLabel: 'HOPPA ÖVER (+25 GULD)' }, card => {
    if (card) gainCard(card); else run.gold += 25;
    loadFloor(depth); lockPointer();
  }));
}
function endRun(win) {
  const r = run;
  if (r.practice) { r.souls = 0; r.win = win; saveProfile(); if (win) { state = 'runover'; P.deadT = 0; play('win', 1); if (document.pointerLockElement) document.exitPointerLock(); } return; } // övning: inget sparas
  if (win && r.bossrush) stat('rushWins');
  if (win && r.diff === 3) profile.ascMax = Math.max(profile.ascMax || 0, (r.asc || 0) + 1);
  if (win) profile.fastestWin = Math.min(profile.fastestWin || 1e9, Math.round(r.time));
  if (!win && r.cause) { profile.deathsBy = profile.deathsBy || {}; profile.deathsBy[r.cause] = (profile.deathsBy[r.cause] || 0) + 1; }
  const souls = Math.round((r.kills * 0.6 + (r.depth - 1) * 6 + (win ? 60 : 0) + (r.bossKilled ? 20 : 0) + (r.guardians || 0) * 5 + (r.bosses || 0) * 15) * diff().souls * ({ onehit: 1.5, pistol: 1.3, nocards: 1.4 }[r.cmode] || 1));
  if (r.cmode) { profile.cmodeBest = Object.assign({}, profile.cmodeBest, { [r.cmode]: Math.max((profile.cmodeBest || {})[r.cmode] || 0, r.depth) }); if (win) profile.cmodeWins = Object.assign({}, profile.cmodeWins, { [r.cmode]: 1 }); }
  recordCheck(r);
  profile.kills = (profile.kills || 0) + r.kills; profile.time = (profile.time || 0) + r.time;
  profile.wkills = profile.wkills || {}; for (const [k, v] of Object.entries(r.wkills || {})) profile.wkills[k] = (profile.wkills[k] || 0) + v;
  if (win && r.diff === 3) profile.nightmareWin = true;
  r.souls = souls; r.win = win;
  if (win) score += 5000 + r.gold * 5;
  profile.souls += souls; if (win) profile.wins++;
  profile.bestDepth = Math.max(profile.bestDepth, r.depth);
  profile.bestScore = Math.max(profile.bestScore, score);
  profile.history.unshift({ seed: seedText(r.seed), depth: r.depth, win, score, kills: r.kills, cards: r.owned.length, time: Math.round(r.time), souls, daily: r.daily, d: Date.now(),
    biome: lvl && lvl.biome, cause: r.cause || '', diff: r.diff });
  if (r.daily) { profile.dailyTop = (profile.dailyTop || []).concat({ d: new Date().toISOString().slice(0, 10), score, depth: r.depth }).sort((a, b) => b.score - a.score).slice(0, 10); }
  checkAch();
  profile.history.length = Math.min(profile.history.length, 20);
  saveProfile(); store.del('run');
  if (window.Music) Music.sting(win ? 'win' : 'death');
  if (win) { state = 'runover'; P.deadT = 0; play('win', 1); if (document.pointerLockElement) document.exitPointerLock(); }
}
const TIPS = ['SPARKA MED V (ELLER HANDEN) NÄR DU STÅR NÄRA', 'TRYCK R IGEN I DET GRÖNA FÄLTET', 'KRUTFAT SMÄLLER – LOCKA DIT FIENDERNA', 'SKJUT NED SÖKANDE KLOT', 'Q BYTER TILL FÖRRA VAPNET',
  'M VÄXLAR MELLAN LITEN OCH STOR KARTA', 'SHAMANEN HELAR – DÖDA DEN FÖRST', 'LÅT ORKKRIGAREN KROCKA I VÄGGEN', 'BLODSLEMMET DELAR SIG', 'GRAVRÖVAREN SYNS BARA NÄRA', 'EN VAPENPAKT GER UNIKA UPPGRADERINGAR',
  'PORTALEN SUGER MED SIG GULDET', 'KLARA VÅNINGEN UTAN SKADA FÖR BONUS', 'BRUNNAR HELAR EN GÅNG', 'ALTARET GER GULD MEN ETT FÖRBANNAT KORT', 'LÅDOR OCH KRUKOR GÖMMER SAKER', 'SJÄLAALTARET GER BESTÅENDE UPPGRADERINGAR',
  'VÄKTAREN VAKTAR VÅNINGENS PORTAL', 'MIMICS SER UT SOM KISTOR', 'ELITER KAN TAPPA ETT KORT', 'SKÖLDADE ELITER MÅSTE FÖRST FÖRLORA SKÖLDEN',
  'SPACE HOPPAR – HOPPA ÖVER LAVA OCH STOCKAR', 'CTRL DUCKAR: SPRING + CTRL = GLID', 'Z ELLER DUBBELTRYCK RUSAR', 'F KASTAR GRANAT – HÅLL FÖR LÄNGRE KAST', 'SKJUT SPRUCKNA VÄGGAR MED GRANATER',
  'SOVANDE FIENDER VAKNAR AV SPRING', 'BAKHÅLL GER 50 % MER SKADA', 'SMEDJAN GÖR VAPNET STARKARE', 'SPAKEN ÖPPNAR GALLRET', 'NYCKLAR ÖPPNAR LÅSTA DÖRRAR OCH KISTOR', 'LAVAVÅGEN – HOPPA ÖVER DEN'];
const fmtTime = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// ---------- Huvudloop ----------
let last = 0;
let loopErrors = 0, lastError = '';
function loop(t) { // ett fel i en bildruta får aldrig stoppa spelet: nästa bildruta beställs först
  requestAnimationFrame(loop);
  try { frameStep(t); } catch (err) {
    loopErrors++; console.error(err); lastError = String(err && err.message || err).toUpperCase().slice(0, 60);
    if (loopErrors <= 3) { try { say('FEL: ' + String(err && err.message || err).toUpperCase().slice(0, 48), 4); } catch (e) { /* inget att visa på */ } }
    if (loopErrors <= 5) reportError(err);
  }
}
function reportError(err) { // sparas så att felet kan hittas efteråt
  try { const list = store.get('errors', []); list.unshift({ t: Date.now(), msg: String(err && err.message || err), stack: String(err && err.stack || '').split('\n').slice(0, 4).join(' | '), depth: run && run.depth, biome: lvl && lvl.biome });
    store.set('errors', list.slice(0, 10)); } catch (e) { /* lagring saknas */ }
}
function spriteError(err, s) { if (s && s.o) s.o.renderFail = (s.o.renderFail || 0) + 1; if (loopErrors < 5) { loopErrors++; lastError = String(err && err.message || err).toUpperCase().slice(0, 60); reportError(err); console.error(err); } }
function frameStep(t) {
  const realDt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
  lowFpsGuard(realDt); if (Math.floor(t / 1000) !== Math.floor((t - realDt * 1000) / 1000)) updateWakeLock();
  if (state !== 'play') pollGamepad(realDt);
  let dt = realDt; if (hitStop > 0) { hitStop -= realDt; dt = realDt * 0.06; } // träffstopp: tiden står nästan still ett ögonblick
  if (state === 'play' && run && up('bullettime') && WS.aim > 0.8) dt *= 0.5; // tidsstoppet
  if (slowmo > 0) { slowmo -= realDt; dt *= 0.35; } // bossens entré
  if (wheel && wheel.open && state === 'play') dt *= 0.3; // vapenhjulet saktar ned tiden
  if (map && state !== 'title') {
    if (state !== 'pause' && state !== 'ui' && !(photo && state === 'play')) update(dt);
    updateLight(); render();
    if (photo && state === 'play') { const t = 'FOTOLÄGE – K FÖR ATT FORTSÄTTA'; if (tmr % 2 < 1.2) txt(t, (W - textW(t)) / 2, VH + 12, '#e8d9b0'); }
    else { drawWeapon(); drawHUD(); }
    if (state === 'dead' && P.deadT > 1.2) drawRunOver(false);
    if (state === 'runover') drawRunOver(true);
    if (state === 'pause' && pauseMap) drawMap(false);
    else if (state === 'pause') overlay('PAUS', (isTouch()
    ? ['TRYCK FÖR ATT FORTSÄTTA', `FRÖ ${seedText(run.seed)}  VÅNING ${run.depth}`, `KORT ${run.owned.length}`, `SVÅRIGHET ${DIFF[settings.diff].name}`]
    : ['KLICKA FÖR ATT FORTSÄTTA', `FRÖ ${seedText(run.seed)}  VÅNING ${run.depth}`, `KORT ${run.owned.length}  (C = VISA)`, `SVÅRIGHET ${DIFF[settings.diff].name}`, 'I = INSTÄLLNINGAR  G = GE UPP  M = KARTA', 'SPACE HOPP · CTRL DUCKA · Z RUSA · F GRANAT · V SPARK', 'X INSPEKTERA · B MARKÖR · K FOTO · F9 SKÄRMBILD']).concat(bonusLines(), pauseExtras()), '#202040');
    if (state === 'stats') drawStats();
  }
}
function pauseExtras() { // uppstigning, klass, uppdrag och händelselogg
  const out = [];
  if (run.cls && CLASSES[run.cls]) out.push('KLASS: ' + CLASSES[run.cls].name + (run.asc ? `  · UPPSTIGNING ${run.asc}` : '') + (run.cmode ? '  · ' + CMODES[run.cmode].name : ''));
  out.push(`SJÄLAR ${profile.souls} · DJUP ${run.depth} (REKORD ${profile.bestDepth})` + (run.pet ? ` · ${PETS[run.pet].name} NIVÅ ${petLv()}` : ''));
  if (run.mission) out.push('VARVETS UPPDRAG: ' + run.mission.text + ` (${Math.min(missionProgress(), run.mission.n)}/${run.mission.n})`);
  if (run.log && run.log.length) out.push('SENAST: ' + run.log.slice(-3).join(' · '));
  if (quests) out.push('UPPDRAG: ' + quests.map(q => (q.done ? '✓ ' : q.failed ? '✗ ' : '') + q.text).join(' · '));
  { const rs = curRunes(), c = activeCard(); if (rs.length || c) out.push((rs.length ? 'RUNOR: ' + rs.map(r => RUNES[r].name).join(', ') : '') + (c ? '  FÖRMÅGA: ' + c.name : '')); }
  if (lastError) out.push('FEL I SPELET: ' + lastError);
  return out;
}
function bonusLines() { // de viktigaste bonusarna från korten, sammanfattade
  const f = (k, label, pct = true) => M[k] ? `${label} ${M[k] > 0 ? '+' : ''}${pct ? Math.round(M[k] * 100) + '%' : Math.round(M[k] * 10) / 10}` : null;
  const parts = [f('dmg', 'SKADA'), f('fireRate', 'ELD'), f('critChance', 'KRIT'), f('maxHp', 'HP', false), f('moveSpeed', 'FART'), f('lifesteal', 'LIVSSTÖLD')].filter(Boolean);
  const out = [];
  if (parts.length) { out.push(parts.slice(0, 3).join('  ')); if (parts.length > 3) out.push(parts.slice(3).join('  ')); }
  if (run.pact) out.push(`EDEN: ${Cards.WEAPON_NAME[run.pact]}  (${[...UP].length} UPPGR.)`);
  return out;
}
function overlay(t1, lines, col) {
  ctx.fillStyle = col + 'b0'; ctx.fillRect(0, 0, W, VH);
  ctx.font = '16px "PressStart2P"'; ctx.textBaseline = 'top';
  const w = ctx.measureText(plain(t1)).width; txt(t1, (W - w) / 2, 22, '#fff', 2);
  lines.forEach((s, i) => { txt(s, (W - textW(s)) / 2, 54 + i * 13, i ? '#e0c890' : '#ffe9a8'); });
}
function drawStats() {
  const s = stats;
  ctx.fillStyle = '#100a08e0'; ctx.fillRect(0, 0, W, VH);
  const head = `${s.name} KLARAD`; txt(head, (W - textW(head)) / 2, 14, '#ffd24a');
  const rows = [['FIENDER', `${s.kills}/${s.totalEnemies}`], ['HEMLIGHETER', `${s.secrets}/${s.totalSecrets}`], ['UTFORSKAT', `${s.explored}%`], ['TRÄFFSÄKERHET', `${s.acc}%`], ['SKADA TAGEN', String(s.taken)], ['TID', fmtTime(s.time)], ['BONUS', `+${s.bonus}`], ['GULD', String(run.gold)]];
  rows.forEach(([k, v], i) => { const y = 30 + i * 11; txt(k, 60, y, '#c9a87a'); txt(v, 260 - textW(v), y, '#e8d9b0'); });
  if (s.extra) s.extra.forEach((e, i) => txt(e, (W - textW(e)) / 2, 120 + i * 9, '#9fe060'));
  // varvets väg: biomerna i ordning med den nuvarande markerad
  const c0 = cycleOf(run.depth) * (FLOORS + 1);
  for (let i = 1; i <= FLOORS + 1; i++) { const d = c0 + i, bx = W / 2 - 51 + (i - 1) * 17, cur = d === run.depth;
    ctx.fillStyle = d < run.depth ? '#6a5a40' : cur ? '#ffd24a' : '#3a2c1e'; ctx.fillRect(bx, 18, 14, 6);
    if (isBossDepth(d)) { ctx.fillStyle = '#c03020'; ctx.fillRect(bx + 5, 19, 4, 4); } }
  { const nd = run.depth + 1, t = 'NÄSTA: ' + (isBossDepth(nd) ? 'BOSSEN' : BIOME_NAME[biomeFor(nd)] || ''); txt(t, (W - textW(t)) / 2, 26, '#c9a87a', 1, true, 0.8); }
  if (s.tip) { const t = 'TIPS: ' + s.tip; txt(t, (W - textW(t)) / 2, 152, '#8a7550'); }
  const f = isTouch() ? 'TRYCK FÖR ATT VÄLJA KORT' : 'KLICKA FÖR ATT VÄLJA KORT'; if (tmr % 1 < 0.7) txt(f, (W - textW(f)) / 2, 140, '#ffe9a8');
}
const DEATH_TIPS = { 'LAVA': 'HOPPA ÖVER LAVAN ELLER GÅ RUNT', 'SPIKFÄLLA': 'SPIKARNA KLICKAR INNAN DE SKJUTER UPP', 'GIFTGAS': 'GASEN PYSER MED JÄMNA MELLANRUM', 'GAV UPP': 'SJÄLAALTARET GÖR NÄSTA RUNDA LÄTTARE',
  'BOMBSKELETT': 'SKJUT BOMBSKELETTEN PÅ AVSTÅND', 'SPINDEL': 'BRÄNN NÄTEN MED BLOSS ELLER GRANATER', 'HELVETESHUND': 'HUNDARNA SNUBBLAR OM DU TRÄFFAR DEM I SPRÅNGET', 'VAMPYR': 'VAMPYREN ÄR SNABB – BACKA OCH SKJUT',
  'ORKKRIGARE': 'LÅT ORKKRIGAREN KROCKA I VÄGGEN', 'BENMAGIKER': 'DÖDA MAGIKERN INNAN DEN VÄCKER FLER' };
function drawRunOver(win) {
  const r = run;
  ctx.fillStyle = win ? '#0c1a0ce8' : '#1a0606e8'; ctx.fillRect(0, 0, W, VH);
  ctx.font = '16px "PressStart2P"'; const t1 = win ? 'SEGER!' : 'RUNDAN ÄR SLUT'; const w = ctx.measureText(plain(t1)).width;
  txt(t1, (W - w) / 2, 10, win ? '#9fe0a0' : '#ff5040', 2);
  const rows = [['VÅNING', win ? (r.loop ? `VARV ${r.loop + 1} KLARAT` : 'BOSSEN BESEGRAD') : r.depth > FLOORS + 1 ? `${r.depth} (VARV ${cycleOf(r.depth) + 1})` : `${r.depth} AV ${FLOORS + 1}`], ['FIENDER', String(r.kills)], ['KORT', String(r.owned.length)], ['GULD', String(r.gold)], ['TID', fmtTime(r.time)], ['POÄNG', String(score)], ['SJÄLAR', `+${r.souls || 0}`], ['FRÖ', seedText(r.seed)]];
  const fav = Object.entries(r.wkills || {}).sort((a, b) => b[1] - a[1])[0];
  if (fav) rows.splice(2, 0, ['FAVORITVAPEN', `${WEAPONS[weaponIndex(fav[0])].short} (${fav[1]})`]);
  if (r.shots) rows.splice(3, 0, ['TRÄFFSÄKERHET', `${Math.round(100 * (r.hits || 0) / r.shots)}%`]);
  const soulsShown = Math.min(r.souls || 0, Math.floor(P.deadT * 25)); // själarna räknas upp
  if (soulsShown < (r.souls || 0) && Math.floor(P.deadT * 25) % 3 === 0) play('coin', 0.15, 1.6);
  for (const row of rows) if (row[0] === 'SJÄLAR') row[1] = `+${soulsShown}`;
  if (!win && r.cause) rows.unshift(['DÖDAD AV', r.cause]);
  const worst = Object.entries(r.dmgBy || {}).sort((a, b) => b[1] - a[1])[0]; if (worst) rows.splice(r.cause && !win ? 1 : 0, 0, ['MEST SKADA AV', `${worst[0]} (${Math.round(worst[1])})`]);
  if (r.records && r.records.length) rows.push(['NYTT REKORD', r.records[Math.floor(P.deadT / 2) % r.records.length]]);
  rows.forEach(([k, v], i) => { const y = 28 + i * 10; txt(k, 30, y, '#c9a87a'); txt(v, 190 - textW(v), y, k === 'SJÄLAR' ? '#c0a0ff' : k === 'DÖDAD AV' ? '#ff7060' : '#e8d9b0'); });
  if (r.graph && r.graph.length > 1) { // graf över hälsa och guld per våning
    const gx = 200, gy = 32, gw = 110, gh = 50, n = r.graph.length, mg = Math.max(1, ...r.graph.map(p => p.gold));
    ctx.fillStyle = '#0008'; ctx.fillRect(gx, gy, gw, gh); txt('HP', gx + 2, gy + 2, '#ff6050'); txt('GULD', gx + 26, gy + 2, '#ffd24a');
    for (const [key, col, max] of [['hp', '#ff6050', 1], ['gold', '#ffd24a', mg]]) { ctx.strokeStyle = col; ctx.beginPath(); r.graph.forEach((p, i) => { const x = gx + 4 + i / (n - 1) * (gw - 8), y = gy + gh - 4 - p[key] / max * (gh - 16); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke(); }
  }
  const names = r.owned.slice(-6).map(id => (Cards.byId(id) || {}).name).filter(Boolean), log = (r.log || []).slice(-6);
  if (log.length && Math.floor(P.deadT / 4) % 2 === 1) { txt('TIDSLINJE:', 200, 90, '#c9a87a'); log.forEach((n, i) => txt(n.slice(0, 15), 200, 100 + i * 8, '#a0d0e8', 1, true, 0.9)); } // rundans tidslinje
  else if (names.length) { txt('KORT:', 200, 90, '#c9a87a'); names.forEach((n, i) => txt(n.slice(0, 14), 200, 100 + i * 8, '#b9a0e8', 1, true, 0.9)); }
  if (!win && r.cause) { const t = 'TIPS: ' + (DEATH_TIPS[r.cause] || 'VARJE RUNDA LÄR DIG NÅGOT'); txt(t, (W - textW(t)) / 2, 130, '#8a7550'); }
  const keysTxt = isTouch() ? '' : 'ENTER = NY RUNDA · R = SAMMA FRÖ · C = KOPIERA FRÖ'; if (keysTxt) txt(keysTxt, (W - textW(keysTxt)) / 2, 138, '#8a7550');
  const f = isTouch() ? 'TRYCK FÖR MENYN' : 'KLICKA FÖR MENYN'; if (tmr % 1 < 0.7) txt(f, (W - textW(f)) / 2, 150, '#ffe9a8');
}

// ---------- Indata ----------
function showTitle() {
  state = 'title'; map = null; musicSnd = false; playMusic();
  stopAmbient(); setMusic(false);
  if (breathSnd) { breathSnd.s.stop(); breathSnd = null; }
  if (document.pointerLockElement) document.exitPointerLock();
  document.getElementById('title').hidden = false;
  refreshTitle();
}
function ensureAudio() {
  if (!actx) loadSounds().then(() => { if (state === 'play' && !ambient) startAmbient(); else playMusic(); });
  else if (actx.state === 'suspended') actx.resume();
}
function startMode(mode) { // bekräfta innan en ny runda skriver över en pågående
  if (mode !== 'continue' && store.get('run', null) && !CardUI.isOpen()) {
    CardUI.choice({ title: 'NY RUNDA?', subtitle: 'DU HAR EN PÅGÅENDE RUNDA. EN NY RUNDA SKRIVER ÖVER DEN.', cancel: 1, options: [{ label: 'STARTA NY', text: 'DEN GAMLA FÖRSVINNER' }, { label: 'AVBRYT', text: '' }] }, i => { if (i === 0) begin(mode); });
    return;
  }
  begin(mode);
}
function openPractice() {
  const biomes = BIOME_IDS.map(b => ({ label: BIOME_NAME[b] || b, text: 'ÖVA PÅ VÅNINGAR I DEN HÄR BIOMEN' })), bosses = BOSS_IDS.map(b => ({ label: BOSSES[b].name, text: 'MÖT BOSSEN DIREKT' }));
  CardUI.list('ÖVNING', 'INGA SJÄLAR ELLER PRESTATIONER. VÄLJ EN BIOM ELLER EN BOSS.', [{ label: 'BIOMER', head: true, color: '#ffd24a' }, ...biomes.map((r, i) => ({ ...r, onClick: () => { CardUI.close(); practice = { biome: BIOME_IDS[i] }; begin('practice'); } })),
    { label: 'BOSSAR', head: true, color: '#ffd24a' }, ...bosses.map((r, i) => ({ ...r, onClick: () => { CardUI.close(); practice = { boss: BOSS_IDS[i] }; begin('practice'); } }))], () => refreshTitle());
}
function begin(mode) { // mode: 'new' | 'daily' | 'continue' | 'bossrush' | 'practice'
  if (mode !== 'practice') practice = null;
  document.getElementById('title').hidden = true;
  canvas.focus(); ensureAudio();
  if (mode === 'continue' && loadRunSave()) { loadFloor(run.depth); lockPointer(); return; }
  let seed = mode === 'daily' ? dailySeed() : mode === 'weekly' ? RNG.hash('krypta-vecka-' + weekNo()) : RNG.randomSeed();
  const typed = (document.getElementById('seed').value || '').trim();
  if (mode === 'new' && typed) seed = /^[0-9a-z]{1,7}$/i.test(typed) ? parseInt(typed, 36) >>> 0 : RNG.hash(typed);
  if (params.has('seed')) seed = RNG.hash(params.get('seed'));
  newRun(seed, mode === 'daily' || mode === 'weekly');
  if (mode === 'weekly') { const r = RNG(seed).fork('veckan'), m = r.shuffle(DAILY_MODS.slice()); run.modifier = m[0]; run.modifier2 = m[1]; run.weekly = true; } // veckans utmaning: två förbannelser
  if (mode === 'bossrush') { run.bossrush = true; run.rushN = 0; for (let i = 1; i <= 4; i++) { P.has[i] = true; P.mags[i] = WEAPONS[i].mag; } P.ammo = Object.assign(NOAMMO(), { p9: 120, r556: 90, shells: 30, bolts: 10, flares: 6 }); P.grenades = 3; }
  if (mode === 'practice' && run.practice && run.practice.boss) { for (let i = 1; i <= 4; i++) { P.has[i] = true; P.mags[i] = WEAPONS[i].mag; } P.ammo = Object.assign(NOAMMO(), { p9: 120, r556: 90, shells: 30 }); }
  const startDepth = mode === 'practice' && run.practice && run.practice.boss ? FLOORS + 1 : mode === 'bossrush' ? FLOORS + 1 : params.get('floor') ? clamp(+params.get('floor'), 1, FLOORS + 1) : 1;
  if (startDepth > 1) { for (let i = 1; i <= Math.min(3, startDepth - 1); i++) { P.has[i] = true; P.mags[i] = WEAPONS[i].mag; } P.ammo = Object.assign(NOAMMO(), { p9: 90, r556: 60, shells: 20 }); }
  loadFloor(startDepth);
  if (params.has('nocards')) { lockPointer(); return; }
  // startkort: välj ett av tre innan första våningen
  if (run.modifier) say((run.weekly ? 'VECKANS UTMANING: ' + run.modifier.name + ' + ' + run.modifier2.name : 'DAGENS UTMANING: ' + run.modifier.name), 4);
  openUI(() => draftUI(drawCards(3 + meta('choice')), { title: 'RUNDAN BÖRJAR', subtitle: run.modifier ? 'DAGENS UTMANING: ' + run.modifier.name + ' – ' + run.modifier.text : 'VÄLJ ETT STARTKORT', skipLabel: 'INGET KORT' }, card => { gainCard(card); closeUI(); }));
}
function lockPointer() { if (!params.has('nolock') && !isTouch() && document.pointerLockElement !== canvas && canvas.requestPointerLock) { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* pekarlås valfritt */ } } }
addEventListener('blur', () => pause());
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
function openSettingsUI() { const back = state; openUI(() => openSettings(() => closeUI(back === 'pause' ? 'pause' : 'play'))); }
function abandonRun() { // ge upp rundan från pausen
  openUI(() => CardUI.choice({ title: 'GE UPP RUNDAN?', subtitle: 'RUNDAN AVSLUTAS SOM EN FÖRLUST. SJÄLARNA DU HAR SAMLAT FÅR DU BEHÅLLA.', cancel: 1,
    options: [{ label: 'GE UPP', text: 'TILLBAKA TILL STARTSKÄRMEN' }, { label: 'FORTSÄTT SPELA', text: '' }] }, i => {
    if (i === 0) { stopAmbient(); setMusic(false); run.cause = 'GAV UPP'; endRun(false); showTitle(); } else closeUI('pause');
  }));
}
// ---------- Inställningar (startskärmen och pausen) ----------
function openSettings(onClose) {
  CardUI.panel('INSTÄLLNINGAR', '', c => {
    const row = (label, input) => { const r = CardUI.el('label', 'cu-row'); r.appendChild(CardUI.el('span', '', label)); r.appendChild(input); c.appendChild(r); return input; };
    const range = (label, key, min, max, step, fmt, after) => { const i = document.createElement('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = settings[key];
      const r = row(label + ' ' + fmt(settings[key]), i); i.oninput = () => { settings[key] = +i.value; r.previousSibling.textContent = label + ' ' + fmt(settings[key]); saveSettings(); if (after) after(); }; };
    const select = (label, key, opts, after) => { const sel = document.createElement('select'); for (const [v, t] of opts) { const o = document.createElement('option'); o.value = v; o.textContent = t; if (String(settings[key]) === String(v)) o.selected = true; sel.appendChild(o); }
      row(label, sel); sel.onchange = () => { const v = sel.value; settings[key] = isNaN(+v) || v === '' ? v : +v; saveSettings(); if (after) after(); }; };
    const check = (label, key, after) => { const i = document.createElement('input'); i.type = 'checkbox'; i.checked = !!settings[key]; row(label, i); i.onchange = () => { settings[key] = i.checked; saveSettings(); if (after) after(); }; };
    range('KÄNSLIGHET', 'sens', 0.2, 3, 0.1, v => v.toFixed(1));
    range('SYNFÄLT', 'fov', 60, 100, 2, v => v + '°', applyFov);
    range('VOLYM', 'vol', 0, 1, 0.05, v => Math.round(v * 100) + '%', applyVolume);
    range('LJUSSTYRKA', 'gamma', 0.6, 1.6, 0.05, v => Math.round(v * 100) + '%', () => { if (lvl) buildGrade(); });
    select('SKÄRMSKAK', 'shake', [[0, 'AV'], [0.5, 'LÅG'], [1, 'FULL']]);
    select('SIKTE', 'xstyle', [['kors', 'KORS'], ['punkt', 'PUNKT'], ['cirkel', 'CIRKEL']]);
    select('SIKTESFÄRG', 'xcolor', [['', 'VIT'], ['rgba(120,255,120,0.9)', 'GRÖN'], ['rgba(255,220,80,0.9)', 'GUL'], ['rgba(110,230,255,0.9)', 'CYAN']]);
    select('KARTA', 'map', [[0, 'AV'], [1, 'LITEN I HÖRNET'], [2, 'STOR']], () => { showMap = settings.map; });
    check('VISA FPS', 'fps');
    check('MINSKADE EFFEKTER', 'lowfx');
    check('VAPNET GUNGAR', 'bob');
    check('VIBRATION (MOBIL)', 'vibrate');
    check('VÄNSTERHÄNT (MOBIL)', 'lefty', applyTouchLayout);
    range('KNAPPSTORLEK (MOBIL)', 'btnScale', 0.7, 1.4, 0.05, v => Math.round(v * 100) + '%', applyTouchLayout);
    const sec = t => c.appendChild(CardUI.el('div', 'cu-sec', t)), pct = v => Math.round(v * 100) + '%';
    const def = (k, v) => { if (settings[k] === undefined) settings[k] = v; };
    for (const [k, v] of Object.entries({ musicVol: 0.6, sfxVol: 1, ambVol: 0.8, music: true, subtitles: false, backCue: true, autoSwitch: true, autoReload: true, tilt: true, toggleRun: false, doubleTapDash: true, aimAssist: true, autoFire: false, gyro: false, fixedJoy: false, btnOpacity: 0.6, wakeLock: true, noFlash: false, uiScale: 1, smooth: false, autoLowFx: true, enemyBars: true, dmgNumbers: true, objective: true, timer: false, mapRotate: false, mapScale: 3, lowHpGray: true, cb: '', colorLight: true, xsize: 1 })) def(k, v);
    sec('LJUD');
    check('MUSIK', 'music', () => { applyMixer(); playMusic(); });
    range('MUSIKVOLYM', 'musicVol', 0, 1, 0.05, pct, applyMixer);
    range('EFFEKTER', 'sfxVol', 0, 1, 0.05, pct, applyMixer);
    range('MILJÖLJUD', 'ambVol', 0, 1, 0.05, pct, applyMixer);
    check('UNDERTEXTER FÖR LJUD', 'subtitles');
    check('LJUDSIGNAL VID ANFALL BAKIFRÅN', 'backCue');
    sec('SPEL');
    check('BYT TILL NYTT VAPEN', 'autoSwitch');
    check('LADDA OM AUTOMATISKT', 'autoReload');
    check('VÄXLA SPRING (I STÄLLET FÖR HÅLL)', 'toggleRun');
    check('DUBBELTRYCK FÖR RUSNING', 'doubleTapDash');
    check('KAMERAN LUTAR', 'tilt');
    check('MÅL-TEXT', 'objective');
    check('TIMER', 'timer');
    check('FIENDERNAS LIVMÄTARE', 'enemyBars');
    check('SKADESIFFROR', 'dmgNumbers');
    check('ROTERANDE MINIKARTA', 'mapRotate');
    range('KARTANS STORLEK', 'mapScale', 2, 4, 1, v => v + 'X');
    sec('SIKTE OCH MOBIL');
    check('SIKTSTÖD (MOBIL/HANDKONTROLL)', 'aimAssist');
    check('SKJUT AUTOMATISKT (MOBIL)', 'autoFire');
    check('GYRO-SIKTE (MOBIL)', 'gyro', () => { if (settings.gyro) enableGyro(); });
    check('FAST JOYSTICK (MOBIL)', 'fixedJoy');
    range('KNAPPARNAS SYNLIGHET', 'btnOpacity', 0.2, 1, 0.05, pct, applyDisplay);
    check('HÅLL SKÄRMEN TÄND', 'wakeLock');
    sec('BILD OCH TILLGÄNGLIGHET');
    select('FÄRGBLINDLÄGE', 'cb', [['', 'AV'], ['protan', 'PROTANOPI'], ['deutan', 'DEUTERANOPI'], ['tritan', 'TRITANOPI']]);
    check('MINSKADE BLIXTAR', 'noFlash');
    check('GRÅ BILD VID LÅG HÄLSA', 'lowHpGray');
    range('TEXTSTORLEK', 'uiScale', 0.8, 1.4, 0.05, pct, applyDisplay);
    check('MJUK UPPSKALNING', 'smooth', applyDisplay);
    check('AUTOMATISKT MINSKADE EFFEKTER VID LÅG FPS', 'autoLowFx');
    check('FÄRGAT LJUS', 'colorLight');
    check('STOR TEXT I HUD', 'bigHud');
    check('KONTURER RUNT FIENDER', 'outline');
    range('SIKTETS STORLEK', 'xsize', 0.6, 2, 0.1, v => Math.round(v * 100) + '%');
    select('HUD-TEMA', 'hudTheme', [['', 'KLASSISK'], ['blue', 'BLÅ'], ['green', 'GRÖN'], ['gold', 'GULD']]);
    select('VAPENFÄRG', 'skin', Object.entries(SKINS).map(([k, v]) => [k, skinOpen(k) ? v.name : v.name + ' (LÅST: ' + (ACH.find(a => a[0] === v.ach) || [, '?'])[1] + ')']), () => { if (!skinOpen(settings.skin)) { settings.skin = ''; saveSettings(); } });
    check('FOKUSLÄGE: DÄMPA MILJÖLJUD I STRID', 'focusMode', applyMixer);
    sec('MOBIL: EN HAND');
    check('ENHANDSLÄGE (ALLA KNAPPAR TILL HÖGER, GÅ-KNAPP)', 'oneHand', applyTouchLayout);
    check('DUBBELTRYCK PÅ BILDEN = HOPPA', 'tapJump');
    check('PAUSA NÄR MOBILEN VRIDS TILL STÅENDE', 'rotatePause');
    sec('ÖVRIGT');
    const btn = (t, f) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'cu-btn'; b.textContent = t; b.onclick = ev => { ev.stopPropagation(); f(); }; c.appendChild(b); };
    btn('BYT TANGENTER', () => { CardUI.close(); openKeybinds(() => openSettings(onClose)); });
    btn('EXPORTERA PROFIL', exportProfile);
    btn('IMPORTERA PROFIL', importProfile);
    btn('ÅTERSTÄLL ALLA INSTÄLLNINGAR', () => { for (const k of Object.keys(settings)) delete settings[k]; Object.assign(settings, { sens: 1, vol: 0.8, muted: false, diff: 1, fov: 74, gamma: 1, shake: 1, xstyle: 'kors', xcolor: '', bob: true, vibrate: true, btnScale: 1, map: 1 }); saveSettings(); applyFov(); applyVolume(); applyMixer(); applyDisplay(); applyTouchLayout(); CardUI.close(); openSettings(onClose); });
  }, onClose);
}
function exportProfile() { // profilen som en JSON-fil
  try { const b = new Blob([JSON.stringify({ profile, settings }, null, 1)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'krypta-profil.json'; document.body.appendChild(a); a.click(); a.remove(); } catch (e) { /* hämtning stöds inte */ }
}
function importProfile() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json,.json';
  inp.onchange = () => { const f = inp.files && inp.files[0]; if (!f) return; f.text().then(t => { try { const d = JSON.parse(t); if (!d.profile || typeof d.profile.souls !== 'number') throw new Error('fel'); Object.assign(profile, d.profile); saveProfile(); if (d.settings) { Object.assign(settings, d.settings); saveSettings(); } CardUI.close(); refreshTitle(); document.getElementById('status').textContent = 'PROFILEN ÄR IMPORTERAD'; } catch (e) { document.getElementById('status').textContent = 'FILEN GICK INTE ATT LÄSA'; } }); };
  inp.click();
}
function applyTouchLayout() { const ui = document.getElementById('touch'); if (!ui) return; ui.classList.toggle('lefty', !!settings.lefty); ui.classList.toggle('onehand', !!settings.oneHand); if (!settings.oneHand) autoWalk = false; ui.style.setProperty('--bs', settings.btnScale || 1); applyDisplay(); }
function pause() { if (state === 'play') { state = 'pause'; mouseDown = false; aimDown = false; for (const k in keys) keys[k] = false; if (actx) actx.suspend(); } }
function resume() { if (state === 'pause') { state = 'play'; if (actx) actx.resume(); lockPointer(); } }
let pauseMap = false;
function replaySeed() { if (!run) return; const sd = seedText(run.seed); showTitle(); document.getElementById('seed').value = sd; begin('new'); }
function leaveRunScreen() { if ((state === 'dead' && P.deadT > 1.2) || (state === 'runover' && P.deadT > 1)) showTitle(); }
function showDeck() { const back = state; openUI(() => CardUI.deck(run.owned, () => closeUI(back === 'pause' ? 'pause' : 'play'), { stats: cardStats(), onFuse: fuseCard })); }
// ---------- Tangentbyte: spelaren kan byta tangent för varje handling ----------
const ACTIONS = [['KeyW', 'FRAMÅT'], ['KeyS', 'BAKÅT'], ['KeyA', 'VÄNSTER'], ['KeyD', 'HÖGER'], ['KeyE', 'ANVÄND'], ['Space', 'HOPPA'], ['ControlLeft', 'DUCKA'], ['ShiftLeft', 'SPRING'], ['KeyZ', 'RUSA'],
  ['KeyF', 'GRANAT'], ['KeyR', 'LADDA OM'], ['KeyV', 'SPARKA'], ['KeyQ', 'FÖRRA VAPNET'], ['KeyM', 'KARTA'], ['KeyC', 'KORTEN'], ['KeyX', 'INSPEKTERA'], ['KeyB', 'MARKÖR'], ['KeyK', 'FOTOLÄGE'], ['KeyH', 'DRICK'], ['KeyJ', 'BYT DRYCK'], ['KeyT', 'FÖRMÅGA']];
function keyMap(code) { // användarens tangent -> standardtangenten för handlingen
  const b = settings.binds || {};
  for (const [def] of ACTIONS) if (b[def] === code) return def;
  if (b[code] && b[code] !== code) return 'Unbound'; // standardtangenten är flyttad till en annan tangent
  return code;
}
const keyEv = e0 => ({ code: keyMap(e0.code), repeat: e0.repeat, preventDefault: () => e0.preventDefault() });
const keyName = c => c.replace(/^Key/, '').replace(/^Digit/, '').replace('ControlLeft', 'CTRL').replace('ShiftLeft', 'SHIFT').replace('Space', 'SPACE').toUpperCase();
function openKeybinds(onClose) {
  CardUI.panel('TANGENTER', 'KLICKA PÅ EN HANDLING OCH TRYCK PÅ EN NY TANGENT. ESC AVBRYTER.', c => {
    for (const [def, name] of ACTIONS) {
      const r = CardUI.el('label', 'cu-row'); r.appendChild(CardUI.el('span', '', name));
      const b = document.createElement('button'); b.type = 'button'; b.className = 'cu-btn'; b.textContent = keyName((settings.binds || {})[def] || def);
      b.onclick = ev => { ev.stopPropagation(); b.textContent = 'TRYCK EN TANGENT…';
        const cap = k => { k.preventDefault(); k.stopPropagation(); removeEventListener('keydown', cap, true); if (k.code !== 'Escape') { settings.binds = Object.assign({}, settings.binds, { [def]: k.code }); saveSettings(); } b.textContent = keyName((settings.binds || {})[def] || def); };
        addEventListener('keydown', cap, true); };
      r.appendChild(b); c.appendChild(r);
    }
    const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'cu-btn'; reset.textContent = 'ÅTERSTÄLL TANGENTERNA';
    reset.onclick = ev => { ev.stopPropagation(); settings.binds = {}; saveSettings(); CardUI.close(); openKeybinds(onClose); }; c.appendChild(reset);
  }, onClose);
}
addEventListener('keydown', e0 => {
  const e = keyEv(e0);
  if (state === 'title' || (window.CardUI && CardUI.isOpen())) return;
  if (state === 'ui') return;
  if (e.code === 'Escape' || e.code === 'KeyP') { if (state === 'play') pause(); else if (state === 'pause' && e.code === 'KeyP') resume(); return; }
  if (state === 'pause' && e.code === 'KeyI') { openSettingsUI(); return; }
  if (state === 'pause' && e.code === 'KeyG') { abandonRun(); return; }
  keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
  if (e.code === 'BracketLeft' || e.code === 'BracketRight') { settings.sens = clamp(settings.sens + (e.code === 'BracketLeft' ? -0.1 : 0.1), 0.2, 3); saveSettings(); say(`MUSKÄNSLIGHET ${settings.sens.toFixed(1)}`, 1.2); }
  if (e.code === 'Minus' || e.code === 'Equal') { settings.vol = clamp(settings.vol + (e.code === 'Minus' ? -0.1 : 0.1), 0, 1); saveSettings(); applyVolume(); say(`VOLYM ${Math.round(settings.vol * 100)}%`, 1.2); }
  if (e.code === 'Comma' || e.code === 'Period') { settings.fov = clamp(settings.fov + (e.code === 'Comma' ? -4 : 4), 60, 100); saveSettings(); say(`SYNFÄLT ${settings.fov}°`, 1.2); }
  if (e.code === 'KeyN') { settings.muted = !settings.muted; saveSettings(); applyVolume(); say(settings.muted ? 'LJUD AV' : 'LJUD PÅ', 1); }
  if (e.code === 'KeyO') toggleFullscreen();
  if (e.code === 'F9' || e.code === 'PrintScreen') { e.preventDefault(); screenshot(); }
  if (e.code === 'KeyC' && (state === 'play' || state === 'pause')) { showDeck(); return; }
  if (state === 'play') {
    if (e.code === 'KeyE') useKey();
    if (e.code === 'Space' && !e.repeat) jump();
    if (e.code === 'KeyZ' && !e.repeat) dash(0, 0);
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code) && !e.repeat) dirTap(e.code);
    if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat && settings.toggleRun) runToggled = !runToggled;
    if (e.code === 'KeyF' && !e.repeat) grenadeStart();
    if (e.code === 'KeyX' && !e.repeat) inspect();
    if (e.code === 'KeyK' && !e.repeat) { photo = !photo; say(photo ? '' : '', 0); }
    if (e.code === 'KeyB' && !e.repeat) { mapMark = mapMark && Math.hypot(mapMark.x - P.x, mapMark.y - P.y) < 1 ? null : { x: P.x, y: P.y }; play('click', 0.5, 1.4); say(mapMark ? 'MARKÖR SATT PÅ KARTAN' : 'MARKÖREN BORTTAGEN', 1.2); }
    if (e.code === 'KeyR') reloadKey();
    if (e.code === 'KeyV') kick();
    if (e.code === 'KeyH' && !e.repeat) drinkPotion();
    if (e.code === 'KeyT' && !e.repeat) useAbility();
    if (e.code === 'KeyJ' && !e.repeat) swapPotion();
    if (e.code === 'KeyM' || e.code === 'Tab') { showMap = (showMap + 1) % 3; settings.map = showMap; saveSettings(); }
    const n = e.code.startsWith('Digit') ? (e.code === 'Digit0' ? 9 : +e.code.slice(5) - 1) : e.code === 'Backquote' || e.code === 'IntlBackslash' ? 10 : -1;
    if (n >= 0 && n < WEAPONS.length) switchWeapon(n);
    if (e.code === 'KeyQ' && !e.repeat && !wheelStart()) { if (P.has[P.lastWeapon] && P.lastWeapon !== P.weapon) switchWeapon(P.lastWeapon); else cycleWeapon(1); }
  } else if ((state === 'dead' || state === 'runover') && e.code === 'KeyR') { replaySeed(); }
  else if ((state === 'dead' || state === 'runover') && (e.code === 'Enter' || e.code === 'NumpadEnter') && P.deadT > 0.8) { showTitle(); document.getElementById('seed').value = ''; begin('new'); } // snabbstart
  else if ((state === 'dead' || state === 'runover') && e.code === 'KeyC') { try { navigator.clipboard.writeText(seedText(run.seed)); say('FRÖET ÄR KOPIERAT', 1.5); } catch (er) { /* inget urklipp */ } }
  else if (state === 'pause' && e.code === 'KeyM') { pauseMap = !pauseMap; }
  else if (e.code === 'Enter' || e.code === 'Space') {
    if (state === 'stats') nextFloor(); else leaveRunScreen();
  }
});
addEventListener('keyup', e0 => { const e = keyEv(e0); keys[e.code] = false; if (e.code === 'KeyF') grenadeThrow(); if (e.code === 'KeyQ') wheelRelease(); });
// vapenhjulet: håll Q (eller håll byt-knappen på mobilen) och peka med musen/tummen
let wheel = null;
function wheelStart() { if (state !== 'play' || run.pact) return false; wheel = { t0: performance.now(), open: false, vx: 0, vy: 0 }; return true; }
function wheelOwned() { return WEAPONS.map((w, i) => i).filter(i => P.has[i]); }
function wheelPick() { const own = wheelOwned(); if (!wheel || Math.hypot(wheel.vx, wheel.vy) < 14 || !own.length) return -1; const a = (Math.atan2(wheel.vy, wheel.vx) + Math.PI / 2 + TAU * 2) % TAU; return own[Math.floor(a / TAU * own.length + 0.5) % own.length]; }
function wheelRelease(quick) {
  if (!wheel) return; const w = wheel; wheel = null;
  if (w.open) { const i = (w.vx || w.vy) ? wheelPick_(w) : -1; if (i >= 0 && i !== P.weapon) switchWeapon(i); return; }
  if (quick) quick(); else if (P.has[P.lastWeapon] && P.lastWeapon !== P.weapon) switchWeapon(P.lastWeapon); else cycleWeapon(1); // kort tryck: förra vapnet
}
function wheelPick_(w) { const keep = wheel; wheel = w; const i = wheelPick(); wheel = keep; return i; }
function drawWheel(g) {
  const own = wheelOwned(), cx = W / 2, cy = HORIZON, r = 46, sel = wheelPick();
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(cx, cy, r + 14, 0, TAU); g.fill();
  own.forEach((i, k) => { const a = k / own.length * TAU - Math.PI / 2, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r, wp = WEAPONS[i];
    const col = i === sel ? '#ffd24a' : i === P.weapon ? '#e8d9b0' : '#a08860'; txt(wp.short, x - textW(wp.short) / 2, y - 4, col, 1, true, 1);
    if (!wp.melee) { const t = String(P.mags[i] + P.ammo[wp.ammo]); txt(t, x - textW(t) / 2, y + 5, '#8a7a60', 1, true, 0.8); } });
  g.strokeStyle = '#ffd24a'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + clamp(wheel.vx, -40, 40), cy + clamp(wheel.vy, -40, 40)); g.stroke();
  const t = 'VAPENHJULET'; txt(t, cx - textW(t) / 2, cy - r - 12, '#c9a87a', 1, true, 0.9);
}
function cycleWeapon(d) { const N = WEAPONS.length; for (let i = 1; i <= N; i++) { const n = ((WS.next >= 0 && WS.state === 'holster' ? WS.next : P.weapon) + d * i + N * 2) % N; if (P.has[n]) { switchWeapon(n); break; } } }
canvas.addEventListener('mousedown', e => {
  if (state === 'dead' || state === 'runover') return leaveRunScreen();
  if (state === 'stats') return nextFloor();
  if (state === 'pause') return resume();
  if (state !== 'play') return;
  if (document.pointerLockElement !== canvas) lockPointer();
  if (e.button === 2) aimDown = true; else mouseDown = true;
});
addEventListener('mouseup', e => { if (e.button === 2) aimDown = false; else mouseDown = false; });
addEventListener('mousemove', e => {
  if (wheel && wheel.open && state === 'play') { wheel.vx = clamp(wheel.vx + e.movementX, -60, 60); wheel.vy = clamp(wheel.vy + e.movementY, -60, 60); return; } // vapenhjulet tar musen
  if (document.pointerLockElement === canvas && state === 'play') {
    const s = 0.0026 * settings.sens * (1 - WS.aim * 0.35);
    P.a += e.movementX * s;
    WS.swayX = clamp(WS.swayX + e.movementX * 0.05, -10, 10); WS.swayY = clamp(WS.swayY + e.movementY * 0.03, -6, 6);
  }
});
document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== canvas && state === 'play' && !params.has('nolock')) pause(); });
addEventListener('blur', () => pause());
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
canvas.addEventListener('wheel', e => { e.preventDefault(); if (state === 'play') cycleWeapon(Math.sign(e.deltaY)); }, { passive: false });
canvas.addEventListener('contextmenu', e => e.preventDefault());

// ---------- Helskärm ----------
const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;
const fsSupported = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
function toggleFullscreen() {
  const el = document.documentElement;
  try {
    if (fsElement()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req || !fsSupported()) { say('HELSKÄRM GÅR INTE HÄR – ÖPPNA SIDAN I WEBBLÄSAREN', 3); return; }
    const r = req.call(el, { navigationUI: 'hide' });
    const lock = () => { try { const o = screen.orientation; if (o && o.lock) o.lock('landscape').catch(() => {}); } catch (e) { /* valfritt */ } };
    if (r && r.then) r.then(lock).catch(() => say('HELSKÄRM NEKADES', 2)); else lock();
  } catch (e) { say('HELSKÄRM GÅR INTE HÄR', 2); }
}
const syncFsIcons = () => { const big = !fsElement(); document.querySelectorAll('.fsicon').forEach(i => { i.src = A + 'touch/icon_size_' + (big ? 'larger' : 'smaller') + '.png'; }); };
document.addEventListener('fullscreenchange', syncFsIcons); document.addEventListener('webkitfullscreenchange', syncFsIcons);

// ---------- Mobilstyrning (Kenney Mobile Controls, CC0) ----------
// Vänster halva: flytande joystick (gå/springa). Höger halva: dra för att vrida. Knappar: skjut (dra också för att sikta), sikta, ladda om, använd, byt vapen, karta, kort, paus.
const touch = { active: false, mx: 0, my: 0, mag: 0, look: 0, lookY: 0, tap: 0 };
const TAP_MOVE = 12, TAP_TIME = 250; // px, ms: kort tryck i vridzonen = ett skott, dra = vrid
// stående: bilden ligger överst och hela bilden är vridzon, joysticken bor under den
const lookFloor = () => innerHeight > innerWidth ? canvas.getBoundingClientRect().bottom : 0;
const isTouch = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
function setupTouch() {
  const ui = document.getElementById('touch');
  const T = A + 'touch/';
  const btn = (act, icon, cls) => `<button class="tb ${cls}" data-act="${act}" aria-label="${act}"><img src="${T}btn.png" alt=""><img class="ic${act === 'fullscreen' ? ' fsicon' : ''}" src="${T}icon_${icon}.png" alt=""></button>`;
  ui.innerHTML = `<div class="joy" hidden><img class="pad" src="${T}pad.png" alt=""><img class="nub" src="${T}nub.png" alt=""></div>
    ${btn('fire', 'crosshair', 'fire')}${btn('aim', 'target', 'aim')}${btn('reload', 'arrow_rotate', 'reload')}${btn('use', 'hand', 'use')}${btn('swap', 'arrow_curved', 'swap')}
    ${btn('map', 'map', 'map small')}${btn('deck', 'star', 'deck small')}${btn('pause', 'pause', 'pausebtn small')}${btn('fullscreen', 'size_larger', 'fsbtn small')}${btn('settings', 'gear', 'gearbtn small')}${btn('giveup', 'exit', 'giveupbtn small')}${btn('jump', 'jump', 'jumpb')}${btn('crouch', 'crouch', 'crouchb')}${btn('dash', 'dash', 'dashb')}${btn('grenade', 'grenade', 'grenb')}${btn('potion', 'potion', 'potb')}${btn('walk', 'arrow_curved', 'walkb')}${btn('ability', 'star', 'abb')}`;
  applyTouchLayout();
  const joy = ui.querySelector('.joy'), nub = ui.querySelector('.nub');
  const ptrs = new Map(); // pointerId -> { kind, x, y, ox, oy }
  const R = () => Math.min(innerWidth, innerHeight) * 0.13; // joystickens radie
  ui.addEventListener('pointerdown', e => {
    const fsb = e.target.closest('.fsbtn');
    if (fsb) { ui.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { kind: 'btn', btn: fsb, fs: true }); fsb.classList.add('on'); e.preventDefault(); return; }
    if (state === 'pause' && e.target.closest('.gearbtn')) { openSettingsUI(); e.preventDefault(); return; }
    if (state === 'pause' && e.target.closest('.giveupbtn')) { abandonRun(); e.preventDefault(); return; }
    if (state !== 'play') { // tryck för att fortsätta, gå vidare osv.
      if (state === 'pause') resume(); else if (state === 'stats') nextFloor(); else leaveRunScreen();
      e.preventDefault(); return;
    }
    touch.active = true; ensureAudio();
    const b = e.target.closest('.tb');
    ui.setPointerCapture(e.pointerId);
    if (b) {
      const act = b.dataset.act; b.classList.add('on');
      if (act === 'fire') { mouseDown = true; ptrs.set(e.pointerId, { kind: 'look', x: e.clientX, y: e.clientY, btn: b, fire: true }); }
      else {
        ptrs.set(e.pointerId, { kind: 'btn', btn: b });
        if (act === 'aim') aimDown = !aimDown;
        if (act === 'reload') reloadKey();
        if (act === 'use') useKey();
        if (act === 'swap') { const p0 = ptrs.get(e.pointerId); p0.sx = e.clientX; p0.sy = e.clientY; p0.swap = true; wheelStart(); } // svep: byt, håll: vapenhjulet
        if (act === 'map') { const p0 = ptrs.get(e.pointerId); p0.mapHold = setTimeout(() => { p0.mapHeld = showMap; showMap = 2; }, 450); showMap = (showMap + 1) % 3; settings.map = showMap; saveSettings(); } // håll för hela kartan
        if (act === 'walk') { autoWalk = !autoWalk; b.classList.toggle('lit', autoWalk); say(autoWalk ? 'GÅR FRAMÅT – STYR MED TUMMEN' : 'STANNAR', 1); }
        if (act === 'deck') showDeck();
        if (act === 'pause') pause();
        if (act === 'jump') jump();
        if (act === 'crouch') touch.crouch = true;
        if (act === 'dash') dash(0, 0);
        if (act === 'grenade') grenadeStart();
        if (act === 'potion') drinkPotion();
        if (act === 'ability') useAbility();
      }
    } else if ((settings.lefty ? e.clientX > innerWidth * 0.55 : e.clientX < innerWidth * 0.45) && e.clientY > lookFloor()) { // joysticken: flytande där tummen landar, eller fast
      const fixed = settings.fixedJoy, fx0 = settings.lefty ? innerWidth * 0.85 : innerWidth * 0.15, fy0 = innerHeight * 0.72;
      const ox = fixed ? fx0 : e.clientX, oy = fixed ? fy0 : e.clientY;
      ptrs.set(e.pointerId, { kind: 'joy', ox, oy });
      joy.hidden = false; joy.style.left = (settings.lefty ? innerWidth - ox : ox) + 'px'; joy.style.top = oy + 'px'; nub.style.transform = 'translate(-50%,-50%)'; // spegelvänd layout för vänsterhänta
    } else { // vridzon: tryck för att skjuta, dra för att vrida
      ptrs.set(e.pointerId, { kind: 'look', x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t0: performance.now(), tap: true });
    }
    e.preventDefault();
  });
  ui.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    if (p.kind === 'joy') {
      let dx = e.clientX - p.ox, dy = e.clientY - p.oy; const d = Math.hypot(dx, dy), r = R();
      if (d > r) { dx *= r / d; dy *= r / d; }
      touch.mx = dx / r; touch.my = dy / r; touch.mag = Math.min(1, d / r);
      nub.style.transform = `translate(calc(-50% + ${settings.lefty ? -dx : dx}px), calc(-50% + ${dy}px))`;
    } else if (p.swap) {
      const dx = e.clientX - p.sx, dy = e.clientY - p.sy;
      if (wheel && wheel.open) { wheel.vx = clamp(dx, -60, 60); wheel.vy = clamp(dy, -60, 60); }
      else if (Math.abs(dx) > 34 && !p.swiped) { p.swiped = true; wheel = null; cycleWeapon(dx > 0 ? 1 : -1); play('click', 0.4, 1.5); } // dra-gest
    } else if (p.kind === 'look') {
      touch.look += (e.clientX - p.x) * 320 / innerWidth; touch.lookY += (e.clientY - p.y) * 200 / innerHeight;
      p.x = e.clientX; p.y = e.clientY;
      if (p.tap && Math.hypot(p.x - p.sx, p.y - p.sy) > TAP_MOVE) p.tap = false;
    }
    e.preventDefault();
  });
  const end = e => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    ptrs.delete(e.pointerId);
    if (p.kind === 'joy') { touch.mx = touch.my = touch.mag = 0; joy.hidden = true; }
    if (p.btn) { p.btn.classList.remove('on'); if (p.btn.dataset.act === 'crouch') touch.crouch = false; if (p.btn.dataset.act === 'grenade') grenadeThrow();
      if (p.swap && !p.swiped) wheelRelease(() => cycleWeapon(1));
      if (p.mapHold) { clearTimeout(p.mapHold); if (p.mapHeld !== undefined) { showMap = p.mapHeld; settings.map = showMap; saveSettings(); } } }
    if (p.fire) mouseDown = false;
    if (p.tap && e.type === 'pointerup' && performance.now() - p.t0 < TAP_TIME && state === 'play') { // snabbt tryck = skott, dubbeltryck = hopp (inställning)
      if (settings.tapJump && performance.now() - (touch.lastTap || 0) < 320) { jump(); touch.lastTap = 0; } else { touch.tap = 0.12; touch.lastTap = performance.now(); } }
    if (p.fs && e.type === 'pointerup') toggleFullscreen(); // helskärm måste begäras när fingret släpps (användargest)
  };
  ui.addEventListener('pointerup', end); ui.addEventListener('pointercancel', end);
  ui.addEventListener('contextmenu', e => e.preventDefault());
  ui.addEventListener('touchstart', e => e.preventDefault(), { passive: false }); // inga efterföljande musklick som stänger kortleken direkt
  // visa kontrollerna bara när det behövs
  setInterval(() => {
    const show = isTouch() && map && state !== 'title' && state !== 'ui';
    ui.hidden = !show;
    ui.classList.toggle('playing', state === 'play');
    ui.querySelector('[data-act=aim]').classList.toggle('lit', aimDown);
    ui.classList.toggle('paused', state === 'pause');
  }, 150);
}

// ---------- Startskärm och upplåsningar ----------
function setupSliders() {
  const sens = document.getElementById('sens'), fov = document.getElementById('fov');
  const show = () => { document.getElementById('sensv').textContent = settings.sens.toFixed(1); document.getElementById('fovv').textContent = settings.fov + '°'; };
  sens.value = settings.sens; fov.value = settings.fov; show();
  sens.oninput = () => { settings.sens = +sens.value; saveSettings(); show(); };
  fov.oninput = () => { settings.fov = +fov.value; saveSettings(); show(); };
}
const ASC_TEXT = ['INGA EXTRA FÖRBANNELSER', '1: FIENDERNA HAR 10 % MER HP', '2: + BUTIKEN ÄR 20 % DYRARE', '3: + MINDRE HÄLSA FALLER', '4: + ELITERNA SLÅR 20 % HÅRDARE', '5: + BOSSARNA HAR 25 % MER HP'];
function refreshTitle() {
  const diffBox = document.getElementById('diff');
  if (!diffBox.children.length) DIFF.forEach((d, i) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.d = i; b.textContent = d.name; b.onclick = () => { settings.diff = i; saveSettings(); refreshTitle(); }; diffBox.appendChild(b); });
  diffBox.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.d === settings.diff)));
  const clsBox = document.getElementById('classes'); clsBox.textContent = '';
  for (const [id, c] of Object.entries(CLASSES)) { const b = document.createElement('button'); b.type = 'button'; const open = classOpen(id);
    b.textContent = open ? c.name : `${c.name} (${c.cost} SJÄLAR)`; b.title = c.text; b.setAttribute('aria-pressed', String((settings.cls || 'vandrare') === id)); if (!open) b.classList.add('locked');
    b.onclick = () => { if (!classOpen(id)) { if (profile.souls < c.cost) { document.getElementById('status').textContent = `${c.name} KOSTAR ${c.cost} SJÄLAR`; return; } profile.souls -= c.cost; profile.classes = (profile.classes || []).concat(id); saveProfile(); checkAch(); }
      settings.cls = id; saveSettings(); refreshTitle(); document.getElementById('status').textContent = c.text; };
    clsBox.appendChild(b); }
  const petBox = document.getElementById('pets'); if (petBox) { petBox.textContent = ''; petBox.hidden = !PET_IDS.some(petOpen);
    for (const id of ['', ...PET_IDS]) { if (id && !petOpen(id)) continue; const b = document.createElement('button'); b.type = 'button'; b.textContent = id ? PETS[id].name : 'INGEN FÖLJESLAGARE'; b.title = id ? PETS[id].text : '';
      b.setAttribute('aria-pressed', String((settings.pet || '') === id)); b.onclick = () => { settings.pet = id; saveSettings(); refreshTitle(); document.getElementById('status').textContent = id ? `${PETS[id].name}: ${PETS[id].text}` : 'DU GÅR ENSAM'; }; petBox.appendChild(b); } }
  const cmBox = document.getElementById('cmodes'); if (cmBox) { cmBox.textContent = ''; cmBox.hidden = (profile.runs || 0) < 1;
    for (const [id, c] of Object.entries(CMODES)) { const b = document.createElement('button'); b.type = 'button'; b.textContent = c.name; b.title = c.text; b.setAttribute('aria-pressed', String((settings.cmode || '') === id)); b.onclick = () => { settings.cmode = id; saveSettings(); refreshTitle(); document.getElementById('status').textContent = c.text; }; cmBox.appendChild(b); } }
  const di = document.getElementById('dailyinfo'); if (di) di.textContent = dailyInfo();
  const ascBox = document.getElementById('asc'); ascBox.hidden = settings.diff !== 3; ascBox.textContent = '';
  if (settings.diff === 3) { const max = profile.ascMax || 0; for (let i = 0; i <= Math.min(5, max); i++) { const b = document.createElement('button'); b.type = 'button'; b.textContent = i ? `UPPSTIGNING ${i}` : 'GRUND'; b.title = ASC_TEXT[i]; b.setAttribute('aria-pressed', String((settings.asc || 0) === i)); b.onclick = () => { settings.asc = i; saveSettings(); refreshTitle(); document.getElementById('status').textContent = ASC_TEXT[i]; }; ascBox.appendChild(b); } if (!max) ascBox.appendChild(Object.assign(document.createElement('span'), { className: 'label', textContent: 'VINN PÅ MARDRÖM FÖR UPPSTIGNING 1' })); }
  const saved = store.get('run', null), cont = document.getElementById('continue');
  cont.hidden = !saved; if (saved) cont.textContent = `FORTSÄTT (VÅNING ${saved.run.depth})`;
  const locked = window.Cards ? Cards.ALL.filter(c => c.unlock && !profile.unlocked.includes(c.id)).length : 0;
  document.getElementById('souls').textContent = `SJÄLAR: ${profile.souls}  ·  LÅSTA KORT: ${locked}`;
  document.getElementById('best').textContent = profile.runs ? `RUNDOR ${profile.runs} · SEGRAR ${profile.wins} · BÄSTA VÅNING ${profile.bestDepth} · REKORD ${profile.bestScore}` : '';
}
function openUnlocks() {
  const items = Cards.ALL.filter(c => c.unlock).sort((a, b) => a.unlock - b.unlock).map(card => ({ kind: 'card', card, price: card.unlock, owned: profile.unlocked.includes(card.id) }));
  CardUI.shop(items, profile.souls, item => {
    if (item.owned || profile.souls < item.price) return { ok: false, gold: profile.souls };
    profile.souls -= item.price; profile.unlocked.push(item.card.id); item.owned = true; saveProfile(); play('buy', 0.8);
    return { ok: true, gold: profile.souls };
  }, () => refreshTitle(), { title: 'LÅS UPP KORT', currency: 'SJÄLAR', currencyColor: '#c0a0ff' });
}
// ---------- Version 6: eldbossen (sjunde bossen) ----------
Object.assign(BOSS_AI, {
  // Eldkungen: eldklot i salvor, ett slag som får lava att spruta upp i en ring, lavapölar i fas 2, raseri i fas 3
  flame(b, dt, dist, ang, ph) {
    const fast = ph === 3 ? 1.4 : 1;
    if (ph >= 2) { b.poolT = (b.poolT ?? 3) - dt; if (b.poolT <= 0) { b.poolT = rnd(3, 5) / fast; for (let i = 0; i < 2 + ph; i++) { const a = rnd(0, TAU), r = rnd(1.5, 4); const x = P.x + Math.cos(a) * r, y = P.y + Math.sin(a) * r; if (!solid(x, y)) groundFires.push({ x, y, t: 5, acc: 0 }); } } }
    if (b.state === 'volley') {
      const k = Math.floor(b.t / 0.22);
      if (k >= 1 && k <= 2 + ph && k !== b.lastShot) { b.lastShot = k; for (const s of [-0.18, 0, 0.18]) shootFireball(b, ang + s + rnd(-0.05, 0.05), 7, 9, k === 2 + ph); play('fireburst', 0.6, 0.8, { x: b.x, y: b.y }); }
      if (b.t > 1.5) { b.state = 'idle'; b.t = 0; b.cd = rnd(1.1, 1.8) / fast; }
      return;
    }
    if (b.state === 'slam') {
      if (!b.didHit && b.t > 0.75) { b.didHit = true; P.shake = Math.max(P.shake, 2.2); play('eruption', 1, 0.9); if (dist < b.d.range) hurtPlayer(b.d.dmg, b.x, b.y, 'melee');
        const n = 10 + ph * 2; for (let i = 0; i < n; i++) { const a = i / n * TAU, r = 2.4 + (i % 2) * 1.4; addHazard(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r, 'lavaburst', { warn: 0.55, life: 0.9, r: 0.7, dmg: 12 }); } }
      if (b.t > 1.3) { b.state = 'idle'; b.t = 0; b.cd = rnd(1, 1.6) / fast; }
      return;
    }
    b.cd -= dt;
    if (b.cd <= 0 && hasLOS(b.x, b.y, P.x, P.y)) { b.t = 0; b.didHit = false; b.lastShot = -1; b.state = dist < b.d.range + 1.2 ? 'slam' : 'volley'; if (b.state === 'slam') { play('flame_boss_roar', 0.8, 1.1); bossWarn(b, b.d.name + ' HÖJER NÄVEN!'); } return; }
    if (dist > 3) bossMove(b, ang, b.d.speed * fast * dt * (b.slow > 0 ? 0.5 : 1));
  },
});
Object.assign(BOSS_SPECIAL, {
  flame(b, dt, dist, ang, ph) {
    if (b.spK) { // utbrott: lavabomber faller runt dig
      if (b.t < 0.05) { bossWarn(b, 'UTBROTT – SPRING!'); play('eruption', 1, 0.8); for (let i = 0; i < 5 + ph * 2; i++) { const a = rnd(0, TAU), r = i ? rnd(0.8, 4.5) : 0; fallHazard(P.x + Math.cos(a) * r, P.y + Math.sin(a) * r, 'meteor', 13, 1 + i * 0.1); } }
      if (b.t > 2) { b.state = 'idle'; b.t = 0; b.cd = 1; }
      return;
    }
    if (b.t < 0.05) { say(b.d.name + ' KALLAR PÅ ELDEN', 1.5); play('fire_elemental', 0.8, 0.8); for (let i = 0; i < 1 + ph; i++) { const spot = freeSpotFar(3, 6); if (spot) { const e = makeEnemy('Æ', spot[0], spot[1]); e.alert = true; e.minion = true; ents.push(e); totalEnemies++; spawnPuff(spot[0], spot[1], 6); } } }
    if (b.t > 0.8) { b.state = 'idle'; b.t = 0; b.cd = 0.6; }
  },
});
TAUNTS.flame = ['BRINN!', 'ASKA TILL ASKA', 'MIN ELD SLOCKNAR ALDRIG'];
(async () => {
  const st = document.getElementById('status');
  try {
    const bar = document.getElementById('loadbar'), help = document.getElementById('loadhelp');
    if (help) help.textContent = isTouch() ? 'VÄNSTER TUMME GÅR · HÖGER TUMME SIKTAR · TRYCK SNABBT FÖR ATT SKJUTA · HANDEN ÖPPNAR OCH HANDLAR' : 'WASD GÅ · MUS SIKTA · SPACE HOPPA · E ANVÄND · F GRANAT · H DRYCK · R LADDA OM';
    const tick = setInterval(() => { if (bar) bar.style.width = Math.min(98, loadN / 3.2) + '%'; }, 100);
    await loadAll(t => { st.textContent = t; });
    clearInterval(tick); if (bar) { bar.style.width = '100%'; setTimeout(() => { bar.parentNode.hidden = true; if (help) help.hidden = true; }, 300); }
    st.textContent = ''; prefetchSounds();
    for (const id of ['start', 'daily', 'unlocks', 'altar']) document.getElementById(id).disabled = false;
  } catch (e) { st.textContent = 'FEL: ' + e.message; console.error(e); }
  checkAch(); refreshTitle(); setupTouch(); setupSliders(); applyDisplay();
  if (isTouch()) document.body.classList.add('touch');
  addEventListener('resize', () => { if (settings.rotatePause && isTouch() && state === 'play' && innerHeight > innerWidth * 1.1) { pause(); say('PAUSAT – VRID TILLBAKA MOBILEN', 2); } }); // pausa vid stående läge
  CardUI.sfx = n => { const m = { flip: ['card', 0.4, 1.3], pick: ['card', 0.8, 0.9], deny: ['click', 0.6, 0.7], open: ['card', 0.3, 0.8], hover: ['ui_hover', 0.3, 1], click: ['ui_click', 0.5, 1] }[n]; if (m) play(m[0], m[1], m[2]); };
  document.querySelectorAll('#title button').forEach(b => { b.addEventListener('mouseenter', () => play('ui_hover', 0.3)); b.addEventListener('click', () => play('ui_click', 0.5)); });
  requestAnimationFrame(loop);
  window.__game = { P, WS, ents: () => ents, items: () => items, pots: () => pots, chests: () => chests, merchants: () => merchants, state: () => state, run: () => run, kills: () => kills, begin, doors: () => doors,
    fire, useKey, startReload, switchWeapon, floorDone, nextFloor, projectiles: () => projectiles, secrets: () => secrets, keys, setMouse: (d, aim) => { mouseDown = d; aimDown = !!aim; }, pause, resume, hurtPlayer,
    light: () => light, lvl: () => lvl, boss: () => boss, gainCard, startLevel, props: () => props, guardian: () => guardianE, explode, alertEnemy, WEAPONS, mods: () => M, loadFloor, openShop, openChest, profile, showTitle, endRun, hurtEnemy,
    spawnEnemy: (type, x, y) => { const e = makeEnemy(type, x, y); ents.push(e); totalEnemies++; return e; }, portals: () => portals, particles: () => particles, hazards: () => hazards,
    pet: () => pet, allies: () => allies, addPropAt, openCampfire, openQuestBoard, giveRune, useAbility, quests: () => quests, drinkPotion, swapPotion, givePotion, givePet, spawnAlly, spawnPortal, dropItem, openAlchemist, openPriest, openPetCage, biomeFor, useProp };
  if (params.has('autostart')) begin('new');
})();
document.getElementById('start').addEventListener('click', () => startMode('new'));
document.getElementById('daily').addEventListener('click', () => startMode('daily'));
document.getElementById('practicebtn').addEventListener('click', () => openPractice());
document.getElementById('newsbtn').addEventListener('click', () => showNews());
document.getElementById('manualbtn').addEventListener('click', () => showManual());
document.getElementById('continue').addEventListener('click', () => begin('continue'));
document.getElementById('unlocks').addEventListener('click', () => { ensureAudio(); openUnlocks(); });
document.getElementById('altar').addEventListener('click', () => { ensureAudio(); openAltar(); });
document.getElementById('settingsbtn').addEventListener('click', () => { ensureAudio(); openSettings(() => refreshTitle()); });
document.getElementById('profilebtn').addEventListener('click', () => showProfile());
document.getElementById('bestiary').addEventListener('click', () => showBestiary());
document.getElementById('achbtn').addEventListener('click', () => showAchievements());
document.getElementById('codexbtn').addEventListener('click', () => showCodex());
document.getElementById('bossrush').addEventListener('click', () => startMode('bossrush'));
document.getElementById('weekly').addEventListener('click', () => startMode('weekly'));
addEventListener('keydown', e => { if (state === 'title' && e.code === 'Enter' && !CardUI.isOpen() && document.activeElement?.tagName !== 'INPUT' && !document.getElementById('start').disabled) { e.preventDefault(); startMode('new'); } });
document.getElementById('fullscreen').addEventListener('click', () => toggleFullscreen());
})();
