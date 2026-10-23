package se.felixarvid.thorsurvivors.game;

import se.felixarvid.thorsurvivors.data.WeaponDef;

/** One level-up card. */
public final class Offer {
    public static final int NEW_WEAPON = 0, WEAPON_LEVEL = 1, NEW_PASSIVE = 2, PASSIVE_LEVEL = 3, HEAL = 4, GOLD = 5;

    public final int kind;
    public final WeaponDef def; // null for HEAL / GOLD
    public final int newLevel;

    public Offer(int kind, WeaponDef def, int newLevel) {
        this.kind = kind;
        this.def = def;
        this.newLevel = newLevel;
    }

    public String key() {
        return def == null ? (kind == HEAL ? "ROAST" : "COIN") : def.key;
    }

    public String title() {
        if (def == null) return kind == HEAL ? "Floor Chicken" : "Gold Coins";
        return def.name;
    }
}
