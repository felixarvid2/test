package se.felixarvid.thorsurvivors.game;

import se.felixarvid.thorsurvivors.data.EnemyDef;
import se.felixarvid.thorsurvivors.data.EquipDef;
import se.felixarvid.thorsurvivors.data.GameData;
import se.felixarvid.thorsurvivors.data.HeroDef;
import se.felixarvid.thorsurvivors.data.MainWeaponDef;
import se.felixarvid.thorsurvivors.data.StageDef;
import se.felixarvid.thorsurvivors.data.Treasure;
import se.felixarvid.thorsurvivors.data.WaveRow;
import se.felixarvid.thorsurvivors.data.WaveSelector;
import se.felixarvid.thorsurvivors.data.WeaponDef;
import se.felixarvid.thorsurvivors.game.Entities.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

/**
 * One run of the game. All entity storage is pre-allocated; update() performs no allocation
 * (apart from rare events such as level-ups and chests).
 */
public final class Sim {
    public static final int MAX_ENEMIES = 320, MAX_PROJ = 600, MAX_PICK = 1200, MAX_PART = 600, MAX_TEXT = 80,
            MAX_FX = 96;
    /** Enemy projectiles alive at once (design section 4: at most 40), ground hazards, and ranged enemies alive. */
    public static final int MAX_EPROJ = 40, MAX_HAZ = 32, RANGED_CAP = 24;
    /** World units visible vertically (the 16:9 view is VIEW_H * 16/9 wide); spawning and recycling derive from it. */
    public static final float VIEW_H = 560f;
    private static final float HALF_W = VIEW_H * 16f / 9f / 2f, HALF_H = VIEW_H / 2f;
    static final float ENEMY_SPEED_K = 0.6f, PLAYER_SPEED_K = 130f;
    static final float RECYCLE_DIST = HALF_W * 1.56f;
    static final int CELL = 96, GRID = 64, GRID_MASK = GRID - 1;

    public static final int B_WHIP = 0, B_MISSILE = 1, B_KNIFE = 2, B_AXE = 3, B_CROSS = 4, B_BOOK = 5, B_FIRE = 6,
            B_GARLIC = 7, B_WATER = 8, B_BOLT = 9;

    /** Per-slot weapon runtime state with cached effective stats. */
    public static final class WeaponState {
        public WeaponDef def;
        public int level, behavior, amount, pierce;
        public boolean evo, dependsOnDuration, endless, hasHitDelay;
        public String spriteKey = "";
        public float dmg, interval, area, speed, duration, repeat, hitDelay, knock, critChance, critMul;
        public float cd, shotCd, pulse, phase, leech;
        /** Garlic / Soul Eater aura radius in world units (50 u x area); the renderer draws the aura with it. */
        public float auraRadius;
        public int pending, shotIndex, side;
    }

    public final GameData data;
    public final StageDef stage;
    public final Inventory inv = new Inventory();
    public final Random rng = new Random();
    /** Sound events; Engine swaps in the shared queue, headless runs keep their own. */
    public SoundEvents sound = new SoundEvents();
    private float lastGemT = -10f;
    private int gemChain;
    public PlayerStats stats;
    private int statsLevel;
    private final Map<String, Double> meta;
    private double extraLuck;

    // hero and main weapon (null without a hero: the plain Vampire Survivors rules used by the legacy tests)
    public final HeroDef hero;
    public final MainWeapon main;
    /** Aim direction of the main weapon (unit vector): the aim input if any, else the facing direction. */
    public float aimX = 1, aimY = 0;
    /** True while there is aim input (right stick, touch aim area, arrow keys); false = aiming where the hero faces. */
    public boolean aimActive;
    /** Clip the player sprite should play for the main weapon (AC_*) and when the latest main attack happened. */
    public static final int AC_NONE = -1, AC_ATTACK = 0, AC_ATTACK2 = 1, AC_SLAM = 2, AC_SHOOT = 3, AC_THROW = 4,
            AC_CAST = 5, AC_CAST2 = 6;
    public int mainClip = AC_NONE;
    public float lastMainAttack = -10f;
    /** Riot Guard: seconds of reduced contact damage left and the reduction (0.15 = -15%). */
    public float guardT, guardDR;
    /** Dodge (design section 2): a 90-unit dash with 0.25 s invulnerability, 4 s cooldown scaled by the Cooldown stat. */
    public static final float DODGE_TIME = 0.25f, DODGE_DIST = 90f, DODGE_COOLDOWN = 4f;
    public float dodgeT, dodgeCd, dodgeCdMax = DODGE_COOLDOWN, dodgeDx, dodgeDy;
    /** True when the latest {@link #hurt} was a crit (read by Quick Shot III). */
    boolean lastCrit;
    private final float[] aimv = new float[2];

    // player
    public float px, py, hp, maxHp, faceX = 1, faceY = 0, invuln, walk;
    public boolean facingRight = true;
    public static final float PLAYER_R = 12f;
    public double time;
    public float tNow;
    public int kills, gold, level = 1, pendingLevelUps, pendingChests, revivalsUsed;
    public float xp;
    public int xpNeed = Progression.xpToNext(1);
    public int ended; // 0 running, 1 died, 2 won
    public float freezeTimer, hitShake, screenFlash;

    // pools
    public final Enemy[] enemies = new Enemy[MAX_ENEMIES];
    public int enemyN;
    public final Projectile[] projs = new Projectile[MAX_PROJ];
    public int projN;
    public final Pickup[] picks = new Pickup[MAX_PICK];
    public int pickN;
    public final Particle[] parts = new Particle[MAX_PART];
    public final DamageText[] texts = new DamageText[MAX_TEXT];
    public final Effect[] fx = new Effect[MAX_FX];
    /** Dying enemies (visual only), a ring: the renderer plays their death clip, then they fade (see {@link #CORPSE_LIFE}). */
    public static final int MAX_CORPSES = 96;
    public static final float CORPSE_LIFE = 2.0f;
    public final Corpse[] corpses = new Corpse[MAX_CORPSES];
    private int corpseHead;
    /** Projectiles of the enemies and the ground areas (slag pools, spore clouds); see {@link EnemyAi}. */
    public final EProj[] eprojs = new EProj[MAX_EPROJ];
    public int eprojN;
    public final Hazard[] hazards = new Hazard[MAX_HAZ];
    public int hazN;
    final EnemyAi ai = new EnemyAi(this);
    final BossAi boss = new BossAi(this, ai);
    final Elites elites = new Elites(this);
    /** Hero statuses from enemy hazards (design section 7): seconds left of Burn, Slow and Decay. */
    public float heroBurnT, heroSlowT, heroDecayT;
    private float statusAcc;
    private int statusTexts;
    /** Seconds the hero cannot walk (the Cargo Loader's charge), fractional HP of a Seed of Accord cloud not yet paid out. */
    public float heroStunT, healAcc;
    // equipment (design section 6): what is worn, and the choices waiting for the player (an item that is better than
    // the one in its slot; the Engine pauses on the bottom screen and calls resolveEquip). Run-only.
    public final Equipment equip = new Equipment();
    public static final int MAX_EQUIP_Q = 4;
    private final int[] eqQDef = new int[MAX_EQUIP_Q], eqQRar = new int[MAX_EQUIP_Q];
    public int equipN;
    /** Toasts on the top screen (newest last): text, seconds left and colour. */
    public static final int MAX_TOASTS = 3;
    public static final float TOAST_LIFE = 3.2f;
    public final String[] toastText = new String[MAX_TOASTS];
    public final float[] toastT = new float[MAX_TOASTS];
    public final int[] toastColor = new int[MAX_TOASTS];
    /** Elites (design section 5): when the next one is due, how many came, how many were killed, the one alive (or null). */
    public float nextEliteAt;
    public int eliteSpawned, eliteKilled;
    public Enemy eliteNow;
    /** The boss shown in the HUD (the first alive; The First before the others), the 2 s spawn banner, and The First's end. */
    public Enemy bossNow;
    public float bannerT;
    public String bannerKey = "", bannerName = ""; // the name is in capitals
    public static final float BANNER_LIFE = 2.0f;
    /** The First was killed: the run is won after a short delay and the gold counts twice. */
    public boolean firstKilled;
    private float winDelay;
    /** Lumen tentacle hazard (Deep Mines): the end of the running burst, the time of the next wave, the bursts already started. */
    private double tentUntil;
    private float tentNext;
    private int tentDone;
    private boolean seedDropped;
    private float ashDist;
    /** Time of the latest weapon use; the renderer plays the player's attack clip for a moment after it. */
    public float lastAttack = -10f;
    private int partHead, textHead, fxHead, nextId = 1;
    int nextStamp = 1;
    public final WeaponState[] weapons = new WeaponState[Inventory.MAX_WEAPONS];

    private final HashMap<String, EnemyType> types = new HashMap<>();
    private final int[] gridHead = new int[GRID * GRID];
    private final int[] gridNext = new int[MAX_ENEMIES];
    final int[] qbuf = new int[MAX_ENEMIES];
    private final float[] mv = new float[2];
    private final int[] pickBuf = new int[MAX_ENEMIES];
    // delayed lightning strikes (Thunder Loop's second strike)
    private final float[] strikeX = new float[64], strikeY = new float[64], strikeT = new float[64];
    private final int[] strikeSlot = new int[64];
    private int strikeN;

    // destructibles: one per ~500 x 500 u cell, placed from the cell alone (see destPlace). Cinder Flats and Deep Mines
    // mix explosive barrels (some in clusters, so they chain) and supply chests; Deep Mines adds rare stim pylons.
    public static final int MAX_DEST = 48;
    /** What a broken destructible drops, with percent weights (sums to 100). */
    static final double[] DEST_WEIGHT = {50, 14, 22, 4, 4, 3, 3};
    static final int[] DEST_DROP = {Entities.K_COIN, Entities.K_COINBAG, Entities.K_ROAST, Entities.K_VACUUM,
            Entities.K_OROLOGION, Entities.K_ROSARY, Entities.K_CLOVER};
    static final float DEST_CELL = 500f, DEST_R = 16f, DEST_CLEAR = 300f, PYLON_CELL = 2000f;
    /** Destructible kinds: the old brazier / candelabra (drops only), explosive barrel, supply chest, stim pylon. */
    public static final int DK_LEGACY = 0, DK_BARREL = 1, DK_CHEST = 2, DK_PYLON = 3;
    /** Barrel blast (design 9.1): radius 80, 5P (50) to every enemy and to the hero if within range; the hero takes 15 (an approximation: 5P on the hero would be half its health). */
    public static final float BARREL_R = 80f, BARREL_DMG = 50f, BARREL_HERO_DMG = 10f;
    /** A stim pylon heals 30% of max HP when destroyed; it works again 60 s after its last use. */
    public static final float PYLON_HEAL = 0.3f, PYLON_COOLDOWN = 60f;
    /** The destructibles of the cells around the player that are still standing (swap-remove compacted). */
    public final float[] destX = new float[MAX_DEST], destY = new float[MAX_DEST];
    public final byte[] destKind = new byte[MAX_DEST];
    private final long[] destKey = new long[MAX_DEST];
    public int destN;
    public int destsBroken;
    public float pylonCd;
    private final long[] broken = new long[512];
    private int brokenN, brokenHead;
    private int destCx = Integer.MIN_VALUE, destCy;
    private float placeX, placeY;
    private int placeKind;
    /** The stage layout (also what the renderer draws); destructibles keep off its trees, shelves and tables. */
    public final WorldGen map;

    private int lastRow = -1;
    private float spawnTimer;
    /** Fractional gold not yet paid out (Greed on 1-gold coins). */
    private double goldFrac;
    private float regenAcc;

    public Sim(GameData data, StageDef stage, String starterKey, Map<String, Double> meta) {
        this(data, stage, starterKey, meta, null);
    }

    /**
     * @param starterKey the auto weapon the run starts with (null: none, only the main weapon)
     * @param heroKey    hero key ("BASTION", ...) or null for the plain VS player without a main weapon
     */
    public Sim(GameData data, StageDef stage, String starterKey, Map<String, Double> meta, String heroKey) {
        this(data, stage, starterKey, meta, heroKey, 0L); // deterministic by default; the game passes a fresh seed
    }

    /** Same, with the random generator seeded before the first spawns (headless runs and soaks are then reproducible). */
    public Sim(GameData data, StageDef stage, String starterKey, Map<String, Double> meta, String heroKey, long seed) {
        this(data, stage, starterKey, meta, heroKey, Long.valueOf(seed));
    }

    private Sim(GameData data, StageDef stage, String starterKey, Map<String, Double> meta, String heroKey, Long seed) {
        rng.setSeed(seed);
        this.data = data;
        this.stage = stage;
        this.meta = meta;
        this.hero = heroKey == null ? null : data.heroes.get(heroKey);
        MainWeaponDef mwd = hero == null ? null : data.mainWeapons.get(hero.main);
        this.main = mwd == null ? null : new MainWeapon(this, hero, mwd);
        this.map = WorldGen.of(stage.key);
        java.util.Arrays.fill(gridHead, -1); // an empty grid until the first buildGrid (tests query before they update)
        for (int i = 0; i < MAX_ENEMIES; i++) enemies[i] = new Enemy();
        for (int i = 0; i < MAX_PROJ; i++) projs[i] = new Projectile();
        for (int i = 0; i < MAX_PICK; i++) picks[i] = new Pickup();
        for (int i = 0; i < MAX_PART; i++) parts[i] = new Particle();
        for (int i = 0; i < MAX_TEXT; i++) texts[i] = new DamageText();
        for (int i = 0; i < MAX_FX; i++) fx[i] = new Effect();
        for (int i = 0; i < MAX_CORPSES; i++) corpses[i] = new Corpse();
        for (int i = 0; i < MAX_EPROJ; i++) eprojs[i] = new EProj();
        for (int i = 0; i < MAX_HAZ; i++) hazards[i] = new Hazard();
        for (int i = 0; i < weapons.length; i++) weapons[i] = new WeaponState();
        nextEliteAt = (float) data.elite("first", 180);
        if (starterKey != null) inv.add(data.weapons.get(starterKey));
        recomputeAll();
        hp = maxHp;
        spawnInitial();
        refreshDestructibles();
    }

    public float cameraHalfW(float aspect) {
        return VIEW_H * aspect / 2f;
    }

    // ------------------------------------------------------------------ stats

    public void recomputeAll() {
        PlayerStats old = stats;
        statsLevel = level;
        stats = PlayerStats.compute(inv, meta, extraLuck, hero, level, equip, data);
        float nm = (float) stats.baseHp * (float) stats.maxHpMul;
        if (old != null) hp += Math.max(0, nm - maxHp);
        maxHp = nm;
        for (int i = 0; i < inv.weaponCount; i++) syncWeapon(i);
        if (main != null) main.sync();
    }

    private static int behaviorOf(String key) {
        switch (key) {
            case "WHIP": case "VAMPIRICA": return B_WHIP;
            case "MAGIC_MISSILE": case "HOLY_MISSILE": return B_MISSILE;
            case "KNIFE": case "THOUSAND": return B_KNIFE;
            case "AXE": case "SCYTHE": return B_AXE;
            case "CROSS": case "HEAVENSWORD": return B_CROSS;
            case "HOLYBOOK": case "VESPERS": return B_BOOK;
            case "FIREBALL": case "HELLFIRE": return B_FIRE;
            case "GARLIC": case "VORTEX": return B_GARLIC;
            case "HOLYWATER": case "BORA": return B_WATER;
            default: return B_BOLT;
        }
    }

    private void syncWeapon(int i) {
        Inventory.Slot s = inv.weapons[i];
        WeaponState w = weapons[i];
        boolean fresh = w.def == null || !w.def.key.equals(s.def.key);
        w.def = s.def;
        w.spriteKey = "proj." + s.def.key;
        w.level = s.level;
        w.behavior = behaviorOf(s.def.key);
        w.evo = s.def.evolution;
        Map<String, Double> m = s.def.statsAt(s.level);
        w.dmg = g(m, "power", 1) * 10f * (float) stats.might;
        w.interval = (float) Math.max(50, g(m, "interval", 1000)) / 1000f * (float) stats.cooldownMul;
        w.area = g(m, "area", 1) * (float) stats.areaMul;
        w.speed = g(m, "speed", 1) * (float) stats.speedMul;
        w.duration = g(m, "duration", 1000) / 1000f * (float) stats.durationMul;
        w.repeat = Math.max(0.03f, g(m, "repeatInterval", 100) / 1000f);
        w.hasHitDelay = m.containsKey("hitBoxDelay");
        w.hitDelay = Math.max(0.05f, g(m, "hitBoxDelay", 500) / 1000f);
        w.auraRadius = 50f * w.area;
        w.endless = s.def.key.equals("VESPERS");
        w.knock = g(m, "knockback", 0.3f);
        w.critChance = (g(m, "critChance", 0) + (float) stats.critBonus) * (1f + (float) stats.luck);
        w.critMul = g(m, "critMul", 2);
        w.amount = Math.max(1, Math.round(g(m, "amount", 1)) + stats.amountBonus);
        w.pierce = Math.max(1, Math.round(g(m, "penetrating", 1)));
        w.dependsOnDuration = g(m, "intervalDependsOnDuration", 0) > 0 || s.def.key.equals("HOLYBOOK");
        if (fresh) {
            w.cd = 0.4f + 0.15f * i;
            w.pending = 0;
            w.side = 1;
        }
    }

    private static float g(Map<String, Double> m, String k, double d) {
        Double v = m.get(k);
        return (float) (v == null ? d : v);
    }

    // ------------------------------------------------------------------ update

    public void update(float dt, Input input) {
        sound.advance(dt);
        if (ended != 0) return;
        time += dt;
        tNow = (float) time;
        input.move(mv);
        updateAim(input);
        updateDodge(input, dt);
        movePlayer(dt);
        refreshDestructibles();
        updateWaves(dt);
        statusAcc += dt;
        if (statusAcc >= Status.PASS) { // one pass at 10 Hz: Burn, Frost, Electrify, Decay and the hero's statuses
            statusAcc -= Status.PASS;
            if (statusAcc > Status.PASS) statusAcc = 0f; // a long stall does not owe several passes
            statusPass(Status.PASS);
        }
        updateEnemies(dt);
        buildGrid();
        separate(dt);
        ai.updateHazards(dt);
        updateWeapons(dt);
        if (main != null) main.update(dt);
        updateProjectiles(dt);
        ai.updateProjectiles(dt);
        contactDamage();
        reap();
        condenseT += dt;
        if (condenseT >= CONDENSE_EVERY) {
            condenseT = 0f;
            condenseFar();
        }
        updatePickups(dt);
        updateVisuals(dt);
        if (freezeTimer > 0) freezeTimer -= dt;
        if (invuln > 0) invuln -= dt;
        if (guardT > 0) guardT -= dt;
        if (hitShake > 0) hitShake -= dt;
        if (pylonCd > 0) pylonCd -= dt;
        if (screenFlash > 0) screenFlash -= dt;
        if (bannerT > 0) bannerT -= dt;
        for (int i = 0; i < MAX_TOASTS; i++) if (toastT[i] > 0f) toastT[i] -= dt;
        if (winDelay > 0f && (winDelay -= dt) <= 0f && ended == 0) ended = 2; // The First is dead: the run is won
        if (stats.regen > 0 && hp < maxHp) hp = Math.min(maxHp, hp + (float) stats.regen * dt);
        if (time >= stage.timeLimit) ended = 2;
    }

    /** Aim = the aim input when there is any, otherwise the (8-way) facing direction. */
    private void updateAim(Input input) {
        aimActive = input.aim(aimv);
        if (aimActive) {
            aimX = aimv[0];
            aimY = aimv[1];
        } else {
            float m = (float) Math.sqrt(faceX * faceX + faceY * faceY);
            if (m > 0.01f) {
                aimX = faceX / m;
                aimY = faceY / m;
            }
        }
    }

    /** Starts a dodge on request when off cooldown: a dash in the move direction (else the facing) and brief invulnerability. */
    private void updateDodge(Input input, float dt) {
        if (dodgeCd > 0) dodgeCd -= dt;
        if (!input.takeDodge() || dodgeCd > 0 || dodgeT > 0) return;
        float len = (float) Math.sqrt(mv[0] * mv[0] + mv[1] * mv[1]);
        if (len > 0.05f) {
            dodgeDx = mv[0] / len;
            dodgeDy = mv[1] / len;
        } else {
            float m = (float) Math.sqrt(faceX * faceX + faceY * faceY);
            dodgeDx = m > 0.01f ? faceX / m : 1f;
            dodgeDy = m > 0.01f ? faceY / m : 0f;
        }
        dodgeT = DODGE_TIME;
        dodgeCdMax = DODGE_COOLDOWN * (float) stats.cooldownMul * (float) stats.dodgeCooldown;
        dodgeCd = dodgeCdMax;
        invuln = Math.max(invuln, DODGE_TIME);
        sound.emit(SoundEvents.DODGE);
    }

    static final float ASH_EVERY = 50f;
    /**
     * Hazard slots kept free for telegraphs and boss attacks: the hero's ash trail stops filling the pool this many slots
     * short of it, elite trails and Slagborn's trail fewer ({@link #HAZ_RESERVE_TRAIL}).
     */
    static final int HAZ_RESERVE_ASH = 12, HAZ_RESERVE_TRAIL = 6;

    private void movePlayer(float dt) {
        if (dodgeT > 0) { // the dash replaces walking: DODGE_DIST units over DODGE_TIME
            float step = Math.min(dt, dodgeT);
            px += dodgeDx * (DODGE_DIST / DODGE_TIME) * step;
            py += dodgeDy * (DODGE_DIST / DODGE_TIME) * step;
            dodgeT -= dt;
            if (Math.abs(dodgeDx) > 0.1f) facingRight = dodgeDx > 0;
            return;
        }
        float mx = mv[0], my = mv[1];
        if (heroStunT > 0f) { // the Cargo Loader's charge: no walking for a moment
            heroStunT -= dt;
            mx = my = 0f;
        }
        float len = (float) Math.sqrt(mx * mx + my * my);
        float sp = PLAYER_SPEED_K * (float) stage.playerSpeed * (float) stats.moveSpeedMul;
        if (heroSlowT > 0) sp *= 1f - Status.HERO_SLOW;
        px += mx * sp * dt;
        py += my * sp * dt;
        if (stats.ashTrail && len > 0.05f) { // Ashwalker Treads: a patch of ash every 40 units, enemies in it move at 80%
            ashDist += len * sp * dt;
            if (ashDist >= ASH_EVERY) {
                ashDist = 0f;
                if (hazN < MAX_HAZ - HAZ_RESERVE_ASH) ai.addHazard(Entities.HZ_ASH, px, py + 6f, 28f, 1.6f, 0f, 0f); // leaves room for the telegraphs
            }
        }
        if (len > 0.05f) {
            // 8-way facing: snap the movement angle to the nearest 45 degrees; kept while standing still
            float snap = (float) (Math.PI / 4);
            float a = Math.round((float) Math.atan2(my, mx) / snap) * snap;
            faceX = (float) Math.cos(a);
            faceY = (float) Math.sin(a);
            if (Math.abs(faceX) < 1e-4f) faceX = 0;
            if (Math.abs(faceY) < 1e-4f) faceY = 0;
            if (Math.abs(mx) > 0.1f) facingRight = mx > 0;
            walk += dt * 10f * len;
        }
    }


    // ------------------------------------------------------------------ destructibles

    /** Type of the stage's destructible ("BRAZIER", "CANDELABRA", "MIXED_FLATS", "MIXED_MINES") or "" for none. */
    public String destType() {
        return stage.destructible;
    }

    private boolean mixedDest() {
        return stage.destructible.startsWith("MIXED");
    }

    /**
     * The destructible of 500 u cell (cx, cy) goes to placeX/placeY (its kind to placeKind); false when the cell has
     * none. A pure function of the cell (and the stage layout): the same cell always gives the same spot, never within
     * 300 u of the start and never on a tree, shelf or table.
     */
    boolean destPlace(int cx, int cy) {
        if (stage.destructible.isEmpty() || WorldGen.unit(WorldGen.hash(cx, cy, 699)) >= 0.9f) return false;
        for (int attempt = 0; attempt < 4; attempt++) {
            float x = cx * DEST_CELL + 40f + WorldGen.unit(WorldGen.hash(cx, cy, 700 + attempt * 2)) * (DEST_CELL - 80f);
            float y = cy * DEST_CELL + 40f + WorldGen.unit(WorldGen.hash(cx, cy, 701 + attempt * 2)) * (DEST_CELL - 80f);
            if (x * x + y * y < DEST_CLEAR * DEST_CLEAR || map.blocked(x, y)) continue;
            placeX = x;
            placeY = y;
            placeKind = !mixedDest() ? DK_LEGACY : WorldGen.unit(WorldGen.hash(cx, cy, 698)) < 0.58f ? DK_BARREL : DK_CHEST;
            return true;
        }
        return false;
    }

    float destPlaceX() {
        return placeX;
    }

    float destPlaceY() {
        return placeY;
    }

    int destPlaceKind() {
        return placeKind;
    }

    private static long cellKey(int cx, int cy) {
        return ((long) cx << 32) ^ (cy & 0xFFFFFFFFL);
    }

    private boolean isBroken(long key) {
        for (int i = 0; i < brokenN; i++) if (broken[i] == key) return true;
        return false;
    }

    private void addDest(float x, float y, int kind, long key) {
        if (destN >= MAX_DEST || isBroken(key)) return;
        destX[destN] = x;
        destY[destN] = y;
        destKind[destN] = (byte) kind;
        destKey[destN++] = key;
    }

    /** Re-lists the standing destructibles of the 5 x 5 cells around the player when the player enters a new cell. */
    private void refreshDestructibles() {
        int cx = (int) Math.floor(px / DEST_CELL), cy = (int) Math.floor(py / DEST_CELL);
        if (cx == destCx && cy == destCy) return;
        destCx = cx;
        destCy = cy;
        destN = 0;
        boolean mixed = mixedDest();
        for (int j = cy - 2; j <= cy + 2; j++) {
            for (int i = cx - 2; i <= cx + 2; i++) {
                if (!destPlace(i, j)) continue;
                float bx = placeX, by = placeY;
                int kind = placeKind;
                addDest(bx, by, kind, cellKey(i, j));
                if (!mixed || kind != DK_BARREL || WorldGen.unit(WorldGen.hash(i, j, 720)) >= 0.4f) continue;
                int extra = WorldGen.unit(WorldGen.hash(i, j, 721)) < 0.5f ? 2 : 1; // a cluster: barrels 36-66 u apart chain
                for (int k = 0; k < extra; k++) {
                    float a = WorldGen.unit(WorldGen.hash(i, j, 722 + k)) * 6.2831855f;
                    float d = 36f + 30f * WorldGen.unit(WorldGen.hash(i, j, 730 + k));
                    float x = bx + (float) Math.cos(a) * d, y = by + (float) Math.sin(a) * d;
                    if (!map.blocked(x, y)) addDest(x, y, DK_BARREL, cellKey(i, j) ^ ((k + 1) * 0x9E3779B97F4A7C15L));
                }
            }
        }
        if (!stage.destructible.equals("MIXED_MINES")) return;
        // stim pylons: rare, one per ~2000 x 2000 u
        int p0x = (int) Math.floor((cx - 2) * DEST_CELL / PYLON_CELL), p1x = (int) Math.floor((cx + 3) * DEST_CELL / PYLON_CELL);
        int p0y = (int) Math.floor((cy - 2) * DEST_CELL / PYLON_CELL), p1y = (int) Math.floor((cy + 3) * DEST_CELL / PYLON_CELL);
        for (int pj = p0y; pj <= p1y; pj++) {
            for (int pi = p0x; pi <= p1x; pi++) {
                if (WorldGen.unit(WorldGen.hash(pi, pj, 740)) >= 0.75f) continue;
                float x = pi * PYLON_CELL + 100f + WorldGen.unit(WorldGen.hash(pi, pj, 741)) * (PYLON_CELL - 200f);
                float y = pj * PYLON_CELL + 100f + WorldGen.unit(WorldGen.hash(pi, pj, 742)) * (PYLON_CELL - 200f);
                int ccx = (int) Math.floor(x / DEST_CELL), ccy = (int) Math.floor(y / DEST_CELL);
                if (ccx < cx - 2 || ccx > cx + 2 || ccy < cy - 2 || ccy > cy + 2) continue;
                if (x * x + y * y < DEST_CLEAR * DEST_CLEAR || map.blocked(x, y)) continue;
                addDest(x, y, DK_PYLON, cellKey(pi, pj) ^ 0x7000000000000000L);
            }
        }
    }

    /** Breaks every destructible whose body touches the circle (x, y, r). */
    void hitDest(float x, float y, float r) {
        for (int i = destN - 1; i >= 0; i--) {
            if (i >= destN) continue; // a barrel chain removed several
            float dx = destX[i] - x, dy = destY[i] - y, rr = r + DEST_R;
            if (dx * dx + dy * dy < rr * rr) breakDest(i);
        }
    }

    /** Same for a box centred on (cx, cy), w x h (the whip). */
    private void hitDestBox(float cx, float cy, float w, float h) {
        for (int i = destN - 1; i >= 0; i--) {
            if (i >= destN) continue;
            if (Math.abs(destX[i] - cx) < w / 2f + DEST_R && Math.abs(destY[i] - cy) < h / 2f + DEST_R) breakDest(i);
        }
    }

    /** True when a destructible touches the circle (x, y, r): a dashing welder runs into it. */
    boolean destTouches(float x, float y, float r) {
        for (int i = 0; i < destN; i++) {
            float dx = destX[i] - x, dy = destY[i] - y, rr = r + DEST_R;
            if (dx * dx + dy * dy < rr * rr) return true;
        }
        return false;
    }

    private void breakDest(int i) {
        broken[brokenHead] = destKey[i];
        brokenHead = (brokenHead + 1) % broken.length;
        brokenN = Math.min(broken.length, brokenN + 1);
        float x = destX[i], y = destY[i];
        int kind = destKind[i];
        destN--;
        destX[i] = destX[destN];
        destY[i] = destY[destN];
        destKey[i] = destKey[destN];
        destKind[i] = destKind[destN];
        destsBroken++;
        switch (kind) {
            case DK_BARREL:
                explodeBarrel(x, y);
                break;
            case DK_CHEST:
                sound.emit(SoundEvents.CRATE_BREAK);
                addFx(Entities.FX_FLASH, x, y - 6f, 70f, 0f, 0.2f, 0, false);
                spark(x, y - 8f, 0xFFB08850, 10);
                spark(x, y, 0xFF8A8070, 5);
                dropFromChest(x, y);
                break;
            case DK_PYLON:
                usePylon(x, y);
                break;
            default: // the old brazier / candelabra
                sound.emit(SoundEvents.BRAZIER_BREAK);
                addFx(Entities.FX_FLASH, x, y - 10f, 150f, 0f, 0.3f, 0, false);
                spark(x, y - 10f, 0xFFFFA030, 9);
                spark(x, y, 0xFF8A8070, 7);
                // mostly gold, sometimes a roast, rarely one of the power pickups
                dropFromDest(x, y);
        }
    }

    // barrel chain: a barrel that blows up inside another one's radius is queued and handled in order (no recursion)
    private final float[] chainX = new float[MAX_DEST + 4], chainY = new float[MAX_DEST + 4];
    private int chainN;
    private boolean inChain;

    /**
     * An explosive barrel goes off at (x, y): BARREL_DMG to every enemy within BARREL_R, BARREL_HERO_DMG to the hero if
     * within range (not while invulnerable, e.g. dodging), and every other destructible in range is broken too, so a
     * barrel next to a barrel chains.
     */
    void explodeBarrel(float x, float y) {
        if (chainN < chainX.length) {
            chainX[chainN] = x;
            chainY[chainN++] = y;
        }
        if (inChain) return;
        inChain = true;
        for (int q = 0; q < chainN; q++) {
            float bx = chainX[q], by = chainY[q];
            sound.emit(SoundEvents.BARREL_EXPLODE);
            addFx(Entities.FX_FLASH, bx, by - 10f, 170f, 0f, 0.35f, 0, false);
            addFx(Entities.FX_BLAST, bx, by, BARREL_R * 0.55f, 1f, 0.3f, 0, false);
            spark(bx, by - 10f, 0xFFFFA030, 14);
            spark(bx, by, 0xFF3A3028, 8);
            screenShake(0.12f);
            int n = query(bx, by, BARREL_R + 40f);
            for (int k = 0; k < n; k++) {
                Enemy e = enemies[qbuf[k]];
                if (e.dead) continue;
                float dx = e.x - bx, dy = e.y - by, rr = BARREL_R + e.radius * 0.5f;
                float d2 = dx * dx + dy * dy;
                if (d2 >= rr * rr) continue;
                float d = (float) Math.sqrt(d2) + 0.01f;
                hurt(e, BARREL_DMG, 0, 1, dx / d, dy / d, 1.2f);
            }
            float hx = px - bx, hy = py - by;
            if (hx * hx + hy * hy < BARREL_R * BARREL_R && invuln <= 0f) {
                hurtHero(Math.max(1f, BARREL_HERO_DMG - (float) stats.armor), 0.5f, true, DMG_BLAST);
            }
            hitDest(bx, by, BARREL_R - DEST_R); // other barrels, chests and pylons inside the blast break too (and chain)
        }
        chainN = 0;
        inChain = false;
    }

    void screenShake(float t) {
        hitShake = Math.max(hitShake, t);
    }

    /** A supply chest: gold (a bag, 60%) or a small pile of gems (never equipment). */
    void dropFromChest(float x, float y) {
        if (rng.nextFloat() < 0.6f) {
            addPickup(Entities.K_COINBAG, x, y, 10);
            addPickup(Entities.K_COIN, x + 10, y + 6, 1);
            return;
        }
        float v = 2f + (float) (time / 60.0) * 0.4f;
        for (int i = 0; i < 5; i++) {
            float a = i * 1.2566371f;
            addPickup(Entities.K_GEM, x + (float) Math.cos(a) * 14f, y + (float) Math.sin(a) * 10f, v);
        }
    }

    /** A stim pylon is broken: heals 30% of max HP unless it was used less than a minute ago. */
    private void usePylon(float x, float y) {
        sound.emit(SoundEvents.PYLON_USE);
        addFx(Entities.FX_FLASH, x, y - 20f, 120f, 0f, 0.3f, 0, false);
        spark(x, y - 20f, 0xFF50FFC0, 14);
        if (pylonCd > 0f) return;
        pylonCd = PYLON_COOLDOWN;
        heal(maxHp * PYLON_HEAL);
    }

    /** One pickup at (x, y): mostly gold, sometimes a roast, rarely Vacuum / Orologion / Rosary / Clover. */
    void dropFromDest(float x, float y) {
        double r = rng.nextDouble() * 100.0;
        int k = 0;
        for (; k < DEST_WEIGHT.length - 1; k++) {
            r -= DEST_WEIGHT[k];
            if (r < 0) break;
        }
        addPickup(DEST_DROP[k], x, y, DEST_DROP[k] == Entities.K_COIN ? 1 : DEST_DROP[k] == Entities.K_COINBAG ? 10 : 0);
    }

    // ------------------------------------------------------------------ waves & enemies

    EnemyType type(String key) {
        EnemyType t = types.get(key);
        if (t == null) {
            if (!data.enemies.containsKey(key)) return null;
            t = new EnemyType(data.enemies.get(key));
            types.put(key, t);
        }
        return t;
    }

    private void spawnInitial() {
        WaveRow row = stage.rows.get(0);
        for (int i = 0; i < stage.startingSpawns && row.enemies.length > 0; i++) {
            spawnAtRing(type(row.enemies[rng.nextInt(row.enemies.length)]), false, VIEW_H * 0.72f + rng.nextFloat() * VIEW_H * 0.53f);
        }
    }

    /** Tests: stops wave spawning so a scenario only contains the enemies it adds. */
    boolean noSpawns;

    /** Tests (other packages): same as setting {@link #noSpawns}. */
    public void noSpawnsForTest() {
        noSpawns = true;
    }

    /** Tests and screenshot tools (other packages): an enemy of the given type at an exact position, or null for an unknown key. */
    public Enemy spawnAt(String typeKey, float x, float y, boolean boss) {
        if (type(typeKey) == null || enemyN >= MAX_ENEMIES) return null;
        return addEnemy(typeKey, x, y, boss);
    }

    /** Tests and screenshot tools: a hostile bolt (null when the 40-bolt pool is full). */
    public EProj shootForTest(float x, float y, float vx, float vy, float dmg, float life) {
        return ai.shoot(x, y, vx, vy, dmg, life);
    }

    /** Tests and screenshot tools: a ground hazard (Entities.HZ_*), {@code warn} seconds of warning first. */
    public Hazard hazardForTest(int kind, float x, float y, float r, float life, float dps, float warn) {
        return ai.addHazard(kind, x, y, r, life, dps, warn);
    }

    /** Tests and screenshot tools (other packages): a pickup of any kind (Entities.K_*) at an exact position. */
    public void addPickupForTest(int kind, float x, float y, float value) {
        addPickup(kind, x, y, value);
    }

    /** Tests and screenshot tools (other packages): kills an enemy as a weapon would (it is reaped in the next step). */
    public void killForTest(Enemy e) {
        killNow(e);
    }

    /** Tests and screenshot tools: breaks the destructibles touching a circle, as a weapon hit does. */
    public void hitDestForTest(float x, float y, float r) {
        hitDest(x, y, r);
    }

    /** Tests and screenshot tools: rebuilds the enemy grid (the Sim does it every step). */
    public void rebuildGridForTest() {
        buildGrid();
    }

    /** Tests: adds one enemy of the given type at an exact position (stationary until its speed is set). */
    Enemy addEnemy(String typeKey, float x, float y, boolean boss) {
        Enemy e = enemies[enemyN++];
        initEnemy(e, type(typeKey), boss);
        e.x = x;
        e.y = y;
        return e;
    }

    /** Ash storms on Cinder Flats at 12:00 and 22:00 (design 9.1): 20 s long; light radius -40%, spawns +20%. */
    public static final float STORM_LEN = 20f, STORM_FADE = 1.5f, STORM_LIGHT = 0.4f, STORM_SPAWNS = 0.2f;
    static final float[] STORM_AT = {720f, 1320f};

    /** 0..1: how strongly the ash storm blows now (ramps in and out over {@link #STORM_FADE}); 0 outside the storms and on Deep Mines. */
    public float stormLevel() {
        if (!stage.key.equals("FLATS")) return 0f;
        for (float at : STORM_AT) {
            float t = (float) time - at;
            if (t < 0f || t > STORM_LEN) continue;
            return Math.min(1f, Math.min(t, STORM_LEN - t) / STORM_FADE);
        }
        return 0f;
    }

    /** Seconds since the current ash storm began, or -1 outside the storms (the banner shows for the first seconds). */
    public float stormElapsed() {
        if (!stage.key.equals("FLATS")) return -1f;
        for (float at : STORM_AT) {
            float t = (float) time - at;
            if (t >= 0f && t <= STORM_LEN) return t;
        }
        return -1f;
    }

    /** True while a storm blows (any strength). */
    public boolean ashStorm() {
        return stormLevel() > 0f;
    }

    /** Multiplier on the light radius: 1, or 0.6 at the height of an ash storm. */
    public float lightRadiusMul() {
        return 1f - STORM_LIGHT * stormLevel();
    }

    private void updateWaves(float dt) {
        if (noSpawns) return;
        int idx = se.felixarvid.thorsurvivors.data.WaveSelector.indexAt(stage.rows, time);
        WaveRow row = stage.rows.get(idx);
        if (idx != lastRow) {
            lastRow = idx;
            for (String b : row.bosses) {
                if (b.equals("BOSS_XLDEATH")) continue; // the reaper: the run is won at the time limit instead
                spawnAtRing(type(b), true, HALF_W + 100f);
            }
        }
        updateElites();
        if (stage.tentacleMinutes.length > 0) updateTentacles(dt);
        spawnTimer += dt * 1000f * (ashStorm() ? 1f + STORM_SPAWNS : 1f);
        if (spawnTimer >= row.frequencyMs) {
            spawnTimer = 0;
            // Vampire Survivors: each tick one of EACH enemy type of the row, then top the field up to `minimum`
            int each = WaveDirector.eachCount(row, enemyN);
            for (int i = 0; i < each; i++) spawnAtRing(type(row.enemies[i]), false, 0);
            int extra = WaveDirector.topUpCount(row, enemyN);
            for (int i = 0; i < extra; i++) {
                spawnAtRing(type(row.enemies[rng.nextInt(row.enemies.length)]), false, 0);
            }
        }
    }

    /** Ranged enemies alive (the cap of {@link #RANGED_CAP} keeps the enemy projectile budget). */
    int rangedAlive() {
        int n = 0;
        for (int i = 0; i < enemyN; i++) if (enemies[i].type.ranged && !enemies[i].dead) n++;
        return n;
    }

    /**
     * Spawn on a ring just outside the view (or left/right edges for horizontal stages). Waves obey the 300 cap
     * ({@link WaveDirector#ENEMY_CAP}); a ranged enemy beyond {@link #RANGED_CAP} alive spawns as a colonist; a spore
     * hound comes with its pack (group size from the data, trimmed to the cap).
     */
    void spawnAtRing(EnemyType t, boolean boss, float dist) {
        if (t == null || enemyN >= MAX_ENEMIES) return;
        if (!boss && enemyN >= WaveDirector.ENEMY_CAP) return;
        if (!boss && t.ranged && rangedAlive() >= RANGED_CAP) {
            EnemyType c = type("COLONIST");
            if (c != null) t = c;
        }
        Enemy e = enemies[enemyN++];
        place(e);
        if (dist > 0) {
            float a = rng.nextFloat() * 6.2831853f;
            e.x = px + (float) Math.cos(a) * dist;
            e.y = py + (float) Math.sin(a) * dist;
        }
        initEnemy(e, t, boss);
        if (boss) onBossSpawn(e); // only once the boss really exists
        if (t.arch == EnemyDef.ARCH_PACK && !boss) {
            int group = Math.round(t.def.param("group", 4f));
            for (int k = 1; k < group && enemyN < WaveDirector.ENEMY_CAP; k++) {
                Enemy f = enemies[enemyN++];
                f.x = e.x + (rng.nextFloat() - 0.5f) * 44f;
                f.y = e.y + (rng.nextFloat() - 0.5f) * 44f;
                initEnemy(f, t, false);
            }
        }
    }

    /** A boss exists: the spawn sound and, for the Ashfall bosses, the 2 s banner of the bottom screen (name and portrait). */
    private void onBossSpawn(Enemy e) {
        EnemyDef d = e.type.def;
        if (!d.ashfallBoss) {
            sound.emit(SoundEvents.BOSS_SPAWN);
            return;
        }
        sound.emit(e.type.pattern == 5 ? SoundEvents.THE_FIRST_ROAR : SoundEvents.BOSS_INTRO);
        bannerT = BANNER_LIFE;
        bannerKey = d.key;
        bannerName = e.type.nameUpper;
    }

    /** A summoned enemy near (x, y) (Vire raises colonists); false when the pool is full. */
    boolean spawnMinion(String key, float x, float y) {
        EnemyType t = type(key);
        if (t == null || enemyN >= MAX_ENEMIES - 4) return false;
        Enemy e = enemies[enemyN++];
        e.x = x;
        e.y = y;
        initEnemy(e, t, false);
        return true;
    }

    private void place(Enemy e) {
        float halfW = HALF_W + 60f;
        if (stage.horizontalSpawns) {
            float side = rng.nextBoolean() ? 1 : -1;
            e.x = px + side * (halfW + rng.nextFloat() * 80f);
            e.y = py + (rng.nextFloat() * 2f - 1f) * (VIEW_H / 2f + 60f);
        } else {
            float a = rng.nextFloat() * 6.2831853f;
            float d = halfW + 40f + rng.nextFloat() * 120f;
            e.x = px + (float) Math.cos(a) * d;
            e.y = py + (float) Math.sin(a) * d * 0.75f;
        }
    }

    /**
     * Ashfall bosses carry their final HP in the data (Z units, design 4.1), but the first one comes at 5:00 to a build
     * of level 10: their HP ramps from 20% (at 0:00) to 100% at minute {@code rampMinutes} (data "hpRamp", 0 = no ramp).
     */
    static double bossHpRamp(float rampMinutes, double seconds) {
        if (rampMinutes <= 0f) return 1.0;
        return Math.min(1.0, 0.2 + 0.8 * (seconds / 60.0) / rampMinutes);
    }

    private void initEnemy(Enemy e, EnemyType t, boolean boss) {
        e.type = t;
        e.boss = boss;
        e.elite = false;
        e.dead = false;
        e.id = nextId++;
        e.kvx = e.kvy = 0;
        e.stagger = 0;
        e.kbMul = 1f;
        e.flash = 0;
        e.softFlash = false;
        e.textSlot = -1;
        e.anim = rng.nextFloat() * 6f;
        e.clearTicks();
        e.clearHits();
        e.clearStatus();
        e.clearAi();
        // Ashfall bosses carry their final HP in the data; the Vampire Survivors ones get the old x3
        double hp = t.def.maxHp * 10.0 * (t.def.hpTimesLevel ? t.def.level : 1) * stage.enemyHealth
                * (1 + stats.curse) * (boss && !t.def.ashfallBoss ? 3.0 : 1.0);
        if (boss && t.def.ashfallBoss) hp *= bossHpRamp(t.def.param("hpRamp", 0f), time);
        e.hp = e.maxHp = (float) Math.max(1, hp);
        e.speed = (float) (t.def.speed * ENEMY_SPEED_K * stage.enemySpeed * (1 + stats.curse * 0.5) * stats.enemySpeed);
        e.power = (float) t.def.power;
        e.radius = t.radius * (boss ? 1.8f : 1f);
        e.xp = (float) (t.def.xp * stage.xpFade(time)); // Ashfall: the late-game XP fade (stage data)
        if (t.arch != EnemyDef.ARCH_CHASER) ai.init(e);
    }

    private void updateEnemies(float dt) {
        boolean frozen = freezeTimer > 0;
        float decay = (float) Math.exp(-9f * dt);
        Enemy bossFound = null, eliteFound = null;
        for (int i = 0; i < enemyN; i++) {
            Enemy e = enemies[i];
            e.anim += dt;
            if (e.flash > 0) e.flash -= dt;
            if (e.ashLeft > 0f) e.ashLeft -= dt;
            if (e.boss && !e.dead && (bossFound == null || e.type.pattern == 5)) bossFound = e;
            if (e.elite && !e.dead) eliteFound = e;
            float dx = px - e.x, dy = py - e.y;
            float d2 = dx * dx + dy * dy;
            if (e.dormant) { // a tentacle that is still warning: it only counts its ring down
                if (!frozen) boss.tentacle(e, dt);
                continue;
            }
            if (d2 > RECYCLE_DIST * RECYCLE_DIST && e.type.arch != EnemyDef.ARCH_TENTACLE) { // far behind the player: recycle to the opposite edge
                recycle(e, dx, dy, (float) Math.sqrt(d2));
                continue;
            }
            boolean stunned = e.stun > 0;
            boolean held = stunned || e.root > 0;
            if (e.stun > 0) e.stun -= dt;
            if (e.root > 0) e.root -= dt;
            boolean moving = false;
            if (e.stagger > 0) e.stagger -= dt;
            else moving = !frozen && !held;
            if (e.type.arch == EnemyDef.ARCH_CHASER) {
                if (moving) {
                    float d = (float) Math.sqrt(d2);
                    if (d > 1f) {
                        float sp = ai.speedOf(e);
                        e.x += dx / d * sp * dt;
                        e.y += dy / d * sp * dt;
                    }
                }
            } else if (!frozen && !stunned) {
                ai.update(e, dt, moving, dx, dy, d2);
            }
            if (e.elite && !frozen && !stunned) elites.update(e, dt, (float) Math.sqrt(d2));
            e.x += e.kvx * dt;
            e.y += e.kvy * dt;
            e.kvx *= decay;
            e.kvy *= decay;
        }
        bossNow = bossFound;
        eliteNow = eliteFound;
    }

    // ------------------------------------------------------------------ statuses (design section 7)

    /** Status damage numbers per pass, so 300 burning enemies cannot flood the 80-slot text ring. */
    private static final int MAX_STATUS_TEXTS = 10;
    private int statusPuffs;

    /**
     * The one status pass, every {@link Status#PASS} s: Burn ticks, Frost and Decay timers, Electrify ticks, the hero's
     * statuses. Touches only fields of the enemies and the preallocated pools: no allocation.
     */
    private void statusPass(float dt) {
        statusTexts = 0;
        statusPuffs = 0;
        for (int i = 0; i < enemyN; i++) {
            Enemy e = enemies[i];
            if (e.dead) continue;
            if (e.freezeT > 0) e.freezeT -= dt;
            if ((e.burn | e.frost | e.elec | e.decay) == 0) continue;
            boolean near = Math.abs(e.x - px) < HALF_W + 40f && Math.abs(e.y - py) < HALF_H + 40f;
            if (e.burn > 0) {
                e.burnAcc += dt;
                while (e.burnAcc >= Status.BURN_TICK) {
                    e.burnAcc -= Status.BURN_TICK;
                    statusDamage(e, Status.burnTick(e.burn, e.burnHit), Status.C_BURN, near);
                    if (near) sound.emit(SoundEvents.BURN_TICK);
                }
                if ((e.burnT -= dt) <= 0f) {
                    e.burn = 0;
                    e.burnHit = e.burnAcc = 0f;
                }
                if (near && e.burn > 0) puff(e, 0xFFFF8A30, -46f, 0.55f);
            }
            if (e.frost > 0 && (e.frostT -= dt) <= 0f) {
                e.frost = 0;
                e.slow = 1f;
            }
            if (e.elec > 0 && !e.dead) {
                e.elecT += dt;
                float iv = Status.electrifyInterval(e.elec);
                if (e.elecT >= iv) {
                    e.elecT -= iv;
                    float dmg = Status.electrifyTick(e.elec, e.elecHit);
                    if (--e.elec <= 0) {
                        e.elec = 0;
                        e.elecHit = e.elecT = 0f;
                    }
                    statusDamage(e, dmg, Status.C_ELEC, near);
                    if (near) {
                        sound.emit(SoundEvents.ELECTRIFY_ZAP);
                        puff(e, 0xFFFFF070, 0f, 1f);
                    }
                }
            }
            if (e.decay > 0 && !e.dead) {
                statusDamage(e, Status.decayPerSecond(e.decay, e.decayHit) * dt, Status.C_DECAY, near);
                if ((e.decayT -= dt) <= 0f) {
                    e.decay = 0;
                    e.decayHit = 0f;
                    e.dmgMul = 1f;
                } else if (near) {
                    puff(e, 0xFF7CE04A, 38f, 0.45f);
                }
            }
        }
        // the hero's statuses from enemy hazards: fixed values, no stacking, damage ignores armor
        float dot = 0f;
        if (heroBurnT > 0f) {
            heroBurnT -= dt;
            dot += Status.HERO_BURN_DPS * dt;
        }
        if (heroDecayT > 0f) {
            heroDecayT -= dt;
            dot += Status.HERO_DECAY_DPS * dt;
        }
        if (heroSlowT > 0f) heroSlowT -= dt;
        if (dot > 0f && ended == 0) areaDamage(dot);
    }

    /** Status damage: no flash and no hit sound; the number is coloured and merged per enemy. Kills when it empties the enemy. */
    void statusDamage(Enemy e, float amount, int color, boolean show) {
        if (e.dead || amount <= 0f) return;
        e.hp -= amount;
        e.dotAcc += amount;
        if (e.dotAcc >= 1f && show && statusTexts < MAX_STATUS_TEXTS) {
            int whole = (int) e.dotAcc;
            e.dotAcc -= whole;
            statusTexts++;
            addStatusText(e, whole, color);
        }
        if (e.hp <= 0) killNow(e);
    }

    /** A few coloured motes per pass (embers rise, drips fall); the budget keeps the particle ring for the weapons. */
    private void puff(Enemy e, int color, float vy, float chance) {
        if (statusPuffs >= 8 || rng.nextFloat() > chance) return;
        statusPuffs++;
        Particle q = parts[partHead];
        partHead = (partHead + 1) % MAX_PART;
        q.x = e.x + (rng.nextFloat() - 0.5f) * e.radius;
        q.y = e.y - e.radius * (0.4f + rng.nextFloat() * 0.8f);
        q.vx = (rng.nextFloat() - 0.5f) * 30f;
        q.vy = vy == 0f ? (rng.nextFloat() - 0.5f) * 60f : vy;
        q.life = q.maxLife = 0.35f + rng.nextFloat() * 0.25f;
        q.size = 3f + rng.nextFloat() * 2.5f;
        q.color = color;
    }

    /**
     * Adds {@code n} stacks of a status (Entities.ST_*) to an enemy, up to the cap of the status, and refreshes its
     * timer. {@code hit} is the damage of the hit that applied it: the ticks are a fraction of it (the strongest hit
     * counts). {@code seconds} is ignored: durations are the status's own (see {@link Status}). Frost at its cap
     * freezes the enemy for {@link Status#FREEZE_TIME} and the stacks start again.
     */
    public void applyStatus(Enemy e, int kind, int n, float hit, float seconds) {
        if (e.dead) return;
        switch (kind) {
            case Entities.ST_BURN:
                e.burn = (byte) Math.min(Status.BURN_CAP, e.burn + n);
                e.burnT = Status.BURN_TIME;
                e.burnHit = Math.max(e.burnHit, hit);
                break;
            case Entities.ST_FROST:
                e.frost = (byte) Math.min(Status.FROST_CAP, e.frost + n);
                e.frostT = Status.FROST_TIME;
                if (e.frost >= Status.FROST_CAP) {
                    e.frost = 0;
                    e.slow = 1f;
                    float t = Status.stunFor(Status.FREEZE_TIME, e.boss, e.elite);
                    e.freezeT = t;
                    e.stun = Math.max(e.stun, t);
                    sound.emit(SoundEvents.FROST_HIT);
                    spark(e.x, e.y - e.radius, 0xFF9FF0FF, 8);
                } else {
                    e.slow = Status.slowFactor(e.frost);
                    if (n > 0 && e.frost == 1) sound.emit(SoundEvents.FROST_HIT);
                }
                break;
            case Entities.ST_ELECTRIFY:
                e.elec = (byte) Math.min(Status.ELEC_CAP, e.elec + n);
                e.elecHit = Math.max(e.elecHit, hit);
                break;
            case Entities.ST_DECAY:
                if (n > 0 && e.decay == 0) sound.emit(SoundEvents.DECAY_HISS);
                e.decay = (byte) Math.min(Status.DECAY_CAP, e.decay + n);
                e.decayT = Status.DECAY_TIME;
                e.decayHit = Math.max(e.decayHit, hit);
                e.dmgMul = Status.decayDamageMul(e.decay);
                break;
            default:
        }
    }

    /** Stun (cannot move or attack); bosses take 25% of the duration, elites 50%. */
    public void stun(Enemy e, float seconds) {
        float t = Status.stunFor(seconds, e.boss, e.elite);
        if (t > 0.05f && e.stun <= 0f && seconds >= 0.3f) sound.emit(SoundEvents.STUN_HIT);
        e.stun = Math.max(e.stun, t);
    }

    /** Root (cannot move); bosses take 25% of the duration. */
    void root(Enemy e, float seconds) {
        e.root = Math.max(e.root, e.boss ? seconds * 0.25f : seconds);
    }

    /** Damage without a flash, number or sound (links); kills when it empties the enemy. */
    void dot(Enemy e, float amount) {
        if (e.dead || e.dormant) return;
        e.hp -= amount;
        if (e.hp <= 0) killNow(e);
    }

    /** Moves an enemy that fell far behind to the opposite screen edge, ahead of the player (VS recycling). */
    private void recycle(Enemy e, float dx, float dy, float d) {
        float ux = dx / d, uy = dy / d; // from the player toward the side the enemy was NOT on
        float ex = HALF_W + 60f, ey = HALF_H + 60f;
        float t = 1f / (float) Math.sqrt(ux * ux / (ex * ex) + uy * uy / (ey * ey));
        e.x = px + ux * t + (rng.nextFloat() - 0.5f) * 40f;
        e.y = py + uy * t + (rng.nextFloat() - 0.5f) * 40f;
        e.kvx = e.kvy = 0;
        e.stagger = 0;
    }

    void buildGrid() {
        java.util.Arrays.fill(gridHead, -1);
        for (int i = 0; i < enemyN; i++) {
            Enemy e = enemies[i];
            int c = cell(e.x, e.y);
            gridNext[i] = gridHead[c];
            gridHead[c] = i;
        }
    }

    private static int cell(float x, float y) {
        int cx = (int) Math.floor(x / CELL), cy = (int) Math.floor(y / CELL);
        return (cx & GRID_MASK) | ((cy & GRID_MASK) << 6);
    }

    /** Enemy indices within r of (x,y) (cell-level candidates, caller does the exact test). */
    int query(float x, float y, float r) {
        int n = 0;
        int x0 = (int) Math.floor((x - r) / CELL), x1 = (int) Math.floor((x + r) / CELL);
        int y0 = (int) Math.floor((y - r) / CELL), y1 = (int) Math.floor((y + r) / CELL);
        if (x1 - x0 >= GRID) x1 = x0 + GRID - 1;
        if (y1 - y0 >= GRID) y1 = y0 + GRID - 1;
        for (int cy = y0; cy <= y1; cy++) {
            for (int cx = x0; cx <= x1; cx++) {
                for (int i = gridHead[(cx & GRID_MASK) | ((cy & GRID_MASK) << 6)]; i >= 0; i = gridNext[i]) {
                    if (n < qbuf.length) qbuf[n++] = i;
                }
            }
        }
        return n;
    }

    /** Target spacing between two enemies as a fraction of the sum of their radii. */
    static final float SEP_SPACING = 0.8f;
    /** Overlap relaxation rate in 1/s: a pair closes {@code 1 - e^(-rate*dt)} of its overlap per step (~0.92 at 60 Hz, split over the passes). */
    static final float SEP_RATE = 150f;
    /** Relaxation passes per step: one is too soft against a crowd that keeps walking in. */
    static final int SEP_PASSES = 2;
    /** Speed factor of an enemy that is pressed against another one in front of it. */
    static final float BLOCKED_SPEED = 0.15f;

    /**
     * Pushes overlapping enemies apart until they are {@link #SEP_SPACING} x (r1 + r2) from each other. The correction
     * is scaled by dt, so the crowd looks the same at 60 and 120 Hz, and shared by inverse mass (radius squared) so a
     * boss shoulders the small ones aside instead of being shoved by them. Only the spatial grid is queried.
     */
    private void separate(float dt) {
        float maxR = 0f;
        for (int i = 0; i < enemyN; i++) maxR = Math.max(maxR, enemies[i].radius);
        float f = 1f - (float) Math.exp(-SEP_RATE * dt / SEP_PASSES); // the passes together close 1 - e^(-rate*dt)
        for (int i = 0; i < enemyN; i++) enemies[i].blocked = false;
        for (int pass = 0; pass < SEP_PASSES; pass++) {
            for (int i = 0; i < enemyN; i++) {
                Enemy a = enemies[i];
                int n = query(a.x, a.y, SEP_SPACING * (a.radius + maxR) + 4f);
                for (int k = 0; k < n; k++) {
                    int j = qbuf[k];
                    if (j <= i) continue;
                    Enemy b = enemies[j];
                    float dx = b.x - a.x, dy = b.y - a.y;
                    float min = (a.radius + b.radius) * SEP_SPACING;
                    float d2 = dx * dx + dy * dy;
                    if (d2 >= min * min) continue;
                    if (pass == 0) { // the one farther from the player is stuck behind the other and stops pushing in
                        float ax = a.x - px, ay = a.y - py, bx = b.x - px, by = b.y - py;
                        if (ax * ax + ay * ay > bx * bx + by * by) a.blocked = true;
                        else b.blocked = true;
                    }
                    float ma = a.radius * a.radius, mb = b.radius * b.radius;
                    float wb = ma / (ma + mb), wa = 1f - wb; // the lighter one moves more
                    float ux, uy;
                    if (d2 > 0.01f) {
                        float d = (float) Math.sqrt(d2);
                        float push = (min - d) * f;
                        ux = dx / d * push;
                        uy = dy / d * push;
                    } else { // exactly stacked: split along a direction derived from the ids
                        float ang = (a.id * 2.399963f) % 6.2831853f;
                        ux = (float) Math.cos(ang) * min * f;
                        uy = (float) Math.sin(ang) * min * f;
                    }
                    a.x -= ux * wa; a.y -= uy * wa;
                    b.x += ux * wb; b.y += uy * wb;
                }
            }
        }
    }

    private void contactDamage() {
        if (freezeTimer > 0 || invuln > 0) return;
        float best = 0;
        for (int i = 0; i < enemyN; i++) {
            Enemy e = enemies[i];
            if (e.dead || e.stun > 0 || e.dormant) continue; // a stunned enemy cannot attack, a tentacle that still warns does not hurt
            float dx = e.x - px, dy = e.y - py, rr = e.radius * 0.8f + PLAYER_R * 0.8f;
            if (dx * dx + dy * dy < rr * rr) best = Math.max(best, e.power * e.dmgMul); // Decay lowers what it deals
        }
        if (best <= 0) return;
        float taken = Math.max(1f, best - (float) stats.armor);
        if (guardT > 0) taken = Math.max(1f, taken * (1f - guardDR)); // Riot Guard
        hurtHero(taken, 0.5f, true);
    }

    /**
     * The hero takes {@code taken} damage (armor and guard already applied by the caller): hurt sound, invulnerability
     * for {@code inv} seconds, shake; a revival or the end of the run when it empties the health.
     */
    void hurtHero(float taken, float inv, boolean shake) {
        hurtHero(taken, inv, shake, DMG_CONTACT);
    }

    /** Hero damage taken this run by source (DMG_*): contact, enemy bolts, areas and statuses, barrel blasts. For balance runs and the result screen. */
    public static final int DMG_CONTACT = 0, DMG_BOLT = 1, DMG_AREA = 2, DMG_BLAST = 3;
    public final float[] dmgBy = new float[4];

    void hurtHero(float taken, float inv, boolean shake, int source) {
        taken *= (float) stats.damageTaken; // Riot Shield
        dmgBy[source] += taken;
        hp -= taken;
        sound.emit(SoundEvents.PLAYER_HURT);
        invuln = Math.max(invuln, inv);
        if (shake) hitShake = 0.15f;
        if (hp <= 0) checkHeroDeath();
    }

    /** Damage over time from the floor (slag, clouds, lanes): no armor and no hit sound, the equipment's damage taken still counts. */
    void areaDamage(float amount) {
        amount *= (float) stats.damageTaken;
        hp -= amount;
        dmgBy[DMG_AREA] += amount;
        if (hp <= 0f) checkHeroDeath();
    }

    /** The hero cannot walk for {@code seconds} (dodging still works). */
    void stunHero(float seconds) {
        heroStunT = Math.max(heroStunT, seconds);
    }

    /** Pushes the hero {@code dist} units along (dx, dy) (normalised here), less with Armored Greaves; not while dodging. */
    void shoveHero(float dx, float dy, float dist) {
        float m = (float) Math.sqrt(dx * dx + dy * dy);
        if (m < 1e-3f || dodgeT > 0f || ended != 0) return;
        float k = dist * (float) stats.knockbackTaken / m;
        px += dx * k;
        py += dy * k;
    }

    /** Drags the hero {@code dist} units toward (tx, ty), stopping 40 units short of it (the Foreman's pull). */
    void pullHero(float tx, float ty, float dist) {
        float dx = tx - px, dy = ty - py, d = (float) Math.sqrt(dx * dx + dy * dy);
        if (d < 40f) return;
        float k = Math.min(dist * (float) stats.knockbackTaken, d - 40f) / d;
        px += dx * k;
        py += dy * k;
    }

    /** Called when hp <= 0: spends a revival (and clears the screen around the hero) or ends the run. */
    void checkHeroDeath() {
        if (hp > 0f || ended != 0) return;
        if (revivalsUsed < stats.revivals) {
            revivalsUsed++;
            hp = maxHp * 0.5f;
            invuln = 2f;
            screenFlash = 0.4f;
            heroBurnT = heroDecayT = heroSlowT = 0f;
            for (int i = 0; i < enemyN; i++) {
                Enemy e = enemies[i];
                float dx = e.x - px, dy = e.y - py;
                if (dx * dx + dy * dy < 300f * 300f && !e.boss && !e.elite && !e.dormant) killNow(e);
            }
        } else {
            hp = 0;
            ended = 1;
        }
    }

    // ------------------------------------------------------------------ damage & kills

    /** Set while a lightning strike deals its damage: those hits show a soft brighten instead of the white silhouette. */
    private boolean softHit;

    public void hurt(Enemy e, float dmg, float chance, float critMul, float kx, float ky, float knock) {
        if (e.dead || e.dormant) return;
        boolean crit = chance > 0 && rng.nextFloat() < chance;
        lastCrit = crit;
        if (crit) dmg *= critMul;
        if (e.armor > 0f) dmg = Math.max(dmg * 0.4f, dmg - e.armor); // the Armored elite: 3 off every hit
        e.hp -= dmg;
        if (stats.statusChance[Entities.ST_BURN] > 0f || stats.statusChance[Entities.ST_FROST] > 0f
                || stats.statusChance[Entities.ST_ELECTRIFY] > 0f) { // rings: a chance per hit to add a stack
            for (int k = Entities.ST_BURN; k <= Entities.ST_ELECTRIFY; k++) {
                if (stats.statusChance[k] > 0.0 && rng.nextFloat() < stats.statusChance[k] && !e.dead) applyStatus(e, k, 1, dmg, 0f);
            }
        }
        e.flash = 0.1f;
        e.softFlash = softHit;
        addEnemyText(e, (int) dmg, crit);
        float k = knock * (float) e.type.def.knockback * e.kbMul;
        if (k > 0) {
            if (e.boss) k *= 0.05f; // bosses barely move and never stagger
            else e.stagger = Math.max(e.stagger, Math.min(0.2f, 0.1f + 0.05f * k));
            // total push = impulse / 9 (the knockback velocity decays at e^-9t); capped so heavy hits stay sane
            float v = Math.min(900f, k * 400f);
            e.kvx += kx * v;
            e.kvy += ky * v;
        }
        spark(e.x, e.y, e.type.gore, 2);
        if (e.hp <= 0) killNow(e);
        else sound.emit(SoundEvents.ENEMY_HIT);
    }

    void killNow(Enemy e) {
        if (e.dead) return;
        e.dead = true;
        e.hp = 0;
    }

    private void reap() {
        for (int i = enemyN - 1; i >= 0; i--) {
            Enemy e = enemies[i];
            if (!e.dead) continue;
            if (e.silent) { // a tentacle sinking away: no kill, no drops
                Enemy lastS = enemies[enemyN - 1];
                enemies[i] = lastS;
                enemies[enemyN - 1] = e;
                enemyN--;
                continue;
            }
            kills++;
            sound.emit(SoundEvents.ENEMY_DEATH);
            if (e.type.arch == EnemyDef.ARCH_EXPLODER) ai.carrierBurst(e); // a spore carrier bursts when it dies
            spark(e.x, e.y, e.type.gore, e.boss ? 24 : 7);
            addCorpse(e);
            drops(e);
            Enemy last = enemies[enemyN - 1];
            enemies[i] = last;
            enemies[enemyN - 1] = e;
            enemyN--;
        }
    }

    private void addCorpse(Enemy e) {
        Corpse c = corpses[corpseHead];
        corpseHead = (corpseHead + 1) % MAX_CORPSES;
        c.type = e.type;
        c.boss = e.boss;
        c.id = e.id;
        c.x = e.x;
        c.y = e.y;
        c.radius = e.radius;
        c.elite = e.elite;
        c.age = 0f;
        c.active = true;
    }

    private void drops(Enemy e) {
        addPickup(Entities.K_GEM, e.x, e.y, e.xp);
        if (e.elite) eliteRewards(e);
        if (e.boss) bossRewards(e);
        else if (e.type.arch == EnemyDef.ARCH_TENTACLE && e.cnt == 1 && !seedDropped && rng.nextFloat() < 0.25f) {
            EquipDef seed = data.uniqueBySource.get(e.type.def.key); // Seed of Accord: a tentacle killed in a hazard burst
            if (seed != null && equip.def[seed.slot] != seed) {
                seedDropped = true;
                dropEquipment(e.x, e.y, seed, Equipment.UNIQUE);
            }
        }
        if (e.boss) {
            addPickup(Entities.K_CHEST, e.x, e.y, 0);
            return;
        }
        if (rng.nextFloat() < 0.035f + 0.02f * (float) stats.luck) {
            double[] w = {50, 10, 12, 0.5, 2, 2, 1};
            int[] kinds = {Entities.K_COIN, Entities.K_COINBAG, Entities.K_ROAST, Entities.K_CLOVER,
                    Entities.K_VACUUM, Entities.K_OROLOGION, Entities.K_ROSARY};
            double tot = 0;
            for (double v : w) tot += v;
            double r = rng.nextDouble() * tot;
            int k = 0;
            for (; k < w.length - 1; k++) {
                r -= w[k];
                if (r < 0) break;
            }
            float val = kinds[k] == Entities.K_COIN ? 1 : kinds[k] == Entities.K_COINBAG ? 10 : 0;
            addPickup(kinds[k], e.x + 8, e.y + 8, val);
        }
    }

    /** Gems farther than this from the player are condensed into the red gem (VS: far gems merge). */
    static final float CONDENSE_DIST = RECYCLE_DIST;
    /** The red gem is kept (or moved) this close to the player; it moves when farther than RED_MAX. */
    static final float RED_MIN = 250f, RED_MAX = 350f;
    /** A new gem merges into a normal gem this near its drop point when the pool is full. */
    static final float MERGE_DIST = 80f, MERGE_CAP = 40f;
    static final float CONDENSE_EVERY = 0.5f;
    static final int GEM_RESERVE = 64;
    private float condenseT;

    /**
     * Ashfall late-fight readability (phase 12): once {@code GEM_MERGE_FROM} pickups lie around, a gem dropped far from the
     * hero ({@code FAR_MERGE_DIST}) folds into a normal gem within {@code FAR_MERGE_R}; with {@code GEM_MERGE_HARD} pickups also
     * the gems of the mid ring ({@code MID_MERGE_DIST}) do, within {@code MID_MERGE_R}. XP is kept (the merged gem is worth the
     * sum, up to {@code MERGE_CAP}), only the carpet of crystals gets thinner. Gems next to the hero stay separate.
     */
    static final int GEM_MERGE_FROM = 140, GEM_MERGE_HARD = 420;
    static final float FAR_MERGE_DIST = 300f, FAR_MERGE_R = 110f, MID_MERGE_DIST = 170f, MID_MERGE_R = 70f;

    void addPickup(int kind, float x, float y, float value) {
        if (kind == Entities.K_GEM && pickN >= GEM_MERGE_FROM) {
            float dx = x - px, dy = y - py, d2 = dx * dx + dy * dy;
            if (d2 > FAR_MERGE_DIST * FAR_MERGE_DIST) {
                if (mergeNearby(x, y, value, FAR_MERGE_R, MERGE_CAP)) return;
            } else if (pickN >= GEM_MERGE_HARD && d2 > MID_MERGE_DIST * MID_MERGE_DIST) {
                if (mergeNearby(x, y, value, MID_MERGE_R, MERGE_CAP)) return;
            }
        }
        // gems stop growing the pool GEM_RESERVE slots early so coins, food and chests always find room
        if (pickN >= (kind == Entities.K_GEM ? MAX_PICK - GEM_RESERVE : MAX_PICK)) {
            if (kind == Entities.K_GEM && mergeNearby(x, y, value)) return;
            if (!freeSlot() && pickN >= MAX_PICK) return; // only chests and crates left: nothing to evict
        }
        Pickup p = picks[pickN++];
        p.kind = kind;
        p.x = x + (rng.nextFloat() - 0.5f) * 10f;
        p.y = y + (rng.nextFloat() - 0.5f) * 10f;
        p.value = value;
        p.pulled = false;
        p.red = false;
        p.bob = rng.nextFloat() * 6f;
    }

    /** Pool full: adds a gem to the nearest normal gem within MERGE_DIST of (x, y). */
    private boolean mergeNearby(float x, float y, float value) {
        return mergeNearby(x, y, value, MERGE_DIST, MERGE_CAP);
    }

    /** Adds a gem to the nearest normal gem within {@code radius} of (x, y) whose value stays within {@code cap}. */
    private boolean mergeNearby(float x, float y, float value, float radius, float cap) {
        int best = -1;
        float bd = radius * radius;
        for (int i = 0; i < pickN; i++) {
            Pickup p = picks[i];
            if (p.kind != Entities.K_GEM || p.red || p.value + value > cap) continue;
            float dx = p.x - x, dy = p.y - y, d2 = dx * dx + dy * dy;
            if (d2 < bd) {
                bd = d2;
                best = i;
            }
        }
        if (best < 0) return false;
        picks[best].value += value;
        return true;
    }

    /** Pool full: frees one slot. Condenses the farthest normal gem into the red gem, else drops the farthest
     *  non-chest pickup. Returns false only when the pool holds nothing but chests. */
    private boolean freeSlot() {
        int g = farthest(true);
        if (g < 0) return dropFarthestOther();
        Pickup red = findRed();
        if (red == null) { // the evicted gem becomes the red gem; a second one is condensed into it to free a slot
            red = picks[g];
            red.red = true;
            int g2 = farthest(true);
            if (g2 < 0) { // a lone gem: it stays normal, evict something else
                red.red = false;
                return dropFarthestOther();
            }
            red.value += picks[g2].value;
            removePick(g2);
            relocateRed(red);
            return true;
        }
        red.value += picks[g].value;
        removePick(g);
        return true;
    }

    private boolean dropFarthestOther() {
        int f = farthest(false);
        if (f < 0) return false;
        removePick(f);
        return true;
    }

    /** Index of the farthest pickup from the player: a normal gem (gems = true) or any non-gem non-chest; -1 if none. */
    private int farthest(boolean gems) {
        int best = -1;
        float bd = -1f;
        for (int i = 0; i < pickN; i++) {
            Pickup p = picks[i];
            if (gems ? (p.kind != Entities.K_GEM || p.red) : (p.kind == Entities.K_GEM || p.kind == Entities.K_CHEST || p.kind == Entities.K_EQUIP)) continue;
            float dx = p.x - px, dy = p.y - py, d2 = dx * dx + dy * dy;
            if (d2 > bd) {
                bd = d2;
                best = i;
            }
        }
        return best;
    }

    Pickup findRed() {
        for (int i = 0; i < pickN; i++) if (picks[i].red) return picks[i];
        return null;
    }

    private void removePick(int i) {
        Pickup p = picks[i];
        picks[i] = picks[pickN - 1];
        picks[pickN - 1] = p;
        pickN--;
    }

    private void relocateRed(Pickup red) {
        float a = rng.nextFloat() * 6.2831855f, r = RED_MIN + rng.nextFloat() * (RED_MAX - RED_MIN);
        red.x = px + (float) Math.cos(a) * r;
        red.y = py + (float) Math.sin(a) * r;
    }

    /** Far-gem condensing (every CONDENSE_EVERY s): gems beyond CONDENSE_DIST fold into the single red gem, far
     *  non-chest pickups are despawned, and a red gem farther than RED_MAX is moved to the screen edge. */
    void condenseFar() {
        float lim2 = CONDENSE_DIST * CONDENSE_DIST, sum = 0f;
        Pickup red = null;
        for (int i = pickN - 1; i >= 0; i--) {
            Pickup p = picks[i];
            if (p.red) {
                red = p;
                continue;
            }
            if (p.kind == Entities.K_CHEST || p.kind == Entities.K_EQUIP) continue;
            float dx = p.x - px, dy = p.y - py;
            if (dx * dx + dy * dy <= lim2) continue;
            if (p.kind == Entities.K_GEM) sum += p.value;
            removePick(i);
        }
        if (sum > 0f) {
            if (red == null) { // a slot was freed above, so this cannot overflow
                red = picks[pickN++];
                red.kind = Entities.K_GEM;
                red.value = 0f;
                red.red = true;
                red.pulled = false;
                red.bob = 0f;
                red.x = px + RED_MAX * 2f; // relocated below
                red.y = py;
            }
            red.value += sum;
        }
        if (red != null) {
            float dx = red.x - px, dy = red.y - py;
            if (dx * dx + dy * dy > RED_MAX * RED_MAX) relocateRed(red);
        }
    }

    private void updatePickups(float dt) {
        float magnet = 70f * (float) stats.magnetMul;
        for (int i = pickN - 1; i >= 0; i--) {
            Pickup p = picks[i];
            p.bob += dt * 4f;
            float dx = px - p.x, dy = py - p.y;
            float d2 = dx * dx + dy * dy;
            boolean magnetic = p.kind <= Entities.K_COINBAG;
            if (magnetic && (p.pulled || d2 < magnet * magnet)) {
                float d = (float) Math.sqrt(d2);
                float sp = p.pulled ? 900f : 380f;
                if (d > 1f) {
                    p.x += dx / d * sp * dt;
                    p.y += dy / d * sp * dt;
                }
                dx = px - p.x;
                dy = py - p.y;
                d2 = dx * dx + dy * dy;
            }
            float cr = p.kind == Entities.K_CHEST || p.kind == Entities.K_EQUIP ? 30f : 20f;
            if (d2 < cr * cr) {
                collect(p);
                Pickup last = picks[pickN - 1];
                picks[i] = last;
                picks[pickN - 1] = p;
                pickN--;
            }
        }
    }

    private void collect(Pickup p) {
        switch (p.kind) {
            case Entities.K_GEM:
                gemChain = tNow - lastGemT < SoundEvents.GEM_CHAIN ? Math.min(SoundEvents.GEM_MAX_CHAIN, gemChain + 1) : 0;
                lastGemT = tNow;
                sound.emit(SoundEvents.GEM, gemChain);
                gainXp(p.value * (float) stage.xpBonus * (float) stats.growthMul);
                break;
            case Entities.K_COIN:
            case Entities.K_COINBAG:
                sound.emit(SoundEvents.COIN);
                // Greed gives fractions (1 gold x 1.2): carry the remainder so single coins still add up
                goldFrac += p.value * stage.goldMultiplier * stats.greedMul;
                int whole = (int) (goldFrac + 1e-6);
                goldFrac -= whole;
                gold += whole;
                break;
            case Entities.K_ROAST:
                sound.emit(SoundEvents.FOOD_HEAL);
                heal(30f);
                break;
            case Entities.K_VACUUM:
                sound.emit(SoundEvents.COIN);
                for (int i = 0; i < pickN; i++) if (picks[i].kind == Entities.K_GEM) picks[i].pulled = true;
                break;
            case Entities.K_OROLOGION:
                sound.emit(SoundEvents.COIN);
                freezeTimer = 10f;
                break;
            case Entities.K_ROSARY:
                sound.emit(SoundEvents.COIN);
                screenFlash = 0.5f;
                float hw = HALF_W, hh = HALF_H;
                for (int i = 0; i < enemyN; i++) {
                    Enemy e = enemies[i];
                    if (Math.abs(e.x - px) < hw && Math.abs(e.y - py) < hh) {
                        if (e.boss || e.elite) hurt(e, e.maxHp * 0.1f, 0, 1, 0, 0, 0);
                        else if (!e.dormant) killNow(e);
                    }
                }
                break;
            case Entities.K_CLOVER:
                sound.emit(SoundEvents.COIN);
                extraLuck += 0.1;
                recomputeAll();
                break;
            case Entities.K_CHEST:
                pendingChests++;
                break;
            case Entities.K_EQUIP: {
                int code = (int) (p.value + 0.5f);
                acquire(data.equipList.get(code >> 2), code & 3);
                break;
            }
        }
    }

    public void heal(float amount) {
        float before = hp;
        hp = Math.min(maxHp, hp + amount);
        if (hp - before >= 1f) addText(px, py - 20f, Math.round(hp - before), false, true);
    }

    private void gainXp(float amount) {
        xp += amount;
        while (xp >= xpNeed) {
            xp -= xpNeed;
            level++;
            pendingLevelUps++;
            sound.emit(SoundEvents.LEVEL_UP);
            xpNeed = Progression.xpToNext(level);
        }
        if (hero != null && level != statsLevel) recomputeAll(); // per-level hero growth
    }

    // ------------------------------------------------------------------ equipment (design section 6)

    /** A line on the top screen for a few seconds (the newest of {@link #MAX_TOASTS} stay). */
    public void toast(String text, int color) {
        for (int i = 0; i < MAX_TOASTS - 1; i++) {
            toastText[i] = toastText[i + 1];
            toastT[i] = toastT[i + 1];
            toastColor[i] = toastColor[i + 1];
        }
        toastText[MAX_TOASTS - 1] = text;
        toastT[MAX_TOASTS - 1] = TOAST_LIFE;
        toastColor[MAX_TOASTS - 1] = color;
    }

    /** "Rare Combat Helm" (a unique: just its name). */
    public static String itemName(EquipDef d, int rar) {
        return rar >= Equipment.UNIQUE ? d.name : Equipment.RARITY_NAMES[rar] + " " + d.name;
    }

    /** A supply crate with an item lands where an elite or a boss died; the pickup carries the item index and rarity. */
    void dropEquipment(float x, float y, EquipDef d, int rar) {
        addPickup(Entities.K_EQUIP, x, y, d.index * 4 + rar);
        sound.emit(SoundEvents.EQUIP_DROP);
    }

    /** Rarity of a dropped item: Common 60 / Uncommon 32 / Rare 8 at minute 3, 1.2 points a minute from Common to Rare, Luck helps the Rare roll. */
    int rollRarity() {
        double shift = Math.max(0.0, time / 60.0 - data.rule("fromMinute", 3)) * data.rule("shiftPerMin", 1.2);
        double luckPts = stats.luck * data.rule("luckPoints", 20);
        double rare = data.rule("rare", 8) + shift + luckPts;
        double common = Math.max(data.rule("commonMin", 10), data.rule("common", 60) - shift - luckPts);
        double unc = Math.max(0.0, data.rule("uncommon", 32));
        double r = rng.nextDouble() * (common + unc + rare);
        return r < common ? Equipment.COMMON : r < common + unc ? Equipment.UNCOMMON : Equipment.RARE;
    }

    /** Elite reward: one item (a crate) and a pile of gems worth {@code xpPileLevels} levels. */
    private void eliteRewards(Enemy e) {
        sound.emit(SoundEvents.ELITE_DIE);
        eliteKilled++;
        if (!data.baseItems.isEmpty()) {
            dropEquipment(e.x, e.y, data.baseItems.get(rng.nextInt(data.baseItems.size())), rollRarity());
        }
        int gems = Math.max(1, (int) data.elite("xpPileGems", 5));
        float each = (float) (xpNeed * data.elite("xpPileLevels", 2.0) / gems);
        for (int k = 0; k < gems; k++) {
            float a = k * 6.2831855f / gems;
            addPickup(Entities.K_GEM, e.x + (float) Math.cos(a) * 22f, e.y + (float) Math.sin(a) * 16f, each);
        }
    }

    /** Boss reward on top of the chest: the unique of a named boss; The First ends the run in victory with double gold. */
    private void bossRewards(Enemy e) {
        EquipDef u = e.type.def.ashfallBoss ? data.uniqueBySource.get(e.type.def.key) : null;
        if (u != null && equip.def[u.slot] != u) dropEquipment(e.x + 34f, e.y + 6f, u, Equipment.UNIQUE);
        if (e.type.pattern == 5 && !firstKilled) {
            firstKilled = true;
            winDelay = 2.2f;
            invuln = Math.max(invuln, 3f);
            screenFlash = Math.max(screenFlash, 0.5f);
            toast("THE FIRST IS DEAD  -  GOLD x2", 0xFF39FF88);
        }
    }

    /** Gold the run pays out: doubled when The First was killed. */
    public int endGold() {
        return firstKilled ? gold * 2 : gold;
    }

    /** The hero picks an item up: an empty slot equips it, a better one waits for a choice, anything else is salvaged. */
    private void acquire(EquipDef d, int rar) {
        int slot = d.slot;
        EquipDef cur = equip.def[slot];
        if (cur == null) {
            equip.def[slot] = d;
            equip.rar[slot] = rar;
            recomputeAll();
            sound.emit(SoundEvents.EQUIP_PICK);
            toast("EQUIPPED  " + itemName(d, rar), Equipment.RARITY_COLORS[rar]);
            return;
        }
        int oldRar = equip.rar[slot];
        float vNew = Equipment.value(data, rar), vOld = Equipment.value(data, oldRar);
        if (rar == Equipment.UNIQUE && oldRar < Equipment.RARE) { // a unique always replaces a Common or Uncommon item
            salvageOld(cur, oldRar);
            equip.def[slot] = d;
            equip.rar[slot] = rar;
            recomputeAll();
            sound.emit(SoundEvents.EQUIP_SWAP);
            toast("EQUIPPED  " + itemName(d, rar), Equipment.RARITY_COLORS[rar]);
        } else if (vNew > vOld + 1e-6f && equipN < MAX_EQUIP_Q) {
            eqQDef[equipN] = d.index;
            eqQRar[equipN++] = rar;
        } else {
            salvageNew(d, rar);
        }
    }

    private void salvageNew(EquipDef d, int rar) {
        int g = Equipment.salvage(data, rar);
        gold += g;
        sound.emit(SoundEvents.COIN);
        toast("SALVAGED  " + itemName(d, rar) + "  +" + g + " gold", 0xFFB8B0A4);
    }

    private void salvageOld(EquipDef d, int rar) {
        int g = Equipment.salvage(data, rar);
        gold += g;
        toast("SALVAGED  " + itemName(d, rar) + "  +" + g + " gold", 0xFFB8B0A4);
    }

    /** The item waiting for a choice (null when none) and its rarity. */
    public EquipDef equipQueuedDef() {
        return equipN > 0 ? data.equipList.get(eqQDef[0]) : null;
    }

    public int equipQueuedRar() {
        return equipN > 0 ? eqQRar[0] : 0;
    }

    /**
     * The choice screen's answer for the first waiting item: Replace wears it (the old one is salvaged for gold), Keep
     * salvages the new one. Items behind it that are no longer better than what is worn are salvaged without asking.
     */
    public void resolveEquip(boolean replace) {
        if (equipN == 0) return;
        EquipDef d = data.equipList.get(eqQDef[0]);
        int rar = eqQRar[0];
        popEquipQ();
        EquipDef cur = equip.def[d.slot];
        if (replace) {
            if (cur != null) salvageOld(cur, equip.rar[d.slot]);
            equip.def[d.slot] = d;
            equip.rar[d.slot] = rar;
            recomputeAll();
            sound.emit(SoundEvents.EQUIP_SWAP);
            toast("EQUIPPED  " + itemName(d, rar), Equipment.RARITY_COLORS[rar]);
        } else {
            salvageNew(d, rar);
        }
        while (equipN > 0) { // an older choice may have been settled by this one
            EquipDef n = data.equipList.get(eqQDef[0]);
            if (equip.def[n.slot] == null || Equipment.value(data, eqQRar[0]) > Equipment.value(data, equip.rar[n.slot]) + 1e-6f) break;
            salvageNew(n, eqQRar[0]);
            popEquipQ();
        }
    }

    private void popEquipQ() {
        for (int i = 0; i < equipN - 1; i++) {
            eqQDef[i] = eqQDef[i + 1];
            eqQRar[i] = eqQRar[i + 1];
        }
        equipN--;
    }

    /** Tests and screenshot tools: the hero wears (or is offered) an item as if the crate had been picked up. */
    public void giveEquipment(String key, int rarity) {
        EquipDef d = data.equipment.get(key);
        if (d != null) acquire(d, rarity);
    }

    // ------------------------------------------------------------------ elites (design section 5) and tentacles (4.1)

    /** True while an elite lives (the schedule allows one at a time). */
    boolean eliteAlive() {
        for (int i = 0; i < enemyN; i++) if (enemies[i].elite && !enemies[i].dead) return true;
        return false;
    }

    /**
     * An elite of {@code t} with the modifiers {@code mods} (bit mask, Elites.M_*) 400 units from the hero: HP x6, damage
     * x1.5, size x1.4, speed x0.9, XP x8, six colonists with it. Null when the pool has no room. One flagged slot of the
     * normal pool, no pool of its own.
     */
    Enemy spawnElite(EnemyType t, int mods) {
        if (t == null || enemyN >= MAX_ENEMIES - 8) return null;
        Enemy e = enemies[enemyN++];
        float a = rng.nextFloat() * 6.2831853f, dist = (float) data.elite("dist", 400);
        e.x = px + (float) Math.cos(a) * dist;
        e.y = py + (float) Math.sin(a) * dist;
        initEnemy(e, t, false);
        e.elite = true;
        e.mods = mods;
        float dmgMul = (float) data.elite("damageMul", 1.5);
        e.hp = e.maxHp = e.maxHp * (float) data.elite("hpMul", 6);
        e.power *= dmgMul;
        e.shotMul = dmgMul;
        e.radius *= (float) data.elite("scale", 1.4);
        e.speed *= (float) data.elite("speedMul", 0.9);
        e.xp *= (float) data.elite("xpMul", 8);
        if ((mods & Elites.M_ARMORED) != 0) {
            e.armor = (float) data.elite("armor", Elites.FLAT_ARMOR);
            e.kbMul = 0f; // cannot be knocked back
        }
        e.mt0 = 1.5f;
        e.mt1 = 2.5f;
        e.mt2 = Elites.RAISE_EVERY * 0.5f;
        int adds = (int) data.elite("adds", 6);
        float a0 = rng.nextFloat() * 6.2831853f;
        for (int k = 0; k < adds; k++) {
            float b = a0 + k * 6.2831853f / adds;
            spawnMinion("COLONIST", e.x + (float) Math.cos(b) * 50f, e.y + (float) Math.sin(b) * 42f);
        }
        eliteSpawned++;
        eliteNow = e;
        sound.emit(SoundEvents.ELITE_SPAWN);
        return e;
    }

    /** Tests and screenshot tools: an elite of a type with chosen modifiers at the usual distance. */
    public Enemy spawnEliteForTest(String typeKey, int mods) {
        return spawnElite(type(typeKey), mods);
    }

    /** The scheduler: the first elite at 3:00, then one every 150 s less 1% per minute (floor 100 s), one alive at a time. */
    private void updateElites() {
        if (time < nextEliteAt || eliteAlive()) return;
        WaveRow row = stage.rows.get(WaveSelector.indexAt(stage.rows, time));
        if (row.enemies.length == 0) return;
        EnemyType t = type(row.enemies[rng.nextInt(row.enemies.length)]);
        Enemy e = spawnElite(t, Elites.roll(rng, Elites.modCount(data, time)));
        if (e != null) nextEliteAt = (float) time + Elites.interval(data, time);
    }

    /** The Deep Mines hazard: bursts of tentacles at the stage's minutes, a wave of three every few seconds for a while. */
    private void updateTentacles(float dt) {
        int[] mins = stage.tentacleMinutes;
        if (time >= tentUntil) {
            for (int i = 0; i < mins.length; i++) {
                if ((tentDone >> i & 1) != 0 || time < mins[i] * 60.0) continue;
                tentDone |= 1 << i;
                if (time >= mins[i] * 60.0 + stage.tentacleLen) continue; // that burst is over already (a run started late)
                tentUntil = time + stage.tentacleLen - (time - mins[i] * 60.0);
                tentNext = 0.8f;
                toast("THE LUMEN RISES", 0xFF39FF88);
                break;
            }
            return;
        }
        if ((tentNext -= dt) <= 0f) {
            tentNext = stage.tentacleEvery;
            tentacleWave(stage.tentacleCount, stage.tentacleRadius, true);
        }
    }

    /** True while a tentacle burst of the stage hazard is running (tests). */
    public boolean tentacleEventOn() {
        return time < tentUntil;
    }

    /**
     * A wave of {@code count} tentacles round the hero within {@code radius}: a warning ring (0.8 s), then up for 1.2 s.
     * The first one lands on the hero when {@code onHero}. They may stand above the 300 wave cap (like bosses); a
     * killed tentacle of the stage hazard (cnt = 1) can drop the Seed of Accord.
     */
    void tentacleWave(int count, float radius, boolean hazard) {
        EnemyType t = type("LUMEN_TENTACLE");
        if (t == null) return;
        for (int k = 0; k < count && enemyN < MAX_ENEMIES - 6; k++) {
            float x, y;
            if (k == 0 && hazard) {
                x = px + (rng.nextFloat() - 0.5f) * 30f;
                y = py + (rng.nextFloat() - 0.5f) * 20f;
            } else {
                float a = rng.nextFloat() * 6.2831855f, r = 70f + rng.nextFloat() * (radius - 70f);
                x = px + (float) Math.cos(a) * r;
                y = py + (float) Math.sin(a) * r * 0.8f;
            }
            Enemy e = enemies[enemyN++];
            initEnemy(e, t, false);
            e.x = e.ax = x;
            e.y = e.ay = y;
            e.ai = BossAi.T_WARN;
            float warn = t.def.param("warn", 0.8f);
            e.aiT = e.tele = e.teleMax = warn;
            e.dormant = true;
            e.cnt = hazard ? 1 : 0;
        }
    }

    /** Tests and screenshot tools: a tentacle wave as the hazard makes it. */
    public void tentacleWaveForTest(int count, float radius, boolean hazard) {
        tentacleWave(count, radius, hazard);
    }

    // ------------------------------------------------------------------ level-up / chest application

    public void applyOffer(Offer o) {
        switch (o.kind) {
            case Offer.NEW_WEAPON:
            case Offer.NEW_PASSIVE:
                inv.add(o.def);
                break;
            case Offer.WEAPON_LEVEL:
            case Offer.PASSIVE_LEVEL:
                inv.levelUp(o.def.key);
                break;
            case Offer.HEAL:
                heal(30f);
                break;
            case Offer.BRANCH:
                if (main != null) main.pick(o.branchIdx, o.newLevel);
                break;
            default:
                gold += 25;
        }
        recomputeAll();
    }

    /** Used when the stage has no treasure table at or before the current minute: one evolution, else one upgrade. */
    private static final Treasure DEFAULT_TREASURE =
            new Treasure(new double[]{0, 0, 100}, 1, new String[]{Treasure.EVOLUTION});

    /** Opens one pending chest with the stage's treasure table for the current minute. Returns text lines. */
    public String[] openChest() {
        Treasure t = stage.treasureAt(time);
        return openChest(t != null ? t : DEFAULT_TREASURE);
    }

    /**
     * Opens one pending chest after a treasure table (the latest minute row at or before now that has one).
     * Item count: 5 with chance[0] percent, else 3 with chance[1] percent, else 1. chance[2] is the data's 1-item
     * chance; a chest never comes up empty, so a failed roll still gives 1 item. Item slots are filled in
     * prizeTypes order: EVOLUTION evolves a ready weapon (else acts as EXISTING_ANY), EXISTING_ANY levels a random
     * owned weapon or passive that is not maxed, EXISTING_WEAPON the same among weapons only, anything else counts
     * as EXISTING_ANY. When nothing can be levelled the slot is skipped; the gold bonus is always paid. The data's
     * `level` and `fixedPrizes` are not used.
     */
    public String[] openChest(Treasure t) {
        pendingChests--;
        sound.emit(SoundEvents.CHEST_OPEN);
        java.util.ArrayList<String> lines = new java.util.ArrayList<>();
        int n = rng.nextDouble() * 100 < t.chances[0] ? 5 : rng.nextDouble() * 100 < t.chances[1] ? 3 : 1;
        for (int i = 0; i < n; i++) {
            String type = t.prizeAt(i);
            if (Treasure.EVOLUTION.equals(type)) {
                int slot = inv.firstEvolvable(data.weapons);
                if (slot >= 0) {
                    String from = inv.weapons[slot].def.name;
                    WeaponDef to = inv.evolve(slot, data.weapons);
                    sound.emit(SoundEvents.EVOLUTION);
                    lines.add("EVOLUTION!");
                    lines.add(from + " -> " + to.name);
                    continue;
                }
            }
            Inventory.Slot s = randomUpgradable(Treasure.EXISTING_WEAPON.equals(type));
            if (s == null) continue;
            inv.levelUp(s.def.key);
            lines.add(s.def.name + " -> Lv " + s.level);
        }
        int coins = Math.round((30 + rng.nextInt(60)) * (float) stage.goldMultiplier * (float) stats.greedMul);
        gold += coins;
        lines.add("+" + coins + " gold");
        recomputeAll();
        return lines.toArray(new String[0]);
    }

    private Inventory.Slot randomUpgradable(boolean weaponsOnly) {
        Inventory.Slot[] pool = new Inventory.Slot[12];
        int n = 0;
        for (int i = 0; i < inv.weaponCount; i++) if (inv.weapons[i].level < inv.weapons[i].def.maxLevel()) pool[n++] = inv.weapons[i];
        if (!weaponsOnly) {
            for (int i = 0; i < inv.passiveCount; i++) if (inv.passives[i].level < inv.passives[i].def.maxLevel()) pool[n++] = inv.passives[i];
        }
        return n == 0 ? null : pool[rng.nextInt(n)];
    }

    // ------------------------------------------------------------------ weapons

    private static final float LEECH_PER_SECOND = 4f;
    /** Seconds a Santa Water flask is in the air before it becomes a puddle. */
    public static final float FLASK_FLIGHT = 0.3f;
    /** A lightning bolt stays on screen this long. */
    public static final float BOLT_LIFE = 0.12f;

    private void updateWeapons(float dt) {
        // delayed second strikes (Thunder Loop)
        for (int i = strikeN - 1; i >= 0; i--) {
            strikeT[i] -= dt;
            if (strikeT[i] <= 0) {
                int slot = strikeSlot[i];
                float x = strikeX[i], y = strikeY[i];
                strikeN--;
                strikeX[i] = strikeX[strikeN]; strikeY[i] = strikeY[strikeN];
                strikeT[i] = strikeT[strikeN]; strikeSlot[i] = strikeSlot[strikeN];
                if (slot < inv.weaponCount) strike(weapons[slot], x, y);
            }
        }
        for (int i = 0; i < inv.weaponCount; i++) {
            WeaponState w = weapons[i];
            if (w.pulse > 0) w.pulse -= dt;
            w.leech = Math.min(LEECH_PER_SECOND, w.leech + LEECH_PER_SECOND * dt);
            switch (w.behavior) {
                case B_GARLIC: garlic(w, i, dt); break;
                case B_BOOK: book(w, i, dt); break;
                default: volley(w, i, dt);
            }
        }
    }

    /**
     * Vampire Survivors volley rule: when the cooldown expires {@code amount} shots are fired, one every
     * repeatInterval, and the cooldown keeps running from the start of the volley. Lightning strikes all at once.
     */
    private void volley(WeaponState w, int slot, float dt) {
        w.cd -= dt; // the cooldown runs from the start of the volley, also while it is still firing
        if (w.pending == 0) {
            if (w.cd <= 0) {
                if (w.behavior == B_BOLT) {
                    if (collectOnScreen() == 0) { w.cd = 0.2f; return; } // bolts need a target on screen
                    lightning(w, slot);
                    w.cd += w.interval;
                    if (w.cd < 0) w.cd = w.interval;
                    return;
                }
                w.pending = w.amount;
                w.shotIndex = 0;
                w.shotCd = dt; // the first shot goes out this very frame
                w.phase = rng.nextFloat();
                w.cd += w.interval;
                if (w.cd < 0) w.cd = w.interval;
            }
        }
        if (w.pending > 0) {
            w.shotCd -= dt;
            while (w.pending > 0 && w.shotCd <= 0) {
                fire(w, slot);
                w.pending--;
                w.shotIndex++;
                w.shotCd += w.repeat;
            }
        }
    }

    private Enemy nearest(float maxDist) {
        Enemy best = null;
        float bd = maxDist * maxDist;
        for (int i = 0; i < enemyN; i++) {
            Enemy e = enemies[i];
            if (e.dead) continue;
            float dx = e.x - px, dy = e.y - py, d = dx * dx + dy * dy;
            if (d < bd) { bd = d; best = e; }
        }
        return best;
    }

    /** Fills pickBuf with indices of live enemies inside the 16:9 view; returns the count. */
    private int collectOnScreen() {
        int n = 0;
        for (int i = 0; i < enemyN; i++) {
            Enemy e = enemies[i];
            if (!e.dead && Math.abs(e.x - px) < HALF_W && Math.abs(e.y - py) < HALF_H) pickBuf[n++] = i;
        }
        return n;
    }

    private Enemy randomOnScreen() {
        int n = collectOnScreen();
        return n == 0 ? null : enemies[pickBuf[rng.nextInt(n)]];
    }

    private Enemy randomNear(float maxDist) {
        int n = 0;
        float r2 = maxDist * maxDist;
        for (int i = 0; i < enemyN; i++) {
            Enemy e = enemies[i];
            float dx = e.x - px, dy = e.y - py;
            if (!e.dead && dx * dx + dy * dy < r2) pickBuf[n++] = i;
        }
        return n == 0 ? null : enemies[pickBuf[rng.nextInt(n)]];
    }

    private Projectile newProj(int kind, int slot, WeaponState w) {
        if (projN >= MAX_PROJ) return null;
        Projectile p = projs[projN++];
        p.kind = kind;
        p.slot = slot;
        p.evo = w.evo;
        p.x = px; p.y = py; p.vx = p.vy = 0; p.angle = 0; p.spin = 0;
        p.life = p.maxLife = 2f;
        p.radius = 10f;
        p.dmg = w.dmg;
        p.knock = w.knock;
        p.critChance = w.critChance;
        p.critMul = w.critMul;
        p.hitsLeft = w.pierce;
        p.stamp = nextStamp++;
        p.returning = false;
        p.targetId = 0;
        p.blast = 0;
        p.gravity = 0;
        p.flight = 0;
        p.grow = p.drift = 0;
        p.sub = Entities.SUB_NONE;
        p.status = Entities.ST_NONE;
        p.statusN = 0;
        p.inert = false;
        p.blastDmg = 0;
        return p;
    }

    /** A fresh projectile of the main weapon (P_MAIN, slot 255) with the given SUB_* kind, or null when the pool is full. */
    Projectile newMainProj(int sub) {
        if (projN >= MAX_PROJ) return null;
        Projectile p = projs[projN++];
        p.kind = Entities.P_MAIN;
        p.sub = sub;
        p.slot = 255;
        p.evo = false;
        p.x = px; p.y = py; p.vx = p.vy = 0; p.angle = 0; p.spin = 0;
        p.life = p.maxLife = 1f;
        p.radius = 8f;
        p.dmg = 0; p.knock = 0; p.critChance = 0; p.critMul = 2;
        p.hitsLeft = 1;
        p.stamp = nextStamp++;
        p.returning = false;
        p.targetId = 0;
        p.blast = 0;
        p.blastDmg = 0;
        p.gravity = 0;
        p.flight = 0;
        p.grow = p.drift = 0;
        p.status = Entities.ST_NONE;
        p.statusN = 0;
        p.inert = false;
        p.hitDelay = 0;
        return p;
    }

    private void fire(WeaponState w, int slot) {
        lastAttack = tNow;
        switch (w.behavior) {
            case B_WHIP: whip(w); break;
            case B_MISSILE: {
                // nearest enemy at fire time, then a straight line: no homing
                Enemy t = nearest(1000f);
                Projectile p = newProj(Entities.P_MISSILE, slot, w);
                if (p == null) return;
                sound.emit(SoundEvents.MAGIC_MISSILE);
                float a = t != null ? (float) Math.atan2(t.y - py, t.x - px) : rng.nextFloat() * 6.2831853f;
                float sp = 400f * w.speed;
                p.vx = (float) Math.cos(a) * sp; p.vy = (float) Math.sin(a) * sp;
                p.angle = a;
                p.targetId = t == null ? 0 : t.id;
                p.radius = 9f * Math.max(0.8f, w.area) * (w.evo ? 1.3f : 1f);
                p.life = 2f;
                break;
            }
            case B_KNIFE: {
                Projectile p = newProj(Entities.P_KNIFE, slot, w);
                if (p == null) return;
                sound.emit(SoundEvents.KNIFE);
                float a = (float) Math.atan2(faceY, faceX) + (rng.nextFloat() - 0.5f) * 0.08f;
                float off = ((w.shotIndex % 3) - 1) * 9f; // successive knives sit side by side
                p.x = px - (float) Math.sin(a) * off; p.y = py + (float) Math.cos(a) * off;
                float sp = 600f * w.speed;
                p.vx = (float) Math.cos(a) * sp; p.vy = (float) Math.sin(a) * sp;
                p.angle = a;
                p.radius = 8f * Math.max(0.8f, w.area);
                p.life = 1.5f;
                break;
            }
            case B_AXE: {
                Projectile p = newProj(Entities.P_AXE, slot, w);
                if (p == null) return;
                sound.emit(SoundEvents.AXE);
                p.radius = 17f * w.area;
                p.hitsLeft = w.pierce;
                if (w.evo) {
                    // Death Spiral: evenly spaced radial spokes (random phase per volley), spinning, infinite pierce
                    float a = w.phase * 6.2831853f + w.shotIndex * 6.2831853f / Math.max(1, w.amount);
                    float sp = 300f * w.speed;
                    p.vx = (float) Math.cos(a) * sp; p.vy = (float) Math.sin(a) * sp;
                    p.spin = 11f;
                    p.life = 3.2f;
                    p.hitsLeft = 100000;
                } else {
                    // thrown up with a random horizontal speed; successive axes alternate sides so they fan out
                    boolean right = ((w.shotIndex & 1) == 0) == (w.phase < 0.5f);
                    float vx = 30f + rng.nextFloat() * 140f;
                    p.vx = right ? vx : -vx;
                    p.vy = -(560f + rng.nextFloat() * 70f) * Math.max(0.8f, w.speed);
                    p.gravity = 1150f;
                    p.spin = (right ? 1 : -1) * 9f;
                    p.life = 4f;
                }
                break;
            }
            case B_CROSS: {
                Projectile p = newProj(Entities.P_CROSS, slot, w);
                if (p == null) return;
                sound.emit(SoundEvents.CROSS);
                Enemy t = nearest(1000f);
                float ax = faceX, ay = faceY;
                if (t != null) { ax = t.x - px; ay = t.y - py; }
                float a = (float) Math.atan2(ay, ax);
                p.angle = a;
                p.vx = (float) Math.cos(a); // unit launch direction; the cross stays on this line
                p.vy = (float) Math.sin(a);
                float v0 = 520f * w.speed;
                p.speedAlong = v0; // signed speed along the line: decelerates through 0 and goes negative
                p.accel = v0 / 1.1f;
                p.radius = 15f * w.area;
                p.life = p.maxLife = 3f;
                p.hitsLeft = 100000;
                p.spin = 10f;
                break;
            }
            case B_FIRE: {
                Projectile p = newProj(Entities.P_FIRE, slot, w);
                if (p == null) return;
                sound.emit(SoundEvents.FIREBALL);
                Enemy t = randomOnScreen();
                float a = t != null ? (float) Math.atan2(t.y - py, t.x - px) : rng.nextFloat() * 6.2831853f;
                if (w.shotIndex > 0) a += (rng.nextFloat() - 0.5f) * 0.2f;
                float sp = (w.evo ? 240f : 280f) * w.speed;
                p.vx = (float) Math.cos(a) * sp; p.vy = (float) Math.sin(a) * sp;
                p.radius = (w.evo ? 24f : 12f) * Math.max(0.8f, w.area);
                p.life = 2.6f;
                if (w.evo) p.hitsLeft = 100000;
                break;
            }
            case B_WATER: {
                Projectile p = newProj(Entities.P_PUDDLE, slot, w);
                if (p == null) return;
                // a flask lands within ~250 u of the player, biased toward enemies
                Enemy t = rng.nextFloat() < 0.7f ? randomNear(250f) : null;
                if (t != null) { p.x = t.x + (rng.nextFloat() - 0.5f) * 20f; p.y = t.y + (rng.nextFloat() - 0.5f) * 20f; }
                else {
                    float a = rng.nextFloat() * 6.2831853f, d = 250f * (float) Math.sqrt(rng.nextFloat());
                    p.x = px + (float) Math.cos(a) * d; p.y = py + (float) Math.sin(a) * d;
                }
                p.radius = 40f * w.area;
                p.flight = FLASK_FLIGHT;
                float active = Math.max(0.6f, w.duration);
                p.life = p.maxLife = FLASK_FLIGHT + active;
                p.hitDelay = w.hitDelay;
                p.hitsLeft = 1 << 30;
                if (w.evo) { // La Borra: grows over its lifetime and drifts toward the player
                    p.grow = p.radius * 0.8f / active;
                    p.drift = 22f;
                }
                break;
            }
            default:
                break;
        }
    }

    private void whip(WeaponState w) {
        int idx = w.shotIndex;
        boolean right = (idx & 1) == 0 ? facingRight : !facingRight; // 2nd strike goes to the opposite side
        int side = right ? 1 : -1;
        w.side = side;
        float W = 160f * w.area, H = 30f * w.area;
        float cx = px + side * W / 2f, cy = py - 6f - 8f * idx;
        sound.emit(SoundEvents.WHIP);
        addFx(Entities.FX_WHIP, cx, cy, W, H, 0.15f, side, w.evo);
        if (destN > 0) hitDestBox(cx, cy, W, H);
        int n = query(cx, cy, Math.max(W, H) / 2f + 40f);
        int hits = 0;
        for (int k = 0; k < n; k++) {
            Enemy e = enemies[qbuf[k]];
            if (e.dead) continue;
            if (Math.abs(e.x - cx) < W / 2f + e.radius && Math.abs(e.y - cy) < H / 2f + e.radius) {
                hurt(e, w.dmg, w.critChance, w.critMul, side, 0, w.knock);
                hits++;
            }
        }
        if (w.evo && hits > 0) leech(w, Math.min(3f, hits * w.dmg * 0.08f));
    }

    /** Heals from a weapon against a per-second budget so lifesteal stays small. */
    private void leech(WeaponState w, float amount) {
        amount = Math.min(amount, w.leech);
        if (amount <= 0) return;
        w.leech -= amount;
        heal(amount);
    }

    /** Strikes {@code amount} distinct random on-screen enemies; Thunder Loop queues a second strike 0.2 s later. */
    private void lightning(WeaponState w, int slot) {
        int n = collectOnScreen();
        int k = Math.min(w.amount, n);
        for (int i = 0; i < k; i++) {
            int j = i + rng.nextInt(n - i);
            int tmp = pickBuf[i]; pickBuf[i] = pickBuf[j]; pickBuf[j] = tmp;
        }
        for (int i = 0; i < k; i++) {
            Enemy e = enemies[pickBuf[i]];
            float x = e.x, y = e.y;
            strike(w, x, y);
            if (w.evo && strikeN < strikeT.length) {
                strikeX[strikeN] = x; strikeY[strikeN] = y; strikeT[strikeN] = 0.2f; strikeSlot[strikeN] = slot;
                strikeN++;
            }
        }
    }

    private void strike(WeaponState w, float tx, float ty) {
        float r = 25f * w.area;
        lastAttack = tNow;
        sound.emit(SoundEvents.LIGHTNING);
        addFx(Entities.FX_BOLT, tx, ty, r, 0, BOLT_LIFE, 0, w.evo);
        if (destN > 0) hitDest(tx, ty, r);
        int n = query(tx, ty, r + 30f);
        for (int k = 0; k < n; k++) {
            Enemy e = enemies[qbuf[k]];
            if (e.dead) continue;
            float dx = e.x - tx, dy = e.y - ty, rr = r + e.radius;
            if (dx * dx + dy * dy < rr * rr) {
                softHit = true;
                hurt(e, w.dmg, w.critChance, w.critMul, 0, 0, 0);
                softHit = false;
                applyStatus(e, Entities.ST_ELECTRIFY, w.evo ? 2 : 1, w.dmg, 0f); // Arc Coil: Electrify
            }
        }
    }

    private void garlic(WeaponState w, int slot, float dt) {
        w.cd -= dt;
        if (w.cd > 0) return;
        w.cd += Math.max(0.15f, w.hasHitDelay ? w.hitDelay : w.interval);
        w.pulse = 0.25f;
        lastAttack = tNow;
        float r = w.auraRadius;
        if (destN > 0) hitDest(px, py, r);
        int n = query(px, py, r + 30f);
        int hits = 0;
        for (int k = 0; k < n; k++) {
            Enemy e = enemies[qbuf[k]];
            if (e.dead) continue;
            float dx = e.x - px, dy = e.y - py, rr = r + e.radius;
            float d2 = dx * dx + dy * dy;
            if (d2 < rr * rr) {
                float d = (float) Math.sqrt(d2) + 0.01f;
                hurt(e, w.dmg, 0, 1, dx / d, dy / d, Math.max(0.15f, w.knock));
                applyStatus(e, Entities.ST_DECAY, w.evo ? 2 : 1, w.dmg, 0f); // Toxic Vent: Decay
                e.kbMul = Math.min(3f, e.kbMul + 0.1f); // every tick lowers its knockback resistance
                hits++;
            }
        }
        if (hits > 0) sound.emit(SoundEvents.GARLIC);
        if (w.evo && hits > 0) leech(w, Math.min(1.5f, hits * 0.25f));
    }

    private void book(WeaponState w, int slot, float dt) {
        if (w.endless) { // Unholy Vespers never disappears
            int alive = 0;
            for (int i = 0; i < projN; i++) if (projs[i].kind == Entities.P_BOOK && projs[i].slot == slot) alive++;
            if (alive != w.amount) spawnBooks(w, slot);
            return;
        }
        w.cd -= dt;
        if (w.cd > 0) return;
        spawnBooks(w, slot);
        w.cd = w.interval + (w.dependsOnDuration ? w.duration : 0f);
    }

    private void spawnBooks(WeaponState w, int slot) {
        for (int i = projN - 1; i >= 0; i--) if (projs[i].kind == Entities.P_BOOK && projs[i].slot == slot) removeProj(i);
        sound.emit(SoundEvents.BIBLE);
        for (int i = 0; i < w.amount; i++) {
            Projectile p = newProj(Entities.P_BOOK, slot, w);
            if (p == null) return;
            p.orbitAngle = i * 6.2831853f / w.amount;
            p.orbitSpeed = 3.1f * w.speed;
            p.orbitRadius = 75f * w.area;
            p.radius = 16f * (w.evo ? 1.2f : 1f);
            p.life = p.maxLife = w.endless ? 1e9f : w.duration;
            p.hitDelay = w.hitDelay;
            p.hitsLeft = 1 << 30;
            p.x = px + (float) Math.cos(p.orbitAngle) * p.orbitRadius;
            p.y = py + (float) Math.sin(p.orbitAngle) * p.orbitRadius;
        }
    }

    private void removeProj(int i) {
        Projectile p = projs[i];
        projs[i] = projs[projN - 1];
        projs[projN - 1] = p;
        projN--;
    }

    private void updateProjectiles(float dt) {
        for (int i = projN - 1; i >= 0; i--) {
            Projectile p = projs[i];
            p.life -= dt;
            if (p.life <= 0) {
                if (p.blast > 0f && main != null) main.explode(p); // grenades, bomblets, the slug's end of range
                removeProj(i);
                continue;
            }
            boolean remove = false;
            switch (p.kind) {
                case Entities.P_MISSILE:
                case Entities.P_KNIFE:
                case Entities.P_FIRE:
                    p.x += p.vx * dt; p.y += p.vy * dt;
                    p.angle = (float) Math.atan2(p.vy, p.vx);
                    break;
                case Entities.P_MAIN:
                    if (p.sub == Entities.SUB_DART && main != null) main.homing(p, dt);
                    p.x += p.vx * dt; p.y += p.vy * dt;
                    p.angle = (float) Math.atan2(p.vy, p.vx);
                    break;
                case Entities.P_AXE:
                    p.vy += p.gravity * dt;
                    p.x += p.vx * dt; p.y += p.vy * dt;
                    p.angle += p.spin * dt;
                    break;
                case Entities.P_CROSS:
                    // decelerate along the launch line, reverse and keep accelerating back past the player
                    p.angle += p.spin * dt;
                    p.speedAlong -= p.accel * dt;
                    if (!p.returning && p.speedAlong < 0) { p.returning = true; p.stamp = nextStamp++; } // each enemy once per leg
                    p.x += p.vx * p.speedAlong * dt;
                    p.y += p.vy * p.speedAlong * dt;
                    break;
                case Entities.P_BOOK:
                    p.orbitAngle += p.orbitSpeed * dt;
                    p.x = px + (float) Math.cos(p.orbitAngle) * p.orbitRadius;
                    p.y = py + (float) Math.sin(p.orbitAngle) * p.orbitRadius;
                    p.angle = p.orbitAngle;
                    break;
                case Entities.P_PUDDLE:
                    if (p.maxLife - p.life < p.flight) continue; // flask still in the air
                    if (p.sub == Entities.SUB_NONE && p.maxLife - p.life - dt < p.flight) sound.emit(SoundEvents.HOLY_WATER); // it just landed
                    if (p.grow > 0) p.radius += p.grow * dt;
                    if (p.drift > 0) {
                        float dx = px - p.x, dy = py - p.y, d = (float) Math.sqrt(dx * dx + dy * dy);
                        if (d > 8f) { p.x += dx / d * p.drift * dt; p.y += dy / d * p.drift * dt; }
                    }
                    break;
                default:
                    break;
            }
            // off-screen culling (books and puddles stay; the cross dies by lifetime)
            if (p.kind != Entities.P_BOOK && p.kind != Entities.P_PUDDLE && p.kind != Entities.P_CROSS) {
                float dx = p.x - px, dy = p.y - py;
                if (dx * dx + dy * dy > 1100f * 1100f) remove = true;
                else if (p.kind == Entities.P_AXE && p.gravity > 0 && p.vy > 0 && dy > HALF_H + 60f) remove = true;
            }
            if (remove) { removeProj(i); continue; }
            if (p.inert) continue; // a lobbed grenade only explodes when its time is up
            // collisions
            if (destN > 0) hitDest(p.x, p.y, p.radius);
            int n = query(p.x, p.y, p.radius + 34f);
            for (int k = 0; k < n; k++) {
                Enemy e = enemies[qbuf[k]];
                if (e.dead) continue;
                float dx = e.x - p.x, dy = e.y - p.y, rr = p.radius + e.radius;
                if (dx * dx + dy * dy >= rr * rr) continue;
                float d = (float) Math.sqrt(dx * dx + dy * dy) + 0.01f;
                if (p.kind == Entities.P_BOOK || p.kind == Entities.P_PUDDLE) {
                    if (!e.tryTick(p.stamp, tNow, p.hitDelay)) continue; // each book / puddle ticks on its own
                } else {
                    if (e.hitBy(p.stamp)) continue;
                    e.markHit(p.stamp);
                }
                hurt(e, p.dmg, p.critChance, p.critMul, dx / d, dy / d, p.knock);
                if (p.kind == Entities.P_FIRE) applyStatus(e, Entities.ST_BURN, p.evo ? 2 : 1, p.dmg, 0f); // Slag Cannon / Furnace Burst
                else if (p.kind == Entities.P_PUDDLE) { // Corrosive Flask: Decay, and a one-stack slow
                    applyStatus(e, Entities.ST_DECAY, 1, p.dmg, 0f);
                    applyStatus(e, Entities.ST_FROST, e.frost < 1 ? 1 : 0, p.dmg, 0f);
                }
                if (main != null && (p.kind == Entities.P_MAIN || p.sub != Entities.SUB_NONE)) main.onHit(p, e);
                if (p.kind == Entities.P_FIRE || p.kind == Entities.P_AXE) { // a small burst where it hits
                    addFx(Entities.FX_BLAST, e.x, e.y, p.kind == Entities.P_FIRE ? 34f : 24f, p.kind == Entities.P_FIRE ? 1f : 0f, 0.28f, 0, p.evo);
                }
                if (--p.hitsLeft <= 0) { remove = true; break; }
            }
            if (remove) removeProj(i);
        }
    }

    // ------------------------------------------------------------------ effects

    private void updateVisuals(float dt) {
        float drag = (float) Math.exp(-3.71f * dt); // 0.94 per step at 60 Hz
        for (int i = 0; i < MAX_PART; i++) {
            Particle q = parts[i];
            if (q.life <= 0) continue;
            q.life -= dt;
            q.x += q.vx * dt;
            q.y += q.vy * dt;
            q.vx *= drag;
            q.vy *= drag;
        }
        for (int i = 0; i < MAX_TEXT; i++) if (texts[i].life > 0) { texts[i].life -= dt; texts[i].y -= 40f * dt; }
        for (int i = 0; i < MAX_FX; i++) if (fx[i].life > 0) fx[i].life -= dt;
        for (int i = 0; i < MAX_CORPSES; i++) {
            Corpse c = corpses[i];
            if (!c.active) continue;
            c.age += dt;
            if (c.age >= CORPSE_LIFE) c.active = false;
        }
    }

    void spark(float x, float y, int color, int count) {
        for (int i = 0; i < count; i++) {
            Particle q = parts[partHead];
            partHead = (partHead + 1) % MAX_PART;
            float a = rng.nextFloat() * 6.2831853f, s = 40f + rng.nextFloat() * 140f;
            q.x = x; q.y = y;
            q.vx = (float) Math.cos(a) * s; q.vy = (float) Math.sin(a) * s;
            q.life = q.maxLife = 0.25f + rng.nextFloat() * 0.3f;
            q.size = 2f + rng.nextFloat() * 3f;
            q.color = color;
        }
    }

    Effect addFx(int kind, float x, float y, float w, float h, float life, int side, boolean evo) {
        Effect f = fx[fxHead];
        fxHead = (fxHead + 1) % MAX_FX;
        f.kind = kind; f.x = x; f.y = y; f.w = w; f.h = h; f.life = f.maxLife = life; f.side = side; f.evo = evo;
        f.a = 0f;
        return f;
    }

    /** Seconds a damage number lives, and the window after its creation in which more hits on the enemy add into it. */
    public static final float TEXT_LIFE = 0.5f, TEXT_MERGE = 0.3f;

    /** Damage number for one enemy: hits within {@link #TEXT_MERGE} of the first one add into a single rising number. */
    private void addEnemyText(Enemy e, int value, boolean crit) {
        int slot = e.textSlot;
        if (slot >= 0) {
            DamageText t = texts[slot];
            if (t.owner == e.id && t.life > t.maxLife - TEXT_MERGE) {
                t.total = Math.min(9999999, t.total + Math.max(0, value));
                t.crit |= crit;
                setDigits(t, t.total);
                return;
            }
        }
        e.textSlot = textHead;
        DamageText t = addText(e.x, e.y - e.radius, value, crit, false);
        t.owner = e.id;
    }

    /** Small coloured number for a status tick: further ticks of the same colour add into it while it is alive. */
    private void addStatusText(Enemy e, int value, int color) {
        int slot = e.statusTextSlot;
        if (slot >= 0) {
            DamageText t = texts[slot];
            if (t.owner == e.id && t.life > 0f && t.color == color) {
                t.total = Math.min(9999999, t.total + Math.max(0, value));
                setDigits(t, t.total);
                return;
            }
        }
        e.statusTextSlot = textHead;
        DamageText t = addText(e.x + 6f, e.y - e.radius - 6f, value, false, false);
        t.owner = e.id;
        t.color = color;
    }

    private DamageText addText(float x, float y, int value, boolean crit, boolean heal) {
        DamageText t = texts[textHead];
        textHead = (textHead + 1) % MAX_TEXT;
        t.x = x + (rng.nextFloat() - 0.5f) * 12f;
        t.y = y;
        t.life = t.maxLife = TEXT_LIFE;
        t.crit = crit;
        t.heal = heal;
        t.owner = 0;
        t.color = 0;
        t.total = Math.max(0, Math.min(9999999, value));
        setDigits(t, t.total);
        return t;
    }

    private static void setDigits(DamageText t, int value) {
        char[] tmp = t.digits;
        int len;
        if (value == 0) {
            tmp[0] = '0';
            len = 1;
        } else {
            int digits = 0;
            for (int c = value; c > 0; c /= 10) digits++;
            len = digits;
            for (int j = digits - 1; j >= 0; j--) { tmp[j] = (char) ('0' + value % 10); value /= 10; }
        }
        t.len = len;
    }

    /** Minimap/HUD helper: current wave row. */
    public WaveRow currentRow() {
        List<WaveRow> rows = stage.rows;
        return rows.get(se.felixarvid.thorsurvivors.data.WaveSelector.indexAt(rows, time));
    }
}
