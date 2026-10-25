package se.felixarvid.thorsurvivors;

import se.felixarvid.thorsurvivors.data.GameData;

import java.io.FileInputStream;
import java.io.InputStream;

public final class TestData {
    private static GameData cached;

    private TestData() {
    }

    public static synchronized GameData load() throws Exception {
        if (cached == null) {
            try (InputStream in = new FileInputStream("src/main/assets/game_data.json");
                 InputStream over = new FileInputStream("src/main/assets/ashfall_data.json")) {
                cached = GameData.load(in, over);
            }
        }
        return cached;
    }
}
