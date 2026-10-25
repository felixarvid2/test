package se.felixarvid.thorsurvivors.game;

import se.felixarvid.thorsurvivors.data.EnemyDef;

/** Visual style + base numbers of an enemy, derived once from its key. */
public final class EnemyType {
    public static final int SH_BLOB = 0, SH_BAT = 1, SH_SKELETON = 2, SH_GHOST = 3, SH_FLOWER = 4, SH_WOLF = 5,
            SH_MUMMY = 6, SH_WITCH = 7;

    public final EnemyDef def;
    public final int shape;
    public final int color;
    public final float radius;
    public final float alpha;
    /**
     * Baked Ashfall model (render.SpriteAtlas.model) used for this key, and the one used when it spawns as a boss. A
     * temporary mapping from the current Vampire Survivors roster until the Ashfall roster lands (README, "Fiender").
     */
    public final String model, bossModel;
    /** Colour of the sparks and gore this enemy sheds when hit (ARGB). */
    public final int gore;
    /** Behaviour archetype (EnemyDef.ARCH_*; an int so Sim switches on it) and whether it counts against the ranged cap. */
    public final int arch;
    public final boolean ranged;
    /** Hot numbers of the archetype, read from the data once (the rest is read from {@code def.params} when needed). */
    public final float stop, backoff, backoffMul, weave, phaseLen, trigger;
    /** Boss pattern of a {@link EnemyDef#ARCH_BOSS} (BossAi: 1 Cargo Loader, 2 Slagborn, 3 Vire, 4 Foreman, 5 The First). */
    public final int pattern;
    /** The name in capitals, made once (the HUD draws it every frame). */
    public final String nameUpper;

    public EnemyType(EnemyDef def) {
        this.def = def;
        String k = def.key;
        int sh = SH_BLOB;
        int col;
        float r = 11;
        if (k.contains("BAT")) {
            sh = SH_BAT;
            col = pick(k, new String[]{"BAT1", "BAT2", "BAT3", "BAT4", "BAT5", "XLBAT"},
                    new int[]{0xFF6A55A8, 0xFF9A4B55, 0xFF4B7AA8, 0xFFB03060, 0xFF7A2FB0, 0xFF3A3A66}, 0xFF5B4B8A);
            r = 10;
        } else if (k.contains("SKELETON") || k.contains("SKULL")) {
            sh = SH_SKELETON;
            col = 0xFFEFEFE6;
        } else if (k.contains("GHOST")) {
            sh = SH_GHOST;
            col = 0xFFCFE8FF;
        } else if (k.contains("ECTO")) {
            sh = SH_GHOST;
            col = 0xFF9FE0B8;
        } else if (k.contains("DULL")) {
            sh = SH_GHOST;
            col = 0xFF5C5C8A;
        } else if (k.contains("WEREWOLF")) {
            sh = SH_WOLF;
            col = 0xFF7A6250;
            r = 15;
        } else if (k.contains("FLOWER")) {
            sh = SH_FLOWER;
            col = 0xFFD6579B;
        } else if (k.contains("MANTIS")) {
            sh = SH_FLOWER;
            col = 0xFF58A845;
        } else if (k.contains("MUMMY")) {
            sh = SH_MUMMY;
            col = 0xFFDCCB9C;
        } else if (k.contains("MEDUSA")) {
            sh = SH_WITCH;
            col = 0xFF3FA06A;
        } else if (k.contains("WITCH")) {
            sh = SH_WITCH;
            col = 0xFF8A45B8;
        } else if (k.contains("COUNT")) {
            sh = SH_WITCH;
            col = 0xFF5A2A70;
        } else if (k.contains("DEATH")) {
            sh = SH_WITCH;
            col = 0xFF202028;
        } else if (k.contains("BUER")) {
            sh = SH_BLOB;
            col = 0xFFC04040;
        } else if (k.contains("ZOMBIE")) {
            col = 0xFF7FA05E;
        } else if (k.contains("MUDMAN")) {
            col = k.endsWith("2") ? 0xFF6F5230 : 0xFF8F6E45;
            r = 13;
        } else if (k.contains("MUD")) {
            col = 0xFF5A4630;
        } else {
            col = hsv(Math.abs(k.hashCode()) % 360);
        }
        if (k.startsWith("XL")) r = 20;
        else if (k.startsWith("BOSS_")) r = 17;
        this.arch = def.archetype;
        this.ranged = arch == EnemyDef.ARCH_RANGED || arch == EnemyDef.ARCH_FLIER;
        this.stop = def.param("stop", 130f);
        this.backoff = def.param("backoff", 100f);
        this.backoffMul = def.param("backoffMul", 0.7f);
        this.weave = def.param("weave", 0.8f);
        this.phaseLen = def.param("phase", 1f);
        this.trigger = def.param("trigger", 40f);
        this.pattern = Math.round(def.param("pattern", 0f));
        this.nameUpper = def.name.toUpperCase(java.util.Locale.ROOT);
        if (def.params.containsKey("radius")) r = def.param("radius", r); // the Ashfall roster sets its own sizes
        this.shape = sh;
        this.color = col;
        this.radius = (float) (r * Math.max(1.0, def.scale));
        this.alpha = (float) (def.alpha > 0 ? def.alpha : 1);
        boolean own = !def.sprite.isEmpty(); // Ashfall roster: the data names the model
        this.model = own ? def.sprite : modelFor(k);
        this.bossModel = own ? def.sprite : bossModelFor(k);
        this.gore = goreOf(model);
    }

    /** Normal enemies: the Ashfall model that stands in for each Vampire Survivors key. */
    static String modelFor(String k) {
        if (k.startsWith("BOSS_")) return bossModelFor(k);
        if (k.contains("BAT")) return "spore_hound";
        if (k.contains("SKELETON") || k.contains("SKULL") || k.contains("DULL")) return "sergeant";
        if (k.contains("GHOST") || k.contains("ECTO")) return "security_drone";
        if (k.contains("WEREWOLF")) return "welder";
        if (k.contains("MUMMY")) return "smelter";
        if (k.contains("FLOWER")) return "lumen_tentacle";
        if (k.contains("MEDUSA") || k.contains("WITCH") || k.contains("COUNT") || k.contains("DEATH")) return "vire";
        if (k.contains("MANTIS") || k.contains("BUER")) return "spore_carrier";
        return "infected_colonist"; // ZOMBIE, MUD, MUDMAN*
    }

    /** Bosses by size: the Final Boss for the two biggest, Slagborn for the other XL ones, Cargo Loader for the rest. */
    static String bossModelFor(String k) {
        if (k.equals("BOSS_XLDEATH") || k.equals("BOSS_XLMEDUSA")) return "the_first";
        if (k.contains("XL")) return "slagborn";
        return "cargo_loader";
    }

    private static int goreOf(String model) {
        switch (model) {
            case "spore_hound": return 0xFF58E070;
            case "security_drone": return 0xFFFFC060;
            case "smelter": case "slagborn": case "cargo_loader": case "the_first": return 0xFFFF8A30;
            case "lumen_tentacle": return 0xFF30FFA0;
            case "vire": return 0xFFB070FF;
            case "spore_carrier": return 0xFF90E040;
            default: return 0xFFC02818; // colonist, sergeant, welder: blood
        }
    }

    private static int pick(String k, String[] keys, int[] cols, int def) {
        for (int i = 0; i < keys.length; i++) if (keys[i].equals(k)) return cols[i];
        return def;
    }

    private static int hsv(int h) {
        float s = 0.55f, v = 0.75f;
        float c = v * s;
        float x = c * (1 - Math.abs((h / 60f) % 2 - 1));
        float m = v - c;
        float r, g, b;
        if (h < 60) { r = c; g = x; b = 0; }
        else if (h < 120) { r = x; g = c; b = 0; }
        else if (h < 180) { r = 0; g = c; b = x; }
        else if (h < 240) { r = 0; g = x; b = c; }
        else if (h < 300) { r = x; g = 0; b = c; }
        else { r = c; g = 0; b = x; }
        return 0xFF000000 | ((int) ((r + m) * 255) << 16) | ((int) ((g + m) * 255) << 8) | (int) ((b + m) * 255);
    }
}
