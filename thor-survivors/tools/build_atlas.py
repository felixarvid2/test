#!/usr/bin/env python3
"""LEGACY (the game no longer loads these sprites, see tools/build_ashfall_assets.py; kept for reference).
Builds app/src/main/assets/sprites/{atlas.json,*.png,CREDITS.txt} from art-src/ and renders a preview.

Usage: python3 tools/build_atlas.py [PREVIEW_PNG]
Sheets: D = Kenney Tiny Dungeon, T = Kenney Tiny Town (12 cols), C = Tiny Creatures (10 cols); 16px, 1px spacing.
Each mapping value: (sheet, index, options). Options: k = integer screen scale per sprite pixel (world sprites),
tint = multiply colour, alpha, rot = degrees added to the draw rotation.
"""
import json, os, shutil, sys
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC = os.path.join(ROOT, "art-src")
OUT = os.path.join(ROOT, "app", "src", "main", "assets", "sprites")
SHEETS = {
    "D": ("kenney-tiny-dungeon", "tiny-dungeon.png", 12),
    "T": ("kenney-tiny-town", "tiny-town.png", 12),
    "C": ("clint-bellanger-tiny-creatures", "tiny-creatures.png", 10),
}

def S(sheet, idx, **o):
    return (sheet, idx, o)

M = {}
M["player"] = S("D", 96, k=5)  # ~80 px tall at 1080p with Sim.VIEW_H = 560

def enemy(keys, sheet, idx, k=4, **o):
    for key in keys.split():
        M["enemy." + key] = S(sheet, idx, k=k, **o)

enemy("ZOMBIE", "C", 0)
enemy("SKELETON SKULL2_SCALING DULL1 DULL2", "C", 1)
enemy("BAT1", "D", 120)
enemy("BAT2", "D", 120, tint="#C090FF")
enemy("BAT3", "D", 120, tint="#FF8080")
enemy("BAT4", "D", 120, tint="#80A8FF")
enemy("BAT5", "D", 120, tint="#FFE070")
enemy("XLBAT", "D", 120, k=5, tint="#8878A8")
enemy("GHOST ECTO1 ECTO2", "D", 121, alpha=0.75)
enemy("MUDMAN1 MUD", "C", 99)
enemy("MUDMAN2", "C", 98)
enemy("FLOWER", "C", 122)
enemy("XLFLOWER", "C", 122, k=5)
enemy("WEREWOLF", "C", 24)
enemy("MUMMY", "C", 95)
enemy("XLMUMMY", "C", 95, k=5)
enemy("XLMANTIS", "C", 140, k=5)
enemy("MEDUSA2 MEDUSA2_AGGRO", "C", 7)
enemy("XLMEDUSA", "C", 7, k=5)
enemy("WITCH1 WITCH2", "C", 65)
enemy("BUER", "C", 48)

BOSS_K = 10
for key, sh, idx, o in [
    ("BOSS_BUER", "C", 48, {}), ("BOSS_COUNT1", "C", 2, {}), ("BOSS_COUNT2", "C", 2, {}),
    ("BOSS_ECTO", "D", 121, {"alpha": 0.8}), ("BOSS_MEDUSA1", "C", 7, {}), ("BOSS_XLMEDUSA", "C", 7, {}),
    ("BOSS_MUD", "C", 99, {}), ("BOSS_WEREWOLF", "C", 93, {}), ("BOSS_WITCH2", "C", 65, {}),
    ("BOSS_XLFLOWER", "C", 122, {}), ("BOSS_XLMANTIS", "C", 140, {}), ("BOSS_XLMUMMY", "C", 127, {}),
    ("BOSS_XLDEATH", "C", 4, {}),
    # bosses spawned from the `bosses` arrays under a regular enemy key
    ("BAT4", "D", 120, {"tint": "#80A8FF"}), ("BAT5", "D", 120, {"tint": "#FFE070"}),
    ("XLBAT", "D", 120, {"tint": "#8878A8"}), ("XLMANTIS", "C", 140, {}), ("XLMUMMY", "C", 95, {}),
    ("XLFLOWER", "C", 122, {}),
]:
    M["boss." + key] = S(sh, idx, k=BOSS_K, **o)
    if key.startswith("BOSS_"):  # same boss appearing as a normal spawn (Library minutes 28-29)
        M["enemy." + key] = S(sh, idx, k=6, **o)

M["pickup.CHEST"] = S("D", 89, k=4)
M["pickup.COIN"] = S("T", 93, k=3)
M["pickup.COINBAG"] = S("D", 101, k=3)

for key in "KNIFE THOUSAND".split():
    M["proj." + key] = S("D", 103, k=3 if key == "KNIFE" else 4, rot=90)
M["proj.AXE"] = S("D", 118, k=4)
M["proj.SCYTHE"] = S("T", 129, k=5)
M["proj.FIREBALL"] = S("C", 45, k=3)
M["proj.HELLFIRE"] = S("C", 45, k=4, tint="#FF6040")
M["proj.MAGIC_MISSILE"] = S("C", 89, k=3)
M["proj.HOLY_MISSILE"] = S("C", 89, k=4, tint="#FFF0A0")
M["proj.HOLYWATER"] = S("D", 116, k=3)
M["proj.BORA"] = S("D", 116, k=4, tint="#8090FF")
# proj.HOLYBOOK / VESPERS / CROSS / HEAVENSWORD are drawn as pixel art in PixelSprites.java (no good sheet sprite)

ICONS = dict(WHIP=("D", 107), MAGIC_MISSILE=("C", 89), KNIFE=("D", 103), AXE=("D", 118), CROSS=("D", 104),
             HOLYBOOK=("D", 66), FIREBALL=("C", 45), GARLIC=("C", 13), HOLYWATER=("D", 116), LIGHTNING=("C", 56),
             POWER=("D", 115), MAXHEALTH=("D", 115), ARMOR=("D", 102), REGEN=("D", 114), COOLDOWN=("D", 113),
             AREA=("D", 129), SPEED=("D", 119), DURATION=("D", 131), AMOUNT=("D", 117), MOVESPEED=("T", 119),
             MAGNET=("T", 117), LUCK=("T", 29), GROWTH=("D", 56))
for k, (sh, i) in ICONS.items():
    M["icon." + k] = S(sh, i, **({"tint": "#FFB0B0"} if k == "MAXHEALTH" else {}))

# Ground tiles (the layout lives in game/WorldGen.java, which indexes these lists by position):
#   frames  base floor: forest 0 grass, 1 tufts, 2 flowers (library: plain floor, rubble, rubble)
#   ground  more opaque tiles graded like the floor: forest = dirt autotile 12 13 14 / 24 25 26 / 36 37 38
#           (TL T TR / L C R / BL B BR), then the inner corners 39 (grass top-left) 40 (TR) 41 (BR) 42 (BL), then 43 pebbles
#   decor   transparent objects drawn over the floor: forest 15 autumn tree, 16 green tree, 5 bush, 29 mushrooms,
#           17 sprout; library 63 + 75 bookshelf, 72 table, 82 barrel, 73 stool
# Tiny Town 3/4 and 27/28 (tree tops / cut-off trees) and the 6..8 / 18..20 / 30..32 "forest" pieces do not join into
# a clean block, so clumps are built from whole trees instead.
TILES = {
    "tile.FOREST": dict(sheet="T", frames=[0, 1, 2], variantChance=[0.15, 0.03],
                        ground=[12, 13, 14, 24, 25, 26, 36, 37, 38, 39, 40, 41, 42, 43],
                        decor=[15, 16, 5, 29, 17], decorChance=0.025, grade=[0.75, 0.78], decorGrade=[0.88, 0.92]),
    "tile.LIBRARY": dict(sheet="D", frames=[0, 12, 24], variantChance=[0.1, 0.03],
                         decor=[63, 75, 72, 82, 73], decorChance=0.025, grade=[0.55, 0.62], decorGrade=[0.8, 0.85]),
}

def rect(sheet, idx):
    cols = SHEETS[sheet][2]
    return [(idx % cols) * 17, (idx // cols) * 17, 16, 16]

def build():
    os.makedirs(OUT, exist_ok=True)
    credits = ["Sprite credits (all CC0)\n"]
    for code, (folder, name, cols) in SHEETS.items():
        im = Image.open(os.path.join(SRC, folder, "Tilemap", "tilemap.png"))
        exp = {"D": (203, 186), "T": (203, 186), "C": (170, 306)}[code]
        assert im.size == exp, (code, im.size)
        shutil.copy(os.path.join(SRC, folder, "Tilemap", "tilemap.png"), os.path.join(OUT, name))
        credits.append("== %s (sprites/%s) ==" % (folder, name))
        for f in ("SOURCE.md", "LICENSE.txt", "License.txt"):
            p = os.path.join(SRC, folder, f)
            if os.path.exists(p):
                credits.append("-- %s --\n%s" % (f, open(p, encoding="utf-8", errors="replace").read().strip()))
        credits.append("")
    open(os.path.join(OUT, "CREDITS.txt"), "w", encoding="utf-8").write("\n".join(credits))

    sprites, tiles = {}, {}
    for key, (sh, idx, o) in M.items():
        e = {"sheet": "sprites/" + SHEETS[sh][1], "frames": [rect(sh, idx)]}
        e.update(o)
        sprites[key] = e
    for key, t in TILES.items():
        sh = t["sheet"]
        tiles[key] = {"sheet": "sprites/" + SHEETS[sh][1], "frames": [rect(sh, i) for i in t["frames"]],
                      "variantChance": t["variantChance"], "decor": [rect(sh, i) for i in t["decor"]],
                      "ground": [rect(sh, i) for i in t.get("ground", [])],
                      "decorChance": t["decorChance"]}
        for g in ("grade", "decorGrade"):  # [brightness, saturation] baked into the bitmaps at load
            if g in t:
                tiles[key][g] = t[g]
    with open(os.path.join(OUT, "atlas.json"), "w") as f:
        json.dump({"sprites": sprites, "tiles": tiles}, f, indent=1)
    return sprites, tiles

def tint_img(im, hexc):
    r, g, b = int(hexc[1:3], 16), int(hexc[3:5], 16), int(hexc[5:7], 16)
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            pr, pg, pb, pa = px[x, y]
            px[x, y] = (pr * r // 255, pg * g // 255, pb * b // 255, pa)
    return im

def preview(path, sprites, tiles):
    """Reads atlas.json back (not the in-memory mapping) so the preview proves the shipped coordinates."""
    data = json.load(open(os.path.join(OUT, "atlas.json")))
    sheets = {}
    def sheet(p):
        if p not in sheets:
            sheets[p] = Image.open(os.path.join(OUT, os.path.basename(p))).convert("RGBA")
        return sheets[p]
    def crop(e, r):
        return sheet(e["sheet"]).crop((r[0], r[1], r[0] + r[2], r[1] + r[3]))
    cell, scale = 112, 4
    items = list(data["sprites"].items())
    cols = 10
    rows = (len(items) + cols - 1) // cols
    tile_rows = 3
    W, H = cols * cell, rows * cell + tile_rows * 150 + 10
    img = Image.new("RGBA", (W, H), (40, 52, 44, 255))
    d = ImageDraw.Draw(img)
    for n, (key, e) in enumerate(items):
        x, y = (n % cols) * cell, (n // cols) * cell
        sp = crop(e, e["frames"][0])
        if "tint" in e:
            sp = tint_img(sp, e["tint"])
        if "alpha" in e:
            a = sp.getchannel("A").point(lambda v: int(v * e["alpha"]))
            sp.putalpha(a)
        k = min(e.get("k", 4), 4)
        sp = sp.resize((16 * k, 16 * k), Image.NEAREST)
        img.alpha_composite(sp, (x + (cell - 16 * k) // 2, y + 4 + (64 - 16 * k) // 2 + 0))
        label = key.replace("enemy.", "e.").replace("pickup.", "p.").replace("proj.", "pr.")
        for i in range(0, len(label), 16):
            d.text((x + 3, y + 72 + (i // 16) * 11), label[i:i + 16], fill=(255, 255, 255, 255))
    y0 = rows * cell + 10
    for ti, (key, t) in enumerate(data["tiles"].items()):
        x = 4
        d.text((x, y0 + ti * 150), key + " base/variants | decor", fill=(255, 255, 0, 255))
        for fr in t["frames"] + t["decor"]:
            im = crop(t, fr).resize((16 * 3, 16 * 3), Image.NEAREST)
            img.alpha_composite(im, (x, y0 + ti * 150 + 14))
            x += 52
        # small ground patch using the same rules (chances, decor)
        import random
        rnd = random.Random(1)
        px0 = x + 20
        for cy in range(4):
            for cx in range(8):
                r = rnd.random()
                fr = t["frames"][0]
                acc = 0
                for i, c in enumerate(t["variantChance"]):
                    acc += c
                    if r < acc:
                        fr = t["frames"][i + 1]
                        break
                img.alpha_composite(crop(t, fr).resize((32, 32), Image.NEAREST), (px0 + cx * 32, y0 + ti * 150 + 14 + cy * 32))
                if rnd.random() < 0.15:  # exaggerated decor density for the preview
                    img.alpha_composite(crop(t, rnd.choice(t["decor"])).resize((32, 32), Image.NEAREST),
                                        (px0 + cx * 32, y0 + ti * 150 + 14 + cy * 32))
    img.convert("RGB").save(path)

if __name__ == "__main__":
    sp, ti = build()
    if len(sys.argv) > 1:
        preview(sys.argv[1], sp, ti)
    print("sprites:", len(sp), "tiles:", len(ti))
