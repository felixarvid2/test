package se.felixarvid.thorsurvivors.game;

/**
 * Deterministic, infinite stage layout: a pure function of the tile coordinates, so any chunk can be generated on
 * its own and two chunks agree on what lies across their shared border. No android imports, no allocation (callers
 * pass the arrays that receive lists).
 *
 * Everything is in tile units (one tile = {@link #TILE} world units = 80 px at 1080p). Two layers:
 * <ul>
 * <li><b>decals</b>: flat pictures on the floor (oil, blood, scorch, rubble, grates, bones, moss, crystals), one
 * candidate per 2 x 2 tiles. They are baked into the ground chunks ({@code render/GroundCache}).</li>
 * <li><b>props</b>: standing things (crates, barrels, pipes, rocks, light posts, landmarks, mine walls) that the
 * renderer y-sorts with the creatures. Nothing collides.</li>
 * </ul>
 * Stage FLATS (legacy key FOREST) is the ash plain (Cinder Flats): junk yards of crates and rock, glowing lumen growths in
 * clusters, light posts and the odd crashed ship. Stage MINES (legacy key LIBRARY) is the deep mine: long rows of wall pieces above and below a free
 * central lane with breaks, clutter between the rows and emergency lights along the lane. The spawn point (0, 0) is
 * kept clear in both.
 */
public final class WorldGen {
    /** World units per tile at 1080p (80 px at 1.9286 px per unit). */
    public static final float TILE = 41.5f;
    /** Tiles per chunk edge. */
    public static final int CHUNK = 8;
    /** No prop or wall inside this many tiles (~300 u) of the spawn point (0, 0). */
    public static final float CLEAR = 7.3f;
    /** Largest number of entries one list call can return. */
    public static final int MAX_LIST = 512;

    /** Decal kinds: index = position in {@link #DECAL}; atlas key "decal.NAME". */
    public static final String[] DECAL = {"blood_stain", "bones", "crystal_shards", "floor_grate", "footprints",
            "hazard_stripes", "lumen_growth", "manhole", "moss_patch", "oil_stain", "puddle", "rubble", "scorch_mark",
            "tire_tracks"};
    public static final int DC_BLOOD = 0, DC_BONES = 1, DC_CRYSTAL = 2, DC_GRATE = 3, DC_FOOTPRINTS = 4, DC_HAZARD = 5,
            DC_LUMEN = 6, DC_MANHOLE = 7, DC_MOSS = 8, DC_OIL = 9, DC_PUDDLE = 10, DC_RUBBLE = 11, DC_SCORCH = 12,
            DC_TRACKS = 13;

    /** Prop kinds: index = position in {@link #PROP}; atlas key "prop.NAME". */
    public static final String[] PROP = {"cargo_crate", "barricade", "fuel_tank", "slag_rock", "debris_rock",
            "lumen_growth", "spore_nest", "crashed_lander", "escape_pod", "generator", "control_terminal",
            "coolant_valve", "vent", "pipe_cluster", "smokestack", "emergency_light", "industrial_wall",
            "wall_segment", "catwalk", "compressor", "water_tanker"};
    public static final int P_CRATE = 0, P_BARRICADE = 1, P_FUEL_TANK = 2, P_SLAG = 3, P_DEBRIS = 4, P_LUMEN = 5,
            P_NEST = 6, P_LANDER = 7, P_POD = 8, P_GENERATOR = 9, P_TERMINAL = 10, P_VALVE = 11, P_VENT = 12,
            P_PIPES = 13, P_STACK = 14, P_LIGHT = 15, P_WALL = 16, P_SEGMENT = 17, P_CATWALK = 18, P_COMPRESSOR = 19,
            P_TANKER = 20;
    /** Footprint radius in world units (what a destructible keeps away from). */
    private static final float[] PROP_R = {14, 30, 28, 28, 8, 20, 24, 70, 55, 28, 10, 10, 16, 40, 20, 6, 85, 70, 80, 40, 60};

    private static final float[] W1 = {14, 6, 8, 14, 18, 10, 6, 8};
    private static final float[] W2 = {18, 16, 10, 10, 8, 14, 12, 4, 4};
    private static final float[] W3 = {34, 14, 10, 14, 20, 4, 4};
    private static final float[] W4 = {38, 20, 17, 15, 10};
    private static final float[] W5 = {20, 14, 10, 8, 10, 12, 14, 12};

    private static final int LIB_BAND = 6, LIB_PERIOD = 7, WALL_SLOT = 3;

    public final boolean mines;
    private static final WorldGen FLATS = new WorldGen(false), MINES = new WorldGen(true);
    private final float[] sx = new float[64], sy = new float[64];
    private final int[] sk = new int[64];

    private WorldGen(boolean mines) {
        this.mines = mines;
    }

    public static WorldGen of(String stageKey) {
        return "MINES".equals(stageKey) || "LIBRARY".equals(stageKey) ? MINES : FLATS;
    }

    // ------------------------------------------------------------------ noise

    static int hash(int x, int y, int salt) {
        int h = x * 374761393 + y * 668265263 + salt * 0x3C6EF372;
        h = (h ^ (h >>> 13)) * 1274126177;
        h ^= h >>> 16;
        h = (h ^ (h >>> 15)) * 0x2C1B3C6D;
        return h ^ (h >>> 12);
    }

    /** Uniform [0, 1) from a hash. */
    static float unit(int h) {
        return (h >>> 8) / 16777216f;
    }

    static float rnd(int x, int y, int salt) {
        return unit(hash(x, y, salt));
    }

    /** Smooth value noise in [0, 1) on a unit lattice. */
    static float noise(int salt, float x, float y) {
        int x0 = (int) Math.floor(x), y0 = (int) Math.floor(y);
        float fx = x - x0, fy = y - y0;
        float u = fx * fx * (3f - 2f * fx), v = fy * fy * (3f - 2f * fy);
        float a = rnd(x0, y0, salt), b = rnd(x0 + 1, y0, salt), c = rnd(x0, y0 + 1, salt), d = rnd(x0 + 1, y0 + 1, salt);
        return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
    }

    private static boolean nearSpawn(float x, float y, float r) {
        return x * x + y * y < r * r;
    }

    private static int floorI(float v) {
        return (int) Math.floor(v);
    }

    /** False inside the spawn clearing (in world units). */
    public static boolean clumpAllowed(float wx, float wy) {
        return wx * wx + wy * wy >= (CLEAR * TILE) * (CLEAR * TILE);
    }

    /** Pick by cumulative weights (sum need not be 1): r in [0, 1) scaled to the total. */
    private static int pick(float r, float[] w) {
        float tot = 0;
        for (float v : w) tot += v;
        r *= tot;
        for (int i = 0; i < w.length; i++) {
            r -= w[i];
            if (r < 0) return i;
        }
        return w.length - 1;
    }

    // ------------------------------------------------------------------ decals

    /** Noise field where lumen (flats) or crystal (mines) clusters grow. */
    float lumenField(float tx, float ty) {
        return noise(202, tx / 7f, ty / 7f);
    }

    /**
     * Decals whose centre lies in tiles [tx0, tx1] x [ty0, ty1] (inclusive): positions in tile units, kind in the low
     * byte ({@link #DECAL} index), quarter turns in bits 8-9 and a mirror flag in bit 10. Returns the count.
     */
    public int decals(int tx0, int ty0, int tx1, int ty1, float[] xs, float[] ys, int[] kinds) {
        int n = 0;
        for (int by = Math.floorDiv(ty0, 2); by <= Math.floorDiv(ty1, 2); by++) {
            for (int bx = Math.floorDiv(tx0, 2); bx <= Math.floorDiv(tx1, 2); bx++) {
                if (n >= xs.length) return n;
                float x = bx * 2 + rnd(bx, by, 71) * 2f, y = by * 2 + rnd(bx, by, 72) * 2f;
                if (x < tx0 || x >= tx1 + 1 || y < ty0 || y >= ty1 + 1) continue;
                int k = decalKind(bx, by, x, y);
                if (k < 0) continue;
                int h = hash(bx, by, 73);
                xs[n] = x;
                ys[n] = y;
                kinds[n++] = k | (((h >>> 5) & 3) << 8) | (((h >>> 9) & 1) << 10);
            }
        }
        return n;
    }

    private int decalKind(int bx, int by, float x, float y) {
        float r = rnd(bx, by, 74);
        if (r >= 0.30f) return -1;
        if (!mines && nearSpawn(x, y, 1.5f)) return -1; // keep the very start tidy
        float pick = rnd(bx, by, 75);
        float lum = lumenField(x, y);
        if (mines) {
            if (lum > 0.68f && pick < 0.45f) return DC_CRYSTAL;
            switch (pick(pick, W1)) {
                case 0: return DC_GRATE;
                case 1: return DC_MANHOLE;
                case 2: return DC_HAZARD;
                case 3: return DC_OIL;
                case 4: return DC_RUBBLE;
                case 5: return DC_BLOOD;
                case 6: return DC_BONES;
                default: return DC_SCORCH;
            }
        }
        if (lum > 0.66f && pick < 0.5f) return DC_LUMEN;
        switch (pick(pick, W2)) {
            case 0: return DC_SCORCH;
            case 1: return DC_RUBBLE;
            case 2: return DC_TRACKS;
            case 3: return DC_FOOTPRINTS;
            case 4: return DC_BONES;
            case 5: return DC_BLOOD;
            case 6: return DC_OIL;
            case 7: return DC_PUDDLE;
            default: return DC_MOSS;
        }
    }

    // ------------------------------------------------------------------ props

    /**
     * Props whose feet lie in tiles [tx0, tx1] x [ty0, ty1] (inclusive): feet position in tile units and the {@link #PROP}
     * kind. Returns the count (at most the array length). Order is arbitrary; the renderer sorts by y.
     */
    public int props(int tx0, int ty0, int tx1, int ty1, float[] xs, float[] ys, int[] kinds) {
        int n = 0;
        n = mines ? minesProps(tx0, ty0, tx1, ty1, xs, ys, kinds, n) : flatsProps(tx0, ty0, tx1, ty1, xs, ys, kinds, n);
        // light posts and far landmarks per 14-tile region
        final int R = 14;
        for (int ry = Math.floorDiv(ty0, R); ry <= Math.floorDiv(ty1, R); ry++) {
            for (int rx = Math.floorDiv(tx0, R); rx <= Math.floorDiv(tx1, R); rx++) {
                n = regionProps(rx, ry, R, tx0, ty0, tx1, ty1, xs, ys, kinds, n);
            }
        }
        return n;
    }

    private static int emit(float x, float y, int kind, int tx0, int ty0, int tx1, int ty1, float[] xs, float[] ys,
                            int[] kinds, int n) {
        if (n >= xs.length || x < tx0 || x >= tx1 + 1 || y < ty0 || y >= ty1 + 1) return n;
        xs[n] = x;
        ys[n] = y;
        kinds[n] = kind;
        return n + 1;
    }

    private int regionProps(int rx, int ry, int R, int tx0, int ty0, int tx1, int ty1, float[] xs, float[] ys, int[] kinds, int n) {
        // emergency light post
        if (rnd(rx, ry, 81) < (mines ? 0.0f : 0.8f)) {
            float x = rx * R + 1 + rnd(rx, ry, 82) * (R - 2), y = ry * R + 1 + rnd(rx, ry, 83) * (R - 2);
            if (!nearSpawn(x, y, 4.1f)) n = emit(x, y, P_LIGHT, tx0, ty0, tx1, ty1, xs, ys, kinds, n);
        }
        // a landmark now and then
        float r = rnd(rx, ry, 84);
        float x = rx * R + 2 + rnd(rx, ry, 85) * (R - 4), y = ry * R + 2 + rnd(rx, ry, 86) * (R - 4);
        if (nearSpawn(x, y, CLEAR + 2f)) return n;
        if (!mines) {
            if (r < 0.14f) n = emit(x, y, P_LANDER, tx0, ty0, tx1, ty1, xs, ys, kinds, n);
            else if (r < 0.26f) n = emit(x, y, P_POD, tx0, ty0, tx1, ty1, xs, ys, kinds, n);
            else if (r < 0.34f) n = emit(x, y, P_TANKER, tx0, ty0, tx1, ty1, xs, ys, kinds, n);
            else if (r < 0.42f) n = emit(x, y, P_GENERATOR, tx0, ty0, tx1, ty1, xs, ys, kinds, n);
            if (rnd(rx, ry, 87) < 0.18f) { // the far smokestack
                n = emit(rx * R + rnd(rx, ry, 88) * R, ry * R + 2 + rnd(rx, ry, 89) * (R - 2), P_STACK, tx0, ty0, tx1, ty1, xs, ys, kinds, n);
            }
        } else if (rnd(rx, ry, 87) < 0.12f) {
            n = emit(rx * R + rnd(rx, ry, 88) * R, ry * R + 2 + rnd(rx, ry, 89) * (R - 2), P_STACK, tx0, ty0, tx1, ty1, xs, ys, kinds, n);
        }
        return n;
    }

    // --- cinder flats

    private int flatsProps(int tx0, int ty0, int tx1, int ty1, float[] xs, float[] ys, int[] kinds, int n) {
        final int G = 3;
        for (int gy = Math.floorDiv(ty0, G); gy <= Math.floorDiv(ty1, G); gy++) {
            for (int gx = Math.floorDiv(tx0, G); gx <= Math.floorDiv(tx1, G); gx++) {
                float x = gx * G + 0.3f + rnd(gx, gy, 61) * (G - 0.6f), y = gy * G + 0.3f + rnd(gx, gy, 62) * (G - 0.6f);
                if (nearSpawn(x, y, CLEAR)) continue;
                int k = flatsKind(gx, gy, x, y);
                if (k >= 0) n = emit(x, y, k, tx0, ty0, tx1, ty1, xs, ys, kinds, n);
            }
        }
        return n;
    }

    private int flatsKind(int gx, int gy, float x, float y) {
        float r = rnd(gx, gy, 63), junk = noise(201, x / 10f, y / 10f), lum = lumenField(x, y);
        if (lum > 0.68f) {
            if (r < 0.62f) return rnd(gx, gy, 64) < 0.14f ? P_NEST : P_LUMEN;
            return -1;
        }
        if (junk > 0.60f) { // a junk yard
            if (r > 0.62f) return -1;
            switch (pick(rnd(gx, gy, 64), W3)) {
                case 0: return P_CRATE;
                case 1: return P_BARRICADE;
                case 2: return P_FUEL_TANK;
                case 3: return P_SLAG;
                case 4: return P_DEBRIS;
                case 5: return P_COMPRESSOR;
                default: return P_VALVE;
            }
        }
        if (r < 0.10f) return rnd(gx, gy, 64) < 0.6f ? P_DEBRIS : rnd(gx, gy, 65) < 0.6f ? P_SLAG : P_CRATE;
        return -1;
    }

    // --- deep mine

    /** Row index g (0 nearest the lane) of the wall band that tile row ty belongs to, or -1 (lane or clutter row). */
    private static int bandOf(int ty) {
        int a = ty < 0 ? -ty - 1 : ty;
        if (a < LIB_BAND) return -1;
        int m = (a - LIB_BAND) % LIB_PERIOD;
        return m <= 1 ? (a - LIB_BAND) / LIB_PERIOD : -1;
    }

    private boolean wallGap(int slot, int g, int side) {
        return hash(slot, g * 2 + side, 51) % 100 < 16;
    }

    private int minesProps(int tx0, int ty0, int tx1, int ty1, float[] xs, float[] ys, int[] kinds, int n) {
        // wall rows: g-th row pair, side 0 = below the lane (y > 0), 1 = above; feet on the lane-facing... south edge
        int gMax = Math.max(Math.abs(ty0), Math.abs(ty1)) / LIB_PERIOD + 1;
        for (int g = 0; g <= gMax; g++) {
            for (int side = 0; side < 2; side++) {
                float feet = side == 0 ? LIB_BAND + g * LIB_PERIOD + 2f : -(LIB_BAND + g * LIB_PERIOD);
                if (feet < ty0 || feet >= ty1 + 1) continue;
                for (int slot = Math.floorDiv(tx0, WALL_SLOT) - 1; slot <= Math.floorDiv(tx1, WALL_SLOT) + 1; slot++) {
                    if (wallGap(slot, g, side)) continue;
                    float x = (slot + 0.5f) * WALL_SLOT;
                    int k = pick(rnd(slot, g * 2 + side, 52), W4);
                    int kind = k == 0 ? P_SEGMENT : k == 1 ? P_CATWALK : k == 2 ? P_PIPES : k == 3 ? P_SLAG : P_WALL;
                    n = emit(x, feet, kind, tx0, ty0, tx1, ty1, xs, ys, kinds, n);
                }
            }
        }
        // clutter between the rows
        final int G = 3;
        for (int gy = Math.floorDiv(ty0, G); gy <= Math.floorDiv(ty1, G); gy++) {
            for (int gx = Math.floorDiv(tx0, G); gx <= Math.floorDiv(tx1, G); gx++) {
                float x = gx * G + 0.3f + rnd(gx, gy, 61) * (G - 0.6f), y = gy * G + 0.3f + rnd(gx, gy, 62) * (G - 0.6f);
                int ty = floorI(y), a = ty < 0 ? -ty - 1 : ty;
                if (a < LIB_BAND + 3 || bandOf(ty) >= 0 || bandOf(ty - 1) >= 0 || bandOf(ty + 1) >= 0) continue;
                float lum = lumenField(x, y);
                float r = rnd(gx, gy, 63);
                if (lum > 0.72f && r < 0.5f) {
                    n = emit(x, y, rnd(gx, gy, 64) < 0.2f ? P_NEST : P_LUMEN, tx0, ty0, tx1, ty1, xs, ys, kinds, n);
                } else if (r < 0.16f) {
                    int k = pick(rnd(gx, gy, 64), W5);
                    int kind = k == 0 ? P_CRATE : k == 1 ? P_PIPES : k == 2 ? P_GENERATOR : k == 3 ? P_TERMINAL
                            : k == 4 ? P_VALVE : k == 5 ? P_VENT : k == 6 ? P_DEBRIS : P_SLAG;
                    n = emit(x, y, kind, tx0, ty0, tx1, ty1, xs, ys, kinds, n);
                }
            }
        }
        // emergency lights every ~14 tiles along the lane edges, alternating sides
        final int L = 14;
        for (int lx = Math.floorDiv(tx0, L); lx <= Math.floorDiv(tx1, L); lx++) {
            float x = lx * L + 3 + rnd(lx, 0, 91) * (L - 6);
            float y = (hash(lx, 0, 92) & 1) == 0 ? LIB_BAND - 1.2f : -(LIB_BAND - 1.2f);
            n = emit(x, y, P_LIGHT, tx0, ty0, tx1, ty1, xs, ys, kinds, n);
        }
        return n;
    }

    // ------------------------------------------------------------------ queries

    /** Footprint radius (world units) of a prop kind. */
    public static float propRadius(int kind) {
        return PROP_R[kind];
    }

    /** True where something big stands (a prop or wall): destructibles are never placed there. Sim thread only. */
    public boolean blocked(float wx, float wy) {
        float tx = wx / TILE, ty = wy / TILE;
        int x0 = floorI(tx) - 3, x1 = floorI(tx) + 3, y0 = floorI(ty) - 3, y1 = floorI(ty) + 3;
        int n = props(x0, y0, x1, y1, sx, sy, sk);
        for (int i = 0; i < n; i++) {
            float dx = (sx[i] - tx) * TILE, dy = (sy[i] - ty) * TILE, r = PROP_R[sk[i]] + 14f;
            // walls are wide: test against the box they cover instead of a circle
            if (sk[i] == P_WALL || sk[i] == P_SEGMENT || sk[i] == P_CATWALK) {
                if (Math.abs(dx) < 80f + 14f && dy > -22f - 14f && dy < 90f + 14f) return true;
            } else if (dx * dx + dy * dy < r * r) {
                return true;
            }
        }
        return false;
    }
}
