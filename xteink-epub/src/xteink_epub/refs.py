"""Resolving and rewriting hrefs between files inside an EPUB zip."""

import posixpath
import re
from urllib.parse import quote, unquote

_SCHEME = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*:")


def resolve_ref(ref, base_file):
    """Zip path that `ref` (written inside `base_file`) points to, or None.

    Fragments and queries are dropped and %-escapes decoded. Absolute URLs,
    pure fragments and references that escape the archive give None.
    """
    ref = (ref or "").strip()
    if not ref or ref.startswith("#") or ref.startswith("//") or _SCHEME.match(ref):
        return None
    path = ref.split("#", 1)[0].split("?", 1)[0]
    if not path:
        return None
    path = unquote(path)
    if path.startswith("/"):
        joined = path.lstrip("/")
    else:
        joined = posixpath.join(posixpath.dirname(base_file), path)
    norm = posixpath.normpath(joined)
    if norm == ".." or norm.startswith("../") or norm == ".":
        return None
    return norm


def relative_ref(target, base_file):
    """Href (percent-encoded) from `base_file` to the zip path `target`."""
    start = posixpath.dirname(base_file) or "."
    return quote(posixpath.relpath(target, start))


class RefRewriter:
    """Callable (ref, base_file) -> new ref or None, for a {old path: new path} map."""

    def __init__(self, mapping):
        self.mapping = mapping

    def __call__(self, ref, base_file):
        if not self.mapping:
            return None
        path = resolve_ref(ref, base_file)
        if path is None or path not in self.mapping:
            return None
        target = self.mapping[path]
        suffix = ""
        m = re.search(r"[#?]", ref)
        if m:
            suffix = ref[m.start():]
        if ref.strip().startswith("/"):
            return "/" + quote(target) + suffix
        return relative_ref(target, base_file) + suffix
