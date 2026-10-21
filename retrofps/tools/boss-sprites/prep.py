#!/usr/bin/env python3
"""Bildremsor för bossarna ur Gothicvania (Ansimuz, CC0).

Ut: retrofps/assets/gfx/boss_<boss>_<animation>.png. Alla rutor för en boss får samma storlek,
fötterna nederst och blicken åt höger (spelet speglar mot spelaren). Kör från repo-roten.
"""
import glob, re
from PIL import Image, ImageOps

SRC = 'assets/2d-pixel/Legacy Collection/Legacy Collection/Assets/Gothicvania/Characters/'
OUT = 'retrofps/assets/gfx/'
num = lambda f: int(re.findall(r'(\d+)\.png$', f)[0])

# boss: (spegla?, {animation: (mapp, första, sista)})
BOSSES = {
    'beast': (False, {'idle': ('Hell-Beast-Files/Idle/Sprites', 1, 6), 'breath': ('Hell-Beast-Files/Breath/Sprites', 1, 4),
                      'burn': ('Hell-Beast-Files/Burn/Sprites', 1, 4), 'pillar': ('Hell-Beast-Files/Burn/Sprites', 5, 6)}),
    'nightmare': (True, {'idle': ('Nightmare-Files/Sprites/Idle', 1, 4), 'run': ('Nightmare-Files/Sprites/Run', 1, 3)}),
    'ogre': (True, {'idle': ('Ogre/Sprites/Idle', 1, 4), 'walk': ('Ogre/Sprites/walk', 1, 6), 'attack': ('Ogre/Sprites/Attack', 1, 7)}),
    'ghost': (True, {'idle': ('Ghost-Files/Sprites/Idle', 1, 7), 'chase': ('Ghost-Files/Sprites/Chase', 1, 4), 'shriek': ('Ghost-Files/Sprites/Shriek', 1, 4),
                     'vanish': ('Ghost-Files/Sprites/Vanish', 1, 7), 'appear': ('Ghost-Files/Sprites/Appear', 1, 6)}),
}

for boss, (mirror, anims) in BOSSES.items():
    frames = {}
    for a, (folder, lo, hi) in anims.items():
        fs = sorted(glob.glob(SRC + folder + '/*.png'), key=num)
        frames[a] = [Image.open(f).convert('RGBA') for f in fs if lo <= num(f) <= hi]
    sep = {'pillar'}  # egna effekter beskärs för sig
    body = [im for a, ims in frames.items() if a not in sep for im in ims]
    # gemensam ram: alla rutor har samma storlek i källan, ta unionen av innehållet
    bb = None
    for im in body:
        b = im.getbbox()
        if b: bb = b if bb is None else (min(bb[0], b[0]), min(bb[1], b[1]), max(bb[2], b[2]), max(bb[3], b[3]))
    for a, ims in frames.items():
        box = bb
        if a in sep:
            box = None
            for im in ims:
                b = im.getbbox(); box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
        crop = [im.crop(box) for im in ims]
        if mirror: crop = [ImageOps.mirror(c) for c in crop]
        w, h = crop[0].size
        out = Image.new('RGBA', (w * len(crop), h))
        for i, c in enumerate(crop): out.paste(c, (i * w, 0))
        out.save(f'{OUT}boss_{boss}_{a}.png', optimize=True)
        print(boss, a, len(crop), (w, h))
