package se.felixarvid.thorsurvivors.util;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;

/** Stream helpers shared by the asset loaders (plain Java, no android.*). */
public final class IO {
    private IO() {
    }

    /** All remaining bytes of {@code in}. Does not close the stream. */
    public static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream(8192);
        byte[] b = new byte[8192];
        for (int n; (n = in.read(b)) != -1; ) out.write(b, 0, n);
        return out.toByteArray();
    }

    /** All remaining bytes of {@code in} decoded as UTF-8. Does not close the stream. */
    public static String readUtf8(InputStream in) throws IOException {
        return new String(readAll(in), "UTF-8");
    }
}
