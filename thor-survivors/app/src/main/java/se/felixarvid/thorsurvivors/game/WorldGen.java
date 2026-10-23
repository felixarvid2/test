package se.felixarvid.thorsurvivors.game;

/**
 * Deterministic, infinite stage layout: a pure function of the tile coordinates, so any chunk can be generated on
 * its own and two chunks agree on what lies across their shared border. No android imports, no state, no allocation
 * (callers pass the arrays that receive lists).
 *
 * Everything is in tile units (one tile = 16 art pixels = {@link #TILE} world units at 1080p). Forest:
 * <ul>
 * <li>dense forest clumps: staggered whole trees (autumn clumps among the green ones) where low-frequency noise is
 * high, soft bushes along their rim, never within {@link #CLEAR} tiles of the spawn;</li>
 * <li>dirt paths and clearings on a 2x2-tile block grid, drawn with the Tiny Town dirt autotile (edges + inner corners);</li>
 * <li>flower meadows (noise-clustered), tufts, pebbles, flat mushrooms and sprouts;</li>
 * <li>scattered single trees and bushes that the renderer y-sorts with the creatures.</li>
 * </ul>
 * Library: long double rows of bookshelves above and below a clear central band, with breaks, tables, barrels and stools.
 * Nothing collides.
 */
public final class WorldGen {
    /** World units per tile at 1080p (16 px x 5, 1.9286 px per unit). */
    public static final float TILE = 41.5f;
    /** Tiles per chunk edge. */
    public static final int CHUNK = 8;
    /** No clump, shelf row or dirt-free obstacle inside this many tiles (~300 u) of the spawn point (0, 0). */
    public static final float CLEAR = 7.3f;
    /** No scattered single tree or bush inside this many tiles (~170 u) of the spawn. */
    public static final float SCATTER_CLEAR = 4.1f;
    /** Largest number of entries one list call can return. */
    public static final int MAX_LIST = 512;

    // ground codes (see WorldGen.ground)
    public static final int G_GRASS = 0, G_TUFT = 1, G_FLOWER = 2, G_PEBBLE = 3, G_DIRT = 16;
    // dirt piece offsets from G_DIRT: 0..8 = TL T TR / L C R / BL B BR, then inner corners
    public static final int DIRT_C = 4, DIRT_IN_TL = 9, DIRT_IN_TR = 10, DIRT_IN_BR = 11, DIRT_IN_BL = 12;
    // decor indices (atlas "decor" lists, see tools/build_atlas.py)
    public static final int D_TREE_AUTUMN = 0, D_TREE = 1, D_BUSH = 2, D_MUSHROOM = 3, D_SPROUT = 4;
    public static final int L_SHELF_A = 0, L_SHELF_B = 1, L_TABLE = 2, L_BARREL = 3, L_STOOL = 4;
    /** ground index (in the atlas "ground" list) of the pebble tile */
    public static final int PEBBLE_PIECE = 13;

    /** Forest clump density threshold, rows and columns of the staggered tree lattice (tile units). */
    private static final float CLUMP_THR = 0.645f, LAT_DX = 0.85f, LAT_DY = 0.70f;
    private static final int LIB_BAND = 6, LIB_PERIOD = 7, LIB_CELL = 22;

    public final boolean library;
    private static final WorldGen FOREST = new WorldGen(false), LIBRARY = new WorldGen(true);

    private WorldGen(boolean library) {
        this.library = library;
    }

    public static WorldGen of(String stageKey) {
        return "LIBRARY".equals(stageKey) ? LIBRARY : FOREST;
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

    /** Within r tiles of the spawn point (the corner shared by tiles -1..0), for a position in tile units. */
    private static boolean nearSpawn(float x, float y, float r) {
        return x * x + y * y < r * r;
    }

    /** Same for a whole tile, measured from its centre. */
    private static boolean nearTile(int tx, int ty, float r) {
        return nearSpawn(tx + 0.5f, ty + 0.5f, r);
    }

    /** False inside the spawn clearing (in world units): clumps, shelves and trees never go here. */
    public static boolean clumpAllowed(float wx, float wy) {
        return wx * wx + wy * wy >= (CLEAR * TILE) * (CLEAR * TILE);
    }

    // ------------------------------------------------------------------ forest fields

    /** Forest density at a (fractional) tile position; clumps are where it exceeds {@link #CLUMP_THR}. */
    float forestField(float tx, float ty) {
        return 0.58f * noise(101, tx / 8f, ty / 8f) + 0.42f * noise(102, tx / 3.6f, ty / 3.6f);
    }

    /** True where the lattice would grow trees (before the dirt and spawn checks). */
    public boolean inClump(float tx, float ty) {
        return !library && !nearSpawn(tx, ty, CLEAR) && forestField(tx, ty) > CLUMP_THR && !dirtTile(floorI(tx), floorI(ty));
    }

    private boolean autumnAt(float tx, float ty) {
        return noise(103, tx / 13f, ty / 13f) > 0.60f;
    }

    private float meadow(int tx, int ty) {
        return 0.7f * noise(104, tx / 6f, ty / 6f) + 0.3f * noise(105, tx / 2.5f, ty / 2.5f);
    }

    private static int floorI(float v) {
        return (int) Math.floor(v);
    }

    // ------------------------------------------------------------------ dirt (2x2-tile blocks)

    private boolean dirtRaw(int bx, int by) {
        float n1 = noise(111, bx / 6.5f, by / 6.5f), n2 = noise(112, bx / 8f + 40f, by / 8f);
        if (Math.abs(n1 - 0.5f) < 0.011f || Math.abs(n2 - 0.5f) < 0.006f) return true; // meandering paths
        return noise(113, bx / 4.5f, by / 4.5f) > 0.82f; // clearings
    }

    private boolean dirtBlock(int bx, int by) {
        if (library || !dirtRaw(bx, by)) return false;
        // no 1-block specks: every dirt block touches another one, so 2-wide minimum for the autotile
        return dirtRaw(bx - 1, by) || dirtRaw(bx + 1, by) || dirtRaw(bx, by - 1) || dirtRaw(bx, by + 1);
    }

    public boolean dirtTile(int tx, int ty) {
        return dirtBlock(Math.floorDiv(tx, 2), Math.floorDiv(ty, 2));
    }

    /** Dirt autotile piece at a dirt tile (offset from {@link #G_DIRT}): edges by cardinal neighbours, inner corners by diagonals. */
    private int dirtPiece(int tx, int ty) {
        boolean n = dirtTile(tx, ty - 1), s = dirtTile(tx, ty + 1), w = dirtTile(tx - 1, ty), e = dirtTile(tx + 1, ty);
        if (!n && !w) return 0;
        if (!n && !e) return 2;
        if (!s && !w) return 6;
        if (!s && !e) return 8;
        if (!n) return 1;
        if (!s) return 7;
        if (!w) return 3;
        if (!e) return 5;
        if (!dirtTile(tx - 1, ty - 1)) return DIRT_IN_TL;
        if (!dirtTile(tx + 1, ty - 1)) return DIRT_IN_TR;
        if (!dirtTile(tx + 1, ty + 1)) return DIRT_IN_BR;
        if (!dirtTile(tx - 1, ty + 1)) return DIRT_IN_BL;
        return DIRT_C;
    }

    // ------------------------------------------------------------------ ground layer

    /**
     * What fills the floor of a tile: 0..2 the atlas base frames (forest grass / tufts / flowers; library floor
     * variants), {@link #G_PEBBLE}, or {@code G_DIRT + piece}.
     */
    public int ground(int tx, int ty) {
        float r = rnd(tx, ty, 11);
        if (library) return r < 0.05f ? 1 : r < 0.065f ? 2 : 0;
        if (dirtTile(tx, ty)) return G_DIRT + dirtPiece(tx, ty);
        float m = meadow(tx, ty);
        if (m > 0.60f) return r < 0.50f ? G_FLOWER : r < 0.78f ? G_TUFT : G_GRASS; // a flower meadow
        if (m > 0.50f && r < 0.22f) return G_TUFT; // tufts thicken toward meadows
        if (r < 0.012f) return G_FLOWER;
        if (r < 0.085f) return G_TUFT;
        if (r < 0.093f) return G_PEBBLE;
        return G_GRASS;
    }

    /**
     * Flat object lying on the tile (drawn into the ground bitmap, under the trees): forest mushrooms and sprouts,
     * library shelves, tables, barrels, stools. -1 for none. Pixel jitter inside the tile: see {@link #jitterX}.
     */
    public int object(int tx, int ty) {
        if (library) return libraryObject(tx, ty);
        if (dirtTile(tx, ty) || nearTile(tx, ty, SCATTER_CLEAR)) return -1;
        float r = rnd(tx, ty, 21);
        if (r < 0.014f) return D_MUSHROOM;
        if (r < 0.026f) return D_SPROUT;
        return -1;
    }

    /** Jitter of a flat object inside its tile, in tile fractions (-0.3..0.3). Libraries do not jitter. */
    public float jitterX(int tx, int ty) {
        return library ? 0f : (rnd(tx, ty, 22) - 0.5f) * 0.6f;
    }

    public float jitterY(int tx, int ty) {
        return library ? 0f : (rnd(tx, ty, 23) - 0.5f) * 0.6f;
    }

    // ------------------------------------------------------------------ forest: clump trees

    /**
     * Trees and bushes of the dense clumps whose centre lies in [tx0-1, tx1+1] x [ty0-1, ty1+1], sorted by y (rows
     * of a staggered lattice, so painting them in order is correct depth order). Positions in tile units; kind is a
     * forest decor index. Returns the count (at most the array length).
     */
    public int clumpTrees(int tx0, int ty0, int tx1, int ty1, float[] xs, float[] ys, int[] kinds) {
        if (library) return 0;
        int n = 0;
        int r0 = floorI((ty0 - 1) / LAT_DY) - 1, r1 = floorI((ty1 + 2) / LAT_DY) + 1;
        for (int row = r0; row <= r1 && n < xs.length; row++) {
            float stagger = (row & 1) == 0 ? 0f : 0.5f;
            int c0 = floorI((tx0 - 1) / LAT_DX) - 1, c1 = floorI((tx1 + 2) / LAT_DX) + 1;
            for (int col = c0; col <= c1 && n < xs.length; col++) {
                float x = (col + stagger) * LAT_DX + (rnd(col, row, 31) - 0.5f) * 0.26f;
                float y = row * LAT_DY + (rnd(col, row, 32) - 0.5f) * 0.14f;
                if (x < tx0 - 1 || x >= tx1 + 2 || y < ty0 - 1 || y >= ty1 + 2) continue;
                if (nearSpawn(x, y, CLEAR) || dirtTile(floorI(x), floorI(y))) continue;
                float f = forestField(x, y);
                float edge = CLUMP_THR + (rnd(col, row, 33) - 0.5f) * 0.05f; // ragged rim
                int kind;
                if (f > edge) {
                    if (rnd(col, row, 34) < 0.04f) continue; // a few gaps
                    boolean autumn = autumnAt(x, y);
                    if (rnd(col, row, 35) < 0.06f) autumn = !autumn; // the odd tree of the other colour
                    kind = autumn ? D_TREE_AUTUMN : D_TREE;
                } else if (f > edge - 0.05f && rnd(col, row, 36) < 0.40f) {
                    kind = D_BUSH; // a soft rim
                } else {
                    continue;
                }
                xs[n] = x;
                ys[n] = y;
                kinds[n++] = kind;
            }
        }
        return n;
    }

    // ------------------------------------------------------------------ forest: scattered y-sorted props

    /**
     * Single trees and bushes of chunk (cx, cy), world-stable: each belongs to the chunk of its tile. Positions in
     * tile units (jittered inside +-0.4 of the tile centre). Returns the count.
     */
    public int props(int cx, int cy, float[] xs, float[] ys, int[] kinds) {
        if (library) return 0;
        int n = 0;
        for (int j = 0; j < CHUNK; j++) {
            for (int i = 0; i < CHUNK; i++) {
                int tx = cx * CHUNK + i, ty = cy * CHUNK + j;
                if (n >= xs.length || nearTile(tx, ty, SCATTER_CLEAR) || dirtTile(tx, ty)) continue;
                float f = forestField(tx + 0.5f, ty + 0.5f);
                if (f > CLUMP_THR - 0.08f) continue; // the clumps (and their rim) are ground
                float g = 0.35f + 1.9f * noise(121, tx / 8f, ty / 8f); // groves: sparse here, busy there
                float r = rnd(tx, ty, 41);
                int kind;
                if (r < 0.045f * g) kind = rnd(tx, ty, 42) < 0.4f ? D_TREE_AUTUMN : D_TREE;
                else if (r < 0.080f * g) kind = D_BUSH;
                else continue;
                xs[n] = tx + 0.5f + (rnd(tx, ty, 43) - 0.5f) * 0.8f;
                ys[n] = ty + 0.5f + (rnd(tx, ty, 44) - 0.5f) * 0.8f;
                kinds[n++] = kind;
            }
        }
        return n;
    }

    // ------------------------------------------------------------------ library

    /** Shelf row inside the rows, or -1: long double rows (A above B) above and below the central band, with breaks. */
    private int shelfAt(int tx, int ty) {
        int a = ty < 0 ? -ty - 1 : ty; // distance from the central axis, same on both sides
        if (a < LIB_BAND) return -1;
        int m = (a - LIB_BAND) % LIB_PERIOD, g = (a - LIB_BAND) / LIB_PERIOD;
        if (m > 1) return -1;
        if (nearTile(tx, ty, CLEAR)) return -1;
        return inBreak(tx, g, ty < 0 ? 1 : 0) ? -1 : (m == 0 ? L_SHELF_A : L_SHELF_B);
    }

    /** One break (a 2-3 tile passage) per {@link #LIB_CELL} tiles of a row pair, at a hashed spot. */
    private boolean inBreak(int tx, int group, int side) {
        int c = Math.floorDiv(tx, LIB_CELL);
        int h = hash(c, group * 2 + side, 51);
        int start = c * LIB_CELL + 3 + ((h >>> 4) & 255) % (LIB_CELL - 8);
        int len = 2 + ((h >>> 14) & 1);
        return tx >= start && tx < start + len;
    }

    private int libraryObject(int tx, int ty) {
        int s = shelfAt(tx, ty);
        if (s >= 0) return s;
        int a = ty < 0 ? -ty - 1 : ty;
        if (nearTile(tx, ty, CLEAR)) return -1;
        float r = rnd(tx, ty, 52);
        if (a >= LIB_BAND && (a - LIB_BAND) % LIB_PERIOD <= 1) { // inside a break: the odd table or barrel
            if ((a - LIB_BAND) % LIB_PERIOD == 0) return r < 0.20f ? L_TABLE : r < 0.32f ? L_BARREL : -1;
            return -1;
        }
        if (r < 0.007f) return L_TABLE;
        if (r < 0.013f) return L_BARREL;
        if (r < 0.017f) return L_STOOL;
        return -1;
    }

    /** True where something big stands (a clump tree, a shelf, a table): destructibles are never placed there. */
    public boolean blocked(float wx, float wy) {
        int tx = floorI(wx / TILE), ty = floorI(wy / TILE);
        if (library) return libraryObject(tx, ty) >= 0;
        return forestField(wx / TILE, wy / TILE) > CLUMP_THR - 0.08f;
    }
}
