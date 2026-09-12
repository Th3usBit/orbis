"""Public holidays via Nager.Date (market-closure context).

Key-free, open-source, and covers every country orbis plots. A single request
returns the next 365 days worldwide, which we filter down to the active window.

Holidays are stored alongside economic releases with impact 0, so they read as
context on the globe rather than as tradeable events.
"""

from __future__ import annotations

from .net import get_json

ID = "nager"
NAME = "Nager.Date public holidays"
HOMEPAGE = "https://date.nager.at"
ENDPOINT = "https://date.nager.at/api/v3/NextPublicHolidaysWorldwide"


def fetch(window, country_codes: set[str]) -> list[dict]:
    """Return holidays for tracked countries that fall inside the window."""
    try:
        rows = get_json(ENDPOINT)
    except RuntimeError:
        return []

    if not isinstance(rows, list):
        return []

    events: list[dict] = []
    for row in rows:
        code = (row.get("countryCode") or "").upper()
        date = row.get("date")
        if code not in country_codes or not date:
            continue

        # Holidays are all-day: what matters is the calendar date, not an
        # instant. Midday UTC keeps the row sortable among timed events without
        # landing on a neighbouring date in most zones; the UI reads the
        # nominal date from the timestamp rather than converting it, which is
        # what keeps Christmas on the 25th either side of the date line.
        timestamp = f"{date}T12:00:00Z"
        if not window.contains(timestamp):
            continue

        name = (row.get("name") or "").strip()
        local_name = (row.get("localName") or "").strip()

        events.append({
            "id": f"hol:{code}:{date}",
            "ts": timestamp,
            "country": code,
            "currency": None,
            "title": name or local_name,
            "indicator": local_name if local_name and local_name != name else None,
            "category": "holiday",
            "impact": 0,
            "actual": None,
            "forecast": None,
            "previous": None,
            "unit": None,
            "period": None,
            "issuer": None,
            "source": ID,
            "source_url": HOMEPAGE,
            "all_day": True,
            "nationwide": bool(row.get("global")),
        })

    return events
