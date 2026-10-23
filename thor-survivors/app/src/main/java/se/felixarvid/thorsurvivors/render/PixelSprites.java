package se.felixarvid.thorsurvivors.render;

import android.graphics.Bitmap;

/**
 * Small hand-drawn pixel sprites for the pickups the CC0 sheets have no good match for (gems, roast, magnet, clock,
 * rosary, clover). They go through the same pre-scaled bitmap path as the sheet sprites, so nothing is vector-drawn
 * in the sorted world pass. Registered after atlas.json; a mapping in atlas.json for the same key wins.
 */
final class PixelSprites {
    private PixelSprites() {
    }

    private static final String[] GEM = {
            "...oo...",
            "..oLLo..",
            ".oLLmmo.",
            "oLLmmmmo",
            "oLmmmmdo",
            "oLmmmddo",
            ".ommmddo",
            "..ommdo.",
            "...odo..",
            "....o...",
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
        int[] gems = {0xFF4FA8FF, 0xFF4FE08A, 0xFFFF5A5A};
        for (int i = 0; i < gems.length; i++) {
            int c = gems[i];
            add(atlas, "pickup.GEM." + i, GEM, 2, "L", mix(c, 0xFFFFFFFF, 0.55f), "m", c, "d", mix(c, 0xFF000000, 0.35f),
                    "o", mix(c, 0xFF000000, 0.7f));
        }
        add(atlas, "pickup.ROAST", ROAST, 3, "o", 0xFF3A1C08, "b", 0xFFC8742C, "h", 0xFFE8A050, "d", 0xFF8A4A18,
                "w", 0xFFF2E6CF);
        add(atlas, "pickup.VACUUM", MAGNET, 3, "o", 0xFF2A0F36, "r", 0xFFC040E0, "w", 0xFFFFFFFF);
        add(atlas, "pickup.OROLOGION", CLOCK, 3, "o", 0xFF0A3050, "f", 0xFF60C0FF, "h", 0xFF0A3050);
        add(atlas, "pickup.ROSARY", ROSARY, 3, "o", 0xFF3A2030, "w", 0xFFFFFFFF, "r", 0xFFFF4060);
        add(atlas, "pickup.CLOVER", CLOVER, 3, "o", 0xFF0F3A1A, "g", 0xFF40D060, "d", 0xFF1F7A34);
    }

    private static int mix(int a, int b, float t) {
        int r = (int) (((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
        int g = (int) (((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
        int bl = (int) ((a & 255) * (1 - t) + (b & 255) * t);
        return 0xFF000000 | (r << 16) | (g << 8) | bl;
    }

    private static void add(SpriteAtlas atlas, String key, String[] rows, int k, Object... pal) {
        if (atlas.has(key)) return;
        int[] colors = new int[128];
        for (int i = 0; i < pal.length; i += 2) colors[((String) pal[i]).charAt(0)] = (Integer) pal[i + 1];
        int w = rows[0].length(), h = rows.length;
        int[] px = new int[w * h];
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) px[y * w + x] = colors[rows[y].charAt(x) & 127];
        }
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        b.setPixels(px, 0, w, 0, 0, w, h);
        SpriteAtlas.Sprite s = new SpriteAtlas.Sprite();
        s.base = new Bitmap[]{b};
        s.k = k;
        atlas.put(key, s);
    }
}
