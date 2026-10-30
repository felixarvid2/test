"""Kommandoraden: `fartvakt` öppnar appen, underkommandon för allt annat."""

import argparse
import sys

from . import __version__, analysis, config, monitor, network
from .storage import Storage


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
    storage = Storage(config.db_path())
    try:
        m, deviations = monitor.measure_and_store(cfg, ssid, storage, "manuell")
    except monitor.Busy:
        print("En annan mätning pågår redan – försök igen om en stund.", file=sys.stderr)
        return 1
    print(_row(m))
    for d in deviations:
        print("  AVVIKELSE:", analysis.describe(d))
    return 1 if m.get("error") else 0


def cmd_status(_args):
    cfg = config.load()
    ssid = network.current_ssid()
    storage = Storage(config.db_path())
    print(f"Anslutet nätverk:  {ssid or 'inget wifi'}")
    print(f"Bevakade nätverk:  {', '.join(cfg['networks']) or '(inga)'}")
    if not cfg["monitoring_enabled"]:
        state = "pausad"
    elif network.matches(ssid, cfg["networks"]):
        state = f"aktiv – mäter var {cfg['interval_minutes']}:e minut"
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
                  f"ping {analysis.fmt_number(ping)} ms (median av {n} mätningar)")
    return 0


def cmd_history(args):
    for m in reversed(Storage(config.db_path()).measurements(limit=args.antal)):
        print(_row(m))
    return 0


def cmd_deviations(args):
    for d in reversed(Storage(config.db_path()).deviations(limit=args.antal)):
        print(f"{d['ts'][:19].replace('T', ' ')}  {d['ssid'] or '–':<20} {analysis.describe(d)}")
    return 0


def cmd_export(args):
    n = Storage(config.db_path()).export_csv(args.fil)
    print(f"Sparade {n} mätningar i {args.fil}")
    return 0


def cmd_daemon(_args):
    from . import daemon

    daemon.run()
    return 0


def cmd_gui(_args):
    from . import gui

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
    p = sub.add_parser("export", help="spara alla mätningar som CSV")
    p.add_argument("fil")
    p.set_defaults(func=cmd_export)
    sub.add_parser("daemon", help="kör bakgrundsbevakningen (startas av systemd)").set_defaults(func=cmd_daemon)
    args = parser.parse_args(argv)
    return (args.func if args.cmd else cmd_gui)(args)
