package se.felixarvid.thorsurvivors.render;

import android.content.res.AssetManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Iterator;

/**
 * Single lookup for every sprite drawn in the game: key -> frames sliced out of the sheets.
 *
 * Every frame is cut into its own 16x16 Bitmap at load (so a neighbouring tile or the 1px sheet spacing can never
 * bleed in) and is only ever drawn as a pre-scaled copy ({@link Bitmap#createScaledBitmap} with filter off, an exact
 * integer factor) at whole screen pixels. Variants (white hit-flash silhouette, red/ice tint, mirrored) are built
 * lazily per (frame, factor, tint, flip) and cached, so a draw call is a plain 1:1 {@code drawBitmap}.
 *
 * Keys: "player", "enemy.<ENEMY_KEY>", "boss.<ENEMY_KEY>", "pickup.<...>", "proj.<WEAPON_KEY>", "fx.<name>",
 * "icon.<KEY>", "tile.<STAGE_KEY>". Mapping lives in assets/sprites/atlas.json (written by tools/build_atlas.py).
 */
public final class SpriteAtlas {
    private static final SpriteAtlas INSTANCE = new SpriteAtlas();

    public static SpriteAtlas get() {
        return INSTANCE;
    }

    /** Pixel treatments for {@link #bitmap}. */
    public static final int T_NORMAL = 0, T_WHITE = 1, T_RED = 2, T_ICE = 3;
    private static final int TYPES = 4, MAX_K = 16;

    /** Supplies asset bytes by path ("sprites/atlas.json"); lets tests read the files straight from disk. */
    public interface Opener {
        InputStream open(String path) throws Exception;
    }

    public static final class Sprite {
        /** Unscaled frames (tint already multiplied in). */
        public Bitmap[] base;
        public float fps = 8f;
        /** Integer screen-pixel scale per sprite pixel at 1080p for world sprites (0 = size comes from the caller). */
        public int k;
        public float rot, alpha = 1f;
        /** Ground tiles: chance of base[i+1] and scattered decorations. */
        public float[] variantChance = new float[0];
        public Bitmap[] decor = new Bitmap[0];
        public float decorChance;
        /** [(type * 2 + flip) * (MAX_K + 1) + k] -> scaled frames, built on demand. */
        private final Bitmap[][] cache = new Bitmap[TYPES * 2 * (MAX_K + 1)][];
        private final Bitmap[][] decorCache = new Bitmap[MAX_K + 1][];

        public int width() {
            return base[0].getWidth();
        }

        public int height() {
            return base[0].getHeight();
        }
    }

    private final HashMap<String, Sprite> sprites = new HashMap<>();
    private final HashMap<String, Bitmap> sheets = new HashMap<>();

    private SpriteAtlas() {
    }

    /** Loads assets/sprites/atlas.json if present; silently leaves everything procedural otherwise. */
    public synchronized void load(final AssetManager am) {
        load(new Opener() {
            @Override
            public InputStream open(String path) throws Exception {
                return am.open(path);
            }
        });
    }

    public synchronized void load(Opener op) {
        sprites.clear();
        sheets.clear();
        try {
            JSONObject root = new JSONObject(new String(readAll(op.open("sprites/atlas.json")), "UTF-8"));
            readGroup(op, root.optJSONObject("sprites"));
            readGroup(op, root.optJSONObject("tiles"));
        } catch (Exception ignored) {
            // no atlas shipped: procedural fallback everywhere
        }
        PixelSprites.register(this);
        sheets.clear(); // slices are copies; the big sheets are not needed any more
    }

    private static byte[] readAll(InputStream in) throws Exception {
        try {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] b = new byte[8192];
            int n;
            while ((n = in.read(b)) > 0) bos.write(b, 0, n);
            return bos.toByteArray();
        } finally {
            in.close();
        }
    }

    private void readGroup(Opener op, JSONObject group) throws Exception {
        if (group == null) return;
        Iterator<String> it = group.keys();
        while (it.hasNext()) {
            String key = it.next();
            JSONObject o = group.getJSONObject(key);
            Bitmap sheet = sheet(op, o.getString("sheet"));
            if (sheet == null) continue;
            int tint = o.has("tint") ? (android.graphics.Color.parseColor(o.getString("tint")) | 0xFF000000) : 0;
            JSONArray fr = o.getJSONArray("frames");
            Sprite s = new Sprite();
            s.base = new Bitmap[fr.length()];
            for (int i = 0; i < fr.length(); i++) s.base[i] = slice(sheet, fr.getJSONArray(i), tint);
            s.fps = (float) o.optDouble("fps", 8);
            s.k = o.optInt("k", 0);
            s.rot = (float) o.optDouble("rot", 0);
            s.alpha = (float) o.optDouble("alpha", 1);
            JSONArray vc = o.optJSONArray("variantChance");
            if (vc != null) {
                s.variantChance = new float[vc.length()];
                for (int i = 0; i < vc.length(); i++) s.variantChance[i] = (float) vc.getDouble(i);
            }
            JSONArray dc = o.optJSONArray("decor");
            if (dc != null) {
                s.decor = new Bitmap[dc.length()];
                for (int i = 0; i < dc.length(); i++) s.decor[i] = slice(sheet, dc.getJSONArray(i), 0);
            }
            s.decorChance = (float) o.optDouble("decorChance", 0);
            if (s.base.length > 0) sprites.put(key, s);
        }
    }

    private static Bitmap slice(Bitmap sheet, JSONArray r, int tint) throws Exception {
        Bitmap b = Bitmap.createBitmap(sheet, r.getInt(0), r.getInt(1), r.getInt(2), r.getInt(3))
                .copy(Bitmap.Config.ARGB_8888, true);
        if (tint != 0) recolor(b, T_NORMAL, false, tint);
        return b;
    }

    private Bitmap sheet(Opener op, String path) {
        Bitmap bm = sheets.get(path);
        if (bm != null) return bm;
        try (InputStream in = op.open(path)) {
            BitmapFactory.Options opt = new BitmapFactory.Options();
            opt.inScaled = false;
            bm = BitmapFactory.decodeStream(in, null, opt);
            if (bm != null) sheets.put(path, bm);
        } catch (Exception ignored) {
        }
        return bm;
    }

    /** For code/tests that register sprites directly. */
    public synchronized void put(String key, Sprite s) {
        sprites.put(key, s);
    }

    public Sprite find(String key) {
        return sprites.get(key);
    }

    public boolean has(String key) {
        return sprites.containsKey(key);
    }

    public static int frameAt(Sprite s, float time) {
        return s.base.length == 1 ? 0 : ((int) (time * s.fps)) % s.base.length;
    }

    /** Integer scale for a sprite at the current screen height (1080 = factor 1). */
    public static int scaleFor(Sprite s, float screenFactor) {
        return Math.max(1, Math.min(MAX_K, Math.round(s.k * screenFactor)));
    }

    /**
     * The ready-to-blit bitmap for one frame at integer factor k: tinted, mirrored and scaled with nearest sampling
     * so that drawing it at whole screen pixels reproduces the art exactly.
     */
    public synchronized Bitmap bitmap(Sprite s, int frame, int k, int type, boolean flip) {
        k = Math.max(1, Math.min(MAX_K, k));
        int idx = (type * 2 + (flip ? 1 : 0)) * (MAX_K + 1) + k;
        Bitmap[] row = s.cache[idx];
        if (row == null) row = s.cache[idx] = new Bitmap[s.base.length];
        Bitmap b = row[frame];
        if (b == null) {
            Bitmap src = s.base[frame];
            if (type != T_NORMAL || flip) {
                src = src.copy(Bitmap.Config.ARGB_8888, true);
                recolor(src, type, flip, 0);
            }
            b = scale(src, k);
            row[frame] = b;
        }
        return b;
    }

    /** Decoration overlay for ground tiles at integer factor k. */
    public synchronized Bitmap decor(Sprite s, int i, int k) {
        k = Math.max(1, Math.min(MAX_K, k));
        Bitmap[] row = s.decorCache[k];
        if (row == null) row = s.decorCache[k] = new Bitmap[s.decor.length];
        if (row[i] == null) row[i] = scale(s.decor[i], k);
        return row[i];
    }

    private static Bitmap scale(Bitmap src, int k) {
        if (k == 1) return src;
        return Bitmap.createScaledBitmap(src, src.getWidth() * k, src.getHeight() * k, false);
    }

    /** Builds every variant the world renderer uses so no sprite is created in the middle of a frame. */
    public synchronized void warm(float screenFactor) {
        for (Sprite s : sprites.values()) {
            if (s.k <= 0 || s.base.length == 0) continue;
            int k = scaleFor(s, screenFactor);
            for (int f = 0; f < s.base.length; f++) {
                bitmap(s, f, k, T_NORMAL, false);
                bitmap(s, f, k, T_NORMAL, true);
                bitmap(s, f, k, T_WHITE, false);
                bitmap(s, f, k, T_WHITE, true);
            }
        }
        Sprite p = sprites.get("player");
        if (p != null) {
            int k = scaleFor(p, screenFactor);
            bitmap(p, 0, k, T_RED, false);
            bitmap(p, 0, k, T_RED, true);
        }
    }

    /**
     * Draws a sprite centred on (cx, cy) at an exact integer factor with its top-left snapped to a whole pixel.
     * For panel icons and anything else that is not part of the sorted world pass.
     */
    public boolean drawCentered(Canvas c, Paint paint, String key, float cx, float cy, int k) {
        Sprite s = sprites.get(key);
        if (s == null) return false;
        Bitmap b = bitmap(s, 0, k, T_NORMAL, false);
        c.drawBitmap(b, Math.round(cx - b.getWidth() / 2f), Math.round(cy - b.getHeight() / 2f), paint);
        return true;
    }

    private static final int[] PX = new int[64 * 64];

    /** In-place pixel treatment of a mutable ARGB bitmap (w*h <= 4096). */
    private static synchronized void recolor(Bitmap b, int type, boolean flip, int multiply) {
        int w = b.getWidth(), h = b.getHeight();
        int[] px = w * h <= PX.length ? PX : new int[w * h];
        b.getPixels(px, 0, w, 0, 0, w, h);
        if (flip) {
            for (int y = 0; y < h; y++) {
                for (int x = 0; x < w / 2; x++) {
                    int a = y * w + x, z = y * w + (w - 1 - x);
                    int t = px[a];
                    px[a] = px[z];
                    px[z] = t;
                }
            }
        }
        int mr = (multiply >> 16) & 255, mg = (multiply >> 8) & 255, mb = multiply & 255;
        for (int i = 0; i < w * h; i++) {
            int p = px[i], a = p >>> 24;
            if (a == 0) continue;
            int r = (p >> 16) & 255, g = (p >> 8) & 255, bl = p & 255;
            if (multiply != 0) {
                r = r * mr / 255;
                g = g * mg / 255;
                bl = bl * mb / 255;
            }
            switch (type) {
                case T_WHITE: r = g = bl = 255; break;
                case T_RED: r = Math.min(255, r / 2 + 150); g = g * 2 / 5; bl = bl * 2 / 5; break;
                case T_ICE: r = r / 2; g = Math.min(255, g * 4 / 5 + 40); bl = Math.min(255, bl + 80); break;
                default:
            }
            px[i] = (a << 24) | (r << 16) | (g << 8) | bl;
        }
        b.setPixels(px, 0, w, 0, 0, w, h);
    }
}
