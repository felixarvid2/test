"""Original pixel art for public/assets/sprites/extra.png.

Everything is drawn in code: ASCII pixel grids (letters: see art_common.PAL), PIL shapes with a
rim-shading pass for the big bosses, and a few procedural effects (flames, glow, slash).
`build_extra()` returns {frame name: RGBA image} for every name in EXTRA_FRAMES.
"""
import math
from PIL import Image, ImageDraw
from art_common import (PAL, parse, add_outline, place, sprite, rgba, OUTLINE, mirror_rows, quad_rows,
                        finish)

CLEAR = (0, 0, 0, 0)


def canvas(w, h):
    return Image.new('RGBA', (w, h), CLEAR)


def glow(size, cx, cy, radius, color, strength=110, steps=3):
    """Stepped (pixel-art friendly) radial glow."""
    g = canvas(*size)
    px = g.load()
    for y in range(size[1]):
        for x in range(size[0]):
            d = math.hypot(x + 0.5 - cx, y + 0.5 - cy) / radius
            if d < 1:
                level = min(int((1 - d) * steps) + 1, steps)
                px[x, y] = rgba(color, int(strength * level / steps))
    return g


def over(base, top, x=0, y=0):
    base.alpha_composite(top, (x, y))
    return base


# --------------------------------------------------------------------------- small characters

def skeleton_rows():
    half = [
        "....vvv",
        "...vvvv",
        "...vvvv",
        "...vnnv",
        "...vnrv",
        "...vvVn",
        "....vnv",
        "..vvvVV",
        "..v.vvV",
        "..v.nnV",
        "..v.vvV",
        ".vv..vv",
        ".....v.",
        "....vv.",
    ]
    return mirror_rows(half, {'v': 'V', 'V': 'B'})


def skeleton():
    return sprite(skeleton_rows(), (16, 16), anchor='b')


def skeleton_archer():
    rows = [list(r) for r in skeleton_rows()]
    for y in range(8, 12):
        rows[y][11] = '.'
    rows[11][12] = '.'
    rows[7][12] = 'V'
    for (x, y) in ((4, 8), (5, 9), (6, 10)):      # quiver strap across the chest
        rows[y][x] = 'S'
    img = parse([''.join(r) for r in rows])
    bow = parse([
        "C..",
        "iC.",
        "iC.",
        "i.C",
        "i.C",
        "i.C",
        "i.C",
        "i.C",
        "iC.",
        "iC.",
        "C..",
    ])
    over(img, bow, 11, 2)
    return finish(img, (16, 16), 'b')


def goblin_armored():
    half = [
        ".....lr",
        "...illl",
        "..illlm",
        "g.lmmaa",
        "gg.gyog",
        ".gggggG",
        "...goii",
        "...gGGG",
        "lllmmmm",
        "lla.lim",
        ".gg.lma",
        ".gg.mma",
        "....bbY",
        "...SSS.",
    ]
    return sprite(mirror_rows(half, {'l': 'm', 'i': 'l'}), (16, 16), anchor='b')


# --------------------------------------------------------------------------- items & pickups

def heart():
    half = [
        "..qqrr.",
        ".qwrrrr",
        ".qrrrrr",
        ".qrrrrr",
        ".rrrrrr",
        "..rrrrR",
        "...rrrR",
        "....rrR",
        ".....rR",
        "......R",
    ]
    return sprite(mirror_rows(half, {'q': 'r', 'w': 'r', 'r': 'R', 'R': 'D'}), (16, 16))


def skull():
    half = [
        "..vvvV",
        ".vvvvV",
        "vvvvvV",
        "vvvvvV",
        "vvnnnV",
        "vvnnnV",
        "vvvvnV",
        ".vvvvV",
        "..vnvV",
        "..vnvV",
        "..vVVB",
    ]
    return sprite(mirror_rows(half, {'v': 'V', 'V': 'B'}), (16, 16))


def crown():
    half = [
        ".y....y",
        ".yy...y",
        ".yyy.yy",
        ".yyyyyy",
        ".yrYYxY",
        ".YYYYYY",
        ".YYYYYY",
    ]
    return sprite(mirror_rows(half, {'y': 'Y', 'Y': 'e'}), (16, 16))


def egg():
    rows = [
        "...icc....",
        "..iccccd..",
        ".icSScccd.",
        ".iccScccd.",
        "iccccccScd",
        "icSScccccd",
        "iccScccSSd",
        "iccccccSSd",
        "iccSSccccd",
        ".cccccccdd",
        "..dcccdd..",
        "...dddd...",
    ]
    return sprite(rows, (16, 16), {'S': (214, 150, 96)})


def xp_gem():
    rows = [
        "..Xz..",
        ".Xzzx.",
        "Xzzxxx",
        "zzxxxZ",
        ".zxxZ.",
        "..xZ..",
    ]
    return sprite(rows, (8, 8))


def xp_gem_big():
    half = [
        "...Xz",
        "..Xzz",
        ".Xwzz",
        "Xzzxx",
        "Xzxxx",
        ".xxxx",
        "..xxZ",
        "...xZ",
        "....Z",
    ]
    return sprite(mirror_rows(half, {'X': 'P', 'z': 'P', 'w': 'P', 'x': 'p', 'Z': 'u'}), (12, 12))


def coin(n):
    faces = [
        [".yyyy.", "ywyyyY", "yyyyYY", "yyyYYY", "yYYYYY", ".YYYY."],
        [".yy.", "ywyY", "yyYY", "yyYY", "yYYY", ".YY."],
        ["yY", "yY", "yY", "yY", "yY", "yY"],
        [".yY.", "yYYY", "yyYY", "yyYY", "yYYY", ".YY."],
    ]
    return sprite(faces[n], (8, 8))


def spark():
    rows = [
        "...ww...",
        "...ww...",
        "..wwww..",
        "wwwwwwww",
        "wwwwwwww",
        "..wwww..",
        "...ww...",
        "...ww...",
    ]
    return parse(rows)


def puff():
    img = canvas(8, 8)
    px = img.load()
    for y in range(8):
        for x in range(8):
            d = math.hypot(x - 3.5, y - 3.5)
            a = 255 if d < 2.0 else 190 if d < 3.0 else 110 if d < 3.8 else 0
            if a:
                px[x, y] = (255, 255, 255, a)
    return img


def shadow():
    img = canvas(16, 8)
    px = img.load()
    for y in range(8):
        for x in range(16):
            d = math.hypot((x - 7.5) / 8.0, (y - 3.5) / 4.0)
            if d < 0.8:
                px[x, y] = (20, 12, 28, 90)
            elif d < 1.0:
                px[x, y] = (20, 12, 28, 55)
    return img


# --------------------------------------------------------------------------- projectiles

def arrow(dark=False):
    shaft, fl, head = ('b', 'r', 'a') if dark else ('C', 'w', 'l')
    head2 = 'n' if dark else 'm'
    rows = [
        f"{fl}{fl}.......{head2}{head}...",
        f"{fl}{fl}{shaft}{shaft}{shaft}{shaft}{shaft}{shaft}{shaft}{head}{head}{head}{head}{head}",
        f"{fl}{fl}.......{head2}{head}...",
    ]
    return sprite(rows, (16, 5))


def enemy_arrow():
    return arrow(True)


def bone():
    rows = [
        "vvv........vvv",
        "vvvvvvvvvvvvVV",
        "vVVVVVVVVVVVVB",
        "VVB........BBB",
    ]
    return sprite(rows, (16, 6))


def orbit_blade():
    quad = [
        ".....i",
        ".....l",
        "....ll",
        "mm..lm",
        "mlllma",
        ".mllmo",
    ]
    return sprite(quad_rows(quad), (16, 16))


def ice_shard():
    rows = [
        "......Xz......",
        "..XXXXzzxx....",
        "XXXzzzzzxxxxxZ",
        "XXzzzzzxxxxxZ.",
        "..XzzzzxxZ....",
        "......zx......",
    ]
    return sprite(rows, (16, 16))


def fireball():
    img = canvas(16, 16)
    px = img.load()
    col = {'o': PAL['R'], 'm': PAL['e'], 'i': PAL['y'], 'c': PAL['w'], 't': PAL['r']}
    cx, cy = 10.5, 7.5
    for y in range(16):
        for x in range(16):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            d = math.hypot(dx, dy)
            k = None
            if d < 4.6:
                k = 'c' if d < 1.6 else 'i' if d < 2.8 else 'm' if d < 3.8 else 'o'
            elif dx < 0:
                # flame tail streaming left, tapering and flickering
                tail = 3.8 * (1 + dx / 11.0) + (0.7 if int(-dx) % 3 == 0 else 0)
                if abs(dy) < tail and dx > -10:
                    k = 'm' if abs(dy) < tail * 0.5 else 't'
                    if abs(dy) < tail * 0.25 and dx > -6:
                        k = 'i'
            if k:
                px[x, y] = rgba(col[k])
    return finish(img, (16, 16), outline=False)


def magic_bolt():
    img = glow((16, 16), 8, 8, 8.0, PAL['P'], 95, 3)
    px = img.load()
    for y in range(16):
        for x in range(16):
            d = math.hypot(x + 0.5 - 8, y + 0.5 - 8)
            if d < 5.2:
                c = 'w' if d < 1.8 else 'X' if d < 2.8 else 'P' if d < 4.0 else 'p'
                px[x, y] = rgba(PAL[c])
    for (x, y) in ((2, 3), (13, 12), (12, 2), (3, 13)):
        px[x, y] = rgba(PAL['X'])
    return img


def poison_cloud():
    discs = [(5.5, 9.5, 3.8), (10.5, 9.2, 4.2), (8.0, 6.0, 4.2), (3.6, 6.6, 2.4), (12.4, 5.8, 2.3)]
    inside = lambda x, y: any(math.hypot(x + .5 - cx, y + .5 - cy) <= r for cx, cy, r in discs)
    base, lite, dark, bub = (120, 205, 70), (190, 240, 110), (62, 137, 72), (225, 250, 160)
    out = canvas(14, 14)
    o = out.load()
    for y in range(14):
        for x in range(14):
            if inside(x, y):
                c = base
                if not inside(x - 1, y - 1) or not inside(x, y - 2):
                    c = lite
                if not inside(x, y + 1) or not inside(x + 1, y + 1):
                    c = dark
                o[x, y] = rgba(c)
    for (x, y) in ((6, 6), (7, 6), (10, 8), (4, 9)):
        o[x, y] = rgba(lite)
    for (x, y) in ((7, 10), (11, 6), (5, 8)):
        o[x, y] = rgba(bub)
    img = finish(out, (16, 16))
    # drifting spores
    for (x, y) in ((1, 2), (14, 3), (13, 14), (2, 13)):
        img.putpixel((x, y), rgba((150, 225, 80), 200))
    return img


def meteor():
    base = canvas(16, 16)
    base.alpha_composite(flame_img((16, 16), 9, 8.0, 10, 4.6, 0, [(-3.5, 7), (3.5, 8)]), (0, 0))
    rock = canvas(12, 12)
    px = rock.load()
    for y in range(12):
        for x in range(12):
            d = math.hypot(x + .5 - 6, y + .5 - 6.3)
            if d < 5.4 + (0.5 if (x * 7 + y * 3) % 5 == 0 else 0):
                c = 'S' if (x + y) < 9 else 'b'
                if x + y < 6:
                    c = 'C'
                px[x, y] = rgba(PAL[c])
    for (x, y) in ((4, 5), (5, 5), (7, 7), (8, 6), (6, 9)):
        px[x, y] = rgba(PAL['e'])
    for (x, y) in ((4, 5), (7, 7)):
        px[x, y] = rgba(PAL['y'])
    rock = add_outline(rock)
    base.alpha_composite(rock, (1, 3))
    return base


def lightning():
    img = canvas(12, 40)
    pts = [(7, 0), (4, 9), (8, 13), (3, 23), (7, 27), (4, 39)]
    d = ImageDraw.Draw(img)
    for w, c in ((4, PAL['Y']), (2, PAL['y'])):
        for (a, b) in zip(pts, pts[1:]):
            d.line([a, b], fill=rgba(c), width=w)
    d.line([pts[0], pts[1]], fill=rgba(PAL['w']), width=1)
    for (a, b) in zip(pts, pts[1:]):
        d.line([(a[0], a[1]), (b[0], b[1])], fill=rgba(PAL['w']), width=1)
    # glow halo on transparent neighbours
    src = img.copy()
    s, o = src.load(), img.load()
    for y in range(40):
        for x in range(12):
            if s[x, y][3] == 0:
                if any(0 <= x + dx < 12 and s[x + dx, y][3] for dx in (-1, 1)):
                    o[x, y] = (255, 240, 120, 70)
    return img


def slash():
    img = canvas(32, 16)
    px = img.load()
    for y in range(16):
        for x in range(32):
            ex = (x + 0.5 - 5.0) / 26.5
            ey = (y + 0.5 - 8.0) / 8.0
            outer = ex * ex + ey * ey
            ix = (x + 0.5 - (-2.5)) / 25.0
            iy = (y + 0.5 - 8.0) / 7.2
            inner = ix * ix + iy * iy
            if outer <= 1.0 and inner > 1.0 and x > 4:
                depth = (1.0 - outer)                       # 0 at leading edge
                lead = (1.0 - min(1.0, depth * 3.5)) ** 0.8
                taper = 1.0 - 0.55 * (abs(y + 0.5 - 8.0) / 8.0) ** 2
                a = int(255 * min(1.0, (0.4 + 0.6 * lead) * (0.55 + 0.45 * taper)))
                v = 255 if lead > 0.55 else 235
                px[x, y] = (v, v, 255 if lead > 0.3 else 245, a)
    return img


# --------------------------------------------------------------------------- fire

def flame_img(size, base_y, cx, h, w, lean, tongues):
    """Procedural flame: main tongue plus (offset, height) side tongues."""
    img = canvas(*size)
    px = img.load()
    W, H = size

    def tongue(cx0, hh, ww, ln, strength_core):
        for y in range(H):
            t = (base_y - y) / hh
            if t < 0 or t > 1:
                continue
            c = cx0 + ln * t ** 1.5
            if t < 0.28:
                hw = ww * math.sqrt(max(0.0, 1 - ((0.28 - t) / 0.28) ** 2) * 0.9 + 0.1)
            else:
                hw = ww * (1 - (t - 0.28) / 0.72) ** 1.15
            for x in range(W):
                r = abs(x + 0.5 - c) / max(hw, 0.01)
                if r > 1:
                    continue
                if strength_core and t < 0.5 and r < 0.30:
                    k = 'w'
                elif t < 0.65 and r < 0.55:
                    k = 'y'
                elif r < 0.78 and t < 0.9:
                    k = 'e'
                else:
                    k = 'r'
                prev = px[x, y]
                rank = {'r': 0, 'e': 1, 'y': 2, 'w': 3}
                if prev[3] == 0 or rank[k] >= rank.get(px_key.get((x, y), 'r'), 0):
                    px[x, y] = rgba(PAL[k])
                    px_key[(x, y)] = k

    px_key = {}
    for off, hh in tongues:
        tongue(cx + off, hh, max(1.2, w * 0.45), lean * 0.6, False)
    tongue(cx, h, w, lean, True)
    return img


FLAME_FRAMES = [
    dict(h=13, w=4.6, lean=0.0, tongues=[(-4.0, 6), (4.0, 4)]),
    dict(h=14, w=4.2, lean=2.4, tongues=[(-4.0, 8), (4.5, 5)]),
    dict(h=11, w=5.0, lean=0.0, tongues=[(-4.5, 4), (3.5, 8)]),
    dict(h=14, w=4.4, lean=-2.4, tongues=[(-3.5, 5), (4.5, 7)]),
]


def flame(n):
    f = FLAME_FRAMES[n]
    return flame_img((16, 16), 14, 8.0, f['h'], f['w'], f['lean'], f['tongues'])


def torch(n):
    img = canvas(16, 16)
    fr = [dict(h=8, w=3.0, lean=0.0, tongues=[(-1.8, 4)]),
          dict(h=9, w=2.8, lean=1.0, tongues=[(1.8, 5)]),
          dict(h=7, w=3.2, lean=0.0, tongues=[(-1.8, 5), (1.8, 3)]),
          dict(h=9, w=2.9, lean=-1.0, tongues=[(1.8, 3)])][n]
    stick = parse([
        ".mmmm.",
        "aCCCCa",
        ".bCCb.",
        "..bC..",
        "..bC..",
        "..bC..",
        "..bC..",
        ".mmmm.",
        ".aaaa.",
    ])
    st = add_outline(stick)
    img.alpha_composite(st, (4, 7))
    f = flame_img((16, 16), 9, 8.0, fr['h'], fr['w'], fr['lean'], fr['tongues'])
    img.alpha_composite(f, (0, 0))
    return img


# --------------------------------------------------------------------------- companions

def companion_wisp():
    half = [
        "....z",
        "....z",
        "...zz",
        "...Xz",
        "..XXz",
        "..Xzz",
        ".XXzw",
        ".XwXz",
        ".XoXz",
        ".XXzz",
        "..Xxx",
        "..xxZ",
        "...xZ",
    ]
    body = finish(parse(mirror_rows(half, {'X': 'z', 'z': 'x', 'x': 'Z', 'w': 'z'})), (16, 16), 'b', dy=-1)
    img = glow((16, 16), 8, 8.5, 7.5, PAL['X'], 60, 3)
    img.alpha_composite(body)
    for (x, y) in ((2, 4), (13, 6), (12, 13), (3, 12)):
        img.putpixel((x, y), rgba(PAL['X']))
    return img


def companion_fairy():
    img = glow((16, 16), 8, 8, 7.5, PAL['y'], 70, 3)
    wings = canvas(16, 16)
    wd = ImageDraw.Draw(wings)
    for pts in ([(7, 7), (4, 1), (1, 2), (2, 6), (6, 9)], [(7, 9), (3, 9), (3, 12), (6, 11)]):
        wd.polygon(pts, fill=(200, 244, 255, 235))
        wd.polygon([(15 - x, y) for x, y in pts], fill=(200, 244, 255, 235))
    for (x, y) in ((3, 2), (2, 4), (12, 2), (13, 4)):
        wings.putpixel((x, y), rgba(PAL['w']))
    img.alpha_composite(wings)
    body = parse([
        ".yy.",
        "yhhy",
        ".hh.",
        ".PP.",
        "PPPP",
        ".PP.",
        ".hh.",
    ])
    img.alpha_composite(add_outline(body), (5, 4))
    img.putpixel((7, 6), rgba(PAL['o']))
    img.putpixel((8, 6), rgba(PAL['o']))
    for (x, y) in ((8, 1), (14, 8), (1, 13), (13, 14)):
        img.putpixel((x, y), rgba(PAL['w']))
    return img


def build_extra():
    out = {
        'skeleton': skeleton(), 'skeleton_archer': skeleton_archer(), 'goblin_armored': goblin_armored(),
        'xp_gem': xp_gem(), 'xp_gem_big': xp_gem_big(),
        'arrow': arrow(), 'enemy_arrow': enemy_arrow(), 'magic_bolt': magic_bolt(), 'fireball': fireball(),
        'bone': bone(), 'orbit_blade': orbit_blade(), 'meteor': meteor(),
        'shadow': shadow(), 'spark': spark(), 'puff': puff(),
        'heart': heart(), 'skull': skull(), 'egg': egg(), 'crown': crown(), 'slash': slash(),
        'ice_shard': ice_shard(), 'lightning': lightning(), 'poison_cloud': poison_cloud(),
    }
    out.update(build_bosses())
    out.update(build_hazards())
    out['companion_wisp'] = companion_wisp()
    out['companion_fairy'] = companion_fairy()
    for i in range(4):
        out[f'coin_{i}'] = coin(i)
        out[f'flame_{i}'] = flame(i)
        out[f'torch_{i}'] = torch(i)
    return out


# --------------------------------------------------------------------------- bosses
# Region painting: every body part is drawn into an id map (PIL, no antialiasing), then a rim-shading
# pass turns each id into a 3-tone ramp (light on the top-left edges, dark on the bottom-right ones).

class Regions:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.idx = Image.new('L', (w, h), 0)
        self.d = ImageDraw.Draw(self.idx)

    def poly(self, rid, pts, mirror=False):
        self.d.polygon(pts, fill=rid)
        if mirror:
            self.d.polygon([(self.w - 1 - x, y) for x, y in pts], fill=rid)

    def ellipse(self, rid, box, mirror=False):
        self.d.ellipse(box, fill=rid)
        if mirror:
            x0, y0, x1, y1 = box
            self.d.ellipse((self.w - 1 - x1, y0, self.w - 1 - x0, y1), fill=rid)

    def line(self, rid, pts, width=1, mirror=False):
        self.d.line(pts, fill=rid, width=width)
        if mirror:
            self.d.line([(self.w - 1 - x, y) for x, y in pts], fill=rid, width=width)

    def thick(self, rid, pts, radii, mirror=False):
        """Round-brush stroke along pts with per-point radius (used for horns, tail, arms)."""
        for sign in ((0, 1) if mirror else (0,)):
            P = [((self.w - 1 - x) if sign else x, y) for x, y in pts]
            for (a, b, ra, rb) in zip(P, P[1:], radii, radii[1:]):
                steps = int(max(abs(b[0] - a[0]), abs(b[1] - a[1]))) * 2 + 1
                for i in range(steps + 1):
                    t = i / steps
                    x, y, r = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, ra + (rb - ra) * t
                    self.d.ellipse((x - r + .5, y - r + .5, x + r - .5, y + r - .5), fill=rid)

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.idx.getpixel((x, y))
        return 0

    def shade(self, ramps):
        """ramps: {id: (dark, base, light)} or (dark, base, light, thick)."""
        out = canvas(self.w, self.h)
        px = out.load()
        for y in range(self.h):
            for x in range(self.w):
                rid = self.get(x, y)
                if not rid:
                    continue
                r = ramps[rid]
                dark, base, light = r[0], r[1], r[2]
                thick = len(r) > 3 and r[3]
                lit = self.get(x, y - 1) != rid or self.get(x - 1, y) != rid
                shd = self.get(x, y + 1) != rid or self.get(x + 1, y) != rid
                if thick and not shd:
                    shd = self.get(x + 1, y + 1) != rid or self.get(x, y + 2) != rid
                if lit and not shd:
                    c = light
                elif shd and not lit:
                    c = dark
                else:
                    c = base
                px[x, y] = rgba(c)
        return out


def dot(img, pts, color):
    px = img.load()
    for (x, y) in pts:
        if 0 <= x < img.width and 0 <= y < img.height:
            px[x, y] = rgba(color)


def dragon():
    W = 46
    R = Regions(W, W)
    MEM, SPAR, TAIL, LEG, ARM, BODY, BELLY, NECK, HEAD, SNOUT, HORN = range(1, 12)
    # wings (membrane first, spars on top)
    wing = [(17, 24), (9, 9), (1, 1), (3, 10), (0, 16), (6, 20), (3, 28), (11, 28), (16, 35), (18, 30)]
    R.poly(MEM, wing, mirror=True)
    for tip in ((1, 1), (0, 16), (3, 28)):
        R.line(SPAR, [(9, 9), tip], 1, mirror=True)
    R.line(SPAR, [(17, 24), (9, 9)], 2, mirror=True)
    R.line(SPAR, [(16, 34), (9, 9)], 1, mirror=True)
    # tail curling to the right, behind the legs
    R.thick(TAIL, [(27, 40), (33, 43), (39, 41), (43, 35), (43, 28)], [3, 3, 2.5, 2, 1], mirror=False)
    # legs, torso, belly, arms
    R.ellipse(LEG, (10, 33, 20, 43), mirror=True)
    R.ellipse(LEG, (7, 40, 19, 45), mirror=True)
    R.ellipse(BODY, (13, 21, 32, 42))
    R.ellipse(BELLY, (17, 23, 28, 41))
    R.thick(ARM, [(15, 26), (12, 31), (10, 36)], [3, 2.6, 2.2], mirror=True)
    R.poly(NECK, [(17, 15), (28, 15), (30, 25), (15, 25)])
    # head
    R.ellipse(HEAD, (12, 2, 33, 20))
    R.ellipse(SNOUT, (17, 13, 28, 21))
    R.thick(HORN, [(16, 6), (12, 5), (9, 2), (8, 0)], [2.2, 2.0, 1.6, 1.0], mirror=True)
    ramps = {
        MEM: ((74, 18, 52), (128, 30, 64), (170, 48, 76)),
        SPAR: ((118, 59, 54), (189, 108, 74), (234, 165, 108)),
        TAIL: ((143, 30, 56), (226, 56, 56), (255, 112, 100)),
        LEG: ((143, 30, 56), (226, 56, 56), (255, 112, 100)),
        ARM: ((143, 30, 56), (226, 56, 56), (255, 112, 100)),
        BODY: ((143, 30, 56), (226, 56, 56), (255, 112, 100), True),
        BELLY: ((236, 142, 40), (254, 200, 70), (254, 231, 120)),
        NECK: ((143, 30, 56), (226, 56, 56), (255, 112, 100)),
        HEAD: ((143, 30, 56), (226, 56, 56), (255, 112, 100)),
        SNOUT: ((190, 44, 58), (244, 92, 72), (255, 150, 125)),
        HORN: ((160, 135, 110), (236, 222, 190), (255, 252, 235)),
    }
    img = R.shade(ramps)
    # belly plates
    for y in (27, 30, 33, 36, 39):
        for x in range(W):
            if R.get(x, y) == BELLY:
                img.putpixel((x, y), rgba((236, 142, 40)))
    # claws (hands and feet)
    for (x, y) in ((8, 38), (10, 39), (12, 38), (7, 45), (10, 45), (13, 45), (16, 45)):
        for xx in (x, W - 1 - x):
            if 0 <= y < W:
                img.putpixel((xx, y), rgba((250, 246, 236)))
    # tail spade
    dot(img, [(43, 26), (42, 27), (44, 27), (43, 25)], (255, 112, 100))
    # face: angry brow ridges, glowing slit-pupil eyes, nostrils, fangs
    deep, ink, glowc, hot = (110, 26, 43), (63, 38, 49), (255, 231, 97), (255, 150, 50)
    for sx in (0, 1):
        f = (lambda x: W - 1 - x) if sx else (lambda x: x)
        dot(img, [(f(14), 7), (f(15), 7), (f(16), 7), (f(16), 8), (f(17), 8), (f(18), 8), (f(18), 9), (f(19), 9), (f(20), 9)], deep)
        dot(img, [(f(16), 10), (f(17), 10), (f(21), 10), (f(21), 11), (f(16), 11)], hot)
        dot(img, [(f(17), 10), (f(18), 10), (f(19), 10), (f(20), 10), (f(17), 11), (f(18), 11), (f(19), 11), (f(20), 11)], glowc)
        dot(img, [(f(18), 10), (f(18), 11)], (255, 255, 255))
        dot(img, [(f(19), 10), (f(19), 11)], ink)
        dot(img, [(f(20), 16)], ink)
        dot(img, [(f(19), 20), (f(19), 21)], (250, 246, 236))
    dot(img, [(21, 21), (22, 21), (23, 21), (24, 21)], ink)
    dot(img, [(21, 18), (22, 18), (23, 18), (24, 18)], (190, 44, 58))
    return finish(img, (48, 48))


def giant_slime():
    W = 30
    R = Regions(W, W)
    BODY = 1
    d = R.d
    cx, cy, rx, ry = 14.5, 17.5, 14.5, 12.0
    for y in range(W):
        for x in range(W):
            dx, dy = (x + .5 - cx) / rx, (y + .5 - cy) / ry
            p = 2.1 if dy < 0 else 4.2
            if abs(dx) ** p + abs(dy) ** p <= 1.0:
                d.point((x, y), fill=BODY)
    d.ellipse((9, 3, 15, 8), fill=BODY)              # little crest on top
    d.ellipse((0, 24, 29, 29), fill=BODY)            # puddle foot
    ramps = {BODY: ((37, 149, 106), (67, 225, 179), (105, 255, 212), True)}
    img = R.shade(ramps)
    px = img.load()
    # inner glossy highlight + bubbles
    for (x, y) in ((5, 11), (5, 12), (6, 10), (7, 9), (8, 9), (6, 11), (5, 13)):
        px[x, y] = rgba((190, 255, 240))
    for (x, y) in ((22, 24), (23, 24), (23, 23), (7, 25), (8, 25), (26, 20), (25, 20)):
        px[x, y] = rgba((37, 149, 106))
    for (x, y) in ((22, 7), (23, 7)):
        px[x, y] = rgba((190, 255, 240))
    # face: big eyes, angry brows, toothy grin
    ink = (63, 38, 49)
    for ex in (8, 17):
        for yy in range(11, 19):
            for xx in range(ex, ex + 5):
                if not ((xx in (ex, ex + 4)) and yy in (11, 18)):
                    px[xx, yy] = rgba((255, 255, 255))
        for yy in range(13, 18):
            for xx in range(ex + 1, ex + 4):
                px[xx, yy] = rgba(ink)
        px[ex + 1, 13] = rgba((255, 255, 255))
        px[ex + 2, 13] = rgba((255, 255, 255))
    for (x, y) in ((7, 9), (8, 9), (9, 10), (10, 10), (11, 11), (22, 9), (21, 9), (20, 10), (19, 10), (18, 11)):
        px[x, y] = rgba(ink)
    for yy, (x0, x1) in zip(range(21, 26), ((9, 20), (9, 20), (10, 19), (11, 18), (13, 16))):
        for xx in range(x0, x1 + 1):
            px[xx, yy] = rgba((110, 26, 43) if yy > 22 else ink)
    for xx in (10, 12, 14, 16, 18):
        px[xx, 21] = rgba((255, 255, 255))
        px[xx, 22] = rgba((255, 255, 255)) if xx in (12, 16) else px[xx, 22]
    for (x, y) in ((14, 24), (15, 24)):
        px[x, y] = rgba((250, 120, 120))
    return finish(img, (32, 32))


def skeleton_king():
    half = [
        ".....y....y",
        ".....yy..yy",
        ".....yyyyyy",
        ".....YrYYxY",
        "......vvvvv",
        "......vvvvv",
        "......vnnvv",
        "......vnrvv",
        "....ppvvVvn",
        "...ppppvnvv",
        "..YYYYpvvvv",
        ".pYyyYpvvvv",
        ".pppvvpvnnV",
        ".pppvvpvvvV",
        ".pppvvpvnnV",
        ".ppvvvpvvvV",
        ".pppppYYYYy",
        ".ppppp..vv.",
        ".ppppp..vv.",
        "ppppppp.vv.",
        "ppppppp.vv.",
        "ppppppvvvv.",
    ]
    rows = mirror_rows(half, {'v': 'V', 'V': 'B', 'y': 'Y', 'Y': 'e', 'p': 'u'})
    img = parse(rows)
    sword = parse([
        ".ii.",
        ".il.",
        ".il.",
        ".il.",
        ".il.",
        ".il.",
        ".il.",
        ".il.",
        ".il.",
        ".il.",
        ".im.",
        ".im.",
        "YYYY",
        ".bC.",
        ".bC.",
        ".YY.",
    ])
    over(img, sword, 18, 5)
    img.putpixel((19, 17), rgba(PAL['V']))
    img.putpixel((20, 17), rgba(PAL['V']))
    return finish(img, (24, 24))


def build_bosses():
    return {'dragon': dragon(), 'giant_slime': giant_slime(), 'skeleton_king': skeleton_king(),
            'spider_queen': spider_queen(), 'lich': lich(), 'mimic_king': mimic_king()}


def build_hazards():
    return {'web': web(), 'web_ball': web_ball(), 'egg_sac': egg_sac(), 'soul_bolt': soul_bolt(),
            'venom_glob': venom_glob()}


# --------------------------------------------------------------------------- spider queen, lich, mimic king

def px_rect(img, x0, y0, x1, y1, color):
    """Inclusive rectangle fill (clipped)."""
    px = img.load()
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if 0 <= x < img.width and 0 <= y < img.height:
                px[x, y] = rgba(color)


def spider_queen():
    W = 38
    R = Regions(W, W)
    LEG, ABD, HEAD, FANG = range(1, 5)
    # four legs per side (mirrored): joint -> knee (high) -> foot, 2 px strokes so each one reads on its own
    legs = [
        [(14, 10), (8, 2), (2, 9)],
        [(12, 14), (4, 9), (0, 19)],
        [(11, 18), (3, 20), (1, 31)],
        [(12, 23), (6, 27), (4, 37)],
    ]
    for pts in legs:
        R.line(LEG, pts, 2, mirror=True)
    R.ellipse(ABD, (8, 15, 29, 37))
    R.ellipse(HEAD, (11, 6, 26, 19))
    R.poly(FANG, [(15, 17), (17, 17), (17, 22), (16, 22)], mirror=True)
    ramps = {
        LEG: ((38, 22, 60), (92, 58, 126), (156, 108, 190)),
        ABD: ((30, 16, 48), (62, 34, 88), (104, 60, 134), True),
        HEAD: ((36, 20, 58), (84, 50, 114), (140, 92, 172), True),
        FANG: ((160, 135, 110), (236, 222, 190), (255, 252, 235)),
    }
    img = R.shade(ramps)
    px = img.load()
    ink = (28, 14, 40)
    # abdomen: bold violet / dark stripes following the curve of the body
    for y in range(W):
        for x in range(W):
            if R.get(x, y) != ABD or y < 21:
                continue
            curve = y - 0.04 * (x - 18.5) ** 2
            band = int(curve) % 5
            if band == 0:
                px[x, y] = rgba((150, 92, 190))
            elif band == 1:
                px[x, y] = rgba((124, 72, 160))
            elif band == 3:
                px[x, y] = rgba((40, 20, 62))
    # a dark seam where the head sits on the abdomen
    for y in range(W):
        for x in range(W):
            if R.get(x, y) == ABD and R.get(x, y - 1) == HEAD:
                px[x, y] = rgba(ink)
    # red hourglass mark
    hour = {23: (14, 23), 24: (15, 22), 25: (16, 21), 26: (17, 20), 27: (18, 19), 28: (18, 19), 29: (17, 20),
            30: (16, 21), 31: (15, 22), 32: (14, 23)}
    for y, (x0, x1) in hour.items():
        for x in range(x0, x1 + 1):
            px[x, y] = rgba(PAL['r'] if y not in (23, 32) else PAL['R'])
    for y, (x0, x1) in hour.items():
        px[x1, y] = rgba(PAL['R'])
        px[x0, y] = rgba(PAL['q'] if y < 28 else PAL['r'])
    dot(img, [(19, 27), (19, 28), (18, 28)], PAL['D'])
    # knee joints catch the light
    for (x, y) in ((8, 2), (4, 9), (3, 20), (6, 27)):
        for xx in (x, W - 1 - x):
            dot(img, [(xx, y)], (176, 124, 206))
    # face: brows, six red eyes (two big, two mid, two small), mouth between the fangs
    for sx in (0, 1):
        f = (lambda x: W - 1 - x) if sx else (lambda x: x)
        dot(img, [(f(11), 9), (f(12), 9), (f(13), 9), (f(14), 10), (f(15), 10), (f(16), 11)], ink)           # angry brow
        dot(img, [(f(12), 10), (f(13), 10), (f(14), 11), (f(15), 11), (f(16), 12)], ink)
        dot(img, [(f(12), 11), (f(13), 11), (f(14), 12), (f(12), 12), (f(13), 12), (f(14), 13), (f(13), 13)], PAL['r'])
        dot(img, [(f(11), 11), (f(11), 12), (f(12), 13), (f(15), 12), (f(15), 13), (f(14), 14), (f(13), 14)], PAL['D'])
        dot(img, [(f(12), 11), (f(13), 11), (f(12), 12)], PAL['q'])
        dot(img, [(f(12), 11)], PAL['w'])
        dot(img, [(f(16), 7), (f(17), 7), (f(16), 8), (f(17), 8)], PAL['r'])                                  # mid eyes
        dot(img, [(f(16), 7)], PAL['w'])
        dot(img, [(f(15), 7), (f(15), 8), (f(16), 9), (f(17), 9)], PAL['D'])
        dot(img, [(f(17), 12), (f(17), 13)], PAL['r'])                                                       # small eyes
        dot(img, [(f(17), 12)], PAL['q'])
        dot(img, [(f(17), 14)], PAL['D'])
    dot(img, [(18, 16), (19, 16), (18, 17), (19, 17)], ink)
    dot(img, [(18, 18), (19, 18), (18, 19), (19, 19)], PAL['D'])
    dot(img, [(15, 21), (22, 21), (16, 22), (21, 22)], PAL['v'])
    # little gold crown on the head
    crown_img = parse(mirror_rows(["y..y", "yyyy", "YrYY", "eeee"], {'y': 'Y', 'Y': 'e'}))
    over(img, crown_img, 15, 2)
    return finish(img, (40, 40))


def lich():
    t1, t2, t3, t4 = (20, 46, 66), (30, 78, 92), (52, 128, 128), (90, 186, 172)
    pal = {'1': t1, '2': t2, '3': t3, '4': t4, 'W': (205, 255, 252), 'H': (70, 36, 86), 'J': (116, 66, 134),
           'K': (46, 22, 62), 'N': (18, 30, 52)}
    half = [
        "......JJHH",      # 0  hood
        "....JJHHHH",
        "..JJHHvvvv",
        ".JHHvvvvvv",
        ".JHvvvvvvv",
        ".JHvNNNNvv",      # 5  eye sockets with glowing cyan pupils
        ".JHvNzWNvv",
        ".JHvvNNvvN",
        ".JHHvvvvvN",
        "..HHvVvVvN",      # 9  teeth
        "..HHHvNvNv",
        "...HHHvvvv",
        "..333HHHHH",      # 12 shoulders
        ".3443333HH",
        "34443333HH",
        "3444222333",
        "3443221233",
        "3342221123",
        "334222112H",
        "3342221123",
        ".342221112",
        ".332221112",
        ".332211112",
        "..32211112",
        "..32211111",
        "..22211111",
        "..221.1.11",
    ]
    body = parse(mirror_rows(half, {'3': '2', '4': '3', '2': '1', 'J': 'H', 'H': 'K', 'v': 'V', 'V': 'B'}), pal)
    # purple belt with a glowing rune, purple hem trim
    for x in range(2, 18):
        if body.getpixel((x, 17))[3]:
            body.putpixel((x, 17), rgba(pal['J']))
    for x in (9, 10):
        body.putpixel((x, 17), rgba(PAL['z']))
    for x in range(2, 18):
        if body.getpixel((x, 24))[3]:
            body.putpixel((x, 24), rgba(pal['H']))
    img = canvas(30, 30)
    img.alpha_composite(body, (1, 2))
    px = img.load()
    # sleeve + skeletal hand gripping the staff (viewer's right)
    px_rect(img, 20, 17, 23, 19, t2)
    px_rect(img, 20, 19, 23, 20, t1)
    px_rect(img, 20, 17, 21, 17, t3)
    px_rect(img, 24, 18, 25, 20, PAL['v'])
    px_rect(img, 24, 20, 25, 20, PAL['V'])
    px[26, 19] = rgba(PAL['v'])
    for y in range(8, 30):
        px[25, y] = rgba(PAL['b'] if y % 4 else PAL['S']) if not (18 <= y <= 20) else px[25, y]
        px[26, y] = rgba(PAL['C'] if y % 4 else PAL['b'])
    for (x, y) in ((24, 8), (27, 8), (24, 7), (27, 7), (25, 6), (26, 6)):    # claw holding the gem
        px[x, y] = rgba(PAL['a'])
    over(img, parse([".zz.", "zwXz", "zXzx", ".xx."]), 24, 3)
    img = finish(img, (32, 32))
    px = img.load()
    # gem glow
    for (x, y) in ((24, 3), (29, 3), (24, 8), (29, 8), (26, 2), (27, 2), (26, 9), (27, 9)):
        if not px[x, y][3]:
            px[x, y] = rgba(PAL['z'], 110)
    # faint floating soul wisps: bright head, fading tail
    for (x, y, k) in ((4, 4, 1), (1, 11, -1), (29, 15, 1)):
        px[x, y] = rgba(PAL['X'], 200)
        px[x, y + 1] = rgba(PAL['X'], 150)
        px[x + k, y + 1] = rgba(PAL['x'], 110)
        px[x + k, y + 2] = rgba(PAL['x'], 80)
        px[x, y + 3] = rgba(PAL['x'], 55)
    return img


def mimic_king():
    N = 30
    img = canvas(N, N)
    wood, wood_l, wood_d, wood_dd = PAL['C'], PAL['h'], PAL['S'], PAL['b']
    # lid (open, seen from the front) with planks
    px_rect(img, 2, 3, 27, 3, wood_l)
    px_rect(img, 1, 4, 28, 4, wood_l)
    px_rect(img, 1, 5, 28, 8, wood)
    px_rect(img, 1, 9, 28, 9, wood_d)
    px_rect(img, 1, 10, 28, 10, wood_dd)
    for x in range(8, 23, 5):
        px_rect(img, x, 5, x, 8, wood_d)
    # mouth interior
    px_rect(img, 1, 11, 28, 20, PAL['D'])
    px_rect(img, 1, 11, 28, 12, PAL['o'])
    px_rect(img, 4, 19, 25, 20, PAL['o'])
    # chest front (lower jaw)
    px_rect(img, 1, 21, 28, 29, wood)
    px_rect(img, 1, 21, 28, 21, wood_l)
    px_rect(img, 1, 28, 28, 28, wood_d)
    px_rect(img, 1, 29, 28, 29, wood_dd)
    for x in range(8, 23, 5):
        px_rect(img, x, 23, x, 27, wood_d)
    # iron bands: a frame down both ends of lid, mouth and chest (lit on the left, shadowed on the right)
    left = [PAL['m'], PAL['l'], PAL['m'], PAL['a'], PAL['a']]
    right = [PAL['a'], PAL['m'], PAL['m'], PAL['a'], PAL['a']]
    for k in range(5):
        px_rect(img, 1 + k, 3 if k else 4, 1 + k, 29, left[k])
        px_rect(img, 28 - k, 3 if k else 4, 28 - k, 29, right[k])
    for (x, y) in ((3, 5), (26, 5), (3, 8), (26, 8), (3, 15), (26, 15), (3, 24), (26, 24), (3, 27), (26, 27)):
        img.putpixel((x, y), rgba(PAL['i']))
    for (x, y) in ((1, 3), (28, 3)):                              # rounded lid corners
        img.putpixel((x, y), CLEAR)
    # teeth: upper row hangs from the lid, lower row rises from the chest (both mirrored)
    for x in (6, 9, 12):
        for xx in (x, 28 - x):
            px_rect(img, xx, 11, xx + 1, 12, PAL['w'])
            px_rect(img, xx, 13, xx + 1, 13, PAL['i'])
            img.putpixel((xx, 14), rgba(PAL['V']))
    for x in (7, 10, 13):
        for xx in (x, 29 - x - 1):
            px_rect(img, xx, 18, xx + 1, 18, PAL['i'])
            px_rect(img, xx, 19, xx + 1, 19, PAL['w'])
    # two angry eyes in the mouth: inner top corner cut by the brow, red pupils glaring inwards
    ink = PAL['o']
    eye = ["YYYoo",
           "yyyyo",
           "yyyrr",
           "Yyyrr"]
    for sx in (0, 1):
        for dy, row in enumerate(eye):
            for dx, ch in enumerate(row):
                col = PAL[ch]
                x = 6 + dx
                img.putpixel((29 - x if sx else x, 14 + dy), rgba(col))
        img.putpixel((29 - 10 if sx else 10, 16), rgba(PAL['R']))
    # long red tongue hanging over the chest front
    for y in range(15, 26):
        w = 4 if y < 24 else 3 if y == 24 else 2
        x0 = 13 if w >= 3 else 14
        for x in range(x0, x0 + w):
            c = PAL['r']
            if x == x0:
                c = PAL['q']
            if x == x0 + w - 1:
                c = PAL['R']
            img.putpixel((x, y), rgba(c))
        if 17 <= y < 24:
            img.putpixel((x0 + 2, y), rgba(PAL['R']))
    # lock plate under the tongue
    px_rect(img, 12, 26, 17, 29, PAL['m'])
    px_rect(img, 12, 26, 17, 26, PAL['l'])
    px_rect(img, 12, 29, 17, 29, PAL['a'])
    px_rect(img, 14, 27, 15, 28, PAL['o'])
    # gold crown on top of the lid
    over(img, parse(mirror_rows(["y..y..y", "yyyyyyy", "YrYYxYY", "YYYYYYY", "eeeeeee"], {'y': 'Y', 'Y': 'e'})), 8, 0)
    # a few coins spilling out at the lower right
    coin = parse(["yYY", "YyY", "YYe"])
    for (x, y) in ((22, 25), (26, 26), (19, 27), (24, 28)):
        over(img, coin, x, y)
    return finish(img, (32, 32))


# --------------------------------------------------------------------------- spider / lich projectiles & hazards

def web():
    img = canvas(16, 16)
    cx, cy = 7.5, 7.5
    strand, bright = (226, 230, 240), (252, 253, 255)
    # eight spokes of uneven length: a worn, sticky patch rather than a perfect wheel
    reach = [7.4, 6.2, 7.5, 6.4, 7.2, 6.0, 7.5, 6.6]
    tips = [(cx + math.cos(i * math.pi / 4 + 0.12) * r, cy + math.sin(i * math.pi / 4 + 0.12) * r) for i, r in enumerate(reach)]
    d = ImageDraw.Draw(img)
    d.polygon(tips, fill=rgba(strand, 40))
    for f, col, a in ((0.82, strand, 160), (0.5, strand, 160)):      # sagging rings between the spokes
        pts = [(cx + (tx - cx) * f * (0.86 if i % 2 else 1.0), cy + (ty - cy) * f * (0.86 if i % 2 else 1.0))
               for i, (tx, ty) in enumerate(tips)]
        d.line(pts + [pts[0]], fill=rgba(col, a), width=1)
    for (tx, ty) in tips:
        d.line([(cx, cy), (tx, ty)], fill=rgba(bright, 178))
    d.rectangle((7, 7, 8, 8), fill=rgba(bright, 200))
    for (x, y) in ((11, 3), (2, 11), (13, 11)):                      # loose strands + sticky dew
        img.putpixel((x, y), rgba(PAL['w'], 190))
    return img


def web_ball():
    return sprite([
        ".iwwi.",
        "iwwmwl",
        "wwlwwm",
        "wmwwlm",
        "iwlwmm",
        ".lmmm.",
    ], (8, 8))


def egg_sac():
    pal = {'1': (222, 236, 190), '2': (246, 252, 222), '3': (176, 204, 140), '4': (112, 168, 96), '5': (84, 124, 82),
           '6': (58, 96, 66)}
    rows = [
        "..2.22.2..",
        ".222111122",
        "2211141116",
        "2114411561",
        "2144111611",
        "1141551111",
        "1114555113",
        "1111441133",
        ".11144133.",
        "..333333..",
    ]
    img = parse(rows, pal)
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a and (r, g, b) not in (pal['4'], pal['5'], pal['6']):
                px[x, y] = (r, g, b, 224)          # silk is slightly see-through, veins / spiderlings / crack are not
    return place(add_outline(img), (12, 12))


def soul_bolt():
    pal = {'1': (28, 140, 160, 170), '2': (44, 232, 245), '3': (170, 250, 252), 'N': (18, 60, 90)}
    rows = [
        "....1..1..",
        "...121.21.",
        "....22222.",
        ".1.2333332",
        "12223N3N32",
        "13323N3N32",
        ".1.2333332",
        "....2N3N2.",
        ".....222..",
        "..........",
    ]
    return parse(rows, pal)


def venom_glob():
    return sprite([
        "..22..",
        ".2112.",
        "21w122",
        "211122",
        "223322",
        ".3333.",
    ], (8, 8), {'1': (150, 255, 90), '2': (99, 199, 77), '3': (62, 137, 72), 'w': (255, 255, 255)})
