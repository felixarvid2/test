"""Tar reda på vilket wifi-nätverk datorn är ansluten till."""

import os
import subprocess


def _split_terse(line: str) -> list:
    """Delar en rad från `nmcli -t`, där kolon i värden är escapade med backslash."""
    fields, cur, escaped = [], [], False
    for ch in line:
        if escaped:
            cur.append(ch)
            escaped = False
        elif ch == "\\":
            escaped = True
        elif ch == ":":
            fields.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
    fields.append("".join(cur))
    return fields


def parse_nmcli_wifi(output: str):
    """Plockar ut SSID för det aktiva nätverket ur `nmcli -t -f ACTIVE,SSID device wifi`."""
    for line in output.splitlines():
        fields = _split_terse(line)
        if len(fields) >= 2 and fields[0].strip().lower() == "yes" and fields[1]:
            return fields[1]
    return None


def _run(cmd):
    env = dict(os.environ, LC_ALL="C")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=15, env=env)
    return result.stdout if result.returncode == 0 else ""


def current_ssid():
    """SSID för det anslutna wifi-nätverket, eller None (ingen wifi / kabel)."""
    try:
        ssid = parse_nmcli_wifi(
            _run(["nmcli", "-t", "-f", "ACTIVE,SSID", "device", "wifi", "list", "--rescan", "no"])
        )
        if ssid:
            return ssid
    except (OSError, subprocess.SubprocessError):
        pass
    try:
        ssid = _run(["iwgetid", "-r"]).strip()
        if ssid:
            return ssid
    except (OSError, subprocess.SubprocessError):
        pass
    return None


CONNECTIVITY_STATES = ("none", "portal", "limited", "full", "unknown")


def connectivity(check=False):
    """NetworkManagers bedömning av internetanslutningen: "full", "portal" (kräver
    inloggning i webbläsaren), "limited", "none", "unknown" – eller None om det inte
    går att fråga. `check=True` gör en ny kontroll i stället för att använda den senaste."""
    try:
        cmd = ["nmcli", "-t", "networking", "connectivity"] + (["check"] if check else [])
        state = _run(cmd).strip().lower()
    except (OSError, subprocess.SubprocessError):
        return None
    return state if state in CONNECTIVITY_STATES else None


def matches(ssid, networks) -> bool:
    if not ssid:
        return False
    wanted = ssid.strip().casefold()
    return any(wanted == n.strip().casefold() for n in networks)
