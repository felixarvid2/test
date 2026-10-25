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
 * <li><b>plan</b>: mortal, like <b>mid</b> but goes for evolutions like a player does: the passive that a held weapon evolves with
 * (Offer def of a passive in the {@code evoSynergy} of an owned weapon) is taken before anything but a branch card.</li>
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
        /** Elites: spawn times and kills, boss sightings (key, spawn time, seconds alive until it died, -1 = still alive at the end), equipment worn at the end. */
        public final java.util.ArrayList<Double> eliteAt = new java.util.ArrayList<>();
        public final java.util.ArrayList<String> bossLog = new java.util.ArrayList<>();
        public final java.util.ArrayList<Double> bossTtk = new java.util.ArrayList<>();
        public int eliteKilled, worn, choices, crates, peakExtra;
        /** Health fraction of The First when the run ended (1 = untouched, 0 = dead, -1 = it never came). */
        public double firstHpLeft = -1;
        public boolean firstKilled;
        /** Level and kills at 5, 10 ... 30 minutes, the time any weapon first became an evolution (-1 = never), the weapons and main branch tiers at the end, worn gear points. */
        public final int[] lvlAt = new int[6], killsAt = new int[6];
        public final long[] xpAt = new long[6];
        public double firstEvo = -1;
        public String weaponsEnd = "", mainEnd = "", slotsEnd = "";
        public float gearPoints;
        /** Mean pickups and gems on the field over minutes 25 to 30 (sampled twice a second). */
        public double lateGems, latePick;
        private int lateN;

        @Override
        public String toString() {
            return String.format("%-5s %-9s %-8s seed %d  end=%s t=%.0fs kills=%d lvl=%d gold=%d peakEn=%d proj=%d pick=%d(full %ds) eproj=%d haz=%d ranged=%d bosses=%d w=%d nan=%d over=%d cap=%d dmg[c/b/a/x]=%.0f/%.0f/%.0f/%.0f elites=%d/%d worn=%d %s",
                    stage, hero, policy, seed, ended == 0 ? "alive" : ended == 1 ? "DIED" : "WON", endTime, kills, level, gold,
                    peakEnemies, peakProj, peakPick, pickFull / 60, peakEProj, peakHaz, peakRanged, bosses, weapons, nan, overflow, capBreak,
                    dmg[0], dmg[1], dmg[2], dmg[3], eliteKilled, eliteAt.size(), worn, firstProblem);
        }
    }

    /** Enemies a boss, an elite or a tentacle burst may add above the 300 of the waves (elite adds, raised colonists, hounds). */
    static final int SUMMON_SLACK = 30;
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

    private static boolean holdsSynergy(Inventory inv, se.felixarvid.thorsurvivors.data.WeaponDef w) {
        for (String p : w.evoSynergy) if (inv.hasPassive(p)) return true;
        return false;
    }

    /** True when a weapon in the inventory evolves with this passive. */
    private static boolean synergyOfOwned(Inventory inv, String passive) {
        for (int i = 0; i < inv.weaponCount; i++) {
            for (String p : inv.weapons[i].def.evoSynergy) if (p.equals(passive)) return true;
        }
        return false;
    }

    public static Result run(String stage, String hero, String policy, long seed, double limit) throws Exception {
        GameData d = data();
        Result r = new Result();
        r.stage = stage;
        r.hero = hero;
        r.policy = policy;
        r.seed = seed;
        boolean immortal = policy.equals("immortal"), naked = policy.equals("naked");
        boolean plan = policy.equals("plan");
        boolean noGear = "0".equals(System.getenv("GEAR")); // A/B: the same run without any equipment worn
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
            // a player fights the boss: walk toward it (to about 215 units) while the crowd around is thin
            float tx = 0, ty = 0;
            Enemy bossNow = s.bossNow;
            if (bossNow != null && crowd < 5) {
                float dx = bossNow.x - s.px, dy = bossNow.y - s.py, dd = (float) Math.sqrt(dx * dx + dy * dy) + 1e-3f;
                if (dd > 235f && dd < 900f) {
                    tx = dx / dd;
                    ty = dy / dd;
                }
            }
            // an equipment crate in reach is worth a short walk when the crowd is thin
            float qx = 0, qy = 0;
            if (crowd < 4) {
                float qd = 1e18f;
                for (int i = 0; i < s.pickN; i++) {
                    Entities.Pickup pk = s.picks[i];
                    if (pk.kind != Entities.K_EQUIP) continue;
                    float dx = pk.x - s.px, dy = pk.y - s.py, q = dx * dx + dy * dy;
                    if (q < qd && q < 500f * 500f) {
                        qd = q;
                        float m = (float) Math.sqrt(q) + 1e-3f;
                        qx = dx / m;
                        qy = dy / m;
                    }
                }
            }
            double a = s.time * 0.5;
            float mx = (float) Math.cos(a) * 0.3f + fx * 0.8f + cx * 0.7f + bx * 1.4f + hx2 + qx * 1.2f + tx * 0.9f;
            float my = (float) Math.sin(a) * 0.3f + fy * 0.8f + cy * 0.7f + by * 1.4f + hy2 + qy * 1.2f + ty * 0.9f;
            float ml = (float) Math.sqrt(mx * mx + my * my);
            if (ml > 1f) {
                mx /= ml;
                my /= ml;
            }
            boolean still = policy.equals("still");
            in.stickX = still ? 0f : mx;
            in.stickY = still ? 0f : my;
            Enemy aimAt = best;
            if (s.bossNow != null && Math.hypot(s.bossNow.x - s.px, s.bossNow.y - s.py) < 420) aimAt = s.bossNow; // a player aims at the boss
            if (aimAt != null) {
                float dx = aimAt.x - s.px, dy = aimAt.y - s.py, m = (float) Math.sqrt(dx * dx + dy * dy) + 1e-3f;
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
                        if (plan && c.def != null && c.def.powerUp && synergyOfOwned(s.inv, c.def.key)) sc = 55 + rng.nextInt(10);
                        // and puts the levels into a weapon whose evolution passive it already holds (7 levels to the maximum)
                        if (plan && c.kind == Offer.WEAPON_LEVEL && c.def != null && !c.def.evoSynergy.isEmpty() && holdsSynergy(s.inv, c.def)) sc = 57 + rng.nextInt(5);
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
            while (s.equipN > 0) { // the choice screen: the bot wears the better item
                s.resolveEquip(true);
                r.choices++;
            }
            trackEvents(s, r);
            if (noGear && s.equip.count() > 0) {
                s.equip.clear();
                s.recomputeAll();
            }
            for (int m = 0; m < 6; m++) if (r.lvlAt[m] == 0 && s.time >= (m + 1) * 300 - 0.001) {
                r.lvlAt[m] = s.level;
                r.killsAt[m] = s.kills;
                long tot = (long) s.xp;
                for (int l = 1; l < s.level; l++) tot += Progression.xpToNext(l);
                r.xpAt[m] = tot;
            }
            if (r.firstEvo < 0) for (int i = 0; i < s.inv.weaponCount; i++) if (s.inv.weapons[i].def.evolution) r.firstEvo = s.time;
            s.sound.clear();
            if (TRACE_FROM >= 0 && s.time >= TRACE_FROM && s.time <= TRACE_FROM + 40 && step % 30 == 0) {
                int[] hk = new int[6];
                for (int i = 0; i < s.hazN; i++) hk[s.hazards[i].kind]++;
                StringBuilder sb = new StringBuilder(String.format("t=%.1f hp=%.0f/%.0f pos=%.0f,%.0f en=%d bolts=%d haz=%d [slag %d cloud %d frost %d bomb %d lane %d] taken c/b/a/x=%.0f/%.0f/%.0f/%.0f", s.time, s.hp, s.maxHp, s.px, s.py,
                        s.enemyN, s.eprojN, s.hazN, hk[0], hk[1], hk[2], hk[3], hk[4], s.dmgBy[0], s.dmgBy[1], s.dmgBy[2], s.dmgBy[3]));
                for (int i = 0; i < s.enemyN; i++) {
                    Enemy e = s.enemies[i];
                    if (!e.boss) continue;
                    sb.append(String.format(" BOSS %s d=%.0f hp=%.0f ai=%d tele=%.2f", e.type.def.key, Math.hypot(e.x - s.px, e.y - s.py), e.hp, e.ai, e.tele));
                }
                System.out.println(sb);
            }
            // checks
            if (step % 30 == 0 && s.time >= 1500) {
                int g = 0;
                for (int i = 0; i < s.pickN; i++) if (s.picks[i].kind == Entities.K_GEM) g++;
                r.lateGems += g;
                r.latePick += s.pickN;
                r.lateN++;
            }
            if (step % 30 == 0) {
                int bosses = 0, ranged = 0, flagged = 0;
                for (int i = 0; i < s.enemyN; i++) {
                    Enemy e = s.enemies[i];
                    if (e.boss) bosses++;
                    if (e.boss || e.elite || e.type.arch == se.felixarvid.thorsurvivors.data.EnemyDef.ARCH_TENTACLE) flagged++;
                    if (e.type.ranged) ranged++;
                    if (bad(e.x) || bad(e.y) || bad(e.hp)) r.nan++;
                }
                if (bad(s.px) || bad(s.py) || bad(s.hp) || bad(s.xp) || bad(s.aimX) || bad(s.aimY)) r.nan++;
                for (int i = 0; i < s.eprojN; i++) if (bad(s.eprojs[i].x) || bad(s.eprojs[i].y)) r.nan++;
                for (int i = 0; i < s.hazN; i++) if (bad(s.hazards[i].x) || bad(s.hazards[i].r)) r.nan++;
                for (int i = 0; i < s.pickN; i++) if (bad(s.picks[i].x) || bad(s.picks[i].value)) r.nan++;
                // the waves stop at 300; bosses, elites, tentacles and what they summon (elite adds, Vire's colonists, hounds) are on top
                if (s.enemyN > WaveDirector.ENEMY_CAP + flagged + SUMMON_SLACK) {
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
        if (r.lateN > 0) {
            r.lateGems /= r.lateN;
            r.latePick /= r.lateN;
        }
        r.endTime = s.time;
        r.ended = s.ended;
        r.kills = s.kills;
        r.level = s.level;
        r.gold = s.gold;
        r.weapons = s.inv.weaponCount;
        r.dmg = s.dmgBy.clone();
        StringBuilder wb = new StringBuilder();
        for (int i = 0; i < s.inv.weaponCount; i++) wb.append(s.inv.weapons[i].def.key).append(i + 1 < s.inv.weaponCount ? "," : "");
        r.weaponsEnd = wb.toString();
        StringBuilder pb = new StringBuilder();
        for (int i = 0; i < s.inv.weaponCount; i++) pb.append(s.inv.weapons[i].def.key).append(':').append(s.inv.weapons[i].level).append(' ');
        for (int i = 0; i < s.inv.passiveCount; i++) pb.append(s.inv.passives[i].def.key).append(':').append(s.inv.passives[i].level).append(' ');
        r.slotsEnd = pb.toString().trim();
        StringBuilder mb = new StringBuilder();
        if (s.main != null) for (int t : s.main.tier) mb.append(t);
        r.mainEnd = mb.toString();
        for (int i = 0; i < s.equip.def.length; i++) if (s.equip.def[i] != null) r.gearPoints += Equipment.value(d, s.equip.rar[i]);
        return r;
    }

    private static int[] bossId = new int[16];
    private static int bossN;
    private static double[] bossT0 = new double[16];
    private static String[] bossKey = new String[16];
    private static int lastElite, eliteKills;

    /** Logs elite spawns and boss lives (first seen to gone) of the run. */
    private static void trackEvents(Sim s, Result r) {
        if (s.time < 0.05) {
            bossN = 0;
            lastElite = 0;
        }
        if (s.eliteSpawned > lastElite) {
            lastElite = s.eliteSpawned;
            r.eliteAt.add(s.time);
        }
        r.eliteKilled = s.eliteKilled;
        r.firstKilled = s.firstKilled;
        if (s.firstKilled) r.firstHpLeft = 0;
        for (int i = 0; i < s.enemyN; i++) if (s.enemies[i].boss && s.enemies[i].type.pattern == 5 && !s.enemies[i].dead) r.firstHpLeft = s.enemies[i].hp / s.enemies[i].maxHp;
        r.worn = s.equip.count();
        int extra = 0;
        for (int i = 0; i < s.enemyN; i++) {
            Enemy e = s.enemies[i];
            if (e.boss || e.elite || e.type.arch == se.felixarvid.thorsurvivors.data.EnemyDef.ARCH_TENTACLE) extra++;
            if (!e.boss || e.dead) continue;
            boolean known = false;
            for (int k = 0; k < bossN; k++) if (bossId[k] == e.id) known = true;
            if (!known && bossN < bossId.length) {
                bossId[bossN] = e.id;
                bossT0[bossN] = s.time;
                bossKey[bossN++] = e.type.def.key;
            }
        }
        r.peakExtra = Math.max(r.peakExtra, extra);
        for (int k = bossN - 1; k >= 0; k--) {
            boolean alive = false;
            for (int i = 0; i < s.enemyN; i++) if (s.enemies[i].id == bossId[k] && !s.enemies[i].dead) alive = true;
            if (alive) continue;
            r.bossLog.add(bossKey[k]);
            r.bossTtk.add(s.time - bossT0[k]);
            bossN--;
            bossId[k] = bossId[bossN];
            bossT0[k] = bossT0[bossN];
            bossKey[k] = bossKey[bossN];
        }
    }

    public static void main(String[] a) throws Exception {
        String stage = a[0], hero = a[1], policy = a[2];
        long seed = Long.parseLong(a[3]);
        double limit = a.length > 4 ? Double.parseDouble(a[4]) : 1800.0;
        long t0 = System.nanoTime();
        Result r = run(stage, hero, policy, seed, limit);
        System.out.println(r + "  [" + (System.nanoTime() - t0) / 1_000_000_000L + " s wall]");
        System.out.println("  lvlAt " + java.util.Arrays.toString(r.lvlAt) + " killsAt " + java.util.Arrays.toString(r.killsAt) + " xpAt " + java.util.Arrays.toString(r.xpAt) + " firstEvo " + (int) r.firstEvo
                + " slots [" + r.slotsEnd + "] weapons " + r.weaponsEnd + " tiers " + r.mainEnd + " gear " + r.gearPoints + String.format(" lateGems %.0f latePick %.0f", r.lateGems, r.latePick));
        System.out.println("  elites at " + r.eliteAt + " bosses " + r.bossLog + " ttk " + r.bossTtk + " firstHpLeft " + r.firstHpLeft);
    }
}
