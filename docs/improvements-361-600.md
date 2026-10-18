# Förbättringar 361-600 (240 st)

Varje område har 30 punkter (engelska / svenska). Alla finns också som numrerade kommentarer i koden i `Dungeondice.html`.


## Meny, HUD och bakgrund (361-390)

361. Two-line pixel logo with die sprites / Pixellogga med två tärningssprites och tvåradig titel
362. Time-of-day greeting bubble in the menu / Hälsning efter tid på dygnet i menyn
363. Version label in the menu footer / Versionsetikett i menyns fot
364. Menu stats as four sprite boxes / Menystatistik som fyra rutor med sprites
365. Menu buttons grouped: play, tools, settings / Menyknappar grupperade: spela, verktyg, inställningar
366. Sprite icons on menu buttons (sword, hourglass, die) / Spriteikoner på menyknapparna
367. Difficulty as a three-button segmented control / Svårighetsgrad som tre knappar
368. "Last run" card with Play again button / Kort för senaste rundan med Spela igen
369. One-shot fade/slide when the game view appears / Engångsfade/slide när spelvyn visas
370. Game over screen with summary (ante, hands, total, bosses, best hand) / Game over med sammanfattning
371. Victory screen with run summary and time / Segerskärm med sammanfattning och tid
372. Relic strip on end screens / Relikrad på slutskärmarna
373. "New best ante" stamp / Stämpel för nytt ante-rekord
374. Background tint per ante via CSS variable / Bakgrundston per ante via CSS-variabel
375. Redder background on boss ante / Rödare bakgrund vid boss-ante
376. Ante plaque with x/8 in the HUD / Ante-plakett med x/8 i HUD:en
377. Bigger gold numbers, interest as green pill / Större guldsiffror, ränta som grön pill
378. Score vs target: bar and score box change colour near the goal, plus percent / Poäng mot mål: färg och procent
379. Blind icon plate with coloured tab / Blindikon-platta med färgad flik
380. Tab title shows mode, ante and score / Flikens titel visar läge, ante och poäng
381. Dynamic theme-color meta / Dynamisk theme-color
382. Favicon as pixel die data-URI / Favicon som pixeltärning (data-URI)
383. Scroll behaviour: smooth, no scroll chaining, themed scrollbar / Skrollbeteende
384. Metric-matched fallback font to reduce layout shift on load / Reservtypsnitt med matchande mått
385. Clear focus rings and auto-focus on New Run / Tydliga fokusramar och autofokus på Ny Run
386. Seed field restyled with key sprite and label / Seedfält med nyckelsprite och etikett
387. Typography hierarchy: pixel font in labels, fluid headings / Typografihierarki
388. Static monster sprite strip in the menu footer / Monsterrad i menyns fot
389. Enter in the seed field starts a run / Enter i seedfältet startar omgång
390. Gold reward plaque after clearing a blind / Guldplakett för belöning efter klarad blind

## Spelvy och effekter (391-420)

391. Score sequence counts chips and mult up step by step (one-shot ticks) / Poängsekvens där chips och mult räknas upp steg för steg
392. Relic pop frame plus the relic's name as a small label / Relikpop med ram och relikens namn som liten etikett
393. Floating +X labels per relic / Flytande +X-etiketter per relik
394. Hand name gets a one-shot pop when the combination changes / Handnamnet poppar en gång när kombinationen ändras
395. LV indicator with 10 segments and mastery marks at the hand name / Nivåindikator (LV) med segment vid handnamnet
396. Preview as a clear row: chips x mult = ~score / Förhandsvisning som tydlig rad
397. Preview tooltip with the full calculation / Förhandsvisningens tooltip med uträkning
398. Tier-coloured particle burst per combo tier / Färgade partiklar per kombotier
399. New pixel particle sprites (diamond, star, square, plus) / Nya pixelsprites som partiklar
400. Four screen shake levels, one-shot / Fyra screen shake-nivåer (engångs)
401. Edge flash for big scores / Kantblixt vid stora poäng
402. NEW BEST marker for the best single hand / NYTT REKORD-markör
403. Rolls and discards as small die pips instead of numbers / Kast och släng som tärningspips
404. Pixel icons on roll, score, sort, hold and discard buttons / Pixelikoner på knapparna
405. Dice in the combo glow once and lift, others are dimmed / Tärningar i kombon glöder, övriga dämpas
406. Die value, colour and mod as tooltip and aria-label / Tärningens värde som tooltip och aria
407. Sort button glides dice into place once (FLIP) / Sortera glider tärningarna en gång
408. Empty tray state with dashed slots / Tomt läge i tärningsbrickan
409. Bust stamp and dimmed total for a failed hand / Bust-stämpel för misslyckad hand
410. Progress bar flashes once at 25/50/75/100 % / Progress blixtrar vid delmål
411. Hands left as small card pips, red on the last hand / Händer kvar som kort-pips
412. Last-hand warning with points still needed / Varning på sista handen med kvarvarande poäng
413. Win popup with star rating, overkill and best hand / Segerpopup med stjärnor, överskott och bästa hand
414. Loss popup with progress bar, shortfall and best hand / Förlustpopup med framsteg och saknade poäng
415. Combo history: last 5 hands as small badges / Kombohistorik med de fem senaste händerna
416. Score panel tooltip with full calculation / Poängpanelens tooltip med uträkning
417. Gold from dice mods floats up to the gold counter / Guld från mods flyger till guldräknaren
418. Dice mods show their contribution as a label on the die / Tärningsmodar visar bidrag som etikett
419. Saved-dice counter in the tray corner (no dice movement) / Räknare för sparade tärningar
420. Score button gets a dashed ring when rolls run out / Poängknappen markeras när kasten är slut

## Butik, blindval och tooltips (421-450)

421. Unaffordable shop items are dimmed with a red price pill and "need N" / Varor du inte har råd med dämpas, röd pris-pill och "saknar N"
422. Clear rotated SOLD stamp over sold cards / Tydlig SÅLD-stämpel över sålda kort
423. Shop sections with headings (Relics / Hand tablets / Dice) / Butikssektioner med rubriker (Reliker / Kombotavlor / Tärningar)
424. Items sorted cheapest first inside each section, sold last / Varor sorterade billigast först i varje sektion, sålda sist
425. Tablet cards show before → after (chips × mult, level) / Tavlor visar före → efter (chips × mult, nivå)
426. Rarity label and colored top tab on shop relic cards / Sällsynthetsetikett och färgad flik på relikkort i butiken
427. Relic tooltip clamped inside the screen (sideways, flips up near bottom) / Relik-tooltip hålls inom skärmen (sidled, vänds uppåt nära botten)
428. Reroll button with price as coin pill (red when too poor) / Omkast-knapp med pris som mynt-pill (röd när du saknar guld)
429. Shop deal-in transition and spinning reroll arrow (one-shot) / Varorna delas ut med övergång och omkast-pilen snurrar (engångs)
430. Purchase pop on the bought card, no modal re-pop, scroll position kept / Köp-pop på kortet, ingen ny modal-pop, rullningsläget bevaras
431. Gold counter ticks with floating -N after purchase / Guldräknaren tickar med flytande -N efter köp
432. Shop header: gold pill and relic slots as little cards / Butiksrubrik: guld-pill och relikplatser som små kort
433. Hint text in the shop / Hint-text i butiken
434. Keyboard navigation in the shop (arrows + Enter, focus kept after buying) / Tangentbordsnavigering i butiken (pilar + Enter, fokus behålls efter köp)
435. Empty/sold-out shop state / Tomt läge när butiken är tömd
436. Card focus mode with gold ring and lift / Fokusläge på kort med guldram och lyft
437. Mobile: shop cards in two columns, blind tiles stacked / Mobil: butikskort i två kolumner, blindplattor staplade
438. Voucher shop shows owned vouchers as cards with OWNED stamp and x/9 count / Voucher-butik visar ägda kort med ÄGD-stämpel och x/9
439. Voucher purchase: gold ticks and card pops, unaffordable dimmed with "need N" / Voucherköp: guldet tickar och kortet poppar, för dyra dämpas med "saknar N"
440. Click selects a relic (no instant sell), lifted with gold ring / Klick markerar relik (ingen direktförsäljning), lyfts med guldram
441. Sell button with inline two-step confirmation, no confirm() / Säljknapp med inbyggd bekräftelse i två steg, inget confirm()
442. Relic counter as card slots (pips by rarity) / Relikräknare som kortplatser (pipar efter sällsynthet)
443. Sell feedback: floating +gold from the relic's spot / Sälj-feedback: +guld svävar upp från relikens plats
444. Reorder relics with ◀ ▶ (dice stay still) / Ändra ordning på reliker med ◀ ▶ (tärningarna står stilla)
445. Tooltip header with relic icon and rarity color / Tooltip med relikens ikon och sällsynthet i färgad rubrik
446. Blind select as three tiles (Small/Big/Boss), upcoming dimmed, cleared checked / Blindval som tre plattor, kommande dämpade, klara avbockade
447. Ante indicator with 8 pips / Anteindikator med 8 pipar
448. Boss reveal plaque with sprite, name and description / Bossavslöjande: egen plakett med sprite, namn och beskrivning
449. Reward preview (gold for clearing) on every blind tile / Belöningsförhandsvisning (guld för att klara) på varje blindplatta
450. Skip blind button shows +1 gold pill and a note that reward and shop are skipped / Hoppa över-knappen visar +1 guld och att belöning och butik uteblir

## Nya reliker (451-480)

451. Even Keel Stone (common): all dice even, +60 chips +3 mult / Jämnviktsstenen: alla jämna, +60 chips +3 mult.
452. Odd Shadow (common): all dice odd, +8 mult / Uddaskuggan: alla udda, +8 mult.
453. First Blow (common): first hand of blind, +30 chips +3 mult / Förstaslaget: första handen, +30 chips +3 mult.
454. Final Stand (common): last hand of blind, +5 mult / Sista Striden: sista handen, +5 mult.
455. Piggy Bank (common): +1 chips per gold held (max 30) / Sparbössan: +1 chips per guld (max 30).
456. Frugal Rolls (common): +10 chips per unused roll / Snåla Kast: +10 chips per oanvänt kast.
457. Lucky Seven (common): sum divisible by 7, +50 chips +3 mult / Lyckosjuan: summa delbar med 7.
458. Rainbow Ribbon (common): +2 mult per unique color above two / Regnbågsbandet: +2 mult per unik färg över två.
459. Color Clump (common): +8 chips per die in most common color / Färgklumpen: +8 chips per tärning i vanligaste färgen.
460. Discard Sack (common): +1 discard, +4 chips per remaining discard / Slängpåsen: +1 släng, +4 chips per kvarvarande släng.
461. Level Herald (uncommon): +2 mult per combo level above 1 / Nivåbudbäraren: +2 mult per kombonivå över 1.
462. The Specialist (uncommon): ×1.6 mult when played combo is your highest level / Specialisten: ×1.6 mult på din högsta kombonivå.
463. The All-Rounder (uncommon): +1 mult per different combo played this run / Allroundern: +1 mult per olika kombo spelad.
464. Gold Fever (uncommon): +1 mult per 4 gold (max +8) / Guldfeber: +1 mult per 4 guld (max +8).
465. Relic Hoard (uncommon): +1.5 mult per other relic / Relikhögen: +1.5 mult per annan relik.
466. Modsmith (uncommon): +2 mult per modified die / Modsmeden: +2 mult per modifierad tärning.
467. Ones Melter (uncommon): after each roll a new 1 becomes a 6 / Ettornas Smälta: efter kast blir en ny 1:a en 6:a.
468. Matchstick (uncommon): +2 rolls on first hand of each blind / Tändstickan: +2 kast första handen varje blind.
469. Interest Master (uncommon): won blind, +1 gold per 4 held (max +5) / Räntemästaren: vunnen blind ger ränta.
470. Quick Fingers (uncommon): score within 2 rolls, ×1.5 mult / Snabbfingret: poäng inom 2 kast, ×1.5 mult.
471. Masterwork (rare): combo level 5+, ×2.5 mult / Mästerverket: kombonivå 5+, ×2.5 mult.
472. Boss Breaker (rare): +1 hand on Big and Boss blinds / Bossbrytaren: +1 hand på stora blinden och bossen.
473. King of Sixes (rare): ×1.5 mult per 6 (max 4) / Sexornas Kung: ×1.5 mult per 6:a.
474. Color Monarch (rare): 4+ dice same color, ×2.5 mult / Färgmonarken: 4+ i samma färg, ×2.5 mult.
475. The Alchemist (rare): after each roll one new die gets a random modifier / Alkemisten: slumpad modifierare efter kast.
476. Dragon Hoard (rare): ×0.25 mult per 10 gold (up to ×2.5) / Drakhögen: guld höjer mult.
477. Hunter's Spoils (rare): Quads+, +1 roll rest of blind and +3 gold / Jägarens Byte: Fyrtal+, +1 kast och +3 guld.
478. Tablet Lord (legendary): played combo counts as two levels higher / Tavlornas Herre: kombon räknas två nivåer högre.
479. Rewind (legendary): lost blind gives one extra hand, once per ante / Tidsspolningen: en extra hand vid förlust, en gång per ante.
480. Gold Golem (legendary): +1 mult per 3 gold (max +15), +2 gold per hand / Guldgolemen: +1 mult per 3 guld, +2 guld per hand.

## Spelets djup: kombonivåer, vouchers, bossar (481-510)

481. Dice modifiers bought in the shop now persist in a 4-slot "dice bag" and appear on dice every hand (before they vanished at blind start). / Köpta tärningsmodifierare lagras i en tärningspåse (4 platser) och sitter på tärningar varje hand (förut försvann de vid blindstart).
482. Glass dice that break are consumed from the bag for good. / Glas som går sönder förbrukas ur påsen för gott.
483. New mod Bronze: +20 chips, +1 gold (4g). / Ny modifierare Brons: +20 chips, +1 guld (4g).
484. New mod Quicksilver: +3 mult (6g). / Ny modifierare Kvicksilver: +3 mult (6g).
485. New mod Ruby: x1.25 mult (7g). / Ny modifierare Rubin: x1,25 mult (7g).
486. New mod Heavy: +60 chips (5g). / Ny modifierare Tung: +60 chips (5g).
487. New mod Frost: +25 chips, +1 mult (5g). / Ny modifierare Frost: +25 chips, +1 mult (5g).
488. New mod Echo: +1 roll for the rest of the blind (7g, only while max rolls < base+3). / Ny modifierare Eko: +1 kast resten av blinden (7g, bara när max kast < bas+3).
489. Combo mastery bonuses at level 3 (x1.1) and level 10 "MAX" (x2 mult, +2 gold per hand with that combo), besides 5 (x1.25) and 8 (x1.5). / Kombo-mästarbonus på nivå 3 (x1,1) och nivå 10 "MAX" (x2 mult, +2 guld per hand med kombon), utöver 5 (x1,25) och 8 (x1,5).
490. Bulk tablet discount: -1 gold per 3 tablets/packs bought in the run (max -3). / Mängdrabatt på tavlor: -1 guld per 3 köpta tavlor/pack i runnen (max -3).
491. Difficulty changes tablet prices: easy x0.75, hard x1.35. / Svårighetsgrad påverkar tavelpriser: lätt x0,75, svår x1,35.
492. "Tablet Pack" shop item: choose any hand, +1 level (one per blind, price 6 + total levels/3, discounts apply). / Butiksvaran "Tavelpack": välj valfri kombo, +1 nivå (en per blind, pris 6 + totala nivåer/3, rabatter gäller).
493. Respec: move one level between hands in the shop for gold (3, +2 per use, max 15). / Respec: flytta en nivå mellan kombos i butiken mot guld (3, +2 per gång, max 15).
494. Per-run hand statistics (plays, average, best) in the hands view. / Kombostatistik per run (antal, snitt, bäst) i kombovyn.
495. Voucher Tablet Rebate: tablets and packs -25% (9g). / Voucher Tavelrabatt: tavlor och pack -25% (9g).
496. Vouchers Master's Apprentice (+1 level on most played hand, 11g) and Tablet Pack (+2 levels on a random hand, 14g). / Vouchers Mästarlärling (+1 nivå på mest spelad kombo, 11g) och Tavelpack (+2 nivåer på slumpad kombo, 14g).
497. Tier-II vouchers requiring the first: Bigger Hand II (+1 hand size, 18g), Faster Rolls II (+1 roll, 20g), More Discards II (+2 discards, 12g). / Nivå II-vouchers som kräver den första: Större Hand II (+1 handstorlek, 18g), Snabbare Kast II (+1 kast, 20g), Fler Slängar II (+2 slängar, 12g).
498. Vouchers Banker II (interest cap +3, 15g, needs Banker) and Extra Hand (+1 hand per blind, 24g). / Vouchers Bankir II (räntetak +3, 15g, kräver Bankir) och Extra Hand (+1 hand per blind, 24g).
499. Boss The Shackle: only 2 dice can be held. / Boss Handbojan: bara 2 tärningar kan sparas.
500. Boss The Looter: takes 25% of gold at blind start (max 12). / Boss Plundraren: tar 25% av guldet vid start (max 12).
501. Boss The Sealer: no discards. / Boss Förseglaren: inga slängar.
502. Boss Lord of Ones: sixes turn into ones. / Boss Ettornas Herre: sexor blir ettor.
503. Boss Echo Tyrant: same hand twice in a row gives half mult. / Boss Ekotyrannen: samma kombo två gånger i rad ger hälften mult.
504. Boss Fog Warden: first hand gives half mult. / Boss Dimvakten: första handen ger hälften mult.
505. Boss order is shuffled per run (16 bosses, mild ones first); bosses use `boss.e_rule`, not description text. / Bossordningen slumpas per run (16 bossar, milda först); bossarna använder `boss.e_rule`, inte beskrivningstext.
506. Boss reward: after a boss, choose one of two rewards in a modal (gold 10+2*ante, +1 level on most played hand, free modifier, 3 free shop rerolls). / Bossbelöning: efter en boss väljer man ett av två val i en modal (guld 10+2*ante, +1 nivå på mest spelad kombo, gratis modifierare, 3 gratis omkast).
507. Interest cap: blind-reward interest is capped (5 per source, +3 with Banker II); header shows the capped value. / Räntetak: räntan på blindbelöningen har tak (5 per källa, +3 med Bankir II); headern visar det kapade värdet.
508. Endless ante 9+: target x(1+0.12*(ante-8)) and +(ante-8) gold per cleared blind. / Endless ante 9+: mål x(1+0,12*(ante-8)) och +(ante-8) guld per avklarad blind.
509. Locked tier-II vouchers are shown greyed out with what they require. / Låsta nivå II-vouchers visas gråade med vad som krävs.
510. Dice bag shown in the shop and the dice view; reroll button shows free rerolls. / Tärningspåsen visas i butiken och tärningsvyn; omkastknappen visar gratis omkast.

#### Balansantaganden / Balance assumptions

- Blind targets are unchanged (ANTE_BASE x BLIND_MULT, 3 hands). The shop mod fix (481) is the biggest power addition: a persistent bag, capped at 4 mods; glass is consumed on break (25% per roll), so it is a temporary boost. Mod prices 3-7g, one-shot per purchase.
- Interest cap (507) is a global nerf: the base game's always-on floor(money/5) is capped as well. At 100 gold the blind reward falls from 23 to 8 (without Banker) and from 43 to 13 (with Banker). Reason: uncapped hoarding made tablets and vouchers irrelevant late. Banker II raises the cap to 8.
- Mastery: x1.1 (lv3), x1.25 (lv5), x1.5 (lv8), x2 (lv10). A lv10 hand needs 9 tablets (about 40-60g), so MAX is an endless/late-run goal.
- Tablet bulk discount -1 per 3 purchased (max -3); easy x0.75, hard x1.35 on tablets only; Tablet Rebate -25%. Prices never go below 1.
- Extra Hand (24g) is +33% scoring chances per blind and costs more than any base voucher; tier-II vouchers cost 12-20g and need their base voucher.
- Boss reward gold 10+2*ante keeps pace with shop prices; the free modifier requires a free bag slot.
- Endless ante 9+: base targets already grow x1.8 per ante; the extra 12% per ante and the gold bonus (ante-8) keep up with relic scaling.
- Boss order is random per run (Math.random; the seed field does not seed the game, so runs with the same seed are not deterministic). Bosses 1-2 are always from the mild set.

## Ljud och haptik (511-540)

511. Own audio engine, AudioContext created/resumed only after first interaction / Egen ljudmotor, AudioContext skapas/återupptas först efter första interaktionen
512. Loading indicator counts decoded buffers (f_decodedCount) / Laddningsindikator som räknar avkodade buffers (f_decodedCount)
513. New header 'Settings' button opening a sound panel / Ny headerknapp 'Settings' som öppnar en ljudpanel
514. Master/effects volume sliders saved in localStorage / Volymreglage master/effekter sparas i localStorage
515. Mute categories: interface, dice, scoring, gold/shop / Mute-kategorier: gränssnitt, tärningar, poäng, guld/butik
516. Voice queue limiting simultaneous sounds with priorities / Ljudkö som begränsar samtidiga ljud med prioritet
517. Soft brown-noise ambient loop via WebAudio, off by default / Mjuk ambient-brusloop via WebAudio, av som standard
518. Separate ambience volume, stopped only by mute / Egen ambiensvolym, stoppas bara av mute
519. Vibration toggle with navigator.vibrate guarded / Vibration med av/på-reglage, skyddad navigator.vibrate
520. Sound pauses when tab is hidden (visibilitychange) / Ljud pausas när fliken är dold
521. Hover and click sounds for buttons, shop cards, relics / Hover- och klickljud för knappar, butikskort och reliker
522. Distinct modal open/close sounds / Olika ljud för att öppna/stänga modal
523. Dice roll with several sample variants and rising pitch / Tärningsrullning med flera samplevarianter och stigande tonhöjd
524. Hold/release pitch follows number of held dice / Spara/släpp-ljud med tonhöjd efter antal sparade tärningar
525. Score sound pitch by score tier and combo mult / Poängljud med tonhöjd efter poängtier och kombo-mult
526. Per-relic note when a relic changes the score / Egen ton per relik som påverkar poängen
527. Coin sound when gold increases / Mynt-ljud när guldet ökar
528. Combo level-up arpeggio when buying a combo card / Kombo-nivå-upp-arpeggio vid tavelköp
529. Boss blind start sound and haptics / Boss-blind-start med eget ljud och haptik
530. Win jingle from a real sample / Vinstjingel med riktigt sample
531. Lose jingle from a real sample / Förlustjingel med riktigt sample
532. Warning tone when one hand remains / Varningsljud när en hand återstår
533. Achievement sound in three layers / Achievement-ljud i tre lager
534. Sell-relic sound instead of buy sound / Sälj-relik-ljud i stället för köpljudet
535. Shop reroll shuffle sound / Reroll-ljud i butiken
536. Haptics pattern on big scores / Haptikmönster vid stor poäng
537. Haptics on win, lose and boss start / Haptik vid vinst, förlust och bossstart
538. Error sound with real sample and short vibration / Felljud med riktigt sample och kort vibration
539. Buy sound varies by item type (relic, die mod, combo) / Köpljud varierar efter typ (relik, tärningsmod, tavla)
540. Bilingual settings panel updating live on language switch / Tvåspråkig panel som uppdateras direkt vid språkbyte

## Tillgänglighet och inmatning (541-570)

541. Accessibility panel g_openAccess() with its own header button "Aa" (title/aria-label) / Tillgänglighetspanel med egen headerknapp
542. Keys R roll, S score, D discard, T sort, H hold matching, blocked behind modals / Tangentgenvägar R, S, D, T, H (spärrade bakom modaler)
543. Keys 1-9 hold or release die 1-9 without re-render / Siffertangenter 1-9 sparar och släpper tärning utan omritning
544. Shortcut key chips on control buttons (mouse/keyboard devices) / Genvägsetiketter på kontrollknapparna
545. "?" shortcut list modal, C = hands, G = accessibility / Genvägslista med ?, C och G
546. Arrow keys, Home, End move focus between dice / Pilar, Home, End flyttar fokus mellan tärningar
547. Focus trap, focus moved in on open and restored on close / Fokusfälla, fokus in och tillbaka
548. role=dialog, aria-modal, aria-labelledby, inert background / Dialogroller och inert bakgrund
549. Keyboard access (Tab, Enter, Space) for clickable cards in modals / Tangentbordsstöd för klickbara kort i modaler
550. Swipe down closes info modals on touch / Svep nedåt stänger informationsmodaler
551. Visually hidden aria-live region reads score and combo / Osynlig live-region läser poäng och kombination
552. Log messages, toasts and roll results announced / Loggmeddelanden, toasts och kast läses upp
553. Dice aria-label with number, value, colour, modifier / Tärningars aria-label med värde, färg, modifierare
554. Labels on icon buttons, mute aria-pressed, progressbar role / Etiketter på ikonknappar och progressbar
555. High-contrast mode (html.g-hc, saved) + prefers-contrast / Högkontrastläge
556. Large text mode / Stor text-läge
557. Colour-blind mode: shape marker per die colour / Färgblindhetsläge med formmarkörer
558. Reduce-motion switch (defaults to system setting) / Minskad rörelse-växel
559. 44 px touch targets, header wraps on phone / Pekmål minst 44 px
560. Long-press on touch shows relic tooltip without selling / Långtryck visar reliktooltip utan försäljning
561. Relics focusable, tooltip on focus-within, Enter pins, Delete sells / Reliker nåbara via fokus med tooltip
562. No double-tap zoom, no tap highlight/callout, pinch zoom allowed, viewport-fit=cover / Ingen dubbeltryckszoom
563. Safe-area insets for sides, bottom and overlay / Safe-area-marginaler
564. Landscape phone layout (800x400, 667x375) without horizontal scroll / Liggande telefonläge
565. Sticky control row on portrait phone / Fast kontrollrad på telefon
566. Strong white focus ring / Tydlig fokusring
567. Skip link / Skip-länk
568. Language switch updates lang attribute, labels, skip link and announces / Språkbyte uppdaterar lang och etiketter
569. color-scheme dark, system light theme ignored / Mörkt färgschema, systemets ljusa tema ignoreras
570. Contrast: dim text and button/chip colours now 4.5:1 or better / Kontrast minst 4.5:1 på dämpad text och knappar

## Meta, achievements och hjälp (571-600)

571. Stats defaults + migration of old saves (missing/corrupt stats never crash) / Nya statistikfält med standardvärden och migrering av gammal sparad data
572. 12 new achievements (hand levels, economy, relic collections, one-hand clears, fast win, Endless 15, all hands played, marathon) / 12 nya achievements
573. Achievement categories with counts / Achievement-kategorier med räknare
574. Achievement progress bars x/y / Framstegsstaplar x/y
575. Stats tab "Best hands": top 5 ever and top 5 of latest run with hand names / Fliken Bästa händer
576. Run history: last 10 runs (ante, score, date, seed) in own localStorage key / Körhistorik, senaste 10
577. Daily Run button in menu (seed from today's date) / Daily Run-knapp
578. Best score per day + daily streak saved / Dagens bästa och serie sparas
579. Copy result button with clipboard, error handling and select-text fallback / Kopiera resultat
580. Seed tag in HUD / Seed i HUD
581. Seed + Daily tag on end screen / Seed på slutskärmen
582. Run summary with icon tiles at game over / Run summary med ikoner
583. First-time tutorial, 5 short steps with sprites / Handledning i 5 steg
584. Skip button + saved flag, replay from Help / Hoppa över, flagga sparas, spela om från Hjälp
585. Help modal with tabs Basics, Hands, Relics, Tips / Hjälp med flikar
586. Hand table with base chips/mult, needs and current level / Kombotabell
587. Rotating tips on game over/summary / Roterande tips vid slut
588. Rotating tips on the main menu / Roterande tips i menyn
589. Score-per-blind bar chart (bar = score/target, target line) / Poäng per blind-diagram
590. Hand histogram bars / Kombohistogram
591. Total play time in stats / Total speltid
592. Replay a past run's seed from history / Spela om seed från historiken
593. Achievement count badge on menu button / Märke x/y på menyknappen
594. Top 5 hands of the run in summary / Topp 5 händer i run summary
595. Overall achievement progress bar with percent / Total framstegsstapel
596. Records rows in All Time tab (best hand, gold earned, top hand level, streak) / Rekordrader
597. Abandoned runs recorded as quit in history / Avbrutna runs sparas
598. Run summary also on victory / Run summary vid seger
599. Hardened meta loader against bad localStorage shapes / Trasig lagring tåls
600. Click HUD seed tag to copy seed / Klick på seed i HUD kopierar
