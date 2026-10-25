package se.felixarvid.thorsurvivors.data;

import java.util.Map;

/**
 * A playable hero (ashfall_data.json "heroes", design section 2): base stats that replace the Vampire Survivors
 * defaults, growth per hero level and the main weapon it starts with.
 */
public final class HeroDef {
    public final String key, name, role, description, main, model;
    /** Base max HP (the VS player has 100), flat armor, HP/s, and a movement multiplier (1 = VS speed). */
    public final double hp, armor, regen, moveSpeed;
    /** Crit chance and multiplier of the main weapon. */
    public final double crit, critMul;
    /** Stat gained per hero level above 1, keyed like {@code PlayerStats} stat names (power, maxHp, critChance, area, ...). */
    public final Map<String, Double> perLevel;

    public HeroDef(String key, String name, String role, String description, String main, String model, double hp,
                   double armor, double regen, double moveSpeed, double crit, double critMul,
                   Map<String, Double> perLevel) {
        this.key = key;
        this.name = name;
        this.role = role;
        this.description = description;
        this.main = main;
        this.model = model;
        this.hp = hp;
        this.armor = armor;
        this.regen = regen;
        this.moveSpeed = moveSpeed;
        this.crit = crit;
        this.critMul = critMul;
        this.perLevel = perLevel;
    }
}
