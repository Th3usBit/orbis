"""ForexFactory calendar via the FairEconomy weekly JSON feeds (cross-check).

Three key-free feeds covering last, current and next week. Coverage is narrower
than TradingView (majors only, keyed by currency rather than country) but it is
maintained independently, which makes it useful for two things:

  1. filling gaps when the primary source misses a release;
  2. corroborating an event, so the UI can show which releases two independent
     sources agree on.
"""

from __future__ import annotations

import hashlib

from datetime import datetime, timezone

from .classify import categorize, to_number
from .net import get_json

ID = "forexfactory"
NAME = "ForexFactory (FairEconomy feed)"
HOMEPAGE = "https://www.forexfactory.com/calendar"

FEEDS = (
    "https://nfs.faireconomy.media/ff_calendar_lastweek.json",
    "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
    "https://nfs.faireconomy.media/ff_calendar_nextweek.json",
)

IMPACT_BY_NAME = {"holiday": 0, "low": 1, "medium": 2, "high": 3}


def fetch(window, currency_to_country: dict[str, str]) -> list[dict]:
    """Return normalized events from all three weekly feeds."""
    events: list[dict] = []
    seen: set[str] = set()

    for url in FEEDS:
        try:
            rows = get_json(url)
        except RuntimeError:
            # A single weekly feed being down must not fail the whole run.
            continue

        if not isinstance(rows, list):
            continue

        for row in rows:
            event = _normalize(row, currency_to_country)
            if not event:
                continue
            if not window.contains(event["ts"]):
                continue
            if event["id"] in seen:
                continue
            seen.add(event["id"])
            events.append(event)

    return events


def _normalize(row: dict, currency_to_country: dict[str, str]) -> dict | None:
    title = (row.get("title") or "").strip()
    currency = (row.get("country") or "").upper()  # the feed calls it "country"
    raw_date = row.get("date")

    if not title or not currency or not raw_date:
        return None

    country = currency_to_country.get(currency)
    if not country:
        return None

    try:
        # Feed emits an offset-aware timestamp, e.g. 2026-09-07T02:00:00-04:00
        moment = datetime.fromisoformat(raw_date)
    except ValueError:
        return None

    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    iso = moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    impact = IMPACT_BY_NAME.get((row.get("impact") or "").strip().lower(), 1)

    return {
        "id": f"ff:{country}:{iso}:{_short(title)}",
        "ts": iso,
        "country": country,
        "currency": currency,
        "title": title,
        "indicator": None,
        "category": categorize(title),
        "impact": impact,
        "actual": None,
        "forecast": to_number(row.get("forecast")),
        "previous": to_number(row.get("previous")),
        "unit": None,
        "period": None,
        "issuer": None,
        "source": ID,
        "source_url": HOMEPAGE,
    }



def _short(title: str) -> str:
    """A stable, collision-free id fragment for a title.

    This id is the only thing deduplicating the overlapping lastweek/thisweek/
    nextweek feeds, so two different releases must never produce the same one.
    Truncating the slug did exactly that: 'Prelim UoM Inflation Expectations'
    and '... Expectations Revised' both cut to the same 24 characters, and the
    second was dropped as a duplicate of the first.
    """
    slug = "".join(ch for ch in title.lower() if ch.isalnum())
    digest = hashlib.sha1(title.strip().lower().encode("utf-8")).hexdigest()[:8]
    return f"{slug[:24]}{digest}"
