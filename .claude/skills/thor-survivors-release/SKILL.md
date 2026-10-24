---
name: thor-survivors-release
description: Ship a change to Thor Survivors (thor-survivors/ in felixarvid2/test) - Android SDK setup in a fresh container, Gradle build and unit tests, rebuilding dist/thor-survivors.apk, README update, PR and merge to main, and the APK handed to the owner. Use for any change to thor-survivors/ that is to be shipped, when the APK in dist/ must be refreshed, or when the Android SDK is missing.
---

# Shipping Thor Survivors

The game is plain Java Android (no dependencies), package `se.felixarvid.thorsurvivors`, minSdk 29, targetSdk 35,
for the AYN Thor dual-screen handheld. The owner writes in Swedish; answer in Swedish.
Standing workflow: implement -> README -> build and tests -> dist APK -> commit -> push -> PR -> merge -> summary.

## SDK (fresh container only)

- SDK root `/opt/android-sdk`. Missing? Install it:
  1. Unzip `https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip` into
     `/opt/android-sdk/cmdline-tools/latest` (unzip into an empty scratch dir first, then move `cmdline-tools/*` there).
  2. `yes | sdkmanager --sdk_root=/opt/android-sdk --licenses`
  3. `sdkmanager --sdk_root=/opt/android-sdk "platforms;android-35" "build-tools;35.0.0" "platform-tools"`
- `thor-survivors/local.properties` must contain `sdk.dir=/opt/android-sdk`. It is gitignored; never commit it.

## Build and test

- `cd thor-survivors && ./gradlew assembleDebug testDebugUnitTest`
- Add `--offline` once dependencies are cached. Google Maven or Maven Central may answer HTTP 429: wait 10 s, retry.
- Count results from `app/build/test-results/testDebugUnitTest/*.xml` (sum `tests=`, check `failures=` and `errors=`).
  `README.md` states the count (89 at last update); update it when the number changes.
- Tests use the real `app/src/main/assets/game_data.json`. Robolectric NATIVE graphics tests need
  `android.useAndroidX=true` (already in `gradle.properties`).
- Known pitfall: a test that depends on random aim must give the weapon a target. Fire Wand (`FIREBALL`) fires a
  random direction when no enemy is near; see `DestructibleTest.java` for the pattern (`s.addEnemy(...)`). Never rely on luck.

## APK in dist/

1. `cp app/build/outputs/apk/debug/app-debug.apk dist/thor-survivors.apk` only after the build above passed.
2. Compare before committing: `cmp app/build/outputs/apk/debug/app-debug.apk dist/thor-survivors.apk`. Never overwrite
   `dist/` with a stale build.
3. The APK is signed with the committed `debug.keystore` (`app/build.gradle`), so updates install over the old app.
4. Players download it from `https://github.com/felixarvid2/test/raw/main/thor-survivors/dist/thor-survivors.apk`.

## Data and visuals

- Balance data: `python3 tools/build_data.py /path/to/REA/data` writes `app/src/main/assets/game_data.json`.
  The source is commercial game data: personal use only, never publish the app.
- Sprites: see the `thor-survivors-sprites` skill. Visual checks: see `thor-survivors-screenshots`.
- Update `README.md` (Swedish) whenever behaviour changes.

## Git and PR

- Develop on the session branch. Commit, then `git push` (never `--force`).
- Open a PR to `main`. Merge it with a merge commit once the checks pass (standing approval in `/home/user/test/CLAUDE.md`).
- Then fast-forward the local branch to `origin/main`.
- Check the diff of other projects before assuming `thor-survivors/` is unchanged: `git diff <last merge> origin/main -- thor-survivors`.

## Hand-off

- Send the owner the APK file (SendUserFile) and a short Swedish summary: what changed, test count, and what is
  untested on the device (120 Hz pacing, bottom-screen path, gamepad routing; see `thor-survivors-screenshots`).
