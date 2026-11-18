# xteink-epub

xteink-epub anpassar EPUB-filer automatiskt för e-läsaren **Xteink X4 Pro** (4,3" E Ink,
480×800 stående, cirka 220 PPI, ESP32-C3 med ungefär 380 kB RAM). Det fungerar med både
originalfirmwaren och den öppna firmwaren CrossPoint Reader. Verktyget är ett kommandoradsprogram
i Python som bara behöver Pillow och lxml.

Originalfilen rörs inte (om du inte ber om `--in-place`). Resultatet sparas som
`<namn>.xteink.epub`.

## Vad den gör, och varför

Varje bok behandlas i minnet i de här stegen:

1. **Kontroll av filen.** Är det inget giltigt zip-arkiv avbryts boken med ett tydligt fel. Är den
   DRM-skyddad (`META-INF/rights.xml`, eller `encryption.xml` med annan kryptering än
   typsnittsobfuskering) vägras den, eftersom läsaren inte kan öppna sådana böcker.
2. **Bilder.** Alla rasterbilder (JPEG, PNG, GIF, WebP, BMP, TIFF) blir *baslinje*-JPEG, eftersom
   läsaren och CrossPoint inte klarar progressiva JPEG-filer. Bilderna skalas ned så att de
   ryms i 480×800 (de förstoras aldrig), eftersom större bilder bara tar RAM och plats.
   Genomskinlighet läggs på vitt, bilden görs grå (skärmen är gråskala) och kontrasten dras ut
   något. Filer som inte redan heter `.jpg`/`.jpeg` döps om till `.jpg`, och varje
   hänvisning i boken uppdateras: XHTML (`src`, `href`, `xlink:href`, `poster`, `srcset`),
   CSS `url(...)`, `style`-attribut, NCX, OPF och guide. Bilder som inte går att läsa lämnas
   orörda med en varning.
3. **SVG-omslag.** Sidor som bara är en `<svg>` med en enda `<image>` (vanligt för omslag) blir en
   vanlig `<img>`, eftersom läsarna sällan visar SVG. Egenskapen `svg` tas bort från OPF-posten.
4. **Omslag.** Omslagsbilden hittas (EPUB3 `cover-image`, EPUB2 `<meta name="cover">`,
   guide-referens eller id/filnamn med "cover") och både EPUB2-metan och EPUB3-egenskapen
   (för paket version 3 eller högre) pekar på den konverterade bilden.
5. **Typsnitt.** Inbäddade typsnitt tas bort (filer, manifestposter, `@font-face`, posten i
   `encryption.xml`), eftersom de gör läsaren långsam och kan få den att krascha. Kvar blir bara
   `font-family` med `serif`, `sans-serif` eller `monospace`, så att enhetens egen font används.
6. **CSS.** Tung CSS förenklas: `position: fixed/absolute`, fasta bredder och höjder (utom på
   bilder), `-webkit-`/`-moz-`/`-ms-`/`-o-`-egenskaper, kolumner, och marginal/utfyllnad på
   `html`/`body` nollställs. `font-size` i px/pt blir em (16 px eller 12 pt = 1 em). Tomma regler
   försvinner.
7. **XHTML.** `<script>` och `on*`-attribut tas bort och sidorna skrivs om som XML. Trasiga
   filer tolkas så gott det går.
8. **Skräp.** `__MACOSX/`, `.DS_Store`, `Thumbs.db`, `desktop.ini`, `iTunesMetadata.plist`,
   `iTunesArtwork` och `calibre_bookmarks.txt` tas bort (om de inte ingår i boken).
9. **Paketering.** `mimetype` läggs först och okomprimerad. Resten komprimeras (nivå 9). Filer som
   inte ändrats är byte för byte lika med originalet.

## Installera

Kräver Python 3.10 eller nyare.

```bash
pip install .
# eller, så att programmet hamnar i en egen miljö:
pipx install .
```

Utan installation går det också att köra direkt från källträdet:

```bash
PYTHONPATH=src python3 -m xteink_epub bok.epub
```

## Användning

```bash
# En bok: skapar bok.xteink.epub bredvid bok.epub
xteink-epub bok.epub

# Alla böcker i en mapp (rekursivt), resultatet i en annan mapp
xteink-epub ~/Böcker -o ~/Xteink

# Bara fyra grånivåer med dithering, liggande bilder roteras
xteink-epub bok.epub --levels 4 --rotate-landscape

# Skriv över originalet och behåll färg
xteink-epub bok.epub --in-place --color

# Bevaka en mapp och konvertera nya böcker automatiskt
xteink-epub --watch ~/Nedladdningar -o ~/Xteink
```

Redan konverterade filer (`*.xteink.epub`) hoppas över när en mapp genomsöks, och en utfil som
redan finns hoppas över om du inte anger `--force`.

### Bevakningsläge

Med `--watch DIR` kontrolleras mappen (och undermappar) var 5:e sekund (ändra med
`--interval`). En ny eller ändrad `.epub` konverteras först när storleken är densamma vid två
kontroller i rad, så att filer som fortfarande laddas ner inte rörs. Resultatet skrivs bredvid
originalet eller i `-o`-mappen, och egna utfiler bearbetas aldrig igen. Böcker som redan har en
färdig utfil hoppas över vid start (om inte `--force`). Avsluta med Ctrl+C.

## Alternativ

| Alternativ | Betydelse |
|---|---|
| `PATH...` | EPUB-filer eller mappar (alla `*.epub` söks rekursivt) |
| `-o`, `--output DIR` | Skriv resultatet i DIR (skapas vid behov) |
| `--in-place` | Skriv över originalet (via temporärfil och atomisk ersättning) |
| `--force` | Skriv över utfiler som redan finns |
| `--width 480`, `--height 800` | Bildruta i pixlar |
| `--quality 85` | JPEG-kvalitet (1–95) |
| `--levels {4,16,256}` | Antal grånivåer. 4 och 16 ger jämnt fördelade toner med Floyd–Steinberg-dithering. Ignoreras med `--color` |
| `--no-dither` | Ingen dithering vid `--levels 4` eller `16` |
| `--color` | Behåll färg (annars gråskala) |
| `--rotate-landscape` | Rotera bilder som är bredare än höga (och bredare än rutan) 90° medurs |
| `--keep-fonts` | Behåll inbäddade typsnitt |
| `--keep-css` | Förenkla inte CSS (typsnittsregler tas ändå bort om inte `--keep-fonts`) |
| `--strip-css` | Ta bort all CSS: stilmallar, `<style>` och `style`-attribut |
| `--watch DIR` | Bevaka en mapp |
| `--interval 5` | Sekunder mellan kontroller i bevakningsläget |
| `-q`, `--quiet` | Skriv bara ut fel |
| `-v`, `--verbose` | Skriv ut detaljer per bild och fil |

Avslutskod: 0 om allt gick bra, 1 om någon bok misslyckades, 2 vid fel användning.

## Bra att veta

- **Originalfirmwaren visar kanske inga bilder alls.** CrossPoint Reader gör det, och är det
  du vill använda om bilderna är viktiga. Verktyget kan inte få originalfirmwaren att visa bilder.
- **DRM kan inte tas bort.** Verktyget vägrar DRM-skyddade böcker (avslutskod 1). Ta bort skyddet
  med ett annat verktyg först, om det är lagligt där du bor.
- Boken kontrolleras inte mot EPUB-standarden (epubcheck). Verktyget ändrar bara det som beskrivs
  ovan och försöker lämna resten orört.

## Utveckla

```bash
./run-tests.sh
```

Testerna bygger sina EPUB-filer i koden och behöver inga filer att ladda ner.
