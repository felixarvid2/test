package se.felixarvid.thorsurvivors.game;

import se.felixarvid.thorsurvivors.game.Entities.Enemy;

/**
 * Elites and champions (design section 5, HoT champions): a flagged slot of the normal enemy pool ({@code Enemy.elite},
 * {@code Enemy.mods}), never a pool of its own. This class holds the modifiers (names, colours, what each does every
 * step) and the schedule numbers; {@link Sim} spawns and rewards them.
 *
 * <ul>
 * <li>Firewalker: a fire patch every 45 units it walks. Frostwalker: a frost patch (slows the hero) every 45 units.</li>
 * <li>Barrage: every 3 s three bolts in an 80 degree fan. Volcano: three lobbed bombs (warn ring, then a blast).</li>
 * <li>Raiser: raises 4 colonists every 10 s. Armored: 3 off every hit it takes, and it cannot be knocked back.</li>
 * </ul>
 */
public final class Elites {
    public static final int M_FIRE = 1, M_FROST = 2, M_BARRAGE = 4, M_VOLCANO = 8, M_RAISER = 16, M_ARMORED = 32, COUNT = 6;
    public static final String[] NAMES = {"Firewalker", "Frostwalker", "Barrage", "Volcano", "Raiser", "Armored"};
    /** The marker colour of each modifier (the outline and the floor ring), ARGB. */
    public static final int[] COLORS = {0xFFFF8A2A, 0xFF40D8FF, 0xFFFF3B1F, 0xFFFFD030, 0xFF3DBE5A, 0xFFB0B8C0};
    static final float TRAIL_EVERY = 45f, BARRAGE_EVERY = 3f, VOLCANO_EVERY = 7f, RAISE_EVERY = 10f, FLAT_ARMOR = 3f;
    private static final float TAU = 6.2831855f;

    private final Sim s;

    Elites(Sim s) {
        this.s = s;
    }

    /** Seconds from one elite to the next at run time {@code t}: 150 s less 1% per minute, never under the floor (100 s). */
    static float interval(se.felixarvid.thorsurvivors.data.GameData d, double t) {
        double base = d.elite("interval", 150), floor = d.elite("min", 100), shrink = d.elite("shrinkPerMin", 0.01);
        return (float) Math.max(floor, base * (1.0 - shrink * (t / 60.0)));
    }

    /** How many modifiers an elite gets at run time {@code t}: 1, 2 after 12:00, 3 after 24:00. */
    static int modCount(se.felixarvid.thorsurvivors.data.GameData d, double t) {
        return t >= d.elite("mods3At", 1440) ? 3 : t >= d.elite("mods2At", 720) ? 2 : 1;
    }

    /** A random set of {@code n} distinct modifiers as a bit mask. */
    static int roll(java.util.Random rng, int n) {
        int mask = 0;
        for (int k = 0; k < n; k++) {
            int pick = rng.nextInt(COUNT - k), bit = 0;
            for (int i = 0; i < COUNT; i++) {
                if ((mask >> i & 1) != 0) continue;
                if (pick-- == 0) {
                    bit = i;
                    break;
                }
            }
            mask |= 1 << bit;
        }
        return mask;
    }

    /** The colour of the n-th modifier an elite has (cycles, so the outline pulses through them), or 0 without one. */
    public static int colorOf(int mods, int n) {
        int seen = 0;
        for (int i = 0; i < COUNT; i++) {
            if ((mods >> i & 1) == 0) continue;
            if (seen++ == n) return COLORS[i];
        }
        return 0;
    }

    /** Index (0..5) of the n-th modifier an elite has, or -1 without one. */
    public static int indexOf(int mods, int n) {
        int seen = 0;
        for (int i = 0; i < COUNT; i++) {
            if ((mods >> i & 1) == 0) continue;
            if (seen++ == n) return i;
        }
        return -1;
    }

    /** "Firewalker + Barrage": the modifier names of an elite. */
    public static String label(int mods) {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < COUNT; i++) {
            if ((mods >> i & 1) == 0) continue;
            if (b.length() > 0) b.append(" + ");
            b.append(NAMES[i]);
        }
        return b.toString();
    }

    public static int bits(int mods) {
        return Integer.bitCount(mods);
    }

    /** One step of the modifiers of a live elite (after its archetype moved it). {@code d} is the distance to the hero. */
    void update(Enemy e, float dt, float d) {
        int m = e.mods;
        if ((m & (M_FIRE | M_FROST)) != 0) {
            if (e.t2 == 0f && e.t3 == 0f) {
                e.t2 = e.x;
                e.t3 = e.y;
            }
            float mx = e.x - e.t2, my = e.y - e.t3;
            e.t2 = e.x;
            e.t3 = e.y;
            e.etrail += Math.min(60f, (float) Math.sqrt(mx * mx + my * my));
            if (e.etrail >= TRAIL_EVERY && s.hazN < Sim.MAX_HAZ - Sim.HAZ_RESERVE_TRAIL) {
                e.etrail = 0f;
                if ((m & M_FIRE) != 0) s.ai.addHazard(Entities.HZ_SLAG, e.x, e.y + 4f, 22f, 3f, 6f, 0f);
                if ((m & M_FROST) != 0) s.ai.addHazard(Entities.HZ_FROST, e.x + 8f, e.y + 6f, 26f, 4f, 0f, 0f);
            }
        }
        if ((m & M_BARRAGE) != 0 && (e.mt0 -= dt) <= 0f && d < 520f && s.eprojN + 3 <= Sim.MAX_EPROJ) {
            e.mt0 = BARRAGE_EVERY;
            float base = (float) Math.atan2(s.py - e.y, s.px - e.x);
            for (int k = -1; k <= 1; k++) {
                float a = base + k * 0.6981f; // 40 degrees either side: an 80 degree fan
                s.ai.shoot(e.x, e.y - 10f, (float) Math.cos(a) * 230f, (float) Math.sin(a) * 230f, 9f * e.shotMul * e.dmgMul, 2.2f);
            }
            s.sound.emit(SoundEvents.SERGEANT_BURST);
        }
        if ((m & M_VOLCANO) != 0 && (e.mt1 -= dt) <= 0f && d < 600f) {
            e.mt1 = VOLCANO_EVERY;
            for (int k = 0; k < 3; k++) {
                float x = s.px, y = s.py;
                if (k > 0) {
                    float a = s.rng.nextFloat() * TAU, r = 70f + s.rng.nextFloat() * 120f;
                    x += (float) Math.cos(a) * r;
                    y += (float) Math.sin(a) * r * 0.8f;
                }
                Entities.Hazard h = s.ai.addHazard(Entities.HZ_BOMB, x, y, 48f, 0.4f, 12f * e.shotMul, 1.0f + 0.15f * k);
                if (h != null) h.variant = Entities.BV_VOLCANO;
            }
        }
        if ((m & M_RAISER) != 0 && (e.mt2 -= dt) <= 0f) {
            e.mt2 = RAISE_EVERY;
            float a0 = s.rng.nextFloat() * TAU;
            for (int k = 0; k < 4; k++) {
                if (s.enemyN >= Sim.MAX_ENEMIES - 12) break;
                float a = a0 + k * TAU / 4f;
                s.spawnMinion("COLONIST", e.x + (float) Math.cos(a) * 36f, e.y + (float) Math.sin(a) * 30f);
            }
            s.spark(e.x, e.y - 10f, 0xFF3DBE5A, 8);
        }
    }
}
