package se.felixarvid.thorsurvivors.audio;

import se.felixarvid.thorsurvivors.game.Engine;

/** Which music track belongs to the game state. Pure, so it can be tested. */
public final class MusicDirector {
    public static final String MENU = "menu", FOREST = "forest", LIBRARY = "library", BOSS = "boss", FINAL = "final",
            GAMEOVER = "gameover", VICTORY = "victory";

    private MusicDirector() {
    }

    /** Track name for a phase; null for silence. {@code bossAlive} switches the stage track to {@link #BOSS}. */
    public static String trackFor(int phase, String stageKey, boolean bossAlive, boolean win) {
        return trackFor(phase, stageKey, bossAlive, false, win);
    }

    /** Same; while The First lives ({@code finalAlive}) the {@link #FINAL} track plays instead of the boss track. */
    public static String trackFor(int phase, String stageKey, boolean bossAlive, boolean finalAlive, boolean win) {
        switch (phase) {
            case Engine.PH_MENU:
            case Engine.PH_SHOP:
                return MENU;
            case Engine.PH_RESULT:
                return win ? VICTORY : GAMEOVER;
            default:
                if (finalAlive) return FINAL;
                if (bossAlive) return BOSS;
                return stageTrack(stageKey);
        }
    }

    public static String stageTrack(String stageKey) {
        return "MINES".equals(stageKey) || "LIBRARY".equals(stageKey) ? LIBRARY : FOREST;
    }

    /** Stingers play once; every other track loops. */
    public static boolean isStinger(String track) {
        return GAMEOVER.equals(track) || VICTORY.equals(track);
    }
}
