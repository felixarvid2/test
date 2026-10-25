package se.felixarvid.thorsurvivors.data;

import java.util.Map;

/**
 * One piece of equipment (ashfall_data.json "equipment", design section 6): a slot, an icon, and the PlayerStats
 * values it adds at Common rarity (a base item multiplies them by the rarity value, a unique uses them as they are).
 */
public final class EquipDef {
    public static final int HEAD = 0, BODY = 1, GLOVES = 2, FEET = 3, RING = 4, NECK = 5, SLOTS = 6;
    public static final String[] SLOT_NAMES = {"HEAD", "BODY", "GLOVES", "FEET", "RING", "NECK"};

    public final String key, name, icon, source;
    /** Position in {@link GameData#equipList} (stable: the pickup carries it). */
    public final int index, slot;
    public final boolean unique;
    public final Map<String, Double> values;

    public EquipDef(String key, String name, int slot, String icon, boolean unique, String source,
                    Map<String, Double> values, int index) {
        this.key = key;
        this.name = name;
        this.slot = slot;
        this.icon = icon;
        this.unique = unique;
        this.source = source;
        this.values = values;
        this.index = index;
    }

    public static int slotOf(String name) {
        for (int i = 0; i < SLOTS; i++) if (SLOT_NAMES[i].equals(name)) return i;
        return HEAD;
    }
}
