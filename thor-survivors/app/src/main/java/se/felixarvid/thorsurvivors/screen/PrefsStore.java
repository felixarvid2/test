package se.felixarvid.thorsurvivors.screen;

import android.content.Context;
import android.content.SharedPreferences;

import se.felixarvid.thorsurvivors.game.MetaProgress;

/** SharedPreferences-backed persistence for gold, shop ranks and records. */
public final class PrefsStore implements MetaProgress.Store {
    private final SharedPreferences prefs;

    public PrefsStore(Context ctx) {
        prefs = ctx.getApplicationContext().getSharedPreferences("thor_survivors", Context.MODE_PRIVATE);
    }

    @Override
    public int getInt(String key, int def) {
        return prefs.getInt(key, def);
    }

    @Override
    public void putInt(String key, int value) {
        prefs.edit().putInt(key, value).apply();
    }
}
