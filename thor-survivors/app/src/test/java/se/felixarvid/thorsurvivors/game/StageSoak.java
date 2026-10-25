package se.felixarvid.thorsurvivors.game;

import se.felixarvid.thorsurvivors.data.GameData;
import se.felixarvid.thorsurvivors.game.Entities.Enemy;

import java.io.FileInputStream;
import java.io.InputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Random;

/**
 * Headless 30 minute runs of a whole stage (design phase 7 acceptance, the soak skill): a seeded bot that aims the main
 * weapon at the nearest enemy and kites away from the crowd, with one of three policies.
 *
 * <ul>
 * <li><b>immortal</b>: hp is refilled every step; checks NaN, pool limits, the 300 cap and counts everything.</li>
 * <li><b>mid</b>: mortal, takes level-ups and chests like a player who prefers weapons and branches.</li>
 * <li><b>naked</b>: mortal, takes no level-up card at all (the main weapon alone).</li>
 * <li><b>still</b>: mortal, takes cards like <b>mid</b> but never moves (it only dodges).</li>
 * </ul>
 *
 * Not a JUnit test (it takes minutes): {@code StageSoakTest} runs a short slice under {@code SOAK=1}, and
 * {@code main(stage, hero, policy, seed)} runs one cell (see the soak skill).
 */
public final class StageSoak {
    public static final class Result {
        public String stage, hero, policy;
        public long seed;
        public double endTime;
        public int ended, kills, level, gold, peakEnemies, peakProj, peakPick, peakEProj, peakHaz, peakRanged, bosses,
                nan, overflow, capBreak, weapons, pickFull;
        public String firstProblem = "";
        public float[] dmg = new float[4];

        @Override
        public String toString() {
            return String.format("%-5s %-9s %-8s seed %d  end=%s t=%.0fs kills=%d lvl=%d gold=%d peakEn=%d proj=%d pick=%d(full %ds) eproj=%d haz=%d ranged=%d bosses=%d w=%d nan=%d over=%d cap=%d dmg[c/b/a/x]=%.0f/%.0f/%.0f/%.0f %s",
                    stage, hero, policy, seed, ended == 0 ? "alive" : ended == 1 ? "DIED" : "WON", endTime, kills, level, gold,
                    peakEnemies, peakProj, peakPick, pickFull / 60, peakEProj, peakHaz, peakRanged, bosses, weapons, nan, overflow, capBreak,
                    dmg[0], dmg[1], dmg[2], dmg[3], firstProblem);
        }
    }

    static final double TRACE_FROM = System.getenv("TRACE") == null ? -1 : Double.parseDouble(System.getenv("TRACE"));

    private static GameData data;

    static synchronized GameData data() throws Exception {
        if (data == null) {
            try (InputStream in = new FileInputStream("src/main/assets/game_data.json");
                 InputStream over = new FileInputStream("src/main/assets/ashfall_data.json")) {
                data = GameData.load(in, over);
            }
        }
        return data;
    }

    private static boolean bad(float v) {
        return Float.isNaN(v) || Float.isInfinite(v);
    }

    private static int score(Offer o) {
        switch (o.kind) {
            case Offer.BRANCH: return 6;
            case Offer.NEW_WEAPON: return 5;
            case Offer.WEAPON_LEVEL: return 4;
            case Offer.PASSIVE_LEVEL: return 3;
            case Offer.NEW_PASSIVE: return 2;
            default: return 0;
        }
    }

    public static Result run(String stage, String hero, String policy, long seed, double limit) throws Exception {
        GameData d = data();
        Result r = new Result();
        r.stage = stage;
        r.hero = hero;
        r.policy = policy;
        r.seed = seed;
        boolean immortal = policy.equals("immortal"), naked = policy.equals("naked");
        Sim s = new Sim(d, d.stages.get(stage), null, new HashMap<String, Double>(), hero, seed);
        Random rng = new Random(seed * 7919 + 1);
        Input in = new Input();
        float dt = 1f / 60f;
        long step = 0;
        while (s.time < limit && s.ended == 0) {
            // the bot: flee the melee crowd, chase the nearest shooter, sidestep bolts, otherwise circle; aim at the nearest enemy
            float fx = 0, fy = 0, cx = 0, cy = 0, bx = 0, by = 0;
            Enemy best = null, shooter = null;
            float bd = 1e18f, sd = 1e18f;
            int crowd = 0;
            for (int i = 0; i < s.enemyN; i++) {
                Enemy e = s.enemies[i];
                float dx = s.px - e.x, dy = s.py - e.y, q = dx * dx + dy * dy;
                if (q < bd) {
                    bd = q;
                    best = e;
                }
                if (e.type.ranged) {
                    if (q < sd && q < 320f * 320f) {
                        sd = q;
                        shooter = e;
                    }
                    continue;
                }
                if (q < 130f * 130f && q > 1f) {
                    crowd++;
                    float inv = 1f / (float) Math.sqrt(q);
                    float w = (130f - 1f / inv) / 130f;
                    fx += dx * inv * w;
                    fy += dy * inv * w;
                }
            }
            if (shooter != null && crowd < 5) { // run the shooters down (they only back off at 0.7 speed)
                float dx = shooter.x - s.px, dy = shooter.y - s.py, m = (float) Math.sqrt(dx * dx + dy * dy) + 1e-3f;
                cx = dx / m;
                cy = dy / m;
            }
            boolean bolt = false;
            for (int i = 0; i < s.eprojN; i++) {
                Entities.EProj p = s.eprojs[i];
                if (p.friendly) continue;
                float rx = p.x - s.px, ry = p.y - s.py, v2 = p.vx * p.vx + p.vy * p.vy;
                if (v2 < 1f || rx * rx + ry * ry > 220f * 220f) continue;
                float t = -(rx * p.vx + ry * p.vy) / v2;
                if (t <= 0f || t > 0.9f) continue;
                float hx = rx + p.vx * t, hy = ry + p.vy * t; // where it passes the hero
                if (hx * hx + hy * hy > 28f * 28f) continue;
                float vl = (float) Math.sqrt(v2), px2 = -p.vy / vl, py2 = p.vx / vl; // sidestep across its line
                float side = (hx * px2 + hy * py2) > 0 ? -1f : 1f;
                bx += px2 * side;
                by += py2 * side;
                if (t < 0.18f) bolt = true;
            }
            // out of slag pools and clouds (also while they are only warning), off the line of a telegraphed charge
            float hx2 = 0, hy2 = 0;
            for (int i = 0; i < s.hazN; i++) {
                Entities.Hazard hz = s.hazards[i];
                float dx = s.px - hz.x, dy = s.py - hz.y, dd = (float) Math.sqrt(dx * dx + dy * dy) + 0.01f;
                if (dd < hz.r + 45f) {
                    hx2 += dx / dd * 1.5f;
                    hy2 += dy / dd * 1.5f;
                }
            }
            for (int i = 0; i < s.enemyN; i++) {
                Enemy e = s.enemies[i];
                if (e.tele > 0f && e.type.arch == se.felixarvid.thorsurvivors.data.EnemyDef.ARCH_CHARGER) {
                    float rx = s.px - e.x, ry = s.py - e.y;
                    float along = rx * e.ax + ry * e.ay, across = -rx * e.ay + ry * e.ax;
                    if (along > -30f && along < e.teleLen + 40f && Math.abs(across) < e.radius + 40f) {
                        float side = across >= 0f ? 1f : -1f;
                        hx2 += -e.ay * side * 2f;
                        hy2 += e.ax * side * 2f;
                    }
                }
                if (e.boss && !e.type.ranged) { // keep well clear of a boss body
                    float dx = s.px - e.x, dy = s.py - e.y, dd = (float) Math.sqrt(dx * dx + dy * dy) + 0.01f;
                    if (dd < 190f) {
                        hx2 += dx / dd * (190f - dd) / 100f;
                        hy2 += dy / dd * (190f - dd) / 100f;
                    }
                }
            }
            double a = s.time * 0.5;
            float mx = (float) Math.cos(a) * 0.3f + fx * 0.8f + cx * 0.7f + bx * 1.4f + hx2;
            float my = (float) Math.sin(a) * 0.3f + fy * 0.8f + cy * 0.7f + by * 1.4f + hy2;
            float ml = (float) Math.sqrt(mx * mx + my * my);
            if (ml > 1f) {
                mx /= ml;
                my /= ml;
            }
            boolean still = policy.equals("still");
            in.stickX = still ? 0f : mx;
            in.stickY = still ? 0f : my;
            if (best != null) {
                float dx = best.x - s.px, dy = best.y - s.py, m = (float) Math.sqrt(dx * dx + dy * dy) + 1e-3f;
                in.aimStickX = dx / m;
                in.aimStickY = dy / m;
            }
            if ((bolt || crowd >= 6) && s.dodgeCd <= 0f) in.dodgeReq = true;
            if (immortal) s.hp = s.maxHp;
            s.update(dt, in);
            step++;
            while (s.pendingLevelUps > 0) {
                int lvl = s.level - s.pendingLevelUps + 1;
                if (!naked) {
                    List<Offer> o = OfferGenerator.generate(s.inv, d.weapons.values(), s.stats.luck, rng,
                            s.main == null ? null : s.main.def, s.main == null ? null : s.main.tier, lvl);
                    Offer pick = o.get(0);
                    int bestScore = -1;
                    for (Offer c : o) {
                        int sc = score(c) * 10 + rng.nextInt(10);
                        if (sc > bestScore) {
                            bestScore = sc;
                            pick = c;
                        }
                    }
                    s.applyOffer(pick);
                }
                s.pendingLevelUps--;
            }
            while (s.pendingChests > 0) {
                if (naked) s.pendingChests--;
                else s.openChest();
            }
            s.sound.clear();
            if (TRACE_FROM >= 0 && s.time >= TRACE_FROM && s.time <= TRACE_FROM + 40 && step % 30 == 0) {
                StringBuilder sb = new StringBuilder(String.format("t=%.1f hp=%.0f/%.0f pos=%.0f,%.0f en=%d bolts=%d haz=%d", s.time, s.hp, s.maxHp, s.px, s.py, s.enemyN, s.eprojN, s.hazN));
                for (int i = 0; i < s.enemyN; i++) {
                    Enemy e = s.enemies[i];
                    if (!e.boss) continue;
                    sb.append(String.format(" BOSS %s d=%.0f hp=%.0f ai=%d tele=%.2f", e.type.def.key, Math.hypot(e.x - s.px, e.y - s.py), e.hp, e.ai, e.tele));
                }
                System.out.println(sb);
            }
            // checks
            if (step % 30 == 0) {
                int bosses = 0, ranged = 0;
                for (int i = 0; i < s.enemyN; i++) {
                    Enemy e = s.enemies[i];
                    if (e.boss) bosses++;
                    if (e.type.ranged) ranged++;
                    if (bad(e.x) || bad(e.y) || bad(e.hp)) r.nan++;
                }
                if (bad(s.px) || bad(s.py) || bad(s.hp) || bad(s.xp) || bad(s.aimX) || bad(s.aimY)) r.nan++;
                for (int i = 0; i < s.eprojN; i++) if (bad(s.eprojs[i].x) || bad(s.eprojs[i].y)) r.nan++;
                for (int i = 0; i < s.hazN; i++) if (bad(s.hazards[i].x) || bad(s.hazards[i].r)) r.nan++;
                for (int i = 0; i < s.pickN; i++) if (bad(s.picks[i].x) || bad(s.picks[i].value)) r.nan++;
                if (s.enemyN > WaveDirector.ENEMY_CAP + bosses) {
                    r.capBreak++;
                    if (r.firstProblem.isEmpty()) r.firstProblem = "cap " + s.enemyN + " at " + (int) s.time;
                }
                if (s.projN >= Sim.MAX_PROJ || s.pickN > Sim.MAX_PICK || s.enemyN >= Sim.MAX_ENEMIES || s.eprojN > Sim.MAX_EPROJ
                        || s.hazN > Sim.MAX_HAZ || ranged > Sim.RANGED_CAP + 6) {
                    r.overflow++;
                    if (r.firstProblem.isEmpty()) r.firstProblem = "pool at " + (int) s.time + " en=" + s.enemyN + " pr=" + s.projN + " pk=" + s.pickN;
                }
                r.bosses = Math.max(r.bosses, bosses);
                r.peakRanged = Math.max(r.peakRanged, ranged);
                if (r.nan > 0 && r.firstProblem.isEmpty()) r.firstProblem = "NaN at step " + step + " t=" + (int) s.time;
            }
            r.peakEnemies = Math.max(r.peakEnemies, s.enemyN);
            r.peakProj = Math.max(r.peakProj, s.projN);
            r.peakPick = Math.max(r.peakPick, s.pickN);
            if (s.pickN >= Sim.MAX_PICK) r.pickFull++;
            r.peakEProj = Math.max(r.peakEProj, s.eprojN);
            r.peakHaz = Math.max(r.peakHaz, s.hazN);
        }
        r.endTime = s.time;
        r.ended = s.ended;
        r.kills = s.kills;
        r.level = s.level;
        r.gold = s.gold;
        r.weapons = s.inv.weaponCount;
        r.dmg = s.dmgBy.clone();
        return r;
    }

    public static void main(String[] a) throws Exception {
        String stage = a[0], hero = a[1], policy = a[2];
        long seed = Long.parseLong(a[3]);
        double limit = a.length > 4 ? Double.parseDouble(a[4]) : 1800.0;
        long t0 = System.nanoTime();
        Result r = run(stage, hero, policy, seed, limit);
        System.out.println(r + "  [" + (System.nanoTime() - t0) / 1_000_000_000L + " s wall]");
    }
}
