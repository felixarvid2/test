package se.felixarvid.thorsurvivors.render;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.LightingColorFilter;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Rect;

import se.felixarvid.thorsurvivors.game.WorldGen;
import se.felixarvid.thorsurvivors.render.SpriteAtlas.Img;

import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/**
 * The ground of the stage as a small LRU of pre-rendered chunk bitmaps ({@link WorldGen#CHUNK} x CHUNK tiles each,
 * 640 px square at 1080p). A chunk is the mine-rock texture tiled by world pixel position (so every chunk border is
 * seamless), tinted per stage, a second flipped copy blended on top to hide the repeat, and the decals of the area
 * ({@link WorldGen#decals}): oil, blood, scorch, rubble, grates, bones, moss. Decals that reach over a border are painted
 * by both chunks.
 *
 * Chunks in view are baked on the spot if missing (start, stage change, a teleport); the ring of half a chunk around the
 * view is prefetched on one background thread, one chunk at a time, so walking onto new ground never costs a frame.
 * Evicted bitmaps are reused, so steady state allocates nothing per frame. Props are not baked: the renderer lists
 * them from {@link WorldGen#props} and y-sorts them with the creatures.
 */
final class GroundCache {
    static final int CAP = 24, MAX_DECALS = 160;
    private static final int FREE = 0, BUILDING = 1, READY = 2;

    static final class Chunk implements Runnable {
        int cx, cy, gen;
        volatile int state = FREE;
        long stamp;
        Bitmap bm;
        Canvas canvas;
        GroundCache owner;

        /** Worker-thread entry: bakes this chunk with the worker's own scratch. */
        @Override
        public void run() {
            owner.finish(this, owner.workerBaker);
        }
    }

    /** One baking context (paint and scratch lists), so the render thread and the worker never share state. */
    private static final class Baker {
        final Paint paint = new Paint(Paint.FILTER_BITMAP_FLAG), decalPaint = new Paint(Paint.FILTER_BITMAP_FLAG);
        final float[] dx = new float[MAX_DECALS], dy = new float[MAX_DECALS];
        final int[] dk = new int[MAX_DECALS];
        final Rect src = new Rect(), dst = new Rect();
        LightingColorFilter tintFilter;
        int tintFor;
    }

    private final SpriteAtlas atlas = SpriteAtlas.get();
    private final Chunk[] pool = new Chunk[CAP];
    private final Baker mainBaker = new Baker(), workerBaker = new Baker();
    private final Object lock = new Object();
    private ThreadPoolExecutor worker;
    private volatile WorldGen gen;
    private volatile Bitmap rock, rockFlip;
    private volatile int tint, size, chunkPx;
    private volatile String stageKey = "";
    private volatile int generation;
    private long frame;
    private volatile boolean busy; // a chunk is being baked on the worker

    /** Tests: bake prefetched chunks on the calling thread instead, for deterministic counts. */
    boolean async = true;


    // stats for tests and the perf notes
    int builds;
    double buildMsTotal, buildMsMax;

    GroundCache() {
        for (int i = 0; i < CAP; i++) {
            pool[i] = new Chunk();
            pool[i].owner = this;
        }
    }

    /** Tile size in px (80 at 1080p) and the multiply tint of the rock; chunks are dropped when any of it changes. */
    void setup(WorldGen g, String stage, int tilePx, int tintColor) {
        if (g == gen && tilePx == size && tintColor == tint && stage.equals(stageKey)) return;
        synchronized (lock) {
            generation++; // a build in flight finishes into the old generation and is discarded
            gen = g;
            stageKey = stage;
            tint = tintColor;
            size = tilePx;
            chunkPx = size * WorldGen.CHUNK;
            Bitmap r = atlas.groundTexture();
            if (r != rock) {
                rock = r;
                rockFlip = null;
                if (r != null) {
                    Matrix m = new Matrix();
                    m.setScale(-1f, -1f);
                    rockFlip = Bitmap.createBitmap(r, 0, 0, r.getWidth(), r.getHeight(), m, false);
                }
            }
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
        int cp, myGen;
        WorldGen g;
        Bitmap r, rf;
        int tn, tp;
        synchronized (lock) {
            myGen = v.gen;
            g = gen;
            r = rock;
            rf = rockFlip;
            tn = tint;
            tp = size;
            cp = chunkPx;
        }
        boolean current = myGen == generation;
        if (current) {
            if (v.bm == null || v.bm.getWidth() != cp) {
                v.bm = Bitmap.createBitmap(cp, cp, Bitmap.Config.ARGB_8888);
                v.canvas = new Canvas(v.bm);
            }
            bake(b, v.canvas, g, r, rf, tn, tp, v.cx * WorldGen.CHUNK, v.cy * WorldGen.CHUNK, WorldGen.CHUNK, WorldGen.CHUNK);
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
        bake(mainBaker, c, gen, rock, rockFlip, tint, size, x0, y0, w, h);
    }

    private void bake(Baker b, Canvas c, WorldGen gen, Bitmap rock, Bitmap flip, int tint, int T, int x0, int y0, int w, int h) {
        final float f = T / 80f;
        final int tex = Math.round(512 * f);
        final int wx = x0 * T, wy = y0 * T, pw = w * T, ph = h * T; // the window in world pixels
        if (rock == null) {
            c.drawColor(tint | 0xFF000000);
        } else {
            if (b.tintFilter == null || b.tintFor != tint) {
                b.tintFilter = new LightingColorFilter(tint | 0xFF000000, 0);
                b.tintFor = tint;
            }
            b.paint.setColorFilter(b.tintFilter);
            tile(c, b, rock, tex, wx, wy, pw, ph, 0, 0, 255);
            tile(c, b, flip, tex, wx, wy, pw, ph, 211, 137, 105); // breaks the 512 px repeat
            b.paint.setColorFilter(null);
        }
        int n = gen.decals(x0 - 2, y0 - 2, x0 + w + 1, y0 + h + 1, b.dx, b.dy, b.dk);
        b.decalPaint.setColorFilter(DECAL_TONE);
        for (int i = 0; i < n; i++) {
            Img im = decalImg(b.dk[i] & 255);
            if (im == null) continue;
            int cx = Math.round(b.dx[i] * T) - wx, cy = Math.round(b.dy[i] * T) - wy; // whole pixels: identical in every window
            int rot = (b.dk[i] >> 8) & 3;
            c.save();
            c.translate(cx, cy);
            c.rotate(rot * 90f);
            if ((b.dk[i] & 1024) != 0) c.scale(-1f, 1f);
            int iw = Math.round(im.w() * f), ih = Math.round(im.h() * f);
            b.dst.set(-iw / 2, -ih / 2, iw - iw / 2, ih - ih / 2);
            b.decalPaint.setAlpha((b.dk[i] & 255) == WorldGen.DC_HAZARD ? 130 : 235);
            c.drawBitmap(im.sheet, im.src, b.dst, b.decalPaint);
            c.restore();
        }
    }

    private static final LightingColorFilter DECAL_TONE = new LightingColorFilter(0xFFA0A0A0, 0);
    private final Img[] decalImgs = new Img[WorldGen.DECAL.length];
    private boolean decalsResolved;

    private Img decalImg(int kind) {
        if (!decalsResolved) {
            for (int i = 0; i < decalImgs.length; i++) decalImgs[i] = atlas.img("decal." + WorldGen.DECAL[i]);
            decalsResolved = true;
        }
        return kind < decalImgs.length ? decalImgs[kind] : null;
    }

    /** Paints the texture over the window, aligned to absolute world pixels (plus an offset) so chunk borders match. */
    private static void tile(Canvas c, Baker b, Bitmap tex, int texPx, int wx, int wy, int pw, int ph, int offX, int offY, int alpha) {
        b.paint.setAlpha(alpha);
        int startX = -Math.floorMod(wx + offX, texPx), startY = -Math.floorMod(wy + offY, texPx);
        b.src.set(0, 0, tex.getWidth(), tex.getHeight());
        for (int y = startY; y < ph; y += texPx) {
            for (int x = startX; x < pw; x += texPx) {
                b.dst.set(x, y, x + texPx, y + texPx);
                c.drawBitmap(tex, b.src, b.dst, b.paint);
            }
        }
        b.paint.setAlpha(255);
    }
}
