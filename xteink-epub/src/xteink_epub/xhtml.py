"""XHTML / XML handling: lenient parsing, cleaning, reference rewriting, SVG unwrapping."""

import html.entities
import re
from dataclasses import dataclass, field

from lxml import etree

from . import css
from .refs import resolve_ref

XLINK = "http://www.w3.org/1999/xlink"
_REF_ATTRS = {"src", "href", "poster", "data"}
_XML_ENTITIES = {"lt", "gt", "amp", "quot", "apos"}
_NAMED_ENTITY = re.compile(rb"&([A-Za-z][A-Za-z0-9]*);")
_IMG_TAGS = {"img", "svg", "image", "picture", "video"}


def _parser(recover):
    return etree.XMLParser(
        resolve_entities=False, no_network=True, huge_tree=True,
        recover=recover, remove_blank_text=False,
    )


def _numeric_entities(data):
    def sub(m):
        name = m.group(1).decode("ascii")
        if name in _XML_ENTITIES:
            return m.group(0)
        cp = html.entities.name2codepoint.get(name)
        return b"&#%d;" % cp if cp else m.group(0)

    return _NAMED_ENTITY.sub(sub, data)


def parse_lenient(data):
    """Parse XML bytes: with HTML entities made numeric (&nbsp; -> &#160;), then as is,
    then recovering. Returns the root element; raises ValueError if hopeless."""
    attempts = (
        (lambda: etree.fromstring(_numeric_entities(data), _parser(False))),
        (lambda: etree.fromstring(data, _parser(False))),
        (lambda: etree.fromstring(_numeric_entities(data), _parser(True))),
    )
    for attempt in attempts:
        try:
            root = attempt()
        except etree.XMLSyntaxError:
            continue
        if root is not None:
            return root
    raise ValueError("kunde inte tolka XML")


def serialize(root):
    return etree.tostring(root.getroottree(), xml_declaration=True, encoding="utf-8")


def local(el):
    return etree.QName(el).localname if isinstance(el.tag, str) else ""


def remove_element(el):
    """Remove el but keep its tail text."""
    parent = el.getparent()
    if parent is None:
        return
    if el.tail:
        prev = el.getprevious()
        if prev is not None:
            prev.tail = (prev.tail or "") + el.tail
        else:
            parent.text = (parent.text or "") + el.tail
    parent.remove(el)


def rewrite_xml_refs(root, base_file, rewrite):
    """Rewrite src/href/xlink:href/poster/data on every element. Returns change count."""
    changed = 0
    for el in root.iter():
        if not isinstance(el.tag, str):
            continue
        for name in list(el.attrib):
            if etree.QName(name).localname not in _REF_ATTRS:
                continue
            new = rewrite(el.get(name), base_file)
            if new is not None:
                el.set(name, new)
                changed += 1
    return changed


def _first_srcset_url(srcset):
    first = srcset.split(",")[0].strip()
    return first.split()[0] if first else ""


@dataclass
class XhtmlOptions:
    rewrite: object = None            # callable(ref, base_file) -> new ref|None
    removed_paths: frozenset = frozenset()  # files that no longer exist
    remove_fonts: bool = False
    simplify_css: bool = False
    strip_css: bool = False
    drop_scripts: bool = True


@dataclass
class XhtmlResult:
    data: bytes | None = None   # new bytes, or None when nothing changed
    svg_unwrapped: bool = False
    has_svg: bool = False
    font_faces_removed: int = 0
    warnings: list = field(default_factory=list)


def _find_wrapped_svg_image(body):
    """The sole svg of a page that is essentially just that svg, if it
    contains exactly one <image>. Returns (svg, image) or None."""
    node = body
    while True:
        if (node.text or "").strip():
            return None
        kids = [k for k in node if isinstance(k.tag, str)]
        if any((k.tail or "").strip() for k in node):
            return None
        if len(kids) != 1:
            return None
        kid = kids[0]
        name = local(kid)
        if name == "svg":
            break
        if name in ("div", "p", "section", "span"):
            node = kid
            continue
        return None
    svg = kid
    images = [e for e in svg.iter() if local(e) == "image"]
    if len(images) != 1:
        return None
    if any(local(e) in ("text", "foreignObject") for e in svg.iter()):
        return None
    return svg, images[0]


def _image_href(image):
    return image.get("{%s}href" % XLINK) or image.get("href")


def _unwrap_svg(root):
    body = next((e for e in root.iter() if local(e) == "body"), None)
    if body is None:
        return False
    found = _find_wrapped_svg_image(body)
    if found is None:
        return False
    svg, image = found
    href = _image_href(image)
    if not href:
        return False
    ns = etree.QName(body).namespace
    tag = lambda n: "{%s}%s" % (ns, n) if ns else n  # noqa: E731
    div = etree.Element(tag("div"))
    div.set("style", "text-align:center")
    img = etree.SubElement(div, tag("img"))
    img.set("src", href)
    img.set("alt", "")
    img.set("style", "max-width:100%;max-height:100%")
    div.tail = svg.tail
    svg.getparent().replace(svg, div)
    return True


def process_xhtml(data, path, opts):
    """Clean one XHTML file. Returns XhtmlResult (data None when unchanged)."""
    res = XhtmlResult()
    try:
        root = parse_lenient(data)
    except ValueError:
        res.warnings.append("%s: kunde inte tolkas, lämnas orörd" % path)
        return res
    changed = False
    rewrite = opts.rewrite or (lambda ref, base: None)
    css_opts = css.CssOptions(
        remove_fonts=opts.remove_fonts,
        simplify=opts.simplify_css,
        url_rewriter=lambda u: rewrite(u, path),
    )

    for el in list(root.iter()):
        if not isinstance(el.tag, str):
            continue
        name = local(el)
        if name == "script" and opts.drop_scripts:
            remove_element(el)
            changed = True
            continue
        if name == "link":
            rels = (el.get("rel") or "").lower().split()
            href = el.get("href")
            target = resolve_ref(href, path) if href else None
            if (opts.strip_css and "stylesheet" in rels) or target in opts.removed_paths:
                remove_element(el)
                changed = True
            continue
        if name == "style":
            if opts.strip_css:
                remove_element(el)
                changed = True
                continue
            text = el.text or ""
            new, stats = css.process_stylesheet(text, css_opts)
            res.font_faces_removed += stats.font_faces_removed
            if stats.changes:
                changed = True
                if new.strip():
                    el.text = new
                else:
                    remove_element(el)
            continue
        for attr in list(el.attrib):
            aname = etree.QName(attr).localname.lower()
            if aname.startswith("on") and opts.drop_scripts:
                del el.attrib[attr]
                changed = True
            elif aname == "style" and etree.QName(attr).namespace is None:
                if opts.strip_css:
                    del el.attrib[attr]
                    changed = True
                    continue
                new, stats = css.process_style_attr(el.get(attr), css_opts, is_image=name in _IMG_TAGS)
                if stats.changes:
                    changed = True
                    if new:
                        el.set(attr, new)
                    else:
                        del el.attrib[attr]

    if rewrite_xml_refs(root, path, rewrite):
        changed = True
    for el in root.iter():
        if not isinstance(el.tag, str) or el.get("srcset") is None:
            continue
        first = _first_srcset_url(el.get("srcset"))
        if not el.get("src") and first:
            new = rewrite(first, path)
            el.set("src", new if new is not None else first)
        del el.attrib["srcset"]
        if "sizes" in el.attrib:
            del el.attrib["sizes"]
        changed = True

    if _unwrap_svg(root):
        res.svg_unwrapped = True
        changed = True
    res.has_svg = any(local(e) == "svg" for e in root.iter())
    if changed:
        res.data = serialize(root)
    return res
