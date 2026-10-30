import os
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from fartvakt import analysis, config, daemon, monitor, network, speedtest  # noqa: E402
from fartvakt.storage import Storage  # noqa: E402


class TempHome(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        patcher = mock.patch.dict(os.environ, {"XDG_CONFIG_HOME": self.tmp.name + "/conf",
                                               "XDG_DATA_HOME": self.tmp.name + "/data"})
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self.tmp.cleanup)


class NetworkTest(unittest.TestCase):
    def test_parse_active_ssid(self):
        out = "no:Grannen\nyes:JENSEN-Guest\nno:Annat\n"
        self.assertEqual(network.parse_nmcli_wifi(out), "JENSEN-Guest")

    def test_parse_escaped_colon(self):
        self.assertEqual(network.parse_nmcli_wifi("yes:Kafé\\:5G\n"), "Kafé:5G")

    def test_no_active(self):
        self.assertIsNone(network.parse_nmcli_wifi("no:A\nno:B\n"))
        self.assertIsNone(network.parse_nmcli_wifi(""))

    def test_matches_ignores_case_and_spaces(self):
        self.assertTrue(network.matches("jensen-guest", [" JENSEN-Guest "]))
        self.assertFalse(network.matches("JENSEN-Staff", ["JENSEN-Guest"]))
        self.assertFalse(network.matches(None, ["JENSEN-Guest"]))


def m(down, up=10.0, ping=20.0):
    return {"download_mbps": down, "upload_mbps": up, "ping_ms": ping}


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

    def test_small_absolute_change_ignored(self):
        # 20 -> 28 ms är +40 % men under 10 ms, så det räknas inte
        self.assertEqual(analysis.find_deviations(m(50, ping=28), self.history, 30, 5), [])

    def test_needs_baseline(self):
        self.assertEqual(analysis.find_deviations(m(5), self.history[:3], 30, 5), [])

    def test_failure_is_deviation(self):
        [d] = analysis.find_deviations({"error": "nere"}, [], 30, 5)
        self.assertEqual(d["direction"], "avbrott")


class StorageAndMonitorTest(TempHome):
    def test_measure_and_store_flags_slow_measurement(self):
        db = Storage(config.db_path())
        cfg = config.load()
        notes = []
        for v in (50, 51, 49, 50, 52):
            monitor.measure_and_store(cfg, "JENSEN-Guest", db, run_test=lambda _c, v=v: m(v),
                                      send_notification=lambda *a: notes.append(a))
        self.assertEqual(notes, [])
        meas, devs = monitor.measure_and_store(cfg, "JENSEN-Guest", db, run_test=lambda _c: m(12),
                                               send_notification=lambda *a: notes.append(a))
        self.assertEqual([d["metric"] for d in devs], ["download_mbps"])
        self.assertEqual(len(notes), 1)
        self.assertIn("12,0 Mbit/s", notes[0][1])
        stored = db.deviations()
        self.assertEqual((stored[0]["measurement_id"], stored[0]["value"]), (meas["id"], 12))
        self.assertEqual(len(db.measurements()), 6)
        # baslinjen är per nätverk
        _, devs = monitor.measure_and_store(cfg, "Hemma", db, run_test=lambda _c: m(5),
                                            send_notification=lambda *a: None)
        self.assertEqual(devs, [])

    def test_repeated_failure_notifies_once(self):
        db = Storage(config.db_path())
        cfg = config.load()
        notes = []

        def fail(_c):
            raise speedtest.SpeedTestError("nere")

        for _ in range(3):
            meas, devs = monitor.measure_and_store(cfg, "JENSEN-Guest", db, run_test=fail,
                                                   send_notification=lambda *a: notes.append(a))
        self.assertEqual(meas["error"], "nere")
        self.assertEqual(len(devs), 1)
        self.assertEqual(len(notes), 1)
        self.assertEqual(len(db.deviations()), 3)

    def test_lock_prevents_parallel_measurements(self):
        with monitor.measurement_lock():
            with self.assertRaises(monitor.Busy):
                with monitor.measurement_lock():
                    pass

    def test_export_csv(self):
        db = Storage(config.db_path())
        db.add_measurement({"ts": "2026-10-30T10:00:00+01:00", "ssid": "JENSEN-Guest", "source": "auto", **m(40)})
        out = Path(self.tmp.name) / "ut.csv"
        self.assertEqual(db.export_csv(out), 1)
        self.assertIn("JENSEN-Guest", out.read_text())

    def test_config_roundtrip_and_validation(self):
        cfg = config.load()
        self.assertEqual(cfg["networks"], ["JENSEN-Guest"])
        cfg.update(networks=["A", " B "], interval_minutes=2)
        config.save(cfg)
        self.assertEqual(config.load()["networks"], ["A", "B"])
        config.config_path().write_text('{"interval_minutes": -3, "threshold_percent": "x"}')
        cfg = config.load()
        self.assertEqual((cfg["interval_minutes"], cfg["threshold_percent"]), (5, 30))


class WatcherTest(TempHome):
    def test_measures_on_join_then_each_interval(self):
        clock = [0.0]
        ssid = ["Hemma"]
        calls = []

        def measure(cfg, s, storage, source):
            calls.append((clock[0], s))
            return {"error": None, **m(50)}, []

        w = daemon.Watcher(None, now=lambda: clock[0], current_ssid=lambda: ssid[0], measure=measure)
        cfg = config.load()
        with mock.patch.object(daemon, "log"):
            w.tick(cfg)                       # fel nätverk
            ssid[0] = "JENSEN-Guest"
            w.tick(cfg)                       # mäter direkt
            clock[0] = 100
            w.tick(cfg)                       # för tidigt
            clock[0] = 300
            w.tick(cfg)                       # 5 min senare
            ssid[0] = None
            clock[0] = 1000
            w.tick(cfg)                       # lämnat nätverket
            cfg["monitoring_enabled"] = False
            ssid[0] = "JENSEN-Guest"
            w.tick(cfg)                       # pausad
        self.assertEqual(calls, [(0.0, "JENSEN-Guest"), (300, "JENSEN-Guest")])


class FakeSpeedServer(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        n = int(self.path.split("bytes=")[1])
        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(n))
        self.end_headers()
        self.wfile.write(b"\0" * n)

    def do_POST(self):
        left = int(self.headers["Content-Length"])
        while left:
            left -= len(self.rfile.read(min(left, 65536)))
        self.send_response(200)
        self.send_header("Content-Length", "0")
        self.end_headers()


class SpeedTestTest(unittest.TestCase):
    def setUp(self):
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), FakeSpeedServer)
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.addCleanup(self.httpd.server_close)
        self.addCleanup(self.httpd.shutdown)
        self.server = f"http://127.0.0.1:{self.httpd.server_port}"

    def test_full_run_against_local_server(self):
        cfg = dict(config.DEFAULTS, server=self.server, download_bytes=4_000_000, upload_bytes=2_000_000)
        with mock.patch.dict(os.environ, {"http_proxy": "", "HTTP_PROXY": ""}):
            r = speedtest.run(cfg)
        self.assertGreater(r["download_mbps"], 1)
        self.assertGreater(r["upload_mbps"], 1)
        self.assertGreaterEqual(r["ping_ms"], 0)

    def test_unreachable_server_gives_friendly_error(self):
        cfg = dict(config.DEFAULTS, server="http://127.0.0.1:1")
        with self.assertRaises(speedtest.SpeedTestError) as ctx:
            speedtest.run(cfg)
        self.assertIn("Anslutningen bröts", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
