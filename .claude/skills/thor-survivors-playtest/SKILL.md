---
name: thor-survivors-playtest
description: Turn the owner's short Swedish feedback from playing Thor Survivors on the AYN Thor into a structured playtest report - symptom, likely cause in the code, severity, fix proposal, how to verify headless - and a prioritised fix list. Use when the owner reports how the game felt, bugs seen on the device, or "det kändes ...".
---

# Playtest report (thor-survivors)

Adapted from Claude-Code-Game-Studios (MIT), see .claude/CCGS-LICENSE.txt.

Input is a few lines from the owner, in Swedish, from a session on the real device ("fiender fastnar", "för lätt efter
10 min", "lagg när det är mycket"). The owner cannot be asked many questions: infer, mark guesses, ask at most the
one or two questions whose answer changes the fix. Answer the owner in Swedish; this skill file stays English.

## Steps

1. Split the feedback into single observations, one per symptom. Quote the owner's words in Swedish, then restate in
   English. Keep unknowns explicit: stage, weapon, minute, build, 60 or 120 Hz, which screen, were not stated.
2. Classify each observation:
   - Bug (something plainly breaks: stuck, crash, wrong sprite, no sound, freeze)
   - Balance (too easy/hard, one weapon useless, gold or XP feels off) -> `thor-survivors-balance`
   - Performance (lag, stutter, heat) -> `thor-survivors-perf`
   - Feel/polish (hit feedback, readability, menus, sound mix)
   - Design (missing feature, confusing flow) -> `thor-survivors-quick-design`
3. For each, find the likely cause with `Explore` (ask a question, not a file list). Useful entry points:
   `game/Sim.java` (all gameplay), `game/Engine.java` (phases, run flow), `screen/GameView.java` (loop, input, refresh
   rate), `screen/DualScreenManager.java` and `PanelPresentation.java` (second screen), `screen/InputRouter.java`
   (gamepad), `render/WorldRenderer.java`, `ui/PanelRenderer.java`, `audio/`. Cite `path:line`. Separate verified
   (read or reproduced) from suspected. Hardware-only issues (README "Ej testat": which bottom-screen path the Thor
   uses, gamepad routing, real fps) have no code cause until the owner runs a diagnostic; propose the cheapest one.
4. Propose a fix and a headless verification for each: a JVM test (`SimSmokeTest`/`WeaponBehaviourTest` style seeded
   run), a Robolectric screenshot (skill `thor-survivors-screenshots`), or a measurement (balance/perf skills). If it
   cannot be verified headless, say what the owner should check on the device and how.
5. Prioritise: S1 crash/softlock/unwinnable, S2 clearly wrong behaviour or unplayable perf, S3 annoying, S4 polish.
   Within a level, order by (frequency x how early the player meets it) / effort. Group fixes that touch the same file.

## Output

```
# Playtest <date>  build: <APK date or commit>  stage/weapon/time: <as known, else unknown>
Raw feedback: <the owner's text, verbatim>

| # | Symptom (sv quote -> en) | Type | Severity | Likely cause (path:line, verified/suspected) | Fix proposal | Verify |

## Prioritised fix list
1. <title> - S?, effort S/M/L, owner agent (implementer/mechanic), spec in one line
## Questions for the owner (max 2, only if they change the fix)
## Worked well (keep it; the owner said so or did not complain)
```
Show it in the reply; save nowhere unless asked. Hand the fix list to `implementer` item by item, with the verification
step included in the spec. Do not fix anything inside this skill.
