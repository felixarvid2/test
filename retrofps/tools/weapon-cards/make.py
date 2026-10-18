#!/usr/bin/env python3
"""Kortbilder för vapenpakter och vapenuppgraderingar (96x96, samma format som assets/cards).

Pakt: vapnet (sidovy renderad ur RetroWeaponPack, se tools/weapon-frames) på en mörklila
vinjett med blodröd glöd. Uppgradering: en tematisk relikbild ur assets/rune-ai/flux/relics
med vapnet som liten bricka nere i hörnet, så man ser vilket vapen kortet hör till.
Kör från repo-roten: python3 retrofps/tools/weapon-cards/make.py retrofps/tools/weapon-cards/guns .
(guns/ är sidovyer renderade med tools/weapon-frames, pistolen med ry=-25 och dist=5.)
"""
import sys
from PIL import Image, ImageDraw, ImageFilter

GUNS, ROOT = sys.argv[1], sys.argv[2]
OUT = ROOT + '/retrofps/assets/cards/'
RELICS = ROOT + '/assets/rune-ai/flux/relics/'
S = 96

PACTS = {'pakt_pistol': 'pistol', 'pakt_hagel': 'shotgun', 'pakt_gevar': 'rifle', 'pakt_kpist': 'smg'}
UPGRADES = {  # kort-id: (vapen, relikbild)
    'studskulan': ('pistol', 'ekokammaren'), 'hanen': ('pistol', 'smedjan'), 'sista_kulan': ('pistol', 'raketen'),
    'duellanten': ('pistol', 'ensamvargen'), 'tomhylsan': ('pistol', 'fordrojd'),
    'drakanden': ('shotgun', 'glodsten'), 'dubbelpipan': ('shotgun', 'tvillingarna'), 'slagkraften': ('shotgun', 'stenhuggaren'),
    'splitterhaglet': ('shotgun', 'plasket'), 'snigeln': ('shotgun', 'langa_armen'),
    'kedjeblixten': ('rifle', 'overspanning'), 'kalla_blodet': ('rifle', 'nattens_oga'), 'kastmagasinet': ('rifle', 'reaktorn'),
    'skarpskytten': ('rifle', 'astrologen'),
    'spinnpipan': ('smg', 'superposition'), 'rikoschetten': ('smg', 'tidvattnet'), 'dodsmarket': ('smg', 'visitkortet'),
    'blybaltet': ('smg', 'kedjelanken'),
}


def gun(name, size):
    im = Image.open(f'{GUNS}/gun_{name}.png').convert('RGBA')
    im = im.crop(im.getbbox())
    k = size / max(im.size)
    return im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.LANCZOS)


def glow(g, col, r):
    """Mjuk glöd runt vapnet; returnerar (bild, förskjutning) med plats för oskärpan."""
    pad = r * 3
    a = Image.new('L', (g.width + pad * 2, g.height + pad * 2))
    a.paste(g.split()[3], (pad, pad))
    a = a.filter(ImageFilter.GaussianBlur(r))
    out = Image.new('RGBA', a.size, col + (0,))
    out.putalpha(a.point(lambda v: min(255, v * 2)))
    return out, pad


def add_glow(dst, g, pos, col, r):
    gl, pad = glow(g, col, r)
    dst.alpha_composite(gl, (pos[0] - pad, pos[1] - pad))


def vignette(inner, outer):
    bg = Image.new('RGB', (S * 4, S * 4), outer)
    d = ImageDraw.Draw(bg)
    for i in range(60, 0, -1):
        t = i / 60
        c = tuple(int(outer[j] + (inner[j] - outer[j]) * (1 - t)) for j in range(3))
        r = int(S * 2 * t * 1.15)
        d.ellipse((S * 2 - r, S * 2 - r, S * 2 + r, S * 2 + r), fill=c)
    return bg.resize((S, S), Image.LANCZOS).convert('RGBA')


def pact(card, w):
    big = vignette((70, 22, 30), (10, 4, 12)).resize((S * 4, S * 4), Image.LANCZOS)
    g = gun(w, int(S * 4 * 0.74))
    pos = ((S * 4 - g.width) // 2, (S * 4 - g.height) // 2)
    for col, r in (((200, 40, 30), 22), ((255, 190, 80), 6)):
        add_glow(big, g, pos, col, r)
    big.alpha_composite(g, pos)
    big.resize((S, S), Image.LANCZOS).convert('RGB').save(OUT + card + '.png')


def upgrade(card, w, relic):
    im = Image.open(RELICS + relic + '.webp').convert('RGBA').resize((S * 4, S * 4), Image.LANCZOS)
    g = gun(w, int(S * 4 * 0.42))
    pos = (S * 4 - g.width - 10, S * 4 - g.height - 12)
    add_glow(im, g, pos, (0, 0, 0), 10)
    add_glow(im, g, pos, (255, 200, 90), 4)
    im.alpha_composite(g, pos)
    im.resize((S, S), Image.LANCZOS).convert('RGB').save(OUT + card + '.png')


for c, w in PACTS.items():
    pact(c, w)
for c, (w, r) in UPGRADES.items():
    upgrade(c, w, r)
print(len(PACTS) + len(UPGRADES), 'kortbilder')
