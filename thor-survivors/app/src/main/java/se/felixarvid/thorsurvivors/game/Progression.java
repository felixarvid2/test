package se.felixarvid.thorsurvivors.game;

public final class Progression {
    private Progression() {
    }

    /** XP needed to go from `level` to `level + 1` (approximates the classic curve). */
    public static int xpToNext(int level) {
        if (level < 1) level = 1;
        if (level == 1) return 5;
        if (level < 20) return 10 * level - 5;
        if (level == 20) return 10 * level - 5 + 600;
        if (level < 40) return 13 * level - 6;
        if (level == 40) return 13 * level - 6 + 2400;
        return 16 * level - 8;
    }
}
