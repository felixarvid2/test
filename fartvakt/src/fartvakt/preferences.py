"""Inställningar. Varje ändring sparas direkt och gäller även bakgrundstjänsten direkt."""

import gi

gi.require_version("Gtk", "4.0")
gi.require_version("Adw", "1")
from gi.repository import Adw, GLib, Gtk  # noqa: E402

from . import config, network  # noqa: E402
from .formatting import data_usage  # noqa: E402


class PreferencesDialog(Adw.PreferencesDialog):
    def __init__(self, window):
        super().__init__(title="Inställningar", search_enabled=False)
        self.window = window
        self.cfg = config.load()
        self.network_rows = []

        page = Adw.PreferencesPage(title="Bevakning", icon_name="network-wireless-symbolic")
        self.add(page)

        self.networks_group = Adw.PreferencesGroup(
            title="Bevakade nätverk",
            description="Fartvakt mäter automatiskt när datorn är ansluten till något av de här wifi-nätverken.")
        page.add(self.networks_group)
        self.add_row = Adw.EntryRow(title="Lägg till nätverk (namnet på wifi-nätverket)", show_apply_button=True)
        self.add_row.connect("apply", self._on_add_entry)
        self.current_row = Adw.ActionRow(title="", activatable=True)
        self.current_row.add_prefix(Gtk.Image(icon_name="list-add-symbolic"))
        self.current_row.connect("activated", self._on_add_current)
        self.current_ssid = window.ssid
        self._rebuild_networks()

        group = Adw.PreferencesGroup(title="Automatisk mätning")
        page.add(group)
        self.enabled = Adw.SwitchRow(title="Mät automatiskt", subtitle="När datorn är ansluten till ett bevakat nätverk",
                                     active=self.cfg["monitoring_enabled"])
        self.enabled.connect("notify::active", lambda row, _p: self._set("monitoring_enabled", row.get_active()))
        group.add(self.enabled)
        self.interval = self._spin(group, "Tid mellan mätningar", "Minuter", "interval_minutes", 1, 1440)

        group = Adw.PreferencesGroup(title="Avvikelser",
                                     description="En mätning jämförs med medianen av de senaste "
                                                 f"{self.cfg['baseline_count']} mätningarna på samma nätverk.")
        page.add(group)
        self._spin(group, "Gräns för avvikelse", "Procents skillnad mot det normala", "threshold_percent", 5, 95)
        notify = Adw.SwitchRow(title="Notiser", subtitle="Visa en notis när hastigheten avviker",
                               active=self.cfg["notifications"])
        notify.connect("notify::active", lambda row, _p: self._set("notifications", row.get_active()))
        group.add(notify)

        page = Adw.PreferencesPage(title="Mätning", icon_name="power-profile-performance-symbolic")
        self.add(page)
        self.usage_group = Adw.PreferencesGroup(title="Datamängd")
        page.add(self.usage_group)
        self._spin(self.usage_group, "Nedladdning per mätning", "Megabyte – mer data ger säkrare mätning på snabba nät",
                   "download_bytes", 1, 500, scale=1_000_000)
        self._spin(self.usage_group, "Uppladdning per mätning", "Megabyte", "upload_bytes", 1, 200, scale=1_000_000)
        self._update_usage()

        group = Adw.PreferencesGroup(title="Sparade mätningar")
        page.add(group)
        row = Adw.ActionRow(title="Databas", subtitle=GLib.markup_escape_text(str(config.db_path())),
                            subtitle_selectable=True)
        group.add(row)
        clear = Adw.ActionRow(title="Rensa alla mätningar", subtitle="Tar bort alla mätningar och avvikelser")
        button = Gtk.Button(label="Rensa …", valign=Gtk.Align.CENTER, css_classes=["destructive-action"])
        button.connect("clicked", self._on_clear)
        clear.add_suffix(button)
        group.add(clear)

    # ---------- hjälp ----------

    def _set(self, key, value):
        latest = config.load()  # bevara ändringar som gjorts någon annanstans under tiden
        latest[key] = value
        config.save(latest)
        self.cfg = latest
        self._update_usage()
        self.window.preferences_changed()

    def _spin(self, group, title, subtitle, key, low, high, scale=1):
        row = Adw.SpinRow.new_with_range(low, high, 1)
        row.set_title(title)
        row.set_subtitle(subtitle)
        row.set_value(max(low, min(high, self.cfg[key] // scale)))
        row.connect("notify::value", lambda r, _p: self._set(key, int(r.get_value()) * scale))
        group.add(row)
        return row

    def _update_usage(self):
        if hasattr(self, "usage_group"):
            self.usage_group.set_description(data_usage(self.cfg))

    # ---------- nätverk ----------

    def _rebuild_networks(self):
        for row in self.network_rows:
            self.networks_group.remove(row)
        self.network_rows = []
        for name in self.cfg["networks"]:
            row = Adw.ActionRow(title=GLib.markup_escape_text(name))
            row.add_prefix(Gtk.Image(icon_name="network-wireless-symbolic"))
            remove = Gtk.Button(icon_name="user-trash-symbolic", valign=Gtk.Align.CENTER,
                                tooltip_text=f"Sluta bevaka {name}", css_classes=["flat"])
            remove.connect("clicked", self._on_remove, name)
            row.add_suffix(remove)
            self.networks_group.add(row)
            self.network_rows.append(row)
        if not self.cfg["networks"]:
            row = Adw.ActionRow(title="Inga nätverk", subtitle="Lägg till minst ett nätverk för att mäta automatiskt")
            row.add_css_class("dim-label")
            self.networks_group.add(row)
            self.network_rows.append(row)
        show_current = self.current_ssid and not network.matches(self.current_ssid, self.cfg["networks"])
        if show_current:
            self.current_row.set_title(GLib.markup_escape_text(f"Lägg till {self.current_ssid}"))
            self.current_row.set_subtitle("Nätverket datorn är ansluten till nu")
            self.networks_group.add(self.current_row)
            self.network_rows.append(self.current_row)
        self.networks_group.add(self.add_row)
        self.network_rows.append(self.add_row)

    def _set_networks(self, networks):
        self._set("networks", networks)
        self._rebuild_networks()

    def _on_add_entry(self, row):
        name = row.get_text().strip()
        row.set_text("")
        if name and not network.matches(name, self.cfg["networks"]):
            self._set_networks(self.cfg["networks"] + [name])

    def _on_add_current(self, _row):
        if self.current_ssid and not network.matches(self.current_ssid, self.cfg["networks"]):
            self._set_networks(self.cfg["networks"] + [self.current_ssid])

    def _on_remove(self, _button, name):
        self._set_networks([n for n in self.cfg["networks"] if n != name])

    # ---------- rensa ----------

    def _on_clear(self, _button):
        count = self.window.db.signature()[0]
        dialog = Adw.AlertDialog(
            heading="Rensa alla mätningar?",
            body=f"Alla {count} mätningar och deras avvikelser tas bort för gott. Det går inte att ångra.")
        dialog.add_response("cancel", "Avbryt")
        dialog.add_response("clear", "Rensa")
        dialog.set_response_appearance("clear", Adw.ResponseAppearance.DESTRUCTIVE)
        dialog.set_default_response("cancel")
        dialog.set_close_response("cancel")
        dialog.connect("response", self._on_clear_response)
        dialog.present(self)

    def _on_clear_response(self, _dialog, response):
        if response == "clear":
            self.window.db.clear()
            self.window.preferences_changed()
            self.add_toast(Adw.Toast(title="Alla mätningar är borttagna"))
