#!/usr/bin/env python3
"""Builds app/src/main/assets/ashfall/ (the art the game loads) from the owner's Ashfall assets.

Sources
  art-src/ashfall-baked/<characters|enemies|props|environment>/<name>.png + .json   (tools/bake output, 64 px/m)
  ../assets/ashfall-ai/flux/{vfx,decals,textures,stats}   and   ../assets/ashfall-ai/meshy/icons

Output (WebP lossless unless noted)
  ashfall/m_<model>.webp      one sheet per animated model (frames re-cut, scaled by SCALE, re-packed with 1 px gap)
  ashfall/world.webp          props, environment and decals in one atlas
  ashfall/vfx.webp            effect sprites, black background turned into alpha (alpha = max(r,g,b))
  ashfall/icons.webp          bottom-screen icons and gem crystals
  ashfall/ground/mine_rock.webp   seamless ground texture (lossy q88)
  ashfall/manifest.json       everything the game reads (see render/SpriteAtlas.java)
  ashfall/CREDITS.txt

Usage: python3 tools/build_ashfall_assets.py [--check]    (--check only prints sizes)
All art is the owner's own (Meshy / FLUX generations for Ashfall), so no third-party licence applies.
"""
import json, math, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BAKED = os.path.join(ROOT, "art-src", "ashfall-baked")
AI = os.path.abspath(os.path.join(ROOT, "..", "assets", "ashfall-ai"))
OUT = os.path.join(ROOT, "app", "src", "main", "assets", "ashfall")

# 64 px/m baked, a 1.75 m colonist is ~96 px tall; the top screen wants ~75 px (design: 70-80 px at 1080p).
SCALE = 0.78
DIRS = ["S", "SE", "E", "NE", "N", "NW", "W", "SW"]

# (category, name, clips kept). Clips not listed are dropped to save memory (enemies always walk, so no idle;
# the hit reaction is the white flash).
MODELS = [
    ("characters", "bastion", ["idle", "run", "attack", "attack2", "slam", "dodge", "hit", "death"]),
    ("characters", "spectre", ["idle", "run", "shoot", "throw", "dodge", "hit", "death"]),
    ("characters", "xenomant", ["idle", "run", "cast", "cast2", "slam", "dodge", "hit", "death"]),
    ("enemies", "infected_colonist", ["walk", "attack", "death"]),
    ("enemies", "sergeant", ["walk", "attack", "death"]),
    ("enemies", "welder", ["walk", "attack", "death"]),
    ("enemies", "smelter", ["walk", "attack", "death"]),
    ("enemies", "vire", ["walk", "attack", "death"]),
    ("enemies", "spore_carrier", ["walk", "death"]),
    ("enemies", "spore_hound", ["static"]),
    ("enemies", "security_drone", ["static"]),
    ("enemies", "lumen_tentacle", ["static"]),
    ("enemies", "cargo_loader", ["static"]),
    ("enemies", "slagborn", ["static"]),
    ("enemies", "the_first", ["static"]),
]

# static pieces: (category, name) baked at 64 px/m; image key is "prop.<name>"
PROPS = [
    ("props", "cargo_crate"), ("props", "barricade"), ("props", "explosive_barrel"), ("props", "supply_chest"),
    ("props", "emergency_light"), ("props", "lumen_growth"), ("props", "spore_nest"), ("props", "fuel_tank"),
    ("props", "crashed_lander"), ("props", "escape_pod"), ("props", "generator"), ("props", "control_terminal"),
    ("props", "coolant_valve"), ("props", "vent"), ("props", "compressor"), ("props", "stim_pylon"),
    ("props", "scalpel_blade"), ("props", "water_tanker"), ("props", "motorbike"),
    ("environment", "pipe_cluster"), ("environment", "smokestack"), ("environment", "debris_rock"),
    ("environment", "slag_rock"), ("environment", "catwalk"), ("environment", "industrial_wall"),
    ("environment", "wall_segment"), ("environment", "furnace_block"),
]

# decal -> longest side in px at 1080p (trimmed to its content first)
DECALS = {
    "blood_stain": 84, "bones": 150, "crystal_shards": 150, "floor_grate": 96, "footprints": 150,
    "hazard_stripes": 170, "lumen_growth": 120, "manhole": 104, "moss_patch": 140, "oil_stain": 130,
    "puddle": 130, "rubble": 140, "scorch_mark": 130, "tire_tracks": 220,
}

# vfx -> longest side in px (stored size; drawn scaled)
VFX_DEFAULT = 160
VFX = {
    "slash_0": 192, "slash_1": 192, "plasma_bolt_0": 128, "energy_glow_0": 128, "energy_glow_1": 128,
    "hit_spark_0": 128, "hit_spark_1": 96, "explosion_0": 192, "explosion_1": 192, "explosion_2": 192,
    "explosion_3": 192, "fire_core_0": 128, "fire_core_1": 128, "flame_0": 160, "flame_1": 160, "flame_2": 160,
    "flame_3": 160, "blink_0": 128, "hex_shield_0": 128, "wisp_0": 128, "wisp_1": 128, "energy_ring": 160,
    "spore_cloud_0": 192, "spore_cloud_1": 192, "spore_cloud_2": 192, "spores_0": 128, "heal_0": 128,
    "toxic_splat_0": 160, "lightning_0": 384, "lightning_1": 384, "arc_0": 160, "arc_1": 160, "arc_2": 160,
    "electric_ball": 128, "blood_burst": 160, "splat_0": 128, "splat_1": 96, "ichor_burst": 160,
    "rock_debris": 128, "scorch_0": 128, "scorch_1": 128, "warn_ring_0": 192, "embers_0": 128,
    "embers_1": 128, "smoke_0": 128, "smoke_1": 128, "dust_0": 160, "muzzle_flash": 96, "steam_0": 128,
    "ash_flake": 64, "magic_circle_green": 192, "magic_circle_cyan": 192, "magic_circle_red": 192,
    "bubbles_0": 128, "lumen_beam": 128, "void_rift": 160, "shockwave_dust": 192, "heat_ring_0": 192,
    "crack_0": 128,
}

# icon key -> (source relative to AI, px). Weapons / evolutions use the base id (PanelRenderer.baseKey).
ICON_PX = 96
ICONS = {
    "WHIP": "meshy/icons/skill_vibro_slash", "MAGIC_MISSILE": "meshy/icons/skill_spore_dart",
    "KNIFE": "meshy/icons/skill_scalpel_slash", "AXE": "meshy/icons/skill_cluster_grenade",
    "CROSS": "meshy/icons/skill_minefield", "HOLYBOOK": "meshy/icons/skill_energy_shield",
    "FIREBALL": "meshy/icons/skill_heat_vent", "GARLIC": "meshy/icons/skill_spore_burst",
    "HOLYWATER": "meshy/icons/skill_coolant_flush", "LIGHTNING": "meshy/icons/skill_magnetic_pull",
    "POWER": "flux/stats/damage", "MAXHEALTH": "flux/stats/maxLife", "ARMOR": "flux/stats/armor",
    "REGEN": "flux/stats/potionHealing", "COOLDOWN": "flux/stats/cooldownReduction",
    "AREA": "flux/stats/generic", "SPEED": "flux/stats/attackSpeed", "DURATION": "flux/stats/resourceGen",
    "AMOUNT": "flux/stats/damageVsElite", "MOVESPEED": "flux/stats/moveSpeed",
    "MAGNET": "meshy/icons/signal_pendant", "LUCK": "meshy/icons/crystal_lumen",
    "GROWTH": "meshy/icons/bio_focus", "GREED": "meshy/icons/keycard", "CURSE": "meshy/icons/crystal_void",
    "REVIVAL": "meshy/icons/skill_phase_shift",
    # main weapons, branches (ids from ashfall_data.json mainWeapons) and hero portraits (HERO_<hero>)
    "HAMMER": "meshy/icons/hydraulic_hammer", "PISTOLS": "meshy/icons/twin_pistols",
    "CASTER": "meshy/icons/skill_spore_burst",
    "SEISMIC": "meshy/icons/skill_seismic_shock", "JAB": "meshy/icons/skill_piston_jab",
    "CLEAVE": "meshy/icons/skill_furnace_cleave", "GUARD": "meshy/icons/riot_shield",
    "BARRAGE": "meshy/icons/skill_pistol_barrage", "SLUG": "meshy/icons/skill_piercing_shot",
    "QUICK": "meshy/icons/skill_quick_shot", "GRENADE": "meshy/icons/skill_cluster_grenade",
    "DART": "meshy/icons/skill_spore_dart", "TENDRILS": "meshy/icons/skill_grasping_tendrils",
    "LINK": "meshy/icons/skill_parasite_link", "WRATH": "meshy/icons/skill_wrath_of_lumen",
    "HERO_BASTION": "meshy/icons/portrait_bastion", "HERO_SPECTRE": "meshy/icons/portrait_spectre",
    "HERO_XENOMANT": "meshy/icons/portrait_xenomant",
}
# gem crystals (transparent icons, trimmed): key -> (source, px)
GEMS = {"crystal_lumen": 64, "crystal_void": 64, "crystal_ember": 64}


def save_webp(im, path, lossless=True, q=88):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if lossless:
        im.save(path, "WEBP", lossless=True, quality=100, method=4)
    else:
        im.save(path, "WEBP", quality=q, method=6)
    return os.path.getsize(path)


def rounded(im, frac=0.17):
    """Clips an icon to a rounded square (the Meshy skill icons have white corner pixels, the stat icons black ones)."""
    from PIL import ImageDraw
    w, h = im.size
    m = Image.new("L", (w * 4, h * 4), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w * 4 - 1, h * 4 - 1), radius=int(w * 4 * frac), fill=255)
    m = m.resize((w, h), Image.LANCZOS)
    out = im.copy()
    out.putalpha(Image.fromarray((np.asarray(im.getchannel("A"), dtype=np.float32) * np.asarray(m, dtype=np.float32) / 255).astype(np.uint8)))
    return out


def trim(im):
    bb = im.getchannel("A").getbbox()
    return im.crop(bb) if bb else im


def fit(im, longest):
    w, h = im.size
    s = longest / max(w, h)
    return im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)


class Packer:
    """Shelf packer with a 1 px gap; place(img) -> (x, y)."""

    def __init__(self, width):
        self.w, self.x, self.y, self.shelf = width, 0, 0, 0
        self.items = []

    def place(self, im):
        w, h = im.size
        if self.x + w + 1 > self.w:
            self.y += self.shelf + 1
            self.x, self.shelf = 0, 0
        pos = (self.x, self.y)
        self.x += w + 1
        self.shelf = max(self.shelf, h)
        self.items.append((im, pos))
        return pos

    def render(self):
        h = self.y + self.shelf
        sheet = Image.new("RGBA", (self.w, max(1, h)), (0, 0, 0, 0))
        for im, pos in self.items:
            sheet.paste(im, pos)
        return sheet


def build_model(cat, name, keep, manifest, sizes):
    m = json.load(open(os.path.join(BAKED, cat, name + ".json")))
    sheet = Image.open(os.path.join(BAKED, cat, name + ".png")).convert("RGBA")
    pk = Packer(2048)
    clips = {}
    for cname in keep:
        c = m["clips"][cname]
        frames = []
        for d in range(8):
            row = []
            for r in c["frames"][d]:
                x, y, w, h, ox, oy = r
                if w == 0 or h == 0:
                    row.append([0, 0, 0, 0, 0, 0])
                    continue
                left, top = ox * SCALE, oy * SCALE
                nx, ny = math.floor(left), math.floor(top)
                nw, nh = max(1, math.ceil((ox + w) * SCALE) - nx), max(1, math.ceil((oy + h) * SCALE) - ny)
                im = sheet.crop((x, y, x + w, y + h)).resize((nw, nh), Image.LANCZOS)
                px, py = pk.place(im)
                row.append([px, py, nw, nh, nx, ny])
            frames.append(row)
        clips[cname] = {"fps": c["fps"], "count": c["count"], "loop": c["loop"], "frames": frames}
    out = pk.render()
    fn = "m_%s.webp" % name
    sizes[fn] = save_webp(out, os.path.join(OUT, fn))
    manifest["models"][name] = {
        "sheet": "ashfall/" + fn, "frameSize": [round(v * SCALE) for v in m["frameSize"]],
        "anchor": [round(v * SCALE) for v in m["anchor"]], "pxPerMetre": m["pxPerMetre"] * SCALE,
        "clips": clips}
    return out.size


def luma_alpha(im):
    """Black-background effect (RGB) -> RGBA with alpha = max(r,g,b) and un-premultiplied colour."""
    a = np.asarray(im.convert("RGB"), dtype=np.float32)
    mx = a.max(axis=2)
    out = np.zeros(a.shape[:2] + (4,), dtype=np.uint8)
    nz = mx > 2
    col = np.where(nz[..., None], a * (255.0 / np.maximum(mx, 1)[..., None]), 0)
    out[..., :3] = np.clip(col, 0, 255).astype(np.uint8)
    out[..., 3] = np.clip(mx * 1.0, 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def build_images(manifest, sizes):
    # ---- world atlas: props, environment, decals
    pk = Packer(2048)
    images = manifest["images"]
    for cat, name in PROPS:
        m = json.load(open(os.path.join(BAKED, cat, name + ".json")))
        sheet = Image.open(os.path.join(BAKED, cat, name + ".png")).convert("RGBA")
        x, y, w, h, ox, oy = m["clips"]["static"]["frames"][0][0]
        im = sheet.crop((x, y, x + w, y + h))
        nw, nh = max(1, round(w * SCALE)), max(1, round(h * SCALE))
        im = im.resize((nw, nh), Image.LANCZOS)
        ax, ay = round((m["anchor"][0] - ox) * SCALE), round((m["anchor"][1] - oy) * SCALE)
        px, py = pk.place(im)
        images["prop." + name] = {"sheet": "ashfall/world.webp", "rect": [px, py, nw, nh], "anchor": [ax, ay]}
    for name, longest in DECALS.items():
        im = trim(Image.open(os.path.join(AI, "flux", "decals", name + ".webp")).convert("RGBA"))
        im = fit(im, longest)
        px, py = pk.place(im)
        images["decal." + name] = {"sheet": "ashfall/world.webp", "rect": [px, py, im.width, im.height],
                                   "anchor": [im.width // 2, im.height // 2]}
    sizes["world.webp"] = save_webp(pk.render(), os.path.join(OUT, "world.webp"))
    # ---- vfx
    pk = Packer(2048)
    for name, longest in VFX.items():
        im = luma_alpha(Image.open(os.path.join(AI, "flux", "vfx", name + ".webp")))
        im = fit(trim(im), longest)
        px, py = pk.place(im)
        images["vfx." + name] = {"sheet": "ashfall/vfx.webp", "rect": [px, py, im.width, im.height],
                                 "anchor": [im.width // 2, im.height // 2]}
    sizes["vfx.webp"] = save_webp(pk.render(), os.path.join(OUT, "vfx.webp"))
    # ---- icons + gems
    pk = Packer(1024)
    for key, src in ICONS.items():
        im = Image.open(os.path.join(AI, src + ".webp")).convert("RGBA").resize((ICON_PX, ICON_PX), Image.LANCZOS)
        im = rounded(im)
        px, py = pk.place(im)
        images["icon." + key] = {"sheet": "ashfall/icons.webp", "rect": [px, py, ICON_PX, ICON_PX],
                                 "anchor": [ICON_PX // 2, ICON_PX // 2]}
    for name, longest in GEMS.items():
        im = fit(trim(Image.open(os.path.join(AI, "meshy", "icons", name + ".webp")).convert("RGBA")), longest)
        px, py = pk.place(im)
        images["gem." + name] = {"sheet": "ashfall/icons.webp", "rect": [px, py, im.width, im.height],
                                 "anchor": [im.width // 2, im.height // 2]}
    sizes["icons.webp"] = save_webp(pk.render(), os.path.join(OUT, "icons.webp"))


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = {"version": 1, "scale": SCALE, "models": {}, "images": {}, "ground": {}}
    sizes, dims = {}, {}
    for cat, name, keep in MODELS:
        dims[name] = build_model(cat, name, keep, manifest, sizes)
    build_images(manifest, sizes)
    rock = Image.open(os.path.join(AI, "flux", "textures", "mine_rock.webp")).convert("RGB").resize((512, 512), Image.LANCZOS)
    sizes["ground/mine_rock.webp"] = save_webp(rock, os.path.join(OUT, "ground", "mine_rock.webp"), lossless=False)
    manifest["ground"]["mine_rock"] = {"sheet": "ashfall/ground/mine_rock.webp", "size": 512}
    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(manifest, f, separators=(",", ":"))
    with open(os.path.join(OUT, "CREDITS.txt"), "w") as f:
        f.write("Ashfall art\n\n"
                "All sprites are the owner's own assets from the game Ashfall (https://github.com/felixarvid2/Ashfall):\n"
                "- 3D models generated with Meshy, baked to 8-direction sprite sheets by tools/bake (art-src/ashfall-baked)\n"
                "- 2D art (effects, decals, ground texture, stat icons) generated with FLUX.2 Turbo on fal.ai, icons with Meshy\n"
                "  (assets/ashfall-ai). No third-party licence or credit applies.\n"
                "Rebuilt by tools/build_ashfall_assets.py, do not edit by hand.\n")
    tot = 0
    for k, v in sorted(sizes.items()):
        tot += v
        print("%-28s %8.1f KB" % (k, v / 1024))
    px = sum(w * h for w, h in dims.values())
    print("total files %.2f MB, model sheets decode to %.1f MB" % (tot / 1048576, px * 4 / 1048576))
    for n, d in dims.items():
        print("  %-18s %4dx%-4d %5.1f MB RAM" % (n, d[0], d[1], d[0] * d[1] * 4 / 1048576))


if __name__ == "__main__":
    main()
