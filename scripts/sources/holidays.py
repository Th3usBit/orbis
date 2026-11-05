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
    """Return holidays for tracked countries that fall inside the window.

    Network failures are left to propagate. fetch.py's collect() already wraps
    every source in the one try/except that matters, and records the error so
    the Sources panel can show a red dot with the reason. Catching here instead
    returned an empty list that is indistinguishable from a quiet week: the run
    reported ok, the panel drew a green dot, and an outage read as "0 events".
    """
    rows = get_json(ENDPOINT)

    if not isinstance(rows, list):
        return []

    # Keyed by id, because one country can have two holidays on one date.
    # Canada on 2026-11-11 is Remembrance Day in nine provinces and Armistice
    # Day in Newfoundland, each a regional row of its own; both became
    # hol:CA:2026-11-11, and the duplicate id failed the integrity checks in
    # store.test and merge.test. It is one closed day either way, so the rows
    # merge into one event that names both.
    events: dict[str, dict] = {}
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

        key = f"hol:{code}:{date}"
        title = name or local_name
        if key in events:
            known = events[key]
            if title and title not in known["title"].split(" / "):
                known["title"] = f"{known['title']} / {title}"
            known["indicator"] = None
            known["nationwide"] = known["nationwide"] or bool(row.get("global"))
            continue

        events[key] = {
            "id": key,
            "ts": timestamp,
            "country": code,
            "currency": None,
            "title": title,
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
        }

    return list(events.values())
