"""Sparar mätningar och avvikelser i en SQLite-databas."""

import csv
import fcntl
import os
import sqlite3
import time
from datetime import datetime
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS measurements (
    id INTEGER PRIMARY KEY,
    ts TEXT NOT NULL,
    epoch REAL,
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

MEASUREMENT_FIELDS = ("ts", "epoch", "ssid", "source", "ping_ms", "jitter_ms", "download_mbps", "upload_mbps", "error")


def epoch_of(ts: str) -> float:
    return datetime.fromisoformat(ts).timestamp()


def open_storage(path=None):
    """Öppnar databasen. Är den skadad flyttas den undan (den raderas aldrig) och en ny
    skapas. Returnerar (Storage, sökväg dit den skadade filen flyttades eller None)."""
    from . import config

    path = Path(path or config.db_path())
    path.parent.mkdir(parents=True, exist_ok=True)
    # Låset ser till att tjänsten och appen inte båda flyttar undan filen samtidigt.
    with open(path.with_name(".oppna.lock"), "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            return Storage(path), None
        except sqlite3.OperationalError:
            raise  # t.ex. låst eller full disk: inte skadad
        except sqlite3.DatabaseError:
            stamp = f"{datetime.now():%Y%m%d-%H%M%S}"
            moved = path.with_name(f"{path.stem}.skadad-{stamp}{path.suffix}")
            n = 1
            while moved.exists():
                n += 1
                moved = path.with_name(f"{path.stem}.skadad-{stamp}-{n}{path.suffix}")
            os.replace(path, moved)
            for extra in ("-wal", "-shm"):
                side = Path(str(path) + extra)
                if side.exists():
                    os.replace(side, Path(str(moved) + extra))
            return Storage(path), moved


def _cell(value):
    """Text som börjar med =, +, - eller @ tolkas som formel av kalkylprogram – gör den till text."""
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


class Storage:
    def __init__(self, path):
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(path), timeout=30, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys=ON")
        # Bytet till WAL och skapandet av tabellerna väntar inte alltid på låset när flera
        # processer (tjänsten och appen) öppnar databasen samtidigt – försök då igen.
        for attempt in range(50):
            try:
                self.conn.execute("PRAGMA journal_mode=WAL")
                self.conn.executescript(SCHEMA)
                self._migrate()
                break
            except sqlite3.OperationalError as e:
                if "locked" not in str(e) or attempt == 49:
                    raise
                time.sleep(0.1)

    def _migrate(self):
        # BEGIN IMMEDIATE låser databasen, så att tjänsten och appen inte migrerar samtidigt.
        self.conn.execute("BEGIN IMMEDIATE")
        try:
            columns = {r[1] for r in self.conn.execute("PRAGMA table_info(measurements)")}
            if "epoch" not in columns:  # databaser från version 1.0
                self.conn.execute("ALTER TABLE measurements ADD COLUMN epoch REAL")
            for row_id, ts in self.conn.execute("SELECT id, ts FROM measurements WHERE epoch IS NULL").fetchall():
                self.conn.execute("UPDATE measurements SET epoch = ? WHERE id = ?", (epoch_of(ts), row_id))
            self.conn.execute("CREATE INDEX IF NOT EXISTS measurements_epoch ON measurements(epoch)")
            self.conn.commit()
        except BaseException:
            self.conn.rollback()
            raise

    def close(self):
        self.conn.close()

    def add_measurement(self, m: dict, deviations=()) -> int:
        """Sparar mätningen och dess avvikelser i en och samma transaktion."""
        values = dict(m, epoch=m.get("epoch") or epoch_of(m["ts"]))
        with self.conn:
            cur = self.conn.execute(
                f"INSERT INTO measurements ({', '.join(MEASUREMENT_FIELDS)}) "
                f"VALUES ({', '.join('?' * len(MEASUREMENT_FIELDS))})",
                [values.get(f) for f in MEASUREMENT_FIELDS],
            )
            self._insert_deviations(cur.lastrowid, m, deviations)
        return cur.lastrowid

    def add_deviations(self, measurement_id: int, m: dict, deviations) -> None:
        with self.conn:
            self._insert_deviations(measurement_id, m, deviations)

    def _insert_deviations(self, measurement_id, m, deviations):
        if deviations:
            self.conn.executemany(
                "INSERT INTO deviations (measurement_id, ts, ssid, metric, value, baseline, change_percent, direction) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    (measurement_id, m["ts"], m.get("ssid"), d["metric"], d.get("value"),
                     d.get("baseline"), d.get("change_percent"), d["direction"])
                    for d in deviations
                ],
            )

    @staticmethod
    def _filter(ssid, since, prefix):
        where, args = [], []
        if ssid is not None:
            where.append(f"{prefix}ssid = ?")
            args.append(ssid)
        if since is not None:
            where.append("m.epoch >= ?")
            args.append(since)
        return (" WHERE " + " AND ".join(where)) if where else "", args

    def measurements(self, ssid=None, since=None, limit=None):
        """Nyaste först. `since` är en Unix-tid."""
        where, args = self._filter(ssid, since, "m.")
        sql = f"SELECT m.* FROM measurements m{where} ORDER BY m.id DESC"
        if limit is not None:
            sql += " LIMIT ?"
            args.append(limit)
        return [dict(r) for r in self.conn.execute(sql, args)]

    def deviations(self, ssid=None, since=None, limit=None):
        """Nyaste först, med mätningens Unix-tid som `epoch`."""
        where, args = self._filter(ssid, since, "d.")
        sql = (f"SELECT d.*, m.epoch AS epoch FROM deviations d "
               f"JOIN measurements m ON m.id = d.measurement_id{where} ORDER BY d.id DESC")
        if limit is not None:
            sql += " LIMIT ?"
            args.append(limit)
        return [dict(r) for r in self.conn.execute(sql, args)]

    def history(self, ssid, count):
        """De senaste lyckade mätningarna på ett nätverk – underlaget för vad som är normalt."""
        return [
            dict(r)
            for r in self.conn.execute(
                "SELECT * FROM measurements WHERE ssid IS ? COLLATE NOCASE AND error IS NULL "
                "ORDER BY id DESC LIMIT ?",
                (ssid, count),
            )
        ]

    def last(self, ssid=None):
        rows = self.measurements(ssid=ssid, limit=1)
        return rows[0] if rows else None

    def networks(self):
        return [r[0] for r in self.conn.execute(
            "SELECT ssid FROM measurements WHERE ssid IS NOT NULL GROUP BY ssid ORDER BY MAX(epoch) DESC")]

    def signature(self):
        """Ändras när något har lagts till eller tagits bort – för att veta när vyn ska ritas om."""
        m = self.conn.execute("SELECT COUNT(*), MAX(id) FROM measurements").fetchone()
        d = self.conn.execute("SELECT COUNT(*), MAX(id) FROM deviations").fetchone()
        return tuple(m) + tuple(d)

    def delete_measurement(self, measurement_id):
        with self.conn:
            self.conn.execute("DELETE FROM measurements WHERE id = ?", (measurement_id,))

    def clear(self):
        with self.conn:
            self.conn.execute("DELETE FROM deviations")
            self.conn.execute("DELETE FROM measurements")
        self.conn.execute("VACUUM")

    def export_csv(self, path) -> int:
        """Sparar alla mätningar som CSV för svenska Excel/LibreOffice (semikolon, decimalkomma)."""
        deviating = {}
        for d in self.conn.execute("SELECT measurement_id, metric, direction FROM deviations ORDER BY id"):
            deviating.setdefault(d[0], []).append(f"{d[1]} {d[2]}")

        def num(v):
            return "" if v is None else f"{v}".replace(".", ",")

        count = 0
        with open(path, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f, delimiter=";")
            w.writerow(["Tid", "Nätverk", "Källa", "Ping (ms)", "Jitter (ms)", "Nedladdning (Mbit/s)",
                        "Uppladdning (Mbit/s)", "Fel", "Avvikelser"])
            for r in self.conn.execute("SELECT * FROM measurements ORDER BY id"):
                w.writerow([r["ts"][:19].replace("T", " "), _cell(r["ssid"]), r["source"], num(r["ping_ms"]),
                            num(r["jitter_ms"]), num(r["download_mbps"]), num(r["upload_mbps"]), _cell(r["error"]),
                            ", ".join(deviating.get(r["id"], []))])
                count += 1
        return count
