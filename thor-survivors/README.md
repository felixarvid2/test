# Thor Survivors

En Vampire Survivors-liknande auto-shooter för AYN Thor, en handhållen Android-spelare med två skärmar. Ren Java med Canvas/SurfaceView, inga beroenden.

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

- **Stages:** Mad Forest och Library. Banan är oändlig och bestäms av `game/WorldGen.java` (ren funktion av rutan, så den ser likadan ut varje gång): Mad Forest har täta skogsdungar (gröna och höstfärgade) av hela träd, jordstigar och gläntor med riktiga kanter, blomängar, buskar, svampar och spridda träd som sorteras i djupled med figurerna. Library har långa hyllrader över och under ett fritt mittstråk, med luckor, bord, tunnor och pallar. Inget krockar.
- **Förstörbara:** brasor i Mad Forest, kandelabrar i Library (cirka en per 500 x 500 enheter, aldrig nära start). Vapen slår sönder dem och de ger oftast guld, ibland kyckling och sällan Vacuum, Orologion, Rosary eller Clover.
- **Vapen:** 10 vapen med evolutioner:
  - Whip → Bloody Tear
  - Magic Wand → Holy Wand
  - Knife → Thousand Edge
  - Axe → Death Spiral
  - Cross → Heaven Sword
  - King Bible → Unholy Vespers
  - Fire Wand → Hellfire
  - Garlic → Soul Eater
  - Santa Water → La Borra
  - Lightning Ring → Thunder Loop
- **Passiver:** 13.
- **Fiender:** 42 typer, inklusive bossar.
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

- CC0-sprites från Kenney (Tiny Dungeon, Tiny Town) och Clint Bellanger (Tiny Creatures, OpenGameArt).
- Originalen, övriga nedladdade CC0-paket och deras licenser ligger i `art-src/`.
- Mappningen görs i `tools/build_atlas.py`, som skapar `app/src/main/assets/sprites/atlas.json`. Krediter finns i `CREDITS.txt`. Marken (golv, jordens autotile, träd, hyllor) listas där per stage och indexeras av `WorldGen`; brasan och kandelabern är handritade i `PixelSprites`.
- Marken ritas i förberäknade bitmappar om 8 x 8 rutor (`render/GroundCache`, cirka 24 i en LRU, de utanför bild bakas på en bakgrundstråd). Mörk kantvinjett är en enda liten bitmapp.
- Piskan, böckerna, vitlöken, blixtarna och ädelstenarna ritas procedurellt.
- **Röd ädelsten:** ädelstenar längre bort än `Sim.RECYCLE_DIST` slås ihop till en enda röd, större gem som flyttas till 250 till 350 enheter från spelaren och ger hela värdet när den tas (`Sim.condenseFar`, var 0,5 s). Är poolen full slås nya gems ihop med en nära (80 enheter) eller trycks in i den röda; kistor, mynt, mat och power-ups får alltid plats. Testas i `PickupPoolSaturationTest`.

## Ljud

- **Händelser:** `game/SoundEvents` är en ringbuffert av heltal utan android.* och utan allokering. `Sim` och `Engine` skickar 26 händelser (whip, magic_missile, knife, axe, cross, bible, fireball, garlic, holy_water, lightning, enemy_hit, enemy_death, player_hurt, gem, coin, level_up, chest_open, evolution, brazier_break, food_heal, boss_spawn, game_over, victory, ui_move, ui_confirm, ui_back). Varje id har en gräns (högst N per 100 ms, ibland ett minsta avstånd), så 50 träffar i en bildruta blir några få ljud. Gem-ljudet höjs en skalsteg per gem som tas inom 0,4 s.
- **Spelaren:** `audio/AudioEngine` tömmer kön på speltråden varje bildruta. Effekter går via `SoundPool` (USAGE_GAME, 16 strömmar, slumpad tonhöjd och volym per ljud, äldsta rösten av samma ljud klipps). Musik går via `MediaPlayer` på en egen tråd med in- och uttoning: `menu`, `forest`, `library`, `boss` (valfri, annars stagets spår) och stingers `gameover`/`victory`. Musiken pausas i `onPause` och släpps i `onDestroy`. Ljudet följer systemets valda utgång, inget särskilt för tvåskärmsläget.
- **Inställningar:** raderna MUSIC och SOUND EFFECTS i huvudmenyn (OFF, LOW, MEDIUM, HIGH; sparas i `PrefsStore`).
- **Filer:** `app/src/main/assets/audio/sfx/<id>.ogg`, `audio/music/<spår>.ogg` och `audio/manifest.json` (id till fil, basvolym). En fil som saknas är bara tyst. Exakta id:n, längd, stil och nivåer (cirka -16 LUFS musik, peak -1 dBFS effekter, mono 44,1 kHz för effekter, stereo för musik, sömlösa loopar) står i `tools/AUDIO_SPEC.md`.
- **Riktiga ljud (CC0):** alla 26 effekter och 6 musikspår är riktiga CC0-inspelningar: Kenneys paket (RPG Audio, Impact, Interface, Digital Audio, Music Jingles) och Abstraction Music Loop Bundle från biblioteket `assets/audio/`, plus nedladdade OpenGameArt-paket i `art-src/audio/<paket>/` (rubberducks SFX-paket, Heavy Dungeon, MonsterVania-spåren, No Hope, en orgelfanfar), vart och ett med `SOURCE.md` (URL, upphovsperson, licens, datum). `tools/import_audio.py` bygger allt: en tabellrad per id (källfil, klipp, förstärkning, filter, lager), loopar klippta till hela takter med toning över skarven, normalisering och Vorbis-kodning, och skriver `manifest.json` och `audio/CREDITS.txt` (alla källfiler med paket, upphovsperson, licens, URL). Kör `python3 tools/import_audio.py` (numpy och ffmpeg) för att bygga om; `--only whip,menu` bygger några. Cirka 1,7 MB totalt (testet tillåter 3 MB). `400 Sounds Pack` används inte: det saknar licensfil och sidan på itch.io ger egna villkor, inte CC0.
- **Gamla platshållare:** `tools/make_placeholder_sfx.py` (egna syntetiserade retroljud) finns kvar men skriver över alla filer och manifestet, så kör det inte efter att de riktiga ljuden lagts in.

## Bygge

Kräver Android SDK (plattform 35, build-tools 35.0.0). Skapa `local.properties` med `sdk.dir`.

```
./gradlew assembleDebug testDebugUnitTest
```

Det finns 147 JVM-enhetstester (inklusive Robolectric-skärmdumpar till `app/build/screenshots/`, eller `$SHOT_DIR`): statistikberäkning, level-up-erbjudanden, evolutioner, vågor, butik, headless-simuleringar, ljudhändelser (gräns, ringbuffert, manifest) och att atlasen är giltig. Vyn visar 560 världsenheter på höjden (`Sim.VIEW_H`).

Kopiera sedan `app/build/outputs/apk/debug/app-debug.apk` till `dist/`.

## Kodstruktur

| Paket | Innehåll |
|---|---|
| `data/` | JSON-inläsning |
| `game/` | Motor, Sim, vapen, vågor, `WorldGen` (banans layout). Inga `android.*`-importer. |
| `render/` | `WorldRenderer`, `SpriteAtlas`, `GroundCache` (markbitmappar), `PixelSprites` |
| `ui/` | `PanelRenderer` för nedre skärmen |
| `screen/` | `MainActivity`, `GameView` (spelloopen), `DualScreenManager`, `PanelPresentation`, `SecondaryActivity`, `InputRouter` |

## Ej testat på riktig hårdvara

- Vilken väg för nedre skärmen Thor faktiskt använder.
- Gamepad-routing.
- Balansen, och 60 fps med ungefär 300 fiender.
