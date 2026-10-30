"""Bakgrundstjänstens läge, delat med appen via en liten JSON-fil."""

import json
import os
import time

from . import config


def path():
    return config.data_dir() / "status.json"


def write(state: dict) -> None:
    p = path()
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(f".status.{os.getpid()}.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(dict(state, updated=time.time()), f, ensure_ascii=False)
    os.replace(tmp, p)


def read() -> dict:
    try:
        with open(path(), encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def is_alive(state: dict, cfg: dict) -> bool:
    """Har tjänsten hört av sig nyligen? En mätningsfas kan ta flera minuter på ett dåligt nät."""
    updated = state.get("updated")
    limit = max(90, cfg["check_network_seconds"] * 3) + (300 if state.get("measuring") else 0)
    return isinstance(updated, (int, float)) and time.time() - updated < limit
