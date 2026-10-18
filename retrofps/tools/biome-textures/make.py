#!/usr/bin/env python3
"""Texturer och föremål för biomerna (grottor, kyrkogård, skog, borggård).

Ut i retrofps/assets/wall: wall_forest/cemetery/cave/house(+_window), floor_ground_grass/dirt,
floor_grass_dead, floor_gravel, floor_cave, floor_mud, ceil_cave.
Ut i retrofps/assets/gfx: sky_night.png (himmelsband), tree_1/tree_2.png, grave.png (tre gravstenar).
Källor: Kenney retro-textures-fantasy och skyboxes (CC0), Classic64 Asset Pack (CC0),
Gothicvania HauntedForest (Ansimuz, CC0). Skogsväggen och gravstenarna ritas här.
Kör från repo-roten: python3 retrofps/tools/biome-textures/make.py
"""
import random
from PIL import Image, ImageDraw, ImageEnhance

A = 'assets/textures/'
K = A + 'retro-textures-fantasy/PNG/'
C = A + 'Classic 64 Asset Pack 0.6/- Classic 64 Asset Pack 0.6/'
GV = 'assets/2d-pixel/Legacy Collection/Legacy Collection/Assets/Gothicvania/Environments/HauntedForest/Layers/Props/'
W_OUT, G_OUT = 'retrofps/assets/wall/', 'retrofps/assets/gfx/'
rnd = random.Random(7)


def pixel(im, size, colors=48, dark=1.0):
    """Skala till spelets storlek, gör den pixlig som Kenney-texturerna och palettisera."""
    im = im.convert('RGB').resize((size[0] // 2, size[1] // 2), Image.LANCZOS).resize(size, Image.NEAREST)
    if dark != 1.0:
        im = ImageEnhance.Brightness(im).enhance(dark)
    return im.quantize(colors, method=Image.Quantize.MEDIANCUT)


def stack(path, tiles=2, dark=1.0):  # 64x64-ruta staplad till en 64x128-vägg
    t = Image.open(path).convert('RGB').resize((64, 64), Image.LANCZOS)
    out = Image.new('RGB', (64, 64 * tiles))
    for i in range(tiles):
        out.paste(t, (0, 64 * i))
    return pixel(out, (64, 64 * tiles), dark=dark)


# ---- väggar
stack(C + 'Bricks/Materials/brick_medium_mossy.png', dark=0.8).save(W_OUT + 'wall_cemetery.png')
stack(C + 'Rocks/Materials/rock_wall_1.png', dark=0.85).save(W_OUT + 'wall_cave.png')
Image.open(K + 'wall_timber_structure.png').save(W_OUT + 'wall_house.png')
win = Image.open(K + 'wall_timber_structure.png').convert('RGBA')  # fönstret har genomskinliga hörn: lägg det på väggen
win.alpha_composite(Image.open(K + 'window_tall_rounded_lit.png').convert('RGBA').resize((44, 88), Image.NEAREST), (10, 18))
win.convert('RGB').quantize(64).save(W_OUT + 'wall_house_window.png')

# skogsväggen: stammar framför ett mörkt lövverk
f = Image.new('RGB', (64, 128), (10, 18, 10))
d = ImageDraw.Draw(f)
greens = [(18, 32, 16), (26, 44, 20), (36, 58, 26), (48, 70, 30), (22, 38, 24)]
for _ in range(260):
    x, y = rnd.randint(-4, 68), rnd.randint(-4, 100)
    r = rnd.randint(2, 6)
    c = greens[min(len(greens) - 1, int((1 - y / 110) * len(greens) * rnd.uniform(0.6, 1.1)))]
    d.ellipse((x - r, y - r, x + r, y + r), fill=c)
bark = Image.open(C + 'Nature/Materials/bark_3.png').convert('RGB')
for x0, w in ((6, 9), (30, 12), (52, 8)):
    trunk = ImageEnhance.Brightness(bark.resize((w, 128))).enhance(0.55)
    top = rnd.randint(30, 60)
    f.paste(trunk.crop((0, top, w, 128)), (x0, top))
    d.line((x0 + w // 2, top, x0 + w // 2 - rnd.randint(4, 9), top - rnd.randint(8, 16)), fill=(40, 30, 22), width=2)
for _ in range(70):  # lite lövverk framför stammarna
    x, y = rnd.randint(0, 64), rnd.randint(0, 70)
    r = rnd.randint(1, 4)
    d.ellipse((x - r, y - r, x + r, y + r), fill=rnd.choice(greens[1:]))
d.rectangle((0, 118, 64, 128), fill=(16, 22, 12))  # mörk mark nedtill
f.resize((32, 64), Image.NEAREST).resize((64, 128), Image.NEAREST).quantize(32).save(W_OUT + 'wall_forest.png')

# ---- golv och tak
for name, src, dark in (('floor_ground_grass', K + 'floor_ground_grass.png', 0.9), ('floor_ground_dirt', K + 'floor_ground_dirt.png', 1.0)):
    Image.open(src).convert('RGB').quantize(48).save(W_OUT + name + '.png') if dark == 1.0 else pixel(Image.open(src), (64, 64), dark=dark).save(W_OUT + name + '.png')
pixel(Image.open(C + 'Ground/Materials/grass_dead_01.png'), (64, 64), dark=0.75).save(W_OUT + 'floor_grass_dead.png')
pixel(Image.open(C + 'Ground/Materials/gravel_0.png'), (64, 64), dark=0.55).save(W_OUT + 'floor_gravel.png')
pixel(Image.open(C + 'Rocks/Materials/rock_gravel.png'), (64, 64), dark=0.6).save(W_OUT + 'floor_cave.png')
pixel(Image.open(C + 'Ground/Materials/mud_01.jpg'), (64, 64), dark=0.7).save(W_OUT + 'floor_mud.png')
pixel(Image.open(C + 'Rocks/Materials/rock_wall_2.png'), (64, 64), dark=0.5).save(W_OUT + 'ceil_cave.png')

# ---- natthimmel: övre halvan av Kenneys panorama (horisonten nederst), ett varv = bildens bredd
sky = Image.open(A + 'skyboxes/Skyboxes/skybox-night.png').convert('RGB')
sky.crop((0, 300, 4096, 1024)).resize((512, 96), Image.LANCZOS).save(G_OUT + 'sky_night.png')

# ---- träd (Gothicvania HauntedForest)
for i, n in enumerate(('tree.png', 'tree-2.png')):
    t = Image.open(GV + n).convert('RGBA')
    t = t.crop(t.getbbox())
    t.save(G_OUT + f'tree_{i + 1}.png')

# ---- gravstenar: rundad sten, kors och obelisk (tre rutor à 24x32)
g = Image.new('RGBA', (72, 32), (0, 0, 0, 0))
d = ImageDraw.Draw(g)
stone, light, dark, moss = (118, 116, 124, 255), (150, 148, 156, 255), (78, 76, 86, 255), (70, 92, 50, 255)
# rundad
d.rectangle((5, 12, 18, 31), fill=stone); d.ellipse((5, 5, 18, 19), fill=stone)
d.line((6, 12, 6, 30), fill=light); d.line((17, 12, 17, 30), fill=dark)
d.line((9, 14, 14, 14), fill=dark); d.line((11, 11, 11, 19), fill=dark); d.line((9, 22, 14, 22), fill=dark)
d.rectangle((4, 29, 19, 31), fill=dark); d.point([(7, 26), (8, 27), (15, 28)], fill=moss)
# kors
x = 24
d.rectangle((x + 10, 4, x + 14, 31), fill=stone); d.rectangle((x + 4, 10, x + 20, 14), fill=stone)
d.line((x + 10, 4, x + 10, 31), fill=light); d.line((x + 14, 4, x + 14, 31), fill=dark); d.line((x + 4, 14, x + 20, 14), fill=dark)
d.rectangle((x + 7, 28, x + 17, 31), fill=dark); d.point([(x + 11, 24), (x + 12, 25)], fill=moss)
# obelisk
x = 48
d.polygon([(x + 8, 31), (x + 9, 6), (x + 12, 1), (x + 15, 6), (x + 16, 31)], fill=stone)
d.line((x + 9, 7, x + 9, 30), fill=light); d.line((x + 15, 7, x + 15, 30), fill=dark)
d.rectangle((x + 5, 27, x + 19, 31), fill=dark); d.rectangle((x + 6, 25, x + 18, 27), fill=stone)
g.save(G_OUT + 'grave.png')
print('klart')
