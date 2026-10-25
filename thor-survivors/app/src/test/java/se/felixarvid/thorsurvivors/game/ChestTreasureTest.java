package se.felixarvid.thorsurvivors.game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import se.felixarvid.thorsurvivors.TestData;
import se.felixarvid.thorsurvivors.data.GameData;
import se.felixarvid.thorsurvivors.data.StageDef;
import se.felixarvid.thorsurvivors.data.Treasure;

import java.util.HashMap;

/** Boss chests follow the stage's treasure table (count roll and prize types). */
public class ChestTreasureTest {
    private GameData d;

    private Sim sim() throws Exception {
        d = TestData.load();
        Sim s = new Sim(d, d.stages.get("FOREST"), "WHIP", new HashMap<String, Double>());
        s.rng.setSeed(11);
        s.inv.add(d.weapons.get("MAGIC_MISSILE"));
        s.inv.add(d.weapons.get("MAXHEALTH"));
        s.inv.add(d.weapons.get("POWER"));
        s.recomputeAll();
        return s;
    }

    private static Treasure table(double c0, double c1, String... types) {
        return new Treasure(new double[]{c0, c1, 100}, 1, types);
    }

    private static String[] any(int n) {
        String[] t = new String[n];
        java.util.Arrays.fill(t, Treasure.EXISTING_ANY);
        return t;
    }

    private int totalLevels(Sim s) {
        int n = 0;
        for (int i = 0; i < s.inv.weaponCount; i++) n += s.inv.weapons[i].level;
        for (int i = 0; i < s.inv.passiveCount; i++) n += s.inv.passives[i].level;
        return n;
    }

    @Test
    public void itemCountFollowsTheChances() throws Exception {
        Sim s = sim();
        int before = totalLevels(s);
        s.pendingChests = 3;
        String[] five = s.openChest(table(100, 0, any(5)));
        assertEquals(5 + 1, five.length); // items + gold line
        String[] three = s.openChest(table(0, 100, any(5)));
        assertEquals(3 + 1, three.length);
        String[] one = s.openChest(table(0, 0, any(5)));
        assertEquals(1 + 1, one.length); // third chance does not gate the single item
        assertEquals(before + 9, totalLevels(s));
        assertTrue(one[one.length - 1].endsWith("gold"));
    }

    @Test
    public void existingWeaponNeverLevelsPassives() throws Exception {
        Sim s = sim();
        int hh = s.inv.passiveLevel("MAXHEALTH"), pw = s.inv.passiveLevel("POWER");
        s.pendingChests = 4;
        for (int i = 0; i < 4; i++) s.openChest(table(100, 0, Treasure.EXISTING_WEAPON, Treasure.EXISTING_WEAPON,
                Treasure.EXISTING_WEAPON, Treasure.EXISTING_WEAPON, Treasure.EXISTING_WEAPON));
        assertEquals(hh, s.inv.passiveLevel("MAXHEALTH"));
        assertEquals(pw, s.inv.passiveLevel("POWER"));
        assertTrue(s.inv.weaponLevel("WHIP") + s.inv.weaponLevel("MAGIC_MISSILE") > 2);
    }

    @Test
    public void evolutionPrizeEvolvesAnEligibleWeapon() throws Exception {
        Sim s = sim();
        while (s.inv.levelUp("WHIP") > 0) { /* to max */ }
        s.pendingChests = 1;
        String[] lines = s.openChest(table(0, 100, Treasure.EVOLUTION, Treasure.EXISTING_ANY, Treasure.EXISTING_ANY));
        assertEquals(0, s.inv.weaponLevel("WHIP"));
        assertEquals("EVOLUTION!", lines[0]);
        assertTrue(lines[1].contains("->"));
        assertEquals(2 + 2 + 1, lines.length); // evolution (2 lines) + 2 upgrades + gold
        assertEquals(1, s.sound.emitted[SoundEvents.EVOLUTION]);
    }

    @Test
    public void evolutionPrizeFallsBackToAnUpgradeWhenNothingIsReady() throws Exception {
        Sim s = sim();
        int before = totalLevels(s);
        s.pendingChests = 1;
        String[] lines = s.openChest(table(0, 0, Treasure.EVOLUTION));
        assertEquals(2, lines.length);
        assertEquals(before + 1, totalLevels(s));
        assertEquals(0, s.sound.emitted[SoundEvents.EVOLUTION]);
    }

    @Test
    public void unknownPrizeTypeActsAsExistingAny() throws Exception {
        Sim s = sim();
        int before = totalLevels(s);
        s.pendingChests = 1;
        s.openChest(table(0, 100, "MYSTERY", "MYSTERY", "MYSTERY"));
        assertEquals(before + 3, totalLevels(s));
    }

    @Test
    public void nothingToLevelGivesOnlyGold() throws Exception {
        Sim s = sim();
        for (int i = 0; i < s.inv.weaponCount; i++) while (s.inv.levelUp(s.inv.weapons[i].def.key) > 0) { }
        for (int i = 0; i < s.inv.passiveCount; i++) while (s.inv.levelUp(s.inv.passives[i].def.key) > 0) { }
        // no evolution partner for MAGIC_MISSILE here (its passive is missing), WHIP has MAXHEALTH: take it out of the way
        s.inv.weapons[0].level = s.inv.weapons[0].def.maxLevel();
        int gold = s.gold;
        s.pendingChests = 1;
        String[] lines = s.openChest(table(100, 0, Treasure.EXISTING_WEAPON, Treasure.EXISTING_ANY, Treasure.EXISTING_ANY,
                Treasure.EXISTING_ANY, Treasure.EXISTING_ANY));
        assertEquals(1, lines.length);
        assertTrue(s.gold > gold);
    }

    @Test
    public void stageTablesAreReadFromTheDataByMinute() throws Exception {
        StageDef f = TestData.load().stages.get("FOREST");
        assertNull("no table before the first one", f.treasureAt(0));
        assertNotNull(f.treasureAt(70));
        assertEquals(Treasure.EVOLUTION, f.treasureAt(11 * 60).prizeAt(0)); // minute 11 uses the minute 10 table
        assertEquals(Treasure.EXISTING_WEAPON, f.treasureAt(6 * 60).prizeAt(0)); // minute 5's
        assertEquals(3.0, f.treasureAt(7 * 60).chances[0], 0);
        assertEquals(Treasure.EXISTING_ANY, f.treasureAt(6 * 60).prizeAt(9)); // past the list
    }

    @Test
    public void seededOpeningIsDeterministic() throws Exception {
        String a = String.join("|", seededOpen());
        String b = String.join("|", seededOpen());
        assertEquals(a, b);
    }

    private String[] seededOpen() throws Exception {
        Sim s = sim();
        s.time = 11 * 60;
        s.pendingChests = 1;
        return s.openChest();
    }
}
