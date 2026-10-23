package se.felixarvid.thorsurvivors.game;

import se.felixarvid.thorsurvivors.data.GameData;
import se.felixarvid.thorsurvivors.data.StageDef;
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
    public static final float VIEW_H = 720f; // world units visible vertically
    static final float ENEMY_SPEED_K = 0.6f, PLAYER_SPEED_K = 130f;
    static final int CELL = 96, GRID = 64, GRID_MASK = GRID - 1;

    public static final int B_WHIP = 0, B_MISSILE = 1, B_KNIFE = 2, B_AXE = 3, B_CROSS = 4, B_BOOK = 5, B_FIRE = 6,
            B_GARLIC = 7, B_WATER = 8, B_BOLT = 9;

    /** Per-slot weapon runtime state with cached effective stats. */
    public static final class WeaponState {
        public WeaponDef def;
        public int level, behavior, amount, pierce;
        public boolean evo, dependsOnDuration;
        public String spriteKey = "";
        public float dmg, interval, area, speed, duration, repeat, hitDelay, knock, critChance, critMul;
        public float cd, shotCd, pulse;
        public int pending, shotIndex, side;
    }

    public final GameData data;
    public final StageDef stage;
    public final Inventory inv = new Inventory();
    public final Random rng = new Random();
    public PlayerStats stats;
    private final Map<String, Double> meta;
    private double extraLuck;

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
    private int partHead, textHead, fxHead, nextId = 1;
    public final WeaponState[] weapons = new WeaponState[Inventory.MAX_WEAPONS];

    private final HashMap<String, EnemyType> types = new HashMap<>();
    private final int[] gridHead = new int[GRID * GRID];
    private final int[] gridNext = new int[MAX_ENEMIES];
    private final int[] qbuf = new int[MAX_ENEMIES];
    private final float[] mv = new float[2];

    private int lastRow = -1;
    private float spawnTimer;
    private float regenAcc;

    public Sim(GameData data, StageDef stage, String starterKey, Map<String, Double> meta) {
        this.data = data;
        this.stage = stage;
        this.meta = meta;
        for (int i = 0; i < MAX_ENEMIES; i++) enemies[i] = new Enemy();
        for (int i = 0; i < MAX_PROJ; i++) projs[i] = new Projectile();
        for (int i = 0; i < MAX_PICK; i++) picks[i] = new Pickup();
        for (int i = 0; i < MAX_PART; i++) parts[i] = new Particle();
        for (int i = 0; i < MAX_TEXT; i++) texts[i] = new DamageText();
        for (int i = 0; i < MAX_FX; i++) fx[i] = new Effect();
        for (int i = 0; i < weapons.length; i++) weapons[i] = new WeaponState();
        inv.add(data.weapons.get(starterKey));
        recomputeAll();
        hp = maxHp;
        spawnInitial();
    }

    public float cameraHalfW(float aspect) {
        return VIEW_H * aspect / 2f;
    }

    // ------------------------------------------------------------------ stats

    public void recomputeAll() {
        PlayerStats old = stats;
        stats = PlayerStats.compute(inv, meta, extraLuck);
        float nm = 100f * (float) stats.maxHpMul;
        if (old != null) hp += Math.max(0, nm - maxHp);
        maxHp = nm;
        for (int i = 0; i < inv.weaponCount; i++) syncWeapon(i);
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
        w.interval = (float) Math.max(100, g(m, "interval", 1000)) / 1000f * (float) stats.cooldownMul;
        w.area = g(m, "area", 1) * (float) stats.areaMul;
        w.speed = g(m, "speed", 1) * (float) stats.speedMul;
        w.duration = g(m, "duration", 1000) / 1000f * (float) stats.durationMul;
        w.repeat = Math.max(0.03f, g(m, "repeatInterval", 100) / 1000f);
        w.hitDelay = Math.min(0.9f, Math.max(0.2f, g(m, "hitBoxDelay", 500) / 1000f));
        w.knock = g(m, "knockback", 0.3f);
        w.critChance = g(m, "critChance", 0);
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
        if (ended != 0) return;
        time += dt;
        tNow = (float) time;
        input.move(mv);
        movePlayer(dt);
        updateWaves(dt);
        updateEnemies(dt);
        buildGrid();
        separate();
        updateWeapons(dt);
        updateProjectiles(dt);
        contactDamage();
        reap();
        updatePickups(dt);
        updateVisuals(dt);
        if (freezeTimer > 0) freezeTimer -= dt;
        if (invuln > 0) invuln -= dt;
        if (hitShake > 0) hitShake -= dt;
        if (screenFlash > 0) screenFlash -= dt;
        if (stats.regen > 0 && hp < maxHp) hp = Math.min(maxHp, hp + (float) stats.regen * dt);
        if (time >= stage.timeLimit) ended = 2;
    }

    private void movePlayer(float dt) {
        float mx = mv[0], my = mv[1];
        float len = (float) Math.sqrt(mx * mx + my * my);
        float sp = PLAYER_SPEED_K * (float) stage.playerSpeed * (float) stats.moveSpeedMul;
        px += mx * sp * dt;
        py += my * sp * dt;
        if (len > 0.05f) {
            faceX = mx / len;
            faceY = my / len;
            if (Math.abs(mx) > 0.1f) facingRight = mx > 0;
            walk += dt * 10f * len;
        }
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
            spawnAtRing(type(row.enemies[rng.nextInt(row.enemies.length)]), false, 520f + rng.nextFloat() * 380f);
        }
    }

    private void updateWaves(float dt) {
        int idx = se.felixarvid.thorsurvivors.data.WaveSelector.indexAt(stage.rows, time);
        WaveRow row = stage.rows.get(idx);
        if (idx != lastRow) {
            lastRow = idx;
            for (String b : row.bosses) {
                if (b.equals("BOSS_XLDEATH")) continue; // the reaper: the run is won at the time limit instead
                spawnAtRing(type(b), true, 700f);
            }
        }
        spawnTimer += dt * 1000f;
        if (spawnTimer >= row.frequencyMs) {
            spawnTimer = 0;
            int n = WaveDirector.spawnCount(row, enemyN, time);
            for (int i = 0; i < n; i++) {
                spawnAtRing(type(row.enemies[rng.nextInt(row.enemies.length)]), false, 0);
            }
        }
    }

    /** Spawn on a ring just outside the view (or left/right edges for horizontal stages). */
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
    }

    private void place(Enemy e) {
        float halfW = VIEW_H * 16f / 9f / 2f + 60f;
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
        e.flash = 0;
        e.anim = rng.nextFloat() * 6f;
        java.util.Arrays.fill(e.hitUntil, 0f);
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
            float dx = px - e.x, dy = py - e.y;
            float d2 = dx * dx + dy * dy;
            if (d2 > 1250f * 1250f) { // too far behind: recycle to the front ring
                place(e);
                continue;
            }
            if (!frozen) {
                float d = (float) Math.sqrt(d2);
                if (d > 1f) {
                    e.x += dx / d * e.speed * dt;
                    e.y += dy / d * e.speed * dt;
                }
            }
            e.x += e.kvx * dt;
            e.y += e.kvy * dt;
            e.kvx *= decay;
            e.kvy *= decay;
        }
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
    private int query(float x, float y, float r) {
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

    private void separate() {
        for (int i = 0; i < enemyN; i++) {
            Enemy a = enemies[i];
            int n = query(a.x, a.y, a.radius * 2f);
            for (int k = 0; k < n; k++) {
                int j = qbuf[k];
                if (j <= i) continue;
                Enemy b = enemies[j];
                float dx = b.x - a.x, dy = b.y - a.y;
                float min = (a.radius + b.radius) * 0.7f;
                float d2 = dx * dx + dy * dy;
                if (d2 < min * min && d2 > 0.01f) {
                    float d = (float) Math.sqrt(d2);
                    float push = (min - d) * 0.25f;
                    float ux = dx / d * push, uy = dy / d * push;
                    a.x -= ux; a.y -= uy;
                    b.x += ux; b.y += uy;
                }
            }
        }
    }

    private void contactDamage() {
        if (freezeTimer > 0 || invuln > 0) return;
        float best = 0;
        for (int i = 0; i < enemyN; i++) {
            Enemy e = enemies[i];
            if (e.dead) continue;
            float dx = e.x - px, dy = e.y - py, rr = e.radius * 0.8f + PLAYER_R * 0.8f;
            if (dx * dx + dy * dy < rr * rr) best = Math.max(best, e.power);
        }
        if (best <= 0) return;
        hp -= Math.max(1f, best - (float) stats.armor);
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

    public void hurt(Enemy e, float dmg, float chance, float critMul, float kx, float ky, float knock) {
        if (e.dead) return;
        boolean crit = chance > 0 && rng.nextFloat() < chance;
        if (crit) dmg *= critMul;
        e.hp -= dmg;
        e.flash = 0.1f;
        addText(e.x, e.y - e.radius, (int) dmg, crit, false);
        float k = knock * (float) e.type.def.knockback * 260f;
        if (k > 0) {
            e.kvx += kx * k;
            e.kvy += ky * k;
        }
        spark(e.x, e.y, e.type.color, 2);
        if (e.hp <= 0) killNow(e);
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
            spark(e.x, e.y, e.type.color, e.boss ? 24 : 7);
            drops(e);
            Enemy last = enemies[enemyN - 1];
            enemies[i] = last;
            enemies[enemyN - 1] = e;
            enemyN--;
        }
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

    private void addPickup(int kind, float x, float y, float value) {
        if (pickN >= MAX_PICK) {
            if (kind == Entities.K_GEM) { // merge into an existing gem
                for (int i = 0; i < pickN; i++) {
                    if (picks[i].kind == Entities.K_GEM) {
                        picks[i].value += value;
                        return;
                    }
                }
            }
            return;
        }
        Pickup p = picks[pickN++];
        p.kind = kind;
        p.x = x + (rng.nextFloat() - 0.5f) * 10f;
        p.y = y + (rng.nextFloat() - 0.5f) * 10f;
        p.value = value;
        p.pulled = false;
        p.bob = rng.nextFloat() * 6f;
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
                gainXp(p.value * (float) stage.xpBonus * (float) stats.growthMul);
                break;
            case Entities.K_COIN:
            case Entities.K_COINBAG:
                gold += Math.max(1, Math.round(p.value * (float) stage.goldMultiplier * (float) stats.greedMul));
                break;
            case Entities.K_ROAST:
                heal(30f);
                break;
            case Entities.K_VACUUM:
                for (int i = 0; i < pickN; i++) if (picks[i].kind == Entities.K_GEM) picks[i].pulled = true;
                break;
            case Entities.K_OROLOGION:
                freezeTimer = 10f;
                break;
            case Entities.K_ROSARY:
                screenFlash = 0.5f;
                float hw = VIEW_H * 16f / 9f / 2f, hh = VIEW_H / 2f;
                for (int i = 0; i < enemyN; i++) {
                    Enemy e = enemies[i];
                    if (Math.abs(e.x - px) < hw && Math.abs(e.y - py) < hh) {
                        if (e.boss) hurt(e, e.maxHp * 0.1f, 0, 1, 0, 0, 0);
                        else killNow(e);
                    }
                }
                break;
            case Entities.K_CLOVER:
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
            xpNeed = Progression.xpToNext(level);
        }
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
            default:
                gold += 25;
        }
        recomputeAll();
    }

    /** Opens one pending chest: evolves a ready weapon, else grants upgrades. Returns text lines. */
    public String[] openChest() {
        pendingChests--;
        java.util.ArrayList<String> lines = new java.util.ArrayList<>();
        int slot = inv.firstEvolvable(data.weapons);
        if (slot >= 0) {
            String from = inv.weapons[slot].def.name;
            WeaponDef to = inv.evolve(slot, data.weapons);
            lines.add("EVOLUTION!");
            lines.add(from + " -> " + to.name);
        } else {
            int r = rng.nextInt(100);
            int n = r < 70 ? 1 : r < 95 ? 3 : 5;
            for (int i = 0; i < n; i++) {
                Inventory.Slot s = randomUpgradable();
                if (s == null) break;
                inv.levelUp(s.def.key);
                lines.add(s.def.name + " -> Lv " + s.level);
            }
        }
        int coins = Math.round((30 + rng.nextInt(60)) * (float) stage.goldMultiplier * (float) stats.greedMul);
        gold += coins;
        lines.add("+" + coins + " gold");
        recomputeAll();
        return lines.toArray(new String[0]);
    }

    private Inventory.Slot randomUpgradable() {
        Inventory.Slot[] pool = new Inventory.Slot[12];
        int n = 0;
        for (int i = 0; i < inv.weaponCount; i++) if (inv.weapons[i].level < inv.weapons[i].def.maxLevel()) pool[n++] = inv.weapons[i];
        for (int i = 0; i < inv.passiveCount; i++) if (inv.passives[i].level < inv.passives[i].def.maxLevel()) pool[n++] = inv.passives[i];
        return n == 0 ? null : pool[rng.nextInt(n)];
    }

    // ------------------------------------------------------------------ weapons

    private void updateWeapons(float dt) {
        for (int i = 0; i < inv.weaponCount; i++) {
            WeaponState w = weapons[i];
            if (w.pulse > 0) w.pulse -= dt;
            switch (w.behavior) {
                case B_GARLIC: garlic(w, i, dt); break;
                case B_BOOK: book(w, i, dt); break;
                default: volley(w, i, dt);
            }
        }
    }

    private void volley(WeaponState w, int slot, float dt) {
        if (w.pending == 0) {
            w.cd -= dt;
            if (w.cd <= 0) {
                if (w.behavior == B_BOLT) {
                    // bolts need targets; wait until something is on screen
                    if (enemyN == 0) { w.cd = 0.2f; return; }
                }
                w.pending = w.amount;
                w.shotIndex = 0;
                w.shotCd = 0;
                w.cd += w.interval;
                if (w.cd < 0) w.cd = w.interval;
            }
        }
        if (w.pending > 0) {
            w.shotCd -= dt;
            if (w.shotCd <= 0) {
                fire(w, slot);
                w.pending--;
                w.shotIndex++;
                w.shotCd = w.repeat;
            }
        }
    }

    private Enemy nearest(float maxDist, int skip) {
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

    private Enemy randomNear(float maxDist) {
        if (enemyN == 0) return null;
        for (int t = 0; t < 8; t++) {
            Enemy e = enemies[rng.nextInt(enemyN)];
            float dx = e.x - px, dy = e.y - py;
            if (!e.dead && dx * dx + dy * dy < maxDist * maxDist) return e;
        }
        return null;
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
        p.hitN = 0;
        p.returning = false;
        p.targetId = 0;
        p.blast = 0;
        return p;
    }

    private void fire(WeaponState w, int slot) {
        switch (w.behavior) {
            case B_WHIP: whip(w); break;
            case B_MISSILE: {
                Enemy t = nearest(900f, 0);
                if (w.evo && t != null && rng.nextInt(3) == 0) t = randomNear(700f) != null ? randomNear(700f) : t;
                Projectile p = newProj(Entities.P_MISSILE, slot, w);
                if (p == null) return;
                float ax = faceX, ay = faceY;
                if (t != null) { ax = t.x - px; ay = t.y - py; p.targetId = t.id; }
                float a = (float) Math.atan2(ay, ax) + (w.shotIndex > 0 ? (rng.nextFloat() - 0.5f) * 0.25f : 0f);
                float sp = 380f * w.speed;
                p.vx = (float) Math.cos(a) * sp; p.vy = (float) Math.sin(a) * sp;
                p.radius = 9f * Math.max(0.8f, w.area) * (w.evo ? 1.3f : 1f);
                p.life = 2.6f;
                break;
            }
            case B_KNIFE: {
                Projectile p = newProj(Entities.P_KNIFE, slot, w);
                if (p == null) return;
                float a = (float) Math.atan2(faceY, faceX);
                if (w.evo) a += (rng.nextFloat() - 0.5f) * 0.3f;
                float off = ((w.shotIndex % 3) - 1) * 9f;
                p.x = px - (float) Math.sin(a) * off; p.y = py + (float) Math.cos(a) * off;
                float sp = 560f * w.speed;
                p.vx = (float) Math.cos(a) * sp; p.vy = (float) Math.sin(a) * sp;
                p.angle = a;
                p.radius = 8f * Math.max(0.8f, w.area);
                p.life = 1.2f;
                break;
            }
            case B_AXE: {
                Projectile p = newProj(Entities.P_AXE, slot, w);
                if (p == null) return;
                float spread = w.evo ? 280f : 110f;
                p.vx = (rng.nextFloat() * 2f - 1f) * spread * (facingRight ? 1f : 1f) + (facingRight ? 30f : -30f);
                p.vy = -(520f + rng.nextFloat() * 90f) * Math.max(0.8f, w.speed);
                p.spin = (p.vx >= 0 ? 1 : -1) * 9f;
                p.radius = 17f * w.area;
                p.life = Math.max(1.4f, w.duration);
                p.hitsLeft = w.pierce >= 100 ? 100000 : w.pierce * 5;
                break;
            }
            case B_CROSS: {
                Projectile p = newProj(Entities.P_CROSS, slot, w);
                if (p == null) return;
                Enemy t = nearest(900f, 0);
                float ax = faceX, ay = faceY;
                if (t != null) { ax = t.x - px; ay = t.y - py; }
                float a = (float) Math.atan2(ay, ax);
                p.angle = a;
                p.vx = (float) Math.cos(a);
                p.vy = (float) Math.sin(a);
                float v0 = 430f * w.speed;
                p.speedAlong = v0;
                p.accel = v0 / 0.85f;
                p.radius = 15f * w.area;
                p.life = 5f;
                p.hitsLeft = 100000;
                p.spin = 10f;
                break;
            }
            case B_FIRE: {
                Projectile p = newProj(Entities.P_FIRE, slot, w);
                if (p == null) return;
                Enemy t = randomNear(650f);
                float a = t != null ? (float) Math.atan2(t.y - py, t.x - px) : rng.nextFloat() * 6.2831853f;
                float sp = 330f * w.speed;
                p.vx = (float) Math.cos(a) * sp; p.vy = (float) Math.sin(a) * sp;
                p.radius = 10f;
                p.life = 2.2f;
                p.hitsLeft = 1;
                p.blast = (w.evo ? 80f : 52f) * w.area;
                break;
            }
            case B_WATER: {
                Projectile p = newProj(Entities.P_PUDDLE, slot, w);
                if (p == null) return;
                Enemy t = randomNear(450f);
                if (t != null) { p.x = t.x + (rng.nextFloat() - 0.5f) * 30f; p.y = t.y + (rng.nextFloat() - 0.5f) * 30f; }
                else {
                    float a = rng.nextFloat() * 6.2831853f, d = 70f + rng.nextFloat() * 130f;
                    p.x = px + (float) Math.cos(a) * d; p.y = py + (float) Math.sin(a) * d;
                }
                p.radius = 52f * w.area;
                p.life = p.maxLife = Math.max(0.6f, w.duration);
                p.hitDelay = w.hitDelay;
                p.hitsLeft = 1 << 30;
                break;
            }
            default:
                bolt(w);
        }
    }

    private void whip(WeaponState w) {
        w.side = -w.side;
        if (w.shotIndex == 0 && w.amount == 1) w.side = facingRight ? 1 : -1;
        float W = 190f * w.area * (w.evo ? 1.2f : 1f), H = 46f * w.area;
        float cx = px + w.side * (W / 2f + 12f), cy = py - 6f;
        addFx(Entities.FX_WHIP, cx, cy, W, H, 0.22f, w.side, w.evo);
        int n = query(cx, cy, Math.max(W, H) / 2f + 40f);
        int hits = 0;
        for (int k = 0; k < n; k++) {
            Enemy e = enemies[qbuf[k]];
            if (e.dead) continue;
            if (Math.abs(e.x - cx) < W / 2f + e.radius && Math.abs(e.y - cy) < H / 2f + e.radius) {
                hurt(e, w.dmg, w.critChance, w.critMul, w.side, 0, w.knock);
                hits++;
            }
        }
        if (w.evo && hits > 0) heal(Math.min(3f, hits * 0.4f));
    }

    private void bolt(WeaponState w) {
        Enemy t = randomNear(620f);
        if (t == null) return;
        float r = Math.min(150f, 42f * w.area);
        float tx = t.x, ty = t.y;
        addFx(Entities.FX_BOLT, tx, ty, r, 0, 0.3f, 0, w.evo);
        int n = query(tx, ty, r + 30f);
        for (int k = 0; k < n; k++) {
            Enemy e = enemies[qbuf[k]];
            if (e.dead) continue;
            float dx = e.x - tx, dy = e.y - ty, rr = r + e.radius;
            if (dx * dx + dy * dy < rr * rr) hurt(e, w.dmg, w.critChance, w.critMul, 0, 0, 0);
        }
    }

    private void garlic(WeaponState w, int slot, float dt) {
        w.cd -= dt;
        if (w.cd > 0) return;
        w.cd += Math.max(0.15f, w.interval);
        w.pulse = 0.25f;
        float r = 72f * w.area;
        int n = query(px, py, r + 30f);
        int hits = 0;
        for (int k = 0; k < n; k++) {
            Enemy e = enemies[qbuf[k]];
            if (e.dead) continue;
            float dx = e.x - px, dy = e.y - py, rr = r + e.radius;
            float d2 = dx * dx + dy * dy;
            if (d2 < rr * rr) {
                float d = (float) Math.sqrt(d2) + 0.01f;
                hurt(e, w.dmg, 0, 1, dx / d, dy / d, Math.max(0.25f, w.knock));
                hits++;
            }
        }
        if (w.evo && hits > 0) heal(Math.min(2f, hits * 0.25f));
    }

    private void book(WeaponState w, int slot, float dt) {
        w.cd -= dt;
        if (w.cd > 0) return;
        for (int i = projN - 1; i >= 0; i--) if (projs[i].kind == Entities.P_BOOK && projs[i].slot == slot) removeProj(i);
        w.cd = w.interval + (w.dependsOnDuration ? w.duration : 0f);
        for (int i = 0; i < w.amount; i++) {
            Projectile p = newProj(Entities.P_BOOK, slot, w);
            if (p == null) return;
            p.orbitAngle = i * 6.2831853f / w.amount;
            p.orbitSpeed = 3.1f * w.speed;
            p.orbitRadius = 88f * w.area;
            p.radius = 16f * (w.evo ? 1.2f : 1f);
            p.life = p.maxLife = w.duration;
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
            if (p.life <= 0) { removeProj(i); continue; }
            boolean remove = false;
            switch (p.kind) {
                case Entities.P_MISSILE: {
                    Enemy t = null;
                    if (p.targetId != 0) for (int k = 0; k < enemyN; k++) if (enemies[k].id == p.targetId) { t = enemies[k]; break; }
                    if (t == null || t.dead) {
                        t = nearestTo(p.x, p.y, 500f);
                        p.targetId = t == null ? 0 : t.id;
                    }
                    float sp = (float) Math.sqrt(p.vx * p.vx + p.vy * p.vy);
                    if (t != null && sp > 1f) {
                        float want = (float) Math.atan2(t.y - p.y, t.x - p.x);
                        float cur = (float) Math.atan2(p.vy, p.vx);
                        float diff = want - cur;
                        while (diff > Math.PI) diff -= 6.2831853f;
                        while (diff < -Math.PI) diff += 6.2831853f;
                        float turn = Math.max(-5f * dt, Math.min(5f * dt, diff));
                        cur += turn;
                        p.vx = (float) Math.cos(cur) * sp;
                        p.vy = (float) Math.sin(cur) * sp;
                    }
                    p.angle = (float) Math.atan2(p.vy, p.vx);
                    p.x += p.vx * dt; p.y += p.vy * dt;
                    break;
                }
                case Entities.P_KNIFE:
                case Entities.P_FIRE:
                    p.x += p.vx * dt; p.y += p.vy * dt;
                    p.angle = (float) Math.atan2(p.vy, p.vx);
                    break;
                case Entities.P_AXE:
                    p.vy += 1150f * dt;
                    p.x += p.vx * dt; p.y += p.vy * dt;
                    p.angle += p.spin * dt;
                    break;
                case Entities.P_CROSS: {
                    p.angle += p.spin * dt;
                    if (!p.returning) {
                        p.speedAlong -= p.accel * dt;
                        p.x += p.vx * p.speedAlong * dt;
                        p.y += p.vy * p.speedAlong * dt;
                        if (p.speedAlong <= 0) { p.returning = true; p.hitN = 0; p.speedAlong = 80f; }
                    } else {
                        float dx = px - p.x, dy = py - p.y, d = (float) Math.sqrt(dx * dx + dy * dy);
                        p.speedAlong += p.accel * 1.2f * dt;
                        if (d < 22f) { remove = true; break; }
                        p.x += dx / d * p.speedAlong * dt;
                        p.y += dy / d * p.speedAlong * dt;
                    }
                    break;
                }
                case Entities.P_BOOK:
                    p.orbitAngle += p.orbitSpeed * dt;
                    p.x = px + (float) Math.cos(p.orbitAngle) * p.orbitRadius;
                    p.y = py + (float) Math.sin(p.orbitAngle) * p.orbitRadius;
                    p.angle = p.orbitAngle;
                    break;
                default:
                    break;
            }
            if (remove) { removeProj(i); continue; }
            // collisions
            int n = query(p.x, p.y, p.radius + 34f);
            boolean explode = false;
            for (int k = 0; k < n && !explode; k++) {
                Enemy e = enemies[qbuf[k]];
                if (e.dead) continue;
                float dx = e.x - p.x, dy = e.y - p.y, rr = p.radius + e.radius;
                if (dx * dx + dy * dy >= rr * rr) continue;
                float d = (float) Math.sqrt(dx * dx + dy * dy) + 0.01f;
                if (p.kind == Entities.P_BOOK || p.kind == Entities.P_PUDDLE) {
                    if (tNow < e.hitUntil[p.slot]) continue;
                    e.hitUntil[p.slot] = tNow + p.hitDelay;
                } else {
                    if (p.alreadyHit(e.id)) continue;
                    p.remember(e.id);
                }
                if (p.kind == Entities.P_FIRE) { explode = true; break; }
                hurt(e, p.dmg, p.critChance, p.critMul, dx / d, dy / d, p.knock);
                if (--p.hitsLeft <= 0) { remove = true; break; }
            }
            if (explode) {
                blast(p);
                remove = true;
            }
            if (remove) removeProj(i);
        }
    }

    private Enemy nearestTo(float x, float y, float maxDist) {
        Enemy best = null;
        float bd = maxDist * maxDist;
        for (int i = 0; i < enemyN; i++) {
            Enemy e = enemies[i];
            if (e.dead) continue;
            float dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy;
            if (d < bd) { bd = d; best = e; }
        }
        return best;
    }

    private void blast(Projectile p) {
        addFx(Entities.FX_RING, p.x, p.y, p.blast, 0, 0.3f, 0, p.evo);
        int n = query(p.x, p.y, p.blast + 30f);
        for (int k = 0; k < n; k++) {
            Enemy e = enemies[qbuf[k]];
            if (e.dead) continue;
            float dx = e.x - p.x, dy = e.y - p.y, rr = p.blast + e.radius;
            if (dx * dx + dy * dy < rr * rr) hurt(e, p.dmg, p.critChance, p.critMul, 0, 0, 0);
        }
    }

    // ------------------------------------------------------------------ effects

    private void updateVisuals(float dt) {
        for (int i = 0; i < MAX_PART; i++) {
            Particle q = parts[i];
            if (q.life <= 0) continue;
            q.life -= dt;
            q.x += q.vx * dt;
            q.y += q.vy * dt;
            q.vx *= 0.94f;
            q.vy *= 0.94f;
        }
        for (int i = 0; i < MAX_TEXT; i++) if (texts[i].life > 0) { texts[i].life -= dt; texts[i].y -= 40f * dt; }
        for (int i = 0; i < MAX_FX; i++) if (fx[i].life > 0) fx[i].life -= dt;
    }

    private void spark(float x, float y, int color, int count) {
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

    private void addFx(int kind, float x, float y, float w, float h, float life, int side, boolean evo) {
        Effect f = fx[fxHead];
        fxHead = (fxHead + 1) % MAX_FX;
        f.kind = kind; f.x = x; f.y = y; f.w = w; f.h = h; f.life = f.maxLife = life; f.side = side; f.evo = evo;
    }

    private void addText(float x, float y, int value, boolean crit, boolean heal) {
        DamageText t = texts[textHead];
        textHead = (textHead + 1) % MAX_TEXT;
        t.x = x + (rng.nextFloat() - 0.5f) * 16f;
        t.y = y;
        t.life = 0.7f;
        t.crit = crit;
        t.heal = heal;
        if (value < 0) value = 0;
        if (value > 9999999) value = 9999999;
        int len = 0;
        char[] tmp = t.digits;
        if (value == 0) tmp[len++] = '0';
        else {
            int v = value, digits = 0;
            for (int c = v; c > 0; c /= 10) digits++;
            len = digits;
            for (int j = digits - 1; j >= 0; j--) { tmp[j] = (char) ('0' + v % 10); v /= 10; }
        }
        t.len = len;
    }

    /** Minimap/HUD helper: current wave row. */
    public WaveRow currentRow() {
        List<WaveRow> rows = stage.rows;
        return rows.get(se.felixarvid.thorsurvivors.data.WaveSelector.indexAt(rows, time));
    }
}
