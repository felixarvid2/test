#!/bin/sh
# Bygger vlantool_<version>_<arkitektur>.deb i target/debian/, med en .sha256 bredvid.
# Kör från vlan-tool-rs/:  sh packaging/build-deb.sh [--no-build]
#   --no-build   bygg inte om, använd binärerna som redan finns i target/release/
# CARGO_TARGET_DIR respekteras om den är satt.
set -eu

BUILD=1
for arg in "$@"; do
    case "$arg" in
        --no-build) BUILD=0 ;;
        -h|--help) sed -n '2,5p' "$0"; exit 0 ;;
        *) echo "okänd flagga: $arg" >&2; exit 2 ;;
    esac
done

cd "$(dirname "$0")/.."
TARGET=${CARGO_TARGET_DIR:-target}
VERSION=$(sed -n 's/^version = "\(.*\)"/\1/p' Cargo.toml | head -1)
ARCH=$(dpkg --print-architecture)
PKG=$TARGET/debian/vlantool_${VERSION}_${ARCH}
ROOT=$PKG.root

if [ "$BUILD" = 1 ]; then
    cargo build --release --bins
fi
for bin in vlantool vlantool-gui; do
    [ -x "$TARGET/release/$bin" ] || { echo "saknar $TARGET/release/$bin – kör utan --no-build" >&2; exit 1; }
done

rm -rf "$ROOT"
install -Dm755 "$TARGET"/release/vlantool "$ROOT/usr/bin/vlantool"
install -Dm755 "$TARGET"/release/vlantool-gui "$ROOT/usr/bin/vlantool-gui"
strip "$ROOT/usr/bin/vlantool" "$ROOT/usr/bin/vlantool-gui"
install -Dm644 packaging/se.nordvik.vlantool.desktop "$ROOT/usr/share/applications/se.nordvik.vlantool.desktop"
install -Dm644 packaging/vlantool.svg "$ROOT/usr/share/icons/hicolor/scalable/apps/vlantool.svg"
for dir in packaging/icons/*x*; do
    size=$(basename "$dir")
    install -Dm644 "$dir/vlantool.png" "$ROOT/usr/share/icons/hicolor/$size/apps/vlantool.png"
done
install -Dm644 packaging/se.nordvik.vlantool.metainfo.xml "$ROOT/usr/share/metainfo/se.nordvik.vlantool.metainfo.xml"
install -Dm644 README.md "$ROOT/usr/share/doc/vlantool/README.md"
install -Dm644 packaging/copyright "$ROOT/usr/share/doc/vlantool/copyright"

# Man-sidor, gzippade utan tidsstämpel så att bygget blir reproducerbart.
for page in vlantool.1 vlantool-gui.1; do
    install -dm755 "$ROOT/usr/share/man/man1"
    gzip -9n -c "packaging/$page" > "$ROOT/usr/share/man/man1/$page.gz"
    chmod 644 "$ROOT/usr/share/man/man1/$page.gz"
done

# Skalkomplettering, bara om den här versionen av vlantool har `completions`.
COMP=$(mktemp -d)
if "$ROOT/usr/bin/vlantool" completions bash > "$COMP/bash" 2>/dev/null && [ -s "$COMP/bash" ] &&
    "$ROOT/usr/bin/vlantool" completions zsh > "$COMP/zsh" 2>/dev/null && [ -s "$COMP/zsh" ] &&
    "$ROOT/usr/bin/vlantool" completions fish > "$COMP/fish" 2>/dev/null && [ -s "$COMP/fish" ]; then
    install -Dm644 "$COMP/bash" "$ROOT/usr/share/bash-completion/completions/vlantool"
    install -Dm644 "$COMP/zsh" "$ROOT/usr/share/zsh/vendor-completions/_vlantool"
    install -Dm644 "$COMP/fish" "$ROOT/usr/share/fish/vendor_completions.d/vlantool.fish"
fi
rm -rf "$COMP"

# changelog.Debian.gz: en post för den här versionen, punkterna hämtas ur CHANGELOG.md.
DATE=$(date -R -u -d "@${SOURCE_DATE_EPOCH:-$(git log -1 --format=%ct 2>/dev/null || date +%s)}")
NOTES=$(awk -v v="$VERSION" '
    /^## / { on = ($2 == v); next }
    on && /^- / { sub(/^- /, "  * "); print }
' CHANGELOG.md)
[ -n "$NOTES" ] || NOTES="  * Se CHANGELOG.md i källkoden."
install -dm755 "$ROOT/usr/share/doc/vlantool"
{
    echo "vlantool ($VERSION) unstable; urgency=low"
    echo
    echo "$NOTES"
    echo
    echo " -- Felix Arvid <felixarvid@gmail.com>  $DATE"
} | gzip -9n > "$ROOT/usr/share/doc/vlantool/changelog.Debian.gz"
chmod 644 "$ROOT/usr/share/doc/vlantool/changelog.Debian.gz"

# Högsta glibc-version som binärerna kräver. Även svagt länkade symboler räknas,
# eftersom versionskravet i ELF-filen ändå är hårt och ld.so vägrar starta utan den.
GLIBC=$(readelf -V "$ROOT/usr/bin/vlantool-gui" "$ROOT/usr/bin/vlantool" | grep -o 'Name: GLIBC_[0-9.]*' | sed 's/Name: GLIBC_//' | sort -uV | tail -1)
# X11/Wayland/OpenGL laddas med dlopen och syns inte i ELF-filen, så de listas här.
DEPENDS="libc6 (>= $GLIBC), libgcc-s1, libgl1, libegl1, libx11-6, libxcursor1, libxi6, libxrandr2, libxkbcommon0, libxkbcommon-x11-0, libwayland-client0, libwayland-cursor0, libwayland-egl1"
SIZE=$(du -sk "$ROOT" | cut -f1)

mkdir -p "$ROOT/DEBIAN"
cat > "$ROOT/DEBIAN/control" <<CONTROL
Package: vlantool
Version: $VERSION
Section: net
Priority: optional
Architecture: $ARCH
Maintainer: Felix Arvid <felixarvid@gmail.com>
Installed-Size: $SIZE
Depends: $DEPENDS
Recommends: xdg-utils, fonts-dejavu-core
Homepage: https://github.com/felixarvid2/test/tree/main/vlan-tool-rs
Vcs-Git: https://github.com/felixarvid2/test.git
Vcs-Browser: https://github.com/felixarvid2/test/tree/main/vlan-tool-rs
Description: generera och granska Cisco IOS-konfigar från CSV-filer
 vlantool bygger switch- och routerkonfigar för Nordvik-nätet från CSV-filer
 och granskar dem med 28 regler, kontroller mellan enheter, betyg,
 rättningsskript, topologi och subnätskalkylator.
 .
 Paketet innehåller skrivbordsprogrammet vlantool-gui och kommandoradsverktyget
 vlantool (med ett TUI).
CONTROL

dpkg-deb --root-owner-group --build "$ROOT" "$PKG.deb" >/dev/null
(cd "$(dirname "$PKG")" && sha256sum "$(basename "$PKG").deb" > "$(basename "$PKG").deb.sha256")
echo "$PKG.deb"
