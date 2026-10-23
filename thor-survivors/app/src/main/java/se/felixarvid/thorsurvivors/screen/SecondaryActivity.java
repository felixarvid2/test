package se.felixarvid.thorsurvivors.screen;

import android.app.Activity;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.MotionEvent;

import se.felixarvid.thorsurvivors.game.Engine;
import se.felixarvid.thorsurvivors.ui.PanelView;

/** Fallback host for the bottom-screen panel when a Presentation cannot be shown on the second display. */
public final class SecondaryActivity extends Activity {
    private static SecondaryActivity current;

    static SecondaryActivity current() {
        return current;
    }

    static void finishCurrent() {
        SecondaryActivity a = current;
        if (a != null) a.finish();
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        current = this;
        setContentView(new PanelView(this, false));
        Immersive.apply(getWindow());
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
        if (event.getKeyCode() == KeyEvent.KEYCODE_BACK) return true;
        return super.dispatchKeyEvent(event);
    }

    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent ev) {
        if (InputRouter.onMotion(ev)) return true;
        return super.dispatchGenericMotionEvent(ev);
    }

    @Override
    public void onBackPressed() {
        // swallowed
    }

    @Override
    protected void onDestroy() {
        if (current == this) current = null;
        DualScreenManager.onSecondaryGone();
        super.onDestroy();
    }
}
