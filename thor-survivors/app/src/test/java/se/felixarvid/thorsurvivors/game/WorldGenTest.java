package se.felixarvid.thorsurvivors.game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** The stage layout is a pure function of the tile: stable, seamless across chunk borders, clear at the start. */
public class WorldGenTest {
    private final WorldGen forest = WorldGen.of("FOREST"), library = WorldGen.of("LIBRARY");

    private static boolean isRightEdge(int piece) {
        return piece == 2 || piece == 5 || piece == 8;
    }

    private static boolean isLeftEdge(int piece) {
        return piece == 0 || piece == 3 || piece == 6;
    }

    private static boolean isBottomEdge(int piece) {
        return piece == 6 || piece == 7 || piece == 8;
    }

    private static boolean isTopEdge(int piece) {
        return piece == 0 || piece == 1 || piece == 2;
    }

    @Test
    public void generationIsDeterministic() {
        for (WorldGen g : new WorldGen[]{forest, library}) {
            for (int ty = -40; ty < 40; ty++) {
                for (int tx = -40; tx < 40; tx++) {
                    assertEquals(g.ground(tx, ty), g.ground(tx, ty));
                    assertEquals(g.object(tx, ty), g.object(tx, ty));
                }
            }
            float[] x1 = new float[64], y1 = new float[64], x2 = new float[64], y2 = new float[64];
            int[] k1 = new int[64], k2 = new int[64];
            int n1 = g.props(3, -2, x1, y1, k1), n2 = g.props(3, -2, x2, y2, k2);
            assertEquals(n1, n2);
            for (int i = 0; i < n1; i++) assertTrue(x1[i] == x2[i] && y1[i] == y2[i] && k1[i] == k2[i]);
        }
    }

    /** Where two neighbouring dirt tiles meet, neither draws an edge on the shared side (also across chunk borders). */
    @Test
    public void dirtAutotileEdgesMatchTheirNeighbours() {
        int pairs = 0, corners = 0;
        for (int ty = -120; ty < 120; ty++) {
            for (int tx = -120; tx < 120; tx++) {
                int a = forest.ground(tx, ty) - WorldGen.G_DIRT;
                if (a < 0) continue;
                int e = forest.ground(tx + 1, ty) - WorldGen.G_DIRT, s = forest.ground(tx, ty + 1) - WorldGen.G_DIRT;
                if (e >= 0) {
                    assertFalse("right edge against dirt at " + tx + "," + ty, isRightEdge(a));
                    assertFalse("left edge against dirt at " + (tx + 1) + "," + ty, isLeftEdge(e));
                    pairs++;
                } else {
                    assertTrue("no right edge at the rim " + tx + "," + ty, isRightEdge(a));
                }
                if (s >= 0) {
                    assertFalse(isBottomEdge(a));
                    assertFalse(isTopEdge(s));
                } else {
                    assertTrue("no bottom edge at the rim " + tx + "," + ty, isBottomEdge(a));
                }
                if (a >= WorldGen.DIRT_IN_TL) corners++;
            }
        }
        assertTrue("some dirt exists: " + pairs, pairs > 500);
        assertTrue("inner corners occur: " + corners, corners > 5);
        boolean crossesChunk = false; // a dirt run that spans a chunk border exists in the sampled area
        for (int ty = -120; ty < 120 && !crossesChunk; ty++) {
            for (int tx = -120; tx < 120; tx++) {
                if (Math.floorMod(tx, WorldGen.CHUNK) == WorldGen.CHUNK - 1 && forest.ground(tx, ty) >= WorldGen.G_DIRT
                        && forest.ground(tx + 1, ty) >= WorldGen.G_DIRT) {
                    crossesChunk = true;
                    break;
                }
            }
        }
        assertTrue(crossesChunk);
    }

    @Test
    public void noClumpWithinTheStartRadius() {
        float[] xs = new float[WorldGen.MAX_LIST], ys = new float[WorldGen.MAX_LIST];
        int[] ks = new int[WorldGen.MAX_LIST];
        int n = forest.clumpTrees(-12, -12, 11, 11, xs, ys, ks);
        for (int i = 0; i < n; i++) {
            assertTrue("tree at " + xs[i] + "," + ys[i], Math.hypot(xs[i], ys[i]) >= WorldGen.CLEAR);
        }
        for (int ty = -20; ty < 20; ty++) {
            for (int tx = -20; tx < 20; tx++) {
                float wx = (tx + 0.5f) * WorldGen.TILE, wy = (ty + 0.5f) * WorldGen.TILE;
                if (Math.hypot(wx, wy) < 300f) {
                    assertFalse("clump tile " + tx + "," + ty, forest.inClump(tx + 0.5f, ty + 0.5f));
                    assertTrue(forest.object(tx, ty) < 0 || forest.object(tx, ty) >= WorldGen.D_MUSHROOM);
                }
            }
        }
        for (int cy = -2; cy <= 1; cy++) {
            for (int cx = -2; cx <= 1; cx++) {
                int m = forest.props(cx, cy, xs, ys, ks);
                for (int i = 0; i < m; i++) assertTrue(Math.hypot(xs[i], ys[i]) >= WorldGen.SCATTER_CLEAR);
            }
        }
        // library: no shelf in the central band
        for (int tx = -30; tx < 30; tx++) for (int ty = -5; ty < 5; ty++) assertTrue(library.object(tx, ty) < WorldGen.L_SHELF_A || library.object(tx, ty) > WorldGen.L_SHELF_B);
    }

    @Test
    public void coverageFeelsFullButReadable() {
        int n = 0, clump = 0, dirt = 0, flowers = 0, props = 0;
        float[] xs = new float[64], ys = new float[64];
        int[] ks = new int[64];
        for (int ty = -150; ty < 150; ty++) {
            for (int tx = -150; tx < 150; tx++) {
                n++;
                if (forest.inClump(tx + 0.5f, ty + 0.5f)) clump++;
                int g = forest.ground(tx, ty);
                if (g >= WorldGen.G_DIRT) dirt++;
                if (g == WorldGen.G_FLOWER) flowers++;
            }
        }
        for (int cy = -19; cy < 19; cy++) for (int cx = -19; cx < 19; cx++) props += forest.props(cx, cy, xs, ys, ks);
        System.out.printf("WORLDGEN clump=%.3f dirt=%.3f flowers=%.3f props/tile=%.4f%n", clump / (double) n, dirt / (double) n,
                flowers / (double) n, props / (double) n);
        assertTrue("clump " + clump / (double) n, clump / (double) n > 0.08 && clump / (double) n < 0.28);
        assertTrue("dirt " + dirt / (double) n, dirt / (double) n > 0.03 && dirt / (double) n < 0.14);
        assertTrue("props", props / (double) n > 0.02 && props / (double) n < 0.12);
    }

    @Test
    public void libraryHasRowsWithBreaks() {
        int shelves = 0, breaks = 0;
        for (int ty = -40; ty < 40; ty++) {
            boolean row = false;
            for (int tx = -200; tx < 200; tx++) {
                int o = library.object(tx, ty);
                boolean shelf = o == WorldGen.L_SHELF_A || o == WorldGen.L_SHELF_B;
                if (shelf) {
                    shelves++;
                    row = true;
                } else if (row && Math.abs(ty) >= 6 && Math.abs(ty) <= 7 && !shelf) {
                    breaks++;
                }
            }
        }
        assertTrue("shelves " + shelves, shelves > 1500);
        assertTrue("breaks " + breaks, breaks > 20);
    }

    /** Dumps a map region as ASCII when you want to look at it: set WORLDGEN_DUMP=1. */
    @Test
    public void dumpForRegion() {
        if (System.getenv("WORLDGEN_DUMP") == null) return;
        StringBuilder sb = new StringBuilder();
        for (int ty = -30; ty < 30; ty++) {
            for (int tx = -60; tx < 60; tx++) {
                sb.append(forest.inClump(tx + 0.5f, ty + 0.5f) ? '#' : forest.ground(tx, ty) >= WorldGen.G_DIRT ? '=' : forest.ground(tx, ty) == WorldGen.G_FLOWER ? '*' : '.');
            }
            sb.append('\n');
        }
        System.out.println(sb);
    }
}
