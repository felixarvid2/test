package se.felixarvid.thorsurvivors.data;

import java.util.Map;

/**
 * One main-weapon branch (design section 2.2): three tiers, taken in order. A tier's {@code mods} change the main
 * weapon's parameters by key: a plain key replaces the param, a key ending in {@code Add} adds to the param of that name
 * (see {@code game/MainWeapon}).
 */
public final class BranchDef {
    public static final int TIERS = 3;
    /** Hero level a tier becomes available at: tier I from 5, tier II from 15, tier III from 25. */
    public static final int[] TIER_LEVEL = {5, 15, 25};

    public static final class Tier {
        public final String name, description;
        public final Map<String, Double> mods;

        public Tier(String name, String description, Map<String, Double> mods) {
            this.name = name;
            this.description = description;
            this.mods = mods;
        }
    }

    public final String id, name;
    public final Tier[] tiers;

    public BranchDef(String id, String name, Tier[] tiers) {
        this.id = id;
        this.name = name;
        this.tiers = tiers;
    }
}
