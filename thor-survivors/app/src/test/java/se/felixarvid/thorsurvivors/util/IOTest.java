package se.felixarvid.thorsurvivors.util;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;

import org.junit.Test;

import java.io.ByteArrayInputStream;

public class IOTest {
    @Test
    public void readsEverythingAcrossBufferBoundaries() throws Exception {
        byte[] data = new byte[20000];
        for (int i = 0; i < data.length; i++) data[i] = (byte) (i * 31);
        assertArrayEquals(data, IO.readAll(new ByteArrayInputStream(data)));
        assertEquals(0, IO.readAll(new ByteArrayInputStream(new byte[0])).length);
    }

    @Test
    public void decodesUtf8() throws Exception {
        String s = "åäö {\"k\": 1}";
        assertEquals(s, IO.readUtf8(new ByteArrayInputStream(s.getBytes("UTF-8"))));
    }
}
