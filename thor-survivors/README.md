# Thor Survivors

En Vampire Survivors-liknande auto-shooter för AYN Thor, en handhållen Android-spelare med två skärmar. Ren Java med Canvas/SurfaceView, inga beroenden.

- Spelet heter **ASHFALL: Lumen Tide** i menyn (mörk industriell sci-fi, formgivning i `docs/ASHFALL_DESIGN.md`). Paketet och mappen heter fortfarande Thor Survivors. Namn och utseende kom i design fas 1, 2 och 8; reglerna har sedan ändrats av fas 3 till 7 (hjältar och huvudvapen, grenar, statuseffekter, fiendearketyper, nya banor, se avsnitten nedan).
- Paket: `se.felixarvid.thorsurvivors`
- minSdk 29, targetSdk 35

## Installation

Kopiera `dist/thor-survivors.apk` till enheten och installera den (tillåt installation från okända källor). APK:n är signerad med projektets `debug.keystore`, så nya byggen installeras över de gamla.

## Skärmar

- **Övre skärmen:** spelvärlden.
- **Nedre skärmen:** HUD med HP, XP, timer, antal dödade, guld, 6 vapen- och 6 passiv-platser samt minikarta. Här visas även level-up-kort och menyer: stageval, startvapen, PowerUp-butiken och resultat.

Den nedre panelen använder `android.app.Presentation`. Om det inte fungerar startas en andra Activity på den skärmen. På enheter med bara en skärm används i stället ett överlägg med en touch-joystick.

## Kontroller

- Vänster spak eller d-pad: rörelse
- Höger spak (AXIS_Z/AXIS_RZ, annars RX/RY): sikta huvudvapnet. Utan spakutslag siktar det dit hjälten tittar (rörelseriktningen).
- A: undvik (dodge) under spel, bekräfta i menyer. B: tillbaka. Start: paus
- Touch på nedre skärmen: vänster yta rör, höger yta siktar (visas bara utan handkontroll), knappen DODGE undviker. I överlägget på en skärm är hela skärmen rörelsespak (den sätter bara riktningen) och DODGE ligger nere till höger.

I emulatorn: WASD rör, piltangenterna siktar, mellanslag undviker.

## Hjältar, huvudvapen och grenar (design fas 3 och 4)

- **Hjältar** (`heroes` i `ashfall_data.json`, väljs på raden HERO i huvudmenyn, sparas i `MetaProgress` som `hero`; gamla sparfiler har ingen nyckel och får Bastion): Bastion (130 HP, rustning 1, regen 0,4, fart 0,92, +1 % might och +1 % max HP per nivå), Spectre (80 HP, fart 1,10, krit 15 %, +1 % krit och +0,5 % fart per nivå) och Xenomant (95 HP, regen 0,2, +1 % area och +1 % plockavstånd per nivå). `PlayerStats.compute(..., hero, level)` lägger hjältens värden över VS-grunden. Utan hjälte (`Sim` utan hjältnyckel, som de gamla testerna) gäller de gamla reglerna.
- **Huvudvapen** (`mainWeapons`, `game/MainWeapon.java`): alltid ägda, utanför de 6 vapenplatserna, avfyras automatiskt mot sikteriktningen och använder VS-pipelinen (might, area, cooldown, amount, projektilfart, krit). Bastion Hydraulic Hammer: kägelsvep (100 grader, radie 80), var 3:e svep en Slam (cirkel radie 90, 0,4 s stun). Spectre Twin Pistols: 3 kulor med 8 graders spridning. Xenomant Lumen Caster: piercande bolt (träffar 1 + pierce 2 fiender, Decay), var 4:e kast en Spore Burst med 6 bolts.
- **Grenar:** 4 grenar x 3 nivåer per hjälte. Ett grenkort ersätter de sista korten vid hjältenivå 5, 10, 15, ... (`OfferGenerator.branchOffers`): nivå I från nivå 5, II från 15, III från 25, alltid i ordning. Kan någon påbörjad gren ta nästa nivå erbjuds de (högst 2 kort), annars nivå I av högst 2 grenar som inte är påbörjade. Nivåernas effekter står som `mods` i datan (en vanlig nyckel ersätter parametern, en nyckel som slutar på `Add` adderas); `MainWeaponTest.everyTierModIsAKnownParameter` fångar felstavningar.
- **Approximationer:** Burn, Decay och Stun går nu genom statussystemet (se nästa avsnitt) och Riot Guard II reflekterar fiendens skott i svepet (`EnemyAi.reflectCone`, nivå II ger bara reflektionen, de 15 % från nivå I gäller kvar). Parasite Link skadar båda ändarna (0,5P/s) i stället för att dela skadan. Furnace Cleave III är en 60 enheters eldvåg (projektil). Piston Jab och Slam kan ske på samma svep.
- **Undvik (dodge):** A-knappen (gamepad, mellanslag på tangentbord) eller knappen DODGE på nedre skärmen: 0,25 s osårbarhet och ett språng på 90 enheter i rörelseriktningen (annars blickriktningen), 4 s återhämtning skalad med Cooldown-värdet, en laddning. Återhämtningen visas på knappen.
- **Siktindikator:** en liten pil vid spelarens fötter (ljusare när spaken används).
- **Bakade hjältemodeller:** `tools/bake/overrides.json` samplar korta fönster ur de långa klippen (Spectres shoot/throw, alla hjältars dodge, Bastions attack/slam, Xenomants cast/cast2/slam); bygg om med `cd tools/bake && node bake.mjs --only bastion,spectre,xenomant` och sedan `python3 tools/build_ashfall_assets.py`. Modellarken tar nu cirka 68 MB bitmappsminne.
- **Acceptans (headless, `HeroAcceptanceTest`):** en bot som siktar på närmaste fiende och går i cirklar (odödlig, 5 min, 3 frön) dödar i snitt cirka 150 % av Whip-basen med bara huvudvapnet och cirka 150 till 190 % med Whip; en hjälte som står still dör före minut 3.

## Statuseffekter, nya fiender, banor och förstörbara (design fas 5 till 7)

- **Statuseffekter** (`game/Status.java` har siffror och formler, `Sim.applyStatus` och `Sim.statusPass` tickar dem): en byte stackar och en flyttalstimer per status och fiende, en enda pass 10 gånger i sekunden (ingen allokering). Skadan är en andel av träffen som la på statusen (den starkaste träffen räknas). **Burn**: 0,08 x träffen per stack var 0,33 s i 2,5 s (förnyas), högst 8 stackar. **Frost**: -6 % fart per stack (högst -48 %) i 4 s, åttonde stacken fryser 1,0 s och stackarna börjar om; cyan färgton. **Electrify**: 0,5 x träffen x stackar per tick, intervall 2,0 s x 0,854^(n-1) (2,0 / 1,708 / 1,459 s vid 1 / 2 / 3 stackar), varje tick tar bort en stack, högst 6; ljusbåge som flimrar. **Decay**: 0,06 x träffen per sekund och stack, -4 % skada som fienden gör per stack, 8 s utan förnyelse av ticken, högst 10; grön droppe och grönt tal. **Stun**: kan varken röra sig eller attackera; bossar får 25 % av tiden, elit (`Enemy.elite`, kommer med elitfasen) 50 %; stjärnor över huvudet. Skadetalen är små och färgade (orange, cyan, gul, grön) och slås ihop per fiende; högst 10 nya statustal per pass så att 300 brinnande fiender inte fyller textringen. Brinnande fiender sprider glöd (`particles`), några få ljud per sekund (`burn_tick`, `frost_hit`, `electrify_zap`, `decay_hiss`, `stun_hit`).
- **Vem lägger på vad:** Slag Cannon och Furnace Burst Burn (1 stack, 2 för evolutionen), Toxic Vent Decay (1, 2), Corrosive Flask Decay och en stack Frost (bara en sänkning), Arc Coil Electrify (1, 2), Furnace Cleave och granaten Burn, Lumen Caster Decay, hammarens Slam Stun. De nya vapnen (Chain Arc, Kugelblitz, Orbital Strike, Coolant Flush) finns inte ännu: de anropar bara `applyStatus`.
- **Hjältens statusar** (från fiendens farozoner, fasta värden, ingen stackning, skadan går förbi rustning): Burn 2 skada/s i 3 s, Slow -25 % i 2 s, Decay 3 skada/s i 2 s (`Sim.heroBurnT/heroSlowT/heroDecayT`).
- **Nya fiender** (`ashfall_data.json` `enemies`, genereras av `tools/build_ashfall_stages.py`; HP i Z, alltså ZOMBIE = 1): Infected Colonist (`COLONIST`, jagare), Spore Hound (`SPORE_HOUND`, flock om 4, snabb med sidovandring: fas 1-2 medurs, 3-5 moturs, faktor 0,8), Sergeant (`SERGEANT`, avstånd: stannar på 132, backar under 100 med 0,7 x fart, tre skott var 3,5 s, 0,5 s paus efter salvan), Security Drone (`SECURITY_DRONE`, svävare: 150 / 120, ett skott var 2,4 s), Welder (`WELDER`, 0,6 s varningslinje, rusning 0,6 s med fart 300, 1,0 s återhämtning; kör den in i en tunna eller kista går den sönder och svetsaren förlorar 1 s), Spore Carrier (`SPORE_CARRIER`, 0 kontaktskada, 0,35 s stubin inom 40 enheter eller vid död, moln radie 90 i 3 s: hjälten tar 4 skada/s och Decay, andra fiender tar också skada), Smelter (`SMELTER`, tank, knockback-immun, slaggpöl radie 60 vid hjältens plats var 8:e s med 0,6 s varning, 8 skada/s och Burn) och Vire (`VIRE`, teleporterar till 125-200 från hjälten på 0,2 s, väntar 0,75 s, reser 3 kolonister, nästa gång en ring om 8 skott, 2,5-4 s paus). Beteendet är en int-switch i `game/EnemyAi.update` (`EnemyDef.ARCH_*`), tillståndet ligger på `Enemy` (`ai`, `aiT`, `actT`, `tele`, `clip`). Högst 24 avståndsfiender lever på en gång (resten föds som kolonister) och vågorna går aldrig över 300 fiender.
- **Bossar** (via `bosses[]` i vågraden, beteende från arketypen tills bossmönstren kommer): `CARGO_LOADER` (laddare, 400 Z, rusning med 1,0 s varning), `SLAGBORN` (tank, 700 Z, slaggspår var 45 enhet, 3 slaggbomber, rasar vid 50 % HP), `VIRE_AWAKENED` (600 Z, 6 kolonister och en ring om 12), `SMELTER_FOREMAN` (smelter x 1,8, 500 Z, 5 pölar i rad mot hjälten) och `THE_FIRST` (2500 Z, ring om 12 och kolonister, ingen blink). Bossens HP är slutvärdet ur datan men växer från 20 % vid 0:00 till 100 % vid minut 20 (`hpRamp`, The First 29), annars vore Cargo Loader på minut 5 omöjlig för en nivå 10-byggnad. Modellerna: se tabellen under Innehåll och `sprite` i datan.
- **Fiendens skott och farozoner:** `Sim.eprojs` (högst 40 skott, röd-orange kärna med svart kant, helt ljusa över mörkret) och `Sim.hazards` (högst 32 markzoner: slagg, spormoln, frostfläck). Skott och zoner som inte får plats hoppas över, de skriver aldrig utanför poolen. Skottet träffar hjälten en gång (0,25 s osårbarhet efteråt, inte under dodge), tas Orologion fryser skotten i luften. Varningar (rusningslinjen, stubinringen, poolens ring) ritas fullt ljusa med svart kant.
- **Animationsklipp:** `Enemy.clip` begär skott (attack2), kast (cast, cast2) eller rusning (run). Bygget (`tools/build_ashfall_assets.py`) tar nu med sergeantens `attack2`, svetsarens `run`, smelterns `cast`, vires `cast` och `cast2` och spore carrierns `cast`; modeller utan klipp får en pulserande och skakande gångbild. Modellarken tar cirka 68 MB bitmappsminne.
- **Banorna** (`ashfall_data.json` `stages`, nycklarna `FLATS` och `MINES`; stagevalet visar bara dem): Cinder Flats (30 rader, `mods` från Mad Forest: fart 1,1, guld och XP 1) och Deep Mines (22 rader, `mods` från Library med fiendens HP x 1,25 och fart x 1,05, horisontella spawn). Raderna är tabellerna i design 9.3 (Mines: de listade minuterna, resten ärver föregående rad). Skattekistorna är VS:s tabeller för bossminuterna (5, 10, 15, 20, 25, 29). `FOREST` och `LIBRARY` (Vampire Survivors) laddas fortfarande så att äldre tester och balansmätningar fungerar, men finns inte i menyn: `Engine.selectStage(nyckel)` är avlusningskroken (testerna går via den). `WorldGen.of` mappar `FLATS` och `FOREST` till askslätten, `MINES` och `LIBRARY` till gruvan.
- **Askstormar** (Cinder Flats, 12:00 och 22:00, 20 s, 1,5 s in- och uttoning): spelarens ljusradie -40 %, fiendens spawn +20 % (kortare intervall), fallande aska (40 flingor, över 150 streck i stormen), brun dimma och en banderoll "ASH STORM". `Sim.stormLevel()`, `lightRadiusMul()`.
- **Förstörbara** (en per cirka 500 x 500 enheter, aldrig nära start): **explosive_barrel** (bryts av vapen eller av en rusande svetsare, exploderar med radie 80: 50 skada (5P) på fiender och 15 på hjälten om den är inom räckhåll och inte osårbar; tunnor i närheten brister också, så en klunga kedjar; 40 % av tunnorna har 1 till 2 grannar på 36-66 enheters avstånd), **supply_chest** (guld, 60 %, eller fem ädelstenar, aldrig utrustning) och i Deep Mines **stim_pylon** (en per cirka 2000 x 2000 enheter, ger 30 % HP när den förstörs, 60 s återhämtning). I de gamla banorna finns de gamla brasorna och kandelabrarna kvar.
- **Ljud:** 13 id flyttades från `pending` till `sfx` i `manifest.json` och från `SFX_PENDING` till `SFX` i `tools/import_audio.py` (`burn_tick`, `frost_hit`, `electrify_zap`, `decay_hiss`, `stun_hit`, `barrel_explode`, `crate_break`, `pylon_use`, `drone_shot`, `sergeant_burst`, `welder_charge`, `carrier_burst`, `vire_blink`), med gränser per 100 ms i `SoundEvents`. `tentacle_emerge` väntar kvar i `pending` tills tentaklarna finns.
- **Avvikelser från designen (alla att trimma i balansfasen):** sergeantens skott är 8 skada var 3,5 s (design 12 och 3,0 s), dronens 6 var 2,4 s (design 8 och 2,2 s) och Cargo Loaders kontaktskada 26 (design 30), annars dog en mid-bot redan på minut 3 till 5; hjältens sprängskada är 15 i stället för 5P; moln och pölar skadar hjälten direkt (4 respektive 8 per sekund) och lägger dessutom på hjältens Decay eller Burn; bossens HP växer med tiden (`hpRamp`, ej i designen); Mines `mods` är Librarys fart 1,25 x 1,05 och HP x 1,25; skotten siktar på hjältens läge utan förutsägelse; sergeantens skott spelar det bakade klippet attack2 (ett närstridsslag, inget eget skjutklipp finns); en fryst fiende tonas cyan i stället för att få ljusskuggningen; The First och Vire Awakened saknar riktiga bossfaser och Mines saknar tentakelfaran (nästa fas); stormen höjer bara spawnintervallet, inte `minimum`.
- **Acceptans (headless):** formeltesterna (`StatusTest`: Electrify 2,0 / 1,708 / 1,459 s, tak, 10 Hz-passet allokerar inget), arketyptesterna (`ArchetypeTest`: avståndsfienden håller 100-132, laddaren varnar 0,6 s, spore carrier skadar bara genom molnet, skottpoolen svämmar aldrig över med 24 avståndsfiender), banorna och tunnorna (`AshfallStageTest`: båda banorna laddas, aldrig över 300 fiender, tunnorna kedjar) och en 30 minuters headless-soak per bana (`StageSoak`, se `thor-survivors-soak`): inga NaN, inga pooler som svämmar över. En Bastion som tar vapen och grenar (mid-bot som viker undan för skott, rusningslinjer och pölar) överlever 30:00 i 4 av 6 körningar på Cinder Flats och 3 av 6 på Deep Mines; en bot som inte tar några kort dör i alla 24 körningar (130 till 450 s). Spectre med samma bot dör efter 3 till 5 minuter (80 HP).

## Innehåll

- **Stages:** Cinder Flats (nyckel `FLATS`, vågor och fiender enligt avsnittet ovan) och Deep Mines (nyckel `MINES`). De gamla nycklarna `FOREST` och `LIBRARY` (Vampire Survivors-vågorna) finns kvar i datan men inte i menyn. Banan är oändlig och bestäms av `game/WorldGen.java` (ren funktion av rutan, så den ser likadan ut varje gång). Cinder Flats är en askslätt: skrotgårdar med lastlådor, barrikader, bränsletankar, slagg- och spillrestenar, lysande lumentillväxter i klungor (de lyser grönt), nödljusstolpar, kraschade landare och flyktkapslar, och en skorsten långt bort. Deep Mines har långa väggrader (väggsegment, catwalks, rörklungor, slaggstenar) över och under ett fritt mittstråk, med luckor, bråte mellan raderna och nödljus längs stråket. Golvet är dekaler (olja, blod, sot, spillror, galler, ben, mossa, kristaller, varningsränder) utspridda per ruta. Inget krockar och startplatsen är alltid fri.
- **Förstörbara:** sprängtunnor, förrådskistor och (Deep Mines) stimpyloner, se avsnittet ovan. I de gamla banorna (FOREST, LIBRARY) är det fortfarande brasor och kandelabrar som ger oftast guld, ibland kyckling och sällan Vacuum, Orologion, Rosary eller Clover.
- **Vapen:** 10 vapen med evolutioner (Ashfall-namn och beskrivningar kommer från `ashfall_data.json`, id:n och balans är de gamla):
  - Vibro Lash (Whip) → Leech Scythe
  - Spore Dart (Magic Wand) → Lumen Volley
  - Scalpel Throw (Knife) → Scalpel Storm
  - Cluster Grenade (Axe) → Shrapnel Spiral
  - Ricochet Drone (Cross) → Strike Wing
  - Ward Drones (King Bible) → Sentinel Ring
  - Slag Cannon (Fire Wand) → Furnace Burst
  - Toxic Vent (Garlic) → Lumen Devourer
  - Corrosive Flask (Santa Water) → Corrosive Wake
  - Arc Coil (Lightning Ring) → Tesla Loop
- **Passiver:** 13 (Servo Amplifier, Plate Weave, Bio-Gel Pack, Medi-Foam, Overclock Chip, Wide-Beam Lens, Rail Accelerator, Stabilizer Coil, Multiplexer, Mag Boots, Gravity Collar, Lumen Charm, Neural Tap; Salvage License, Spore Taint och Defibrillator i butiken).
- **Fiender:** 55 typer, inklusive bossar: de 8 Ashfall-fienderna och 5 bossarna (avsnittet ovan, modellen står som `sprite` i datan) och de 42 Vampire Survivors-typerna för FOREST och LIBRARY, som ritas med de bakade Ashfall-modellerna enligt tabellen (mappningen står i `game/EnemyType.java`):

  | Nyckel i datan | Ashfall-modell |
  |---|---|
  | ZOMBIE, MUD, MUDMAN* | infected_colonist |
  | BAT*, XLBAT | spore_hound (ingen rigg: guppar och kläms ihop) |
  | SKELETON, SKULL*, DULL* | sergeant |
  | GHOST, ECTO* | security_drone (ingen rigg: svävar) |
  | WEREWOLF | welder |
  | MUMMY, XLMUMMY | smelter |
  | FLOWER, XLFLOWER | lumen_tentacle (ingen rigg: svajar) |
  | MEDUSA*, WITCH*, COUNT*, DEATH | vire |
  | MANTIS, XLMANTIS, BUER | spore_carrier |
  | bossar (flaggan boss) med XL i nyckeln, utom BOSS_XLMEDUSA | slagborn (ingen rigg) |
  | BOSS_XLMEDUSA, BOSS_XLDEATH | the_first (ingen rigg, ritas i 0,8 x) |
  | övriga bossar | cargo_loader (ingen rigg) |

  Spelaren är den valda hjälten (bastion, spectre eller xenomant: idle, run, huvudvapnets klipp, dodge, hit, death).
- **Kistor:** följer stagens skattetabell (`treasure` i `game_data.json`, raden för aktuell eller senaste minut som har en). Antal föremål: 5 med `chances[0]` procent, annars 3 med `chances[1]` procent, annars 1 (en kista är aldrig tom, så `chances[2]` styr inget). Platserna fylls i ordningen `prizeTypes`: EVOLUTION utvecklar ett färdigt vapen (annars som EXISTING_ANY), EXISTING_ANY höjer ett slumpat vapen eller en passiv som inte är på max, EXISTING_WEAPON samma men bara vapen, okända typer räknas som EXISTING_ANY. Går inget att höja ges bara guld. `level` och `fixedPrizes` i datan används inte.
- **Greed:** gäller även enstaka mynt; bråkdelen av guldet sparas (`Sim.goldFrac`), så 10 mynt med Greed 1,2 ger 12 guld.
- **Böcker och pölar:** varje bok (King Bible, Unholy Vespers) och varje Santa Water-pöl träffar på egen hand med sin egen `hitBoxDelay` per fiende (`Enemy.tryTick`), så fler böcker (Amount) ger mer skada.
- **Vågor:** varje `frequency` ms kommer en fiende av varje typ i minutens `enemies` (högst 300 på banan, en flock hundar räknas som 4), och fältet fylls dessutom upp till `minimum` (`game/WaveDirector`). Dödzonen i XP runt minut 5 till 10 i Mad Forest är i huvudsak datan (en fiendetyp och `minimum` 10 till 30).
- **PowerUp-butik:** köp med guld som sparas mellan körningar.

Evolution: vapnet måste vara på maxnivå tillsammans med sin passiv. Öppna sedan en boss-kista. En körning vinns när timern når 30:00.

## Data

Balansvärdena (vapnens nivårader, fiendestatistik och vågor minut för minut) kommer från [felixarvid2/REA](https://github.com/felixarvid2/REA), som innehåller data extraherad från Vampire Survivors. Generera om med:

```
python3 tools/build_data.py /path/to/REA/data
```

Datan kommer från ett kommersiellt spel. Appen är endast för personligt bruk och ska inte publiceras.

## Grafik

All grafik är ägarens egna Ashfall-tillgångar (Meshy-modeller och FLUX-bilder, ingen tredjepartslicens): `art-src/ashfall-baked/` (3D-modeller bakade till 8-riktningssprites av `tools/bake/`), `../assets/ashfall-ai/flux/` (effekter, dekaler, golvtextur, statikoner) och `../assets/ashfall-ai/meshy/icons/`. Kenney- och Tiny Creatures-paketen ligger kvar i `art-src/` men används inte längre.

- **Pipeline:** `python3 tools/build_ashfall_assets.py` (Pillow, numpy) skapar allt spelet läser i `app/src/main/assets/ashfall/`: ett ark per animerad modell (`m_<modell>.webp`, ramarna skalade 0,78 så att en människa blir cirka 75 px hög på 1080p, och omförpackade), `world.webp` (rekvisita, miljö, dekaler), `vfx.webp` (effekter, svart bakgrund omräknad till alfa), `icons.webp` (panelikoner och kristaller), `ground/mine_rock.webp`, `manifest.json` och `CREDITS.txt`. Allt är WebP utan förlust utom golvtexturen. Cirka 12 MB filer; modellarken tar cirka 68 MB bitmappsminne (plus cirka 16 MB för världs-, effekt- och ikonarken och upp till 39 MB för marken) när de avkodas (inga hit-klipp eller idle för fiender, de går alltid). `tools/build_atlas.py` är det gamla Kenney-bygget och används inte längre.
- **Ritning** (`render/WorldRenderer`, `render/SpriteAtlas`): animerade 8-riktningssprites. Riktningen kommer från rörelsen (spelaren från `faceX/faceY`, fiender mot spelaren med hysteres), klippet från tillståndet (walk, attack när de rör spelaren, death), klocka per entitet (`Enemy.anim`), och gång-fps skalas med rörelsehastigheten. Döden spelas upp färdigt (`Sim.corpses`, en ring om 96) innan liket tonas ut efter cirka 2 s. Ramar ritas 1:1 med `Rect src/dst` på hela pixlar. Träffblixten är ett vitt färgfilter på samma ram (ingen extra bitmapp). Y-sortering och mjuk skugga är kvar. Omodellerade (origga) modeller får procedurell rörelse: guppa, klämma, svaja.
- **Marken** (`render/GroundCache`): bergstexturen läggs i världspixlar (sömlös mellan bitar), tonas per stage (askgrå respektive mörkare och kallare), en vänd kopia läggs ovanpå för att dölja upprepningen, och dekalerna bakas in i samma 8 x 8-rutors bitar. Rekvisitan listas av `WorldGen.props` varje bildruta och sorteras med figurerna.
- **Mörker och ljus** (`render/Lighting`, design avsnitt 10): en lågupplöst (1/6) ALPHA_8-ljuskarta fylls med omgivande mörker (0,65 Cinder Flats, 0,78 Deep Mines, `ashfall_data.json`) och ljus stansas in med mjuka cirklar (spelaren r 240 u, 200 i gruvan; nödljus r 130 flimrande varmt; lumentillväxt r 90 grönt pulserande; eld och explosioner). Kartan ritas en gång över marken med filtrering. Spritar får samma ljus analytiskt som ett färgfilter, så fiender aldrig går under 64 % ljusstyrka (och ritas ljusare än modellens bake), skott och effekter ritas additivt ovanför mörkret, ädelstenar lyser. Inställningen LIGHTING i huvudmenyn (FULL, LOW, OFF, sparas som volymraderna) väljer dynamisk karta, en statisk vinjett med bara spelarens ljus, eller inget.
- **Effekter:** Vibro Lash = slash, Spore Dart = plasmablixt, Scalpel Throw = skalpell med ljusstreck, Cluster Grenade = granat med explosion, Ricochet Drone = drönarmodellen, Ward Drones = hex-sköld, Slag Cannon = eldklot med lågsvans, Toxic Vent = spormoln, Corrosive Flask = giftpöl, Arc Coil = blixtsprite. Träffar ger gnistor, dödsfall blod, ichor eller gnistor efter modell. Ädelstenar är lumenkristaller (grön, lila, röd för den sammanslagna).
- **Ikoner:** panelens vapen- och passivikoner är Ashfalls färdighets-, stat- och kristallikoner (`ICONS` i bygget). Hela panelskinnet kommer i en senare fas.
- **Röd ädelsten:** ädelstenar längre bort än `Sim.RECYCLE_DIST` slås ihop till en enda röd, större gem som flyttas till 250 till 350 enheter från spelaren och ger hela värdet när den tas (`Sim.condenseFar`, var 0,5 s). Är poolen full slås nya gems ihop med en nära (80 enheter) eller trycks in i den röda; kistor, mynt, mat och power-ups får alltid plats. Testas i `PickupPoolSaturationTest`.

## Ljud

- **Händelser:** `game/SoundEvents` är en ringbuffert av heltal utan android.* och utan allokering. `Sim` och `Engine` skickar 45 händelser (whip, magic_missile, knife, axe, cross, bible, fireball, garlic, holy_water, lightning, enemy_hit, enemy_death, player_hurt, gem, coin, level_up, chest_open, evolution, brazier_break, food_heal, boss_spawn, game_over, victory, ui_move, ui_confirm, ui_back, hammer_swing, hammer_slam, pistol_shot, caster_bolt, spore_burst, dodge, burn_tick, frost_hit, electrify_zap, decay_hiss, stun_hit, barrel_explode, crate_break, pylon_use, drone_shot, sergeant_burst, welder_charge, carrier_burst, vire_blink). Varje id har en gräns (högst N per 100 ms, ibland ett minsta avstånd), så 50 träffar i en bildruta blir några få ljud. Gem-ljudet höjs en skalsteg per gem som tas inom 0,4 s.
- **Spelaren:** `audio/AudioEngine` tömmer kön på speltråden varje bildruta. Effekter går via `SoundPool` (USAGE_GAME, 16 strömmar, slumpad tonhöjd och volym per ljud, äldsta rösten av samma ljud klipps). Musik går via `MediaPlayer` på en egen tråd med in- och uttoning: `menu`, `forest` (Cinder Flats), `library` (Deep Mines), `boss` (valfri, annars stagets spår), `final` (The First, tyst tills koden spelar det) och stingers `gameover`/`victory`. Musiken pausas i `onPause` och släpps i `onDestroy`. Ljudet följer systemets valda utgång, inget särskilt för tvåskärmsläget.
- **Inställningar:** raderna MUSIC och SOUND EFFECTS i huvudmenyn (OFF, LOW, MEDIUM, HIGH; sparas i `PrefsStore`).
- **Filer:** `app/src/main/assets/audio/sfx/<id>.ogg`, `audio/music/<spår>.ogg` och `audio/manifest.json` (id till fil, basvolym). En fil som saknas är bara tyst. Manifestet har tre delar: `sfx` (de 45 inkopplade id:na), `pending` (14 id:n ur designen, avsnitt 12, färdiga men ännu inte inkopplade: elit, utrustning, de nya vapnen, bossmönster och tentakler; flytta posten till `sfx` när `SoundEvents` får id:t) och `music`. Exakta id:n, längd, stil och nivåer (cirka -16 LUFS musik, peak -1 dBFS effekter, mono 44,1 kHz för effekter, stereo för musik, sömlösa loopar) står i `tools/AUDIO_SPEC.md`.
- **Ljudbild (CC0):** mörk industriell sci-fi-skräck: låga drönare, metallslag, ånga, gnistor, våta sporljud och förvrängda basslag. Alla effekter och spår är riktiga CC0-inspelningar som bearbetats (tonhöjden sänkt, lågpass, distorsion, eko, lager): Kenneys paket (RPG Audio, Impact, Interface, Digital Audio) från biblioteket `assets/audio/`, plus nedladdade OpenGameArt-paket i `art-src/audio/<paket>/` (rubberducks SFX-paket, Kenneys Sci-Fi Sounds, ånga, hjärtslag, elektricitet, metallslag, monster, kör), vart och ett med `SOURCE.md` (URL, upphovsperson, licens, datum). Musiken: `menu` Dark Cavern Ambient, `forest` Nuclear Cave, `library` Dark Sci-Fi Audio Pack (basslag 60 BPM), `boss` Dark Forces med hjärtslag och förvrängd kör, `final` Heavy Boss Battle 2 nedpitchad med hjärtslag och kör, stingers ur Dark Cavern Ambient och Dark Sci-Fi Audio Pack. `tools/import_audio.py` bygger allt: en tabellrad per id (källfil, klipp, förstärkning, tonhöjd, filter, lager), loopar klippta där källan upprepar sig bäst med toning över skarven, normalisering och Vorbis-kodning, och skriver `manifest.json` och `audio/CREDITS.txt` (alla källfiler med paket, upphovsperson, licens, URL). Kör `python3 tools/import_audio.py` (numpy och ffmpeg) för att bygga om; `--only whip,menu` bygger några. Cirka 2,0 MB totalt (testet tillåter 5 MB). `400 Sounds Pack` används inte: det saknar licensfil och sidan på itch.io ger egna villkor, inte CC0. Valen är gjorda efter filnamn, längd, tempo och spektrum, inte på gehör: lyssna och byt en rad i skriptet om något inte känns rätt.
- **Gamla platshållare:** `tools/make_placeholder_sfx.py` (egna syntetiserade retroljud) finns kvar men skriver över alla filer och manifestet, så kör det inte efter att de riktiga ljuden lagts in.

## Bygge

Kräver Android SDK (plattform 35, build-tools 35.0.0). Skapa `local.properties` med `sdk.dir`.

```
./gradlew assembleDebug testDebugUnitTest
```

Det finns cirka 250 JVM-enhetstester (inklusive Robolectric-skärmdumpar till `app/build/screenshots/`, eller `$SHOT_DIR`): statistikberäkning, level-up-erbjudanden, evolutioner, vågor, butik, headless-simuleringar, ljudhändelser (gräns, ringbuffert, manifest), att Ashfall-manifestet och modellramarna är giltiga, namnöverlägget, banans layout, ljuskartan (kontrast, allokering) och dödsanimationen, statusformlerna, fiendearketyperna, banorna, tunnkedjorna och en 30 minuters soak per bana (`SOAK=1` kör hela soaken, `Phase7ShotsTest` ritar rusningslinjer, skott, moln, statusar, askstorm och tunnkedja). Vyn visar 560 världsenheter på höjden (`Sim.VIEW_H`).

Kopiera sedan `app/build/outputs/apk/debug/app-debug.apk` till `dist/`.

## Kodstruktur

| Paket | Innehåll |
|---|---|
| `data/` | JSON-inläsning |
| `game/` | Motor, Sim, vapen, vågor, `WorldGen` (banans layout), `Status` (statussiffror), `EnemyAi` (arketyper, fiendeskott, farozoner). Inga `android.*`-importer. |
| `render/` | `WorldRenderer`, `SpriteAtlas` (modeller och bilder ur `ashfall/manifest.json`), `GroundCache` (markbitmappar), `Lighting` (ljuskarta), `PixelSprites` (mynt, mat, granat) |
| `ui/` | `PanelRenderer` för nedre skärmen |
| `screen/` | `MainActivity`, `GameView` (spelloopen), `DualScreenManager`, `PanelPresentation`, `SecondaryActivity`, `InputRouter` |

## Ej testat på riktig hårdvara

- Vilken väg för nedre skärmen Thor faktiskt använder.
- Gamepad-routing.
- Balansen, och 60 fps med ungefär 300 fiender.
