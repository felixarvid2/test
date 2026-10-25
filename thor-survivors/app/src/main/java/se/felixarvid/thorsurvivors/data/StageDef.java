package se.felixarvid.thorsurvivors.data;

import java.util.List;

public final class StageDef {
    public final String key;
    public final String name;
    public final double timeLimit;
    public final double playerSpeed;
    public final double enemySpeed;
    public final double enemyHealth;
    public final double goldMultiplier;
    public final double xpBonus;
    public final int startingSpawns;
    public final boolean horizontalSpawns;
    /** What breaks and drops pickups on this stage (game_data.json destructibleType): "BRAZIER", "CANDELABRA" or "". */
    public final String destructible;
    public final List<WaveRow> rows;
    /**
     * Lumen tentacle hazard (design 4.1, Deep Mines): the minutes it breaks out, how many seconds it lasts, the seconds
     * between two waves of {@link #tentacleCount}, and the radius around the hero (empty = none).
     */
    public int[] tentacleMinutes = new int[0];
    public float tentacleLen = 20f, tentacleEvery = 4f, tentacleRadius = 400f;
    public int tentacleCount = 3;
    /**
     * Ashfall balance (phase 12): the gem value of a kill fades linearly from 1.0 at {@code xpFadeFrom} seconds to
     * {@code xpFadeEnd} at {@code xpFadeTo} (no fade when {@code xpFadeTo <= xpFadeFrom}). Keeps the early levels, stops the late XP flood.
     */
    public double xpFadeFrom, xpFadeTo, xpFadeEnd = 1.0;

    public StageDef(String key, String name, double timeLimit, double playerSpeed, double enemySpeed,
                    double enemyHealth, double goldMultiplier, double xpBonus, int startingSpawns,
                    boolean horizontalSpawns, String destructible, List<WaveRow> rows) {
        this.key = key;
        this.name = name;
        this.timeLimit = timeLimit;
        this.playerSpeed = playerSpeed;
        this.enemySpeed = enemySpeed;
        this.enemyHealth = enemyHealth;
        this.goldMultiplier = goldMultiplier;
        this.xpBonus = xpBonus;
        this.startingSpawns = startingSpawns;
        this.horizontalSpawns = horizontalSpawns;
        this.destructible = destructible;
        this.rows = rows;
    }

    /** A copy with another display name (the Ashfall overlay). */
    public StageDef withName(String newName) {
        StageDef d = new StageDef(key, newName, timeLimit, playerSpeed, enemySpeed, enemyHealth, goldMultiplier, xpBonus,
                startingSpawns, horizontalSpawns, destructible, rows);
        d.tentacleMinutes = tentacleMinutes;
        d.tentacleLen = tentacleLen;
        d.tentacleEvery = tentacleEvery;
        d.tentacleRadius = tentacleRadius;
        d.tentacleCount = tentacleCount;
        d.xpFadeFrom = xpFadeFrom;
        d.xpFadeTo = xpFadeTo;
        d.xpFadeEnd = xpFadeEnd;
        return d;
    }

    /** Multiplier on the XP a kill drops at run time {@code seconds} (1 without a fade). */
    public double xpFade(double seconds) {
        if (xpFadeTo <= xpFadeFrom || seconds <= xpFadeFrom) return 1.0;
        if (seconds >= xpFadeTo) return xpFadeEnd;
        return 1.0 + (xpFadeEnd - 1.0) * (seconds - xpFadeFrom) / (xpFadeTo - xpFadeFrom);
    }

    /** The row that governs the given run time: the last row whose minute is <= elapsed minutes. */
    public WaveRow rowAt(double seconds) {
        return WaveSelector.rowAt(rows, seconds);
    }

    /** The treasure table of the latest row (at or before the given time) that has one, or null. */
    public Treasure treasureAt(double seconds) {
        for (int i = WaveSelector.indexAt(rows, seconds); i >= 0; i--) if (rows.get(i).treasure != null) return rows.get(i).treasure;
        return null;
    }
}
