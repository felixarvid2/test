package se.felixarvid.thorsurvivors.game;

/**
 * The numbers and formulas of the status effects (design section 7). Pure functions and constants, no state: the
 * stacks and timers live on {@link Entities.Enemy} and {@link Sim} ticks them in one pass at 10 Hz.
 *
 * <ul>
 * <li><b>Burn</b>: 0.08 x the applying hit per stack every 0.33 s, 2.5 s, refreshed on re-apply, 8 stacks.</li>
 * <li><b>Frost</b>: -6% speed per stack (at most -48%), 4 s, 8 stacks; the 8th stack freezes for 1.0 s and the stacks reset.</li>
 * <li><b>Electrify</b>: 0.5 x hit x stacks per tick, the interval is 2.0 s x 0.854^(n-1), every tick removes one stack, 6 stacks.</li>
 * <li><b>Decay</b>: 0.06 x hit per second per stack, -4% damage dealt per stack, 8 s, not refreshed by ticks, 10 stacks.</li>
 * <li><b>Stun</b>: cannot move or attack; bosses take 25% of the duration, elites 50%.</li>
 * </ul>
 */
public final class Status {
    private Status() {
    }

    /** The status pass runs this often (seconds). */
    public static final float PASS = 0.1f;

    public static final float BURN_TICK = 0.33f, BURN_TIME = 2.5f, BURN_HIT = 0.08f;
    public static final int BURN_CAP = 8;
    public static final float FROST_TIME = 4f, FROST_SLOW = 0.06f, FROST_MAX_SLOW = 0.48f, FREEZE_TIME = 1.0f;
    public static final int FROST_CAP = 8;
    public static final float ELEC_BASE = 2.0f, ELEC_FALLOFF = 0.854f, ELEC_HIT = 0.5f;
    public static final int ELEC_CAP = 6;
    public static final float DECAY_TIME = 8f, DECAY_HIT = 0.06f, DECAY_DAMAGE = 0.04f;
    public static final int DECAY_CAP = 10;
    public static final float BOSS_STUN = 0.25f, ELITE_STUN = 0.5f;

    /** Hero side (from enemy hazards): fixed values, no stacking. */
    public static final float HERO_BURN_DPS = 2f, HERO_BURN_TIME = 3f;
    public static final float HERO_SLOW = 0.25f, HERO_SLOW_TIME = 2f;
    public static final float HERO_DECAY_DPS = 1.5f, HERO_DECAY_TIME = 1.5f;

    /** Colours (RGB) of the status damage numbers and particles. */
    public static final int C_BURN = 0xFF9A30, C_FROST = 0x6FE6FF, C_ELEC = 0xFFF070, C_DECAY = 0x7CE04A;

    /** Stack cap of a status kind (Entities.ST_*). */
    public static int cap(int kind) {
        switch (kind) {
            case Entities.ST_BURN: return BURN_CAP;
            case Entities.ST_FROST: return FROST_CAP;
            case Entities.ST_ELECTRIFY: return ELEC_CAP;
            case Entities.ST_DECAY: return DECAY_CAP;
            default: return 0;
        }
    }

    /** Seconds between two Electrify ticks at n stacks: 2.0, 1.708, 1.459, ... */
    public static float electrifyInterval(int stacks) {
        int n = Math.max(1, stacks);
        return n < ELEC_TABLE.length ? ELEC_TABLE[n] : ELEC_BASE * (float) Math.pow(ELEC_FALLOFF, n - 1);
    }

    private static final float[] ELEC_TABLE = new float[ELEC_CAP + 1];

    static {
        for (int n = 1; n <= ELEC_CAP; n++) ELEC_TABLE[n] = ELEC_BASE * (float) Math.pow(ELEC_FALLOFF, n - 1);
    }

    /** Speed multiplier of an enemy with n Frost stacks (1 = unaffected). */
    public static float slowFactor(int stacks) {
        return 1f - Math.min(FROST_MAX_SLOW, FROST_SLOW * stacks);
    }

    /** Multiplier on the damage an enemy with n Decay stacks deals (contact and projectiles). */
    public static float decayDamageMul(int stacks) {
        return 1f - DECAY_DAMAGE * stacks;
    }

    /** Damage of one Burn tick: stacks x 0.08 x the hit that applied it. */
    public static float burnTick(int stacks, float hit) {
        return stacks * BURN_HIT * hit;
    }

    /** Damage of one Electrify tick (before the stack is removed). */
    public static float electrifyTick(int stacks, float hit) {
        return stacks * ELEC_HIT * hit;
    }

    /** Decay damage per second at n stacks. */
    public static float decayPerSecond(int stacks, float hit) {
        return stacks * DECAY_HIT * hit;
    }

    /** Stun duration an enemy actually gets: bosses 25%, elites 50%. */
    public static float stunFor(float seconds, boolean boss, boolean elite) {
        return boss ? seconds * BOSS_STUN : elite ? seconds * ELITE_STUN : seconds;
    }
}
