"""Texter som visas i appen (utan GTK, så att de går att testa)."""

from collections import namedtuple
from datetime import datetime, timedelta

from . import network
from .analysis import fmt_number
from .plotting import MONTHS, WEEKDAYS

PHASES = {"ping": "Mäter ping", "ned": "Mäter nedladdning", "upp": "Mäter uppladdning"}
LOGIN_URL = "http://neverssl.com/"  # okrypterad sida, så att nätverkets inloggningssida kan visas

State = namedtuple("State", "icon title subtitle style action")


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
    """Rubriken överst i översikten: State(ikon, rubrik, underrubrik, stil, knapp).
    `action` är "login" när nätverket kräver inloggning i webbläsaren, "watch" när datorn är
    ansluten till ett wifi som inte bevakas (knappen lägger till det), annars None.

    `daemon` är bakgrundstjänstens status (se status.py), `alive` om den kör och
    `phase` en pågående mätning ("ping", "ned", "upp") eller None."""
    if phase:
        return State("content-loading-symbolic", PHASES.get(phase, "Mäter") + " …",
                     f"Mätningen tar upp till en halv minut{' på ' + ssid if ssid else ''}.", "accent", None)
    networks = cfg["networks"]
    watched = ", ".join(networks)
    if not networks:
        if ssid:
            return State("dialog-information-symbolic", "Inga nätverk valda",
                         f"Vill du att Fartvakt mäter automatiskt på {ssid}?", "warning", "watch")
        return State("dialog-information-symbolic", "Inga nätverk valda",
                     "Lägg till ett wifi-nätverk i inställningarna så mäter Fartvakt automatiskt där.", "warning", None)
    if not cfg["monitoring_enabled"]:
        return State("media-playback-pause-symbolic", "Automatisk mätning är avstängd",
                     f"Slå på den i inställningarna för att mäta på {watched}.", "dim", None)
    if network.matches(ssid, networks):
        if not alive:
            return State("dialog-warning-symbolic", f"Ansluten till {ssid}",
                         "Bakgrundsbevakningen är inte igång, så inga automatiska mätningar görs.", "warning", None)
        if daemon.get("portal"):
            return State("dialog-password-symbolic", f"Logga in på {ssid}",
                         "Nätverket kräver inloggning i webbläsaren. Fartvakt mäter så fort du är inloggad.",
                         "warning", "login")
        if daemon.get("other_route"):
            return State("network-wired-symbolic", f"Ansluten till {ssid}, men trafiken går via {daemon['other_route']}",
                         "Fartvakt mäter inte medan kabel eller VPN används, eftersom mätningen då inte "
                         "skulle visa wifi-nätverkets hastighet.", "dim", None)
        due = daemon.get("next_due")
        when = (fmt_until(due - now) if due and due > now else "strax") if daemon.get("watched") else "strax"
        return State("network-wireless-signal-good-symbolic", f"Bevakar {ssid}",
                     f"Nästa mätning {when} · var {cfg['interval_minutes']}:e minut", "success", None)
    where = f"Ansluten till {ssid}" if ssid else "Inte ansluten till något wifi"
    return State("network-wireless-offline-symbolic", "Väntar på ett bevakat nätverk",
                 f"{where} · mäter automatiskt på {watched}", "dim", "watch" if ssid else None)
