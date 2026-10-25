package se.felixarvid.thorsurvivors.data;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import se.felixarvid.thorsurvivors.TestData;
import se.felixarvid.thorsurvivors.game.EnemyType;

import java.io.File;
import java.nio.file.Files;
import java.util.Iterator;

/** The shipped Ashfall manifest and the names overlay: files exist, rectangles fit, every enemy maps to a model. */
public class AshfallAssetsTest {
    private static final String DIR = "src/main/assets/";

    /** Width and height of a WebP file (lossless VP8L or lossy VP8) from its header. */
    private static int[] webpSize(String path) throws Exception {
        byte[] b = Files.readAllBytes(new File(DIR + path).toPath());
        assertEquals("RIFF", new String(b, 0, 4, "US-ASCII"));
        assertEquals("WEBP", new String(b, 8, 4, "US-ASCII"));
        String fourcc = new String(b, 12, 4, "US-ASCII");
        if (fourcc.equals("VP8L")) {
            int bits = (b[21] & 255) | ((b[22] & 255) << 8) | ((b[23] & 255) << 16) | ((b[24] & 255) << 24);
            return new int[]{(bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1};
        }
        if (fourcc.equals("VP8 ")) {
            return new int[]{((b[26] & 255) | ((b[27] & 255) << 8)) & 0x3FFF, ((b[28] & 255) | ((b[29] & 255) << 8)) & 0x3FFF};
        }
        throw new AssertionError("unsupported webp chunk " + fourcc);
    }

    private JSONObject manifest() throws Exception {
        return new JSONObject(new String(Files.readAllBytes(new File(DIR + "ashfall/manifest.json").toPath()), "UTF-8"));
    }

    @Test
    public void framesAndImagesLieInsideTheirSheets() throws Exception {
        JSONObject m = manifest();
        JSONObject models = m.getJSONObject("models");
        Iterator<String> it = models.keys();
        while (it.hasNext()) {
            String name = it.next();
            JSONObject o = models.getJSONObject(name);
            int[] size = webpSize(o.getString("sheet"));
            JSONObject clips = o.getJSONObject("clips");
            Iterator<String> ci = clips.keys();
            while (ci.hasNext()) {
                String cn = ci.next();
                JSONObject c = clips.getJSONObject(cn);
                JSONArray dirs = c.getJSONArray("frames");
                assertEquals(name + "/" + cn + " has 8 directions", 8, dirs.length());
                for (int d = 0; d < 8; d++) {
                    assertEquals(c.getInt("count"), dirs.getJSONArray(d).length());
                    for (int i = 0; i < c.getInt("count"); i++) {
                        JSONArray r = dirs.getJSONArray(d).getJSONArray(i);
                        if (r.getInt(2) == 0) continue;
                        assertTrue(name + "/" + cn, r.getInt(0) + r.getInt(2) <= size[0] && r.getInt(1) + r.getInt(3) <= size[1]);
                    }
                }
            }
        }
        JSONObject images = m.getJSONObject("images");
        it = images.keys();
        while (it.hasNext()) {
            String key = it.next();
            JSONObject o = images.getJSONObject(key);
            int[] size = webpSize(o.getString("sheet"));
            JSONArray r = o.getJSONArray("rect");
            assertTrue(key, r.getInt(0) >= 0 && r.getInt(0) + r.getInt(2) <= size[0] && r.getInt(1) + r.getInt(3) <= size[1]);
        }
        assertTrue(new File(DIR + "ashfall/CREDITS.txt").exists());
    }

    @Test
    public void everyStageEnemyAndBossMapsToABakedModel() throws Exception {
        JSONObject models = manifest().getJSONObject("models");
        GameData d = TestData.load();
        int checked = 0;
        for (StageDef st : d.stages.values()) {
            for (WaveRow r : st.rows) {
                for (String k : r.enemies) {
                    EnemyType t = new EnemyType(d.enemies.get(k));
                    assertTrue(k + " -> " + t.model, models.has(t.model));
                    assertTrue(k + " boss -> " + t.bossModel, models.has(t.bossModel));
                    checked++;
                }
                for (String k : r.bosses) {
                    EnemyType t = new EnemyType(d.enemies.get(k));
                    assertTrue(k + " boss -> " + t.bossModel, models.has(t.bossModel));
                }
            }
        }
        assertTrue(checked > 100);
        assertEquals("infected_colonist", new EnemyType(d.enemies.get("ZOMBIE")).model);
        assertEquals("spore_hound", new EnemyType(d.enemies.get("BAT1")).model);
        assertEquals("sergeant", new EnemyType(d.enemies.get("SKELETON")).model);
        assertEquals("security_drone", new EnemyType(d.enemies.get("GHOST")).model);
        assertEquals("welder", new EnemyType(d.enemies.get("WEREWOLF")).model);
        assertEquals("smelter", new EnemyType(d.enemies.get("MUMMY")).model);
        assertEquals("lumen_tentacle", new EnemyType(d.enemies.get("FLOWER")).model);
        assertEquals("vire", new EnemyType(d.enemies.get("MEDUSA2")).model);
        assertEquals("spore_carrier", new EnemyType(d.enemies.get("XLMANTIS")).model);
    }

    @Test
    public void overlayRenamesButKeepsIdsAndBalance() throws Exception {
        GameData ashfall = TestData.load();
        GameData base = GameData.load(new java.io.FileInputStream(DIR + "game_data.json"));
        assertEquals("Vibro Lash", ashfall.weapons.get("WHIP").name);
        assertEquals("Leech Scythe", ashfall.weapons.get("VAMPIRICA").name);
        assertEquals("Servo Amplifier", ashfall.weapons.get("POWER").name);
        assertEquals("Servo Amplifier", ashfall.powerUps.get("POWER").name);
        assertEquals("Cinder Flats", ashfall.stages.get("FOREST").name);
        assertEquals("Deep Mines", ashfall.stages.get("LIBRARY").name);
        assertEquals(base.weapons.keySet(), ashfall.weapons.keySet());
        for (String k : base.weapons.keySet()) {
            WeaponDef a = ashfall.weapons.get(k), b = base.weapons.get(k);
            assertNotNull(a);
            assertEquals(k, b.maxLevel(), a.maxLevel());
            assertEquals(k, b.statsAt(b.maxLevel()), a.statsAt(a.maxLevel()));
            assertEquals(k, b.evoInto, a.evoInto);
            assertEquals(k, b.evoSynergy, a.evoSynergy);
        }
        String[] ten = {"WHIP", "MAGIC_MISSILE", "KNIFE", "AXE", "CROSS", "HOLYBOOK", "FIREBALL", "GARLIC", "HOLYWATER", "LIGHTNING"};
        for (String k : ten) {
            assertTrue(k, !ashfall.weapons.get(k).name.equals(base.weapons.get(k).name));
            WeaponDef evo = ashfall.weapons.get(ashfall.weapons.get(k).evoInto);
            assertTrue(k + " evolution renamed", !evo.name.equals(base.weapons.get(evo.key).name));
        }
        assertEquals(0.65f, ashfall.lightingOf("FOREST")[0], 1e-6);
        assertEquals(0.78f, ashfall.lightingOf("LIBRARY")[0], 1e-6);
        assertEquals(200f, ashfall.lightingOf("LIBRARY")[1], 1e-6);
    }

    /** Design phases 9 and 10: an icon for each of the 24 items, the four rarity frames and a portrait for every Ashfall boss. */
    @Test
    public void equipmentIconsRarityFramesAndBossPortraitsAreInTheManifest() throws Exception {
        JSONObject images = manifest().getJSONObject("images");
        GameData d = TestData.load();
        assertEquals(24, d.equipList.size());
        for (EquipDef e : d.equipList) assertTrue(e.key + " icon " + e.icon, images.has("icon." + e.icon));
        for (String f : new String[]{"frame_common", "frame_magic", "frame_rare", "frame_unique"}) assertTrue(f, images.has("icon." + f));
        for (EnemyDef e : d.enemies.values()) {
            if (e.ashfallBoss) assertTrue("portrait of " + e.key, images.has("icon.boss_" + e.key));
        }
        assertTrue("the supply chest art of the crates", images.has("prop.supply_chest"));
    }
}
