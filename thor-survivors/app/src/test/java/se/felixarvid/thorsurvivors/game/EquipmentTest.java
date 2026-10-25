package se.felixarvid.thorsurvivors.game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import se.felixarvid.thorsurvivors.TestData;
import se.felixarvid.thorsurvivors.data.EquipDef;
import se.felixarvid.thorsurvivors.data.GameData;
import se.felixarvid.thorsurvivors.game.Entities.Enemy;

import java.util.HashMap;
import java.util.Map;

/**
 * Design phase 9, equipment (design section 6): the 18 base items and 6 uniques, their stats through PlayerStats at every
 * rarity, the drop as a pickup crate, the empty-slot / better / salvage rules, the choice screen and that nothing else ever
 * pauses the run, the unique drops of the named bosses.
 */
public class EquipmentTest {
    private static final float DT = 1f / 60f;

    private static GameData d() throws Exception {
        return TestData.load();
    }

    private static Sim sim(String hero, Map<String, Double> meta) throws Exception {
        GameData d = d();
        Sim s = new Sim(d, d.stages.get("FLATS"), null, meta, hero, 5);
        s.noSpawns = true;
        s.enemyN = 0;
        return s;
    }

    private static Sim sim() throws Exception {
        return sim(null, new HashMap<String, Double>());
    }

    private static PlayerStats stats(String item, int rar) throws Exception {
        GameData d = d();
        Equipment eq = new Equipment();
        EquipDef def = d.equipment.get(item);
        eq.def[def.slot] = def;
        eq.rar[def.slot] = rar;
        return PlayerStats.compute(new Inventory(), new HashMap<String, Double>(), 0, null, 1, eq, d);
    }

    private static final PlayerStats NONE = PlayerStats.compute(new Inventory(), new HashMap<String, Double>(), 0);

    // ------------------------------------------------------------------ the data

    @Test
    public void eighteenBaseItemsThreePerSlotAndSixUniques() throws Exception {
        GameData d = d();
        assertEquals(18, d.baseItems.size());
        assertEquals(24, d.equipList.size());
        int[] perSlot = new int[EquipDef.SLOTS];
        for (EquipDef e : d.baseItems) perSlot[e.slot]++;
        for (int n : perSlot) assertEquals(3, n);
        assertEquals(6, d.uniqueBySource.size());
        int[] uniqueSlot = new int[EquipDef.SLOTS];
        for (EquipDef e : d.uniqueBySource.values()) {
            assertTrue(e.unique);
            uniqueSlot[e.slot]++;
        }
        for (int n : uniqueSlot) assertEquals("one unique per slot", 1, n);
        assertEquals(1.0, d.equipMult[0], 0);
        assertEquals(1.6, d.equipMult[1], 0);
        assertEquals(2.4, d.equipMult[2], 0);
        for (int i = 0; i < d.equipList.size(); i++) assertEquals(i, d.equipList.get(i).index);
    }

    // ------------------------------------------------------------------ stats through PlayerStats

    private static double expect(String item, String key, int rar) throws Exception {
        return d().equipment.get(item).values.get(key) * Equipment.mult(d(), rar);
    }

    @Test
    public void everyBaseItemChangesItsStatByTheCommonValueTimesTheRarity() throws Exception {
        for (int rar = Equipment.COMMON; rar <= Equipment.RARE; rar++) {
            double m = d().equipMult[rar];
            assertEquals("armor", 1 * m, stats("COMBAT_HELM", rar).armor, 1e-9);
            assertEquals("light", 1 + 0.10 * m, stats("HEADLAMP", rar).lightRadius, 1e-9);
            assertEquals("crit", 0.04 * m, stats("TARGETING_VISOR", rar).critChance, 1e-9);
            assertEquals("crit reaches the auto weapons too", 0.04 * m, stats("TARGETING_VISOR", rar).critBonus, 1e-9);
            assertEquals("max hp", 1 + 0.10 * m, stats("PLATED_VEST", rar).maxHpMul, 1e-9);
            assertEquals("damage taken", 1 - 0.04 * m, stats("RIOT_SHIELD", rar).damageTaken, 1e-9);
            assertEquals("regen", 0.2 * m, stats("INJECTOR_RIG", rar).regen, 1e-9);
            assertEquals("might", 1 + 0.05 * m, stats("SERVO_GAUNTLETS", rar).might, 1e-9);
            assertEquals("main damage", 1 + 0.08 * m, stats("HYDRAULIC_KNUCKLES", rar).mainDamage, 1e-9);
            assertEquals("cooldown", 1 - 0.04 * m, stats("TRIGGER_GLOVES", rar).cooldownMul, 1e-9);
            assertEquals("move speed", 1 + 0.05 * m, stats("MAG_BOOTS", rar).moveSpeedMul, 1e-9);
            PlayerStats greaves = stats("ARMORED_GREAVES", rar);
            assertEquals("greaves armor", 1 * m, greaves.armor, 1e-9);
            assertEquals("greaves knockback", 1 - 0.10 * m, greaves.knockbackTaken, 1e-9);
            assertEquals("dodge cooldown", 1 - 0.10 * m, stats("QUICK_SOLES", rar).dodgeCooldown, 1e-9);
            assertEquals("electrify", 0.06 * m, stats("CONDUIT_RING", rar).statusChance[Entities.ST_ELECTRIFY], 1e-9);
            assertEquals("burn", 0.06 * m, stats("SIGNET_OF_ASH", rar).statusChance[Entities.ST_BURN], 1e-9);
            assertEquals("frost", 0.06 * m, stats("FROST_BAND", rar).statusChance[Entities.ST_FROST], 1e-9);
            assertEquals("pickup range", 1 + 0.15 * m, stats("SIGNAL_PENDANT", rar).magnetMul, 1e-9);
            assertEquals("xp", 1 + 0.04 * m, stats("ECHO_RELIC", rar).growthMul, 1e-9);
            assertEquals("luck", 0.05 * m, stats("LUMEN_PENDANT", rar).luck, 1e-9);
        }
        // the Rare examples of the design table
        assertEquals(2.4, stats("COMBAT_HELM", Equipment.RARE).armor, 1e-9);
        assertEquals(1.24, stats("HEADLAMP", Equipment.RARE).lightRadius, 1e-9);
        assertEquals(0.096, stats("TARGETING_VISOR", Equipment.RARE).critChance, 1e-9);
        assertEquals(0.48, stats("INJECTOR_RIG", Equipment.RARE).regen, 1e-9);
        assertEquals(0.144, stats("CONDUIT_RING", Equipment.RARE).statusChance[Entities.ST_ELECTRIFY], 1e-9);
        // nothing worn: the neutral stats
        assertEquals(1.0, NONE.lightRadius, 0);
        assertEquals(1.0, NONE.damageTaken, 0);
        assertEquals(1.0, NONE.mainDamage, 0);
        assertEquals(1.0, NONE.dodgeCooldown, 0);
        assertEquals(1.0, NONE.knockbackTaken, 0);
        assertEquals(0.0, NONE.statusChance[Entities.ST_BURN], 0);
    }

    @Test
    public void everyUniqueHasItsFixedValuesAndFlags() throws Exception {
        PlayerStats crown = stats("CROWN_OF_THE_HIVE", Equipment.UNIQUE);
        assertEquals("+1 amount on all auto weapons", 1, crown.amountBonus);
        assertEquals("enemies +5% speed", 1.05, crown.enemySpeed, 1e-9);
        PlayerStats heart = stats("ASHEN_HEARTWOOD", Equipment.UNIQUE);
        assertEquals(1.25, heart.maxHpMul, 1e-9);
        assertTrue(heart.burnImmune);
        PlayerStats fist = stats("FIST_OF_KHAROS", Equipment.UNIQUE);
        assertEquals(1.30, fist.mainDamage, 1e-9);
        assertEquals(1.10, fist.mainSize, 1e-9);
        PlayerStats treads = stats("ASHWALKER_TREADS", Equipment.UNIQUE);
        assertEquals(1.15, treads.moveSpeedMul, 1e-9);
        assertTrue(treads.ashTrail);
        PlayerStats lumen = stats("HEART_OF_LUMEN", Equipment.UNIQUE);
        assertEquals("+1 revival", 1, lumen.revivals);
        assertEquals(1.15, lumen.lightRadius, 1e-9);
        assertTrue(stats("SEED_OF_ACCORD", Equipment.UNIQUE).cloudHeal);
        assertFalse(NONE.burnImmune || NONE.ashTrail || NONE.cloudHeal);
    }

    // ------------------------------------------------------------------ the stats really act on the run

    @Test
    public void statusChanceIsRolledOnEveryHit() throws Exception {
        Sim s = sim();
        s.giveEquipment("SIGNET_OF_ASH", Equipment.RARE); // Burn on 14.4% of hits
        Enemy e = s.addEnemy("ZOMBIE", 900, 0, false);
        e.hp = e.maxHp = 1e9f;
        int burns = 0, n = 4000;
        for (int i = 0; i < n; i++) {
            e.burn = 0;
            s.hurt(e, 1f, 0f, 1f, 0, 0, 0f);
            if (e.burn > 0) burns++;
        }
        assertEquals("about 14.4% of " + n + " hits: " + burns, 0.144, burns / (double) n, 0.02);
        Sim t = sim();
        Enemy f = t.addEnemy("ZOMBIE", 900, 0, false);
        f.hp = f.maxHp = 1e9f;
        for (int i = 0; i < 500; i++) t.hurt(f, 1f, 0f, 1f, 0, 0, 0f);
        assertEquals("no ring, no status", 0, f.burn | f.frost | f.elec);
        Sim u = sim();
        u.giveEquipment("FROST_BAND", Equipment.RARE);
        u.giveEquipment("CONDUIT_RING", Equipment.COMMON); // the same slot: the Frost Band is not replaced by a worse one
        Enemy g = u.addEnemy("ZOMBIE", 900, 0, false);
        g.hp = g.maxHp = 1e9f;
        for (int i = 0; i < 500; i++) u.hurt(g, 1f, 0f, 1f, 0, 0, 0f);
        assertTrue("frost stacks from the band", g.frost > 0 || g.freezeT > 0 || g.slow < 1f);
    }

    @Test
    public void damageTakenDodgeCooldownAndKnockbackAreApplied() throws Exception {
        Sim s = sim();
        s.giveEquipment("RIOT_SHIELD", Equipment.RARE);
        float hp = s.hp;
        s.hurtHero(10f, 0.5f, false);
        assertEquals(10f * (1f - 0.096f), hp - s.hp, 1e-3f);
        // floor damage (slag, clouds, lanes) is cut too
        hp = s.hp;
        s.areaDamage(10f);
        assertEquals(10f * (1f - 0.096f), hp - s.hp, 1e-3f);

        Sim q = sim();
        q.giveEquipment("QUICK_SOLES", Equipment.RARE);
        Input in = new Input();
        in.dodgeReq = true;
        in.stickX = 1f;
        q.update(DT, in);
        assertEquals("4 s less 24%", 4f * 0.76f, q.dodgeCdMax, 1e-3f);

        Sim k = sim();
        float x0 = k.px;
        k.shoveHero(1f, 0f, 60f);
        assertEquals(60f, k.px - x0, 1e-3f);
        Sim k2 = sim();
        k2.giveEquipment("ARMORED_GREAVES", Equipment.RARE); // knockback taken -24%
        k2.shoveHero(1f, 0f, 60f);
        assertEquals(60f * 0.76f, k2.px - 0f, 1e-3f);
    }

    @Test
    public void mainDamageCritAndMainSizeReachTheWeapons() throws Exception {
        GameData d = d();
        Sim a = new Sim(d, d.stages.get("FLATS"), "WHIP", new HashMap<String, Double>(), "BASTION", 5);
        float base = a.main.dmg, whipCrit = a.weapons[0].critChance;
        Sim b = new Sim(d, d.stages.get("FLATS"), "WHIP", new HashMap<String, Double>(), "BASTION", 5);
        b.giveEquipment("HYDRAULIC_KNUCKLES", Equipment.RARE);
        assertEquals("+19.2% main weapon damage", base * 1.192f, b.main.dmg, base * 1e-4f);
        assertEquals("only the main weapon", a.weapons[0].dmg, b.weapons[0].dmg, 1e-4f);
        Sim c = new Sim(d, d.stages.get("FLATS"), "WHIP", new HashMap<String, Double>(), "BASTION", 5);
        c.giveEquipment("TARGETING_VISOR", Equipment.RARE);
        assertEquals("crit chance on the auto weapons as well", whipCrit + 0.096f, c.weapons[0].critChance, 1e-4f);
        assertEquals(a.main.critChance + 0.096f, c.main.critChance, 1e-3f);
        Sim e = new Sim(d, d.stages.get("FLATS"), "WHIP", new HashMap<String, Double>(), "BASTION", 5);
        e.giveEquipment("CROWN_OF_THE_HIVE", Equipment.UNIQUE);
        assertEquals("+1 amount", a.weapons[0].amount + 1, e.weapons[0].amount);
        Sim f = new Sim(d, d.stages.get("FLATS"), "WHIP", new HashMap<String, Double>(), "BASTION", 5);
        f.giveEquipment("PLATED_VEST", Equipment.RARE);
        assertEquals("max hp +24%", a.maxHp * 1.24f, f.maxHp, 0.01f);
    }

    @Test
    public void burnImmunityAshTrailAndSporeHealingWork() throws Exception {
        Sim s = sim();
        s.giveEquipment("ASHEN_HEARTWOOD", Equipment.UNIQUE);
        s.ai.addHazard(Entities.HZ_SLAG, s.px, s.py, 50f, 3f, 8f, 0f);
        float hp = s.hp;
        s.hp = hp - 1; // so a heal would show
        s.update(DT, new Input());
        for (int i = 0; i < 60; i++) s.update(DT, new Input());
        assertEquals("no Burn, no slag damage", 0f, s.heroBurnT, 0f);
        assertTrue("hp did not drop below " + (hp - 1) + ": " + s.hp, s.hp >= hp - 1f - 1e-3f);

        Sim t = sim();
        t.giveEquipment("ASHWALKER_TREADS", Equipment.UNIQUE);
        Enemy e = t.addEnemy("ZOMBIE", 300, 0, false);
        e.speed = 0f;
        Input in = new Input();
        in.stickX = 1f;
        for (int i = 0; i < 60 * 4; i++) {
            t.hp = t.maxHp;
            t.update(DT, in);
        }
        // a patch every 50 units, each lasting 1.6 s: the last second and a half of the walk is still on the ground
        assertTrue("ash patches: " + t.hazN, t.hazN >= 3 && t.hazN <= 8);
        // an enemy standing in the ash moves at 80%
        Enemy w = t.addEnemy("ZOMBIE", 0, 0, false);
        Entities.Hazard ash = null;
        for (int i = 0; i < t.hazN; i++) if (t.hazards[i].kind == Entities.HZ_ASH) ash = t.hazards[i];
        assertNotNull(ash);
        w.x = ash.x;
        w.y = ash.y;
        t.px = ash.x + 400;
        t.py = ash.y;
        t.rebuildGridForTest();
        for (int i = 0; i < 12; i++) {
            ash.life = 3f;
            t.update(DT, new Input());
        }
        assertTrue("slowed by the ash", w.ashLeft > 0f);

        Sim h = sim();
        h.giveEquipment("SEED_OF_ACCORD", Equipment.UNIQUE);
        h.ai.addHazard(Entities.HZ_CLOUD, h.px, h.py, 90f, 5f, 4f, 0f);
        h.hp = 10f;
        for (int i = 0; i < 120; i++) h.update(DT, new Input());
        assertTrue("the spores heal: " + h.hp, h.hp > 10f + 4f);
        assertEquals("and give no Decay", 0f, h.heroDecayT, 0f);
    }

    // ------------------------------------------------------------------ pickup, auto-equip, choice, salvage

    @Test
    public void anEmptySlotAutoEquipsWithAToastAndNoPause() throws Exception {
        Sim s = sim();
        int gold = s.gold;
        s.giveEquipment("COMBAT_HELM", Equipment.UNCOMMON);
        assertEquals("equipped", "COMBAT_HELM", s.equip.def[EquipDef.HEAD].key);
        assertEquals(Equipment.UNCOMMON, s.equip.rar[EquipDef.HEAD]);
        assertEquals(0, s.equipN);
        assertEquals(gold, s.gold);
        assertEquals(1.6, s.stats.armor, 1e-9);
        assertEquals("EQUIPPED  Uncommon Combat Helm", s.toastText[Sim.MAX_TOASTS - 1]);
        assertTrue(s.toastT[Sim.MAX_TOASTS - 1] > 3f);
        assertEquals(1, s.sound.emitted[SoundEvents.EQUIP_PICK]);
    }

    @Test
    public void aBetterItemInAnOccupiedSlotWaitsForAChoice() throws Exception {
        Sim s = sim();
        s.giveEquipment("COMBAT_HELM", Equipment.COMMON);
        s.giveEquipment("HEADLAMP", Equipment.RARE); // the same slot, higher value
        assertEquals(1, s.equipN);
        assertEquals("the old one is still worn until you answer", "COMBAT_HELM", s.equip.def[EquipDef.HEAD].key);
        assertEquals("HEADLAMP", s.equipQueuedDef().key);
        assertEquals(Equipment.RARE, s.equipQueuedRar());
        int gold = s.gold;
        s.resolveEquip(true); // Replace
        assertEquals(0, s.equipN);
        assertEquals("HEADLAMP", s.equip.def[EquipDef.HEAD].key);
        assertEquals("the old item is salvaged: Common 1.0 x 5", gold + 5, s.gold);
        assertEquals(1, s.sound.emitted[SoundEvents.EQUIP_SWAP]);

        s.giveEquipment("TARGETING_VISOR", Equipment.RARE); // not better than a Rare: salvaged at once
        assertEquals(0, s.equipN);
        s.giveEquipment("PLATED_VEST", Equipment.COMMON);
        s.giveEquipment("RIOT_SHIELD", Equipment.UNCOMMON); // better: a choice
        assertEquals(1, s.equipN);
        gold = s.gold;
        s.resolveEquip(false); // Keep: the new one is salvaged (Uncommon 1.6 x 5 = 8)
        assertEquals("PLATED_VEST", s.equip.def[EquipDef.BODY].key);
        assertEquals(gold + 8, s.gold);
    }

    @Test
    public void aWorseOrEqualItemIsSalvagedForValueTimesFiveWithoutAnyPause() throws Exception {
        GameData d = d();
        assertEquals(5, Equipment.salvage(d, Equipment.COMMON));
        assertEquals(8, Equipment.salvage(d, Equipment.UNCOMMON));
        assertEquals(12, Equipment.salvage(d, Equipment.RARE));
        assertEquals(15, Equipment.salvage(d, Equipment.UNIQUE));
        Sim s = sim();
        s.giveEquipment("MAG_BOOTS", Equipment.UNCOMMON);
        int gold = s.gold;
        s.giveEquipment("QUICK_SOLES", Equipment.COMMON); // lower
        assertEquals(gold + 5, s.gold);
        s.giveEquipment("ARMORED_GREAVES", Equipment.UNCOMMON); // equal
        assertEquals(gold + 5 + 8, s.gold);
        assertEquals("never a choice for these", 0, s.equipN);
        assertEquals("MAG_BOOTS", s.equip.def[EquipDef.FEET].key);
        assertTrue(s.toastText[Sim.MAX_TOASTS - 1].startsWith("SALVAGED"));
    }

    @Test
    public void aUniqueReplacesCommonAndUncommonByItselfButAsksAgainstARare() throws Exception {
        Sim s = sim();
        s.giveEquipment("COMBAT_HELM", Equipment.UNCOMMON);
        int gold = s.gold;
        s.giveEquipment("CROWN_OF_THE_HIVE", Equipment.UNIQUE);
        assertEquals(0, s.equipN);
        assertEquals("CROWN_OF_THE_HIVE", s.equip.def[EquipDef.HEAD].key);
        assertEquals("the Uncommon helm was salvaged", gold + 8, s.gold);
        Sim t = sim();
        t.giveEquipment("COMBAT_HELM", Equipment.RARE);
        t.giveEquipment("CROWN_OF_THE_HIVE", Equipment.UNIQUE);
        assertEquals("a Rare is not replaced without asking", 1, t.equipN);
        assertEquals("COMBAT_HELM", t.equip.def[EquipDef.HEAD].key);
    }

    @Test
    public void severalChoicesQueueAndAnOlderOneThatBecameWorseIsSalvaged() throws Exception {
        Sim s = sim();
        s.giveEquipment("MAG_BOOTS", Equipment.COMMON);
        s.giveEquipment("QUICK_SOLES", Equipment.UNCOMMON);
        s.giveEquipment("ARMORED_GREAVES", Equipment.RARE);
        assertEquals(2, s.equipN);
        s.resolveEquip(true); // the Uncommon boots
        assertEquals("the queued Rare is still better: it asks", 1, s.equipN);
        assertEquals("ARMORED_GREAVES", s.equipQueuedDef().key);
        s.resolveEquip(true);
        assertEquals(0, s.equipN);
        assertEquals("ARMORED_GREAVES", s.equip.def[EquipDef.FEET].key);
        // the reverse: the better one first settles the worse one behind it
        Sim t = sim();
        t.giveEquipment("MAG_BOOTS", Equipment.COMMON);
        t.giveEquipment("QUICK_SOLES", Equipment.RARE);
        t.giveEquipment("ARMORED_GREAVES", Equipment.UNCOMMON);
        assertEquals(2, t.equipN);
        t.resolveEquip(true);
        assertEquals("the Uncommon behind a worn Rare is salvaged unasked", 0, t.equipN);
    }

    @Test
    public void aCratePickedUpOnTheGroundEquipsOrAsksThroughTheEngineAndNeverPausesOtherwise() throws Exception {
        GameData d = d();
        Engine e = Engine.get();
        MetaProgress fresh = new MetaProgress(d, new MetaProgressTest.MemStore());
        e.init(d, fresh);
        e.meta = fresh;
        e.input.clearMovement();
        e.phase = Engine.PH_MENU;
        e.focus = Engine.MENU_START;
        e.selectStage("FLATS");
        e.nextRunSeed = 1L; // deterministic run
        e.input.post(Input.CMD_START, 0, 0, 0);
        e.advance(DT);
        assertEquals(Engine.PH_PLAYING, e.phase);
        Sim s = e.sim;
        s.noSpawns = true;
        s.enemyN = 0;
        s.rng.setSeed(3);
        EquipDef helm = d.equipment.get("COMBAT_HELM"), lamp = d.equipment.get("HEADLAMP"), visor = d.equipment.get("TARGETING_VISOR");
        // 1. an empty slot: auto-equip, still playing
        s.addPickup(Entities.K_EQUIP, s.px, s.py, helm.index * 4 + Equipment.COMMON);
        e.advance(DT);
        assertEquals(Engine.PH_PLAYING, e.phase);
        assertEquals(helm, s.equip.def[EquipDef.HEAD]);
        // 2. a worse one: salvaged, still playing
        int gold = s.gold;
        s.addPickup(Entities.K_EQUIP, s.px, s.py, visor.index * 4 + Equipment.COMMON);
        e.advance(DT);
        assertEquals(Engine.PH_PLAYING, e.phase);
        assertEquals(gold + 5, s.gold);
        // 3. a better one: the choice screen, the run is paused
        s.addPickup(Entities.K_EQUIP, s.px, s.py, lamp.index * 4 + Equipment.RARE);
        e.advance(DT);
        assertEquals(Engine.PH_EQUIP, e.phase);
        assertEquals(lamp, e.equipNew);
        assertEquals(helm, e.equipOld);
        assertEquals("Replace starts selected", 1, e.focus);
        assertTrue("stat lines for both sides", e.equipNewLines.length > 0 && e.equipOldLines.length > 0 && e.equipDiff.length > 0);
        double t0 = s.time;
        for (int i = 0; i < 30; i++) e.advance(DT);
        assertEquals("paused: no time passes", t0, s.time, 0.0);
        // left / right moves between the cards, B keeps
        e.input.post(Input.CMD_NAV, Input.LEFT, 0, 0);
        e.advance(DT);
        assertEquals(0, e.focus);
        e.input.post(Input.CMD_NAV, Input.RIGHT, 0, 0);
        e.advance(DT);
        assertEquals(1, e.focus);
        e.input.post(Input.CMD_BACK, 0, 0, 0);
        e.advance(DT);
        assertEquals("B = keep: back to the run", Engine.PH_PLAYING, e.phase);
        assertEquals("the old helm stays", helm, s.equip.def[EquipDef.HEAD]);
        // 4. again, and A on Replace
        s.addPickup(Entities.K_EQUIP, s.px, s.py, lamp.index * 4 + Equipment.RARE);
        e.advance(DT);
        assertEquals(Engine.PH_EQUIP, e.phase);
        e.input.post(Input.CMD_CONFIRM, 0, 0, 0);
        e.advance(DT);
        assertEquals(Engine.PH_PLAYING, e.phase);
        assertEquals(lamp, s.equip.def[EquipDef.HEAD]);
        assertEquals(Equipment.RARE, s.equip.rar[EquipDef.HEAD]);
        // 5. a tap on the Keep card
        s.addPickup(Entities.K_EQUIP, s.px, s.py, d.equipment.get("COMBAT_HELM").index * 4 + Equipment.RARE);
        s.giveEquipment("PLATED_VEST", Equipment.COMMON);
        s.addPickup(Entities.K_EQUIP, s.px, s.py, d.equipment.get("RIOT_SHIELD").index * 4 + Equipment.RARE);
        e.advance(DT);
        assertEquals("the Rare helm equal to the worn Rare lamp: salvaged; the shield asks", Engine.PH_EQUIP, e.phase);
        e.input.post(Input.CMD_TAP, Engine.PH_EQUIP, 0, 0);
        e.advance(DT);
        assertEquals(Engine.PH_PLAYING, e.phase);
        assertEquals("PLATED_VEST", s.equip.def[EquipDef.BODY].key);
    }

    @Test
    public void theRunEndsWithNoEquipmentLeftForTheNextRun() throws Exception {
        GameData d = d();
        MetaProgress meta = new MetaProgress(d, new MetaProgressTest.MemStore());
        Sim a = new Sim(d, d.stages.get("FLATS"), null, meta.bonuses(), null, 1);
        a.giveEquipment("COMBAT_HELM", Equipment.RARE);
        assertEquals(1, a.equip.count());
        Sim b = new Sim(d, d.stages.get("FLATS"), null, meta.bonuses(), null, 1);
        assertEquals("equipment is run-only", 0, b.equip.count());
        assertEquals(1.0, b.stats.lightRadius, 0);
        assertFalse("nothing of it in the save", meta.bonuses().containsKey("armor"));
    }

    // ------------------------------------------------------------------ the rarity roll and the unique drops

    @Test
    public void theRarityRollStartsAt60_32_8AndShiftsToRareByMinute() throws Exception {
        Sim s = sim();
        s.time = 3 * 60;
        int[] n = new int[3];
        for (int i = 0; i < 20000; i++) n[s.rollRarity()]++;
        assertEquals("common at minute 3", 0.60, n[0] / 20000.0, 0.02);
        assertEquals("uncommon", 0.32, n[1] / 20000.0, 0.02);
        assertEquals("rare", 0.08, n[2] / 20000.0, 0.012);
        s.time = 27 * 60; // 24 minutes later: 28.8 points moved from Common to Rare
        n = new int[3];
        for (int i = 0; i < 20000; i++) n[s.rollRarity()]++;
        assertEquals(0.312, n[0] / 20000.0, 0.02);
        assertEquals(0.368, n[2] / 20000.0, 0.02);
        Map<String, Double> lucky = new HashMap<>();
        lucky.put("luck", 0.5);
        Sim l = sim(null, lucky);
        l.time = 3 * 60;
        n = new int[3];
        for (int i = 0; i < 20000; i++) n[l.rollRarity()]++;
        assertTrue("luck adds to the Rare roll: " + n[2], n[2] / 20000.0 > 0.15);
    }

    private Entities.Pickup crate(Sim s) {
        for (int i = 0; i < s.pickN; i++) if (s.picks[i].kind == Entities.K_EQUIP) return s.picks[i];
        return null;
    }

    @Test
    public void everyNamedBossDropsItsUnique() throws Exception {
        GameData d = d();
        String[][] table = {{"CARGO_LOADER", "FIST_OF_KHAROS"}, {"SLAGBORN", "ASHEN_HEARTWOOD"},
                {"VIRE_AWAKENED", "CROWN_OF_THE_HIVE"}, {"SMELTER_FOREMAN", "ASHWALKER_TREADS"}, {"THE_FIRST", "HEART_OF_LUMEN"}};
        for (String[] row : table) {
            Sim s = sim();
            Enemy b = s.spawnAt(row[0], s.px + 200, s.py, true);
            assertNotNull(row[0], b);
            s.killNow(b);
            s.update(DT, new Input());
            Entities.Pickup c = crate(s);
            assertNotNull(row[0] + " drops a crate", c);
            int code = (int) (c.value + 0.5f);
            assertEquals(row[1], d.equipList.get(code >> 2).key);
            assertEquals(Equipment.UNIQUE, code & 3);
            assertEquals(1, s.sound.emitted[SoundEvents.EQUIP_DROP]);
        }
        // a boss that already wore its unique drops no second one
        Sim s = sim();
        s.giveEquipment("FIST_OF_KHAROS", Equipment.UNIQUE);
        Enemy b = s.spawnAt("CARGO_LOADER", s.px + 200, s.py, true);
        s.killNow(b);
        s.update(DT, new Input());
        assertNull(crate(s));
    }

    @Test
    public void aTentacleKilledInAHazardBurstCanDropTheSeedOfAccordOnce() throws Exception {
        GameData d = d();
        Sim s = sim();
        for (int i = 0; i < 80; i++) {
            s.tentacleWaveForTest(1, 300, true);
            Enemy t = s.enemies[s.enemyN - 1];
            t.dormant = false; // up
            s.killNow(t);
            s.update(DT, new Input()); // the crate lands on the hero and is picked up at once
            s.pickN = 0;
        }
        assertEquals("one Seed per run", 1, s.sound.emitted[SoundEvents.EQUIP_DROP]);
        assertEquals("SEED_OF_ACCORD", s.equip.def[EquipDef.RING].key);
        assertEquals(Equipment.UNIQUE, s.equip.rar[EquipDef.RING]);
        // a tentacle of a boss (not the hazard) never drops it
        Sim t = sim();
        for (int i = 0; i < 80; i++) {
            t.tentacleWaveForTest(1, 300, false);
            Enemy x = t.enemies[t.enemyN - 1];
            t.killNow(x);
            t.update(DT, new Input());
            assertNull(crate(t));
            t.pickN = 0;
        }
    }
}
