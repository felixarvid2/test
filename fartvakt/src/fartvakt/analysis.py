"""Avgör om en mätning avviker från det som är normalt på nätverket."""

import statistics

# mått: (namn, enhet, högre är bättre, minsta absoluta skillnad som räknas)
METRICS = {
    "download_mbps": ("Nedladdning", "Mbit/s", True, 1.0),
    "upload_mbps": ("Uppladdning", "Mbit/s", True, 1.0),
    "ping_ms": ("Ping", "ms", False, 10.0),
}

FAILURE = "anslutning"


def baseline(history, metric):
    values = [h[metric] for h in history if h.get(metric) is not None]
    return (statistics.median(values), len(values)) if values else (None, 0)


def find_deviations(m, history, threshold_percent, min_baseline):
    """Jämför mätningen `m` med medianen av tidigare mätningar (`history`).

    Returnerar en lista med avvikelser. En misslyckad mätning räknas alltid
    som en avvikelse (avbrott)."""
    if m.get("error"):
        return [{"metric": FAILURE, "value": None, "baseline": None, "change_percent": None, "direction": "avbrott"}]
    found = []
    for metric, (_name, _unit, higher_is_better, min_abs) in METRICS.items():
        value = m.get(metric)
        base, count = baseline(history, metric)
        if value is None or base is None or count < min_baseline or base <= 0:
            continue
        diff = value - base
        change = diff / base * 100
        if abs(change) >= threshold_percent and abs(diff) >= min_abs:
            found.append({
                "metric": metric,
                "value": value,
                "baseline": round(base, 2),
                "change_percent": round(change, 1),
                "direction": "bättre" if (diff > 0) == higher_is_better else "sämre",
            })
    return found


def fmt_number(value, decimals=1):
    if value is None:
        return "–"
    return f"{value:.{decimals}f}".replace(".", ",")


def describe(d) -> str:
    """En mening på svenska, t.ex. 'Nedladdning 12,3 Mbit/s – 58 % lägre än normalt (29,1 Mbit/s)'."""
    if d["metric"] == FAILURE:
        return "Mätningen misslyckades – ingen fungerande internetanslutning"
    name, unit, _, _ = METRICS[d["metric"]]
    change = d["change_percent"]
    word = "högre" if change > 0 else "lägre"
    return (f"{name} {fmt_number(d['value'])} {unit} – {fmt_number(abs(change), 0)} % {word} "
            f"än normalt ({fmt_number(d['baseline'])} {unit})")
