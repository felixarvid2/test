package se.felixarvid.thorsurvivors.game;

import se.felixarvid.thorsurvivors.data.EnemyDef;
import se.felixarvid.thorsurvivors.game.Entities.Enemy;
import se.felixarvid.thorsurvivors.game.Entities.Hazard;

/**
 * The boss patterns of design section 4.1, one method per boss, selected by the {@code pattern} param of the enemy
 * ({@link EnemyType#pattern}). Same shape as {@link EnemyAi}: the state lives on the {@link Enemy} (phase {@code ai},
 * timers {@code aiT} / {@code actT}, boss phase {@code phase}), the numbers in the data {@code params}, nothing is
 * allocated and a full pool of bolts or hazards just skips the attack. Every attack shows a telegraph first: a warn ring
 * (a {@link Entities#HZ_BOMB} hazard), a charge line ({@code tele}, {@code teleLen}, {@code teleW}), a lane that is a thin
 * line before it turns deadly, or a pulse whose safe half is drawn by the renderer from {@code ax/ay/t2/t3}.
 *
 * <ul>
 * <li>1 Cargo Loader: a bag of four draws (two charges, two stomps, no replacement). Charge: 1.0 s windup, a line 60
 * wide, the hero is stunned for 0.4 s and shoved on a hit. Stomp: radius 120 after 0.9 s, then three falling crates.</li>
 * <li>2 Slagborn: a slag trail every 45 units, every 8 s three lobbed slag bombs (five when enraged at 50%).</li>
 * <li>3 Vire, awakened: blink, raise 6 colonists, a rotating ring of 12 bolts (shot as a spiral); at 66% and 33% it
 * brings 4 spore carriers.</li>
 * <li>4 Smelter Foreman: a carpet of 5 slag pools toward the hero; below 25% it pulls the hero in (1.1 s warning ring).</li>
 * <li>5 The First: three phases (66% and 33%): lumen rings and tentacle bursts; sweeping tendril lanes and hounds; a
 * screen-wide pulse every 6 s with the safe half shown, plus the ring and tentacles at a slower pace.</li>
 * </ul>
 * The lumen tentacle ({@link EnemyDef#ARCH_TENTACLE}) lives here too: {@link #tentacle}.
 */
public final class BossAi {
    public static final int BA_LANES = 10, BA_ROAR = 11, BA_SPIRAL = 12, BA_PULL_TELE = 13, BA_PULL = 14, BA_PULSE = 15;
    /** Tentacle states: a warning ring, then up. */
    public static final int T_WARN = 1, T_UP = 2;
    private static final float TAU = 6.2831855f;
    private static final int A_WALK = EnemyAi.A_WALK, A_TELE = EnemyAi.A_TELE, A_DASH = EnemyAi.A_DASH,
            A_REST = EnemyAi.A_REST, A_CAST = EnemyAi.A_CAST, A_WAIT = EnemyAi.A_WAIT;

    private final Sim s;
    private final EnemyAi ai;

    BossAi(Sim s, EnemyAi ai) {
        this.s = s;
        this.ai = ai;
    }

    private float rnd(float a, float b) {
        return a + s.rng.nextFloat() * (b - a);
    }

    /** First timers of a freshly spawned boss. */
    void init(Enemy e) {
        EnemyDef d = e.type.def;
        switch (e.type.pattern) {
            case 1:
                e.actT = rnd(d.param("gapMin", 1f), d.param("gapMax", 3.5f));
                e.teleW = d.param("lineW", 60f);
                break;
            case 2:
                e.actT = d.param("castEvery", 8f) * rnd(0.3f, 0.6f);
                break;
            case 3:
                e.aiT = rnd(1.2f, 2.5f);
                break;
            case 4:
                e.actT = rnd(2f, 3.5f);
                break;
            case 5:
                firstTimers(e, 0);
                break;
            default:
        }
    }

    void update(Enemy e, float dt, boolean moving, float dx, float dy, float d) {
        switch (e.type.pattern) {
            case 1: cargo(e, dt, moving, dx, dy, d); break;
            case 2: slagborn(e, dt, moving, dx, dy, d); break;
            case 3: vire(e, dt, moving, dx, dy, d); break;
            case 4: foreman(e, dt, moving, dx, dy, d); break;
            case 5: first(e, dt, moving, dx, dy, d); break;
            default: ai.walkTo(e, dt, dx, dy, d, 1f);
        }
    }

    // ------------------------------------------------------------------ 1 Cargo Loader

    /** The bag of four draws: true = charge (two of them), false = stomp (two); refilled when empty. */
    private boolean drawCharge(Enemy e) {
        if ((e.bag & 15) == 0) e.bag = 15;
        int start = s.rng.nextInt(4);
        for (int k = 0; k < 4; k++) {
            int b = (start + k) & 3;
            if ((e.bag >> b & 1) == 0) continue;
            e.bag &= ~(1 << b);
            return b < 2;
        }
        return true;
    }

    private void cargo(Enemy e, float dt, boolean moving, float dx, float dy, float d) {
        EnemyDef def = e.type.def;
        switch (e.ai) {
            case A_TELE:
                e.clip = 0;
                e.tele -= dt;
                if ((e.aiT -= dt) <= 0f) {
                    e.ai = A_DASH;
                    e.aiT = def.param("dash", 1f);
                    e.tele = 0f;
                    e.cnt = 0;
                }
                return;
            case A_DASH: {
                e.clip = Entities.CL_RUN;
                float sp = def.param("runSpeed", 320f) * Sim.ENEMY_SPEED_K * (float) s.stage.enemySpeed * e.slow;
                e.x += e.ax * sp * dt;
                e.y += e.ay * sp * dt;
                float hx = s.px - e.x, hy = s.py - e.y, rr = e.radius * 0.8f + Sim.PLAYER_R * 0.8f + def.param("lineW", 60f) * 0.25f;
                if (e.cnt == 0 && s.ended == 0 && hx * hx + hy * hy < rr * rr) { // the line catches the hero: stun and a shove along it
                    e.cnt = 1;
                    if (s.invuln <= 0f) s.hurtHero(Math.max(1f, e.power * e.dmgMul - (float) s.stats.armor), 0.5f, true);
                    s.stunHero(def.param("stunHero", 0.4f));
                    s.shoveHero(e.ax, e.ay, 60f);
                }
                if (s.destTouches(e.x, e.y, e.radius)) { // runs into a barrel or crate: breaks it, stunned for a moment
                    ai.breakLater(e.x, e.y, e.radius);
                    e.ai = A_REST;
                    e.aiT = def.param("recover", 1f);
                    e.stun = Math.max(e.stun, Status.stunFor(1f, true, false));
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
                    e.actT = rnd(def.param("gapMin", 1f), def.param("gapMax", 3.5f));
                }
                return;
            case A_CAST: // the stomp winds up on the spot; its ring (a bomb) is already on the floor
                e.clip = Entities.CL_CAST;
                e.tele -= dt;
                if ((e.aiT -= dt) <= 0f) {
                    crates(e);
                    e.ai = A_REST;
                    e.aiT = 0.9f;
                    e.tele = 0f;
                }
                return;
            default:
        }
        e.clip = 0;
        e.actT -= dt;
        if (moving) ai.walkTo(e, dt, dx, dy, d, 1f);
        if (e.actT > 0f || d > def.param("maxDist", 420f)) return;
        if (drawCharge(e)) {
            e.ai = A_TELE; // the line is locked now: it shows where the dash will go
            e.ax = dx / Math.max(d, 1f);
            e.ay = dy / Math.max(d, 1f);
            e.aiT = e.tele = e.teleMax = def.param("windup", 1f);
            e.teleW = def.param("lineW", 60f);
            e.teleLen = def.param("runSpeed", 320f) * Sim.ENEMY_SPEED_K * (float) s.stage.enemySpeed * def.param("dash", 1f);
            s.sound.emit(SoundEvents.WELDER_CHARGE);
        } else {
            float warn = def.param("stompWarn", 0.9f);
            e.ai = A_CAST;
            e.aiT = e.tele = e.teleMax = warn;
            e.teleLen = 0f;
            Hazard h = ai.addHazard(Entities.HZ_BOMB, e.x, e.y, def.param("stompR", 120f), 0.5f, def.param("stompDmg", 22f), warn);
            if (h != null) h.variant = Entities.BV_STOMP;
        }
    }

    /** Three crates fall around the hero after the stomp (the first one on it): a ring each, then a blast. */
    private void crates(Enemy e) {
        EnemyDef def = e.type.def;
        int n = Math.round(def.param("crates", 3f));
        for (int k = 0; k < n; k++) {
            float x = s.px, y = s.py;
            if (k > 0) {
                float a = s.rng.nextFloat() * TAU, r = rnd(60f, 190f);
                x += (float) Math.cos(a) * r;
                y += (float) Math.sin(a) * r * 0.8f;
            }
            Hazard h = ai.addHazard(Entities.HZ_BOMB, x, y, def.param("crateR", 44f), 0.4f, def.param("crateDmg", 16f),
                    def.param("crateWarn", 1f) + 0.3f * k);
            if (h != null) h.variant = Entities.BV_CRATE;
        }
    }

    // ------------------------------------------------------------------ 2 Slagborn

    private void slagborn(Enemy e, float dt, boolean moving, float dx, float dy, float d) {
        EnemyDef def = e.type.def;
        float enrageHp = def.param("enrageHp", 0.5f);
        if (!e.enraged && e.hp < e.maxHp * enrageHp) {
            e.enraged = true; // half health: faster, more bombs, a shorter wait
            e.speed *= def.param("enrageMul", 1.3f);
            s.sound.emit(SoundEvents.BOSS_SLAM);
            s.addFx(Entities.FX_SLAM, e.x, e.y, 90f, 0f, 0.5f, 0, false);
            s.screenShake(0.3f);
        }
        if (e.ai == A_CAST) {
            e.clip = Entities.CL_CAST;
            e.tele -= dt;
            if ((e.aiT -= dt) <= 0f) {
                e.ai = A_WALK;
                e.actT = def.param("castEvery", 8f) * (e.enraged ? def.param("enrageCast", 0.7f) : 1f);
            }
            return;
        }
        e.clip = 0;
        e.actT -= dt;
        if (moving && d > 1f) {
            float sp = ai.speedOf(e);
            e.x += dx / d * sp * dt;
            e.y += dy / d * sp * dt;
            float trail = def.param("trail", 45f);
            if ((e.trail += sp * dt) >= trail && s.hazN < Sim.MAX_HAZ - Sim.HAZ_RESERVE_TRAIL / 2) { // the burning trail
                e.trail = 0f;
                ai.addHazard(Entities.HZ_SLAG, e.x, e.y + 4f, 24f, def.param("trailT", 4f), def.param("trailDps", 6f), 0f);
            }
        }
        if (e.actT <= 0f && d < 420f) {
            e.ai = A_CAST;
            e.clip = Entities.CL_CAST;
            e.aiT = e.tele = e.teleMax = def.param("castTime", 0.8f);
            lobBombs(e);
        }
    }

    /** Slag bombs: the first lands on the hero, the others scatter around it; each leaves a pool when it lands. */
    private void lobBombs(Enemy e) {
        EnemyDef def = e.type.def;
        int n = Math.round(e.enraged ? def.param("bombsEnraged", 5f) : def.param("bombs", 3f));
        float r = def.param("bombR", 46f), warn = def.param("bombWarn", 1f);
        for (int k = 0; k < n; k++) {
            float x = s.px, y = s.py;
            if (k > 0) {
                float a = s.rng.nextFloat() * TAU, rr = rnd(r * 1.4f, r * 3.6f);
                x += (float) Math.cos(a) * rr;
                y += (float) Math.sin(a) * rr * 0.8f;
            }
            Hazard h = ai.addHazard(Entities.HZ_BOMB, x, y, r, 0.4f, def.param("bombDmg", 12f), warn + 0.12f * k);
            if (h == null) continue;
            h.variant = Entities.BV_SLAG;
            h.w = def.param("poolR", 44f);
            h.spin = def.param("poolT", 3f);
            h.acc = def.param("poolDps", 7f);
        }
        s.sound.emit(SoundEvents.SPORE_BURST);
    }

    // ------------------------------------------------------------------ 3 Vire, awakened

    private void vire(Enemy e, float dt, boolean moving, float dx, float dy, float d) {
        EnemyDef def = e.type.def;
        int want = e.hp < e.maxHp * def.param("phase2Hp", 0.33f) ? 2 : e.hp < e.maxHp * def.param("phase1Hp", 0.66f) ? 1 : 0;
        if (want > e.phase) {
            e.phase = want; // 66% and 33%: four spore carriers and a blink away
            int n = Math.round(def.param("carriers", 4f));
            float a0 = s.rng.nextFloat() * TAU;
            for (int k = 0; k < n; k++) {
                float a = a0 + k * TAU / n;
                s.spawnMinion("SPORE_CARRIER", e.x + (float) Math.cos(a) * 60f, e.y + (float) Math.sin(a) * 50f);
            }
            s.spark(e.x, e.y - 14f, 0xFFB070FF, 14);
            s.addFx(Entities.FX_BLINK, e.x, e.y, 110f, 0f, 0.5f, 0, false);
            s.sound.emit(SoundEvents.BOSS_SLAM);
            s.screenShake(0.25f);
            e.ai = A_WALK;
            e.aiT = 0f;
        }
        switch (e.ai) {
            case A_TELE:
                e.clip = 0;
                e.tele -= dt;
                if ((e.aiT -= dt) <= 0f) {
                    float a = s.rng.nextFloat() * TAU, r = rnd(def.param("blinkMin", 125f), def.param("blinkMax", 200f));
                    e.x = s.px + (float) Math.cos(a) * r;
                    e.y = s.py + (float) Math.sin(a) * r;
                    s.addFx(Entities.FX_BLINK, e.x, e.y, 70f, 0f, 0.35f, 0, false);
                    s.sound.emit(SoundEvents.VIRE_BLINK);
                    e.ai = A_WAIT;
                    e.aiT = def.param("wait", 0.6f);
                    e.tele = 0f;
                }
                return;
            case A_WAIT:
                e.clip = 0;
                if ((e.aiT -= dt) <= 0f) {
                    e.ai = A_CAST;
                    e.aiT = 0.5f;
                }
                return;
            case A_CAST:
                e.clip = (e.shots & 1) == 0 ? Entities.CL_CAST : Entities.CL_CAST2;
                if ((e.aiT -= dt) > 0f) return;
                if ((e.shots & 1) == 0) { // raise the dead, then rest
                    ai.raise(e);
                    e.shots++;
                    restAfterCast(e);
                } else { // the ring: 12 bolts shot one after the other round the full circle
                    e.ai = BA_SPIRAL;
                    e.cnt = 0;
                    e.t2 = 0f;
                    e.mt0 = s.rng.nextFloat() * TAU;
                    s.sound.emit(SoundEvents.SPORE_BURST);
                }
                return;
            case BA_SPIRAL: {
                e.clip = Entities.CL_CAST2;
                int ring = Math.round(def.param("ring", 12f));
                float gap = def.param("ringGap", 0.1f);
                e.t2 -= dt;
                while (e.t2 <= 0f && e.cnt < ring) {
                    float a = e.mt0 + e.cnt * TAU / ring;
                    float sp = def.param("ringSpeed", 220f);
                    ai.shoot(e.x, e.y - 8f, (float) Math.cos(a) * sp, (float) Math.sin(a) * sp, def.param("ringDmg", 10f) * e.dmgMul, 1.6f);
                    e.cnt++;
                    e.t2 += gap;
                }
                if (e.cnt >= ring) {
                    e.shots++;
                    restAfterCast(e);
                }
                return;
            }
            default:
        }
        e.clip = 0;
        if (moving) ai.walkTo(e, dt, dx, dy, d, 1f);
        if ((e.aiT -= dt) > 0f) return;
        e.ai = A_TELE; // blink away first
        e.aiT = e.tele = e.teleMax = def.param("tele", 0.2f);
        s.addFx(Entities.FX_BLINK, e.x, e.y, 70f, 0f, 0.3f, 0, false);
    }

    private void restAfterCast(Enemy e) {
        EnemyDef def = e.type.def;
        e.ai = A_WALK;
        e.aiT = rnd(def.param("stopMin", 2f), def.param("stopMax", 3.5f)) * (1f - 0.2f * e.phase);
        e.clip = 0;
    }

    // ------------------------------------------------------------------ 4 Smelter Foreman

    private void foreman(Enemy e, float dt, boolean moving, float dx, float dy, float d) {
        EnemyDef def = e.type.def;
        float pullHp = def.param("pullHp", 0.25f);
        if (e.phase == 0 && e.hp < e.maxHp * pullHp) { // 25%: it starts pulling the hero in
            e.phase = 1;
            e.mt0 = 1.2f;
            s.sound.emit(SoundEvents.BOSS_SLAM);
            s.screenShake(0.25f);
        }
        switch (e.ai) {
            case BA_PULL_TELE:
                e.clip = Entities.CL_CAST;
                e.tele -= dt;
                if ((e.aiT -= dt) <= 0f) {
                    e.ai = BA_PULL;
                    e.aiT = def.param("pullTime", 0.7f);
                    e.tele = 0f;
                }
                return;
            case BA_PULL: {
                e.clip = Entities.CL_ATTACK2;
                float range = def.param("pullRange", 340f);
                if (d < range && s.dodgeT <= 0f && s.ended == 0) s.pullHero(e.x, e.y, def.param("pullSpeed", 300f) * dt);
                if ((e.aiT -= dt) <= 0f) {
                    float rr = def.param("slamR", 70f) + e.radius * 0.6f;
                    if (d < rr && s.invuln <= 0f && s.ended == 0) {
                        s.hurtHero(Math.max(1f, def.param("slamDmg", 18f) - (float) s.stats.armor), 0.5f, true, Sim.DMG_AREA);
                    }
                    s.addFx(Entities.FX_SLAM, e.x, e.y, def.param("slamR", 70f), 0f, 0.5f, 0, false);
                    s.sound.emit(SoundEvents.BOSS_SLAM);
                    s.screenShake(0.3f);
                    e.ai = A_WALK;
                    e.mt0 = def.param("pullEvery", 8f);
                    e.actT = Math.max(e.actT, 1.2f);
                }
                return;
            }
            case A_CAST:
                e.clip = Entities.CL_CAST;
                e.tele -= dt;
                if ((e.aiT -= dt) <= 0f) {
                    e.ai = A_WALK;
                    e.actT = def.param("castEvery", 6f);
                }
                return;
            default:
        }
        e.clip = 0;
        e.actT -= dt;
        if (moving && d > 1f) ai.walkTo(e, dt, dx, dy, d, 1f);
        if (e.phase > 0) {
            e.mt0 -= dt;
            if (e.mt0 <= 0f && d < def.param("pullRange", 340f) * 1.1f) {
                e.ai = BA_PULL_TELE;
                e.aiT = e.tele = e.teleMax = def.param("pullWarn", 1.1f);
                return;
            }
        }
        if (e.actT <= 0f && d < 420f) {
            e.ai = A_CAST;
            e.clip = Entities.CL_CAST;
            e.aiT = e.tele = e.teleMax = def.param("castTime", 0.8f);
            carpet(e, dx, dy, d);
        }
    }

    /** Slag pool carpet: 5 pools in a line from the boss toward the hero, each with its warning ring. */
    private void carpet(Enemy e, float dx, float dy, float d) {
        EnemyDef def = e.type.def;
        int n = Math.max(1, Math.round(def.param("pools", 5f)));
        float r = def.param("poolR", 60f);
        float ux = d > 1f ? dx / d : 1f, uy = d > 1f ? dy / d : 0f;
        for (int k = 0; k < n; k++) {
            ai.addHazard(Entities.HZ_SLAG, e.x + ux * r * 1.5f * (k + 1), e.y + uy * r * 1.5f * (k + 1), r,
                    def.param("poolT", 3f), def.param("poolDps", 8f), def.param("warn", 0.8f) + 0.08f * k);
        }
    }

    // ------------------------------------------------------------------ 5 The First

    /** The phase timers of The First: ring (mt0), tentacle burst (mt1), hounds and pulse (mt2), the lane gap (actT). */
    private void firstTimers(Enemy e, int phase) {
        EnemyDef def = e.type.def;
        switch (phase) {
            case 0:
                e.mt0 = 2.5f;
                e.mt1 = 4f;
                break;
            case 1:
                e.actT = 1.0f;
                e.mt2 = 3f;
                break;
            default:
                e.mt2 = 2.5f;
                e.mt0 = 3f;
                e.mt1 = 5f;
        }
    }

    private void first(Enemy e, float dt, boolean moving, float dx, float dy, float d) {
        EnemyDef def = e.type.def;
        int want = e.hp < e.maxHp * def.param("phase2Hp", 0.33f) ? 2 : e.hp < e.maxHp * def.param("phase1Hp", 0.66f) ? 1 : 0;
        if (want > e.phase) { // 66% / 33%: a roar, a short pause, then the next set of attacks
            e.phase = want;
            e.ai = BA_ROAR;
            e.aiT = e.tele = e.teleMax = 1.3f;
            for (int i = 0; i < s.hazN; i++) if (s.hazards[i].kind == Entities.HZ_LANE) s.hazards[i].life = Math.min(s.hazards[i].life, 0.05f);
            s.sound.emit(SoundEvents.THE_FIRST_ROAR);
            s.addFx(Entities.FX_SLAM, e.x, e.y, 200f, 0f, 0.6f, 0, false);
            s.screenShake(0.5f);
            s.screenFlash = Math.max(s.screenFlash, 0.3f);
            s.spark(e.x, e.y - 30f, 0xFF39FF88, 24);
        }
        e.clip = 0;
        switch (e.ai) {
            case BA_ROAR:
                e.clip = Entities.CL_CAST2;
                e.tele -= dt;
                if ((e.aiT -= dt) <= 0f) {
                    e.ai = A_WALK;
                    e.tele = 0f;
                    firstTimers(e, e.phase);
                }
                return;
            case BA_LANES:
                e.clip = Entities.CL_CAST;
                if ((e.aiT -= dt) <= 0f) {
                    e.ai = A_WALK;
                    e.actT = def.param("laneGap", 2f);
                }
                break;
            case BA_PULSE:
                e.tele -= dt;
                if ((e.aiT -= dt) <= 0f) pulse(e);
                break;
            default:
                if (moving && d > 130f) ai.walkTo(e, dt, dx, dy, d, 1f);
        }
        if (e.ai == BA_PULSE && moving && d > 130f) ai.walkTo(e, dt, dx, dy, d, 0.4f);
        switch (e.phase) {
            case 0:
                ringTimer(e, dt, def.param("ringEvery", 3.5f));
                tentacleTimer(e, dt, def.param("tentEvery", 5f));
                break;
            case 1:
                if (e.ai == A_WALK && (e.actT -= dt) <= 0f) startLanes(e, dx, dy);
                if ((e.mt2 -= dt) <= 0f) {
                    e.mt2 = def.param("houndEvery", 9f);
                    hounds(e);
                }
                break;
            default:
                ringTimer(e, dt, def.param("ringEvery3", 5f));
                tentacleTimer(e, dt, def.param("tentEvery3", 8f));
                if (e.ai == A_WALK && (e.mt2 -= dt) <= 0f) startPulse(e);
        }
    }

    private void ringTimer(Enemy e, float dt, float every) {
        if ((e.mt0 -= dt) > 0f) return;
        e.mt0 = every;
        EnemyDef def = e.type.def;
        int n = Math.round(def.param("ring", 12f));
        float sp = def.param("ringSpeed", 200f), dmg = def.param("ringDmg", 12f) * e.dmgMul;
        float a0 = e.cnt++ * 0.29f; // each ring is turned a little against the last
        for (int k = 0; k < n; k++) {
            float a = a0 + k * TAU / n;
            ai.shoot(e.x, e.y - 12f, (float) Math.cos(a) * sp, (float) Math.sin(a) * sp, dmg, 1.9f);
        }
        s.sound.emit(SoundEvents.SPORE_BURST);
    }

    private void tentacleTimer(Enemy e, float dt, float every) {
        if ((e.mt1 -= dt) > 0f) return;
        e.mt1 = every;
        EnemyDef def = e.type.def;
        s.tentacleWave(Math.round(def.param("tentCount", 3f)), def.param("tentRadius", 300f), false);
    }

    private void hounds(Enemy e) {
        int n = Math.round(e.type.def.param("hounds", 6f));
        float a0 = s.rng.nextFloat() * TAU;
        for (int k = 0; k < n; k++) {
            float a = a0 + k * 0.35f;
            s.spawnMinion("SPORE_HOUND", s.px + (float) Math.cos(a) * 340f, s.py + (float) Math.sin(a) * 260f);
        }
    }

    /** Two tendril lanes opposite each other from the boss, first aimed near the hero; a thin line for a second, then they sweep. */
    private void startLanes(Enemy e, float dx, float dy) {
        EnemyDef def = e.type.def;
        int n = Math.max(1, Math.round(def.param("lanes", 2f)));
        float base = (float) Math.atan2(dy, dx) + (s.rng.nextBoolean() ? 1f : -1f) * rnd(0.5f, 1.1f);
        float spin = (s.rng.nextBoolean() ? 1f : -1f) * def.param("laneSpin", 0.85f);
        float warn = def.param("laneWarn", 1f), life = def.param("laneLife", 3.2f);
        for (int k = 0; k < n; k++) {
            Hazard h = ai.addHazard(Entities.HZ_LANE, e.x, e.y, def.param("laneLen", 560f), life, def.param("laneDps", 22f), warn);
            if (h == null) continue;
            h.ang = base + k * TAU / n;
            h.spin = spin;
            h.w = def.param("laneW", 46f);
        }
        e.ai = BA_LANES;
        e.aiT = warn + life;
        s.sound.emit(SoundEvents.TENTACLE_EMERGE);
    }

    /**
     * The pulse: a line through the boss splits the floor in two halves, the unsafe one is hit when the warning runs
     * out. (ax, ay) is the unit normal pointing to the safe half, (t2, t3) a point of the line; when the hero stands too
     * deep in the unsafe half to get across in time the safe side is turned over to it.
     */
    private void startPulse(Enemy e) {
        EnemyDef def = e.type.def;
        float a = s.rng.nextFloat() * TAU;
        float nx = (float) Math.cos(a), ny = (float) Math.sin(a);
        float side = (s.px - e.x) * nx + (s.py - e.y) * ny;
        if (side < -170f) {
            nx = -nx;
            ny = -ny;
        }
        e.ax = nx;
        e.ay = ny;
        e.t2 = e.x;
        e.t3 = e.y;
        e.ai = BA_PULSE;
        e.aiT = e.tele = e.teleMax = def.param("pulseWarn", 1.5f);
        e.mt2 = def.param("pulseEvery", 6f);
    }

    private void pulse(Enemy e) {
        EnemyDef def = e.type.def;
        float side = (s.px - e.t2) * e.ax + (s.py - e.t3) * e.ay;
        if (side < 0f && s.invuln <= 0f && s.ended == 0) {
            s.hurtHero(Math.max(1f, def.param("pulseDmg", 28f) - (float) s.stats.armor), 0.5f, true, Sim.DMG_AREA);
        }
        s.addFx(Entities.FX_SLAM, e.x, e.y, 260f, 0f, 0.6f, 0, false);
        s.screenShake(0.4f);
        s.sound.emit(SoundEvents.BOSS_SLAM);
        e.ai = A_WALK;
        e.tele = 0f;
    }

    // ------------------------------------------------------------------ lumen tentacle

    /**
     * A tentacle breaks out where it was placed: a warning ring (it cannot be hit and does not hurt yet), then up for
     * {@code up} seconds (contact damage, killable, a kill drops gems), then it sinks away without a drop.
     */
    void tentacle(Enemy e, float dt) {
        e.x = e.ax;
        e.y = e.ay;
        e.kvx = e.kvy = 0f;
        e.clip = 0;
        if (e.ai == T_WARN) {
            e.tele -= dt;
            if ((e.aiT -= dt) <= 0f) {
                e.ai = T_UP;
                e.aiT = e.type.def.param("up", 1.2f);
                e.dormant = false;
                e.tele = 0f;
                s.sound.emit(SoundEvents.TENTACLE_EMERGE);
                s.spark(e.x, e.y - 6f, 0xFF39FF88, 6);
            }
        } else if ((e.aiT -= dt) <= 0f) {
            e.silent = true;
            s.killNow(e);
        }
    }
}
