package se.felixarvid.thorsurvivors.game;

import java.util.concurrent.ConcurrentLinkedQueue;

/**
 * Shared input state. UI threads (any window) write; the game thread reads and drains the command queue.
 * Android-free: {@code screen.InputRouter} translates framework events into these calls.
 */
public final class Input {
    public static final int UP = 0, DOWN = 1, LEFT = 2, RIGHT = 3;
    public static final int CMD_NAV = 1, CMD_CONFIRM = 2, CMD_BACK = 3, CMD_START = 4, CMD_TAP = 5, CMD_AUTOPAUSE = 6;
    public static final float DEAD_ZONE = 0.15f;

    public volatile float stickX, stickY, hatX, hatY, touchX, touchY;
    public volatile boolean kLeft, kRight, kUp, kDown;
    /**
     * Aim input of the main weapon: right stick, the bottom-screen touch aim area, and the arrow keys on a keyboard
     * (where WASD moves). No input at all means "aim where you face" (see {@link #aim}).
     */
    public volatile float aimStickX, aimStickY, aimTouchX, aimTouchY;
    public volatile boolean aLeft, aRight, aUp, aDown;
    /** Set by the A button / DODGE button / space; consumed by {@link Sim#update} through {@link #takeDodge}. */
    public volatile boolean dodgeReq;
    /** True once a physical gamepad stick has been used (hides the touch joystick hint). */
    public volatile boolean gamepadSeen;

    private final ConcurrentLinkedQueue<int[]> commands = new ConcurrentLinkedQueue<>();

    public void post(int type, int a, int b, int c) {
        commands.add(new int[]{type, a, b, c});
    }

    public int[] poll() {
        return commands.poll();
    }

    public void clearMovement() {
        stickX = stickY = hatX = hatY = touchX = touchY = 0;
        kLeft = kRight = kUp = kDown = false;
        aimStickX = aimStickY = aimTouchX = aimTouchY = 0;
        aLeft = aRight = aUp = aDown = false;
        dodgeReq = false;
    }

    /** Aim input below this length counts as none (the facing direction is used instead). */
    public static final float AIM_MIN = 0.2f;

    /**
     * Combined aim direction as a unit vector in out[0..1]. Returns false (and leaves out untouched) when there is no
     * aim input, so the caller falls back to the facing direction.
     */
    public boolean aim(float[] out) {
        float x = aimStickX + aimTouchX + (aRight ? 1 : 0) - (aLeft ? 1 : 0);
        float y = aimStickY + aimTouchY + (aDown ? 1 : 0) - (aUp ? 1 : 0);
        float m = (float) Math.sqrt(x * x + y * y);
        if (m < AIM_MIN) return false;
        out[0] = x / m;
        out[1] = y / m;
        return true;
    }

    /** True once per dodge request. */
    public boolean takeDodge() {
        if (!dodgeReq) return false;
        dodgeReq = false;
        return true;
    }

    /** Applies a radial dead zone and rescales so the usable range still reaches 1. */
    public static float deadZone(float v, float other) {
        float m = (float) Math.sqrt(v * v + other * other);
        if (m < DEAD_ZONE) return 0;
        float scale = Math.min(1f, (m - DEAD_ZONE) / (1f - DEAD_ZONE)) / m;
        return v * scale;
    }

    /** Combined movement vector (length <= 1) written into out[0..1]. */
    public void move(float[] out) {
        float x = stickX + hatX + touchX + (kRight ? 1 : 0) - (kLeft ? 1 : 0);
        float y = stickY + hatY + touchY + (kDown ? 1 : 0) - (kUp ? 1 : 0);
        float m = (float) Math.sqrt(x * x + y * y);
        if (m > 1f) {
            x /= m;
            y /= m;
        }
        out[0] = x;
        out[1] = y;
    }
}
