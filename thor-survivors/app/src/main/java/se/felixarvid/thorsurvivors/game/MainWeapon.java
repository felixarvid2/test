package se.felixarvid.thorsurvivors.game;

import se.felixarvid.thorsurvivors.data.BranchDef;
import se.felixarvid.thorsurvivors.data.HeroDef;
import se.felixarvid.thorsurvivors.data.MainWeaponDef;
import se.felixarvid.thorsurvivors.game.Entities.Enemy;
import se.felixarvid.thorsurvivors.game.Entities.Projectile;

import java.util.HashMap;
import java.util.Map;

/**
 * A hero's main weapon (design section 2.1 and 2.2): always owned, outside the 6 weapon slots, fired automatically
 * toward {@link Sim#aimX}/{@link Sim#aimY}, using the VS stat pipeline (might, area, cooldown, amount, speed, crit).
 *
 * <ul>
 * <li>Bastion, Hydraulic Hammer: cone swing, every {@code slamEvery}-th swing a Slam circle with a stun.</li>
 * <li>Spectre, Twin Pistols: a fan of bullets (a heavy slug with Piercing Shot).</li>
 * <li>Xenomant, Lumen Caster: a piercing bolt, every {@code burstEvery}-th cast a ring of 6 smaller bolts.</li>
 * </ul>
 * Branch tiers ({@link #pick}) change the parameters by key (data: {@code mainWeapons.*.branches[].tiers[].mods}); the
 * effective numbers are recomputed by {@link #sync} on picks and stat changes, never per frame. Everything here runs on
 * the pools of {@link Sim}: nothing is allocated while updating.
 *
 * Burn, Decay and Stun go through {@link Sim#applyStatus} (see {@link Status}); Riot Guard II reflects enemy projectiles
 * that a swing or slam reaches ({@link EnemyAi#reflectCone}). Approximation left: Parasite Link damages both ends
 * instead of sharing damage.
 */
public final class MainWeapon {
    public static final int MAX_LINKS = 6;
    private static final float DEG = (float) (Math.PI / 180.0), TAU = (float) (Math.PI * 2.0);
    /** Seconds the first attack comes after the run starts. */
    private static final float FIRST_DELAY = 0.5f;
    /** Seconds an Atk clip lasts when picked by the renderer (the clip is squeezed into this). */
    public static final float CLIP_TIME = 0.4f;

    final Sim s;
    public final HeroDef hero;
    public final MainWeaponDef def;
    /** Picked tier (0 = none, 1..3) per branch, in the data order of {@code def.branches}. */
    public final int[] tier = new int[MainWeaponDef.BRANCHES];
    private final HashMap<String, Double> eff = new HashMap<>();

    // ---- effective numbers (sync)
    public float dmg, interval, critChance, critMul;
    private float area, spd, knock;
    private int amountBonus;
    // hammer
    private float arc, radius, slamDmg, slamRadius, slamStun, lineDmg, lineLen, thrustArc, thrustRange, thrustDmg,
            thrustCrit, waveLen, waveDmg, guard, guardTime;
    private int slamEvery, burnN;
    private boolean thrustOn, thrustDecay, slamHeal, reflect;
    // pistols
    private float spread, bulletSpeed, range, slugDmg, explodeR, explodeDmg, critRefund, grenadeDmg, grenadeR,
            grenadeRange, bombletDmg, bombletR, firePatch;
    private int bullets, pierce, ringEvery, ringCount, grenadeEvery, bomblets;
    private boolean slugOn, slugExplode, ringOn, grenadeBurn;
    // caster
    private float boltSpeed, boltR, burstDmg, burstSpeed, burstRange, dartDmg, tendrilRadius, tendrilRoot, tendrilDmg,
            tendrilPull, linkTime, linkDmg, linkHeal, beamLen, beamTime, beamTick, beamDmg, beamWidth, beamGround;
    private int boltPierce, decayN, burstEvery, burstCount, darts, dartPierce, tendrilEvery, beamPierce;
    private boolean dartDecay, link, linkJump, beam;

    // ---- runtime
    public float cd;
    /** Attacks since the run began (swings, volleys, casts): the "every Nth" rules count them. */
    public int count;
    private float healTokens = 5f, healAcc;
    /** Parasite Link: pairs of enemies (an Enemy plus the id it had when linked) and the seconds left. */
    public int linkN;
    public final Enemy[] linkA = new Enemy[MAX_LINKS], linkB = new Enemy[MAX_LINKS];
    public final int[] linkIdA = new int[MAX_LINKS], linkIdB = new int[MAX_LINKS];
    public final float[] linkT = new float[MAX_LINKS];
    /** Wrath of Lumen: seconds of beam left (the renderer draws it from the live aim) and its length and half width. */
    public float beamT;
    private float beamTickT;
    public float beamDrawLen, beamDrawHalfW;
    private final int[] bidx = new int[64];
    private final float[] bkey = new float[64];

    MainWeapon(Sim s, HeroDef hero, MainWeaponDef def) {
        this.s = s;
        this.hero = hero;
        this.def = def;
        cd = FIRST_DELAY; // numbers come from the first Sim.recomputeAll()
    }

    // ------------------------------------------------------------------ branches

    public BranchDef branch(int i) {
        return i < def.branches.size() ? def.branches.get(i) : null;
    }

    /** Takes tier {@code t} of branch {@code b}; only the next tier of a branch is valid. */
    public boolean pick(int b, int t) {
        if (b < 0 || b >= def.branches.size() || t != tier[b] + 1 || t > BranchDef.TIERS) return false;
        tier[b] = t;
        sync();
        return true;
    }

    public int tiersTaken() {
        int n = 0;
        for (int t : tier) n += t;
        return n;
    }

    private float v(String k) {
        Double d = eff.get(k);
        return d == null ? 0f : d.floatValue();
    }

    /** Rebuilds the effective numbers from the data, the picked tiers and the player's stats. */
    void sync() {
        PlayerStats st = s.stats;
        double mightMain = st.might * st.mainDamage; // equipment: main weapon damage (Hydraulic Knuckles, Fist of Kharos)
        eff.clear();
        eff.putAll(def.params);
        eff.put("critMul", hero.critMul);
        eff.put("interval", def.interval);
        for (int b = 0; b < def.branches.size() && b < tier.length; b++) {
            BranchDef bd = def.branches.get(b);
            for (int t = 0; t < tier[b] && t < bd.tiers.length; t++) {
                for (Map.Entry<String, Double> e : bd.tiers[t].mods.entrySet()) {
                    String k = e.getKey();
                    if (k.endsWith("Add")) {
                        Double cur = eff.get(k);
                        eff.put(k, (cur == null ? 0.0 : cur) + e.getValue());
                    } else {
                        eff.put(k, e.getValue());
                    }
                }
            }
        }
        area = (float) (st.areaMul * st.mainSize);
        spd = (float) st.speedMul;
        amountBonus = st.amountBonus;
        dmg = (float) (def.power * 10.0 * mightMain);
        interval = Math.max(0.2f, (float) (v("interval") / 1000.0 * (1.0 + v("intervalAdd")) * st.cooldownMul));
        critChance = (float) ((st.critChance + v("critAdd")) * (1.0 + st.luck));
        critMul = v("critMul");
        knock = (float) def.knockback;
        // hammer
        arc = v("arc") * DEG;
        radius = v("radius");
        slamEvery = Math.max(1, Math.round(v("slamEvery")));
        slamDmg = v("slamPower") * 10f * (float) mightMain;
        slamRadius = v("slamRadius") * (1f + v("slamRadiusMul"));
        slamStun = v("slamStun");
        slamHeal = v("slamHeal") > 0;
        lineDmg = v("linePower") * 10f * (float) mightMain;
        lineLen = v("lineLen");
        burnN = Math.round(v("burn"));
        thrustOn = v("thrust") > 0;
        thrustArc = v("thrustArc") * DEG;
        thrustRange = v("thrustRange");
        thrustDmg = v("thrustPower") * 10f * (float) mightMain;
        thrustCrit = v("thrustCrit");
        thrustDecay = v("thrustDecay") > 0;
        waveLen = v("wave");
        waveDmg = v("wavePower") * dmg;
        guard = v("guard");
        guardTime = v("guardTime");
        reflect = v("reflect") > 0;
        // pistols
        bullets = Math.max(1, Math.round(v("bullets") + v("bulletsAdd")));
        spread = v("spread") * DEG;
        bulletSpeed = v("speed");
        range = v("range");
        pierce = Math.round(v("pierce"));
        slugOn = v("slug") > 0;
        slugDmg = v("slugPower") * 10f * (float) mightMain;
        slugExplode = v("slugExplode") > 0;
        explodeR = v("explodeRadius");
        explodeDmg = v("explodePower") * 10f * (float) mightMain;
        ringOn = v("ring") > 0;
        ringEvery = Math.max(1, Math.round(v("ringEvery")));
        ringCount = Math.max(1, Math.round(v("ringCount")));
        critRefund = v("critRefund");
        grenadeEvery = Math.round(v("grenadeEvery"));
        grenadeDmg = v("grenadePower") * 10f * (float) mightMain;
        grenadeR = v("grenadeRadius");
        grenadeRange = v("grenadeRange");
        bomblets = Math.round(v("bomblets"));
        bombletDmg = v("bombletPower") * 10f * (float) mightMain;
        bombletR = v("bombletRadius");
        grenadeBurn = v("grenadeBurn") > 0;
        firePatch = v("firePatch");
        // caster
        boltSpeed = v("speed");
        boltPierce = Math.round(v("pierce"));
        boltR = v("boltRadius");
        decayN = Math.round(v("decay"));
        burstEvery = Math.max(1, Math.round(v("burstEvery")));
        burstCount = Math.max(1, Math.round(v("burstCount")));
        burstDmg = v("burstPower") * 10f * (float) mightMain;
        burstSpeed = v("burstSpeed");
        burstRange = v("burstRange");
        darts = Math.round(v("darts"));
        dartDmg = v("dartPower") * 10f * (float) mightMain;
        dartPierce = Math.round(v("dartPierce"));
        dartDecay = v("dartDecay") > 0;
        tendrilEvery = Math.round(v("tendrilEvery"));
        tendrilRadius = v("tendrilRadius");
        tendrilRoot = v("tendrilRoot");
        tendrilDmg = v("tendrilPower") * 10f * (float) mightMain;
        tendrilPull = v("tendrilPull");
        link = v("link") > 0;
        linkTime = v("linkTime");
        linkDmg = v("linkPower") * 10f * (float) mightMain;
        linkHeal = v("linkHeal");
        linkJump = v("linkJump") > 0;
        beam = v("beam") > 0;
        beamLen = v("beamLen");
        beamTime = v("beamTime");
        beamTick = Math.max(0.05f, v("beamTick"));
        beamDmg = v("beamPower") * 10f * (float) mightMain;
        beamWidth = v("beamWidth");
        beamPierce = Math.round(v("beamPierce"));
        beamGround = v("beamGround");
    }

    /** Spore Burst / Slam / thrust numbers the tests and the HUD read. */
    public int slamEvery() {
        return slamEvery;
    }

    public int bulletCount() {
        return slugOn ? 1 + amountBonus : bullets + amountBonus;
    }

    public float arcDegrees() {
        return arc / DEG;
    }

    public float reach() {
        return radius * area;
    }

    public float slamReach() {
        return slamRadius * area;
    }

    public float guardReduction() {
        return guard;
    }

    // ------------------------------------------------------------------ update

    void update(float dt) {
        if (healTokens < 5f) healTokens = Math.min(5f, healTokens + 5f * dt);
        tickLinks(dt);
        tickBeam(dt);
        cd -= dt;
        if (cd > 0f) return;
        cd += interval;
        if (cd < 0f) cd = interval;
        switch (def.kind) {
            case MainWeaponDef.CONE: swing(); break;
            case MainWeaponDef.VOLLEY: volley(); break;
            default: cast();
        }
    }

    private void attacked(int clip) {
        s.lastMainAttack = s.tNow;
        s.mainClip = clip;
        s.lastAttack = s.tNow;
    }

    // ------------------------------------------------------------------ Bastion: Hydraulic Hammer

    private void swing() {
        count++;
        float a = (float) Math.atan2(s.aimY, s.aimX);
        boolean slam = count % slamEvery == 0;
        if (slam) {
            slam(a);
            attacked(Sim.AC_SLAM);
        } else {
            int n = 1 + amountBonus; // extra swings fan out evenly around the hero
            for (int k = 0; k < n; k++) {
                float ang = a + k * TAU / n;
                cone(ang, arc, radius * area, dmg, critChance, burnN, false);
                swingFx(ang, radius * area, arc);
                if (reflect) s.ai.reflectCone(ang, arc, radius * area, dmg);
            }
            s.sound.emit(SoundEvents.HAMMER_SWING);
            attacked((count & 1) == 0 ? Sim.AC_ATTACK2 : Sim.AC_ATTACK);
        }
        if (thrustOn && count % 3 == 0) {
            cone(a, thrustArc, thrustRange * area, thrustDmg, critChance + thrustCrit, burnN, thrustDecay);
            Entities.Effect f = s.addFx(Entities.FX_THRUST, s.px, s.py, thrustRange * area, thrustArc, 0.18f, 0, false);
            f.a = a;
        }
        if (waveLen > 0f) wave(a);
        if (reflect && slam) s.ai.reflectRing(slamRadius * area, dmg);
        if (guard > 0f) {
            s.guardT = guardTime;
            s.guardDR = guard;
        }
    }

    private void swingFx(float ang, float reach, float arcRad) {
        Entities.Effect f = s.addFx(Entities.FX_SWING, s.px, s.py, reach, arcRad, 0.2f, 0, burnN > 0);
        f.a = ang;
    }

    /** Hits every enemy inside the cone (apex at the hero, direction ang, full angle arc, reach); returns the hit count. */
    int cone(float ang, float arcRad, float reach, float dmgv, float chance, int burn, boolean decayTip) {
        float ax = (float) Math.cos(ang), ay = (float) Math.sin(ang), half = arcRad / 2f;
        int n = s.query(s.px, s.py, reach + 40f);
        int hits = 0;
        for (int k = 0; k < n; k++) {
            Enemy e = s.enemies[s.qbuf[k]];
            if (e.dead) continue;
            float dx = e.x - s.px, dy = e.y - s.py;
            float d = (float) Math.sqrt(dx * dx + dy * dy);
            if (d > reach + e.radius) continue;
            if (d > 14f) { // an enemy on top of the hero is always hit; otherwise its centre (widened by its body) must be in the cone
                float slack = (float) Math.atan2(e.radius * 0.6f, d);
                float cosA = (dx * ax + dy * ay) / d;
                if (cosA < (float) Math.cos(Math.min((float) Math.PI, half + slack))) continue;
            }
            if (d < 0.01f) d = 0.01f;
            s.hurt(e, dmgv, chance, critMul, dx / d, dy / d, knock);
            if (burn > 0) s.applyStatus(e, Entities.ST_BURN, burn, dmgv, 2.5f);
            if (decayTip) s.applyStatus(e, Entities.ST_DECAY, 1, dmgv, 3f);
            hits++;
        }
        s.hitDest(s.px + ax * reach * 0.5f, s.py + ay * reach * 0.5f, reach * 0.5f);
        return hits;
    }

    private void slam(float a) {
        float r = slamRadius * area;
        s.sound.emit(SoundEvents.HAMMER_SLAM);
        int n = s.query(s.px, s.py, r + 40f);
        for (int k = 0; k < n; k++) {
            Enemy e = s.enemies[s.qbuf[k]];
            if (e.dead) continue;
            float dx = e.x - s.px, dy = e.y - s.py;
            float d = (float) Math.sqrt(dx * dx + dy * dy) + 0.01f;
            if (d > r + e.radius) continue;
            s.hurt(e, slamDmg, critChance, critMul, dx / d, dy / d, knock);
            s.stun(e, slamStun);
            if (burnN > 0) s.applyStatus(e, Entities.ST_BURN, burnN, slamDmg, 2.5f);
            if (slamHeal && e.dead && healTokens >= 1f) {
                healTokens -= 1f;
                s.heal(1f);
            }
        }
        s.hitDest(s.px, s.py, r);
        s.addFx(Entities.FX_SLAM, s.px, s.py, r, 0f, 0.4f, 0, burnN > 0);
        if (lineDmg > 0f) { // Seismic II: a shock line along the aim
            float len = lineLen * area;
            lineHit(a, len, 22f, lineDmg);
            Entities.Effect f = s.addFx(Entities.FX_LINE, s.px, s.py, len, 22f, 0.35f, 0, false);
            f.a = a;
        }
    }

    /** Hits every enemy within halfW of the segment from the hero along angle a, of length len. */
    private void lineHit(float a, float len, float halfW, float dmgv) {
        float ax = (float) Math.cos(a), ay = (float) Math.sin(a);
        int n = s.query(s.px + ax * len / 2f, s.py + ay * len / 2f, len / 2f + 40f);
        for (int k = 0; k < n; k++) {
            Enemy e = s.enemies[s.qbuf[k]];
            if (e.dead) continue;
            float dx = e.x - s.px, dy = e.y - s.py;
            float t = dx * ax + dy * ay, perp = Math.abs(dx * ay - dy * ax);
            if (t < -e.radius || t > len + e.radius || perp > halfW + e.radius * 0.8f) continue;
            s.hurt(e, dmgv, critChance, critMul, ax, ay, knock * 0.5f);
        }
    }

    private void wave(float a) {
        Projectile p = proj(Entities.SUB_WAVE);
        if (p == null) return;
        float sp = 320f;
        p.x = s.px + (float) Math.cos(a) * 30f;
        p.y = s.py + (float) Math.sin(a) * 30f;
        p.vx = (float) Math.cos(a) * sp;
        p.vy = (float) Math.sin(a) * sp;
        p.angle = a;
        p.life = p.maxLife = waveLen / sp;
        p.radius = 26f * area;
        p.dmg = waveDmg;
        p.hitsLeft = 100000;
        p.status = Entities.ST_BURN;
        p.statusN = 1;
    }

    // ------------------------------------------------------------------ Spectre: Twin Pistols

    private void volley() {
        count++;
        float a = (float) Math.atan2(s.aimY, s.aimX);
        boolean throwing = false;
        if (slugOn) {
            int n = 1 + amountBonus;
            for (int i = 0; i < n; i++) shoot(a + fan(i, n, 4f * DEG), Entities.SUB_SLUG);
            throwing = true;
        } else if (ringOn && count % ringEvery == 0) {
            for (int i = 0; i < ringCount; i++) shoot(a + i * TAU / ringCount, Entities.SUB_BULLET);
        } else {
            int n = bullets + amountBonus;
            for (int i = 0; i < n; i++) shoot(a + fan(i, n, spread), Entities.SUB_BULLET);
        }
        if (grenadeEvery > 0 && count % grenadeEvery == 0) {
            lob(a);
            throwing = true;
        }
        s.sound.emit(SoundEvents.PISTOL_SHOT);
        Entities.Effect f = s.addFx(Entities.FX_MUZZLE, s.px + (float) Math.cos(a) * 16f, s.py + (float) Math.sin(a) * 16f,
                slugOn ? 70f : 46f, 0f, 0.09f, 0, false);
        f.a = a;
        attacked(throwing ? Sim.AC_THROW : Sim.AC_SHOOT);
    }

    /** Angle offset of bullet i of n spread evenly across +-half (0 for a single one). */
    static float fan(int i, int n, float half) {
        return n <= 1 ? 0f : -half + 2f * half * i / (n - 1);
    }

    private void shoot(float ang, int sub) {
        Projectile p = proj(sub);
        if (p == null) return;
        boolean slug = sub == Entities.SUB_SLUG;
        float sp = (slug ? 700f : bulletSpeed) * spd, rg = slug ? 480f : range;
        float cx = (float) Math.cos(ang), cy = (float) Math.sin(ang);
        p.x = s.px + cx * 12f;
        p.y = s.py + cy * 12f;
        p.vx = cx * sp;
        p.vy = cy * sp;
        p.angle = ang;
        p.life = p.maxLife = rg / sp;
        p.radius = (slug ? 8f : 5f) * Math.max(0.8f, area);
        p.dmg = slug ? slugDmg : dmg;
        p.hitsLeft = slug ? 100000 : 1 + pierce;
        if (slug && slugExplode) {
            p.blast = explodeR * area;
            p.blastDmg = explodeDmg;
        }
    }

    /** Cluster Grenade: an inert projectile that flies to a point {@code grenadeRange} away and explodes there. */
    private void lob(float a) {
        Projectile p = proj(Entities.SUB_GRENADE);
        if (p == null) return;
        float flight = 0.5f, sp = grenadeRange / flight;
        p.vx = (float) Math.cos(a) * sp;
        p.vy = (float) Math.sin(a) * sp;
        p.x = s.px;
        p.y = s.py;
        p.angle = a;
        p.life = p.maxLife = flight;
        p.inert = true;
        p.blast = grenadeR * area;
        p.blastDmg = grenadeDmg;
        if (grenadeBurn) {
            p.status = Entities.ST_BURN;
            p.statusN = 1;
        }
    }

    /** End of life of a projectile with a blast: damages everything in the radius, then bomblets / fire patch. */
    void explode(Projectile p) {
        float r = p.blast;
        if (r <= 0f) return;
        int n = s.query(p.x, p.y, r + 40f);
        for (int k = 0; k < n; k++) {
            Enemy e = s.enemies[s.qbuf[k]];
            if (e.dead) continue;
            float dx = e.x - p.x, dy = e.y - p.y;
            float d = (float) Math.sqrt(dx * dx + dy * dy) + 0.01f;
            if (d > r + e.radius * 0.5f) continue;
            s.hurt(e, p.blastDmg, p.critChance, p.critMul, dx / d, dy / d, 1f);
            if (p.status == Entities.ST_BURN) s.applyStatus(e, Entities.ST_BURN, p.statusN, p.blastDmg, 2.5f);
        }
        s.hitDest(p.x, p.y, r);
        s.addFx(Entities.FX_BLAST, p.x, p.y, r, 1f, 0.3f, 0, false);
        if (p.sub != Entities.SUB_GRENADE) return;
        float base = s.rng.nextFloat() * TAU;
        for (int i = 0; i < bomblets; i++) {
            Projectile b = proj(Entities.SUB_BOMBLET);
            if (b == null) break;
            float ang = base + i * TAU / Math.max(1, bomblets), flight = 0.3f, sp = 70f / flight;
            b.x = p.x;
            b.y = p.y;
            b.vx = (float) Math.cos(ang) * sp;
            b.vy = (float) Math.sin(ang) * sp;
            b.angle = ang;
            b.life = b.maxLife = flight;
            b.inert = true;
            b.blast = bombletR * area;
            b.blastDmg = bombletDmg;
            b.status = p.status;
            b.statusN = p.statusN;
        }
        if (firePatch > 0f) patch(p.x, p.y, r * 0.8f, firePatch, Entities.SUB_PATCH_FIRE, dmg * 0.4f, Entities.ST_BURN);
    }

    /** A ground patch (fire or lumen ground): a flask-style puddle with no flight that ticks damage and a status. */
    private void patch(float x, float y, float r, float seconds, int sub, float tickDmg, int status) {
        Projectile p = proj(sub);
        if (p == null) return;
        p.kind = Entities.P_PUDDLE;
        p.x = x;
        p.y = y;
        p.radius = r;
        p.life = p.maxLife = seconds;
        p.flight = 0f;
        p.hitDelay = 0.5f;
        p.dmg = tickDmg;
        p.knock = 0f;
        p.hitsLeft = 1 << 30;
        p.status = status;
        p.statusN = 1;
    }

    // ------------------------------------------------------------------ Xenomant: Lumen Caster

    private void cast() {
        count++;
        float a = (float) Math.atan2(s.aimY, s.aimX);
        boolean burst = count % burstEvery == 0;
        boolean tendril = tendrilEvery > 0 && count % tendrilEvery == 0;
        if (beam) {
            beamT = beamTime;
            beamTickT = 0f;
            beamDrawLen = beamLen * area;
            beamDrawHalfW = beamWidth * area;
        } else {
            int n = 1 + amountBonus;
            for (int i = 0; i < n; i++) bolt(a + fan(i, n, 12f * DEG * (n - 1) / 2f), Entities.SUB_BOLT);
        }
        for (int k = 0; k < darts; k++) {
            float off = (k % 2 == 0 ? 1f : -1f) * (24f + 14f * (k / 2)) * DEG;
            bolt(a + off, Entities.SUB_DART);
        }
        s.sound.emit(SoundEvents.CASTER_BOLT);
        if (burst) {
            for (int i = 0; i < burstCount; i++) bolt(a + i * TAU / burstCount, Entities.SUB_BURST);
            s.sound.emit(SoundEvents.SPORE_BURST);
            s.addFx(Entities.FX_BURST, s.px, s.py, burstRange, 0f, 0.45f, 0, false);
        }
        if (tendril) tendril(a);
        attacked(tendril ? Sim.AC_SLAM : burst || beam ? Sim.AC_CAST2 : Sim.AC_CAST);
    }

    private void bolt(float ang, int sub) {
        Projectile p = proj(sub);
        if (p == null) return;
        float cx = (float) Math.cos(ang), cy = (float) Math.sin(ang);
        float sp;
        switch (sub) {
            case Entities.SUB_BURST:
                sp = burstSpeed * spd;
                p.dmg = burstDmg;
                p.radius = 7f * Math.max(0.8f, area);
                p.life = p.maxLife = burstRange / sp;
                p.hitsLeft = 1;
                break;
            case Entities.SUB_DART:
                sp = 330f * spd;
                p.dmg = dartDmg;
                p.radius = 5f * Math.max(0.8f, area);
                p.life = p.maxLife = 1.6f;
                p.hitsLeft = 1 + dartPierce;
                if (dartDecay) {
                    p.status = Entities.ST_DECAY;
                    p.statusN = 1;
                }
                break;
            default: // SUB_BOLT
                sp = boltSpeed * spd;
                p.dmg = dmg;
                p.radius = boltR * Math.max(0.8f, area);
                p.life = p.maxLife = 1.4f;
                p.hitsLeft = 1 + boltPierce;
                if (decayN > 0) {
                    p.status = Entities.ST_DECAY;
                    p.statusN = decayN;
                }
        }
        p.x = s.px + cx * 14f;
        p.y = s.py + cy * 14f;
        p.vx = cx * sp;
        p.vy = cy * sp;
        p.angle = ang;
    }

    /** Grasping Tendrils: a slam at the aim point (an enemy near the aim line, at most 200 away) that roots and pulls. */
    private void tendril(float a) {
        float ax = (float) Math.cos(a), ay = (float) Math.sin(a);
        float tx = s.px + ax * 140f, ty = s.py + ay * 140f, best = 1e9f;
        int n = s.query(s.px + ax * 100f, s.py + ay * 100f, 140f);
        float cosLim = (float) Math.cos(35f * DEG);
        for (int k = 0; k < n; k++) {
            Enemy e = s.enemies[s.qbuf[k]];
            if (e.dead) continue;
            float dx = e.x - s.px, dy = e.y - s.py, d = (float) Math.sqrt(dx * dx + dy * dy) + 0.01f;
            if (d > 200f || (dx * ax + dy * ay) / d < cosLim || d >= best) continue;
            best = d;
            tx = e.x;
            ty = e.y;
        }
        float r = tendrilRadius * area;
        n = s.query(tx, ty, r + 40f);
        for (int k = 0; k < n; k++) {
            Enemy e = s.enemies[s.qbuf[k]];
            if (e.dead) continue;
            float dx = e.x - tx, dy = e.y - ty, d = (float) Math.sqrt(dx * dx + dy * dy) + 0.01f;
            if (d > r + e.radius * 0.5f) continue;
            s.hurt(e, tendrilDmg, critChance, critMul, 0f, 0f, 0f);
            s.root(e, tendrilRoot);
            if (tendrilPull > 0f && !e.boss) {
                float pull = Math.min(tendrilPull, d);
                e.x -= dx / d * pull;
                e.y -= dy / d * pull;
            }
        }
        s.addFx(Entities.FX_TENDRIL, tx, ty, r, 0f, 0.7f, 0, false);
    }

    // ---- Wrath of Lumen beam

    private void tickBeam(float dt) {
        if (beamT <= 0f) return;
        beamT -= dt;
        beamTickT -= dt;
        while (beamTickT <= 0f) {
            beamTickT += beamTick;
            beamHit();
        }
        if (beamT <= 0f) {
            beamT = 0f;
            if (beamGround > 0f) { // lumen ground along the beam
                for (int i = 1; i <= 3; i++) {
                    float d = beamDrawLen * (0.1f + 0.3f * i);
                    patch(s.px + s.aimX * d, s.py + s.aimY * d, 40f * area, beamGround, Entities.SUB_PATCH_DECAY, dmg * 0.25f,
                            Entities.ST_DECAY);
                }
            }
        }
    }

    private void beamHit() {
        float ax = s.aimX, ay = s.aimY, len = beamDrawLen, halfW = beamDrawHalfW;
        int n = s.query(s.px + ax * len / 2f, s.py + ay * len / 2f, len / 2f + 40f), m = 0;
        for (int k = 0; k < n && m < bidx.length; k++) {
            Enemy e = s.enemies[s.qbuf[k]];
            if (e.dead) continue;
            float dx = e.x - s.px, dy = e.y - s.py;
            float t = dx * ax + dy * ay, perp = Math.abs(dx * ay - dy * ax);
            if (t < -e.radius || t > len + e.radius || perp > halfW + e.radius * 0.8f) continue;
            bidx[m] = s.qbuf[k];
            bkey[m++] = t;
        }
        int take = Math.min(m, beamPierce);
        for (int i = 0; i < take; i++) { // the nearest `take` along the beam, by partial selection
            int b = i;
            for (int j = i + 1; j < m; j++) if (bkey[j] < bkey[b]) b = j;
            int ti = bidx[i]; bidx[i] = bidx[b]; bidx[b] = ti;
            float tk = bkey[i]; bkey[i] = bkey[b]; bkey[b] = tk;
            Enemy e = s.enemies[bidx[i]];
            s.hurt(e, beamDmg, critChance, critMul, ax, ay, 0.2f);
        }
    }

    // ---- Parasite Link

    /** A bolt hit {@code e}: tether it to the nearest other enemy (Parasite Link). */
    private void linkFrom(Enemy e) {
        Enemy other = nearestOther(e, 170f);
        if (other == null) return;
        for (int i = 0; i < linkN; i++) { // already linked pair: just refresh
            if ((linkIdA[i] == e.id && linkIdB[i] == other.id) || (linkIdA[i] == other.id && linkIdB[i] == e.id)) {
                linkT[i] = linkTime;
                return;
            }
        }
        int i = linkN < MAX_LINKS ? linkN++ : 0; // full: the oldest slot is replaced
        linkA[i] = e;
        linkB[i] = other;
        linkIdA[i] = e.id;
        linkIdB[i] = other.id;
        linkT[i] = linkTime;
    }

    private Enemy nearestOther(Enemy e, float maxD) {
        Enemy best = null;
        float bd = maxD * maxD;
        for (int i = 0; i < s.enemyN; i++) {
            Enemy o = s.enemies[i];
            if (o == e || o.dead) continue;
            float dx = o.x - e.x, dy = o.y - e.y, d = dx * dx + dy * dy;
            if (d < bd) {
                bd = d;
                best = o;
            }
        }
        return best;
    }

    private void tickLinks(float dt) {
        for (int i = linkN - 1; i >= 0; i--) {
            linkT[i] -= dt;
            boolean aOk = linkA[i].id == linkIdA[i] && !linkA[i].dead, bOk = linkB[i].id == linkIdB[i] && !linkB[i].dead;
            if (linkT[i] <= 0f || (!aOk && !bOk)) {
                removeLink(i);
                continue;
            }
            if (!aOk || !bOk) { // one end died
                Enemy keep = aOk ? linkA[i] : linkB[i];
                Enemy other = linkJump ? nearestOther(keep, 200f) : null;
                if (other == null) {
                    removeLink(i);
                    continue;
                }
                linkA[i] = keep;
                linkIdA[i] = keep.id;
                linkB[i] = other;
                linkIdB[i] = other.id;
            }
            float d = linkDmg * dt;
            s.dot(linkA[i], d);
            s.dot(linkB[i], d);
            if (linkHeal > 0f) {
                healAcc += 2f * d * linkHeal;
                if (healAcc >= 1f) {
                    int whole = (int) healAcc;
                    healAcc -= whole;
                    s.heal(whole);
                }
            }
        }
    }

    private void removeLink(int i) {
        linkN--;
        linkA[i] = linkA[linkN];
        linkB[i] = linkB[linkN];
        linkIdA[i] = linkIdA[linkN];
        linkIdB[i] = linkIdB[linkN];
        linkT[i] = linkT[linkN];
        linkA[linkN] = linkB[linkN] = null;
    }

    // ------------------------------------------------------------------ projectiles

    private Projectile proj(int sub) {
        Projectile p = s.newMainProj(sub);
        if (p == null) return null;
        p.dmg = dmg;
        p.knock = knock;
        p.critChance = critChance;
        p.critMul = critMul;
        return p;
    }

    /** Called for every hit of a P_MAIN projectile or a patch on enemy e (after the damage). */
    void onHit(Projectile p, Enemy e) {
        if (p.status != Entities.ST_NONE) {
            s.applyStatus(e, p.status, p.statusN, p.dmg, p.status == Entities.ST_BURN ? 2.5f : 8f);
        }
        if (p.sub == Entities.SUB_BOLT && link) linkFrom(e);
        if (critRefund > 0f && s.lastCrit && p.sub == Entities.SUB_BULLET) cd -= critRefund;
    }

    /** Per-frame steering of a homing dart. */
    void homing(Projectile p, float dt) {
        Enemy t = null;
        if (p.targetId != 0) {
            for (int i = 0; i < s.enemyN; i++) {
                if (s.enemies[i].id == p.targetId) {
                    t = s.enemies[i];
                    break;
                }
            }
            if (t != null && t.dead) t = null;
        }
        if (t == null) {
            float bd = 300f * 300f;
            for (int i = 0; i < s.enemyN; i++) {
                Enemy e = s.enemies[i];
                if (e.dead) continue;
                float dx = e.x - p.x, dy = e.y - p.y, d = dx * dx + dy * dy;
                if (d < bd) {
                    bd = d;
                    t = e;
                }
            }
            p.targetId = t == null ? 0 : t.id;
        }
        if (t == null) return;
        float want = (float) Math.atan2(t.y - p.y, t.x - p.x), cur = (float) Math.atan2(p.vy, p.vx);
        float diff = want - cur;
        while (diff > Math.PI) diff -= TAU;
        while (diff < -Math.PI) diff += TAU;
        float turn = Math.max(-7f * dt, Math.min(7f * dt, diff));
        float sp = (float) Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        p.vx = (float) Math.cos(cur + turn) * sp;
        p.vy = (float) Math.sin(cur + turn) * sp;
    }
}
