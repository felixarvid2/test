# Xteink EPUB för Android

En Android-app som anpassar EPUB-filer för e-läsaren **Xteink X4 Pro** (480×800, gråskala, E Ink)
direkt i telefonen. Den gör samma sak som kommandoradsverktyget i [`../`](../README.md), med
samma standardvärden, men i Kotlin och med ett grafiskt gränssnitt. Pythonverktyget är kvar
oförändrat.

## Vad appen gör

Varje bok behandlas i telefonens minne och sparas som `<namn>.xteink.epub` i en mapp du väljer.
Originalet rörs aldrig. Stegen är desamma som i Pythonverktyget:

- Alla rasterbilder (JPEG, PNG, GIF, WebP, BMP) blir **baslinje-JPEG**, eftersom
  CrossPoint-firmwaren inte klarar progressiva JPEG-filer. Bilderna skalas ned så att de ryms i
  480×800 (de förstoras aldrig), läggs på vitt, görs gråa och får kontrasten utdragen (0,5 %
  avklippt i båda ändar). EXIF-rotation följs. Valfritt: färre grånivåer med dithering, behåll
  färg, rotera liggande bilder.
- Hänvisningarna uppdateras överallt (`src`, `href`, `xlink:href`, `poster`, `srcset`, CSS
  `url(...)`, `style`-attribut, NCX, OPF, guide och omslag).
- SVG-omslag (en sida som bara är en `<svg>` med en bild) blir en vanlig `<img>`.
- Inbäddade typsnitt tas bort (filer, manifestposter, `@font-face`, `encryption.xml`).
- CSS förenklas (eller lämnas, eller tas bort helt).
- `<script>` och `on*`-attribut tas bort, sidorna skrivs om som XHTML, och skräpfiler
  (`__MACOSX/`, `.DS_Store`, `Thumbs.db` med flera) försvinner.
- Paketeringen läggs om: `mimetype` först och okomprimerad, resten komprimerat. Filer som inte
  ändrats är byte för byte lika med originalet.

**DRM-skyddade böcker vägras** med ett tydligt felmeddelande. Appen kan inte ta bort DRM.
Trasiga zip-filer och böcker utan OPF-fil ger också egna felmeddelanden. Bilder som inte går att
läsa lämnas orörda och ger en varning.

## Installera

1. Ladda ner `xteink-epub-0.1.0.apk` från [releasen](https://github.com/felixarvid2/test/releases)
   (`xteink-epub-android-v0.1.0`) eller från körningen i GitHub Actions (artefakten
   `xteink-epub-apk`).
2. Öppna filen på telefonen. Android frågar om du vill tillåta installation från den app du
   öppnade den i (webbläsaren eller filhanteraren). Tillåt det, installera, och stäng av
   tillåtelsen igen om du vill.
3. Nya versioner installeras rakt över den gamla, eftersom alla byggen är signerade med samma nyckel
   (se [Signering](#signering)).

Kräver Android 8.0 (API 26) eller nyare.

## Använda appen

1. **Välj mapp** med *Välj mapp för färdiga böcker*. Appen kommer ihåg mappen. Välj till exempel
   den mapp du synkar till läsaren.
2. **Välj böcker** med *Välj EPUB-filer* (flera på en gång går bra), eller:
   - öppna en `.epub` från en filhanterare eller webbläsare och välj *Xteink EPUB* under
     *Öppna med*, eller
   - använd *Dela* på en eller flera böcker och välj *Xteink EPUB*.

   Böckerna hamnar i listan. Om en mapp är vald och inställningen *Konvertera direkt när böcker
   delas till appen* är på (den är på som standard) börjar konverteringen genast. Filhanterare som
   anger fel filtyp för EPUB-filer (`application/octet-stream`) fungerar också, så länge filen heter
   `.epub`.
3. Tryck **Konvertera**. Finns ingen mapp än får du välja en först. Listan visar för varje bok
   *Väntar*, *Konverterar x %*, *Klar* med storlek före och efter, eller *Fel* med orsaken.
   Skärmen hålls tänd medan konverteringen pågår, och du kan trycka *Avbryt*.
4. Tryck **Dela** på en färdig bok om du vill skicka den vidare (till exempel till en
   synkroniseringsapp). Filen delas via en tillfällig kopia i appens cache.

Om en fil med samma namn redan finns i mappen väljer du under *Färdiga böcker* om den ska
skrivas över eller få ett nummer: `Bok (2).xteink.epub`.

## Inställningar

Alla val sparas mellan körningarna.

| Inställning | Betydelse | Standard |
|---|---|---|
| Gråskala: 256 / 16 / 4 nivåer | Färre nivåer ger jämnt fördelade toner | 256 |
| Dithering | Floyd–Steinberg vid 16 och 4 nivåer | på |
| Behåll färg | Bilderna blir annars gråskala (nivåerna ignoreras med färg) | av |
| Rotera liggande bilder | Bilder som är bredare än höga och bredare än rutan vrids 90° medurs | av |
| Behåll typsnitt | Inbäddade typsnitt tas annars bort | av |
| CSS: Förenkla / Behåll / Ta bort all | Se [`../README.md`](../README.md) för vad förenklingen gör | Förenkla |
| JPEG-kvalitet | 60–95 | 85 |
| Konvertera direkt när böcker delas till appen | Gäller *Öppna med* och *Dela* | på |
| Avancerat: bildruta | Bredd och höjd i pixlar | 480 × 800 |

## Bygga själv

Kräver JDK 17 eller nyare (CI använder 21) och Android SDK med `platforms;android-35` och
`build-tools;35.0.0`. Skapa `local.properties` med `sdk.dir=/sökväg/till/android-sdk`
(filen är ignorerad av git), eller sätt `ANDROID_HOME`.

```bash
cd xteink-epub/android
./gradlew :core:test :app:assembleRelease
# APK: app/build/outputs/apk/release/xteink-epub-0.1.0.apk
```

### Uppbyggnad

- `core/`: ren Kotlin/JVM-modul utan Android-beroenden med hela omvandlingen (zip, DRM-kontroll,
  OPF/NCX/XHTML via [jsoup](https://jsoup.org/), CSS-förenklaren, hänvisningar, paketering).
  Bilderna går genom gränssnittet `ImageProcessor`, så att kärnan kan testas på vanlig JVM.
  Bildaritmetiken (autokontrast, dithering, storleksberäkning) ligger i `ImageMath` på
  `ByteArray`/`IntArray` och är enhetstestad.
- `app/`: Jetpack Compose (Material 3), `ViewModel` som kör konverteringen på
  `Dispatchers.Default` (så att rotation inte avbryter den), inställningar i DataStore och
  `BitmapImageProcessor` som implementerar `ImageProcessor` med `Bitmap` och `Bitmap.compress`.

### Testa

`./gradlew :core:test` kör enhetstesterna: syntetiska EPUB 2- och EPUB 3-böcker byggs i koden och
motsvarar Pythonverktygets tester (omdöpta bilder utan hängande hänvisningar, DRM vägras, SVG-omslag,
typsnitt, CSS, `mimetype` först och okomprimerad med mera), plus jsoup-lagrets hantering av
namnrymder och trasig XHTML.

`./gradlew :app:testDebugUnitTest` kör Android-koden på vanlig JVM med Robolectric (inbyggd
grafik, sdk 35): `BitmapImageProcessor` på progressiv JPEG, PNG med alpha, GIF, WebP, stora och små
bilder, EXIF-rotation, 4 nivåer, färg och rotation; huvudskärmen i Compose; och `MainViewModel`
som konverterar en bok till en mapp via en testversion av lagringsåtkomstramverket (SAF).

Test på riktiga böcker (hoppas över om sökvägen saknas, så CI behöver inga filer):

```bash
./gradlew :core:test --tests '*RealBooksE2eTest' \
  -Dxteink.e2e.dir=/sökväg/till/mapp/med/epub-filer \
  -Dxteink.e2e.out=/valfri/mapp/för/resultaten
```

Samma `-D`-flaggor gäller `:app:testDebugUnitTest`, som då även kör hela flödet med
`BitmapImageProcessor`. Testet kontrollerar att alla JPEG-filer är baslinje och högst 480×800, att alla XHTML-, OPF-
och NCX-filer går att tolka strikt, att inga typsnitt eller hängande hänvisningar finns kvar och
att `mimetype` kommer först och är okomprimerad.

## Signering

APK:n är signerad med nyckeln `app/xteink-release.jks` (alias `xteink`, lösenord `xteink-epub`).
**Nyckeln ligger i repot med avsikt och är därför offentlig.** Den finns bara för att varje bygge,
lokalt eller i CI, ska få samma signatur så att uppdateringar kan installeras över varandra.
Använd den bara för egen sidoladdning. Den ger ingen säkerhet: vem som helst kan signera en
annan app med samma nyckel och ge den samma behörighet att uppdatera den här. Vill du ha en
privat nyckel byter du ut keystore-filen och uppgifterna i `app/build.gradle.kts` (och måste då
avinstallera appen innan den nya versionen kan installeras).

## Begränsningar

- Appen har ingen bakgrundstjänst: håll den öppen under konverteringen (skärmen hålls tänd av
  appen medan den arbetar).
- TIFF-bilder kan inte läsas av Android. De lämnas orörda och ger en varning (Pythonverktyget
  konverterar dem).
- Bild-JPEG:erna skrivs av Androids egen kodare (`Bitmap.compress`) som alltid ger färgkodade
  (3 komponenter) baslinje-JPEG även för gråskala. De ser likadana ut men är något större än de
  enkomponents-JPEG som Pillow skriver.
- Utan bakgrundstjänst och utan R8: APK:n är stor (cirka 9 MB) men enkel.
