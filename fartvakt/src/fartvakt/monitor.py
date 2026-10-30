"""En mätning från början till slut: mät, spara, leta avvikelser, avisera."""

import fcntl
import subprocess
from contextlib import contextmanager
from datetime import datetime

from . import analysis, config, speedtest


class Busy(Exception):
    """En annan mätning pågår redan (t.ex. startad från appen)."""


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


def notify(title, body):
    try:
        subprocess.run(["notify-send", "-a", "Fartvakt", "-i", "fartvakt", title, body],
                       capture_output=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        pass


def measure_and_store(cfg, ssid, storage, source="auto", run_test=speedtest.run, send_notification=notify):
    """Returnerar (mätning, avvikelser). Kastar Busy om en annan mätning pågår."""
    with measurement_lock():
        m = {"ts": datetime.now().astimezone().isoformat(timespec="seconds"), "ssid": ssid, "source": source}
        try:
            m.update(run_test(cfg))
        except speedtest.SpeedTestError as e:
            m["error"] = str(e)
        previous = storage.last(ssid)
        history = storage.history(ssid, cfg["baseline_count"])
        deviations = analysis.find_deviations(m, history, cfg["threshold_percent"], cfg["min_baseline"])
        m["id"] = storage.add_measurement(m)
        storage.add_deviations(m["id"], m, deviations)

    # Ett avbrott aviseras bara första gången, inte vid varje misslyckad mätning i rad.
    repeated_failure = m.get("error") and previous and previous.get("error")
    if deviations and cfg["notifications"] and not repeated_failure:
        title = f"Avvikande hastighet på {ssid}" if ssid else "Avvikande hastighet"
        send_notification(title, "\n".join(analysis.describe(d) for d in deviations))
    return m, deviations
