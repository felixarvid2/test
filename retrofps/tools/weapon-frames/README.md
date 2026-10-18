# Vapenbildrutor

Förstapersonsvapnen i Krypta är renderade ur **RetroWeaponPack_V1.zip** (release `assets-large-v1`):
paketets FPS-armar (`FP_Arms.fbx`) får vapnet i höger hand (`hand_item_r`), poseras med paketets egna
animationer (BasePose, AimPose, Fire, Fire_Aiming, Reload/ReloadStart/Step/End, Draw) och renderas från
riggens kamera. Höger hand håller greppet, vänster hand framstocken/pumpen.

```bash
cd retrofps/tools/weapon-frames
npm i three playwright-core
unzip RetroWeaponPack_V1.zip 'Assets/RetroWeaponsPack/*' -d guns   # zippen från releasen
node batch.mjs all frames      # renderar 960x498-bildrutor + mynningspositioner till frames/
python3 pack.py                # beskär, skalar till 320x166-vyn och skriver assets/gfx/fp_*.png + js/weapons.js
```

`batch.mjs` letar efter Chromium i `/opt/pw-browsers/chromium`; ändra `executablePath` om din ligger någon annanstans.
