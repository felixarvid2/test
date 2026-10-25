package se.felixarvid.thorsurvivors.render;

import android.graphics.Bitmap;

/**
 * Small hand-drawn pixel sprites for the few things the Ashfall art has no picture of: coins, food, the power-up
 * pickups and the thrown grenade and flask. Registered as "pix.NAME" at 3x (nearest) so they sit next to the baked art.
 */
final class PixelSprites {
    private PixelSprites() {
    }

    private static final int K = 3;

    private static final String[] COIN = {
            "..oooo..",
            ".oyyhyo.",
            "oyhyyyyo",
            "oyhyddyo",
            "oyyyddyo",
            "oyyyyddo",
            ".oyddyo.",
            "..oooo..",
    };
    private static final String[] BAG = {
            "...oo...",
            "..obbo..",
            "...oo...",
            "..obbbo.",
            ".obyybbo",
            "obbyyybo",
            "obbbybbo",
            "obbbbbdo",
            ".obbbddo",
            "..oooo..",
    };
    private static final String[] GRENADE = {
            "..oo..",
            ".ogto.",
            ".ogto.",
            "ogggdo",
            "oggghd",
            "ogggdo",
            ".oddo.",
            "..oo..",
    };
    private static final String[] FLASK = {
            "..oo..",
            "..oo..",
            ".oggo.",
            "oggggo",
            "ogwggo",
            "oggggo",
            ".oggo.",
            "..oo..",
    };
    private static final String[] ROAST = {
            "...oooo...",
            "..obbbbo..",
            ".obhhbbbo.",
            ".obhbbbbo.",
            ".obbbbbdo.",
            "..obbbdo..",
            "...oddo...",
            "....ow....",
            "...owwo...",
            "...oo.o...",
    };
    private static final String[] MAGNET = {
            "..oooooo..",
            ".orrrrrro.",
            "orrroorrro",
            "orro..orro",
            "orro..orro",
            "orro..orro",
            "orro..orro",
            "owwo..owwo",
            "owwo..owwo",
            ".oo....oo.",
    };
    private static final String[] CLOCK = {
            "...oooo...",
            "..offffo..",
            ".offhfffo.",
            "offfhffffo",
            "offfhhhffo",
            "offffffffo",
            ".offffffo.",
            "..offffo..",
            "...oooo...",
    };
    private static final String[] ROSARY = {
            "...oooo...",
            "...owwo...",
            "...owwo...",
            "ooowwwwooo",
            "owwwrrwwwo",
            "ooowwwwooo",
            "...owwo...",
            "...owwo...",
            "...owwo...",
            "...oooo...",
    };
    private static final String[] CLOVER = {
            ".oo....oo.",
            "oggo..oggo",
            "oggggggggo",
            ".oggggggo.",
            ".oggggggo.",
            "oggggggggo",
            "oggo..oggo",
            ".oo.dd.oo.",
            "....dd....",
            "....d.....",
    };


    static void register(SpriteAtlas atlas) {
        add(atlas, "coin", COIN, "o", 0xFF3A2808, "y", 0xFFE8B830, "h", 0xFFFFF0A0, "d", 0xFFA07818);
        add(atlas, "bag", BAG, "o", 0xFF2A1A08, "b", 0xFF8A6A38, "y", 0xFFE8B830, "d", 0xFF5A4220);
        add(atlas, "grenade", GRENADE, "o", 0xFF101408, "g", 0xFF5A6A3A, "d", 0xFF3A4626, "h", 0xFF8A9A5A, "t", 0xFFFF6A20);
        add(atlas, "flask", FLASK, "o", 0xFF082010, "g", 0xFF3AD070, "w", 0xFFC8FFD8);
        add(atlas, "roast", ROAST, "o", 0xFF3A1C08, "b", 0xFFC8742C, "h", 0xFFE8A050, "d", 0xFF8A4A18, "w", 0xFFF2E6CF);
        add(atlas, "vacuum", MAGNET, "o", 0xFF2A0F36, "r", 0xFFC040E0, "w", 0xFFFFFFFF);
        add(atlas, "orologion", CLOCK, "o", 0xFF0A3050, "f", 0xFF60C0FF, "h", 0xFF0A3050);
        add(atlas, "rosary", ROSARY, "o", 0xFF3A2030, "w", 0xFFFFFFFF, "r", 0xFFFF4060);
        add(atlas, "clover", CLOVER, "o", 0xFF0F3A1A, "g", 0xFF40D060, "d", 0xFF1F7A34);
    }

    private static void add(SpriteAtlas atlas, String name, String[] rows, Object... pal) {
        if (atlas.has("pix." + name)) return;
        int[] colors = new int[128];
        for (int i = 0; i < pal.length; i += 2) colors[((String) pal[i]).charAt(0)] = (Integer) pal[i + 1];
        Bitmap b = bitmap(rows, colors);
        Bitmap big = Bitmap.createScaledBitmap(b, b.getWidth() * K, b.getHeight() * K, false);
        atlas.put("pix." + name, big, big.getWidth() / 2, big.getHeight() / 2);
    }

    private static Bitmap bitmap(String[] rows, int[] colors) {
        int w = rows[0].length(), h = rows.length;
        int[] px = new int[w * h];
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) px[y * w + x] = colors[rows[y].charAt(x) & 127];
        }
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        b.setPixels(px, 0, w, 0, 0, w, h);
        return b;
    }
}
