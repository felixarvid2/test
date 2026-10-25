# Thor Survivors

En Vampire Survivors-liknande auto-shooter för AYN Thor, en handhållen Android-spelare med två skärmar. Ren Java med Canvas/SurfaceView, inga beroenden.

- Spelet heter **ASHFALL: Lumen Tide** i menyn (mörk industriell sci-fi, formgivning i `docs/ASHFALL_DESIGN.md`). Paketet och mappen heter fortfarande Thor Survivors. Spelreglerna och balansen är oförändrade: den här fasen byter bara utseende och namn (design fas 1, 2 och 8).
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
- A: bekräfta
- B: tillbaka
- Start: paus
- Touch på nedre skärmen

I emulatorn: WASD eller piltangenterna.

## Innehåll

- **Stages:** Cinder Flats (nyckel `FOREST`, förut Mad Forest) och Deep Mines (nyckel `LIBRARY`, förut Library). Nycklarna är desamma så sparfiler och data fungerar. Banan är oändlig och bestäms av `game/WorldGen.java` (ren funktion av rutan, så den ser likadan ut varje gång). Cinder Flats är en askslätt: skrotgårdar med lastlådor, barrikader, bränsletankar, slagg- och spillrestenar, lysande lumentillväxter i klungor (de lyser grönt), nödljusstolpar, kraschade landare och flyktkapslar, och en skorsten långt bort. Deep Mines har långa väggrader (väggsegment, catwalks, rörklungor, slaggstenar) över och under ett fritt mittstråk, med luckor, bråte mellan raderna och nödljus längs stråket. Golvet är dekaler (olja, blod, sot, spillror, galler, ben, mossa, kristaller, varningsränder) utspridda per ruta. Inget krockar och startplatsen är alltid fri.
- **Förstörbara:** sprängtunnor i Cinder Flats (förut brasor), förrådskistor i Deep Mines (förut kandelabrar) (cirka en per 500 x 500 enheter, aldrig nära start). Vapen slår sönder dem och de ger oftast guld, ibland kyckling och sällan Vacuum, Orologion, Rosary eller Clover.
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
- **Fiender:** 42 typer, inklusive bossar. De spelar fortfarande Vampire Survivors-rollerna, men ritas med de bakade Ashfall-modellerna tills det riktiga Ashfall-galleriet kommer (mappningen står i `game/EnemyType.java`):

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

  Spelaren är bastion (idle, run, attack, hit, death).
- **Kistor:** följer stagens skattetabell (`treasure` i `game_data.json`, raden för aktuell eller senaste minut som har en). Antal föremål: 5 med `chances[0]` procent, annars 3 med `chances[1]` procent, annars 1 (en kista är aldrig tom, så `chances[2]` styr inget). Platserna fylls i ordningen `prizeTypes`: EVOLUTION utvecklar ett färdigt vapen (annars som EXISTING_ANY), EXISTING_ANY höjer ett slumpat vapen eller en passiv som inte är på max, EXISTING_WEAPON samma men bara vapen, okända typer räknas som EXISTING_ANY. Går inget att höja ges bara guld. `level` och `fixedPrizes` i datan används inte.
- **Greed:** gäller även enstaka mynt; bråkdelen av guldet sparas (`Sim.goldFrac`), så 10 mynt med Greed 1,2 ger 12 guld.
- **Böcker och pölar:** varje bok (King Bible, Unholy Vespers) och varje Santa Water-pöl träffar på egen hand med sin egen `hitBoxDelay` per fiende (`Enemy.tryTick`), så fler böcker (Amount) ger mer skada.
- **Vågor:** varje `frequency` ms kommer en fiende av varje typ i minutens `enemies` (högst 300 på banan), och fältet fylls dessutom upp till `minimum` (`game/WaveDirector`). Dödzonen i XP runt minut 5 till 10 i Mad Forest är i huvudsak datan (en fiendetyp och `minimum` 10 till 30).
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

- **Pipeline:** `python3 tools/build_ashfall_assets.py` (Pillow, numpy) skapar allt spelet läser i `app/src/main/assets/ashfall/`: ett ark per animerad modell (`m_<modell>.webp`, ramarna skalade 0,78 så att en människa blir cirka 75 px hög på 1080p, och omförpackade), `world.webp` (rekvisita, miljö, dekaler), `vfx.webp` (effekter, svart bakgrund omräknad till alfa), `icons.webp` (panelikoner och kristaller), `ground/mine_rock.webp`, `manifest.json` och `CREDITS.txt`. Allt är WebP utan förlust utom golvtexturen. Cirka 12 MB filer; modellarken tar cirka 41 MB bitmappsminne (plus cirka 16 MB för världs-, effekt- och ikonarken och upp till 39 MB för marken) när de avkodas (inga hit-klipp eller idle för fiender, de går alltid). `tools/build_atlas.py` är det gamla Kenney-bygget och används inte längre.
- **Ritning** (`render/WorldRenderer`, `render/SpriteAtlas`): animerade 8-riktningssprites. Riktningen kommer från rörelsen (spelaren från `faceX/faceY`, fiender mot spelaren med hysteres), klippet från tillståndet (walk, attack när de rör spelaren, death), klocka per entitet (`Enemy.anim`), och gång-fps skalas med rörelsehastigheten. Döden spelas upp färdigt (`Sim.corpses`, en ring om 96) innan liket tonas ut efter cirka 2 s. Ramar ritas 1:1 med `Rect src/dst` på hela pixlar. Träffblixten är ett vitt färgfilter på samma ram (ingen extra bitmapp). Y-sortering och mjuk skugga är kvar. Omodellerade (origga) modeller får procedurell rörelse: guppa, klämma, svaja.
- **Marken** (`render/GroundCache`): bergstexturen läggs i världspixlar (sömlös mellan bitar), tonas per stage (askgrå respektive mörkare och kallare), en vänd kopia läggs ovanpå för att dölja upprepningen, och dekalerna bakas in i samma 8 x 8-rutors bitar. Rekvisitan listas av `WorldGen.props` varje bildruta och sorteras med figurerna.
- **Mörker och ljus** (`render/Lighting`, design avsnitt 10): en lågupplöst (1/6) ALPHA_8-ljuskarta fylls med omgivande mörker (0,65 Cinder Flats, 0,78 Deep Mines, `ashfall_data.json`) och ljus stansas in med mjuka cirklar (spelaren r 240 u, 200 i gruvan; nödljus r 130 flimrande varmt; lumentillväxt r 90 grönt pulserande; eld och explosioner). Kartan ritas en gång över marken med filtrering. Spritar får samma ljus analytiskt som ett färgfilter, så fiender aldrig går under 64 % ljusstyrka (och ritas ljusare än modellens bake), skott och effekter ritas additivt ovanför mörkret, ädelstenar lyser. Inställningen LIGHTING i huvudmenyn (FULL, LOW, OFF, sparas som volymraderna) väljer dynamisk karta, en statisk vinjett med bara spelarens ljus, eller inget.
- **Effekter:** Vibro Lash = slash, Spore Dart = plasmablixt, Scalpel Throw = skalpell med ljusstreck, Cluster Grenade = granat med explosion, Ricochet Drone = drönarmodellen, Ward Drones = hex-sköld, Slag Cannon = eldklot med lågsvans, Toxic Vent = spormoln, Corrosive Flask = giftpöl, Arc Coil = blixtsprite. Träffar ger gnistor, dödsfall blod, ichor eller gnistor efter modell. Ädelstenar är lumenkristaller (grön, lila, röd för den sammanslagna).
- **Ikoner:** panelens vapen- och passivikoner är Ashfalls färdighets-, stat- och kristallikoner (`ICONS` i bygget). Hela panelskinnet kommer i en senare fas.
- **Röd ädelsten:** ädelstenar längre bort än `Sim.RECYCLE_DIST` slås ihop till en enda röd, större gem som flyttas till 250 till 350 enheter från spelaren och ger hela värdet när den tas (`Sim.condenseFar`, var 0,5 s). Är poolen full slås nya gems ihop med en nära (80 enheter) eller trycks in i den röda; kistor, mynt, mat och power-ups får alltid plats. Testas i `PickupPoolSaturationTest`.

## Ljud

- **Händelser:** `game/SoundEvents` är en ringbuffert av heltal utan android.* och utan allokering. `Sim` och `Engine` skickar 26 händelser (whip, magic_missile, knife, axe, cross, bible, fireball, garlic, holy_water, lightning, enemy_hit, enemy_death, player_hurt, gem, coin, level_up, chest_open, evolution, brazier_break, food_heal, boss_spawn, game_over, victory, ui_move, ui_confirm, ui_back). Varje id har en gräns (högst N per 100 ms, ibland ett minsta avstånd), så 50 träffar i en bildruta blir några få ljud. Gem-ljudet höjs en skalsteg per gem som tas inom 0,4 s.
- **Spelaren:** `audio/AudioEngine` tömmer kön på speltråden varje bildruta. Effekter går via `SoundPool` (USAGE_GAME, 16 strömmar, slumpad tonhöjd och volym per ljud, äldsta rösten av samma ljud klipps). Musik går via `MediaPlayer` på en egen tråd med in- och uttoning: `menu`, `forest` (Cinder Flats), `library` (Deep Mines), `boss` (valfri, annars stagets spår), `final` (The First, tyst tills koden spelar det) och stingers `gameover`/`victory`. Musiken pausas i `onPause` och släpps i `onDestroy`. Ljudet följer systemets valda utgång, inget särskilt för tvåskärmsläget.
- **Inställningar:** raderna MUSIC och SOUND EFFECTS i huvudmenyn (OFF, LOW, MEDIUM, HIGH; sparas i `PrefsStore`).
- **Filer:** `app/src/main/assets/audio/sfx/<id>.ogg`, `audio/music/<spår>.ogg` och `audio/manifest.json` (id till fil, basvolym). En fil som saknas är bara tyst. Manifestet har tre delar: `sfx` (de 26 inkopplade id:na), `pending` (33 nya id:n ur designen, avsnitt 12, färdiga men ännu inte inkopplade: flytta posten till `sfx` när `SoundEvents` får id:t) och `music`. Exakta id:n, längd, stil och nivåer (cirka -16 LUFS musik, peak -1 dBFS effekter, mono 44,1 kHz för effekter, stereo för musik, sömlösa loopar) står i `tools/AUDIO_SPEC.md`.
- **Ljudbild (CC0):** mörk industriell sci-fi-skräck: låga drönare, metallslag, ånga, gnistor, våta sporljud och förvrängda basslag. Alla effekter och spår är riktiga CC0-inspelningar som bearbetats (tonhöjden sänkt, lågpass, distorsion, eko, lager): Kenneys paket (RPG Audio, Impact, Interface, Digital Audio) från biblioteket `assets/audio/`, plus nedladdade OpenGameArt-paket i `art-src/audio/<paket>/` (rubberducks SFX-paket, Kenneys Sci-Fi Sounds, ånga, hjärtslag, elektricitet, metallslag, monster, kör), vart och ett med `SOURCE.md` (URL, upphovsperson, licens, datum). Musiken: `menu` Dark Cavern Ambient, `forest` Nuclear Cave, `library` Dark Sci-Fi Audio Pack (basslag 60 BPM), `boss` Dark Forces med hjärtslag och förvrängd kör, `final` Heavy Boss Battle 2 nedpitchad med hjärtslag och kör, stingers ur Dark Cavern Ambient och Dark Sci-Fi Audio Pack. `tools/import_audio.py` bygger allt: en tabellrad per id (källfil, klipp, förstärkning, tonhöjd, filter, lager), loopar klippta där källan upprepar sig bäst med toning över skarven, normalisering och Vorbis-kodning, och skriver `manifest.json` och `audio/CREDITS.txt` (alla källfiler med paket, upphovsperson, licens, URL). Kör `python3 tools/import_audio.py` (numpy och ffmpeg) för att bygga om; `--only whip,menu` bygger några. Cirka 2,0 MB totalt (testet tillåter 5 MB). `400 Sounds Pack` används inte: det saknar licensfil och sidan på itch.io ger egna villkor, inte CC0. Valen är gjorda efter filnamn, längd, tempo och spektrum, inte på gehör: lyssna och byt en rad i skriptet om något inte känns rätt.
- **Gamla platshållare:** `tools/make_placeholder_sfx.py` (egna syntetiserade retroljud) finns kvar men skriver över alla filer och manifestet, så kör det inte efter att de riktiga ljuden lagts in.

## Bygge

Kräver Android SDK (plattform 35, build-tools 35.0.0). Skapa `local.properties` med `sdk.dir`.

```
./gradlew assembleDebug testDebugUnitTest
```

Det finns 158 JVM-enhetstester (inklusive Robolectric-skärmdumpar till `app/build/screenshots/`, eller `$SHOT_DIR`): statistikberäkning, level-up-erbjudanden, evolutioner, vågor, butik, headless-simuleringar, ljudhändelser (gräns, ringbuffert, manifest), att Ashfall-manifestet och modellramarna är giltiga, namnöverlägget, banans layout, ljuskartan (kontrast, allokering) och dödsanimationen. Vyn visar 560 världsenheter på höjden (`Sim.VIEW_H`).

Kopiera sedan `app/build/outputs/apk/debug/app-debug.apk` till `dist/`.

## Kodstruktur

| Paket | Innehåll |
|---|---|
| `data/` | JSON-inläsning |
| `game/` | Motor, Sim, vapen, vågor, `WorldGen` (banans layout). Inga `android.*`-importer. |
| `render/` | `WorldRenderer`, `SpriteAtlas` (modeller och bilder ur `ashfall/manifest.json`), `GroundCache` (markbitmappar), `Lighting` (ljuskarta), `PixelSprites` (mynt, mat, granat) |
| `ui/` | `PanelRenderer` för nedre skärmen |
| `screen/` | `MainActivity`, `GameView` (spelloopen), `DualScreenManager`, `PanelPresentation`, `SecondaryActivity`, `InputRouter` |

## Ej testat på riktig hårdvara

- Vilken väg för nedre skärmen Thor faktiskt använder.
- Gamepad-routing.
- Balansen, och 60 fps med ungefär 300 fiender.
