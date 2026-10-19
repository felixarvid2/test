# Vapenbildrutor

Förstapersonsvapnen i Krypta är renderade ur **RetroWeaponPack_V1.zip** (release `assets-large-v1`) i
Doom/Quake 1-stil: inga händer, bara vapnet som sticker rakt fram från skärmens nederkant.
Vapnet riktas upp så att pipan pekar rakt in i bilden, kameran står snett bakom och ovanför, och
paketets egna `*_Fire`-animationer ger slide- och pumprörelsen. Rekyl, vapenbyte och omladdning görs i spelet.

```bash
cd retrofps/tools/weapon-frames
npm i three playwright-core
unzip RetroWeaponPack_V1.zip 'Assets/RetroWeaponsPack/*' -d guns   # zippen från releasen
node render.mjs all qframes    # renderar 960x498-bildrutor + mynningspositioner
python3 pack.py qframes,xframes # skalar och placerar i 320x166-vyn, skriver assets/gfx/fp_*.png + js/weapons.js
```

Dubbelbössan, armborsten, signalpistolen och prickskyttegeväret är statiska modeller ur `assets/3d-models`
(PSX Shotgun Pack, Kickin It Studios Low Poly Weapon Pack och Guns&Explosives) utan armrigg. De renderas med
`render-static.mjs` och `static.html`: `static-defs.json` anger modell, textur, vridning (`rot`, `tilt`, `meshRot` för delar
som är modellerade i ett annat läge, som signalpistolens uppfällda pipa) och kamera. Rekylen ritas fram genom att vapnet
knuffas bakåt och nosen lyfts.

```bash
node render-static.mjs side      # sidovyer side_<vapen>.png: pipan ska peka åt höger och ovansidan uppåt
node render-static.mjs fp        # xframes/ med vilobild, sju rekylrutor och meta.json
python3 pack.py qframes,xframes  # packar alla åtta vapnen
```

Kamerans placering per vapen står i `render.mjs` och `static-defs.json` (`cam`), storlek och placering på skärmen i `pack.py` (`TARGET`).
`render.mjs` letar efter Chromium i `/opt/pw-browsers/chromium`; ändra `executablePath` om din ligger någon annanstans.

Version 5: stridsyxan (`axe`, KayKit Fantasy Weapons Bits `axe_A`, CC0), eldkastaren (`flamer`) och granattillsatsen
(`launcher`). Eldkastaren är hopbyggd i `static-defs.json` med `parts`: röret är Guns&Explosives `Pipe_Bomb` (utsträckt med
`stretch`), tanken, banden, munstycket och tändlågan är enkla former. Granattillsatsen är PSX-paketets avsågade enpipiga
hagelgevär med ett grovt rör (`parts`). `nozzle` anger vilken del mynningen räknas från. Yxan använder `melee`: en vilopose
och åtta svingposer (hand och vinklar) från övre högra hörnet ned mot vänster; pack.py lägger dem i vyn som de renderats
(`native`) i stället för att skala dem till en målhöjd. De nya vapnen får hel eller ingen täckning per pixel.

```bash
node render-static.mjs fp axe,flamer,launcher
node render-static.mjs side axe,flamer,launcher
python3 pack.py xframes ../../ axe,flamer,launcher   # packar bara dessa, övriga poster i js/weapons.js lämnas orörda
python3 pack.py pick ../../ axe,flamer,launcher      # pick_<vapen>.png ur sidovyerna
```
