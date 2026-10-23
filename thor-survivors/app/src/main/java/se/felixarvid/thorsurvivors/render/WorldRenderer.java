package se.felixarvid.thorsurvivors.render;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;

import se.felixarvid.thorsurvivors.game.Engine;
import se.felixarvid.thorsurvivors.game.Entities;
import se.felixarvid.thorsurvivors.game.Entities.DamageText;
import se.felixarvid.thorsurvivors.game.Entities.Effect;
import se.felixarvid.thorsurvivors.game.Entities.Enemy;
import se.felixarvid.thorsurvivors.game.Entities.Particle;
import se.felixarvid.thorsurvivors.game.Entities.Pickup;
import se.felixarvid.thorsurvivors.game.Entities.Projectile;
import se.felixarvid.thorsurvivors.game.EnemyType;
import se.felixarvid.thorsurvivors.game.Sim;
import se.felixarvid.thorsurvivors.render.SpriteAtlas.Sprite;

/**
 * Draws the game world on the top screen.
 *
 * Sprites are drawn in screen space: the camera is a whole number of screen pixels, every sprite position is
 * {@code round(world * scale) - camera}, and every bitmap is a pre-scaled integer multiple of the art (see
 * {@link SpriteAtlas}), so nothing is resampled and nothing shimmers when the camera moves. Only vector extras
 * (auras, whip arcs, lightning) go through a canvas transform.
 *
 * Draw order is a strict total order that does not depend on the pool order of the simulation: ground pickups,
 * then enemies and the player by (feet y, id), then projectiles by (y, x, kind, slot). Sorting uses preallocated
 * arrays and an insertion sort; nothing is allocated per frame.
 */
public final class WorldRenderer {
    private static final int MAX_TEXTS_DRAWN = 40;
    private static final float FLASH_ON = 0.08f, FLASH_GAP = 0.15f, HIT_TINT = 0.12f, VIGNETTE = 0.35f;
    private static final int STATE = 4096;
    /** Radius a weapon's projectile has at area 1.0 (see Sim.fire*), used to grow its sprite in whole steps. */
    private static final float[] BASE_R = {0, 9f, 8f, 17f, 15f, 16f, 10f, 0};

    private final SpriteAtlas atlas = SpriteAtlas.get();
    private final Paint bmp = new Paint();
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint big = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint vig = new Paint();
    private final RectF rect = new RectF();
    private RadialGradient vigShader;
    private int vigW, vigH;
    private final Bitmap[] shadows = new Bitmap[321];

    // sort scratch (pool-sized, reused)
    private final long[] sKey = new long[Sim.MAX_PICK];
    private final int[] sIdx = new int[Sim.MAX_PICK];
    private final Sprite[] entSpr = new Sprite[Sim.MAX_ENEMIES + 1];
    private final int[] entK = new int[Sim.MAX_ENEMIES + 1];
    private final int[] entSx = new int[Sim.MAX_ENEMIES + 1];
    private final int[] entSy = new int[Sim.MAX_ENEMIES + 1];
    private final int[] bossIdx = new int[24];
    private final float[] lifeTmp = new float[Sim.MAX_TEXT];

    // per-enemy render state, keyed by enemy id (pool slots are reshuffled by swap-remove, ids are not)
    private final int[] stId = new int[STATE];
    private final float[] stFlash = new float[STATE];
    private final byte[] stFace = new byte[STATE];

    // player feedback
    private Sim lastSim;
    private float lastHp, lastPx, lastPy;
    private double redUntil, hitAt = -10;
    private boolean moving;

    // per-frame transform
    private float sc, ks;
    private int ox, oy, scrW, scrH;
    private double now;

    // exposed so tests can verify draw order
    public int orderN;
    public final int[] orderId = new int[Sim.MAX_ENEMIES + 1];
    public final int[] orderFeet = new int[Sim.MAX_ENEMIES + 1];
    public final int[] orderSx = new int[Sim.MAX_ENEMIES + 1];
    public final int[] orderSy = new int[Sim.MAX_ENEMIES + 1];
    public final float[] orderWy = new float[Sim.MAX_ENEMIES + 1];
    public int textsDrawn;

    private final DemoEnemy[] demo = new DemoEnemy[6];

    private static final class DemoEnemy {
        EnemyType type;
        boolean boss;
    }

    public WorldRenderer() {
        bmp.setAntiAlias(false);
        bmp.setFilterBitmap(false);
        bmp.setDither(false);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeCap(Paint.Cap.ROUND);
        text.setTextAlign(Paint.Align.CENTER);
        text.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        big.setTextAlign(Paint.Align.CENTER);
        big.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
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
        float camX, camY;
        if (menu) {
            now = e.menuTime;
            camX = e.menuTime * 40f;
            camY = (float) Math.sin(e.menuTime * 0.3f) * 60f;
        } else {
            now = s.time;
            camX = s.px;
            camY = s.py;
            trackPlayer(s);
        }
        int camPx = Math.round(camX * sc), camPy = Math.round(camY * sc);
        ox = w / 2 - camPx;
        oy = h / 2 - camPy;
        atlasWarm();
        drawGround(c, e.stageKeys.get(e.stageIdx), camPx, camPy, w, h);
        if (menu) drawDemo(c, e);
        else drawWorld(c, s);
        drawOverlay(c, w, h, e, s, menu, dualScreen);
    }

    private boolean warmed;
    private float warmedFor = -1;

    private void atlasWarm() {
        if (warmed && warmedFor == ks) return;
        atlas.warm(ks);
        warmed = true;
        warmedFor = ks;
    }

    /** Remembers hits on the player: a short red tint plus a vignette, no blinking and no shake. */
    private void trackPlayer(Sim s) {
        if (s != lastSim) {
            lastSim = s;
            lastHp = s.hp;
            lastPx = s.px;
            lastPy = s.py;
            redUntil = 0;
            hitAt = -10;
        }
        if (s.hp < lastHp - 0.01f) {
            redUntil = now + HIT_TINT;
            hitAt = now;
        }
        lastHp = s.hp;
        moving = s.px != lastPx || s.py != lastPy;
        lastPx = s.px;
        lastPy = s.py;
    }

    // ------------------------------------------------------------------ ground

    private static int hash(int x, int y) {
        int h = x * 374761393 + y * 668265263;
        h = (h ^ (h >>> 13)) * 1274126177;
        return h ^ (h >>> 16);
    }

    private final Bitmap[] tileBm = new Bitmap[8], decorBm = new Bitmap[16];

    private void drawGround(Canvas c, String stage, int camPx, int camPy, int w, int h) {
        Sprite t = atlas.find("tile." + stage);
        if (t == null || t.base.length > tileBm.length || t.decor.length > decorBm.length) {
            fill.setColor(stage.equals("LIBRARY") ? 0xFF2B2233 : 0xFF1E3A22);
            c.drawRect(0, 0, w, h, fill);
            return;
        }
        int k = Math.max(1, Math.round(4 * ks)), size = 16 * k;
        for (int i = 0; i < t.base.length; i++) tileBm[i] = atlas.bitmap(t, i, k, SpriteAtlas.T_NORMAL, false);
        for (int i = 0; i < t.decor.length; i++) decorBm[i] = atlas.decor(t, i, k);
        int x0 = Math.floorDiv(camPx - w / 2, size), x1 = Math.floorDiv(camPx + w / 2, size);
        int y0 = Math.floorDiv(camPy - h / 2, size), y1 = Math.floorDiv(camPy + h / 2, size);
        for (int ty = y0; ty <= y1; ty++) {
            for (int tx = x0; tx <= x1; tx++) {
                int hh = hash(tx, ty);
                float r = ((hh >>> 4) & 1023) / 1024f;
                int f = 0;
                float acc = 0;
                for (int i = 0; i < t.variantChance.length; i++) {
                    acc += t.variantChance[i];
                    if (r < acc && i + 1 < t.base.length) { f = i + 1; break; }
                }
                int dx = tx * size + ox, dy = ty * size + oy;
                c.drawBitmap(tileBm[f], dx, dy, bmp);
                if (t.decor.length > 0 && ((hh >>> 14) & 1023) / 1024f < t.decorChance) {
                    c.drawBitmap(decorBm[(hh >>> 24) % t.decor.length], dx, dy, bmp);
                }
            }
        }
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
            Sprite sp = enemySprite(d.type, d.boss);
            if (sp == null) continue;
            int k = SpriteAtlas.scaleFor(sp, ks);
            int px = sx(x), py = sy(y);
            drawShadow(c, px, py + 7 * k, 11 * k / 2);
            drawSprite(c, sp, k, SpriteAtlas.T_NORMAL, i % 2 != 0, px, py - hop(t + i, 3f, k), (int) (255 * d.type.alpha));
        }
        Sprite ps = atlas.find("player");
        if (ps != null) {
            int k = SpriteAtlas.scaleFor(ps, ks);
            int px = sx(camX), py = sy(camY + 20f);
            drawShadow(c, px, py + 7 * k, 11 * k / 2);
            drawSprite(c, ps, k, SpriteAtlas.T_NORMAL, false, px, py, 255);
        }
    }

    // ------------------------------------------------------------------ helpers

    private Sprite enemySprite(EnemyType t, boolean boss) {
        Sprite sp = boss ? atlas.find(t.bossSpriteKey) : null;
        return sp != null ? sp : atlas.find(t.spriteKey);
    }

    private static int hop(double anim, float hz, int k) {
        return Math.round((float) Math.abs(Math.sin(anim * Math.PI * hz)) * k * 0.75f);
    }

    private void drawSprite(Canvas c, Sprite sp, int k, int type, boolean flip, int cx, int cy, int alpha) {
        Bitmap b = atlas.bitmap(sp, SpriteAtlas.frameAt(sp, (float) now), k, type, flip);
        bmp.setAlpha(alpha);
        c.drawBitmap(b, cx - b.getWidth() / 2, cy - b.getHeight() / 2, bmp);
    }

    /** Soft dark ellipse under a ground sprite; one pre-rendered bitmap per width. */
    private void drawShadow(Canvas c, int cx, int cy, int halfW) {
        int w = Math.max(8, Math.min(320, halfW * 2));
        Bitmap b = shadows[w];
        if (b == null) {
            int hgt = Math.max(4, w * 3 / 8);
            b = Bitmap.createBitmap(w, hgt, Bitmap.Config.ARGB_8888);
            Canvas sc2 = new Canvas(b);
            fill.setColor(0x59000000);
            rect.set(0, 0, w, hgt);
            sc2.drawOval(rect, fill);
            shadows[w] = b;
        }
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

    private void drawWorld(Canvas c, Sim s) {
        final int w = scrW, h = scrH, m = 160;
        float t = (float) now;
        boolean frozen = s.freezeTimer > 0;

        // 1. garlic-style auras and puddles lie on the ground
        beginVec(c);
        for (int i = 0; i < s.inv.weaponCount; i++) {
            Sim.WeaponState ws = s.weapons[i];
            if (ws.behavior == Sim.B_GARLIC) drawAura(c, ws, s);
        }
        for (int i = 0; i < s.projN; i++) {
            Projectile p = s.projs[i];
            if (p.kind == Entities.P_PUDDLE) drawPuddle(c, p, t);
        }
        endVec(c);

        // 2. pickups, y-sorted (flat on the ground, under the creatures)
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
        for (int i = 0; i < s.enemyN; i++) {
            Enemy en = s.enemies[i];
            int px = sx(en.x), py = sy(en.y);
            if (px < -m || px > w + m || py < -m || py > h + m) continue;
            Sprite sp = enemySprite(en.type, en.boss);
            int k = sp == null ? 1 : SpriteAtlas.scaleFor(sp, ks);
            entSpr[i] = sp;
            entK[i] = k;
            entSx[i] = px;
            entSy[i] = py;
            sKey[n] = (bias(py + 8 * k) << 32) | (en.id & 0xFFFFFFFFL);
            sIdx[n++] = i;
            if (en.boss && nb < bossIdx.length) bossIdx[nb++] = i;
        }
        Sprite ps = atlas.find("player");
        int pk = ps == null ? 1 : SpriteAtlas.scaleFor(ps, ks);
        int ppx = sx(s.px), ppy = sy(s.py);
        int pi = s.enemyN; // the player rides as one extra entry after the enemies (id 0)
        sKey[n] = bias(ppy + 8 * pk) << 32;
        sIdx[n++] = pi;
        sort(sKey, sIdx, n);

        // shadows first so a sprite in front always covers a shadow behind it
        for (int j = 0; j < n; j++) {
            int i = sIdx[j];
            if (i == pi) drawShadow(c, ppx, ppy + 7 * pk, 11 * pk / 2);
            else drawShadow(c, entSx[i], entSy[i] + 7 * entK[i], 11 * entK[i] / 2);
        }

        // 4. creatures in order
        orderN = 0;
        for (int j = 0; j < n; j++) {
            int i = sIdx[j];
            if (i == pi) {
                drawPlayer(c, s, ps, pk, ppx, ppy);
                recordOrder(0, (int) (sKey[j] >>> 32) - 32768, ppx, ppy, s.py);
                continue;
            }
            Enemy en = s.enemies[i];
            drawEnemy(c, s, en, entSpr[i], entK[i], entSx[i], entSy[i], frozen);
            recordOrder(en.id, (int) (sKey[j] >>> 32) - 32768, entSx[i], entSy[i], en.y);
        }
        for (int b = 0; b < nb; b++) drawBossBar(c, s.enemies[bossIdx[b]], entSx[bossIdx[b]], entSy[bossIdx[b]], entK[bossIdx[b]]);

        // 5. projectiles, y-sorted (they fly above the crowd)
        int nq = 0;
        for (int i = 0; i < s.projN; i++) {
            Projectile p = s.projs[i];
            if (p.kind == Entities.P_PUDDLE && (p.maxLife - p.life) >= 0.25f) continue;
            int px = sx(p.x), py = sy(p.y);
            if (px < -m * 2 || px > w + m * 2 || py < -m * 2 || py > h + m * 2) continue;
            sKey[nq] = (bias(py) << 40) | (bias(px) << 24) | ((p.kind & 15) << 8) | (p.slot & 255);
            sIdx[nq++] = i;
        }
        sort(sKey, sIdx, nq);
        for (int j = 0; j < nq; j++) drawProjectile(c, s, s.projs[sIdx[j]], t);

        // 6. effects, sparks, hp bar, numbers
        beginVec(c);
        for (int i = 0; i < Sim.MAX_FX; i++) {
            Effect f = s.fx[i];
            if (f.life > 0) drawFx(c, f);
        }
        endVec(c);
        drawParticles(c, s);
        drawPlayerBar(c, s, ppx, ppy, pk);
        drawTexts(c, s);
    }

    private void recordOrder(int id, int feet, int sxp, int syp, float wy) {
        int n = orderN++;
        orderId[n] = id;
        orderFeet[n] = feet;
        orderSx[n] = sxp;
        orderSy[n] = syp;
        orderWy[n] = wy;
    }

    private void beginVec(Canvas c) {
        c.save();
        c.translate(ox, oy);
        c.scale(sc, sc);
    }

    private void endVec(Canvas c) {
        c.restore();
    }

    // ------------------------------------------------------------------ creatures

    /** Enemy hit flash (white silhouette) and facing, with per-enemy hysteresis; returns true while flashing. */
    private boolean stateFor(Enemy en, float playerX) {
        int hs = en.id & (STATE - 1);
        if (stId[hs] != en.id) {
            stId[hs] = en.id;
            stFlash[hs] = -10f;
            stFace[hs] = 0;
        }
        float dx = playerX - en.x;
        if (dx > 4f) stFace[hs] = 1;
        else if (dx < -4f) stFace[hs] = 2;
        else if (stFace[hs] == 0) stFace[hs] = (byte) (dx >= 0 ? 1 : 2);
        float since = (float) (now - stFlash[hs]);
        if (since < FLASH_ON && since >= 0) return true;
        if (en.flash > 0 && since >= FLASH_GAP) {
            stFlash[hs] = (float) now;
            return true;
        }
        return false;
    }

    private void drawEnemy(Canvas c, Sim s, Enemy en, Sprite sp, int k, int px, int py, boolean frozen) {
        boolean flash = stateFor(en, s.px);
        if (sp == null) {
            fill.setColor(en.type.color);
            c.drawCircle(px, py, en.radius * sc, fill);
            return;
        }
        boolean faceRight = stFace[en.id & (STATE - 1)] == 1;
        int type = flash ? SpriteAtlas.T_WHITE : frozen ? SpriteAtlas.T_ICE : SpriteAtlas.T_NORMAL;
        float hz = en.type.shape == EnemyType.SH_BAT ? 5.5f : en.type.shape == EnemyType.SH_GHOST ? 1.5f : 3f;
        int bob = frozen ? 0 : hop(en.anim, hz, k) * (en.type.shape == EnemyType.SH_BAT ? 2 : 1);
        drawSprite(c, sp, k, type, !faceRight, px, py - bob, (int) (255 * en.type.alpha * sp.alpha));
    }

    private void drawBossBar(Canvas c, Enemy en, int px, int py, int k) {
        int bw = 16 * k, top = py - 8 * k - 14, bh = 6;
        fill.setColor(0xFF220000);
        c.drawRect(px - bw / 2, top, px + bw / 2, top + bh, fill);
        fill.setColor(0xFFE02020);
        c.drawRect(px - bw / 2, top, px - bw / 2 + bw * Math.max(0f, en.hp / en.maxHp), top + bh, fill);
    }

    private void drawPlayer(Canvas c, Sim s, Sprite ps, int k, int px, int py) {
        if (ps == null) {
            fill.setColor(0xFF3A6FD0);
            c.drawCircle(px, py, 24, fill);
            return;
        }
        int type = now < redUntil ? SpriteAtlas.T_RED : SpriteAtlas.T_NORMAL;
        int bob = moving ? Math.round((float) Math.abs(Math.sin(s.walk)) * k * 0.75f) : 0;
        drawSprite(c, ps, k, type, !s.facingRight, px, py - bob, 255);
    }

    private void drawPlayerBar(Canvas c, Sim s, int px, int py, int k) {
        int bw = 64, top = py + 8 * k + 6, bh = 6;
        fill.setColor(0xFF330000);
        c.drawRect(px - bw / 2, top, px + bw / 2, top + bh, fill);
        fill.setColor(0xFFE03030);
        c.drawRect(px - bw / 2, top, px - bw / 2 + bw * Math.max(0f, s.hp / s.maxHp), top + bh, fill);
    }

    // ------------------------------------------------------------------ pickups & projectiles

    private static final String[] PICK_KEYS = {"pickup.GEM", "pickup.COIN", "pickup.COINBAG", "pickup.ROAST",
            "pickup.VACUUM", "pickup.OROLOGION", "pickup.ROSARY", "pickup.CLOVER", "pickup.CHEST"};
    private static final String[] GEM_KEYS = {"pickup.GEM.0", "pickup.GEM.1", "pickup.GEM.2"};

    private void drawPickup(Canvas c, Pickup p) {
        String key = p.kind == Entities.K_GEM ? GEM_KEYS[p.value < 3f ? 0 : p.value < 10f ? 1 : 2] : PICK_KEYS[p.kind];
        Sprite sp = atlas.find(key);
        if (sp == null) return;
        int k = SpriteAtlas.scaleFor(sp, ks);
        int bob = Math.round((float) Math.sin(p.bob) * ks * 2f);
        int px = sx(p.x), py = sy(p.y) + bob;
        if (p.kind == Entities.K_CHEST) {
            float glow = 0.5f + 0.5f * (float) Math.sin(p.bob * 2);
            stroke.setColor(((int) (110 * glow) << 24) | 0xFFE060);
            stroke.setStrokeWidth(3f);
            c.drawCircle(px, py, 30 * ks, stroke);
        }
        drawSprite(c, sp, k, SpriteAtlas.T_NORMAL, false, px, py, 255);
    }

    private int projK(Sprite sp, Projectile p) {
        int k = SpriteAtlas.scaleFor(sp, ks);
        float base = p.kind >= 0 && p.kind < BASE_R.length ? BASE_R[p.kind] : 0f;
        if (base > 0f) {
            float ratio = p.radius / (base * (p.evo && (p.kind == Entities.P_MISSILE) ? 1.3f : 1f));
            k += ratio >= 2.1f ? 2 : ratio >= 1.45f ? 1 : 0;
        }
        return k;
    }

    private void drawProjectile(Canvas c, Sim s, Projectile p, float t) {
        Sprite sp = atlas.find(s.weapons[p.slot].spriteKey);
        int px = sx(p.x), py = sy(p.y);
        if (p.kind == Entities.P_PUDDLE) { // the flask falling in, before it becomes a puddle
            float age = p.maxLife - p.life;
            if (sp != null) {
                int k = projK(sp, p);
                int drop = Math.round((0.25f - age) * 480f * sc);
                rotated(c, sp, k, py - drop, px, age * 900f);
            }
            return;
        }
        if (sp == null) {
            beginVec(c);
            drawProjectileVec(c, p, t);
            endVec(c);
            return;
        }
        int k = projK(sp, p);
        float deg = p.kind == Entities.P_BOOK ? 0f : p.angle * 57.29578f + sp.rot;
        rotated(c, sp, k, py, px, deg);
    }

    private void rotated(Canvas c, Sprite sp, int k, int py, int px, float deg) {
        Bitmap b = atlas.bitmap(sp, SpriteAtlas.frameAt(sp, (float) now), k, SpriteAtlas.T_NORMAL, false);
        bmp.setAlpha((int) (255 * sp.alpha));
        if (deg == 0f) {
            c.drawBitmap(b, px - b.getWidth() / 2, py - b.getHeight() / 2, bmp);
            return;
        }
        c.save();
        c.rotate(deg, px, py);
        c.drawBitmap(b, px - b.getWidth() / 2, py - b.getHeight() / 2, bmp);
        c.restore();
    }

    // ------------------------------------------------------------------ vector extras (world units)

    private void drawAura(Canvas c, Sim.WeaponState w, Sim s) {
        float r = 72f * w.area;
        float pulse = w.pulse > 0 ? w.pulse / 0.25f : 0f;
        int base = w.evo ? 0xA040C0 : 0xE070C0;
        fill.setColor(((int) (34 + 56 * pulse) << 24) | base);
        c.drawCircle(s.px, s.py, r, fill);
        stroke.setColor(((int) (80 + 100 * pulse) << 24) | base);
        stroke.setStrokeWidth(3f);
        c.drawCircle(s.px, s.py, r, stroke);
    }

    private void drawPuddle(Canvas c, Projectile p, float t) {
        float k = Math.min(1f, p.life * 3f);
        float rip = (float) Math.sin(t * 5 + p.x) * 0.04f;
        fill.setColor(((int) (110 * k) << 24) | (p.evo ? 0x2040C0 : 0x40A0FF));
        c.drawCircle(p.x, p.y, p.radius * (1 + rip), fill);
        stroke.setColor(((int) (200 * k) << 24) | (p.evo ? 0x6080FF : 0xA0E0FF));
        stroke.setStrokeWidth(2f);
        c.drawCircle(p.x, p.y, p.radius * (0.65f + rip), stroke);
    }

    /** Fallback for a weapon with no mapped sprite. */
    private void drawProjectileVec(Canvas c, Projectile p, float t) {
        fill.setColor(p.evo ? 0xFFFFF0A0 : 0xFFA8F0FF);
        c.drawCircle(p.x, p.y, Math.max(4f, p.radius * 0.7f), fill);
    }

    private void drawFx(Canvas c, Effect f) {
        float k = f.life / f.maxLife;
        switch (f.kind) {
            case Entities.FX_WHIP:
                rect.set(f.x - f.w / 2, f.y - f.h * 0.9f, f.x + f.w / 2, f.y + f.h * 0.9f);
                stroke.setColor(((int) (230 * k) << 24) | (f.evo ? 0xFF3050 : 0xFFFFFF));
                stroke.setStrokeWidth(8f * k + 2f);
                c.drawArc(rect, f.side > 0 ? -50 : 130, 100, false, stroke);
                break;
            case Entities.FX_BOLT: {
                fill.setColor(((int) (70 * k) << 24) | 0xFFF080);
                c.drawCircle(f.x, f.y, f.w, fill);
                stroke.setColor(((int) (255 * k) << 24) | (f.evo ? 0xFFE040 : 0xB8E8FF));
                stroke.setStrokeWidth(4f);
                float top = f.y - Sim.VIEW_H;
                float cx = f.x, cy = top;
                int seed = (int) (f.x * 13 + f.y * 7);
                for (int i = 1; i <= 8; i++) {
                    float nx = f.x + (((seed >> i) & 15) - 7.5f) * 4f * (1 - i / 8f);
                    float ny = top + (f.y - top) * i / 8f;
                    c.drawLine(cx, cy, nx, ny, stroke);
                    cx = nx;
                    cy = ny;
                }
                break;
            }
            case Entities.FX_RING:
                fill.setColor(((int) (110 * k) << 24) | (f.evo ? 0x802010 : 0xFF8020));
                c.drawCircle(f.x, f.y, f.w * (1.1f - 0.4f * k), fill);
                break;
            default:
        }
    }

    // ------------------------------------------------------------------ sparks and numbers (screen space)

    private void drawParticles(Canvas c, Sim s) {
        for (int i = 0; i < Sim.MAX_PART; i += 2) { // every other slot: slots never move, so no flicker, half the spam
            Particle q = s.parts[i];
            if (q.life <= 0) continue;
            int a = (int) (200 * Math.min(1f, q.life / q.maxLife * 1.5f));
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
        if (live > MAX_TEXTS_DRAWN) {
            for (int i = 1; i < live; i++) { // insertion sort ascending
                float v = lifeTmp[i];
                int j = i - 1;
                while (j >= 0 && lifeTmp[j] > v) { lifeTmp[j + 1] = lifeTmp[j]; j--; }
                lifeTmp[j + 1] = v;
            }
            thresh = lifeTmp[live - MAX_TEXTS_DRAWN];
        }
        text.setTextAlign(Paint.Align.CENTER);
        text.setShadowLayer(2f, 0f, 2f, 0xCC000000);
        for (int i = 0; i < Sim.MAX_TEXT; i++) {
            DamageText d = s.texts[i];
            if (d.life <= 0) continue;
            if (!d.crit && !d.heal && d.life < thresh) continue;
            text.setTextSize((d.crit ? 28f : 21f) * ks);
            int a = (int) (255 * Math.min(1f, d.life * 3f));
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
            if (s.screenFlash > 0) {
                fill.setColor(((int) (70 * Math.min(1f, s.screenFlash * 2)) << 24) | 0xFFFFFF);
                c.drawRect(0, 0, w, h, fill);
            }
        }
        if (menu) {
            fill.setColor(0x66000000);
            c.drawRect(0, 0, w, h, fill);
            big.setShadowLayer(h * 0.006f, 0, h * 0.006f, 0xCC000000);
            big.setColor(0xFFFFD84A);
            big.setTextSize(h * 0.13f);
            c.drawText("THOR SURVIVORS", w / 2f, h * 0.30f, big);
            big.setColor(0xFFE8E8F0);
            big.setTextSize(h * 0.045f);
            c.drawText(e.stageKeys.isEmpty() ? "" : e.stage().name, w / 2f, h * 0.38f, big);
            if (e.meta != null) {
                if (bestT != e.meta.bestTimeSec || bestK != e.meta.bestKills || bestG != e.meta.gold) {
                    bestT = e.meta.bestTimeSec;
                    bestK = e.meta.bestKills;
                    bestG = e.meta.gold;
                    bestLine = "Best " + fmtTime(bestT) + "   Kills " + bestK + "   Gold " + bestG;
                }
                big.setTextSize(h * 0.04f);
                big.setColor(0xFFB0B8D0);
                c.drawText(bestLine, w / 2f, h * 0.45f, big);
            }
            if (dual) {
                big.setTextSize(h * 0.035f);
                big.setColor(0xFF8890B0);
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
            if (ph == Engine.PH_LEVELUP) { t1 = "LEVEL UP!"; col = 0xFFFFD84A; }
            else if (ph == Engine.PH_PAUSED) { t1 = "PAUSED"; col = 0xFFFFFFFF; }
            else if (ph == Engine.PH_CHEST) { t1 = "TREASURE!"; col = 0xFFFFD84A; }
            else if (e.resultWin) { t1 = "VICTORY"; col = 0xFF70E080; }
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
