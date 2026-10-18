"""Shared helpers for the pixel-art generators (palette, grid parsing, outlines, previews).

Palette values are sampled from Kenney "Tiny Dungeon" (tilemap_packed.png), which uses an
EDG32-like palette with a dark maroon outline (63, 38, 49).
"""
from PIL import Image

OUTLINE = (63, 38, 49, 255)

# One-letter palette used by every pixel grid. '.' is always transparent.
PAL = {
    'o': (63, 38, 49),      # outline / darkest (Tiny Dungeon outline)
    'n': (38, 43, 68),      # navy
    'a': (82, 96, 124),     # steel dark
    'm': (139, 155, 180),   # steel mid
    'l': (192, 203, 220),   # steel light
    'i': (228, 237, 249),   # ice white
    'w': (255, 255, 255),
    's': (234, 165, 108),   # skin
    'S': (189, 108, 74),    # skin dark / leather
    'h': (247, 194, 130),   # skin light
    'b': (118, 59, 54),     # brown dark
    'C': (207, 130, 84),    # wood / leather
    'r': (232, 69, 55),     # red
    'R': (162, 38, 51),     # red dark
    'q': (255, 112, 109),   # red light / pink
    'D': (110, 26, 43),     # deep red
    'y': (254, 231, 97),    # yellow
    'Y': (254, 174, 52),    # gold
    'e': (247, 118, 34),    # orange
    'E': (190, 74, 47),     # orange dark
    'g': (99, 199, 77),     # green
    'G': (62, 137, 72),     # green mid
    'k': (38, 92, 66),      # green dark
    'M': (67, 225, 179),    # mint (slime)
    'T': (105, 255, 212),   # mint light
    'U': (37, 149, 106),    # mint dark
    'p': (155, 76, 163),    # purple
    'P': (209, 118, 208),   # purple light
    'u': (104, 56, 108),    # purple dark
    'x': (0, 153, 219),     # cyan/blue
    'X': (117, 227, 255),   # cyan light
    'z': (44, 232, 245),    # cyan bright
    'Z': (18, 78, 137),     # blue dark
    'v': (247, 240, 220),   # bone light
    'V': (222, 208, 176),   # bone mid
    'B': (170, 150, 125),   # bone shade
    'c': (248, 232, 196),   # egg cream
    'd': (226, 196, 150),   # egg shade
}


def rgba(c, a=255):
    return (c[0], c[1], c[2], a)


def parse(rows, pal=None, mirror=False, shade=None):
    """Turn a list of equal-length strings into an RGBA image.

    mirror: rows are the left half; the right half is the reversed row (optionally recoloured with
    the `shade` dict so the right side reads as the shadowed side).
    """
    p = dict(PAL)
    if pal:
        p.update(pal)
    if mirror:
        full = []
        for r in rows:
            right = ''.join((shade or {}).get(ch, ch) for ch in reversed(r))
            full.append(r + right)
        rows = full
    w = len(rows[0])
    for i, r in enumerate(rows):
        if len(r) != w:
            raise ValueError(f'row {i} has width {len(r)}, expected {w}: {r!r}')
    img = Image.new('RGBA', (w, len(rows)), (0, 0, 0, 0))
    px = img.load()
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch == '.':
                continue
            if ch not in p:
                raise ValueError(f'unknown palette char {ch!r} at {x},{y}')
            c = p[ch]
            px[x, y] = c if len(c) == 4 else (c[0], c[1], c[2], 255)
    return img


def add_outline(img, color=OUTLINE, diagonal=False):
    """Return a copy grown by 1 px on every side with a 1 px outline (4-neighbour, like Kenney)."""
    w, h = img.size
    out = Image.new('RGBA', (w + 2, h + 2), (0, 0, 0, 0))
    out.alpha_composite(img, (1, 1))
    src = out.copy()
    s, d = src.load(), out.load()
    nb = [(1, 0), (-1, 0), (0, 1), (0, -1)]
    if diagonal:
        nb += [(1, 1), (-1, 1), (1, -1), (-1, -1)]
    for y in range(h + 2):
        for x in range(w + 2):
            if s[x, y][3]:
                continue
            for dx, dy in nb:
                nx, ny = x + dx, y + dy
                if 0 <= nx < w + 2 and 0 <= ny < h + 2 and s[nx, ny][3] > 200:
                    d[x, y] = color
                    break
    return out


def place(img, size, anchor='c', dx=0, dy=0):
    """Paste img onto a transparent canvas of `size`. anchor: c (centre), b (bottom-centre)."""
    W, H = size
    out = Image.new('RGBA', size, (0, 0, 0, 0))
    x = (W - img.width) // 2 + dx
    y = (H - img.height) // 2 + dy if anchor == 'c' else H - img.height + dy
    out.alpha_composite(img, (x, y))
    return out


def sprite(rows, size, pal=None, mirror=False, shade=None, outline=True, anchor='c', dx=0, dy=0,
           diagonal=False):
    """Grid -> outlined sprite placed on a canvas of exactly `size`."""
    img = parse(rows, pal, mirror, shade)
    if outline:
        img = add_outline(img, diagonal=diagonal)
    if img.width > size[0] or img.height > size[1]:
        raise ValueError(f'sprite {img.size} larger than canvas {size}')
    return place(img, size, anchor, dx, dy)


def scale_sheet(images, labels, scale=4, cols=8, pad=6, label_h=12, bg=(30, 22, 40)):
    """Contact sheet for review (labels via PIL default font)."""
    from PIL import ImageDraw
    cw = max(i.width for i in images) * scale + pad * 2
    cell_w = max(cw, 64)
    ch = max(i.height for i in images) * scale + pad * 2 + label_h
    rows = (len(images) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * cell_w, rows * ch), bg + (255,))
    d = ImageDraw.Draw(sheet)
    for n, (im, lab) in enumerate(zip(images, labels)):
        cx, cy = (n % cols) * cell_w, (n // cols) * ch
        big = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
        sheet.alpha_composite(big, (cx + (cell_w - big.width) // 2, cy + pad))
        d.text((cx + 3, cy + ch - label_h), lab, fill=(220, 210, 190, 255))
    return sheet


def mirror_rows(rows, shade=None):
    """Expand left-half rows into full rows (right half recoloured with `shade`)."""
    return [r + ''.join((shade or {}).get(ch, ch) for ch in reversed(r)) for r in rows]


def quad_rows(rows):
    """Expand a top-left quadrant to a 4-fold symmetric grid."""
    top = mirror_rows(rows)
    return top + list(reversed(top))


def finish(img, size, anchor='c', dx=0, dy=0, outline=True, diagonal=False):
    """Outline (optional) an already-composed interior image and place it on a `size` canvas."""
    if outline:
        img = add_outline(img, diagonal=diagonal)
    if img.width > size[0] or img.height > size[1]:
        raise ValueError(f'sprite {img.size} larger than canvas {size}')
    return place(img, size, anchor, dx, dy)
