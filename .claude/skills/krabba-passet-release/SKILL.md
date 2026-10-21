---
name: krabba-passet-release
description: Ship a change to Krabba-passet (natverksspel/ in felixarvid2/test) - version bump checklist, test suite, PR, republishing the claude.ai artifact, and copying a release to felixarvid2/Krabba-passet with a zip. Use for any change to natverksspel/ that is to be shipped, when the artifact must be republished, or when a new Krabba-passet release is wanted.
---

# Shipping Krabba-passet

The game lives in `natverksspel/` of felixarvid2/test (static HTML/JS, three.js r158, namespace `NV`).
The owner writes in Swedish; answer in Swedish. Standing workflow for every request: implement -> README +
"what's new" -> full test suite -> commit -> push -> PR -> merge -> republish the artifact -> short summary.

## Version bump (every shipped change)

1. `index.html`: every `?v=X.Y` (about 55 tags): `sed -i 's/?v=10\.3/?v=10.4/g' index.html`.
2. `js/ui/more.js`: `var VERSION = '...'` and a new first `<li><b>Version X.Y:</b> ...</li>` in `whatsNew`.
3. Tests: every `'X.Y'` (`lastVersion`) in `test/*.js`, or the news dialog covers the menu and tests fail:
   `grep -rl "'10\.3'" test | xargs sed -i "s/'10\.3'/'10.4'/g"` (the quotes keep IPs like 10.0.0.1 safe).
4. `README.md`: a `## Version X.Y: ...` section above the previous one (cause, fix, which test checks it).
   Big releases number every item and use the same numbers in code comments.
5. New controls go in the README "Styrning" table and the F1 help (`help-v10` in `js/world/v10.js`).

## Tests

- Node: `node test/levels.js` ("Alla veckor OK"), `node test/build.js` ("Alla byggen OK").
- Browser (Playwright, server on port 8765 in `natverksspel/`, see the `playwright-webgl-testing` skill):
  `v10 hd2d v9 boot ui flow features v3 v4 v5 v8 build_ui report`. Each must end with "inga fel" (flow prints
  JSON) and have 0 `pageerror`. `test/view.js` is a screenshot tool that takes arguments, not a test.
- New behaviour gets a check in `test/v10.js` (latest feature test); prove it fails without the fix.

## Git and PR

- Branch `claude/network-tech-game-design-54lxlx`. Every PR is merged, so start each change from main:
  `git fetch origin main && git checkout -B <branch> origin/main` (stash first if needed), then push normally.
- Other projects (tiny-dungeon, rune, ...) land on main in parallel; check `git diff <last merge> origin/main
  -- natverksspel` before assuming the game is unchanged.
- The root `CLAUDE.md` says `shipper` merges only after the user approves; the owner's standing request for
  this game is "create the PR and merge it". Follow the newest instruction from the user.

## Republish the artifact

URL: https://claude.ai/artifact/Y1dRntTjUpHWHGZRUuKt17 (page file in the scratchpad: `krabba-passet.html`).
The page is `index.html`'s body with all CSS inlined; JS files are published next to it:
```python
import re
idx = open('index.html').read()
css = re.findall(r'href="(css/[^"?]+)', idx)
body = idx[idx.index('<body>') + 6: idx.index('</body>')]
page = '<title>Krabba-passet</title>\n<style>\n:root{color-scheme:dark}\n' + ''.join(open(c).read() for c in css) + '</style>\n' + body
```
Publish with `url` = the artifact, `root` = path to `natverksspel` **relative to the current directory**
(`.` when inside it), and `files` = only the JS files changed since the last publish. CSS changes ride in the
page. A file published from another session must be read (`action: read`, `path`) before it can be
overwritten; diff it against git first. Artifacts cannot serve `.glb` (models are stored as `.gltf.json`).

## Release to felixarvid2/Krabba-passet

1. Copy exactly the committed game: `git archive <commit> natverksspel | tar x` and copy its contents to the
   repo root. Fix README paths (`npx http-server natverksspel`, `node natverksspel/test/...`, the code tree).
2. Zip for players, without `test/`, in a top folder `Krabba-passet-X.Y/`; unzip it into an empty folder,
   serve it on another port and load it: 0 page errors, 0 HTTP 4xx, all three view modes start.
3. Cloud sessions get HTTP 403 both for `POST /repos/.../releases` and for pushing tags. Do not retry; send the
   zip with SendUserFile and give the owner the steps: Releases -> Draft new release -> tag `vX.Y` (create on
   publish, target main) -> attach zip -> paste the release notes. Repo "Code -> Download ZIP" also works.
4. README screenshots live in `docs/*.jpg` (HD-2D hero, then 2D / 3D / terminal table).
