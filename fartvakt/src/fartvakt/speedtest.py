"""Mäter ping, nedladdning och uppladdning mot en server med Cloudflares
speedtest-API (`/__down?bytes=N` och `/__up`)."""

import http.client
import os
import socket
import ssl
import statistics
import threading
import time
import urllib.parse

from . import __version__

USER_AGENT = f"fartvakt/{__version__}"
CHUNK = 64 * 1024


class SpeedTestError(Exception):
    pass


def _proxy_for(scheme):
    for name in (f"{scheme}_proxy", f"{scheme.upper()}_PROXY"):
        value = os.environ.get(name)
        if value:
            return urllib.parse.urlsplit(value if "://" in value else "http://" + value)
    return None


def _connect(server, timeout):
    """Öppnar en anslutning till servern. Returnerar (anslutning, sökvägsprefix)."""
    url = urllib.parse.urlsplit(server)
    if url.scheme not in ("http", "https") or not url.hostname:
        raise SpeedTestError(f"Ogiltig serveradress: {server}")
    port = url.port or (443 if url.scheme == "https" else 80)
    proxy = _proxy_for(url.scheme)
    if url.scheme == "https":
        ctx = ssl.create_default_context()
        if proxy:
            conn = http.client.HTTPSConnection(proxy.hostname, proxy.port or 80, timeout=timeout, context=ctx)
            conn.set_tunnel(url.hostname, port)
        else:
            conn = http.client.HTTPSConnection(url.hostname, port, timeout=timeout, context=ctx)
    else:
        conn = http.client.HTTPConnection(url.hostname, port, timeout=timeout)
    return conn, url.path.rstrip("/")


def _check(resp):
    if resp.status != 200:
        resp.read()
        raise SpeedTestError(
            f"Servern svarade {resp.status} {resp.reason}"
            + (" – nätverket kräver kanske inloggning i webbläsaren" if 300 <= resp.status < 400 else "")
        )
    if "text/html" in (resp.getheader("Content-Type") or ""):
        resp.read()
        raise SpeedTestError("Fick en webbsida i stället för testdata – nätverket kräver kanske inloggning i webbläsaren")
    return resp


def _get(conn, path):
    conn.request("GET", path, headers={"User-Agent": USER_AGENT})
    return _check(conn.getresponse())


def measure_latency(server, count=6, timeout=10):
    """Returnerar (ping_ms, jitter_ms) som median och medelvariation av svarstider."""
    conn, base = _connect(server, timeout)
    try:
        _get(conn, base + "/__down?bytes=0").read()  # uppvärmning: TCP + TLS
        samples = []
        for _ in range(count):
            t0 = time.perf_counter()
            _get(conn, base + "/__down?bytes=0").read()
            samples.append((time.perf_counter() - t0) * 1000)
    finally:
        conn.close()
    jitter = statistics.mean(abs(a - b) for a, b in zip(samples, samples[1:])) if len(samples) > 1 else 0.0
    return statistics.median(samples), jitter


def _parallel(server, streams, timeout, work):
    """Kör `work(conn, base)` i flera anslutningar samtidigt och
    returnerar hastigheten i Mbit/s. Anslutningarna öppnas innan klockan startar."""
    barrier = threading.Barrier(streams + 1)
    done = [0] * streams
    errors = []

    def worker(i):
        try:
            conn, base = _connect(server, timeout)
        except Exception as e:  # noqa: BLE001 – rapporteras vidare nedan
            errors.append(e)
            barrier.abort()
            return
        try:
            _get(conn, base + "/__down?bytes=0").read()
            barrier.wait()
            done[i] = work(conn, base)
        except threading.BrokenBarrierError:
            pass
        except Exception as e:  # noqa: BLE001
            errors.append(e)
            barrier.abort()
        finally:
            conn.close()

    threads = [threading.Thread(target=worker, args=(i,), daemon=True) for i in range(streams)]
    for t in threads:
        t.start()
    try:
        barrier.wait(timeout=timeout * 2)
    except threading.BrokenBarrierError:
        pass
    t0 = time.perf_counter()
    for t in threads:
        t.join()
    elapsed = time.perf_counter() - t0
    if errors:
        raise errors[0]
    total = sum(done)
    if total == 0 or elapsed <= 0:
        raise SpeedTestError("Ingen data kunde överföras")
    return total * 8 / elapsed / 1_000_000


def measure_download(server, total_bytes, streams=4, max_seconds=10, timeout=30):
    per_stream = max(1, total_bytes // streams)

    def work(conn, base):
        end = time.perf_counter() + max_seconds
        resp = _get(conn, f"{base}/__down?bytes={per_stream}")
        received = 0
        while time.perf_counter() < end:
            chunk = resp.read(CHUNK)
            if not chunk:
                break
            received += len(chunk)
        return received

    return _parallel(server, streams, timeout, work)


def measure_upload(server, total_bytes, streams=4, max_seconds=10, timeout=30):
    per_stream = max(1, total_bytes // streams)
    payload = os.urandom(min(per_stream, 1_000_000))

    def work(conn, base):
        end = time.perf_counter() + max_seconds
        conn.putrequest("POST", base + "/__up")
        conn.putheader("User-Agent", USER_AGENT)
        conn.putheader("Content-Type", "application/octet-stream")
        conn.putheader("Content-Length", str(per_stream))
        conn.endheaders()
        sent = 0
        while sent < per_stream and time.perf_counter() < end:
            part = payload[: per_stream - sent]
            conn.send(part)
            sent += len(part)
        if sent == per_stream:
            resp = conn.getresponse()
            if resp.status != 200:
                resp.read()
                raise SpeedTestError(f"Servern svarade {resp.status} {resp.reason} på uppladdningen")
            resp.read()
        return sent

    return _parallel(server, streams, timeout, work)


def friendly_error(exc) -> str:
    if isinstance(exc, SpeedTestError):
        return str(exc)
    if isinstance(exc, ssl.SSLCertVerificationError):
        return "Certifikatfel – nätverket kräver troligen inloggning i webbläsaren"
    if isinstance(exc, socket.gaierror):
        return "Kunde inte slå upp servern (ingen internetanslutning?)"
    if isinstance(exc, (socket.timeout, TimeoutError)):
        return "Tidsgränsen överskreds – anslutningen är för långsam eller nere"
    if isinstance(exc, ConnectionError):
        return f"Anslutningen bröts ({exc.__class__.__name__})"
    return f"{exc.__class__.__name__}: {exc}"


def run(cfg) -> dict:
    """Gör en hel mätning. Kastar SpeedTestError med ett begripligt meddelande vid fel."""
    server = cfg["server"]
    streams = max(1, int(cfg["streams"]))
    try:
        ping, jitter = measure_latency(server)
        down = measure_download(server, cfg["download_bytes"], streams, cfg["max_seconds"])
        up = measure_upload(server, cfg["upload_bytes"], streams, cfg["max_seconds"])
    except Exception as e:  # noqa: BLE001
        raise SpeedTestError(friendly_error(e)) from e
    return {
        "ping_ms": round(ping, 1),
        "jitter_ms": round(jitter, 1),
        "download_mbps": round(down, 2),
        "upload_mbps": round(up, 2),
    }
