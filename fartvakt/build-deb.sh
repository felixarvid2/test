#!/bin/sh
# Bygger dist/fartvakt_<version>_all.deb. Kräver bara dpkg-deb.
set -eu
cd "$(dirname "$0")"

VERSION=$(sed -n 's/^__version__ = "\(.*\)"/\1/p' src/fartvakt/__init__.py)
PKG="dist/fartvakt_${VERSION}_all.deb"
ROOT=$(mktemp -d)
trap 'rm -rf "$ROOT"' EXIT
chmod 755 "$ROOT"

install -d "$ROOT/DEBIAN" "$ROOT/usr/bin" "$ROOT/usr/lib/fartvakt/fartvakt" \
    "$ROOT/usr/lib/systemd/user" "$ROOT/usr/share/applications" "$ROOT/usr/share/doc/fartvakt" \
    "$ROOT/usr/share/icons/hicolor/scalable/apps" "$ROOT/usr/share/icons/hicolor/48x48/apps" \
    "$ROOT/usr/share/icons/hicolor/128x128/apps"

install -m 755 packaging/fartvakt.sh "$ROOT/usr/bin/fartvakt"
install -m 644 src/fartvakt/*.py "$ROOT/usr/lib/fartvakt/fartvakt/"
install -m 644 packaging/fartvakt.service "$ROOT/usr/lib/systemd/user/"
install -m 644 packaging/fartvakt.desktop "$ROOT/usr/share/applications/"
install -m 644 packaging/fartvakt.svg "$ROOT/usr/share/icons/hicolor/scalable/apps/"
install -m 644 packaging/fartvakt-48.png "$ROOT/usr/share/icons/hicolor/48x48/apps/fartvakt.png"
install -m 644 packaging/fartvakt-128.png "$ROOT/usr/share/icons/hicolor/128x128/apps/fartvakt.png"
install -m 644 packaging/copyright "$ROOT/usr/share/doc/fartvakt/"
install -m 755 packaging/postinst packaging/prerm "$ROOT/DEBIAN/"

SIZE=$(du -sk --exclude=DEBIAN "$ROOT" | cut -f1)
sed -e "s/@VERSION@/$VERSION/" -e "s/@SIZE@/$SIZE/" packaging/control > "$ROOT/DEBIAN/control"

mkdir -p dist
dpkg-deb --root-owner-group -Zxz --build "$ROOT" "$PKG" >/dev/null
echo "$PKG"
