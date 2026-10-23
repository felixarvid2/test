package se.felixarvid.thorsurvivors.game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import se.felixarvid.thorsurvivors.TestData;
import se.felixarvid.thorsurvivors.data.GameData;

import java.util.HashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;

public class InventoryTest {
    @Test
    public void slotLimitsAreEnforced() throws Exception {
        GameData d = TestData.load();
        Inventory inv = new Inventory();
        String[] w = {"WHIP", "MAGIC_MISSILE", "KNIFE", "AXE", "CROSS", "HOLYBOOK", "FIREBALL"};
        for (int i = 0; i < w.length; i++) assertEquals(i < 6, inv.add(d.weapons.get(w[i])));
        assertEquals(6, inv.weaponCount);
        assertFalse(inv.add(d.weapons.get("WHIP"))); // duplicates rejected
        String[] p = {"POWER", "ARMOR", "MAXHEALTH", "REGEN", "COOLDOWN", "AREA", "SPEED"};
        for (int i = 0; i < p.length; i++) assertEquals(i < 6, inv.add(d.weapons.get(p[i])));
        assertEquals(6, inv.passiveCount);
    }

    @Test
    public void levelUpStopsAtMax() throws Exception {
        GameData d = TestData.load();
        Inventory inv = new Inventory();
        inv.add(d.weapons.get("WHIP"));
        for (int i = 2; i <= 8; i++) assertEquals(i, inv.levelUp("WHIP"));
        assertEquals(0, inv.levelUp("WHIP"));
        assertEquals(8, inv.weaponLevel("WHIP"));
    }

    @Test
    public void offersNeverContainEvolutionsAndRespectSlots() throws Exception {
        GameData d = TestData.load();
        Inventory inv = new Inventory();
        inv.add(d.weapons.get("WHIP"));
        Random rng = new Random(1);
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 300; i++) {
            for (Offer o : OfferGenerator.generate(inv, d.weapons.values(), 0.2, rng)) {
                assertFalse(o.def.evolution);
                seen.add(o.def.key);
            }
        }
        assertFalse(seen.contains("VAMPIRICA"));
        assertTrue(seen.contains("POWER"));

        // full weapon slots: no *new* weapons are offered, only owned ones or passives
        String[] w = {"MAGIC_MISSILE", "KNIFE", "AXE", "CROSS", "HOLYBOOK"};
        for (String k : w) inv.add(d.weapons.get(k));
        assertEquals(6, inv.weaponCount);
        for (Offer o : OfferGenerator.candidates(inv, d.weapons.values())) {
            if (!o.def.powerUp) assertEquals(Offer.WEAPON_LEVEL, o.kind);
        }
    }

    @Test
    public void offerCountIsThreeOrFourWithLuck() throws Exception {
        GameData d = TestData.load();
        Inventory inv = new Inventory();
        inv.add(d.weapons.get("WHIP"));
        Random rng = new Random(7);
        int fours = 0;
        for (int i = 0; i < 200; i++) {
            assertEquals(3, OfferGenerator.generate(inv, d.weapons.values(), 0, rng).size());
            if (OfferGenerator.generate(inv, d.weapons.values(), 0.75, rng).size() == 4) fours++;
        }
        assertTrue(fours > 100 && fours < 190);
    }

    @Test
    public void offersAreUniqueAndFallBackWhenNothingLeft() throws Exception {
        GameData d = TestData.load();
        Inventory inv = new Inventory();
        Random rng = new Random(3);
        List<Offer> o = OfferGenerator.generate(inv, d.weapons.values(), 0.75, rng);
        Set<String> keys = new HashSet<>();
        for (Offer x : o) assertTrue(keys.add(x.def.key));
        // max out everything owned with all slots full -> only heal / gold remain
        String[] all = {"WHIP", "MAGIC_MISSILE", "KNIFE", "AXE", "CROSS", "HOLYBOOK",
                "POWER", "ARMOR", "MAXHEALTH", "REGEN", "COOLDOWN", "AREA"};
        for (String k : all) {
            inv.add(d.weapons.get(k));
            while (inv.levelUp(k) > 0) { /* max */ }
        }
        List<Offer> fb = OfferGenerator.generate(inv, d.weapons.values(), 0, rng);
        assertEquals(2, fb.size());
        assertEquals(Offer.HEAL, fb.get(0).kind);
    }

    @Test
    public void evolutionNeedsMaxLevelAndSynergyPassive() throws Exception {
        GameData d = TestData.load();
        Inventory inv = new Inventory();
        inv.add(d.weapons.get("WHIP"));
        assertFalse(inv.canEvolve(0, d.weapons)); // level 1
        while (inv.levelUp("WHIP") > 0) { /* to max */ }
        assertFalse(inv.canEvolve(0, d.weapons)); // no passive yet
        inv.add(d.weapons.get("ARMOR"));
        assertFalse(inv.canEvolve(0, d.weapons)); // wrong passive
        inv.add(d.weapons.get("MAXHEALTH"));
        assertTrue(inv.canEvolve(0, d.weapons));
        assertEquals(0, inv.firstEvolvable(d.weapons));
        assertNotNull(inv.evolve(0, d.weapons));
        assertEquals("VAMPIRICA", inv.weapons[0].def.key);
        assertEquals(1, inv.weaponCount); // replaced, not added
        assertFalse(inv.canEvolve(0, d.weapons)); // already evolved
        assertNull(inv.evolve(0, d.weapons));
    }

    @Test
    public void everyBaseWeaponHasAnEvolutionInData() throws Exception {
        GameData d = TestData.load();
        for (String k : new String[]{"WHIP", "MAGIC_MISSILE", "KNIFE", "AXE", "CROSS", "HOLYBOOK", "FIREBALL", "GARLIC", "HOLYWATER", "LIGHTNING"}) {
            String into = d.weapons.get(k).evoInto;
            assertNotNull(k, into);
            assertTrue(k, d.weapons.get(into).evolution);
        }
    }

    @Test
    public void playerStatsAggregatePassivesAndMeta() throws Exception {
        GameData d = TestData.load();
        Inventory inv = new Inventory();
        inv.add(d.weapons.get("POWER"));
        inv.levelUp("POWER"); // 0.2
        inv.add(d.weapons.get("COOLDOWN")); // -0.08
        java.util.Map<String, Double> meta = new java.util.HashMap<>();
        meta.put("power", 0.05);
        PlayerStats ps = PlayerStats.compute(inv, meta, 0.1);
        assertEquals(1.25, ps.might, 1e-9);
        assertEquals(0.92, ps.cooldownMul, 1e-9);
        assertEquals(0.1, ps.luck, 1e-9);
    }

    @Test
    public void xpCurveIncreases() {
        assertEquals(5, Progression.xpToNext(1));
        assertEquals(15, Progression.xpToNext(2));
        for (int l = 2; l < 60; l++) assertTrue(Progression.xpToNext(l + 1) > 0);
    }
}
