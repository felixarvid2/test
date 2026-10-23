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
        /** Seconds left in which this enemy does not advance (set by knockback hits). */
        public float stagger;
        /** Knockback multiplier, 1 by default; Garlic raises it (lowers the enemy's knockback resistance). */
        public float kbMul = 1f;
        /** Absolute sim time before which the weapon in this slot cannot hit this enemy again. */
        public final float[] hitUntil = new float[Inventory.MAX_WEAPONS];
    }

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
        public final int[] hit = new int[24];
        public int hitN;

        public boolean alreadyHit(int id) {
            for (int i = 0; i < hitN; i++) if (hit[i] == id) return true;
            return false;
        }

        public void remember(int id) {
            if (hitN < hit.length) hit[hitN++] = id;
            else {
                hit[(id & 0x7fffffff) % hit.length] = id; // overwrite pseudo-randomly: very old hits may repeat
            }
        }
    }

    public static final int K_GEM = 0, K_COIN = 1, K_COINBAG = 2, K_ROAST = 3, K_VACUUM = 4, K_OROLOGION = 5,
            K_ROSARY = 6, K_CLOVER = 7, K_CHEST = 8;

    public static final class Pickup {
        public int kind;
        public float x, y, value, bob;
        public boolean pulled;
    }

    public static final class Particle {
        public float x, y, vx, vy, life, maxLife, size;
        public int color;
    }

    public static final class DamageText {
        public float x, y, life;
        public final char[] digits = new char[8];
        public int len;
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
