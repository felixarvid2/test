"""Sparar mätningar och avvikelser i en SQLite-databas."""

import csv
import sqlite3
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS measurements (
    id INTEGER PRIMARY KEY,
    ts TEXT NOT NULL,
    ssid TEXT,
    source TEXT NOT NULL DEFAULT 'auto',
    ping_ms REAL,
    jitter_ms REAL,
    download_mbps REAL,
    upload_mbps REAL,
    error TEXT
);
CREATE TABLE IF NOT EXISTS deviations (
    id INTEGER PRIMARY KEY,
    measurement_id INTEGER NOT NULL REFERENCES measurements(id) ON DELETE CASCADE,
    ts TEXT NOT NULL,
    ssid TEXT,
    metric TEXT NOT NULL,
    value REAL,
    baseline REAL,
    change_percent REAL,
    direction TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS measurements_ssid ON measurements(ssid, id);
CREATE INDEX IF NOT EXISTS deviations_measurement ON deviations(measurement_id);
"""

MEASUREMENT_FIELDS = ("ts", "ssid", "source", "ping_ms", "jitter_ms", "download_mbps", "upload_mbps", "error")


class Storage:
    def __init__(self, path):
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(path), timeout=30, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA foreign_keys=ON")
        self.conn.executescript(SCHEMA)

    def close(self):
        self.conn.close()

    def add_measurement(self, m: dict) -> int:
        with self.conn:
            cur = self.conn.execute(
                f"INSERT INTO measurements ({', '.join(MEASUREMENT_FIELDS)}) "
                f"VALUES ({', '.join('?' * len(MEASUREMENT_FIELDS))})",
                [m.get(f) for f in MEASUREMENT_FIELDS],
            )
        return cur.lastrowid

    def add_deviations(self, measurement_id: int, m: dict, deviations) -> None:
        with self.conn:
            self.conn.executemany(
                "INSERT INTO deviations (measurement_id, ts, ssid, metric, value, baseline, change_percent, direction) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    (measurement_id, m["ts"], m.get("ssid"), d["metric"], d.get("value"),
                     d.get("baseline"), d.get("change_percent"), d["direction"])
                    for d in deviations
                ],
            )

    def measurements(self, limit=1000, ssid=None):
        """Nyaste först."""
        sql = "SELECT * FROM measurements"
        args = []
        if ssid is not None:
            sql += " WHERE ssid = ?"
            args.append(ssid)
        sql += " ORDER BY id DESC LIMIT ?"
        args.append(limit)
        return [dict(r) for r in self.conn.execute(sql, args)]

    def deviations(self, limit=1000):
        """Nyaste först."""
        return [dict(r) for r in self.conn.execute("SELECT * FROM deviations ORDER BY id DESC LIMIT ?", (limit,))]

    def deviating_ids(self):
        return {r[0] for r in self.conn.execute("SELECT DISTINCT measurement_id FROM deviations")}

    def history(self, ssid, count):
        """De senaste lyckade mätningarna på ett nätverk – underlaget för vad som är normalt."""
        return [
            dict(r)
            for r in self.conn.execute(
                "SELECT * FROM measurements WHERE ssid IS ? AND error IS NULL ORDER BY id DESC LIMIT ?",
                (ssid, count),
            )
        ]

    def last(self, ssid=None):
        rows = self.measurements(limit=1, ssid=ssid)
        return rows[0] if rows else None

    def networks(self):
        return [r[0] for r in self.conn.execute(
            "SELECT ssid FROM measurements WHERE ssid IS NOT NULL GROUP BY ssid ORDER BY MAX(id) DESC")]

    def clear(self):
        with self.conn:
            self.conn.execute("DELETE FROM deviations")
            self.conn.execute("DELETE FROM measurements")

    def export_csv(self, path) -> int:
        deviating = {}
        for d in self.conn.execute("SELECT measurement_id, metric, direction FROM deviations"):
            deviating.setdefault(d[0], []).append(f"{d[1]} {d[2]}")
        rows = self.conn.execute("SELECT * FROM measurements ORDER BY id")
        count = 0
        with open(path, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["tid", "natverk", "kalla", "ping_ms", "jitter_ms", "ned_mbps", "upp_mbps", "fel", "avvikelser"])
            for r in rows:
                w.writerow([r["ts"], r["ssid"] or "", r["source"], r["ping_ms"], r["jitter_ms"],
                            r["download_mbps"], r["upload_mbps"], r["error"] or "",
                            "; ".join(deviating.get(r["id"], []))])
                count += 1
        return count
