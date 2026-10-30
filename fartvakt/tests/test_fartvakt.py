import csv
import os
import sqlite3
import sys
import tempfile
import threading
import time
import unittest
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from fartvakt import analysis, config, daemon, formatting, monitor, network, plotting, speedtest, status  # noqa: E402
from fartvakt.storage import Storage  # noqa: E402


class TempHome(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        patcher = mock.patch.dict(os.environ, {"XDG_CONFIG_HOME": self.tmp.name + "/conf",
                                               "XDG_DATA_HOME": self.tmp.name + "/data"})
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self.tmp.cleanup)


def m(down, up=10.0, ping=20.0):
    return {"download_mbps": down, "upload_mbps": up, "ping_ms": ping}


def ok(result):
    return lambda _cfg, _progress: result


def fail(_cfg, _progress):
    raise speedtest.SpeedTestError("nere")


class NetworkTest(unittest.TestCase):
    def test_parse_active_ssid(self):
        self.assertEqual(network.parse_nmcli_wifi("no:Grannen\nyes:JENSEN-Guest\nno:Annat\n"), "JENSEN-Guest")

    def test_parse_escaped_colon(self):
        self.assertEqual(network.parse_nmcli_wifi("yes:Kafé\\:5G\n"), "Kafé:5G")

    def test_no_active(self):
        self.assertIsNone(network.parse_nmcli_wifi("no:A\nno:B\n"))
        self.assertIsNone(network.parse_nmcli_wifi(""))

    def test_connectivity(self):
        with mock.patch.object(network, "_run", return_value="portal\n") as run:
            self.assertEqual(network.connectivity(check=True), "portal")
            self.assertEqual(run.call_args[0][0], ["nmcli", "-t", "networking", "connectivity", "check"])
        with mock.patch.object(network, "_run", return_value=""):
            self.assertIsNone(network.connectivity())
        with mock.patch.object(network, "_run", side_effect=FileNotFoundError):
            self.assertIsNone(network.connectivity())

    def test_traffic_device(self):
        with tempfile.TemporaryDirectory() as sys_net:
            os.makedirs(os.path.join(sys_net, "wlp2s0", "wireless"))
            os.makedirs(os.path.join(sys_net, "enp3s0"))
            self.assertTrue(network.is_wireless("wlp2s0", sys_net))
            self.assertFalse(network.is_wireless("enp3s0", sys_net))
            self.assertIsNone(network.is_wireless("saknas0", sys_net))
        out = "1.1.1.1 via 10.0.0.1 dev wlp2s0 src 10.0.0.5 uid 1000 \\    cache "
        with mock.patch.object(network, "_run", return_value=out):
            self.assertEqual(network.default_route_device(), "wlp2s0")
        with mock.patch.object(network, "_run", return_value=""):
            self.assertEqual(network.traffic_device(), (None, None))

    def test_matches_ignores_case_and_spaces(self):
        self.assertTrue(network.matches("jensen-guest", [" JENSEN-Guest "]))
        self.assertFalse(network.matches("JENSEN-Staff", ["JENSEN-Guest"]))
        self.assertFalse(network.matches(None, ["JENSEN-Guest"]))

    def test_current_ssid_falls_back_to_iwgetid(self):
        def fake_run(cmd):
            if cmd[0] == "nmcli":
                raise FileNotFoundError
            return "JENSEN-Guest\n"

        with mock.patch.object(network, "_run", fake_run):
            self.assertEqual(network.current_ssid(), "JENSEN-Guest")
        with mock.patch.object(network, "_run", side_effect=FileNotFoundError):
            self.assertIsNone(network.current_ssid())


class AnalysisTest(unittest.TestCase):
    history = [m(v) for v in (50, 52, 48, 51, 49, 50)]

    def test_normal_measurement_has_no_deviation(self):
        self.assertEqual(analysis.find_deviations(m(45), self.history, 30, 5), [])

    def test_slow_download_is_noted_with_speed(self):
        [d] = analysis.find_deviations(m(20), self.history, 30, 5)
        self.assertEqual((d["metric"], d["value"], d["baseline"], d["direction"]), ("download_mbps", 20, 50, "sämre"))
        self.assertEqual(d["change_percent"], -60.0)
        self.assertEqual(analysis.describe(d), "Nedladdning 20,0 Mbit/s – 60 % lägre än normalt (50,0 Mbit/s)")

    def test_fast_download_is_better(self):
        [d] = analysis.find_deviations(m(90), self.history, 30, 5)
        self.assertEqual(d["direction"], "bättre")

    def test_high_ping_is_worse(self):
        [d] = analysis.find_deviations(m(50, ping=80), self.history, 30, 5)
        self.assertEqual((d["metric"], d["direction"]), ("ping_ms", "sämre"))
        self.assertIn("högre än normalt", analysis.describe(d))

    def test_small_absolute_change_ignored(self):
        # 20 -> 28 ms är +40 % men under 10 ms, så det räknas inte
        self.assertEqual(analysis.find_deviations(m(50, ping=28), self.history, 30, 5), [])

    def test_needs_baseline(self):
        self.assertEqual(analysis.find_deviations(m(5), self.history[:3], 30, 5), [])

    def test_failure_is_deviation(self):
        [d] = analysis.find_deviations({"error": "nere"}, [], 30, 5)
        self.assertEqual(d["direction"], "avbrott")
        self.assertIn("misslyckades", analysis.describe(d))


class StorageTest(TempHome):
    def add(self, db, ts, ssid="JENSEN-Guest", **values):
        return db.add_measurement({"ts": ts, "ssid": ssid, "source": "auto", **m(40), **values})

    def test_filters_by_network_and_time(self):
        db = Storage(config.db_path())
        old = self.add(db, "2026-10-01T10:00:00+02:00")
        new = self.add(db, "2026-10-30T10:00:00+01:00")
        self.add(db, "2026-10-30T11:00:00+01:00", ssid="Hemma")
        db.add_deviations(new, db.last("JENSEN-Guest"), [{"metric": "download_mbps", "value": 1, "direction": "sämre"}])
        since = datetime.fromisoformat("2026-10-29T00:00:00+01:00").timestamp()
        self.assertEqual([r["id"] for r in db.measurements(ssid="JENSEN-Guest")], [new, old])
        self.assertEqual([r["id"] for r in db.measurements(since=since)], [3, new])
        self.assertEqual(len(db.deviations(ssid="Hemma")), 0)
        self.assertEqual(db.deviations(ssid="JENSEN-Guest", since=since)[0]["measurement_id"], new)
        self.assertEqual(db.networks(), ["Hemma", "JENSEN-Guest"])

    def test_history_ignores_case_and_deviations_are_atomic(self):
        db = Storage(config.db_path())
        mid = db.add_measurement({"ts": "2026-10-30T10:00:00+01:00", "ssid": "JENSEN-Guest", "source": "auto",
                                  **m(40)}, [{"metric": "download_mbps", "value": 40, "direction": "sämre"}])
        self.assertEqual(len(db.history("jensen-guest", 5)), 1)
        self.assertEqual(db.deviations()[0]["measurement_id"], mid)
        with self.assertRaises(KeyError):           # trasig avvikelse: varken mätning eller avvikelse sparas
            db.add_measurement({"ts": "2026-10-30T10:05:00+01:00", "ssid": "X", "source": "auto"}, [{}])
        self.assertEqual(db.signature()[0], 1)

    def test_parallel_migration(self):
        path = config.db_path()
        path.parent.mkdir(parents=True)
        conn = sqlite3.connect(path)
        conn.executescript("""CREATE TABLE measurements (id INTEGER PRIMARY KEY, ts TEXT NOT NULL, ssid TEXT,
            source TEXT NOT NULL DEFAULT 'auto', ping_ms REAL, jitter_ms REAL, download_mbps REAL,
            upload_mbps REAL, error TEXT);
            INSERT INTO measurements (ts, ssid) VALUES ('2026-10-30T10:00:00+01:00', 'X');""")
        conn.commit()
        conn.close()
        errors = []

        def open_db():
            try:
                Storage(path).close()
            except Exception as e:  # noqa: BLE001
                errors.append(e)

        threads = [threading.Thread(target=open_db) for _ in range(6)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(errors, [])
        self.assertIsNotNone(Storage(path).last()["epoch"])

    def test_signature_changes_on_insert_and_clear(self):
        db = Storage(config.db_path())
        empty = db.signature()
        self.add(db, "2026-10-30T10:00:00+01:00")
        self.assertNotEqual(db.signature(), empty)
        db.clear()
        self.assertEqual(db.signature()[0], 0)

    def test_migrates_database_from_1_0(self):
        path = config.db_path()
        path.parent.mkdir(parents=True)
        conn = sqlite3.connect(path)
        conn.executescript("""
            CREATE TABLE measurements (id INTEGER PRIMARY KEY, ts TEXT NOT NULL, ssid TEXT,
                source TEXT NOT NULL DEFAULT 'auto', ping_ms REAL, jitter_ms REAL, download_mbps REAL,
                upload_mbps REAL, error TEXT);
            INSERT INTO measurements (ts, ssid, download_mbps) VALUES ('2026-10-30T10:00:00+01:00', 'X', 12.5);
        """)
        conn.commit()
        conn.close()
        db = Storage(path)
        row = db.last()
        self.assertEqual(row["epoch"], datetime.fromisoformat("2026-10-30T10:00:00+01:00").timestamp())
        self.assertEqual(row["download_mbps"], 12.5)

    def test_export_csv_for_swedish_spreadsheets(self):
        db = Storage(config.db_path())
        mid = self.add(db, "2026-10-30T10:00:00+01:00", download_mbps=40.5)
        db.add_deviations(mid, db.last(), [{"metric": "download_mbps", "value": 40.5, "direction": "sämre"}])
        self.add(db, "2026-10-30T10:05:00+01:00", error="nere", download_mbps=None)
        out = Path(self.tmp.name) / "ut.csv"
        self.assertEqual(db.export_csv(out), 2)
        raw = out.read_bytes()
        self.assertTrue(raw.startswith(b"\xef\xbb\xbf"))
        rows = list(csv.reader(raw.decode("utf-8-sig").splitlines(), delimiter=";"))
        self.assertEqual(rows[1][:2], ["2026-10-30 10:00:00", "JENSEN-Guest"])
        self.assertEqual(rows[1][5], "40,5")
        self.assertEqual(rows[1][8], "download_mbps sämre")
        self.assertEqual((rows[2][5], rows[2][7]), ("", "nere"))


class MonitorTest(TempHome):
    def test_measure_and_store_flags_slow_measurement(self):
        db = Storage(config.db_path())
        cfg = config.load()
        notes = []
        for v in (50, 51, 49, 50, 52):
            monitor.measure_and_store(cfg, "JENSEN-Guest", db, run_test=ok(m(v)),
                                      send_notification=lambda *a: notes.append(a))
        self.assertEqual(notes, [])
        meas, devs = monitor.measure_and_store(cfg, "JENSEN-Guest", db, run_test=ok(m(12)),
                                               send_notification=lambda *a: notes.append(a))
        self.assertEqual([d["metric"] for d in devs], ["download_mbps"])
        self.assertEqual(len(notes), 1)
        self.assertEqual(notes[0][0], "Avvikande hastighet på JENSEN-Guest")
        self.assertIn("12,0 Mbit/s", notes[0][1])
        stored = db.deviations()
        self.assertEqual((stored[0]["measurement_id"], stored[0]["value"]), (meas["id"], 12))
        # normalvärdet räknas per nätverk
        _, devs = monitor.measure_and_store(cfg, "Hemma", db, run_test=ok(m(5)), send_notification=lambda *a: None)
        self.assertEqual(devs, [])

    def test_repeated_failure_notifies_once(self):
        db = Storage(config.db_path())
        notes = []
        for _ in range(3):
            meas, devs = monitor.measure_and_store(config.load(), "JENSEN-Guest", db, run_test=fail,
                                                   send_notification=lambda *a: notes.append(a))
        self.assertEqual(meas["error"], "nere")
        self.assertEqual(len(devs), 1)
        self.assertEqual(notes, [("Ingen internetanslutning på JENSEN-Guest", "Mätningen misslyckades: nere")])
        self.assertEqual(len(db.deviations()), 3)

    def test_network_change_during_measurement_saves_nothing(self):
        db = Storage(config.db_path())
        with self.assertRaises(monitor.NetworkChanged):
            monitor.measure_and_store(config.load(), "JENSEN-Guest", db, run_test=ok(m(1)),
                                      send_notification=lambda *a: self.fail("ingen notis"),
                                      current_ssid=lambda: "Hemma")
        self.assertEqual(db.signature()[0], 0)
        monitor.measure_and_store(config.load(), "JENSEN-Guest", db, run_test=ok(m(1)),
                                  current_ssid=lambda: "jensen-guest", send_notification=lambda *a: None)
        self.assertEqual(db.signature()[0], 1)

    def test_progress_is_passed_on(self):
        phases = []

        def run(cfg, progress):
            progress("ping")
            progress("ned")
            return m(10)

        monitor.measure_and_store(config.load(), "X", Storage(config.db_path()), run_test=run,
                                  send_notification=lambda *a: None, progress=phases.append)
        self.assertEqual(phases, ["ping", "ned"])

    def test_lock_prevents_parallel_measurements(self):
        self.assertFalse(monitor.is_busy())
        with monitor.measurement_lock():
            self.assertTrue(monitor.is_busy())
            with self.assertRaises(monitor.Busy):
                with monitor.measurement_lock():
                    pass
        self.assertFalse(monitor.is_busy())


class ConfigAndStatusTest(TempHome):
    def test_config_roundtrip_and_validation(self):
        cfg = config.load()
        self.assertEqual(cfg["networks"], ["JENSEN-Guest"])
        cfg.update(networks=["A", " B "], interval_minutes=2)
        config.save(cfg)
        self.assertEqual(config.load()["networks"], ["A", "B"])
        config.config_path().write_text('{"interval_minutes": -3, "threshold_percent": "x", "networks": "fel"}')
        cfg = config.load()
        self.assertEqual((cfg["interval_minutes"], cfg["threshold_percent"], cfg["networks"]), (1, 30, ["JENSEN-Guest"]))
        config.config_path().write_text(
            '{"interval_minutes": 0.5, "check_network_seconds": 0.5, "threshold_percent": Infinity, '
            '"download_bytes": NaN, "monitoring_enabled": "false", "notifications": false, "streams": 1e9, '
            '"baseline_count": 3, "min_baseline": 50, "networks": ["A", 5, " "]}')
        cfg = config.load()
        self.assertEqual((cfg["interval_minutes"], cfg["check_network_seconds"], cfg["threshold_percent"]), (1, 5, 30))
        self.assertEqual((cfg["download_bytes"], cfg["streams"]), (config.DEFAULTS["download_bytes"], 16))
        self.assertEqual((cfg["monitoring_enabled"], cfg["notifications"]), (True, False))
        self.assertEqual((cfg["min_baseline"], cfg["networks"]), (3, ["A"]))
        formatting.data_usage(cfg)  # får inte dela med noll
        config.config_path().write_text("inte json")
        self.assertEqual(config.load(), config.DEFAULTS)

    def test_status_roundtrip_and_liveness(self):
        cfg = config.load()
        self.assertEqual(status.read(), {})
        self.assertFalse(status.is_alive({}, cfg))
        status.write({"ssid": "JENSEN-Guest", "measuring": "ned"})
        state = status.read()
        self.assertEqual(state["measuring"], "ned")
        self.assertTrue(status.is_alive(state, cfg))
        self.assertFalse(status.is_alive(dict(state, updated=time.time() - 600), cfg))
        # en långsam mätningsfas: tjänsten lever fast den inte hört av sig på ett par minuter
        self.assertTrue(status.is_alive(dict(state, updated=time.time() - 200), cfg))
        self.assertFalse(status.is_alive(dict(state, updated=time.time() - 200, measuring=None), cfg))


class WatcherTest(TempHome):
    def make(self, ssid="Hemma"):
        self.clock = [1000.0]
        self.ssid = [ssid]
        self.calls = []
        self.published = []

        def measure(cfg, s, storage, source, progress, current_ssid):
            progress("ping")
            self.calls.append((self.clock[0], s))
            return {"error": None, **m(50)}, []

        self.conn = ["full"]
        self.checks = []
        self.notes = []

        def connectivity(check=False):
            self.checks.append(check)
            return self.conn[0]

        self.route = [("wlp2s0", True)]
        self.awake = [1000.0]
        w = daemon.Watcher(None, now=lambda: self.clock[0], awake=lambda: self.awake[0] + self.clock[0] - 1000,
                           current_ssid=lambda: self.ssid[0], measure=measure, publish=self.published.append,
                           connectivity=connectivity, traffic_device=lambda: self.route[0],
                           notify=lambda *a: self.notes.append(a))
        patcher = mock.patch.object(daemon, "log")
        patcher.start()
        self.addCleanup(patcher.stop)
        return w

    def test_waits_after_joining_then_measures_each_interval(self):
        w, cfg = self.make(), config.load()
        w.tick(cfg)                                   # fel nätverk
        self.ssid[0] = "JENSEN-Guest"
        w.tick(cfg)                                   # nyss ansluten: väntar in nätverket
        self.assertEqual(self.calls, [])
        self.assertEqual(w.sleep_seconds(cfg), daemon.SETTLE_SECONDS)
        self.clock[0] += daemon.SETTLE_SECONDS
        w.tick(cfg)                                   # mäter
        self.clock[0] += 100
        w.tick(cfg)                                   # för tidigt
        self.clock[0] += 200
        w.tick(cfg)                                   # 5 min efter förra
        self.assertEqual([t for t, _ in self.calls], [1015.0, 1315.0])
        self.assertIn({"ssid": "JENSEN-Guest", "watched": "JENSEN-Guest", "enabled": True, "next_due": mock.ANY,
                       "measuring": "ping", "portal": False, "other_route": None}, self.published)

    def test_leaving_and_pausing_stops_measurements(self):
        w, cfg = self.make("JENSEN-Guest"), config.load()
        w.tick(cfg)
        self.ssid[0] = None
        self.clock[0] += 3600
        w.tick(cfg)
        self.assertEqual(self.published[-1]["watched"], None)
        self.ssid[0] = "JENSEN-Guest"
        cfg["monitoring_enabled"] = False
        self.clock[0] += 3600
        w.tick(cfg)
        self.assertEqual(self.calls, [])

    def test_shorter_interval_applies_immediately(self):
        w, cfg = self.make("JENSEN-Guest"), config.load()
        cfg["interval_minutes"] = 60
        w.tick(cfg)
        self.clock[0] += daemon.SETTLE_SECONDS
        w.tick(cfg)
        cfg["interval_minutes"] = 1
        self.clock[0] += 61
        w.tick(cfg)
        self.assertEqual(len(self.calls), 2)

    def test_measurement_from_app_counts_as_this_rounds(self):
        w, cfg = self.make("JENSEN-Guest"), config.load()
        w.measure = mock.Mock(side_effect=monitor.Busy)
        w.tick(cfg)
        self.clock[0] += daemon.SETTLE_SECONDS
        self.assertIsNone(w.tick(cfg))
        self.assertEqual(w.sleep_seconds(cfg), cfg["check_network_seconds"])  # ingen tät kontroll
        self.assertEqual(w.next_due, self.clock[0] + cfg["interval_minutes"] * 60)

    def test_unexpected_error_backs_off(self):
        w, cfg = self.make("JENSEN-Guest"), config.load()
        cfg["interval_minutes"] = 1
        w.measure = mock.Mock(side_effect=sqlite3.OperationalError("database is locked"))
        w.tick(cfg)
        for _ in range(20):                           # tio minuter med varv var 30:e sekund
            self.clock[0] += 30
            w.tick(cfg)
        self.assertEqual(w.measure.call_count, 2)     # en gång direkt, sedan efter fem minuter

    def test_network_changed_during_measurement(self):
        w, cfg = self.make("JENSEN-Guest"), config.load()
        w.measure = mock.Mock(side_effect=monitor.NetworkChanged("Hemma"))
        w.tick(cfg)
        self.clock[0] += daemon.SETTLE_SECONDS
        self.assertIsNone(w.tick(cfg))
        self.assertEqual(w.measure.call_args.kwargs["current_ssid"](), "JENSEN-Guest")

    def test_does_not_measure_via_cable_or_vpn(self):
        w, cfg = self.make("JENSEN-Guest"), config.load()
        self.route[0] = ("tun0", False)
        w.tick(cfg)
        self.clock[0] += daemon.SETTLE_SECONDS
        w.tick(cfg)
        self.assertEqual(self.calls, [])
        self.assertEqual(self.published[-1]["other_route"], "tun0")
        self.route[0] = (None, None)                  # okänt: mät
        self.clock[0] += 30
        w.tick(cfg)
        self.assertEqual(len(self.calls), 1)
        self.assertIsNone(self.published[-1]["other_route"])

    def test_waits_after_waking_from_suspend(self):
        w, cfg = self.make("JENSEN-Guest"), config.load()
        w.tick(cfg)
        self.clock[0] += daemon.SETTLE_SECONDS
        w.tick(cfg)
        self.assertEqual(len(self.calls), 1)
        self.clock[0] += 3600                         # en timme i viloläge: vaken-klockan står still
        self.awake[0] -= 3600
        w.tick(cfg)
        self.assertEqual(len(self.calls), 1)          # väntar in nätverket först
        self.assertEqual(w.sleep_seconds(cfg), daemon.SETTLE_SECONDS)
        self.clock[0] += daemon.SETTLE_SECONDS
        w.tick(cfg)
        self.assertEqual(len(self.calls), 2)

    def test_waits_for_login_on_captive_portal(self):
        w, cfg = self.make("JENSEN-Guest"), config.load()
        self.conn[0] = "portal"
        w.tick(cfg)
        self.clock[0] += daemon.SETTLE_SECONDS
        for _ in range(3):                            # inloggningssida: ingen mätning, en notis
            w.tick(cfg)
            self.assertEqual(w.sleep_seconds(cfg), daemon.PORTAL_RETRY_SECONDS)
            self.clock[0] += daemon.PORTAL_RETRY_SECONDS
        self.assertEqual(self.calls, [])
        self.assertEqual([n[0] for n in self.notes], ["Logga in på JENSEN-Guest"])
        self.assertTrue(self.published[-1]["portal"])
        self.assertEqual(self.checks, [False, True, True])  # ny kontroll medan man väntar på inloggning
        self.conn[0] = "full"                         # inloggad: mäter direkt
        w.tick(cfg)
        self.assertEqual(len(self.calls), 1)
        self.assertFalse(self.published[-1]["portal"])

    def test_portal_found_by_measurement(self):
        w, cfg = self.make("JENSEN-Guest"), config.load()
        w.measure = lambda *a, **k: ({"error": "inloggning", "portal": True}, [])
        self.conn[0] = "unknown"                      # NetworkManager kontrollerar inte anslutningen
        w.tick(cfg)
        self.clock[0] += daemon.SETTLE_SECONDS
        w.tick(cfg)
        self.assertTrue(self.published[-1]["portal"])
        self.assertEqual(w.sleep_seconds(cfg), cfg["check_network_seconds"])

    def test_boot_clock_counts_suspend(self):
        self.assertGreater(daemon.boot_clock(), 0)


class FormattingTest(unittest.TestCase):
    def test_fmt_when(self):
        now = datetime(2026, 10, 30, 12, 0).timestamp()
        self.assertEqual(formatting.fmt_when(datetime(2026, 10, 30, 8, 5).timestamp(), now), "08:05")
        self.assertEqual(formatting.fmt_when(datetime(2026, 10, 29, 8, 5).timestamp(), now), "i går 08:05")
        self.assertEqual(formatting.fmt_when(datetime(2026, 10, 27, 8, 5).timestamp(), now), "tis 27/10 08:05")
        self.assertEqual(formatting.fmt_when(datetime(2025, 3, 3, 8, 5).timestamp(), now), "3 mar 2025 08:05")

    def test_fmt_until_and_usage(self):
        self.assertEqual(formatting.fmt_until(20), "om mindre än en minut")
        self.assertEqual(formatting.fmt_until(190), "om 3 min")
        self.assertEqual(formatting.fmt_until(7200), "om 2 h")
        self.assertEqual(formatting.data_usage(config.DEFAULTS),
                         "Varje mätning använder upp till 25 MB, alltså högst 300 MB i timmen när du mäter var 5:e minut.")

    def test_overview_states(self):
        cfg = dict(config.DEFAULTS)
        now = 1000.0
        alive = {"watched": "JENSEN-Guest", "next_due": now + 130}
        self.assertEqual(formatting.overview_state(cfg, "JENSEN-Guest", alive, True, None, now)[1:3],
                         ("Bevakar JENSEN-Guest", "Nästa mätning om 2 min · var 5:e minut"))
        self.assertEqual(formatting.overview_state(cfg, "JENSEN-Guest", {}, False, None, now)[3], "warning")
        self.assertEqual(formatting.overview_state(cfg, "Hemma", {}, True, None, now)[1:3],
                         ("Väntar på ett bevakat nätverk", "Ansluten till Hemma · mäter automatiskt på JENSEN-Guest"))
        self.assertEqual(formatting.overview_state(cfg, None, {}, True, "upp", now)[1], "Mäter uppladdning …")
        self.assertEqual(formatting.overview_state(dict(cfg, monitoring_enabled=False), None, {}, True, None, now)[1],
                         "Automatisk mätning är avstängd")
        self.assertEqual(formatting.overview_state(dict(cfg, networks=[]), None, {}, True, None, now)[1],
                         "Inga nätverk valda")
        portal = formatting.overview_state(cfg, "JENSEN-Guest", dict(alive, portal=True), True, None, now)
        self.assertEqual((portal.title, portal.action), ("Logga in på JENSEN-Guest", "login"))
        cable = formatting.overview_state(cfg, "JENSEN-Guest", dict(alive, other_route="enp3s0"), True, None, now)
        self.assertEqual(cable.title, "Ansluten till JENSEN-Guest, men trafiken går via enp3s0")


class PlottingTest(unittest.TestCase):
    def test_nice_ceiling(self):
        self.assertEqual([plotting.nice_ceiling(v) for v in (0, 3.2, 64, 118, 607)], [10, 4, 80, 160, 800])

    def test_time_ticks_survive_daylight_saving(self):
        with mock.patch.dict(os.environ, {"TZ": "Europe/Stockholm"}):
            time.tzset()
            try:
                start = datetime(2026, 10, 24, 12, 0).timestamp()
                ticks, step = plotting.time_ticks(start, start + 86400 * 2)
                self.assertEqual(step, 43200)
                labels = [plotting.tick_label(t, step) for t in ticks]
                # 25 oktober har 25 timmar; markeringarna ska ändå hamna på hela klockslag
                self.assertEqual(labels, ["12:00", "sön 25/10", "12:00", "mån 26/10"])
            finally:
                time.tzset()
        os.environ.pop("TZ", None)
        time.tzset()

    def test_time_ticks_spring_forward_and_long_spans(self):
        with mock.patch.dict(os.environ, {"TZ": "Europe/Stockholm"}):
            time.tzset()
            try:
                start = datetime(2026, 3, 29, 0, 30).timestamp()
                ticks, step = plotting.time_ticks(start, start + 4 * 3600)
                labels = [plotting.tick_label(t, step) for t in ticks]
                self.assertEqual(len(labels), len(set(labels)))
                self.assertNotIn("02:00", labels)       # finns inte den natten
                self.assertEqual(ticks, sorted(ticks))
                start = datetime(2023, 5, 17).timestamp()
                ticks, step = plotting.time_ticks(start, start + 3 * 365 * 86400)
                self.assertLessEqual(len(ticks), 6)
                self.assertEqual(plotting.tick_label(ticks[0], step), "jan 2024")
            finally:
                time.tzset()
        os.environ.pop("TZ", None)
        time.tzset()

    def test_segments_split_on_gaps(self):
        points = [{"epoch": t} for t in (0, 300, 600, 9000, 9300)]
        self.assertEqual([len(s) for s in plotting.segments(points, 1200)], [3, 2])


class FakeSpeedServer(BaseHTTPRequestHandler):
    html = False

    def log_message(self, *args):
        pass

    def do_GET(self):
        n = int(self.path.split("bytes=")[1])
        body = b"<html>Logga in</html>" if self.html else b"\0" * n
        self.send_response(200)
        self.send_header("Content-Type", "text/html" if self.html else "application/octet-stream")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Server-Timing", "cfRequestDuration;dur=0.5")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        left = int(self.headers["Content-Length"])
        while left:
            left -= len(self.rfile.read(min(left, 65536)))
        self.send_response(200)
        self.send_header("Content-Length", "0")
        self.end_headers()


class SpeedTestTest(unittest.TestCase):
    def serve(self, handler=FakeSpeedServer):
        httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        self.addCleanup(httpd.server_close)
        self.addCleanup(httpd.shutdown)
        return f"http://127.0.0.1:{httpd.server_port}"

    def test_full_run_against_local_server(self):
        cfg = dict(config.DEFAULTS, server=self.serve(), download_bytes=8_000_000, upload_bytes=4_000_000)
        phases = []
        r = speedtest.run(cfg, phases.append)
        self.assertEqual(phases, ["ping", "ned", "upp"])
        self.assertGreater(r["download_mbps"], 10)
        self.assertGreater(r["upload_mbps"], 10)
        self.assertGreaterEqual(r["ping_ms"], 0.1)

    def test_login_page_gives_friendly_error(self):
        class Portal(FakeSpeedServer):
            html = True

        with self.assertRaises(speedtest.CaptivePortal) as ctx:
            speedtest.run(dict(config.DEFAULTS, server=self.serve(Portal)))
        self.assertIn("inloggning", str(ctx.exception))

    def test_redirect_is_captive_portal(self):
        class Redirect(FakeSpeedServer):
            def do_GET(self):
                self.send_response(302)
                self.send_header("Location", "http://login.example/")
                self.send_header("Content-Length", "0")
                self.end_headers()

        with self.assertRaises(speedtest.CaptivePortal):
            speedtest.run(dict(config.DEFAULTS, server=self.serve(Redirect)))
        db_dir = tempfile.TemporaryDirectory()
        self.addCleanup(db_dir.cleanup)
        with mock.patch.dict(os.environ, {"XDG_DATA_HOME": db_dir.name}):
            m, _ = monitor.measure_and_store(dict(config.DEFAULTS, server=self.serve(Redirect)), "X",
                                             Storage(config.db_path()), send_notification=lambda *a: None)
        self.assertTrue(m["portal"])

    def test_unreachable_server_gives_friendly_error(self):
        with self.assertRaises(speedtest.SpeedTestError) as ctx:
            speedtest.run(dict(config.DEFAULTS, server="http://127.0.0.1:1"))
        self.assertIn("Anslutningen bröts", str(ctx.exception))

    def test_invalid_server(self):
        with self.assertRaises(speedtest.SpeedTestError):
            speedtest.run(dict(config.DEFAULTS, server="ftp://x"))

    def test_throughput_skips_slow_start(self):
        # 1 MB första sekunden (uppstart), sedan 10 MB/s i tre sekunder
        samples = [(0.0, 0), (1.0, 1_000_000), (2.0, 11_000_000), (3.0, 21_000_000), (4.0, 31_000_000)]
        self.assertAlmostEqual(speedtest.throughput_mbps(samples), 80.0)
        # allt låg i buffertar från början: räkna på hela tiden
        self.assertAlmostEqual(speedtest.throughput_mbps([(0.0, 0), (0.1, 5_000_000), (2.0, 5_000_000)]), 20.0)
        with self.assertRaises(speedtest.SpeedTestError):
            speedtest.throughput_mbps([(0.0, 0), (1.0, 0)])

    def test_server_time_header(self):
        resp = mock.Mock()
        resp.getheader.return_value = "cfRequestDuration;dur=12.5"
        self.assertEqual(speedtest.server_time_ms(resp), 12.5)
        resp.getheader.return_value = None
        self.assertEqual(speedtest.server_time_ms(resp), 0.0)


if __name__ == "__main__":
    unittest.main()
