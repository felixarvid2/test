package se.felixarvid.thorsurvivors.game;

import se.felixarvid.thorsurvivors.data.GameData;
import se.felixarvid.thorsurvivors.data.HeroDef;
import se.felixarvid.thorsurvivors.data.MainWeaponDef;
import se.felixarvid.thorsurvivors.data.StageDef;
import se.felixarvid.thorsurvivors.data.Treasure;
import se.felixarvid.thorsurvivors.data.WaveRow;
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

    // destructibles: one braziers/candelabra per ~500 x 500 u cell, placed from the cell alone (see destPlace)
    public static final int MAX_DEST = 32;
    /** What a broken destructible drops, with percent weights (sums to 100). */
    static final double[] DEST_WEIGHT = {50, 14, 22, 4, 4, 3, 3};
    static final int[] DEST_DROP = {Entities.K_COIN, Entities.K_COINBAG, Entities.K_ROAST, Entities.K_VACUUM,
            Entities.K_OROLOGION, Entities.K_ROSARY, Entities.K_CLOVER};
    static final float DEST_CELL = 500f, DEST_R = 16f, DEST_CLEAR = 300f;
    /** The braziers of the cells around the player that are still standing (swap-remove compacted). */
    public final float[] destX = new float[MAX_DEST], destY = new float[MAX_DEST];
    private final long[] destKey = new long[MAX_DEST];
    public int destN;
    public int destsBroken;
    private final long[] broken = new long[512];
    private int brokenN, brokenHead;
    private int destCx = Integer.MIN_VALUE, destCy;
    private float placeX, placeY;
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
        this.data = data;
        this.stage = stage;
        this.meta = meta;
        this.hero = heroKey == null ? null : data.heroes.get(heroKey);
        MainWeaponDef mwd = hero == null ? null : data.mainWeapons.get(hero.main);
        this.main = mwd == null ? null : new MainWeapon(this, hero, mwd);
        this.map = WorldGen.of(stage.key);
        for (int i = 0; i < MAX_ENEMIES; i++) enemies[i] = new Enemy();
        for (int i = 0; i < MAX_PROJ; i++) projs[i] = new Projectile();
        for (int i = 0; i < MAX_PICK; i++) picks[i] = new Pickup();
        for (int i = 0; i < MAX_PART; i++) parts[i] = new Particle();
        for (int i = 0; i < MAX_TEXT; i++) texts[i] = new DamageText();
        for (int i = 0; i < MAX_FX; i++) fx[i] = new Effect();
        for (int i = 0; i < MAX_CORPSES; i++) corpses[i] = new Corpse();
        for (int i = 0; i < weapons.length; i++) weapons[i] = new WeaponState();
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
        stats = PlayerStats.compute(inv, meta, extraLuck, hero, level);
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
        w.critChance = g(m, "critChance", 0) * (1f + (float) stats.luck);
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
        updateEnemies(dt);
        buildGrid();
        separate(dt);
        updateWeapons(dt);
        if (main != null) main.update(dt);
        updateProjectiles(dt);
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
        if (screenFlash > 0) screenFlash -= dt;
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
        dodgeCdMax = DODGE_COOLDOWN * (float) stats.cooldownMul;
        dodgeCd = dodgeCdMax;
        invuln = Math.max(invuln, DODGE_TIME);
        sound.emit(SoundEvents.DODGE);
    }

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
        float len = (float) Math.sqrt(mx * mx + my * my);
        float sp = PLAYER_SPEED_K * (float) stage.playerSpeed * (float) stats.moveSpeedMul;
        px += mx * sp * dt;
        py += my * sp * dt;
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

    /** Type of the stage's destructible ("BRAZIER", "CANDELABRA") or "" for none; the renderer picks the sprite from it. */
    public String destType() {
        return stage.destructible;
    }

    /**
     * The destructible of 500 u cell (cx, cy) goes to placeX/placeY; false when the cell has none. A pure function of
     * the cell (and the stage layout): the same cell always gives the same spot, never within 300 u of the start and
     * never on a tree, shelf or table.
     */
    boolean destPlace(int cx, int cy) {
        if (stage.destructible.isEmpty() || WorldGen.unit(WorldGen.hash(cx, cy, 699)) >= 0.9f) return false;
        for (int attempt = 0; attempt < 4; attempt++) {
            float x = cx * DEST_CELL + 40f + WorldGen.unit(WorldGen.hash(cx, cy, 700 + attempt * 2)) * (DEST_CELL - 80f);
            float y = cy * DEST_CELL + 40f + WorldGen.unit(WorldGen.hash(cx, cy, 701 + attempt * 2)) * (DEST_CELL - 80f);
            if (x * x + y * y < DEST_CLEAR * DEST_CLEAR || map.blocked(x, y)) continue;
            placeX = x;
            placeY = y;
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

    private static long cellKey(int cx, int cy) {
        return ((long) cx << 32) ^ (cy & 0xFFFFFFFFL);
    }

    private boolean isBroken(long key) {
        for (int i = 0; i < brokenN; i++) if (broken[i] == key) return true;
        return false;
    }

    /** Re-lists the standing destructibles of the 5 x 5 cells around the player when the player enters a new cell. */
    private void refreshDestructibles() {
        int cx = (int) Math.floor(px / DEST_CELL), cy = (int) Math.floor(py / DEST_CELL);
        if (cx == destCx && cy == destCy) return;
        destCx = cx;
        destCy = cy;
        destN = 0;
        for (int j = cy - 2; j <= cy + 2; j++) {
            for (int i = cx - 2; i <= cx + 2; i++) {
                if (destN >= MAX_DEST || !destPlace(i, j)) continue;
                long key = cellKey(i, j);
                if (isBroken(key)) continue;
                destX[destN] = placeX;
                destY[destN] = placeY;
                destKey[destN++] = key;
            }
        }
    }

    /** Breaks every destructible whose body touches the circle (x, y, r). */
    void hitDest(float x, float y, float r) {
        for (int i = destN - 1; i >= 0; i--) {
            float dx = destX[i] - x, dy = destY[i] - y, rr = r + DEST_R;
            if (dx * dx + dy * dy < rr * rr) breakDest(i);
        }
    }

    /** Same for a box centred on (cx, cy), w x h (the whip). */
    private void hitDestBox(float cx, float cy, float w, float h) {
        for (int i = destN - 1; i >= 0; i--) {
            if (Math.abs(destX[i] - cx) < w / 2f + DEST_R && Math.abs(destY[i] - cy) < h / 2f + DEST_R) breakDest(i);
        }
    }

    private void breakDest(int i) {
        broken[brokenHead] = destKey[i];
        brokenHead = (brokenHead + 1) % broken.length;
        brokenN = Math.min(broken.length, brokenN + 1);
        float x = destX[i], y = destY[i];
        destN--;
        destX[i] = destX[destN];
        destY[i] = destY[destN];
        destKey[i] = destKey[destN];
        destsBroken++;
        sound.emit(SoundEvents.BRAZIER_BREAK);
        addFx(Entities.FX_FLASH, x, y - 10f, 150f, 0f, 0.3f, 0, false);
        spark(x, y - 10f, 0xFFFFA030, 9);
        spark(x, y, 0xFF8A8070, 7);
        // mostly gold, sometimes a roast, rarely one of the power pickups
        dropFromDest(x, y);
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

    private EnemyType type(String key) {
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

    /** Tests: adds one enemy of the given type at an exact position (stationary until its speed is set). */
    Enemy addEnemy(String typeKey, float x, float y, boolean boss) {
        Enemy e = enemies[enemyN++];
        initEnemy(e, type(typeKey), boss);
        e.x = x;
        e.y = y;
        return e;
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
        spawnTimer += dt * 1000f;
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

    /** Spawn on a ring just outside the view (or left/right edges for horizontal stages); false if nothing spawned. */
    private void spawnAtRing(EnemyType t, boolean boss, float dist) {
        if (t == null || enemyN >= MAX_ENEMIES) return;
        Enemy e = enemies[enemyN++];
        place(e);
        if (dist > 0) {
            float a = rng.nextFloat() * 6.2831853f;
            e.x = px + (float) Math.cos(a) * dist;
            e.y = py + (float) Math.sin(a) * dist;
        }
        initEnemy(e, t, boss);
        if (boss) sound.emit(SoundEvents.BOSS_SPAWN); // only once the boss really exists
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

    private void initEnemy(Enemy e, EnemyType t, boolean boss) {
        e.type = t;
        e.boss = boss;
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
        double hp = t.def.maxHp * 10.0 * (t.def.hpTimesLevel ? t.def.level : 1) * stage.enemyHealth
                * (1 + stats.curse) * (boss ? 3.0 : 1.0);
        e.hp = e.maxHp = (float) Math.max(1, hp);
        e.speed = (float) (t.def.speed * ENEMY_SPEED_K * stage.enemySpeed * (1 + stats.curse * 0.5));
        e.power = (float) t.def.power;
        e.radius = t.radius * (boss ? 1.8f : 1f);
        e.xp = (float) t.def.xp;
    }

    private void updateEnemies(float dt) {
        boolean frozen = freezeTimer > 0;
        float decay = (float) Math.exp(-9f * dt);
        for (int i = 0; i < enemyN; i++) {
            Enemy e = enemies[i];
            e.anim += dt;
            if (e.flash > 0) e.flash -= dt;
            if (e.burn > 0 || e.decay > 0) statusTick(e, dt);
            float dx = px - e.x, dy = py - e.y;
            float d2 = dx * dx + dy * dy;
            if (d2 > RECYCLE_DIST * RECYCLE_DIST) { // far behind the player: recycle to the opposite edge
                recycle(e, dx, dy, (float) Math.sqrt(d2));
                continue;
            }
            boolean held = e.stun > 0 || e.root > 0;
            if (e.stun > 0) e.stun -= dt;
            if (e.root > 0) e.root -= dt;
            if (e.stagger > 0) e.stagger -= dt;
            else if (!frozen && !held) {
                float d = (float) Math.sqrt(d2);
                if (d > 1f) {
                    float sp = e.blocked ? e.speed * BLOCKED_SPEED : e.speed;
                    e.x += dx / d * sp * dt;
                    e.y += dy / d * sp * dt;
                }
            }
            e.x += e.kvx * dt;
            e.y += e.kvy * dt;
            e.kvx *= decay;
            e.kvy *= decay;
        }
    }

    /** Burn and Decay placeholders (continuous damage per stack; the status phase replaces this with the 10 Hz pass). */
    private void statusTick(Enemy e, float dt) {
        if (e.dead) return;
        if (e.burn > 0) {
            e.hp -= e.burn * e.burnPer * dt;
            if ((e.burnT -= dt) <= 0) {
                e.burn = 0;
                e.burnPer = 0;
            }
        }
        if (e.decay > 0) {
            e.hp -= e.decay * e.decayPer * dt;
            if ((e.decayT -= dt) <= 0) {
                e.decay = 0;
                e.decayPer = 0;
            }
        }
        if (e.hp <= 0) killNow(e);
    }

    /**
     * Adds {@code n} Burn or Decay stacks (caps 8 and 10), refreshing the timer. {@code hit} is the damage of the hit
     * that applied it: one Burn stack deals 0.08 x hit per 0.33 s, one Decay stack 0.06 x hit per second (design 7).
     * TODO(status phase): replace the continuous damage by the 10 Hz status pass, with numbers and tints.
     */
    void applyStatus(Enemy e, int kind, int n, float hit, float seconds) {
        if (e.dead) return;
        if (kind == Entities.ST_BURN) {
            e.burn = Math.min(8, e.burn + n);
            e.burnT = Math.max(e.burnT, seconds);
            e.burnPer = Math.max(e.burnPer, hit * 0.08f / 0.33f);
        } else if (kind == Entities.ST_DECAY) {
            e.decay = Math.min(10, e.decay + n);
            e.decayT = Math.max(e.decayT, seconds);
            e.decayPer = Math.max(e.decayPer, hit * 0.06f);
        }
    }

    /** Stun (cannot move or attack); bosses take 25% of the duration. */
    void stun(Enemy e, float seconds) {
        e.stun = Math.max(e.stun, e.boss ? seconds * 0.25f : seconds);
    }

    /** Root (cannot move); bosses take 25% of the duration. */
    void root(Enemy e, float seconds) {
        e.root = Math.max(e.root, e.boss ? seconds * 0.25f : seconds);
    }

    /** Damage without a flash, number or sound (links, status ticks); kills when it empties the enemy. */
    void dot(Enemy e, float amount) {
        if (e.dead) return;
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

    private void buildGrid() {
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
            if (e.dead || e.stun > 0) continue; // a stunned enemy cannot attack
            float dx = e.x - px, dy = e.y - py, rr = e.radius * 0.8f + PLAYER_R * 0.8f;
            if (dx * dx + dy * dy < rr * rr) best = Math.max(best, e.power);
        }
        if (best <= 0) return;
        float taken = Math.max(1f, best - (float) stats.armor);
        if (guardT > 0) taken = Math.max(1f, taken * (1f - guardDR)); // Riot Guard
        hp -= taken;
        sound.emit(SoundEvents.PLAYER_HURT);
        invuln = 0.5f;
        hitShake = 0.15f;
        if (hp <= 0) {
            if (revivalsUsed < stats.revivals) {
                revivalsUsed++;
                hp = maxHp * 0.5f;
                invuln = 2f;
                screenFlash = 0.4f;
                for (int i = 0; i < enemyN; i++) {
                    Enemy e = enemies[i];
                    float dx = e.x - px, dy = e.y - py;
                    if (dx * dx + dy * dy < 300f * 300f && !e.boss) killNow(e);
                }
            } else {
                hp = 0;
                ended = 1;
            }
        }
    }

    // ------------------------------------------------------------------ damage & kills

    /** Set while a lightning strike deals its damage: those hits show a soft brighten instead of the white silhouette. */
    private boolean softHit;

    public void hurt(Enemy e, float dmg, float chance, float critMul, float kx, float ky, float knock) {
        if (e.dead) return;
        boolean crit = chance > 0 && rng.nextFloat() < chance;
        lastCrit = crit;
        if (crit) dmg *= critMul;
        e.hp -= dmg;
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

    private void killNow(Enemy e) {
        if (e.dead) return;
        e.dead = true;
        e.hp = 0;
    }

    private void reap() {
        for (int i = enemyN - 1; i >= 0; i--) {
            Enemy e = enemies[i];
            if (!e.dead) continue;
            kills++;
            sound.emit(SoundEvents.ENEMY_DEATH);
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
        c.age = 0f;
        c.active = true;
    }

    private void drops(Enemy e) {
        addPickup(Entities.K_GEM, e.x, e.y, e.xp);
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

    void addPickup(int kind, float x, float y, float value) {
        // gems stop growing the pool GEM_RESERVE slots early so coins, food and chests always find room
        if (pickN >= (kind == Entities.K_GEM ? MAX_PICK - GEM_RESERVE : MAX_PICK)) {
            if (kind == Entities.K_GEM && mergeNearby(x, y, value)) return;
            if (!freeSlot() && pickN >= MAX_PICK) return; // only chests left: nothing to evict
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
        int best = -1;
        float bd = MERGE_DIST * MERGE_DIST;
        for (int i = 0; i < pickN; i++) {
            Pickup p = picks[i];
            if (p.kind != Entities.K_GEM || p.red || p.value + value > MERGE_CAP) continue;
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
            if (gems ? (p.kind != Entities.K_GEM || p.red) : (p.kind == Entities.K_GEM || p.kind == Entities.K_CHEST)) continue;
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
            if (p.kind == Entities.K_CHEST) continue;
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
            float cr = p.kind == Entities.K_CHEST ? 30f : 20f;
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
                        if (e.boss) hurt(e, e.maxHp * 0.1f, 0, 1, 0, 0, 0);
                        else killNow(e);
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

    private DamageText addText(float x, float y, int value, boolean crit, boolean heal) {
        DamageText t = texts[textHead];
        textHead = (textHead + 1) % MAX_TEXT;
        t.x = x + (rng.nextFloat() - 0.5f) * 12f;
        t.y = y;
        t.life = t.maxLife = TEXT_LIFE;
        t.crit = crit;
        t.heal = heal;
        t.owner = 0;
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
