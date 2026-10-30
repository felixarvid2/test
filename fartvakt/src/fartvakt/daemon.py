"""Bakgrundstjänsten: mäter automatiskt så länge datorn är ansluten till ett bevakat nätverk."""

import signal
import sys
import time

from . import analysis, config, monitor, network, status
from .storage import Storage

# Väntetid efter att man anslutit, så att DHCP, DNS och eventuell inloggningssida hinner bli klara.
SETTLE_SECONDS = 15
# Hur ofta det kontrolleras om man har loggat in, när nätverket kräver inloggning i webbläsaren.
PORTAL_RETRY_SECONDS = 30


def log(msg):
    print(msg, flush=True)


def boot_clock():
    """Sekunder sedan uppstart, inklusive viloläge (till skillnad från time.monotonic)."""
    return time.clock_gettime(time.CLOCK_BOOTTIME)


class Watcher:
    def __init__(self, storage, now=boot_clock, current_ssid=network.current_ssid,
                 measure=monitor.measure_and_store, publish=status.write, connectivity=network.connectivity,
                 notify=monitor.notify):
        self.storage = storage
        self.now = now
        self.current_ssid = current_ssid
        self.measure = measure
        self.publish = publish
        self.connectivity = connectivity
        self.notify = notify
        self.portal = False
        self.ssid = None
        self.active_ssid = None
        self.next_due = None
        self.last_run = None

    def state(self, cfg, phase=None):
        next_due = None
        if self.active_ssid and self.next_due is not None:
            next_due = time.time() + max(0.0, self.next_due - self.now())
        return {
            "ssid": self.ssid,
            "watched": self.active_ssid,
            "enabled": cfg["monitoring_enabled"],
            "next_due": next_due,
            "measuring": phase,
            "portal": bool(self.active_ssid and self.portal),
        }

    def tick(self, cfg):
        """Ett varv i bevakningen. Returnerar mätningen om en gjordes, annars None."""
        self.ssid = self.current_ssid()
        watched = self.ssid if cfg["monitoring_enabled"] and network.matches(self.ssid, cfg["networks"]) else None
        if watched != self.active_ssid:
            if watched:
                log(f"Ansluten till {watched} – mäter om {SETTLE_SECONDS} s och sedan var "
                    f"{cfg['interval_minutes']}:e minut")
                self.next_due = self.now() + SETTLE_SECONDS
            elif self.active_ssid:
                log(f"Lämnade {self.active_ssid} – mätningarna pausas")
                self.next_due = None
            self.last_run = None
            self.portal = False
            self.active_ssid = watched
        if watched and self.last_run is not None:
            # ett ändrat intervall i inställningarna gäller direkt, räknat från förra mätningen
            self.next_due = self.last_run + cfg["interval_minutes"] * 60
        if not watched or self.now() < self.next_due:
            self.publish(self.state(cfg))
            return None
        # Kräver nätverket inloggning i webbläsaren? Då väntar vi i stället för att fylla
        # historiken med misslyckade mätningar, och mäter direkt när man har loggat in.
        if self.connectivity(check=self.portal) == "portal":
            if not self.portal:
                log(f"{watched} kräver inloggning i webbläsaren – väntar med att mäta")
                if cfg["notifications"]:
                    self.notify(f"Logga in på {watched}",
                                "Nätverket kräver inloggning i webbläsaren. Fartvakt mäter så fort du är inloggad.")
            self.portal = True
            self.last_run = None
            self.next_due = self.now() + PORTAL_RETRY_SECONDS
            self.publish(self.state(cfg))
            return None
        try:
            m, deviations = self.measure(cfg, watched, self.storage, "auto",
                                         progress=lambda phase: self.publish(self.state(cfg, phase)))
        except monitor.Busy:
            self.publish(self.state(cfg))
            return None  # en mätning från appen pågår; försöker igen vid nästa varv
        self.portal = bool(m.get("portal"))
        self.last_run = self.now()
        self.next_due = self.last_run + cfg["interval_minutes"] * 60
        self.publish(self.state(cfg))
        if m.get("error"):
            log(f"Mätning misslyckades: {m['error']}")
        else:
            log(f"Mätning: ned {m['download_mbps']} Mbit/s, upp {m['upload_mbps']} Mbit/s, ping {m['ping_ms']} ms")
        for d in deviations:
            log(f"AVVIKELSE: {analysis.describe(d)}")
        return m

    def sleep_seconds(self, cfg):
        wait = cfg["check_network_seconds"]
        if self.active_ssid and self.next_due is not None:
            wait = min(wait, max(1.0, self.next_due - self.now()))
        return wait


def run():
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    storage = Storage(config.db_path())
    watcher = Watcher(storage)
    log(f"Fartvakt startad. Databas: {config.db_path()}")
    while True:
        cfg = config.load()  # läses om varje varv så att ändringar i appen gäller direkt
        try:
            watcher.tick(cfg)
        except Exception as e:  # noqa: BLE001 – tjänsten ska aldrig dö på ett enskilt fel
            log(f"Fel: {e!r}")
        time.sleep(watcher.sleep_seconds(cfg))
