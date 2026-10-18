"""Original 16x16 icons for public/assets/sprites/icons.png (plus a few Tiny Dungeon tiles).

Drawn on a 14x14 interior with small primitives or ASCII grids, then auto-outlined to 16x16 with the
Tiny Dungeon outline colour so they match the Kenney tiles.
"""
import math
from PIL import Image, ImageDraw
from art_common import PAL, parse, add_outline, place, sprite, rgba, mirror_rows, finish
import art_sprites as S

N = 14


def C(c):
    return rgba(PAL[c]) if isinstance(c, str) else rgba(c)


def new(n=N):
    return Image.new('RGBA', (n, n), (0, 0, 0, 0))


def put(img, x, y, c):
    if 0 <= x < img.width and 0 <= y < img.height:
        img.putpixel((int(x), int(y)), C(c))


def line(img, a, b, c):
    (x0, y0), (x1, y1) = a, b
    dx, dy = abs(x1 - x0), abs(y1 - y0)
    sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
    err = dx - dy
    while True:
        put(img, x0, y0, c)
        if (x0, y0) == (x1, y1):
            break
        e2 = 2 * err
        if e2 > -dy:
            err -= dy
            x0 += sx
        if e2 < dx:
            err += dx
            y0 += sy


def disc(img, cx, cy, r, c):
    for y in range(img.height):
        for x in range(img.width):
            if math.hypot(x + .5 - cx, y + .5 - cy) <= r:
                put(img, x, y, c)


def ring(img, cx, cy, r0, r1, c):
    for y in range(img.height):
        for x in range(img.width):
            d = math.hypot(x + .5 - cx, y + .5 - cy)
            if r0 <= d <= r1:
                put(img, x, y, c)


def poly(img, pts, c):
    ImageDraw.Draw(img).polygon(pts, fill=C(c))


def bevel(img, ramp):
    """Rim shading: for every base colour in `ramp` ({base: (dark, light)}) lighten top/left edges and
    darken bottom/right edges, like the Tiny Dungeon sprites."""
    src = img.copy()
    s, o = src.load(), img.load()
    W, H = img.size

    def same(x, y, c):
        return 0 <= x < W and 0 <= y < H and s[x, y] == c

    for y in range(H):
        for x in range(W):
            c = s[x, y]
            if c[3] == 0 or c not in ramp:
                continue
            dark, light = ramp[c]
            lit = not same(x, y - 1, c) or not same(x - 1, y, c)
            shd = not same(x, y + 1, c) or not same(x + 1, y, c)
            if lit and not shd:
                o[x, y] = rgba(light)
            elif shd and not lit:
                o[x, y] = rgba(dark)


def icon(img, outline=True):
    return finish(img, (16, 16), outline=outline)


def recolor(img, mapping):
    out = img.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r = px[x, y]
            key = r[:3]
            if r[3] and key in mapping:
                px[x, y] = rgba(mapping[key])
    return out


def kenney(frame):
    from build_assets_paths import TILES_PNG
    sheet = Image.open(TILES_PNG).convert('RGBA')
    r, c = divmod(frame, 12)
    return sheet.crop((c * 16, r * 16, c * 16 + 16, r * 16 + 16))


# --------------------------------------------------------------------------- weapons

def sword_img(blade=('i', 'l', 'm'), flip=False):
    img = new()
    b1, b2, b3 = blade
    for i in range(8):
        x, y = 11 - i, 1 + i
        put(img, x, y, b1)
        put(img, x + 1, y, b2)
        put(img, x + 2, y, b3)
    put(img, 12, 0, b1)
    put(img, 13, 0, b2)
    put(img, 13, 1, b3)
    line(img, (3, 8), (7, 12), 'Y')
    put(img, 4, 8, 'y')
    put(img, 4, 9, 'Y')
    line(img, (3, 10), (1, 12), 'b')
    line(img, (4, 10), (2, 12), 'C')
    put(img, 0, 13, 'Y')
    put(img, 1, 13, 'Y')
    if flip:
        img = img.transpose(Image.FLIP_LEFT_RIGHT)
    return img


def sword():
    return icon(sword_img())


def damage():
    img = sword_img(('q', 'r', 'R'))
    # a blood-red edge and a bright tip
    put(img, 12, 0, 'w')
    return icon(img)


def attackSpeed():
    img = new()
    s = sword_img()
    img.alpha_composite(s, (1, 0))
    for (x0, x1, y) in ((0, 4, 3), (0, 6, 6), (0, 4, 9), (2, 7, 12)):
        line(img, (x0, y), (x1, y), 'X')
        put(img, x0, y, 'x')
    return icon(img)


def double():
    img = new()
    a = sword_img()
    b = sword_img(flip=True)
    img.alpha_composite(b)
    img.alpha_composite(a)
    return icon(img)


def bow():
    img = new()
    pts = [(9, 0), (7, 1), (5, 3), (4, 5), (4, 7), (4, 8), (5, 10), (7, 12), (9, 13)]
    for a, b in zip(pts, pts[1:]):
        line(img, a, b, 'C')
    line(img, (9, 0), (9, 13), 'i')
    line(img, (3, 6), (13, 6), 'C')                      # nocked arrow
    for (x, y, c) in ((13, 6, 'l'), (12, 6, 'l'), (11, 5, 'm'), (11, 7, 'm'), (12, 5, 'l'), (12, 7, 'l'),
                      (3, 5, 'w'), (3, 7, 'w'), (2, 5, 'w'), (2, 7, 'w')):
        put(img, x, y, c)
    return icon(img)

def staff():
    img = new()
    line(img, (1, 12), (9, 4), 'C')
    line(img, (2, 12), (10, 4), 'S')
    line(img, (1, 13), (2, 13), 'Y')
    disc(img, 10.5, 3.5, 3.0, 'p')
    disc(img, 10.0, 3.0, 2.0, 'P')
    put(img, 9, 2, 'w')
    put(img, 10, 2, 'X')
    for (x, y) in ((7, 3), (8, 6), (7, 4), (8, 5)):
        put(img, x, y, 'Y')
    return icon(img)


def shield():
    half = [
        "llllll",
        "lXXxxx",
        "lXxxxY",
        "lXxxxY",
        "lxYYYY",
        "lxxxxY",
        ".lxxxY",
        ".lxxxY",
        "..lxxx",
        "..lxxx",
        "...lxx",
        "....lx",
    ]
    return sprite(mirror_rows(half, {'X': 'x', 'x': 'Z', 'l': 'm'}), (16, 16))


def armor():
    half = [
        "llll..",
        "lmmmm.",
        "llllmm",
        "lilmmm",
        "lillmm",
        "mlllmm",
        ".mlmmm",
        ".mYYYY",
        ".mmmmm",
        "..mmmm",
        "..mmmm",
        "...aaa",
    ]
    return sprite(mirror_rows(half, {'i': 'l', 'l': 'm', 'm': 'a', 'a': 'n'}), (16, 16))


def boots():
    rows = [
        "..YYYYY.....",
        "..CCCCC.....",
        "..CCCCS.....",
        "..CCCCS.....",
        "..CCCCS.....",
        "..CCCCS.....",
        "..CCCCSSS...",
        "..CCCCCCCSS.",
        ".CCCCCCCCCCS",
        ".SSSSSSSSSSS",
        ".bbbbbbbbbbb",
    ]
    img = parse(rows)
    for (x, y) in ((3, 2), (3, 3), (3, 4)):
        img.putpixel((x, y), rgba(PAL['h']))
    img.putpixel((4, 0), rgba(PAL['y']))
    img.putpixel((6, 8), rgba(PAL['y']))
    return finish(img, (16, 16))

def hp():
    return S.heart()


def heart():
    return S.heart()


def crown():
    return S.crown()


def skull():
    return S.skull()


def egg():
    return S.egg()


def meteor():
    return S.meteor()


def chest():
    return kenney(89)


def hero():
    return kenney(96)


def knockback():
    return kenney(117)


# --------------------------------------------------------------------------- elements

def fire():
    img = S.flame_img((14, 14), 13, 7.0, 12, 5.4, 0.8, [(-3.6, 6), (3.8, 7)])
    return icon(img)


def frost():
    img = new()
    cx = cy = 6.5
    for k in range(6):
        a = math.radians(k * 60 + 90)
        for r in [i * 0.5 for i in range(0, 13)]:
            put(img, cx - 0.5 + math.cos(a) * r, cy - 0.5 - math.sin(a) * r, 'X')
        for side in (-1, 1):
            b = a + side * math.radians(55)
            for r in (0.6, 1.2, 1.8):
                put(img, cx - 0.5 + math.cos(a) * 4 + math.cos(b) * r,
                    cy - 0.5 - math.sin(a) * 4 - math.sin(b) * r, 'z')
    disc(img, 6.5, 6.5, 1.6, 'w')
    return icon(img)


def lightning():
    img = new()
    poly(img, [(9, 0), (3, 7), (6, 7), (4, 13), (11, 5), (7, 5), (10, 0)], 'y')
    bevel(img, {C('y'): (PAL['Y'], (255, 250, 190))})
    put(img, 8, 1, 'w')
    put(img, 7, 2, 'w')
    return icon(img)


def drop_img(col, light, dark):
    img = new()
    disc(img, 7, 8.2, 5.0, col)
    poly(img, [(7, 0), (3, 6), (11, 6)], col)
    bevel(img, {C(col): (dark, light)})
    put(img, 4, 8, 'w')
    put(img, 4, 9, 'w')
    put(img, 5, 6, 'w')
    return img


def poison():
    img = drop_img('g', PAL['T'], PAL['G'])
    # tiny skull on the drop
    for (x, y) in ((6, 8), (7, 8), (8, 8), (6, 9), (8, 9), (6, 10), (7, 10), (8, 10)):
        put(img, x, y, 'i' if (x, y) not in ((6, 9), (8, 9)) else 'k')
    put(img, 7, 9, 'i')
    return icon(img)


def vampire():
    img = drop_img('r', PAL['q'], PAL['R'])
    line(img, (4, 9), (10, 9), 'D')
    put(img, 5, 10, 'w')
    put(img, 5, 11, 'w')
    put(img, 9, 10, 'w')
    put(img, 9, 11, 'w')
    return icon(img)


def explosion():
    img = new()
    discs = [(7, 7, 4.2), (3.5, 5.5, 2.6), (10.5, 5, 2.8), (4.5, 10, 2.6), (10, 10, 2.8), (7, 3.2, 2.6)]
    for cx, cy, r in discs:
        disc(img, cx, cy, r, 'r')
    for cx, cy, r in discs:
        disc(img, cx, cy + 0.4, r - 1.4, 'e')
    disc(img, 7, 7.5, 3.0, 'y')
    disc(img, 7, 7.5, 1.4, 'w')
    return icon(img)


def critDamage():
    img = new()
    pts = []
    for i in range(16):
        a = math.pi * 2 * i / 16 - math.pi / 2
        r = 7.0 if i % 2 == 0 else 3.4
        pts.append((6.5 + math.cos(a) * r, 6.5 + math.sin(a) * r))
    poly(img, pts, 'y')
    bevel(img, {C('y'): (PAL['Y'], (255, 250, 190))})
    disc(img, 6.5, 6.5, 2.4, 'r')
    disc(img, 6.0, 6.0, 1.0, 'q')
    return icon(img)


def crit():
    img = new()
    ring(img, 6.5, 6.5, 4.6, 6.6, 'r')
    ring(img, 6.5, 6.5, 3.0, 4.6, 'w')
    ring(img, 6.5, 6.5, 1.4, 3.0, 'r')
    disc(img, 6.5, 6.5, 1.4, 'y')
    for (a, b) in (((6, 0), (6, 3)), ((7, 0), (7, 3)), ((6, 10), (6, 13)), ((7, 10), (7, 13)),
                   ((0, 6), (3, 6)), ((0, 7), (3, 7)), ((10, 6), (13, 6)), ((10, 7), (13, 7))):
        line(img, a, b, 'a')
    return icon(img)


def thunder():
    img = new()
    for cx, cy, r in ((4.5, 5, 3.2), (8.5, 4, 3.8), (11, 6, 2.6), (7, 6.5, 3.6)):
        disc(img, cx, cy, r, 'm')
    for cx, cy, r in ((4.5, 4.4, 2.2), (8.5, 3.4, 2.8), (7, 5.6, 2.4)):
        disc(img, cx, cy, r, 'l')
    poly(img, [(8, 7), (4, 11), (7, 11), (5, 14), (11, 9), (8, 9), (10, 7)], 'y')
    bevel(img, {C('y'): (PAL['Y'], (255, 250, 190))})
    return icon(img)

def orbit():
    img = new()
    ring(img, 6.5, 6.5, 4.4, 5.6, 'x')
    for (x, y) in ((6, 0), (7, 0), (6, 1), (7, 1)):
        put(img, x, y, 'l')
    for (x, y) in ((6, 12), (7, 12), (6, 13), (7, 13)):
        put(img, x, y, 'l')
    for (x, y) in ((0, 6), (0, 7), (1, 6), (1, 7)):
        put(img, x, y, 'l')
    for (x, y) in ((12, 6), (13, 6), (12, 7), (13, 7)):
        put(img, x, y, 'l')
    put(img, 6, 0, 'w'); put(img, 0, 6, 'w'); put(img, 6, 12, 'i'); put(img, 12, 6, 'i')
    disc(img, 6.5, 6.5, 1.6, 'Y')
    put(img, 6, 6, 'y')
    return icon(img)


def phoenix():
    img = new()
    # wings
    lw = [(6, 8), (3, 7), (0, 3), (0, 0), (3, 2), (5, 4), (6, 5)]
    poly(img, lw, 'e')
    poly(img, [(14 - 1 - x, y) for x, y in lw], 'e')
    poly(img, [(6, 8), (4, 7), (2, 4), (1, 2), (3, 3), (5, 5)], 'y')
    poly(img, [(13 - x, y) for x, y in [(6, 8), (4, 7), (2, 4), (1, 2), (3, 3), (5, 5)]], 'y')
    # body, head, tail
    poly(img, [(5, 6), (8, 6), (9, 9), (7, 13), (6, 13), (4, 9)], 'r')
    poly(img, [(6, 7), (7, 7), (7, 10), (6, 10)], 'e')
    disc(img, 6.5, 5.0, 2.2, 'y')
    put(img, 6, 3, 'w'); put(img, 5, 4, 'w')
    put(img, 5, 5, 'o'); put(img, 8, 5, 'o')
    put(img, 6, 6, 'Y'); put(img, 7, 6, 'Y')
    put(img, 6, 1, 'e'); put(img, 7, 1, 'e'); put(img, 6, 2, 'y'); put(img, 7, 2, 'y')
    for (x, y) in ((4, 12), (9, 12), (3, 13), (10, 13)):
        put(img, x, y, 'e')
    return icon(img)


def soul():
    half = [
        "......P",
        "....PPP",
        "...PPPP",
        "..PPPPP",
        "..PPwoP",
        ".PPPooP",
        ".PPPPPP",
        ".PPPPPo",
        ".PPPPPP",
        ".pPPPPP",
        ".pPPPPP",
        "..pPPPP",
        "..p.pPP",
    ]
    return sprite(mirror_rows(half, {'P': 'p', 'p': 'u'}), (16, 16))


def chaos():
    img = new()
    cols = ['r', 'g', 'x', 'y']
    for k, c in enumerate(cols):
        a0 = k * math.pi / 2
        for i in range(0, 60):
            t = i / 59
            r = 0.8 + t * 5.8
            a = a0 + t * 2.4
            x, y = 6.5 + math.cos(a) * r, 6.5 + math.sin(a) * r
            for dx, dy in ((0, 0), (1, 0), (0, 1)):
                put(img, int(x - .5) + dx if t > 0.25 else int(x - .5), int(y - .5) + dy if t > 0.25 else int(y - .5), c)
    disc(img, 6.5, 6.5, 1.3, 'w')
    return icon(img)


def infinite():
    img = new()
    ring(img, 4.2, 6.5, 1.6, 3.6, 'P')
    ring(img, 9.8, 6.5, 1.6, 3.6, 'X')
    for x in range(5, 9):
        for y in range(5, 9):
            if abs(x - 6.5) + abs(y - 6.5) < 2.6:
                put(img, x, y, 'w' if (x + y) % 2 else 'p')
    put(img, 2, 4, 'w'); put(img, 11, 4, 'w')
    return icon(img)


def magnet():
    half = [
        "lll...",
        "lll...",
        "rrr...",
        "qrr...",
        "qrr...",
        "qrr...",
        "qrrr..",
        "qrrrrr",
        "RRRRRR",
    ]
    return finish(parse(mirror_rows(half, {'q': 'r', 'r': 'R', 'R': 'D', 'l': 'm'})), (16, 16))


def regen():
    heart_img = S.parse([
        "..qqrr.", ".qwrrrr", ".qrrrrr", ".qrrrrr", ".rrrrrr", "..rrrrR", "...rrrR", "....rrR", ".....rR", "......R"
    ], mirror=True, shade={'q': 'r', 'w': 'r', 'r': 'R', 'R': 'D'})
    heart_img = recolor(heart_img, {PAL['q']: PAL['T'], PAL['r']: PAL['g'], PAL['R']: PAL['G'], PAL['D']: PAL['k'],
                                    (255, 255, 255): PAL['T']})
    img = new()
    img.alpha_composite(heart_img, (0, 2))
    plus = [(6, 4), (7, 4), (6, 5), (7, 5), (6, 6), (7, 6), (6, 7), (7, 7), (4, 5), (5, 5), (8, 5), (9, 5),
            (4, 6), (5, 6), (8, 6), (9, 6)]
    for (x, y) in plus:
        put(img, x, y, 'w')
    return icon(img)

def dodge():
    img = new()
    poly(img, [(1, 12), (3, 7), (7, 3), (12, 0), (12, 4), (9, 8), (5, 11)], 'X')
    poly(img, [(2, 11), (4, 7), (8, 3), (11, 1), (10, 4), (7, 7), (4, 10)], 'w')
    line(img, (1, 13), (12, 1), 'x')
    for (x0, x1, y) in ((0, 4, 3), (0, 3, 5)):
        line(img, (x0, y), (x1, y), 'l')
    line(img, (8, 12), (13, 12), 'l')
    line(img, (10, 10), (13, 10), 'm')
    return icon(img)


def gold():
    img = new()

    def coin_at(cx, cy):
        for y in range(img.height):
            for x in range(img.width):
                dx, dy = (x + .5 - cx) / 4.5, (y + .5 - cy) / 2.2
                top = dx * dx + dy * dy <= 1
                if top:
                    put(img, x, y, 'y')
                dy2 = (y + .5 - (cy + 2)) / 2.2
                if dx * dx + dy2 * dy2 <= 1 and not top and y + .5 > cy:
                    put(img, x, y, 'Y')
    for cy in (10.5, 7.5, 4.5):
        coin_at(7, cy)
    for (x, y) in ((5, 3), (6, 3), (4, 6), (5, 6), (5, 9), (6, 9)):
        put(img, x, y, 'w')
    for (x, y) in ((8, 4), (9, 7), (9, 10)):
        put(img, x, y, 'e')
    return icon(img)

def xp():
    half = [
        "..XXzz",
        ".XXzzz",
        "XXzzzz",
        "XwzzxX"[:5] + "x",
        "Xzzxxx",
        ".zzxxx",
        "..zxxx",
        "...xxx",
        "....xx",
        ".....x",
    ]
    return sprite(mirror_rows(half, {'X': 'z', 'z': 'x', 'x': 'Z', 'w': 'z'}), (16, 16))


def clover_img(dark=False):
    img = new()
    leaves = [(4.2, 4.0), (9.8, 4.0), (4.2, 9.2), (9.8, 9.2)]
    inside = lambda x, y: any(math.hypot(x + .5 - cx, y + .5 - cy) <= 2.7 for cx, cy in leaves)
    for y in range(14):
        for x in range(14):
            if inside(x, y):
                c = PAL['g']
                if not inside(x - 1, y - 1):
                    c = PAL['T'] if not dark else PAL['g']
                if not inside(x + 1, y + 1):
                    c = PAL['G']
                put(img, x, y, c)
    for (x, y) in ((7, 7), (6, 6), (7, 6), (6, 7)):
        put(img, x, y, 'G')
    line(img, (7, 9), (5, 13), 'G')
    line(img, (8, 9), (6, 13), 'k')
    put(img, 3, 3, 'w')
    put(img, 3, 4, 'w')
    return img


def clover():
    return icon(clover_img())


def luck():
    img = clover_img()
    for (x, y) in ((12, 0), (13, 1), (12, 1), (11, 1), (12, 2), (0, 11), (0, 12), (1, 12), (0, 13)):
        put(img, x, y, 'y')
    put(img, 12, 1, 'w')
    return icon(img)


def multishot():
    img = new()
    for ang in (-38, 0, 38):
        a = math.radians(ang)
        tx, ty = 6.5 + math.sin(a) * 11, 13 - math.cos(a) * 11
        line(img, (6, 13), (round(tx), round(ty)), 'C')
        hx, hy = round(tx), round(ty)
        for (dx, dy) in ((-1, 0), (1, 0), (0, 1), (0, -1)):
            x, y = hx + dx, hy + dy
            if 0 <= x < 14 and 0 <= y < 14 and img.getpixel((x, y))[3] == 0:
                put(img, x, y, 'l')
        put(img, hx, hy, 'w')
    for (x, y) in ((6, 13), (7, 13), (5, 12), (8, 12)):
        put(img, x, y, 'w')
    return icon(img)

def range_():
    img = new()
    line(img, (2, 7), (11, 7), 'x')
    line(img, (2, 6), (11, 6), 'X')
    poly(img, [(0, 6), (3, 3), (3, 10)], 'X')
    poly(img, [(13, 6), (10, 3), (10, 10)], 'X')
    bevel(img, {C('X'): (PAL['x'], (255, 255, 255))})
    for (x, y) in ((6, 2), (7, 2), (6, 11), (7, 11)):
        put(img, x, y, 'Y')
    return icon(img)


def area():
    img = new()
    ring(img, 6.5, 6.5, 5.2, 6.8, 'e')
    ring(img, 6.5, 6.5, 3.2, 4.6, 'y')
    disc(img, 6.5, 6.5, 1.6, 'w')
    for (x, y) in ((6, 0), (7, 0), (0, 6), (13, 7), (6, 13), (7, 13)):
        put(img, x, y, 'r')
    return icon(img)


def pierce():
    img = new()
    ring(img, 7.5, 6.5, 0, 4.4, 'm')
    ring(img, 7.5, 6.5, 0, 2.8, 'a')
    ring(img, 7.5, 6.5, 4.0, 4.4, 'l')
    line(img, (0, 7), (11, 7), 'C')
    line(img, (0, 6), (11, 6), 'S')
    poly(img, [(10, 4), (10, 9), (13, 6)], 'l')
    put(img, 13, 6, 'w')
    put(img, 0, 5, 'w'); put(img, 1, 5, 'w'); put(img, 0, 8, 'w'); put(img, 1, 8, 'w')
    put(img, 2, 6, 'r'); put(img, 2, 7, 'r')
    return icon(img)


def reroll():
    img = new()
    cx = cy = 6.5

    def arc(a0, a1, c):
        for i in range(0, 61):
            a = math.radians(a0 + (a1 - a0) * i / 60)
            disc(img, cx + math.cos(a) * 4.6, cy + math.sin(a) * 4.6, 1.15, c)

    def head(a_deg, c):
        # triangle at the arc end, pointing clockwise (tangent of increasing angle)
        a = math.radians(a_deg)
        px_, py_ = cx + math.cos(a) * 4.6, cy + math.sin(a) * 4.6
        tx, ty = -math.sin(a), math.cos(a)
        nx, ny = math.cos(a), math.sin(a)
        tip = (px_ + tx * 3.4, py_ + ty * 3.4)
        b1 = (px_ + nx * 3.0, py_ + ny * 3.0)
        b2 = (px_ - nx * 3.0, py_ - ny * 3.0)
        poly(img, [tip, b1, b2], c)
    arc(205, 305, 'x')
    arc(25, 125, 'x')
    head(305, 'X')
    head(125, 'X')
    return icon(img)


def star():
    img = new()
    pts = []
    for i in range(10):
        a = math.pi * 2 * i / 10 - math.pi / 2
        r = 7.0 if i % 2 == 0 else 3.0
        pts.append((6.5 + math.cos(a) * r, 6.9 + math.sin(a) * r))
    poly(img, pts, 'y')
    bevel(img, {C('y'): (PAL['Y'], (255, 252, 200))})
    put(img, 6, 4, 'w'); put(img, 5, 5, 'w')
    return icon(img)


def trophy():
    half = [
        "Yyyyyyy",
        "Y.yyywy",
        "Y.yyyyY",
        ".Y.yyyY",
        "..Yyyyy",
        "...yyyY",
        "....yyY",
        ".....yY",
        ".....yY",
        "....eee",
        "...YYYY",
        "..eeeee",
    ]
    return sprite(mirror_rows(half, {'y': 'Y', 'Y': 'e', 'w': 'y'}), (16, 16))


def calendar():
    rows = [
        "..a........a..",
        "rrrrrrrrrrrrrr",
        "rqqrrrrrrrrrrr",
        "rrrrrrrrrrrrrr",
        "iiiiiiiiiiiiii",
        "iaaiaaiaaiaaii",
        "iaaiaaiaaiaaii",
        "iiiiiiiiiiiiii",
        "iaaiaarriaaiii",
        "iaaiaarriaaiii",
        "iiiiiiiiiiiiii",
        "iaaiaaiaaiaaii",
        "mmmmmmmmmmmmmm",
    ]
    return finish(parse(rows), (16, 16))


def lock():
    half = [
        "...lll",
        "..lm..",
        "..lm..",
        "..lm..",
        "YYYYYY",
        "yYYYYY",
        "yYYYoo",
        "yYYooo",
        "YYYYoo",
        "YYYYYo",
        "YYYYYY",
        "eeeeee",
    ]
    return sprite(mirror_rows(half, {'y': 'Y', 'Y': 'e', 'e': 'E', 'l': 'm', 'm': 'a'}), (16, 16))


def build_icons():
    return {
        'sword': sword(), 'bow': bow(), 'staff': staff(), 'damage': damage(), 'attackSpeed': attackSpeed(),
        'hp': hp(), 'boots': boots(), 'crit': crit(), 'critDamage': critDamage(), 'double': double(),
        'fire': fire(), 'frost': frost(), 'lightning': lightning(), 'poison': poison(), 'vampire': vampire(),
        'pierce': pierce(), 'explosion': explosion(), 'thunder': thunder(), 'orbit': orbit(),
        'phoenix': phoenix(), 'meteor': meteor(), 'soul': soul(), 'chaos': chaos(), 'infinite': infinite(),
        'armor': armor(), 'magnet': magnet(), 'regen': regen(), 'dodge': dodge(), 'gold': gold(),
        'xp': xp(), 'luck': luck(), 'multishot': multishot(), 'range': range_(), 'area': area(),
        'knockback': knockback(), 'shield': shield(), 'clover': clover(), 'egg': egg(), 'revive': revive(),
        'reroll': reroll(), 'chest': chest(), 'skull': skull(), 'trophy': trophy(), 'star': star(),
        'heart': heart(), 'crown': crown(), 'calendar': calendar(), 'hero': hero(), 'lock': lock(),
    }


def revive():
    heart_img = S.parse([
        "..qqrr.", ".qwrrrr", ".qrrrrr", ".qrrrrr", ".rrrrrr", "..rrrrR", "...rrrR", "....rrR", ".....rR", "......R"
    ], mirror=True, shade={'q': 'r', 'w': 'r', 'r': 'R', 'R': 'D'})
    img = new()
    img.alpha_composite(heart_img, (0, 4))
    for y in range(0, 4):                                # golden halo
        for x in range(14):
            dx, dy = (x + .5 - 7) / 5.0, (y + .5 - 1.6) / 1.5
            if 0.45 <= dx * dx + dy * dy <= 1.0:
                put(img, x, y, 'y' if y < 2 else 'Y')
    return icon(img)