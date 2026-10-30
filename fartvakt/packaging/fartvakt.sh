#!/bin/sh
# Startar Fartvakt. Utan argument öppnas appen; se `fartvakt --help`.
export PYTHONPATH="/usr/lib/fartvakt${PYTHONPATH:+:$PYTHONPATH}"
export PYTHONDONTWRITEBYTECODE=1
exec /usr/bin/python3 -m fartvakt "$@"
