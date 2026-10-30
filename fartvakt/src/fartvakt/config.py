"""Inställningar och sökvägar (följer XDG-standarden)."""

import json
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


def load() -> dict:
    cfg = dict(DEFAULTS)
    try:
        with open(config_path(), encoding="utf-8") as f:
            stored = json.load(f)
    except (OSError, ValueError):
        stored = {}
    if isinstance(stored, dict):
        for key, default in DEFAULTS.items():
            value = stored.get(key)
            if value is None:
                continue
            if isinstance(default, bool):
                cfg[key] = bool(value)
            elif isinstance(default, (int, float)) and isinstance(value, (int, float)):
                cfg[key] = type(default)(value) if value > 0 else default
            elif isinstance(default, list) and isinstance(value, list):
                cfg[key] = [str(v).strip() for v in value if str(v).strip()]
            elif isinstance(default, str) and isinstance(value, str) and value.strip():
                cfg[key] = value.strip()
    return cfg


def save(cfg: dict) -> None:
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({k: cfg.get(k, v) for k, v in DEFAULTS.items()}, f, indent=2, ensure_ascii=False)
        f.write("\n")
    os.replace(tmp, path)
