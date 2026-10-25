package se.felixarvid.thorsurvivors.ui;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.Shader;

import se.felixarvid.thorsurvivors.game.Engine;
import se.felixarvid.thorsurvivors.game.Entities.Enemy;
import se.felixarvid.thorsurvivors.game.Sim;
import se.felixarvid.thorsurvivors.render.WorldRenderer;

/**
 * What the top screen shows besides the world, in the ASHFALL skin: the title screen (art with slow parallax, drifting embers,
 * "ASHFALL / LUMEN TIDE"), the banner of the paused phases, and the few overlays of a run (boss bar, toasts, ash storm banner).
 * Owned by {@link WorldRenderer}, drawn on the game thread. Allocation-free per frame.
 */
public final class TopOverlay {
    private final Skin k = new Skin();
    private final UiArt art = UiArt.get();
    private final Paint fill = k.fill;
    private final Paint grad = new Paint();
    private LinearGradient leftFade, bottomFade;
    private RadialGradient vignette;
    private int gw, gh;
    private boolean titleLoaded;
    private String bestLine = "", stageSrc, stageUpper = "";
    private int bestT = -1, bestK = -1, bestG = -1;

    /** True when the title painting is there (a build without the UI art keeps the old world-behind-text menu). */
    public boolean menuReady() {
        return art.get("title.webp", UiArt.G_TITLE, 960) != null;
    }

    /** The run starts: the painting is not needed any more. */
    public void leaveMenu() {
        if (titleLoaded) {
            titleLoaded = false;
            art.release(UiArt.G_TITLE);
        }
    }

    private void layout(int w, int h) {
        if (gw == w && gh == h) return;
        gw = w;
        gh = h;
        leftFade = new LinearGradient(0, 0, w * 0.7f, 0, new int[]{0xEE0C0807, 0xB00C0807, 0x000C0807}, new float[]{0f, 0.5f, 1f}, Shader.TileMode.CLAMP);
        bottomFade = new LinearGradient(0, h * 0.62f, 0, h, 0x000C0807, 0xF00C0807, Shader.TileMode.CLAMP);
        vignette = new RadialGradient(w / 2f, h / 2f, (float) Math.sqrt((double) w * w + (double) h * h) * 0.55f,
                new int[]{0x00000000, 0x00000000, 0xAA000000}, new float[]{0f, 0.55f, 1f}, Shader.TileMode.CLAMP);
    }

    // ------------------------------------------------------------------ title screen

    /** The menu on the top screen: painting with parallax, embers, vignette, title and the records. */
    public void drawMenu(Canvas c, int w, int h, Engine e, boolean dual, double t) {
        layout(w, h);
        float ks = h / 1080f;
        k.u = ks;
        titleLoaded = true;
        Bitmap bg = art.get("title.webp", UiArt.G_TITLE, 960);
        fill.setColor(0xFF0C0807);
        c.drawRect(0, 0, w, h, fill);
        // slow parallax: the painting is 8 % larger than the screen and drifts
        float over = 0.08f, tt = (float) t;
        float fx = 0.5f + 0.5f * (float) Math.sin(tt * 0.06f), fy = 0.5f + 0.5f * (float) Math.sin(tt * 0.041f + 1f);
        float ex = w * over, ey = h * over;
        art.cover(c, bg, -ex * fx, -ey * fy, w + ex * (1f - fx), h + ey * (1f - fy), 0.5f, 0.5f, null);
        // smoke: two dark bands drifting at different speeds in front of the painting
        for (int i = 0; i < 2; i++) {
            float bx = (float) (((tt * (14f + 10f * i) * ks) % (w * 1.6f)) - w * 0.3f);
            fill.setColor(i == 0 ? 0x1A1A100C : 0x14281A12);
            c.drawRect(bx - w * 0.6f, h * (0.55f + 0.18f * i), bx + w * 0.6f, h * (0.80f + 0.18f * i), fill);
        }
        drawEmbers(c, w, h, tt, ks);
        grad.setShader(vignette);
        c.drawRect(0, 0, w, h, grad);
        grad.setShader(leftFade);
        c.drawRect(0, 0, w, h, grad);
        grad.setShader(bottomFade);
        c.drawRect(0, 0, w, h, grad);
        grad.setShader(null);
        // the title block, left side (the hero stands on the right of the painting)
        float x = w * 0.07f, ty = dual ? h * 0.34f : h * 0.24f; // single screen: the menu list takes the lower half
        k.tp.setLetterSpacing(0.06f);
        k.shadowed(c, "ASHFALL", x, ty, h * 0.2f, 0xFFFF8A2A, Paint.Align.LEFT);
        k.tp.setLetterSpacing(0.4f);
        k.shadowed(c, "LUMEN TIDE", x + h * 0.01f, ty + h * 0.085f, h * 0.062f, 0xFF39FF88, Paint.Align.LEFT);
        k.tp.setLetterSpacing(0f);
        k.stripe(c, x, ty + h * 0.115f, x + w * 0.34f, ty + h * 0.115f + 10f * ks, false);
        if (!dual) return;
        if (!e.stageKeys.isEmpty()) {
            String nm = e.stage().name;
            if (nm != stageSrc) { // the name in capitals, made when the stage changes
                stageSrc = nm;
                stageUpper = nm.toUpperCase(java.util.Locale.ROOT);
            }
            k.shadowed(c, stageUpper, x, h * 0.34f + h * 0.2f, h * 0.05f, 0xFFEFE8DC, Paint.Align.LEFT);
        }
        if (e.meta != null) {
            if (bestT != e.meta.bestTimeSec || bestK != e.meta.bestKills || bestG != e.meta.gold) {
                bestT = e.meta.bestTimeSec;
                bestK = e.meta.bestKills;
                bestG = e.meta.gold;
                bestLine = "BEST " + (bestT > 0 ? WorldRenderer.fmtTime(bestT) : "--:--") + "      KILLS " + bestK + "      GOLD " + bestG;
            }
            k.shadowed(c, bestLine, x, h * 0.34f + h * 0.26f, h * 0.036f, 0xFFB8AC9C, Paint.Align.LEFT);
        }
        if (dual) k.shadowed(c, "USE THE BOTTOM SCREEN  -  OR GAMEPAD: STICK / D-PAD + A", x, h * 0.94f, h * 0.034f, 0xFFA89B8C, Paint.Align.LEFT);
    }

    /** 64 embers rising from the bottom, drifting and fading, computed from the clock (no state, no allocation). */
    private void drawEmbers(Canvas c, int w, int h, float t, float ks) {
        for (int i = 0; i < 64; i++) {
            float sp = 0.035f + 0.05f * ((i * 0.3819660f) % 1f), ph = (i * 0.6180339f) % 1f;
            float life = (t * sp + ph) % 1f;
            float x = ((i * 0.7548777f + 0.1f) % 1f) * w + (float) Math.sin(t * 0.8f + i * 1.7f) * 28f * ks + life * 60f * ks;
            float y = h * (1.05f - life * 1.15f);
            float size = (3f + 5f * ((i * 0.5698403f) % 1f)) * ks * (1f - life * 0.5f);
            int a = (int) (255 * Math.min(1f, life * 6f) * (1f - life) * 0.95f);
            fill.setColor((a << 24) | (life < 0.4f ? 0xFFB040 : 0xFF6A20));
            c.drawRect(x, y, x + size, y + size, fill);
        }
    }

    // ------------------------------------------------------------------ paused phases

    /** Level-up, pause, chest, equipment and result: a dimmed world with a steel band and the heading. */
    public void drawPhase(Canvas c, int w, int h, Engine e, boolean dual) {
        layout(w, h);
        float ks = h / 1080f;
        k.u = ks;
        int ph = e.phase;
        if (!dual) { // single screen: the overlay panel has the heading, the world only dims
            fill.setColor(0x99060403);
            c.drawRect(0, 0, w, h, fill);
            return;
        }
        String t1, sub = null;
        int col;
        if (ph == Engine.PH_LEVELUP) { t1 = "LEVEL UP"; col = Skin.ORANGE; }
        else if (ph == Engine.PH_PAUSED) { t1 = "PAUSED"; col = 0xFFEFE8DC; }
        else if (ph == Engine.PH_CHEST) { t1 = "SUPPLY CACHE"; col = Skin.LUMEN; }
        else if (ph == Engine.PH_EQUIP) { t1 = "NEW EQUIPMENT"; col = Skin.GOLD; }
        else if (e.resultWin) { t1 = "VICTORY"; col = Skin.LUMEN; }
        else { t1 = "YOU DIED"; col = 0xFFE04A32; }
        if (ph != Engine.PH_RESULT) sub = "CHOOSE ON THE BOTTOM SCREEN";
        fill.setColor(0x99060403);
        c.drawRect(0, 0, w, h, fill);
        float top = h * 0.36f, bot = h * 0.62f;
        fill.setColor(0xE60C0807);
        c.drawRect(0, top, w, bot, fill);
        k.stripe(c, 0, top, w, top + 12f * ks, false);
        k.stripe(c, 0, bot - 12f * ks, w, bot, false);
        k.tp.setLetterSpacing(0.05f);
        k.shadowed(c, t1, w / 2f, h * 0.5f + h * 0.03f, h * 0.12f, col, Paint.Align.CENTER);
        k.tp.setLetterSpacing(0f);
        if (sub != null) k.shadowed(c, sub, w / 2f, bot + h * 0.06f, h * 0.04f, 0xFFC9BFB0, Paint.Align.CENTER);
    }

    // ------------------------------------------------------------------ run overlays

    /** The boss's health, a framed metal bar across the top of the world (the full bar is on the bottom screen). */
    public void drawBossBar(Canvas c, int w, Sim s, float ks) {
        Enemy b = s.bossNow;
        if (b == null || b.dead) return;
        k.u = ks;
        float x0 = w * 0.2f, x1 = w * 0.8f, y = 14f * ks, hgt = 24f * ks;
        boolean hot = b.phase >= 2 && b.type.pattern == 5;
        k.bar(c, x0, y, x1, y + hgt, b.hp / b.maxHp, hot ? 0xFFFF6A3C : 0xFFFF5A3C, hot ? 0xFFD02810 : 0xFFA82418, 0);
        if (b.type.pattern == 5) { // the phase marks of The First: 66% and 33%
            fill.setColor(0xFF000000);
            for (int i = 0; i < 2; i++) {
                float mx = x0 + (x1 - x0) * (i == 0 ? 0.66f : 0.33f);
                c.drawRect(mx - ks, y, mx + ks, y + hgt, fill);
            }
        }
        k.stripe(c, x0, y + hgt + 3f * ks, x0 + 60f * ks, y + hgt + 9f * ks, false);
        k.stripe(c, x1 - 60f * ks, y + hgt + 3f * ks, x1, y + hgt + 9f * ks, false);
        k.shadowed(c, b.type.nameUpper, w / 2f, y + hgt + 36f * ks, 30f * ks, 0xFFFFD6C4, Paint.Align.CENTER);
    }

    /** What the hero found: pills under the top edge, a colour tick on the left, fading out (equipped, salvaged). */
    public void drawToasts(Canvas c, int w, int h, Sim s, float ks, boolean dual) {
        k.u = ks;
        for (int i = 0; i < Sim.MAX_TOASTS; i++) {
            float life = s.toastT[i];
            if (life <= 0f || s.toastText[i] == null) continue;
            int a = (int) (255 * Math.min(1f, life * 2.5f));
            int rgb = s.toastColor[i] & 0xFFFFFF;
            k.tp.setTypeface(art.bold);
            k.tp.setTextSize(32f * ks);
            float tw = k.tp.measureText(s.toastText[i]), pw = tw + 64f * ks, y = h * (dual ? 0.22f : 0.30f) + i * 56f * ks, ph = 46f * ks;
            float l = w / 2f - pw / 2f;
            fill.setColor((int) (200 * (a / 255f)) << 24 | 0x0C0807);
            c.drawRect(l, y, l + pw, y + ph, fill);
            fill.setColor(a << 24 | rgb);
            c.drawRect(l, y, l + 8f * ks, y + ph, fill);
            k.tp.setColor(a << 24 | rgb);
            k.tp.setTextAlign(Paint.Align.CENTER);
            c.drawText(s.toastText[i], w / 2f + 4f * ks, y + ph * 0.72f, k.tp);
        }
    }

    /** The ash storm warning: a hazard-edged band that fades out. */
    public void drawStormBanner(Canvas c, int w, int h, float elapsed, float ks) {
        k.u = ks;
        float a = Math.min(1f, (3.5f - elapsed) * 1.5f);
        int ai = (int) (255 * a);
        float top = h * 0.10f, bot = top + 84f * ks;
        fill.setColor((int) (220 * a) << 24 | 0x0C0807);
        c.drawRect(0, top, w, bot, fill);
        if (a > 0.5f) {
            k.stripe(c, 0, top, w, top + 8f * ks, false);
            k.stripe(c, 0, bot - 8f * ks, w, bot, false);
        }
        k.tp.setLetterSpacing(0.1f);
        k.shadowed(c, "ASH STORM", w / 2f, top + 58f * ks, 52f * ks, ai << 24 | 0xFF6A2A, Paint.Align.CENTER);
        k.tp.setLetterSpacing(0f);
    }
}
