#!/usr/bin/env python3
"""Tiny Dungeon art + audio pipeline. Run from the project root:  python3 tools/build_assets.py

Produces (all re-runnable, deterministic):
  public/assets/sprites/tiles.png           copy of Kenney "Tiny Dungeon" packed tilemap (CC0)
  public/assets/sprites/extra.png + .json   original pixel art, Phaser JSON-hash atlas (tools/art_sprites.py)
  public/assets/sprites/icons.png + .json   original 16x16 icons, same format (tools/art_icons.py)
  public/assets/audio/<key>.mp3             SFX + music converted with ffmpeg from CC0 Kenney / Abstraction packs
  CREDITS.md                                sources, authors, licences (licence files are read and checked here)
  docs/art-preview.png                      contact sheet for reviewing the art
and finally verifies every key listed in src/game/assets.ts exists.

Needs python3 + Pillow and ffmpeg/ffprobe on PATH. Helper modules live next to this file.
"""
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PIL import Image, ImageDraw, ImageFont  # noqa: E402

import art_common  # noqa: E402,F401
import art_icons  # noqa: E402
import art_sprites  # noqa: E402
from build_assets_paths import ROOT, LIB, TILES_PNG  # noqa: E402

SPRITES_DIR = os.path.join(ROOT, 'public', 'assets', 'sprites')
AUDIO_DIR = os.path.join(ROOT, 'public', 'assets', 'audio')
ASSETS_TS = os.path.join(ROOT, 'src', 'game', 'assets.ts')
PREVIEW = os.path.join(ROOT, 'docs', 'art-preview.png')
CREDITS = os.path.join(ROOT, 'CREDITS.md')

# ------------------------------------------------------------------------------------------ sources

KENNEY_TD_DIR = os.path.join(LIB, '2d-pixel', 'tiny-dungeon')
AUDIO_PACKS = {
    # id: (folder, display name, author, url, licence file)
    'rpg': ('rpg-audio', 'Kenney RPG Audio', 'Kenney (kenney.nl)', 'https://kenney.nl/assets/rpg-audio', 'License.txt'),
    'impact': ('impact-sounds', 'Kenney Impact Sounds', 'Kenney (kenney.nl)', 'https://kenney.nl/assets/impact-sounds', 'License.txt'),
    'interface': ('interface-sounds', 'Kenney Interface Sounds', 'Kenney (kenney.nl)', 'https://kenney.nl/assets/interface-sounds', 'License.txt'),
    'jingles': ('music-jingles', 'Kenney Music Jingles', 'Kenney (kenney.nl)', 'https://kenney.nl/assets/music-jingles', 'License.txt'),
    'digital': ('digital-audio', 'Kenney Digital Audio', 'Kenney (kenney.nl)', 'https://kenney.nl/assets/digital-audio', 'License.txt'),
    'casino': ('casino-audio', 'Kenney Casino Audio', 'Kenney (kenney.nl)', 'https://kenney.nl/assets/casino-audio', 'License.txt'),
    'loops': ('music-loop-bundle-2026-q2', 'Abstraction Music Loop Bundle', 'Abstraction / Tallbeard Studios (Benjamin Burnes)',
              'https://tallbeard.itch.io/music-loop-bundle', '_LICENSE.txt'),
}

# SFX recipe: key -> dict(src=[(pack, relative path)...], pitch=playback-rate factor, lp=lowpass Hz,
# hp=highpass Hz, max=max seconds (hard cut with a fade), note=why). Sources are concatenated if several.
SFX_RECIPES = {
    'swing': dict(src=[('rpg', 'Audio/knifeSlice.ogg')], note='blade whoosh'),
    'shoot': dict(src=[('interface', 'Audio/pluck_002.ogg')], note='bow-string twang'),
    'magic': dict(src=[('digital', 'Audio/zap1.ogg')], max=0.9, note='magic zap'),
    'hit': dict(src=[('impact', 'Audio/impactSoft_medium_001.ogg')], note='short thud'),
    'crit': dict(src=[('impact', 'Audio/impactPunch_heavy_001.ogg')], note='heavy punch'),
    'enemyDeath': dict(src=[('impact', 'Audio/impactSoft_heavy_002.ogg')], pitch=1.2, note='squish / pop (pitched up)'),
    'playerHurt': dict(src=[('impact', 'Audio/impactPunch_heavy_003.ogg')], pitch=0.85, note='heavy punch pitched down'),
    'coin': dict(src=[('rpg', 'Audio/handleCoins2.ogg')], note='coin clink'),
    'xp': dict(src=[('interface', 'Audio/glass_005.ogg')], hp=300, note='soft glassy blip'),
    'levelUp': dict(src=[('jingles', 'Audio/8-Bit jingles/jingles_NES12.ogg')], jingle=True, note='rising 8-bit jingle'),
    'upgradePick': dict(src=[('interface', 'Audio/confirmation_002.ogg')], note='confirmation chime'),
    'synergy': dict(src=[('digital', 'Audio/powerUp12.ogg')], note='shiny power-up'),
    'cardFlip': dict(src=[('casino', 'Audio/card-slide-3.ogg')], boost=5, note='card slide'),
    'bossWarning': dict(src=[('impact', 'Audio/impactBell_heavy_000.ogg')], pitch=0.55, lp=1400, max=1.5,
                        note='heavy bell pitched down: ominous low sting'),
    'bossDeath': dict(src=[('digital', 'Audio/spaceTrash5.ogg')], pitch=0.6, lp=3000, max=1.5,
                      note='crash/noise burst pitched down'),
    'victory': dict(src=[('jingles', 'Audio/Steel jingles/jingles_STEEL02.ogg')], jingle=True, note='rising steel jingle'),
    'defeat': dict(src=[('jingles', 'Audio/Steel jingles/jingles_STEEL06.ogg')], jingle=True, note='falling steel jingle'),
    'explosion': dict(src=[('impact', 'Audio/impactMining_003.ogg')], pitch=0.6, lp=2500, max=1.3,
                      note='rock impact pitched down and low-passed: boom'),
    'thunder': dict(src=[('impact', 'Audio/impactPlate_heavy_000.ogg')], pitch=0.45, lp=1800, note='plate hit pitched way down: crack + rumble'),
    'click': dict(src=[('interface', 'Audio/click_003.ogg')], note='UI click'),
    'door': dict(src=[('rpg', 'Audio/doorOpen_1.ogg')], note='door opening'),
    'chest': dict(src=[('rpg', 'Audio/metalLatch.ogg'), ('rpg', 'Audio/creak3.ogg')], note='latch click then lid creak'),
    'revive': dict(src=[('jingles', 'Audio/Pizzicato jingles/jingles_PIZZI02.ogg')], jingle=True, note='hopeful rising pizzicato'),
    'purchase': dict(src=[('rpg', 'Audio/handleCoins.ogg')], boost=5, note='handful of coins'),
    'error': dict(src=[('interface', 'Audio/error_003.ogg')], note='error buzz'),
}
MUSIC_RECIPES = {
    'music_menu': dict(src=('loops', 'Week 19 - Dark Portents MYSTERIOUS TRAVELER.ogg'), note='calm, dark, mysterious'),
    'music_dungeon': dict(src=('loops', 'Week 17 - Alley Cat DUMPSTER DIVIN.ogg'), note='energetic, bass-driven'),
    'music_boss': dict(src=('loops', 'Week 19 - Dark Portents SHROUDED FUTURE.ogg'), note='low, tense'),
}
# which Kenney packs the sprite outputs came from
SPRITE_SOURCES = [
    ('Kenney Tiny Dungeon', 'Kenney (kenney.nl)', 'https://kenney.nl/assets/tiny-dungeon', os.path.join(KENNEY_TD_DIR, 'License.txt'),
     'public/assets/sprites/tiles.png (unmodified copy of Tilemap/tilemap_packed.png); icons chest, hero, knockback (tiles 89, 96, 117); '
     'colour palette + outline colour sampled for all original art in extra.png / icons.png'),
]


def sh(cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, text=True, **kw)


def rel(p):
    return os.path.relpath(p, ROOT)


# ------------------------------------------------------------------------------------------ licences

def check_licence(path):
    text = open(path, encoding='utf-8', errors='replace').read()
    if not re.search(r'CC0|Creative Commons Zero|CC-0', text, re.I):
        raise SystemExit(f'licence file does not say CC0: {path}')
    return text


def check_all_licences():
    check_licence(SPRITE_SOURCES[0][3])
    for _id, (folder, _n, _a, _u, lic) in AUDIO_PACKS.items():
        check_licence(os.path.join(LIB, 'audio', folder, lic))


# ------------------------------------------------------------------------------------------ atlas

def pack(frames, width, pad=1):
    """Shelf-pack {name: image}; returns (atlas image, {name: (x, y, w, h)})."""
    items = sorted(frames.items(), key=lambda kv: (-kv[1].height, -kv[1].width, kv[0]))
    x = y = pad
    shelf_h = 0
    pos = {}
    for name, im in items:
        if x + im.width + pad > width:
            x = pad
            y += shelf_h + pad
            shelf_h = 0
        pos[name] = (x, y, im.width, im.height)
        x += im.width + pad
        shelf_h = max(shelf_h, im.height)
    height = y + shelf_h + pad
    h2 = 1
    while h2 < height:
        h2 *= 2
    atlas = Image.new('RGBA', (width, h2), (0, 0, 0, 0))
    for name, (px, py, _w, _h) in pos.items():
        atlas.alpha_composite(frames[name], (px, py))
    return atlas, pos


def write_atlas(frames, order, width, png_name, json_name):
    atlas, pos = pack(frames, width)
    atlas.save(os.path.join(SPRITES_DIR, png_name), optimize=True)
    data = {
        'frames': {
            name: {
                'frame': {'x': pos[name][0], 'y': pos[name][1], 'w': pos[name][2], 'h': pos[name][3]},
                'rotated': False,
                'trimmed': False,
                'spriteSourceSize': {'x': 0, 'y': 0, 'w': pos[name][2], 'h': pos[name][3]},
                'sourceSize': {'w': pos[name][2], 'h': pos[name][3]},
            }
            for name in order
        },
        'meta': {'image': png_name, 'size': {'w': atlas.width, 'h': atlas.height}, 'scale': 1},
    }
    with open(os.path.join(SPRITES_DIR, json_name), 'w') as f:
        json.dump(data, f, indent=1)
        f.write('\n')
    return atlas


EXTRA_SIZES = {
    'skeleton_king': (24, 24), 'giant_slime': (32, 32), 'dragon': (48, 48), 'xp_gem': (8, 8), 'xp_gem_big': (12, 12),
    'arrow': (16, 5), 'enemy_arrow': (16, 5), 'bone': (16, 6), 'shadow': (16, 8), 'slash': (32, 16), 'lightning': (12, 40),
    'spider_queen': (40, 40), 'lich': (32, 32), 'mimic_king': (32, 32), 'web': (16, 16), 'web_ball': (8, 8),
    'egg_sac': (12, 12), 'soul_bolt': (10, 10), 'venom_glob': (8, 8),
}


def expected_size(name):
    if name in EXTRA_SIZES:
        return EXTRA_SIZES[name]
    if name.startswith('coin_') or name in ('spark', 'puff'):
        return (8, 8)
    return (16, 16)


# ------------------------------------------------------------------------------------------ audio

def run_ffmpeg(args):
    sh(['ffmpeg', '-v', 'error', '-y'] + args)


def volume_stats(path):
    r = subprocess.run(['ffmpeg', '-v', 'info', '-i', path, '-af', 'volumedetect', '-f', 'null', '-'],
                       capture_output=True, text=True)
    mean = float(re.search(r'mean_volume: (-?[\d.]+) dB', r.stderr).group(1))
    peak = float(re.search(r'max_volume: (-?[\d.]+) dB', r.stderr).group(1))
    return mean, peak


def duration(path):
    r = sh(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path])
    return float(r.stdout.strip())


def build_sfx(key, rc, tmp):
    srcs = [os.path.join(LIB, 'audio', AUDIO_PACKS[p][0], f) for p, f in rc['src']]
    ins = []
    for s in srcs:
        ins += ['-i', s]
    chain = []
    for i in range(len(srcs)):
        chain.append(f'[{i}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=mono[a{i}]')
    if len(srcs) > 1:
        chain.append(''.join(f'[a{i}]' for i in range(len(srcs))) + f'concat=n={len(srcs)}:v=0:a=1[cat]')
        last = 'cat'
    else:
        last = 'a0'
    fx = []
    if rc.get('pitch'):
        fx.append(f"asetrate={int(44100 * rc['pitch'])},aresample=44100")
    if rc.get('hp'):
        fx.append(f"highpass=f={rc['hp']}")
    if rc.get('lp'):
        fx.append(f"lowpass=f={rc['lp']}")
    trim = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.004'
    fx += [trim, 'areverse', trim, 'areverse']
    limit = rc.get('max', 3.9 if rc.get('jingle') else 1.5)
    fx.append(f'atrim=0:{limit}')
    chain.append(f'[{last}]' + ','.join(fx) + '[out]')
    wav = os.path.join(tmp, key + '.wav')
    run_ffmpeg(ins + ['-filter_complex', ';'.join(chain), '-map', '[out]', '-ac', '1', '-ar', '44100', wav])
    d = duration(wav)
    fade = min(0.12, max(0.02, d * 0.12))
    mean, peak = volume_stats(wav)
    gain = max(-12.0, min(24.0, min(-17.0 - mean, -3.0 - peak + 6.0))) + rc.get('boost', 0)  # limiter squashes up to ~6 dB of peaks
    out = os.path.join(AUDIO_DIR, key + '.mp3')
    af = f'volume={gain:.2f}dB,alimiter=limit=0.708:level=disabled,afade=t=out:st={max(0, d - fade):.3f}:d={fade:.3f}'
    run_ffmpeg(['-i', wav, '-vn', '-map_metadata', '-1', '-af', af, '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '80k', out])
    return out


def build_music(key, rc, tmp):
    src = os.path.join(LIB, 'audio', AUDIO_PACKS[rc['src'][0]][0], rc['src'][1])
    mean, peak = volume_stats(src)
    gain = max(-12.0, min(12.0, min(-19.0 - mean, -2.0 - peak)))
    out = os.path.join(AUDIO_DIR, key + '.mp3')
    # no trimming and no fades: the loop points of the source are kept intact
    run_ffmpeg(['-i', src, '-vn', '-map_metadata', '-1', '-af', f'volume={gain:.2f}dB', '-ac', '2', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '96k', out])
    return out


def build_audio():
    os.makedirs(AUDIO_DIR, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for key, rc in SFX_RECIPES.items():
            build_sfx(key, rc, tmp)
        for key, rc in MUSIC_RECIPES.items():
            build_music(key, rc, tmp)


# ------------------------------------------------------------------------------------------ credits

def write_credits():
    rows = []
    rows.append('# Credits\n')
    rows.append('Every third-party asset in this project is CC0 (public domain). Credit is not required, but we give it.\n')
    rows.append('The licence files of all packs below are read by `tools/build_assets.py`, which refuses to run unless they say CC0.\n')
    rows.append('## Art\n')
    for name, author, url, lic, used in SPRITE_SOURCES:
        rows.append(f'- **{name}** by {author} - CC0 1.0 - <{url}>  \n  Used for: {used}.')
    rows.append('- **Original pixel art** (`public/assets/sprites/extra.png`, `icons.png`): drawn in code by `tools/art_sprites.py` and '
                '`tools/art_icons.py` for this project, in the style and palette of Kenney Tiny Dungeon. Not third-party.\n')
    rows.append('## Audio\n')
    by_pack = {}
    for key, rc in SFX_RECIPES.items():
        for p in dict.fromkeys(p for p, _f in rc['src']):
            files = ' + '.join(f'`{os.path.basename(f)}`' for q, f in rc['src'] if q == p)
            by_pack.setdefault(p, []).append(f'`{key}.mp3` <- {files}')
    for key, rc in MUSIC_RECIPES.items():
        p, f = rc['src']
        by_pack.setdefault(p, []).append(f'`{key}.mp3` <- `{f}`')
    for pid, (folder, name, author, url, lic) in AUDIO_PACKS.items():
        if pid not in by_pack:
            continue
        rows.append(f'- **{name}** by {author} - CC0 1.0 - <{url}>  \n  Outputs in `public/assets/audio/`: ' + ', '.join(by_pack[pid]) + '.')
    rows.append('\nAll audio is converted with ffmpeg (mono 44.1 kHz MP3 for SFX with silence trimmed and loudness normalised; some are '
                'pitch-shifted / low-passed, see `SFX_RECIPES` in `tools/build_assets.py`). Music is only re-encoded and gain-adjusted '
                '(loop points untouched).\n')
    rows.append('## Fonts (`public/assets/fonts`)\n')
    rows.append('- **Monogram** by datagoblin - CC0 - <https://datagoblin.itch.io/monogram> (`monogram.ttf`)')
    rows.append('- **Kenney Future** by Kenney (kenney.nl) - CC0 - <https://kenney.nl/assets/kenney-fonts> (`kenney-future.ttf`)\n')
    rows.append('## Libraries\n')
    rows.append('- Phaser 3 (MIT) - see `package.json`; not bundled in this repository.\n')
    with open(CREDITS, 'w') as f:
        f.write('\n'.join(rows))


# ------------------------------------------------------------------------------------------ preview

def font(size):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def contact_sheet(extra, extra_order, icons, icon_order):
    scale = 4
    bg = (30, 22, 40, 255)
    W = 1500
    f_title, f_lab = font(18), font(11)
    # sections: (title, [(label, image)])
    sheet = Image.open(TILES_PNG).convert('RGBA')

    def tile(i):
        r, c = divmod(i, 12)
        return sheet.crop((c * 16, r * 16, c * 16 + 16, r * 16 + 16))
    ref = [(f'kenney {i}', tile(i)) for i in (85, 87, 96, 84, 108, 111, 120, 121, 122, 89, 104, 115)]
    sections = [
        ('Reference: Kenney Tiny Dungeon tiles (for consistency checks)', ref),
        ('extra.png (x4)', [(n, extra[n]) for n in extra_order]),
        ('icons.png (x4)', [(n, icons[n]) for n in icon_order]),
    ]
    d0 = ImageDraw.Draw(Image.new('RGBA', (4, 4)))
    # first lay out to know the height
    pad, lab_h, margin = 8, 14, 12
    layout = []
    y = margin
    for title, items in sections:
        layout.append(('title', title, margin, y))
        y += 28
        x, row_h = margin, 0
        for lab, im in items:
            cw = max(im.width * scale, int(d0.textlength(lab, font=f_lab)) + 6, 64) + pad * 2
            ch = im.height * scale + lab_h + pad * 2
            if x + cw > W - margin:
                x = margin
                y += row_h
                row_h = 0
            layout.append(('img', (lab, im), x, y, cw, ch))
            x += cw
            row_h = max(row_h, ch)
        y += row_h + 14
    img = Image.new('RGBA', (W, y + margin), bg)
    d = ImageDraw.Draw(img)
    for item in layout:
        if item[0] == 'title':
            d.text((item[2], item[3]), item[1], fill=(244, 236, 216, 255), font=f_title)
        else:
            _k, (lab, im), x, y0, cw, ch = item
            d.rectangle((x + 1, y0 + 1, x + cw - 2, y0 + ch - 2), fill=(42, 29, 51, 255))
            big = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
            img.alpha_composite(big, (x + (cw - big.width) // 2, y0 + pad))
            d.text((x + 4, y0 + ch - lab_h - 2), lab, fill=(168, 155, 168, 255), font=f_lab)
    os.makedirs(os.path.dirname(PREVIEW), exist_ok=True)
    img.save(PREVIEW, optimize=True)


# ------------------------------------------------------------------------------------------ verification

def ts_array(src, name):
    m = re.search(r'export const ' + name + r'\s*=\s*\[(.*?)\]\s*as const', src, re.S)
    if not m:
        raise SystemExit(f'cannot find {name} in assets.ts')
    return re.findall(r"'([^']+)'", m.group(1))


def verify():
    src = open(ASSETS_TS).read()
    extra_keys, icon_keys = ts_array(src, 'EXTRA_FRAMES'), ts_array(src, 'ICONS')
    sfx_keys, music_keys = ts_array(src, 'SFX'), ts_array(src, 'MUSIC')
    assert extra_keys and icon_keys and sfx_keys and music_keys, 'assets.ts arrays not parsed'
    for png, js, keys, sizes in (('extra.png', 'extra.json', extra_keys, expected_size),
                                 ('icons.png', 'icons.json', icon_keys, lambda n: (16, 16))):
        data = json.load(open(os.path.join(SPRITES_DIR, js)))
        atlas = Image.open(os.path.join(SPRITES_DIR, png))
        assert data['meta']['image'] == png and data['meta']['size'] == {'w': atlas.width, 'h': atlas.height}
        missing = [k for k in keys if k not in data['frames']]
        assert not missing, f'{js} is missing frames: {missing}'
        extra = [k for k in data['frames'] if k not in keys]
        assert not extra, f'{js} has unexpected frames: {extra}'
        for k in keys:
            fr = data['frames'][k]['frame']
            assert (fr['w'], fr['h']) == sizes(k), f'{js}:{k} is {fr["w"]}x{fr["h"]}, expected {sizes(k)}'
            assert fr['x'] >= 1 and fr['y'] >= 1 and fr['x'] + fr['w'] <= atlas.width - 1 and fr['y'] + fr['h'] <= atlas.height - 1
            assert atlas.crop((fr['x'], fr['y'], fr['x'] + fr['w'], fr['y'] + fr['h'])).getchannel('A').getbbox(), f'{k} is empty'
    tiles = Image.open(os.path.join(SPRITES_DIR, 'tiles.png'))
    assert tiles.size == (192, 176)
    total = 0
    for k in sfx_keys + music_keys:
        p = os.path.join(AUDIO_DIR, k + '.mp3')
        assert os.path.isfile(p), f'missing audio {p}'
        d = duration(p)
        assert d > 0, p
        if k in sfx_keys:
            assert d < 4.0 and (d < 1.6 or k in ('victory', 'defeat', 'levelUp', 'revive')), f'{k} too long: {d:.2f}s'
        dec = subprocess.run(['ffmpeg', '-v', 'error', '-i', p, '-f', 'null', '-'], capture_output=True, text=True)
        assert dec.returncode == 0 and not dec.stderr.strip(), f'{k} does not decode cleanly: {dec.stderr}'
        total += os.path.getsize(p)
    assert total < 4 * 1024 * 1024, f'audio is {total} bytes'
    print(f'verify: {len(extra_keys)} extra frames, {len(icon_keys)} icons, {len(sfx_keys)} sfx, {len(music_keys)} music OK; '
          f'audio total {total / 1024:.0f} KiB')


# ------------------------------------------------------------------------------------------ main

def main():
    os.chdir(ROOT)
    for tool in ('ffmpeg', 'ffprobe'):
        if not shutil.which(tool):
            raise SystemExit(f'{tool} not found on PATH')
    check_all_licences()
    os.makedirs(SPRITES_DIR, exist_ok=True)
    shutil.copyfile(TILES_PNG, os.path.join(SPRITES_DIR, 'tiles.png'))

    src = open(ASSETS_TS).read()
    extra_keys, icon_keys = ts_array(src, 'EXTRA_FRAMES'), ts_array(src, 'ICONS')
    extra = art_sprites.build_extra()
    icons = art_icons.build_icons()
    for k in extra_keys:
        assert k in extra, f'no art for extra frame {k}'
    for k in icon_keys:
        assert k in icons, f'no art for icon {k}'
    extra = {k: extra[k] for k in extra_keys}
    icons = {k: icons[k] for k in icon_keys}
    write_atlas(extra, extra_keys, 256, 'extra.png', 'extra.json')
    write_atlas(icons, icon_keys, 256, 'icons.png', 'icons.json')
    build_audio()
    write_credits()
    contact_sheet(extra, extra_keys, icons, icon_keys)
    verify()


if __name__ == '__main__':
    main()
