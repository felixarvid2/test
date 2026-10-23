#!/usr/bin/env python3
"""Build the compact game_data.json asset from the raw REA data JSON files.

Usage: python3 build_data.py [SOURCE_DIR]
  SOURCE_DIR defaults to /home/user/rea/data.
Writes app/src/main/assets/game_data.json relative to the thor-survivors project root.
"""

import json
import os
import sys

DEFAULT_SRC = "/home/user/rea/data"
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT_PATH = os.path.join(PROJECT_ROOT, "app", "src", "main", "assets", "game_data.json")

WEAPON_KEYS = [
    "WHIP", "VAMPIRICA", "MAGIC_MISSILE", "HOLY_MISSILE", "KNIFE", "THOUSAND", "AXE",
    "SCYTHE", "CROSS", "HEAVENSWORD", "HOLYBOOK", "VESPERS", "FIREBALL", "HELLFIRE",
    "GARLIC", "VORTEX", "HOLYWATER", "BORA", "LIGHTNING", "LOOP", "POWER", "ARMOR",
    "MAXHEALTH", "REGEN", "COOLDOWN", "AREA", "SPEED", "DURATION", "AMOUNT", "MOVESPEED",
    "MAGNET", "LUCK", "GROWTH",
]
WEAPON_DROP = ["description", "tips", "texture", "frameName", "hitVFX", "PlatformsData", "bDesc"]

STAGE_KEYS = ["FOREST", "LIBRARY"]
STAGE_DROP = ["description", "tips", "hyperTips", "uiTexture", "uiFrame", "texture",
              "frameName", "bestiaryBG"]
STAGE_ROW0_SUB = ["inverse", "hyper", "endless"]

ENEMY_KEEP = ["level", "maxHp", "speed", "power", "knockback", "maxKnockback", "deathKB",
              "xp", "bName", "skills", "alpha", "scale", "res_Freeze", "hpxLevel",
              "colliderRadius"]

ITEM_KEYS = ["GEM", "COIN", "COINBAG1", "COINBAG2", "ROSARY", "OROLOGION", "VACUUM",
             "ROAST", "LITTLEHEART", "CLOVER", "TREASURE"]
ITEM_KEEP = ["name", "description", "rarity", "value", "unlocksAt"]

POWERUP_DROP = ["texture", "frameName"]


def load(src_dir, name):
    with open(os.path.join(src_dir, name + ".json"), encoding="utf-8") as f:
        return json.load(f)


def drop_keys(row, keys):
    return {k: v for k, v in row.items() if k not in keys}


def keep_keys(row, keys):
    return {k: row[k] for k in keys if k in row}


def build_weapons(src):
    data = load(src, "WEAPON_DATA")
    out = {}
    missing = [k for k in WEAPON_KEYS if k not in data]
    for key in WEAPON_KEYS:
        if key not in data:
            continue
        rows = []
        for i, row in enumerate(data[key]):
            # description is kept in row 0 only
            drop = WEAPON_DROP if i > 0 else [d for d in WEAPON_DROP if d != "description"]
            rows.append(drop_keys(row, drop))
        out[key] = rows
    return out, missing


def build_stages(src):
    data = load(src, "STAGE_DATA")
    out = {}
    for key in STAGE_KEYS:
        rows = []
        for i, row in enumerate(data[key]):
            new = drop_keys(row, STAGE_DROP)
            if i == 0:
                new = drop_keys(new, STAGE_ROW0_SUB)
            rows.append(new)
        out[key] = rows
    return out


def collect_enemy_refs(stages):
    refs = []
    for key in STAGE_KEYS:
        for row in stages[key]:
            for field in ("enemies", "bosses"):
                for name in row.get(field) or []:
                    if name not in refs:
                        refs.append(name)
    return refs


def build_enemies(src, refs):
    data = load(src, "ENEMY_DATA")
    out = {}
    for name in refs:
        if name not in data:
            print("MISSING ENEMY KEY: " + name)
            continue
        out[name] = [keep_keys(row, ENEMY_KEEP) for row in data[name]]
    return out


def build_items(src):
    data = load(src, "ITEM_DATA")
    out = {}
    missing = [k for k in ITEM_KEYS if k not in data]
    for key in ITEM_KEYS:
        if key in data:
            out[key] = keep_keys(data[key], ITEM_KEEP)
    return out, missing


def build_powerups(src):
    data = load(src, "POWERUP_DATA")
    out = {}
    for key, rows in data.items():
        out[key] = [drop_keys(row, POWERUP_DROP) if isinstance(row, dict) else row
                    for row in rows]
    return out


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SRC

    weapons, weapon_missing = build_weapons(src)
    stages = build_stages(src)
    enemy_refs = collect_enemy_refs(stages)
    enemies = build_enemies(src, enemy_refs)
    items, item_missing = build_items(src)
    powerups = build_powerups(src)

    for k in weapon_missing:
        print("missing weapon key (skipped): " + k)
    for k in item_missing:
        print("missing item key (skipped): " + k)

    result = {
        "weapons": weapons,
        "stages": stages,
        "enemies": enemies,
        "items": items,
        "powerups": powerups,
    }

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, separators=(",", ":"), ensure_ascii=False)

    size_kb = os.path.getsize(OUT_PATH) / 1024.0
    print("Wrote " + OUT_PATH)
    print("weapons:  %d entries" % len(weapons))
    print("stages:   %d entries" % len(stages))
    print("enemies:  %d entries" % len(enemies))
    print("items:    %d entries" % len(items))
    print("powerups: %d entries" % len(powerups))
    print("file size: %.1f KB" % size_kb)


if __name__ == "__main__":
    main()
