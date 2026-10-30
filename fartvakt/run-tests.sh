#!/bin/sh
# Kör alla tester. GUI-testerna körs i en virtuell skärm (Xvfb) om det inte finns någon skärm.
set -eu
cd "$(dirname "$0")"
PY=${PYTHON:-python3}
if [ -z "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ] && command -v xvfb-run >/dev/null 2>&1; then
    exec env GSK_RENDERER=cairo GTK_A11Y=none xvfb-run -a dbus-run-session -- "$PY" -m unittest discover -s tests "$@"
fi
exec "$PY" -m unittest discover -s tests "$@"
