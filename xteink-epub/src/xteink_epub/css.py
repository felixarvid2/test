"""A small CSS processor: strips comments, parses rules (nested @media etc.)
and applies the simplifications that suit a tiny e-reader.

It is not a validating parser. It understands just enough of the syntax
(comments, strings, parentheses, nested blocks) to cut a stylesheet into
rules and declarations without being fooled by braces inside strings.
"""

import re
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

GENERIC_FONTS = {"serif", "sans-serif", "monospace"}
_KEEP_FAMILY_WORDS = {"inherit", "initial", "unset"}
VENDOR_PREFIXES = ("-webkit-", "-moz-", "-ms-", "-o-")
_GROUPING_AT = {"media", "supports", "document", "layer", "container"}
_DECL_AT = {"font-face", "page", "viewport"}
_SIZE_PROPS = {"width", "height", "min-width", "min-height", "max-width", "max-height"}
_BOX_PROPS = {
    "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
    "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
}
_ABS_LENGTH = re.compile(r"(?<![\w.-])-?(?:\d+\.?\d*|\.\d+)(?:px|pt|cm|mm|in|pc)(?![\w%])", re.I)
_FONT_SIZE = re.compile(r"^(-?(?:\d+\.?\d*|\.\d+))(px|pt)$", re.I)
_IMPORTANT = re.compile(r"\s*!\s*important\s*$", re.I)
_STRING = r"\"(?:\\.|[^\"\\\n])*\"|'(?:\\.|[^'\\\n])*'"
_WS_OR_STRING = re.compile(r"(%s)|\s+" % _STRING, re.S)
_URL_TOKEN = re.compile(
    r"(?P<comment>/\*.*?\*/)"
    r"|@import\s+(?P<imp>%s)"
    r"|(?<![\w-])url\(\s*(?P<url>%s|[^)]*?)\s*\)"
    r"|(?P<str>%s)" % (_STRING, _STRING, _STRING),
    re.S | re.I,
)


@dataclass
class CssOptions:
    remove_fonts: bool = False  # drop @font-face and non-generic font-family
    simplify: bool = False      # the e-reader simplifications
    url_rewriter: object = None  # callable(url) -> new url or None


@dataclass
class Decl:
    prop: str
    value: str
    important: bool = False


@dataclass
class _Rule:
    kind: str            # style | group | decl | raw | stmt
    prelude: str
    body: object = None  # str (decl/raw) or list of _Rule (group)


# ---------------------------------------------------------------- scanning

def _string_end(text, i):
    """Index just past the string starting at text[i] (a quote)."""
    q = text[i]
    n = len(text)
    j = i + 1
    while j < n:
        c = text[j]
        if c == "\\":
            j += 2
        elif c == q:
            return j + 1
        elif c == "\n":
            return j  # unterminated string ends at the newline
        else:
            j += 1
    return n


def strip_comments(text):
    out = []
    i = 0
    n = len(text)
    while i < n:
        c = text[i]
        if c in "\"'":
            j = _string_end(text, i)
            out.append(text[i:j])
            i = j
        elif c == "/" and text.startswith("/*", i):
            j = text.find("*/", i + 2)
            i = n if j < 0 else j + 2
            out.append(" ")
        else:
            out.append(c)
            i += 1
    return "".join(out)


def _read_until(text, i, stops):
    """First index >= i holding one of `stops` outside strings and (), []."""
    n = len(text)
    depth = 0
    while i < n:
        c = text[i]
        if c in "\"'":
            i = _string_end(text, i)
            continue
        if c in "([":
            depth += 1
        elif c in ")]":
            depth = max(0, depth - 1)
        elif depth == 0 and c in stops:
            return i
        i += 1
    return n


def _match_brace(text, i):
    """Index of the } matching the { at text[i] (len(text) if unclosed)."""
    n = len(text)
    depth = 0
    while i < n:
        c = text[i]
        if c in "\"'":
            i = _string_end(text, i)
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return n


def _collapse_ws(text):
    return _WS_OR_STRING.sub(lambda m: m.group(1) or " ", text).strip()


def split_top_level(text, sep=","):
    """Split on `sep` outside strings and parentheses."""
    parts = []
    start = 0
    while True:
        j = _read_until(text, start, sep)
        parts.append(text[start:j])
        if j >= len(text):
            return parts
        start = j + 1


def split_declarations(body):
    decls = []
    for piece in split_top_level(body, ";"):
        if ":" not in piece:
            continue
        prop, value = piece.split(":", 1)
        prop = prop.strip()
        if not prop or not re.match(r"^-?[\w-]+$", prop):
            continue
        value = value.strip()
        important = False
        m = _IMPORTANT.search(value)
        if m:
            important = True
            value = value[: m.start()].strip()
        decls.append(Decl(prop, value, important))
    return decls


def _parse(text):
    rules = []
    i = 0
    n = len(text)
    while i < n:
        while i < n and (text[i].isspace() or text[i] in ";}"):
            i += 1
        if i >= n:
            break
        j = _read_until(text, i, "{;}")
        prelude = text[i:j].strip()
        ch = text[j] if j < n else None
        if ch == "{":
            k = _match_brace(text, j)
            body = text[j + 1:k]
            i = k + 1
            rules.append(_classify(prelude, body))
        elif ch == ";":
            i = j + 1
            if prelude.startswith("@"):
                rules.append(_Rule("stmt", prelude))
        else:
            i = j + 1  # stray text before } or at the end: ignore
    return rules


def _classify(prelude, body):
    m = re.match(r"@([\w-]+)", prelude)
    if not m:
        return _Rule("style", prelude, body)
    name = m.group(1).lower()
    if name in _GROUPING_AT:
        return _Rule("group", prelude, _parse(body))
    if name in _DECL_AT:
        return _Rule("decl", prelude, body)
    return _Rule("raw", prelude, body)


def _at_name(prelude):
    m = re.match(r"@([\w-]+)", prelude)
    return m.group(1).lower() if m else ""


# ------------------------------------------------------------------- urls

def rewrite_css_urls(text, fn):
    """Apply fn(url) -> new url|None to every url(...) and @import "..." token
    outside comments and strings. Returns (new text, number of changes)."""
    count = 0

    def sub(m):
        nonlocal count
        if m.group("comment") is not None or m.group("str") is not None:
            return m.group(0)
        raw = m.group("imp") if m.group("imp") is not None else m.group("url")
        quote = raw[0] if raw[:1] in "\"'" and raw else ""
        inner = raw[1:-1] if quote else raw.strip()
        new = fn(inner)
        if new is None or new == inner:
            return m.group(0)
        count += 1
        if not quote and re.search(r"[\s()\"']", new):
            quote = '"'
        wrapped = quote + new + quote
        if m.group("imp") is not None:
            return "@import " + wrapped
        return "url(" + wrapped + ")"

    return _URL_TOKEN.sub(sub, text), count


# ------------------------------------------------------------ declarations

def _family_filter(value):
    """Keep only generic families (serif, sans-serif, monospace); None if none."""
    kept = []
    for fam in split_top_level(value, ","):
        name = fam.strip().strip("\"'").strip().lower()
        if name in GENERIC_FONTS or name in _KEEP_FAMILY_WORDS:
            kept.append(name)
    return ", ".join(kept) if kept else None


def _to_em(value):
    m = _FONT_SIZE.match(value.strip())
    if not m:
        return None
    div = 16 if m.group(2).lower() == "px" else 12
    em = (Decimal(m.group(1)) / div).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    text = ("%.2f" % em).rstrip("0").rstrip(".")
    return (text if text not in ("", "-0") else "0") + "em"


_IMG_LAST = re.compile(r"^(img|svg|image|picture|video)(?![\w-])", re.I)


def targets_images(selector):
    """True if any selector in the list ends in img/svg/image/picture/video."""
    for part in split_top_level(selector, ","):
        last = re.split(r"\s*[>+~]\s*|\s+", part.strip())[-1]
        if _IMG_LAST.match(last):
            return True
    return False


def targets_root(selector):
    parts = [_collapse_ws(p).lower() for p in split_top_level(selector, ",")]
    return bool(parts) and all(p in ("html", "body", "html body") for p in parts)


def process_declarations(selector, decls, opts, stats):
    is_img = targets_images(selector)
    is_root = targets_root(selector)
    out = []
    for d in decls:
        prop = d.prop.lower()
        value = d.value
        if opts.remove_fonts and prop == "font-family":
            new = _family_filter(value)
            if new is None:
                stats.changes += 1
                continue
            if new != value:
                stats.changes += 1
                value = new
        if opts.simplify:
            if prop.startswith(VENDOR_PREFIXES):
                stats.changes += 1
                continue
            if prop == "position" and value.strip().lower() in ("fixed", "absolute"):
                stats.changes += 1
                continue
            if prop in _SIZE_PROPS and not is_img and _ABS_LENGTH.search(value):
                stats.changes += 1
                continue
            if prop.startswith("column-") or prop == "columns":
                stats.changes += 1
                continue
            if prop == "font-size":
                em = _to_em(value)
                if em is not None:
                    stats.changes += 1
                    value = em
            elif is_root and prop in _BOX_PROPS and value != "0":
                stats.changes += 1
                value = "0"
        if opts.url_rewriter is not None and "url(" in value.lower():
            value, n = rewrite_css_urls(value, opts.url_rewriter)
            stats.changes += n
        out.append(Decl(d.prop, value, d.important))
    return out


def _decl_text(decls):
    return ";".join(
        "%s:%s%s" % (d.prop, _collapse_ws(d.value), " !important" if d.important else "")
        for d in decls
    )


@dataclass
class CssStats:
    changes: int = 0
    font_faces_removed: int = 0


# ------------------------------------------------------------- stylesheets

def _process_rules(rules, opts, stats):
    kept = []
    for r in rules:
        if r.kind == "stmt":
            name = _at_name(r.prelude)
            if name == "charset":
                continue  # output is always utf-8
            if opts.url_rewriter is not None and name == "import":
                new, n = rewrite_css_urls(r.prelude, opts.url_rewriter)
                stats.changes += n
                r = _Rule("stmt", new)
            kept.append(r)
            continue
        if r.kind == "style":
            decls = process_declarations(r.prelude, split_declarations(r.body), opts, stats)
            if not decls:
                if opts.simplify or split_declarations(r.body):
                    stats.changes += 1
                    continue
            kept.append(_Rule("style", r.prelude, decls))
            continue
        name = _at_name(r.prelude)
        if opts.simplify and name.startswith("-"):
            stats.changes += 1  # @-webkit-keyframes and friends
            continue
        if r.kind == "decl":
            if name == "font-face" and opts.remove_fonts:
                stats.changes += 1
                stats.font_faces_removed += 1
                continue
            decls = process_declarations("@" + name, split_declarations(r.body), opts, stats)
            if not decls and opts.simplify:
                stats.changes += 1
                continue
            kept.append(_Rule("decl", r.prelude, decls))
        elif r.kind == "group":
            children = _process_rules(r.body, opts, stats)
            if not children and (r.body or opts.simplify):
                stats.changes += 1
                continue
            kept.append(_Rule("group", r.prelude, children))
        else:  # raw (keyframes, ...)
            body = r.body
            if opts.url_rewriter is not None and "url(" in body.lower():
                body, n = rewrite_css_urls(body, opts.url_rewriter)
                stats.changes += n
            kept.append(_Rule("raw", r.prelude, body))
    return kept


def _serialize(rules):
    out = []
    for r in rules:
        prelude = _collapse_ws(r.prelude)
        if r.kind == "stmt":
            out.append(prelude + ";")
        elif r.kind in ("style", "decl"):
            out.append("%s{%s}" % (prelude, _decl_text(r.body)))
        elif r.kind == "group":
            out.append("%s{\n%s\n}" % (prelude, _serialize(r.body)))
        else:
            out.append("%s{%s}" % (prelude, r.body.strip()))
    return "\n".join(out)


def _clean(text):
    text = strip_comments(text)
    return text.replace("<!--", " ").replace("-->", " ")


def process_stylesheet(text, opts):
    """Process a full stylesheet. Returns (new text, CssStats)."""
    stats = CssStats()
    rules = _process_rules(_parse(_clean(text)), opts, stats)
    return _serialize(rules), stats


def process_style_attr(text, opts, is_image=False):
    """Process the value of a style="" attribute. Returns (new text, CssStats)."""
    stats = CssStats()
    decls = process_declarations("img" if is_image else "", split_declarations(_clean(text)), opts, stats)
    return _decl_text(decls), stats
