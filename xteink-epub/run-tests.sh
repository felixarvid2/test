#!/bin/sh
# Kör alla tester.
set -eu
cd "$(dirname "$0")"
PY=${PYTHON:-python3}
PYTHONPATH="$PWD/src${PYTHONPATH:+:$PYTHONPATH}" exec "$PY" -m unittest discover -s tests "$@"
