"""Texter som visas i appen (utan GTK, så att de går att testa)."""

from datetime import datetime, timedelta

from . import network
from .analysis import fmt_number
from .plotting import WEEKDAYS

MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"]
PHASES = {"ping": "Mäter ping", "ned": "Mäter nedladdning", "upp": "Mäter uppladdning"}


def fmt_when(epoch, now=None):
    """'10:25', 'i går 10:25', 'ons 28/10 10:25' eller '28 okt 2025 10:25'."""
    dt = datetime.fromtimestamp(epoch)
    today = datetime.fromtimestamp(now if now is not None else datetime.now().timestamp()).date()
    clock = dt.strftime("%H:%M")
    if dt.date() == today:
        return clock
    if dt.date() == today - timedelta(days=1):
        return f"i går {clock}"
    if dt.year == today.year:
        return f"{WEEKDAYS[dt.weekday()]} {dt.day}/{dt.month} {clock}"
    return f"{dt.day} {MONTHS[dt.month - 1]} {dt.year} {clock}"


def fmt_table_time(epoch):
    """Sorterbar och entydig tid för tabellerna: 'tor 2026-10-29 10:25'."""
    dt = datetime.fromtimestamp(epoch)
    return f"{WEEKDAYS[dt.weekday()]} {dt:%Y-%m-%d %H:%M}"


def fmt_until(seconds):
    if seconds < 60:
        return "om mindre än en minut"
    minutes = round(seconds / 60)
    if minutes < 60:
        return f"om {minutes} min"
    hours, rest = divmod(minutes, 60)
    return f"om {hours} h {rest} min" if rest else f"om {hours} h"


def fmt_bytes(n):
    if n >= 1_000_000_000:
        return f"{fmt_number(n / 1_000_000_000)} GB"
    return f"{n / 1_000_000:.0f} MB"


def data_usage(cfg):
    """En mening om hur mycket data mätningarna använder."""
    per = cfg["download_bytes"] + cfg["upload_bytes"]
    per_hour = per * 60 / cfg["interval_minutes"]
    every = "varje minut" if cfg["interval_minutes"] == 1 else f"var {cfg['interval_minutes']}:e minut"
    return (f"Varje mätning använder upp till {fmt_bytes(per)}, alltså högst {fmt_bytes(per_hour)} i timmen "
            f"när du mäter {every}.")


def overview_state(cfg, ssid, daemon, alive, phase, now):
    """Rubriken överst i översikten: (ikon, rubrik, underrubrik, stil).

    `daemon` är bakgrundstjänstens status (se status.py), `alive` om den kör och
    `phase` en pågående mätning ("ping", "ned", "upp") eller None."""
    if phase:
        return ("content-loading-symbolic", PHASES.get(phase, "Mäter") + " …",
                f"Mätningen tar upp till en halv minut{' på ' + ssid if ssid else ''}.", "accent")
    networks = cfg["networks"]
    watched = ", ".join(networks)
    if not networks:
        return ("dialog-information-symbolic", "Inga nätverk valda",
                "Lägg till ett wifi-nätverk i inställningarna så mäter Fartvakt automatiskt där.", "warning")
    if not cfg["monitoring_enabled"]:
        return ("media-playback-pause-symbolic", "Automatisk mätning är avstängd",
                f"Slå på den i inställningarna för att mäta på {watched}.", "dim")
    if network.matches(ssid, networks):
        if not alive:
            return ("dialog-warning-symbolic", f"Ansluten till {ssid}",
                    "Bakgrundsbevakningen är inte igång, så inga automatiska mätningar görs.", "warning")
        due = daemon.get("next_due")
        when = (fmt_until(due - now) if due and due > now else "strax") if daemon.get("watched") else "strax"
        return ("network-wireless-signal-good-symbolic", f"Bevakar {ssid}",
                f"Nästa mätning {when} · var {cfg['interval_minutes']}:e minut", "success")
    where = f"Ansluten till {ssid}" if ssid else "Inte ansluten till något wifi"
    return ("network-wireless-offline-symbolic", "Väntar på ett bevakat nätverk",
            f"{where} · mäter automatiskt på {watched}", "dim")
