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
            P_FIRE = 6, P_PUDDLE = 7;

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
    }

    public static final int K_GEM = 0, K_COIN = 1, K_COINBAG = 2, K_ROAST = 3, K_VACUUM = 4, K_OROLOGION = 5,
            K_ROSARY = 6, K_CLOVER = 7, K_CHEST = 8;

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
    }

    public static final int FX_WHIP = 0, FX_BOLT = 1, FX_RING = 2, FX_FLASH = 3;

    public static final class Effect {
        public int kind;
        public boolean evo;
        public float x, y, w, h, life, maxLife;
        public int side;
    }
}
