package se.felixarvid.thorsurvivors.ui;

import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.view.MotionEvent;

import se.felixarvid.thorsurvivors.data.PowerUpDef;
import se.felixarvid.thorsurvivors.data.WeaponDef;
import se.felixarvid.thorsurvivors.game.Describe;
import se.felixarvid.thorsurvivors.game.Engine;
import se.felixarvid.thorsurvivors.game.Entities;
import se.felixarvid.thorsurvivors.game.Input;
import se.felixarvid.thorsurvivors.game.Inventory;
import se.felixarvid.thorsurvivors.game.Offer;
import se.felixarvid.thorsurvivors.game.Sim;
import se.felixarvid.thorsurvivors.render.SpriteAtlas;
import se.felixarvid.thorsurvivors.render.WorldRenderer;

import java.util.List;

/**
 * The control panel: HUD, level-up cards, menus, shop, results. One class used by the bottom-screen window
 * (full panel) and by the single-screen overlay ({@code compact}: HUD strip + centred cards/menus).
 * Reads the shared {@link Engine}; talks back only through {@link Input} commands.
 */
public final class PanelRenderer {
    private static final int BG = 0xFF0E1119, CARD = 0xFF1C2335, CARD_FOCUS = 0xFF2E3D66, GOLD = 0xFFFFD84A,
            DIM = 0xFF8D97B5, TEXT = 0xFFEDEFF7;
    private static final int MAX_HITS = 40;

    private final boolean compact;
    private final Engine eng = Engine.get();
    private final SpriteAtlas atlas = SpriteAtlas.get();
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint tp = new Paint(Paint.ANTI_ALIAS_FLAG);
    /** Pixel art: whole-pixel blits, no filtering. */
    private final Paint bmp = new Paint();
    private final RectF r = new RectF();
    private final Path path = new Path();
    private final float[] ptsA = new float[Sim.MAX_ENEMIES * 2];
    private final float[] ptsB = new float[Sim.MAX_PICK * 2];

    // hit regions rebuilt every draw
    private final float[] hl = new float[MAX_HITS], ht = new float[MAX_HITS], hr = new float[MAX_HITS], hb = new float[MAX_HITS];
    private final int[] hIdx = new int[MAX_HITS], hSub = new int[MAX_HITS];
    private int hitN, hitPhase;

    // joystick
    private int joyPointer = -1;
    private float joyOx, joyOy, joyCx, joyCy, joyR = 100;
    private float zl, zt, zr, zb; // joystick capture zone (panel mode)
    private int lastPhase = -1;
    private int width, height;

    public PanelRenderer(boolean compact) {
        this.compact = compact;
        bmp.setFilterBitmap(false);
        bmp.setAntiAlias(false);
        bmp.setDither(false);
        stroke.setStyle(Paint.Style.STROKE);
        tp.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
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
                for (int i = 0; i < hitN; i++) {
                    if (x >= hl[i] && x <= hr[i] && y >= ht[i] && y <= hb[i]) {
                        in.post(Input.CMD_TAP, hitPhase, hIdx[i], hSub[i]);
                        return true;
                    }
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
            if (!compact) c.drawColor(BG);
            return;
        }
        int ph = eng.phase;
        hitPhase = ph;
        if (ph != lastPhase) {
            if (joyPointer >= 0 || lastPhase == Engine.PH_PLAYING) {
                joyPointer = -1;
                eng.input.touchX = eng.input.touchY = 0;
            }
            lastPhase = ph;
        }
        if (!compact) c.drawColor(BG);
        float u = h / 1080f;
        joyR = 110f * u;
        switch (ph) {
            case Engine.PH_PLAYING:
                if (compact) hudStrip(c, w, h);
                else hudPanel(c, w, h);
                drawJoystick(c);
                break;
            case Engine.PH_LEVELUP:
                if (compact) dimOverlay(c, w, h, 0x88000000);
                levelUp(c, w, h);
                break;
            case Engine.PH_PAUSED:
                if (compact) dimOverlay(c, w, h, 0x66000000);
                pauseMenu(c, w, h);
                break;
            case Engine.PH_CHEST:
                if (compact) dimOverlay(c, w, h, 0x66000000);
                chest(c, w, h);
                break;
            case Engine.PH_RESULT:
                if (compact) dimOverlay(c, w, h, 0x77000000);
                result(c, w, h);
                break;
            case Engine.PH_SHOP:
                if (compact) dimOverlay(c, w, h, 0xCC000000);
                shop(c, w, h);
                break;
            default:
                if (compact) dimOverlay(c, w, h, 0x33000000);
                mainMenu(c, w, h);
        }
        if (eng.toastTimer > 0 && (ph == Engine.PH_SHOP || ph == Engine.PH_MENU)) {
            tp.setTextAlign(Paint.Align.CENTER);
            tp.setTextSize(h * 0.035f);
            fill.setColor(0xDD000000);
            r.set(w / 2f - w * 0.3f, h * 0.9f, w / 2f + w * 0.3f, h * 0.9f + h * 0.06f);
            c.drawRoundRect(r, 12, 12, fill);
            tp.setColor(GOLD);
            c.drawText(eng.toast, w / 2f, h * 0.9f + h * 0.043f, tp);
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

    // ---- primitives

    private void text(Canvas c, String s, float x, float y, float size, int color, Paint.Align a) {
        tp.setTextSize(size);
        tp.setColor(color);
        tp.setTextAlign(a);
        c.drawText(s, x, y, tp);
    }

    private void button(Canvas c, float l, float t, float rr, float b, String label, boolean focus) {
        r.set(l, t, rr, b);
        fill.setColor(focus ? CARD_FOCUS : CARD);
        c.drawRoundRect(r, 18, 18, fill);
        stroke.setColor(focus ? GOLD : 0xFF3A4566);
        stroke.setStrokeWidth(focus ? 4f : 2f);
        c.drawRoundRect(r, 18, 18, stroke);
        float size = Math.min((b - t) * 0.42f, 56f);
        text(c, label, (l + rr) / 2f, (t + b) / 2f + size * 0.35f, size, TEXT, Paint.Align.CENTER);
    }

    private void bar(Canvas c, float l, float t, float rr, float b, float frac, int color, int back) {
        r.set(l, t, rr, b);
        fill.setColor(back);
        c.drawRoundRect(r, (b - t) / 2, (b - t) / 2, fill);
        frac = Math.max(0f, Math.min(1f, frac));
        if (frac > 0) {
            r.set(l, t, l + (rr - l) * frac, b);
            fill.setColor(color);
            c.drawRoundRect(r, (b - t) / 2, (b - t) / 2, fill);
        }
    }

    private int wrap(Canvas c, String s, float x, float y, float maxW, float lineH, int maxLines, float size, int color) {
        tp.setTextSize(size);
        tp.setColor(color);
        tp.setTextAlign(Paint.Align.LEFT);
        int lines = 0;
        int pos = 0;
        while (pos < s.length() && lines < maxLines) {
            int n = tp.breakText(s, pos, s.length(), true, maxW, null);
            if (n <= 0) break;
            int end = pos + n;
            if (end < s.length()) {
                int sp = s.lastIndexOf(' ', end - 1);
                if (sp > pos) end = sp;
            }
            String line = s.substring(pos, end);
            if (lines == maxLines - 1 && end < s.length()) line = line + "...";
            c.drawText(line, x, y + lines * lineH, tp);
            pos = end;
            while (pos < s.length() && s.charAt(pos) == ' ') pos++;
            lines++;
        }
        return lines;
    }

    private static String hex(int rgb) {
        return Integer.toHexString(rgb);
    }

    // ---- icons

    private static String baseKey(String k) {
        switch (k) {
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
            default: return k;
        }
    }

    private void icon(Canvas c, WeaponDef d, float x, float y, float s, boolean evo) {
        String k = baseKey(d.key);
        if (atlas.has("icon." + k)) {
            // dark tile + the Ashfall icon scaled to fit; evolutions reuse the base icon with a gold border
            r.set(x, y, x + s, y + s);
            fill.setColor(d.powerUp ? 0xFF2A2F45 : 0xFF1D2438);
            c.drawRoundRect(r, s * 0.18f, s * 0.18f, fill);
            stroke.setColor(evo ? GOLD : 0xFF4A5678);
            stroke.setStrokeWidth(evo ? 5f : 2f);
            c.drawRoundRect(r, s * 0.18f, s * 0.18f, stroke);
            atlas.drawIcon(c, null, k, x + s / 2, y + s / 2, s * 0.86f);
            return;
        }
        int hue = Math.abs(k.hashCode()) % 360;
        int col = d.powerUp ? hsv(hue, 0.5f, 0.55f) : 0xFF26304A;
        r.set(x, y, x + s, y + s);
        fill.setColor(col);
        c.drawRoundRect(r, s * 0.18f, s * 0.18f, fill);
        stroke.setColor(evo ? GOLD : 0xFF4A5678);
        stroke.setStrokeWidth(evo ? 4f : 2f);
        c.drawRoundRect(r, s * 0.18f, s * 0.18f, stroke);
        float cx = x + s / 2, cy = y + s / 2, q = s * 0.3f;
        if (d.powerUp) {
            text(c, d.name.substring(0, 1), cx, cy + s * 0.18f, s * 0.55f, TEXT, Paint.Align.CENTER);
            return;
        }
        int a = evo ? 0xFFFFE070 : 0xFFE8EEF8;
        fill.setColor(a);
        stroke.setColor(a);
        stroke.setStrokeWidth(Math.max(3f, s * 0.08f));
        switch (k) {
            case "WHIP":
                r.set(cx - q * 1.3f, cy - q, cx + q * 1.3f, cy + q);
                c.drawArc(r, 20, 140, false, stroke);
                break;
            case "MAGIC_MISSILE":
                fill.setColor(0xFF70E0FF);
                c.drawCircle(cx, cy, q * 0.8f, fill);
                fill.setColor(a);
                c.drawCircle(cx, cy, q * 0.35f, fill);
                break;
            case "KNIFE":
                path.reset();
                path.moveTo(cx + q * 1.2f, cy - q * 1.2f); path.lineTo(cx - q * 0.8f, cy + q * 0.4f); path.lineTo(cx - q * 0.2f, cy + q * 0.9f); path.close();
                c.drawPath(path, fill);
                break;
            case "AXE":
                c.drawLine(cx - q * 0.6f, cy + q * 1.1f, cx + q * 0.4f, cy - q * 1.1f, stroke);
                c.drawRect(cx - q * 0.2f, cy - q * 1.2f, cx + q * 1.2f, cy - q * 0.2f, fill);
                break;
            case "CROSS":
                c.drawLine(cx, cy - q * 1.2f, cx, cy + q * 1.2f, stroke);
                c.drawLine(cx - q * 0.9f, cy - q * 0.3f, cx + q * 0.9f, cy - q * 0.3f, stroke);
                break;
            case "HOLYBOOK":
                fill.setColor(0xFF6A8CFF);
                c.drawRect(cx - q, cy - q * 1.1f, cx + q, cy + q * 1.1f, fill);
                fill.setColor(a);
                c.drawRect(cx - q * 0.7f, cy - q * 0.8f, cx + q * 0.8f, cy + q * 0.8f, fill);
                break;
            case "FIREBALL":
                fill.setColor(0xFFFF8A20);
                c.drawCircle(cx, cy, q, fill);
                fill.setColor(0xFFFFE070);
                c.drawCircle(cx, cy, q * 0.5f, fill);
                break;
            case "GARLIC":
                stroke.setColor(0xFFF090D0);
                c.drawCircle(cx, cy, q * 1.1f, stroke);
                fill.setColor(a);
                c.drawCircle(cx, cy, q * 0.4f, fill);
                break;
            case "HOLYWATER":
                fill.setColor(0xFF50B0FF);
                c.drawCircle(cx, cy + q * 0.2f, q, fill);
                path.reset();
                path.moveTo(cx, cy - q * 1.3f); path.lineTo(cx + q * 0.7f, cy); path.lineTo(cx - q * 0.7f, cy); path.close();
                c.drawPath(path, fill);
                break;
            default: // lightning
                stroke.setColor(0xFFFFE860);
                path.reset();
                path.moveTo(cx + q * 0.4f, cy - q * 1.3f); path.lineTo(cx - q * 0.5f, cy + q * 0.1f); path.lineTo(cx + q * 0.3f, cy + q * 0.1f); path.lineTo(cx - q * 0.4f, cy + q * 1.3f);
                stroke.setStyle(Paint.Style.STROKE);
                c.drawPath(path, stroke);
        }
    }

    private static int hsv(int h, float s, float v) {
        float cc = v * s, x = cc * (1 - Math.abs((h / 60f) % 2 - 1)), m = v - cc, rr, g, b;
        if (h < 60) { rr = cc; g = x; b = 0; } else if (h < 120) { rr = x; g = cc; b = 0; }
        else if (h < 180) { rr = 0; g = cc; b = x; } else if (h < 240) { rr = 0; g = x; b = cc; }
        else if (h < 300) { rr = x; g = 0; b = cc; } else { rr = cc; g = 0; b = x; }
        return 0xFF000000 | ((int) ((rr + m) * 255) << 16) | ((int) ((g + m) * 255) << 8) | (int) ((b + m) * 255);
    }

    // ---- HUD

    private final StringBuilder sb = new StringBuilder(24);

    private int timeSec = -1;
    private String timeText = "";

    private String timeCache(int sec) {
        if (sec != timeSec) {
            timeSec = sec;
            timeText = WorldRenderer.fmtTime(sec);
        }
        return timeText;
    }

    private String timeStr(int sec) {
        return WorldRenderer.fmtTime(sec);
    }

    // Text is redrawn 60 times a second but changes rarely: keep the built strings until their numbers change.
    private final String[] csStr = new String[64];
    private final int[] csA = new int[64], csB = new int[64];

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

    private static final String[] STAT_LABELS = {"TIME", "LEVEL", "KILLS", "GOLD"};
    private static final int[] STAT_COLS = {TEXT, GOLD, 0xFFFF7070, 0xFFFFD23C};

    private void hudPanel(Canvas c, int w, int h) {
        Sim s = eng.sim;
        if (s == null) return;
        float u = h / 1080f, m = 30f * u;
        // stat row
        float cw = (w - 2 * m) / 4f;
        int sec = (int) s.time;
        for (int i = 0; i < 4; i++) {
            float x = m + cw * i + cw / 2;
            String val = i == 0 ? timeCache(sec) : i == 1 ? cs(1, "", s.level, "") : i == 2 ? cs(2, "", s.kills, "")
                    : cs(3, "", s.gold, "");
            text(c, STAT_LABELS[i], x, 40 * u, 24 * u, DIM, Paint.Align.CENTER);
            text(c, val, x, 100 * u, 58 * u, STAT_COLS[i], Paint.Align.CENTER);
        }
        // hp / xp
        bar(c, m, 125 * u, w - m, 170 * u, s.hp / s.maxHp, 0xFFD83A3A, 0xFF3A1414);
        text(c, cs(4, "", (int) Math.ceil(s.hp), " / ", (int) s.maxHp, ""), w / 2f, 160 * u, 30 * u, TEXT, Paint.Align.CENTER);
        bar(c, m, 182 * u, w - m, 212 * u, s.xp / s.xpNeed, 0xFF3AA0F0, 0xFF12263A);
        text(c, cs(5, "XP ", (int) s.xp, " / ", s.xpNeed, ""), w / 2f, 206 * u, 22 * u, TEXT, Paint.Align.CENTER);
        // slots
        float slot = Math.min(150 * u, (w - 2 * m - 5 * 12 * u) / 6f);
        text(c, "WEAPONS", m, 248 * u, 24 * u, DIM, Paint.Align.LEFT);
        slotRow(c, s, true, m, 258 * u, slot, 12 * u, u);
        text(c, "PASSIVES", m, 258 * u + slot + 62 * u, 24 * u, DIM, Paint.Align.LEFT);
        slotRow(c, s, false, m, 258 * u + slot + 72 * u, slot, 12 * u, u);
        // minimap bottom-left, pause + joystick bottom-right
        float top = 258 * u + slot * 2 + 150 * u;
        float side = Math.min(h - top - m, (w - 3 * m) * 0.5f);
        minimap(c, s, m, h - m - side, side);
        float rx = m * 2 + side;
        button(c, rx, h - m - side, w - m, h - m - side + 90 * u, "PAUSE", false);
        hit(rx, h - m - side, w - m, h - m - side + 90 * u, 0, 0);
        zl = rx; zt = h - m - side + 110 * u; zr = w - m; zb = h - m;
        if (joyPointer < 0) {
            r.set(zl, zt, zr, zb);
            fill.setColor(0xFF141A28);
            c.drawRoundRect(r, 24, 24, fill);
            stroke.setColor(0xFF2A3350);
            stroke.setStrokeWidth(2f);
            c.drawRoundRect(r, 24, 24, stroke);
            float cx = (zl + zr) / 2, cy = (zt + zb) / 2;
            stroke.setColor(0xFF3A4566);
            stroke.setStrokeWidth(4f);
            c.drawCircle(cx, cy, joyR, stroke);
            fill.setColor(0xFF2A3350);
            c.drawCircle(cx, cy, joyR * 0.4f, fill);
            text(c, eng.input.gamepadSeen ? "gamepad active" : "drag to move", cx, zb - 14 * u, 24 * u, DIM, Paint.Align.CENTER);
        }
    }

    private void slotRow(Canvas c, Sim s, boolean weapons, float x, float y, float slot, float gap, float u) {
        Inventory inv = s.inv;
        int n = weapons ? inv.weaponCount : inv.passiveCount;
        for (int i = 0; i < 6; i++) {
            float sx = x + i * (slot + gap);
            if (i < n) {
                Inventory.Slot sl = weapons ? inv.weapons[i] : inv.passives[i];
                icon(c, sl.def, sx, y, slot, sl.def.evolution);
                boolean max = sl.level >= sl.def.maxLevel();
                text(c, sl.def.evolution ? "EVO" : max ? "MAX" : cs((weapons ? 8 : 20) + i, "Lv ", sl.level, ""), sx + slot / 2, y + slot + 30 * u, 26 * u,
                        max || sl.def.evolution ? GOLD : TEXT, Paint.Align.CENTER);
            } else {
                r.set(sx, y, sx + slot, y + slot);
                fill.setColor(0xFF141A28);
                c.drawRoundRect(r, slot * 0.18f, slot * 0.18f, fill);
                stroke.setColor(0xFF232B42);
                stroke.setStrokeWidth(2f);
                c.drawRoundRect(r, slot * 0.18f, slot * 0.18f, stroke);
            }
        }
    }

    private void minimap(Canvas c, Sim s, float x, float y, float side) {
        r.set(x, y, x + side, y + side);
        fill.setColor(0xFF0A0D14);
        c.drawRoundRect(r, 16, 16, fill);
        stroke.setColor(0xFF2A3350);
        stroke.setStrokeWidth(2f);
        c.drawRoundRect(r, 16, 16, stroke);
        float range = 1000f, k = side / (2 * range);
        float cx = x + side / 2, cy = y + side / 2;
        c.save();
        c.clipRect(x + 4, y + 4, x + side - 4, y + side - 4);
        // view rectangle
        stroke.setColor(0xFF2F3A58);
        c.drawRect(cx - 640 * k, cy - 360 * k, cx + 640 * k, cy + 360 * k, stroke);
        int n = 0;
        int pn = Math.min(s.pickN, Sim.MAX_PICK);
        for (int i = 0; i < pn; i++) {
            Entities.Pickup p = s.picks[i];
            if (p.kind != Entities.K_GEM || p.red) continue;
            float dx = (p.x - s.px) * k, dy = (p.y - s.py) * k;
            if (Math.abs(dx) > side / 2 || Math.abs(dy) > side / 2) continue;
            ptsB[n++] = cx + dx;
            ptsB[n++] = cy + dy;
        }
        tp.setStrokeWidth(4f);
        tp.setStrokeCap(Paint.Cap.ROUND);
        tp.setColor(0xFF4FA8FF);
        c.drawPoints(ptsB, 0, n, tp);
        n = 0;
        int en = Math.min(s.enemyN, Sim.MAX_ENEMIES);
        for (int i = 0; i < en; i++) {
            Entities.Enemy e = s.enemies[i];
            float dx = (e.x - s.px) * k, dy = (e.y - s.py) * k;
            if (Math.abs(dx) > side / 2 || Math.abs(dy) > side / 2) continue;
            ptsA[n++] = cx + dx;
            ptsA[n++] = cy + dy;
        }
        tp.setStrokeWidth(5f);
        tp.setColor(0xFFE04848);
        c.drawPoints(ptsA, 0, n, tp);
        tp.setStrokeWidth(0f);
        for (int i = 0; i < en; i++) {
            Entities.Enemy e = s.enemies[i];
            if (!e.boss) continue;
            fill.setColor(0xFFFF9020);
            c.drawCircle(cx + (e.x - s.px) * k, cy + (e.y - s.py) * k, 9f, fill);
        }
        for (int i = 0; i < pn; i++) {
            Entities.Pickup p = s.picks[i];
            if (p.red) { // the condensed gem pile: a bigger crimson dot
                fill.setColor(0xFFD01838);
                c.drawCircle(cx + (p.x - s.px) * k, cy + (p.y - s.py) * k, 7f, fill);
                continue;
            }
            if (p.kind == Entities.K_GEM) continue;
            float dx = (p.x - s.px) * k, dy = (p.y - s.py) * k;
            float lim = side / 2 - 8;
            if (p.kind == Entities.K_CHEST) { // chests are clamped to the edge so they can be found
                dx = Math.max(-lim, Math.min(lim, dx));
                dy = Math.max(-lim, Math.min(lim, dy));
                fill.setColor(GOLD);
                c.drawRect(cx + dx - 7, cy + dy - 7, cx + dx + 7, cy + dy + 7, fill);
            } else if (Math.abs(dx) < lim && Math.abs(dy) < lim) {
                fill.setColor(p.kind <= Entities.K_COINBAG ? 0xFFFFD23C : 0xFF50E070);
                c.drawCircle(cx + dx, cy + dy, 4f, fill);
            }
        }
        fill.setColor(0xFFFFFFFF);
        c.drawCircle(cx, cy, 7f, fill);
        c.restore();
    }

    private void hudStrip(Canvas c, int w, int h) {
        Sim s = eng.sim;
        if (s == null) return;
        float u = h / 1080f;
        float sh = 92 * u;
        fill.setColor(0xB0080B12);
        c.drawRect(0, 0, w, sh, fill);
        bar(c, 0, 0, w, 10 * u, s.xp / s.xpNeed, 0xFF3AA0F0, 0xFF12263A);
        float m = 14 * u;
        button(c, m, 20 * u, m + 120 * u, sh - 10 * u, "II", false);
        hit(m, 20 * u, m + 120 * u, sh - 10 * u, 0, 0);
        float bx = m * 2 + 120 * u;
        bar(c, bx, 26 * u, bx + 360 * u, 52 * u, s.hp / s.maxHp, 0xFFD83A3A, 0xFF3A1414);
        text(c, (int) Math.ceil(s.hp) + "/" + (int) s.maxHp, bx + 180 * u, 48 * u, 22 * u, TEXT, Paint.Align.CENTER);
        // mini slot icons
        float is = 28 * u, ix = bx;
        for (int i = 0; i < s.inv.weaponCount; i++, ix += is + 3 * u) icon(c, s.inv.weapons[i].def, ix, 58 * u, is, s.inv.weapons[i].def.evolution);
        ix += 10 * u;
        for (int i = 0; i < s.inv.passiveCount; i++, ix += is + 3 * u) icon(c, s.inv.passives[i].def, ix, 58 * u, is, false);
        float rx = w - m;
        text(c, "G " + s.gold, rx, 40 * u, 32 * u, 0xFFFFD23C, Paint.Align.RIGHT);
        text(c, "K " + s.kills, rx - 190 * u, 40 * u, 32 * u, 0xFFFF7070, Paint.Align.RIGHT);
        text(c, "LV " + s.level, rx - 380 * u, 40 * u, 32 * u, GOLD, Paint.Align.RIGHT);
        text(c, timeStr((int) s.time), w / 2f + 200 * u, 50 * u, 46 * u, TEXT, Paint.Align.CENTER);
    }

    private void drawJoystick(Canvas c) {
        if (joyPointer < 0) return;
        stroke.setColor(0x66FFFFFF);
        stroke.setStrokeWidth(4f);
        c.drawCircle(joyOx, joyOy, joyR, stroke);
        fill.setColor(0x55FFFFFF);
        float dx = joyCx - joyOx, dy = joyCy - joyOy, m = (float) Math.sqrt(dx * dx + dy * dy);
        if (m > joyR) { dx = dx / m * joyR; dy = dy / m * joyR; }
        c.drawCircle(joyOx + dx, joyOy + dy, joyR * 0.4f, fill);
    }

    // ---- level-up cards

    private float[] column(int w, int h, float maxW) {
        float cw = compact ? Math.min(w * 0.7f, maxW) : w - 60f * (h / 1080f);
        float cx = (w - cw) / 2f;
        return new float[]{cx, cw};
    }

    private void levelUp(Canvas c, int w, int h) {
        Sim s = eng.sim;
        List<Offer> offers = eng.offers;
        float u = h / 1080f;
        float[] col = column(w, h, 1000f * u);
        float x = col[0], cw = col[1];
        text(c, "LEVEL UP!", w / 2f, 80 * u, 72 * u, GOLD, Paint.Align.CENTER);
        if (s != null) text(c, "Level " + s.level + "  -  choose an upgrade", w / 2f, 125 * u, 30 * u, DIM, Paint.Align.CENTER);
        int n = offers.size();
        float top = 150 * u, avail = h - top - 90 * u, gap = 16 * u;
        float ch = Math.min(250 * u, (avail - (n - 1) * gap) / Math.max(1, n));
        for (int i = 0; i < n; i++) {
            Offer o = offers.get(i);
            float y = top + i * (ch + gap);
            boolean f = i == eng.focus;
            r.set(x, y, x + cw, y + ch);
            fill.setColor(f ? CARD_FOCUS : CARD);
            c.drawRoundRect(r, 20, 20, fill);
            stroke.setColor(f ? GOLD : 0xFF3A4566);
            stroke.setStrokeWidth(f ? 5f : 2f);
            c.drawRoundRect(r, 20, 20, stroke);
            hit(x, y, x + cw, y + ch, i, 0);
            float is = ch - 36 * u;
            if (o.def != null) icon(c, o.def, x + 18 * u, y + 18 * u, is, false);
            else {
                fill.setColor(o.kind == Offer.HEAL ? 0xFFC8742C : 0xFFFFD23C);
                c.drawCircle(x + 18 * u + is / 2, y + ch / 2, is * 0.35f, fill);
            }
            float tx = x + 18 * u + is + 22 * u;
            float titleSize = Math.min(44 * u, ch * 0.22f);
            text(c, o.title(), tx, y + 20 * u + titleSize, titleSize, TEXT, Paint.Align.LEFT);
            String tag;
            int tagCol = GOLD;
            switch (o.kind) {
                case Offer.NEW_WEAPON: case Offer.NEW_PASSIVE: tag = "NEW"; tagCol = 0xFF70E080; break;
                case Offer.HEAL: case Offer.GOLD: tag = ""; break;
                default: tag = o.newLevel >= o.def.maxLevel() ? "Lv " + o.newLevel + "  MAX" : "Lv " + o.newLevel;
            }
            text(c, tag, x + cw - 24 * u, y + 20 * u + titleSize, titleSize * 0.8f, tagCol, Paint.Align.RIGHT);
            wrap(c, Describe.offer(o), tx, y + 28 * u + titleSize * 2f, x + cw - tx - 24 * u, titleSize * 0.85f, 3,
                    Math.min(30 * u, ch * 0.16f), 0xFFB8C0DA);
        }
        text(c, "Tap a card   |   d-pad / stick + A", w / 2f, h - 30 * u, 26 * u, DIM, Paint.Align.CENTER);
    }

    // ---- menus

    private static final String[] VOLUME = {"OFF", "LOW", "MEDIUM", "HIGH"};
    private static final String[] LIGHTING = {"OFF", "LOW", "FULL"};

    private void mainMenu(Canvas c, int w, int h) {
        float u = h / 1080f;
        float top, ah;
        float cw = Math.min(w * 0.9f, 900 * u * 1.3f);
        if (compact) {
            top = h * 0.48f;
            ah = h * 0.5f;
        } else {
            top = 0;
            ah = h;
        }
        float x = (w - cw) / 2f;
        float y = top;
        if (!compact) {
            text(c, "ASHFALL: LUMEN TIDE", w / 2f, 150 * u, 74 * u, GOLD, Paint.Align.CENTER);
            text(c, "Gold " + eng.meta.gold + "    Best " + timeStr(eng.meta.bestTimeSec) + "    Kills " + eng.meta.bestKills,
                    w / 2f, 215 * u, 34 * u, DIM, Paint.Align.CENTER);
            y = 290 * u;
            ah = h - y - 70 * u; // leaves room for the hint line
        }
        float gap = 16 * u;
        float bh = Math.min(120 * u, (ah - (Engine.MENU_COUNT - 1) * gap) / Engine.MENU_COUNT);
        String[] labels = {
                "START RUN",
                "STAGE   <  " + eng.stage().name + "  >",
                "WEAPON   <  " + eng.data.weapons.get(eng.starters.get(eng.weaponIdx)).name + "  >",
                "POWER-UPS",
                "MUSIC   <  " + VOLUME[eng.meta.musicVol] + "  >",
                "SOUND EFFECTS   <  " + VOLUME[eng.meta.sfxVol] + "  >",
                "LIGHTING   <  " + LIGHTING[eng.meta.lighting] + "  >"};
        for (int i = 0; i < Engine.MENU_COUNT; i++) {
            float by = y + i * (bh + gap);
            button(c, x, by, x + cw, by + bh, labels[i], eng.focus == i);
            if (i == Engine.MENU_STAGE || i == Engine.MENU_WEAPON || i == Engine.MENU_MUSIC || i == Engine.MENU_SFX || i == Engine.MENU_LIGHT) {
                hit(x, by, x + cw * 0.3f, by + bh, i, -1);
                hit(x + cw * 0.3f, by, x + cw, by + bh, i, 1);
            } else {
                hit(x, by, x + cw, by + bh, i, 0);
            }
        }
        if (!compact) text(c, "A / tap: select      d-pad: navigate", w / 2f, h - 30 * u, 26 * u, DIM, Paint.Align.CENTER);
    }

    private void shop(Canvas c, int w, int h) {
        float u = h / 1080f;
        float[] col = column(w, h, 1200f * u);
        float x = col[0], cw = col[1];
        text(c, "POWER-UPS", x, 80 * u, 60 * u, GOLD, Paint.Align.LEFT);
        text(c, "Gold " + eng.meta.gold, x + cw, 80 * u, 44 * u, 0xFFFFD23C, Paint.Align.RIGHT);
        int n = eng.shopKeys.size();
        int rows = (n + 1) / 2;
        float top = 110 * u, bottom = h - 130 * u, gap = 12 * u;
        float rh = Math.min(110 * u, (bottom - top - (rows - 1) * gap) / rows);
        float cwid = (cw - gap) / 2f;
        for (int i = 0; i < n; i++) {
            String key = eng.shopKeys.get(i);
            PowerUpDef d = eng.data.powerUps.get(key);
            float cx = x + (i % 2) * (cwid + gap), cy = top + (i / 2) * (rh + gap);
            boolean f = eng.focus == i;
            r.set(cx, cy, cx + cwid, cy + rh);
            fill.setColor(f ? CARD_FOCUS : CARD);
            c.drawRoundRect(r, 14, 14, fill);
            stroke.setColor(f ? GOLD : 0xFF3A4566);
            stroke.setStrokeWidth(f ? 4f : 2f);
            c.drawRoundRect(r, 14, 14, stroke);
            hit(cx, cy, cx + cwid, cy + rh, i, 0);
            int rank = eng.meta.rank(key);
            boolean max = eng.meta.isMaxed(key);
            float ts = Math.min(32 * u, rh * 0.3f);
            text(c, d.name, cx + 14 * u, cy + 8 * u + ts, ts, TEXT, Paint.Align.LEFT);
            text(c, "Rank " + rank + "/" + d.maxRank(), cx + 14 * u, cy + rh - 12 * u, ts * 0.8f, DIM, Paint.Align.LEFT);
            int price = eng.meta.nextPrice(key);
            text(c, max ? "MAX" : Integer.toString(price), cx + cwid - 14 * u, cy + rh - 12 * u, ts,
                    max ? GOLD : eng.meta.gold >= price ? 0xFF70E080 : 0xFFE06060, Paint.Align.RIGHT);
        }
        float by = h - 100 * u;
        button(c, x, by, x + cw, by + 80 * u, "BACK", eng.focus == n);
        hit(x, by, x + cw, by + 80 * u, n, 0);
    }

    private void pauseMenu(Canvas c, int w, int h) {
        float u = h / 1080f;
        float cw = Math.min(w * 0.8f, 760 * u);
        float x = (w - cw) / 2f;
        text(c, "PAUSED", w / 2f, h * 0.25f, 80 * u, TEXT, Paint.Align.CENTER);
        String[] l = {"RESUME", "QUIT TO MENU"};
        for (int i = 0; i < 2; i++) {
            float by = h * 0.35f + i * 140 * u;
            button(c, x, by, x + cw, by + 110 * u, l[i], eng.focus == i);
            hit(x, by, x + cw, by + 110 * u, i, 0);
        }
    }

    private void chest(Canvas c, int w, int h) {
        float u = h / 1080f;
        float cw = Math.min(w * 0.85f, 900 * u);
        float x = (w - cw) / 2f;
        text(c, "TREASURE!", w / 2f, h * 0.2f, 80 * u, GOLD, Paint.Align.CENTER);
        String[] lines = eng.chestLines;
        // a 5-item chest has up to 7 lines: squeeze the spacing so they stay above the OK button
        float step = Math.min(56 * u, (h - 190 * u - h * 0.32f - 30 * u) / Math.max(1, lines.length));
        for (int i = 0; i < lines.length; i++) {
            text(c, lines[i], w / 2f, h * 0.32f + i * step, Math.min(40 * u, step * 0.75f), lines[i].startsWith("EVO") ? 0xFFFF9AF0 : TEXT, Paint.Align.CENTER);
        }
        float by = h - 190 * u;
        button(c, x, by, x + cw, by + 110 * u, "OK", true);
        hit(x, by, x + cw, by + 110 * u, 0, 0);
    }

    private void result(Canvas c, int w, int h) {
        float u = h / 1080f;
        float cw = Math.min(w * 0.85f, 900 * u);
        float x = (w - cw) / 2f;
        text(c, eng.resultWin ? "VICTORY" : "YOU DIED", w / 2f, h * 0.18f, 88 * u, eng.resultWin ? 0xFF70E080 : 0xFFE04848, Paint.Align.CENTER);
        String[] l = {"Time  " + timeStr(eng.resultTime), "Kills  " + eng.resultKills, "Level  " + eng.resultLevel,
                "Gold earned  " + eng.resultGold, eng.resultNewBest ? "NEW BEST TIME!" : "Best  " + timeStr(eng.meta.bestTimeSec)};
        for (int i = 0; i < l.length; i++) {
            text(c, l[i], w / 2f, h * 0.30f + i * 66 * u, 44 * u, i == 4 && eng.resultNewBest ? GOLD : TEXT, Paint.Align.CENTER);
        }
        float by = h - 190 * u;
        button(c, x, by, x + cw, by + 110 * u, "CONTINUE", true);
        hit(x, by, x + cw, by + 110 * u, 0, 0);
    }
}
