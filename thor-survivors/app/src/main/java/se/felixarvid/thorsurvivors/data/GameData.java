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
    /** The stages the menu offers: Cinder Flats and Deep Mines (ashfall_data.json "stages"). */
    public static final String[] STAGE_ORDER = {"FLATS", "MINES"};
    /** The Vampire Survivors stages: still loaded (older tests and balance runs), but not in the menu. */
    public static final String[] LEGACY_STAGES = {"FOREST", "LIBRARY"};
    /** Hero select order (the JSON object order is not reliable). */
    public static final String[] HERO_ORDER = {"BASTION", "SPECTRE", "XENOMANT"};

    public final Map<String, WeaponDef> weapons = new LinkedHashMap<>();
    public final Map<String, StageDef> stages = new LinkedHashMap<>();
    public final Map<String, EnemyDef> enemies = new HashMap<>();
    public final Map<String, ItemDef> items = new HashMap<>();
    public final Map<String, PowerUpDef> powerUps = new LinkedHashMap<>();
    /** Per stage: {ambient darkness 0..1, player light radius in world units} (ashfall_data.json "lighting"). */
    public final Map<String, float[]> lighting = new HashMap<>();
    /** Heroes and their main weapons (ashfall_data.json "heroes", "mainWeapons"); empty without the overlay. */
    public final Map<String, HeroDef> heroes = new LinkedHashMap<>();
    public final Map<String, MainWeaponDef> mainWeapons = new HashMap<>();
    /** Equipment (ashfall_data.json "equipment", design section 6): all items by key, in file order (18 base items then the uniques). */
    public final Map<String, EquipDef> equipment = new LinkedHashMap<>();
    public final List<EquipDef> equipList = new ArrayList<>();
    /** The base items (not unique) and the unique dropped by each boss key (null when none). */
    public final List<EquipDef> baseItems = new ArrayList<>();
    public final Map<String, EquipDef> uniqueBySource = new HashMap<>();
    /** Elite numbers ("elites") and the equipment rules ("equipmentRules": rarity values, salvage, the rarity roll). */
    public final Map<String, Double> elites = new LinkedHashMap<>();
    public final Map<String, Double> equipRules = new LinkedHashMap<>();
    public double[] equipMult = {1.0, 1.6, 2.4};

    public static GameData load(InputStream in) throws IOException, JSONException {
        return parse(IO.readUtf8(in));
    }

    /** Base data plus the Ashfall names overlay (null overlay = base only). */
    public static GameData load(InputStream base, InputStream overlay) throws IOException, JSONException {
        GameData d = parse(IO.readUtf8(base));
        if (overlay != null) d.applyOverlay(IO.readUtf8(overlay));
        return d;
    }

    /**
     * Merges assets/ashfall_data.json by id (design section 13): display names and descriptions of weapons, evolutions
     * and passives, stage names, the lighting parameters, and the heroes with their main weapons and branches.
     * Ids, balance and everything not listed stay untouched.
     */
    public void applyOverlay(String json) throws JSONException {
        JSONObject root = new JSONObject(json);
        JSONObject names = root.optJSONObject("names");
        if (names != null) {
            Iterator<String> it = names.keys();
            while (it.hasNext()) {
                String id = it.next();
                JSONObject o = names.getJSONObject(id);
                WeaponDef w = weapons.get(id);
                if (w != null) weapons.put(id, w.withText(o.optString("name", w.name), o.optString("description", w.description)));
                PowerUpDef p = powerUps.get(id);
                if (p != null) powerUps.put(id, p.withName(o.optString("name", p.name)));
            }
        }
        JSONObject en = root.optJSONObject("enemies");
        if (en != null) {
            Iterator<String> it = en.keys();
            while (it.hasNext()) {
                String key = it.next();
                enemies.put(key, parseAshfallEnemy(key, en.getJSONObject(key)));
            }
        }
        JSONObject st = root.optJSONObject("stages");
        if (st != null) {
            Iterator<String> it = st.keys();
            while (it.hasNext()) { // whole stages (Cinder Flats, Deep Mines) come with their wave rows
                String key = it.next();
                JSONObject o = st.getJSONObject(key);
                if (o.has("rows")) stages.put(key, parseOverlayStage(key, o));
            }
            for (String key : new ArrayList<>(stages.keySet())) {
                JSONObject o = st.optJSONObject(key);
                if (o != null) stages.put(key, stages.get(key).withName(o.optString("name", stages.get(key).name)));
            }
        }
        JSONObject li = root.optJSONObject("lighting");
        if (li != null) {
            Iterator<String> it = li.keys();
            while (it.hasNext()) {
                String key = it.next();
                JSONObject o = li.getJSONObject(key);
                lighting.put(key, new float[]{(float) o.optDouble("ambient", 0.65), (float) o.optDouble("radius", 240)});
            }
        }
        JSONObject mw = root.optJSONObject("mainWeapons");
        if (mw != null) {
            Iterator<String> it = mw.keys();
            while (it.hasNext()) {
                String key = it.next();
                mainWeapons.put(key, parseMainWeapon(key, mw.getJSONObject(key)));
            }
        }
        JSONObject el = root.optJSONObject("elites");
        if (el != null) elites.putAll(numbers(el));
        JSONObject er = root.optJSONObject("equipmentRules");
        if (er != null) {
            equipRules.putAll(numbers(er));
            JSONArray m = er.optJSONArray("mult");
            if (m != null && m.length() >= 3) equipMult = new double[]{m.optDouble(0, 1), m.optDouble(1, 1.6), m.optDouble(2, 2.4)};
        }
        JSONObject eq = root.optJSONObject("equipment");
        if (eq != null) {
            Iterator<String> it = eq.keys();
            while (it.hasNext()) {
                String key = it.next();
                JSONObject o = eq.getJSONObject(key);
                boolean unique = o.optBoolean("unique", false);
                EquipDef d = new EquipDef(key, o.optString("name", key), EquipDef.slotOf(o.optString("slot", "HEAD")),
                        o.optString("icon", ""), unique, o.optString("source", ""), numbers(o.optJSONObject("values")),
                        equipList.size());
                equipment.put(key, d);
                equipList.add(d);
                if (unique) uniqueBySource.put(d.source, d);
                else baseItems.add(d);
            }
        }
        JSONObject he = root.optJSONObject("heroes");
        if (he != null) {
            for (String key : HERO_ORDER) {
                JSONObject o = he.optJSONObject(key);
                if (o != null) heroes.put(key, parseHero(key, o));
            }
        }
    }

    /** Design section 4: stats in the VS units of the ZOMBIE row (hp 1.0 = one Z), archetype and its numbers. */
    private static EnemyDef parseAshfallEnemy(String key, JSONObject o) {
        return new EnemyDef(key, o.optString("name", key), o.optDouble("maxHp", 1), o.optDouble("speed", 100),
                o.optDouble("power", 10), o.optDouble("knockback", 1), o.optDouble("xp", 1), 1, o.optDouble("scale", 1),
                1, false, EnemyDef.archOf(o.optString("archetype", "CHASER")), o.optString("sprite", ""),
                numbers(o.optJSONObject("params")), o.optBoolean("boss", false));
    }

    private static StageDef parseOverlayStage(String key, JSONObject o) throws JSONException {
        JSONObject mods = o.optJSONObject("mods");
        if (mods == null) mods = new JSONObject();
        JSONArray arr = o.getJSONArray("rows");
        List<WaveRow> rows = new ArrayList<>();
        for (int i = 0; i < arr.length(); i++) {
            JSONObject r = arr.getJSONObject(i);
            rows.add(new WaveRow(r.optInt("minute", i), r.optInt("minimum", 0), r.optInt("frequency", 1000),
                    strings(r.optJSONArray("enemies")).toArray(new String[0]),
                    strings(r.optJSONArray("bosses")).toArray(new String[0]), treasure(r.optJSONObject("treasure"))));
        }
        StageDef sd = new StageDef(key, o.optString("name", key), mods.optDouble("TimeLimit", 1800),
                mods.optDouble("PlayerPxSpeed", 1), mods.optDouble("EnemySpeed", 1),
                mods.optDouble("EnemyHealthMultiplier", 1), mods.optDouble("GoldMultiplier", 1),
                mods.optDouble("XPBonus", 1), o.optInt("startingSpawns", 10),
                "HORIZONTAL".equals(o.optString("spawnType")), o.optString("destructibleType", ""), rows);
        JSONObject fade = o.optJSONObject("xpFade");
        if (fade != null) {
            sd.xpFadeFrom = fade.optDouble("from", 0);
            sd.xpFadeTo = fade.optDouble("to", 0);
            sd.xpFadeEnd = fade.optDouble("end", 1);
        }
        JSONObject tn = o.optJSONObject("tentacles");
        if (tn != null) {
            JSONArray mins = tn.optJSONArray("minutes");
            sd.tentacleMinutes = new int[mins == null ? 0 : mins.length()];
            for (int i = 0; i < sd.tentacleMinutes.length; i++) sd.tentacleMinutes[i] = mins.optInt(i);
            sd.tentacleLen = (float) tn.optDouble("length", 20);
            sd.tentacleEvery = (float) tn.optDouble("every", 4);
            sd.tentacleCount = tn.optInt("count", 3);
            sd.tentacleRadius = (float) tn.optDouble("radius", 400);
        }
        return sd;
    }

    private static Map<String, Double> numbers(JSONObject o) {
        Map<String, Double> m = new LinkedHashMap<>();
        if (o == null) return m;
        Iterator<String> it = o.keys();
        while (it.hasNext()) {
            String k = it.next();
            Object v = o.opt(k);
            if (v instanceof Number) m.put(k, ((Number) v).doubleValue());
        }
        return m;
    }

    private static HeroDef parseHero(String key, JSONObject o) {
        return new HeroDef(key, o.optString("name", key), o.optString("role", ""), o.optString("description", ""),
                o.optString("main", ""), o.optString("model", key.toLowerCase(java.util.Locale.ROOT)),
                o.optDouble("hp", 100), o.optDouble("armor", 0), o.optDouble("regen", 0), o.optDouble("moveSpeed", 1),
                o.optDouble("crit", 0), o.optDouble("critMul", 2), numbers(o.optJSONObject("perLevel")));
    }

    private static MainWeaponDef parseMainWeapon(String key, JSONObject o) throws JSONException {
        String kind = o.optString("kind", "CONE");
        int k = "VOLLEY".equals(kind) ? MainWeaponDef.VOLLEY : "BOLT".equals(kind) ? MainWeaponDef.BOLT : MainWeaponDef.CONE;
        List<BranchDef> branches = new ArrayList<>();
        JSONArray bs = o.optJSONArray("branches");
        for (int i = 0; bs != null && i < bs.length(); i++) {
            JSONObject b = bs.getJSONObject(i);
            JSONArray ts = b.getJSONArray("tiers");
            BranchDef.Tier[] tiers = new BranchDef.Tier[ts.length()];
            for (int j = 0; j < tiers.length; j++) {
                JSONObject t = ts.getJSONObject(j);
                tiers[j] = new BranchDef.Tier(t.optString("name", ""), t.optString("desc", ""), numbers(t.optJSONObject("mods")));
            }
            branches.add(new BranchDef(b.getString("id"), b.optString("name", b.getString("id")), tiers));
        }
        return new MainWeaponDef(key, o.optString("name", key), o.optString("description", ""), k, o.optDouble("power", 1),
                o.optDouble("interval", 1000), o.optDouble("knockback", 1), numbers(o.optJSONObject("params")), branches);
    }

    /** Ambient darkness and player light radius of a stage (defaults when the overlay has none). */
    public float[] lightingOf(String stageKey) {
        float[] l = lighting.get(stageKey);
        return l != null ? l : new float[]{0.65f, 240f};
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
        for (String key : LEGACY_STAGES) {
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
                        strings(r.optJSONArray("bosses")).toArray(new String[0]), treasure(r.optJSONObject("treasure"))));
            }
            stages.put(key, new StageDef(key, r0.optString("stageName", key), mods.optDouble("TimeLimit", 1800),
                    mods.optDouble("PlayerPxSpeed", 1), mods.optDouble("EnemySpeed", 1),
                    mods.optDouble("EnemyHealthMultiplier", 1), mods.optDouble("GoldMultiplier", 1),
                    mods.optDouble("XPBonus", 1), r0.optInt("startingSpawns", 10),
                    "HORIZONTAL".equals(r0.optString("spawnType")), r0.optString("destructibleType", ""), rows));
        }
    }

    private static Treasure treasure(JSONObject t) {
        if (t == null) return null;
        JSONArray c = t.optJSONArray("chances");
        double[] chances = {0, 0, 100};
        if (c != null) for (int i = 0; i < 3 && i < c.length(); i++) chances[i] = c.optDouble(i, chances[i]);
        return new Treasure(chances, t.optInt("level", 1), strings(t.optJSONArray("prizeTypes")).toArray(new String[0]));
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

    /** An elite number (ashfall_data.json "elites"), or {@code d} without the overlay. */
    public double elite(String k, double d) {
        Double v = elites.get(k);
        return v == null ? d : v;
    }

    /** An equipment rule number ("equipmentRules"), or {@code d}. */
    public double rule(String k, double d) {
        Double v = equipRules.get(k);
        return v == null ? d : v;
    }

    /** Hero keys in select order that the data actually defines. */
    public List<String> heroKeys() {
        return new ArrayList<>(heroes.keySet());
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
