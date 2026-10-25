package se.felixarvid.thorsurvivors.game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import se.felixarvid.thorsurvivors.TestData;
import se.felixarvid.thorsurvivors.data.BranchDef;
import se.felixarvid.thorsurvivors.data.GameData;
import se.felixarvid.thorsurvivors.data.MainWeaponDef;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

/** Branch cards (design phase 4): only at hero levels 5, 10, 15, ...; tiers in order; every branch gets picked. */
public class BranchOfferTest {
    private static MainWeaponDef mw(GameData d, String hero) {
        return d.mainWeapons.get(d.heroes.get(hero).main);
    }

    @Test
    public void branchCardsComeExactlyAtMultiplesOfFive() throws Exception {
        GameData d = TestData.load();
        for (String h : GameData.HERO_ORDER) {
            MainWeaponDef m = mw(d, h);
            for (int level = 1; level <= 60; level++) {
                List<Offer> o = OfferGenerator.branchOffers(m, new int[4], level, new Random(level));
                assertEquals(h + " level " + level, level % 5 == 0, !o.isEmpty());
            }
        }
    }

    @Test
    public void branchCardsReplaceTheLastSlotsOfTheOffer() throws Exception {
        GameData d = TestData.load();
        Sim s = new Sim(d, d.stages.get("FOREST"), "WHIP", new HashMap<>(), "BASTION");
        Random rng = new Random(3);
        List<Offer> at5 = OfferGenerator.generate(s.inv, d.weapons.values(), 0, rng, s.main.def, s.main.tier, 5);
        assertEquals(3, at5.size());
        assertEquals(2, countBranches(at5)); // none started: two random branches
        assertEquals(Offer.BRANCH, at5.get(2).kind);
        assertEquals(Offer.BRANCH, at5.get(1).kind);
        for (Offer o : at5) if (o.kind == Offer.BRANCH) assertEquals(1, o.newLevel);
        List<Offer> at6 = OfferGenerator.generate(s.inv, d.weapons.values(), 0, rng, s.main.def, s.main.tier, 6);
        assertEquals(0, countBranches(at6));
        // one branch started: at 10 the other branches' tier I (tier II needs level 15), at 15 its tier II
        s.applyOffer(at5.get(1));
        int started = at5.get(1).branchIdx;
        List<Offer> at10 = OfferGenerator.generate(s.inv, d.weapons.values(), 0, rng, s.main.def, s.main.tier, 10);
        for (Offer o : at10) if (o.kind == Offer.BRANCH) {
            assertEquals(1, o.newLevel);
            assertTrue(o.branchIdx != started);
        }
        List<Offer> at15 = OfferGenerator.generate(s.inv, d.weapons.values(), 0, rng, s.main.def, s.main.tier, 15);
        assertEquals(1, countBranches(at15));
        Offer b = at15.get(at15.size() - 1);
        assertEquals(started, b.branchIdx);
        assertEquals(2, b.newLevel);
        assertNotNull(b.title());
        assertFalse(Describe.offer(b).isEmpty());
    }

    private static int countBranches(List<Offer> l) {
        int n = 0;
        for (Offer o : l) if (o.kind == Offer.BRANCH) n++;
        return n;
    }

    /** 200 random runs per hero: a branch never offers a tier before its predecessor or before its level, and all are picked. */
    @Test
    public void noTierBeforeItsPredecessorAndEveryBranchGetsPicked() throws Exception {
        GameData d = TestData.load();
        for (String h : GameData.HERO_ORDER) {
            MainWeaponDef m = mw(d, h);
            Map<String, Integer> runsPicked = new HashMap<>();
            for (int run = 0; run < 200; run++) {
                Random rng = new Random(run * 31L + h.hashCode());
                int[] tiers = new int[4];
                java.util.Set<String> picked = new java.util.HashSet<>();
                for (int level = 2; level <= 45; level++) {
                    List<Offer> o = OfferGenerator.branchOffers(m, tiers, level, rng);
                    if (o.isEmpty()) continue;
                    assertTrue(level % 5 == 0);
                    for (Offer c : o) {
                        assertEquals("tier in order", tiers[c.branchIdx] + 1, c.newLevel);
                        assertTrue("level gate", level >= BranchDef.TIER_LEVEL[c.newLevel - 1]);
                    }
                    Offer c = o.get(rng.nextInt(o.size()));
                    tiers[c.branchIdx] = c.newLevel;
                    picked.add(c.branch.id);
                }
                for (String id : picked) runsPicked.merge(id, 1, Integer::sum);
            }
            for (BranchDef b : m.branches) {
                int n = runsPicked.containsKey(b.id) ? runsPicked.get(b.id) : 0;
                assertTrue(h + " " + b.id + " picked in " + n + " of 200 runs", n >= 10);
            }
        }
    }

    @Test
    public void appliedBranchCardChangesTheMainWeapon() throws Exception {
        GameData d = TestData.load();
        Sim s = new Sim(d, d.stages.get("FOREST"), null, new HashMap<>(), "BASTION");
        List<Offer> o = OfferGenerator.branchOffers(s.main.def, s.main.tier, 5, new Random(1));
        Offer seismic = null;
        for (Offer c : o) if (c.branch.id.equals("SEISMIC")) seismic = c;
        if (seismic == null) seismic = Offer.branch(s.main.def.branches.get(0), 0, 1);
        s.applyOffer(seismic);
        assertEquals(1, s.main.tier[0]);
        assertEquals(2, s.main.slamEvery());
    }
}
