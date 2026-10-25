package se.felixarvid.thorsurvivors.data;

import java.util.HashMap;
import java.util.Map;

public final class EnemyDef {
    public final String key;
    public final String name;
    public final double maxHp;
    public final double speed;
    public final double power;
    public final double knockback;
    public final double xp;
    public final int level;
    public final double scale;
    public final double alpha;
    public final boolean hpTimesLevel;
    /**
     * Ashfall roster (ashfall_data.json "enemies", design section 4): behaviour archetype ({@code ARCH_*}, 0 for the
     * Vampire Survivors enemies), the baked model it is drawn with ("" = derived from the key), per-archetype numbers
     * and whether it is a boss (HP is then final, not multiplied by the boss factor).
     */
    public final int archetype;
    public final String sprite;
    public final Map<String, Double> params;
    public final boolean ashfallBoss;

    public static final int ARCH_CHASER = 0, ARCH_PACK = 1, ARCH_RANGED = 2, ARCH_FLIER = 3, ARCH_CHARGER = 4,
            ARCH_EXPLODER = 5, ARCH_TANK = 6, ARCH_SUMMONER = 7, ARCH_BOSS = 8, ARCH_TENTACLE = 9;
    public static final String[] ARCH_NAMES = {"CHASER", "FAST_PACK", "RANGED", "FLIER", "CHARGER", "EXPLODER", "TANK",
            "SUMMONER", "BOSS", "TENTACLE"};

    public static int archOf(String name) {
        for (int i = 0; i < ARCH_NAMES.length; i++) if (ARCH_NAMES[i].equals(name)) return i;
        return ARCH_CHASER;
    }

    public EnemyDef(String key, String name, double maxHp, double speed, double power, double knockback,
                    double xp, int level, double scale, double alpha, boolean hpTimesLevel) {
        this(key, name, maxHp, speed, power, knockback, xp, level, scale, alpha, hpTimesLevel, ARCH_CHASER, "",
                new HashMap<String, Double>(), false);
    }

    public EnemyDef(String key, String name, double maxHp, double speed, double power, double knockback,
                    double xp, int level, double scale, double alpha, boolean hpTimesLevel, int archetype,
                    String sprite, Map<String, Double> params, boolean ashfallBoss) {
        this.key = key;
        this.name = name;
        this.maxHp = maxHp;
        this.speed = speed;
        this.power = power;
        this.knockback = knockback;
        this.xp = xp;
        this.level = level;
        this.scale = scale;
        this.alpha = alpha;
        this.hpTimesLevel = hpTimesLevel;
        this.archetype = archetype;
        this.sprite = sprite;
        this.params = params;
        this.ashfallBoss = ashfallBoss;
    }

    /** A per-archetype number from the data, or {@code d} when the enemy has none. */
    public float param(String k, float d) {
        Double v = params.get(k);
        return v == null ? d : v.floatValue();
    }
}
