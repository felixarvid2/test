# Credits

Every third-party asset in this project is CC0 (public domain). Credit is not required, but we give it.

The licence files of all packs below are read by `tools/build_assets.py`, which refuses to run unless they say CC0.

## Art

- **Kenney Tiny Dungeon** by Kenney (kenney.nl) - CC0 1.0 - <https://kenney.nl/assets/tiny-dungeon>  
  Used for: public/assets/sprites/tiles.png (unmodified copy of Tilemap/tilemap_packed.png); icons chest, hero, knockback (tiles 89, 96, 117); colour palette + outline colour sampled for all original art in extra.png / icons.png.
- **Original pixel art** (`public/assets/sprites/extra.png`, `icons.png`): drawn in code by `tools/art_sprites.py` and `tools/art_icons.py` for this project, in the style and palette of Kenney Tiny Dungeon. Not third-party.

## Audio

- **Kenney RPG Audio** by Kenney (kenney.nl) - CC0 1.0 - <https://kenney.nl/assets/rpg-audio>  
  Outputs in `public/assets/audio/`: `swing.mp3` <- `knifeSlice.ogg`, `coin.mp3` <- `handleCoins2.ogg`, `door.mp3` <- `doorOpen_1.ogg`, `chest.mp3` <- `metalLatch.ogg` + `creak3.ogg`, `purchase.mp3` <- `handleCoins.ogg`.
- **Kenney Impact Sounds** by Kenney (kenney.nl) - CC0 1.0 - <https://kenney.nl/assets/impact-sounds>  
  Outputs in `public/assets/audio/`: `hit.mp3` <- `impactSoft_medium_001.ogg`, `crit.mp3` <- `impactPunch_heavy_001.ogg`, `enemyDeath.mp3` <- `impactSoft_heavy_002.ogg`, `playerHurt.mp3` <- `impactPunch_heavy_003.ogg`, `bossWarning.mp3` <- `impactBell_heavy_000.ogg`, `explosion.mp3` <- `impactMining_003.ogg`, `thunder.mp3` <- `impactPlate_heavy_000.ogg`.
- **Kenney Interface Sounds** by Kenney (kenney.nl) - CC0 1.0 - <https://kenney.nl/assets/interface-sounds>  
  Outputs in `public/assets/audio/`: `shoot.mp3` <- `pluck_002.ogg`, `xp.mp3` <- `glass_005.ogg`, `upgradePick.mp3` <- `confirmation_002.ogg`, `click.mp3` <- `click_003.ogg`, `error.mp3` <- `error_003.ogg`.
- **Kenney Music Jingles** by Kenney (kenney.nl) - CC0 1.0 - <https://kenney.nl/assets/music-jingles>  
  Outputs in `public/assets/audio/`: `levelUp.mp3` <- `jingles_NES12.ogg`, `victory.mp3` <- `jingles_STEEL02.ogg`, `defeat.mp3` <- `jingles_STEEL06.ogg`, `revive.mp3` <- `jingles_PIZZI02.ogg`.
- **Kenney Digital Audio** by Kenney (kenney.nl) - CC0 1.0 - <https://kenney.nl/assets/digital-audio>  
  Outputs in `public/assets/audio/`: `magic.mp3` <- `zap1.ogg`, `synergy.mp3` <- `powerUp12.ogg`, `bossDeath.mp3` <- `spaceTrash5.ogg`.
- **Kenney Casino Audio** by Kenney (kenney.nl) - CC0 1.0 - <https://kenney.nl/assets/casino-audio>  
  Outputs in `public/assets/audio/`: `cardFlip.mp3` <- `card-slide-3.ogg`.
- **Abstraction Music Loop Bundle** by Abstraction / Tallbeard Studios (Benjamin Burnes) - CC0 1.0 - <https://tallbeard.itch.io/music-loop-bundle>  
  Outputs in `public/assets/audio/`: `music_menu.mp3` <- `Week 19 - Dark Portents MYSTERIOUS TRAVELER.ogg`, `music_dungeon.mp3` <- `Week 17 - Alley Cat DUMPSTER DIVIN.ogg`, `music_boss.mp3` <- `Week 19 - Dark Portents SHROUDED FUTURE.ogg`.

All audio is converted with ffmpeg (mono 44.1 kHz MP3 for SFX with silence trimmed and loudness normalised; some are pitch-shifted / low-passed, see `SFX_RECIPES` in `tools/build_assets.py`). Music is only re-encoded and gain-adjusted (loop points untouched).

## Fonts (`public/assets/fonts`)

- **Monogram** by datagoblin - CC0 - <https://datagoblin.itch.io/monogram> (`monogram.ttf`)
- **Kenney Future** by Kenney (kenney.nl) - CC0 - <https://kenney.nl/assets/kenney-fonts> (`kenney-future.ttf`)

## Libraries

- Phaser 3 (MIT) - see `package.json`; not bundled in this repository.
