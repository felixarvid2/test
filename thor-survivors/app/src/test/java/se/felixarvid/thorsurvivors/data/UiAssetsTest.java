package se.felixarvid.thorsurvivors.data;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import se.felixarvid.thorsurvivors.ui.UiArt;

import java.io.File;
import java.nio.file.Files;

/** The ASHFALL UI art (design phase 11): files present, licence shipped with the font, and the whole set small. */
public class UiAssetsTest {
    private static final File ASSETS = new File("src/main/assets");

    @Test
    public void everyUiPictureAndTheFontsAreShipped() {
        String[] ui = {"region_flats", "region_mines", "title", "hero_bastion", "hero_spectre", "hero_xenomant", "portrait_bastion",
                "portrait_spectre", "portrait_xenomant", "stats"};
        for (String n : ui) assertTrue(n, new File(ASSETS, "ui/" + n + ".webp").length() > 1000);
        assertTrue(new File(ASSETS, "fonts/BarlowCondensed-Bold.ttf").length() > 50_000);
        assertTrue(new File(ASSETS, "fonts/BarlowCondensed-SemiBold.ttf").length() > 50_000);
    }

    @Test
    public void fontLicenceIsShippedWithTheFont() throws Exception {
        String lic = new String(Files.readAllBytes(new File(ASSETS, "fonts/OFL-BarlowCondensed.txt").toPath()), "UTF-8");
        assertTrue(lic.contains("SIL OPEN FONT LICENSE Version 1.1"));
        assertTrue(lic.contains("Barlow Project Authors"));
    }

    @Test
    public void uiArtStaysSmall() {
        long total = 0;
        for (File d : new File[]{new File(ASSETS, "ui"), new File(ASSETS, "fonts")}) for (File f : d.listFiles()) total += f.length();
        System.out.println("UIART shipped ui + fonts: " + total / 1024 + " KB");
        assertTrue("ui + fonts under 1 MB: " + total, total < 1_000_000);
    }

    @Test
    public void statIconOrderMatchesTheBuildScript() throws Exception {
        String py = new String(Files.readAllBytes(new File("../tools/build_ui_assets.py").toPath()), "UTF-8");
        int a = py.indexOf("STAT_KEYS = [") + "STAT_KEYS = [".length(), b = py.indexOf("]", a);
        String[] keys = py.substring(a, b).replaceAll("[\"\\s]", "").split(",");
        assertEquals(UiArt.STAT_KEYS.length, keys.length);
        for (int i = 0; i < keys.length; i++) assertEquals(UiArt.STAT_KEYS[i], keys[i]);
    }
}
