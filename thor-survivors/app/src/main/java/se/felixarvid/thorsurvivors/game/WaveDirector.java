package se.felixarvid.thorsurvivors.game;

import se.felixarvid.thorsurvivors.data.WaveRow;

/** Pure spawn-count policy for one spawn tick. */
public final class WaveDirector {
    public static final int ENEMY_CAP = 300;
    public static final int MAX_PER_TICK = 30;

    private WaveDirector() {
    }

    /** Below `minimum` alive: top up (bounded per tick); otherwise a small trickle that grows over time. */
    public static int spawnCount(WaveRow row, int alive, double seconds) {
        if (alive >= ENEMY_CAP || row.enemies.length == 0) return 0;
        int n;
        if (alive < row.minimum) n = Math.min(row.minimum - alive, MAX_PER_TICK);
        else n = 1 + (int) (seconds / 360.0);
        return Math.min(n, ENEMY_CAP - alive);
    }
}
