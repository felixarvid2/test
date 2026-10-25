package se.felixarvid.thorsurvivors.render;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.Rect;
import android.graphics.RectF;

import java.nio.ByteBuffer;

/**
 * Darkness and light (design section 10). A low-resolution (1/6) ALPHA_8 lightmap is filled with the ambient darkness and
 * every light is punched into it with a pre-rendered soft disc (DST_OUT); the map is then drawn once over the ground,
 * scaled up with filtering. Sprites are not run through the map: each one gets a brightness from the same lights by
 * {@link #brightness} (analytic, same falloff) and is drawn with a matching colour filter, so enemies can be kept at a
 * readable minimum and tall props still sort correctly with the creatures.
 *
 * LOW is one static map with only the player's light in the middle of the screen; OFF draws nothing. Nothing here
 * allocates after the first frame at a given screen size.
 */
final class Lighting {
    static final int MAX = 12, SCALE = 6, BLOB = 64;
    /** Light colours: neutral, warm (furnace, emergency light) and lumen green. Warm and green add a faint coloured glow. */
    static final int NEUTRAL = 0, WARM = 1, GREEN = 2;
    /** Fully lit up to this fraction of the radius, then a smooth fall-off (the "soft edge 60 %" of the design). */
    private static final float CORE = 0.4f;

    final float[] lx = new float[MAX], ly = new float[MAX], lr = new float[MAX], ls = new float[MAX];
    final int[] lk = new int[MAX];
    int n;
    float ambient = 0.65f;

    private Bitmap map, staticMap, blob;
    private Canvas mapC, staticC;
    private int mapW, mapH, staticW, staticH;
    private float staticRadius = -1f;
    private final Paint out = new Paint(Paint.FILTER_BITMAP_FLAG), fillP = new Paint(), draw = new Paint(Paint.FILTER_BITMAP_FLAG),
            glow = new Paint(Paint.FILTER_BITMAP_FLAG);
    private final RectF rf = new RectF();
    private final Rect dst = new Rect();

    Lighting() {
        out.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.DST_OUT));
        fillP.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.SRC));
        draw.setColor(0xFF04050A);
        glow.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.ADD));
        byte[] a = new byte[BLOB * BLOB];
        for (int y = 0; y < BLOB; y++) {
            for (int x = 0; x < BLOB; x++) {
                float d = (float) Math.hypot(x + 0.5f - BLOB / 2f, y + 0.5f - BLOB / 2f) / (BLOB / 2f);
                a[y * BLOB + x] = (byte) Math.round(255f * profile(d));
            }
        }
        blob = Bitmap.createBitmap(BLOB, BLOB, Bitmap.Config.ALPHA_8);
        blob.copyPixelsFromBuffer(ByteBuffer.wrap(a));
    }

    /** Light intensity 0..1 at distance fraction t = d / radius. */
    static float profile(float t) {
        if (t <= CORE) return 1f;
        if (t >= 1f) return 0f;
        float u = (t - CORE) / (1f - CORE);
        return 1f - u * u * (3f - 2f * u);
    }

    void begin(float ambientDark) {
        n = 0;
        ambient = ambientDark;
    }

    /** Adds a light in screen pixels; ignored past {@link #MAX}. strength 0..1. */
    void add(float x, float y, float radius, float strength, int kind) {
        if (n >= MAX) return;
        lx[n] = x;
        ly[n] = y;
        lr[n] = radius;
        ls[n] = strength;
        lk[n++] = kind;
    }

    /** Brightness 0..1 of a ground-level point (1 - remaining darkness). */
    float brightness(float x, float y) {
        float dark = ambient;
        for (int i = 0; i < n; i++) {
            float dx = x - lx[i], dy = (y - ly[i]) * 1.15f; // the floor is seen at an angle: lit areas are ellipses
            float rr = lr[i] * lr[i], d2 = dx * dx + dy * dy;
            if (d2 >= rr) continue;
            dark *= 1f - ls[i] * profile((float) Math.sqrt(d2 / rr));
        }
        return 1f - dark;
    }

    /** Draws the dynamic lightmap over the screen (FULL). */
    void drawFull(Canvas c, int w, int h) {
        int mw = Math.max(8, w / SCALE), mh = Math.max(8, h / SCALE);
        if (map == null || mapW != mw || mapH != mh) {
            mapW = mw;
            mapH = mh;
            map = Bitmap.createBitmap(mw, mh, Bitmap.Config.ALPHA_8);
            mapC = new Canvas(map);
        }
        mapC.drawColor((Math.round(ambient * 255f) << 24), PorterDuff.Mode.SRC);
        float inv = 1f / SCALE;
        for (int i = 0; i < n; i++) {
            float r = lr[i] * inv;
            rf.set(lx[i] * inv - r, ly[i] * inv - r * 0.87f, lx[i] * inv + r, ly[i] * inv + r * 0.87f);
            out.setAlpha(Math.round(255f * ls[i]));
            mapC.drawBitmap(blob, null, rf, out);
        }
        dst.set(0, 0, w, h);
        c.drawBitmap(map, null, dst, draw);
    }

    /** LOW: one precomputed map, the player's light in the middle of the screen. */
    void drawStatic(Canvas c, int w, int h, float radiusPx) {
        int mw = Math.max(8, w / SCALE), mh = Math.max(8, h / SCALE);
        if (staticMap == null || staticW != mw || staticH != mh || staticRadius != radiusPx + ambient) {
            staticW = mw;
            staticH = mh;
            staticRadius = radiusPx + ambient;
            if (staticMap == null || staticMap.getWidth() != mw || staticMap.getHeight() != mh) {
                staticMap = Bitmap.createBitmap(mw, mh, Bitmap.Config.ALPHA_8);
                staticC = new Canvas(staticMap);
            }
            staticC.drawColor((Math.round(ambient * 255f) << 24), PorterDuff.Mode.SRC);
            float inv = 1f / SCALE, r = radiusPx * inv;
            rf.set(mw / 2f - r, mh / 2f - r * 0.87f, mw / 2f + r, mh / 2f + r * 0.87f);
            out.setAlpha(255);
            staticC.drawBitmap(blob, null, rf, out);
        }
        dst.set(0, 0, w, h);
        c.drawBitmap(staticMap, null, dst, draw);
    }

    /** Faint coloured glow of the warm and green lights, added over the lit floor and sprites (above the darkness). */
    void drawGlows(Canvas c) {
        for (int i = 0; i < n; i++) {
            if (lk[i] == NEUTRAL) continue;
            float r = lr[i] * 0.85f;
            rf.set(lx[i] - r, ly[i] - r * 0.87f, lx[i] + r, ly[i] + r * 0.87f);
            glow.setColor(lk[i] == WARM ? Color.argb(70, 255, 140, 50) : Color.argb(62, 40, 255, 130));
            c.drawBitmap(blob, null, rf, glow);
        }
    }
}
