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
    public final List<WaveRow> rows;

    public StageDef(String key, String name, double timeLimit, double playerSpeed, double enemySpeed,
                    double enemyHealth, double goldMultiplier, double xpBonus, int startingSpawns,
                    boolean horizontalSpawns, List<WaveRow> rows) {
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
        this.rows = rows;
    }

    /** The row that governs the given run time: the last row whose minute is <= elapsed minutes. */
    public WaveRow rowAt(double seconds) {
        return WaveSelector.rowAt(rows, seconds);
    }
}
