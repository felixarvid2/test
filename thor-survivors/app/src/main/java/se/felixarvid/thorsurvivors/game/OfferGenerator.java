package se.felixarvid.thorsurvivors.game;

import se.felixarvid.thorsurvivors.data.WeaponDef;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Random;

/** Builds the 3 (or 4 with luck) level-up choices, weighted by each def's rarity. */
public final class OfferGenerator {
    private OfferGenerator() {
    }

    /** Every offer currently possible: respects slot limits and never includes evolved weapons. */
    public static List<Offer> candidates(Inventory inv, Collection<WeaponDef> defs) {
        List<Offer> out = new ArrayList<>();
        for (WeaponDef d : defs) {
            if (d.evolution) continue;
            int owned = inv.levelOf(d.key);
            if (owned > 0) {
                if (owned < d.maxLevel()) {
                    out.add(new Offer(d.powerUp ? Offer.PASSIVE_LEVEL : Offer.WEAPON_LEVEL, d, owned + 1));
                }
            } else if (d.powerUp ? inv.passiveCount < Inventory.MAX_PASSIVES : inv.weaponCount < Inventory.MAX_WEAPONS) {
                out.add(new Offer(d.powerUp ? Offer.NEW_PASSIVE : Offer.NEW_WEAPON, d, 1));
            }
        }
        return out;
    }

    /**
     * @param luck total luck (0.1 = 10%): chance of a 4th card.
     * When nothing is upgradeable, falls back to a heal / gold card.
     */
    public static List<Offer> generate(Inventory inv, Collection<WeaponDef> defs, double luck, Random rng) {
        List<Offer> pool = candidates(inv, defs);
        int count = 3;
        if (rng.nextDouble() < Math.min(0.75, Math.max(0, luck))) count = 4;
        List<Offer> out = new ArrayList<>();
        while (out.size() < count && !pool.isEmpty()) {
            long total = 0;
            for (Offer o : pool) total += o.def.rarity;
            long r = (long) (rng.nextDouble() * total);
            int pick = pool.size() - 1;
            for (int i = 0; i < pool.size(); i++) {
                r -= pool.get(i).def.rarity;
                if (r < 0) {
                    pick = i;
                    break;
                }
            }
            out.add(pool.remove(pick));
        }
        if (out.isEmpty()) {
            out.add(new Offer(Offer.HEAL, null, 0));
            out.add(new Offer(Offer.GOLD, null, 0));
        }
        return out;
    }
}
