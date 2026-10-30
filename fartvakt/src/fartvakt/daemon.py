"""Bakgrundstjänsten: mäter automatiskt så länge datorn är ansluten till ett bevakat nätverk."""

import signal
import sys
import time

from . import analysis, config, monitor, network, status
from .storage import Storage

# Väntetid efter att man anslutit (eller väckt datorn), så att DHCP, DNS och eventuell
# inloggningssida hinner bli klara.
SETTLE_SECONDS = 15
# Hur ofta det kontrolleras om man har loggat in, när nätverket kräver inloggning i webbläsaren.
PORTAL_RETRY_SECONDS = 30
# Paus efter ett oväntat fel (t.ex. full disk), så att tjänsten inte mäter om och om igen.
ERROR_RETRY_SECONDS = 300


def log(msg):
    print(msg, flush=True)


def boot_clock():
    """Sekunder sedan uppstart, inklusive viloläge (till skillnad från time.monotonic)."""
    return time.clock_gettime(time.CLOCK_BOOTTIME)


def awake_clock():
    """Sekunder sedan uppstart, utan viloläge."""
    return time.clock_gettime(time.CLOCK_MONOTONIC)


class Watcher:
    def __init__(self, storage, now=boot_clock, awake=awake_clock, current_ssid=network.current_ssid,
                 measure=monitor.measure_and_store, publish=status.write, connectivity=network.connectivity,
                 traffic_device=network.traffic_device, notify=monitor.notify):
        self.storage = storage
        self.now = now
        self.awake = awake
        self.current_ssid = current_ssid
        self.measure = measure
        self.publish = publish
        self.connectivity = connectivity
        self.traffic_device = traffic_device
        self.notify = notify
        self.ssid = None
        self.active_ssid = None
        self.next_due = None
        self.last_run = None
        self.hold_until = 0.0  # tidigast nästa mätning efter viloläge eller fel
        self.portal = False
        self.other_route = None
        self.last_tick = None

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
            "other_route": self.other_route if self.active_ssid else None,
        }

    def _woke_up(self):
        """Har datorn legat i viloläge sedan förra varvet? (Boot-klockan räknar vilan, den andra inte.)"""
        now, awake = self.now(), self.awake()
        slept = False
        if self.last_tick is not None:
            slept = (now - self.last_tick[0]) - (awake - self.last_tick[1]) > 30
        self.last_tick = (now, awake)
        return slept

    def _wait(self, cfg, seconds):
        self.next_due = self.now() + seconds
        self.publish(self.state(cfg))

    def tick(self, cfg):
        """Ett varv i bevakningen. Returnerar mätningen om en gjordes, annars None."""
        woke = self._woke_up()
        self.ssid = self.current_ssid()
        watched = self.ssid if cfg["monitoring_enabled"] and network.matches(self.ssid, cfg["networks"]) else None
        if watched != self.active_ssid:
            if watched:
                log(f"Ansluten till {watched} – mäter om {SETTLE_SECONDS} s och sedan var "
                    f"{cfg['interval_minutes']}:e minut")
            elif self.active_ssid:
                log(f"Lämnade {self.active_ssid} – mätningarna pausas")
            self.next_due = self.now() + SETTLE_SECONDS if watched else None
            self.last_run = None
            self.portal = False
            self.other_route = None
            self.active_ssid = watched
        elif watched and woke:
            log("Datorn har vaknat – väntar in nätverket innan nästa mätning")
            self.hold_until = self.now() + SETTLE_SECONDS
            self.next_due = max(self.next_due or 0.0, self.hold_until)
        elif watched and self.last_run is not None:
            # ett ändrat intervall i inställningarna gäller direkt, räknat från förra mätningen
            self.next_due = max(self.last_run + cfg["interval_minutes"] * 60, self.hold_until)
        if not watched or self.now() < self.next_due:
            self.publish(self.state(cfg))
            return None
        return self._measure(cfg, watched)

    def _measure(self, cfg, watched):
        # Går trafiken via kabel eller VPN mäts inte wifi-nätverket – vänta tills den går via wifi.
        device, wireless = self.traffic_device()
        if wireless is False:
            if self.other_route != device:
                log(f"Internettrafiken går via {device}, inte via wifi – mäter inte {watched} just nu")
            self.other_route = device
            return self._wait(cfg, cfg["check_network_seconds"])
        self.other_route = None

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
            return self._wait(cfg, PORTAL_RETRY_SECONDS)

        try:
            m, deviations = self.measure(cfg, watched, self.storage, "auto",
                                         progress=lambda phase: self.publish(self.state(cfg, phase)),
                                         current_ssid=self.current_ssid)
        except monitor.Busy:
            # en mätning från appen pågår just nu – den räknas som periodens mätning
            self.last_run = self.now()
            self.hold_until = 0.0
            self.next_due = self.last_run + cfg["interval_minutes"] * 60
            self.publish(self.state(cfg))
            return None
        except monitor.NetworkChanged as e:
            log(f"Bytte nätverk under mätningen (till {e.args[0] or 'inget'}) – resultatet sparas inte")
            self.publish(self.state(cfg))
            return None
        except Exception as e:  # noqa: BLE001 – t.ex. full disk eller låst databas
            log(f"Mätningen kunde inte sparas: {e!r} – försöker igen om {ERROR_RETRY_SECONDS // 60} min")
            self.last_run = self.now()
            self.hold_until = self.now() + ERROR_RETRY_SECONDS
            self._wait(cfg, ERROR_RETRY_SECONDS)
            return None
        self.portal = bool(m.get("portal"))
        self.last_run = self.now()
        self.hold_until = 0.0
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
    cfg = config.load()
    while True:
        try:
            cfg = config.load()  # läses om varje varv så att ändringar i appen gäller direkt
            watcher.tick(cfg)
        except Exception as e:  # noqa: BLE001 – tjänsten ska aldrig dö på ett enskilt fel
            log(f"Fel: {e!r}")
        time.sleep(watcher.sleep_seconds(cfg))
