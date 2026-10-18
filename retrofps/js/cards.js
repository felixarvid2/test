'use strict';
// KRYPTA – kortdata för roguelike-läget.
// Kort är ren data: varje kort har en `mods`-tabell med nycklar ur MOD_KEYS, och spelet
// tolkar summan (computeMods). Inga kort har egen kod, så nya kort = ny data.
(() => {
const RARITY = {
  vanlig:      { label: 'VANLIG',      color: '#c9a87a', weight: 60, price: 40 },
  ovanlig:     { label: 'OVANLIG',     color: '#6fc26a', weight: 28, price: 70 },
  sallsynt:    { label: 'SÄLLSYNT',    color: '#5aa0e8', weight: 10, price: 120 },
  legendarisk: { label: 'LEGENDARISK', color: '#ffd24a', weight: 2,  price: 200 },
};
const RARITY_ORDER = ['vanlig', 'ovanlig', 'sallsynt', 'legendarisk'];

// Alla effekter spelet förstår. Värden summeras över alla ägda kort.
const MOD_KEYS = {
  dmg: 'Andel extra skada (0,2 = +20 %)',
  fireRate: 'Andel högre eldhastighet',
  reloadSpeed: 'Andel snabbare omladdning',
  magSize: 'Andel större magasin',
  accuracy: 'Andel mindre spridning',
  moveSpeed: 'Andel högre rörelsehastighet',
  maxHp: 'Extra max-HP (platt)',
  armorPerFloor: 'Rustning som ges vid varje ny våning',
  regen: 'HP per sekund',
  lifesteal: 'Andel av skadan som blir HP',
  critChance: 'Kritchans (0-1)',
  critDmg: 'Extra kritskada utöver grundkrit x2',
  pierce: 'Antal fiender kulan går igenom',
  extraPellets: 'Extra hagel/kulor per skott',
  explodeChance: 'Chans (0-1) till liten explosion vid träff',
  burnChance: 'Chans (0-1) att fienden brinner',
  slowChance: 'Chans (0-1) att fienden saktas ned',
  killHeal: 'HP per dödad fiende',
  killArmor: 'Rustning per dödad fiende',
  goldMul: 'Andel extra guld',
  ammoMul: 'Andel extra ammo från upplockning',
  healMul: 'Andel extra helning',
  dodge: 'Chans (0-1) att undvika skada',
  thorns: 'Skada tillbaka på närstridsangripare',
  damageTaken: 'Andel skada man tar (negativt = mindre)',
  projectileResist: 'Andel mindre skada från eldklot',
  meleeResist: 'Andel mindre närstridsskada',
  magnet: 'Extra räckvidd (rutor) för att dra till sig föremål',
  luck: 'Bättre kort och fynd',
  extraLife: 'Antal återupplivningar med halva HP',
  ammoSave: 'Chans (0-1) att skottet inte kostar ammo',
  shield: 'Sköldpoäng som laddas efter 4 s utan skada',
  light: 'Extra ljus i mörkret',
  secretSense: 'Hemliga väggar syns på kartan (1 = på)',
  cardChoices: 'Extra val vid kortdragning',
  shopDiscount: 'Andel rabatt i butiken',
  bossDmg: 'Andel extra skada mot bossar och elitfiender',
  firstShot: 'Andel extra skada på första skottet i magasinet',
  lowHpDmg: 'Andel extra skada när HP < 35 %',
  speedOnKill: 'Sekunder snabbare rörelse efter dödande',
  execute: 'Vanliga fiender under denna andel HP dör direkt',
};
const KEYS = Object.keys(MOD_KEYS);

// [id, namn, rarity, mods, max, text, extra]  – id = bildens filnamn (assets/cards/<id>.png)
// text: en effekt per rad (\n). Förbannade kort har `bad` = antal avslutande rader som är nackdelar.
const DEFS = [
  // ---- VANLIGA: små steg ----
  ['slipstenen', 'SLIPSTENEN', 'vanlig', { dmg: 0.10 }, 5, '+10 % SKADA'],
  ['kantvakten', 'KAMPSKÖLDEN', 'vanlig', { maxHp: 10 }, 5, '+10 MAX HP'],
  ['stovelremmen', 'BUNDNA STÖVLAR', 'vanlig', { moveSpeed: 0.07 }, 4, '+7 % RÖRELSEHASTIGHET'],
  ['ljuslykta', 'PAPPERSLYKTAN', 'vanlig', { light: 0.25 }, 3, '+25 % LJUS I MÖRKRET'],
  ['kompassen', 'DEN ROSTIGA KOMPASSEN', 'vanlig', { accuracy: 0.12 }, 4, '+12 % TRÄFFSÄKERHET'],
  ['lagerelden', 'LÄGERELDENS GLÖD', 'vanlig', { regen: 0.3 }, 3, '+0,3 HP PER SEKUND'],
  ['blomkrukan', 'GRAVBLOMMOR', 'vanlig', { healMul: 0.15 }, 3, '+15 % HELNING'],
  ['reservfickan', 'FLICKADE FICKAN', 'vanlig', { ammoMul: 0.15 }, 3, '+15 % AMMO FRÅN FÖREMÅL'],
  ['guldbaggen', 'GRAVSKARABÉN', 'vanlig', { goldMul: 0.15 }, 3, '+15 % GULD'],
  ['ledaren', 'DRAGSTENEN', 'vanlig', { magnet: 1 }, 3, '+1 RUTA RÄCKVIDD FÖR FÖREMÅL'],
  ['regnbagsfjadern', 'BLODIG FJÄDER', 'vanlig', { dodge: 0.04 }, 4, '+4 % CHANS ATT UNDVIKA SKADA'],
  ['murbruket', 'GRAVMURBRUK', 'vanlig', { armorPerFloor: 5 }, 3, '+5 RUSTNING VID VARJE VÅNING'],
  ['stenhjartat', 'STENHJÄRTAT', 'vanlig', { meleeResist: 0.08 }, 3, '-8 % NÄRSTRIDSSKADA'],
  ['tillbakablicken', 'BAKVÄNDA TIMGLASET', 'vanlig', { reloadSpeed: 0.12 }, 4, '+12 % LADDNINGSHASTIGHET'],
  // ---- OVANLIGA ----
  ['ekot', 'KRYPTKLOCKAN', 'ovanlig', { fireRate: 0.12 }, 3, '+12 % ELDHASTIGHET'],
  ['gravstenen', 'ASKURNAN', 'ovanlig', { magSize: 0.25 }, 2, '+25 % MAGASINSSTORLEK'],
  ['lodet', 'SJUNKNA ANKARET', 'ovanlig', { projectileResist: 0.2 }, 2, '-20 % SKADA FRÅN ELDKLOT'],
  ['korsriddaren', 'KORSFARARENS SVÄRD', 'ovanlig', { critChance: 0.08 }, 4, '+8 % KRITCHANS'],
  ['offerkniven', 'OFFERKNIVEN', 'ovanlig', { critDmg: 0.4 }, 3, '+40 % KRITSKADA'],
  ['glodkol', 'GLÖDKOLET', 'ovanlig', { burnChance: 0.15 }, 3, '15 % CHANS ATT SÄTTA FIENDEN I BRAND'],
  ['manesilver', 'MÅNSILVER', 'ovanlig', { slowChance: 0.15 }, 3, '15 % CHANS ATT SAKTA NED FIENDEN'],
  ['spegelskarvan', 'SPEGELSKÄRVAN', 'ovanlig', { thorns: 4 }, 3, 'NÄRSTRIDSANGRIPARE TAR 4 SKADA'],
  ['vandraren', 'VANDRARENS LYKTA', 'ovanlig', { secretSense: 1 }, 1, 'HEMLIGA VÄGGAR SYNS PÅ KARTAN', { unlock: 10 }],
  ['fyrklovern', 'FYRKLÖVERN', 'ovanlig', { luck: 0.1 }, 3, '+10 % LYCKA: BÄTTRE KORT OCH FYND'],
  ['hjartstenen', 'BLÖDANDE HJÄRTSTEN', 'ovanlig', { maxHp: 25 }, 3, '+25 MAX HP'],
  ['seansen', 'SÉANSLJUSET', 'ovanlig', { killHeal: 1 }, 3, 'DÖDADE FIENDER GER 1 HP'],
  ['karnan', 'RUNMÅLTAVLAN', 'ovanlig', { firstShot: 0.5 }, 3, '+50 % SKADA PÅ FÖRSTA SKOTTET', { unlock: 10 }],
  ['tjuren', 'BRONSTJUREN', 'ovanlig', { bossDmg: 0.25 }, 3, '+25 % SKADA MOT BOSSAR OCH ELIT'],
  ['loparen', 'NATTLÖPAREN', 'ovanlig', { speedOnKill: 1.5 }, 3, 'SNABBARE I 1,5 S EFTER DÖDANDE'],
  ['rostad_mandel', 'ROSTADE MANDLAR', 'ovanlig', { ammoSave: 0.08 }, 3, '8 % CHANS ATT SKOTT INTE KOSTAR AMMO'],
  ['offerdolken', 'OFFERDOLKEN', 'ovanlig', { critChance: 0.2, maxHp: -15 }, 2, '+20 % KRITCHANS\n-15 MAX HP', { curse: true, bad: 1, unlock: 10 }],
  // ---- SÄLLSYNTA ----
  ['vampyren', 'VAMPYRENS KYSS', 'sallsynt', { lifesteal: 0.06 }, 3, '6 % AV SKADAN BLIR HP', { unlock: 30 }],
  ['trefaldigheten', 'TREFALDIGHETEN', 'sallsynt', { extraPellets: 1 }, 2, '+1 KULA PER SKOTT', { unlock: 30 }],
  ['falskspelaren', 'FALSKSPELARENS ÄS', 'sallsynt', { cardChoices: 1 }, 2, '+1 VAL VID KORTDRAGNING', { unlock: 40 }],
  ['marmorbrottet', 'DÖDGRÄVARENS SPADE', 'sallsynt', { execute: 0.12 }, 2, 'VANLIGA FIENDER UNDER 12 % HP DÖR DIREKT', { unlock: 25 }],
  ['glorian', 'HELGONSKENET', 'sallsynt', { shield: 20 }, 2, '+20 SKÖLD, LADDAS EFTER 4 S UTAN SKADA'],
  ['bronda_runan', 'BRÄNDA RUNAN', 'sallsynt', { explodeChance: 0.15, burnChance: 0.10 }, 2, '15 % EXPLOSIONSCHANS\n10 % BRANDCHANS', { unlock: 25 }],
  ['prisma', 'KRISTALLPRISMAN', 'sallsynt', { pierce: 1 }, 2, 'KULAN GÅR IGENOM +1 FIENDE'],
  ['packet', 'RÅTTAN MED MYNTET', 'sallsynt', { shopDiscount: 0.12 }, 3, '-12 % PRISER I BUTIKEN'],
  ['stenmuren', 'STENMUREN', 'sallsynt', { killArmor: 2 }, 2, 'DÖDADE FIENDER GER 2 RUSTNING'],
  ['fana', 'BLODIGA FANAN', 'sallsynt', { lowHpDmg: 0.6, maxHp: -20 }, 2, '+60 % SKADA UNDER 35 % HP\n-20 MAX HP', { curse: true, bad: 1 }],
  ['forbannade_kronan', 'DEN FÖRBANNADE KRONAN', 'sallsynt', { dmg: 0.4, damageTaken: 0.25 }, 1, '+40 % SKADA\n+25 % SKADA DU TAR', { curse: true, bad: 1, unlock: 20 }],
  ['midasmasken', 'MIDASMASKEN', 'sallsynt', { goldMul: 0.5, healMul: -0.3 }, 1, '+50 % GULD\n-30 % HELNING', { curse: true, bad: 1, unlock: 20 }],
  // ---- LEGENDARISKA: ändrar spelstilen ----
  ['askkungen', 'ASKKUNGENS EDSVÄR', 'legendarisk', { burnChance: 0.45, explodeChance: 0.2, dmg: 0.15 }, 1, '45 % BRANDCHANS\n20 % EXPLOSIONSCHANS\n+15 % SKADA', { unlock: 50 }],
  ['solkonungen', 'SOLKUNGENS SIGILL', 'legendarisk', { critChance: 0.25, critDmg: 1.0, light: 0.4 }, 1, '+25 % KRITCHANS\n+100 % KRITSKADA\n+40 % LJUS', { unlock: 60 }],
  ['gravvaktaren', 'GRAVVAKTARENS VILJA', 'legendarisk', { maxHp: 50, armorPerFloor: 15, damageTaken: -0.2, meleeResist: 0.15 }, 1, '+50 MAX HP\n+15 RUSTNING PER VÅNING\n-20 % SKADA DU TAR\n-15 % NÄRSTRIDSSKADA', { unlock: 40 }],
  ['vaktarbanan', 'NATTKORPEN', 'legendarisk', { fireRate: 0.3, reloadSpeed: 0.3, ammoSave: 0.15, moveSpeed: 0.1 }, 1, '+30 % ELDHASTIGHET\n+30 % LADDNING\n15 % GRATIS SKOTT\n+10 % RÖRELSE', { unlock: 50 }],
  ['spegelvannen', 'SPEGELVÄNNEN', 'legendarisk', { extraPellets: 2, pierce: 1, magSize: 0.2 }, 1, '+2 KULOR PER SKOTT\nGÅR IGENOM +1 FIENDE\n+20 % MAGASIN', { unlock: 45 }],
  ['ouroboros', 'OUROBOROS', 'legendarisk', { extraLife: 1, regen: 1, lifesteal: 0.05, healMul: 0.25 }, 1, '+1 ÅTERUPPLIVNING\n+1 HP PER SEKUND\n5 % AV SKADAN BLIR HP\n+25 % HELNING', { unlock: 60 }],
  // ---- VAPENPAKTER: låser rundan till ett vapen och öppnar dess unika uppgraderingar ----
  ['pakt_pistol', 'REVOLVERMANNENS ED', 'sallsynt', { dmg: 0.15 }, 1, '+15 % SKADA\nALL AMMO BLIR 9MM\n5 UNIKA UPPGRADERINGAR\nBARA PISTOL RESTEN AV RUNDAN', { pact: 'pistol', bad: 1 }],
  ['pakt_hagel', 'SLAKTARENS ED', 'sallsynt', { dmg: 0.15 }, 1, '+15 % SKADA\nALL AMMO BLIR PATRONER\n5 UNIKA UPPGRADERINGAR\nBARA HAGELGEVÄR RESTEN AV RUNDAN', { pact: 'shotgun', bad: 1 }],
  ['pakt_gevar', 'SKYTTENS ED', 'sallsynt', { dmg: 0.15 }, 1, '+15 % SKADA\nALL AMMO BLIR 5.56\n4 UNIKA UPPGRADERINGAR\nBARA GEVÄR RESTEN AV RUNDAN', { pact: 'rifle', bad: 1 }],
  ['pakt_kpist', 'BLYREGNETS ED', 'sallsynt', { dmg: 0.15 }, 1, '+15 % SKADA\nALL AMMO BLIR 9MM\n4 UNIKA UPPGRADERINGAR\nBARA KPIST RESTEN AV RUNDAN', { pact: 'smg', bad: 1 }],
  // ---- VAPENUPPGRADERINGAR: dyker bara upp när man har vapnets pakt. Ändrar hur vapnet fungerar. ----
  ['studskulan', 'STUDSKULAN', 'ovanlig', {}, 1, 'TRÄFFAR STUDSAR VIDARE\nTILL NÄSTA FIENDE', { weapon: 'pistol', wup: 'ricochet' }],
  ['hanen', 'HANEFLÄKTEN', 'sallsynt', {}, 1, 'HÅLL IN: PISTOLEN TÖMMER\nMAGASINET I ETT SVEP\nSVEPET SPRIDER SIG', { weapon: 'pistol', wup: 'fan', bad: 1 }],
  ['sista_kulan', 'SISTA KULAN', 'ovanlig', {}, 1, 'SISTA SKOTTET I MAGASINET\nGÖR 3× SKADA OCH EXPLODERAR', { weapon: 'pistol', wup: 'lastround' }],
  ['duellanten', 'DUELLANTEN', 'sallsynt', {}, 1, 'OVETANDE FIENDER DÖR AV\nFÖRSTA TRÄFFEN\n3× SKADA PÅ OVETANDE ELIT', { weapon: 'pistol', wup: 'duel' }],
  ['tomhylsan', 'TOMHYLSAN', 'ovanlig', {}, 1, 'TOMT MAGASIN LADDAS OM\nPÅ ETT ÖGONBLICK', { weapon: 'pistol', wup: 'quickload' }],
  ['drakanden', 'DRAKANDEN', 'ovanlig', {}, 1, 'VARJE HAGEL SÄTTER\nFIENDEN I BRAND', { weapon: 'shotgun', wup: 'dragon' }],
  ['dubbelpipan', 'DUBBELPIPAN', 'sallsynt', {}, 1, 'TVÅ PATRONER PER SKOTT:\nDUBBELT SÅ MÅNGA HAGEL\nLÄNGRE MELLAN SKOTTEN', { weapon: 'shotgun', wup: 'double', bad: 1 }],
  ['slagkraften', 'SLAGKRAFTEN', 'ovanlig', {}, 1, 'NÄRA FIENDER SLUNGAS BAKÅT\nKROCK MOT VÄGG GER SKADA', { weapon: 'shotgun', wup: 'knock' }],
  ['splitterhaglet', 'SPLITTERHAGLET', 'sallsynt', {}, 1, 'FIENDER SOM DÖR AV HAGEL\nSPRÄNGS I SPLITTER', { weapon: 'shotgun', wup: 'shrapnel' }],
  ['snigeln', 'SNIGELN', 'legendarisk', {}, 1, 'SIKTA: SKJUTER EN SNIGEL SOM\nGÅR IGENOM ALLA FIENDER\nOCH GÖR 6× SKADA', { weapon: 'shotgun', wup: 'slug' }],
  ['kedjeblixten', 'KEDJEBLIXTEN', 'sallsynt', {}, 1, 'VAR FJÄRDE TRÄFF HOPPAR\nSOM BLIXT TILL 3 FIENDER', { weapon: 'rifle', wup: 'chain' }],
  ['kalla_blodet', 'KALLA BLODET', 'sallsynt', {}, 1, 'SIKTA 1 S: NÄSTA SKOTT GÖR\n4× SKADA OCH GÅR IGENOM', { weapon: 'rifle', wup: 'focus' }],
  ['kastmagasinet', 'KASTMAGASINET', 'ovanlig', {}, 1, 'OMLADDNING KASTAR DET GAMLA\nMAGASINET SOM EN GRANAT', { weapon: 'rifle', wup: 'grenade' }],
  ['skarpskytten', 'SKARPSKYTTEN', 'ovanlig', {}, 1, 'TRÄFFAR PÅ ÖVER 7 RUTOR ÄR\nALLTID KRITISKA, INGEN\nSKADEMINSKNING MED AVSTÅND', { weapon: 'rifle', wup: 'marksman' }],
  ['spinnpipan', 'SPINNPIPAN', 'ovanlig', {}, 1, 'HÅLL IN: ELDHASTIGHETEN\nVÄXER TILL DET DUBBLA', { weapon: 'smg', wup: 'spin' }],
  ['rikoschetten', 'RIKOSCHETTEN', 'ovanlig', {}, 1, 'KULOR STUDSAR MOT VÄGGAR\nOCH KAN TRÄFFA IGEN', { weapon: 'smg', wup: 'ricowall' }],
  ['dodsmarket', 'DÖDSMÄRKET', 'sallsynt', {}, 1, 'VAR ÅTTONDE TRÄFF PÅ SAMMA\nFIENDE DETONERAR MÄRKET', { weapon: 'smg', wup: 'marks' }],
  ['blybaltet', 'BLYBÄLTET', 'legendarisk', {}, 1, 'INGEN OMLADDNING: SKJUTER\nDIREKT UR RESERVEN\nSPRIDNINGEN VÄXER', { weapon: 'smg', wup: 'belt', bad: 1 }],
  ['tomhetsstenen', 'TOMHETSSTENEN', 'legendarisk', { dmg: 0.6, fireRate: 0.25, maxHp: -40, damageTaken: 0.35 }, 1, '+60 % SKADA\n+25 % ELDHASTIGHET\n-40 MAX HP\n+35 % SKADA DU TAR', { curse: true, bad: 2, unlock: 40 }],
];

const ALL = DEFS.map(([id, name, rarity, mods, max, text, extra]) => Object.assign(
  { id, name, rarity, text, icon: 'assets/cards/' + id + '.png', mods, max }, extra || {}));
const BY_ID = {};
for (const c of ALL) BY_ID[c.id] = c;
const byId = id => BY_ID[id] || null;

// ---------- Summering ----------
function computeMods(ownedIds) {
  const m = {};
  for (const k of KEYS) m[k] = 0;
  for (const id of ownedIds || []) {
    const c = BY_ID[id];
    if (!c) continue;
    for (const k in c.mods) if (k in m) m[k] += c.mods[k];
  }
  for (const k of KEYS) m[k] = Math.round(m[k] * 1e6) / 1e6; // slipp flyttalsbrus
  return m;
}

// ---------- Dragning ----------
// Vikten skiftar mot sällsyntare med djup (våning, 0..) och luck (summan av luck-modden, 0.1 per kort).
const CURSE_WEIGHT = 0.8; // förbannade kort dyker upp ibland
const PACT_WEIGHT = 2.5, UPGRADE_WEIGHT = 6; // en pakt syns i ungefär var femte dragning; efter pakten kommer uppgraderingarna tätt
function rarityWeight(rarity, depth, luck) {
  const t = Math.max(0, (depth || 0) * 0.25 + (luck || 0) * 2.5); // 0 = början av rundan
  const base = RARITY[rarity].weight;
  switch (rarity) {
    case 'vanlig': return base * Math.max(0.25, 1 - 0.3 * t);
    case 'ovanlig': return base * (1 + 0.2 * t);
    case 'sallsynt': return base * (1 + 0.8 * t);
    default: return base * (1 + 1.5 * t);
  }
}
function pickWeighted(rng, arr, fn) {
  if (rng && typeof rng.weighted === 'function') return rng.weighted(arr, fn);
  let total = 0;
  for (const a of arr) total += fn(a);
  let r = rng.next() * total;
  for (const a of arr) { r -= fn(a); if (r <= 0) return a; }
  return arr[arr.length - 1];
}
function draw(rng, n, opts) {
  opts = opts || {};
  const owned = {};
  for (const id of opts.owned || []) owned[id] = (owned[id] || 0) + 1;
  const unlocked = opts.unlocked instanceof Set ? opts.unlocked : new Set(opts.unlocked || []);
  const depth = opts.depth || 0, luck = opts.luck || 0;
  // pakter: bara en per runda. Uppgraderingar: bara för vapnet man har svurit sig till, och då ofta.
  const pact = opts.pact || null;
  const pool = ALL.filter(c => (owned[c.id] || 0) < c.max && (!c.unlock || unlocked.has(c.id))
    && (c.pact ? !pact : true) && (c.weapon ? c.weapon === pact : true));
  const out = [];
  while (out.length < n && pool.length) {
    const c = pickWeighted(rng, pool, x => rarityWeight(x.rarity, depth, luck) * (x.curse ? CURSE_WEIGHT : 1) * (x.pact ? PACT_WEIGHT : x.weapon ? UPGRADE_WEIGHT : 1));
    out.push(c);
    pool.splice(pool.indexOf(c), 1);
  }
  return out;
}

// ---------- Pris ----------
function price(card, depth, discount) {
  const base = RARITY[card.rarity].price * (card.curse ? 0.8 : 1);
  const p = base * (1 + 0.12 * (depth || 0)) * (1 - Math.min(0.9, Math.max(0, discount || 0)));
  return Math.max(5, Math.round(p / 5) * 5);
}

const WEAPON_NAME = { pistol: 'PISTOL', shotgun: 'HAGELGEVÄR', rifle: 'GEVÄR', smg: 'KPIST' };
// etikett ovanför kortets namn: förbannelse, pakt eller vilket vapen uppgraderingen hör till
function tag(card) {
  return card.curse ? 'FÖRBANNAD' : card.pact ? 'PAKT' : card.weapon ? WEAPON_NAME[card.weapon] : '';
}
function describe(card) {
  const r = RARITY[card.rarity];
  const head = card.name + ' (' + (tag(card) ? tag(card) + ' ' : '') + r.label + ')';
  return head + '\n' + card.text + (card.max > 1 ? '\nKAN TAS ' + card.max + ' GÅNGER' : '');
}

window.Cards = { ALL, byId, RARITY, RARITY_ORDER, MOD_KEYS, WEAPON_NAME, draw, computeMods, price, describe, tag };
})();
