package se.felixarvid.thorsurvivors.game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** The stage layout is a pure function of the tile: stable, owned by exactly one chunk, clear at the start. */
public class WorldGenTest {
    private final WorldGen flats = WorldGen.of("FOREST"), mines = WorldGen.of("LIBRARY");
    private final float[] xs = new float[WorldGen.MAX_LIST], ys = new float[WorldGen.MAX_LIST];
    private final int[] ks = new int[WorldGen.MAX_LIST];

    @Test
    public void generationIsDeterministic() {
        for (WorldGen g : new WorldGen[]{flats, mines}) {
            float[] x2 = new float[64], y2 = new float[64];
            int[] k2 = new int[64];
            float[] x1 = new float[64], y1 = new float[64];
            int[] k1 = new int[64];
            int n1 = g.props(3, -2, 18, 9, x1, y1, k1), n2 = g.props(3, -2, 18, 9, x2, y2, k2);
            assertEquals(n1, n2);
            for (int i = 0; i < n1; i++) assertTrue(x1[i] == x2[i] && y1[i] == y2[i] && k1[i] == k2[i]);
            n1 = g.decals(-9, 4, 6, 12, x1, y1, k1);
            n2 = g.decals(-9, 4, 6, 12, x2, y2, k2);
            assertEquals(n1, n2);
            for (int i = 0; i < n1; i++) assertTrue(x1[i] == x2[i] && y1[i] == y2[i] && k1[i] == k2[i]);
        }
    }

    /** Splitting a window in two lists every prop and decal exactly once: a chunk border never loses or duplicates one. */
    @Test
    public void everyPropAndDecalBelongsToExactlyOneChunk() {
        for (WorldGen g : new WorldGen[]{flats, mines}) {
            for (int cy = -3; cy < 3; cy++) {
                for (int cx = -3; cx < 3; cx++) {
                    int x0 = cx * WorldGen.CHUNK, y0 = cy * WorldGen.CHUNK, e = WorldGen.CHUNK;
                    int whole = g.props(x0, y0, x0 + 2 * e - 1, y0 + e - 1, xs, ys, ks);
                    int a = g.props(x0, y0, x0 + e - 1, y0 + e - 1, xs, ys, ks);
                    int b = g.props(x0 + e, y0, x0 + 2 * e - 1, y0 + e - 1, xs, ys, ks);
                    assertEquals("props " + cx + "," + cy, whole, a + b);
                    whole = g.decals(x0, y0, x0 + 2 * e - 1, y0 + e - 1, xs, ys, ks);
                    a = g.decals(x0, y0, x0 + e - 1, y0 + e - 1, xs, ys, ks);
                    b = g.decals(x0 + e, y0, x0 + 2 * e - 1, y0 + e - 1, xs, ys, ks);
                    assertEquals("decals " + cx + "," + cy, whole, a + b);
                }
            }
        }
    }

    @Test
    public void theStartAreaIsClear() {
        for (WorldGen g : new WorldGen[]{flats, mines}) {
            int n = g.props(-16, -16, 15, 15, xs, ys, ks);
            for (int i = 0; i < n; i++) {
                assertTrue("prop " + WorldGen.PROP[ks[i]] + " at " + xs[i] + "," + ys[i], Math.hypot(xs[i], ys[i]) >= 4.0);
            }
            assertFalse("spawn is free", g.blocked(0, 0));
            assertFalse(g.blocked(60, 40));
        }
        assertFalse(WorldGen.clumpAllowed(0, 0));
        assertFalse(WorldGen.clumpAllowed(200, 50));
        assertTrue(WorldGen.clumpAllowed(400, 0));
        // the flats keep the whole spawn disc free of junk and rock, only a light post may stand closer than CLEAR
        int n = flats.props(-16, -16, 15, 15, xs, ys, ks);
        for (int i = 0; i < n; i++) if (ks[i] != WorldGen.P_LIGHT) assertTrue(Math.hypot(xs[i], ys[i]) >= WorldGen.CLEAR);
    }

    @Test
    public void densityIsFullButReadable() {
        for (WorldGen g : new WorldGen[]{flats, mines}) {
            int tiles = 0, props = 0, decals = 0, lights = 0;
            for (int cy = -10; cy < 10; cy++) {
                for (int cx = -10; cx < 10; cx++) {
                    int x0 = cx * WorldGen.CHUNK, y0 = cy * WorldGen.CHUNK, e = WorldGen.CHUNK;
                    tiles += e * e;
                    int n = g.props(x0, y0, x0 + e - 1, y0 + e - 1, xs, ys, ks);
                    props += n;
                    for (int i = 0; i < n; i++) if (ks[i] == WorldGen.P_LIGHT) lights++;
                    decals += g.decals(x0, y0, x0 + e - 1, y0 + e - 1, xs, ys, ks);
                }
            }
            double p = props / (double) tiles, d = decals / (double) tiles;
            System.out.printf("WORLDGEN %s props/tile=%.4f decals/tile=%.4f lights=%d%n", g.mines ? "mines" : "flats", p, d, lights);
            // a 24 x 13.5 tile view: 10..70 props and 20..90 decals, inside the design caps (60 props, 120 decals)
            assertTrue("props " + p, p > 0.025 && p < 0.22);
            assertTrue("decals " + d, d > 0.06 && d < 0.30);
            assertTrue("emergency lights exist: " + lights, lights > 8);
        }
    }

    @Test
    public void minesHaveWallRowsWithAFreeLane() {
        int walls = 0;
        boolean gap = false;
        for (int g = 0; g < 3; g++) {
            int slots = 0;
            for (int x0 = -200; x0 < 200; x0 += 20) {
                int n = mines.props(x0, 6 + g * 7 - 1, x0 + 19, 6 + g * 7 + 4, xs, ys, ks);
                for (int i = 0; i < n; i++) {
                    if (ks[i] == WorldGen.P_WALL || ks[i] == WorldGen.P_SEGMENT || ks[i] == WorldGen.P_CATWALK || ks[i] == WorldGen.P_SLAG || ks[i] == WorldGen.P_PIPES) {
                        slots++;
                        assertTrue("wall below the lane edge: y=" + ys[i], ys[i] >= 6f);
                    }
                }
            }
            walls += slots;
            gap |= slots < 133; // 400 tiles / 3 = 133 slots per row: fewer means breaks exist
        }
        assertTrue("wall pieces " + walls, walls > 150);
        assertTrue("rows have breaks", gap);
        int n = mines.props(-100, -5, 100, 5, xs, ys, ks); // the lane itself: only the light posts at its edges
        for (int i = 0; i < n; i++) assertTrue(WorldGen.PROP[ks[i]], ks[i] == WorldGen.P_LIGHT || ks[i] == WorldGen.P_STACK);
    }

    @Test
    public void blockedFollowsTheProps() {
        int n = flats.props(20, 20, 40, 40, xs, ys, ks);
        assertTrue(n > 5);
        for (int i = 0; i < n; i++) {
            if (ks[i] == WorldGen.P_LIGHT) continue;
            assertTrue(WorldGen.PROP[ks[i]], flats.blocked(xs[i] * WorldGen.TILE, ys[i] * WorldGen.TILE - 1f));
        }
    }

    @Test
    public void decalKindsAreValid() {
        int n = flats.decals(-30, -30, 30, 30, xs, ys, ks);
        boolean[] seen = new boolean[WorldGen.DECAL.length];
        for (int i = 0; i < n; i++) {
            assertTrue((ks[i] & 255) < WorldGen.DECAL.length);
            seen[ks[i] & 255] = true;
        }
        int distinct = 0;
        for (boolean b : seen) if (b) distinct++;
        assertTrue("variety " + distinct, distinct >= 8);
    }
}
