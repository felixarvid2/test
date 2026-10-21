#!/usr/bin/env python3
"""Gör fiendeark för Krypta av Pixel Crawler- och Tiny RPG-figurer.

Ut: assets/gfx/enemies-<namn>_<läge>.png med 64x64-rutor och fötterna på rad 58
(samma proportion som de gamla 32x32-arken med fötterna på rad 29).
Lägen: idle, movement, attack, take_damage, death. Pixel Crawler saknar anfall och
smärta, så de ritas fram ur vilorutorna (glöd för magiker, hugg för krigare).
Kör från repo-roten: python3 retrofps/tools/enemy-sprites/prep.py
"""
import os
from PIL import Image, ImageDraw

SRC = 'assets/2d-pixel'
OUT = 'retrofps/assets/gfx'
PC = SRC + '/Pixel Crawler - Free Pack 2.11/Pixel Crawler - Free Pack/Entities/Mobs/'
TR = SRC + '/Tiny RPG Character Asset Pack 02 v1.01-Free Demon_A&Blood Monster_A/Tiny RPG Character Asset Pack 02 -Free Demon_A&Blood Monster_A/Characters(100x100 split)/'
F, FEET = 64, 58


def frames(path, fw):
    im = Image.open(path).convert('RGBA')
    return [im.crop((i * fw, 0, i * fw + fw, im.height)) for i in range(im.width // fw)]


def place(fr, feet):
    """Lägg en ruta i en 64x64-ruta: mitten i mitten och fötterna på rad FEET."""
    out = Image.new('RGBA', (F, F))
    out.paste(fr, ((F - fr.width) // 2, FEET - feet), fr)
    return out


def sheet(frs):
    feet = frs[0].getbbox()[3]
    return [place(f, feet) for f in frs]


def glow(base, col, k):
    """Anfallsruta för magiker: figuren ljusnar och ett glödande klot växer vid handen."""
    im = base.copy()
    px = im.load()
    for y in range(F):
        for x in range(F):
            r, g, b, a = px[x, y]
            if a:
                px[x, y] = (min(255, r + int(col[0] * k / 3)), min(255, g + int(col[1] * k / 3)), min(255, b + int(col[2] * k / 3)), a)
    d = ImageDraw.Draw(im)
    bb = base.getbbox()
    cx, cy, r = bb[2] + 1, (bb[1] + bb[3]) // 2, 1 + int(4 * k)
    d.ellipse((cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1), fill=col + (150,))
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=tuple(min(255, c + 120) for c in col) + (255,))
    return im


def slash(base, col, k):
    """Anfallsruta för närstrid: figuren sträcker sig fram och ett hugg sveper förbi."""
    bb = base.getbbox()
    lift = int(3 * min(k, 1 - k) * 2)
    im = Image.new('RGBA', (F, F))
    im.paste(base, (int(4 * k), -lift), base)
    if 0.3 < k < 0.8:
        d = ImageDraw.Draw(im)
        cx, cy = bb[2] - 2, bb[1] + (bb[3] - bb[1]) // 3
        d.arc((cx - 10, cy - 8, cx + 10, cy + 14), -80, 80, fill=col + (255,), width=2)
    return im


def pain(base):
    out = []
    for dx, tint in ((2, 90), (1, 50), (0, 0)):
        im = Image.new('RGBA', (F, F))
        im.paste(base, (-dx, 0), base)
        px = im.load()
        for y in range(F):
            for x in range(F):
                r, g, b, a = px[x, y]
                if a:
                    px[x, y] = (min(255, r + tint), max(0, g - tint // 2), max(0, b - tint // 2), a)
        out.append(im)
    return out


def save(name, state, frs):
    s = Image.new('RGBA', (F * len(frs), F))
    for i, f in enumerate(frs):
        s.paste(f, (i * F, 0), f)
    s.save(f'{OUT}/enemies-{name}_{state}.png', optimize=True)


def pixel_crawler(name, folder, kind, col):
    idle = sheet(frames(PC + folder + '/Idle/Idle-Sheet.png', 32))
    run = sheet(frames(PC + folder + '/Run/Run-Sheet.png', 64))
    death = sheet(frames(PC + folder + '/Death/Death-Sheet.png', 64))
    n = 8
    atk = [(glow if kind == 'cast' else slash)(idle[i % len(idle)], col, i / (n - 1)) for i in range(n)]
    save(name, 'idle', idle); save(name, 'movement', run); save(name, 'attack', atk)
    save(name, 'take_damage', pain(idle[0])); save(name, 'death', death)


def tiny_rpg(name, folder):
    base = TR + folder + '/' + folder + '/' + folder
    for state, suffix in (('idle', '_Idle'), ('movement', '_Walk'), ('attack', '_Attack01'), ('take_damage', '_Hurt'), ('death', '_Death')):
        save(name, state, sheet(frames(base + suffix + '.png', 100)))


os.makedirs(OUT, exist_ok=True)
pixel_crawler('mage', 'Skeleton Crew/Skeleton - Mage', 'cast', (170, 90, 255))
pixel_crawler('shaman', 'Orc Crew/Orc - Shaman', 'cast', (90, 230, 90))
pixel_crawler('rogue', 'Skeleton Crew/Skeleton - Rogue', 'slash', (230, 230, 255))
pixel_crawler('warrior', 'Orc Crew/Orc - Warrior', 'slash', (255, 190, 90))
tiny_rpg('imp', 'Demon_A')
tiny_rpg('blob', 'Blood Monster_A')
print('klart')
