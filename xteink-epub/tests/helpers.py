"""Builders for synthetic EPUBs (no binary fixtures)."""

import io
import os
import sys
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))

from PIL import Image  # noqa: E402

CONTAINER = """<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>"""


def make_image(fmt, size=(1200, 1600), mode="RGB", **save_kwargs):
    im = Image.new(mode, size)
    px = im.load()
    for x in range(0, size[0], 7):
        for y in range(0, size[1], 7):
            v = (x * 255 // size[0], y * 255 // size[1], (x + y) % 256)
            px[x, y] = v if mode in ("RGB", "RGBA") else (v[0] if mode in ("L", "P") else v)
    out = io.BytesIO()
    im.save(out, fmt, **save_kwargs)
    return out.getvalue()


def xhtml(body, head="", ns=True):
    return ('<?xml version="1.0" encoding="utf-8"?>\n'
            '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>t</title>%s</head>'
            '<body>%s</body></html>' % (head, body)).encode()


def opf(items, version="3.0", meta="", spine=None, guide=""):
    manifest = "".join(
        '<item id="%s" href="%s" media-type="%s"%s/>' % (i, h, m, (' properties="%s"' % p) if p else "")
        for i, h, m, p in items)
    spine = spine if spine is not None else [i for i, h, m, p in items if m == "application/xhtml+xml"]
    return ('<?xml version="1.0" encoding="utf-8"?>\n'
            '<package xmlns="http://www.idpf.org/2007/opf" version="%s" unique-identifier="id">'
            '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>T</dc:title>'
            '<dc:identifier id="id">x</dc:identifier>%s</metadata>'
            '<manifest>%s</manifest><spine>%s</spine>%s</package>' % (
                version, meta, manifest,
                "".join('<itemref idref="%s"/>' % s for s in spine), guide)).encode()


def build_epub(files, mimetype=b"application/epub+zip", container=CONTAINER.encode()):
    """files: {path: bytes}. mimetype is written first (stored)."""
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as zf:
        if mimetype is not None:
            zf.writestr(zipfile.ZipInfo("mimetype"), mimetype, compress_type=zipfile.ZIP_STORED)
        if container is not None:
            zf.writestr("META-INF/container.xml", container, compress_type=zipfile.ZIP_DEFLATED)
        for name, data in files.items():
            zf.writestr(name, data, compress_type=zipfile.ZIP_DEFLATED)
    return out.getvalue()


def read_epub(data):
    zf = zipfile.ZipFile(io.BytesIO(data))
    return zf, {n: zf.read(n) for n in zf.namelist()}
