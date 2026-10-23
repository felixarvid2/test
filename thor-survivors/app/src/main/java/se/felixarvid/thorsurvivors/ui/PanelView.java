package se.felixarvid.thorsurvivors.ui;

import android.content.Context;
import android.graphics.Canvas;
import android.view.MotionEvent;
import android.view.View;

/** View host for {@link PanelRenderer}, invalidated at ~30 fps while attached. */
public final class PanelView extends View {
    private static final long FRAME_MS = 33;
    private final PanelRenderer renderer;
    private boolean running;
    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            if (!running) return;
            invalidate();
            postDelayed(this, FRAME_MS);
        }
    };

    public PanelView(Context context, boolean compact) {
        super(context);
        renderer = new PanelRenderer(compact);
        setWillNotDraw(false);
        setFocusable(false);
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        running = true;
        post(tick);
    }

    @Override
    protected void onDetachedFromWindow() {
        running = false;
        removeCallbacks(tick);
        super.onDetachedFromWindow();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        renderer.draw(canvas, getWidth(), getHeight());
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        return renderer.onTouch(event);
    }
}
