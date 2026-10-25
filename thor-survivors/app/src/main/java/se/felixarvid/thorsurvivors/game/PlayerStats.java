package se.felixarvid.thorsurvivors.game;

import se.felixarvid.thorsurvivors.data.HeroDef;

import java.util.HashMap;
import java.util.Map;

/** Aggregate of owned passives + shop power-ups (+ run pickups). Cheap to recompute on inventory changes. */
public final class PlayerStats {
    public double might;       // damage multiplier (1 + bonus)
    public double armor;
    public double maxHpMul;    // 1 + bonus
    public double regen;       // HP per second
    public double cooldownMul; // multiplies weapon intervals
    public double areaMul;
    public double speedMul;    // projectile speed
    public double durationMul;
    public int amountBonus;
    public double moveSpeedMul;
    public double magnetMul;   // 1 + bonus
    public double luck;
    public double growthMul;   // xp
    public double greedMul;    // gold
    public double curse;
    public int revivals;
    /** Hero base HP before the max-HP multiplier (VS player: 100). */
    public double baseHp = 100;
    /** Crit chance and multiplier of the main weapon (hero base + per-level growth); 0 and 2 without a hero. */
    public double critChance;
    public double critMul = 2;

    public static PlayerStats compute(Inventory inv, Map<String, Double> meta, double extraLuck) {
        return compute(inv, meta, extraLuck, null, 1);
    }

    /**
     * With a hero: its base HP, armor, regen, move speed and crit replace the VS defaults, and each level above 1 adds
     * the hero's {@code perLevel} stats (design section 2).
     */
    public static PlayerStats compute(Inventory inv, Map<String, Double> meta, double extraLuck, HeroDef hero, int level) {
        Map<String, Double> sum = new HashMap<>(meta);
        if (hero != null) {
            for (Map.Entry<String, Double> e : hero.perLevel.entrySet()) {
                Double p = sum.get(e.getKey());
                double add = e.getValue() * Math.max(0, level - 1);
                sum.put(e.getKey(), p == null ? add : p + add);
            }
        }
        for (int i = 0; i < inv.passiveCount; i++) {
            Inventory.Slot s = inv.passives[i];
            for (Map.Entry<String, Double> e : s.def.statsAt(s.level).entrySet()) {
                Double p = sum.get(e.getKey());
                sum.put(e.getKey(), p == null ? e.getValue() : p + e.getValue());
            }
        }
        PlayerStats p = new PlayerStats();
        p.might = 1 + g(sum, "power");
        p.armor = g(sum, "armor");
        p.maxHpMul = 1 + g(sum, "maxHp");
        p.regen = g(sum, "regen");
        p.cooldownMul = Math.max(0.25, 1 + g(sum, "cooldown"));
        p.areaMul = 1 + g(sum, "area");
        p.speedMul = 1 + g(sum, "speed");
        p.durationMul = 1 + g(sum, "duration");
        p.amountBonus = (int) Math.round(g(sum, "amount"));
        p.moveSpeedMul = 1 + g(sum, "moveSpeed");
        p.magnetMul = 1 + g(sum, "magnet");
        p.luck = g(sum, "luck") + extraLuck;
        p.growthMul = 1 + g(sum, "growth");
        p.greedMul = 1 + g(sum, "greed");
        p.curse = g(sum, "curse");
        p.revivals = (int) Math.round(g(sum, "revivals"));
        p.critChance = g(sum, "critChance");
        if (hero != null) {
            p.baseHp = hero.hp;
            p.armor += hero.armor;
            p.regen += hero.regen;
            p.moveSpeedMul *= hero.moveSpeed;
            p.critChance += hero.crit;
            p.critMul = hero.critMul;
        }
        return p;
    }

    private static double g(Map<String, Double> m, String k) {
        Double v = m.get(k);
        return v == null ? 0 : v;
    }
}
