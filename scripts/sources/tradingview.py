"""TradingView economic calendar (primary source).

Public, key-free JSON endpoint that backs TradingView's own calendar widget.
It is the richest free feed available: global coverage, an importance rating,
actual/forecast/previous as numbers, units, and a link back to the releasing
institution.

The endpoint rejects requests from unknown origins, so it cannot be called from
the browser. orbis fetches it server-side (locally or in CI) and publishes the
normalized result as a static file, which is what makes the site host-free.
"""

from __future__ import annotations

from datetime import timedelta

from .classify import categorize, to_number
from .net import get_json

ID = "tradingview"
NAME = "TradingView Economic Calendar"
HOMEPAGE = "https://www.tradingview.com/economic-calendar/"
ENDPOINT = "https://economic-calendar.tradingview.com/events"

# The endpoint gets unhappy with very wide ranges, so walk it in slices.
CHUNK_DAYS = 7

# TradingView grades importance as -1 / 0 / 1. orbis uses 1..3 so that 0 can
# mean "no market impact" (holidays).
IMPORTANCE_TO_IMPACT = {-1: 1, 0: 2, 1: 3}


def _stamp(moment) -> str:
    return moment.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def fetch(window, country_codes: list[str]) -> list[dict]:
    """Return normalized events for the given window."""
    countries = ",".join(country_codes)
    events: list[dict] = []
    seen: set[str] = set()

    cursor = window.start
    while cursor < window.end:
        chunk_end = min(cursor + timedelta(days=CHUNK_DAYS), window.end)
        url = (
            f"{ENDPOINT}?from={_stamp(cursor)}&to={_stamp(chunk_end)}"
            f"&countries={countries}"
        )

        payload = get_json(url, headers={
            # Required: the endpoint 403s requests without a known origin.
            "Origin": "https://www.tradingview.com",
            "Referer": "https://www.tradingview.com/",
        })

        rows = payload.get("result", []) if isinstance(payload, dict) else []
        for row in rows:
            event = _normalize(row)
            if event and event["id"] not in seen:
                seen.add(event["id"])
                events.append(event)

        cursor = chunk_end

    return events


def _normalize(row: dict) -> dict | None:
    timestamp = row.get("date")
    country = (row.get("country") or "").upper()
    title = (row.get("title") or "").strip()

    if not timestamp or not country or not title:
        return None

    indicator = (row.get("indicator") or "").strip()
    importance = row.get("importance")
    impact = IMPORTANCE_TO_IMPACT.get(importance, 1) if importance is not None else 1

    return {
        "id": f"tv:{row.get('id')}",
        "ts": timestamp.replace(".000Z", "Z"),
        "country": country,
        "currency": (row.get("currency") or "").upper() or None,
        "title": title,
        "indicator": indicator or None,
        "category": categorize(title, indicator),
        "impact": impact,
        "actual": to_number(row.get("actualRaw", row.get("actual"))),
        "forecast": to_number(row.get("forecastRaw", row.get("forecast"))),
        "previous": to_number(row.get("previousRaw", row.get("previous"))),
        "unit": (row.get("unit") or "").strip() or None,
        "period": (row.get("period") or "").strip() or None,
        "issuer": (row.get("source") or "").strip() or None,
        "source": ID,
        "source_url": (row.get("source_url") or "").strip() or None,
    }
