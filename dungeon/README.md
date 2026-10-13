# Facklans Djup

Ett dungeon-roguelike i webbläsaren. Åtta våningar, rutnätsbaserad turordning, permadeath.
Grafik: Kenneys *Tiny Dungeon*, ljud: Kenneys *RPG Audio* (båda CC0, se `assets/tiny-dungeon/License.txt`).

## Starta

Öppna `index.html` i en webbläsare, eller kör `npx http-server dungeon`.

| Tangent | Gör |
|---|---|
| Pilar / WASD | Gå och attackera (gå in i fiender) |
| Mellanslag | Vänta en tur |
| T | Släck / tänd facklan |
| M | Ljud av/på |

På mobil finns en knappsats, och man kan svepa över spelplanen.

## Vad som gör det unikt

1. **Facklan är din klocka.** Den brinner ner för varje steg. Ljusradien krymper (7 → 5 → 3 → 1 rutor), och när den är slut biter mörkret och skuggor spawnar. Olja och trappor fyller på den.
2. **Smyg i mörkret.** Släck facklan (T): du ser nästan ingenting men väcker inte heller monstren, och facklan brinner inte. Monster syns bara i ljuset.
3. **Fallna hjältar.** När du dör sparas hjälten (i `localStorage`). På samma våning ligger graven nästa gång, bevakad av hjältens spöke. Besegra spöket och gräv upp vapen, sköld, olja och läkedryck.

## Test

```
node dungeon/test/sim.js
```

Kör 300 slumpade omgångar med en enkel bot och kontrollerar bl.a. att trappan alltid är nåbar och att inget monster hamnar i en vägg.
