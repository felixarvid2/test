package se.felixarvid.thorsurvivors.render;

import android.content.res.AssetManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.util.HashMap;
import java.util.Iterator;

import se.felixarvid.thorsurvivors.util.IO;

/**
 * Everything drawn in the world and on the panel, loaded once from {@code assets/ashfall/manifest.json}
 * (written by tools/build_ashfall_assets.py).
 *
 * <ul>
 * <li>{@link Model}: an animated 8-direction sprite (baked from a 3D model): clips of frames, each frame a source
 * rectangle in the model's sheet plus its trim offset relative to the feet anchor. Drawn 1:1 with
 * {@code drawBitmap(sheet, src, dst)} at integer screen positions, so nothing is resampled at 1080p.</li>
 * <li>{@link Img}: one still picture (prop, decal, effect, icon) cut from a shared atlas, with an anchor.</li>
 * </ul>
 * Sheets are decoded to Bitmaps at load, never during a frame. Keys of images: "prop.NAME", "decal.NAME",
 * "vfx.NAME", "icon.KEY", "gem.NAME", and "pix.NAME" for the few hand-drawn pickups ({@link PixelSprites}).
 */
public final class SpriteAtlas {
    private static final SpriteAtlas INSTANCE = new SpriteAtlas();

    public static SpriteAtlas get() {
        return INSTANCE;
    }

    /** Clip slots of a {@link Model}. A character's "run" is stored in the walk slot. */
    public static final int C_IDLE = 0, C_WALK = 1, C_ATTACK = 2, C_HIT = 3, C_DEATH = 4, C_STATIC = 5, C_ATTACK2 = 6,
            C_SLAM = 7, C_SHOOT = 8, C_THROW = 9, C_CAST = 10, C_CAST2 = 11, C_DODGE = 12, C_RUN = 13, CLIPS = 14;
    private static final String[] CLIP_NAMES = {"idle", "walk", "attack", "hit", "death", "static", "attack2", "slam",
            "shoot", "throw", "cast", "cast2", "dodge", "run"};

    /** Supplies asset bytes by path ("ashfall/manifest.json"); lets tests read the files straight from disk. */
    public interface Opener {
        InputStream open(String path) throws Exception;
    }

    public static final class Clip {
        public float fps;
        public int count;
        public boolean loop;
        /** Per frame {@code (dir * count + i) * 6}: x, y, w, h in the sheet, then ox, oy relative to the feet anchor... see Model. */
        public int[] r;
    }

    public static final class Model {
        public String name;
        public Bitmap sheet;
        /** Nominal logical frame and the feet anchor in it; a frame is drawn at (feetX - ax + ox, feetY - ay + oy). */
        public int fw, fh, ax, ay;
        public final Clip[] clips = new Clip[CLIPS];
        /** Pixels from the feet to the top of the tallest first frame (health bars, scaling). */
        public int headPx;

        public boolean rigged() {
            return clips[C_WALK] != null;
        }

        public Clip clip(int id) {
            return clips[id];
        }
    }

    public static final class Img {
        public Bitmap sheet;
        public final Rect src = new Rect();
        /** Anchor inside the source rectangle (feet of a prop, centre of an effect). */
        public int ax, ay;

        public int w() {
            return src.width();
        }

        public int h() {
            return src.height();
        }
    }

    private final HashMap<String, Model> models = new HashMap<>();
    private final HashMap<String, Img> images = new HashMap<>();
    private final HashMap<String, Bitmap> sheets = new HashMap<>();
    private Bitmap ground;
    private volatile boolean loaded;
    /** Icon lookups by bare key, so drawing an icon every frame concatenates no "icon." + key string (null = no such icon). */
    private final HashMap<String, Img> iconByKey = new HashMap<>();
    private final Paint iconPaint = new Paint(Paint.FILTER_BITMAP_FLAG);
    private final Rect iconDst = new Rect();

    private SpriteAtlas() {
    }

    public boolean isLoaded() {
        return loaded;
    }

    public synchronized void load(final AssetManager am) {
        load(new Opener() {
            @Override
            public InputStream open(String path) throws Exception {
                return am.open(path);
            }
        });
    }

    /** Loads the manifest and every sheet; a missing manifest leaves everything procedural (circles, no icons). */
    public synchronized void load(Opener op) {
        models.clear();
        images.clear();
        iconByKey.clear();
        sheets.clear();
        ground = null;
        try {
            String text;
            try (InputStream in = op.open("ashfall/manifest.json")) {
                text = IO.readUtf8(in);
            }
            JSONObject root = new JSONObject(text);
            JSONObject ms = root.getJSONObject("models");
            Iterator<String> it = ms.keys();
            while (it.hasNext()) {
                String name = it.next();
                Model m = readModel(op, name, ms.getJSONObject(name));
                if (m != null) models.put(name, m);
            }
            JSONObject im = root.getJSONObject("images");
            it = im.keys();
            while (it.hasNext()) {
                String key = it.next();
                JSONObject o = im.getJSONObject(key);
                Bitmap sheet = sheet(op, o.getString("sheet"));
                if (sheet == null) continue;
                JSONArray r = o.getJSONArray("rect"), a = o.getJSONArray("anchor");
                Img i = new Img();
                i.sheet = sheet;
                i.src.set(r.getInt(0), r.getInt(1), r.getInt(0) + r.getInt(2), r.getInt(1) + r.getInt(3));
                i.ax = a.getInt(0);
                i.ay = a.getInt(1);
                images.put(key, i);
            }
            JSONObject g = root.optJSONObject("ground");
            if (g != null && g.has("mine_rock")) ground = sheet(op, g.getJSONObject("mine_rock").getString("sheet"));
            loaded = true;
        } catch (Exception ignored) {
            // no art shipped: procedural fallback everywhere
        }
        PixelSprites.register(this);
        sheets.clear();
    }

    private Model readModel(Opener op, String name, JSONObject o) throws Exception {
        Bitmap sheet = sheet(op, o.getString("sheet"));
        if (sheet == null) return null;
        Model m = new Model();
        m.name = name;
        m.sheet = sheet;
        JSONArray fs = o.getJSONArray("frameSize"), an = o.getJSONArray("anchor");
        m.fw = fs.getInt(0);
        m.fh = fs.getInt(1);
        m.ax = an.getInt(0);
        m.ay = an.getInt(1);
        JSONObject cs = o.getJSONObject("clips");
        for (int id = 0; id < CLIPS; id++) {
            String cn = CLIP_NAMES[id];
            if (id == C_WALK && !cs.has("walk") && cs.has("run")) cn = "run";
            if (id == C_RUN && !cs.has("walk")) continue; // a hero's run is its walk slot; C_RUN is a second gait (the welder's dash)
            JSONObject c = cs.optJSONObject(cn);
            if (c == null) continue;
            Clip k = new Clip();
            k.fps = (float) c.optDouble("fps", 1);
            k.count = c.getInt("count");
            k.loop = c.optBoolean("loop", false);
            k.r = new int[8 * k.count * 6];
            JSONArray dirs = c.getJSONArray("frames");
            for (int d = 0; d < 8; d++) {
                JSONArray row = dirs.getJSONArray(d);
                for (int i = 0; i < k.count; i++) {
                    JSONArray f = row.getJSONArray(i);
                    for (int j = 0; j < 6; j++) k.r[(d * k.count + i) * 6 + j] = f.getInt(j);
                }
            }
            m.clips[id] = k;
        }
        Clip first = m.clips[C_WALK] != null ? m.clips[C_WALK] : m.clips[C_STATIC];
        if (first != null) {
            for (int d = 0; d < 8; d++) {
                int fo = d * first.count * 6;
                if (first.r[fo + 2] > 0) m.headPx = Math.max(m.headPx, m.ay - first.r[fo + 5]);
            }
        }
        return m;
    }

    private Bitmap sheet(Opener op, String path) {
        Bitmap bm = sheets.get(path);
        if (bm != null) return bm;
        try (InputStream in = op.open(path)) {
            BitmapFactory.Options opt = new BitmapFactory.Options();
            opt.inScaled = false;
            opt.inPreferredConfig = Bitmap.Config.ARGB_8888;
            bm = BitmapFactory.decodeStream(in, null, opt);
            if (bm != null) sheets.put(path, bm);
        } catch (Exception ignored) {
        }
        return bm;
    }

    /** Registers a hand-made image (PixelSprites, tests): the whole bitmap, anchored at its centre bottom. */
    synchronized void put(String key, Bitmap bm, int ax, int ay) {
        Img i = new Img();
        i.sheet = bm;
        i.src.set(0, 0, bm.getWidth(), bm.getHeight());
        i.ax = ax;
        i.ay = ay;
        images.put(key, i);
        iconByKey.clear();
    }

    public Model model(String name) {
        return models.get(name);
    }

    public Img img(String key) {
        return images.get(key);
    }

    public boolean has(String key) {
        return images.containsKey(key);
    }

    /** The seamless rock texture (512 px) the ground is baked from, or null. */
    public Bitmap groundTexture() {
        return ground;
    }

    public java.util.Set<String> modelNames() {
        return models.keySet();
    }

    public java.util.Set<String> imageKeys() {
        return images.keySet();
    }

    /** A panel icon (key without the "icon." prefix) scaled to a size x size square centred on (cx, cy). */
    public boolean drawIcon(Canvas c, Paint paint, String key, float cx, float cy, float size) {
        Img i = iconByKey.get(key);
        if (i == null) {
            if (iconByKey.containsKey(key)) return false;
            i = images.get("icon." + key);
            iconByKey.put(key, i);
            if (i == null) return false;
        }
        int h = Math.round(size / 2f);
        iconDst.set(Math.round(cx) - h, Math.round(cy) - h, Math.round(cx) + h, Math.round(cy) + h);
        c.drawBitmap(i.sheet, i.src, iconDst, paint != null ? paint : iconPaint);
        return true;
    }

    /** Frame index of a clip at time t (seconds), looping or clamped to the last frame. */
    public static int frameAt(Clip c, float t, float fps) {
        int i = (int) (t * fps);
        if (c.loop) return c.count == 0 ? 0 : (i % c.count + c.count) % c.count;
        return Math.max(0, Math.min(c.count - 1, i));
    }
}
