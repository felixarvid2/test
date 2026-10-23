package se.felixarvid.thorsurvivors.data;

public final class EnemyDef {
    public final String key;
    public final String name;
    public final double maxHp;
    public final double speed;
    public final double power;
    public final double knockback;
    public final double xp;
    public final int level;
    public final double scale;
    public final double alpha;
    public final boolean hpTimesLevel;

    public EnemyDef(String key, String name, double maxHp, double speed, double power, double knockback,
                    double xp, int level, double scale, double alpha, boolean hpTimesLevel) {
        this.key = key;
        this.name = name;
        this.maxHp = maxHp;
        this.speed = speed;
        this.power = power;
        this.knockback = knockback;
        this.xp = xp;
        this.level = level;
        this.scale = scale;
        this.alpha = alpha;
        this.hpTimesLevel = hpTimesLevel;
    }
}
