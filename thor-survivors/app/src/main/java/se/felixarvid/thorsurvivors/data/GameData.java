package se.felixarvid.thorsurvivors.data;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import se.felixarvid.thorsurvivors.util.IO;

/** Parsed game_data.json: weapons/passives, stages, enemies, items and shop power-ups. */
public final class GameData {
    /** Shop display order (the JSON object order is not reliable). Hidden/unlock-only entries are left out. */
    public static final String[] SHOP_ORDER = {
            "POWER", "ARMOR", "MAXHEALTH", "REGEN", "COOLDOWN", "AREA", "SPEED", "DURATION",
            "AMOUNT", "MOVESPEED", "MAGNET", "LUCK", "GROWTH", "GREED", "CURSE", "REVIVAL"};
    public static final String[] STAGE_ORDER = {"FOREST", "LIBRARY"};

    public final Map<String, WeaponDef> weapons = new LinkedHashMap<>();
    public final Map<String, StageDef> stages = new LinkedHashMap<>();
    public final Map<String, EnemyDef> enemies = new HashMap<>();
    public final Map<String, ItemDef> items = new HashMap<>();
    public final Map<String, PowerUpDef> powerUps = new LinkedHashMap<>();

    public static GameData load(InputStream in) throws IOException, JSONException {
        return parse(IO.readUtf8(in));
    }

    public static GameData parse(String json) throws JSONException {
        JSONObject root = new JSONObject(json);
        GameData d = new GameData();
        d.parseWeapons(root.getJSONObject("weapons"));
        d.parseStages(root.getJSONObject("stages"));
        d.parseEnemies(root.getJSONObject("enemies"));
        d.parseItems(root.getJSONObject("items"));
        d.parsePowerUps(root.getJSONObject("powerups"));
        return d;
    }

    private static List<Map<String, Double>> numericRows(JSONArray arr) throws JSONException {
        List<Map<String, Double>> rows = new ArrayList<>();
        for (int i = 0; i < arr.length(); i++) {
            JSONObject o = arr.getJSONObject(i);
            Map<String, Double> m = new HashMap<>();
            Iterator<String> it = o.keys();
            while (it.hasNext()) {
                String k = it.next();
                Object v = o.get(k);
                if (v instanceof Number) m.put(k, ((Number) v).doubleValue());
            }
            rows.add(m);
        }
        return rows;
    }

    private static List<String> strings(JSONArray a) {
        List<String> out = new ArrayList<>();
        if (a == null) return out;
        for (int i = 0; i < a.length(); i++) out.add(a.optString(i));
        return out;
    }

    private void parseWeapons(JSONObject o) throws JSONException {
        Iterator<String> it = o.keys();
        while (it.hasNext()) {
            String key = it.next();
            JSONArray arr = o.getJSONArray(key);
            JSONObject r0 = arr.getJSONObject(0);
            List<Map<String, Double>> rows = numericRows(arr);
            rows.get(0).remove("price");
            rows.get(0).remove("level");
            weapons.put(key, new WeaponDef(key, r0.optString("name", key), r0.optString("description", ""),
                    r0.has("evoInto") ? r0.optString("evoInto") : null, strings(r0.optJSONArray("evoSynergy")),
                    r0.optBoolean("isPowerUp", false), r0.optBoolean("isEvolution", false),
                    (int) Math.max(1, r0.optDouble("rarity", 1)), rows));
        }
    }

    private void parseStages(JSONObject o) throws JSONException {
        for (String key : STAGE_ORDER) {
            if (!o.has(key)) continue;
            JSONArray arr = o.getJSONArray(key);
            JSONObject r0 = arr.getJSONObject(0);
            JSONObject mods = r0.optJSONObject("mods");
            if (mods == null) mods = new JSONObject();
            List<WaveRow> rows = new ArrayList<>();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject r = arr.getJSONObject(i);
                rows.add(new WaveRow(r.optInt("minute", i), r.optInt("minimum", 0), r.optInt("frequency", 1000),
                        strings(r.optJSONArray("enemies")).toArray(new String[0]),
                        strings(r.optJSONArray("bosses")).toArray(new String[0])));
            }
            stages.put(key, new StageDef(key, r0.optString("stageName", key), mods.optDouble("TimeLimit", 1800),
                    mods.optDouble("PlayerPxSpeed", 1), mods.optDouble("EnemySpeed", 1),
                    mods.optDouble("EnemyHealthMultiplier", 1), mods.optDouble("GoldMultiplier", 1),
                    mods.optDouble("XPBonus", 1), r0.optInt("startingSpawns", 10),
                    "HORIZONTAL".equals(r0.optString("spawnType")), r0.optString("destructibleType", ""), rows));
        }
    }

    private void parseEnemies(JSONObject o) throws JSONException {
        Iterator<String> it = o.keys();
        while (it.hasNext()) {
            String key = it.next();
            JSONObject e = o.getJSONArray(key).getJSONObject(0);
            enemies.put(key, new EnemyDef(key, e.optString("bName", key), e.optDouble("maxHp", 1),
                    e.optDouble("speed", 100), e.optDouble("power", 5), e.optDouble("knockback", 1),
                    e.optDouble("xp", 1), e.optInt("level", 1), e.optDouble("scale", 1), e.optDouble("alpha", 1),
                    Arrays.asList(strings(e.optJSONArray("skills")).toArray()).contains("HP_x_Level")));
        }
    }

    private void parseItems(JSONObject o) throws JSONException {
        Iterator<String> it = o.keys();
        while (it.hasNext()) {
            String key = it.next();
            JSONObject e = o.getJSONObject(key);
            items.put(key, new ItemDef(key, e.optString("name", key), e.optDouble("rarity", 0), e.optDouble("value", 0)));
        }
    }

    private void parsePowerUps(JSONObject o) throws JSONException {
        for (String key : SHOP_ORDER) {
            if (!o.has(key)) continue;
            JSONArray arr = o.getJSONArray(key);
            JSONObject r0 = arr.getJSONObject(0);
            powerUps.put(key, new PowerUpDef(key, r0.optString("name", key), r0.optString("description", ""),
                    r0.optInt("price", 100), numericRows(arr)));
        }
    }

    /** Base weapons that can be picked as a starting weapon (unlocked in the source data). */
    public List<String> starterWeapons() {
        List<String> out = new ArrayList<>();
        for (String k : new String[]{"WHIP", "MAGIC_MISSILE", "KNIFE", "AXE", "HOLYBOOK", "HOLYWATER"}) {
            if (weapons.containsKey(k)) out.add(k);
        }
        return out;
    }
}
