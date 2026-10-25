package se.felixarvid.thorsurvivors.render;

import android.graphics.Bitmap;
import android.graphics.Canvas;

import se.felixarvid.thorsurvivors.TestData;
import se.felixarvid.thorsurvivors.data.GameData;
import se.felixarvid.thorsurvivors.game.Engine;
import se.felixarvid.thorsurvivors.game.Input;
import se.felixarvid.thorsurvivors.game.MetaProgress;
import se.felixarvid.thorsurvivors.game.Sim;
import se.felixarvid.thorsurvivors.ui.PanelRenderer;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.Random;

/** Shared harness for the Robolectric screenshot tests: boots the real Engine + assets and renders both screens. */
final class Shots {
    static final int TOP_W = 1920, TOP_H = 1080, BOT_W = 1240, BOT_H = 1080;

    final Engine eng = Engine.get();
    final WorldRenderer world = new WorldRenderer();
    final PanelRenderer panel = new PanelRenderer(false);
    private final Bitmap top = Bitmap.createBitmap(TOP_W, TOP_H, Bitmap.Config.ARGB_8888);
    private final Bitmap bottom = Bitmap.createBitmap(BOT_W, BOT_H, Bitmap.Config.ARGB_8888);
    private final Canvas topC = new Canvas(top), botC = new Canvas(bottom);

    private static final class MemStore implements MetaProgress.Store {
        final Map<String, Integer> m = new HashMap<>();

        public int getInt(String k, int d) {
            Integer v = m.get(k);
            return v == null ? d : v;
        }

        public void putInt(String k, int v) {
            m.put(k, v);
        }
    }

    Shots() throws Exception {
        GameData d = TestData.load();
        // Engine is a JVM-wide singleton: always start from fresh meta progress, or power-ups bought by other
        // tests (e.g. EngineSoundTest) leak into these runs and make the shots depend on test order.
        MetaProgress mp = new MetaProgress(d, new MemStore());
        mp.addGold(1234);
        eng.init(d, mp);
        eng.meta = mp;
        SpriteAtlas.get().load(path -> new FileInputStream("src/main/assets/" + path));
        se.felixarvid.thorsurvivors.ui.UiArt.get().ensure(new File("src/main/assets"));
        eng.input.clearMovement();
        eng.phase = Engine.PH_MENU;
        eng.focus = 0;
    }

    static File dir() {
        String env = System.getenv("SHOT_DIR");
        File f = new File(env != null ? env : "build/screenshots");
        f.mkdirs();
        return f;
    }

    /** Starts a Forest run with the given starter and extra weapons, deterministic from `seed` on. */
    Sim startRun(String stage, String starter, long seed, String... extra) {
        eng.selectStage(stage); // FLATS / MINES from the menu list, FOREST / LIBRARY through the debug hook
        for (int i = 0; i < eng.starters.size(); i++) if (eng.starters.get(i).equals(starter)) eng.weaponIdx = i;
        eng.phase = Engine.PH_MENU;
        eng.focus = Engine.MENU_START;
        eng.nextRunSeed = seed; // deterministic from the first spawn on
        eng.input.post(Input.CMD_START, 0, 0, 0);
        eng.advance(1f / 60f);
        Sim s = eng.sim;
        s.rng.setSeed(seed);
        for (String k : extra) s.inv.add(eng.data.weapons.get(k));
        s.recomputeAll();
        s.hp = s.maxHp;
        return s;
    }

    /** Plays `seconds` at 60 Hz walking in slow circles, auto-picking level-ups and chests, never dying. */
    void drive(double seconds, boolean immortal) {
        Sim s = eng.sim;
        int steps = (int) (seconds * 60);
        for (int i = 0; i < steps; i++) {
            step(i, immortal);
        }
    }

    void step(int i, boolean immortal) {
        Sim s = eng.sim;
        double a = i / 60.0 * 0.8;
        eng.input.stickX = (float) Math.cos(a);
        eng.input.stickY = (float) Math.sin(a);
        if (immortal) s.hp = s.maxHp;
        if (eng.phase == Engine.PH_LEVELUP || eng.phase == Engine.PH_CHEST) eng.input.post(Input.CMD_CONFIRM, 0, 0, 0);
        eng.advance(1f / 60f);
    }

    Bitmap renderTop() {
        topC.drawColor(0);
        world.draw(topC, TOP_W, TOP_H, eng, true);
        return top;
    }

    Bitmap renderBottom() {
        botC.drawColor(0);
        panel.draw(botC, BOT_W, BOT_H);
        return bottom;
    }

    static void save(Bitmap b, String name) throws Exception {
        try (FileOutputStream out = new FileOutputStream(new File(dir(), name))) {
            b.compress(Bitmap.CompressFormat.PNG, 100, out);
        }
    }

    static Random rnd(long seed) {
        return new Random(seed);
    }
}
