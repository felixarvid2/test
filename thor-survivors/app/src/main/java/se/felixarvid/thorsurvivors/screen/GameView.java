package se.felixarvid.thorsurvivors.screen;

import android.content.Context;
import android.graphics.Canvas;
import android.view.SurfaceHolder;
import android.view.SurfaceView;

import java.util.concurrent.locks.LockSupport;

import se.felixarvid.thorsurvivors.game.Engine;
import se.felixarvid.thorsurvivors.render.WorldRenderer;

/** Top-screen world surface. A dedicated thread runs the fixed-timestep update loop and draws. */
public final class GameView extends SurfaceView implements SurfaceHolder.Callback {
    private static final double STEP = 1.0 / 60.0;
    private static final long FRAME_NS = 16_666_667L;

    private final WorldRenderer renderer = new WorldRenderer();
    private volatile boolean dual;
    private volatile boolean running;
    private Thread thread;

    public GameView(Context ctx) {
        super(ctx);
        getHolder().addCallback(this);
        setFocusable(false);
    }

    public void setDual(boolean dual) {
        this.dual = dual;
    }

    @Override
    public void surfaceCreated(SurfaceHolder holder) {
        running = true;
        thread = new Thread(() -> loop(holder), "game-loop");
        thread.start();
    }

    @Override
    public void surfaceChanged(SurfaceHolder holder, int format, int w, int h) {
    }

    @Override
    public void surfaceDestroyed(SurfaceHolder holder) {
        running = false;
        if (thread != null) {
            try {
                thread.join(1000);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
            thread = null;
        }
    }

    private void loop(SurfaceHolder holder) {
        Engine eng = Engine.get();
        long last = System.nanoTime();
        double acc = 0;
        while (running) {
            long frameStart = System.nanoTime();
            double dt = (frameStart - last) / 1e9;
            last = frameStart;
            if (dt > 0.1) dt = 0.1; // after a stall do not simulate a burst
            acc += dt;
            while (acc >= STEP) {
                eng.update((float) STEP);
                acc -= STEP;
            }
            Canvas c = null;
            try {
                c = holder.lockHardwareCanvas();
            } catch (Throwable t) {
                try {
                    c = holder.lockCanvas();
                } catch (Throwable ignored) {
                    c = null;
                }
            }
            if (c != null) {
                try {
                    renderer.draw(c, getWidth(), getHeight(), eng, dual);
                } finally {
                    holder.unlockCanvasAndPost(c);
                }
            }
            long remaining = FRAME_NS - (System.nanoTime() - frameStart);
            if (remaining > 0) LockSupport.parkNanos(remaining);
        }
    }
}
