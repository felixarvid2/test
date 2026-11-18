import io
import unittest
import zipfile

from helpers import *  # noqa: F401,F403
from PIL import Image
from lxml import etree

from xteink_epub import css
from xteink_epub.epub import DrmError, EpubError, Options, convert_epub
from xteink_epub.refs import resolve_ref

ENC_NS = "urn:oasis:names:tc:opendocument:xmlns:container"
XLINK = "http://www.w3.org/1999/xlink"


def encryption_xml(*uris, algo="http://www.idpf.org/2008/embedding"):
    body = "".join(
        '<enc:EncryptedData xmlns:enc="http://www.w3.org/2001/04/xmlenc#">'
        '<enc:EncryptionMethod Algorithm="%s"/><enc:CipherData>'
        '<enc:CipherReference URI="%s"/></enc:CipherData></enc:EncryptedData>' % (algo, u)
        for u in uris)
    return ('<?xml version="1.0"?><encryption xmlns="%s">%s</encryption>' % (ENC_NS, body)).encode()


def open_image(data):
    return Image.open(io.BytesIO(data))


def alpha_png():
    im = Image.new("RGBA", (300, 400), (255, 0, 0, 0))  # fully transparent
    for x in range(100, 200):
        for y in range(100, 200):
            im.putpixel((x, y), (0, 0, 0, 255))
    out = io.BytesIO()
    im.save(out, "PNG")
    return out.getvalue()


def dangling_refs(files, opf_path="OEBPS/content.opf"):
    """Every local reference in xhtml/css/opf/ncx that points to a missing file."""
    names = set(files)
    bad = []

    def check(ref, base):
        target = resolve_ref(ref, base)
        if target is not None and target not in names:
            bad.append((base, ref))

    for name, data in files.items():
        low = name.lower()
        if low.endswith((".xhtml", ".html", ".opf", ".ncx")):
            root = etree.fromstring(data)
            for el in root.iter():
                if not isinstance(el.tag, str):
                    continue
                for attr, val in el.attrib.items():
                    if etree.QName(attr).localname in ("src", "href", "poster", "data"):
                        check(val, name)
        elif low.endswith(".css"):
            css.rewrite_css_urls(data.decode(), lambda u, n=name: check(u, n))
    return bad


def make_book(version="3.0", fonts=True, extra_files=None, css_text=None):
    ver3 = version.startswith("3")
    items = [
        ("ch1", "ch1.xhtml", "application/xhtml+xml", None),
        ("css", "css/style.css", "text/css", None),
        ("cover", "img/cover.png", "image/png", "cover-image" if ver3 else None),
        ("photo", "img/photo.jpg", "image/jpeg", None),
        ("pic", "img/pic.webp", "image/webp", None),
        ("anim", "img/my%20anim.gif", "image/gif", None),
        ("small", "img/small.png", "image/png", None),
        ("svgimg", "img/vector.svg", "image/svg+xml", None),
    ]
    if fonts:
        items.append(("font", "fonts/f.ttf", "font/ttf", None))
    if not ver3:
        items.append(("ncx", "toc.ncx", "application/x-dtbncx+xml", None))
    meta = "" if ver3 else '<meta name="cover" content="cover"/>'
    files = {
        "OEBPS/content.opf": opf(items, version=version, meta=meta,
                                 guide='<guide><reference type="cover" title="c" href="img/cover.png"/></guide>'),
        "OEBPS/ch1.xhtml": xhtml(
            '<p>hej</p><img src="img/cover.png" alt=""/>'
            '<img src="img/pic.webp" srcset="img/pic.webp 1x, img/small.png 2x" alt=""/>'
            '<a href="img/my%20anim.gif#top"><img src="img/my%20anim.gif" alt=""/></a>'
            '<img src="img/photo.jpg" style="width:900px" alt=""/>'
            '<img src="img/vector.svg" alt=""/><p style="position:absolute;color:red">x</p>'
            '<script>alert(1)</script>',
            head='<link rel="stylesheet" href="css/style.css"/><style>@font-face{font-family:X;src:url(fonts/f.ttf)}'
                 'p{font-size:12pt}</style>'),
        "OEBPS/css/style.css": (css_text or (
            "@font-face{font-family:'Foo';src:url('../fonts/f.ttf')}"
            "body{background:url(../img/small.png);font-size:12pt;font-family:'Foo',serif;margin:8px}"
            ".c{background:url(../img/vector.svg)}")).encode(),
        "OEBPS/img/cover.png": alpha_png(),
        "OEBPS/img/photo.jpg": make_image("JPEG", (2000, 3000), progressive=True),
        "OEBPS/img/pic.webp": make_image("WEBP", (1000, 600)),
        "OEBPS/img/my anim.gif": make_image("GIF", (640, 480), mode="P"),
        "OEBPS/img/small.png": make_image("PNG", (100, 50)),
        "OEBPS/img/vector.svg": b'<svg xmlns="http://www.w3.org/2000/svg"><image xmlns:xlink="%s" xlink:href="small.png"/></svg>' % XLINK.encode(),
    }
    if fonts:
        files["OEBPS/fonts/f.ttf"] = b"fakefont"
        files["META-INF/encryption.xml"] = encryption_xml("OEBPS/fonts/f.ttf")
    if not ver3:
        files["OEBPS/toc.ncx"] = (
            '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap><navPoint id="a">'
            '<content src="ch1.xhtml#x"/></navPoint></navMap></ncx>').encode()
    files.update(extra_files or {})
    return build_epub(files)


def convert(data, **kw):
    out, report = convert_epub(data, Options(**kw))
    zf, files = read_epub(out)
    return zf, files, report


class PipelineTests(unittest.TestCase):
    def test_epub3_images_and_references(self):
        zf, files, report = convert(make_book("3.0"))
        # progressive jpeg -> baseline, fits the box
        photo = open_image(files["OEBPS/img/photo.jpg"])
        self.assertFalse(photo.info.get("progressive") or photo.info.get("progression"))
        self.assertLessEqual(photo.width, 480)
        self.assertLessEqual(photo.height, 800)
        self.assertEqual(photo.mode, "L")
        # png with alpha -> jpeg on white, renamed
        self.assertNotIn("OEBPS/img/cover.png", files)
        cover = open_image(files["OEBPS/img/cover.jpg"])
        self.assertEqual(cover.format, "JPEG")
        self.assertGreater(cover.getpixel((5, 5)), 240)       # transparent -> white
        self.assertLess(cover.getpixel((150, 150)), 40)  # black square
        # webp, gif
        self.assertEqual(open_image(files["OEBPS/img/pic.jpg"]).format, "JPEG")
        self.assertEqual(open_image(files["OEBPS/img/my anim.jpg"]).format, "JPEG")
        # small image is never upscaled
        self.assertEqual(open_image(files["OEBPS/img/small.jpg"]).size, (100, 50))
        # references
        self.assertEqual(dangling_refs(files), [])
        ch1 = files["OEBPS/ch1.xhtml"].decode()
        self.assertIn('src="img/cover.jpg"', ch1)
        self.assertIn('src="img/my%20anim.jpg"', ch1)
        self.assertIn("my%20anim.jpg#top", ch1)
        self.assertNotIn("srcset", ch1)
        self.assertIn('src="img/pic.jpg"', ch1)
        self.assertIn('src="img/vector.svg"', ch1)  # unknown (non raster) stays
        self.assertNotIn("<script", ch1)
        self.assertNotIn("alert", ch1)
        self.assertNotIn("position", ch1)
        self.assertIn("width:900px", ch1)  # image keeps its size
        css_text = files["OEBPS/css/style.css"].decode()
        self.assertIn("../img/small.jpg", css_text)
        self.assertIn("../img/vector.svg", css_text)
        opf_text = files["OEBPS/content.opf"].decode()
        self.assertIn('href="img/cover.jpg"', opf_text)
        self.assertIn('href="img/my%20anim.jpg"', opf_text)
        self.assertNotIn(".png", opf_text)
        self.assertNotIn(".webp", opf_text)
        # svg file's inner raster reference follows
        self.assertIn('href="small.jpg"', files["OEBPS/img/vector.svg"].decode())
        self.assertEqual(report.images_converted, 5)

    def test_epub3_cover_and_manifest_types(self):
        _, files, _ = convert(make_book("3.0"))
        root = etree.fromstring(files["OEBPS/content.opf"])
        items = {i.get("id"): i for i in root.iter("{*}item")}
        self.assertEqual(items["cover"].get("media-type"), "image/jpeg")
        self.assertIn("cover-image", items["cover"].get("properties").split())
        meta = [m for m in root.iter("{*}meta") if m.get("name") == "cover"]
        self.assertEqual([m.get("content") for m in meta], ["cover"])
        guide_ref = next(root.iter("{*}reference"))
        self.assertEqual(guide_ref.get("href"), "img/cover.jpg")

    def test_epub2_cover_property_and_ncx(self):
        _, files, _ = convert(make_book("2.0"))
        root = etree.fromstring(files["OEBPS/content.opf"])
        items = {i.get("id"): i for i in root.iter("{*}item")}
        self.assertIsNone(items["cover"].get("properties"))  # EPUB2: no property
        self.assertEqual(items["cover"].get("href"), "img/cover.jpg")
        self.assertIn(b"ch1.xhtml#x", files["OEBPS/toc.ncx"])
        self.assertEqual(dangling_refs(files), [])

    def test_cover_added_when_only_guessable(self):
        book = build_epub({
            "OEBPS/content.opf": opf([("c1", "c1.xhtml", "application/xhtml+xml", None),
                                      ("front-cover", "img/front-cover.png", "image/png", None)],
                                     version="3.0"),
            "OEBPS/c1.xhtml": xhtml("<p>x</p>"),
            "OEBPS/img/front-cover.png": make_image("PNG", (50, 50)),
        })
        _, files, _ = convert(book)
        root = etree.fromstring(files["OEBPS/content.opf"])
        item = next(i for i in root.iter("{*}item") if i.get("id") == "front-cover")
        self.assertIn("cover-image", item.get("properties"))
        meta = next(m for m in root.iter("{*}meta") if m.get("name") == "cover")
        self.assertEqual(meta.get("content"), "front-cover")

    def test_levels_and_dither(self):
        book = make_book("3.0")
        for dither in (True, False):
            _, files, _ = convert(book, levels=4, dither=dither)
            im = open_image(files["OEBPS/img/photo.jpg"]).convert("L")
            hist = im.histogram()
            levels = (0, 85, 170, 255)
            near = sum(sum(hist[max(0, v - 25):v + 26]) for v in levels)
            self.assertGreater(near / sum(hist), 0.9, "dither=%s" % dither)

    def test_color_kept(self):
        _, files, _ = convert(make_book("3.0"), color=True)
        self.assertEqual(open_image(files["OEBPS/img/photo.jpg"]).mode, "RGB")
        _, files, _ = convert(make_book("3.0"))
        self.assertEqual(open_image(files["OEBPS/img/photo.jpg"]).mode, "L")

    def test_rotate_landscape(self):
        book = build_epub({
            "OEBPS/content.opf": opf([("c1", "c1.xhtml", "application/xhtml+xml", None),
                                      ("i", "i.png", "image/png", None),
                                      ("j", "j.png", "image/png", None)]),
            "OEBPS/c1.xhtml": xhtml("<p>x</p>"),
            "OEBPS/i.png": make_image("PNG", (1600, 900)),
            "OEBPS/j.png": make_image("PNG", (300, 200)),  # landscape but fits the width
        })
        _, files, _ = convert(book, rotate_landscape=True)
        self.assertEqual(open_image(files["OEBPS/i.jpg"]).size, (450, 800))
        self.assertEqual(open_image(files["OEBPS/j.jpg"]).size, (300, 200))
        _, files, _ = convert(book)
        self.assertEqual(open_image(files["OEBPS/i.jpg"]).size, (480, 270))

    def test_rename_avoids_collision(self):
        book = build_epub({
            "OEBPS/content.opf": opf([("c1", "c1.xhtml", "application/xhtml+xml", None),
                                      ("a", "a.png", "image/png", None),
                                      ("b", "a.jpg", "image/jpeg", None)]),
            "OEBPS/c1.xhtml": xhtml('<img src="a.png"/><img src="a.jpg"/>'),
            "OEBPS/a.png": make_image("PNG", (40, 40)),
            "OEBPS/a.jpg": make_image("JPEG", (60, 60)),
        })
        _, files, _ = convert(book)
        self.assertEqual(open_image(files["OEBPS/a.jpg"]).size, (60, 60))
        self.assertEqual(open_image(files["OEBPS/a_1.jpg"]).size, (40, 40))
        self.assertIn('src="a_1.jpg"', files["OEBPS/c1.xhtml"].decode())
        self.assertEqual(dangling_refs(files), [])

    def test_broken_image_is_left_alone_with_warning(self):
        book = build_epub({
            "OEBPS/content.opf": opf([("c1", "c1.xhtml", "application/xhtml+xml", None),
                                      ("a", "bad.png", "image/png", None)]),
            "OEBPS/c1.xhtml": xhtml('<img src="bad.png"/>'),
            "OEBPS/bad.png": b"not an image",
        })
        _, files, report = convert(book)
        self.assertEqual(files["OEBPS/bad.png"], b"not an image")
        self.assertIn('src="bad.png"', files["OEBPS/c1.xhtml"].decode())
        self.assertEqual(len(report.warnings), 1)
        root = etree.fromstring(files["OEBPS/content.opf"])
        self.assertEqual(next(i for i in root.iter("{*}item") if i.get("id") == "a").get("media-type"), "image/png")

    def test_fonts_removed(self):
        zf, files, report = convert(make_book("3.0"))
        self.assertNotIn("OEBPS/fonts/f.ttf", files)
        self.assertNotIn("META-INF/encryption.xml", files)
        self.assertNotIn(b"fonts/f.ttf", files["OEBPS/content.opf"])
        self.assertNotIn("font-face", files["OEBPS/css/style.css"].decode())
        self.assertIn("font-family:serif", files["OEBPS/css/style.css"].decode())
        self.assertNotIn("Foo", files["OEBPS/css/style.css"].decode())
        self.assertNotIn("font-face", files["OEBPS/ch1.xhtml"].decode())
        self.assertEqual(report.fonts_removed, 1)
        self.assertEqual(dangling_refs(files), [])

    def test_encryption_xml_keeps_other_entries(self):
        book = make_book("3.0", extra_files={
            "META-INF/encryption.xml": encryption_xml("OEBPS/fonts/f.ttf", "OEBPS/fonts/other.otf"),
            "OEBPS/fonts/other.otf": b"x"})
        _, files, _ = convert(book)
        enc = files["META-INF/encryption.xml"]
        self.assertNotIn(b"f.ttf", enc)
        self.assertIn(b"other.otf", enc)

    def test_keep_fonts(self):
        _, files, report = convert(make_book("3.0"), keep_fonts=True)
        self.assertEqual(files["OEBPS/fonts/f.ttf"], b"fakefont")
        self.assertIn(b"f.ttf", files["META-INF/encryption.xml"])
        self.assertIn("font-face", files["OEBPS/css/style.css"].decode())
        self.assertEqual(report.fonts_removed, 0)

    def test_keep_css_only_touches_fonts(self):
        _, files, _ = convert(make_book("3.0"), keep_css=True)
        css_text = files["OEBPS/css/style.css"].decode()
        self.assertIn("font-size:12pt", css_text)
        self.assertIn("margin:8px", css_text)
        self.assertNotIn("font-face", css_text)
        self.assertIn("position:absolute", files["OEBPS/ch1.xhtml"].decode())

    def test_simplify_css(self):
        _, files, _ = convert(make_book("3.0"))
        css_text = files["OEBPS/css/style.css"].decode()
        self.assertIn("font-size:1em", css_text)
        self.assertIn("margin:0", css_text)

    def test_strip_css(self):
        _, files, _ = convert(make_book("3.0"), strip_css=True)
        self.assertNotIn("OEBPS/css/style.css", files)
        ch1 = files["OEBPS/ch1.xhtml"].decode()
        self.assertNotIn("<style", ch1)
        self.assertNotIn("stylesheet", ch1)
        self.assertNotIn("style=", ch1)
        self.assertNotIn(b"style.css", files["OEBPS/content.opf"])
        self.assertEqual(dangling_refs(files), [])

    def test_svg_cover_unwrapped(self):
        page = xhtml('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="%s" viewBox="0 0 600 800">'
                     '<image width="600" height="800" xlink:href="cover.png"/></svg>' % XLINK)
        book = build_epub({
            "OEBPS/content.opf": opf([("cp", "cover.xhtml", "application/xhtml+xml", "svg"),
                                      ("ci", "cover.png", "image/png", "cover-image"),
                                      ("c1", "c1.xhtml", "application/xhtml+xml", "svg scripted")],
                                     spine=["cp", "c1"]),
            "OEBPS/cover.xhtml": page,
            "OEBPS/c1.xhtml": xhtml('<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>'),
            "OEBPS/cover.png": make_image("PNG", (600, 800)),
        })
        _, files, report = convert(book)
        text = files["OEBPS/cover.xhtml"].decode()
        self.assertNotIn("<svg", text)
        self.assertIn('<div style="text-align:center"><img src="cover.jpg" alt="" '
                      'style="max-width:100%;max-height:100%"/></div>', text)
        root = etree.fromstring(files["OEBPS/content.opf"])
        items = {i.get("id"): i for i in root.iter("{*}item")}
        self.assertIsNone(items["cp"].get("properties"))
        self.assertEqual(items["c1"].get("properties"), "svg scripted")  # real svg page untouched
        self.assertIn("<svg", files["OEBPS/c1.xhtml"].decode())
        self.assertEqual(report.svg_unwrapped, 1)
        self.assertEqual(dangling_refs(files), [])

    def test_svg_with_href_without_xlink(self):
        page = xhtml('<div><svg xmlns="http://www.w3.org/2000/svg"><image href="c.png"/></svg></div>')
        book = build_epub({
            "OEBPS/content.opf": opf([("p", "p.xhtml", "application/xhtml+xml", None),
                                      ("c", "c.png", "image/png", None)]),
            "OEBPS/p.xhtml": page,
            "OEBPS/c.png": make_image("PNG", (30, 30)),
        })
        _, files, _ = convert(book)
        self.assertIn('src="c.jpg"', files["OEBPS/p.xhtml"].decode())

    def test_html_entities_survive(self):
        page = (b'<?xml version="1.0"?><!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" '
                b'"http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd"><html xmlns="http://www.w3.org/1999/xhtml">'
                b'<head><title>t</title></head><body><p>a&nbsp;b</p><script>x</script></body></html>')
        book = build_epub({
            "OEBPS/content.opf": opf([("p", "p.xhtml", "application/xhtml+xml", None)]),
            "OEBPS/p.xhtml": page,
        })
        _, files, _ = convert(book)
        out = files["OEBPS/p.xhtml"].decode()
        self.assertIn("a b", out)
        self.assertIn("<!DOCTYPE html PUBLIC", out)
        self.assertTrue(out.startswith("<?xml"))
        self.assertNotIn("<script", out)

    def test_junk_removed_only_when_not_in_manifest(self):
        extra = {"__MACOSX/x": b"1", "OEBPS/.DS_Store": b"1", "Thumbs.db": b"1",
                 "iTunesMetadata.plist": b"1", "calibre_bookmarks.txt": b"1", "OEBPS/desktop.ini": b"1"}
        _, files, report = convert(make_book("3.0", extra_files=extra))
        for name in extra:
            self.assertNotIn(name, files)
        self.assertEqual(report.junk_removed, 6)
        items = [("p", "p.xhtml", "application/xhtml+xml", None), ("t", "Thumbs.db", "application/octet-stream", None)]
        book = build_epub({"OEBPS/content.opf": opf(items), "OEBPS/p.xhtml": xhtml("<p/>"),
                           "OEBPS/Thumbs.db": b"keepme"})
        _, files, _ = convert(book)
        self.assertEqual(files["OEBPS/Thumbs.db"], b"keepme")

    def test_untouched_files_byte_identical(self):
        notes = b"\x00\x01 some binary \xff"
        page = xhtml("<p>plain</p>")
        book = build_epub({
            "OEBPS/content.opf": opf([("p", "p.xhtml", "application/xhtml+xml", None),
                                      ("d", "data.bin", "application/octet-stream", None)]),
            "OEBPS/p.xhtml": page, "OEBPS/data.bin": notes})
        _, files, _ = convert(book)
        self.assertEqual(files["OEBPS/data.bin"], notes)
        self.assertEqual(files["OEBPS/p.xhtml"], page)

    def test_mimetype_first_and_stored(self):
        zf, files, _ = convert(make_book("3.0"))
        first = zf.infolist()[0]
        self.assertEqual(first.filename, "mimetype")
        self.assertEqual(first.compress_type, zipfile.ZIP_STORED)
        self.assertEqual(files["mimetype"], b"application/epub+zip")
        for info in zf.infolist()[1:]:
            self.assertEqual(info.compress_type, zipfile.ZIP_DEFLATED)

    def test_missing_mimetype_is_added(self):
        book = build_epub({"OEBPS/content.opf": opf([("p", "p.xhtml", "application/xhtml+xml", None)]),
                           "OEBPS/p.xhtml": xhtml("<p/>")}, mimetype=None)
        zf, files, _ = convert(book)
        self.assertEqual(zf.infolist()[0].filename, "mimetype")

    def test_size_shrinks(self):
        data = make_book("3.0")
        out, report = convert_epub(data, Options())
        self.assertEqual(report.size_before, len(data))
        self.assertEqual(report.size_after, len(out))
        self.assertLess(len(out), len(data))


class RefusalTests(unittest.TestCase):
    def test_bad_zip(self):
        with self.assertRaises(EpubError):
            convert_epub(b"this is not a zip", Options())

    def test_rights_xml_is_drm(self):
        book = make_book("3.0", extra_files={"META-INF/rights.xml": b"<rights/>"})
        with self.assertRaises(DrmError):
            convert_epub(book, Options())

    def test_encryption_other_algorithm_is_drm(self):
        book = make_book("3.0", extra_files={"META-INF/encryption.xml": encryption_xml(
            "OEBPS/ch1.xhtml", algo="http://www.w3.org/2001/04/xmlenc#aes128-cbc")})
        with self.assertRaises(DrmError):
            convert_epub(book, Options())

    def test_adobe_font_obfuscation_is_not_drm(self):
        book = make_book("3.0", extra_files={"META-INF/encryption.xml": encryption_xml(
            "OEBPS/fonts/f.ttf", algo="http://ns.adobe.com/pdf/enc#RC")})
        convert_epub(book, Options())

    def test_missing_container(self):
        book = build_epub({"x.txt": b"1"}, container=None)
        with self.assertRaises(EpubError):
            convert_epub(book, Options())


class ResolveTests(unittest.TestCase):
    def test_resolve(self):
        self.assertEqual(resolve_ref("../img/a%20b.png#x", "OEBPS/css/s.css"), "OEBPS/img/a b.png")
        self.assertIsNone(resolve_ref("http://x/y.png", "a.xhtml"))
        self.assertIsNone(resolve_ref("#frag", "a.xhtml"))
        self.assertIsNone(resolve_ref("../../x.png", "a.xhtml"))
        self.assertEqual(resolve_ref("x.png", "a.xhtml"), "x.png")


if __name__ == "__main__":
    unittest.main()
