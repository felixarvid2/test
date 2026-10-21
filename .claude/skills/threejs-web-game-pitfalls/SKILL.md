---
name: threejs-web-game-pitfalls
description: Rendering and UI bugs met while building a plain-JS three.js browser game with several view modes (first person, 2.5D/HD-2D diorama, 2D canvas) - black flashes, sprites vanishing into walls, UI leftovers between modes, shader patching, raycasting sprites. Use when a three.js/WebGL page flickers black, billboards clip into geometry, a mode switch leaves broken UI, or when patching built-in three.js shaders.
---

# three.js web game pitfalls

Learned on Krabba-passet (three.js r158, global `THREE`, no bundler). Check each claim against the project
and three.js version at hand.

## Black flash: canvas resized after drawing

- Setting a canvas size (`renderer.setSize`, `setPixelRatio`, `canvas.width`) **clears the drawing buffer**.
  With `preserveDrawingBuffer: false` the browser then composites an empty canvas, i.e. the page background,
  until the next frame is drawn: a one-frame black flash.
- Typical cause: dynamic resolution (`perf()` lowers/raises the pixel ratio from measured fps) called at the
  **end** of `render()`. Heavier modes hover around the thresholds and flash every few seconds.
- Fix: never resize after drawing. Set a flag (`needResize = true`) in `perf()` and in the window `resize`
  listener, and apply it at the **start** of `render()`, right before drawing.
- Add hysteresis so the resolution does not oscillate: e.g. 2 slow measurements in a row to lower, 3 fast to
  raise, no raise within 10 s of a lowering.
- Proof: `drawImage(renderer.domElement)` into a small 2D canvas right after a resize returns alpha 0.

## Billboard sprites vanish into the wall behind them

- `THREE.Sprite` always faces the camera. With a camera pitched down ~40°, the sprite plane leans back by the
  pitch: the head of a 1.7 m figure ends up ~1.1 m behind its feet, inside a wall the figure stands near.
- Fix without changing the look: in the sprite vertex shader (`onBeforeCompile`, replace
  `mvPosition.xy += rotatedPosition;`) move each corner **along its own view ray** onto the vertical plane
  through the anchor (feet). Projection is unchanged, depth becomes that of an upright figure:
  ```glsl
  vec3 hdC = mvPosition.xyz + vec3( rotatedPosition, 0.0 );
  vec3 hdUp = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
  vec3 hdN = vec3( 0.0, - hdUp.z, hdUp.y );            // normal of the plane (view x and world up)
  float hdD = dot( hdN, hdC );
  vec3 hdP = abs( hdD ) > 1e-4 ? hdC * ( dot( hdN, mvPosition.xyz ) / hdD ) : hdC;
  float hdL = length( hdP );
  mvPosition.xyz = hdP * ( max( hdL - BIAS, 0.05 ) / hdL );   // pull ~0.45 m toward the camera
  ```
  The small bias toward the camera (also along the ray) covers the sprite's half width when the camera is
  rotated 45° to a wall. Objects really in front still occlude it.
- A "flat depth = feet depth" trick is **not** enough: the top of a wall is closer to a pitched camera than
  its base, so it still covers the head.
- Set `customProgramCacheKey` when using `onBeforeCompile`, or materials share the wrong program.

## Mode switches leave UI behind

- A mode that writes inline styles (`el.style.left/top`, e.g. a tooltip that follows the cursor) keeps them
  after switching mode. Inline `top` beats the other mode's `top: auto; bottom: 18%`, so the box stretches
  between both: a tall dark panel that blinks as the tooltip shows/hides.
- Fix: write CSS variables (`el.style.setProperty('--hx', ...)`) and read them only in the mode's rule
  (`body.mode-hd2d #hint { left: var(--hx, 50%); top: var(--hy, 60%); }`). Other modes ignore them.
- Toggle functions get called "off" before "on" ever ran (e.g. `setHD2D(false)` at startup): guard on the
  init flag (`if (!this.hdInit) { this.hd2d = false; return; }`) instead of touching unbuilt objects.
- Things added to shared lists for one mode (clickable rack parts in `interactables`) must be removed when
  leaving it, or the other mode highlights or picks them.

## Shaders, raycasting, performance

- Patching every material (cut-away shader via `onBeforeCompile`) on each frame or on a timer recompiles
  needlessly; re-patch only when the scene's object count changed. Newly loaded models need the patch too.
- `Raycaster.intersectObjects` on `THREE.Sprite` throws "reading 'matrixWorld'" unless
  `raycaster.camera = camera` is set.
- Run occlusion raycasts (is something between camera and player?) every few frames, not every frame.
- Cache-bust every script/stylesheet with `?v=<version>` and bump it on every release, or players keep the
  old file next to a new one.

## Patterns that held up

- Feature modules wrap prototype methods (`var ORIG = W.update; W.update = function () { ORIG.apply(this,
  arguments); ... }`) and register late hooks with an `afterGame(fn)` helper. Keep the original call first
  and return its result.
- Number each improvement in a comment (`// 105–106: ...`) and list the same numbers in the README; it makes
  "where is item 133" a grep.
