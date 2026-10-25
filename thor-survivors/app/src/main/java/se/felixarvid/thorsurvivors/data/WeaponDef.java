package se.felixarvid.thorsurvivors.data;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * A weapon or passive. Row 0 of the source data is the full level-1 stat block; every later row is a
 * delta that is added to the previous level's stats. The cumulative stat maps are built once here.
 */
public final class WeaponDef {
    public final String key;
    public final String name;
    public final String description;
    public final String evoInto;
    public final List<String> evoSynergy;
    public final boolean powerUp;
    public final boolean evolution;
    public final int rarity;
    private final List<Map<String, Double>> rows;
    private final List<Map<String, Double>> cumulative = new ArrayList<>();

    public WeaponDef(String key, String name, String description, String evoInto, List<String> evoSynergy,
                     boolean powerUp, boolean evolution, int rarity, List<Map<String, Double>> rows) {
        this.key = key;
        this.name = name;
        this.description = description;
        this.evoInto = evoInto;
        this.evoSynergy = evoSynergy == null ? Collections.<String>emptyList() : evoSynergy;
        this.powerUp = powerUp;
        this.evolution = evolution;
        this.rarity = rarity;
        this.rows = rows;
        Map<String, Double> acc = new HashMap<>();
        for (Map<String, Double> row : rows) {
            for (Map.Entry<String, Double> e : row.entrySet()) {
                Double prev = acc.get(e.getKey());
                acc.put(e.getKey(), prev == null ? e.getValue() : prev + e.getValue());
            }
            cumulative.add(Collections.unmodifiableMap(new HashMap<>(acc)));
        }
    }

    /** A copy with another display name and description (the Ashfall overlay); stats and ids are shared. */
    public WeaponDef withText(String newName, String newDescription) {
        return new WeaponDef(key, newName, newDescription, evoInto, evoSynergy, powerUp, evolution, rarity, rows);
    }

    public int maxLevel() {
        return rows.size();
    }

    /** Accumulated stats at a 1-based level (clamped to the valid range). */
    public Map<String, Double> statsAt(int level) {
        int i = Math.max(1, Math.min(level, rows.size())) - 1;
        return cumulative.get(i);
    }

    public double stat(int level, String stat, double fallback) {
        Double v = statsAt(level).get(stat);
        return v == null ? fallback : v;
    }

    /** The delta that leveling up TO this 1-based level applies (level 1 returns the base row). */
    public Map<String, Double> deltaFor(int level) {
        return rows.get(Math.max(1, Math.min(level, rows.size())) - 1);
    }

    public boolean isWeapon() {
        return !powerUp;
    }
}
