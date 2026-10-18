# Art style – Tower Merge: Last Stand

All sprites are original hand-authored SVG (sources in `art/`, served from
`public/assets/sprites/`). One shared style keeps them consistent:

**Look:** polished casual-mobile cartoon fantasy. Chunky, readable silhouettes that still read
at 48 px on a phone in a small YouTube player.

## Rules

- **Outline:** every shape group has a dark outline `#2b1d3a`, stroke width ≈ 3% of the canvas
  (6 px on a 192 canvas, 4 px on 128, 9 px on 320). `stroke-linejoin="round"`.
- **Shading:** cel style, 3 tones per material: base, shadow (≈ 25% darker, on the lower-right)
  and highlight (≈ 25% lighter, upper-left). Light comes from the upper left. Use linear gradients
  sparingly (only for glows, gems and magic).
- **Ground shadow:** a soft ellipse `#000` at 25% opacity under every tower, enemy and boss.
- **Saturation:** vibrant but controlled; no pure #ff0000/#00ff00. Keep backgrounds desaturated
  relative to units so units pop.
- **No text** in sprites.
- **Canvas & anchor:** towers 192×192 with the base centre at (96, 168); enemies 128×128 centred,
  feet at y≈112, facing **right**; bosses 320×320, feet at y≈290, facing right; projectiles 64×64
  pointing right; icons 128×128 centred with a 6 px margin.

## Palette

| Use | Colours |
|---|---|
| Outline | `#2b1d3a` |
| Stone | `#8d8fa8` base, `#686a85` shadow, `#b9bbd1` highlight |
| Wood | `#a8673a` base, `#7a4523` shadow, `#cf8c55` highlight |
| Gold trim | `#f5c542` base, `#c48a1c` shadow, `#ffe58a` highlight |
| Grass (board) | `#7fbf4d`, `#6aa83f`, `#93cf5f` |
| Path (dirt) | `#d9b27c`, `#c49a62` edge |
| Arrow tower | green `#5cb85c` banners |
| Cannon | iron `#4a4f63`, orange `#ff8a3d` |
| Frost | ice `#7fdcff`, `#c9f3ff` |
| Lightning | violet `#9d6bff`, yellow `#ffe14d` |
| Fire | red-orange `#ff5a36`, `#ffb03b` |
| Poison | toxic green `#8be04e`, purple `#7a3fa0` |
| Sniper | navy `#3b5b9a`, brass `#d4a64a` |
| Magic | magenta `#e05ad6`, cyan `#5ef0ff` |

## Tower level progression (same for every type)

1. **L1** – small wooden tower on a stone footing, the type's weapon/crystal on top.
2. **L2** – stone tower, taller, type-coloured banner.
3. **L3** – reinforced stone with battlements, two banners, bigger weapon.
4. **L4** – gold trim, glowing type-coloured gem/rune, ornate roof.
5. **L5** – grand fortress tower: widest silhouette, crown/spire, soft glow aura in the type colour.

Each level must be recognisably the same type (shared weapon motif and colour) and clearly bigger
and fancier than the previous one.
