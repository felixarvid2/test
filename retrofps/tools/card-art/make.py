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

Nya kort (runor, hetta, mana, pilar m.m.): 25 kort ur de sista oanvända bilderna i assets/rune-ai/flux
(tabellen V6). backgrounds/altar och backgrounds/menu beskärs till en kvadrat, packs/eko beskärs så att
texten försvinner och relics/till_manen speglas så att raketen försvinner. Pakterna för spikgeväret,
blixtstaven och långbågen ritas som siluetter här. Uppgraderingarna och de fem aktiva förmågorna är
effektbilder ur assets/ashfall-ai/flux/vfx (svart bakgrund, läggs med "screen" på samma mörklila vinjett
som rune-ai-bilderna); uppgraderingarna har vapnet som bricka i hörnet.

Kör från repo-roten: python3 retrofps/tools/card-art/make.py .          (alla)
                     python3 retrofps/tools/card-art/make.py . v5       (bara version 5)
                     python3 retrofps/tools/card-art/make.py . v6       (bara de nya korten)
"""
import os
import sys
import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'
ONLY = sys.argv[2] if len(sys.argv) > 2 else ''
ONLY_V5 = ONLY == 'v5'
FLUX = os.path.join(ROOT, 'assets/rune-ai/flux')
VFX = os.path.join(ROOT, 'assets/ashfall-ai/flux/vfx')
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

V6 = {  # kort-id: bild i assets/rune-ai/flux (de sista oanvända som inte ser moderna ut)
    # vanliga
    'runristaren': 'tags/ristning', 'manastjarnan': 'tags/stjarna', 'fjaderpennan': 'vouchers/penseln',
    'hamstraren': 'vouchers/hamstraren', 'vilostenen': 'backgrounds/altar', 'blixtstenen': 'rune-symbols/blixt',
    'stjarnkartan': 'packs/star', 'pilgrimsfrukten': 'relics/bananen', 'skattbrevet': 'packs/rist', 'askbrevet': 'packs/eko',
    # ovanliga
    'runskivan': 'relics/hologrammet', 'arkana_karnan': 'vouchers/antimateria', 'jaktmarket': 'tags/rabatt',
    'ballongerna': 'relics/kaosclownen', 'marketenterskan': 'vouchers/stjarnbod', 'andekortet': 'card-backs/eko',
    'frostglassen': 'relics/glassen', 'svarta_gavan': 'tags/relik',
    # sällsynta
    'runkistan': 'packs/relic', 'fullmanen': 'relics/till_manen', 'vulkanvaggen': 'bosses/bergvaggen',
    'pilpungen': 'packs/rune', 'demonrunorna': 'card-backs/rist',
    # legendariska
    'asktemplet': 'backgrounds/menu', 'stjarnskytten': 'card-backs/star',
}
CROP = {  # bilder som inte är kvadratiska eller har något modernt i sig: (vänster, topp, höger, botten)
    'backgrounds/altar': (190, 90, 834, 734), 'backgrounds/menu': (232, 40, 792, 600), 'packs/eko': (106, 18, 406, 318),
}
MIRROR = {'relics/till_manen': 258}  # x där bilden speglas: vänstra halvan ersätter den högra (tar bort raketen)
V6_PACTS = {'pakt_spik': 'nailgun', 'pakt_stav': 'staff', 'pakt_bage': 'bow'}
V6_UPGRADES = {  # kort-id: (vapen, effektbild i assets/ashfall-ai/flux/vfx, färgton eller None)
    'fastspikaren': ('nailgun', 'ice_shard_1', (210, 205, 225)), 'studsspiken': ('nailgun', 'hit_spark_0', None),
    'glodspiken': ('nailgun', 'fire_core_0', None), 'rivjarnet': ('nailgun', 'blood_burst', None),
    'askkedjan': ('staff', 'lightning_0', None), 'klotblixten': ('staff', 'electric_ball', None),
    'manakallan': ('staff', 'energy_glow_1', None), 'dunderslaget': ('staff', 'energy_ring', None),
    'spjutpilen': ('bow', 'plasma_bolt_0', None), 'solfjadern': ('bow', 'embers_1', None),
    'krutpilen': ('bow', 'explosion_0', None), 'atervandaren': ('bow', 'void_rift', None),
}
V6_ACTIVES = {  # kort-id: [(effektbild, skala, förskjutning x, y, spegla)]
    'blinken': [('blink_0', 0.95, 0, 0, False)],
    'tidsbubblan': [('magic_circle_cyan', 0.95, 0, 0, False)],
    'skoldbubblan': [('hex_shield_0', 0.95, 0, 0, False)],
    'valnadskallet': [('wisp_0', 0.8, -0.2, 0.02, False), ('wisp_0', 0.8, 0.2, 0.02, True)],
    'jordskalvet': [('crack_0', 0.9, 0, 0.04, False), ('shockwave_dust', 1.0, 0, 0.16, False)],
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


def draw_nailgun():
    im = Image.new('RGBA', (400, 400))
    d = ImageDraw.Draw(im)
    poly(d, [(150, 200), (196, 200), (184, 286), (140, 286)], (92, 60, 38, 255))   # handtag (trä)
    rrect(d, (136, 280, 190, 300), 6, (60, 40, 26, 255))                          # knopp
    rrect(d, (60, 140, 300, 206), 14, (88, 84, 90, 255))                          # kropp (järn)
    d.line((76, 152, 286, 152), fill=(170, 168, 176, 255), width=5)
    for x in (90, 150, 210, 270):                                                # nitar
        d.ellipse((x - 6, 186, x + 6, 198), fill=(150, 108, 52, 255), outline=INK, width=2)
    rrect(d, (20, 150, 70, 196), 8, (70, 66, 70, 255))                            # bakstycke
    rrect(d, (296, 158, 372, 188), 6, (70, 70, 76, 255))                          # pipa
    poly(d, [(372, 166), (396, 173), (372, 180)], (220, 220, 230, 255), w=3)      # spik ur pipan
    rrect(d, (204, 206, 238, 250), 6, (60, 60, 66, 255))                          # magasin
    for i in range(6):                                                           # spikar i bandet
        x = 208 + i * 14
        d.line((x, 250, x - 4, 330 - i * 8), fill=(200, 200, 210, 255), width=5)
        d.ellipse((x - 6, 244, x + 6, 256), fill=(150, 150, 160, 255), outline=INK, width=2)
    return im


def draw_staff():
    im = Image.new('RGBA', (400, 400))
    d = ImageDraw.Draw(im)
    rrect(d, (186, 120, 214, 392), 10, (110, 70, 40, 255))                        # skaft
    d.line((196, 140, 196, 380), fill=(150, 104, 62, 255), width=4)
    for y in (200, 260, 320):                                                    # lindning
        d.line((188, y, 212, y + 10), fill=(60, 34, 20, 255), width=5)
    for a, b in (((200, 128), (150, 60)), ((200, 128), (250, 60)), ((200, 128), (200, 46))):  # klor
        d.line((a, b), fill=INK, width=14)
        d.line((a, b), fill=(150, 108, 52, 255), width=8)
    d.ellipse((160, 56, 240, 136), fill=(120, 200, 255, 255), outline=INK, width=6)   # kristallklot
    d.ellipse((178, 70, 206, 98), fill=(235, 250, 255, 255))
    for pts in ([(240, 80), (280, 60), (268, 92), (312, 74)], [(160, 84), (122, 66), (132, 98), (88, 82)]):  # blixtar
        d.line(pts, fill=(200, 230, 255, 255), width=5, joint='curve')
    return im.rotate(-28, resample=Image.BICUBIC, expand=True)


def draw_bow():
    im = Image.new('RGBA', (400, 400))
    d = ImageDraw.Draw(im)
    box = (40, 20, 300, 380)
    d.arc(box, -80, 80, fill=INK, width=26)                                      # bågen
    d.arc(box, -78, 78, fill=(130, 84, 44, 255), width=16)
    d.arc((48, 28, 292, 372), -70, 70, fill=(176, 122, 70, 255), width=4)
    rrect(d, (268, 176, 300, 224), 6, (70, 44, 26, 255))                          # grepp
    top, bot = (192, 30), (192, 370)
    d.line((top, (110, 200), bot), fill=(230, 220, 190, 255), width=4)          # sträng, dragen
    d.line((110, 200, 384, 200), fill=INK, width=12)                             # pil
    d.line((110, 200, 384, 200), fill=(160, 120, 70, 255), width=6)
    poly(d, [(372, 186), (398, 200), (372, 214)], (200, 200, 210, 255), w=3)     # spets
    for dy in (-1, 1):                                                           # fjädrar
        poly(d, [(112, 200), (150, 200), (136, 200 + dy * 22), (100, 200 + dy * 22)], (200, 60, 40, 255), w=3)
    return im.rotate(36, resample=Image.BICUBIC, expand=True)


GUNS = {'axe': draw_axe, 'flamer': draw_flamer, 'launcher': draw_launcher, 'nailgun': draw_nailgun, 'staff': draw_staff, 'bow': draw_bow}


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


def flux_v6(src):
    im = Image.open(os.path.join(FLUX, src + '.webp')).convert('RGBA')
    if src in CROP:
        im = im.crop(CROP[src])
    if src in MIRROR:
        x = MIRROR[src]
        left = im.crop((0, 0, x, im.height))
        im.paste(left.transpose(Image.FLIP_LEFT_RIGHT), (x, 0))
    return im


def purple_bg():
    return vignette((58, 34, 74), (8, 5, 12))


def vfx(name, size, tint=None, flip=False):
    im = Image.open(os.path.join(VFX, name + '.webp')).convert('RGB')
    if tint:
        g = im.convert('L')
        im = Image.merge('RGB', [g.point(lambda v, c=c: v * c // 255) for c in tint])
    bb = im.convert('L').point(lambda v: 255 if v > 12 else 0).getbbox() or (0, 0, im.width, im.height)
    im = im.crop(bb)
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    k = size / max(im.size)
    return im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.LANCZOS)


def screen(dst, im, cx, cy):
    """Lägger en effektbild (ljus på svart) på dst med "screen" kring (cx, cy)."""
    layer = Image.new('RGB', dst.size, (0, 0, 0))
    layer.paste(im, (int(cx - im.width / 2), int(cy - im.height / 2)))
    rgb = ImageChops.screen(dst.convert('RGB'), layer)
    return rgb.convert('RGBA')


def v6_upgrade(cid, w, src, tint):
    big = purple_bg()
    big = screen(big, vfx(src, int(S * 4 * 0.86), tint), S * 2, S * 2 - 10)
    g = gun(w, int(S * 4 * 0.42))
    pos = (S * 4 - g.width - 10, S * 4 - g.height - 12)
    add_glow(big, g, pos, (0, 0, 0), 10)
    add_glow(big, g, pos, (255, 200, 90), 4)
    big.alpha_composite(g, pos)
    save(big, cid)


def v6_active(cid, layers):
    big = vignette((24, 46, 70), (5, 8, 14))  # blåare vinjett: förmågorna ska synas som en egen sort
    for name, sc, dx, dy, flip in layers:
        big = screen(big, vfx(name, int(S * 4 * sc), None, flip), S * 2 + dx * S * 4, S * 2 + dy * S * 4)
    save(big, cid)


def main_v6():
    srcs = list(V6.values())
    assert len(V6) == 25 and len(srcs) == len(set(srcs)), 'varje bild används bara en gång'
    old = set(V5.values()) | {s for _, s in V5_UPGRADES.values()} | {'relics/' + c for c in CARDS}
    assert not old & set(srcs), old & set(srcs)
    fx = [s for _, s, _ in V6_UPGRADES.values()] + sorted({n for ls in V6_ACTIVES.values() for n, *_ in ls})
    assert len(fx) == len(set(fx)), 'varje effektbild används bara en gång'
    n = 0
    for cid, src in V6.items():
        save(flux_v6(src), cid)
        n += 1
    for cid, w in V6_PACTS.items():
        pact(cid, w)
        n += 1
    for cid, (w, src, tint) in V6_UPGRADES.items():
        v6_upgrade(cid, w, src, tint)
        n += 1
    for cid, layers in V6_ACTIVES.items():
        v6_active(cid, layers)
        n += 1
    return n


def main():
    assert len(CARDS) == len(set(CARDS)) == 50, len(CARDS)
    srcs = list(V5.values()) + [s for _, s in V5_UPGRADES.values()]
    assert len(V5) == 30 and len(srcs) == len(set(srcs)), 'varje bild används bara en gång'
    assert not set(V5) & set(CARDS)
    if ONLY == 'v6':
        print(main_v6(), 'kortbilder ->', OUT)
        return
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
    if not ONLY_V5:
        n += main_v6()
    print(n, 'kortbilder ->', OUT)


if __name__ == '__main__':
    main()
