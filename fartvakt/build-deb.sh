#!/bin/sh
# Bygger dist/fartvakt_<version>_all.deb. Kräver dpkg-deb och gzip.
set -eu
cd "$(dirname "$0")"

APP_ID=io.github.felixarvid2.Fartvakt
VERSION=$(sed -n 's/^__version__ = "\(.*\)"/\1/p' src/fartvakt/__init__.py)
PKG="dist/fartvakt_${VERSION}_all.deb"
ROOT=$(mktemp -d)
trap 'rm -rf "$ROOT"' EXIT
chmod 755 "$ROOT"
umask 022

install -d "$ROOT/DEBIAN" "$ROOT/usr/bin" "$ROOT/usr/lib/python3/dist-packages/fartvakt" "$ROOT/usr/lib/systemd/user" \
    "$ROOT/usr/share/applications" "$ROOT/usr/share/metainfo" "$ROOT/usr/share/doc/fartvakt" \
    "$ROOT/usr/share/man/man1"

install -m 755 packaging/fartvakt.sh "$ROOT/usr/bin/fartvakt"
install -m 644 src/fartvakt/*.py "$ROOT/usr/lib/python3/dist-packages/fartvakt/"
install -m 644 packaging/fartvakt.service "$ROOT/usr/lib/systemd/user/"
install -m 644 "packaging/$APP_ID.desktop" "$ROOT/usr/share/applications/"
install -m 644 "packaging/$APP_ID.metainfo.xml" "$ROOT/usr/share/metainfo/"
for icon in packaging/icons/hicolor/*/apps/*; do
    dest="$ROOT/usr/share/icons/${icon#packaging/icons/}"
    install -d "$(dirname "$dest")"
    install -m 644 "$icon" "$dest"
done
install -m 644 packaging/copyright "$ROOT/usr/share/doc/fartvakt/"
gzip -9n -c packaging/changelog > "$ROOT/usr/share/doc/fartvakt/changelog.gz"
gzip -9n -c packaging/fartvakt.1 > "$ROOT/usr/share/man/man1/fartvakt.1.gz"
chmod 644 "$ROOT/usr/share/doc/fartvakt/changelog.gz" "$ROOT/usr/share/man/man1/fartvakt.1.gz"
install -m 755 packaging/postinst packaging/prerm packaging/postrm "$ROOT/DEBIAN/"
(cd "$ROOT" && find usr -type f -print0 | sort -z | xargs -0 md5sum) > "$ROOT/DEBIAN/md5sums"
chmod 644 "$ROOT/DEBIAN/md5sums"

SIZE=$(du -sk --exclude=DEBIAN "$ROOT" | cut -f1)
sed -e "s/@VERSION@/$VERSION/" -e "s/@SIZE@/$SIZE/" packaging/control > "$ROOT/DEBIAN/control"

mkdir -p dist
rm -f dist/fartvakt_*_all.deb
dpkg-deb --root-owner-group -Zxz --build "$ROOT" "$PKG" >/dev/null
echo "$PKG"
