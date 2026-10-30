"""En mätning från början till slut: mät, spara, leta avvikelser, avisera."""

import fcntl
import subprocess
from contextlib import contextmanager
from datetime import datetime

from . import APP_ID, analysis, config, speedtest


class Busy(Exception):
    """En annan mätning pågår redan (t.ex. startad från appen)."""


class NetworkChanged(Exception):
    """Datorn bytte nätverk under mätningen, så resultatet hör inte till något nätverk."""


@contextmanager
def measurement_lock():
    path = config.data_dir() / "matning.lock"
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        try:
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Busy() from None
        try:
            yield
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)


def is_busy() -> bool:
    """Pågår en mätning just nu (i appen eller i bakgrunden)?"""
    path = config.data_dir() / "matning.lock"
    try:
        with open(path) as f:
            try:
                fcntl.flock(f, fcntl.LOCK_SH | fcntl.LOCK_NB)
            except BlockingIOError:
                return True
            fcntl.flock(f, fcntl.LOCK_UN)
    except OSError:
        pass
    return False


def notify(title, body):
    try:
        subprocess.run(["notify-send", "--app-name=Fartvakt", f"--icon={APP_ID}",
                        f"--hint=string:desktop-entry:{APP_ID}", title, body],
                       capture_output=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        pass


def same_network(a, b):
    return (a or "").casefold() == (b or "").casefold()


def measure_and_store(cfg, ssid, storage, source="auto", run_test=None, send_notification=None,
                      progress=None, current_ssid=None):
    """Returnerar (mätning, avvikelser). Kastar Busy om en annan mätning pågår och
    NetworkChanged om `current_ssid()` visar att datorn bytt nätverk under mätningen
    (då sparas ingenting)."""
    run_test = run_test or speedtest.run
    send_notification = send_notification or notify
    with measurement_lock():
        m = {"ts": datetime.now().astimezone().isoformat(timespec="seconds"), "ssid": ssid, "source": source}
        try:
            m.update(run_test(cfg, progress))
        except speedtest.SpeedTestError as e:
            m["error"] = str(e)
            m["portal"] = isinstance(e, speedtest.CaptivePortal)
        if current_ssid is not None:
            now_on = current_ssid()
            if not same_network(now_on, ssid):
                raise NetworkChanged(now_on)
        previous = storage.last(ssid)
        history = storage.history(ssid, cfg["baseline_count"])
        deviations = analysis.find_deviations(m, history, cfg["threshold_percent"], cfg["min_baseline"])
        m["id"] = storage.add_measurement(m, deviations)

    # Ett avbrott aviseras bara första gången, inte vid varje misslyckad mätning i rad.
    repeated_failure = m.get("error") and previous and previous.get("error")
    if deviations and cfg["notifications"] and not repeated_failure:
        where = f" på {ssid}" if ssid else ""
        if m.get("portal"):
            title, body = (f"Logga in på {ssid}" if ssid else "Logga in på nätverket",
                           "Nätverket kräver inloggning i webbläsaren. Fartvakt mäter så fort du är inloggad.")
        elif m.get("error"):
            title, body = f"Ingen internetanslutning{where}", f"Mätningen misslyckades: {m['error']}"
        else:
            title, body = f"Avvikande hastighet{where}", "\n".join(analysis.describe(d) for d in deviations)
        send_notification(title, body)
    return m, deviations
