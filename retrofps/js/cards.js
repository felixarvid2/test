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
  grenades: 'Extra max granater (platt)',
  grenadeDmg: 'Andel extra granatskada',
  stamina: 'Andel mer uthållighet',
  dashCd: 'Andel kortare återhämtning för rusning',
  airDmg: 'Andel extra skada medan man är i luften (hopp)',
  backstab: 'Andel extra skada mot fiender som inte sett dig',
  comboGold: 'Extra guld per steg i kombomätaren (platt)',
  trapResist: 'Andel mindre skada från fällor, lava och gas',
  freezeChance: 'Chans (0-1) att frysa fienden',
  poisonChance: 'Chans (0-1) att förgifta',
  shockChance: 'Chans (0-1) att en blixt hoppar till en närliggande fiende',
  interest: 'Andel ränta på guldet vid varje ny våning (max 30 guld)',
  floorHeal: 'HP som ges vid varje ny våning',
  killExplode: 'Chans (0-1) att dödade fiender exploderar',
  reloadNova: 'Skada i en stöt runt dig när du laddar om (platt, 0 = av)',
  eliteGold: 'Andel extra guld från eliter och väktare',
  trapSense: 'Fällor syns på kartan (1 = på)',
  enemySense: 'Fiender syns på kartan genom väggar (1 = på)',
  critHeal: 'HP per kritisk träff',
  dashDmg: 'Skada på fiender man rusar igenom (platt)',
  shieldOnKill: 'Sköldpoäng per dödad fiende',
  ammoRegen: 'Andel av ett magasin som fylls på per sekund i reserven',
  knockback: 'Andel större knuff vid träff',
  chestChoice: 'Extra val i kistor (platt)',
  freeReroll: 'Gratis "nya kort" i butiken per våning (platt)',
  hazardImmune: 'Immun mot lava, vatten, is och nät (1 = på)',
  doubleJump: 'Dubbelhopp (1 = på)',
  // version 5: drycker, följeslagare, närstrid, brand, kyla, huvudträffar och blödning
  potionPower: 'Andel starkare drycker',
  potionChance: 'Andel fler drycker',
  petPower: 'Andel starkare följeslagare',
  meleeDmg: 'Andel extra närstridsskada',
  fireDmg: 'Andel extra brandskada',
  coldResist: 'Andel mindre köld- och frostskada',
  headshot: 'Andel extra skada vid huvudträff',
  bleedChance: 'Chans (0-1) till blödning',
  allyChance: 'Chans (0-1) att en dödad fiende reser sig som allierad en stund',
  lightRadius: 'Extra ljusradie (platt)',
  weaponDrop: 'Chans (0-1) att eliter tappar vapen',
  npcDiscount: 'Andel rabatt hos alkemisten och prästen',
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
  // ---- NYA KORT (version 4): granater, rörelse, gift, frost, blixt, guld och skuggor ----
  // vanliga
  ['fyllbulten', 'MJÖDHORNET', 'vanlig', { stamina: 0.15 }, 4, '+15 % UTHÅLLIGHET'],
  ['fyrfoten', 'VARGTASSEN', 'vanlig', { dashCd: 0.12 }, 4, '12 % KORTARE ÅTERHÄMTNING\nFÖR RUSNING'],
  ['hornstenen', 'HÖRNSTENEN', 'vanlig', { trapResist: 0.2 }, 3, '-20 % SKADA FRÅN FÄLLOR,\nLAVA OCH GAS'],
  ['agget', 'DRAKÄGGET', 'vanlig', { grenades: 1 }, 3, '+1 MAX GRANAT'],
  ['benflojt', 'BENFLÖJTEN', 'vanlig', { grenadeDmg: 0.2 }, 3, '+20 % GRANATSKADA'],
  ['hangande_lappen', 'SKULDSEDELN', 'vanlig', { interest: 0.05 }, 3, '5 % RÄNTA PÅ GULDET VID\nVARJE NY VÅNING (MAX 30)'],
  ['gronskan', 'GRODDEN', 'vanlig', { floorHeal: 10 }, 3, '+10 HP VID VARJE NY VÅNING'],
  ['att_gora', 'KRÖNIKAN', 'vanlig', { comboGold: 1 }, 3, '+1 GULD PER KOMBOSTEG'],
  ['grodan', 'TRÄSKPADDAN', 'vanlig', { poisonChance: 0.12 }, 3, '12 % CHANS ATT FÖRGIFTA'],
  ['halvmane', 'HALVMÅNEN', 'vanlig', { backstab: 0.25 }, 3, '+25 % SKADA MOT\nOVETANDE FIENDER'],
  ['dominobrickan', 'BENTÄRNINGARNA', 'vanlig', { knockback: 0.3 }, 3, '+30 % KNUFF VID TRÄFF'],
  ['sollinsen', 'BRÄNNGLASET', 'vanlig', { critChance: 0.04, burnChance: 0.05 }, 3, '+4 % KRITCHANS\n5 % BRANDCHANS'],
  ['glasogat', 'SPRUCKNA LUPPEN', 'vanlig', { critHeal: 1 }, 3, '+1 HP PER KRITISK TRÄFF'],
  ['akrobaten', 'GYCKLARENS SKUGGA', 'vanlig', { airDmg: 0.2 }, 3, '+20 % SKADA I LUFTEN'],
  ['urtidsrunan', 'URTIDSURNAN', 'vanlig', { ammoRegen: 0.02 }, 3, '2 % AV ETT MAGASIN PER\nSEKUND TILL RESERVEN'],
  ['fyrkanten', 'RUNPLATTAN', 'vanlig', { shieldOnKill: 1 }, 3, '+1 SKÖLD PER DÖDAD FIENDE'],
  ['idolen', 'GULDIDOLEN', 'vanlig', { eliteGold: 0.3 }, 3, '+30 % GULD FRÅN ELIT\nOCH VÄKTARE'],
  ['moln_nio', 'FROSTMOLNET', 'vanlig', { freezeChance: 0.06 }, 3, '6 % CHANS ATT FRYSA FIENDEN'],
  ['askstav', 'ÅSKSTAVEN', 'vanlig', { shockChance: 0.08 }, 3, '8 % CHANS ATT EN BLIXT\nHOPPAR TILL EN GRANNE'],
  ['feltrycket', 'FALSKA TÄRNINGEN', 'vanlig', { freeReroll: 1, goldMul: -0.15 }, 1, '+1 GRATIS NYA KORT I\nBUTIKEN PER VÅNING\n-15 % GULD', { curse: true, bad: 1 }],
  // ovanliga
  ['spakvinnan', 'HÄXANS KRISTALL', 'ovanlig', { poisonChance: 0.18 }, 3, '18 % CHANS ATT FÖRGIFTA', { unlock: 15 }],
  ['kristallkronan', 'ISKRONAN', 'ovanlig', { freezeChance: 0.12 }, 2, '12 % CHANS ATT FRYSA FIENDEN', { unlock: 15 }],
  ['tankestormen', 'STORMHJÄRNAN', 'ovanlig', { shockChance: 0.15 }, 2, '15 % CHANS ATT EN BLIXT\nHOPPAR TILL EN GRANNE', { unlock: 20 }],
  ['inbrottstjuven', 'GRAVPLUNDRAREN', 'ovanlig', { backstab: 0.4, moveSpeed: 0.05 }, 2, '+40 % SKADA MOT\nOVETANDE FIENDER\n+5 % RÖRELSEHASTIGHET'],
  ['snedsteget', 'SPÖKTRAPPAN', 'ovanlig', { dashDmg: 15, dashCd: 0.1 }, 2, 'RUSNING GENOM FIENDER\nGÖR 15 SKADA\n10 % KORTARE ÅTERHÄMTNING'],
  ['spakortet', 'ALLSEENDE ÖGAT', 'ovanlig', { enemySense: 1 }, 1, 'FIENDER SYNS PÅ KARTAN\nGENOM VÄGGAR', { unlock: 20 }],
  ['avtrycket', 'FÄLLKARTAN', 'ovanlig', { trapSense: 1, trapResist: 0.1 }, 1, 'FÄLLOR SYNS PÅ KARTAN\n-10 % SKADA FRÅN FÄLLOR'],
  ['tomrummet', 'TOMRUMSRINGEN', 'ovanlig', { killExplode: 0.1 }, 3, '10 % CHANS ATT DÖDADE\nFIENDER EXPLODERAR'],
  ['trubaduren', 'DÖDSFIOLEN', 'ovanlig', { reloadNova: 15 }, 2, 'OMLADDNING GER EN STÖT\nSOM GÖR 15 SKADA RUNT DIG', { unlock: 15 }],
  ['lyckokatten', 'LYCKOKATTEN', 'ovanlig', { freeReroll: 1, luck: 0.05 }, 2, '+1 GRATIS NYA KORT I\nBUTIKEN PER VÅNING\n+5 % LYCKA'],
  ['sigillbrevet', 'SIGILLBREVET', 'ovanlig', { chestChoice: 1 }, 2, '+1 VAL I KISTOR', { unlock: 15 }],
  ['rotknuta', 'LIVSROTEN', 'ovanlig', { floorHeal: 20, regen: 0.2 }, 2, '+20 HP VID VARJE NY VÅNING\n+0,2 HP PER SEKUND'],
  ['schablonen', 'BÖDELNS MÅTT', 'ovanlig', { critChance: 0.06, critHeal: 2 }, 2, '+6 % KRITCHANS\n+2 HP PER KRITISK TRÄFF'],
  ['maskerna', 'DE TVÅ MASKERNA', 'ovanlig', { backstab: 0.6, damageTaken: 0.15 }, 1, '+60 % SKADA MOT\nOVETANDE FIENDER\n+15 % SKADA DU TAR', { curse: true, bad: 1, unlock: 20 }],
  ['baronen', 'BARONENS HATT', 'ovanlig', { eliteGold: 0.4, shopDiscount: 0.05 }, 2, '+40 % GULD FRÅN ELIT\nOCH VÄKTARE\n-5 % PRISER I BUTIKEN'],
  // sällsynta
  ['vandringsstaven', 'FROSTSTAVEN', 'sallsynt', { freezeChance: 0.15, slowChance: 0.1 }, 2, '15 % CHANS ATT FRYSA\n10 % CHANS ATT SAKTA NED', { unlock: 25 }],
  ['bryggan', 'BRON ÖVER AVGRUNDEN', 'sallsynt', { hazardImmune: 1 }, 1, 'IMMUN MOT LAVA, VATTEN,\nIS OCH NÄT', { unlock: 30 }],
  ['kubtornet', 'VAKTTORNET', 'sallsynt', { shield: 10, shieldOnKill: 2 }, 2, '+10 SKÖLD\n+2 SKÖLD PER DÖDAD FIENDE'],
  ['spadomskulan', 'ÖDESKULAN', 'sallsynt', { chestChoice: 1, luck: 0.1 }, 1, '+1 VAL I KISTOR\n+10 % LYCKA', { unlock: 30 }],
  ['glad_trefot', 'SKRATTBOMBEN', 'sallsynt', { grenades: 2, grenadeDmg: 0.3 }, 2, '+2 MAX GRANATER\n+30 % GRANATSKADA', { unlock: 25 }],
  ['pirathatten', 'KRUTKAPTENENS HATT', 'sallsynt', { dmg: 0.08, knockback: 0.4, killExplode: 0.08 }, 2, '+8 % SKADA\n+40 % KNUFF VID TRÄFF\n8 % CHANS ATT DÖDADE\nFIENDER EXPLODERAR'],
  ['horisonten', 'HORISONTRUNAN', 'sallsynt', { interest: 0.1, floorHeal: 10 }, 1, '10 % RÄNTA PÅ GULDET VID\nVARJE NY VÅNING (MAX 30)\n+10 HP VID VARJE NY VÅNING'],
  ['runsten', 'ÅSKRUNAN', 'sallsynt', { shockChance: 0.2, reloadNova: 20 }, 1, '20 % CHANS ATT EN BLIXT\nHOPPAR TILL EN GRANNE\nOMLADDNING GER EN STÖT\nSOM GÖR 20 SKADA', { unlock: 30 }],
  ['eremiten', 'EREMITENS Ö', 'sallsynt', { floorHeal: 30, regen: 0.5, moveSpeed: -0.1 }, 1, '+30 HP VID VARJE NY VÅNING\n+0,5 HP PER SEKUND\n-10 % RÖRELSEHASTIGHET', { curse: true, bad: 1 }],
  ['snedkronet', 'GIFTKRONAN', 'sallsynt', { poisonChance: 0.25, critChance: 0.05 }, 2, '25 % CHANS ATT FÖRGIFTA\n+5 % KRITCHANS', { unlock: 25 }],
  // legendariska
  ['prismakronan', 'REGNBÅGSKRONAN', 'legendarisk', { burnChance: 0.15, freezeChance: 0.15, poisonChance: 0.15, shockChance: 0.15 }, 1, '15 % BRANDCHANS\n15 % CHANS ATT FRYSA\n15 % CHANS ATT FÖRGIFTA\n15 % BLIXTCHANS', { unlock: 50 }],
  ['gryningen', 'GRYNINGSKORSET', 'legendarisk', { doubleJump: 1, airDmg: 0.35, stamina: 0.25 }, 1, 'DUBBELHOPP\n+35 % SKADA I LUFTEN\n+25 % UTHÅLLIGHET', { unlock: 45 }],
  ['travstaven', 'PILGRIMSSTAVEN', 'legendarisk', { dashCd: 0.3, dashDmg: 30, dodge: 0.08 }, 1, '30 % KORTARE ÅTERHÄMTNING\nFÖR RUSNING\nRUSNING GÖR 30 SKADA\n+8 % CHANS ATT UNDVIKA', { unlock: 40 }],
  ['brokiga', 'ÖDETS VÄV', 'legendarisk', { cardChoices: 1, chestChoice: 1, freeReroll: 1, luck: 0.15 }, 1, '+1 VAL VID KORTDRAGNING\n+1 VAL I KISTOR\n+1 GRATIS NYA KORT PER VÅNING\n+15 % LYCKA', { unlock: 55 }],
  ['ansiktslos', 'DEN ANSIKTSLÖSE', 'legendarisk', { backstab: 1, enemySense: 1, dmg: 0.2, maxHp: -30, healMul: -0.25 }, 1, '+100 % SKADA MOT OVETANDE\nFIENDER SYNS GENOM VÄGGAR\n+20 % SKADA\n-30 MAX HP\n-25 % HELNING', { curse: true, bad: 2, unlock: 40 }],
  // ---- NYA KORT (version 5): drycker, följeslagare och allierade, närstrid, blödning, brand, kyla och huvudträffar ----
  // vanliga
  ['lakebladet', 'LÄKEBLADET', 'vanlig', { potionPower: 0.15 }, 4, '+15 % STARKARE DRYCKER'],
  ['groddrunan', 'GRODDRUNAN', 'vanlig', { potionChance: 0.12 }, 3, '+12 % FLER DRYCKER'],
  ['vargtanden', 'VARGTANDEN', 'vanlig', { petPower: 0.15 }, 4, '+15 % STARKARE\nFÖLJESLAGARE'],
  ['jarnnaven', 'JÄRNNÄVEN', 'vanlig', { meleeDmg: 0.2 }, 4, '+20 % NÄRSTRIDSSKADA'],
  ['eldrunan', 'ELDRUNAN', 'vanlig', { fireDmg: 0.15 }, 4, '+15 % BRANDSKADA'],
  ['frosttoppen', 'FROSTTOPPEN', 'vanlig', { coldResist: 0.2 }, 3, '-20 % SKADA FRÅN\nKÖLD OCH FROST'],
  ['slaktkroken', 'SLAKTKROKEN', 'vanlig', { bleedChance: 0.1 }, 3, '10 % CHANS ATT FIENDEN\nBÖRJAR BLÖDA'],
  ['spejarkikaren', 'SPEJARKIKAREN', 'vanlig', { headshot: 0.2 }, 4, '+20 % SKADA VID HUVUDTRÄFF'],
  ['manrunan', 'MÅNRUNAN', 'vanlig', { lightRadius: 1 }, 3, '+1 LJUSRADIE'],
  ['marknadstaltet', 'MARKNADSTÄLTET', 'vanlig', { npcDiscount: 0.1 }, 3, '-10 % PRISER HOS\nALKEMISTEN OCH PRÄSTEN'],
  ['vapenladorna', 'VAPENLÅDORNA', 'vanlig', { weaponDrop: 0.1 }, 3, '10 % CHANS ATT ELITER\nTAPPAR SITT VAPEN'],
  ['dodsrunan', 'DÖDSRUNAN', 'vanlig', { allyChance: 0.04 }, 3, '4 % CHANS ATT EN DÖDAD\nFIENDE RESER SIG SOM\nDIN ALLIERADE'],
  // ovanliga
  ['blandbradet', 'BLANDBRÄDET', 'ovanlig', { potionPower: 0.12, potionChance: 0.12 }, 2, '+12 % STARKARE DRYCKER\n+12 % FLER DRYCKER', { unlock: 15 }],
  ['flockens_horn', 'FLOCKENS HORN', 'ovanlig', { petPower: 0.2, allyChance: 0.03 }, 2, '+20 % STARKARE\nFÖLJESLAGARE\n3 % CHANS ATT DÖDADE\nFIENDER BLIR ALLIERADE'],
  ['gapet', 'DET GRINANDE GAPET', 'ovanlig', { bleedChance: 0.15, meleeDmg: 0.15 }, 2, '15 % CHANS TILL BLÖDNING\n+15 % NÄRSTRIDSSKADA', { unlock: 15 }],
  ['bodelsnalen', 'BÖDELSNÅLEN', 'ovanlig', { headshot: 0.3, critChance: 0.03 }, 3, '+30 % SKADA VID HUVUDTRÄFF\n+3 % KRITCHANS'],
  ['ristarboden', 'RISTARBODEN', 'ovanlig', { npcDiscount: 0.15, shopDiscount: 0.05 }, 2, '-15 % PRISER HOS\nALKEMISTEN OCH PRÄSTEN\n-5 % PRISER I BUTIKEN'],
  ['brinnande_tornet', 'DET BRINNANDE TORNET', 'ovanlig', { fireDmg: 0.2, burnChance: 0.08 }, 2, '+20 % BRANDSKADA\n8 % BRANDCHANS'],
  ['trogna_anden', 'DEN TROGNA ANDEN', 'ovanlig', { allyChance: 0.05, petPower: 0.1 }, 2, '5 % CHANS ATT DÖDADE\nFIENDER BLIR ALLIERADE\n+10 % STARKARE\nFÖLJESLAGARE', { unlock: 15 }],
  ['overflodet', 'ÖVERFLÖDETS KORG', 'ovanlig', { potionChance: 0.2, ammoMul: 0.1 }, 2, '+20 % FLER DRYCKER\n+10 % AMMO FRÅN FÖREMÅL'],
  ['spokspegeln', 'SPÖKSPEGELN', 'ovanlig', { allyChance: 0.1, damageTaken: 0.15 }, 1, '10 % CHANS ATT DÖDADE\nFIENDER BLIR ALLIERADE\n+15 % SKADA DU TAR', { curse: true, bad: 1, unlock: 20 }],
  // sällsynta
  ['ishavet', 'ISHAVETS VÅG', 'sallsynt', { coldResist: 0.3, armorPerFloor: 8 }, 2, '-30 % SKADA FRÅN\nKÖLD OCH FROST\n+8 RUSTNING VID VARJE VÅNING'],
  ['jagarogat', 'JÄGARÖGAT', 'sallsynt', { headshot: 0.4, critDmg: 0.2 }, 2, '+40 % SKADA VID HUVUDTRÄFF\n+20 % KRITSKADA', { unlock: 25 }],
  ['dimvasen', 'DIMVÄSENDEN', 'sallsynt', { allyChance: 0.08, petPower: 0.2 }, 2, '8 % CHANS ATT DÖDADE\nFIENDER BLIR ALLIERADE\n+20 % STARKARE\nFÖLJESLAGARE', { unlock: 30 }],
  ['gavoasken', 'DEN FÖRSEGLADE GÅVAN', 'sallsynt', { weaponDrop: 0.2, luck: 0.05 }, 1, '20 % CHANS ATT ELITER\nTAPPAR SITT VAPEN\n+5 % LYCKA', { unlock: 25 }],
  ['haxkvasten', 'HÄXKVASTEN', 'sallsynt', { potionPower: 0.2, potionChance: 0.15, moveSpeed: 0.05 }, 2, '+20 % STARKARE DRYCKER\n+15 % FLER DRYCKER\n+5 % RÖRELSEHASTIGHET', { unlock: 25 }],
  ['trallbojan', 'TRÄLBOJAN', 'sallsynt', { allyChance: 0.15, petPower: 0.3, moveSpeed: -0.1 }, 1, '15 % CHANS ATT DÖDADE\nFIENDER BLIR ALLIERADE\n+30 % STARKARE\nFÖLJESLAGARE\n-10 % RÖRELSEHASTIGHET', { curse: true, bad: 1, unlock: 20 }],
  // legendariska
  ['purpurkitteln', 'PURPURKITTELN', 'legendarisk', { potionPower: 0.4, potionChance: 0.3, healMul: 0.15, npcDiscount: 0.15 }, 1, '+40 % STARKARE DRYCKER\n+30 % FLER DRYCKER\n+15 % HELNING\n-15 % PRISER HOS\nALKEMISTEN OCH PRÄSTEN', { unlock: 45 }],
  ['karmosinhjartat', 'KARMOSINHJÄRTAT', 'legendarisk', { bleedChance: 0.3, meleeDmg: 0.25, lifesteal: 0.04, maxHp: 20 }, 1, '30 % CHANS TILL BLÖDNING\n+25 % NÄRSTRIDSSKADA\n4 % AV SKADAN BLIR HP\n+20 MAX HP', { unlock: 50 }],
  ['dodsbesvarjaren', 'DÖDSBESVÄRJARENS SINNE', 'legendarisk', { allyChance: 0.15, petPower: 0.4, killHeal: 1 }, 1, '15 % CHANS ATT DÖDADE\nFIENDER BLIR ALLIERADE\n+40 % STARKARE FÖLJESLAGARE\n+1 HP PER DÖDAD FIENDE', { unlock: 50 }],
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
  // ---- pakter och uppgraderingar för dubbelbössa, armborst, signalpistol och prickskyttegevär ----
  ['pakt_dubbel', 'BÖDELNS ED', 'sallsynt', { dmg: 0.15 }, 1, '+15 % SKADA\nALL AMMO BLIR PATRONER\n4 UNIKA UPPGRADERINGAR\nBARA DUBBELBÖSSA RESTEN AV RUNDAN', { pact: 'dbshotgun', bad: 1 }],
  ['pakt_armborst', 'JÄGARENS ED', 'sallsynt', { dmg: 0.15 }, 1, '+15 % SKADA\nALL AMMO BLIR PILAR\n4 UNIKA UPPGRADERINGAR\nBARA ARMBORST RESTEN AV RUNDAN', { pact: 'crossbow', bad: 1 }],
  ['pakt_signal', 'FACKELBÄRARENS ED', 'sallsynt', { dmg: 0.15 }, 1, '+15 % SKADA\nALL AMMO BLIR BLOSS\n4 UNIKA UPPGRADERINGAR\nBARA SIGNALPISTOL RESTEN AV RUNDAN', { pact: 'flaregun', bad: 1 }],
  ['pakt_prick', 'SKARPRÄTTARENS ED', 'sallsynt', { dmg: 0.15 }, 1, '+15 % SKADA\nALL AMMO BLIR 5.56\n4 UNIKA UPPGRADERINGAR\nBARA PRICKSKYTTEGEVÄR RESTEN AV RUNDAN', { pact: 'sniper', bad: 1 }],
  ['blodskorden', 'BLODSKÖRDEN', 'ovanlig', {}, 1, 'VARJE DÖDAD FIENDE GER\n3 HP OCH EN PATRON TILLBAKA', { weapon: 'dbshotgun', wup: 'harvest' }],
  ['dubbeldoden', 'DUBBELDÖDEN', 'sallsynt', {}, 1, 'DÖDAR ETT SKOTT TVÅ FIENDER\nLADDAS BÅDA PIPORNA DIREKT', { weapon: 'dbshotgun', wup: 'doublekill' }],
  ['kedjekulan', 'KEDJEKULAN', 'sallsynt', {}, 1, 'TRE TUNGA KULOR I STÄLLET\nFÖR HAGEL: 3× SKADA VAR\nOCH GÅR IGENOM ALLA', { weapon: 'dbshotgun', wup: 'chainshot' }],
  ['stormsteget', 'STORMSTEGET', 'ovanlig', {}, 1, 'SKOTTET KASTAR DIG BAKÅT\nOCH DU TAR INGEN SKADA\nUNDER 0,4 S', { weapon: 'dbshotgun', wup: 'stormstep' }],
  ['sprangspetsen', 'SPRÄNGSPETSEN', 'sallsynt', {}, 1, 'PILAR FASTNAR I FIENDEN\nOCH SPRÄNGS EFTER 0,8 S', { weapon: 'crossbow', wup: 'blastbolt' }],
  ['giftspetsen', 'GIFTSPETSEN', 'ovanlig', {}, 1, 'TRÄFFAR FÖRGIFTAR I 4 S\nGIFTET SPRIDS NÄR\nFIENDEN DÖR', { weapon: 'crossbow', wup: 'poison' }],
  ['pilsamlaren', 'PILSAMLAREN', 'ovanlig', {}, 1, 'DÖDANDE PILAR KOMMER\nTILLBAKA OCH LÄGGS I DIREKT', { weapon: 'crossbow', wup: 'recover' }],
  ['treskottet', 'TRESKOTTET', 'legendarisk', {}, 1, 'TRE PILAR I EN SOLFJÄDER\nFÖR PRISET AV EN', { weapon: 'crossbow', wup: 'triple' }],
  ['fyrverkeriet', 'FYRVERKERIET', 'sallsynt', {}, 1, 'BLOSSET SPRICKER I FEM\nGNISTOR SOM OCKSÅ BRINNER', { weapon: 'flaregun', wup: 'cluster' }],
  ['solblosset', 'SOLBLOSSET', 'ovanlig', {}, 1, 'BLOSSET BLÄNDAR FIENDER\nINOM 3 RUTOR I 2 S', { weapon: 'flaregun', wup: 'blind' }],
  ['ekoblosset', 'EKOBLOSSET', 'ovanlig', {}, 1, 'BLOSSET STUDSAR MOT\nVÄGGAR TVÅ GÅNGER', { weapon: 'flaregun', wup: 'bounce' }],
  ['lopelden', 'LÖPELDEN', 'sallsynt', {}, 1, 'BRINNANDE FIENDER SOM DÖR\nTÄNDER ELD PÅ GRANNARNA', { weapon: 'flaregun', wup: 'wildfire' }],
  ['huvudjagaren', 'HUVUDJÄGAREN', 'sallsynt', {}, 1, 'ETT DÖDANDE SKOTT LADDAR\nOM DIREKT OCH NÄSTA\nSKOTT GÖR 2× SKADA', { weapon: 'sniper', wup: 'headhunter' }],
  ['genomborraren', 'GENOMBORRAREN', 'sallsynt', {}, 1, 'KULAN GÅR IGENOM VÄGGAR\nUPP TILL 2 RUTOR TJOCKA', { weapon: 'sniper', wup: 'wallpierce' }],
  ['tidsstoppet', 'TIDSSTOPPET', 'legendarisk', {}, 1, 'NÄR DU SIKTAR GÅR\nTIDEN I HALV FART', { weapon: 'sniper', wup: 'bullettime' }],
  ['sprangkulan', 'SPRÄNGKULAN', 'ovanlig', {}, 1, 'VARJE TRÄFF EXPLODERAR', { weapon: 'sniper', wup: 'explosive' }],
  ['tomhetsstenen', 'TOMHETSSTENEN', 'legendarisk', { dmg: 0.6, fireRate: 0.25, maxHp: -40, damageTaken: 0.35 }, 1, '+60 % SKADA\n+25 % ELDHASTIGHET\n-40 MAX HP\n+35 % SKADA DU TAR', { curse: true, bad: 2, unlock: 40 }],
  // ---- pakter och uppgraderingar för yxan, eldkastaren och granatkastaren (version 5) ----
  ['pakt_yxa', 'BÄRSÄRKENS ED', 'sallsynt', { dmg: 0.15 }, 1, '+15 % SKADA\nYXAN BEHÖVER INGEN AMMO\n4 UNIKA UPPGRADERINGAR\nBARA YXA RESTEN AV RUNDAN', { pact: 'axe', bad: 1 }],
  ['pakt_eld', 'MORDBRÄNNARENS ED', 'sallsynt', { dmg: 0.15 }, 1, '+15 % SKADA\nALL AMMO BLIR BRÄNSLE\n4 UNIKA UPPGRADERINGAR\nBARA ELDKASTARE RESTEN AV RUNDAN', { pact: 'flamer', bad: 1 }],
  ['pakt_gk', 'SPRÄNGMÄSTARENS ED', 'sallsynt', { dmg: 0.15 }, 1, '+15 % SKADA\nALL AMMO BLIR GRANATER\n4 UNIKA UPPGRADERINGAR\nBARA GRANATKASTARE RESTEN AV RUNDAN', { pact: 'launcher', bad: 1 }],
  ['virvelhugget', 'VIRVELHUGGET', 'sallsynt', {}, 1, 'LADDAT SLAG SNURRAR RUNT\nOCH TRÄFFAR ALLA\nOMKRING DIG', { weapon: 'axe', wup: 'axe_whirl' }],
  ['aderlataren', 'ÅDERLÅTAREN', 'ovanlig', {}, 1, 'TRÄFFAR GER BLÖDNING:\nSKADA ÖVER TID', { weapon: 'axe', wup: 'axe_bleed' }],
  ['returkastet', 'RETURKASTET', 'sallsynt', {}, 1, 'DEN KASTADE YXAN STUDSAR\nVIDARE TILL EN ANDRA FIENDE', { weapon: 'axe', wup: 'axe_boomerang' }],
  ['skordehugget', 'SKÖRDEHUGGET', 'ovanlig', {}, 1, 'DÖDANDE SLAG GER 5 HP', { weapon: 'axe', wup: 'axe_butcher' }],
  ['brinnande_jord', 'BRINNANDE JORD', 'sallsynt', {}, 1, 'LÅGAN LÄMNAR BRINNANDE\nMARK EFTER SIG', { weapon: 'flamer', wup: 'fl_napalm' }],
  ['bla_lagan', 'BLÅ LÅGAN', 'legendarisk', {}, 1, 'BLÅ LÅGA: +50 % SKADA\nOCH LÄNGRE RÄCKVIDD', { weapon: 'flamer', wup: 'fl_blue' }],
  ['sparlagan', 'SPARLÅGAN', 'ovanlig', {}, 1, 'HALVA BRÄNSLEÅTGÅNGEN', { weapon: 'flamer', wup: 'fl_frugal' }],
  ['eldmuren', 'ELDMUREN', 'sallsynt', {}, 1, 'HÖGERKLICK SPRUTAR EN\nELDVÄGG FRAMFÖR DIG', { weapon: 'flamer', wup: 'fl_wall' }],
  ['splitterskalet', 'SPLITTERSKALET', 'sallsynt', {}, 1, 'GRANATEN SPLITTRAS\nI TRE SMÅ GRANATER', { weapon: 'launcher', wup: 'gl_cluster' }],
  ['tjarbomben', 'TJÄRBOMBEN', 'ovanlig', {}, 1, 'GRANATEN FASTNAR\nPÅ FIENDER', { weapon: 'launcher', wup: 'gl_sticky' }],
  ['jattegranaten', 'JÄTTEGRANATEN', 'legendarisk', {}, 1, 'DUBBEL SPRÄNGRADIE\nGRANATEN FLYGER LÅNGSAMMARE', { weapon: 'launcher', wup: 'gl_mega', bad: 1 }],
  ['trummagasinet', 'TRUMMAGASINET', 'sallsynt', {}, 1, 'TRE GRANATER I SNABB FÖLJD', { weapon: 'launcher', wup: 'gl_drum' }],
];

// ---------- Set och synergier ----------
// Set: äger man 3 olika kort ur samma set får man setets bonus (räknas in i computeMods).
const SET_NEED = 3;
const SETS = {
  eld:    { name: 'ASKANS ORDEN',     text: '+10 % BRANDCHANS\n+10 % EXPLOSIONSCHANS\n+1 MAX GRANAT', mods: { burnChance: 0.1, explodeChance: 0.1, grenades: 1 } },
  frost:  { name: 'VINTERNS VAKT',    text: '+10 % CHANS ATT FRYSA\n+10 % CHANS ATT SAKTA NED\n-10 % SKADA FRÅN ELDKLOT', mods: { freezeChance: 0.1, slowChance: 0.1, projectileResist: 0.1 } },
  guld:   { name: 'GIRIGHETENS SKATT', text: '+20 % GULD\n+5 % RÄNTA VID NY VÅNING\n-10 % PRISER I BUTIKEN', mods: { goldMul: 0.2, interest: 0.05, shopDiscount: 0.1 } },
  krit:   { name: 'BÖDELNS BLICK',    text: '+5 % KRITCHANS\n+30 % KRITSKADA\n+1 HP PER KRITISK TRÄFF', mods: { critChance: 0.05, critDmg: 0.3, critHeal: 1 } },
  skugga: { name: 'SKUGGANS VÄG',     text: '+30 % SKADA MOT OVETANDE\n+5 % CHANS ATT UNDVIKA\nFIENDER SYNS PÅ KARTAN', mods: { backstab: 0.3, dodge: 0.05, enemySense: 1 } },
  luft:   { name: 'VINDENS BARN',     text: 'DUBBELHOPP\n+15 % SKADA I LUFTEN\n+5 % RÖRELSEHASTIGHET', mods: { doubleJump: 1, airDmg: 0.15, moveSpeed: 0.05 } },
  alkemi: { name: 'ALKEMISTENS LÄRA', text: '+20 % STARKARE DRYCKER\n+15 % FLER DRYCKER\n-10 % PRISER HOS ALKEMIST OCH PRÄST', mods: { potionPower: 0.2, potionChance: 0.15, npcDiscount: 0.1 } },
  flock:  { name: 'FLOCKENS BAND',    text: '+25 % STARKARE FÖLJESLAGARE\n+5 % CHANS TILL ALLIERADE\n+1 HP PER DÖDAD FIENDE', mods: { petPower: 0.25, allyChance: 0.05, killHeal: 1 } },
};
// Synergitaggar: kort med samma tagg spelar bra ihop (t.ex. eld + explosion, krit + kritskada).
const SYN = { eld: 'ELD', krit: 'KRIT', gift: 'GIFT', frost: 'FROST', blixt: 'BLIXT', skold: 'SKÖLD', guld: 'GULD', liv: 'LIV', rusning: 'RUSNING', skugga: 'SKUGGA', granat: 'GRANAT',
  dryck: 'DRYCK', flock: 'FLOCK', blod: 'BLOD', narstrid: 'NÄRSTRID' };
// set och syn för alla kort samlas här: id: [set eller '', syn-taggar...]
const TAGS = {
  // eld och explosioner
  glodkol: ['eld', 'eld'], bronda_runan: ['eld', 'eld'], askkungen: ['eld', 'eld'], benflojt: ['eld', 'eld', 'granat'],
  tomrummet: ['eld', 'eld'], glad_trefot: ['eld', 'eld', 'granat'], agget: ['', 'eld', 'granat'], pirathatten: ['', 'eld'],
  // frost
  manesilver: ['frost', 'frost'], moln_nio: ['frost', 'frost'], kristallkronan: ['frost', 'frost'], vandringsstaven: ['frost', 'frost'],
  prismakronan: ['frost', 'frost', 'eld', 'gift', 'blixt'],
  // guld
  guldbaggen: ['guld', 'guld'], hangande_lappen: ['guld', 'guld'], att_gora: ['guld', 'guld'], idolen: ['guld', 'guld'],
  lyckokatten: ['guld', 'guld'], baronen: ['guld', 'guld'], packet: ['', 'guld'], midasmasken: ['', 'guld'], horisonten: ['', 'guld', 'liv'], feltrycket: ['', 'guld'],
  // krit
  korsriddaren: ['krit', 'krit'], offerkniven: ['krit', 'krit'], glasogat: ['krit', 'krit', 'liv'], schablonen: ['krit', 'krit', 'liv'],
  sollinsen: ['krit', 'krit', 'eld'], solkonungen: ['', 'krit'], offerdolken: ['', 'krit'], snedkronet: ['', 'krit', 'gift'],
  // skuggor
  regnbagsfjadern: ['skugga', 'skugga'], halvmane: ['skugga', 'skugga'], inbrottstjuven: ['skugga', 'skugga'], snedsteget: ['skugga', 'skugga', 'rusning'],
  spakortet: ['skugga', 'skugga'], maskerna: ['skugga', 'skugga'], ansiktslos: ['', 'skugga'],
  // luft och rörelse
  stovelremmen: ['luft', 'rusning'], fyllbulten: ['luft', 'rusning'], fyrfoten: ['luft', 'rusning'], akrobaten: ['luft'],
  gryningen: ['luft'], travstaven: ['luft', 'rusning'],
  // gift, blixt, sköld och liv
  grodan: ['', 'gift'], spakvinnan: ['', 'gift'],
  askstav: ['', 'blixt'], tankestormen: ['', 'blixt'], runsten: ['', 'blixt'],
  glorian: ['', 'skold'], stenmuren: ['', 'skold'], murbruket: ['', 'skold'], fyrkanten: ['', 'skold'], kubtornet: ['', 'skold'],
  vampyren: ['', 'liv'], seansen: ['', 'liv'], ouroboros: ['', 'liv'], lagerelden: ['', 'liv'], gronskan: ['', 'liv'], rotknuta: ['', 'liv'], eremiten: ['', 'liv'],
  // version 5: drycker (alkemi), följeslagare och allierade (flock), blödning och närstrid
  lakebladet: ['alkemi', 'dryck', 'liv'], groddrunan: ['alkemi', 'dryck'], blandbradet: ['alkemi', 'dryck'], haxkvasten: ['alkemi', 'dryck'],
  purpurkitteln: ['alkemi', 'dryck', 'liv'], overflodet: ['', 'dryck'], blomkrukan: ['', 'dryck', 'liv'],
  vargtanden: ['flock', 'flock'], dodsrunan: ['flock', 'flock'], flockens_horn: ['flock', 'flock'], trogna_anden: ['flock', 'flock'],
  dimvasen: ['flock', 'flock'], dodsbesvarjaren: ['flock', 'flock', 'liv'], spokspegeln: ['', 'flock'], trallbojan: ['', 'flock'],
  slaktkroken: ['', 'blod'], gapet: ['', 'blod', 'narstrid'], karmosinhjartat: ['', 'blod', 'narstrid', 'liv'], jarnnaven: ['', 'narstrid'],
  stenhjartat: ['', 'narstrid'], spegelskarvan: ['', 'narstrid'],
  eldrunan: ['', 'eld'], brinnande_tornet: ['', 'eld'], frosttoppen: ['frost', 'frost'], ishavet: ['', 'frost', 'skold'],
  bodelsnalen: ['krit', 'krit'], jagarogat: ['', 'krit'], spejarkikaren: ['', 'krit'],
  ristarboden: ['', 'guld'], marknadstaltet: ['', 'guld'], gavoasken: ['', 'guld'],
};

const ALL = DEFS.map(([id, name, rarity, mods, max, text, extra]) => {
  const c = Object.assign({ id, name, rarity, text, icon: 'assets/cards/' + id + '.png', mods, max }, extra || {});
  const t = TAGS[id];
  if (t) { if (t[0]) c.set = t[0]; if (t.length > 1) c.syn = t.slice(1); }
  return c;
});
const BY_ID = Object.create(null);
for (const c of ALL) BY_ID[c.id] = c;
// byId klarar också sammansmälta kort ('<id>+'), som skapas första gången de efterfrågas.
function byId(id) {
  if (typeof id !== 'string') return null;
  const c = BY_ID[id];
  if (c) return c;
  if (isFused(id)) {
    const b = BY_ID[baseId(id)];
    if (b && fusable(b)) return (BY_ID[id] = makeFused(b));
  }
  return null;
}
const setCards = setId => ALL.filter(c => c.set === setId);

// Antal olika ägda kort per set (ett sammansmält kort räknas som sitt grundkort)
function setCounts(ownedIds) {
  const seen = new Set(), n = {};
  for (const id of ownedIds || []) {
    const c = byId(id), b = baseId(id);
    if (!c || !c.set || seen.has(b)) continue;
    seen.add(b); n[c.set] = (n[c.set] || 0) + 1;
  }
  return n;
}
// [{ id, name, have, need: 3, active, text }] för alla set, påbörjade först
function setProgress(ownedIds) {
  const n = setCounts(ownedIds);
  return Object.keys(SETS).map(id => ({ id, name: SETS[id].name, have: Math.min(n[id] || 0, SET_NEED), need: SET_NEED, active: (n[id] || 0) >= SET_NEED, text: SETS[id].text, cards: setCards(id).map(c => c.id) }))
    .sort((a, b) => (b.have > 0) - (a.have > 0) || b.have - a.have);
}
// Kort skäl (svenska) till att kortet passar med de ägda korten, eller ''.
function synergy(card, ownedIds) {
  if (!card) return '';
  const owned = new Set((ownedIds || []).map(baseId));
  const self = baseId(card.id);
  if (card.set && SETS[card.set] && !owned.has(self)) {
    const have = setCounts(ownedIds)[card.set] || 0;
    if (have > 0 && have < SET_NEED) {
      const s = SETS[card.set];
      return have + 1 >= SET_NEED ? 'FULLBORDAR ' + s.name : s.name + ' ' + (have + 1) + '/' + SET_NEED;
    }
  }
  for (const tag of card.syn || []) {
    for (const id of owned) {
      if (id === self) continue;
      const o = BY_ID[id];
      if (o && o.syn && o.syn.includes(tag)) return (SYN[tag] || tag.toUpperCase()) + ' + ' + o.name;
    }
  }
  return '';
}

// ---------- Summering ----------
function computeMods(ownedIds) {
  const m = {};
  for (const k of KEYS) m[k] = 0;
  for (const id of ownedIds || []) {
    const c = byId(id); // '<id>+' ger det sammansmälta kortets starkare mods
    if (!c) continue;
    for (const k in c.mods) if (k in m) m[k] += c.mods[k];
  }
  const n = setCounts(ownedIds);
  for (const sid in n) if (n[sid] >= SET_NEED && SETS[sid]) for (const k in SETS[sid].mods) if (k in m) m[k] += SETS[sid].mods[k];
  for (const k of KEYS) m[k] = Math.round(m[k] * 1e6) / 1e6; // slipp flyttalsbrus
  return m;
}

// ---------- Effektrader med tal ----------
// [enhet, etikett]: p = andel (0,1 -> 10 %), n = tal, f = på/av. INVERT: högre värde är sämre.
const FMT = {
  dmg: ['p', 'SKADA'], fireRate: ['p', 'ELDHASTIGHET'], reloadSpeed: ['p', 'LADDNINGSHASTIGHET'], magSize: ['p', 'MAGASIN'],
  accuracy: ['p', 'TRÄFFSÄKERHET'], moveSpeed: ['p', 'RÖRELSEHASTIGHET'], maxHp: ['n', 'MAX HP'], armorPerFloor: ['n', 'RUSTNING PER VÅNING'],
  regen: ['n', 'HP PER SEKUND'], lifesteal: ['p', 'LIVSSTÖLD'], critChance: ['p', 'KRITCHANS'], critDmg: ['p', 'KRITSKADA'],
  pierce: ['n', 'GENOMSLAG'], extraPellets: ['n', 'KULOR PER SKOTT'], explodeChance: ['p', 'EXPLOSIONSCHANS'], burnChance: ['p', 'BRANDCHANS'],
  slowChance: ['p', 'CHANS ATT SAKTA NED'], killHeal: ['n', 'HP PER DÖDAD FIENDE'], killArmor: ['n', 'RUSTNING PER DÖDAD'], goldMul: ['p', 'GULD'],
  ammoMul: ['p', 'AMMO FRÅN FÖREMÅL'], healMul: ['p', 'HELNING'], dodge: ['p', 'CHANS ATT UNDVIKA'], thorns: ['n', 'TAGGSKADA'],
  damageTaken: ['p', 'SKADA DU TAR'], projectileResist: ['p', 'SKYDD MOT ELDKLOT'], meleeResist: ['p', 'SKYDD MOT NÄRSTRID'],
  magnet: ['n', 'RUTOR RÄCKVIDD'], luck: ['p', 'LYCKA'], extraLife: ['n', 'ÅTERUPPLIVNING'], ammoSave: ['p', 'GRATIS SKOTT'],
  shield: ['n', 'SKÖLD'], light: ['p', 'LJUS'], secretSense: ['f', 'HEMLIGA VÄGGAR PÅ KARTAN'], cardChoices: ['n', 'KORTVAL'],
  shopDiscount: ['p', 'RABATT I BUTIKEN'], bossDmg: ['p', 'SKADA MOT BOSS OCH ELIT'], firstShot: ['p', 'SKADA PÅ FÖRSTA SKOTTET'],
  lowHpDmg: ['p', 'SKADA VID LÅG HP'], speedOnKill: ['n', 'S FART EFTER DÖDANDE'], execute: ['p', 'AVRÄTTNINGSGRÄNS'],
  grenades: ['n', 'MAX GRANATER'], grenadeDmg: ['p', 'GRANATSKADA'], stamina: ['p', 'UTHÅLLIGHET'], dashCd: ['p', 'SNABBARE RUSNING'],
  airDmg: ['p', 'SKADA I LUFTEN'], backstab: ['p', 'SKADA MOT OVETANDE'], comboGold: ['n', 'GULD PER KOMBOSTEG'],
  trapResist: ['p', 'SKYDD MOT FÄLLOR'], freezeChance: ['p', 'CHANS ATT FRYSA'], poisonChance: ['p', 'CHANS ATT FÖRGIFTA'],
  shockChance: ['p', 'BLIXTCHANS'], interest: ['p', 'RÄNTA PER VÅNING'], floorHeal: ['n', 'HP PER VÅNING'],
  killExplode: ['p', 'CHANS ATT DÖDADE EXPLODERAR'], reloadNova: ['n', 'SKADA I OMLADDNINGSSTÖT'], eliteGold: ['p', 'GULD FRÅN ELIT'],
  trapSense: ['f', 'FÄLLOR PÅ KARTAN'], enemySense: ['f', 'FIENDER PÅ KARTAN'], critHeal: ['n', 'HP PER KRIT'], dashDmg: ['n', 'RUSNINGSSKADA'],
  shieldOnKill: ['n', 'SKÖLD PER DÖDAD'], ammoRegen: ['p', 'MAGASIN PER S I RESERVEN'], knockback: ['p', 'KNUFF'],
  chestChoice: ['n', 'VAL I KISTOR'], freeReroll: ['n', 'GRATIS NYA KORT PER VÅNING'], hazardImmune: ['f', 'IMMUN MOT LAVA, VATTEN, IS OCH NÄT'],
  doubleJump: ['f', 'DUBBELHOPP'],
  potionPower: ['p', 'STARKARE DRYCKER'], potionChance: ['p', 'FLER DRYCKER'], petPower: ['p', 'STARKARE FÖLJESLAGARE'],
  meleeDmg: ['p', 'NÄRSTRIDSSKADA'], fireDmg: ['p', 'BRANDSKADA'], coldResist: ['p', 'SKYDD MOT KÖLD OCH FROST'],
  headshot: ['p', 'SKADA VID HUVUDTRÄFF'], bleedChance: ['p', 'CHANS TILL BLÖDNING'], allyChance: ['p', 'CHANS TILL ALLIERADE'],
  lightRadius: ['n', 'LJUSRADIE'], weaponDrop: ['p', 'CHANS ATT ELIT TAPPAR VAPEN'], npcDiscount: ['p', 'RABATT HOS ALKEMIST OCH PRÄST'],
};
const INVERT = { damageTaken: true };
const num = v => String(Math.round(v * 100) / 100).replace('.', ',');
// En rad per mod: { key, value, text: '+10 % SKADA', good }. Positivt = bra utom för INVERT-nycklar.
function modLines(cardOrMods) {
  const mods = cardOrMods && cardOrMods.mods ? cardOrMods.mods : (cardOrMods || {});
  const out = [];
  for (const key in mods) {
    const v = mods[key];
    if (!v || !FMT[key]) continue;
    const [u, label] = FMT[key];
    const sign = v > 0 ? '+' : '-';
    const text = u === 'f' ? label : u === 'p' ? sign + num(Math.abs(v) * 100) + ' % ' + label : sign + num(Math.abs(v)) + ' ' + label;
    out.push({ key, value: v, text, good: INVERT[key] ? v < 0 : v > 0 });
  }
  return out;
}

// ---------- Sammansmältning ----------
// Två exemplar av samma kort kan smältas ihop till '<id>+': samma kort med namn + '+', mods ×1,6
// (avrundat: andelar till hela procent, platta tal till heltal eller tiondelar, på/av oförändrat),
// ett steg sällsyntare (högst legendarisk) och samma bild. Pakter, vapenuppgraderingar och kort
// som bara kan tas en gång kan inte smältas.
const FUSE_MUL = 1.6;
const PLURAL = { KULA: 'KULOR', RUTA: 'RUTOR', GRANAT: 'GRANATER' }; // '+1 KULA' blir '+2 KULOR'
function isFused(id) { return typeof id === 'string' && id.length > 1 && id.charAt(id.length - 1) === '+'; }
function baseId(id) { return isFused(id) ? id.slice(0, -1) : id; }
function fusable(card) { return !!card && !card.fused && !card.pact && !card.weapon && card.max >= 2; }
function fuseVal(key, v) {
  const u = FMT[key] ? FMT[key][0] : 'p';
  if (u === 'f' || !v) return v;
  const step = u === 'p' ? 0.01 : Number.isInteger(v) ? 1 : 0.1;
  let r = Math.round(v * FUSE_MUL / step) * step;
  if (Math.abs(r) <= Math.abs(v)) r = v + Math.sign(v) * step; // alltid märkbart starkare
  return Math.round(r * 1e6) / 1e6;
}
// Byter talen i kortets text mot de nya, i modsens ordning. Går det inte: rader ur modLines.
function fuseText(card, mods) {
  let text = card.text, pos = 0;
  for (const k in card.mods) {
    const f = FMT[k];
    if (!f || f[0] === 'f' || !card.mods[k]) continue;
    const show = v => num(Math.abs(v) * (f[0] === 'p' ? 100 : 1));
    const a = show(card.mods[k]), b = show(mods[k]);
    const re = new RegExp('(^|[^\\d,])' + a + '(?![\\d,])', 'g');
    re.lastIndex = pos;
    const m = re.exec(text);
    if (!m) { text = null; break; }
    const at = m.index + m[1].length;
    text = text.slice(0, at) + b + text.slice(at + a.length);
    pos = at + b.length;
  }
  if (text != null) return { text: text.replace(/\b(\d+) (MAX )?(KULA|RUTA|GRANAT)\b/g, (m, n, mx, w) => (n === '1' ? m : n + ' ' + (mx || '') + PLURAL[w])), bad: card.bad || 0 };
  const lines = modLines(mods), good = lines.filter(l => l.good), bad = lines.filter(l => !l.good);
  return { text: good.concat(bad).map(l => l.text).join('\n'), bad: bad.length };
}
function makeFused(base) {
  const mods = {};
  for (const k in base.mods) mods[k] = fuseVal(k, base.mods[k]);
  const ri = Math.min(RARITY_ORDER.length - 1, RARITY_ORDER.indexOf(base.rarity) + 1);
  const t = fuseText(base, mods);
  const c = Object.assign({}, base, {
    id: base.id + '+', name: base.name + '+', rarity: RARITY_ORDER[ri], mods, text: t.text,
    max: Math.max(1, Math.floor(base.max / 2)), fused: true, base: base.id,
  });
  if (base.syn) c.syn = base.syn.slice();
  delete c.unlock;
  if (t.bad) c.bad = t.bad; else delete c.bad;
  return c;
}
// fuse(id): id för det sammansmälta kortet ('<id>+'), eller null om kortet inte kan smältas.
function fuse(id) {
  const c = BY_ID[id];
  return fusable(c) ? byId(id + '+').id : null;
}
// canFuse(ägda id): id (i ordning) som finns i minst två exemplar och kan smältas.
function canFuse(ownedIds) {
  const n = new Map();
  for (const id of ownedIds || []) n.set(id, (n.get(id) || 0) + 1);
  const out = [];
  for (const [id, k] of n) if (k >= 2 && fusable(BY_ID[id])) out.push(id);
  return out;
}

// ---------- Dragning ----------
// Vikten skiftar mot sällsyntare med djup (våning, 0..) och luck (summan av luck-modden, 0.1 per kort).
const CURSE_WEIGHT = 0.8; // förbannade kort dyker upp ibland
const PACT_WEIGHT = 1.3, UPGRADE_WEIGHT = 6; // elva pakter: en pakt syns i ungefär var fjärde dragning; efter pakten kommer uppgraderingarna tätt
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
  for (const id of opts.owned || []) { const b = baseId(id); owned[b] = (owned[b] || 0) + (isFused(id) ? 2 : 1); } // '<id>+' är två exemplar
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

const WEAPON_NAME = { pistol: 'PISTOL', shotgun: 'HAGELGEVÄR', rifle: 'GEVÄR', smg: 'KPIST', dbshotgun: 'DUBBELBÖSSA', crossbow: 'ARMBORST', flaregun: 'SIGNALPISTOL', sniper: 'PRICKSKYTTE',
  axe: 'YXA', flamer: 'ELDKASTARE', launcher: 'GRANATKASTARE' };
// etikett ovanför kortets namn: förbannelse, pakt, vilket vapen uppgraderingen hör till eller sammansmält
function tag(card) {
  return card.curse ? 'FÖRBANNAD' : card.pact ? 'PAKT' : card.weapon ? WEAPON_NAME[card.weapon] : card.fused ? 'SAMMANSMÄLT' : '';
}
function describe(card) {
  const r = RARITY[card.rarity];
  const head = card.name + ' (' + (tag(card) ? tag(card) + ' ' : '') + r.label + ')';
  return head + '\n' + card.text + (card.max > 1 ? '\nKAN TAS ' + card.max + ' GÅNGER' : '')
    + (card.set && SETS[card.set] ? '\nSET: ' + SETS[card.set].name : '');
}

window.Cards = { ALL, byId, RARITY, RARITY_ORDER, MOD_KEYS, WEAPON_NAME, SETS, SYN, draw, computeMods, price, describe, tag, setProgress, synergy, modLines,
  fuse, canFuse, fusable, isFused, baseId, FUSE_MUL };
})();
