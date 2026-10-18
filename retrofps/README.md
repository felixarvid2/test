# KRYPTA – roguelike-FPS

Ett raycaster-FPS i Doom/Quake 1-stil som är en roguelike: varje runda är fem slumpade våningar och
en boss längst ner. Öppna `index.html` via en lokal webbserver (`python3 -m http.server` i den här
mappen) och klicka **NY RUNDA**.

**Kontroller:** WASD gå · mus sikta · vänsterklick skjut · högerklick sikta med vapnet · R ladda om ·
E öppna dörr, kista, hemlig vägg eller handla · Shift spring · 1–8/Q/mushjul byt vapen · C dina kort ·
M/Tab karta · V spark · P/Esc paus (I inställningar, G ge upp) · Enter ny runda · `[` `]` muskänslighet · `,` `.` synfält · `-` `+` volym · N ljud av · O helskärm.

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
- **Kort** (`js/cards.js`, `js/cardui.js`): 50 vanliga kort i fyra sällsyntheter (vanlig, ovanlig, sällsynt, legendarisk). Korten ger permanenta bonusar under rundan, till exempel skada, eldhastighet, krit, genomslag, explosioner, brand, livsstöld, sköld, extraliv, magnet och rabatt. Fem förbannade kort ger en stark fördel med en nackdel. Det finns synergier, som eld + explosion och krit + kritskada.
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
| Typsnitt | Press Start 2P (OFL) |

Se licensfilerna i respektive källpaket.
