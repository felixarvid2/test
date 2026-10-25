package se.felixarvid.thorsurvivors.game;

/** Plain mutable entity records. All are pre-allocated in pools by {@link Sim}; nothing is allocated per frame. */
public final class Entities {
    private Entities() {
    }

    public static final class Enemy {
        public EnemyType type;
        public boolean boss, dead;
        public int id;
        public float x, y, kvx, kvy;
        public float hp, maxHp, speed, power, radius, xp;
        public float flash, anim;
        /** The last hit came from a weapon that must not blank the sprite (lightning): shown as a soft brighten. */
        public boolean softFlash;
        /** Pool slot of this enemy's latest damage number (checked against DamageText.owner), -1 for none. */
        public int textSlot = -1;
        /** Set by the crowd separation: another enemy is in the way and nearer the player, so this one advances slowly. */
        public boolean blocked;
        /** Seconds left in which this enemy does not advance (set by knockback hits). */
        public float stagger;
        /** Knockback multiplier, 1 by default; Garlic raises it (lowers the enemy's knockback resistance). */
        public float kbMul = 1f;
        /**
         * Statuses (design section 7): one byte of stacks and one float timer per status. Burn ticks every 0.33 s for
         * 2.5 s, Frost slows for 4 s, Electrify ticks at 2.0 s x 0.854^(n-1) (every tick removes a stack), Decay lasts
         * 8 s. The *Hit fields hold the damage of the strongest applying hit: ticks are a fraction of it.
         */
        public byte burn, frost, elec, decay;
        public float burnT, frostT, elecT, decayT, burnAcc, burnHit, elecHit, decayHit;
        /** Speed multiplier from Frost (1 = none) and damage multiplier from Decay (1 = none), set by the status pass. */
        public float slow = 1f, dmgMul = 1f;
        /** Seconds stunned (cannot move or attack; Frost at its cap freezes through this) and rooted (cannot move). */
        public float stun, root;
        /** Pool slot of the latest status number of this enemy (checked against DamageText.owner), -1 for none. */
        public int statusTextSlot = -1;
        /** Fractional status damage not yet shown as a number, seconds of the Frost freeze left (for the tint), elite flag (stun x0.5). */
        public float dotAcc, freezeT;
        public boolean elite;

        // archetype state (design section 4; Sim.updateEnemies switches on type.arch)
        /** AI phase (AI_* of the archetype), seconds left in it, the cooldown to the next action, burst shots left. */
        public int ai, shots;
        public float aiT, actT, shotT;
        /** A locked direction or target (charge line, slag pool spot) and the telegraph: seconds left / total. */
        public float ax, ay, tele, teleMax, teleLen;
        /** Clip request for the renderer (CL_*): shot, cast or dash; 0 = walk. */
        public int clip;
        /** Seconds until this hound weaves the other way, and the weave sign. */
        public float weaveT;
        public int weave = 1;
        /** Trail spacing: distance moved since the last slag patch (Slagborn). */
        public float trail;
        public boolean enraged;

        // elites and bosses (design sections 4.1 and 5; see Elites and BossAi). One flagged slot of the normal pool.
        /** Boss phase (0, 1, 2), elite modifier bit mask (Elites.M_*), a counter and the draw-pool bag of a boss pattern. */
        public int phase, mods, cnt, bag;
        /** Elite modifier timers (barrage, volcano, raiser), the distance since the last fire / frost patch, boss timers. */
        public float mt0, mt1, mt2, etrail, t2, t3;
        /** Flat damage taken off every hit (the Armored elite), the multiplier on this enemy's shots (elite damage x1.5). */
        public float armor, shotMul = 1f;
        /** Seconds left in which the hero's ash slows this enemy by 20% (Ashwalker Treads). */
        public float ashLeft;
        /** A tentacle still warning: it cannot be hit and does not hurt. A silent enemy leaves without a kill or drops. */
        public boolean dormant, silent;
        /** Width in world units of this enemy's charge telegraph (0 = from its radius). */
        public float teleW;

        public void clearStatus() {
            burn = frost = elec = decay = 0;
            burnT = frostT = elecT = decayT = burnAcc = burnHit = elecHit = decayHit = 0f;
            slow = dmgMul = 1f;
            stun = root = 0f;
            statusTextSlot = -1;
            dotAcc = freezeT = 0f;
        }

        public void clearAi() {
            ai = shots = clip = 0;
            aiT = actT = shotT = tele = teleMax = trail = 0f;
            weaveT = 0f;
            weave = 1;
            enraged = false;
            phase = mods = cnt = bag = 0;
            mt0 = mt1 = mt2 = etrail = t2 = t3 = armor = ashLeft = teleW = 0f;
            shotMul = 1f;
            dormant = silent = false;
        }

        /**
         * Re-hit cooldowns of orbiting books and puddles: a ring of (projectile stamp, absolute time before which that
         * projectile cannot hit this enemy again), so every book and every puddle ticks on its own.
         */
        private final int[] cdStamp = new int[COOLDOWNS];
        private final float[] cdUntil = new float[COOLDOWNS];

        /** True (and starts the cooldown) if the projectile with this stamp may hit now; allocation-free. */
        public boolean tryTick(int stamp, float now, float delay) {
            int free = 0;
            for (int i = 0; i < COOLDOWNS; i++) {
                if (cdStamp[i] == stamp) {
                    if (now < cdUntil[i]) return false;
                    cdUntil[i] = now + delay;
                    return true;
                }
                // reuse an expired entry, else the one that expires first
                if (cdUntil[i] < cdUntil[free]) free = i;
            }
            cdStamp[free] = stamp;
            cdUntil[free] = now + delay;
            return true;
        }

        public void clearTicks() {
            java.util.Arrays.fill(cdStamp, 0);
            java.util.Arrays.fill(cdUntil, 0f);
        }
        /**
         * Stamps (Projectile.stamp, one per projectile and leg) of the last projectiles that hit this enemy, as a
         * ring; 0 is empty. Keeps "hit once per pass" exact however many enemies share the projectile's path.
         */
        public final int[] hitStamp = new int[HIT_STAMPS];
        private int hitHead;

        public boolean hitBy(int stamp) {
            for (int i = 0; i < HIT_STAMPS; i++) if (hitStamp[i] == stamp) return true;
            return false;
        }

        public void markHit(int stamp) {
            hitStamp[hitHead] = stamp;
            hitHead = (hitHead + 1) % HIT_STAMPS;
        }

        public void clearHits() {
            java.util.Arrays.fill(hitStamp, 0);
            hitHead = 0;
        }
    }

    /** Distinct projectile passes an enemy remembers (the oldest is forgotten first). */
    public static final int HIT_STAMPS = 16;
    /** Books and puddles an enemy keeps a re-hit cooldown for at once. */
    public static final int COOLDOWNS = 12;

    public static final int P_WHIP = 0, P_MISSILE = 1, P_KNIFE = 2, P_AXE = 3, P_CROSS = 4, P_BOOK = 5,
            P_FIRE = 6, P_PUDDLE = 7, P_MAIN = 8;
    /** {@link Projectile#sub} of P_MAIN projectiles (the main weapons, see {@code MainWeapon}) and of ground patches. */
    public static final int SUB_NONE = 0, SUB_BULLET = 1, SUB_SLUG = 2, SUB_BOLT = 3, SUB_BURST = 4, SUB_DART = 5,
            SUB_GRENADE = 6, SUB_BOMBLET = 7, SUB_WAVE = 8, SUB_PATCH_FIRE = 9, SUB_PATCH_DECAY = 10;
    /** {@link Projectile#status}: what a hit applies besides damage (see {@link Status}). */
    public static final int ST_NONE = 0, ST_BURN = 1, ST_DECAY = 2, ST_FROST = 3, ST_ELECTRIFY = 4;

    /** Clip requests of an enemy (Enemy.clip): the renderer plays the closest clip its model has. */
    public static final int CL_WALK = 0, CL_ATTACK2 = 1, CL_CAST = 2, CL_CAST2 = 3, CL_RUN = 4;

    /**
     * A projectile fired by an enemy (design section 4: red-orange core with a black outline, at most
     * {@link Sim#MAX_EPROJ} at once). A bolt reflected by Riot Guard II turns friendly and hurts enemies.
     */
    public static final class EProj {
        public float x, y, vx, vy, life, radius, dmg;
        public boolean friendly;
    }

    /** Ground areas of the enemies and the world: slag pools, spore clouds, frost patches (see {@link Sim#MAX_HAZ}). */
    public static final int HZ_SLAG = 0, HZ_CLOUD = 1, HZ_FROST = 2, HZ_BOMB = 3, HZ_LANE = 4, HZ_ASH = 5;
    /** {@link Hazard#variant} of a HZ_BOMB: a slag bomb (leaves a pool), a falling crate, a stomp, a volcano bomb. */
    public static final int BV_SLAG = 0, BV_CRATE = 1, BV_STOMP = 2, BV_VOLCANO = 3;

    /**
     * A ground area. HZ_BOMB: a ring that warns for {@code warn} s, then one blast of {@code dps} damage inside {@code r}
     * and a short afterglow of {@code life} s. HZ_LANE (The First's tendril): a line of length {@code r} and width {@code w}
     * from (x, y) at angle {@code ang} that turns {@code spin} rad/s and hurts {@code dps} per second.
     */
    public static final class Hazard {
        public int kind, variant;
        public float x, y, r, life, maxLife, warn, warnMax, dps, acc, ang, spin, w;
        public int n;
    }

    public static final class Projectile {
        public int kind, slot;
        public boolean evo, returning;
        public float x, y, vx, vy, angle, spin, life, maxLife, radius, dmg, knock, critChance, critMul;
        public float orbitAngle, orbitSpeed, orbitRadius, hitDelay, speedAlong, accel, blast;
        public int hitsLeft, targetId;
        /** Downward acceleration in u/s^2 (axes 1150, scythes 0). */
        public float gravity;
        /**
         * P_PUDDLE: seconds after the throw during which the flask is still in the air (puddle inactive);
         * age = maxLife - life, so the flask is airborne while age < flight. x,y is the landing spot.
         */
        public float flight;
        /** P_PUDDLE: radius growth in u/s once landed (La Borra) and drift speed toward the player in u/s. */
        public float grow, drift;
        /** Unique per projectile and per leg (a returning cross gets a fresh one); matched against Enemy.hitStamp. */
        public int stamp;
        /** P_MAIN / patch kind (SUB_*), the status a hit applies (ST_*, statusN stacks), and homing/inert flags. */
        public int sub, status, statusN;
        /** Inert projectiles (lobbed grenades) never collide; they only explode when their life ends. */
        public boolean inert;
        /** Explosion at the end of life: radius {@code blast} (existing field) and damage {@code blastDmg}. */
        public float blastDmg;
    }

    public static final int K_GEM = 0, K_COIN = 1, K_COINBAG = 2, K_ROAST = 3, K_VACUUM = 4, K_OROLOGION = 5,
            K_ROSARY = 6, K_CLOVER = 7, K_CHEST = 8, K_EQUIP = 9;

    public static final class Pickup {
        public int kind;
        public float x, y, value, bob;
        public boolean pulled;
        /** The single condensed red gem (kind K_GEM): holds the XP of far-away gems. */
        public boolean red;
    }

    public static final class Particle {
        public float x, y, vx, vy, life, maxLife, size;
        public int color;
    }

    public static final class DamageText {
        public float x, y, life, maxLife;
        public final char[] digits = new char[8];
        public int len, total, owner;
        public boolean crit, heal;
        /** RGB of a status number (burn orange, frost cyan, ...); 0 = the normal white / crit / heal colours. */
        public int color;
    }

    public static final int FX_WHIP = 0, FX_BOLT = 1, FX_RING = 2, FX_FLASH = 3, FX_BLAST = 4, FX_SWING = 5,
            FX_SLAM = 6, FX_MUZZLE = 7, FX_BURST = 8, FX_THRUST = 9, FX_LINE = 10, FX_TENDRIL = 11,
            FX_SPORE = 12, FX_BLINK = 13;

    /**
     * A dead enemy that is still playing its death animation and fading out. Purely visual: the Sim keeps a small ring
     * of these (Sim.corpses) so the renderer can draw the fall after the enemy has left the pool.
     */
    public static final class Corpse {
        public EnemyType type;
        public boolean boss, active, elite;
        public int id;
        public float x, y, age, radius;
    }

    public static final class Effect {
        public int kind;
        public boolean evo;
        public float x, y, w, h, life, maxLife;
        /** Direction in radians for the aimed effects (swing, muzzle flash, thrust, line). */
        public float a;
        public int side;
    }
}
