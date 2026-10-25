package se.felixarvid.thorsurvivors.game;

import se.felixarvid.thorsurvivors.data.EnemyDef;
import se.felixarvid.thorsurvivors.game.Entities.EProj;
import se.felixarvid.thorsurvivors.game.Entities.Enemy;
import se.felixarvid.thorsurvivors.game.Entities.Hazard;

/**
 * Enemy behaviour archetypes (design section 4), enemy projectiles and ground hazards. {@link #update} is one int
 * switch on {@link EnemyType#arch}; the state lives on the {@link Enemy} (phase {@code ai}, timers {@code aiT} /
 * {@code actT}, locked target {@code ax/ay}), the numbers in the enemy's data {@code params}. Nothing is allocated:
 * projectiles and hazards are pools of {@link Sim#MAX_EPROJ} and {@link Sim#MAX_HAZ}, and a full pool skips the shot.
 *
 * <ul>
 * <li>PACK (spore hound): fast chaser that weaves sideways, phases 1-2 clockwise and 3-5 counter-clockwise.</li>
 * <li>RANGED / FLIER (sergeant, security drone): stops at {@code stop} units, backs off under {@code backoff}, shoots a
 * burst of bolts every {@code interval} s and stands still while it shoots.</li>
 * <li>CHARGER (welder, cargo loader): from 80-160 units a telegraph line, then a dash, then recovery.</li>
 * <li>EXPLODER (spore carrier): within 40 units a short fuse, then a spore cloud that hurts the hero and the enemies.</li>
 * <li>TANK (smelter, slagborn, foreman): knockback-immune (data knockback 0), casts slag pools at the hero.</li>
 * <li>SUMMONER (vire, the first): blinks near the hero, raises colonists, fires a ring of bolts.</li>
 * </ul>
 */
final class EnemyAi {
    static final int A_WALK = 0, A_SHOOT = 1, A_PAUSE = 2, A_TELE = 3, A_DASH = 4, A_REST = 5, A_FUSE = 6, A_CAST = 7,
            A_WAIT = 8;
    private static final float TAU = 6.2831855f;

    private final Sim s;
    // barrels a dashing welder ran into: broken once the grid is current (see updateHazards)
    private final float[] pendX = new float[8], pendY = new float[8], pendR = new float[8];
    private int pendN;

    EnemyAi(Sim s) {
        this.s = s;
    }

    /** A barrel or crate a dashing enemy ran into: broken once the grid is current (see {@link #updateHazards}). */
    void breakLater(float x, float y, float r) {
        if (pendN >= pendX.length) return;
        pendX[pendN] = x;
        pendY[pendN] = y;
        pendR[pendN++] = r;
    }

    private float rnd(float a, float b) {
        return a + s.rng.nextFloat() * (b - a);
    }

    /** First timers of a freshly spawned non-chaser. */
    void init(Enemy e) {
        EnemyDef d = e.type.def;
        switch (e.type.arch) {
            case EnemyDef.ARCH_PACK:
                e.weaveT = s.rng.nextFloat() * e.type.phaseLen;
                e.shots = s.rng.nextInt(5);
                break;
            case EnemyDef.ARCH_RANGED:
            case EnemyDef.ARCH_FLIER:
                e.actT = rnd(0.6f, Math.max(0.7f, d.param("interval", 3f)));
                break;
            case EnemyDef.ARCH_CHARGER:
                e.actT = rnd(d.param("gapMin", 2f), d.param("gapMax", 6f));
                break;
            case EnemyDef.ARCH_TANK:
                e.actT = d.param("castEvery", 8f) * rnd(0.4f, 0.9f);
                break;
            case EnemyDef.ARCH_SUMMONER:
                e.aiT = rnd(1.2f, 3f);
                break;
            case EnemyDef.ARCH_BOSS:
                s.boss.init(e);
                break;
            default:
        }
    }

    // ------------------------------------------------------------------ behaviours

    /** One step of a non-chaser. {@code moving} is false while staggered or rooted; the caller skips stunned and frozen enemies. */
    void update(Enemy e, float dt, boolean moving, float dx, float dy, float d2) {
        float d = (float) Math.sqrt(d2);
        switch (e.type.arch) {
            case EnemyDef.ARCH_PACK: pack(e, dt, moving, dx, dy, d); break;
            case EnemyDef.ARCH_RANGED:
            case EnemyDef.ARCH_FLIER: ranged(e, dt, moving, dx, dy, d); break;
            case EnemyDef.ARCH_CHARGER: charger(e, dt, moving, dx, dy, d); break;
            case EnemyDef.ARCH_EXPLODER: exploder(e, dt, moving, dx, dy, d); break;
            case EnemyDef.ARCH_TANK: tank(e, dt, moving, dx, dy, d); break;
            case EnemyDef.ARCH_SUMMONER: summoner(e, dt, moving, dx, dy, d); break;
            case EnemyDef.ARCH_BOSS: s.boss.update(e, dt, moving, dx, dy, d); break;
            case EnemyDef.ARCH_TENTACLE: s.boss.tentacle(e, dt); break;
            default:
        }
    }

    /** Ashwalker Treads: enemies standing in the hero's ash move at 80% speed. */
    static final float ASH_SLOW = 0.8f;

    float speedOf(Enemy e) {
        return (e.blocked ? e.speed * Sim.BLOCKED_SPEED : e.speed) * e.slow * (e.ashLeft > 0f ? ASH_SLOW : 1f);
    }

    void walkTo(Enemy e, float dt, float dx, float dy, float d, float factor) {
        if (d <= 1f) return;
        float sp = speedOf(e) * factor;
        e.x += dx / d * sp * dt;
        e.y += dy / d * sp * dt;
    }

    private void pack(Enemy e, float dt, boolean moving, float dx, float dy, float d) {
        e.weaveT -= dt;
        if (e.weaveT <= 0f) {
            e.weaveT += e.type.phaseLen;
            e.shots = (e.shots + 1) % 5;
        }
        if (!moving || d <= 1f) return;
        // phases 1-2 sideways one way, 3-5 the other; the weave fades out near the hero so the bite still lands
        float sign = e.shots < 2 ? 1f : -1f;
        float w = e.type.weave * Math.max(0f, Math.min(1f, (d - 30f) / 70f)) * sign;
        float ux = dx / d, uy = dy / d;
        float vx = ux - uy * w, vy = uy + ux * w;
        float n = (float) Math.sqrt(vx * vx + vy * vy);
        float sp = speedOf(e);
        e.x += vx / n * sp * dt;
        e.y += vy / n * sp * dt;
    }

    private void ranged(Enemy e, float dt, boolean moving, float dx, float dy, float d) {
        EnemyType t = e.type;
        e.actT -= dt;
        if (e.ai == A_SHOOT) { // stands still while the burst goes out
            e.clip = Entities.CL_ATTACK2;
            e.shotT -= dt;
            if (e.shotT <= 0f) {
                if (e.shots > 0) {
                    fireAtHero(e, t.def.param("bulletSpeed", 240f), t.def.param("shotDmg", 10f) * e.dmgMul * e.shotMul, t.def.param("range", 200f));
                    if (t.arch == EnemyDef.ARCH_FLIER) s.sound.emit(SoundEvents.DRONE_SHOT);
                    e.shots--;
                    e.shotT += t.def.param("burstGap", 0.15f);
                }
                if (e.shots <= 0) {
                    e.ai = A_PAUSE;
                    e.aiT = t.def.param("pause", 0.5f);
                }
            }
            return;
        }
        if (e.ai == A_PAUSE) {
            e.clip = 0;
            if ((e.aiT -= dt) <= 0f) e.ai = A_WALK;
            return;
        }
        e.clip = 0;
        if (moving && d > 1f) {
            if (d > t.stop) walkTo(e, dt, dx, dy, d, 1f);
            else if (d < t.backoff) walkTo(e, dt, -dx, -dy, d, t.backoffMul);
        }
        int burst = Math.round(t.def.param("burst", 1f));
        if (e.actT <= 0f && d <= t.def.param("range", 200f) && s.eprojN + burst <= Sim.MAX_EPROJ) {
            e.ai = A_SHOOT;
            e.shots = burst;
            e.shotT = 0.12f;
            e.actT = t.def.param("interval", 3f);
            if (t.arch == EnemyDef.ARCH_RANGED) s.sound.emit(SoundEvents.SERGEANT_BURST);
        }
    }

    private void charger(Enemy e, float dt, boolean moving, float dx, float dy, float d) {
        EnemyDef def = e.type.def;
        switch (e.ai) {
            case A_TELE:
                e.clip = 0;
                e.tele -= dt;
                if ((e.aiT -= dt) <= 0f) {
                    e.ai = A_DASH;
                    e.aiT = def.param("dash", 0.6f);
                    e.tele = 0f;
                }
                return;
            case A_DASH: {
                e.clip = Entities.CL_RUN;
                float sp = def.param("runSpeed", 300f) * Sim.ENEMY_SPEED_K * (float) s.stage.enemySpeed * e.slow;
                e.x += e.ax * sp * dt;
                e.y += e.ay * sp * dt;
                if (s.destTouches(e.x, e.y, e.radius) && pendN < pendX.length) { // hits a barrel or crate: breaks it and is stunned
                    pendX[pendN] = e.x;
                    pendY[pendN] = e.y;
                    pendR[pendN++] = e.radius;
                    e.ai = A_REST;
                    e.aiT = def.param("recover", 1f);
                    e.stun = Math.max(e.stun, Status.stunFor(1f, e.boss, e.elite));
                    e.clip = 0;
                    return;
                }
                if ((e.aiT -= dt) <= 0f) {
                    e.ai = A_REST;
                    e.aiT = def.param("recover", 1f);
                }
                return;
            }
            case A_REST:
                e.clip = 0;
                if ((e.aiT -= dt) <= 0f) {
                    e.ai = A_WALK;
                    e.actT = rnd(def.param("gapMin", 2f), def.param("gapMax", 6f));
                }
                return;
            default:
        }
        e.clip = 0;
        e.actT -= dt;
        if (moving) walkTo(e, dt, dx, dy, d, 1f);
        if (e.actT <= 0f && d >= def.param("minDist", 80f) && d <= def.param("maxDist", 160f)) {
            e.ai = A_TELE; // the line is locked now: it shows where the dash will go
            e.ax = dx / Math.max(d, 1f);
            e.ay = dy / Math.max(d, 1f);
            e.aiT = e.tele = e.teleMax = def.param("windup", 0.6f);
            e.teleLen = def.param("runSpeed", 300f) * Sim.ENEMY_SPEED_K * (float) s.stage.enemySpeed * def.param("dash", 0.6f);
            s.sound.emit(SoundEvents.WELDER_CHARGE);
        }
    }

    private void exploder(Enemy e, float dt, boolean moving, float dx, float dy, float d) {
        if (e.ai == A_FUSE) {
            e.clip = Entities.CL_CAST;
            e.tele -= dt;
            if ((e.aiT -= dt) <= 0f) s.killNow(e); // reap() bursts it: the cloud
            return;
        }
        e.clip = 0;
        if (moving) walkTo(e, dt, dx, dy, d, 1f);
        if (d <= e.type.trigger) {
            e.ai = A_FUSE;
            e.aiT = e.tele = e.teleMax = e.type.def.param("fuse", 0.35f);
        }
    }

    /** A spore carrier dies (fuse out or killed): a cloud for the hero and the enemies. Called by Sim.reap. */
    void carrierBurst(Enemy e) {
        EnemyDef def = e.type.def;
        float r = def.param("cloudR", 90f);
        s.sound.emit(SoundEvents.CARRIER_BURST);
        s.addFx(Entities.FX_SPORE, e.x, e.y, r, 0f, 0.5f, 0, false);
        s.spark(e.x, e.y - 10f, 0xFF90E040, 10);
        addHazard(Entities.HZ_CLOUD, e.x, e.y, r, def.param("cloudT", 3f), def.param("cloudDps", 4f), 0f);
        // the first burst also blasts the enemies around it
        int n = s.query(e.x, e.y, r);
        for (int k = 0; k < n; k++) {
            Enemy o = s.enemies[s.qbuf[k]];
            if (o == e || o.dead) continue;
            float ox = o.x - e.x, oy = o.y - e.y, rr = r * 0.8f + o.radius * 0.5f;
            if (ox * ox + oy * oy > rr * rr) continue;
            s.dot(o, CLOUD_BLAST);
            s.applyStatus(o, Entities.ST_DECAY, 2, CLOUD_HIT, 0f);
        }
    }

    static final float CLOUD_BLAST = 12f, CLOUD_HIT = 30f;

    private void tank(Enemy e, float dt, boolean moving, float dx, float dy, float d) {
        EnemyDef def = e.type.def;
        float enrageHp = def.param("enrageHp", 0f);
        if (enrageHp > 0f && !e.enraged && e.hp < e.maxHp * enrageHp) {
            e.enraged = true; // Slagborn at half health
            e.speed *= def.param("enrageMul", 1.3f);
        }
        if (e.ai == A_CAST) {
            e.clip = Entities.CL_CAST;
            e.tele -= dt;
            if ((e.aiT -= dt) <= 0f) {
                e.ai = A_WALK;
                e.actT = def.param("castEvery", 8f);
            }
            return;
        }
        e.clip = 0;
        e.actT -= dt;
        if (moving && d > 1f) {
            float sp = speedOf(e);
            e.x += dx / d * sp * dt;
            e.y += dy / d * sp * dt;
            float trail = def.param("trail", 0f);
            if (trail > 0f && (e.trail += sp * dt) >= trail) { // Slagborn leaves a burning trail
                e.trail = 0f;
                addHazard(Entities.HZ_SLAG, e.x, e.y + 4f, 24f, def.param("trailT", 4f), def.param("trailDps", 6f), 0f);
            }
        }
        if (e.actT <= 0f && d < 360f) {
            e.ai = A_CAST;
            e.clip = Entities.CL_CAST;
            e.aiT = e.tele = e.teleMax = def.param("castTime", 0.6f);
            castPools(e, dx, dy, d);
        }
    }

    /** Slag pools where the hero stands now (with a warning, so it can step away); a carpet runs from the smelter toward the hero. */
    private void castPools(Enemy e, float dx, float dy, float d) {
        EnemyDef def = e.type.def;
        int n = Math.max(1, Math.round(def.param("pools", 1f)));
        float r = def.param("poolR", 60f), warn = def.param("warn", 0.6f), life = def.param("poolT", 3f), dps = def.param("poolDps", 8f);
        boolean carpet = def.param("carpet", 0f) > 0f;
        float ux = d > 1f ? dx / d : 1f, uy = d > 1f ? dy / d : 0f;
        for (int k = 0; k < n; k++) {
            float x, y;
            if (carpet) { // 5 pools in a line toward the hero
                x = e.x + ux * r * 1.5f * (k + 1);
                y = e.y + uy * r * 1.5f * (k + 1);
            } else if (k == 0) {
                x = s.px;
                y = s.py;
            } else { // scattered bombs around the hero
                float a = s.rng.nextFloat() * TAU, rr = rnd(r, r * 3f);
                x = s.px + (float) Math.cos(a) * rr;
                y = s.py + (float) Math.sin(a) * rr;
            }
            addHazard(Entities.HZ_SLAG, x, y, r, life, dps, warn);
        }
    }

    private void summoner(Enemy e, float dt, boolean moving, float dx, float dy, float d) {
        EnemyDef def = e.type.def;
        switch (e.ai) {
            case A_TELE: // 0.2 s at the old spot, then it is somewhere else
                e.clip = 0;
                e.tele -= dt;
                if ((e.aiT -= dt) <= 0f) {
                    float a = s.rng.nextFloat() * TAU, r = rnd(def.param("blinkMin", 125f), def.param("blinkMax", 200f));
                    e.x = s.px + (float) Math.cos(a) * r;
                    e.y = s.py + (float) Math.sin(a) * r;
                    s.addFx(Entities.FX_BLINK, e.x, e.y, 70f, 0f, 0.35f, 0, false);
                    s.sound.emit(SoundEvents.VIRE_BLINK);
                    e.ai = A_WAIT;
                    e.aiT = def.param("wait", 0.75f);
                    e.tele = 0f;
                }
                return;
            case A_WAIT:
                e.clip = 0;
                if ((e.aiT -= dt) <= 0f) startCast(e);
                return;
            case A_CAST:
                e.clip = (e.shots & 1) == 0 ? Entities.CL_CAST : Entities.CL_CAST2;
                if ((e.aiT -= dt) <= 0f) {
                    if ((e.shots & 1) == 0) raise(e);
                    else ring(e);
                    e.shots++;
                    e.ai = A_WALK;
                    e.aiT = rnd(def.param("stopMin", 2.5f), def.param("stopMax", 4f));
                    e.clip = 0;
                }
                return;
            default:
        }
        e.clip = 0;
        if (moving) walkTo(e, dt, dx, dy, d, 1f);
        if ((e.aiT -= dt) > 0f) return;
        if (def.param("blinkMax", 0f) > 0f) {
            e.ai = A_TELE;
            e.aiT = e.tele = e.teleMax = def.param("tele", 0.2f);
            s.addFx(Entities.FX_BLINK, e.x, e.y, 70f, 0f, 0.3f, 0, false);
        } else {
            startCast(e);
        }
    }

    private void startCast(Enemy e) {
        e.ai = A_CAST;
        e.aiT = 0.5f;
    }

    /** Raises colonists around the caster. */
    void raise(Enemy e) {
        int n = Math.min(Math.round(e.type.def.param("raise", 3f)), WaveDirector.ENEMY_CAP - s.enemyN); // never past the cap
        if (n <= 0) return;
        float a0 = s.rng.nextFloat() * TAU;
        for (int k = 0; k < n; k++) {
            float a = a0 + k * TAU / n;
            s.spawnMinion("COLONIST", e.x + (float) Math.cos(a) * 34f, e.y + (float) Math.sin(a) * 28f);
        }
        s.spark(e.x, e.y - 10f, 0xFFB070FF, 8);
        s.sound.emit(SoundEvents.SPORE_BURST);
    }

    /** A ring of bolts around the caster. */
    private void ring(Enemy e) {
        EnemyDef def = e.type.def;
        int n = Math.round(def.param("ring", 8f));
        float sp = def.param("ringSpeed", 220f), dmg = def.param("ringDmg", 10f) * e.dmgMul * e.shotMul;
        float a0 = e.anim * 0.9f;
        for (int k = 0; k < n; k++) {
            float a = a0 + k * TAU / n;
            shoot(e.x, e.y - 8f, (float) Math.cos(a) * sp, (float) Math.sin(a) * sp, dmg, 1.6f);
        }
        s.sound.emit(SoundEvents.SPORE_BURST);
    }

    // ------------------------------------------------------------------ enemy projectiles

    void fireAtHero(Enemy e, float speed, float dmg, float range) {
        float ox = e.x, oy = e.y - 8f;
        float dx = s.px - ox, dy = s.py - oy, d = (float) Math.sqrt(dx * dx + dy * dy);
        if (d < 1f) return;
        shoot(ox, oy, dx / d * speed, dy / d * speed, dmg, (range + 140f) / speed);
    }

    /** A hostile bolt, or nothing when the pool of {@link Sim#MAX_EPROJ} is full. */
    EProj shoot(float x, float y, float vx, float vy, float dmg, float life) {
        if (s.eprojN >= Sim.MAX_EPROJ) return null;
        EProj p = s.eprojs[s.eprojN++];
        p.x = x;
        p.y = y;
        p.vx = vx;
        p.vy = vy;
        p.dmg = dmg;
        p.life = life;
        p.radius = 6f;
        p.friendly = false;
        return p;
    }

    void updateProjectiles(float dt) {
        if (s.freezeTimer > 0f) return; // the Orologion stops their bolts in the air too
        for (int i = s.eprojN - 1; i >= 0; i--) {
            EProj p = s.eprojs[i];
            p.life -= dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            float hx = p.x - s.px, hy = p.y - s.py;
            boolean gone = p.life <= 0f || hx * hx + hy * hy > 900f * 900f;
            if (!gone && p.friendly) {
                int n = s.query(p.x, p.y, p.radius + 34f);
                for (int k = 0; k < n && !gone; k++) {
                    Enemy e = s.enemies[s.qbuf[k]];
                    if (e.dead) continue;
                    float dx = e.x - p.x, dy = e.y - p.y, rr = p.radius + e.radius;
                    if (dx * dx + dy * dy >= rr * rr) continue;
                    float d = (float) Math.sqrt(dx * dx + dy * dy) + 0.01f;
                    s.hurt(e, p.dmg, 0f, 1f, dx / d, dy / d, 0.6f);
                    gone = true;
                }
            } else if (!gone && s.invuln <= 0f) {
                float rr = p.radius + Sim.PLAYER_R * 0.7f;
                if (hx * hx + hy * hy < rr * rr) {
                    float taken = Math.max(1f, p.dmg - (float) s.stats.armor);
                    if (s.guardT > 0f) taken = Math.max(1f, taken * (1f - s.guardDR));
                    s.hurtHero(taken, 0.25f, true, Sim.DMG_BOLT);
                    gone = true;
                }
            }
            if (gone) {
                s.eprojs[i] = s.eprojs[s.eprojN - 1];
                s.eprojs[s.eprojN - 1] = p;
                s.eprojN--;
            }
        }
    }

    /** Riot Guard II: hostile bolts inside the swing's cone turn around and fly along the swing, hurting enemies. */
    void reflectCone(float ang, float arcRad, float reach, float dmg) {
        float ax = (float) Math.cos(ang), ay = (float) Math.sin(ang), half = arcRad / 2f;
        for (int i = 0; i < s.eprojN; i++) {
            EProj p = s.eprojs[i];
            if (p.friendly) continue;
            float dx = p.x - s.px, dy = p.y - s.py, d = (float) Math.sqrt(dx * dx + dy * dy);
            if (d > reach + p.radius) continue;
            if (d > 14f) {
                float cosA = (dx * ax + dy * ay) / d;
                if (cosA < (float) Math.cos(Math.min((float) Math.PI, half))) continue;
            }
            turn(p, ax, ay, dmg);
        }
    }

    /** The slam: every hostile bolt within r is thrown outward. */
    void reflectRing(float r, float dmg) {
        for (int i = 0; i < s.eprojN; i++) {
            EProj p = s.eprojs[i];
            if (p.friendly) continue;
            float dx = p.x - s.px, dy = p.y - s.py, d = (float) Math.sqrt(dx * dx + dy * dy);
            if (d > r + p.radius) continue;
            if (d < 1f) turn(p, 1f, 0f, dmg);
            else turn(p, dx / d, dy / d, dmg);
        }
    }

    private void turn(EProj p, float ux, float uy, float dmg) {
        float sp = Math.max(300f, (float) Math.sqrt(p.vx * p.vx + p.vy * p.vy) * 1.2f);
        p.vx = ux * sp;
        p.vy = uy * sp;
        p.friendly = true;
        p.dmg = dmg;
        p.life = 1.2f;
        s.spark(p.x, p.y, 0xFFD8FFF8, 4);
    }

    // ------------------------------------------------------------------ hazards

    /** A ground area; {@code warn} seconds of harmless warning first. Null when the pool of {@link Sim#MAX_HAZ} is full. */
    Hazard addHazard(int kind, float x, float y, float r, float life, float dps, float warn) {
        if (s.hazN >= Sim.MAX_HAZ && !(isTelegraph(kind) && evictOne())) return null;
        Hazard h = s.hazards[s.hazN++];
        h.kind = kind;
        h.x = x;
        h.y = y;
        h.r = r;
        h.life = h.maxLife = life;
        h.dps = dps;
        h.warn = warn;
        h.acc = 0f;
        h.n = 0;
        h.variant = 0;
        h.warnMax = warn;
        h.ang = h.spin = h.w = 0f;
        return h;
    }

    /** Bombs and lanes are the telegraphs of the boss attacks and the elites: they always get a slot. */
    private static boolean isTelegraph(int kind) {
        return kind == Entities.HZ_BOMB || kind == Entities.HZ_LANE;
    }

    /**
     * The pool is full and a telegraph needs a slot: drops the least important hazard (the hero's ash first, then frost
     * patches, then the slag and cloud that has the least time left); never a bomb, a lane or one still warning.
     * False when nothing could go.
     */
    private boolean evictOne() {
        int best = -1;
        float bestScore = Float.MAX_VALUE;
        for (int i = 0; i < s.hazN; i++) {
            Hazard h = s.hazards[i];
            if (isTelegraph(h.kind) || h.warn > 0f) continue;
            float score = (h.kind == Entities.HZ_ASH ? 0f : h.kind == Entities.HZ_FROST ? 100f : 200f) + h.life;
            if (score < bestScore) {
                bestScore = score;
                best = i;
            }
        }
        if (best < 0) return false;
        Hazard h = s.hazards[best];
        s.hazards[best] = s.hazards[s.hazN - 1];
        s.hazards[s.hazN - 1] = h;
        s.hazN--;
        return true;
    }

    void updateHazards(float dt) {
        for (int i = 0; i < pendN; i++) s.hitDest(pendX[i], pendY[i], pendR[i]);
        pendN = 0;
        if (s.hazN == 0 || s.freezeTimer > 0f) return;
        for (int i = s.hazN - 1; i >= 0; i--) {
            Hazard h = s.hazards[i];
            if (h.warn > 0f) {
                h.warn -= dt;
                if (h.warn <= 0f && h.kind == Entities.HZ_BOMB) detonate(h);
                continue;
            }
            if ((h.life -= dt) <= 0f) {
                s.hazards[i] = s.hazards[s.hazN - 1];
                s.hazards[s.hazN - 1] = h;
                s.hazN--;
                continue;
            }
            if (h.kind == Entities.HZ_BOMB) continue; // the afterglow of a blast: nothing more happens
            if (h.kind == Entities.HZ_LANE) {
                h.ang += h.spin * dt;
                if (s.ended == 0 && s.invuln <= 0f && laneHits(h)) s.areaDamage(h.dps * dt);
                continue;
            }
            if (h.kind == Entities.HZ_ASH) { // Ashwalker Treads: the ash slows the enemies standing in it, 10 Hz
                if ((h.acc += dt) >= Status.PASS) {
                    h.acc -= Status.PASS;
                    int n = s.query(h.x, h.y, h.r + 30f);
                    for (int k = 0; k < n; k++) {
                        Enemy e = s.enemies[s.qbuf[k]];
                        float ex = e.x - h.x, ey = e.y - h.y, er = h.r + e.radius * 0.5f;
                        if (ex * ex + ey * ey < er * er) e.ashLeft = 0.3f;
                    }
                }
                continue;
            }
            float dx = s.px - h.x, dy = s.py - h.y, rr = h.r + Sim.PLAYER_R * 0.4f;
            if (dx * dx + dy * dy < rr * rr && s.ended == 0) heroInside(h, dt);
            if (h.kind == Entities.HZ_CLOUD && (h.acc += dt) >= Status.PASS) { // the cloud hurts every enemy in it, 10 Hz
                h.acc -= Status.PASS;
                h.n++;
                int n = s.query(h.x, h.y, h.r + 30f);
                for (int k = 0; k < n; k++) {
                    Enemy e = s.enemies[s.qbuf[k]];
                    if (e.dead) continue;
                    float ex = e.x - h.x, ey = e.y - h.y, er = h.r + e.radius * 0.5f;
                    if (ex * ex + ey * ey >= er * er) continue;
                    s.statusDamage(e, h.dps * Status.PASS, Status.C_DECAY, true);
                    if (h.n % 5 == 0 && e.decay < 3) s.applyStatus(e, Entities.ST_DECAY, 1, CLOUD_HIT, 0f);
                }
            }
        }
    }

    /** Distance from the hero to the lane's segment is under half its width (plus the hero's body). */
    boolean laneHits(Hazard h) {
        float ux = (float) Math.cos(h.ang), uy = (float) Math.sin(h.ang);
        float rx = s.px - h.x, ry = s.py - h.y;
        float along = rx * ux + ry * uy, across = -rx * uy + ry * ux;
        return along > -10f && along < h.r && Math.abs(across) < h.w * 0.5f + Sim.PLAYER_R * 0.5f;
    }

    /**
     * A bomb's ring has run out: one blast of {@code dps} damage inside {@code r} (not while the hero is invulnerable),
     * the visual of its variant, and for a slag bomb the pool it leaves ({@code w} radius, {@code spin} seconds,
     * {@code acc} damage per second). The ring stays as a short afterglow.
     */
    private void detonate(Hazard h) {
        float dx = s.px - h.x, dy = s.py - h.y, rr = h.r + Sim.PLAYER_R * 0.4f;
        boolean inside = dx * dx + dy * dy < rr * rr;
        if (inside && s.invuln <= 0f && s.ended == 0) {
            s.hurtHero(Math.max(1f, h.dps - (float) s.stats.armor), 0.4f, true, Sim.DMG_AREA);
        }
        switch (h.variant) {
            case Entities.BV_STOMP:
                s.addFx(Entities.FX_SLAM, h.x, h.y, h.r, 0f, 0.5f, 0, false);
                s.screenShake(0.35f);
                s.sound.emit(SoundEvents.BOSS_SLAM);
                if (inside) s.shoveHero(dx, dy, 46f);
                break;
            case Entities.BV_CRATE:
                s.addFx(Entities.FX_FLASH, h.x, h.y - 6f, h.r * 1.8f, 0f, 0.25f, 0, false);
                s.spark(h.x, h.y - 8f, 0xFFB08850, 8);
                s.sound.emit(SoundEvents.CRATE_BREAK);
                break;
            case Entities.BV_VOLCANO:
                s.addFx(Entities.FX_BLAST, h.x, h.y, h.r * 0.8f, 1f, 0.3f, 0, false);
                s.spark(h.x, h.y - 8f, 0xFFFFA030, 8);
                s.sound.emit(SoundEvents.BARREL_EXPLODE);
                break;
            default: // a slag bomb
                s.addFx(Entities.FX_BLAST, h.x, h.y, h.r * 0.9f, 1f, 0.35f, 0, false);
                s.spark(h.x, h.y - 8f, 0xFFFFA030, 10);
                s.sound.emit(SoundEvents.BARREL_EXPLODE);
                if (h.w > 0f) addHazard(Entities.HZ_SLAG, h.x, h.y, h.w, h.spin, h.acc, 0f);
        }
        h.life = h.maxLife = Math.max(0.01f, h.variant == Entities.BV_STOMP ? 0.5f : 0.4f);
    }

    private void heroInside(Hazard h, float dt) {
        switch (h.kind) {
            case Entities.HZ_SLAG:
                if (s.stats.burnImmune) return; // Ashen Heartwood: fire does nothing
                s.heroBurnT = Status.HERO_BURN_TIME;
                break;
            case Entities.HZ_CLOUD:
                if (s.stats.cloudHeal) { // Seed of Accord: the spores heal instead
                    s.healAcc += CLOUD_HEAL * dt;
                    if (s.healAcc >= 1f) {
                        int whole = (int) s.healAcc;
                        s.healAcc -= whole;
                        s.heal(whole);
                    }
                    return;
                }
                s.heroDecayT = Status.HERO_DECAY_TIME;
                break;
            case Entities.HZ_FROST:
                s.heroSlowT = Status.HERO_SLOW_TIME;
                break;
            default:
        }
        if (h.dps > 0f && h.kind != Entities.HZ_FROST) s.areaDamage(h.dps * dt); // area damage ignores armor and invulnerability frames
    }

    /** HP per second a Seed of Accord hero gains standing in a spore cloud. */
    static final float CLOUD_HEAL = 4f;
}
