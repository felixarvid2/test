package se.felixarvid.thorsurvivors.game;

import se.felixarvid.thorsurvivors.data.GameData;
import se.felixarvid.thorsurvivors.data.StageDef;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * The single shared game state. The game thread calls {@link #advance}/{@link #update}; every window (top surface,
 * bottom panel, overlay) only reads these fields and posts commands through {@link #input} (a thread-safe queue).
 *
 * Threading: the game thread holds {@link #lock} while it steps the simulation and while it draws the world; the
 * panel (UI thread) holds it while it draws, so it never sees a half-updated Sim.
 */
public final class Engine {
    public static final int PH_MENU = 0, PH_SHOP = 1, PH_PLAYING = 2, PH_LEVELUP = 3, PH_PAUSED = 4, PH_CHEST = 5,
            PH_RESULT = 6, PH_EQUIP = 7;
    public static final int MENU_START = 0, MENU_STAGE = 1, MENU_HERO = 2, MENU_WEAPON = 3, MENU_SHOP = 4,
            MENU_MUSIC = 5, MENU_SFX = 6, MENU_LIGHT = 7, MENU_COUNT = 8;

    private static final Engine INSTANCE = new Engine();

    public static Engine get() {
        return INSTANCE;
    }

    /** Held while the Sim is mutated or read as a whole (update, world draw, panel draw). Reentrant. */
    public final Object lock = new Object();
    /** Largest simulation step; a longer frame is split into equal substeps no bigger than this. */
    public static final float MAX_STEP = 1f / 60f;
    public static final float MAX_FRAME = 0.1f;

    public final Input input = new Input();
    /** Sound events for {@code audio.AudioEngine}; shared by every run (the Sim is given this instance). */
    public final SoundEvents sound = new SoundEvents();
    public GameData data;
    public MetaProgress meta;
    /** Seed for the next run only (tests and screenshots); null means a fresh random run. */
    public Long nextRunSeed;
    public volatile int phase = PH_MENU;
    public volatile Sim sim;
    public volatile int focus;
    public volatile float menuTime;
    public volatile String toast = "";
    public volatile float toastTimer;

    // menu selections
    public volatile int stageIdx, weaponIdx;
    public List<String> stageKeys = new ArrayList<>();
    public List<String> starters = new ArrayList<>();
    public List<String> shopKeys = new ArrayList<>();

    // transient dialog data
    public volatile List<Offer> offers = new ArrayList<>();
    public volatile String[] chestLines = new String[0];
    public volatile boolean resultWin;
    public volatile int resultTime, resultKills, resultGold, resultLevel;
    /** The equipment choice on the bottom screen (PH_EQUIP): the item offered, its rarity, and the stat lines of the offer. */
    public volatile se.felixarvid.thorsurvivors.data.EquipDef equipNew, equipOld;
    public volatile int equipNewRar, equipOldRar;
    public volatile String[] equipNewLines = new String[0], equipOldLines = new String[0];
    /** The run ended with The First dead: the gold on the result screen counts twice. */
    public volatile boolean resultFirst;
    public volatile Equipment.Diff[] equipDiff = new Equipment.Diff[0];
    public volatile boolean resultNewBest;

    private final Random rng = new Random();
    private final float[] tmp = new float[2];

    private Engine() {
    }

    public void init(GameData d, MetaProgress m) {
        if (data != null) return;
        data = d;
        meta = m;
        for (String k : GameData.STAGE_ORDER) if (d.stages.containsKey(k)) stageKeys.add(k);
        if (stageKeys.isEmpty()) stageKeys.addAll(d.stages.keySet()); // data without the Ashfall stages (tests of the base data)
        starters = d.starterWeapons();
        shopKeys.addAll(d.powerUps.keySet());
    }

    public boolean isReady() {
        return data != null;
    }

    /** Debug / test hook: a stage that is not in the menu (the Vampire Survivors FOREST and LIBRARY), until the menu changes the stage. */
    public volatile String stageOverride;

    public StageDef stage() {
        String o = stageOverride;
        return data.stages.get(o != null ? o : stageKeys.get(stageIdx));
    }

    /**
     * Picks the stage of the next run. The menu stages (Cinder Flats, Deep Mines) set the menu row; any other key of
     * the data (FOREST, LIBRARY) is only reachable through here, for tests and balance runs.
     */
    public void selectStage(String key) {
        int i = stageKeys.indexOf(key);
        stageOverride = i >= 0 ? null : (data.stages.containsKey(key) ? key : null);
        if (i >= 0) stageIdx = i;
    }

    public boolean gameActive() {
        return phase == PH_PLAYING;
    }

    // ------------------------------------------------------------------ update (game thread)

    /**
     * Advances by one display frame of real time: the time is clamped to {@link #MAX_FRAME} and split into the fewest
     * equal substeps of at most {@link #MAX_STEP}, so 60 Hz gives one step per frame, 120 Hz gives steps of 8.3 ms
     * and a stall never turns into a burst.
     */
    public void advance(float frameDt) {
        if (frameDt <= 0f) return;
        if (frameDt > MAX_FRAME) frameDt = MAX_FRAME;
        int n = Math.max(1, (int) Math.ceil(frameDt / (MAX_STEP * 1.05f)));
        float h = frameDt / n;
        synchronized (lock) {
            for (int i = 0; i < n; i++) update(h);
        }
    }

    public void update(float dt) {
        if (data == null) return;
        synchronized (lock) {
            step(dt);
        }
    }

    private void step(float dt) {
        int[] c;
        while ((c = input.poll()) != null) handle(c);
        if (toastTimer > 0) toastTimer -= dt;
        menuTime += dt;
        if (phase != PH_PLAYING) sound.advance(dt); // while playing, Sim.update advances the clock
        if (phase == PH_PLAYING) {
            Sim s = sim;
            s.update(dt, input);
            if (s.ended != 0) finishRun(s.ended == 2);
            else if (s.pendingLevelUps > 0) openLevelUp();
            else if (s.pendingChests > 0) {
                chestLines = s.openChest();
                phase = PH_CHEST;
                focus = 0;
            } else if (s.equipN > 0) openEquip();
        }
    }

    private void openLevelUp() {
        Sim s = sim;
        // the level this card is for: with several level-ups pending, the first one is for the lowest of those levels
        int offerLevel = s.level - s.pendingLevelUps + 1;
        offers = OfferGenerator.generate(s.inv, data.weapons.values(), s.stats.luck, rng,
                s.main == null ? null : s.main.def, s.main == null ? null : s.main.tier, offerLevel);
        phase = PH_LEVELUP;
        focus = 0;
    }

    /** A better item than the worn one was picked up: the choice screen (Keep or Replace) pauses the run like a level-up. */
    private void openEquip() {
        Sim s = sim;
        equipNew = s.equipQueuedDef();
        equipNewRar = s.equipQueuedRar();
        equipOld = s.equip.def[equipNew.slot];
        equipOldRar = s.equip.rar[equipNew.slot];
        equipNewLines = Equipment.lines(data, equipNew, equipNewRar);
        equipOldLines = equipOld == null ? new String[0] : Equipment.lines(data, equipOld, equipOldRar);
        equipDiff = Equipment.diff(data, equipOld, equipOldRar, equipNew, equipNewRar);
        phase = PH_EQUIP;
        focus = 1; // Replace is the better item: it starts selected
    }

    /** Answers the choice: replace = wear the new item, else keep the old one; then the next choice or back to the run. */
    private void answerEquip(boolean replace) {
        Sim s = sim;
        s.resolveEquip(replace);
        if (s.equipN > 0) openEquip();
        else resume();
    }

    private void startRun() {
        long seed = nextRunSeed != null ? nextRunSeed : System.nanoTime(); // a new run every time unless a test fixed it
        sim = new Sim(data, stage(), starters.get(weaponIdx), meta.bonuses(), meta.heroKey(), seed);
        rng.setSeed(seed * 31L + 7L); // the level-up cards follow the run seed too, so a fixed seed repeats the whole run
        nextRunSeed = null;
        sim.sound = sound;
        input.clearMovement();
        phase = PH_PLAYING;
        focus = 0;
    }

    private void finishRun(boolean win) {
        Sim s = sim;
        resultWin = win;
        resultTime = (int) s.time;
        resultKills = s.kills;
        resultGold = s.endGold();
        resultFirst = s.firstKilled;
        resultLevel = s.level;
        resultNewBest = resultTime > meta.bestTimeSec;
        meta.addGold(resultGold);
        meta.recordRun(resultTime, s.kills, s.stage.key);
        phase = PH_RESULT;
        focus = 0;
        sound.emit(win ? SoundEvents.VICTORY : SoundEvents.GAME_OVER);
    }

    private void toast(String t) {
        toast = t;
        toastTimer = 1.8f;
    }

    // ------------------------------------------------------------------ commands

    private void handle(int[] c) {
        switch (c[0]) {
            case Input.CMD_NAV: nav(c[1]); break;
            case Input.CMD_CONFIRM: confirm(0); break;
            case Input.CMD_BACK: {
                int before = phase;
                back();
                if (phase != before && before != PH_PLAYING) sound.emit(SoundEvents.UI_BACK);
                break;
            }
            case Input.CMD_START: start(); break;
            case Input.CMD_TAP:
                if (c[1] == phase) {
                    focus = c[2];
                    confirm(c[3]);
                }
                break;
            case Input.CMD_AUTOPAUSE:
                if (phase == PH_PLAYING) {
                    phase = PH_PAUSED;
                    focus = 0;
                }
                break;
            default:
        }
    }

    private int itemCount() {
        switch (phase) {
            case PH_MENU: return MENU_COUNT;
            case PH_SHOP: return shopKeys.size() + 1;
            case PH_LEVELUP: return offers.size();
            case PH_EQUIP: return 2;
            case PH_PAUSED: return 2;
            default: return 1;
        }
    }

    private void nav(int dir) {
        int n = itemCount();
        int f = focus;
        int before = f;
        boolean changed = false;
        switch (phase) {
            case PH_MENU:
                if (dir == Input.UP) f = (f + n - 1) % n;
                else if (dir == Input.DOWN) f = (f + 1) % n;
                else if (isCycleRow(f)) {
                    changed = cycle(f, dir == Input.RIGHT ? 1 : -1);
                }
                break;
            case PH_SHOP:
                if (dir == Input.LEFT) f--;
                else if (dir == Input.RIGHT) f++;
                else if (dir == Input.UP) f -= 2;
                else f += 2;
                f = Math.max(0, Math.min(n - 1, f));
                break;
            case PH_LEVELUP:
            case PH_PAUSED:
            case PH_EQUIP:
                if (dir == Input.UP || dir == Input.LEFT) f = (f + n - 1) % n;
                else f = (f + 1) % n;
                break;
            default:
        }
        focus = f;
        if (phase != PH_PLAYING && phase != PH_CHEST && phase != PH_RESULT && (f != before || changed)) {
            sound.emit(SoundEvents.UI_MOVE);
        }
    }

    /** Menu rows whose value is stepped with left/right (stage, hero, weapon, volumes, lighting). */
    public static boolean isCycleRow(int f) {
        return f == MENU_STAGE || f == MENU_HERO || f == MENU_WEAPON || f == MENU_MUSIC || f == MENU_SFX
                || f == MENU_LIGHT;
    }

    /** Step a menu row's value; true if it changed (a one-entry list or a clamped setting does not). */
    private boolean cycle(int item, int delta) {
        int before = cycleValue(item);
        if (item == MENU_STAGE) {
            stageOverride = null;
            stageIdx = (stageIdx + delta + stageKeys.size()) % stageKeys.size();
        }
        else if (item == MENU_HERO) meta.stepHero(delta);
        else if (item == MENU_MUSIC) meta.stepMusic(delta);
        else if (item == MENU_SFX) meta.stepSfx(delta);
        else if (item == MENU_LIGHT) meta.stepLighting(delta);
        else weaponIdx = (weaponIdx + delta + starters.size()) % starters.size();
        return cycleValue(item) != before;
    }

    private int cycleValue(int item) {
        if (item == MENU_STAGE) return stageIdx;
        if (item == MENU_HERO) return meta.heroIdx;
        if (item == MENU_MUSIC) return meta.musicVol;
        if (item == MENU_SFX) return meta.sfxVol;
        if (item == MENU_LIGHT) return meta.lighting;
        return weaponIdx;
    }

    private void confirm(int sub) {
        int f = focus;
        int ph = phase;
        boolean ok = true;
        switch (phase) {
            case PH_MENU:
                if (f == MENU_START) startRun();
                else if (isCycleRow(f)) {
                    cycle(f, sub == 0 ? 1 : sub);
                }
                else if (f == MENU_SHOP) {
                    phase = PH_SHOP;
                    focus = 0;
                }
                break;
            case PH_SHOP:
                if (f >= shopKeys.size()) {
                    phase = PH_MENU;
                    focus = MENU_SHOP;
                } else {
                    String k = shopKeys.get(f);
                    if (meta.isMaxed(k)) {
                        toast("Already maxed");
                        ok = false;
                    } else if (!meta.buy(k)) {
                        toast("Not enough gold");
                        ok = false;
                    }
                    else toast("Purchased " + data.powerUps.get(k).name);
                }
                break;
            case PH_LEVELUP: {
                List<Offer> o = offers;
                if (f < o.size()) {
                    Sim s = sim;
                    s.applyOffer(o.get(f));
                    s.pendingLevelUps--;
                    if (s.pendingLevelUps > 0) openLevelUp();
                    else resume();
                }
                break;
            }
            case PH_PAUSED:
                if (f == 0) resume();
                else quitRun();
                break;
            case PH_EQUIP:
                answerEquip(f == 1); // card 0 = Keep, card 1 = Replace
                break;
            case PH_CHEST:
                resume();
                break;
            case PH_RESULT:
                phase = PH_MENU;
                focus = 0;
                break;
            case PH_PLAYING:
                phase = PH_PAUSED;
                focus = 0;
                break;
            default:
        }
        if (ph != PH_PLAYING) sound.emit(ok ? SoundEvents.UI_CONFIRM : SoundEvents.UI_BACK);
    }

    private void resume() {
        input.clearMovement();
        phase = PH_PLAYING;
        focus = 0;
    }

    private void quitRun() {
        // abandoning still banks the gold collected so far
        Sim s = sim;
        if (s != null) {
            meta.addGold(s.gold);
            meta.recordRun((int) s.time, s.kills, s.stage.key);
        }
        phase = PH_MENU;
        focus = 0;
    }

    private void back() {
        switch (phase) {
            case PH_SHOP: phase = PH_MENU; focus = MENU_SHOP; break;
            case PH_PLAYING: phase = PH_PAUSED; focus = 0; break;
            case PH_PAUSED: resume(); break;
            case PH_EQUIP: answerEquip(false); break; // B = keep what you wear
            case PH_RESULT: phase = PH_MENU; focus = 0; break;
            default:
        }
    }

    private void start() {
        switch (phase) {
            case PH_PLAYING: phase = PH_PAUSED; focus = 0; break;
            case PH_PAUSED: resume(); break;
            case PH_MENU: startRun(); break;
            default:
        }
    }
}
