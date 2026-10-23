package se.felixarvid.thorsurvivors.data;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import se.felixarvid.thorsurvivors.TestData;

import java.io.File;
import java.nio.file.Files;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

/** The shipped sprite atlas: every frame must lie inside its sheet and every spawnable enemy must be mapped. */
public class AtlasJsonTest {
    private static final String DIR = "src/main/assets/";

    private JSONObject atlas() throws Exception {
        return new JSONObject(new String(Files.readAllBytes(new File(DIR + "sprites/atlas.json").toPath()), "UTF-8"));
    }

    private void checkGroup(JSONObject g, Map<String, int[]> sheets) throws Exception {
        Iterator<String> it = g.keys();
        while (it.hasNext()) {
            String key = it.next();
            JSONObject e = g.getJSONObject(key);
            int[] size = sheets.get(e.getString("sheet"));
            if (size == null) {
                byte[] b = Files.readAllBytes(new File(DIR + e.getString("sheet")).toPath());
                // PNG IHDR: width/height are big-endian ints at offsets 16 and 20
                size = new int[]{((b[16] & 255) << 24) | ((b[17] & 255) << 16) | ((b[18] & 255) << 8) | (b[19] & 255),
                        ((b[20] & 255) << 24) | ((b[21] & 255) << 16) | ((b[22] & 255) << 8) | (b[23] & 255)};
                sheets.put(e.getString("sheet"), size);
            }
            for (String arr : new String[]{"frames", "decor", "ground"}) {
                JSONArray fr = e.optJSONArray(arr);
                if (fr == null) continue;
                for (int i = 0; i < fr.length(); i++) {
                    JSONArray r = fr.getJSONArray(i);
                    assertEquals(key, 16, r.getInt(2));
                    assertEquals(key, 16, r.getInt(3));
                    assertTrue(key, r.getInt(0) >= 0 && r.getInt(0) + 16 <= size[0]);
                    assertTrue(key, r.getInt(1) >= 0 && r.getInt(1) + 16 <= size[1]);
                }
            }
        }
    }

    @Test
    public void framesInsideSheets() throws Exception {
        JSONObject a = atlas();
        Map<String, int[]> sheets = new HashMap<>();
        checkGroup(a.getJSONObject("sprites"), sheets);
        checkGroup(a.getJSONObject("tiles"), sheets);
        assertTrue(a.getJSONObject("tiles").has("tile.FOREST") && a.getJSONObject("tiles").has("tile.LIBRARY"));
    }

    @Test
    public void everyStageEnemyAndBossHasASprite() throws Exception {
        JSONObject sp = atlas().getJSONObject("sprites");
        GameData d = TestData.load();
        for (StageDef st : d.stages.values()) {
            for (WaveRow r : st.rows) {
                for (String k : r.enemies) assertTrue("enemy." + k, sp.has("enemy." + k));
                for (String k : r.bosses) assertTrue("boss." + k, sp.has("boss." + k));
            }
        }
    }
}
