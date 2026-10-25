package se.felixarvid.thorsurvivors.game;

import se.felixarvid.thorsurvivors.data.WaveRow;

/** Pure spawn-count policy for one spawn tick. */
public final class WaveDirector {
    public static final int ENEMY_CAP = 300;
    public static final int MAX_PER_TICK = 30;

    private WaveDirector() {
    }

    /** Enemies spawned per tick regardless of the field: one of each type in the row (Vampire Survivors), up to the cap. */
    public static int eachCount(WaveRow row, int alive) {
        return Math.max(0, Math.min(row.enemies.length, ENEMY_CAP - alive));
    }

    /** After the per-type spawns: how many more (random types) bring the field up to `minimum`, bounded per tick. */
    public static int topUpCount(WaveRow row, int alive) {
        if (alive >= ENEMY_CAP || row.enemies.length == 0 || alive >= row.minimum) return 0;
        return Math.min(Math.min(row.minimum - alive, MAX_PER_TICK), ENEMY_CAP - alive);
    }
}
