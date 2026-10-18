#!/usr/bin/env python3
"""Props, mimic, boss-room textures and biome particles for Krypta.

Run from the repo root:  python3 retrofps/tools/props/make.py

Out to retrofps/assets/gfx:
  prop_candles(3) prop_coffin prop_bones prop_bookshelf prop_statue prop_cage prop_well(2) prop_altar(2)
  prop_spikes(2) prop_barrel_red prop_crystal(2) prop_mushroom(2) prop_armor prop_table prop_crate
  prop_crate_broken(4)
  enemies-mimic_{idle,movement,attack,take_damage,death}.png (32x32 frames, feet on row 29)
  part_leaf(4) part_firefly(2) part_drop part_rain part_fog part_bat(4) part_ember(2) part_dust part_wisp(4)
  part_shell part_blood_pool(3)
Out to retrofps/assets/wall:
  wall_/floor_boss_{demon,beast,nightmare,ogre,ghost}.png (walls 64x128, floors 64x64, palettized)

Sources (all in assets/):
  * chest.png in the game (= 2D Pixel Dungeon Asset Pack v2.0 chest) -> mimic body/lid and the outline/metal/wood palette
  * Gothicvania Rocky Pass crystal-1.png (Ansimuz, CC0) -> recoloured crystal cluster
  * Kenney retro-textures-fantasy (CC0): wall_stone, wall_brick_small_stone, wall_brick_stone_center, floor_stone_pattern
  * Classic 64 Asset Pack (CC0): rock_wall_04, bark_3, mud_02, dirt_02, marbel_02 (grain/noise for textures)
  * Kenney particle-pack smoke_01 (CC0) -> ground fog puff
  Everything else is drawn procedurally below, in the outlined 2D-Pixel-Dungeon style of the chest/skeleton sprites.
"""
import math
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

A = 'assets/'
K = A + 'textures/retro-textures-fantasy/PNG/'
C64 = A + 'textures/Classic 64 Asset Pack 0.6/- Classic 64 Asset Pack 0.6/'
GV = A + '2d-pixel/Legacy Collection/Legacy Collection/Assets/Gothicvania/Environments/'
G_OUT, W_OUT = 'retrofps/assets/gfx/', 'retrofps/assets/wall/'

# ---------------------------------------------------------------- palette (taken from chest.png / skeleton sheets)
OUT = (37, 19, 26)                                                       # outline used by every sprite of the pack
M0, M1, M2, M3 = (96, 96, 112), (144, 145, 158), (173, 193, 207), (187, 211, 225)  # chest metal
W0, W1, W2, W3, W4 = (58, 38, 40), (82, 59, 64), (110, 74, 60), (137, 90, 69), (172, 108, 74)  # chest wood
S0, S1, S2, S3, S4 = (56, 54, 66), (78, 76, 88), (110, 108, 120), (142, 140, 150), (172, 170, 178)  # stone (grave.png)
B0, B1, B2, B3 = (103, 96, 87), (160, 156, 138), (196, 192, 172), (230, 228, 214)  # bone (skeleton sheet)
I0, I1, I2, I3 = (34, 32, 40), (58, 56, 68), (88, 88, 102), (128, 130, 146)    # dark iron
R0, R1, R2, R3 = (66, 36, 30), (104, 56, 38), (142, 80, 48), (178, 110, 62)    # rust
F0, F1, F2, F3 = (170, 52, 28), (236, 116, 40), (255, 192, 72), (255, 242, 176)  # flame
V0, V1, V2, V3 = (78, 22, 96), (132, 44, 176), (190, 96, 240), (238, 206, 255)  # cursed purple
BL0, BL1, BL2 = (92, 10, 16), (138, 18, 24), (184, 38, 38)                      # blood
GOLD0, GOLD1, GOLD2 = (192, 147, 68), (255, 213, 105), (255, 241, 204)          # chest_open gold


def rgba(c, a=255):
    return tuple(c[:3]) + (a,) if len(c) == 3 else tuple(c)


class Pic:
    """Small RGBA canvas with pixel-art drawing helpers (inclusive coordinates).
    outline() grows the canvas by one pixel on every side; an internal offset keeps later coordinates valid."""

    def __init__(self, w, h):
        self.im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)
        self.w, self.h = w, h
        self.o = 0

    def _t(self, pts):
        return [(x + self.o, y + self.o) for x, y in pts]

    def r(self, x0, y0, x1, y1, c):
        if x1 >= x0 and y1 >= y0:
            self.d.rectangle(self._t([(x0, y0), (x1, y1)]), fill=rgba(c))

    def p(self, x, y, c):
        x, y = int(round(x)) + self.o, int(round(y)) + self.o
        if 0 <= x < self.im.width and 0 <= y < self.im.height:
            self.im.putpixel((x, y), rgba(c))

    def ps(self, pts, c):
        for x, y in pts:
            self.p(x, y, c)

    def l(self, x0, y0, x1, y1, c, w=1):
        self.d.line(self._t([(x0, y0), (x1, y1)]), fill=rgba(c), width=w)

    def lines(self, pts, c):
        self.d.line(self._t(pts), fill=rgba(c), width=1)

    def e(self, x0, y0, x1, y1, c):
        self.d.ellipse(self._t([(x0, y0), (x1, y1)]), fill=rgba(c))

    def eo(self, x0, y0, x1, y1, c):
        self.d.ellipse(self._t([(x0, y0), (x1, y1)]), outline=rgba(c))

    def arc(self, x0, y0, x1, y1, a0, a1, c, w=1):
        self.d.arc(self._t([(x0, y0), (x1, y1)]), a0, a1, fill=rgba(c), width=w)

    def poly(self, pts, c):
        self.d.polygon(self._t(pts), fill=rgba(c))

    def paste(self, im, x, y):
        self.im.alpha_composite(im, (x + self.o, y + self.o))

    def get(self, x, y):
        x, y = x + self.o, y + self.o
        return self.im.getpixel((x, y)) if 0 <= x < self.im.width and 0 <= y < self.im.height else (0, 0, 0, 0)

    def solid(self, x, y):
        return self.get(x, y)[3] >= 100

    def outline(self, c=OUT, diag=False):
        self.im = outline(self.im, c, diag)
        self.d = ImageDraw.Draw(self.im)
        self.o += 1

    def bitmap(self, x0, y0, rows, pal):
        """Paint a character map; '.' and ' ' are skipped."""
        for j, row in enumerate(rows):
            for i, ch in enumerate(row):
                if ch in pal:
                    self.p(x0 + i, y0 + j, pal[ch])


def outline(im, c=OUT, diag=False):
    """Add a 1px outline around opaque pixels; the image grows by 1px on each side."""
    a = np.pad(np.array(im.convert('RGBA')), ((1, 1), (1, 1), (0, 0)))
    m = a[:, :, 3] >= 100
    p = np.pad(m, 1)
    nb = np.zeros_like(m)
    sh = [(0, 1), (0, -1), (1, 0), (-1, 0)] + ([(1, 1), (1, -1), (-1, 1), (-1, -1)] if diag else [])
    H, W = m.shape
    for dy, dx in sh:
        nb |= p[1 + dy:1 + dy + H, 1 + dx:1 + dx + W]
    a[nb & ~m] = rgba(c)
    return Image.fromarray(a)


def hard(im):
    a = np.array(im.convert('RGBA'))
    a[:, :, 3] = np.where(a[:, :, 3] >= 100, 255, 0)
    a[a[:, :, 3] == 0] = 0
    return Image.fromarray(a)


def strip(frames, keep_w=False):
    """Crop all frames to their common bbox (base stays on the bottom row) and lay them out horizontally."""
    frames = [hard(f) for f in frames]
    boxes = [f.getbbox() for f in frames if f.getbbox()]
    x0, y0 = min(b[0] for b in boxes), min(b[1] for b in boxes)
    x1, y1 = max(b[2] for b in boxes), max(b[3] for b in boxes)
    if keep_w:
        x0, x1 = 0, frames[0].width
    w, h = x1 - x0, y1 - y0
    out = Image.new('RGBA', (w * len(frames), h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        out.paste(f.crop((x0, y0, x1, y1)), (i * w, 0))
    return out


def save(im, name):
    im.save(G_OUT + name)
    return im


def flame(p, x, y, h, lean=0, pal=(F0, F1, F2, F3), wide=True):
    """Small candle flame standing on (x, y) (the wick), h pixels tall, tip shifted by lean."""
    c0, c1, c2, c3 = pal
    for i in range(h):
        yy = y - 1 - i
        t = i / max(1, h - 1)
        xx = x + round(lean * t * t)
        if wide and i < h - 2 and h >= 4:
            p.p(xx - 1, yy, c0 if i == 0 else c1)
            p.p(xx + 1, yy, c0 if i == 0 else c1)
            p.p(xx, yy, c3 if i < h - 3 else c2)
        else:
            p.p(xx, yy, c2 if i < h - 1 else c1)
    p.p(x, y, OUT)  # wick


# ================================================================== PROPS
def make_candles():
    """Iron candelabra with three candles + two floor stubs; frames flicker the flames."""
    frames = []
    var = [((5, 0), (6, 0), (5, 0), (3, 0), (3, 0)),
           ((4, -1), (6, 1), (5, 1), (3, 1), (2, 0)),
           ((5, 1), (5, -1), (4, -1), (2, -1), (3, 1))]
    for f in range(3):
        p = Pic(30, 42)
        cx, base = 14, 41
        # foot: three splayed legs and a dome
        p.r(cx - 6, base - 1, cx + 6, base, I1)
        p.p(cx - 7, base, I1); p.p(cx + 7, base, I1)
        p.r(cx - 3, base - 3, cx + 3, base - 2, I2)
        p.r(cx - 2, base - 4, cx + 2, base - 4, I2)
        # stem with two knobs
        p.r(cx - 1, 16, cx + 1, base - 4, I1)
        p.l(cx - 1, 16, cx - 1, base - 4, I2)
        p.r(cx - 2, 28, cx + 2, 30, I2); p.l(cx - 2, 28, cx + 2, 28, I3)
        # arms curving up to the outer cups
        p.r(cx - 9, 21, cx + 9, 22, I1); p.l(cx - 9, 21, cx + 9, 21, I2)
        p.r(cx - 10, 15, cx - 9, 22, I1); p.r(cx + 9, 15, cx + 10, 22, I1)
        p.l(cx - 10, 15, cx - 10, 22, I2)
        # drip pans
        for x0 in (cx - 12, cx + 7):
            p.r(x0, 14, x0 + 5, 15, I2); p.l(x0, 14, x0 + 5, 14, I3)
        p.r(cx - 3, 11, cx + 3, 12, I2); p.l(cx - 3, 11, cx + 3, 11, I3)
        # candles: cream wax, lit side left
        wax, waxl, waxd = (214, 202, 170), (238, 230, 204), (164, 146, 120)
        for x0, top, bot in ((cx - 11, 6, 13), (cx - 1, 2, 10), (cx + 8, 7, 13)):
            p.r(x0, top, x0 + 2, bot, wax); p.l(x0, top, x0, bot, waxl); p.l(x0 + 2, top, x0 + 2, bot, waxd)
            p.p(x0 + 1, top + 3, waxl); p.p(x0, top + 4, waxl)  # drips
        # two floor stubs left and right of the foot
        for x0, top in ((cx - 13, base - 6), (cx + 11, base - 4)):
            p.r(x0, top, x0 + 2, base, wax); p.l(x0, top, x0, base, waxl); p.l(x0 + 2, top, x0 + 2, base, waxd)
            p.p(x0 + 3, base, waxd)  # melted puddle
            p.p(x0 - 1, base, waxd)
        p.outline()
        # flames go on top of the outline so they stay bright
        v = var[f]
        flame(p, cx - 10, 5, v[0][0], v[0][1])
        flame(p, cx, 1 + 0, v[1][0], v[1][1])
        flame(p, cx + 9, 6, v[2][0], v[2][1])
        flame(p, cx - 12, base - 7, v[3][0], v[3][1])
        flame(p, cx + 12, base - 5, v[4][0], v[4][1])
        frames.append(p.im)
    return save(strip(frames), 'prop_candles.png')


def make_coffin():
    """Lying wooden coffin seen from the front-side: tapered hexagonal lid on top, side panel below."""
    p = Pic(46, 26)
    oy = 1
    hx, sx, fx = 1, 12, 43          # head end, shoulder, foot end

    def edge(x, k):                 # y on the front edge of the lid, k rows lower
        if x <= sx:
            return oy + 9 + (x - hx) * 2 / (sx - hx) + k
        return oy + 11 - (x - sx) * 3 / (fx - sx) + k
    top = [(hx, oy + 3), (sx, oy), (fx, oy + 4), (fx, oy + 8), (sx, oy + 11), (hx, oy + 9)]
    rim = [(hx, oy + 9), (sx, oy + 11), (fx, oy + 8), (fx, oy + 10), (sx, oy + 13), (hx, oy + 11)]
    side_l = [(hx, oy + 11), (sx, oy + 13), (sx, oy + 21), (hx, oy + 18)]
    side_r = [(sx, oy + 13), (fx, oy + 10), (fx, oy + 16), (sx, oy + 21)]
    p.poly(side_r, W1)
    p.poly(side_l, W2)
    for k in (3, 6):                                      # plank seams on the side
        p.l(hx, edge(hx, 2 + k), sx, edge(sx, 2 + k), W0)
        p.l(sx, edge(sx, 2 + k), fx, edge(fx, 2 + k) - 1, W0)
    p.l(sx, oy + 13, sx, oy + 20, W3)                     # shoulder corner catches the light
    p.poly(rim, W2)
    p.l(hx, oy + 11, sx, oy + 13, W1); p.l(sx, oy + 13, fx, oy + 10, W1)
    p.poly(top, W3)
    p.l(hx + 1, oy + 3, sx, oy + 1, W4); p.l(sx, oy + 1, fx - 1, oy + 4, W4)   # back edge highlight
    p.l(sx + 1, oy + 2, sx + 1, oy + 10, W2)              # lid panel line at the shoulder
    for x in (22, 32):
        p.l(x, oy + 3, x, oy + 8, (122, 80, 62))
    # brass cross on the lid
    p.r(15, oy + 5, 21, oy + 6, GOLD0); p.r(17, oy + 3, 18, oy + 9, GOLD0)
    p.l(15, oy + 5, 21, oy + 5, GOLD1); p.l(17, oy + 3, 17, oy + 8, GOLD1)
    # iron handles on the side
    for x in (6, 20, 31):
        y = int(edge(x, 6))
        p.r(x, y, x + 3, y, I3); p.p(x, y + 1, I2); p.p(x + 3, y + 1, I2); p.r(x + 1, y + 2, x + 2, y + 2, I2)
    for x in (3, 9, 16, 26, 38):                          # nails along the lid rim
        p.p(x, int(edge(x, 1)), M1)
    p.outline()
    return save(strip([p.im]), 'prop_coffin.png')


SKULL = ['.aaaaa.',
         'abbbbba',
         'bbbbbbc',
         'bddbddc',
         'bddbddc',
         '.bbebc.',
         '.fbfbf.']


def skull(p, x, y, pal=None):
    pal = pal or {'a': B3, 'b': B2, 'c': B1, 'd': OUT, 'e': B0, 'f': B1}
    p.bitmap(x, y, SKULL, pal)


def bone(p, x0, y0, x1, y1, c=B2, cl=B3):
    p.l(x0, y0, x1, y1, c)
    for x, y in ((x0, y0), (x1, y1)):
        p.r(x - 1, y - 1, x, y, c)
        p.p(x - 1, y - 1, cl)
    p.p((x0 + x1) // 2, (y0 + y1) // 2 - 1 if abs(x1 - x0) > abs(y1 - y0) else (y0 + y1) // 2, cl)


def make_bones():
    p = Pic(34, 20)
    base = 19
    p.e(3, base - 6, 30, base + 4, B0)                  # mound shadow of crushed bone
    for (x0, y0, x1, y1) in ((3, 17, 14, 13), (11, 18, 27, 15), (19, 12, 30, 17), (6, 12, 12, 18),
                             (14, 11, 22, 14), (23, 18, 31, 13), (2, 15, 8, 18), (16, 16, 25, 18)):
        bone(p, x0, y0 + 1, x1, y1 + 1)
    # ribs
    for i in range(3):
        p.l(24 + i * 2, 9 + i, 22 + i * 2, 13 + i, B1)
    skull(p, 6, 7)
    skull(p, 15, 4)
    # a third skull lying on its side (rotated)
    rot = [''.join(SKULL[6 - j][i] for j in range(7)) for i in range(7)]
    p.bitmap(25, 10, rot[:6], {'a': B2, 'b': B2, 'c': B1, 'd': OUT, 'e': B0, 'f': B1})
    p.outline()
    # dark gaps between bones
    for x, y in ((12, 16), (20, 16), (10, 17), (22, 15), (16, 17)):
        if p.solid(x, y):
            p.p(x, y, B0)
    return save(strip([p.im]), 'prop_bones.png')


def make_bookshelf():
    rnd = random.Random(11)
    p = Pic(36, 48)
    x0, x1, top, base = 2, 33, 1, 47
    p.r(x0, top + 2, x1, base, W1)                      # carcass
    p.r(x0 - 1, top, x1 + 1, top + 2, W3); p.l(x0 - 1, top, x1 + 1, top, W4)   # cornice
    p.r(x0 - 1, base - 2, x1 + 1, base, W2); p.l(x0 - 1, base - 2, x1 + 1, base - 2, W3)  # plinth
    p.l(x0, top + 3, x0, base - 3, W3); p.l(x1, top + 3, x1, base - 3, W0)
    shelves = [(5, 14), (16, 25), (27, 35), (37, 43)]   # (top, bottom) of each compartment
    back, back2 = (34, 22, 26), (46, 30, 32)
    books = [((112, 32, 36), (150, 56, 52)), ((44, 70, 54), (70, 104, 74)), ((46, 56, 96), (74, 90, 140)),
             ((132, 98, 46), (176, 138, 70)), ((84, 46, 92), (120, 74, 128)), ((90, 70, 52), (126, 100, 72)),
             ((40, 38, 46), (70, 66, 76))]
    for si, (t, b) in enumerate(shelves):
        p.r(x0 + 2, t, x1 - 2, b, back)
        p.l(x0 + 2, t, x1 - 2, t, back2)
        p.r(x0 + 1, b + 1, x1 - 1, b + 2, W3); p.l(x0 + 1, b + 2, x1 - 1, b + 2, W2)  # shelf board
        x = x0 + 2
        lean_done = False
        while x < x1 - 3:
            if si == 1 and 12 <= x <= 14:          # skull + candle stub on the second shelf
                skull(p, x, b - 6)
                x += 8
                continue
            if si == 3 and x > 22:                 # last shelf half empty: a lying stack of books
                for k in range(3):
                    c = books[rnd.randrange(len(books))]
                    p.r(x, b - k * 2 - 1, x + 7 - k, b - k * 2, c[0]); p.l(x, b - k * 2 - 1, x + 6 - k, b - k * 2 - 1, c[1])
                break
            bw = rnd.choice((2, 2, 3, 3, 4))
            bh = rnd.randint(b - t - 4, b - t)
            c = books[rnd.randrange(len(books))]
            if not lean_done and rnd.random() < 0.35 and x + bw + 2 < x1 - 2:
                for k in range(bh):                 # leaning book
                    xx = x + (bh - k) // 4
                    p.l(xx, b - k, xx + bw - 1, b - k, c[0])
                    p.p(xx, b - k, c[1])
                lean_done = True
                x += bw + 2
                continue
            p.r(x, b - bh + 1, x + bw - 1, b, c[0])
            p.l(x, b - bh + 1, x, b, c[1])
            if bh > 4:
                p.l(x, b - bh + 3, x + bw - 1, b - bh + 3, GOLD0)  # gilt band on the spine
            x += bw + (1 if rnd.random() < 0.2 else 0)
    # cobweb in the top right corner
    web = (150, 150, 160)
    p.l(x1 - 2, 5, x1 - 7, 5, web); p.l(x1 - 2, 5, x1 - 2, 10, web); p.l(x1 - 2, 5, x1 - 6, 9, web)
    p.p(x1 - 5, 7, web); p.p(x1 - 4, 8, web); p.p(x1 - 6, 6, web)
    p.outline()
    return save(strip([p.im]), 'prop_bookshelf.png')


def make_statue():
    """Hooded angel with folded wings holding a sword, on a pedestal."""
    p = Pic(30, 52)
    cx, base = 14, 51
    # wings (behind)
    for s in (-1, 1):
        def X(dx):
            return cx + s * dx
        p.poly([(X(3), 18), (X(8), 8), (X(12), 4), (X(13), 10), (X(12), 20), (X(10), 30), (X(6), 34), (X(4), 26)],
               S1 if s > 0 else S2)
        for k in range(4):  # feather rows
            p.l(X(5 + k), 14 + k * 5, X(11), 10 + k * 5, S1 if s < 0 else S0)
        p.l(X(12), 5, X(13), 10, S3 if s < 0 else S2)
    # robe
    p.poly([(cx - 4, 17), (cx + 5, 17), (cx + 7, 41), (cx - 6, 41)], S2)
    p.poly([(cx + 1, 17), (cx + 5, 17), (cx + 7, 41), (cx + 2, 41)], S1)
    p.l(cx - 4, 18, cx - 6, 40, S3)
    for x in (cx - 2, cx + 3):
        p.l(x, 30, x + (1 if x > cx else -1), 40, S1 if x < cx else S0)
    # hood
    p.e(cx - 4, 6, cx + 5, 19, S2)
    p.poly([(cx, 4), (cx + 2, 7), (cx - 2, 7)], S2)
    p.e(cx + 1, 6, cx + 5, 18, S1)
    p.e(cx - 2, 10, cx + 3, 17, (30, 28, 38))          # face in shadow
    p.l(cx - 3, 8, cx - 4, 15, S3)
    p.p(cx - 1, 13, (70, 68, 82)); p.p(cx + 2, 13, (70, 68, 82))  # faint eyes
    # sword held point-down in front, hands on the pommel
    p.r(cx, 22, cx + 1, 39, S3); p.l(cx + 1, 22, cx + 1, 39, S2)
    p.r(cx - 3, 22, cx + 4, 23, S3); p.l(cx - 3, 23, cx + 4, 23, S1)
    p.r(cx - 1, 18, cx + 2, 21, S4)
    # pedestal
    p.r(cx - 11, 41, cx + 12, 42, S3); p.l(cx - 11, 41, cx + 12, 41, S4)
    p.r(cx - 9, 43, cx + 10, 48, S2); p.r(cx + 6, 43, cx + 10, 48, S1)
    p.l(cx - 9, 43, cx - 9, 48, S3)
    p.r(cx - 4, 44, cx + 4, 47, S1); p.r(cx - 3, 45, cx + 3, 46, S0)   # inscription plate
    p.r(cx - 12, 49, cx + 13, base, S1); p.l(cx - 12, 49, cx + 13, 49, S2)
    # moss and cracks
    moss = (70, 92, 50)
    p.ps([(cx - 9, 48), (cx - 8, 47), (cx - 10, 50), (cx + 9, 50), (cx - 6, 40), (cx - 5, 39), (cx + 11, 6)], moss)
    p.ps([(cx + 3, 24), (cx + 4, 25), (cx + 4, 26), (cx - 7, 29)], S0)
    p.outline()
    return save(strip([p.im]), 'prop_statue.png')


def make_cage():
    """Rusty iron birdcage with a slumped skeleton inside."""
    p = Pic(32, 46)
    base = 45
    x0, x1 = 3, 27
    # skeleton sitting on the floor plate (drawn first, bars go over it)
    skull(p, 13, 28, {'a': B3, 'b': B3, 'c': B2, 'd': OUT, 'e': B1, 'f': B2})
    p.r(13, 35, 19, 39, B1)                               # ribcage
    for y in (35, 37, 39):
        p.l(13, y, 19, y, B3)
    p.l(16, 35, 16, 40, B0)
    bone(p, 8, 41, 15, 40)                              # legs splayed on the floor
    bone(p, 17, 41, 25, 40)
    bone(p, 20, 34, 23, 40)                             # arm hanging
    bone(p, 11, 34, 9, 39)
    # floor plate
    p.r(x0 - 1, base - 3, x1 + 1, base, R1); p.l(x0 - 1, base - 3, x1 + 1, base - 3, R2)
    # dome, ring and hook
    p.arc(x0, 4, x1, 22, 180, 360, R2, 2)
    p.eo(13, 0, 17, 4, I2)
    p.r(x0, 12, x1, 13, R2); p.l(x0, 12, x1, 12, R3)       # top hoop
    p.r(x0, 25, x1, 25, R1)                               # middle hoop
    for x in range(x0, x1 + 1, 6):
        p.l(x, 13, x, base - 4, R2)
        p.ps([(x, 16), (x, 22), (x, 31), (x, 38)], R3)
        p.p(x, base - 5, R0)
    p.l(x1, 13, x1, base - 4, R1)
    for x in (9, 15, 21):                                 # dome ribs
        p.l(x, 12, 15 + (x - 15) // 2, 5, R1)
    p.ps([(9, 17), (9, 18), (21, 29), (3, 36)], R0)       # rust streaks
    p.outline()
    return save(strip([p.im]), 'prop_cage.png')


def make_well():
    """Stone fountain with glowing red healing water; frame 1 is dry and dark."""
    frames = []
    for f in range(2):
        p = Pic(38, 36)
        base = 35
        lit = f == 0
        wat = [(110, 14, 34), (196, 34, 58), (255, 96, 112), (255, 200, 200)] if lit else \
              [(28, 20, 24), (40, 30, 34), (52, 40, 42), (60, 48, 50)]
        # basin wall with bricks
        p.r(1, 22, 36, base - 2, S2)
        p.r(0, base - 2, 37, base, S1); p.l(0, base - 2, 37, base - 2, S2)
        for row, y in enumerate(range(24, base - 2, 3)):
            p.l(1, y, 36, y, S1)
            for x in range(1 + (row % 2) * 3, 37, 6):
                p.l(x, y, x, y + 2, S1)
        p.r(30, 22, 36, base - 3, S1)
        p.l(1, 23, 1, base - 3, S3)
        # rim
        p.e(1, 15, 36, 28, S3)
        p.e(3, 17, 34, 25, wat[0])
        p.e(5, 18, 32, 24, wat[1])
        if lit:
            p.e(9, 19, 27, 23, wat[2])
            p.ps([(12, 21), (13, 21), (20, 20), (21, 20), (24, 22)], wat[3])
        else:
            p.ps([(10, 21), (11, 22), (22, 20), (26, 22)], (24, 16, 18))
        # pillar
        p.r(16, 8, 21, 21, S2); p.l(16, 8, 16, 21, S3); p.r(20, 8, 21, 21, S1)
        p.r(15, 19, 22, 21, S2)
        # top bowl
        p.e(10, 5, 27, 11, S3)
        p.e(12, 6, 25, 9, wat[1] if lit else wat[0])
        p.r(12, 9, 25, 11, S2); p.l(12, 11, 25, 11, S1)
        p.r(17, 1, 20, 5, S2); p.l(17, 1, 17, 5, S3); p.r(16, 0, 21, 1, S3)   # finial
        if lit:
            p.ps([(15, 7), (16, 7), (22, 7)], wat[2])
        else:
            p.ps([(15, 7), (21, 8)], (20, 14, 16))
        # cracks/moss
        p.ps([(6, 27), (7, 28), (7, 29), (27, 30), (28, 31)], S0)
        p.ps([(3, 31), (4, 32), (33, 31), (2, 33)], (70, 92, 50))
        p.outline()
        if lit:  # streams from the bowl and rising sparkles (on top of the outline)
            for sx, dx in ((10, -1), (27, 1)):
                for k in range(9):
                    p.p(sx + (dx if k > 5 else 0), 11 + k, wat[2] if k % 3 else wat[3])
            p.ps([(8, 13), (29, 12), (14, 15), (24, 14)], wat[3])
        frames.append(p.im)
    return save(strip(frames), 'prop_well.png')


def make_altar():
    frames = []
    for f in range(2):
        lit = f == 0
        p = Pic(36, 40)
        base = 39
        st0, st1, st2, st3 = (34, 28, 40), (52, 44, 60), (72, 64, 84), (98, 90, 112)
        # body
        p.r(5, 24, 30, base - 2, st1)
        p.r(24, 24, 30, base - 2, st0)
        p.l(5, 24, 5, base - 2, st2)
        p.r(2, base - 2, 33, base, st1); p.l(2, base - 2, 33, base - 2, st2)
        # top slab
        p.r(2, 20, 33, 23, st2); p.l(2, 20, 33, 20, st3); p.l(2, 23, 33, 23, st0)
        # carved rune circle with a pentagram on the front
        rc = V2 if lit else (30, 24, 36)
        p.eo(11, 26, 24, 36, rc)
        pts = [(17.5 + 5.5 * math.sin(a * 4 * math.pi / 5), 31 - 4.5 * math.cos(a * 4 * math.pi / 5)) for a in range(6)]
        p.lines(pts, V1 if lit else (30, 24, 36))
        if lit:
            p.ps([(17, 26), (18, 26), (11, 31), (24, 31), (17, 36)], V3)
        # blood drips over the front edge
        for x, ln in ((8, 3), (9, 1), (21, 4), (27, 2)):
            p.l(x, 23, x, 23 + ln, BL1)
        # skull on top
        skull(p, 14, 13)
        # black candles
        for x in (4, 29):
            p.r(x, 14, x + 2, 19, (40, 34, 44)); p.l(x, 14, x, 19, (70, 62, 76))
        p.outline()
        if lit:
            p.ps([(15, 16), (16, 16), (18, 16), (19, 16)], V2)   # eye glow
            p.p(15, 17, V3); p.p(18, 17, V3)
            # cursed flames rising above the skull
            for x, h, ln in ((14, 7, -1), (17, 11, 0), (20, 8, 1), (16, 5, 1), (19, 6, -1)):
                flame(p, x, 13, h, ln, (V0, V1, V2, V3))
            flame(p, 5, 13, 5, 0, (V0, V1, V2, V3))
            flame(p, 30, 13, 5, 1, (V0, V1, V2, V3))
        else:
            for x in (5, 30):
                p.p(x, 13, OUT)
            smoke = (88, 84, 96)
            p.ps([(5, 11), (6, 10), (5, 8), (30, 11), (29, 9), (30, 7), (17, 11), (18, 9), (17, 7), (18, 5)], smoke)
        frames.append(p.im)
    return save(strip(frames), 'prop_altar.png')


def make_spikes():
    frames = []
    for f in range(2):
        p = Pic(34, 18)
        base = 17
        # plate: top surface (2 rows) and front edge
        p.r(1, base - 4, 32, base - 3, I2); p.l(1, base - 4, 32, base - 4, I3)
        p.r(1, base - 2, 32, base, I1)
        for x in (4, 8, 12, 16, 20, 24, 28):
            p.p(x, base, I0)                               # rivets on the front edge
        if f == 1:
            # back row (shorter, darker)
            for x in range(6, 30, 6):
                p.poly([(x - 1, base - 4), (x + 1, base - 4), (x, base - 12)], M0)
                p.l(x, base - 11, x, base - 5, M1)
            # front row
            for i, x in enumerate(range(3, 33, 6)):
                h = 15 - (i % 2)
                p.poly([(x - 1, base - 3), (x + 1, base - 3), (x, base - h)], M1)
                p.l(x - 1, base - 4, x, base - h, M2)
                p.p(x, base - h, M3)
                if i in (1, 4):
                    p.ps([(x, base - h + 1), (x, base - h + 2)], BL1)
        else:
            for x in range(3, 33, 6):                     # holes in the plate
                p.p(x, base - 4, I0); p.p(x, base - 3, OUT)
            for x in range(6, 30, 6):
                p.p(x, base - 4, OUT)
        p.outline()
        frames.append(p.im)
    return save(strip(frames), 'prop_spikes.png')


def make_barrel_red():
    p = Pic(26, 34)
    base, cx = 33, 12.5
    ramp = [(62, 14, 18), (98, 22, 26), (138, 32, 32), (174, 46, 40), (208, 76, 56)]
    top = 7
    for y in range(top + 1, base + 1):
        t = (y - top) / (base - top)
        hw = 9 + 1.6 * math.sin(math.pi * t)
        for x in range(int(cx - hw), int(cx + hw) + 1):
            u = (x - (cx - hw)) / (2 * hw)                # 0 left .. 1 right
            k = 0.9 - abs(u - 0.33) * 2.2
            c = ramp[max(0, min(4, int(k * 5 + 1)))]
            if int(x - cx + 100) % 4 == 0:                 # stave seams
                c = ramp[0]
            p.p(x, y, c)
    # iron hoops
    for y0 in (top + 3, base - 4):
        t = (y0 - top) / (base - top)
        hw = 9 + 1.6 * math.sin(math.pi * t) + 0.5
        p.r(int(cx - hw), y0, int(cx + hw), y0 + 1, I1)
        p.l(int(cx - hw) + 2, y0, int(cx + hw) - 4, y0, I3)
    # top: iron rim ellipse with the wooden head inside
    p.e(2, top - 3, 23, top + 2, I1)
    p.e(4, top - 2, 21, top + 1, (104, 46, 34))
    p.l(7, top - 1, 18, top - 1, (134, 64, 44)); p.l(8, top, 17, top, (86, 36, 28))
    # hazard mark: yellow diamond with a black flame
    yel, yeld = (236, 196, 64), (176, 128, 36)
    my, mx = 19, 12
    for dy in range(-5, 6):
        w = 5 - abs(dy)
        p.l(mx - w, my + dy, mx + w, my + dy, yel)
        p.p(mx + w, my + dy, yeld)
    p.bitmap(mx - 2, my - 3, ['..x..',
                              '..xx.',
                              '.xxx.',
                              'xx.xx',
                              'xx.xx',
                              '.xxx.'], {'x': OUT})
    # fuse
    fuse = (120, 96, 60)
    p.ps([(14, top - 3), (15, top - 4), (15, top - 5), (16, top - 6)], fuse)
    p.outline()
    p.ps([(17, top - 7), (16, top - 7), (17, top - 6)], F2)
    p.p(17, top - 8, F3); p.p(18, top - 7, F1); p.p(19, top - 9, F2)
    return save(strip([p.im]), 'prop_barrel_red.png')


def make_crystal():
    """Gothicvania Rocky Pass crystal-1 (Ansimuz, CC0), luminance-remapped from red to cyan; frame 1 glows."""
    src = Image.open(GV + 'Rocky Pass Files/PNG/Props/crystal-1.png').convert('RGBA')
    src = src.crop(src.getbbox())
    a = np.array(src).astype(float)
    lum = (a[:, :, 0] * 0.3 + a[:, :, 1] * 0.59 + a[:, :, 2] * 0.11) / 255
    ramps = [[(22, 84, 118), (32, 132, 172), (56, 192, 226), (120, 232, 250), (186, 250, 255)],
             [(30, 108, 146), (44, 166, 210), (92, 228, 252), (176, 252, 255), (242, 255, 255)]]
    frames = []
    for f in range(2):
        lo, hi = lum[a[:, :, 3] > 0].min(), lum[a[:, :, 3] > 0].max()
        t = np.clip((lum - lo) / (hi - lo + 1e-6), 0, 1)
        r = np.array(ramps[f], float)
        idx = np.clip((t * 4.999).astype(int), 0, 4)
        out = np.zeros_like(a)
        out[:, :, :3] = r[idx]
        out[:, :, 3] = np.where(a[:, :, 3] >= 100, 255, 0)
        cr = Image.fromarray(out.astype(np.uint8))
        p = Pic(cr.width + 6, cr.height + 6)
        # rock rubble at the base
        bw, bh = p.w, p.h
        p.poly([(1, bh - 1), (2, bh - 4), (5, bh - 5), (8, bh - 3), (9, bh - 1)], S1)
        p.poly([(bw - 9, bh - 1), (bw - 8, bh - 3), (bw - 5, bh - 4), (bw - 2, bh - 1)], S1)
        p.l(3, bh - 4, 5, bh - 4, S2); p.l(bw - 7, bh - 3, bw - 5, bh - 3, S2)
        p.im.alpha_composite(cr, (3, bh - cr.height - 2))
        p.outline()
        if f == 1:
            p.ps([(4, 6), (bw - 4, 9), (bw // 2 + 2, 2)], (230, 255, 255))
            p.ps([(4, 5), (4, 7), (3, 6), (5, 6)], (90, 200, 240))
        else:
            p.ps([(bw - 5, 4)], (150, 240, 255))
        frames.append(p.im)
    return save(strip(frames), 'prop_crystal.png')


def make_mushroom():
    frames = []
    for f in range(2):
        p = Pic(24, 22)
        base = 21
        caps = [(16, 74, 80), (26, 122, 120), (60, 190, 168), (150, 255, 220)] if f == 0 else \
               [(20, 90, 96), (34, 150, 146), (90, 224, 196), (200, 255, 236)]
        stem, steml, stemd = (178, 190, 170), (214, 226, 204), (120, 134, 120)
        # (cap x0, cap y0, cap w, cap h, stem x, stem w)
        for x0, y0, w, h, sx, sw in ((2, 11, 8, 5, 5, 2), (6, 3, 12, 7, 10, 3), (15, 8, 8, 5, 18, 2)):
            p.r(sx, y0 + h - 1, sx + sw - 1, base, stem); p.l(sx, y0 + h - 1, sx, base, steml)
            p.l(sx + sw - 1, y0 + h, sx + sw - 1, base, stemd)
            p.e(x0, y0, x0 + w - 1, y0 + h + 1, caps[1])
            p.r(x0, y0 + h - 1, x0 + w - 1, y0 + h, caps[0])          # gill shadow
            p.e(x0 + 1, y0, x0 + w - 3, y0 + h - 2, caps[2])
            p.p(x0 + 2, y0 + 1, caps[3]); p.p(x0 + w - 3, y0 + 2, caps[3]); p.p(x0 + w // 2, y0 + 2, caps[3])
        p.r(1, base - 1, 22, base, (34, 46, 30)); p.ps([(0, base), (23, base), (4, base - 2), (20, base - 2)], (46, 64, 36))
        p.outline()
        if f == 1:
            p.ps([(4, 8), (12, 0), (21, 5), (17, 1)], (170, 255, 220))
        else:
            p.ps([(9, 1), (20, 6)], (90, 200, 170))
        frames.append(p.im)
    return save(strip(frames), 'prop_mushroom.png')


def make_armor():
    p = Pic(32, 46)
    base = 45
    cx = 15
    # stand
    p.r(cx, 10, cx + 1, base - 2, W2); p.l(cx, 10, cx, base - 2, W3)
    p.r(cx - 8, base - 2, cx + 9, base, W2); p.l(cx - 8, base - 2, cx + 9, base - 2, W3)
    p.r(cx - 9, 15, cx + 10, 16, W2)
    # pauldrons
    for x0 in (cx - 10, cx + 5):
        p.e(x0, 13, x0 + 6, 19, M1)
        p.l(x0 + 1, 14, x0 + 4, 14, M3)
        p.l(x0, 17, x0 + 6, 17, M0)
    # breastplate
    p.poly([(cx - 6, 15), (cx + 7, 15), (cx + 6, 26), (cx + 4, 29), (cx - 3, 29), (cx - 5, 26)], M1)
    p.poly([(cx - 5, 16), (cx, 16), (cx, 28), (cx - 3, 28), (cx - 4, 25)], M2)
    p.l(cx, 16, cx, 28, M3)
    p.l(cx - 5, 21, cx + 6, 21, M0)
    p.r(cx - 4, 29, cx + 5, 32, R1); p.l(cx - 4, 29, cx + 5, 29, R2)     # leather fauld
    p.l(cx - 1, 29, cx - 1, 32, R0); p.l(cx + 2, 29, cx + 2, 32, R0)
    # great helm
    p.r(cx - 4, 3, cx + 5, 12, M1)
    p.e(cx - 4, 0, cx + 5, 6, M1)
    p.r(cx - 4, 3, cx - 1, 11, M2); p.l(cx - 3, 1, cx - 3, 11, M3)
    p.r(cx - 4, 6, cx + 5, 6, OUT)                         # visor slit
    p.l(cx, 2, cx, 12, M0)
    p.ps([(cx + 2, 8), (cx + 4, 8), (cx + 3, 10)], OUT)
    p.r(cx - 1, 0, cx + 2, 0, (150, 30, 30))               # red crest
    # sword leaning on the left
    for k in range(17):
        x, y = 5 + k // 6, 26 + k
        p.p(x, y, M2); p.p(x + 1, y, M1)
    p.r(2, 24, 9, 25, GOLD0); p.l(2, 24, 9, 24, GOLD1)
    p.l(5, 19, 5, 23, W1); p.p(5, 18, GOLD1)
    # heater shield leaning on the right
    sx, sy = 19, 28
    p.poly([(sx, sy), (sx + 11, sy), (sx + 11, sy + 8), (sx + 6, sy + 16), (sx + 5, sy + 16), (sx, sy + 8)], I2)
    p.poly([(sx + 1, sy + 1), (sx + 10, sy + 1), (sx + 10, sy + 8), (sx + 6, sy + 14), (sx + 5, sy + 14), (sx + 1, sy + 8)],
           (120, 26, 30))
    p.poly([(sx + 6, sy + 1), (sx + 10, sy + 1), (sx + 10, sy + 8), (sx + 6, sy + 14)], (92, 18, 24))
    p.r(sx + 5, sy + 2, sx + 6, sy + 12, B2); p.r(sx + 2, sy + 5, sx + 9, sy + 6, B2)   # pale cross
    p.l(sx + 1, sy + 1, sx + 1, sy + 7, (160, 50, 46))
    p.outline()
    return save(strip([p.im]), 'prop_armor.png')


def make_table():
    p = Pic(40, 28)
    base = 27
    # legs (back legs darker)
    for x in (7, 31):
        p.r(x, 17, x + 1, base - 3, W1)
    for x in (2, 35):
        p.r(x, 17, x + 2, base, W2); p.l(x, 17, x, base, W3)
    p.r(4, 22, 35, 22, W1)                                # stretcher
    # top
    p.r(0, 14, 39, 14, W4)
    p.r(0, 15, 39, 17, W3); p.l(0, 17, 39, 17, W2)
    for x in (10, 22, 31):
        p.p(x, 15, W2); p.p(x + 1, 16, W2)
    # candle in a holder
    p.r(5, 12, 9, 13, I2); p.l(5, 12, 9, 12, I3)
    p.r(6, 6, 8, 11, (214, 202, 170)); p.l(6, 6, 6, 11, (238, 230, 204)); p.p(8, 9, (164, 146, 120))
    # pewter plate with bread and a chicken leg
    p.e(13, 11, 24, 14, M1); p.l(15, 12, 22, 12, M2)
    p.e(14, 8, 19, 12, (172, 120, 60)); p.l(15, 9, 17, 9, (214, 164, 92))
    p.e(19, 9, 23, 12, (150, 70, 40)); p.p(23, 9, B3); p.p(24, 8, B3)
    # green bottle and a mug
    p.r(27, 6, 29, 13, (40, 92, 52)); p.l(27, 6, 27, 13, (70, 140, 80)); p.r(28, 3, 28, 5, (40, 92, 52))
    p.p(28, 2, (150, 110, 70))
    p.r(32, 9, 35, 13, W3); p.l(32, 9, 35, 9, W4); p.r(36, 10, 36, 12, W2); p.l(33, 10, 33, 13, W4)
    p.outline()
    flame(p, 7, 5, 4, 0)
    return save(strip([p.im]), 'prop_table.png')


def crate_pic():
    p = Pic(26, 26)
    x0, x1, y0, y1 = 1, 23, 4, 24
    p.r(x0 + 1, 1, x1 + 1, y0, W3); p.l(x0 + 2, 1, x1 + 1, 1, W4)   # top (slightly visible)
    p.r(x1 + 1, 2, x1 + 1, y1 - 1, W1)
    p.r(x0, y0, x1, y1, W2)
    for y in range(y0 + 4, y1 - 2, 4):                            # planks
        p.l(x0 + 3, y, x1 - 3, y, W1)
    # frame boards
    for (a, b, c, d) in ((x0, y0, x1, y0 + 2), (x0, y1 - 2, x1, y1), (x0, y0, x0 + 2, y1), (x1 - 2, y0, x1, y1)):
        p.r(a, b, c, d, W3)
    p.l(x0, y0, x1, y0, W4); p.l(x0, y0, x0, y1, W4)
    # diagonal brace
    for k in range(-1, 2):
        p.l(x0 + 3, y1 - 3 + k, x1 - 3, y0 + 3 + k, W3 if k else W4)
    p.l(x0 + 4, y1 - 2, x1 - 2, y0 + 4, W1)
    for x, y in ((x0 + 1, y0 + 1), (x1 - 1, y0 + 1), (x0 + 1, y1 - 1), (x1 - 1, y1 - 1)):
        p.p(x, y, M1)
    p.outline()
    return p


def make_crate():
    return save(strip([crate_pic().im]), 'prop_crate.png')


def make_crate_broken():
    """Four debris pieces, 12x12 cells like shards.png."""
    pieces = []
    shapes = [
        [(1, 7, 10, 5, 3)],              # (x0,y0,x1,y1,width) plank
        [(1, 9, 8, 9, 3), (2, 9, 2, 2, 3)],
        [(2, 10, 9, 2, 2)],
        [(1, 5, 10, 6, 3)],
    ]
    for i, sh in enumerate(shapes):
        p = Pic(12, 12)
        for (a, b, c, d, w) in sh:
            p.l(a, b, c, d, W3, w)
            p.l(a, b - 1, c, d - 1, W4)
        if i == 0:
            p.ps([(10, 4), (11, 3), (9, 7)], W3)       # splinters
        if i == 3:
            p.ps([(3, 5), (8, 6)], M1)               # nails
            p.p(11, 4, W3)
        p.outline()
        pieces.append(p.im)
    out = Image.new('RGBA', (48, 12), (0, 0, 0, 0))
    for i, im in enumerate(pieces):
        out.paste(hard(im), (i * 12, 0))
    return save(out, 'prop_crate_broken.png')


# ================================================================== MIMIC
def mimic_parts():
    """Cut lid and body from the closed chest frame (chest.png frame 2)."""
    ch = Image.open(G_OUT + 'chest.png').convert('RGBA')
    fr = ch.crop((32, 0, 48, 16))
    lid = fr.crop((0, 2, 16, 7))     # rows 2..6
    body = fr.crop((0, 7, 16, 14))   # rows 7..13 (bottom outline on row 13)
    return ch, lid, body


TOOTH, TOOTH_D = (240, 236, 218), (176, 168, 150)
MOUTH, MOUTH_D, THROAT = (110, 20, 34), (70, 10, 22), (40, 6, 14)
TONGUE, TONGUE_L, TONGUE_D = (206, 70, 92), (240, 120, 136), (140, 36, 58)
EYE, EYE_L = (255, 213, 105), (255, 241, 204)


def mimic_frame(gap=0, dx=0, dy=0, lid_dx=0, tongue=0, eyes=True, squash=0, teeth=True, tongue_dx=0, eye_shut=False):
    """Compose one 32x32 mimic frame.
    gap: pixels the lid is lifted (mouth height), dy: hop height, squash: body rows removed (landing),
    tongue: tongue length hanging over the body front."""
    _, lid, body = mimic_parts()
    p = Pic(32, 32)
    bx, by = 8 + dx, 29 - 6 - dy                  # body top-left (body is 7 rows -> bottom on row 29)
    if squash:
        b = Image.new('RGBA', (16, 7 - squash), (0, 0, 0, 0))
        b.paste(body.crop((0, 0, 16, 2)), (0, 0))
        b.paste(body.crop((0, 2 + squash, 16, 7)), (0, 2))
        body = b
        by += squash
    ly = by - 5 - gap                             # lid top
    if gap > 0:
        # mouth cavity between lid and body
        top, bot = ly + 4, by
        p.r(bx + 1, top, bx + 14, bot, MOUTH_D)
        p.r(bx + 2, top + 1, bx + 13, bot, MOUTH)
        if gap >= 4:
            p.r(bx + 4, top + 2, bx + 11, bot - 1, THROAT)
        p.l(bx + 1, top, bx + 1, bot, OUT); p.l(bx + 14, top, bx + 14, bot, OUT)
    p.im.alpha_composite(body, (bx, by))
    p.im.alpha_composite(lid, (bx + lid_dx, ly))
    if gap >= 5:            # lid thrown back: its dark wooden underside shows below the rim
        p.r(bx + 1 + lid_dx, ly + 5, bx + 14 + lid_dx, ly + 6, W1)
        p.l(bx + 2 + lid_dx, ly + 5, bx + 13 + lid_dx, ly + 5, W0)
        p.p(bx + 1 + lid_dx, ly + 5, OUT); p.p(bx + 14 + lid_dx, ly + 5, OUT)
        p.p(bx + 1 + lid_dx, ly + 6, OUT); p.p(bx + 14 + lid_dx, ly + 6, OUT)
        ly += 2
    if gap > 0 and teeth:
        # fangs hanging from the lid rim and rising from the body edge
        for i, x in enumerate(range(bx + 2, bx + 14, 2)):
            ln = 2 if i in (0, 5) and gap >= 3 else 1
            for k in range(min(ln, gap)):
                p.p(x + lid_dx, ly + 5 + k, TOOTH if k == 0 else TOOTH_D)
        for i, x in enumerate(range(bx + 3, bx + 13, 2)):
            if gap >= 2:
                p.p(x, by - 1, TOOTH)
                if i in (0, 4) and gap >= 4:
                    p.p(x, by - 2, TOOTH_D)
    if gap >= 4 and eyes:
        ey = ly + 5 + (1 if gap >= 5 else 0) + 1
        for ex in (bx + 4, bx + 10):
            if eye_shut:
                p.l(ex, ey, ex + 1, ey, EYE)
            else:
                p.r(ex, ey, ex + 1, ey + 1, EYE); p.p(ex, ey, EYE_L); p.p(ex + 1, ey + 1, OUT)
    if tongue > 0:
        tx = bx + 7 + tongue_dx
        y0 = by - 1
        for k in range(tongue):
            wob = [0, 0, 1, 1, 0, -1, -1, 0][k % 8] if tongue > 3 else 0
            p.r(tx + wob - 1, y0 + k, tx + wob + 1, y0 + k, TONGUE)
            p.p(tx + wob - 1, y0 + k, TONGUE_L)
            p.p(tx + wob + 1, y0 + k, TONGUE_D)
        e = y0 + tongue - 1
        wob = [0, 0, 1, 1, 0, -1, -1, 0][(tongue - 1) % 8] if tongue > 3 else 0
        p.r(tx + wob - 1, e + 1, tx + wob + 2, e + 1, TONGUE_D)   # forked/curled tip
        p.p(tx + wob - 2, e, TONGUE_D)
        p.p(tx + wob, e - 1, TONGUE_D)
    return p


def make_mimic():
    ch, lid, body = mimic_parts()
    # idle: exactly the chest's own 4-frame idle, centred with the bottom outline on row 29
    idle = []
    for f in range(4):
        im = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
        im.paste(ch.crop((f * 16, 0, f * 16 + 16, 16)), (8, 16))
        idle.append(im)
    # movement: a 6-frame hop (crouch, take off, airborne with jaw flapping, fall, land)
    move = [mimic_frame(squash=2, gap=0).im,
            mimic_frame(dy=2, gap=2).im,
            mimic_frame(dy=5, gap=3, tongue=2).im,
            mimic_frame(dy=6, gap=2, tongue=3).im,
            mimic_frame(dy=3, gap=1).im,
            mimic_frame(squash=1, gap=0).im]
    # attack: wind up, jaws open wide with eyes/tongue, lunge, chomp, recover
    attack = [mimic_frame(squash=2).im,
              mimic_frame(gap=3, dy=1).im,
              mimic_frame(gap=7, dy=2, tongue=4).im,
              mimic_frame(gap=9, dy=3, dx=0, tongue=7, tongue_dx=0).im,
              mimic_frame(gap=0, dy=1, squash=1).im,
              mimic_frame(gap=2, tongue=0).im]
    hurt = [mimic_frame(gap=2, dx=-1, squash=1, eye_shut=True).im,
            mimic_frame(gap=4, dx=1, dy=1, eye_shut=True, tongue=2).im,
            mimic_frame(gap=1, dx=0).im]
    death = make_mimic_death(lid, body)
    for state, frames in (('idle', idle), ('movement', move), ('attack', attack), ('take_damage', hurt), ('death', death)):
        out = Image.new('RGBA', (32 * len(frames), 32), (0, 0, 0, 0))
        for i, f in enumerate(frames):
            if f.size != (32, 32):          # outlined frames grew by 1px per side
                f = f.crop((1, 1, 33, 33))
            out.paste(hard(f), (i * 32, 0))
        save(out, f'enemies-mimic_{state}.png')


def make_mimic_death(lid, body):
    frames = []
    # 0: jaws gape, tongue lolls
    frames.append(mimic_frame(gap=8, dy=0, tongue=6, eye_shut=True).im)
    # 1: lid flips back (shown rotated a quarter turn behind the body), tongue limp
    p = mimic_frame(gap=0, tongue=0)
    p = Pic(32, 32)
    bx, by = 8, 23
    p.r(bx + 2, by - 2, bx + 13, by, MOUTH)
    p.im.alpha_composite(body, (bx, by))
    lr = lid.rotate(-90, expand=True)                 # 5x16
    p.im.alpha_composite(lr, (bx + 13, by - 14))
    for x in range(bx + 3, bx + 13, 2):
        p.p(x, by - 1, TOOTH)
    for k in range(5):
        p.r(bx + 6, by + k, bx + 8, by + k, TONGUE)
        p.p(bx + 6, by + k, TONGUE_L)
    frames.append(p.im)
    # 2: lid falls to the right side, body sags
    p = Pic(32, 32)
    b2 = Image.new('RGBA', (16, 6), (0, 0, 0, 0))
    b2.paste(body.crop((0, 0, 16, 2)), (0, 0)); b2.paste(body.crop((0, 3, 16, 7)), (0, 2))
    p.im.alpha_composite(lid.rotate(-90, expand=True).rotate(-30, expand=True, resample=Image.NEAREST), (19, 14))
    p.r(7 + 2, 22, 7 + 13, 24, MOUTH)
    p.im.alpha_composite(b2, (7, 24))
    for k in range(6):
        p.r(13, 24 + k - 1, 15, 24 + k - 1, TONGUE)
    frames.append(p.im)
    # 3..5: the lid crashes down behind, the box splits in two halves, coins and the limp tongue spill out
    def squash(im, keep):
        out = Image.new('RGBA', (im.width, 2 + keep), (0, 0, 0, 0))
        out.paste(im.crop((0, 0, im.width, 2)), (0, 0))
        out.paste(im.crop((0, im.height - keep, im.width, im.height)), (0, 2))
        return out
    left, right = body.crop((0, 0, 8, 7)), body.crop((8, 0, 16, 7))
    for f, (keep, split, lidy) in enumerate(((4, 1, 23), (3, 3, 25), (2, 4, 26))):
        p = Pic(32, 32)
        lflat = lid.transpose(Image.FLIP_TOP_BOTTOM) if f else lid
        p.im.alpha_composite(lflat.rotate(8 if f == 0 else 0, resample=Image.NEAREST, expand=False), (14, lidy - 3))
        l2, r2 = squash(left, keep), squash(right, keep)
        y = 30 - l2.height
        p.r(8, y + 1, 23, 29, THROAT)                         # broken open insides
        p.im.alpha_composite(l2, (8 - split, y))
        p.im.alpha_composite(r2, (16 + split, y))
        # tongue lying on the floor in front, coins and teeth spilled
        for k in range(5 + f * 2):
            x = 12 + k - f
            p.p(x, 29, TONGUE); p.p(x, 28, TONGUE_L if k % 3 else TONGUE)
        p.p(12 - f + 5 + f * 2, 29, TONGUE_D)
        for (cx, cy) in ((15, 25 + f), (11 - split, 27), (25 + split, 27), (20, 26 + f), (6 - f, 28)):
            p.r(cx, cy, cx + 1, cy + 1, GOLD1); p.p(cx, cy, GOLD2); p.p(cx + 1, cy + 1, GOLD0)
        p.ps([(17, 28), (10 + f, 26)], TOOTH)
        frames.append(p.im)
    return frames


# ================================================================== TEXTURES
def gmap(lum, stops):
    """Gradient-map a 0..1 float array through [(t, rgb), ...] stops -> uint8 RGB array."""
    ts = np.array([s[0] for s in stops], float)
    cs = np.array([s[1] for s in stops], float)
    out = np.zeros(lum.shape + (3,))
    for ch in range(3):
        out[..., ch] = np.interp(lum, ts, cs[:, ch])
    return out


def lum_of(path, size, norm=True):
    im = Image.open(path).convert('L').resize(size, Image.LANCZOS)
    a = np.array(im, float) / 255
    if norm:
        lo, hi = np.percentile(a, 2), np.percentile(a, 98)
        a = np.clip((a - lo) / (hi - lo + 1e-6), 0, 1)
    return a


def tile_lum(path, size, reps):
    """Tile a seamless source reps=(nx, ny) times, then resample to size."""
    src = Image.open(path).convert('L')
    big = Image.new('L', (src.width * reps[0], src.height * reps[1]))
    for i in range(reps[0]):
        for j in range(reps[1]):
            big.paste(src, (i * src.width, j * src.height))
    a = np.array(big.resize(size, Image.LANCZOS), float) / 255
    lo, hi = np.percentile(a, 2), np.percentile(a, 98)
    return np.clip((a - lo) / (hi - lo + 1e-6), 0, 1)


def finish(rgb, path, colors=48):
    """Half-res RGB array -> nearest x2 upscale -> palettize, like biome-textures/make.py."""
    im = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), 'RGB')
    im = im.resize((im.width * 2, im.height * 2), Image.NEAREST)
    im.quantize(colors, method=Image.Quantize.MEDIANCUT).save(path)
    return im


def blend(rgb, mask, color, alpha=1.0):
    m = (mask.astype(float) * alpha)[..., None]
    return rgb * (1 - m) + np.array(color, float) * m


def wrap_points(x, y, w, h):
    for ox in (-w, 0, w):
        for oy in (-h, 0, h):
            yield x + ox, y + oy


def voronoi(w, h, pts, sx=1.0, sy=1.0):
    """Toroidal Voronoi: returns (index of nearest, d1, d2) arrays."""
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    d = []
    for (px, py) in pts:
        dx = np.abs(xx - px); dx = np.minimum(dx, w - dx)
        dy = np.abs(yy - py); dy = np.minimum(dy, h - dy)
        d.append(np.sqrt((dx * sx) ** 2 + (dy * sy) ** 2))
    d = np.stack(d)
    o = np.argsort(d, axis=0)
    idx = o[0]
    d1 = np.take_along_axis(d, o[:1], 0)[0]
    d2 = np.take_along_axis(d, o[1:2], 0)[0]
    return idx, d1, d2, o[1]


def mask_draw(w, h, fn, wrap=True):
    """Draw with PIL onto an L mask; with wrap the drawing is repeated so the result tiles."""
    m = Image.new('L', (w * 3, h * 3), 0)
    d = ImageDraw.Draw(m)
    offs = [(ox, oy) for ox in (0, w, 2 * w) for oy in (0, h, 2 * h)] if wrap else [(w, h)]
    for ox, oy in offs:
        fn(d, ox, oy)
    return np.array(m.crop((w, h, 2 * w, 2 * h)), float) / 255


def glow(mask, radius):
    im = Image.fromarray((np.clip(mask, 0, 1) * 255).astype(np.uint8), 'L')
    big = Image.new('L', (im.width * 3, im.height * 3))
    for i in range(3):
        for j in range(3):
            big.paste(im, (i * im.width, j * im.height))
    big = big.filter(ImageFilter.GaussianBlur(radius))
    return np.array(big.crop((im.width, im.height, im.width * 2, im.height * 2)), float) / 255


def tex_demon():
    rnd = random.Random(31)
    w, h = 32, 64
    # blood-red flesh bricks: brick layout drawn here, surface grain from Kenney wall_stone
    grain = tile_lum(K + 'wall_stone.png', (w, h), (1, 2))
    yy, xx = np.mgrid[0:h, 0:w]
    row = yy // 5
    off = np.where(row % 2 == 1, 4, 0)
    col = ((xx + off) % w) // 8
    mortar = (yy % 5 == 4) | ((xx + off) % 8 == 7)
    tone = np.vectorize(lambda r_, c_: random.Random(int(r_) * 131 + int(c_) * 17).uniform(0.7, 1.15))(row, col)
    bev = np.where(yy % 5 == 0, 0.18, 0) + np.where((xx + off) % 8 == 0, 0.1, 0) - np.where(yy % 5 == 3, 0.12, 0)
    v = np.clip(0.42 * tone + 0.35 * grain + bev, 0, 1)
    rgb = gmap(v, [(0, (30, 5, 10)), (0.35, (70, 14, 18)), (0.6, (112, 26, 28)), (0.85, (150, 46, 42)), (1, (178, 74, 64))])
    rgb[mortar] = (20, 3, 7)
    # veins: branching random walks across the bricks, dark swollen core with a wet highlight on top
    def veins(d, ox, oy):
        r = random.Random(5)
        for (x, y) in ((4, 4), (20, 12), (12, 44), (27, 52)):
            for br in range(2):
                ang = r.uniform(0, math.tau)
                px_, py_ = x, y
                pts = [(px_, py_)]
                for _ in range(r.randint(5, 9)):
                    ang += r.uniform(-0.7, 0.7)
                    px_ += math.cos(ang) * 2.0; py_ += math.sin(ang) * 2.0
                    pts.append((px_, py_))
                d.line([(qx + ox, qy + oy) for qx, qy in pts], fill=255, width=1)
    vm = mask_draw(w, h, veins) > 0.4
    rgb = blend(rgb, np.clip(glow(vm.astype(float), 0.8) * 1.5, 0, 1), (60, 6, 14), 0.5)
    rgb = blend(rgb, vm, (84, 8, 22))
    lit = vm & ~np.roll(vm, 1, 0)
    rgb = blend(rgb, lit, (196, 54, 64))
    # bone frieze: dark band with skulls and crossed bones (2 per tile)
    by0 = 27
    rgb[by0:by0 + 10, :] = (26, 6, 10)
    rgb[by0, :] = (90, 74, 60); rgb[by0 + 9, :] = (60, 48, 42)
    sk = ['.aaa.', 'abbbc', 'bdbdc', 'bbebc', '.f.f.']
    pal = {'a': B3, 'b': B2, 'c': B1, 'd': (30, 6, 10), 'e': B0, 'f': B1}
    for sx in (3, 19):
        for j, row in enumerate(sk):
            for i, ch in enumerate(row):
                if ch in pal:
                    rgb[by0 + 2 + j, sx + i] = pal[ch]
    for bx0 in (11, 27):  # crossed bones
        for k in range(6):
            rgb[by0 + 2 + k, (bx0 + k) % w] = B2
            rgb[by0 + 2 + k, (bx0 + 5 - k) % w] = B1
    # ribs embedded in the lower wall
    for rx, ry in ((6, 46), (22, 50)):
        for k in range(4):
            for t in range(6):
                yy = ry + k * 2 + (1 if t in (0, 5) else 0)
                rgb[yy, (rx + t) % w] = B1 if t else B2
    # blood running down from the top
    for x in (4, 13, 25):
        ln = rnd.randint(6, 14)
        rgb[0:ln, x] = BL0
        rgb[ln, x] = BL1
    finish(rgb, W_OUT + 'wall_boss_demon.png')

    # floor: dark flagstones stained with blood
    w = h = 32
    lum = tile_lum(K + 'floor_stone_pattern.png', (w, h), (1, 1))
    rgb = gmap(lum, [(0, (14, 10, 12)), (0.45, (40, 32, 34)), (0.8, (62, 52, 52)), (1, (84, 72, 70))])
    def splats(d, ox, oy):
        r = random.Random(9)
        for (x, y) in ((7, 8), (23, 21), (11, 26), (27, 4)):
            for _ in range(6):
                rx, ry = r.uniform(1, 4), r.uniform(1, 3)
                dx, dy = r.uniform(-4, 4), r.uniform(-3, 3)
                d.ellipse((x + dx - rx + ox, y + dy - ry + oy, x + dx + rx + ox, y + dy + ry + oy), fill=255)
    bm = mask_draw(w, h, splats)
    rgb = blend(rgb, bm > 0.5, (84, 8, 14), 0.85)
    rgb = blend(rgb, (bm > 0.5) & (lum > 0.6), (120, 16, 22), 0.6)
    finish(rgb, W_OUT + 'floor_boss_demon.png')


def basalt(w, h, pts, sx, sy, seed, lava_frac, grain):
    rnd = random.Random(seed)
    idx, d1, d2, idx2 = voronoi(w, h, pts, sx, sy)
    edge = d2 - d1
    tone = np.array([rnd.uniform(0.75, 1.15) for _ in pts])[idx]
    # bevel: lit on the upper-left side of each cell
    base = np.clip(edge / 3.0, 0, 1)
    sh = np.clip(0.5 + (np.roll(edge, 1, 0) - edge) * -0.8 + (np.roll(edge, 1, 1) - edge) * -0.4, 0, 1)
    v = (0.25 + 0.55 * base * tone + 0.25 * (grain - 0.5)) * (0.75 + 0.5 * sh)
    rgb = gmap(np.clip(v, 0, 1), [(0, (6, 5, 8)), (0.35, (20, 18, 24)), (0.6, (38, 34, 40)), (0.85, (60, 54, 58)), (1, (84, 76, 76))])
    # lava only along some cell pairs
    pairs = {}
    lava_pair = np.zeros_like(edge, bool)
    for y in range(h):
        for x in range(w):
            a, b = sorted((int(idx[y, x]), int(idx2[y, x])))
            if (a, b) not in pairs:
                pairs[(a, b)] = random.Random(a * 997 + b * 31 + seed).random() < lava_frac
            lava_pair[y, x] = pairs[(a, b)]
    crack = edge < 1.1
    lava = crack & lava_pair
    g = glow(lava.astype(float), 1.6)
    rgb = blend(rgb, np.clip(g * 1.6, 0, 1), (150, 44, 10), 0.75)
    rgb = blend(rgb, crack & ~lava_pair, (4, 3, 5))
    rgb = blend(rgb, lava, (238, 110, 24))
    core = lava & (edge < 0.45)
    rgb = blend(rgb, core, (255, 214, 110))
    return rgb


def tex_beast():
    rnd = random.Random(4)
    w, h = 32, 64
    grain = tile_lum(C64 + 'Rocks/Materials/rock_wall_04.jpg', (w, h), (1, 2))
    pts = [(rnd.uniform(0, w), rnd.uniform(0, h)) for _ in range(14)]
    rgb = basalt(w, h, pts, 1.0, 0.45, 2, 0.4, grain)    # tall basalt columns
    # lava glow welling up along the bottom
    yy = np.mgrid[0:h, 0:w][0]
    rgb = blend(rgb, np.clip((yy - 52) / 12, 0, 1), (120, 30, 6), 0.45)
    finish(rgb, W_OUT + 'wall_boss_beast.png')
    w = h = 32
    grain = tile_lum(C64 + 'Rocks/Materials/rock_wall_04.jpg', (w, h), (1, 1))
    pts = [(rnd.uniform(0, w), rnd.uniform(0, h)) for _ in range(9)]
    rgb = basalt(w, h, pts, 1.0, 1.0, 7, 0.45, grain)
    finish(rgb, W_OUT + 'floor_boss_beast.png')


def tex_nightmare():
    w, h = 32, 64
    lum = tile_lum(K + 'wall_brick_small_stone.png', (w, h), (1, 2))
    rgb = gmap(lum, [(0, (8, 9, 14)), (0.4, (26, 30, 42)), (0.7, (46, 52, 68)), (1, (74, 82, 100))])
    # blue ghost-fire runes on a few bricks, with a soft glow
    rune_px = []
    runes = [['x...x', '.x.x.', '..x..', '.x.x.', 'x...x'], ['xxxx', 'x...', 'xxx.', 'x...', 'x...'],
             ['..x..', 'xxxxx', '..x..', '.x.x.', 'x...x'], ['x...', 'xx..', 'x.x.', 'x..x', 'x...']]
    for (rx, ry, r) in ((3, 3, 0), (21, 7, 1), (13, 1, 2), (26, 30, 3), (8, 36, 1)):
        for j, row in enumerate(runes[r]):
            for i, ch in enumerate(row):
                if ch == 'x':
                    rune_px.append(((rx + i) % w, ry + j))
    rm = np.zeros((h, w))
    for x, y in rune_px:
        rm[y, x] = 1
    g = glow(rm, 1.8)
    rgb = blend(rgb, np.clip(g * 2.5, 0, 1), (40, 96, 190), 0.7)
    rgb = blend(rgb, rm > 0, (130, 210, 255))
    rgb = blend(rgb, (rm > 0) & (np.roll(rm, 1, 0) > 0) & (np.roll(rm, -1, 0) > 0), (220, 245, 255))
    # wrought-iron fence in front (4 bars per tile, spear tips, two rails)
    iron, iron_l = (12, 12, 16), (58, 62, 80)
    top = 16
    for bx in (2, 10, 18, 26):
        rgb[top:h, bx] = iron
        rgb[top + 1:h, bx + 1] = (24, 24, 30)
        rgb[top:h:5, bx] = iron_l
        rgb[top - 1, bx] = iron; rgb[top - 2, bx] = iron; rgb[top - 3, bx] = iron_l   # spear tip
        rgb[top - 1, bx - 1] = iron; rgb[top - 1, bx + 1] = iron
    for ry in (top + 3, 56):
        rgb[ry, :] = iron
        rgb[ry - 1, :] = iron_l
        rgb[ry + 1, :] = (20, 20, 26)
    for bx in (6, 22):  # curls between the bars
        for (dx, dy) in ((0, 0), (1, -1), (2, 0), (1, 1), (0, 2)):
            rgb[top + 5 + dy, bx + dx] = iron
    # faint blue mist along the bottom
    yy = np.mgrid[0:h, 0:w][0]
    rgb = blend(rgb, np.clip((yy - 48) / 16, 0, 1) * 0.35, (60, 100, 160))
    finish(rgb, W_OUT + 'wall_boss_nightmare.png')

    w = h = 32
    lum = tile_lum(C64 + 'Ground/Materials/dirt_02.png', (w, h), (1, 1))
    rgb = gmap(lum, [(0, (8, 8, 12)), (0.5, (24, 24, 30)), (0.85, (40, 40, 46)), (1, (56, 56, 62))])
    def stones(d, ox, oy):
        r = random.Random(13)
        for _ in range(9):
            x, y = r.uniform(0, w), r.uniform(0, h)
            sw, sh = r.uniform(1, 2.5), r.uniform(0.8, 1.6)
            d.ellipse((x - sw + ox, y - sh + oy, x + sw + ox, y + sh + oy), fill=255)
    sm = mask_draw(w, h, stones)
    rgb = blend(rgb, sm > 0.5, (66, 68, 80))
    rgb = blend(rgb, (sm > 0.5) & (np.roll(sm, -1, 0) < 0.5), (30, 30, 38))
    def wisps(d, ox, oy):
        r = random.Random(3)
        for _ in range(4):
            x, y = r.uniform(0, w), r.uniform(0, h)
            d.ellipse((x - 3 + ox, y - 2 + oy, x + 3 + ox, y + 2 + oy), fill=255)
    gm = glow(mask_draw(w, h, wisps), 2.5)
    rgb = rgb + gm[..., None] * np.array((30, 60, 110)) * 0.9
    rnd = random.Random(8)
    for _ in range(7):
        rgb[rnd.randrange(h), rnd.randrange(w)] = (110, 170, 240)
    finish(rgb, W_OUT + 'floor_boss_nightmare.png')


def tex_ogre():
    w, h = 32, 64
    bark = tile_lum(C64 + 'Nature/Materials/bark_3.png', (w, h), (1, 2))
    rgb = np.zeros((h, w, 3))
    for i in range(4):  # four logs, 8 half-res pixels each
        x0 = i * 8
        for x in range(8):
            u = (x + 0.5) / 8
            shade = 0.35 + 0.75 * math.sin(math.pi * u) * (1.05 - 0.3 * u)
            if x == 7:
                shade = 0.12
            col = bark[:, x0 + x] * 0.55 + 0.45
            v = np.clip(col * shade, 0, 1)
            rgb[:, x0 + x] = gmap(v, [(0, (10, 7, 6)), (0.35, (40, 26, 18)), (0.7, (82, 56, 36)), (1, (120, 86, 56))])
        off = [3, 11, 6, 14][i]
        for ky in range(off, h, 22):   # knots
            rgb[ky, x0 + 3] = (30, 20, 14); rgb[ky, x0 + 4] = (30, 20, 14); rgb[ky - 1, x0 + 3] = (90, 64, 40)
    # rope lashings
    rope, rope_d = (156, 124, 72), (96, 72, 40)
    for ry in (10, 52):
        for x in range(w):
            for k in range(3):
                rgb[ry + k, x] = rope if (x + k) % 3 else rope_d
    # stretched hide tied across two logs
    def hide(d, ox, oy):
        pelt = [(19, 21), (22, 21), (23, 24), (28, 22), (27, 26), (25, 28), (26, 34), (25, 38), (29, 42), (25, 42),
                (22, 43), (21, 47), (20, 47), (19, 43), (16, 42), (12, 42), (16, 38), (15, 34), (16, 28), (14, 26),
                (13, 22), (18, 24)]
        d.polygon([(x + ox, y + oy) for x, y in pelt], fill=255)
    hm = mask_draw(w, h, hide, wrap=False)
    hl = tile_lum(C64 + 'Misc/Materials/leather_01.jpg', (w, h), (1, 2))
    rgb = blend(rgb, hm > 0.5, (1, 1, 1), 0)
    hcol = gmap(np.clip(hl * 0.5 + 0.35, 0, 1), [(0, (58, 38, 22)), (0.6, (110, 78, 44)), (1, (146, 108, 64))])
    sel = hm > 0.5
    rgb[sel] = hcol[sel]
    edge = sel & ~(np.roll(sel, 1, 0) & np.roll(sel, -1, 0) & np.roll(sel, 1, 1) & np.roll(sel, -1, 1))
    rgb[edge] = (50, 32, 18)
    for (x, y) in ((13, 22), (28, 22), (12, 42), (29, 42)):   # ties at the leg tips
        rgb[y, x] = rope; rgb[y - 1, x] = rope_d; rgb[y + 1, x] = rope_d
    for y in range(23, 45):                                    # dark fur along the spine
        rgb[y, 20:22] = rgb[y, 20:22] * 0.62
    for (x, y) in ((17, 31), (24, 30), (18, 37), (23, 36), (21, 27)):
        rgb[y, x] = rgb[y, x] * 0.6
    rgb[22, 20] = (20, 12, 8); rgb[22, 21] = (20, 12, 8)      # eye holes of the head
    # skulls lashed to the logs
    sk = ['.aaaa.', 'abbbbc', 'bddbdc', 'bddbdc', '.bebc.', '.f.f..']
    pal = {'a': B3, 'b': B2, 'c': B1, 'd': (20, 12, 10), 'e': B0, 'f': B1}
    for sx, sy in ((3, 15), (5, 46)):
        for j, row in enumerate(sk):
            for i, ch in enumerate(row):
                if ch in pal:
                    rgb[sy + j, sx + i] = pal[ch]
        rgb[sy - 1, sx + 2:sx + 4] = rope_d
    # bones crossed on the bottom left log
    for k in range(7):
        rgb[56 + k if 56 + k < h else h - 1, 18 + k] = B2
        rgb[56 + k if 56 + k < h else h - 1, 24 - k] = B1
    finish(rgb, W_OUT + 'wall_boss_ogre.png')

    w = h = 32
    lum = tile_lum(C64 + 'Ground/Materials/mud_02.jpg', (w, h), (1, 1))
    rgb = gmap(lum, [(0, (14, 10, 6)), (0.45, (40, 30, 20)), (0.8, (66, 50, 34)), (1, (88, 70, 48))])
    def prints(d, ox, oy):
        for (x, y) in ((8, 6), (20, 20)):
            d.ellipse((x - 3 + ox, y - 4 + oy, x + 3 + ox, y + 4 + oy), fill=255)
            for t in (-3, -1, 1, 3):
                d.ellipse((x + t - 1 + ox, y - 7 + oy, x + t + 1 + ox, y - 5 + oy), fill=255)
    pm = mask_draw(w, h, prints)
    rgb = blend(rgb, pm > 0.5, (10, 7, 4), 0.55)
    def puddle(d, ox, oy):
        d.ellipse((22 + ox, 2 + oy, 30 + ox, 7 + oy), fill=255)
    pd = mask_draw(w, h, puddle)
    rgb = blend(rgb, pd > 0.5, (22, 24, 26), 0.8)
    rgb[3, 24:27] = (70, 74, 76)
    for (x0, y0, x1, y1) in ((3, 24, 9, 22), (14, 11, 17, 15), (26, 28, 30, 27)):   # bones
        n = max(abs(x1 - x0), abs(y1 - y0))
        for k in range(n + 1):
            x = round(x0 + (x1 - x0) * k / n) % w; y = round(y0 + (y1 - y0) * k / n) % h
            rgb[y, x] = B2
        rgb[y0 % h, x0 % w] = B3; rgb[y1 % h, x1 % w] = B3
    finish(rgb, W_OUT + 'floor_boss_ogre.png')


def tex_ghost():
    w, h = 32, 64
    lum = tile_lum(K + 'wall_brick_stone_center.png', (w, h), (1, 2))
    rgb = gmap(lum, [(0, (30, 36, 48)), (0.35, (70, 80, 96)), (0.7, (112, 124, 140)), (1, (150, 162, 178))])
    # arched niche with a faded fresco of a haloed saint
    def arch(d, ox, oy):
        d.rectangle((9 + ox, 20 + oy, 22 + ox, 52 + oy), fill=255)
        d.ellipse((9 + ox, 13 + oy, 22 + ox, 27 + oy), fill=255)
    am = mask_draw(w, h, arch, wrap=False) > 0.5
    plaster = gmap(lum * 0.3 + 0.55, [(0, (120, 124, 132)), (1, (170, 172, 176))])
    rgb[am] = plaster[am]
    ring = am & ~(np.roll(am, 1, 0) & np.roll(am, -1, 0) & np.roll(am, 1, 1) & np.roll(am, -1, 1))
    rgb[ring] = (52, 58, 72)
    fig = Pic(w, h)
    fig.e(12, 17, 19, 24, (180, 172, 132))          # halo
    fig.e(13, 18, 18, 23, (150, 146, 140))
    fig.e(14, 19, 17, 22, (168, 150, 136))          # face
    fig.poly([(15, 23), (17, 23), (21, 50), (11, 50)], (110, 126, 152))     # robe
    fig.poly([(15, 23), (16, 23), (14, 50), (11, 50)], (128, 140, 162))
    fig.l(12, 30, 19, 30, (146, 112, 112))           # stole
    fig.l(15, 30, 15, 46, (146, 112, 112))
    fig.r(13, 27, 18, 28, (168, 150, 136))          # hands
    fa = np.array(fig.im).astype(float)
    sel = fa[:, :, 3] > 0
    rnd = np.random.default_rng(5)
    fade = rnd.random((h, w)) < 0.22                 # flaking paint
    rgb[sel & ~fade] = rgb[sel & ~fade] * 0.35 + fa[:, :, :3][sel & ~fade] * 0.65
    # cobwebs in both top corners
    web = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(web)
    for cx_, sgn in ((0, 1), (w - 1, -1)):
        for ang in (0, 25, 50, 75):
            a = math.radians(ang)
            d.line((cx_, 0, cx_ + sgn * math.cos(a) * 10, math.sin(a) * 10), fill=255)
        for r_ in (4, 7, 10):
            pts = [(cx_ + sgn * math.cos(math.radians(t)) * r_, math.sin(math.radians(t)) * r_) for t in range(0, 91, 15)]
            d.line(pts, fill=255)
    wm = np.array(web, float) / 255 > 0.5
    rgb = blend(rgb, wm, (200, 206, 214), 0.7)
    # spectral blue glow rising from the floor
    yy = np.mgrid[0:h, 0:w][0]
    rgb = rgb + (np.clip((yy - 36) / 28, 0, 1) ** 1.5)[..., None] * np.array((10, 34, 70))
    finish(rgb, W_OUT + 'wall_boss_ghost.png')

    # floor: cold marble tiles 2x2, veined and cracked
    w = h = 32
    lum = tile_lum(C64 + 'Misc/Materials/marbel_02.jpg', (w, h), (2, 2))
    yy, xx = np.mgrid[0:h, 0:w]
    checker = ((xx // 16) + (yy // 16)) % 2
    a = gmap(lum * 0.35 + 0.55, [(0, (100, 108, 124)), (1, (170, 178, 192))])
    b = gmap(lum * 0.35 + 0.4, [(0, (70, 78, 96)), (1, (128, 138, 156))])
    rgb = np.where(checker[..., None] == 0, a, b)
    grout = (xx % 16 == 0) | (yy % 16 == 0)
    rgb[grout] = (40, 44, 56)
    rgb[(xx % 16 == 1) & ~grout] *= 1.08
    rgb[(yy % 16 == 1) & ~grout] *= 1.08
    def cracks(d, ox, oy):
        d.line([(3 + ox, 4 + oy), (6 + ox, 7 + oy), (5 + ox, 10 + oy), (9 + ox, 13 + oy)], fill=255)
        d.line([(20 + ox, 18 + oy), (23 + ox, 21 + oy), (22 + ox, 24 + oy), (26 + ox, 27 + oy), (25 + ox, 30 + oy)], fill=255)
        d.line([(23 + ox, 21 + oy), (27 + ox, 20 + oy)], fill=255)
    cm = mask_draw(w, h, cracks)
    rgb = blend(rgb, cm > 0.5, (52, 58, 74), 0.85)
    rgb = rgb + glow(cm, 1.2)[..., None] * np.array((0, 14, 34))
    finish(rgb, W_OUT + 'floor_boss_ghost.png')


# ================================================================== PARTICLES
def black(w, h):
    return Image.new('RGBA', (w, h), (0, 0, 0, 255))


def make_leaf():
    """Autumn leaf tumbling: rotated in-plane and flipped in 3D (back side darker), supersampled to 8x8."""
    front, light, back, vein = (210, 108, 34), (242, 164, 62), (140, 56, 24), (120, 48, 18)
    frames = []
    for ang_d, flip in ((30, 1.0), (75, 0.55), (120, -0.25), (165, -0.75)):
        p = Pic(8, 8)
        ang = math.radians(ang_d)
        cov = np.zeros((8, 8)); side = np.zeros((8, 8)); mid = np.zeros((8, 8))
        for t in np.linspace(-1, 1, 60):
            wd = 1.9 * math.sin(math.pi * (t + 1) / 2) ** 0.9 * (1.0 - 0.25 * t)   # pointed tip, round base
            for sv in np.linspace(-1, 1, 21):
                x, y = t * 3.4, sv * wd * abs(flip) + 0.0
                rx = x * math.cos(ang) - y * math.sin(ang) + 3.5
                ry = x * math.sin(ang) + y * math.cos(ang) + 3.5
                ix, iy = int(round(rx)), int(round(ry))
                if 0 <= ix < 8 and 0 <= iy < 8:
                    cov[iy, ix] += 1
                    side[iy, ix] += sv
                    mid[iy, ix] += abs(sv) < 0.15
        for y in range(8):
            for x in range(8):
                if cov[y, x] >= 8:
                    sv = side[y, x] / cov[y, x]
                    c = front if flip > 0 else back
                    if flip > 0 and sv < -0.35:
                        c = light
                    if mid[y, x] / cov[y, x] > 0.3 and abs(flip) > 0.5:
                        c = vein if flip > 0 else front
                    p.p(x, y, c)
        sx, sy = 3.5 - 4.0 * math.cos(ang), 3.5 - 4.0 * math.sin(ang)       # stem behind the base
        p.p(min(7, max(0, round(sx))), min(7, max(0, round(sy))), (96, 54, 22))
        frames.append(p.im)
    out = Image.new('RGBA', (32, 8), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        out.paste(hard(f), (i * 8, 0))
    return save(out, 'part_leaf.png')


def radial(w, h, cx, cy, r, col, power=2.0, scale=1.0):
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / r
    k = np.clip(1 - d, 0, 1) ** power * scale
    return k[..., None] * np.array(col, float)


def from_arr(a):
    out = np.zeros(a.shape[:2] + (4,), np.uint8)
    out[..., :3] = np.clip(a, 0, 255)
    out[..., 3] = 255
    return Image.fromarray(out)


def make_firefly():
    frames = []
    for f in range(2):
        a = radial(8, 8, 3.5, 3.5, 4.2 if f == 0 else 3.4, (120, 150, 40), 1.6, 1.0 if f == 0 else 0.7)
        a[3:5, 3:5] = (230, 255, 140) if f == 0 else (190, 230, 110)
        if f == 0:
            a[3, 3] = (255, 255, 210)
        frames.append(from_arr(a))
    out = Image.new('RGBA', (16, 8))
    for i, f in enumerate(frames):
        out.paste(f, (i * 8, 0))
    return save(out, 'part_firefly.png')


def make_drop():
    p = Pic(4, 8)
    p.r(0, 0, 3, 7, (0, 0, 0))
    p.ps([(1, 1), (1, 2), (2, 2)], (70, 110, 160))
    p.r(1, 3, 2, 6, (110, 160, 220)); p.p(0, 4, (60, 90, 140)); p.p(3, 4, (60, 90, 140))
    p.r(0, 5, 3, 5, (110, 160, 220)); p.p(1, 4, (200, 230, 255)); p.p(1, 7, (40, 60, 100)); p.p(2, 7, (40, 60, 100))
    p.p(0, 6, (60, 90, 140)); p.p(3, 6, (60, 90, 140))
    return save(p.im, 'part_drop.png')


def make_rain():
    a = np.zeros((12, 2, 3))
    for y in range(12):
        t = y / 11
        a[y, 0] = np.array((60, 80, 110)) * (0.3 + 0.9 * t)
        a[y, 1] = np.array((60, 80, 110)) * (0.1 + 0.5 * t) if y > 3 else 0
    a[11, 0] = (150, 180, 220)
    return save(from_arr(a), 'part_rain.png')


def make_fog():
    """Kenney particle-pack smoke_01 (CC0, black background) squashed to a wide puff and tinted grey-blue."""
    src = Image.open(A + 'effects/particle-pack/PNG (Black background)/smoke_01.png').convert('L')
    src = src.crop(src.getbbox())
    sm = src.resize((24, 8), Image.LANCZOS).resize((48, 16), Image.NEAREST)
    a = np.array(sm, float) / 255
    yy, xx = np.mgrid[0:16, 0:48].astype(float)
    edge = np.clip(1 - (((xx - 23.5) / 24) ** 2 + ((yy - 8.5) / 8.5) ** 2), 0, 1)   # fade to black at the borders
    a = a * edge
    a = np.round(a * 6) / 6                     # banded like pixel art
    rgb = a[..., None] * np.array((110, 120, 140))
    return save(from_arr(rgb), 'part_fog.png')


def make_bat():
    body, wing, wing_d, eye = (46, 34, 52), (66, 50, 74), (34, 24, 40), (230, 50, 40)
    frames = []
    # wing tip heights per frame: up, level, down, level
    for f, tip in enumerate((-4, 0, 4, 1)):
        p = Pic(16, 10)
        cx, cy = 7.5, 4
        for s in (-1, 1):
            xs = [cx + s * 1, cx + s * 4, cx + s * 7]
            ys = [cy, cy + tip * 0.5, cy + tip]
            top = [(xs[0], ys[0] - 1), (xs[1], ys[1] - 1), (xs[2], ys[2])]
            bot = [(xs[2], ys[2] + 1), (cx + s * 5.5, ys[1] + 2), (cx + s * 4, ys[1] + 1), (cx + s * 2.5, cy + 2)]
            p.poly([(round(x), round(y)) for x, y in top + bot], wing)
            p.l(round(xs[0]), round(ys[0] - 1), round(xs[2]), round(ys[2]), wing_d)
        p.r(6, 2, 9, 6, body)
        p.p(6, 1, body); p.p(9, 1, body)       # ears
        p.p(7, 3, eye); p.p(8, 3, eye)
        frames.append(p.im)
    out = Image.new('RGBA', (64, 10), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        out.paste(hard(f), (i * 16, 0))
    return save(out, 'part_bat.png')


def make_ember():
    a = np.zeros((4, 8, 3))
    a[1:3, 1:3] = (255, 196, 80)
    a[1, 1] = (255, 236, 170)
    for (x, y) in ((0, 1), (0, 2), (3, 1), (3, 2), (1, 0), (2, 0), (1, 3), (2, 3)):
        a[y, x] = (150, 50, 10)
    a[1:3, 5:7] = (220, 100, 24)
    a[1, 5] = (255, 200, 110)
    for (x, y) in ((4, 1), (7, 2), (5, 0), (6, 3)):
        a[y, x] = (90, 28, 6)
    return save(from_arr(a), 'part_ember.png')


def make_dust():
    a = np.array([[(14, 13, 12), (34, 32, 28), (14, 13, 12)],
                  [(34, 32, 28), (80, 76, 66), (34, 32, 28)],
                  [(14, 13, 12), (34, 32, 28), (14, 13, 12)]], float)
    return save(from_arr(a), 'part_dust.png')


def make_wisp():
    frames = []
    for f in range(4):
        w, h = 12, 16
        yy, xx = np.mgrid[0:h, 0:w].astype(float)
        sway = [0, 1, 0, -1][f]
        tipl = [0, -1, 1, 0][f]
        # teardrop: round bottom at y=11, narrowing to a tip near the top that sways
        cy = 10.5
        t = np.clip((cy - yy) / (cy - 1 + tipl), 0, 1.2)
        cx = 5.5 + sway * t ** 1.5 * 1.6
        rad = np.where(yy > cy, 4.0 - (yy - cy) * 0.55, 4.0 * np.clip(1 - t, 0, None) ** 0.9)
        d = np.abs(xx - cx) / np.maximum(rad, 0.01)
        d = np.where(yy > cy, np.sqrt(((xx - 5.5) / 4.0) ** 2 + ((yy - cy) / 3.6) ** 2), d)
        k = np.clip(1 - d, 0, 1)
        k = np.where(rad <= 0.05, 0, k)
        a = np.zeros((h, w, 3))
        for th, col in ((0.0, (14, 30, 90)), (0.25, (40, 90, 210)), (0.5, (120, 190, 255)), (0.72, (225, 245, 255))):
            a[k > th] = col
        if f % 2:
            a[0 + (f == 3), round(5.5 + sway)] = (40, 90, 210)
        frames.append(from_arr(a))
    out = Image.new('RGBA', (48, 16))
    for i, f in enumerate(frames):
        out.paste(f, (i * 12, 0))
    return save(out, 'part_wisp.png')


def make_shell():
    p = Pic(4, 2)
    p.ps([(0, 0), (1, 0), (2, 0)], (236, 196, 96)); p.p(3, 0, (150, 110, 50))
    p.ps([(0, 1), (1, 1), (2, 1)], (186, 138, 60)); p.p(3, 1, (110, 80, 36))
    return save(p.im, 'part_shell.png')


def make_blood_pool():
    """Three flat puddle variants: round pool, smeared streak, pool with satellite drops."""
    layouts = [[(12, 3, 8, 2.2), (7, 3.5, 4, 1.6), (16, 2.5, 4, 1.5)],
               [(9, 3, 7, 1.6), (15, 3.5, 6, 1.3), (20, 3, 3, 1.0)],
               [(10, 3, 6, 2.0), (13, 2.5, 4, 1.5), (18, 4, 1.5, 1.0), (4, 3.5, 1.2, 0.9), (21, 2.5, 1.0, 0.8)]]
    frames = []
    for f, blobs in enumerate(layouts):
        p = Pic(24, 6)
        for (x, y, rx, ry) in blobs:
            p.e(x - rx, y - ry, x + rx, y + ry, BL1)
        x, y, rx, ry = blobs[0]
        p.e(x - rx + 2, y - ry + 1, x + rx - 2, y + ry - 1, (112, 12, 18))
        p.p(x - 2, y - 1, BL2); p.p(x - 1, y - 1, BL2); p.p(x + 3, y, BL2)          # wet highlights
        p.outline((66, 6, 10))
        frames.append(p.im.crop((1, 1, 25, 7)))
    out = Image.new('RGBA', (72, 6), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        out.paste(hard(f), (i * 24, 0))
    return save(out, 'part_blood_pool.png')


if __name__ == '__main__':
    for fn in (make_candles, make_coffin, make_bones, make_bookshelf, make_statue, make_cage, make_well, make_altar,
               make_spikes, make_barrel_red, make_crystal, make_mushroom, make_armor, make_table, make_crate,
               make_crate_broken, make_mimic, tex_demon, tex_beast, tex_nightmare, tex_ogre, tex_ghost,
               make_leaf, make_firefly, make_drop, make_rain, make_fog, make_bat, make_ember, make_dust, make_wisp,
               make_shell, make_blood_pool):
        fn()
    print('klart')
