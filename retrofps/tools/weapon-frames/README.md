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
python3 pack.py qframes        # skalar och placerar i 320x166-vyn, skriver assets/gfx/fp_*.png + js/weapons.js
```

Kamerans placering per vapen står i `render.mjs` (`cam`), storlek och placering på skärmen i `pack.py` (`TARGET`).
`render.mjs` letar efter Chromium i `/opt/pw-browsers/chromium`; ändra `executablePath` om din ligger någon annanstans.
