package se.felixarvid.thorsurvivors.data;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** A permanent shop upgrade. Row 0 has price + stat, later rows are per-rank stat additions. */
public final class PowerUpDef {
    public final String key;
    public final String name;
    public final String description;
    public final int basePrice;
    public final List<Map<String, Double>> rows;

    public PowerUpDef(String key, String name, String description, int basePrice, List<Map<String, Double>> rows) {
        this.key = key;
        this.name = name;
        this.description = description;
        this.basePrice = basePrice;
        this.rows = rows;
    }

    /** A copy with another display name (the Ashfall overlay). */
    public PowerUpDef withName(String newName) {
        return new PowerUpDef(key, newName, description, basePrice, rows);
    }

    public int maxRank() {
        return rows.size();
    }

    /** Price of the next rank when `ranks` are already owned: price * (1 + ranks). */
    public int priceForNext(int ranks) {
        return basePrice * (1 + ranks);
    }

    /** Summed stats of the first `ranks` rows. */
    public Map<String, Double> statsAt(int ranks) {
        Map<String, Double> out = new java.util.HashMap<>();
        for (int i = 0; i < Math.min(ranks, rows.size()); i++) {
            for (Map.Entry<String, Double> e : rows.get(i).entrySet()) {
                if (e.getKey().equals("price") || e.getKey().equals("level") || e.getKey().equals("unlockedRank")) continue;
                Double p = out.get(e.getKey());
                out.put(e.getKey(), p == null ? e.getValue() : p + e.getValue());
            }
        }
        return out;
    }

    public List<String> statKeys() {
        List<String> k = new ArrayList<>(rows.get(0).keySet());
        k.remove("price");
        k.remove("level");
        k.remove("unlockedRank");
        return k;
    }
}
