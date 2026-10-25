package se.felixarvid.thorsurvivors.ui;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;
import android.view.MotionEvent;

import se.felixarvid.thorsurvivors.data.EquipDef;
import se.felixarvid.thorsurvivors.data.HeroDef;
import se.felixarvid.thorsurvivors.data.PowerUpDef;
import se.felixarvid.thorsurvivors.data.WeaponDef;
import se.felixarvid.thorsurvivors.game.Describe;
import se.felixarvid.thorsurvivors.game.Elites;
import se.felixarvid.thorsurvivors.game.Engine;
import se.felixarvid.thorsurvivors.game.Entities;
import se.felixarvid.thorsurvivors.game.Equipment;
import se.felixarvid.thorsurvivors.game.Input;
import se.felixarvid.thorsurvivors.game.Inventory;
import se.felixarvid.thorsurvivors.game.MainWeapon;
import se.felixarvid.thorsurvivors.game.Offer;
import se.felixarvid.thorsurvivors.game.Sim;
import se.felixarvid.thorsurvivors.render.SpriteAtlas;
import se.felixarvid.thorsurvivors.render.WorldRenderer;

import java.util.HashMap;
import java.util.List;

/**
 * The control panel in the ASHFALL skin (design section 11): HUD, level-up cards, menus, shop, results. One class used by the
 * bottom-screen window (full panel) and by the single-screen overlay ({@code compact}: HUD strip + centred cards/menus).
 * Reads the shared {@link Engine}; talks back only through {@link Input} commands. Drawing goes through {@link Skin}
 * (steel plates, rivets, hazard stripes, metal bars, the condensed typeface); a frame allocates nothing: strings are cached
 * until their numbers change, shaders are built when the size changes, pictures are decoded once when a screen opens ({@link UiArt}).
 */
public final class PanelRenderer {
    private static final int GOLD = Skin.GOLD, DIM = Skin.DIM, TEXT = Skin.TEXT;
    private static final int MAX_HITS = 40;

    private final boolean compact;
    private final Engine eng = Engine.get();
    private final SpriteAtlas atlas = SpriteAtlas.get();
    private final UiArt art = UiArt.get();
    private final Skin k = new Skin();
    private final Paint fill = k.fill;
    private final Paint stroke = k.stroke;
    private final RectF r = k.r;
    private final Path path = k.path;
    private final float[] ptsA = new float[Sim.MAX_ENEMIES * 2];
    private final float[] ptsB = new float[Sim.MAX_PICK * 2];
    private final Paint fade = new Paint();

    // hit regions rebuilt every draw
    private final float[] hl = new float[MAX_HITS], ht = new float[MAX_HITS], hr = new float[MAX_HITS], hb = new float[MAX_HITS];
    private final int[] hIdx = new int[MAX_HITS], hSub = new int[MAX_HITS];
    private int hitN, hitPhase;

    // move joystick and aim stick (the second touch area, only without a gamepad)
    private int joyPointer = -1, aimPointer = -1;
    private float joyOx, joyOy, joyCx, joyCy, joyR = 100;
    private float aimOx, aimOy, aimCx, aimCy;
    private float zl, zt, zr, zb; // joystick capture zone (panel mode)
    private float al, at, ar, ab; // aim capture zone (empty when ar <= al)
    private float dl, dt, dr, db; // DODGE button (empty when dr <= dl)
    private int lastPhase = -1;
    private int width, height;

    public PanelRenderer(boolean compact) {
        this.compact = compact;
        stroke.setStyle(Paint.Style.STROKE);
    }

    // ------------------------------------------------------------------ touch

    public boolean onTouch(MotionEvent ev) {
        int act = ev.getActionMasked();
        int idx = ev.getActionIndex();
        Input in = eng.input;
        switch (act) {
            case MotionEvent.ACTION_DOWN:
            case MotionEvent.ACTION_POINTER_DOWN: {
                float x = ev.getX(idx), y = ev.getY(idx);
                if (hitPhase == Engine.PH_PLAYING && dr > dl && x >= dl && x <= dr && y >= dt && y <= db) {
                    in.dodgeReq = true;
                    return true;
                }
                for (int i = 0; i < hitN; i++) {
                    if (x >= hl[i] && x <= hr[i] && y >= ht[i] && y <= hb[i]) {
                        in.post(Input.CMD_TAP, hitPhase, hIdx[i], hSub[i]);
                        return true;
                    }
                }
                if (hitPhase == Engine.PH_PLAYING && aimPointer < 0 && ar > al && x >= al && x <= ar && y >= at && y <= ab) {
                    aimPointer = ev.getPointerId(idx);
                    aimOx = aimCx = x;
                    aimOy = aimCy = y;
                    in.aimTouchX = in.aimTouchY = 0;
                    return true;
                }
                if (hitPhase == Engine.PH_PLAYING && joyPointer < 0
                        && (compact || (x >= zl && x <= zr && y >= zt && y <= zb))) {
                    joyPointer = ev.getPointerId(idx);
                    joyOx = joyCx = x;
                    joyOy = joyCy = y;
                    in.touchX = in.touchY = 0;
                    return true;
                }
                return true;
            }
            case MotionEvent.ACTION_MOVE:
                if (aimPointer >= 0) {
                    int pi = ev.findPointerIndex(aimPointer);
                    if (pi >= 0) {
                        aimCx = ev.getX(pi);
                        aimCy = ev.getY(pi);
                        float dx = (aimCx - aimOx) / joyR, dy = (aimCy - aimOy) / joyR;
                        float m = (float) Math.sqrt(dx * dx + dy * dy);
                        if (m > 1f) {
                            dx /= m;
                            dy /= m;
                            aimOx = aimCx - dx * joyR;
                            aimOy = aimCy - dy * joyR;
                        }
                        in.aimTouchX = Input.deadZone(dx, dy);
                        in.aimTouchY = Input.deadZone(dy, dx);
                    }
                }
                if (joyPointer >= 0) {
                    int pi = ev.findPointerIndex(joyPointer);
                    if (pi >= 0) {
                        joyCx = ev.getX(pi);
                        joyCy = ev.getY(pi);
                        float dx = (joyCx - joyOx) / joyR, dy = (joyCy - joyOy) / joyR;
                        float m = (float) Math.sqrt(dx * dx + dy * dy);
                        if (m > 1f) {
                            dx /= m;
                            dy /= m;
                            // drag the origin along so the stick follows the finger
                            joyOx = joyCx - dx * joyR;
                            joyOy = joyCy - dy * joyR;
                        }
                        in.touchX = Input.deadZone(dx, dy);
                        in.touchY = Input.deadZone(dy, dx);
                    }
                }
                return true;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_POINTER_UP:
            case MotionEvent.ACTION_CANCEL:
                if (joyPointer >= 0 && (act == MotionEvent.ACTION_CANCEL || ev.getPointerId(idx) == joyPointer)) {
                    joyPointer = -1;
                    in.touchX = in.touchY = 0;
                }
                if (aimPointer >= 0 && (act == MotionEvent.ACTION_CANCEL || ev.getPointerId(idx) == aimPointer)) {
                    aimPointer = -1;
                    in.aimTouchX = in.aimTouchY = 0;
                }
                return true;
            default:
                return false;
        }
    }


    // ------------------------------------------------------------------ drawing

    public void draw(Canvas c, int w, int h) {
        // the game thread steps and draws the Sim under this lock; reading it here must not interleave
        synchronized (eng.lock) {
            drawLocked(c, w, h);
        }
    }

    private void drawLocked(Canvas c, int w, int h) {
        width = w;
        height = h;
        hitN = 0;
        if (!eng.isReady()) {
            if (!compact) c.drawColor(Skin.BASE);
            return;
        }
        int ph = eng.phase;
        hitPhase = ph;
        if (ph != lastPhase) {
            if (joyPointer >= 0 || aimPointer >= 0 || lastPhase == Engine.PH_PLAYING) {
                joyPointer = aimPointer = -1;
                eng.input.touchX = eng.input.touchY = 0;
                eng.input.aimTouchX = eng.input.aimTouchY = 0;
            }
            if (ph == Engine.PH_PLAYING) art.release(UiArt.G_MENU); // the paintings of the menus are not needed during a run
            lastPhase = ph;
        }
        float u = h / 1080f;
        k.u = u;
        joyR = 110f * u;
        layout(w, h, u);
        if (!compact) k.background(c, w, h);
        dl = dr = al = ar = 0f; // the HUD sets the touch areas again when it is drawn
        switch (ph) {
            case Engine.PH_PLAYING:
                if (compact) hudStrip(c, w, h);
                else hudPanel(c, w, h);
                drawJoystick(c);
                break;
            case Engine.PH_LEVELUP:
                if (compact) dimOverlay(c, w, h, 0x99000000);
                levelUp(c, w, h);
                break;
            case Engine.PH_PAUSED:
                if (compact) dimOverlay(c, w, h, 0x88000000);
                pauseMenu(c, w, h);
                break;
            case Engine.PH_CHEST:
                if (compact) dimOverlay(c, w, h, 0x88000000);
                chest(c, w, h);
                break;
            case Engine.PH_EQUIP:
                if (compact) dimOverlay(c, w, h, 0x99000000);
                equipChoice(c, w, h);
                break;
            case Engine.PH_RESULT:
                if (compact) dimOverlay(c, w, h, 0xAA000000);
                result(c, w, h);
                break;
            case Engine.PH_SHOP:
                if (compact) dimOverlay(c, w, h, 0xDD000000);
                shop(c, w, h);
                break;
            default:
                if (compact) dimOverlay(c, w, h, 0x55000000);
                mainMenu(c, w, h);
        }
        if (eng.toastTimer > 0 && (ph == Engine.PH_SHOP || ph == Engine.PH_MENU)) {
            float tw = w * 0.6f, ty = h * 0.9f, th = 58f * u;
            k.plate(c, w / 2f - tw / 2f, ty, w / 2f + tw / 2f, ty + th, 0x55000000, Skin.ORANGE, 3f * u);
            k.text(c, eng.toast, w / 2f, ty + th * 0.66f, 34f * u, GOLD, Paint.Align.CENTER);
        }
    }

    private void dimOverlay(Canvas c, int w, int h, int color) {
        fill.setColor(color);
        c.drawRect(0, 0, w, h, fill);
    }

    private void hit(float l, float t, float rr, float b, int idx, int sub) {
        if (hitN >= MAX_HITS) return;
        hl[hitN] = l; ht[hitN] = t; hr[hitN] = rr; hb[hitN] = b; hIdx[hitN] = idx; hSub[hitN] = sub;
        hitN++;
    }

    // gradients that depend on the size of the panel: built when it changes, never per frame
    private int layW, layH;
    private LinearGradient menuFade, cardFadeV, cardFadeH, headFade;

    private void layout(int w, int h, float u) {
        if (layW == w && layH == h) return;
        layW = w;
        layH = h;
        menuFade = new LinearGradient(0, 0, 0, h, new int[]{0x66120E0C, 0xC0120E0C, 0xF2120E0C}, new float[]{0f, 0.35f, 1f}, Shader.TileMode.CLAMP);
        cardFadeV = new LinearGradient(0, 0, 0, 1, 0x00100C0A, 0xF0100C0A, Shader.TileMode.CLAMP); // scaled per card by the matrix
        cardFadeH = new LinearGradient(0, 0, 1, 0, 0xF0100C0A, 0x10100C0A, Shader.TileMode.CLAMP);
        headFade = new LinearGradient(0, 0, 0, 1, 0xCC000000, 0x00000000, Shader.TileMode.CLAMP);
    }

    /** Fills a rectangle with a unit gradient stretched to it ({@code horizontal}: fades left to right, else top to bottom). */
    private void fadeRect(Canvas c, LinearGradient g, float l, float t, float rr, float b, boolean horizontal) {
        c.save();
        c.translate(l, t);
        c.scale(rr - l, b - t);
        fade.setShader(g);
        c.drawRect(0f, 0f, 1f, 1f, fade);
        fade.setShader(null);
        c.restore();
    }

    // ---- text caches: strings are redrawn 60 times a second but change rarely

    private final String[] csStr = new String[128];
    private final int[] csA = new int[128], csB = new int[128];

    private String cs(int slot, String pre, int a, String mid, int b, String post) {
        String c = csStr[slot];
        if (c == null || csA[slot] != a || csB[slot] != b) {
            c = pre + a + mid + (mid.isEmpty() ? "" : b) + post;
            csStr[slot] = c;
            csA[slot] = a;
            csB[slot] = b;
        }
        return c;
    }

    private String cs(int slot, String pre, int a, String post) {
        return cs(slot, pre, a, "", 0, post);
    }

    private final String[] tStr = new String[8];
    private final int[] tSec = new int[8];

    private String tcs(int slot, int sec) {
        if (tStr[slot] == null || tSec[slot] != sec) {
            tSec[slot] = sec;
            tStr[slot] = WorldRenderer.fmtTime(sec);
        }
        return tStr[slot];
    }

    private final HashMap<String, String> upperCache = new HashMap<>();

    /** The text in capitals, made once per distinct string. */
    private String up(String t) {
        String s = upperCache.get(t);
        if (s == null) {
            s = t.toUpperCase(java.util.Locale.ROOT);
            upperCache.put(t, s);
        }
        return s;
    }

    private final HashMap<String, String> bossIcon = new HashMap<>();

    /** "boss_" + key, made once per boss. */
    private String bossKey(String key) {
        String s = bossIcon.get(key);
        if (s == null) {
            s = "boss_" + key;
            bossIcon.put(key, s);
        }
        return s;
    }

    private static final class HeroTexts {
        String blurb, stats, portrait, art, atlasKey;
    }

    private final HashMap<String, HeroTexts> heroTexts = new HashMap<>();

    private HeroTexts heroTexts(HeroDef d) {
        HeroTexts t = heroTexts.get(d.key);
        if (t == null) {
            t = new HeroTexts();
            String desc = d.description;
            int i = desc.indexOf("Each level");
            t.blurb = (i > 0 ? desc.substring(0, i) : desc).trim();
            t.stats = "HP " + Math.round(d.hp) + "    ARMOR " + Math.round(d.armor) + "    SPEED " + Math.round(d.moveSpeed * 100) + "%";
            String lower = d.key.toLowerCase(java.util.Locale.ROOT);
            t.portrait = "portrait_" + lower + ".webp";
            t.art = "hero_" + lower + ".webp";
            t.atlasKey = "HERO_" + d.key;
            heroTexts.put(d.key, t);
        }
        return t;
    }

    // ---- icons

    private static String baseKey(String key) {
        switch (key) {
            case "VAMPIRICA": return "WHIP";
            case "HOLY_MISSILE": return "MAGIC_MISSILE";
            case "THOUSAND": return "KNIFE";
            case "SCYTHE": return "AXE";
            case "HEAVENSWORD": return "CROSS";
            case "VESPERS": return "HOLYBOOK";
            case "HELLFIRE": return "FIREBALL";
            case "VORTEX": return "GARLIC";
            case "BORA": return "HOLYWATER";
            case "LOOP": return "LIGHTNING";
            default: return key;
        }
    }

    private void frame(Canvas c, String key, float x, float y, float s) {
        atlas.drawIcon(c, null, key, x + s / 2, y + s / 2, s);
    }

    /** A weapon or passive in its slot: dark well, the icon, a rarity frame (gold for evolutions, yellow when maxed). */
    private void weaponTile(Canvas c, WeaponDef d, float x, float y, float s, boolean evo, boolean max) {
        k.slotWell(c, x, y, s);
        String key = baseKey(d.key);
        if (!atlas.drawIcon(c, null, key, x + s / 2, y + s / 2, s * 0.76f)) {
            k.text(c, d.name.substring(0, 1), x + s / 2, y + s * 0.66f, s * 0.5f, TEXT, Paint.Align.CENTER);
        }
        frame(c, evo ? "frame_unique" : max ? "frame_rare" : "frame_common", x, y, s);
    }

    /** Icon tile for a main weapon or branch id; dimmed unless {@code lit}. */
    private void iconKey(Canvas c, String key, float x, float y, float s, boolean lit, boolean gold) {
        k.slotWell(c, x, y, s);
        atlas.drawIcon(c, null, key, x + s / 2, y + s / 2, s * 0.76f);
        if (!lit) {
            r.set(x, y, x + s, y + s);
            fill.setColor(0xAA0C0908);
            c.drawRoundRect(r, s * 0.1f, s * 0.1f, fill);
        }
        frame(c, gold ? "frame_unique" : lit ? "frame_rare" : "frame_common", x, y, s);
    }

    private void levelPips(Canvas c, float x, float y, float w, int level, int max, int color) {
        if (max <= 0) return;
        float gap = 2f * k.u, pw = (w - (max - 1) * gap) / max, ph = 8f * k.u;
        for (int i = 0; i < max; i++) k.pip(c, x + i * (pw + gap), y, 0f, i < level, color, pw, ph);
    }

    private void cornerText(Canvas c, String s, float x, float y, float sz, float size, int color) {
        k.shadowed(c, s, x + sz - 6f * k.u, y + sz - 7f * k.u, size, color, Paint.Align.RIGHT);
    }

    // ---- HUD

    private static final String[] STAT_LABELS = {"TIME", "LEVEL", "KILLS", "GOLD"};
    private static final int[] STAT_COLS = {TEXT, Skin.ORANGE, Skin.BAD, GOLD};
    private static final String[] SLOT_LETTER = {"HEAD", "BODY", "GLOVE", "FEET", "RING", "NECK"};
    private static final String[] FRAME_KEYS = {"frame_common", "frame_magic", "frame_rare", "frame_unique"};
    private final String[] eliteLabel = new String[64];

    private void hudPanel(Canvas c, int w, int h) {
        Sim s = eng.sim;
        if (s == null) return;
        float u = k.u, m = 30f * u;
        // header: time, level, kills, gold on a riveted plate
        k.plate(c, m, 12f * u, w - m, 106f * u);
        k.rivets(c, m, 12f * u, w - m, 106f * u, 11f * u, 3f * u);
        float cw = (w - 2 * m) / 4f;
        int sec = (int) s.time;
        for (int i = 0; i < 4; i++) {
            float x = m + cw * i + cw / 2;
            String val = i == 0 ? tcs(0, sec) : i == 1 ? cs(1, "", s.level, "") : i == 2 ? cs(2, "", s.kills, "") : cs(3, "", s.gold, "");
            k.body(c, STAT_LABELS[i], x, 44f * u, 22f * u, DIM, Paint.Align.CENTER);
            k.text(c, val, x, 94f * u, 54f * u, STAT_COLS[i], Paint.Align.CENTER);
            if (i > 0) {
                fill.setColor(Skin.EDGE_LO);
                c.drawRect(m + cw * i - u, 26f * u, m + cw * i + u, 92f * u, fill);
            }
        }
        // hp and xp bars
        float bl = m + 58f * u;
        k.text(c, "HP", m, 156f * u, 30f * u, Skin.BAD, Paint.Align.LEFT);
        boolean low = s.hp < s.maxHp * 0.25f && ((int) (s.time * 4f) & 1) == 0;
        k.bar(c, bl, 118f * u, w - m, 166f * u, s.hp / s.maxHp, low ? 0xFFFF8068 : 0xFFFF5A3C, 0xFFB02818, 10);
        k.shadowed(c, cs(4, "", (int) Math.ceil(s.hp), " / ", (int) s.maxHp, ""), (bl + w - m) / 2f, 153f * u, 30f * u, 0xFFFFF4EC, Paint.Align.CENTER);
        k.text(c, "XP", m, 198f * u, 30f * u, Skin.LUMEN, Paint.Align.LEFT);
        k.bar(c, bl, 174f * u, w - m, 206f * u, s.xp / s.xpNeed, 0xFF7CFFB4, 0xFF1FB85E, 0);
        k.shadowed(c, cs(5, "", (int) s.xp, " / ", s.xpNeed, ""), (bl + w - m) / 2f, 199f * u, 22f * u, 0xFFEFFFF6, Paint.Align.CENTER);
        // status line: the hero, and what is burning, slowing or rotting it
        statusLine(c, s, m, 212f * u, w - m, u);
        // main weapon row: the hero's weapon and its four branches (3 pips each)
        if (s.main != null) mainRow(c, s, m, 252f * u, w - m, u);
        k.divider(c, m, 334f * u, w - m);
        // weapons and passives side by side
        float colGap = 44f * u, colW = (w - 2 * m - colGap) / 2f, gap = 8f * u;
        float sl = Math.min(88f * u, (colW - 5 * gap) / 6f);
        float px = m + colW + colGap;
        k.text(c, "WEAPONS", m, 366f * u, 24f * u, DIM, Paint.Align.LEFT);
        k.text(c, "PASSIVES", px, 366f * u, 24f * u, DIM, Paint.Align.LEFT);
        slotRow(c, s, true, m, 376f * u, sl, gap, u);
        slotRow(c, s, false, px, 376f * u, sl, gap, u);
        // equipment: 6 slots in rarity frames, next to them the boss / elite readout
        float ey = 516f * u, es = sl;
        k.text(c, "EQUIPMENT", m, 508f * u, 24f * u, DIM, Paint.Align.LEFT);
        equipStrip(c, s, m, ey, es, gap, u);
        k.text(c, "THREAT", px, 508f * u, 24f * u, DIM, Paint.Align.LEFT);
        alertZone(c, s, px, 516f * u, w - m, 616f * u, u);
        k.divider(c, m, 628f * u, w - m);
        // minimap bottom-left; pause, dodge and the touch areas bottom-right
        float top = 644f * u;
        float side = Math.min(h - top - m, (w - 3 * m) * 0.5f);
        minimap(c, s, m, h - m - side, side);
        float rx = m * 2 + side, ry = h - m - side, rw = w - m - rx;
        float pw = rw * 0.28f, bh = 84f * u;
        pauseButton(c, rx, ry, rx + pw, ry + bh, u);
        hit(rx, ry, rx + pw, ry + bh, 0, 0);
        dodgeButton(c, s, rx + pw + 12f * u, ry, w - m, ry + bh, u);
        zt = at = ry + bh + 14f * u;
        zb = ab = h - m;
        boolean pad = eng.input.gamepadSeen;
        zl = rx;
        zr = pad ? w - m : rx + rw / 2f - 6f * u;
        al = pad ? 0f : rx + rw / 2f + 6f * u;
        ar = pad ? 0f : w - m;
        touchArea(c, zl, zt, zr, zb, joyPointer < 0, pad ? "GAMEPAD: LEFT STICK MOVES, RIGHT STICK AIMS, A DODGES" : "MOVE", u, false);
        if (ar > al) touchArea(c, al, at, ar, ab, aimPointer < 0, "AIM", u, true);
        bossBanner(c, s, w, h, u);
    }

    /** Hero name and level on the left; Burn, Slow and Decay icons with their seconds on the right. */
    private void statusLine(Canvas c, Sim s, float x0, float y0, float x1, float u) {
        if (s.hero != null) k.text(c, up(s.hero.name), x0, y0 + 26f * u, 28f * u, TEXT, Paint.Align.LEFT);
        float x = x1;
        boolean any = false;
        float gr = 15f * u;
        if (s.heroDecayT > 0f) {
            k.text(c, cs(60, "", (int) Math.ceil(s.heroDecayT), "s"), x, y0 + 28f * u, 24f * u, 0xFF9CF070, Paint.Align.RIGHT);
            x -= 36f * u;
            k.glyph(c, Skin.G_DECAY, x - gr + 8f * u, y0 + 17f * u, gr, 0xFF7CE04A);
            x -= gr * 2 + 14f * u;
            any = true;
        }
        if (s.heroSlowT > 0f) {
            k.text(c, cs(61, "", (int) Math.ceil(s.heroSlowT), "s"), x, y0 + 28f * u, 24f * u, 0xFF8FE8FF, Paint.Align.RIGHT);
            x -= 36f * u;
            k.glyph(c, Skin.G_FROST, x - gr + 8f * u, y0 + 17f * u, gr, Skin.COOL);
            x -= gr * 2 + 14f * u;
            any = true;
        }
        if (s.heroBurnT > 0f) {
            k.text(c, cs(62, "", (int) Math.ceil(s.heroBurnT), "s"), x, y0 + 28f * u, 24f * u, 0xFFFFB070, Paint.Align.RIGHT);
            x -= 36f * u;
            k.glyph(c, Skin.G_FIRE, x - gr + 8f * u, y0 + 17f * u, gr, Skin.ORANGE);
            any = true;
        }
        if (!any) k.body(c, "STATUS CLEAR", x1, y0 + 26f * u, 22f * u, 0xFF6F655A, Paint.Align.RIGHT);
    }

    // ---- equipment strip, boss and elite readout, boss banner

    /** One item in a rarity frame at (x, y), size s: its icon under the frame; an empty slot is a dark tile with the slot name. */
    private void itemTile(Canvas c, EquipDef d, int rar, float x, float y, float sz, String emptyLabel, float u) {
        k.slotWell(c, x, y, sz);
        if (d == null) {
            if (emptyLabel != null) k.body(c, emptyLabel, x + sz / 2, y + sz / 2 + 7f * u, 22f * u, 0xFF5A5048, Paint.Align.CENTER);
            return;
        }
        int rr = Math.max(0, Math.min(3, rar));
        atlas.drawIcon(c, null, d.icon, x + sz / 2, y + sz / 2, sz * 0.76f);
        if (atlas.drawIcon(c, null, FRAME_KEYS[rr], x + sz / 2, y + sz / 2, sz)) { /* the rarity frame is drawn over the icon */ }
        else {
            stroke.setColor(Equipment.RARITY_COLORS[rr]);
            stroke.setStrokeWidth(4f);
            r.set(x, y, x + sz, y + sz);
            c.drawRoundRect(r, sz * 0.14f, sz * 0.14f, stroke);
        }
    }

    private void equipStrip(Canvas c, Sim s, float x, float y, float es, float gap, float u) {
        for (int i = 0; i < EquipDef.SLOTS; i++) {
            itemTile(c, s.equip.def[i], s.equip.rar[i], x + i * (es + gap), y, es, SLOT_LETTER[i], u);
        }
    }

    /** The boss (portrait, name, phase, health) and the live elite (modifier icons, tag, health) next to the equipment strip. */
    private void alertZone(Canvas c, Sim s, float x0, float y0, float x1, float y1, float u) {
        Entities.Enemy b = s.bossNow, el = s.eliteNow;
        boolean boss = b != null && !b.dead, elite = el != null && !el.dead && el.elite;
        if (!boss && !elite) {
            if (!compact) {
                k.well(c, x0, y0 - 6f * u, x1, y0 + 82f * u, 6f * u);
                k.body(c, "NO HOSTILE SIGNATURE", (x0 + x1) / 2f, y0 + 44f * u, 22f * u, 0xFF6F655A, Paint.Align.CENTER);
            }
            return;
        }
        float y = y0;
        if (boss) {
            float ps = 66f * u;
            k.slotWell(c, x0, y, ps);
            atlas.drawIcon(c, null, bossKey(b.type.def.key), x0 + ps / 2, y + ps / 2, ps * 0.9f);
            stroke.setColor(Skin.DANGER);
            stroke.setStrokeWidth(3f * u);
            r.set(x0, y, x0 + ps, y + ps);
            c.drawRoundRect(r, ps * 0.1f, ps * 0.1f, stroke);
            float tx = x0 + ps + 14f * u;
            k.fit(c, b.type.nameUpper, tx, y + 28f * u, 30f * u, (x1 - tx) * 0.64f, 0xFFFFA58A, Paint.Align.LEFT);
            if (b.type.pattern == 5) k.text(c, cs(50, "PHASE ", b.phase + 1, ""), x1, y + 28f * u, 26f * u, 0xFFFF9A7A, Paint.Align.RIGHT);
            else k.text(c, cs(51, "", Math.round(100f * b.hp / b.maxHp), "%"), x1, y + 28f * u, 26f * u, DIM, Paint.Align.RIGHT);
            float by0 = y + 36f * u, by1 = y + 62f * u;
            boolean hot = b.phase >= 2 && b.type.pattern == 5;
            k.bar(c, tx, by0, x1, by1, b.hp / b.maxHp, hot ? 0xFFFF6A3C : 0xFFFF5A3C, hot ? 0xFFD02810 : 0xFFA82418, 0);
            if (b.type.pattern == 5) { // the phase marks of The First
                fill.setColor(0xFF000000);
                for (int i = 1; i <= 2; i++) {
                    float mx = tx + (x1 - tx) * (i == 1 ? 0.33f : 0.66f);
                    c.drawRect(mx - 1.5f * u, by0, mx + 1.5f * u, by1, fill);
                }
            }
            y += ps + 6f * u;
        }
        if (elite) {
            float gx = x0 + 14f * u, gr = boss ? 12f * u : 15f * u;
            int nm = Elites.bits(el.mods);
            for (int n = 0; n < nm; n++) { // an icon per modifier in its colour
                k.glyph(c, Elites.indexOf(el.mods, n), gx, y + gr + 2f * u, gr, Elites.colorOf(el.mods, n));
                gx += gr * 2 + 6f * u;
            }
            int mask = el.mods & 63;
            if (eliteLabel[mask] == null) eliteLabel[mask] = "ELITE  " + Elites.label(mask);
            k.fit(c, eliteLabel[mask], gx + 4f * u, y + gr + 10f * u, boss ? 24f * u : 28f * u, x1 - gx - 120f * u, TEXT, Paint.Align.LEFT);
            // what is on the elite: burn, frost, electrify and decay stacks
            float sx = x1;
            for (int i = 3; i >= 0; i--) {
                int st = i == 0 ? el.burn : i == 1 ? el.frost : i == 2 ? el.elec : el.decay;
                if (st <= 0) continue;
                k.text(c, cs(52 + i, "", st, ""), sx, y + gr + 10f * u, 22f * u, TEXT, Paint.Align.RIGHT);
                sx -= 22f * u;
                k.glyph(c, i == 0 ? Skin.G_FIRE : i == 1 ? Skin.G_FROST : i == 2 ? Skin.G_BOLT : Skin.G_DECAY, sx - 9f * u, y + gr + 3f * u, 11f * u,
                        i == 0 ? Skin.ORANGE : i == 1 ? Skin.COOL : i == 2 ? 0xFFFFF070 : 0xFF7CE04A);
                sx -= 26f * u;
            }
            if (!boss) k.bar(c, x0, y + 40f * u, x1, y + 62f * u, el.hp / el.maxHp, Elites.colorOf(el.mods, 0), Elites.colorOf(el.mods, 0) & 0xFFB0B0B0, 0);
        }
    }

    /** The 2 s banner when a boss appears: framed portrait, name in capitals, hazard stripes and a red warning line. */
    private void bossBanner(Canvas c, Sim s, int w, int h, float u) {
        if (s.bannerT <= 0f || s.bannerKey.isEmpty()) return;
        float t = Sim.BANNER_LIFE - s.bannerT, a = Math.max(0f, Math.min(1f, Math.min(t / 0.2f, s.bannerT / 0.35f)));
        int ai = (int) (255 * a);
        float top = h * 0.30f, bot = h * 0.62f;
        fill.setColor((((int) (252 * a)) << 24) | 0x0E0A08);
        c.drawRect(0, top, w, bot, fill);
        float pulse = 0.5f + 0.5f * (float) Math.sin(t * 14f);
        int red = ai << 24 | (pulse > 0.5f ? 0xFF3B1F : 0xC02810);
        fill.setColor(red);
        c.drawRect(0, top, w, top + 8f * u, fill);
        c.drawRect(0, bot - 8f * u, w, bot, fill);
        if (a > 0.6f) {
            k.stripe(c, 0, top + 8f * u, w, top + 22f * u, false);
            k.stripe(c, 0, bot - 22f * u, w, bot - 8f * u, false);
        }
        float ps = bot - top - 80f * u;
        float px = 40f * u, py = top + 40f * u;
        k.slotWell(c, px, py, ps);
        atlas.drawIcon(c, null, bossKey(s.bannerKey), px + ps / 2, py + ps / 2, ps * 0.94f);
        stroke.setColor(red);
        stroke.setStrokeWidth(5f * u);
        r.set(px, py, px + ps, py + ps);
        c.drawRoundRect(r, ps * 0.06f, ps * 0.06f, stroke);
        float tx = px + ps + 36f * u;
        k.text(c, pulse > 0.5f ? "WARNING  -  BOSS" : "BOSS", tx, top + 82f * u, 34f * u, (ai << 24) | 0xFF7A5A, Paint.Align.LEFT);
        String nm = s.bannerName;
        float size = Math.min(84f * u, (w - tx - 30f * u) / Math.max(4f, nm.length()) * 2.2f);
        k.shadowed(c, nm, tx, top + 82f * u + size + 8f * u, size, (ai << 24) | 0xFFF0E0, Paint.Align.LEFT);
        fill.setColor(((int) (210 * a) << 24) | 0xFF3B1F);
        c.drawRect(tx, bot - 52f * u, tx + (w - tx - 40f * u) * Math.min(1f, t / 0.6f), bot - 44f * u, fill);
    }

    /** An idle touch area: an industrial pad with a ring, ticks and its label (hidden while a finger drives it). */
    private void touchArea(Canvas c, float l, float t, float rr, float b, boolean idle, String label, float u, boolean aim) {
        if (!idle) return;
        k.plate(c, l, t, rr, b, 0x40000000, Skin.EDGE_LO, 3f * u);
        float cx = (l + rr) / 2, cy = (t + b) / 2 - 22f * u;
        float ring = Math.min(joyR, Math.min(rr - l, b - t) * 0.31f);
        int col = aim ? Skin.ORANGE_DIM : 0xFF6A5E52;
        stroke.setColor(col);
        stroke.setStrokeWidth(4f * u);
        c.drawCircle(cx, cy, ring, stroke);
        stroke.setStrokeWidth(2f * u);
        c.drawCircle(cx, cy, ring * 1.3f, stroke);
        for (int i = 0; i < 4; i++) { // N E S W ticks
            float dx = i == 1 ? 1 : i == 3 ? -1 : 0, dy = i == 0 ? -1 : i == 2 ? 1 : 0;
            c.drawLine(cx + dx * ring * 1.15f, cy + dy * ring * 1.15f, cx + dx * ring * 1.45f, cy + dy * ring * 1.45f, stroke);
        }
        fill.setColor(aim ? 0xFF4A2A10 : 0xFF2E2620);
        c.drawCircle(cx, cy, ring * 0.4f, fill);
        k.text(c, label, cx, b - 16f * u, label.length() > 8 ? 22f * u : 30f * u, aim ? 0xFFC98A52 : DIM, Paint.Align.CENTER);
        k.rivets(c, l, t, rr, b, 12f * u, 3f * u);
    }

    private static final String[] ROMAN = {"I", "II", "III"};

    /** The hero's main weapon icon and name, then each branch as an icon with 3 pips (filled = tier taken). */
    private void mainRow(Canvas c, Sim s, float x0, float y0, float x1, float u) {
        MainWeapon mw = s.main;
        float is = 68f * u;
        iconKey(c, mw.def.key, x0, y0, is, true, true);
        float tx = x0 + is + 16f * u;
        k.text(c, mw.def.name, tx, y0 + 30f * u, 32f * u, TEXT, Paint.Align.LEFT);
        k.text(c, "MAIN WEAPON", tx, y0 + 60f * u, 22f * u, Skin.ORANGE, Paint.Align.LEFT);
        int nb = mw.def.branches.size();
        float cx0 = x0 + 340f * u, cw = (x1 - cx0) / Math.max(1, nb), bs = 56f * u;
        for (int b = 0; b < nb; b++) {
            float bx = cx0 + b * cw;
            int t = mw.tier[b];
            iconKey(c, mw.def.branches.get(b).id, bx, y0 + 6f * u, bs, t > 0, false);
            for (int p = 0; p < 3; p++) k.pip(c, bx + bs + 12f * u + p * 18f * u, y0 + 14f * u, 14f * u, p < t, GOLD);
            if (t > 0) k.text(c, ROMAN[t - 1], bx + bs + 12f * u, y0 + 54f * u, 24f * u, GOLD, Paint.Align.LEFT);
        }
    }

    /** DODGE button: a cooldown fill that drains and the seconds left; also the touch rectangle for the dodge. */
    private void dodgeButton(Canvas c, Sim s, float l, float t, float rr, float b, float u) {
        dl = l;
        dt = t;
        dr = rr;
        db = b;
        boolean ready = s.dodgeCd <= 0f;
        k.plate(c, l, t, rr, b, ready ? 0x3039FF88 : 0, ready ? Skin.LUMEN : Skin.EDGE, ready ? 4f * u : 2f * u);
        if (!ready) { // lit part grows from the left as the cooldown runs out
            float f = 1f - Math.min(1f, s.dodgeCd / Math.max(0.01f, s.dodgeCdMax));
            r.set(l + 4f * u, b - 14f * u, l + 4f * u + (rr - l - 8f * u) * f, b - 6f * u);
            fill.setColor(Skin.LUMEN_DARK);
            c.drawRect(r, fill);
        }
        String label = ready ? "DODGE" : cs(40, "DODGE  ", (int) Math.ceil(s.dodgeCd), "s");
        k.text(c, label, (l + rr) / 2f, (t + b) / 2f + 12f * u, 40f * u, ready ? 0xFFE8FFF0 : DIM, Paint.Align.CENTER);
    }

    private void pauseButton(Canvas c, float l, float t, float rr, float b, float u) {
        k.plate(c, l, t, rr, b);
        float cx = (l + rr) / 2f - 52f * u, cy = (t + b) / 2f;
        fill.setColor(Skin.ORANGE);
        c.drawRect(cx - 12f * u, cy - 16f * u, cx - 3f * u, cy + 16f * u, fill);
        c.drawRect(cx + 3f * u, cy - 16f * u, cx + 12f * u, cy + 16f * u, fill);
        k.text(c, "PAUSE", cx + 36f * u, cy + 13f * u, 38f * u, TEXT, Paint.Align.LEFT);
    }

    private void slotRow(Canvas c, Sim s, boolean weapons, float x, float y, float slot, float gap, float u) {
        Inventory inv = s.inv;
        int n = weapons ? inv.weaponCount : inv.passiveCount;
        for (int i = 0; i < 6; i++) {
            float sx = x + i * (slot + gap);
            if (i < n) {
                Inventory.Slot sl = weapons ? inv.weapons[i] : inv.passives[i];
                int max = sl.def.maxLevel();
                boolean full = sl.level >= max;
                weaponTile(c, sl.def, sx, y, slot, sl.def.evolution, full);
                cornerText(c, sl.def.evolution ? "EVO" : full ? "MAX" : cs((weapons ? 8 : 20) + i, "", sl.level, ""), sx, y, slot,
                        sl.def.evolution || full ? 22f * u : 26f * u, sl.def.evolution || full ? GOLD : TEXT);
                if (!sl.def.evolution) levelPips(c, sx + 3f * u, y + slot + 5f * u, slot - 6f * u, sl.level, max, full ? GOLD : Skin.ORANGE);
            } else {
                k.slotWell(c, sx, y, slot);
            }
        }
    }

    private void minimap(Canvas c, Sim s, float x, float y, float side) {
        float u = k.u;
        k.plate(c, x - 6f * u, y - 6f * u, x + side + 6f * u, y + side + 6f * u, 0, Skin.EDGE, 3f * u);
        r.set(x, y, x + side, y + side);
        fill.setColor(0xFF07090A);
        c.drawRect(r, fill);
        float range = 1000f, kk = side / (2 * range);
        float cx = x + side / 2, cy = y + side / 2;
        c.save();
        c.clipRect(x + 3, y + 3, x + side - 3, y + side - 3);
        // scope grid and the extent of the top screen
        stroke.setStrokeWidth(Math.max(1f, u));
        stroke.setColor(0xFF1A2A22);
        for (int i = 1; i < 4; i++) {
            float g = side * i / 4f;
            c.drawLine(x + g, y, x + g, y + side, stroke);
            c.drawLine(x, y + g, x + side, y + g, stroke);
        }
        stroke.setColor(0xFF2E5A44);
        stroke.setStrokeWidth(Math.max(2f, 2f * u));
        c.drawRect(cx - 640 * kk, cy - 360 * kk, cx + 640 * kk, cy + 360 * kk, stroke);
        int n = 0;
        int pn = Math.min(s.pickN, Sim.MAX_PICK);
        for (int i = 0; i < pn; i++) {
            Entities.Pickup p = s.picks[i];
            if (p.kind != Entities.K_GEM || p.red) continue;
            float dx = (p.x - s.px) * kk, dy = (p.y - s.py) * kk;
            if (Math.abs(dx) > side / 2 || Math.abs(dy) > side / 2) continue;
            ptsB[n++] = cx + dx;
            ptsB[n++] = cy + dy;
        }
        k.tp.setStrokeWidth(4f * u);
        k.tp.setStrokeCap(Paint.Cap.ROUND);
        k.tp.setColor(0xFF1BD6C8);
        c.drawPoints(ptsB, 0, n, k.tp);
        n = 0;
        int en = Math.min(s.enemyN, Sim.MAX_ENEMIES);
        for (int i = 0; i < en; i++) {
            Entities.Enemy e = s.enemies[i];
            float dx = (e.x - s.px) * kk, dy = (e.y - s.py) * kk;
            if (Math.abs(dx) > side / 2 || Math.abs(dy) > side / 2) continue;
            ptsA[n++] = cx + dx;
            ptsA[n++] = cy + dy;
        }
        k.tp.setStrokeWidth(5f * u);
        k.tp.setColor(0xFFFF4A32);
        c.drawPoints(ptsA, 0, n, k.tp);
        k.tp.setStrokeWidth(0f);
        for (int i = 0; i < en; i++) {
            Entities.Enemy e = s.enemies[i];
            if (!e.boss) continue;
            fill.setColor(Skin.ORANGE);
            c.drawCircle(cx + (e.x - s.px) * kk, cy + (e.y - s.py) * kk, 10f * u, fill);
        }
        for (int i = 0; i < pn; i++) {
            Entities.Pickup p = s.picks[i];
            if (p.red) { // the condensed gem pile: a bigger crimson dot
                fill.setColor(0xFFD01838);
                c.drawCircle(cx + (p.x - s.px) * kk, cy + (p.y - s.py) * kk, 7f * u, fill);
                continue;
            }
            if (p.kind == Entities.K_GEM) continue;
            float dx = (p.x - s.px) * kk, dy = (p.y - s.py) * kk;
            float lim = side / 2 - 10f * u;
            if (p.kind == Entities.K_CHEST || p.kind == Entities.K_EQUIP) { // chests and crates are clamped to the edge so they can be found
                dx = Math.max(-lim, Math.min(lim, dx));
                dy = Math.max(-lim, Math.min(lim, dy));
                fill.setColor(p.kind == Entities.K_EQUIP ? 0xFF4FA8FF : GOLD);
                c.drawRect(cx + dx - 8f * u, cy + dy - 8f * u, cx + dx + 8f * u, cy + dy + 8f * u, fill);
            } else if (Math.abs(dx) < lim && Math.abs(dy) < lim) {
                fill.setColor(p.kind <= Entities.K_COINBAG ? 0xFFFFD23C : 0xFF50E070);
                c.drawCircle(cx + dx, cy + dy, 4f * u, fill);
            }
        }
        fill.setColor(0xFFFFFFFF);
        c.drawCircle(cx, cy, 7f * u, fill);
        stroke.setColor(Skin.ORANGE);
        stroke.setStrokeWidth(3f * u);
        c.drawCircle(cx, cy, 13f * u, stroke);
        c.restore();
        // corner brackets on the scope
        fill.setColor(Skin.ORANGE);
        float bk = 22f * u, bw = 4f * u;
        c.drawRect(x, y, x + bk, y + bw, fill);
        c.drawRect(x, y, x + bw, y + bk, fill);
        c.drawRect(x + side - bk, y + side - bw, x + side, y + side, fill);
        c.drawRect(x + side - bw, y + side - bk, x + side, y + side, fill);
        k.body(c, "N", cx, y + 26f * u, 22f * u, 0xFF4F8A6C, Paint.Align.CENTER);
    }

    private void hudStrip(Canvas c, int w, int h) {
        Sim s = eng.sim;
        if (s == null) return;
        float u = k.u;
        float sh = 92f * u;
        fill.setColor(0xD00E0A08);
        c.drawRect(0, 0, w, sh, fill);
        k.stripe(c, 0, sh, w, sh + 5f * u, true);
        k.bar(c, 0, 0, w, 12f * u, s.xp / s.xpNeed, 0xFF7CFFB4, 0xFF1FB85E, 0);
        float m = 14f * u;
        k.button(c, m, 20f * u, m + 120f * u, sh - 10f * u, "II", false);
        hit(m, 20f * u, m + 120f * u, sh - 10f * u, 0, 0);
        float bx = m * 2 + 120f * u;
        k.bar(c, bx, 22f * u, bx + 360f * u, 52f * u, s.hp / s.maxHp, 0xFFFF5A3C, 0xFFB02818, 10);
        k.shadowed(c, cs(4, "", (int) Math.ceil(s.hp), " / ", (int) s.maxHp, ""), bx + 180f * u, 47f * u, 22f * u, 0xFFFFF4EC, Paint.Align.CENTER);
        // mini slot icons
        float is = 28f * u, ix = bx;
        for (int i = 0; i < s.inv.weaponCount; i++, ix += is + 3f * u) weaponTile(c, s.inv.weapons[i].def, ix, 58f * u, is, s.inv.weapons[i].def.evolution, false);
        ix += 10f * u;
        for (int i = 0; i < s.inv.passiveCount; i++, ix += is + 3f * u) weaponTile(c, s.inv.passives[i].def, ix, 58f * u, is, false, false);
        ix += 10f * u;
        for (int i = 0; i < EquipDef.SLOTS; i++) { // the worn equipment, small
            if (s.equip.def[i] == null) continue;
            itemTile(c, s.equip.def[i], s.equip.rar[i], ix, 58f * u, is, null, u);
            ix += is + 3f * u;
        }
        alertZone(c, s, w * 0.3f, sh + 12f * u, w * 0.7f, sh + 110f * u, u); // boss and elite under the strip
        float rx = w - m;
        k.shadowed(c, cs(70, "G ", s.gold, ""), rx, 40f * u, 32f * u, GOLD, Paint.Align.RIGHT);
        k.shadowed(c, cs(71, "K ", s.kills, ""), rx - 190f * u, 40f * u, 32f * u, Skin.BAD, Paint.Align.RIGHT);
        k.shadowed(c, cs(72, "LV ", s.level, ""), rx - 380f * u, 40f * u, 32f * u, Skin.ORANGE, Paint.Align.RIGHT);
        k.shadowed(c, tcs(1, (int) s.time), w / 2f + 200f * u, 50f * u, 46f * u, TEXT, Paint.Align.CENTER);
        // the whole screen is the move stick, so the dodge button sits in the bottom-right corner
        dodgeButton(c, s, w - m - 250f * u, h - m - 110f * u, w - m, h - m, u);
        bossBanner(c, s, w, h, u);
    }

    private void drawJoystick(Canvas c) {
        if (aimPointer >= 0) {
            stroke.setColor(0x88FF8A2A);
            stroke.setStrokeWidth(4f);
            c.drawCircle(aimOx, aimOy, joyR, stroke);
            fill.setColor(0x66FF8A2A);
            float dx = aimCx - aimOx, dy = aimCy - aimOy, m = (float) Math.sqrt(dx * dx + dy * dy);
            if (m > joyR) { dx = dx / m * joyR; dy = dy / m * joyR; }
            c.drawCircle(aimOx + dx, aimOy + dy, joyR * 0.4f, fill);
        }
        if (joyPointer < 0) return;
        stroke.setColor(0x88FFE2C8);
        stroke.setStrokeWidth(4f);
        c.drawCircle(joyOx, joyOy, joyR, stroke);
        fill.setColor(0x66FFE2C8);
        float dx = joyCx - joyOx, dy = joyCy - joyOy, m = (float) Math.sqrt(dx * dx + dy * dy);
        if (m > joyR) { dx = dx / m * joyR; dy = dy / m * joyR; }
        c.drawCircle(joyOx + dx, joyOy + dy, joyR * 0.4f, fill);
    }

    // ---- level-up cards

    private float[] col = new float[2];

    private float[] column(int w, int h, float maxW) {
        float cw = compact ? Math.min(w * 0.7f, maxW) : w - 60f * (h / 1080f);
        col[0] = (w - cw) / 2f;
        col[1] = cw;
        return col;
    }

    /** Screen heading: a steel band with hazard stripes under it, and a line of small print. */
    private void heading(Canvas c, int w, String title, int color, String sub, float baseline, float size, float u) {
        k.shadowed(c, title, w / 2f, baseline, size, color, Paint.Align.CENTER);
        float hw = compact ? Math.min(w * 0.38f, 520f * u) : w * 0.38f;
        k.stripe(c, w / 2f - hw, baseline + 18f * u, w / 2f + hw, baseline + 25f * u, true);
        if (sub != null) k.body(c, sub, w / 2f, baseline + 62f * u, 30f * u, DIM, Paint.Align.CENTER);
    }

    private void levelUp(Canvas c, int w, int h) {
        Sim s = eng.sim;
        List<Offer> offers = eng.offers;
        float u = k.u;
        float[] cl = column(w, h, 1000f * u);
        float x = cl[0], cw = cl[1];
        heading(c, w, "LEVEL UP", Skin.ORANGE, s != null ? cs(80, "LEVEL ", s.level, "   -   CHOOSE AN UPGRADE") : "CHOOSE AN UPGRADE", 90f * u, 80f * u, u);
        int n = offers.size();
        float top = 176f * u, avail = h - top - 80f * u, gap = 16f * u;
        float ch = Math.min(250f * u, (avail - (n - 1) * gap) / Math.max(1, n));
        for (int i = 0; i < n; i++) {
            Offer o = offers.get(i);
            float y = top + i * (ch + gap);
            boolean f = i == eng.focus;
            boolean branch = o.kind == Offer.BRANCH; // the Main card: gold frame and the hero's portrait
            int tint = branch ? 0x30FFD84A : 0;
            if (f) tint = branch ? 0x55FFB020 : 0x44FF8A2A;
            k.plate(c, x, y, x + cw, y + ch, tint, f ? Skin.ORANGE : branch ? GOLD : Skin.EDGE, f ? 5f * u : branch ? 4f * u : 2f * u);
            if (branch) k.rivets(c, x, y, x + cw, y + ch, 10f * u, 3f * u);
            if (f) k.focusMarks(c, x, y, x + cw, y + ch);
            hit(x, y, x + cw, y + ch, i, 0);
            float is = ch - 36f * u;
            if (branch) {
                iconKey(c, o.key(), x + 18f * u, y + 18f * u, is, true, true);
                if (s != null && s.hero != null) {
                    float ps = Math.min(is * 0.62f, 100f * u);
                    float px = x + cw - 24f * u - ps, py = y + ch - 16f * u - ps;
                    k.slotWell(c, px, py, ps);
                    atlas.drawIcon(c, null, heroTexts(s.hero).atlasKey, px + ps / 2, py + ps / 2, ps * 0.9f);
                    frame(c, "frame_unique", px, py, ps);
                }
            } else if (o.def != null) {
                weaponTile(c, o.def, x + 18f * u, y + 18f * u, is, o.def.evolution, false);
            } else {
                k.slotWell(c, x + 18f * u, y + 18f * u, is);
                k.glyph(c, o.kind == Offer.HEAL ? Skin.G_DECAY : Skin.G_BOLT, x + 18f * u + is / 2, y + ch / 2, is * 0.36f, o.kind == Offer.HEAL ? Skin.GOOD : GOLD);
            }
            float tx = x + 18f * u + is + 22f * u;
            float titleSize = Math.min(46f * u, ch * 0.23f);
            k.text(c, o.title(), tx, y + 14f * u + titleSize, titleSize, 0xFFFFF4E6, Paint.Align.LEFT);
            String tag;
            int tagCol = GOLD;
            switch (o.kind) {
                case Offer.NEW_WEAPON: case Offer.NEW_PASSIVE: tag = "NEW"; tagCol = Skin.LUMEN; break;
                case Offer.HEAL: case Offer.GOLD: tag = ""; break;
                case Offer.BRANCH: tag = TIER_TAG[o.newLevel - 1]; break;
                default: tag = o.newLevel >= o.def.maxLevel() ? cs(81 + i, "LV ", o.newLevel, "  MAX") : cs(81 + i, "LV ", o.newLevel, "");
            }
            k.text(c, tag, x + cw - 24f * u, y + 14f * u + titleSize, titleSize * 0.8f, tagCol, Paint.Align.RIGHT);
            // level pips of the weapon or passive: the level this card brings is the lit orange one
            if (o.def != null && o.kind != Offer.NEW_WEAPON && o.kind != Offer.NEW_PASSIVE || o.kind == Offer.NEW_WEAPON || o.kind == Offer.NEW_PASSIVE) {
                if (o.def != null) {
                    int max = o.def.maxLevel();
                    float pw = Math.min(180f * u, max * 22f * u);
                    float py = y + ch - 22f * u;
                    float px = branch ? tx : x + cw - 24f * u - pw;
                    if (!branch) levelPips(c, px, py, pw, Math.min(max, o.newLevel), max, Skin.ORANGE);
                }
            } else if (branch) {
                for (int p = 0; p < 3; p++) k.pip(c, tx + p * 24f * u, y + ch - 30f * u, 16f * u, p < o.newLevel, GOLD);
            }
            float lineH = Math.min(34f * u, ch * 0.17f) * 1.16f;
            float dTop = y + 14f * u + titleSize + 14f * u + lineH * 0.7f;
            int maxLines = Math.max(1, Math.min(3, (int) ((ch - (dTop - y) - 26f * u) / lineH) + 1));
            k.wrap(c, describe(i, o), tx, dTop, x + cw - tx - 30f * u, lineH, maxLines, Math.min(34f * u, ch * 0.17f), 0xFFC9BFB0);
        }
        k.body(c, "TAP A CARD    |    D-PAD / STICK + A", w / 2f, h - 30f * u, 24f * u, DIM, Paint.Align.CENTER);
    }

    private final Offer[] descOffer = new Offer[8];
    private final String[] descText = new String[8];

    /** The card text, built once per offer (Describe formats numbers, which allocates). */
    private String describe(int i, Offer o) {
        if (i >= descOffer.length) return Describe.offer(o);
        if (descOffer[i] != o) {
            descOffer[i] = o;
            descText[i] = Describe.offer(o);
        }
        return descText[i];
    }

    private static final String[] TIER_TAG = {"MAIN BRANCH  I", "MAIN BRANCH  II", "MAIN BRANCH  III"};

    // ---- equipment choice (design section 6): the item in the slot against the one just found

    private EquipDef keysFor, slotSrc;
    private String slotLine = "";
    private String[] keyCache = new String[0];
    private final String[] rarUpper = new String[4];

    private String[] statKeys(EquipDef d) {
        if (d != keysFor) {
            keysFor = d;
            keyCache = Equipment.keys(d);
        }
        return keyCache;
    }

    /** Index into {@link UiArt#STAT_KEYS} of the icon for an equipment stat key. */
    private static int statIcon(String key) {
        switch (key) {
            case "armor": return 2;
            case "maxHp": return 1;
            case "damageTaken": case "knockbackTaken": return 7;
            case "regen": case "cloudHeal": return 11;
            case "power": case "mainDamage": return 0;
            case "cooldown": case "dodgeCooldown": return 4;
            case "critChance": return 5;
            case "moveSpeed": case "ashTrail": return 10;
            case "statusChance_electrify": case "statusChance_burn": case "statusChance_frost": return 9;
            case "magnet": case "growth": case "lightRadius": return 12;
            case "amount": return 3;
            case "luck": return 6;
            case "enemySpeed": return 8;
            default: return 13;
        }
    }

    private void statRow(Canvas c, String key, String line, float cx, float y, float size, int color) {
        float u = k.u;
        k.tp.setTypeface(art.semi);
        k.tp.setTextSize(size);
        float tw = k.tp.measureText(line), is = size * 1.15f;
        float x0 = cx - (tw + is + 8f * u) / 2f;
        art.statIcon(c, statIcon(key), x0 + is / 2, y - size * 0.32f, is);
        k.body(c, line, x0 + is + 8f * u, y, size, color, Paint.Align.LEFT);
    }

    private void equipChoice(Canvas c, int w, int h) {
        float u = k.u;
        float[] cl = column(w, h, 1500f * u);
        float x = cl[0], cw = cl[1];
        EquipDef nd = eng.equipNew, od = eng.equipOld;
        if (nd == null) return;
        if (nd != slotSrc) {
            slotSrc = nd;
            slotLine = EquipDef.SLOT_NAMES[nd.slot] + " slot  -  keep what you wear or replace it";
        }
        heading(c, w, "NEW EQUIPMENT", GOLD, slotLine, 84f * u, 70f * u, u);
        float gap = 20f * u, ch = Math.min(740f * u, h - 330f * u), top = 176f * u;
        float cardW = (cw - gap) / 2f;
        Sim s = eng.sim;
        for (int i = 0; i < 2; i++) {
            boolean replace = i == 1, f = eng.focus == i;
            EquipDef d = replace ? nd : od;
            int rar = replace ? eng.equipNewRar : eng.equipOldRar;
            int rr = Math.max(0, Math.min(3, rar));
            int rc = Equipment.RARITY_COLORS[rr];
            float cx = x + i * (cardW + gap);
            k.plate(c, cx, top, cx + cardW, top + ch, f ? 0x40FF8A2A : 0, f ? Skin.ORANGE : Skin.EDGE, f ? 5f * u : 2f * u);
            if (f) k.focusMarks(c, cx, top, cx + cardW, top + ch);
            k.rivets(c, cx, top, cx + cardW, top + ch, 10f * u, 3f * u);
            hit(cx, top, cx + cardW, top + ch, i, 0);
            k.text(c, replace ? "REPLACE" : "KEEP", cx + cardW / 2, top + 50f * u, 40f * u, f ? Skin.ORANGE : DIM, Paint.Align.CENTER);
            k.stripe(c, cx + 24f * u, top + 62f * u, cx + cardW - 24f * u, top + 68f * u, true);
            if (d == null) {
                k.body(c, "SLOT EMPTY", cx + cardW / 2, top + ch / 2, 30f * u, DIM, Paint.Align.CENTER);
                continue;
            }
            float is = Math.min(170f * u, cardW * 0.38f);
            itemTile(c, d, rar, cx + cardW / 2 - is / 2, top + 84f * u, is, null, u);
            float ty = top + 84f * u + is + 42f * u;
            k.fit(c, d.name, cx + cardW / 2, ty, 38f * u, cardW - 40f * u, TEXT, Paint.Align.CENTER);
            if (rarUpper[rr] == null) rarUpper[rr] = Equipment.RARITY_NAMES[rr].toUpperCase(java.util.Locale.ROOT);
            k.text(c, rarUpper[rr], cx + cardW / 2, ty + 34f * u, 26f * u, rc, Paint.Align.CENTER);
            String[] lines = replace ? eng.equipNewLines : eng.equipOldLines;
            String[] keys = statKeys(d);
            float ly = ty + 84f * u;
            for (int q = 0; q < lines.length; q++) {
                statRow(c, q < keys.length ? keys[q] : "", lines[q], cx + cardW / 2, ly, 28f * u, 0xFFD6CCBE);
                ly += 38f * u;
            }
            if (replace) { // what changes: green is better, red is worse
                ly += 10f * u;
                k.text(c, "CHANGES", cx + cardW / 2, ly, 24f * u, DIM, Paint.Align.CENTER);
                ly += 38f * u;
                for (Equipment.Diff df : eng.equipDiff) {
                    statRow(c, df.key, df.line, cx + cardW / 2, ly, 28f * u, df.good ? Skin.GOOD : Skin.BAD);
                    ly += 38f * u;
                }
            }
            if (s != null) {
                int g = Equipment.salvage(eng.data, rar);
                k.body(c, replace ? "THE OLD ITEM IS SALVAGED FOR GOLD" : cs(90, "THE NEW ITEM IS SALVAGED:  +", g, " GOLD"),
                        cx + cardW / 2, top + ch - 24f * u, 22f * u, DIM, Paint.Align.CENTER);
            }
        }
        k.body(c, "TAP A CARD    |    LEFT / RIGHT + A    |    B = KEEP", w / 2f, h - 30f * u, 24f * u, DIM, Paint.Align.CENTER);
    }

    // ---- menus

    private static final String[] VOLUME = {"OFF", "LOW", "MEDIUM", "HIGH"};
    private static final String[] LIGHTING = {"OFF", "LOW", "FULL"};

    private String[] menuLabels = new String[Engine.MENU_COUNT];
    private int menuKey = -1;

    private void buildMenuLabels() {
        int key = eng.stageIdx | eng.meta.heroIdx << 4 | eng.weaponIdx << 8 | eng.meta.musicVol << 14 | eng.meta.sfxVol << 16 | eng.meta.lighting << 18
                | (eng.stageOverride != null ? 1 << 20 : 0);
        if (key == menuKey) return;
        menuKey = key;
        menuLabels = new String[]{
                "START RUN",
                "STAGE   <  " + eng.stage().name + "  >",
                "HERO   <  " + heroName() + "  >",
                "WEAPON   <  " + eng.data.weapons.get(eng.starters.get(eng.weaponIdx)).name + "  >",
                "POWER-UPS",
                "MUSIC   <  " + VOLUME[eng.meta.musicVol] + "  >",
                "SOUND EFFECTS   <  " + VOLUME[eng.meta.sfxVol] + "  >",
                "LIGHTING   <  " + LIGHTING[eng.meta.lighting] + "  >"};
    }

    private String heroName() {
        String hk = eng.meta.heroKey();
        return hk == null ? "-" : eng.data.heroes.get(hk).name;
    }

    private static String regionFile(String stageKey) {
        return "MINES".equals(stageKey) || "LIBRARY".equals(stageKey) ? "region_mines.webp" : "region_flats.webp";
    }

    private static String stageBlurb(String stageKey) {
        return "MINES".equals(stageKey) || "LIBRARY".equals(stageKey) ? "Tight shafts and lumen veins. Little light."
                : "Open ash plain. Storms at 12:00 and 22:00.";
    }

    /** A triangle arrow of a cycle row; lit when its row has focus. */
    private void arrow(Canvas c, float cx, float cy, float sz, boolean right, int color) {
        path.reset();
        float d = right ? 1f : -1f;
        path.moveTo(cx + d * sz, cy);
        path.lineTo(cx - d * sz * 0.7f, cy - sz);
        path.lineTo(cx - d * sz * 0.7f, cy + sz);
        path.close();
        fill.setColor(color);
        c.drawPath(path, fill);
    }

    private void mainMenu(Canvas c, int w, int h) {
        float u = k.u;
        buildMenuLabels();
        if (compact) {
            compactMenu(c, w, h, u);
            return;
        }
        float m = 30f * u, cw = w - 2 * m;
        String stageKey = eng.stage().key;
        // the painting of the selected stage behind a dark gradient
        Bitmap bg = art.get(regionFile(stageKey), UiArt.G_MENU, 640);
        if (bg != null) art.cover(c, bg, 0, 0, w, h, 0.5f, 0.5f, null);
        fade.setShader(menuFade);
        c.drawRect(0, 0, w, h, fade);
        fade.setShader(null);
        // title
        k.shadowed(c, "ASHFALL", w / 2f, 118f * u, 124f * u, Skin.ORANGE, Paint.Align.CENTER);
        k.tp.setLetterSpacing(0.35f);
        k.shadowed(c, "LUMEN TIDE", w / 2f, 164f * u, 44f * u, Skin.LUMEN, Paint.Align.CENTER);
        k.tp.setLetterSpacing(0f);
        k.stripe(c, m, 180f * u, w - m, 188f * u, false);
        float cell = cw / 3f;
        for (int i = 0; i < 3; i++) {
            float x = m + cell * i + cell / 2;
            k.body(c, i == 0 ? "GOLD" : i == 1 ? "BEST TIME" : "BEST KILLS", x, 218f * u, 22f * u, DIM, Paint.Align.CENTER);
            k.text(c, i == 0 ? cs(100, "", eng.meta.gold, "") : i == 1 ? (eng.meta.bestTimeSec > 0 ? tcs(2, eng.meta.bestTimeSec) : "--:--") : cs(101, "", eng.meta.bestKills, ""),
                    x, 252f * u, 36f * u, i == 0 ? GOLD : TEXT, Paint.Align.CENTER);
        }
        // START RUN
        boolean fs = eng.focus == Engine.MENU_START;
        k.plate(c, m, 272f * u, w - m, 364f * u, fs ? 0x88FF8A2A : 0x55FF8A2A, Skin.ORANGE, fs ? 5f * u : 3f * u);
        k.rivets(c, m, 272f * u, w - m, 364f * u, 12f * u, 3.5f * u);
        k.shadowed(c, "START RUN", w / 2f, 336f * u, 64f * u, 0xFFFFF1DC, Paint.Align.CENTER);
        if (fs) k.focusMarks(c, m, 272f * u, w - m, 364f * u);
        hit(m, 272f * u, w - m, 364f * u, Engine.MENU_START, 0);
        // stage and hero cards
        float cy = 382f * u, ch = 258f * u, half = (cw - 16f * u) / 2f;
        stageCard(c, m, cy, m + half, cy + ch, u, stageKey);
        heroCard(c, m + half + 16f * u, cy, w - m, cy + ch, u);
        // weapon row
        weaponCard(c, m, 656f * u, w - m, 752f * u, u);
        // salvage terminal
        boolean fp = eng.focus == Engine.MENU_SHOP;
        k.plate(c, m, 768f * u, w - m, 846f * u, fp ? 0x40FF8A2A : 0, fp ? Skin.ORANGE : Skin.EDGE, fp ? 4f * u : 2f * u);
        if (fp) k.focusMarks(c, m, 768f * u, w - m, 846f * u);
        k.text(c, "POWER-UPS", m + 28f * u, 820f * u, 44f * u, TEXT, Paint.Align.LEFT);
        k.body(c, "SALVAGE TERMINAL", w - m - 28f * u, 818f * u, 28f * u, Skin.ORANGE, Paint.Align.RIGHT);
        hit(m, 768f * u, w - m, 846f * u, Engine.MENU_SHOP, 0);
        // settings
        settingRow(c, m, w - m, 860f * u, Engine.MENU_MUSIC, "MUSIC", VOLUME[eng.meta.musicVol], eng.meta.musicVol, 3, u);
        settingRow(c, m, w - m, 914f * u, Engine.MENU_SFX, "SOUND EFFECTS", VOLUME[eng.meta.sfxVol], eng.meta.sfxVol, 3, u);
        settingRow(c, m, w - m, 968f * u, Engine.MENU_LIGHT, "LIGHTING", LIGHTING[eng.meta.lighting], eng.meta.lighting, 2, u);
        k.body(c, "A / TAP: SELECT      D-PAD: NAVIGATE", w / 2f, 1058f * u, 22f * u, DIM, Paint.Align.CENTER);
    }

    private void stageCard(Canvas c, float l, float t, float rr, float b, float u, String stageKey) {
        boolean f = eng.focus == Engine.MENU_STAGE;
        Bitmap bm = art.get(regionFile(stageKey), UiArt.G_MENU, 640);
        c.save();
        c.clipRect(l, t, rr, b);
        art.cover(c, bm, l, t, rr, b, 0.5f, 0.5f, null);
        fadeRect(c, cardFadeV, l, t + (b - t) * 0.35f, rr, b, false);
        c.restore();
        cardFrame(c, l, t, rr, b, f, u);
        k.text(c, "STAGE", l + 22f * u, t + 36f * u, 24f * u, Skin.ORANGE, Paint.Align.LEFT);
        k.shadowed(c, up(eng.stage().name), l + 22f * u, b - 92f * u, 58f * u, 0xFFFFF4E6, Paint.Align.LEFT);
        k.shadowed(c, stageBlurb(stageKey), l + 22f * u, b - 58f * u, 24f * u, 0xFFD6CCBE, Paint.Align.LEFT);
        int best = eng.meta.bestTimeOf(stageKey);
        k.shadowed(c, best > 0 ? tcs(3 + (eng.stageIdx & 1), best) : "--:--", rr - 24f * u, b - 22f * u, 34f * u, GOLD, Paint.Align.RIGHT);
        k.shadowed(c, "BEST", rr - 24f * u - 108f * u, b - 22f * u, 24f * u, DIM, Paint.Align.RIGHT);
        cycleArrows(c, l, t, rr, f, u);
        hit(l, t, l + (rr - l) * 0.22f, b, Engine.MENU_STAGE, -1);
        hit(l + (rr - l) * 0.22f, t, rr, b, Engine.MENU_STAGE, 1);
    }

    private void heroCard(Canvas c, float l, float t, float rr, float b, float u) {
        boolean f = eng.focus == Engine.MENU_HERO;
        String hk = eng.meta.heroKey();
        HeroDef d = hk == null ? null : eng.data.heroes.get(hk);
        HeroTexts ht = d == null ? null : heroTexts(d);
        c.save();
        c.clipRect(l, t, rr, b);
        fill.setColor(0xFF0C0908);
        c.drawRect(l, t, rr, b, fill);
        if (ht != null) art.cover(c, art.get(ht.art, UiArt.G_MENU, 640), l, t, rr, b, 0.8f, 0.3f, null);
        fadeRect(c, cardFadeH, l, t, rr, b, true);
        c.restore();
        cardFrame(c, l, t, rr, b, f, u);
        k.text(c, "HERO", l + 22f * u, t + 36f * u, 24f * u, Skin.ORANGE, Paint.Align.LEFT);
        if (d != null) {
            float ps = 150f * u, px = l + 20f * u, py = t + 54f * u;
            Bitmap pt = art.get(ht.portrait, UiArt.G_MENU, 256);
            k.slotWell(c, px, py, ps);
            if (pt != null) art.cover(c, pt, px + 5f * u, py + 5f * u, px + ps - 5f * u, py + ps - 5f * u, 0.5f, 0.5f, null);
            else atlas.drawIcon(c, null, ht.atlasKey, px + ps / 2, py + ps / 2, ps * 0.9f);
            frame(c, "frame_unique", px - 6f * u, py - 6f * u, ps + 12f * u);
            float tx = px + ps + 24f * u;
            k.shadowed(c, up(d.name), tx, t + 92f * u, 54f * u, 0xFFFFF4E6, Paint.Align.LEFT);
            k.shadowed(c, up(d.role), tx, t + 124f * u, 24f * u, Skin.ORANGE, Paint.Align.LEFT);
            k.tp.setShadowLayer(4f * u, 0f, 2f * u, 0xE0000000);
            k.wrap(c, ht.blurb, tx, t + 158f * u, rr - tx - 20f * u, 28f * u, 3, 24f * u, 0xFFE2D8CA);
            k.tp.clearShadowLayer();
            k.shadowed(c, ht.stats, l + 22f * u, b - 18f * u, 24f * u, DIM, Paint.Align.LEFT);
        }
        cycleArrows(c, l, t, rr, f, u);
        hit(l, t, l + (rr - l) * 0.22f, b, Engine.MENU_HERO, -1);
        hit(l + (rr - l) * 0.22f, t, rr, b, Engine.MENU_HERO, 1);
    }

    private void weaponCard(Canvas c, float l, float t, float rr, float b, float u) {
        boolean f = eng.focus == Engine.MENU_WEAPON;
        k.plate(c, l, t, rr, b, f ? 0x40FF8A2A : 0, f ? Skin.ORANGE : Skin.EDGE, f ? 4f * u : 2f * u);
        if (f) k.focusMarks(c, l, t, rr, b);
        WeaponDef wd = eng.data.weapons.get(eng.starters.get(eng.weaponIdx));
        float is = 72f * u;
        weaponTile(c, wd, l + 20f * u, t + (b - t - is) / 2f, is, false, false);
        float tx = l + 20f * u + is + 22f * u;
        k.text(c, "STARTING WEAPON", tx, t + 32f * u, 22f * u, Skin.ORANGE, Paint.Align.LEFT);
        k.text(c, wd.name, tx, t + 72f * u, 40f * u, TEXT, Paint.Align.LEFT);
        k.tp.setTypeface(art.bold);
        k.tp.setTextSize(40f * u);
        float nw = k.tp.measureText(wd.name);
        k.body(c, wd.description, tx + nw + 24f * u, t + 70f * u, 24f * u, DIM, Paint.Align.LEFT);
        arrow(c, rr - 80f * u, (t + b) / 2f, 14f * u, false, f ? Skin.ORANGE : 0xFF6F655A);
        arrow(c, rr - 36f * u, (t + b) / 2f, 14f * u, true, f ? Skin.ORANGE : 0xFF6F655A);
        hit(l, t, l + (rr - l) * 0.22f, b, Engine.MENU_WEAPON, -1);
        hit(l + (rr - l) * 0.22f, t, rr, b, Engine.MENU_WEAPON, 1);
    }

    private void cardFrame(Canvas c, float l, float t, float rr, float b, boolean focus, float u) {
        stroke.setColor(focus ? Skin.ORANGE : Skin.EDGE);
        stroke.setStrokeWidth(focus ? 5f * u : 3f * u);
        r.set(l, t, rr, b);
        c.drawRect(r, stroke);
        k.rivets(c, l, t, rr, b, 10f * u, 3f * u);
        if (focus) k.focusMarks(c, l, t, rr, b);
    }

    private void cycleArrows(Canvas c, float l, float t, float rr, boolean focus, float u) {
        int col = focus ? Skin.ORANGE : 0xFFA89B8C;
        arrow(c, rr - 80f * u, t + 36f * u, 14f * u, false, col);
        arrow(c, rr - 36f * u, t + 36f * u, 14f * u, true, col);
    }

    private void settingRow(Canvas c, float l, float rr, float t, int row, String label, String value, int level, int max, float u) {
        boolean f = eng.focus == row;
        float b = t + 48f * u;
        k.plate(c, l, t, rr, b, f ? 0x40FF8A2A : 0, f ? Skin.ORANGE : Skin.EDGE, f ? 4f * u : 2f * u);
        if (f) k.focusMarks(c, l, t, rr, b);
        k.text(c, label, l + 28f * u, t + 34f * u, 30f * u, TEXT, Paint.Align.LEFT);
        for (int i = 0; i < max; i++) k.pip(c, rr - 330f * u + i * 36f * u, t + 12f * u, 0f, i < level, Skin.ORANGE, 28f * u, 24f * u);
        k.text(c, value, rr - 28f * u, t + 34f * u, 30f * u, f ? Skin.ORANGE : TEXT, Paint.Align.RIGHT);
        arrow(c, rr - 360f * u, t + 24f * u, 11f * u, false, f ? Skin.ORANGE : 0xFF6F655A);
        hit(l, t, l + (rr - l) * 0.3f, b, row, -1);
        hit(l + (rr - l) * 0.3f, t, rr, b, row, 1);
    }

    /** The single-screen overlay: a short column of steel buttons in the lower half. */
    private void compactMenu(Canvas c, int w, int h, float u) {
        float cw = Math.min(w * 0.9f, 900f * u * 1.3f);
        float x = (w - cw) / 2f, y = h * 0.48f, ah = h * 0.5f, gap = 12f * u;
        float bh = Math.min(120f * u, (ah - (Engine.MENU_COUNT - 1) * gap) / Engine.MENU_COUNT);
        for (int i = 0; i < Engine.MENU_COUNT; i++) {
            float by = y + i * (bh + gap);
            k.button(c, x, by, x + cw, by + bh, menuLabels[i], eng.focus == i);
            if (i == Engine.MENU_HERO) {
                String hk = eng.meta.heroKey();
                if (hk != null) atlas.drawIcon(c, null, heroTexts(eng.data.heroes.get(hk)).atlasKey, x + bh * 0.62f, by + bh / 2f, bh * 0.9f);
            }
            if (Engine.isCycleRow(i)) {
                hit(x, by, x + cw * 0.3f, by + bh, i, -1);
                hit(x + cw * 0.3f, by, x + cw, by + bh, i, 1);
            } else {
                hit(x, by, x + cw, by + bh, i, 0);
            }
        }
    }

    // ---- shop: a salvage terminal

    private void shop(Canvas c, int w, int h) {
        float u = k.u;
        float[] cl = column(w, h, 1200f * u);
        float x = cl[0], cw = cl[1];
        // terminal header with faint scan lines
        k.plate(c, x, 16f * u, x + cw, 150f * u, 0x28104030, Skin.EDGE, 3f * u);
        fill.setColor(0x0E39FF88);
        for (float ly = 22f * u; ly < 146f * u; ly += 6f * u) c.drawRect(x + 6f * u, ly, x + cw - 6f * u, ly + 2f * u, fill);
        k.rivets(c, x, 16f * u, x + cw, 150f * u, 11f * u, 3f * u);
        k.text(c, "SALVAGE TERMINAL", x + 30f * u, 84f * u, 62f * u, Skin.ORANGE, Paint.Align.LEFT);
        k.body(c, "CONVERT GOLD INTO PERMANENT UPGRADES", x + 30f * u, 124f * u, 24f * u, DIM, Paint.Align.LEFT);
        k.well(c, x + cw - 320f * u, 34f * u, x + cw - 24f * u, 134f * u, 6f * u);
        k.body(c, "GOLD", x + cw - 40f * u, 62f * u, 22f * u, DIM, Paint.Align.RIGHT);
        k.text(c, cs(92, "", eng.meta.gold, ""), x + cw - 40f * u, 120f * u, 58f * u, GOLD, Paint.Align.RIGHT);
        int n = eng.shopKeys.size();
        int rows = (n + 1) / 2;
        float top = 172f * u, bottom = h - 132f * u, gap = 12f * u;
        float rh = Math.min(120f * u, (bottom - top - (rows - 1) * gap) / rows);
        float cwid = (cw - gap) / 2f;
        for (int i = 0; i < n; i++) {
            String key = eng.shopKeys.get(i);
            PowerUpDef d = eng.data.powerUps.get(key);
            float cx = x + (i % 2) * (cwid + gap), cy = top + (i / 2) * (rh + gap);
            boolean f = eng.focus == i;
            k.plate(c, cx, cy, cx + cwid, cy + rh, f ? 0x44FF8A2A : 0, f ? Skin.ORANGE : Skin.EDGE, f ? 4f * u : 2f * u);
            if (f) k.focusMarks(c, cx, cy, cx + cwid, cy + rh);
            hit(cx, cy, cx + cwid, cy + rh, i, 0);
            int rank = eng.meta.rank(key);
            boolean max = eng.meta.isMaxed(key);
            float is = rh - 28f * u;
            k.slotWell(c, cx + 14f * u, cy + 14f * u, is);
            atlas.drawIcon(c, null, key, cx + 14f * u + is / 2, cy + 14f * u + is / 2, is * 0.8f);
            frame(c, rank > 0 ? "frame_rare" : "frame_common", cx + 14f * u, cy + 14f * u, is);
            float tx = cx + 14f * u + is + 16f * u;
            float ts = Math.min(34f * u, rh * 0.3f);
            k.fit(c, d.name, tx, cy + 10f * u + ts, ts, cx + cwid - tx - 12f * u, TEXT, Paint.Align.LEFT);
            int mr = d.maxRank();
            float pw = Math.min(24f * u, 120f * u / Math.max(1, mr));
            for (int p = 0; p < mr; p++) k.pip(c, tx + p * (pw + 4f * u), cy + rh - 34f * u, pw, p < rank, Skin.ORANGE);
            int price = eng.meta.nextPrice(key);
            k.text(c, max ? "MAX" : cs(104 + Math.min(i, 20), "", price, ""), cx + cwid - 16f * u, cy + rh - 14f * u, ts,
                    max ? GOLD : eng.meta.gold >= price ? Skin.GOOD : Skin.BAD, Paint.Align.RIGHT);
        }
        float by = h - 102f * u;
        k.button(c, x, by, x + cw, by + 80f * u, "BACK", eng.focus == n);
        hit(x, by, x + cw, by + 80f * u, n, 0);
    }

    // ---- pause, chest, result

    private void pauseMenu(Canvas c, int w, int h) {
        float u = k.u;
        float cw = Math.min(w * 0.8f, 760f * u);
        float x = (w - cw) / 2f;
        k.plate(c, x - 30f * u, h * 0.1f, x + cw + 30f * u, h * 0.84f, 0x66000000, Skin.EDGE, 3f * u);
        k.rivets(c, x - 30f * u, h * 0.1f, x + cw + 30f * u, h * 0.84f, 14f * u, 4f * u);
        heading(c, w, "PAUSED", TEXT, null, h * 0.2f, 84f * u, u);
        Sim s = eng.sim;
        if (s != null) { // where the run stands
            float cell = cw / 3f, y = h * 0.2f + 96f * u;
            for (int i = 0; i < 3; i++) {
                float cx = x + cell * i + cell / 2;
                k.body(c, STAT_LABELS[i], cx, y, 22f * u, DIM, Paint.Align.CENTER);
                k.text(c, i == 0 ? tcs(5, (int) s.time) : i == 1 ? cs(105, "", s.level, "") : cs(102, "", s.kills, ""), cx, y + 46f * u, 46f * u, STAT_COLS[i], Paint.Align.CENTER);
            }
        }
        String[] l = {"RESUME", "QUIT TO MENU"};
        for (int i = 0; i < 2; i++) {
            float by = h * 0.46f + i * 140f * u;
            k.button(c, x, by, x + cw, by + 110f * u, l[i], eng.focus == i);
            hit(x, by, x + cw, by + 110f * u, i, 0);
        }
    }

    private void chest(Canvas c, int w, int h) {
        float u = k.u;
        float cw = Math.min(w * 0.85f, 900f * u);
        float x = (w - cw) / 2f;
        heading(c, w, "SUPPLY CACHE", GOLD, null, h * 0.16f, 80f * u, u);
        String[] lines = eng.chestLines;
        // a 5-item chest has up to 7 lines: squeeze the spacing so they stay above the OK button
        float top = h * 0.16f + 56f * u, bot = h - 210f * u;
        float step = Math.min(66f * u, (bot - top) / Math.max(1, lines.length));
        for (int i = 0; i < lines.length; i++) {
            String ln = lines[i];
            boolean evo = ln.startsWith("EVO") || ln.contains("->") && i > 0 && lines[i - 1].startsWith("EVO");
            boolean goldLine = ln.startsWith("+");
            float y = top + i * step;
            k.plate(c, x, y, x + cw, y + step - 8f * u, evo ? 0x40FF5AD8 : goldLine ? 0x30FFD84A : 0, evo ? 0xFFFF9AF0 : goldLine ? GOLD : Skin.EDGE, 2f * u);
            k.fit(c, ln, w / 2f, y + (step - 8f * u) * 0.68f, Math.min(42f * u, step * 0.62f), cw - 40f * u,
                    evo ? 0xFFFF9AF0 : goldLine ? GOLD : TEXT, Paint.Align.CENTER);
        }
        float by = h - 190f * u;
        k.button(c, x, by, x + cw, by + 110f * u, "OK", true);
        hit(x, by, x + cw, by + 110f * u, 0, 0);
    }

    private void result(Canvas c, int w, int h) {
        float u = k.u;
        float cw = Math.min(w * 0.94f, 1100f * u);
        float x = (w - cw) / 2f;
        Sim s = eng.sim;
        heading(c, w, eng.resultWin ? "VICTORY" : "YOU DIED", eng.resultWin ? Skin.LUMEN : Skin.DANGER, null, 112f * u, 100f * u, u);
        // the hero and the numbers of the run
        float py = 168f * u, pb = 470f * u;
        k.plate(c, x, py, x + cw, pb);
        k.rivets(c, x, py, x + cw, pb, 11f * u, 3f * u);
        float ps = 190f * u;
        if (s != null && s.hero != null) {
            HeroTexts ht = heroTexts(s.hero);
            float hx = x + 28f * u, hy = py + 30f * u;
            k.slotWell(c, hx, hy, ps);
            Bitmap pt = art.get(ht.portrait, UiArt.G_MENU, 256);
            if (pt != null) art.cover(c, pt, hx + 5f * u, hy + 5f * u, hx + ps - 5f * u, hy + ps - 5f * u, 0.5f, 0.5f, null);
            else atlas.drawIcon(c, null, ht.atlasKey, hx + ps / 2, hy + ps / 2, ps * 0.9f);
            frame(c, "frame_unique", hx - 8f * u, hy - 8f * u, ps + 16f * u);
            k.text(c, up(s.hero.name), hx + ps / 2, hy + ps + 40f * u, 36f * u, TEXT, Paint.Align.CENTER);
        }
        float tx = x + 28f * u + ps + 60f * u, vx = x + cw - 36f * u;
        String[] lab = {"TIME", "KILLS", "LEVEL", "GOLD EARNED", "BEST"};
        for (int i = 0; i < 5; i++) {
            float y = py + 62f * u + i * 44f * u;
            k.body(c, lab[i], tx, y, 28f * u, DIM, Paint.Align.LEFT);
            String v;
            int col = TEXT;
            switch (i) {
                case 0: v = tcs(6, eng.resultTime); break;
                case 1: v = cs(103, "", eng.resultKills, ""); break;
                case 2: v = cs(88, "", eng.resultLevel, ""); break;
                case 3: v = cs(89, "", eng.resultGold, ""); col = GOLD; break;
                default:
                    v = eng.resultNewBest ? "NEW BEST TIME" : eng.meta.bestTimeSec > 0 ? tcs(7, eng.meta.bestTimeSec) : "--:--";
                    col = eng.resultNewBest ? Skin.ORANGE : TEXT;
            }
            k.text(c, v, vx, y, 40f * u, col, Paint.Align.RIGHT);
            if (i < 4) {
                fill.setColor(Skin.EDGE_LO);
                c.drawRect(tx, y + 10f * u, vx, y + 12f * u, fill);
            }
        }
        if (eng.resultFirst) { // The First was killed: the gold counts twice
            float nt = py + 62f * u + 4 * 44f * u + 24f * u;
            k.plate(c, tx, nt, vx, nt + 38f * u, 0x3039FF88, Skin.LUMEN, 2f * u);
            k.text(c, "THE FIRST IS DEAD  -  GOLD x2", (tx + vx) / 2f, nt + 28f * u, 26f * u, Skin.LUMEN, Paint.Align.CENTER);
        }
        // final equipment and the branches picked
        float ly = 496f * u, lb = 760f * u;
        k.plate(c, x, ly, x + cw, lb);
        if (s != null) {
            k.text(c, "FINAL EQUIPMENT", x + 28f * u, ly + 40f * u, 24f * u, DIM, Paint.Align.LEFT);
            float es = 84f * u, eg = 10f * u;
            for (int i = 0; i < EquipDef.SLOTS; i++) itemTile(c, s.equip.def[i], s.equip.rar[i], x + 28f * u + i * (es + eg), ly + 52f * u, es, SLOT_LETTER[i], u);
            if (s.main != null) {
                float bx = x + 28f * u + 6 * (es + eg) + 40f * u;
                k.text(c, "BRANCHES PICKED", bx, ly + 40f * u, 24f * u, DIM, Paint.Align.LEFT);
                int nb = s.main.def.branches.size();
                float bs = 64f * u, bw = (x + cw - 28f * u - bx) / Math.max(1, nb);
                iconKey(c, s.main.def.key, bx, ly + 52f * u, bs, true, true);
                for (int b = 0; b < nb; b++) {
                    float iy = ly + 52f * u;
                    int t = s.main.tier[b];
                    float cx = bx + bs + 14f * u + b * ((x + cw - 28f * u - bx - bs - 14f * u) / nb);
                    iconKey(c, s.main.def.branches.get(b).id, cx, iy, bs * 0.8f, t > 0, false);
                    for (int p = 0; p < 3; p++) k.pip(c, cx + p * 14f * u, iy + bs * 0.8f + 8f * u, 11f * u, p < t, GOLD);
                }
            }
        }
        float by = h - 190f * u;
        float bw2 = Math.min(w * 0.85f, 900f * u);
        k.button(c, (w - bw2) / 2f, by, (w + bw2) / 2f, by + 110f * u, "CONTINUE", true);
        hit((w - bw2) / 2f, by, (w + bw2) / 2f, by + 110f * u, 0, 0);
    }
}
