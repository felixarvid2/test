---
name: playwright-webgl-testing
description: Test, screenshot and debug a WebGL/three.js browser game with Playwright in a headless cloud container (SwiftShader, no GPU) - setup, seeding state, driving the game from page.evaluate, catching one-frame glitches, regression tests, screenshots for READMEs. Use when verifying a browser game change in the real page, hunting flicker/black frames, or taking game screenshots without a display.
---

# Playwright testing of a WebGL game (headless, no GPU)

Learned on Krabba-passet (static HTML/JS game, three.js). Paths below are from that container; check them.

## Setup

- Serve the folder: `(npx http-server -p 8765 -s -c-1 . &)` in the game directory (`-c-1` = no cache).
  The server dies with the container; check with `curl -s -o /dev/null http://localhost:8765/` first.
- Playwright from a global install: `NODE_PATH=/opt/node22/lib/node_modules node test/x.js`. Chromium is
  preinstalled; never run `playwright install`.
- WebGL without a GPU:
  `chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })`.
  Expect **1–20 fps**. Anything timing-based (flicker, adaptive resolution) will not reproduce by just
  playing; force the trigger instead (e.g. reset `prScale` so a resize happens).
- Seed settings before load with `page.addInitScript(() => localStorage.setItem(KEY, JSON.stringify({...})))`:
  mode, quality, `tutorialDone`, and the current `lastVersion` so the "what's new" dialog does not cover the
  menu (bump it in every test when the version changes).

## Driving the game

- Use the game's own API in `page.evaluate` (`NV.game.startWeek(3)`, `g.setMode('hd2d')`, `w.pos.set(...)`)
  rather than synthetic input. For deterministic checks step the loop yourself:
  `for (...) { w.update(1/30); } w.render(1/30, w.zone());`.
- Typed input can arrive before the UI is ready (a terminal that is still "connecting" echoes raw text).
  Call the component's API (`terminal.submit(cmd)`) and note that some actions only prefill input that still
  has to be submitted.
- Collect `pageerror` events in every test and fail on them; an exit code of 0 is not enough.

## Catching one-frame glitches

- Wrap `world.render` and, right after drawing, `drawImage(renderer.domElement)` into a 32×18 canvas and read
  `getImageData`. With `preserveDrawingBuffer: false` this only works in the same task as the draw, which is
  exactly when the browser would composite it. Log frames whose mean brightness drops below ~60 % of the
  running median, or whose alpha is 0 (cleared canvas), with a state snapshot (camera, zoom, zone).
- A cleared canvas reads as alpha 0; the user sees the page background (often near-black).

## Regression tests

- Add the check to the project's browser test, run it, then prove it catches the bug:
  `git stash push -- path/to/fixed.js && node test/x.js; git stash pop`. Report both numbers
  (e.g. canvas alpha 0 before, 255 after; tooltip height 259 px before, 34 px after).
- Measure DOM state synchronously after the action; the game loop may reset it before an `await` returns.
- Do not switch branches, stash, or rewrite files while a background test run is reading them.

## Screenshots for docs

- 1280×720 viewport, wait 4–9 s after starting for models, toasts and intro animations; hide leftover toasts
  in `evaluate` before the shot.
- Convert PNG to JPEG without extra tools: `page.setContent('<img src="data:image/png;base64,...">')` then
  `page.screenshot({ type: 'jpeg', quality: 86 })` (~1 MB -> ~150 kB).
- Look at every screenshot before using it (crop, overlays, half-typed commands).

## Running the suite

- Browser tests take 1–5 min each on SwiftShader; run them in a background loop that writes one line per test
  to a file, and wait on that file. A foreground command is killed at 10 min.
- `run_in_background` jobs have their own time limit; set it high for a full suite.
