"""Minimal HTTP helper: stdlib only, with retries and gzip support."""

from __future__ import annotations

import gzip
import io
import json
import time
import urllib.error
import urllib.request

# Identify the client honestly without hard-coding one particular fork's URL:
# anyone running this is a self-hosted copy, and upstream is credited generically.
USER_AGENT = "orbis/1.0 (open-source economic calendar; +https://github.com/topics/orbis)"
TIMEOUT = 30
RETRIES = 3


def get(url: str, headers: dict | None = None, retries: int = RETRIES) -> bytes:
    """GET a URL, retrying with exponential backoff on transient failures."""
    merged = {"User-Agent": USER_AGENT, "Accept-Encoding": "gzip"}
    merged.update(headers or {})

    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            request = urllib.request.Request(url, headers=merged)
            with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
                raw = response.read()
                if response.headers.get("Content-Encoding") == "gzip":
                    raw = gzip.GzipFile(fileobj=io.BytesIO(raw)).read()
                return raw
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as error:
            last_error = error
            if attempt < retries - 1:
                time.sleep(2 ** attempt)

    raise RuntimeError(f"GET {url} failed after {retries} attempts: {last_error}")


def get_json(url: str, headers: dict | None = None) -> object:
    return json.loads(get(url, headers).decode("utf-8"))
