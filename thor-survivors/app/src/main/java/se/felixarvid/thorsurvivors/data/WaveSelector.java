package se.felixarvid.thorsurvivors.data;

import java.util.List;

public final class WaveSelector {
    private WaveSelector() {
    }

    /** Index of the row for the given elapsed seconds (rows are sorted by minute). */
    public static int indexAt(List<WaveRow> rows, double seconds) {
        int minute = (int) Math.floor(Math.max(0, seconds) / 60.0);
        int best = 0;
        for (int i = 0; i < rows.size(); i++) {
            if (rows.get(i).minute <= minute) best = i;
            else break;
        }
        return best;
    }

    public static WaveRow rowAt(List<WaveRow> rows, double seconds) {
        return rows.get(indexAt(rows, seconds));
    }
}
