package se.felixarvid.thorsurvivors.data;

public final class ItemDef {
    public final String key;
    public final String name;
    public final double rarity;
    public final double value;

    public ItemDef(String key, String name, double rarity, double value) {
        this.key = key;
        this.name = name;
        this.rarity = rarity;
        this.value = value;
    }
}
