"""Appens fönster (GTK 4 och libadwaita)."""

import os
import sys
import threading
import time
from pathlib import Path

import gi

gi.require_version("Gtk", "4.0")
gi.require_version("Adw", "1")
from gi.repository import Adw, Gdk, Gio, GLib, GObject, Gtk, Pango  # noqa: E402

from . import APP_ID, __version__, analysis, config, monitor, network, service, status  # noqa: E402
from .chart import SpeedChart  # noqa: E402
from .formatting import LOGIN_URL, PHASES, fmt_table_time, fmt_when, overview_state  # noqa: E402
from .storage import Storage, open_storage  # noqa: E402

PERIODS = [("24 timmar", 86400), ("7 dagar", 7 * 86400), ("30 dagar", 30 * 86400), ("Allt", None)]
ALL_NETWORKS = "Alla nätverk"
TICK_SECONDS = 2
# Så länge får tjänsten vara tyst innan appen säger att den inte kör (efter start eller viloläge
# hinner den inte alltid höra av sig direkt).
SERVICE_GRACE_SECONDS = 45
# Perioden (24 timmar osv.) flyttas fram så här ofta även om inget nytt har mätts.
PERIOD_REFRESH_TICKS = 30
WEBSITE = "https://github.com/felixarvid2/test/tree/main/fartvakt"

CSS = """
.hero-icon { border-radius: 9999px; min-width: 64px; min-height: 64px; }
.hero-icon.success { background: alpha(@success_color, 0.15); color: @success_color; }
.hero-icon.accent { background: alpha(@accent_color, 0.15); color: @accent_color; }
.hero-icon.warning { background: alpha(@warning_color, 0.18); color: @warning_color; }
.hero-icon.dim { background: alpha(@window_fg_color, 0.08); color: alpha(@window_fg_color, 0.6); }
.tile { padding: 16px 18px; }
.tile-value { font-size: 26pt; font-weight: 800; font-feature-settings: "tnum"; }
.tile-unit { font-size: 12pt; font-weight: 600; opacity: 0.6; }
.stat-value { font-size: 16pt; font-weight: 700; font-feature-settings: "tnum"; }
.numeric { font-feature-settings: "tnum"; }
.pill { border-radius: 9999px; padding: 2px 9px; font-size: 9pt; font-weight: 700; }
.pill.good { background: alpha(@success_color, 0.15); color: @success_color; }
.pill.bad { background: alpha(@error_color, 0.15); color: @error_color; }
.pill.neutral { background: alpha(@window_fg_color, 0.08); color: alpha(@window_fg_color, 0.7); }
.legend-dot { border-radius: 9999px; min-width: 10px; min-height: 10px; }
.legend-dot.down { background: #3584e4; }
.legend-dot.up { background: #2ec27e; }
.legend-dot.bad { background: transparent; border: 2px solid #e01b24; min-width: 7px; min-height: 7px; }
columnview.data-table > listview > row > cell { padding: 6px 12px; }
"""


def _label(text="", css=(), xalign=0.0, **kwargs):
    label = Gtk.Label(label=text, xalign=xalign, **kwargs)
    for c in css:
        label.add_css_class(c)
    return label


class Item(GObject.Object):
    """En rad i en tabell; `data` är mätningen eller avvikelsen som en dict."""

    def __init__(self, data):
        super().__init__()
        self.data = data


class Table:
    """En sorterbar Gtk.ColumnView. Varje kolumn: (rubrik, text(d), stil(d), sorteringsnyckel(d), expandera, tal)."""

    STYLE_CLASSES = ("success", "error", "warning", "dim-label")

    def __init__(self, columns):
        self.store = Gio.ListStore(item_type=Item)
        self.view = Gtk.ColumnView(show_row_separators=True, reorderable=False)
        self.view.add_css_class("data-table")
        sorted_model = Gtk.SortListModel(model=self.store, sorter=self.view.get_sorter())
        self.view.set_model(Gtk.NoSelection(model=sorted_model))
        for title, text, style, key, expand, numeric in columns:
            factory = Gtk.SignalListItemFactory()
            factory.connect("setup", self._setup, numeric)
            factory.connect("bind", self._bind, text, style)
            column = Gtk.ColumnViewColumn(title=title, factory=factory, expand=expand, resizable=True)
            if key:
                column.set_sorter(Gtk.CustomSorter.new(self._compare, key))
            self.view.append_column(column)

    @staticmethod
    def _setup(_factory, item, numeric):
        label = Gtk.Label(xalign=1.0 if numeric else 0.0, ellipsize=Pango.EllipsizeMode.END)
        if numeric:
            label.add_css_class("numeric")
        item.set_child(label)

    @classmethod
    def _bind(cls, _factory, item, text, style):
        label, data = item.get_child(), item.get_item().data
        value = text(data)
        label.set_text(value)
        label.set_tooltip_text(value if len(value) > 24 else None)
        for c in cls.STYLE_CLASSES:
            label.remove_css_class(c)
        css = style(data) if style else None
        if css:
            label.add_css_class(css)

    @staticmethod
    def _compare(a, b, key):
        ka, kb = key(a.data), key(b.data)
        ka = (ka is not None, ka if ka is not None else 0)
        kb = (kb is not None, kb if kb is not None else 0)
        return Gtk.Ordering.SMALLER if ka < kb else Gtk.Ordering.LARGER if ka > kb else Gtk.Ordering.EQUAL

    def set_rows(self, rows):
        self.store.splice(0, self.store.get_n_items(), [Item(r) for r in rows])


def _num(key, decimals=1):
    return lambda d: analysis.fmt_number(d.get(key), decimals)


def _measurement_status(d):
    if d.get("error"):
        return d["error"]
    devs = d.get("devs") or []
    if not devs:
        return "Normal"
    return "Avvikelse: " + ", ".join(f"{analysis.METRICS[x['metric']][0].lower()} {x['direction']}" for x in devs)


def _measurement_style(d):
    if d.get("error"):
        return "error"
    devs = d.get("devs") or []
    if any(x["direction"] == "sämre" for x in devs):
        return "error"
    return "success" if devs else None


def _deviation_metric(d):
    return "Anslutning" if d["metric"] == analysis.FAILURE else analysis.METRICS[d["metric"]][0]


def _deviation_value(d, key):
    if d["metric"] == analysis.FAILURE:
        return "–"
    return f"{analysis.fmt_number(d[key])} {analysis.METRICS[d['metric']][1]}"


def _deviation_change(d):
    if d.get("change_percent") is None:
        return "–"
    return f"{'+' if d['change_percent'] > 0 else '−'}{analysis.fmt_number(abs(d['change_percent']), 0)} %"


def _direction_style(d):
    return "success" if d["direction"] == "bättre" else "error"


def _dim(_d):
    return "dim-label"


class Window(Adw.ApplicationWindow):
    def __init__(self, app):
        super().__init__(application=app, title="Fartvakt", default_width=1120, default_height=800)
        self.set_size_request(360, 480)
        self.cfg = config.load()
        self.db, moved_db = open_storage()
        self.silent_since = time.monotonic()  # sedan när tjänsten inte har hört av sig
        self.start_requested = time.monotonic()  # tjänsten startas nedan om den inte redan kör
        self.ssid = None
        self.ssid_thread = None
        self.daemon = {}
        self.alive = False
        self.own_phase = None
        self.signature = None
        self.cfg_stamp = None
        self.networks = []
        self.ticks = 0
        self.oldest_shown = None

        self._actions()
        self._build()
        if moved_db:
            self.toast(f"Databasen var skadad och har flyttats till {moved_db}. En ny har skapats.", timeout=0)
        self._read_ssid()
        self.reload(force=True)
        self.tick_id = GLib.timeout_add_seconds(TICK_SECONDS, self._tick)
        self.connect("close-request", self._on_close)
        threading.Thread(target=service.ensure_running, daemon=True).start()

    # ---------- uppbyggnad ----------

    def _actions(self):
        for name, callback in (("measure", self.on_measure), ("export", self.on_export),
                               ("preferences", self.on_preferences), ("show-deviations", self.on_show_deviations)):
            action = Gio.SimpleAction.new(name, None)
            action.connect("activate", callback)
            self.add_action(action)
        self.measure_action = self.lookup_action("measure")

    def _build(self):
        self.toasts = Adw.ToastOverlay()
        toolbar = Adw.ToolbarView()
        self.toasts.set_child(toolbar)
        self.set_content(self.toasts)

        self.stack = Adw.ViewStack()
        header = Adw.HeaderBar()
        self.switcher = Adw.ViewSwitcher(stack=self.stack, policy=Adw.ViewSwitcherPolicy.WIDE)
        header.set_title_widget(self.switcher)

        self.measure_spinner = Gtk.Spinner(visible=False)
        self.measure_label = _label("Mät nu")
        box = Gtk.Box(spacing=8)
        box.append(self.measure_spinner)
        box.append(self.measure_label)
        self.measure_button = Gtk.Button(child=box, action_name="win.measure",
                                         tooltip_text="Mät hastigheten nu (Ctrl+M)")
        self.measure_button.add_css_class("suggested-action")
        header.pack_start(self.measure_button)

        menu = Gio.Menu()
        section = Gio.Menu()
        section.append("Exportera som CSV …", "win.export")
        menu.append_section(None, section)
        section = Gio.Menu()
        section.append("Inställningar", "win.preferences")
        section.append("Tangentbordsgenvägar", "app.shortcuts")
        section.append("Om Fartvakt", "app.about")
        menu.append_section(None, section)
        header.pack_end(Gtk.MenuButton(icon_name="open-menu-symbolic", menu_model=menu, primary=True,
                                       tooltip_text="Huvudmeny"))
        toolbar.add_top_bar(header)

        self.banner = Adw.Banner(title="Bakgrundsbevakningen är inte igång, så inga automatiska mätningar görs",
                                 button_label="Starta")
        self.banner.connect("button-clicked", self.on_start_service)
        toolbar.add_top_bar(self.banner)
        self.filter_bar = self._filter_bar()
        toolbar.add_top_bar(self.filter_bar)

        self.stack.add_titled_with_icon(self._overview_page(), "oversikt", "Översikt",
                                        "power-profile-performance-symbolic")
        self.stack.add_titled_with_icon(self._measurements_page(), "matningar", "Mätningar", "view-list-symbolic")
        self.stack.add_titled_with_icon(self._deviations_page(), "avvikelser", "Avvikelser",
                                        "dialog-warning-symbolic")
        toolbar.set_content(self.stack)

        bar = Adw.ViewSwitcherBar(stack=self.stack)
        toolbar.add_bottom_bar(bar)
        narrow = Adw.Breakpoint.new(Adw.BreakpointCondition.parse("max-width: 640sp"))
        narrow.add_setter(self.switcher, "visible", False)
        narrow.add_setter(bar, "reveal", True)
        narrow.add_setter(self.period_toggles, "visible", False)
        narrow.add_setter(self.period_drop, "visible", True)
        narrow.add_setter(self.legend, "visible", False)
        self.add_breakpoint(narrow)

    def _filter_bar(self):
        bar = Gtk.Box(spacing=12, margin_start=12, margin_end=12, margin_top=6, margin_bottom=6)
        self.network_model = Gtk.StringList.new([ALL_NETWORKS])
        self.network_drop = Gtk.DropDown(model=self.network_model, tooltip_text="Visa nätverk")
        self.network_drop.connect("notify::selected", lambda *_: self.reload(force=True))
        bar.append(self.network_drop)

        # breda fönster: knappar; smala: en rullgardin (se brytpunkten i _build)
        self.period_index = 0
        self.period_toggles = Gtk.Box(css_classes=["linked"])
        self.period_buttons = []
        for i, (title, _seconds) in enumerate(PERIODS):
            button = Gtk.ToggleButton(label=title, active=i == 0)
            if i:
                button.set_group(self.period_buttons[0])
            button.connect("toggled", self._on_period_toggle, i)
            self.period_toggles.append(button)
            self.period_buttons.append(button)
        bar.append(self.period_toggles)
        self.period_drop = Gtk.DropDown.new_from_strings([title for title, _ in PERIODS])
        self.period_drop.set_visible(False)
        self.period_drop.set_tooltip_text("Visa period")
        self.period_drop.connect("notify::selected", self._on_period_drop)
        bar.append(self.period_drop)
        return bar

    def _overview_page(self):
        self.overview_stack = Gtk.Stack(transition_type=Gtk.StackTransitionType.CROSSFADE)

        empty = Adw.StatusPage(icon_name=APP_ID, title="Inga mätningar än")
        self.empty_page = empty
        start = Gtk.Button(label="Mät nu", action_name="win.measure", halign=Gtk.Align.CENTER)
        start.add_css_class("pill")
        start.add_css_class("suggested-action")
        empty.set_child(start)
        self.overview_stack.add_named(empty, "empty")

        content = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=18, margin_top=18, margin_bottom=24,
                          margin_start=12, margin_end=12)
        content.append(self._hero())

        self.tiles = {}
        flow = Gtk.FlowBox(selection_mode=Gtk.SelectionMode.NONE, homogeneous=True, max_children_per_line=3,
                           min_children_per_line=1, column_spacing=12, row_spacing=12)
        for key, title in (("download_mbps", "Nedladdning"), ("upload_mbps", "Uppladdning"), ("ping_ms", "Ping")):
            flow.append(self._tile(key, title))
        content.append(flow)

        chart_card = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10, css_classes=["card", "tile"])
        head = Gtk.Box(spacing=8)
        head.append(_label("Hastighet över tid", ["heading"], hexpand=True))
        self.legend = Gtk.Box(spacing=8)
        for css, text in (("down", "Nedladdning"), ("up", "Uppladdning"), ("bad", "Avvikelse")):
            self.legend.append(Gtk.Box(css_classes=["legend-dot", css], valign=Gtk.Align.CENTER, margin_start=8))
            self.legend.append(_label(text, ["caption"]))
        head.append(self.legend)
        chart_card.append(head)
        self.chart = SpeedChart()
        chart_card.append(self.chart)
        content.append(chart_card)

        self.stats = {}
        stats = Gtk.FlowBox(selection_mode=Gtk.SelectionMode.NONE, homogeneous=True, max_children_per_line=4,
                            min_children_per_line=1, column_spacing=12, row_spacing=12)
        for key, title in (("count", "Mätningar"), ("ok", "Lyckade"), ("deviations", "Med avvikelse"),
                           ("median", "Median nedladdning")):
            card = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=2, css_classes=["card", "tile"])
            card.append(_label(title, ["caption", "dim-label"]))
            value = _label("–", ["stat-value"])
            card.append(value)
            self.stats[key] = value
            stats.append(card)
        content.append(stats)

        recent_head = Gtk.Box()
        recent_head.append(_label("Senaste avvikelserna", ["heading"], hexpand=True))
        recent_head.append(Gtk.Button(label="Visa alla", action_name="win.show-deviations",
                                      css_classes=["flat"]))
        content.append(recent_head)
        self.recent = Gtk.ListBox(selection_mode=Gtk.SelectionMode.NONE, css_classes=["boxed-list"])
        content.append(self.recent)

        clamp = Adw.Clamp(maximum_size=1100, tightening_threshold=800, child=content)
        scroller = Gtk.ScrolledWindow(hscrollbar_policy=Gtk.PolicyType.NEVER, child=clamp, vexpand=True)
        self.overview_stack.add_named(scroller, "content")
        return self.overview_stack

    def _hero(self):
        card = Gtk.Box(spacing=18, css_classes=["card", "tile"])
        self.hero_icon_box = Gtk.Box(css_classes=["hero-icon"], valign=Gtk.Align.CENTER, halign=Gtk.Align.START,
                                     hexpand=False)
        self.hero_icon = Gtk.Image(pixel_size=32, hexpand=True, halign=Gtk.Align.CENTER, valign=Gtk.Align.CENTER)
        self.hero_spinner = Gtk.Spinner(hexpand=True, halign=Gtk.Align.CENTER, valign=Gtk.Align.CENTER,
                                        width_request=32, height_request=32, visible=False)
        self.hero_icon_box.append(self.hero_icon)
        self.hero_icon_box.append(self.hero_spinner)
        card.append(self.hero_icon_box)
        text = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=4, valign=Gtk.Align.CENTER, hexpand=True)
        self.hero_title = _label("", ["title-2"], wrap=True)
        self.hero_subtitle = _label("", ["dim-label"], wrap=True)
        self.hero_last = _label("", ["caption", "dim-label"], wrap=True)
        for w in (self.hero_title, self.hero_subtitle, self.hero_last):
            text.append(w)
        card.append(text)
        self.login_button = Gtk.Button(label="Öppna inloggningssidan", valign=Gtk.Align.CENTER, visible=False,
                                       css_classes=["pill", "suggested-action"],
                                       tooltip_text="Öppnar webbläsaren så att nätverkets inloggningssida visas")
        self.login_button.connect("clicked", self.on_login)
        card.append(self.login_button)
        return card

    def _tile(self, key, title):
        card = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6, css_classes=["card", "tile"])
        head = Gtk.Box()
        head.append(_label(title, ["caption-heading", "dim-label"], hexpand=True))
        pill = _label("", ["pill", "neutral"], visible=False)
        head.append(pill)
        card.append(head)
        row = Gtk.Box(spacing=6)
        value = _label("–", ["tile-value"])
        row.append(value)
        row.append(_label(analysis.METRICS[key][1], ["tile-unit"], valign=Gtk.Align.BASELINE_FILL))
        card.append(row)
        normal = _label("", ["caption", "dim-label"], wrap=True)
        card.append(normal)
        self.tiles[key] = (value, normal, pill)
        return card

    def _page_with_empty(self, table, icon, title, description):
        stack = Gtk.Stack(transition_type=Gtk.StackTransitionType.CROSSFADE)
        stack.add_named(Gtk.ScrolledWindow(child=table.view, vexpand=True), "table")
        stack.add_named(Adw.StatusPage(icon_name=icon, title=title, description=description), "empty")
        return stack

    def _measurements_page(self):
        self.meas_table = Table([
            ("Tid", lambda d: fmt_table_time(d["epoch"]), None, lambda d: d["epoch"], False, False),
            ("Nätverk", lambda d: d["ssid"] or "–", None, lambda d: d["ssid"] or "", False, False),
            ("Ned (Mbit/s)", _num("download_mbps"), None, lambda d: d["download_mbps"], False, True),
            ("Upp (Mbit/s)", _num("upload_mbps"), None, lambda d: d["upload_mbps"], False, True),
            ("Ping (ms)", _num("ping_ms"), None, lambda d: d["ping_ms"], False, True),
            ("Jitter (ms)", _num("jitter_ms"), None, lambda d: d["jitter_ms"], False, True),
            ("Källa", lambda d: "Automatisk" if d["source"] == "auto" else "Manuell", _dim,
             lambda d: d["source"], False, False),
            ("Status", _measurement_status, _measurement_style, None, True, False),
        ])
        self.meas_stack = self._page_with_empty(self.meas_table, "view-list-symbolic", "Inga mätningar",
                                                "Det finns inga mätningar för det här nätverket under perioden.")
        return self.meas_stack

    def _deviations_page(self):
        self.dev_table = Table([
            ("Tid", lambda d: fmt_table_time(d["epoch"]), None, lambda d: d["epoch"], False, False),
            ("Nätverk", lambda d: d["ssid"] or "–", None, lambda d: d["ssid"] or "", False, False),
            ("Mått", _deviation_metric, None, _deviation_metric, False, False),
            ("Uppmätt", lambda d: _deviation_value(d, "value"), None, lambda d: d["value"], False, True),
            ("Normalt", lambda d: _deviation_value(d, "baseline"), _dim, lambda d: d["baseline"], False, True),
            ("Ändring", _deviation_change, _direction_style, lambda d: d["change_percent"], False, True),
            ("Typ", lambda d: d["direction"].capitalize(), _direction_style, lambda d: d["direction"], True, False),
        ])
        self.dev_stack = self._page_with_empty(self.dev_table, "emblem-ok-symbolic", "Inga avvikelser",
                                               "Hastigheten har hållit sig normal under perioden.")
        return self.dev_stack

    # ---------- läge och data ----------

    def selected_network(self):
        item = self.network_drop.get_selected_item()
        value = item.get_string() if item else ALL_NETWORKS
        return None if value == ALL_NETWORKS else value

    def selected_period(self):
        return PERIODS[self.period_index][1]

    def _set_period(self, index):
        if index == self.period_index:
            return
        self.period_index = index
        self.period_buttons[index].set_active(True)
        self.period_drop.set_selected(index)
        self.reload(force=True)

    def _on_period_toggle(self, button, index):
        if button.get_active():
            self._set_period(index)

    def _on_period_drop(self, drop, _pspec):
        if drop.get_selected() < len(PERIODS):
            self._set_period(drop.get_selected())

    def _read_ssid(self):
        if self.ssid_thread and self.ssid_thread.is_alive():
            return

        def work():
            ssid = network.current_ssid()
            GLib.idle_add(self._got_ssid, ssid)

        self.ssid_thread = threading.Thread(target=work, daemon=True)
        self.ssid_thread.start()

    def _got_ssid(self, ssid):
        if ssid != self.ssid:
            self.ssid = ssid
            self.update_status()
        return False

    def _tick(self):
        self.ticks += 1
        if self.ticks % 3 == 0:
            self._read_ssid()
        self.reload()
        if self.ticks % PERIOD_REFRESH_TICKS == 0:
            self._move_period()
        return True

    def _move_period(self):
        """Flyttar fram perioden (24 timmar osv.) fast inget nytt har mätts. Tabellerna läses
        bara om när en rad har hamnat utanför perioden, så att man inte tappar sin plats i dem."""
        period = self.selected_period()
        if period is None:
            return
        since = time.time() - period
        if self.oldest_shown is not None and self.oldest_shown < since:
            self.reload(force=True)
        else:
            self.chart.set_range(since, time.time())

    def _config_stamp(self):
        try:
            return config.config_path().stat().st_mtime_ns
        except OSError:
            return None

    def reload(self, force=False):
        """Läser om status, inställningar och (om något ändrats) mätningarna."""
        self.daemon = status.read()
        stamp = self._config_stamp()
        if stamp != self.cfg_stamp:
            self.cfg_stamp = stamp
            self.cfg = config.load()
            force = True
        alive = status.is_alive(self.daemon, self.cfg)
        if alive:
            self.silent_since = None
        elif self.silent_since is None:
            self.silent_since = time.monotonic()
        # visa "tjänsten kör inte" först när den varit tyst en stund (t.ex. direkt efter viloläge)
        grace = max(SERVICE_GRACE_SECONDS, self.cfg["check_network_seconds"] + 15)
        if alive:
            self.alive = True
        else:
            # en tjänst som stoppats räknas som stoppad direkt, om den inte nyss har ombetts starta
            now = time.monotonic()
            recently_started = now - self.start_requested < grace
            self.alive = now - self.silent_since < grace and (recently_started or not self.daemon.get("stopped"))
        signature = self.db.signature()
        if force or signature != self.signature:
            self.signature = signature
            self._update_networks()
            self._update_data()
        self.update_status()

    def _update_networks(self):
        networks = self.db.networks()
        for net in self.cfg["networks"]:
            if not any(net.casefold() == n.casefold() for n in networks):
                networks.append(net)
        if networks == self.networks:
            return
        current = self.selected_network()
        self.networks = networks
        self.network_model.splice(0, self.network_model.get_n_items(), [ALL_NETWORKS] + networks)
        self.network_drop.set_selected(networks.index(current) + 1 if current in networks else 0)

    def _update_data(self):
        net = self.selected_network()
        period = self.selected_period()
        now = time.time()
        since = now - period if period else None
        measurements = self.db.measurements(ssid=net, since=since)
        self.oldest_shown = min((m["epoch"] for m in measurements), default=None)
        deviations = self.db.deviations(ssid=net, since=since)
        by_measurement = {}
        for d in deviations:
            by_measurement.setdefault(d["measurement_id"], []).append(d)
        for m in measurements:
            m["devs"] = by_measurement.get(m["id"], [])

        self.meas_table.set_rows(measurements)
        self.meas_stack.set_visible_child_name("table" if measurements else "empty")
        self.dev_table.set_rows(deviations)
        self.dev_stack.set_visible_child_name("table" if deviations else "empty")

        has_any = self.signature[0] > 0
        self.overview_stack.set_visible_child_name("content" if has_any else "empty")
        self.filter_bar.set_visible(has_any)
        watched = ", ".join(self.cfg["networks"]) or "ett bevakat nätverk"
        self.empty_page.set_description(GLib.markup_escape_text(
            f"Fartvakt mäter automatiskt när datorn är ansluten till {watched}. Du kan också mäta direkt."))

        ok = [m for m in measurements if not m.get("error")]
        self._update_tiles(ok[0] if ok else None)
        points = [dict(m, deviating={d["metric"] for d in m["devs"]}) for m in ok]
        start = since if since else (ok[-1]["epoch"] if ok else now - 3600)
        end = now if since else (ok[0]["epoch"] if ok else now)
        self.chart.set_data(points, start, end, max_gap=max(1200, self.cfg["interval_minutes"] * 60 * 3))

        self.stats["count"].set_text(str(len(measurements)))
        self.stats["ok"].set_text(f"{round(100 * len(ok) / len(measurements))} %" if measurements else "–")
        self.stats["deviations"].set_text(str(sum(1 for m in measurements if m["devs"])))
        median, _ = analysis.baseline(ok, "download_mbps")
        self.stats["median"].set_text(f"{analysis.fmt_number(median)} Mbit/s" if median is not None else "–")
        self._update_recent(deviations[:5])

    def _update_tiles(self, latest):
        history = []
        if latest:
            history = [h for h in self.db.history(latest["ssid"], self.cfg["baseline_count"] + 1)
                       if h["id"] != latest["id"]][: self.cfg["baseline_count"]]
        for key, (value, normal, pill) in self.tiles.items():
            _name, unit, higher_is_better, _ = analysis.METRICS[key]
            value.set_text(analysis.fmt_number(latest[key]) if latest else "–")
            base, n = analysis.baseline(history, key)
            pill.set_visible(False)
            if not latest:
                normal.set_text("Ingen lyckad mätning under perioden")
                continue
            if base is None or n < self.cfg["min_baseline"]:
                normal.set_text(f"Normalvärdet räknas fram efter {self.cfg['min_baseline']} mätningar")
                continue
            normal.set_text(f"Normalt {analysis.fmt_number(base)} {unit} på {latest['ssid'] or 'okänt nätverk'}")
            if base > 0:
                change = (latest[key] - base) / base * 100
                deviating = key in {d["metric"] for d in latest.get("devs", [])}
                better = (change > 0) == higher_is_better
                pill.set_text(f"{'+' if change >= 0 else '−'}{analysis.fmt_number(abs(change), 0)} %")
                for c in ("good", "bad", "neutral"):
                    pill.remove_css_class(c)
                pill.add_css_class(("good" if better else "bad") if deviating else "neutral")
                pill.set_tooltip_text(f"Jämfört med normalvärdet ({analysis.fmt_number(base)} {unit})")
                pill.set_visible(True)

    def _update_recent(self, deviations):
        self.recent.remove_all()
        if not deviations:
            row = Adw.ActionRow(title="Inga avvikelser under perioden",
                                subtitle="Hastigheten har hållit sig inom det normala.")
            row.add_prefix(Gtk.Image(icon_name="emblem-ok-symbolic", css_classes=["success"]))
            self.recent.append(row)
            return
        icons = {"sämre": "go-down-symbolic", "bättre": "go-up-symbolic", "avbrott": "network-error-symbolic"}
        for d in deviations:
            where = f"{fmt_when(d['epoch'])} · {d['ssid'] or 'okänt nätverk'}"
            row = Adw.ActionRow(title=GLib.markup_escape_text(analysis.describe(d)), title_lines=2,
                                subtitle=GLib.markup_escape_text(where))
            row.add_prefix(Gtk.Image(icon_name=icons.get(d["direction"], "dialog-warning-symbolic"),
                                     css_classes=[_direction_style(d)]))
            self.recent.append(row)

    def current_phase(self):
        if self.own_phase:
            return self.own_phase
        # lita bara på tjänstens "mäter" om en mätning faktiskt pågår (den kan ha stoppats mitt i)
        if self.alive and self.daemon.get("measuring") and monitor.is_busy():
            return self.daemon["measuring"]
        return None

    def update_status(self):
        now = time.time()
        phase = self.current_phase()
        ssid = self.ssid if self.ssid is not None or not self.alive else self.daemon.get("ssid")
        icon, title, subtitle, style, action = overview_state(self.cfg, ssid, self.daemon, self.alive, phase, now)
        self.login_button.set_visible(action == "login")
        self.hero_title.set_text(title)
        self.hero_subtitle.set_text(subtitle)
        for c in ("success", "accent", "warning", "dim"):
            self.hero_icon_box.remove_css_class(c)
        self.hero_icon_box.add_css_class(style)
        self.hero_icon.set_from_icon_name(icon)
        self.hero_icon.set_visible(not phase)
        self.hero_spinner.set_visible(bool(phase))
        self.hero_spinner.set_spinning(bool(phase))
        last = self.db.last()
        if last:
            result = ("misslyckades" if last.get("error") else
                      f"{analysis.fmt_number(last['download_mbps'])} Mbit/s ned, "
                      f"{analysis.fmt_number(last['upload_mbps'])} upp")
            self.hero_last.set_text(f"Senaste mätningen {fmt_when(last['epoch'], now)} på "
                                    f"{last['ssid'] or 'okänt nätverk'}: {result}")
        self.hero_last.set_visible(bool(last))

        self.measure_action.set_enabled(not phase)
        self.measure_spinner.set_visible(bool(phase))
        self.measure_spinner.set_spinning(bool(phase))
        self.measure_label.set_text("Mäter …" if phase else "Mät nu")
        self.measure_button.set_tooltip_text(PHASES.get(phase, "Mäter") if phase else "Mät hastigheten nu (Ctrl+M)")
        self.banner.set_revealed(not self.alive and self.cfg["monitoring_enabled"])

    # ---------- handlingar ----------

    def toast(self, text, button=None, callback=None, timeout=4):
        toast = Adw.Toast(title=GLib.markup_escape_text(text), timeout=timeout)
        if button:
            toast.set_button_label(button)
            toast.connect("button-clicked", lambda *_: callback())
        self.toasts.add_toast(toast)

    def on_measure(self, *_args):
        if self.current_phase():
            return
        if monitor.is_busy():
            self.toast("En mätning pågår redan i bakgrunden")
            return
        self.own_phase = "ping"
        self.update_status()
        threading.Thread(target=self._measure_worker, daemon=True).start()

    def _measure_worker(self):
        result, problem = None, None
        try:
            storage = Storage(config.db_path())
            try:
                result = monitor.measure_and_store(
                    config.load(), network.current_ssid(), storage, "manuell",
                    send_notification=lambda *_: None,
                    progress=lambda phase: GLib.idle_add(self._set_phase, phase),
                    current_ssid=network.current_ssid)
            finally:
                storage.close()
        except monitor.Busy:
            problem = "En mätning pågår redan i bakgrunden"
        except monitor.NetworkChanged:
            problem = "Datorn bytte nätverk under mätningen, så resultatet sparades inte"
        except Exception as e:  # noqa: BLE001 – visas för användaren
            problem = f"Mätningen kunde inte göras: {e}"
        GLib.idle_add(self._measure_done, result, problem)

    def _set_phase(self, phase):
        if self.own_phase:
            self.own_phase = phase
            self.update_status()
        return False

    def _measure_done(self, result, problem):
        self.own_phase = None
        self.reload(force=True)
        if problem:
            self.toast(problem)
            return False
        m, deviations = result
        if m.get("error"):
            self.toast(f"Mätningen misslyckades: {m['error']}", timeout=8)
        elif deviations:
            self.toast(analysis.describe(deviations[0]), "Visa", self.on_show_deviations, timeout=8)
        else:
            self.toast(f"Klart: {analysis.fmt_number(m['download_mbps'])} Mbit/s ned, "
                       f"{analysis.fmt_number(m['upload_mbps'])} Mbit/s upp, ping {analysis.fmt_number(m['ping_ms'])} ms")
        return False

    def on_login(self, *_args):
        Gtk.UriLauncher(uri=LOGIN_URL).launch(self, None, None)

    def on_show_deviations(self, *_args):
        self.stack.set_visible_child_name("avvikelser")

    def on_start_service(self, *_args):
        self.start_requested = time.monotonic()
        def work():
            ok = service.ensure_running()
            GLib.idle_add(self._service_started, ok)

        threading.Thread(target=work, daemon=True).start()

    def _service_started(self, ok):
        if ok:
            self.silent_since = time.monotonic()  # ge tjänsten tid att höra av sig
            self.banner.set_revealed(False)
            self.toast("Bakgrundsbevakningen är startad")
        else:
            self.toast("Kunde inte starta bakgrundsbevakningen (systemctl --user start fartvakt)", timeout=8)
        return False

    def on_export(self, *_args):
        dialog = Gtk.FileDialog(title="Exportera mätningar", initial_name="fartvakt-matningar.csv", modal=True)
        csv_filter = Gtk.FileFilter(name="CSV-filer")
        csv_filter.add_pattern("*.csv")
        filters = Gio.ListStore(item_type=Gtk.FileFilter)
        filters.append(csv_filter)
        dialog.set_filters(filters)
        dialog.save(self, None, self._export_chosen)

    def _export_chosen(self, dialog, result):
        try:
            file = dialog.save_finish(result)
        except GLib.Error:
            return  # avbrutet
        path = file.get_path()
        if not path:
            self.toast("Välj en mapp på datorn", timeout=6)
            return
        try:
            count = self.db.export_csv(path)
        except OSError as e:
            self.toast(f"Kunde inte spara filen: {e.strerror or e}", timeout=8)
            return
        self.toast(f"Exporterade {count} mätningar till {Path(path).name}", "Öppna",
                   lambda: Gtk.FileLauncher(file=file).launch(self, None, None))

    def on_preferences(self, *_args):
        from .preferences import PreferencesDialog

        PreferencesDialog(self).present(self)

    def preferences_changed(self):
        self.cfg_stamp = None
        self.reload(force=True)

    def _on_close(self, *_args):
        GLib.source_remove(self.tick_id)
        return False


class Application(Adw.Application):
    def __init__(self):
        super().__init__(application_id=APP_ID, flags=Gio.ApplicationFlags.DEFAULT_FLAGS)
        GLib.set_application_name("Fartvakt")

    def do_startup(self):
        Adw.Application.do_startup(self)
        provider = Gtk.CssProvider()
        provider.load_from_string(CSS)
        Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), provider,
                                                  Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
        source_icons = Path(__file__).resolve().parents[2] / "packaging" / "icons"
        if source_icons.is_dir():  # körs från källkoden, inte installerad
            Gtk.IconTheme.get_for_display(Gdk.Display.get_default()).add_search_path(str(source_icons))
        Gtk.Window.set_default_icon_name(APP_ID)

        for name, callback in (("about", self.on_about), ("shortcuts", self.on_shortcuts),
                               ("quit", lambda *_: self.quit())):
            action = Gio.SimpleAction.new(name, None)
            action.connect("activate", callback)
            self.add_action(action)
        self.set_accels_for_action("win.measure", ["<Control>m", "F5"])
        self.set_accels_for_action("win.export", ["<Control>e"])
        self.set_accels_for_action("win.preferences", ["<Control>comma"])
        self.set_accels_for_action("app.shortcuts", ["<Control>question"])
        self.set_accels_for_action("app.quit", ["<Control>q"])
        self.set_accels_for_action("window.close", ["<Control>w"])

    def do_activate(self):
        window = self.get_active_window()
        if window is None:
            try:
                window = Window(self)
            except Exception as e:  # noqa: BLE001 – visa felet i stället för att bli en osynlig process
                window = error_window(self, e)
        window.present()

    def on_about(self, *_args):
        about = Adw.AboutDialog(
            application_name="Fartvakt",
            application_icon=APP_ID,
            version=__version__,
            developer_name="Felix Arvid",
            copyright="© 2026 Felix Arvid",
            license_type=Gtk.License.MIT_X11,
            website=WEBSITE,
            comments="Mäter internethastigheten automatiskt på de wifi-nätverk du väljer och noterar "
                     "när den avviker från det normala.",
        )
        about.add_legal_section("Hastighetstestet", "Mätningarna görs mot Cloudflares öppna testserver "
                                "speed.cloudflare.com.", Gtk.License.CUSTOM, None)
        about.present(self.get_active_window())

    def on_shortcuts(self, *_args):
        dialog = Adw.Dialog(title="Tangentbordsgenvägar", content_width=420)
        toolbar = Adw.ToolbarView()
        toolbar.add_top_bar(Adw.HeaderBar())
        group = Adw.PreferencesGroup(margin_top=12, margin_bottom=24, margin_start=24, margin_end=24)
        for keys, text in (("Ctrl+M", "Mät nu"), ("Ctrl+E", "Exportera som CSV"), ("Ctrl+,", "Inställningar"),
                           ("Ctrl+?", "Tangentbordsgenvägar"), ("Ctrl+W", "Stäng fönstret"),
                           ("Ctrl+Q", "Avsluta")):
            row = Adw.ActionRow(title=text)
            row.add_suffix(_label(keys, ["dim-label", "numeric"]))
            group.add(row)
        toolbar.set_content(group)
        dialog.set_child(toolbar)
        dialog.present(self.get_active_window())


def error_window(app, error):
    window = Adw.ApplicationWindow(application=app, title="Fartvakt", default_width=520, default_height=420)
    toolbar = Adw.ToolbarView()
    toolbar.add_top_bar(Adw.HeaderBar())
    toolbar.set_content(Adw.StatusPage(
        icon_name="dialog-error-symbolic", title="Fartvakt kunde inte starta",
        description=GLib.markup_escape_text(f"{error}\n\nMätningarna finns i {config.data_dir()}.")))
    window.set_content(toolbar)
    return window


def main():
    if not os.environ.get("DISPLAY") and not os.environ.get("WAYLAND_DISPLAY"):
        print("Fartvakt behöver en grafisk miljö. Se `fartvakt --help` för kommandoraden.", file=sys.stderr)
        return 1
    return Application().run([sys.argv[0]])
