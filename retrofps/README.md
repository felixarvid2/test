# KRYPTA – retro-FPS

Ett raycaster-FPS (Wolfenstein/Doom-känsla) som körs direkt i webbläsaren – öppna `index.html` via en lokal webbserver
(`python3 -m http.server` i den här mappen) och klicka START. Tre banor, fyra vapen, tre fiendetyper.

**Kontroller:** WASD/pilar rör, mus siktar, vänsterklick/F skjuter, E/mellanslag öppnar dörrar, Shift springer,
1–4/Q/mushjul byter vapen, M karta, N ljud av/på. Grinden i slutet öppnas när alla fiender är döda.

## Assets som används

| Vad | Källa |
|---|---|
| Vapen (pistol, hagelgevär, gevär, kpist) | release `assets-large-v1` → `RetroWeaponPack_V1.zip`. FBX-modellerna + albedo-texturer renderades till 2D-sprites (`assets/gfx/sp_*.png`), plus `MuzzleFlash.png` |
| Väggar, dörrar, golv, tak | `assets/textures/retro-textures-fantasy` (Kenney, CC0) |
| Skelett, skelett med skära, vampyr | `assets/2d-pixel/Enemy_Animations_Set` |
| Hälsodryck | `assets/2d-sprites/potions` |
| Ljudeffekter | `assets/audio/400 Sounds Pack` samt release `assets-large-v1` → `Horror.SFX.Free.zip` (drone, morrande, gore m.m.) |
| Typsnitt | Press Start 2P (OFL) |

Se licensfilerna i respektive källpaket.
