"""Bakgrundstjänsten: mäter automatiskt så länge datorn är ansluten till ett bevakat nätverk."""

import signal
import sys
import time

from . import analysis, config, monitor, network
from .storage import Storage


def log(msg):
    print(msg, flush=True)


class Watcher:
    def __init__(self, storage, now=time.monotonic, current_ssid=network.current_ssid,
                 measure=monitor.measure_and_store):
        self.storage = storage
        self.now = now
        self.current_ssid = current_ssid
        self.measure = measure
        self.active_ssid = None
        self.next_due = 0.0

    def tick(self, cfg):
        """Ett varv i bevakningen. Returnerar mätningen om en gjordes, annars None."""
        ssid = self.current_ssid() if cfg["monitoring_enabled"] else None
        watched = ssid if network.matches(ssid, cfg["networks"]) else None
        if watched != self.active_ssid:
            if watched:
                log(f"Ansluten till {watched} – börjar mäta var {cfg['interval_minutes']}:e minut")
                self.next_due = 0.0  # mät direkt när man kommer in på nätverket
            elif self.active_ssid:
                log(f"Lämnade {self.active_ssid} – mätningarna pausas")
            self.active_ssid = watched
        if not watched or self.now() < self.next_due:
            return None
        try:
            m, deviations = self.measure(cfg, watched, self.storage, "auto")
        except monitor.Busy:
            return None  # försöker igen vid nästa varv
        self.next_due = self.now() + cfg["interval_minutes"] * 60
        if m.get("error"):
            log(f"Mätning misslyckades: {m['error']}")
        else:
            log(f"Mätning: ned {m['download_mbps']} Mbit/s, upp {m['upload_mbps']} Mbit/s, ping {m['ping_ms']} ms")
        for d in deviations:
            log(f"AVVIKELSE: {analysis.describe(d)}")
        return m


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
        time.sleep(cfg["check_network_seconds"])
