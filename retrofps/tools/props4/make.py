#!/usr/bin/env python3
"""Version 6 graphics for Krypta: the volcano biome, five new enemies, the fire boss, props, runes, items,
ability icons, projectiles/particles and touch icons.

Run from the repo root (the folder that holds retrofps/ and assets/):
    python3 retrofps/tools/props4/make.py [name ...]
(with names only those builders run, e.g. `python3 retrofps/tools/props4/make.py lavaworm sheet`; the contact sheet
always shows everything this script has written so far, plus the three new first-person weapons)

The first-person weapons nailgun / staff / bow (fp_*.png, pick_*.png, js/weapons.js) come from tools/weapon-frames
(render-static.mjs + pack.py, see the README there).

Out to retrofps/assets/gfx:
  enemies-{necromancer,fireelemental,lavaworm,deathknight,banshee}_{idle,movement,attack,take_damage,death}.png  (64x64 cells)
  boss_flame_{idle,attack,cast,hurt,death}.png
  prop_{campfire,questboard,runestone,barrel_poison,barrel_frost,firejet,pendulum,stairs,pressureplate}.png
  rune_{fire,ice,poison,storm,blood,echo}.png (12x12), item_meat.png, ab_{blink,slowmo,bubble,summon,quake}.png (16x16)
  part_{nail,arrow,lightning,ashfall,lavadrop,heat}.png
Out to retrofps/assets/wall:
  wall_obsidian (64x128), floor_ash, floor_basalt, floor_pit, floor_crack (64x64),
  wall_boss_volcano (64x128), floor_boss_volcano (64x64)
Out to retrofps/assets/touch: icon_ability.png, icon_bow.png, icon_layout.png (96x96, white on transparent)
Contact sheet: <scratchpad>/en/v6_sheet.png

Sources (licences checked; everything not listed is drawn procedurally below in the outlined style of
tools/props2/make.py and tools/props3/make.py, whose helpers are reused):
  * Pixel Crawler Free Pack 2.11 (Anokolisa; free for commercial use, edits allowed, no resale of the assets):
      Npc's/Wizzard Idle/Run/Death   -> necromancer (recoloured black/green, skull staff and casting drawn)
      Npc's/Knight Idle/Run/Death    -> deathknight (recoloured black/crimson, glowing visor, tower shield and sword drawn)
  * Gothicvania / Legacy Collection (Ansimuz, CC0 - "public-license.pdf" in the collection):
      TinyRPG Battle Sprites / Monster Pack / Jumping-Demon -> boss_flame "ASKJÄTTEN" (recoloured to basalt and magma;
      the jump cycle is the slam, cast/hurt/death are built from its frames)
      Gothicvania Dancing Girl (snap/hips)                  -> banshee (recoloured pale/translucent, legs turned into a
      ragged spectral tail, screaming mouth and hair drawn)
  * Classic 64 Asset Pack 0.6 (Craig Snedeker, CC0): rock_wall_04, ground textures -> grain of the volcano textures
  * Kenney retro-textures-fantasy (CC0): wall_brick_stone_center -> block layout of wall_boss_volcano
  (32rogues, Super Retro World and Mana Seed are NOT used: their licences forbid AI use / redistribution.)
Additive particles (stored opaque on black, like part_ember): part_lightning, part_lavadrop, part_heat.
"""
import importlib.util
import json
import math
import os
import random
import re
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, rel):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, '..', rel, 'make.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


P2 = _load('props2make', 'props2')
P3 = _load('props3make', 'props3')
from_p2 = ('OUT Pic outline outline_same hard recolor load_frames shift shear rot squash tint place gmap tile_lum blend '
           'mask_draw glow warp radial band from_arr').split()
globals().update({k: getattr(P2, k) for k in from_p2})
colors_mask, keep, voronoi_cells, edge = P3.colors_mask, P3.keep, P3.voronoi_cells, P3.edge
S0, S1, S2, S3, S4 = P2.S0, P2.S1, P2.S2, P2.S3, P2.S4
B0, B1, B2, B3 = P2.B0, P2.B1, P2.B2, P2.B3
F0, F1, F2, F3 = P2.F0, P2.F1, P2.F2, P2.F3
G0, G1, G2, G3 = P2.G0, P2.G1, P2.G2, P2.G3
V0, V1, V2, V3 = P2.V0, P2.V1, P2.V2, P2.V3
BL0, BL1, BL2 = P2.BL0, P2.BL1, P2.BL2
GOLD0, GOLD1, GOLD2 = P2.GOLD0, P2.GOLD1, P2.GOLD2
W0, W1, W2, W3, W4 = P2.W0, P2.W1, P2.W2, P2.W3, P2.W4
I0, I1, I2, I3 = P2.I0, P2.I1, P2.I2, P2.I3
M0, M1, M2, M3 = P2.M0, P2.M1, P2.M2, P2.M3
PAPER0, PAPER1, PAPER2 = P2.PAPER0, P2.PAPER1, P2.PAPER2
ICE0, ICE1, ICE2, ICE3, ICE4 = P3.ICE0, P3.ICE1, P3.ICE2, P3.ICE3, P3.ICE4
CY0, CY1, CY2 = P3.CY0, P3.CY1, P3.CY2

A = 'assets/'
LC = A + '2d-pixel/Legacy Collection/Legacy Collection/Assets/'
GVC = LC + 'Gothicvania/Characters/'
TRPG = LC + 'TinyRPG/Characters/Battle Sprites/Monster Pack Files/'
PCE = A + '2d-pixel/Pixel Crawler - Free Pack 2.11/Pixel Crawler - Free Pack/Entities/'
NPC = PCE + "Npc's/"
K = A + 'textures/retro-textures-fantasy/PNG/'
C64 = A + 'textures/Classic 64 Asset Pack 0.6/- Classic 64 Asset Pack 0.6/'
G_OUT, W_OUT, T_OUT = 'retrofps/assets/gfx/', 'retrofps/assets/wall/', 'retrofps/assets/touch/'
SCR = '/tmp/claude-0/-home-user-test/80ee56ba-2fa6-5354-b261-a4ca4fdcb508/scratchpad/en/'
SHEET, MANIFEST = SCR + 'v6_sheet.png', SCR + 'v6_manifest.json'

# ---------------------------------------------------------------- volcano palette
MAG0, MAG1, MAG2, MAG3, MAG4 = (96, 18, 10), (178, 46, 14), (236, 102, 24), (255, 170, 52), (255, 236, 150)  # magma
BAS0, BAS1, BAS2, BAS3 = (22, 16, 20), (40, 30, 34), (62, 48, 50), (88, 70, 68)                             # basalt
ASH0, ASH1, ASH2, ASH3 = (58, 54, 56), (90, 86, 86), (124, 120, 118), (162, 158, 152)                       # ash
OB0, OB1, OB2, OB3 = (12, 8, 18), (28, 18, 40), (52, 34, 72), (92, 70, 124)                                 # obsidian
NG0, NG1, NG2, NG3 = (30, 90, 40), (70, 200, 80), (150, 255, 140), (226, 255, 210)                           # necro green

SAVED = {}


def save(im, path, n=1, additive=False):
    im.save(path)
    SAVED[path] = (n, additive)
    return im


def save_enemy(sheet, state, frames, fw, floor=None):
    """fw x fw cells, nothing below the feet row (57 / 28), hard alpha, 1px outline is drawn by the builders."""
    floor = floor if floor is not None else (57 if fw == 64 else 28)
    out = Image.new('RGBA', (fw * len(frames), fw), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        assert f.size == (fw, fw), (sheet, state, f.size)
        b = f.getbbox()
        if b and b[3] - 1 > floor:
            f = shift(f, 0, floor - (b[3] - 1))
        out.paste(hard(f), (i * fw, 0))
    save(out, G_OUT + f'enemies-{sheet}_{state}.png', len(frames))


def cells(frames, w, h):
    out = Image.new('RGBA', (w * len(frames), h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        out.paste(hard(f.crop((0, 0, w, h))), (i * w, 0))
    return out


def opaque(im, bg=(0, 0, 0)):
    out = Image.new('RGBA', im.size, bg + (255,))
    out.alpha_composite(im.convert('RGBA'))
    return out


def feet_cx(f):
    """(feet row, centre column of the lowest rows) of a frame."""
    a = np.array(f)[:, :, 3] > 0
    ys = np.nonzero(a.any(1))[0]
    feet = ys.max()
    xs = np.nonzero(a[max(0, feet - 6):feet + 1].any(0))[0]
    return feet, (xs.min() + xs.max()) // 2


def to_cell(f, fw=64, feet=57, cx=32, dx=0, dy=0, ref=None):
    """Put a source frame into an fw x fw cell: its feet on `feet`, its foot centre on `cx` (ref = (feet, cx) to share)."""
    fy, fx = ref if ref else feet_cx(f)
    out = Image.new('RGBA', (fw, fw), (0, 0, 0, 0))
    out.paste(f, (int(cx - fx + dx), int(feet - fy + dy)), f)
    return out


def comp(*layers, size=(64, 64)):
    out = Image.new('RGBA', size, (0, 0, 0, 0))
    for im, x, y in layers:
        out.paste(im, (int(x), int(y)), im)
    return out


def cut_below(im, y):
    a = np.array(im).copy()
    a[y + 1:] = 0
    return Image.fromarray(a)


def ember_burst(p, cx, cy, dist, n, seed, fall=0.0, pal=(MAG4, MAG3, MAG2), floor=57, size=1):
    r2 = random.Random(seed)
    for i in range(n):
        ang = r2.uniform(-math.pi, math.pi * 0.15) if fall < 0.5 else r2.uniform(-math.pi, math.pi)
        d = dist * r2.uniform(0.4, 1.15)
        x = cx + math.cos(ang) * d
        y = min(floor, cy + math.sin(ang) * d * 0.8 + fall * fall * r2.uniform(6, 14))
        c = pal[r2.randrange(len(pal))]
        p.p(x, y, c)
        if size > 1 and r2.random() < 0.5:
            p.p(x + 1, y, pal[-1]); p.p(x, y + 1, pal[-1])


BUILDERS = {}


def builder(name):
    def deco(fn):
        BUILDERS[name] = fn
        return fn
    return deco


# ================================================================== NECROMANCER (Pixel Crawler Wizzard, recoloured)
WIZ_P = [(147, 45, 139), (95, 46, 92), (67, 35, 65), (38, 26, 38)]
NECRO_MAP = {WIZ_P[0]: (46, 44, 56), WIZ_P[1]: (32, 30, 42), WIZ_P[2]: (24, 22, 32), WIZ_P[3]: (16, 14, 22),
             (240, 154, 83): (176, 186, 160), (128, 74, 30): (54, 124, 58), (71, 40, 13): (30, 74, 36),
             (253, 253, 253): (196, 200, 190), (203, 195, 188): (150, 154, 146), (124, 108, 94): (96, 98, 92),
             (70, 61, 53): (60, 62, 58), (181, 108, 48): (40, 36, 44), (20, 20, 18): OUT}
STAFF0, STAFF1 = (52, 34, 34), (84, 58, 50)


def wiz(anim, fw):
    fr = load_frames(NPC + f'Wizzard/{anim}/{anim}-Sheet.png', fw)
    return [recolor(f, NECRO_MAP) for f in fr]


def skull_staff(p, x, top, bottom, eyes=1, glow_r=0, k=0):
    """Staff along column x from row top (skull) to bottom, skull 5x5 on top. glow_r>0: green orb around the skull."""
    if glow_r:
        cy = top + 2
        for r_, c in ((glow_r + 1, NG0), (glow_r, NG1), (max(1, glow_r - 2), NG2)):
            p.e(x - r_, cy - r_, x + r_, cy + r_, c)
    p.l(x, top + 4, x, bottom, STAFF0)
    p.l(x + 1, top + 5, x + 1, bottom - 1, STAFF1) if bottom - top > 8 else None
    p.r(x - 2, top, x + 2, top + 3, B2)            # skull
    p.r(x - 1, top + 4, x + 1, top + 4, B1)        # jaw
    p.p(x - 2, top, B1); p.p(x + 2, top, B1)
    p.r(x - 2, top + 3, x + 2, top + 3, B1)
    ec = NG3 if eyes == 2 else (NG2 if eyes else OUT)
    p.p(x - 1, top + 2, ec); p.p(x + 1, top + 2, ec)
    p.p(x, top + 3, OUT)
    if glow_r >= 3:                                 # sparks
        r2 = random.Random(k)
        for _ in range(4 + glow_r):
            a_ = r2.uniform(0, math.tau)
            d_ = glow_r + r2.uniform(1, 4)
            p.p(x + math.cos(a_) * d_, top + 2 + math.sin(a_) * d_, NG2 if r2.random() < 0.6 else NG3)


def necro_frame(src, dx=0, dy=0, staff_dx=0, staff_up=0, eyes=1, glow_r=0, k=0, hand=True, flash=None):
    """src: recoloured wizard frame placed in a 64 cell; staff in the front (right) hand."""
    f = to_cell(src, dx=dx, dy=dy)
    b = f.getbbox()
    feet = b[3] - 1
    x = b[2] + 1 + staff_dx
    top = b[1] + 2 - staff_up
    p = Pic(64, 64)
    skull_staff(p, x, top, feet - staff_up // 2, eyes, glow_r, k)
    p.paste(f, 0, 0)
    if hand:                                        # pale hand gripping the staff
        hy = b[1] + 17 - staff_up
        p.r(x - 1, hy, x + 1, hy + 1, (176, 186, 160))
        p.p(x - 1, hy + 1, (130, 140, 120))
    im = outline_same(recolor(p.im, {(20, 20, 18): OUT}))
    if flash:
        im = tint(im, flash, 0.5)
    return im


@builder('necromancer')
def make_necromancer():
    idle, run, death = wiz('Idle', 32), wiz('Run', 64), wiz('Death', 64)
    save_enemy('necromancer', 'idle', [necro_frame(f, eyes=1 + (i % 2), k=i) for i, f in enumerate(idle)], 64)
    save_enemy('necromancer', 'movement', [necro_frame(f, staff_dx=-1 + (i % 2), k=i) for i, f in enumerate(run)], 64)
    i0 = idle[0]
    att = [necro_frame(i0, staff_up=2, eyes=2),
           necro_frame(idle[1], staff_up=5, eyes=2, glow_r=2, k=1),
           necro_frame(idle[2], staff_up=8, eyes=2, glow_r=3, k=2),
           necro_frame(idle[3], staff_up=9, eyes=2, glow_r=5, k=3),
           necro_frame(i0, staff_up=9, eyes=2, glow_r=6, k=4, dx=1),
           necro_frame(idle[1], staff_up=6, eyes=2, glow_r=3, k=5, dx=1),
           necro_frame(idle[2], staff_up=2, eyes=1, glow_r=0, k=6)]
    save_enemy('necromancer', 'attack', att, 64)
    save_enemy('necromancer', 'take_damage', [necro_frame(i0, dx=-2, staff_dx=-1, flash=(255, 255, 255)),
                                              necro_frame(i0, dx=-2, staff_dx=-1, eyes=0),
                                              necro_frame(i0, dx=-1)], 64)
    # death: the wizard's own fall (hat brim, beard) with the staff dropping beside him
    d = []
    ref = feet_cx(to_cell(death[0]))
    for i, f in enumerate(death):
        c = to_cell(f)
        b = c.getbbox()
        p = Pic(64, 64)
        if i < 2:
            skull_staff(p, b[2] + 1 + i, b[1] + 2 + i * 2, b[3] - 1, 1 if i == 0 else 0)
            p.paste(c, 0, 0)
        else:   # the staff lies on the floor behind him
            fy = 57
            p.paste(c, 0, 0)
            x0 = min(b[2] - 8, 62 - 20)
            p.l(x0, fy, x0 + 14, fy, STAFF0)
            p.r(x0 + 15, fy - 3, x0 + 19, fy, B2); p.p(x0 + 16, fy - 2, OUT); p.p(x0 + 18, fy - 2, OUT)
        d.append(outline_same(recolor(p.im, {(20, 20, 18): OUT})))
    save_enemy('necromancer', 'death', d, 64)


# ================================================================== DEATH KNIGHT (Pixel Crawler Knight, recoloured)
KN_MAP = {(36, 42, 54): (24, 22, 30), (59, 83, 94): (42, 40, 52), (92, 142, 165): (66, 64, 82), (138, 198, 224): (108, 104, 128),
          (181, 108, 48): (130, 26, 34), (71, 40, 13): (70, 14, 22), (20, 20, 18): OUT}
DK_RED, DK_RED2 = (255, 50, 40), (160, 20, 24)


def knight(anim, fw):
    fr = load_frames(NPC + f'Knight/{anim}/{anim}-Sheet.png', fw)
    out = []
    for f in fr:
        a = np.array(f)
        # glowing visor: the dark pixels between two outline pixels in a row of the helmet
        d = colors_mask(f, [(36, 42, 54)])
        o = colors_mask(f, [(20, 20, 18)])
        vis = d & np.roll(o, 1, 1) & np.roll(o, -1, 1)
        g = recolor(f, KN_MAP)
        ga = np.array(g)
        ys, xs = np.nonzero(vis)
        for y, x in zip(ys, xs):
            ga[y, x, :3] = DK_RED if x >= xs.max() - 3 else DK_RED2
        out.append(Image.fromarray(ga))
    return out


def tower_shield(h=19, w=11):
    p = Pic(w, h)
    p.poly([(0, 0), (w - 1, 0), (w - 1, h - 6), (w // 2, h - 1), (w // 2 - 1, h - 1), (0, h - 6)], (34, 32, 42))
    p.poly([(1, 1), (w - 2, 1), (w - 2, h - 6), (w // 2, h - 3), (w // 2 - 1, h - 3), (1, h - 6)], (56, 54, 68))
    p.l(1, 1, 1, h - 7, (90, 88, 108))
    cx = w // 2
    # crimson skull emblem
    p.r(cx - 2, 5, cx + 2, 8, (150, 24, 32)); p.r(cx - 1, 9, cx + 1, 9, (150, 24, 32))
    p.p(cx - 1, 6, OUT); p.p(cx + 1, 6, OUT); p.p(cx, 8, OUT)
    p.r(1, 3, w - 2, 3, (34, 32, 42)); p.r(1, h - 9, w - 2, h - 9, (34, 32, 42))
    p.ps([(2, 2), (w - 3, 2), (2, h - 8), (w - 3, h - 8)], (130, 128, 150))     # rivets
    p.outline()
    return p.im


def dk_sword(ang, ln=15):
    p = Pic(40, 40)
    ux, uy = math.cos(ang), math.sin(ang)
    h = (20, 20)
    p.l(h[0] - ux * 2, h[1] - uy * 2, h[0] + ux * 1, h[1] + uy * 1, (40, 20, 24), 2)
    gx, gy = h[0] + ux * 2, h[1] + uy * 2
    p.l(gx - uy * 3, gy + ux * 3, gx + uy * 3, gy - ux * 3, (90, 88, 108), 2)
    p.l(gx + ux, gy + uy, h[0] + ux * ln, h[1] + uy * ln, (70, 68, 86), 2)
    p.l(gx + ux, gy + uy, h[0] + ux * (ln - 1), h[1] + uy * (ln - 1), (150, 146, 172))
    p.p(h[0] + ux * (ln - 3), h[1] + uy * (ln - 3), (200, 60, 60))           # rune glint on the blade
    p.outline()
    return p.crop()


def dk_frame(src, sw=-1.1, hand=(7, 17), shield=(-10, 9), dx=0, dy=0, smear=None, lean=0.0, flash=None, ref=None):
    """Knight (faces right) in a 64 cell; the tower shield on the front side, the sword in the back hand above it."""
    f = to_cell(src, dx=dx, dy=dy, ref=ref)
    b = f.getbbox()
    cx = (b[0] + b[2]) // 2
    top = b[1]
    hx, hy = cx + hand[0], top + hand[1]
    out = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    s = dk_sword(sw)
    out.alpha_composite(f)
    p = Pic(64, 64)
    p.paste(out, 0, 0)
    if shield is not None:
        p.paste(tower_shield(), cx + shield[0], top + shield[1])
    p.paste(s, hx - 20, hy - 20)
    p.r(hx - 1, hy - 1, hx + 1, hy, (66, 64, 82))       # gauntlet
    if smear:
        a0, a1 = smear
        for k in range(10):
            a = a0 + (a1 - a0) * k / 9
            for r_, col in ((16, (255, 120, 110)), (14, (200, 60, 60))):
                if k > 1 or r_ == 16:
                    p.p(hx + math.cos(a) * r_, hy + math.sin(a) * r_, col)
    im = p.im
    if lean:
        im = shear(im, lean, 57)
    if flash:
        im = tint(im, flash, 0.5)
    return im


@builder('deathknight')
def make_deathknight():
    idle, run, death = knight('Idle', 32), knight('Run', 64), knight('Death', 48)
    ref = feet_cx(idle[0])
    save_enemy('deathknight', 'idle', [dk_frame(f, ref=ref, hand=(7, 17 + (1 if i in (1, 2) else 0))) for i, f in enumerate(idle)], 64)
    save_enemy('deathknight', 'movement', [dk_frame(f, hand=(7, 16 + (i % 2))) for i, f in enumerate(run)], 64)
    i0 = idle[0]
    att = [dk_frame(i0, ref=ref, sw=-2.3, hand=(3, 8)),
           dk_frame(i0, ref=ref, sw=-2.0, hand=(3, 4), lean=-0.06),
           dk_frame(i0, ref=ref, sw=-0.6, hand=(10, 10), smear=(-2.1, -0.7), lean=0.06, dx=1),
           dk_frame(i0, ref=ref, sw=0.5, hand=(11, 16), smear=(-1.3, 0.4), lean=0.1, dx=2),
           dk_frame(i0, ref=ref, sw=1.0, hand=(10, 19), lean=0.05, dx=1),
           dk_frame(i0, ref=ref)]
    save_enemy('deathknight', 'attack', att, 64)
    save_enemy('deathknight', 'take_damage', [dk_frame(i0, ref=ref, dx=-2, lean=-0.08, flash=(255, 255, 255), shield=(-11, 8)),
                                              dk_frame(i0, ref=ref, dx=-2, lean=-0.04, shield=(-11, 9)),
                                              dk_frame(i0, ref=ref, dx=-1)], 64)
    d = []
    for i, f in enumerate(death):
        c = to_cell(f, ref=None)
        b = c.getbbox()
        p = Pic(64, 64)
        if i < 2:
            sh = tower_shield().rotate(-15 * i, resample=Image.NEAREST, expand=True)
            p.paste(dk_frame(f, shield=None, sw=-0.9 + i * 0.6, hand=(6, 15 + i * 3)), 0, 0)
            p.paste(sh, (b[0] + b[2]) // 2 - 10 - i, b[1] + 9 + i * 2)
        else:   # shield face-down and the sword on the floor
            sh = tower_shield().rotate(90, resample=Image.NEAREST, expand=True)
            sw = dk_sword(0)
            sw = sw.crop(sw.getbbox())
            p.paste(c, 0, 0)
            p.paste(sw, min(b[2] - 6, 62 - sw.width), 57 - sw.height + 1)
            p.paste(sh, b[0] - 8, 57 - sh.height + 1)
        d.append(p.im)
    save_enemy('deathknight', 'death', d, 64)



# ================================================================== BANSHEE (Gothicvania Dancing Girl, recoloured pale, legs -> spectral tail)
DG = GVC + 'Dancing Girl Files/spritesheets/'
BAN_MAP = {(206, 32, 56): (226, 236, 246), (138, 11, 65): (156, 178, 206), (215, 126, 75): (186, 212, 228),
           (255, 177, 100): (230, 244, 250), (121, 61, 78): (116, 138, 172), (69, 60, 60): (46, 52, 92),
           (192, 177, 10): (146, 194, 222), (136, 140, 120): (190, 224, 240), (88, 86, 81): (108, 150, 190),
           (91, 103, 49): (88, 122, 166), (218, 223, 195): (255, 255, 255), (51, 26, 25): (0, 0, 0), (121, 57, 10): (0, 0, 0)}
BAN_T0, BAN_T1, BAN_T2 = (108, 150, 190), (146, 194, 222), (190, 224, 240)
BAN_MOUTH = (30, 26, 60)


def dg(name):
    return [f.transpose(Image.FLIP_LEFT_RIGHT) for f in load_frames(DG + name + '.png', 39)]


def ban_body(src, t=0.0, cut=44, tail=14, sway=0.0):
    """Recolour, drop the shoes and the hem, and grow a ragged tapering tail that waves with t."""
    a = np.array(recolor(src, BAN_MAP))
    a[cut:] = 0
    a[(a[:, :, 0] == 0) & (a[:, :, 1] == 0) & (a[:, :, 2] == 0)] = 0
    im = Image.fromarray(a)
    m = a[:, :, 3] > 0
    rows = np.nonzero(m[:cut].any(1))[0]
    yb = rows.max()
    xs = np.nonzero(m[yb])[0]
    x0, x1 = xs.min(), xs.max()
    p = Pic(src.width, src.height + tail + 2)
    p.paste(im, 0, 0)
    w = x1 - x0 + 1
    for j in range(1, tail + 1):
        k = 1 - j / (tail + 1)
        off = math.sin(t * math.tau + j * 0.5) * 2.5 * (j / tail) ** 1.5 + sway * j
        cx = (x0 + x1) / 2 + off
        hw = max(0.5, w / 2 * k ** 1.3)
        for x in range(int(round(cx - hw)), int(round(cx + hw)) + 1):
            # ragged strands: some columns stop early
            if (x * 7 + int(t * 8)) % 5 == 0 and j > tail * 0.5:
                continue
            c = BAN_T2 if x < cx - hw * 0.3 else (BAN_T1 if x < cx + hw * 0.5 else BAN_T0)
            if j > tail - 3 and (x + j) % 2:                 # dithered, fading end
                continue
            p.p(x, yb + j, c)
    return p.im


def ban_face(im):
    """(x, y) of the eyes: dark pixels inside the pale face in the upper body."""
    a = np.array(im)
    m = (a[:, :, 0] == 46) & (a[:, :, 1] == 52) & (a[:, :, 2] == 92) & (a[:, :, 3] > 0)
    m[24:] = False
    ys, xs = np.nonzero(m)
    if not len(xs):
        return None
    return int(round(xs.mean())), int(ys.min())


def ban_frame(src, t=0.0, bob=0, dx=0, scream=0, waves=0, flash=None, sway=0.0, hair=0):
    body = ban_body(src, t, sway=sway)
    p = Pic(body.width, body.height)
    p.paste(body, 0, 0)
    fc = ban_face(body)
    if fc and scream:
        ex, ey = fc
        p.r(ex - 1, ey + 2, ex + 1, ey + 2 + scream, BAN_MOUTH)          # open mouth
        p.p(ex - 1, ey + 2, (90, 80, 120))
        p.ps([(ex - 2, ey), (ex - 1, ey), (ex + 1, ey), (ex + 2, ey)], (255, 255, 255))   # wide white eyes
    if fc and hair:                                                      # hair streaming back (to the left)
        ex, ey = fc
        for i in range(hair):
            p.l(ex - 5 - i, ey - 3 + i * 2, ex - 9 - i * 2, ey - 2 + i * 2 + (i % 2), (226, 236, 246))
    im = outline_same(p.im)
    cell = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    b = im.getbbox()
    # float: the tail ends ~7 rows above the floor row
    cell.paste(im, (32 - (b[0] + b[2]) // 2 + dx, 51 - (b[3] - 1) + bob), im)
    if waves and fc:
        q = Pic(64, 64)
        q.paste(cell, 0, 0)
        ex = fc[0] + 32 - (b[0] + b[2]) // 2 + dx
        ey = fc[1] + 51 - (b[3] - 1) + bob + 3
        for r_ in range(waves):
            rr = 4 + r_ * 4
            q.arc(ex - rr, ey - rr, ex + rr, ey + rr, -50, 50, CY2 if r_ == waves - 1 else ICE3)
        cell = q.im
    if flash:
        cell = tint(cell, flash, 0.55)
    return cell


@builder('banshee')
def make_banshee():
    bal = dg('balancing')
    save_enemy('banshee', 'idle', [ban_frame(bal[j], t=i / 6, bob=(0, -1, -1, -2, -1, 0)[i]) for i, j in enumerate((0, 1, 2, 2, 1, 7))], 64)
    save_enemy('banshee', 'movement', [ban_frame(bal[i], t=i / 8, bob=-1 + (i % 2) * -1, sway=-0.25, dx=1) for i in range(8)], 64)
    att = [ban_frame(bal[0], t=0.0, scream=1),
           ban_frame(bal[7], t=0.2, bob=-1, scream=2, hair=1),
           ban_frame(bal[7], t=0.4, bob=-2, scream=3, waves=1, hair=2),
           ban_frame(bal[0], t=0.6, bob=-2, scream=3, waves=2, hair=3),
           ban_frame(bal[0], t=0.8, bob=-2, scream=3, waves=3, hair=3),
           ban_frame(bal[1], t=0.0, bob=-1, scream=2, waves=2, hair=1),
           ban_frame(bal[1], t=0.2, scream=1)]
    save_enemy('banshee', 'attack', att, 64)
    save_enemy('banshee', 'take_damage', [ban_frame(bal[2], dx=-3, flash=(255, 255, 255), scream=1),
                                          ban_frame(bal[2], dx=-2, t=0.3, scream=1),
                                          ban_frame(bal[2], dx=-1, t=0.6)], 64)
    # death: a last shriek, then she collapses into a pale puddle of ectoplasm with her hair spread on the floor
    d = [ban_frame(bal[0], scream=3, waves=1, bob=-3, hair=2), ban_frame(bal[0], scream=3, bob=-1, t=0.5)]
    base = ban_frame(bal[0], t=0.5)
    for k, sy in enumerate((0.7, 0.42, 0.22)):
        bb = base.getbbox()
        sq = squash(base, sy, 57)
        sq = shift(sq, 0, 57 - (sq.getbbox()[3] - 1))
        a = np.array(sq)
        r2 = np.random.default_rng(k)
        inner = (a[:, :, 3] > 0) & ~((a[:, :, 0] == OUT[0]) & (a[:, :, 1] == OUT[1]) & (a[:, :, 2] == OUT[2]))
        a[(r2.random(a.shape[:2]) < 0.2 + 0.15 * k) & inner, :3] = (240, 250, 255)     # dissolving into light
        q = Pic(64, 64)
        q.paste(Image.fromarray(a), 0, 0)
        for i in range(4 + k * 2):        # ectoplasm spreading on the floor
            x = 32 + (i - (2 + k)) * 3
            q.p(x, 57, BAN_T1); q.p(x + 1, 57, BAN_T2)
        d.append(outline_same(q.im))
    q = Pic(64, 64)                       # puddle
    q.e(18, 54, 46, 58, BAN_T0); q.e(20, 54, 44, 57, BAN_T1); q.e(24, 54, 38, 56, BAN_T2)
    for i in range(5):                    # hair strands on the puddle
        q.l(26 + i * 2, 55, 22 + i * 3, 57, (226, 236, 246))
    d.append(outline_same(cut_below(q.im, 57)))
    save_enemy('banshee', 'death', d, 64)


# ================================================================== FIRE ELEMENTAL (drawn: living flame with magma-rock shoulders)
FE_STOPS = [(0.0, MAG0), (0.18, MAG1), (0.38, MAG2), (0.6, MAG3), (0.82, MAG4)]
YY, XX = np.mgrid[0:64, 0:64].astype(float)


def _cap(x0, y0, x1, y1, r, xx=XX, yy=YY):
    dx, dy = x1 - x0, y1 - y0
    L2 = dx * dx + dy * dy or 1e-6
    u = np.clip(((xx - x0) * dx + (yy - y0) * dy) / L2, 0, 1)
    d = np.hypot(xx - (x0 + u * dx), yy - (y0 + u * dy))
    return 1 - d / r


def _ell(cx, cy, rx, ry, xx=XX, yy=YY):
    return 1 - np.hypot((xx - cx) / rx, (yy - cy) / ry)


def fe_frame(t=0.0, lean=0.0, hand_f=(10, 34), hand_b=(-10, 36), ball=0, sc=1.0, flash=None, dx=0, eyes=1, base_dx=0, rocks=True):
    """Fire elemental facing right: a cracked magma-rock torso, head and arms, wreathed in flame, the lower body a
    swirl of fire on row 57. hand_f/hand_b: hands relative to (cx, 0)."""
    cx = 32 + dx
    ph = t * math.tau
    h = np.clip((57 - YY) / 45, 0, 1)
    xs = XX - lean * (57 - YY)
    ys = YY
    if sc != 1.0:
        xs = cx + (xs - cx) / sc
        ys = 57 + (ys - 57) / sc
    xf = xs - 1.2 * np.sin(YY * 0.45 + ph * 2) * h            # flames flicker, the rock does not
    E = lambda *a, f=False: _ell(*a, xx=xf if f else xs, yy=ys)
    C = lambda *a, f=False: _cap(*a, xx=xf if f else xs, yy=ys)
    sh_f, sh_b = (cx + 6, 30), (cx - 5, 30)
    hf = (cx + hand_f[0], hand_f[1]); hb = (cx + hand_b[0], hand_b[1])
    # rock body
    rock = np.max(np.stack([E(cx + 1, 34, 6.5, 6.0), C(cx - 4, 30, cx + 6, 30, 3.2), E(cx + 2, 22, 4.2, 4.6),
                            C(cx + 1, 38, cx + 1, 43, 3.6),
                            C(*sh_b, *hb, 2.4), E(*hb, 2.8, 2.8), C(*sh_f, *hf, 2.6), E(*hf, 3.0, 3.0)]), 0)
    # flames: a mane from the head, tongues on the shoulders and back, the lower body a swirling column
    fl = [C(cx + 1, 44, cx + base_dx, 55, 5.0, f=True), E(cx + base_dx, 55, 6.5, 3.0, f=True), C(cx + 1, 40, cx + 1, 46, 6.0, f=True)]
    for i, (ox, hgt) in enumerate(((-3, 8), (-1, 12), (2, 10), (4, 6))):
        top = 19 - hgt * (0.8 + 0.3 * math.sin(ph * 2 + i * 1.9))
        fl.append(C(cx + 2 + ox, 21, cx + 2 + ox - 3 - lean * 25 + math.sin(ph + i) * 1.5, top, 2.6, f=True))
    for (sx, sy), k in ((sh_f, 0), (sh_b, 1)):
        top = sy - 6 - 3 * (0.5 + 0.5 * math.sin(ph * 2 + k * 2.4))
        fl.append(C(sx, sy - 1, sx - 2 - lean * 12, top, 2.2, f=True))
    fl.append(C(cx - 5, 34, cx - 10 - lean * 20, 26 - 2 * math.sin(ph * 2 + 1), 2.4, f=True))   # back flame
    flame_ = np.max(np.stack(fl), 0)
    flame_ = flame_ + 0.18 * np.sin(XX * 1.3 + YY * 0.9 + ph) * np.sin(YY * 0.7 - ph * 2)
    halo = np.maximum(rock + 0.28, flame_)                    # a thin fire rim around the rock too
    v = np.clip(halo * 1.3, 0, 1)
    rgb = gmap(np.round(v * 4) / 4, [(0, MAG0), (0.25, MAG1), (0.5, MAG2), (0.75, MAG3), (1.0, MAG4)])
    m = halo > 0
    if ball:   # fireball forming in the front hand
        bh = _ell(hf[0] + 3, hf[1] - 1, ball, ball)
        m |= bh > 0
        bv = np.clip(0.3 + bh * 1.2, 0, 1)
        rgb = np.where((bh > 0)[..., None], gmap(np.round(bv * 4) / 4, [(0, MAG1), (0.5, MAG3), (1, MAG4)]), rgb)
    rk = rock > 0
    if rocks:
        lit = np.clip((rock - 0.15) * 2.2, 0, 1) - 0.25 * ((xs - cx) / 8) - 0.25 * ((ys - 30) / 10)
        rc = gmap(np.clip(lit, 0, 1), [(0, BAS1), (0.5, BAS2), (1, BAS3)])
        rgb = np.where(rk[..., None], rc, rgb)
        crack = (np.abs(np.sin(xs * 0.85 + ys * 0.35) + np.sin(ys * 1.05 - xs * 0.3 + 1.3)) < 0.16) & (rock > 0.25)
        rgb = np.where(crack[..., None], np.array(MAG3, float), rgb)
        core = (E(cx + 1, 34, 2.2, 2.0) > 0)
        rgb = np.where(core[..., None], np.array(MAG4, float), rgb)
    a = np.zeros((64, 64, 4), np.uint8)
    a[..., :3] = np.clip(rgb, 0, 255)
    a[..., 3] = np.where(m, 255, 0)
    a[58:] = 0
    p = Pic(64, 64)
    p.paste(Image.fromarray(a), 0, 0)
    if eyes:
        ex, ey = cx + 3 + lean * (57 - 22), 21
        ec = MAG4 if eyes == 1 else (255, 255, 255)
        p.r(ex - 1, ey, ex, ey, ec); p.r(ex + 2, ey, ex + 3, ey, ec)
        p.r(ex, ey + 3, ex + 2, ey + 3, MAG2)                 # mouth
    im = outline_same(p.im)
    if flash:
        im = tint(im, flash, 0.5)
    return im


@builder('fireelemental')
def make_fireelemental():
    F = fe_frame
    save_enemy('fireelemental', 'idle', [F(t=i / 6, hand_f=(10, 35 + (i % 3 == 1)), hand_b=(-10, 36 - (i % 3 == 2))) for i in range(6)], 64)
    save_enemy('fireelemental', 'movement', [F(t=i / 6, lean=0.12, base_dx=-3 + (i % 2), hand_f=(11, 34), hand_b=(-9, 38))
                                             for i in range(6)], 64)
    att = [F(t=0.0, hand_f=(6, 30), hand_b=(-11, 34), eyes=2),
           F(t=0.15, hand_f=(2, 24), hand_b=(-12, 32), ball=2, eyes=2, lean=-0.04),
           F(t=0.3, hand_f=(1, 20), hand_b=(-12, 31), ball=4, eyes=2, lean=-0.06),
           F(t=0.45, hand_f=(13, 28), hand_b=(-10, 35), ball=5, eyes=2, lean=0.08, dx=1),
           F(t=0.6, hand_f=(16, 31), hand_b=(-9, 36), eyes=2, lean=0.12, dx=2),
           F(t=0.8, hand_f=(12, 34), hand_b=(-10, 36), lean=0.04, dx=1)]
    save_enemy('fireelemental', 'attack', att, 64)
    save_enemy('fireelemental', 'take_damage', [F(t=0.1, sc=0.9, dx=-3, lean=-0.08, flash=(255, 255, 255)),
                                                F(t=0.3, sc=0.92, dx=-2, lean=-0.05), F(t=0.5, dx=-1)], 64)
    # death: flares up, flashes, bursts into embers that rain down and leave a smouldering heap of rock and ash
    d = [F(t=0.2, sc=1.12, eyes=2, hand_f=(10, 28), hand_b=(-12, 28)),
         F(t=0.4, sc=1.2, eyes=2, flash=(255, 240, 200), hand_f=(12, 24), hand_b=(-13, 24))]
    for k, (dist, fall) in enumerate(((12, 0.0), (18, 0.5), (22, 1.0))):
        p = Pic(64, 64)
        if k == 0:
            p.e(25, 22, 39, 40, MAG3); p.e(28, 26, 36, 36, MAG4)
        ember_burst(p, 32, 32, dist, 40 - k * 6, 3, fall, floor=57, size=2 if k < 2 else 1)
        if k >= 1:   # rock chunks thrown out
            r2 = random.Random(9)
            for i in range(5):
                x = 32 + r2.uniform(-1, 1) * (8 + k * 6)
                y = min(56, 32 + r2.uniform(-6, 2) + fall * fall * 24)
                p.r(x, y, x + 1, y + 1, BAS2); p.p(x, y, BAS3)
        d.append(outline_same(cut_below(p.im, 57)))
    for k in range(2):   # smouldering heap (lying on the floor)
        p = Pic(64, 64)
        p.e(22, 52, 42, 60, ASH1); p.e(25, 51, 39, 58, ASH2)
        r2 = random.Random(11)
        for i in range(6):
            x = r2.randint(22, 40); y = r2.randint(53, 56)
            p.poly([(x, y), (x + 2, y - 2), (x + 4, y), (x + 3, y + 2)], BAS1); p.p(x + 2, y, MAG2)
        for i in range(7 - k * 3):
            p.p(r2.randint(24, 40), r2.randint(52, 56), MAG3 if (i + k) % 2 else MAG4)
        d.append(outline_same(cut_below(p.im, 57)))
    save_enemy('fireelemental', 'death', d, 64)


# ================================================================== LAVA WORM (drawn: segmented worm of crusted magma)
LW_CRUST0, LW_CRUST1, LW_CRUST2, LW_CRUST3 = (34, 20, 22), (64, 36, 32), (96, 56, 44), (132, 84, 60)
TEETH = (240, 226, 196)


def lw_hole(p, cx=30, glow_=1.0, front=False, w=11):
    """Lava hole in the floor (row 57 is its lower edge). front=True draws only the near rim (over the body)."""
    if not front:
        p.e(cx - w, 52, cx + w, 57, LW_CRUST1)
        p.e(cx - w + 2, 53, cx + w - 2, 56, MAG2 if glow_ > 0.5 else (LW_CRUST0 if glow_ <= 0 else MAG1))
        if glow_ > 0.5:
            p.e(cx - w + 5, 54, cx + w - 5, 55, MAG3)
        p.l(cx - w + 1, 53, cx - 3, 52, LW_CRUST2)
    else:
        for x in range(cx - w + 1, cx + w):
            yy = 57 - round(1.2 * (1 - ((x - cx) / w) ** 2))
            p.l(x, yy, x, 57, LW_CRUST1)
            p.p(x, yy, LW_CRUST2 if (x % 3) else MAG2)


def lw_path(base, head, ctrl, n):
    pts = []
    for i in range(n):
        u = i / (n - 1)
        x = (1 - u) ** 2 * base[0] + 2 * u * (1 - u) * ctrl[0] + u * u * head[0]
        y = (1 - u) ** 2 * base[1] + 2 * u * (1 - u) * ctrl[1] + u * u * head[1]
        pts.append((x, y))
    return pts


def lw_segment(p, x, y, r, k):
    p.e(x - r, y - r, x + r, y + r, MAG2)                         # glowing seam (shows along the top edge)
    p.e(x - r, y - r + 1, x + r, y + r, LW_CRUST1)               # crust plate
    p.e(x - r + 1, y - r + 2, x + r - 2, y + r - 1, LW_CRUST2)
    p.l(x - r + 2, y - r + 2, x, y - r + 2, LW_CRUST3)
    if k % 2:
        p.p(x + 1, y - 1, MAG3)                                  # glowing spot


def lw_head(p, x, y, r, mouth=0.0, ang=0.0, eyes=1):
    """Head facing right (rotated by ang radians, negative = up); mouth 0..1 opens a toothy maw."""
    p.e(x - r, y - r, x + r, y + r, MAG2)
    p.e(x - r + 1, y - r, x + r - 1, y + r - 1, LW_CRUST1)
    p.e(x - r + 1, y - r, x + r - 2, y + r - 3, LW_CRUST2)
    p.p(x - r + 2, y - r + 2, LW_CRUST3)
    ca, sa = math.cos(ang), math.sin(ang)
    R = lambda u, v: (x + u * ca - v * sa, y + u * sa + v * ca)
    if mouth > 0:
        o = 1 + mouth * r * 0.9
        jaw = [R(r - 3, 0), R(r + 2, -o), R(r + 3, -o + 1), R(r + 3, o - 1), R(r + 2, o)]
        p.poly(jaw, MAG3)
        p.poly([R(r - 2, 0), R(r + 2, -o + 1.5), R(r + 2, o - 1.5)], MAG4)
        for k in range(3):                                       # teeth on both jaws
            t1 = R(r + 1 - k * 1.5, -o + 1 + k * 0.7)
            t2 = R(r + 1 - k * 1.5, o - 1 - k * 0.7)
            p.p(*t1, TEETH); p.p(*t2, TEETH)
    else:
        p.l(*R(r - 3, 0), *R(r + 1, 0), MAG3)
        p.p(*R(r, -1), TEETH); p.p(*R(r, 1), TEETH)
    if eyes:
        ec = MAG4 if eyes == 1 else (255, 255, 255)
        p.p(*R(1, -r + 2), ec); p.p(*R(2, -r + 2), ec)


def lw_frame(head=(31, 44), ctrl=None, mouth=0.0, ang=0.0, n=6, hole=True, flash=None, eyes=1, r0=6, rh=6, base=(30, 56)):
    p = Pic(64, 64)
    if hole:
        lw_hole(p, base[0])
    ctrl = ctrl or ((base[0] + head[0]) / 2, (base[1] + head[1]) / 2)
    pts = lw_path(base, head, ctrl, n)
    for i in range(n - 2, -1, -1):          # from the neck down: every lower plate overlaps the one above
        x, y = pts[i]
        r = r0 - (r0 - rh + 1) * i / max(1, n - 2)
        lw_segment(p, x, y, max(2, round(r)), i)
    lw_head(p, *pts[-1], rh, mouth, ang, eyes)
    if hole:
        lw_hole(p, base[0], front=True)
    im = outline_same(cut_below(p.im, 57))
    if flash:
        im = tint(im, flash, 0.5)
    return im


def lw_mound(phase, flash=None):
    """Burrowing: a low crust mound rippling along the floor, glowing cracks and sparks (all below row ~48)."""
    p = Pic(64, 64)
    p.e(12, 51, 52, 59, LW_CRUST1)
    p.e(14, 51, 50, 57, LW_CRUST2)
    for i in range(4):
        x = 16 + i * 9 + phase * 2
        hgt = 2 + round(2 * (0.5 + 0.5 * math.sin(phase * 1.6 + i * 1.7)))
        p.e(x - 4, 53 - hgt, x + 4, 55, LW_CRUST2)
        p.e(x - 3, 53 - hgt, x + 2, 53, LW_CRUST3)
        p.l(x - 2, 55 - hgt + 2, x + 1, 54, MAG2)
    for i in range(5):                                           # cracks
        x = 15 + i * 8 + (phase * 3) % 5
        p.l(x, 55, x + 2, 53, MAG3)
    r2 = random.Random(phase)
    for i in range(4):                                           # sparks / dirt flicked up
        p.p(14 + r2.randint(0, 36), 46 + r2.randint(0, 4), MAG3 if i % 2 else LW_CRUST2)
    im = outline_same(cut_below(p.im, 57))
    if flash:
        im = tint(im, flash, 0.5)
    return im


@builder('lavaworm')
def make_lavaworm():
    L = lw_frame
    idle = [L(head=(31 + dx, 44 + dy), mouth=m, n=4, rh=5, r0=5) for dx, dy, m in
            ((0, 0, 0), (1, -1, 0.2), (2, -1, 0.4), (1, 0, 0.2), (0, 0, 0), (-1, 0, 0))]
    save_enemy('lavaworm', 'idle', idle, 64)
    save_enemy('lavaworm', 'movement', [lw_mound(i) for i in range(6)], 64)
    att = [L(head=(31, 46), n=3, rh=5, r0=5, eyes=2),
           L(head=(30, 34), ctrl=(26, 46), n=5, rh=6, eyes=2, ang=-0.4),
           L(head=(28, 20), ctrl=(20, 40), n=8, rh=6, mouth=0.6, ang=-0.6, eyes=2),
           L(head=(44, 26), ctrl=(24, 30), n=9, rh=6, mouth=1.0, ang=0.2, eyes=2),
           L(head=(48, 34), ctrl=(30, 28), n=9, rh=6, mouth=0.0, ang=0.4, eyes=2),
           L(head=(38, 40), ctrl=(30, 36), n=6, rh=6, mouth=0.2),
           L(head=(31, 44), n=4, rh=5, r0=5)]
    save_enemy('lavaworm', 'attack', att, 64)
    save_enemy('lavaworm', 'take_damage', [L(head=(26, 42), ctrl=(30, 46), n=4, rh=5, r0=5, mouth=0.5, ang=-0.5, flash=(255, 255, 255)),
                                           L(head=(27, 43), n=4, rh=5, r0=5, mouth=0.4, ang=-0.3),
                                           L(head=(30, 44), n=4, rh=5, r0=5)], 64)
    # death: a last screech, the body flops over and sinks; the hole cools to a dark crust
    d = [L(head=(30, 30), ctrl=(24, 44), n=7, rh=6, mouth=1.0, ang=-1.0, eyes=2),
         L(head=(40, 38), ctrl=(30, 34), n=7, rh=6, mouth=0.5, ang=0.8, eyes=1),
         L(head=(42, 48), ctrl=(34, 42), n=6, rh=6, mouth=0.2, ang=1.0, eyes=0),
         L(head=(36, 52), ctrl=(32, 52), n=4, rh=5, r0=5, mouth=0.0, eyes=0)]
    for k in range(2):
        p = Pic(64, 64)
        lw_hole(p, 30, glow_=0.3 if k == 0 else 0)
        p.e(22, 51, 38, 55, LW_CRUST2)                        # the cooled hump of the worm's back
        p.e(24, 51, 34, 53, LW_CRUST3)
        if k == 0:
            p.ps([(26, 54), (31, 53), (35, 54)], MAG2)
        for i in range(3):                                    # smoke
            p.p(28 + i * 3, 46 - i - k * 3, ASH2); p.p(29 + i * 3, 45 - i - k * 3, ASH3)
        d.append(outline_same(cut_below(p.im, 57)))
    save_enemy('lavaworm', 'death', d, 64)


# ================================================================== FIRE BOSS: ASKJÄTTEN (TinyRPG Jumping-Demon, recoloured to basalt and magma)
JD_MAP = {(255, 219, 148): (128, 112, 106), (255, 146, 74): (92, 76, 76), (222, 109, 33): (64, 52, 56),
          (181, 73, 0): (44, 34, 40), (148, 36, 0): (70, 34, 32), (74, 0, 0): (44, 20, 22),
          (0, 0, 0): (30, 14, 16), (74, 73, 222): (255, 255, 230), (255, 255, 255): (255, 240, 200)}
JD_FW, JD_FH = 101, 98


def _jd_cracks():
    r2 = random.Random(17)
    pts = [(r2.uniform(0, JD_FW), r2.uniform(0, JD_FH)) for _ in range(46)]
    _, d1, d2 = voronoi_cells(JD_FW, JD_FH, pts)
    keep_ = glow((np.random.default_rng(4).random((JD_FH, JD_FW)) > 0.5).astype(float), 3.0) > 0.5   # break up the net
    return ((d2 - d1) < 0.9) & keep_


JD_CRACKS = _jd_cracks()


def jd_src():
    """The six frames on a taller canvas (room for flames above), ground shadow removed, recoloured."""
    im = Image.open(TRPG + 'spritesheets/Jumping-Demon.png').convert('RGBA')
    out = []
    for i in range(6):
        f = im.crop((i * JD_FW, 0, (i + 1) * JD_FW, JD_FH))
        a = np.array(f)
        blk = (a[:, :, 0] == 0) & (a[:, :, 1] == 0) & (a[:, :, 2] == 0) & (a[:, :, 3] > 0)
        col = (a[:, :, 3] > 0) & ~blk
        # the ground shadow: black pixels in the lowest rows that do not touch the body
        near = np.zeros_like(col)
        for dy in (-2, -1, 0, 1, 2):
            for dx in (-2, -1, 0, 1, 2):
                near |= np.roll(np.roll(col, dy, 0), dx, 1)
        sh = blk.copy()
        sh[:78] = False
        sh &= ~near
        low = np.nonzero(col.any(1))[0].max()
        sh[low + 1:] |= blk[low + 1:]
        for y in range(low - 3, low + 1):   # shadow pixels beside the feet: no body pixel on both sides
            for x in np.nonzero(blk[y])[0]:
                if not (col[y, max(0, x - 3):x].any() and col[y, x + 1:x + 4].any()):
                    sh[y, x] = True
        a[sh] = 0
        g = recolor(Image.fromarray(a), JD_MAP)
        ga = np.array(g)
        ga[(np.array(Image.fromarray(a))[:, :, 3] > 0) & blk & ~sh & (np.arange(JD_FH)[:, None] < np.nonzero(col.any(1))[0].min() + 34)
           & (np.abs(np.arange(JD_FW)[None, :] - 50) < 9), :3] = MAG3          # the glowing maw
        # magma glowing through cracks in the basalt hide (fixed to the body, wobbling a little per frame)
        cr = JD_CRACKS
        body = (ga[:, :, 3] > 0) & (ga[:, :, :3].sum(2) < 260)
        inner = body & np.roll(body, 1, 0) & np.roll(body, -1, 0) & np.roll(body, 1, 1) & np.roll(body, -1, 1)
        ga[cr & inner, :3] = MAG2
        ga[cr & inner & (np.roll(cr, 1, 1) & np.roll(cr, -1, 1)), :3] = MAG3
        g = Image.fromarray(ga)
        c = Image.new('RGBA', (JD_FW + 40, JD_FH + 24), (0, 0, 0, 0))
        c.paste(g, (20, 24), g)
        out.append(c)
    return out


def jd_flames(im, t, k=1.0):
    """Flickering flames along the top of the head, horns and shoulder spikes."""
    a = np.array(im)[:, :, 3] > 0
    p = Pic(im.width, im.height)
    xs = np.nonzero(a.any(0))[0]
    if not len(xs):
        return im
    x0, x1 = xs.min(), xs.max()
    top = np.array([np.nonzero(a[:, x])[0].min() if a[:, x].any() else 10 ** 6 for x in range(im.width)])
    ymin = top[x0:x1 + 1].min()
    for x in range(x0 + 2, x1 - 1):
        y = top[x]
        # flames only on the peaks (head, horns, shoulder spikes)
        if y > ymin + 22 or y != top[max(0, x - 3):x + 4].min() or (x > x0 + 2 and top[x - 1] == y and top[x - 2] == y):
            continue
        # only tall parts: skip columns that are much lower than the head top
        hgt = k * (3 + 4 * (0.5 + 0.5 * math.sin(t * math.tau * 2 + x * 0.9))) * (1.4 if abs(x - (x0 + x1) / 2) < 8 else 0.8)
        hgt = int(round(hgt))
        for i in range(hgt):
            u = i / max(1, hgt - 1)
            xx = x + round(math.sin(t * math.tau + x + i * 0.6) * u)
            c = MAG4 if u < 0.3 else (MAG3 if u < 0.65 else MAG2)
            p.p(xx, y - i, c)
            if i < hgt - 2:
                p.p(xx + 1, y - i, MAG2 if u < 0.5 else MAG1)
    p.paste(im, 0, 0)
    return p.im


def jd_hands(im):
    """Approximate positions of the two fists: lowest pixels near the left / right edges."""
    a = np.array(im)[:, :, 3] > 0
    xs = np.nonzero(a.any(0))[0]
    res = []
    for xa, xb in ((xs.min(), xs.min() + 10), (xs.max() - 10, xs.max())):
        sub = a[:, xa:xb + 1]
        ys = np.nonzero(sub.any(1))[0]
        res.append(((xa + xb) // 2, ys.max() - 3))
    return res


def fireball(p, x, y, r, t=0.0):
    p.e(x - r - 1, y - r - 1, x + r + 1, y + r + 1, MAG1)
    p.e(x - r, y - r, x + r, y + r, MAG2)
    p.e(x - r + 1, y - r + 1, x + r - 1, y + r - 2, MAG3)
    if r >= 3:
        p.e(x - r + 2, y - r + 2, x + r - 3, y + r - 4, MAG4)
    for i in range(3):   # licks
        ang = -math.pi / 2 + (i - 1) * 0.6 + math.sin(t * math.tau + i) * 0.2
        for j in range(2 + r // 2):
            p.p(x + math.cos(ang) * (r + j), y + math.sin(ang) * (r + j), MAG3 if j < 2 else MAG2)


@builder('boss')
def make_boss():
    src = jd_src()
    H_ = src[0].height
    feet = max(np.nonzero(np.array(f)[:, :, 3].any(1))[0].max() for f in (src[0], src[5]))
    ground = lambda f: shift(f, 0, feet - np.nonzero(np.array(f)[:, :, 3].any(1))[0].max())
    for j in (0, 1, 5):                     # all standing frames share one bottom row
        src[j] = ground(src[j])
    lift = 14   # the jump is lowered a little so the strips stay compact
    idle = [jd_flames(src[j], i / 6) for i, j in enumerate((0, 0, 1, 1, 1, 0))]
    # attack: crouch, leap, fall with the arms spread, land in a burst of lava and dust
    att = [jd_flames(src[1], 0.1), jd_flames(shift(src[2], 0, lift), 0.3, 1.3), jd_flames(shift(src[3], 0, lift), 0.5, 1.5),
           jd_flames(shift(src[4], 0, lift // 2), 0.7, 1.3), jd_flames(ground(src[5]), 0.9)]
    land = Pic(src[0].width, H_)
    land.paste(jd_flames(src[0], 0.0, 1.4), 0, 0)
    cxm = src[0].width // 2
    for k in range(9):                                    # lava splash ring at the feet
        ang = math.pi + k / 8 * math.pi
        for r_ in (18, 24, 30):
            x = cxm + math.cos(ang) * r_ * 1.4
            y = feet + math.sin(ang) * r_ * 0.25
            land.p(x, y, MAG3 if r_ < 30 else MAG2); land.p(x + 1, y, MAG2)
    for k in range(8):                                    # dust puffs
        x = cxm + (k - 3.5) * 11
        land.e(x - 3, feet - 4, x + 3, feet, ASH2); land.e(x - 2, feet - 4, x + 1, feet - 2, ASH3)
    att.append(land.im)
    att.append(jd_flames(src[0], 0.2))
    # cast: arms spread, the mouth blazes and fireballs gather over both fists
    base = ground(src[5])
    cast = []
    for k, r in enumerate((0, 2, 3, 5, 6)):
        p = Pic(base.width, H_)
        p.paste(jd_flames(base, k / 5, 1.0 + 0.15 * k), 0, 0)
        if r:
            for hx, hy in jd_hands(base):
                fireball(p, hx, hy - 6 - r, r, k / 5)
        if k == 4:
            for i in range(10):
                ang = i / 10 * math.tau
                p.p(cxm + math.cos(ang) * 40, feet - 30 + math.sin(ang) * 26, MAG3)
        cast.append(p.im)
    i0 = jd_flames(src[0], 0.3)
    hurt = [tint(shift(i0, -4, 0), (255, 255, 255), 0.5), shift(jd_flames(src[1], 0.5), -3, 0), shift(i0, -1, 0)]
    # death: rears up, sags, slumps and crumbles to a heap of cooling rock
    d = [jd_flames(ground(src[5]), 0.1, 1.6), tint(ground(src[5]), (255, 230, 180), 0.35), squash(src[1], 0.8, feet),
         squash(src[1], 0.55, feet)]
    def heap(glow_):
        p = Pic(src[0].width, H_)
        r2 = random.Random(5)
        for i in range(26):
            x = cxm + r2.uniform(-30, 30)
            hh = 14 * (1 - abs(x - cxm) / 34)
            y = feet - r2.uniform(0, max(1, hh))
            w = r2.randint(3, 7)
            p.poly([(x - w, y + 2), (x - w + 2, y - w // 2), (x + w - 1, y - w // 2 - 1), (x + w, y + 2)],
                   (62, 50, 54) if i % 3 else (90, 74, 74))
            p.l(x - w + 2, y - w // 2, x + w - 2, y - w // 2 - 1, (128, 112, 106))
            if glow_ and i % 2 == 0:
                p.p(x, y, MAG2 if glow_ < 2 else MAG3); p.p(x + 1, y + 1, MAG1)
        return cut_below(p.im, feet)
    d += [heap(2), heap(1), heap(0)]
    allf = idle + att + cast + hurt + d
    bb = None
    for im in allf:
        b = im.getbbox()
        bb = b if bb is None else (min(bb[0], b[0]), min(bb[1], b[1]), max(bb[2], b[2]), max(bb[3], b[3]))
    bb = (bb[0] - 1, bb[1] - 1, bb[2] + 1, feet + 2)
    W_, Hh = bb[2] - bb[0], bb[3] - bb[1]
    if Hh != W_:                            # square frames (the game splits a strip by its height)
        n_ = max(W_, Hh)
        bb = (bb[0] - (n_ - W_) // 2, bb[1] - (n_ - Hh), bb[0] - (n_ - W_) // 2 + n_, bb[3])
        W_, Hh = n_, n_

    def save_b(name, frames):
        out = Image.new('RGBA', (W_ * len(frames), Hh), (0, 0, 0, 0))
        for i, f in enumerate(frames):
            out.paste(hard(outline_same(f.crop(bb))), (i * W_, 0))
        save(out, G_OUT + f'boss_flame_{name}.png', len(frames))
    save_b('idle', idle)
    save_b('attack', att)
    save_b('cast', cast)
    save_b('hurt', hurt)
    save_b('death', d)
    print('boss_flame frame', (W_, Hh))


# ================================================================== TEXTURES (half-res, x2 nearest, palettized like biome-textures)
def finish(rgb, name, colors=48):
    im = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), 'RGB')
    im = im.resize((im.width * 2, im.height * 2), Image.NEAREST)
    save(im.quantize(colors, method=Image.Quantize.MEDIANCUT).convert('RGB'), W_OUT + name)


def crack_mask(w, h, seed, n=3, steps=14, wrap=True, start=None, spread=0.6, step=2.0, branch=0.25):
    """Jagged crack lines (random walks, mostly downward) drawn into a half-res mask."""
    r2 = random.Random(seed)

    def fn(d, ox, oy):
        rr = random.Random(seed)
        for i in range(n):
            x, y = start if start else (rr.uniform(0, w), rr.uniform(0, h))
            ang = rr.uniform(-0.5, 0.5) + math.pi / 2 if not start else rr.uniform(0, math.tau)
            stack = [(x, y, ang, steps)]
            while stack:
                x, y, ang, k = stack.pop()
                for _ in range(k):
                    nx, ny = x + math.cos(ang) * step, y + math.sin(ang) * step
                    d.line([(x + ox, y + oy), (nx + ox, ny + oy)], fill=255)
                    x, y = nx, ny
                    ang += rr.uniform(-spread, spread)
                    if rr.random() < branch and k > 4:
                        stack.append((x, y, ang + rr.choice((-1, 1)) * rr.uniform(0.6, 1.2), k // 2))
    return mask_draw(w, h, fn, wrap=wrap) > 0.4


def tex_wall_obsidian():
    w, h = 32, 64
    r2 = random.Random(31)
    pts = [(r2.uniform(0, w), r2.uniform(0, h)) for _ in range(14)]
    idx, d1, d2 = voronoi_cells(w, h, pts, sy=0.55)                 # tall glassy facets
    tone = np.array([r2.uniform(0.25, 0.8) for _ in pts])[idx]
    yy, xx = np.mgrid[0:h, 0:w]
    grain = tile_lum(C64 + 'Rocks/Materials/rock_wall_04.jpg', (w, h), (1, 2))
    # each facet has a gradient (a flat glassy plane lit from the upper left)
    ang = np.array([r2.uniform(0, math.tau) for _ in pts])[idx]
    v = tone + 0.25 * np.cos(ang) * ((xx - np.array([p[0] for p in pts])[idx]) / 8) + (grain - 0.5) * 0.12
    v = np.clip(v, 0, 1)
    rgb = gmap(v, [(0, OB0), (0.4, OB1), (0.75, OB2), (1, OB3)])
    edge_ = (d2 - d1) < 0.8
    rgb[edge_] = OB0
    lit = edge_ & ~np.roll(edge_, 1, 1)
    rgb = blend(rgb, np.roll(lit, 1, 1) & ~edge_, (130, 110, 170), 0.6)    # sharp glassy edge highlight
    # glossy streaks
    st = ((xx + yy // 2 + np.array([int(p[1]) for p in pts])[idx]) % 11 == 0) & (v > 0.55) & ~edge_
    rgb = blend(rgb, st, (150, 130, 190), 0.55)
    # glowing cracks
    cm = crack_mask(w, h, 7, n=2, steps=14, step=2.2, branch=0.1, spread=0.5)
    g = glow(cm.astype(float), 1.0)
    rgb = rgb + g[..., None] * np.array((120, 36, 6))
    rgb[cm] = MAG2
    core = cm & np.roll(cm, 1, 0) & np.roll(cm, -1, 0)
    rgb[core] = MAG3
    # heat from below
    rgb = rgb + (np.clip((yy - 48) / 16, 0, 1) ** 1.6)[..., None] * np.array((60, 18, 4))
    finish(rgb, 'wall_obsidian.png')


def tex_floor_ash():
    w = h = 32
    lum = tile_lum(C64 + 'Ground/Materials/sand_01.jpg', (w, h), (1, 1))
    lum2 = tile_lum(C64 + 'Ground/Materials/gravel_10.jpg', (w, h), (2, 2))
    v = np.clip(lum * 0.6 + lum2 * 0.4, 0, 1)
    rgb = gmap(v, [(0, ASH0), (0.4, ASH1), (0.75, ASH2), (1, ASH3)])
    rnd = np.random.default_rng(5)
    charred = rnd.random((h, w)) < 0.03
    rgb[charred] = (34, 30, 32)
    emb = (rnd.random((h, w)) < 0.018) & (v < 0.5)
    rgb = rgb + glow(emb.astype(float), 0.8)[..., None] * np.array((140, 40, 6))
    rgb[emb] = MAG3
    rgb[(rnd.random((h, w)) < 0.006)] = MAG4
    finish(rgb, 'floor_ash.png', 32)


def hex_cells(w, h, sx=8, sy=7):
    pts = []
    for j in range(round(h / sy)):
        for i in range(round(w / sx)):
            pts.append((i * sx + (sx / 2 if j % 2 else 0) + 0.5, j * sy + 0.5))
    return pts


def tex_floor_basalt():
    w = h = 32
    pts = hex_cells(w, h, 8, 8)
    idx, d1, d2 = voronoi_cells(w, h, pts)
    r2 = random.Random(4)
    tone = np.array([r2.uniform(0.35, 0.8) for _ in pts])[idx]
    grain = tile_lum(C64 + 'Rocks/Materials/rock_wall_04.jpg', (w, h), (2, 2))
    v = np.clip(tone + (grain - 0.5) * 0.25 - (d1 / 6) * 0.15, 0, 1)
    rgb = gmap(v, [(0, BAS0), (0.35, BAS1), (0.7, BAS2), (1, BAS3)])
    grout = (d2 - d1) < 1.1
    rgb[grout] = (14, 10, 12)
    lit = ~grout & np.roll(grout, 1, 0)
    rgb = blend(rgb, lit, (110, 96, 92), 0.5)
    sh = ~grout & np.roll(grout, -1, 0)
    rgb = blend(rgb, sh, BAS0, 0.5)
    rnd = np.random.default_rng(9)
    rgb[(rnd.random((h, w)) < 0.01) & ~grout] = MAG2         # rare embers in the joints
    finish(rgb, 'floor_basalt.png')


def tex_floor_pit():
    """The tile has fallen away: a black shaft with a ragged rim of broken basalt along the tile edges."""
    w = h = 32
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    grain = tile_lum(C64 + 'Rocks/Materials/rock_wall_04.jpg', (w, h), (2, 2))
    rim = gmap(np.clip(0.5 + (grain - 0.5) * 0.5, 0, 1), [(0, BAS1), (0.5, BAS2), (1, BAS3)])
    r2 = random.Random(8)
    # rim width per edge varies along the edge (broken pieces)
    def jag(n, seed):
        rr = random.Random(seed)
        return np.array([2 + rr.choice((0, 0, 1, 1, 2, 3)) for _ in range(n)])
    top, bot, lef, rig = jag(w, 1), jag(w, 2), jag(h, 3), jag(h, 4)
    hole = (yy >= top[xx.astype(int)]) & (yy < h - bot[xx.astype(int)]) & (xx >= lef[yy.astype(int)]) & (xx < w - rig[yy.astype(int)])
    # inside: the far (upper) wall of the shaft is faintly lit, then black
    dtop = yy - top[xx.astype(int)]
    inner = gmap(np.clip(dtop / 9, 0, 1), [(0, (44, 34, 36)), (0.35, (16, 10, 12)), (1, (3, 1, 3))])
    rgb = np.where(hole[..., None], inner, rim)
    lip = hole & ~(np.roll(hole, 1, 0) & np.roll(hole, -1, 0) & np.roll(hole, 1, 1) & np.roll(hole, -1, 1))
    rgb = blend(rgb, ~hole & np.roll(hole, -1, 0), (12, 8, 10), 0.8)      # shadow under the near lip
    rgb = blend(rgb, ~hole & np.roll(hole, 1, 0), (120, 104, 98), 0.6)     # broken edge catching light
    rgb[(xx == 0) | (yy == 0)] = (14, 10, 12)                              # neighbouring tiles' grout
    rnd = np.random.default_rng(3)
    rgb[(rnd.random((h, w)) < 0.03) & hole & (dtop > 2) & (dtop < 6)] = BAS1   # crumbs falling
    dist = np.hypot(xx - 15.5, yy - 17)
    rgb = rgb + (np.clip(1 - dist / 7, 0, 1) ** 2 * hole)[..., None] * np.array((40, 8, 0))   # lava far below
    finish(rgb, 'floor_pit.png', 32)


def tex_floor_crack():
    w = h = 32
    yy, xx = np.mgrid[0:h, 0:w]
    grain = tile_lum(C64 + 'Rocks/Materials/rock_wall_04.jpg', (w, h), (2, 2))
    v = np.clip(0.55 + (grain - 0.5) * 0.35, 0, 1)
    rgb = gmap(v, [(0, BAS0), (0.4, BAS1), (0.75, BAS2), (1, BAS3)])
    border = (xx == 0) | (yy == 0)
    rgb[border] = (14, 10, 12)
    rgb[(xx == 1) & ~border] = rgb[(xx == 1) & ~border] * 1.25
    rgb[(yy == 1) & ~border] = rgb[(yy == 1) & ~border] * 1.25
    # star-shaped fracture from the middle, the pieces slightly offset in tone
    cm = crack_mask(w, h, 5, n=1, steps=9, wrap=False, start=(16, 16), spread=0.4, step=1.6, branch=0.35)
    for k in range(4):
        cm |= crack_mask(w, h, 40 + k, n=1, steps=7, wrap=False, start=(16 + k % 2, 16 - k // 2), spread=0.45, step=1.7, branch=0.3)
    rgb = blend(rgb, glow(cm.astype(float), 0.9) > 0.15, BAS0, 0.4)
    rgb[cm] = (8, 4, 6)
    lipc = ~cm & np.roll(cm, 1, 0)
    rgb = blend(rgb, lipc, (120, 104, 98), 0.45)
    deep = cm & (np.hypot(xx - 16, yy - 16) < 3)
    rgb[deep] = (150, 60, 18)
    # loose chips
    rnd = np.random.default_rng(2)
    rgb[(rnd.random((h, w)) < 0.02) & ~cm] = BAS3
    finish(rgb, 'floor_crack.png', 32)


def tex_boss_volcano():
    w, h = 32, 64
    mortar, bid = P3.brick_mask(w, h, 6, 8, 3)
    grain = tile_lum(C64 + 'Rocks/Materials/rock_wall_04.jpg', (w, h), (1, 2))
    r2 = np.random.default_rng(3)
    tone = {b: r2.uniform(0.35, 0.8) for b in np.unique(bid)}
    v = np.clip(np.vectorize(tone.get)(bid) + (grain - 0.5) * 0.35, 0, 1)
    v[~mortar & np.roll(mortar, 1, 1)] += 0.12
    v[~mortar & np.roll(mortar, -1, 0)] -= 0.15
    rgb = gmap(np.clip(v, 0, 1), [(0, BAS0), (0.4, BAS1), (0.75, BAS2), (1, BAS3)])
    # magma seeping through the mortar
    yy, xx = np.mgrid[0:h, 0:w]
    seep = mortar & (r2.random((h, w)) < 0.2)
    rgb[mortar] = (22, 10, 10)
    rgb = rgb + glow(seep.astype(float), 0.8)[..., None] * np.array((80, 24, 4))
    rgb[seep] = MAG1
    # carved round seal with a glowing flame rune
    def seal(d, ox, oy):
        d.ellipse((5 + ox, 18 + oy, 26 + ox, 39 + oy), fill=255)
    sm = mask_draw(w, h, seal, wrap=False) > 0.5
    stone = gmap(tile_lum(C64 + 'Rocks/Materials/rock_wall_04.jpg', (w, h), (1, 2)) * 0.4 + 0.3, [(0, OB1), (1, OB2)])
    rgb[sm] = stone[sm]
    rgb[edge(sm)] = (10, 6, 10)
    def flame_rune(d, ox, oy):
        cx, cy = 15.5 + ox, 29 + oy
        d.polygon([(cx, cy - 8), (cx + 4, cy - 1), (cx + 3, cy + 5), (cx, cy + 7), (cx - 3, cy + 5), (cx - 4, cy - 1)], fill=255)
        d.polygon([(cx, cy - 2), (cx + 2, cy + 2), (cx, cy + 5), (cx - 2, cy + 2)], fill=0)
    fm = mask_draw(w, h, flame_rune, wrap=False) > 0.4
    rgb = rgb + glow(fm.astype(float), 1.6)[..., None] * np.array((150, 60, 10))
    rgb[fm] = MAG3
    # lava drips from the top and heat glow from below
    for x in (3, 11, 22, 28):
        ln = int(r2.integers(3, 9))
        rgb[0:ln, x] = MAG2
        rgb[ln - 1, x] = MAG3
    rgb = rgb + (np.clip((yy - 44) / 20, 0, 1) ** 1.4)[..., None] * np.array((70, 22, 4))
    finish(rgb, 'wall_boss_volcano.png')

    # floor: dark basalt slabs 2x2 split by glowing lava channels, a fire rune in each slab
    w = h = 32
    lum = tile_lum(C64 + 'Rocks/Materials/rock_wall_04.jpg', (w, h), (2, 2))
    yy, xx = np.mgrid[0:h, 0:w]
    checker = ((xx // 16) + (yy // 16)) % 2
    a = gmap(lum * 0.4 + 0.4, [(0, BAS0), (1, BAS2)])
    b = gmap(lum * 0.4 + 0.3, [(0, BAS0), (1, BAS1)])
    rgb = np.where(checker[..., None] == 0, a, b)
    chan = (xx % 16 == 0) | (yy % 16 == 0)
    rgb = rgb + glow(chan.astype(float), 0.8)[..., None] * np.array((90, 28, 4))
    rgb[chan] = MAG1
    rgb[chan & ((xx + yy) % 5 == 0)] = MAG2
    def runes(d, ox, oy):
        for cx_, cy_ in ((8, 8), (24, 24)):
            cx_ += ox; cy_ += oy
            d.polygon([(cx_, cy_ - 4), (cx_ + 2, cy_), (cx_ + 2, cy_ + 2), (cx_, cy_ + 3), (cx_ - 2, cy_ + 2), (cx_ - 2, cy_)], outline=255)
    rm = mask_draw(w, h, runes) > 0.4
    rgb = blend(rgb, rm, MAG1, 0.8)
    finish(rgb, 'floor_boss_volcano.png')


@builder('textures')
def make_textures():
    tex_wall_obsidian(); tex_floor_ash(); tex_floor_basalt(); tex_floor_pit(); tex_floor_crack(); tex_boss_volcano()


# ================================================================== PROPS
strip = P2.strip
SNOW1, SNOW2 = P3.SNOW1, P3.SNOW2


def save_prop(name, frames):
    return save(strip(frames), G_OUT + f'prop_{name}.png', len(frames))


def campfire_frame(k):
    p = Pic(34, 34)
    base = 32
    r2 = random.Random(k)
    # flames (behind the front logs)
    for i, (dx, hgt) in enumerate(((-6, 9), (-2, 16), (2, 13), (6, 8), (0, 10))):
        hh = hgt + (2 if (i + k) % 2 else -1) + (1 if (i + k) % 4 == 3 else 0)
        P2.flame(p, 17 + dx, base - 6, hh, lean=(-1 if (i + k) % 3 == 0 else 1), wide=hh > 6)
    p.e(11, base - 10, 23, base - 4, F2)
    p.e(13, base - 9, 21, base - 5, F3)
    # crossed logs
    p.l(4, base - 2, 27, base - 8, W0, 4); p.l(5, base - 3, 26, base - 9, W3)
    p.l(6, base - 8, 30, base - 2, W1, 4); p.l(7, base - 9, 29, base - 3, W4)
    p.e(26, base - 10, 29, base - 6, (200, 140, 90)); p.p(27, base - 8, W2)      # cut ends
    p.e(4, base - 10, 7, base - 6, (200, 140, 90)); p.p(5, base - 8, W2)
    # ring of stones
    for i, x in enumerate(range(3, 31, 4)):
        c = (S2, S3, S1)[i % 3]
        p.e(x - 2, base - 3, x + 2, base, c)
        p.p(x - 1, base - 3, S4)
    # embers
    for _ in range(3):
        p.p(r2.randint(10, 24), r2.randint(base - 26, base - 16), F2 if r2.random() < 0.5 else F3)
    p.outline()
    return p.im


def questboard():
    p = Pic(34, 40)
    p.r(4, 6, 6, 39, W1); p.r(27, 6, 29, 39, W1)                  # posts
    p.l(5, 6, 5, 39, W2); p.l(28, 6, 28, 39, W2)
    p.poly([(1, 7), (17, 0), (32, 7), (32, 9), (1, 9)], W1)       # little roof
    p.l(2, 7, 17, 1, W3); p.l(17, 1, 31, 7, W2)
    p.r(2, 10, 31, 30, W2)                                       # board
    for y in range(12, 30, 4):
        p.l(3, y, 30, y, W1)
    p.r(2, 10, 31, 10, W3)
    papers = [(4, 12, 11, 22, PAPER2), (13, 11, 20, 19, PAPER1), (22, 13, 29, 24, PAPER2), (11, 21, 19, 28, PAPER1)]
    for x0, y0, x1, y1, c in papers:
        p.r(x0 + 1, y0 + 1, x1 + 1, y1 + 1, W0)                  # shadow
        p.r(x0, y0, x1, y1, c)
        for y in range(y0 + 2, y1 - 1, 2):
            p.l(x0 + 1, y, x1 - 1 - (y % 3), y, PAPER0)
        p.p((x0 + x1) // 2, y0, I1)                              # nail
    p.e(24, 21, 26, 23, BL1); p.p(24, 21, BL2)                    # wax seal
    p.r(10, 31, 23, 32, W1)                                      # cross brace
    p.outline()
    return p.im


RUNE_GLOW = ((40, 110, 170), (90, 200, 255), (210, 250, 255))


def runestone(on):
    p = Pic(22, 30)
    base = 29
    if on:   # glow halo around the rune
        p.e(4, 4, 17, 21, (30, 70, 110))
    p.poly([(4, base), (3, 12), (5, 4), (10, 1), (15, 3), (18, 10), (17, base)], S2)
    p.poly([(5, base), (4, 12), (6, 5), (10, 2), (11, 2), (8, 8), (7, base)], S3)
    p.l(16, 6, 17, 20, S1); p.r(13, base - 2, 17, base, S1)
    p.r(2, base - 1, 19, base, (52, 70, 46))                     # grass / moss at the foot
    p.ps([(6, 9), (14, 18), (12, 24)], (70, 92, 60))
    c0, c1, c2 = RUNE_GLOW
    col = c2 if on else c0
    # rune: a vertical stave with two branches (like ᛉ) and a dot
    p.l(10, 8, 10, 22, col); p.l(10, 13, 7, 9, col); p.l(10, 13, 13, 9, col); p.p(10, 25, col)
    if on:
        for x, y in ((9, 8), (11, 22), (6, 9), (14, 9)):
            p.p(x, y, c1)
        for x, y in ((5, 6), (16, 14), (4, 19), (17, 4)):
            p.p(x, y, c1)
    p.outline()
    return p.im


def recolor_barrel(mapping, top_fuse=True):
    im = Image.open(G_OUT + 'prop_barrel_red.png').convert('RGBA')
    return recolor(im, mapping)


def barrel_poison():
    gmap_ = {(62, 14, 18): (24, 56, 26), (138, 32, 32): (54, 120, 44), (208, 76, 56): (120, 190, 70), (98, 22, 26): (36, 86, 34),
             (174, 46, 40): (80, 150, 56), (104, 46, 34): (50, 64, 30), (134, 64, 44): (70, 84, 40), (86, 36, 28): (40, 52, 26),
             (236, 196, 64): (210, 240, 110), (176, 128, 36): (150, 190, 60), (255, 192, 72): (200, 255, 140),
             (255, 242, 176): (230, 255, 200), (236, 116, 40): (150, 220, 90)}
    im = recolor_barrel(gmap_)
    p = Pic(im.width, im.height + 2)
    a = np.array(im)
    a[:5] = 0                                    # no fuse on top
    p.paste(Image.fromarray(a), 0, 2)
    b = Image.fromarray(a).getbbox()
    top = b[1] + 2
    p.r(4, top, im.width - 5, top + 1, G2)       # ooze on the lid
    for x, ln in ((5, 4), (9, 2), (16, 6), (20, 3)):
        p.l(x, top + 1, x, top + 1 + ln, G2); p.p(x, top + 1 + ln, G3)
    # skull on the label
    cx, cy = im.width // 2, im.height // 2 + 3
    p.r(cx - 3, cy - 3, cx + 3, cy + 1, B3); p.r(cx - 2, cy + 2, cx + 2, cy + 2, B2)
    p.p(cx - 1, cy - 1, OUT); p.p(cx + 1, cy - 1, OUT); p.p(cx - 2, cy - 1, OUT); p.p(cx + 2, cy - 1, OUT)
    p.p(cx, cy + 1, OUT)
    p.ps([(cx - 4, cy + 4), (cx + 4, cy + 4), (cx - 4, cy - 5), (cx + 4, cy - 5)], B2)
    return outline_same(p.im)


def barrel_frost():
    bmap = {(62, 14, 18): (30, 52, 96), (138, 32, 32): (70, 124, 190), (208, 76, 56): (150, 206, 240), (98, 22, 26): (48, 88, 150),
            (174, 46, 40): (104, 164, 220), (104, 46, 34): (84, 96, 120), (134, 64, 44): (110, 124, 150), (86, 36, 28): (62, 72, 96),
            (236, 196, 64): (226, 246, 255), (176, 128, 36): (156, 208, 240), (255, 192, 72): (210, 250, 255),
            (255, 242, 176): (255, 255, 255), (236, 116, 40): (150, 220, 255)}
    im = recolor_barrel(bmap)
    a = np.array(im)
    a[:5] = 0
    p = Pic(im.width, im.height + 2)
    p.paste(Image.fromarray(a), 0, 2)
    b = Image.fromarray(a).getbbox()
    top = b[1] + 2
    p.r(3, top, im.width - 4, top + 1, SNOW2)                      # snow cap
    p.r(5, top - 1, im.width - 7, top - 1, SNOW1)
    for x, ln in ((4, 3), (8, 5), (13, 2), (17, 4), (21, 3)):     # icicles under the rim
        p.l(x, top + 2, x, top + 2 + ln, ICE3); p.p(x, top + 2 + ln, ICE4)
    cx, cy = im.width // 2, im.height // 2 + 3
    p.e(cx - 5, cy - 5, cx + 5, cy + 5, (30, 52, 96))
    for dx_, dy_ in ((1, 0), (0, 1), (1, 1), (1, -1)):        # snowflake: four strokes and tips
        L_ = 4 if dx_ * dy_ == 0 else 3
        p.l(cx - dx_ * L_, cy - dy_ * L_, cx + dx_ * L_, cy + dy_ * L_, (226, 246, 255))
    p.p(cx, cy, (255, 255, 255))
    for x, y in ((4, 26), (19, 30), (6, 16)):
        p.p(x, y + 2, ICE4)
    return outline_same(p.im)


def firejet(on):
    p = Pic(30, 56)
    base = 55
    p.r(0, base - 5, 29, base, S1); p.l(0, base - 5, 29, base - 5, S2)
    p.r(3, base - 4, 26, base - 1, OUT)
    if on:
        p.r(4, base - 4, 25, base - 2, F1)
    else:
        p.ps([(8, base - 2), (15, base - 3), (21, base - 2)], (120, 30, 10))     # embers in the dark
    for x in range(4, 26, 3):
        p.l(x, base - 4, x + 1, base - 1, I2)
        p.p(x, base - 4, I3)
    p.l(3, base - 3, 26, base - 3, I1)
    p.outline()
    if on:   # a roaring column of flame, white-hot at the core
        for y in range(base - 5, 1, -1):
            u = (base - 5 - y) / (base - 6)
            hw = 10 * (1 - u) ** 0.6 + 1.5 * math.sin(y * 0.8) + 1
            cxx = 15 + 1.5 * math.sin(y * 0.35) * u
            for x in range(int(cxx - hw), int(cxx + hw) + 1):
                d_ = abs(x - cxx) / max(1, hw)
                c = F3 if d_ < 0.3 and u < 0.8 else (F2 if d_ < 0.6 else (F1 if d_ < 0.85 else F0))
                if u > 0.85 and d_ > 0.5:
                    continue
                p.p(x, y, c)
        for x, y in ((6, 20), (24, 14), (9, 6), (21, 26), (15, 1)):
            p.p(x, y, F2)
    return p.im


def pendulum():
    p = Pic(26, 50)
    for y in range(0, 28, 4):                                     # chain links
        p.eo(11, y, 14, y + 4, I2)
        p.p(12, y + 1, I3)
    p.l(12, 28, 12, 32, I1, 2)
    # crescent blade: big disc minus an offset disc
    m = Image.new('L', (26, 50), 0)
    d = ImageDraw.Draw(m)
    d.ellipse((0, 26, 25, 51), fill=255)
    d.ellipse((2, 18, 23, 43), fill=0)
    blade = np.array(m) > 0
    a = np.array(p.im)
    yy, xx = np.nonzero(blade)
    for y, x in zip(yy, xx):
        a[y, x] = (*(M1 if (y + x) % 7 else M2), 255)
    p.im = Image.fromarray(a); p.d = ImageDraw.Draw(p.im)
    p.arc(0, 26, 25, 51, 20, 160, M3)                              # sharpened edge
    p.arc(1, 26, 24, 50, 30, 150, (230, 236, 250))
    p.r(9, 30, 16, 34, I1); p.r(10, 31, 15, 33, I2)                # hub
    p.p(12, 32, I3)
    p.ps([(5, 44), (6, 45), (19, 46)], BL1)                        # a little blood on the edge
    p.outline()
    return p.im


def stairs():
    p = Pic(44, 38)
    base = 37
    # stone arch frame
    p.r(0, 6, 43, base, S1)
    p.e(4, 0, 39, 24, S2)
    p.r(4, 12, 39, base, S2)
    for y in range(8, base, 6):                                    # block joints
        p.l(0, y, 3, y, S0); p.l(40, y, 43, y, S0)
    for a_ in range(200, 341, 28):
        x = 21.5 + math.cos(math.radians(a_)) * 19; y = 12 + math.sin(math.radians(a_)) * 13
        p.l(21.5 + math.cos(math.radians(a_)) * 14, 12 + math.sin(math.radians(a_)) * 9, x, y, S0)
    p.l(4, 12, 4, base, S3); p.arc(4, 0, 39, 24, 190, 270, S3)
    # opening with steps going down into darkness
    p.e(8, 4, 35, 22, OUT)
    p.r(8, 13, 35, base, OUT)
    for i in range(7):
        y = base - 1 - i * 3
        w = 13 - i * 1.2
        c = tuple(int(v * (1 - i / 7)) for v in S3)
        p.r(21.5 - w, y, 21.5 + w, y + 1, c)
        p.l(21.5 - w, y + 2, 21.5 + w, y + 2, tuple(int(v * (1 - i / 7)) for v in S1))
    p.r(8, 13, 9, base, (20, 18, 24)); p.r(34, 13, 35, base, (20, 18, 24))
    p.r(0, base - 1, 43, base, S0)
    p.ps([(2, 20), (41, 28), (6, 30)], (70, 92, 60))               # moss
    p.outline()
    return p.im


def pressureplate(down):
    p = Pic(28, 10)
    base = 9
    p.r(0, base - 4, 27, base, S1); p.l(0, base - 4, 27, base - 4, S0)
    if not down:
        p.r(3, base - 6, 24, base - 3, S3); p.l(3, base - 6, 24, base - 6, S4)
        p.r(3, base - 2, 24, base - 1, S2)
        p.bitmap(10, base - 5, ['x...x', '.xxx.'], {'x': (150, 60, 50)})     # worn red mark
        p.ps([(5, base - 4), (22, base - 5)], S2)
    else:
        p.r(3, base - 4, 24, base - 2, S2); p.l(3, base - 4, 24, base - 4, S0)
        p.l(3, base - 1, 24, base - 1, OUT)
        p.bitmap(10, base - 4, ['x...x', '.xxx.'], {'x': (110, 40, 36)})
    p.outline()
    return p.im


@builder('props')
def make_props():
    save_prop('campfire', [campfire_frame(k) for k in range(4)])
    save_prop('questboard', [questboard()])
    save_prop('runestone', [runestone(False), runestone(True)])
    save_prop('barrel_poison', [barrel_poison()])
    save_prop('barrel_frost', [barrel_frost()])
    save_prop('firejet', [firejet(False), firejet(True)])
    save_prop('pendulum', [pendulum()])
    save_prop('stairs', [stairs()])
    save_prop('pressureplate', [pressureplate(False), pressureplate(True)])


# ================================================================== RUNES, MEAT, ABILITY ICONS
RUNES = {   # id: (dark, mid, bright) colour of the glyph and the stone's tinted rim, glyph bitmap 6x6
    'fire': ((150, 40, 10), (240, 110, 30), (255, 220, 120), ['..x...', '..xx..', '.xxx..', '.xx.x.', 'xx..xx', '.xxxx.']),
    'ice': ((30, 90, 160), (110, 200, 250), (230, 250, 255), ['x.x.x.', '.xxx..', 'xxxxx.', '.xxx..', 'x.x.x.', '......']),
    'poison': ((30, 100, 30), (100, 220, 60), (210, 255, 150), ['..x...', '..x...', '.xxx..', 'xxxxx.', 'xxxxx.', '.xxx..']),
    'storm': ((150, 120, 20), (250, 220, 60), (255, 255, 200), ['...xx.', '..xx..', '.xxxx.', '..xx..', '.xx...', 'xx....']),
    'blood': ((110, 10, 20), (200, 30, 40), (255, 120, 120), ['xxx...', 'x..x..', 'xxx...', 'x..x..', 'xxx...', '......']),
    'echo': ((80, 30, 130), (170, 90, 240), (240, 200, 255), ['x..x..', '.x..x.', '..x..x', '.x..x.', 'x..x..', '......']),
}


def rune_icon(rid):
    c0, c1, c2, bm = RUNES[rid]
    p = Pic(12, 12)
    p.poly([(1, 3), (3, 1), (8, 1), (10, 3), (10, 9), (8, 10), (3, 10), (1, 9)], S1)   # stone
    p.poly([(2, 3), (3, 2), (8, 2), (9, 3), (9, 8), (8, 9), (3, 9), (2, 8)], S2)
    p.l(3, 2, 8, 2, S3); p.l(2, 3, 2, 8, S3)
    p.p(9, 9, c0); p.p(1, 9, c0); p.p(10, 3, c0)                                      # tinted chips at the rim
    rows = [r[:6] for r in bm]
    xs = [i for r in rows for i, ch in enumerate(r) if ch == 'x']
    w = max(xs) + 1
    ox = 6 - (w + 1) // 2
    for j, r in enumerate(rows):
        for i, ch in enumerate(r):
            if ch == 'x':
                p.p(ox + i + 1, 3 + j, c0)          # glow / shadow under the glyph
    for j, r in enumerate(rows):
        for i, ch in enumerate(r):
            if ch == 'x':
                p.p(ox + i, 2 + j, c2 if j == 0 or i == 0 else c1)
    return outline_same(p.im)


def meat():
    p = Pic(12, 10)
    p.e(0, 1, 8, 9, (150, 50, 40))                 # meat
    p.e(1, 1, 7, 7, (196, 76, 60))
    p.e(2, 2, 5, 4, (232, 130, 110))
    p.p(3, 5, (240, 220, 200)); p.p(5, 6, (150, 50, 40))
    p.l(7, 5, 10, 3, B2, 2)                        # bone
    p.e(9, 1, 11, 3, B3); p.e(10, 3, 11, 5, B2)
    return outline_same(p.im)


def ab_icon(kind):
    p = Pic(16, 16)
    if kind == 'blink':        # violet rift with a figure streaking through it
        p.e(1, 2, 7, 13, V0); p.e(2, 3, 6, 12, V1); p.e(3, 4, 5, 11, V3)
        for y, ln in ((5, 6), (8, 8), (11, 5)):
            p.l(7, y, 7 + ln, y, (200, 160, 255) if y == 8 else V2)
        p.r(12, 6, 14, 10, (230, 220, 255)); p.p(15, 8, (255, 255, 255))
    elif kind == 'slowmo':     # hourglass
        p.r(3, 1, 12, 2, W3); p.r(3, 13, 12, 14, W3)
        p.l(4, 3, 4, 12, W1); p.l(11, 3, 11, 12, W1)
        p.poly([(5, 3), (10, 3), (8, 7), (7, 7)], (190, 220, 240)); p.poly([(7, 8), (8, 8), (10, 12), (5, 12)], (190, 220, 240))
        p.poly([(6, 4), (9, 4), (8, 6), (7, 6)], GOLD1); p.poly([(6, 12), (9, 12), (8, 10), (7, 10)], GOLD1)
        p.l(7, 7, 7, 10, GOLD2)
    elif kind == 'bubble':     # shimmering shield bubble
        p.e(1, 1, 14, 14, (40, 120, 190)); p.e(2, 2, 13, 13, (80, 170, 230)); p.e(3, 3, 12, 12, (30, 70, 120))
        p.arc(3, 3, 12, 12, 200, 290, (200, 240, 255)); p.p(5, 5, (255, 255, 255))
        p.e(6, 6, 9, 9, (110, 200, 250))
    elif kind == 'summon':     # skull rising out of a green circle
        p.e(1, 10, 14, 15, NG0); p.e(3, 11, 12, 14, NG1); p.e(5, 12, 10, 13, NG2)
        p.r(4, 2, 11, 8, B3); p.r(5, 9, 10, 10, B2); p.r(4, 2, 4, 3, B2)
        p.r(5, 5, 6, 6, OUT); p.r(9, 5, 10, 6, OUT); p.p(7, 8, OUT); p.p(8, 8, OUT)
        p.p(5, 5, NG2); p.p(10, 5, NG2)
        p.ps([(2, 6), (13, 4), (1, 1), (14, 9)], NG2)
    elif kind == 'quake':      # the ground splits, shock arcs and flying rocks
        p.r(0, 10, 15, 15, S1); p.r(0, 10, 15, 10, S3); p.l(0, 11, 15, 11, S2)
        p.lines([(8, 10), (6, 12), (8, 13), (7, 15)], OUT); p.lines([(6, 12), (2, 13), (0, 15)], OUT)
        p.lines([(8, 13), (12, 14), (15, 13)], OUT)
        p.arc(2, 3, 14, 15, 200, 340, (230, 200, 140)); p.arc(4, 6, 12, 14, 210, 330, (255, 240, 200))
        p.r(2, 2, 3, 3, S3); p.p(2, 2, S4); p.r(12, 1, 13, 2, S3); p.p(13, 1, S4); p.p(8, 0, S2); p.p(7, 1, S3)
    return outline_same(p.im)


@builder('items')
def make_items():
    for rid in RUNES:
        save(hard(rune_icon(rid)), G_OUT + f'rune_{rid}.png')
    save(hard(meat()), G_OUT + 'item_meat.png')
    for k in ('blink', 'slowmo', 'bubble', 'summon', 'quake'):
        save(hard(ab_icon(k)), G_OUT + f'ab_{k}.png')


# ================================================================== PROJECTILES AND PARTICLES
@builder('particles')
def make_particles():
    # nail (6x2): flat head on the left, point on the right
    p = Pic(6, 2)
    p.r(0, 0, 0, 1, (90, 90, 100)); p.l(1, 0, 4, 0, (200, 204, 214)); p.l(1, 1, 4, 1, (120, 122, 134)); p.p(5, 0, (240, 240, 250))
    save(hard(p.im), G_OUT + 'part_nail.png')
    # arrow (12x3, side view, flying right)
    p = Pic(12, 3)
    p.l(2, 1, 9, 1, W3)
    p.ps([(0, 0), (1, 0), (0, 2), (1, 2), (2, 0), (2, 2)], (200, 40, 40)); p.p(1, 1, (240, 90, 80))
    p.ps([(9, 0), (10, 1), (9, 2), (11, 1)], M2); p.p(10, 1, M3)
    save(hard(p.im), G_OUT + 'part_arrow.png')
    # lightning sparks (additive on black): four 12x12 frames of forking blue arcs
    fr = []
    for k in range(4):
        r2 = random.Random(30 + k)
        a = np.zeros((12, 12, 3))
        for b_ in range(2 + k % 2):
            x, y = 6.0, 6.0
            ang = r2.uniform(0, math.tau)
            for i in range(5):
                xi, yi = int(round(x)), int(round(y))
                if 0 <= xi < 12 and 0 <= yi < 12:
                    a[yi, xi] = (200, 240, 255) if i < 2 else (90, 170, 255)
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        if 0 <= xi + dx < 12 and 0 <= yi + dy < 12 and a[yi + dy, xi + dx].sum() == 0:
                            a[yi + dy, xi + dx] = (20, 50, 120)
                ang += r2.uniform(-0.9, 0.9)
                x += math.cos(ang) * 1.3; y += math.sin(ang) * 1.3
        a[6, 6] = (255, 255, 255)
        fr.append(from_arr(a))
    save(cells(fr, 12, 12), G_OUT + 'part_lightning.png', 4, additive=True)
    # falling ash flakes (not additive)
    a1 = Pic(4, 3); a1.ps([(0, 1), (1, 0), (2, 1), (3, 1)], ASH2); a1.p(1, 1, ASH3); a1.p(2, 2, ASH1)
    a2 = Pic(4, 3); a2.ps([(0, 0), (1, 1), (2, 1), (3, 2)], ASH1); a2.p(1, 0, ASH3)
    save(cells([a1.im, a2.im], 4, 3), G_OUT + 'part_ashfall.png', 2)
    # lava drop (additive on black): a falling drop and a round blob
    d0 = np.zeros((6, 4, 3)); d0[0, 1] = (120, 30, 0); d0[1, 1] = (200, 70, 10); d0[2, 1:3] = (255, 140, 30)
    d0[3, 0:4] = (230, 90, 20); d0[3, 1:3] = (255, 200, 90); d0[4, 0:4] = (200, 60, 10); d0[4, 1:3] = (255, 160, 50); d0[5, 1:3] = (150, 40, 5)
    d1 = np.zeros((6, 4, 3)); d1[2, 1:3] = (230, 90, 20); d1[3, 0:4] = (230, 90, 20); d1[3, 1:3] = (255, 220, 120)
    d1[4, 0:4] = (200, 60, 10); d1[4, 1:3] = (255, 160, 50); d1[5, 1:3] = (120, 30, 0)
    save(cells([from_arr(d0), from_arr(d1)], 4, 6), G_OUT + 'part_lavadrop.png', 2, additive=True)
    # heat shimmer (additive, very faint): a soft wavy blob in a few flat steps
    yy, xx = np.mgrid[0:16, 0:16].astype(float)
    r = np.hypot(xx - 7.5, (yy - 7.5) * 1.2)
    v = np.clip(1 - r / 7.5, 0, 1) * (0.75 + 0.25 * np.sin(yy * 1.6 + xx * 0.4))
    v = np.round(v * 3) / 3
    save(from_arr(v[..., None] * np.array((54, 30, 14))), G_OUT + 'part_heat.png', additive=True)


# ================================================================== TOUCH ICONS (96x96 white on transparent)
@builder('icons')
def make_icons():
    icon = P3.icon

    def ability(d, k):   # a star burst inside a ring: "special move"
        S = lambda *v: [x * k for x in v]
        d.ellipse(S(4, 4, 92, 92), fill=255); d.ellipse(S(12, 12, 84, 84), fill=0)
        pts = []
        for i in range(16):
            a = -math.pi / 2 + i * math.pi / 8
            r = 34 if i % 2 == 0 else 14
            pts.append(((48 + math.cos(a) * r) * k, (48 + math.sin(a) * r) * k))
        d.polygon(pts, fill=255)
        d.ellipse(S(41, 41, 55, 55), fill=0)
    save(icon(ability), T_OUT + 'icon_ability.png')

    def bow(d, k):       # a drawn bow with a nocked arrow pointing up-right
        S = lambda *v: [x * k for x in v]
        d.arc(S(-6, 10, 74, 90), 258, 372, fill=255, width=9 * k)
        d.line(S(27, 12, 35, 50), fill=255, width=3 * k)      # string pulled back to the nock
        d.line(S(35, 50, 72, 57), fill=255, width=3 * k)
        d.line(S(33, 52, 78, 7), fill=255, width=6 * k)       # arrow shaft
        d.polygon(S(90, -4, 70, 6, 80, 16), fill=255)          # head
        d.polygon(S(34, 52, 22, 52, 28, 60), fill=255); d.polygon(S(34, 52, 34, 64, 26, 58), fill=255)   # fletching
    save(icon(bow), T_OUT + 'icon_bow.png')

    def layout(d, k):    # four arrows from the centre: move / rearrange
        S = lambda *v: [x * k for x in v]
        d.rectangle(S(44, 18, 52, 78), fill=255); d.rectangle(S(18, 44, 78, 52), fill=255)
        d.polygon(S(48, 2, 34, 20, 62, 20), fill=255); d.polygon(S(48, 94, 34, 76, 62, 76), fill=255)
        d.polygon(S(2, 48, 20, 34, 20, 62), fill=255); d.polygon(S(94, 48, 76, 34, 76, 62), fill=255)
        d.ellipse(S(38, 38, 58, 58), fill=255); d.ellipse(S(43, 43, 53, 53), fill=0)
    save(icon(layout), T_OUT + 'icon_layout.png')

# ================================================================== CONTACT SHEET
NEW_WEAPONS = ('nailgun', 'staff', 'bow')


def make_sheet():
    man = {}
    if os.path.exists(MANIFEST):
        man = json.load(open(MANIFEST))
    for k, v in SAVED.items():
        man[k] = v
    try:   # the first-person weapons and pickups come from tools/weapon-frames (render-static.mjs + pack.py)
        wf = json.loads(re.search(r'= (\{.*\});', open('retrofps/js/weapons.js').read()).group(1))
        for w in NEW_WEAPONS:
            if w in wf:
                man[G_OUT + f'fp_{w}.png'] = (sum(len(v) for v in wf[w]['states'].values()), False)
                man[G_OUT + f'pick_{w}.png'] = (1, False)
    except (OSError, AttributeError):
        pass
    os.makedirs(SCR, exist_ok=True)
    json.dump(man, open(MANIFEST, 'w'), indent=0)
    font = ImageFont.load_default()
    items = []
    for path, (n, add) in man.items():
        if not os.path.exists(path):
            continue
        im = Image.open(path).convert('RGBA')
        name = os.path.basename(path)
        total = n
        if im.width > 1780 and n > 1:      # very long strips wrap onto several rows
            fw_ = im.width // n
            per = max(1, 1780 // fw_)
            rows = (n + per - 1) // per
            w2 = Image.new('RGBA', (fw_ * per, im.height * rows), (0, 0, 0, 0))
            for i in range(n):
                w2.paste(im.crop((i * fw_, 0, (i + 1) * fw_, im.height)), ((i % per) * fw_, (i // per) * im.height))
            im = w2
            n = per
        if path.startswith(T_OUT):
            sc = 1
        elif name.startswith('fp_'):
            sc = 1
        elif name.startswith(('enemies', 'boss')) or path.startswith(W_OUT):
            sc = 2
        else:
            sc = 4
        while im.width * sc > 1780 and sc > 1:
            sc -= 1
        items.append((path, n, add, im, sc, total))
    W = 1800
    x, y, rowh = 8, 8, 0
    places = []
    for path, n, add, im, sc, total in items:
        w, h = im.width * sc, im.height * sc
        lw = len(os.path.basename(path)) * 6 + 70
        cw = max(w, lw)
        if x + cw > W - 8:
            x, y, rowh = 8, y + rowh + 22, 0
        places.append((path, n, add, im, sc, x, y + 14, total))
        x += cw + 14
        rowh = max(rowh, h + 14)
    H = y + rowh + 12
    c = Image.new('RGBA', (W, H), (104, 104, 104, 255))
    d = ImageDraw.Draw(c)
    for path, n, add, im, sc, x, y, total in places:
        fw = im.width // n
        fh = im.height if total == n else im.height // ((total + n - 1) // n)
        lab = f'{os.path.basename(path)[:-4]} {total}f {fw}x{fh}' + (' additive' if add else '')
        d.text((x, y - 13), lab, fill=(255, 255, 255, 255), font=font)
        big = im.resize((im.width * sc, im.height * sc), Image.NEAREST)
        if add:
            c.paste((0, 0, 0, 255), (x, y, x + big.width, y + big.height))
        elif path.startswith(T_OUT):
            c.paste((40, 44, 56, 255), (x, y, x + big.width, y + big.height))
        else:
            for i in range(n):
                c.paste((92, 92, 92, 255), (x + i * fw * sc, y, x + (i + 1) * fw * sc - (2 if n > 1 else 0), y + big.height))
        c.alpha_composite(big, (x, y))
    c.convert('RGB').save(SHEET)
    print('sheet', SHEET, c.size)


def check_outputs():
    """Style rules: every pixel fully opaque or fully transparent (opaque strips: additive on black / textures)."""
    bad = []
    for path in SAVED:
        a = np.array(Image.open(path).convert('RGBA'))[:, :, 3]
        if not np.isin(a, (0, 255)).all():
            bad.append(path)
    if bad:
        print('PARTIAL ALPHA:', bad)


if __name__ == '__main__':
    want = sys.argv[1:]
    for name, fn in BUILDERS.items():
        if not want or name in want:
            fn()
    check_outputs()
    make_sheet()
    print('klart')
