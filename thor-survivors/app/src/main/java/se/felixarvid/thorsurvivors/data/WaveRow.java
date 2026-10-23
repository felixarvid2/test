package se.felixarvid.thorsurvivors.data;

/** One minute row of a stage's spawn table. */
public final class WaveRow {
    public final int minute;
    public final int minimum;
    public final int frequencyMs;
    public final String[] enemies;
    public final String[] bosses;

    public WaveRow(int minute, int minimum, int frequencyMs, String[] enemies, String[] bosses) {
        this.minute = minute;
        this.minimum = minimum;
        this.frequencyMs = frequencyMs;
        this.enemies = enemies;
        this.bosses = bosses;
    }
}
