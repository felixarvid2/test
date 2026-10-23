package se.felixarvid.thorsurvivors.render;

import android.content.res.AssetManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.LightingColorFilter;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.RectF;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.util.HashMap;

/**
 * Single lookup for every sprite drawn in the game: key -> bitmap + frame rects.
 * Renderers call {@link #draw} first and fall back to their procedural drawing when it returns false
 * (no sprite mapped), so art can be dropped in without touching game code.
 *
 * Keys: "player", "enemy.<ENEMY_KEY>", "boss.<ENEMY_KEY>", "pickup.<GEM|COIN|COINBAG|ROAST|VACUUM|OROLOGION|ROSARY|CLOVER|CHEST>",
 * "proj.<WEAPON_KEY>" (WHIP, MAGIC_MISSILE, ... and evolved keys), "fx.<name>", "tile.<STAGE_KEY>".
 *
 * Mapping lives in assets/sprites/atlas.json (optional):
 * { "sprites": { "enemy.BAT1": { "sheet": "sprites/bats.png", "fps": 8,
 *                                "frames": [[x,y,w,h], ...], "scale": 1.0 } },
 *   "tiles":   { "tile.FOREST": { "sheet": "sprites/grass.png", "frames": [[x,y,w,h]] } } }
 * All scaling is nearest-neighbour (filterBitmap = false).
 */
public final class SpriteAtlas {
    private static final SpriteAtlas INSTANCE = new SpriteAtlas();

    public static SpriteAtlas get() {
        return INSTANCE;
    }

    public static final class Sprite {
        public Bitmap bitmap;
        public Rect[] frames;
        public float fps = 8f;
        public float scale = 1f;
        /** Integer screen-pixel scale per sprite pixel for world sprites (0 = size comes from the caller). */
        public int k;
        public float rot, alpha = 1f;
        public ColorFilter tint;
        /** Ground tiles: chance of frames[i+1] and scattered decorations. */
        public float[] variantChance = new float[0];
        public Rect[] decor = new Rect[0];
        public float decorChance;
    }

    private final HashMap<String, Sprite> sprites = new HashMap<>();
    private final HashMap<String, Bitmap> sheets = new HashMap<>();
    private final Paint paint = new Paint();
    private final RectF dst = new RectF();
    /** Screen pixels per world unit; lets world sprites be sized/snapped to whole pixels. */
    private float worldScale = 1f;

    public void setWorldScale(float s) {
        worldScale = s;
    }

    public float worldScale() {
        return worldScale;
    }

    private SpriteAtlas() {
        paint.setFilterBitmap(false);
        paint.setAntiAlias(false);
        paint.setDither(false);
    }

    public Paint paint() {
        return paint;
    }

    /** Loads assets/sprites/atlas.json if present; silently leaves everything procedural otherwise. */
    public synchronized void load(AssetManager am) {
        sprites.clear();
        InputStream in = null;
        try {
            in = am.open("sprites/atlas.json");
            java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
            byte[] b = new byte[8192];
            int n;
            while ((n = in.read(b)) > 0) bos.write(b, 0, n);
            JSONObject root = new JSONObject(bos.toString("UTF-8"));
            readGroup(am, root.optJSONObject("sprites"));
            readGroup(am, root.optJSONObject("tiles"));
        } catch (Exception ignored) {
            // no atlas shipped: procedural fallback everywhere
        } finally {
            try { if (in != null) in.close(); } catch (Exception ignored) { }
        }
    }

    private void readGroup(AssetManager am, JSONObject group) throws Exception {
        if (group == null) return;
        java.util.Iterator<String> it = group.keys();
        while (it.hasNext()) {
            String key = it.next();
            JSONObject o = group.getJSONObject(key);
            Bitmap bm = sheet(am, o.getString("sheet"));
            if (bm == null) continue;
            JSONArray fr = o.getJSONArray("frames");
            Sprite s = new Sprite();
            s.bitmap = bm;
            s.frames = new Rect[fr.length()];
            for (int i = 0; i < fr.length(); i++) {
                JSONArray r = fr.getJSONArray(i);
                s.frames[i] = new Rect(r.getInt(0), r.getInt(1), r.getInt(0) + r.getInt(2), r.getInt(1) + r.getInt(3));
            }
            s.fps = (float) o.optDouble("fps", 8);
            s.scale = (float) o.optDouble("scale", 1);
            s.k = o.optInt("k", 0);
            s.rot = (float) o.optDouble("rot", 0);
            s.alpha = (float) o.optDouble("alpha", 1);
            if (o.has("tint")) {
                int c = android.graphics.Color.parseColor(o.getString("tint"));
                s.tint = new LightingColorFilter(c | 0xFF000000, 0); // multiply
            }
            JSONArray vc = o.optJSONArray("variantChance");
            if (vc != null) {
                s.variantChance = new float[vc.length()];
                for (int i = 0; i < vc.length(); i++) s.variantChance[i] = (float) vc.getDouble(i);
            }
            JSONArray dc = o.optJSONArray("decor");
            if (dc != null) {
                s.decor = new Rect[dc.length()];
                for (int i = 0; i < dc.length(); i++) {
                    JSONArray r = dc.getJSONArray(i);
                    s.decor[i] = new Rect(r.getInt(0), r.getInt(1), r.getInt(0) + r.getInt(2), r.getInt(1) + r.getInt(3));
                }
            }
            s.decorChance = (float) o.optDouble("decorChance", 0);
            if (s.frames.length > 0) sprites.put(key, s);
        }
    }

    private Bitmap sheet(AssetManager am, String path) {
        Bitmap bm = sheets.get(path);
        if (bm != null) return bm;
        InputStream in = null;
        try {
            in = am.open(path);
            BitmapFactory.Options opt = new BitmapFactory.Options();
            opt.inScaled = false;
            bm = BitmapFactory.decodeStream(in, null, opt);
            if (bm != null) sheets.put(path, bm);
        } catch (Exception ignored) {
        } finally {
            try { if (in != null) in.close(); } catch (Exception ignored) { }
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

    public boolean draw(Canvas c, String key, float time, float cx, float cy, float w, float h, boolean flipX,
                        float rotationDeg, int alpha) {
        return draw(c, key, time, cx, cy, w, h, flipX, rotationDeg, alpha, 1f);
    }

    /**
     * Draws the sprite centred at (cx, cy). World sprites (Sprite.k > 0) are sized to k screen pixels per sprite
     * pixel and snapped to whole screen pixels so nearest-neighbour scaling stays crisp; otherwise w x h is used.
     * `squash` scales vertically about the feet (walk bob). Returns false when the key is unmapped so the caller
     * can draw the procedural fallback.
     */
    public boolean draw(Canvas c, String key, float time, float cx, float cy, float w, float h, boolean flipX,
                        float rotationDeg, int alpha, float squash) {
        Sprite s = sprites.get(key);
        if (s == null) return false;
        Rect src = s.frames[((int) (time * s.fps)) % s.frames.length];
        if (s.k > 0) {
            w = h = 16f * s.k / worldScale;
            cx = Math.round(cx * worldScale) / worldScale;
            cy = Math.round(cy * worldScale) / worldScale;
        }
        float hw = w * s.scale / 2f, hh = h * s.scale / 2f;
        dst.set(-hw, -hh, hw, hh);
        paint.setAlpha((int) (alpha * s.alpha));
        paint.setColorFilter(s.tint);
        c.save();
        c.translate(cx, cy);
        if (rotationDeg + s.rot != 0f) c.rotate(rotationDeg + s.rot);
        if (squash != 1f) c.translate(0, hh * (1f - squash));
        c.scale(flipX ? -1f : 1f, squash);
        c.drawBitmap(s.bitmap, src, dst, paint);
        c.restore();
        paint.setColorFilter(null);
        paint.setAlpha(255);
        return true;
    }

    private static int hash(int x, int y) {
        int h = x * 374761393 + y * 668265263;
        h = (h ^ (h >>> 13)) * 1274126177;
        return h ^ (h >>> 16);
    }

    /**
     * Draws the tiling ground: per-cell seeded base/variant frames plus sparse decorations. `tile` is the cell
     * size in world units (callers pass 4 screen-pixels-per-sprite-pixel / worldScale); edges are snapped to
     * whole screen pixels. Returns false when unmapped.
     */
    public boolean drawTiles(Canvas c, String key, float camX, float camY, float viewW, float viewH, float tile) {
        Sprite s = sprites.get(key);
        if (s == null) return false;
        int x0 = (int) Math.floor((camX - viewW / 2) / tile), x1 = (int) Math.floor((camX + viewW / 2) / tile);
        int y0 = (int) Math.floor((camY - viewH / 2) / tile), y1 = (int) Math.floor((camY + viewH / 2) / tile);
        float ws = worldScale, tpx = tile * ws;
        for (int ty = y0; ty <= y1; ty++) {
            for (int tx = x0; tx <= x1; tx++) {
                int hh = hash(tx, ty);
                float r = ((hh >>> 4) & 1023) / 1024f;
                int f = 0;
                float acc = 0;
                for (int i = 0; i < s.variantChance.length; i++) {
                    acc += s.variantChance[i];
                    if (r < acc && i + 1 < s.frames.length) { f = i + 1; break; }
                }
                dst.set(Math.round(tx * tpx) / ws, Math.round(ty * tpx) / ws,
                        Math.round((tx + 1) * tpx) / ws, Math.round((ty + 1) * tpx) / ws);
                c.drawBitmap(s.bitmap, s.frames[f], dst, paint);
                if (s.decor.length > 0 && ((hh >>> 14) & 1023) / 1024f < s.decorChance) {
                    c.drawBitmap(s.bitmap, s.decor[(hh >>> 24) % s.decor.length], dst, paint);
                }
            }
        }
        return true;
    }
}
