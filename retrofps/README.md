# KRYPTA – retro-FPS

Ett raycaster-FPS (Wolfenstein/Doom-känsla) som körs direkt i webbläsaren. Öppna `index.html` via en lokal
webbserver (`python3 -m http.server` i den här mappen) och klicka **NYTT SPEL**. Fyra banor, fyra vapen,
tre fiendetyper, hemliga rum och sparat framsteg.

**Kontroller:** WASD gå · mus sikta · vänsterklick skjut · högerklick sikta med vapnet · R ladda om ·
E/mellanslag öppna dörr eller hemlig vägg · Shift spring · 1–4/Q/mushjul byt vapen · M/Tab karta ·
P/Esc paus · `[` `]` muskänslighet · `-` `+` volym · N ljud av · O helskärm.

## Förbättringar i version 2

Vapen och känsla
1. Vapnen hålls av riktiga förstapersonsarmar ur RetroWeaponPack: höger hand på greppet, vänster hand på framstocken eller pumpen, pistolen med två händer.
2. Paketets egna skjutanimationer: rekyl, slide och pump.
3. Magasin och omladdning (R) med paketets omladdningsanimationer.
4. Hagelgeväret laddas en patron i taget, och man kan avbryta omladdningen genom att skjuta.
5. Automatisk omladdning när magasinet tar slut.
6. Torrt klick när magasinet är tomt.
7. Vapenbyte stoppar undan det gamla vapnet och drar fram det nya (paketets Draw-animation).
8. Sikta med höger musknapp: paketets siktpose, lätt zoom, mindre spridning och långsammare rörelse.
9. Mynningsflamman sitter vid vapnets verkliga mynning i varje bildruta.
10. Vapnet svajar efter musrörelser.
11. Vapnet gungar i takt med farten och lugnar sig mjukt när man stannar.
12. Vapnet ljussätts av platsen man står på och av mynningsblixten.
13. Tre ammotyper (9 mm, 5.56, patroner) med magasin/reserv i HUD:en.
14. Siktet vidgas när man rör sig och skjuter.
15. Träffmarkör vid träff, röd när fienden dör.
16. Kulnedslag på väggar med rikoschettljud.
17. Blodstänk vid träff.
18. Skärmskakning vid skott och när man tar skada.
19. Hagelgeväret gör mer skada på nära håll.

Fiender
20. Fiender hittar vägen runt hörn (avståndsfält från spelaren).
21. Fiender öppnar dörrar.
22. Eldskeletten kastar synliga eldklot som går att undvika.
23. Skottljud väcker fiender som kan nå dig, och fiender larmar varandra.
24. Fiender blinkar vitt när de träffas.
25. Döda fiender kan tappa ammunition eller hälsa.
26. Fiendernas sprites vänds efter rörelsen på skärmen och mot dig när de anfaller.
27. Man kan inte gå igenom fiender, och fiender klumpar inte ihop sig.
28. Närstridsattacker som missar hörs som ett svisch.

Världen
29. Eldfat med animerad eld som flimrande ljuskällor.
30. Ljuskarta: grundljus per bana, eldfat, mynningsblixtar, eldklot och ett svagt eget sken.
31. Dimma med egen färg per bana.
32. Krukor som går att skjuta sönder och som kan gömma föremål.
33. Hemliga väggar (E) med rustning, ammunition och hälsa bakom.
34. Rustning som tar halva skadan.
35. Ammolåda renderad från Styloo-paketet.
36. Ny bana 4: Kapellet.
37. Grinden öppnas av sig själv när sista fienden dör.
38. Dörrar går inte att stänga på någon.
39. Spelaren börjar varje bana vänd mot den öppnaste riktningen.

Spelare och gränssnitt
40. Mjuk acceleration och friktion.
41. Kameran gungar när man går och sjunker när man dör.
42. Röd markering visar varifrån skadan kom.
43. Pulserande röd kant och andning vid låg hälsa.
44. Paus med P/Esc, och automatiskt när fönstret tappar fokus eller musen släpps.
45. Svårighetsgrad (Lätt, Normal, Svår) på startskärmen.
46. Banstatistik efter varje bana: fiender, hemligheter, föremål, tid och bonus.
47. Sparat framsteg (Fortsätt) och rekord i webbläsaren.
48. Dör man börjar banan om med samma utrustning som när den startade.
49. Karta (M/Tab) som bara visar utforskade rutor, föremål och utgång.
50. Inställbar muskänslighet och volym som sparas.
51. Helskärm (O).
52. Upp till tre meddelanden visas samtidigt.
53. Positionsljud i stereo som dämpas bakom väggar.
54. Fotsteg i takt med farten.

## Assets som används

| Vad | Källa |
|---|---|
| Förstapersonsarmar och vapen (pistol, hagelgevär, gevär, kpist) med animationer | release `assets-large-v1` → `RetroWeaponPack_V1.zip`, renderade med `tools/weapon-frames` |
| Mynningsflamma | `RetroWeaponPack_V1.zip` → `FX/Textures/MuzzleFlash.png` |
| Väggar, dörrar, golv, tak | `assets/textures/retro-textures-fantasy` (Kenney, CC0) |
| Skelett, eldskelett, vampyr | `assets/2d-pixel/Enemy_Animations_Set` |
| Krukor och skärvor | `assets/2d-pixel/20.05b - Breakable Pots 1.1a` |
| Eld, eldklot, kulnedslag | `assets/effects/Free Pixel Effects Pack` (public domain) |
| Blod | `assets/effects/splat-pack` (Kenney, CC0) |
| Ammolåda | `assets/3d-models/Styloo Guns Asset Pack` (renderad till sprite) |
| Hälsa och rustning | `assets/2d-sprites/potions` |
| Ljud | `assets/audio/400 Sounds Pack` och release `assets-large-v1` → `Horror.SFX.Free.zip` |
| Typsnitt | Press Start 2P (OFL) |

Se licensfilerna i respektive källpaket.
