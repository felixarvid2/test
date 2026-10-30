"""Styr bakgrundstjänsten (systemd användartjänst)."""

import subprocess

UNIT = "fartvakt.service"


def _ctl(*args):
    try:
        return subprocess.run(["systemctl", "--user", *args, UNIT], capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.SubprocessError):
        return None


def is_active() -> bool:
    r = _ctl("is-active")
    return bool(r) and r.stdout.strip() == "active"


def ensure_running() -> bool:
    """Startar tjänsten om den inte redan kör (t.ex. direkt efter installationen)."""
    if is_active():
        return True
    _ctl("start")
    return is_active()
