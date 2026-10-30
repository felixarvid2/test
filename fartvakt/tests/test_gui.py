"""Kör det riktiga fönstret mot en tillfällig databas. Kräver GTK 4, libadwaita och en
skärm (t.ex. `xvfb-run -a dbus-run-session -- python3 -m unittest tests.test_gui`)."""

import os
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

try:
    import gi

    gi.require_version("Gtk", "4.0")
    gi.require_version("Adw", "1")
    from gi.repository import Adw, Gio, GLib, Gtk

    HAVE_GTK = bool(os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY")) and Gtk.init_check()
except (ImportError, ValueError):
    HAVE_GTK = False

from fartvakt import config, network, service, speedtest, status  # noqa: E402
from fartvakt.storage import Storage  # noqa: E402


def spin(seconds=0.2, until=None):
    ctx = GLib.MainContext.default()
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        while ctx.pending():
            ctx.iteration(False)
        if until and until():
            return True
        time.sleep(0.01)
    return bool(until and until())


@unittest.skipUnless(HAVE_GTK, "GTK 4/libadwaita eller skärm saknas")
class WindowTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from fartvakt import gui

        cls.gui = gui
        cls.app = gui.Application()
        cls.app.set_flags(Gio.ApplicationFlags.NON_UNIQUE)
        cls.app.register(None)

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        for patcher in (
            mock.patch.dict(os.environ, {"XDG_CONFIG_HOME": self.tmp.name + "/conf",
                                         "XDG_DATA_HOME": self.tmp.name + "/data"}),
            mock.patch.object(network, "current_ssid", lambda: "JENSEN-Guest"),
            mock.patch.object(service, "ensure_running", lambda: True),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)
        self.db = Storage(config.db_path())
        status.write({"ssid": "JENSEN-Guest", "watched": "JENSEN-Guest", "enabled": True,
                      "next_due": time.time() + 200, "measuring": None})

    def seed(self, ssid="JENSEN-Guest", count=8, hours_ago=1.0, down=50.0):
        cfg = config.load()
        for i in range(count):
            ts = time.time() - hours_ago * 3600 + i * 300
            m = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(ts)) + time.strftime("%z"),
                 "epoch": ts, "ssid": ssid, "source": "auto", "download_mbps": down + i, "upload_mbps": 10.0,
                 "ping_ms": 20.0, "jitter_ms": 1.0}
            m["ts"] = m["ts"][:-2] + ":" + m["ts"][-2:]
            mid = self.db.add_measurement(m)
            if i == count - 1:
                self.db.add_deviations(mid, m, [{"metric": "download_mbps", "value": m["download_mbps"],
                                                 "baseline": 10.0, "change_percent": 400.0, "direction": "bättre"}])
        return cfg

    def window(self):
        win = self.gui.Window(self.app)
        self.addCleanup(win.destroy)
        win.present()
        spin(0.3)
        return win

    def test_markup_characters_in_network_names(self):
        cfg = config.load()
        cfg["networks"] = ["Café & <Bar>"]
        config.save(cfg)
        win = self.window()
        self.assertIn("Café & <Bar>", win.empty_page.get_description().replace("&amp;", "&")
                      .replace("&lt;", "<").replace("&gt;", ">"))

    def test_corrupt_database_is_moved_aside(self):
        self.db.close()
        for extra in ("-wal", "-shm"):
            Path(str(config.db_path()) + extra).unlink(missing_ok=True)
        config.db_path().write_bytes(b"inte en databas" * 100)
        win = self.window()
        self.assertEqual(win.overview_stack.get_visible_child_name(), "empty")
        self.assertEqual(len(list(config.data_dir().glob("fartvakt.skadad-*.db"))), 1)

    def test_period_moves_forward_while_open(self):
        self.seed(count=2, hours_ago=23.95)
        win = self.window()
        self.assertEqual(win.meas_table.store.get_n_items(), 2)
        real = time.time
        with mock.patch.object(time, "time", lambda: real() + 3600):
            for _ in range(self.gui.PERIOD_REFRESH_TICKS):
                win._tick()
        self.assertEqual(win.meas_table.store.get_n_items(), 0)

    def test_empty_state(self):
        win = self.window()
        self.assertEqual(win.overview_stack.get_visible_child_name(), "empty")
        self.assertFalse(win.filter_bar.get_visible())
        self.assertIn("JENSEN-Guest", win.empty_page.get_description())
        self.assertEqual(win.meas_stack.get_visible_child_name(), "empty")

    def test_shows_data_and_filters(self):
        self.seed()
        self.seed(ssid="Hemma", count=3, hours_ago=50)
        win = self.window()
        self.assertEqual(win.overview_stack.get_visible_child_name(), "content")
        self.assertEqual(win.meas_table.store.get_n_items(), 8)      # 24 timmar
        self.assertEqual(win.dev_table.store.get_n_items(), 1)
        self.assertEqual(win.hero_title.get_text(), "Bevakar JENSEN-Guest")
        self.assertEqual(win.tiles["download_mbps"][0].get_text(), "57,0")
        self.assertEqual(win.stats["count"].get_text(), "8")
        self.assertEqual(win.stats["deviations"].get_text(), "1")   # samma som fliken Avvikelser
        self.assertEqual(len(win.chart.points), 8)
        win._set_period(3)                                            # Allt
        self.assertEqual(win.meas_table.store.get_n_items(), 11)
        self.assertTrue(win.period_buttons[3].get_active())
        self.assertEqual(win.period_drop.get_selected(), 3)
        names = [win.network_model.get_string(i) for i in range(win.network_model.get_n_items())]
        self.assertEqual(names, ["Alla nätverk", "JENSEN-Guest", "Hemma"])
        win.network_drop.set_selected(2)
        spin(0.1)
        self.assertEqual(win.meas_table.store.get_n_items(), 3)
        self.assertEqual([r.data["ssid"] for r in win.dev_table.store], ["Hemma"])
        win._set_period(0)
        self.assertEqual(win.meas_stack.get_visible_child_name(), "empty")
        self.assertEqual(win.dev_stack.get_visible_child_name(), "empty")
        self.assertEqual(win.tiles["download_mbps"][1].get_text(), "Ingen lyckad mätning under perioden")

    def test_new_measurement_from_background_appears(self):
        self.seed(count=2)
        win = self.window()
        self.seed(count=1, hours_ago=0.1)
        win.reload()
        self.assertEqual(win.meas_table.store.get_n_items(), 3)

    def test_measure_now(self):
        self.seed()
        win = self.window()

        def fake_run(cfg, progress):
            progress("ned")
            time.sleep(0.3)
            return {"ping_ms": 18.0, "jitter_ms": 1.0, "download_mbps": 88.0, "upload_mbps": 11.0}

        with mock.patch.object(speedtest, "run", fake_run):
            win.activate_action("win.measure", None)
            self.assertTrue(spin(2, until=lambda: win.measure_label.get_text() == "Mäter …"))
            self.assertFalse(win.measure_action.get_enabled())
            self.assertTrue(spin(5, until=lambda: win.own_phase is None))
        self.assertEqual(win.meas_table.store.get_n_items(), 9)
        self.assertEqual(self.db.last()["source"], "manuell")
        self.assertTrue(win.measure_action.get_enabled())

    def test_banner_when_service_is_down(self):
        status.path().unlink()
        win = self.window()
        self.assertFalse(win.banner.get_revealed())   # ger tjänsten tid att höra av sig först
        win.silent_since -= self.gui.SERVICE_GRACE_SECONDS + 1
        win.reload()
        self.assertTrue(win.banner.get_revealed())
        self.assertEqual(win.hero_title.get_text(), "Ansluten till JENSEN-Guest")

    def test_stale_status_from_stopped_service(self):
        # tjänsten stoppades mitt i en mätning för länge sedan, på ett annat nätverk
        status.write({"ssid": "JENSEN-Guest", "watched": "JENSEN-Guest", "enabled": True, "next_due": None,
                      "measuring": "ping"})
        with mock.patch.object(network, "current_ssid", lambda: None):
            win = self.window()
            spin(0.2)
            # "mäter" i statusfilen räknas inte när ingen mätning faktiskt pågår
            self.assertTrue(win.measure_action.get_enabled())
            self.assertEqual(win.measure_label.get_text(), "Mät nu")
            state = status.read()
            state["updated"] = time.time() - 3600
            status.path().write_text(__import__("json").dumps(state))
            win.silent_since = None
            win.reload()
            win.silent_since -= self.gui.SERVICE_GRACE_SECONDS + 1
            win.reload()
            # en gammal statusfil får inte visa nätverket som om datorn fortfarande vore ansluten
            self.assertEqual(win.hero_title.get_text(), "Väntar på ett bevakat nätverk")

    def test_login_button_on_captive_portal(self):
        win = self.window()
        self.assertFalse(win.login_button.get_visible())
        status.write({"ssid": "JENSEN-Guest", "watched": "JENSEN-Guest", "enabled": True, "next_due": None,
                      "measuring": None, "portal": True})
        win.reload()
        self.assertTrue(win.login_button.get_visible())
        self.assertEqual(win.hero_title.get_text(), "Logga in på JENSEN-Guest")
        with mock.patch.object(Gtk.UriLauncher, "launch") as launch:
            win.login_button.emit("clicked")
        launch.assert_called_once()

    def test_preferences_change_config(self):
        from fartvakt.preferences import PreferencesDialog

        win = self.window()
        win.ssid = "Kafé"
        dialog = PreferencesDialog(win)
        dialog.present(win)
        spin(0.2)
        dialog.add_row.set_text("Skolan")
        dialog._on_add_entry(dialog.add_row)
        dialog._on_add_current(None)
        self.assertEqual(config.load()["networks"], ["JENSEN-Guest", "Skolan", "Kafé"])
        dialog._on_remove(None, "JENSEN-Guest")
        self.assertEqual(config.load()["networks"], ["Skolan", "Kafé"])
        dialog.interval.set_value(15)
        self.assertEqual(config.load()["interval_minutes"], 15)
        self.assertIn("var 15:e minut", dialog.usage_group.get_description())
        dialog.enabled.set_active(False)
        spin(0.1)
        self.assertEqual(win.hero_title.get_text(), "Automatisk mätning är avstängd")
        dialog.force_close()

    def test_clear_all(self):
        from fartvakt.preferences import PreferencesDialog

        self.seed()
        win = self.window()
        dialog = PreferencesDialog(win)
        dialog._on_clear_response(None, "cancel")
        self.assertEqual(self.db.signature()[0], 8)
        dialog._on_clear_response(None, "clear")
        self.assertEqual(self.db.signature()[0], 0)
        self.assertEqual(win.overview_stack.get_visible_child_name(), "empty")

    def test_export(self):
        self.seed()
        win = self.window()
        target = Path(self.tmp.name) / "ut.csv"
        dialog = mock.Mock()
        dialog.save_finish.return_value = Gio.File.new_for_path(str(target))
        win._export_chosen(dialog, None)
        self.assertTrue(target.read_text(encoding="utf-8-sig").startswith("Tid;Nätverk"))
        dialog.save_finish.side_effect = GLib.Error("avbrutet")
        win._export_chosen(dialog, None)  # avbrutet: inget händer

    def test_about_and_shortcuts_open(self):
        win = self.window()
        self.app.on_about()
        self.app.on_shortcuts()
        spin(0.2)
        self.assertIsNotNone(win.get_visible_dialog())
        Adw.Dialog.force_close(win.get_visible_dialog())


if __name__ == "__main__":
    unittest.main()
