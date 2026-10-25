package se.felixarvid.thorsurvivors.screen;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.media.AudioManager;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.widget.FrameLayout;

import java.io.InputStream;

import se.felixarvid.thorsurvivors.audio.AudioEngine;
import se.felixarvid.thorsurvivors.data.GameData;
import se.felixarvid.thorsurvivors.game.Engine;
import se.felixarvid.thorsurvivors.game.Input;
import se.felixarvid.thorsurvivors.game.MetaProgress;
import se.felixarvid.thorsurvivors.render.SpriteAtlas;

/** Top screen: the game world. Owns the second-screen manager. */
public final class MainActivity extends Activity {
    private GameView gameView;
    private DualScreenManager dual;
    private AudioEngine audio;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        Engine eng = Engine.get();
        if (!eng.isReady()) {
            try (InputStream in = getAssets().open("game_data.json");
                 InputStream over = getAssets().open("ashfall_data.json")) {
                GameData data = GameData.load(in, over); // Ashfall names merged over the Vampire Survivors data
                eng.init(data, new MetaProgress(data, new PrefsStore(this)));
            } catch (Exception e) {
                throw new RuntimeException("Cannot load game_data.json", e);
            }
        }
        if (!SpriteAtlas.get().isLoaded()) SpriteAtlas.get().load(getAssets()); // decodes ~50 MB of sheets once
        se.felixarvid.thorsurvivors.ui.UiArt.get().ensure(getAssets()); // ASHFALL UI typeface and textures
        setVolumeControlStream(AudioManager.STREAM_MUSIC); // the hardware volume keys control the game's audio
        audio = new AudioEngine(this, eng);
        FrameLayout root = new FrameLayout(this);
        gameView = new GameView(this);
        gameView.setAudio(audio);
        root.addView(gameView, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        Immersive.apply(getWindow());
        dual = new DualScreenManager(this, root, gameView);
    }

    @Override
    protected void onStart() {
        super.onStart();
        dual.start();
    }

    @Override
    protected void onResume() {
        super.onResume();
        Immersive.apply(getWindow());
        dual.refresh();
        audio.resume();
    }

    @Override
    protected void onPause() {
        // pause an in-progress run; the game thread stops with the surface
        Engine.get().input.post(Input.CMD_AUTOPAUSE, 0, 0, 0);
        Engine.get().input.clearMovement();
        audio.pause();
        super.onPause();
    }

    @Override
    protected void onStop() {
        dual.stop();
        super.onStop();
    }

    @Override
    protected void onDestroy() {
        dual.stop();
        gameView.setAudio(null);
        audio.release();
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (!hasFocus) Engine.get().input.clearMovement();
        else Immersive.apply(getWindow());
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (InputRouter.onKey(event)) return true;
        return super.dispatchKeyEvent(event);
    }

    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent ev) {
        if (InputRouter.onMotion(ev)) return true;
        return super.dispatchGenericMotionEvent(ev);
    }
}
