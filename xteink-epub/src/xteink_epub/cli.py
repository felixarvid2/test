"""Command line interface (user-facing text in Swedish)."""

import argparse
import os
import sys
import time
from pathlib import Path

from . import __version__
from .epub import EpubError, Options, convert_file

SUFFIX = ".xteink.epub"


def is_output_name(name):
    return name.lower().endswith(SUFFIX)


def find_epubs(directory):
    """All *.epub below directory (recursively, sorted), skipping *.xteink.epub."""
    found = []
    for root, dirs, names in os.walk(directory):
        dirs.sort()
        for n in sorted(names):
            if n.lower().endswith(".epub") and not is_output_name(n) and not n.startswith("."):
                found.append(Path(root) / n)
    return found


def collect_inputs(paths):
    """List of (file, relative parent dir) for files and directories given."""
    items = []
    seen = set()
    for p in paths:
        p = Path(p)
        if p.is_dir():
            found = [(f, f.parent.relative_to(p)) for f in find_epubs(p)]
        else:
            found = [(p, Path())]
        for f, rel in found:
            key = f.resolve()
            if key not in seen:
                seen.add(key)
                items.append((f, rel))
    return items


def output_path(src, rel, out_dir, in_place):
    if in_place:
        return Path(src)
    name = Path(src).stem + SUFFIX
    if out_dir is not None:
        return Path(out_dir) / rel / name
    return Path(src).with_name(name)


def fmt_size(n):
    if n >= 1024 * 1024:
        return ("%.1f MB" % (n / 1024 / 1024)).replace(".", ",")
    return ("%.0f kB" % (n / 1024)).replace(".", ",")


def summary_line(name, report):
    before, after = report.size_before, report.size_after
    pct = round((after - before) * 100 / before) if before else 0
    parts = ["%s: %s → %s (%+d %%)" % (name, fmt_size(before), fmt_size(after), pct)]
    parts.append("%d bilder konverterade" % report.images_converted)
    parts.append("%d typsnitt borttagna" % report.fonts_removed)
    if report.warnings:
        parts.append("%d varningar" % len(report.warnings))
    return ", ".join(parts).replace("-0 %", "0 %")


class Output:
    def __init__(self, quiet, verbose):
        self.quiet = quiet
        self.verbose = verbose

    def info(self, msg):
        if not self.quiet:
            print(msg)

    def detail(self, msg):
        if self.verbose and not self.quiet:
            print(msg)

    def error(self, msg):
        print(msg, file=sys.stderr)


def process_book(src, dst, opts, out):
    """Convert one book. Returns True on success."""
    try:
        report = convert_file(src, dst, opts)
    except EpubError as e:
        out.error("%s: %s" % (Path(src).name, e))
        return False
    except OSError as e:
        out.error("%s: filfel: %s" % (Path(src).name, e))
        return False
    except Exception as e:  # never let one book stop a batch
        out.error("%s: oväntat fel: %s: %s" % (Path(src).name, type(e).__name__, e))
        return False
    out.info(summary_line(Path(src).name, report))
    for w in report.warnings:
        out.info("  varning: %s" % w)
    if report.font_faces_removed or report.svg_unwrapped or report.junk_removed or report.css_removed:
        out.detail("  @font-face borttagna: %d, SVG-sidor uppackade: %d, "
                   "CSS-filer borttagna: %d, skräpfiler borttagna: %d"
                   % (report.font_faces_removed, report.svg_unwrapped,
                      report.css_removed, report.junk_removed))
    for n in report.notes:
        out.detail("  %s" % n)
    out.detail("  skriven: %s" % dst)
    return True


class Watcher:
    """Finds epubs whose size and mtime stayed the same between two polls."""

    def __init__(self, directory):
        self.directory = Path(directory)
        self.pending = {}
        self.done = {}

    @staticmethod
    def _signature(path):
        st = path.stat()
        return (st.st_size, st.st_mtime_ns)

    def mark_done(self, path):
        try:
            self.done[path] = self._signature(path)
        except OSError:
            pass

    def poll(self):
        """Files that are new/changed and stable since the previous poll."""
        ready = []
        current = set()
        for path in find_epubs(self.directory):
            current.add(path)
            try:
                sig = self._signature(path)
            except OSError:
                continue
            if self.done.get(path) == sig:
                self.pending.pop(path, None)
            elif self.pending.get(path) == sig:
                ready.append(path)
                self.pending.pop(path, None)
                self.done[path] = sig
            else:
                self.pending[path] = sig
        for gone in set(self.pending) - current:
            del self.pending[gone]
        return ready


def watch(args, opts, out, sleep=time.sleep, max_polls=None):
    directory = Path(args.watch)
    watcher = Watcher(directory)
    out_dir = Path(args.output) if args.output else None
    if out_dir is not None:
        out_dir.mkdir(parents=True, exist_ok=True)
    # books that already have an up-to-date output are left alone at start
    if not args.force:
        for f in find_epubs(directory):
            dst = output_path(f, f.parent.relative_to(directory), out_dir, False)
            if dst.exists() and dst.stat().st_mtime >= f.stat().st_mtime:
                watcher.mark_done(f)
    out.info("Bevakar %s (kontrollerar var %s s). Avsluta med Ctrl+C." % (directory, args.interval))
    polls = 0
    try:
        while max_polls is None or polls < max_polls:
            for f in watcher.poll():
                dst = output_path(f, f.parent.relative_to(directory), out_dir, False)
                dst.parent.mkdir(parents=True, exist_ok=True)
                process_book(f, dst, opts, out)
            polls += 1
            if max_polls is None or polls < max_polls:
                sleep(args.interval)
    except KeyboardInterrupt:
        out.info("Avslutar bevakningen.")
    return 0


def build_parser():
    p = argparse.ArgumentParser(
        prog="xteink-epub",
        add_help=False,
        description="Anpassar EPUB-filer för e-läsaren Xteink X4 Pro (480×800, grått): "
                    "baslinje-JPEG, rätt bildstorlek, inga typsnitt och enklare CSS.",
    )
    p.add_argument("-h", "--help", action="help", help="visa den här hjälpen och avsluta")
    p.add_argument("paths", metavar="PATH", nargs="*",
                   help="EPUB-filer eller mappar (alla *.epub söks rekursivt)")
    p.add_argument("-o", "--output", metavar="DIR", help="skriv resultatet i den här mappen (skapas vid behov)")
    p.add_argument("--in-place", action="store_true", help="skriv över originalfilen")
    p.add_argument("--force", action="store_true", help="skriv över redan befintliga utfiler")
    p.add_argument("--width", type=int, default=480, help="bildruta, bredd i pixlar (standard: %(default)s)")
    p.add_argument("--height", type=int, default=800, help="bildruta, höjd i pixlar (standard: %(default)s)")
    p.add_argument("--quality", type=int, default=85, help="JPEG-kvalitet 1–95 (standard: %(default)s)")
    p.add_argument("--levels", type=int, choices=(4, 16, 256), default=256,
                   help="antal grånivåer; 4 eller 16 ger färre toner med dithering (standard: %(default)s)")
    p.add_argument("--no-dither", action="store_true", help="ingen dithering vid --levels 4/16")
    p.add_argument("--color", action="store_true", help="behåll färg (annars blir bilderna gråskala)")
    p.add_argument("--rotate-landscape", action="store_true",
                   help="rotera liggande bilder 90° så att de fyller den stående skärmen")
    p.add_argument("--keep-fonts", action="store_true", help="behåll inbäddade typsnitt")
    p.add_argument("--keep-css", action="store_true", help="förenkla inte CSS")
    p.add_argument("--strip-css", action="store_true", help="ta bort all CSS (stilmallar och style-attribut)")
    p.add_argument("--watch", metavar="DIR", help="bevaka en mapp och konvertera nya EPUB-filer")
    p.add_argument("--interval", type=int, default=5, metavar="SEK",
                   help="sekunder mellan kontroller med --watch (standard: %(default)s)")
    p.add_argument("-q", "--quiet", action="store_true", help="skriv bara ut fel")
    p.add_argument("-v", "--verbose", action="store_true", help="skriv ut mer detaljer")
    p.add_argument("--version", action="version", version="%(prog)s " + __version__,
                   help="visa versionen och avsluta")
    return p


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    if not args.paths and not args.watch:
        parser.error("ange minst en EPUB-fil eller mapp, eller --watch DIR")
    if args.in_place and args.output:
        parser.error("--in-place kan inte kombineras med -o/--output")
    if args.in_place and args.watch:
        parser.error("--in-place kan inte kombineras med --watch")
    if args.watch and args.paths:
        parser.error("--watch tar en mapp och kan inte kombineras med PATH")
    if args.width < 1 or args.height < 1:
        parser.error("--width och --height måste vara positiva")
    if not 1 <= args.quality <= 95:
        parser.error("--quality måste vara 1–95")
    if args.interval < 1:
        parser.error("--interval måste vara minst 1")
    if args.keep_css and args.strip_css:
        parser.error("--keep-css och --strip-css utesluter varandra")
    for p in args.paths:
        pp = Path(p)
        if not pp.exists():
            parser.error("finns inte: %s" % p)
        if pp.is_file() and not pp.name.lower().endswith(".epub"):
            parser.error("inte en EPUB-fil: %s" % p)
    if args.watch and not Path(args.watch).is_dir():
        parser.error("--watch: %s är ingen mapp" % args.watch)

    opts = Options(
        width=args.width, height=args.height, quality=args.quality, levels=args.levels,
        dither=not args.no_dither, color=args.color, rotate_landscape=args.rotate_landscape,
        keep_fonts=args.keep_fonts, keep_css=args.keep_css, strip_css=args.strip_css,
    )
    out = Output(args.quiet, args.verbose)
    if args.color and args.levels != 256:
        out.info("Obs: --levels gäller bara gråskala och ignoreras med --color.")

    if args.watch:
        return watch(args, opts, out)

    inputs = collect_inputs(args.paths)
    if not inputs:
        out.info("Inga EPUB-filer hittades.")
        return 0
    out_dir = Path(args.output) if args.output else None
    ok = failed = skipped = 0
    for src, rel in inputs:
        dst = output_path(src, rel, out_dir, args.in_place)
        if dst.exists() and not args.in_place and not args.force:
            out.info("Hoppar över %s (finns redan: %s, använd --force)" % (src.name, dst))
            skipped += 1
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        if process_book(src, dst, opts, out):
            ok += 1
        else:
            failed += 1
    if len(inputs) > 1:
        out.info("Klart: %d konverterade, %d hoppades över, %d misslyckades." % (ok, skipped, failed))
    return 1 if failed else 0
