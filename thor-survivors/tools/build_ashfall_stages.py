#!/usr/bin/env python3
"""Writes the Ashfall roster, the two stages and their lighting into app/src/main/assets/ashfall_data.json.

Design sections 4 (enemies, relative stats in Z units of the ZOMBIE row), 9 (stages, wave tables) and 13 (schema).
The `mods` of the stages and the treasure tables of the boss minutes are copied from game_data.json (the Vampire
Survivors stages FOREST and LIBRARY), so the XP and gold curves stay familiar. Deep Mines additionally gets enemy health
x1.25 and speed x1.05 on top of the LIBRARY mods (it is the second stage).

Run from thor-survivors/:  python3 tools/build_ashfall_stages.py
Only the keys `enemies`, `stages` (FLATS, MINES), `lighting` (FLATS, MINES), `elites`, `equipment` and `equipmentRules`
are touched, plus the balance numbers listed in HERO_TUNE and MAIN_TUNE (design phase 12: they are applied on top of the
heroes and mainWeapons that are already in the file; names, texts and branches stay as they are).
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "app", "src", "main", "assets")

# --------------------------------------------------------------------------- enemies (design section 4)
ENEMIES = {
    "COLONIST": dict(name="Infected Colonist", archetype="CHASER", maxHp=1.0, speed=100, power=12, xp=1,
                     sprite="infected_colonist", params=dict(radius=11)),
    "SPORE_HOUND": dict(name="Spore Hound", archetype="FAST_PACK", maxHp=0.5, speed=160, power=7, xp=1,
                        sprite="spore_hound",
                        params=dict(radius=9, group=4, weave=0.8, phase=1.0)),
    "SERGEANT": dict(name="Sergeant", archetype="RANGED", maxHp=1.5, speed=90, power=9, xp=2, sprite="sergeant",
                     params=dict(radius=12, stop=132, backoff=100, backoffMul=0.7, pause=0.5, burst=3, burstGap=0.15,
                                 interval=3.5, bulletSpeed=230, shotDmg=8, range=190, clip=1)),
    "SECURITY_DRONE": dict(name="Security Drone", archetype="FLIER", maxHp=0.7, speed=120, power=5, xp=2,
                           sprite="security_drone",
                           params=dict(radius=10, stop=150, backoff=120, backoffMul=0.8, pause=0.2, burst=1,
                                       burstGap=0, interval=2.4, bulletSpeed=270, shotDmg=6, range=210)),
    "WELDER": dict(name="Welder", archetype="CHARGER", maxHp=3.0, speed=110, power=18, xp=4, sprite="welder",
                   params=dict(radius=14, runSpeed=300, minDist=80, maxDist=160, gapMin=2, gapMax=6, windup=0.6,
                               dash=0.6, recover=1.0)),
    "SPORE_CARRIER": dict(name="Spore Carrier", archetype="EXPLODER", maxHp=1.2, speed=80, power=0, xp=3,
                          sprite="spore_carrier",
                          params=dict(radius=12, trigger=40, fuse=0.35, cloudR=85, cloudT=2.5, cloudDps=2)),
    "SMELTER": dict(name="Smelter", archetype="TANK", maxHp=8.0, speed=70, power=23, xp=8, knockback=0,
                    sprite="smelter",
                    params=dict(radius=18, castEvery=8, castTime=0.6, poolR=60, poolT=3, poolDps=6, warn=0.6,
                                pools=1)),
    "VIRE": dict(name="Vire", archetype="SUMMONER", maxHp=5.0, speed=90, power=16, xp=10, sprite="vire",
                 params=dict(radius=13, blinkMin=125, blinkMax=200, tele=0.2, wait=0.75, stopMin=2.5, stopMax=4,
                             raise_=3, ring=8, ringSpeed=220, ringDmg=10, castRange=180)),
    # ---- bosses (design 4.1): HP in Z at wave time 0, no extra boss factor; real patterns in game/BossAi (param `pattern`)
    "CARGO_LOADER": dict(name="Cargo Loader", archetype="BOSS", boss=True, maxHp=360, speed=70, power=22, xp=60,
                         sprite="cargo_loader",
                         params=dict(pattern=1, hpRamp=20, radius=20, runSpeed=320, minDist=80, maxDist=420, gapMin=1,
                                     gapMax=3.5, windup=1.0, dash=1.0, recover=1.0, lineW=60, stunHero=0.4,
                                     stompR=120, stompWarn=0.9, stompDmg=22, crates=3, crateR=44, crateWarn=1.0,
                                     crateDmg=16)),
    "SLAGBORN": dict(name="Slagborn", archetype="BOSS", boss=True, maxHp=520, speed=60, power=35, xp=100,
                     sprite="slagborn",
                     params=dict(pattern=2, hpRamp=20, radius=24, castEvery=8, castTime=0.8, bombs=3, bombsEnraged=5,
                                 bombR=46, bombWarn=1.0, bombDmg=12, poolR=44, poolT=3, poolDps=7, trail=45, trailT=4,
                                 trailDps=6, enrageHp=0.5, enrageMul=1.3, enrageCast=0.7)),
    "VIRE_AWAKENED": dict(name="Vire, Awakened", archetype="BOSS", boss=True, maxHp=540, speed=100, power=20,
                          xp=100, sprite="vire",
                          params=dict(pattern=3, hpRamp=20, radius=16, blinkMin=125, blinkMax=200, tele=0.2, wait=0.6,
                                      stopMin=2, stopMax=3.5, raise_=6, ring=12, ringSpeed=220, ringDmg=10,
                                      ringGap=0.1, phase1Hp=0.66, phase2Hp=0.33, carriers=4)),
    "SMELTER_FOREMAN": dict(name="Smelter, Foreman", archetype="BOSS", boss=True, maxHp=450, speed=65, power=30,
                            xp=100, sprite="smelter", scale=1.8,
                            params=dict(pattern=4, hpRamp=20, radius=12, castEvery=6, castTime=0.8, poolR=60, poolT=3,
                                        poolDps=6, warn=0.8, pools=5, pullHp=0.25, pullEvery=8, pullWarn=1.1,
                                        pullRange=340, pullSpeed=300, pullTime=0.7, slamR=70, slamDmg=18)),
    "THE_FIRST": dict(name="The First", archetype="BOSS", boss=True, maxHp=1800, speed=80, power=40, xp=250,
                      sprite="the_first",
                      params=dict(pattern=5, hpRamp=28, radius=28, phase1Hp=0.66, phase2Hp=0.33, ring=12,
                                  ringSpeed=200, ringDmg=12, ringEvery=3.5, ringEvery3=5, tentEvery=5, tentEvery3=8,
                                  tentCount=3, tentRadius=300, lanes=2, laneLen=560, laneW=46, laneDps=22,
                                  laneWarn=1.0, laneLife=3.2, laneSpin=0.85, laneGap=2.0, hounds=6, houndEvery=9,
                                  pulseEvery=6, pulseWarn=1.5, pulseDmg=28)),
    # a killable tentacle: bursts from the ground (warn ring, then up for `up` seconds), see BossAi.tentacle.
    # Design 4.1 gives it 150 Z when exposed, which no build kills in the 1.2 s it is up: 8 Z here.
    "LUMEN_TENTACLE": dict(name="Lumen Tentacle", archetype="TENTACLE", maxHp=8.0, speed=0, power=25, xp=5,
                           knockback=0, sprite="lumen_tentacle", params=dict(radius=15, warn=0.8, up=1.2, hitR=34)),
}


# --------------------------------------------------------------------------- elites (design 5) and equipment (design 6)
# phase 12: an elite every 125 s (floor 90 s), the XP of an elite x4 and its pile 0.7 levels (was 8 and 2.0: the elites alone were a
# quarter of all XP late), the Armored modifier takes `armor` off every hit
ELITES = dict(first=180, interval=125, min=90, shrinkPerMin=0.01, hpMul=6, damageMul=1.5, scale=1.4, speedMul=0.9,
              xpMul=4, dist=400, adds=6, mods2At=720, mods3At=1440, xpPileGems=5, xpPileLevels=0.7, armor=3)

# --------------------------------------------------------------------------- phase 12 balance (heroes and main weapons)
# Applied on top of the heroes / mainWeapons already in ashfall_data.json: dotted path -> value. Measured with StageSoak (see the
# thor-survivors-balance skill): a main weapon is strong but no longer replaces the VS build, Spectre survives like the others.
HERO_TUNE = {
    # glass cannon, but not made of glass: HP 80 -> 105, armor 1, regen 0.5, and every level takes 0.7% less damage (-35% at level 50)
    "SPECTRE.hp": 105, "SPECTRE.armor": 1, "SPECTRE.regen": 0.5, "SPECTRE.perLevel.maxHp": 0.004,
    "SPECTRE.perLevel.damageTaken": -0.007,
    "BASTION.regen": 0.3,   # was 0.4: the tank survived 90% of the Mines runs once the early deaths were gone
}
MAIN_TUNE = {
    "HAMMER.power": 1.2, "HAMMER.params.slamPower": 1.8, "HAMMER.interval": 1200,   # was 1.6 / 2.4 / 1100
    "CASTER.power": 0.8, "CASTER.params.burstPower": 0.4,                              # was 1.2 / 0.5
    # PISTOLS stay as they were (0.6, no pierce): pierce 1 made Spectre the strongest main weapon (111% of the Whip) without helping his survival
}
HERO_TEXT = {"SPECTRE": "Twin Pistols fire a volley down the aim line. Fragile and fast. Each level: +1% crit chance, +0.5% move speed, -0.7% damage taken."}
# the gem value of a kill fades with the run time (StageDef.xpFade): keeps the early levels, stops the XP flood (level 140 -> about 75 at 30:00)
XP_FADE = {"FLATS": dict(**{"from": 420, "to": 1800, "end": 0.15}), "MINES": dict(**{"from": 360, "to": 1500, "end": 0.08})}
FLATS_HEALTH, MINES_HEALTH = 1.2, 1.5   # EnemyHealthMultiplier (the Ashfall bosses scale with it too)

# slot, name, icon (atlas key icon.<icon>), values (PlayerStats keys; a base item's values are the Common ones)
EQUIPMENT = {
    "COMBAT_HELM": ("HEAD", "Combat Helm", "combat_helm", {"armor": 1}),
    "HEADLAMP": ("HEAD", "Headlamp", "bio_focus", {"lightRadius": 0.10}),
    "TARGETING_VISOR": ("HEAD", "Targeting Visor", "combat_helm_2", {"critChance": 0.04}),
    "PLATED_VEST": ("BODY", "Plated Vest", "plated_vest", {"maxHp": 0.10}),
    "RIOT_SHIELD": ("BODY", "Riot Shield", "riot_shield", {"damageTaken": -0.04}),
    "INJECTOR_RIG": ("BODY", "Injector Rig", "injector_rig", {"regen": 0.2}),
    "SERVO_GAUNTLETS": ("GLOVES", "Servo Gauntlets", "servo_gauntlets", {"power": 0.05}),
    "HYDRAULIC_KNUCKLES": ("GLOVES", "Hydraulic Knuckles", "hydraulic_knuckles", {"mainDamage": 0.08}),
    "TRIGGER_GLOVES": ("GLOVES", "Trigger Gloves", "servo_gauntlets_2", {"cooldown": -0.04}),
    "MAG_BOOTS": ("FEET", "Mag Boots", "mag_boots", {"moveSpeed": 0.05}),
    "ARMORED_GREAVES": ("FEET", "Armored Greaves", "armored_greaves", {"armor": 1, "knockbackTaken": -0.10}),
    "QUICK_SOLES": ("FEET", "Quick Soles", "mag_boots_2", {"dodgeCooldown": -0.10}),
    "CONDUIT_RING": ("RING", "Conduit Ring", "conduit_ring", {"statusChance_electrify": 0.06}),
    "SIGNET_OF_ASH": ("RING", "Signet of Ash", "conduit_ring_2", {"statusChance_burn": 0.06}),
    "FROST_BAND": ("RING", "Frost Band", "conduit_ring_3", {"statusChance_frost": 0.06}),
    "SIGNAL_PENDANT": ("NECK", "Signal Pendant", "signal_pendant", {"magnet": 0.15}),
    "ECHO_RELIC": ("NECK", "Echo Relic", "echo_relic", {"growth": 0.04}),
    "LUMEN_PENDANT": ("NECK", "Lumen Pendant", "crystal_lumen", {"luck": 0.05}),
}
# uniques: fixed values (no rarity multiplier), dropped by the named boss (the Seed by a tentacle killed in a hazard burst)
UNIQUES = {
    "CROWN_OF_THE_HIVE": ("HEAD", "Crown of the Hive", "unique_crown_of_the_hive",
                          {"amount": 1, "enemySpeed": 0.05}, "VIRE_AWAKENED"),
    "ASHEN_HEARTWOOD": ("BODY", "Ashen Heartwood", "unique_ashen_heartwood",
                        {"maxHp": 0.25, "burnImmune": 1}, "SLAGBORN"),
    "FIST_OF_KHAROS": ("GLOVES", "Fist of Kharos", "unique_fist_of_kharos",
                       {"mainDamage": 0.30, "mainSize": 0.10}, "CARGO_LOADER"),
    "ASHWALKER_TREADS": ("FEET", "Ashwalker Treads", "unique_ashwalker_treads",
                         {"moveSpeed": 0.15, "ashTrail": 1}, "SMELTER_FOREMAN"),
    "HEART_OF_LUMEN": ("NECK", "Heart of Lumen", "unique_heart_of_lumen",
                       {"revivals": 1, "lightRadius": 0.15}, "THE_FIRST"),
    "SEED_OF_ACCORD": ("RING", "Seed of Accord", "unique_seed_of_accord", {"cloudHeal": 1}, "LUMEN_TENTACLE"),
}
# value multipliers Common / Uncommon / Rare, a unique counts as 3.0 when compared, salvage pays 5 gold per point,
# the rarity roll starts at 60 / 32 / 8 at minute 3 and moves 1.2 points per minute from Common to Rare
EQUIPMENT_RULES = dict(mult=[1.0, 1.6, 2.4], uniqueValue=3.0, salvage=5, common=60, uncommon=32, rare=8,
                       shiftPerMin=1.2, fromMinute=3, commonMin=10, luckPoints=20)

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
    row(28, 130, 375, "all", ["THE_FIRST"]), row(29, 140, 350, "all"),
]

# which Vampire Survivors treasure row each boss minute copies
FLATS_TREASURE = {5: 5, 10: 10, 15: 15, 20: 20, 25: 25, 29: 29}   # from FOREST
MINES_TREASURE = {5: 5, 10: 10, 15: 15, 20: 20, 25: 25, 28: 28}   # from LIBRARY


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

    def flats_mods(m):
        m["EnemyHealthMultiplier"] = FLATS_HEALTH

    def mines_mods(m):
        m["EnemyHealthMultiplier"] = MINES_HEALTH
        m["EnemySpeed"] = round(m["EnemySpeed"] * 1.05, 4)

    stages = data.setdefault("stages", {})
    stages["FLATS"] = stage("Cinder Flats", "FOREST", FLATS_ROWS, FLATS_TREASURE, "MIXED_FLATS", flats_mods,
                            starting=10)
    stages["MINES"] = stage("Deep Mines", "LIBRARY", MINES_ROWS, MINES_TREASURE, "MIXED_MINES", mines_mods,
                            spawn_type="HORIZONTAL", starting=12)
    for key, fade in XP_FADE.items():
        stages[key]["xpFade"] = fade
    stages["MINES"]["tentacles"] = dict(minutes=[8, 13, 18, 23, 27], length=20, every=4, count=3, radius=400)
    data["elites"] = ELITES
    eq = {}
    for key, (slot, name, icon, values) in EQUIPMENT.items():
        eq[key] = dict(name=name, slot=slot, icon=icon, values=values)
    for key, (slot, name, icon, values, source) in UNIQUES.items():
        eq[key] = dict(name=name, slot=slot, icon=icon, values=values, unique=True, source=source)
    data["equipment"] = eq
    data["equipmentRules"] = EQUIPMENT_RULES
    for table, root in ((HERO_TUNE, data["heroes"]), (MAIN_TUNE, data["mainWeapons"])):
        for dotted, value in table.items():
            keys = dotted.split(".")
            node = root
            for k in keys[:-1]:
                node = node[k]
            node[keys[-1]] = value
    for hero, text in HERO_TEXT.items():
        data["heroes"][hero]["description"] = text
    lighting = data.setdefault("lighting", {})
    lighting["FLATS"] = dict(ambient=0.65, radius=240)
    lighting["MINES"] = dict(ambient=0.78, radius=200)
    with open(path, "w") as f:
        json.dump(data, f, indent=1, ensure_ascii=False)
        f.write("\n")
    print("wrote", path)


if __name__ == "__main__":
    main()
