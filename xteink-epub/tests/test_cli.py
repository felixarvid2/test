import contextlib
import io
import os
import shutil
import tempfile
import unittest
from pathlib import Path

from helpers import *  # noqa: F401,F403
from test_epub import make_book

from xteink_epub import cli


def run(*args):
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        try:
            code = cli.main([str(a) for a in args])
        except SystemExit as e:
            code = e.code
    return code, out.getvalue(), err.getvalue()


class CliTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.book = make_book("3.0")

    def write(self, rel, data=None):
        p = self.tmp / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(self.book if data is None else data)
        return p

    def test_default_output_next_to_input(self):
        src = self.write("a.epub")
        code, out, _ = run(src)
        self.assertEqual(code, 0)
        self.assertTrue((self.tmp / "a.xteink.epub").exists())
        self.assertEqual(src.read_bytes(), self.book)
        self.assertIn("a.epub", out)
        self.assertIn("5 bilder konverterade", out)
        self.assertIn("1 typsnitt borttagna", out)
        self.assertIn("→", out)

    def test_skip_existing_and_force(self):
        src = self.write("a.epub")
        dst = self.write("a.xteink.epub", b"old")
        code, out, _ = run(src)
        self.assertEqual(code, 0)
        self.assertEqual(dst.read_bytes(), b"old")
        self.assertIn("Hoppar över", out)
        self.assertEqual(run(src, "--force")[0], 0)
        self.assertNotEqual(dst.read_bytes(), b"old")

    def test_output_dir_created(self):
        src = self.write("a.epub")
        out_dir = self.tmp / "new" / "dir"
        self.assertEqual(run(src, "-o", out_dir)[0], 0)
        self.assertTrue((out_dir / "a.xteink.epub").exists())
        self.assertFalse((self.tmp / "a.xteink.epub").exists())

    def test_in_place(self):
        src = self.write("a.epub")
        self.assertEqual(run(src, "--in-place")[0], 0)
        self.assertLess(len(src.read_bytes()), len(self.book))
        self.assertEqual(sorted(p.name for p in self.tmp.iterdir()), ["a.epub"])  # no temp files

    def test_directory_batch_recursive_skips_outputs(self):
        self.write("one.epub")
        self.write("sub/two.epub")
        self.write("sub/old.xteink.epub")
        self.write("sub/notes.txt", b"x")
        code, out, _ = run(self.tmp)
        self.assertEqual(code, 0)
        self.assertTrue((self.tmp / "one.xteink.epub").exists())
        self.assertTrue((self.tmp / "sub" / "two.xteink.epub").exists())
        self.assertFalse((self.tmp / "sub" / "old.xteink.xteink.epub").exists())
        self.assertIn("2 konverterade", out)
        # a second run skips everything and still succeeds
        code, out, _ = run(self.tmp)
        self.assertEqual(code, 0)
        self.assertIn("0 konverterade, 2 hoppades över", out)

    def test_batch_with_output_dir_mirrors_structure(self):
        self.write("in/sub/two.epub")
        out_dir = self.tmp / "out"
        self.assertEqual(run(self.tmp / "in", "-o", out_dir)[0], 0)
        self.assertTrue((out_dir / "sub" / "two.xteink.epub").exists())

    def test_drm_book_fails_with_exit_1(self):
        drm = make_book("3.0", extra_files={"META-INF/rights.xml": b"<rights/>"})
        bad = self.write("drm.epub", drm)
        good = self.write("good.epub")
        code, out, err = run(self.tmp)
        self.assertEqual(code, 1)
        self.assertIn("DRM", err)
        self.assertFalse((self.tmp / "drm.xteink.epub").exists())
        self.assertTrue((self.tmp / "good.xteink.epub").exists())

    def test_bad_zip_exit_1(self):
        src = self.write("x.epub", b"junk")
        code, _, err = run(src)
        self.assertEqual(code, 1)
        self.assertIn("x.epub", err)

    def test_usage_errors_exit_2(self):
        self.assertEqual(run()[0], 2)
        self.assertEqual(run(self.tmp / "missing.epub")[0], 2)
        src = self.write("a.epub")
        self.assertEqual(run(src, "--levels", "8")[0], 2)
        self.assertEqual(run(src, "--in-place", "-o", self.tmp)[0], 2)
        self.assertEqual(run(src, "--quality", "0")[0], 2)
        self.assertEqual(run(src, "--keep-css", "--strip-css")[0], 2)
        self.assertEqual(run(self.write("t.txt", b"x"))[0], 2)

    def test_quiet_and_verbose(self):
        src = self.write("a.epub")
        code, out, _ = run(src, "-q")
        self.assertEqual((code, out), (0, ""))
        code, out, _ = run(src, "-v", "--force")
        self.assertIn("bild:", out)

    def test_options_reach_the_converter(self):
        from PIL import Image
        import zipfile
        src = self.write("a.epub")
        run(src, "--color", "--width", "200", "--height", "300", "--quality", "50", "--keep-fonts")
        zf = zipfile.ZipFile(self.tmp / "a.xteink.epub")
        im = Image.open(io.BytesIO(zf.read("OEBPS/img/photo.jpg")))
        self.assertEqual(im.mode, "RGB")
        self.assertLessEqual(im.width, 200)
        self.assertLessEqual(im.height, 300)
        self.assertIn("OEBPS/fonts/f.ttf", zf.namelist())

    def test_python_dash_m(self):
        import subprocess
        import sys
        env = dict(os.environ, PYTHONPATH=str(Path(__file__).resolve().parent.parent / "src"))
        r = subprocess.run([sys.executable, "-m", "xteink_epub", "--version"], env=env,
                           capture_output=True, text=True)
        self.assertEqual(r.returncode, 0)
        self.assertIn("xteink-epub", r.stdout)


class WatchTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, True)

    def test_watcher_needs_two_stable_polls(self):
        w = cli.Watcher(self.tmp)
        f = self.tmp / "a.epub"
        f.write_bytes(b"123")
        self.assertEqual(w.poll(), [])           # first sight
        f.write_bytes(b"1234567")                # still growing
        self.assertEqual(w.poll(), [])
        self.assertEqual(w.poll(), [f])          # same size twice
        self.assertEqual(w.poll(), [])           # not again
        f.write_bytes(b"changed!!!")             # changed -> picked up again
        self.assertEqual(w.poll(), [])
        self.assertEqual(w.poll(), [f])

    def test_watcher_ignores_outputs_and_other_files(self):
        w = cli.Watcher(self.tmp)
        (self.tmp / "a.xteink.epub").write_bytes(b"1")
        (self.tmp / "b.txt").write_bytes(b"1")
        (self.tmp / ".a.epub.xteink-tmp").write_bytes(b"1")
        (self.tmp / "sub").mkdir()
        (self.tmp / "sub" / "c.EPUB").write_bytes(b"1")
        w.poll()
        self.assertEqual(w.poll(), [self.tmp / "sub" / "c.EPUB"])

    def test_watcher_forgets_vanished_pending(self):
        w = cli.Watcher(self.tmp)
        f = self.tmp / "a.epub"
        f.write_bytes(b"1")
        w.poll()
        f.unlink()
        w.poll()
        self.assertEqual(w.pending, {})

    def test_watch_loop_converts_and_never_reprocesses_outputs(self):
        (self.tmp / "a.epub").write_bytes(make_book("3.0"))
        args = cli.build_parser().parse_args(["--watch", str(self.tmp), "-q"])
        sleeps = []
        out = cli.Output(True, False)
        from xteink_epub.epub import Options
        cli.watch(args, Options(), out, sleep=sleeps.append, max_polls=5)
        self.assertEqual(len(sleeps), 4)
        self.assertEqual(sorted(p.name for p in self.tmp.iterdir()), ["a.epub", "a.xteink.epub"])

    def test_watch_skips_up_to_date_outputs_at_start(self):
        (self.tmp / "a.epub").write_bytes(make_book("3.0"))
        (self.tmp / "a.xteink.epub").write_bytes(b"existing")
        args = cli.build_parser().parse_args(["--watch", str(self.tmp)])
        from xteink_epub.epub import Options
        cli.watch(args, Options(), cli.Output(True, False), sleep=lambda s: None, max_polls=4)
        self.assertEqual((self.tmp / "a.xteink.epub").read_bytes(), b"existing")

    def test_keyboard_interrupt_exits_cleanly(self):
        args = cli.build_parser().parse_args(["--watch", str(self.tmp)])
        from xteink_epub.epub import Options

        def boom(_):
            raise KeyboardInterrupt

        self.assertEqual(cli.watch(args, Options(), cli.Output(True, False), sleep=boom), 0)


if __name__ == "__main__":
    unittest.main()
