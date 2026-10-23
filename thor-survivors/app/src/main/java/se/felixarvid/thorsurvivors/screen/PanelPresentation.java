package se.felixarvid.thorsurvivors.screen;

import android.app.Presentation;
import android.content.Context;
import android.os.Bundle;
import android.view.Display;
import android.view.KeyEvent;
import android.view.MotionEvent;

import se.felixarvid.thorsurvivors.game.Engine;
import se.felixarvid.thorsurvivors.ui.PanelView;

/** The bottom-screen control panel shown through android.app.Presentation. */
final class PanelPresentation extends Presentation {
    PanelPresentation(Context outer, Display display) {
        super(outer, display);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setCancelable(false);
        setContentView(new PanelView(getContext(), false));
        Immersive.apply(getWindow());
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (!hasFocus) Engine.get().input.clearMovement(); // key-up events are lost with focus
        else Immersive.apply(getWindow());
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (InputRouter.onKey(event)) return true;
        if (event.getKeyCode() == KeyEvent.KEYCODE_BACK) return true; // never let BACK dismiss the panel
        return super.dispatchKeyEvent(event);
    }

    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent ev) {
        if (InputRouter.onMotion(ev)) return true;
        return super.dispatchGenericMotionEvent(ev);
    }

    @Override
    public void onBackPressed() {
        // swallowed: the panel is part of the game, not a dialog
    }
}
