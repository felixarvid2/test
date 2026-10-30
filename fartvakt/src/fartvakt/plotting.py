"""Hjälpfunktioner för grafen som inte behöver GTK (axlar, tidsmarkeringar)."""

import math
from datetime import datetime, timedelta

WEEKDAYS = ["mån", "tis", "ons", "tor", "fre", "lör", "sön"]
MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"]
DAY = 86400
TIME_STEPS = [300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, DAY, 2 * DAY, 7 * DAY, 14 * DAY,
              30 * DAY, 91 * DAY, 182 * DAY, 365 * DAY]

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
    """Jämna tidpunkter (lokal tid) mellan start och end, som Unix-tider. Klockslag som inte
    finns (när klockan ställs fram) hoppas över och inget klockslag kommer två gånger."""
    span = max(1.0, end - start)
    step = next((s for s in TIME_STEPS if span / s <= max_ticks), TIME_STEPS[-1])
    first = datetime.fromtimestamp(start).replace(hour=0, minute=0, second=0, microsecond=0)
    candidates = []
    if step < DAY:
        day = first
        while day.timestamp() <= end:
            minutes = 0
            while minutes < 24 * 60:
                candidates.append(day + timedelta(minutes=minutes))
                minutes += step // 60
            day = (day + timedelta(days=1)).replace(hour=0)
    else:
        if step >= 30 * DAY:  # hela månader, jämnt räknat från årets början
            months = step // (30 * DAY)
            first = first.replace(day=1, month=1)
            t = first
            while t.timestamp() <= end:
                candidates.append(t)
                month = t.month - 1 + months
                t = t.replace(year=t.year + month // 12, month=month % 12 + 1)
        else:
            t = first
            while t.timestamp() <= end:
                candidates.append(t)
                t += timedelta(days=step // DAY)
    ticks = []
    for t in candidates:
        epoch = t.timestamp()
        if datetime.fromtimestamp(epoch).replace(tzinfo=None) != t:
            continue  # finns inte (klockan ställdes fram)
        if start <= epoch <= end and (not ticks or epoch > ticks[-1]):
            ticks.append(epoch)
    return ticks, step


def tick_label(epoch, step):
    dt = datetime.fromtimestamp(epoch)
    if step >= 30 * DAY:
        return f"{MONTHS[dt.month - 1]} {dt.year}"
    if step < DAY and (dt.hour, dt.minute) != (0, 0):
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
