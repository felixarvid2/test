"""Kommandoraden: `fartvakt` öppnar appen, underkommandon för allt annat."""

import argparse
import sys
import time

from . import __version__, analysis, config, monitor, network, status
from .formatting import PHASES, fmt_until
from .storage import open_storage


def _storage():
    storage, moved = open_storage()
    if moved:
        print(f"Databasen var skadad och har flyttats till {moved}. En ny har skapats.", file=sys.stderr)
    return storage


def _row(m):
    when = m["ts"][:19].replace("T", " ")
    if m.get("error"):
        return f"{when}  {m['ssid'] or '–':<20} FEL: {m['error']}"
    return (f"{when}  {m['ssid'] or '–':<20} ned {analysis.fmt_number(m['download_mbps']):>7} Mbit/s  "
            f"upp {analysis.fmt_number(m['upload_mbps']):>7} Mbit/s  ping {analysis.fmt_number(m['ping_ms']):>6} ms")


def cmd_measure(_args):
    cfg = config.load()
    ssid = network.current_ssid()
    print(f"Mäter på {ssid or 'okänt nätverk'} …", flush=True)
    storage = _storage()
    try:
        m, deviations = monitor.measure_and_store(
            cfg, ssid, storage, "manuell", send_notification=lambda *_: None,
            progress=lambda phase: print(f"  {PHASES.get(phase, phase)} …", flush=True),
            current_ssid=network.current_ssid)
    except monitor.Busy:
        print("En annan mätning pågår redan – försök igen om en stund.", file=sys.stderr)
        return 1
    except monitor.NetworkChanged:
        print("Datorn bytte nätverk under mätningen, så resultatet sparades inte.", file=sys.stderr)
        return 1
    print(_row(m))
    for d in deviations:
        print("  AVVIKELSE:", analysis.describe(d))
    return 1 if m.get("error") else 0


def cmd_status(_args):
    cfg = config.load()
    ssid = network.current_ssid()
    storage = _storage()
    print(f"Anslutet nätverk:  {ssid or 'inget wifi'}")
    print(f"Bevakade nätverk:  {', '.join(cfg['networks']) or '(inga)'}")
    daemon = status.read()
    alive = status.is_alive(daemon, cfg)
    if not alive:
        state = "bakgrundstjänsten kör inte (systemctl --user start fartvakt)"
    elif not cfg["monitoring_enabled"]:
        state = "avstängd i inställningarna"
    elif daemon.get("portal"):
        state = "väntar på att du loggar in på nätverket i webbläsaren"
    elif daemon.get("other_route"):
        state = f"mäter inte – internettrafiken går via {daemon['other_route']} i stället för wifi"
    elif daemon.get("measuring"):
        state = PHASES.get(daemon["measuring"], "mäter").lower()
    elif daemon.get("watched"):
        due = daemon.get("next_due")
        when = fmt_until(due - time.time()) if due and due > time.time() else "strax"
        state = f"aktiv – nästa mätning {when}, sedan var {cfg['interval_minutes']}:e minut"
    else:
        state = "väntar på ett bevakat nätverk"
    print(f"Bevakning:         {state}")
    last = storage.last()
    print(f"Senaste mätning:   {_row(last) if last else '(inga än)'}")
    for net in cfg["networks"]:
        history = storage.history(net, cfg["baseline_count"])
        if history:
            down, n = analysis.baseline(history, "download_mbps")
            up, _ = analysis.baseline(history, "upload_mbps")
            ping, _ = analysis.baseline(history, "ping_ms")
            print(f"Normalt på {net}: ned {analysis.fmt_number(down)} Mbit/s, upp {analysis.fmt_number(up)} Mbit/s, "
                  f"ping {analysis.fmt_number(ping)} ms (median av {n} {'mätning' if n == 1 else 'mätningar'})")
    return 0


def cmd_history(args):
    for m in reversed(_storage().measurements(limit=args.antal)):
        print(_row(m))
    return 0


def cmd_deviations(args):
    for d in reversed(_storage().deviations(limit=args.antal)):
        print(f"{d['ts'][:19].replace('T', ' ')}  {d['ssid'] or '–':<20} {analysis.describe(d)}")
    return 0


def cmd_export(args):
    n = _storage().export_csv(args.fil)
    print(f"Sparade {n} mätningar i {args.fil}")
    return 0


PERIODS = {"24h": 86400, "7d": 7 * 86400, "30d": 30 * 86400, "allt": None}


def cmd_report(args):
    from . import report

    seconds = PERIODS[args.period]
    html = report.build(_storage(), config.load(), ssid=args.natverk,
                        since=time.time() - seconds if seconds else None)
    with open(args.fil, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Sparade rapporten i {args.fil}")
    return 0


def cmd_daemon(_args):
    from . import daemon

    daemon.run()
    return 0


def cmd_gui(_args):
    try:
        from . import gui
    except (ImportError, ValueError) as e:
        print(f"Appen kunde inte starta: {e}\nInstallera gir1.2-adw-1 och gir1.2-gtk-4.0, "
              "eller använd kommandoraden (se `fartvakt --help`).", file=sys.stderr)
        return 1
    return gui.main()


def main(argv=None):
    parser = argparse.ArgumentParser(
        prog="fartvakt",
        description="Mäter internethastigheten automatiskt på utvalda wifi-nätverk och noterar avvikelser.",
    )
    parser.add_argument("--version", action="version", version=f"fartvakt {__version__}")
    sub = parser.add_subparsers(dest="cmd")
    sub.add_parser("gui", help="öppna appen (standard)").set_defaults(func=cmd_gui)
    sub.add_parser("mat", help="mät hastigheten nu").set_defaults(func=cmd_measure)
    sub.add_parser("status", help="visa nätverk, bevakning och normalvärden").set_defaults(func=cmd_status)
    p = sub.add_parser("historik", help="lista mätningar")
    p.add_argument("-n", "--antal", type=int, default=30)
    p.set_defaults(func=cmd_history)
    p = sub.add_parser("avvikelser", help="lista avvikelser")
    p.add_argument("-n", "--antal", type=int, default=30)
    p.set_defaults(func=cmd_deviations)
    p = sub.add_parser("rapport", help="spara en rapport med grafer och tabeller (HTML)")
    p.add_argument("fil")
    p.add_argument("--natverk", help="bara det här nätverket (standard: alla)")
    p.add_argument("--period", choices=list(PERIODS), default="7d", help="standard: 7d")
    p.set_defaults(func=cmd_report)
    p = sub.add_parser("export", help="spara alla mätningar som CSV")
    p.add_argument("fil")
    p.set_defaults(func=cmd_export)
    sub.add_parser("daemon", help="kör bakgrundsbevakningen (startas av systemd)").set_defaults(func=cmd_daemon)
    args = parser.parse_args(argv)
    return (args.func if args.cmd else cmd_gui)(args)
