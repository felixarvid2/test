package se.felixarvid.thorsurvivors.game;

import se.felixarvid.thorsurvivors.data.BranchDef;
import se.felixarvid.thorsurvivors.data.MainWeaponDef;
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
        return generate(inv, defs, luck, rng, null, null, 0);
    }

    /** Hero levels that offer a branch card: 5, 10, 15, ... */
    public static boolean isBranchLevel(int level) {
        return level > 0 && level % 5 == 0;
    }

    /**
     * The branch cards for a level-up at hero level {@code level} (design 2.2 and 8), or an empty list. Only at levels
     * 5, 10, 15, ...; tiers go in order and tier I / II / III need hero level 5 / 15 / 25 ({@link BranchDef#TIER_LEVEL}).
     * When any started branch can take its next tier now, those next tiers are offered (up to 2, one card each: the
     * choice at level 15 is between your branches); otherwise tier I of up to 2 random branches not started yet.
     */
    public static List<Offer> branchOffers(MainWeaponDef mw, int[] tiers, int level, Random rng) {
        List<Offer> out = new ArrayList<>();
        if (mw == null || tiers == null || !isBranchLevel(level)) return out;
        for (int b = 0; b < mw.branches.size(); b++) {
            int next = tiers[b] + 1;
            if (tiers[b] > 0 && next <= BranchDef.TIERS && level >= BranchDef.TIER_LEVEL[next - 1]) {
                out.add(Offer.branch(mw.branches.get(b), b, next));
            }
        }
        if (out.isEmpty()) {
            for (int b = 0; b < mw.branches.size(); b++) {
                if (tiers[b] == 0 && level >= BranchDef.TIER_LEVEL[0]) out.add(Offer.branch(mw.branches.get(b), b, 1));
            }
        }
        while (out.size() > 2) out.remove(rng.nextInt(out.size()));
        return out;
    }

    /**
     * Like {@link #generate(Inventory, Collection, double, Random)} for a hero run: at hero levels 5, 10, 15, ... the
     * branch cards replace the last card slots (one or two cards), the rest are the usual weighted draws.
     */
    public static List<Offer> generate(Inventory inv, Collection<WeaponDef> defs, double luck, Random rng,
                                       MainWeaponDef mw, int[] tiers, int level) {
        List<Offer> pool = candidates(inv, defs);
        int count = 3;
        if (rng.nextDouble() < Math.min(0.75, Math.max(0, luck))) count = 4;
        List<Offer> branches = branchOffers(mw, tiers, level, rng);
        count -= branches.size();
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
        if (out.isEmpty() && branches.isEmpty()) {
            out.add(new Offer(Offer.HEAL, null, 0));
            out.add(new Offer(Offer.GOLD, null, 0));
        }
        out.addAll(branches);
        return out;
    }
}
