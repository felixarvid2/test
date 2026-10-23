package se.felixarvid.thorsurvivors.screen;

import android.app.Activity;
import android.app.ActivityOptions;
import android.content.Intent;
import android.hardware.display.DisplayManager;
import android.os.Handler;
import android.os.Looper;
import android.view.Display;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;

import se.felixarvid.thorsurvivors.ui.PanelView;

/**
 * Finds the second display and shows the control panel there; falls back to a compact overlay on the main
 * screen when there is none. Reacts live to displays being added/removed.
 *
 * Order of attempts for a second display: Presentation -> (InvalidDisplayException etc.) -> SecondaryActivity
 * launched with ActivityOptions.setLaunchDisplayId.
 */
final class DualScreenManager implements DisplayManager.DisplayListener {
    private static volatile boolean activityLaunched;
    private static volatile int activityDisplayId = -1;

    private final Activity host;
    private final FrameLayout root;
    private final GameView gameView;
    private final DisplayManager dm;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private PanelPresentation presentation;
    private PanelView overlay;
    private boolean started;

    DualScreenManager(Activity host, FrameLayout root, GameView gameView) {
        this.host = host;
        this.root = root;
        this.gameView = gameView;
        this.dm = (DisplayManager) host.getSystemService(Activity.DISPLAY_SERVICE);
    }

    static void onSecondaryGone() {
        activityLaunched = false;
        activityDisplayId = -1;
    }

    void start() {
        if (started) return;
        started = true;
        dm.registerDisplayListener(this, handler);
        refresh();
    }

    void stop() {
        if (!started) return;
        started = false;
        dm.unregisterDisplayListener(this);
        teardownSecondary();
        hideOverlay();
    }

    /** The display the panel should go to, or null for single-screen mode. */
    private Display findSecondary() {
        int defaultId = host.getDisplay() != null ? host.getDisplay().getDisplayId() : Display.DEFAULT_DISPLAY;
        for (Display d : dm.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION)) {
            if (d.getDisplayId() != Display.DEFAULT_DISPLAY && d.getDisplayId() != defaultId && d.isValid()) return d;
        }
        for (Display d : dm.getDisplays()) {
            if (d.getDisplayId() != Display.DEFAULT_DISPLAY && d.getDisplayId() != defaultId && d.isValid()
                    && d.getState() != Display.STATE_OFF) {
                return d;
            }
        }
        return null;
    }

    void refresh() {
        if (!started) return;
        Display d = findSecondary();
        if (d == null) {
            teardownSecondary();
            showOverlay();
            gameView.setDual(false);
            return;
        }
        gameView.setDual(true);
        hideOverlay();
        if (presentation != null) {
            if (presentation.isShowing() && presentation.getDisplay().getDisplayId() == d.getDisplayId()) return;
            teardownSecondary();
        }
        if (activityLaunched && activityDisplayId == d.getDisplayId() && SecondaryActivity.current() != null) return;
        if (activityLaunched && activityDisplayId != d.getDisplayId()) SecondaryActivity.finishCurrent();
        try {
            PanelPresentation p = new PanelPresentation(host, d);
            p.show();
            presentation = p;
        } catch (WindowManager.InvalidDisplayException | IllegalStateException | SecurityException ex) {
            presentation = null;
            launchActivityOn(d);
        }
    }

    private void launchActivityOn(Display d) {
        try {
            Intent i = new Intent(host, SecondaryActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_MULTIPLE_TASK);
            ActivityOptions opts = ActivityOptions.makeBasic();
            opts.setLaunchDisplayId(d.getDisplayId());
            activityLaunched = true;
            activityDisplayId = d.getDisplayId();
            host.startActivity(i, opts.toBundle());
        } catch (RuntimeException ex) {
            // Neither path works: behave as single-screen so the game stays playable.
            activityLaunched = false;
            activityDisplayId = -1;
            gameView.setDual(false);
            showOverlay();
        }
    }

    private void teardownSecondary() {
        if (presentation != null) {
            try {
                presentation.dismiss();
            } catch (RuntimeException ignored) {
            }
            presentation = null;
        }
        if (activityLaunched) {
            SecondaryActivity.finishCurrent();
            activityLaunched = false;
            activityDisplayId = -1;
        }
    }

    private void showOverlay() {
        if (overlay != null) return;
        overlay = new PanelView(host, true);
        root.addView(overlay, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private void hideOverlay() {
        if (overlay == null) return;
        root.removeView(overlay);
        overlay = null;
    }

    @Override
    public void onDisplayAdded(int displayId) {
        refresh();
    }

    @Override
    public void onDisplayRemoved(int displayId) {
        refresh();
    }

    @Override
    public void onDisplayChanged(int displayId) {
        refresh();
    }
}
