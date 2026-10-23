package se.felixarvid.thorsurvivors.render;

import android.content.res.AssetManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
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
    }

    private final HashMap<String, Sprite> sprites = new HashMap<>();
    private final HashMap<String, Bitmap> sheets = new HashMap<>();
    private final Paint paint = new Paint();
    private final RectF dst = new RectF();

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

    /**
     * Draws the sprite centred at (cx, cy) with the given bounding size (world px). `time` selects the animation
     * frame. Returns false when the key is unmapped so the caller can draw the procedural fallback.
     */
    public boolean draw(Canvas c, String key, float time, float cx, float cy, float w, float h, boolean flipX,
                        float rotationDeg, int alpha) {
        Sprite s = sprites.get(key);
        if (s == null) return false;
        Rect src = s.frames[((int) (time * s.fps)) % s.frames.length];
        float hw = w * s.scale / 2f, hh = h * s.scale / 2f;
        dst.set(-hw, -hh, hw, hh);
        paint.setAlpha(alpha);
        c.save();
        c.translate(cx, cy);
        if (rotationDeg != 0f) c.rotate(rotationDeg);
        if (flipX) c.scale(-1f, 1f);
        c.drawBitmap(s.bitmap, src, dst, paint);
        c.restore();
        paint.setAlpha(255);
        return true;
    }

    /** Draws a tiling ground sprite covering the visible area; false when unmapped. */
    public boolean drawTiles(Canvas c, String key, float camX, float camY, float viewW, float viewH, float tile) {
        Sprite s = sprites.get(key);
        if (s == null) return false;
        Rect src = s.frames[0];
        int x0 = (int) Math.floor((camX - viewW / 2) / tile), x1 = (int) Math.floor((camX + viewW / 2) / tile);
        int y0 = (int) Math.floor((camY - viewH / 2) / tile), y1 = (int) Math.floor((camY + viewH / 2) / tile);
        for (int ty = y0; ty <= y1; ty++) {
            for (int tx = x0; tx <= x1; tx++) {
                dst.set(tx * tile, ty * tile, (tx + 1) * tile + 1, (ty + 1) * tile + 1);
                c.drawBitmap(s.bitmap, src, dst, paint);
            }
        }
        return true;
    }
}
