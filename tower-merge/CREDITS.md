# Credits

Third-party assets in this project are CC0 (public domain). Credit is not required, but we give it.

## Audio

Files live in `public/assets/audio/` and are mapped to game keys by `public/assets/audio/manifest.json`.
All audio is converted with ffmpeg: sound effects are mono MP3 at 80 kbps with leading silence trimmed
and volume adjusted (peak about -3 dBFS; tower shots about -9 dBFS). Music is only re-encoded (stereo MP3 at
80 kbps) and gain-adjusted to a common loudness; loop points are untouched.

- **Kenney Impact Sounds** by Kenney (kenney.nl) - CC0 1.0 - <https://kenney.nl/assets/impact-sounds>
  - `shoot_cannon` <- impactPunch_heavy_002, `shoot_frost` <- impactGlass_light_000, `shoot_sniper` <- impactWood_light_000
  - `explosion` <- impactMining_003, `hit` <- impactSoft_medium_001, `freeze` <- impactGlass_heavy_000
  - `enemy_die` <- impactSoft_heavy_002, `place` <- impactWood_medium_000, `castle_hit` <- impactPlate_heavy_002
  - `ability_freeze` <- impactGlass_heavy_001
- **Kenney Interface Sounds** by Kenney (kenney.nl) - CC0 1.0 - <https://kenney.nl/assets/interface-sounds>
  - `shoot_arrow` <- pluck_002, `shoot_poison` <- drop_003, `invalid` <- error_008, `upgrade_pick` <- confirmation_002
- **Kenney RPG Audio** by Kenney (kenney.nl) - CC0 1.0 - <https://kenney.nl/assets/rpg-audio>
  - `shoot_fire` <- drawKnife3, `coin` <- handleCoins2, `purchase` <- handleCoins, `unlock` <- metalLatch
- **Kenney Digital Audio** by Kenney (kenney.nl) - CC0 1.0 - <https://kenney.nl/assets/digital-audio>
  - `shoot_lightning` <- phaserDown2, `shoot_magic` <- phaserUp7, `explosion_big` <- spaceTrash1
  - `boss_die` <- spaceTrash5, `boss_roar` <- lowThreeTone, `boss_warning` <- zapThreeToneDown
  - `merge` <- powerUp5, `synergy` <- powerUp12, `wave_start` <- threeTone1
  - `ability_meteor` <- lowDown, `ability_repair` <- pepSound2, `ability_frenzy` <- phaseJump3
- **Kenney Casino Audio** by Kenney (kenney.nl) - CC0 1.0 - <https://kenney.nl/assets/casino-audio>
  - `buy` <- chips-stack-1, `sell` <- chip-lay-2, `card_flip` <- card-slide-3
- **Kenney Music Jingles** by Kenney (kenney.nl) - CC0 1.0 - <https://kenney.nl/assets/music-jingles>
  - `merge_big` <- jingles_NES13, `legendary` <- jingles_NES00, `wave_clear` <- jingles_PIZZI01
  - `victory` <- jingles_STEEL02, `defeat` <- jingles_STEEL06, `achievement` <- jingles_HIT11
- **Kenney UI Audio** (UI SFX Set) by Kenney (kenney.nl) - CC0 1.0 - <https://kenney.nl/assets/ui-audio>
  - `click` <- click1
- **Abstraction Music Loop Bundle** (2026 Q2) by Abstraction / Tallbeard Studios (Benjamin Burnes) - CC0 1.0 - <https://tallbeard.itch.io/music-loop-bundle>
  - `music_menu` <- Week 16 - Vacation Day ADVENTURE, `music_battle` <- Week 14 - Lift You Up CHORUS,
    `music_boss` <- Week 19 - Dark Portents SHROUDED FUTURE
