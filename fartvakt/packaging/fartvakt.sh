#!/bin/sh
# Startar Fartvakt. Utan argument öppnas appen; se `fartvakt --help`.
exec /usr/bin/python3 -m fartvakt "$@"
