#!/usr/bin/env python3
"""Version 5 graphics for Krypta: Frostfästet (frost biome), five new enemies, the frost boss, pets, potions,
NPCs, particles and touch icons.

Run from the repo root:  python3 retrofps/tools/props3/make.py [name ...]
(with names only those builders run, e.g. `python3 retrofps/tools/props3/make.py ghoul sheet`; the contact sheet
always shows everything this script has written so far)

Out to retrofps/assets/gfx:
  enemies-{ghoul,cultist,gargoyle,icewolf,wisp}_{idle,movement,attack,take_damage,death}.png
  boss_frost_{idle,attack,cast,hurt,death}.png
  pet_raven.png, pet_lantern.png, pet_pup_{idle,movement,attack}.png
  potion_{heal,rage,ghost,speed,ice,unknown}.png
  npc_alchemist.png, npc_priest.png, prop_petcage.png
  part_{snow,footprint,breath,icicle,flame,blood_trail,eye}.png
Out to retrofps/assets/wall:
  wall_frost, wall_ice_crystal (64x128), floor_snow, floor_frost_stone (64x64),
  wall_boss_frost (64x128), floor_boss_frost (64x64)
Out to retrofps/assets/touch: icon_potion.png, icon_wheel.png (96x96, white on transparent)
Contact sheet: <scratchpad>/en/v5_sheet.png

Sources (licences checked; everything not listed is drawn procedurally below in the outlined style of
tools/props2/make.py, whose helpers are reused):
  * Pixel Crawler Free Pack 2.11 (Anokolisa; free for commercial use, edits allowed, no resale of the assets):
      Body_A Idle/Run/Slice/Hit/Death (side)   -> ghoul (recoloured pale, hunched, claws, axe removed)
      Npc's/Rogue Idle/Run/Death               -> cultist (recoloured, robe drawn over the legs, casting arms drawn)
      Npc's/Wizzard Idle                       -> npc_alchemist, npc_priest (recoloured, flask / candle drawn)
  * Gothicvania (Ansimuz, Legacy Collection, CC0):
      flying-bird/flying-creature-cycle        -> gargoyle (recoloured to stone, horns and eyes added)
      wolf-runing-cycle (skin version)         -> icewolf (recoloured white/blue; standing legs drawn)
      Grotto-escape-2-boss-dragon idle/tail/breath -> boss_frost "ISDRAKEN" (recoloured icy blue, breath turned to frost)
  * Classic 64 Asset Pack 0.6 (Craig Snedeker, CC0): snow_01, snow_rocks_04, ice_01, rock_wall_04, river_ice_01
      -> grain of the frost textures
  * Kenney retro-textures-fantasy (CC0): wall_brick_stone_center, floor_stone_pattern -> block layout of
      wall_frost / wall_boss_frost / floor_frost_stone
  (32rogues, Super Retro World and Mana Seed are NOT used: their licences forbid AI use / redistribution.)
"""
import importlib.util
import json
import math
import os
import random
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

_spec = importlib.util.spec_from_file_location('props2make', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'props2', 'make.py'))
P2 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(P2)
from_p2 = ('OUT Pic outline outline_same hard recolor load_frames shift shear rot squash tint place gmap tile_lum blend '
           'mask_draw glow warp radial band from_arr').split()
globals().update({k: getattr(P2, k) for k in from_p2})
S0, S1, S2, S3, S4 = P2.S0, P2.S1, P2.S2, P2.S3, P2.S4
B0, B1, B2, B3 = P2.B0, P2.B1, P2.B2, P2.B3
V0, V1, V2, V3 = P2.V0, P2.V1, P2.V2, P2.V3
F0, F1, F2, F3 = P2.F0, P2.F1, P2.F2, P2.F3
BL0, BL1, BL2 = P2.BL0, P2.BL1, P2.BL2
GOLD0, GOLD1, GOLD2 = P2.GOLD0, P2.GOLD1, P2.GOLD2
W0, W1, W2, W3, W4 = P2.W0, P2.W1, P2.W2, P2.W3, P2.W4
I0, I1, I2, I3 = P2.I0, P2.I1, P2.I2, P2.I3

A = 'assets/'
LC = A + '2d-pixel/Legacy Collection/Legacy Collection/Assets/'
GVC = LC + 'Gothicvania/Characters/'
PCE = A + '2d-pixel/Pixel Crawler - Free Pack 2.11/Pixel Crawler - Free Pack/Entities/'
BODY = PCE + 'Characters/Body_A/Animations/'
NPC = PCE + "Npc's/"
K = A + 'textures/retro-textures-fantasy/PNG/'
C64 = A + 'textures/Classic 64 Asset Pack 0.6/- Classic 64 Asset Pack 0.6/'
G_OUT, W_OUT, T_OUT = 'retrofps/assets/gfx/', 'retrofps/assets/wall/', 'retrofps/assets/touch/'
SCR = '/tmp/claude-0/-home-user-test/80ee56ba-2fa6-5354-b261-a4ca4fdcb508/scratchpad/en/'
SHEET, MANIFEST = SCR + 'v5_sheet.png', SCR + 'v5_manifest.json'

# ---------------------------------------------------------------- frost palette
ICE0, ICE1, ICE2, ICE3, ICE4 = (28, 40, 78), (52, 86, 140), (92, 146, 200), (156, 208, 240), (226, 246, 255)
SNOW0, SNOW1, SNOW2 = (168, 186, 210), (210, 222, 238), (244, 248, 255)
CY0, CY1, CY2 = (40, 150, 210), (110, 220, 255), (210, 250, 255)     # glowing cyan

SAVED = {}


def save(im, path, n=1, additive=False):
    im.save(path)
    SAVED[path] = (n, additive)
    return im


def save_enemy(sheet, state, frames, fw):
    """Like props2.save_enemy: fw x fw cells, nothing below the feet row (57 / 28), hard alpha."""
    floor = 57 if fw == 64 else 28
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
    """Additive particles are stored opaque on black (like part_ember / part_wisp)."""
    out = Image.new('RGBA', im.size, bg + (255,))
    out.alpha_composite(im.convert('RGBA'))
    return out


def colors_mask(im, cols):
    a = np.array(im.convert('RGBA'))
    m = np.zeros(a.shape[:2], bool)
    for c in cols:
        m |= (a[:, :, 0] == c[0]) & (a[:, :, 1] == c[1]) & (a[:, :, 2] == c[2]) & (a[:, :, 3] > 0)
    return m


def keep(im, mask):
    a = np.array(im.convert('RGBA')).copy()
    a[~mask] = 0
    return Image.fromarray(a)


def bbox_feet(frames):
    bs = [f.getbbox() for f in frames if f.getbbox()]
    return max(b[3] for b in bs) - 1


def fit(fr, fw, feet_src, cx_src, dx=0, dy=0, feet=None):
    return place(fr, fw, feet_src, cx_src, feet=feet, dx=dx, dy=dy)


BUILDERS = {}


def builder(name):
    def deco(fn):
        BUILDERS[name] = fn
        return fn
    return deco


# ================================================================== GHOUL (Pixel Crawler Body_A)
SKIN = [(217, 160, 102), (162, 101, 67), (118, 61, 43), (250, 200, 149)]
GHOUL_MAP = {(217, 160, 102): (150, 166, 140), (162, 101, 67): (104, 120, 102), (118, 61, 43): (64, 74, 66),
             (250, 200, 149): (196, 210, 184), (0, 0, 0): OUT, (167, 172, 174): (255, 210, 80), (255, 252, 252): (255, 240, 170),
             (76, 181, 40): (230, 60, 40)}
GH_RAG0, GH_RAG1 = (58, 46, 50), (84, 68, 70)
CLAW = (226, 222, 196)


def body_src(anim, idx=None):
    return load_frames(BODY + f'{anim}_Base/{anim}_Side-Sheet.png', 64, idx=idx)


def strip_tool(f):
    """Keep only the body: skin/eye colours plus the black lines that touch them (the axe and the slash go)."""
    a = np.array(f)
    skin = colors_mask(f, SKIN + [(167, 172, 174), (255, 252, 252), (76, 181, 40)])
    blk = (a[:, :, 0] < 8) & (a[:, :, 1] < 8) & (a[:, :, 2] < 8) & (a[:, :, 3] > 0)
    other = (a[:, :, 3] > 0) & ~skin & ~blk
    p = np.pad(skin, 1)
    near = p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]
    po = np.pad(other, 1)
    near_o = po[:-2, 1:-1] | po[2:, 1:-1] | po[1:-1, :-2] | po[1:-1, 2:]
    return keep(f, skin | (blk & near & ~near_o))


def ghoulify(f, hunch=0.3, claws=True, rag=True):
    f = strip_tool(f)
    b = f.getbbox()
    if not b:
        return f
    feet = b[3] - 1
    waist = feet - 9
    f = shear(f, hunch, waist)                       # hunched forward
    f = recolor(f, GHOUL_MAP)
    p = Pic(64, 64)
    p.paste(f, 0, 0)
    a = np.array(f)[:, :, 3] > 0
    if rag:                                          # torn loincloth
        for y in range(waist - 1, waist + 3):
            xs = np.nonzero(a[y])[0]
            if len(xs):
                for x in range(xs.min() + 1, xs.max()):
                    if a[y, x]:
                        p.p(x, y, GH_RAG1 if (x + y) % 3 else GH_RAG0)
        xs = np.nonzero(a[waist + 3])[0]
        if len(xs):
            p.ps([(xs.min() + 1, waist + 3), (xs.min() + 3, waist + 3), (xs.min() + 2, waist + 4)], GH_RAG0)
    if claws:                                        # three bone claws on the front-most hand
        top = b[1] + 9
        ys, xs = np.nonzero(a[top:waist + 4])
        if len(xs):
            i = np.argmax(xs)
            hx, hy = xs[i], ys[i] + top
            for k, (dx, dy) in enumerate(((1, -1), (2, 0), (1, 1))):
                p.p(hx + dx, hy + dy, CLAW)
                p.p(hx + dx + 1, hy + dy + (1 if k == 2 else 0), CLAW)
    # ribs and a dark eye socket shadow
    return p.im


def claw_slash(p, cx, cy, t):
    """Three red-white claw streaks, t=0..1 how far the swipe has gone."""
    for k in range(3):
        x0, y0 = cx - 6 + k * 3, cy - 7 + k
        n = int(3 + 9 * t)
        for i in range(n):
            x, y = x0 + i * 0.6, y0 + i
            p.p(x, y, (255, 236, 220) if i > n - 4 else (220, 60, 60))


@builder('ghoul')
def make_ghoul():
    idle, run, sl, hit, de = body_src('Idle'), body_src('Run'), body_src('Slice'), body_src('Hit'), body_src('Death')
    feet = bbox_feet(idle)
    b = idle[0].getbbox()
    cx = (b[0] + b[2]) // 2

    def P(f, dx=0, dy=0, **kw):
        g = ghoulify(f, **kw)
        return outline_same(place(g, 64, feet, cx, dx=dx - 2, dy=dy))
    save_enemy('ghoul', 'idle', [P(f) for f in idle], 64)
    save_enemy('ghoul', 'movement', [P(f, hunch=0.45) for f in run], 64)
    att = []
    for i, f in enumerate(sl):
        g = P(f, hunch=0.2 if i < 3 else 0.35)
        if i in (3, 4, 5):
            p = Pic(64, 64)
            p.paste(g, 0, 0)
            gb = g.getbbox()
            claw_slash(p, gb[2] + 1, gb[1] + 10, (0.5, 1.0, 0.7)[i - 3])
            g = p.im
        att.append(g)
    save_enemy('ghoul', 'attack', att, 64)
    save_enemy('ghoul', 'take_damage', [P(f, dx=-1) for f in hit], 64)
    save_enemy('ghoul', 'death', [P(f, hunch=0.15, claws=False, rag=i < 5) for i, f in enumerate(de)], 64)


# ================================================================== CULTIST (Pixel Crawler Rogue NPC)
CULT_MAP = {(146, 130, 48): (112, 30, 44), (95, 86, 37): (78, 20, 34), (55, 58, 32): (52, 14, 26), (37, 39, 22): (34, 10, 20),
            (181, 108, 48): (196, 160, 80), (71, 40, 13): (96, 70, 30), (240, 154, 83): (236, 206, 120),
            (95, 46, 92): (24, 14, 26), (147, 45, 139): (44, 26, 48), (51, 30, 50): (14, 8, 16),
            (12, 152, 214): (220, 120, 255), (28, 56, 69): (120, 40, 160), (20, 20, 18): OUT}
ROBE0, ROBE1, ROBE2 = (52, 14, 26), (78, 20, 34), (112, 30, 44)


def rogue_src(anim, fw):
    return load_frames(NPC + f'Rogue/{anim}/{anim}-Sheet.png', fw)


def robe_over(f, sway=0, flare=0):
    """Paint a long robe from the belt down over the legs (the source rogue wears trousers)."""
    a = np.array(f)[:, :, 3] > 0
    b = f.getbbox()
    if not b:
        return f
    feet = b[3] - 1
    belt = None
    gold = colors_mask(f, [(196, 160, 80), (236, 206, 120)])
    rows = [r for r in np.nonzero(gold.any(1))[0] if r < feet - 4]
    belt = max(rows) + 1 if rows else feet - 5
    xs = np.nonzero(a[belt - 1])[0]
    x0, x1 = xs.min(), xs.max()
    p = Pic(64, 64)
    p.paste(keep(f, np.arange(64)[:, None] < belt + 0 * a), 0, 0)
    for y in range(belt, feet + 1):
        t = (y - belt) / max(1, feet - belt)
        l = x0 - round(t * (1.5 + flare)) + round(sway * t)
        r = x1 + round(t * (1.5 + flare)) + round(sway * t)
        for x in range(l, r + 1):
            c = ROBE1
            if x <= l + 1:
                c = ROBE0
            elif (x - l) % 4 == 2 and y < feet:
                c = ROBE2 if x > (l + r) // 2 else ROBE0
            p.p(x, y, c)
    p.l(x0 - 1, feet, x1 + 1, feet, ROBE0)
    return p.im


def cult_curse(p, x, y, r, phase):
    """Purple curse orb with sparks."""
    for rr, c in ((r + 2, V0), (r + 1, V1), (r, V2), (max(0, r - 2), V3)):
        if rr > 0:
            p.e(x - rr, y - rr, x + rr, y + rr, c)
    rnd = random.Random(phase)
    for _ in range(3 + r):
        ang = rnd.uniform(0, math.tau)
        d = r + 3 + rnd.randint(0, 3)
        p.p(x + math.cos(ang) * d, y + math.sin(ang) * d, V2 if rnd.random() < 0.5 else V3)


def cult_arms_up(p, sx, sy, lift, half=4):
    """Both sleeves raised in a V from the shoulders either side of the hood; lift 0..1, pale bony hands."""
    for sgn, c, c2 in ((1, ROBE2, ROBE1), (-1, ROBE1, ROBE0)):
        x0 = sx + sgn * half
        ex = x0 + sgn * round(1 + 4 * lift)
        ey = sy - round(3 + 14 * lift)
        p.l(x0, sy, ex, ey + 2, c2, 4)
        p.l(x0, sy, ex, ey + 2, c, 2)
        p.r(ex - 1, ey - 1, ex + 1, ey + 1, (226, 214, 196))   # open hand
        p.p(ex + sgn * 2, ey - 1, (226, 214, 196))
        p.p(ex, ey - 2, (226, 214, 196))


@builder('cultist')
def make_cultist():
    idle = rogue_src('Idle', 32)
    run = rogue_src('Run', 64)
    death = rogue_src('Death', 64)
    ib = idle[0].getbbox()
    ifeet, icx = ib[3] - 1, (ib[0] + ib[2]) // 2
    rb = run[0].getbbox()
    rfeet, rcx = bbox_feet(run), (rb[0] + rb[2]) // 2

    def C(f, fe, c, dx=0, sway=0, flare=0):
        g = recolor(f, CULT_MAP)
        g = place(g, 64, fe, c, dx=dx)
        g = robe_over(g, sway, flare)
        return outline_same(g)
    idl = [C(f, ifeet, icx, flare=0) for f in idle]
    save_enemy('cultist', 'idle', idl, 64)
    save_enemy('cultist', 'movement', [C(f, rfeet, rcx, sway=(-1, 0, 1, 1, 0, -1)[i]) for i, f in enumerate(run)], 64)
    # attack: raises both hands, a purple curse gathers above them and is hurled forward
    base = recolor(idle[0], CULT_MAP)
    base = robe_over(place(base, 64, ifeet, icx), 0, 0)
    bb = base.getbbox()
    sx, sy = bb[0] + (bb[2] - bb[0]) // 2, bb[1] + 12
    att = []
    for i, (lift, r, ox) in enumerate(((0.0, 0, 0), (0.6, 1, 0), (1, 2, 0), (1, 3, 0), (1, 4, 0), (0.9, 3, 5), (0.6, 2, 10), (0.1, 0, 0))):
        p = Pic(64, 64)
        p.paste(base, 0, 0)
        if lift >= 0.2:
            cult_arms_up(p, sx, sy, lift)
        im = outline_same(p.im)
        p = Pic(64, 64)
        p.paste(im, 0, 0)
        if r:
            cult_curse(p, sx + ox, sy - 20 + ox // 3, r, i)
        if i in (2, 3, 4):   # eyes flare
            for (x, y) in np.argwhere(colors_mask(p.im, [(220, 120, 255)]))[:, ::-1]:
                p.p(x, y, V3)
        att.append(p.im)
    save_enemy('cultist', 'attack', att, 64)
    hurt = []
    for dx, sq in ((-3, 1), (-2, 0.92), (-1, 1)):
        g = squash(place(base, 64, 57, 32, dx=dx), sq, 58)
        hurt.append(outline_same(g))
    hurt.append(idl[0])
    save_enemy('cultist', 'take_damage', hurt, 64)
    db = death[0].getbbox()
    dfeet, dcx = bbox_feet(death), (db[0] + db[2]) // 2
    dfr = []
    for i, f in enumerate(death):
        g = place(recolor(f, CULT_MAP), 64, dfeet, dcx)
        if i < 2:
            g = robe_over(g)
        dfr.append(outline_same(g))
    save_enemy('cultist', 'death', dfr, 64)



# ================================================================== GARGOYLE (drawn: stone demon with bat wings)
EYE0, EYE1 = (255, 110, 40), (255, 226, 130)


def V(ang, ln):
    a = math.radians(ang)
    return (math.cos(a) * ln, -math.sin(a) * ln)


def add(p, v, k=1.0):
    return (p[0] + v[0] * k, p[1] + v[1] * k)


def garg_frame(hip=(30, 48), lean=25, wing='fold', legs='crouch', arms='ground', mouth=0, eyes=1,
               stone_seed=1, cracks=0, head_dy=0, k=1.3):
    """One gargoyle pose. lean in degrees (0 upright, 90 horizontal), wing in fold/up/mid/down."""
    H = hip
    up = V(90 - lean, 1)
    fw = V(-lean, 1)

    def rel(pt, a, b):  # point in the body frame: a forward, b up (scaled)
        return (pt[0] + (fw[0] * a + up[0] * b) * k, pt[1] + (fw[1] * a + up[1] * b) * k)
    S = rel(H, 0, 9)
    root = rel(S, -2, -1)
    WING = {'fold': (100, 13, [(-100, 8), (-112, 12), (-128, 14)]),
            'up': (118, 12, [(175, 11), (-165, 14), (-140, 12), (-118, 9)]),
            'mid': (170, 12, [(-170, 10), (-145, 13), (-120, 11), (-100, 8)]),
            'down': (-148, 11, [(-125, 10), (-100, 11), (-80, 8)])}

    def wing_layer(off, mem, bone):
        q = Pic(64, 64)
        wa, wl, tips = WING[wing]
        rt = add(root, off)
        Wp = add(rt, V(wa, wl * k))
        tp = [add(Wp, V(a_, ln * k)) for a_, ln in tips]
        low = add(rel(H, -2, 3), off)
        q.poly([rt, Wp] + tp + [low], mem)
        # scalloped trailing edge: carve notches between the finger tips
        cut = ImageDraw.Draw(q.im)
        for t1, t2 in zip(tp, tp[1:] + [low]):
            m = ((t1[0] + t2[0]) / 2, (t1[1] + t2[1]) / 2)
            m2 = (m[0] + (Wp[0] - m[0]) * 0.28, m[1] + (Wp[1] - m[1]) * 0.28)
            cut.polygon([t1, t2, m2], fill=(0, 0, 0, 0))
        for t in tp:
            q.l(Wp[0], Wp[1], t[0], t[1], bone)
        q.l(rt[0], rt[1], Wp[0], Wp[1], bone, 2)
        q.p(Wp[0], Wp[1] - 1, S4)
        q.p(Wp[0] + 1, Wp[1] - 2, S4)          # thumb claw
        return q.im
    p = Pic(64, 64)
    p.paste(wing_layer((-2 if wing != 'fold' else 3, -2), S0, S1), 0, 0)
    # tail
    t0 = rel(H, -2, 0)
    pts = [t0, add(t0, (-4 * k, 2)), add(t0, (-7 * k, 4)), add(t0, (-9 * k, 3)), add(t0, (-10 * k, 0))]
    p.lines(pts, S2, 2)
    tip = pts[-1]
    p.poly([(tip[0], tip[1] - 2), (tip[0] - 3, tip[1] + 1), (tip[0] + 1, tip[1] + 1)], S2)
    LEG = {'crouch': ((-5, 6), (-112, 6)), 'dangle': ((-70, 5), (-110, 5)), 'reach': ((-5, 6), (5, 5))}
    ARM = {'ground': ((-60, 5), (-88, 6)), 'reach': ((-5, 6), (0, 5)), 'tuck': ((-80, 4), (-10, 4))}

    def limb(base, spec, col, w, fwd):
        (a1, l1), (a2, l2) = spec
        Kp = add(base, V(a1, l1 * k))
        F = add(Kp, V(a2, l2 * k))
        p.l(base[0], base[1], Kp[0], Kp[1], col, w)
        p.l(Kp[0], Kp[1], F[0], F[1], col, max(1, w - 1))
        for d in (-1, 0, 1):
            c = add(F, V((a2 + 80 + 35 * d) if fwd else 25 * d, 2.2))
            p.l(F[0], F[1], c[0], c[1], S4)
        return F
    limb(rel(H, -1, 0), LEG[legs], S2, 3, False)
    limb(rel(S, -1, -1), ARM[arms], S2, 2, True)
    # torso
    p.l(H[0], H[1], S[0], S[1], S3, 8)
    p.e(H[0] - 4, H[1] - 3, H[0] + 4, H[1] + 4, S3)
    c = rel(H, 2.5, 6)
    p.e(c[0] - 3, c[1] - 3, c[0] + 3, c[1] + 3, S4)          # chest
    for i in range(3):
        q = rel(H, 3, 1.5 + 1.6 * i)
        p.p(q[0], q[1], S2); p.p(q[0] - 1, q[1], S2)
    limb(rel(H, 1, 0), LEG[legs], S3, 4, False)
    # head
    hc = rel(S, 2, 3.5)
    hc = (hc[0], hc[1] + head_dy)
    p.e(hc[0] - 4, hc[1] - 3, hc[0] + 3, hc[1] + 4, S3)
    sn = add(hc, fw, 3)
    p.r(sn[0] - 1, sn[1] - 1, sn[0] + 1, sn[1] + 2, S3)     # short snout
    p.p(sn[0] + 2, sn[1] - 1, S3)
    p.l(hc[0] - 1, hc[1] - 2, sn[0] + 1, sn[1] - 2, S4)    # brow ridge
    jaw = 1 + mouth
    p.l(sn[0] - 2, sn[1] + 2 + mouth, sn[0] + 1, sn[1] + 2 + mouth, S2)
    if mouth:
        p.l(sn[0] - 1, sn[1] + 2, sn[0] + 1, sn[1] + 1 + mouth, (40, 14, 20))
    p.p(sn[0] + 1, sn[1] + 2, (230, 226, 210))            # fangs
    p.p(sn[0] - 1, sn[1] + 2 + mouth, (230, 226, 210))
    h0 = add(hc, (-1, -3))                                   # devil horns sweeping up and back
    p.lines([h0, add(h0, (-2, -2)), add(h0, (-3, -5)), add(h0, (-2, -8))], S4, 2)
    h1 = add(hc, (1, -3))
    p.lines([h1, add(h1, (0, -3)), add(h1, (1, -6))], S2, 1)
    p.poly([add(hc, (-3, -1)), add(hc, (-6, -2)), add(hc, (-3, 1))], S2)   # small pointed ear
    ex, ey = int(round(hc[0])) + 1, int(round(hc[1])) - 1
    if eyes == 1:
        p.p(ex, ey, EYE1); p.p(ex + 1, ey, EYE0)
    elif eyes == 2:
        p.r(ex, ey, ex + 1, ey, EYE1); p.p(ex + 2, ey, EYE0); p.p(ex + 1, ey - 1, EYE0)
    else:
        p.p(ex, ey, S0); p.p(ex + 1, ey, S1)
    limb(rel(S, 1, -1), ARM[arms], S3, 3, True)
    p.paste(wing_layer((0, 0), S1, S3), 0, 0)
    # stone grain and cracks
    a = np.array(p.im)
    rnd = np.random.default_rng(stone_seed)
    sel = a[:, :, 3] > 0
    stone = [S0, S1, S2, S3, S4]
    for y, x in np.argwhere(sel):
        col = tuple(int(v) for v in a[y, x, :3])
        if col in stone and rnd.random() < 0.07:
            i = stone.index(col) - 1
            a[y, x, :3] = stone[max(0, i)]
    im = Image.fromarray(a)
    if cracks:
        q = Pic(64, 64)
        q.paste(im, 0, 0)
        r2 = random.Random(cracks)
        ys, xs = np.nonzero(sel)
        for _ in range(cracks):
            i = r2.randrange(len(xs))
            x, y = xs[i], ys[i]
            for _ in range(5):
                if q.solid(x, y):
                    q.p(x, y, (30, 26, 34))
                x += r2.choice((-1, 0, 1)); y += 1
        im = q.im
    return outline_same(im)


def rock(w, h, seed, col=S3):
    """One outlined chunk of stone."""
    q = Pic(w + 2, h + 2)
    r2 = random.Random(seed)
    pts = [(r2.randint(0, 2), h), (0, r2.randint(1, h // 2 + 1)), (r2.randint(1, w // 2), 0), (w - r2.randint(0, 2), r2.randint(0, 2)),
           (w, h - r2.randint(0, 2)), (w // 2, h)]
    q.poly(pts, col)
    q.l(pts[1][0] + 1, pts[1][1], pts[2][0], pts[2][1] + 1, S4)
    q.p(w // 2, h - 1, S1)
    q.outline()
    return q.im


def rubble(seed, spread, cx=31, base_y=57, n=7, head=True, dust=0):
    p = Pic(64, 64)
    r2 = random.Random(seed)
    chunks = []
    for i in range(n):
        w, h = r2.randint(4, 8), r2.randint(3, 5)
        x = cx + r2.uniform(-spread, spread) - w / 2
        chunks.append((x, w, h, i))
    chunks.sort(key=lambda c: abs(c[0] + c[1] / 2 - cx))
    chunks.reverse()
    for x, w, h, i in chunks:
        im = rock(w, h, seed * 10 + i, r2.choice((S2, S3)))
        lift = r2.randint(2, 5) if abs(x + w / 2 - cx) < spread * 0.45 else 0   # heap up in the middle
        p.paste(im, x, base_y - im.height + 2 - lift)
    if head:                                     # a broken horn on top of the pile
        hd = Pic(8, 9)
        hd.lines([(1, 8), (2, 5), (4, 2), (7, 0)], S4, 2)
        hd.outline()
        p.paste(hd.im, cx - 1, base_y - 14)
    for i in range(dust):
        p.p(cx + r2.uniform(-spread - 5, spread + 5), base_y - r2.randint(4, 14), (152, 148, 152))
    return p.im


@builder('gargoyle')
def make_gargoyle():
    G = garg_frame
    # idle: frame 0 is the dormant statue (no glow, crisp stone); then it wakes, eyes glow, wings twitch
    idle = [G(eyes=0, lean=15), G(eyes=1, lean=15), G(eyes=1, head_dy=-1, lean=18), G(eyes=2, head_dy=-1, lean=15)]
    save_enemy('gargoyle', 'idle', idle, 64)
    mv = []
    for i, w in enumerate(('up', 'mid', 'down', 'mid')):
        mv.append(G(hip=(28, 38 + (0, 1, 2, 1)[i]), lean=55, wing=w, legs='dangle', arms='tuck', eyes=1, stone_seed=2 + i))
    save_enemy('gargoyle', 'movement', mv, 64)
    att = [G(hip=(26, 36), lean=45, wing='up', legs='dangle', arms='tuck', eyes=2, mouth=1),
           G(hip=(28, 38), lean=65, wing='up', legs='reach', arms='reach', eyes=2, mouth=2),
           G(hip=(32, 44), lean=80, wing='mid', legs='reach', arms='reach', eyes=2, mouth=2),
           G(hip=(35, 47), lean=75, wing='down', legs='reach', arms='reach', eyes=2, mouth=1),
           G(hip=(32, 42), lean=55, wing='mid', legs='dangle', arms='tuck', eyes=1),
           G(hip=(29, 39), lean=55, wing='up', legs='dangle', arms='tuck', eyes=1)]
    save_enemy('gargoyle', 'attack', att, 64)
    hurt = []
    for i, (dx, cr) in enumerate(((-3, 3), (-2, 4), (-1, 4))):
        f = G(hip=(30 + dx, 49), lean=15, eyes=1, cracks=cr, stone_seed=7)
        p = Pic(64, 64)
        p.paste(f, 0, 0)
        r2 = random.Random(i)
        for k in range(4 - i):   # stone chips flying off
            x, y = 40 + r2.randint(0, 6) + i * 2, 30 + r2.randint(0, 10) - i * 2
            p.r(x, y, x + 1, y, S3)
            p.p(x, y + 1, S1)
        hurt.append(p.im)
    hurt.append(G(eyes=1, lean=15))
    save_enemy('gargoyle', 'take_damage', hurt, 64)
    # death: cracks spread, it topples, breaks apart and settles as a rubble pile with the horned head on top
    d = [G(eyes=1, cracks=6), G(eyes=0, cracks=12, lean=40, hip=(31, 49))]
    tilt = rot(G(eyes=0, cracks=14, lean=40), -40, (30, 57))
    d.append(shift(tilt, 0, 57 - (tilt.getbbox()[3] - 1)))
    d.append(rubble(3, 9, n=13, dust=8))
    d.append(rubble(3, 10, n=13, dust=3))
    d.append(rubble(3, 10, n=13))
    save_enemy('gargoyle', 'death', d, 64)



# ================================================================== ICE WOLF (Gothicvania wolf running cycle, recoloured)
WOLF_MAP = {(123, 121, 148): (150, 182, 220), (91, 90, 111): (92, 124, 172), (212, 199, 193): (208, 226, 242),
            (255, 233, 214): (244, 250, 255), (36, 38, 75): (28, 36, 74), (35, 37, 74): (28, 36, 74),
            (240, 209, 115): (120, 240, 255), (118, 117, 132): (140, 170, 210)}
WL_N, WL_F, WL_S = (244, 250, 255), (150, 182, 220), (208, 226, 242)


def wolf_src():
    fr = load_frames(GVC + 'wolf-runing-cycle/spritesheets/wolf-runing-cycle-skin.png', 56)
    out = []
    for f in fr:   # into a 64 cell, floor row 31 -> 57
        c = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
        g = recolor(f, WOLF_MAP)
        c.paste(g, (4, 26), g)
        out.append(c)
    return out


def wolf_stand(src, breath=0, bob=0, tail=0):
    """Standing wolf: body of run frame 0 above the belly, four straight legs drawn under it."""
    body = keep(src, np.arange(64)[:, None] < 49 + 0 * np.array(src)[:, :, 3])
    p = Pic(64, 64)
    def hind(x, c, c2):   # thigh, backwards hock, thin cannon bone and paw
        p.r(x - 1, 47 + bob, x + 2, 50 + bob, c)
        p.l(x, 50 + bob, x - 1, 53, c, 2)
        p.l(x - 1, 53, x, 56, c2 if c2 else c, 1)
        p.p(x - 1, 56, c); p.p(x + 1, 56, c)

    def front(x, c):
        p.r(x, 47 + bob, x + 1, 53, c)
        p.l(x, 54, x, 56, c)
        p.p(x + 1, 56, c); p.p(x + 2, 56, c)
    hind(27, WL_F, None)
    front(43, WL_F)
    p.paste(shift(body, 0, bob), 0, 0)
    hind(23, WL_N, WL_S)
    front(40, WL_N)
    p.p(40, 51, WL_S)
    if tail:
        a = np.array(p.im)
        a[38 + bob:44 + bob, 8:18] = np.roll(a[38 + bob:44 + bob, 8:18], tail, axis=0)
        p.im = Image.fromarray(a); p.d = ImageDraw.Draw(p.im)
    if breath:
        for i, (dx, dy) in enumerate(((2, 0), (3, -1), (4, 0), (5, -1), (4, -2))[:breath + 2]):
            p.p(55 + dx, 45 + bob + dy, (236, 244, 255) if i % 2 else (200, 220, 240))
    return outline_same(p.im)


def snout(im):
    a = np.array(im)[:, :, 3] > 0
    ys, xs = np.nonzero(a)
    top = ys.min()
    sel = ys < top + 10
    sx = xs[sel].max()
    sy = int(np.median(ys[sel][xs[sel] >= sx - 1]))
    return sx, sy


def wolf_bite(im, w=2):
    p = Pic(64, 64)
    p.paste(im, 0, 0)
    sx, sy = snout(im)
    p.r(sx - 3, sy + 1, sx, sy + 1 + w, (90, 10, 30))
    p.ps([(sx - 3, sy + 1), (sx - 1, sy + 1), (sx - 2, sy + 1 + w), (sx, sy + 1 + w)], (250, 250, 255))
    return outline_same(p.im)


@builder('icewolf')
def make_icewolf():
    run = wolf_src()
    O = outline_same
    idle = [wolf_stand(run[0]), wolf_stand(run[0], bob=1), wolf_stand(run[0], breath=1), wolf_stand(run[0], bob=1, breath=2)]
    save_enemy('icewolf', 'idle', idle, 64)
    save_enemy('icewolf', 'movement', [O(f) for f in run], 64)
    st = idle[0]
    att = [O(shift(squash(run[0], 0.85, 58), -3, 0)),
           O(shift(rot(run[2], 10, (32, 50)), 2, -3)),
           wolf_bite(shift(rot(run[3], 6, (32, 50)), 6, -4), 2),
           wolf_bite(shift(run[3], 9, -1), 3),
           O(shift(run[1], 6, 0)),
           shift(st, 2, 0)]
    save_enemy('icewolf', 'attack', att, 64)
    save_enemy('icewolf', 'take_damage', [shift(st, -3, 0), O(squash(shift(run[0], -2, 0), 0.88, 58)), shift(st, -1, 0), st], 64)
    # death: rears, legs buckle, falls on its side; frost creeps over the body
    body = keep(run[0], np.arange(64)[:, None] < 49 + 0 * np.array(run[0])[:, :, 3])
    d = [rot(st, 8, (30, 57)), O(squash(run[0], 0.82, 58))]
    lb = body.crop(body.getbbox())
    for k in range(4):
        p = Pic(64, 64)
        ang = (-25, -10, 0, 0)[k]
        b2 = lb.rotate(ang, resample=Image.NEAREST, expand=True) if ang else lb
        by = 57 - b2.height + (3 if k >= 2 else 1)
        bx = 32 - b2.width // 2
        if k >= 1:   # stiff legs stretched forward along the floor
            for i, (x0, ln) in enumerate(((bx + 12, 7), (bx + 16, 6), (bx + 26, 7), (bx + 30, 6))):
                p.l(x0, 56 - (i % 2), x0 + ln, 55 - (i % 2), WL_F if i % 2 else WL_N, 2)
        p.paste(b2, bx, by)
        im = p.im
        if k == 3:   # frosted over
            im = recolor(im, {(150, 182, 220): (176, 204, 232), (92, 124, 172): (130, 164, 206), (120, 240, 255): (92, 124, 172)})
            q = Pic(64, 64); q.paste(im, 0, 0)
            for x, y in ((bx + 8, by + 2), (bx + 20, by + 1), (bx + 33, by + 3)):
                q.p(x, y - 1, ICE4); q.p(x, y - 2, ICE3); q.p(x + 1, y - 1, ICE3)
            im = q.im
        d.append(O(im))
    save_enemy('icewolf', 'death', d, 64)



# ================================================================== WISP (drawn: floating frost flame, 32px cells)
def wisp_frame(t=0.0, lean=0.0, sc=1.0, cy=15, eyes=1, mouth=0, cx=16, core=1.0):
    """Teardrop of cold fire. t = flicker phase, lean = tip offset (px), sc = size."""
    p = Pic(32, 32)
    r = 5.5 * sc
    top = cy - 11 * sc

    def prof(y, k):  # half width of layer k (1 outer .. smaller inner) at row y
        if y >= cy:
            d = (y - cy) / (r * k)
            return r * k * math.sqrt(max(0, 1 - d * d))
        u = (cy - y) / (cy - top) / k
        if u >= 1:
            return 0
        return r * k * (1 - u) ** 0.8 * (1 + 0.18 * math.sin(t * 6.28 + y * 0.9) * u)
    layers = ((1.0, ICE1), (0.78, ICE2), (0.55, CY1), (0.32 * core, CY2))
    for k, col in layers:
        for y in range(int(top) - 1, int(cy + r * k) + 2):
            w = prof(y, k)
            if w <= 0.3:
                continue
            u = max(0, (cy - y) / (cy - top))
            x0 = cx + lean * u * u + 0.8 * math.sin(t * 6.28 + y * 0.7) * u
            p.r(round(x0 - w), y, round(x0 + w) - 1, y, col)
    # side tongues
    for sgn in (-1, 1):
        h = 3 + 2 * (0.5 + 0.5 * math.sin(t * 6.28 + sgn))
        bx = cx + sgn * r * 0.8
        for i in range(int(h * sc)):
            p.p(bx + sgn * (i // 3) + lean * 0.2, cy - 2 - i, ICE2 if i < h - 1 else ICE1)
    if eyes:
        ey = cy - 1
        for ex in (cx - 2, cx + 2):
            p.r(ex, ey - (1 if eyes == 2 else 0), ex, ey + 1, ICE0)
        if mouth:
            p.r(cx - 1, cy + 2, cx + 1, cy + 2 + mouth, ICE0)
    return outline_same(p.im)


def shards(p, cx, cy, d, n=8, seed=1, fall=0.0, floor=None):
    r2 = random.Random(seed)
    for i in range(n):
        ang = i / n * math.tau + r2.uniform(-0.3, 0.3)
        dist = d * r2.uniform(0.7, 1.2)
        x = cx + math.cos(ang) * dist
        y = cy + math.sin(ang) * dist + fall * fall * 6
        if floor is not None:
            y = floor - r2.randint(0, 1)
            x = cx + math.cos(ang) * (d * 0.7 + r2.uniform(0, 3))
        ln = r2.randint(2, 3)
        dx, dy = (round(math.cos(ang)), round(math.sin(ang))) if floor is None else (1, 0)
        for j in range(ln):
            p.p(x + dx * j, y + dy * j, ICE4 if j == 0 else ICE3)
        p.p(x - dx, y - dy, ICE2)


@builder('wisp')
def make_wisp():
    W = wisp_frame
    idle = [W(t=i / 6, cy=15 + (0, 0, -1, -1, -1, 0)[i]) for i in range(6)]
    save_enemy('wisp', 'idle', idle, 32)
    save_enemy('wisp', 'movement', [W(t=i / 6, lean=3 + (i % 2), cy=15 + (0, -1, -1, 0, 1, 1)[i]) for i in range(6)], 32)
    att = [W(t=0.1, sc=0.9, eyes=2), W(t=0.3, sc=1.1, eyes=2, mouth=1), W(t=0.5, sc=1.25, eyes=2, mouth=2, core=1.6),
           W(t=0.7, sc=1.3, eyes=2, mouth=2, lean=3, core=1.8), W(t=0.9, sc=1.1, eyes=2, mouth=1, lean=2), W(t=0.1, sc=1.0)]
    att2 = []
    for i, f in enumerate(att):   # frost sparks blown forward on the strongest frames
        p = Pic(32, 32)
        p.paste(f, 0, 0)
        if i in (2, 3, 4):
            r2 = random.Random(i)
            for _ in range(5):
                x, y = 23 + r2.randint(0, 7), 10 + r2.randint(0, 8)
                p.p(x, y, ICE4); p.p(x - 1, y, CY1)
        att2.append(p.im)
    save_enemy('wisp', 'attack', att2, 32)
    save_enemy('wisp', 'take_damage', [W(t=0.2, sc=0.85, cx=14, eyes=2), W(t=0.4, sc=0.75, cx=15, core=0.4), W(t=0.6, sc=0.9), W(t=0.8)], 32)
    d = [W(t=0.2, sc=1.15, core=2.0, eyes=2)]
    p = Pic(32, 32)    # flash
    p.e(10, 9, 22, 21, ICE3); p.e(12, 11, 20, 19, ICE4); shards(p, 16, 15, 7, 8, 1)
    d.append(outline_same(p.im))
    for k, (dist, fall) in enumerate(((10, 0.0), (12, 0.6), (13, 1.0))):
        p = Pic(32, 32)
        if k == 0:
            p.e(13, 12, 19, 18, ICE2)
        shards(p, 16, 15, dist, 9, 1, fall)
        im = p.im
        a = np.array(im); a[29:] = 0; im = Image.fromarray(a)
        d.append(outline_same(im))
    p = Pic(32, 32)    # shards lying on the floor
    shards(p, 16, 0, 8, 7, 2, floor=28)
    d.append(outline_same(p.im))
    save_enemy('wisp', 'death', d, 32)



# ================================================================== FROST BOSS: ISDRAKEN (Gothicvania Grotto-escape-2 dragon, recoloured)
DRAGON_MAP = {(82, 12, 30): (64, 104, 166), (55, 14, 36): (30, 40, 84), (107, 19, 22): (98, 150, 206), (89, 43, 11): (84, 124, 178),
              (163, 37, 21): (150, 198, 236), (135, 76, 20): (140, 186, 226), (173, 109, 29): (190, 224, 248),
              (219, 114, 43): (228, 246, 255), (235, 219, 47): (140, 250, 255),
              (255, 141, 7): (120, 214, 255), (255, 214, 133): (236, 252, 255), (242, 74, 2): (56, 140, 214)}
BREATH_COLS = [(120, 214, 255), (236, 252, 255), (56, 140, 214)]


def dragon_src(name):
    fr = load_frames(GVC + f'Grotto-escape-2-boss-dragon/spritesheets/{name}.png', 144)
    return [recolor(f, DRAGON_MAP).transpose(Image.FLIP_LEFT_RIGHT) for f in fr]


def frost_breath(f, seed):
    """Sprinkle ice crystals into the (recoloured) breath so it reads as frost, not blue fire."""
    m = colors_mask(f, BREATH_COLS)
    p = Pic(f.width, f.height)
    p.paste(f, 0, 0)
    r2 = random.Random(seed)
    ys, xs = np.nonzero(m)
    for i in range(len(xs) // 14):
        j = r2.randrange(len(xs))
        x, y = xs[j], ys[j]
        p.p(x, y, (255, 255, 255)); p.p(x + 1, y - 1, ICE3)
    return p.im


@builder('boss')
def make_boss():
    idle, tail, breath = dragon_src('idle'), dragon_src('tail'), dragon_src('breath')
    breath = [frost_breath(f, i) for i, f in enumerate(breath)]
    bb = None
    for im in idle + tail + breath:
        b = im.getbbox()
        bb = b if bb is None else (min(bb[0], b[0]), min(bb[1], b[1]), max(bb[2], b[2]), max(bb[3], b[3]))
    bb = (bb[0] - 2, bb[1] - 4, bb[2] + 2, bb[3])
    W_, H_ = bb[2] - bb[0], bb[3] - bb[1]

    def C(im):
        return outline_same(im.crop(bb))

    def save_b(name, frames):
        out = Image.new('RGBA', (W_ * len(frames), H_), (0, 0, 0, 0))
        for i, f in enumerate(frames):
            out.paste(hard(f), (i * W_, 0))
        save(out, G_OUT + f'boss_frost_{name}.png', len(frames))
    save_b('idle', [C(f) for f in idle])
    save_b('attack', [C(f) for f in tail])
    save_b('cast', [C(f) for f in breath])
    # hurt: recoil with a pale flash
    i0 = idle[0]
    feet = i0.getbbox()[3]
    save_b('hurt', [C(shift(tint(i0, (255, 255, 255), 0.45), -4, 0)), C(shift(i0, -3, 0)), C(shift(i0, -1, 0))])
    # death: rears up, collapses onto its belly, wings fold flat and ice grows over the body
    b0 = i0.getbbox()
    piv = ((b0[0] + b0[2]) // 2, feet - 1)
    d = [C(rot(i0, 8, piv)), C(squash(i0, 0.88, feet)), C(squash(rot(i0, -6, piv), 0.72, feet)), C(squash(i0, 0.55, feet))]
    flat = squash(i0, 0.45, feet)
    for k in range(2):
        g = flat if k == 0 else recolor(flat, {(64, 104, 166): (150, 196, 230), (98, 150, 206): (196, 228, 248), (84, 124, 178): (170, 210, 240),
                                               (30, 40, 84): (84, 130, 186), (140, 250, 255): (84, 130, 186)})
        p = Pic(144, 64)
        p.paste(g, 0, 0)
        if k == 1:   # ice spikes over the frozen corpse
            fb = g.getbbox()
            r2 = random.Random(4)
            ga = np.array(g)[:, :, 3] > 0
            for _ in range(7):
                x = r2.randint(fb[0] + 8, fb[2] - 8)
                col = np.nonzero(ga[:, x])[0]
                if not len(col):
                    continue
                ty = col.min() + 2
                h = r2.randint(3, 7)
                p.poly([(x - 2, ty), (x, ty - h), (x + 2, ty)], ICE3)
                p.l(x, ty - h + 1, x, ty - 1, ICE4)
        d.append(C(p.im))
    save_b('death', d)
    print('boss_frost frame', (W_, H_))



# ================================================================== TEXTURES (half-res, x2 nearest, palettized like biome-textures)
def finish(rgb, name, colors=48):
    im = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), 'RGB')
    im = im.resize((im.width * 2, im.height * 2), Image.NEAREST)
    save(im.quantize(colors, method=Image.Quantize.MEDIANCUT), W_OUT + name)


def edge(m):
    return m & ~(np.roll(m, 1, 0) & np.roll(m, -1, 0) & np.roll(m, 1, 1) & np.roll(m, -1, 1))


def icicles(rgb, seed, n=9, maxlen=12, y0=0, dark=False):
    """Icicles hanging from row y0 (half-res array, wraps horizontally)."""
    h, w = rgb.shape[:2]
    r2 = random.Random(seed)
    for i in range(n):
        x = int(i * w / n + r2.randint(0, 2)) % w
        ln = r2.randint(3, maxlen)
        wd = 2 if ln > 6 else 1
        for y in range(ln):
            ww = wd if y < ln * 0.5 else 1
            for dx in range(ww):
                xx = (x + dx) % w
                rgb[y0 + y, xx] = ICE4 if dx == 0 and y < ln - 1 else (ICE3 if not dark else ICE2)
        rgb[y0 + ln - 1, x] = ICE2
    return rgb


def snow_line(rgb, depth=3, seed=3):
    """Snow drift along the bottom of a wall."""
    h, w = rgb.shape[:2]
    r2 = random.Random(seed)
    for x in range(w):
        d = depth + round(1.2 * math.sin(x / w * math.tau * 2 + 1) + r2.uniform(-0.6, 0.6))
        for y in range(h - d, h):
            rgb[y, x] = SNOW2 if y == h - d else SNOW1
    return rgb


def brick_mask(w, h, bh=6, bw=11, seed=1):
    """Staggered brick layout at half res: returns (mortar mask, brick id)."""
    r2 = random.Random(seed)
    yy, xx = np.mgrid[0:h, 0:w]
    row = yy // bh
    off = np.where(row % 2 == 1, bw // 2, 0)
    col = ((xx + off) // bw)
    mortar = (yy % bh == 0) | (((xx + off) % bw) == 0)
    bid = row * 100 + col % (w // bw if w % bw == 0 else 1000)
    return mortar, bid


def frost_bricks(w, h, stops, seed=1, frost=0.8):
    mortar, bid = brick_mask(w, h, 6, 8 if w % 8 == 0 else 11, seed)
    grain = tile_lum(C64 + 'Rocks/Materials/rock_wall_04.jpg', (w, h), (1, 2))
    r2 = np.random.default_rng(seed)
    tone = {b: r2.uniform(0.45, 0.85) for b in np.unique(bid)}
    base = np.vectorize(tone.get)(bid)
    v = np.clip(base + (grain - 0.5) * 0.35, 0, 1)
    v[mortar] = 0.05
    # bevel: lit top-left edge, dark bottom-right edge of every brick
    v[~mortar & np.roll(mortar, 1, 1)] += 0.12
    v[~mortar & np.roll(mortar, -1, 0)] -= 0.15
    rgb = gmap(np.clip(v, 0, 1), stops)
    cap = ~mortar & np.roll(mortar, 1, 0)          # rime on the top edge of every brick
    rgb = blend(rgb, cap, SNOW1, frost)
    rgb = blend(rgb, mortar & (r2.random((h, w)) < 0.35), ICE2, 0.5 * frost)   # frost in the joints
    sp = (r2.random((h, w)) < 0.012) & ~mortar
    rgb[sp] = ICE4
    return rgb, mortar


def tex_wall_frost():
    w, h = 32, 64
    rgb, mortar = frost_bricks(w, h, [(0, (22, 30, 50)), (0.35, (52, 66, 96)), (0.7, (88, 106, 138)), (1, (128, 146, 176))], 1)
    yy = np.mgrid[0:h, 0:w][0]
    rgb = blend(rgb, np.ones((h, w), bool), (170, 210, 255), 0.0)
    rgb = rgb + (np.clip((yy - 44) / 20, 0, 1) ** 1.5)[..., None] * np.array((20, 34, 50))   # cold light near the floor
    rgb = icicles(rgb, 5, 8, 12)
    rgb = snow_line(rgb, 3)
    finish(rgb, 'wall_frost.png')


def tex_floor_snow():
    w = h = 32
    lum = tile_lum(C64 + 'Ground/Materials/snow_01.jpg', (w, h), (1, 1))
    lum2 = tile_lum(C64 + 'Ground/Materials/snow_04.jpg', (w, h), (2, 2))
    v = np.clip(lum * 0.7 + lum2 * 0.3, 0, 1)
    rgb = gmap(v, [(0, (140, 160, 196)), (0.4, (186, 202, 228)), (0.75, (222, 232, 246)), (1, (250, 252, 255))])
    rnd = np.random.default_rng(3)
    rgb[rnd.random((h, w)) < 0.02] = (255, 255, 255)
    rgb[rnd.random((h, w)) < 0.01] = (150, 200, 240)
    finish(rgb, 'floor_snow.png', 32)


def tex_floor_frost_stone():
    w = h = 32
    r2 = random.Random(12)
    pts = [(r2.uniform(0, w), r2.uniform(0, h)) for _ in range(9)]
    idx, d1, d2 = voronoi_cells(w, h, pts)
    grain = tile_lum(C64 + 'Ground/Materials/ice_01.jpg', (w, h), (1, 1))
    tone = np.array([r2.uniform(0.4, 0.8) for _ in pts])[idx]
    grout = (d2 - d1) < 1.0
    v = np.clip(tone + (grain - 0.5) * 0.3 - (d1 / 14) * 0.15, 0, 1)
    rgb = gmap(v, [(0, (30, 40, 62)), (0.35, (62, 78, 108)), (0.7, (100, 122, 154)), (1, (146, 168, 198))])
    rgb[grout] = (22, 28, 46)
    snow = tile_lum(C64 + 'Ground/Materials/snow_01.jpg', (w, h), (1, 1))
    rgb = blend(rgb, grout & (snow > 0.6), (150, 172, 204), 0.7)      # snow packed in the joints
    rgb = blend(rgb, (snow > 0.82) & ~grout, (190, 210, 234), 0.5)       # frost patches
    lit = ~grout & np.roll(grout, 1, 0)
    rgb = blend(rgb, lit, ICE3, 0.35)
    rnd = np.random.default_rng(4)
    rgb[(rnd.random((h, w)) < 0.015) & ~grout] = ICE4
    finish(rgb, 'floor_frost_stone.png')


def voronoi_cells(w, h, pts, sy=1.0):
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    d = []
    for (px, py) in pts:
        dx = np.abs(xx - px); dx = np.minimum(dx, w - dx)
        dy = np.abs(yy - py); dy = np.minimum(dy, h - dy)
        d.append(np.sqrt(dx ** 2 + (dy * sy) ** 2))
    d = np.stack(d)
    o = np.argsort(d, axis=0)
    return o[0], np.take_along_axis(d, o[:1], 0)[0], np.take_along_axis(d, o[1:2], 0)[0]


def tex_wall_ice_crystal():
    """Translucent blue ice: tall crystal facets, bright facet edges, a dark depth with frozen bubbles."""
    w, h = 32, 64
    r2 = random.Random(9)
    pts = [(r2.uniform(0, w), r2.uniform(0, h)) for _ in range(14)]
    idx, d1, d2 = voronoi_cells(w, h, pts, sy=0.45)
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    shade = np.array([r2.uniform(0.2, 1.0) for _ in pts])[idx]
    # each facet gets a diagonal gradient (light from the top left) -> looks faceted and glassy
    grad = np.zeros((h, w))
    for i, (px, py) in enumerate(pts):
        m = idx == i
        grad[m] = np.clip(0.5 + ((px - xx[m]) * 0.05 + (py - yy[m]) * 0.025), 0, 1)
    v = np.clip(shade * 0.55 + grad * 0.45, 0, 1)
    rgb = gmap(v, [(0, (16, 40, 86)), (0.35, (34, 90, 150)), (0.6, (70, 150, 210)), (0.85, (140, 210, 245)), (1, (210, 245, 255))])
    # inner depth: darker vertical streaks behind the surface
    deep = tile_lum(C64 + 'Water/river_ice_01.jpg', (w, h), (1, 2))
    rgb = rgb * (0.75 + 0.35 * deep[..., None])
    ridge = (d2 - d1) < 0.9
    rgb = blend(rgb, ridge, (200, 240, 255), 0.8)
    rgb = blend(rgb, ridge & np.roll(ridge, 1, 1), (255, 255, 255), 0.5)
    rnd = np.random.default_rng(2)
    for _ in range(10):                          # frozen bubbles
        x, y = rnd.integers(0, w), rnd.integers(0, h)
        rgb[y, x] = (180, 230, 255); rgb[y, (x + 1) % w] = (90, 160, 220)
    rgb = icicles(rgb, 11, 6, 8)
    finish(rgb, 'wall_ice_crystal.png')


def snowflake(d, cx, cy, r, fill=255, w=1):
    for k in range(6):
        a = k * math.pi / 3 + math.pi / 2
        ex, ey = cx + math.cos(a) * r, cy - math.sin(a) * r
        d.line((cx, cy, ex, ey), fill=fill, width=w)
        for t in (0.45, 0.72):
            bx, by = cx + math.cos(a) * r * t, cy - math.sin(a) * r * t
            for s_ in (-1, 1):
                b = a + s_ * math.pi / 4
                d.line((bx, by, bx + math.cos(b) * r * 0.28, by - math.sin(b) * r * 0.28), fill=fill, width=1)


def tex_boss_frost():
    w, h = 32, 64
    rgb, mortar = frost_bricks(w, h, [(0, (14, 20, 40)), (0.35, (34, 48, 84)), (0.7, (62, 84, 126)), (1, (96, 122, 166))], 7, 0.6)
    # carved round seal with a glowing snowflake
    def seal(d, ox, oy):
        d.ellipse((5 + ox, 18 + oy, 26 + ox, 39 + oy), fill=255)
    sm = mask_draw(w, h, seal, wrap=False) > 0.5
    stone = gmap(tile_lum(C64 + 'Rocks/Materials/rock_wall_04.jpg', (w, h), (1, 2)) * 0.4 + 0.3,
                 [(0, (40, 56, 90)), (1, (90, 116, 156))])
    rgb[sm] = stone[sm]
    rgb[edge(sm)] = (12, 16, 30)
    rgb = blend(rgb, edge(sm) & np.roll(edge(sm), -1, 0), (120, 150, 190), 0.6)
    def flake(d, ox, oy):
        snowflake(d, 15.5 + ox, 28.5 + oy, 8.5)
    fm = mask_draw(w, h, flake, wrap=False) > 0.4
    rgb = rgb + glow(fm.astype(float), 1.6)[..., None] * np.array((40, 110, 170))
    rgb = blend(rgb, fm, (190, 245, 255), 1.0)
    # frozen chains / banner of ice hanging at the top and frost light from below
    yy = np.mgrid[0:h, 0:w][0]
    rgb = rgb + (np.clip((yy - 46) / 18, 0, 1) ** 1.4)[..., None] * np.array((16, 50, 90))
    rgb = icicles(rgb, 21, 10, 13)
    rgb = snow_line(rgb, 2, 5)
    finish(rgb, 'wall_boss_frost.png')

    # floor: dark polished ice tiles 2x2, each with a faint snowflake, glowing cracks
    w = h = 32
    lum = tile_lum(C64 + 'Ground/Materials/ice_01.jpg', (w, h), (2, 2))
    yy, xx = np.mgrid[0:h, 0:w]
    checker = ((xx // 16) + (yy // 16)) % 2
    a = gmap(lum * 0.4 + 0.45, [(0, (30, 54, 96)), (1, (84, 128, 178))])
    b = gmap(lum * 0.4 + 0.35, [(0, (20, 38, 74)), (1, (62, 100, 150))])
    rgb = np.where(checker[..., None] == 0, a, b)
    grout = (xx % 16 == 0) | (yy % 16 == 0)
    rgb[grout] = (10, 16, 32)
    rgb[(xx % 16 == 1) & ~grout] = rgb[(xx % 16 == 1) & ~grout] * 1.15
    def flakes(d, ox, oy):
        for cx_, cy_ in ((8, 8), (24, 24)):
            snowflake(d, cx_ + ox, cy_ + oy, 5)
    fm = mask_draw(w, h, flakes) > 0.4
    rgb = blend(rgb, fm, (120, 176, 220), 0.55)
    def cracks(d, ox, oy):
        d.line([(19 + ox, 3 + oy), (22 + ox, 6 + oy), (21 + ox, 10 + oy), (25 + ox, 13 + oy)], fill=255)
        d.line([(3 + ox, 20 + oy), (6 + ox, 23 + oy), (5 + ox, 27 + oy), (9 + ox, 29 + oy)], fill=255)
    cm = mask_draw(w, h, cracks)
    rgb = blend(rgb, cm > 0.5, (170, 230, 255), 0.9)
    rgb = rgb + glow(cm, 1.2)[..., None] * np.array((10, 40, 70))
    finish(rgb, 'floor_boss_frost.png')


@builder('textures')
def make_textures():
    tex_wall_frost(); tex_floor_snow(); tex_floor_frost_stone(); tex_wall_ice_crystal(); tex_boss_frost()



# ================================================================== PETS (drawn)
RV0, RV1, RV2 = (20, 18, 30), (40, 38, 58), (74, 78, 112)


def raven_frame(w):
    """16x16 raven in flight facing right; w = wing phase: 0 up, 1 mid, 2 down."""
    p = Pic(16, 16)
    p.poly([(2, 9), (5, 8), (5, 10)], RV1)                    # tail
    p.e(4, 7, 11, 11, RV1)                                   # body
    p.e(9, 6, 13, 9, RV1)                                    # head
    p.poly([(13, 7), (15, 8), (13, 9)], (70, 66, 70))        # beak
    p.p(11, 7, (230, 220, 150))                              # eye
    p.l(5, 9, 10, 9, RV2)
    if w == 0:
        p.poly([(6, 8), (9, 8), (5, 1), (3, 2)], RV0); p.l(5, 2, 8, 7, RV2)
    elif w == 1:
        p.poly([(5, 8), (10, 8), (3, 5), (1, 6)], RV0); p.l(2, 6, 8, 8, RV2)
    else:
        p.poly([(5, 9), (10, 9), (4, 14), (2, 13)], RV0); p.l(3, 13, 8, 9, RV2)
    p.ps([(8, 11), (9, 12)], (70, 66, 70))                   # tucked feet
    return outline_same(p.im)


def lantern_frame(k):
    """16x18 floating lantern with a little wisp flame; k = 0..3 flicker/bob."""
    p = Pic(16, 18)
    bob = (0, 1, 1, 0)[k]
    p.eo(5, 0 + bob, 10, 4 + bob, I2)                        # ring handle
    p.r(4, 4 + bob, 11, 5 + bob, I1)                         # cap
    p.r(5, 3 + bob, 10, 3 + bob, I2)
    p.r(4, 6 + bob, 11, 13 + bob, (255, 200, 90))            # glass glow
    p.r(5, 7 + bob, 10, 12 + bob, (255, 226, 140))
    fl = [(7, 11), (8, 11), (7, 10), (8, 10), (7 + (k % 2), 9), (8 - (k // 2), 8)]
    p.ps(fl[:6], (255, 250, 220))
    p.ps([(7, 12), (8, 12)], F1)
    for x in (4, 11):
        p.l(x, 6 + bob, x, 13 + bob, I1)                     # frame bars
    p.l(7, 6 + bob, 7, 7 + bob, I1)
    p.r(4, 14 + bob, 11, 14 + bob, I1)
    p.r(6, 15 + bob, 9, 15 + bob, I0)
    im = outline_same(p.im)
    q = Pic(16, 18); q.paste(im, 0, 0)
    q.p(1 + (k % 2), 8 + bob - k, (255, 230, 150))           # drifting spark
    q.p(14 - (k % 2), 12 + bob - k, (255, 200, 100))
    return q.im


PUP0, PUP1, PUP2, PUP3 = (70, 70, 86), (118, 118, 134), (160, 160, 172), (214, 210, 204)


def pup_frame(step=0, bob=0, mouth=0, crouch=0, lunge=0, tail=0):
    """Wolf pup in a 32x32 cell, feet on row 28, facing right."""
    p = Pic(32, 32)
    bx, by = 13 + lunge, 22 + bob + crouch
    # tail
    p.lines([(bx - 6, by - 1), (bx - 9, by - 3 - tail), (bx - 11, by - 4 - tail)], PUP1, 3)
    p.p(bx - 12, by - 4 - tail, PUP3)
    legs = [(bx - 4, 0), (bx - 2, 1), (bx + 4, 1), (bx + 6, 0)]
    off = [(0, 0, 0, 0), (1, -1, 1, -1), (0, 0, 0, 0), (-1, 1, -1, 1)][step % 4]
    for i, ((lx, far), o) in enumerate(zip(legs, off)):
        if far:
            p.l(lx + o, by + 2, lx + o * 2, 28, PUP0, 2)
    p.e(bx - 7, by - 4, bx + 7, by + 2, PUP1)                 # body
    p.e(bx - 5, by - 1, bx + 5, by + 2, PUP3)                 # belly
    p.l(bx - 6, by - 4, bx + 4, by - 4, PUP2)
    for i, ((lx, far), o) in enumerate(zip(legs, off)):
        if not far:
            p.l(lx + o, by + 2, lx + o * 2, 28, PUP2, 2)
            p.p(lx + o * 2 + 1, 28, PUP3)
    hx, hy = bx + 8, by - 5 - crouch // 2
    p.e(hx - 4, hy - 4, hx + 4, hy + 4, PUP1)                 # big head
    p.poly([(hx - 3, hy - 3), (hx - 4, hy - 7), (hx - 1, hy - 4)], PUP1)    # ears
    p.poly([(hx, hy - 4), (hx + 1, hy - 7), (hx + 3, hy - 3)], PUP2)
    p.r(hx + 2, hy, hx + 6, hy + 2, PUP3)                    # muzzle
    p.p(hx + 6, hy, (20, 18, 24))                            # nose
    p.p(hx + 1, hy - 2, (20, 18, 24))                        # eye
    p.p(hx + 1, hy - 3, (140, 220, 255))
    if mouth:
        p.r(hx + 2, hy + 2, hx + 5, hy + 2 + mouth, (110, 20, 30))
        p.p(hx + 5, hy + 2, (250, 250, 250)); p.p(hx + 3, hy + 2, (250, 250, 250))
    return outline_same(p.im)


@builder('pets')
def make_pets():
    save(cells([raven_frame(w) for w in (0, 1, 2, 1)], 16, 16), G_OUT + 'pet_raven.png', 4)
    save(cells([lantern_frame(k) for k in range(4)], 16, 18), G_OUT + 'pet_lantern.png', 4)
    save(cells([pup_frame(bob=(0, 0, 1, 1)[i], tail=(0, 1, 2, 1)[i]) for i in range(4)], 32, 32), G_OUT + 'pet_pup_idle.png', 4)
    save(cells([pup_frame(step=i, bob=(0, -1, 0, -1)[i], tail=1) for i in range(4)], 32, 32), G_OUT + 'pet_pup_movement.png', 4)
    save(cells([pup_frame(crouch=2, tail=0), pup_frame(lunge=4, bob=-2, mouth=2, tail=2), pup_frame(lunge=2, mouth=1, tail=1)], 32, 32),
         G_OUT + 'pet_pup_attack.png', 3)


# ================================================================== POTIONS (drawn, 12x16)
POTIONS = {'heal': ((120, 16, 30), (196, 36, 48), (255, 110, 110)), 'rage': ((150, 60, 10), (236, 120, 30), (255, 196, 90)),
           'ghost': ((70, 24, 100), (140, 60, 196), (214, 150, 255)), 'speed': ((30, 96, 30), (70, 180, 50), (170, 245, 120)),
           'ice': ((20, 100, 140), (60, 196, 230), (190, 248, 255)), 'unknown': ((70, 70, 80), (124, 124, 136), (184, 184, 196))}
GLASS0, GLASS1 = (150, 170, 190), (210, 226, 236)


def potion(name):
    d0, d1, d2 = POTIONS[name]
    p = Pic(10, 14)
    p.r(3, 0, 6, 1, W3); p.r(3, 0, 3, 1, W2)                 # cork
    p.r(3, 2, 6, 4, GLASS0); p.p(4, 3, GLASS1)               # neck
    p.e(0, 4, 9, 13, GLASS0)                                 # round body (glass)
    p.e(1, 7, 8, 13, d1)                                     # liquid
    p.r(1, 7, 8, 7, d2)                                      # liquid surface
    p.e(4, 9, 8, 13, d0)                                     # shadow side
    p.r(2, 5, 2, 7, GLASS1); p.p(2, 9, (255, 255, 255))      # glint
    if name == 'unknown':
        p.bitmap(3, 7, ['.##.', '...#', '..#.', '....', '..#.'], {'#': (250, 250, 250)})
    elif name == 'ghost':
        p.ps([(5, 9), (3, 11)], d2)
    elif name == 'speed':
        p.ps([(3, 10), (4, 9), (5, 10), (6, 9)], d2)
    elif name == 'ice':
        p.ps([(4, 9), (4, 11), (3, 10), (5, 10)], (255, 255, 255))
    elif name == 'rage':
        p.ps([(4, 11), (5, 10), (5, 12)], (255, 240, 170))
    else:
        p.ps([(3, 10), (5, 10), (4, 11)], d2)
    p.outline()
    return p.im


@builder('potions')
def make_potions():
    for n in POTIONS:
        save(hard(potion(n)), G_OUT + f'potion_{n}.png')


# ================================================================== NPCS (Pixel Crawler Wizzard, recoloured) and the pet cage
def wiz_src():
    return load_frames(NPC + 'Wizzard/Idle/Idle-Sheet.png', 32)


WIZ_P = [(147, 45, 139), (95, 46, 92), (67, 35, 65), (38, 26, 38)]


def region_recolor(im, top_map, bottom_map, split):
    a = recolor(im, top_map)
    b = recolor(im, bottom_map)
    out = np.array(b).copy()
    out[:split] = np.array(a)[:split]
    return Image.fromarray(out)


def flask(p, x, y, k, liq=((40, 150, 60), (120, 230, 90), (210, 255, 170))):
    """Little round flask held at (x, y) bottom-left, bubbles rise with frame k."""
    p.r(x + 2, y - 7, x + 3, y - 5, GLASS1)                 # neck
    p.p(x + 2, y - 8, W3); p.p(x + 3, y - 8, W3)
    p.e(x, y - 5, x + 5, y, GLASS0)
    p.e(x + 1, y - 3, x + 4, y, liq[1])
    p.r(x + 1, y - 3, x + 4, y - 3, liq[2])
    p.p(x + 1, y - 4, (255, 255, 255))
    p.r(x - 1, y - 2, x, y - 1, (240, 154, 83))              # hand
    for i in range(3):                                       # bubbles
        by = y - 9 - ((k + i * 2) % 5) * 2
        p.p(x + 2 + (i % 2), by, liq[2] if i != 1 else (255, 255, 255))


@builder('npcs')
def make_npcs():
    src = wiz_src()
    hat = {WIZ_P[0]: (120, 78, 50), WIZ_P[1]: (88, 56, 38), WIZ_P[2]: (62, 40, 30), WIZ_P[3]: (40, 26, 22)}
    robe = {WIZ_P[0]: (46, 120, 108), WIZ_P[1]: (30, 84, 78), WIZ_P[2]: (20, 58, 56), WIZ_P[3]: (14, 36, 36)}
    out = []
    for k, f in enumerate(src):
        beard = np.nonzero(colors_mask(f, [(253, 253, 253)]).any(1))[0].min()
        g = region_recolor(f, hat, robe, beard - 1)
        p = Pic(32, 32)
        p.paste(g, 0, 0)
        flask(p, 24, 24 - (k % 2 == 1) * 0, k)
        out.append(outline_same(recolor(p.im, {(20, 20, 18): OUT})))
    save(cells(out, 32, 32), G_OUT + 'npc_alchemist.png', 4)
    # priest: white and gold robe, the wizard hat trimmed into a mitre, a lit candle in the hand
    mitre = {WIZ_P[0]: (236, 232, 220), WIZ_P[1]: (196, 188, 170), WIZ_P[2]: (150, 140, 124), WIZ_P[3]: (90, 80, 74),
             (240, 154, 83): (226, 186, 70), (128, 74, 30): (170, 120, 40)}
    vest = {WIZ_P[0]: (228, 224, 212), WIZ_P[1]: (186, 178, 162), WIZ_P[2]: (140, 130, 118), WIZ_P[3]: (80, 72, 68),
            (128, 74, 30): (200, 160, 60), (71, 40, 13): (150, 110, 40)}
    out = []
    for k, f in enumerate(src):
        fa = np.array(f)
        beard = np.nonzero(colors_mask(f, [(253, 253, 253)]).any(1))[0].min()
        g = region_recolor(f, mitre, vest, beard - 3)
        a = np.array(g)
        cx = 16 + (1 if k % 2 else 0)
        hatc = set(WIZ_P) | {(20, 20, 18), (128, 74, 30), (240, 154, 83)}
        for y in range(0, beard + 1):      # cut the brim: keep only the middle columns above the face
            for x in range(32):
                if abs(x - cx) > 5 - (1 if y < 3 else 0) and (y < beard - 3 or tuple(int(v) for v in fa[y, x, :3]) in hatc - {(240, 154, 83)}):
                    a[y, x] = 0
        g = Image.fromarray(a)
        p = Pic(32, 32)
        p.paste(g, 0, 0)
        cx = 16 + (1 if k % 2 else 0)
        p.l(cx, 3, cx, 8, GOLD1); p.l(cx - 2, 5, cx + 2, 5, GOLD1)    # cross on the mitre
        p.l(15, 13, 15, 30, GOLD0)                                     # stole
        # candle in the front hand
        x, y = 24, 22
        p.r(x - 1, y, x + 1, y + 1, (240, 154, 83))
        p.r(x, y - 5, x + 1, y, (236, 226, 196)); p.p(x, y - 5, (255, 250, 230))
        p.p(x + 1, y - 2, (200, 186, 150))
        fl = [(x, y - 6), (x + (k % 2), y - 7), (x + (1 if k == 2 else 0), y - 8)]
        p.ps(fl[:2 + (k % 2)], F2)
        p.p(x, y - 6, F3)
        im = outline_same(recolor(p.im, {(20, 20, 18): OUT}))
        out.append(im)
    save(cells(out, 32, 32), G_OUT + 'npc_priest.png', 4)


def cage_frame(open_=False):
    p = Pic(30, 30)
    if not open_:   # a wolf pup sitting inside
        pup = pup_frame(bob=1)
        pup = pup.crop(pup.getbbox())
        p.paste(pup, 15 - pup.width // 2, 26 - pup.height)
    p.r(1, 25, 28, 28, W2); p.r(1, 25, 28, 25, W3); p.l(1, 28, 28, 28, W1)     # wooden base
    p.arc(2, 2, 27, 20, 180, 360, I2, 2)                                       # domed top
    p.r(13, 0, 16, 1, I1)                                                      # ring
    p.eo(12, -2, 17, 3, I2)
    for x in range(3, 28, 6):
        if open_ and 7 <= x <= 22 and x != 3:
            continue
        top = 11 - round(math.sqrt(max(0, 1 - ((x - 14.5) / 12.5) ** 2)) * 9)
        p.l(x, top, x, 24, I1)
        p.p(x, top + 1, I3)
    p.l(2, 11, 27, 11, I1)
    if open_:   # the door swung open to the right, the bars seen at an angle
        for i, x in enumerate((24, 26, 28)):
            p.l(x + 1, 12 + i, x + 1, 24 - i, I1)
        p.l(25, 12, 29, 14, I1); p.l(25, 24, 29, 22, I1)
        p.ps([(10, 23), (13, 24), (18, 24)], (150, 140, 120))   # straw
    p.outline()
    return p.crop()


@builder('cage')
def make_cage():
    save(cells([cage_frame(False), cage_frame(True)], 30, 30), G_OUT + 'prop_petcage.png', 2)


# ================================================================== PARTICLES
@builder('particles')
def make_particles():
    # snow: two flake shapes
    a = Image.new('RGBA', (3, 3)); a.putpixel((1, 0), SNOW1 + (255,)); a.putpixel((0, 1), SNOW1 + (255,)); a.putpixel((1, 1), (255, 255, 255, 255))
    a.putpixel((2, 1), SNOW1 + (255,)); a.putpixel((1, 2), SNOW1 + (255,))
    b = Image.new('RGBA', (3, 3)); b.putpixel((0, 0), SNOW0 + (255,)); b.putpixel((1, 1), (255, 255, 255, 255)); b.putpixel((2, 2), SNOW0 + (255,))
    save(cells([a, b], 3, 3), G_OUT + 'part_snow.png', 2)
    # footprint decal (dark, sits on snow)
    p = Pic(6, 4)
    p.e(0, 1, 3, 3, (64, 76, 104)); p.p(4, 1, (64, 76, 104)); p.p(5, 2, (64, 76, 104)); p.p(4, 3, (64, 76, 104))
    p.p(1, 2, (44, 54, 80))
    save(hard(p.im), G_OUT + 'part_footprint.png')
    # breath puff
    f0 = Pic(6, 5); f0.e(1, 1, 4, 3, (230, 238, 248)); f0.p(2, 2, (255, 255, 255))
    f1 = Pic(6, 5); f1.e(0, 0, 3, 3, (214, 226, 240)); f1.e(2, 1, 5, 4, (230, 238, 248)); f1.p(3, 2, (196, 210, 230)); f1.p(1, 1, (255, 255, 255))
    save(cells([f0.im, f1.im], 6, 5), G_OUT + 'part_breath.png', 2)
    # falling icicle
    p = Pic(4, 14)
    p.poly([(0, 0), (3, 0), (2, 13), (1, 13)], ICE3)
    p.l(1, 0, 1, 11, ICE4); p.l(3, 1, 2, 10, ICE2); p.r(0, 0, 3, 0, ICE4)
    p.outline()
    save(hard(p.im), G_OUT + 'part_icicle.png')
    # flamethrower flame (additive on black): banded fire ball with ragged licks, 4 frames
    fr = []
    for k in range(4):
        rnd = np.random.default_rng(10 + k)
        yy, xx = np.mgrid[0:16, 0:16].astype(float)
        ang = np.arctan2(yy - 8, xx - 8)
        rr = np.sqrt((xx - 8) ** 2 + (yy - 8) ** 2)
        lick = 1 + 0.25 * np.sin(ang * 5 + k * 1.7) + 0.15 * np.sin(ang * 3 - k)
        v = np.clip(1 - rr / (7.2 * lick), 0, 1)
        v = v * (0.85 + 0.3 * rnd.random((16, 16)))
        v = np.round(np.clip(v, 0, 1) * 4) / 4
        rgb = gmap(v, [(0, (0, 0, 0)), (0.25, (120, 30, 6)), (0.5, (226, 96, 20)), (0.75, (255, 180, 60)), (1, (255, 246, 190))])
        fr.append(from_arr(rgb))
    save(cells(fr, 16, 16), G_OUT + 'part_flame.png', 4, additive=True)
    # blood trail drops
    d0 = Pic(4, 4); d0.r(1, 1, 2, 2, BL1); d0.p(1, 1, BL2); d0.p(3, 2, BL0)
    d1 = Pic(4, 4); d1.p(0, 1, BL1); d1.r(2, 2, 3, 3, BL1); d1.p(2, 2, BL2)
    save(cells([d0.im, d1.im], 4, 4), G_OUT + 'part_blood_trail.png', 2)
    # glowing eye pair (additive)
    e = np.zeros((2, 3, 3))
    e[0, 0] = e[0, 2] = (255, 70, 40)
    e[1, 0] = e[1, 2] = (120, 20, 10)
    save(from_arr(e), G_OUT + 'part_eye.png', additive=True)


# ================================================================== TOUCH ICONS (96x96 white on transparent)
def icon(draw_fn):
    S_ = 4
    m = Image.new('L', (96 * S_, 96 * S_), 0)
    draw_fn(ImageDraw.Draw(m), S_)
    m = m.resize((96, 96), Image.LANCZOS)
    a = (np.array(m) >= 128).astype(np.uint8) * 255
    out = np.zeros((96, 96, 4), np.uint8)
    out[..., :3] = 255
    out[..., 3] = a
    out[a == 0] = 0
    return Image.fromarray(out)


@builder('icons')
def make_icons():
    def pot(d, k):
        S = lambda *v: [x * k for x in v]
        d.ellipse(S(16, 34, 80, 94), fill=255)                 # flask body
        d.rectangle(S(38, 14, 58, 40), fill=255)               # neck
        d.rounded_rectangle(S(33, 4, 63, 16), radius=3 * k, fill=255)   # cork / lip
        d.ellipse(S(24, 42, 72, 86), fill=0)                   # glass inside
        d.chord(S(24, 42, 72, 86), 10, 170, fill=255)          # liquid
        d.rectangle(S(24, 62, 72, 64), fill=255)
        d.ellipse(S(30, 50, 38, 58), fill=255)                 # bubble
    save(icon(pot), T_OUT + 'icon_potion.png')

    def wheel(d, k):
        S = lambda *v: [x * k for x in v]
        d.ellipse(S(4, 4, 92, 92), fill=255)
        d.ellipse(S(30, 30, 66, 66), fill=0)
        for i in range(6):                                     # six segments separated by gaps
            a = math.radians(i * 60 + 30)
            d.line([(48 * k, 48 * k), ((48 + math.cos(a) * 50) * k, (48 + math.sin(a) * 50) * k)], fill=0, width=6 * k)
        d.ellipse(S(40, 40, 56, 56), fill=255)                 # hub
    save(icon(wheel), T_OUT + 'icon_wheel.png')


# ================================================================== CONTACT SHEET
def make_sheet():
    man = {}
    if os.path.exists(MANIFEST):
        man = json.load(open(MANIFEST))
    for k, v in SAVED.items():
        man[k] = v
    # the first-person weapons and pickups come from tools/weapon-frames (render-static.mjs + pack.py)
    try:
        import re
        wf = json.loads(re.search(r'= (\{.*\});', open('retrofps/js/weapons.js').read()).group(1))
        for w in ('axe', 'flamer', 'launcher'):
            if w in wf:
                man[G_OUT + f'fp_{w}.png'] = (len(wf[w]['states']['idle']) + len(wf[w]['states']['fire']), False)
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
        sc = 1 if path.startswith(T_OUT) else (2 if (name.startswith(('enemies', 'boss')) or path.startswith(W_OUT)) else 4)
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


if __name__ == '__main__':
    want = sys.argv[1:]
    for name, fn in BUILDERS.items():
        if not want or name in want:
            fn()
    make_sheet()
    print('klart')
