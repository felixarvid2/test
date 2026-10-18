# YouTube Playables: technical requirements for Tower Merge

Verified against the official documentation on **2026-10-18** (live pages fetched that day; the
revision history lists the newest requirements change as 2026-08-25, Trust and Safety only). Where a
page contradicts itself this document follows the normative requirement text and says so. Re-check
before every submission: the English pages are definitive.

Sources (all `https://developers.google.com/youtube/gaming/playables/...`):

| Short name | Path |
|---|---|
| Certification overview | `/certification/requirements` |
| Integration | `/certification/requirements_integration` |
| Stability and performance | `/certification/requirements_stability` |
| Design | `/certification/requirements_design` |
| Monetization (requirements) | `/certification/requirements_monetization` |
| Privacy and data | `/certification/requirements_privacydata` |
| Trust and safety | `/certification/requirements_trustsafety` |
| Revision history | `/certification/revisionhistory` |
| Certification FAQ | `/support/certification_faq` |
| SDK reference | `/reference/sdk` |
| SDK getting started | `/reference/getting_started` |
| Monetization (guide) | `/reference/monetization` |
| Test suite guide | `/reference/test_suite_guide` |

## Bundle (Stability)

- Initial bundle (everything downloaded from page load until `gameReady`): **MUST < 30 MiB**, SHOULD < 15 MiB. Compressed transfer size counts.
- Total bundle (all files hosted by YouTube): **MUST < 250 MiB** (SHOULD lazy-load). Not a hard cap if assets load incrementally; contact support.
- Every single file: **MUST < 30 MiB** (hard limit), SHOULD < 512 KiB.
- At most **8,000 files**.
- File names: only `A-Z a-z 0-9 _ - .`.
- **Relative paths only** for files inside the bundle (absolute paths fail to load). `vite.config.ts` sets `base: './'`.
- `index.html` at the root of the bundle (getting started). Playables must be a **single page application** (Privacy and data, section 8).
- SHOULD be interactive in under 5 s.
- MUST NOT exceed 512 MB peak JS heap; no reproducible crashes.
- Standards-compliant Web APIs only; must work in Edge, Chrome, Firefox and the YouTube app on Android and iOS.
- Code: no obfuscation (minification and TS transpilation are fine). YouTube may refuse games it cannot analyse because of WebAssembly, `eval()` or web workers. Keep the bundle free of all three; not yet verified for the Phaser production bundle, so run the Playables bundle analyzer on it.

## Network and privacy

- **No external calls** to any URL or service except Google/YouTube APIs required by other technical requirements. Internal analytics are not an exception; remote databases or runtime level fetching are not accepted (a remote-data pilot exists). All data ships in the bundle. This includes CDN fonts, scripts and images.
- Playables are served with a Content Security Policy that restricts requests; test with the CSP header locally (test suite guide). Inline scripts created at runtime need the page `nonce`.
- Must not collect personal information (names, ages, locations, usernames, passwords) or show login or sign-up looking UI. No clipboard access without an explicit paste. No QR-code-like graphics.
- Off-platform monetization (ads, in-app purchases) is not allowed. Audience is 13+ and general; not "made for kids".

## SDK loading and lifecycle (Integration)

- Load `<script src="https://www.youtube.com/game_api/v1"></script>` **before any game code** (SDK getting started; the one allowed external script). Outside Playables the SDK is a no-op or absent, so guard `window.ytgame`. `ytgame.IN_PLAYABLES_ENV` tells the environment (`createPlatform` uses it).
- `ytgame.game.firstFrameReady()` MUST be called while a loading or splash screen is rendering. `ytgame.game.gameReady()` MUST be called only when the game is interactive (main menu), never while a loading screen is still up. `firstFrameReady` before `gameReady`.
- `sendScore` is optional; if used the best score sent must match the best score in the save. Value must be an integer <= `Number.MAX_SAFE_INTEGER`. Tower Merge does not send scores yet (platform method exists).

## Saving

- Use `ytgame.game.saveData(string)` / `loadData()` and **no other mechanism** for progress (so no localStorage inside Playables). `YouTubePlatform` never touches localStorage; `BrowserPlatform` uses it for local development only.
- **`loadData` MUST complete before the first `saveData`** (earlier calls are rejected). `YouTubePlatform` enforces the order.
- Limits: saved game **MUST < 3 MiB**, SHOULD < 500 KiB (our guard refuses to write above 500 KiB). Valid well-formed UTF-16. The final save on exit is best effort and limited to **64 KiB**; the live save is far smaller.
- MUST call `saveData` after material progress (we debounce 500 ms and flush at once on pause). MUST load saves from older game versions without errors (versioned schema, `migrate` + per-field repair).

## Pause, resume, audio

- MUST pause **all** execution after `onPause` (game loop, music, input, network, rendering) and resume only on `onResume`. `onPause` fires on every pause including exit and gives a short window to save. `onResume` is not guaranteed to follow.
- MUST NOT use the Page Visibility API or similar; use only `ytgame.system.onPause/onResume`. (`BrowserPlatform` uses `visibilitychange` only in a plain browser; `YouTubePlatform` never registers DOM visibility listeners.) Note for the game code: do not add own `visibilitychange`/`blur` handling, and review Phaser's built-in `game.events` visibility/blur auto-pause when integrating.
- MUST respect the YouTube mute state: initialise from `ytgame.system.isAudioEnabled()`, follow `onAudioEnabledChange`. With YouTube muted there must be no output and in-game controls must not change that. MUST respect device volume. SHOULD NOT have an overall mute button (we only offer music and sfx volume sliders and a mute toggle in settings; consider removing the toggle for the YouTube build). No unexpected sound.
- Audio autoplay: the FAQ names "wait for user interaction before playing" as the most common failure. YouTube may focus the game without a tap, so music must start as soon as the browser allows (`AudioManager` starts music when Phaser unlocks audio).

## Design

- MUST work in **all aspect ratios** and adjust to viewport changes; SHOULD fill the viewport, otherwise centred with letterbox/pillarbox. MUST NOT lock orientation. MUST keep state when resized. Tower Merge is portrait-first, so landscape gets pillarboxes (Phaser `Scale.FIT` centred).
- MUST support touch and mouse for every interaction; keyboard SHOULD; Esc SHOULD close dialogs (never `preventDefault` Esc). Haptics need an on/off toggle.
- MUST render text and graphics crisply at all densities. MUST say when content ends. Metadata: no branding or logos in thumbnails, titles or descriptions.

## Ads and rewarded ads: supported

- Certification: in-game ads are **allowed only through YouTube's own functions** (`ytgame.ads`). Games that use them MUST keep handling audio (`isAudioEnabled`/`onAudioEnabledChange`) and pause/resume (`onPause`/`onResume`) correctly, and MUST enable monetization in the **Developer Portal** (each ad type can be switched on or off, default on). Off-platform ads and purchases are forbidden. The monetization requirements summary box says ads are "strictly prohibited", which contradicts its own requirement list; we follow the requirement list and the SDK reference.
- SDK (reference, checked): `ytgame.ads.requestInterstitialAd(): Promise<void>` (natural breaks; never to reward) and `ytgame.ads.requestRewardedAd(rewardId: string): Promise<boolean>`. `true` = player met the reward conditions, `false` = not; rejects on failure (the error may be undefined). It "makes no guarantee that an ad was shown". `rewardId`: required, one unique id per reward type, reused each time that reward is offered, **no user data** (readable string or UUID).
- Guide: call `requestRewardedAd` **only when the player explicitly asks** for a rewarded ad; wrap in try/catch and provide fallback logic. Ads show only to a subset of users in eligible regions/platforms, so many players will never get one. Pre-roll ads are automatic.
- No documented frequency cap, cooldown or per-ad-pause instruction. Our own caps live in `src/rewards/config.ts`.

### What this repo does

- `src/rewards/YouTubeRewardProvider.ts` wraps `requestRewardedAd` (true => completed, false => cancelled, throw => failed) behind `REWARD_CONFIG.youtubeAdsEnabled`, **default off**. Flip it only after rewarded ads are enabled for the game in the Developer Portal and verified with the test suite. Reward ids are in `REWARD_CONFIG.placements[*].rewardId`.
- With the flag off (or `ytgame.ads` missing) the YouTube build uses `NullRewardProvider`; `RewardService.gate()` then returns `'gems'` (pay the gem price from config) or `'none'`. Nothing in the game requires an ad or gems to progress.
- `?mockads=1` (and dev builds) use the mock overlay only in `BrowserPlatform`; `YouTubePlatform` ignores it.
- Interstitials are not used.

## SDK surface used (typed in `src/platform/ytgame.d.ts`, all documented)

`ytgame.IN_PLAYABLES_ENV`, `SDK_VERSION`, `game.firstFrameReady/gameReady/loadData/saveData`, `system.onPause/onResume/isAudioEnabled/onAudioEnabledChange/getLanguage`, `health.logError/logWarning` (no parameters, best effort, rate limited), `engagement.sendScore({ value })`, `ads.requestRewardedAd/requestInterstitialAd`. `SdkError` carries `errorType` in `API_UNAVAILABLE | INVALID_PARAMS | SIZE_LIMIT_EXCEEDED | UNKNOWN`. `engagement.openYTContent` exists but is not used.

Changes relative to `tiny-dungeon/src/platform/ytgame.d.ts`: added `ads.requestInterstitialAd`, documented limits (3 MiB, integer score), and `sendScore` now clamps to `Number.MAX_SAFE_INTEGER`. Everything else matched the current reference.

## Pre-submission checklist

1. `<script src="https://www.youtube.com/game_api/v1">` is the first script in `index.html`.
2. `firstFrameReady` on the loading scene, `gameReady` when the menu is interactive.
3. Production bundle: relative paths, < 8,000 files, each file < 30 MiB (aim < 512 KiB), only `[A-Za-z0-9_.-]` names, no wasm/eval/workers, no external requests (fonts included).
4. Run the Playables test suite and bundle analyzer; check pause/resume, mute, resize and portrait/landscape.
5. Rewarded ads: portal monetization on, `youtubeAdsEnabled = true`, still playable with ads off.
