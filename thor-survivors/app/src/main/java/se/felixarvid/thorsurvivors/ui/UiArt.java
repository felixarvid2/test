package se.felixarvid.thorsurvivors.ui;

import android.content.res.AssetManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.Typeface;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.util.HashMap;

/**
 * The art of the ASHFALL UI skin that is not in the sprite atlas: the condensed typeface, the generated steel and
 * hazard-stripe textures (built once), the stat icon sheet, and the menu paintings.
 *
 * <p>Memory: the paintings and portraits ({@code assets/ui/*.webp}, see tools/build_ui_assets.py) are decoded the first time a
 * screen draws them, at most at the size asked for (BitmapFactory sub-sampling), and dropped again by {@link #release} when the
 * screen is left (the run starts). Nothing here allocates in a steady-state frame: lookups are map hits on cached keys.
 * Without a source (tests of other classes) everything returns null and the panel falls back to flat colours and the system font.
 */
public final class UiArt {
    private static final UiArt INSTANCE = new UiArt();

    public static UiArt get() {
        return INSTANCE;
    }

    /** Order of the 64 px icons in {@code ui/stats.webp}, 7 per row (tools/build_ui_assets.py writes the same order). */
    public static final String[] STAT_KEYS = {"damage", "maxLife", "armor", "attackSpeed", "cooldownReduction", "critChance",
            "critDamage", "damageReduction", "damageVsElite", "damageVsVulnerable", "moveSpeed", "potionHealing",
            "resourceGen", "generic"};
    private static final int STAT_PX = 64;

    /** Groups of bitmaps that are released together. */
    public static final int G_MENU = 0, G_TITLE = 1, G_STATS = 2;

    private AssetManager am;
    private File dir;
    private boolean ready;

    /** Condensed bold for headings and numbers, condensed semi-bold for body text. Never null (system fallback). */
    public Typeface bold = Typeface.DEFAULT_BOLD, semi = Typeface.DEFAULT_BOLD;
    /** Tileable textures generated once (null until {@link #ensure} ran). */
    public Bitmap steelTile, stripeTile, stripeDimTile;

    private final HashMap<String, Bitmap> bitmaps = new HashMap<>();
    private final HashMap<String, Integer> groups = new HashMap<>();
    private final Rect src = new Rect(), dst = new Rect();
    private final Paint blit = new Paint(Paint.FILTER_BITMAP_FLAG);

    private UiArt() {
    }

    /** From the app: the asset folder of the APK. Safe to call again (Activities, presentations). */
    public synchronized void ensure(AssetManager assets) {
        if (ready || assets == null) return;
        am = assets;
        build();
    }

    /** From tests: {@code src/main/assets} on disk. */
    public synchronized void ensure(File assetDir) {
        if (ready) return;
        dir = assetDir;
        build();
    }

    private void build() {
        ready = true;
        try {
            bold = font("fonts/BarlowCondensed-Bold.ttf", Typeface.DEFAULT_BOLD);
            semi = font("fonts/BarlowCondensed-SemiBold.ttf", Typeface.DEFAULT_BOLD);
        } catch (RuntimeException ignored) {
            // keep the system fallback
        }
        steelTile = makeSteel();
        stripeTile = makeStripes(0xFFFF8A2A, 0xFF16110E);
        stripeDimTile = makeStripes(0xFF8A4A1A, 0xFF0F0B09);
    }

    private Typeface font(String path, Typeface fallback) {
        try {
            if (am != null) return Typeface.createFromAsset(am, path);
            if (dir != null) return Typeface.createFromFile(new File(dir, path));
        } catch (RuntimeException ignored) {
        }
        return fallback;
    }

    public boolean isReady() {
        return ready;
    }

    private InputStream open(String path) throws Exception {
        if (am != null) return am.open(path);
        if (dir != null) return new FileInputStream(new File(dir, path));
        throw new java.io.FileNotFoundException(path);
    }

    // ------------------------------------------------------------------ generated textures

    /** 256 px seamless brushed steel: the #15110f base, horizontal grain streaks and a little noise. Built once (about 260 KB). */
    private static Bitmap makeSteel() {
        final int n = 256;
        int[] px = new int[n * n];
        long seed = 0x9E3779B97F4A7C15L;
        float[] row = new float[n];
        for (int y = 0; y < n; y++) { // a streak value per row, smoothed so neighbouring rows are alike (brushed look)
            seed = seed * 6364136223846793005L + 1442695040888963407L;
            float v = ((seed >>> 40) & 0xFF) / 255f - 0.5f;
            row[y] = v;
        }
        float[] soft = new float[n];
        for (int y = 0; y < n; y++) soft[y] = 0.5f * row[y] + 0.25f * row[(y + 1) % n] + 0.25f * row[(y + n - 1) % n];
        for (int y = 0; y < n; y++) {
            for (int x = 0; x < n; x++) {
                seed = seed * 6364136223846793005L + 1442695040888963407L;
                float noise = ((seed >>> 40) & 0xFF) / 255f - 0.5f;
                // long streaks: a slowly varying value along x, per row band (period divides n, so the tile is seamless)
                float streak = (float) Math.sin((x + y * 37) * (Math.PI * 2 / 128.0)) * 0.25f;
                float v = soft[y] * 9f + noise * 5f + streak * 3f;
                int r = clamp(0x15 + Math.round(v)), g = clamp(0x11 + Math.round(v * 0.9f)), b = clamp(0x0F + Math.round(v * 0.8f));
                px[y * n + x] = 0xFF000000 | r << 16 | g << 8 | b;
            }
        }
        Bitmap bm = Bitmap.createBitmap(n, n, Bitmap.Config.ARGB_8888);
        bm.setPixels(px, 0, n, 0, 0, n, n);
        return bm;
    }

    /** 32 px tile of 45 degree stripes, 16 px each; seamless in both directions. */
    private static Bitmap makeStripes(int a, int b) {
        final int n = 32;
        int[] px = new int[n * n];
        for (int y = 0; y < n; y++) for (int x = 0; x < n; x++) px[y * n + x] = ((x + y) % n) < n / 2 ? a : b;
        Bitmap bm = Bitmap.createBitmap(n, n, Bitmap.Config.ARGB_8888);
        bm.setPixels(px, 0, n, 0, 0, n, n);
        return bm;
    }

    private static int clamp(int v) {
        return v < 0 ? 0 : Math.min(v, 255);
    }

    // ------------------------------------------------------------------ lazily decoded art

    /** A picture from {@code assets/ui/} decoded at most {@code maxW} wide (sub-sampled), cached until {@link #release}. Null if missing. */
    public synchronized Bitmap get(String file, int group, int maxW) {
        Bitmap b = bitmaps.get(file);
        if (b != null || groups.containsKey(file)) return b;
        b = decode("ui/" + file, maxW);
        bitmaps.put(file, b);
        groups.put(file, group);
        return b;
    }

    private Bitmap decode(String path, int maxW) {
        if (!ready || (am == null && dir == null)) return null;
        try {
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inScaled = false;
            o.inJustDecodeBounds = true;
            try (InputStream in = open(path)) {
                BitmapFactory.decodeStream(in, null, o);
            }
            int s = 1;
            while (o.outWidth / (s * 2) >= maxW && maxW > 0) s *= 2;
            o.inJustDecodeBounds = false;
            o.inSampleSize = s;
            o.inPreferredConfig = Bitmap.Config.ARGB_8888;
            try (InputStream in = open(path)) {
                return BitmapFactory.decodeStream(in, null, o);
            }
        } catch (Exception e) {
            return null;
        }
    }

    /** Drops every decoded picture of a group (the run starts: the menu paintings are not needed any more). */
    public synchronized void release(int group) {
        java.util.Iterator<java.util.Map.Entry<String, Integer>> it = groups.entrySet().iterator();
        while (it.hasNext()) {
            java.util.Map.Entry<String, Integer> e = it.next();
            if (e.getValue() != group) continue;
            Bitmap b = bitmaps.remove(e.getKey());
            if (b != null) b.recycle();
            it.remove();
        }
    }

    /** Number of decoded pictures and their bytes, for the memory report of the tests. */
    public synchronized long bytesHeld() {
        long n = 0;
        for (Bitmap b : bitmaps.values()) if (b != null) n += b.getByteCount();
        return n;
    }

    // ------------------------------------------------------------------ drawing helpers

    /** Draws the picture to fill (l,t,r,b) like CSS "cover": scaled up evenly, centred, the overflow cropped; focusX/Y shift the crop (0..1). */
    public void cover(Canvas c, Bitmap bm, float l, float t, float r, float b, float focusX, float focusY, Paint p) {
        if (bm == null) return;
        float dw = r - l, dh = b - t;
        float k = Math.max(dw / bm.getWidth(), dh / bm.getHeight());
        int sw = Math.min(bm.getWidth(), Math.round(dw / k)), sh = Math.min(bm.getHeight(), Math.round(dh / k));
        int sx = Math.round((bm.getWidth() - sw) * focusX), sy = Math.round((bm.getHeight() - sh) * focusY);
        src.set(sx, sy, sx + sw, sy + sh);
        dst.set(Math.round(l), Math.round(t), Math.round(r), Math.round(b));
        c.drawBitmap(bm, src, dst, p != null ? p : blit);
    }

    /** A stat icon (index into {@link #STAT_KEYS}) scaled into the square of side {@code size} centred on (cx, cy). */
    public boolean statIcon(Canvas c, int idx, float cx, float cy, float size) {
        Bitmap sheet = get("stats.webp", G_STATS, 0);
        if (sheet == null || idx < 0 || idx >= STAT_KEYS.length) return false;
        int sx = (idx % 7) * STAT_PX, sy = (idx / 7) * STAT_PX, h = Math.round(size / 2f);
        src.set(sx, sy, sx + STAT_PX, sy + STAT_PX);
        dst.set(Math.round(cx) - h, Math.round(cy) - h, Math.round(cx) + h, Math.round(cy) + h);
        c.drawBitmap(sheet, src, dst, blit);
        return true;
    }
}
