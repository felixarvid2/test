# ᚱ Rune

Ett runbaserat roguelike-symbolspel i Balatros anda. Placera runor (☀️ 🔥 🌙 💀 🌿 ⚡ 💎) på ett 5×5-altare, bilda mönster och hitta den sjuka kombinationen med 150 reliker.

Hela designen, med alla 150 reliker och deras effekter, finns i [docs/plan.md](docs/plan.md).

## Starta

Spelet är helt statiskt och behöver ingen installation eller internetuppkoppling.

- **Enklast:** öppna `index.html` i Chrome, Edge eller Firefox.
- **Eller via en lokal webbserver:** `npx http-server rune` och gå till `http://localhost:8080`.

Omgången sparas automatiskt i webbläsaren. Fungerar på mobil (stående eller liggande).

## Så spelar du

1. **Välj prövning.** Varje cirkel har tre prövningar: Lärlingens, Mästarens och Väktarens (som har en specialregel). Du kan hoppa över de två första och få ett märke.
2. **Placera runor.** Välj en runa i handen och klicka på en tom ruta, eller dra dit den. Upp till 5 runor per kast.
3. **Kasta.** Alla mönster som innehåller en nyplacerad runa poängsätts: **Chips × Mult**. Runorna i mönstren förbrukas.
4. **Lägg.** Bildar runorna inget mönster kan du lägga ut dem utan att ett kast går åt, för att förbereda något stort. Du drar då inga nya runor.
5. **Byt** runor i handen eller gamla runor på altaret.
6. **Butiken:** köp reliker, Ristningar, Stjärnbilder, paket och altarförbättringar.

Mönster: Trio, Diagonal, Kvadrat, Kvartett, Regnbåge, Spegel, Kors, Full linje, Ring och Monolit. Flera mönster i samma kast ger en **kedja**, och en runa med en annan symbol intill ett mönster ger en **reaktion** (🔥🔥🔥 + ⚡ = Överladdad eld).

| Tangent | Gör |
|---|---|
| Enter | Kasta / Lägg |
| D | Byt |
| Z | Ta tillbaka placerade runor |
| H | Tips (föreslår ett drag) |
| 1–9 | Välj runa i handen |

## Filer

| Fil | Innehåll |
|---|---|
| `js/core.js` | Symboler, mönster, förtrollningar, slump |
| `js/patterns.js` | Hittar mönster på altaret |
| `js/relics.js` | Alla 150 reliker |
| `js/items.js` | Ristningar, Stjärnbilder, Ekon, väktare, märken, paket, altarförbättringar |
| `js/score.js` | Poängräkningen och händelserna som animeras |
| `js/game.js` | Spelets tillstånd: prövningar, kast, butik, sparning |
| `js/bot.js` | Bot för tester och tipsknappen |
| `js/ui.js`, `js/audio.js` | Gränssnitt, animation och syntetiserade ljud |

## Tester

```
node rune/test/run.js        # mönster, exakta poäng, alla reliker/kort/väktare, spara/ladda, balans
node rune/test/gen-plan.js   # uppdaterar relik-listan i docs/plan.md från speldatan
```

`RUNS=100 node rune/test/run.js` låter boten spela fler omgångar för balansmätningen.
