---
name: thor-survivors-sprites
description: Add or change Thor Survivors sprites - pick CC0 art from thor-survivors/art-src/, read sheet indices from a numbered contact sheet, map them in tools/build_atlas.py, regenerate atlas.json and CREDITS.txt, and check the result. Use when adding an enemy, boss, pickup, projectile, icon or ground tile, or when a sprite looks wrong on screen.
---

# Sprites for Thor Survivors

Art is CC0 only. Each pack in `thor-survivors/art-src/` has `LICENSE.txt` (or `License.txt`) and `SOURCE.md`.
Record source URL, author and licence in the pack's `SOURCE.md` before using it. Credits are generated into
`app/src/main/assets/sprites/CREDITS.txt`, never edited by hand.

## Sheets

| Key | Pack in art-src | Sheet | Columns |
|---|---|---|---|
| D | `kenney-tiny-dungeon` | `Tilemap/tilemap.png` | 12 |
| T | `kenney-tiny-town` | `Tilemap/tilemap.png` | 12 |
| C | `clint-bellanger-tiny-creatures` | `Tilemap/tilemap.png` | 10 |

All are 16 px tiles with 1 px spacing and no outer margin. Tile `i` is at `x=(i%cols)*17`, `y=(i//cols)*17`.
Sizes: D and T 203x186, C 170x306.

## Steps

1. Render a numbered contact sheet of the sheet before choosing an index. Read indices by eye have been wrong:
   C:105 is a griffin, the mummy is C:95, C:14 is a bare-chested man, the hooded reaper is C:4.
2. Map it in `thor-survivors/tools/build_atlas.py`. Keys: `player`, `enemy.<KEY>`, `boss.<KEY>`, `pickup.*`,
   `proj.<WEAPON>`, `icon.<KEY>`, `tile.FOREST`, `tile.LIBRARY`. Entries are `S(sheet, index, k=..., tint=..., alpha=..., rot=...)`.
3. Regenerate and preview: `cd thor-survivors && python3 tools/build_atlas.py <scratch>/preview.png`, with
   `<scratch>` the session scratchpad. It rewrites `atlas.json`, the PNG copies and `CREDITS.txt`, then reads
   `atlas.json` back for the preview.
4. Check the preview with the Read tool.
5. Run the tests: `./gradlew testDebugUnitTest --tests '*AtlasJsonTest*' --tests '*AtlasBitmapTest*'`, then the
   screenshot tests (see `thor-survivors-screenshots`).

## Scales (integer, nearest-neighbour, at 1080p)

- Player 5x, enemies 4x (XL 5x, some 6x), bosses 10x, chest 4x, coins 3x, projectiles 3-5x, ground tile 5x.
- Keep the 16 px chunky-outline style. Tints are multiply colour filters baked into the frames.
- Missing key: a procedural fallback is drawn. Hand-drawn pixel art lives in `render/PixelSprites.java`
  (gems, roast, King Bible, cross, Mad Forest brazier, library candelabra). Use it when no sheet sprite fits.

## Tiny Town traps

- 3/4 and 27/28 are tree halves. Never use them alone.
- The 3x3 forest blocks 6-11, 18-23 and 30-35 do not tile cleanly (stray half-tree arcs). Build clumps from
  whole trees 15 and 16 and bushes (D 5) instead.
- Dirt autotile: 12-14, 24-26, 36-38, with inner corners 39-42 (the `tile.FOREST` list also includes 43).
- Library: shelves 63 and 75, table 72, barrel 82, stool 73. The pack has no real bookshelves or candles.
- Stage ground lists are in `tools/build_atlas.py` (`tile.FOREST`, `tile.LIBRARY`); `WorldGen` indexes them.

## Done means

- `atlas.json` and the PNGs in `app/src/main/assets/sprites/` are regenerated, not hand-edited.
- The preview shows every new sprite with its label and it looks right at the in-game size.
- `CREDITS.txt` lists the new pack. No non-CC0 art is added.
