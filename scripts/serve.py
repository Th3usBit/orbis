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
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # Development server: always serve fresh data.
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

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

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", port), Handler) as server:
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
