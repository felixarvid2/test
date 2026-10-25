#!/usr/bin/env python3
"""Writes the Ashfall roster, the two stages and their lighting into app/src/main/assets/ashfall_data.json.

Design sections 4 (enemies, relative stats in Z units of the ZOMBIE row), 9 (stages, wave tables) and 13 (schema).
The `mods` of the stages and the treasure tables of the boss minutes are copied from game_data.json (the Vampire
Survivors stages FOREST and LIBRARY), so the XP and gold curves stay familiar. Deep Mines additionally gets enemy health
x1.25 and speed x1.05 on top of the LIBRARY mods (it is the second stage).

Run from thor-survivors/:  python3 tools/build_ashfall_stages.py
Only the keys `enemies`, `stages` (FLATS, MINES) and `lighting` (FLATS, MINES) are touched; heroes, names and
mainWeapons stay as they are.
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "app", "src", "main", "assets")

# --------------------------------------------------------------------------- enemies (design section 4)
ENEMIES = {
    "COLONIST": dict(name="Infected Colonist", archetype="CHASER", maxHp=1.0, speed=100, power=10, xp=1,
                     sprite="infected_colonist", params=dict(radius=11)),
    "SPORE_HOUND": dict(name="Spore Hound", archetype="FAST_PACK", maxHp=0.5, speed=160, power=6, xp=1,
                        sprite="spore_hound",
                        params=dict(radius=9, group=4, weave=0.8, phase=1.0)),
    "SERGEANT": dict(name="Sergeant", archetype="RANGED", maxHp=1.5, speed=90, power=8, xp=2, sprite="sergeant",
                     params=dict(radius=12, stop=132, backoff=100, backoffMul=0.7, pause=0.5, burst=3, burstGap=0.15,
                                 interval=3.5, bulletSpeed=230, shotDmg=8, range=190, clip=1)),
    "SECURITY_DRONE": dict(name="Security Drone", archetype="FLIER", maxHp=0.7, speed=120, power=5, xp=2,
                           sprite="security_drone",
                           params=dict(radius=10, stop=150, backoff=120, backoffMul=0.8, pause=0.2, burst=1,
                                       burstGap=0, interval=2.4, bulletSpeed=270, shotDmg=6, range=210)),
    "WELDER": dict(name="Welder", archetype="CHARGER", maxHp=3.0, speed=110, power=16, xp=4, sprite="welder",
                   params=dict(radius=14, runSpeed=300, minDist=80, maxDist=160, gapMin=2, gapMax=6, windup=0.6,
                               dash=0.6, recover=1.0)),
    "SPORE_CARRIER": dict(name="Spore Carrier", archetype="EXPLODER", maxHp=1.2, speed=80, power=0, xp=3,
                          sprite="spore_carrier",
                          params=dict(radius=12, trigger=40, fuse=0.35, cloudR=90, cloudT=3, cloudDps=4)),
    "SMELTER": dict(name="Smelter", archetype="TANK", maxHp=8.0, speed=70, power=20, xp=8, knockback=0,
                    sprite="smelter",
                    params=dict(radius=18, castEvery=8, castTime=0.6, poolR=60, poolT=3, poolDps=8, warn=0.6,
                                pools=1)),
    "VIRE": dict(name="Vire", archetype="SUMMONER", maxHp=5.0, speed=90, power=14, xp=10, sprite="vire",
                 params=dict(radius=13, blinkMin=125, blinkMax=200, tele=0.2, wait=0.75, stopMin=2.5, stopMax=4,
                             raise_=3, ring=8, ringSpeed=220, ringDmg=10, castRange=180)),
    # ---- bosses (design 4.1): HP in Z at wave time 0, no extra boss factor; simple behaviour from the archetype
    "CARGO_LOADER": dict(name="Cargo Loader", archetype="CHARGER", boss=True, maxHp=400, speed=70, power=26, xp=60,
                         sprite="cargo_loader",
                         params=dict(hpRamp=20, radius=20, runSpeed=320, minDist=80, maxDist=420, gapMin=1, gapMax=3.5,
                                     windup=1.0, dash=0.8, recover=1.0)),
    "SLAGBORN": dict(name="Slagborn", archetype="TANK", boss=True, maxHp=700, speed=60, power=35, xp=100,
                     sprite="slagborn",
                     params=dict(hpRamp=20, radius=24, castEvery=8, castTime=0.8, poolR=70, poolT=3, poolDps=8, warn=0.8,
                                 pools=3, trail=45, trailT=4, trailDps=6, enrageHp=0.5, enrageMul=1.3)),
    "VIRE_AWAKENED": dict(name="Vire, Awakened", archetype="SUMMONER", boss=True, maxHp=600, speed=100, power=20,
                          xp=100, sprite="vire",
                          params=dict(hpRamp=20, radius=16, blinkMin=125, blinkMax=200, tele=0.2, wait=0.6, stopMin=2,
                                      stopMax=3.5, raise_=6, ring=12, ringSpeed=220, ringDmg=10, castRange=200)),
    "SMELTER_FOREMAN": dict(name="Smelter, Foreman", archetype="TANK", boss=True, maxHp=500, speed=65, power=30,
                            xp=100, sprite="smelter", scale=1.8,
                            params=dict(hpRamp=20, radius=12, castEvery=6, castTime=0.8, poolR=60, poolT=3, poolDps=8, warn=0.8,
                                        pools=5, carpet=1)),
    "THE_FIRST": dict(name="The First", archetype="SUMMONER", boss=True, maxHp=2500, speed=80, power=40, xp=250,
                      sprite="the_first",
                      params=dict(hpRamp=29, radius=28, blinkMin=0, blinkMax=0, tele=0.2, wait=0.5, stopMin=2.5, stopMax=3.5,
                                  raise_=4, ring=12, ringSpeed=200, ringDmg=12, castRange=260)),
}

# --------------------------------------------------------------------------- wave tables (design 9.3)
K = dict(COL="COLONIST", HND="SPORE_HOUND", SGT="SERGEANT", DRN="SECURITY_DRONE", WLD="WELDER", SPC="SPORE_CARRIER",
         SML="SMELTER", VIR="VIRE")
ALL = list(K.values())


def row(minute, minimum, freq, enemies, bosses=()):
    return dict(minute=minute, minimum=minimum, frequency=freq,
                enemies=ALL if enemies == "all" else [K[e] for e in enemies.split()], bosses=list(bosses))


FLATS_ROWS = [
    row(0, 10, 1400, "COL"), row(1, 14, 1200, "COL HND"), row(2, 18, 1100, "COL HND"),
    row(3, 22, 1000, "COL HND SGT"), row(4, 26, 900, "COL HND SGT"),
    row(5, 20, 1100, "HND SGT SPC", ["CARGO_LOADER"]), row(6, 24, 1000, "COL SGT SPC"),
    row(7, 30, 900, "COL HND DRN"), row(8, 32, 850, "HND SGT DRN SPC"), row(9, 36, 800, "COL WLD DRN"),
    row(10, 40, 800, "HND WLD SPC", ["SMELTER_FOREMAN"]), row(11, 44, 750, "COL SGT WLD"),
    row(12, 48, 750, "HND DRN SPC WLD"), row(13, 52, 700, "COL SGT DRN"), row(14, 56, 700, "HND WLD SML"),
    row(15, 60, 650, "COL SGT SML SPC", ["SLAGBORN"]), row(16, 64, 650, "HND DRN WLD"),
    row(17, 68, 600, "COL SGT SML"), row(18, 72, 600, "HND SPC WLD DRN"), row(19, 76, 600, "COL SML VIR"),
    row(20, 80, 550, "HND SGT VIR WLD", ["VIRE_AWAKENED"]), row(21, 84, 550, "COL DRN SML"),
    row(22, 88, 500, "HND SPC WLD"), row(23, 92, 500, "COL SGT SML VIR"), row(24, 96, 500, "HND DRN WLD SPC"),
    row(25, 100, 450, "COL SML VIR", ["CARGO_LOADER", "CARGO_LOADER"]), row(26, 110, 450, "HND SGT DRN WLD"),
    row(27, 120, 400, "COL SML VIR SPC"), row(28, 130, 400, "HND WLD SML VIR"),
    row(29, 140, 350, "all", ["SLAGBORN", "SMELTER_FOREMAN"]),
]
# Deep Mines rows exactly as listed in 9.3; the minutes in between inherit the previous row (WaveSelector).
MINES_ROWS = [
    row(0, 12, 1300, "COL"), row(1, 16, 1100, "COL HND"), row(2, 20, 1000, "HND DRN"),
    row(3, 24, 900, "COL HND SGT"), row(4, 28, 850, "HND DRN"), row(5, 22, 1000, "HND SPC SGT", ["CARGO_LOADER"]),
    row(6, 28, 900, "COL WLD DRN"), row(7, 34, 850, "HND SPC WLD"), row(8, 38, 800, "COL SGT DRN"),
    row(9, 42, 750, "HND WLD SML"), row(10, 46, 750, "COL DRN SPC", ["SLAGBORN"]), row(12, 52, 700, "HND SGT VIR"),
    row(14, 60, 650, "COL WLD SML"), row(15, 64, 600, "HND DRN SPC", ["SMELTER_FOREMAN"]),
    row(17, 72, 600, "COL SML VIR"), row(19, 80, 550, "HND WLD DRN"),
    row(20, 84, 550, "SGT SML VIR", ["VIRE_AWAKENED"]), row(22, 92, 500, "HND SPC WLD"),
    row(24, 100, 450, "COL SML VIR DRN"),
    row(25, 110, 450, "HND WLD SML", ["CARGO_LOADER", "CARGO_LOADER", "SLAGBORN"]), row(27, 120, 400, "all"),
    row(29, 140, 350, "all", ["THE_FIRST"]),
]

# which Vampire Survivors treasure row each boss minute copies
FLATS_TREASURE = {5: 5, 10: 10, 15: 15, 20: 20, 25: 25, 29: 29}   # from FOREST
MINES_TREASURE = {5: 5, 10: 10, 15: 15, 20: 20, 25: 25, 29: 28}   # from LIBRARY


def treasure_rows(vs_stage, mapping):
    by_min = {r["minute"]: r for r in vs_stage}
    return {m: by_min[src]["treasure"] for m, src in mapping.items()}


def main():
    base = json.load(open(os.path.join(ASSETS, "game_data.json")))
    path = os.path.join(ASSETS, "ashfall_data.json")
    data = json.load(open(path))

    def fix(params):  # "raise" is a Python keyword in the table above
        return {k.rstrip("_"): v for k, v in params.items()}

    enemies = {}
    for key, e in ENEMIES.items():
        e = dict(e)
        e["params"] = fix(e["params"])
        enemies[key] = e
    data["enemies"] = enemies

    def stage(name, vs_key, rows, treasure_map, destructible, mods_fn, spawn_type=None, starting=10):
        vs = base["stages"][vs_key]
        mods = {k: vs[0]["mods"][k] for k in ("TimeLimit", "PlayerPxSpeed", "EnemySpeed", "EnemyHealthMultiplier",
                                              "GoldMultiplier", "XPBonus")}
        mods_fn(mods)
        tre = treasure_rows(vs, treasure_map)
        out_rows = []
        for r in rows:
            r = dict(r)
            if r["minute"] in tre:
                t = tre[r["minute"]]
                r["treasure"] = {k: t[k] for k in ("chances", "level", "prizeTypes")}
            out_rows.append(r)
        o = dict(name=name, mods=mods, startingSpawns=starting, destructibleType=destructible, rows=out_rows)
        if spawn_type:
            o["spawnType"] = spawn_type
        return o

    def mines_mods(m):
        m["EnemyHealthMultiplier"] = round(m["EnemyHealthMultiplier"] * 1.25, 4)
        m["EnemySpeed"] = round(m["EnemySpeed"] * 1.05, 4)

    stages = data.setdefault("stages", {})
    stages["FLATS"] = stage("Cinder Flats", "FOREST", FLATS_ROWS, FLATS_TREASURE, "MIXED_FLATS", lambda m: None,
                            starting=10)
    stages["MINES"] = stage("Deep Mines", "LIBRARY", MINES_ROWS, MINES_TREASURE, "MIXED_MINES", mines_mods,
                            spawn_type="HORIZONTAL", starting=12)
    lighting = data.setdefault("lighting", {})
    lighting["FLATS"] = dict(ambient=0.65, radius=240)
    lighting["MINES"] = dict(ambient=0.78, radius=200)
    with open(path, "w") as f:
        json.dump(data, f, indent=1, ensure_ascii=False)
        f.write("\n")
    print("wrote", path)


if __name__ == "__main__":
    main()
