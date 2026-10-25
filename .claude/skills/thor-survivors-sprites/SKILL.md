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

Tables at the top of the script: `MODELS` (clips kept per model; enemies keep walk/attack/death only to save memory),
`PROPS`, `DECALS` (longest side in px), `VFX` (stored size), `ICONS` (key -> source file), `GEMS`. `SCALE` = 0.78 turns the
64 px/m bake into a ~75 px human at 1080p. A frame is re-cut, Lanczos-scaled and shelf-packed with a 1 px gap, so no bleeding.
The script prints the file sizes and how much RAM every model sheet needs once decoded (target: all sheets together
under ~40 MB, APK under ~30 MB).

## Keys the game reads (render/SpriteAtlas.java)

- Models by name: `bastion`, `infected_colonist`, ... Clip slots: idle, walk (a character's `run` is stored as walk), attack, hit, death, static.
- Images: `prop.NAME`, `decal.NAME`, `vfx.NAME`, `icon.KEY` (weapon base id or passive id), `gem.crystal_*`, `pix.NAME` (hand-drawn in
  `render/PixelSprites.java`: coin, bag, roast, vacuum, orologion, rosary, clover, grenade, flask).
- Enemy key -> model: `game/EnemyType.modelFor` / `bossModelFor` (temporary VS-to-Ashfall mapping; test `AshfallAssetsTest`).
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
