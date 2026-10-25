# tools/bake - 3D to sprite sheets

Bakes the Ashfall GLB models (`assets/ashfall-ai/meshy/models/`) into 8-direction 2D sprite atlases for
Thor Survivors' pre-rendered 3/4 top-down look. Output: `art-src/ashfall-baked/<category>/<name>.png|.json`.
This only produces art; the game does not load it yet.

## Run

```
cd tools/bake
npm install                      # three, sharp, playwright-core (uses /opt/pw-browsers Chromium; no playwright install)
node bake.mjs --check            # prints the WebGL renderer and exits
node bake.mjs                    # everything (~10 min, SwiftShader software GL)
node bake.mjs --only sergeant,vire --category enemies
node preview.mjs                 # contact sheets on dark rock -> scratchpad bake/ (or --out DIR)
```

Options: `--out DIR`, `--ss 2` (supersample factor), `--ppm 64`, `--elevation 38`, `--no-outline`,
`--no-quant`, `--list`, lighting `--key --rim --ambient --env --fill --exposure`, `--verbose`.
Set `CHROME_PATH` to use another Chromium. Output is deterministic (same machine/renderer gives identical files).

## What it does

- Headless Chromium + three.js (`page/`, served by a tiny local static server) loads each GLB, orthographic
  camera, elevation 38 deg, dark industrial lighting (low warm key, cool rim, dim ambient/env), transparent background.
- Scale: one world scale for all models, 64 px per horizontal metre (a 1.8 m human is about 96 px tall). Models too
  big for a 512 px frame (cranes, refinery, pillar) are baked at a smaller `pxPerMetre`, recorded in the manifest.
- 8 directions for characters and enemies (rotate the model), 1 direction for props and environment.
  Direction order (yaw step 45 deg, clockwise on screen, S faces the camera): S, SE, E, NE, N, NW, W, SW.
- Clips are sampled at fixed frame counts: idle 4, walk/run 8, attack/attack2 7, hit 3, death 8, others 6.
  Loops (idle, walk, run) sample i/N, one-shots i/(N-1). Unrigged models get one `static` frame.
- Root motion is cancelled (sprites stay on the spot, the game moves them); `death` keeps the fall but starts at the idle position.
- Frames are rendered at `--ss` x, Lanczos-downscaled, given a 1 px dark outline, trimmed to their opaque bounds,
  shelf-packed into one atlas and palette-quantised (256 colours, libimagequant via sharp).

## Manifest (`<name>.json`)

- `frameSize` [w,h] nominal logical frame, `anchor` [x,y] feet/ground point in that frame, `pxPerMetre`, `camera`.
- `directions`, and per clip `fps`, `count`, `loop`, `duration` (s), `frames[dir][i] = [x, y, w, h, ox, oy]`:
  the rect in the PNG and its trim offset in the logical frame. `[ox, oy, w, h]` are the opaque bounds
  (they can reach outside `frameSize`, e.g. a death fall; draw relative to the anchor). Empty frames are all zero.
- Draw a frame at `(worldX - anchor.x + ox, worldY - anchor.y + oy)`.

## Notes

- `overrides.json` (empty by default) can sample a window of a clip: `{"spectre": {"attack": {"start": 0, "end": 1.2, "frames": 8}}}`.
  Several clips are long, multi-move sequences (spectre attack 7.3 s / shoot 7.8 s / throw 5.8 s, vire attack 7.3 s);
  at 6-7 frames they are sampled coarsely, so curate windows before using them in game.
- walk/run clips holding several gait cycles are cut to one cycle (`sourceCycles` in the manifest).
- `periodErrors` in `page/bake-page.js` and `dbg.mjs` are the diagnostics used for that; `probe.mjs` lists model sizes and clips.
