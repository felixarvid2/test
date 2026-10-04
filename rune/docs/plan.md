# Rune – plan

Rune är ett roguelike-symbolspel i Balatros anda, men utan att vara en pokerklon. I stället för kort och pokerhänder lägger du **runor** på ett 5×5-**altare** och bildar **mönster**. **Reliker** (motsvarigheten till Balatros jokrar) ändrar reglerna och multiplicerar poängen, och målet är samma känsla: *"jag hittade en sjuk kombination"*.

Den här planen beskriver först hur spelet översätter Balatros system, och sedan alla 150 reliker med effekter.

## 1. Från Balatro till Rune

| Balatro | Rune | Kommentar |
|---|---|---|
| Kortlek (52 kort) | **Påsen** (42 runor: 6 av varje symbol) | Runor kan förtrollas, få sigill och utgåvor precis som kort. |
| Färg (♠♥♦♣) | **Symbol** (☀️ 🔥 🌙 💀 🌿 ⚡ 💎) | 7 symboler i stället för 4 färger. |
| Valör (2–A) | **Position** på altaret (hörn, mitt, kant, rad, kolumn) | Det som ger reliker något att "rikta in sig på" utöver symbolen. |
| Hand (8 kort) | **Hand** (8 runor) | |
| Pokerhand | **Mönster** (Trio, Diagonal, Kvadrat …) | Flera mönster kan poängsättas i samma kast. |
| Spela hand | **Kasta** (placera 1–5 runor och poängsätt) | Bara mönster som innehåller en nyplacerad runa räknas. |
| – | **Lägg** | Placera runor utan mönster utan att ett kast går åt – för att bygga upp stora kombinationer. |
| Discard | **Byt** | Kan även byta bort gamla runor från altaret. |
| Chips × Mult | Chips × Mult | Samma formel och samma ordning. |
| Joker | **Relik** | 150 st, 5 fack, ordningen spelar roll. |
| Tarot | **Ristning** | 24 st – en för varje runa i den äldre futharken. |
| Planet | **Stjärnbild** | Höjer ett mönsters nivå. |
| Spectral | **Eko** | Kraftfulla, riskabla kort. |
| Voucher | **Altarförbättring** | 13 st. |
| Tag | **Märke** | Fås när du hoppar över en prövning. |
| Small / Big / Boss blind | **Lärlingens / Mästarens / Väktarens prövning** | 3 per cirkel. |
| Ante 1–8 | **Cirkel 1–8** | Sedan oändligt läge. |

### Det som är nytt jämfört med Balatro

1. **Ett altare som minns.** Runor som inte ingår i ett mönster ligger kvar. Du kan förbereda ett drag i flera steg, men skräp kan också blockera dig. Varje prövning börjar med 8 slumpade runor ur påsen på altaret.
2. **Flera mönster samtidigt → kedjor.** Varje mönster utöver det första ger ×0.25 Mult extra. Ett kors ger dessutom två trior, en monolit ger kors + ring + trior + kvadrater …
3. **Reaktioner.** En runa intill ett mönster, med en symbol som inte finns i mönstret, är en *katalysator*. 🔥🔥🔥 + ⚡ intill = **Överladdad eld**.
4. **Position** är en egen dimension: hörn, mitt, kanter och riktningar ger reliker att bygga kring.

## 2. Poängräkning

För varje kast, i den här ordningen (som i Balatro):

1. **Mönster för mönster** (uppifrån, vänster till höger):
   1. Mönstrets grundvärde läggs till (Chips och Mult, beror på nivå).
   2. Varje runa i mönstret triggas: +5 Chips (+ permanenta bonusar), sedan förtrollning, utgåva, sigill, och sist reliker som reagerar på runor. Rött sigill, Upplyst och omtriggningsreliker triggar runan igen.
   3. Mönstrets reaktioner (katalysatorer).
   4. Reliker som reagerar på mönster (t.ex. Horisonten).
2. **Kedjebonus:** ×(1 + 0.25 per extra mönster).
3. **Kvarliggande runor** (på altaret men inte i något mönster): Stål, Baronen, Nattens öga …
4. **Relikerna**, från vänster till höger: +Chips, +Mult och ×Mult. Därför vill du ha ×Mult längst till höger.
5. **Poäng = Chips × Mult.** Alla runor i mönstren förbrukas och lämnar altaret.

### Mönster

| Mönster | Form | Chips | Mult | Per nivå |
|---|---|---|---|---|
| Trio | 3 lika i rad, vågrätt/lodrätt | 20 | 2 | +15 / +1 |
| Diagonal | 3 lika diagonalt | 30 | 3 | +20 / +1 |
| Kvadrat | 2×2 lika | 35 | 3 | +20 / +2 |
| Kvartett | 4 lika i rad (alla riktningar) | 50 | 4 | +25 / +2 |
| Regnbåge | hel rad/kolumn med 5 olika symboler | 60 | 5 | +25 / +2 |
| Spegel | hel rad/kolumn som är symmetrisk (A B C B A) | 50 | 4 | +20 / +2 |
| Kors | en runa + dess 4 grannar lika | 80 | 6 | +30 / +3 |
| Full linje | 5 lika i rad, kolumn eller huvuddiagonal | 120 | 8 | +40 / +3 |
| Ring | 8 lika runt en ruta | 160 | 10 | +50 / +3 |
| Monolit | 3×3 lika | 250 | 16 | +60 / +4 |

### Reaktioner

| Katalysator | Namn | Effekt |
|---|---|---|
| ☀️ | Upplyst | Mönstrets runor triggas en extra gång |
| 🔥 | Brinnande | +6 Mult |
| 🌙 | Månbelyst | +$1 |
| 💀 | Förbannad | ×2 Mult, men katalysatorn förstörs |
| 🌿 | Växande | +10 Chips per runa i mönstret |
| ⚡ | Överladdad | ×1.5 Mult |
| 💎 | Förstärkt | +40 Chips |

### Runornas modifierare

- **Förtrollningar:** Bonus (+30 Chips), Mult (+4 Mult), Vild (alla symboler), Glas (×2, 1/4 att krossas), Stål (×1.5 medan den ligger kvar), Sten (+50 Chips, saknar symbol, poängsätts alltid), Guld ($3 om den ligger kvar när prövningen klaras), Lycka (1/5: +20 Mult, 1/15: $20).
- **Sigill:** Rött (triggas igen), Guld ($3), Blått (Stjärnbild om den ligger kvar), Lila (Ristning när den byts bort).
- **Utgåvor:** Folie (+50 Chips), Holografisk (+10 Mult), Polykrom (×1.5), Negativ (bara reliker: +1 fack).

## 3. Hur relikerna fungerar som Balatros jokrar

Relikerna är byggda för att ge samma typer av beslut som jokrar:

| Typ i Balatro | Typ i Rune | Exempel |
|---|---|---|
| Platt +Mult/+Chips | **Grund** | Runsten (+4 Mult) |
| Färgjokrar (Greedy, Lusty …) | **Element** | Glödkolet: varje poängsatt 🔥 ger +3 Mult |
| Handjokrar (Jolly, The Duo …) | **Mönster** | Trefaldigheten: ×2 Mult om kastet innehåller en Trio |
| Skalande jokrar (Ride the Bus, Hologram …) | **Skalning** | Tomhetsstenen: +1 Mult permanent per förbrukad runa |
| Pengajokrar (Golden Joker, To the Moon …) | **Ekonomi** | Guldbaggen: $4 per prövning |
| Omtriggning (Hack, Dusk, Mime …) | **Omtriggning** | Hackan: runor i hörnen triggas igen |
| Regeländrare (Four Fingers, Smeared …) | **Regler** | Förbannade kronan: 💀 räknas som alla symboler |
| Skapande (Cartomancer, 8 Ball …) | **Skapande** | Spåkortet: en Ristning per prövning |
| Legendariska (Canio, Perkeo …) | **Legendariska** | Ouroboros: kedjebonusen blir ×2 per mönster |
| – (nytt) | **Kedjor** | Lavinen: dubbel kedjebonus |
| – (nytt) | **Reaktioner** | Överspänningen: Överladdad ger ×3 i stället för ×1.5 |
| – (nytt) | **Position** | Hörnstenen: runor i hörnen ger +8 Mult |
| – (nytt) | **Brädet** | Stenhjärtat: +2 Mult per kvarliggande runa |

**Sällsynthet** (som Balatro): Vanlig 70 %, Ovanlig 25 %, Sällsynt 5 % i butiken. Legendariska kommer bara från Ekot *Själen*. Fördelning: 63 vanliga, 61 ovanliga, 20 sällsynta, 6 legendariska.

**Exempel på byggen ("sjuka kombinationer"):**

- **Dödens krona:** Förbannade kronan (💀 är vild) + Benflöjten (+3 Mult per 💀) + Baronen (×1.5 per kvarliggande 💀) + Eihwaz-ristningar som gör runor till 💀. Varje 💀 blir både joker i mönstren och en multiplikator när den ligger kvar.
- **Åskstormen:** Överspänningen (Överladdad ×3) + Alkemisten (reaktioner triggas två gånger) + Ledaren (katalysatorer räknas diagonalt). En ⚡ mitt i en klunga mönster ger ×9 per mönster.
- **Lavinen:** Lavinen + Dominobrickan + Brokiga väven + Kaskaden: bygg en monolit med Lägg-drag och få 10+ mönster i ett enda kast.
- **Solspegeln:** Sollinsen (☀️ kopierar grannen) + Solstenen + Maskerna (☀️ triggas igen) + Solkonungen.
- **Tomhetsmaskinen:** Tomhetsstenen + Plasket (alla placerade runor poängsätts och förbrukas) + Avtrycket till höger om Tomhetsstenen.

## 4. Väktare, märken, förbättringar

- **18 väktare + 4 slutväktare** som utmanar altaret: Muren (mitten blockerad), Spegeln (inga diagonaler), Virveln (altaret roteras), Tornet (runorna faller nedåt), Glöden (allt som inte poängsätts bränns), Ögat, Munnen, Nålen, Kroken, Purpurkärlet …
- **7 märken** när du hoppar över en prövning (gratis paket, rabatt, pengar, gratis relik).
- **13 altarförbättringar** (+1 kast, +1 byte, +1 relikfack, ränta, rabatt …).
- **13 paket:** runor, ristningar, stjärnbilder, reliker och ekon i normal, stor och jättestorlek.

## 5. Balans

Testerna (`node rune/test/run.js`) låter en girig bot spela 60 omgångar med och utan reliker. Boten placerar runor där de ger mest just nu (även två runor åt gången), använder Lägg för att förbereda och köper reliker slumpmässigt.

- Utan reliker når boten i snitt cirkel 4 och aldrig längre än cirkel 6.
- Med slumpmässiga reliker når den i snitt cirkel 4–5 och vinner ibland.

En människa som bygger synergier och planerar Lägg-drag ska alltså kunna vinna, men inte utan reliker. Eftersom flera mönster per kast och kedjor ger högre grundpoäng än Balatros pokerhänder är målkurvan brantare än i Balatro:

| Cirkel | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Lärlingens prövning | 300 | 900 | 2 600 | 7 000 | 17 000 | 40 000 | 90 000 | 200 000 |

Mästarens prövning är ×1.5 och Väktarens ×2 (Bergväggen ×4, Purpurkärlet ×6, Nålen ×1). Efter cirkel 8 ökar målet ×3.2 per cirkel i oändligt läge.

## 6. Alla 150 reliker

Kolumnen *Balatro* visar närmaste motsvarighet; *(ny)* betyder en relik som bara finns i Rune. Listan genereras från spelets data med `node rune/test/gen-plan.js`.

<!-- RELIKER:START -->
### Grund (13)

| # | Relik | Sällsynthet | Pris | Effekt | Balatro |
|---|---|---|---|---|---|
| 1 | 🪨 **Runsten** | Vanlig | $2 | +4 Mult. | Joker |
| 2 | 💍 **Samlarsten** | Vanlig | $4 | +3 Mult för varje relik du har. | Abstract Joker |
| 3 | 🎲 **Feltrycket** | Vanlig | $4 | +0 till +23 Mult, slumpas varje kast. | Misprint |
| 4 | 🚩 **Fanan** | Vanlig | $5 | +30 Chips för varje byte du har kvar. | Banner |
| 5 | 🏔️ **Bergstoppen** | Vanlig | $5 | +15 Mult om du har 0 byten kvar. | Mystic Summit |
| 6 | 🌗 **Halvmånen** | Vanlig | $5 | +20 Mult om du placerar 3 eller färre runor. | Half Joker |
| 7 | 🤸 **Akrobaten** | Ovanlig | $6 | ×3 Mult på prövningens sista kast. | Acrobat |
| 8 | 🌅 **Gryningen** | Ovanlig | $6 | ×2 Mult på prövningens första kast. | (ny) |
| 9 | ✂️ **Schablonen** | Ovanlig | $8 | ×1 Mult för varje tomt relikfack (Schablonen räknas som tom). | Joker Stencil |
| 10 | 🏴‍☠️ **Pirathatten** | Vanlig | $4 | Lägger till säljvärdet av alla andra reliker som Mult. | Swashbuckler |
| 11 | 🐂 **Tjuren** | Ovanlig | $6 | +2 Chips för varje $ du har. | Bull |
| 12 | 👢 **Stövelremmen** | Ovanlig | $7 | +2 Mult för varje $5 du har. | Bootstraps |
| 13 | 🧱 **Stenmuren** | Ovanlig | $6 | +25 Chips för varje Sten-runa i påsen. | Stone Joker |

### Element (17)

| # | Relik | Sällsynthet | Pris | Effekt | Balatro |
|---|---|---|---|---|---|
| 14 | 🌤️ **Solstenen** | Vanlig | $5 | Varje poängsatt ☀️ ger +3 Mult. | Greedy Joker |
| 15 | 🧯 **Glödkolet** | Vanlig | $5 | Varje poängsatt 🔥 ger +3 Mult. | Lusty Joker |
| 16 | 🥈 **Månsilvret** | Vanlig | $5 | Varje poängsatt 🌙 ger +3 Mult. | Wrathful Joker |
| 17 | 🦴 **Benflöjten** | Vanlig | $5 | Varje poängsatt 💀 ger +3 Mult. | Gluttonous Joker |
| 18 | 🫚 **Rotknutan** | Vanlig | $5 | Varje poängsatt 🌿 ger +3 Mult. | (ny) |
| 19 | 🪄 **Åskstaven** | Vanlig | $5 | Varje poängsatt ⚡ ger +3 Mult. | (ny) |
| 20 | 🔺 **Prismat** | Vanlig | $5 | Varje poängsatt 💎 ger +3 Mult. | (ny) |
| 21 | 🏮 **Ljuslyktan** | Ovanlig | $7 | Varje poängsatt ☀️ ger +50 Chips. | Arrowhead |
| 22 | 🩸 **Glödstenen** | Ovanlig | $7 | Varje poängsatt 🔥 har 1 på 2 chans att ge ×1.5 Mult. | Bloodstone |
| 23 | 🦪 **Tidpärlan** | Ovanlig | $7 | Varje poängsatt 🌙 ger $1. | Rough Gem |
| 24 | ⚱️ **Gravurnan** | Ovanlig | $7 | Varje poängsatt 💀 ger +7 Mult. | Onyx Agate |
| 25 | 💠 **Kristallkronan** | Ovanlig | $7 | Varje 💎 som ligger kvar på brädet ger ×1.25 Mult. | Baron (svagare) |
| 26 | 👁️ **Nattens öga** | Vanlig | $5 | Varje 🌙 som ligger kvar på brädet ger +13 Mult. | Shoot the Moon |
| 27 | 💼 **Visitkortet** | Vanlig | $4 | Varje poängsatt 💀 har 1 på 2 chans att ge $2. | Business Card |
| 28 | 🪴 **Blomkrukan** | Ovanlig | $6 | ×3 Mult om kastet poängsätter minst 4 olika symboler. | Flower Pot |
| 29 | 🏺 **Urtidsrunan** | Sällsynt | $8 | Varje poängsatt [symbol] ger ×1.5 Mult. Symbolen byts efter varje prövning. | Ancient Joker |
| 30 | 🛐 **Idolen** | Ovanlig | $6 | Varje poängsatt [symbol] i [rad] ger ×2 Mult. Byts efter varje prövning. | The Idol |

### Mönster (19)

| # | Relik | Sällsynthet | Pris | Effekt | Balatro |
|---|---|---|---|---|---|
| 31 | 🔻 **Glada trefoten** | Vanlig | $3 | +8 Mult om kastet innehåller en Trio. | Jolly Joker |
| 32 | ↗️ **Snedsteget** | Vanlig | $4 | +10 Mult om kastet innehåller en Diagonal. | Zany Joker |
| 33 | 🟪 **Fyrkanten** | Vanlig | $4 | +10 Mult om kastet innehåller en Kvadrat. | Mad Joker |
| 34 | ☘️ **Fyrklövern** | Vanlig | $4 | +12 Mult om kastet innehåller en Kvartett. | Crazy Joker |
| 35 | 🪶 **Regnbågsfjädern** | Vanlig | $4 | +12 Mult om kastet innehåller en Regnbåge. | Droll Joker |
| 36 | 🪞 **Spegelskärvan** | Vanlig | $4 | +12 Mult om kastet innehåller en Spegel. | (ny) |
| 37 | ⚔️ **Korsriddaren** | Vanlig | $5 | +16 Mult om kastet innehåller ett Kors. | (ny) |
| 38 | 📏 **Linjalen** | Vanlig | $5 | +18 Mult om kastet innehåller en Full linje. | (ny) |
| 39 | 😇 **Glorian** | Vanlig | $5 | +25 Mult om kastet innehåller en Ring. | (ny) |
| 40 | 🔨 **Stenhuggaren** | Vanlig | $5 | +30 Mult om kastet innehåller en Monolit. | (ny) |
| 41 | 🪵 **Trästaven** | Vanlig | $4 | +50 Chips om kastet innehåller en Trio. | Sly Joker |
| 42 | 🟫 **Tegelstenen** | Vanlig | $4 | +80 Chips om kastet innehåller en Kvadrat. | Clever Joker |
| 43 | 🐾 **Fyrfoten** | Vanlig | $4 | +100 Chips om kastet innehåller en Kvartett. | Devious Joker |
| 44 | 🔱 **Trefaldigheten** | Sällsynt | $8 | ×2 Mult om kastet innehåller en Trio. | The Duo |
| 45 | 👒 **Snedkrönet** | Sällsynt | $8 | ×2.5 Mult om kastet innehåller en Diagonal. | The Trio |
| 46 | 🏯 **Kubtornet** | Sällsynt | $8 | ×2.5 Mult om kastet innehåller en Kvadrat. | The Family |
| 47 | 🗼 **Fyrtornet** | Sällsynt | $8 | ×3 Mult om kastet innehåller en Kvartett. | The Order |
| 48 | 🌈 **Prismakronan** | Sällsynt | $8 | ×3 Mult om kastet innehåller en Regnbåge. | The Tribe |
| 49 | 👯 **Spegeltvillingarna** | Sällsynt | $8 | ×3 Mult om kastet innehåller en Spegel. | (ny) |

### Kedjor (7)

| # | Relik | Sällsynthet | Pris | Effekt | Balatro |
|---|---|---|---|---|---|
| 50 | ⛓️ **Kedjelänken** | Vanlig | $4 | +5 Mult för varje mönster i kastet utöver det första. | (ny) |
| 51 | 🁣 **Dominobrickan** | Ovanlig | $6 | ×1.25 Mult för varje mönster i kastet utöver det första. | (ny) |
| 52 | ❄️ **Lavinen** | Sällsynt | $8 | Kedjebonusen fördubblas: ×0.5 Mult per extra mönster i stället för ×0.25. | (ny) |
| 53 | 🔔 **Ekot** | Ovanlig | $6 | Om kastet har 3 eller fler mönster triggas runorna i det första mönstret en extra gång. | (ny) |
| 54 | 💧 **Kaskaden** | Ovanlig | $6 | Får +2 Mult permanent varje gång ett kast har 3 eller fler mönster. | (ny, skalande) |
| 55 | 🐺 **Ensamvargen** | Vanlig | $4 | +15 Mult om kastet har exakt ett mönster. | (ny) |
| 56 | 🧶 **Brokiga väven** | Ovanlig | $6 | ×2 Mult om kastet innehåller minst 3 olika mönstertyper. | (ny) |

### Reaktioner (11)

| # | Relik | Sällsynthet | Pris | Effekt | Balatro |
|---|---|---|---|---|---|
| 57 | 🔋 **Överspänningen** | Sällsynt | $8 | Överladdad (⚡ intill ett mönster) ger ×3 Mult i stället för ×1.5. | (ny) |
| 58 | ⚒️ **Smedjan** | Ovanlig | $6 | Brinnande (🔥 intill ett mönster) ger +20 Mult i stället för +6. | (ny) |
| 59 | 🪚 **Slipstenen** | Ovanlig | $6 | Förstärkt (💎 intill ett mönster) ger +150 Chips i stället för +40. | (ny) |
| 60 | 🌱 **Grönskan** | Vanlig | $5 | Växande (🌿 intill ett mönster) ger +30 Chips per runa i stället för +10. | (ny) |
| 61 | 🕶️ **Solglasögonen** | Sällsynt | $8 | Upplyst (☀️ intill ett mönster) triggar mönstrets runor 2 extra gånger i stället för 1. | (ny) |
| 62 | 🌊 **Tidvattnet** | Ovanlig | $6 | Månbelyst (🌙 intill ett mönster) ger $3 i stället för $1. | (ny) |
| 63 | 🗡️ **Offerkniven** | Ovanlig | $6 | Förbannad (💀 intill ett mönster) ger ×3 Mult i stället för ×2. | (ny) |
| 64 | ⚗️ **Alkemisten** | Sällsynt | $9 | Alla reaktioner triggas två gånger. | (ny) |
| 65 | ☢️ **Reaktorn** | Ovanlig | $7 | Får +1 Mult permanent för varje reaktion som triggas. | (ny, skalande) |
| 66 | 🧲 **Ledaren** | Vanlig | $5 | Katalysatorer räknas även när de ligger diagonalt intill ett mönster. | (ny) |
| 67 | 🧪 **Katalysatorn** | Ovanlig | $6 | +15 Chips och +3 Mult för varje reaktion i kastet. | (ny) |

### Position (10)

| # | Relik | Sällsynthet | Pris | Effekt | Balatro |
|---|---|---|---|---|---|
| 68 | 📐 **Hörnstenen** | Vanlig | $5 | Poängsatta runor i hörnen ger +8 Mult. | (ny) |
| 69 | ❤️‍🔥 **Hjärtstenen** | Ovanlig | $6 | En poängsatt runa i mittenrutan ger ×2 Mult. | (ny) |
| 70 | 🛡️ **Kantvakten** | Vanlig | $4 | Poängsatta runor på ytterkanten ger +15 Chips. | (ny) |
| 71 | 🎯 **Kärnan** | Vanlig | $4 | Poängsatta runor i den inre 3×3-rutan ger +2 Mult. | (ny) |
| 72 | 🌄 **Horisonten** | Vanlig | $4 | Vågräta linjemönster ger +10 Mult. | (ny) |
| 73 | ⚓ **Lodet** | Vanlig | $4 | Lodräta linjemönster ger +10 Mult. | (ny) |
| 74 | 🌌 **Himlavalvet** | Vanlig | $4 | Poängsatta runor i översta raden ger +5 Mult. | (ny) |
| 75 | 🧭 **Kompassen** | Ovanlig | $6 | ×3 Mult om alla fyra hörnen är fyllda när du kastar. | (ny) |
| 76 | 🏝️ **Eremiten** | Ovanlig | $6 | +6 Mult för varje runa på brädet som inte har någon granne. | (ny) |
| 77 | 🕳️ **Tomrummet** | Vanlig | $5 | +2 Mult för varje tom ruta på brädet när du kastar. | (ny) |

### Brädet (4)

| # | Relik | Sällsynthet | Pris | Effekt | Balatro |
|---|---|---|---|---|---|
| 78 | 🫀 **Stenhjärtat** | Vanlig | $5 | +2 Mult för varje runa som ligger kvar på brädet utan att poängsättas. | Raised Fist (förenklad) |
| 79 | 🪣 **Murbruket** | Vanlig | $4 | +10 Chips för varje runa som ligger kvar på brädet utan att poängsättas. | (ny) |
| 80 | 🤡 **Skuggspelaren** | Ovanlig | $5 | Kvarliggande runors effekter triggas en extra gång. | Mime |
| 81 | 🎩 **Baronen** | Sällsynt | $8 | Varje 💀 som ligger kvar på brädet ger ×1.5 Mult. | Baron |

### Skalning (22)

| # | Relik | Sällsynthet | Pris | Effekt | Balatro |
|---|---|---|---|---|---|
| 82 | 🚶 **Vandraren** | Vanlig | $5 | +1 Mult för varje kast i följd utan Trio. Nollställs av en Trio. | Ride the Bus |
| 83 | 🐸 **Grodan** | Vanlig | $4 | +1 Mult per kast, −1 Mult per byte. | Green Joker |
| 84 | 🏃 **Löparen** | Vanlig | $5 | Får +15 Chips permanent när kastet innehåller en Kvartett. | Runner |
| 85 | 🍦 **Glassen** | Vanlig | $5 | +100 Chips. −5 Chips för varje kast. | Ice Cream |
| 86 | 🥜 **Rostad mandel** | Vanlig | $5 | +20 Mult. −4 Mult efter varje klarad prövning. | Popcorn |
| 87 | 🔭 **Astrologen** | Ovanlig | $6 | Får ×0.1 Mult för varje Stjärnbild du använder. | Constellation |
| 88 | 📀 **Hologrammet** | Ovanlig | $7 | Får ×0.25 Mult för varje runa som läggs till i påsen. | Hologram |
| 89 | 🧛 **Vampyren** | Ovanlig | $7 | Får ×0.1 Mult för varje förtrollad runa som poängsätts, och suger ut förtrollningen. | Vampire |
| 90 | 🏕️ **Lägerelden** | Sällsynt | $9 | Får ×0.25 Mult för varje sak du säljer. Nollställs när en Väktare besegras. | Campfire |
| 91 | 🐱 **Lyckokatten** | Ovanlig | $6 | Får ×0.25 Mult varje gång en Lycka-runa slår in. | Lucky Cat |
| 92 | 🔍 **Glasögat** | Ovanlig | $6 | Får ×0.75 Mult för varje Glas-runa som krossas. | Glass Joker |
| 93 | ⏪ **Tillbakablicken** | Ovanlig | $6 | ×0.25 Mult för varje prövning du hoppat över. | Throwback |
| 94 | 🔪 **Offerdolken** | Ovanlig | $6 | När en prövning väljs: förstör reliken till höger och få dubbla dess säljvärde som Mult permanent. | Ceremonial Dagger |
| 95 | 📸 **Blixtkortet** | Ovanlig | $6 | Får +2 Mult permanent för varje reroll i butiken. | Flash Card |
| 96 | 👖 **Reservfickan** | Ovanlig | $6 | Får +2 Mult permanent när kastet innehåller en Kvadrat. | Spare Trousers |
| 97 | 🧙 **Spåkvinnan** | Vanlig | $6 | +1 Mult för varje Ristning du använt den här omgången. | Fortune Teller |
| 98 | 🃏 **Falskspelaren** | Ovanlig | $6 | ×3 Mult om kastets första mönster redan spelats den här prövningen. | Card Sharp |
| 99 | 🥤 **Bubbelvattnet** | Ovanlig | $6 | Alla poängsatta runor triggas en extra gång under de kommande 10 kasten. | Seltzer |
| 100 | 🍌 **Bananen** | Vanlig | $5 | +15 Mult. 1 på 6 chans att förstöras efter varje prövning. | Gros Michel |
| 101 | 🌑 **Tomhetsstenen** | Sällsynt | $8 | Får +1 Mult permanent för varje runa som förstörs eller förbrukas i ett mönster. | (ny – Void Stone) |
| 102 | 🦯 **Vandringsstaven** | Ovanlig | $5 | Varje poängsatt runa får +5 Chips permanent. | Hiker |
| 103 | ⛏️ **Marmorbrottet** | Ovanlig | $6 | När en prövning väljs: lägg en Sten-runa i påsen. | Marble Joker |

### Ekonomi (11)

| # | Relik | Sällsynthet | Pris | Effekt | Balatro |
|---|---|---|---|---|---|
| 104 | 🪲 **Guldbaggen** | Vanlig | $6 | Ger $4 när prövningen klaras. | Golden Joker |
| 105 | 🥚 **Ägget** | Vanlig | $4 | Säljvärdet ökar med $3 efter varje prövning. | Egg |
| 106 | 🚀 **Raketen** | Ovanlig | $6 | Ger $1 när prövningen klaras. Utbetalningen ökar med $2 när en Väktare besegras. | Rocket |
| 107 | 🌕 **Till månen** | Ovanlig | $5 | $1 extra ränta för varje $5 du har när prövningen klaras. | To the Moon |
| 108 | ☁️ **Moln nio** | Ovanlig | $7 | Ger $1 för varje 💎 i påsen när prövningen klaras. | Cloud 9 |
| 109 | ⏳ **Fördröjd belöning** | Vanlig | $4 | Ger $2 per kvarvarande byte om du inte bytt något under prövningen. | Delayed Gratification |
| 110 | 😶 **Den ansiktslöse** | Vanlig | $4 | Ger $5 om du byter bort minst 3 ☀️ samtidigt. | Faceless Joker |
| 111 | 🎁 **Presentkortet** | Ovanlig | $6 | Efter varje prövning: +$1 säljvärde på alla reliker och förbrukningskort. | Gift Card |
| 112 | 🤑 **Midasmasken** | Ovanlig | $7 | Alla poängsatta ☀️ blir Guld-runor. | Midas Mask |
| 113 | 🎟️ **Gyllene biljetten** | Vanlig | $5 | Poängsatta Guld-runor ger $4. | Golden Ticket |
| 114 | 📝 **Att göra-listan** | Vanlig | $4 | Ger $4 om kastet innehåller [mönster]. Byts efter varje prövning. | To Do List |

### Omtriggning (5)

| # | Relik | Sällsynthet | Pris | Effekt | Balatro |
|---|---|---|---|---|---|
| 115 | 🪓 **Hackan** | Ovanlig | $6 | Poängsatta runor i hörnen triggas en extra gång. | Hack |
| 116 | 🌆 **Skymningen** | Ovanlig | $5 | Poängsatta runor triggas en extra gång på prövningens sista kast. | Dusk |
| 117 | 🎭 **Maskerna** | Ovanlig | $6 | Poängsatta ☀️ och 🌙 triggas en extra gång. | Sock and Buskin |
| 118 | 📎 **Hängande lappen** | Vanlig | $4 | Kastets första poängsatta runa triggas 2 extra gånger. | Hanging Chad |
| 119 | 🐚 **Ekokammaren** | Sällsynt | $8 | En poängsatt runa i mittenrutan triggas 3 extra gånger. | (ny) |

### Regler (18)

| # | Relik | Sällsynthet | Pris | Effekt | Balatro |
|---|---|---|---|---|---|
| 120 | 👑 **Förbannade kronan** | Sällsynt | $8 | Varje 💀 räknas som vilken symbol som helst. | (ny – Cursed Crown) |
| 121 | 🔎 **Sollinsen** | Ovanlig | $6 | ☀️ kopierar symbolen bredvid sig (vänster granne först, annars höger). | (ny – Solar Lens) |
| 122 | 🌉 **Bryggan** | Ovanlig | $6 | Linjer får hoppa över en tom ruta (🔥 · 🔥 🔥 är en Trio). | Shortcut |
| 123 | 🖌️ **Smetade paletten** | Ovanlig | $7 | ☀️, 🔥 och ⚡ räknas som samma symbol. 🌙, 💀 och 🌿 likaså. | Smeared Joker |
| 124 | 💦 **Plasket** | Vanlig | $3 | Alla runor du placerar poängsätts, även de som inte ingår i ett mönster. | Splash |
| 125 | 🦾 **Långa armen** | Ovanlig | $6 | Du får placera upp till 7 runor per kast i stället för 5. | Four Fingers (omvänd) |
| 126 | 🤹 **Jonglören** | Vanlig | $4 | +1 handstorlek. | Juggler |
| 127 | 🍺 **Fyllbulten** | Vanlig | $4 | +1 byte per prövning. | Drunkard |
| 128 | 🎻 **Trubaduren** | Ovanlig | $6 | +2 handstorlek, −1 kast per prövning. | Troubadour |
| 129 | 🦹 **Inbrottstjuven** | Ovanlig | $6 | +3 kast per prövning, men du har inga byten. | Burglar |
| 130 | 🎰 **Lyckohjulet** | Ovanlig | $4 | Fördubblar alla sannolikheter (1 på 4 blir 2 på 4). | Oops! All 6s |
| 131 | 🎪 **Gycklaren** | Ovanlig | $5 | Reliker och kort du redan har kan dyka upp igen. | Showman |
| 132 | 🧬 **Dubbelhelixen** | Sällsynt | $8 | Om prövningens första kast är en enda placerad runa: lägg en kopia av den i påsen och i handen. | DNA |
| 133 | 📨 **Sigillbrevet** | Ovanlig | $6 | När en prövning väljs: lägg en slumpad runa med sigill i handen (och påsen). | Certificate |
| 134 | 🎈 **Kaosclownen** | Vanlig | $4 | 1 gratis reroll i varje butik. | Chaos the Clown |
| 135 | 🧑‍🚀 **Astronomen** | Ovanlig | $8 | Stjärnbilder och Stjärnpaket i butiken är gratis. | Astronomer |
| 136 | 📘 **Avtrycket** | Sällsynt | $10 | Kopierar effekten av reliken till höger. | Blueprint |
| 137 | 🧠 **Tankestormen** | Sällsynt | $10 | Kopierar effekten av reliken längst till vänster. | Brainstorm |

### Skapande (7)

| # | Relik | Sällsynthet | Pris | Effekt | Balatro |
|---|---|---|---|---|---|
| 138 | 🎱 **Spådomskulan** | Vanlig | $5 | Varje poängsatt 🌙 har 1 på 4 chans att skapa en Ristning. | 8 Ball |
| 139 | 🌀 **Superpositionen** | Vanlig | $4 | Skapar en Ristning om kastet innehåller en Spegel. | Superposition |
| 140 | 🛸 **Rymdfararen** | Ovanlig | $6 | 1 på 4 chans att höja nivån på kastets första mönster. | Space Joker |
| 141 | 🪬 **Spåkortet** | Ovanlig | $6 | Skapar en Ristning när en prövning väljs. | Cartomancer |
| 142 | 🕯️ **Seansen** | Ovanlig | $6 | Skapar ett Eko om kastet innehåller en Full linje. | Séance |
| 143 | ♨️ **Brända runan** | Sällsynt | $8 | Prövningens första byte höjer nivån på ditt mest spelade mönster. | Burnt Joker |
| 144 | 🐀 **Packet** | Vanlig | $6 | När en prövning väljs: skapa 2 Vanliga reliker (om det finns plats). | Riff-Raff |

### Legendariska (6)

| # | Relik | Sällsynthet | Pris | Effekt | Balatro |
|---|---|---|---|---|---|
| 145 | 🌋 **Askkungen** | Legendarisk | $20 | Får ×1 Mult för varje runa som förstörs. | Canio |
| 146 | 🌞 **Solkonungen** | Legendarisk | $20 | Varje poängsatt ☀️ och 🌙 ger ×2 Mult. | Triboulet |
| 147 | 🪦 **Gravväktaren** | Legendarisk | $20 | Får ×1 Mult för var 23:e runa du byter bort. | Yorick |
| 148 | 🐦‍⬛ **Väktarbanan** | Legendarisk | $20 | Inaktiverar alla Väktares förmågor. | Chicot |
| 149 | 🪆 **Spegelvännen** | Legendarisk | $20 | När du lämnar butiken: skapa en Negativ kopia av ett slumpat förbrukningskort du har. | Perkeo |
| 150 | 🐍 **Ouroboros** | Legendarisk | $20 | Kedjebonusen blir ×2 Mult för varje mönster utöver det första. | (ny) |

<!-- RELIKER:END -->
