# Ashfall – AI-generated assets

Everything generated through an API for [Ashfall](../../ashfall): 3D models and icons from
[Meshy](https://www.meshy.ai), and 2D art from FLUX.2 Turbo on [fal.ai](https://fal.ai). The theme is
dark industrial sci-fi. Each source folder has a `prompts.json` with the prompt that made each file.
Run `npm run assets:export` in `ashfall/` to rebuild this folder from the game's files.

## `meshy/` – Meshy (text/image to 3D, text to image)

| Folder | Content |
|---|---|
| `models/characters/` | 8 characters: the 3 player classes (rigged, with animations) and 5 NPCs |
| `models/enemies/` | 12 enemies and bosses (the 6 rigged ones have idle, walk, attack, hit and death clips) |
| `models/props/` | 35 props: crates, barrels, terminals, vehicles, landmarks, weapons |
| `models/environment/` | 9 building blocks: walls, rocks, pipes, catwalks, smokestacks |
| `previews/` | Meshy's render of every model (512 px), sorted like `models/` |
| `icons/` | 56 icons: items, skills, crystals and the 3 class portraits |

The models are game-ready GLB files (roughly 1–30k vertices, WebP textures up to 1024 px, quantized
vertices). Three.js, Babylon.js, Godot 4 and Blender 4 open them directly.

## `flux/` – FLUX.2 Turbo (fal.ai)

| Folder | Content |
|---|---|
| `items/` | Item icons: 3 looks per base type, plus the uniques |
| `aspects/` | 34 legendary aspect icons |
| `stats/` | 14 icons for the stats (life, armour, crit, speed and so on) |
| `bosses/` | 20 boss portraits |
| `frames/` | 6 rarity frames (common to mythic), transparent middle |
| `decals/` | 14 transparent ground decals: oil, blood, scorch, rubble, grates, bones, moss |
| `vfx/` | 75 effect sprites on transparency (fire, smoke, explosions, sparks, frost, poison, magic circles), plus `atlas.webp`, the packed 9 × 9 atlas |
| `regions/` | 4 wide paintings, one per region (1280 × 720) |
| `menu/` | Title screen and one splash per class (1280 × 720) |
| `maps/` | 4 painted region maps, made with the edit endpoint from a drawing of each zone's layout |
| `textures/` | `mine_rock`: a seamless ground texture |

Icons and portraits are the full-resolution originals (about 1000 px). Frames, decals and effect
sprites are the cleaned-up versions with transparency: the originals were drawn on black or a
chroma-key colour.

The other ground textures in the game were supplied by hand and are not included here.
