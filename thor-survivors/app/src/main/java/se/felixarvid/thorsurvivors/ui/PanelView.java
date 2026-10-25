package se.felixarvid.thorsurvivors.ui;

import android.content.Context;
import android.graphics.Canvas;
import android.view.MotionEvent;
import android.view.View;

/** View host for {@link PanelRenderer}; redraws on every vsync (60 Hz or more) while attached. */
public final class PanelView extends View {
    private final PanelRenderer renderer;
    private boolean running;

    public PanelView(Context context, boolean compact) {
        super(context);
        UiArt.get().ensure(context.getApplicationContext().getAssets()); // typeface and textures, once
        renderer = new PanelRenderer(compact);
        setWillNotDraw(false);
        setFocusable(false);
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        running = true;
        postInvalidateOnAnimation();
    }

    @Override
    protected void onDetachedFromWindow() {
        running = false;
        super.onDetachedFromWindow();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        renderer.draw(canvas, getWidth(), getHeight());
        if (running) postInvalidateOnAnimation(); // next vsync
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        return renderer.onTouch(event);
    }
}
