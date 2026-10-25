package se.felixarvid.thorsurvivors.game;

import se.felixarvid.thorsurvivors.data.EquipDef;
import se.felixarvid.thorsurvivors.data.GameData;

import java.util.Locale;
import java.util.Map;
import java.util.TreeSet;

/**
 * What the hero wears this run (design section 6): one item per slot (Head, Body, Gloves, Feet, Ring, Neck) with its
 * rarity. Run-only, nothing is saved. The stats go through {@link PlayerStats#compute} (same keys as the passives plus
 * lightRadius, damageTaken, mainDamage, statusChance_*, dodgeCooldown and knockbackTaken), so no weapon code changes.
 */
public final class Equipment {
    public static final int COMMON = 0, UNCOMMON = 1, RARE = 2, UNIQUE = 3;
    public static final String[] RARITY_NAMES = {"Common", "Uncommon", "Rare", "Unique"};
    /** Frame colours (ARGB) of the rarity frames: grey, blue, gold, orange. */
    public static final int[] RARITY_COLORS = {0xFFB8BCC4, 0xFF4FA8FF, 0xFFFFD84A, 0xFFFF8A2A};

    public final EquipDef[] def = new EquipDef[EquipDef.SLOTS];
    public final int[] rar = new int[EquipDef.SLOTS];

    public void clear() {
        for (int i = 0; i < def.length; i++) {
            def[i] = null;
            rar[i] = 0;
        }
    }

    public int count() {
        int n = 0;
        for (EquipDef d : def) if (d != null) n++;
        return n;
    }

    /** Multiplier of a rarity's stat values: Common 1.0, Uncommon 1.6, Rare 2.4; a unique's values are fixed (1.0). */
    public static double mult(GameData d, int rarity) {
        return rarity >= UNIQUE ? 1.0 : d.equipMult[Math.max(0, rarity)];
    }

    /** Comparison and salvage value of an item: the rarity multiplier, a unique counts as 3.0. */
    public static float value(GameData d, int rarity) {
        return rarity >= UNIQUE ? (float) d.rule("uniqueValue", 3.0) : (float) d.equipMult[Math.max(0, rarity)];
    }

    /** Gold a salvaged item pays: value x 5. */
    public static int salvage(GameData d, int rarity) {
        return Math.round(value(d, rarity) * (float) d.rule("salvage", 5));
    }

    /** Adds the worn items' values to a stat sum (the map PlayerStats builds from the hero, passives and power-ups). */
    void addTo(Map<String, Double> sum, GameData d) {
        for (int i = 0; i < def.length; i++) {
            if (def[i] == null) continue;
            double m = mult(d, rar[i]);
            for (Map.Entry<String, Double> e : def[i].values.entrySet()) {
                Double p = sum.get(e.getKey());
                double v = e.getValue() * m;
                sum.put(e.getKey(), p == null ? v : p + v);
            }
        }
    }

    // ------------------------------------------------------------------ text (UI events only: these allocate)

    /** "Armor +1.0", "Max HP +10%" ... for one stat key and value. */
    public static String statLine(String key, double v) {
        String sign = v >= 0 ? "+" : "-";
        double a = Math.abs(v);
        switch (key) {
            case "armor": return String.format(Locale.ROOT, "Armor %s%.1f", sign, a);
            case "lightRadius": return pct("Light radius", sign, a);
            case "critChance": return String.format(Locale.ROOT, "Crit chance %s%.1f%%", sign, a * 100);
            case "maxHp": return pct("Max HP", sign, a);
            case "damageTaken": return pct("Damage taken", sign, a);
            case "regen": return String.format(Locale.ROOT, "Regen %s%.2f/s", sign, a);
            case "power": return pct("Might", sign, a);
            case "mainDamage": return pct("Main weapon damage", sign, a);
            case "mainSize": return pct("Main weapon size", sign, a);
            case "cooldown": return pct("Cooldown", sign, a);
            case "moveSpeed": return pct("Move speed", sign, a);
            case "knockbackTaken": return pct("Knockback taken", sign, a);
            case "dodgeCooldown": return pct("Dodge cooldown", sign, a);
            case "statusChance_electrify": return String.format(Locale.ROOT, "Electrify chance %s%.1f%%", sign, a * 100);
            case "statusChance_burn": return String.format(Locale.ROOT, "Burn chance %s%.1f%%", sign, a * 100);
            case "statusChance_frost": return String.format(Locale.ROOT, "Frost chance %s%.1f%%", sign, a * 100);
            case "magnet": return pct("Pickup range", sign, a);
            case "growth": return pct("XP gain", sign, a);
            case "luck": return String.format(Locale.ROOT, "Luck %s%.2f", sign, a);
            case "amount": return String.format(Locale.ROOT, "%s%d projectile on all auto weapons", sign, Math.round(a));
            case "enemySpeed": return pct("Enemy speed", sign, a);
            case "revivals": return String.format(Locale.ROOT, "%s%d revival", sign, Math.round(a));
            case "burnImmune": return "Immune to Burn";
            case "ashTrail": return "Leaves an ash trail that slows enemies 20%";
            case "cloudHeal": return "Spore Carrier clouds heal you";
            default: return key + " " + sign + a;
        }
    }

    private static String pct(String what, String sign, double a) {
        double p = a * 100;
        return String.format(Locale.ROOT, p == Math.rint(p) ? "%s %s%.0f%%" : "%s %s%.1f%%", what, sign, p);
    }

    /** True when a positive change of this stat is good for the hero (damage taken, cooldowns and enemy speed are not). */
    public static boolean higherIsBetter(String key) {
        switch (key) {
            case "damageTaken": case "cooldown": case "dodgeCooldown": case "knockbackTaken": case "enemySpeed": return false;
            default: return true;
        }
    }

    /** The stat lines of an item at a rarity. */
    public static String[] lines(GameData d, EquipDef def, int rarity) {
        double m = mult(d, rarity);
        String[] out = new String[def.values.size()];
        int i = 0;
        for (Map.Entry<String, Double> e : def.values.entrySet()) out[i++] = statLine(e.getKey(), e.getValue() * m);
        return out;
    }

    /** The stat keys of an item in the order of {@link #lines} (the panel draws a stat icon in front of each line). */
    public static String[] keys(EquipDef def) {
        return def.values.keySet().toArray(new String[0]);
    }

    /** One stat of {@code to} compared with {@code from} (either may be null): the line and whether it improves the hero. */
    public static final class Diff {
        public final String line, key;
        public final boolean good;

        Diff(String line, String key, boolean good) {
            this.line = line;
            this.key = key;
            this.good = good;
        }
    }

    /** What changes when {@code to} replaces {@code from} (from may be null): one line per stat that differs. */
    public static Diff[] diff(GameData d, EquipDef from, int fromRar, EquipDef to, int toRar) {
        TreeSet<String> keys = new TreeSet<>();
        if (from != null) keys.addAll(from.values.keySet());
        if (to != null) keys.addAll(to.values.keySet());
        Diff[] out = new Diff[keys.size()];
        int n = 0;
        for (String k : keys) {
            double a = from == null || !from.values.containsKey(k) ? 0 : from.values.get(k) * mult(d, fromRar);
            double b = to == null || !to.values.containsKey(k) ? 0 : to.values.get(k) * mult(d, toRar);
            double delta = b - a;
            if (Math.abs(delta) < 1e-9) continue;
            out[n++] = new Diff(statLine(k, delta), k, (delta > 0) == higherIsBetter(k));
        }
        return n == out.length ? out : java.util.Arrays.copyOf(out, n);
    }
}
