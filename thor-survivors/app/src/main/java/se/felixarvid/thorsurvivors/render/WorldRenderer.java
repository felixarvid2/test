package se.felixarvid.thorsurvivors.render;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.ColorMatrixColorFilter;
import android.graphics.LightingColorFilter;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffColorFilter;
import android.graphics.PorterDuffXfermode;
import android.graphics.RadialGradient;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Shader;

import se.felixarvid.thorsurvivors.game.Engine;
import se.felixarvid.thorsurvivors.game.Entities;
import se.felixarvid.thorsurvivors.game.Entities.Corpse;
import se.felixarvid.thorsurvivors.game.Entities.DamageText;
import se.felixarvid.thorsurvivors.game.Entities.Effect;
import se.felixarvid.thorsurvivors.game.Entities.Enemy;
import se.felixarvid.thorsurvivors.game.Entities.Particle;
import se.felixarvid.thorsurvivors.game.Entities.Pickup;
import se.felixarvid.thorsurvivors.game.Entities.Projectile;
import se.felixarvid.thorsurvivors.game.EnemyType;
import se.felixarvid.thorsurvivors.game.MetaProgress;
import se.felixarvid.thorsurvivors.game.Sim;
import se.felixarvid.thorsurvivors.game.WorldGen;
import se.felixarvid.thorsurvivors.render.SpriteAtlas.Clip;
import se.felixarvid.thorsurvivors.render.SpriteAtlas.Img;
import se.felixarvid.thorsurvivors.render.SpriteAtlas.Model;

/**
 * Draws the game world on the top screen: the dark Ashfall look.
 *
 * Pass order (design section 10): ground chunks (rock + decals) -> darkness over the ground -> soft shadows ->
 * pickups and corpses -> props, enemies and the player in one y-sorted pass, each with a brightness taken from the same
 * lights -> projectiles and effects (additive, above the darkness) -> coloured light glows -> numbers and bars.
 *
 * Animated creatures are 8-direction baked sprites ({@link SpriteAtlas.Model}): the direction comes from the movement
 * or facing, the clip from the state (walk, attack, death), the clip time from a per-entity clock, and walking fps is
 * scaled by the movement speed. Frames are drawn 1:1 at integer screen positions. Unrigged models (hound, drone, tentacle,
 * the big ones) have one still frame per direction and get a procedural bob, squash and sway instead. The hit flash is a
 * white colour filter on the same frame. Nothing is allocated per frame: sort scratch is preallocated, paints, filters and
 * rectangles are reused.
 *
 * Draw order is a strict total order that does not depend on the pool order of the simulation: ground pickups, then props,
 * enemies and the player by (feet y, id), then projectiles by (y, x, kind, slot).
 */
public final class WorldRenderer {
    private static final int MAX_TEXTS_DRAWN = 25;
    /** Hit flashes turn into a soft brighten once this many enemies flash at the same time (no white blob). */
    private static final int MANY_FLASHING = 4;
    private static final int MAX_PROPS = 600, DEST_PROP = -1;
    private static final float FLASH_ON = 0.08f, FLASH_GAP = 0.15f, HIT_TINT = 0.12f, VIGNETTE = 0.35f;
    private static final float HIT_CLIP = 0.18f, ATTACK_CLIP = 0.38f, DEATH_CLIP = 0.7f, BOSS_DEATH_CLIP = 1.3f, FADE = 0.5f;
    private static final int STATE = 4096;
    /** Brightness floors (0..1): enemies and their shots never drop below 60 % (design readability rule 1). */
    private static final float FLOOR_ENEMY = 0.64f, FLOOR_PLAYER = 0.92f, FLOOR_PROP = 0.16f, FLOOR_PICK = 0.5f;
    private static final int SHADES = 16;
    /** Creatures are drawn this much brighter than the bake (clamped), so dark models stay readable on dark ground. */
    private static final float ENEMY_GAIN = 1.8f;
    /** Multiply tints of the rock texture per stage: Cinder Flats ash grey, Deep Mines darker and colder. */
    private static final int TINT_FLATS = 0xFF8C8680, TINT_MINES = 0xFF6F7480;

    private final SpriteAtlas atlas = SpriteAtlas.get();
    private final Paint bmp = new Paint(Paint.FILTER_BITMAP_FLAG);
    private final Paint add = new Paint(Paint.FILTER_BITMAP_FLAG);
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint big = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint vig = new Paint();
    private final RectF rect = new RectF();
    private final Rect src = new Rect(), dst = new Rect();
    private RadialGradient vigShader;
    private int vigW, vigH;
    private final Bitmap[] shadows = new Bitmap[321];
    private boolean shadowsReady;
    private final Lighting light = new Lighting();

    // colour filters (created once)
    private final ColorFilter fWhite = new PorterDuffColorFilter(0xFFFFFFFF, PorterDuff.Mode.SRC_ATOP);
    private final ColorFilter fBright = new LightingColorFilter(0xFFFFFFFF, 0x00606060);
    private final ColorFilter fRed = new LightingColorFilter(0xFFFF6A6A, 0x00500000);
    private final ColorFilter fIce = new LightingColorFilter(0xFF90B8FF, 0x00102040);
    private final ColorFilter[] shade = new ColorFilter[SHADES + 1], shadeLift = new ColorFilter[SHADES + 1];
    private static final int T_NORMAL = 0, T_WHITE = 1, T_BRIGHT = 2, T_RED = 3, T_ICE = 4;
    // additive tints
    private final ColorFilter fCyan = new LightingColorFilter(0xFFA8FFF0, 0), fGreen = new LightingColorFilter(0xFF70FF98, 0),
            fViolet = new LightingColorFilter(0xFFC090FF, 0), fOrange = new LightingColorFilter(0xFFFFA860, 0),
            fRedAdd = new LightingColorFilter(0xFFFF5040, 0), fGold = new LightingColorFilter(0xFFFFE080, 0);

    // sort scratch (pool-sized, reused)
    private final long[] sKey = new long[Sim.MAX_PICK];
    private final int[] sIdx = new int[Sim.MAX_PICK];
    private final Model[] entModel = new Model[Sim.MAX_ENEMIES + 1];
    private final float[] entScale = new float[Sim.MAX_ENEMIES + 1];
    private final int[] entSx = new int[Sim.MAX_ENEMIES + 1];
    private final int[] entSy = new int[Sim.MAX_ENEMIES + 1];
    private final int[] bossIdx = new int[24];
    private final float[] lifeTmp = new float[Sim.MAX_TEXT];

    // per-enemy render state, keyed by enemy id (pool slots are reshuffled by swap-remove, ids are not)
    private final int[] stId = new int[STATE];
    private final float[] stFlash = new float[STATE];
    private final byte[] stDir = new byte[STATE];

    // player feedback
    private Sim lastSim;
    private float lastHp, lastPx, lastPy;
    private double redUntil, hitAt = -10;
    private boolean moving;
    private long lastNs;
    private float deathT;
    private int playerDir;

    // per-frame transform
    private float sc, ks;
    private int ox, oy, scrW, scrH, tilePx, lightMode;
    private double now;
    private int flashing;

    // exposed so tests can verify draw order
    public int orderN;
    public final int[] orderId = new int[Sim.MAX_ENEMIES + 1];
    public final int[] orderFeet = new int[Sim.MAX_ENEMIES + 1];
    public final int[] orderSx = new int[Sim.MAX_ENEMIES + 1];
    public final int[] orderSy = new int[Sim.MAX_ENEMIES + 1];
    public final float[] orderWy = new float[Sim.MAX_ENEMIES + 1];
    public int textsDrawn;
    /** Lights used by the last frame (tests). */
    public int lightsUsed;

    private final DemoEnemy[] demo = new DemoEnemy[6];

    private static final class DemoEnemy {
        EnemyType type;
        boolean boss;
    }

    public WorldRenderer() {
        bmp.setDither(false);
        add.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.ADD));
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeCap(Paint.Cap.ROUND);
        text.setTextAlign(Paint.Align.CENTER);
        text.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        big.setTextAlign(Paint.Align.CENTER);
        big.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        for (int i = 0; i <= SHADES; i++) {
            int v = Math.round(255f * i / SHADES);
            shade[i] = new LightingColorFilter(0xFF000000 | (v << 16) | (v << 8) | v, 0);
            // creatures are brightened (the baked models are dark) and keep a little lift so they never sink into the floor
            float g = ENEMY_GAIN * Math.min(1f, (float) i / SHADES), t = (255 - v) * 0.12f;
            shadeLift[i] = new ColorMatrixColorFilter(new float[]{g, 0, 0, 0, t, 0, g, 0, 0, t, 0, 0, g, 0, t, 0, 0, 0, 1, 0});
        }
        shade[SHADES] = null; // fully lit props and pickups need no filter
        // a ColorFilter creates its native object the first time it is set on a Paint: do it for all of them now, not mid-frame
        ColorFilter[][] all = {shade, shadeLift, {fWhite, fBright, fRed, fIce, fCyan, fGreen, fViolet, fOrange, fRedAdd, fGold}};
        for (ColorFilter[] set : all) for (ColorFilter f : set) if (f != null) glowPaint.setColorFilter(f);
        glowPaint.setColorFilter(null);
    }

    private void ensureDemo(Engine e) {
        if (demo[0] != null || e.data == null) return;
        String[] keys = {"BAT1", "ZOMBIE", "SKELETON", "GHOST", "WEREWOLF", "XLMUMMY"};
        for (int i = 0; i < keys.length; i++) {
            demo[i] = new DemoEnemy();
            if (e.data.enemies.containsKey(keys[i])) demo[i].type = new EnemyType(e.data.enemies.get(keys[i]));
            demo[i].boss = i == 5;
        }
    }

    private int sx(float wx) {
        return Math.round(wx * sc) + ox;
    }

    private int sy(float wy) {
        return Math.round(wy * sc) + oy;
    }

    public void draw(Canvas c, int w, int h, Engine e, boolean dualScreen) {
        c.drawColor(0xFF000000);
        orderN = 0;
        textsDrawn = 0;
        if (!e.isReady()) return;
        ensureDemo(e);
        Sim s = e.sim;
        int ph = e.phase;
        boolean menu = s == null || ph == Engine.PH_MENU || ph == Engine.PH_SHOP;
        sc = h / Sim.VIEW_H;
        ks = h / 1080f;
        scrW = w;
        scrH = h;
        lightMode = e.meta != null ? e.meta.lighting : MetaProgress.LIGHT_FULL;
        long t = System.nanoTime();
        float realDt = lastNs == 0 ? 0f : Math.min(0.1f, (t - lastNs) / 1e9f);
        lastNs = t;
        float camX, camY;
        if (menu) {
            now = e.menuTime;
            camX = e.menuTime * 40f;
            camY = (float) Math.sin(e.menuTime * 0.3f) * 60f;
        } else {
            now = s.time;
            camX = s.px;
            camY = s.py;
            trackPlayer(s, realDt);
        }
        int camPx = Math.round(camX * sc), camPy = Math.round(camY * sc);
        ox = w / 2 - camPx;
        oy = h / 2 - camPy;
        String stage = e.stageKeys.get(e.stageIdx);
        tilePx = Math.max(8, Math.round(WorldGen.TILE * sc));
        boolean mines = "LIBRARY".equals(stage);
        ground.setup(WorldGen.of(stage), stage, tilePx, mines ? TINT_MINES : TINT_FLATS);
        bmp.setColorFilter(null);
        bmp.setAlpha(255);
        ground.draw(c, bmp, ox, oy, camPx, camPy, w, h);
        gen = WorldGen.of(stage);
        listProps();
        float[] lp = e.data.lightingOf(stage);
        setupLights(c, w, h, e, s, menu, lp);
        if (menu) {
            drawPropsOnly(c, e, stage);
            drawDemo(c, e);
        } else {
            drawWorld(c, s, stage);
        }
        if (lightMode == MetaProgress.LIGHT_FULL) light.drawGlows(c);
        drawMood(c, w, h);
        drawOverlay(c, w, h, e, s, menu, dualScreen);
    }

    // ------------------------------------------------------------------ lights

    /** Collects the lights of the frame and draws the darkness over the ground (FULL: dynamic map, LOW: static, OFF: none). */
    private void setupLights(Canvas c, int w, int h, Engine e, Sim s, boolean menu, float[] lp) {
        light.begin(lp[0]);
        float pr = lp[1] * sc;
        if (menu) {
            light.add(w / 2f, h * 0.55f, 300f * sc, 1f, Lighting.WARM);
        } else {
            light.add(sx(s.px), sy(s.py) - 28f * ks, pr, 1f, Lighting.NEUTRAL);
        }
        if (lightMode == MetaProgress.LIGHT_FULL) {
            if (!menu) gatherDynamicLights(s);
            gatherPropLights(c, menu);
            if (!DBG_NO_MASK) light.drawFull(c, w, h);
        } else if (lightMode == MetaProgress.LIGHT_LOW) {
            light.n = 1;
            light.drawStatic(c, w, h, pr);
        }
        lightsUsed = light.n;
    }

    private int propLightN;

    /** Fire, flashes and blasts light the ground around them (r70 orange, explosions r150 for a moment). */
    private void gatherDynamicLights(Sim s) {
        int fires = 0;
        for (int i = 0; i < s.projN && fires < 3; i++) {
            Projectile p = s.projs[i];
            if (p.kind != Entities.P_FIRE) continue;
            int px = sx(p.x), py = sy(p.y);
            if (px < -200 || px > scrW + 200 || py < -200 || py > scrH + 200) continue;
            light.add(px, py, 70f * sc * (p.evo ? 1.4f : 1f), 0.9f, Lighting.WARM);
            fires++;
        }
        for (int i = 0; i < Sim.MAX_FX && light.n < Lighting.MAX - 4; i++) {
            Effect f = s.fx[i];
            if (f.life <= 0 || (f.kind != Entities.FX_FLASH && f.kind != Entities.FX_BLAST)) continue;
            float k = f.life / f.maxLife;
            float r = f.kind == Entities.FX_FLASH ? f.w : 70f;
            light.add(sx(f.x), sy(f.y), r * sc * (0.5f + 0.5f * k), Math.min(1f, k * 1.6f), Lighting.WARM);
        }
    }

    /** Emergency lights (warm, flickering) and lumen growths (green pulse) among the props near the view. */
    private void gatherPropLights(Canvas c, boolean menu) {
        for (int j = 0; j < propN; j++) {
            int k = prKind[j];
            if (k != WorldGen.P_LIGHT && k != WorldGen.P_LUMEN) continue;
            if (prSx[j] < -300 || prSx[j] > scrW + 300 || prSy[j] < -300 || prSy[j] > scrH + 300) continue;
            if (k == WorldGen.P_LIGHT) {
                float fl = 0.9f + 0.1f * (float) Math.sin(now * 11.0 + j) * (float) Math.sin(now * 4.3 + j * 2.0);
                light.add(prSx[j], prSy[j] - 60f * ks, 130f * sc * fl, 0.95f, Lighting.WARM);
            } else {
                float pu = 0.85f + 0.15f * (float) Math.sin(now * 2.2 + j * 1.7);
                light.add(prSx[j], prSy[j] - 12f * ks, 90f * sc * pu, 0.8f, Lighting.GREEN);
            }
        }
    }

    /** Per-sprite colour filter for a point at the given floor brightness, or null when fully lit. */
    private ColorFilter shadeAt(float x, float y, float floor) {
        return shadeAt(x, y, floor, shade);
    }

    static boolean DBG_NO_SHADE, DBG_NO_MASK;

    private ColorFilter shadeAt(float x, float y, float floor, ColorFilter[] set) {
        if (DBG_NO_SHADE) return null;
        float b;
        if (lightMode == MetaProgress.LIGHT_OFF) return set[SHADES];
        if (lightMode == MetaProgress.LIGHT_LOW) {
            float dx = x - scrW / 2f, dy = (y - scrH / 2f) * 1.15f, r = light.lr[0] > 0 ? light.lr[0] : 400f;
            float d = (float) Math.sqrt(dx * dx + dy * dy) / r;
            b = 1f - light.ambient * (1f - Lighting.profile(d));
        } else {
            b = light.brightness(x, y);
        }
        if (b < floor) b = floor;
        int i = Math.round(b * SHADES);
        return set[Math.min(SHADES, i)];
    }

    private boolean warmed;

    /** Remembers hits on the player: a short red tint plus a vignette, no blinking and no shake. */
    private void trackPlayer(Sim s, float realDt) {
        if (s != lastSim) {
            lastSim = s;
            lastHp = s.hp;
            lastPx = s.px;
            lastPy = s.py;
            redUntil = 0;
            hitAt = -10;
            deathT = 0f;
        }
        if (s.hp < lastHp - 0.01f) {
            redUntil = now + HIT_TINT;
            hitAt = now;
        }
        lastHp = s.hp;
        moving = s.px != lastPx || s.py != lastPy;
        lastPx = s.px;
        lastPy = s.py;
        if (s.ended == 1) deathT += realDt; // the death clip runs on the wall clock: the sim stops when you die
        else deathT = 0f;
    }

    // ------------------------------------------------------------------ ground & props

    private final GroundCache ground = new GroundCache();

    // y-sorted props: stage props (kind = WorldGen prop kind) and destructibles (kind = DEST_PROP, a = sim index)
    private final long[] prKey = new long[MAX_PROPS];
    private final int[] prIdx = new int[MAX_PROPS], prKind = new int[MAX_PROPS], prA = new int[MAX_PROPS],
            prSx = new int[MAX_PROPS], prSy = new int[MAX_PROPS];
    private int propN;
    private final float[] lstX = new float[WorldGen.MAX_LIST], lstY = new float[WorldGen.MAX_LIST];
    private final int[] lstK = new int[WorldGen.MAX_LIST];
    private WorldGen gen;
    private final Img[] propImg = new Img[WorldGen.PROP.length];
    private boolean propsResolved;

    /** Lists the props around the view into the prop arrays (unsorted). */
    private void listProps() {
        if (!propsResolved) {
            for (int i = 0; i < propImg.length; i++) propImg[i] = atlas.img("prop." + WorldGen.PROP[i]);
            propsResolved = true;
        }
        propN = 0;
        int m = 3; // tiles of margin: tall props (smokestack, walls) reach into view from below
        int camPx = scrW / 2 - ox, camPy = scrH / 2 - oy;
        int tx0 = Math.floorDiv(camPx - scrW / 2, tilePx) - m, tx1 = Math.floorDiv(camPx + scrW / 2, tilePx) + m;
        int ty0 = Math.floorDiv(camPy - scrH / 2, tilePx) - m, ty1 = Math.floorDiv(camPy + scrH / 2, tilePx) + m + 4;
        int n = gen.props(tx0, ty0, tx1, ty1, lstX, lstY, lstK);
        for (int i = 0; i < n && propN < MAX_PROPS; i++) {
            Img im = propImg[lstK[i]];
            if (im == null) continue;
            int px = Math.round(lstX[i] * tilePx) + ox, py = Math.round(lstY[i] * tilePx) + oy;
            int mx = Math.round(im.w() * ks), my = Math.round(im.h() * ks);
            if (px < -mx || px > scrW + mx || py < -60 || py > scrH + my + 60) continue;
            addProp(lstK[i], 0, px, py);
        }
    }

    private void addProp(int kind, int a, int px, int py) {
        int n = propN++;
        prKind[n] = kind;
        prA[n] = a;
        prSx[n] = px;
        prSy[n] = py;
        prKey[n] = (bias(py) << 32) | n;
        prIdx[n] = n;
    }

    private void drawProp(Canvas c, Sim s, int j) {
        int i = prIdx[j];
        int px = prSx[i], py = prSy[i];
        Img im;
        if (prKind[i] == DEST_PROP) {
            im = s == null ? null : atlas.img(destImg(s.destType()));
        } else {
            im = propImg[prKind[i]];
        }
        if (im == null) return;
        float sc2 = ks;
        drawShadow(c, px, py - 2, Math.max(10, Math.round(im.w() * sc2 * 0.36f)));
        bmp.setColorFilter(shadeAt(px, py - im.ay * ks * 0.3f, prKind[i] == DEST_PROP ? 0.45f : FLOOR_PROP));
        bmp.setAlpha(255);
        blit(c, im, px, py, sc2, bmp);
        bmp.setColorFilter(null);
    }

    private static String destImg(String type) {
        return "CANDELABRA".equals(type) ? "prop.supply_chest" : "prop.explosive_barrel";
    }

    /** Draws an image with its anchor at (x, y), scaled; integer rectangles so 1:1 stays crisp. */
    private void blit(Canvas c, Img im, int x, int y, float scale, Paint p) {
        int l = x - Math.round(im.ax * scale), t = y - Math.round(im.ay * scale);
        dst.set(l, t, l + Math.max(1, Math.round(im.w() * scale)), t + Math.max(1, Math.round(im.h() * scale)));
        c.drawBitmap(im.sheet, im.src, dst, p);
    }

    /** Same, but with independent width and height in pixels, centred on (x, y) (effects). */
    private void blitBox(Canvas c, Img im, float cx, float cy, float wpx, float hpx, Paint p) {
        dst.set(Math.round(cx - wpx / 2f), Math.round(cy - hpx / 2f), Math.round(cx + wpx / 2f), Math.round(cy + hpx / 2f));
        c.drawBitmap(im.sheet, im.src, dst, p);
    }

    /** Additive effect picture: centred at (x, y), longest side {@code size} px, rotated by deg, with tint and alpha 0..255. */
    private void glow(Canvas c, Img im, float x, float y, float size, float deg, ColorFilter tint, int alpha) {
        if (im == null || alpha <= 0) return;
        float k = size / Math.max(im.w(), im.h());
        add.setColorFilter(tint);
        add.setAlpha(Math.min(255, alpha));
        if (deg != 0f) {
            c.save();
            c.rotate(deg, x, y);
            blitBox(c, im, x, y, im.w() * k, im.h() * k, add);
            c.restore();
        } else {
            blitBox(c, im, x, y, im.w() * k, im.h() * k, add);
        }
    }

    private void drawPropsOnly(Canvas c, Engine e, String stage) {
        sort(prKey, prIdx, propN);
        for (int j = 0; j < propN; j++) drawProp(c, null, j);
    }

    private Bitmap moodBm;
    private final Paint glowPaint = new Paint(Paint.FILTER_BITMAP_FLAG);
    private int moodW, moodH;

    /** Soft dark edge vignette, only with lighting OFF (the lightmap does this job otherwise). */
    private void drawMood(Canvas c, int w, int h) {
        if (lightMode != MetaProgress.LIGHT_OFF) return;
        if (moodBm == null || moodW != w || moodH != h) {
            moodW = w;
            moodH = h;
            int bw = 192, bh = Math.max(16, Math.round(192f * h / w));
            int[] px = new int[bw * bh];
            for (int y = 0; y < bh; y++) {
                for (int x = 0; x < bw; x++) {
                    float nx = (x + 0.5f) / bw * 2f - 1f, ny = (y + 0.5f) / bh * 2f - 1f;
                    float d = (float) Math.sqrt(nx * nx + ny * ny) / 1.4142f;
                    float u = Math.max(0f, Math.min(1f, (d - 0.45f) / 0.55f));
                    px[y * bw + x] = ((int) (u * u * (3f - 2f * u) * 150f) << 24) | 0x05060A;
                }
            }
            if (moodBm == null || moodBm.getWidth() != bw || moodBm.getHeight() != bh) {
                moodBm = Bitmap.createBitmap(bw, bh, Bitmap.Config.ARGB_8888);
            }
            moodBm.setPixels(px, 0, bw, 0, 0, bw, bh);
        }
        rect.set(0, 0, w, h);
        c.drawBitmap(moodBm, null, rect, glowPaint);
    }

    // ------------------------------------------------------------------ menu preview

    private void drawDemo(Canvas c, Engine e) {
        float t = e.menuTime;
        float camX = (ox - scrW / 2) / -sc, camY = (oy - scrH / 2) / -sc;
        for (int i = 0; i < demo.length; i++) {
            DemoEnemy d = demo[i];
            if (d == null || d.type == null) continue;
            float x = camX + (i - 2.5f) * 150f;
            float y = camY + 150f + (float) Math.sin(t * 2 + i) * 14f;
            Model m = atlas.model(d.boss ? d.type.bossModel : d.type.model);
            if (m == null) continue;
            int px = sx(x), py = sy(y);
            drawShadow(c, px, py, Math.round(20 * ks * (d.boss ? 2.4f : 1f)));
            bmp.setColorFilter(shadeAt(px, py, FLOOR_ENEMY, shadeLift));
            drawCreature(c, m, d.type, d.boss, px, py, 0, t + i, (float) i, 60f, false, false, false);
            bmp.setColorFilter(null);
        }
        String hk = e.meta == null ? null : e.meta.heroKey();
        Model pm = atlas.model(hk == null ? "bastion" : e.data.heroes.get(hk).model);
        if (pm != null) {
            int px = sx(camX), py = sy(camY + 20f);
            drawShadow(c, px, py, Math.round(22 * ks));
            bmp.setColorFilter(null);
            drawFrameAt(c, pm, SpriteAtlas.C_IDLE, 0, SpriteAtlas.frameAt(pm.clip(SpriteAtlas.C_IDLE), t, 1.5f), px, py, ks, 1f, 1f, 0, bmp);
        }
    }

    // ------------------------------------------------------------------ helpers

    private static int hop(double anim, float hz, float amp) {
        return Math.round((float) Math.abs(Math.sin(anim * Math.PI * hz)) * amp);
    }

    /**
     * Draws frame fi of a clip for direction dir with the feet at (fx, fy). Scale s uniform, sw/sh extra squash about the
     * feet, yOff a vertical offset in px. All integers at s = 1.
     */
    private void drawFrameAt(Canvas c, Model m, int clipId, int dir, int fi, int fx, int fy, float s, float sw, float sh,
                             int yOff, Paint p) {
        Clip cl = m.clip(clipId);
        if (cl == null) return;
        int o = (dir * cl.count + Math.max(0, Math.min(cl.count - 1, fi))) * 6;
        int w = cl.r[o + 2], h = cl.r[o + 3];
        if (w == 0 || h == 0) return;
        float k = s * sw, kv = s * sh;
        int l = fx + Math.round((cl.r[o + 4] - m.ax) * k), t = fy + yOff + Math.round((cl.r[o + 5] - m.ay) * kv);
        src.set(cl.r[o], cl.r[o + 1], cl.r[o] + w, cl.r[o + 1] + h);
        dst.set(l, t, l + Math.max(1, Math.round(w * k)), t + Math.max(1, Math.round(h * kv)));
        c.drawBitmap(m.sheet, src, dst, p);
    }

    /** 8-direction index (S, SE, E, NE, N, NW, W, SW) of a screen-space vector (y down). */
    static int dirOf(float dx, float dy) {
        float a = (float) Math.atan2(dy, dx); // E = 0, S = pi/2
        int d = Math.round(((float) (Math.PI / 2) - a) / (float) (Math.PI / 4));
        return ((d % 8) + 8) % 8;
    }

    /**
     * One creature at its feet position: state clips for rigged models, procedural motion for still ones. t is its own
     * clock, speed its movement speed in world units/s (scales the walk fps), dir the 8-way facing.
     */
    private void drawCreature(Canvas c, Model m, EnemyType type, boolean boss, int fx, int fy, int dir, double t, float seed,
                              float speed, boolean attacking, boolean frozen, boolean slowed) {
        float s = ks * visualScale(type, boss, m);
        Paint p = bmp;
        if (m.rigged()) {
            Clip walk = m.clip(SpriteAtlas.C_WALK);
            if (attacking && m.clip(SpriteAtlas.C_ATTACK) != null) {
                Clip a = m.clip(SpriteAtlas.C_ATTACK);
                int fi = ((int) (t * a.count / 0.9)) % a.count;
                drawFrameAt(c, m, SpriteAtlas.C_ATTACK, dir, fi, fx, fy, s, 1f, 1f, 0, p);
                return;
            }
            float fps = Math.max(4f, Math.min(15f, walk.count * speed * sc / 78f)) * (slowed ? 0.4f : 1f);
            int fi = frozen ? 0 : ((int) (t * fps)) % walk.count;
            drawFrameAt(c, m, SpriteAtlas.C_WALK, dir, fi, fx, fy, s, 1f, 1f, 0, p);
            return;
        }
        // unrigged: one still per direction, moved procedurally
        float hz = 2.2f, amp = 3f * s, sway = 0f, squash = 0f;
        switch (m.name) {
            case "spore_hound": hz = 5.5f; amp = 6f * s; squash = 0.06f; break;
            case "security_drone": hz = 1.1f; amp = 9f * s; break;
            case "lumen_tentacle": hz = 0.9f; amp = 1f * s; sway = 3.5f; squash = 0.04f; break;
            case "the_first": hz = 0.5f; amp = 2f * s; sway = 0.8f; squash = 0.015f; break;
            default: hz = 1.6f; amp = 2.5f * s; sway = 0.6f; squash = 0.02f; break; // cargo_loader, slagborn
        }
        float ph = (float) (t * hz * Math.PI * 2 + seed);
        float bob = frozen ? 0f : (float) Math.abs(Math.sin(ph * 0.5)) * amp;
        float sq = frozen ? 0f : (float) Math.sin(ph) * squash;
        float deg = frozen ? 0f : (float) Math.sin(ph * 0.5 + 1.3) * sway;
        float lift = m.name.equals("security_drone") ? 14f * s : 0f; // hovers above its shadow
        int yOff = -Math.round(bob + lift);
        if (deg != 0f) {
            c.save();
            c.rotate(deg, fx, fy);
            drawFrameAt(c, m, SpriteAtlas.C_STATIC, dir, 0, fx, fy, s, 1f - sq, 1f + sq, yOff, p);
            c.restore();
        } else {
            drawFrameAt(c, m, SpriteAtlas.C_STATIC, dir, 0, fx, fy, s, 1f - sq, 1f + sq, yOff, p);
        }
    }

    private static float visualScale(EnemyType t, boolean boss, Model m) {
        if (boss) return m.name.equals("the_first") ? 0.8f : 1f;
        return t.def.key.startsWith("XL") ? 1.3f : 1f;
    }

    /** Soft dark ellipse under a ground sprite; one pre-rendered bitmap per width. */
    private void drawShadow(Canvas c, int cx, int cy, int halfW) {
        int w = Math.max(8, Math.min(320, (halfW * 2 + 7) & ~7)); // steps of 8 px: at most 40 bitmaps, all made on the first frame
        if (!shadowsReady) {
            shadowsReady = true;
            for (int i = 8; i <= 320; i += 8) drawShadow(c, -1000, -1000, i / 2);
        }
        Bitmap b = shadows[w];
        if (b == null) {
            int hgt = Math.max(4, w * 3 / 8);
            b = Bitmap.createBitmap(w, hgt, Bitmap.Config.ARGB_8888);
            Canvas sc2 = new Canvas(b);
            fill.setColor(0x90000000);
            rect.set(0, 0, w, hgt);
            sc2.drawOval(rect, fill);
            shadows[w] = b;
        }
        bmp.setColorFilter(null);
        bmp.setAlpha(255);
        c.drawBitmap(b, cx - b.getWidth() / 2, cy - b.getHeight() / 2, bmp);
    }

    private static void sort(long[] key, int[] idx, int n) {
        for (int i = 1; i < n; i++) {
            long k = key[i];
            int v = idx[i];
            int j = i - 1;
            while (j >= 0 && key[j] > k) {
                key[j + 1] = key[j];
                idx[j + 1] = idx[j];
                j--;
            }
            key[j + 1] = k;
            idx[j + 1] = v;
        }
    }

    /** Pixel coordinate (biased so it is never negative) -> sortable bits. */
    private static long bias(int v) {
        return (long) (v + 32768) & 0xFFFFL;
    }

    // ------------------------------------------------------------------ world

    private void drawWorld(Canvas c, Sim s, String stage) {
        final int w = scrW, h = scrH, m = 200;
        float t = (float) now;
        boolean frozen = s.freezeTimer > 0;

        // 1. auras and puddles lie on the ground
        for (int i = 0; i < s.inv.weaponCount; i++) {
            Sim.WeaponState ws = s.weapons[i];
            if (ws.behavior == Sim.B_GARLIC) drawAura(c, ws, s);
        }
        for (int i = 0; i < s.projN; i++) {
            Projectile p = s.projs[i];
            if (p.kind == Entities.P_PUDDLE && p.maxLife - p.life >= p.flight) drawPuddle(c, p, t);
        }

        // 2. pickups, y-sorted (flat on the ground, under the creatures); corpses first
        drawCorpses(c, s);
        int np = 0;
        for (int i = 0; i < s.pickN; i++) {
            Pickup p = s.picks[i];
            int px = sx(p.x), py = sy(p.y);
            if (px < -m || px > w + m || py < -m || py > h + m) continue;
            sKey[np] = (bias(py) << 40) | (bias(px) << 24) | (p.kind << 16) | (Float.floatToIntBits(p.value) & 0xFFFF);
            sIdx[np++] = i;
        }
        sort(sKey, sIdx, np);
        for (int j = 0; j < np; j++) drawPickup(c, s.picks[sIdx[j]]);

        // 3. enemies + player (visible only), strictly ordered by (feet y, id)
        int n = 0, nb = 0;
        flashing = 0;
        for (int i = 0; i < s.enemyN; i++) {
            Enemy en = s.enemies[i];
            int px = sx(en.x), py = sy(en.y);
            if (px < -m || px > w + m || py < -m || py > h + m) continue;
            if (en.flash > 0) flashing++;
            Model mo = atlas.model(en.boss ? en.type.bossModel : en.type.model);
            entModel[i] = mo;
            entSx[i] = px;
            entSy[i] = py;
            sKey[n] = (bias(py) << 32) | (en.id & 0xFFFFFFFFL);
            sIdx[n++] = i;
            if (en.boss && nb < bossIdx.length) bossIdx[nb++] = i;
        }
        Model pm = atlas.model(s.hero == null ? "bastion" : s.hero.model);
        int ppx = sx(s.px), ppy = sy(s.py);
        int pi = s.enemyN; // the player rides as one extra entry after the enemies (id 0)
        sKey[n] = bias(ppy) << 32;
        sIdx[n++] = pi;
        sort(sKey, sIdx, n);

        // props (listed before the lights) join the creatures in the same y-sorted pass, with the destructibles
        if (s.destN > 0) {
            for (int i = 0; i < s.destN && propN < MAX_PROPS; i++) {
                int px = sx(s.destX[i]), py = sy(s.destY[i]);
                if (px < -m || px > w + m || py < -m || py > h + m) continue;
                addProp(DEST_PROP, i, px, py);
            }
        }
        sort(prKey, prIdx, propN);
        int pj = 0;

        // shadows first so a sprite in front always covers a shadow behind it
        for (int j = 0; j < n; j++) {
            int i = sIdx[j];
            if (i == pi) drawShadow(c, ppx, ppy, Math.round(24 * ks));
            else drawShadow(c, entSx[i], entSy[i], Math.round(s.enemies[i].radius * sc * 0.95f));
        }

        if (s.hero != null && s.ended == 0) drawAim(c, s, ppx, ppy);

        // 4. creatures in order
        orderN = 0;
        for (int j = 0; j < n; j++) {
            int i = sIdx[j];
            int feet = (int) (sKey[j] >>> 32) - 32768;
            while (pj < propN && propFeet(pj) <= feet) drawProp(c, s, pj++); // a prop at the same depth is behind
            if (i == pi) {
                drawPlayer(c, s, pm, ppx, ppy);
                recordOrder(0, feet, ppx, ppy, s.py);
                continue;
            }
            Enemy en = s.enemies[i];
            drawEnemy(c, s, en, entModel[i], entSx[i], entSy[i], frozen);
            recordOrder(en.id, feet, entSx[i], entSy[i], en.y);
        }
        while (pj < propN) drawProp(c, s, pj++);
        for (int b = 0; b < nb; b++) {
            Model bm = entModel[bossIdx[b]];
            drawBossBar(c, s.enemies[bossIdx[b]], entSx[bossIdx[b]], entSy[bossIdx[b]], bm == null ? 80 : Math.round(bm.headPx * ks));
        }

        // 5. projectiles, y-sorted (they fly above the crowd), additive
        int nq = 0;
        for (int i = 0; i < s.projN; i++) {
            Projectile p = s.projs[i];
            if (p.kind == Entities.P_PUDDLE && (p.maxLife - p.life) >= p.flight) continue;
            int px = sx(p.x), py = sy(p.y);
            if (px < -m * 2 || px > w + m * 2 || py < -m * 2 || py > h + m * 2) continue;
            sKey[nq] = (bias(py) << 40) | (bias(px) << 24) | ((p.kind & 15) << 8) | (p.slot & 255);
            sIdx[nq++] = i;
        }
        sort(sKey, sIdx, nq);
        for (int j = 0; j < nq; j++) drawProjectile(c, s, s.projs[sIdx[j]], t);

        // 6. effects, sparks, hp bar, numbers
        for (int i = 0; i < Sim.MAX_FX; i++) {
            Effect f = s.fx[i];
            if (f.life > 0) drawFx(c, f);
        }
        drawParticles(c, s);
        drawPlayerBar(c, s, ppx, ppy);
        drawTexts(c, s);
    }

    private int propFeet(int j) {
        return (int) (prKey[j] >>> 32) - 32768;
    }

    private void recordOrder(int id, int feet, int sxp, int syp, float wy) {
        int n = orderN++;
        orderId[n] = id;
        orderFeet[n] = feet;
        orderSx[n] = sxp;
        orderSy[n] = syp;
        orderWy[n] = wy;
    }

    // ------------------------------------------------------------------ creatures

    /** Enemy hit flash (white silhouette) and facing, with per-enemy hysteresis; returns true while flashing. */
    private boolean stateFor(Enemy en, float playerX, float playerY) {
        int hs = en.id & (STATE - 1);
        if (stId[hs] != en.id) {
            stId[hs] = en.id;
            stFlash[hs] = -10f;
            stDir[hs] = (byte) dirOf(playerX - en.x, (playerY - en.y) * 1f);
        }
        // direction of movement = toward the player; keep the old one until the new one is clearly different
        float dx = playerX - en.x, dy = playerY - en.y;
        if (dx * dx + dy * dy > 16f) {
            int want = dirOf(dx, dy), cur = stDir[hs];
            if (want != cur) {
                float a = (float) Math.atan2(dy, dx), centre = (float) (Math.PI / 2 - cur * Math.PI / 4);
                float diff = Math.abs((float) Math.atan2(Math.sin(a - centre), Math.cos(a - centre)));
                if (diff > Math.PI / 8 + 0.2f) stDir[hs] = (byte) want;
            }
        }
        float since = (float) (now - stFlash[hs]);
        if (since < FLASH_ON && since >= 0) return true;
        if (en.flash > 0 && since >= FLASH_GAP) {
            stFlash[hs] = (float) now;
            return true;
        }
        return false;
    }

    private void drawEnemy(Canvas c, Sim s, Enemy en, Model m, int px, int py, boolean frozen) {
        boolean flash = stateFor(en, s.px, s.py);
        if (m == null) {
            fill.setColor(0xFF7A4A3A);
            c.drawCircle(px, py - en.radius * sc, en.radius * sc, fill);
            return;
        }
        int dir = stDir[en.id & (STATE - 1)];
        boolean soft = en.softFlash || flashing >= MANY_FLASHING; // lightning / crowds: brighten, never a white silhouette
        ColorFilter cf;
        if (flash) cf = soft ? fBright : fWhite;
        else if (frozen) cf = fIce;
        else cf = shadeAt(px, py - 30f * ks, FLOOR_ENEMY, en.boss ? shade : shadeLift); // bosses are big and already pale: no gain
        bmp.setColorFilter(cf);
        bmp.setAlpha((int) (255 * en.type.alpha));
        float dx = s.px - en.x, dy = s.py - en.y, rr = en.radius * 0.8f + Sim.PLAYER_R * 0.8f + 8f;
        boolean attacking = dx * dx + dy * dy < rr * rr;
        drawCreature(c, m, en.type, en.boss, px, py, dir, en.anim, en.id * 0.7f, en.speed, attacking, frozen, en.blocked);
        bmp.setColorFilter(null);
        bmp.setAlpha(255);
    }

    /** Dying enemies: the death clip once, a short hold, then a fade; unrigged ones flatten and fade. */
    private void drawCorpses(Canvas c, Sim s) {
        for (int i = 0; i < Sim.MAX_CORPSES; i++) {
            Corpse k = s.corpses[i];
            if (!k.active) continue;
            int px = sx(k.x), py = sy(k.y);
            if (px < -200 || px > scrW + 200 || py < -200 || py > scrH + 200) continue;
            Model m = atlas.model(k.boss ? k.type.bossModel : k.type.model);
            if (m == null) continue;
            float life = Sim.CORPSE_LIFE;
            float alpha = k.age < life - FADE ? 1f : Math.max(0f, (life - k.age) / FADE);
            float clipT = k.boss ? BOSS_DEATH_CLIP : DEATH_CLIP;
            int hs = k.id & (STATE - 1);
            int dir = stId[hs] == k.id ? stDir[hs] : 0;
            float s2 = ks * visualScale(k.type, k.boss, m);
            drawShadow(c, px, py, Math.round(k.radius * sc * 0.95f * (0.4f + 0.6f * alpha)));
            bmp.setColorFilter(shadeAt(px, py - 10f * ks, FLOOR_ENEMY * 0.8f));
            bmp.setAlpha((int) (255 * alpha));
            Clip cl = m.clip(SpriteAtlas.C_DEATH);
            if (cl != null) {
                int fi = Math.min(cl.count - 1, (int) (k.age / clipT * cl.count));
                drawFrameAt(c, m, SpriteAtlas.C_DEATH, dir, fi, px, py, s2, 1f, 1f, 0, bmp);
            } else {
                float f = Math.min(1f, k.age / 0.35f);
                drawFrameAt(c, m, SpriteAtlas.C_STATIC, dir, 0, px, py, s2, 1f + 0.25f * f, 1f - 0.8f * f, 0, bmp);
            }
            bmp.setColorFilter(null);
            bmp.setAlpha(255);
            if (k.age < 0.4f) drawDeathBurst(c, k, px, py);
        }
    }

    private Img burstImg(EnemyType t) {
        switch (t.model) {
            case "spore_hound": case "spore_carrier": case "lumen_tentacle": return atlas.img("vfx.ichor_burst");
            case "security_drone": return atlas.img("vfx.hit_spark_0");
            case "smelter": case "slagborn": case "cargo_loader": case "the_first": return atlas.img("vfx.explosion_3");
            case "vire": return atlas.img("vfx.energy_glow_1");
            default: return atlas.img("vfx.blood_burst");
        }
    }

    private void drawDeathBurst(Canvas c, Corpse k, int px, int py) {
        Img im = burstImg(k.type);
        float u = k.age / 0.4f;
        float size = (k.boss ? 260f : 84f) * ks * (0.5f + 0.7f * u);
        boolean blood = k.type.model.equals("infected_colonist") || k.type.model.equals("sergeant") || k.type.model.equals("welder");
        glow(c, im, px, py - 26f * ks, size, k.id * 37 % 360, blood ? fRedAdd : null, (int) (230 * (1f - u)));
    }

    /** A bar with a dark border: black frame, dark background, coloured fill. */
    private void bar(Canvas c, int cx, int top, int bw, int bh, float frac, int back, int front) {
        fill.setColor(0xCC000000);
        c.drawRect(cx - bw / 2 - 2, top - 2, cx + bw / 2 + 2, top + bh + 2, fill);
        fill.setColor(back);
        c.drawRect(cx - bw / 2, top, cx + bw / 2, top + bh, fill);
        fill.setColor(front);
        c.drawRect(cx - bw / 2, top, cx - bw / 2 + Math.round(bw * Math.max(0f, Math.min(1f, frac))), top + bh, fill);
    }

    private void drawBossBar(Canvas c, Enemy en, int px, int py, int headPx) {
        bar(c, px, py - headPx - 22, Math.max(120, headPx), 10, en.hp / en.maxHp, 0xFF2A0808, 0xFFE02828);
    }

    /** Clip slot of the main weapon's attack animation (Sim.AC_*); falls back to the plain attack clip. */
    private static int attackSlot(int ac) {
        switch (ac) {
            case Sim.AC_ATTACK2: return SpriteAtlas.C_ATTACK2;
            case Sim.AC_SLAM: return SpriteAtlas.C_SLAM;
            case Sim.AC_SHOOT: return SpriteAtlas.C_SHOOT;
            case Sim.AC_THROW: return SpriteAtlas.C_THROW;
            case Sim.AC_CAST: return SpriteAtlas.C_CAST;
            case Sim.AC_CAST2: return SpriteAtlas.C_CAST2;
            default: return SpriteAtlas.C_ATTACK;
        }
    }

    private void drawPlayer(Canvas c, Sim s, Model m, int px, int py) {
        if (m == null) {
            fill.setColor(0xFF3A6FD0);
            c.drawCircle(px, py - 30, 24, fill);
            return;
        }
        boolean dodging = s.dodgeT > 0f;
        // a hero faces its aim (which is the facing direction without aim input), a dodge faces the dash
        float dvx = dodging ? s.dodgeDx : s.hero != null ? s.aimX : s.faceX;
        float dvy = dodging ? s.dodgeDy : s.hero != null ? s.aimY : s.faceY;
        int dir = dirOf(dvx, dvy);
        if (dvx != 0f || dvy != 0f) playerDir = dir;
        else dir = playerDir;
        ColorFilter cf = now < redUntil ? fRed : shadeAt(px, py - 30f * ks, FLOOR_PLAYER);
        bmp.setColorFilter(cf);
        bmp.setAlpha(255);
        float atk = s.hero != null ? s.lastMainAttack : s.lastAttack;
        float sinceHit = (float) (now - hitAt), sinceAtk = (float) (now - atk);
        Clip dc = m.clip(SpriteAtlas.C_DODGE);
        int slot = s.hero != null ? attackSlot(s.mainClip) : SpriteAtlas.C_ATTACK;
        if (m.clip(slot) == null) slot = SpriteAtlas.C_ATTACK;
        Clip ac = m.clip(slot);
        if (s.ended == 1) {
            Clip d = m.clip(SpriteAtlas.C_DEATH);
            int fi = Math.min(d.count - 1, (int) (deathT / 1.1f * d.count));
            drawFrameAt(c, m, SpriteAtlas.C_DEATH, dir, fi, px, py, ks, 1f, 1f, 0, bmp);
        } else if (dodging && dc != null) {
            // afterimages along the dash, then the dodge clip squeezed into the dash time
            for (int g = 2; g >= 1; g--) {
                bmp.setAlpha(g == 2 ? 50 : 100);
                int gx = px - Math.round(dvx * 24f * g * sc), gy = py - Math.round(dvy * 24f * g * sc);
                drawFrameAt(c, m, SpriteAtlas.C_DODGE, dir, (int) ((Sim.DODGE_TIME - s.dodgeT) / Sim.DODGE_TIME * dc.count), gx, gy, ks, 1f, 1f, 0, bmp);
            }
            bmp.setAlpha(255);
            drawFrameAt(c, m, SpriteAtlas.C_DODGE, dir, (int) ((Sim.DODGE_TIME - s.dodgeT) / Sim.DODGE_TIME * dc.count), px, py, ks, 1f, 1f, 0, bmp);
        } else if (sinceHit >= 0 && sinceHit < HIT_CLIP && m.clip(SpriteAtlas.C_HIT) != null) {
            Clip hc = m.clip(SpriteAtlas.C_HIT);
            drawFrameAt(c, m, SpriteAtlas.C_HIT, dir, (int) (sinceHit / HIT_CLIP * hc.count), px, py, ks, 1f, 1f, 0, bmp);
        } else if (sinceAtk >= 0 && sinceAtk < ATTACK_CLIP && ac != null) {
            drawFrameAt(c, m, slot, dir, (int) (sinceAtk / ATTACK_CLIP * ac.count), px, py, ks, 1f, 1f, 0, bmp);
        } else if (moving) {
            Clip r = m.clip(SpriteAtlas.C_WALK);
            int fi = (int) (s.walk * 1.3f / (2f * (float) Math.PI) * r.count);
            drawFrameAt(c, m, SpriteAtlas.C_WALK, dir, ((fi % r.count) + r.count) % r.count, px, py, ks, 1f, 1f, 0, bmp);
        } else {
            drawFrameAt(c, m, SpriteAtlas.C_IDLE, dir, SpriteAtlas.frameAt(m.clip(SpriteAtlas.C_IDLE), (float) now, 1.5f), px, py, ks, 1f, 1f, 0, bmp);
        }
        bmp.setColorFilter(null);
    }

    /** Aim indicator at the player's feet: a short tick and a chevron pointing where the main weapon fires. */
    private void drawAim(Canvas c, Sim s, int px, int py) {
        float ax = s.aimX, ay = s.aimY, nx = -ay, ny = ax;
        float r0 = 30f * ks, r1 = 52f * ks, wing = 9f * ks;
        int alpha = s.aimActive ? 200 : 110;
        stroke.setColor((alpha << 24) | 0xD8FFF8);
        stroke.setStrokeWidth(2.5f * ks);
        float tx = px + ax * r1, ty = py + ay * r1;
        c.drawLine(px + ax * r0, py + ay * r0, tx, ty, stroke);
        c.drawLine(tx, ty, tx - ax * wing * 1.4f + nx * wing, ty - ay * wing * 1.4f + ny * wing, stroke);
        c.drawLine(tx, ty, tx - ax * wing * 1.4f - nx * wing, ty - ay * wing * 1.4f - ny * wing, stroke);
    }

    private void drawPlayerBar(Canvas c, Sim s, int px, int py) {
        bar(c, px, py + 12, Math.round(70 * ks), 8, s.hp / s.maxHp, 0xFF3A0A0A, 0xFFE03030);
    }

    // ------------------------------------------------------------------ pickups

    private static final String[] PICK_KEYS = {"", "pix.coin", "pix.bag", "pix.roast", "pix.vacuum", "pix.orologion",
            "pix.rosary", "pix.clover", "prop.supply_chest"};
    private static final String[] GEM_KEYS = {"gem.crystal_lumen", "gem.crystal_lumen", "gem.crystal_void"};
    private static final float[] GEM_SIZE = {26f, 34f, 42f};

    private void drawPickup(Canvas c, Pickup p) {
        int px = sx(p.x), bob = Math.round((float) Math.sin(p.bob) * ks * 2f);
        int py = sy(p.y) + bob;
        if (p.kind == Entities.K_GEM) {
            int tier = p.value < 3f ? 0 : p.value < 10f ? 1 : 2;
            Img im = atlas.img(p.red ? "gem.crystal_ember" : GEM_KEYS[tier]);
            if (im == null) return;
            float size = (p.red ? 58f : GEM_SIZE[tier]) * ks;
            ColorFilter tint = p.red ? fRedAdd : tier == 0 ? fGreen : tier == 1 ? fCyan : fViolet;
            float pulse = p.red ? 0.75f + 0.25f * (float) Math.sin(p.bob * 0.8f) : 1f;
            // soft glow under the crystal: gems stay findable in the dark
            glow(c, atlas.img("vfx.energy_glow_1"), px, py - size * 0.4f, size * (p.red ? 3.6f : 2.6f), 0f, tint, (int) (150 * pulse));
            float k = size / Math.max(im.w(), im.h());
            bmp.setColorFilter(null);
            bmp.setAlpha(255);
            blit(c, im, px, py, k, bmp);
            return;
        }
        Img im = atlas.img(PICK_KEYS[p.kind]);
        if (im == null) return;
        if (p.kind == Entities.K_CHEST) {
            float g = 0.5f + 0.5f * (float) Math.sin(p.bob * 2);
            glow(c, atlas.img("vfx.energy_glow_0"), px, py - 20f * ks, 110f * ks, 0f, fGold, (int) (120 + 90 * g));
        } else {
            glow(c, atlas.img("vfx.energy_glow_1"), px, py - 8f * ks, 40f * ks, 0f, p.kind == Entities.K_COIN || p.kind == Entities.K_COINBAG ? fGold : fCyan, 110);
        }
        bmp.setColorFilter(shadeAt(px, py, FLOOR_PICK));
        bmp.setAlpha(255);
        blit(c, im, px, py, p.kind == Entities.K_CHEST ? ks : ks * 1.15f, bmp);
        bmp.setColorFilter(null);
    }

    // ------------------------------------------------------------------ projectiles (above the darkness, additive)

    private void drawProjectile(Canvas c, Sim s, Projectile p, float t) {
        int px = sx(p.x), py = sy(p.y);
        float deg = p.angle * 57.29578f;
        float r = p.radius * sc;
        switch (p.kind) {
            case Entities.P_MISSILE: { // Spore Dart / Lumen Volley: a plasma streak
                glow(c, atlas.img("vfx.energy_glow_1"), px, py, r * 4.2f, 0f, p.evo ? fGold : fGreen, 120);
                glow(c, atlas.img("vfx.plasma_bolt_0"), px - (float) Math.cos(p.angle) * r * 0.8f, py - (float) Math.sin(p.angle) * r * 0.8f, r * 7.5f, deg, p.evo ? fGold : fCyan, 255);
                break;
            }
            case Entities.P_KNIFE: { // Scalpel Throw: a bright streak with the blade on it
                glow(c, atlas.img("vfx.plasma_bolt_0"), px - (float) Math.cos(p.angle) * r * 2f, py - (float) Math.sin(p.angle) * r * 2f, r * 8f, deg, null, 230);
                Img blade = atlas.img("prop.scalpel_blade");
                if (blade != null) {
                    c.save();
                    c.rotate(deg + 90f, px, py);
                    bmp.setColorFilter(null);
                    blit(c, blade, px, py + Math.round(blade.h() * ks * 0.5f), ks * 1.5f, bmp);
                    c.restore();
                }
                if (p.evo) glow(c, atlas.img("vfx.hit_spark_1"), px, py, r * 5f, 0f, fCyan, 200);
                break;
            }
            case Entities.P_AXE: { // grenade (spinning), embers; Shrapnel Spiral: spinning debris
                glow(c, atlas.img("vfx.embers_1"), px, py, r * 3.2f, 0f, fOrange, 170);
                Img im = atlas.img(p.evo ? "vfx.rock_debris" : "pix.grenade");
                if (im != null) {
                    c.save();
                    c.rotate(deg, px, py);
                    bmp.setColorFilter(null);
                    bmp.setAlpha(255);
                    blit(c, im, px, py + Math.round(im.h() * 0.5f * (p.evo ? 0.8f : 1f)), p.evo ? r / 70f * 2.2f : ks * 1.6f, bmp);
                    c.restore();
                }
                break;
            }
            case Entities.P_CROSS: { // Ricochet Drone: the drone itself, facing its direction of travel
                Model m = atlas.model("security_drone");
                if (m == null) break;
                float dirx = p.vx * p.speedAlong, diry = p.vy * p.speedAlong;
                glow(c, atlas.img(p.evo ? "vfx.blink_0" : "vfx.energy_glow_1"), px, py, r * 4f, 0f, p.evo ? fViolet : fGold, 150);
                bmp.setColorFilter(null);
                bmp.setAlpha(255);
                drawFrameAt(c, m, SpriteAtlas.C_STATIC, dirOf(dirx, diry), 0, px, py + Math.round(r * 0.8f), ks * 0.55f, 1f, 1f, 0, bmp);
                break;
            }
            case Entities.P_BOOK: { // Ward Drones: a spinning hex shield with a wisp
                glow(c, atlas.img("vfx.hex_shield_0"), px, py, r * 4.6f, p.orbitAngle * 57.3f * 2f, p.evo ? fViolet : fCyan, 255);
                glow(c, atlas.img(p.evo ? "vfx.energy_ring" : "vfx.wisp_0"), px, py, r * 3.2f, -p.orbitAngle * 57.3f, p.evo ? fViolet : fGreen, 170);
                break;
            }
            case Entities.P_FIRE: { // Slag Cannon: flame tail and a hot core
                float tail = (float) (p.angle * 57.29578) - 90f;
                glow(c, atlas.img(p.evo ? "vfx.flame_0" : "vfx.flame_3"), px - (float) Math.cos(p.angle) * r * 1.2f, py - (float) Math.sin(p.angle) * r * 1.2f, r * 5.2f, tail, null, 235);
                glow(c, atlas.img(p.evo ? "vfx.fire_core_0" : "vfx.fire_core_1"), px, py, r * 3.4f, 0f, null, 255);
                break;
            }
            case Entities.P_PUDDLE: { // the flask in the air, before it lands
                float age = p.maxLife - p.life, left = Math.max(0f, p.flight - age) / Math.max(0.01f, p.flight);
                Img fl = atlas.img("pix.flask");
                if (fl != null) {
                    int drop = Math.round(left * left * 300f * sc), side = Math.round(left * 40f * sc);
                    c.save();
                    c.rotate(age * 900f, px - side, py - drop);
                    bmp.setColorFilter(null);
                    bmp.setAlpha(255);
                    blit(c, fl, px - side, py - drop + Math.round(fl.h() * 0.5f), ks * 1.4f, bmp);
                    c.restore();
                }
                break;
            }
            default:
                break;
        }
    }

    // ------------------------------------------------------------------ ground effects (world units)

    /** Toxic Vent: layered spore clouds turning slowly inside a faint ring (the area of effect stays readable). */
    private void drawAura(Canvas c, Sim.WeaponState w, Sim s) {
        float r = w.auraRadius * sc;
        int cx = sx(s.px), cy = sy(s.py) - Math.round(6 * ks);
        float pulse = w.pulse > 0 ? 1f + w.pulse * 0.5f : 1f;
        ColorFilter tint = w.evo ? fViolet : null;
        float t = (float) now;
        glow(c, atlas.img("vfx.spore_cloud_0"), cx, cy, r * 2.15f * pulse, t * 9f, tint, 120);
        glow(c, atlas.img("vfx.spore_cloud_2"), cx, cy, r * 1.7f, -t * 14f, tint, 120);
        glow(c, atlas.img("vfx.spores_0"), cx, cy, r * 2.0f, t * 5f, tint, 170);
        if (w.evo) glow(c, atlas.img("vfx.heal_0"), cx, cy - r * 0.3f, r * 1.1f, 0f, fViolet, 120);
        stroke.setColor((w.evo ? 0x90C060FF : 0x9060FF90));
        stroke.setStrokeWidth(2f * ks);
        c.drawOval(cx - r, cy - r * 0.9f, cx + r, cy + r * 0.9f, stroke);
    }

    /** Corrosive Flask: a toxic pool with a ripple. */
    private void drawPuddle(Canvas c, Projectile p, float t) {
        float k = Math.min(1f, p.life * 3f), r = p.radius * sc;
        int cx = sx(p.x), cy = sy(p.y);
        float rip = (t * 0.9f + p.x * 0.013f) % 1f;
        Img puddle = atlas.img("vfx.toxic_splat_0");
        ColorFilter tint = p.evo ? fViolet : null;
        glow(c, puddle, cx, cy, r * 2.3f, p.x * 7f % 360f, tint, (int) (190 * k));
        glow(c, atlas.img("vfx.bubbles_0"), cx + r * 0.2f, cy, r * 1.3f, 0f, tint, (int) (150 * k * (0.6f + 0.4f * (float) Math.sin(t * 3f + p.x))));
        stroke.setColor(((int) (120 * k * (1f - rip)) << 24) | (p.evo ? 0xC080FF : 0x70FF90));
        stroke.setStrokeWidth(2f * ks);
        float rr = r * (0.3f + 0.7f * rip);
        c.drawOval(cx - rr, cy - rr * 0.85f, cx + rr, cy + rr * 0.85f, stroke);
    }

    private void drawFx(Canvas c, Effect f) {
        float k = f.life / f.maxLife;
        int px = sx(f.x), py = sy(f.y);
        switch (f.kind) {
            case Entities.FX_WHIP: { // Vibro Lash: a slash sprite sweeping out (Leech Scythe: red, with blood)
                float reach = Math.min(1f, (1f - k) * 4f + 0.35f);
                float w = f.w * sc * (0.55f + 0.45f * reach), hh = f.w * sc * 0.5f;
                float cx = sx(f.x - f.side * f.w / 2f * (1f - reach)) , cy = py;
                Img im = atlas.img(f.evo ? "vfx.slash_1" : "vfx.slash_0");
                if (im == null) break;
                add.setColorFilter(f.evo ? fRedAdd : null);
                add.setAlpha((int) (255 * Math.min(1f, k * 2.2f)));
                c.save();
                if (f.side > 0) c.scale(-1f, 1f, cx, cy);
                blitBox(c, im, cx, cy, w * 0.8f, hh, add);
                c.restore();
                if (f.evo) glow(c, atlas.img("vfx.blood_burst"), cx + f.side * w * 0.3f, cy, hh * 0.9f, 0f, fRedAdd, (int) (160 * k));
                break;
            }
            case Entities.FX_BOLT: { // Arc Coil: a lightning sprite from the top of the screen, a flash where it lands
                Img im = atlas.img(((int) (f.x * 13 + f.y * 7) & 1) == 0 ? "vfx.lightning_0" : "vfx.lightning_1");
                float fade = Math.min(1f, k * 2.5f);
                if (im != null) {
                    float top = -24f * ks, bottom = py + 10f * ks, wpx = Math.max(90f * ks, (bottom - top) * 0.28f);
                    add.setColorFilter(f.evo ? fGold : null);
                    add.setAlpha((int) (255 * fade));
                    blitBox(c, im, px, (top + bottom) / 2f, wpx, bottom - top, add);
                }
                glow(c, atlas.img("vfx.electric_ball"), px, py, 90f * ks * (1.2f - 0.4f * k), 0f, f.evo ? fGold : null, (int) (255 * fade));
                glow(c, atlas.img("vfx.hit_spark_0"), px, py, 60f * ks, 0f, null, (int) (255 * fade));
                break;
            }
            case Entities.FX_FLASH: { // a barrel going off
                float u = 1f - k;
                glow(c, atlas.img("vfx.explosion_0"), px, py - 14f * ks, 150f * ks * (0.6f + 0.6f * u), 0f, null, (int) (255 * Math.min(1f, k * 2f)));
                glow(c, atlas.img("vfx.smoke_0"), px, py - 30f * ks - u * 20f * ks, 90f * ks, 0f, null, (int) (60 * k));
                break;
            }
            case Entities.FX_BLAST: { // grenade (h = 0) and slag (h = 1) bursts
                float u = 1f - k;
                String name = f.h > 0.5f ? "vfx.explosion_3" : "vfx.explosion_0";
                glow(c, atlas.img(name), px, py - 8f * ks, f.w * sc * (f.evo ? 2.8f : 2.4f) * (0.6f + 0.5f * u), 0f, null, (int) (255 * Math.min(1f, k * 2.2f)));
                break;
            }
            case Entities.FX_RING:
                glow(c, atlas.img("vfx.shockwave_dust"), px, py, f.w * sc * 2.2f, 0f, null, (int) (120 * k));
                break;
            default:
        }
    }

    // ------------------------------------------------------------------ sparks and numbers (screen space)

    private void drawParticles(Canvas c, Sim s) {
        for (int i = 0; i < Sim.MAX_PART; i += 2) { // every other slot: slots never move, so no flicker, half the spam
            Particle q = s.parts[i];
            if (q.life <= 0) continue;
            int a = (int) (230 * Math.min(1f, q.life / q.maxLife * 1.5f));
            fill.setColor((q.color & 0x00FFFFFF) | (a << 24));
            int size = Math.max(2, Math.round(q.size * sc * 0.7f));
            int px = sx(q.x), py = sy(q.y);
            c.drawRect(px, py, px + size, py + size, fill);
        }
    }

    private void drawTexts(Canvas c, Sim s) {
        // keep the newest few: a stable threshold on remaining life (crits always stay)
        int live = 0;
        for (int i = 0; i < Sim.MAX_TEXT; i++) {
            DamageText d = s.texts[i];
            if (d.life > 0 && !d.crit && !d.heal) lifeTmp[live++] = d.life;
        }
        float thresh = 0f;
        int ties = MAX_TEXTS_DRAWN; // how many numbers with exactly the threshold life may still be drawn
        if (live > MAX_TEXTS_DRAWN) {
            for (int i = 1; i < live; i++) { // insertion sort ascending
                float v = lifeTmp[i];
                int j = i - 1;
                while (j >= 0 && lifeTmp[j] > v) { lifeTmp[j + 1] = lifeTmp[j]; j--; }
                lifeTmp[j + 1] = v;
            }
            thresh = lifeTmp[live - MAX_TEXTS_DRAWN];
            for (int i = live - 1; i >= 0 && lifeTmp[i] > thresh; i--) ties--; // hits of one frame share a life
        }
        text.setTextAlign(Paint.Align.CENTER);
        text.setShadowLayer(2f, 0f, 2f, 0xCC000000);
        for (int i = 0; i < Sim.MAX_TEXT; i++) {
            DamageText d = s.texts[i];
            if (d.life <= 0) continue;
            if (!d.crit && !d.heal && (d.life < thresh || (d.life == thresh && ties-- <= 0))) continue;
            text.setTextSize((d.crit ? 24f : 18f) * ks);
            int a = (int) (255 * Math.min(1f, d.life * 4f));
            text.setColor((d.heal ? 0x40FF60 : d.crit ? 0xFFD030 : 0xFFFFFF) | (a << 24));
            c.drawText(d.digits, 0, d.len, sx(d.x), sy(d.y), text);
            textsDrawn++;
        }
        text.clearShadowLayer();
    }

    // ------------------------------------------------------------------ overlays (screen space)

    private String bestLine = "";
    private int bestT = -1, bestK = -1, bestG = -1;

    private void drawOverlay(Canvas c, int w, int h, Engine e, Sim s, boolean menu, boolean dual) {
        int ph = e.phase;
        if (s != null && !menu) {
            float v = 1f - (float) ((now - hitAt) / (HIT_TINT * 3));
            if (v > 0) {
                ensureVignette(w, h);
                vig.setAlpha((int) (255 * VIGNETTE * Math.min(1f, v)));
                c.drawRect(0, 0, w, h, vig);
            }
            if (s.screenFlash > 0) { // never brighter than 0.25 alpha: the small screen shows a lot at once
                fill.setColor(((int) (60 * Math.min(1f, s.screenFlash * 2)) << 24) | 0xFFFFFF);
                c.drawRect(0, 0, w, h, fill);
            }
        }
        if (menu) {
            fill.setColor(0x66000000);
            c.drawRect(0, 0, w, h, fill);
            big.setShadowLayer(h * 0.006f, 0, h * 0.006f, 0xCC000000);
            big.setColor(0xFFFF8A2A);
            big.setTextSize(h * 0.13f);
            c.drawText("ASHFALL", w / 2f, h * 0.27f, big);
            big.setColor(0xFF39FF88);
            big.setTextSize(h * 0.06f);
            c.drawText("LUMEN TIDE", w / 2f, h * 0.35f, big);
            big.setColor(0xFFE8E4DC);
            big.setTextSize(h * 0.045f);
            c.drawText(e.stageKeys.isEmpty() ? "" : e.stage().name, w / 2f, h * 0.42f, big);
            if (e.meta != null) {
                if (bestT != e.meta.bestTimeSec || bestK != e.meta.bestKills || bestG != e.meta.gold) {
                    bestT = e.meta.bestTimeSec;
                    bestK = e.meta.bestKills;
                    bestG = e.meta.gold;
                    bestLine = "Best " + fmtTime(bestT) + "   Kills " + bestK + "   Gold " + bestG;
                }
                big.setTextSize(h * 0.04f);
                big.setColor(0xFFB8B0A4);
                c.drawText(bestLine, w / 2f, h * 0.48f, big);
            }
            if (dual) {
                big.setTextSize(h * 0.035f);
                big.setColor(0xFF988C7C);
                c.drawText("Use the bottom screen (or gamepad: stick/d-pad + A)", w / 2f, h * 0.93f, big);
            }
            big.clearShadowLayer();
            return;
        }
        if (ph == Engine.PH_LEVELUP || ph == Engine.PH_PAUSED || ph == Engine.PH_CHEST || ph == Engine.PH_RESULT) {
            fill.setColor(0x77000000);
            c.drawRect(0, 0, w, h, fill);
            big.setShadowLayer(h * 0.006f, 0, h * 0.006f, 0xCC000000);
            big.setTextSize(h * 0.1f);
            String t1;
            int col;
            if (ph == Engine.PH_LEVELUP) { t1 = "LEVEL UP!"; col = 0xFFFF8A2A; }
            else if (ph == Engine.PH_PAUSED) { t1 = "PAUSED"; col = 0xFFFFFFFF; }
            else if (ph == Engine.PH_CHEST) { t1 = "SUPPLIES!"; col = 0xFF39FF88; }
            else if (e.resultWin) { t1 = "VICTORY"; col = 0xFF39FF88; }
            else { t1 = "YOU DIED"; col = 0xFFE04040; }
            big.setColor(col);
            c.drawText(t1, w / 2f, h * 0.5f, big);
            if (dual && ph != Engine.PH_RESULT) {
                big.setTextSize(h * 0.04f);
                big.setColor(0xFFC0C8E0);
                c.drawText("Choose on the bottom screen", w / 2f, h * 0.58f, big);
            }
            big.clearShadowLayer();
        }
    }

    private void ensureVignette(int w, int h) {
        if (vigShader != null && vigW == w && vigH == h) return;
        vigW = w;
        vigH = h;
        float rad = (float) Math.sqrt((double) w * w + (double) h * h) / 2f;
        vigShader = new RadialGradient(w / 2f, h / 2f, rad, new int[]{0x00B01010, 0x00B01010, 0xFFC01818},
                new float[]{0f, 0.5f, 1f}, Shader.TileMode.CLAMP);
        vig.setShader(vigShader);
    }

    public static String fmtTime(int sec) {
        int m = sec / 60, s = sec % 60;
        return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
    }
}
