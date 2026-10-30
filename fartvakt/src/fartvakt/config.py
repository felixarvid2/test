"""Inställningar och sökvägar (följer XDG-standarden)."""

import json
import math
import os
from pathlib import Path

DEFAULTS = {
    # Wifi-nätverk (SSID) som ska bevakas. Jämförs utan hänsyn till versaler.
    "networks": ["JENSEN-Guest"],
    # Bevakningen kan pausas utan att stoppa bakgrundstjänsten.
    "monitoring_enabled": True,
    # Minuter mellan mätningar när man är ansluten till ett bevakat nätverk.
    "interval_minutes": 5,
    # Hur ofta tjänsten tittar efter vilket nätverk datorn är ansluten till.
    "check_network_seconds": 30,
    # En mätning räknas som avvikande när den skiljer sig så här mycket från normalt.
    "threshold_percent": 30,
    # Antal tidigare mätningar som "normalt" (medianen) räknas fram ur.
    "baseline_count": 20,
    # Minsta antal tidigare mätningar innan avvikelser börjar noteras.
    "min_baseline": 5,
    "download_bytes": 20_000_000,
    "upload_bytes": 5_000_000,
    "streams": 4,
    "max_seconds": 10,
    "server": "https://speed.cloudflare.com",
    "notifications": True,
    # Det som senast visades i appen (nätverk, "" = alla, och period), så att valet sparas.
    "view_network": "",
    "view_period": 0,
}


def config_dir() -> Path:
    base = os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config"
    return Path(base) / "fartvakt"


def data_dir() -> Path:
    base = os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share"
    return Path(base) / "fartvakt"


def config_path() -> Path:
    return config_dir() / "config.json"


def db_path() -> Path:
    return data_dir() / "fartvakt.db"


# Tillåtna intervall för talen, så att en handredigerad fil inte kan få tjänsten att
# mäta oavbrutet eller krascha.
LIMITS = {
    "interval_minutes": (1, 1440),
    "check_network_seconds": (5, 3600),
    "threshold_percent": (5, 95),
    "baseline_count": (3, 500),
    "min_baseline": (1, 100),
    "download_bytes": (100_000, 1_000_000_000),
    "upload_bytes": (100_000, 500_000_000),
    "streams": (1, 16),
    "max_seconds": (2, 60),
    "view_period": (0, 3),
}


def _number(key, value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        return DEFAULTS[key]
    low, high = LIMITS[key]
    return max(low, min(high, int(round(value))))


def load() -> dict:
    cfg = dict(DEFAULTS)
    try:
        with open(config_path(), encoding="utf-8") as f:
            stored = json.load(f)
    except (OSError, ValueError):
        stored = {}
    if not isinstance(stored, dict):
        stored = {}
    for key, default in DEFAULTS.items():
        value = stored.get(key)
        if value is None:
            continue
        if isinstance(default, bool):
            if isinstance(value, bool):
                cfg[key] = value
        elif key in LIMITS:
            cfg[key] = _number(key, value)
        elif isinstance(default, list) and isinstance(value, list):
            cfg[key] = [str(v).strip() for v in value if isinstance(v, str) and v.strip()]
        elif isinstance(default, str) and isinstance(value, str) and (value.strip() or not default):
            cfg[key] = value.strip()
    cfg["min_baseline"] = min(cfg["min_baseline"], cfg["baseline_count"])
    return cfg


def update(**values) -> dict:
    """Ändrar några inställningar och behåller resten som de är sparade nu."""
    cfg = load()
    cfg.update(values)
    save(cfg)
    return cfg


def save(cfg: dict) -> None:
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({k: cfg.get(k, v) for k, v in DEFAULTS.items()}, f, indent=2, ensure_ascii=False)
        f.write("\n")
        f.flush()
        os.fsync(f.fileno())  # så att ett strömavbrott inte lämnar en tom fil efter sig
    os.replace(tmp, path)
