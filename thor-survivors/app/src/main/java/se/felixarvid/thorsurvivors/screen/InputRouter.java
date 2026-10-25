package se.felixarvid.thorsurvivors.screen;

import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;

import se.felixarvid.thorsurvivors.game.Engine;
import se.felixarvid.thorsurvivors.game.Input;

/**
 * Translates framework key/motion events into the shared {@link Input}. Every window that can hold input focus
 * (game activity, Presentation, second activity) forwards its dispatchKeyEvent / dispatchGenericMotionEvent here.
 */
public final class InputRouter {
    private static final float NAV_THRESHOLD = 0.6f;
    private static int stickNavDir = -1;
    private static int hatNavDir = -1;
    private static long lastDpadKeyMs;

    private InputRouter() {
    }

    /** @return true if the event was consumed. */
    public static boolean onKey(KeyEvent e) {
        Engine eng = Engine.get();
        Input in = eng.input;
        boolean down = e.getAction() == KeyEvent.ACTION_DOWN;
        boolean up = e.getAction() == KeyEvent.ACTION_UP;
        if (!down && !up) return false;
        int code = e.getKeyCode();
        if ((e.getSource() & (InputDevice.SOURCE_GAMEPAD | InputDevice.SOURCE_JOYSTICK)) != 0
                && code != KeyEvent.KEYCODE_BACK) {
            in.gamepadSeen = true;
        }
        boolean pad = isPad(e.getSource());
        switch (code) {
            case KeyEvent.KEYCODE_DPAD_LEFT:
            case KeyEvent.KEYCODE_A:
                if (code == KeyEvent.KEYCODE_DPAD_LEFT && !pad) in.aLeft = down; // keyboard arrows aim, WASD moves
                else in.kLeft = down;
                return nav(down, Input.LEFT, code == KeyEvent.KEYCODE_DPAD_LEFT);
            case KeyEvent.KEYCODE_DPAD_RIGHT:
            case KeyEvent.KEYCODE_D:
                if (code == KeyEvent.KEYCODE_DPAD_RIGHT && !pad) in.aRight = down;
                else in.kRight = down;
                return nav(down, Input.RIGHT, code == KeyEvent.KEYCODE_DPAD_RIGHT);
            case KeyEvent.KEYCODE_DPAD_UP:
            case KeyEvent.KEYCODE_W:
                if (code == KeyEvent.KEYCODE_DPAD_UP && !pad) in.aUp = down;
                else in.kUp = down;
                return nav(down, Input.UP, code == KeyEvent.KEYCODE_DPAD_UP);
            case KeyEvent.KEYCODE_DPAD_DOWN:
            case KeyEvent.KEYCODE_S:
                if (code == KeyEvent.KEYCODE_DPAD_DOWN && !pad) in.aDown = down;
                else in.kDown = down;
                return nav(down, Input.DOWN, code == KeyEvent.KEYCODE_DPAD_DOWN);
            case KeyEvent.KEYCODE_BUTTON_A:
            case KeyEvent.KEYCODE_SPACE:
                // while playing, the gamepad A button (and space) dodges; in menus it confirms
                if (eng.phase == Engine.PH_PLAYING) {
                    if (down && e.getRepeatCount() == 0) in.dodgeReq = true;
                    return true;
                }
                if (down && e.getRepeatCount() == 0) in.post(Input.CMD_CONFIRM, 0, 0, 0);
                return true;
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_NUMPAD_ENTER:
                if (down && e.getRepeatCount() == 0) in.post(Input.CMD_CONFIRM, 0, 0, 0);
                return true;
            case KeyEvent.KEYCODE_BUTTON_B:
            case KeyEvent.KEYCODE_ESCAPE:
                if (down && e.getRepeatCount() == 0) in.post(Input.CMD_BACK, 0, 0, 0);
                return true;
            case KeyEvent.KEYCODE_BACK:
                if (eng.phase == Engine.PH_MENU) return false; // let the activity exit from the main menu
                if (down && e.getRepeatCount() == 0) in.post(Input.CMD_BACK, 0, 0, 0);
                return true;
            case KeyEvent.KEYCODE_BUTTON_START:
            case KeyEvent.KEYCODE_P:
                if (down && e.getRepeatCount() == 0) in.post(Input.CMD_START, 0, 0, 0);
                return true;
            case KeyEvent.KEYCODE_BUTTON_SELECT:
            case KeyEvent.KEYCODE_BUTTON_X:
            case KeyEvent.KEYCODE_BUTTON_Y:
            case KeyEvent.KEYCODE_BUTTON_L1:
            case KeyEvent.KEYCODE_BUTTON_R1:
                return true; // swallow so the system does not act on them
            default:
                return false;
        }
    }

    /** True for gamepad and joystick sources, whose d-pad moves; any other source is a keyboard (arrows aim). */
    static boolean isPad(int source) {
        return (source & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD
                || (source & InputDevice.SOURCE_DPAD) == InputDevice.SOURCE_DPAD
                || (source & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK;
    }

    private static boolean nav(boolean down, int dir, boolean dpad) {
        if (dpad) lastDpadKeyMs = System.currentTimeMillis();
        if (down) Engine.get().input.post(Input.CMD_NAV, dir, 0, 0);
        return true;
    }

    /** @return true if the event was consumed. */
    public static boolean onMotion(MotionEvent e) {
        if ((e.getSource() & InputDevice.SOURCE_JOYSTICK) != InputDevice.SOURCE_JOYSTICK
                || e.getAction() != MotionEvent.ACTION_MOVE) {
            return false;
        }
        Input in = Engine.get().input;
        float x = axis(e, MotionEvent.AXIS_X), y = axis(e, MotionEvent.AXIS_Y);
        float hx = axis(e, MotionEvent.AXIS_HAT_X), hy = axis(e, MotionEvent.AXIS_HAT_Y);
        float sx = Input.deadZone(x, y), sy = Input.deadZone(y, x);
        if (sx != 0 || sy != 0) in.gamepadSeen = true;
        in.stickX = sx;
        in.stickY = sy;
        in.hatX = Math.abs(hx) > 0.5f ? Math.signum(hx) : 0f;
        in.hatY = Math.abs(hy) > 0.5f ? Math.signum(hy) : 0f;

        // right stick: aim (Z / RZ on most pads, RX / RY on others)
        float rx = axis(e, MotionEvent.AXIS_Z), ry = axis(e, MotionEvent.AXIS_RZ);
        if (Math.abs(rx) < 0.01f && Math.abs(ry) < 0.01f) {
            rx = axis(e, MotionEvent.AXIS_RX);
            ry = axis(e, MotionEvent.AXIS_RY);
        }
        in.aimStickX = Input.deadZone(rx, ry);
        in.aimStickY = Input.deadZone(ry, rx);
        if (in.aimStickX != 0 || in.aimStickY != 0) in.gamepadSeen = true;

        // stick -> menu navigation on threshold crossings
        int dir = -1;
        if (Math.abs(x) > NAV_THRESHOLD || Math.abs(y) > NAV_THRESHOLD) {
            dir = Math.abs(x) > Math.abs(y) ? (x > 0 ? Input.RIGHT : Input.LEFT) : (y > 0 ? Input.DOWN : Input.UP);
        }
        if (dir != stickNavDir) {
            stickNavDir = dir;
            if (dir >= 0) in.post(Input.CMD_NAV, dir, 0, 0);
        }
        // d-pad reported as a hat axis (skip when the same press also arrived as a key)
        int hdir = -1;
        if (hx < -0.5f) hdir = Input.LEFT;
        else if (hx > 0.5f) hdir = Input.RIGHT;
        else if (hy < -0.5f) hdir = Input.UP;
        else if (hy > 0.5f) hdir = Input.DOWN;
        if (hdir != hatNavDir) {
            hatNavDir = hdir;
            if (hdir >= 0 && System.currentTimeMillis() - lastDpadKeyMs > 150) in.post(Input.CMD_NAV, hdir, 0, 0);
        }
        return true;
    }

    private static float axis(MotionEvent e, int axis) {
        return e.getAxisValue(axis);
    }
}
