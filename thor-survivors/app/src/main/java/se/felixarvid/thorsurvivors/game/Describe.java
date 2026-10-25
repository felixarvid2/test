package se.felixarvid.thorsurvivors.game;

import se.felixarvid.thorsurvivors.data.WeaponDef;

import java.util.Map;
import java.util.TreeMap;

/** Human-readable text for level-up cards, in the Ashfall tone: short, flat, no jokes. */
public final class Describe {
    private Describe() {
    }

    public static String offer(Offer o) {
        switch (o.kind) {
            case Offer.HEAL:
                return "Field repair. Restores 30 HP.";
            case Offer.GOLD:
                return "Salvage haul. +25 gold.";
            case Offer.BRANCH:
                return o.branch.tiers[o.newLevel - 1].description;
            case Offer.NEW_WEAPON:
            case Offer.NEW_PASSIVE:
            case Offer.PASSIVE_LEVEL:
                return o.def.description;
            default:
                return delta(o.def, o.newLevel);
        }
    }

    /** Text for the stats a weapon gains when it reaches `level`. */
    public static String delta(WeaponDef d, int level) {
        Map<String, Double> row = new TreeMap<>(d.deltaFor(level));
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, Double> e : row.entrySet()) {
            String s = one(e.getKey(), e.getValue());
            if (s == null) continue;
            if (sb.length() > 0) sb.append(", ");
            sb.append(s);
        }
        return sb.length() == 0 ? "Upgrade installed." : sb.toString();
    }

    private static String one(String k, double v) {
        switch (k) {
            case "amount":
                return sign(v, 0) + " round" + (Math.abs(v) > 1 ? "s" : "") + " per volley";
            case "power":
                return "Damage " + sign(v * 10, 0);
            case "area":
                return "Area " + sign(v * 100, 0) + "%";
            case "speed":
                return "Speed " + sign(v * 100, 0) + "%";
            case "interval":
                return "Cooldown " + sign(v / 1000.0, 1) + "s";
            case "duration":
                return "Duration " + sign(v / 1000.0, 1) + "s";
            case "penetrating":
                return "Pierce " + sign(v, 0);
            case "knockback":
                return "Knockback " + sign(v * 100, 0) + "%";
            case "critChance":
                return "Crit " + sign(v * 100, 0) + "%";
            case "critMul":
                return "Crit damage " + sign(v * 100, 0) + "%";
            default:
                return null;
        }
    }

    private static String sign(double v, int decimals) {
        String body = decimals == 0 ? Long.toString(Math.round(Math.abs(v)))
                : String.format(java.util.Locale.US, "%." + decimals + "f", Math.abs(v));
        return (v < 0 ? "-" : "+") + body;
    }
}
