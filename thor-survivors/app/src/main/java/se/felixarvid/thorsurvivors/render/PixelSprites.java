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

    /** King Bible: a blue (violet for Unholy Vespers) book with a gold cross and cream pages. */
    private static final String[] BOOK = {
            "oooooooooooo",
            "oBBBBBBBBBBo",
            "oBbbbggbbbdo",
            "oBbbbggbbbdo",
            "oBbggggggbdo",
            "oBbggggggbdo",
            "oBbbbggbbbdo",
            "oBbbbggbbbdo",
            "oBbbbggbbbdo",
            "oBbbbbbbbbdo",
            "oBbbbbbbbbdo",
            "oppppppppppo",
            "oPPPPPPPPPPo",
            "oooooooooooo",
    };
    /** Cross / Heaven Sword: a bevelled gold cross (it spins in flight, so it is drawn symmetric). */
    private static final String[] CROSS = {
            "......ooo......",
            ".....ohydo.....",
            ".....ohydo.....",
            ".....ohydo.....",
            ".ooooohydooooo.",
            "ohhhhhhhhhhhhho",
            "oyyyyyhydyyyyyo",
            "odddddhyddddddo",
            ".ooooohydooooo.",
            ".....ohydo.....",
            ".....ohydo.....",
            ".....ohydo.....",
            ".....ohydo.....",
            ".....ohydo.....",
            ".....ohydo.....",
            ".....ohydo.....",
            "......ooo......",
    };


    /** Mad Forest brazier: a stone bowl on a stem with a flickering fire (three frames; the flame rows differ). */
    private static final String[] BRAZIER_BASE = {
            "..oSSeeeeeSSo.",
            "..oSsssssssdo.",
            "...oSsssssdo..",
            "....odsssdo...",
            "......osdo....",
            "......osdo....",
            ".....osSdo....",
            "...ooSsssdoo..",
            "..oSSsssssddo.",
    };
    private static final String[][] BRAZIER_FLAME = {
            {
                ".......oo.....",
                "......orro....",
                "......oyro....",
                ".....oryyro...",
                ".....oyYyyo...",
                "....oryYYyro..",
                "....oyYwwYyo..",
                "...ooryYYyroo.",
            },
            {
                ".......o......",
                "......oro.....",
                "......oyro....",
                ".....oryyo....",
                ".....oyYyro...",
                "....oryYYyo...",
                "....oyYwwYyo..",
                "...ooryYYyroo.",
            },
            {
                "........oo....",
                ".......orro...",
                "......oryyo...",
                "......oyyro...",
                ".....oryYyo...",
                ".....oyYYyro..",
                "....oryYwYyo..",
                "...ooryYYyroo.",
            },
    };
    /** Library candelabra: three candles on a brass stand (the flames flicker over three frames). */
    private static final String[] CANDLE_BASE = {
            ".obbooobooobbo.",
            "..oBBBBBBBBBo..",
            "...odbBBBbdo...",
            ".....obBbo.....",
            ".....obBbo.....",
            "....obBBBbo....",
            "...obBBBBBbo...",
            "..oobBBBBBboo..",
            "..oDDDDDDDDDo..",
    };
    private static final String[][] CANDLE_FLAME = {
            {
                ".......o.......",
                "......ogo......",
                "..o...ofo...o..",
                ".ogo..oco..ogo.",
                ".ofo..oco..ofo.",
                ".oco..oco..oco.",
                ".oco..oco..oco.",
            },
            {
                "......o........",
                "......ogo......",
                "..o...ofo...o..",
                ".ogo..oco..ogo.",
                ".ofo..oco..ofo.",
                ".oco..oco..oco.",
                ".oco..oco..oco.",
            },
            {
                "........o......",
                "......ogo......",
                "...o..ofo....o.",
                ".ogo..oco..ogo.",
                ".ofo..oco..ofo.",
                ".oco..oco..oco.",
                ".oco..oco..oco.",
            },
    };

    static void register(SpriteAtlas atlas) {
        int[] gems = {0xFF4FA8FF, 0xFF4FE08A, 0xFFFF5A5A};
        for (int i = 0; i < gems.length; i++) {
            int c = gems[i];
            add(atlas, "pickup.GEM." + i, GEM, 3, "L", mix(c, 0xFFFFFFFF, 0.55f), "m", c, "d", mix(c, 0xFF000000, 0.35f),
                    "o", mix(c, 0xFF000000, 0.7f));
        }
        add(atlas, "proj.HOLYBOOK", BOOK, 4, "o", 0xFF0B1030, "B", 0xFF78A8FF, "b", 0xFF2F5CD0, "d", 0xFF1E3C99,
                "g", 0xFFFFD84A, "p", 0xFFF4E8C8, "P", 0xFFC8B890);
        add(atlas, "proj.VESPERS", BOOK, 4, "o", 0xFF1E0A30, "B", 0xFFC898FF, "b", 0xFF7A3AD0, "d", 0xFF4E2299,
                "g", 0xFFFFE070, "p", 0xFFF4E8C8, "P", 0xFFC8B890);
        add(atlas, "proj.CROSS", CROSS, 3, "o", 0xFF4A2A08, "h", 0xFFFFF2A8, "y", 0xFFFFD040, "d", 0xFFC08010);
        add(atlas, "proj.HEAVENSWORD", CROSS, 4, "o", 0xFF5A4A10, "h", 0xFFFFFFFF, "y", 0xFFFFF4B0, "d", 0xFFE8C860);
        add(atlas, "pickup.ROAST", ROAST, 4, "o", 0xFF3A1C08, "b", 0xFFC8742C, "h", 0xFFE8A050, "d", 0xFF8A4A18,
                "w", 0xFFF2E6CF);
        add(atlas, "pickup.VACUUM", MAGNET, 4, "o", 0xFF2A0F36, "r", 0xFFC040E0, "w", 0xFFFFFFFF);
        add(atlas, "pickup.OROLOGION", CLOCK, 4, "o", 0xFF0A3050, "f", 0xFF60C0FF, "h", 0xFF0A3050);
        add(atlas, "pickup.ROSARY", ROSARY, 4, "o", 0xFF3A2030, "w", 0xFFFFFFFF, "r", 0xFFFF4060);
        add(atlas, "pickup.CLOVER", CLOVER, 4, "o", 0xFF0F3A1A, "g", 0xFF40D060, "d", 0xFF1F7A34);
        addAnim(atlas, "dest.BRAZIER", BRAZIER_FLAME, BRAZIER_BASE, 4, 7f, "o", 0xFF1C1410, "S", 0xFFB0A494,
                "s", 0xFF7A7064, "d", 0xFF4A423A, "e", 0xFFFF6A20, "r", 0xFFE03A10, "y", 0xFFFF8A1C, "Y", 0xFFFFD040,
                "w", 0xFFFFF4B0);
        addAnim(atlas, "dest.CANDELABRA", CANDLE_FLAME, CANDLE_BASE, 4, 6f, "o", 0xFF1C1410, "B", 0xFFF0C450,
                "b", 0xFFB88028, "d", 0xFF704810, "D", 0xFF704810, "c", 0xFFF2E6CF, "f", 0xFFFFD040, "g", 0xFFFF8A1C);
    }

    private static int mix(int a, int b, float t) {
        int r = (int) (((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
        int g = (int) (((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
        int bl = (int) ((a & 255) * (1 - t) + (b & 255) * t);
        return 0xFF000000 | (r << 16) | (g << 8) | bl;
    }

    private static void add(SpriteAtlas atlas, String key, String[] rows, int k, Object... pal) {
        if (atlas.has(key)) return;
        SpriteAtlas.Sprite s = new SpriteAtlas.Sprite();
        s.base = new Bitmap[]{bitmap(rows, palette(pal))};
        s.k = k;
        atlas.put(key, s);
    }

    /** An animated sprite: one frame per entry of {@code top}, each stacked over the shared {@code bottom} rows. */
    private static void addAnim(SpriteAtlas atlas, String key, String[][] top, String[] bottom, int k, float fps,
                                Object... pal) {
        if (atlas.has(key)) return;
        int[] colors = palette(pal);
        SpriteAtlas.Sprite s = new SpriteAtlas.Sprite();
        s.base = new Bitmap[top.length];
        for (int f = 0; f < top.length; f++) {
            String[] rows = new String[top[f].length + bottom.length];
            System.arraycopy(top[f], 0, rows, 0, top[f].length);
            System.arraycopy(bottom, 0, rows, top[f].length, bottom.length);
            s.base[f] = bitmap(rows, colors);
        }
        s.k = k;
        s.fps = fps;
        atlas.put(key, s);
    }

    private static int[] palette(Object[] pal) {
        int[] colors = new int[128];
        for (int i = 0; i < pal.length; i += 2) colors[((String) pal[i]).charAt(0)] = (Integer) pal[i + 1];
        return colors;
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
