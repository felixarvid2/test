package se.felixarvid.thorsurvivors.data;

/** One stage minute's boss-chest table (game_data.json `treasure`). */
public final class Treasure {
    public static final String EVOLUTION = "EVOLUTION", EXISTING_ANY = "EXISTING_ANY", EXISTING_WEAPON = "EXISTING_WEAPON";

    /** Percent chances: [0] a 5-item chest, [1] a 3-item chest, [2] a 1-item chest (always at least 1 item). */
    public final double[] chances;
    /** The data's `level`. Kept for reference; not used (one level per prize). */
    public final int level;
    /** What each item slot gives, in order (see {@link #EVOLUTION} and the constants after it). */
    public final String[] prizeTypes;

    public Treasure(double[] chances, int level, String[] prizeTypes) {
        this.chances = chances;
        this.level = level;
        this.prizeTypes = prizeTypes;
    }

    /** The prize type of item slot i; slots beyond the list repeat EXISTING_ANY. */
    public String prizeAt(int i) {
        return i < prizeTypes.length ? prizeTypes[i] : EXISTING_ANY;
    }
}
