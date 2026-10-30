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


def default_route_device():
    """Nätverkskortet som internettrafiken går genom (t.ex. "wlp2s0"), eller None."""
    try:
        parts = _run(["ip", "-o", "route", "get", "1.1.1.1"]).split()
    except (OSError, subprocess.SubprocessError):
        return None
    return parts[parts.index("dev") + 1] if "dev" in parts[:-1] else None


def is_wireless(device, sys_net="/sys/class/net"):
    """True för wifi, False för t.ex. kabel och VPN, None om kortet inte går att hitta."""
    base = os.path.join(sys_net, device)
    if not os.path.isdir(base):
        return None
    return os.path.isdir(os.path.join(base, "wireless")) or os.path.exists(os.path.join(base, "phy80211"))


def traffic_device():
    """(kort, går via wifi?) för internettrafiken, eller (None, None) om det inte går att avgöra.
    Är kabel eller VPN aktivt samtidigt mäts inte wifi-nätverket, även om datorn är ansluten till det."""
    device = default_route_device()
    return (device, is_wireless(device)) if device else (None, None)


def matches(ssid, networks) -> bool:
    if not ssid:
        return False
    wanted = ssid.strip().casefold()
    return any(wanted == n.strip().casefold() for n in networks)
