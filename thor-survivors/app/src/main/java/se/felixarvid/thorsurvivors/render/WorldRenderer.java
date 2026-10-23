package se.felixarvid.thorsurvivors.render;

import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;

import se.felixarvid.thorsurvivors.game.Engine;
import se.felixarvid.thorsurvivors.game.Entities.*;
import se.felixarvid.thorsurvivors.game.EnemyType;
import se.felixarvid.thorsurvivors.game.Sim;

/**
 * Draws the game world on the top screen. Every sprite goes through {@link SpriteAtlas} first and falls back to
 * procedural Canvas shapes. Holds only pre-allocated paints/paths: no allocation per frame.
 */
public final class WorldRenderer {
    private static final String[] PICK_KEYS = {"pickup.GEM", "pickup.COIN", "pickup.COINBAG", "pickup.ROAST",
            "pickup.VACUUM", "pickup.OROLOGION", "pickup.ROSARY", "pickup.CLOVER", "pickup.CHEST"};
    private static final float TILE = 128f;

    private final SpriteAtlas atlas = SpriteAtlas.get();
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint dotPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path path = new Path();
    private final RectF rect = new RectF();
    private final float[] dots = new float[2 * 4 * 160];
    private final float[] lines = new float[4 * 2 * 64];
    private final DemoEnemy[] demo = new DemoEnemy[6];

    private static final class DemoEnemy {
        EnemyType type;
        boolean boss;
    }

    public WorldRenderer() {
        stroke.setStyle(Paint.Style.STROKE);
        text.setTextAlign(Paint.Align.CENTER);
        text.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        dotPaint.setStrokeCap(Paint.Cap.ROUND);
        dotPaint.setStrokeWidth(4f);
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

    public void draw(Canvas c, int w, int h, Engine e, boolean dualScreen) {
        c.drawColor(0xFF000000);
        if (!e.isReady()) return;
        ensureDemo(e);
        Sim s = e.sim;
        int ph = e.phase;
        boolean menu = s == null || ph == Engine.PH_MENU || ph == Engine.PH_SHOP;
        float sc = h / Sim.VIEW_H;
        atlas.setWorldScale(sc);
        float viewW = w / sc, viewH = Sim.VIEW_H;
        String stage = e.stageKeys.get(e.stageIdx);
        float camX, camY;
        if (menu) {
            camX = e.menuTime * 40f;
            camY = (float) Math.sin(e.menuTime * 0.3f) * 60f;
        } else {
            camX = s.px;
            camY = s.py;
            if (s.hitShake > 0) {
                camX += (float) Math.sin(s.time * 90) * 4f;
                camY += (float) Math.cos(s.time * 77) * 4f;
            }
        }
        camX = Math.round(camX * sc) / sc; // whole screen pixels keep nearest-neighbour sprites stable
        camY = Math.round(camY * sc) / sc;
        c.save();
        c.translate(w / 2f, h / 2f);
        c.scale(sc, sc);
        c.translate(-camX, -camY);
        drawGround(c, stage, camX, camY, viewW, viewH);
        if (menu) drawDemo(c, e, camX, camY);
        else drawWorld(c, s, camX, camY, viewW, viewH);
        c.restore();
        drawOverlay(c, w, h, e, s, menu, dualScreen);
    }

    // ------------------------------------------------------------------ ground

    private static int hash(int x, int y) {
        int h = x * 374761393 + y * 668265263;
        h = (h ^ (h >>> 13)) * 1274126177;
        return h ^ (h >>> 16);
    }

    private void drawGround(Canvas c, String stage, float camX, float camY, float vw, float vh) {
        boolean lib = stage.equals("LIBRARY");
        if (atlas.drawTiles(c, "tile." + stage, camX, camY, vw, vh, 64f / atlas.worldScale())) return;
        int base = lib ? 0xFF2B2233 : 0xFF1E3A22;
        int alt = lib ? 0xFF332A3D : 0xFF24442A;
        fill.setColor(base);
        c.drawRect(camX - vw / 2 - 2, camY - vh / 2 - 2, camX + vw / 2 + 2, camY + vh / 2 + 2, fill);
        int x0 = (int) Math.floor((camX - vw / 2) / TILE), x1 = (int) Math.floor((camX + vw / 2) / TILE);
        int y0 = (int) Math.floor((camY - vh / 2) / TILE), y1 = (int) Math.floor((camY + vh / 2) / TILE);
        fill.setColor(alt);
        int nd = 0, nl = 0;
        for (int ty = y0; ty <= y1; ty++) {
            for (int tx = x0; tx <= x1; tx++) {
                if (((tx + ty) & 1) == 0) c.drawRect(tx * TILE, ty * TILE, (tx + 1) * TILE, (ty + 1) * TILE, fill);
                int hh = hash(tx, ty);
                for (int k = 0; k < 3 && nd + 2 <= dots.length; k++) {
                    dots[nd++] = tx * TILE + ((hh >>> (k * 9)) & 127);
                    dots[nd++] = ty * TILE + ((hh >>> (k * 9 + 4)) & 127);
                }
                if (lib && nl + 8 <= lines.length) {
                    lines[nl++] = tx * TILE; lines[nl++] = ty * TILE; lines[nl++] = (tx + 1) * TILE; lines[nl++] = ty * TILE;
                    lines[nl++] = tx * TILE; lines[nl++] = ty * TILE; lines[nl++] = tx * TILE; lines[nl++] = (ty + 1) * TILE;
                }
            }
        }
        dotPaint.setColor(lib ? 0xFF4A3D58 : 0xFF3C6B40);
        c.drawPoints(dots, 0, nd, dotPaint);
        if (nl > 0) {
            stroke.setColor(0x33000000);
            stroke.setStrokeWidth(2f);
            c.drawLines(lines, 0, nl, stroke);
        }
    }

    // ------------------------------------------------------------------ menu preview

    private void drawDemo(Canvas c, Engine e, float camX, float camY) {
        float t = e.menuTime;
        for (int i = 0; i < demo.length; i++) {
            DemoEnemy d = demo[i];
            if (d == null || d.type == null) continue;
            float x = camX + (i - 2.5f) * 150f;
            float y = camY + 150f + (float) Math.sin(t * 2 + i) * 14f;
            drawEnemy(c, d.type, d.boss, d.type.radius * (d.boss ? 1.5f : 1f), x, y, t + i, 0, i % 2 == 0);
        }
        // idle hero
        drawPlayer(c, camX, camY + 20f, true, t, 1f, 1f);
    }

    // ------------------------------------------------------------------ world

    private void drawWorld(Canvas c, Sim s, float camX, float camY, float vw, float vh) {
        float x0 = camX - vw / 2 - 60, x1 = camX + vw / 2 + 60, y0 = camY - vh / 2 - 60, y1 = camY + vh / 2 + 60;
        float t = (float) s.time;
        // garlic-style auras sit under everything
        for (int i = 0; i < s.inv.weaponCount; i++) {
            Sim.WeaponState w = s.weapons[i];
            if (w.behavior == Sim.B_GARLIC) drawAura(c, s, w, t);
        }
        for (int i = 0; i < s.pickN; i++) {
            Pickup p = s.picks[i];
            if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
            drawPickup(c, p);
        }
        // puddles first (ground level)
        for (int i = 0; i < s.projN; i++) {
            Projectile p = s.projs[i];
            if (p.kind == Entities_P_PUDDLE) drawProjectile(c, s, p, t);
        }
        boolean frozen = s.freezeTimer > 0;
        for (int i = 0; i < s.enemyN; i++) {
            Enemy en = s.enemies[i];
            if (en.x < x0 || en.x > x1 || en.y < y0 || en.y > y1) continue;
            drawEnemy(c, en.type, en.boss, en.radius, en.x, en.y, en.anim, en.flash, s.px >= en.x);
            if (frozen) {
                fill.setColor(0x6690D8FF);
                c.drawCircle(en.x, en.y, en.radius, fill);
            }
            if (en.boss) {
                float bw = en.radius * 2f;
                fill.setColor(0xFF220000);
                c.drawRect(en.x - bw / 2, en.y - en.radius - 12, en.x + bw / 2, en.y - en.radius - 7, fill);
                fill.setColor(0xFFE02020);
                c.drawRect(en.x - bw / 2, en.y - en.radius - 12, en.x - bw / 2 + bw * Math.max(0, en.hp / en.maxHp), en.y - en.radius - 7, fill);
            }
        }
        for (int i = 0; i < s.projN; i++) {
            Projectile p = s.projs[i];
            if (p.kind != Entities_P_PUDDLE) drawProjectile(c, s, p, t);
        }
        for (int i = 0; i < Sim.MAX_FX; i++) {
            Effect f = s.fx[i];
            if (f.life > 0) drawFx(c, s, f);
        }
        boolean blink = s.invuln > 0 && ((int) (t * 20) & 1) == 0;
        drawPlayer(c, s.px, s.py, s.facingRight, s.walk, blink ? 0.4f : 1f, 1f);
        // slim HP bar under the player
        fill.setColor(0xFF330000);
        c.drawRect(s.px - 16, s.py + 17, s.px + 16, s.py + 21, fill);
        fill.setColor(0xFFE03030);
        c.drawRect(s.px - 16, s.py + 17, s.px - 16 + 32 * Math.max(0, s.hp / s.maxHp), s.py + 21, fill);
        for (int i = 0; i < Sim.MAX_PART; i++) {
            Particle q = s.parts[i];
            if (q.life <= 0) continue;
            fill.setColor((q.color & 0x00FFFFFF) | ((int) (255 * Math.min(1f, q.life / q.maxLife * 1.5f)) << 24));
            c.drawRect(q.x - q.size / 2, q.y - q.size / 2, q.x + q.size / 2, q.y + q.size / 2, fill);
        }
        for (int i = 0; i < Sim.MAX_TEXT; i++) {
            DamageText d = s.texts[i];
            if (d.life <= 0) continue;
            text.setTextSize(d.crit ? 24f : 17f);
            int a = (int) (255 * Math.min(1f, d.life * 2.5f));
            text.setColor((d.heal ? 0x40FF60 : d.crit ? 0xFFD030 : 0xFFFFFF) | (a << 24));
            c.drawText(d.digits, 0, d.len, d.x, d.y, text);
        }
    }

    private static final int Entities_P_PUDDLE = se.felixarvid.thorsurvivors.game.Entities.P_PUDDLE;

    private void drawAura(Canvas c, Sim s, Sim.WeaponState w, float t) {
        float r = 72f * w.area;
        float pulse = w.pulse > 0 ? w.pulse / 0.25f : 0f;
        int base = w.evo ? 0xA040C0 : 0xE070C0;
        if (!atlas.draw(c, w.spriteKey, t, s.px, s.py, r * 2, r * 2, false, 0, 120)) {
            fill.setColor(((int) (40 + 60 * pulse) << 24) | base);
            c.drawCircle(s.px, s.py, r, fill);
            stroke.setColor(((int) (90 + 100 * pulse) << 24) | base);
            stroke.setStrokeWidth(3f);
            c.drawCircle(s.px, s.py, r, stroke);
        }
    }

    private void drawPickup(Canvas c, Pickup p) {
        float bob = (float) Math.sin(p.bob) * 2f;
        float size = p.kind == se.felixarvid.thorsurvivors.game.Entities.K_CHEST ? 34f : 20f;
        if (atlas.draw(c, PICK_KEYS[p.kind], p.bob, p.x, p.y + bob, size, size, false, 0, 255)) return;
        float x = p.x, y = p.y + bob;
        switch (p.kind) {
            case 0: { // gem diamond
                int col = p.value < 3f ? 0xFF4FA8FF : p.value < 10f ? 0xFF4FE08A : 0xFFFF5A5A;
                fill.setColor(col);
                path.reset();
                path.moveTo(x, y - 7); path.lineTo(x + 5, y); path.lineTo(x, y + 7); path.lineTo(x - 5, y); path.close();
                c.drawPath(path, fill);
                fill.setColor(0x80FFFFFF);
                c.drawCircle(x - 1.5f, y - 2f, 1.6f, fill);
                break;
            }
            case 1:
            case 2: {
                fill.setColor(p.kind == 1 ? 0xFFFFD23C : 0xFFFFB020);
                c.drawCircle(x, y, p.kind == 1 ? 6f : 9f, fill);
                stroke.setColor(0xFFB07800);
                stroke.setStrokeWidth(2f);
                c.drawCircle(x, y, p.kind == 1 ? 6f : 9f, stroke);
                break;
            }
            case 3: // roast
                fill.setColor(0xFFC8742C);
                rect.set(x - 9, y - 6, x + 6, y + 6);
                c.drawOval(rect, fill);
                fill.setColor(0xFFF2E6CF);
                c.drawRect(x + 4, y - 2, x + 12, y + 2, fill);
                break;
            case 4: // vacuum (magnet)
                stroke.setColor(0xFFC040E0);
                stroke.setStrokeWidth(5f);
                rect.set(x - 8, y - 8, x + 8, y + 8);
                c.drawArc(rect, 180, 180, false, stroke);
                fill.setColor(0xFFFFFFFF);
                c.drawRect(x - 10, y, x - 6, y + 6, fill);
                c.drawRect(x + 6, y, x + 10, y + 6, fill);
                break;
            case 5: // orologion (clock)
                fill.setColor(0xFF60C0FF);
                c.drawCircle(x, y, 9f, fill);
                stroke.setColor(0xFF0A3050);
                stroke.setStrokeWidth(2f);
                c.drawLine(x, y, x, y - 6, stroke);
                c.drawLine(x, y, x + 4, y, stroke);
                break;
            case 6: // rosary
                stroke.setColor(0xFFFFFFFF);
                stroke.setStrokeWidth(3f);
                c.drawLine(x, y - 10, x, y + 10, stroke);
                c.drawLine(x - 7, y - 3, x + 7, y - 3, stroke);
                fill.setColor(0xFFFF4060);
                c.drawCircle(x, y - 3, 2.5f, fill);
                break;
            case 7: // clover
                fill.setColor(0xFF40D060);
                c.drawCircle(x - 4, y - 3, 4, fill);
                c.drawCircle(x + 4, y - 3, 4, fill);
                c.drawCircle(x - 4, y + 4, 4, fill);
                c.drawCircle(x + 4, y + 4, 4, fill);
                break;
            default: { // chest
                fill.setColor(0xFF8A5528);
                c.drawRect(x - 16, y - 10, x + 16, y + 12, fill);
                fill.setColor(0xFFFFC832);
                c.drawRect(x - 16, y - 10, x + 16, y - 4, fill);
                c.drawRect(x - 3, y - 6, x + 3, y + 4, fill);
                stroke.setColor(0xFF3A2008);
                stroke.setStrokeWidth(2f);
                c.drawRect(x - 16, y - 10, x + 16, y + 12, stroke);
                float glow = 0.5f + 0.5f * (float) Math.sin(p.bob * 2);
                stroke.setColor(((int) (120 * glow) << 24) | 0xFFE060);
                stroke.setStrokeWidth(3f);
                c.drawCircle(x, y, 24f, stroke);
            }
        }
    }

    private void drawPlayer(Canvas c, float x, float y, boolean right, float walk, float alpha, float scale) {
        float bobSq = 1f + 0.06f * (float) Math.sin(walk * 3.8f); // ~6 Hz while moving (walk only advances when moving)
        if (atlas.draw(c, "player", 0, x, y - 4, 40, 40, !right, 0, (int) (255 * alpha), bobSq)) return;
        int a = (int) (255 * alpha) << 24;
        float bob = (float) Math.abs(Math.sin(walk)) * 2f;
        float d = right ? 1 : -1;
        // cape
        fill.setColor(a | 0x8A1F2E);
        path.reset();
        path.moveTo(x - d * 4, y - 6 - bob); path.lineTo(x - d * 16, y + 12 - bob); path.lineTo(x + d * 2, y + 12 - bob); path.close();
        c.drawPath(path, fill);
        // body
        fill.setColor(a | 0x3A6FD0);
        rect.set(x - 8, y - 6 - bob, x + 8, y + 12 - bob);
        c.drawRoundRect(rect, 5, 5, fill);
        // head
        fill.setColor(a | 0xF0C8A0);
        c.drawCircle(x, y - 11 - bob, 7, fill);
        fill.setColor(a | 0x4A2E18);
        rect.set(x - 7.5f, y - 19 - bob, x + 7.5f, y - 12 - bob);
        c.drawRoundRect(rect, 4, 4, fill);
        fill.setColor(a | 0x101010);
        c.drawCircle(x + d * 3, y - 11 - bob, 1.3f, fill);
    }

    private void drawEnemy(Canvas c, EnemyType t, boolean boss, float r, float x, float y, float anim, float flash, boolean faceRight) {
        int alpha = (int) (255 * t.alpha);
        float hz = t.shape == EnemyType.SH_BAT ? 11f : t.shape == EnemyType.SH_GHOST ? 4f : 6f;
        float sq = 1f + 0.06f * (float) Math.sin(anim * 6.2832f * hz);
        if (atlas.draw(c, boss ? t.bossSpriteKey : t.spriteKey, 0, x, y, r * 2.4f, r * 2.4f, !faceRight, 0, alpha, sq)
                || (boss && atlas.draw(c, t.spriteKey, 0, x, y, r * 2.4f, r * 2.4f, !faceRight, 0, alpha, sq))) {
            if (flash > 0) {
                fill.setColor(0x80FFFFFF);
                c.drawCircle(x, y, r, fill);
            }
            return;
        }
        int col = flash > 0 ? 0xFFFFFFFF : t.color;
        int a = alpha << 24;
        fill.setColor((col & 0x00FFFFFF) | a);
        float wob = (float) Math.sin(anim * 8f) * r * 0.08f;
        switch (t.shape) {
            case EnemyType.SH_BAT: {
                float flap = (float) Math.sin(anim * 16f) * r * 0.9f;
                path.reset();
                path.moveTo(x, y - r * 0.2f);
                path.lineTo(x - r * 1.9f, y - r * 0.4f + flap);
                path.lineTo(x - r * 1.0f, y + r * 0.6f);
                path.close();
                path.moveTo(x, y - r * 0.2f);
                path.lineTo(x + r * 1.9f, y - r * 0.4f + flap);
                path.lineTo(x + r * 1.0f, y + r * 0.6f);
                path.close();
                c.drawPath(path, fill);
                rect.set(x - r * 0.65f, y - r * 0.7f, x + r * 0.65f, y + r * 0.7f);
                c.drawOval(rect, fill);
                eyes(c, x, y - r * 0.15f, r * 0.3f, flash);
                break;
            }
            case EnemyType.SH_SKELETON: {
                rect.set(x - r * 0.55f, y, x + r * 0.55f, y + r * 1.0f);
                c.drawRoundRect(rect, 3, 3, fill);
                c.drawCircle(x, y - r * 0.35f, r * 0.7f, fill);
                fill.setColor(flash > 0 ? 0xFFFFFFFF : 0xFF202020);
                c.drawCircle(x - r * 0.27f, y - r * 0.4f, r * 0.2f, fill);
                c.drawCircle(x + r * 0.27f, y - r * 0.4f, r * 0.2f, fill);
                c.drawRect(x - r * 0.3f, y - r * 0.05f, x + r * 0.3f, y + r * 0.1f, fill);
                break;
            }
            case EnemyType.SH_GHOST: {
                path.reset();
                path.moveTo(x - r, y + r);
                path.lineTo(x - r, y - r * 0.2f);
                rect.set(x - r, y - r * 1.1f, x + r, y + r * 0.7f);
                path.arcTo(rect, 180, 180);
                path.lineTo(x + r, y + r);
                float w3 = r * 2f / 4f;
                for (int i = 3; i >= 0; i--) path.lineTo(x - r + w3 * i + w3 / 2, y + r * (i % 2 == 0 ? 1.0f : 0.65f) + wob);
                path.close();
                c.drawPath(path, fill);
                eyes(c, x, y - r * 0.2f, r * 0.33f, flash);
                break;
            }
            case EnemyType.SH_FLOWER: {
                for (int i = 0; i < 6; i++) {
                    float ang = i * 1.0472f + anim;
                    c.drawCircle(x + (float) Math.cos(ang) * r * 0.65f, y + (float) Math.sin(ang) * r * 0.65f, r * 0.45f, fill);
                }
                fill.setColor(flash > 0 ? 0xFFFFFFFF : 0xFFFFE070);
                c.drawCircle(x, y, r * 0.5f, fill);
                eyes(c, x, y, r * 0.17f, flash);
                break;
            }
            case EnemyType.SH_WOLF: {
                rect.set(x - r, y - r * 0.6f, x + r, y + r);
                c.drawOval(rect, fill);
                path.reset();
                path.moveTo(x - r * 0.8f, y - r * 0.4f); path.lineTo(x - r * 0.5f, y - r * 1.3f); path.lineTo(x - r * 0.1f, y - r * 0.5f);
                path.moveTo(x + r * 0.8f, y - r * 0.4f); path.lineTo(x + r * 0.5f, y - r * 1.3f); path.lineTo(x + r * 0.1f, y - r * 0.5f);
                c.drawPath(path, fill);
                eyes(c, x, y - r * 0.1f, r * 0.28f, flash);
                break;
            }
            case EnemyType.SH_MUMMY: {
                rect.set(x - r * 0.9f, y - r, x + r * 0.9f, y + r);
                c.drawRoundRect(rect, r * 0.5f, r * 0.5f, fill);
                stroke.setColor(flash > 0 ? 0xFFFFFFFF : 0xFF9C8A5C);
                stroke.setStrokeWidth(2f);
                for (int i = -1; i <= 1; i++) c.drawLine(x - r * 0.8f, y + i * r * 0.5f, x + r * 0.8f, y + i * r * 0.5f + 3, stroke);
                eyes(c, x, y - r * 0.5f, r * 0.25f, flash);
                break;
            }
            case EnemyType.SH_WITCH: {
                path.reset();
                path.moveTo(x, y - r * 1.3f); path.lineTo(x + r * 0.7f, y - r * 0.4f); path.lineTo(x - r * 0.7f, y - r * 0.4f); path.close();
                c.drawPath(path, fill);
                path.reset();
                path.moveTo(x, y - r * 0.5f); path.lineTo(x + r * 1.0f, y + r); path.lineTo(x - r * 1.0f, y + r); path.close();
                c.drawPath(path, fill);
                eyes(c, x, y - r * 0.1f, r * 0.28f, flash);
                break;
            }
            default: {
                rect.set(x - r, y - r * 0.85f + wob, x + r, y + r);
                c.drawRoundRect(rect, r * 0.7f, r * 0.7f, fill);
                eyes(c, x, y - r * 0.15f, r * 0.33f, flash);
            }
        }
        if (boss) {
            stroke.setColor(0xFFFFD040);
            stroke.setStrokeWidth(3f);
            c.drawCircle(x, y, r * 1.1f, stroke);
        }
    }

    private void eyes(Canvas c, float x, float y, float dx, float flash) {
        fill.setColor(flash > 0 ? 0xFF888888 : 0xFFFF2020);
        c.drawCircle(x - dx, y, dx * 0.45f, fill);
        c.drawCircle(x + dx, y, dx * 0.45f, fill);
    }

    private void drawProjectile(Canvas c, Sim s, Projectile p, float t) {
        float deg = p.angle * 57.29578f;
        String key = s.weapons[p.slot].spriteKey;
        float sz = p.radius * 2.4f;
        if (p.kind == se.felixarvid.thorsurvivors.game.Entities.P_PUDDLE) {
            // holy water: a flask drops in, the puddle itself stays procedural
            float age = p.maxLife - p.life;
            if (age < 0.25f && atlas.draw(c, key, 0, p.x, p.y - (0.25f - age) * 480f, sz, sz, false, age * 900f, 255)) return;
        } else if (atlas.draw(c, key, 0, p.x, p.y, sz, sz, false, deg, 255)) return;
        boolean evo = p.evo;
        switch (p.kind) {
            case se.felixarvid.thorsurvivors.game.Entities.P_MISSILE:
                fill.setColor(evo ? 0x60FFE060 : 0x6050D8FF);
                c.drawCircle(p.x - p.vx * 0.02f, p.y - p.vy * 0.02f, p.radius * 1.2f, fill);
                fill.setColor(evo ? 0xFFFFF0A0 : 0xFFA8F0FF);
                c.drawCircle(p.x, p.y, p.radius * 0.7f, fill);
                break;
            case se.felixarvid.thorsurvivors.game.Entities.P_KNIFE:
                c.save();
                c.translate(p.x, p.y);
                c.rotate(deg);
                path.reset();
                path.moveTo(p.radius * 1.6f, 0); path.lineTo(-p.radius, -p.radius * 0.5f); path.lineTo(-p.radius * 0.5f, 0); path.lineTo(-p.radius, p.radius * 0.5f); path.close();
                fill.setColor(evo ? 0xFFFFF2B0 : 0xFFD8E0EA);
                c.drawPath(path, fill);
                c.restore();
                break;
            case se.felixarvid.thorsurvivors.game.Entities.P_AXE:
                c.save();
                c.translate(p.x, p.y);
                c.rotate(deg);
                fill.setColor(0xFF7A4A22);
                c.drawRect(-2, -p.radius, 2, p.radius, fill);
                fill.setColor(evo ? 0xFFB070E0 : 0xFFBFC8D2);
                path.reset();
                path.moveTo(2, -p.radius); path.lineTo(p.radius, -p.radius * 0.6f); path.lineTo(p.radius * 0.8f, p.radius * 0.1f); path.lineTo(2, -p.radius * 0.1f); path.close();
                c.drawPath(path, fill);
                c.restore();
                break;
            case se.felixarvid.thorsurvivors.game.Entities.P_CROSS:
                c.save();
                c.translate(p.x, p.y);
                c.rotate(deg);
                fill.setColor(evo ? 0xFFFFFFFF : 0xFFFFD84A);
                float r = p.radius;
                c.drawRect(-r, -r * 0.25f, r, r * 0.25f, fill);
                c.drawRect(-r * 0.25f, -r, r * 0.25f, r, fill);
                if (evo) { // sword blade
                    fill.setColor(0xFFE8F4FF);
                    c.drawRect(-r * 0.15f, -r * 2f, r * 0.15f, r, fill);
                }
                c.restore();
                break;
            case se.felixarvid.thorsurvivors.game.Entities.P_BOOK:
                c.save();
                c.translate(p.x, p.y);
                c.rotate(deg + 90);
                fill.setColor(evo ? 0xFF5A2A8A : 0xFF3A5FD0);
                c.drawRect(-p.radius * 0.7f, -p.radius, p.radius * 0.7f, p.radius, fill);
                fill.setColor(0xFFF2E6B0);
                c.drawRect(-p.radius * 0.5f, -p.radius * 0.8f, p.radius * 0.6f, p.radius * 0.8f, fill);
                fill.setColor(evo ? 0xFFFF70A0 : 0xFFFFD84A);
                c.drawRect(-p.radius * 0.1f, -p.radius * 0.5f, p.radius * 0.1f, p.radius * 0.5f, fill);
                c.restore();
                break;
            case se.felixarvid.thorsurvivors.game.Entities.P_FIRE:
                fill.setColor(evo ? 0x80601010 : 0x80FF8020);
                c.drawCircle(p.x - p.vx * 0.03f, p.y - p.vy * 0.03f, p.radius * 1.4f, fill);
                fill.setColor(evo ? 0xFF8A1010 : 0xFFFFA030);
                c.drawCircle(p.x, p.y, p.radius, fill);
                fill.setColor(evo ? 0xFFFF6030 : 0xFFFFE070);
                c.drawCircle(p.x, p.y, p.radius * 0.5f, fill);
                break;
            default: { // puddle
                float k = Math.min(1f, p.life * 3f);
                float rip = (float) Math.sin(t * 5 + p.x) * 0.04f;
                fill.setColor(((int) (110 * k) << 24) | (evo ? 0x2040C0 : 0x40A0FF));
                c.drawCircle(p.x, p.y, p.radius * (1 + rip), fill);
                stroke.setColor(((int) (200 * k) << 24) | (evo ? 0x6080FF : 0xA0E0FF));
                stroke.setStrokeWidth(2f);
                c.drawCircle(p.x, p.y, p.radius * (0.65f + rip), stroke);
            }
        }
    }

    private void drawFx(Canvas c, Sim s, Effect f) {
        float k = f.life / f.maxLife;
        switch (f.kind) {
            case se.felixarvid.thorsurvivors.game.Entities.FX_WHIP:
                if (atlas.draw(c, "fx.whip", 1f - k, f.x, f.y, f.w, f.h * 2, f.side < 0, 0, (int) (255 * k))) break;
                rect.set(f.x - f.w / 2, f.y - f.h * 0.9f, f.x + f.w / 2, f.y + f.h * 0.9f);
                stroke.setColor(((int) (230 * k) << 24) | (f.evo ? 0xFF3050 : 0xFFFFFF));
                stroke.setStrokeWidth(8f * k + 2f);
                c.drawArc(rect, f.side > 0 ? -50 : 130, 100, false, stroke);
                break;
            case se.felixarvid.thorsurvivors.game.Entities.FX_BOLT: {
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
            case se.felixarvid.thorsurvivors.game.Entities.FX_RING:
                fill.setColor(((int) (110 * k) << 24) | (f.evo ? 0x802010 : 0xFF8020));
                c.drawCircle(f.x, f.y, f.w * (1.1f - 0.4f * k), fill);
                break;
            default:
        }
    }

    // ------------------------------------------------------------------ overlays (screen space)

    private void drawOverlay(Canvas c, int w, int h, Engine e, Sim s, boolean menu, boolean dual) {
        int ph = e.phase;
        text.setTextAlign(Paint.Align.CENTER);
        if (s != null && s.screenFlash > 0 && !menu) {
            fill.setColor(((int) (180 * Math.min(1f, s.screenFlash * 2)) << 24) | 0xFFFFFF);
            c.drawRect(0, 0, w, h, fill);
        }
        if (menu) {
            fill.setColor(0x66000000);
            c.drawRect(0, 0, w, h, fill);
            text.setColor(0xFFFFD84A);
            text.setTextSize(h * 0.13f);
            c.drawText("THOR SURVIVORS", w / 2f, h * 0.30f, text);
            text.setColor(0xFFE8E8F0);
            text.setTextSize(h * 0.045f);
            String st = e.stageKeys.isEmpty() ? "" : e.stage().name;
            c.drawText(st, w / 2f, h * 0.38f, text);
            if (e.meta != null) {
                text.setTextSize(h * 0.04f);
                text.setColor(0xFFB0B8D0);
                c.drawText("Best " + fmtTime(e.meta.bestTimeSec) + "   Kills " + e.meta.bestKills + "   Gold " + e.meta.gold, w / 2f, h * 0.45f, text);
            }
            if (dual) {
                text.setTextSize(h * 0.035f);
                text.setColor(0xFF8890B0);
                c.drawText("Use the bottom screen (or gamepad: stick/d-pad + A)", w / 2f, h * 0.93f, text);
            }
            return;
        }
        if (ph == Engine.PH_LEVELUP || ph == Engine.PH_PAUSED || ph == Engine.PH_CHEST || ph == Engine.PH_RESULT) {
            fill.setColor(0x99000000);
            c.drawRect(0, 0, w, h, fill);
            text.setTextSize(h * 0.1f);
            String t1;
            int col = 0xFFFFFFFF;
            if (ph == Engine.PH_LEVELUP) { t1 = "LEVEL UP!"; col = 0xFFFFD84A; }
            else if (ph == Engine.PH_PAUSED) t1 = "PAUSED";
            else if (ph == Engine.PH_CHEST) { t1 = "TREASURE!"; col = 0xFFFFD84A; }
            else if (e.resultWin) { t1 = "VICTORY"; col = 0xFF70E080; }
            else { t1 = "YOU DIED"; col = 0xFFE04040; }
            text.setColor(col);
            c.drawText(t1, w / 2f, h * 0.5f, text);
            if (dual && ph != Engine.PH_RESULT) {
                text.setTextSize(h * 0.04f);
                text.setColor(0xFFC0C8E0);
                c.drawText("Choose on the bottom screen", w / 2f, h * 0.58f, text);
            }
        }
    }

    public static String fmtTime(int sec) {
        int m = sec / 60, s = sec % 60;
        return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
    }
}
