# KRYPTA – roguelike-FPS

Ett raycaster-FPS i Doom/Quake 1-stil som är en roguelike: varje runda är fem slumpade våningar och
en boss längst ner. Öppna `index.html` via en lokal webbserver (`python3 -m http.server` i den här
mappen) och klicka **NY RUNDA**.

**Kontroller:** WASD gå · mus sikta · vänsterklick skjut · högerklick sikta med vapnet · R ladda om ·
E öppna dörr, kista, hemlig vägg eller handla · Shift spring · 1–4/Q/mushjul byt vapen · C dina kort ·
M/Tab karta · P/Esc paus · `[` `]` muskänslighet · `,` `.` synfält · `-` `+` volym · N ljud av · O helskärm.

**Mobil (liggande läge):** vänster tumme styr en flytande joystick (dra långt för att springa), höger tumme drar för att vrida. Den stora knappen skjuter, och man kan dra på den för att sikta samtidigt. Knapparna vid sidan av bilden siktar, laddar om, använder, byter vapen och öppnar karta, kort och paus. Knapparna kommer från Kenneys *Mobile Controls* (CC0, `assets/touch/`).

## Roguelike

- **Genererade våningar** (`js/gen.js`, `js/rng.js`): rum och korridorer med minimalt uppspännande träd och slingor, dörrar, hemliga rum, skattrum med kortkista, butiksrum, elitfiender och eldfat. Storleken och fienderna ökar med djupet, och temat (väggar, golv, dimma, namn) varierar.
- **Frö och dagens runda**: samma frö ger samma våningar. Fröet visas i pausen och efter rundan, och kan skrivas in på startskärmen. *Dagens runda* har samma frö för alla under dagen.
- **Kort** (`js/cards.js`, `js/cardui.js`): 50 kort i fyra sällsyntheter (vanlig, ovanlig, sällsynt, legendarisk). Korten ger permanenta bonusar under rundan, till exempel skada, eldhastighet, krit, genomslag, explosioner, brand, livsstöld, sköld, extraliv, magnet och rabatt. Fem förbannade kort ger en stark fördel med en nackdel. Det finns synergier, som eld + explosion och krit + kritskada.
- **Var korten kommer ifrån**: ett startkort (1 av 3), ett kort efter varje våning (1 av 3, eller hoppa över för guld), kortkistor och butiken.
- **Guld och butik**: fiender, krukor och guldhögar ger guld. Dödgrävaren på våning 2 och 4 säljer kort, hälsa, rustning, ammunition och nya kort.
- **Elitfiender**: större, färgade fiender med livmätare och en egenskap (snabb, seg, blodtörstig, explosiv eller brutal). De tappar mer guld.
- **Bossen Bendemonen** på våning 6 har tre faser. Den sprutar eldfläktar och slår med vingarna. Från fas 2 kallar den på skelett och skjuter en ring av eldklot efter slaget, och fas 3 är snabbare. Den har en livmätare och en dödsanimation, och grinden till utgången öppnas när den dör.
- **Permadöd**: döden avslutar rundan och den sparade rundan raderas. *Fortsätt* finns bara för en runda som pågår och laddar början av den senaste våningen.
- **Själar och upplåsningar**: varje runda ger själar efter hur långt man kom, och mer på svår nivå. Med dem låser man upp 17 kort på startskärmen. Profilen sparar rundor, segrar, bästa våning och rekord.
- **Spelkänsla**: skadesiffror (gula vid krit), träffmarkör, brinnande och slöade fiender syns i färg, och fiender kan explodera i kedja.

## Skjutkänsla (efter `fps-shooter`-, `game-feel`- och `input-systems`-skillsen)

- **Lärbart rekylmönster:** varje automatvapen rycker i samma sidomönster under en salva, och hagelgevär och pistol knycker uppåt. Siktet återhämtar sig mot där du siktade, och första skottet går exakt dit hårkorset pekar.
- **Avståndsfall:** skadan är full på nära håll och sjunker till ett golv på långt håll, så att pistolen inte prickskjuter över hela banan.
- **Träffstopp:** tiden står nästan still ett ögonblick vid dödande träff, krit, elit och bossens fasbyten.
- **Skärmskak:** skakningen bygger på trauma² och mjuka svängningar i stället för slumpbrus, så små träffar knappt märks medan stora slår till.
- **Reaktionstid:** fiender väntar 0,35–0,8 s efter att de upptäckt dig innan de anfaller första gången.
- **Siktstöd på pekskärm:** kulan dras lätt mot en synlig fiende nära hårkorset, och vridningen saktar in när hårkorset ligger över en fiende.
- **Synfält och känslighet:** båda kan ställas in med reglage på startskärmen, `,` `.` och `[` `]` i spelet, och sparas.

Testerna körs med `node tools/gen-test.js` (300 våningar och 50 bossarenor) och `node tools/cards-test.js`.
`tools/cards-demo.html` visar kortgränssnittet fristående.

## Grundspelet (version 2)

De handgjorda banorna, banomstarten och det gamla sparade framsteget har ersatts av roguelike-systemen ovan.

Vapen och känsla
1. Vapnen sticker rakt fram från skärmens nederkant som i Doom och Quake 1, utan händer. De är renderade ur RetroWeaponPack.
2. Paketets egna skjutanimationer för slide och pump, plus en rekylknyck.
3. Magasin och omladdning (R): vapnet sänks ur bild och kommer upp igen.
4. Hagelgeväret laddas en patron i taget, och man kan avbryta omladdningen genom att skjuta.
5. Automatisk omladdning när magasinet tar slut.
6. Torrt klick när magasinet är tomt.
7. Vid vapenbyte sänks det gamla vapnet och det nya höjs upp.
8. Sikta med höger musknapp: vapnet flyttas in mot mitten, lätt zoom, mindre spridning och långsammare rörelse.
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
49. Karta (M/Tab) som bara visar utforskade rutor, föremål och utgång.
50. Inställbar muskänslighet och volym som sparas.
51. Helskärm (O).
52. Upp till tre meddelanden visas samtidigt.
53. Positionsljud i stereo som dämpas bakom väggar.
54. Fotsteg i takt med farten.

## Assets som används

| Vad | Källa |
|---|---|
| Förstapersonsvapen (pistol, hagelgevär, gevär, kpist) med skjutanimationer | release `assets-large-v1` → `RetroWeaponPack_V1.zip`, renderade med `tools/weapon-frames` |
| Mynningsflamma | `RetroWeaponPack_V1.zip` → `FX/Textures/MuzzleFlash.png` |
| Väggar, dörrar, golv, tak | `assets/textures/retro-textures-fantasy` (Kenney, CC0) |
| Skelett, eldskelett, vampyr | `assets/2d-pixel/Enemy_Animations_Set` |
| Krukor och skärvor | `assets/2d-pixel/20.05b - Breakable Pots 1.1a` |
| Eld, eldklot, kulnedslag | `assets/effects/Free Pixel Effects Pack` (public domain) |
| Blod | `assets/effects/splat-pack` (Kenney, CC0) |
| Ammolåda | `assets/3d-models/Styloo Guns Asset Pack` (renderad till sprite) |
| Hälsa och rustning | `assets/2d-sprites/potions` |
| Ljud | `assets/audio/400 Sounds Pack` och release `assets-large-v1` → `Horror.SFX.Free.zip` |
| Boss: vingad demon | `assets/2d-pixel/Legacy Collection/.../Gothicvania/Characters/demon-Files` (Ansimuz, CC0) |
| Köpman (liemannen) | `assets/2d-pixel/Legacy Collection/.../Gothicvania/Characters/death` (CC0) |
| Kistor och mynt | `assets/2d-pixel/2D Pixel Dungeon Asset Pack v2.0` |
| Kortbilder och kortbaksida | `assets/rune-ai/flux/relics` och `card-backs` |
| Mobilknappar och joystick | Kenney *Mobile Controls* 1.0 (CC0), hämtad från kenney.nl |
| Typsnitt | Press Start 2P (OFL) |

Se licensfilerna i respektive källpaket.
