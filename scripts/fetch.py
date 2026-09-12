"""Collect, merge and publish the orbis economic calendar.

    python scripts/fetch.py [--days-back 7] [--days-ahead 21]

Pulls every configured source, reconciles them into one deduplicated timeline
and writes data/calendar.json. That file is the only thing the web app reads,
which is what lets orbis run as a static site with no backend and no API key.

Sources are independent: if one is down the run still succeeds, and the failure
is recorded in the output so the UI can be honest about coverage.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sources import forexfactory, holidays, tradingview  # noqa: E402
from sources.classify import slug  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

# Two events from different providers are the same release if they share a
# country, land within this many minutes of each other, and their titles are
# similar enough.
MATCH_MINUTES = 45
MATCH_RATIO = 0.62


class Window:
    """The inclusive UTC time range a run collects."""

    def __init__(self, days_back: int, days_ahead: int):
        midnight = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        self.start = midnight - timedelta(days=days_back)
        self.end = midnight + timedelta(days=days_ahead)

    def contains(self, iso: str) -> bool:
        moment = parse(iso)
        return moment is not None and self.start <= moment <= self.end

    def as_dict(self) -> dict:
        return {
            "from": self.start.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "to": self.end.strftime("%Y-%m-%dT%H:%M:%SZ"),
        }


def parse(iso: str) -> datetime | None:
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


def load_countries() -> tuple[dict, dict]:
    with open(os.path.join(DATA, "countries.json"), encoding="utf-8") as handle:
        reference = json.load(handle)
    return reference["countries"], reference["currencies"]


def merge(primary: list[dict], secondary: list[dict]) -> tuple[list[dict], int]:
    """Fold the secondary feed into the primary one.

    Matching events are not duplicated: the primary row is kept and tagged as
    corroborated. Unmatched secondary rows are appended as genuine additions.
    """
    by_country_day: dict[tuple[str, str], list[dict]] = {}
    for event in primary:
        key = (event["country"], event["ts"][:10])
        by_country_day.setdefault(key, []).append(event)

    merged = list(primary)
    confirmed = 0

    for candidate in secondary:
        moment = parse(candidate["ts"])
        neighbours = by_country_day.get((candidate["country"], candidate["ts"][:10]), [])
        match = None

        for existing in neighbours:
            other = parse(existing["ts"])
            if not moment or not other:
                continue
            if abs((moment - other).total_seconds()) > MATCH_MINUTES * 60:
                continue
            ratio = SequenceMatcher(
                None, slug(candidate["title"]), slug(existing["title"])
            ).ratio()
            if ratio >= MATCH_RATIO:
                match = existing
                break

        if match:
            sources = set(match.get("confirmed_by") or [])
            sources.add(candidate["source"])
            match["confirmed_by"] = sorted(sources)
            # The corroborating feed sometimes carries a forecast the primary lacks.
            for field in ("forecast", "previous"):
                if match.get(field) is None and candidate.get(field) is not None:
                    match[field] = candidate[field]
            confirmed += 1
        else:
            merged.append(candidate)

    return merged, confirmed


def collect(window: Window, countries: dict, currencies: dict) -> tuple[list[dict], list[dict]]:
    codes = sorted(countries.keys())
    report: list[dict] = []

    def run(module, label, call):
        try:
            rows = call()
            report.append({
                "id": module.ID, "name": module.NAME, "url": module.HOMEPAGE,
                "role": label, "events": len(rows), "ok": True,
            })
            print(f"  {module.ID:<14} {len(rows):>5} events")
            return rows
        except Exception as error:  # noqa: BLE001 - one bad source must not fail the run
            report.append({
                "id": module.ID, "name": module.NAME, "url": module.HOMEPAGE,
                "role": label, "events": 0, "ok": False, "error": str(error)[:200],
            })
            print(f"  {module.ID:<14} FAILED: {error}", file=sys.stderr)
            return []

    print("Collecting sources...")
    primary = run(tradingview, "primary", lambda: tradingview.fetch(window, codes))
    secondary = run(forexfactory, "cross-check", lambda: forexfactory.fetch(window, currencies))
    closures = run(holidays, "context", lambda: holidays.fetch(window, set(codes)))

    events, confirmed = merge(primary, secondary)
    print(f"  reconciled     {confirmed:>5} events corroborated by both feeds")

    events.extend(closures)
    events = [event for event in events if window.contains(event["ts"])]
    events.sort(key=lambda event: (event["ts"], -event["impact"], event["country"]))

    return events, report


def summarize(events: list[dict]) -> dict:
    by_impact: dict[str, int] = {}
    by_category: dict[str, int] = {}
    countries: set[str] = set()

    for event in events:
        key = str(event["impact"])
        by_impact[key] = by_impact.get(key, 0) + 1
        by_category[event["category"]] = by_category.get(event["category"], 0) + 1
        countries.add(event["country"])

    return {
        "total": len(events),
        "countries": len(countries),
        "by_impact": by_impact,
        "by_category": dict(sorted(by_category.items(), key=lambda kv: -kv[1])),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the orbis economic calendar dataset.")
    parser.add_argument("--days-back", type=int, default=7)
    parser.add_argument("--days-ahead", type=int, default=21)
    parser.add_argument("--out", default=os.path.join(DATA, "calendar.json"))
    args = parser.parse_args()

    window = Window(args.days_back, args.days_ahead)
    countries, currencies = load_countries()

    print(f"orbis window: {window.as_dict()['from']} -> {window.as_dict()['to']}")
    events, report = collect(window, countries, currencies)

    if not events:
        print("No events collected - refusing to overwrite existing data.", file=sys.stderr)
        return 1

    payload = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "window": window.as_dict(),
        "sources": report,
        "stats": summarize(events),
        # Empty fields are dropped rather than serialized as null: at ~1800
        # events that is a third of the payload the browser would download.
        "events": [{k: v for k, v in event.items() if v is not None} for event in events],
    }

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))

    size = os.path.getsize(args.out) / 1024
    stats = payload["stats"]
    print(
        f"\nWrote {os.path.relpath(args.out, ROOT)} - "
        f"{stats['total']} events across {stats['countries']} countries ({size:.0f} KB)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
