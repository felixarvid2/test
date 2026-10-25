package se.felixarvid.thorsurvivors.game;

/**
 * Sound events raised by the game, as a fixed ring buffer of ints: no allocation, no android.*. The simulation and
 * the menu {@link #emit} on the game thread; {@code audio.AudioEngine} drains it with {@link #poll} on the same
 * thread once per frame, so nothing here is synchronised.
 *
 * A packed event is {@code id | arg << 8}. Per id there is a rate limit (at most {@link #MAX_PER_WINDOW} plays per
 * {@link #WINDOW} seconds and at least {@link #MIN_GAP} seconds apart) so 50 hits in one frame make a few sounds, and
 * when the ring is full the oldest event is dropped (the newest sound wins). The clock is advanced by whoever steps
 * the game ({@link #advance}).
 */
public final class SoundEvents {
    public static final int WHIP = 0, MAGIC_MISSILE = 1, KNIFE = 2, AXE = 3, CROSS = 4, BIBLE = 5, FIREBALL = 6,
            GARLIC = 7, HOLY_WATER = 8, LIGHTNING = 9, ENEMY_HIT = 10, ENEMY_DEATH = 11, PLAYER_HURT = 12, GEM = 13,
            COIN = 14, LEVEL_UP = 15, CHEST_OPEN = 16, EVOLUTION = 17, BRAZIER_BREAK = 18, FOOD_HEAL = 19,
            BOSS_SPAWN = 20, GAME_OVER = 21, VICTORY = 22, UI_MOVE = 23, UI_CONFIRM = 24, UI_BACK = 25, HAMMER_SWING = 26,
            HAMMER_SLAM = 27, PISTOL_SHOT = 28, CASTER_BOLT = 29, SPORE_BURST = 30, DODGE = 31,
            // statuses, destructibles and the enemy roster (design phases 5 to 7)
            BURN_TICK = 32, FROST_HIT = 33, ELECTRIFY_ZAP = 34, DECAY_HISS = 35, STUN_HIT = 36, BARREL_EXPLODE = 37,
            CRATE_BREAK = 38, PYLON_USE = 39, DRONE_SHOT = 40, SERGEANT_BURST = 41, WELDER_CHARGE = 42,
            CARRIER_BURST = 43, VIRE_BLINK = 44,
            // elites, equipment and the boss patterns (design phases 9 and 10)
            ELITE_SPAWN = 45, ELITE_DIE = 46, EQUIP_DROP = 47, EQUIP_PICK = 48, EQUIP_SWAP = 49, BOSS_INTRO = 50,
            BOSS_SLAM = 51, THE_FIRST_ROAR = 52, TENTACLE_EMERGE = 53, COUNT = 54;

    /** File ids (audio/sfx/NAME.ogg and the manifest keys), indexed by event id. */
    public static final String[] NAMES = {"whip", "magic_missile", "knife", "axe", "cross", "bible", "fireball",
            "garlic", "holy_water", "lightning", "enemy_hit", "enemy_death", "player_hurt", "gem", "coin", "level_up",
            "chest_open", "evolution", "brazier_break", "food_heal", "boss_spawn", "game_over", "victory", "ui_move",
            "ui_confirm", "ui_back", "hammer_swing", "hammer_slam", "pistol_shot", "caster_bolt", "spore_burst", "dodge",
            "burn_tick", "frost_hit", "electrify_zap", "decay_hiss", "stun_hit", "barrel_explode", "crate_break",
            "pylon_use", "drone_shot", "sergeant_burst", "welder_charge", "carrier_burst", "vire_blink", "elite_spawn",
            "elite_die", "equip_drop", "equip_pick", "equip_swap", "boss_intro", "boss_slam", "the_first_roar",
            "tentacle_emerge"};

    public static final float WINDOW = 0.1f;
    /** Plays allowed per id inside one {@link #WINDOW}. */
    public static final int[] MAX_PER_WINDOW = {2, 3, 3, 2, 2, 1, 3, 1, 2, 3, 3, 4, 1, 3, 3, 1, 1, 1, 2, 1, 1, 1, 1, 2,
            2, 2, 2, 1, 2, 2, 1, 1,
            2, 2, 2, 1, 1, 2, 2, 1, 2, 1, 1, 2, 1,
            1, 1, 2, 1, 1, 1, 2, 1, 2};
    /** Minimum seconds between two plays of the same id (0 = none); garlic is quiet and heavily limited. */
    public static final float[] MIN_GAP = {0, 0, 0, 0, 0, 0, 0, 0.4f, 0, 0, 0.03f, 0.02f, 0.2f, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0.15f, 0.3f, 0.08f, 0.1f, 0.3f, 0.25f,
            0.15f, 0.1f, 0.12f, 0.5f, 0.2f, 0.05f, 0.05f, 1f, 0.1f, 0.3f, 0.25f, 0.1f, 0.3f,
            1f, 0.5f, 0.15f, 0.1f, 0.1f, 1f, 0.3f, 1f, 0.2f};
    /** Voices of one id that may sound at once; the oldest is stolen for a new one. */
    public static final int[] VOICES = {2, 3, 3, 2, 2, 1, 3, 1, 2, 3, 3, 4, 1, 3, 3, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1,
            2, 2, 1, 1,
            1, 2, 2, 1, 1, 2, 2, 1, 2, 1, 1, 2, 1,
            1, 1, 2, 1, 1, 1, 2, 1, 2};

    public static final int CAPACITY = 128;
    /** Gem pickups within this many seconds of each other raise the pitch one scale step. */
    public static final float GEM_CHAIN = 0.4f;
    private static final int[] GEM_SCALE = {0, 2, 4, 5, 7, 9, 11, 12};
    public static final int GEM_MAX_CHAIN = GEM_SCALE.length - 1;

    private final int[] ring = new int[CAPACITY];
    private int head, size;
    /** Seconds since creation; a double so it keeps advancing by 1/60 s after days of play (a float stalls near 2^18 s). */
    private double now;
    private final double[] winStart = new double[COUNT], last = new double[COUNT];
    private final int[] winCount = new int[COUNT];
    /** Events thrown away by the rate limit / by a full ring (for tests and diagnostics). */
    public int limited, overwritten;
    /** Events accepted per id since creation. */
    public final int[] emitted = new int[COUNT];

    public SoundEvents() {
        for (int i = 0; i < COUNT; i++) winStart[i] = last[i] = -1e9;
    }

    public void advance(float dt) {
        now += dt;
    }

    public double now() {
        return now;
    }

    public void emit(int id) {
        emit(id, 0);
    }

    public void emit(int id, int arg) {
        if (id < 0 || id >= COUNT) return;
        if (now - winStart[id] >= WINDOW) {
            winStart[id] = now;
            winCount[id] = 0;
        }
        if (winCount[id] >= MAX_PER_WINDOW[id] || now - last[id] < MIN_GAP[id]) {
            limited++;
            return;
        }
        winCount[id]++;
        last[id] = now;
        emitted[id]++;
        if (size == CAPACITY) { // full: drop the oldest
            head = (head + 1) % CAPACITY;
            size--;
            overwritten++;
        }
        ring[(head + size) % CAPACITY] = id | (arg << 8);
        size++;
    }

    /** Next packed event, or -1 when empty. */
    public int poll() {
        if (size == 0) return -1;
        int v = ring[head];
        head = (head + 1) % CAPACITY;
        size--;
        return v;
    }

    public int size() {
        return size;
    }

    public void clear() {
        head = size = 0;
    }

    public static int idOf(int packed) {
        return packed & 0xFF;
    }

    public static int argOf(int packed) {
        return packed >> 8;
    }

    /** Semitones above the base pitch for the n-th gem of a chain (a major scale up to one octave). */
    public static int gemSemitones(int chain) {
        return GEM_SCALE[Math.max(0, Math.min(GEM_MAX_CHAIN, chain))];
    }

    /** Volume setting step (0..{@link MetaProgress#VOL_MAX}) to a linear gain. */
    public static float stepGain(int step) {
        return Math.max(0, Math.min(MetaProgress.VOL_MAX, step)) / (float) MetaProgress.VOL_MAX;
    }
}
