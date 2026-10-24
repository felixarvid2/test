package se.felixarvid.thorsurvivors.screen;

import android.content.Context;
import android.graphics.Canvas;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.view.Choreographer;
import android.view.Surface;
import android.view.SurfaceHolder;
import android.view.SurfaceView;

import se.felixarvid.thorsurvivors.audio.AudioEngine;
import se.felixarvid.thorsurvivors.game.Engine;
import se.felixarvid.thorsurvivors.render.WorldRenderer;

/**
 * Top-screen world surface. A dedicated thread is paced by the display's vsync (Choreographer), so it runs at
 * whatever rate the panel does (60 or 120 Hz). Each frame advances the simulation by the real time between vsyncs
 * ({@link Engine#advance} splits it into steps of at most 1/60 s) and draws once; there is no sleeping and no
 * fixed-step accumulator, so a frame never gets 0 or 2 updates in alternation.
 */
public final class GameView extends SurfaceView implements SurfaceHolder.Callback {
    private final WorldRenderer renderer = new WorldRenderer();
    private volatile boolean dual;
    private volatile AudioEngine audio;
    private HandlerThread thread;
    private Loop loop;

    public GameView(Context ctx) {
        super(ctx);
        getHolder().addCallback(this);
        setFocusable(false);
    }

    public void setAudio(AudioEngine audio) {
        this.audio = audio;
    }

    public void setDual(boolean dual) {
        this.dual = dual;
    }

    @Override
    public void surfaceCreated(SurfaceHolder holder) {
        stopLoop();
        thread = new HandlerThread("game-loop", android.os.Process.THREAD_PRIORITY_DISPLAY);
        thread.start();
        loop = new Loop(holder);
        new Handler(thread.getLooper()).post(loop::start);
    }

    @Override
    public void surfaceChanged(SurfaceHolder holder, int format, int w, int h) {
        // ask for 120 Hz on panels that have it; DEFAULT compatibility lets the system fall back to what it supports
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                holder.getSurface().setFrameRate(120f, Surface.FRAME_RATE_COMPATIBILITY_DEFAULT);
            } catch (Throwable ignored) {
                // a hint only
            }
        }
    }

    @Override
    public void surfaceDestroyed(SurfaceHolder holder) {
        stopLoop();
    }

    private void stopLoop() {
        Loop l = loop;
        HandlerThread t = thread;
        loop = null;
        thread = null;
        if (l != null) l.stop();
        if (t != null) {
            t.quitSafely();
            try {
                t.join(1000);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
        }
    }

    private final class Loop implements Choreographer.FrameCallback {
        private final SurfaceHolder holder;
        private volatile boolean running = true;
        private Choreographer choreographer;
        private long lastNs;

        Loop(SurfaceHolder holder) {
            this.holder = holder;
        }

        void start() { // runs on the game thread, which owns the Choreographer instance
            choreographer = Choreographer.getInstance();
            choreographer.postFrameCallback(this);
        }

        void stop() {
            running = false;
        }

        @Override
        public void doFrame(long frameTimeNanos) {
            if (!running) return;
            Engine eng = Engine.get();
            float dt = lastNs == 0 ? 0f : (frameTimeNanos - lastNs) / 1e9f;
            lastNs = frameTimeNanos;
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
            try {
                synchronized (eng.lock) {
                    eng.advance(dt);
                    if (c != null) renderer.draw(c, getWidth(), getHeight(), eng, dual);
                }
            } finally {
                if (c != null) holder.unlockCanvasAndPost(c);
            }
            AudioEngine a = audio;
            if (a != null) a.update(); // game thread: drains the sound events
            if (running) choreographer.postFrameCallback(this);
        }
    }
}
