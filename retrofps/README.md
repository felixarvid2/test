# KRYPTA – roguelike-FPS

Ett raycaster-FPS i Doom/Quake 1-stil som är en roguelike: varje runda är fem slumpade våningar i sex biomer och
en boss längst ner. Tangenterna går att byta, och handkontroll och mobil stöds. Öppna `index.html` via en lokal webbserver (`python3 -m http.server` i den här
mappen) och klicka **NY RUNDA**.

**Kontroller:** WASD gå · mus sikta · vänsterklick skjut · högerklick sikta med vapnet · R ladda om ·
E öppna dörr, kista, hemlig vägg, använd föremål eller handla · Shift spring · 1–8/Q/mushjul byt vapen · C dina kort ·
M/Tab karta · V spark · Space hopp · Ctrl ducka · Z rusa · F granat · X inspektera · B kartmarkör · K fotoläge · F9 skärmbild · P/Esc paus (I inställningar, G ge upp, M karta) · Enter ny runda · `[` `]` muskänslighet · `,` `.` synfält · `-` `+` volym · N ljud av · O helskärm.

**Mobil:** vänster tumme styr en flytande joystick (dra långt för att springa), höger tumme drar för att vrida, och ett snabbt tryck i bilden skjuter. Den stora knappen skjuter så länge man håller den, och man kan dra på den för att sikta samtidigt. Liggande läge ger störst bild. I stående läge ligger bilden överst, och hela bilden är vrid- och skjutyta. Joysticken och knapparna ligger under bilden. Texter som "R = LADDA OM" och "E: HANDLA" byts mot pekvarianter. Knapparna vid sidan av bilden siktar, laddar om, använder, byter vapen och öppnar karta, kort och paus. Helskärmsknappen finns både på startskärmen och i spelet (också i pausen), och på Android vrids skärmen till liggande läge. Där webbläsaren eller appen inte tillåter helskärm, till exempel på iPhone, visas ett meddelande om det. Knapparna kommer från Kenneys *Mobile Controls* (CC0, `assets/touch/`).

## Roguelike

- **Genererade våningar i fem biomer** (`js/gen.js`, `js/rng.js`). Varje varv går igenom alla fem i slumpad ordning, och storleken och fienderna ökar med djupet.
  - *Kryptan* (inomhus): rum och korridorer med minimalt uppspännande träd och slingor, dörrar, hemliga rum, skattrum, butiksrum och elitrum. Sju teman med olika väggar, golv, dimma och namn.
  - *Grottorna*: cellautomat (45 % sten, fem utjämningar) och några slumpvandrare som gräver slingrande gångar. Flood fill behåller den största grottan och binder ihop resten med två rutor breda tunnlar. Droppstenar och lerfläckar.
  - *Kyrkogården* (utomhus, under natthimlen): ett öppet fält innanför en mur, med kapell, kryptor (med kista), gravkvarter med rader av gravstenar, grusgångar från ingången och döda träd där brusfunktionen säger det.
  - *Skogen* (utomhus): brus avgör var skogen är tät (trädridå) och var det är gläntor. En slingrande stig går från start till utgång, och en andra stig grenar av och går ihop med den igen, så det alltid finns en slinga. Gläntor med sidostigar och ibland en stuga med kista.
  - *Borggården* (delvis utomhus): en öppen gård under himlen omgiven av byggnadslängor med rum, dörrar och ibland en grind, med torn, pelare och ett centralt torn som skydd.
  - Gemensamt för alla: utgången hamnar längst bort från starten (räknat i gångavstånd), stora öppna ytor bryts upp med skydd, och varje föremål som blockerar kontrolleras så att det aldrig stänger av en väg. Generatorn tar 3–6 ms per våning.
  - Valet av metod bygger på en genomgång av rot.js, cellautomater, Brogue-liknande rumspåbyggnad, BSP, Wave Function Collapse, slumpvandring, brus/Voronoi och Herringbone Wang tiles. Egna algoritmer per biom passar en rutnätsraycaster bäst; rot.js hade gett ett extra beroende och en andra slumpgenerator utan utomhusbiomer.
- **Frö och dagens runda**: samma frö ger samma våningar. Fröet visas i pausen och efter rundan, och kan skrivas in på startskärmen. *Dagens runda* har samma frö för alla under dagen.
- **Kort** (`js/cards.js`, `js/cardui.js`): 100 vanliga kort (50 nya i version 4) i fyra sällsyntheter (vanlig, ovanlig, sällsynt, legendarisk). Korten ger permanenta bonusar under rundan, till exempel skada, eldhastighet, krit, genomslag, explosioner, brand, livsstöld, sköld, extraliv, magnet och rabatt. Fem förbannade kort ger en stark fördel med en nackdel. Det finns synergier, som eld + explosion och krit + kritskada.
- **Åtta vapen**: pistol, hagelgevär, gevär och kpist, samt
  - *dubbelbössa*: två pipor med tio hagel var och snabb omladdning av båda,
  - *armborst*: tyst (väcker inga fiender) och bulten går igenom alla,
  - *signalpistol*: skjuter ett bloss som sprängs och tänder eld,
  - *prickskyttegevär*: hög skada, går igenom två fiender, stark zoom och dålig träffsäkerhet från höften.

  Armborsten och signalpistolen har egen ammunition (pilar och bloss). Varje våning har ett nytt vapen i slumpad ordning; de två sista dyker upp i varv 2.
- **Vapenpakter** (åtta sällsynta kort, en per vapen): man svär sig till ett vapen resten av rundan. De andra vapnen försvinner, vapen man hittar blir ammo och 20 guld, all ammo blir vapnets egen och skadan ökar med 15 %. Pakten öppnar vapnets unika uppgraderingar, som bara dyker upp efter pakten men då ofta. Uppgraderingarna ändrar hur vapnet fungerar:
  - **Pistol:** *Studskulan* (träffen studsar till nästa fiende), *Hanefläkten* (håll in för att tömma magasinet i ett svep), *Sista kulan* (sista skottet gör 3× skada och exploderar), *Duellanten* (ovetande fiender dör av första träffen) och *Tomhylsan* (tomt magasin laddas om direkt).
  - **Hagelgevär:** *Drakanden* (varje hagel tänder eld), *Dubbelpipan* (två patroner per skott, dubbelt så många hagel), *Slagkraften* (nära fiender slungas bakåt och skadas mot väggen), *Splitterhaglet* (döda fiender sprängs och skadar grannarna) och *Snigeln* (siktar man skjuts en snigel som går igenom alla med 7× skada).
  - **Gevär:** *Kedjeblixten* (var fjärde träff hoppar till tre fiender), *Kalla blodet* (sikta en sekund så gör nästa skott 4× skada och går igenom; en ring runt hårkorset visar laddningen), *Kastmagasinet* (omladdningen kastar det gamla magasinet som en granat) och *Skarpskytten* (träffar på över 7 rutor är alltid kritiska).
  - **Kpist:** *Spinnpipan* (eldhastigheten växer till det dubbla medan man håller in), *Rikoschetten* (kulor studsar mot väggar), *Dödsmärket* (åttonde träffen på samma fiende detonerar) och *Blybältet* (ingen omladdning, skjuter direkt ur reserven).
  - **Dubbelbössa:** *Blodskörden* (varje dödad fiende ger 3 HP och en patron), *Dubbeldöden* (dödar ett skott två fiender laddas båda piporna direkt), *Kedjekulan* (tre tunga kulor som går igenom alla) och *Stormsteget* (skottet kastar dig bakåt och du är osårbar en kort stund).
  - **Armborst:** *Sprängspetsen* (pilen fastnar och sprängs efter 0,8 s), *Giftspetsen* (gift som sprids när fienden dör), *Pilsamlaren* (dödande pilar kommer tillbaka och läggs i direkt) och *Treskottet* (tre pilar i en solfjäder för priset av en).
  - **Signalpistol:** *Fyrverkeriet* (blosset spricker i fem brinnande gnistor), *Solblosset* (bländar fiender i 2 s), *Ekoblosset* (studsar mot väggar två gånger) och *Löpelden* (brinnande fiender som dör tänder eld på grannarna).
  - **Prickskyttegevär:** *Huvudjägaren* (ett dödande skott laddar om direkt och nästa gör dubbel skada), *Genomborraren* (kulan går igenom väggar upp till 2 rutor), *Tidsstoppet* (tiden går i halv fart när du siktar) och *Sprängkulan* (varje träff exploderar).
- **Fiender**: förutom skelett, eldskelett och vampyr finns sex sorter med eget beteende, och nya sorter dyker upp ju djupare man kommer. Första gången man möter en sort visas ett tips.
  - *Blodslem* (våning 1–): delar sig i två droppar när det dör.
  - *Smådjävul* (2–): sicksackar och hoppar åt sidan när den träffas.
  - *Orkshaman* (2–): helar och skyndar på fienderna runt sig och håller avstånd.
  - *Benmagiker* (3–): väcker skelett och skjuter lila klot som svänger efter dig.
  - *Gravrövare* (3–): nästan osynlig på avstånd och hugger hårdare i ryggen.
  - *Orkkrigare* (3–): rustning som tar 0,6 av varje träff (bra mot hagel och kpist, dåligt mot tunga skott). Den stormar fram och blir yr om den krockar i en vägg.
- **Var korten kommer ifrån**: ett startkort (1 av 3), ett kort efter varje våning (1 av 3, eller hoppa över för guld), kortkistor och butiken.
- **Portaler i stället för att gå tillbaka**: när våningens sista elitfiende dör öppnas en portal där den föll (finns ingen elit öppnas den när alla fiender är döda). Gå in i portalen för att gå vidare direkt, eller fortsätt utforska och gå in senare. Utgången finns kvar som förut.
- **Djupare varv**: efter Bendemonen öppnas en portal där man väljer att *gå djupare*, *avsluta rundan* som segrare eller *stanna kvar* och plocka upp guldet. Varv 2 är våning 7–12 med tuffare fiender och en Bendemon med 60 % mer hälsa, och så vidare. Djupare våningar ger fler själar.
- **Guld och butik**: fiender, krukor och guldhögar ger guld. Dödgrävaren på våning 2 och 4 i varje varv säljer kort, hälsa, rustning, ammunition och nya kort.
- **Elitfiender**: större, färgade fiender med livmätare och en egenskap (snabb, seg, blodtörstig, explosiv eller brutal). De tappar mer guld.
- **Fem bossar** med olika beteenden, en per varv i slumpad ordning (våning 6, 12 osv.). Alla har tre faser (under 2/3 och 1/3 hälsa), livmätare och dödsanimation, och var och en har en egen arena.
  - *Bendemonen* (tronsal): eldfläktar och vingslag. Kallar på skelett och skjuter eldringar från fas 2.
  - *Helvetesbesten* (grotta): eldklot och eldpelare som slår upp under spelaren efter en varning. Från fas 2 sjunker den ned i marken och dyker upp någon annanstans.
  - *Mardrömmen* (kyrkogård): cirklar och skjuter blå eld, stampar och stormar sedan fram med ett spår av blå eld. Krockar den i en vägg blir den yr. Två stormningar i rad från fas 2.
  - *Ogern* (skogsglänta): krossar marken så att en ring av stenar flyger ut och kastar block på håll. Kallar på orkkrigare i fas 2 och blir rasande i fas 3.
  - *Vålnaden* (kyrkogård): halvgenomskinlig och svävande, skjuter sökande klot, försvinner (och går då inte att skada) och dyker upp nära spelaren med ett skrik som saktar ned. Väcker skelett i fas 2.
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

Testerna körs med `node tools/gen-test.js` (alla biomer, slumpade biomer och alla bossarenor) och `node tools/cards-test.js`.
`node tools/gen-preview.js <biom|boss:arena|random> [frö] [djup]` skriver ut en våning som text, och `?biome=<id>` och `?boss=<id>` i adressen väljer biom och boss för test.
Fiendearken byggs med `tools/enemy-sprites/prep.py` och vapenkortens bilder med `tools/weapon-cards/make.py`.
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

## Version 3: biomer, väktarrum och 100 förbättringar

### Biomerna ser och låter olika
| Biom | Färgton och dimma | Väder och partiklar | Ljud | Fotsteg |
|---|---|---|---|---|
| Kryptan | varm, gulbrun | dammkorn i ljuset | dovt mullrande och viskningar | sten |
| Grottorna | kall, blågrön och tät dimma | droppar från taket, fladdermöss | droppande vatten | grus |
| Kyrkogården | blåaktig natt | markdimma, irrbloss och blixtar med åska och kyrkklockor | vind | grus och gräs |
| Skogen | grön | fallande löv och eldflugor | vind och grodor | gräs |
| Borggården | neutral | regn som skvätter | regn | sten och trä |

Varje biom har också egna föremål i rummen, till exempel kistor och kandelabrar i kryptan, kristaller och svampar i grottorna och bord och lådor i borggården.

### Rummen
- Inga rum är tomma, och inget rum har bara en fiende: varje rum utom startrummet har antingen minst två fiender eller något särskilt (brunn, altare, skatt, butik eller fälla).
- **Föremål** (`tools/props/make.py`):
  - *Kandelabrar, kristaller och svampar* lyser upp sin omgivning.
  - *Likkistor, benhögar, bokhyllor, statyer, burar, rustningar och bord* står i vägen och tar kulor.
  - En *helande brunn* ger 40 HP en gång.
  - Ett *förbannat altare* ger 60 guld och ett förbannat kort, om man vågar.
  - *Spikfällor* skjuter upp var tredje sekund. De klickar strax innan och skadar både dig och fienderna.
  - *Krutfat* exploderar när man skjuter på dem och kan sätta igång en kedjereaktion.
  - *Lådor* går sönder av skott och sparkar och kan innehålla ammo, hälsa, guld eller en rustningsskärva.
- **Mimics**: kistor med tänder. De ligger stilla tills man kommer nära, försöker öppna dem eller skjuter på dem.

### Väktarrum och bossrum
- **Väktaren**: varje vanlig våning har ett väktarrum. Där väntar en av de andra bossarna i mindre format, och rummet har väggar och golv som passar den bossen:
  - Bendemonen: blodröda tegelväggar med dödskallefris och ett blodigt golv.
  - Helvetesbesten: basalt med glödande lavasprickor.
  - Mardrömmen: blå runor bakom ett smidesstaket och ett jordgolv med blått sken.
  - Ogern: en timmerpalissad med dödskallar och djurhudar och ett golv av trampad lera.
  - Vålnaden: kall kapellsten med en blekt fresk och ett marmorgolv med blått sken.

  När väktaren vaknar slår dörrarna igen, bossmusiken börjar och väktarens egen livmätare visas. Väktaren har bossens anfall och faser. Besegrar man den öppnas dörrarna och portalen till nästa våning, och man får väktarens skatt (ett kortval) plus guld och själar.
- **Bossarenan** på våning 6, 12 och så vidare har samma texturer som sin boss.

### 100 förbättringar
**Strid och känsla**
1. Spark (V, eller E när det inte finns något att använda): knuffar fiender och slår sönder krukor och lådor.
2. Aktiv omladdning: tryck R igen i rätt ögonblick för en snabbare omladdning och +15 % skada på magasinet.
3. Missar man ögonblicket kärvar vapnet och omladdningen tar längre tid.
4. En omladdningsmätare under hårkorset visar ögonblicket.
5. Vapnets namn visas när man byter.
6. Q byter till förra vapnet.
7. Tomhylsor flyger ut och studsar.
8. Synfältet ger en liten stöt vid varje skott.
9. Vapnet gungar lätt i takt med andningen när man står still (kan stängas av).
10. Ett torrt klick när sista skottet går.
11. Ett tydligare ljud när man träffar och när man dödar.
12. Multikills (DUBBELT, TRIPPEL, FYRDUBBELT, MASSAKER) ger extra guld.
13. Fiendernas eldklot och klot går att skjuta ned.
14. Blodpölar blir kvar på golvet.
15. Större siffror vid kritiska träffar.
16. Varning när ammon håller på att ta slut.
17. Explosioner lyser upp rummet och skärmen blixtrar till.
18. Hårkorset blir rött över en fiende.
19. Träffar knuffar fiender bakåt.
20. Brinnande, förgiftade och frusna fiender har egna partiklar.

**Fiender**
21. Livmätare över skadade fiender.
22. Ett "!" när en fiende upptäcker dig.
23. Fiender flankerar i stället för att alla gå rakt mot dig.
24. Magiker och shamaner flyr när du kommer nära.
25. Brinnande fiender får panik och springer runt.
26. Ny elitegenskap: teleporterande.
27. Ny elitegenskap: läkande.
28. Ny elitegenskap: sköld som tar skadan först.
29. Från varv 2 kan eliter ha två egenskaper.
30. Eliter kan tappa ett kortval.
31. Bossen tappar ett bättre kortval (bossens skatt).
32. Bossintro med titel och slow motion.
33. Bossarna varnar innan sina stora anfall.
34. Egna dödsljud för varje fiendetyp.
35. Mimics.

**Världen**
36. Krukor kan innehålla en jackpott.
37. Rustningsskärvor (+10 rustning) i krukor och lådor.
38. Hälsa droppar oftare när du har lite HP kvar.
39. Ammolådor ger 50 % mer till vapnet du håller.
40. Kistorna blir bättre ju djupare du kommer.
41. Guld i närheten följer med när du går in i portalen.
42. Guldhögar glittrar.
43. Utgången och portalerna lyser.
44. Det drar damm vid hemliga väggar.
45. Eldfaten sprakar.
46. Dörrar öppnas när man går in i dem.
47. En kompasspil pekar mot portalen.
48. Helande brunnar.
49. Förbannade altaren.
50. Spikfällor.
51. Krutfat med kedjereaktioner.
52. Lådor som går sönder.
53. Lysande kandelabrar, kristaller och svampar.
54. Möbler och dekor: likkistor, benhögar, bokhyllor, statyer, burar, rustningar och bord.
55. Väktarrum med en miniboss på varje vanlig våning.

**Skärm och menyer**
56. Kartan har tre lägen: av, liten i hörnet eller stor (M/Tab eller kartknappen). Valet sparas.
57. Kartan visar fiender som syns och väktaren och bossen när man sett deras rum.
58. Kartan visar brunnar, altaren, krutfat och möbler i egna färger.
59. Aktiva effekter visas nere till vänster.
60. Hjärtslag hörs när hälsan är låg.
61. Mobilen vibrerar vid skada (kan stängas av).
62. Statistiken efter våningen visar hur mycket du utforskat, träffsäkerhet och skada du tagit.
63. En karta över varvet i statistiken visar var du är.
64. 21 tips mellan våningarna.
65. Sammanfattningen efter rundan visar favoritvapen och träffsäkerhet.
66. Ett stort titelkort med våningens namn och biom.
67. Pausen visar dina bonusar.
68. Profil med statistik för alla rundor.
69. FPS-räknare (val i inställningarna).
70. Bestiarium med alla fiender du dödat och bossar du besegrat.
71. 20 prestationer som ger 10 själar var.
72. Topp 5-lista.
73. Historik med biom och vad du dog av.
74. Väktarens egen livmätare och titel.
75. Enter startar en ny runda från startskärmen.

**Inställningar** (startskärmen, I i pausen eller kugghjulet på mobilen)
76. Skärmskakning: av, låg eller full.
77. Hårkorsets form: kors, punkt eller cirkel.
78. Hårkorsets färg.
79. Ljusstyrka.
80. Känslighet, synfält och volym på samma ställe.
81. Spelet pausas när fönstret tappar fokus eller fliken byts.
82. Minskade effekter (färre partiklar).
83. Vapnets gungning kan stängas av.
84. Vänsterhänt mobillayout och justerbar knappstorlek.
85. Inställningar och "ge upp" går att nå från pausen, också på mobilen.

**Progression**
86. Själaaltaret: fem bestående uppgraderingar köps med själar (mer HP, startguld, startammo, startrustning och ett extra val av startkort).
87. Ny svårighetsgrad: MARDRÖM.
88. Dagens runda har en dagens utmaning: Glaskanon, Guldfeber, Mörkret, De snabba döda eller Elitjakten.
89. Butiken: rensa bort ett kort ur leken.
90. Butiken: mysteriekort som är minst sällsynt.
91. Profilen räknar dödade fiender, speltid och dödade per vapen.
92. Varje besegrad boss räknas per typ.
93. Väktare och bossar ger själar.
94. Ge upp rundan (G i pausen) och behåll själarna.
95. Snabbhetsbonus: en våning på under 2 minuter ger 20 guld.
96. Orörd-bonus: en våning utan skada ger 40 guld.
97. Alla hemligheter på en våning ger 30 guld.
98. Prestationer ger själar.
99. Väktarens skatt: ett kortval.
100. Väktarrummets dörrar förseglas tills väktaren är besegrad, och sedan öppnas portalen.

## Version 4: 350 förbättringar

Den här versionen lägger till 350 förbättringar. Grafiken för de nya fienderna och föremålen ritas med `tools/props2/make.py`, ljuden och musiken byggs med `tools/sounds/make2.sh`, korten med `tools/card-art/make.py`, och bangeneratorn har en ny biom (Träsket) och nya rumstyper.

**Rörelse (1–15)**
1. Hopp (Space), E = använd
2. Ducka (Ctrl): lägre kamera, tystare steg och mindre mål för eldklot
3. Rusning (Z eller dubbeltryck på riktning) med kort osårbarhet
4. Uthållighet: spring och rusning drar uthållighet, mätare i HUD
5. Glidning: ducka under spring = glid
6. Kameran lutar vid sidosteg (inställning)
7. Explosioner knuffar spelaren
8. Halt på is
9. Långsammare i vatten och lera
10. Spindelnät saktar ned
11. Hoppa över spikfällor och lava
12. Synfältet vidgas när man springer
13. Kameran skakar till vid landning
14. Vapnet sänks när man springer
15. Hoppa över låga anfall (ogerns stenring, lavavågen, rullande stockar)

**Strid och vapen (16–50)**
16. Granater (F): kastas i båge, studsar och sprängs
17. Granater på våningarna, i krukor och i butiken
18. Håll F längre för att kasta längre
19. Kulhål i väggarna
20. Gnistor där kulor träffar väggar och dörrar
21. Spårljus för gevär och prickskyttegevär
22. Mynningsrök
23. Lik sprängs i bitar av explosioner
24. Överdöd sprängs i bitar
25. Blodstänk på väggar bakom träffade fiender
26. Bakhåll: +50 % skada på fiender som inte sett dig
27. Vapeninspektion (X)
28. Upplockad ammo, hälsa, rustning, guld och granater visas som flytande text
29. Byt automatiskt till ett nyss upplockat vapen (inställning)
30. Vapnet laddas om automatiskt efter en stund utan skott (inställning)
31. Kolvslag när allt ammo är slut
32. Smedjan: uppgradera vapnets skada (3 nivåer)
33. Vapennivån syns i HUD
34. Kritiska träffar har eget ljud
35. Fiender som träffas mitt i språnget snubblar
36. Explosioner lämnar sotfläckar
37. Signalpistolens bloss lämnar brinnande mark
38. Frusna fiender splittras när de dör
39. Kombomätare: snabba dödanden i följd ger mer guld
40. Slow motion när sista fienden på våningen dör
41. Ammolådor i tre storlekar
42. Hagelspridningen syns i siktet
43. Reservammon blinkar rött när den är slut
44. Låg HP: bilden gråas och ljudet dämpas
45. Frysning som ny statuseffekt (kort och fiender)
46. Gift som statuseffekt även från kort
47. Blixt som kedjar mellan fiender (kort)
48. Granater skadar inte dig själv på lätt
49. Granaten piper innan den smäller
50. Kulor genom krukor och lådor fortsätter (genomslag)

**Fiender (51–85)**
51. Spindel: snabb, skjuter nät som saktar ned
52. Fladdermussvärm: små och snabba, flyger i flock
53. Helvetshund: jagar i flock och hoppar
54. Bombskelett: springer fram och sprängs
55. Sköldbärare: blockerar skott framifrån
56. Svampman: släpper giftmoln
57. Levande rustning: rustningsställningar som vaknar
58. Patrullerande fiender
59. Sovande fiender (Zzz) som går att smyga förbi
60. Fiender hör dina fotsteg när du springer (gå eller ducka för att smyga)
61. Explosioner väcker sovande fiender
62. Vissa fiender viker undan när du siktar på dem
63. Skyttar siktar framför dig när du springer
64. Fiender flyr när de har lite HP kvar
65. Fiender springer från granater
66. Fiender saktas ned av vatten och nät (utom spindlar och fladdermöss)
67. Fiender undviker spikfällor, lava och eld
68. Fiender knuffas av explosioner
69. Champions: sällsynta gyllene fiender med mycket guld
70. Ny elitegenskap: delande
71. Ny elitegenskap: giftig (förgiftar dig vid träff)
72. Ny elitegenskap: frostaura
73. Ny elitegenskap: flimrande (svår att se)
74. Eliter har en glödande aura
75. Veteraner: fiender i djupare varv får färg och mer HP
76. Brända fiender blir aska
77. Fiender letar där de senast såg dig ("?")
78. Fiender som tappat dig ger upp efter ett tag
79. Fiendeskott glöder tydligare
80. Röd varningspil när en fiende anfaller bakifrån
81. Bombskelettens explosioner skadar även andra fiender
82. Fiendernas livmätare färgas av frysning, gift och brand
83. Bestiariet visar fiendens bild
84. Bestiariet visar fiendens HP, skada och fart
85. Fiender ger ifrån sig ljud när de är nära (andning, fotsteg)

**Bossar och väktare (86–105)**
86. Bendemonen: meteorregn
87. Bendemonen: dykanfall
88. Helvetesbesten: lavavåg som man hoppar över
89. Helvetesbesten: studsande magmabollar
90. Mardrömmen: skuggkloner
91. Mardrömmen: mörkret – ljuset slocknar en stund
92. Ogern: stenar faller från taket med skuggor som varning
93. Ogern: rullande stockar
94. Vålnaden: spegelbilder
95. Vålnaden: jagande dödskallar
96. Bossar blir yra (stagger) efter många träffar i följd
97. Bossens livmätare visar fasgränser
98. Bossen hånar dig
99. Väktaren tappar en relik med mycket bättre kortval från varv 2
100. Bossens livmätare visar skadan i en fördröjd stapel
101. Bossarenan mörknar och tänds i fas 3
102. Bossmusiken växer i intensitet med fasen
103. Ilskemätare: bossen blir snabbare om striden drar ut
104. Bossrush-läge från startskärmen (alla fem i rad)
105. Tid för bosstriden visas och sparas som rekord

**Kort (106–165)**
106–155. 50 nya kort (20 vanliga, 15 ovanliga, 10 sällsynta, 5 legendariska, varav 4 förbannade), bland annat Drakägget, Frostmolnet, Åskstaven, Gryningskorset och Den ansiktslöse.
156. Kortset: tre kort ur samma set ger en bonus (6 set)
157. Setbonusen syns i kortleken
158. Synergimärke i kortvalet när kortet passar dina kort
159. Förvisa: ta bort ett kort ur poolen i kortvalet (en gång per våning)
160. Nya kort för guld i kortvalet
161. Kortarkiv: alla kort du sett, med låsta kort som skuggor
162. Kortleken går att sortera (sällsynthet, namn, typ)
163. "NY" på kort du aldrig sett
164. Legendariska kort skimrar
165. Kort visar sina siffror tydligt med färgade plus och minus

**Föremål och interaktion (166–195)**
166. Smedjan (skada på vapnet)
167. Spåaltaret: en slumpad välsignelse eller förbannelse
168. Fångar i bur: befria för en belöning
169. Utmaningsaltaret: överlev tre vågor för en skatt
170. Spakar som öppnar järngaller
171. Låsta dörrar och nycklar
172. Spruckna väggar som sprängs upp
173. Pilfällor (tryckplattor)
174. Gasventiler
175. Offerskålen: betala HP för ett kort
176. Lava (bränner)
177. Vatten (saktar ned, plaskar)
178. Is (halt)
179. Spindelnät (saktar ned, brinner upp)
180. Skattkarta som visar hela våningen
181. Krutfat kan sparkas iväg
182. Ljus kan skjutas sönder (mörkare rum)
183. Kistor kan vara låsta (kräver en nyckel)
184. Brunnen lyser rött på kartan tills den är använd
185. Dörrar kan sparkas upp (V)
186. Bokhyllor kan innehålla ett gömt kort
187. Statyer kan ha guld i sockeln (sparka)
188. Kistor skakar och glittrar när de innehåller något sällsynt
189. Föremål som går att använda visar "E" och vad de gör när man står nära
190. Guld dras till dig när du rusar förbi
191. Föremål som fiender tappar studsar ut ur dem
192. Krukor kan innehålla granater och nycklar
193. Brinnande nät och eld sprider sig till nät intill
194. Lavan lyser upp rummet
195. Vatten speglar ljuset (blänk)

**Banor och biomer (196–230)**
196. Ny biom: Träsket (utomhus, vatten, dimma, ruttna träd)
197. Träskets väggar och golv
198. Träskets ljud och musik (grodor, droppar, egen musikslinga)
199. Träskets väder: dimma och eldflugor
200. Träskets rum: hyddor på pålar, bryggor, ödehus
201. Lavarum i grottorna
202. Frusna rum i kryptan
203. Översvämmade rum
204. Spindelrum med nät
205. Fällgångar med pilfällor
206. Gasrum
207. Hemliga rum bakom spruckna väggar
208. Låsta skattrum med nyckel någon annanstans på våningen
209. Spakrum: spak öppnar galler till en skatt
210. Smedjerum
211. Spåaltare
212. Fångrum
213. Utmaningsrum
214. Offerskålar
215. Nya fiender placeras efter biom (spindlar i grottor, fladdermöss, hundar i skogen …)
216. Fiender sover eller patrullerar när våningen börjar
217. Granater och skattkartor placeras ut
218. Fler rumsformer: dubbelrum med valv, pelarsalar
219. Bossarena: Träsket (ny arena)
220. Blodmåne: sällsynt våning med röd himmel, starkare fiender och dubbelt guld
221. Dimnatt: tät dimma men fler skatter
222. Jordbävning: stenar faller ibland från taket
223. Mörk våning: bara facklor lyser
224. Guldregn: mer guld men fler fällor
225. Våningens händelse visas på titelkortet
226. Himmel med moln som rör sig
227. Stjärnfall på utomhusvåningar
228. Månen syns på himlen
229. Facklorna fladdrar i vinden utomhus
230. Väggar i mörka hörn får spindelväv (dekaler)

**Händelser och utmaningar (231–250)**
231. Vågor i utmaningsrummet med räknare
232. Tidsutmaning: hinn till portalen på tid för en bonus
233. Jakt: döda den märkta eliten för en belöning
234. Vandrande köpman som dyker upp ibland
235. Tärningsspel hos dödgrävaren: satsa 30 guld
236. Spöket som ber om sina ben (hitta benhögen)
237. Förbannad kista: öppna och möt en fälla eller skatt
238. Hemlig nivå: guldkammaren (sällsynt portal)
239. Varvets bonusuppdrag visas i pausen
240. Belöning för att döda alla fiender på en våning
241. Belöning för att hitta alla kistor
242. Belöning för att inte använda hälsa
243. Dagens runda har en egen topplista
244. Veckans utmaning: samma frö hela veckan och två förbannelser
245. Förbannade våningar: ta en förbannelse för 60 guld
246. Portalen visar vart den leder (nästa biom eller bossen)
247. Mimic-jakt: hitta och döda mimicen
248. Befriade fångar ger dig granater, guld och ibland en nyckel
249. Spöklika ekon av din förra död (där du dog senast)
250. Händelselogg i pausen

**Ljud och musik (251–270)**
251. Musik per biom (loopar)
252. Musiken blir intensivare i strid
253. Eget eko (reverb) i grottor och kryptor
254. Separata volymer för musik, effekter och miljöljud
255. Ljud för hopp och landning
256. Ljud för rusning
257. Ljud för granater (kast, studs, pip)
258. Ljud för spakar, lås och nycklar
259. Smedjans klang
260. Lavans fräsande
261. Fladdermöss, hundar och spindlar har egna ljud
262. Bombskelettets stubin
263. Sköldklang när skott studsar
264. Gongen när en utmaning börjar
265. Menyljud vid hovring och klick
266. Kulor som träffar väggar låter
267. Fanfar när rundan vinns
268. Dödsklang när man dör
269. Ljud dämpas när du är under vatten eller har låg HP
270. Upprepade ljud varierar i tonhöjd

**Skärm och grafik (271–300)**
271. Uthållighetsmätare
272. Granaträknare i HUD
273. Nyckelikon i HUD
274. Pilar vid kanten som visar väktare och eliter utanför bilden
275. Mål-text ("BESEGRA VÄKTAREN", "HITTA PORTALEN")
276. Skadeindikatorn färgas efter typ av anfall
277. Valfri timer för våningen
278. Livmätaren visar förlorad hälsa i en fördröjd stapel
279. Rustningen spricker synligt när den tar slut
280. Guld som plockas upp visas som +siffror
281. Kortbanderoll när du får ett kort
282. Aktiva tidsbegränsade effekter visar nedräkning
283. Undertexter för ljud ("[MORRANDE TILL VÄNSTER]")
284. Bilden får frost- eller giftkanter när du är saktad eller förgiftad
285. Fotoläge (K): göm allt och frys bilden
286. Skärmbild med F12/knapp sparas som PNG
287. Kartmarkör (högerklick på stora kartan eller B)
288. Stora kartan har teckenförklaring
289. Kartan ramar in specialrum (butik, väktare, brunn, skatt)
290. Kartan roterar med spelaren (inställning)
291. Krutfat och fällor syns på kartan när de setts
292. Interaktiva föremål blinkar på kartan
293. Fiendernas livmätare kan stängas av
294. Skadesiffror kan stängas av
295. Vattnet och lavan är animerade
296. Ljuskällor (ljus, kristaller, svampar, altare) har en glöd
297. Fiender kastar en mörk skugga på golvet
298. Föremål på golvet glänser
299. Portalen drar in partiklar
300. Dödsskärmen visar vad som dödade dig

**Menyer och meta (301–330)**
301. Klasser: Krigaren, Prickskytten, Alkemisten, Plundraren (olika start)
302. Klasser låses upp med själar eller prestationer
303. Uppstigning: MARDRÖM 1–5 med växande förbannelser
304. Fem nya uppgraderingar i själaaltaret
305. 30 nya prestationer
306. Prestationer visar framsteg (12/100)
307. Statistik per fiende i bestiariet
308. Statistik per vapen i profilen
309. Rekord per biom
310. Snabbaste seger sparas
311. Övningsläge: välj biom och boss
312. Poängmultiplikator efter varv 3 (oändligt djup)
313. Rundans graf över HP och guld per våning
314. Startskärmen har egen musik
315. Senaste fröet kan kopieras
316. Spela igen med samma frö
317. M i pausen visar hela kartan
318. Profilen kan exporteras och importeras
319. Nyheter i spelet (vad som är nytt) på startskärmen
320. Handbok: hur allt fungerar, i spelet
321. Kontrollschema i pausen
322. Bekräftelse innan en ny runda skriver över en pågående
323. Varvskartan visar biomernas namn
324. Topplista för dagens runda
325. Själar visas med animation efter rundan
326. Kortarkivet nås från startskärmen
327. Rundsammanfattning visar kort du hade
328. Klassens färg syns i HUD
329. Uppstigningsnivå syns i pausen
330. Tips anpassas efter vad du dog av

**Inställningar och tillgänglighet (331–350)**
331. Handkontroll (gamepad): gå, sikta, skjut, alla knappar
332. Vibration i handkontrollen
333. Byt tangenter
334. Håll eller växla spring
335. Siktstöd på mobil och handkontroll
336. Automatiskt skott när siktet ligger på en fiende (mobil, valfritt)
337. Gyro-sikte på mobil
338. Färgblindlägen (3)
339. Minskade blixtar
340. Textstorlek
341. Mjuk eller pixlig uppskalning
342. Effekterna minskas automatiskt vid låg FPS
343. Fast eller flytande joystick
344. Knapparnas genomskinlighet
345. Skärmen släcks inte under spel (Wake Lock)
346. Undertexter av/på
347. Ljudsignaler för fiender bakom dig (tillgänglighet)
348. Musik av/på
349. Kartans storlek
350. Återställ alla inställningar

## Version 5: 200 nya förbättringar

Version 5 lägger till 200 förbättringar. Nya bilder ritas med `tools/props3/make.py` och `tools/weapon-frames`, ljud och musik byggs med `tools/sounds/make3.sh`, korten med `tools/card-art/make.py`. Bangeneratorn har fått biomen Frostfästet, en isarena, NPC:er, djurburar, drycker och istappar.

**Nya vapen (1–20)**
1. Yxan (å): närstrid utan ammo, ett svep som träffar flera fiender
2. Håll inne för ett laddat slag som slungar fiender
3. Högerklick kastar yxan, som kommer tillbaka
4. Eldkastaren (ä): kontinuerlig låga som tänder eld, eget bränsle
5. Eldkastaren bränner nät och tänder krutfat
6. Eldkastarens låga lyser upp omgivningen
7. Granatkastaren (ö): studsande granater, egen ammo
8. Sikta med granatkastaren så smäller granaten vid första träffen
9. Bärsärkens ed: pakt för yxan med fyra unika uppgraderingar
10. Mordbrännarens ed: pakt för eldkastaren med fyra uppgraderingar
11. Sprängmästarens ed: pakt för granatkastaren med fyra uppgraderingar
12. Nya ammotyper (BRÄNSLE, GRANATER) i HUD och ammolådor
13. Vapenhjulet: håll Q och peka med musen (tiden saktar ned)
14. Vapnets skada och eldhastighet visas när du byter
15. Eliter kan tappa vapen (sällsynt)
16. Dödgrävaren säljer vapen
17. Siffertangenterna når alla elva vapen (0 = tionde, § = elfte)
18. Mobil: dra på byt-knappen för att byta, håll den för vapenhjulet
19. Träffstopp, skak och slagljud för närstrid
20. Yxan blockerar eldklot medan du laddar

**Nya fiender (21–40)**
21. Ghoul (Å): snabb, äter lik för att läka
22. Kultist (Ä): förbannar dig på håll (du gör mindre skada en stund)
23. Gargoyl (Ö): sitter som en staty, vaknar och flyger
24. Isvarg (É): jagar i flock, bettet saktar ned
25. Irrbloss (Ü): svävande blå låga som sprängs i frost
26. Ghouler söker sig till lik i närheten
27. Kultister offrar en annan fiende för att stärka sig
28. Gargoyler tar halv skada från kulor men full skada från explosioner och närstrid
29. Isvargar ylar och kallar på flocken
30. Irrbloss fryser marken där de sprängs
31. De nya fienderna finns i bestiariet med bild och tips
32. Ny elitegenskap: speglande (skickar tillbaka en del av skadan)
33. Ny elitegenskap: kallande (kallar på hjälp vid låg hälsa)
34. Ny elitegenskap: smygande (osynlig tills den anfaller)
35. Fiender som stärkts av en kultist lyser lila
36. Mörkerfiender undviker starkt ljus
37. Fiender glider på is
38. Fiender flyr från eldkastaren
39. Lik som ghouler äter försvinner
40. Fiendernas anfall blinkar till en kort stund innan de slår

**Frostfästet (41–55)**
41. Ny biom: Frostfästet, med frusna murar, snöiga gårdar under öppen himmel och isiga salar
42. Frusna stenmurar, isväggar, snögolv och frostiga golvplattor
43. Snöfall
44. Fotspår i snön
45. Andedräkten syns i kylan
46. Egen musik med ett intensitetslager och kall vind
47. Rumstyper: istronsal, frusen sjö, kasern och kristallsal
48. Frusna sjöar där man glider
49. Kylan: står du still ute för länge börjar du frysa; eld och rörelse värmer
50. Eldfat har en synlig värmeaura
51. Frostfästets väktarrum och bossarena
52. Is spricker under tunga steg
53. Fotsteg i snö
54. Istappar faller när man skjuter dem
55. Eget namn och titelkort

**Ny boss (56–65)**
56. Den sjätte bossen, Isdraken, med en egen arena: en ishall med en frusen sjö
57. Isskärvor i solfjäder
58. Ett slag som får istaggar att skjuta upp ur marken
59. Snöstorm i fas 2 och 3
60. Två specialanfall: en frostvåg som du hoppar över, och irrbloss som den kallar på
61. Egna väggar och golv i väktarrum och arena
62. Egen bossmusik och eget vrål
63. Isdraken är med i bossrushen (sex bossar)
64. Isdraken kan vakta vanliga våningar som väktare
65. Bossrekord och bestiarium för den nya bossen

**Följeslagare (66–75)**
66. Korpen hämtar guld och föremål åt dig
67. Lyktan lyser upp mörkret, visar fällor och avslöjar smygande eliter
68. Vargvalpen biter fiender
69. Välj följeslagare på startskärmen när den är upplåst
70. Följeslagarna låses upp i själaaltaret (FLOCKEN)
71. Följeslagaren går upp i nivå (1–5) under rundan
72. Djurburen (©) på våningarna: befria en ny följeslagare för rundan
73. Följeslagaren syns på kartan
74. Egna ljud för korp, lykta och valp
75. Följeslagaren kan inte dö, men vilar en stund om den skadas för mycket

**Drycker (76–90)**
76. Två dryckesplatser: H dricker, J byter ordning
77. Läkedryck (+50 HP)
78. Raseridryck (+50 % skada i 8 s)
79. Osynlighetsdryck (fienderna tappar dig i 6 s)
80. Snabbhetsdryck (+40 % fart i 8 s)
81. Isdryck (fryser fiender runt dig och ger rustning)
82. Okända drycker: effekten visas först när du har druckit sorten en gång
83. Drycker finns i krukor, kistor, bokhyllor och hos alkemisten (¥ på kartan)
84. Alkemisten (£) säljer drycker och blandar två till en stark dryck
85. Dryckernas effekter syns som färg i bilden
86. Ljud för att dricka och för varje effekt
87. Mobil: dryckesknapp
88. Handkontroll: dryck på D-pad nedåt
89. Kort som gör dryckerna starkare eller vanligare
90. Dryckerna syns som ikoner i bildens nedre vänstra hörn

**NPC:er och val (91–105)**
91. Prästen (€) lyfter ett förbannat kort mot guld
92. Prästen kan välsigna dig (+20 max HP och full hälsa) en gång per runda
93. Vägval: ibland två portaler mot olika biomer
94. Portalen visar biomen och om vägen är lugn, farlig eller svår (mer guld)
95. Kartografens karta hos dödgrävaren visar hela nästa våning
96. Dödgrävaren säljer ibland ett vapen redan på de första våningarna
97. Köpmannen ger 15 % rabatt om du inte har tagit skada på våningen
98. NPC:er säger något när du kommer nära
99. Fångar kan följa med och slåss för dig resten av våningen
100. Skugghandlaren syns bara i mörker och ger rabatt
101. Utmaningsaltaret har tre svårighetsgrader (2, 3 eller 5 vågor)
102. Spåaltaret spår vilken boss som väntar
103. Brunnar kan vara förgiftade (grönt vatten)
104. Bokhyllor kan gömma en dryck
105. Offerskålen kan ge en följeslagare

**Kort (106–145)**
106–135. 30 nya kort (12 vanliga, 9 ovanliga, 6 sällsynta och 3 legendariska, varav 2 förbannelser) med nya bonusar: dryckesstyrka, fler drycker, följeslagarstyrka, närstridsskada, brandskada, köldskydd, huvudträffar, blödning, allierade, ljusradie, vapentapp och NPC-rabatt
136. Två nya kortset: ALKEMISTENS LÄRA och FLOCKENS BAND
137. Kortfusion: två likadana kort smälts samman till ett starkare (+)
138. Kortleken visar statistik per kort: skada, dödade och hur ofta det valts
139. Statistiken per kort samlas in under rundan och i profilen
140. Kortvalet visar "DU HAR n" för kort du redan har
141. Banderollen för nya kort har en ram i kortets raritetsfärg
142. En svår utmaning bryter en förbannelse
143. Legendariska kort skakar och glöder när de visas
144. Bossens kortval har alltid ett legendariskt alternativ
145. Kortarkivet visar hur många gånger du har valt varje kort

**Strid och känsla (146–165)**
146. Färgat ljus: eld, lava, kristaller och portaler färgar rummet
147. Fiender har glödande ögon i mörker
148. Skadade fiender lämnar blodspår
149. Mynningsflammans ljus har vapnets färg
150. Vattenringar när du går i vatten
151. Damm när du landar efter ett hopp
152. Facklor ryker
153. Facklor gnistrar
154. Irrbloss löses upp när de dör
155. Mjukare rekylåterhämtning
156. Träffmarkören visar dödande träffar och huvudträffar i egna färger
157. Ett tydligare ljud när en fiende dör
158. Skadesiffror från snabba träffar slås ihop
159. Fiender blinkar orange vid bakhåll
160. Explosioner skakar kameran efter avstånd
161. Varningsljud när ammunitionen tar slut
162. Huvudträffar: en träff mitt i fienden med ett enkelskottsvapen ger +50 %
163. Huvudträffar visas med en stjärna och ett eget ljud
164. Döda fiender rycker till en sista gång
165. Bossar och väktare lämnar en krater när de dör

**Meta och lägen (166–185)**
166. Ny klass: Nekromantikern (döda fiender kan resa sig som allierade)
167. Ny klass: Jägaren (armborst och en vargvalp)
168. Utmaningslägen: Ett slag (1 HP), Bara pistol och Inga kort
169. Utmaningslägena ger egna prestationer och fler själar
170. 20 nya prestationer
171. Snabbstart: Enter på slutskärmen startar direkt en ny runda
172. Dödsrapport: vem som skadade dig mest
173. Rundans tidslinje på slutskärmen
174. Färgteman för HUD (klassisk, blå, grön, guld)
175. Vapenfärger som låses upp med prestationer
176. Sparad statistik: total skada, längsta kombo, flest dödade på en våning och i en runda
177. Nya personliga rekord visas på slutskärmen
178. Startskärmen visar dagens frö och hur länge det gäller
179. Djupmätare: hur djupt du är jämfört med ditt rekord
180. Själarna syns i pausen
181. Dagens belöning: första rundan varje dag ger 15 själar
182. Nekromantikerns allierade syns som gröna gestalter
183. Ny uppgradering i själaaltaret: följeslagare
184. Ny uppgradering: en tredje dryckesplats
185. Ny uppgradering: börja rundan med en läkedryck

**Tillgänglighet, mobil och övrigt (186–200)**
186. Stor text i HUD (inställning)
187. Konturer runt fiender (inställning)
188. Enhandsläge på mobil: knapparna flyttas till höger och en GÅ-knapp går framåt
189. Siktets storlek
190. Fokusläge: miljöljuden dämpas i strid
191. Pausa när mobilen vrids till stående (inställning)
192. Kontrollerna visas på laddningsskärmen
193. Mobil: håll kartknappen för att se hela kartan
194. Mobil: dubbeltryck på bilden för att hoppa (inställning)
195. Vibrationsmönster för olika händelser
196. Inställningarna sparas per enhet (mobil och dator)
197. Laddningsskärm med förloppsstapel
198. Ljuden hämtas i bakgrunden medan du är på startskärmen
199. Felrapporten i profilen kan kopieras
200. Version och nyheter visas på startskärmen

## Version 6: 200 nya förbättringar

Version 6 lägger till 200 förbättringar:
- **Bilder:** ritas med `tools/props4/make.py` och `tools/weapon-frames`.
- **Ljud och musik:** byggs med `tools/sounds/make4.sh`.
- **Kort:** byggs med `tools/card-art/make.py`.
- **Bangeneratorn:** har fått biomen Vulkanen, en vulkanarena, hemliga våningar (`Gen.secret`), fällor, lägereldar, anslagstavlor och runstenar.

**Nya vapen (1–20)**
1. Spikgeväret (é): snabba spikar som projektiler
2. Spikar nålar fast fiender mot väggen
3. Spikarna studsar ibland mot sten
4. Blixtstaven (ü): kedjeblixt mellan fiender
5. Staven använder MANA som laddas av sig själv, även när staven ligger i fickan
6. Högerklick laddar ett blixtklot som zappar allt i närheten
7. Långbågen (ñ): håll för att spänna, släpp för att skjuta
8. Fullt spänd båge gör dubbel skada och går igenom fiender
9. Pilar fastnar i väggar och kan plockas upp igen
10. Spiksmedens ed: pakt för spikgeväret med fyra uppgraderingar
11. Stormmagerns ed: pakt för blixtstaven med fyra uppgraderingar
12. Bågskyttens ed: pakt för långbågen med fyra uppgraderingar
13. Nya ammotyper: SPIKAR, MANA och PILAR (armborstet har nu BULTAR)
14. Vapenhjulet och vapenraden i HUD klarar fjorton vapen
15. Alternativa skott med högerklick: en spikbrasa och ett blixtklot
16. Siktet drar ihop sig när bågen spänns
17. Spikgeväret skjuter snabbare ju längre du håller inne
18. Blixten leder i vatten: alla som står i samma vatten får en stöt
19. De nya vapnen finns i butiken och som elitbyte
20. Träffljud efter väggens material (sten, trä, metall)

**Nya fiender (21–40)**
21. Nekromant (Ñ): väcker döda fiender
22. Eldelemental (Æ): delar sig i små flammor när den dör
23. Lavamask (Þ): gräver sig fram och dyker upp under dig
24. Dödsriddare (Ð): tung, med sköldstöt och svärdsvåg
25. Banshee (Ý): skriket saktar ned och får dig att tappa fotfästet
26. Nekromanten håller avstånd
27. Marken glöder och spricker innan lavamasken dyker upp
28. Dödsriddarens sköld stoppar skott framifrån
29. Bansheen syns bara som en skugga på håll
30. Eldelementalen tänder marken där den går och bränner nät
31. Fiender undviker granater
32. Skadade fiender söker sig till shamanen för att helas
33. Vissa fiender bär ett föremål som syns och tappas när de dör
34. Grupper har en ledare: när den dör tvekar de andra
35. Fiender hör när du öppnar dörrar
36. Ny elitegenskap: brinnande aura
37. Ny elitegenskap: magnetisk (drar dig närmare)
38. Ny elitegenskap: odödlig en gång (återuppstår med halv hälsa)
39. De nya fienderna finns i bestiariet
40. Livmätarna visar statusprickar (brand, gift, frost, blödning, bedövning)

**Vulkanen (41–55)**
41. Ny biom: Vulkanen, med obsidianhallar, lavafloder och askfält
42. Obsidianväggar, askgolv och basaltgolv
43. Askregn och stigande glöd
44. Värmedis i bilden
45. Hetta: nära lava blir du varm, vatten och isdrycken kyler
46. Utbrott: lavabomber faller med varning på marken
47. Rumstyper: smedjehall, lavasjö med bro, askfält och magmakammare
48. Lavan lyser rött på väggarna (färgat ljus)
49. Egen musik och mullrande miljöljud
50. Röd himmel av glöd och rök
51. Vulkanens väktarrum och bossarena
52. Eldjetar (°) som sprutar eld i takt
53. Sköra golvplattor (¬) som rasar efter att du gått på dem
54. Pendelblad (±) som svänger i korridorerna
55. Vulkanens namn och titelkort

**Ny boss (56–65)**
56. Den sjunde bossen, Eldkungen, med en egen vulkanarena
57. Eldklot i salvor
58. Ett slag som får lava att spruta upp i en ring
59. Lavapölar i fas 2 och raseri i fas 3
60. Två specialanfall: utbrott och eldelementaler
61. Egna väggar och golv i väktarrum och arena
62. Egen bossmusik och eget vrål
63. Eldkungen är med i bossrushen (sju bossar)
64. Eldkungen kan vakta vanliga våningar
65. Bossintro: kameran vänder sig mot bossen innan striden

**Runor (66–80)**
66. Runstenar (ª) på våningarna
67. Runor fästs i vapen, direkt eller vid smedjan
68. Eldrunan tänder eld
69. Isrunan saktar ned och fryser ibland
70. Giftrunan förgiftar
71. Stormrunan slår ibland ned blixt i en annan fiende
72. Blodrunan ger liv tillbaka
73. Ekorunan upprepar var femte träff
74. Runorna syns på vapnet i HUD
75. Vapnet glöder i runans färg
76. En runplats per vapen, två med själaaltarets uppgradering
77. En ny runa ersätter den äldsta
78. Runstenar i butiken
79. Runorna förklaras i handboken
80. Ljud när en runa fästs och när den slår till

**Lägerelden och uppdrag (81–100)**
81. Lägerelden (¶): en vilplats på vissa våningar
82. Vila: läk 40 % hälsa
83. Smida: vapnet går upp en nivå gratis
84. Förädla: ett kort blir starkare (+)
85. Laga mat: kött från djur ger hälsa, max hälsa och mer skada på våningen
86. Lägerelden värmer i kylan och lyser
87. Anslagstavlan (®): tre sidouppdrag per våning
88. Uppdrag: döda fiender med ett visst vapen
89. Uppdrag: hitta en hemlighet
90. Uppdrag: klara våningen utan drycker
91. Uppdrag: döda en elit innan tiden går ut, nå en kombo, ta ingen skada en minut
92. Belöningen är guld, ett kortval eller en runa
93. Uppdragen syns i pausen
94. Ljud när ett uppdrag tas och klaras
95. Hemlig trappa (÷) i hemliga rum
96. Den hemliga våningen: en skattkammare med eliter
97. Den hemliga våningen har egen musik
98. Giftfat (µ) och isfat (ß) som smäller med effekt
99. Tryckplattor (¨) öppnar en hemlighet i närheten
100. Fångar viskar ett tips om våningen

**Aktiva förmågor (101–115)**
101. Fem kort ger en aktiv förmåga (T)
102. Blinken: teleport framåt
103. Tidsbubblan: allt runt dig saktar ned
104. Sköldbubblan: blockerar projektiler
105. Vålnadskallet: två allierade
106. Jordskalvet: slår omkull fiender runt dig
107. Förmågans nedräkning syns i HUD
108. Mobil: förmågeknapp
109. Handkontroll: förmåga på höger spak (går att byta)
110. Kort som sänker nedräkningen
111. Ljud för varje förmåga och när den är redo
112. Dödanden laddar förmågan snabbare, mer vid kombo
113. Bara en förmåga åt gången: det senaste kortet gäller
114. Förmågan syns i kortleken ("I BRUK")
115. Tips första gången du får en förmåga

**Kort (116–145)**
116–140. 25 nya kort med nya bonusar: runplatser, runstyrka, hettaskydd, mana, pilar som kommer tillbaka, uppdragsguld, vila, nedräkning, hemligheter och måltider
141. Två nya kortset: ASKANS ARV och JÄGARENS LÄRA
142. Förädling: ett kort blir + utan att du behöver ett till
143. Kortvalet visar FÖRE → EFTER för det kortet ändrar
144. Kortleken kan sorteras och filtreras
145. Kortleken visar dina aktuella värden

**Lägen och meta (146–175)**
146. Överlevnadsläget: vågor i en arena, med rekordlista
147. Spöket: din bästa tid på samma våning syns som en skugga
148. Introduktion för nya spelare, steg för steg
149. Själaaltaret: en andra runplats
150. Själaaltaret: lägereldar oftare
151. Själaaltaret: börja med en runa
152. 20 nya prestationer
153. Statistik per biom och boss
154. Slutskärmens graf visar skadan per våning
155. Vanligaste dödsorsakerna i statistiken
156. Nytt läge: snabb runda (portalen öppnas tidigare)
157. Hjälpläge: långsammare spel
158. Hjälpläge: extra hälsa
159. Byt svårighet mellan våningarna (D)
160. Spara slutskärmen som bild (S)
161. Fotoläget har filter: svartvit, sepia och nattseende (1–4)
162. Ny klass: Spejaren (långbåge och lykta)
163. Ny klass: Smeden (smidd pistol med eldruna)
164. Dagliga uppdrag: tre om dagen, själar som belöning
165. Tre nya regler för dagens och veckans utmaning
166. Bossrush med alla sju bossar och topptid
167. Själarna hittills syns efter varje våning
168. Kortarkivet visar saknade kort och hur de låses upp
169. Bestiariet visar fiendernas svagheter
170. Rörlig bakgrund på startskärmen
171. Startskärmen visar senaste rundan
172. Ny meny: statistik
173. Favoritvapen per biom
174. Bästa tid per boss
175. Pausen visar runor, förmåga och uppdrag

**Grafik, ljud och känsla (176–190)**
176. Värmedis och askfilter i vulkanen
177. Blixtstaven lyser upp rummet
178. Spårljus efter spikar
179. Brinnande fiender lyser
180. Stora fiender skakar marken när de går nära
181. Explosioner lämnar glödande rester
182. Spårljus efter fullt spända pilar
183. Hjärtat slår hårdare vid mycket låg hälsa
184. Musiken blir intensivare när en elit är nära
185. Ljudet dämpas när du duckar i vatten
186. Fönsterljuset i husväggarna flimrar
187. Spindelnät fladdrar när du går igenom dem
188. Du hör fotsteg från fiender du inte ser
189. Partiklar när runor slår till
190. Bossens steg skakar kameran

**Tillgänglighet och mobil (191–200)**
191. Flytta mobilknapparna (layoutläge i inställningarna)
192. Byt knappar på handkontrollen
193. Hög kontrast på fiender
194. Stora undertexter
195. Siktstödets styrka kan väljas
196. Spring automatiskt på mobil
197. Pilar mot uppdragets mål i cyan
198. Spelhastighet (hjälpläge)
199. Sparläge: 30 bilder i sekunden för svaga enheter
200. Version 6 i nyheter och handbok

Siktstödet på mobil är också rättat. Två funktioner hette `aimAssist`, så första skottet saknade riktning när man spelade med pekskärm.

## Assets som används

| Vad | Källa |
|---|---|
| Förstapersonsvapen (pistol, hagelgevär, gevär, kpist) med skjutanimationer | release `assets-large-v1` → `RetroWeaponPack_V1.zip`, renderade med `tools/weapon-frames` |
| Dubbelbössa, armborst, signalpistol, prickskyttegevär | `assets/3d-models/PSXShotgunPack[FIXED]`, `Low Poly Weapon Pack with Image Texture - by Kickin It Studios` och `Guns&Explosives`, renderade med `tools/weapon-frames/render-static.mjs` |
| Portal | ritad med `tools/portal/make.py` |
| Bossar: Helvetesbesten, Mardrömmen, Ogern, Vålnaden | `assets/2d-pixel/Legacy Collection/.../Gothicvania/Characters` (Ansimuz, CC0), bildremsor med `tools/boss-sprites/prep.py` |
| Utomhus: skogsvägg, kyrkogårdsmur, grottvägg, korsvirkeshus, gräs, grus, lera, grottgolv och -tak | Kenney *retro-textures-fantasy* (CC0), *Classic64 Asset Pack* (CC0), byggda med `tools/biome-textures/make.py` |
| Natthimmel | Kenney *Skyboxes* (CC0) |
| Träd och gravstenar | träden ur Gothicvania *HauntedForest* (CC0), gravstenarna ritade i `tools/biome-textures/make.py` |
| Mynningsflamma | `RetroWeaponPack_V1.zip` → `FX/Textures/MuzzleFlash.png` |
| Väggar, dörrar, golv, tak | `assets/textures/retro-textures-fantasy` (Kenney, CC0) |
| Skelett, eldskelett, vampyr | `assets/2d-pixel/Enemy_Animations_Set` |
| Benmagiker, orkshaman, gravrövare, orkkrigare | `assets/2d-pixel/Pixel Crawler - Free Pack 2.11` (Anokolisa). Anfalls- och smärtrutor ritas fram av `tools/enemy-sprites/prep.py` |
| Smådjävul och blodslem | `assets/2d-pixel/Tiny RPG Character Asset Pack 02` (Demon_A och Blood Monster_A) |
| Krukor och skärvor | `assets/2d-pixel/20.05b - Breakable Pots 1.1a` |
| Eld, eldklot, kulnedslag | `assets/effects/Free Pixel Effects Pack` (public domain) |
| Blod | `assets/effects/splat-pack` (Kenney, CC0) |
| Ammolåda | `assets/3d-models/Styloo Guns Asset Pack` (renderad till sprite) |
| Hälsa och rustning | `assets/2d-sprites/potions` |
| Ljud | `assets/audio/400 Sounds Pack` och release `assets-large-v1` → `Horror.SFX.Free.zip` |
| Boss: vingad demon | `assets/2d-pixel/Legacy Collection/.../Gothicvania/Characters/demon-Files` (Ansimuz, CC0) |
| Köpman (liemannen) | `assets/2d-pixel/Legacy Collection/.../Gothicvania/Characters/death` (CC0) |
| Kistor och mynt | `assets/2d-pixel/2D Pixel Dungeon Asset Pack v2.0` |
| Kortbilder och kortbaksida | `assets/rune-ai/flux/relics` och `card-backs`. Vapenkorten kombinerar relikbilder med vapnen renderade ur RetroWeaponPack (`tools/weapon-cards`) |
| Mobilknappar och joystick | Kenney *Mobile Controls* 1.0 (CC0), hämtad från kenney.nl. Kartikonen (`icon_map.png`) är ritad i samma stil |
| Föremål (kandelabrar, kistor, bokhyllor, brunnar, altare, spikfällor, krutfat, lådor m.m.), mimic, partiklar och väktar-/bossrummens väggar och golv | ritade med `tools/props/make.py`. Mimicen bygger på kistan ur *2D Pixel Dungeon*, kristallen på Gothicvania *Rocky Pass* (CC0), dimman på Kenney *Particle Pack* (CC0). Texturerna har ytstruktur från Kenney *retro-textures-fantasy* och *Classic64* (CC0) |
| Nya ljud (biomljud, fotsteg, bossmusik, klockor, hjärtslag m.m.) | `assets/audio/400 Sounds Pack` och `Horror.SFX.Free.zip`, konverterade med `tools/sounds/make.sh` |
| Kugghjul och utgång (mobil) | Kenney *Game Icons* (CC0) |
| Version 4: sju nya fiender (spindel, fladdermus, helveteshund, bombskelett, sköldbärare, svampman, levande rustning), nya föremål, partiklar, måne, moln och Träskets texturer | `tools/props2/make.py`. Helveteshunden och svampmannen ur Gothicvania (Ansimuz, CC0), bombskelettet och sköldbäraren bygger på *Pixel Crawler* (Anokolisa), resten ritas i skriptet. Ytor från Kenney *retro-textures-fantasy* och *Classic64* (CC0) |
| Musik per biom, eko och 35 nya ljud | `js/music.js` och `tools/sounds/make2.sh`: Abstraction *Music Loop Bundle* (CC0), Kenney *impact-sounds*, *rpg-audio*, *ui-audio*, *digital-audio* (CC0), 400 Sounds Pack och Horror SFX Free. Skogens, borggårdens och startskärmens musik är syntetiserad i skriptet |
| 50 nya kortbilder | `tools/card-art/make.py` ur `assets/rune-ai/flux/relics` |
| Version 5: yxa, eldkastare, granatkastare | yxan ur Kay Lousberg *KayKit Fantasy Weapons Bits* (CC0); eldkastaren och granatkastaren byggda av *Guns&Explosives* och *PSXShotgunPack* med `tools/weapon-frames` |
| Version 5: ghoul, kultist, gargoyl, isvarg, irrbloss, Isdraken, följeslagare, drycker, alkemist, präst, djurbur, Frostfästets texturer och partiklar | `tools/props3/make.py`. Isvargen och Isdraken ur Gothicvania (Ansimuz, CC0), omfärgade; ghoul, kultist, alkemist och präst bygger på *Pixel Crawler* (Anokolisa); ytor från *Classic64* (CC0); resten ritas i skriptet |
| Version 5: 40 ljud och musiken för Frostfästet och Isdraken | `tools/sounds/make3.sh`: Kenney-paket (CC0), 400 Sounds Pack, Horror SFX Free; musiken och flera ljud syntetiseras i skriptet |
| Version 5: 45 nya kortbilder | `tools/card-art/make.py` ur `assets/rune-ai/flux` (relics, bosses, vouchers, tags, rune-symbols) |
| Version 6: spikgevär, blixtstav, långbåge | blixtstaven och bågen ur KayKit *Fantasy Weapons Bits* (CC0), spikgeväret byggt på *Guns&Explosives*, renderade med `tools/weapon-frames` |
| Version 6: nekromant, dödsriddare, banshee, eldelemental, lavamask, Eldkungen, Vulkanens texturer, rekvisita, runor och ikoner | `tools/props4/make.py`. Nekromanten och dödsriddaren bygger på *Pixel Crawler* (Anokolisa), bansheen på Gothicvania (Ansimuz, CC0), Eldkungen på TinyRPG *Jumping Demon* (Legacy Collection, CC0), ytor från *Classic64* och Kenney (CC0); resten ritas i skriptet |
| Version 6: 47 ljud och musiken för Vulkanen, Eldkungen, hemliga våningar och överlevnad | `tools/sounds/make4.sh`: Kenney-paket (CC0), 400 Sounds Pack, Horror SFX Free; musiken syntetiseras i skriptet |
| Version 6: 45 nya kortbilder | `tools/card-art/make.py` ur `assets/rune-ai/flux` och `assets/ashfall-ai/flux/vfx` |
| Typsnitt | Press Start 2P (OFL) |

Se licensfilerna i respektive källpaket.
