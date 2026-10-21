#!/usr/bin/env python3
"""Ritar portalens bildremsa (8 rutor à 48x64, lila virvel) till assets/gfx/portal.png.
Spelet ritar den additivt, så svart blir genomskinligt. Kör: python3 make.py <repo-rot>"""
import math, sys
from PIL import Image, ImageDraw

OUT = (sys.argv[1] if len(sys.argv) > 1 else '../../..') + '/retrofps/assets/gfx/portal.png'
FW, FH, N, S = 48, 64, 8, 4  # ritas i 4x och skalas ned
cx, cy, rx, ry = FW * S / 2, FH * S * 0.53, FW * S * 0.42, FH * S * 0.45

strip = Image.new('RGBA', (FW * N, FH))
for f in range(N):
    im = Image.new('RGBA', (FW * S, FH * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for i in range(14, 0, -1):  # mjuk glöd inåt
        k = i / 14
        d.ellipse((cx - rx * k, cy - ry * k, cx + rx * k, cy + ry * k), fill=(int(70 + 60 * k), int(20 + 30 * k), int(150 + 90 * k), 255))
    ph = f / N * 2 * math.pi
    for arm in range(3):  # tre spiralarmar som snurrar
        for j in range(60):
            t = j / 60
            a = ph + arm * 2 * math.pi / 3 + t * 5.5
            x, y = cx + math.cos(a) * rx * t, cy + math.sin(a) * ry * t
            r = (1 - t) * 5 + 3
            c = (int(180 + 75 * (1 - t)), int(150 + 100 * (1 - t)), 255, 255)
            d.ellipse((x - r, y - r, x + r, y + r), fill=c)
    d.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), outline=(220, 180, 255, 255), width=6)  # kant
    d.ellipse((cx - 14, cy - 18, cx + 14, cy + 18), fill=(255, 245, 255, 255))  # ljust öga
    sm = im.resize((FW, FH), Image.LANCZOS)
    strip.paste(sm, (f * FW, 0))
strip.save(OUT, optimize=True)
print('portal', strip.size)
