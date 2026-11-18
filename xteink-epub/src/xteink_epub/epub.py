"""The conversion pipeline for one EPUB, entirely in memory."""

import io
import os
import posixpath
import zipfile
from dataclasses import dataclass, field

from lxml import etree

from . import css, images
from .images import ImageOptions
from .refs import RefRewriter, resolve_ref
from .xhtml import (XhtmlOptions, parse_lenient, process_xhtml, rewrite_xml_refs,
                    serialize)

FONT_OBFUSCATION = {
    "http://www.idpf.org/2008/embedding",
    "http://ns.adobe.com/pdf/enc#RC",
}
XHTML_TYPES = {"application/xhtml+xml", "text/html"}
JUNK_NAMES = {
    ".ds_store", "thumbs.db", "desktop.ini", "itunesmetadata.plist",
    "itunesartwork", "calibre_bookmarks.txt",
}
FONT_EXTS = (".ttf", ".otf", ".woff", ".woff2")
MIMETYPE = b"application/epub+zip"
FIXED_DATE = (2000, 1, 1, 0, 0, 0)


class EpubError(Exception):
    """The book cannot be processed (message is user-facing, in Swedish)."""


class DrmError(EpubError):
    pass


@dataclass
class Options:
    width: int = 480
    height: int = 800
    quality: int = 85
    levels: int = 256
    dither: bool = True
    color: bool = False
    rotate_landscape: bool = False
    keep_fonts: bool = False
    keep_css: bool = False
    strip_css: bool = False

    def image_options(self):
        return ImageOptions(self.width, self.height, self.quality, self.levels,
                            self.dither, self.color, self.rotate_landscape)


@dataclass
class Report:
    size_before: int = 0
    size_after: int = 0
    images_converted: int = 0
    images_failed: int = 0
    fonts_removed: int = 0
    font_faces_removed: int = 0
    css_removed: int = 0
    svg_unwrapped: int = 0
    junk_removed: int = 0
    warnings: list = field(default_factory=list)
    notes: list = field(default_factory=list)  # verbose detail


def is_font(media_type, path):
    mt = (media_type or "").lower()
    return (
        mt.startswith(("font/", "application/font-", "application/x-font-"))
        or mt == "application/vnd.ms-opentype"
        or path.lower().endswith(FONT_EXTS)
    )


def check_drm(files):
    """Raise DrmError for rights.xml or non-font encryption."""
    if "META-INF/rights.xml" in files:
        raise DrmError("Boken är DRM-skyddad (rights.xml finns). DRM måste tas bort först.")
    enc = files.get("META-INF/encryption.xml")
    if enc is None:
        return
    try:
        root = parse_lenient(enc)
    except ValueError:
        return
    for data in root.iter("{*}EncryptedData"):
        method = data.find("{*}EncryptionMethod")
        algo = method.get("Algorithm") if method is not None else None
        if algo not in FONT_OBFUSCATION:
            raise DrmError("Boken är DRM-skyddad (krypterat innehåll i encryption.xml). "
                           "DRM måste tas bort först.")


def read_zip(data):
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise EpubError("Filen är ingen giltig EPUB (trasigt eller inget zip-arkiv).")
    files = {}
    dates = {}
    try:
        for info in zf.infolist():
            if info.is_dir():
                continue
            files[info.filename] = zf.read(info)
            dates[info.filename] = info.date_time
    except (zipfile.BadZipFile, RuntimeError, NotImplementedError, EOFError, OSError) as e:
        raise EpubError("Kunde inte läsa zip-arkivet: %s" % e)
    return files, dates


def find_opf(files):
    container = files.get("META-INF/container.xml")
    if container is not None:
        try:
            root = parse_lenient(container)
            for rf in root.iter("{*}rootfile"):
                path = rf.get("full-path")
                if path and path in files:
                    return path
        except ValueError:
            pass
    for name in files:
        if name.lower().endswith(".opf"):
            return name
    raise EpubError("Hittade ingen OPF-fil (META-INF/container.xml saknas eller är fel).")


class Book:
    """Mutable in-memory book plus the steps of the pipeline."""

    def __init__(self, files, dates, opts):
        self.files = files
        self.dates = dates
        self.opts = opts
        self.report = Report()
        self.deleted = set()
        self.renames = {}
        self.opf_path = find_opf(files)
        try:
            self.opf = parse_lenient(files[self.opf_path])
        except ValueError:
            raise EpubError("Kunde inte tolka OPF-filen (%s)." % self.opf_path)
        if etree.QName(self.opf).localname != "package":
            raise EpubError("OPF-filen saknar <package>-element.")
        self.opf_changed = False
        self.manifest = self.opf.find("{*}manifest")
        if self.manifest is None:
            raise EpubError("OPF-filen saknar <manifest>.")
        self.items = [(it, resolve_ref(it.get("href"), self.opf_path))
                      for it in self.manifest.findall("{*}item")]

    # ------------------------------------------------------------ helpers
    def item_for_path(self, path):
        return next((it for it, p in self.items if p == path), None)

    def warn(self, msg):
        self.report.warnings.append(msg)

    def delete(self, path):
        self.deleted.add(path)

    # ------------------------------------------------------------- images
    def convert_images(self):
        opts = self.opts.image_options()
        taken = {n.lower() for n in self.files}
        mapping = {}
        done = set()
        converted = set()
        for it, path in self.items:
            mt = (it.get("media-type") or "").lower()
            if mt not in images.RASTER_TYPES or path is None or path in done:
                continue
            done.add(path)
            if path not in self.files:
                self.warn("Bild saknas i arkivet: %s" % path)
                continue
            try:
                result = images.convert_image(self.files[path], opts)
            except Exception as e:  # Pillow raises many kinds
                self.report.images_failed += 1
                self.warn("Kunde inte konvertera bilden %s (%s), lämnas orörd" % (path, e))
                continue
            self.files[path] = result.data
            converted.add(path)
            self.report.images_converted += 1
            new_path = path
            if not path.lower().endswith((".jpg", ".jpeg")):
                stem = posixpath.splitext(path)[0]
                new_path = stem + ".jpg"
                n = 1
                while new_path.lower() in taken:
                    new_path = "%s_%d.jpg" % (stem, n)
                    n += 1
                taken.add(new_path.lower())
                mapping[path] = new_path
                self.renames[path] = new_path
            self.report.notes.append("bild: %s %dx%d -> %dx%d" % (
                new_path, *result.size_before, *result.size_after))
        # manifest: every item pointing at a converted image is now a JPEG
        for it, path in self.items:
            if path in converted:
                it.set("media-type", "image/jpeg")
                self.opf_changed = True
        self.rewriter = RefRewriter(mapping)

    # -------------------------------------------------------------- fonts
    def remove_fonts(self):
        removed = set()
        for it, path in list(self.items):
            if path and is_font(it.get("media-type"), path):
                removed.add(path)
                self.manifest.remove(it)
                self.items.remove((it, path))
                self.opf_changed = True
                if path in self.files:
                    self.delete(path)
                    self.report.fonts_removed += 1
        self.removed_fonts = removed
        enc_name = "META-INF/encryption.xml"
        if removed and enc_name in self.files:
            try:
                root = parse_lenient(self.files[enc_name])
            except ValueError:
                return
            for data in list(root.iter("{*}EncryptedData")):
                ref = next(iter(data.iter("{*}CipherReference")), None)
                uri = ref.get("URI") if ref is not None else None
                if uri and resolve_ref(uri, "mimetype") in removed:
                    data.getparent().remove(data)
            if next(root.iter("{*}EncryptedData"), None) is None:
                self.delete(enc_name)
            else:
                self.files[enc_name] = serialize(root)

    def remove_stylesheets(self):
        removed = set()
        for it, path in list(self.items):
            if path and (it.get("media-type") or "").lower() == "text/css":
                removed.add(path)
                self.manifest.remove(it)
                self.items.remove((it, path))
                self.opf_changed = True
                if path in self.files:
                    self.delete(path)
                    self.report.css_removed += 1
        self.removed_css = removed

    # -------------------------------------------------------- file passes
    def process_files(self):
        removed = frozenset(getattr(self, "removed_fonts", set()) | getattr(self, "removed_css", set()))
        xopts = XhtmlOptions(
            rewrite=self.rewriter, removed_paths=removed,
            remove_fonts=not self.opts.keep_fonts,
            simplify_css=not self.opts.keep_css and not self.opts.strip_css,
            strip_css=self.opts.strip_css,
        )
        css_base = css.CssOptions(
            remove_fonts=not self.opts.keep_fonts,
            simplify=not self.opts.keep_css,
        )
        self.unwrapped = []
        for it, path in self.items:
            if path is None or path not in self.files or path in self.deleted:
                continue
            mt = (it.get("media-type") or "").lower()
            if mt in XHTML_TYPES:
                res = process_xhtml(self.files[path], path, xopts)
                self.report.warnings.extend(res.warnings)
                self.report.font_faces_removed += res.font_faces_removed
                if res.data is not None:
                    self.files[path] = res.data
                if res.svg_unwrapped:
                    self.report.svg_unwrapped += 1
                    if not res.has_svg:
                        self.unwrapped.append(it)
            elif mt == "text/css":
                self._process_css(path, css_base)
            elif mt in ("application/x-dtbncx+xml", "image/svg+xml"):
                self._rewrite_xml_file(path)

    def _process_css(self, path, base):
        raw = self.files[path]
        try:
            text = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = raw.decode("latin-1")
        rewrite = self.rewriter
        opts = css.CssOptions(base.remove_fonts, base.simplify,
                              url_rewriter=lambda u: rewrite(u, path))
        new, stats = css.process_stylesheet(text, opts)
        self.report.font_faces_removed += stats.font_faces_removed
        if stats.changes:
            self.files[path] = new.encode("utf-8")

    def _rewrite_xml_file(self, path):
        try:
            root = parse_lenient(self.files[path])
        except ValueError:
            self.warn("%s: kunde inte tolkas, lämnas orörd" % path)
            return
        if rewrite_xml_refs(root, path, self.rewriter):
            self.files[path] = serialize(root)

    # ---------------------------------------------------------------- OPF
    def finish_opf(self):
        # hrefs of manifest items and guide references to renamed images
        if rewrite_xml_refs(self.opf, self.opf_path, self.rewriter):
            self.opf_changed = True
        # an unwrapped svg page no longer needs the svg property
        spine = self.opf.find("{*}spine")
        for it in self.unwrapped:
            self._drop_token(it, "properties", "svg")
            if spine is not None:
                for ref in spine.findall("{*}itemref"):
                    if ref.get("idref") == it.get("id"):
                        self._drop_token(ref, "properties", "svg")
        self.ensure_cover()
        if self.opf_changed:
            self.files[self.opf_path] = serialize(self.opf)

    def _drop_token(self, el, attr, token):
        tokens = (el.get(attr) or "").split()
        if token not in tokens:
            return
        tokens.remove(token)
        if tokens:
            el.set(attr, " ".join(tokens))
        else:
            del el.attrib[attr]
        self.opf_changed = True

    def find_cover(self):
        def is_image(it):
            return (it.get("media-type") or "").lower().startswith("image/")

        for it, _ in self.items:
            if "cover-image" in (it.get("properties") or "").split():
                return it
        metadata = self.opf.find("{*}metadata")
        if metadata is not None:
            for meta in metadata.findall("{*}meta"):
                if (meta.get("name") or "").lower() == "cover":
                    it = next((i for i, _ in self.items if i.get("id") == meta.get("content")), None)
                    if it is not None and is_image(it):
                        return it
        guide = self.opf.find("{*}guide")
        if guide is not None:
            for ref in guide.findall("{*}reference"):
                if (ref.get("type") or "").lower() == "cover":
                    it = self.item_for_path(resolve_ref(ref.get("href"), self.opf_path))
                    if it is not None and is_image(it):
                        return it
        candidates = [it for it, p in self.items
                      if is_image(it) and "cover" in ((it.get("id") or "") + " " + (p or "")).lower()]
        for it in candidates:
            if (it.get("id") or "").lower() in ("cover", "cover-image", "coverimage"):
                return it
        return candidates[0] if candidates else None

    def ensure_cover(self):
        cover = self.find_cover()
        metadata = self.opf.find("{*}metadata")
        if cover is None or metadata is None or not cover.get("id"):
            return
        cid = cover.get("id")
        metas = [m for m in metadata.findall("{*}meta") if (m.get("name") or "").lower() == "cover"]
        if not metas:
            ns = etree.QName(self.opf).namespace
            meta = etree.SubElement(metadata, "{%s}meta" % ns if ns else "meta")
            meta.set("name", "cover")
            meta.set("content", cid)
            self.opf_changed = True
        else:
            for m in metas:
                if m.get("content") != cid:
                    m.set("content", cid)
                    self.opf_changed = True
        if (self.opf.get("version") or "2.0").startswith("3"):
            props = (cover.get("properties") or "").split()
            if "cover-image" not in props:
                cover.set("properties", " ".join(props + ["cover-image"]))
                self.opf_changed = True

    # -------------------------------------------------------------- junk
    def remove_junk(self):
        manifest_paths = {p for _, p in self.items}
        for name in list(self.files):
            if name in manifest_paths or name in self.deleted:
                continue
            parts = name.split("/")
            if "__MACOSX" in parts or parts[-1].lower() in JUNK_NAMES:
                self.delete(name)
                self.report.junk_removed += 1

    # -------------------------------------------------------------- pack
    def pack(self):
        out = io.BytesIO()
        with zipfile.ZipFile(out, "w") as zf:
            info = zipfile.ZipInfo("mimetype", FIXED_DATE)
            info.compress_type = zipfile.ZIP_STORED
            info.external_attr = 0o644 << 16
            zf.writestr(info, MIMETYPE)
            for name, data in self.files.items():
                if name == "mimetype" or name in self.deleted:
                    continue
                info = zipfile.ZipInfo(self.renames.get(name, name), self.dates.get(name, FIXED_DATE))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o644 << 16
                zf.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
        return out.getvalue()


def convert_epub(data, opts):
    """Convert EPUB bytes. Returns (new bytes, Report). Raises EpubError/DrmError."""
    files, dates = read_zip(data)
    check_drm(files)
    book = Book(files, dates, opts)
    book.report.size_before = len(data)
    book.convert_images()
    if not opts.keep_fonts:
        book.remove_fonts()
    if opts.strip_css:
        book.remove_stylesheets()
    book.process_files()
    book.finish_opf()
    book.remove_junk()
    packed = book.pack()
    book.report.size_after = len(packed)
    return packed, book.report


def convert_file(src, dst, opts):
    """Convert the file src to dst (atomically, via a temp file). Returns Report."""
    with open(src, "rb") as f:
        data = f.read()
    packed, report = convert_epub(data, opts)
    tmp = os.path.join(os.path.dirname(os.path.abspath(dst)),
                       ".%s.xteink-tmp" % os.path.basename(dst))
    try:
        with open(tmp, "wb") as f:
            f.write(packed)
        os.replace(tmp, dst)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    return report
