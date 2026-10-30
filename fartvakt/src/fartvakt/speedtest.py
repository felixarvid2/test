"""Mäter ping, nedladdning och uppladdning mot en server med Cloudflares
speedtest-API (`/__down?bytes=N` och `/__up`)."""

import fcntl
import http.client
import os
import socket
import ssl
import statistics
import struct
import termios
import threading
import time
import urllib.parse
import urllib.request

from . import __version__

USER_AGENT = f"fartvakt/{__version__}"
CHUNK = 64 * 1024


class SpeedTestError(Exception):
    pass


def _proxy_for(scheme, host):
    """Proxy från miljövariablerna (http_proxy/https_proxy/no_proxy), om någon."""
    if urllib.request.proxy_bypass(host):
        return None
    value = urllib.request.getproxies().get(scheme)
    if not value:
        return None
    return urllib.parse.urlsplit(value if "://" in value else "http://" + value)


def _connect(server, timeout):
    """Öppnar en anslutning till servern. Returnerar (anslutning, sökvägsprefix)."""
    url = urllib.parse.urlsplit(server)
    if url.scheme not in ("http", "https") or not url.hostname:
        raise SpeedTestError(f"Ogiltig serveradress: {server}")
    port = url.port or (443 if url.scheme == "https" else 80)
    if url.scheme == "http":  # används bara mot egna/lokala testservrar, alltid direkt
        return http.client.HTTPConnection(url.hostname, port, timeout=timeout), url.path.rstrip("/")
    ctx = ssl.create_default_context()
    proxy = _proxy_for("https", url.hostname)
    if proxy:
        conn = http.client.HTTPSConnection(proxy.hostname, proxy.port or 80, timeout=timeout, context=ctx)
        conn.set_tunnel(url.hostname, port)
    else:
        conn = http.client.HTTPSConnection(url.hostname, port, timeout=timeout, context=ctx)
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


def server_time_ms(resp):
    """Serverns egen handläggningstid ur `Server-Timing` (Cloudflare skickar cfRequestDuration)."""
    header = resp.getheader("Server-Timing") or ""
    for part in header.split(","):
        name, _, params = part.strip().partition(";")
        if name.strip() in ("cfRequestDuration", "total", "app"):
            for param in params.split(";"):
                key, _, value = param.strip().partition("=")
                if key == "dur":
                    try:
                        return max(0.0, float(value))
                    except ValueError:
                        return 0.0
    return 0.0


def measure_latency(server, count=8, timeout=10):
    """Returnerar (ping_ms, jitter_ms): median och medelvariation av svarstiderna,
    med serverns egen handläggningstid borträknad."""
    conn, base = _connect(server, timeout)
    try:
        _get(conn, base + "/__down?bytes=0").read()  # uppvärmning: TCP + TLS
        samples = []
        for _ in range(count):
            t0 = time.perf_counter()
            resp = _get(conn, base + "/__down?bytes=0")
            elapsed = (time.perf_counter() - t0) * 1000
            resp.read()
            samples.append(max(0.1, elapsed - server_time_ms(resp)))
    finally:
        conn.close()
    jitter = statistics.mean(abs(a - b) for a, b in zip(samples, samples[1:])) if len(samples) > 1 else 0.0
    return statistics.median(samples), jitter


def throughput_mbps(samples):
    """Hastighet ur (sekunder, totalt antal byte)-prov. Första fjärdedelen av tiden
    räknas inte med, så att TCP:s långsamma uppstart inte drar ner resultatet."""
    if len(samples) < 2:
        raise SpeedTestError("Ingen data kunde överföras")
    t_end, b_end = samples[-1]
    skip = t_end * 0.25
    t_from, b_from = next((t, b) for t, b in samples if t >= skip)
    if t_end - t_from < 0.05 or b_end <= b_from:
        # för kort för att dela upp, eller allt låg i buffertar (t.ex. bakom en proxy):
        # räkna då på hela tiden fram till att servern svarat
        t_from, b_from = 0.0, 0
    if b_end - b_from <= 0 or t_end <= t_from:
        raise SpeedTestError("Ingen data kunde överföras")
    return (b_end - b_from) * 8 / (t_end - t_from) / 1_000_000


def unsent_bytes(sock):
    """Byte som ligger kvar i sändkön och inte är kvitterade av mottagaren ännu."""
    try:
        return struct.unpack("i", fcntl.ioctl(sock.fileno(), termios.TIOCOUTQ, b"\0\0\0\0"))[0]
    except (OSError, ValueError, AttributeError):
        return 0


class _Progress:
    """Räknar överförda byte från flera trådar. Byte som skickats men ännu inte
    kvitterats (se `watch`) räknas inte förrän de har kommit fram."""

    def __init__(self):
        self.lock = threading.Lock()
        self.total = 0
        self.pending = {}

    def add(self, n):
        with self.lock:
            self.total += n

    def watch(self, unsent):
        with self.lock:
            self.pending[threading.get_ident()] = unsent

    def unwatch(self, lost=0):
        with self.lock:
            self.pending.pop(threading.get_ident(), None)
            self.total -= lost

    def value(self):
        with self.lock:
            return self.total - sum(f() for f in self.pending.values())


def _parallel(server, streams, timeout, work):
    """Kör `work(conn, base, progress)` i flera anslutningar samtidigt och returnerar
    hastigheten i Mbit/s. Anslutningarna öppnas innan klockan startar."""
    barrier = threading.Barrier(streams + 1)
    progress = _Progress()
    errors = []

    def worker():
        try:
            conn, base = _connect(server, timeout)
        except Exception as e:  # noqa: BLE001 – rapporteras vidare nedan
            errors.append(e)
            barrier.abort()
            return
        try:
            _get(conn, base + "/__down?bytes=0").read()
            barrier.wait()
            work(conn, base, progress)
        except threading.BrokenBarrierError:
            pass
        except Exception as e:  # noqa: BLE001
            errors.append(e)
            barrier.abort()
        finally:
            progress.unwatch()
            conn.close()

    threads = [threading.Thread(target=worker, daemon=True) for _ in range(streams)]
    for t in threads:
        t.start()
    try:
        barrier.wait(timeout=timeout * 2)
    except threading.BrokenBarrierError:
        pass
    t0 = time.perf_counter()
    samples = [(0.0, 0)]
    while any(t.is_alive() for t in threads):
        time.sleep(0.02)
        samples.append((time.perf_counter() - t0, progress.value()))
    for t in threads:
        t.join()
    if errors:
        raise errors[0]
    samples.append((time.perf_counter() - t0, progress.value()))
    return throughput_mbps(samples)


def measure_download(server, total_bytes, streams=4, max_seconds=10, timeout=30):
    per_stream = max(1, total_bytes // streams)

    def work(conn, base, progress):
        end = time.perf_counter() + max_seconds
        resp = _get(conn, f"{base}/__down?bytes={per_stream}")
        while time.perf_counter() < end:
            chunk = resp.read1(CHUNK)
            if not chunk:
                break
            progress.add(len(chunk))

    return _parallel(server, streams, timeout, work)


def measure_upload(server, total_bytes, streams=4, max_seconds=10, timeout=30):
    per_stream = max(1, total_bytes // streams)
    block = os.urandom(CHUNK)

    def work(conn, base, progress):
        end = time.perf_counter() + max_seconds
        conn.putrequest("POST", base + "/__up")
        conn.putheader("User-Agent", USER_AGENT)
        conn.putheader("Content-Type", "application/octet-stream")
        conn.putheader("Content-Length", str(per_stream))
        conn.endheaders()
        sock = conn.sock
        progress.watch(lambda: unsent_bytes(sock))
        sent = 0
        while sent < per_stream and time.perf_counter() < end:
            part = block[: per_stream - sent]
            conn.send(part)
            sent += len(part)
            progress.add(len(part))
        if sent < per_stream:  # tiden tog slut: det som inte hunnit fram räknas inte
            progress.unwatch(lost=unsent_bytes(sock))
            return
        resp = conn.getresponse()  # servern svarar först när allt har kommit fram
        resp.read()
        progress.unwatch()
        if resp.status != 200:
            raise SpeedTestError(f"Servern svarade {resp.status} {resp.reason} på uppladdningen")

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


def run(cfg, progress=None) -> dict:
    """Gör en hel mätning. `progress(fas)` anropas med "ping", "ned" och "upp" när
    respektive del börjar. Kastar SpeedTestError med ett begripligt meddelande vid fel."""
    server = cfg["server"]
    streams = max(1, int(cfg["streams"]))
    step = progress or (lambda _phase: None)
    try:
        step("ping")
        ping, jitter = measure_latency(server)
        step("ned")
        down = measure_download(server, cfg["download_bytes"], streams, cfg["max_seconds"])
        step("upp")
        up = measure_upload(server, cfg["upload_bytes"], streams, cfg["max_seconds"])
    except Exception as e:  # noqa: BLE001
        raise SpeedTestError(friendly_error(e)) from e
    return {
        "ping_ms": round(ping, 1),
        "jitter_ms": round(jitter, 1),
        "download_mbps": round(down, 2),
        "upload_mbps": round(up, 2),
    }
