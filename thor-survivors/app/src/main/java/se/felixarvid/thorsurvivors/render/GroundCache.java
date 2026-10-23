package se.felixarvid.thorsurvivors.render;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;

import se.felixarvid.thorsurvivors.game.WorldGen;
import se.felixarvid.thorsurvivors.render.SpriteAtlas.Sprite;

import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/**
 * The ground of the stage as a small LRU of pre-rendered chunk bitmaps ({@link WorldGen#CHUNK} x CHUNK tiles each,
 * 640 px square at 1080p). A chunk is baked from the pure functions in {@link WorldGen}: floor, dirt autotile, flowers,
 * flat objects, and the dense forest clumps painted back to front. Trees reach over a chunk border, so a chunk also
 * paints the trees (and flat objects) of its neighbours that overlap it; that is what makes the borders seamless.
 *
 * Chunks in view are baked on the spot if missing (start, stage change, a teleport); the ring of half a chunk around the
 * view is prefetched on one background thread, one chunk at a time, so walking onto new ground never costs a frame.
 * Evicted bitmaps are reused, so steady state allocates nothing per frame.
 *
 * The scattered single trees and bushes are not baked: each chunk only lists them, and the renderer y-sorts them
 * with the creatures.
 */
final class GroundCache {
    static final int CAP = 24, MAX_PROPS = 48;
    private static final int FREE = 0, BUILDING = 1, READY = 2;

    static final class Chunk implements Runnable {
        int cx, cy, gen;
        volatile int state = FREE;
        long stamp;
        Bitmap bm;
        Canvas canvas;
        int propN;
        final float[] px = new float[MAX_PROPS], py = new float[MAX_PROPS];
        final int[] pk = new int[MAX_PROPS];
        GroundCache owner;

        /** Worker-thread entry: bakes this chunk with the worker's own scratch. */
        @Override
        public void run() {
            owner.finish(this, owner.workerBaker);
        }
    }

    /** One baking context (paint and scratch lists), so the render thread and the worker never share state. */
    private static final class Baker {
        final Paint paint = new Paint();
        final float[] tx = new float[WorldGen.MAX_LIST], ty = new float[WorldGen.MAX_LIST];
        final int[] tk = new int[WorldGen.MAX_LIST];

        Baker() {
            paint.setAntiAlias(false);
            paint.setFilterBitmap(false);
            paint.setDither(false);
        }
    }

    private final SpriteAtlas atlas = SpriteAtlas.get();
    private final Chunk[] pool = new Chunk[CAP];
    private final Baker mainBaker = new Baker(), workerBaker = new Baker();
    private final Object lock = new Object();
    private ThreadPoolExecutor worker;
    private volatile WorldGen gen;
    private volatile Sprite tile;
    private volatile int k, size, chunkPx;
    private volatile int generation;
    private long frame;
    private volatile boolean busy; // a chunk is being baked on the worker

    /** Tests: bake prefetched chunks on the calling thread instead, for deterministic counts. */
    boolean async = true;

    /** Chunks wanted this frame (view plus margin) that are baked: the renderer reads their props. */
    final Chunk[] wanted = new Chunk[CAP + 8];
    int wantedN;

    // stats for tests and the perf notes
    int builds;
    double buildMsTotal, buildMsMax;

    GroundCache() {
        for (int i = 0; i < CAP; i++) {
            pool[i] = new Chunk();
            pool[i].owner = this;
        }
    }

    /** Tile size in px (16 * k); chunks are dropped when the stage or the scale changes. */
    void setup(WorldGen g, Sprite t, int scale) {
        if (g == gen && t == tile && scale == k) return;
        synchronized (lock) {
            generation++; // a build in flight finishes into the old generation and is discarded
            gen = g;
            tile = t;
            k = scale;
            size = 16 * scale;
            chunkPx = size * WorldGen.CHUNK;
            for (Chunk c : pool) if (c.state != BUILDING) c.state = FREE;
        }
    }

    int tilePx() {
        return size;
    }

    int chunkPx() {
        return chunkPx;
    }

    private Chunk find(int cx, int cy) {
        for (Chunk c : pool) if (c.state != FREE && c.cx == cx && c.cy == cy) return c;
        return null;
    }

    /** The built chunk at (cx, cy) or null (test hook). */
    Chunk peek(int cx, int cy) {
        Chunk c = find(cx, cy);
        return c != null && c.state == READY ? c : null;
    }

    /** Draws everything in view; ox/oy is the screen position of tile (0,0), cam* the camera in px. */
    void draw(Canvas c, Paint p, int ox, int oy, int camPx, int camPy, int w, int h) {
        frame++;
        wantedN = 0;
        int chunkPx = this.chunkPx;
        int marginPx = chunkPx / 2;
        int cx0 = Math.floorDiv(camPx - w / 2 - marginPx, chunkPx), cx1 = Math.floorDiv(camPx + w / 2 + marginPx, chunkPx);
        int cy0 = Math.floorDiv(camPy - h / 2 - marginPx, chunkPx), cy1 = Math.floorDiv(camPy + h / 2 + marginPx, chunkPx);
        int vx0 = Math.floorDiv(camPx - w / 2, chunkPx), vx1 = Math.floorDiv(camPx + w / 2, chunkPx);
        int vy0 = Math.floorDiv(camPy - h / 2, chunkPx), vy1 = Math.floorDiv(camPy + h / 2, chunkPx);
        int missX = 0, missY = 0;
        boolean missing = false;
        for (int cy = cy0; cy <= cy1; cy++) {
            for (int cx = cx0; cx <= cx1; cx++) {
                boolean visible = cx >= vx0 && cx <= vx1 && cy >= vy0 && cy <= vy1;
                Chunk ch = find(cx, cy);
                if (ch == null) {
                    if (!visible) {
                        if (!missing) {
                            missing = true;
                            missX = cx;
                            missY = cy;
                        }
                        continue;
                    }
                    ch = buildNow(cx, cy);
                } else if (ch.state == BUILDING) {
                    if (!visible) {
                        ch.stamp = frame;
                        continue;
                    }
                    await(ch);
                }
                ch.stamp = frame;
                if (wantedN < wanted.length) wanted[wantedN++] = ch;
                if (visible) c.drawBitmap(ch.bm, cx * chunkPx + ox, cy * chunkPx + oy, p);
            }
        }
        if (missing && !busy) prefetch(missX, missY); // one at a time, only into a slot nobody wants right now
    }

    private void await(Chunk ch) {
        synchronized (lock) {
            while (ch.state == BUILDING) {
                try {
                    lock.wait();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        }
    }

    /** An evictable slot: free, else the least recently wanted one that is not wanted this frame (null if none). */
    private Chunk victim(boolean mayTakeWanted) {
        Chunk v = null;
        for (Chunk c : pool) {
            if (c.state == BUILDING) continue;
            if (c.state == FREE) return c;
            if (!mayTakeWanted && c.stamp >= frame) continue;
            if (v == null || c.stamp < v.stamp) v = c;
        }
        return v;
    }

    private Chunk buildNow(int cx, int cy) {
        Chunk v = victim(true);
        if (v == null) { // every slot is in flight or wanted: wait for the worker, then take its slot
            synchronized (lock) {
                while (busy) {
                    try {
                        lock.wait();
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                }
            }
            v = victim(true);
        }
        claim(v, cx, cy);
        finish(v, mainBaker);
        return v;
    }

    private void claim(Chunk v, int cx, int cy) {
        synchronized (lock) {
            v.state = BUILDING;
            v.cx = cx;
            v.cy = cy;
            v.gen = generation;
        }
    }

    private void prefetch(int cx, int cy) {
        Chunk v = victim(false);
        if (v == null) return;
        claim(v, cx, cy);
        if (!async) {
            finish(v, mainBaker);
            v.stamp = frame;
            if (wantedN < wanted.length) wanted[wantedN++] = v;
            return;
        }
        busy = true;
        if (worker == null) {
            worker = new ThreadPoolExecutor(0, 1, 3, TimeUnit.SECONDS, new LinkedBlockingQueue<Runnable>(), new ThreadFactory() {
                @Override
                public Thread newThread(Runnable r) {
                    Thread t = new Thread(r, "ground-chunks");
                    t.setDaemon(true);
                    t.setPriority(Thread.NORM_PRIORITY - 1);
                    return t;
                }
            });
        }
        v.stamp = frame; // not a candidate for eviction right away
        worker.execute(v);
    }

    /** Bakes a claimed chunk and publishes it (or drops it when the stage changed meanwhile). */
    private void finish(Chunk v, Baker b) {
        long t0 = System.nanoTime();
        int cp = chunkPx, myGen;
        WorldGen g;
        Sprite t;
        int scale;
        synchronized (lock) {
            myGen = v.gen;
            g = gen;
            t = tile;
            scale = k;
            cp = chunkPx;
        }
        boolean current = myGen == generation;
        if (current) {
            if (v.bm == null || v.bm.getWidth() != cp) {
                v.bm = Bitmap.createBitmap(cp, cp, Bitmap.Config.ARGB_8888);
                v.canvas = new Canvas(v.bm);
            }
            bake(b, v.canvas, g, t, scale, v.cx * WorldGen.CHUNK, v.cy * WorldGen.CHUNK, WorldGen.CHUNK, WorldGen.CHUNK);
            v.propN = g.props(v.cx, v.cy, v.px, v.py, v.pk);
        }
        double ms = (System.nanoTime() - t0) / 1e6;
        synchronized (lock) {
            v.state = current && myGen == generation ? READY : FREE;
            if (b == workerBaker) busy = false;
            builds++;
            buildMsTotal += ms;
            buildMsMax = Math.max(buildMsMax, ms);
            lock.notifyAll();
        }
    }

    /** Test hook: bakes the chunk at (cx, cy) into the cache and returns its bitmap. */
    Bitmap chunkBitmap(int cx, int cy) {
        Chunk ch = find(cx, cy);
        if (ch != null && ch.state == BUILDING) await(ch);
        return (ch != null && ch.state == READY ? ch : buildNow(cx, cy)).bm;
    }

    /** Test hook: bakes a window of tiles (w x h starting at tile x0,y0) onto the canvas, origin at its top-left. */
    void bake(Canvas c, int x0, int y0, int w, int h) {
        bake(mainBaker, c, gen, tile, k, x0, y0, w, h);
    }

    private void bake(Baker b, Canvas c, WorldGen gen, Sprite tile, int k, int x0, int y0, int w, int h) {
        final int T = 16 * k;
        final Paint paint = b.paint;
        for (int j = 0; j < h; j++) {
            for (int i = 0; i < w; i++) {
                int code = gen.ground(x0 + i, y0 + j);
                Bitmap bm;
                if (code >= WorldGen.G_DIRT) bm = atlas.ground(tile, code - WorldGen.G_DIRT, k);
                else if (code == WorldGen.G_PEBBLE) bm = atlas.ground(tile, WorldGen.PEBBLE_PIECE, k);
                else bm = atlas.bitmap(tile, Math.min(code, tile.base.length - 1), k, SpriteAtlas.T_NORMAL, false);
                c.drawBitmap(bm, i * T, j * T, paint);
            }
        }
        for (int j = -1; j <= h; j++) { // one tile of margin: a jittered object of the next chunk can reach over the border
            for (int i = -1; i <= w; i++) {
                int o = gen.object(x0 + i, y0 + j);
                if (o < 0 || o >= tile.decor.length) continue;
                int jx = Math.round(gen.jitterX(x0 + i, y0 + j) * 16f) * k, jy = Math.round(gen.jitterY(x0 + i, y0 + j) * 16f) * k;
                c.drawBitmap(atlas.decor(tile, o, k), i * T + jx, j * T + jy, paint);
            }
        }
        int n = gen.clumpTrees(x0, y0, x0 + w - 1, y0 + h - 1, b.tx, b.ty, b.tk);
        for (int i = 0; i < n; i++) {
            if (b.tk[i] >= tile.decor.length) continue;
            // snapped to the art pixel grid so every tree is an exact integer-scaled copy
            int left = Math.round((b.tx[i] - x0) * 16f - 8f) * k, top = Math.round((b.ty[i] - y0) * 16f - 8f) * k;
            c.drawBitmap(atlas.decor(tile, b.tk[i], k), left, top, paint);
        }
    }
}
