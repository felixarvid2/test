package se.felixarvid.thorsurvivors.game;

import se.felixarvid.thorsurvivors.data.WeaponDef;

import java.util.Map;

/** The run's weapon and passive slots (max 6 + 6) and the evolution rules. */
public final class Inventory {
    public static final int MAX_WEAPONS = 6;
    public static final int MAX_PASSIVES = 6;

    public static final class Slot {
        public WeaponDef def;
        public int level;
    }

    public final Slot[] weapons = new Slot[MAX_WEAPONS];
    public final Slot[] passives = new Slot[MAX_PASSIVES];
    public int weaponCount;
    public int passiveCount;

    public Inventory() {
        for (int i = 0; i < MAX_WEAPONS; i++) weapons[i] = new Slot();
        for (int i = 0; i < MAX_PASSIVES; i++) passives[i] = new Slot();
    }

    public int weaponLevel(String key) {
        for (int i = 0; i < weaponCount; i++) if (weapons[i].def.key.equals(key)) return weapons[i].level;
        return 0;
    }

    public int passiveLevel(String key) {
        for (int i = 0; i < passiveCount; i++) if (passives[i].def.key.equals(key)) return passives[i].level;
        return 0;
    }

    public int levelOf(String key) {
        int l = weaponLevel(key);
        return l > 0 ? l : passiveLevel(key);
    }

    public boolean hasPassive(String key) {
        return passiveLevel(key) > 0;
    }

    /** Adds a new weapon/passive at level 1; returns false when full or already owned. */
    public boolean add(WeaponDef def) {
        if (levelOf(def.key) > 0) return false;
        if (def.powerUp) {
            if (passiveCount >= MAX_PASSIVES) return false;
            passives[passiveCount].def = def;
            passives[passiveCount].level = 1;
            passiveCount++;
        } else {
            if (weaponCount >= MAX_WEAPONS) return false;
            weapons[weaponCount].def = def;
            weapons[weaponCount].level = 1;
            weaponCount++;
        }
        return true;
    }

    /** Raises an owned weapon/passive by one level (up to its max); returns the new level or 0. */
    public int levelUp(String key) {
        for (int i = 0; i < weaponCount; i++) {
            Slot s = weapons[i];
            if (s.def.key.equals(key) && s.level < s.def.maxLevel()) return ++s.level;
        }
        for (int i = 0; i < passiveCount; i++) {
            Slot s = passives[i];
            if (s.def.key.equals(key) && s.level < s.def.maxLevel()) return ++s.level;
        }
        return 0;
    }

    /** True if the weapon in this slot is at max level and owns one of its synergy passives. */
    public boolean canEvolve(int slot, Map<String, WeaponDef> defs) {
        if (slot < 0 || slot >= weaponCount) return false;
        Slot s = weapons[slot];
        WeaponDef d = s.def;
        if (d.evolution || d.evoInto == null || s.level < d.maxLevel()) return false;
        WeaponDef target = defs.get(d.evoInto);
        if (target == null || !target.evolution) return false;
        for (String p : d.evoSynergy) if (hasPassive(p)) return true;
        return false;
    }

    /** First slot that can evolve now, or -1. */
    public int firstEvolvable(Map<String, WeaponDef> defs) {
        for (int i = 0; i < weaponCount; i++) if (canEvolve(i, defs)) return i;
        return -1;
    }

    /** Replaces the weapon in the slot with its evolved form. Returns the new def or null. */
    public WeaponDef evolve(int slot, Map<String, WeaponDef> defs) {
        if (!canEvolve(slot, defs)) return null;
        WeaponDef target = defs.get(weapons[slot].def.evoInto);
        weapons[slot].def = target;
        weapons[slot].level = 1;
        return target;
    }
}
