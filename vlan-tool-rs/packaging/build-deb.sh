#!/bin/sh
# Bygger vlantool_<version>_<arkitektur>.deb i target/debian/.
# Kör från vlan-tool-rs/:  sh packaging/build-deb.sh
set -eu

cd "$(dirname "$0")/.."
VERSION=$(sed -n 's/^version = "\(.*\)"/\1/p' Cargo.toml | head -1)
ARCH=$(dpkg --print-architecture)
PKG=target/debian/vlantool_${VERSION}_${ARCH}
ROOT=$PKG.root

cargo build --release --bins

rm -rf "$ROOT"
install -Dm755 target/release/vlantool "$ROOT/usr/bin/vlantool"
install -Dm755 target/release/vlantool-gui "$ROOT/usr/bin/vlantool-gui"
strip "$ROOT/usr/bin/vlantool" "$ROOT/usr/bin/vlantool-gui"
install -Dm644 packaging/se.nordvik.vlantool.desktop "$ROOT/usr/share/applications/se.nordvik.vlantool.desktop"
install -Dm644 packaging/vlantool.svg "$ROOT/usr/share/icons/hicolor/scalable/apps/vlantool.svg"
for dir in packaging/icons/*x*; do
    size=$(basename "$dir")
    install -Dm644 "$dir/vlantool.png" "$ROOT/usr/share/icons/hicolor/$size/apps/vlantool.png"
done
install -Dm644 README.md "$ROOT/usr/share/doc/vlantool/README.md"
install -Dm644 packaging/copyright "$ROOT/usr/share/doc/vlantool/copyright"

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
Description: generera och granska Cisco IOS-konfigar från CSV-filer
 vlantool bygger switch- och routerkonfigar för Nordvik-nätet från CSV-filer
 och granskar dem med 28 regler, kontroller mellan enheter, betyg,
 rättningsskript, topologi och subnätskalkylator.
 .
 Paketet innehåller skrivbordsprogrammet vlantool-gui och kommandoradsverktyget
 vlantool (med ett TUI).
CONTROL

dpkg-deb --root-owner-group --build "$ROOT" "$PKG.deb" >/dev/null
echo "$PKG.deb"
