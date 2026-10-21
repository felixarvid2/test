#!/usr/bin/env python3
"""New enemies, props, items, particles, sky extras and textures for Krypta (batch 2).

Run from the repo root:  python3 retrofps/tools/props2/make.py [name ...]
(with names only those builders run, e.g. `python3 retrofps/tools/props2/make.py hound sheet`)

Out to retrofps/assets/gfx:
  enemies-{spider,bat,hound,bomber,shieldman,shroom,livearmor}_{idle,movement,attack,take_damage,death}.png
  prop_{anvil,fortune,prisoner,challenge,lever,bowl,web,arrowplate,gasvent}.png
  item_{key,grenade,map,ammo_small,ammo_big}.png
  part_{gib,spore,webshot,scorch,hole,ash,smoke,ice,gas,skull,log,rock,shadow,zzz,star,meteor}.png
  moon.png, clouds.png
Out to retrofps/assets/wall:
  wall_swamp, floor_swamp, floor_water(2), floor_lava(2), floor_ice, door_locked, wall_cracked
Contact sheet: <scratchpad>/en/props2_sheet.png

Sources (everything else is drawn procedurally below in the outlined style of chest.png / the skeleton sheets):
  * Gothicvania Hell-Hound (Ansimuz, Legacy Collection, CC0)          -> hound (idle, run, jump=lunge), recoloured
  * Sunny Land "sunny-mushroom" (Ansimuz, Legacy Collection, CC0)     -> shroom (idle, walk, breath=spores, jump)
  * Explosions and Magic / EnemyDeath (Ansimuz, Legacy Collection, CC0) -> bomber death burst
  * Pixel Crawler Free Pack 2.11 (Anokolisa; free for commercial use, edits allowed):
      Body_A Carry_Idle / Carry_Run (recoloured to bone, face turned into a skull) -> bomber body
      Skeleton - Warrior idle/run/death                                    -> shieldman body
      Skeleton - Base death                                                 -> bone pile after the bomber burst
  * retrofps/assets/gfx/prop_armor.png and the drawing code of tools/props/make.py -> livearmor
  * retrofps/assets/gfx/ammo.png (Styloo render already in the game)    -> item_ammo_small / item_ammo_big
  * retrofps/assets/wall/door_wood.png, wall_brick_stone_center.png (Kenney retro-textures-fantasy, CC0)
      -> door_locked, wall_cracked
  * Kenney retro-textures-fantasy floor_ground_water (CC0)             -> caustic pattern of water and lava floors
  * Classic 64 Asset Pack (Craig Snedeker, CC0): mud_02, sand_mossy_01, ice_01, bark_3, wood_plank_charred
      -> grain/noise for the swamp, ice and wall textures
  (32rogues is NOT used.)
"""
import math
import os
import random
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

A = 'assets/'
LC = A + '2d-pixel/Legacy Collection/Legacy Collection/Assets/'
GVC = LC + 'Gothicvania/Characters/'
PC = A + '2d-pixel/Pixel Crawler - Free Pack 2.11/Pixel Crawler - Free Pack/Entities/'
K = A + 'textures/retro-textures-fantasy/PNG/'
C64 = A + 'textures/Classic 64 Asset Pack 0.6/- Classic 64 Asset Pack 0.6/'
G_OUT, W_OUT = 'retrofps/assets/gfx/', 'retrofps/assets/wall/'
SHEET = '/tmp/claude-0/-home-user-test/80ee56ba-2fa6-5354-b261-a4ca4fdcb508/scratchpad/en/props2_sheet.png'

# ---------------------------------------------------------------- palette (same as tools/props/make.py)
OUT = (37, 19, 26)
M0, M1, M2, M3 = (96, 96, 112), (144, 145, 158), (173, 193, 207), (187, 211, 225)   # chest metal
W0, W1, W2, W3, W4 = (58, 38, 40), (82, 59, 64), (110, 74, 60), (137, 90, 69), (172, 108, 74)  # chest wood
S0, S1, S2, S3, S4 = (56, 54, 66), (78, 76, 88), (110, 108, 120), (142, 140, 150), (172, 170, 178)  # stone
B0, B1, B2, B3 = (103, 96, 87), (160, 156, 138), (196, 192, 172), (230, 228, 214)   # bone
I0, I1, I2, I3 = (34, 32, 40), (58, 56, 68), (88, 88, 102), (128, 130, 146)        # dark iron
R0, R1, R2, R3 = (66, 36, 30), (104, 56, 38), (142, 80, 48), (178, 110, 62)        # rust
F0, F1, F2, F3 = (170, 52, 28), (236, 116, 40), (255, 192, 72), (255, 242, 176)    # flame
V0, V1, V2, V3 = (78, 22, 96), (132, 44, 176), (190, 96, 240), (238, 206, 255)     # cursed purple
BL0, BL1, BL2 = (92, 10, 16), (138, 18, 24), (184, 38, 38)                          # blood
GOLD0, GOLD1, GOLD2 = (192, 147, 68), (255, 213, 105), (255, 241, 204)              # gold
CL0, CL1, CL2 = (120, 26, 30), (92, 18, 24), (160, 50, 46)                          # shield red (prop_armor)
G0, G1, G2, G3 = (34, 70, 30), (60, 120, 44), (120, 190, 70), (200, 245, 140)       # toxic green
PAPER0, PAPER1, PAPER2 = (150, 118, 76), (206, 176, 120), (236, 216, 168)          # parchment
WEB0, WEB1 = (170, 170, 182), (226, 226, 236)


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

    def lines(self, pts, c, w=1):
        self.d.line(self._t(pts), fill=rgba(c), width=w)

    def e(self, x0, y0, x1, y1, c):
        self.d.ellipse(self._t([(x0, y0), (x1, y1)]), fill=rgba(c))

    def eo(self, x0, y0, x1, y1, c):
        self.d.ellipse(self._t([(x0, y0), (x1, y1)]), outline=rgba(c))

    def arc(self, x0, y0, x1, y1, a0, a1, c, w=1):
        self.d.arc(self._t([(x0, y0), (x1, y1)]), a0, a1, fill=rgba(c), width=w)

    def poly(self, pts, c):
        self.d.polygon(self._t(pts), fill=rgba(c))

    def paste(self, im, x, y):
        self.im.alpha_composite(im, (int(x) + self.o, int(y) + self.o))

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
        for j, row in enumerate(rows):
            for i, ch in enumerate(row):
                if ch in pal:
                    self.p(x0 + i, y0 + j, pal[ch])

    def crop(self):
        """Back to the size given to the constructor (drop the outline growth)."""
        return self.im.crop((self.o, self.o, self.o + self.w, self.o + self.h))


def outline(im, c=OUT, diag=False):
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


def outline_same(im, c=OUT):
    """Outline without growing the image (pixels on the border stay as they are)."""
    return outline(im, c).crop((1, 1, im.width + 1, im.height + 1))


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


def cells(frames, w, h):
    """Fixed-size cells (no common-bbox crop), for particles."""
    out = Image.new('RGBA', (w * len(frames), h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        out.paste(f.crop((0, 0, w, h)), (i * w, 0))
    return out


SAVED = []          # (path, frames, additive) for the contact sheet


def save(im, name, n=1, additive=False):
    im.save(G_OUT + name)
    SAVED.append((G_OUT + name, n, additive))
    return im


def flame(p, x, y, h, lean=0, pal=(F0, F1, F2, F3), wide=True):
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
    p.p(x, y, OUT)


def recolor(im, mapping):
    a = np.array(im.convert('RGBA'))
    out = a.copy()
    for src, dst in mapping.items():
        m = (a[:, :, 0] == src[0]) & (a[:, :, 1] == src[1]) & (a[:, :, 2] == src[2]) & (a[:, :, 3] > 0)
        out[m, :3] = dst
    return Image.fromarray(out)


def load_frames(path, fw, fh=None, idx=None):
    im = Image.open(path).convert('RGBA')
    fh = fh or im.height
    n = im.width // fw
    fr = [im.crop((i * fw, 0, i * fw + fw, fh)) for i in range(n)]
    return [fr[i] for i in idx] if idx is not None else fr


def shift(im, dx, dy):
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    out.paste(im, (dx, dy), im)
    return out


def shear(im, k, base):
    """Lean: every row is shifted horizontally by k*(base-y) pixels (rows below base stay)."""
    a = np.array(im)
    out = np.zeros_like(a)
    for y in range(a.shape[0]):
        dx = int(round(k * (base - y)))
        row = a[y]
        if dx > 0:
            out[y, dx:] = row[:a.shape[1] - dx]
        elif dx < 0:
            out[y, :dx] = row[-dx:]
        else:
            out[y] = row
    return Image.fromarray(out)


def rot(im, deg, center=None):
    return im.rotate(deg, resample=Image.NEAREST, expand=False, center=center)


def squash(im, sy, base):
    """Vertical scale around row `base` (nearest), for squash/stretch frames."""
    w, h = im.size
    nh = max(1, int(round(h * sy)))
    s = im.resize((w, nh), Image.NEAREST)
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    out.paste(s, (0, int(round(base - base * sy))), s)
    return out


def tint(im, col, k):
    a = np.array(im).astype(float)
    a[:, :, :3] = a[:, :, :3] * (1 - k) + np.array(col, float) * k
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def save_enemy(sheet, state, frames, fw):
    floor = 57 if fw == 64 else 28
    fixed = []
    for f in frames:
        assert f.size == (fw, fw), (sheet, state, f.size)
        b = f.getbbox()
        if b and b[3] - 1 > floor:          # nothing may sink below the feet row
            f = shift(f, 0, floor - (b[3] - 1))
        fixed.append(f)
    frames = fixed
    out = Image.new('RGBA', (fw * len(frames), fw), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        out.paste(hard(f), (i * fw, 0))
    save(out, f'enemies-{sheet}_{state}.png', len(frames))


def place(fr, fw, feet_src, cx_src, feet=None, cx=None, dx=0, dy=0):
    """Put a source frame into an fw x fw cell so that source row feet_src lands on the feet row and
    source column cx_src on the centre column."""
    feet = feet if feet is not None else (57 if fw == 64 else 28)
    cx = cx if cx is not None else fw // 2
    out = Image.new('RGBA', (fw, fw), (0, 0, 0, 0))
    out.paste(fr, (cx - cx_src + dx, feet - feet_src + dy), fr)
    return out


# ================================================================== ENEMIES
# ---------------------------------------------------------------- hound (Gothicvania hell hound)
HOUND_MAP = {(19, 10, 27): (52, 36, 60), (35, 24, 45): (84, 62, 94), (70, 40, 79): (124, 94, 132)}


def hound_src(name):
    fr = load_frames(GVC + f'Hell-Hound-Files/Spritesheets/hell-hound-{name}.png', 64)
    return [recolor(f, HOUND_MAP).transpose(Image.FLIP_LEFT_RIGHT) for f in fr]


def make_hound():
    idle, run, jump = hound_src('idle'), hound_src('run'), hound_src('jump')
    b = idle[0].getbbox()
    feet, cx = b[3] - 1, (b[0] + b[2]) // 2

    def P(f, dx=0, dy=0):
        return outline_same(place(f, 64, feet, cx, dx=dx, dy=dy))
    save_enemy('hound', 'idle', [P(idle[i]) for i in (0, 2, 4, 6, 8, 10)], 64)
    save_enemy('hound', 'movement', [P(f) for f in run], 64)
    # lunge bite: crouch, spring, flight with jaws open, landing forward, recover
    att = []
    for i, dx in ((0, -2), (1, 0), (2, 5), (3, 8), (4, 6), (5, 2)):
        f = P(jump[i], dx)
        att.append(f)
    for k in (2, 3):  # open maw: teeth on the snout
        p = Pic(64, 64)
        p.paste(att[k], 0, 0)
        bb = att[k].getbbox()
        # find the snout: right-most opaque pixel of the upper half
        a = np.array(att[k])[:, :, 3] > 0
        ys, xs = np.nonzero(a[:, :])
        top = ys.min()
        sel = ys < top + 14
        sx = xs[sel].max()
        sy = int(np.median(ys[sel][xs[sel] >= sx - 1]))
        p.r(sx - 3, sy + 1, sx, sy + 3, (90, 10, 20))
        p.ps([(sx - 3, sy + 1), (sx - 1, sy + 1), (sx - 2, sy + 3), (sx, sy + 3)], B3)
        p.p(sx + 1, sy + 2, OUT)
        att[k] = p.im
    save_enemy('hound', 'attack', att, 64)
    hurt = [P(idle[0], -3, 0), P(squash(idle[1], 0.9, feet + 1), -2), P(idle[2], -1), P(idle[0])]
    save_enemy('hound', 'take_damage', hurt, 64)
    save_enemy('hound', 'death', hound_death(idle[0], P, feet, cx), 64)


def hound_death(src, P, feet, cx):
    """Rears back, legs give way, body slumps onto its side with the legs stretched out, embers die."""
    b = src.getbbox()
    a = np.array(src)
    # belly line: the lowest row that is still wider than 18px (the legs are thin)
    widths = [(np.count_nonzero(a[y, :, 3]), y) for y in range(b[1], b[3])]
    belly = max(y for w, y in widths if w >= 16)
    body = src.crop((0, 0, 64, belly + 1))
    frames = [P(rot(src, -10, (cx, feet)), -3), P(squash(src, 0.8, feet + 1), -2)]
    for k, (ang, drop) in enumerate(((-6, 0), (-10, 0))):
        f = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
        legs = src.crop((0, belly + 1, 64, src.height))
        legs = legs.resize((64, max(1, legs.height // (2 + k))), Image.NEAREST)
        f.paste(legs, (0, belly + 1), legs)
        f.paste(body, (0, legs.height), body)
        f = rot(f, ang, (cx, feet))
        frames.append(P(f, -2))
    # lying: body flat on the floor, legs as stiff strokes pointing forward, glowing stripes fade
    for k in range(3):
        p = Pic(64, 64)
        lb = body.crop(body.getbbox())
        lb = rot(lb, 0)
        bx = 32 - lb.width // 2 - 2
        by = 57 - lb.height + 3
        legc = (84, 62, 94)
        for i, (x0, ln) in enumerate(((bx + 6, 9), (bx + 10, 8), (bx + lb.width - 12, 9), (bx + lb.width - 8, 8))):
            p.l(x0, 55 - (i % 2), x0 + ln, 54 - (i % 2) - (1 if k == 0 else 0), legc, 2)
        p.paste(lb, bx, by)
        im = p.im
        if k >= 1:  # stripes cool down
            im = recolor(im, {(152, 62, 29): (98, 22, 25), (225, 146, 77): (152, 62, 29), (0, 176, 218): (0, 98, 126)})
        if k == 2:
            im = recolor(im, {(152, 62, 29): (71, 12, 36), (0, 98, 126): (52, 36, 60), (0, 176, 218): (52, 36, 60)})
        im = outline_same(im)
        frames.append(im)
    return frames


# ---------------------------------------------------------------- shroom (Sunny Land mushroom)
SHROOM_MAP = {(115, 21, 83): OUT, (54, 135, 45): (40, 96, 40), (155, 181, 76): (130, 170, 70)}


def shroom_src(name, fw, fh=None):
    fr = load_frames(LC + f'Misc/Characters/sunny-mushroom/spritesheets/sunny-mushroom-{name}.png', fw, fh)
    return [recolor(f, SHROOM_MAP).transpose(Image.FLIP_LEFT_RIGHT) for f in fr]


def make_shroom():
    idle, walk, breath = shroom_src('breath-no-gas', 63), shroom_src('walk', 41), shroom_src('breath', 63)
    jump = shroom_src('jump', 144)
    b = idle[0].getbbox()
    feet, cx = b[3] - 1, b[0] + 11          # body centre (the source is facing right after the flip)
    wb = walk[0].getbbox()
    wfeet, wcx = wb[3] - 1, wb[0] + 12
    jb = jump[0].getbbox()
    jfeet, jcx = jb[3] - 1, jb[0] + 12

    def P(f, fe, c, dx=0, dy=0):
        return place(f, 64, fe, c, dx=dx - 6, dy=dy)
    save_enemy('shroom', 'idle', [P(f, feet, cx) for f in idle], 64)
    save_enemy('shroom', 'movement', [P(walk[i], wfeet, wcx) for i in (0, 1, 2, 3, 5, 6, 7, 8)], 64)
    save_enemy('shroom', 'attack', [P(breath[i], feet, cx) for i in (0, 2, 3, 4, 5, 6, 7, 8)], 64)
    save_enemy('shroom', 'take_damage', [P(jump[0], jfeet, jcx, -3), P(squash(idle[1], 0.85, feet + 1), feet, cx, -2),
                                         P(idle[2], feet, cx, -1), P(idle[0], feet, cx)], 64)
    # death: wilts and topples forward, then rots into a flat cap with a last spore puff
    base = P(idle[0], feet, cx)
    piv = (26 + 4, 57)
    fr = [P(squash(idle[0], 0.85, feet + 1), feet, cx, -1), rot(base, -25, piv), rot(base, -60, piv), rot(base, -90, piv)]
    lying = rot(base, -90, piv)
    lb = lying.getbbox()
    lying = shift(lying, 0, 57 - (lb[3] - 1))
    fr[3] = lying
    for k in range(2):
        p = Pic(64, 64)
        p.paste(squash(lying, 0.8 - 0.15 * k, 58), 0, 0)
        rnd = random.Random(3 + k)
        for _ in range(8 - 4 * k):
            x, y = rnd.randint(28, 52), rnd.randint(36, 52)
            p.r(x, y, x + (1 if rnd.random() < 0.4 else 0), y, G2 if k == 0 else G1)
        fr.append(p.im)
    fr = [shift(f, 0, 57 - (f.getbbox()[3] - 1)) for f in fr]
    save_enemy('shroom', 'death', fr, 64)


BUILDERS = {}


def builder(name):
    def deco(fn):
        BUILDERS[name] = fn
        return fn
    return deco


builder('hound')(make_hound)
builder('shroom')(make_shroom)


# ---------------------------------------------------------------- spider (drawn)
SP0, SP1, SP2, SP3, SP4 = (30, 22, 32), (52, 38, 52), (80, 60, 76), (112, 86, 98), (150, 122, 126)
EYE_R, EYE_L = (255, 60, 40), (255, 190, 150)


def spider_frame(t=0.0, walk=0.0, bob=0, lift=0.0, fang=0, spit=0, splay=0, dx=0, front_up=0.0):
    """One 64x64 spider facing right. t: gait phase 0..1 (walk = stride amplitude), lift: radians the front
    body rises (rearing), front_up: 0..1 how far the two front leg pairs are raised, splay: legs pushed outwards."""
    p = Pic(64, 64)
    gy = 56                                   # foot row (outline lands on 57)
    ax, ay = 23 + dx, 41 - bob                # abdomen centre
    piv = (ax + 7, ay + 3)

    def R(x, y):                              # rotate a body point around the waist by -lift
        c, s_ = math.cos(-lift), math.sin(-lift)
        x0, y0 = x - piv[0], y - piv[1]
        return piv[0] + x0 * c - y0 * s_, piv[1] + x0 * s_ + y0 * c
    cx, cy = R(ax + 15, ay + 4)               # cephalothorax centre
    hips = [R(ax + 17 - 2.5 * i, ay + 5) for i in range(4)]
    feet_near = [(ax + 34, gy), (ax + 25, gy), (ax + 2, gy), (ax - 12, gy)]
    feet_far = [(ax + 29, gy - 2), (ax + 20, gy - 2), (ax - 3, gy - 2), (ax - 16, gy - 2)]
    knee_dx = [0.45, 0.45, 0.35, 0.3]

    def gait(i, side, f):
        g = (i + side) % 2
        ph = 2 * math.pi * t + g * math.pi
        fx, fy = f
        fx += walk * math.sin(ph) + splay * (1 if i < 2 else -1)
        fy -= max(0.0, walk * 0.8 * math.cos(ph))
        if i < 2 and front_up > 0:            # raised front legs waving in the air
            ux, uy = cx + 12 + 5 * i - 6 * (1 - front_up), cy - 16 * front_up + 7 * i
            fx, fy = fx + (ux - fx) * front_up, fy + (uy - fy) * front_up
        return fx, fy

    def leg(i, h, f, col, w, hi=None, far=False):
        hx, hy = h
        fx, fy = f
        kx = hx + (fx - hx) * knee_dx[i]
        ky = min(cy - 9 - (2 if i in (1, 2) else 0), fy - 8) + (2 if far else 0)
        p.lines([(hx, hy), (kx, ky), (fx, fy)], OUT, w + 2)
        p.lines([(hx, hy), (kx, ky), (fx, fy)], col, w)
        if hi:
            p.l(hx, hy - 1, kx, ky - 1, hi)
            p.p(kx, ky - 1, SP4)
    for i in range(4):                        # far legs behind the body
        leg(i, hips[i], gait(i, 1, feet_far[i]), SP2, 1, far=True)
    # abdomen: egg with a pale bone-coloured marking
    p.e(ax - 11, ay - 8, ax + 9, ay + 7, SP1)
    p.e(ax - 10, ay - 8, ax + 6, ay + 4, SP2)
    p.e(ax - 7, ay - 7, ax + 0, ay - 3, SP3)
    p.p(ax - 5, ay - 6, SP4); p.p(ax - 4, ay - 6, SP4)
    for k, (mx, my) in enumerate(((ax - 1, ay - 3), (ax + 2, ay), (ax - 5, ay + 1))):
        p.r(mx, my, mx + 2, my, B2)
        p.p(mx + 1, my + 1, B0)
    p.r(ax - 12, ay, ax - 11, ay + 1, SP1)    # spinnerets
    # cephalothorax
    p.e(cx - 6, cy - 4, cx + 5, cy + 4, SP1)
    p.e(cx - 5, cy - 4, cx + 3, cy + 1, SP2)
    p.l(cx - 3, cy - 3, cx + 1, cy - 3, SP3)
    # head: eyes and fangs at the front
    hx, hy = R(ax + 22, ay + 2)
    hx, hy = int(round(hx)), int(round(hy))
    p.e(hx - 3, hy - 3, hx + 3, hy + 3, SP2)
    p.r(hx - 1, hy - 3, hx + 3, hy - 1, OUT)
    fx0, fy0 = hx + 2, hy + 2
    p.lines([(fx0, fy0), (fx0 + 1 + fang, fy0 + 2), (fx0 + fang, fy0 + 4)], B2)
    p.lines([(fx0 - 2, fy0 + 1), (fx0 - 2 - fang + 1, fy0 + 3), (fx0 - 3 - fang + 1, fy0 + 5)], B1)
    for i in range(4):                        # near legs in front
        leg(i, hips[i], gait(i, 0, feet_near[i]), SP3, 2, SP4)
    p.outline()
    # bright eyes on top of everything
    p.ps([(hx, hy - 2), (hx + 2, hy - 2), (hx + 3, hy - 1), (hx - 1, hy - 2)], EYE_R)
    p.p(hx, hy - 3, EYE_L); p.p(hx + 2, hy - 3, EYE_R)
    if spit:                                  # web/venom glob leaving the mouth
        sx, sy = fx0 + 3 + spit * 4, fy0 + 1 - spit
        r_ = 1 + (spit > 1)
        p.e(sx - r_, sy - r_, sx + r_, sy + r_, WEB1)
        p.p(sx - 2 - spit, sy, WEB0); p.p(sx - 4 - spit, sy + 1, WEB0)
        p.p(sx, sy - 1, (255, 255, 255))
    return p.crop()


def spider_dead(stage, dx):
    """Belly up on the floor; stage 1 legs stiff and spread, 2 half curled, 3 tightly curled."""
    p = Pic(64, 64)
    gy = 56
    ax, ay = 24 + dx, gy - 5
    curl = {1: 0.0, 2: 0.5, 3: 1.0}[stage]
    p.e(ax - 12, ay - 6, ax + 8, ay + 5, SP1)         # abdomen, underside up
    p.e(ax - 10, ay - 5, ax + 6, ay + 1, SP2)
    p.r(ax - 6, ay - 3, ax + 1, ay - 2, B1)           # pale belly marking
    p.e(ax + 5, ay - 5, ax + 18, ay + 4, SP1)         # cephalothorax
    p.e(ax + 6, ay - 4, ax + 16, ay + 1, SP2)
    p.l(ax + 17, ay + 2, ax + 19, ay + 4, B1)          # limp fangs
    hips = [(ax + 15 - 2.5 * i, ay - 3) for i in range(4)]
    for side, col in ((1, SP2), (0, SP3)):
        for i, (hx, hy) in enumerate(hips):
            sgn = 1 if i < 2 else -1
            spread = (14 - 3 * i if i < 2 else 6 + 3 * i) * (1 - 0.55 * curl)
            kx, ky = hx + sgn * spread * 0.6 + side * 2, hy - 11 + 4 * curl
            fx, fy = kx + sgn * (spread * 0.5 * (1 - curl)) - sgn * 4 * curl, ky - 2 + 8 * curl
            p.lines([(hx, hy), (kx, ky), (fx, fy)], OUT, 4 if side == 0 else 3)
            p.lines([(hx, hy), (kx, ky), (fx, fy)], col, 2 if side == 0 else 1)
    p.outline()
    return p.crop()


def make_spider():
    save_enemy('spider', 'idle', [spider_frame(t=0, bob=[0, 0, 1, 1, 0, 0][i], walk=[0, 0.5, 0, -0.5, 0, 0.5][i] and 1,
                                               fang=[0, 0, 1, 0, 0, 1][i]) for i in range(6)], 64)
    save_enemy('spider', 'movement', [spider_frame(t=i / 6, walk=4, bob=i % 2) for i in range(6)], 64)
    att = [spider_frame(bob=-1, fang=1),
           spider_frame(lift=0.25, front_up=0.5, fang=1, dx=-1),
           spider_frame(lift=0.5, front_up=1.0, fang=2, dx=-2),
           spider_frame(lift=0.45, front_up=1.0, fang=2, dx=-1, spit=1),
           spider_frame(lift=0.35, front_up=0.8, fang=1, spit=2),
           spider_frame(lift=0.15, front_up=0.3, fang=0, spit=3),
           spider_frame(bob=1)]
    save_enemy('spider', 'attack', att, 64)
    save_enemy('spider', 'take_damage', [spider_frame(dx=-3, splay=3, fang=2, bob=-1), spider_frame(dx=-2, splay=2, fang=2),
                                         spider_frame(dx=-1, splay=1, bob=1), spider_frame()], 64)
    death = [spider_frame(dx=-3, splay=4, fang=2, bob=-2),
             spider_frame(dx=-2, splay=6, bob=3, fang=1),
             rot(spider_dead(1, 0), -35, (30, 50)),
             spider_dead(1, 0), spider_dead(2, 0), spider_dead(3, 0)]
    death = [shift(f, 0, 57 - (f.getbbox()[3] - 1)) for f in death]
    save_enemy('spider', 'death', death, 64)


# ---------------------------------------------------------------- bat (drawn, 32px, airborne)
BAT_F0, BAT_F1, BAT_F2 = (70, 46, 58), (104, 70, 80), (138, 100, 104)        # fur
BAT_M0, BAT_M1 = (86, 40, 56), (124, 62, 76)                                   # wing membrane
BAT_BONE = (60, 34, 44)


def bat_frame(wing=0.0, cy=12, cx=15, mouth=0, tilt=0.0, fold=0.0, limp=0.0):
    """wing: -1 up .. 0 level .. 1 down. fold 0..1 sweeps the wings back for a dive. limp: dead wings droop."""
    p = Pic(32, 32)
    for side in (-1, 1):                      # -1 = far (left) wing, drawn first
        sx, sy = cx + side * 2, cy - 2
        ang = wing * (0.7 if wing < 0 else 0.45) + limp * 1.2
        L1 = 6 if side > 0 else 5
        wx = sx + side * L1 * math.cos(ang) * (1 - 0.5 * fold)
        wy = sy + L1 * math.sin(ang) - 3 * fold
        tips = []
        for k, (dl, da) in enumerate(((7, -0.5), (7, 0.25), (5, 0.9))):
            a = ang + da + 0.5 * limp
            tl = dl * (1 - 0.35 * fold) * (1 if side > 0 else 0.85)
            tips.append((wx + side * tl * math.cos(a), wy + tl * math.sin(a) + 2 * fold))
        body_pt = (cx + side * 1, cy + 4)
        mem = [(sx, sy), (wx, wy), tips[0]]
        for k in range(len(tips) - 1):        # scalloped trailing edge
            ax_, ay_ = tips[k]
            bx_, by_ = tips[k + 1]
            mem.append(((ax_ + bx_) / 2 - side * 0.5, (ay_ + by_) / 2 - 1))
            mem.append((bx_, by_))
        mem.append(body_pt)
        p.poly([(round(x), round(y)) for x, y in mem], BAT_M0 if side < 0 else BAT_M1)
        p.l(sx, sy, round(wx), round(wy), BAT_F2 if side > 0 else BAT_F1)
        for tx, ty in tips:
            p.l(round(wx), round(wy), round(tx), round(ty), BAT_BONE)
        p.p(round(wx), round(wy), BAT_F2)
    # body and head (facing right)
    p.e(cx - 3, cy - 3, cx + 3, cy + 5, BAT_F1)
    p.e(cx - 2, cy - 2, cx + 1, cy + 2, BAT_F2)
    hx, hy = cx + 2, cy - 4
    p.e(hx - 3, hy - 2, hx + 3, hy + 3, BAT_F1)
    p.ps([(hx - 2, hy - 3), (hx - 2, hy - 4), (hx + 1, hy - 3), (hx + 2, hy - 4), (hx + 2, hy - 5)], BAT_F1)   # ears
    p.p(hx - 2, hy - 2, BAT_F2)
    p.p(hx + 3, hy + 1, BAT_F2)               # snout
    p.ps([(cx - 1, cy + 6), (cx + 1, cy + 6)], BAT_BONE)   # feet
    p.outline()
    p.p(hx, hy, EYE_R); p.p(hx + 2, hy, EYE_R)
    if mouth:
        p.r(hx, hy + 2, hx + 2, hy + 2 + (mouth > 1), (90, 10, 20))
        p.p(hx, hy + 2 + (mouth > 1), B3); p.p(hx + 2, hy + 2 + (mouth > 1), B3)
    im = p.crop()
    if tilt:
        im = rot(im, tilt, (cx, cy))
    return im


def make_bat():
    hover = [bat_frame(-1, 15), bat_frame(0, 16), bat_frame(0.9, 17), bat_frame(0.2, 16)]
    save_enemy('bat', 'idle', hover, 32)
    save_enemy('bat', 'movement', [bat_frame(-1, 15), bat_frame(-0.4, 15), bat_frame(0.4, 16), bat_frame(1, 17),
                                   bat_frame(0.4, 17), bat_frame(-0.3, 16)], 32)
    save_enemy('bat', 'attack', [bat_frame(-1, 14, 14), bat_frame(-1.1, 13, 13, mouth=1),
                                 bat_frame(-0.6, 16, 17, mouth=2, fold=0.8, tilt=-20),
                                 bat_frame(-0.5, 18, 19, mouth=2, fold=1, tilt=-30),
                                 bat_frame(0.6, 17, 18, mouth=1, tilt=-10), bat_frame(0, 16, 16)], 32)
    save_enemy('bat', 'take_damage', [bat_frame(0.5, 16, 14, mouth=1, tilt=25), bat_frame(-0.5, 15, 14, tilt=-15),
                                      bat_frame(0.8, 17, 15), bat_frame(0, 16)], 32)
    death = [bat_frame(0.5, 12, 15, mouth=1, tilt=30), bat_frame(1.2, 15, 15, limp=0.5, tilt=60),
             bat_frame(1.3, 19, 16, limp=1, tilt=120)]
    for k in range(3):                        # lying on its back on the floor, wings spread
        f = rot(bat_frame(-0.1 + 0.05 * k, 14, 16, limp=0.0), 180, (16, 14))
        f = squash(f, 0.65 - 0.05 * k, 16)
        death.append(f)
    death = [shift(f, 0, 28 - (f.getbbox()[3] - 1)) if i >= 2 else f for i, f in enumerate(death)]
    save_enemy('bat', 'death', death, 32)


builder('spider')(make_spider)
builder('bat')(make_bat)


# ---------------------------------------------------------------- bomber (Pixel Crawler body as a skeleton + drawn keg)
PCB0, PCB1, PCB2, PCB3, PCB4 = (75, 55, 32), (130, 94, 58), (189, 145, 104), (236, 203, 172), (250, 232, 210)
BODY2BONE = {(217, 160, 102): PCB3, (250, 200, 149): PCB4, (162, 101, 67): PCB2, (118, 61, 43): PCB1,
             (0, 0, 0): OUT, (167, 172, 174): OUT, (255, 252, 252): OUT, (76, 181, 40): OUT}
PC_OUT = {(20, 20, 18): OUT}


def skeletonize(fr):
    """Pixel Crawler Body_A frame -> skeleton: bone colours, the Pixel Crawler skeleton skull pasted over the head,
    dark ribs across the chest."""
    a = np.array(fr)
    g = np.argwhere((a[:, :, 0] == 76) & (a[:, :, 1] == 181) & (a[:, :, 2] == 40))
    im = recolor(fr, BODY2BONE)
    ey, ex = g[0]
    top = fr.getbbox()[1]
    p = Pic(fr.width, fr.height)
    p.paste(im, 0, 0)
    for dy in (5, 7, 9):                                 # ribs across the chest
        for x in range(fr.width):
            c = p.get(x, ey + dy)
            if c[3] and c[:3] in (PCB3, PCB4, PCB2) and p.get(x - 1, ey + dy)[:3] != OUT and p.get(x + 1, ey + dy)[:3] != OUT:
                p.p(x, ey + dy, PCB0)
    sk = Image.open(PC + 'Mobs/Skeleton Crew/Skeleton - Base/Idle/Idle-Sheet.png').convert('RGBA').crop((7, 2, 22, 14))
    p.paste(recolor(sk, PC_OUT), ex + 3 - sk.width, top)
    return p.im


def keg_pic(spark=0, hot=False):
    p = Pic(14, 15)
    y0 = 4
    wood = [(98, 54, 40), (138, 82, 52), (172, 108, 66), (200, 140, 86)] if not hot else [(170, 60, 30), (230, 120, 50), (255, 190, 90), (255, 240, 170)]
    p.r(1, y0 + 1, 12, y0 + 9, wood[1])
    p.r(0, y0 + 3, 13, y0 + 7, wood[1])
    for x in range(1, 13, 3):
        p.l(x, y0 + 1, x, y0 + 9, wood[0])
    p.l(2, y0 + 2, 2, y0 + 8, wood[3]); p.l(3, y0 + 2, 3, y0 + 8, wood[2])
    for y in (y0 + 2, y0 + 8):
        p.l(0 if y == y0 + 5 else 1, y, 12, y, I2)
        p.p(3, y, I3)
    p.r(2, y0, 11, y0, wood[2])                          # lid
    p.bitmap(5, y0 + 4, ['x.x', '.x.', 'x.x'], {'x': OUT})   # XXX powder mark
    p.l(9, y0 - 1, 9, y0 - 2, (120, 96, 60)); p.p(10, y0 - 3, (120, 96, 60))   # fuse
    p.outline()
    sp = [((11, 0), (10, 1), (12, 1)), ((11, 0), (12, -1), (10, 0)), ((11, 1), (12, 0), (11, -1))][spark % 3]
    p.p(sp[0][0], sp[0][1], F3); p.p(sp[1][0], sp[1][1], F2); p.p(sp[2][0], sp[2][1], F1)
    return p.im


def bomber_frame(body, keg=None, keg_dx=0, keg_dy=0, lean=0.0, dx=0, spark=0, hands=True, hot=False):
    """body: skeletonized 64x64 frame (feet on row 47 of the source); keg placed on the head top."""
    top = body.getbbox()[1]
    p = Pic(64, 64)
    if keg is not False and hands:            # finger bones reaching up to the keg (outlined)
        h = Pic(64, 64)
        for hx in (23, 39):
            h.r(hx + dx, top - 2, hx + 1 + dx, top + 4, PCB3)
            h.p(hx + dx, top - 2, PCB4)
        h.outline()
        p.paste(h.crop(), 0, 0)
    p.paste(body, dx, 0)
    if keg is not False:
        p.paste(keg_pic(spark, hot), 25 + dx + keg_dx, top - 14 + keg_dy)
    im = p.im
    if lean:
        im = shear(im, lean, 47)
    return place(im, 64, 47, 32)


def make_bomber():
    idle = [skeletonize(f) for f in load_frames(PC + 'Characters/Body_A/Animations/Carry_Idle/Carry_Idle_Side-Sheet.png', 64)]
    walk = [skeletonize(f) for f in load_frames(PC + 'Characters/Body_A/Animations/Carry_Walk/Carry_Walk_Side-Sheet.png', 64)]
    hit = [skeletonize(f) for f in load_frames(PC + 'Characters/Body_A/Animations/Hit_Base/Hit_Side-Sheet.png', 64)]
    save_enemy('bomber', 'idle', [bomber_frame(f, spark=i) for i, f in enumerate(idle)], 64)
    save_enemy('bomber', 'movement', [bomber_frame(f, spark=i) for i, f in enumerate(walk)], 64)
    att = [bomber_frame(idle[0], spark=0, lean=-0.05),
           bomber_frame(idle[1], keg_dx=-3, keg_dy=-2, lean=-0.15, spark=1),
           bomber_frame(idle[2], keg_dx=-6, keg_dy=-1, lean=-0.25, spark=2),
           bomber_frame(idle[0], keg_dx=6, keg_dy=-4, lean=0.2, spark=0),
           bomber_frame(idle[1], keg=False, lean=0.25, dx=1),
           bomber_frame(idle[2], keg=False, lean=0.08)]
    # the thrown keg flies on out of the frame in 4/5
    for k, (kx, ky) in ((4, (44, 8)), (5, (52, 12))):
        p = Pic(64, 64)
        p.paste(att[k], 0, 0)
        p.paste(keg_pic(k), kx, ky)
        att[k] = p.im
    save_enemy('bomber', 'attack', att, 64)
    save_enemy('bomber', 'take_damage', [bomber_frame(idle[0], lean=-0.2, dx=-2, keg_dx=-2, keg_dy=1, spark=1),
                                         bomber_frame(idle[1], lean=-0.12, dx=-2, keg_dx=-1, spark=2),
                                         bomber_frame(idle[2], lean=-0.05, dx=-1), bomber_frame(idle[0], spark=1)], 64)
    # death = burst: the keg goes white hot, explodes (Ansimuz EnemyDeath), bones fly, a heap is left
    exp = load_frames(LC + 'Explosions and Magic/EnemyDeath/spritesheet.png', 48)
    pile = load_frames(PC + 'Mobs/Skeleton Crew/Skeleton - Base/Death/Death-Sheet.png', 96)[7]
    pile = recolor(pile.crop(pile.getbbox()), PC_OUT)
    rnd = random.Random(12)
    bones = [(rnd.uniform(-1, 1), rnd.uniform(-1.4, -0.4), rnd.randrange(3)) for _ in range(7)]
    death = [bomber_frame(idle[0], spark=2, hot=True, lean=-0.1, dx=-1)]
    for k in range(1, 7):
        p = Pic(64, 64)
        if k == 1:
            p.paste(bomber_frame(idle[1], hot=True), 0, 0)
        if k >= 4:  # heap of bones on the floor, the last of the smoke above it
            p.paste(pile, 32 - pile.width // 2, 57 - pile.height + 1)
            for i, (vx, vy, kind) in enumerate(bones[:4]):
                x = int(32 + vx * 20)
                p.l(x - 2, 56 - (i % 2), x + 2, 57 - (i % 2), PCB3)
                p.p(x - 2, 56 - (i % 2), PCB4)
        if k >= 2 and k < 4:  # flying bones
            for vx, vy, kind in bones:
                x, y = 32 + vx * 9 * k, 34 + vy * 10 * k + 3 * k * k
                ang = (kind + k) * 0.9
                p.l(x - 2 * math.cos(ang), y - 2 * math.sin(ang), x + 2 * math.cos(ang), y + 2 * math.sin(ang), PCB3, 2)
        p.outline()
        im = p.crop()
        e = exp[min(7, k + 1)] if k < 6 else None
        if e is not None:
            e2 = e.resize((48, 48), Image.NEAREST)
            im.alpha_composite(e2, (8, 32 - 24 - 2 + (2 if k >= 4 else 0)))
        death.append(im)
    save_enemy('bomber', 'death', death, 64)


# ---------------------------------------------------------------- shieldman (Pixel Crawler skeleton warrior + tower shield)
def tower_shield(h=21, w=12):
    p = Pic(w, h)
    p.r(0, 2, w - 1, h - 1, I1)
    p.e(0, 0, w - 1, 5, I1)
    p.r(1, 2, w - 2, h - 2, W2)
    p.e(1, 1, w - 2, 4, W2)
    for x in range(3, w - 1, 3):                       # planks
        p.l(x, 2, x, h - 2, W1)
    p.l(1, 2, 1, h - 2, W3)
    for y in (5, h - 5):                               # iron bands with rivets
        p.l(0, y, w - 1, y, I2)
        p.p(2, y, M2); p.p(w - 3, y, M2)
    p.e(w // 2 - 2, h // 2 - 2, w // 2 + 1, h // 2 + 1, M1)   # boss
    p.p(w // 2 - 1, h // 2 - 1, M3)
    p.l(0, 2, 0, h - 1, I2); p.l(w - 1, 2, w - 1, h - 1, I0)
    p.outline()
    return p.im


def spear(p, x0, y0, x1, y1):
    """Spear from butt (x0,y0) to tip (x1,y1), drawn with its own outline strokes."""
    d = math.hypot(x1 - x0, y1 - y0)
    ux, uy = (x1 - x0) / d, (y1 - y0) / d
    tx, ty = x1 - ux * 4, y1 - uy * 4
    p.l(x0, y0, x1, y1, OUT, 3)
    p.poly([(tx - uy * 2, ty + ux * 2), (x1 + ux, y1 + uy), (tx + uy * 2, ty - ux * 2)], OUT)
    p.l(x0, y0, tx, ty, W3)
    p.poly([(tx - uy * 1.2, ty + ux * 1.2), (x1, y1), (tx + uy * 1.2, ty - ux * 1.2)], M2)
    p.l(tx, ty, x1 - ux, y1 - uy, M3)
    p.p(tx - ux, ty - uy, R2)


def head_anchor(fr):
    a = np.array(fr)[:, :, 3] > 0
    ys, xs = np.nonzero(a)
    top = ys.min()
    hx = xs[ys < top + 5]
    return (hx.min() + hx.max()) / 2, top


def shield_frame(body, feet, sh_dx=0, sh_dy=0, sp=None, smear=False, dx=0):
    hcx, htop = head_anchor(body)
    hcx += dx
    p = Pic(64, 64)
    body = recolor(body, PC_OUT)
    if sp is None:
        spear(p, hcx - 5, feet - 1, hcx - 5, htop - 12)
    p.paste(body, dx, 0)
    if sp is not None:
        spear(p, hcx + sp[0], htop + 8, hcx + sp[1], htop + 8)
    sh = tower_shield()
    p.paste(sh, int(hcx + 1 + sh_dx), int(feet - sh.height + 1 + sh_dy))
    if smear:
        p.l(hcx + sp[1] - 14, htop + 6, hcx + sp[1] - 4, htop + 6, (220, 230, 255))
        p.l(hcx + sp[1] - 10, htop + 10, hcx + sp[1] - 3, htop + 10, (160, 180, 220))
    return p.im


def make_shieldman():
    W = PC + 'Mobs/Skeleton Crew/Skeleton - Warrior/'
    idle = [place(f, 64, 31, 14) for f in load_frames(W + 'Idle/Idle-Sheet.png', 32)]
    run = [place(f, 64, 63, 32) for f in load_frames(W + 'Run/Run-Sheet.png', 64)]
    dth = [place(f, 64, 47, 30) for f in load_frames(W + 'Death/Death-Sheet.png', 64)]
    F = 57
    save_enemy('shieldman', 'idle', [shield_frame(f, F) for f in idle], 64)
    save_enemy('shieldman', 'movement', [shield_frame(f, F, sh_dy=-(i % 2)) for i, f in enumerate(run)], 64)
    i0 = idle[0]
    save_enemy('shieldman', 'attack', [shield_frame(i0, F),
                                       shield_frame(idle[1], F, sh_dx=-1, sp=(-17, 3)),
                                       shield_frame(i0, F, sh_dx=3, sp=(-6, 21), dx=1),
                                       shield_frame(i0, F, sh_dx=4, sp=(-4, 23), dx=2, smear=True),
                                       shield_frame(idle[2], F, sh_dx=1, sp=(-13, 9)),
                                       shield_frame(idle[3], F)], 64)
    save_enemy('shieldman', 'take_damage', [shield_frame(i0, F, sh_dx=-2, dx=-2), shield_frame(idle[1], F, sh_dx=-1, sh_dy=-1, dx=-2),
                                            shield_frame(idle[2], F, dx=-1), shield_frame(i0, F)], 64)
    # death: the skeleton crumbles (Pixel Crawler death) while the shield topples forward and lands flat
    hcx, htop = head_anchor(idle[0])
    sh = tower_shield()
    frames = []
    for k, d in enumerate(dth):
        p = Pic(64, 64)
        if k >= 2:   # spear dropped behind
            spear(p, hcx - 18, F - 1, hcx + 4, F - 1)
        p.paste(recolor(d, PC_OUT), 0, 0)
        ang = [-8, -30, -60, -90, -90, -90][k]
        s2 = sh.rotate(ang, resample=Image.NEAREST, expand=True)
        if k >= 3:
            s2 = squash(s2, 0.6, s2.height)
            s2 = s2.crop(s2.getbbox())
        bb = s2.getbbox()
        p.paste(s2, int(hcx + 1 + [0, 2, 5, 7, 7, 7][k]), F - bb[3] + 1)
        frames.append(p.im)
    save_enemy('shieldman', 'death', frames, 64)


# ---------------------------------------------------------------- living armour (prop_armor.png brought to life)
GLOW0, GLOW1 = (150, 30, 30), (255, 80, 50)


def armor_helm(p, cx, t):
    p.r(cx - 4, t + 3, cx + 5, t + 12, M1)
    p.e(cx - 4, t, cx + 5, t + 6, M1)
    p.r(cx - 4, t + 3, cx - 1, t + 11, M2); p.l(cx - 3, t + 1, cx - 3, t + 11, M3)
    p.r(cx - 4, t + 6, cx + 5, t + 6, OUT)
    p.l(cx, t + 2, cx, t + 12, M0)
    p.ps([(cx + 2, t + 8), (cx + 4, t + 8), (cx + 3, t + 10)], OUT)
    p.r(cx - 1, t, cx + 2, t, (150, 30, 30))


def armor_torso(p, cx, t):
    """t = top of the helm (as in the prop); draws pauldrons, breastplate and fauld."""
    for x0 in (cx - 10, cx + 5):
        p.e(x0, t + 13, x0 + 6, t + 19, M1)
        p.l(x0 + 1, t + 14, x0 + 4, t + 14, M3)
        p.l(x0, t + 17, x0 + 6, t + 17, M0)
    p.poly([(cx - 6, t + 15), (cx + 7, t + 15), (cx + 6, t + 26), (cx + 4, t + 29), (cx - 3, t + 29), (cx - 5, t + 26)], M1)
    p.poly([(cx - 5, t + 16), (cx, t + 16), (cx, t + 28), (cx - 3, t + 28), (cx - 4, t + 25)], M2)
    p.l(cx, t + 16, cx, t + 28, M3)
    p.l(cx - 5, t + 21, cx + 6, t + 21, M0)
    p.r(cx - 4, t + 29, cx + 5, t + 32, R1); p.l(cx - 4, t + 29, cx + 5, t + 29, R2)
    p.l(cx - 1, t + 29, cx - 1, t + 32, R0); p.l(cx + 2, t + 29, cx + 2, t + 32, R0)


def armor_leg(p, hx, hy, fx, fy, light=True):
    c0, c1, c2 = (M1, M2, M3) if light else (M0, M1, M2)
    kx, ky = (hx + fx) / 2 + 1, (hy + fy) / 2
    p.lines([(hx, hy), (kx, ky), (fx, fy - 1)], OUT, 5)
    p.lines([(hx, hy), (kx, ky), (fx, fy - 1)], c0, 3)
    p.l(hx - 1, hy, kx - 1, ky, c1)
    p.r(kx - 1, ky - 1, kx + 1, ky + 1, c2)                # knee cop
    p.r(fx - 2, fy - 1, fx + 3, fy, OUT)
    p.r(fx - 1, fy - 1, fx + 2, fy - 1, c1)                # sabaton
    p.p(fx + 3, fy, OUT)


def armor_shield():
    p = Pic(12, 17)
    sx, sy = 0, 0
    p.poly([(sx, sy), (sx + 11, sy), (sx + 11, sy + 8), (sx + 6, sy + 16), (sx + 5, sy + 16), (sx, sy + 8)], I2)
    p.poly([(sx + 1, sy + 1), (sx + 10, sy + 1), (sx + 10, sy + 8), (sx + 6, sy + 14), (sx + 5, sy + 14), (sx + 1, sy + 8)], CL0)
    p.poly([(sx + 6, sy + 1), (sx + 10, sy + 1), (sx + 10, sy + 8), (sx + 6, sy + 14)], CL1)
    p.r(sx + 5, sy + 2, sx + 6, sy + 12, B2); p.r(sx + 2, sy + 5, sx + 9, sy + 6, B2)
    p.l(sx + 1, sy + 1, sx + 1, sy + 7, CL2)
    p.outline()
    return p.im


def sword_pic(ang):
    """Longsword with its grip centred in a 40x40 image (hand at 20,20), blade pointing at `ang` (radians)."""
    p = Pic(40, 40)
    ux, uy = math.cos(ang), math.sin(ang)
    h = (20, 20)
    p.l(h[0] - ux * 3, h[1] - uy * 3, h[0] + ux * 1, h[1] + uy * 1, W1, 2)   # grip
    p.p(h[0] - ux * 4, h[1] - uy * 4, GOLD1)                                  # pommel
    gx, gy = h[0] + ux * 2, h[1] + uy * 2
    p.l(gx - uy * 3, gy + ux * 3, gx + uy * 3, gy - ux * 3, GOLD0, 2)        # crossguard
    p.l(gx + ux, gy + uy, h[0] + ux * 17, h[1] + uy * 17, M1, 2)
    p.l(gx + ux, gy + uy, h[0] + ux * 16, h[1] + uy * 16, M3)
    p.outline()
    return p.crop()


def livearmor_frame(t=0.0, walk=0.0, sw=1.2, hand=(9, 27), eyes=2, dx=0, bob=0, helm_dy=0, smear=None, lean=0):
    """Walking armour, cx = 31, feet on row 56 (+outline). sw: sword angle, hand: hand pos rel. (cx, top)."""
    p = Pic(64, 64)
    cx, top = 31 + dx, 11 + bob
    p.paste(armor_shield(), cx - 15, top + 19)        # shield on the back arm
    hip = top + 33
    ph = 2 * math.pi * t
    for light, sgn in ((False, -1), (True, 1)):
        fx = cx + sgn * 2 + walk * math.sin(ph) * sgn
        fy = 56 - (max(0.0, walk * 0.5 * math.cos(ph) * sgn) if walk else 0)
        armor_leg(p, cx + sgn * 2 - 1 + (1 if light else 0), hip, round(fx), round(fy), light)
    armor_torso(p, cx, top)
    armor_helm(p, cx, top + helm_dy)
    hx, hy = cx + hand[0], top + hand[1]
    p.lines([(cx + 8, top + 17), (hx, hy)], OUT, 4)    # front arm
    p.lines([(cx + 8, top + 17), (hx, hy)], M1, 2)
    p.outline()
    im = p.crop()
    s = sword_pic(sw)
    im.alpha_composite(s, (hx - 20, hy - 20))
    p2 = Pic(64, 64)
    p2.paste(im, 0, 0)
    p2.r(hx - 1, hy - 1, hx + 1, hy + 1, M2)           # gauntlet over the grip
    p2.p(hx - 1, hy - 1, M3)
    if eyes:
        c = GLOW1 if eyes == 2 else GLOW0
        p2.p(cx - 2, top + 6 + helm_dy, c); p2.p(cx + 2, top + 6 + helm_dy, c)
    if smear:
        a0, a1 = smear
        for k in range(9):
            a = a0 + (a1 - a0) * k / 8
            for r_, col in ((17, (230, 236, 255)), (15, (170, 190, 225))):
                if k > 1 or r_ == 17:
                    p2.p(hx + math.cos(a) * r_, hy + math.sin(a) * r_, col)
    im = p2.im
    if lean:
        im = shear(im, lean, 57)
    return im


def make_livearmor():
    prop = Image.open(G_OUT + 'prop_armor.png').convert('RGBA')
    stand = place(prop, 64, prop.height - 1, 15)
    sb = stand.getbbox()

    def eyes(im, c, sx=0):
        p = Pic(64, 64)
        p.paste(shift(im, sx, 0), 0, 0)
        if c:
            # visor slit of the prop: row 7 of the prop (helm top + 6, +1 outline)
            vy = sb[1] + 7
            vx = sb[0] + 16
            p.p(vx - 2 + sx, vy, c); p.p(vx + 2 + sx, vy, c)
        return p.im
    save_enemy('livearmor', 'idle', [stand, eyes(stand, GLOW0), eyes(stand, GLOW1, 1), eyes(stand, GLOW1),
                                     eyes(stand, GLOW0)], 64)
    save_enemy('livearmor', 'movement', [livearmor_frame(t=i / 6, walk=4, bob=(1 if i % 3 == 1 else 0), sw=-1.2,
                                                         hand=(8, 24)) for i in range(6)], 64)
    save_enemy('livearmor', 'attack', [livearmor_frame(sw=-2.2, hand=(5, 13)),
                                       livearmor_frame(sw=-1.7, hand=(6, 8), lean=-0.08),
                                       livearmor_frame(sw=-0.4, hand=(11, 15), smear=(-1.8, -0.5), lean=0.08, dx=1),
                                       livearmor_frame(sw=0.5, hand=(11, 21), smear=(-1.0, 0.4), lean=0.12, dx=2),
                                       livearmor_frame(sw=0.9, hand=(10, 24), lean=0.06, dx=1),
                                       livearmor_frame(sw=-1.2, hand=(8, 24))], 64)
    save_enemy('livearmor', 'take_damage', [livearmor_frame(sw=-0.9, hand=(7, 24), dx=-2, helm_dy=-2, lean=-0.1, eyes=1),
                                            livearmor_frame(sw=-1.0, hand=(7, 24), dx=-2, helm_dy=-1, eyes=1),
                                            livearmor_frame(sw=-1.1, hand=(8, 24), dx=-1), livearmor_frame(sw=-1.2, hand=(8, 24))], 64)
    save_enemy('livearmor', 'death', livearmor_death(), 64)


def armor_parts():
    def part(fn, w, h):
        p = Pic(w, h)
        fn(p)
        p.outline()
        im = p.im
        return im.crop(im.getbbox())
    helm = part(lambda p: armor_helm(p, 6, 1), 14, 15)
    torso = part(lambda p: armor_torso(p, 12, -12), 26, 24)
    leg = part(lambda p: armor_leg(p, 4, 1, 4, 13, True), 12, 16)
    leg2 = part(lambda p: armor_leg(p, 4, 1, 4, 13, False), 12, 16)
    return helm, torso, leg, leg2, armor_shield(), sword_pic(0).crop(sword_pic(0).getbbox())


def livearmor_death():
    helm, torso, leg, leg2, shield, sword = armor_parts()
    frames = [livearmor_frame(sw=-0.6, hand=(9, 22), dx=-2, helm_dy=-3, lean=-0.12, eyes=1)]
    # (dx, dy, angle) keys per part relative to their assembled place; dy=None means resting on the floor
    cx, top = 31, 11
    home = {'shield': (cx - 15, top + 19), 'leg2': (cx - 5, top + 33), 'leg': (cx - 2, top + 33),
            'torso': (cx - 12, top + 12), 'helm': (cx - 5, top), 'sword': (cx + 4, top + 22)}
    keys = [
        {'shield': (-2, 2, 15), 'leg2': (0, 1, 0), 'leg': (1, 1, 0), 'torso': (0, 3, -10), 'helm': (-3, -6, 30), 'sword': (6, 6, 60)},
        {'shield': (-5, None, 90), 'leg2': (-2, 4, 30), 'leg': (2, 4, -30), 'torso': (2, 10, -35), 'helm': (-8, -2, 100), 'sword': (8, None, 180)},
        {'shield': (-6, None, 90), 'leg2': (-4, None, 90), 'leg': (4, None, -90), 'torso': (3, None, -90), 'helm': (-12, None, 180), 'sword': (6, None, 180)},
        {'shield': (-6, None, 90), 'leg2': (-4, None, 90), 'leg': (5, None, -90), 'torso': (3, None, -90), 'helm': (-14, None, 180), 'sword': (6, None, 180)},
    ]
    parts = {'shield': shield, 'leg2': leg2, 'leg': leg, 'torso': torso, 'helm': helm, 'sword': sword}
    order = ['shield', 'leg2', 'leg', 'sword', 'torso', 'helm']
    for k, key in enumerate(keys):
        f = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
        for name in order:
            ddx, ddy, ang = key[name]
            im = parts[name].rotate(ang, resample=Image.NEAREST, expand=True)
            im = im.crop(im.getbbox())
            hx, hy = home[name]
            ow, oh = parts[name].size
            x = hx + ow // 2 - im.width // 2 + ddx
            y = 57 - im.height + 1 if ddy is None else hy + oh // 2 - im.height // 2 + ddy
            f.alpha_composite(im, (int(x), int(y)))
        frames.append(f)
    frames.append(frames[-1].copy())          # hold the heap one more frame
    return frames


builder('bomber')(make_bomber)
builder('shieldman')(make_shieldman)
builder('livearmor')(make_livearmor)


# ================================================================== PROPS
def make_anvil():
    """Blacksmith's anvil on a tree stump, a hammer leaning against the stump."""
    p = Pic(32, 28)
    base = 27
    # stump with bark ridges and a lighter cut top
    p.r(7, 17, 24, base - 1, W2)
    p.r(5, base - 1, 26, base, W1)
    p.ps([(4, base), (27, base), (6, base - 2), (25, base - 2)], W1)                # roots
    for x in (9, 13, 17, 21):
        p.l(x, 18, x + (1 if x % 2 else 0), base - 1, W1)
    p.l(8, 18, 8, base - 2, W3)
    p.e(7, 14, 24, 19, W3)
    p.e(9, 15, 22, 18, W4)
    p.eo(11, 15, 20, 18, W3)
    # anvil: feet, waist, body with horn to the right and heel to the left
    p.r(10, 13, 21, 15, I1); p.l(10, 13, 21, 13, I2)
    p.r(13, 10, 18, 12, I1)
    p.poly([(7, 5), (22, 5), (29, 6), (24, 8), (21, 10), (10, 10), (8, 8), (6, 6)], I2)
    p.l(7, 5, 22, 5, I3); p.l(23, 5, 29, 6, I3)                                     # lit top face
    p.l(8, 8, 21, 9, I1)
    p.p(10, 6, M3); p.p(16, 6, M2)
    p.r(9, 6, 10, 6, I0)                                                             # hardy hole
    # hammer leaning against the stump on the left
    p.l(3, 26, 9, 14, W3, 2)
    p.r(6, 11, 12, 14, I2); p.l(6, 11, 12, 11, I3); p.p(12, 14, I1)
    p.outline()
    p.ps([(25, 5), (26, 5)], (255, 255, 255))
    return save(strip([p.im]), 'prop_anvil.png')


def make_fortune():
    frames = []
    for f in range(2):
        lit = f == 0
        p = Pic(34, 34)
        base = 33
        cloth, cloth_d, cloth_l = (78, 30, 92), (52, 18, 64), (110, 50, 126)
        # round table with a draped cloth and gold fringe
        p.r(4, 20, 29, base, cloth)
        p.e(2, 16, 31, 23, cloth_l)
        for x in range(5, 29, 4):
            p.l(x, 23, x + 1, base, cloth_d)
        p.l(4, 21, 4, base, cloth_l)
        p.r(3, base, 30, base, cloth_d)
        for x in range(3, 31, 2):
            p.p(x, 23 + (x % 4 == 1), GOLD0)
        # crystal ball on a little brass stand
        p.r(13, 16, 20, 18, GOLD0); p.l(13, 16, 20, 16, GOLD1)
        ball = [(60, 40, 110), (110, 90, 200), (170, 160, 250), (240, 236, 255)] if lit else \
               [(24, 22, 36), (40, 38, 58), (58, 56, 80), (90, 88, 110)]
        p.e(10, 4, 23, 17, ball[0])
        p.e(11, 5, 21, 15, ball[1])
        p.e(13, 6, 19, 12, ball[2])
        p.p(13, 7, ball[3]); p.p(14, 7, ball[3]); p.p(13, 8, ball[3])
        # candles
        wax, waxl, waxd = (214, 202, 170), (238, 230, 204), (164, 146, 120)
        for x0, top in ((4, 11), (27, 13)):
            p.r(x0, top, x0 + 2, 18, wax); p.l(x0, top, x0, 18, waxl); p.l(x0 + 2, top, x0 + 2, 18, waxd)
        p.outline()
        if lit:
            flame(p, 5, 10, 5, 0); flame(p, 28, 12, 4, 1)
            p.ps([(8, 3), (25, 2), (16, 1), (6, 6)], (210, 200, 255))      # sparkles around the ball
            p.p(16, 10, (255, 255, 255))
        else:
            p.p(5, 10, OUT); p.p(28, 12, OUT)
            p.ps([(5, 8), (6, 6), (28, 10), (27, 8)], (88, 84, 96))
        frames.append(p.im)
    return save(strip(frames), 'prop_fortune.png', 2)


def make_prisoner():
    frames = []
    rag, rag_d, skin, skin_d, hair = (176, 156, 112), (126, 106, 74), (226, 176, 140), (170, 120, 94), (70, 50, 38)
    for f in range(2):
        p = Pic(32, 48)
        base = 47
        x0, x1 = 3, 27
        if f == 0:
            # prisoner kneeling, hands chained up to the dome, head hanging
            p.r(11, 30, 19, 40, rag)                                  # tunic
            p.l(11, 30, 11, 40, (206, 188, 146)); p.ps([(13, 40), (16, 41), (18, 40)], rag)
            p.ps([(13, 33), (14, 34), (16, 36), (15, 38)], rag_d)    # tears in the rags
            p.r(17, 31, 19, 39, rag_d)
            p.r(10, 41, 21, 43, rag_d)                                # legs folded under
            p.r(20, 42, 23, 43, skin_d)                               # bare foot
            p.e(11, 21, 19, 30, skin)                                 # head
            p.r(12, 22, 18, 24, hair); p.p(12, 25, hair); p.l(17, 26, 18, 28, hair)
            p.p(16, 26, OUT); p.r(15, 28, 16, 28, skin_d)             # eye and mouth
            p.l(10, 24, 11, 31, skin); p.l(20, 24, 19, 31, skin)      # arms raised
            p.r(9, 22, 11, 23, I2); p.r(19, 22, 21, 23, I2)           # manacles
            p.l(10, 21, 14, 8, I2); p.l(20, 21, 16, 8, I2)            # chains to the top
            p.ps([(11, 17), (12, 13), (19, 17), (18, 13)], I3)
        else:
            p.l(14, 8, 12, 15, I2); p.ps([(12, 13), (13, 11)], I3)    # broken chain dangling
            p.r(11, 15, 13, 16, I2)
            p.r(8, 43, 12, 43, rag_d)                                 # rags left behind
        # floor plate, dome, ring
        p.r(x0 - 1, base - 3, x1 + 1, base, R1); p.l(x0 - 1, base - 3, x1 + 1, base - 3, R2)
        p.arc(x0, 4, x1, 22, 180, 360, R2, 2)
        p.eo(13, 0, 17, 4, I2)
        p.r(x0, 12, x1, 13, R2); p.l(x0, 12, x1, 12, R3)
        p.r(x0, 25, x1, 25, R1)
        for x in range(x0, x1 + 1, 6):
            if f == 1 and x in (15, 21):
                continue
            p.l(x, 13, x, base - 4, R2)
            p.ps([(x, 16), (x, 22), (x, 31), (x, 38)], R3)
        if f == 1:  # bars of the door torn out and bent outwards
            p.l(21, 13, 21, 20, R2); p.lines([(21, 20), (25, 28), (29, 34)], R2)
            p.l(15, 13, 15, 18, R2); p.lines([(15, 18), (14, 22)], R2)
            p.lines([(15, base - 4), (17, 38), (20, 36)], R2)
            p.r(x0, 25, 14, 25, (0, 0, 0, 0))
            p.r(x0, 25, 14, 25, R1)
        p.l(x1, 13, x1, base - 4, R1)
        for x in (9, 15, 21):
            p.l(x, 12, 15 + (x - 15) // 2, 5, R1)
        p.ps([(9, 17), (9, 18), (3, 36)], R0)
        p.outline()
        frames.append(p.im)
    return save(strip(frames), 'prop_prisoner.png', 2)


def make_challenge():
    frames = []
    for f in range(2):
        lit = f == 0
        p = Pic(36, 44)
        base = 43
        # stone altar block
        p.r(4, 28, 31, base - 2, S2); p.r(24, 28, 31, base - 2, S1); p.l(4, 28, 4, base - 2, S3)
        p.r(1, base - 2, 34, base, S1); p.l(1, base - 2, 34, base - 2, S2)
        p.r(2, 25, 33, 27, S3); p.l(2, 25, 33, 25, S4); p.l(2, 27, 33, 27, S1)
        p.r(12, 31, 23, 38, S1)
        p.bitmap(14, 32, ['x....x', '.x..x.', '..xx..', '..xx..', '.x..x.', 'x....x'], {'x': R2 if lit else S0})  # crossed blades
        # iron brazier on three legs behind the horn
        p.l(11, 18, 9, 21, I1); p.l(24, 18, 26, 21, I1); p.l(17, 18, 17, 21, I1)
        p.poly([(9, 10), (26, 10), (23, 18), (12, 18)], I1)
        p.l(9, 10, 26, 10, I3); p.l(10, 11, 25, 11, I2)
        for x in (12, 16, 20, 24):
            p.p(x, 14, I3)
        if lit:
            p.r(11, 9, 24, 9, F0)
        else:
            p.r(11, 9, 24, 9, (40, 30, 30)); p.ps([(13, 9), (18, 9), (22, 9)], (90, 40, 30))
        # war horn lying on the front of the slab: curved ivory horn with brass rings and a dark bell
        horn, horn_d, horn_l = (226, 210, 172), (170, 146, 104), (248, 240, 216)
        for k in range(16):
            t = k / 15
            x = 3 + k * 1.4
            y = 25 - round(math.sin(t * math.pi * 0.8) * 3)
            w = 1 + round(t * 2.2)
            p.r(x, y - w + 1, x + 1, y + 1, horn)
            p.p(x, y - w + 1, horn_l)
            p.p(x, y + 1, horn_d)
        p.e(24, 17, 30, 27, horn)
        p.e(25, 18, 29, 26, horn_d)
        p.e(26, 19, 29, 25, (50, 32, 30))
        for x in (10, 17):
            p.l(x, 21, x, 26, GOLD0); p.p(x, 21, GOLD1)
        p.r(2, 24, 3, 26, GOLD0)
        p.outline()
        if lit:
            for x, h, ln in ((12, 6, -1), (14, 9, 0), (17, 12, 1), (20, 9, 0), (23, 6, 1), (16, 7, -1), (19, 6, 1)):
                flame(p, x, 9, h, ln)
            p.ps([(10, 2), (25, 0), (16, -1 + 1)], F2)
        else:
            smoke = (88, 84, 96)
            p.ps([(15, 7), (16, 5), (15, 3), (19, 6), (20, 4), (19, 2), (20, 0)], smoke)
        frames.append(p.im)
    return save(strip(frames), 'prop_challenge.png', 2)


def make_lever():
    frames = []
    for f in range(2):
        p = Pic(22, 26)
        base = 25
        # short stone post with a slot
        p.r(5, 12, 16, base - 1, S2); p.r(13, 12, 16, base - 1, S1); p.l(5, 12, 5, base - 1, S3)
        p.r(3, base - 1, 18, base, S1); p.l(3, base - 1, 18, base - 1, S2)
        p.r(4, 10, 17, 12, S3); p.l(4, 10, 17, 10, S4)
        p.ps([(8, 18), (9, 19), (12, 21), (14, 15)], S0)
        p.r(9, 13, 12, 15, I0)                                # slot plate
        p.r(8, 13, 13, 13, I2)
        # handle: iron rod with a wooden knob, up-left or down-right
        hx, hy = 10, 14
        if f == 0:
            tx, ty = 4, 1
        else:
            tx, ty = 19, 19
        p.l(hx, hy, tx, ty, I2, 2)
        p.l(hx, hy - 1, tx, ty - 1, I3)
        p.e(tx - 2, ty - 2, tx + 2, ty + 2, W3); p.p(tx - 1, ty - 1, W4)
        p.r(hx - 1, hy - 1, hx + 1, hy + 1, I3)               # pivot bolt
        p.outline()
        frames.append(p.im)
    return save(strip(frames), 'prop_lever.png', 2)


def make_bowl():
    frames = []
    for f in range(2):
        p = Pic(26, 20)
        base = 19
        p.r(9, 11, 16, base - 2, S2); p.l(9, 11, 9, base - 2, S3); p.r(14, 11, 16, base - 2, S1)   # stem
        p.r(5, base - 2, 20, base, S1); p.l(5, base - 2, 20, base - 2, S2)
        p.poly([(1, 4), (24, 4), (21, 10), (17, 12), (8, 12), (4, 10)], S2)                   # bowl
        p.poly([(14, 4), (24, 4), (21, 10), (17, 12), (14, 12)], S1)
        p.l(2, 5, 6, 10, S3)
        p.e(1, 2, 24, 7, S3)
        if f == 0:
            p.e(3, 3, 22, 6, BL1)
            p.e(5, 3, 15, 5, BL2)
            p.p(7, 4, (230, 90, 90)); p.p(8, 4, (230, 90, 90))
            p.ps([(5, 7), (5, 8), (20, 7), (20, 8), (20, 9)], BL1)                            # spill over the rim
        else:
            p.e(3, 3, 22, 6, S0)
            p.ps([(10, 5), (11, 5), (17, 4)], (70, 20, 24))                                  # dried stain
        p.ps([(4, 6), (11, 9), (18, 8)], S0)                                                  # carved runes
        p.outline()
        frames.append(p.im)
    return save(strip(frames), 'prop_bowl.png', 2)


def make_web():
    """Big cobweb anchored in the corners, with a wrapped cocoon; threads 1px, holes transparent."""
    W, H = 44, 42
    p = Pic(W, H)
    cx, cy = 21, 19
    rnd = random.Random(21)
    anchors = [(0, 0), (11, 0), (24, 0), (36, 1), (43, 0), (43, 12), (43, 27), (42, 41), (28, 41), (14, 41), (0, 41),
               (0, 28), (1, 13)]
    rays = []
    for ax_, ay_ in anchors:
        p.l(cx, cy, ax_, ay_, WEB0)
        rays.append(math.atan2(ay_ - cy, ax_ - cx))
    rays.sort()
    for ring in range(1, 8):
        pts = []
        for a in rays + [rays[0] + 2 * math.pi]:
            r_ = ring * 3.2 + rnd.uniform(-0.8, 0.8)
            # stretch towards the far corners so the web fills the square
            k = 1.0 / max(abs(math.cos(a)), abs(math.sin(a)))
            r_ *= 0.8 + 0.2 * k
            pts.append((cx + math.cos(a) * r_, cy + math.sin(a) * r_))
        sag = [(x, y + 0.6) for x, y in pts]
        p.lines(sag, WEB1 if ring % 2 else WEB0)
    p.r(cx - 1, cy - 1, cx + 1, cy + 1, WEB1)
    # cocoon hanging in the lower right
    p.l(31, 26, 31, 29, WEB0)
    p.e(29, 29, 34, 38, (200, 196, 190)); p.l(30, 31, 33, 32, WEB0); p.l(30, 34, 33, 35, WEB0)
    p.p(30, 30, (240, 240, 236))
    im = p.im
    # dark outline only around the cocoon, threads stay thin
    co = Image.new('RGBA', im.size, (0, 0, 0, 0))
    co.paste(im.crop((28, 28, 36, 40)), (28, 28))
    co = outline_same(co)
    out = im.copy()
    out.alpha_composite(co)
    return save(strip([out]), 'prop_web.png')


def make_arrowplate():
    frames = []
    for f in range(2):
        p = Pic(28, 10)
        base = 9
        # recessed stone frame
        p.r(0, base - 4, 27, base, S1); p.l(0, base - 4, 27, base - 4, S0)
        if f == 0:   # plate raised: top face plus a 2px front edge
            p.r(3, base - 6, 24, base - 3, S3); p.l(3, base - 6, 24, base - 6, S4)
            p.r(3, base - 2, 24, base - 1, S2)
            p.ps([(6, base - 4), (12, base - 5), (19, base - 4)], S2)
            p.bitmap(11, base - 5, ['.x.', 'xxx'], {'x': R2})          # rusty arrow mark
        else:        # pressed: flush and dark, a crack of shadow around it
            p.r(3, base - 4, 24, base - 2, S2); p.l(3, base - 4, 24, base - 4, S0)
            p.l(3, base - 1, 24, base - 1, OUT)
            p.bitmap(11, base - 4, ['.x.', 'xxx'], {'x': R1})
        p.outline()
        frames.append(p.im)
    return save(strip(frames), 'prop_arrowplate.png', 2)


def make_gasvent():
    frames = []
    for f in range(2):
        p = Pic(30, 28)
        base = 27
        p.r(0, base - 5, 29, base, S1); p.l(0, base - 5, 29, base - 5, S2)       # stone frame
        p.r(3, base - 4, 26, base - 1, OUT)                                       # dark pit
        if f == 1:
            p.r(4, base - 4, 25, base - 2, G0)
        for x in range(4, 26, 3):                                               # iron bars
            p.l(x, base - 4, x + 1, base - 1, I2)
            p.p(x, base - 4, I3)
        p.l(3, base - 3, 26, base - 3, I1)
        p.outline()
        if f == 1:  # green gas boiling out of the grate
            rnd = random.Random(4)
            for k in range(22):
                x = rnd.randint(4, 25)
                y = base - 4 - int(abs(rnd.gauss(0, 7)))
                r_ = rnd.choice((1, 2, 2, 3))
                c = G3 if y < base - 14 else (G2 if rnd.random() < 0.6 else G1)
                p.e(x - r_, y - r_, x + r_, y + r_, c if rnd.random() < 0.8 else G1)
            for x, y in ((8, 10), (17, 6), (23, 12), (12, 3)):
                p.p(x, y, G3)
        frames.append(p.im)
    return save(strip(frames), 'prop_gasvent.png', 2)


# ================================================================== ITEMS
def make_key():
    p = Pic(16, 16)
    g0, g1, g2 = (150, 104, 40), GOLD0, GOLD1
    p.e(0, 0, 7, 7, g1)                                       # bow (ring) with a hole
    p.e(2, 2, 5, 5, (0, 0, 0, 0))
    p.r(3, 3, 4, 4, (0, 0, 0, 0))
    p.arc(0, 0, 7, 7, 180, 270, g2)
    p.l(6, 6, 14, 14, g1, 2)                                  # shaft
    p.l(6, 5, 13, 12, g2)
    p.r(10, 13, 11, 15, g1); p.r(12, 11, 13, 12, g0)          # bit teeth
    p.p(7, 8, g0); p.p(8, 9, g0)
    p.im = Image.fromarray(np.where(np.array(p.im)[:, :, 3:] > 0, np.array(p.im), 0).astype(np.uint8))
    p.d = ImageDraw.Draw(p.im)
    p.outline()
    p.p(2, 1, GOLD2)
    return save(strip([p.im]), 'item_key.png')


def make_grenade():
    p = Pic(12, 12)
    p.e(1, 3, 10, 11, (40, 38, 48))
    p.e(2, 4, 7, 8, (64, 62, 76))
    p.p(3, 5, (120, 120, 136)); p.p(4, 5, (96, 96, 110))
    p.r(5, 2, 7, 3, I2); p.l(5, 2, 7, 2, I3)                  # fuse cap
    p.l(7, 1, 8, 0, (130, 104, 66))
    p.outline()
    p.p(9, 0, F3); p.p(9, 1, F2); p.p(10, 0, F1)
    return save(strip([p.im]), 'item_grenade.png')


def make_map():
    p = Pic(16, 14)
    p.r(2, 1, 13, 12, PAPER1)                                 # sheet
    p.r(0, 0, 2, 13, PAPER2); p.l(2, 0, 2, 13, PAPER0)        # rolls at both ends
    p.r(13, 0, 15, 13, PAPER1); p.l(15, 0, 15, 13, PAPER0); p.l(13, 0, 13, 13, PAPER2)
    p.lines([(4, 10), (6, 8), (8, 9), (10, 5)], (120, 84, 50))  # dotted path
    p.ps([(4, 4), (5, 3), (6, 4), (9, 10), (10, 10)], (110, 130, 80))   # little woods
    p.ps([(10, 4), (11, 5), (11, 3), (10, 5), (9, 4), (10, 3)], (200, 30, 30))  # red X ... (cross)
    p.p(10, 4, (200, 30, 30)); p.p(9, 3, (200, 30, 30)); p.p(11, 5, (200, 30, 30)); p.p(11, 3, (200, 30, 30)); p.p(9, 5, (200, 30, 30))
    p.ps([(4, 2), (7, 11), (12, 7)], PAPER0)
    p.outline()
    return save(strip([p.im]), 'item_map.png')


def make_ammo_variants():
    src = Image.open(G_OUT + 'ammo.png').convert('RGBA')
    small = hard(src.resize((20, 16), Image.LANCZOS))
    save(strip([small]), 'item_ammo_small.png')
    # big: two ammo boxes stacked (one behind, one in front) bound with a strap
    big = Image.new('RGBA', (40, 34), (0, 0, 0, 0))
    back = hard(src.resize((24, 19), Image.LANCZOS))
    big.alpha_composite(back, (13, 0))
    big.alpha_composite(src, (2, 11))
    big = hard(big)
    p = Pic(40, 34)
    p.paste(big, 0, 0)
    for y in range(13, 33):
        if p.solid(14, y):
            p.p(14, y, (90, 70, 40)); p.p(15, y, (120, 96, 56))
    return save(strip([p.im]), 'item_ammo_big.png')


builder('props')(lambda: [f() for f in (make_anvil, make_fortune, make_prisoner, make_challenge, make_lever, make_bowl,
                                        make_web, make_arrowplate, make_gasvent)])
builder('items')(lambda: [f() for f in (make_key, make_grenade, make_map, make_ammo_variants)])


# ================================================================== PARTICLES / DECALS
def radial(w, h, cx, cy, r, col, power=2.0, scale=1.0, sy=1.0):
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    d = np.sqrt((xx - cx) ** 2 + ((yy - cy) / sy) ** 2) / r
    k = np.clip(1 - d, 0, 1) ** power * scale
    return k[..., None] * np.array(col, float)


def from_arr(a):
    out = np.zeros(a.shape[:2] + (4,), np.uint8)
    out[..., :3] = np.clip(a, 0, 255)
    out[..., 3] = 255
    return Image.fromarray(out)


def band(a, levels=5):
    """Quantize an additive glow into a few flat steps (pixel-art look)."""
    m = a.max()
    if m <= 0:
        return a
    return np.round(a / m * levels) / levels * m


def make_gib():
    flesh, flesh_l, flesh_d = (176, 54, 54), (220, 110, 100), (110, 20, 26)
    frames = []
    for f in range(4):
        p = Pic(6, 6)
        if f == 0:      # meat chunk
            p.e(0, 1, 5, 5, flesh); p.r(1, 2, 2, 2, flesh_l); p.p(4, 4, flesh_d)
        elif f == 1:    # bone splinter with meat on the end
            p.l(0, 5, 5, 0, B2); p.p(0, 4, B3); p.r(3, 0, 5, 2, flesh); p.p(4, 1, flesh_l)
        elif f == 2:    # rib piece
            p.arc(0, 0, 9, 9, 180, 270, B2, 2); p.p(1, 3, B3); p.p(5, 5, flesh)
        else:           # small bloody lump
            p.e(1, 1, 4, 4, flesh_d); p.p(2, 2, flesh); p.p(2, 1, flesh_l); p.p(5, 3, flesh_d)
        p.outline()
        frames.append(p.im)
    return save(cells(frames, 8, 8), 'part_gib.png', 4)


def make_spore():
    frames = []
    for f in range(2):
        a = radial(8, 8, 3.5, 3.5, 4.0 if f == 0 else 3.2, (60, 140, 40), 1.4, 1.0 if f == 0 else 0.8)
        a = band(a, 4)
        a[3:5, 3:5] = (190, 255, 120) if f == 0 else (150, 230, 90)
        if f == 0:
            a[3, 3] = (240, 255, 200)
        frames.append(from_arr(a))
    return save(cells(frames, 8, 8), 'part_spore.png', 2, additive=True)


def make_webshot():
    p = Pic(8, 8)
    p.e(1, 1, 6, 6, WEB0)
    p.e(2, 1, 5, 4, WEB1)
    p.p(3, 2, (255, 255, 255))
    p.ps([(0, 3), (7, 4), (4, 7), (3, 0)], WEB0)
    im = outline_same(p.im)
    return save(cells([im], 8, 8), 'part_webshot.png')


def make_scorch():
    w, h = 24, 8
    rnd = random.Random(5)
    m = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(m)
    d.ellipse((2, 1, 21, 6), fill=150)
    d.ellipse((6, 2, 17, 5), fill=255)
    for _ in range(14):
        a = rnd.uniform(0, math.tau)
        r_ = rnd.uniform(7, 11)
        x, y = 11.5 + math.cos(a) * r_, 3.5 + math.sin(a) * r_ * 0.32
        d.point((x, y), fill=110)
    a = np.array(m)
    out = np.zeros((h, w, 4), np.uint8)
    out[a >= 100] = (34, 28, 28, 255)
    out[a >= 140] = (22, 18, 18, 255)
    out[a >= 250] = (12, 10, 10, 255)
    out[3, 9] = out[4, 14] = (40, 30, 26, 255)
    return save(Image.fromarray(out), 'part_scorch.png')


def make_hole():
    frames = []
    for f in range(2):
        p = Pic(4, 4)
        if f == 0:
            p.r(1, 1, 2, 2, (8, 6, 8)); p.ps([(0, 1), (1, 0)], (70, 66, 70)); p.ps([(3, 2), (2, 3)], (110, 106, 108))
        else:
            p.r(1, 1, 2, 2, (8, 6, 8)); p.p(1, 0, (8, 6, 8)); p.ps([(0, 2), (3, 1), (2, 0)], (90, 86, 88)); p.p(3, 3, (60, 56, 60))
        frames.append(p.im)
    return save(cells(frames, 4, 4), 'part_hole.png', 2)


def make_ash():
    frames = []
    for f in range(2):
        p = Pic(4, 4)
        if f == 0:
            p.r(1, 1, 2, 2, (120, 116, 112)); p.p(1, 1, (170, 166, 160)); p.p(3, 2, (80, 78, 76))
        else:
            p.p(1, 1, (150, 146, 140)); p.p(2, 2, (90, 88, 86)); p.p(2, 1, (110, 106, 102))
        frames.append(p.im)
    return save(cells(frames, 4, 4), 'part_ash.png', 2)


def make_smoke():
    greys = [(70, 68, 74), (104, 102, 108), (140, 138, 144)]
    bayer = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16
    frames = []
    for f in range(4):
        rnd = random.Random(40 + f)
        dens = np.zeros((16, 16))
        yy, xx = np.mgrid[0:16, 0:16].astype(float)
        R = 3.5 + f * 1.1
        for _ in range(5):
            cx, cy = 7.5 + rnd.uniform(-2, 2) * (1 + f * 0.3), 8 + rnd.uniform(-2, 2) * (1 + f * 0.3) - f * 0.8
            r_ = R * rnd.uniform(0.55, 0.85)
            dens = np.maximum(dens, np.clip(1 - np.hypot(xx - cx, yy - cy) / r_, 0, 1))
        fade = [1.0, 0.85, 0.65, 0.42][f]
        light = np.clip(1 - (yy - 2) / 14 + (7.5 - xx) / 30, 0, 1)
        out = np.zeros((16, 16, 4), np.uint8)
        thr = bayer[yy.astype(int) % 4, xx.astype(int) % 4]
        vis = dens * 2.4 * fade > thr * 0.9 + 0.06
        idx = np.clip((dens * light * 3).astype(int), 0, 2)
        for i in range(3):
            out[vis & (idx == i)] = greys[i] + (255,)
        frames.append(Image.fromarray(out))
    return save(cells(frames, 16, 16), 'part_smoke.png', 4)


def make_ice():
    ice0, ice1, ice2, ice3, edge = (90, 140, 200), (150, 200, 240), (210, 238, 255), (255, 255, 255), (30, 50, 96)
    shapes = [[(0, 5), (2, 0), (4, 3), (3, 5)], [(0, 2), (5, 0), (4, 4), (1, 5)], [(1, 5), (2, 1), (5, 0), (4, 3)]]
    frames = []
    for f, sh in enumerate(shapes):
        p = Pic(4, 4)
        p.poly([(x * 0.7, y * 0.7) for x, y in sh], ice1)
        p.p(1, 1, ice3); p.p(2, 2, ice2)
        p.outline(edge)
        frames.append(p.im)
    return save(cells(frames, 6, 6), 'part_ice.png', 3)


def make_gas():
    frames = []
    for f in range(2):
        rnd = random.Random(8 + f)
        a = np.zeros((16, 24, 3))
        for _ in range(7):
            cx, cy = rnd.uniform(6, 18), rnd.uniform(6, 10)
            a = np.maximum(a, radial(24, 16, cx, cy, rnd.uniform(4, 7), (60, 150, 30), 1.2, rnd.uniform(0.6, 1.0), sy=0.8))
        a = band(a, 5)
        frames.append(from_arr(a))
    return save(cells(frames, 24, 16), 'part_gas.png', 2, additive=True)


def make_skull_fx():
    frames = []
    for f in range(2):
        a = np.zeros((12, 12, 3))
        rnd = random.Random(30 + f)
        for _ in range(6):     # blue flames licking upwards behind the skull
            x = rnd.uniform(2, 9)
            a = np.maximum(a, radial(12, 12, x, rnd.uniform(3, 6), rnd.uniform(2.5, 3.8), (30, 70, 200), 1.2, 1.0, sy=2.0))
        a = band(a, 3)
        sk = ['.aaaa.', 'abbbbb', 'bddbdd', 'bddbdb', '.bbbb.', '.c.c..']
        pal = {'a': (220, 240, 255), 'b': (150, 200, 255), 'c': (90, 140, 230), 'd': (10, 20, 60)}
        for j, row in enumerate(sk):
            for i, ch in enumerate(row):
                if ch in pal:
                    a[5 + j, 3 + i] = pal[ch]
        a[0 + f, 5] = (120, 180, 255); a[1, 7 - f] = (80, 140, 255)
        frames.append(from_arr(a))
    return save(cells(frames, 12, 12), 'part_skull.png', 2, additive=True)


def make_log():
    """A log lying across the way, seen from the front (it rolls towards the viewer): a horizontal cylinder,
    lit on top, with bark furrows that move down between the frames."""
    frames = []
    ramp = [(46, 30, 22), (70, 46, 32), (98, 66, 44), (126, 88, 58), (154, 112, 74)]
    for f in range(2):
        p = Pic(32, 14)
        for y in range(1, 13):
            k = [4, 3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 0][y - 1]
            p.l(1, y, 30, y, ramp[k])
        rnd = random.Random(9)
        for _ in range(16):          # bark furrows: short dark dashes, shifted 2 rows per frame
            x = rnd.randint(2, 27)
            y = (rnd.randint(0, 11) + f * 2) % 12 + 1
            ln = rnd.randint(2, 5)
            c = ramp[max(0, [4, 3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 0][y - 1] - 2)]
            p.l(x, y, min(29, x + ln), y, c)
        kx, ky = 10 + rnd.randint(0, 3), (5 + f * 2) % 10 + 2   # knot
        p.e(kx, ky - 1, kx + 3, ky + 1, ramp[0]); p.p(kx + 1, ky - 1, ramp[3])
        for x0 in (0, 31):           # rounded cut ends
            p.l(x0, 3, x0, 10, (176, 140, 92))
            p.p(x0, 2, (0, 0, 0, 0)); p.p(x0, 11, (0, 0, 0, 0))
        p.r(0, 0, 0, 1, (0, 0, 0, 0)); p.r(31, 0, 31, 1, (0, 0, 0, 0))
        p.r(0, 12, 0, 13, (0, 0, 0, 0)); p.r(31, 12, 31, 13, (0, 0, 0, 0))
        p.ps([(1, 1), (30, 1), (1, 12), (30, 12)], (0, 0, 0, 0))
        im = hard(p.im)
        frames.append(outline_same(im))
    return save(cells(frames, 32, 14), 'part_log.png', 2)


def make_rock():
    p = Pic(10, 10)
    p.poly([(0, 6), (2, 1), (6, 0), (9, 3), (9, 8), (5, 9), (1, 9)], S1)
    p.poly([(1, 5), (2, 2), (6, 1), (7, 3), (4, 5)], S2)
    p.ps([(3, 2), (4, 2)], S3); p.ps([(6, 6), (7, 7), (3, 7)], S0)
    p.outline()
    return save(cells([p.im], 12, 12), 'part_rock.png')


def make_shadow():
    p = Pic(24, 6)
    p.e(0, 0, 23, 5, (14, 10, 16))
    return save(cells([p.im], 24, 6), 'part_shadow.png')


def make_zzz():
    p = Pic(4, 4)
    p.bitmap(0, 0, ['xxxx', '..x.', '.x..', 'xxxx'], {'x': (220, 230, 255)})
    p.outline()
    return save(cells([p.im], 6, 6), 'part_zzz.png')


def make_star():
    a = np.zeros((4, 16, 3))
    for x in range(16):
        t = x / 15
        a[1, x] = np.array((120, 140, 220)) * t ** 1.5
        a[2, x] = np.array((60, 70, 140)) * t ** 2
    a[1, 14] = (230, 240, 255); a[1, 15] = (255, 255, 255); a[2, 15] = (160, 180, 255); a[0, 15] = (120, 140, 220)
    a[1, 13] = (180, 200, 255)
    return save(from_arr(a), 'part_star.png', additive=True)


def make_meteor():
    frames = []
    for f in range(2):
        a = np.zeros((16, 16, 3))
        rnd = random.Random(70 + f)
        for k in range(9):       # fiery tail streaming up-left behind the rock (it falls down-right)
            t = k / 8
            cx, cy = 10 - t * 8 + rnd.uniform(-1, 1), 10 - t * 8 + rnd.uniform(-1, 1)
            a = np.maximum(a, radial(16, 16, cx, cy, 4.5 - t * 2.5, (255, 120, 30), 1.0, 1.0 - t * 0.6))
        a = band(a, 4)
        a = np.maximum(a, radial(16, 16, 10.5, 10.5, 3.2, (255, 220, 120), 1.0, 1.0))
        for x, y in ((10, 10), (11, 10), (10, 11), (11, 11), (12, 11), (11, 12)):
            a[y, x] = (120, 50, 30) if (x + y + f) % 3 else (160, 70, 34)     # glowing rock core
        a[9, 10] = (255, 240, 200)
        frames.append(from_arr(a))
    return save(cells(frames, 16, 16), 'part_meteor.png', 2, additive=True)


def make_moon():
    p = Pic(28, 28)
    p.e(0, 0, 27, 27, (214, 216, 196))
    p.e(4, 2, 27, 25, (232, 234, 216))
    p.e(9, 4, 25, 18, (244, 244, 230))
    for (x, y, r_) in ((8, 8, 3), (17, 15, 4), (11, 19, 2), (20, 6, 2), (5, 15, 2), (15, 23, 2)):
        p.e(x - r_, y - r_, x + r_, y + r_, (186, 188, 172))
        p.e(x - r_ + 1, y - r_ + 1, x + r_, y + r_, (200, 202, 186))
        p.p(x - r_ + 1, y - r_ + 1, (170, 170, 156))
    a = np.array(p.im)
    a[:, :, 3] = np.where(a[:, :, 3] > 0, 255, 0)
    return save(Image.fromarray(a), 'moon.png')


def periodic_noise(w, h, seed, octaves=((32, 1.0), (16, 0.5), (8, 0.25))):
    """Value noise that tiles horizontally over w."""
    rng = np.random.default_rng(seed)
    out = np.zeros((h, w))
    for cell, amp in octaves:
        gx, gy = w // cell, h // cell + 2
        g = rng.random((gy, gx))
        g = np.concatenate([g, g[:, :1]], 1)
        im = Image.fromarray((g * 255).astype(np.uint8)).resize((w + cell, (gy - 1) * cell + 1), Image.BICUBIC)
        out += np.array(im, float)[:h, :w] / 255 * amp
    return out / sum(a for _, a in [(0, x[1]) for x in octaves])


def make_clouds():
    """Night cloud banks: soft blobs placed with horizontal wrap-around (so the strip tiles), Bayer-dithered edges,
    moonlit upper rims."""
    w, h = 256, 40
    rnd = random.Random(17)
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    dens = np.zeros((h, w))
    for bank in range(7):
        bx = bank * w / 7 + rnd.uniform(-10, 10)
        by = rnd.uniform(18, 26)
        for _ in range(9):
            cx = bx + rnd.uniform(-22, 22)
            cy = by + rnd.uniform(-6, 4)
            rx, ry = rnd.uniform(6, 14), rnd.uniform(3, 7)
            for ox in (-w, 0, w):
                d = np.hypot((xx - cx - ox) / rx, (yy - cy) / ry)
                dens = np.maximum(dens, np.clip(1 - d, 0, 1) * rnd.uniform(0.7, 1.0))
    dens *= np.clip(1 - (yy - 30) / 10, 0, 1)                 # flat-ish bottoms fade out
    bayer = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16
    thr = bayer[(yy % 4).astype(int), (xx % 4).astype(int)]
    vis = dens * 2.2 > thr + 0.05
    cols = [(22, 24, 38), (32, 36, 54), (46, 52, 74), (72, 78, 104)]
    up = np.roll(dens, 2, 0)                                  # density two rows higher
    light = np.clip((dens - up) * 3, 0, 1)                    # upper edges catch the moon
    lvl = np.clip((dens * 2 + light * 1.5).astype(int), 0, 3)
    out = np.zeros((h, w, 4), np.uint8)
    for i in range(4):
        out[vis & (lvl == i)] = cols[i] + (255,)
    return save(Image.fromarray(out), 'clouds.png')


builder('parts')(lambda: [f() for f in (make_gib, make_spore, make_webshot, make_scorch, make_hole, make_ash, make_smoke,
                                        make_ice, make_gas, make_skull_fx, make_log, make_rock, make_shadow, make_zzz,
                                        make_star, make_meteor, make_moon, make_clouds)])


# ================================================================== TEXTURES
def gmap(lum, stops):
    ts = np.array([s_[0] for s_ in stops], float)
    cs = np.array([s_[1] for s_ in stops], float)
    out = np.zeros(lum.shape + (3,))
    for ch in range(3):
        out[..., ch] = np.interp(lum, ts, cs[:, ch])
    return out


def tile_lum(path, size, reps=(1, 1)):
    src = Image.open(path).convert('L')
    big = Image.new('L', (src.width * reps[0], src.height * reps[1]))
    for i in range(reps[0]):
        for j in range(reps[1]):
            big.paste(src, (i * src.width, j * src.height))
    a = np.array(big.resize(size, Image.LANCZOS), float) / 255
    lo, hi = np.percentile(a, 2), np.percentile(a, 98)
    return np.clip((a - lo) / (hi - lo + 1e-6), 0, 1)


def blend(rgb, mask, color, alpha=1.0):
    m = (mask.astype(float) * alpha)[..., None]
    return rgb * (1 - m) + np.array(color, float) * m


def mask_draw(w, h, fn, wrap=True):
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


def finish(rgb, name, colors=48):
    """Half-res RGB array -> nearest x2 upscale -> palettize (like biome-textures/make.py)."""
    im = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), 'RGB')
    im = im.resize((im.width * 2, im.height * 2), Image.NEAREST)
    im.quantize(colors, method=Image.Quantize.MEDIANCUT).save(W_OUT + name)
    SAVED.append((W_OUT + name, 1, False))


def warp(a, amp, phase):
    """Periodic displacement of a tiling half-res field (keeps it seamless)."""
    h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    sx = (xx + np.round(amp * np.sin(2 * np.pi * (yy / h * 2) + phase))).astype(int) % w
    sy = (yy + np.round(amp * np.sin(2 * np.pi * (xx / w * 2) + phase * 1.3))).astype(int) % h
    return a[sy, sx]


def tex_water():
    lum = tile_lum(K + 'floor_ground_water.png', (32, 32))
    mud = tile_lum(C64 + 'Ground/Materials/mud_02.jpg', (32, 32))
    for f in range(2):
        l = lum if f == 0 else warp(lum, 1.0, 1.7)
        v = np.clip(l * 0.75 + mud * 0.25, 0, 1)
        rgb = gmap(v, [(0, (10, 18, 18)), (0.45, (20, 34, 32)), (0.7, (32, 54, 46)), (0.88, (58, 86, 72)), (1, (96, 124, 104))])
        def rings(d, ox, oy, f=f):
            for (x, y, r_) in ((8, 22, 2 + 2 * f), (24, 7, 4 - 2 * f)):
                d.ellipse((x - r_ + ox, y - r_ * 0.6 + oy, x + r_ + ox, y + r_ * 0.6 + oy), outline=255)
        rm = mask_draw(32, 32, rings)
        rgb = blend(rgb, rm > 0.5, (70, 96, 82), 0.8)
        rnd = random.Random(2)
        for _ in range(9):   # duckweed drifting one pixel between the frames
            x, y = rnd.randrange(32), rnd.randrange(32)
            rgb[y, (x + f) % 32] = (60, 92, 40)
            rgb[y, (x + f + 1) % 32] = (44, 70, 32)
        finish(rgb, 'floor_water.png' if f == 0 else 'floor_water2.png')


def tex_lava():
    lum = tile_lum(K + 'floor_ground_water.png', (32, 32))
    crust = tile_lum(C64 + 'Rocks/Materials/rock_wall_04.jpg', (32, 32))
    for f in range(2):
        l = lum if f == 0 else warp(lum, 1.0, 2.4)
        v = np.clip(l * 0.85 + (crust - 0.5) * 0.2 + (0.05 if f else 0), 0, 1)
        rgb = gmap(v, [(0, (26, 8, 6)), (0.35, (64, 14, 6)), (0.55, (150, 40, 10)), (0.72, (226, 100, 20)),
                       (0.86, (255, 180, 60)), (1, (255, 244, 170))])
        # floating dark crust plates
        def plates(d, ox, oy, f=f):
            r = random.Random(6)
            for _ in range(5):
                x, y = r.uniform(0, 32), r.uniform(0, 32)
                x += f * 1
                d.polygon([(x + ox + r.uniform(-3, 3), y + oy + r.uniform(-3, 3)) for _ in range(5)], fill=255)
        pm = mask_draw(32, 32, plates) > 0.5
        rgb = blend(rgb, pm, (34, 12, 8), 0.85)
        edge = pm & ~(np.roll(pm, 1, 0) & np.roll(pm, -1, 0) & np.roll(pm, 1, 1) & np.roll(pm, -1, 1))
        rgb = blend(rgb, edge, (120, 30, 8), 0.8)
        finish(rgb, 'floor_lava.png' if f == 0 else 'floor_lava2.png')


def tex_ice():
    lum = tile_lum(C64 + 'Ground/Materials/ice_01.jpg', (32, 32))
    rgb = gmap(lum, [(0, (88, 128, 170)), (0.4, (130, 172, 208)), (0.75, (178, 212, 236)), (1, (222, 240, 252))])
    def cracks(d, ox, oy):
        r = random.Random(14)
        for (x, y) in ((4, 6), (20, 18), (12, 27), (27, 4)):
            for br in range(3):
                ang = r.uniform(0, math.tau)
                px_, py_ = x, y
                pts = [(px_, py_)]
                for _ in range(r.randint(3, 6)):
                    ang += r.uniform(-0.6, 0.6)
                    px_ += math.cos(ang) * 2.2; py_ += math.sin(ang) * 2.2
                    pts.append((px_, py_))
                d.line([(qx + ox, qy + oy) for qx, qy in pts], fill=255)
    cm = mask_draw(32, 32, cracks) > 0.4
    rgb = blend(rgb, np.roll(cm, 1, 0) & ~cm, (240, 250, 255), 0.9)   # lit lip under each crack
    rgb = blend(rgb, cm, (60, 96, 140), 0.9)
    rnd = random.Random(5)
    for _ in range(12):
        rgb[rnd.randrange(32), rnd.randrange(32)] = (250, 254, 255)
    finish(rgb, 'floor_ice.png')


def tex_swamp_floor():
    mud = tile_lum(C64 + 'Ground/Materials/mud_02.jpg', (32, 32))
    moss = tile_lum(C64 + 'Ground/Materials/sand_mossy_01.png', (32, 32))
    rgb = gmap(mud, [(0, (16, 14, 8)), (0.5, (38, 32, 20)), (0.8, (58, 50, 30)), (1, (78, 68, 42))])
    def patches(d, ox, oy):
        r = random.Random(23)
        for _ in range(9):
            x, y, rx, ry = r.uniform(0, 32), r.uniform(0, 32), r.uniform(3, 7), r.uniform(2, 5)
            d.ellipse((x - rx + ox, y - ry + oy, x + rx + ox, y + ry + oy), fill=255)
    pm = mask_draw(32, 32, patches)
    mm = (pm > 0.5) & (moss > 0.25)
    mcol = gmap(moss, [(0, (30, 44, 18)), (0.6, (52, 72, 26)), (1, (84, 104, 40))])
    rgb[mm] = mcol[mm]
    def puddles(d, ox, oy):
        d.ellipse((20 + ox, 21 + oy, 28 + ox, 26 + oy), fill=255)
        d.ellipse((3 + ox, 4 + oy, 8 + ox, 7 + oy), fill=255)
    pd = mask_draw(32, 32, puddles) > 0.5
    rgb = blend(rgb, pd, (14, 22, 20), 0.9)
    rgb[22, 22:25] = (54, 72, 64); rgb[5, 4:6] = (54, 72, 64)
    rnd = random.Random(3)
    for _ in range(6):   # twigs
        x, y = rnd.randrange(32), rnd.randrange(32)
        for k in range(3):
            rgb[(y + k // 2) % 32, (x + k) % 32] = (86, 64, 40)
    finish(rgb, 'floor_swamp.png')


def tex_swamp_wall():
    w, h = 32, 64
    noise = tile_lum(C64 + 'Ground/Materials/mud_02.jpg', (w, h), (1, 2))
    yy, xx = np.mgrid[0:h, 0:w]
    v = np.clip(0.25 + 0.35 * noise + (yy / h) * 0.15, 0, 1)
    rgb = gmap(v, [(0, (6, 10, 8)), (0.5, (16, 24, 16)), (1, (34, 44, 28))])         # dark marsh behind
    bark = tile_lum(C64 + 'Nature/Materials/bark_3.png', (w, h), (1, 2))
    rnd = random.Random(19)
    # rotten wooden pilings
    for x0, pw, top in ((1, 6, 6), (11, 5, 14), (20, 7, 3), (29, 3, 18)):
        for x in range(x0, min(w, x0 + pw)):
            u = (x - x0 + 0.5) / pw
            shade = 0.35 + 0.8 * math.sin(math.pi * u) * (1.1 - 0.4 * u)
            for y in range(top, h):
                t = np.clip(bark[y, x] * 0.6 + 0.3, 0, 1) * shade
                rgb[y, x] = gmap(np.array([t]), [(0, (16, 12, 8)), (0.4, (44, 34, 22)), (0.8, (82, 64, 42)), (1, (110, 90, 60))])[0]
        # broken jagged top
        for x in range(x0, min(w, x0 + pw)):
            cut = rnd.randint(0, 3)
            rgb[top:top + cut, x] = rgb[max(0, top - 1), (x0 + pw + 1) % w] if top > 0 else rgb[0, x]
            rgb[top + cut, x] = (120, 100, 70)
        # slime and moss near the waterline, rot holes
        for y in range(40, 54):
            for x in range(x0, min(w, x0 + pw)):
                if rnd.random() < (y - 38) / 18:
                    rgb[y, x] = rgb[y, x] * 0.5 + np.array((34, 60, 22)) * 0.5
        hy = rnd.randint(18, 34)
        rgb[hy:hy + 2, x0 + pw // 2] = (10, 8, 6)
    # iron band and nails tying two piles
    rgb[24, 1:18] = (52, 50, 56); rgb[23, 1:18] = (82, 80, 88)
    # roots crawling across the lower half
    def roots(d, ox, oy):
        r = random.Random(8)
        for _ in range(5):
            x, y = r.uniform(0, w), r.uniform(36, 52)
            ang = r.uniform(-0.5, 0.5) + (math.pi if r.random() < 0.5 else 0)
            pts = [(x, y)]
            for _ in range(7):
                ang += r.uniform(-0.6, 0.6)
                x += math.cos(ang) * 2.5; y += abs(math.sin(ang)) * 1.5 + 0.4
                pts.append((x, y))
            d.line([(px_ + ox, py_ + oy) for px_, py_ in pts], fill=255, width=1)
    rm = mask_draw(w, h, roots, wrap=False) > 0.4
    # roots must tile horizontally: mirror the strip wrap by drawing with x offsets
    rm = rm | np.roll(rm, w, 1)
    rgb = blend(rgb, rm, (48, 34, 22))
    rgb = blend(rgb, rm & ~np.roll(rm, -1, 0), (90, 68, 44))
    # murky water at the foot of the wall
    wl = 56
    rgb[wl:, :] = gmap(noise[wl:, :] * 0.5 + 0.2, [(0, (8, 14, 12)), (1, (26, 40, 32))])
    rgb[wl, :] = (58, 80, 64)
    for x in range(0, w, 5):
        rgb[wl + 2, (x + 2) % w] = (40, 60, 48)
    # reeds and cattails in front
    for i in range(14):
        x = (i * 7 + rnd.randint(0, 3)) % w
        top = rnd.randint(36, 50)
        lean = rnd.choice((-1, 0, 0, 1))
        for y in range(top, h):
            xx_ = (x + (lean if y < top + 4 else 0)) % w
            rgb[y, xx_] = (96, 110, 46) if (y - top) % 5 else (70, 84, 34)
        if rnd.random() < 0.5:
            rgb[top - 3:top, x % w] = (92, 54, 30)
            rgb[top - 3, x % w] = (120, 74, 42)
    finish(rgb, 'wall_swamp.png')


def tex_door_locked():
    im = Image.open(W_OUT + 'door_wood.png').convert('RGB')
    p = Pic(64, 128)
    p.paste(im.convert('RGBA'), 0, 0)
    band, band_l, band_d, rivet = (62, 64, 76), (90, 92, 106), (36, 36, 44), (128, 130, 144)
    # extra iron straps: full-width bands over the middle rail and near top/bottom
    for y0 in (14, 61, 114):
        p.r(5, y0, 58, y0 + 6, band)
        p.l(5, y0, 58, y0, band_l)
        p.l(5, y0 + 6, 58, y0 + 6, band_d)
        for x in (9, 20, 43, 54):
            p.r(x, y0 + 2, x + 1, y0 + 3, rivet); p.p(x, y0 + 2, (180, 182, 196))
    # vertical strap down the middle
    p.r(29, 8, 34, 120, band); p.l(29, 8, 29, 120, band_l); p.l(34, 8, 34, 120, band_d)
    for y in range(12, 120, 10):
        p.r(31, y, 32, y + 1, rivet)
    # hasp plate and a big padlock
    p.r(22, 58, 41, 71, band_d); p.r(23, 59, 40, 70, (74, 76, 88)); p.l(23, 59, 40, 59, band_l)
    p.r(30, 54, 33, 60, band_d)                         # staple
    lk0, lk1, lk2, lk3 = (120, 84, 30), (176, 128, 48), (220, 176, 80), (250, 222, 140)
    p.arc(24, 62, 39, 82, 180, 360, band_d, 3)          # shackle
    p.arc(25, 63, 38, 81, 180, 360, (150, 152, 166), 1)
    p.r(22, 72, 41, 91, OUT)                            # lock body
    p.r(23, 73, 40, 90, lk1)
    p.r(23, 73, 40, 74, lk3); p.r(23, 75, 26, 90, lk2); p.r(37, 75, 40, 90, lk0)
    p.l(23, 90, 40, 90, lk0)
    p.e(29, 78, 34, 83, OUT); p.r(31, 82, 32, 87, OUT)  # keyhole
    p.ps([(25, 76), (38, 76), (25, 88), (38, 88)], lk0)
    im2 = p.im.convert('RGB')
    im2.quantize(64, method=Image.Quantize.MEDIANCUT).save(W_OUT + 'door_locked.png')
    SAVED.append((W_OUT + 'door_locked.png', 1, False))


def tex_wall_cracked():
    im = Image.open(W_OUT + 'wall_brick_stone_center.png').convert('RGB')
    a = np.array(im).astype(float)
    lum = a.mean(2)
    rows = [0, 10, 21, 31, 42, 53, 64, 74, 85, 96, 106, 117, 128]

    def joints(y0, y1):
        col = lum[y0 + 2:y1 - 1].mean(0)
        js = [x for x in range(64) if col[x] < np.median(col) - 18]
        out = []
        for x in js:
            if not out or x - out[-1] > 2:
                out.append(x)
        return out

    def hole(ri, pick):
        y0, y1 = rows[ri] + 1, rows[ri + 1] - 1
        js = [0] + joints(rows[ri], rows[ri + 1]) + [64]
        xa, xb = js[pick] + (1 if js[pick] else 0), js[pick + 1] - 1
        for y in range(y0, y1 + 1):
            for x in range(xa, xb + 1):
                t = (y - y0) / max(1, y1 - y0)
                a[y, x] = np.array((14, 12, 16)) * (1 - t) + np.array((40, 38, 46)) * t   # recess, dark at the top
        a[y1, xa:xb + 1] = (92, 90, 100)                                                   # lit bottom lip
        a[y0:y1 + 1, xa] = (26, 24, 30)
        for k in range(3):                                                                  # crumbs on the lip
            a[y1, min(xb, xa + 2 + k * 4)] = (130, 128, 138)
    hole(5, 1)
    hole(6, 0)
    hole(8, 2)
    # big crack zig-zagging down through the bricks, branching
    p = Pic(64, 128)
    main = [(40, 0), (38, 9), (41, 16), (36, 26), (37, 33), (31, 41), (33, 50), (27, 58), (30, 66), (24, 76), (27, 86),
            (22, 95), (25, 104), (19, 114), (21, 127)]
    p.lines(main, (16, 14, 18), 2)
    p.lines([(x + 1, y) for x, y in main], (18, 16, 20), 1)
    for br in ([(36, 26), (44, 31), (49, 30), (54, 36)], [(30, 66), (38, 70), (42, 77)], [(24, 76), (15, 80), (9, 78)],
               [(41, 16), (47, 14)], [(22, 95), (14, 99)]):
        p.lines(br, (20, 18, 24), 1)
    ca = np.array(p.im)
    m = ca[:, :, 3] > 0
    a[m] = ca[m][:, :3]
    lit = np.roll(m, 1, 1) & ~m                                                             # light right edge of the crack
    a[lit] = np.clip(a[lit] * 1.25 + 10, 0, 255)
    Image.fromarray(a.astype(np.uint8)).quantize(64, method=Image.Quantize.MEDIANCUT).save(W_OUT + 'wall_cracked.png')
    SAVED.append((W_OUT + 'wall_cracked.png', 1, False))


builder('textures')(lambda: [f() for f in (tex_swamp_wall, tex_swamp_floor, tex_water, tex_lava, tex_ice, tex_door_locked,
                                           tex_wall_cracked)])


# ================================================================== CONTACT SHEET
def make_sheet():
    try:
        font = ImageFont.load_default()
    except Exception:
        font = None
    items = []
    for path, n, add in SAVED:
        im = Image.open(path).convert('RGBA')
        name = os.path.basename(path)
        sc = 2 if name.startswith('enemies') or path.startswith(W_OUT) or name == 'clouds.png' else 4
        while im.width * sc > 1780:
            sc -= 1
        items.append((path, n, add, im, sc))
    W = 1800
    x, y, rowh = 8, 8, 0
    places = []
    for path, n, add, im, sc in items:
        w, h = im.width * sc, im.height * sc
        lw = len(os.path.basename(path)) * 6 + 70
        cw = max(w, lw)
        if x + cw > W - 8:
            x, y, rowh = 8, y + rowh + 22, 0
        places.append((path, n, add, im, sc, x, y + 14))
        x += cw + 14
        rowh = max(rowh, h + 14)
    H = y + rowh + 12
    c = Image.new('RGBA', (W, H), (104, 104, 104, 255))
    d = ImageDraw.Draw(c)
    for path, n, add, im, sc, x, y in places:
        fw = im.width // n
        lab = f'{os.path.basename(path)[:-4]} {n}f {fw}x{im.height}' + (' additive' if add else '')
        d.text((x, y - 13), lab, fill=(255, 255, 255, 255), font=font)
        big = im.resize((im.width * sc, im.height * sc), Image.NEAREST)
        if add:
            c.paste((0, 0, 0, 255), (x, y, x + big.width, y + big.height))
        else:
            for i in range(n):  # cell backgrounds show the frame size
                c.paste((92, 92, 92, 255), (x + i * fw * sc, y, x + (i + 1) * fw * sc - (2 if n > 1 else 0), y + big.height))
        c.alpha_composite(big, (x, y))
    os.makedirs(os.path.dirname(SHEET), exist_ok=True)
    c.convert('RGB').save(SHEET)


if __name__ == '__main__':
    want = [a for a in sys.argv[1:]]
    for name, fn in BUILDERS.items():
        if not want or name in want:
            fn()
    make_sheet()
    print('klart')
