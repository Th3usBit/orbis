"""Static dev server for orbis.

    python scripts/serve.py [--port 8080] [--no-browser]

The site is plain static files, so anything that serves a directory works.
This exists so `start.bat` has one dependency-free command to call, and so the
browser never caches a stale calendar.json during development.
"""

from __future__ import annotations

import argparse
import http.server
import os
import socket
import socketserver
import sys
import webbrowser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_PORT = 8080


class Handler(http.server.SimpleHTTPRequestHandler):
    # HTTP/1.0 -- the default -- closes the socket after every single file, and
    # the page asks for dozens. On Windows each closed socket then sits in
    # TIME_WAIT for minutes holding an ephemeral port, so a long test run drains
    # the pool and the next connect() is refused outright. A refused <script> is
    # the worst kind of failure here: nothing errors, the module simply never
    # runs, #shell stays hidden, and the suite waits its full timeout for
    # something that already failed. Keep-alive reuses one connection for the
    # whole page instead. SimpleHTTPRequestHandler already sends an accurate
    # Content-Length on every response, which is what 1.1 requires to know where
    # each body ends.
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # Development server: always serve fresh data.
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def send_head(self):
        # The site is only the files the page asks for. Everything beginning
        # with a dot -- .git above all, with its full history and its remote --
        # is repository plumbing that no viewer needs and that a misconfigured
        # run must not hand out. SimpleHTTPRequestHandler serves it happily.
        if any(part.startswith(".") for part in self.path.split("?")[0].split("/")):
            self.send_error(404, "File not found")
            return None
        return super().send_head()

    def list_directory(self, path):
        # A directory with no index is a 404, not an index of the folder.
        # SimpleHTTPRequestHandler's default is to generate a listing, which
        # enumerates whatever the working copy happens to hold -- notes, an
        # export, a scratch file someone dropped next to index.html -- and
        # serves every one of them in full. The site itself never asks for a
        # directory, so nothing legitimate is lost.
        self.send_error(404, "File not found")
        return None

    def log_message(self, fmt, *args):
        status = args[1] if len(args) > 1 else ""
        if status.startswith(("4", "5")):
            sys.stderr.write(f"  {args[0]} -> {status}\n")


def free_port(preferred: int) -> int:
    """Return the preferred port, or the next free one above it."""
    for candidate in range(preferred, preferred + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            if probe.connect_ex(("127.0.0.1", candidate)) != 0:
                return candidate
    return preferred


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve orbis locally.")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()

    if not os.path.exists(os.path.join(ROOT, "data", "calendar.json")):
        print("data/calendar.json is missing - run: python scripts/fetch.py", file=sys.stderr)
        return 1

    port = free_port(args.port)
    url = f"http://127.0.0.1:{port}/"

    # A kept-alive connection stays open between requests, so a single-threaded
    # server would let one idle tab block every other request. A thread per
    # connection is the standard answer and costs nothing at this scale.
    # daemon_threads lets Ctrl+C exit without waiting on open connections.
    class Server(socketserver.ThreadingTCPServer):
        allow_reuse_address = True
        daemon_threads = True

    with Server(("127.0.0.1", port), Handler) as server:
        print(f"\n  orbis is live at  {url}")
        print("  press Ctrl+C to stop\n")
        if not args.no_browser:
            webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\n  stopped")

    return 0


if __name__ == "__main__":
    sys.exit(main())
