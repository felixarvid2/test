---
name: thor-survivors-sprites
description: Add or change Thor Survivors art (ASHFALL look) - baked 8-direction models, props, decals, effects, icons; map them in tools/build_ashfall_assets.py, rebuild assets/ashfall/, and check the result. Use when adding an enemy model, prop, decal, effect or icon, changing which model an enemy key uses, or when a sprite looks wrong on screen.
---

# Art for Thor Survivors (ASHFALL: Lumen Tide)

All art is the owner's own (Meshy 3D models, FLUX 2D images), so there is no third-party licence to record. The game no longer
uses the Kenney / Tiny Creatures sheets (they stay in `art-src/`; `tools/build_atlas.py` is the legacy builder).

## Sources

| What | Where |
|---|---|
| Baked models (8 directions, clips) | `thor-survivors/art-src/ashfall-baked/<characters\|enemies\|props\|environment>/<name>.png + .json` (made by `tools/bake/`, see `tools/bake/README.md`) |
| Effects (black background, additive), decals, ground texture, stat icons | `/home/user/test/assets/ashfall-ai/flux/{vfx,decals,textures,stats}` |
| Skill / item / crystal icons | `/home/user/test/assets/ashfall-ai/meshy/icons/` |

## Pipeline

`cd thor-survivors && python3 tools/build_ashfall_assets.py` (Pillow + numpy, about 2 minutes: lossless WebP) writes
`app/src/main/assets/ashfall/`: `m_<model>.webp` per animated model, `world.webp` (props, environment, decals), `vfx.webp`,
`icons.webp`, `ground/mine_rock.webp`, `manifest.json`, `CREDITS.txt`. Never edit these by hand.

Tables at the top of the script: `MODELS` (clips kept per model; enemies keep walk, attack and death, plus the clips the archetypes use: sergeant `attack2` (shots),
welder `run` (the dash), smelter `cast`, vire `cast` and `cast2`, spore carrier `cast`; the baked sources already hold them, so only this list and a rebuild are needed),
`PROPS`, `DECALS` (longest side in px), `VFX` (stored size), `ICONS` (key -> source file), `GEMS`. `SCALE` = 0.78 turns the
64 px/m bake into a ~75 px human at 1080p. A frame is re-cut, Lanczos-scaled and shelf-packed with a 1 px gap, so no bleeding.
The script prints the file sizes and how much RAM every model sheet needs once decoded (target: all sheets together
under ~70 MB now that the enemy action clips are in (68 MB), APK under ~30 MB).

## Keys the game reads (render/SpriteAtlas.java)

- Models by name: `bastion`, `infected_colonist`, ... Clip slots (`SpriteAtlas.C_*`): idle, walk (a character's `run` is stored as walk), attack, attack2, hit, death,
  static, cast, cast2, `C_RUN` (a second gait, loaded only when the model also has `walk`: the welder's dash). Enemies ask for a clip with `Enemy.clip`
  (`Entities.CL_ATTACK2/CAST/CAST2/RUN`, set by `game/EnemyAi`); `WorldRenderer.drawCreature` plays the closest clip the model has (cast -> attack -> a squash
  and shake of the walk frame for a model without either).
- Images: `prop.NAME`, `decal.NAME`, `vfx.NAME`, `icon.KEY` (weapon base id or passive id), `gem.crystal_*`, `pix.NAME` (hand-drawn in
  `render/PixelSprites.java`: coin, bag, roast, vacuum, orologion, rosary, clover, grenade, flask).
- Enemy key -> model: the Ashfall roster names its model in the data (`ashfall_data.json` `enemies.<KEY>.sprite`, also for the bosses: `CARGO_LOADER`,
  `SLAGBORN`, `VIRE_AWAKENED`, `SMELTER_FOREMAN`, `THE_FIRST`); `game/EnemyType.modelFor` / `bossModelFor` is only the mapping of the old VS keys (test `AshfallAssetsTest`).
- Equipment and boss art (phase 9 and 10): `ICONS` also holds the 24 item icons (`icon.<name>`, lowercase, the `icon` field of the item in `ashfall_data.json`
  `equipment`: Meshy icons for the first item of a type, `flux/items/<name>_2|3` for the second and third and the six `unique_*`), `FRAMES` the four rarity frames
  (`icon.frame_common`, `frame_magic` = Uncommon, `frame_rare`, `frame_unique`, drawn over the icon, never rounded) and `PORTRAITS` the boss banner pictures
  (`icon.boss_<enemy key>`, 192 px, from `assets/ashfall-ai/flux/bosses`: Cargo Loader `drowned_engine`, Slagborn `pyre_warden`, Vire `vire`, Foreman `foreman_dray`,
  The First `the_first`). `AshfallAssetsTest.equipmentIconsRarityFramesAndBossPortraitsAreInTheManifest` fails when one is missing. An equipment crate on the ground is the
  `prop.supply_chest` image with a rarity-coloured glow (`WorldRenderer.drawEquipCrate`).
- Stage props and decals: `game/WorldGen` (`PROP` and `DECAL` name arrays; a name there must exist in the manifest).

## Adding things

1. New enemy model: bake it (`tools/bake`), add a line to `MODELS`, map keys in `EnemyType.modelFor`, add its gore colour in `goreOf`.
   Unrigged models (one `static` frame per direction) get procedural bob/sway in `WorldRenderer.drawCreature`: add a case there.
2. New prop or decal: add to `PROPS` / `DECALS`, then to the `WorldGen` arrays and its placement rules (it is a pure function of the cell;
   keep the start area clear; `WorldGenTest` checks ownership, density and the clear start).
3. New effect: add to `VFX`, draw it with `WorldRenderer.glow(...)` (additive, tinted by a colour filter).
4. Rebuild, then run `./gradlew testDebugUnitTest --tests '*AtlasBitmapTest*' --tests '*AshfallAssetsTest*'` and look at the screenshots
   (skill `thor-survivors-screenshots`: `bestiary.png` shows every model in all 8 directions at game size).

## Traps

- Death frames can reach outside `frameSize`: always draw relative to the feet anchor (`drawFrameAt` does).
- Baked walk clips are slow (~2.9 fps): the renderer sets fps from the movement speed.
- Effect pictures are RGB on black: the build turns brightness into alpha (alpha = max(r,g,b)), so draw them additively.
- Models are baked dark. Creatures are drawn with a brightening colour matrix (`ENEMY_GAIN`) so they stay readable on dark ground;
  bosses skip the gain.
- Icon sources have white or black corner pixels: the build clips them to a rounded square.

## UI art (phase 11, not in the atlas)

The bottom-screen skin art lives outside `ashfall/`: `python3 tools/build_ui_assets.py` writes `app/src/main/assets/ui/` (stage paintings 640x360,
title 960x540, hero cards 640x360, portraits 256x256, `stats.webp` = 14 stat icons in `UiArt.STAT_KEYS` order; `UiAssetsTest` checks the order against the
script) and the font is `assets/fonts/BarlowCondensed-*.ttf` (OFL, licence next to it). These pictures are decoded lazily by `ui/UiArt` and released when
a run starts, so a new menu picture goes through `UiArt.get(file, group, maxWidth)`, never into the atlas. Rarity frames, weapon/passive/branch icons and boss
portraits stay in `icons.webp` (`ICONS`, `FRAMES`, `PORTRAITS` in `build_ashfall_assets.py`).
