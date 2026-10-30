"""Hjälpfunktioner för grafen som inte behöver GTK (axlar, tidsmarkeringar)."""

import math
from datetime import datetime, timedelta

WEEKDAYS = ["mån", "tis", "ons", "tor", "fre", "lör", "sön"]
TIME_STEPS = [300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400, 172800, 604800]

def nice_ceiling(value):
    """Närmaste "jämna" tal ≥ value som delas i fyra jämna steg (40, 80, 120, 160, 200 …)."""
    if value <= 0:
        return 10
    exponent = math.floor(math.log10(value))
    for factor in (1, 1.2, 1.6, 2, 2.4, 3.2, 4, 6, 8, 10):
        candidate = factor * 10 ** exponent
        if candidate >= value * 1.05:
            return candidate
    return 10 ** (exponent + 1)


def time_ticks(start, end, max_ticks=6):
    """Jämna tidpunkter (lokal tid) mellan start och end, som Unix-tider."""
    span = max(1.0, end - start)
    step = next((s for s in TIME_STEPS if span / s <= max_ticks), TIME_STEPS[-1])
    first = datetime.fromtimestamp(start).replace(hour=0, minute=0, second=0, microsecond=0)
    ticks = []
    if step < 86400:
        day = first
        while day.timestamp() <= end:
            t = day
            while t.date() == day.date():
                if start <= t.timestamp() <= end:
                    ticks.append(t.timestamp())
                t += timedelta(seconds=step)
            day += timedelta(days=1)
            day = day.replace(hour=0)  # sommartid: håll dagarna vid midnatt
    else:
        days = step // 86400
        t = first
        while t.timestamp() <= end:
            if t.timestamp() >= start:
                ticks.append(t.timestamp())
            t += timedelta(days=days)
    return ticks, step


def tick_label(epoch, step):
    dt = datetime.fromtimestamp(epoch)
    if step < 86400:
        if dt.hour == 0 and dt.minute == 0:
            return f"{WEEKDAYS[dt.weekday()]} {dt.day}/{dt.month}"
        return dt.strftime("%H:%M")
    return f"{WEEKDAYS[dt.weekday()]} {dt.day}/{dt.month}"


def segments(points, max_gap):
    """Delar upp punkterna (dictar med `epoch`) där det är långt mellan mätningarna,
    t.ex. när datorn inte var på nätverket."""
    out, current, last = [], [], None
    for p in points:
        if last is not None and p["epoch"] - last > max_gap:
            out.append(current)
            current = []
        current.append(p)
        last = p["epoch"]
    if current:
        out.append(current)
    return out
