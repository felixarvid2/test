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

- **Stages:** Mad Forest och Library.
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
- **Kistor:** chests.
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
- Mappningen görs i `tools/build_atlas.py`, som skapar `app/src/main/assets/sprites/atlas.json`. Krediter finns i `CREDITS.txt`.
- Piskan, böckerna, vitlöken, blixtarna och ädelstenarna ritas procedurellt.

## Bygge

Kräver Android SDK (plattform 35, build-tools 35.0.0). Skapa `local.properties` med `sdk.dir`.

```
./gradlew assembleDebug testDebugUnitTest
```

Det finns 26 JVM-enhetstester: statistikberäkning, level-up-erbjudanden, evolutioner, vågor, butik, headless-simuleringar och att atlasen är giltig.

Kopiera sedan `app/build/outputs/apk/debug/app-debug.apk` till `dist/`.

## Kodstruktur

| Paket | Innehåll |
|---|---|
| `data/` | JSON-inläsning |
| `game/` | Motor, Sim, vapen, vågor. Inga `android.*`-importer. |
| `render/` | `WorldRenderer`, `SpriteAtlas` |
| `ui/` | `PanelRenderer` för nedre skärmen |
| `screen/` | `MainActivity`, `GameView` (spelloopen), `DualScreenManager`, `PanelPresentation`, `SecondaryActivity`, `InputRouter` |

## Ej testat på riktig hårdvara

- Vilken väg för nedre skärmen Thor faktiskt använder.
- Gamepad-routing.
- Balansen, och 60 fps med ungefär 300 fiender.
