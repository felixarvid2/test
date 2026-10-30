"""Rapport som en fristående HTML-sida: nyckeltal, grafer och tabeller.

Sidan har inga externa beroenden, så den fungerar offline, kan mejlas och kan skrivas
ut eller sparas som PDF direkt från webbläsaren."""

import html
import statistics
from collections import OrderedDict
from datetime import datetime

from . import __version__, analysis
from .plotting import MONTHS, WEEKDAYS, nice_ceiling, segments, tick_label, time_ticks

MAX_ROWS = 500  # fler mätningar än så listas inte en och en (tabellen per dag täcker allt)

W, H = 960, 300                      # grafernas koordinatsystem (skalas med sidan)
LEFT, RIGHT, TOP, BOTTOM = 56, 96, 30, 34


def _e(value):
    return html.escape("" if value is None else str(value))


def _n(value, decimals=1):
    return analysis.fmt_number(value, decimals)


def _date(epoch):
    dt = datetime.fromtimestamp(epoch)
    return f"{dt.day} {MONTHS[dt.month - 1]} {dt.year}"


def _when(epoch):
    dt = datetime.fromtimestamp(epoch)
    return f"{WEEKDAYS[dt.weekday()]} {dt.day} {MONTHS[dt.month - 1]} {dt:%H:%M}"


def _median(values):
    values = [v for v in values if v is not None]
    return statistics.median(values) if values else None


# ---------- grafer ----------

def _line_chart(points, series, start, end, max_gap, unit, chart_id, deviations=None):
    """En linjegraf i SVG. `series` är [(nyckel, namn, css-klass)]. `deviations` mappar
    mätningens id till de mått som avvek; de ringas in."""
    if not points:
        return '<p class="empty">Inga lyckade mätningar under perioden.</p>'
    end = max(end, start + 60)
    pw, ph = W - LEFT - RIGHT, H - TOP - BOTTOM
    peak = max(max((p[k] or 0) for k, _, _ in series) for p in points)
    ymax = nice_ceiling(peak)
    decimals = 0 if ymax >= 10 else 1 if ymax >= 1 else 2

    def x(epoch):
        return LEFT + pw * (epoch - start) / (end - start)

    def y(value):
        return TOP + ph * (1 - (value or 0) / ymax)

    out = [f'<svg class="chart" viewBox="0 0 {W} {H}" role="img" aria-labelledby="{chart_id}-t">',
           f'<title id="{chart_id}-t">{_e(", ".join(name for _, name, _ in series))} över tid ({unit})</title>']
    for i in range(5):
        v = ymax * i / 4
        out.append(f'<line class="{"axis" if i == 0 else "grid"}" x1="{LEFT}" x2="{W - RIGHT}" '
                   f'y1="{y(v):.1f}" y2="{y(v):.1f}"/>')
        out.append(f'<text class="tick" x="{LEFT - 8}" y="{y(v) + 4:.1f}" text-anchor="end">{_n(v, decimals)}</text>')
    ticks, step = time_ticks(start, end)
    for t in ticks:
        out.append(f'<text class="tick" x="{x(t):.1f}" y="{H - 10}" text-anchor="middle">{_e(tick_label(t, step))}'
                   '</text>')
    out.append(f'<text class="unit" x="{LEFT}" y="{TOP - 16}" text-anchor="start">{_e(unit)}</text>')

    for key, name, css in series:
        for seg in segments(points, max_gap):
            coords = " ".join(f"{x(p['epoch']):.1f},{y(p[key]):.1f}" for p in seg)
            if len(seg) == 1:
                out.append(f'<circle class="{css} dot" cx="{x(seg[0]["epoch"]):.1f}" cy="{y(seg[0][key]):.1f}" r="3"/>')
            else:
                out.append(f'<polyline class="{css} line" points="{coords}"/>')
        last = points[-1]
        out.append(f'<text class="direct" x="{x(last["epoch"]) + 8:.1f}" y="{y(last[key]) + 4:.1f}">{_e(name)}</text>')

    for p in points:  # avvikelser
        metrics = (deviations or {}).get(p["id"], set())
        for key in (k for k, _, _ in series if k in metrics):
            out.append(f'<circle class="deviation" cx="{x(p["epoch"]):.1f}" cy="{y(p[key]):.1f}" r="5"/>')

    for p in points:  # osynliga, stora träffytor med värden när man håller muspekaren över
        values = " · ".join(f"{name} {_n(p[key])} {unit}" for key, name, _ in series)
        flag = " · avvikelse" if (deviations or {}).get(p["id"]) else ""
        out.append(f'<circle class="hit" cx="{x(p["epoch"]):.1f}" cy="{y(p[series[0][0]]):.1f}" r="9">'
                   f'<title>{_e(_when(p["epoch"]))}: {_e(values)}{flag}</title></circle>')
    out.append("</svg>")
    return "".join(out)


def _hour_chart(points):
    """Median nedladdning per timme på dygnet – visar om nätet brukar vara långsamt vissa tider."""
    by_hour = {}
    for p in points:
        by_hour.setdefault(datetime.fromtimestamp(p["epoch"]).hour, []).append(p["download_mbps"])
    if not by_hour:
        return '<p class="empty">Inga lyckade mätningar under perioden.</p>'
    hours = list(range(min(by_hour), max(by_hour) + 1))
    medians = {h: _median(by_hour.get(h, [])) for h in hours}
    ymax = nice_ceiling(max(v for v in medians.values() if v is not None))
    decimals = 0 if ymax >= 10 else 1 if ymax >= 1 else 2
    pw, ph = W - LEFT - 16, H - TOP - BOTTOM
    slot = pw / len(hours)
    bar = max(4.0, min(36.0, slot - 6))

    def y(value):
        return TOP + ph * (1 - value / ymax)

    out = [f'<svg class="chart" viewBox="0 0 {W} {H}" role="img" aria-labelledby="hours-t">',
           '<title id="hours-t">Median nedladdning per timme på dygnet (Mbit/s)</title>']
    for i in range(5):
        v = ymax * i / 4
        out.append(f'<line class="{"axis" if i == 0 else "grid"}" x1="{LEFT}" x2="{W - 16}" '
                   f'y1="{y(v):.1f}" y2="{y(v):.1f}"/>')
        out.append(f'<text class="tick" x="{LEFT - 8}" y="{y(v) + 4:.1f}" text-anchor="end">{_n(v, decimals)}</text>')
    out.append(f'<text class="unit" x="{LEFT}" y="{TOP - 16}" text-anchor="start">Mbit/s</text>')
    base = y(0)
    for i, h in enumerate(hours):
        cx = LEFT + slot * (i + 0.5)
        out.append(f'<text class="tick" x="{cx:.1f}" y="{H - 10}" text-anchor="middle">{h:02d}</text>')
        value = medians[h]
        if value is None:
            continue
        top = y(value)
        r = min(4.0, bar / 2, base - top)
        # stapel med rundade hörn upptill, rak mot nollinjen
        out.append(f'<path class="down bar" d="M{cx - bar / 2:.1f},{base:.1f} V{top + r:.1f} '
                   f'Q{cx - bar / 2:.1f},{top:.1f} {cx - bar / 2 + r:.1f},{top:.1f} H{cx + bar / 2 - r:.1f} '
                   f'Q{cx + bar / 2:.1f},{top:.1f} {cx + bar / 2:.1f},{top + r:.1f} V{base:.1f} Z">'
                   f'<title>kl. {h:02d}–{h + 1:02d}: median {_n(value)} Mbit/s ({len(by_hour[h])} mätningar)</title>'
                   '</path>')
    out.append("</svg>")
    return "".join(out)


# ---------- tabeller ----------

def _table(headers, rows, numeric=()):
    """`rows` är listor med (text, css-klass eller None)."""
    head = "".join(f'<th{" class=num" if i in numeric else ""}>{_e(h)}</th>' for i, h in enumerate(headers))
    body = []
    for row in rows:
        cells = []
        for i, (text, css) in enumerate(row):
            classes = " ".join(c for c in ("num" if i in numeric else None, css) if c)
            cells.append(f'<td{f" class={chr(34)}{classes}{chr(34)}" if classes else ""}>{_e(text)}</td>')
        body.append(f"<tr>{''.join(cells)}</tr>")
    return f'<table><thead><tr>{head}</tr></thead><tbody>{"".join(body)}</tbody></table>'


def _days_table(measurements, by_measurement):
    days = OrderedDict()
    for m in sorted(measurements, key=lambda m: m["epoch"]):
        days.setdefault(datetime.fromtimestamp(m["epoch"]).date(), []).append(m)
    rows = []
    for day, ms in reversed(days.items()):
        ok = [m for m in ms if not m.get("error")]
        devs = sum(1 for m in ms if by_measurement.get(m["id"]))
        failed = len(ms) - len(ok)
        rows.append([
            (f"{WEEKDAYS[day.weekday()]} {day.day} {MONTHS[day.month - 1]}", None),
            (str(len(ms)), None),
            (_n(_median(m["download_mbps"] for m in ok)), None),
            (_n(min((m["download_mbps"] for m in ok), default=None)), None),
            (_n(_median(m["upload_mbps"] for m in ok)), None),
            (_n(_median(m["ping_ms"] for m in ok)), None),
            (str(devs), "bad" if devs else "muted"),
            (str(failed), "bad" if failed else "muted"),
        ])
    return _table(["Dag", "Mätningar", "Median ned", "Lägsta ned", "Median upp", "Median ping", "Avvikelser",
                   "Avbrott"], rows, numeric=range(1, 8))


def _deviation_rows(deviations):
    rows = []
    for d in deviations:
        if d["metric"] == analysis.FAILURE:
            rows.append([(_when(d["epoch"]), None), (d["ssid"] or "–", None), ("Anslutning", None), ("–", None),
                         ("–", "muted"), ("–", None), ("Avbrott", "bad")])
            continue
        name, unit, _, _ = analysis.METRICS[d["metric"]]
        change = d["change_percent"]
        css = "good" if d["direction"] == "bättre" else "bad"
        rows.append([(_when(d["epoch"]), None), (d["ssid"] or "–", None), (name, None),
                     (f"{_n(d['value'])} {unit}", None), (f"{_n(d['baseline'])} {unit}", "muted"),
                     (f"{'+' if change > 0 else '−'}{_n(abs(change), 0)} %", css),
                     (d["direction"].capitalize(), css)])
    return rows


def _measurement_rows(measurements, by_measurement):
    rows = []
    for m in measurements[:MAX_ROWS]:
        devs = by_measurement.get(m["id"], [])
        if m.get("error"):
            status = (m["error"], "bad")
        elif devs:
            words = ", ".join(f"{analysis.METRICS[d['metric']][0].lower()} {d['direction']}" for d in devs)
            status = (f"Avvikelse: {words}", "bad" if any(d["direction"] == "sämre" for d in devs) else "good")
        else:
            status = ("Normal", "muted")
        rows.append([(_when(m["epoch"]), None), (m["ssid"] or "–", None), (_n(m["download_mbps"]), None),
                     (_n(m["upload_mbps"]), None), (_n(m["ping_ms"]), None),
                     ("Automatisk" if m["source"] == "auto" else "Manuell", "muted"), status])
    return rows


# ---------- sidan ----------

def build(storage, cfg, ssid=None, since=None, now=None):
    """HTML för mätningarna på `ssid` (None = alla nätverk) sedan Unix-tiden `since` (None = allt)."""
    now = now if now is not None else datetime.now().timestamp()
    measurements = storage.measurements(ssid=ssid, since=since)            # nyaste först
    deviations = storage.deviations(ssid=ssid, since=since)
    by_measurement = {}
    for d in deviations:
        by_measurement.setdefault(d["measurement_id"], []).append(d)
    ok = [m for m in measurements if not m.get("error")]
    points = sorted(ok, key=lambda m: m["epoch"])
    metrics = {mid: {d["metric"] for d in devs} for mid, devs in by_measurement.items()}

    first = measurements[-1]["epoch"] if measurements else now
    start = since if since is not None else first
    end = now if since is not None else (measurements[0]["epoch"] if measurements else now)
    period = (f"{_date(start)} – {_date(end)}" if _date(start) != _date(end) else _date(start))
    where = ssid or "Alla nätverk"
    max_gap = max(1200, cfg["interval_minutes"] * 60 * 3)

    tiles = [
        ("Median nedladdning", _n(_median(m["download_mbps"] for m in ok)), "Mbit/s"),
        ("Median uppladdning", _n(_median(m["upload_mbps"] for m in ok)), "Mbit/s"),
        ("Median ping", _n(_median(m["ping_ms"] for m in ok)), "ms"),
        ("Lägsta nedladdning", _n(min((m["download_mbps"] for m in ok), default=None)), "Mbit/s"),
        ("Mätningar", str(len(measurements)), ""),
        ("Lyckade", f"{round(100 * len(ok) / len(measurements))}" if measurements else "–", "%"),
        ("Med avvikelse", str(sum(1 for m in measurements if by_measurement.get(m["id"]))), ""),
        ("Avbrott", str(len(measurements) - len(ok)), ""),
    ]
    tiles_html = "".join(f'<div class="tile"><div class="label">{_e(label)}</div>'
                         f'<div class="value">{_e(value)}<span class="unit"> {_e(unit)}</span></div></div>'
                         for label, value, unit in tiles)

    networks_html = ""
    if ssid is None:
        nets = OrderedDict()
        for m in measurements:
            nets.setdefault(m["ssid"] or "Okänt nätverk", []).append(m)
        if len(nets) > 1:
            rows = []
            for name, ms in nets.items():
                good = [m for m in ms if not m.get("error")]
                devs = sum(1 for m in ms if by_measurement.get(m["id"]))
                rows.append([(name, None), (str(len(ms)), None), (_n(_median(m["download_mbps"] for m in good)), None),
                             (_n(_median(m["upload_mbps"] for m in good)), None),
                             (_n(_median(m["ping_ms"] for m in good)), None), (str(devs), "bad" if devs else "muted")])
            networks_html = ('<section><h2>Per nätverk</h2>' +
                             _table(["Nätverk", "Mätningar", "Median ned", "Median upp", "Median ping", "Avvikelser"],
                                    rows, numeric=range(1, 6)) + "</section>")

    speed_chart = _line_chart(points, [("download_mbps", "Nedladdning", "down"), ("upload_mbps", "Uppladdning", "up")],
                              start, end, max_gap, "Mbit/s", "speed", metrics)
    ping_chart = _line_chart(points, [("ping_ms", "Ping", "ping")], start, end, max_gap, "ms", "ping", metrics)

    shown = len(measurements)
    more = (f'<p class="note">Visar de {MAX_ROWS} senaste av {shown} mätningar. Tabellen per dag ovan omfattar '
            'alla.</p>' if shown > MAX_ROWS else "")
    deviation_section = (_table(["Tid", "Nätverk", "Mått", "Uppmätt", "Normalt", "Ändring", "Typ"],
                                _deviation_rows(deviations), numeric=(3, 4, 5))
                         if deviations else '<p class="empty">Inga avvikelser under perioden.</p>')
    measurement_section = (_table(["Tid", "Nätverk", "Ned (Mbit/s)", "Upp (Mbit/s)", "Ping (ms)", "Källa", "Status"],
                                  _measurement_rows(measurements, by_measurement), numeric=(2, 3, 4)) + more
                           if measurements else '<p class="empty">Inga mätningar under perioden.</p>')
    generated = datetime.fromtimestamp(now)

    return f"""<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Fartvakt {_e(__version__)}">
<title>Fartvakt – {_e(where)} – {_e(period)}</title>
<style>{CSS}</style>
</head>
<body>
<main>
<header>
  <div class="brand">{LOGO}<span>Fartvakt</span></div>
  <h1>Hastighetsrapport{" – " + _e(where) if ssid else " – alla nätverk"}</h1>
  <p class="meta">{_e(period)} · skapad {_e(_date(now))} kl. {generated:%H:%M}</p>
</header>

<section class="tiles">{tiles_html}</section>

<section>
  <h2>Hastighet över tid</h2>
  <div class="legend"><span class="key down"></span>Nedladdning <span class="key up"></span>Uppladdning
    <span class="key ring"></span>Avvikelse</div>
  <figure>{speed_chart}</figure>
</section>

<section>
  <h2>Ping över tid</h2>
  <figure>{ping_chart}</figure>
</section>

<section>
  <h2>Nedladdning per timme på dygnet</h2>
  <p class="note">Median av alla lyckade mätningar under respektive timme.</p>
  <figure>{_hour_chart(points)}</figure>
</section>

{networks_html}

<section>
  <h2>Per dag</h2>
  {_days_table(measurements, by_measurement) if measurements else '<p class="empty">Inga mätningar.</p>'}
</section>

<section>
  <h2>Avvikelser</h2>
  {deviation_section}
</section>

<section class="all">
  <h2>Alla mätningar</h2>
  {measurement_section}
</section>

<footer>
  En mätning räknas som avvikande när nedladdning, uppladdning eller ping skiljer sig mer än
  {cfg["threshold_percent"]} % från medianen av de {cfg["baseline_count"]} senaste lyckade mätningarna på samma
  nätverk. Mätningarna görs mot speed.cloudflare.com. Skapad med Fartvakt {_e(__version__)}.
</footer>
</main>
</body>
</html>
"""


LOGO = ('<svg viewBox="0 0 128 128" width="28" height="28" aria-hidden="true">'
        '<rect x="4" y="4" width="120" height="120" rx="26" fill="#1d4ed8"/>'
        '<path d="M24 84 A40 40 0 0 1 104 84" fill="none" stroke="#bfdbfe" stroke-width="10" stroke-linecap="round"/>'
        '<path d="M24 84 A40 40 0 0 1 52 46" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round"/>'
        '<line x1="64" y1="84" x2="88" y2="54" stroke="#fbbf24" stroke-width="7" stroke-linecap="round"/>'
        '<circle cx="64" cy="84" r="9" fill="#fff"/></svg>')

CSS = """
:root {
  color-scheme: light dark;
  --bg: #f6f5f4; --surface: #ffffff; --ink: #1f1f1f; --ink-2: #5e5c64; --line: #deddda; --grid: #ebeae8;
  --down: #1c71d8; --up: #26a269; --ping: #613583; --bad: #c01c28; --good: #26a269;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1e1e1e; --surface: #2a2a2a; --ink: #f6f5f4; --ink-2: #c0bfbc; --line: #3d3d3d; --grid: #353535;
    --down: #3584e4; --up: #26a269; --ping: #c061cb; --bad: #ff7b63; --good: #57e389;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink);
  font: 15px/1.5 Cantarell, "Inter", "Segoe UI", system-ui, -apple-system, sans-serif; }
main { max-width: 1040px; margin: 0 auto; padding: 32px 20px 48px; }
header { margin-bottom: 24px; }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 700; color: var(--ink-2); }
h1 { font-size: 28px; line-height: 1.2; margin: 12px 0 4px; }
h2 { font-size: 18px; margin: 0 0 12px; }
.meta, .note, footer { color: var(--ink-2); }
.note { margin: -6px 0 12px; font-size: 13px; }
section { background: var(--surface); border-radius: 12px; padding: 20px 22px; margin: 0 0 16px;
  box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 0 0 1px var(--line); }
.tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;
  background: none; box-shadow: none; padding: 0; }
.tile { background: var(--surface); border-radius: 12px; padding: 14px 16px; box-shadow: 0 0 0 1px var(--line); }
.tile .label { font-size: 13px; color: var(--ink-2); }
.tile .value { font-size: 26px; font-weight: 800; font-variant-numeric: tabular-nums; }
.tile .unit { font-size: 14px; font-weight: 600; color: var(--ink-2); }
figure { margin: 0; }
.chart { width: 100%; height: auto; display: block; overflow: visible; }
.chart .grid { stroke: var(--grid); stroke-width: 1; }
.chart .axis { stroke: var(--line); stroke-width: 1; }
.chart .tick, .chart .unit { fill: var(--ink-2); font-size: 12px; font-variant-numeric: tabular-nums; }
.chart .direct { fill: var(--ink); font-size: 12px; font-weight: 600; }
.chart .line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.chart .down { stroke: var(--down); fill: var(--down); }
.chart .up { stroke: var(--up); fill: var(--up); }
.chart .ping { stroke: var(--ping); fill: var(--ping); }
.chart .line.down, .chart .line.up, .chart .line.ping { fill: none; }
.chart .bar { stroke: none; }
.chart .bar:hover { opacity: .8; }
.chart .deviation { fill: var(--surface); stroke: var(--bad); stroke-width: 2.5; }
.chart .hit { fill: transparent; stroke: none; }
.chart .hit:hover { fill: var(--ink); fill-opacity: .12; }
.legend { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; font-size: 13px; color: var(--ink-2);
  margin: -4px 0 8px; }
.key { display: inline-block; width: 14px; height: 3px; border-radius: 2px; margin-right: -8px; vertical-align: middle; }
.key.down { background: var(--down); } .key.up { background: var(--up); }
.key.ring { width: 10px; height: 10px; border-radius: 50%; border: 2.5px solid var(--bad); }
table { width: 100%; border-collapse: collapse; font-size: 14px; font-variant-numeric: tabular-nums; }
th { text-align: left; font-size: 12px; font-weight: 600; color: var(--ink-2); padding: 6px 10px;
  border-bottom: 1px solid var(--line); white-space: nowrap; }
td { padding: 7px 10px; border-bottom: 1px solid var(--grid); white-space: nowrap; }
td:last-child { white-space: normal; }
tbody tr:last-child td { border-bottom: none; }
tbody tr:hover td { background: var(--bg); }
.num { text-align: right; white-space: nowrap; }
.muted { color: var(--ink-2); }
.bad { color: var(--bad); font-weight: 600; }
.good { color: var(--good); font-weight: 600; }
.empty { color: var(--ink-2); margin: 0; }
footer { font-size: 13px; margin-top: 24px; }
@media (max-width: 640px) {
  section { padding: 16px 12px; overflow-x: auto; } h1 { font-size: 22px; }
  .tiles { grid-template-columns: repeat(2, 1fr); }
  figure { overflow-x: auto; } .chart { min-width: 640px; }  /* hellre scrolla än krympa texten */
}
@media print {
  :root { --bg: #fff; --surface: #fff; --ink: #000; --ink-2: #444; --line: #ccc; --grid: #e5e5e5;
    --down: #1c71d8; --up: #26a269; --ping: #613583; --bad: #c01c28; --good: #26a269; color-scheme: light; }
  @page { size: A4; margin: 14mm; }
  main { max-width: none; padding: 0; }
  section { box-shadow: none; border: 1px solid var(--line); break-inside: avoid; }
  section.all { break-inside: auto; }
  tr { break-inside: avoid; }
  .chart .hit { display: none; }
}
"""
