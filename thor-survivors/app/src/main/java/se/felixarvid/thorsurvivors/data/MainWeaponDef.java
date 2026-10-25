package se.felixarvid.thorsurvivors.data;

import java.util.List;
import java.util.Map;

/**
 * A hero's main weapon (ashfall_data.json "mainWeapons"). {@code power}/{@code interval}/{@code knockback} use the
 * Vampire Survivors units (power 1 = the level-1 whip hit = 10 damage, interval in ms); every other number sits in
 * {@code params}, which branch tiers override by key.
 */
public final class MainWeaponDef {
    public static final int CONE = 0, VOLLEY = 1, BOLT = 2;
    public static final int BRANCHES = 4;

    public final String key, name, description;
    public final int kind;
    public final double power, interval, knockback;
    public final Map<String, Double> params;
    public final List<BranchDef> branches;

    public MainWeaponDef(String key, String name, String description, int kind, double power, double interval,
                         double knockback, Map<String, Double> params, List<BranchDef> branches) {
        this.key = key;
        this.name = name;
        this.description = description;
        this.kind = kind;
        this.power = power;
        this.interval = interval;
        this.knockback = knockback;
        this.params = params;
        this.branches = branches;
    }
}
