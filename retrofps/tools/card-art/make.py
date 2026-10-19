#!/usr/bin/env python3
"""Kortbilder (96x96 RGB, samma format som de övriga i assets/cards).

Version 4: 50 kort där kortets id är relikbildens namn i assets/rune-ai/flux/relics (512x512 webp),
som skalas ned hel med Lanczos, precis som de ursprungliga korten (t.ex. askkungen.png).

Version 5: 30 nya kort. Relikmappen har bara ett fåtal oanvända bilder kvar som inte ser moderna ut
(bergstopp, gycklaren, smetade_paletten, presentkortet), så resten tas ur samma bildserie i
assets/rune-ai/flux: bosses, vouchers, tags och rune-symbols (samma stil: ett föremål på mörklila
vinjett). Tabellen V5 nedan säger vilken bild varje kort har.
Pakterna för yxan, eldkastaren och granatkastaren ritas här (vapnen finns inte i RetroWeaponPack):
en enkel siluett av vapnet på samma blodröda vinjett som tools/weapon-cards. Uppgraderingarna är en
bild ur serien med vapnet som liten bricka nere i hörnet, som de andra vapenuppgraderingarna.

Kör från repo-roten: python3 retrofps/tools/card-art/make.py .          (alla)
                     python3 retrofps/tools/card-art/make.py . v5       (bara version 5)
"""
import os
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'
ONLY_V5 = len(sys.argv) > 2 and sys.argv[2] == 'v5'
FLUX = os.path.join(ROOT, 'assets/rune-ai/flux')
RELICS = os.path.join(FLUX, 'relics')
OUT = os.path.join(ROOT, 'retrofps/assets/cards')
S = 96

CARDS = [  # kort-id = relikbild
    # vanliga
    'fyllbulten', 'fyrfoten', 'hornstenen', 'agget', 'benflojt', 'hangande_lappen', 'gronskan', 'att_gora',
    'grodan', 'halvmane', 'dominobrickan', 'sollinsen', 'glasogat', 'akrobaten', 'urtidsrunan', 'fyrkanten',
    'idolen', 'moln_nio', 'askstav', 'feltrycket',
    # ovanliga
    'spakvinnan', 'kristallkronan', 'tankestormen', 'inbrottstjuven', 'snedsteget', 'spakortet', 'avtrycket',
    'tomrummet', 'trubaduren', 'lyckokatten', 'sigillbrevet', 'rotknuta', 'schablonen', 'maskerna', 'baronen',
    # sällsynta
    'vandringsstaven', 'bryggan', 'kubtornet', 'spadomskulan', 'glad_trefot', 'pirathatten', 'horisonten',
    'runsten', 'eremiten', 'snedkronet',
    # legendariska
    'prismakronan', 'gryningen', 'travstaven', 'brokiga', 'ansiktslos',
]

V5 = {  # kort-id: bild i assets/rune-ai/flux
    # vanliga
    'lakebladet': 'bosses/grona_bladet', 'groddrunan': 'rune-symbols/natur', 'vargtanden': 'bosses/tanden',
    'jarnnaven': 'bosses/armen', 'eldrunan': 'rune-symbols/eld', 'frosttoppen': 'relics/bergstopp',
    'slaktkroken': 'bosses/kroken', 'spejarkikaren': 'vouchers/teleskop', 'manrunan': 'rune-symbols/mane',
    'marknadstaltet': 'relics/gycklaren', 'vapenladorna': 'vouchers/lager', 'dodsrunan': 'rune-symbols/dod',
    # ovanliga
    'blandbradet': 'relics/smetade_paletten', 'flockens_horn': 'vouchers/krigsrop', 'gapet': 'bosses/munnen',
    'bodelsnalen': 'bosses/nalen', 'ristarboden': 'vouchers/ristarbod', 'brinnande_tornet': 'bosses/tornet',
    'trogna_anden': 'tags/eko', 'overflodet': 'vouchers/overflod', 'spokspegeln': 'bosses/spegeln',
    # sällsynta
    'ishavet': 'bosses/vattnet', 'jagarogat': 'bosses/ogat', 'dimvasen': 'bosses/dimman',
    'gavoasken': 'relics/presentkortet', 'haxkvasten': 'vouchers/rensning', 'trallbojan': 'bosses/kedjan',
    # legendariska
    'purpurkitteln': 'bosses/purpurkarlet', 'karmosinhjartat': 'bosses/karmosinhjartat', 'dodsbesvarjaren': 'bosses/psyket',
}
V5_PACTS = {'pakt_yxa': 'axe', 'pakt_eld': 'flamer', 'pakt_gk': 'launcher'}
V5_UPGRADES = {  # kort-id: (vapen, bild)
    'virvelhugget': ('axe', 'bosses/virveln'), 'aderlataren': ('axe', 'vouchers/slipning'),
    'returkastet': ('axe', 'vouchers/omrullning'), 'skordehugget': ('axe', 'rune-symbols/sol'),
    'brinnande_jord': ('flamer', 'bosses/gloden'), 'bla_lagan': ('flamer', 'rune-symbols/kristall'),
    'sparlagan': ('flamer', 'tags/pengar'), 'eldmuren': ('flamer', 'bosses/muren'),
    'splitterskalet': ('launcher', 'bosses/stenfaltet'), 'tjarbomben': ('launcher', 'bosses/forseglaren'),
    'jattegranaten': ('launcher', 'bosses/askstormen'), 'trummagasinet': ('launcher', 'tags/runor'),
}

# ---------- vapensiluetter (ritas på 400x400 och beskärs) ----------
INK = (12, 8, 6, 255)


def poly(d, pts, fill, w=6):
    d.polygon(pts, fill=fill)
    d.line(pts + [pts[0]], fill=INK, width=w, joint='curve')


def rrect(d, box, r, fill, w=6):
    d.rounded_rectangle(box, r, fill=fill, outline=INK, width=w)


def draw_axe():
    im = Image.new('RGBA', (400, 400))
    d = ImageDraw.Draw(im)
    rrect(d, (186, 70, 214, 372), 8, (122, 78, 42, 255))           # skaft
    d.line((196, 90, 196, 360), fill=(160, 110, 64, 255), width=4)  # ljus kant
    rrect(d, (180, 336, 220, 372), 6, (70, 44, 26, 255))            # knopp
    for y in (250, 270, 290):                                      # lindning
        d.line((188, y, 212, y), fill=(60, 30, 20, 255), width=5)
    poly(d, [(200, 86), (130, 62), (84, 92), (66, 150), (84, 206), (132, 182), (200, 160)], (128, 132, 142, 255))  # blad
    d.line([(124, 70), (82, 98), (70, 150), (86, 198)], fill=(225, 228, 236, 255), width=7)                        # egg
    poly(d, [(208, 96), (268, 122), (208, 146)], (98, 100, 110, 255))                                             # nacke
    return im.rotate(-32, resample=Image.BICUBIC, expand=True)


def draw_flamer():
    im = Image.new('RGBA', (400, 400))
    d = ImageDraw.Draw(im)
    poly(d, [(16, 176), (64, 166), (64, 214), (24, 226)], (92, 60, 38, 255))   # kolv
    poly(d, [(150, 206), (186, 206), (176, 270), (140, 270)], (60, 46, 36, 255))  # handtag
    rrect(d, (58, 164, 268, 210), 10, (74, 74, 82, 255))                        # kropp
    rrect(d, (84, 104, 226, 162), 26, (150, 108, 52, 255))                      # bränsletank (mässing)
    d.line((104, 118, 206, 118), fill=(226, 190, 110, 255), width=5)
    for x in (110, 200):                                                       # band med nitar
        d.line((x, 106, x, 160), fill=(70, 50, 30, 255), width=6)
    rrect(d, (140, 92, 170, 108), 4, (60, 60, 66, 255))                        # lock
    rrect(d, (264, 176, 344, 196), 4, (60, 60, 66, 255))                        # munstycke
    rrect(d, (234, 206, 262, 236), 4, (60, 60, 66, 255))                        # främre grepp
    flame = [(340, 186), (366, 160), (360, 176), (392, 168), (372, 186), (394, 204), (360, 198), (366, 214)]
    d.polygon(flame, fill=(255, 140, 40, 255))
    d.polygon([(344, 186), (364, 174), (380, 186), (364, 198)], fill=(255, 236, 140, 255))
    return im


def draw_launcher():
    im = Image.new('RGBA', (400, 400))
    d = ImageDraw.Draw(im)
    poly(d, [(14, 156), (124, 166), (124, 200), (14, 214)], (92, 60, 38, 255))   # kolv
    rrect(d, (10, 150, 34, 220), 6, (50, 34, 24, 255))                          # kolvplatta
    poly(d, [(196, 214), (230, 214), (220, 280), (186, 280)], (60, 46, 36, 255))  # handtag
    rrect(d, (190, 142, 384, 190), 12, (70, 76, 70, 255))                       # pipa
    d.line((200, 152, 376, 152), fill=(130, 140, 130, 255), width=5)
    rrect(d, (118, 122, 216, 222), 22, (90, 94, 86, 255))                       # trumma
    for cy in (146, 172, 198):
        d.ellipse((140, cy - 9, 158, cy + 9), fill=(30, 30, 30, 255))
        d.ellipse((176, cy - 9, 194, cy + 9), fill=(30, 30, 30, 255))
    rrect(d, (300, 190, 328, 228), 4, (60, 46, 36, 255))                        # främre grepp
    return im


GUNS = {'axe': draw_axe, 'flamer': draw_flamer, 'launcher': draw_launcher}


def shade(im):
    """Ljus ovanifrån och lite smuts, så de platta formerna får volym som de renderade vapnen."""
    a = np.asarray(im).astype(np.float32)
    h = a.shape[0]
    ys = np.linspace(1.3, 0.62, h)[:, None, None]
    rng = np.random.default_rng(7)
    grit = 1 + rng.normal(0, 0.06, a.shape[:2])[:, :, None]
    a[:, :, :3] = np.clip(a[:, :, :3] * ys * grit, 0, 255)
    return Image.fromarray(a.astype(np.uint8), 'RGBA')


def gun(name, size):
    im = GUNS[name]()
    im = shade(im.crop(im.getbbox()))
    k = size / max(im.size)
    return im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.LANCZOS)


def add_glow(dst, g, pos, col, r):
    pad = r * 3
    a = Image.new('L', (g.width + pad * 2, g.height + pad * 2))
    a.paste(g.split()[3], (pad, pad))
    a = a.filter(ImageFilter.GaussianBlur(r))
    gl = Image.new('RGBA', a.size, col + (0,))
    gl.putalpha(a.point(lambda v: min(255, v * 2)))
    dst.alpha_composite(gl, (pos[0] - pad, pos[1] - pad))


def vignette(inner, outer):
    big = Image.new('RGB', (S * 4, S * 4), outer)
    d = ImageDraw.Draw(big)
    for i in range(60, 0, -1):
        t = i / 60
        c = tuple(int(outer[j] + (inner[j] - outer[j]) * (1 - t)) for j in range(3))
        r = int(S * 2 * t * 1.15)
        d.ellipse((S * 2 - r, S * 2 - r, S * 2 + r, S * 2 + r), fill=c)
    return big.convert('RGBA')


def save(im, cid):
    im.resize((S, S), Image.LANCZOS).convert('RGB').save(os.path.join(OUT, cid + '.png'))


def flux(path):
    return Image.open(os.path.join(FLUX, path + '.webp')).convert('RGBA')


def pact(cid, w):
    big = vignette((70, 22, 30), (10, 4, 12))
    g = gun(w, int(S * 4 * 0.74))
    pos = ((S * 4 - g.width) // 2, (S * 4 - g.height) // 2)
    for col, r in (((200, 40, 30), 22), ((255, 190, 80), 6)):
        add_glow(big, g, pos, col, r)
    big.alpha_composite(g, pos)
    save(big, cid)


def upgrade(cid, w, src):
    im = flux(src).resize((S * 4, S * 4), Image.LANCZOS)
    g = gun(w, int(S * 4 * 0.42))
    pos = (S * 4 - g.width - 10, S * 4 - g.height - 12)
    add_glow(im, g, pos, (0, 0, 0), 10)
    add_glow(im, g, pos, (255, 200, 90), 4)
    im.alpha_composite(g, pos)
    save(im, cid)


def main():
    assert len(CARDS) == len(set(CARDS)) == 50, len(CARDS)
    srcs = list(V5.values()) + [s for _, s in V5_UPGRADES.values()]
    assert len(V5) == 30 and len(srcs) == len(set(srcs)), 'varje bild används bara en gång'
    assert not set(V5) & set(CARDS)
    n = 0
    if not ONLY_V5:
        for cid in CARDS:
            save(Image.open(os.path.join(RELICS, cid + '.webp')).convert('RGB'), cid)
            n += 1
    for cid, src in V5.items():
        save(flux(src), cid)
        n += 1
    for cid, w in V5_PACTS.items():
        pact(cid, w)
        n += 1
    for cid, (w, src) in V5_UPGRADES.items():
        upgrade(cid, w, src)
        n += 1
    print(n, 'kortbilder ->', OUT)


if __name__ == '__main__':
    main()
