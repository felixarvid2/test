package se.felixarvid.thorsurvivors.data;

/** One minute row of a stage's spawn table. */
public final class WaveRow {
    public final int minute;
    public final int minimum;
    public final int frequencyMs;
    public final String[] enemies;
    public final String[] bosses;
    /** The boss-chest table of this minute row, or null when the row has none (see {@link Treasure}). */
    public final Treasure treasure;

    public WaveRow(int minute, int minimum, int frequencyMs, String[] enemies, String[] bosses) {
        this(minute, minimum, frequencyMs, enemies, bosses, null);
    }

    public WaveRow(int minute, int minimum, int frequencyMs, String[] enemies, String[] bosses, Treasure treasure) {
        this.minute = minute;
        this.minimum = minimum;
        this.frequencyMs = frequencyMs;
        this.enemies = enemies;
        this.bosses = bosses;
        this.treasure = treasure;
    }
}
