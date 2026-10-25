package se.felixarvid.thorsurvivors.game;

import se.felixarvid.thorsurvivors.data.BranchDef;
import se.felixarvid.thorsurvivors.data.WeaponDef;

/** One level-up card. */
public final class Offer {
    public static final int NEW_WEAPON = 0, WEAPON_LEVEL = 1, NEW_PASSIVE = 2, PASSIVE_LEVEL = 3, HEAL = 4, GOLD = 5,
            BRANCH = 6;

    public final int kind;
    public final WeaponDef def; // null for HEAL / GOLD / BRANCH
    /** Weapon level, or for BRANCH the tier (1..3) taken. */
    public final int newLevel;
    /** BRANCH only: the branch, its index in the hero's main weapon, and the tier (= newLevel). */
    public final BranchDef branch;
    public final int branchIdx;

    public Offer(int kind, WeaponDef def, int newLevel) {
        this.kind = kind;
        this.def = def;
        this.newLevel = newLevel;
        this.branch = null;
        this.branchIdx = -1;
    }

    private Offer(BranchDef branch, int branchIdx, int tier) {
        this.kind = BRANCH;
        this.def = null;
        this.newLevel = tier;
        this.branch = branch;
        this.branchIdx = branchIdx;
    }

    /** The main-weapon branch card: tier {@code tier} (1..3) of branch number {@code idx}. */
    public static Offer branch(BranchDef b, int idx, int tier) {
        return new Offer(b, idx, tier);
    }

    public String key() {
        if (kind == BRANCH) return branch.id;
        return def == null ? (kind == HEAL ? "ROAST" : "COIN") : def.key;
    }

    public String title() {
        if (kind == BRANCH) return branch.tiers[newLevel - 1].name;
        if (def == null) return kind == HEAL ? "Field Repair" : "Salvage Haul";
        return def.name;
    }
}
